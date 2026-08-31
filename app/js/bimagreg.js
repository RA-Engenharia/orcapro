/* =====================================================================
 * bimagreg.js — AGREGAÇÃO DE GEOMETRIA (o B2, D2)
 *
 * O QUE FOI MEDIDO, ANTES DE QUALQUER LINHA DESTE ARQUIVO
 * No modelo real da RA (Murumbir — Demolição, 3,84 MB, 452 peças), com
 * `renderer.info` no navegador:
 *
 *     draw calls ................. 950   (2,1 por peça)
 *     triângulos ................. 31.951
 *     triângulos por geometria ... mediana 12
 *     materiais distintos ........ 13
 *     clique (raycast) ........... 0,21 ms
 *
 * Mediana de 12 triângulos por chamada de desenho: a placa de vídeo não faz
 * nada: é tudo custo de chamada. Extrapolando os 2,1 por peça, um modelo de
 * 15 mil peças pede ~31 mil draw calls — que é o D2, e é o que trava a máquina
 * de escritório e inviabiliza o celular.
 *
 * ⚠ E O QUE A MEDIÇÃO DESMENTIU: o clique custa 0,21 ms com 896 malhas. O D3
 * supunha degradação linear a ponto de exigir BVH; extrapolando para 40 mil
 * malhas dá ~9 ms, ainda muito abaixo dos 100 ms da meta. BVH deixou de ser
 * prioridade do B2 por medição, não por opinião.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POR QUE MESCLAR, E NÃO INSTANCIAR
 *
 * A especificação sugeria `InstancedMesh` para a geometria repetida. Medido, o
 * arquivo real repete pouco: 514 geometrias únicas para 896 peças (1,74×), e a
 * mais repetida aparece 10 vezes. Só instanciando, a conta ia a 568 chamadas —
 * ainda acima da meta de 500. Instancing + merge dá 165.
 *
 * E há um argumento mais forte: **o produto já duplica a geometria hoje**. O
 * caminho de abertura cria um `Float32Array` por instância; instanciar
 * economizaria MEMÓRIA que hoje já é gasta, enquanto o problema medido é de
 * CHAMADA. Mesclar não gasta um byte a mais do que já se gasta, e leva as
 * chamadas ao piso: uma por material.
 *
 * Instancing continua valendo para um modelo de MEP com milhares de conexões
 * idênticas. Fica declarado como próximo passo, quando houver um arquivo real
 * que o justifique — medido, não suposto.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ O QUE MESCLAR QUEBRA, E COMO ISTO DEVOLVE
 *
 * Hoje vale a invariante "uma malha = uma peça", e o produto inteiro depende
 * dela: clique, trena, encaixe, isolar, raio-X, cor por disciplina, cor por
 * sistema, 4D, conflito. Mesclando, uma malha passa a ter milhares de peças —
 * e é exatamente aí que a tabela de riscos marca probabilidade ALTA de
 * quebrar a trena, o encaixe e o corte técnico.
 *
 * A ponte é o MAPA DE FAIXAS: cada peça ocupa um intervalo contíguo de
 * triângulos e de vértices dentro do buffer mesclado. Com ele:
 *   clique   → `faceIndex` → busca binária → expressID
 *   ocultar  → reescreve o índice sem os triângulos daquela faixa
 *   colorir  → escreve a cor nos vértices daquela faixa
 * Nada disso mexe em material compartilhado, que é a armadilha que a própria
 * especificação aponta (5.2).
 *
 * ⚠ E A PRECISÃO. Mesclar OBRIGA a assar a matriz nos vértices (uma malha, uma
 * transformação). Assar em float32 na coordenada bruta é o D8: num IFC
 * georreferenciado (UTM, ~7.000.000 m) o float32 erra no metro. Por isso a
 * conta é feita em double e o resultado é gravado RELATIVO a uma origem, com
 * a malha posicionada nela. A agregação não é onde a trena passa a mentir.
 *
 * ⚠ POR QUE PURO
 * Decide o que a pessoa VÊ e MEDE. `js/bim.js` não entra no gate; isto entra,
 * com fixture gravada do three real (tools/fixtures/bim-geometria.json).
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(x) { var n = +x; return isFinite(n) ? n : 0; }

  /* a mesma chave de material que o viewer já usa no `matCache`: cor em 8 bits
     por canal + alfa com duas casas. Mudar isto aqui sem mudar lá criaria dois
     agrupamentos diferentes para a mesma cor. */
  function chaveMaterial(cor) {
    var c = cor || [1, 1, 1, 1];
    return (num(c[0]) * 255 | 0) + "_" + (num(c[1]) * 255 | 0) + "_" + (num(c[2]) * 255 | 0) + "_" + num(c[3]).toFixed(2);
  }

  /* ---------------------------------------------------------------
   * aplicar a matriz — em DOUBLE, e relativo a uma origem
   *
   * `m` é coluna-maior, como o three entrega (`Matrix4.elements`).
   * ------------------------------------------------------------- */
  function pontoPorMatriz(m, x, y, z, fora) {
    var w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (!w) w = 1;
    fora[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    fora[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    fora[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return fora;
  }
  /* normal usa só a parte 3×3, e SEM translação — senão a iluminação vira
     função da posição da peça no mundo */
  function normalPorMatriz(m, x, y, z, fora) {
    fora[0] = m[0] * x + m[4] * y + m[8] * z;
    fora[1] = m[1] * x + m[5] * y + m[9] * z;
    fora[2] = m[2] * x + m[6] * y + m[10] * z;
    var d = Math.sqrt(fora[0] * fora[0] + fora[1] * fora[1] + fora[2] * fora[2]);
    if (d > 1e-12) { fora[0] /= d; fora[1] /= d; fora[2] /= d; }
    return fora;
  }

  /* ---------------------------------------------------------------
   * planejar — quantos buckets, quem cai em cada um, e quanto rende
   *
   * ⚠ AS PEÇAS DE UM MESMO ELEMENTO FICAM JUNTAS. Um elemento pode ter várias
   * geometrias, e às vezes de cores diferentes — nesse caso ele aparece em
   * mais de um bucket, e o mapa de faixas registra uma faixa em cada. Sem
   * isso, ocultar a peça esconderia parte dela.
   * ------------------------------------------------------------- */
  function planejar(dados, opts) {
    dados = dados || {}; opts = opts || {};
    var insts = dados.instancias || [];
    var geos = dados.geometrias || {};
    var buckets = {}, ordem = [];

    for (var i = 0; i < insts.length; i++) {
      var it = insts[i];
      var g = geos[String(it.g)];
      if (!g || !g.idx || !g.idx.length) continue;      /* instância órfã não vira nada */
      var k = chaveMaterial(it.cor);
      if (!buckets[k]) {
        buckets[k] = { chave: k, cor: [num(it.cor[0]), num(it.cor[1]), num(it.cor[2]), num(it.cor[3])],
                       membros: [], nVert: 0, nIdx: 0 };
        ordem.push(k);
      }
      var b = buckets[k];
      /* ⚠ `ref` e repasse OPACO: o motor nao olha dentro. Ele existe para o
         viewer amarrar a faixa a malha que a produziu, e assim espelhar
         visibilidade e cor sem ter de procurar a peca a cada quadro. Motor puro
         nao pode conhecer THREE.Mesh; carregar a referencia sem abri-la nao
         quebra isso. */
      b.membros.push({ e: num(it.e), g: String(it.g), m: it.m, ref: it.ref });
      b.nVert += g.pos.length / 3;
      b.nIdx += g.idx.length;
    }

    /* ordem estável: a mesma cena tem de produzir sempre os mesmos buffers,
       senão a faixa de uma peça mudaria entre aberturas e um estado salvo
       (oculto, cor) apontaria para outra peça */
    ordem.sort();

    var lista = ordem.map(function (k) { return buckets[k]; });
    var malhasHoje = 0;
    for (var j = 0; j < insts.length; j++) if (geos[String(insts[j].g)]) malhasHoje++;

    return {
      buckets: lista,
      resumo: {
        malhasHoje: malhasHoje,
        malhasDepois: lista.length,
        materiais: lista.length,
        vertices: lista.reduce(function (a, b2) { return a + b2.nVert; }, 0),
        triangulos: lista.reduce(function (a, b2) { return a + b2.nIdx / 3; }, 0)
      }
    };
  }

  /* ---------------------------------------------------------------
   * origemDe — o ponto de referência das coordenadas mescladas
   *
   * ⚠ É O CENTRO DO CONTEÚDO, calculado em double sobre a translação de cada
   * peça. Num modelo georreferenciado as coordenadas passam de 7 milhões; sem
   * subtrair a origem, gravar em float32 erra no metro (D8). Com ela, o
   * float32 passa a descrever DISTÂNCIAS de dezenas de metros, onde ele tem
   * precisão de micrômetro.
   *
   * O chamador pode passar uma origem própria — é assim que a federação faz
   * todos os modelos da obra usarem a MESMA, que é o que mantém dois IFCs
   * alinhados (D7/D8).
   * ------------------------------------------------------------- */
  function origemDe(plano, origemDada) {
    if (Array.isArray(origemDada) && origemDada.length === 3) return [num(origemDada[0]), num(origemDada[1]), num(origemDada[2])];
    var sx = 0, sy = 0, sz = 0, n = 0;
    (plano.buckets || []).forEach(function (b) {
      b.membros.forEach(function (mb) {
        var m = mb.m; if (!m || m.length < 16) return;
        sx += num(m[12]); sy += num(m[13]); sz += num(m[14]); n++;
      });
    });
    if (!n) return [0, 0, 0];
    return [sx / n, sy / n, sz / n];
  }

  /* ---------------------------------------------------------------
   * construir — os buffers de um bucket, e o mapa de faixas
   *
   * Devolve `pos`/`nor` em Float32Array (é o que a GPU consome) já relativos à
   * origem, `idx` em Uint32Array, e `faixas` ordenadas por triângulo inicial.
   * ------------------------------------------------------------- */
  function construir(bucket, geometrias, origem) {
    var o = origem || [0, 0, 0];
    var pos = new Float32Array(bucket.nVert * 3);
    var nor = new Float32Array(bucket.nVert * 3);
    var idx = new Uint32Array(bucket.nIdx);
    var faixas = [];
    var pv = 0, pi = 0, baseVert = 0;
    var p = [0, 0, 0], nn = [0, 0, 0];

    for (var k = 0; k < bucket.membros.length; k++) {
      var mb = bucket.membros[k];
      var g = geometrias[mb.g];
      if (!g) continue;
      var nv = g.pos.length / 3, ni = g.idx.length;
      var m = mb.m;

      for (var v = 0; v < nv; v++) {
        pontoPorMatriz(m, g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2], p);
        /* ⚠ a subtração é feita ANTES de estreitar para float32: é ela que
           tira a coordenada georreferenciada do alcance do erro */
        pos[pv] = p[0] - o[0]; pos[pv + 1] = p[1] - o[1]; pos[pv + 2] = p[2] - o[2];
        normalPorMatriz(m, g.nor[v * 3], g.nor[v * 3 + 1], g.nor[v * 3 + 2], nn);
        nor[pv] = nn[0]; nor[pv + 1] = nn[1]; nor[pv + 2] = nn[2];
        pv += 3;
      }
      for (var q = 0; q < ni; q++) idx[pi + q] = g.idx[q] + baseVert;

      faixas.push({ e: mb.e, iniTri: pi / 3, nTri: ni / 3, iniVert: baseVert, nVert: nv, ref: mb.ref });
      pi += ni; baseVert += nv;
    }
    /* já sai ordenado por iniTri (a construção é sequencial), e a busca binária
       depende disso — o assert do teste guarda a invariante */
    return { pos: pos, nor: nor, idx: idx, faixas: faixas, origem: [o[0], o[1], o[2]], chave: bucket.chave, cor: bucket.cor };
  }

  /* ---------------------------------------------------------------
   * elementoNoTriangulo — a volta: o clique devolve `faceIndex`
   *
   * ⚠ BUSCA BINÁRIA, não varredura. É ela que mantém o clique barato depois de
   * a cena virar 13 malhas com dezenas de milhares de triângulos cada.
   * ------------------------------------------------------------- */
  function elementoNoTriangulo(faixas, tri) {
    if (!faixas || !faixas.length) return null;
    var t = num(tri), lo = 0, hi = faixas.length - 1;
    while (lo <= hi) {
      var meio = (lo + hi) >> 1, f = faixas[meio];
      if (t < f.iniTri) hi = meio - 1;
      else if (t >= f.iniTri + f.nTri) lo = meio + 1;
      else return f.e;
    }
    return null;
  }
  function faixaDoElemento(faixas, e) {
    var alvo = num(e);
    for (var i = 0; i < (faixas || []).length; i++) if (faixas[i].e === alvo) return faixas[i];
    return null;
  }
  /* um elemento pode ter mais de uma faixa no mesmo bucket (duas geometrias da
     mesma cor) — quem oculta e quem pinta precisa de TODAS */
  function faixasDoElemento(faixas, e) {
    var alvo = num(e), out = [];
    for (var i = 0; i < (faixas || []).length; i++) if (faixas[i].e === alvo) out.push(faixas[i]);
    return out;
  }

  /* ---------------------------------------------------------------
   * indicesVisiveis — ocultar peça sem mexer no material
   *
   * Reescreve o índice deixando de fora os triângulos das peças ocultas. O
   * custo é O(total de índices) por mudança, e não O(peças ocultas) — mas é
   * uma cópia de memória linear, na casa do milissegundo mesmo num modelo
   * grande, e evita `onBeforeCompile` e material por peça.
   *
   * Devolve `{ idx, nIdx }`: o buffer completo e quantos índices desenhar, para
   * o chamador usar `setDrawRange`/`count` sem realocar a cada troca.
   * ------------------------------------------------------------- */
  function indicesVisiveis(faixas, idxCompleto, ocultos, destino) {
    var fora = ocultos || {};
    var out = destino && destino.length >= idxCompleto.length ? destino : new Uint32Array(idxCompleto.length);
    var p = 0;
    for (var i = 0; i < faixas.length; i++) {
      var f = faixas[i];
      if (fora[f.e]) continue;
      var ini = f.iniTri * 3, fim = ini + f.nTri * 3;
      for (var q = ini; q < fim; q++) out[p++] = idxCompleto[q];
    }
    return { idx: out, nIdx: p };
  }

  /* ---------------------------------------------------------------
   * pintar — cor por peça, num atributo de vértice
   *
   * Seleção, 4D, conflito e cor-por-sistema deixam de trocar `mesh.material`
   * (que agora é compartilhado por milhares de peças) e passam a escrever aqui.
   * ------------------------------------------------------------- */
  function pintar(cores, faixas, e, rgb) {
    var fs = faixasDoElemento(faixas, e), n = 0;
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i], ini = f.iniVert * 3, fim = ini + f.nVert * 3;
      for (var v = ini; v < fim; v += 3) { cores[v] = rgb[0]; cores[v + 1] = rgb[1]; cores[v + 2] = rgb[2]; n++; }
    }
    return n;
  }
  function coresIniciais(bucket, nVert) {
    var c = new Float32Array(nVert * 3), r = bucket.cor[0], g = bucket.cor[1], b = bucket.cor[2];
    for (var i = 0; i < c.length; i += 3) { c[i] = r; c[i + 1] = g; c[i + 2] = b; }
    return c;
  }

  var BimAgreg = {
    chaveMaterial: chaveMaterial,
    planejar: planejar,
    origemDe: origemDe,
    construir: construir,
    elementoNoTriangulo: elementoNoTriangulo,
    faixaDoElemento: faixaDoElemento,
    faixasDoElemento: faixasDoElemento,
    indicesVisiveis: indicesVisiveis,
    pintar: pintar,
    coresIniciais: coresIniciais,
    /* expostos para o teste conferir a conta contra o three real */
    _pontoPorMatriz: pontoPorMatriz,
    _normalPorMatriz: normalPorMatriz
  };

  global.BimAgreg = BimAgreg;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAgreg;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
