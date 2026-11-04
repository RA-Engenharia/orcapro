/* =====================================================================
 * bimexplodir.js — o MOTOR da vista explodida (03/11/2026). Puro: sem THREE, sem DOM, sem relógio.
 *
 *   · lerCarimbo(texto): o carimbo `OrcaPRO_Explodir` ("geral=dx,dy,dz;paineis=…;niveis=…;coberturas=…", metros,
 *     IFC com Z para cima) → { geral:[x,y,z], … }. Tolera vazio, lixo e número quebrado (o modo ruim some).
 *   · paraCena(d, M): o deslocamento IFC (Z para cima) na cena (Y para cima). ROTAÇÃO PURA: a translação da matriz
 *     de coordenação NUNCA entra (deslocamento é vetor, não ponto). Sem matriz: (x, z, −y), a permutação do web-ifc.
 *   · plano(pecas, opts): o que o modelo sabe explodir — os modos, o deslocamento de cada peça em cada modo.
 *   · suave / novoEstado / ir / passo: a animação (1800 ms, k de 0 a 1 e volta). Idempotente: o deslocamento é
 *     k · d (nunca soma por quadro), então "explodir" já explodido não duplica e "montar" volta EXATO a zero.
 *   · caixaDoCarimbo(texto) / caixaDosPontos(min,max) / cantos / uniao: a caixa orientada (OBB) da peça.
 *
 * ⚠ Por que o carimbo traz os vetores PRONTOS (e o sistema não calcula o afastamento): o afastamento do caderno de
 *   origem é decisão de projeto (os mesmos números nas folhas e no 3D). Reinventar aqui daria um desenho diferente
 *   do que o engenheiro assinou. O sistema só aplica k · d.
 * ⚠ Sem nenhum carimbo no modelo (um IFC qualquer), o plano cai no modo automático: um modo "Níveis" que sobe cada
 *   pavimento a soma das folgas dos de baixo (folga = 25% da altura média do pavimento).
 *
 * Teste: node tools/test-bimexplodir.js (com controle negativo).
 * ===================================================================== */
(function (global) {
  "use strict";

  var ORDEM = [
    { id: "geral", nome: "Explodida geral" },
    { id: "paineis", nome: "Painéis" },
    { id: "niveis", nome: "Níveis" },
    { id: "coberturas", nome: "Coberturas" }
  ];
  var DURACAO = 1800;     /* ms da animação padrão (900 até 03/11/2026: o Rogério pediu 50% mais lenta) */
  var FOLGA_AUTO = 0.25;  /* folga do modo automático: fração da altura média do pavimento */
  var ALTURA_PADRAO = 3;  /* m — só quando o modelo não diz a altura de NENHUM pavimento */
  var EPS = 1e-9;

  function ehNum(x) { return typeof x === "number" && isFinite(x); }
  function arr(a) { return Object.prototype.toString.call(a) === "[object Array]" ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  /* número do carimbo: ponto decimal; aceita vírgula por tolerância */
  function numero(s) { var n = parseFloat(txt(s).replace(",", ".")); return isFinite(n) ? n : null; }

  /* ---------------------------------------------------------------- carimbo */
  function lerCarimbo(texto) {
    var out = {};
    var partes = txt(texto).split(";");
    for (var i = 0; i < partes.length; i++) {
      var p = partes[i], ig = p.indexOf("=");
      if (ig < 0) continue;
      var id = p.slice(0, ig).replace(/^\s+|\s+$/g, "").toLowerCase();
      var ok = false;
      for (var k = 0; k < ORDEM.length; k++) if (ORDEM[k].id === id) ok = true;
      if (!ok) continue;
      var nums = p.slice(ig + 1).split(",");
      if (nums.length !== 3) continue;
      var v = [numero(nums[0]), numero(nums[1]), numero(nums[2])];
      if (v[0] == null || v[1] == null || v[2] == null) continue;
      out[id] = v;
    }
    return out;
  }

  /* IFC (Z para cima) → cena (Y para cima). M = 16 números, ordem de coluna (THREE/web-ifc). */
  function paraCena(d, M) {
    var x = +d[0], y = +d[1], z = +d[2];
    if (arr(M).length === 16) {
      var ok = true; for (var i = 0; i < 16; i++) if (!ehNum(+M[i])) ok = false;
      if (ok) return [M[0] * x + M[4] * y + M[8] * z, M[1] * x + M[5] * y + M[9] * z, M[2] * x + M[6] * y + M[10] * z];
    }
    return [x, z, -y];
  }
  /* a matriz que o web-ifc devolve pode ser a IDENTIDADE (medido no exemplo.ifc): a troca de eixo está na geometria.
     Quem chama usa esta pergunta para escolher entre "com matriz" e "sem matriz" */
  function ehIdentidade(M) {
    if (arr(M).length !== 16) return false;
    for (var i = 0; i < 16; i++) { var e = (i % 5 === 0) ? 1 : 0; if (Math.abs(+M[i] - e) > 1e-9) return false; }
    return true;
  }

  function zero(v) { return Math.abs(v[0]) < EPS && Math.abs(v[1]) < EPS && Math.abs(v[2]) < EPS; }

  /* ---------------------------------------------------------------- plano */
  /* pecas = [{uid, modulo, pav, carimbo, y0?, y1?}]  (y0/y1 = a faixa da peça na cena, só para o modo automático)
     opts  = { matriz: M | null }
     → { modos:[{id,nome,n}], desl:{modo:{uid:[x,y,z]}}, auto:bool }   (deslocamentos já na CENA) */
  function plano(pecas, opts) {
    opts = opts || {};
    var M = opts.matriz || null, lista = arr(pecas);
    var desl = {}, cont = {}, k, i, algum = false, temCarimbo = false;
    for (k = 0; k < ORDEM.length; k++) { desl[ORDEM[k].id] = {}; cont[ORDEM[k].id] = 0; }
    for (i = 0; i < lista.length; i++) {
      var p = lista[i]; if (!p || p.uid == null || !p.carimbo) continue;
      var c = lerCarimbo(p.carimbo);
      for (k = 0; k < ORDEM.length; k++) if (c[ORDEM[k].id]) temCarimbo = true;
      for (k = 0; k < ORDEM.length; k++) {
        var id = ORDEM[k].id; if (!c[id]) continue;
        var d = paraCena(c[id], M);
        if (zero(d)) continue;
        desl[id][p.uid] = d; cont[id]++; algum = true;
      }
    }
    var modos = [];
    if (algum) {
      for (k = 0; k < ORDEM.length; k++) if (cont[ORDEM[k].id] > 0) modos.push({ id: ORDEM[k].id, nome: ORDEM[k].nome, n: cont[ORDEM[k].id] });
      return { modos: modos, desl: desl, auto: false };
    }
    /* o modelo TEM carimbos mas todos zerados: não há o que explodir, e o automático não deve inventar */
    if (temCarimbo) return { modos: [], desl: desl, auto: false };
    return planoAutomatico(lista);
  }

  /* sem carimbo: os pavimentos sobem. Precisa de ≥ 2 pavimentos (com um só não há o que afastar → modos vazio) */
  function planoAutomatico(lista) {
    var pavs = [], idx = {}, i;
    for (i = 0; i < lista.length; i++) {
      var p = lista[i]; if (!p || p.uid == null || p.pav == null || txt(p.pav) === "") continue;
      var nome = txt(p.pav), g = idx[nome];
      if (g == null) { g = pavs.length; idx[nome] = g; pavs.push({ nome: nome, ordem: g, y0: Infinity, y1: -Infinity, uids: [] }); }
      pavs[g].uids.push(p.uid);
      if (ehNum(p.y0) && p.y0 < pavs[g].y0) pavs[g].y0 = p.y0;
      if (ehNum(p.y1) && p.y1 > pavs[g].y1) pavs[g].y1 = p.y1;
    }
    var vazio = { modos: [], desl: { geral: {}, paineis: {}, niveis: {}, coberturas: {} }, auto: true };
    if (pavs.length < 2) return vazio;
    /* de baixo para cima pela cota; sem cota, na ordem em que apareceram */
    var temY = pavs.every(function (g) { return isFinite(g.y0); });
    pavs.sort(function (a, b) { return temY ? (a.y0 - b.y0) || (a.ordem - b.ordem) : (a.ordem - b.ordem); });
    var soma = 0, n = 0;
    pavs.forEach(function (g) { if (isFinite(g.y0) && isFinite(g.y1) && g.y1 > g.y0) { soma += g.y1 - g.y0; n++; } });
    var altura = n ? soma / n : ALTURA_PADRAO, folga = FOLGA_AUTO * altura;
    var niveis = {}, cnt = 0;
    pavs.forEach(function (g, ix) {
      var dy = ix * folga; if (dy <= EPS) return;
      g.uids.forEach(function (u) { niveis[u] = [0, dy, 0]; cnt++; });
    });
    if (!cnt) return vazio;
    return { modos: [{ id: "niveis", nome: "Níveis", n: cnt }], desl: { geral: {}, paineis: {}, niveis: niveis, coberturas: {} }, auto: true,
      folga: folga, altura: altura };
  }

  /* ---------------------------------------------------------------- animação */
  function suave(t) { t = +t; if (!(t > 0)) return 0; if (t >= 1) return 1; return t * t * (3 - 2 * t); }
  function novoEstado(dur) { return { t: 0, alvo: 0, k: 0, dur: ehNum(dur) && dur > 0 ? dur : DURACAO, movendo: false }; }
  /* pede o destino (1 explodido, 0 montado). Pedir o que já está pedido não faz nada (idempotente) */
  function ir(e, alvo) { var a = alvo ? 1 : 0; if (e.alvo !== a) { e.alvo = a; e.movendo = true; } else if (e.t !== a) e.movendo = true; return e; }
  /* avança dt ms. Devolve o próprio estado; `mudou` diz se k mudou neste passo (quem chama só refaz as posições se mudou) */
  function passo(e, dt) {
    var antes = e.k;
    if (e.movendo) {
      var d = (+dt > 0 ? +dt : 0) / e.dur;
      if (e.alvo === 1) e.t = Math.min(1, e.t + d); else e.t = Math.max(0, e.t - d);
      if (e.t === e.alvo) e.movendo = false;
    }
    e.k = e.t === 0 ? 0 : (e.t === 1 ? 1 : suave(e.t));
    e.mudou = e.k !== antes;
    return e;
  }

  /* ---------------------------------------------------------------- caixas */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); return l > EPS ? [a[0] / l, a[1] / l, a[2] / l] : null; }

  /* OrcaPRO_Caixa = "cx cy cz ux uy uz vx vy vz L h b" (IFC, m): centro, eixo do comprimento, eixo da altura, medidas.
     Devolve a OBB NO IFC; com `M` (ou `cena:true`) já na cena: o centro como PONTO (com translação), os eixos como vetor */
  function caixaDoCarimbo(texto, M, cena) {
    var s = txt(texto).replace(/^\s+|\s+$/g, "");
    if (!s) return null;
    var t = s.split(/[\s;]+/); if (t.length !== 12) return null;
    var n = []; for (var i = 0; i < 12; i++) { var x = numero(t[i]); if (x == null) return null; n.push(x); }
    var u = unit([n[3], n[4], n[5]]), v = unit([n[6], n[7], n[8]]);
    if (!u || !v || n[9] < 0 || n[10] < 0 || n[11] < 0) return null;
    var c = [n[0], n[1], n[2]];
    if (M || cena) {
      var ok = arr(M).length === 16;
      var cc = ok ? [M[0] * c[0] + M[4] * c[1] + M[8] * c[2] + M[12], M[1] * c[0] + M[5] * c[1] + M[9] * c[2] + M[13], M[2] * c[0] + M[6] * c[1] + M[10] * c[2] + M[14]] : [c[0], c[2], -c[1]];
      c = cc; u = paraCena(u, ok ? M : null); v = paraCena(v, ok ? M : null);
    }
    return { c: c, u: u, v: v, w: cruz(u, v), meia: [n[9] / 2, n[10] / 2, n[11] / 2] };
  }
  /* a caixa alinhada aos eixos (modelo sem carimbo): min/max na cena */
  function caixaDosPontos(min, max) {
    var c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    return { c: c, u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1], meia: [Math.abs(max[0] - min[0]) / 2, Math.abs(max[1] - min[1]) / 2, Math.abs(max[2] - min[2]) / 2] };
  }
  function cantos(o) {
    var out = [];
    for (var a = -1; a <= 1; a += 2) for (var b = -1; b <= 1; b += 2) for (var d = -1; d <= 1; d += 2) {
      var A = a * o.meia[0], B = b * o.meia[1], D = d * o.meia[2];
      out.push([o.c[0] + o.u[0] * A + o.v[0] * B + o.w[0] * D, o.c[1] + o.u[1] * A + o.v[1] * B + o.w[1] * D, o.c[2] + o.u[2] * A + o.v[2] * B + o.w[2] * D]);
    }
    return out;
  }
  /* a caixa que contém várias (alinhada aos eixos), com um deslocamento opcional por caixa */
  function uniao(obbs, desl) {
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], tem = false;
    arr(obbs).forEach(function (o, i) {
      if (!o) return; var d = desl && desl[i] ? desl[i] : [0, 0, 0];
      cantos(o).forEach(function (p) { tem = true; for (var k = 0; k < 3; k++) { var q = p[k] + d[k]; if (q < mn[k]) mn[k] = q; if (q > mx[k]) mx[k] = q; } });
    });
    return tem ? caixaDosPontos(mn, mx) : null;
  }
  /* O ALVO DA COTA, um por MÓDULO + VETOR de afastamento. ⚠ Defeito de 03/11/2026 (revisão): a caixa do módulo era a UNIÃO das peças já
     deslocadas — num módulo cujas peças andam em vetores diferentes (a cobertura de 4 vetores), a "medida" do módulo virava o
     ESPALHAMENTO das peças, um número que nenhuma peça tem. Agora cada grupo de peças que andam JUNTAS é um alvo: a caixa mede as
     peças sem deslocamento (a medida é a do módulo montado) e o deslocamento do quadro vai à parte, em `desl` (k · d).
     itens = [{modulo, caixa (OBB), d:[x,y,z] (o vetor do modo; ausente = não anda)}]; k = 0..1.
     → [{id, caixa, desl:[x,y,z], prioridade}]. Um grupo só no módulo: id = o módulo; vários: "módulo#n", na ordem do vetor. */
  function alvosPorModuloEVetor(itens, k) {
    var porMod = {}, ordem = [], kk = ehNum(+k) ? +k : 1;
    arr(itens).forEach(function (it) {
      if (!it || !it.caixa || it.modulo == null) return;
      var d = arr(it.d).length === 3 ? it.d : [0, 0, 0], vk = d.map(function (x) { return (Math.round(+x * 1000) / 1000).toFixed(3); }).join(",");
      var m = porMod[it.modulo]; if (!m) { m = porMod[it.modulo] = { grupos: {}, chaves: [] }; ordem.push(it.modulo); }
      var g = m.grupos[vk]; if (!g) { g = m.grupos[vk] = { d: [+d[0], +d[1], +d[2]], obbs: [] }; m.chaves.push(vk); }
      g.obbs.push(it.caixa);
    });
    var out = [];
    ordem.forEach(function (mod) {
      var m = porMod[mod], chaves = m.chaves.slice().sort();
      chaves.forEach(function (vk, i) {
        var g = m.grupos[vk], cx = uniao(g.obbs, null); if (!cx) return;
        out.push({ id: chaves.length > 1 ? mod + "#" + (i + 1) : mod, caixa: cx, desl: [g.d[0] * kk, g.d[1] * kk, g.d[2] * kk], prioridade: g.obbs.length, modulo: mod });
      });
    });
    return out;
  }
  function desloca(o, d) { return { c: [o.c[0] + d[0], o.c[1] + d[1], o.c[2] + d[2]], u: o.u, v: o.v, w: o.w, meia: o.meia }; }

  /* ---------------------------------------------------------------- o GRUPO (um módulo aberto sozinho, 03/11/2026)
     planoDoGrupo(pecas, opts): pecas = [{uid, caixa (OBB na cena)}] → { uid: [x,y,z] } (deslocamento na CENA, metros).
       1. a caixa do CONJUNTO (alinhada aos eixos da cena): centro C e a extensão em x, y, z; o eixo da ESPESSURA é o de menor extensão
          (empate: o primeiro eixo, x antes de y antes de z — determinístico);
       2. CAMADAS: o centro de cada peça no eixo da espessura, agrupado com tolerância de 2 cm, em ordem crescente. A camada i de n anda
          (i − (n−1)/2) · passoT nesse eixo, passoT = max(0,35 m; 1,2 · espessura do conjunto). ⚠ A ordem real das camadas NUNCA inverte:
          o painel vira um sanduíche aberto, e a camada de fora continua de fora;
       3. no plano (os outros dois eixos): (centro da peça − C) · 0,22, para as peças da mesma camada não se tocarem;
       4. uma peça só, conjunto vazio ou caixa inválida (NaN): sem deslocamento ({}).
     opts (só para teste): { tolCamada, passoMin, fatorPasso, fatorPlano }. Puro: sem THREE. */
  function planoDoGrupo(pecas, opts) {
    opts = opts || {};
    var tol = ehNum(opts.tolCamada) ? opts.tolCamada : 0.02, passoMin = ehNum(opts.passoMin) ? opts.passoMin : 0.35;
    var fPasso = ehNum(opts.fatorPasso) ? opts.fatorPasso : 1.2, fPlano = ehNum(opts.fatorPlano) ? opts.fatorPlano : 0.22;
    var lista = [];
    arr(pecas).forEach(function (p) {
      if (!p || p.uid == null || !p.caixa || arr(p.caixa.c).length !== 3 || arr(p.caixa.meia).length !== 3) return;
      for (var i = 0; i < 3; i++) if (!ehNum(+p.caixa.c[i]) || !ehNum(+p.caixa.meia[i])) return;
      lista.push(p);
    });
    if (lista.length < 2) return {};
    var cx = uniao(lista.map(function (p) { return p.caixa; }), null);
    if (!cx) return {};
    var C = cx.c, ext = [cx.meia[0] * 2, cx.meia[1] * 2, cx.meia[2] * 2], t = 0;
    for (var a = 1; a < 3; a++) if (ext[a] < ext[t] - EPS) t = a;
    var passoT = Math.max(passoMin, fPasso * ext[t]);
    var ord = lista.map(function (p, i) { return { p: p, v: p.caixa.c[t], i: i }; });
    ord.sort(function (x, y) { return (x.v - y.v) || (x.i - y.i); });
    var camadas = [];
    ord.forEach(function (o) {
      var ult = camadas[camadas.length - 1];
      if (ult && o.v - ult.v0 <= tol + EPS) ult.itens.push(o); else camadas.push({ v0: o.v, itens: [o] });
    });
    var out = {}, n = camadas.length;
    camadas.forEach(function (cam, i) {
      var dt = (i - (n - 1) / 2) * passoT;
      cam.itens.forEach(function (o) {
        var d = [0, 0, 0];
        for (var k = 0; k < 3; k++) d[k] = k === t ? dt : (o.p.caixa.c[k] - C[k]) * fPlano;
        out[o.p.uid] = d;
      });
    });
    return out;
  }
  /* O título do grupo só por PADRÃO de código (sem texto de obra): PN-02 → "Painel PN-02"; CI-01, CS-01, FC-01 → "Módulo CI-01"; V10 → "Parede V10";
     P1 → "Pilar P1"; o resto, o próprio código. */
  function tituloDoGrupo(modulo) {
    var m = txt(modulo).replace(/^\s+|\s+$/g, ""), u = m.toUpperCase();
    if (!m) return "";
    if (/^PN-\d+$/.test(u)) return "Painel " + u;
    if (/^(CI|CS|FC)-\d+$/.test(u)) return "Módulo " + u;
    if (/^V\d+$/.test(u)) return "Parede " + u;
    if (/^P\d+$/.test(u)) return "Pilar " + u;
    return m;
  }

  /* A distância da câmera para TODOS os cantos caberem na tela, nos dois sentidos. ⚠ O "enquadrar tudo" do app mede só pela altura da
     tela: no celular em pé a explodida cortava dos lados, e no monitor largo ficava pequena, com as cotas amontoadas.
     cantos em volta de c; dir = de c para a câmera (unitário); dirDir e cima = eixos da tela (unitários); fovV em graus. */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function distanciaParaCaber(cantos, c, dir, dirDir, cima, fovV, aspecto, margem) {
    var tV = Math.tan(fovV * Math.PI / 360), tH = tV * aspecto, k = margem || 1.08, d = 0.1;
    for (var i = 0; i < cantos.length; i++) {
      var r = [cantos[i][0] - c[0], cantos[i][1] - c[1], cantos[i][2] - c[2]];
      var x = Math.abs(dot(r, dirDir)) * k, y = Math.abs(dot(r, cima)) * k, z = dot(r, dir);
      d = Math.max(d, x / tH + z, y / tV + z);
    }
    return d;
  }

  /* O furo na peça: s ao longo do comprimento, a partir de p0; y na LARGURA b e z na ALTURA h, os dois a partir do CANTO da seção,
     em mm. ⚠ Conferido contra o eixo das ferragens da obra de origem (03/11/2026): lido do centro, ou com y na altura, o furo
     cai até 90 mm fora. Na caixa, v é a direção de h e w a de b. */
  function pontoDoFuro(o, f) {
    var s = f.s / 1000 - o.meia[0], z = f.z / 1000 - o.meia[1], y = f.y / 1000 - o.meia[2], p = [];
    for (var i = 0; i < 3; i++) p.push(o.c[i] + o.u[i] * s + o.v[i] * z + o.w[i] * y);
    return p;
  }

  /* ---------------------------------------------------------------- carimbos de leitura (cartão da peça) */
  function lerFuros(texto) {
    var j; try { j = JSON.parse(txt(texto)); } catch (e) { return []; }
    return arr(j).filter(function (f) { return arr(f).length >= 5; }).map(function (f) {
      return { s: +f[0], y: +f[1], z: +f[2], d: +f[3], face: txt(f[4]), passante: !!+f[5], prof: ehNum(+f[6]) ? +f[6] : null, ligacao: txt(f[7]), ferragem: txt(f[8]) };
    });
  }
  function lerLigacoes(texto) {
    var j; try { j = JSON.parse(txt(texto)); } catch (e) { return []; }
    return arr(j).filter(function (l) { return arr(l).length >= 2; }).map(function (l) { return { codigo: txt(l[0]), tipo: txt(l[1]) }; });
  }
  /* ⚠ A URL da ficha vem do ARQUIVO do projeto (texto de terceiros) e vira o `src` de uma <img> no visor, na tela do celular e na
     Prancha Viva (03/11/2026, revisão). Só entra `https:`, caminho relativo (sem esquema) ou endereço da MESMA origem do app
     (`origem`, sem barra final). `javascript:`, `data:`, `file:`, `blob:`, `http:` de fora e `//host` viram "sem ficha". */
  function urlFichaOk(url, origem) {
    var u = txt(url).replace(/^\s+|\s+$/g, "");
    if (!u || /[\u0000-\u001f\u007f\s\\]/.test(u)) return false;
    if (/^https:\/\/[^\/?#]+/i.test(u)) return true;
    var og = txt(origem).replace(/\/+$/, "");
    if (og && (u === og || u.indexOf(og + "/") === 0)) return true;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return false;
    if (u.indexOf("//") === 0) return false;
    return true;
  }
  /* "titulo|url|pagina" → {titulo,url,pagina}; sem URL, ou com URL que não passa em urlFichaOk → null (ficha só se for certa) */
  function lerFicha(texto, origem) {
    var t = txt(texto).split("|"); if (t.length < 2 || !t[1]) return null;
    if (!urlFichaOk(t[1], origem)) return null;
    return { titulo: t[0], url: t[1].replace(/^\s+|\s+$/g, ""), pagina: t[2] != null ? t[2] : "" };
  }
  /* "2.89" / ".14" — o formato de medida do caderno: duas casas, ponto, sem zero à esquerda */
  function fmtM(v) {
    var s = (+v).toFixed(2), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
    if (s.slice(0, 2) === "0.") s = s.slice(1);
    return (neg ? "-" : "") + s;
  }

  var Explodir = {
    ORDEM: ORDEM, DURACAO: DURACAO, FOLGA_AUTO: FOLGA_AUTO,
    lerCarimbo: lerCarimbo, paraCena: paraCena, ehIdentidade: ehIdentidade, plano: plano,
    suave: suave, novoEstado: novoEstado, ir: ir, passo: passo,
    caixaDoCarimbo: caixaDoCarimbo, caixaDosPontos: caixaDosPontos, cantos: cantos, uniao: uniao, desloca: desloca, pontoDoFuro: pontoDoFuro, distanciaParaCaber: distanciaParaCaber,
    lerFuros: lerFuros, lerLigacoes: lerLigacoes, lerFicha: lerFicha, urlFichaOk: urlFichaOk, alvosPorModuloEVetor: alvosPorModuloEVetor, fmtM: fmtM, planoDoGrupo: planoDoGrupo, tituloDoGrupo: tituloDoGrupo
  };
  global.BimExplodir = Explodir;
  if (typeof module !== "undefined" && module.exports) module.exports = Explodir;
})(typeof window !== "undefined" ? window : this);
