/* =====================================================================
 * madmanual.js — MANUAL DE MONTAGEM da estrutura de madeira (livro enxuto
 * A3 paisagem), gerado a partir do resultado do orquestrador
 * (MadDimensionar.calcular) e da fonte de peças. Motor PURO, ES5, sem DOM
 * e sem biblioteca externa (Node e navegador).
 *
 *   MadManual.gerar(resultado, opcoes) → { ok, html, paginas, etapas, avisos, camera }
 *
 * Molde APROVADO pelo Rogério em 11/10/2026: o livro enxuto do Quiosque
 * (Livro do Projeto ENXUTO A3 da emissão R03, gerado por livro_enxuto.py).
 * O livro completo de 61 páginas foi REPROVADO por "poluído". Regras que não
 * se afrouxam:
 *   · capa, sumário, como ler, UMA ETAPA POR PÁGINA, tabela resumida no fim;
 *   · ilustração grande e limpa: peças da etapa em cor, o já montado em
 *     cinza, a MESMA câmera em todas as páginas (matriz de vista única e o
 *     mesmo recorte do conjunto), legenda de cores fixa;
 *   · 3 a 5 frases por etapa; peças / onde vão / como fixar tiradas da fonte;
 *     "ver folha X" em vez de prancha densa;
 *   · SEM página de pendências nem termo, sem número de ART; o que precisa de
 *     cuidado sai como "Atenção";
 *   · vidro laminado nos dois níveis da cobertura.
 * Ordem das etapas = fases de montagem da fonte (campo etapa_montagem das
 * peças, M05 → M12: piso seco → pilares → painéis → cobertura 1 → forro →
 * cobertura 2), com os apoios antes, o travamento depois da cobertura que
 * "libera o contraventamento" e o ripado e as camadas depois da madeira.
 *
 * Novo em 12/10/2026 (pedido do Rogério): cada etapa cita os PRODUTOS reais
 * do catálogo (MadCatalogo: fabricante, código, página e link — só o que está
 * no catálogo, nunca link inventado) e a instalação do fabricante quando o
 * catálogo traz (Painel Wall, Evoply, membrana e fitas Eurovent, contrapiso);
 * a espécie de cada peça vem da especificação do cliente (resultado.especies,
 * MadEspecie).
 *
 * ENTRADA
 *   resultado — MadDimensionar.calcular(...) (docs/madeira/CONTRATO.md)
 *   opcoes = {
 *     fonte,            // OBRIGATÓRIA: a fonte de peças (madeira_quiosque.json) — o
 *                       // resultado só traz {id, grupo, secao_cm, volume_m3} das peças,
 *                       // sem p0/p1/dir_largura/etapa_montagem/marca
 *     catalogo?,        // MadCatalogo (padrão: global/require)
 *     cena?,            // cena da arquitetura (cena_V18.json): ripado de fachada e vidro
 *     obra: { nome, endereco, cidade, proprietario, proprietarioCnpj, contratante },
 *     documento: { numero, revisao, data, situacao?, base? },
 *     responsavel: { nome, abrev, conselho, crea, empresa, cnpj, endereco, contato? },
 *     logos?: { ra, contratante },               // data URLs
 *     folhas?: { <chave da etapa>: "02 e 07" },  // folhas das pranchas por etapa
 *     pranchas?: "PROJ-EST R03",                 // nome do jogo de pranchas
 *     camera?: { azimute: -22, elevacao: 27 }
 *   }
 * Teste: node tools/test-mad-manual.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* decisões do RT do resultado (seção/espécie trocadas — MadDimensionar.decisoesRT) aplicadas à fonte de peças */
  function fonteComDecisoes(resultado, fonte) {
    if (!fonte || !fonte.pecas) return fonte;
    var ix = {};
    ((resultado && resultado.pecas) || []).forEach(function (q) { if (q && q.decisaoRT) ix[q.id] = q; });
    if (!Object.keys(ix).length) return fonte;
    var f = {}; Object.keys(fonte).forEach(function (k) { f[k] = fonte[k]; });
    f.pecas = fonte.pecas.map(function (p) {
      var q = ix[p.id]; if (!q) return p;
      var o = {}; Object.keys(p).forEach(function (k) { o[k] = p[k]; });
      o.secao_cm = q.secao_cm; o.extensoes_m = q.extensoes_m || p.extensoes_m; o.volume_m3 = q.volume_m3; o.decisaoRT = q.decisaoRT;
      if (q.especie === "tatajuba") { o.especie = "Tatajuba (Bagassa guianensis)"; o.material = "Madeira Tatajuba (Bagassa guianensis) — DEFINIÇÃO RA 12/10/2026"; }
      if (q.especie === "itauba") { o.especie = "Itaúba (Mezilaurus itauba)"; o.material = "Madeira Itaúba (Mezilaurus itauba) — DEFINIÇÃO RA 12/10/2026"; }
      return o;
    });
    return f;
  }

  function req(nome, arq) {
    if (global[nome]) return global[nome];
    try { return typeof require === "function" ? require("./" + arq) : null; } catch (e) { return null; }
  }

  var MadManual = { versao: "MadManual 1 (12/10/2026)" };

  /* ================================================================ utilitários */
  function br(x, c) {
    c = c == null ? 2 : c;
    var s = (Math.round(x * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    var p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "−" : "") + i + (p[1] ? "," + p[1] : "");
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function nv(z) { return (z < 0 ? "−" : "+") + br(Math.abs(z), 2); }
  function nv3(z) { return (z < 0 ? "−" : "+") + br(Math.abs(z), 3); }
  function sec(s) { return s ? br(s[0], s[0] % 1 ? 1 : 0) + "×" + br(s[1], s[1] % 1 ? 1 : 0) : ""; }
  function uniq(a) { var o = [], v = {}; a.forEach(function (x) { if (!v[x]) { v[x] = 1; o.push(x); } }); return o; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function norm(a) { var n = Math.sqrt(dot(a, a)); return n > 1e-12 ? mul(a, 1 / n) : null; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function f1(x) { return (Math.round(x * 10) / 10).toString(); }

  /* ================================================================ cores (legenda fixa — as do livro aprovado) */
  var COR = {
    PILAR_PECA: "#8a4b22", PILAR_BLOQ: "#e4573b", PISO_VIGA: "#d4a528", PISO_BARROTE: "#efd187", PISO_BLOQ_VP: "#e08a3c",
    PISO_BLOQ: "#e08a3c", PISO_REQUADRO: "#e08a3c", PISO_TESTEIRA: "#b2601c", PISO_DORMENTE: "#7a4a2a", COB_INF_VIGA: "#1f6fb2",
    COB_INF_BLOQ: "#86b9e3", COB_SUP_VIGA: "#7b3fb0", COB_SUP_BLOQ: "#a77fd0", FORRO_BARROTE: "#2e9e5b", WF_MONTANTE: "#b07cc6", WF_GUIA_INF: "#5a3d8a",
    WF_GUIA_SUP: "#5a3d8a", WF_BLOQ: "#d9bfe6", WF_JACK: "#9c5bb0", WF_VERGA: "#e2792f", WF_TRAVESSA: "#ec9fb4", WF_CHAPA: "#d9c9a3",
    PW: "#c2cbd0", CONCRETO: "#a9cbbb", RIPADO: "#9c6b3c", VIDRO: "#9fd3e8", FERRAGEM: "#3a3f44"
  };
  var PALETA_EXTRA = ["#4f8a8b", "#c06c84", "#6c5b7b", "#355c7d", "#99b898", "#e8a87c"];
  var GHOST = "#dfe3e7";
  var NOME_ESPECIE = { itauba: "Itaúba", tatajuba: "Tatajuba", pinus_cca: "Pinus autoclavado (CCA)" };

  /* ================================================================ definição das etapas (ordem dentro da fase e textos)
   * grupos: grupos da FONTE montados na etapa · ligs: ligações (códigos do resultado) · prod: produtos do catálogo.
   * Os textos citam números da fonte e do catálogo (ctx); nada de número escrito à mão aqui além do que a regra diz. */
  var GRUPO_CHAVE = {
    PISO_VIGA: "vp", PISO_BARROTE: "barrotes", PISO_BLOQ_VP: "barrotes", PISO_BLOQ: "barrotes", PISO_TESTEIRA: "barrotes", PISO_REQUADRO: "barrotes",
    PISO_DORMENTE: "pw", PILAR_PECA: "pilares", PILAR_BLOQ: "pilares",
    WF_MONTANTE: "paineis", WF_GUIA_INF: "paineis", WF_GUIA_SUP: "paineis", WF_BLOQ: "paineis", WF_JACK: "paineis", WF_VERGA: "paineis",
    WF_TRAVESSA: "paineis", WF_CHAPA: "paineis", COB_INF_VIGA: "cob1", COB_INF_BLOQ: "cob1", FORRO_BARROTE: "forro", COB_SUP_VIGA: "cob2", COB_SUP_BLOQ: "cob2"
  };
  var ORDEM_CHAVE = ["vp", "barrotes", "pw", "pilares", "paineis", "cob1", "forro", "cob2"];
  /* grupo do MODELO analítico (reprovações do resultado) → grupos da fonte */
  var MODELO_FONTE = [[/^FORRO_/, /^FORRO_/], [/^COB_/, /^COB_SUP/], [/^COBINF_/, /^COB_INF/], [/^PILAR$/, /^PILAR_/], [/^GUIA_10x20$/, /^WF_GUIA_SUP$/], [/^VERGA/, /^WF_VERGA$/],
    [/^BAR_/, /^PISO_BARROTE$/], [/^VP_/, /^PISO_VIGA$/]];

  /* ================================================================ catálogo: produto → fabricante, código, página, link (só do catálogo) */
  function urlDe(txt) {
    if (!txt) return null;
    var m = /(https?:\/\/[^\s"'<>()]+|www\.[^\s"'<>(),;]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|com\.br|de|team|pl|io)\b[^\s"'<>(),;]*)/i.exec(String(txt));
    if (!m) return null;
    var t = m[1].replace(/[.;,]+$/, "");
    return { texto: t, href: /^https?:/i.test(t) ? t : "https://" + t };
  }
  /* fonte que é compilação (vidro_pesquisa.md): fabricante pelo prefixo do id do catálogo */
  var FAB_PREFIXO = { agc: "AGC Brasil", sika: "Sika", cebrace: "Cebrace", vivix: "Vivix", dow: "Dow", "3m": "3M", kuraray: "Kuraray", solufix: "Solufix", guardian: "Guardian", engevidros: "Engevidros" };
  function produtoInfo(MC, id, cfg) {
    var p = MC && MC.produto ? MC.produto(id) : null;
    if (!p) return null;
    var f = (MC.fonte && MC.fonte(p)) || {};
    var fab = p.fabricante || f.fabricante || "";
    if (/^Compila/i.test(fab)) fab = FAB_PREFIXO[String(id).split("-")[0]] || fab;
    fab = String(fab).replace(/\s*\(.*$/, "").replace(/ Produtos para Construção Ltda.*/i, "").replace(/^E\.u\.r\.o\.Tec GmbH/, "Eurotec").trim();
    var v = null;
    if (cfg && cfg.variante) v = MC.variante(p, cfg.variante[0], cfg.variante[1]);
    var codigo = (v && v.codigo) || null, pagina = (v && v.pagina) || p.pagina || null;
    var orc = null;
    if (MC.precos) {
      var pr = MC.precos(id).filter(function (x) { return !cfg || !cfg.variante || !x.variante || String(x.variante).indexOf(String(cfg.variante[1])) >= 0; })[0];
      if (pr) orc = { fornecedor: pr.fornecedor, numero: pr.orcamento, codigo: pr.codigo, qtd: pr.qtd, unidade: pr.unidade };
    }
    var link = urlDe(p.link) || urlDe(p.link_ficha) || urlDe(f.site);
    var inst = null;
    if (p.instalacao && p.instalacao.url) inst = urlDe(p.instalacao.url);
    if (!inst && p.fixacao && p.fixacao.url) inst = urlDe(p.fixacao.url);
    if (!inst && /manual/i.test(p.link || "")) inst = urlDe(p.link);
    var video = null;
    (function walk(o) { if (video || o == null) return; if (typeof o === "string") { if (/youtube\.com|youtu\.be/.test(o)) video = urlDe(o); return; } if (typeof o === "object") for (var k in o) walk(o[k]); })(p);
    return { id: id, fabricante: fab, nome: (p.linha && p.linha.length < 60 ? p.linha : p.nome_pt) + (v && cfg.rotuloVariante ? " " + cfg.rotuloVariante : ""),
      codigo: codigo || (orc && orc.codigo ? orc.fornecedor.split(" ")[0].replace(/^NIBRA$/, "Nibra") + " " + orc.codigo : null), pagina: pagina,
      catalogo: f.arquivo || "", link: link, instalacao: inst && (!link || inst.href !== link.href) ? inst : null, video: video, orcamento: orc, uso: cfg && cfg.uso || "" };
  }

  /* ================================================================ geometria: caixas orientadas (p0, p1, extensoes_m, dir_largura) */
  function caixaPeca(p) {
    var a = p.p0, b = p.p1, ext = p.extensoes_m || [p.comprimento_m || 0.1, 0.05, 0.05];
    var u = norm(sub(b, a)) || [1, 0, 0], v = p.dir_largura ? sub(p.dir_largura, mul(u, dot(u, p.dir_largura))) : null;
    v = (v && norm(v)) || norm(cross(u, [0, 0, 1])) || [0, 1, 0];
    var w = cross(u, v);
    return { c: mul(add(a, b), 0.5), eixos: [u, v, w], ext: [Math.max(ext[0], 0.004), Math.max(ext[1], 0.004), Math.max(ext[2], 0.004)] };
  }
  function caixaAlinhada(x0, x1, y0, y1, z0, z1) {
    return { c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], eixos: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      ext: [Math.max(x1 - x0, 0.004), Math.max(y1 - y0, 0.004), Math.max(z1 - z0, 0.004)] };
  }
  function bboxMalha(v) {
    var b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (var i = 0; i + 2 < v.length; i += 3) for (var k = 0; k < 3; k++) { b[k] = Math.min(b[k], v[i + k]); b[k + 3] = Math.max(b[k + 3], v[i + k]); }
    return b;
  }
  function vertices(cx) {
    var out = [];
    [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { [-1, 1].forEach(function (c) {
      out.push(add(cx.c, add(mul(cx.eixos[0], a * cx.ext[0] / 2), add(mul(cx.eixos[1], b * cx.ext[1] / 2), mul(cx.eixos[2], c * cx.ext[2] / 2)))));
    }); }); });
    return out;
  }
  function dentroPoligono(x, y, pol) {
    var d = false;
    for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      var xi = pol[i][0], yi = pol[i][1], xj = pol[j][0], yj = pol[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) d = !d;
    }
    return d;
  }

  /* ================================================================ câmera (matriz de vista única) e desenho SVG pelo algoritmo do pintor */
  function camera(az, el) {
    var t = az * Math.PI / 180, f = el * Math.PI / 180;
    var R = [Math.cos(t), Math.sin(t), 0], U = [-Math.sin(t) * Math.sin(f), Math.cos(t) * Math.sin(f), Math.cos(f)],
      D = [-Math.sin(t) * Math.cos(f), Math.cos(t) * Math.cos(f), -Math.sin(f)];
    function r6(a) { return a.map(function (x) { return Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e6) / 1e6; }); }
    return { R: r6(R), U: r6(U), D: r6(D), az: az, el: el };
  }
  /** enquadra a câmera no conjunto (pontos do mundo) dentro de uma caixa W×H (mm) */
  function enquadrar(cam, pts, W, H, folga) {
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach(function (p) { var sx = dot(cam.R, p), sy = -dot(cam.U, p); x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); });
    var s = Math.min((W * (1 - folga)) / (x1 - x0), (H * (1 - folga)) / (y1 - y0));
    return { R: cam.R, U: cam.U, D: cam.D, az: cam.az, el: cam.el, s: Math.round(s * 1e4) / 1e4, ox: Math.round((W / 2 - s * (x0 + x1) / 2) * 100) / 100,
      oy: Math.round((H / 2 - s * (y0 + y1) / 2) * 100) / 100, W: W, H: H };
  }
  function assinatura(cam) {
    return "R" + cam.R.join(",") + ";U" + cam.U.join(",") + ";D" + cam.D.join(",") + ";s" + cam.s + ";o" + cam.ox + "," + cam.oy + ";" + cam.W + "x" + cam.H;
  }
  function proj(cam, p) { return [cam.ox + cam.s * dot(cam.R, p), cam.oy - cam.s * dot(cam.U, p)]; }

  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function sombra(hex, n, ghost) {
    var L = [-0.42, -0.78, 0.46], k;
    if (n[2] > 0.7) k = 1.0; else if (n[2] < -0.7) k = 0.62;
    else k = 0.70 + 0.24 * Math.max(0, dot(n, L) / Math.sqrt(dot(L, L)));
    if (ghost) k = 0.9 + 0.1 * k;
    var c = hexRgb(hex);
    return "#" + c.map(function (x) { var y = Math.max(0, Math.min(255, Math.round(x * k))); return (y < 16 ? "0" : "") + y.toString(16); }).join("");
  }

  /** caminho SVG compacto (décimos de mm, coordenadas relativas) */
  function fn(v10) { return (v10 / 10).toString().replace(/^(-?)0\./, "$1."); }
  function caminho(P, fechar) {
    var X = P.map(function (p) { return [Math.round(p[0] * 10), Math.round(p[1] * 10)]; }), d = "M" + fn(X[0][0]) + " " + fn(X[0][1]);
    for (var i = 1; i < X.length; i++) { var dx = X[i][0] - X[i - 1][0], dy = X[i][1] - X[i - 1][1]; d += "l" + fn(dx) + (dy < 0 ? "" : " ") + fn(dy); }
    return d + (fechar ? "z" : "");
  }
  function segmento(A, B) { return caminho([A, B], false); }
  /** sólidos → itens desenháveis com profundidade. Sólido: { caixa | laje, cor, ghost, transp, semAresta, ch? }
   *  Classes (CSS da figura .v): face = cor em `color` (preenche e veda a emenda dos trechos); .o = face com contorno;
   *  .e = aresta real; .t = vidro translúcido. */
  function itensCaixa(cam, so, ch, out) {
    var cx = so.caixa;
    ch = so.ch || ch;
    var n = cx.ext.map(function (e) { return Math.max(1, Math.ceil(e / ch - 1e-9)); });
    var hs = [cx.ext[0] / (2 * n[0]), cx.ext[1] / (2 * n[1]), cx.ext[2] / (2 * n[2])];
    var faces = [];
    for (var a = 0; a < 3; a++) for (var sg = -1; sg <= 1; sg += 2) {
      var nrm = mul(cx.eixos[a], sg);
      if (dot(nrm, cam.D) >= -1e-9) continue;
      faces.push([a, sg, nrm]);
    }
    if (!faces.length) return;
    var aresta = !so.semAresta && !so.ghost;
    var corFace = {};
    faces.forEach(function (fc) { corFace[fc[0] + "" + fc[1]] = sombra(so.ghost ? GHOST : so.cor, fc[2], so.ghost); });
    for (var i = 0; i < n[0]; i++) for (var j = 0; j < n[1]; j++) for (var k = 0; k < n[2]; k++) {
      var idx = [i, j, k];
      var cc = cx.c;
      for (var q = 0; q < 3; q++) cc = add(cc, mul(cx.eixos[q], -cx.ext[q] / 2 + (idx[q] + 0.5) * cx.ext[q] / n[q]));
      faces.forEach(function (fc) {
        var a2 = fc[0], s2 = fc[1];
        if (s2 < 0 ? idx[a2] !== 0 : idx[a2] !== n[a2] - 1) return;
        var b = (a2 + 1) % 3, c = (a2 + 2) % 3;
        var fcC = add(cc, mul(cx.eixos[a2], s2 * hs[a2]));
        var vb = mul(cx.eixos[b], hs[b]), vc = mul(cx.eixos[c], hs[c]);
        var P = [sub(sub(fcC, vb), vc), sub(add(fcC, vb), vc), add(add(fcC, vb), vc), add(sub(fcC, vb), vc)].map(function (pp) { return proj(cam, pp); });
        var col = corFace[a2 + "" + s2], svg;
        if (so.transp) svg = '<path class="t" d="' + caminho(P, true) + '" color="' + col + '"/>';
        else {
          var ed = [idx[c] === 0, idx[b] === n[b] - 1, idx[c] === n[c] - 1, idx[b] === 0];
          if (aresta && ed[0] && ed[1] && ed[2] && ed[3]) svg = '<path class="o" d="' + caminho(P, true) + '" color="' + col + '"/>';
          else {
            svg = '<path d="' + caminho(P, true) + '" color="' + col + '"/>';
            if (aresta) {
              var e = "";
              for (var t = 0; t < 4; t++) if (ed[t]) e += segmento(P[t], P[(t + 1) % 4]);
              if (e) svg += '<path class="e" d="' + e + '"/>';
            }
          }
        }
        out.push({ z: dot(cam.D, fcC), svg: svg });
      });
    }
  }
  /** laje com contorno qualquer (Painel Wall): células → faces de cima e de borda; contorno de cima como linhas */
  function itensLaje(cam, so, ch, out) {
    var L = so.laje, pol = L.contorno, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pol.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var nx = Math.max(1, Math.ceil((x1 - x0) / ch)), ny = Math.max(1, Math.ceil((y1 - y0) / ch)), dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, cel = {};
    for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) if (dentroPoligono(x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy, pol)) cel[i + "," + j] = 1;
    var base = so.ghost ? GHOST : so.cor;
    var lados = [[1, 0, [1, 0, 0]], [-1, 0, [-1, 0, 0]], [0, 1, [0, 1, 0]], [0, -1, [0, -1, 0]]];
    var colTopo = sombra(base, [0, 0, 1], so.ghost);
    Object.keys(cel).forEach(function (k) {
      var ij = k.split(",").map(Number), cxp = x0 + (ij[0] + 0.5) * dx, cyp = y0 + (ij[1] + 0.5) * dy;
      if (cam.D[2] < 0) {
        var P = [[cxp - dx / 2, cyp - dy / 2, L.z1], [cxp + dx / 2, cyp - dy / 2, L.z1], [cxp + dx / 2, cyp + dy / 2, L.z1], [cxp - dx / 2, cyp + dy / 2, L.z1]].map(function (p) { return proj(cam, p); });
        out.push({ z: dot(cam.D, [cxp, cyp, L.z1]), svg: '<path d="' + caminho(P, true) + '" color="' + colTopo + '"/>' });
      }
      lados.forEach(function (ld) {
        if (cel[(ij[0] + ld[0]) + "," + (ij[1] + ld[1])]) return;
        if (dot(ld[2], cam.D) >= 0) return;
        var mx = cxp + ld[0] * dx / 2, my = cyp + ld[1] * dy / 2, hx = ld[1] ? dx / 2 : 0, hy = ld[0] ? dy / 2 : 0;
        var Q = [[mx - hx, my - hy, L.z0], [mx + hx, my + hy, L.z0], [mx + hx, my + hy, L.z1], [mx - hx, my - hy, L.z1]].map(function (p) { return proj(cam, p); });
        out.push({ z: dot(cam.D, [mx, my, (L.z0 + L.z1) / 2]), svg: '<path d="' + caminho(Q, true) + '" color="' + sombra(base, ld[2], so.ghost) + '"/>' });
      });
    });
    if (so.ghost) return;
    /* contorno de cima (arestas reais), em trechos curtos para entrar na ordem do pintor */
    for (var a = 0; a < pol.length; a++) {
      var p0 = pol[a], p1 = pol[(a + 1) % pol.length], comp = Math.sqrt(Math.pow(p1[0] - p0[0], 2) + Math.pow(p1[1] - p0[1], 2)), m = Math.max(1, Math.ceil(comp / ch));
      for (var t = 0; t < m; t++) {
        var A = [p0[0] + (p1[0] - p0[0]) * t / m, p0[1] + (p1[1] - p0[1]) * t / m, L.z1], B = [p0[0] + (p1[0] - p0[0]) * (t + 1) / m, p0[1] + (p1[1] - p0[1]) * (t + 1) / m, L.z1];
        out.push({ z: dot(cam.D, mul(add(A, B), 0.5)) - ch / 2, svg: '<path class="e" d="' + segmento(proj(cam, A), proj(cam, B)) + '"/>' });
      }
    }
  }
  function desenhar(cam, solidos, rotulos, ch) {
    var it = [];
    solidos.forEach(function (so) { if (so.caixa) itensCaixa(cam, so, ch, it); else if (so.laje) itensLaje(cam, so, Math.min(ch, 0.6), it); });
    it.sort(function (a, b) { return b.z - a.z; });
    var s = '<svg class="v" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + cam.W + " " + cam.H + '" width="' + cam.W + 'mm" height="' + cam.H + 'mm" data-camera="' + esc(assinatura(cam)) + '">';
    s += it.map(function (x) { return x.svg; }).join("");
    (rotulos || []).forEach(function (r) {
      var P = proj(cam, r.p), w = 1.6 + 1.9 * r.t.length;
      s += '<rect x="' + f1(P[0] - w / 2) + '" y="' + f1(P[1] - 2.3) + '" width="' + f1(w) + '" height="4.6" rx="1" fill="#fff" fill-opacity=".9" stroke="#8a969e" stroke-width=".15"/>' +
        '<text x="' + f1(P[0]) + '" y="' + f1(P[1] + 1.25) + '" font-size="3.4" font-weight="700" text-anchor="middle" fill="#1d2a33">' + esc(r.t) + "</text>";
    });
    return s + "</svg>";
  }

  /* ================================================================ HTML: CSS (o do livro aprovado, adaptado) */
  var CSS = [
    "@page { size: 420mm 297mm; margin: 0 }",
    "* { box-sizing: border-box }",
    "body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1d2a33; -webkit-print-color-adjust: exact; print-color-adjust: exact }",
    ".pg { width: 420mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; background: #fff }",
    ".mold { position: absolute; left: 18mm; top: 8mm; width: 394mm; height: 281mm; border: .35mm solid #00406A }",
    ".rod { position: absolute; left: 18mm; top: 269mm; width: 394mm; height: 20mm; border-top: .35mm solid #00406A; display: flex; align-items: stretch }",
    ".rod > div { border-right: .2mm solid #b8c4cc; padding: 1.6mm 3mm; display: flex; flex-direction: column; justify-content: center }",
    ".rod .lg { width: 46mm; flex-direction: row; align-items: center; justify-content: flex-start; gap: 2.5mm } .rod .lg img { height: 13mm }",
    ".rod .lg span { font-size: 7.5pt; font-weight: 700; color: #00406A; line-height: 1.15 }",
    ".rod .tt { flex: 1 } .rod .obra { font-size: 7.2pt; letter-spacing: .35mm; color: #6F5F48; text-transform: uppercase }",
    ".rod .tit { font-size: 12pt; font-weight: 700; color: #00406A; margin-top: .6mm }",
    ".rod .sec { width: 50mm; font-size: 7.5pt; color: #3d4b55 } .rod .sec b { color: #3F7818 }",
    ".rod .doc { width: 54mm; font-size: 7.2pt; color: #3d4b55; line-height: 1.35 }",
    ".rod .nf { width: 30mm; align-items: center } .rod .nf img { max-height: 12.5mm; max-width: 25mm } .rod .nf span { font-size: 7pt; color: #3d4b55; text-align: center }",
    ".rod .np { width: 26mm; border-right: 0; align-items: center; background: #00406A; color: #fff } .rod .np b { font-size: 20pt; line-height: 1 } .rod .np small { font-size: 7pt; opacity: .85 }",
    ".aba { position: absolute; left: 412.5mm; width: 7.5mm; background: #00406A; color: #fff; writing-mode: vertical-rl; font-size: 7.5pt; font-weight: 700; display: flex; align-items: center; justify-content: center; letter-spacing: .3mm; border-radius: 0 2mm 2mm 0 }",
    ".cont { position: absolute; left: 24mm; top: 13mm; width: 382mm; height: 252mm }",
    "h1 { font-size: 21pt; color: #00406A; margin: 0 0 2mm 0; font-weight: 700; line-height: 1.1 }",
    "h1 small { display: block; font-size: 8.5pt; color: #6F5F48; letter-spacing: .6mm; text-transform: uppercase; font-weight: 600; margin-bottom: 1mm }",
    "h2 { font-size: 10.5pt; color: #00406A; margin: 2.6mm 0 1.2mm 0; border-bottom: .3mm solid #A89868; padding-bottom: .5mm }",
    "p, li { font-size: 9.2pt; line-height: 1.38; margin: 0 0 1.2mm 0 } ul, ol { margin: 0 0 1.4mm 0; padding-left: 5mm }",
    "table { border-collapse: collapse; width: 100% }",
    "th { background: #00406A; color: #fff; font-size: 7.4pt; font-weight: 600; padding: .9mm 1.3mm; text-align: left; border: .2mm solid #00406A }",
    "td { font-size: 7.8pt; padding: .7mm 1.3mm; border: .2mm solid #c9d2d8; vertical-align: top } tr:nth-child(even) td { background: #f3f6f8 }",
    "td.n, th.n { text-align: right; white-space: nowrap } .tot td { font-weight: 700; background: #e7edf1 !important }",
    ".box { border: .3mm solid #A89868; background: #faf7f0; padding: 1.6mm 2.6mm; margin: 1.6mm 0; font-size: 8.4pt; line-height: 1.38 }",
    ".aten { border-left: 1.2mm solid #c8761a; background: #fdf3e6; padding: 1.4mm 2.6mm; margin: 1.6mm 0; font-size: 8.3pt; line-height: 1.36 }",
    ".chip { display: inline-block; background: #00406A; color: #fff; font-weight: 700; font-size: 7.6pt; padding: .4mm 1.6mm; border-radius: 1mm; margin: 0 1mm .5mm 0 }",
    ".etapa-cab { position: absolute; left: 24mm; top: 12mm; width: 382mm; height: 20mm; display: flex; align-items: center; gap: 5mm }",
    ".etapa-cab .num { width: 20mm; height: 20mm; border-radius: 50%; background: #00406A; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; flex: none }",
    ".etapa-cab .num small { font-size: 6.5pt; letter-spacing: .4mm; line-height: 1 } .etapa-cab .num b { font-size: 19pt; line-height: 1.05 }",
    ".etapa-cab h1 { margin: 0; font-size: 21pt } .etapa-cab .sub { font-size: 9.4pt; color: #3d4b55; margin-top: .8mm }",
    ".fig { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: flex-start }",
    ".fig .leg { font-size: 8pt; color: #3d4b55; margin-top: .6mm; text-align: center; line-height: 1.3 } .fig .leg b { color: #00406A }",
    ".fig.borda { border: .25mm solid #d5dde3; border-radius: 1.5mm; padding: 1.2mm; background: #fff }",
    ".painel { position: absolute; left: 258mm; top: 35mm; width: 148mm; height: 215mm; border-left: .35mm solid #A89868; padding-left: 5mm }",
    ".painel p, .painel li { font-size: 8.9pt; line-height: 1.36 } .painel td { font-size: 7.5pt } .painel th { font-size: 7.1pt }",
    ".prod { margin: 0 0 1.2mm 0; font-size: 7.9pt; line-height: 1.32 } .prod b { color: #00406A } .prod a { color: #1f5f8b; text-decoration: none; word-break: break-all } .prod i { color: #3d4b55; font-style: normal }",
    ".legenda-fixa { position: absolute; left: 24mm; top: 252mm; width: 382mm; height: 15mm; border-top: .25mm solid #A89868; padding-top: 1.3mm; display: flex; flex-wrap: wrap; align-content: flex-start; gap: .7mm 3.4mm }",
    ".legenda-fixa div { display: flex; align-items: center; gap: 1.3mm; font-size: 6.8pt; color: #3d4b55; white-space: nowrap }",
    ".legenda-fixa i, .legenda i { display: inline-block; width: 4.6mm; height: 3mm; border: .18mm solid #666; flex: none }",
    ".legenda { display: flex; flex-wrap: wrap; gap: 1.4mm 4mm } .legenda div { display: flex; align-items: center; gap: 2mm; font-size: 8.6pt; width: 47% } .legenda i { width: 8mm; height: 5mm }",
    ".capa .faixa { position: absolute; left: 0; top: 0; width: 118mm; height: 297mm; background: linear-gradient(180deg, #00406A 0%, #0b3150 100%) }",
    ".capa .faixa .l1, .capa .faixa .l2 { position: absolute; left: 18mm; width: 82mm; background: #fff; border-radius: 3mm; padding: 5mm; text-align: center; color: #00406A; font-weight: 700 }",
    ".capa .faixa .l1 { top: 20mm } .capa .faixa .l1 img { width: 66mm } .capa .faixa .l2 { top: 104mm } .capa .faixa .l2 img { width: 50mm }",
    ".capa .faixa .rod2 { position: absolute; left: 18mm; bottom: 18mm; width: 86mm; color: #dfe9ef; font-size: 8.2pt; line-height: 1.5 }",
    ".capa .lin { position: absolute; left: 118mm; top: 0; width: 3mm; height: 297mm; background: #A89868 } .capa .lin2 { position: absolute; left: 122.5mm; top: 0; width: 1mm; height: 297mm; background: #3F7818 }",
    ".capa .txt { position: absolute; left: 140mm; top: 22mm; width: 262mm } .capa .sup { font-size: 10.5pt; letter-spacing: 1.2mm; color: #6F5F48; text-transform: uppercase; font-weight: 600 }",
    ".capa .t1 { font-size: 36pt; font-weight: 800; color: #00406A; line-height: 1.04; margin: 4mm 0 3mm 0 } .capa .t2 { font-size: 13.5pt; color: #3d4b55; line-height: 1.3 }",
    ".capa .hero { position: absolute; left: 134mm; top: 84mm }",
    ".capa .t3 { position: absolute; left: 140mm; top: 228mm; width: 262mm; font-size: 8.8pt; color: #3d4b55; line-height: 1.5; border-top: .4mm solid #A89868; padding-top: 3mm }",
    ".capa .rv { position: absolute; left: 140mm; bottom: 12mm; display: flex; gap: 4mm } .capa .rv div { border: .35mm solid #00406A; padding: 1.8mm 4mm; font-size: 8.3pt; color: #00406A } .capa .rv b { display: block; font-size: 12.5pt }",
    ".capa .sit { margin-top: 2.5mm; font-size: 8.8pt; color: #8a4b0f; font-weight: 600; letter-spacing: .2mm; line-height: 1.45 }",
    ".sum .s { font-size: 12pt; color: #00406A; font-weight: 700; margin: 4mm 0 1.5mm 0 }",
    ".sum .i { display: flex; align-items: center; font-size: 11pt; line-height: 1.6 } .sum .i span { flex: 1; border-bottom: .2mm dotted #9aa; margin: 0 2mm 1.4mm 0 } .sum .i b { color: #00406A; min-width: 9mm; text-align: right }",
    ".nivel { font-family: Consolas, monospace; font-size: 8.4pt; background: #eef3f7; padding: 0 .8mm }",
    ".check td:first-child { width: 7mm; text-align: center; font-size: 11pt }",
    "svg text { font-family: 'Segoe UI', Arial, sans-serif }",
    ".v { stroke-linejoin: round } .v path { fill: currentColor; stroke: currentColor; stroke-width: .12 } .v path.o { stroke: #2b2b2b; stroke-width: .13 }",
    ".v path.e { fill: none; stroke: #2b2b2b; stroke-width: .13 } .v path.t { fill-opacity: .42; stroke: #5d8fa6; stroke-width: .08 }"
  ].join("\n");

  function tabela(cab, linhas, numCols, largura, cls) {
    numCols = numCols || [];
    var h = "<table class='" + (cls || "") + "'>";
    if (largura) h += "<colgroup>" + largura.map(function (w) { return "<col style='width:" + w + "'>"; }).join("") + "</colgroup>";
    h += "<tr>" + cab.map(function (c, i) { return "<th class='" + (numCols.indexOf(i) >= 0 ? "n" : "") + "'>" + c + "</th>"; }).join("") + "</tr>";
    linhas.forEach(function (l) {
      var tot = l && l.tot, cel = tot ? l.cel : l;
      h += "<tr class='" + (tot ? "tot" : "") + "'>" + cel.map(function (c, i) { return "<td class='" + (numCols.indexOf(i) >= 0 ? "n" : "") + "'>" + c + "</td>"; }).join("") + "</tr>";
    });
    return h + "</table>";
  }
  function chips(cods) { return cods.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join(""); }

  /* ================================================================ gerar */
  MadManual.gerar = function (resultado, opcoes) {
    opcoes = opcoes || {};
    var avisos = [];
    var F = fonteComDecisoes(resultado, opcoes.fonte || (resultado && resultado.fonte));
    if (!resultado || !F || !F.pecas) {
      return { ok: false, html: "", paginas: [], etapas: [], avisos: ["Manual não gerado: falta a fonte de peças (opcoes.fonte) — o resultado do orquestrador só traz id, grupo, seção e volume das peças."] };
    }
    var MC = opcoes.catalogo || req("MadCatalogo", "madcatalogo.js");
    if (!MC) avisos.push("Catálogo de produtos (MadCatalogo) ausente: etapas sem produtos.");
    var obra = opcoes.obra || {}, doc = opcoes.documento || {}, rt = opcoes.responsavel || {}, logos = opcoes.logos || {}, folhas = opcoes.folhas || {};
    var N = (resultado.niveisFonte) || (F.piso_pw && F.piso_pw.niveis) || {};
    var P = F.pecas, grupos = F.grupos || {};

    /* ---------- espécie por peça (especificação do cliente, resultado.especies) */
    var espId = {}, espGrupo = {};
    ((resultado.especies && resultado.especies.pecas) || []).forEach(function (e) { espId[e.id] = e.para; });
    P.forEach(function (p) {
      var e = espId[p.id];
      if (!e) return;
      espGrupo[p.grupo] = espGrupo[p.grupo] || {};
      espGrupo[p.grupo][e] = (espGrupo[p.grupo][e] || 0) + 1;
    });
    function especieTxt(p) {
      var e = espId[p.id];
      if (e) return NOME_ESPECIE[e] || e;
      if (p.grupo === "WF_CHAPA") return "chapa";
      if (p.grupo === "FERRAGEM") return "inox A4";
      return p.especie ? String(p.especie).split(" (")[0] : "";
    }
    function especieGrupo(g) {
      var o = espGrupo[g] || {}, k = Object.keys(o).sort(function (a, b) { return o[b] - o[a]; });
      return k.map(function (x) { return NOME_ESPECIE[x] || x; });
    }

    /* ---------- fases da fonte (etapa_montagem) e etapa de cada peça */
    function codFase(t) { var m = /^\s*(M\d+)/.exec(t || ""); return m ? m[1] : null; }
    var faseTxt = {}, faseGrupo = {};
    P.forEach(function (p) {
      var c = codFase(p.etapa_montagem);
      if (!c) return;
      var t = String(p.etapa_montagem).replace(/^\s*M\d+\s*·\s*/, "");
      if (!faseTxt[c] || t.length > faseTxt[c].length) faseTxt[c] = t;
      faseGrupo[p.grupo] = faseGrupo[p.grupo] || {};
      faseGrupo[p.grupo][c] = (faseGrupo[p.grupo][c] || 0) + 1;
    });
    var semFase = {};
    var faseDe = {};
    P.forEach(function (p) {
      var c = codFase(p.etapa_montagem);
      if (!c) {
        var o = faseGrupo[p.grupo] || {}, k = Object.keys(o).sort(function (a, b) { return o[b] - o[a]; })[0];
        c = k || "M99";
        semFase[p.grupo] = (semFase[p.grupo] || 0) + 1;
      }
      faseDe[p.id] = c;
    });
    Object.keys(semFase).forEach(function (g) { avisos.push(semFase[g] + " peça(s) " + g + " sem etapa_montagem na fonte: entraram na fase da mesma função (" + Object.keys(faseGrupo[g] || {}).join(", ") + ")."); });
    var chaveDe = {}, etapaPecas = {}, faseDaChave = {}, chavesPorFase = {};
    P.forEach(function (p) {
      if (p.grupo === "FERRAGEM") return;
      var f = faseDe[p.id], ch = GRUPO_CHAVE[p.grupo] || ("fase_" + f);
      chaveDe[p.id] = ch;
    });
    /* ferragem modelada: vai para a etapa principal da sua fase */
    var princFase = {};
    P.forEach(function (p) { if (chaveDe[p.id]) { var f = faseDe[p.id]; princFase[f] = princFase[f] || {}; princFase[f][chaveDe[p.id]] = (princFase[f][chaveDe[p.id]] || 0) + 1; } });
    P.forEach(function (p) {
      if (chaveDe[p.id]) return;
      var o = princFase[faseDe[p.id]] || {}, k = Object.keys(o).sort(function (a, b) { return o[b] - o[a]; })[0];
      chaveDe[p.id] = k || ("fase_" + faseDe[p.id]);
    });
    P.forEach(function (p) {
      var ch = chaveDe[p.id];
      (etapaPecas[ch] = etapaPecas[ch] || []).push(p);
      if (p.grupo !== "FERRAGEM") {
        var f = faseDe[p.id];
        faseDaChave[ch] = faseDaChave[ch] || {};
        faseDaChave[ch][f] = (faseDaChave[ch][f] || 0) + 1;
      }
    });
    function numFase(c) { return c ? parseInt(c.slice(1), 10) : 999; }
    var chavesPecas = Object.keys(etapaPecas).map(function (ch) {
      var o = faseDaChave[ch] || {}, f = Object.keys(o).sort(function (a, b) { return numFase(a) - numFase(b); })[0] || faseDe[etapaPecas[ch][0].id];
      return { chave: ch, fase: f };
    }).sort(function (a, b) {
      return numFase(a.fase) - numFase(b.fase) || ((ORDEM_CHAVE.indexOf(a.chave) + 1 || 99) - (ORDEM_CHAVE.indexOf(b.chave) + 1 || 99)) || (a.chave < b.chave ? -1 : 1);
    });
    chavesPecas.forEach(function (c) { (chavesPorFase[c.fase] = chavesPorFase[c.fase] || []).push(c.chave); });

    /* ---------- dados auxiliares (ripado e vidro da cena da arquitetura) */
    var cena = opcoes.cena && opcoes.cena.objetos ? opcoes.cena.objetos : null;
    var ripas = [], vidros = [], ripFach = {}, ripPort = {};
    if (cena) cena.forEach(function (o) {
      if (o.tipo !== "malha" || !o.v) return;
      var tag = String(o.tag || ""), nome = String(o.nome || "");
      var fach = /^20 /.test(tag) && /ripa 3x3/i.test(nome), port = /^21/.test(tag) && /^Ripado da folha do port/i.test(nome);
      if (fach || port) {
        var b = bboxMalha(o.v), L = Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]), k = (Math.round(L * 100) / 100).toFixed(2);
        ripas.push(caixaAlinhada(b[0], b[3], b[1], b[4], b[2], b[5]));
        if (fach) ripFach[k] = (ripFach[k] || 0) + 1; else ripPort[k] = (ripPort[k] || 0) + 1;
      } else if (/^24/.test(tag)) {
        var bv = bboxMalha(o.v);
        vidros.push(caixaAlinhada(bv[0], bv[3], bv[1], bv[4], bv[2], bv[5]));
      }
    });
    function somaQ(o) { return Object.keys(o).reduce(function (s, k) { return s + o[k]; }, 0); }
    function somaM(o) { return Object.keys(o).reduce(function (s, k) { return s + o[k] * parseFloat(k); }, 0); }

    /* ---------- plano das etapas */
    var defs = [];
    function temGrupo(re) { return P.some(function (p) { return re.test(p.grupo); }); }
    if (F.concreto && F.concreto.length) defs.push({ chave: "apoios", fase: null });
    var fasesOrd = Object.keys(chavesPorFase).sort(function (a, b) { return numFase(a) - numFase(b); });
    var travFase = fasesOrd.filter(function (f) { return /libera o contravent/i.test(faseTxt[f] || ""); })[0] || null;
    if (!travFase && chavesPorFase && fasesOrd.some(function (f) { return chavesPorFase[f].indexOf("cob1") >= 0; })) travFase = fasesOrd.filter(function (f) { return chavesPorFase[f].indexOf("cob1") >= 0; })[0];
    fasesOrd.forEach(function (f) {
      chavesPorFase[f].forEach(function (ch) { defs.push({ chave: ch, fase: f }); });
      if (f === travFase) defs.push({ chave: "travamento", fase: null, depoisDe: f });
    });
    if (ripas.length) defs.push({ chave: "ripado", fase: null });
    var CAM = resultado.acoes && resultado.acoes.camadasPiso;
    if (CAM && CAM.pacotes) defs.push({ chave: "camadas", fase: null });
    if (temGrupo(/^COB_/)) defs.push({ chave: "cob_camadas", fase: null });
    defs.push({ chave: "checagens", fase: null });
    var EN = {};
    defs.forEach(function (d, i) { d.n = i + 1; EN[d.chave] = i + 1; });

    /* ---------- ligações do resultado por código (sem as substituídas) */
    var LIG = {};
    (resultado.ligacoes || []).forEach(function (l) {
      if (l.substituidaPor) return;
      (LIG[l.codigo] = LIG[l.codigo] || []).push(l);
    });
    function ligLinhas(cods) {
      var out = [];
      cods.forEach(function (c) {
        (LIG[c] || []).forEach(function (l) {
          out.push({ codigo: c, tipo: l.tipo || "", descricao: l.descricao || "", quantidade: l.quantidade });
        });
      });
      return out;
    }

    /* ---------- reprovações do cálculo → etapa (Atenção) */
    var reprovGrupo = [];
    (resultado.reprovacoes || []).forEach(function (r) {
      MODELO_FONTE.forEach(function (m) { if (m[0].test(r.grupo)) reprovGrupo.push({ re: m[1], r: r }); });
    });

    /* ---------- números da fonte usados nos textos */
    function pecasG(gs) { return P.filter(function (p) { return gs.indexOf(p.grupo) >= 0; }); }
    function secoesG(gs) {
      var o = {};
      pecasG(gs).forEach(function (p) { if (p.secao_cm) o[sec(p.secao_cm)] = (o[sec(p.secao_cm)] || 0) + (p.secao_cm[0] * p.secao_cm[1]); });
      return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; });
    }
    function eixoZ(gs) {
      var zs = []; pecasG(gs).forEach(function (p) { zs.push(Math.round((p.p0[2] + p.p1[2]) / 2 * 1000) / 1000); });
      zs.sort(function (a, b) { return a - b; });
      return zs.length ? { min: zs[0], max: zs[zs.length - 1], med: zs[Math.floor(zs.length / 2)] } : null;
    }
    function espTxt(gs) { var e = []; gs.forEach(function (g) { e = e.concat(especieGrupo(g)); }); e = uniq(e); return e.length ? e.join(" / ") : ""; }
    var nPilares = uniq(pecasG(["PILAR_PECA"]).map(function (p) { return p.pilar; })).length;
    var nPaineisWF = uniq(P.filter(function (p) { return /^WF_/.test(p.grupo) && p.painel; }).map(function (p) { return p.painel; })).length;
    var prem = resultado.paredesPremissas || {}, chapaCalc = (prem.catalogo && prem.catalogo.produto) || null;
    var pwPaineis = (F.piso_pw && F.piso_pw.paineis) || [], pwArea = pwPaineis.reduce(function (s, x) { return s + (x.area_m2 || 0); }, 0);
    var pwProduto = resultado.painelWall && resultado.painelWall.produto;

    function prodLista(lista) {
      var out = [];
      lista.forEach(function (cfg) {
        var info = produtoInfo(MC, cfg.id, cfg);
        if (info) out.push(info); else avisos.push("Produto " + cfg.id + " não está no catálogo: não citado.");
      });
      return out;
    }
    function regraCat(id, campo) {
      var p = MC && MC.produto && MC.produto(id), o = p;
      if (!p) return null;
      campo.split(".").forEach(function (k) { o = o == null ? null : o[k]; });
      return o == null ? null : o;
    }
    var evoMax = (function () {
      var t = regraCat("nibra-evoply", "tabelas_resistencia"), esp = prem.tChapa || 12;
      if (!t || !t[0]) return null;
      var l = t[0].linhas.filter(function (x) { return x[0] === esp; })[0];
      return l ? { cm: l[1], esp: esp, pagina: t[0].pagina } : null;
    })();
    var homeUV = regraCat("eurovent-home", "dados_tecnicos.resistencia_uv"), topT = regraCat("eurovent-topband", "dados_tecnicos.temperatura_minima_aplicacao_C");
    var pwTrat = regraCat("eternit-painel-wall-40", "instalacao.tratamento_antes_da_instalacao"), pwCorte = regraCat("eternit-painel-wall-40", "instalacao.corte");
    var decJunta = (regraCat("decorlit-painel-wall-40", "instalacao.regras") || []).filter(function (r) { return /junta de movimenta/i.test(r); })[0];
    var etContra = (regraCat("eternit-painel-wall-40", "contrapiso_e_revestimento.regras") || []).filter(function (r) { return /ACIII/.test(r) && /3 mm/.test(r); })[0];
    var decContra = regraCat("decorlit-painel-wall-40", "contrapiso_e_revestimento.contrapiso");
    function mmDe(txt, re) { var m = re.exec(txt || ""); return m ? m[1] : null; }
    var juntaPainel = mmDe(decJunta, /junta de movimenta\S* de (\d+) ?mm/i), juntaParede = mmDe(decJunta, /junta de (\d+) ?mm com/i);
    var contraMin = mmDe(decContra, /m[ií]nima de (\d+) ?mm/i);

    /* ---------- conteúdo de cada etapa */
    function Lrow(gs, nome) { return { grupos: gs, nome: nome }; }
    var ET = {
      apoios: function () {
        var n = (F.concreto || []).length, fix = String(N.fixacao || ""), tf = fix.indexOf(":") > 0 ? fix.split(":").slice(1).join(":").trim() : "";
        return { titulo: "Conferir e preparar os apoios no concreto", sub: "Pilaretes da fundação · chumbadores · graute, sela inox e EPDM",
          ligs: ["L09", "L01"], linhas: [], prod: [], cor: [], conc: true,
          leg: "<b>" + n + " pilaretes</b> da fundação (topo do concreto " + nv(N.topo_concreto) + ") — o apoio de toda a madeira",
          passos: [
            "Conferir com topografia a locação e o topo dos " + n + " pilaretes (" + nv(N.topo_concreto) + "); desvio fora da tolerância da fundação: avisar o responsável técnico antes de montar.",
            "Furar e colar os chumbadores das vigas do piso (L09) e do pé dos pilares (L01) nas posições das pranchas, com o adesivo epóxi estrutural do projeto; esperar a cura do fabricante antes de carregar.",
            tf ? "Topo de cada apoio: " + tf + " — a madeira nunca encosta no concreto." : "Topo de cada apoio com graute, sela inox e EPDM: a madeira nunca encosta no concreto."
          ] };
      },
      vp: function () {
        var gs = ["PISO_VIGA"], ps = pecasG(gs);
        return { titulo: "Vigas principais do piso (VP) sobre os pilaretes", sub: ps.length + " vigas " + secoesG(gs).join(" e ") + " de " + espTxt(gs) + ", apoiadas nas selas inox",
          ligs: ["L09", "L14"], linhas: [Lrow(gs, "Viga principal do piso")], prod: [],
          leg: "<b>" + ps.length + " vigas principais do piso</b> apoiadas nos pilaretes",
          passos: [
            "Apoiar cada VP, já furada pela ficha, sobre a sela inox dos chumbadores; porca e arruela larga no topo da madeira (L09).",
            "Nivelar todas as VP antes de qualquer barrote: topo em " + nv(N.topo_VP) + ".",
            "Viga que chega na lateral de outra VP: cantoneiras inox com tirefonds (L14).",
            "Conferir a marca de cada viga com a planta do vigamento antes de apertar."
          ] };
      },
      barrotes: function () {
        var gs = ["PISO_BARROTE", "PISO_BLOQ_VP", "PISO_BLOQ", "PISO_TESTEIRA", "PISO_REQUADRO"];
        return { titulo: "Barrotes, testeiras, bloqueios e requadros do piso", sub: "Barrotes " + secoesG(["PISO_BARROTE"]).join(" e ") + " de " + espTxt(["PISO_BARROTE"]) + " cruzando sobre as VP; testeiras, bloqueios e requadros dos alçapões",
          ligs: ["L10", "L15", "L12", "L13"], linhas: [Lrow(["PISO_BARROTE"], "Barrote do piso"), Lrow(["PISO_BLOQ_VP", "PISO_BLOQ"], "Bloqueio sobre a VP / entre barrotes"),
            Lrow(["PISO_TESTEIRA"], "Testeira (borda livre)"), Lrow(["PISO_REQUADRO"], "Requadro de alçapão")],
          prod: [{ id: "eurotec-paneltwistec-a4-escareada", variante: ["codigo", "901478"], rotuloVariante: "6×120", uso: "mesma bitola e aço inox A4 do parafuso 6×120 das ligações L12 e L13" }],
          leg: "<b>Barrotes</b> cruzando sobre as VP (já montadas, em cinza); <b>testeiras, bloqueios e requadros</b> em laranja",
          passos: [
            "Barrotes cruzando sobre as VP no espaçamento das pranchas, com tirefond inclinado em cada cruzamento, em lados alternados (L10).",
            "Barrote da fila que chega no pilar composto: cantoneiras inox com tirefonds (L15).",
            "Testeiras nas pontas livres (L12), bloqueios entre barrotes sob as paredes (L13) e requadros dos alçapões nas posições da planta.",
            "Topo dos barrotes em " + nv(N.topo_barrote) + ": é o plano de apoio do Painel Wall — conferir com nível antes da etapa " + (EN.pw || "seguinte") + "."
          ] };
      },
      pw: function () {
        return { titulo: "Painel Wall 40 e dormentes das paredes", sub: (pwProduto || "Painel Wall 40 mm") + " sobre os barrotes e dormentes " + secoesG(["PISO_DORMENTE"]).join(" e ") + " de " + espTxt(["PISO_DORMENTE"]) + " sob as paredes",
          ligs: ["L11"], linhas: [{ pw: true }, Lrow(["PISO_DORMENTE"], "Dormente sob parede")], pwCor: true,
          prod: [{ id: "eternit-painel-wall-40", uso: "painel do piso seco (orçamento recebido)" }, { id: "decorlit-painel-wall-40", uso: "manual de instalação com juntas e contrapiso (referência do mesmo produto)" }],
          leg: "<b>" + pwPaineis.length + " recortes de Painel Wall</b> (" + br(pwArea, 1) + " m²) fechando o piso; <b>dormentes</b> marcando as paredes de wood frame",
          passos: [
            "Antes de assentar: " + (pwTrat ? pwTrat.replace(/^tratar/, "tratar").replace(/\s*\(ficha.*$/, "") + " (Eternit, ficha p. 4)" : "impermeabilizante acrílico em todas as faces e bordas") +
              (pwCorte ? "; corte só com disco de Widea e, na borda cortada, selante hidrofugante e cupinicida em 2 demãos." : "."),
            "Assentar perpendicular aos barrotes, emendas sobre apoio e sem balanço; junta de " + (juntaPainel || "3") + " mm entre painéis e de " + (juntaParede || "10") + " mm junto a paredes e pilares (Decorlit, manual p. 14).",
            "Parafusar no barrote com a cabeça embutida e nivelada com massa, e silicone ou mastique sobre cada apoio (L11).",
            "Dormentes sobre o painel no traçado das paredes (topo no piso acabado " + nv(N.piso_acabado || 0) + "): recebem a guia dos painéis de wood frame e a barra passante (L06, etapa " + (EN.paineis || "dos painéis") + ")."
          ],
          atencao: resultado.painelWall && !resultado.painelWall.impedeUso && resultado.painelWall.criterio === "desempenho"
            ? "receber o painel só com a ficha ou declaração do fabricante de carga admissível (de serviço) de no mínimo " + (resultado.painelWall.requisitos || []).map(function (q) { return br(q.cargaServicoMin_kN_m2, 2) + " kN/m² com apoios a " + br(q.vao_m, 2) + " m (" + q.zona + ")"; }).join("; ") + " — qualquer fabricante que declare essa capacidade serve."
            : resultado.painelWall && resultado.painelWall.impedeUso ? "a carga do piso passa do valor publicado na ficha do Painel Wall (" + br(resultado.painelWall.ficha.carga_kN_m2, 2) + " kN/m², apoios a " + br(resultado.painelWall.ficha.vaoMax_m, 2) + " m): o piso só recebe carga de uso depois da confirmação do fabricante para o vão de " + br(resultado.painelWall.vaoApoios_m, 3) + " m." : null };
      },
      pilares: function () {
        var gs = ["PILAR_PECA", "PILAR_BLOQ"], ez = pecasG(["PILAR_PECA"]), zt = ez.length ? Math.max.apply(null, ez.map(function (p) { return Math.max(p.p0[2], p.p1[2]); })) : null;
        return { titulo: "Pilares compostos 4×(" + (secoesG(["PILAR_PECA"])[0] || "") + ")", sub: nPilares + " pilares de 4 peças " + secoesG(["PILAR_PECA"]).join(" e ") + " de " + espTxt(["PILAR_PECA"]) + ", pré-montados com os bloqueadores em cruz",
          ligs: ["L02", "L01"], linhas: [Lrow(["PILAR_PECA"], "Peça do pilar composto"), Lrow(["PILAR_BLOQ"], "Bloqueador em cruz")], prod: [],
          leg: "<b>Pilares compostos</b> do pé (" + nv(N.topo_pilarete) + ")" + (zt != null ? " ao topo (" + nv(zt) + ")" : "") + ", com os bloqueadores em cruz (vermelho)",
          passos: [
            "Pré-montar cada pilar no chão: as 4 peças e os bloqueadores em cruz, furados pela ficha, com as barras do L02.",
            "Levantar o pilar e assentar o pé sobre o pilarete, ao lado da VP; fixar o pé com o L01.",
            "Aprumar (desvio de no máximo 1/500 da altura) e escorar: o escoramento só sai na etapa " + (EN.travamento || "de travamento") + ".",
            "Nenhum bloqueador pode ser suprimido ou furado fora do gabarito: o pilar só trabalha como conjunto com todos eles."
          ] };
      },
      paineis: function () {
        var gs = ["WF_MONTANTE", "WF_JACK"];
        return { titulo: "Fechamentos — painéis de wood frame", sub: nPaineisWF + " painéis de " + espTxt(["WF_MONTANTE"]) + (chapaCalc ? " com " + chapaCalc : "") + " — montados deitados sobre o piso e erguidos",
          ligs: ["L05", "L06", "L07"], linhas: [Lrow(["WF_MONTANTE", "WF_JACK"], "Montante / jack"), Lrow(["WF_GUIA_INF", "WF_GUIA_SUP"], "Guia inferior / superior"),
            Lrow(["WF_BLOQ", "WF_VERGA"], "Bloqueador / verga"), Lrow(["WF_TRAVESSA"], "Travessa de marcenaria"), Lrow(["WF_CHAPA"], "Chapa de fechamento"), Lrow(["FERRAGEM"], "Ferragem modelada (hold-downs)")],
          prod: [{ id: "nibra-wf-estrutura-pinus", uso: "montantes, guias e bloqueadores de Pinus autoclavado" }, { id: "nibra-evoply", variante: ["espessura_mm", prem.tChapa || 12], rotuloVariante: (prem.tChapa || 12) + " mm", uso: "chapa das paredes adotada no cálculo" },
            { id: "nibra-prego-liso", variante: ["bitola_x_comprimento", "15 x 18"], rotuloVariante: "15×18", uso: "bitola do prego da L07" }],
          leg: "<b>Painéis de wood frame</b> — montantes, guias, bloqueadores, vergas e travessas; chapas por fora",
          passos: [
            "Montar cada painel deitado sobre o piso: montantes, guias, bloqueadores, jacks e vergas" + (evoMax ? ", com montantes a no máximo " + evoMax.cm + " cm (limite do Evoply " + evoMax.esp + " mm em paredes, Nibra p. " + evoMax.pagina + ")" : "") + ".",
            "Pregar as chapas (L07), começando pelo perímetro de cada chapa.",
            "Erguer, aprumar e fixar nos pilares e nos painéis vizinhos; guia inferior sobre o dormente, com as barras passantes (L06).",
            "Hold-downs nas pontas dos painéis (L05): chapas no montante, barra até a viga do piso, placa e porca por baixo.",
            "Travessas ficam onde a marcenaria pendura peso: nada pendurado só na chapa."
          ],
          atencao: chapaCalc && P.some(function (p) { return p.grupo === "WF_CHAPA" && !/evoply/i.test(p.nome + " " + p.material); }) ?
            "a fonte de peças descreve as chapas como " + esc(uniq(P.filter(function (p) { return p.grupo === "WF_CHAPA"; }).map(function (p) { return String(p.nome).split(" — ")[0].replace(/\s*\(.*$/, ""); })).join(" / ")) + "; o cálculo das paredes adotou " + esc(chapaCalc) + " (orçamento recebido) — comprar e pregar a chapa do cálculo." : null };
      },
      cob1: function () {
        var gs = ["COB_INF_VIGA", "COB_INF_BLOQ"], ez = eixoZ(gs);
        return { titulo: "Cobertura 1 (inferior" + (ez ? ", eixo " + nv3(ez.med) : "") + ")", sub: "Vigas " + secoesG(gs).join(" e ") + " de " + espTxt(gs) + " no vão dos pilares e bloqueadores entre elas",
          ligs: ["L03", "L04", "L08"], linhas: [Lrow(["COB_INF_VIGA"], "Viga da cobertura 1"), Lrow(["COB_INF_BLOQ"], "Bloqueador da cobertura 1")], prod: [],
          leg: "<b>Cobertura 1</b> — grelha de vigas (azul) com bloqueadores (azul claro) nos vãos",
          passos: [
            "Vigas entram entre as peças do pilar composto; furar pelo gabarito e passar as barras do L03, com porca e arruela larga dos dois lados.",
            "Bloqueadores entre as vigas: tirefonds pela lateral da viga; com bloqueador dos dois lados, furação desencontrada (L04).",
            "Longarina que chega de topo em outra viga: cantoneiras inox com tirefonds (L08).",
            "Eixo das vigas em " + (ez ? nv3(ez.med) : "nível das pranchas") + ", horizontal. Trabalho em altura conforme NR-35 e içamento conforme NR-18."
          ] };
      },
      travamento: function () {
        return { titulo: "Travamento definitivo e retirada do escoramento", sub: "Sem peça nova: conferir o que trava a estrutura e só então tirar o escoramento provisório",
          ligs: ["L02", "L03", "L05", "L01"], linhas: [], prod: [], destaque: ["PILAR_PECA", "PILAR_BLOQ", "COB_INF_VIGA", "COB_INF_BLOQ", "WF_CHAPA"],
          leg: "<b>O que trava</b> — pilares compostos com bloqueadores, vigas da cobertura 1 e chapas dos painéis; o resto em cinza",
          passos: [
            "Cobertura 1 completa: todas as vigas e bloqueadores aparafusados (L03, L04, L08).",
            "Todos os bloqueadores em cruz com as barras do L02 e o pé de cada pilar fixado (L01).",
            "Prumo dos pilares até 1/500 da altura; painéis fixados nos pilares; hold-downs (L05) e barras da guia (L06) apertados.",
            "Fotografar cada ligação com a ferragem visível antes de fechar; só então retirar o escoramento provisório."
          ] };
      },
      forro: function () {
        var gs = ["FORRO_BARROTE"], ps = pecasG(gs), ez = eixoZ(gs);
        var h = ps.length ? ps[0].extensoes_m[1] : 0;
        return { titulo: "Coberturas internas — barrotes do forro", sub: ps.length + " barrotes " + secoesG(gs).join(" e ") + " de " + espTxt(gs) + " sobre as guias superiores dos blocos" + (ez ? ", eixo a " + nv3(ez.med) : ""),
          ligs: [], linhas: [Lrow(gs, "Barrote do forro")], prod: [{ id: "nibra-wf-estrutura-pinus", variante: null, uso: "barrote de Pinus autoclavado (seção 5×15 da linha Wood Framing)" }],
          leg: "<b>Coberturas internas</b> — barrotes do forro (verde) dos blocos fechados, entre as paredes",
          passos: [
            "Apoiar os barrotes sobre as guias superiores dos painéis, nas posições da planta, com o topo em " + (ez ? nv3(ez.med + h / 2) : "nível das pranchas") + ".",
            "Barrotes cortados nas faces internas das paredes: não passam por cima das paredes nem saem do bloco.",
            "O vidro plano dos blocos e o forro ripado entram na etapa " + (EN.cob_camadas || "das camadas da cobertura") + "."
          ] };
      },
      cob2: function () {
        var gs = ["COB_SUP_VIGA", "COB_SUP_BLOQ"], ez = eixoZ(["COB_SUP_VIGA"]);
        return { titulo: "Cobertura 2 (superior" + (ez ? ", " + nv(ez.min) + " a " + nv(ez.max) : "") + ")", sub: "Vigas " + secoesG(gs).join(" e ") + " de " + espTxt(gs) + " com caimento para o fundo, no vão dos pilares e sobre a cobertura 1",
          ligs: ["L03", "L08"], linhas: [Lrow(["COB_SUP_VIGA"], "Viga da cobertura 2"), Lrow(["COB_SUP_BLOQ"], "Bloqueador da cobertura 2")], prod: [],
          leg: "<b>Cobertura 2</b> — vigas (roxo) longitudinais e transversais nos eixos dos pilares",
          passos: [
            "Última etapa da madeira: só depois da cobertura 1 e dos barrotes do forro.",
            "Vigas transversais no vão do pilar com as barras do L03; longitudinais apoiadas nas transversais com cantoneiras inox (L08).",
            "Conferir o caimento com nível a laser antes de aparafusar: eixos das vigas entre " + (ez ? nv3(ez.min) + " e " + nv3(ez.max) : "os níveis das pranchas") + "; o caimento já está nos níveis e nos comprimentos das peças.",
            "Topo dos pilares cortado no nível da cobertura 2: nenhuma peça solta acima das vigas; furos e cortes da obra com preservativo (2 demãos)."
          ] };
      },
      ripado: function () {
        var nf = somaQ(ripFach), np = somaQ(ripPort);
        var comp = Object.keys(ripFach).sort(function (a, b) { return parseFloat(b) - parseFloat(a); }).slice(0, 4).map(function (k) { return ripFach[k] + " × " + br(parseFloat(k), 2) + " m"; }).join(" · ");
        /* ripado não é peça da fonte: espécie pela regra do cliente (MadEspecie: BRISE|RIPADO|PERGOLADO → Itaúba) */
        var ME = req("MadEspecie", "madespecie.js"), rgR = ME && ME.QUIOSQUE ? ME.regraDe({ grupo: "RIPADO" }, opcoes.especies || ME.QUIOSQUE) : null;
        var espR = rgR ? NOME_ESPECIE[rgR.especie] || rgR.especie : "Itaúba";
        return { titulo: "Fechamento lateral — membrana e ripado de fachada", sub: "Membrana corta-vento sobre as chapas e ripas verticais 3×3 de " + espR + " — " + nf + " ripas nas paredes" + (np ? " e " + np + " nos portões" : "") + " (arquitetura)",
          ligs: [], linhas: [{ ripado: true }], prod: [{ id: "eurovent-home", uso: "membrana corta-vento sobre a chapa externa (orçamento recebido)" }, { id: "eurovent-topband", uso: "emendas e reparos da membrana (base de polipropileno)" },
            { id: "eurovent-unisan", uso: "tubos e passagens que atravessam a membrana" }], ripado: true,
          leg: "<b>Ripado de fachada</b> (castanho) por fora dos painéis de wood frame; a estrutura já montada em cinza",
          passos: [
            "Só depois dos painéis aprumados, com hold-downs e barras da guia apertados e as chapas pregadas (etapa " + (EN.paineis || "dos painéis") + ").",
            "Membrana Eurovent HOME por fora de toda a chapa externa, do piso acabado ao topo das paredes; emendas e reparos com a fita TOPBAND" + (topT != null ? " (aplicar a partir de " + topT + " °C)" : "") + " e passagens de tubo com a UNISAN.",
            homeUV ? "Cobrir a membrana com o ripado em até " + String(homeUV).replace(/\s*\(.*$/, "") + ": é o limite de exposição ao sol da ficha (Eurovent HOME, p. 2)." : "Cobrir a membrana com o ripado logo depois de instalada.",
            "Ripas 3×3 na vertical, nas posições da arquitetura" + (comp ? ": " + comp + (Object.keys(ripFach).length > 4 ? " e outras" : "") : "") + " — " + br(somaM(ripFach), 0) + " m nas paredes.",
            "Cortes e furos da obra com preservativo (2 demãos), como toda madeira desta obra."
          ] };
      },
      camadas: function () {
        var esp = N.topo_painel != null ? Math.round(Math.abs(N.topo_painel - (N.piso_acabado || 0)) * 100) : null;
        return { titulo: "Camadas do piso e impermeabilização", sub: (esp != null ? esp + " cm do topo do Painel Wall ao piso acabado" : "Do Painel Wall ao piso acabado") + ": manta, contrapiso armado e revestimento, por zona",
          ligs: [], linhas: [], camadas: true, pwCor: true, figBaixa: true,
          prod: [{ id: "eternit-painel-wall-40", uso: "regras de contrapiso e revestimento sobre o painel (catálogo p. 28)" }, { id: "decorlit-painel-wall-40", uso: "contrapiso sobre o painel (manual p. 16)" }],
          leg: "<b>Piso seco pronto para as camadas</b> — Painel Wall impermeabilizado, dormentes das paredes por cima",
          passos: [
            "Painel Wall já impermeabilizado na etapa " + (EN.pw || "do piso") + ": conferir as bordas cortadas seladas e os parafusos embutidos.",
            "1ª barreira: manta asfáltica com primer sobre todo o painel, subindo nas paredes e com pingadeira nas bordas externas (pacotes ao lado).",
            "Contrapiso armado flutuante, com caimento para os ralos nas áreas molhadas" + (contraMin ? " e no mínimo " + contraMin + " mm (Decorlit, manual p. 16)" : "") + "; contrapiso e piso afastados no mínimo 3 mm de paredes e pilares (Eternit, catálogo p. 28).",
            "Áreas molhadas: 2ª barreira de manta líquida ligada ao ralo, antes do revestimento.",
            "Revestimento de cada zona com argamassa colante AC-III e rejunte flexível" + (etContra ? " (Eternit, catálogo p. 28)" : "") + "."
          ] };
      },
      cob_camadas: function () {
        return { titulo: "Camadas da cobertura (arquitetura)", sub: "O que vai sobre a madeira das coberturas: ripado e vidro laminado nos dois níveis",
          ligs: [], linhas: [], vidro: true, destaque: ["COB_INF_VIGA", "COB_INF_BLOQ", "COB_SUP_VIGA", "COB_SUP_BLOQ", "FORRO_BARROTE"], figBaixa: true, cobPilha: true,
          prod: [{ id: "cebrace-laminado", uso: "vidro laminado de segurança (NBR 7199 para coberturas)" }, { id: "vivix-lamina", uso: "vidro laminado de segurança — alternativa" },
            { id: "agc-stratobel", uso: "vidro laminado de segurança — alternativa" }, { id: "sika-sikasil-ws-305-eu", uso: "selante de vedação do vidro" }],
          leg: "<b>Madeira completa</b> — as duas coberturas e o forro com o vidro laminado dos dois níveis (azul)",
          passos: [
            "Cobertura alta: sobre as vigas da cobertura 2, ripado 3×3 de Itaúba e vidro laminado de segurança (NBR 7199), com caimento para o fundo.",
            "Blocos fechados: vidro laminado plano rente ao topo das paredes, sobre os barrotes do forro, com o forro ripado por baixo.",
            "Vidro laminado nos dois níveis, na espessura que o vidraceiro definir pelo vão entre apoios; junta do vidro com a madeira em silicone neutro de vedação.",
            "A equipe da madeira garante: caimento da cobertura 2, topo das paredes reto e nenhuma peça solta acima das vigas."
          ] };
      },
      checagens: function () {
        return { titulo: "Checagens finais", sub: "Antes de liberar a estrutura para as camadas, instalações e acabamentos",
          ligs: ["L01", "L02", "L03", "L05", "L06", "L08", "L09", "L10"], linhas: [], prod: [], tudo: true, checklist: true,
          leg: "<b>Estrutura de madeira completa</b> — " + P.filter(function (p) { return p.grupo !== "FERRAGEM"; }).length + " peças de madeira e chapa",
          passos: [
            "Pilares: prumo até 1/500 da altura; todos os bloqueadores em cruz com as barras do L02; pé de cada pilar fixado (L01).",
            "Piso: VP niveladas (topo " + nv(N.topo_VP) + "); cada cruzamento barrote × VP com tirefond (L10); Painel Wall sem balanço, parafusos embutidos e bordas seladas.",
            "Painéis e coberturas: barras da guia (L06) e hold-downs (L05) completos; barras do L03 com porca e arruela dos dois lados; cantoneiras do L08; caimento da cobertura 2.",
            "Ferragens e madeira: tudo em inox A4; nenhuma peça substituída, emendada ou furada fora da ficha; cortes e furos da obra com preservativo.",
            "Registro: foto de cada ligação antes de fechar, identificada por marca e etapa deste manual; divergência comunicada ao responsável técnico por escrito."
          ] };
      }
    };
    function etGenerica(ch) {
      var ps = etapaPecas[ch] || [], gs = uniq(ps.map(function (p) { return p.grupo; }));
      var f = ch.replace(/^fase_/, "");
      return { titulo: faseTxt[f] || ("Fase " + f), sub: "Peças da fase " + f + " da fonte", ligs: [], linhas: gs.map(function (g) { return Lrow([g], (grupos[g] && grupos[g].descricao) || g); }), prod: [],
        leg: "<b>" + esc(faseTxt[f] || f) + "</b>",
        passos: ["Conferir a marca de cada peça com a ficha de corte antes de montar.", "Montar as peças nas posições das pranchas, na ordem da fonte.", "Fixar cada peça com a ligação indicada nas pranchas antes de passar à etapa seguinte."] };
    }

    /* ---------- cena 3D: sólidos por etapa */
    var montada = {};      // chave → índice da etapa em que entra
    defs.forEach(function (d) { montada[d.chave] = d.n; });
    var solPecas = P.filter(function (p) { return p.grupo !== "FERRAGEM" && p.p0 && p.p1; }).map(function (p) {
      return { caixa: caixaPeca(p), grupo: p.grupo, etapa: montada[chaveDe[p.id]] || 0, id: p.id };
    });
    var solConc = (F.concreto || []).map(function (c) {
      var t = c.pt || c;
      return { caixa: caixaAlinhada(t.xt - t.dx_t / 2, t.xt + t.dx_t / 2, t.yt - t.dy_t / 2, t.yt + t.dy_t / 2, t.topo - 0.8, t.topo), grupo: "CONCRETO", etapa: EN.apoios || 0 };
    });
    var solPW = pwPaineis.filter(function (x) { return x.contorno_t && x.contorno_t.length >= 3; }).map(function (x) {
      var z = x.contorno_t[0][2];
      return { laje: { contorno: x.contorno_t, z0: z, z1: z + 0.04 }, grupo: "PW", etapa: EN.pw || 0 };
    });
    var solRip = ripas.map(function (c) { return { caixa: c, grupo: "RIPADO", etapa: EN.ripado || 0 }; });
    var solVid = vidros.map(function (c) { return { caixa: c, grupo: "VIDRO", etapa: EN.cob_camadas || 999 }; });
    var corExtra = {}, kx = 0;
    function corGrupo(g) { if (COR[g]) return COR[g]; if (!corExtra[g]) corExtra[g] = PALETA_EXTRA[kx++ % PALETA_EXTRA.length]; return corExtra[g]; }

    /* câmera única: enquadrada no conjunto inteiro (madeira + pilaretes + Painel Wall + ripado) */
    var cfgCam = opcoes.camera || {};
    var cam0 = camera(cfgCam.azimute != null ? cfgCam.azimute : -22, cfgCam.elevacao != null ? cfgCam.elevacao : 27);
    var ptsTodos = [];
    solPecas.concat(solConc).concat(solRip).forEach(function (s) { ptsTodos = ptsTodos.concat(vertices(s.caixa)); });
    solPW.forEach(function (s) { s.laje.contorno.forEach(function (q) { ptsTodos.push([q[0], q[1], s.laje.z1]); }); });
    /* eixos (pilares) */
    var pil = {};
    pecasG(["PILAR_PECA"]).forEach(function (p) { (pil[p.pilar] = pil[p.pilar] || []).push(p.p0); });
    function grupar(vs, tol) { vs = vs.slice().sort(function (a, b) { return a - b; }); var g = []; vs.forEach(function (v) { if (!g.length || v - g[g.length - 1].v > tol) g.push({ v: v, n: 1, s: v }); else { var u = g[g.length - 1]; u.n++; u.s += v; u.v = v; } }); return g.map(function (x) { return x.s / x.n; }); }
    var pxy = Object.keys(pil).map(function (k) { var a = pil[k]; return [a.reduce(function (s, q) { return s + q[0]; }, 0) / a.length, a.reduce(function (s, q) { return s + q[1]; }, 0) / a.length]; });
    var ex = grupar(pxy.map(function (q) { return q[0]; }), 0.6), ey = grupar(pxy.map(function (q) { return q[1]; }), 0.6);
    var zLab = (N.topo_concreto != null ? N.topo_concreto : -0.6) - 0.85, xMin = ex.length ? ex[0] : 0, yMin = ey.length ? ey[0] : 0;
    var rot3d = ex.map(function (x, i) { return { p: [x, yMin - 1.0, zLab], t: String(i + 1) }; }).concat(ey.map(function (y, i) { return { p: [xMin - 1.0, y, zLab], t: String.fromCharCode(65 + i) }; }));
    rot3d.forEach(function (r) { ptsTodos.push(r.p); });
    var FIG_W = 230, FIG_H = 132, CH3D = 0.8;      /* trecho máximo (m) das peças longas na ordem do pintor */
    var camE = enquadrar(cam0, ptsTodos, FIG_W, FIG_H, 0.03);
    var camCapa = enquadrar(cam0, ptsTodos, 274, 136, 0.02);
    var camSum = enquadrar(cam0, ptsTodos, 150, 78, 0.03);
    var camPl = enquadrar(camera(0, 90), ptsTodos, 222, 62, 0.04);
    var rotPl = ex.map(function (x, i) { return { p: [x, yMin - 0.9, 0], t: String(i + 1) }; }).concat(ey.map(function (y, i) { return { p: [xMin - 0.9, y, 0], t: String.fromCharCode(65 + i) }; }));

    function solidosPara(n, modo) {
      var lim = modo.ate || n;
      /* modo: { destaque: [grupos] | null, tudo: bool, pwCor, conc, vidro } */
      var out = [];
      function cor(g) { return corGrupo(g); }
      solConc.forEach(function (s) { var ehDaEtapa = s.etapa === n; out.push({ caixa: s.caixa, cor: cor("CONCRETO"), ghost: !(ehDaEtapa || modo.tudo || modo.conc), semAresta: false }); });
      solPW.forEach(function (s) { if (s.etapa > lim && !modo.tudo) return; var c = s.etapa === n || modo.tudo || modo.pwCor; out.push({ laje: s.laje, cor: cor("PW"), ghost: !c }); });
      solPecas.forEach(function (s) {
        if (s.etapa > lim && !modo.tudo) return;
        var c = modo.tudo || (modo.destaque ? modo.destaque.indexOf(s.grupo) >= 0 : s.etapa === n);
        out.push({ caixa: s.caixa, cor: cor(s.grupo), ghost: !c });
      });
      solRip.forEach(function (s) { if (s.etapa > lim && !modo.tudo) return; out.push({ caixa: s.caixa, cor: cor("RIPADO"), ghost: !(s.etapa === n || modo.tudo), semAresta: true, ch: 99 }); });
      if (modo.vidro) solVid.forEach(function (s) { out.push({ caixa: s.caixa, cor: cor("VIDRO"), ghost: false, transp: 0.42 }); });
      return out;
    }

    /* ---------- legenda fixa */
    function legTxt(gs, nome) { var e = espTxt(gs); return nome + (e ? " — " + e : ""); }
    var LEG = [];
    function legAdd(g, txt) { if (g === "PW" || g === "CONCRETO" || g === "RIPADO" || g === "VIDRO" || temGrupo(new RegExp("^" + g + "$"))) LEG.push([corGrupo(g), txt]); }
    legAdd("PILAR_PECA", legTxt(["PILAR_PECA"], "Pilar composto")); legAdd("PILAR_BLOQ", "Bloqueador em cruz do pilar");
    legAdd("PISO_VIGA", legTxt(["PISO_VIGA"], "Viga principal do piso (VP)")); legAdd("PISO_BARROTE", legTxt(["PISO_BARROTE"], "Barrote do piso"));
    legAdd("PISO_BLOQ_VP", "Bloqueio, requadro e testeira do piso"); legAdd("PISO_DORMENTE", "Dormente sob parede");
    legAdd("COB_INF_VIGA", legTxt(["COB_INF_VIGA"], "Cobertura 1 — vigas e bloqueadores")); legAdd("COB_SUP_VIGA", legTxt(["COB_SUP_VIGA"], "Cobertura 2 — vigas"));
    legAdd("FORRO_BARROTE", legTxt(["FORRO_BARROTE"], "Barrote do forro")); legAdd("WF_MONTANTE", legTxt(["WF_MONTANTE"], "Wood frame: montantes, guias, vergas"));
    legAdd("WF_CHAPA", "Chapa de fechamento do painel"); if (pwPaineis.length) legAdd("PW", "Painel Wall 40 mm (piso seco)");
    if (solConc.length) legAdd("CONCRETO", "Pilarete de concreto (fundação)"); if (ripas.length) legAdd("RIPADO", "Ripado de fachada 3×3 (arquitetura)");
    if (vidros.length) legAdd("VIDRO", "Vidro laminado da cobertura (arquitetura)");
    Object.keys(corExtra).forEach(function (g) { LEG.push([corExtra[g], (grupos[g] && grupos[g].descricao) || g]); });
    LEG.push([GHOST, "Já montado nas etapas anteriores"]);
    function legendaHtml(cls) { return '<div class="' + cls + '">' + LEG.map(function (l) { return '<div><i style="background:' + l[0] + '"></i>' + esc(l[1]) + "</div>"; }).join("") + "</div>"; }

    /* ---------- plano de páginas */
    var paginas = [];
    function pag(secao, titulo, tipo, extra) { var p = { n: paginas.length + 1, secao: secao, titulo: titulo, tipo: tipo }; for (var k in extra) p[k] = extra[k]; paginas.push(p); return p; }
    pag("Abertura", "Capa", "capa"); pag("Abertura", "Sumário", "sumario"); pag("Abertura", "Como ler este manual", "como_ler");
    var etapas = defs.map(function (d) {
      var c = ET[d.chave] ? ET[d.chave]() : etGenerica(d.chave);
      var ps = (etapaPecas[d.chave] || []);
      var e = { n: d.n, chave: d.chave, fase: d.fase, faseTexto: d.fase ? faseTxt[d.fase] || "" : "", titulo: c.titulo, sub: c.sub, passos: c.passos.filter(Boolean), def: c,
        pecas: ps.map(function (p) { return p.id; }), produtos: prodLista(c.prod || []), ligacoes: ligLinhas(c.ligs || []), folha: folhas[d.chave] || null };
      e.pagina = pag("Etapas de montagem", "Etapa " + d.n + " — " + c.titulo, "etapa", { etapa: d.n });
      return e;
    });
    pag("Fecho", "Tabela resumida de peças, ligações e produtos", "tabela");
    var NPAG = paginas.length;
    etapas.forEach(function (e) {
      var gsE = uniq((etapaPecas[e.chave] || []).map(function (p) { return p.grupo; }));
      reprovGrupo.forEach(function (rg) {
        if (gsE.some(function (g) { return rg.re.test(g); })) {
          var t = "o cálculo desta revisão não aprova " + rg.r.membros.length + " membro(s) de " + esc(rg.r.funcao) + " — não montar esta etapa antes da decisão do responsável técnico.";
          e.def.atencao = e.def.atencao ? e.def.atencao + " Também: " + t : t;
        }
      });
    });

    /* ---------- moldura */
    var abaSec = {}, secs = ["Etapas de montagem", "Fecho"];
    secs.forEach(function (s, k) { abaSec[s] = [12 + k * 31, 29]; });
    var tituloObra = (obra.nome || "Obra") + " · Estrutura de madeira · Manual de montagem";
    /* logos uma vez só, no CSS (data URL repetida em cada rodapé inchava o HTML) */
    function logoHtml(qual, alt, w, h) {
      var src = qual === "ra" ? logos.ra : logos.contratante;
      return src ? '<i class="logo-' + qual + '" title="' + esc(alt) + '" style="width:' + w + "mm;height:" + h + 'mm"></i>' : '<span>' + esc(alt) + "</span>";
    }
    function moldura(p, corpo, comLegenda) {
      var aba = abaSec[p.secao] ? '<div class="aba" style="top:' + abaSec[p.secao][0] + "mm;height:" + abaSec[p.secao][1] + 'mm">' + esc(p.secao) + "</div>" : "";
      var rod = '<div class="rod"><div class="lg">' + logoHtml("ra", "RA", 13, 13) + "<span>" + esc(rt.empresa ? "RA ENGENHARIA" : "RA ENGENHARIA") + "<br>ESPECIAL</span></div>" +
        '<div class="tt"><div class="obra">' + esc(tituloObra) + '</div><div class="tit">' + esc(p.titulo) + "</div></div>" +
        '<div class="sec"><b>' + esc(p.secao) + "</b><br>Ilustrações sem escala, mesma vista<br>Seções em cm · níveis em m</div>" +
        '<div class="doc">' + esc(doc.numero || "") + " · Revisão " + esc(doc.revisao || "") + " · " + esc(doc.data || "") + "<br>RT " + esc((rt.abrev || "") + " " + (rt.nome || "")) + "<br>" + esc(rt.conselho || "CREA") + " nº " + esc(rt.crea || "") + "</div>" +
        '<div class="nf">' + logoHtml("ct", obra.contratante || "", 25, 12.5) + "</div>" +
        '<div class="np"><b>' + p.n + "</b><small>de " + NPAG + "</small></div></div>";
      return '<div class="pg" id="p' + p.n + '" data-tipo="' + p.tipo + '">' + corpo + (comLegenda ? legendaHtml("legenda-fixa") : "") + '<div class="mold"></div>' + rod + aba + "</div>";
    }

    /* ---------- páginas de abertura */
    var svgCapa = desenhar(camCapa, solidosPara(999, { tudo: true }), rot3d, CH3D);
    function capa(p) {
      var sit = [];
      if (doc.situacao) sit.push(esc(doc.situacao));
      if (resultado.ok === false) sit.push("Atenção: o cálculo desta revisão tem itens não atendidos (ver o memorial de cálculo) — manual não liberado para a obra.");
      var c = '<div class="capa"><div class="faixa"><div class="l1">' + logoHtml("ra", rt.empresa || "RA Engenharia Especial", 66, 50) + '</div><div class="l2">' + logoHtml("ct", obra.contratante || "", 60, 30) + "</div>" +
        '<div class="rod2"><b>' + esc(rt.empresa || "") + "</b><br>" + (rt.cnpj ? "CNPJ " + esc(rt.cnpj) + "<br>" : "") + esc(rt.endereco || "") + (rt.contato ? "<br>" + esc(rt.contato) : "") + "</div></div>" +
        '<div class="lin"></div><div class="lin2"></div>' +
        '<div class="txt"><div class="sup">Manual de montagem' + (opcoes.pranchas ? " · projeto executivo " + esc(opcoes.pranchas) : "") + '</div><div class="t1">Estrutura de madeira<br>' + esc(obra.nome || "") + "</div>" +
        '<div class="t2">' + etapas.length + " etapas, da preparação dos apoios às camadas do piso e da cobertura — para a equipe que monta as peças cortadas na fábrica</div>" +
        (sit.length ? '<div class="sit">' + sit.join("<br>") + "</div>" : "") + "</div>" +
        '<div class="hero">' + svgCapa + "</div>" +
        '<div class="t3"><b>Obra:</b> ' + esc([obra.nome, obra.endereco, obra.cidade].filter(Boolean).join(" — ")) +
        (obra.proprietario ? " · <b>Proprietário:</b> " + esc(obra.proprietario) + (obra.proprietarioCnpj ? " — CNPJ " + esc(obra.proprietarioCnpj) : "") : "") +
        (obra.contratante ? " · <b>Executora da estrutura de madeira:</b> " + esc(obra.contratante) : "") + "<br>" +
        "<b>Responsável técnico:</b> " + esc((rt.abrev || "") + " " + (rt.nome || "")) + " — " + esc(rt.conselho || "CREA") + " nº " + esc(rt.crea || "") + (rt.empresa ? " — " + esc(rt.empresa) : "") +
        (doc.base ? " · <b>Base:</b> " + esc(doc.base) : "") + "</div>" +
        '<div class="rv"><div>Documento<b>' + esc(doc.numero || "") + '</b></div><div>Revisão<b>' + esc(doc.revisao || "") + '</b></div><div>Data<b>' + esc(doc.data || "") + '</b></div><div>Formato<b>A3 · ' + NPAG + " páginas</b></div></div></div>";
      return '<div class="pg" id="p' + p.n + '" data-tipo="capa">' + c + "</div>";
    }
    function sumario(p) {
      var h = '<div class="cont"><h1><small>Sumário</small>As etapas, na ordem da obra</h1><div style="display:flex;gap:16mm"><div class="sum" style="width:210mm">', ult = null;
      paginas.forEach(function (q) {
        if (q.n <= 2) return;
        if (q.secao !== ult) { ult = q.secao; h += '<div class="s">' + esc(ult) + "</div>"; }
        h += '<div class="i">' + esc(q.titulo) + "<span></span><b>" + q.n + "</b></div>";
      });
      h += '</div><div style="width:150mm">';
      h += '<div style="margin-top:3mm">' + desenhar(camSum, solidosPara(999, { tudo: true }), [], CH3D) + "</div>";
      h += '<div class="box"><b>Documentos que este manual acompanha (e não substitui):</b><br>· Pranchas do projeto executivo' + (opcoes.pranchas ? " " + esc(opcoes.pranchas) : "") +
        ": plantas, cortes, elevações, detalhes das ligações e fichas de corte por marca;<br>· Memorial de cálculo da estrutura de madeira;<br>· Quantitativos e modelo BIM (IFC) da mesma revisão;<br>· Projeto da fundação.</div>";
      h += '<div class="box"><b>Produtos citados:</b> cada etapa traz os produtos do catálogo do sistema (fabricante, código, página do catálogo e link do fabricante). ' +
        "A instalação de cada produto segue o manual do fabricante; onde o manual dá número (junta, espaçamento, exposição ao sol), ele está no texto da etapa com a página.</div>";
      h += '<div class="box"><b>Madeira por função</b> (especificação do cliente):<br>' + especiesHtml() + "</div></div></div></div>";
      return moldura(p, h, false);
    }
    function especiesHtml() {
      var por = (resultado.especies && resultado.especies.porEspecie) || {}, rs = {};
      ((resultado.especies && resultado.especies.pecas) || []).forEach(function (e) { var k = e.para; rs[k] = rs[k] || {}; rs[k][(grupos[e.grupo] && grupos[e.grupo].descricao) || e.grupo] = 1; });
      return Object.keys(por).map(function (k) {
        var funcs = Object.keys(rs[k] || {});
        return "· <b>" + esc(NOME_ESPECIE[k] || k) + "</b> — " + por[k].n + " peças, " + br(por[k].volume_m3, 2) + " m³: " + esc(funcs.slice(0, 4).join(", ").toLowerCase()) + (funcs.length > 4 ? " e outras" : "");
      }).join("<br>");
    }
    function comoLer(p) {
      var ordem = etapas.map(function (e) { return "<li>" + esc(e.titulo) + " <em style='color:#6F5F48;font-style:normal'>(p. " + e.pagina.n + ")</em></li>"; }).join("");
      var origem = uniq(((resultado.especies && resultado.especies.pecas) || []).map(function (e) { return e.regra && e.regra.origem ? String(e.regra.origem).split(";")[0] : null; }).filter(Boolean));
      var c = '<div class="cont"><h1><small>Como ler este manual</small>Cores, códigos e convenções</h1><div style="display:flex;gap:10mm">' +
        '<div style="width:150mm"><h2>Cores das peças (as mesmas em todas as páginas)</h2>' + legendaHtml("legenda") +
        "<h2>Em cada etapa</h2><p>A ilustração grande mostra a estrutura sempre do <b>mesmo ponto de vista</b>: as <b>peças da etapa em cor</b> e o que já foi montado <b>em cinza claro</b>; abaixo, a planta de onde as peças vão. " +
        "Ao lado: o que fazer, as peças (marca, seção, quantidade e madeira), como fixar e os produtos do catálogo com o link do fabricante. \"Ver folha\" aponta a prancha do projeto executivo com o detalhe.</p></div>" +
        '<div style="width:110mm"><h2>Marcas e fichas de corte</h2><p>Cada peça chega da fábrica com a sua <b>marca</b> (sigla + número, ex. <b>VP-07</b>). Peças com a mesma marca são idênticas: mesma seção, comprimento e furação. ' +
        "Na obra não se corta nem se fura fora da ficha; o identificador BIM de cada peça fica no modelo e no IFC, na obra vale a marca.</p>" +
        '<h2>Ligações</h2><p>Cada tipo de ligação tem um código (<span class="chip">L01</span> a <span class="chip">L15</span>); a ferragem está na etapa em que a ligação é feita. Ferragens em <b>aço inox A4</b>: obra junto ao mar — nada de aço carbono ou zincado. ' +
        "Porca e arruela larga dos dois lados nas barras passantes; aperto firme sem esmagar a madeira; reaperto depois da primeira estação seca.</p>" +
        "<h2>Madeira</h2><p>A espécie de cada peça é a da especificação do cliente" + (origem.length ? " (" + esc(origem[0]) + ")" : "") + ":</p><p style='font-size:8.6pt'>" + especiesHtml() + "</p>" +
        "<h2>Níveis e eixos</h2><p><span class='nivel'>0,00</span> = piso acabado. Topo do Painel Wall <span class='nivel'>" + nv(N.topo_painel) + "</span> · barrotes <span class='nivel'>" + nv(N.topo_barrote) +
        "</span> · VP <span class='nivel'>" + nv(N.topo_VP) + "</span> · pé dos pilares <span class='nivel'>" + nv(N.topo_pilarete) + "</span> · concreto <span class='nivel'>" + nv(N.topo_concreto) + "</span>. " +
        "Eixos numerados ao longo da estrutura e letras no sentido transversal, os mesmos da fundação.</p></div>" +
        '<div style="width:112mm"><h2>Ordem das etapas</h2><ol style="font-size:8.8pt">' + ordem + "</ol>" +
        '<div class="box">A ordem é a das fases de montagem da fonte de peças (' + esc(fasesOrd.filter(function (f) { return f !== "M99"; }).join(", ")) + "): o piso seco vem antes dos pilares porque o pilar composto desce ao lado da viga do piso até o pilarete, e os painéis de wood frame são montados deitados sobre o piso e erguidos. " +
        "Ripado e camadas vêm depois da madeira.</div>" +
        '<div class="box"><b>Fora deste manual:</b> fundação e locação das estacas; esquadrias, calhas e forro ripado (arquitetura); hidráulica e elétrica.</div></div></div></div>';
      return moldura(p, c, false);
    }

    /* ---------- página de etapa */
    function linhasPecas(e) {
      var rows = [];
      (e.def.linhas || []).forEach(function (l) {
        if (l.pw) {
          if (pwPaineis.length) rows.push(["PW", "Painel Wall 40 mm — recortes", "4,0", String(pwPaineis.length), br(pwArea, 1) + " m²", esc((pwProduto || "Painel Wall").replace(/ Painel Wall.*/, ""))]);
          return;
        }
        if (l.ripado) {
          var nf = somaQ(ripFach), np = somaQ(ripPort), ks = Object.keys(ripFach).map(parseFloat);
          if (nf) rows.push(["—", "Ripa de fachada (vertical)", "3×3", String(nf), br(Math.min.apply(null, ks), 2) + "–" + br(Math.max.apply(null, ks), 2) + " m", "Itaúba"]);
          if (np) rows.push(["—", "Ripa dos portões", "3×3", String(np), br(Math.max.apply(null, Object.keys(ripPort).map(parseFloat)), 2) + " m", "Itaúba"]);
          return;
        }
        var ps = (etapaPecas[e.chave] || []).filter(function (p) { return l.grupos.indexOf(p.grupo) >= 0; });
        if (!ps.length) return;
        var pref = uniq(l.grupos.filter(function (g) { return grupos[g] && ps.some(function (p) { return p.grupo === g; }); }).map(function (g) { return grupos[g].prefixo; }));
        var secs = uniq(ps.filter(function (p) { return p.secao_cm; }).map(function (p) { return sec(p.secao_cm); }));
        if (!secs.length && ps[0].grupo === "WF_CHAPA") secs = [br(ps[0].extensoes_m[2] * 1000, 1) + " mm"];
        var comp = ps.map(function (p) { return p.comprimento_m || 0; });
        var esp = uniq(ps.map(especieTxt)).filter(Boolean);
        if (ps[0].grupo === "WF_CHAPA") esp = [chapaCalc || "chapa"];
        rows.push([esc(pref.join("/")), esc(l.nome), esc(secs.slice(0, 3).join(" · ")), String(ps.length),
          ps[0].grupo === "FERRAGEM" ? "—" : br(Math.min.apply(null, comp), 2) + "–" + br(Math.max.apply(null, comp), 2) + " m", esc(esp.join(" / "))]);
      });
      e.linhasPecas = rows;
      return rows;
    }
    function camadasPilhas(w) {
      if (!CAM || !CAM.pacotes) return "";
      var CORES_CAM = { revest: "#b9a27a", cola: "#d9d2c4", imperm2: "#2b7bb9", contrapiso: "#bfc4c8", manta: "#222222" };
      var NOMES = { terrazzo: "Salão, bar e depósito", banheiro: "Sanitários", externo: "Circulação externa", ducha: "Ducha" };
      var h = '<div style="position:absolute;left:24mm;top:' + (34 + FIG_H + 8) + 'mm;width:230mm;display:flex;flex-wrap:wrap;gap:1.5mm 6mm">';
      Object.keys(CAM.pacotes).forEach(function (k) {
        var cam = CAM.pacotes[k].map(function (c) {
          var t = String(c[1]), nota = "", m = /^\[([^\]]*)\]\s*/.exec(t);
          if (m) { nota = m[1]; t = t.slice(m[0].length); }
          t = t.replace(/\s*\(.*?\)\s*$/, "").replace(/ — .*$/, "");
          return [t.charAt(0).toUpperCase() + t.slice(1) + (nota ? " · " + nota : ""), c[2], CORES_CAM[c[0]] || "#ccc"];
        });
        cam.push(["Painel Wall 40 mm, impermeabilizado", 4.0, COR.PW]);
        var z = (CAM.zonas || {})[k] || {};
        var esc2 = 1.35, hmin = 3.2, hs = cam.map(function (c) { return Math.max(hmin, c[1] * esc2); }), H = hs.reduce(function (s, x) { return s + x; }, 0) + 11;
        var s = '<svg xmlns="http://www.w3.org/2000/svg" width="112mm" height="' + f1(H) + 'mm" viewBox="0 0 112 ' + f1(H) + '">';
        s += '<text x="0" y="3.6" font-size="3.1" font-weight="700" fill="#00406A">' + esc((NOMES[k] || k) + (z.area_m2 ? " · " + br(z.area_m2, 1) + " m²" : "") + " · de cima para baixo") + "</text>";
        var y = 6;
        cam.forEach(function (c, i) {
          var hh = hs[i], esc3 = c[2] === "#222222" || c[2] === "#2b7bb9";
          s += '<rect x="0" y="' + f1(y) + '" width="26" height="' + f1(hh) + '" fill="' + c[2] + '" stroke="#333" stroke-width=".22"/>';
          s += '<text x="25" y="' + f1(y + hh / 2 + 0.9) + '" font-size="2.4" text-anchor="end" fill="' + (esc3 ? "#fff" : "#333") + '">' + br(c[1], 1) + " cm</text>";
          s += '<text x="28" y="' + f1(y + hh / 2 + 1) + '" font-size="2.6" fill="#1d2a33">' + esc(String(c[0]).slice(0, 74)) + "</text>";
          y += hh;
        });
        if (z.peso_camadas_kN_m2 != null) s += '<text x="0" y="' + f1(y + 3.3) + '" font-size="2.5" fill="#6F5F48">camadas ' + br(z.peso_camadas_kN_m2, 2) + " kN/m² (peso considerado no cálculo do piso)</text>";
        h += '<div style="width:112mm">' + s + "</svg></div>";
      });
      return h + "</div>";
    }
    function cobPilha() {
      var vs = eixoZ(["COB_SUP_VIGA"]), sv = secoesG(["COB_SUP_VIGA"])[0], si = secoesG(["COB_INF_VIGA"])[0], sf = secoesG(["FORRO_BARROTE"])[0];
      function pilha(tit, cam, rod) {
        var H = cam.length * 8 + 13, s = '<svg xmlns="http://www.w3.org/2000/svg" width="112mm" height="' + H + 'mm" viewBox="0 0 112 ' + H + '">';
        s += '<text x="0" y="3.6" font-size="3.1" font-weight="700" fill="#00406A">' + esc(tit) + "</text>";
        cam.forEach(function (c, i) { var y = 6 + i * 8; s += '<rect x="0" y="' + y + '" width="26" height="7" fill="' + c[1] + '" stroke="#333" stroke-width=".22"/><text x="29" y="' + (y + 4.6) + '" font-size="2.7" fill="#1d2a33">' + esc(c[0]) + "</text>"; });
        return s + '<text x="0" y="' + (H - 1.5) + '" font-size="2.5" fill="#6F5F48">' + esc(rod) + "</text></svg>";
      }
      var alta = [["Vidro laminado de segurança (NBR 7199) — espessura pelo vão", COR.VIDRO], ["Ripado 3×3 de Itaúba (arquitetura)", COR.RIPADO]];
      if (sv) alta.push(["Vigas " + sv + " da cobertura 2 (etapa " + EN.cob2 + ")", COR.COB_SUP_VIGA]);
      if (si) alta.push(["Vigas " + si + " da cobertura 1 (etapa " + EN.cob1 + ")", COR.COB_INF_VIGA]);
      var bloco = [["Vidro laminado plano, rente ao topo das paredes", COR.VIDRO]];
      if (sf) bloco.push(["Barrotes " + sf + " do forro (etapa " + EN.forro + ")", COR.FORRO_BARROTE]);
      bloco.push(["Forro ripado 3×3 de Itaúba, por baixo (arquitetura)", COR.RIPADO]);
      return '<div style="position:absolute;left:24mm;top:' + (34 + FIG_H + 8) + 'mm;width:230mm;display:flex;gap:6mm"><div style="width:112mm">' +
        pilha("Cobertura alta — de cima para baixo", alta, vs ? "eixos das vigas da cobertura 2 entre " + nv3(vs.min) + " e " + nv3(vs.max) + " (caimento para o fundo)" : "") + '</div><div style="width:112mm">' +
        pilha("Cobertura dos blocos fechados — de cima para baixo", bloco, "sem caimento: os blocos ficam sob a cobertura alta") + "</div></div>";
    }
    function prodHtml(e) {
      if (!e.produtos.length) return "";
      return "<h2>Produtos (catálogo do fabricante)</h2>" + e.produtos.map(function (x) {
        var cod = x.codigo ? " · código " + esc(x.codigo) : "", pg = x.pagina ? " · p. " + x.pagina : "";
        var lk = x.link ? ' · <a href="' + esc(x.link.href) + '">' + esc(x.link.texto) + "</a>" : "";
        var ins = x.instalacao ? ' · manual de instalação: <a href="' + esc(x.instalacao.href) + '">' + esc(x.instalacao.texto.replace(/^https?:\/\//, "").slice(0, 48)) + (x.instalacao.texto.replace(/^https?:\/\//, "").length > 48 ? "…" : "") + "</a>" : "";
        var vid = x.video ? ' · vídeo: <a href="' + esc(x.video.href) + '">' + esc(x.video.texto) + "</a>" : "";
        var orc = x.orcamento ? " · orçamento " + esc(x.orcamento.fornecedor.split(" ")[0]) + " nº " + esc(x.orcamento.numero) + (x.orcamento.qtd ? " (" + br(x.orcamento.qtd, 0) + " " + esc(x.orcamento.unidade || "") + ")" : "") : "";
        return '<div class="prod"><b>' + esc(x.fabricante) + " — " + esc(x.nome) + "</b>" + cod + pg + orc + lk + ins + vid + (x.uso ? "<br><i>" + esc(x.uso) + "</i>" : "") + "</div>";
      }).join("");
    }
    function etapaPagina(e) {
      var d = e.def, n = e.n;
      var cab = '<div class="etapa-cab"><div class="num"><small>ETAPA</small><b>' + n + '</b></div><div><h1>' + esc(e.titulo) + '</h1><div class="sub">' + esc(e.sub) + " &nbsp; " + chips(uniq(e.ligacoes.map(function (l) { return l.codigo; }))) + "</div></div></div>";
      var modo = { destaque: d.destaque || null, tudo: !!d.tudo, pwCor: !!d.pwCor && !d.destaque, conc: !!d.conc, vidro: !!d.vidro };
      if (d.chave === "camadas" || e.chave === "camadas") modo = { destaque: ["PISO_DORMENTE"], pwCor: true, ate: EN.pw || n };
      var camF = camE;      /* a MESMA câmera (matriz e recorte) em todas as etapas */
      var svg = desenhar(camF, solidosPara(n, modo), rot3d, CH3D);
      e.camera = assinatura(camE);
      e.cameraUsada = assinatura(camF);
      e.matriz = { R: camF.R, U: camF.U, D: camF.D };
      var figs = '<div class="fig" style="left:24mm;top:34mm;width:' + FIG_W + 'mm">' + svg + '<div class="leg">' + d.leg + "</div></div>";
      if (d.camadas) figs += camadasPilhas();
      else if (d.cobPilha) figs += cobPilha();
      else if (!d.tudo || d.checklist) {
        var pl = desenhar(camPl, solidosPara(n, modo).filter(function (s) { return !s.transp; }), rotPl, 99);
        e.cameraPlanta = assinatura(camPl);
        figs += '<div class="fig borda" style="left:24mm;top:' + (34 + FIG_H + 10) + 'mm;width:' + FIG_W + 'mm;height:' + (250 - 34 - FIG_H - 10) + 'mm">' + pl + '<div class="leg"><b>Onde vão</b> — planta (vista de cima), mesma cor da ilustração</div></div>';
      }
      var t = "";
      if (d.checklist) t += "<h2>Lista de checagem</h2>" + tabela(["", "Conferir"], e.passos.map(function (x) { return ["☐", esc(x)]; }), [], ["7%", "93%"], "check");
      else t += "<h2>O que fazer</h2><ol>" + e.passos.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>";
      var rows = linhasPecas(e);
      if (rows.length) t += "<h2>Peças da etapa</h2>" + tabela(["Marca", "Peça", "Seção (cm)", "Qtd", "Comprimentos", "Madeira / material"], rows, [3], ["10%", "31%", "15%", "7%", "17%", "20%"]);
      if (e.ligacoes.length) {
        t += "<h2>" + (d.chave === "travamento" || d.checklist || e.chave === "travamento" || e.chave === "checagens" ? "Ligações a conferir" : "Como fixar") + "</h2>" +
          tabela(["Lig.", "Ligação e ferragem (inox A4)", "Qtd"], e.ligacoes.map(function (l) {
            return ['<span class="chip">' + esc(l.codigo) + "</span>", "<b>" + esc(l.tipo) + "</b>" + (e.chave === "checagens" ? "" : " — " + esc(l.descricao)), l.quantidade != null ? String(l.quantidade) : "—"];
          }), [2], ["11%", "79%", "10%"]);
      }
      t += prodHtml(e);
      if (d.atencao) t += '<div class="aten"><b>Atenção:</b> ' + d.atencao + "</div>";
      var vf = e.folha ? "<b>Ver folha</b> " + esc(e.folha) + (opcoes.pranchas ? " das pranchas " + esc(opcoes.pranchas) : "") + "." : "<b>Ver</b> as pranchas do projeto executivo" + (opcoes.pranchas ? " " + esc(opcoes.pranchas) : "") + " (fichas de corte por marca e detalhes das ligações).";
      t += "<p style='margin-top:1.6mm'>" + vf + "</p>";
      return moldura(e.pagina, cab + figs + '<div class="painel">' + t + "</div>", true);
    }

    /* ---------- tabela final */
    function tabelaFinal(p) {
      var esp = {};
      P.forEach(function (q) {
        if (!q.secao_cm) return;
        var k = especieTxt(q) + "|" + sec(q.secao_cm), o = esp[k] = esp[k] || { n: 0, m: 0, v: 0 };
        o.n++; o.m += q.comprimento_m || 0; o.v += q.volume_m3 || 0;
      });
      var tn = 0, tm = 0, tv = 0;
      function areaSec(k) { var m = /(\d+(?:,\d+)?)×(\d+(?:,\d+)?)/.exec(k); return m ? parseFloat(m[1].replace(",", ".")) * parseFloat(m[2].replace(",", ".")) : 0; }
      var mad = Object.keys(esp).sort(function (a, b) { var ea = a.split("|")[0], eb = b.split("|")[0]; return ea < eb ? -1 : ea > eb ? 1 : areaSec(b) - areaSec(a); }).map(function (k) { var o = esp[k], s = k.split("|"); tn += o.n; tm += o.m; tv += o.v; return [esc(s[0]), esc(s[1]), String(o.n), br(o.m, 1), br(o.v, 3)]; });
      mad.push({ tot: true, cel: ["Total", "", String(tn), br(tm, 1), br(tv, 3)] });
      var marcas = etapas.map(function (e) {
        var pref = uniq((etapaPecas[e.chave] || []).filter(function (q) { return grupos[q.grupo]; }).map(function (q) { return grupos[q.grupo].prefixo; }));
        if (e.chave === "pw" && pwPaineis.length) pref.unshift("Painel Wall");
        if (e.chave === "ripado") pref = ["Ripas 3×3 (arquitetura)"];
        return pref.length ? [String(e.n), esc(e.titulo.replace(/ \(.*\)$/, "")), esc(pref.join(", "))] : null;
      }).filter(Boolean);
      var ligs = [];
      Object.keys(LIG).sort().forEach(function (c) { LIG[c].forEach(function (l) { ligs.push(['<span class="chip">' + esc(c) + "</span>", esc(l.tipo), l.quantidade != null ? String(l.quantidade) : "—"]); }); });
      var vistos = {}, prods = [];
      etapas.forEach(function (e) { e.produtos.forEach(function (x) { if (vistos[x.id]) { vistos[x.id].push(e.n); return; } vistos[x.id] = [e.n]; prods.push(x); }); });
      var prodRows = prods.map(function (x) {
        return [esc(x.fabricante), esc(x.nome), esc(x.codigo || "—"), x.pagina ? String(x.pagina) : "—", vistos[x.id].join(", "), x.link ? '<a href="' + esc(x.link.href) + '" style="color:#1f5f8b;text-decoration:none;word-break:break-all">' + esc(x.link.texto.replace(/^https?:\/\//, "").slice(0, 42)) + (x.link.texto.replace(/^https?:\/\//, "").length > 42 ? "…" : "") + "</a>" : "—"];
      });
      var c = '<div class="cont"><h1><small>Fecho</small>Tabela resumida de peças, ligações e produtos</h1><div style="display:flex;gap:6mm">' +
        '<div style="width:112mm"><h2>Madeira por espécie e seção</h2>' + tabela(["Madeira", "Seção (cm)", "Peças", "Compr. (m)", "Volume (m³)"], mad, [2, 3, 4], ["34%", "18%", "13%", "17%", "18%"]) +
        '<div class="box">Quantidades do modelo, sem perdas. Romaneio completo por marca: quantitativos e fichas de corte das pranchas.</div></div>' +
        '<div style="width:118mm"><h2>Marcas por etapa deste manual</h2>' + tabela(["Etapa", "Montagem", "Marcas"], marcas, [], ["11%", "47%", "42%"]) +
        "<h2>Ligações (quantidade de ocorrências)</h2>" + tabela(["Lig.", "Tipo", "Qtd"], ligs, [2], ["13%", "74%", "13%"]) + "</div>" +
        '<div style="width:140mm"><h2>Produtos citados (catálogo do sistema)</h2>' + tabela(["Fabricante", "Produto", "Código", "Pág.", "Etapas", "Link"], prodRows, [3], ["16%", "27%", "14%", "7%", "10%", "26%"]) +
        (pwPaineis.length ? "<h2>Painel Wall do piso</h2>" + tabela(["Item", "Peças", "Área (m²)"], [["Recortes de Painel Wall 40 mm", String(pwPaineis.length), br(pwArea, 1)]], [1, 2], ["64%", "14%", "22%"]) : "") +
        "</div></div></div>";
      return moldura(p, c, false);
    }

    /* ---------- monta o HTML */
    var corpo = [];
    paginas.forEach(function (p) {
      if (p.tipo === "capa") corpo.push(capa(p));
      else if (p.tipo === "sumario") corpo.push(sumario(p));
      else if (p.tipo === "como_ler") corpo.push(comoLer(p));
      else if (p.tipo === "etapa") corpo.push(etapaPagina(etapas[p.etapa - 1]));
      else if (p.tipo === "tabela") corpo.push(tabelaFinal(p));
    });
    var html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>" + esc((doc.numero || "Manual") + " " + (doc.revisao || "") + " — manual de montagem") + "</title><style>" + CSS + (logos.ra ? "\n.logo-ra { background-image: url(" + logos.ra + ") }" : "") + (logos.contratante ? "\n.logo-ct { background-image: url(" + logos.contratante + ") }" : "") +
      "\n.logo-ra, .logo-ct { display: inline-block; background-repeat: no-repeat; background-position: center; background-size: contain }</style></head><body>" + corpo.join("\n") + "</body></html>";

    var saidaEtapas = etapas.map(function (e) {
      return { n: e.n, chave: e.chave, fase: e.fase, faseTexto: e.faseTexto, titulo: e.titulo, sub: e.sub, passos: e.passos, pecas: e.pecas, linhasPecas: e.linhasPecas || [],
        ligacoes: e.ligacoes, produtos: e.produtos.map(function (x) { return { id: x.id, fabricante: x.fabricante, nome: x.nome, codigo: x.codigo, pagina: x.pagina, link: x.link ? x.link.href : null, linkTexto: x.link ? x.link.texto : null,
          instalacao: x.instalacao ? x.instalacao.href : null, video: x.video ? x.video.href : null }; }),
        atencao: e.def.atencao || null, folha: e.folha, pagina: e.pagina.n, camera: e.camera, cameraUsada: e.cameraUsada, matriz: e.matriz, cameraPlanta: e.cameraPlanta || null };
    });
    return { ok: true, html: html, paginas: paginas, etapas: saidaEtapas, avisos: avisos, camera: { etapa: assinatura(camE), planta: assinatura(camPl), matriz: { R: camE.R, U: camE.U, D: camE.D } }, liberadoParaObra: resultado.ok !== false };
  };

  /* expostos para teste */
  MadManual._camera = camera;
  MadManual._urlDe = urlDe;

  if (typeof module !== "undefined" && module.exports) module.exports = MadManual;
  else global.MadManual = MadManual;
})(typeof window !== "undefined" ? window : this);
