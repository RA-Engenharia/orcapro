/* =====================================================================
 * pdfinterativo.js — PDF INTERATIVO das folhas do BIM (fase 2 e 3, 16/11/2026). Motor PURO (ES5, sem DOM, Node-testável).
 *
 * O QUE É. Sobre o PDF vetorial com camadas (js/svgpdf.js + js/folhapdf.js) a folha ganha NAVEGAÇÃO e FICHAS, tudo declarativo (SEM JavaScript dentro do PDF):
 *   a) bolha de corte/elevação/detalhe = link para a folha da vista; índice de folhas clicável (primeira página); marcadores (/Outlines) disciplina > folha;
 *   b) ambiente clicável (ficha: área, perímetro, pé-direito, acabamentos, louças) e peça clicável (porta, janela, louça, registro, tubo…: dados do modelo);
 *   c) QR por folha (portal da obra / vista 3D) e anexos (/EmbeddedFiles: quantitativo .xlsx, memorial);
 *   d) disciplinas e etapas como camadas, revisão anterior + nuvem de revisão, modos prontos ("Cliente" e "Obra") por estados de camada;
 *   e) elemento → página de detalhe no fim do PDF (vista ampliada + ficha + quantitativo; viga/pilar/laje levam o detalhamento de armação) e link para a Prancha Viva;
 *   f) vista 3D no PDF (imagem de capa + link para a Prancha Viva; PRC/U3D só quando houver gerador).
 *
 * ⚠ NUNCA INVENTA DADO: o que o modelo não tem NÃO aparece na ficha (nada de "fabricante: —" fingindo preenchimento). Quem fornece os dados é o app, por funções injetadas em
 *   `interativo` (ambiente, peca, etapaDe, detalheArmacao…); sem elas a ficha leva só o que sai do próprio desenho (classe IFC, medidas, área, comprimento).
 * ⚠ SEM TOKEN PUBLICADO = SEM QR/LINK: omitido, com aviso no resultado (avisos[]).
 *
 *   planejar(ent) → { antes: [svg], depois: [svg], interativo, avisos: [] }      (ver js/folhapdf.js gerar)
 * Teste: node tools/test-pdf-interativo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function n3(v) { return Math.round(v * 1000) / 1000; }
  function esc(s) { return txt(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function SP() { return dep("SvgPdf", "./svgpdf.js"); }
  function PRm() { return dep("Prancha", "./prancha.js"); }
  function larg(s, corpo, neg) { var S = SP(); return S ? S.largura(s, corpo, neg) : txt(s).length * corpo * 0.55; }
  function fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace(".", ","); }

  var ORDEM_DISC = ["arquitetura", "estrutural", "hidraulica", "eletrica", "mecanica", "coordenacao"];
  var NOME_DISC = { arquitetura: "Arquitetura", estrutural: "Estrutura", hidraulica: "Hidrossanitário", eletrica: "Elétrica", mecanica: "Mecânica", coordenacao: "Coordenação" };
  var AZUL = "#00406A", CINZA = "#5a6b7b", LINK = "#0b57a4";

  /* ------------------------------------------------ dados da folha */
  function numeroDe(it) { var P = PRm(); return P && P.numeroFolha ? P.numeroFolha(it.pr, it.folha) : txt(it.folha && (it.folha.numero || it.folha.n)); }
  /* disciplina da folha: a da vista (def.disciplina), a da chave do "Gerar pranchas" (g:<disciplina>:<tipo>) ou arquitetura */
  function discDe(it) {
    var d = "";
    arr(it.folha && it.folha.blocos).forEach(function (b) {
      if (d || !b || b.tipo !== "viewport") return;
      var vp = it.rec && it.rec.viewports && (it.rec.viewports[b.vistaId + "@" + b.escala] || it.rec.viewports[b.vistaId]);
      var q = vp && ((vp.def && vp.def.disciplina) || vp.disciplina); if (q && ORDEM_DISC.indexOf(q) >= 0) d = q;
    });
    if (!d) { var m = /^g:([a-z]+):/.exec(txt(it.folha && it.folha.auto)); if (m && ORDEM_DISC.indexOf(m[1]) >= 0) d = m[1]; }
    return d || "arquitetura";
  }

  /* ------------------------------------------------ SVG: fim do <g> e bolhas de corte/elevação/detalhe */
  function fimDoG(s, ini) {
    var re = /<(\/?)g\b[^>]*?(\/?)>/g, d = 1, m; re.lastIndex = ini;
    while ((m = re.exec(s))) { if (m[1]) d--; else if (!m[2]) d++; if (d === 0) return re.lastIndex; }
    return -1;
  }
  function atr(a, k) { var m = new RegExp("\\b" + k + "=\"([^\"]*)\"").exec(a); return m ? m[1] : ""; }
  /* as bolhas (círculo `d2-marca-circ`) das marcas da vista: cada ponta de corte e a bolha da elevação/chamada → { vistaId, x0, y0, x1, y1 } em unidades do desenho */
  function bolhasDe(svg) {
    var out = [], s = txt(svg), re = /<g\b([^>]*)>/g, m;
    while ((m = re.exec(s))) {
      var at = m[1], cl = atr(at, "class"), idC = atr(at, "data-d2-corte"), idV = atr(at, "data-d2-vista");
      if (!idC && !idV) continue;
      if (!(/\bd2-marca\b/.test(cl) || /\bd2-p6-elev\b/.test(cl) || /\bd2-p6-chamada\b/.test(cl))) continue;
      var fim = fimDoG(s, re.lastIndex); if (fim < 0) continue;
      var seg = s.slice(m.index, fim), vistaId = idC ? "d2c-" + idC : idV;
      (seg.match(/<circle\b[^>]*>/g) || []).forEach(function (c) {
        if (!/\bd2-marca-circ\b/.test(atr(c, "class"))) return;
        var cx = num(atr(c, "cx"), NaN), cy = num(atr(c, "cy"), NaN), r = num(atr(c, "r"), NaN); if (!isFinite(cx) || !isFinite(cy) || !(r > 0)) return;
        out.push({ vistaId: vistaId, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r });
      });
    }
    return out;
  }
  function paraFolha(v, x0, y0, x1, y1) { return { x: n3(v.ox + x0 * v.k), y: n3(v.oy + y0 * v.k), w: n3((x1 - x0) * v.k), h: n3((y1 - y0) * v.k) }; }
  /* recorta o retângulo (mm de papel) à caixa do viewport: o que está fora do quadro não é clicável */
  function noQuadro(r, b) {
    var x0 = Math.max(r.x, b.x), y0 = Math.max(r.y, b.y), x1 = Math.min(r.x + r.w, b.x + b.w), y1 = Math.min(r.y + r.h, b.y + b.h);
    return x1 - x0 > 0.4 && y1 - y0 > 0.4 ? { x: n3(x0), y: n3(y0), w: n3(x1 - x0), h: n3(y1 - y0) } : null;
  }

  /* ------------------------------------------------ geometria do desenho (unidades do desenho = metros do modelo) */
  function bboxPts(pts) {
    var x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    arr(pts).forEach(function (q) { if (q && isFinite(q[0]) && isFinite(q[1])) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } });
    return x1 >= x0 ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
  }
  function areaPoli(pts) { var a = 0, P = arr(pts); for (var i = 0; i < P.length; i++) { var q = P[i], r = P[(i + 1) % P.length]; a += q[0] * r[1] - r[0] * q[1]; } return Math.abs(a) / 2; }
  function compPoli(pts, fechado) { var L = 0, P = arr(pts); for (var i = 0; i + 1 < P.length; i++) L += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (fechado && P.length > 2) L += Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]); return L; }
  function dentroPoli(x, y, pts) {
    var P = arr(pts), d = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) { if (((P[i][1] > y) !== (P[j][1] > y)) && (x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) d = !d; }
    return d;
  }
  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  /* ------------------------------------------------ elementos clicáveis: a classe IFC do contorno (cortes[].ifc) → tipo de peça */
  var CLASSES = [
    { re: /^IFCDOOR/, tipo: "porta", nome: "Porta", ord: 1 }, { re: /^IFCWINDOW/, tipo: "janela", nome: "Janela", ord: 2 },
    { re: /^IFCSANITARYTERMINAL/, tipo: "louca", nome: "Louça sanitária", ord: 3 }, { re: /^IFCVALVE/, tipo: "registro", nome: "Registro / válvula", ord: 4 },
    { re: /^IFCBEAM/, tipo: "viga", nome: "Viga", ord: 5 }, { re: /^IFCCOLUMN/, tipo: "pilar", nome: "Pilar", ord: 6 }, { re: /^IFCSLAB/, tipo: "laje", nome: "Laje", ord: 7 },
    { re: /^IFC(LIGHTFIXTURE|ELECTRICAPPLIANCE|OUTLET|ELECTRICDISTRIBUTION|SWITCHINGDEVICE|ELECTRICFLOW)/, tipo: "eletrica", nome: "Elétrica", ord: 8 },
    { re: /^IFC(PIPE|FLOW|DUCT|CABLE)/, tipo: "tubo", nome: "Tubulação", ord: 9 }, { re: /^IFCWALL/, tipo: "parede", nome: "Parede", ord: 10 }];
  var NOME_TIPO = {}; CLASSES.forEach(function (c) { NOME_TIPO[c.tipo] = c.nome; });
  function classeDe(ifc, inst) {
    var t = txt(ifc).toUpperCase();
    for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i].re.test(t)) return CLASSES[i];
    return inst ? CLASSES[8] : null;
  }
  /* as peças de uma vista 2D (do desenho): { uid, ifc, cls, bb, area, comp, n } — uma por uid (contornos do mesmo uid se juntam); sem uid, uma por contorno */
  function pecasDeVp(dados) {
    var out = [], porUid = {}, seq = 0;
    function somar(uid, ifc, cls, pts, fechado) {
      var bb = bboxPts(pts); if (!bb) return;
      var chave = uid ? uid : "n" + (seq++), q = porUid[chave];
      if (!q) { q = porUid[chave] = { uid: uid || "", ifc: txt(ifc), cls: cls, bb: { x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1 }, area: 0, comp: 0, n: 0, polis: [] }; out.push(q); }
      else { q.bb.x0 = Math.min(q.bb.x0, bb.x0); q.bb.y0 = Math.min(q.bb.y0, bb.y0); q.bb.x1 = Math.max(q.bb.x1, bb.x1); q.bb.y1 = Math.max(q.bb.y1, bb.y1); }
      if (fechado) q.area += areaPoli(pts); else q.comp += compPoli(pts, false);
      if (q.polis.length < 8) q.polis.push({ pts: pts, fechado: !!fechado });
      q.n++;
    }
    arr(dados && dados.cortes).forEach(function (c) {
      if (!c || !c.pts) return;
      var cls = classeDe(c.ifc, c.inst || /\|inst:/.test(txt(c.k))); if (!cls) return;
      somar(txt(c.u), c.ifc, cls, c.pts, !!c.fechado);
    });
    var L = arr(dados && dados.linhas), I = arr(dados && dados.linhasIfc), U = arr(dados && dados.linhasUd);
    L.forEach(function (l, i) {
      var cls = classeDe(I[i], U[i] && U[i].inst); if (!cls || !(cls.tipo === "tubo" || cls.tipo === "eletrica")) return;
      if (!txt(U[i] && U[i].u)) return;   /* traço sem identificador (cabo, trecho de tubo desenhado em linha): não dá para dizer QUAL peça é; sem uid não vira link (dado real: milhares de traços) */
      somar(txt(U[i] && U[i].u), I[i], cls, [[l[0], l[1]], [l[2], l[3]]], false);
    });
    out.sort(function (a, b) { return a.cls.ord - b.cls.ord; });
    return out;
  }

  /* ------------------------------------------------ fichas (só o que o modelo diz; nada inventado) */
  function m2(v) { return fmt(v, 2) + " m²"; }
  function lin(rot, v) { return v == null || v === "" ? null : [rot, v]; }
  function limpa(l) { return arr(l).filter(function (q) { return q && q[1] != null && q[1] !== ""; }); }
  function temNum(v) { return v !== null && v !== undefined && v !== "" && isFinite(+v); }
  /* ficha do ambiente. `d` = o que o app sabe do ambiente (I.ambiente(id)): { nome, numero, area, perimetro, peDireito, volume, acabPiso, acabBase, acabParede, acabForro, ocupacao, departamento, comentarios } */
  function fichaAmbiente(it, d, loucas) {
    d = d || {};
    var l = [lin("Ambiente", txt(d.nome || it.linha1)), lin("Número", txt(d.numero)), lin("Área", temNum(d.area) ? m2(+d.area) : null),
      lin("Perímetro", temNum(d.perimetro) ? fmt(+d.perimetro, 2) + " m" : null), lin("Pé-direito", temNum(d.peDireito) ? fmt(+d.peDireito, 2) + " m" : null),
      lin("Volume", temNum(d.volume) ? fmt(+d.volume, 2) + " m³" : null), lin("Piso", txt(d.acabPiso)), lin("Rodapé", txt(d.acabBase)), lin("Parede", txt(d.acabParede)), lin("Forro", txt(d.acabForro)),
      lin("Ocupação", txt(d.ocupacao)), lin("Departamento", txt(d.departamento))];
    if (!d.nome && !temNum(d.area) && it.linha2) l.push(lin("Identificação", txt(it.linha2)));
    var ls = arr(loucas); if (ls.length) l.push(["Louças e peças", ls.join(", ")]);
    if (d.comentarios) l.push(["Observações", txt(d.comentarios)]);
    return limpa(l);
  }
  /* ficha da peça: do desenho (classe, medidas, área/comprimento) + o que o modelo informa (I.peca(uid, ifc, peça)): { nome, familia, fabricante, codigo, dimensoes, dn, vazao, circuito, etapa, uri, extra: [[rotulo, valor]] } */
  /* "0,90 × 2,10" no nome do tipo ("Porta 0,90 × 2,10", "Janela 2,00 × 1,20") → "0,90 × 2,10 m" */
  function dimDoNome(n) { var m = /(\d+[,.]\d+)\s*[x×X]\s*(\d+[,.]\d+)/.exec(txt(n)); return m ? m[1].replace(".", ",") + " × " + m[2].replace(".", ",") + " m" : ""; }
  function dimensoesDe(q, d) {
    if (txt(d.dimensoes)) return txt(d.dimensoes);
    var M = d.medidas || {}, L = M.largura || M.comprimento, A = M.altura;
    if (L && A) return L + " × " + A;
    return dimDoNome(d.nome) || dimDoNome(d.familia) || "";
  }
  /* abertura em texto corrido: "Abre para fora · mão direita" (só do que o modelo diz) */
  function aberturaDe(d) {
    var p = [];
    if (d.abreFora === true) p.push("Abre para fora"); else if (d.abreFora === false) p.push("Abre para dentro");
    if (d.maoDireita === true) p.push("mão direita"); else if (d.maoDireita === false) p.push("mão esquerda");
    return p.join(" · ");
  }
  /* A FICHA É UMA LISTA DE PARÂMETROS DE INTERESSE (tipo, família, dimensões, peitoril, abertura, área, volume, material, marca, fase…). Parâmetro interno de controle do app
     ("Lado folha 1,000", "Sinal mão", "Quantidade da família", "Opção de desenho") NÃO entra: quem lê o PDF é cliente/obra, não o modelador. A medida é a do ELEMENTO
     (0,90 × 2,10 m), nunca a da caixa do contorno na vista; só a ESPESSURA da parede sai do desenho (é a medida que a planta realmente mostra). */
  function fichaPeca(q, d) {
    d = d || {}; var t = q.cls.tipo, w = q.bb.x1 - q.bb.x0, h = q.bb.y1 - q.bb.y0, esp = Math.min(w, h);
    var l = [lin("Tipo", NOME_TIPO[t]), lin("Nome", txt(d.nome)), lin("Família / tipo", txt(d.familia)), lin("Fabricante", txt(d.fabricante)), lin("Código", txt(d.codigo))];
    var dim = dimensoesDe(q, d); if (dim) l.push(["Dimensões", dim]);
    if (t === "parede" && esp >= 0.03) l.push(["Espessura", fmt(esp * 100, 0) + " cm"]);
    if (t === "porta" || t === "janela") l.push(lin("Peitoril", txt(d.peitoril)));
    if (t === "porta") l.push(lin("Abertura", aberturaDe(d)));
    l.push(lin("DN", txt(d.dn)), lin("Vazão", txt(d.vazao)), lin("Circuito", txt(d.circuito)), lin("Material", txt(d.material)));
    if (temNum(d.area) && +d.area >= 0.005) l.push(["Área", m2(+d.area)]); else if (t === "laje" && q.area >= 0.005) l.push(["Área em planta", m2(q.area)]);
    if (temNum(d.volume) && +d.volume > 0) l.push(["Volume", fmt(+d.volume, 3) + " m³"]);
    l.push(lin("Marca", txt(d.marca)), lin("Etapa", txt(d.etapa)), lin("Fase", txt(d.fase)));
    arr(d.extra).forEach(function (e) { if (e && e[0] && e[1] != null && e[1] !== "") l.push([txt(e[0]), txt(e[1])]); });
    return limpa(l);
  }
  function textoFicha(linhas) { return arr(linhas).map(function (q) { return q[0] + ": " + q[1]; }).join("\n"); }
  var MAX_HOT_VP = 700;

  /* fichas de uma vista: ambiente (nota ao passar o mouse sobre o identificador) e peça (link para o catálogo, quando o modelo tem o endereço) */
  function fichasDaVista(pg, v, I, anot) {
    var dados = v.vp && v.vp.dados; if (!dados) return;
    var pecas = pecasDeVp(dados), k = num(v.vp.escala, 50) / 1000;
    var loucas = pecas.filter(function (q) { return q.cls.tipo === "louca"; });
    arr(dados.ambientes && dados.ambientes.itens).forEach(function (it) {
      if (!it || arr(it.pts).length < 3) return;
      var d = typeof I.ambiente === "function" ? safe(function () { return I.ambiente(txt(it.id), it); }) : null;
      var dentro = loucas.filter(function (q) { return dentroPoli((q.bb.x0 + q.bb.x1) / 2, (q.bb.y0 + q.bb.y1) / 2, it.pts); }).map(function (q) {
        var dp = typeof I.peca === "function" ? safe(function () { return I.peca(q.uid, q.ifc, q); }) : null; return txt(dp && (dp.nome || dp.familia)) || NOME_TIPO.louca;
      });
      var cont = {}; dentro.forEach(function (nm) { cont[nm] = (cont[nm] || 0) + 1; });
      var rotL = Object.keys(cont).map(function (nm) { return cont[nm] > 1 ? cont[nm] + " x " + nm : nm; });
      var ficha = fichaAmbiente(it, d, rotL); if (!ficha.length) return;
      /* a nota fica sobre o identificador do ambiente (nome / número · área), como o desenho o põe; sem identificador, sobre o contorno */
      var bb = bboxPts(it.pts), rect;
      if (isFinite(it.x) && isFinite(it.y)) {
        var h1 = 3 * k, h2 = 2.5 * k, w = Math.max(txt(it.linha1).length * h1 * 0.6, txt(it.linha2).length * h2 * 0.58, 8 * k);
        rect = paraFolha(v, it.x - w / 2 - k, it.y - h1 - 1.2 * k, it.x + w / 2 + k, it.y + h2 + 2.2 * k);
      } else rect = paraFolha(v, bb.x0, bb.y0, bb.x1, bb.y1);
      rect = noQuadro(rect, v.b); if (!rect) return;
      anot.push({ pg: pg, x: rect.x, y: rect.y, w: rect.w, h: rect.h, tipo: "nota", titulo: txt((d && d.nome) || it.linha1 || "Ambiente"), texto: textoFicha(ficha), amb: txt(it.id), z: 1 });
    });
  }

  /* ------------------------------------------------ o adaptador do app: lê o MODELO aberto (ambientes, Propriedades, elementos) e devolve as funções que o motor usa.
     Nada é inventado: sem o dado, a função devolve null/campo vazio e a ficha simplesmente não leva a linha. `G` = window (nos testes, um objeto de mentira). */
  function adaptadorApp(G) {
    G = G || global;
    function ambiente(id) {
      var AU = G.BimAmbienteUI, st = AU && AU.estado ? safe(function () { return AU.estado(); }) : null, a = null;
      arr(st && st.ambientes).forEach(function (x) { if (!a && x && String(x.id) === String(id)) a = x; });
      if (!a) return null;
      var c = a.calc || {}, deli = c.estado === "delimitado", numero = AU && AU.numero ? safe(function () { return AU.numero(a); }) : a.numero;
      return { nome: txt(a.nome).trim(), numero: txt(numero), area: deli ? c.area : null, perimetro: deli ? c.perimetro : null, peDireito: temNum(c.altura) ? c.altura : null, volume: deli ? c.volume : null,
        acabPiso: a.acabPiso, acabBase: a.acabBase, acabParede: a.acabParede, acabForro: a.acabForro, ocupacao: a.ocupacao, departamento: a.departamento, comentarios: a.comentarios };
    }
    /* a peça: as PROPRIEDADES que o usuário vê na paleta (BimPropsUI.modelo) e, para o que veio de IFC, o cadastro do elemento (família, etapa, código de orçamento) */
    function peca(uid, ifc) {
      uid = txt(uid); if (!uid) return null;
      var d = { extra: [] }, achou = false, id = uid.replace(/^edit:/, "");
      var PU = G.BimPropsUI, ctx = PU && PU.contextoTela ? safe(function () { return PU.contextoTela(); }) : null;
      var m = ctx && PU.modelo ? safe(function () { return PU.modelo(ctx, [id], null); }) : null;
      if (m && arr(m.pecas).length) {
        achou = true;
        if (m.tipo) { d.familia = txt(m.tipo.familia); d.nome = txt(m.tipo.nome); }
        arr(m.secoes).forEach(function (sec) {
          arr(sec.linhas).forEach(function (l) {
            var t = txt(l.texto).trim(), nm = txt(l.nome).trim(); if (!t || l.varios || /^<[^>]*>$/.test(t)) return;   /* "<Por categoria>" e afins são marcador do app, não dado */
            var v = t + (l.un && t.slice(-String(l.un).length) !== l.un ? " " + l.un : "");
            if (/^https?:\/\//i.test(t)) { if (!d.uri) d.uri = t; return; }
            /* LISTA BRANCA de parâmetros de interesse; o resto (controle interno do app) fica de fora */
            if (/^fabricante/i.test(nm)) d.fabricante = v;
            else if (/^(dn|di[aâ]metro nominal)\b/i.test(nm)) d.dn = v;
            else if (/vaz[aã]o/i.test(nm)) d.vazao = v;
            else if (/^circuito/i.test(nm)) d.circuito = v;
            else if (/^c[oó]digo\b/i.test(nm)) d.codigo = v;
            else if (/^(largura|altura|comprimento|espessura|profundidade|di[aâ]metro)$/i.test(nm)) { d.medidas = d.medidas || {}; d.medidas[nm.toLowerCase().replace("â", "a")] = v; }
            else if (/peitoril/i.test(nm)) d.peitoril = v;
            else if (/^abre para fora$/i.test(nm)) d.abreFora = /^s/i.test(t);
            else if (/^m[aã]o direita$/i.test(nm)) d.maoDireita = /^s/i.test(t);
            else if (/^[áa]rea$/i.test(nm)) d.area = parseFloat(t.replace(/\./g, "").replace(",", "."));
            else if (/^volume$/i.test(nm)) d.volume = parseFloat(t.replace(/\./g, "").replace(",", "."));
            else if (/^material$/i.test(nm)) d.material = v;
            else if (/^marca$/i.test(nm)) d.marca = v;
            else if (/^fase criada$/i.test(nm)) d.fase = v;
          });
        });
      }
      var el = null; arr(G.BIM && G.BIM.elementos).forEach(function (e) { if (!el && e && txt(e.uid) === uid) el = e; });
      if (el) {
        achou = true;
        if (!d.nome && el.nome && el.nome !== "—") d.nome = txt(el.nome);
        if (!d.familia && el.familia) d.familia = txt(el.familia);
        if (el.etapa) d.etapa = txt(el.etapa);
        if (el.tag) d.extra.push(["Marca", txt(el.tag)]);
        if (el.codOrc) d.extra.push(["Código de orçamento", txt(el.codOrc)]);
      }
      return achou ? d : null;
    }
    /* a placa desta obra, se estiver NO AR (publicada, com modelo, não vencida): { url, urlPv }. Sem placa, sem rede ou sem permissão: null (o PDF avisa e omite o QR). Espera no máximo `ms` (6 s). */
    function portal(g, ms) {
      var RN = G.RvNuvem;
      if (!g || !g._rvPodePlaca || !g._rvPlacaPost || !RN || !RN.resumoPlaca) return Promise.resolve(null);
      if (!safe(function () { return g._rvPodePlaca(); })) return Promise.resolve(null);
      var limite = new Promise(function (res) { setTimeout(function () { res(null); }, ms || 6000); });
      var q = Promise.resolve(safe(function () { return g._rvPlacaPost("/rv/placas"); })).then(function (j) {
        var p = arr(j && j.placas).filter(function (x) { return String(x.obraId || "") === String(g._bimSel || ""); })[0];
        if (!p || !/^https?:\/\/[^\s]+$/i.test(txt(p.url))) return null;
        if (RN.resumoPlaca(p).estado !== "no ar") return null;
        return { url: p.url, urlPv: p.url + (p.url.indexOf("?") >= 0 ? "&" : "?") + "pv=1" };
      })["catch"](function () { return null; });
      return Promise.race([q, limite]);
    }
    /* ANEXOS: as TABELAS do modelo (quantitativo: a mesma planilha .xlsx da tela, no máx. 6) + o que os módulos registrarem em `extras` (funções → Promise<[{ nome, bytes, mime, desc }]>, ex.: memorial).
       Só entra o que EXISTE: sem tabela no modelo nem extra registrado, a lista é vazia. */
    function anexos(extras) {
      var TU = G.BimTabelaUI, TB = G.BimTabela, EX = G.ExcelOrc || G.Excel, out = [], seq = Promise.resolve(), tabs = [];
      try { if (TU && TU.ativo && TU.ativo() && TU.tabelas) tabs = TU.tabelas().slice(0, 6); } catch (e0) { tabs = []; }
      if (tabs.length && TB && TB.construirXlsx && EX && EX.ensureExcelJS) {
        seq = seq.then(function () { return new Promise(function (res) { try { EX.ensureExcelJS(function () { res(true); }); } catch (e) { res(false); } }); }).then(function (ok) {
          if (!ok || !G.ExcelJS) return null;
          var s2 = Promise.resolve();
          tabs.forEach(function (t) {
            s2 = s2.then(function () {
              var sd = TU.gerar(t.id); if (!sd || !sd.tabela) return null;
              return TB.construirXlsx(G.ExcelJS, sd, {}).xlsx.writeBuffer().then(function (buf) {
                out.push({ nome: TB.nomeArquivo(t.nome) + ".xlsx", bytes: new Uint8Array(buf), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", desc: "Quantitativo do modelo: " + t.nome });
              });
            })["catch"](function () {});
          });
          return s2;
        });
      }
      arr(extras).forEach(function (fn) { seq = seq.then(function () { return fn(); }).then(function (l) { arr(l).forEach(function (x) { out.push(x); }); })["catch"](function () {}); });
      return seq.then(function () { return out; });
    }
    /* a ETAPA de uma peça (uid): a do cadastro do elemento (o carimbo de etapa do orçamento/cronograma) ou da fase do modelo */
    function etapaDe(uid) {
      var el = null; arr(G.BIM && G.BIM.elementos).forEach(function (e) { if (!el && e && txt(e.uid) === txt(uid)) el = e; });
      return el ? txt(el.etapa || el.fase) : "";
    }
    return { ambiente: ambiente, peca: peca, etapaDe: etapaDe, portal: portal, anexos: anexos };
  }

  /* ------------------------------------------------ QR por folha (portal da obra / vista 3D) e botão "Abrir em 3D (Prancha Viva)"
     O QR e o botão só existem com a PLACA DA OBRA PUBLICADA (I.portal = { url, urlPv }): sem endereço publicado, nada é desenhado e o aviso diz isso.
     ⚠ As rotas que existem no servidor são o portal (/rv/p/<placa>), a Prancha Viva (?pv=1) e o enquadramento de ambiente (?amb=<id>): NÃO há rota por folha nem por peça;
       por isso o link da folha e o da peça abrem a Prancha Viva da obra, não "aquela" folha. */
  function urlOk(u) { return /^https?:\/\/[^\s]+$/i.test(txt(u)); }
  function qrRects(m, x, y, tam, margem) {
    var n = m.n, tot = n + 2 * margem, k = tam / tot, s = "";
    for (var r = 0; r < n; r++) {
      var c = 0;
      while (c < n) {
        if (!m.escuro(r, c)) { c++; continue; }
        var c0 = c; while (c < n && m.escuro(r, c)) c++;
        s += "<rect x=\"" + n3(x + (c0 + margem) * k) + "\" y=\"" + n3(y + (r + margem) * k) + "\" width=\"" + n3((c - c0) * k + 0.02) + "\" height=\"" + n3(k + 0.02) + "\" fill=\"#000\"/>";
      }
    }
    return s;
  }
  function sobrepoe(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function ocupados(it, g) {
    var out = [];
    arr(it.folha && it.folha.blocos).forEach(function (b) {
      if (!b) return;
      out.push({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + (b.tipo === "viewport" ? 15 : 6) });
    });
    if (g && g.carimbo) out.push({ x: g.carimbo.x - 2, y: g.carimbo.y - 2, w: g.carimbo.w + 4, h: g.carimbo.h + 4 });
    if (g && g.coluna && !g.semColuna) out.push({ x: g.coluna.x - 1, y: g.coluna.y, w: g.coluna.w + 2, h: g.coluna.h });
    return out;
  }
  /* → { svg, anot: [{ x, y, w, h, tipo: "uri", uri, titulo }], aviso } ; svg vazio quando não há portal publicado ou não cabe */
  function rodapeFolha(it, g, I) {
    var P = I && I.portal;
    if (!P || !urlOk(P.url)) return { svg: "", anot: [], aviso: "Sem placa da obra publicada: QR e link da Prancha Viva omitidos (publique a placa da obra e gere o PDF de novo)." };
    var mat = typeof I.qr === "function" ? safe(function () { return I.qr(txt(P.urlQr || P.url)); }) : null;
    if (!mat || !(mat.n > 0)) return { svg: "", anot: [], aviso: "QR indisponível neste aparelho: omitido." };
    var pw = g.papel.w, tam = pw >= 594 ? 22 : pw >= 420 ? 18 : 14, fs = tam >= 18 ? 2.1 : 1.7, txB = "Abrir em 3D (Prancha Viva)", wTxt = larg(txB, fs, false) + 1.5, bw = Math.max(tam, wTxt), bh = tam + fs * 3.2;
    var a = g.area, cands = [[a.x + 2, a.y + a.h - bh - 2], [a.x + a.w - bw - 2, a.y + a.h - bh - 2], [a.x + a.w - bw - 2, a.y + 2], [a.x + 2, a.y + 2]], oc = ocupados(it, g), pos = null;
    cands.forEach(function (c) { if (pos) return; var r = { x: c[0], y: c[1], w: bw, h: bh }; if (!oc.some(function (o) { return sobrepoe(r, o); })) pos = r; });
    if (!pos) return { svg: "", anot: [], aviso: "Folha " + numeroDe(it) + ": sem espaço livre para o QR (omitido)." };
    var x = pos.x, y = pos.y, s = "<rect x=\"" + n3(x - 0.8) + "\" y=\"" + n3(y - 0.8) + "\" width=\"" + n3(bw + 1.6) + "\" height=\"" + n3(bh + 1.6) + "\" fill=\"#fff\" stroke=\"#9aa7b4\" stroke-width=\"0.15\"/>";
    s += qrRects(mat, x + (bw - tam) / 2, y, tam, 1);
    s += T(x + bw / 2, y + tam + fs * 1.15, "PORTAL DA OBRA E 3D", fs, { anc: "middle", neg: 1, cor: "#111" });
    s += T(x + bw / 2, y + tam + fs * 2.6, txB, fs, { anc: "middle", cor: LINK });
    s += "<line x1=\"" + n3(x + bw / 2 - wTxt / 2 + 0.7) + "\" y1=\"" + n3(y + tam + fs * 2.8) + "\" x2=\"" + n3(x + bw / 2 + wTxt / 2 - 0.7) + "\" y2=\"" + n3(y + tam + fs * 2.8) + "\" stroke=\"" + LINK + "\" stroke-width=\"0.12\"/>";
    var anot = [{ x: n3(x + (bw - tam) / 2), y: n3(y), w: tam, h: tam, tipo: "uri", uri: txt(P.urlQr || P.url), titulo: "Portal da obra (QR)" }];
    anot.push({ x: n3(x), y: n3(y + tam + fs * 1.5), w: bw, h: fs * 1.9, tipo: "uri", uri: txt(P.urlPv || P.url), titulo: "Abrir em 3D (Prancha Viva)" });
    return { svg: s, anot: anot, aviso: "" };
  }

  /* ------------------------------------------------ anexos (xlsx de quantitativo, memorial): o app entrega { nome, bytes | dados, mime, desc } */
  function binStr(x) {
    if (typeof x === "string") return x;
    var s = "", n = 0x8000, u = x; if (!u || typeof u.length !== "number") return "";
    for (var i = 0; i < u.length; i += n) s += String.fromCharCode.apply(null, Array.prototype.slice.call(u, i, i + n));
    return s;
  }
  function normAnexos(lista, avisos) {
    var out = [], vistos = {};
    arr(lista).forEach(function (x) {
      if (!x || !txt(x.nome)) return;
      var dados = binStr(x.dados != null ? x.dados : x.bytes); if (!dados.length) { avisos.push("Anexo vazio ignorado: " + txt(x.nome)); return; }
      var nome = txt(x.nome).replace(/[\\\/:*?"<>|]/g, "_"), base = nome, k = 2; while (vistos[nome]) nome = base.replace(/(\.[^.]*)?$/, "-" + (k++) + "$1");
      vistos[nome] = 1; out.push({ nome: nome, dados: dados, mime: txt(x.mime) || "application/octet-stream", desc: txt(x.desc) || nome });
    });
    return out;
  }
  function kb(n) { return n >= 1048576 ? fmt(n / 1048576, 1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

  /* o painel da primeira página do índice (à direita da lista): QR do portal, botão da Prancha Viva e os anexos do PDF (cada um com o clipe: abre no Acrobat) */
  var PX = 238;
  function painelCapa(I, anexos, mat, modos, pg3d) {
    var s = "", anot = [], y = 30;
    s += "<rect x=\"" + (PX - 3) + "\" y=\"" + (y - 4) + "\" width=\"" + (A4.w - PX - 7) + "\" height=\"" + (A4.h - 12 - (y - 4) - 6) + "\" fill=\"#f6f8fa\" stroke=\"#c9d2db\" stroke-width=\"0.2\"/>";
    s += T(PX, y, "PORTAL DA OBRA E 3D", 2.6, { neg: 1, cor: AZUL }); y += 3;
    var P = I && I.portal;
    if (P && urlOk(P.url) && mat && mat.n > 0) {
      s += qrRects(mat, PX, y, 30, 1);
      anot.push({ x: PX, y: y, w: 30, h: 30, tipo: "uri", uri: txt(P.urlQr || P.url), titulo: "Portal da obra (QR)" });
      y += 33; s += T(PX, y, "Abrir em 3D (Prancha Viva)", 2.3, { cor: LINK }); anot.push({ x: PX, y: y - 3, w: larg("Abrir em 3D (Prancha Viva)", 2.3, false), h: 4, tipo: "uri", uri: txt(P.urlPv || P.url), titulo: "Abrir em 3D (Prancha Viva)" });
      y += 8;
    } else { s += T(PX, y + 3, "Sem placa da obra publicada:", 2.2, { cor: CINZA }) + T(PX, y + 6.4, "QR e link 3D omitidos.", 2.2, { cor: CINZA }); y += 14; }
    if (pg3d >= 0) { s += T(PX, y, "Modelo 3D (imagem): pág. " + (pg3d + 1), 2.3, { cor: LINK }); anot.push({ x: PX, y: y - 3, w: 40, h: 4, tipo: "ir", titulo: "Ir para a página do modelo 3D", dest: { pg: pg3d } }); y += 7; }
    if (arr(modos).length) {
      s += T(PX, y, "MODOS DE VISUALIZAÇÃO", 2.6, { neg: 1, cor: AZUL }); y += 3;
      modos.forEach(function (m) {
        s += "<rect x=\"" + PX + "\" y=\"" + n3(y) + "\" width=\"" + (A4.w - PX - 13) + "\" height=\"6\" fill=\"#fff\" stroke=\"" + LINK + "\" stroke-width=\"0.25\"/>" + T(PX + (A4.w - PX - 13) / 2, y + 4.1, m.nome, 2.5, { anc: "middle", cor: LINK });
        anot.push({ x: PX, y: y, w: A4.w - PX - 13, h: 6, tipo: "modo", titulo: m.nome + " (liga e desliga camadas)", acoes: [{ liga: m.liga, desliga: m.desliga }] });
        y += 7.5;
      });
      s += T(PX, y + 1, "Camadas: painel do leitor (Acrobat).", 1.9, { cor: CINZA }); y += 7;
    }
    s += T(PX, y, "ANEXOS DO PDF", 2.6, { neg: 1, cor: AZUL }); y += 5;
    if (!anexos.length) s += T(PX, y, "Nenhum anexo.", 2.2, { cor: CINZA });
    anexos.forEach(function (x) {
      if (y > A4.h - 24) return;
      s += T(PX + 4.5, y, cortar(x.nome, 2.2, 38), 2.2, { cor: "#111" }) + T(PX + 4.5, y + 2.7, kb(x.dados.length), 1.8, { cor: CINZA });
      anot.push({ x: PX, y: y - 3, w: 4, h: 4, tipo: "anexo", nome: x.nome, titulo: x.desc });
      y += 7;
    });
    return { svg: s, anot: anot, fimY: y };
  }

  /* ------------------------------------------------ CAMADAS DINÂMICAS por cima do desenho: ETAPAS da obra, REVISÃO anterior e NUVEM de revisão
     Tudo em unidades do desenho (metros) dentro do mesmo grupo escalado da vista; as camadas entram em ctx.cam.dyn e viram OCG do PDF. */
  var PALETA_ETAPA = ["#d9480f", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f08c00", "#0b7285", "#c2255c", "#5f3dc4", "#e67700", "#087f5b", "#495057", "#a61e4d"];
  var MAX_ETAPAS = 12, MAX_NUVENS = 300;
  function slugLetras(s) {
    var t = txt(s).toLowerCase(); if (typeof t.normalize === "function") t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
    t = t.replace(/[^a-z]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24); return t || "etapa";
  }
  function dReta(pts, fechado) { var d = ""; arr(pts).forEach(function (q, i) { d += (i ? "L" : "M") + n3(q[0]) + " " + n3(q[1]); }); return d + (fechado ? "Z" : ""); }
  function hashPts(pts) {
    var h = 0x811c9dc5, t = arr(pts).map(function (q) { return Math.round(q[0] * 1000) + "," + Math.round(q[1] * 1000); }).join(";");
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return h.toString(16);
  }
  /* o retrato do desenho de uma vista, para a PRÓXIMA revisão comparar: { v, rotulo?, svg, mapa: { uid: { h: hash dos contornos, bb: [x0, y0, x1, y1] } } } */
  function snapshotDe(vp, svg) {
    var mapa = {}, n = 0;
    arr(vp && vp.dados && vp.dados.cortes).forEach(function (c) {
      var u = txt(c && c.u); if (!u || !c.pts) return;
      var bb = bboxPts(c.pts); if (!bb) return;
      var q = mapa[u]; if (!q) { q = mapa[u] = { h: "", bb: [bb.x0, bb.y0, bb.x1, bb.y1] }; n++; }
      q.h += hashPts(c.pts) + "."; q.bb = [Math.min(q.bb[0], bb.x0), Math.min(q.bb[1], bb.y0), Math.max(q.bb[2], bb.x1), Math.max(q.bb[3], bb.y1)];
    });
    var s = txt(svg);
    return { v: 1, svg: s.length <= 3000000 ? s : "", mapa: mapa, n: n };
  }
  /* o que mudou entre o retrato anterior e a vista de agora: caixas (m) dos elementos NOVOS, ALTERADOS (contorno diferente) e REMOVIDOS */
  function mudancas(snap, vp) {
    var atual = snapshotDe(vp, "").mapa, out = [];
    Object.keys(atual).forEach(function (u) { var a = snap.mapa[u]; if (!a || a.h !== atual[u].h) out.push(atual[u].bb); });
    Object.keys(snap.mapa).forEach(function (u) { if (!atual[u]) out.push(snap.mapa[u].bb); });
    return out;
  }
  function fundirCaixas(bbs, folga) {
    var L = bbs.map(function (b) { return [b[0] - folga, b[1] - folga, b[2] + folga, b[3] + folga]; }), mexeu = true;
    while (mexeu && L.length > 1) {
      mexeu = false;
      for (var i = 0; i < L.length && !mexeu; i++) for (var j = i + 1; j < L.length && !mexeu; j++) {
        var a = L[i], b = L[j];
        if (a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]) { L[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; L.splice(j, 1); mexeu = true; }
      }
    }
    return L;
  }
  /* a nuvem de revisão: contorno retangular com arcos para fora (Q), arco de ~`arco` unidades */
  function nuvemD(b, arco) {
    var P = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], d = "M" + n3(P[0][0]) + " " + n3(P[0][1]);
    for (var i = 0; i < 4; i++) {
      var A = P[i], B = P[(i + 1) % 4], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), n = Math.max(2, Math.round(L / arco)), ux = dx / L, uy = dy / L, nx = uy, ny = -ux;
      for (var j = 0; j < n; j++) {
        var t0 = j / n, t1 = (j + 1) / n, p1 = [A[0] + dx * t1, A[1] + dy * t1], c = [A[0] + dx * (t0 + t1) / 2 + nx * L / n * 0.55, A[1] + dy * (t0 + t1) / 2 + ny * L / n * 0.55];
        d += "Q" + n3(c[0]) + " " + n3(c[1]) + " " + n3(p1[0]) + " " + n3(p1[1]);
      }
    }
    return d + "Z";
  }
  /* o desenho do retrato anterior, só traço (sem cor, hachura, texto e imagem), numa cor de revisão: serve de "fantasma" para comparar */
  function fantasma(svg, cor, larg0) {
    var s = txt(svg).replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    s = s.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<defs>[\s\S]*?<\/defs>/g, "").replace(/<pattern\b[\s\S]*?<\/pattern>/g, "").replace(/<clipPath\b[\s\S]*?<\/clipPath>/g, "")
      .replace(/<text\b[\s\S]*?<\/text>/g, "").replace(/<image\b[^>]*?\/?>/g, "");
    /* tira a cor própria de cada traço, MAS quem não tinha traço (stroke:none) ou preenchimento (alvo de clique) continua sem */
    s = s.replace(/\bstyle="([^"]*)"/g, function (_, st) {
      var o = st.split(";").filter(function (d) { var i = d.indexOf(":"); if (i < 1) return false; var k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim().toLowerCase(); if (/^(opacity|fill-opacity|stroke-opacity)$/.test(k)) return false; if (k === "fill") return false; if (k === "stroke") return v === "none" || v === "transparent"; return true; }).join(";");
      return o ? "style=\"" + o + "\"" : "";
    });
    s = s.replace(/\bfill="[^"]*"/g, "fill=\"none\"").replace(/\bstroke="([^"]*)"/g, function (m, v) { return /^(none|transparent)$/i.test(v) ? m : "stroke=\"" + cor + "\""; });
    return "<g fill=\"none\" stroke=\"" + cor + "\" stroke-width=\"" + n3(larg0 || 0.02) + "\">" + s + "</g>";
  }
  /* a revisão ATUAL da folha: I.revisao.atualDe(folha) (cada folha tem as suas) ou I.revisao.atual (a mesma para todas) */
  function revAtual(R, folha) { var q = R && typeof R.atualDe === "function" ? safe(function () { return R.atualDe(folha); }) : (R && R.atual) || null; return q || null; }
  /* chamada do folhapdf.viewport: devolve o SVG (em unidades do desenho) das camadas dinâmicas desta vista e registra os nomes em `a.cam.dyn`.
     a = { vp, b, svg (a vista já com as penas), I, cam, cfg, pr, folha, saida }  (saida.nuvens = caixas das nuvens, para a nota de cada uma) */
  function sobreposicao(a) {
    var vp = a.vp, I = a.I || {}, cam = a.cam, cfg = a.cfg, dados = vp && vp.dados, out = "", kmm = num(vp && vp.escala, 50) / 1000 > 0 ? 1000 / num(vp.escala, 50) : 20;
    if (!dados || !cam || !cam.dyn) return "";
    function camada(id, nome, desligada) { if (!cam.dyn.nomes[id]) { cam.dyn.ordem.push(id); cam.dyn.nomes[id] = nome; if (desligada) cam.dyn.off[id] = true; } cam.usados[id] = 1; }
    function incluida(id) { return !(cfg && cfg.incluir && cfg.incluir[id] === false); }
    /* ETAPAS: cada etapa do modelo é uma camada (desligada); ligada, pinta o que é dela por cima do desenho */
    if (typeof I.etapaDe === "function") {
      var porEt = {}, ordem = [];
      arr(dados.cortes).forEach(function (c) {
        var u = txt(c && c.u); if (!u || !c.pts || c.pts.length < 2) return;
        var et = txt(safe(function () { return I.etapaDe(u); })).trim(); if (!et) return;
        if (!porEt[et]) { if (ordem.length >= MAX_ETAPAS) return; porEt[et] = []; ordem.push(et); }
        porEt[et].push(c);
      });
      ordem.forEach(function (et, i) {
        var id = "etapa-" + slugLetras(et); if (!incluida(id)) return;
        var cor = PALETA_ETAPA[i % PALETA_ETAPA.length], w = n3(0.35 / kmm), s = "";
        porEt[et].forEach(function (c) { s += "<path d=\"" + dReta(c.pts, !!c.fechado) + "\" fill=\"" + (c.fechado ? cor : "none") + "\" fill-opacity=\"0.4\" stroke=\"" + cor + "\" stroke-width=\"" + w + "\"/>"; });
        camada(id, "Etapa: " + et, true); out += "<g data-ocg=\"" + id + "\">" + s + "</g>";
      });
    }
    /* REVISÃO anterior (fantasma) e NUVEM de revisão */
    var R = I.revisao;
    if (R && typeof R.anterior === "function") {
      var chave = txt(a.pr && a.pr.id) + "|" + txt(a.folha && a.folha.id) + "|" + txt(a.b && a.b.vistaId) + "#" + txt(a.ix), snap = safe(function () { return R.anterior(chave, a.folha); });
      if (snap && snap.mapa) {
        var rot = txt(snap.rotulo || (R.anteriorNumero) || "anterior"), atualN = txt((revAtual(R, a.folha) || {}).numero);
        if (snap.svg && incluida("revant")) { camada("revant", "Revisão anterior (" + rot + ")", true); out += "<g data-ocg=\"revant\">" + fantasma(snap.svg, "#7a8ba0", 0.3 / kmm) + "</g>"; }
        var mud = mudancas(snap, vp);
        if (mud.length && incluida("nuvem")) {
          var caixas = fundirCaixas(mud, 0.3);
          if (caixas.length <= MAX_NUVENS) {
            var arco = 6 / kmm, w2 = n3(0.5 / kmm), s2 = "";
            caixas.forEach(function (b2) {
              s2 += "<path d=\"" + nuvemD(b2, arco) + "\" fill=\"none\" stroke=\"#d00000\" stroke-width=\"" + w2 + "\"/>";
              if (atualN) s2 += "<text x=\"" + n3(b2[2] + 0.4) + "\" y=\"" + n3(b2[1] - 0.4) + "\" font-size=\"" + n3(2.4 / kmm) + "\" font-weight=\"bold\" fill=\"#d00000\">" + esc(atualN) + "</text>";
              if (a.saida) (a.saida.nuvens = a.saida.nuvens || []).push({ x0: b2[0], y0: b2[1], x1: b2[2], y1: b2[3] });
            });
            camada("nuvem", "Nuvem de revisão" + (atualN ? " (" + atualN + ")" : ""), false); out += "<g data-ocg=\"nuvem\">" + s2 + "</g>";
          }
        }
      }
    }
    return out;
  }

  /* a REVISÃO do app: atualDe(folha) = a última revisão marcada na folha; anterior(chave, folha) = o retrato guardado SE for de outra revisão que a atual.
     `guardaveis` = o que guardar depois do PDF: só retrato de revisão EMITIDA, e só se ainda não estiver guardado para essa revisão. */
  function criarRevisao(P, projeto, snaps) {
    var rev = {
      atualDe: function (folha) { var r = P && P.revisaoAtual ? P.revisaoAtual(folha, projeto) : null; return r ? { id: r.id, numero: r.numero, descricao: r.descricao, emitida: !!r.emitida } : null; },
      anterior: function (chave, folha) { var sn = (snaps || {})[chave], cur = rev.atualDe(folha); return sn && cur && sn.revId && sn.revId !== cur.id ? sn : null; }
    };
    return rev;
  }
  function guardaveis(lista, itens, projeto, P, snaps) {
    var out = [];
    arr(lista).forEach(function (q) {
      var a = arr(itens).filter(function (x) { return x.folha.id === q.folhaId; })[0], cur = a && P && P.revisaoAtual ? P.revisaoAtual(a.folha, projeto) : null;
      if (!cur || !cur.emitida || q.snap.revId !== cur.id) return;
      var ant = (snaps || {})[q.chave]; if (ant && ant.revId === cur.id) return;
      out.push(q);
    });
    return out;
  }

  /* ------------------------------------------------ ELEMENTO → PÁGINA DE DETALHE (anexo de detalhes no fim do PDF)
     Cada ambiente e cada CONJUNTO de peças iguais (porta 80 x 210, parede de 15 cm, tubo DN 50…) ganha uma página A4: vista ampliada feita dos contornos do desenho (a peça em destaque e o entorno em cinza),
     ficha do modelo, quantitativo e, para viga, pilar e laje, o DETALHAMENTO DE ARMAÇÃO que já existe (I.detalheArmacao → js/concpranchas.js pecaSvg). Viga, pilar e laje são uma página POR PEÇA
     (cada uma tem a sua armação); as demais são por conjunto. Limite: MAX_DETALHES páginas (o resto fica sem página, com aviso). */
  var MAX_DETALHES = 120, ESCALAS_DET = [5, 10, 20, 25, 50, 75, 100, 200, 250, 500];
  var INDIVIDUAIS = { viga: 1, pilar: 1, laje: 1 };
  function idSeguro(id) { return /^[A-Za-z0-9_.:-]{1,64}$/.test(txt(id)); }
  /* a chave que junta peças iguais */
  function chaveGrupo(q, d, indiv) {
    d = d || {};
    var w = q.bb.x1 - q.bb.x0, h = q.bb.y1 - q.bb.y0, mx = Math.max(w, h), mn = Math.min(w, h), t = q.cls.tipo, nome = txt(d.familia || d.nome);
    if (INDIVIDUAIS[t] && q.uid && indiv) return t + "|" + q.uid;   /* uma página POR PEÇA só quando há armação própria para mostrar */
    if (d.chave) return t + "|" + d.chave;
    if (t === "parede") return t + "|" + nome + "|esp " + fmt(mn * 100, 0);
    if (t === "porta" || t === "janela") return t + "|" + (nome || "larg " + fmt(mx * 100, 0)) + "|" + txt(d.dimensoes);
    if (t === "tubo") return t + "|" + nome + "|" + txt(d.dn) + "|" + q.ifc;
    if (t === "viga" || t === "pilar" || t === "laje") return t + "|" + nome + "|sec " + fmt(mn * 100, 0);
    return t + "|" + (nome || q.ifc) + "|" + txt(d.dn) + txt(d.dimensoes);
  }
  function nomeGrupo(q, d) {
    d = d || {}; var t = NOME_TIPO[q.cls.tipo], n = txt(d.nome || d.familia), w = q.bb.x1 - q.bb.x0, h = q.bb.y1 - q.bb.y0, mn = Math.min(w, h), mx = Math.max(w, h);
    if (n) return t + ": " + n;
    if (q.cls.tipo === "parede") return t + " de " + fmt(mn * 100, 0) + " cm";
    if ((q.cls.tipo === "porta" || q.cls.tipo === "janela") && mx > 0) return t + " de " + fmt(mx * 100, 0) + " cm de vão";
    if (q.cls.tipo === "tubo" && d.dn) return t + " DN " + txt(d.dn);
    return t;
  }
  /* percorre as vistas e junta as peças em conjuntos; cada ocorrência guarda o retângulo no papel (mm) para o link */
  function coletarGrupos(itens, res, I, nIdx) {
    var por = {}, lista = [], vistosUid = {};
    function grupo(chave, mk) { if (!por[chave]) { por[chave] = mk(); por[chave].chave = chave; lista.push(por[chave]); } return por[chave]; }
    itens.forEach(function (it, i) {
      arr((res[i] || {}).vps).forEach(function (v) {
        var dados = v.vp && v.vp.dados; if (!dados) return;
        var pecas = pecasDeVp(dados), loucas = pecas.filter(function (q) { return q.cls.tipo === "louca"; });
        arr(dados.ambientes && dados.ambientes.itens).forEach(function (a) {
          if (!a || arr(a.pts).length < 3 || !idSeguro(a.id)) return;
          var d = typeof I.ambiente === "function" ? safe(function () { return I.ambiente(txt(a.id), a); }) : null, bb = bboxPts(a.pts);
          var g = grupo("ambiente|" + a.id, function () {
            var dentro = loucas.filter(function (q) { return dentroPoli((q.bb.x0 + q.bb.x1) / 2, (q.bb.y0 + q.bb.y1) / 2, a.pts); }), cont = {};
            dentro.forEach(function (q) { var dp = typeof I.peca === "function" ? safe(function () { return I.peca(q.uid, q.ifc, q); }) : null, nm = txt(dp && (dp.nome || dp.familia)) || NOME_TIPO.louca; cont[nm] = (cont[nm] || 0) + 1; });
            var rot = Object.keys(cont).map(function (nm) { return cont[nm] > 1 ? cont[nm] + " x " + nm : nm; });
            return { tipo: "ambiente", cls: { tipo: "ambiente", ord: 0 }, nome: "Ambiente: " + txt((d && d.nome) || a.linha1 || a.id), ficha: fichaAmbiente(a, d, rot), amb: a, d: d, v: v, pg: nIdx + i, bb: bb, inst: [], n: 0, area: temNum(d && d.area) ? +d.area : 0, comp: temNum(d && d.perimetro) ? +d.perimetro : 0, porFolha: {}, loucas: rot };
          });
          var r = noQuadro(paraFolha(v, bb.x0, bb.y0, bb.x1, bb.y1), v.b); if (!r) return;
          g.inst.push({ pg: nIdx + i, rect: r, z: 0 }); g.n = 1; g.porFolha[nIdx + i] = 1;
        });
        var feitos = 0;
        pecas.forEach(function (q) {
          if (feitos >= MAX_HOT_VP) return;
          var d = typeof I.peca === "function" ? safe(function () { return I.peca(q.uid, q.ifc, q); }) : null;
          var indiv = INDIVIDUAIS[q.cls.tipo] && q.uid && typeof I.detalheArmacao === "function" && !!safe(function () { var a0 = I.detalheArmacao(q.uid, q); return a0 && a0.ok; }), chave = chaveGrupo(q, d, indiv);
          var g = grupo(chave, function () { return { tipo: q.cls.tipo, cls: q.cls, nome: nomeGrupo(q, d), ficha: fichaPeca(q, d), q: q, d: d, v: v, pg: nIdx + i, bb: q.bb, inst: [], n: 0, area: 0, comp: 0, porFolha: {} }; });
          var r0 = paraFolha(v, q.bb.x0, q.bb.y0, q.bb.x1, q.bb.y1), cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2, mw = Math.max(r0.w, 3), mh = Math.max(r0.h, 3);
          var rect = noQuadro({ x: cx - mw / 2, y: cy - mh / 2, w: mw, h: mh }, v.b); if (!rect) return;
          g.inst.push({ pg: nIdx + i, rect: rect, z: 2 }); feitos++;
          if (q.uid) { if (vistosUid[q.uid + "|" + chave]) return; vistosUid[q.uid + "|" + chave] = 1; }   /* o mesmo elemento em planta e em corte conta UMA vez */
          g.n++; g.area += q.area; g.comp += q.comp > 0 ? q.comp : Math.max(q.bb.x1 - q.bb.x0, q.bb.y1 - q.bb.y0); g.porFolha[nIdx + i] = (g.porFolha[nIdx + i] || 0) + 1;
        });
      });
    });
    return lista;
  }
  function quantitativoDe(g, itens, nIdx) {
    var t = g.tipo, rows = [];
    if (t === "ambiente") {
      if (g.area > 0) rows.push(["Área", "m²", fmt(g.area, 2)]); if (g.comp > 0) rows.push(["Perímetro", "m", fmt(g.comp, 2)]);
      arr(g.loucas).forEach(function (l) { rows.push([l, "", ""]); });
      return rows;
    }
    rows.push(["Quantidade neste PDF", "un", String(g.n)]);
    if (t === "parede" || t === "viga" || t === "tubo") rows.push(["Comprimento total", "m", fmt(g.comp, 2)]);
    if (t === "parede" || t === "laje") rows.push(["Área em planta", "m²", fmt(g.area, 2)]);
    var fo = Object.keys(g.porFolha); if (fo.length > 1) fo.forEach(function (pg) { var it = itens[+pg - nIdx]; rows.push(["  " + numeroDe(it), "un", String(g.porFolha[pg])]); });
    return rows;
  }
  /* O SÍMBOLO DA PORTA/JANELA NA AMPLIADA (17/11/2026): antes só os batentes (contornos cortados) saíam, em vermelho — a página de detalhe não dizia para que lado a porta abre.
     Agora é o MESMO desenho da planta: `dados.portas` (js/simboloporta.js, gerado pelo BIM.vista2d) com a folha e o ARCO DO GIRO (ou a seta do correr); a mão e o sentido já vêm
     certos nesses dados (a folha aberta e o arco partem da dobradiça). A porta se acha pelo uid (`u`) e, sem ele, pelo que cai perto do contorno dela.
     ⚠ o svgpdf desenha o comando A como RETA até o ponto final; por isso o arco vai aqui como POLIGONAL de passos de 6° (no PDF sai curva).
     A janela não tem símbolo de abertura no desenho (a planta mostra só o contorno cortado): leva o vidro (duas linhas finas no eixo do vão) e, quando o modelo informa o número
     de folhas, os montantes; o peitoril sai na ficha (só do dado do modelo). Cota de VÃO (largura) nas duas. */
  function arcoPoli(a) {
    if (!a || !(a.r > 0) || !a.c || !a.de || !a.ate) return null;
    var a0 = Math.atan2(a.de[1] - a.c[1], a.de[0] - a.c[0]), a1 = Math.atan2(a.ate[1] - a.c[1], a.ate[0] - a.c[0]), d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;   /* o arco curto, como o `A` do SVG com a bandeira de arco pequeno */
    var n = Math.max(6, Math.ceil(Math.abs(d) / (Math.PI / 30))), pts = [];
    for (var i = 0; i <= n; i++) { var t = a0 + d * i / n; pts.push([a.c[0] + a.r * Math.cos(t), a.c[1] + a.r * Math.sin(t)]); }
    return pts;
  }
  function portaDoVao(dados, g) {
    var q = g.q, bb = q.bb, ps = arr(dados.portas), achada = null;
    ps.forEach(function (sp) { if (!achada && sp && q.uid && txt(sp.u) === q.uid) achada = sp; });
    if (achada) return achada;
    var D = dep("Desenho2D", "./desenho2d.js"), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, melhor = null, dm = Infinity, lim = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) + 0.4;
    ps.forEach(function (sp) {
      var pts = D && D.pontosPorta ? D.pontosPorta(sp) : [], ref = pts.length ? bboxPts(pts) : null; if (!ref) return;
      var dx = (ref.x0 + ref.x1) / 2 - cx, dy = (ref.y0 + ref.y1) / 2 - cy, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < dm && dist <= lim) { dm = dist; melhor = sp; }
    });
    return melhor;
  }
  function simboloVao(g, dados, P) {
    var q = g.q; if (!q || !q.bb) return null;
    var bb = q.bb, w = bb.x1 - bb.x0, h = bb.y1 - bb.y0, horiz = w >= h, vao = Math.max(w, h), svg = "", ext = { x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1 }, achouSimbolo = false;
    function cresce(pt) { ext.x0 = Math.min(ext.x0, pt[0]); ext.y0 = Math.min(ext.y0, pt[1]); ext.x1 = Math.max(ext.x1, pt[0]); ext.y1 = Math.max(ext.y1, pt[1]); }
    if (g.tipo === "porta") {
      var sp = portaDoVao(dados, g);
      if (sp) {
        var f = "", a = "";
        arr(sp.folhas).forEach(function (fo) { arr(fo).forEach(cresce); f += P(fo, true); });
        arr(sp.arcos).forEach(function (ar) { var pl = arcoPoli(ar); if (pl) { pl.forEach(cresce); a += P(pl, false); } });
        arr(sp.linhas).forEach(function (l) { cresce([l[0], l[1]]); cresce([l[2], l[3]]); a += P([[l[0], l[1]], [l[2], l[3]]], false); });
        if (f) svg += "<path d=\"" + f + "\" fill=\"#fff\" stroke=\"#111\" stroke-width=\"0.4\"/>";
        if (a) svg += "<path d=\"" + a + "\" fill=\"none\" stroke=\"#111\" stroke-width=\"0.2\"/>";
        achouSimbolo = !!(f || a);
      }
    } else {
      var cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, e = (horiz ? h : w), nF = Math.round(num(g.d && (g.d.folhas || g.d.nFolhas), 0)), seg = [];
      var A0 = horiz ? bb.x0 : bb.y0, A1 = horiz ? bb.x1 : bb.y1, off = [-e * 0.12, e * 0.12];
      off.forEach(function (o) { seg.push(horiz ? [[A0, cy + o], [A1, cy + o]] : [[cx + o, A0], [cx + o, A1]]); });   /* o vidro: duas linhas finas no eixo do vão */
      if (nF > 1 && nF <= 6) for (var i = 1; i < nF; i++) { var t = A0 + (A1 - A0) * i / nF; seg.push(horiz ? [[t, cy - e * 0.2], [t, cy + e * 0.2]] : [[cx - e * 0.2, t], [cx + e * 0.2, t]]); }   /* montantes: só se o modelo diz quantas folhas */
      seg.forEach(function (l) { svg += "<path d=\"" + P(l, false) + "\" fill=\"none\" stroke=\"#111\" stroke-width=\"0.25\"/>"; });
      achouSimbolo = true;
    }
    /* a cota de VÃO: do lado do vão onde há menos desenho (o oposto ao arco), fora da parede */
    var lado = horiz ? ((ext.y1 - bb.y1) > (bb.y0 - ext.y0) ? -1 : 1) : ((ext.x1 - bb.x1) > (bb.x0 - ext.x0) ? -1 : 1), gap = 0.3;
    /* COTA PRINCIPAL = a LARGURA NOMINAL da peça (a da ficha: 0,90 × 2,10), centrada no vão; o vão de alvenaria (o contorno cortado na parede) vem como SEGUNDA cota,
       "vão na parede", só quando difere da nominal (>1 cm). Sem a medida nominal no modelo, fica só o vão, rotulado "Vão" (não se inventa a nominal). */
    var mn = /(\d+[,.]\d+)/.exec(txt(dimensoesDe(q, g.d || {}))), nominal = mn ? parseFloat(mn[1].replace(",", ".")) : 0;
    var dims = [];
    if (nominal > 0.05 && nominal < vao * 1.5) {
      dims.push({ v: nominal, rot: (g.tipo === "janela" ? "Janela " : "Porta ") + fmt(nominal, 2) + " m" });
      if (Math.abs(vao - nominal) > 0.01) dims.push({ v: vao, rot: "Vão na parede " + fmt(vao, 2) + " m" });
    } else dims.push({ v: vao, rot: "Vão " + fmt(vao, 2) + " m" });
    var rotulo = dims.map(function (x) { return x.rot; }).join(" | ");
    function cota(ox, oy, kk) {
      var c = "";
      dims.forEach(function (dm, n) {
        var gp = 0.3 + 0.32 * n, pos = horiz ? (lado > 0 ? ext.y1 : ext.y0) + lado * gp : (lado > 0 ? ext.x1 : ext.x0) + lado * gp;
        var mid0 = horiz ? (bb.x0 + bb.x1) / 2 : (bb.y0 + bb.y1) / 2, A0 = mid0 - dm.v / 2, A1 = mid0 + dm.v / 2;
        var xa = horiz ? ox + A0 * kk : ox + pos * kk, ya = horiz ? oy + pos * kk : oy + A0 * kk, xb = horiz ? ox + A1 * kk : xa, yb = horiz ? ya : oy + A1 * kk;
        var cor = n ? "#5a6b7b" : "#0b57a4";
        c += "<path d=\"M" + n3(xa) + " " + n3(ya) + "L" + n3(xb) + " " + n3(yb) + "\" fill=\"none\" stroke=\"" + cor + "\" stroke-width=\"0.25\"/>";
        [[xa, ya], [xb, yb]].forEach(function (pt) { c += "<path d=\"M" + n3(pt[0] - 1) + " " + n3(pt[1] + 1) + "L" + n3(pt[0] + 1) + " " + n3(pt[1] - 1) + "\" fill=\"none\" stroke=\"" + cor + "\" stroke-width=\"0.3\"/>"; });
        /* linhas de chamada (da peça até a cota) */
        var ba = horiz ? [ox + A0 * kk, oy + (lado > 0 ? bb.y1 : bb.y0) * kk] : [ox + (lado > 0 ? bb.x1 : bb.x0) * kk, oy + A0 * kk], bbp = horiz ? [ox + A1 * kk, ba[1]] : [ba[0], oy + A1 * kk];
        [[ba, [xa, ya]], [bbp, [xb, yb]]].forEach(function (l) { c += "<path d=\"M" + n3(l[0][0]) + " " + n3(l[0][1]) + "L" + n3(l[1][0]) + " " + n3(l[1][1]) + "\" fill=\"none\" stroke=\"" + cor + "\" stroke-width=\"0.15\"/>"; });
        var tx = horiz ? (xa + xb) / 2 : xa + (lado > 0 ? 2 : -2), ty = horiz ? ya + (lado > 0 ? 4 : -2) : (ya + yb) / 2 + 0.8;
        c += T(tx, ty, dm.rot, 2.6, { anc: horiz ? "middle" : (lado > 0 ? "start" : "end"), cor: cor, neg: n ? 0 : 1 });
      });
      return c;
    }
    return { svg: svg, cota: cota, vao: vao, rotulo: rotulo, simbolo: achouSimbolo };
  }
  /* a vista ampliada a partir dos contornos: o conjunto em destaque (vermelho), o entorno em cinza, cotas de largura e profundidade */
  function ampliada(g, bx, by, bw, bh, idc) {
    var dados = g.v && g.v.vp && g.v.vp.dados; if (!dados) return { svg: "", esc: 0 };
    var bb = g.bb, w = Math.max(bb.x1 - bb.x0, 0.05), h = Math.max(bb.y1 - bb.y0, 0.05), marg = Math.max(0.5, 0.6 * Math.max(w, h)), ww = w + 2 * marg, wh = h + 2 * marg;
    var kmax = Math.min((bw - 18) / ww, (bh - 14) / wh), esc = ESCALAS_DET[ESCALAS_DET.length - 1];
    for (var i = 0; i < ESCALAS_DET.length; i++) if (1000 / ESCALAS_DET[i] <= kmax) { esc = ESCALAS_DET[i]; break; }
    var k = 1000 / esc, cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, ox = bx + bw / 2 - cx * k, oy = by + bh / 2 - cy * k;
    var jx = (bw / k) / 2, jy = (bh / k) / 2, J = { x0: cx - jx, y0: cy - jy, x1: cx + jx, y1: cy + jy };
    function P(pts, fechado) { var d = ""; arr(pts).forEach(function (q, i2) { d += (i2 ? "L" : "M") + n3(ox + q[0] * k) + " " + n3(oy + q[1] * k); }); return d + (fechado ? "Z" : ""); }
    var s = "<clipPath id=\"" + idc + "\"><rect x=\"" + bx + "\" y=\"" + by + "\" width=\"" + bw + "\" height=\"" + bh + "\"/></clipPath><rect x=\"" + bx + "\" y=\"" + by + "\" width=\"" + bw + "\" height=\"" + bh + "\" fill=\"#fff\" stroke=\"#111\" stroke-width=\"0.35\"/><g clip-path=\"url(#" + idc + ")\">";
    var meus = {}; arr(g.q && g.q.polis).forEach(function () {}); if (g.q && g.q.uid) meus[g.q.uid] = 1;
    var nCtx = 0, vaoPeca = g.tipo === "porta" || g.tipo === "janela";
    /* PAREDE CORTADA COM HACHURA (como na planta): só na ampliada de porta/janela, onde a parede em volta do vão é o que dá leitura ao símbolo.
       (pattern ANTES do uso e com id próprio da página: o svgpdf resolve o fill="url(#id)" pelo id) */
    var idH = idc + "h";
    if (vaoPeca) s += "<pattern id=\"" + idH + "\" patternUnits=\"userSpaceOnUse\" width=\"1.6\" height=\"1.6\" patternTransform=\"rotate(45)\"><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1.6\" stroke=\"#1a1a1a\" stroke-width=\"0.12\"/></pattern>";
    arr(dados.cortes).forEach(function (c) {
      if (!c || arr(c.pts).length < 2 || nCtx > 600) return;
      var b2 = bboxPts(c.pts); if (!b2 || b2.x1 < J.x0 || b2.x0 > J.x1 || b2.y1 < J.y0 || b2.y0 > J.y1) return;
      if (g.q && g.q.uid && txt(c.u) === g.q.uid) return;
      var cl = classeDe(c.ifc, false), parede = vaoPeca && c.fechado && cl && cl.tipo === "parede";
      nCtx++; s += "<path d=\"" + P(c.pts, !!c.fechado) + "\" fill=\"" + (parede ? "url(#" + idH + ")" : (c.fechado ? "#e4e7ea" : "none")) + "\" stroke=\"" + (parede ? "#333" : "#8a949e") + "\" stroke-width=\"" + (parede ? 0.3 : 0.2) + "\"/>";
    });
    arr(dados.linhas).slice(0, 1500).forEach(function (l) {
      if (Math.max(l[0], l[2]) < J.x0 || Math.min(l[0], l[2]) > J.x1 || Math.max(l[1], l[3]) < J.y0 || Math.min(l[1], l[3]) > J.y1) return;
      s += "<path d=\"" + P([[l[0], l[1]], [l[2], l[3]]], false) + "\" fill=\"none\" stroke=\"#aab2ba\" stroke-width=\"0.15\"/>";
    });
    if (g.tipo === "ambiente") s += "<path d=\"" + P(g.amb.pts, true) + "\" fill=\"#cfe8cf\" fill-opacity=\"0.6\" stroke=\"#d00000\" stroke-width=\"0.5\"/>";
    else arr(g.q && g.q.polis).forEach(function (pl) { s += "<path d=\"" + P(pl.pts, pl.fechado) + "\" fill=\"" + (pl.fechado ? "#fdecea" : "none") + "\" stroke=\"#d00000\" stroke-width=\"" + (vaoPeca ? 0.35 : 0.5) + "\"/>"; });
    var vao = vaoPeca ? simboloVao(g, dados, P) : null;
    if (vao) s += vao.svg;
    s += "</g>";
    if (vao && vao.cota) s += vao.cota(ox, oy, k);
    /* sem cotas: a caixa do contorno na vista não é a medida do elemento (a medida está na ficha) */
    s += T(bx + 2, by + bh - 2, "ESC 1:" + esc + " (contornos do desenho; elemento em vermelho; " + (vao && vao.cota ? "vão cotado; demais medidas na ficha" : "medidas na ficha") + ")", 2.2, { cor: CINZA });
    return { svg: s, esc: esc };
  }
  function esc2(x) { return esc(x); }
  /* a página de detalhe de UM conjunto. `ctx` = { itens, nIdx, I, pgDet (índice absoluto desta página), tot, k } → { svg, anot } (anot com pg = pgDet) */
  function paginaDetalhe(g, ctx) {
    var I = ctx.I, anot = [], pg = ctx.pgDet, folha = ctx.itens[g.pg - ctx.nIdx], t = g.tipo;
    var sub = (folha ? "Folha " + numeroDe(folha) + " - " + txt(folha.folha.conteudo) : "") + (g.n > 1 ? "  -  " + g.n + " unidades" : "");
    var s = cabecalhoPag(cortar(g.nome, 4.6, 200).toUpperCase(), sub, "Detalhe " + ctx.k + " / " + ctx.tot);
    var arm = INDIVIDUAIS[t] && g.q && g.q.uid && typeof I.detalheArmacao === "function" ? safe(function () { return I.detalheArmacao(g.q.uid, g.q); }) : null;
    var boxH = arm && arm.ok ? 74 : 150, am = ampliada(g, 10, 32, 172, boxH, "cd" + ctx.k);
    s += am.svg;
    if (arm && arm.ok && arm.svg) {
      var by2 = 32 + boxH + 4, bh2 = 210 - 14 - by2, kk = Math.min(168 / arm.w, (bh2 - 8) / arm.h), inner = txt(arm.svg).replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
      s += "<rect x=\"10\" y=\"" + by2 + "\" width=\"172\" height=\"" + bh2 + "\" fill=\"#fff\" stroke=\"#111\" stroke-width=\"0.35\"/><g transform=\"translate(" + n3(12 + (168 - arm.w * kk) / 2) + " " + n3(by2 + 2) + ") scale(" + n3(kk) + ")\">" + inner + "</g>" +
        T(12, by2 + bh2 - 1.6, "DETALHAMENTO DE ARMAÇÃO - " + txt(arm.titulo) + (arm.naoLiberado ? " (PEÇA NÃO LIBERADA)" : "") + (isFinite(arm.pesoKg) ? " - aço " + fmt(arm.pesoKg, 1) + " kg" : ""), 2.2, { cor: arm.naoLiberado ? "#d00000" : CINZA });
    } else if (INDIVIDUAIS[t]) s += T(12, 32 + boxH + 4, "Sem detalhamento de armação: calcule a estrutura (Calcular) para a armação desta peça entrar aqui.", 2.4, { cor: CINZA });
    /* ficha */
    var x = 188, y = 34, wv = 98 - 36;
    s += T(x, y, "FICHA (DADOS DO MODELO)", 2.8, { neg: 1, cor: AZUL }); y += 2;
    s += "<line x1=\"" + x + "\" y1=\"" + y + "\" x2=\"286\" y2=\"" + y + "\" stroke=\"#111\" stroke-width=\"0.25\"/>";
    arr(g.ficha).forEach(function (r) {
      var ls = quebrar(r[1], 2.5, wv, false); if (y > 120) return;
      y += 4; s += T(x, y, cortar(r[0], 2.4, 33), 2.4, { cor: CINZA });
      ls.forEach(function (l, i2) { if (i2) y += 3.4; s += T(x + 36, y, l, 2.5, { cor: "#111" }); });
      y += 0.8;
    });
    if (!arr(g.ficha).length) s += T(x, y + 5, "O modelo não traz dados para este item.", 2.4, { cor: CINZA });
    y = Math.max(y + 8, 78);
    s += T(x, y, "QUANTITATIVO", 2.8, { neg: 1, cor: AZUL }); y += 2;
    s += "<line x1=\"" + x + "\" y1=\"" + y + "\" x2=\"286\" y2=\"" + y + "\" stroke=\"#111\" stroke-width=\"0.25\"/>";
    quantitativoDe(g, ctx.itens, ctx.nIdx).forEach(function (r) {
      if (y > 150) return;
      y += 4; s += T(x, y, cortar(r[0], 2.5, 60), 2.5, { cor: "#111" }) + T(x + 70, y, r[1], 2.5, { cor: CINZA }) + T(286, y, r[2], 2.5, { anc: "end", neg: 1 });
    });
    /* botões */
    var by0 = 156;
    function botao(rot, y0, cor) { return "<rect x=\"" + x + "\" y=\"" + y0 + "\" width=\"98\" height=\"7\" fill=\"#fff\" stroke=\"" + cor + "\" stroke-width=\"0.3\"/>" + T(x + 49, y0 + 4.6, rot, 2.7, { anc: "middle", cor: cor }); }
    var alvoV = { pg: g.pg, x: Math.max(0, g.inst[0] ? g.inst[0].rect.x - 30 : 0), y: Math.max(0, g.inst[0] ? g.inst[0].rect.y - 20 : 0), w: 90, h: 60 };
    if (g.inst[0]) { s += botao("Voltar à folha (ir ao elemento)", by0, LINK); anot.push({ pg: pg, x: x, y: by0, w: 98, h: 7, tipo: "ir", titulo: "Voltar à folha", dest: alvoV }); by0 += 9; }
    var P = I.portal;
    if (P && urlOk(P.url)) {
      var u3d = t === "ambiente" && idSeguro(g.amb && g.amb.id) ? P.url + (P.url.indexOf("?") >= 0 ? "&" : "?") + "amb=" + encodeURIComponent(g.amb.id) : txt(P.urlPv || P.url);
      s += botao(t === "ambiente" ? "Ver este ambiente em 3D (Prancha Viva)" : "Abrir em 3D (Prancha Viva)", by0, LINK); anot.push({ pg: pg, x: x, y: by0, w: 98, h: 7, tipo: "uri", titulo: "Abrir em 3D", uri: u3d }); by0 += 9;
      if (t !== "ambiente") { s += T(x, by0 + 1.5, "O visor abre na Prancha Viva da obra (ainda não há rota por peça).", 2, { cor: CINZA }); by0 += 4; }
    }
    var cat = txt(g.d && g.d.uri);
    if (/^https?:\/\//i.test(cat)) { s += botao("Catálogo / ficha do fabricante", by0, LINK); anot.push({ pg: pg, x: x, y: by0, w: 98, h: 7, tipo: "uri", titulo: "Catálogo do fabricante", uri: cat }); by0 += 9; }
    s += T(10, 198, comIndiceTxt(ctx), 2.2, { cor: CINZA });
    if (ctx.comIndice) { anot.push({ pg: pg, x: 8, y: 202.6, w: 30, h: 5, tipo: "ir", titulo: "Voltar ao índice", dest: { pg: 0 } }); s += T(10, 206.4, "Índice de folhas", 2.4, { cor: LINK }); }
    return { svg: s, anot: anot };
  }
  function comIndiceTxt(ctx) { return "Detalhe gerado do modelo: dados que o modelo não traz não aparecem."; }

  /* ------------------------------------------------ MODELO 3D NO PDF
     ⚠ O 3D girável DENTRO do PDF (U3D / PRC, que o Acrobat abre e gira) NÃO é gerado aqui: os dois são formatos binários comprimidos (U3D = ECMA-363, fluxo de bits com codificação aritmética por
       contexto; PRC = B-rep/tesselação em fluxo de bits próprio) e não existe no repositório nem na máquina um escritor, nem um leitor para PROVAR o arquivo (MuPDF, pdf.js, Chrome e Edge ignoram a
       anotação 3D; só o Acrobat a abre). Um escritor escrito às cegas pode produzir um PDF que o Acrobat recusa. Entrega: a IMAGEM de capa do modelo + o link/QR para a Prancha Viva (modelo girável no
       navegador, em qualquer celular ou computador). I.imagem3d = { uri } (a captura do 3D aberto); I._capa3d = { w, h } em pixels (posto pela gerar depois de codificar a imagem). */
  function pagina3d(I, nIdx) {
    var P = I.portal, c = I._capa3d, bx = 10, by = 32, bw = 172, bh = 112, s = cabecalhoPag("MODELO 3D", "Imagem de capa do modelo", "PDF interativo"), anot = [];
    var k = Math.min(bw / c.w, bh / c.h), w = c.w * k, h = c.h * k, x = bx + (bw - w) / 2, y = by + (bh - h) / 2;
    s += "<rect x=\"" + bx + "\" y=\"" + by + "\" width=\"" + bw + "\" height=\"" + bh + "\" fill=\"#fff\" stroke=\"#111\" stroke-width=\"0.35\"/><image data-im=\"capa3d\" x=\"" + n3(x) + "\" y=\"" + n3(y) + "\" width=\"" + n3(w) + "\" height=\"" + n3(h) + "\"/>";
    anot.push({ x: bx, y: by, w: bw, h: bh, tipo: "uri", uri: txt(P.urlPv || P.url), titulo: "Abrir o modelo em 3D (Prancha Viva)" });
    var mat = typeof I.qr === "function" ? safe(function () { return I.qr(txt(P.urlQr || P.url)); }) : null, xr = 190;
    s += T(xr, 38, "ABRIR O MODELO EM 3D", 3, { neg: 1, cor: AZUL });
    quebrar("O modelo gira e se explora na Prancha Viva, direto no navegador, em qualquer celular ou computador, sem instalar nada. Clique na imagem, no botão ou leia o QR.", 2.6, 94, false).forEach(function (l, i) { s += T(xr, 45 + i * 4, l, 2.6, { cor: "#111" }); });
    if (mat && mat.n > 0) { s += qrRects(mat, xr, 70, 40, 1); anot.push({ x: xr, y: 70, w: 40, h: 40, tipo: "uri", uri: txt(P.urlQr || P.url), titulo: "Portal da obra (QR)" }); }
    s += "<rect x=\"" + xr + "\" y=\"118\" width=\"96\" height=\"8\" fill=\"#fff\" stroke=\"" + LINK + "\" stroke-width=\"0.3\"/>" + T(xr + 48, 123.2, "Abrir em 3D (Prancha Viva)", 3, { anc: "middle", cor: LINK });
    anot.push({ x: xr, y: 118, w: 96, h: 8, tipo: "uri", uri: txt(P.urlPv || P.url), titulo: "Abrir em 3D (Prancha Viva)" });
    s += T(10, 154, "Por que não há 3D girável dentro do PDF: os formatos U3D e PRC (que só o Acrobat abre) não são gerados por este sistema; a Prancha Viva faz o mesmo em qualquer leitor.", 2.3, { cor: CINZA });
    s += T(10, 198, "Imagem do modelo aberto no momento de gerar o PDF.", 2.2, { cor: CINZA });
    anot.push({ x: 8, y: 202.6, w: 30, h: 5, tipo: "ir", titulo: "Voltar ao índice", dest: { pg: 0 } }); s += T(10, 206.4, "Índice de folhas", 2.4, { cor: LINK });
    return { svg: s, anot: anot };
  }

  /* ------------------------------------------------ MODOS prontos: grupos de estados de camada (sem JavaScript: /Configs e botões SetOCGState) */
  function modosDe(ci) {
    if (!ci || !arr(ci.ordem).length) return [];
    var todos = [];
    (function achatar(l) { arr(l).forEach(function (q) { if (Array.isArray(q)) achatar(q); else todos.push(q); }); })(ci.ordem);
    var padraoOff = Object.keys(ci.off || {}).filter(function (id) { return todos.indexOf(id) >= 0; });
    function tem(id) { return todos.indexOf(id) >= 0; }
    function modo(id, nome, liga, desliga) {
      var L = liga.filter(tem), D = desliga.filter(tem).filter(function (x) { return L.indexOf(x) < 0; });
      padraoOff.forEach(function (x) { if (L.indexOf(x) < 0 && D.indexOf(x) < 0) D.push(x); });
      return { id: id, nome: nome, liga: L, desliga: D };
    }
    var etapas = todos.filter(function (x) { return /^etapa-/.test(x); }), todasDisc = ["estrutura", "hidro", "eletrica", "climat", "inst"];
    var out = [];
    /* CLIENTE: sem cotas nem níveis nem eixos, com mobiliário e cor; só a arquitetura (sem disciplinas, etapas, revisão) */
    out.push(modo("cliente", "Modo Cliente", ["mobiliario", "cores", "textos", "parede", "paginacao", "construir", "existente"], ["cotas", "cotas-cor", "cotas-preta", "niveis", "eixos", "demolir", "revant", "nuvem"].concat(todasDisc, etapas)));
    /* OBRA: com cotas (coloridas), níveis, eixos e todas as disciplinas, sem mobiliário nem cor dos ambientes; a nuvem de revisão fica */
    out.push(modo("obra", "Modo Obra", ["cotas", "cotas-cor", "niveis", "eixos", "textos", "parede", "paginacao", "construir", "existente", "demolir", "nuvem"].concat(todasDisc), ["mobiliario", "cores", "cotas-preta", "revant"].concat(etapas)));
    /* PADRÃO: o estado com que o PDF nasceu */
    out.push({ id: "padrao", nome: "Padrão do PDF", liga: todos.filter(function (x) { return padraoOff.indexOf(x) < 0; }), desliga: padraoOff.slice() });
    return out;
  }
  /* os botões de modo: texto sublinhado + anotação SetOCGState. Devolve { svg, anot (sem pg), fimX } */
  function botoesModos(modos, x, y, fs, rotuloIni) {
    var s = "", anot = [], cx = x;
    if (rotuloIni) { s += T(cx, y, rotuloIni, fs, { cor: CINZA }); cx += larg(rotuloIni, fs, false) + 3; }
    modos.forEach(function (m) {
      var w = larg(m.nome, fs, false);
      s += T(cx, y, m.nome, fs, { cor: LINK }) + "<line x1=\"" + n3(cx) + "\" y1=\"" + n3(y + 0.8) + "\" x2=\"" + n3(cx + w) + "\" y2=\"" + n3(y + 0.8) + "\" stroke=\"" + LINK + "\" stroke-width=\"0.15\"/>";
      anot.push({ x: n3(cx - 0.6), y: n3(y - fs - 0.2), w: n3(w + 1.2), h: n3(fs + 1.6), tipo: "modo", titulo: m.nome + " (liga e desliga camadas)", acoes: [{ liga: m.liga, desliga: m.desliga }] });
      cx += w + 5;
    });
    return { svg: s, anot: anot, fimX: cx };
  }

  /* ------------------------------------------------ páginas auxiliares (A4 paisagem) */
  var A4 = { w: 297, h: 210 };
  function svgPagina(corpo, w, h) {
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + w + "mm\" height=\"" + h + "mm\" viewBox=\"0 0 " + w + " " + h + "\"><rect x=\"0\" y=\"0\" width=\"" + w + "\" height=\"" + h + "\" fill=\"#fff\"/>" + corpo + "</svg>";
  }
  function T(x, y, s, fs, o) {
    o = o || {};
    return "<text x=\"" + n3(x) + "\" y=\"" + n3(y) + "\" font-size=\"" + fs + "\"" + (o.neg ? " font-weight=\"bold\"" : "") + (o.anc ? " text-anchor=\"" + o.anc + "\"" : "") + " fill=\"" + (o.cor || "#111") + "\">" + esc(s) + "</text>";
  }
  function cortar(s, corpo, w, neg) { s = txt(s); if (larg(s, corpo, neg) <= w) return s; while (s.length > 1 && larg(s + "...", corpo, neg) > w) s = s.slice(0, -1); return s + "..."; }
  function quebrar(t, corpo, w, neg) {
    var pal = txt(t).split(/\s+/), lin = [], at = "";
    pal.forEach(function (p) { var c = at ? at + " " + p : p; if (at && larg(c, corpo, neg) > w) { lin.push(at); at = p; } else at = c; });
    if (at) lin.push(at); return lin;
  }
  function cabecalhoPag(titulo, sub, nome) {
    return "<rect x=\"8\" y=\"8\" width=\"" + (A4.w - 16) + "\" height=\"" + (A4.h - 16) + "\" fill=\"none\" stroke=\"#111\" stroke-width=\"0.5\"/>" +
      "<rect x=\"8\" y=\"8\" width=\"" + (A4.w - 16) + "\" height=\"14\" fill=\"" + AZUL + "\"/>" + T(13, 17.4, titulo, 5, { neg: 1, cor: "#fff" }) +
      (nome ? T(A4.w - 13, 17, nome, 3, { anc: "end", cor: "#fff" }) : "") + (sub ? T(13, 28, sub, 3.2, { cor: CINZA }) : "");
  }

  /* ------------------------------------------------ índice (uma ou mais páginas A4) e marcadores */
  var LIN_IDX = 6.2, TOPO_IDX = 36, MAX_LIN = 23;
  function montarIndice(itens, I, offset, painel) {
    var grupos = {}, ordem = [];
    itens.forEach(function (it, i) { var d = discDe(it); if (!grupos[d]) { grupos[d] = []; ordem.push(d); } grupos[d].push(i); });
    ordem.sort(function (a, b) { return ORDEM_DISC.indexOf(a) - ORDEM_DISC.indexOf(b); });
    var linhas = [];
    ordem.forEach(function (d) { linhas.push({ cab: NOME_DISC[d] || d }); grupos[d].forEach(function (i) { linhas.push({ i: i }); }); });
    var paginas = [], pg = [];
    linhas.forEach(function (l) { if (pg.length >= MAX_LIN) { paginas.push(pg); pg = []; } pg.push(l); });
    if (pg.length) paginas.push(pg);
    var c0 = (itens[0] && itens[0].pr && itens[0].pr.carimbo) || {}, nomeObra = txt(c0.obra || c0.projeto || (itens[0] && itens[0].pr && itens[0].pr.nome)), empresa = txt(c0.empresa || (itens[0] && itens[0].rec && itens[0].rec.empresa && itens[0].rec.empresa.nome));
    var svgs = [], anot = [];
    paginas.forEach(function (lin, ip) {
      var s = cabecalhoPag("ÍNDICE DE FOLHAS", nomeObra + (nomeObra && empresa ? "  -  " : "") + empresa, "PDF interativo"), y = TOPO_IDX;
      s += T(14, y - 2, "Nº", 2.8, { neg: 1, cor: CINZA }) + T(48, y - 2, "CONTEÚDO", 2.8, { neg: 1, cor: CINZA }) + T(190, y - 2, "ESCALA", 2.8, { neg: 1, cor: CINZA }) + T(214, y - 2, "FOLHA", 2.8, { neg: 1, cor: CINZA });
      s += "<line x1=\"12\" y1=\"" + (y - 0.6) + "\" x2=\"" + (A4.w - 12) + "\" y2=\"" + (y - 0.6) + "\" stroke=\"#111\" stroke-width=\"0.25\"/>";
      lin.forEach(function (l) {
        y += LIN_IDX;
        if (l.cab !== undefined) { s += "<rect x=\"12\" y=\"" + n3(y - 4.4) + "\" width=\"" + (A4.w - 24) + "\" height=\"5.6\" fill=\"#eef2f5\"/>" + T(14, y - 0.4, l.cab.toUpperCase(), 3, { neg: 1, cor: AZUL }); return; }
        var it = itens[l.i], num0 = numeroDe(it), alvo = offset + l.i;
        s += T(14, y, num0, 3.2, { neg: 1, cor: LINK }) + T(48, y, cortar(txt(it.folha.conteudo || it.pr.nome), 3.2, 136), 3.2, { cor: "#111" }) +
          T(190, y, txt(it.folha.escala === "indicada" ? "indicada" : it.folha.escala), 3, { cor: "#111" }) + T(214, y, "pág. " + (alvo + 1), 3, { cor: CINZA }) +
          "<line x1=\"14\" y1=\"" + n3(y + 0.9) + "\" x2=\"" + n3(14 + larg(num0, 3.2, true)) + "\" y2=\"" + n3(y + 0.9) + "\" stroke=\"" + LINK + "\" stroke-width=\"0.2\"/>";
        anot.push({ pg: ip, x: 12, y: n3(y - 4.2), w: A4.w - 24, h: 5.6, tipo: "ir", titulo: "Ir para a folha " + num0 + " - " + txt(it.folha.conteudo), dest: { pg: alvo } });
      });
      s += T(13, A4.h - 12, "Clique no número da folha para ir até ela. Marcadores (painel lateral): disciplina > folha.", 2.6, { cor: CINZA }) + T(A4.w - 13, A4.h - 12, (ip + 1) + " / " + paginas.length, 2.6, { anc: "end", cor: CINZA });
      if (ip === 0 && painel) { s += painel.svg; painel.anot.forEach(function (a) { a.pg = 0; anot.push(a); }); }
      svgs.push(s);
    });
    return { corpos: svgs, anot: anot, linhasPorPagina: paginas.length };
  }
  function montarOutline(itens, offset, extras) {
    var grupos = {}, ordem = [], out = [];
    itens.forEach(function (it, i) { var d = discDe(it); if (!grupos[d]) { grupos[d] = []; ordem.push(d); } grupos[d].push(i); });
    ordem.sort(function (a, b) { return ORDEM_DISC.indexOf(a) - ORDEM_DISC.indexOf(b); });
    ordem.forEach(function (d) {
      out.push({ t: NOME_DISC[d] || d, pg: offset + grupos[d][0], f: grupos[d].map(function (i) { return { t: numeroDe(itens[i]) + " - " + txt(itens[i].folha.conteudo || itens[i].pr.nome), pg: offset + i }; }) });
    });
    return arr(extras).length ? out.concat(extras) : out;
  }

  /* ------------------------------------------------ o plano */
  /* ent = { itens: [{ pr, folha, rec, geo }], res: [resultado de FolhaPdf.svgDaFolha por item (vps, …)], I: opções do interativo, P: PranchaUI, camadas: info das camadas, avisos: [] }
     → { antes: [corpo svg das páginas anteriores às folhas], depois: [...], anot: [...] (pg absoluto), outline: [...], anexos: [...], modos: [...], avisos: [] }  */
  function planejar(ent) {
    var itens = ent.itens, I = ent.I || {}, avisos = arr(ent.avisos).slice(), anot = [], depois = [];
    var comIndice = I.indice !== false && itens.length >= 1;
    var anexos = normAnexos(I.anexos, avisos), matP = I.portal && urlOk(I.portal.url) && typeof I.qr === "function" ? safe(function () { return I.qr(txt(I.portal.urlQr || I.portal.url)); }) : null;
    var modos = I.modos === false ? [] : modosDe(ent.camadas);
    var capa3d = !!(I.imagem3d && I._capa3d && I._capa3d.w > 0 && I.portal && urlOk(I.portal.url));
    if (I.imagem3d && !capa3d && !(I.portal && urlOk(I.portal.url))) avisos.push("Modelo 3D: sem placa da obra publicada, a página do modelo 3D foi omitida (a imagem sozinha não leva a lugar nenhum).");
    var nPagIdx = comIndice ? montarIndice(itens, I, 0, null).corpos.length : 0, pg3d = capa3d ? nPagIdx : -1;
    var painel = comIndice ? painelCapa(I, anexos, matP, modos, pg3d) : null;
    var nIdx = nPagIdx + (capa3d ? 1 : 0), idx = comIndice ? montarIndice(itens, I, nIdx, painel) : null;   /* os números de página dependem de quantas páginas vêm antes das folhas */
    var antes = idx ? idx.corpos.map(function (c) { return svgPagina(c, A4.w, A4.h); }) : [];
    if (idx) idx.anot.forEach(function (a) { anot.push(a); });
    if (capa3d) { var p3 = pagina3d(I, nIdx); antes.push(svgPagina(p3.svg, A4.w, A4.h)); p3.anot.forEach(function (a) { a.pg = pg3d; anot.push(a); }); }
    var avisoPortal = !(I.portal && urlOk(I.portal.url)) ? "Sem placa da obra publicada: QR e link da Prancha Viva omitidos (publique a placa da obra e gere o PDF de novo)." : (!matP ? "QR indisponível neste aparelho: omitido." : "");
    if (avisoPortal) avisos.push(avisoPortal);
    /* vista → folha (a primeira que a tem): destino das bolhas */
    var vistaEm = {};
    itens.forEach(function (it, i) { arr(it.folha && it.folha.blocos).forEach(function (b) { if (b && b.tipo === "viewport" && !vistaEm[b.vistaId]) vistaEm[b.vistaId] = { pg: nIdx + i, b: b }; }); });
    itens.forEach(function (it, i) {
      var r = ent.res[i]; if (!r) return;
      arr(r.vps).forEach(function (v) {
        bolhasDe(v.svg).forEach(function (bo) {
          var alvo = vistaEm[bo.vistaId]; if (!alvo) return;
          var rect = noQuadro(paraFolha(v, bo.x0, bo.y0, bo.x1, bo.y1), v.b); if (!rect) return;
          var nome = txt((alvo.b.tituloVista || bo.vistaId));
          anot.push({ pg: nIdx + i, x: rect.x, y: rect.y, w: rect.w, h: rect.h, tipo: "ir", titulo: "Ir para a vista: " + nome, dest: { pg: alvo.pg, x: alvo.b.x, y: alvo.b.y, w: alvo.b.w, h: alvo.b.h + 12 } });
        });
        fichasDaVista(nIdx + i, v, I, anot);
      });
      if (r.rodape) { arr(r.rodape.anot).forEach(function (a) { a.pg = nIdx + i; anot.push(a); }); if (r.rodape.aviso && r.rodape.aviso.indexOf("Sem placa") !== 0 && r.rodape.aviso.indexOf("QR indispon") !== 0 && avisos.indexOf(r.rodape.aviso) < 0) avisos.push(r.rodape.aviso); }
      if (comIndice) {   /* "voltar ao índice" na margem de cima da folha */
        anot.push({ pg: nIdx + i, x: 20, y: 3.2, w: 26, h: 5, tipo: "ir", titulo: "Voltar ao índice de folhas", dest: { pg: 0 } });
      }
    });
    /* notas das nuvens de revisão (o que a nuvem marca) e botões de modo na margem de cada folha */
    var acrescimos = [], snapshots = [];
    itens.forEach(function (it, i) {
      var r = ent.res[i] || {}, ac = "";
      arr(r.vps).forEach(function (v) {
        arr(v.nuvens).forEach(function (nv) {
          var rect = noQuadro(paraFolha(v, nv.x0, nv.y0, nv.x1, nv.y1), v.b); if (!rect) return;
          anot.push({ pg: nIdx + i, x: rect.x, y: rect.y, w: rect.w, h: rect.h, tipo: "nota", titulo: "Revisão " + txt((revAtual(I.revisao, it.folha) || {}).numero), texto: "Elemento novo, alterado ou removido em relação à revisão anterior." + ((revAtual(I.revisao, it.folha) || {}).descricao ? "\n" + txt(revAtual(I.revisao, it.folha).descricao) : "") });
        });
        if (I.revisao && typeof I.revisao.anterior === "function" && I.revisao.salvar !== false && v.vp && v.vp.dados) snapshots.push({ chave: txt(it.pr.id) + "|" + txt(it.folha.id) + "|" + txt(v.b.vistaId) + "#" + txt(v.ix), folhaId: txt(it.folha.id), snap: (function () { var sn = snapshotDe(v.vp, v.svg); var ra = revAtual(I.revisao, it.folha) || {}; sn.rotulo = txt(ra.numero); sn.revId = txt(ra.id); sn.emitida = !!ra.emitida; return sn; })() });
      });
      if (modos.length) {
        var bm = botoesModos(modos, 50, 7.4, 2.6, "Camadas:");
        ac = bm.svg; bm.anot.forEach(function (a2) { a2.pg = nIdx + i; anot.push(a2); });
      }
      acrescimos.push(ac);
    });
    /* ELEMENTO → DETALHE: um conjunto por página, no fim do PDF; cada ocorrência no desenho vira link para ela */
    var grupos = I.detalhes === false ? [] : coletarGrupos(itens, ent.res, I, nIdx), extrasOutline = [];
    grupos.sort(function (a, b) { return a.cls.ord - b.cls.ord; });
    var sel = grupos.slice(0, MAX_DETALHES), base = nIdx + itens.length;
    if (grupos.length > MAX_DETALHES) avisos.push("Anexo de detalhes: " + grupos.length + " conjuntos de peças; só os " + MAX_DETALHES + " primeiros (por tipo) ganharam página de detalhe.");
    sel.forEach(function (g, k) {
      g.pgDet = base + k;
      var pd = paginaDetalhe(g, { itens: itens, nIdx: nIdx, I: I, pgDet: base + k, tot: sel.length, k: k + 1, comIndice: comIndice });
      depois.push(svgPagina(pd.svg, A4.w, A4.h)); pd.anot.forEach(function (a) { anot.push(a); });
      g.inst.forEach(function (ins) { anot.push({ pg: ins.pg, x: ins.rect.x, y: ins.rect.y, w: ins.rect.w, h: ins.rect.h, tipo: "ir", titulo: "Detalhe: " + g.nome, dest: { pg: base + k }, z: ins.z }); });
    });
    if (sel.length) {
      var porTipo = {}, ordT = [];
      sel.forEach(function (g) { var tn = g.tipo === "ambiente" ? "Ambientes" : (NOME_TIPO[g.tipo] || g.tipo) + (g.tipo === "parede" ? "s" : g.tipo === "porta" || g.tipo === "janela" || g.tipo === "viga" || g.tipo === "laje" ? "s" : g.tipo === "pilar" ? "es" : ""); if (!porTipo[tn]) { porTipo[tn] = []; ordT.push(tn); } porTipo[tn].push({ t: g.nome, pg: g.pgDet }); });
      extrasOutline.push({ t: "Anexo de detalhes", pg: base, f: ordT.map(function (tn) { return { t: tn + " (" + porTipo[tn].length + ")", pg: porTipo[tn][0].pg, f: porTipo[tn] }; }) });
    }
    /* camadas de apresentação dos links: o link do ambiente (embaixo) < a nota do identificador < o link da peça (em cima) < o resto */
    anot = anot.map(function (a, i) { return { a: a, i: i }; }).sort(function (p, q) { var zp = p.a.z == null ? 3 : p.a.z, zq = q.a.z == null ? 3 : q.a.z; return zp - zq || p.i - q.i; }).map(function (e) { return e.a; });
    var outline = [];
    if (comIndice) outline.push({ t: "Índice de folhas", pg: 0 });
    if (capa3d) outline.push({ t: "Modelo 3D (Prancha Viva)", pg: pg3d });
    outline = outline.concat(montarOutline(itens, nIdx, extrasOutline));
    return { antes: antes, depois: depois, anot: anot, outline: outline, anexos: anexos, modos: modos, avisos: avisos, nAntes: nIdx, acrescimos: acrescimos, snapshots: snapshots };
  }

  var PdfInterativo = { planejar: planejar, criarRevisao: criarRevisao, guardaveis: guardaveis, sobreposicao: sobreposicao, modosDe: modosDe, snapshotDe: snapshotDe, mudancas: mudancas, nuvemD: nuvemD, rodapeFolha: rodapeFolha, qrRects: qrRects, normAnexos: normAnexos, adaptadorApp: adaptadorApp, pecasDeVp: pecasDeVp, fichaAmbiente: fichaAmbiente, fichaPeca: fichaPeca, classeDe: classeDe, bolhasDe: bolhasDe, discDe: discDe, numeroDe: numeroDe, svgPagina: svgPagina, A4: A4, ORDEM_DISC: ORDEM_DISC, NOME_DISC: NOME_DISC,
    _i: { fimDoG: fimDoG, paraFolha: paraFolha, noQuadro: noQuadro, T: T, cortar: cortar, quebrar: quebrar, cabecalhoPag: cabecalhoPag, fmt: fmt, esc: esc, n3: n3, larg: larg } };
  global.PdfInterativo = PdfInterativo;
  if (typeof module !== "undefined" && module.exports) module.exports = PdfInterativo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
