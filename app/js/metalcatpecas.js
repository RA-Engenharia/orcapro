/* =====================================================================
 * metalcatpecas.js — METÁLICA: as PEÇAS 3D do Catálogo BR que não são perfil de barra: a TELHA de aço
 * (trapezoidal e ondulada) e o APOIO de neoprene (motor PURO, ES5, sem DOM, sem three.js, Node-testável).
 *
 * O desenho sai da FICHA do fabricante, nunca de um bloco:
 *   - TELHA: o contorno da seção (passo da onda, largura da crista, largura do fundo, altura da onda) está na
 *     tabela SECOES abaixo, cada medida com a fonte (fabricante, documento, página). A espessura e a altura da
 *     onda vêm do item do catálogo (js/acofechamentos.js, o mesmo que o cálculo da cobertura usa); a seção
 *     é extrudada no comprimento pedido. Telha sem a seção cotada na ficha NÃO é desenhada: o motivo fica em
 *     BimMetalCatPecas.estado(id) (a tela mostra), nunca um perfil inventado.
 *   - APOIO de neoprene: a placa a × b × h da ficha do fabricante (js/acocatalogobr.js, apoios), massa pelo
 *     peso específico da ficha (1,25 g/cm³), não pelo aço.
 *
 * A telha é uma peça "perfil" do js/metalpeca.js com a seção { forma: "telha", … } (em metros, só números:
 * nada de lista dentro de lista na nuvem); o apoio é uma "chapa" com `rho`. Os dois entram no modelo pelo
 * mesmo `criar` de sempre — massa, área, lista, IFC e desenho saem do motor das peças.
 *
 * NÃO desenhado (de propósito): o raio interno das dobras (nenhuma ficha o traz), as nervuras de enrijecimento
 * do fundo da onda e o remonte/capa das bordas. A seção termina em meia crista nas duas pontas.
 *
 * API:
 *   BimMetalCatPecas.SECOES                    a tabela de seções cotadas, com a fonte
 *   BimMetalCatPecas.estado(telhaId)           { ok, motivo, secaoId, perfil } (o id do item do catálogo, com ou sem "telha:")
 *   BimMetalCatPecas.secao(perfilTelha)        contorno e medidas (o que o js/metalpeca.js chama)
 *   BimMetalCatPecas.telha({ telhaId, L, origem, ex, ey })   → a caixa (op criar) ou { erro }
 *   BimMetalCatPecas.apoio({ produtoId, i, origem, ex, ey }) → a caixa ou { erro }
 *   BimMetalCatPecas.colocar(id, op)           coloca a peça no modelo aberto (tela do Catálogo BR)
 *   BimMetalCatPecas.svg(telhaId)              desenho cotado da seção
 *   BimMetalCatPecas.resumo()                  { total, comTresD, semTresD, porMotivo }
 * Teste: node tools/test-familias-metalica-catalogo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Peca() { return dep("BimMetal", "./metalpeca.js"); }
  function Fch() { return dep("AcoFechamentos", "./acofechamentos.js"); }
  function Cat() { return dep("AcoCatalogoBR", "./acocatalogobr.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function br(v, c) { if (!fin(v)) return "—"; c = c == null ? 2 : c; var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c); if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, ""); return s.replace(".", ","); }

  /* ================================================================ FONTES (documentos do fabricante)
   * pagina = página do PDF (a numeração do leitor), não a impressa */
  var DOC = {
    ananda: { fabricante: "Ananda Metais", documento: "Catálogo Telhas / Telhas EXP Ananda Express (22 p.)", url: "https://famsteel.com.br/blog/wp-content/uploads/2016/12/catalogo-ananda-telhas.pdf", acesso: "2026-10-12" },
    eternit: { fabricante: "Eternit", documento: "Catálogo Técnico Telhas Metálicas (16 p.)", url: "https://api.aecweb.com.br/cls/catalogos/eternit/catalogo_telhas_metalicas.pdf", acesso: "2026-10-12" },
    isoeste: { fabricante: "Kingspan Isoeste", documento: "Catálogo de Produtos PT-BR, versão 2 de 21.09.2026 (33 p. em página dupla)", url: "https://downloads.kingspan-isoeste.com.br/catalogos/Kingspan-Isoeste-Cat%C3%A1logo-de-Produtos-PT-BR.pdf", acesso: "2026-10-14" },
    galvisteel: { fabricante: "Galvisteel", documento: "Catálogo Técnico (38 p.)", url: "https://www.galvisteel.com.br/pdf/catalogo-tecnico.pdf", acesso: "2026-10-14" }
  };
  function fonte(doc, pagina, figura) { var d = DOC[doc]; return { fabricante: d.fabricante, documento: d.documento, url: d.url, acesso: d.acesso, pagina: String(pagina), figura: figura }; }

  /* ================================================================ SEÇÕES COTADAS (mm)
   * trapezoidal: passo (de crista a crista), topo (largura plana da crista), vale (largura plana do fundo, incluindo as
   * nervuras pequenas que a ficha não separa), h (altura da onda da ficha — o desenho usa a do catálogo quando o item
   * a traz), util (largura útil da ficha). A projeção horizontal de cada flanco sai de (passo − topo − vale) / 2.
   * ondulada: passo (comprimento de onda) e h (altura da onda, de pico a vale).
   * Onde a ficha dá a base da crista em vez do fundo, o fundo é passo − base (a ficha confere: base + fundo = passo).
   * `hFicha` só aparece quando a figura do fabricante traz altura diferente da do catálogo (anotado, não escondido). */
  var SECOES = {
    "eternit-tmtp25": { tipo: "trapezoidal", nome: "TMTP-25", passo: 169.66, topo: 24, vale: 103, h: 23, hFicha: 26, util: 1000, total: 1048, fonte: fonte("eternit", 7, "seção cotada da Telha Trapezoidal 25 (TMTP-25): 1000 / 1048, 169,66, 24, 103, 26") },
    "eternit-tmtp40": { tipo: "trapezoidal", nome: "TMTP-40", passo: 196, topo: 32, vale: 96, h: 37, util: 980, total: 1040, fonte: fonte("eternit", 8, "seção cotada da Telha Trapezoidal 40 (TMTP-40): 980 / 1040, 196, 32, 96, 37") },
    "eternit-tmtp120": { tipo: "trapezoidal", nome: "TMTP-120", passo: 455, topo: 30, vale: 245, h: 120, util: 910, total: 957, fonte: fonte("eternit", 9, "seção cotada da Telha Trapezoidal 120 (TMTP-120): 910 / 957, 455, 30, 245 / 210, 120") },
    "eternit-tmto17": { tipo: "ondulada", nome: "TMTO-17", passo: 75.77, h: 18, util: 985, total: 1087, fonte: fonte("eternit", 6, "seção cotada da Telha Ondulada 17 (TMTO-17): 985 / 1087, 75,77, 18") },
    "ananda-at25-1020": { tipo: "trapezoidal", nome: "AT 25/1020", passo: 170, topo: 25, vale: 110, h: 23, util: 1020, total: 1061, fonte: fonte("ananda", 6, "seção cotada da AT 25/1020: 1020 / 1061, 170, 25, 110 / 60, 23") },
    "ananda-at35-1050": { tipo: "trapezoidal", nome: "AT 35/1050", passo: 350, topo: 25, vale: 271, h: 34, util: 1050, total: 1100, fonte: fonte("ananda", 6, "seção cotada da AT 35/1050: 1050 / 1100, 350, 25, 271 / 79, 34") },
    "ananda-at40-980": { tipo: "trapezoidal", nome: "AT 40/980", passo: 196, topo: 32, vale: 96, h: 37, util: 980, total: 1042, fonte: fonte("ananda", 7, "seção cotada da AT 40/980: 980 / 1042, 196, 32, 96 / 100, 37") },
    "ananda-at100-950": { tipo: "trapezoidal", nome: "AT 100/950", passo: 483, topo: 27, vale: 296, h: 94, util: 966, total: 1012, fonte: fonte("ananda", 7, "seção cotada da AT 100/950: 966 / 1012, 483, 27, 296 / 187, 94") },
    "ananda-at17-980": { tipo: "ondulada", nome: "AT 17/980", passo: 76, h: 18, util: 985, fonte: fonte("ananda", 7, "seção cotada da AT 17/980 (ondulada): passo 76, altura 18") },
    "isoeste-standard-tp40": { tipo: "trapezoidal", nome: "TP-40", passo: 196, topo: 32, vale: 100, h: 37, hFicha: 36, util: 980, total: 1032, fonte: fonte("isoeste", 26, "seção cotada da Trapezoidal TP-40: 980 / 1032, 196, 32, 100, 36") },
    "isoeste-standard-ond17": { tipo: "ondulada", nome: "OND-17", passo: 77, h: 17, util: 995, total: 1092, fonte: fonte("isoeste", 26, "seção cotada da Ondulada OND-17: 995 / 1092, passo 77, altura 17") },
    "galvisteel-ga25-1020": { tipo: "trapezoidal", nome: "GA 25/1020", passo: 171, topo: 25, vale: 111, h: 25, util: 1020, total: 1051, fonte: fonte("galvisteel", 7, "seção cotada da GA 25/1020: 1020 / 1051, 171, 25, 111 / 60, 25") },
    "galvisteel-ga35-1050": { tipo: "trapezoidal", nome: "GA 35/1050", passo: 350, topo: 25, vale: 270, h: 35, util: 1050, total: 1100, fonte: fonte("galvisteel", 8, "seção cotada da GA 35/1050: 1050 / 1100, 350, 25, 270 / 80, 35") },
    "galvisteel-ga40-980": { tipo: "trapezoidal", nome: "GA 40/980", passo: 195, topo: 35, vale: 100, h: 40, util: 980, total: 1032, fonte: fonte("galvisteel", 9, "seção cotada da GA 40/980: 980 / 1032, 195, 35, 100 / 95, 40") }
  };

  /* por que a telha NÃO é desenhada (a ficha não traz a seção cotada) */
  var SEM_SECAO = {
    "regional": "a ficha da Regional traz só a largura total, a largura útil e a altura da onda — não traz o passo nem a largura da crista",
    "isoeste-standard-tp100": "a ficha traz passo 476, crista 27 e altura 97, mas não a largura da base da crista nem a do fundo",
    "galvisteel-ga100-950": "a ficha traz crista 27, altura 100 e largura útil 950, sem o passo e sem a largura do fundo",
    "ananda-at40-1020": "o catálogo do fabricante não traz o desenho cotado da seção desta telha"
  };
  var SEM_GRUPO = {
    "sanduiche": "telha sanduíche: a ficha dá só a espessura do núcleo isolante; o desenho precisa do material e da densidade do núcleo, que não são aço",
    "zipada": "telha zipada: a ficha traz a largura útil, a total e a altura, sem o contorno da aba e da costura"
  };
  function motivoSem(t) {
    var p = String(t.produto || ""), g = String(t.grupo || "");
    if (SEM_SECAO[p]) return SEM_SECAO[p];
    if (/^regional-/.test(p)) return SEM_SECAO.regional;
    if (SEM_GRUPO[g]) return SEM_GRUPO[g];
    return "a ficha não traz a seção cotada (passo e largura da crista)";
  }

  /* ================================================================ SEÇÃO (o contorno que o js/metalpeca.js extruda)
   * perfil = { forma: "telha", tipo, passo, topo, vale, h, t, n, cat } em METROS (n = nº de passos desenhados).
   * Linha média com cantos vivos (a altura da onda é a EXTERNA: a linha média tem h − t) + espessura t, pontas retas.
   * A seção sai centrada na caixa, crista para cima (+y). */
  var _memo = {};
  function contornoDeLinha(cl, t) {
    var n = cl.length, nor = [], esq = [], dir = [], i, d, l;
    for (i = 0; i + 1 < n; i++) { d = [cl[i + 1][0] - cl[i][0], cl[i + 1][1] - cl[i][1]]; l = Math.sqrt(d[0] * d[0] + d[1] * d[1]) || 1; nor.push([-d[1] / l, d[0] / l]); }
    for (i = 0; i < n; i++) {
      var q = cl[i], a = nor[Math.max(0, i - 1)], b = nor[Math.min(nor.length - 1, i)], ponta = (i === 0 || i === n - 1), k = 1 + a[0] * b[0] + a[1] * b[1], f = ponta ? 1 : 1 / Math.max(k, 1e-6);
      var nx = ponta ? (i === 0 ? b[0] : a[0]) : (a[0] + b[0]) * f, ny = ponta ? (i === 0 ? b[1] : a[1]) : (a[1] + b[1]) * f;
      esq.push([q[0] + nx * t / 2, q[1] + ny * t / 2]); dir.push([q[0] - nx * t / 2, q[1] - ny * t / 2]);
    }
    return esq.concat(dir.reverse());
  }
  function linhaMedia(p) {
    var P = p.passo, n = Math.max(1, Math.round(p.n)), yT = (p.h - p.t) / 2, yB = -yT, cl = [], k;
    if (p.tipo === "ondulada") {
      var M = 8; for (k = 0; k <= n * M; k++) cl.push([P * k / M, yT * Math.cos(2 * Math.PI * k / M)]);
      return cl;
    }
    var f = (P - p.topo - p.vale) / 2;
    cl.push([0, yT]);
    for (k = 0; k < n; k++) { var x0 = k * P; cl.push([x0 + p.topo / 2, yT], [x0 + p.topo / 2 + f, yB], [x0 + p.topo / 2 + f + p.vale, yB], [x0 + P - p.topo / 2, yT]); }
    cl.push([n * P, yT]);
    return cl;
  }
  function secao(p) {
    var t = num(p && p.t, 0), P = num(p && p.passo, 0), h = num(p && p.h, 0), n = num(p && p.n, 0), tipo = p && p.tipo === "ondulada" ? "ondulada" : "trapezoidal";
    var topo = num(p && p.topo, 0), vale = num(p && p.vale, 0);
    if (!(t > 0 && P > 0 && h > 2 * t && n >= 1)) return { ok: false, motivo: "Telha: passo, altura da onda, espessura e número de passos incoerentes." };
    if (tipo === "trapezoidal" && !(topo > 0 && vale > 0 && topo + vale < P)) return { ok: false, motivo: "Telha trapezoidal: a crista e o fundo não cabem no passo." };
    var chave = [tipo, P, topo, vale, h, t, Math.round(n)].join("|");
    if (_memo[chave]) return _memo[chave];   /* o contorno é calculado UMA vez por tipo de telha — as peças iguais dividem */
    var c = contornoDeLinha(linhaMedia({ tipo: tipo, passo: P, topo: topo, vale: vale, h: h, t: t, n: n }), t);
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, i;
    for (i = 0; i < c.length; i++) { if (c[i][0] < mnx) mnx = c[i][0]; if (c[i][0] > mxx) mxx = c[i][0]; if (c[i][1] < mny) mny = c[i][1]; if (c[i][1] > mxy) mxy = c[i][1]; }
    var cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    c = c.map(function (q) { return [r6(q[0] - cx), r6(q[1] - cy)]; });
    var A = 0, Pm = 0;
    for (i = 0; i < c.length; i++) { var a = c[i], b = c[(i + 1) % c.length]; A += a[0] * b[1] - b[0] * a[1]; Pm += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }
    if (A < 0) c = c.reverse();
    var rot = (p.cat ? "Telha " + String(p.cat) : "Telha " + (tipo === "ondulada" ? "ondulada" : "trapezoidal") + " " + br(h * 1000, 0) + " mm") + " (" + br(t * 1000, 2) + " mm)";
    var r = { ok: true, forma: "telha", contorno: c, furos: [], area: Math.abs(A) / 2, perimetro: Pm, larg: mxx - mnx, alt: mxy - mny, rotulo: rot };
    _memo[chave] = r;
    return r;
  }

  /* ================================================================ ESTADO DO ITEM DO CATÁLOGO */
  function idLimpo(id) { return String(id == null ? "" : id).replace(/^telha:/, ""); }
  function estado(telhaId) {
    var F = Fch(), id = idLimpo(telhaId), t = F && F.obter ? F.obter(id) : null;
    if (!t || !F.TIPOS_TELHA || !F.TIPOS_TELHA[t.grupo]) return { ok: false, motivo: "Telha fora do catálogo: " + id + "." };
    var s = SECOES[t.produto];
    if (!s) return { ok: false, motivo: motivoSem(t), produto: t.produto };
    var esp = num(t.espessura, 0) / 1000;
    if (!(esp > 0)) return { ok: false, motivo: "a ficha não traz a espessura da chapa desta telha", produto: t.produto };
    var h = fin(t.alturaOnda) && t.alturaOnda > 0 ? t.alturaOnda : s.h;
    var n = Math.max(1, Math.round(s.util / s.passo));
    var perfil = { forma: "telha", tipo: s.tipo, passo: r6(s.passo / 1000), topo: s.topo ? r6(s.topo / 1000) : 0, vale: s.vale ? r6(s.vale / 1000) : 0, h: r6(h / 1000), t: r6(esp), n: n, cat: id };
    return { ok: true, motivo: "", produto: t.produto, secaoId: t.produto, secao: s, perfil: perfil, larguraDesenhada: r6(n * s.passo / 1000), larguraUtil: s.util / 1000 };
  }

  /* ================================================================ A PEÇA (op criar) */
  function telha(o) {
    o = o || {};
    var B = Peca(); if (!B) return { erro: "O motor das peças (js/metalpeca.js) não carregou." };
    var e = estado(o.telhaId); if (!e.ok) return { erro: "Telha sem desenho 3D: " + e.motivo + "." };
    var L = num(o.L, 1);
    var c = B.perfil({ perfil: e.perfil, L: L, origem: o.origem || [0, 0, 0], ex: o.ex || [1, 0, 0], ey: o.ey || [0, 1, 0], papel: "Telha", aco: "Aço revestido (galvanizado ou galvalume)" });
    if (c && !c.erro) { c.metal.fabricante = e.secao.fonte.fabricante; c.metal.fonteSecao = e.secao.fonte.documento + ", p. " + e.secao.fonte.pagina; }
    return c;
  }

  /* APOIO de neoprene: a placa a × b × h (mm) de cada dimensão da ficha */
  function apoios() { var C = Cat(); return C && C.apoios ? C.apoios().produtos || [] : []; }
  function apoio(o) {
    o = o || {};
    var B = Peca(); if (!B) return { erro: "O motor das peças (js/metalpeca.js) não carregou." };
    var pid = String(o.produtoId || "").replace(/^apoio:/, ""), pr = apoios().filter(function (p) { return p.id === pid; })[0];
    if (!pr) return { erro: "Apoio fora do catálogo: " + pid + "." };
    var i = Math.max(0, Math.min((pr.dimensoes || []).length - 1, Math.round(num(o.i, 0)))), d = (pr.dimensoes || [])[i];
    if (!d || !(num(d.a_mm, 0) > 0 && num(d.b_mm, 0) > 0 && num(d.h_mm, 0) > 0)) return { erro: "A ficha do apoio não traz largura, comprimento e espessura." };
    var c = B.chapa({ origem: o.origem || [0, 0, 0], ex: o.ex || [1, 0, 0], ey: o.ey || [0, 0, -1], t: d.h_mm / 1000, ret: { L: d.b_mm / 1000, B: d.a_mm / 1000 }, papel: "Apoio de neoprene", aco: "Neoprene (elastômero)" });
    if (c && !c.erro) {
      /* massa pelo peso específico da ficha (1,25 g/cm³), não pelo do aço */
      c.metal.rho = 1250; c.metal.mat = "neoprene"; c.metal.fabricante = pr.fabricante; c.metal.codigo = d.codigo || ""; c.metal.fonteSecao = "Rothoblaas, ficha técnica NEO (PT) de 11/09/2026, páginas NEO-01 e NEO-02";
      B.recalc(c);
    }
    return c;
  }

  /* ================================================================ NO MODELO ABERTO */
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", 6000); } catch (e) {} }
  function novoId() { var U = global.BimMetalUI; return U && U.novoId ? U.novoId() : "met-" + Date.now().toString(36) + "-" + Math.round(Math.random() * 1e6).toString(36); }
  function colocar(id, op) {
    op = op || {};
    var b = global.BIM; if (!b || !b.editarLote) { toast("Abra o modelo 3D (aba BIM) para colocar a peça.", "aviso"); return false; }
    var est = null; try { est = b.editarEstado ? b.editarEstado() : null; } catch (e) { est = null; }
    var xMax = 0, zMin = 0, yMin = 0, temCaixa = false;
    ((est && est.estado && est.estado.caixas) || []).forEach(function (c) {
      if (!c || !isFinite(c.cx) || !isFinite(c.cz)) return;
      var x1 = c.cx + (c.comprimento || 0) / 2, z0 = c.cz - (c.espessura || 0) / 2, y0 = c.cy - (c.altura || 0) / 2;
      if (!temCaixa) { xMax = x1; zMin = z0; yMin = y0; temCaixa = true; } else { if (x1 > xMax) xMax = x1; if (z0 < zMin) zMin = z0; if (y0 < yMin) yMin = y0; }
    });
    var origem = [xMax + (temCaixa ? 1 : 0), yMin, zMin], caixa;
    if (/^apoio:/.test(String(id))) caixa = apoio({ produtoId: id, i: op.i, origem: origem, ex: [1, 0, 0], ey: [0, 0, -1] });
    else caixa = telha({ telhaId: id, L: op.L || 3, origem: [origem[0], origem[1], origem[2]], ex: [1, 0, 0], ey: [0, 1, 0] });
    if (!caixa || caixa.erro) { toast((caixa && caixa.erro) || "Não deu para desenhar a peça.", "aviso"); return false; }
    var pid = novoId(), ok = !!b.editarLote({ op: "lote", id: "cat-" + pid, origem: "metal-catalogo", pedido: "Peça 3D do Catálogo BR: " + id, ops: [{ op: "criar", id: pid, caixa: caixa }] });
    toast(ok ? "Peça colocada ao lado do modelo (mova para o lugar)." : "O modelo não aceitou a peça.", ok ? "ok" : "aviso");
    return ok;
  }

  /* ================================================================ RESUMO e SVG */
  function resumo() {
    var C = Cat(), lista = C && C.telhas ? C.telhas() : [], porMotivo = {}, com = 0;
    lista.forEach(function (t) { var e = estado(t.id); if (e.ok) com++; else porMotivo[e.motivo] = (porMotivo[e.motivo] || 0) + 1; });
    return { total: lista.length, comTresD: com, semTresD: lista.length - com, porMotivo: porMotivo };
  }
  var INK = "#1d2733", ACO = "#c5d0dc", ACOL = "#4f6275", AUX = "#8a94a3";
  function svg(telhaId) {
    var e = estado(telhaId); if (!e.ok) return "";
    var s = secao(e.perfil); if (!s.ok) return "";
    var W = 520, H = 170, ML = 20, MR = 20, MT = 46, MB = 44, aw = W - ML - MR, ah = H - MT - MB;
    var esc0 = Math.min(aw / s.larg, ah / Math.max(s.alt, 1e-6)), ox = W / 2, oy = MT + ah / 2;
    function X(x) { return Math.round((ox + x * esc0) * 100) / 100; }
    function Y(y) { return Math.round((oy - y * esc0) * 100) / 100; }
    var d = "M" + s.contorno.map(function (q) { return X(q[0]) + " " + Y(q[1]); }).join("L") + "Z";
    var h = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" role="img" aria-label="Seção cotada da telha">',
      '<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="8" fill="#ffffff" stroke="#d9dee5"/>',
      '<text x="' + (W / 2) + '" y="16" font-size="11" font-weight="600" font-family="sans-serif" fill="' + INK + '" text-anchor="middle">' + esc(e.secao.fabricante || e.secao.fonte.fabricante) + " — " + esc(e.secao.nome) + "</text>",
      '<path d="' + d + '" fill="' + ACO + '" stroke="' + ACOL + '" stroke-width="1" stroke-linejoin="round"/>'];
    var xa = X(-s.larg / 2), xb = X(s.larg / 2), yb = Y(-s.alt / 2) + 22;
    h.push('<line x1="' + xa + '" y1="' + yb + '" x2="' + xb + '" y2="' + yb + '" stroke="' + INK + '" stroke-width="0.7"/>');
    h.push('<text x="' + W / 2 + '" y="' + (yb + 13) + '" font-size="10" font-family="sans-serif" fill="' + INK + '" text-anchor="middle">largura desenhada ' + br(e.larguraDesenhada * 1000, 0) + " mm (útil da ficha " + br(e.larguraUtil * 1000, 0) + " mm)</text>");
    var cota = ["altura da onda " + br(e.perfil.h * 1000, 0) + " mm", "passo " + br(e.secao.passo, 2) + " mm"];
    if (e.secao.tipo === "trapezoidal") cota.push("crista " + br(e.secao.topo, 0) + " mm", "fundo " + br(e.secao.vale, 0) + " mm");
    cota.push("chapa " + br(e.perfil.t * 1000, 2) + " mm");
    h.push('<text x="' + W / 2 + '" y="' + (MT - 14) + '" font-size="10" font-family="sans-serif" fill="' + INK + '" text-anchor="middle">' + esc(cota.join(" · ")) + "</text>");
    h.push("</svg>");
    return h.join("");
  }

  var BimMetalCatPecas = { SECOES: SECOES, SEM_SECAO: SEM_SECAO, estado: estado, secao: secao, telha: telha, apoio: apoio, colocar: colocar, svg: svg, resumo: resumo };
  global.BimMetalCatPecas = BimMetalCatPecas;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalCatPecas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
