/* =====================================================================
 * cadsepara.js — SEPARAR O DESENHO CAD POR PAVIMENTO (motor puro). 26/11/2026.
 *
 * O defeito que este arquivo resolve: o DWG de arquitetura costuma trazer TODAS
 * as plantas lado a lado no mesmo desenho (térreo, pavimento superior, cobertura,
 * cortes, situação). O vínculo CAD gravava o desenho inteiro num nível só — as
 * plantas nunca ficavam uma SOBRE a outra, e quem lançava a caixa d'água sobre a
 * planta de cobertura estava, no modelo, a 45 m da planta do pavimento de baixo.
 *
 * O que o motor faz (sem tela, sem DOM, sem localStorage):
 *   decodificar(buf)        bytes do DXF → texto (UTF-8 quando é; senão latin1)
 *   ilhas(dxf)              grupos de linhas separados por espaço vazio
 *   titulos(dxf)            textos que são título de desenho, já classificados
 *   regioes(dxf, niveis)    ilhas + título + nível sugerido + "importar?"
 *   recortar(dxf, ret)      o pedaço do desenho dentro do retângulo
 *   alinhar(ref, outro)     o deslocamento que põe `outro` sobre `ref`
 *
 * Coordenadas: as do js/dxf.js — METROS, Y para cima.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ Os números abaixo são de DESENHO (distância no papel/tela entre desenhos de
     uma prancha), não de norma. Mudou um? Rode tools/test-cadsepara.js: ele tem
     o arranjo "plantas lado a lado" e o controle negativo de cada um. */
  var CEL = 0.5;          /* m — malha da ocupação */
  var VAO = 1.5;          /* m — espaço vazio que separa dois desenhos (cota e texto ficam a menos que isso da parede) */
  var LONGA = 60;         /* m — linha maior que isso é moldura de prancha/divisa: não une desenhos */
  /* uma ilha com menos linhas que isso é legenda/símbolo solto. ⚠ Era 25: uma planta esquemática (contorno duplo,
     escada e três paredes = 23 linhas) era descartada, o título dela ficava sem ilha e a separação inteira escolhia a
     tentativa errada — pego na e2e (tools/e2e-cad-separar.js), que o teste de unidade com mobília não via. */
  var MIN_LINHAS = 12;
  var MIN_LADO = 2.5;     /* m — menor lado de um desenho que vale importar */
  var PASSO_VOTO = 0.05;  /* m — precisão do alinhamento automático */

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function r3(v) { return Math.round(v * 1000) / 1000; }

  /* sem acento, maiúsculo, um espaço só — o título vem de CAD: "TÉRREO", "Terreo", "TERREO" */
  function norm(s) {
    s = String(s == null ? "" : s).toUpperCase();
    var de = "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑº°ª", para = "AAAAAEEEEIIIIOOOOOUUUUCNOOA", o = "", i, k;
    for (i = 0; i < s.length; i++) { k = de.indexOf(s.charAt(i)); o += k >= 0 ? para.charAt(k) : s.charAt(i); }
    return o.replace(/[^A-Z0-9]+/g, " ").replace(/^ +| +$/g, "");
  }

  /* ---------------------------------------------------------------- texto
   * O conversor (AutoCAD/ODA) entrega DXF 2018, que é UTF-8. A tela lia como
   * latin1 e "TÉRREO" virava "TÃ‰RREO" — o título não casava com nível nenhum e
   * o texto do fundo saía com lixo. DXF antigo (até 2004) é ANSI: nele o UTF-8
   * estrito falha no primeiro acento, e aí vale o latin1 de sempre. */
  function decodificar(buf) {
    var TD = global.TextDecoder || (typeof TextDecoder !== "undefined" ? TextDecoder : null);
    if (!TD) return "";
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    try { return new TD("utf-8", { fatal: true }).decode(u8); } catch (e) {}
    return new TD("latin1").decode(u8);
  }

  /* ---------------------------------------------------------------- ilhas */
  function caixaDe(segs) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i, s;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      if (s.x1 < x0) x0 = s.x1; if (s.x2 < x0) x0 = s.x2; if (s.y1 < y0) y0 = s.y1; if (s.y2 < y0) y0 = s.y2;
      if (s.x1 > x1) x1 = s.x1; if (s.x2 > x1) x1 = s.x2; if (s.y1 > y1) y1 = s.y1; if (s.y2 > y1) y1 = s.y2;
    }
    return segs.length ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
  }

  /* grupos de linhas separados por pelo menos `vao` de espaço vazio.
     → [{ x0, y0, x1, y1, n }] do maior para o menor (n = linhas dentro) */
  function ilhas(dxf, o) {
    o = o || {};
    var segs = (dxf && dxf.segmentos) || [], cel = num(o.celula, CEL), vao = num(o.vao, VAO), longa = num(o.longa, LONGA);
    var uteis = [], i, s, L;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      if (!isFinite(s.x1) || !isFinite(s.y1) || !isFinite(s.x2) || !isFinite(s.y2)) continue;
      L = Math.sqrt((s.x2 - s.x1) * (s.x2 - s.x1) + (s.y2 - s.y1) * (s.y2 - s.y1));
      if (L > longa) continue;   /* moldura da prancha: passaria por cima de todos os desenhos e uniria tudo numa ilha só */
      uteis.push(s);
    }
    var cx = caixaDe(uteis); if (!cx) return [];
    /* desenho gigante (loteamento): a malha cresce com o desenho, não a memória */
    var nx = Math.ceil((cx.x1 - cx.x0) / cel) + 1, ny = Math.ceil((cx.y1 - cx.y0) / cel) + 1;
    while (nx * ny > 4e6) { cel *= 2; nx = Math.ceil((cx.x1 - cx.x0) / cel) + 1; ny = Math.ceil((cx.y1 - cx.y0) / cel) + 1; }
    var oc = {}, chaves = [];
    function marca(x, y) {
      var k = Math.floor((x - cx.x0) / cel) + nx * Math.floor((y - cx.y0) / cel);
      if (oc[k] === undefined) { oc[k] = -1; chaves.push(k); }
    }
    for (i = 0; i < uteis.length; i++) {
      s = uteis[i];
      L = Math.sqrt((s.x2 - s.x1) * (s.x2 - s.x1) + (s.y2 - s.y1) * (s.y2 - s.y1));
      var np = Math.max(1, Math.ceil(L / (cel * 0.5))), j, t;
      for (j = 0; j <= np; j++) { t = j / np; marca(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t); }
    }
    /* componentes conexos: vizinho = célula a até `alc` células (o vão permitido) */
    var alc = Math.max(1, Math.round(vao / cel)), comp = 0, caixas = [];
    for (i = 0; i < chaves.length; i++) {
      if (oc[chaves[i]] !== -1) continue;
      var pilha = [chaves[i]], c = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      oc[chaves[i]] = comp;
      while (pilha.length) {
        var k = pilha.pop(), kx = k % nx, ky = (k - kx) / nx, ax, ay, v;
        if (kx < c.x0) c.x0 = kx; if (kx > c.x1) c.x1 = kx; if (ky < c.y0) c.y0 = ky; if (ky > c.y1) c.y1 = ky;
        for (ay = -alc; ay <= alc; ay++) for (ax = -alc; ax <= alc; ax++) {
          if (kx + ax < 0 || kx + ax >= nx || ky + ay < 0) continue;
          v = (kx + ax) + nx * (ky + ay);
          if (oc[v] === -1) { oc[v] = comp; pilha.push(v); }
        }
      }
      caixas.push(c); comp++;
    }
    /* a caixa de cada ilha vem das LINHAS dela (a da malha arredondaria meio metro para cada lado) */
    var res = caixas.map(function () { return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 }; });
    for (i = 0; i < uteis.length; i++) {
      s = uteis[i];
      var kk = Math.floor(((s.x1 + s.x2) / 2 - cx.x0) / cel) + nx * Math.floor(((s.y1 + s.y2) / 2 - cx.y0) / cel), id = oc[kk], q;
      if (id === undefined) continue;
      q = res[id]; q.n++;
      if (s.x1 < q.x0) q.x0 = s.x1; if (s.x2 < q.x0) q.x0 = s.x2; if (s.y1 < q.y0) q.y0 = s.y1; if (s.y2 < q.y0) q.y0 = s.y2;
      if (s.x1 > q.x1) q.x1 = s.x1; if (s.x2 > q.x1) q.x1 = s.x2; if (s.y1 > q.y1) q.y1 = s.y1; if (s.y2 > q.y1) q.y1 = s.y2;
    }
    return res.filter(function (q) { return q.n > 0; }).sort(function (a, b) { return b.n - a.n; });
  }

  /* --------------------------------------------------------------- títulos
   * tipo: planta · cobertura · reservatorio · layout · corte · fachada · situacao · locacao · detalhe
   * pav:  subsolo · terreo · superior · cobertura · reservatorio · tipo · "n2" (2º pavimento)… ou "" */
  function classificar(txt) {
    var t = norm(txt), tipo = "", pav = "";
    if (!t || t.length > 70) return null;
    if (/^(CORTE|SECAO|SECCAO)\b/.test(t)) tipo = "corte";
    else if (/\b(FACHADA|ELEVACAO|VISTA (FRONTAL|LATERAL|POSTERIOR))\b/.test(t)) tipo = "fachada";
    else if (/\bSITUACAO\b/.test(t)) tipo = "situacao";
    else if (/\b(LOCACAO|IMPLANTACAO)\b/.test(t)) tipo = "locacao";
    else if (/\b(DETALHE|DET|AMPLIACAO)\b/.test(t) && !/PLANTA/.test(t)) tipo = "detalhe";
    else if (/\b(RESERVATORIO|BARRILETE|CAIXA D ?AGUA)\b/.test(t) && /\b(PLANTA|COBERTURA|PAV|NIVEL)\b/.test(t)) tipo = "reservatorio";
    else if (/\bCOBERTURA\b/.test(t) && /\bPLANTA\b/.test(t)) tipo = "cobertura";
    else if (/\bLAY ?OUT\b/.test(t)) tipo = "layout";
    else if (/\bPLANTA\b/.test(t) || /^(PAV|PAVTO|PAVIMENTO|TERREO|SUBSOLO|ANDAR|MEZANINO|COBERTURA)\b/.test(t)) tipo = "planta";
    if (!tipo) return null;
    /* frase de legenda/carimbo lista vários desenhos ("PLANTA BAIXA, LAYOUT, COBERTURA"): não é título de um desenho */
    if (/\b(PLANTA BAIXA|PLANTAS) .*\b(LAYOUT|COBERTURA|CORTES?)\b/.test(t) && !/TERREO|SUPERIOR|PAV/.test(t)) return null;
    if (/\b(COBERTURA|CORTES|FACHADAS) E \b/.test(t)) return null;
    if (/^PROJ\b|\bPROJECAO\b/.test(t)) return null;   /* "PROJ. PAV. SUPERIOR" é anotação dentro da planta */

    if (tipo === "reservatorio") pav = "reservatorio";
    else if (tipo === "cobertura") pav = "cobertura";
    else if (tipo === "planta" || tipo === "layout") {
      var m;
      if (/\bSUBSOLO\b/.test(t)) pav = "subsolo";
      else if (/\b(TERREO|TERREA)\b/.test(t)) pav = "terreo";
      else if (/\bMEZANINO\b/.test(t)) pav = "mezanino";
      else if (/\b(PAV(TO|IMENTO)?|ANDAR|PISO) TIPO\b|\bTIPO\b/.test(t)) pav = "tipo";
      else if ((m = /\b(\d{1,2}) ?O? ?(PAV|PAVTO|PAVIMENTO|ANDAR|PISO)\b/.exec(t)) || (m = /\b(PAV|PAVTO|PAVIMENTO|ANDAR|PISO) (\d{1,2})\b/.exec(t))) pav = "n" + parseInt(/\d+/.exec(m[0])[0], 10);
      else if (/\b(PRIMEIRO)\b/.test(t)) pav = "n1";
      else if (/\b(SEGUNDO)\b/.test(t)) pav = "n2";
      else if (/\b(TERCEIRO)\b/.test(t)) pav = "n3";
      else if (/\b(SUPERIOR|SUP)\b/.test(t)) pav = "superior";
      else if (/\b(INFERIOR|INF)\b/.test(t)) pav = "inferior";
      else if (/\bCOBERTURA\b/.test(t)) pav = "cobertura";
    }
    return { tipo: tipo, pav: pav };
  }

  function titulos(dxf) {
    var out = [];
    ((dxf && dxf.textos) || []).forEach(function (t) {
      if (!t || !t.txt || !isFinite(t.x) || !isFinite(t.y) || t.bloco) return;
      var c = classificar(t.txt); if (!c) return;
      out.push({ txt: String(t.txt).replace(/\s+/g, " ").replace(/^ | $/g, "").slice(0, 70), x: t.x, y: t.y, tipo: c.tipo, pav: c.pav });
    });
    return out;
  }

  /* o nível da obra que corresponde ao pavimento do título (ou null: não invento) */
  function nivelDoPav(pav, niveis) {
    if (!pav || !niveis || !niveis.length) return null;
    var L = niveis.map(function (n) { return { n: n, t: norm(n.nome), y: num(n.y != null ? n.y : n.elevacao, 0) }; });
    function acha(rx) { var r = L.filter(function (x) { return rx.test(x.t); })[0]; return r ? r.n : null; }
    /* pavimentos "de morar", de baixo para cima: sem terreno, fundação, subsolo nem cobertura */
    /* ⚠ nível de ESTRUTURA não é pavimento: o modelo importado sem níveis gravados entrega "BALDRAME", "RESPALDO",
       "NÍVEL TERRENO" — e a posição na lista mandava o térreo para o Baldrame e o superior para o Respaldo (pego na e2e) */
    var pisos = L.filter(function (x) { return !/TERRENO|FUNDA|SONDAG|SUBSOLO|COBERT|RESERVAT|BARRILETE|CAIXA|TELHAD|PLATIBANDA|BALDRAME|RESPALDO|VIGA|LAJE|FORRO|CUMEEIRA|BEIRAL|CINTA|OSSO|TOPO/.test(x.t); }).sort(function (a, b) { return a.y - b.y; });
    var m, r;
    if (pav === "terreo") return acha(/\bTERREO\b/) || (pisos[0] ? pisos[0].n : null);
    if (pav === "subsolo") return acha(/\bSUBSOLO\b/);
    if (pav === "mezanino") return acha(/\bMEZANINO\b/);
    if (pav === "reservatorio") return acha(/RESERVAT|BARRILETE|CAIXA D/) || acha(/\bCOBERT/);
    if (pav === "cobertura") return acha(/\bCOBERT|TELHAD/);
    if (pav === "tipo") return acha(/\bTIPO\b/);
    if (pav === "inferior") return acha(/\bINFERIOR\b/) || (pisos[0] ? pisos[0].n : null);
    if (pav === "superior") {
      r = acha(/\bSUPERIOR\b|\bSUP\b/); if (r) return r;
      /* sobrado: "superior" é o piso logo acima do térreo — só quando a obra TEM esse piso */
      return pisos.length >= 2 ? pisos[1].n : null;
    }
    if ((m = /^n(\d+)$/.exec(pav))) {
      var k = parseInt(m[1], 10);
      r = L.filter(function (x) { var q = /\b(\d{1,2}) ?O? ?(PAV|PAVTO|PAVIMENTO|ANDAR|PISO)\b/.exec(x.t) || /\b(PAV|PAVTO|PAVIMENTO|ANDAR|PISO) (\d{1,2})\b/.exec(x.t); return q && parseInt(/\d+/.exec(q[0])[0], 10) === k; })[0];
      if (r) return r.n;
      /* "1º pavimento" sem nível com esse nome: o k-ésimo piso acima do térreo */
      return pisos.length > k ? pisos[k].n : null;
    }
    return null;
  }

  /* ---------------------------------------------------------------- regiões
   * Cada desenho do arquivo: a ilha, o título dela, o nível sugerido e se entra.
   * O título fica DENTRO da ilha ou logo abaixo/acima dela (até 4 m). */
  var ROTULO_TIPO = { planta: "Planta baixa", cobertura: "Planta de cobertura", reservatorio: "Planta do reservatório", layout: "Planta de layout", corte: "Corte", fachada: "Fachada", situacao: "Situação", locacao: "Locação", detalhe: "Detalhe", "": "Desenho" };
  function regioes(dxf, niveis, o) {
    o = o || {};
    var Ts = titulos(dxf), usados = {};
    var ehPlanta = { planta: 1, cobertura: 1, reservatorio: 1, layout: 1 };
    function ilhasDe(cfgI) {
      return ilhas(dxf, cfgI).filter(function (q) { return q.n >= num(o.minLinhas, MIN_LINHAS) && Math.min(q.x1 - q.x0, q.y1 - q.y0) >= num(o.minLado, MIN_LADO); });
    }
    function ilhaDoTitulo(t, L) {
      var melhor = -1, dm = 4;
      L.forEach(function (r, i) {
        var dx = t.x < r.x0 ? r.x0 - t.x : t.x > r.x1 ? t.x - r.x1 : 0, dy = t.y < r.y0 ? r.y0 - t.y : t.y > r.y1 ? t.y - r.y1 : 0, d = Math.sqrt(dx * dx + dy * dy);
        if (d < dm) { dm = d; melhor = i; }
      });
      return melhor;
    }
    /* ⚠ PRANCHA NO MODEL SPACE (o arquivo que originou este motor): os desenhos vêm DENTRO da moldura da folha, com
       carimbo e legenda — a moldura e a legenda encostam em tudo e a folha inteira vira uma ilha só. Por isso a
       separação é tentada do mais folgado ao mais apertado, e fica a tentativa em que mais títulos de planta ficaram
       SOZINHOS na própria ilha. Empate: a mais folgada (corta menos cota para fora do desenho). */
    var tentativas = o.vao != null || o.longa != null ? [{ vao: num(o.vao, VAO), longa: num(o.longa, LONGA), celula: o.celula }]
      : [{ vao: VAO, longa: LONGA }, { vao: VAO, longa: 20 }, { vao: 1.0, longa: 20, celula: 0.25 }, { vao: 0.75, longa: 20, celula: 0.25 }];
    var Is = null, nota = -1, cand = [];
    tentativas.forEach(function (cfgI) {
      var L = ilhasDe(cfgI), cont = {}, n = 0, linhas = 0, area = 0;
      Ts.forEach(function (t) { if (!ehPlanta[t.tipo]) return; var i = ilhaDoTitulo(t, L); if (i >= 0) cont[i] = (cont[i] || 0) + 1; });
      Object.keys(cont).forEach(function (k) { if (cont[k] !== 1) return; n++; linhas += L[k].n; area += (L[k].x1 - L[k].x0) * (L[k].y1 - L[k].y0); });
      cand.push({ L: L, n: n, linhas: linhas, area: area });
      if (n > nota) nota = n;
    });
    /* ⚠ DESEMPATE (medido no arquivo que originou o motor): com o vão de 1,0 m a planta do pav. superior saía com
       38 × 24 m, porque a legenda da prancha encosta na cota de baixo; com 0,75 m, 29 × 18 m e só 13 linhas a menos
       (2.403 de 2.416). Entre as tentativas que separam o MESMO número de plantas, fica a de menor área — desde que
       não perca mais de 3% das linhas (aí o aperto estaria cortando cota e parede, não legenda). */
    var bons = cand.filter(function (c) { return c.n === nota; }), maxLin = 0;
    bons.forEach(function (c) { if (c.linhas > maxLin) maxLin = c.linhas; });
    bons.forEach(function (c) { if (c.linhas >= maxLin * 0.97 && (!Is || c.area < Is.area - 1e-6)) Is = c; });
    Is = Is ? Is.L : [];
    var MG = 0.3;   /* m — folga do recorte em volta do desenho (a ponta da cota não fica de fora) */
    var regs = Is.map(function (q, i) {
      return { id: "r" + (i + 1), x0: r3(q.x0 - MG), y0: r3(q.y0 - MG), x1: r3(q.x1 + MG), y1: r3(q.y1 + MG), n: q.n, titulo: "", tipo: "", pav: "", nivelId: null, importar: false };
    });
    /* cada título vai para a ilha mais próxima (0 = dentro) */
    Ts.forEach(function (t, ti) {
      var im = ilhaDoTitulo(t, regs), melhor = im >= 0 ? regs[im] : null;
      if (!melhor) return;
      /* dois títulos na mesma ilha: fica o de planta (o "CORTE AA" dentro da planta é marca de corte, não título) */
      var peso = { planta: 5, cobertura: 5, reservatorio: 5, layout: 4, corte: 2, fachada: 2, situacao: 3, locacao: 3, detalhe: 1 };
      if (!melhor.titulo || (peso[t.tipo] || 0) > (peso[melhor.tipo] || 0)) { melhor.titulo = t.txt; melhor.tipo = t.tipo; melhor.pav = t.pav; usados[ti] = 1; }
    });
    var ocupado = {};
    regs.forEach(function (r) {
      var nv = (r.tipo === "planta" || r.tipo === "cobertura" || r.tipo === "reservatorio" || r.tipo === "layout") ? nivelDoPav(r.pav, niveis) : null;
      r.nivelId = nv ? nv.id : null;
      r.rotulo = r.titulo || ROTULO_TIPO[r.tipo || ""];
    });
    /* um desenho por nível entra marcado: a planta baixa ganha da de layout, a de cobertura da do reservatório */
    ["planta", "cobertura", "reservatorio", "layout"].forEach(function (tp) {
      regs.forEach(function (r) {
        if (r.tipo !== tp || r.nivelId == null || ocupado[r.nivelId]) return;
        ocupado[r.nivelId] = 1; r.importar = true;
      });
    });
    return regs;
  }

  /* --------------------------------------------------------------- recorte
   * O pedaço do desenho dentro do retângulo, no MESMO formato que o js/dxf.js
   * entrega (segmentos, textos, extents) — para o vínculo CAD de sempre gravar.
   * A linha que atravessa a borda é cortada na borda (Liang–Barsky). */
  function recortar(dxf, ret) {
    var x0 = Math.min(ret.x0, ret.x1), x1 = Math.max(ret.x0, ret.x1), y0 = Math.min(ret.y0, ret.y1), y1 = Math.max(ret.y0, ret.y1);
    var segs = [], i, s;
    var src = (dxf && dxf.segmentos) || [];
    for (i = 0; i < src.length; i++) {
      s = src[i];
      var dx = s.x2 - s.x1, dy = s.y2 - s.y1, t0 = 0, t1 = 1, p = [-dx, dx, -dy, dy], q = [s.x1 - x0, x1 - s.x1, s.y1 - y0, y1 - s.y1], k, r, fora = false;
      for (k = 0; k < 4; k++) {
        if (p[k] === 0) { if (q[k] < 0) { fora = true; break; } }
        else { r = q[k] / p[k]; if (p[k] < 0) { if (r > t1) { fora = true; break; } if (r > t0) t0 = r; } else { if (r < t0) { fora = true; break; } if (r < t1) t1 = r; } }
      }
      if (fora || !(t1 >= t0)) continue;
      var g = { x1: s.x1 + t0 * dx, y1: s.y1 + t0 * dy, x2: s.x1 + t1 * dx, y2: s.y1 + t1 * dy, layer: s.layer };
      if (s.curva) g.curva = true; if (s.bloco) g.bloco = s.bloco;
      segs.push(g);
    }
    var textos = ((dxf && dxf.textos) || []).filter(function (t) { return t && t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1; });
    return { segmentos: segs, textos: textos, extents: segs.length ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null, unidade: dxf && dxf.unidade, layers: {} };
  }

  /* ------------------------------------------------------------ alinhamento
   * As plantas de pavimentos diferentes repetem o contorno: paredes externas,
   * escada, prumadas. O deslocamento que põe uma sobre a outra é o que faz o
   * MAIOR número de pontas de linha coincidirem — cada par de pontas vota no
   * deslocamento que as uniria e ganha o mais votado.
   * → { dx, dy, votos, segundo, confianca (0–1), ok } ; some dx,dy às coordenadas de `outro`.
   * ⚠ ok:false = não deu para afirmar (planta de cobertura só com telhado, por
   * exemplo). A tela então alinha pelo canto e AVISA — recado que mente é pior. */
  function pontas(segs, max) {
    var P = [], vistos = {}, i, s, L, k;
    for (i = 0; i < segs.length; i++) {
      s = segs[i]; if (s.curva || s.bloco) continue;   /* arco discretizado e mobília não são estrutura do pavimento */
      L = Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1); if (L < 0.4) continue;
      /* só linha ortogonal ou a 45°: parede. Hachura inclinada e cota oblíqua votariam ruído */
      var ax = Math.abs(s.x2 - s.x1), ay = Math.abs(s.y2 - s.y1);
      if (!(ax < 0.01 || ay < 0.01)) continue;
      k = Math.round(s.x1 / PASSO_VOTO) + "," + Math.round(s.y1 / PASSO_VOTO); if (!vistos[k]) { vistos[k] = 1; P.push([s.x1, s.y1]); }
      k = Math.round(s.x2 / PASSO_VOTO) + "," + Math.round(s.y2 / PASSO_VOTO); if (!vistos[k]) { vistos[k] = 1; P.push([s.x2, s.y2]); }
    }
    if (P.length > max) { var passo = P.length / max, Q = []; for (i = 0; i < max; i++) Q.push(P[Math.floor(i * passo)]); P = Q; }
    return P;
  }
  function alinhar(ref, outro, o) {
    o = o || {};
    var A = pontas((ref && ref.segmentos) || [], num(o.max, 1000)), Bp = pontas((outro && outro.segmentos) || [], num(o.max, 1000));
    if (A.length < 8 || Bp.length < 8) return { dx: 0, dy: 0, votos: 0, segundo: 0, confianca: 0, ok: false };
    /* chave numérica (ix, iy num inteiro só): com texto "ix,iy" os 2 milhões de pares levavam 1,7 s */
    var votos = {}, i, j, k, melhor = null, vm = 0, M = 2097152, OFF = 1048576, ix, iy;
    for (i = 0; i < A.length; i++) for (j = 0; j < Bp.length; j++) {
      ix = Math.round((A[i][0] - Bp[j][0]) / PASSO_VOTO) + OFF; iy = Math.round((A[i][1] - Bp[j][1]) / PASSO_VOTO) + OFF;
      if (ix < 0 || ix >= M || iy < 0 || iy >= M) continue;   /* desenhos a mais de 50 km um do outro: não é o mesmo arquivo de obra */
      k = ix * M + iy;
      votos[k] = (votos[k] || 0) + 1;
    }
    for (k in votos) if (votos[k] > vm) { vm = votos[k]; melhor = +k; }
    if (melhor == null) return { dx: 0, dy: 0, votos: 0, segundo: 0, confianca: 0, ok: false };
    var my = (melhor % M) - OFF, mx = Math.round((melhor - (melhor % M)) / M) - OFF, seg = 0, qx, qy;
    /* o 2º lugar que conta é o de OUTRO lugar (o vizinho de 5 cm é o mesmo pico) */
    for (k in votos) { qy = (+k % M) - OFF; qx = Math.round((+k - (+k % M)) / M) - OFF; if (Math.abs(qx - mx) <= 2 && Math.abs(qy - my) <= 2) continue; if (votos[k] > seg) seg = votos[k]; }
    var menor = Math.min(A.length, Bp.length), conf = Math.max(0, Math.min(1, (vm - seg) / Math.max(1, vm))) * Math.min(1, vm / (menor * 0.12));
    return { dx: r3(mx * PASSO_VOTO), dy: r3(my * PASSO_VOTO), votos: vm, segundo: seg, confianca: Math.round(conf * 100) / 100, ok: vm >= 12 && vm >= seg * 1.5 && vm >= menor * 0.06 };
  }

  /* ------------------------------------------------- níveis lidos do desenho
   * O projeto de arquitetura escreve a cota de nível em cada planta ("+3.42") e
   * repete nos cortes. Com isso a obra não precisa ter os níveis criados antes
   * de vincular o desenho: a tela propõe "Pav. Superior · +3,42" e cria.
   *
   * ⚠ Só vale número COM SINAL (+, − ou ±): sem sinal é medida de parede, área ou
   * dimensão de porta ("0.80 x 2.10"), e a planta tem centenas delas.
   * ⚠ Nada aqui é norma: é leitura de texto. Quando a planta não traz cota, a
   * elevação é ESTIMADA (pé-direito sobre o nível de baixo) e sai marcada assim —
   * a tela mostra a diferença e deixa corrigir antes de criar. */
  var RX_COTA = /^\s*(?:N\.?\s?A\.?|N\.?\s?O\.?|N[IÍ]VEL|NV\.?|EL\.?)?\s*[:=]?\s*([+\-−±])\s*(\d{1,3})[.,](\d{2,3})\s*m?\s*$/i;
  function cotaDoTexto(txt) {
    var m = RX_COTA.exec(String(txt == null ? "" : txt)); if (!m) return null;
    var v = parseFloat(m[2] + "." + m[3]); if (!isFinite(v)) return null;
    return m[1] === "-" || m[1] === "−" ? -v : v;
  }
  /* as cotas de nível escritas dentro do retângulo → [{ v, n }] da mais repetida para a menos */
  function cotasNivel(dxf, ret) {
    var cont = {}, out = [];
    ((dxf && dxf.textos) || []).forEach(function (t) {
      /* ⚠ o texto de dentro de bloco VALE aqui: a cota de nível é quase sempre o atributo do símbolo de nível (um bloco).
         Excluir os de bloco, como os títulos fazem, deixava o arquivo que originou o recurso sem cota nenhuma. */
      if (!t || !(t.x >= ret.x0 && t.x <= ret.x1 && t.y >= ret.y0 && t.y <= ret.y1)) return;
      var v = cotaDoTexto(t.txt); if (v === null) return;
      var k = v.toFixed(2); cont[k] = (cont[k] || 0) + 1;
    });
    Object.keys(cont).forEach(function (k) { out.push({ v: parseFloat(k), n: cont[k] }); });
    return out.sort(function (a, b) { return b.n - a.n || b.v - a.v; });
  }
  var NOME_PAV = { subsolo: "Subsolo", inferior: "Pav. Inferior", terreo: "Térreo", mezanino: "Mezanino", superior: "Pav. Superior", tipo: "Pavimento tipo", cobertura: "Cobertura" };
  function ordemPav(pav) {
    var m = /^n(\d+)$/.exec(pav || "");
    if (m) return parseInt(m[1], 10);
    return { subsolo: -1, inferior: -0.5, terreo: 0, mezanino: 0.5, superior: 1, tipo: 1.5, cobertura: 99 }[pav];
  }
  /* Os níveis que o desenho pede, de baixo para cima:
     [{ pav, nome, elevacao, origem: "desenho"|"estimada", candidatos:[{v,n}], regId, existente:{id,nome,y}|null, difere }]
     · um por pavimento: a planta baixa manda; sem ela, a de layout. Reservatório não vira nível (vai na Cobertura).
     · a cota escolhida é a MAIS REPETIDA na planta; empate → a que mais aparece nos cortes; ainda empate → a mais alta
       (o piso dos ambientes fica acima do da área molhada e do externo).
     · `existente` = o nível da obra que já corresponde; `difere` = cota do desenho − elevação dele (a tela mostra, não muda). */
  function niveisDoDesenho(dxf, regs, niveis, o) {
    o = o || {};
    var pd = num(o.peDireito, 2.8), porPav = {}, peso = { planta: 3, cobertura: 3, layout: 1 };
    (regs || []).forEach(function (r) {
      if (!peso[r.tipo] || !r.pav || ordemPav(r.pav) === undefined) return;
      if (!porPav[r.pav] || peso[r.tipo] > peso[porPav[r.pav].tipo]) porPav[r.pav] = r;
    });
    var nosCortes = {};
    (regs || []).forEach(function (r) { if (r.tipo !== "corte" && r.tipo !== "fachada") return; cotasNivel(dxf, r).forEach(function (c) { var k = c.v.toFixed(2); nosCortes[k] = (nosCortes[k] || 0) + c.n; }); });
    var L = Object.keys(porPav).sort(function (a, b) { return ordemPav(a) - ordemPav(b); }).map(function (pav) {
      var r = porPav[pav], cs = cotasNivel(dxf, r), m = /^n(\d+)$/.exec(pav);
      var esc = cs.slice().sort(function (a, b) { return b.n - a.n || (nosCortes[b.v.toFixed(2)] || 0) - (nosCortes[a.v.toFixed(2)] || 0) || b.v - a.v; })[0];
      var ex = nivelDoPav(pav, niveis);
      return { pav: pav, nome: m ? m[1] + "º pavimento" : NOME_PAV[pav], elevacao: esc ? esc.v : null, origem: esc ? "desenho" : "estimada", candidatos: cs.slice(0, 6), regId: r.id,
        existente: ex ? { id: ex.id, nome: ex.nome, y: num(ex.y != null ? ex.y : ex.elevacao, 0) } : null, difere: null };
    });
    /* cota que não sobe em relação ao pavimento de baixo é leitura errada (cota de piscina, de calçada): vira estimada */
    var ant = null;
    L.forEach(function (p, i) {
      if (p.elevacao !== null && ant !== null && p.elevacao <= ant + 0.5) { p.elevacao = null; p.origem = "estimada"; }
      if (p.elevacao === null) p.elevacao = r3(ant === null ? 0 : ant + pd);
      ant = p.elevacao;
      if (p.existente) p.difere = r3(p.elevacao - p.existente.y);
    });
    return L;
  }

  /* Onde gravar o recorte `ext` para ele cair SOBRE o de referência (js/bim2dui.js vincularCad: a linha fica relativa ao
     canto x0,y0 do recorte e vai à planta por X = dx + u · Y = dy − v, com o Y do CAD para cima e o da planta para baixo).
     refPos = { dx, dy } gravado na referência · refExt/ext = extents dos dois recortes · al = alinhar(ref, outro). */
  function posicao(refPos, refExt, ext, al) {
    return { dx: r3(refPos.dx + al.dx - refExt.x0 + ext.x0), dy: r3(refPos.dy - al.dy + refExt.y0 - ext.y0) };
  }
  /* sem casamento confiável: o canto inferior esquerdo de um sobre o do outro (a tela AVISA que foi pelo canto) */
  function alinharPeloCanto(refExt, ext) { return { dx: r3(refExt.x0 - ext.x0), dy: r3(refExt.y0 - ext.y0), votos: 0, segundo: 0, confianca: 0, ok: false, canto: true }; }

  var CadSepara = {
    posicao: posicao, alinharPeloCanto: alinharPeloCanto,
    cotaDoTexto: cotaDoTexto, cotasNivel: cotasNivel, niveisDoDesenho: niveisDoDesenho, NOME_PAV: NOME_PAV,
    CEL: CEL, VAO: VAO, LONGA: LONGA, MIN_LINHAS: MIN_LINHAS, MIN_LADO: MIN_LADO, PASSO_VOTO: PASSO_VOTO, ROTULO_TIPO: ROTULO_TIPO,
    norm: norm, decodificar: decodificar, caixaDe: caixaDe, ilhas: ilhas, classificar: classificar, titulos: titulos,
    nivelDoPav: nivelDoPav, regioes: regioes, recortar: recortar, alinhar: alinhar
  };
  global.CadSepara = CadSepara;
  if (typeof module !== "undefined" && module.exports) module.exports = CadSepara;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
