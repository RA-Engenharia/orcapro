/* =====================================================================
 * hidisometrico.js — ISOMÉTRICO (30°) do hidrossanitário (motor PURO, ES5,
 * Node-testável, sem DOM). Fase 1: água fria + esgoto (+ ventilação do
 * esgoto).
 *
 *   HidIsometrico.gerar(resultado, modelo, opcoes) → { ok, desenhos, avisos }
 *
 *   resultado = HidDimensionar.calcular(...)  (docs/hidro/CONTRATO.md)
 *   modelo    = { estado, avaliarFam }        (o mesmo de entrada.modelo)
 *   opcoes    = { sistemas: ["agua_fria","esgoto"],
 *                 pavimentos: [{ nome, cota }]  (cota do piso, m — altura do
 *                                                ponto = cota do ponto − piso),
 *                 ambientes: [{ id, nome, x0, x1, z0, z1 }]  (opcional: um
 *                     desenho por ambiente molhado; sem isto, um desenho por
 *                     trecho CONECTADO da rede),
 *                 area: { w, h }  (mm de papel; escolhe o fator do desenho),
 *                 mmPorM  (fator fixo; ignora area),
 *                 cotas: true, colunaMinima_m,
 *                 nomeAparelho(famInst) → sigla, nomePeca(id) → rótulo (opcionais: o nome do ponto na folha) }
 *
 * O desenho NÃO tem escala (isométrico: o comprimento real vai na cota, em
 * cm). Sai em PRIMITIVAS VETORIAIS em mm de papel, y para baixo:
 *   linhas   [{ x1, y1, x2, y2, camada, tipo, trecho }]
 *   textos   [{ s, x, y, h, al, camada, tipo, trecho, box }]  y = linha de base
 *   simbolos [{ tipo, x, y, r, ang, camada, id, box }]
 *   caixas   [{ s, p }]  (os mesmos cantos que js/acopranchas.js sobreposicoes lê)
 * O js/hidpranchas.js transforma isto em SVG da folha (e daí PDF/DWG pelos
 * mesmos caminhos do js/prancha.js).
 *
 * Em cada trecho: rótulo de DN (+ vazão na água fria, + declividade no
 * esgoto), cota do comprimento em cm; nos pontos de utilização a altura
 * em relação ao piso; registros com sigla e DN; coluna de AF (AF-1…) e tubo
 * de queda (TQ-1…) em balão; sentido de escoamento do esgoto em seta.
 * Os rótulos passam por um algoritmo de AFASTAMENTO (candidatos em anéis ao
 * redor do trecho, com chamada quando se afastam) e por uma VERIFICAÇÃO
 * (HidIsometrico.verificar) que reprova sobreposição de caixas de texto.
 *
 * ⚠ Nada de valor de norma aqui: só geometria de desenho (bloco K abaixo).
 *   Todo DN/vazão/declividade vem do RESULTADO; faltou → o texto diz
 *   "DN a confirmar", nunca um número inventado.
 * Teste: node tools/test-hid-isometrico.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* hid:fisica-inicio — GEOMETRIA DE DESENHO (projeção isométrica, alturas de letra e folgas em mm de papel).
     Não é valor de norma: é o padrão visual de docs/hidro/PADRAO-PRANCHA-HIDRO.md. */
  var K = {
    eps: 1e-9,
    cos: Math.sqrt(3) / 2, sen: 1 / 2,                    /* eixos a 30° da horizontal */
    fatores: [100, 80, 60, 50, 40, 30, 25, 20, 15, 12, 10],   /* mm de papel por metro do modelo (sem escala; maior primeiro) */
    fatorPadrao: 30,
    ancoras: [0.5, 0.35, 0.65, 0.2, 0.8],                 /* posições (fração do trecho) onde o rótulo tenta ficar, em ordem de preferência */
    ancorasCurtas: [0.5, 0.3, 0.7], meio: 0.5, arrPos: 0.4,
    h: 2.5, hPeq: 2.1,                                    /* altura de letra: rótulos e anotações menores (padrão RA: cota/nota 2,5) */
    larg: 0.72,                                           /* largura de letra por altura, reserva se o medidor da casa não carregar */
    caixaAlt: 0.94,                                       /* altura da caixa do texto, em alturas de letra */
    base: 0.76,                                           /* linha de base dentro da caixa */
    folga: 0.5, tolSobre: 0.15,                           /* distância mínima entre caixas / tolerância da verificação */
    d0: 0.9, dPasso: 1.6, aneis: 30,                      /* anéis de afastamento: primeira distância, passo, quantidade */
    pAnel: 6, pCruz: 14, pDist: 0.1, pCruzSujo: 40, d0Cota: 0.8,   /* número da cota a 0,8 mm da linha (padrão RA: encosta, não cruza) */                      /* custos do candidato: por anel, por linha cortada, por mm */
    chamadaMin: 4,                                        /* a partir desta distância o rótulo ganha chamada */
    margem: 8,
    cotaOff: 4.2, cotaExt: 1.2, cotaTique: 1.1, cotaMin: 0.15,   /* linha de cota: afastamento, prolongamento, traço oblíquo, trecho mínimo (m) */
    arrComp: 2.6, arrLarg: 0.9,                           /* seta de sentido */
    rJoelho: 0.7, rTe: 1.0, rPonto: 1.1, rBalaoMin: 3.2,
    regC: 2.4, regL: 1.5,                                 /* registro: comprimento e meia-largura da "gravata" */
    caixaL: 3.2,                                          /* ralo/caixa: lado do quadrado */
    colunaMin_m: 1.0,                                     /* vertical de AF acima disto é coluna */
    quebraMin_m: 1.2, quebraDesenho_m: 0.6, quebraTam: 1.6, /* ventilação vertical com ponta livre acima disto sai INTERROMPIDA (cota com o comprimento real) */
    tolNo_m: 0.05,                                        /* ponta de ventilação que toca o esgoto */
    tolPiso_m: 0.05,
    penas: { AF: 0.35, AQ: 0.35, ES: 0.5, VE: 0.25, AP: 0.35, IN: 0.35, IND: 0.35, cota: 0.13, simbolo: 0.25, chamada: 0.13 }
  };
  /* hid:fisica-fim */

  var SIGLA_SISTEMA = { agua_fria: "AF", agua_quente: "AQ", esgoto: "ES", ventilacao: "VE", pluvial: "AP", incendio: "IN", industrial: "IND", gas: "GAS" };
  var NOME_SISTEMA = { agua_fria: "ÁGUA FRIA", agua_quente: "ÁGUA QUENTE", esgoto: "ESGOTO", ventilacao: "VENTILAÇÃO", pluvial: "ÁGUAS PLUVIAIS", incendio: "INCÊNDIO", industrial: "FLUIDO INDUSTRIAL", gas: "GÁS (GLP)" };
  var SIGLA_ACESSORIO = { registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" };

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function br(v, c) {
    if (v == null || !isFinite(v)) return "-";
    var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c);   // hid:ok formatação decimal
    return s.replace(".", ",");
  }
  function sinal(v, c) { var s = br(Math.abs(v), c); return (v > 0 ? "+" : (v < 0 ? "-" : "")) + s; }

  /* largura do texto: o medidor da casa (RomanS/Arial, o MAIOR dos dois) quando carrega */
  var _lt = null;
  function largTexto(s, h) {
    if (_lt === null) { var A = dep("AcoPranchas", "./acopranchas.js"); _lt = (A && A.largTexto) ? A.largTexto : false; }
    s = String(s == null ? "" : s);
    return _lt ? _lt(s, h) : s.length * h * K.larg;
  }

  /* ------------------------------------------------------------ projeção */
  function proj(p, k) { return [(p.x - p.z) * K.cos * k, ((p.x + p.z) * K.sen - p.y) * k]; }
  function dist3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }

  /* hid:fisica-inicio — diagramação (geometria de desenho em mm, índices de caixa/ponto): nenhum valor de norma; DN, vazão e declividade vêm sempre do RESULTADO */
  /* ------------------------------------------------------------ geometria 2D */
  function boxTexto(cx, top, w, h) { return [cx - w / 2, top, cx + w / 2, top + h * K.caixaAlt]; }
  function cruza(a, b, g) { g = g || 0; return a[0] < b[2] + g && a[2] > b[0] - g && a[1] < b[3] + g && a[3] > b[1] - g; }
  /* segmento × caixa (Liang-Barsky) */
  function segNaCaixa(s, b) {
    if (Math.max(s[0], s[2]) < b[0] || Math.min(s[0], s[2]) > b[2] || Math.max(s[1], s[3]) < b[1] || Math.min(s[1], s[3]) > b[3]) return false;
    var dx = s[2] - s[0], dy = s[3] - s[1], t0 = 0, t1 = 1, p = [-dx, dx, -dy, dy], q = [s[0] - b[0], b[2] - s[0], s[1] - b[1], b[3] - s[1]];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return false; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }

  /* ------------------------------------------------------------ união (componentes) */
  function Uniao(n) { this.p = []; for (var i = 0; i < n; i++) this.p.push(i); }
  Uniao.prototype.f = function (a) { while (this.p[a] !== a) { this.p[a] = this.p[this.p[a]]; a = this.p[a]; } return a; };
  Uniao.prototype.u = function (a, b) { a = this.f(a); b = this.f(b); if (a !== b) this.p[b] = a; };

  /* hid:fisica-fim */
  /* ------------------------------------------------------------ resultado → mapas por trecho */
  function indicesResultado(res) {
    var ix = { agua_fria: {}, agua_quente: {}, pluvial: {}, incendio: {}, industrial: {}, gas: {}, esgoto: {}, ventilacao: {}, tq: {}, tqNome: {} };
    var S = (res && res.sistemas) || {};
    arr(S.agua_fria && S.agua_fria.trechos).forEach(function (t) {
      var o = ix.agua_fria[t.id];
      if (!o) ix.agua_fria[t.id] = { dn: t.dn, dnModelo: t.dnModelo, vazao_ls: t.vazao_ls, status: t.status };
      else { if (t.dn > o.dn) o.dn = t.dn; if (t.vazao_ls > o.vazao_ls) o.vazao_ls = t.vazao_ls; }
    });
    arr(S.esgoto && S.esgoto.trechos).forEach(function (t) {
      var o = ix.esgoto[t.id];
      if (!o) ix.esgoto[t.id] = { dn: t.dn, dnModelo: t.dnModelo, classe: t.classe, declividade_pct: t.declividade_pct, declividadeMin_pct: t.declividadeMin_pct, status: t.status };
      else { if (t.dn > o.dn) o.dn = t.dn; if (o.declividade_pct == null && t.declividade_pct != null) o.declividade_pct = t.declividade_pct; }
    });
    /* fase 2 e F3: água quente (como a fria), pluvial (como o esgoto: declividade) e incêndio (trechos da rede de hidrantes) */
    arr(S.agua_quente && S.agua_quente.trechos).forEach(function (t) {
      var o = ix.agua_quente[t.id];
      if (!o) ix.agua_quente[t.id] = { dn: t.dn, dnModelo: t.dnModelo, vazao_ls: t.vazao_ls, status: t.status };
      else if (t.dn > o.dn) o.dn = t.dn;
    });
    arr(S.pluvial && S.pluvial.trechos).forEach(function (t) {
      var o = ix.pluvial[t.id];
      if (!o) ix.pluvial[t.id] = { dn: t.dn, dnModelo: t.dnModelo, classe: t.classe, declividade_pct: t.declividade_pct, declividadeMin_pct: t.declividadeMin_pct, status: t.status };
      else if (t.dn > o.dn) o.dn = t.dn;
    });
    arr(S.industrial && S.industrial.trechos).forEach(function (t) { ix.industrial[t.id] = { dn: t.dn, dnModelo: t.dnModelo, serie: t.serie, status: t.status }; });
    arr(S.gas && S.gas.trechos).forEach(function (t) { ix.gas[t.id] = { dn: t.dn, dnModelo: t.dnModelo, serie: t.serie, status: t.status }; });   /* F3 gás */
    arr(S.incendio && S.incendio.hidrantes && S.incendio.hidrantes.trechos).forEach(function (t) { ix.incendio[t.id] = { dn: t.dn, dnModelo: t.dnModelo, vazao_lpm: t.vazao_lpm, status: t.status }; });
    arr(S.esgoto && S.esgoto.ventilacao).forEach(function (v) { ix.ventilacao[v.id] = { dn: v.dn, dnModelo: v.dnModelo, tipo: v.tipo, status: v.status }; });
    arr(S.esgoto && S.esgoto.tubosQueda).forEach(function (q, i) {
      var nome = "TQ-" + (i + 1);
      arr(q.trechos).forEach(function (id) { ix.tq[id] = nome; });
    });
    return ix;
  }

  /* ------------------------------------------------------------ pavimento / altura do ponto */
  function alturaPiso(y, pavs) {
    var melhor = null;
    arr(pavs).forEach(function (p) { if (p.cota <= y + K.tolPiso_m && (melhor == null || p.cota > melhor.cota)) melhor = p; });
    if (!melhor) arr(pavs).forEach(function (p) { if (melhor == null || p.cota < melhor.cota) melhor = p; });
    return melhor ? y - melhor.cota : y;
  }

  /* ------------------------------------------------------------ colunas de AF (vertical encadeado) */
  function colunasAF(trechosAF, minimo) {
    /* cadeias de trechos verticais que se tocam; só vale cadeia com comprimento total ≥ mínimo */
    var vert = trechosAF.filter(function (t) { return t.vertical; });
    var U = new Uniao(vert.length);
    for (var i = 0; i < vert.length; i++) for (var j = i + 1; j < vert.length; j++) {
      var a = vert[i], b = vert[j];
      if (Math.abs(a.p1.x - b.p1.x) < K.tolNo_m && Math.abs(a.p1.z - b.p1.z) < K.tolNo_m) U.u(i, j);
    }
    var cad = {}, ordem = [];
    vert.forEach(function (t, i) { var r = U.f(i); if (!cad[r]) { cad[r] = { ids: [], x: t.p1.x, z: t.p1.z, ymin: Infinity, ymax: -Infinity, L: 0 }; ordem.push(r); } var c = cad[r]; c.ids.push(t.id); c.L += Math.abs(t.p2.y - t.p1.y); c.ymin = Math.min(c.ymin, t.p1.y, t.p2.y); c.ymax = Math.max(c.ymax, t.p1.y, t.p2.y); });
    var lista = ordem.map(function (r) { return cad[r]; }).filter(function (c) { return c.L >= minimo - K.eps; });
    lista.sort(function (a, b) { return a.x - b.x || a.z - b.z; });
    var out = {};
    lista.forEach(function (c, i) { c.nome = "AF-" + (i + 1); c.ids.forEach(function (id) { out[id] = c; }); });
    return out;
  }

  /* ------------------------------------------------------------ gerar */
  function gerar(resultado, modelo, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], BI = dep("BimInst", "./biminst.js");
    if (!BI || !modelo || !modelo.estado) return { ok: false, desenhos: [], avisos: ["Isométrico: faltou o modelo (estado + avaliarFam) ou o motor de instalações (js/biminst.js)."] };
    var rede = BI.rede(modelo.estado, modelo.avaliarFam);
    var ix = indicesResultado(resultado);
    var sistemas = arr(opcoes.sistemas).length ? opcoes.sistemas : ["agua_fria", "esgoto"];
    var pavs = arr(opcoes.pavimentos).filter(function (p) { return p && isFinite(+p.cota); }).map(function (p) { return { nome: String(p.nome || ""), cota: +p.cota }; });
    if (!pavs.length) { pavs = [{ nome: "piso", cota: 0 }]; avisos.push("Pavimentos não informados: a altura dos pontos é medida a partir da cota 0 do modelo."); }
    var trechosTodos = arr(rede.trechos);
    var colunas = colunasAF(trechosTodos.filter(function (t) { return t.sistema === "agua_fria"; }), num(opcoes.colunaMinima_m, K.colunaMin_m));
    var desenhos = [];
    sistemas.forEach(function (sis) {
      var trs = trechosTodos.filter(function (t) { return t.sistema === sis || (sis === "esgoto" && t.sistema === "ventilacao"); });
      if (!trs.length) { avisos.push("Isométrico: não há trechos de " + (NOME_SISTEMA[sis] || sis).toLowerCase() + " no modelo."); return; }
      agrupar(trs, rede, opcoes).forEach(function (g, gi) {
        var d = desenhar(sis, g, gi, rede, ix, colunas, pavs, opcoes, avisos);
        if (d) desenhos.push(d);
      });
    });
    return { ok: desenhos.length > 0, desenhos: desenhos, avisos: avisos };
  }

  /* trechos do sistema → grupos (ambiente informado, ou componente conectado) */
  function agrupar(trs, rede, opcoes) {
    var amb = arr(opcoes.ambientes);
    if (amb.length) {
      var porAmb = {}, ordem = [], sem = [];
      trs.forEach(function (t) {
        var mx = (t.p1.x + t.p2.x) / 2, mz = (t.p1.z + t.p2.z) / 2, a = null;
        amb.forEach(function (q) { if (!a && mx >= q.x0 - K.eps && mx <= q.x1 + K.eps && mz >= q.z0 - K.eps && mz <= q.z1 + K.eps) a = q; });
        if (!a) { sem.push(t); return; }
        if (!porAmb[a.id]) { porAmb[a.id] = { nome: a.nome || a.id, trechos: [] }; ordem.push(a.id); }
        porAmb[a.id].trechos.push(t);
      });
      var out = ordem.map(function (id) { return porAmb[id]; });
      if (sem.length) out.push({ nome: "Fora dos ambientes", trechos: sem });
      return out;
    }
    var idx = {}; trs.forEach(function (t, i) { idx[t.id] = i; });
    var U = new Uniao(trs.length);
    function liga(ids) { var pri = null; arr(ids).forEach(function (id) { if (idx[id] == null) return; if (pri == null) pri = idx[id]; else U.u(pri, idx[id]); }); }
    arr(rede.conexoes).forEach(function (c) { liga(c.ramos); });
    var porPeca = {}; arr(rede.ligacoes).forEach(function (l) { if (l.tipo === "peca") (porPeca[l.alvo] = porPeca[l.alvo] || []).push(l.trecho); });
    Object.keys(porPeca).forEach(function (k) { liga(porPeca[k]); });
    arr(rede.acessorios).forEach(function (a) { liga([a.trecho, a.novoId]); });
    /* ventilação toca o esgoto numa ponta: junta ao mesmo desenho */
    trs.forEach(function (v, i) {
      if (v.sistema !== "ventilacao") return;
      trs.forEach(function (e, j) {
        if (e.sistema === "ventilacao") return;
        [v.p1, v.p2].forEach(function (a) { [e.p1, e.p2].forEach(function (b) { if (dist3(a, b) <= K.tolNo_m) U.u(i, j); }); });
      });
    });
    var comp = {}, ord = [];
    trs.forEach(function (t, i) { var r = U.f(i); if (!comp[r]) { comp[r] = []; ord.push(r); } comp[r].push(t); });
    var gr = ord.map(function (r) { return { nome: "", trechos: comp[r] }; });
    gr.sort(function (a, b) { return b.trechos.length - a.trechos.length; });
    gr.forEach(function (g, i) { g.nome = "Conjunto " + (i + 1); });
    return gr;
  }

  /* hid:fisica-inicio — diagramação (geometria de desenho em mm, índices de caixa/ponto): nenhum valor de norma; DN, vazão e declividade vêm sempre do RESULTADO */
  /* ------------------------------------------------------------ AFASTAMENTO dos rótulos
   * pendentes: [{ s, h, tipo, camada, trecho, anchors:[[x,y]…], prio, balao?, d0? }]; S/L/T recebem símbolos
   * (balões), linhas (chamadas) e textos; seg = segmentos do desenho (custo de cruzamento). Cada rótulo tenta
   * caixas em anéis crescentes ao redor de cada âncora e fica com a de menor custo que não toca texto nem símbolo. */
  function afastar(pendentes, S, L, T, seg, avisos) {
  var ocupados = [];   /* caixas de texto já postas */
  var obstaculos = S.map(function (s) { return s.box; });
  pendentes.sort(function (a, b) { return a.prio - b.prio || (b.comprimento || 0) - (a.comprimento || 0); });
  var dirs = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];
  pendentes.forEach(function (it) {
    var w = largTexto(it.s, it.h), hb = it.h * K.caixaAlt, hw, hh, r0 = 0;
    if (it.balao) { var rb = Math.max(K.rBalaoMin, w / 2 + 0.8); hw = rb; hh = rb; } else { hw = w / 2; hh = hb / 2; }
    var melhor = null, dIni = it.d0 != null ? it.d0 : K.d0;
    for (var ring = 0; ring < K.aneis && !(melhor && melhor.livre && ring > melhor.ring + 1); ring++) {
      var d = dIni + ring * K.dPasso;
      for (var ai = 0; ai < it.anchors.length; ai++) {
        var an = it.anchors[ai];
        for (var di = 0; di < dirs.length; di++) {
          var u = dirs[di], cx = an[0] + u[0] * (hw + d), cy = an[1] + u[1] * (hh + d), box = [cx - hw, cy - hh, cx + hw, cy + hh];
          var ocupado = false, j;
          for (j = 0; j < ocupados.length && !ocupado; j++) if (cruza(box, ocupados[j], K.folga)) ocupado = true;
          for (j = 0; j < obstaculos.length && !ocupado; j++) if (cruza(box, obstaculos[j], K.folga / 2)) ocupado = true;
          if (ocupado) continue;
          var cr = 0; for (j = 0; j < seg.length; j++) if (segNaCaixa(seg[j], box)) cr++;
          /* GERAR PRANCHAS (18/10/2026): rótulo sobre TUBO ou sobre COTA só se não houver lugar limpo em nenhum anel —
             antes o custo de cruzar (pCruz) empatava com 2 anéis de afastamento e o texto ficava em cima da linha de cota */
          var custo = ring * K.pAnel + cr * K.pCruz * K.pCruzSujo + Math.sqrt((cx - an[0]) * (cx - an[0]) + (cy - an[1]) * (cy - an[1])) * K.pDist + ai * 0.5;
          if (!melhor || custo < melhor.custo) melhor = { custo: custo, box: box, cx: cx, cy: cy, an: an, ring: ring, livre: cr === 0, d: d };
        }
      }
    }
    if (!melhor) { avisos.push("Rótulo \"" + it.s + "\" (" + it.trecho + ") sem lugar livre."); return; }
    ocupados.push(melhor.box); obstaculos.push(melhor.box);
    var tx = melhor.cx, tyb = melhor.box[1] + (it.balao ? (melhor.box[3] - melhor.box[1]) / 2 - it.h * K.caixaAlt / 2 : 0) + it.h * K.base;
    if (it.balao) {
      var rb2 = (melhor.box[2] - melhor.box[0]) / 2;
      S.push({ tipo: "balao", x: melhor.cx, y: melhor.cy, r: rb2, camada: "HID-SIMBOLO", box: melhor.box, id: it.s, trecho: it.trecho, desenhado: true });
    }
    var tbox = it.balao ? [tx - w / 2, tyb - it.h * K.base, tx + w / 2, tyb - it.h * K.base + hb] : melhor.box;
    T.push({ s: it.s, x: tx, y: tyb, h: it.h, al: "C", camada: it.camada, tipo: it.tipo, trecho: it.trecho, box: tbox });
    if (melhor.d > (it.chamadaMin != null ? it.chamadaMin : K.chamadaMin) || it.balao) {
      /* chamada: do ponto do tubo até a borda mais próxima da caixa */
      var ex = Math.max(melhor.box[0], Math.min(melhor.an[0], melhor.box[2])), ey = Math.max(melhor.box[1], Math.min(melhor.an[1], melhor.box[3]));
      L.push({ x1: melhor.an[0], y1: melhor.an[1], x2: ex, y2: ey, camada: "HID-COTA", tipo: "chamada", trecho: it.trecho, pena: K.penas.chamada });
    }
  });
  }

  /* ------------------------------------------------------------ desenhar um grupo */
  /* GERAR PRANCHAS (18/10/2026): o ventilador que sobe 3 m até a cobertura achatava o isométrico do banheiro (o fator era
     escolhido pela altura dele). A coluna de ventilação com a ponta de cima LIVRE sai INTERROMPIDA (símbolo de quebra);
     a cota mostra o comprimento REAL (t.quebra). */
  function comQuebra(g) {
    var tr = g.trechos, out = tr.map(function (t) {
      if (t.sistema !== "ventilacao" || !t.vertical) return t;
      var L = Math.abs(t.p2.y - t.p1.y); if (!(L > K.quebraMin_m)) return t;
      var alto = t.p2.y > t.p1.y ? "p2" : "p1", baixo = alto === "p2" ? "p1" : "p2", pa = t[alto];
      var livre = !tr.some(function (u) { return u !== t && (dist3(u.p1, pa) <= K.tolNo_m || dist3(u.p2, pa) <= K.tolNo_m); });
      if (!livre) return t;
      var c = {}; for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) c[k] = t[k];
      c[alto] = { x: pa.x, y: t[baixo].y + K.quebraDesenho_m * (pa.y > t[baixo].y ? 1 : -1), z: pa.z };
      c.quebra = L;
      return c;
    });
    return { nome: g.nome, trechos: out };
  }
  function desenhar(sis, g, gi, rede, ix, colunas, pavs, opcoes, avisosGlobais) {
    var avisos = [];
    g = comQuebra(g);
    var ids = {}; g.trechos.forEach(function (t) { ids[t.id] = 1; });
    var pontos = [];   /* extremos para o ajuste de escala */
    g.trechos.forEach(function (t) { pontos.push(t.p1, t.p2); });
    var area = opcoes.area && opcoes.area.w > 0 && opcoes.area.h > 0 ? opcoes.area : null;
    var fatores = opcoes.mmPorM > 0 ? [opcoes.mmPorM] : (area ? K.fatores : [K.fatorPadrao]);
    var d = null, tentativa;
    for (tentativa = 0; tentativa < fatores.length; tentativa++) {
      var k = fatores[tentativa];
      /* só tenta o fator se a geometria pura cabe (senão pula direto para o menor) */
      if (area) {
        var pp = pontos.map(function (p) { return proj(p, k); }), xs = pp.map(function (p) { return p[0]; }), ys = pp.map(function (p) { return p[1]; });
        var gw = Math.max.apply(null, xs) - Math.min.apply(null, xs) + 2 * K.margem, gh = Math.max.apply(null, ys) - Math.min.apply(null, ys) + 2 * K.margem;
        if ((gw > area.w || gh > area.h) && tentativa < fatores.length - 1) continue;
      }
      d = montar(sis, g, gi, rede, ix, colunas, pavs, opcoes, k);
      if (!area || (d.w <= area.w && d.h <= area.h)) { d.coube = true; break; }
      d.coube = false;
    }
    if (d && !d.coube) d.avisos.push("O isométrico não coube na área da folha nem no menor fator (" + d.mmPorM + " mm/m): dividir por ambiente (opcoes.ambientes).");
    return d;
  }

  function montar(sis, g, gi, rede, ix, colunas, pavs, opcoes, k) {
    var sg = SIGLA_SISTEMA[sis] || "XX", avisos = [], L = [], T = [], S = [], pendentes = [];
    var ids = {}; g.trechos.forEach(function (t) { ids[t.id] = 1; });
    function camadaTubo(t) { return "HID-" + (SIGLA_SISTEMA[t.sistema] || sg) + "-TUBO"; }
    function pena(t) { return K.penas[SIGLA_SISTEMA[t.sistema] || sg] || K.penas.AF; }
    function infoDe(t) { return ix[t.sistema] ? ix[t.sistema][t.id] : null; }

    /* 1) tubos */
    var seg = [], P = {};
    g.trechos.forEach(function (t) {
      var a = proj(t.p1, k), b = proj(t.p2, k);
      P[t.id] = { a: a, b: b, t: t };
      L.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], camada: camadaTubo(t), tipo: "tubo", trecho: t.id, pena: pena(t), sistema: t.sistema });
      seg.push([a[0], a[1], b[0], b[1]]);
    });

    /* o símbolo de quebra (dois traços em "Z") no meio da ventilação interrompida */
    g.trechos.forEach(function (t) {
      if (!t.quebra) return;
      var pr = P[t.id], mx = (pr.a[0] + pr.b[0]) / 2, my = (pr.a[1] + pr.b[1]) / 2, q = K.quebraTam;
      L.push({ x1: mx - q, y1: my + q * 0.4, x2: mx + q, y2: my - q * 0.4, camada: "HID-SIMBOLO", tipo: "quebra", trecho: t.id, pena: K.penas.simbolo });
      L.push({ x1: mx - q, y1: my + q * 0.4 + q * 0.6, x2: mx + q, y2: my - q * 0.4 + q * 0.6, camada: "HID-SIMBOLO", tipo: "quebra", trecho: t.id, pena: K.penas.simbolo });
    });
    /* 2) símbolos: conexões, registros, pontos, peças */
    arr(rede.conexoes).forEach(function (c) {
      if (!arr(c.ramos).some(function (id) { return ids[id]; })) return;
      var tr = null; c.ramos.forEach(function (id) { if (ids[id] && !tr) tr = P[id].t; });
      if (!tr || (tr.sistema !== sis && !(sis === "esgoto" && tr.sistema === "ventilacao"))) return;
      var p = proj(c, k), tipo = c.tipo === "te" ? "te" : (/^joelho/.test(c.tipo) ? "joelho" : (c.tipo === "reducao" ? "reducao" : "conexao"));
      if (tipo === "reducao" || tipo === "conexao") return;
      var r = tipo === "te" ? K.rTe : K.rJoelho;
      S.push({ tipo: tipo, x: p[0], y: p[1], r: r, camada: "HID-SIMBOLO", box: [p[0] - r, p[1] - r, p[0] + r, p[1] + r], id: c.id });
    });
    arr(rede.acessorios).forEach(function (a) {
      if (!(ids[a.trecho] || ids[a.novoId])) return;
      var c = proj(a.centro, k), pa = proj(a.a, k), pb = proj(a.b, k), dx = pb[0] - pa[0], dy = pb[1] - pa[1], Ld = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / Ld, uy = dy / Ld, nx = -uy, ny = ux;
      var h = K.regC / 2, w = K.regL;
      /* "gravata": dois triângulos opostos pelo vértice, no eixo do tubo */
      var A = [c[0] - ux * h + nx * w, c[1] - uy * h + ny * w], B = [c[0] - ux * h - nx * w, c[1] - uy * h - ny * w], C = [c[0] + ux * h + nx * w, c[1] + uy * h + ny * w], D = [c[0] + ux * h - nx * w, c[1] + uy * h - ny * w];
      [[A, B], [B, C], [C, D], [D, A]].forEach(function (s2) { L.push({ x1: s2[0][0], y1: s2[0][1], x2: s2[1][0], y2: s2[1][1], camada: "HID-SIMBOLO", tipo: "registro", trecho: a.id, pena: K.penas.simbolo }); });
      var r = Math.max(h, w);
      S.push({ tipo: "registro", x: c[0], y: c[1], r: r, camada: "HID-SIMBOLO", box: [c[0] - r, c[1] - r, c[0] + r, c[1] + r], id: a.id, desenhado: true });
      var sigla = SIGLA_ACESSORIO[a.acessorio] || "RG";
      pendentes.push({ s: sigla + " DN " + a.dn, h: K.hPeq, tipo: "registro", camada: "HID-TEXTO", trecho: a.id, anchors: [c], prio: 1 });
    });
    var jaLig = {};
    arr(rede.ligacoes).forEach(function (l) {
      if (!ids[l.trecho]) return;
      if (jaLig[l.alvo] || l.tipo === "acessorio") return;   /* a peça (caixa sifonada) recebe vários trechos: um símbolo e um rótulo só */
      jaLig[l.alvo] = 1;
      var p = proj(l, k), alt = alturaPiso(l.y, pavs), nome = l.famInst || l.alvo;
      /* GERAR PRANCHAS: o nome do ponto na folha é a SIGLA do aparelho (BS, LV, CH…) e o da peça é o rótulo do padrão ("CS 100x100x50mm"), nunca o id interno */
      var nm2 = l.tipo === "peca" ? (typeof opcoes.nomePeca === "function" ? opcoes.nomePeca(l.alvo) : null) : (typeof opcoes.nomeAparelho === "function" ? opcoes.nomeAparelho(l.famInst) : null);
      if (nm2) nome = nm2;
      if (l.tipo === "peca") {
        var q = K.caixaL / 2;
        S.push({ tipo: "caixa", x: p[0], y: p[1], r: q, camada: "HID-SIMBOLO", box: [p[0] - q, p[1] - q, p[0] + q, p[1] + q], id: l.alvo });
        pendentes.push({ s: nome + "  " + sinal(alt, 2) + " m", h: K.hPeq, tipo: "altura", camada: "HID-TEXTO", trecho: l.trecho, anchors: [p], prio: 0 });
      } else {
        S.push({ tipo: "ponto", x: p[0], y: p[1], r: K.rPonto, camada: "HID-SIMBOLO", box: [p[0] - K.rPonto, p[1] - K.rPonto, p[0] + K.rPonto, p[1] + K.rPonto], id: l.alvo });
        pendentes.push({ s: nome + "  " + sinal(alt, 2) + " m", h: K.hPeq, tipo: "altura", camada: "HID-TEXTO", trecho: l.trecho, anchors: [p], prio: 0 });
      }
    });

    /* 3) sentido de escoamento (esgoto e ventilação não; só o esgoto) */
    if (sis === "esgoto") g.trechos.forEach(function (t) {
      if (t.sistema !== "esgoto") return;
      var pr = P[t.id], dx = pr.b[0] - pr.a[0], dy = pr.b[1] - pr.a[1], Ld = Math.sqrt(dx * dx + dy * dy);
      if (Ld < 2 * K.arrComp) return;
      var ux = dx / Ld, uy = dy / Ld, cx = pr.a[0] + dx * K.arrPos, cy = pr.a[1] + dy * K.arrPos, tx = cx + ux * K.arrComp / 2, ty = cy + uy * K.arrComp / 2, bx = cx - ux * K.arrComp / 2, by = cy - uy * K.arrComp / 2;
      var nx = -uy * K.arrLarg, ny = ux * K.arrLarg;
      S.push({ tipo: "seta", x: cx, y: cy, r: K.arrComp / 2, ang: Math.atan2(dy, dx), camada: "HID-SIMBOLO", pts: [[tx, ty], [bx + nx, by + ny], [bx - nx, by - ny]], id: t.id, box: [cx - K.arrComp / 2, cy - K.arrComp / 2, cx + K.arrComp / 2, cy + K.arrComp / 2], naLinha: true });
    });

    /* 4) rótulos de DN e cotas por trecho */
    var cx0 = 0, cy0 = 0;
    pontos_(g.trechos).forEach(function (p) { var q = proj(p, k); cx0 += q[0]; cy0 += q[1]; });
    var npt = pontos_(g.trechos).length; cx0 /= npt; cy0 /= npt;
    g.trechos.forEach(function (t) {
      var pr = P[t.id], inf = infoDe(t), partes = [];
      var dn = inf && inf.dn != null ? inf.dn : null;
      /* ⚠ revisão F7 A4: trecho sem DN calculado (ou pendente) NUNCA sai como DN limpo — o
         cabeçalho promete "(sem cálculo)" e a nota da prancha diz que os DN são os do cálculo */
      var semCalc = dn == null || (inf && inf.status === "pendente");
      /* F8 (28/10/2026): o trecho com DN definido mostra SÓ o DN; só sem DN nenhum sai "DN a confirmar". Nunca "(sem cálculo)" no desenho do cliente. */
      if (dn == null) { dn = t.dn; avisos.push("Trecho " + t.id + ": sem resultado de cálculo; DN do modelo no desenho" + (dn == null ? " (DN a confirmar)." : ".")); }
      partes.push(dn == null ? "DN a confirmar" : "DN " + dn);
      void semCalc;
      if (t.sistema === "agua_fria" && inf && inf.vazao_ls != null) partes.push(br(inf.vazao_ls, 2) + " L/s");
      /* revisão F7 M7: declividade abaixo da mínima não vira instrução — o rótulo mostra a mínima */
      if (t.sistema === "esgoto" && !t.vertical && inf && inf.declividade_pct != null) {
        if (inf.declividadeMin_pct != null && inf.declividadeMin_pct > inf.declividade_pct) partes.push("i ≥ " + br(inf.declividadeMin_pct, 1) + "% (modelo " + br(inf.declividade_pct, 1) + "%: corrigir)");
        else partes.push("i=" + br(inf.declividade_pct, 1) + "%");
      }
      if (inf && inf.dnModelo != null && inf.dn != null && inf.dn !== inf.dnModelo) avisos.push("Trecho " + t.id + ": DN calculado " + inf.dn + " difere do DN do modelo " + inf.dnModelo + " (desenhado o calculado).");
      var anchors = K.ancoras.map(function (f) { return [pr.a[0] + (pr.b[0] - pr.a[0]) * f, pr.a[1] + (pr.b[1] - pr.a[1]) * f]; });
      pendentes.push({ s: partes.join("  "), h: K.h, tipo: "dn", camada: "HID-TEXTO", trecho: t.id, anchors: anchors, prio: 3, comprimento: dist3(t.p1, t.p2), semCalculo: semCalc });
      /* cota do comprimento (cm) */
      var Lm = t.quebra || dist3(t.p1, t.p2);
      if (opcoes.cotas !== false && Lm >= K.cotaMin) {
        var dx = pr.b[0] - pr.a[0], dy = pr.b[1] - pr.a[1], Ld = Math.sqrt(dx * dx + dy * dy);
        if (Ld > 1e-6) {
          var ux = dx / Ld, uy = dy / Ld, nx = -uy, ny = ux;
          /* lado da cota: o que tem menos tubo perto; empate = para fora do desenho */
          function contaLado(sgn) {
            var mx = (pr.a[0] + pr.b[0]) * K.meio + nx * sgn * K.cotaOff, my = (pr.a[1] + pr.b[1]) * K.meio + ny * sgn * K.cotaOff, bx = [mx - Ld / 2, my - Ld / 2, mx + Ld / 2, my + Ld / 2], c = 0;
            seg.forEach(function (s2) { if (segNaCaixa(s2, bx)) c++; });
            var fora = (mx - cx0) * nx * sgn + (my - cy0) * ny * sgn;
            return c * 1000 - fora;
          }
          var sd = contaLado(1) <= contaLado(-1) ? 1 : -1, off = K.cotaOff * sd;
          var a2 = [pr.a[0] + nx * off, pr.a[1] + ny * off], b2 = [pr.b[0] + nx * off, pr.b[1] + ny * off];
          L.push({ x1: a2[0], y1: a2[1], x2: b2[0], y2: b2[1], camada: "HID-COTA", tipo: "cota", trecho: t.id, pena: K.penas.cota });
          [[pr.a, a2], [pr.b, b2]].forEach(function (e) {
            var ex = e[1][0] - e[0][0], ey = e[1][1] - e[0][1], el = Math.sqrt(ex * ex + ey * ey) || 1;
            L.push({ x1: e[0][0] + ex / el * K.cotaExt, y1: e[0][1] + ey / el * K.cotaExt, x2: e[1][0] + ex / el * K.cotaExt, y2: e[1][1] + ey / el * K.cotaExt, camada: "HID-COTA", tipo: "cota-ext", trecho: t.id, pena: K.penas.cota });
            seg.push([e[0][0] + ex / el * K.cotaExt, e[0][1] + ey / el * K.cotaExt, e[1][0] + ex / el * K.cotaExt, e[1][1] + ey / el * K.cotaExt]);   /* a linha de chamada da cota também é obstáculo do rótulo */
          });
          [a2, b2].forEach(function (e) {
            /* traço oblíquo (padrão RA de cota) */
            var tx = (ux + nx) / Math.SQRT2, ty = (uy + ny) / Math.SQRT2;
            L.push({ x1: e[0] - tx * K.cotaTique, y1: e[1] - ty * K.cotaTique, x2: e[0] + tx * K.cotaTique, y2: e[1] + ty * K.cotaTique, camada: "HID-COTA", tipo: "cota-tique", trecho: t.id, pena: K.penas.simbolo });
          });
          var ancC = K.ancorasCurtas.map(function (f) { return [a2[0] + (b2[0] - a2[0]) * f, a2[1] + (b2[1] - a2[1]) * f]; });
          pendentes.push({ s: String(Math.round(Lm * 100)), h: K.hPeq, tipo: "cota", camada: "HID-COTA", trecho: t.id, anchors: ancC, prio: 4, d0: K.d0Cota });
          seg.push([a2[0], a2[1], b2[0], b2[1]]);
        }
      }
    });

    /* 5) balões: coluna de AF e tubo de queda */
    var jaBalao = {};
    g.trechos.forEach(function (t) {
      var nome = null, ref = null;
      if (t.sistema === "agua_fria" && colunas[t.id]) { nome = colunas[t.id].nome; ref = nome; }
      else if (t.sistema === "esgoto" && ix.tq[t.id]) { nome = ix.tq[t.id]; ref = nome; }
      if (!nome || jaBalao[ref]) return;
      /* o balão vai no trecho mais longo da cadeia */
      var melhor = t; g.trechos.forEach(function (u) { var mesmo = (u.sistema === "agua_fria" && colunas[u.id] && colunas[u.id].nome === nome) || (u.sistema === "esgoto" && ix.tq[u.id] === nome); if (mesmo && dist3(u.p1, u.p2) > dist3(melhor.p1, melhor.p2)) melhor = u; });
      jaBalao[ref] = 1;
      var pr = P[melhor.id], an = K.ancorasCurtas.map(function (f) { return [pr.a[0] + (pr.b[0] - pr.a[0]) * f, pr.a[1] + (pr.b[1] - pr.a[1]) * f]; });
      pendentes.push({ s: nome, h: K.h, tipo: nome.charAt(0) === "T" ? "tq" : "coluna", camada: "HID-TEXTO", trecho: melhor.id, anchors: an, prio: 2, balao: true, d0: 2.5 });
    });

    /* 6) AFASTAMENTO dos rótulos */
    afastar(pendentes, S, L, T, seg, avisos);

    /* 7) enquadrar: origem no canto, margem */
    var xs = [], ys = [];
    L.forEach(function (l) { xs.push(l.x1, l.x2); ys.push(l.y1, l.y2); });
    S.forEach(function (s) { xs.push(s.box[0], s.box[2]); ys.push(s.box[1], s.box[3]); });
    T.forEach(function (t) { xs.push(t.box[0], t.box[2]); ys.push(t.box[1], t.box[3]); });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), dx0 = K.margem - x0, dy0 = K.margem - y0;
    L.forEach(function (l) { l.x1 += dx0; l.x2 += dx0; l.y1 += dy0; l.y2 += dy0; });
    S.forEach(function (s) { s.x += dx0; s.y += dy0; s.box = [s.box[0] + dx0, s.box[1] + dy0, s.box[2] + dx0, s.box[3] + dy0]; if (s.pts) s.pts = s.pts.map(function (p) { return [p[0] + dx0, p[1] + dy0]; }); });
    T.forEach(function (t) { t.x += dx0; t.y += dy0; t.box = [t.box[0] + dx0, t.box[1] + dy0, t.box[2] + dx0, t.box[3] + dy0]; });
    var w = Math.max.apply(null, xs) + dx0 + K.margem, h = Math.max.apply(null, ys) + dy0 + K.margem;
    var caixas = T.map(function (t) { return { s: t.s, p: [[t.box[0], t.box[1]], [t.box[2], t.box[1]], [t.box[2], t.box[3]], [t.box[0], t.box[3]]] }; });
    var titulo = "ISOMÉTRICO - " + (NOME_SISTEMA[sis] || sis) + (g.nome ? " - " + g.nome.toUpperCase() : "");
    return { id: "iso-" + sg.toLowerCase() + "-" + (gi + 1), titulo: titulo, sistema: sis, grupo: g.nome, escalaTexto: "SEM ESCALA", mmPorM: k, w: r2(w), h: r2(h),
             linhas: L, textos: T, simbolos: S, caixas: caixas, avisos: avisos, trechos: g.trechos.map(function (t) { return t.id; }), coube: true };
  }
  function pontos_(trs) { var o = []; trs.forEach(function (t) { o.push(t.p1, t.p2); }); return o; }
  
  /* hid:fisica-fim */
  /* hid:fisica-inicio — diagramação (geometria de desenho em mm, índices de caixa/ponto): nenhum valor de norma; DN, vazão e declividade vêm sempre do RESULTADO */
  /* ------------------------------------------------------------ verificação */
  /* devolve { ok, semDN, sobrepostos, invalidos }: o que reprova a emissão */
  function verificar(d) {
    var semDN = [], sob = [], inv = [], i, j;
    arr(d.trechos).forEach(function (id) {
      if (!arr(d.textos).some(function (t) { return t.trecho === id && t.tipo === "dn" && /^DN \d/.test(t.s); })) semDN.push(id);
    });
    var T = arr(d.textos);
    for (i = 0; i < T.length; i++) for (j = i + 1; j < T.length; j++) if (cruza(T[i].box, T[j].box, -K.tolSobre)) sob.push([T[i].s, T[j].s]);
    arr(d.simbolos).forEach(function (s) {
      T.forEach(function (t) { if (s.tipo === "balao" && s.id === t.s && s.trecho === t.trecho) return; if (s.naLinha) return; if (cruza(t.box, s.box, -K.tolSobre)) sob.push([t.s, "símbolo " + s.tipo]); });
    });
    if (/NaN|undefined|Infinity/.test(JSON.stringify([d.linhas, d.textos, d.simbolos, d.w, d.h]))) inv.push("valor inválido (NaN/undefined/Infinity) nas primitivas");
    return { ok: !semDN.length && !sob.length && !inv.length, semDN: semDN, sobrepostos: sob, invalidos: inv };
  }

  /* hid:fisica-fim */
  var HidIsometrico = { VERSAO: 1, K: K, gerar: gerar, verificar: verificar, afastar: afastar, proj: proj, largTexto: largTexto, indicesResultado: indicesResultado,
                        SIGLA_SISTEMA: SIGLA_SISTEMA, NOME_SISTEMA: NOME_SISTEMA };
  global.HidIsometrico = HidIsometrico;
  if (typeof module !== "undefined" && module.exports) module.exports = HidIsometrico;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
