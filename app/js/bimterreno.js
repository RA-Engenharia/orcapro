/* =====================================================================
 * bimterreno.js — TERRENO E IMPLANTAÇÃO (massa e terreno),
 * motor PURO (ES5, Node-testável).
 *
 * Fase P11 do plano do BIM (seções 3.1, 3.7, 3.8 e Anexo A
 * "Massa e terreno"). Pedido do Rogério (08/10/2026): "copia todas as
 * funcionalidades [de mercado] para o nosso". Corte e aterro é DINHEIRO.
 *
 * FRENTE A — TOPOSSÓLIDO ("Sólido topográfico")
 *   · por PONTOS cotados (clique + cota, ou CSV PNEZ pelo js/icarrelevo.js);
 *   · por CURVAS DE NÍVEL de um DXF de levantamento (js/dxf.js lê o z das
 *     LWPOLYLINE/POLYLINE/LINE/POINT — "Topossólido a partir da importação");
 *   · TRIANGULAÇÃO DE DELAUNAY própria (varredura + troca de diagonal de
 *     Lawson — ver o bloco DELAUNAY). Pura, sem biblioteca. O teste confere
 *     o círculo vazio e a cobertura do casco com pontos alinhados na borda;
 *   · CURVAS DE NÍVEL (triângulo a triângulo, emendadas em polilinhas),
 *     mestras a cada 5 intervalos; ROTULAR CURVAS (uma linha
 *     que cruza as curvas: um rótulo em cada cruzamento) e rótulo automático
 *     das mestras;
 *   · SUB-REGIÃO ("Subdivisão"): um contorno sobre o terreno com material
 *     próprio — área projetada e área da superfície (inclinada) do pedaço.
 *   · Volume do topossólido: fundo PLANO na cota mínima − espessura (regra
 *     RA). A referência medida é diferente e isso está ACEITO no cenário P11
 *     (coleta de 09/10/2026): nela o fundo acompanha o topo (espessura
 *     constante na vertical; volume = área projetada × espessura). Aqui o
 *     fundo é plano porque a sondagem põe as camadas por cota (horizontais).
 *
 * FRENTE B — TERRAPLENAGEM (plataforma / região classificada)
 *   · PLATAFORMA: contorno + cota (nível + "Altura do deslocamento do nível",
 *     o BUILDINGPAD_HEIGHTABOVELEVEL_PARAM) sobre um topossólido.
 *   · CORTE E ATERRO — O MÉTODO (é dinheiro, por isso escrito aqui):
 *       o terreno é a superfície TRIANGULADA (linear em cada triângulo); a
 *       plataforma é o plano y = h dentro do contorno. Para CADA triângulo:
 *         1. Q = contorno ∩ triângulo (Sutherland–Hodgman, o triângulo é
 *            convexo — o contorno pode ser côncavo);
 *         2. d(x,z) = terreno(x,z) − h é LINEAR em Q; Q se divide pela reta
 *            d = 0 em Q+ (terreno acima: CORTE) e Q− (abaixo: ATERRO);
 *         3. como d é linear, ∫ d dA = área(Q±) × d(centroide de Q±) — exato;
 *       corte = Σ ∫Q+ d dA; aterro = Σ ∫Q− (−d) dA.
 *     São os PRISMAS sobre a triangulação (cada prisma com topo inclinado e
 *     base no plano), integrados EXATAMENTE — o mesmo princípio do "Cut/Fill",
 *     que compara a superfície existente com a classificada por
 *     triângulos. Não há grade nem amostragem: o número só depende dos
 *     pontos. A parte do contorno FORA do terreno não entra (área fora vai
 *     com aviso — sem terreno não há volume, e o motor não inventa).
 *     Líquido = corte − aterro (positivo = sobra terra/bota-fora; negativo
 *     = falta terra/empréstimo; o sinal confere na coleta).
 *     Teste à mão (tools/test-bimterreno.js): terreno y = 0,1·x em 10 × 10,
 *     plataforma inteira a 0,50 → corte 12,5 m³ e aterro 12,5 m³.
 *   · SONDAGEM EMBAIXO (js/sondagem.js, quando a obra tem): as camadas do
 *     furo mais perto (cotas = boca − profundidade, na mesma referência de
 *     nível do projeto) repartem o CORTE por camada — o corte entre duas
 *     cotas sai da mesma conta (corte acima de e1 − corte acima de e2) — e o
 *     corte abaixo do nível d'água vira aviso (esgotamento/rebaixamento é
 *     outro serviço). Material da camada ≠ categoria de escavação: a
 *     categoria (1ª/2ª/3ª) é decisão de quem orça — a tela só informa.
 *   · ORÇAMENTO (js/orcmodelo.js): Corte e Preenchimento são medidas do
 *     registro (m³). A composição vem do SINAPI pelo grupo que o mapa
 *     (tools/gerar-sinapi-familias-mapa.js) separou como "movimento de terra:
 *     sai do terreno" — candidatos por MOV_TERRA. NUNCA se escolhe sozinho:
 *     sem composição, a linha sai PENDENTE com a quantidade.
 *
 * FRENTE C (motor) — IMPLANTAÇÃO
 *   · LINHA DE PROPRIEDADE (divisa): área do lote, perímetro e a tabela de
 *     rumos e distâncias ("Dados da linha de propriedade") pelo norte
 *     verdadeiro;
 *   · IMPLANTAÇÃO: ângulo do norte verdadeiro (a convenção do js/icargeo.js:
 *     graus, o norte verdadeiro girado a partir do NORTE DO PROJETO (−z da
 *     cena = +Y do IFC), anti-horário), latitude/longitude/elevação do ponto
 *     (0, 0) do modelo — a tela liga ao LOCAL DA OBRA do içamento;
 *   · COMPONENTES DE TERRENO (árvore, arbusto, poste, banco, carro, lixeira)
 *     pousados na superfície.
 *
 * COORDENADAS: planta da cena (x, z) — z para o SUL (a cena é (x, z, −y) do
 * IFC) — e cota = y da cena. DXF/levantamento (X, Y norte, Z) → (x, −y, z).
 *
 * AS OPS (validadas no BimEdit.sanear — gancho "P11" em js/bimedit.js, para
 * uma tela sem este motor nunca jogar fora o terreno):
 *   {op:"topossolido", id, pontos?:[{x,z,y}], nome?, espessura?, material?,
 *    passoCurvas?, rotularMestras?, origem?:"pontos"|"dxf"|"csv"}
 *   {op:"subregiao", id, topoId?, contorno?:[{x,z}], material?, nome?}
 *   {op:"plataforma", id, topoId?, contorno?:[{x,z}], nivelId?, base?, deslocNivel?, nome?}
 *   {op:"divisa", id, contorno?:[{x,z}], nome?}
 *   {op:"implantacao", id, anguloNorte?, lat?, lon?, elevacao?, local?}
 *   {op:"compTerreno", id, tipoComp?, x?, z?, rotY?, altura?}
 *   {op:"rotuloCurvas", id, topoId?, a?:{x,z}, b?:{x,z}}
 *   id que já existe: o que vier SUBSTITUI o campo; null apaga (volta ao
 *   padrão). mover (dx, dz), apagar e orcar com o id também passam aqui.
 *   Sem lista dentro de lista (a nuvem recusa): ponto é {x, z, y}.
 *
 * O ESTADO: BimEdit.aplicar devolve `terreno` (só quando há op P11 — o estado
 * das ops antigas fica byte a byte igual): { topos, subregioes, plataformas,
 * divisas, componentes, rotulos, implantacao }.
 *
 * Teste: node tools/test-bimterreno.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function temChave(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  /* ----------------------------------------------------------- limites */
  var LIM = { pontos: 5000, contorno: 500, coord: 1e6, cota: 1e4, espessura: { min: 0.05, max: 100 }, passo: { min: 0.05, max: 50 },
              desloc: 1000, niveisCurva: 400, texto: 80 };
  var ESPESSURA_PADRAO = 1.0;   /* RA: o tipo traz a dele; a coleta P11 grava a do template */
  var PASSO_PADRAO = 1.0;       /* curvas de 1 em 1 m, mestra a cada 5 */
  var MESTRA_CADA = 5;
  var MATERIAL_PADRAO = "Terra";
  /* componentes de terreno (nomes da RA; medidas de desenho, não de catálogo) */
  var TIPOS_COMP = {
    arvore: { rotulo: "Árvore", altura: 5.0, raio: 2.0 }, arbusto: { rotulo: "Arbusto", altura: 1.2, raio: 0.7 },
    poste: { rotulo: "Poste de iluminação", altura: 6.0, raio: 0.1 }, banco: { rotulo: "Banco", altura: 0.45, raio: 0.9 },
    carro: { rotulo: "Carro (vaga)", altura: 1.5, raio: 2.3 }, lixeira: { rotulo: "Lixeira", altura: 0.9, raio: 0.25 }
  };
  /* MOVIMENTO DE TERRA no SINAPI — a MESMA regra que o mapa
     (tools/gerar-sinapi-familias-mapa.js) usa para separar "movimento de
     terra: sai do terreno, não de uma família". Aqui ela só FILTRA a base
     carregada para a tela oferecer candidatos; nada é escolhido sozinho. */
  var MOV_TERRA = {
    corte: { rotulo: "Corte (escavação)", unidade: "M3", grupos: ["Escavação Horizontal", "Escavação Vertical a Céu Aberto", "Escavação em Material de 3ª Categoria"], re: /^ESCAVA[ÇC][ÃA]O\b/ },
    aterro: { rotulo: "Aterro (preenchimento)", unidade: "M3", grupos: ["Aterro e Reaterro de Valas"], re: /^(ATERRO|REATERRO)/ }
  };

  /* ============================================================ GEOMETRIA */
  function pt(p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : (p ? [Number(p.x), Number(p.z)] : [NaN, NaN]); }
  function areaSinal(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function perim(P, fechado) {
    var s = 0, n = P.length;
    for (var i = 0; i < (fechado === false ? n - 1 : n); i++) { var a = P[i], b = P[(i + 1) % n]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }
    return s;
  }
  function ccw(P) { return areaSinal(P) < 0 ? P.slice().reverse() : P.slice(); }
  /* área e centroide (assinados; mesmo sentido do polígono) */
  function momentos(Q) {
    var a = 0, cx = 0, cz = 0;
    for (var i = 0, n = Q.length; i < n; i++) {
      var p = Q[i], q = Q[(i + 1) % n], k = p[0] * q[1] - q[0] * p[1];
      a += k; cx += (p[0] + q[0]) * k; cz += (p[1] + q[1]) * k;
    }
    a /= 2;
    if (Math.abs(a) < 1e-14) return { a: 0, cx: 0, cz: 0 };
    return { a: a, cx: cx / (6 * a), cz: cz / (6 * a) };
  }
  /* SUTHERLAND–HODGMAN: o polígono `sub` (qualquer, sentido anti-horário)
     recortado pelo semiplano f(p) ≥ 0 (f linear). Num polígono côncavo a
     saída pode ter arestas de ida e volta sobre a reta de corte: elas se
     anulam na área e no centroide (Green), que é tudo o que se usa aqui. */
  function cortarSemiplano(sub, f) {
    var out = [], n = sub.length; if (!n) return out;
    var S = sub[n - 1], fS = f(S);
    for (var i = 0; i < n; i++) {
      var E = sub[i], fE = f(E);
      if (fE >= 0) {
        if (fS < 0) { var t = fS / (fS - fE); out.push([S[0] + t * (E[0] - S[0]), S[1] + t * (E[1] - S[1])]); }
        out.push(E);
      } else if (fS >= 0) { var t2 = fS / (fS - fE); out.push([S[0] + t2 * (E[0] - S[0]), S[1] + t2 * (E[1] - S[1])]); }
      S = E; fS = fE;
    }
    return out;
  }
  /* `sub` ∩ o polígono CONVEXO anti-horário `clip` */
  function cortarConvexo(sub, clip) {
    var out = sub;
    for (var i = 0; i < clip.length && out.length; i++) {
      var a = clip[i], b = clip[(i + 1) % clip.length], ex = b[0] - a[0], ez = b[1] - a[1];
      out = cortarSemiplano(out, function (p) { return ex * (p[1] - a[1]) - ez * (p[0] - a[0]); });
    }
    return out;
  }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = a[0] + t * dx - p[0], qz = a[1] + t * dz - p[1];
    return Math.sqrt(qx * qx + qz * qz);
  }
  function dentro(p, P) {
    var x = p[0], z = p[1], d = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (distSeg(p, a, b) < 1e-9) return true;
      if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) d = !d;
    }
    return d;
  }
  function segCruza(a, b, c, d) {
    function o(p, q, r) { var v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return Math.abs(v) < 1e-12 ? 0 : (v > 0 ? 1 : -1); }
    var o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  }
  /* contorno simples: 3+ pontos finitos, sem ponto repetido seguido, área,
     sem lado cruzando outro. → { ok, pts (anti-horário), area } | { ok:false, motivo } */
  function validarContorno(l) {
    var P = arr(l).map(pt);
    if (P.length < 3) return { ok: false, motivo: "O contorno precisa de 3 pontos ou mais." };
    if (P.length > LIM.contorno) return { ok: false, motivo: "Contorno com pontos demais (máximo " + LIM.contorno + ")." };
    if (P.some(function (q) { return !fin(q[0]) || !fin(q[1]) || Math.abs(q[0]) > LIM.coord || Math.abs(q[1]) > LIM.coord; })) return { ok: false, motivo: "Ponto inválido no contorno." };
    var Q = [];
    P.forEach(function (q) { var u = Q[Q.length - 1]; if (!u || Math.abs(u[0] - q[0]) > 1e-6 || Math.abs(u[1] - q[1]) > 1e-6) Q.push(q); });
    if (Q.length > 3 && Math.abs(Q[0][0] - Q[Q.length - 1][0]) < 1e-6 && Math.abs(Q[0][1] - Q[Q.length - 1][1]) < 1e-6) Q.pop();
    if (Q.length < 3) return { ok: false, motivo: "O contorno precisa de 3 pontos diferentes." };
    var A = Math.abs(areaSinal(Q));
    if (!(A > 1e-6)) return { ok: false, motivo: "O contorno não tem área (pontos alinhados)." };
    for (var i = 0; i < Q.length; i++) for (var j = i + 1; j < Q.length; j++) {
      if (j === i + 1 || (i === 0 && j === Q.length - 1)) continue;
      if (segCruza(Q[i], Q[(i + 1) % Q.length], Q[j], Q[(j + 1) % Q.length])) return { ok: false, motivo: "O contorno se cruza: desenhe sem lados cruzados." };
    }
    return { ok: true, pts: ccw(Q), area: A };
  }

  /* ========================================================== DELAUNAY
   * Dois passos, os dois puros e sem biblioteca:
   *   1. VARREDURA: os pontos em ordem lexicográfica (x, depois z); cada
   *      ponto novo está FORA do casco atual e se liga a todo lado do casco
   *      que ele enxerga (estritamente). Dá sempre uma triangulação válida
   *      (sem sobreposição, cobrindo o casco convexo inteiro) — inclusive com
   *      pontos de levantamento EXATAMENTE alinhados na borda, que é onde o
   *      Bowyer–Watson com supertriângulo falha (provado no teste: com pontos
   *      alinhados na borda ele sobrepunha triângulos e perdia o casco).
   *   2. LAWSON: troca a diagonal de todo par de triângulos cujo vértice
   *      oposto cai DENTRO do círculo circunscrito do outro, até nenhum cair.
   *      O resultado é a triangulação de DELAUNAY (círculo vazio). Pontos
   *      cocirculares (a grade) ficam com a diagonal que já tinham.
   * Coordenadas normalizadas (centro da caixa, escala do maior lado) para os
   * predicados não perderem dígito.
   * P: [[x, z], …] SEM repetidos. → [[i, j, k], …] anti-horários. */
  function delaunay(P) {
    var n = P.length; if (n < 3) return [];
    var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    P.forEach(function (q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; });
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = Math.max(x1 - x0, z1 - z0) || 1;
    var Q = new Array(n);
    for (var i = 0; i < n; i++) Q[i] = [(P[i][0] - cx) / d, (P[i][1] - cz) / d];
    var EPS = 1e-14;
    var ordem = []; for (i = 0; i < n; i++) ordem.push(i);
    ordem.sort(function (a, b) { return Q[a][0] - Q[b][0] || Q[a][1] - Q[b][1]; });
    /* o começo alinhado: a cadeia até o 1º ponto fora da reta */
    var k = 2;
    while (k < n && Math.abs(orient(Q, ordem[0], ordem[1], ordem[k])) <= EPS) k++;
    if (k >= n) return [];
    var T = [], cadeia = ordem.slice(0, k), pk = ordem[k], lado = orient(Q, ordem[0], ordem[1], pk);
    for (i = 0; i + 1 < cadeia.length; i++) T.push(lado > 0 ? [cadeia[i], cadeia[i + 1], pk] : [cadeia[i + 1], cadeia[i], pk]);
    /* o casco, anti-horário */
    var H = lado > 0 ? cadeia.concat([pk]) : [cadeia[0], pk].concat(cadeia.slice(1).reverse());
    for (var j = k + 1; j < n; j++) {
      var p = ordem[j], m = H.length, vis = [];
      for (i = 0; i < m; i++) vis.push(orient(Q, H[i], H[(i + 1) % m], p) < -EPS);
      /* o começo da corrida de lados visíveis (cíclica) */
      var s = -1;
      for (i = 0; i < m; i++) if (vis[i] && !vis[(i - 1 + m) % m]) { s = i; break; }
      if (s < 0) { if (vis[0]) s = 0; else continue; }   /* (não acontece: o ponto novo está fora do casco) */
      var e = s, c = 0;
      while (vis[e % m] && c < m) { var a = H[e % m], b = H[(e + 1) % m]; T.push([b, a, p]); e++; c++; }
      /* o casco novo: H[s] → p → H[e] (os de dentro saem) */
      var novo = [], ini = s % m, fim = e % m;
      novo.push(H[ini]); novo.push(p);
      for (i = fim; i !== ini; i = (i + 1) % m) novo.push(H[i]);
      H = novo;
    }
    legalizar(Q, T);
    var out = [];
    T.forEach(function (t) {
      var a = t[0], b = t[1], c = t[2];
      var s2 = (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]);
      if (Math.abs(s2) < 1e-12) return;   /* triângulo chato (pontos alinhados) */
      out.push(s2 > 0 ? [a, b, c] : [a, c, b]);
    });
    return out;
  }
  function orient(P, a, b, c) { return (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]); }
  /* d DENTRO do círculo de (a, b, c) anti-horário (> 0) */
  function noCirculo(P, a, b, c, d) {
    var ax = P[a][0] - P[d][0], ay = P[a][1] - P[d][1], bx = P[b][0] - P[d][0], by = P[b][1] - P[d][1], cx = P[c][0] - P[d][0], cy = P[c][1] - P[d][1];
    return (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
  }
  /* LAWSON: troca a diagonal enquanto o vértice oposto cair dentro do círculo.
     Semiarestas (como o Delaunator): t = (v0, v1, v2) nas posições 3t..3t+2; a
     semiaresta a vai de tri[a] para tri[seg(a)]; he[a] = a semiaresta oposta
     (-1 na borda). Uma pilha de semiarestas a conferir. */
  function legalizar(P, T) {
    var nt = T.length, tri = new Array(3 * nt), he = new Array(3 * nt), mapa = {}, nP = P.length;
    function seg(a) { return a % 3 === 2 ? a - 2 : a + 1; }
    function ant(a) { return a % 3 === 0 ? a + 2 : a - 1; }
    for (var t = 0; t < nt; t++) {
      var v = T[t]; if (orient(P, v[0], v[1], v[2]) < 0) v = [v[0], v[2], v[1]];
      tri[3 * t] = v[0]; tri[3 * t + 1] = v[1]; tri[3 * t + 2] = v[2];
    }
    for (var x = 0; x < 3 * nt; x++) {
      he[x] = -1;
      var u = tri[x], w = tri[seg(x)], k = u < w ? u * nP + w : w * nP + u, o = mapa[k];
      if (o === undefined) mapa[k] = x; else { he[x] = o; he[o] = x; }
    }
    function liga(a, b) { he[a] = b; if (b !== -1) he[b] = a; }
    var pilha = []; for (x = 0; x < 3 * nt; x++) pilha.push(x);
    var guarda = 0, LIM_T = 400 * nt + 1000;
    while (pilha.length && guarda++ < LIM_T) {
      var a = pilha.pop(), b = he[a]; if (b === -1) continue;
      var A = tri[a], B = tri[seg(a)], c = tri[ant(a)], d = tri[ant(b)];
      if (!(noCirculo(P, A, B, c, d) > 1e-13)) continue;
      if (!(orient(P, A, d, c) > EPS_FLIP && orient(P, d, B, c) > EPS_FLIP)) continue;   /* quadrilátero côncavo: não troca */
      var na = seg(a), nb = seg(b), pb = ant(b), pa = ant(a);
      var oAd = he[nb], oDB = he[pb], oBc = he[na];
      tri[na] = d; tri[b] = d; tri[nb] = B; tri[pb] = c;
      liga(a, oAd); liga(na, pb); liga(b, oDB); liga(nb, oBc);
      pilha.push(a, b, nb, pa);
    }
    for (t = 0; t < nt; t++) T[t] = [tri[3 * t], tri[3 * t + 1], tri[3 * t + 2]];
  }
  var EPS_FLIP = 1e-15;
  /* casco convexo (cadeia monótona) — confere se a triangulação cobriu tudo */
  function casco(P) {
    var Q = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (Q.length < 3) return Q;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], hi = [];
    Q.forEach(function (p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for (var i = Q.length - 1; i >= 0; i--) { var p = Q[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }

  /* ======================================================== SUPERFÍCIE
   * pontos [{x, z, y}] → a superfície triangulada:
   * { ok, P:[[x,z,y]], T:[[i,j,k]], borda:[[x,z]] (laço da borda, anti-
   *   horário), areaProjetada, areaSuperficie, zmin, zmax, avisos, _g }
   * Pontos repetidos na planta (1 mm) ficam com o primeiro (aviso). */
  function superficie(pontos) {
    var vistos = {}, P = [], rep = 0, ruins = 0;
    arr(pontos).forEach(function (q) {
      var x = Number(q && (q.x != null ? q.x : q[0])), z = Number(q && (q.z != null ? q.z : q[1])), y = Number(q && (q.y != null ? q.y : q[2]));
      if (!fin(x) || !fin(z) || !fin(y)) { ruins++; return; }
      var k = Math.round(x * 1000) + "|" + Math.round(z * 1000);
      if (vistos[k]) { rep++; return; }
      vistos[k] = 1; P.push([x, z, y]);
    });
    var avisos = [];
    if (rep) avisos.push(rep + " ponto(s) repetido(s) na planta (mesmo x, z): ficou o primeiro.");
    if (ruins) avisos.push(ruins + " ponto(s) sem coordenada ou sem cota foram ignorados.");
    if (P.length < 3) return { ok: false, motivo: "O terreno precisa de 3 pontos cotados ou mais (distintos na planta).", P: P, T: [], avisos: avisos };
    var T = delaunay(P.map(function (q) { return [q[0], q[1]]; }));
    if (!T.length) return { ok: false, motivo: "Os pontos estão alinhados: não formam terreno.", P: P, T: [], avisos: avisos };
    var aP = 0, aS = 0, zmin = Infinity, zmax = -Infinity;
    P.forEach(function (q) { if (q[2] < zmin) zmin = q[2]; if (q[2] > zmax) zmax = q[2]; });
    T.forEach(function (t) {
      var a = P[t[0]], b = P[t[1]], c = P[t[2]];
      var ux = b[0] - a[0], uz = b[1] - a[1], uy = b[2] - a[2], vx = c[0] - a[0], vz = c[1] - a[1], vy = c[2] - a[2];
      aP += Math.abs(ux * vz - uz * vx) / 2;
      /* normal (x, y, z): u × v com u, v em (x, y, z) */
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      aS += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
    });
    var H = casco(P.map(function (q) { return [q[0], q[1]]; })), aH = Math.abs(areaSinal(H));
    if (aH > 0 && Math.abs(aH - aP) > 1e-6 * Math.max(1, aH)) avisos.push("A triangulação cobriu " + r4(aP) + " m² do casco de " + r4(aH) + " m² (pontos quase alinhados na borda).");
    var S = { ok: true, P: P, T: T, areaProjetada: aP, areaSuperficie: aS, zmin: zmin, zmax: zmax, avisos: avisos };
    S.borda = bordaDe(S);
    grade(S);
    return S;
  }
  /* o laço da borda: arestas usadas por UM triângulo, encadeadas */
  function bordaDe(S) {
    var uso = {}, prox = {};
    S.T.forEach(function (t) { for (var e = 0; e < 3; e++) { var a = t[e], b = t[(e + 1) % 3], ch = a < b ? a + "_" + b : b + "_" + a; uso[ch] = (uso[ch] || 0) + 1; } });
    S.T.forEach(function (t) { for (var e = 0; e < 3; e++) { var a = t[e], b = t[(e + 1) % 3], ch = a < b ? a + "_" + b : b + "_" + a; if (uso[ch] === 1) prox[a] = b; } });
    var ks = Object.keys(prox); if (!ks.length) return [];
    var ini = Number(ks[0]), laco = [ini], v = prox[ini], guarda = 0;
    while (v !== ini && v != null && guarda++ < 100000) { laco.push(v); v = prox[v]; }
    return laco;
  }
  /* grade de busca: cada célula guarda os triângulos que a tocam */
  function grade(S) {
    var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    S.P.forEach(function (q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; });
    var nc = Math.max(1, Math.round(Math.sqrt(S.T.length / 2))), cx = (x1 - x0) / nc || 1, cz = (z1 - z0) / nc || 1, g = {};
    S.T.forEach(function (t, k) {
      var a = S.P[t[0]], b = S.P[t[1]], c = S.P[t[2]];
      var i0 = Math.floor((Math.min(a[0], b[0], c[0]) - x0) / cx), i1 = Math.floor((Math.max(a[0], b[0], c[0]) - x0) / cx);
      var j0 = Math.floor((Math.min(a[1], b[1], c[1]) - z0) / cz), j1 = Math.floor((Math.max(a[1], b[1], c[1]) - z0) / cz);
      for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) { var ch = i + "|" + j; (g[ch] = g[ch] || []).push(k); }
    });
    /* não enumerável: não vai para JSON, op nem nuvem */
    Object.defineProperty(S, "_g", { value: { g: g, x0: x0, z0: z0, cx: cx, cz: cz, caixa: [x0, z0, x1, z1] }, enumerable: false, configurable: true });
  }
  /* o plano do triângulo: y = a + b·x + c·z */
  function plano(S, k) {
    var t = S.T[k], A = S.P[t[0]], B = S.P[t[1]], C = S.P[t[2]];
    var D = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
    var b = ((B[2] - A[2]) * (C[1] - A[1]) - (C[2] - A[2]) * (B[1] - A[1])) / D;
    var c = ((C[2] - A[2]) * (B[0] - A[0]) - (B[2] - A[2]) * (C[0] - A[0])) / D;
    return { a: A[2] - b * A[0] - c * A[1], b: b, c: c };
  }
  /* a cota do terreno no ponto (x, z); fora dos triângulos = null (nada é extrapolado) */
  function cota(S, x, z) {
    if (!S || !S.ok || !S._g) return null;
    var G = S._g, ks = G.g[Math.floor((x - G.x0) / G.cx) + "|" + Math.floor((z - G.z0) / G.cz)];
    if (!ks) {
      /* na borda direita/de baixo da caixa a célula é a última */
      var i = Math.min(Math.floor((x - G.x0) / G.cx), Math.round((G.caixa[2] - G.x0) / G.cx) - 1), j = Math.min(Math.floor((z - G.z0) / G.cz), Math.round((G.caixa[3] - G.z0) / G.cz) - 1);
      ks = G.g[i + "|" + j]; if (!ks) return null;
    }
    for (var n = 0; n < ks.length; n++) {
      var t = S.T[ks[n]], a = S.P[t[0]], b = S.P[t[1]], c = S.P[t[2]];
      var d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-14) continue;
      var l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d, l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * a[2] + l2 * b[2] + l3 * c[2];
    }
    return null;
  }
  /* triângulos cuja caixa encosta na caixa dada */
  function triangulosNaCaixa(S, bx) {
    var out = [];
    S.T.forEach(function (t, k) {
      var a = S.P[t[0]], b = S.P[t[1]], c = S.P[t[2]];
      if (Math.max(a[0], b[0], c[0]) < bx[0] || Math.min(a[0], b[0], c[0]) > bx[2] || Math.max(a[1], b[1], c[1]) < bx[1] || Math.min(a[1], b[1], c[1]) > bx[3]) return;
      out.push(k);
    });
    return out;
  }
  function caixaDe(P) {
    var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    P.forEach(function (q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; });
    return [x0, z0, x1, z1];
  }

  /* ===================================================== CORTE E ATERRO
   * O MÉTODO está no cabeçalho (prismas sobre a triangulação, integrados
   * exatamente). S = superfície; contorno [[x,z]] anti-horário (validado);
   * h = cota da plataforma. → { corte, aterro, liquido, areaCorte,
   * areaAterro, areaDentro, areaFora, areaProjetada, triangulos } */
  function corteAterro(S, contorno, h) {
    var P = ccw(contorno.map(pt)), AP = Math.abs(areaSinal(P));
    var r = { corte: 0, aterro: 0, liquido: 0, areaCorte: 0, areaAterro: 0, areaDentro: 0, areaFora: AP, areaProjetada: AP, triangulos: 0 };
    if (!S || !S.ok) return r;
    triangulosNaCaixa(S, caixaDe(P)).forEach(function (k) {
      var t = S.T[k], T2 = [S.P[t[0]], S.P[t[1]], S.P[t[2]]].map(function (q) { return [q[0], q[1]]; });
      var Q = cortarConvexo(P, T2); if (Q.length < 3) return;
      var mQ = momentos(Q); if (!(mQ.a > 1e-12)) return;
      var pl = plano(S, k);
      function d(p) { return pl.a + pl.b * p[0] + pl.c * p[1] - h; }
      var Qp = cortarSemiplano(Q, d), Qn = cortarSemiplano(Q, function (p) { return -d(p); });
      var mp = Qp.length >= 3 ? momentos(Qp) : { a: 0 }, mn = Qn.length >= 3 ? momentos(Qn) : { a: 0 };
      if (mp.a > 0) { r.corte += mp.a * Math.max(0, d([mp.cx, mp.cz])); r.areaCorte += mp.a; }
      if (mn.a > 0) { r.aterro += mn.a * Math.max(0, -d([mn.cx, mn.cz])); r.areaAterro += mn.a; }
      r.areaDentro += mQ.a; r.triangulos++;
    });
    r.areaFora = Math.max(0, AP - r.areaDentro); if (r.areaFora < 1e-9 * Math.max(1, AP)) r.areaFora = 0;
    r.liquido = r.corte - r.aterro;
    return r;
  }
  /* área do terreno dentro de um contorno: projetada e a da SUPERFÍCIE (inclinada) */
  function areaRegiao(S, contorno) {
    var P = ccw(contorno.map(pt)), AP = Math.abs(areaSinal(P)), proj = 0, sup = 0;
    if (S && S.ok) triangulosNaCaixa(S, caixaDe(P)).forEach(function (k) {
      var t = S.T[k], T2 = [S.P[t[0]], S.P[t[1]], S.P[t[2]]].map(function (q) { return [q[0], q[1]]; });
      var Q = cortarConvexo(P, T2); if (Q.length < 3) return;
      var a = momentos(Q).a; if (!(a > 0)) return;
      var pl = plano(S, k);
      proj += a; sup += a * Math.sqrt(1 + pl.b * pl.b + pl.c * pl.c);
    });
    return { projetada: proj, superficie: sup, fora: Math.max(0, AP - proj), contorno: AP };
  }
  /* volume do topossólido com fundo plano em zb: Σ área × (cota média − zb) */
  function volumeAte(S, zb) {
    var v = 0;
    S.T.forEach(function (t) {
      var a = S.P[t[0]], b = S.P[t[1]], c = S.P[t[2]];
      v += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2 * ((a[2] + b[2] + c[2]) / 3 - zb);
    });
    return v;
  }

  /* ===================================================== CURVAS DE NÍVEL
   * por triângulo (o nível desloca 1e-9 m: vértice exatamente na cota não
   * some), emendadas em polilinhas. → [{ y, mestra, pts:[[x,z]], fechada }] */
  function curvas(S, passo, mestraCada) {
    passo = num(passo, PASSO_PADRAO); if (!(passo >= LIM.passo.min)) passo = PASSO_PADRAO;
    mestraCada = mestraCada || MESTRA_CADA;
    var out = []; if (!S || !S.ok) return out;
    var n0 = Math.ceil(S.zmin / passo - 1e-9), n1 = Math.floor(S.zmax / passo + 1e-9);
    if (n1 - n0 + 1 > LIM.niveisCurva) { n0 = n1 - LIM.niveisCurva + 1; }
    for (var nv = n0; nv <= n1; nv++) {
      var y = nv * passo, yy = y + 1e-9, segs = [];
      S.T.forEach(function (t) {
        var v = [S.P[t[0]], S.P[t[1]], S.P[t[2]]], cr = [];
        for (var k = 0; k < 3; k++) {
          var a = v[k], b = v[(k + 1) % 3];
          if ((a[2] - yy) * (b[2] - yy) < 0) { var u = (yy - a[2]) / (b[2] - a[2]); cr.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]); }
        }
        /* vértice exatamente na cota deixa um pedaço de comprimento ~0: fora (a curva segue pelo vizinho) */
        if (cr.length === 2 && Math.abs(cr[0][0] - cr[1][0]) + Math.abs(cr[0][1] - cr[1][1]) > 1e-7) segs.push(cr);
      });
      emendar(segs).forEach(function (l) { out.push({ y: r6(y), mestra: nv % mestraCada === 0, pts: l.pts, fechada: l.fechada }); });
    }
    return out;
  }
  function emendar(segs) {
    function ch(p) { return Math.round(p[0] * 1e5) + "|" + Math.round(p[1] * 1e5); }
    var por = {}, usado = [];
    segs.forEach(function (s, i) { [0, 1].forEach(function (e) { var k = ch(s[e]); (por[k] = por[k] || []).push(i); }); });
    function proximo(k, nao) { var l = por[k] || []; for (var i = 0; i < l.length; i++) if (!usado[l[i]] && l[i] !== nao) return l[i]; return -1; }
    var out = [];
    segs.forEach(function (s, i) {
      if (usado[i]) return;
      usado[i] = true;
      var pts = [s[0], s[1]];
      /* para frente */
      var fim = s[1], j;
      while ((j = proximo(ch(fim), -1)) >= 0) { usado[j] = true; var q = segs[j], nxt = ch(q[0]) === ch(fim) ? q[1] : q[0]; pts.push(nxt); fim = nxt; }
      /* para trás */
      var ini = s[0];
      while ((j = proximo(ch(ini), -1)) >= 0) { usado[j] = true; var q2 = segs[j], ant = ch(q2[0]) === ch(ini) ? q2[1] : q2[0]; pts.unshift(ant); ini = ant; }
      var fechada = pts.length > 3 && ch(pts[0]) === ch(pts[pts.length - 1]);
      if (fechada) pts.pop();
      out.push({ pts: pts, fechada: fechada });
    });
    return out;
  }
  function fmtCota(y) { return (Math.round(y * 100) / 100).toFixed(2).replace(".", ","); }
  /* "Rotular curvas de nível": a linha a→b; um rótulo em cada curva que ela cruza */
  function rotularLinha(cs, a, b) {
    var A = pt(a), B = pt(b), out = [];
    cs.forEach(function (c) {
      var P = c.pts, n = P.length, m = c.fechada ? n : n - 1;
      for (var i = 0; i < m; i++) {
        var p = P[i], q = P[(i + 1) % n], den = (B[0] - A[0]) * (q[1] - p[1]) - (B[1] - A[1]) * (q[0] - p[0]);
        if (Math.abs(den) < 1e-14) continue;
        var t = ((p[0] - A[0]) * (q[1] - p[1]) - (p[1] - A[1]) * (q[0] - p[0])) / den, s = ((p[0] - A[0]) * (B[1] - A[1]) - (p[1] - A[1]) * (B[0] - A[0])) / den;
        /* meio aberto [0, 1): a linha que passa num vértice da curva conta UMA vez (o fim da aberta fecha) */
        if (t < 0 || t > 1 || s < 0 || s > 1 || (s >= 1 - 1e-12 && (c.fechada || i < m - 1))) continue;
        out.push({ x: r6(A[0] + t * (B[0] - A[0])), z: r6(A[1] + t * (B[1] - A[1])), y: c.y, texto: fmtCota(c.y), ang: Math.atan2(q[1] - p[1], q[0] - p[0]), mestra: c.mestra });
      }
    });
    return out;
  }
  /* rótulo automático: o meio (pelo comprimento) de cada curva MESTRA */
  function rotulosMestras(cs) {
    var out = [];
    cs.forEach(function (c) {
      if (!c.mestra || c.pts.length < 2) return;
      var P = c.pts, L = perim(P, c.fechada), alvo = L / 2, s = 0;
      for (var i = 0; i < (c.fechada ? P.length : P.length - 1); i++) {
        var a = P[i], b = P[(i + 1) % P.length], l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
        if (s + l >= alvo && l > 0) { var u = (alvo - s) / l; out.push({ x: r6(a[0] + u * (b[0] - a[0])), z: r6(a[1] + u * (b[1] - a[1])), y: c.y, texto: fmtCota(c.y), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), mestra: true }); return; }
        s += l;
      }
    });
    return out;
  }

  /* ====================================================== IMPORTAÇÃO
   * DXF de levantamento (o resultado do DXF.parse — js/dxf.js com o z) →
   * pontos {x, z, y} da cena: vértices das curvas (e pontos POINT) com cota.
   * opts: layers (lista; vazio = todos os que têm cota), zRef (o 0,00 do
   * projeto é a cota zRef), espacamento (m: põe pontos no meio dos lados
   * longos; 0 = só os vértices), origem {x, y} (subtrai; padrão: com
   * coordenada de UTM, o canto da caixa arredondado ao metro). */
  function dxfParaPontos(res, opts) {
    opts = opts || {};
    var L = arr(opts.layers), filtro = L.length ? function (l) { return L.indexOf(l) >= 0; } : function () { return true; };
    var zRef = num(opts.zRef, 0), esp = num(opts.espacamento, 0), avisos = [];
    var crus = [], semCota = 0, porLayer = {};
    arr(res && res.segmentos).forEach(function (s) {
      if (!filtro(s.layer || "0")) return;
      if (!fin(s.z1) || !fin(s.z2)) { semCota++; return; }
      porLayer[s.layer || "0"] = (porLayer[s.layer || "0"] || 0) + 1;
      crus.push([s.x1, s.y1, s.z1]); crus.push([s.x2, s.y2, s.z2]);
      if (esp > 0) {
        var Lg = Math.sqrt((s.x2 - s.x1) * (s.x2 - s.x1) + (s.y2 - s.y1) * (s.y2 - s.y1)), k = Math.floor(Lg / esp);
        for (var i = 1; i < k; i++) { var u = i / k; crus.push([s.x1 + u * (s.x2 - s.x1), s.y1 + u * (s.y2 - s.y1), s.z1 + u * (s.z2 - s.z1)]); }
      }
    });
    arr(res && res.pontos).forEach(function (p) { if (!filtro(p.layer || "0")) return; if (!fin(p.z)) { semCota++; return; } crus.push([p.x, p.y, p.z]); porLayer[p.layer || "0"] = (porLayer[p.layer || "0"] || 0) + 1; });
    if (semCota) avisos.push(semCota + " linha(s)/ponto(s) do DXF sem cota (z) ficaram de fora — o terreno usa só o que tem z.");
    var orig = opts.origem && fin(Number(opts.origem.x)) && fin(Number(opts.origem.y)) ? { x: Number(opts.origem.x), y: Number(opts.origem.y) } : null;
    if (!orig && crus.length) {
      var bx = caixaDe(crus);
      if (Math.max(Math.abs(bx[0]), Math.abs(bx[1]), Math.abs(bx[2]), Math.abs(bx[3])) > 1e5) {
        orig = { x: Math.floor(bx[0]), y: Math.floor(bx[1]) };
        avisos.push("Coordenadas de levantamento (UTM?): a origem do modelo foi para X " + orig.x + ", Y " + orig.y + " do DXF.");
      }
    }
    var ox = orig ? orig.x : 0, oy = orig ? orig.y : 0;
    var pts = crus.map(function (q) { return { x: r6(q[0] - ox), z: r6(-(q[1] - oy)), y: r6(q[2] - zRef) }; });
    var unico = rarear(semRepetidos(pts), LIM.pontos);
    if (unico.rareados) avisos.push("Pontos demais: o terreno ficou com " + unico.pts.length + " (1 por célula de uma grade), o teto do modelador.");
    return { pontos: unico.pts, origem: orig, layers: porLayer, semCota: semCota, avisos: avisos };
  }
  function semRepetidos(pts) {
    var v = {}, out = [];
    pts.forEach(function (p) { var k = Math.round(p.x * 100) + "|" + Math.round(p.z * 100); if (!v[k]) { v[k] = 1; out.push(p); } });
    return out;
  }
  function rarear(pts, max) {
    if (pts.length <= max) return { pts: pts, rareados: false };
    var bx = caixaDe(pts.map(function (p) { return [p.x, p.z]; })), lado = Math.sqrt((bx[2] - bx[0]) * (bx[3] - bx[1]) / max) || 1, v = {}, out = [];
    while (true) {
      v = {}; out = [];
      pts.forEach(function (p) { var k = Math.floor((p.x - bx[0]) / lado) + "|" + Math.floor((p.z - bx[1]) / lado); if (!v[k]) { v[k] = 1; out.push(p); } });
      if (out.length <= max) break;
      lado *= 1.1;
    }
    return { pts: out, rareados: true };
  }
  /* CSV/TXT de pontos (PNEZD, NEZ…) pelo leitor do relevo do içamento (js/icarrelevo.js) */
  function csvParaPontos(texto, opts) {
    opts = opts || {};
    var IR = dep("IcarRelevo", "./icarrelevo.js");
    if (!IR || !IR.lerPontos) return { ok: false, motivo: "O leitor de levantamento (js/icarrelevo.js) não carregou." };
    var l = IR.lerPontos(texto, opts.ordem);
    if (!l.ok) return { ok: false, motivo: l.motivo };
    var crus = l.pontos.map(function (q) { return [q.e, q.n, q.z]; });
    var r = dxfParaPontos({ pontos: crus.map(function (q) { return { x: q[0], y: q[1], z: q[2], layer: "0" }; }) }, { zRef: opts.zRef, origem: opts.origem });
    r.ok = r.pontos.length >= 3; r.ordem = l.ordem; if (l.ignoradas) r.avisos.push(l.ignoradas + " linha(s) do arquivo não eram ponto (P N E Z).");
    if (!r.ok) r.motivo = "Menos de 3 pontos legíveis.";
    return r;
  }

  /* ===================================================== IMPLANTAÇÃO */
  /* azimute (graus, a partir do NORTE VERDADEIRO, horário) do vetor (dx, dz)
     da cena. anguloNorte: o norte verdadeiro girado a partir do norte do
     projeto (−z), anti-horário (convenção do js/icargeo.js). */
  function azimute(dx, dz, anguloNorte) {
    var azProj = Math.atan2(dx, -dz) * 180 / Math.PI;   /* horário a partir do −z */
    var a = azProj + num(anguloNorte, 0);
    a = a % 360; if (a < 0) a += 360;
    return a;
  }
  function dms(g, casas) {
    var s = g < 0 ? -1 : 1; g = Math.abs(g);
    var d = Math.floor(g), mf = (g - d) * 60, m = Math.floor(mf), sec = (mf - m) * 60;
    sec = Math.round(sec * Math.pow(10, casas || 0)) / Math.pow(10, casas || 0);
    if (sec >= 60) { sec = 0; m++; } if (m >= 60) { m = 0; d++; }
    return { s: s, d: d, m: m, seg: sec };
  }
  /* rumo (quadrante): N 45°30'12" E */
  function rumo(az) {
    var q, ang;
    if (az <= 90) { q = ["N", "E"]; ang = az; } else if (az <= 180) { q = ["S", "E"]; ang = 180 - az; }
    else if (az <= 270) { q = ["S", "W"]; ang = az - 180; } else { q = ["N", "W"]; ang = 360 - az; }
    var x = dms(ang, 0);
    return q[0] + " " + x.d + "°" + (x.m < 10 ? "0" : "") + x.m + "'" + (x.seg < 10 ? "0" : "") + x.seg + "\" " + q[1];
  }
  /* a linha de propriedade: área, perímetro e a tabela (lado a lado) */
  function divisaCalc(contorno, anguloNorte) {
    var v = validarContorno(contorno);
    if (!v.ok) return { ok: false, motivo: v.motivo };
    var P = v.pts, segs = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz), az = azimute(dx, dz, anguloNorte);
      segs.push({ de: i + 1, para: (i + 1) % P.length + 1, distancia: r4(L), azimute: r6(az), rumo: rumo(az) });
    }
    return { ok: true, contorno: P, area: v.area, perimetro: perim(P), segmentos: segs };
  }

  /* ======================================================== SONDAGEM
   * As camadas do furo mais perto do centroide da plataforma (cotas = boca −
   * profundidade). O corte entre duas cotas e1 < e2 = corte(e1) − corte(e2)
   * (o corte acima de uma cota é a conta da plataforma a essa cota). */
  function sondagemSob(S, contorno, h, sondagem) {
    var SD = dep("Sondagem", "./sondagem.js"), out = { furo: null, camadas: [], avisos: [] };
    if (!S || !S.ok || !sondagem) return out;
    var s = SD && SD.normalizar ? SD.normalizar(sondagem) : sondagem;
    var fs = arr(s.furos).filter(function (f) { return f && f.posicao && fin(f.posicao.x) && fin(f.posicao.y) && fin(f.posicao.zBoca); });
    if (!fs.length) { if (arr(s.furos).length) out.avisos.push("A sondagem não tem a posição dos furos no modelo (x, y, cota da boca): o corte não foi repartido pelas camadas."); return out; }
    var c = momentos(ccw(contorno.map(pt))), gx = c.cx, gz = c.cz, melhor = null, dm = Infinity;
    fs.forEach(function (f) { var dx = f.posicao.x - gx, dz = -f.posicao.y - gz, d2 = dx * dx + dz * dz; if (d2 < dm) { dm = d2; melhor = f; } });
    var f = melhor, boca = f.posicao.zBoca;
    out.furo = { id: f.id, distancia: r4(Math.sqrt(dm)), zBoca: boca, na: fin(f.na) ? r4(boca - f.na) : null };
    var zt = cota(S, f.posicao.x, -f.posicao.y);
    if (zt != null && Math.abs(zt - boca) > 0.3) out.avisos.push("A boca do furo " + f.id + " (" + fmtCota(boca) + ") difere " + fmtCota(Math.abs(zt - boca)) + " m do terreno ali (" + fmtCota(zt) + "): confira a referência de nível da sondagem.");
    var topoCorte = S.zmax, cams = arr(f.camadas);
    cams.forEach(function (cm, ic) {
      /* a 1ª camada vai até o terreno (o corte acima da boca do furo é dela) */
      var eTopo = ic === 0 ? Infinity : boca - cm.de, eBase = boca - cm.ate;
      var e1 = Math.max(h, eBase), e2 = Math.max(h, eTopo);
      if (e2 <= e1 || e1 >= topoCorte) return;
      var v = corteAterro(S, contorno, e1).corte - (e2 === Infinity ? 0 : corteAterro(S, contorno, e2).corte);
      var T = SD && SD.TIPOS ? SD.TIPOS[cm.tipo] : null;
      if (v > 1e-9) out.camadas.push({ tipo: cm.tipo, nome: (T && T.nome) || cm.tipo, descricao: cm.descricao || "", de: cm.de, ate: cm.ate, cotaTopo: r4(boca - cm.de), cotaBase: r4(eBase), volume: v });
    });
    if (cams.length) {
      var fundo = boca - cams[cams.length - 1].ate;
      if (h < fundo) {
        var vb = corteAterro(S, contorno, h).corte - corteAterro(S, contorno, fundo).corte;
        if (vb > 1e-9) { out.camadas.push({ tipo: null, nome: "Abaixo do fim do furo", descricao: "", de: cams[cams.length - 1].ate, ate: null, cotaTopo: r4(fundo), cotaBase: r4(h), volume: vb }); out.avisos.push("Corte abaixo do fim do furo " + f.id + ": " + r4(vb).toString().replace(".", ",") + " m³ sem sondagem."); }
      }
    }
    if (out.furo.na != null && h < out.furo.na) {
      var vNa = corteAterro(S, contorno, h).corte - corteAterro(S, contorno, out.furo.na).corte;
      if (vNa > 1e-6) out.avisos.push("Corte abaixo do nível d'água do furo " + f.id + " (cota " + fmtCota(out.furo.na) + "): " + r4(vNa).toString().replace(".", ",") + " m³ — esgotamento ou rebaixamento é serviço à parte.");
    }
    return out;
  }

  /* ============================================================= OPS */
  var OPS = ["topossolido", "subregiao", "plataforma", "divisa", "implantacao", "compTerreno", "rotuloCurvas"];
  var CAMPOS = {
    topossolido: ["pontos", "nome", "espessura", "material", "passoCurvas", "rotularMestras", "origem"],
    subregiao: ["topoId", "contorno", "material", "nome"],
    plataforma: ["topoId", "contorno", "nivelId", "base", "deslocNivel", "nome"],
    divisa: ["contorno", "nome"],
    implantacao: ["anguloNorte", "lat", "lon", "elevacao", "local"],
    compTerreno: ["tipoComp", "x", "z", "rotY", "altura"],
    rotuloCurvas: ["topoId", "a", "b"]
  };
  /* o que precisa existir para NASCER */
  var OBRIG = { topossolido: ["pontos"], subregiao: ["contorno"], plataforma: ["contorno"], divisa: ["contorno"], implantacao: [], compTerreno: ["x", "z"], rotuloCurvas: ["a", "b"] };
  var TIPO_EL = { topossolido: "topossolido", subregiao: "subregiao", plataforma: "plataforma", divisa: "divisa", implantacao: "implantacao", compTerreno: "compTerreno", rotuloCurvas: "rotuloCurvas" };
  function ehOp(op) { return OPS.indexOf(op) >= 0; }
  function opValida(o) {
    var E = dep("BimEdit", "./bimedit.js");
    if (E && E.opTerrenoValida) return E.opTerrenoValida(o);
    return !!o && ehOp(o.op) && o.id != null;
  }

  /* ---------------------------------------------------------- derivar */
  function mapaNiveis(niveis) {
    var m = {};
    arr(niveis).forEach(function (n) { if (n && n.id != null && n.elevacao != null && n.elevacao !== "" && fin(Number(n.elevacao))) m[String(n.id)] = { elev: Number(n.elevacao), nome: txt(n.nome) }; });
    return m;
  }
  function calcTopo(f) {
    var t = clone(f); t.tipo = "topossolido"; t.ifc = "IFCGEOGRAPHICELEMENT";
    t.espessura = fin(Number(f.espessura)) && f.espessura !== null ? Number(f.espessura) : ESPESSURA_PADRAO;
    t.passoCurvas = fin(Number(f.passoCurvas)) && f.passoCurvas !== null ? Number(f.passoCurvas) : PASSO_PADRAO;
    t.material = txt(f.material) || MATERIAL_PADRAO;
    var S = superficie(f.pontos);
    t.ok = !!S.ok; t.avisos = S.avisos.slice();
    t.nPontos = arr(f.pontos).length;
    if (!S.ok) { t.avisos.unshift(S.motivo); t.areaProjetada = 0; t.areaSuperficie = 0; t.volume = 0; return { el: t, S: S }; }
    t.nTriangulos = S.T.length;
    t.areaProjetada = S.areaProjetada; t.areaSuperficie = S.areaSuperficie;
    t.cotaMin = S.zmin; t.cotaMax = S.zmax; t.cotaFundo = S.zmin - t.espessura;
    t.volume = volumeAte(S, t.cotaFundo);
    var bx = caixaDe(S.P); t.cx = r6((bx[0] + bx[2]) / 2); t.cz = r6((bx[1] + bx[3]) / 2); t.comprimento = r6(bx[2] - bx[0]); t.largura = r6(bx[3] - bx[1]);
    if (!t.avisos.length) delete t.avisos;
    return { el: t, S: S };
  }
  /* o topossólido da peça: o pedido (topoId) ou o que tem o centroide do contorno dentro */
  function hospedeiro(topos, sups, topoId, P) {
    if (topoId != null) { for (var i = 0; i < topos.length; i++) if (String(topos[i].id) === String(topoId)) return i; return -1; }
    var c = momentos(ccw(P)), g = [c.cx, c.cz];
    for (var k = 0; k < topos.length; k++) if (sups[k] && sups[k].ok && cota(sups[k], g[0], g[1]) != null) return k;
    for (k = 0; k < topos.length; k++) if (sups[k] && sups[k].ok) return k;
    return -1;
  }

  var BimTerreno = {
    LIM: LIM, ESPESSURA_PADRAO: ESPESSURA_PADRAO, PASSO_PADRAO: PASSO_PADRAO, MESTRA_CADA: MESTRA_CADA, MATERIAL_PADRAO: MATERIAL_PADRAO,
    TIPOS_COMP: TIPOS_COMP, MOV_TERRA: MOV_TERRA, OPS: OPS, CAMPOS: CAMPOS, OBRIG: OBRIG,
    /* geometria pura */
    delaunay: delaunay, casco: casco, superficie: superficie, cota: cota, plano: plano,
    corteAterro: corteAterro, areaRegiao: areaRegiao, volumeAte: volumeAte,
    curvas: curvas, rotularLinha: rotularLinha, rotulosMestras: rotulosMestras, fmtCota: fmtCota,
    validarContorno: validarContorno, cortarConvexo: cortarConvexo, cortarSemiplano: cortarSemiplano, momentos: momentos, areaSinal: areaSinal,
    dxfParaPontos: dxfParaPontos, csvParaPontos: csvParaPontos,
    azimute: azimute, rumo: rumo, dms: dms, divisaCalc: divisaCalc,
    sondagemSob: sondagemSob,
    ehOp: ehOp, opValida: opValida,

    /* candidatos de composição de movimento de terra na base carregada:
       lista [{codigo, descricao, unidade, grupo}] → os que a regra do mapa
       separa para `medida` ("corte" | "aterro"). Só filtra. */
    candidatos: function (lista, medida) {
      var R = MOV_TERRA[medida]; if (!R) return [];
      return arr(lista).filter(function (c) {
        if (!c || String(c.unidade || "").toUpperCase().replace("³", "3") !== R.unidade) return false;
        return R.grupos.indexOf(c.grupo) >= 0 || R.re.test(String(c.descricao || ""));
      }).map(function (c) { return { codigo: String(c.codigo), descricao: txt(c.descricao), unidade: txt(c.unidade), grupo: txt(c.grupo) }; })
        /* na ordem dos grupos da regra (terraplenagem primeiro: escavação horizontal com trator), depois o código */
        .sort(function (a, b) { var ia = R.grupos.indexOf(a.grupo), ib = R.grupos.indexOf(b.grupo); if (ia < 0) ia = 99; if (ib < 0) ib = 99; return ia - ib || Number(a.codigo) - Number(b.codigo); });
    },

    /* ----------------------------------------------- construtores de op */
    op: function (tipo, id, d) {
      d = d || {};
      if (!ehOp(tipo)) return null;
      var o = { op: tipo, id: id };
      CAMPOS[tipo].forEach(function (k) {
        if (!temChave(d, k) || d[k] === undefined) return;
        var v = d[k];
        if (k === "pontos") v = arr(v).map(function (p) { return { x: r6(Number(p.x != null ? p.x : p[0])), z: r6(Number(p.z != null ? p.z : p[1])), y: r6(Number(p.y != null ? p.y : p[2])) }; });
        else if (k === "contorno") v = arr(v).map(function (p) { var q = pt(p); return { x: r6(q[0]), z: r6(q[1]) }; });
        else if (k === "a" || k === "b") { var q = pt(v); v = { x: r6(q[0]), z: r6(q[1]) }; }
        else if (v !== null && typeof v === "number") v = r6(v);
        o[k] = v;
      });
      return opValida(o) ? o : null;
    },

    /* ---------------------------------------------- ganchos do replay
     * Registrados no BimEdit.estender (o mesmo das fases B3): aplicar(o, ctx)
     * → true se a op é deste motor e valeu; fim(ctx, saida) publica
     * saida.terreno DEPOIS das paredes (não depende delas). */
    aplicarOp: function (o, ctx) {
      if (!o || !ctx) return false;
      var X = ctx.p11;
      if (ehOp(o.op)) {
        if (!opValida(o)) return false;
        X = ctx.p11 || (ctx.p11 = { el: {}, ordem: [] });
        var f = X.el[o.id], novo = !f;
        if (f && f.tipo !== TIPO_EL[o.op]) return false;   /* o id é de outra coisa */
        if (novo && OBRIG[o.op].some(function (k) { return o[k] == null; })) return false;
        if (novo) { f = X.el[o.id] = { id: o.id, tipo: TIPO_EL[o.op] }; X.ordem.push(o.id); }
        CAMPOS[o.op].forEach(function (k) {
          if (!temChave(o, k)) return;
          if (o[k] === null) { if (OBRIG[o.op].indexOf(k) < 0) delete f[k]; return; }
          f[k] = clone(o[k]);
        });
        return true;
      }
      if (!X || !X.el[o.id]) return false;
      var e = X.el[o.id];
      if (o.op === "apagar") { delete X.el[o.id]; X.ordem.splice(X.ordem.indexOf(o.id), 1); return true; }
      if (o.op === "orcar") { var E = dep("BimEdit", "./bimedit.js"); e.servicos = E && E.limparServicos ? E.limparServicos(o.servicos) : []; return true; }
      if (o.op === "mover") {
        var dx = num(o.dx, NaN), dz = num(o.dz, NaN);
        if (!fin(dx) && !fin(dz)) {
          /* o novo centro (cx, cz), como o mover das caixas */
          if (!(fin(Number(o.cx)) && fin(Number(o.cz)))) return false;
          var c0 = BimTerreno.centro(e); if (!c0) return false;
          dx = Number(o.cx) - c0[0]; dz = Number(o.cz) - c0[1];
        }
        dx = fin(dx) ? dx : 0; dz = fin(dz) ? dz : 0;
        function mv(p) { return { x: r6(p.x + dx), z: r6(p.z + dz) }; }
        if (e.pontos) e.pontos = e.pontos.map(function (p) { return { x: r6(p.x + dx), z: r6(p.z + dz), y: p.y }; });
        if (e.contorno) e.contorno = e.contorno.map(mv);
        if (e.a) e.a = mv(e.a); if (e.b) e.b = mv(e.b);
        if (fin(e.x)) e.x = r6(e.x + dx); if (fin(e.z)) e.z = r6(e.z + dz);
        return true;
      }
      if (o.op === "marcar" || o.op === "ajustarTipo") return false;   /* o registro (js/bimparam.js) trata */
      return false;
    },
    /* o centro de uma fonte (caixa dos pontos/contorno, ou o ponto) */
    centro: function (e) {
      var L = e.pontos ? e.pontos.map(function (p) { return [p.x, p.z]; }) : (e.contorno ? e.contorno.map(pt) : (e.a && e.b ? [pt(e.a), pt(e.b)] : (fin(e.x) ? [[e.x, e.z]] : [])));
      if (!L.length) return null;
      var b = caixaDe(L); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    },
    /* fonte da sondagem da obra (a tela registra; o teste passa direto) */
    _fonteSondagem: null,
    fonteSondagem: function (fn) { BimTerreno._fonteSondagem = typeof fn === "function" ? fn : null; return true; },

    fim: function (ctx, saida, niveis) {
      if (!ctx || !ctx.p11 || !saida) return saida;
      var X = ctx.p11, M = mapaNiveis(niveis), T = { topos: [], subregioes: [], plataformas: [], divisas: [], componentes: [], rotulos: [], implantacao: null };
      var fontes = X.ordem.map(function (id) { return X.el[id]; });
      var sups = [];
      fontes.forEach(function (f) { if (f.tipo === "topossolido") { var r = calcTopo(f); T.topos.push(r.el); sups.push(r.S); } });
      /* superfícies fora do JSON: quem precisa (3D, planta) pede pela função */
      Object.defineProperty(T, "_sup", { value: sups, enumerable: false, configurable: true });
      var imp = fontes.filter(function (f) { return f.tipo === "implantacao"; })[0];
      if (imp) {
        T.implantacao = clone(imp);
        T.implantacao.anguloNorte = fin(Number(imp.anguloNorte)) ? Number(imp.anguloNorte) : 0;
      }
      var norte = T.implantacao ? T.implantacao.anguloNorte : 0;
      var sond = null;
      if (BimTerreno._fonteSondagem) { try { sond = BimTerreno._fonteSondagem(); } catch (eS) { sond = null; } }
      if (ctx.sondagemP11) sond = ctx.sondagemP11;
      fontes.forEach(function (f) {
        if (f.tipo === "subregiao") {
          var s = clone(f), v = validarContorno(f.contorno), k = v.ok ? hospedeiro(T.topos, sups, f.topoId, v.pts) : -1;
          s.material = txt(f.material) || "Grama";
          s.ok = v.ok && k >= 0;
          if (!v.ok) s.avisos = [v.motivo]; else if (k < 0) s.avisos = ["Não há topossólido sob a sub-região."];
          if (s.ok) {
            var ar = areaRegiao(sups[k], v.pts);
            s.topoHost = String(T.topos[k].id); s.contorno = v.pts.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; });
            s.areaProjetada = ar.projetada; s.areaSuperficie = ar.superficie; s.areaFora = ar.fora;
            if (ar.fora > 1e-6) s.avisos = ["Parte da sub-região está fora do terreno: " + r4(ar.fora) + " m² não entram."];
          } else { s.areaProjetada = 0; s.areaSuperficie = 0; }
          T.subregioes.push(s);
        } else if (f.tipo === "plataforma") {
          var p = clone(f), vp = validarContorno(f.contorno);
          var nv = f.nivelId != null && M[String(f.nivelId)] ? M[String(f.nivelId)] : null;
          var elev = nv ? nv.elev : num(f.base, 0);
          p.deslocNivelEf = fin(Number(f.deslocNivel)) ? Number(f.deslocNivel) : 0;
          p.cota = elev + p.deslocNivelEf; p.elevNivel = elev; p.nivelNome = nv ? nv.nome : null;
          if (f.nivelId != null && !nv && arr(niveis).length) (p.avisos = p.avisos || []).push("O nível da plataforma não existe mais na obra: ficou na cota em que nasceu.");
          var kp = vp.ok ? hospedeiro(T.topos, sups, f.topoId, vp.pts) : -1;
          p.ok = vp.ok && kp >= 0;
          if (!vp.ok) (p.avisos = p.avisos || []).push(vp.motivo); else if (kp < 0) (p.avisos = p.avisos || []).push("Não há topossólido sob a plataforma: sem corte nem aterro.");
          if (vp.ok) {
            p.contorno = vp.pts.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; });
            p.areaProjetada = vp.area; p.perimetro = perim(vp.pts);
          } else { p.areaProjetada = 0; p.perimetro = 0; }
          if (p.ok) {
            var ca = corteAterro(sups[kp], vp.pts, p.cota);
            p.topoHost = String(T.topos[kp].id);
            p.corte = ca.corte; p.aterro = ca.aterro; p.liquido = ca.liquido;
            p.areaCorte = ca.areaCorte; p.areaAterro = ca.areaAterro; p.areaFora = ca.areaFora;
            if (ca.areaFora > 1e-6) (p.avisos = p.avisos || []).push("Parte da plataforma está fora do terreno: " + r4(ca.areaFora).toString().replace(".", ",") + " m² sem corte/aterro (sem terreno medido ali).");
            if (sond) {
              try {
                var so = sondagemSob(sups[kp], vp.pts, p.cota, sond);
                if (so.furo) p.solo = { furo: so.furo, camadas: so.camadas };
                so.avisos.forEach(function (a) { (p.avisos = p.avisos || []).push(a); });
              } catch (eSo) { (p.avisos = p.avisos || []).push("Sondagem: " + (eSo && eSo.message)); }
            }
          } else { p.corte = 0; p.aterro = 0; p.liquido = 0; p.areaCorte = 0; p.areaAterro = 0; }
          var bx = vp.ok ? caixaDe(vp.pts) : null;
          if (bx) { p.cx = r6((bx[0] + bx[2]) / 2); p.cz = r6((bx[1] + bx[3]) / 2); }
          T.plataformas.push(p);
        } else if (f.tipo === "divisa") {
          var dd = clone(f), dc = divisaCalc(f.contorno, norte);
          dd.ok = dc.ok;
          if (dc.ok) { dd.contorno = dc.contorno.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }); dd.area = dc.area; dd.perimetro = dc.perimetro; dd.segmentos = dc.segmentos; }
          else { dd.avisos = [dc.motivo]; dd.area = 0; dd.perimetro = 0; dd.segmentos = []; }
          T.divisas.push(dd);
        } else if (f.tipo === "compTerreno") {
          T.componentes.push(clone(f));
        } else if (f.tipo === "rotuloCurvas") {
          T.rotulos.push(clone(f));
        }
      });
      /* componentes: pousados na superfície do primeiro topossólido que os tem embaixo */
      T.componentes = T.componentes.map(function (c) {
        c.tipoComp = TIPOS_COMP[txt(c.tipoComp)] ? String(c.tipoComp) : "arvore";
        var TCc = TIPOS_COMP[c.tipoComp];
        c.alturaEf = fin(Number(c.altura)) && Number(c.altura) > 0 ? Number(c.altura) : TCc.altura;
        c.rotulo = TCc.rotulo;
        var y = null, kh = -1;
        for (var i = 0; i < sups.length; i++) { var yy = sups[i] && sups[i].ok ? cota(sups[i], num(c.x, 0), num(c.z, 0)) : null; if (yy != null) { y = yy; kh = i; break; } }
        c.y = y != null ? y : 0; c.noTerreno = y != null; if (kh >= 0) c.topoHost = String(T.topos[kh].id);
        if (y == null) c.avisos = ["Fora do terreno: pousado na cota 0,00."];
        return c;
      });
      saida.terreno = T;
      return saida;
    },

    /* a superfície de um topossólido do estado (refeita a partir da fonte — o estado leva as fontes) */
    superficieDe: function (estado, topoId) {
      var T = estado && estado.terreno; if (!T) return null;
      for (var i = 0; i < T.topos.length; i++) if (String(T.topos[i].id) === String(topoId)) {
        if (T._sup && T._sup[i]) return T._sup[i];
        return superficie(T.topos[i].pontos);
      }
      return null;
    },
    /* as peças do terreno do estado (a ordem: topos, sub-regiões, plataformas, divisas, componentes) */
    pecas: function (estado) {
      var T = estado && estado.terreno; if (!T) return [];
      return arr(T.topos).concat(arr(T.subregioes), arr(T.plataformas), arr(T.divisas), arr(T.componentes));
    },
    /* rótulos das curvas (os da linha + as mestras quando ligado) */
    rotulos: function (estado, topoId) {
      var T = estado && estado.terreno; if (!T) return [];
      var out = [];
      T.topos.forEach(function (t) {
        if (topoId != null && String(t.id) !== String(topoId)) return;
        var S = BimTerreno.superficieDe(estado, t.id); if (!S || !S.ok) return;
        var cs = curvas(S, t.passoCurvas);
        if (t.rotularMestras) out = out.concat(rotulosMestras(cs).map(function (r) { r.topoId = String(t.id); return r; }));
        T.rotulos.forEach(function (rl) {
          if (rl.topoId != null && String(rl.topoId) !== String(t.id)) return;
          out = out.concat(rotularLinha(cs, rl.a, rl.b).map(function (r) { r.topoId = String(t.id); r.linha = String(rl.id); return r; }));
        });
      });
      return out;
    },
    /* as medidas do orçamento (as do BimEdit.medidasDe) */
    medidas: function (el) {
      if (!el) return {};
      if (el.tipo === "plataforma") return { un: 1, areaProjecao: num(el.areaProjetada, 0), comprimento: num(el.perimetro, 0), corte: num(el.corte, 0), aterro: num(el.aterro, 0) };
      if (el.tipo === "topossolido") return { un: 1, areaProjecao: num(el.areaProjetada, 0), area: num(el.areaSuperficie, 0), volume: num(el.volume, 0) };
      if (el.tipo === "subregiao") return { un: 1, areaProjecao: num(el.areaProjetada, 0), area: num(el.areaSuperficie, 0) };
      if (el.tipo === "divisa") return { un: 1, area: num(el.area, 0), comprimento: num(el.perimetro, 0) };
      return { un: 1 };
    },

    /* registra o motor no replay do BimEdit (gancho de extensão da B3) */
    registrar: function () {
      var E = dep("BimEdit", "./bimedit.js");
      if (!E || typeof E.estender !== "function") return false;
      return E.estender({
        nome: "p11-terreno",
        aplicar: function (o, ctx) { return BimTerreno.aplicarOp(o, ctx); },
        /* niv: os níveis com que o replay rodou (BimEdit.aplicar passa — P11); sem eles, os da obra aberta */
        fim: function (ctx, saida, niv) {
          var NIV = Array.isArray(niv) ? niv : null;
          if (!NIV) { try { NIV = E.niveisAtuais ? E.niveisAtuais() : null; } catch (eN) { NIV = null; } }
          if (ctx && ctx.niveisP11) NIV = ctx.niveisP11;
          BimTerreno.fim(ctx, saida, NIV);
        },
        valida: function (o) { return o && ehOp(o.op) ? opValida(o) : undefined; }
      });
    }
  };

  global.BimTerreno = BimTerreno;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTerreno;
  BimTerreno.registrar();
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
