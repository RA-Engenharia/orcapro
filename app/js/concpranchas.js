/* =====================================================================
 * concpranchas.js — PROJETO EXECUTIVO DA SUPERESTRUTURA DE CONCRETO (fase C8, 16/11/2026). Motor PURO, ES5, sem DOM, Node-testável.
 * Cálculo de apoio — o engenheiro responsável confere e assina (ART). As pranchas SAEM DO CÁLCULO: nenhum número é reescrito aqui — cada barra desenhada,
 * cada rótulo e cada linha da tabela de aço lê a POSIÇÃO do js/concdetalhe.js (φ, quantidade, comprimento, ganchos, trecho, espaçamento) e só formata.
 *
 *   ConcPranchas.gerar(pac, opcoes)  → { ok, folhas: [{ id, tipo, numero, titulo, formato, escala, svg, elementos, tabela, resumo }], avisos, bloqueado, reprovadas, resumo, tabela }
 *   ConcPranchas.pecaSvg(pac, id, opcoes) → { ok, svg, titulo, tabela, naoLiberado }       o MESMO desenho da prancha, só da peça (painel da Vista de Estrutura)
 *   ConcPranchas.paraCad(r, opcoes)  → { dxf, dxfDwg, ctb, ctbNome, ... }                 DXF único (MODEL em escala real + um layout por prancha com viewports travadas 1:50 e 1:25 — até 13 por layout —, CTB RA_Estrutural)
 *   ConcPranchas.xlsx(ExcelJS, r)    → Workbook                                              tabela de aço por prancha + resumo (com e sem os 10 % de perda)
 *   ConcPranchas.pdf(r)              → Uint8Array                                            uma página por prancha (vetorial, js/svgpdf.js)
 *   ConcPranchas.pacoteDe(r) / ConcPranchas.conferirSobreposicao(r)
 *
 * O JOGO (uma prancha por TIPO, Padrão RA v2.0 = TQS, carimbo RA intocado):
 *   FÔRMA por nível (vigas V…, pilares P…, lajes L… com h/tipo/nível, eixos, cotas parciais e totais)
 *   VIGAS     elevação 1:50 com as barras desdobradas fora da peça (ganchos, reto e dobras cotados, "2 N1 Ø 10 C=410"), estribos por trecho ("22 Ø 6.3 C/20 / N4 (438)"),
 *             cortes 1:25 das seções críticas e o estribo desenhado aberto com as medidas
 *   LAJES     armadura POSITIVA e NEGATIVA em pranchas separadas por nível (uma barra representativa por faixa, com ganchos, "21 N1 Ø 6.3 C/18 C=395")
 *   PILARES   elevação do lance (esperas, estribos por trecho, grampos) + seção 1:10 com as barras, estribos e grampos
 *   TABELA DE AÇO por prancha (AÇO · POS · BIT · QUANT · C unit · C total) e RESUMO AÇO CA 50-60 por bitola (peso sem perda no desenho, como o TQS; a planilha traz com 10 %)
 * NÃO LIBERADO: com peça reprovada/incompleta (ConcMemorial.reprovada) toda prancha leva a faixa "NÃO LIBERADO — N peça(s)", a peça sai com o nome em vermelho e o carimbo sai SEM o
 * responsável técnico e o registro (sem assinatura), igual ao memorial.
 * LIMITES DECLARADOS: pré-dimensionamento A CALCULAR e armadura de canto/momentos volventes não detalhados (C5); lajes não maciças e fundação (C9) fora; a posição X/Y da barra de laje é a
 * representativa da faixa (a quantidade e o espaçamento estão no rótulo); o desdobrado do pilar usa o comprimento do C5 (lance + espera), sem desenho da barra retificada.
 * Teste: node tools/test-conc-c8.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  function MPm() { return dep("MadPranchas", "./madpranchas.js"); }
  function II() { var m = MPm(); return m && m._i; }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function PD() { return dep("PadraoDet", "./padraodet.js"); }
  function DT() { return dep("ConcDetalhe", "./concdetalhe.js"); }
  function MEM() { return dep("ConcMemorial", "./concmemorial.js"); }
  function CD() { return dep("ArqCad", "./arqcad.js"); }

  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var x = Number(v); return isFinite(x) ? x : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function dois(k) { return ("0" + k).slice(-2); }
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function natural(a, b) { return String(a).localeCompare(String(b), "pt-BR", { numeric: true }); }
  function fmtG(v) { var s = String(Math.round(v * 100) / 100); return s; }               /* %g: 6.3, 12.5, 10 */
  function brn(v, c) { var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c); return s.replace(".", ","); }
  function nivTxt(z) { return (z > 0.0005 ? "+" : (z < -0.0005 ? "-" : "±")) + brn(Math.abs(z), 2) + "m"; }

  var PRETO = "#000", VERMELHO = "#c00000", CINZA = "#7f7f7f";
  var FAIXA = "Documento gerado pelo sistema — cálculo de apoio: emissão somente após conferência e ART do responsável técnico";
  var ESC = { viga: 50, corte: 25, estribo: 10, pilar: 25, pilarSecao: 10, planta: [50, 75, 100], laje: [50, 75, 100] };
  var COB_PADRAO = 3;
  var MAX_VIGAS_FOLHA = 6;   /* 2 viewports por viga (elevação 1:50 e cortes 1:25): até 12 + a principal por layout, dentro do que o LibreDWG grava (14) */

  /* camadas do Padrão RA (EST-*) que o desenho usa; as MAD-* que o Desenho do js/madpranchas.js emprega por dentro (cota, tabela, balão…) ganham o layer EST equivalente */
  var LAYERS = ["EST-FORMA-CORTE", "EST-FORMA-VISTA", "EST-OCULTA", "EST-ARM-CONTORNO", "EST-ARM-LONG", "EST-ARM-LONG-ELEV", "EST-ARM-NEG", "EST-ARM-ESTRIBO", "EST-ARM-PELE", "EST-ARM-SECAO",
    "EST-ARM-TEXTO", "EST-ARM-CHAMADA", "EST-COTA", "EST-EIXO", "EST-CORTE-IND", "EST-NIVEL", "EST-HACHURA", "EST-TEXTO", "EST-TITULO", "EST-TABELA", "EST-CONTEXTO", "EST-LINHA-FINA"];
  var LAYER_DE = { "MAD-COTA": "EST-COTA", "MAD-FINA": "EST-LINHA-FINA", "MAD-EIXO": "EST-EIXO", "MAD-TABELA": "EST-TABELA", "MAD-TITULO": "EST-TITULO", "MAD-HACHURA": "EST-HACHURA", "MAD-CONTEXTO": "EST-CONTEXTO",
    "MAD-OCULTA": "EST-OCULTA", "MAD-CORTE": "EST-FORMA-CORTE", "MAD-PECA": "EST-FORMA-VISTA", "MAD-PRINCIPAL": "EST-ARM-ESTRIBO", "MAD-FERRAGEM": "EST-ARM-LONG-ELEV", "MAD-PAINEL": "EST-LINHA-FINA",
    "MAD-MOLDURA": "EST-CARIMBO", "MAD-PEND": "EST-PEND", "MAD-PENDT": "EST-PEND" };

  /* ------------------------------------------------------------ estilo e Desenho */
  function estilo(padrao) {
    var Ib = II(), P = PD(), E = Ib.estilo(padrao), base = P.normPadrao(padrao || P.padraoRA()), at = (base.textos && base.textos.alturas_plotadas_mm) || {};
    LAYERS.forEach(function (lay) {
      var l = null; try { l = P.linhaDe(base, lay); } catch (e) { l = null; }
      E.camadas[lay] = { mm: l ? l.mm : 0.25, dash: l ? l.dash : null, cor: lay === "EST-CONTEXTO" ? CINZA : PRETO };
    });
    E.camadas["EST-PEND"] = { mm: 0.25, dash: null, cor: VERMELHO };
    E.camadas["MAD-PEND"] = { mm: 0.25, dash: null, cor: VERMELHO };
    E.camadas["EST-CARIMBO"] = E.camadas["MAD-MOLDURA"] || { mm: 0.5, dash: null };
    E.T.nome = num(at.nome_viga_pilar, 8.5); E.T.secaoNome = num(at.secao_ao_lado_do_nome, 3.8); E.T.tituloLance = num(at.titulo_pilar_lance, 5);
    E.T.estriboTrecho = num(at.notacao_estribo_trecho, 2.1); E.T.barra = num(at.notacao_barra, 2.5); E.T.corte = num(at.letra_corte, 3.4);
    E.padrao = base;
    return E;
  }
  function novoD(E, caixas) {
    var Ib = II(), D = new Ib.Desenho(E, caixas || null), t0 = D.texto;
    D.estilo = function (cam, extra) {
      var c = E.camadas[cam] || E.camadas["MAD-FINA"], lay = LAYER_DE[cam] || cam;
      return ' data-cam="' + lay + '" stroke="' + (c.cor || PRETO) + '" stroke-width="' + Ib.n(c.mm) + '"' + (c.dash ? ' stroke-dasharray="' + c.dash + '"' : "") + ' stroke-linecap="round" stroke-linejoin="round"' + (extra || "");
    };
    D.texto = function (x, y, s, h, o) {
      o = o || {};
      var a = o.attr || "";
      if (a.indexOf("data-cam") < 0) { var o2 = {}; Object.keys(o).forEach(function (k) { o2[k] = o[k]; }); o2.attr = a + ' data-cam="' + (o.cam || (o.cor === VERMELHO ? "EST-PEND" : "EST-TEXTO")) + '"'; o = o2; }
      return t0.call(D, x, y, s, h, o);
    };
    /* BLOCO = um desenho em escala (viewport do CAD): o <g> leva a escala 1:N; o resto da folha (títulos, tabelas, notas) fica no papel */
    D.abreBloco = function (id, esc, x, y, w, h) { D.add('<g data-bloco="' + Ib.esc(id) + '" data-escala="1:' + esc + '" data-x="' + Ib.n(x) + '" data-y="' + Ib.n(y) + '" data-w="' + Ib.n(w) + '" data-h="' + Ib.n(h) + '">'); };
    /* DETALHE em escala sem viewport (estribo e seção do pilar, 1:10): fica no papel — o DWG do LibreDWG não aguenta mais de ~14 viewports por layout (a cadeia de entidades do layout quebra; achado do gate com o AutoCAD, 16/11/2026) */
    D.abreDetalhe = function (id, esc, x, y, w, h) { D.add('<g data-detalhe="' + Ib.esc(id) + '" data-escala="1:' + esc + '" data-x="' + Ib.n(x) + '" data-y="' + Ib.n(y) + '" data-w="' + Ib.n(w) + '" data-h="' + Ib.n(h) + '">'); };
    D.fechaBloco = function () { D.add("</g>"); };
    return D;
  }
  function T(D, x, y, s, h, o) { return D.texto(x, y, s, h, o); }

  /* ------------------------------------------------------------ o MODELO para o desenho (tudo do pacote do cálculo) */
  function porNome(l) { return l.slice().sort(function (a, b) { return natural(a.nome, b.nome); }); }
  function modelo(pac, opc) {
    opc = opc || {};
    var an = pac.an, m = an.modelo, dt = DT(), det = pac.det, mem = MEM();
    if (!det) {
      var lj = arr(pac.lajes).map(function (L) { return { res: L.res, g: L.lm ? dt.gDeLajeModelo(an, L.lm) : null }; }).filter(function (x) { return x.g; });
      det = dt.detalharDeAnalise(an, pac.dv, pac.dp, lj, { caa: pac.projeto && pac.projeto.caa });
    }
    var nos = {}, barras = {}, pv = m.pecas.vigas || {}, pp = m.pecas.pilares || {}, tramos = {}, dpMap = {}, c;
    m.nos.forEach(function (n) { nos[n.id] = n; }); m.barras.forEach(function (b) { barras[b.id] = b; });
    arr(pac.dv && pac.dv.vigas).forEach(function (v) { arr(v.tramos).forEach(function (t) { tramos[t.id] = t; }); });
    arr(pac.dp && pac.dp.pilares).forEach(function (q) { dpMap[q.id] = q; });
    var rep = mem && mem.reprovadasDe ? mem.reprovadasDe(pac) : [], reprov = { viga: {}, pilar: {}, laje: {}, "laje-sem-calculo": {} };
    rep.forEach(function (r) { (reprov[r.tipo] = reprov[r.tipo] || {})[r.nome] = true; });
    c = { pac: pac, an: an, m: m, det: det, opc: opc, nos: nos, barras: barras, tramos: tramos, reprov: reprov, reprovadas: rep, bloqueado: rep.length > 0, vigas: [], pilares: [], lajes: [], pilaresTodos: [], vigasTodas: [], lajesTodas: [], avisos: [] };
    /* peças para a FÔRMA: todas, detalhadas ou não */
    Object.keys(pp).forEach(function (k) { var p = pp[k], th = num(p.rotY, 0); c.pilaresTodos.push({ id: p.id, nome: p.marca || p.id, cx: p.cx, cz: p.cz, comp: p.comp, esp: p.esp, th: th, u: [Math.cos(th), -Math.sin(th)], v: [Math.sin(th), Math.cos(th)], base: p.base, top: p.top, b: p.esp * 100, hh: p.comp * 100 }); });
    Object.keys(pv).forEach(function (k) { var p = pv[k]; c.vigasTodas.push({ id: p.id, nome: p.marca || p.id, A: p.A, B: p.B, y: p.y, b: p.b * 100, h: p.h * 100, L: p.L }); });
    arr(m.lajes).forEach(function (l) { c.lajesTodas.push({ id: l.id, nome: l.marca || l.id, poli: l.poli, topo: l.topo, h: l.h * 100, tipo: l.tipo, lm: l }); });
    /* peças DETALHADAS (as que têm armação desenhada) */
    arr(det.vigas).forEach(function (r) {
      var b = barras[r.id], p = b ? pv[b.peca] : null; if (!p || !arr(r.posicoes).length) return;
      var t = tramos[r.id] || {}, ap = t.apoios || {}, en = r.entrada || {};
      c.vigas.push({ id: r.id, nome: p.marca || r.id, r: r, entrada: en, A: p.A, B: p.B, y: p.y, b: en.bw, h: en.h, L: en.L, cob: num(en.cob, COB_PADRAO), posicoes: r.posicoes,
        larg: { esq: num(ap.esq && ap.esq.larg, 15), dir: num(ap.dir && ap.dir.larg, 15) }, tipoApoio: { esq: txt(ap.esq && ap.esq.tipo), dir: txt(ap.dir && ap.dir.tipo) }, reprovada: !!reprov.viga[p.marca || r.id], tramo: t });
    });
    arr(det.pilares).forEach(function (r) {
      var b = barras[r.id], p = b ? pp[b.peca] : null, q = dpMap[r.id]; if (!p || !q || !arr(r.posicoes).length) return;
      c.pilares.push({ id: r.id, nome: p.marca || r.id, r: r, q: q, posicoes: r.posicoes, entrada: r.entrada || {}, cx: p.cx, cz: p.cz, th: num(p.rotY, 0), base: p.base, top: p.top, hx: q.secao.hx, hy: q.secao.hy, reprovada: !!reprov.pilar[p.marca || r.id] });
    });
    arr(det.lajes).forEach(function (r) {
      var lm = arr(m.lajes).filter(function (l) { return l.id === r.id; })[0], lj = arr(pac.lajes).filter(function (L) { return L.res && L.res.id === r.id; })[0]; if (!lm || !arr(r.posicoes).length) return;
      c.lajes.push({ id: r.id, nome: lm.marca || r.id, r: r, lm: lm, posicoes: r.posicoes, topo: lm.topo, h: lm.h * 100, res: lj && lj.res, g: lj && lm ? dt.gDeLajeModelo(an, lm) : null, reprovada: !!reprov.laje[lm.marca || r.id] });
    });
    c.vigas = porNome(c.vigas); c.pilares = porNome(c.pilares); c.lajes = porNome(c.lajes);
    /* PILAR com vários lances: as posições seguem em SEQUÊNCIA no pilar (lance 1: N1, N2…; lance 2: N3, N4…), senão "N1" se repete em cada lance e a tabela fica ambígua. Cópias: o C5 não muda (idOrig guarda o número do lance) */
    (function () {
      var gp = {}; c.pilares.forEach(function (q) { var kk = Math.round(q.cx * 100) + "," + Math.round(q.cz * 100); (gp[kk] = gp[kk] || []).push(q); });
      Object.keys(gp).forEach(function (kk) {
        var cont = 0; gp[kk].sort(function (a, b) { return a.base - b.base; }).forEach(function (q) {
          q.posicoes = q.posicoes.map(function (p0) { var cp0 = {}; Object.keys(p0).forEach(function (k2) { cp0[k2] = p0[k2]; }); cp0.idOrig = p0.id; cont++; cp0.id = "N" + cont; return cp0; });
        });
      });
    })();
    var ys = {}; c.vigasTodas.forEach(function (v) { ys[Math.round(v.y * 1000)] = v.y; }); c.lajesTodas.forEach(function (l) { ys[Math.round(l.topo * 1000)] = l.topo; });
    c.niveis = Object.keys(ys).map(function (k) { return ys[k]; }).sort(function (a, b) { return a - b; });
    c.eixos = opc.eixos && arr(opc.eixos.horizontais).length ? opc.eixos : derivarEixos(c);
    return c;
  }
  /* eixos A, B… (por z crescente) e 1, 2… (por x crescente) a partir do centro dos pilares (agrupa até 25 cm) */
  function derivarEixos(c) {
    function agrupa(vals) {
      var s = vals.slice().sort(function (a, b) { return a - b; }), g = [];
      s.forEach(function (v) { var u = g[g.length - 1]; if (u && v - u.max < 0.25) { u.v.push(v); u.max = v; } else g.push({ v: [v], max: v }); });
      return g.map(function (u) { return u.v.reduce(function (a, b) { return a + b; }, 0) / u.v.length; });
    }
    var xs = agrupa(c.pilaresTodos.map(function (p) { return p.cx; })), zs = agrupa(c.pilaresTodos.map(function (p) { return p.cz; }));
    return { horizontais: zs.map(function (z, i) { return { nome: String.fromCharCode(65 + i), z: z }; }), verticais: xs.map(function (x, i) { return { nome: String(i + 1), x: x }; }), derivados: true };
  }
  function nomeNivel(c, y) {
    var ls = arr(c.opc.niveis), nome = null;
    ls.forEach(function (n) { if (Math.abs(num(n.cota, 1e9) - y) < 0.02 && (n.tipo === "respaldo" || n.tipo === "cobertura" || n.tipo === "piso") && !nome) nome = n.tipo === "piso" ? n.nome : n.nome; });
    ls.forEach(function (n) { if (Math.abs(num(n.cota, 1e9) - y) < 0.02 && n.tipo === "respaldo") nome = n.nome; });
    return nome || ("Nível " + nivTxt(y));
  }
  function rotuloEixo(c, x, z) {   /* "A / 1" mais próximo */
    var hz = c.eixos.horizontais, vt = c.eixos.verticais, a = "", b = "", d;
    d = 1e9; hz.forEach(function (e) { if (Math.abs(e.z - z) < d) { d = Math.abs(e.z - z); a = e.nome; } });
    d = 1e9; vt.forEach(function (e) { if (Math.abs(e.x - x) < d) { d = Math.abs(e.x - x); b = e.nome; } });
    return a + " / " + b;
  }
  function secStr(b, h) { return Math.round(b) + "/" + Math.round(h); }

  /* ------------------------------------------------------------ notação (Padrão RA: {q} N{pos} Ø {bit} C={comp}) */
  function posNum(p) { return txt(p.id).replace(/^N/, ""); }
  function barraTxt(E, p) { return PD().fmtBarra(E.padrao, { q: p.qtd, pos: posNum(p), bit: p.phi, comp: Math.round(p.comprimentoCm) }); }
  function estriboTxt(E, p) { return PD().fmtEstribo(E.padrao, { q: p.qtd, pos: posNum(p), bit: p.phi, esp: p.s != null ? p.s : "", comp: Math.round(p.comprimentoCm) }); }
  /* pilar e laje levam o espaçamento: "29 N7 Ø 6.3 C/12 C=150" */
  function barraEspTxt(E, p) {
    var n = E.padrao.notacao, f = n && n.estribo_pilar ? n.estribo_pilar : "{q} N{pos} Ø {bit} C/{esp} C={comp}";
    return f.replace("{q}", p.qtd).replace("{pos}", posNum(p)).replace("{bit}", fmtG(p.phi)).replace("{esp}", fmtG(p.s)).replace("{comp}", Math.round(p.comprimentoCm));
  }
  function trechoTxt(E, p, z) { return fmtG(z.n) + " Ø " + fmtG(p.phi) + " C/" + fmtG(p.s) + "|N" + posNum(p) + " (" + Math.round(z.len) + ")"; }
  function rotuloGenerico(E, p) { return p.s != null && (p.tipo === "estribo" || p.tipo === "grampo" || /^(positiva|negativa|distribuicao|anticolapso)/.test(p.tipo)) && p.elemento.indexOf("viga") < 0 ? barraEspTxt(E, p) : barraTxt(E, p); }
  function acoCod(aco) { return /60/.test(aco) ? "60B" : "50A"; }

  /* ------------------------------------------------------------ TABELA DE AÇO por prancha + RESUMO */
  var COLS_TAB = [{ t: "AÇO" }, { t: "POS" }, { t: ["BIT", "(mm)"] }, { t: "QUANT" }, { t: ["COMPRIMENTO", "UNIT (cm)"] }, { t: ["COMPRIMENTO", "TOTAL (cm)"] }];
  var COLS_RES = [{ t: "AÇO" }, { t: ["BIT", "(mm)"] }, { t: ["COMPR", "(m)"] }, { t: ["PESO", "(kg)"] }];
  /* elems = [{ titulo, posicoes, vol? }] → linhas da tabela, o resumo por aço e bitola e o peso total (kg, sem perda) */
  function tabelaDe(elems, perda) {
    var dt = DT(), linhas = [], todas = [], vol = 0;
    elems.forEach(function (e) {
      linhas.push({ titulo: e.titulo });
      arr(e.posicoes).forEach(function (p) { todas.push(p); linhas.push([acoCod(p.aco), p.id, fmtG(p.phi), String(p.qtd), String(Math.round(p.comprimentoCm)), String(Math.round(p.qtd * p.comprimentoCm))]); });
      vol += num(e.vol, 0);
    });
    var tb = dt.tabelaAco(todas, { perda: perda }), res = [];
    arr(tb.resumo).forEach(function (r) { res.push([acoCod(r.aco), fmtG(r.phi), brn(r.comprimentoM, 1), String(Math.round(r.kg))]); });
    var pesoPor = {}; arr(tb.resumo).forEach(function (r) { pesoPor[acoCod(r.aco)] = (pesoPor[acoCod(r.aco)] || 0) + r.kg; });
    return { cols: COLS_TAB, linhas: linhas, resumoCols: COLS_RES, resumoLinhas: res, pesoPor: pesoPor, totalKg: tb.totalKg, totalKgComPerda: tb.totalKgComPerda, volM3: vol, posicoes: todas, tabelaAco: tb, perda: tb.perda };
  }

  /* ------------------------------------------------------------ empacotar blocos numa área (prateleiras) com limite de linhas de tabela por folha */
  function distribuir(itens, area, gap, cabe) {
    var folhas = [], cur = null;
    function nova() { cur = { itens: [], x: 0, y: 0, hLinha: 0 }; folhas.push(cur); }
    itens.forEach(function (it) {
      if (!cur) nova();
      function tenta(c) {
        var x = c.x, y = c.y, hl = c.hLinha;
        if (x > 0 && x + it.w > area.w + 1e-6) { y += hl + gap; x = 0; hl = 0; }
        if (y + it.h > area.h + 1e-6) return null;
        return { x: x, y: y };
      }
      var pos = tenta(cur), ok = pos && (!cabe || cabe(cur.itens.map(function (q) { return q.it; }).concat([it])));
      if (!ok) { if (cur.itens.length) { nova(); pos = tenta(cur); } else pos = pos || { x: 0, y: 0 }; }
      var p0 = pos || { x: 0, y: 0 };
      if (p0.y > cur.y + 1e-9 || (p0.x === 0 && cur.itens.length)) { cur.y = p0.y; cur.hLinha = 0; }
      cur.itens.push({ it: it, x: p0.x, y: p0.y });
      cur.x = p0.x + it.w + gap; cur.hLinha = Math.max(cur.hLinha, it.h);
    });
    return folhas;
  }

  /* ================================================================ VIGA: elevação 1:50, cortes 1:25, estribo aberto 1:10 */
  var TOPO = { negativa: 1, "negativa-meia-barra": 1, "porta-estribo": 1, "armadura-comprimida": 1 };
  function ehEstribo(p) { return p.tipo === "estribo" || p.tipo === "suspensao"; }
  /* empacota intervalos [a,b] em linhas (a primeira que couber) → índice da linha de cada intervalo */
  function linhasLivres(itens) {
    var rows = [];
    itens.forEach(function (it) {
      var r = 0;
      for (; r < rows.length; r++) { var ok = rows[r].every(function (q) { return it.b + 1.5 <= q.a || it.a >= q.b + 1.5; }); if (ok) break; }
      if (!rows[r]) rows[r] = [];
      rows[r].push(it); it.linha = r;
    });
    return rows.length;
  }
  function gancho(D, x, y, lado, cm, k, cima, cam) {   /* ponta do gancho desenhada: vertical, no máximo 3 mm */
    var l = Math.min(Math.max(cm * k, 1.2), 3.0);
    D.linha(x, y, x, cima ? y - l : y + l, cam || "EST-ARM-LONG");
  }
  function larguraRotulo(E, s, h) { return II().caixaTexto(0, 0, s, h, { al: "E" }).reduce(function (m, q) { return Math.max(m, q[0]); }, 0); }

  function blocoViga(D, c, v, x0, y0) {
    var E = D.E, Ts = E.T, Ib = II(), k = 10 / ESC.viga, kc = 10 / ESC.corte, L = v.L, bw = v.b, h = v.h, cob = v.cob, ps = v.posicoes, rh = 10, hT = Ts.barra, hD = Ts.estriboTrecho;
    var xe0 = x0 + 13, lE = v.larg.esq, lD = v.larg.dir, XA = xe0 + lE / 2 * k, XB = XA + L * k, XF0 = XA + lE / 2 * k, XF1 = XB - lD / 2 * k, XR = XB + lD / 2 * k;
    function X(cm) { return XA + cm * k; }
    var barras = ps.filter(function (p) { return !ehEstribo(p) && p.tipo !== "grampo"; }), est = ps.filter(ehEstribo);
    /* linhas: barras do alto (negativas, porta-estribo) e de baixo (positivas, pele) */
    var topo = [], baixo = [];
    barras.forEach(function (p) {
      var t = p.trecho || [-p.comprimentoCm / 2, p.comprimentoCm / 2], a = X(t[0]), b = X(t[1]), rot = barraTxt(E, p), w = Math.max(larguraRotulo(E, rot, hT), 3), cx = (a + b) / 2, it = { p: p, a: Math.min(a, cx - w / 2), b: Math.max(b, cx + w / 2), xa: a, xb: b, rot: rot, cx: cx };
      (TOPO[p.tipo] ? topo : baixo).push(it);
    });
    topo.sort(function (p, q) { return p.xa - q.xa; }); baixo.sort(function (p, q) { return (q.xb - q.xa) - (p.xb - p.xa); });
    var nT = linhasLivres(topo), nB = linhasLivres(baixo);
    var yTitulo = y0 + Ts.nome * 0.76, yE = y0 + 12 + nT * rh + 3, hE = Math.max(h * k, 6), yEb = yE + hE;
    /* zonas de estribo (trechos): níveis para não encavalar os textos */
    var zs = [];
    est.forEach(function (p) {
      var zl = arr(p.zonas); if (!zl.length) zl = [{ x0: lE / 2, len: L - lE / 2 - lD / 2, n: p.qtd, nome: "vão inteiro" }];
      zl.forEach(function (z) { var t1 = fmtG(z.n) + " Ø " + fmtG(p.phi) + " C/" + fmtG(p.s), t2 = "N" + posNum(p) + " (" + Math.round(z.len) + ")", w = Math.max(larguraRotulo(E, t1, hD), larguraRotulo(E, t2, hD)), a = X(z.x0), b = X(z.x0 + z.len), cx = (a + b) / 2; zs.push({ p: p, z: z, t1: t1, t2: t2, a: Math.min(a, cx - w / 2), b: Math.max(b, cx + w / 2), xa: a, xb: b, cx: cx }); });
    });
    zs.sort(function (p, q) { return p.xa - q.xa; });
    var nZ = zs.length ? linhasLivres(zs) : 0, yZ = yEb + 12.5, yB0 = yZ + 11 + Math.max(0, nZ - 1) * 6.5;
    var larguraEl = XR - xe0, yFim = yB0 + (nB ? (nB - 1) * rh + 8 : 2);
    /* ---- título: nome grande + seção ao lado ---- */
    var wNome = T(D, x0, yTitulo, v.nome, Ts.nome, { peso: 0.18, cor: v.reprovada ? VERMELHO : null, attr: ' data-viga="' + Ib.esc(v.nome) + '"' });
    T(D, x0 + wNome + 2, yTitulo, secStr(bw, h), Ts.secaoNome, { attr: ' data-secao="' + Ib.esc(v.nome) + '"' });
    if (v.reprovada) T(D, x0 + wNome + 22, yTitulo, "PEÇA NÃO LIBERADA", Ts.secaoNome, { cor: VERMELHO });
    T(D, x0 + wNome + 2, yTitulo + Ts.secaoNome * 1.4, "ESC 1:" + ESC.viga + " · cortes 1:" + ESC.corte, Ts.estriboTrecho);
    D.abreBloco(v.nome + "-ELEV", ESC.viga, xe0, y0 + 12, larguraEl, yFim - y0 - 12);
    /* ---- elevação ---- */
    D.ret(XF0, yE, XF1 - XF0, hE, "EST-ARM-CONTORNO");
    [[xe0, lE], [XB - lD / 2 * k, lD]].forEach(function (ap, i) {
      var xx = i === 0 ? XA - lE / 2 * k : XB - lD / 2 * k, ww = (i === 0 ? lE : lD) * k;
      D.ret(xx, yE - 3, ww, hE + 6, "EST-ARM-CONTORNO"); D.hachura(xx, yE - 3, ww, hE + 6, 1.2, "EST-HACHURA");
    });
    var pilEsq = pilarDoApoio(c, v, "A"), pilDir = pilarDoApoio(c, v, "B");
    T(D, xe0 - 1.4, yE + hE / 2 + 1.2, pilEsq || "", Ts.pilar, { al: "D" }); T(D, XR + 1.4, yE + hE / 2 + 1.2, pilDir || "", Ts.pilar, { al: "E" });
    /* barras dentro da elevação (traço médio) */
    var iT = 0, iB = 0;
    barras.forEach(function (p) {
      var t = p.trecho; if (!t) return; var topoB = !!TOPO[p.tipo], yy = topoB ? yE + 1.2 + (iT++ % 4) * 0.9 : yEb - 1.2 - (iB++ % 4) * 0.9;
      D.linha(Math.max(X(t[0]), xe0), yy, Math.min(X(t[1]), XR), yy, p.tipo === "pele" ? "EST-ARM-PELE" : "EST-ARM-LONG-ELEV");
    });
    /* marcas dos cortes */
    var cuts = [["A", lE / 2 + 6], ["B", L / 2], ["C", L - lD / 2 - 6]];
    cuts.forEach(function (q) { var xx = X(q[1]); D.linha(xx, yE - 1.5, xx, yEb + 3.5, "EST-CORTE-IND"); T(D, xx, yEb + 7.2, q[0], Ts.corte, { al: "C", cam: "EST-CORTE-IND" }); });
    /* estribos por trecho: limites verticais + cota do trecho com a notação em duas linhas */
    zs.forEach(function (q) {
      var ya = yZ + (q.linha * 6.5);
      D.linha(q.xa, yE, q.xa, yEb, "EST-ARM-ESTRIBO"); D.linha(q.xb, yE, q.xb, yEb, "EST-ARM-ESTRIBO");
      D.linha(q.xa, yZ - 1.6 + 0, q.xa, yZ + 1.6, "EST-COTA"); D.linha(q.xb, yZ - 1.6, q.xb, yZ + 1.6, "EST-COTA"); D.linha(q.xa, yZ, q.xb, yZ, "EST-COTA");
      var yb1 = q.linha ? yZ + 3.2 + q.linha * 6.5 : yZ - 1.2;
      T(D, q.cx, yb1, q.t1, hD, { al: "C", attr: ' data-trecho="N' + posNum(q.p) + '"' });
      T(D, q.cx, q.linha ? yb1 + 2.7 : yZ + 3.0, q.t2, hD, { al: "C" });
      void ya;
    });
    /* barras desdobradas: reto e dobras cotados, rótulo "q N# Ø bit C=comp" */
    function desenhaBarra(it, y, cima) {
      var p = it.p, g = arr(p.ganchos), isPele = p.tipo === "pele", cam = isPele ? "EST-ARM-PELE" : "EST-ARM-LONG", a = it.xa, b = it.xb;
      D.linha(a, y, b, y, cam);
      var gE = g.filter(function (q) { return q.lado === "esq"; })[0] || (g.length === 1 && !g[0].lado && p.lado !== "dir" ? g[0] : null), gD = g.filter(function (q) { return q.lado === "dir"; })[0] || (g.length === 2 && !g[0].lado ? g[1] : null);
      if (g.length === 1 && !g[0].lado && p.lado === "dir") { gE = null; gD = g[0]; }
      if (gE) gancho(D, a, y, "esq", gE.pontaCm, k, cima, cam); if (gD) gancho(D, b, y, "dir", gD.pontaCm, k, cima, cam);
      /* as partes SOMAM o C do rótulo: a diferença do arredondamento (C é arredondado para cima a 5 cm no C5) vai no trecho reto */
      var hE = gE ? Math.round(gE.pontaCm) : 0, hD2 = gD ? Math.round(gD.pontaCm) : 0, reto = Math.round(p.comprimentoCm) - hE - hD2, partes = [];
      if (gE) partes.push(String(hE)); partes.push(String(reto)); if (gD) partes.push(String(hD2));
      var cx = (a + b) / 2;
      T(D, cx, cima ? y + 4.1 : y - 1.3, it.rot, hT, { al: "C", attr: ' data-pos="' + Ib.esc(p.id) + '" data-elem="' + Ib.esc(p.elemento) + '" data-qtd="' + p.qtd + '" data-phi="' + fmtG(p.phi) + '" data-c="' + Math.round(p.comprimentoCm) + '"' });
      T(D, cx, cima ? y - 1.3 : y + 3.3, partes.join(" | "), hD, { al: "C", cam: "EST-COTA", attr: ' data-dims-pos="' + Ib.esc(p.id) + '" data-elem="' + Ib.esc(p.elemento) + '" data-c="' + Math.round(p.comprimentoCm) + '"' });
    }
    topo.forEach(function (it) { desenhaBarra(it, yE - 4 - it.linha * rh, false); });
    baixo.forEach(function (it) { desenhaBarra(it, yB0 + it.linha * rh, true); });
    D.fechaBloco();
    /* ---- cortes 1:25 ---- */
    var wc = Math.max(bw * kc + 4, 25), xc0 = XR + 8, yc = y0 + 24, hc = h * kc, wCuts = 3 * wc;
    D.abreBloco(v.nome + "-CORTES", ESC.corte, xc0 - 1, y0 + 12, wCuts + 2, hc + 36);
    cuts.forEach(function (q, i) { corteViga(D, c, v, xc0 + i * wc + (wc - bw * kc) / 2, yc, q[1], q[0], kc); });
    D.fechaBloco();
    /* ---- estribo aberto 1:10 ---- */
    var xs = xc0 + wCuts + 12, wEst = estriboAberto(D, c, v, xs, y0 + 22, est);
    return { w: Math.max(xs + wEst + 4 - x0, XR - x0 + 8 + wCuts), h: Math.max(yFim - y0, hc + 48, (h - 2 * cob) * (10 / ESC.estribo) + 50) + 3 };
  }
  function pilarDoApoio(c, v, ponta) {
    var P = ponta === "A" ? v.A : v.B, best = null, bd = 0.6;
    c.pilaresTodos.forEach(function (q) { var d = Math.sqrt(Math.pow(q.cx - P.x, 2) + Math.pow(q.cz - P.z, 2)); if (d < bd && (Math.abs(q.top - v.y) < 0.02 || Math.abs(q.base - v.y) < 0.02)) { bd = d; best = q; } });
    return best ? best.nome : "";
  }
  /* barras que cruzam a seção x (cm do eixo esquerdo): [{ p, n }] do alto e de baixo */
  function barrasNoCorte(v, x) {
    var cima = [], baixo = [];
    v.posicoes.forEach(function (p) {
      if (ehEstribo(p) || p.tipo === "grampo" || !p.trecho) return;
      if (x >= p.trecho[0] - 1e-6 && x <= p.trecho[1] + 1e-6) (TOPO[p.tipo] ? cima : baixo).push(p);
    });
    return { cima: cima, baixo: baixo };
  }
  function corteViga(D, c, v, x, y, xcm, letra, kc) {
    var Ts = D.E.T, bw = v.b, h = v.h, cob = v.cob, W = bw * kc, H = h * kc, phiT = num(v.entrada.phiEstribo, 6.3), sel = barrasNoCorte(v, xcm), Ib = II();
    D.ret(x, y, W, H, "EST-ARM-CONTORNO");
    var ce = (cob + phiT / 10) * kc;
    D.ret(x + cob * kc, y + cob * kc, W - 2 * cob * kc, H - 2 * cob * kc, "EST-ARM-ESTRIBO");
    function camada(lista, ycen, sgn, textoY, cima) {
      var tot = lista.reduce(function (s, p) { return s + p.qtd; }, 0); if (!tot) return;
      var maxPhi = Math.max.apply(null, lista.map(function (p) { return p.phi; })), cap = Math.max(2, Math.floor((bw - 2 * (cob + phiT / 10)) / (maxPhi / 10 + 2)) + 1), pos = [], k = 0;
      lista.forEach(function (p) { for (var i = 0; i < p.qtd; i++) { pos.push({ p: p, cam: Math.floor(k / cap) }); k++; } });
      var porCam = {}; pos.forEach(function (q) { (porCam[q.cam] = porCam[q.cam] || []).push(q); });
      Object.keys(porCam).forEach(function (cm) {
        var l = porCam[cm], n = l.length, x1 = x + ce + 0.3, x2 = x + W - ce - 0.3;
        l.forEach(function (q, i) { var xx = n === 1 ? (x1 + x2) / 2 : x1 + (x2 - x1) * i / (n - 1), yy = ycen + sgn * (+cm) * ((maxPhi / 10 + 2) * kc * 0.9); D.ponto(xx, yy, Math.max(0.42, q.p.phi / 20 * kc * 1.6), PRETO); });
      });
      /* chamadas: "q Ø bit" por posição, com a linha até a barra do corte */
      var yl = textoY, xt = x + W / 2;
      lista.forEach(function (p, i) {
        var lab = fmtG(p.qtd) + " Ø " + fmtG(p.phi);
        T(D, xt, yl, lab, Ts.estriboTrecho, { al: "C", attr: ' data-corte-pos="' + Ib.esc(p.id) + '"' });
        if (i === 0) D.linha(xt, cima ? yl + 0.8 : yl - Ts.estriboTrecho * 0.9, xt, cima ? y - 0.2 : y + H + 0.2, "EST-ARM-CHAMADA");
        yl += cima ? -3.0 : 3.0;
      });
    }
    camada(sel.cima, y + ce + 0.4, 1, y - 3.4 - 0 * 3, true);
    camada(sel.baixo, y + H - ce - 0.4, -1, y + H + 3.6, false);
    var yl2 = y + H + 3.6 + 3.0 * Math.max(sel.baixo.length, 1) + 2.0;
    T(D, x + W / 2, yl2 + 2.0, "CORTE " + letra, Ts.corte, { al: "C", cam: "EST-TITULO" });
  }
  function estriboAberto(D, c, v, x, y, est) {
    var Ts = D.E.T, kE = 10 / ESC.estribo, bw = v.b, h = v.h, cob = v.cob, p0 = est[0]; if (!p0) return 0;
    var w = (bw - 2 * cob) * kE, hh = (h - 2 * cob) * kE, g = arr(p0.ganchos)[0] || { pontaCm: 5 }, pg = Math.min(g.pontaCm * kE, 6), xr = x + 2;
    D.abreDetalhe(v.nome + "-ESTRIBO", ESC.estribo, x, y, w + 22, hh + 28);
    D.poli([[xr + pg * 0.7, y + pg * 0.7 + 0.0], [xr, y], [xr + w, y], [xr + w, y + hh], [xr, y + hh], [xr, y + 0.0]], "EST-ARM-ESTRIBO", false);
    D.linha(xr, y, xr + pg * 0.7, y + pg * 0.7, "EST-ARM-ESTRIBO");
    D.cota(xr, y, xr + w, y, 3.5, fmtG(bw - 2 * cob), { semExt: false, attrs: [' data-cam="EST-COTA"'] });
    D.cota(xr + w, y, xr + w, y + hh, 4, fmtG(h - 2 * cob), { semExt: false, attrs: [' data-cam="EST-COTA"'] });
    var yt = y + hh + 5;
    est.forEach(function (p) { T(D, xr + w / 2, yt, estriboTxt(D.E, p), Ts.barra, { al: "C", attr: ' data-pos="' + II().esc(p.id) + '" data-elem="' + II().esc(p.elemento) + '" data-qtd="' + p.qtd + '" data-phi="' + fmtG(p.phi) + '" data-c="' + Math.round(p.comprimentoCm) + '"' }); yt += 3.4; });
    T(D, xr + w / 2, yt + 0.6, "gancho " + fmtG(g.pontaCm) + " a " + (g.angulo || 135) + "°", Ts.estriboTrecho, { al: "C" });
    D.fechaBloco();
    return Math.max(w + 12, larguraRotulo(D.E, estriboTxt(D.E, p0), Ts.barra) / 2 + w / 2 + 4);
  }

  /* ================================================================ PILAR: uma coluna por pilar (todos os lances empilhados), seção 1:10 ao lado de cada lance */
  function gruposDePilares(c) {
    var g = {}, ordem = [];
    c.pilares.forEach(function (p) { var k = Math.round(p.cx * 100) + "," + Math.round(p.cz * 100); if (!g[k]) { g[k] = { chave: k, cx: p.cx, cz: p.cz, lances: [] }; ordem.push(g[k]); } g[k].lances.push(p); });
    ordem.forEach(function (q) { q.lances.sort(function (a, b) { return a.base - b.base; }); var nn = []; q.lances.forEach(function (l) { if (nn.indexOf(l.nome) < 0) nn.push(l.nome); }); q.nome = nn.join(" / "); });
    return ordem.sort(function (a, b) { return natural(a.lances[0].nome, b.lances[0].nome); });
  }
  function ptsGrampo(pl) {   /* grampos: linha que atravessa a seção por cada barra sem proteção */
    var out = [], hx = pl.hx, hy = pl.hy;
    arr(pl.q.estribos && pl.q.estribos.semProtecao).forEach(function (q) { var nx = Math.abs(q.x) / (hx / 2), ny = Math.abs(q.y) / (hy / 2); out.push(ny >= nx ? { v: true, x: q.x } : { v: false, y: q.y }); });
    return out;
  }
  function blocoPilarColuna(D, c, gr, x0, y0) {
    var E = D.E, Ts = E.T, Ib = II(), kP = 10 / ESC.pilar, kS = 10 / ESC.pilarSecao, lan = gr.lances, hxMax = Math.max.apply(null, lan.map(function (l) { return l.hx; })), W = hxMax * kP;
    var espera = Math.max.apply(null, lan.map(function (l) { return num(l.entrada.l0c, 0); })) * kP, xe = x0 + 30, yTit = y0 + Ts.nome * 0.76;
    var wN = T(D, x0, yTit, gr.nome, Ts.tituloLance, { peso: 0.16, cor: lan.some(function (l) { return l.reprovada; }) ? VERMELHO : null, attr: ' data-pilar="' + Ib.esc(gr.nome) + '"' });
    T(D, x0 + wN + 2, yTit, "Lance" + (lan.length > 1 ? "s " + 1 + " a " + lan.length : " " + 1) + " · ESC 1:" + ESC.pilar + " (seção 1:" + ESC.pilarSecao + ")", Ts.secaoNome);
    var yTopo = y0 + 14 + espera + 4, tot = lan.reduce(function (s, l) { return s + num(l.entrada.LCm, 280); }, 0) * kP, yBase = yTopo + tot, yBot = yBase, folga = 6;
    var maxLab = 0, itensLab = [];
    D.abreBloco(gr.nome + "-ELEV", ESC.pilar, xe - 30, y0 + 12, 130, tot + espera + 14);
    lan.forEach(function (pl, li) {
      var L = num(pl.entrada.LCm, 280), Lm = L * kP, yb = yBot, yt = yb - Lm, cobP = num(pl.entrada.cobrimento, COB_PADRAO), lc = pl.posicoes.filter(function (p) { return p.tipo === "longitudinal"; })[0], es = pl.posicoes.filter(function (p) { return p.tipo === "estribo"; })[0], gp = pl.posicoes.filter(function (p) { return p.tipo === "grampo"; });
      D.ret(xe, yt, W, Lm, "EST-ARM-CONTORNO");
      var off = (li % 2) * 0.9, xa = xe + cobP * kP + off, xb = xe + W - cobP * kP - off, l0 = num(pl.entrada.l0c, 0) * kP, ultimo = li === lan.length - 1 && !pl.posicoes.some(function (p) { return /espera/i.test(p.nome || ""); });
      var yTopoBar = yt - (lc && /espera/i.test(lc.nome || "") ? l0 : 0);
      D.linha(xa, yb, xa, yTopoBar, "EST-ARM-LONG-ELEV"); D.linha(xb, yb, xb, yTopoBar, "EST-ARM-LONG-ELEV");
      if (yTopoBar < yt - 0.1) D.cota(xe + W, yt, xe + W, yTopoBar, 0 - 5, "l0c " + Math.round(num(pl.entrada.l0c, 0)), { semExt: false, attrs: [' data-cam="EST-COTA"'] });
      if (es && es.s) { var nT = Math.ceil(L / es.s - 1e-9); for (var j = 0; j < nT; j++) { var yy = yb - (j + 0.5) * es.s * kP; D.linha(xe + 0.6, yy, xe + W - 0.6, yy, "EST-ARM-ESTRIBO"); } }
      /* níveis (m) e cota do lance */
      T(D, xe - 1.4, yb - 0.9, nivTxt(pl.base), Ts.estriboTrecho, { al: "D", cam: "EST-NIVEL" }); if (li === lan.length - 1) T(D, xe - 1.4, yt - 0.9, nivTxt(pl.top), Ts.estriboTrecho, { al: "D", cam: "EST-NIVEL" });
      D.cota(xe, yb, xe, yt, 17, fmtG(L), { semExt: false, attrs: [' data-cam="EST-COTA"'] });
      if (pl.reprovada) T(D, xe + W + 2, yt + 3, "PEÇA NÃO LIBERADA", Ts.estriboTrecho, { cor: VERMELHO });
      /* rótulos */
      var yl = yb - Lm / 2, rot = [];
      if (lc) rot.push({ p: lc, s: barraTxt(E, lc), alvoX: xb, alvoY: yl });
      if (es) rot.push({ p: es, s: barraEspTxt(E, es), alvoX: xe + W, alvoY: yt + Math.min(Lm * 0.2, 6) });
      gp.forEach(function (g) { rot.push({ p: g, s: barraEspTxt(E, g), alvoX: xe + W, alvoY: yt + Math.min(Lm * 0.2, 6) + 3 }); });
      itensLab.push({ pl: pl, rot: rot, yb: yb, yt: yt, yc: yl });
      rot.forEach(function (r) { maxLab = Math.max(maxLab, larguraRotulo(E, r.s, Ts.barra)); });
      yBot = yt;
    });
    var xLab = xe + W + 8;
    itensLab.forEach(function (it) {
      var y = it.yc - 3.2 * (it.rot.length - 1) / 2;
      it.rot.forEach(function (r) {
        D.linha(r.alvoX, r.alvoY, xLab - 1, y - 0.9, "EST-ARM-CHAMADA");
        T(D, xLab, y, r.s, Ts.barra, { attr: ' data-pos="' + Ib.esc(r.p.id) + '" data-elem="' + Ib.esc(r.p.elemento) + '" data-qtd="' + r.p.qtd + '" data-phi="' + fmtG(r.p.phi) + '" data-c="' + Math.round(r.p.comprimentoCm) + '"' });
        y += 3.2;
      });
    });
    D.fechaBloco();
    var xS = xLab + maxLab + 12, wS = hxMax * kS + 22;
    itensLab.forEach(function (it, li) {
      var pl = it.pl; secaoPilar(D, c, pl, xS + hxMax * kS / 2, it.yc, kS, li + 1);
    });
    return { w: (xS - x0) + wS + 2, h: yBase - y0 + 10, yBase: yBase };
  }
  /* A seção sai na MESMA orientação da planta de fôrma: o lado hx (comp) corre ao longo de u = (cos θ, −sen θ) e o hy (esp) ao longo de v = (sen θ, cos θ), θ = rotY do pilar,
     com o papel x = x do plano e y = z do plano (a fôrma usa a mesma conta). xc, yc = centro da seção em mm. */
  function secaoPilar(D, c, pl, xc, yc, kS, li) {
    var Ts = D.E.T, hx = pl.hx, hy = pl.hy, cob = num(pl.entrada.cobrimento, COB_PADRAO), th = num(pl.th, 0), dA = [Math.cos(th), -Math.sin(th)], dB = [Math.sin(th), Math.cos(th)], Ib = II();
    var es = pl.posicoes.filter(function (p) { return p.tipo === "estribo"; })[0], lc = pl.posicoes.filter(function (p) { return p.tipo === "longitudinal"; })[0];
    function P(a, b) { return [xc + (a * dA[0] + b * dB[0]) * kS, yc + (a * dA[1] + b * dB[1]) * kS]; }
    var wB = (Math.abs(dA[0]) * hx + Math.abs(dB[0]) * hy) * kS, hB = (Math.abs(dA[1]) * hx + Math.abs(dB[1]) * hy) * kS;
    D.abreDetalhe(pl.nome + "-L" + li + "-SECAO", ESC.pilarSecao, xc - wB / 2 - 4, yc - hB / 2 - 8, wB + 26, hB + 26);
    D.poli([P(-hx / 2, -hy / 2), P(hx / 2, -hy / 2), P(hx / 2, hy / 2), P(-hx / 2, hy / 2)], "EST-ARM-CONTORNO", true, ' data-sec="' + Ib.esc(pl.id) + '" data-ua="' + dA[0].toFixed(4) + "," + dA[1].toFixed(4) + '" data-dims="' + fmtG(hx) + "," + fmtG(hy) + '"');
    var ax = hx / 2 - cob, ay = hy / 2 - cob;
    D.poli([P(-ax, -ay), P(ax, -ay), P(ax, ay), P(-ax, ay)], "EST-ARM-ESTRIBO", true);
    ptsGrampo(pl).forEach(function (g) { if (g.v) { var q1 = P(g.x, -ay), q2 = P(g.x, ay); D.linha(q1[0], q1[1], q2[0], q2[1], "EST-ARM-ESTRIBO"); } else { var q3 = P(-ax, g.y), q4 = P(ax, g.y); D.linha(q3[0], q3[1], q4[0], q4[1], "EST-ARM-ESTRIBO"); } });
    var r = Math.max(0.7, (lc ? lc.phi : 12.5) * 0.06);
    arr(pl.q.armadura && pl.q.armadura.barras).forEach(function (b) { var q5 = P(b.x, b.y); D.ponto(q5[0], q5[1], r, PRETO); });
    /* cotas dos dois lados, para fora da seção */
    function cotaFora(c1, c2, val) { var mx = (c1[0] + c2[0]) / 2 - xc, my = (c1[1] + c2[1]) / 2 - yc, ex = c2[0] - c1[0], ey = c2[1] - c1[1], d = Math.sqrt(ex * ex + ey * ey) || 1, nx = ey / d, ny = -ex / d, off = (mx * nx + my * ny) >= 0 ? 4.5 : -4.5; D.cota(c1[0], c1[1], c2[0], c2[1], off, val, { semExt: false, attrs: [' data-cam="EST-COTA"'] }); }
    cotaFora(P(-hx / 2, -hy / 2), P(hx / 2, -hy / 2), fmtG(hx)); cotaFora(P(hx / 2, -hy / 2), P(hx / 2, hy / 2), fmtG(hy));
    var yb = yc + hB / 2;
    if (lc) { T(D, xc, yb + 12.5, fmtG(lc.qtd) + " Ø " + fmtG(lc.phi), Ts.estriboTrecho, { al: "C", attr: ' data-corte-pos="' + Ib.esc(lc.id) + '"' }); D.linha(xc, yb + 10.4, xc, yb - 1.2, "EST-ARM-CHAMADA"); }
    if (es) T(D, xc, yb + 15.8, "estribo Ø " + fmtG(es.phi) + " C/" + fmtG(es.s), Ts.estriboTrecho, { al: "C" });
    D.fechaBloco();
  }

  /* ================================================================ LAJES: geometria da laje (bordas x1,x2,y1,y2 do C5) e a barra representativa de cada posição */
  function lajeGeom(l) {
    var p = l.lm.poli, ed = arr(l.lm.ed); if (p.length !== 4 || ed.length !== 4) return null;
    var Ls = ed.map(function (e) { return e.L; }), curtas = Ls[0] <= Ls[1] ? [0, 2] : [1, 3], longas = Ls[0] <= Ls[1] ? [1, 3] : [0, 2], map = { x1: longas[0], x2: longas[1], y1: curtas[0], y2: curtas[1] }, E = {}, cen = [0, 0];
    p.forEach(function (q) { cen[0] += q.x / 4; cen[1] += q.z / 4; });
    Object.keys(map).forEach(function (k) { var i = map[k], a = p[i], b = p[(i + 1) % 4]; E[k] = { a: [a.x, a.z], b: [b.x, b.z], m: [(a.x + b.x) / 2, (a.z + b.z) / 2] }; });
    function un(a, b) { var dx = b[0] - a[0], dz = b[1] - a[1], d = Math.sqrt(dx * dx + dz * dz) || 1; return [dx / d, dz / d, d]; }
    var ux = un(E.x1.m, E.x2.m), uy = un(E.y1.m, E.y2.m);
    return { E: E, ux: [ux[0], ux[1]], uy: [uy[0], uy[1]], lx: ux[2], ly: uy[2], cen: cen };
  }
  /* coloca o texto (centro cx,cy; ang em graus; normal unitária nx,ny) no 1º lugar livre: afasta pela normal (dos dois lados) e desliza ao longo do traço (opc.len = comprimento do traço, mm) */
  function colocarTexto(D, cx, cy, s, h, ang, nx, ny, opc) {
    opc = opc || {};
    var Ib = II(), dN = h * 1.3 + 1.0, w = larguraRotulo(D.E, s, h), len = Math.max(opc.len || 0, w), ux = -ny, uy = nx, ks = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8], ts = [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36, 0.45, -0.45], i, j;
    for (i = 0; i < ks.length; i++) for (j = 0; j < ts.length; j++) {
      var px = cx + nx * dN * ks[i] + ux * ts[j] * len, py = cy + ny * dN * ks[i] + uy * ts[j] * len, q = Ib.caixaTexto(px, py, s, h, { al: "C", meio: true, rot: ang });
      if (D.livreQ(q, 0.3)) { D.texto(px, py, s, h, { al: "C", meio: true, rot: ang, attr: opc.attr, cam: opc.cam, cor: opc.cor }); return true; }
    }
    D.texto(cx + nx * dN, cy + ny * dN, s, h, { al: "C", meio: true, rot: ang, attr: opc.attr, cam: opc.cam, cor: opc.cor });
    return false;
  }
  function seta2(D, a, b, extra) {
    var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
    D.linha(a[0], a[1], b[0], b[1], "EST-COTA", extra); D.seta(a[0], a[1], ux, uy, 1.6); D.seta(b[0], b[1], -ux, -uy, 1.6);
  }
  /* barra representativa de UMA posição da laje; f(x,z) → mm de papel; esc = escala do desenho */
  function barraLaje(D, c, l, G, p, f, esc, k) {
    var Ts = D.E.T, hT = Ts.barra, Ib = II(), rot = barraEspTxt(D.E, p), attr = ' data-pos="' + Ib.esc(p.id) + '" data-elem="' + Ib.esc(p.elemento) + '" data-qtd="' + p.qtd + '" data-phi="' + fmtG(p.phi) + '" data-c="' + Math.round(p.comprimentoCm) + '"';
    function P(pt) { return f(pt[0], pt[1]); }
    function add(a, v, d) { return [a[0] + v[0] * d, a[1] + v[1] * d]; }
    var a, b, perp, strip = null, g = arr(p.ganchos), cam = /negativ/.test(p.tipo) ? "EST-ARM-NEG" : "EST-ARM-LONG";
    if (/^(positiva|distribuicao|anticolapso)$/.test(p.tipo)) {
      var dir = p.dir === "y" ? "y" : "x", u = dir === "x" ? G.ux : G.uy, v = dir === "x" ? G.uy : G.ux, o = dir === "x" ? G.E.x1.m : G.E.y1.m, lat = dir === "x" ? 0.34 : 0.62, span = dir === "x" ? G.ly : G.lx, t = p.trecho || [0, p.comprimentoCm - 10];
      a = add(add(o, u, t[0] / 100), v, (lat - 0.5) * span); b = add(add(o, u, t[1] / 100), v, (lat - 0.5) * span); perp = v;
      /* FAIXA: da 1ª à última barra, a partir de face + s/2 (cota face a face), dentro do contorno da laje */
      var sMp = num(p.s, 15) / 100, s0p = add(add(add(o, u, 0.18 * (dir === "x" ? G.lx : G.ly)), v, -span / 2), v, sMp / 2);
      strip = [s0p, add(s0p, v, Math.min(Math.max(p.qtd - 1, 0) * sMp, Math.max(span - sMp, 0)))];
    } else {
      var ref = p.borda || "x1", e = G.E[ref] || G.E.x1, inw = [G.cen[0] - e.m[0], G.cen[1] - e.m[1]], d0 = Math.sqrt(inw[0] * inw[0] + inw[1] * inw[1]) || 1, nIn = [inw[0] / d0, inw[1] / d0], hk = g.reduce(function (s, q) { return s + num(q.pontaCm, 0); }, 0), reto = Math.max(p.comprimentoCm - hk, 20) / 100;
      var tg = ref.charAt(0) === "x" ? G.uy : G.ux;
      if (p.tipo === "negativa-borda") { a = add(e.m, nIn, -0.04); b = add(e.m, nIn, reto - 0.04); }
      else if (p.tipo === "negativa-balanco") { a = add(e.m, nIn, reto - Math.max(reto * 0.2, 0.15) + 0.0); a = add(e.m, nIn, (l.h > 0 ? Math.min(reto * 0.75, (G.lx) * 0.9) : reto * 0.75)); b = add(a, nIn, -reto); }
      else { a = add(e.m, nIn, -reto / 3); b = add(e.m, nIn, 2 * reto / 3); }
      perp = tg;
      var shift = ref.charAt(0) === "x" ? 0.12 * G.ly : 0.12 * G.lx, tgv = [e.b[0] - e.a[0], e.b[1] - e.a[1]], Le = Math.sqrt(tgv[0] * tgv[0] + tgv[1] * tgv[1]) || 1, tgu = [tgv[0] / Le, tgv[1] / Le], iniM = num(p.iniBordaCm, 0) / 100, sMn = num(p.s, 15) / 100;
      if (p.iniBordaCm != null) { var cotaG = arr(p.trechosBorda).reduce(function (q0, q1) { return q0 + q1.cotaCm; }, 0) / 100; shift = iniM + cotaG / 2 - Le / 2; a = add(a, tgu, shift); b = add(b, tgu, shift); } else { a = add(a, tg, shift); b = add(b, tg, shift); }
      var s0n = add(add(e.a, tgu, iniM + sMn / 2), nIn, 0.2 * reto * 2 / 3);
      strip = [s0n, add(s0n, tgu, Math.min(Math.max(p.qtd - 1, 0) * sMn, Math.max(Le - iniM - sMn, 0)))];
    }
    var A = P(a), B = P(b), dx = B[0] - A[0], dy = B[1] - A[1], dL = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / dL, uy = dy / dL;
    D.linha(A[0], A[1], B[0], B[1], cam);
    var sinal = /negativ/.test(p.tipo) ? 1 : -1;   /* ganchos: negativa p/ baixo (convenção do desenho), positiva p/ cima */
    g.forEach(function (q, i) { var P0 = i === 0 ? A : B, nxh = -uy * sinal, nyh = ux * sinal, lh = Math.min(Math.max(num(q.pontaCm, 5) * k, 1.2), 3); D.linha(P0[0], P0[1], P0[0] + nxh * lh, P0[1] + nyh * lh, cam); });
    var ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang > 90.01) ang -= 180; if (ang < -89.99) ang += 180;
    var ra = ang * Math.PI / 180, cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2, nxx = -Math.sin(ra), nyy = Math.cos(ra);
    /* faixa: seta dupla da 1ª à última barra (n × s), dentro da laje; os pontos em metros do plano vão no atributo (o teste confere a geometria) */
    if (strip) {
      var SA = P(strip[0]), SB = P(strip[1]);
      if (Math.sqrt(Math.pow(SB[0] - SA[0], 2) + Math.pow(SB[1] - SA[1], 2)) > 6) seta2(D, SA, SB, ' data-faixa="' + Ib.esc(p.id) + '" data-lj="' + Ib.esc(l.nome) + '" data-s="' + fmtG(num(p.s, 0)) + '" data-n="' + p.qtd + '" data-m="' + strip[0][0].toFixed(4) + "," + strip[0][1].toFixed(4) + "," + strip[1][0].toFixed(4) + "," + strip[1][1].toFixed(4) + '"');
    }
    colocarTexto(D, cx, cy, rot, hT, ang, nxx, nyy, { attr: attr, len: dL });
    return { A: A, B: B };
  }

  /* ================================================================ FÔRMA e planta com eixos */
  function extensao(c, nivel) {
    var xs = [], zs = [];
    c.pilaresTodos.forEach(function (p) { if (Math.abs(p.top - nivel) < 0.02 || Math.abs(p.base - nivel) < 0.02) { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { xs.push(p.cx + s[0] * p.comp / 2 * p.u[0] + s[1] * p.esp / 2 * p.v[0]); zs.push(p.cz + s[0] * p.comp / 2 * p.u[1] + s[1] * p.esp / 2 * p.v[1]); }); } });
    c.vigasTodas.forEach(function (v) { if (Math.abs(v.y - nivel) < 0.02) { xs.push(v.A.x, v.B.x); zs.push(v.A.z, v.B.z); } });
    c.lajesTodas.forEach(function (l) { if (Math.abs(l.topo - nivel) < 0.02) l.poli.forEach(function (q) { xs.push(q.x); zs.push(q.z); }); });
    if (!xs.length) return null;
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) };
  }
  function cantosPilar(p) { return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (s) { return [p.cx + s[0] * p.comp / 2 * p.u[0] + s[1] * p.esp / 2 * p.v[0], p.cz + s[0] * p.comp / 2 * p.u[1] + s[1] * p.esp / 2 * p.v[1]]; }); }
  /* o contexto estrutural em planta (vigas, pilares, lajes) — fôrma usa tudo; as pranchas de laje usam só como fundo */
  function plantaFundo(D, c, nivel, f, o) {
    o = o || {};
    var E = D.E, T2 = E.T, pils = c.pilaresTodos.filter(function (p) { return Math.abs(p.top - nivel) < 0.02 || Math.abs(p.base - nivel) < 0.02; });
    var contexto = !!o.contexto, camV = contexto ? "EST-CONTEXTO" : "EST-FORMA-VISTA", camP = contexto ? "EST-CONTEXTO" : "EST-FORMA-CORTE";
    c.vigasTodas.forEach(function (v) {
      if (Math.abs(v.y - nivel) > 0.02) return;
      var dx = v.B.x - v.A.x, dz = v.B.z - v.A.z, d = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / d, uz = dz / d, nx = -uz, nz = ux, hb = v.b / 200;
      function recuo(pt) { var best = 0; pils.forEach(function (p) { if (Math.sqrt(Math.pow(p.cx - pt.x, 2) + Math.pow(p.cz - pt.z, 2)) < 0.6) { var hu = Math.abs(p.u[0] * ux + p.u[1] * uz) * p.comp / 2 + Math.abs(p.v[0] * ux + p.v[1] * uz) * p.esp / 2; var dist = Math.abs((p.cx - pt.x) * ux + (p.cz - pt.z) * uz); best = Math.max(best, hu - dist + 0); } }); return Math.max(best, 0); }
      var r0 = recuo(v.A), r1 = recuo(v.B), a = [v.A.x + ux * r0, v.A.z + uz * r0], b = [v.B.x - ux * r1, v.B.z - uz * r1];
      [-1, 1].forEach(function (sg) { var p0 = f(a[0] + nx * hb * sg, a[1] + nz * hb * sg), p1 = f(b[0] + nx * hb * sg, b[1] + nz * hb * sg); D.linha(p0[0], p0[1], p1[0], p1[1], camV, ' data-viga="' + II().esc(v.nome) + '"'); });
    });
    pils.forEach(function (p) {
      var Q = cantosPilar(p).map(function (q) { return f(q[0], q[1]); }), chega = Math.abs(p.top - nivel) < 0.02;
      D.poli(Q, camP, true, ' data-pilar="' + II().esc(p.nome) + '"');
      if (!contexto) {
        if (chega) D.hachura(Math.min(Q[0][0], Q[2][0]), Math.min(Q[0][1], Q[2][1]), Math.abs(Q[2][0] - Q[0][0]) || 1, Math.abs(Q[2][1] - Q[0][1]) || 1, 1.0, "EST-HACHURA");
        else { D.linha(Q[0][0], Q[0][1], Q[2][0], Q[2][1], "EST-HACHURA"); D.linha(Q[1][0], Q[1][1], Q[3][0], Q[3][1], "EST-HACHURA"); }
      }
    });
    void T2;
  }
  function gradeEixos(D, c, f, ext, folga) {
    var E = D.E, Ib = II(), ht = E.T.eixo, eix = c.eixos, p0 = f(ext.x0, ext.z0), p1 = f(ext.x1, ext.z1), xs = [], ys = [];
    eix.verticais.forEach(function (e) { var a = f(e.x, ext.z0)[0]; xs.push({ nome: e.nome, X: a }); });
    eix.horizontais.forEach(function (e) { var a = f(ext.x0, e.z)[1]; ys.push({ nome: e.nome, Y: a }); });
    var yT = Math.min(p0[1], p1[1]) - folga, yB = Math.max(p0[1], p1[1]) + 6, xL = Math.min(p0[0], p1[0]) - folga, xR = Math.max(p0[0], p1[0]) + 6;
    xs.forEach(function (e) { D.linha(e.X, yT, e.X, yB, "EST-EIXO"); D.balao(e.X, yT - D.raioBalao(e.nome) - 0.2, e.nome, ' data-eixo="' + e.nome + '"'); });
    ys.forEach(function (e) { D.linha(xL, e.Y, xR, e.Y, "EST-EIXO"); D.balao(xL - D.raioBalao(e.nome) - 0.2, e.Y, e.nome, ' data-eixo="' + e.nome + '"'); });
    /* cotas parciais e total entre eixos (cm) */
    function cadeia(pts, off, vert) {
      if (pts.length < 2) return;
      var vals = [], P = pts.map(function (q) { return vert ? [xL + 0, q.Y, q.v] : [q.X, yT, q.v]; });
      for (var i = 0; i + 1 < P.length; i++) vals.push(String(Math.round(Math.abs(pts[i + 1].v - pts[i].v) * 100)));
      D.cadeia(P.map(function (q) { return [q[0], q[1]]; }), off, vals, { semExt: true, offs: [off + 5], attrs: vals.map(function () { return ' data-cam="EST-COTA"'; }) });
    }
    var vx = eix.verticais.map(function (e, i) { return { X: xs[i].X, v: e.x }; }), vy = eix.horizontais.map(function (e, i) { return { Y: ys[i].Y, v: e.z }; });
    cadeia(vx, 9, false);
    if (vx.length > 1) D.cota(vx[0].X, yT, vx[vx.length - 1].X, yT, 15, String(Math.round((vx[vx.length - 1].v - vx[0].v) * 100)), { semExt: true, attrs: [' data-cam="EST-COTA"'] });
    /* à esquerda: cadeia vertical (de cima p/ baixo; deslocamento + = à direita, então negativo) */
    if (vy.length > 1) {
      var Pv = vy.map(function (q) { return [xL, q.Y]; }), vv = []; for (var i = 0; i + 1 < vy.length; i++) vv.push(String(Math.round(Math.abs(vy[i + 1].v - vy[i].v) * 100)));
      D.cadeia(Pv, -9, vv, { semExt: true, offs: [-14], attrs: vv.map(function () { return ' data-cam="EST-COTA"'; }) });
      D.cota(xL, vy[0].Y, xL, vy[vy.length - 1].Y, -15, String(Math.round((vy[vy.length - 1].v - vy[0].v) * 100)), { semExt: true, attrs: [' data-cam="EST-COTA"'] });
    }
    void Ib; void ht;
    return { x0: xL - 22, y0: yT - 20, x1: xR, y1: yB };
  }

  /* ================================================================ as FOLHAS */
  function escolherEsc(lista, ok) { for (var i = 0; i < lista.length; i++) if (ok(lista[i])) return lista[i]; return lista[lista.length - 1]; }
  function transf(ext, esc, ox, oy) { var s = 1000 / esc; return function (x, z) { return [ox + (x - ext.x0) * s, oy + (z - ext.z0) * s]; }; }
  function planoDe(D, c, geo, nivel, folgaPx) {
    var a = geo.area, ext = extensao(c, nivel); if (!ext) return null;
    var esc = escolherEsc(ESC.planta, function (e) { var s = 1000 / e; return (ext.x1 - ext.x0) * s + 70 <= a.w && (ext.z1 - ext.z0) * s + 40 + 36 <= a.h; }), s = 1000 / esc, ox = a.x + 46, oy = a.y + 54;
    void folgaPx;
    return { ext: ext, esc: esc, s: s, f: transf(ext, esc, ox, oy), ox: ox, oy: oy };
  }
  function rotuloLaje(D, c, l, f) {
    var G = lajeGeom(l), p = l.lm.poli, cx = 0, cz = 0; p.forEach(function (q) { cx += q.x / p.length; cz += q.z / p.length; });
    var C = f(cx, cz), T2 = D.E.T;
    return { C: C, s1: l.nome, s2: "h=" + Math.round(l.h) + (l.lm.tipo ? " " + l.lm.tipo : ""), G: G, T: T2 };
  }
  /* rótulo com chamada: o 1º lugar livre numa coroa em volta do ponto (cx,cy), com a linha até o ponto */
  function rotuloComChamada(D, cx, cy, s, h, o) {
    o = o || {};
    var Ib = II(), w = larguraRotulo(D.E, s, h), r, a;
    for (r = 5; r <= 44; r += 2.5) for (a = 0; a < 360; a += 30) {
      var ang = (a + (o.fase || 45)) * Math.PI / 180, px = cx + Math.cos(ang) * (r + w / 2 * Math.abs(Math.cos(ang))), py = cy + Math.sin(ang) * (r + h * 0.8), q = Ib.caixaTexto(px, py, s, h, { al: "C", meio: true });
      if (!D.livreQ(q, 0.4)) continue;
      var dx = px - cx, dy = py - cy, d = Math.sqrt(dx * dx + dy * dy) || 1, ex = px - Math.max(-w / 2, Math.min(w / 2, dx)) * 0, ey = py;
      void ex; void ey;
      D.texto(px, py, s, h, { al: "C", meio: true, cor: o.cor, attr: o.attr });
      var tx = px - Math.max(-w / 2, Math.min(w / 2, -dx)) , ty = py - (dy > 0 ? 1 : -1) * h * 0.55;
      D.linha(cx, cy, tx, ty, "EST-ARM-CHAMADA"); void d;
      return true;
    }
    return false;
  }
  function folhaForma(D, c, geo, nivel) {
    var a = geo.area, E = D.E, T2 = E.T, Ib = II(), pl = planoDe(D, c, geo, nivel);
    var nome = nomeNivel(c, nivel);
    Ib.tituloVista(D, a.x + 4, a.y + 2, "FÔRMA — " + nome + " (" + nivTxt(nivel) + ")", pl ? "ESC 1:" + pl.esc : "");
    if (!pl) { T(D, a.x + 10, a.y + 30, "Nível sem peças lançadas.", T2.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var f = pl.f;
    D.abreBloco("FORMA-" + dois(Math.round(nivel * 10)), pl.esc, a.x, a.y + 14, a.w, a.h - 14);
    plantaFundo(D, c, nivel, f, {});
    gradeEixos(D, c, f, pl.ext, 14);
    /* lajes: nome, h e tipo no centro */
    c.lajesTodas.filter(function (l) { return Math.abs(l.topo - nivel) < 0.02; }).forEach(function (l) {
      var cx = 0, cz = 0; l.poli.forEach(function (q) { cx += q.x / l.poli.length; cz += q.z / l.poli.length; }); var C = f(cx, cz), rep = c.reprov.laje[l.nome] || c.reprov["laje-sem-calculo"][l.nome];
      T(D, C[0], C[1] - 0.8, l.nome, T2.pilar, { al: "C", cor: rep ? VERMELHO : null, attr: ' data-laje="' + Ib.esc(l.nome) + '"' });
      T(D, C[0], C[1] + T2.nota * 1.5, "h=" + Math.round(l.h) + " " + (l.tipo || "") + "  " + nivTxt(l.topo), T2.nota, { al: "C" });
    });
    /* pilares: nome e seção — um rótulo por posição (o que chega e o que nasce no mesmo lugar dividem o rótulo) */
    var posP = {}, ordP = [];
    c.pilaresTodos.filter(function (p) { return Math.abs(p.top - nivel) < 0.02 || Math.abs(p.base - nivel) < 0.02; }).forEach(function (p) {
      var k = Math.round(p.cx * 100) + "," + Math.round(p.cz * 100); if (!posP[k]) { posP[k] = []; ordP.push(k); } posP[k].push(p);
    });
    ordP.forEach(function (k) {
      /* um rótulo por lance, com o nível: "P5 26/14 até +2,80m" (o que chega) e "P5 26/19 de +2,80m" (o que nasce) */
      var ps = posP[k].slice().sort(function (p1, p2) { return (Math.abs(p2.top - nivel) < 0.02 ? 1 : 0) - (Math.abs(p1.top - nivel) < 0.02 ? 1 : 0); }), p = ps[0], C0 = f(p.cx, p.cz);
      ps.forEach(function (q, i) {
        var chega = Math.abs(q.top - nivel) < 0.02, rep = c.reprov.pilar[q.nome], t1 = q.nome + " " + secStr(q.b, q.hh) + (chega ? " até " : " de ") + nivTxt(nivel);
        rotuloComChamada(D, C0[0], C0[1], t1, T2.pilar, { attr: ' data-rotulo-pilar="' + Ib.esc(q.nome) + '" data-lance="' + (chega ? "chega" : "nasce") + '"', cor: rep ? VERMELHO : null, fase: 45 + 180 * i });
      });
    });
    /* vigas: nome e seção ao lado do eixo (fora da faixa da viga e da linha de eixo) */
    c.vigasTodas.filter(function (v) { return Math.abs(v.y - nivel) < 0.02; }).forEach(function (v) {
      var A0 = f(v.A.x, v.A.z), B0 = f(v.B.x, v.B.z), dx = B0[0] - A0[0], dy = B0[1] - A0[1], d = Math.sqrt(dx * dx + dy * dy) || 1, rep = c.reprov.viga[v.nome];
      var ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang > 90.01) ang -= 180; if (ang < -89.99) ang += 180;
      var ra = ang * Math.PI / 180;
      colocarTexto(D, (A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2, v.nome + " " + secStr(v.b, v.h), T2.marca, ang, -Math.sin(ra), Math.cos(ra), { attr: ' data-rotulo-viga="' + Ib.esc(v.nome) + '"', cor: rep ? VERMELHO : null, len: d });
    });
    D.fechaBloco();
    var yl = a.y + a.h - 24;
    D.ret(a.x + 6, yl, 5, 3.4, "EST-FORMA-CORTE"); D.hachura(a.x + 6, yl, 5, 3.4, 1.0, "EST-HACHURA"); T(D, a.x + 13, yl + 2.7, "pilar que MORRE neste nível (chega ao respaldo)", T2.nota);
    D.ret(a.x + 6, yl + 6, 5, 3.4, "EST-FORMA-CORTE"); D.linha(a.x + 6, yl + 6, a.x + 11, yl + 9.4, "EST-HACHURA"); D.linha(a.x + 11, yl + 6, a.x + 6, yl + 9.4, "EST-HACHURA"); T(D, a.x + 13, yl + 8.7, "pilar que NASCE neste nível (parte do respaldo para cima)", T2.nota);
    return { escala: "1:" + pl.esc };
  }
  function folhaLajes(D, c, geo, nivel, modo) {
    var a = geo.area, E = D.E, T2 = E.T, Ib = II(), pl = planoDe(D, c, geo, nivel), nome = nomeNivel(c, nivel), neg = modo === "neg";
    Ib.tituloVista(D, a.x + 4, a.y + 2, "ARMAÇÃO DE LAJES — ARMADURA " + (neg ? "NEGATIVA" : "POSITIVA") + " — " + nome + " (" + nivTxt(nivel) + ")", pl ? "ESC 1:" + pl.esc : "");
    if (!pl) { T(D, a.x + 10, a.y + 30, "Nível sem lajes.", T2.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var f = pl.f, k = 10 / pl.esc, lajes = c.lajes.filter(function (l) { return Math.abs(l.topo - nivel) < 0.02; });
    D.abreBloco("LAJES-" + (neg ? "NEG" : "POS") + "-" + dois(Math.round(nivel * 10)), pl.esc, a.x, a.y + 14, a.w, a.h - 14);
    plantaFundo(D, c, nivel, f, { contexto: true });
    gradeEixos(D, c, f, pl.ext, 14);
    var lastro = [];
    lajes.forEach(function (l) {
      var G = lajeGeom(l); if (!G) { c.avisos.push("Laje " + l.nome + ": não retangular, armadura não desenhada."); return; }
      l.posicoes.filter(function (p) { return (/negativ/.test(p.tipo)) === neg; }).forEach(function (p) { lastro.push(barraLaje(D, c, l, G, p, f, pl.esc, k)); });
    });
    lajes.forEach(function (l) {
      var cx = 0, cz = 0; l.lm.poli.forEach(function (q) { cx += q.x / 4; cz += q.z / 4; }); var C = f(cx, cz), rep = l.reprovada;
      colocarTexto(D, C[0], C[1], l.nome + "  h=" + Math.round(l.h), T2.pilar, 0, 0, -1, { cor: rep ? VERMELHO : null, attr: ' data-laje="' + Ib.esc(l.nome) + '"' });
    });
    D.fechaBloco();
    var yl = a.y + a.h - 20;
    T(D, a.x + 6, yl, "Uma barra representativa por faixa; a seta dupla marca a faixa (quantidade × espaçamento). Ganchos em " + (neg ? "mm ao lado da perna." : "traço curto nas pontas."), T2.nota);
    return { escala: "1:" + pl.esc };
  }
  /* espaço da coluna do carimbo: lista de notas e blocos */
  function blocosNotas(c, op, tipo) {
    var pj = c.pac.projeto || {}, fck = pj.fck || (c.an.modelo && c.an.modelo.fck) || "?", caa = pj.caa || "?", PDm = PD(), base = PDm.normPadrao(PDm.padraoRA());
    var cobs = [];
    if (c.vigas[0]) cobs.push("vigas " + brn(c.vigas[0].cob, 1) + " cm"); if (c.pilares[0]) cobs.push("pilares " + brn(num(c.pilares[0].entrada.cobrimento, COB_PADRAO), 1) + " cm"); if (c.lajes[0] && c.lajes[0].r.entrada) cobs.push("lajes " + brn(c.lajes[0].r.entrada.cobrimentoPos, 1) + " cm");
    var notas = arr(base.notas_gerais_padrao).map(function (s) { return String(s).replace("{fck}", fck).replace("{caa}", caa).replace("{cobrimentos}", cobs.join("; ")).replace(/;?\s*a\/c ≤ \{ac\};?/, ";"); });
    notas.push("Cálculo de apoio — o engenheiro responsável confere e assina (ART). Sem a assinatura a prancha não vale para execução.");
    notas.push("Cada posição vem do detalhamento do cálculo (C5): mesma bitola, quantidade e comprimento na tabela e no desenho. Comprimentos sem acréscimo de curva.");
    var imp = [];
    if (c.bloqueado) imp.push({ t: "NÃO LIBERADO — " + c.reprovadas.length + " peça(s) reprovada(s)/incompleta(s) no cálculo: " + c.reprovadas.slice(0, 6).map(function (r) { return r.nome; }).join(", ") + (c.reprovadas.length > 6 ? "…" : "") + ". Não executar.", cor: VERMELHO });
    var bl = []; if (imp.length) bl.push({ titulo: "NÃO EMITIR PARA EXECUÇÃO", cor: VERMELHO, itens: imp });
    bl.push({ titulo: "NOTAS", numerar: true, itens: notas }, { titulo: "NORMAS UTILIZADAS", itens: ["NBR 6118:2023 e Emenda 1:2026", "NBR 7480 (aço), NBR 6120:2019, NBR 6123:2023", "NBR 8403 e NBR 7191 (desenho técnico)"] });
    void op; void tipo;
    return bl;
  }
  function alturaNotas(E, geo, blocos) {
    var Dm = novoD(E, null); II().colunaNotas(Dm, geo, blocos);
    var y0 = geo.carimbo.y; Dm.tb.forEach(function (q) { q.forEach(function (p) { if (p[1] < y0) y0 = p[1]; }); });
    return y0;
  }
  function montarTabela(Fd, geo, tab, yMax) {
    var col = geo.coluna, x = col.x + 4, y = col.y + 4, T2 = Fd.E.T, Ib = II();
    var t = Fd.tabela(x, y, tab.cols, tab.linhas, {}), yy = y + t.h + 5;
    Fd.texto(x, yy + T2.tabelaCab * 0.76, "RESUMO AÇO CA 50-60", T2.tabelaCab, { peso: 0.14 });
    var r = Fd.tabela(x, yy + T2.tabelaCab * 1.5, tab.resumoCols, tab.resumoLinhas, {}), y3 = yy + T2.tabelaCab * 1.5 + r.h + 3.6;
    ["50A", "60B"].forEach(function (k) { if (tab.pesoPor[k] != null) { Fd.texto(x, y3 + T2.tabela * 0.76, "Peso Total " + k + " = " + Math.round(tab.pesoPor[k]) + " kg", T2.tabela); y3 += T2.tabela * 1.6; } });
    if (tab.volM3 > 0) { Fd.texto(x, y3 + T2.tabela * 0.76, "Volume de Concreto = " + brn(tab.volM3, 2) + " m3", T2.tabela); y3 += T2.tabela * 1.6; }
    void yMax; void Ib;
    return y3;
  }
  function alturaTabela(E, tab) {
    var Dm = novoD(E, null), T2 = E.T, t = Dm.tabela(0, 0, tab.cols, tab.linhas, {}), r = Dm.tabela(0, 0, tab.resumoCols, tab.resumoLinhas, {});
    return t.h + 5 + T2.tabelaCab * 1.5 + r.h + 3.6 + T2.tabela * 1.6 * (2 + 1) + 2;
  }
  function elemsVigas(vs) { return vs.map(function (v) { return { titulo: v.nome + " " + secStr(v.b, v.h), posicoes: v.posicoes, vol: v.b * v.h * v.L / 1e6, ref: v.nome }; }); }
  function elemsPilares(gs) { var o = []; gs.forEach(function (g) { g.lances.forEach(function (l, i) { o.push({ titulo: l.nome + " Lance " + (i + 1) + " (" + nivTxt(l.base) + " a " + nivTxt(l.top) + ")", posicoes: l.posicoes, vol: l.hx * l.hy * num(l.entrada.LCm, 0) / 1e6, ref: l.nome }); }); }); return o; }

  /* A1 sempre que a planta cabe até 1:100 (com a coluna do carimbo); senão A0 */
  function formatoAuto(c, P) {
    var g = P.geometria("A1", "paisagem", "RA"), a = g.area, pior = false;
    c.niveis.forEach(function (y) { var e = extensao(c, y); if (e && ((e.x1 - e.x0) * 10 + 70 > a.w || (e.z1 - e.z0) * 10 + 76 > a.h)) pior = true; });
    return pior ? "A0" : "A1";
  }
  /* ---------------------------------------------------------------- gerar */
  function gerar(pac, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], P = PR(), Ib = II(), dt = DT();
    if (!Ib || !P || !P.carimboRA || !PD() || !dt) return { ok: false, folhas: [], avisos: ["Os motores das pranchas (madpranchas/prancha/padraodet/concdetalhe) não carregaram."] };
    if (!pac || !pac.an || !pac.an.modelo) return { ok: false, folhas: [], avisos: ["Sem o resultado do Calcular: as pranchas saem do cálculo."] };
    var c = modelo(pac, opcoes), E = estilo(opcoes.padrao), formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : formatoAuto(c, P), geo = P.geometria(formato, "paisagem", "RA");
    var codigo = txt(opcoes.codigo).trim() || "EST-CONC", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    c.avisos.forEach(function (x) { avisos.push(x); });
    var blocos = blocosNotas(c, opcoes), yNotas = alturaNotas(E, geo, blocos), col = geo.coluna, tabMax = yNotas - 3 - (col.y + 4), a = geo.area, specs = [];
    /* ---- fôrma por nível ---- */
    c.niveis.forEach(function (y) { specs.push({ tipo: "forma", id: "forma-" + nivTxt(y), titulo: "FÔRMA — " + nomeNivel(c, y) + " (" + nivTxt(y) + ")", nivel: y, desenhar: function (D) { return folhaForma(D, c, geo, y); }, elems: [], pecas: [] }); });
    /* ---- vigas: blocos medidos e empacotados com o limite da tabela ---- */
    var areaV = { w: a.w - 4, h: a.h - 20 };
    var mV = c.vigas.map(function (v) { var D0 = novoD(E, null), r = blocoViga(D0, c, v, 0, 0); return { v: v, w: r.w, h: r.h, el: elemsVigas([v])[0] }; });
    var folhasV = distribuir(mV, areaV, 6, function (set) { return set.length <= MAX_VIGAS_FOLHA && alturaTabela(E, tabelaDe(set.map(function (q) { return q.el; }), opcoes.perda)) <= tabMax; });
    folhasV.forEach(function (fv, i) {
      specs.push({ tipo: "vigas", id: "vigas-" + dois(i + 1), titulo: "ARMAÇÃO DE VIGAS (" + (i + 1) + "/" + folhasV.length + ")", elems: fv.itens.map(function (q) { return q.it.el; }), pecas: fv.itens.map(function (q) { return q.it.v.nome; }),
        desenhar: function (D) { Ib.tituloVista(D, a.x + 4, a.y + 2, "ARMAÇÃO DE VIGAS (" + (i + 1) + "/" + folhasV.length + ")", "ESC 1:" + ESC.viga + " · cortes 1:" + ESC.corte + " · estribo 1:" + ESC.estribo); fv.itens.forEach(function (q) { blocoViga(D, c, q.it.v, a.x + 2 + q.x, a.y + 18 + q.y); }); return { escala: "1:" + ESC.viga }; } });
    });
    /* ---- lajes: positiva e negativa por nível ---- */
    c.niveis.forEach(function (y) {
      var ls = c.lajes.filter(function (l) { return Math.abs(l.topo - y) < 0.02; }); if (!ls.length) return;
      ["pos", "neg"].forEach(function (modo) {
        var eh = function (p) { return (/negativ/.test(p.tipo)) === (modo === "neg"); }, el = [];
        ls.forEach(function (l) { var ps = l.posicoes.filter(eh); if (ps.length) el.push({ titulo: l.nome + " h=" + Math.round(l.h), posicoes: ps, vol: modo === "pos" ? l.r.entrada.lx * l.r.entrada.ly * l.r.entrada.h / 100 : 0, ref: l.nome }); });
        if (!el.length) return;
        specs.push({ tipo: modo === "pos" ? "laje-positiva" : "laje-negativa", id: "laje-" + modo + "-" + nivTxt(y), titulo: "ARMAÇÃO DE LAJES — " + (modo === "pos" ? "POSITIVA" : "NEGATIVA") + " — " + nomeNivel(c, y) + " (" + nivTxt(y) + ")", nivel: y, elems: el, pecas: ls.map(function (l) { return l.nome; }), desenhar: function (D) { return folhaLajes(D, c, geo, y, modo); } });
      });
    });
    /* ---- pilares: uma coluna por pilar ---- */
    var gp = gruposDePilares(c), areaP = { w: a.w - 4, h: a.h - 20 };
    var mP = gp.map(function (g) { var D0 = novoD(E, null), r = blocoPilarColuna(D0, c, g, 0, 0); return { g: g, w: r.w, h: r.h, el: elemsPilares([g]) }; });
    var folhasP = distribuir(mP, areaP, 8, function (set) { var el = []; set.forEach(function (q) { q.el.forEach(function (e) { el.push(e); }); }); return alturaTabela(E, tabelaDe(el, opcoes.perda)) <= tabMax; });
    folhasP.forEach(function (fp, i) {
      var el = []; fp.itens.forEach(function (q) { q.it.el.forEach(function (e) { el.push(e); }); });
      specs.push({ tipo: "pilares", id: "pilares-" + dois(i + 1), titulo: "ARMAÇÃO DE PILARES (" + (i + 1) + "/" + folhasP.length + ")", elems: el, pecas: fp.itens.map(function (q) { return q.it.g.nome; }),
        desenhar: function (D) { Ib.tituloVista(D, a.x + 4, a.y + 2, "ARMAÇÃO DE PILARES (" + (i + 1) + "/" + folhasP.length + ")", "ESC 1:" + ESC.pilar + " · seção 1:" + ESC.pilarSecao); fp.itens.forEach(function (q) { blocoPilarColuna(D, c, q.it.g, a.x + 2 + q.x, a.y + 18 + q.y); }); return { escala: "1:" + ESC.pilar }; } });
    });
    /* ---- o carimbo (RA, intocado): sem RT e registro quando NÃO LIBERADO ---- */
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00", bloq = c.bloqueado;
    var pr = P.normalizar({ id: "concpranchas", nome: "Superestrutura de concreto - projeto executivo", formato: formato, orientacao: "paisagem", origem: "concreto",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: bloq ? "" : txt(opcoes.responsavel), registro: bloq ? "" : txt(opcoes.registro), titulo: bloq ? "" : txt(opcoes.tituloProfissional), obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario),
        contratante: txt(opcoes.contratante), local: txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || (bloq ? "EMISSÃO NÃO LIBERADA - CÁLCULO COM PEÇAS REPROVADAS" : "EMISSÃO INICIAL - PROJETO EXECUTIVO"), data]] },
      folhas: specs.map(function (s, i) { return { id: s.id, n: i + 1, conteudo: s.titulo, escala: "INDICADA", numero: codigo + " " + rev }; }) });
    var folhas = specs.map(function (s, i) {
      var D = novoD(E, opcoes.depurar ? [] : null), r = s.desenhar(D) || {}, W = geo.papel.w, H = geo.papel.h, M = geo.moldura, Fd = novoD(E, null), fl = pr.folhas[i];
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA");
      if (!Ib.colunaNotas(Fd, geo, blocos) && i === 0) avisos.push("As notas não cabem na coluna com a letra mínima do padrão: conferir.");
      var tab = s.elems.length ? tabelaDe(s.elems, opcoes.perda) : null;
      if (tab) {
        var yFim = montarTabela(Fd, geo, tab, yNotas);
        if (yFim > yNotas - 1) avisos.push("Folha " + s.id + ": a tabela de aço encosta nas notas da coluna.");
      }
      if (bloq) Fd.texto(col.x + 4, geo.carimbo.y - 3.4, "SEM ASSINATURA — NÃO LIBERADO", E.T.tabelaCab, { cor: VERMELHO, peso: 0.2 });
      var rotuloFolha = dois(i + 1) + "/" + dois(specs.length);
      Ib.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, rotuloFolha);
      var numero = codigo + "-E" + dois(i + 1);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Ib.n(W) + 'mm" height="' + Ib.n(H) + 'mm" viewBox="0 0 ' + Ib.n(W) + " " + Ib.n(H) + '" font-family="' + Ib.FONTE + '" data-folha="' + s.id + '" data-numero="' + Ib.esc(numero) + '">' +
        "<title>" + Ib.esc(numero + " - " + s.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + Ib.n(W) + '" height="' + Ib.n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + '</g><g data-folha-moldura="1">' + Fd.svg() + "</g>" +
        '<text x="' + Ib.n(W / 2) + '" y="7.4" font-size="' + (bloq ? "4.4" : "3") + '" text-anchor="middle" fill="' + (bloq ? VERMELHO : "#c00000") + '" data-faixa="1" data-cam="EST-PEND">' + Ib.esc(bloq ? "NÃO LIBERADO — " + c.reprovadas.length + " peça" + (c.reprovadas.length > 1 ? "s" : "") + " reprovada" + (c.reprovadas.length > 1 ? "s" : "") + "/incompleta" + (c.reprovadas.length > 1 ? "s" : "") + " no cálculo — " + FAIXA : FAIXA) + "</text></svg>";
      var o = { id: s.id, tipo: s.tipo, numero: numero, titulo: s.titulo, formato: formato, escala: r.escala || "INDICADA", svg: svg, pecas: s.pecas, elementos: s.elems.map(function (e) { return e.titulo; }), rotuloCarimbo: rotuloFolha };
      if (tab) { o.tabela = { cols: tab.cols, linhas: tab.linhas }; o.resumo = { linhas: tab.resumoLinhas, pesoPor: tab.pesoPor, totalKg: tab.totalKg, totalKgComPerda: tab.totalKgComPerda, volM3: tab.volM3 }; o.posicoes = tab.posicoes; o.tabelaAco = tab.tabelaAco; }
      if (opcoes.depurar) { o.caixasTexto = D.caixas; o.segmentos = D.sg; }
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    /* totais: o que as pranchas somam tem de fechar com o C5 */
    var todas = []; folhas.forEach(function (f) { arr(f.posicoes).forEach(function (p) { todas.push(p); }); });
    var tot = dt.tabelaAco(todas, { perda: opcoes.perda }), c5 = c.det.tabela, ids = {}, falta = [];
    todas.forEach(function (p) { ids[p.elemento + "|" + (p.idOrig || p.id)] = 1; }); arr(c.det.posicoes).forEach(function (p) { if (!ids[p.elemento + "|" + p.id]) falta.push(p.elemento + " " + p.id); });
    if (falta.length) avisos.push("Posições do detalhamento que não saíram em prancha: " + falta.slice(0, 8).join(", ") + (falta.length > 8 ? "…" : ""));
    if (c5 && Math.abs(tot.totalKg - c5.totalKg) > 0.01) avisos.push("O aço das pranchas (" + brn(tot.totalKg, 2) + " kg) não fecha com o do detalhamento C5 (" + brn(c5.totalKg, 2) + " kg).");
    c.avisos.concat(arr(c.det.avisos).slice(0, 0)).forEach(function () { /* já tratados */ });
    return { ok: true, folhas: folhas, avisos: avisos, bloqueado: bloq, reprovadas: c.reprovadas, resumo: { totalKg: tot.totalKg, totalKgComPerda: tot.totalKgComPerda, porAco: tot.porAco, resumo: tot.resumo, perda: tot.perda, c5Kg: c5 ? c5.totalKg : null, faltando: falta }, tabela: tot, posicoes: todas, codigo: codigo, revisao: rev, formato: formato, nomeBase: "pranchas-estrutura-concreto" + (bloq ? "-NAO-LIBERADO" : "") };
  }

  /* ================================================================ A PEÇA SOZINHA (painel da Vista de Estrutura): o MESMO desenho da prancha + a tabela de aço dela */
  function acharPeca(c, ref) {
    var s = txt(ref), r = null;
    c.vigas.forEach(function (v) { if (!r && (v.id === s || v.nome === s)) r = { tipo: "viga", v: v }; });
    c.pilares.forEach(function (p) { if (!r && (p.id === s || p.nome === s)) r = { tipo: "pilar", p: p }; });
    c.lajes.forEach(function (l) { if (!r && (l.id === s || l.nome === s)) r = { tipo: "laje", l: l }; });
    return r;
  }
  function pecaSvg(pac, ref, opcoes) {
    opcoes = opcoes || {};
    var Ib = II(); if (!Ib || !pac || !pac.an || !pac.an.modelo) return { ok: false, motivo: "Sem o resultado do Calcular." };
    var c = modelo(pac, opcoes), E = estilo(opcoes.padrao), pc = acharPeca(c, ref); if (!pc) return { ok: false, motivo: "Peça sem detalhamento no último cálculo: " + txt(ref) };
    var D = novoD(E, opcoes.depurar ? [] : null), el, r, titulo, rep = false, pos = 6;
    if (pc.tipo === "viga") { r = blocoViga(D, c, pc.v, pos, pos); el = elemsVigas([pc.v])[0]; titulo = "Viga " + pc.v.nome + " " + secStr(pc.v.b, pc.v.h); rep = pc.v.reprovada; }
    else if (pc.tipo === "pilar") {
      var gr = gruposDePilares(c).filter(function (g) { return g.lances.some(function (l) { return l === pc.p; }); })[0]; r = blocoPilarColuna(D, c, gr, pos, pos);
      el = { titulo: gr.nome, posicoes: [].concat.apply([], gr.lances.map(function (l) { return l.posicoes; })), vol: 0 }; titulo = "Pilar " + gr.nome; rep = gr.lances.some(function (l) { return l.reprovada; });
    } else {
      var l = pc.l, G = lajeGeom(l); if (!G) return { ok: false, motivo: "Laje " + l.nome + " não retangular: sem desenho de armação." };
      var xs = l.lm.poli.map(function (q) { return q.x; }), zs = l.lm.poli.map(function (q) { return q.z; }), esc = 50, s = 1000 / esc, x0 = Math.min.apply(null, xs), z0 = Math.min.apply(null, zs), W = (Math.max.apply(null, xs) - x0) * s, H = (Math.max.apply(null, zs) - z0) * s;
      var MG = 62, f = function (x, z) { return [pos + MG + (x - x0) * s, pos + MG + (z - z0) * s]; };   /* margem: os rótulos das negativas saem para fora do contorno */
      Ib = II(); D.abreBloco(l.nome + "-ARM", esc, pos, pos, W + 2 * MG, H + 2 * MG);
      D.poli(l.lm.poli.map(function (q) { return f(q.x, q.z); }), "EST-FORMA-VISTA", true);
      l.posicoes.forEach(function (p) { barraLaje(D, c, l, G, p, f, esc, 10 / esc); });
      var C = f((x0 + Math.max.apply(null, xs)) / 2, (z0 + Math.max.apply(null, zs)) / 2); colocarTexto(D, C[0], C[1], l.nome + "  h=" + Math.round(l.h), E.T.pilar, 0, 0, -1, {});
      D.fechaBloco();
      r = { w: W + 2 * MG, h: H + 2 * MG }; el = elemsLaje(l); titulo = "Laje " + l.nome + " h=" + Math.round(l.h); rep = l.reprovada;
    }
    var tab = tabelaDe([el], opcoes.perda), yT = pos + r.h + 8, t = D.tabela(pos, yT, tab.cols, tab.linhas, {}), wT = t.w, hT = t.h;
    D.texto(pos, pos + r.h + 4.5, titulo + " — tabela de aço", E.T.tabelaCab, { peso: 0.14 });
    var W2 = Math.max(r.w, wT) + 2 * pos, H2 = yT + hT + pos;
    if (rep) D.texto(pos, 3.4, "PEÇA NÃO LIBERADA — reprovada ou incompleta no cálculo", E.T.nota, { cor: VERMELHO });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Ib.n(W2) + 'mm" height="' + Ib.n(H2) + 'mm" viewBox="0 0 ' + Ib.n(W2) + " " + Ib.n(H2) + '" font-family="' + Ib.FONTE + '" data-peca="' + Ib.esc(titulo) + '"><rect x="0" y="0" width="' + Ib.n(W2) + '" height="' + Ib.n(H2) + '" fill="#fff"/><g data-corpo="1">' + D.svg() + "</g></svg>";
    return { ok: true, svg: svg, titulo: titulo, tipo: pc.tipo, naoLiberado: rep, tabela: { cols: tab.cols, linhas: tab.linhas }, posicoes: tab.posicoes, pesoKg: tab.totalKg, resumo: { linhas: tab.resumoLinhas, pesoPor: tab.pesoPor }, w: W2, h: H2, caixasTexto: opcoes.depurar ? D.caixas : null };
  }
  function elemsLaje(l) { return { titulo: l.nome + " h=" + Math.round(l.h), posicoes: l.posicoes, vol: l.r.entrada.lx * l.r.entrada.ly * l.r.entrada.h / 100, ref: l.nome }; }
  /* a peça que está sob o clique: aceita o id do pré-lançamento ("cp-p0-0_6"), o id da barra/laje do modelo ou a marca ("V101") */
  function pecasDisponiveis(pac, opcoes) {
    var c = modelo(pac, opcoes || {}), o = [];
    c.vigas.forEach(function (v) { o.push({ tipo: "viga", id: v.id, nome: v.nome }); }); c.pilares.forEach(function (p) { o.push({ tipo: "pilar", id: p.id, nome: p.nome }); }); c.lajes.forEach(function (l) { o.push({ tipo: "laje", id: l.id, nome: l.nome }); });
    return o;
  }

  /* ================================================================ SAÍDAS: PDF, CAD (DXF/DWG), planilha */
  function pdf(r) {
    var S = dep("SvgPdf", "./svgpdf.js"); if (!r || !r.ok || !S) return null;
    return S.pdf(r.folhas.map(function (f) { return f.svg; }), { titulo: "Pranchas da estrutura de concreto" });
  }
  var PERFIL_EST = null;
  function perfilEst() {
    if (PERFIL_EST) return PERFIL_EST;
    var BC = dep("BimCad", "./bimcad.js"), g = BC && BC.PERFIS && BC.PERFIS.geral; if (!g) return null;
    PERFIL_EST = { id: "estrutural-concreto", ctbNome: "RA_Estrutural.ctb", dxfNome: "ESTRUTURA_CONCRETO.dxf", titulo: "PRANCHAS DA ESTRUTURA DE CONCRETO",
      descricao: "RA Engenharia - estrutura de concreto (padrao de detalhamento v2.0, TQS): cor ACI = pena. Preto ACI 1-6/8/9 pela espessura, ACI 30 = 0,60 mm (barra desdobrada), 7 = texto; vermelho = pendencia (NAO LIBERADO).",
      paleta: g.paleta, cheios: g.cheios, cinzas: g.cinzas, neutros: g.neutros, pretasExtra: [{ aci: 30, lw: 60 }] };
    return PERFIL_EST;
  }
  function paraCad(r, op) {
    op = op || {}; var C = CD(), P = perfilEst(); if (!C || !P || !r || !r.ok || !arr(r.folhas).length) return null;
    var o = C.paraCad({ ok: true, folhas: r.folhas }, { perfil: P, dxfNome: op.dxfNome, dwgNome: op.dwgNome, ctbNome: op.ctbNome, hachuraGeometria: op.hachuraGeometria });
    if (!o) return null;
    o.leiame = C.leiame(o); o.bloqueado = !!r.bloqueado;
    return o;
  }
  function zip(o) { var Z = dep("BimBcf", "./bimbcf.js"); if (!o || !Z || !Z.zipEscrever) return null; var arq = {}; arq[o.dxfNome] = o.dxf; arq[o.ctbNome] = o.ctb; arq["LEIA-ME.txt"] = o.leiame; return Z.zipEscrever(arq); }

  function xlsx(ExcelJS, r, opc) {
    opc = opc || {};
    if (!r || !r.ok || !ExcelJS) return null;
    var dt = DT(), bloq = !!r.bloqueado, wb = new ExcelJS.Workbook(), AZ = "FF12314F", ZB = "FFF1F6FB", BR = "FFFFFFFF", perda = r.resumo.perda != null ? r.resumo.perda : 0.1;
    wb.creator = "OrçaPRO — pranchas da estrutura de concreto (C8)"; wb.created = new Date(); wb.bloqueado = bloq; wb.nomeArquivo = "tabela-aco-pranchas" + (bloq ? "-NAO-LIBERADO" : "") + ".xlsx";
    var AV = (bloq ? "NÃO LIBERADO — " + r.reprovadas.length + " peça(s) reprovada(s)/incompleta(s) — " : "") + "Cálculo de apoio — o engenheiro responsável confere e assina (ART)";
    function cab(ws, cols, titulo) {
      ws.getCell(1, 1).value = titulo; ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: AZ } };
      ws.getCell(2, 1).value = AV; ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FFB26A00" } };
      cols.forEach(function (c, i) { var x = ws.getCell(4, i + 1); x.value = c.h; x.font = { bold: true, color: { argb: BR } }; x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZ } }; x.alignment = { vertical: "middle", horizontal: c.num ? "right" : "left", wrapText: true }; ws.getColumn(i + 1).width = c.w; });
      ws.views = [{ state: "frozen", ySplit: 4 }];
      if (bloq) { ws.headerFooter = { oddHeader: '&C&"Arial,Bold"&20&KA3352B NÃO LIBERADO', evenHeader: '&C&"Arial,Bold"&20&KA3352B NÃO LIBERADO' }; ws.getCell(3, 1).value = "NÃO LIBERADO"; ws.getCell(3, 1).font = { bold: true, color: { argb: "FFA3352B" } }; }
    }
    function linha(ws, rr, cols, vals) { cols.forEach(function (c, i) { var x = ws.getCell(rr, i + 1); x.value = vals[i]; if (c.fmt) x.numFmt = c.fmt; if (rr % 2 === 0) x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZB } }; }); }
    var w1 = wb.addWorksheet("Resumo"), c1 = [{ h: "Aço", w: 10 }, { h: "φ (mm)", w: 10, num: true }, { h: "Massa linear (kg/m)", w: 18, num: true, fmt: "0.000" }, { h: "Comprimento (m)", w: 16, num: true, fmt: "#,##0.00" }, { h: "Massa (kg)", w: 14, num: true, fmt: "#,##0.00" }, { h: "Massa com perda (kg)", w: 20, num: true, fmt: "#,##0.00" }];
    cab(w1, c1, "Pranchas da estrutura — resumo do aço por bitola (soma de todas as pranchas)");
    r.resumo.resumo.forEach(function (q, i) { var x = 5 + i; linha(w1, x, c1, [q.aco, q.phi, q.massaLinear, q.comprimentoM, { formula: "D" + x + "*C" + x, result: q.comprimentoM * q.massaLinear }, { formula: "E" + x + "*(1+" + perda + ")", result: q.comprimentoM * q.massaLinear * (1 + perda) }]); });
    var u1 = 4 + r.resumo.resumo.length; w1.getCell(u1 + 1, 1).value = "TOTAL"; w1.getCell(u1 + 1, 1).font = { bold: true };
    w1.getCell(u1 + 1, 5).value = { formula: "SUM(E5:E" + u1 + ")", result: r.resumo.totalKg }; w1.getCell(u1 + 1, 6).value = { formula: "SUM(F5:F" + u1 + ")", result: r.resumo.totalKgComPerda }; w1.getCell(u1 + 1, 5).numFmt = w1.getCell(u1 + 1, 6).numFmt = "#,##0.00";
    w1.getCell(u1 + 3, 1).value = "O desenho traz o peso SEM perda (Padrão RA v2.0 / TQS); a perda de " + Math.round(perda * 100) + " % fica aqui e no orçamento."; w1.getCell(u1 + 3, 1).font = { italic: true };
    var w2 = wb.addWorksheet("Por prancha"), c2 = [{ h: "Prancha", w: 16 }, { h: "Título", w: 70 }, { h: "Elementos", w: 60 }, { h: "Posições", w: 10, num: true }, { h: "Massa (kg)", w: 14, num: true, fmt: "#,##0.00" }];
    cab(w2, c2, "Aço por prancha"); var k2 = 5;
    r.folhas.forEach(function (f) { if (!f.tabelaAco) return; linha(w2, k2, c2, [f.numero, f.titulo, arr(f.pecas).join(", "), arr(f.posicoes).length, f.tabelaAco.totalKg]); k2++; });
    w2.getCell(k2, 1).value = "TOTAL"; w2.getCell(k2, 1).font = { bold: true }; w2.getCell(k2, 5).value = { formula: "SUM(E5:E" + (k2 - 1) + ")", result: r.resumo.totalKg }; w2.getCell(k2, 5).numFmt = "#,##0.00";
    r.folhas.forEach(function (f, fi) {
      if (!f.tabelaAco) return;
      var ws = wb.addWorksheet(("P" + dois(fi + 1) + " " + f.tipo).slice(0, 31)), cs = [{ h: "Elemento", w: 24 }, { h: "Pos", w: 7 }, { h: "Descrição", w: 44 }, { h: "Aço", w: 8 }, { h: "φ (mm)", w: 8, num: true }, { h: "Quant.", w: 8, num: true }, { h: "C unit. (cm)", w: 12, num: true, fmt: "#,##0" }, { h: "C total (m)", w: 12, num: true, fmt: "#,##0.00" }, { h: "Massa (kg)", w: 12, num: true, fmt: "#,##0.00" }];
      cab(ws, cs, f.numero + " — " + f.titulo);
      f.tabelaAco.linhas.forEach(function (l, i) { var x = 5 + i; linha(ws, x, cs, [l.elemento, l.id, l.nome, l.aco, l.phi, l.qtd, l.comprimentoCm, { formula: "F" + x + "*G" + x + "/100", result: l.totalM }, { formula: "H" + x + "*" + (0.006165 * l.phi * l.phi), result: l.kg }]); });
      var u = 4 + f.tabelaAco.linhas.length; ws.getCell(u + 1, 1).value = "TOTAL"; ws.getCell(u + 1, 1).font = { bold: true }; ws.getCell(u + 1, 9).value = { formula: "SUM(I5:I" + u + ")", result: f.tabelaAco.totalKg }; ws.getCell(u + 1, 9).numFmt = "#,##0.00"; ws.getCell(u + 1, 9).font = { bold: true };
    });
    void dt; void opc;
    return wb;
  }

  /* conferência de sobreposição (texto × texto): precisa de gerar(pac, { depurar: true }) */
  function conferirSobreposicao(r) {
    var MP = MPm(), out = [];
    arr(r && r.folhas).forEach(function (f) { if (!f.caixasTexto) return; MP.sobreposicoes(f.caixasTexto, 0.15).forEach(function (q) { out.push({ folha: f.numero, a: q[0], b: q[1] }); }); });
    return out;
  }
  function pacoteDe(res) { var M = MEM(); return M && M.pacoteDe ? M.pacoteDe(res) : null; }

  var ConcPranchas = { VERSAO: 1, ESC: ESC, FAIXA: FAIXA, gerar: gerar, pecaSvg: pecaSvg, pecasDisponiveis: pecasDisponiveis, pdf: pdf, paraCad: paraCad, zip: zip, xlsx: xlsx, conferirSobreposicao: conferirSobreposicao, pacoteDe: pacoteDe, perfil: perfilEst,
    _i: { modelo: modelo, estilo: estilo, novoD: novoD, tabelaDe: tabelaDe, barraTxt: barraTxt, estriboTxt: estriboTxt, barraEspTxt: barraEspTxt, rotuloGenerico: rotuloGenerico, lajeGeom: lajeGeom, gruposDePilares: gruposDePilares, blocoViga: blocoViga, nomeNivel: nomeNivel } };
  global.ConcPranchas = ConcPranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcPranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
