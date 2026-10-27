/* =====================================================================
 * hidinc.js — COMBATE A INCÊNDIO (fase 3 do docs/hidro/PLANO-HIDROSSANITARIO.md)
 * Motor PURO, ES5, Node-testável. Contrato: docs/hidro/CONTRATO-INCENDIO.md.
 *   HidInc.calcular(entradaIncendio, ctx?) → resultado (sistema "incendio")
 *   HidInc.gancho(entrada, ctx, res)      → entrada (o orquestrador chama; ver §6 do contrato)
 *
 * O que faz, nesta ordem:
 *   1. ENQUADRAMENTO (IT 01 v10.5 Anexo A + Decreto 47.998/2020): divisão, área total,
 *      altura e construção até 01/07/2005 → extintores / hidrantes e mangotinhos /
 *      chuveiros automáticos exigidos, cada um com a linha da tabela e a nota aplicada;
 *      isenções da IT 17 (Anexo D) declaradas pelo RT.
 *   2. RESERVA (IT 17 Tabela 4) e TIPO DO SISTEMA (IT 17 Tabela 2).
 *   3. HIDRANTES/MANGOTINHOS: cobertura pelo TRAJETO REAL da mangueira (IT 17 5.8.2:
 *      "desconsiderando-se o alcance do jato") numa malha do pavimento com obstáculos;
 *      verifica os pontos modelados ou propõe; 2 jatos simultâneos mais desfavoráveis
 *      (5.8.4) com equilíbrio de pressão no nó de junção; Hazen-Williams da IT 17
 *      (5.8.10 b, C da Tabela 1); velocidade (5.8.12), DN mínimo (5.16), pressão máxima
 *      no esguicho (5.8.8); fonte por gravidade ou bomba (AMT, sucção positiva/negativa,
 *      curva do catálogo, jockey C.1.13, poço de sucção B.1).
 *   4. EXTINTORES (IT 16): risco pela carga de incêndio (Tabela 3), capacidade e
 *      distância máxima a percorrer por classe de fogo (Tabelas 4–6), mínimo por
 *      pavimento (6.2.1), um a até 10 m do acesso (5.2.2.9), posição pela cobertura.
 *   5. CHUVEIROS (IT 18 → NBR 10897): enquadramento e rede; densidade × área e duração
 *      PENDENTES (a NBR 10897 não está na base). Risco leve/ordinário usa a secundária
 *      Tigre para a demanda e o DN por tabela — marcada "secundaria".
 *
 * ⚠ Nenhum valor de norma aqui (tools/test-hid-sem-numero-magico.js). Os números que a
 *   fonte só dá em TEXTO (notas da IT 01 "área superior a 930 m2", faixas "3.001 a 6.000",
 *   "carga de incêndio até 300 MJ/m²", "Vazão mínima 80 L/min para … Grupo A") são LIDOS
 *   do texto da tabela, nunca reescritos — mudou a fonte, muda o cálculo.
 * ⚠ Pendência nunca vira ok (REVISAO-F7 C1): o que não foi verificado sai "pendente" e o
 *   ok do sistema fica false. Fonte secundária é marcada na verificação (fonte.tipo).
 * ⚠ As ops saem em sistemas.incendio.ops (o orquestrador as junta em res.ops só com
 *   aplicavel = true, isto é, quando o patch de docs/hidro/PATCH-BIMINST-INCENDIO.md está no biminst (17/10/2026: aplicado).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v !== null && v !== undefined && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function f2(v) { return v == null || !isFinite(v) ? "—" : String(Math.round(v * 100) / 100).replace(".", ","); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function CAT() { return dep("HidCatalogo", "./hidcatalogo.js"); }

  /* hid:fisica-inicio — fórmulas físicas com a fonte
   * Hazen-Williams na forma da CBMMG IT 17 (1ª ed., Portaria 70/2022), item 5.8.10 b, PDF p.11:
   *   J = 605 · Q^1,85 · C^-1,85 · D^-4,87 · 10^4   (J m/m; Q L/min; D interno em mm)
   *   É a forma prática da fórmula de Williams & Hazen (1905, "Hydraulic Tables"); a IT a dá como
   *   EQUAÇÃO, não como tabela — por isso fica aqui, com o C vindo da Tabela 1 (HidNormas).
   * Torricelli para o bocal do esguicho: Q = Cd · A · √(2·g·H) (Azevedo Netto, Manual de Hidráulica,
   *   cap. "Orifícios, bocais e tubos curtos"); o Cd é do FABRICANTE do esguicho (entrada).
   * Conversão de unidade: 60 s por minuto. */
  var HW_IT = { k: 605, eq: 1.85, ec: 1.85, ed: 4.87, escala: 1e4 };
  /* Hazen-Williams na forma da NBR 10897:2020, 9.4.2.1.1 (PDF p.95, conferida na imagem):
   *   J = 605 · Q^1,85 / (C^1,85 · d^4,87) · 10^5   (J em kPa/m; Q L/min; d interno real em mm) */
  var HW_10897 = { k: 605, eq: 1.85, ec: 1.85, ed: 4.87, escala: 1e5 };
  /* Pressão de velocidade Pv = ρ·v²/2 (Bernoulli). v = Q/A; Q L/min → m³/s ÷ 60 000; D mm → m ÷ 1 000. */
  var BAR_KPA = 100;   /* 1 bar = 100 kPa (definição do bar) */
  var S_POR_MIN = 60;
  /* hid:fisica-fim */
  var L_POR_M3 = 1000, MM_POR_M = 1000, PCT = 100;
  var EPS = 1e-9;                   // hid:ok tolerância numérica de comparação
  /* ⚠ NBR 10897 9.4.2.1.2 imprime "Pv = 255 Q²/D⁴" (kPa; Q L/min; D mm). Conferência dimensional: Pv = ρv²/2 com
     v = 21,22·Q/D² dá Pv = 224,7·Q²/D⁴ kPa (ρ = 998 kg/m³, 20 °C) — NÃO falta potência de 10, o coeficiente
     impresso difere ~13 % (provável erro de impressão de 225). O motor NÃO desconta a pressão de velocidade
     (usa a pressão total nos nós, lado seguro); Pv sai só como informação, por ρv²/2. */
  var PV_DECLARACAO = "a 9.4.2.1.2 imprime Pv = 255·Q²/D⁴; pela dimensão (ρv²/2, ρ 998 kg/m³) o coeficiente é 224,7 (kPa, L/min, mm) — sem potência de 10 faltando, coeficiente impresso ~13 % acima. O cálculo usa a pressão TOTAL (não desconta Pv): lado seguro";
  /* parâmetros NUMÉRICOS do motor (não são norma): resolução da malha de cobertura e laços */
  var PASSO_MALHA_M = 0.5;          // hid:ok resolução padrão da malha (m) — a entrada troca
  var MAX_CELULAS = 20000;          // hid:ok teto de células: acima disso o passo cresce (tempo de cálculo)
  var MAX_CANDIDATOS = 250;         // hid:ok candidatos a posição avaliados na proposta (amostra da malha)
  var IT_BISSECAO = 200;            // hid:ok iterações da bisseção (precisão numérica)
  var IT_DIMENSIONAR = 12;          // hid:ok voltas do laço vazão × DN
  var MIN_VERTICES = 3;             // hid:ok polígono tem ao menos 3 vértices (geometria)
  var N_EXEMPLOS = 3;               // hid:ok quantos pontos descobertos o texto cita (apresentação)
  var CASAS_J = 4;                  // hid:ok casas do J em notação científica (apresentação)
  /* o texto da IT 17 5.8.8 diz "o TRIPLO": o número é o da palavra, lido do texto da regra */
  var MULTIPLOS = { dobro: 2, triplo: 3, "quádruplo": 4 };   // hid:ok número por extenso (vocabulário, não norma)

  var SIS = "incendio";
  var K = {
    exig: "in.it01.exigencias_por_ocupacao", classif: "in.it01.classificacao_ocupacao",
    tipos: "in.it17.tipos_sistema", comp: "in.it17.componentes_por_ponto", ri: "in.it17.reserva_incendio",
    hw: "in.it17.hazen_williams", r17: "in.it17.regras_dimensionamento", poco: "in.it17.poco_succao", isen: "in.it17.isencoes",
    riFora: "in.it17.ri_por_ocupacao_fora_da_tabela",
    risco16: "in.it16.classe_de_risco_carga_incendio", a16: "in.it16.classe_A_unidade_e_distancia", b16: "in.it16.classe_B_unidade_e_distancia",
    cdk16: "in.it16.classes_C_D_K_distancia", cap16: "in.it16.capacidade_extintora_minima", r16: "in.it16.regras_instalacao",
    r18: "in.it18.regras", dens18: "in.it18.densidade_x_area_operacao", ext18: "in.it18.duracao_rti_chuveiros_risco_extraordinario",
    dem: "in.nbr10897.demanda_agua_tigre", tab: "in.nbr10897.dimensionamento_por_tabela_tigre",
    /* NBR 10897:2020 (nbr10897.json) */
    r10: "in.nbr10897.regras", densArea: "in.nbr10897.densidade_area", duracao: "in.nbr10897.duracao", demHid: "in.nbr10897.demanda_hidrantes", metTab: "in.nbr10897.metodo_tabela",
    fatorK: "in.nbr10897.fator_k", kMinTeto: "in.nbr10897.k_minimo_teto_alto", tetoAltoP: "in.nbr10897.teto_alto_padrao", tetoAltoE: "in.nbr10897.teto_alto_estendida",
    espPadrao: "in.nbr10897.espacamento_padrao", defletor: "in.nbr10897.defletor_teto", obst: "in.nbr10897.obstrucao_tabela15", hwC: "in.nbr10897.hazen_williams_c",
    tubLeve: "in.nbr10897.tubos_leve", tubOrd: "in.nbr10897.tubos_ordinario", tubOrdEsp: "in.nbr10897.tubos_ordinario_espacamento_maior", tubLeveForro: "in.nbr10897.tubos_leve_acima_abaixo_forro",
    /* NBR 13714:2000 (nbr13714.json) — em MG a IT 17 prevalece (decisão do RT, 17/10/2026) */
    n13tipos: "in.nbr13714.tipos", n13comp: "in.nbr13714.componentes", n13dur: "in.nbr13714.duracao", n13hw: "in.nbr13714.hazen_williams_c", n13poco: "in.nbr13714.poco_succao",
    /* tubo de aço-carbono (NBR 5590, dimensões da ASME B36.10M): a tabela é da frente de fluidos (fluidos.json) */
    acoTubo: "ind.tubo.aco_carbono", zinco: "in.nbr5590.zinco_minimo",
    n13apl: "in.nbr13714.aplicabilidade", n13d7: "in.nbr13714.alternativo_d7", r13: "in.nbr13714.regras",
    tubOrdForro: "in.nbr10897.tubos_ordinario_acima_abaixo_forro", respRap: "in.nbr10897.resposta_rapida", riscoDiv: "in.nbr10897.risco_por_divisao", armaz: "in.nbr10897.armazenamento"
  };
  var MEDIDAS = ["extintores", "hidrantes_mangotinhos", "chuveiros_automaticos"];
  var NOME_MEDIDA = { extintores: "extintores", hidrantes_mangotinhos: "hidrantes e mangotinhos", chuveiros_automaticos: "chuveiros automáticos" };
  /* material do modelo → linha da Tabela 1 da IT 17 (nome, não número) */
  var TUBO_HW = { aco_galvanizado: "Galvanizado", galvanizado: "Galvanizado", aco_preto: "Aço preto (sistema de tubo molhado)",
                  aco_preto_seco: "Aço preto (sistema de tubo seco)", cobre: "Cobre", pvc: "Plástico", cpvc: "Plástico", ppr: "Plástico",
                  plastico: "Plástico", ferro_fundido: "Ferro fundido ou dúctil sem revestimento interno",
                  ferro_fundido_cimento: "Ferro fundido ou dúctil com revestimento interno de cimento" };
  /* exceção de DN mínimo (IT 17 5.16.2) — a linha da regra que vale para o material */
  /* isenção do Anexo D da IT 17 que o motor confere pelo GRUPO da ocupação (o "caso" do item, por nome) */
  var ISENCAO_GRUPO = { "D.1.1": "I", "D.1.5": "J" };
  var SCH_PADRAO = "40";   /* schedule padrão do tubo de aço (nome da série, texto) — decisão do gerente 17/10/2026, declarada */
  /* "1/3 da capacidade efetiva" (IT 17 C.1.10 = NBR 13714 B.1.10): o 3 é o da fração escrita no texto */
  var FRACAO_CAPACIDADE = 3;   // hid:ok denominador da fração "1/3" do texto (a regra está na tabela)
  /* material → linha da Tabela 30 da NBR 10897 (nome, não número) */
  var TUBO_10897 = { aco_preto: "Aço preto — sistemas molhados", aco_preto_seco: "Aço preto — sistemas secos", aco_galvanizado: "Galvanizado", galvanizado: "Galvanizado",
                     cobre: "Cobre ou aço inoxidável", aco_inox: "Cobre ou aço inoxidável", cpvc: "Plástico certificado", plastico: "Plástico certificado",
                     ferro_fundido: "Ferro fundido ou dúctil sem revestimento", ferro_fundido_cimento: "Ferro fundido ou dúctil com revestimento de cimento" };
  var EXCECAO_DN = { aco_galvanizado: "aço galvanizado", galvanizado: "aço galvanizado", cobre: "cobre" };

  /* -------------------------------------------- números escritos em texto na fonte */
  /* "1.200" → 1200 · "3.001" → 3001 · "0,5" → 0,5 · "12" → 12 (milhar com ponto, decimal com vírgula) */
  function numBR(s) {
    var t = String(s == null ? "" : s).trim();
    if (new RegExp("^\\d+(\\.\\d\\d\\d)+(,\\d+)?$").test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(",", ".");
    var n = Number(t);
    return t !== "" && isFinite(n) ? n : null;
  }
  var RE_NUM = "([\\d.,]+)";
  /* faixa de altura da IT 01 ("H<=12", "12<H<=30", "H>54") → {min (exclusivo), max (inclusivo)} */
  function faixaAltura(s) {
    var t = String(s).replace(/\s/g, ""), m;
    if ((m = new RegExp("^H<=" + RE_NUM + "$").exec(t))) return { min: null, max: numBR(m[1]) };
    if ((m = new RegExp("^" + RE_NUM + "<H<=" + RE_NUM + "$").exec(t))) return { min: numBR(m[1]), max: numBR(m[2]) };
    if ((m = new RegExp("^H>" + RE_NUM + "$").exec(t))) return { min: numBR(m[1]), max: null };
    return null;
  }
  /* faixa de área da IT 17 Tabela 4 ("até 3.000", "3.001 a 6.000", "acima de 30.000") */
  function faixaArea(s) {
    var t = String(s).trim(), m;
    if ((m = new RegExp("^até " + RE_NUM + "$").exec(t))) return { de: null, ate: numBR(m[1]) };
    if ((m = new RegExp("^" + RE_NUM + " a " + RE_NUM + "$").exec(t))) return { de: numBR(m[1]), ate: numBR(m[2]) };
    if ((m = new RegExp("^acima de " + RE_NUM + "$").exec(t))) return { de: numBR(m[1]), ate: null, acima: true };
    return null;
  }
  /* coluna "grupo_divisao" da Tabela 4 → cláusulas [{divisoes, cargaMin (exclusiva), cargaMax (inclusiva), comCarga}] */
  function clausulasRI(s) {
    return String(s).split(";").map(function (p) {
      var m, cmin = null, cmax = null, com = /carga de inc/i.test(p);
      if ((m = new RegExp("acima de " + RE_NUM + " até " + RE_NUM + " MJ").exec(p))) { cmin = numBR(m[1]); cmax = numBR(m[2]); }
      else if ((m = new RegExp("carga de incêndio até " + RE_NUM + " MJ").exec(p))) { cmax = numBR(m[1]); }
      else if ((m = new RegExp(">\\s*" + RE_NUM + " MJ").exec(p))) { cmin = numBR(m[1]); }
      return { divisoes: p.match(/[A-M]-\d+/g) || [], cargaMin: cmin, cargaMax: cmax, comCarga: com, texto: p.trim() };
    });
  }
  /* "2-A:20-B:C" → {A: 2, B: 20, C: true} */
  function capacidade(s) {
    var t = String(s || ""), a = /(\d+)\s*-\s*A/.exec(t), b = /(\d+)\s*-\s*B/.exec(t);
    return { A: a ? Number(a[1]) : null, B: b ? Number(b[1]) : null, C: /(^|[:;\s])C\b/.test(t.replace(/-B:C/, "-B; C")), texto: t };
  }

  /* -------------------------------------------------------------- geometria (XZ) */
  function dentro(pol, x, z) {
    var c = false, n = pol.length, i, j;
    for (i = 0, j = n - 1; i < n; j = i++) {
      var a = pol[i], b = pol[j];
      if (((a.z > z) !== (b.z > z)) && (x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x)) c = !c;
    }
    return c;
  }
  function areaPol(pol) { var s = 0; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) s += (pol[j].x + pol[i].x) * (pol[j].z - pol[i].z); return Math.abs(s) / 2; }
  function pts(p) { return arr(p).map(function (q) { return { x: num(q.x, 0), z: num(q.z != null ? q.z : q.y, 0) }; }); }

  /* MALHA do pavimento: células livres (dentro do polígono, fora dos obstáculos). O caminho
     anda em 16 direções (ortogonais, diagonais e "salto de cavalo"); um passo só vale se as
     células que o segmento atravessa estão livres (não corta quina de parede). A distância de
     malha é ≥ a geodésica real (~5% acima, no pior caso medido, com 16 direções; com 8 eram ~8% e o motor
     propunha hidrante a mais) → cobertura do lado SEGURO. */
  function malha(poligono, obstaculos, passo) {
    var P = pts(poligono), O = arr(obstaculos).map(pts);
    if (P.length < MIN_VERTICES) return null;
    var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    P.forEach(function (p) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); });
    var h = num(passo, PASSO_MALHA_M), area = (maxx - minx) * (maxz - minz);
    if (area / (h * h) > MAX_CELULAS) h = Math.sqrt(area / MAX_CELULAS);
    var nx = Math.max(1, Math.ceil((maxx - minx) / h)), nz = Math.max(1, Math.ceil((maxz - minz) / h));
    var livre = [], lista = [];
    for (var iz = 0; iz < nz; iz++) for (var ix = 0; ix < nx; ix++) {
      var cx = minx + (ix + 1 / 2) * h, cz = minz + (iz + 1 / 2) * h, ok = dentro(P, cx, cz);
      if (ok) for (var k = 0; k < O.length; k++) if (O[k].length >= MIN_VERTICES && dentro(O[k], cx, cz)) { ok = false; break; }
      livre.push(ok); if (ok) lista.push(iz * nx + ix);
    }
    return { nx: nx, nz: nz, h: h, x0: minx, z0: minz, livre: livre, lista: lista, area_m2: areaPol(P) };
  }
  function centro(M, i) { var ix = i % M.nx, iz = (i - ix) / M.nx; return { x: M.x0 + (ix + 1 / 2) * M.h, z: M.z0 + (iz + 1 / 2) * M.h }; }
  /* a célula livre mais próxima do ponto (e o afastamento até o centro dela) */
  function celulaDe(M, p) {
    var best = -1, d0 = Infinity;
    M.lista.forEach(function (i) { var c = centro(M, i), d = Math.sqrt((c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z)); if (d < d0) { d0 = d; best = i; } });
    return best < 0 ? null : { i: best, d: d0 };
  }
  /* Dijkstra na malha (heap binário) a partir de um ponto: distância de caminhada a cada célula */
  /* vizinhos de cada célula livre, calculados UMA vez por malha (a proposta roda centenas de
     Dijkstras na mesma malha): [dx, dz, células atravessadas]; custo = comprimento do passo */
  function vizinhos(M) {
    if (M.adj) return M.adj;
    var VIZ = [[1, 0, []], [-1, 0, []], [0, 1, []], [0, -1, []],
               [1, 1, [[1, 0], [0, 1]]], [1, -1, [[1, 0], [0, -1]]], [-1, 1, [[-1, 0], [0, 1]]], [-1, -1, [[-1, 0], [0, -1]]],
               [1, 2, [[0, 1], [1, 1]]], [-1, 2, [[0, 1], [-1, 1]]], [1, -2, [[0, -1], [1, -1]]], [-1, -2, [[0, -1], [-1, -1]]],   // hid:ok passos de cavalo da malha
               [2, 1, [[1, 0], [1, 1]]], [2, -1, [[1, 0], [1, -1]]], [-2, 1, [[-1, 0], [-1, 1]]], [-2, -1, [[-1, 0], [-1, -1]]]];   // hid:ok passos de cavalo da malha
    var CUSTO = VIZ.map(function (d) { return M.h * Math.sqrt(d[0] * d[0] + d[1] * d[1]); });
    function livre(x, z) { return x >= 0 && z >= 0 && x < M.nx && z < M.nz && M.livre[z * M.nx + x]; }
    M.adj = {};
    M.lista.forEach(function (v) {
      var vx = v % M.nx, vz = (v - vx) / M.nx, l = [];
      for (var k = 0; k < VIZ.length; k++) {
        var ax = vx + VIZ[k][0], az = vz + VIZ[k][1];
        if (!livre(ax, az)) continue;
        var ok = true; for (var q = 0; q < VIZ[k][2].length; q++) if (!livre(vx + VIZ[k][2][q][0], vz + VIZ[k][2][q][1])) { ok = false; break; }
        if (ok) l.push(az * M.nx + ax, CUSTO[k]);
      }
      M.adj[v] = l;
    });
    return M.adj;
  }
  /* Dijkstra na malha (heap binário) a partir de um ponto: distância de caminhada a cada célula.
     limite: para de expandir além dele (a cobertura só pergunta "alcança ou não") */
  function caminhos(M, p, limite) {
    var c = celulaDe(M, p), N = M.nx * M.nz, dist = new Array(N), i, adj = vizinhos(M), lim = limite == null ? Infinity : limite;
    for (i = 0; i < N; i++) dist[i] = Infinity;
    if (!c) return dist;
    var hd = [], hv = [];
    function push(v, d) { hd.push(d); hv.push(v); var k = hd.length - 1; while (k > 0) { var pa = (k - 1) >> 1; if (hd[pa] <= hd[k]) break; var t = hd[pa]; hd[pa] = hd[k]; hd[k] = t; t = hv[pa]; hv[pa] = hv[k]; hv[k] = t; k = pa; } }
    function pop() { var lastD = hd.pop(), lastV = hv.pop(); if (hd.length) { hd[0] = lastD; hv[0] = lastV; var k = 0, n = hd.length; for (;;) { var l = 2 * k + 1, r = l + 1, m = k; if (l < n && hd[l] < hd[m]) m = l; if (r < n && hd[r] < hd[m]) m = r; if (m === k) break; var t = hd[m]; hd[m] = hd[k]; hd[k] = t; t = hv[m]; hv[m] = hv[k]; hv[k] = t; k = m; } } }
    dist[c.i] = c.d; push(c.i, c.d);
    while (hd.length) {
      var d = hd[0], v = hv[0]; pop();
      if (d > dist[v] || d > lim) continue;
      var l = adj[v];
      for (var k = 0; k < l.length; k += 2) { var u = l[k], nd = d + l[k + 1]; if (nd < dist[u]) { dist[u] = nd; if (nd <= lim) push(u, nd); } }
    }
    return dist;
  }
  /* cobertura: quantos pontos alcançam cada célula livre (alcance pela caminhada) */
  function cobertura(M, pontos, alcance, nMin) {
    var cont = {}, D = pontos.map(function (p) { return caminhos(M, p, alcance); });
    M.lista.forEach(function (i) { var n = 0; D.forEach(function (d) { if (d[i] <= alcance) n++; }); cont[i] = n; });
    var desc = M.lista.filter(function (i) { return cont[i] < nMin; });
    return { descobertas: desc.length, celulas: M.lista.length, area_descoberta_m2: desc.length * M.h * M.h,
             exemplos: desc.slice(0, N_EXEMPLOS).map(function (i) { return centro(M, i); }), distancias: D };
  }
  /* PROPOSTA de posições (cobertura gulosa): o primeiro ponto obrigatoriamente a até "raioAcesso"
     de um acesso (IT 17 5.7.1 a / IT 16 5.2.2.9), depois o candidato que cobre mais células ainda
     descobertas. Candidatos = amostra da malha (o RT ajusta à parede; o motor reverifica). */
  function propor(M, existentes, alcance, nMin, acessos, raioAcesso) {
    var passo = Math.max(1, Math.round(Math.sqrt(M.lista.length / MAX_CANDIDATOS)));
    var cand = M.lista.filter(function (i) { var ix = i % M.nx, iz = (i - ix) / M.nx; return ix % passo === 0 && iz % passo === 0; });
    if (!cand.length) cand = M.lista.slice();
    var Dc = cand.map(function (i) { return caminhos(M, centro(M, i), alcance); });
    var cont = {}; M.lista.forEach(function (i) { cont[i] = 0; });
    existentes.forEach(function (p) { var d = caminhos(M, p, alcance); M.lista.forEach(function (i) { if (d[i] <= alcance) cont[i]++; }); });
    var escolhidos = [], usados = {};
    function ganho(k) { var g = 0; M.lista.forEach(function (i) { if (cont[i] < nMin && Dc[k][i] <= alcance) g++; }); return g; }
    function aplica(k) { usados[k] = 1; escolhidos.push(centro(M, cand[k])); M.lista.forEach(function (i) { if (Dc[k][i] <= alcance) cont[i]++; }); }
    var ac = pts(acessos);
    if (ac.length && raioAcesso != null && !existentes.length) {
      var perto = {}; ac.forEach(function (a) { var d = caminhos(M, a, raioAcesso); cand.forEach(function (ci, k) { if (d[ci] <= raioAcesso) perto[k] = 1; }); });
      var ks = Object.keys(perto).map(Number), melhor = -1, g0 = -1;
      ks.forEach(function (k) { var g = ganho(k); if (g > g0) { g0 = g; melhor = k; } });
      if (melhor >= 0) aplica(melhor);
    }
    for (var volta = 0; volta < cand.length; volta++) {
      if (!M.lista.some(function (i) { return cont[i] < nMin; })) break;
      var mk = -1, mg = 0;
      for (var k = 0; k < cand.length; k++) { if (usados[k] && nMin <= 1) continue; var g = ganho(k); if (g > mg) { mg = g; mk = k; } }
      if (mk < 0) break;
      aplica(mk);
    }
    var falta = M.lista.filter(function (i) { return cont[i] < nMin; });
    return { pontos: escolhidos, descobertas: falta.length, area_descoberta_m2: falta.length * M.h * M.h, exemplos: falta.slice(0, N_EXEMPLOS).map(function (i) { return centro(M, i); }) };
  }

  function areaCobertura(S, L) { return S * L; }                        /* Figura 14: S × L */
  /* Figura 46 / 9.4.4.2: chuveiros na área = ⌈área / área por chuveiro⌉; por ramal = ⌈fator·√área / S⌉ */
  function numeroNaArea(A, As, S, fator) { return { n: Math.ceil(A / As - EPS), porRamal: fator == null ? null : Math.ceil(fator * Math.sqrt(A) / S - EPS) }; }
  function distPoligono(P, c) {
    var best = Infinity;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[j], b = P[i], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / L2)) : 0;
      var px = a.x + t * dx, pz = a.z + t * dz; best = Math.min(best, Math.sqrt((c.x - px) * (c.x - px) + (c.z - pz) * (c.z - pz)));
    }
    return best;
  }
  /* --------------------------------------------------------------- hidráulica */
  /* J (m/m) pela forma da IT 17: Q em L/min, D interno em mm */
  function jHW(Qlpm, C, Dmm) { return Qlpm > 0 ? HW_IT.k * Math.pow(Qlpm, HW_IT.eq) * Math.pow(C, -HW_IT.ec) * Math.pow(Dmm, -HW_IT.ed) * HW_IT.escala : 0; }
  /* J (kPa/m) pela forma da NBR 10897 9.4.2.1.1 */
  function jNBR10897(Qlpm, C, Dmm) { return Qlpm > 0 ? HW_10897.k * Math.pow(Qlpm, HW_10897.eq) / (Math.pow(C, HW_10897.ec) * Math.pow(Dmm, HW_10897.ed)) * HW_10897.escala : 0; }
  /* pressão de velocidade (kPa) por ρv²/2 — a forma provada; ver PV_DECLARACAO */
  function pressaoVelocidade(Qlpm, Dmm, rho) { var v = velocidade(Qlpm, Dmm); return num(rho, HH().agua(HH().T_PADRAO_C).rho) * v * v / 2 / L_POR_M3; }
  function velocidade(Qlpm, Dmm) { var q = Qlpm / L_POR_M3 / S_POR_MIN, d = Dmm / MM_POR_M; return q / (Math.PI * d * d / 4); }   // hid:ok área do círculo πD²/4
  /* coeficiente do esguicho K (L/min por mca^½): Q = K·√P — do fabricante, ou Torricelli com Cd e o Ø do requinte */
  function kEsguicho(Cd, dmm) { var a = Math.PI * Math.pow(dmm / MM_POR_M, 2) / 4; return Cd * a * Math.sqrt(2 * HH().G) * L_POR_M3 * S_POR_MIN; }   // hid:ok área do círculo πD²/4
  function bissecao(f, a, b) { var fa = f(a); for (var i = 0; i < IT_BISSECAO; i++) { var m = (a + b) / 2, fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; }

  /* ===================================================================== CÁLCULO */
  function calcular(ent, ctx0) {
    ent = ent || {};
    var N = NR();
    var base = ctx0 || N.contexto();
    var minhas = [];
    function reg(chave, motivo, uso) { if (!minhas.some(function (p) { return p.chave === chave && p.motivo === motivo; })) minhas.push({ chave: chave, motivo: motivo, usadoEm: uso ? [uso] : [] }); }
    /* o contexto é o do orquestrador (normas e pendências de todos os sistemas); aqui se guarda
       também o que é SÓ do incêndio, para o status do sistema não depender dos outros */
    var ctx = {
      fixture: base.fixture,
      consulta: function (c, f, col, uso) { var r = base.consulta(c, f, col, uso); if (!r.ok) reg(r.ref || c, r.motivo, uso); return r; },
      linhas: function (c, f, uso) { var r = base.linhas(c, f, uso); if (!r) reg(c, "tabela " + c + " indisponível", uso); return r; },
      pendencia: function (c, m, uso) { base.pendencia(c, m, uso); reg(c, m, uso); }
    };
    var out = { versao: 1, sistema: SIS, status: "pendente", ok: false, fixture: !!base.fixture,
                enquadramento: null, reserva: null, hidrantes: null, extintores: null, chuveiros: null,
                premissas: [], verificacoes: [], avisos: [], problemas: [], pendencias: [], normas: [],
                ops: [], opsDesfazer: [], aplicavel: !!(dep("BimInst", "./biminst.js") && dep("BimInst", "./biminst.js").SISTEMAS && dep("BimInst", "./biminst.js").SISTEMAS.incendio), patch: "docs/hidro/PATCH-BIMINST-INCENDIO.md", resumo: null };
    var pavs = arr(ent.pavimentos);

    function fonteDe(chave, detalhe) {
      var f = N.fonte(chave); if (!f) return null;
      return { chave: f.chave, norma: f.norma, edicao: f.edicao, doc: f.doc, pagina: f.pagina, tabela: (f.tabela || "") + (detalhe ? " — " + detalhe : ""), tipo: f.tipo };
    }
    function premissa(item, valor, origem, fonte) { if (!out.premissas.some(function (p) { return p.item === item; })) out.premissas.push({ item: item, valor: valor, origem: origem || "padrao_motor", fonte: fonte || null }); }
    /* verificação do contrato; sentido "max" (valor ≤ limite) ou "min" (valor ≥ limite) */
    function verif(alvo, nome, valor, limite, unidade, ok, passos, fonte, sentido) {
      var eta = null;
      if (ok !== null && valor != null && limite != null && isFinite(valor) && isFinite(limite)) eta = sentido === "min" ? (valor > 0 ? limite / valor : null) : (limite > 0 ? valor / limite : null);
      var v = { id: "in-v" + out.verificacoes.length, sistema: SIS, alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unidade || "", eta: eta,
                ok: ok, status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), passos: passos || [], fonte: fonte || null };
      out.verificacoes.push(v); return v;
    }
    /* aviso + problema (regra "problema sempre com solução": todo aviso tem a ação) */
    function aviso(grav, texto, elementos, corrigir) {
      var c = corrigir || { texto: "revisar com o RT" };
      out.avisos.push({ id: "in-" + out.avisos.length, sistema: SIS, gravidade: grav, texto: texto, elementos: elementos || [], corrigir: c });
      out.problemas.push({ texto: texto, elementos: elementos || [], acao: c });
    }
    /* ⚠ HIERARQUIA (RT, 17/10/2026): regra "IT17-MG" (padrão) = a IT 17 do CBMMG prevalece; a NBR 13714 entra onde
       a IT remete, no que a IT não cobre (reservatório, bombas, suportes, recalque, ensaio) e, em conflito, vira NOTA
       no passo. regra "NBR13714" = edificação fora de MG ou escolha do usuário: Tabela 1, D.1, D.7, 5.3.6 etc. */
    var MODO = ent.regra === "NBR13714" ? "NBR13714" : "IT17-MG", NBR = MODO === "NBR13714";
    var notas13714 = [];
    function r13(item, contem, uso) { return regra(K.r13, "item", item, contem, uso || "hidrantes — NBR 13714"); }
    /* em MG: a 13714 diz outra coisa → nota (não muda o cálculo) */
    function nota13(item, texto) { var t = "NBR 13714 " + item + ": " + texto + " — em MG vale a IT 17 (hierarquia do RT)"; if (notas13714.indexOf(t) < 0) notas13714.push(t); return t; }
    /* ⚠ confirmação do RT (decisão do gerente, 17/10/2026): isenção cuja condição o motor não confere só vale com
       confirmacoesRT[{item, justificativa, responsavel}] com justificativa E responsável NÃO vazios — e vira premissa
       (origem "confirmacao_rt") para o memorial. Confirmação incompleta não isenta (aviso). */
    function confirmacaoRT(cod) {
      var c = arr(ent.confirmacoesRT).filter(function (x) { return x && String(x.item || "").split(/\s+/)[0] === cod; })[0];
      if (!c) return null;
      var j = String(c.justificativa == null ? "" : c.justificativa).trim(), r = String(c.responsavel == null ? "" : c.responsavel).trim();
      if (!j || !r) {
        if (!out.avisos.some(function (a) { return a.texto.indexOf("confirmação da isenção " + cod) === 0; }))
          aviso("aviso", "confirmação da isenção " + cod + " incompleta (" + (!r ? "sem responsável" : "sem justificativa") + "): a isenção continua pendente", [], { texto: "preencher justificativa e responsável (nome / CREA) em confirmacoesRT" });
        return null;
      }
      var it = "isenção " + cod + " confirmada pelo RT " + r;
      if (!out.premissas.some(function (p) { return p.item === it; })) out.premissas.push({ item: it, valor: it + ": " + j, origem: "confirmacao_rt", fonte: fonteDe(K.isen, cod) });
      return { justificativa: j, responsavel: r };
    }
    /* ⚠ DI do tubo de AÇO (gerente, 17/10/2026): antes era premissa do fabricante (rede.diametros); agora sai da
       tabela de dimensões (NBR 5590 / ASME B36.10M): DI = DE − 2·e do schedule — padrão Sch 40 para hidrantes,
       declarado (rede.schedule troca). A entrada explícita (di_mm do trecho ou rede.diametros) ainda manda. */
    var ACO = { aco_galvanizado: 1, galvanizado: 1, aco_preto: 1, aco_preto_seco: 1 };
    function diametrosAco(mat, schedule, uso) {
      if (!ACO[mat]) return null;
      var sch = String(schedule || SCH_PADRAO), ls = ctx.linhas(K.acoTubo, null, uso);
      if (!ls) return null;
      var m = {};
      ls.forEach(function (l) { if (String(l.serie) === sch) { var de = num(l.de_mm, null), e = num(l.e_mm, null); if (de != null && e != null) m[num(l.dn, 0)] = de - 2 * e; } });
      if (!Object.keys(m).length) { ctx.pendencia(K.acoTubo + "[Sch " + sch + "]", "schedule " + sch + " sem linhas na tabela de tubos de aço", uso); return null; }
      if (!schedule) premissa("schedule do tubo de aço", "Sch " + sch + " (padrão para hidrantes/chuveiros; informe rede.schedule) — DI = DE − 2·e (NBR 5590 / ASME B36.10M)", "padrao_motor", fonteDe(K.acoTubo));
      if (/galv/.test(mat)) { var z = ctx.consulta(K.zinco, null, "valor", uso); if (z.ok) premissa("galvanização do tubo", "camada de zinco ≥ " + z.valor + " g/m² (média de dois corpos de prova, NBR 5590 5.10.3.2)", "norma", z.fonte); }
      return m;
    }
    /* linha de regra (tabelas de regras: coluna do item + trecho do texto) */
    function regra(chave, colItem, item, contem, uso) {
      var ls = ctx.linhas(chave, null, uso); if (!ls) return null;
      var l = ls.filter(function (x) { return String(x[colItem]) === item && (!contem || String(x.regra).indexOf(contem) >= 0); })[0];
      if (!l) { ctx.pendencia(chave + "[" + item + "]", "linha do item " + item + (contem ? " (\"" + contem + "\")" : "") + " não encontrada em " + chave, uso); return null; }
      return { valor: l.valor, num: typeof l.valor === "number" ? l.valor : numBR(l.valor), linha: l, fonte: fonteDe(chave, "item " + item + (l.pagina_pdf != null ? ", PDF p." + l.pagina_pdf : "")) };
    }

    /* ------------------------------------------------------------------ 1. ENQUADRAMENTO */
    var E = out.enquadramento = enquadrar();
    E.regra = MODO;
    if (NBR) aplicabilidade13714();
    /* NBR 13714 Anexo D (D.1): hidrante/mangotinho em área construída acima do limite e/ou altura acima do limite —
       fora de MG substitui a exigência da IT 01; extintores e chuveiros ficam pela IT 01/16 (referência de MG, aviso) */
    function aplicabilidade13714() {
      var M = E.medidas.hidrantes_mangotinhos, rA = r13("D.1", "área"), rH = r13("D.1", "altura");
      M.passos = ["regra NBR 13714 (fora de MG ou escolhida pelo usuário): a exigência de hidrantes sai do Anexo D, não da IT 01"]; M.notas = []; M.fonte = fonteDe(K.n13apl, "D.1");
      if (!rA || !rH) { M.exigido = null; return; }
      if (E.area_m2 == null && E.altura_m == null) { M.exigido = null; ctx.pendencia("entrada.incendio.area_m2", "área construída e altura não informadas (NBR 13714 D.1)", "enquadramento — NBR 13714"); return; }
      var pA = E.area_m2 != null && E.area_m2 > rA.num, pH = E.altura_m != null && E.altura_m > rH.num;
      M.exigido = pA || pH;
      M.passos.push("D.1: área " + f2(E.area_m2) + " m² " + (pA ? ">" : "≤") + " " + f2(rA.num) + " m² e/ou altura " + f2(E.altura_m) + " m " + (pH ? ">" : "≤") + " " + f2(rH.num) + " m → " + (M.exigido ? "exigido" : "não exigido"));
      if (!M.exigido && (E.area_m2 == null || E.altura_m == null)) { M.exigido = null; ctx.pendencia("entrada.incendio." + (E.area_m2 == null ? "area_m2" : "altura_m"), "a NBR 13714 D.1 depende da área E da altura", "enquadramento — NBR 13714"); }
      E.status = MEDIDAS.some(function (m) { return E.medidas[m].exigido === null; }) ? "pendente" : "ok";
      aviso("info", "regra NBR 13714: extintores e chuveiros seguem a IT 01/IT 16 de MG como referência — fora de MG, conferir a IT do Corpo de Bombeiros do estado", [], { texto: "conferir a regulamentação estadual de extintores e chuveiros" });
    }
    function enquadrar() {
      var div = String(ent.ocupacao || "").toUpperCase().replace(/\s/g, "");
      var e = { divisao: div, grupo: null, grupoLetra: div.charAt(0) || null, descricao: null, area_m2: num(ent.area_m2, null), altura_m: num(ent.altura_m, null),
                construidaAte2005: !!ent.construidaAte2005, faixaAltura: null, tabela: null, medidas: {}, isencoes: [], isencoesPossiveis: [], status: "pendente" };
      MEDIDAS.forEach(function (m) { e.medidas[m] = { exigido: null, valor: null, notas: [], passos: [], fonte: null }; });
      if (!div) { ctx.pendencia("entrada.incendio.ocupacao", "divisão de ocupação não informada (Decreto 47.998/2020, Anexo: A-1 … M-8)", "enquadramento"); return e; }
      var cl = ctx.linhas(K.classif, null, "enquadramento — classificação da ocupação"), c = cl && cl.filter(function (l) { return l.divisao === div; })[0];
      if (!c) { ctx.pendencia(K.classif + "[" + div + "]", "a divisão " + div + " não está na classificação do Decreto 47.998/2020", "enquadramento"); return e; }
      e.grupo = c.grupo; e.descricao = c.descricao + (c.exemplos ? " (" + c.exemplos + ")" : "");
      var ls = ctx.linhas(K.exig, null, "enquadramento — IT 01 Anexo A"), row = ls && ls.filter(function (l) { return arr(l.divisoes).indexOf(div) >= 0; })[0];
      if (!row) {
        ctx.pendencia(K.exig + "[" + div + "]", "a divisão " + div + " não tem linha nas tabelas do Anexo A da IT 01 gravadas na base (a IT 01 A.4.1 isenta a residência unifamiliar; o grupo M segue IT/norma específica) — o RT declara as medidas", "enquadramento");
        return e;
      }
      e.tabela = { tabela: row.tabelaIT01, pagina: row.pagina_pdf };
      var classes = arr(row.classes_altura_m), idx = null;
      if (e.altura_m != null) classes.forEach(function (s, i) { var f = faixaAltura(s); if (f && (f.min == null || e.altura_m > f.min) && (f.max == null || e.altura_m <= f.max)) { idx = i; e.faixaAltura = s; } });
      var fonte = fonteDe(K.exig, row.tabelaIT01 + " (PDF p." + row.pagina_pdf + ")");
      var notas = row.notas || {};
      var areaRef = e.area_m2;
      MEDIDAS.forEach(function (m) {
        var M = e.medidas[m], col = arr(row[m]); M.fonte = fonte;
        /* ⚠ revisão INC B1: coluna única só vale para QUALQUER altura quando a tabela diz que não tem faixa
           (F-7: "sem classes de altura"); senão a coluna única é a 1ª faixa (G-3: só "H<=12") e altura fora
           dela fica pendente — antes o G-3 com 20 m saía enquadrado pela coluna de 12 m */
        var semFaixa = /sem classes de altura/i.test(JSON.stringify(notas));
        if (col.length === 1 && !semFaixa && e.altura_m != null && idx !== 0) {
          M.passos.push(row.tabelaIT01 + " só traz a faixa " + classes[0] + " para " + div + "; altura " + f2(e.altura_m) + " m fora dela");
          ctx.pendencia(K.exig + "[" + div + ", H " + e.altura_m + " m]", "a " + row.tabelaIT01 + " da IT 01 só tem a faixa " + classes[0] + " para " + div + " — altura " + f2(e.altura_m) + " m fora da tabela (o RT enquadra)", "enquadramento — " + NOME_MEDIDA[m]);
          return;
        }
        var v = col.length === 1 ? (semFaixa || idx === 0 ? col[0] : null) : (idx == null ? null : col[idx]);
        if (v == null) {
          M.passos.push("altura da edificação não informada: a " + row.tabelaIT01 + " separa por altura (" + classes.join(" · ") + ")");
          ctx.pendencia("entrada.incendio.altura_m", "altura da edificação (IT 01) não informada — a exigência depende da faixa de altura", "enquadramento — " + NOME_MEDIDA[m]);
          return;
        }
        M.valor = v;
        M.passos.push(row.tabelaIT01 + " da IT 01 (PDF p." + row.pagina_pdf + "), " + div + (col.length === 1 ? " (sem faixa de altura)" : ", altura " + f2(e.altura_m) + " m → faixa " + e.faixaAltura) + ": \"" + v + "\"");
        if (/^-/.test(String(v))) { M.exigido = false; M.passos.push("não exigido pela tabela"); return; }
        var ns = String(v).match(/\(\d+\)/g) || [], res = true;
        ns.forEach(function (n) {
          var txt = notas[n] || "", r = avaliarNota(txt, m, div, areaRef, e.construidaAte2005);
          M.notas.push({ nota: n, texto: txt, efeito: r.efeito });
          M.passos.push("nota " + n + ": " + r.passo);
          if (r.exigido === false) res = false;
          else if (r.exigido === null && res !== false) res = null;
        });
        if (res === null) {
          var resp = ent.condicoes && typeof ent.condicoes[m] === "boolean" ? ent.condicoes[m] : null;
          if (resp !== null) { res = resp; premissa("condição da nota da IT 01 (" + NOME_MEDIDA[m] + ")", resp ? "atendida — medida exigida (RT)" : "não se aplica — medida não exigida (RT)", "entrada", fonte); M.passos.push("condição respondida pelo RT: " + (resp ? "exigido" : "não exigido")); }
          else ctx.pendencia("entrada.incendio.condicoes." + m, "a exigência de " + NOME_MEDIDA[m] + " depende de condição da nota da IT 01 que o motor não avalia (" + M.notas.map(function (x) { return x.nota + " " + x.texto; }).join(" | ") + ") — o RT responde em condicoes." + m, "enquadramento");
        }
        M.exigido = res;
      });
      /* isenções da IT 17 (Anexo D): só o RT declara; D.1.1 é sugerida quando a carga informada cabe */
      var ex = e.medidas.hidrantes_mangotinhos;
      var isen = ctx.linhas(K.isen, null, "enquadramento — isenções da IT 17");
      if (isen) {
        e.isencoesPossiveis = isen.map(function (l) { return { item: l.item, caso: l.caso, condicao: l.condicao }; });
        if (ex.exigido === true) {
          arr(ent.isencoes).forEach(function (it) {
            var l = isen.filter(function (x) { return String(x.item).split(/\s+e\s+|,\s*/).indexOf(it) >= 0 || x.item === it; })[0];
            if (!l) { aviso("aviso", "isenção \"" + it + "\" declarada não existe no Anexo D da IT 17", [], { texto: "corrigir o item (" + isen.map(function (x) { return x.item; }).join(", ") + ")" }); return; }
            /* ⚠ revisão INC C1 (decisão do RT, 17/10/2026): a isenção só vale se o motor CONFERE a condição do
               item. Antes qualquer item do Anexo D zerava o sistema inteiro (A-2 com "D.2" saía com reserva 0 e
               ok). D.1.1 = uso industrial (grupo I) E carga ≤ a do texto; D.1.5 = depósito (grupo J) E carga ≤ a do
               texto; D.2 isenta só os PONTOS do pavimento marcado, nunca o sistema; condição que o motor não
               confere (D.1.2–D.1.4) → isenção PENDENTE de confirmação do RT (ok = false). */
            var cod = String(l.item).split(/\s+/)[0], fI = fonteDe(K.isen, l.item), cargaI = num(ent.cargaIncendio_MJm2, null);
            if (cod === "D.2") {
              e.isencaoD2 = true;
              ex.passos.push("D.2 da IT 17 declarada: o SISTEMA continua exigido; só os pontos dos pavimentos marcados (isencaoD2) ficam dispensados, se o hidrante do pavimento vizinho os alcançar (" + l.condicao + ")");
              if (!pavs.some(function (p) { return p.isencaoD2; })) ctx.pendencia("entrada.incendio.pavimentos[].isencaoD2", "isenção D.2 declarada sem marcar o pavimento (edícula, mezanino, sobreloja, zeladoria, duplex/triplex) a que se aplica", "enquadramento — isenção D.2");
              return;
            }
            var mC = new RegExp("(?:inferior a|até) " + RE_NUM + " MJ").exec(String(l.condicao)), gExig = ISENCAO_GRUPO[cod];
            if (gExig && mC) {
              var limC = numBR(mC[1]), okG = e.grupoLetra === gExig, okCg = cargaI != null && cargaI <= limC;
              if (okG && okCg) {
                ex.exigido = false; e.isencoes.push(l.item);
                ex.passos.push("isento pelo " + l.item + " da IT 17: grupo " + gExig + " e carga " + f2(cargaI) + " ≤ " + f2(limC) + " MJ/m² (conferidos)");
                premissa("isenção de hidrantes (IT 17 " + l.item + ")", l.caso + " — " + l.condicao + " (grupo e carga conferidos)", "entrada", fI);
              } else aviso("erro", "isenção " + l.item + " recusada: exige " + String(l.caso).toLowerCase() + " (grupo " + gExig + ") e " + l.condicao + " — a edificação é " + div + (cargaI != null ? " com " + f2(cargaI) + " MJ/m²" : " sem carga informada"), [],
                           { texto: "retirar \"" + it + "\" das isenções: o sistema de hidrantes continua exigido" });
              return;
            }
            var cf = confirmacaoRT(cod);
            if (cf) { ex.exigido = false; e.isencoes.push(l.item); ex.passos.push("isento pelo " + l.item + " da IT 17: condição confirmada pelo RT " + cf.responsavel + " — " + cf.justificativa); return; }
            ex.exigido = null; e.isencoesPendentes = (e.isencoesPendentes || []).concat([l.item]);
            ex.passos.push("isenção " + l.item + " declarada (" + l.caso + ": " + l.condicao + ") — condição que o motor não confere: PENDENTE de confirmação do RT");
            ctx.pendencia("entrada.incendio.isencoes." + cod, "isenção " + l.item + " da IT 17 (" + l.caso + ": " + l.condicao + ") depende de condição que o motor não confere — pendente de confirmação do RT", "enquadramento — isenção");
          });
          var carga = num(ent.cargaIncendio_MJm2, null), d11 = isen.filter(function (x) { return x.item === "D.1.1"; })[0], m11 = d11 && new RegExp("inferior a " + RE_NUM + " MJ").exec(d11.condicao);
          if (ex.exigido === true && e.grupoLetra === "I" && carga != null && m11 && carga <= numBR(m11[1]))
            aviso("info", "a carga de incêndio informada (" + f2(carga) + " MJ/m²) permite a isenção D.1.1 da IT 17 se a área for exclusivamente industrial", [], { texto: "se for o caso, declarar isencoes: [\"D.1.1\"] (decisão do RT)" });
        }
      }
      var algumNull = MEDIDAS.some(function (m) { return e.medidas[m].exigido === null; });
      e.status = algumNull ? "pendente" : "ok";
      return e;
    }
    /* nota da IT 01: limite de área (lido do texto), "somente para a divisão X", ou observação */
    function avaliarNota(txt, medida, div, area, ate2005) {
      var t = String(txt), m;
      if ((m = new RegExp("Exigido quando a área total for superior a " + RE_NUM + " m2").exec(t))) {
        var lim = numBR(m[1]), m2 = new RegExp("área considerada é superior a " + RE_NUM + " m2").exec(t);
        if (ate2005 && m2) lim = numBR(m2[1]);
        if (area == null) { ctx.pendencia("entrada.incendio.area_m2", "área total da edificação (IT 01 E.5) não informada — a exigência depende dela", "enquadramento — " + NOME_MEDIDA[medida]); return { exigido: null, efeito: "área", passo: "depende da área total (> " + f2(lim) + " m²), não informada" }; }
        return { exigido: area > lim, efeito: "área", passo: "área total " + f2(area) + " m² " + (area > lim ? ">" : "≤") + " " + f2(lim) + " m²" + (ate2005 && m2 ? " (construção até 01/07/2005)" : "") + " → " + (area > lim ? "exigido" : "não exigido") };
      }
      if ((m = new RegExp("^(Somente|Apenas) para (a )?divis[ãa]o ([A-M]-\\d+)").exec(t))) {
        var alvo = m[m.length - 1], resto = t.slice(m[0].length).replace(/^[.\s]+$/, "");
        if (alvo !== div) return { exigido: false, efeito: "divisão", passo: "só para a divisão " + alvo + " → não exigido para " + div };
        return resto ? { exigido: null, efeito: "condição", passo: "exigido para " + alvo + " com condição: " + t } : { exigido: true, efeito: "divisão", passo: "exigido para " + alvo };
      }
      return { exigido: true, efeito: "observação", passo: "exigido; observação: " + t };
    }

    /* ------------------------------------------------------------------ 2. TIPO E RESERVA */
    var HX = out.hidrantes = { exigido: E.medidas.hidrantes_mangotinhos.exigido, tipo: null, sistema: null, vazaoMin_lpm: null, mangueira: null, alcance_m: null, esguichosPorPonto: null,
                               pontos: [], cobertura: [], calculo: null, trechos: [], bomba: null, jockey: null, pocoSuccao: null, componentes: [] };
    var R = out.reserva = { hidrantes_m3: null, chuveiros_m3: null, total_m3: null, total_L: null, status: "pendente", passos: [], fonte: [] };
    if (HX.exigido === true) tipoEReserva();
    else if (HX.exigido === false) { R.hidrantes_m3 = 0; R.passos.push("hidrantes/mangotinhos não exigidos: reserva técnica dos hidrantes = 0"); }
    function tipoEReserva() {
      if (NBR) { tipoReserva13714(); return; }
      var ls = ctx.linhas(K.ri, null, "reserva de incêndio (IT 17 Tabela 4)");
      if (!ls) return;
      var div = E.divisao, area = E.area_m2, carga = num(ent.cargaIncendio_MJm2, null);
      if (area == null) { ctx.pendencia("entrada.incendio.area_m2", "área total não informada — a Tabela 4 da IT 17 é por faixa de área", "reserva"); return; }
      /* cláusulas que citam a divisão: as sem carga valem direto; as com carga pedem a carga */
      var grupos = {}, ordem = [];
      ls.forEach(function (l) { if (!grupos[l.grupo_divisao]) { grupos[l.grupo_divisao] = []; ordem.push(l.grupo_divisao); } grupos[l.grupo_divisao].push(l); });
      var achado = null, pedeCarga = false;
      ordem.forEach(function (g) {
        if (achado) return;
        clausulasRI(g).forEach(function (c) {
          if (achado || c.divisoes.indexOf(div) < 0) return;
          if (!c.comCarga) { achado = { grupo: g, clausula: c }; return; }
          if (carga == null) { pedeCarga = true; return; }
          if ((c.cargaMin == null || carga > c.cargaMin) && (c.cargaMax == null || carga <= c.cargaMax)) achado = { grupo: g, clausula: c };
        });
      });
      if (!achado) {
        if (pedeCarga) { ctx.pendencia("entrada.incendio.cargaIncendio_MJm2", "a Tabela 4 da IT 17 separa a divisão " + div + " pela carga de incêndio (IT 09, fora da base) — o RT informa a carga", "reserva");
                         ctx.consulta(K.riFora, null, "valor", "reserva — carga de incêndio por ocupação"); }
        else ctx.pendencia(K.ri + "[" + div + "]", "a divisão " + div + (carga != null ? " com carga " + f2(carga) + " MJ/m²" : "") + " não aparece na Tabela 4 da IT 17 (M-2: NBR 17505; M-5/M-8: IT específica)", "reserva");
        return;
      }
      var linhasG = grupos[achado.grupo].map(function (l) { return { l: l, f: faixaArea(l.area_edificacao_m2) }; }).filter(function (x) { return x.f; })
        .sort(function (a, b) { return (a.f.ate == null ? Infinity : a.f.ate) - (b.f.ate == null ? Infinity : b.f.ate); });
      var lin = null;
      linhasG.forEach(function (x) { if (!lin && (x.f.ate == null ? area > x.f.de : area <= x.f.ate)) lin = x.l; });
      if (!lin) { ctx.pendencia(K.ri + "[" + div + ", " + area + " m²]", "faixa de área não encontrada na Tabela 4", "reserva"); return; }
      var tipos = String(lin.tipo_de_sistema).match(/\d+/g).map(Number), tipo = tipos[0];
      if (tipos.length > 1) {
        var pedido = num(ent.tipoSistema, null);
        if (pedido != null && tipos.indexOf(pedido) >= 0) { tipo = pedido; premissa("tipo do sistema (IT 17 Tabela 4)", "Tipo " + tipo + " — escolha do projetista entre " + lin.tipo_de_sistema, "entrada", fonteDe(K.ri)); }
        else { premissa("tipo do sistema (IT 17 Tabela 4)", "Tipo " + tipo + " (a tabela admite " + lin.tipo_de_sistema + "; informe tipoSistema para trocar)", "padrao_motor", fonteDe(K.ri)); if (pedido != null) aviso("aviso", "tipoSistema " + pedido + " não é admitido para " + div + " com " + f2(area) + " m² (" + lin.tipo_de_sistema + ")", [], { texto: "usar " + lin.tipo_de_sistema }); }
      }
      var ri = tipos.length > 1 && tipo === tipos[1] ? num(lin.ri_m3_se_tipo2_primeira_coluna, null) : num(lin.ri_m3, null);
      var fR = fonteDe(K.ri, "faixa " + lin.area_edificacao_m2 + " m²");
      HX.tipo = tipo;
      R.hidrantes_m3 = ri; R.fonte.push(fR);
      R.passos.push("IT 17 Tabela 4: " + div + (achado.clausula.comCarga ? " com carga " + f2(carga) + " MJ/m² (" + achado.clausula.texto + ")" : "") + ", área " + f2(area) + " m² → faixa \"" + lin.area_edificacao_m2 + "\" → Tipo " + tipo + ", R.I. = " + f2(ri) + " m³");
      if (achado.clausula.comCarga) premissa("carga de incêndio (IT 09)", f2(carga) + " MJ/m² — informada pelo RT (IT 09 fora da base)", "entrada");
    }

    /* NBR 13714: tipo pela Tabela D.1, reserva V = Q·t (5.4.2: 2 saídas, 60/30 min) ou alternativo D.7 */
    function tipoReserva13714() {
      var la = ctx.linhas(K.n13apl, null, "reserva — NBR 13714 Tabela D.1"); if (!la) return;
      var l = la.filter(function (x) { var ds = String(x.divisoes).split(/\s+/); return ds.indexOf(E.divisao) >= 0; })[0] || la.filter(function (x) { return String(x.divisoes) === E.grupoLetra; })[0];
      if (!l) { ctx.pendencia(K.n13apl + "[" + E.divisao + "]", "a divisão " + E.divisao + " não está na Tabela D.1 da NBR 13714 — o RT escolhe o tipo (tipoSistema)", "reserva — NBR 13714"); if (num(ent.tipoSistema, null) == null) return; }
      var tipo = l ? num(l.tipo, null) : num(ent.tipoSistema, null);
      if (l && num(ent.tipoSistema, null) != null && num(ent.tipoSistema, null) !== tipo) aviso("aviso", "tipoSistema " + ent.tipoSistema + " diferente do da Tabela D.1 (" + tipo + ") para " + E.divisao, [], { texto: "usar o tipo " + tipo + " da Tabela D.1" });
      HX.tipo = tipo; HX.vazao13714 = l ? num(l.vazao_lpm, null) : null;
      var fR = fonteDe(K.n13apl, l ? "D.1 (" + l.divisoes + (l.nota ? ", " + l.nota : "") + ")" : "tipo do RT");
      if (ent.alternativoD7 && tipo === 1) {
        var ld = ctx.linhas(K.n13d7, null, "reserva — NBR 13714 D.7"), n = num(ent.nHidrantes, null);
        if (n == null) n = ent.rede && arr(ent.rede.hidrantes).length ? arr(ent.rede.hidrantes).length : pavs.reduce(function (s2, p) { return s2 + arr(p.hidrantes).length; }, 0) || null;
        if (n == null) { ctx.pendencia("entrada.incendio.nHidrantes", "D.7: a simultaneidade depende do nº de hidrantes instalados (informe nHidrantes)", "reserva — NBR 13714 D.7"); return; }
        var lx = ld && ld.filter(function (x) { return n >= num(x.instalados_de, 0) && (x.instalados_ate == null || n <= num(x.instalados_ate, 0)); })[0];
        if (!lx) return;
        HX.alternativoD7 = { instalados: n, simultaneos: num(lx.simultaneos, 0), vazao_lpm: num(lx.vazao_lpm, 0) };
        HX.vazao13714 = num(lx.vazao_lpm, 0);
        R.hidrantes_m3 = num(lx.simultaneos, 0) * num(lx.vazao_lpm, 0) * num(lx.duracao_min, 0) / L_POR_M3; R.fonte.push(fonteDe(K.n13d7));
        R.passos.push("NBR 13714 D.7 (alternativo ao tipo 1): " + n + " hidrante(s) → " + lx.simultaneos + " simultâneo(s) × " + lx.vazao_lpm + " L/min × " + lx.duracao_min + " min = " + f2(R.hidrantes_m3) + " m³");
        if (num(lx.simultaneos, 0) > 2) { ctx.pendencia("calculo.hidrantes.simultaneidade_d7", "D.7 pede " + lx.simultaneos + " jatos simultâneos; o cálculo hidráulico do motor considera 2 — o RT confere a rede com " + lx.simultaneos, "hidrantes — NBR 13714 D.7"); }
        return;
      }
      var lt = ctx.consulta(K.n13tipos, { tipo: tipo }, "vazao_lpm", "reserva — NBR 13714 Tabela 1"), du = ctx.consulta(K.n13dur, { tipo: tipo }, "duracao_min", "reserva — NBR 13714 5.4.2");
      if (!lt.ok || !du.ok) return;
      var q = HX.vazao13714 != null ? HX.vazao13714 : num(lt.valor, null), sai = num(du.linha.saidas_simultaneas, 0), t = num(du.valor, 0);
      R.hidrantes_m3 = sai * q * t / L_POR_M3; R.fonte.push(fR); R.fonte.push(du.fonte);
      R.passos.push("NBR 13714: " + E.divisao + " → Tipo " + tipo + " (Tabela D.1), " + f2(q) + " L/min por saída; V = Q·t = " + sai + " saídas × " + f2(q) + " L/min × " + t + " min (5.4.2) = " + f2(R.hidrantes_m3) + " m³");
    }

    /* ------------------------------------------------------------------ 3. HIDRANTES */
    var KEsg = null, PvAt = null, tipoRow = null;
    if (HX.exigido === true && HX.tipo != null) hidrantes();
    else if (HX.exigido === true) verif("hidrantes", "sistema de hidrantes/mangotinhos", null, null, "", null, ["pendente: tipo do sistema não determinado (ver pendências da reserva)"], fonteDe(K.ri));
    function hidrantes() {
      if (NBR) { hidrantes13714(); coberturaHidrantes(HX.esguichosPorPonto, null); redeHidrantes(); alcanceJato(); return; }
      var cTipo = ctx.consulta(K.tipos, { tipo: HX.tipo }, "vazao_min_hidrante_mais_desfavoravel_lpm", "hidrantes — Tabela 2");
      if (!cTipo.ok) return;
      tipoRow = cTipo.linha;
      HX.sistema = tipoRow.sistema; HX.esguicho = tipoRow.esguicho; HX.expedicoes = tipoRow.expedicoes;
      var Q = num(cTipo.valor, null), passosQ = ["IT 17 Tabela 2, Tipo " + HX.tipo + " (" + tipoRow.sistema + "): vazão mínima " + f2(Q) + " L/min por saída"];
      var mG = new RegExp("Vazão mínima " + RE_NUM + " L/min para edificações do Grupo ([A-M])").exec(String(tipoRow.notas || ""));
      if (mG && E.grupoLetra === mG[2]) { Q = numBR(mG[1]); passosQ.push("nota da Tabela 2: Grupo " + mG[2] + " → " + f2(Q) + " L/min"); }
      HX.vazaoMin_lpm = Q; HX.passosVazao = passosQ;
      /* comprimento de mangueira: Tabela 2; A-2/A-3 tipo 2 admite o da regra 5.8.3 quando o trajeto passa do da tabela */
      var Lm = num(tipoRow.comprimento_max_mangueira_m, null), passosL = ["mangueira: até " + f2(Lm) + " m (Tabela 2)"];
      if ((E.divisao === "A-2" || E.divisao === "A-3") && HX.tipo !== 1) {
        var r583 = regra(K.r17, "item_IT17", "5.8.3", null, "hidrantes — mangueira A-2/A-3");
        if (r583 && r583.num != null && r583.num > Lm) { Lm = r583.num; passosL.push("IT 17 5.8.3 (A-2/A-3): admite " + f2(Lm) + " m quando o trajeto real passa do da Tabela 2"); premissa("comprimento de mangueira (A-2/A-3)", f2(Lm) + " m (IT 17 5.8.3) — o lance real fica no projeto do abrigo", "norma", r583.fonte); }
      }
      HX.mangueira = { comprimento_m: Lm, dn: tipoRow.mangueira_dn_mm, passos: passosL };
      HX.alcance_m = Lm;
      var r582 = regra(K.r17, "item_IT17", "5.8.2", null, "hidrantes — cobertura"), nEsg = null;
      if (r582) { var re = /(\d+)\s*\(tipos?\s*([^)]*)\)/g, mm; while ((mm = re.exec(String(r582.valor)))) { var fx = mm[2].split(/[-–]/).map(Number); if (HX.tipo >= fx[0] && HX.tipo <= (fx.length > 1 ? fx[1] : fx[0])) nEsg = Number(mm[1]); } }
      HX.esguichosPorPonto = nEsg;
      HX.componentes = (ctx.linhas(K.comp, null, "hidrantes — componentes") || []).filter(function (l) { return l["tipo" + HX.tipo] === "Sim"; }).map(function (l) { return l.material; });
      /* a 13714 (5.3.2) pede 2 esguichos nos tipos 2 e 3; em MG vale a IT 17 5.8.2 */
      var l13 = NR().consulta(K.n13tipos, { tipo: HX.tipo }, "saidas");
      if (l13.ok && nEsg != null && num(l13.valor, 0) !== nEsg) nota13("5.3.2", "cobertura por " + l13.valor + " esguicho(s) no tipo " + HX.tipo + " (a IT 17 5.8.2 pede " + nEsg + ")");
      coberturaHidrantes(nEsg, r582);
      redeHidrantes();
      alcanceJato();
    }
    /* NBR 13714 Tabela 1 / 5.3.2 / D.2–D.4 / D.7 */
    function hidrantes13714() {
      var c = ctx.consulta(K.n13tipos, { tipo: HX.tipo }, "vazao_lpm", "hidrantes — NBR 13714 Tabela 1"); if (!c.ok) return;
      tipoRow = c.linha;
      var Q = HX.vazao13714 != null ? HX.vazao13714 : num(c.valor, null);
      HX.sistema = HX.tipo === 1 ? "Mangotinho" : "Hidrante"; HX.esguicho = tipoRow.esguicho; HX.expedicoes = num(tipoRow.saidas, 1) > 1 ? "Duplo" : "Simples";
      HX.vazaoMin_lpm = Q; HX.passosVazao = ["NBR 13714 Tabela 1, Tipo " + HX.tipo + ": " + f2(Q) + " L/min por saída" + (HX.alternativoD7 ? " (alternativo D.7)" : (HX.vazao13714 != null ? " (Tabela D.1)" : ""))];
      if (HX.alternativoD7) { var fd7 = fonteDe(K.n13d7); var m13 = /esguicho de (\d+) mm/.exec(String((fd7 || {}).tabela || "")) || /esguicho (\d+) mm/.exec(String((fd7 || {}).tabela || "")); if (m13) tipoRow = { esguicho: "jato compacto Ø" + m13[1] + " mm", comprimento_max_m: tipoRow.comprimento_max_m, mangueira_dn_mm: "40", saidas: 1 }; }
      var Lm = num(tipoRow.comprimento_max_m, null);
      HX.mangueira = { comprimento_m: Lm, dn: tipoRow.mangueira_dn_mm, passos: ["mangueira: até " + f2(Lm) + " m (NBR 13714 Tabela 1)"] };
      HX.alcance_m = Lm;
      HX.esguichosPorPonto = num(tipoRow.saidas, 1);   /* 5.3.2: 1 esguicho (tipo 1), 2 (tipos 2 e 3) */
      HX.componentes = (ctx.linhas(K.n13comp, null, "hidrantes — NBR 13714 Tabela 2") || []).filter(function (l) { return l["tipo" + HX.tipo] === "Sim"; }).map(function (l) { return l.material; });
    }
    function alcanceJato() {
      /* alcance do jato (IT 17 5.12.1 = NBR 13714 4.4.1): depende da curva do esguicho na pressão do mais desfavorável —
         dado do FABRICANTE; sem ele a verificação fica pendente (nunca "atende" sem a curva) */
      var rJ = NBR ? r13("4.4.1", null, "hidrantes — alcance do jato") : regra(K.r17, "item_IT17", "5.12.1 e 5.12.1.1", null, "hidrantes — alcance do jato");
      if (rJ) { var aJ = num((ent.esguicho || {}).alcance_m, null);
        if (aJ == null) { verif("esguicho", "alcance do jato compacto", null, rJ.num, "m", null, ["pendente: informe esguicho.alcance_m (curva do fabricante na pressão do esguicho mais desfavorável" + (HX.calculo ? ", " + f2(HX.calculo.PA_esg) + " mca" : "") + ")"], rJ.fonte, "min");
                          ctx.pendencia("entrada.incendio.esguicho.alcance_m", "alcance do jato do esguicho (fabricante) não informado — " + (NBR ? "NBR 13714 4.4.1" : "IT 17 5.12.1") + " pede ≥ " + f2(rJ.num) + " m", "hidrantes — alcance do jato"); }
        else verif("esguicho", "alcance do jato compacto", aJ, rJ.num, "m", aJ >= rJ.num, ["alcance do fabricante " + f2(aJ) + " m na pressão do mais desfavorável" + (HX.calculo ? " (" + f2(HX.calculo.PA_esg) + " mca)" : "") + " ≥ " + f2(rJ.num) + " m"], rJ.fonte, "min"); }
    }

    function coberturaHidrantes(nEsg, r582) {
      var r571 = NBR ? r13("5.2.1", "acessos", "hidrantes — distância ao acesso") : regra(K.r17, "item_IT17", "5.7.1 a", null, "hidrantes — distância ao acesso");
      var raio = r571 ? r571.num : null, alturaT = NBR ? r13("5.2.1", "Altura", "hidrantes — altura da tomada") : regra(K.r17, "item_IT17", "5.7.1 d", null, "hidrantes — altura da tomada"), yT = null;
      if (!NBR) { var a13 = NR().consulta(K.r13, { item: "5.2.1" }, "valor"); if (a13.ok && raio != null && num(a13.valor, null) !== raio) nota13("5.2.1", "hidrante a no máximo " + a13.valor + " m dos acessos (a IT 17 5.7.1 a admite " + f2(raio) + " m)"); }
      if (!r582) r582 = { fonte: fonteDe(K.n13tipos, "5.3.2") };
      if (alturaT) { var hs = String(alturaT.valor).match(/[\d,]+/g); if (hs && hs.length) yT = hs.map(numBR).reduce(function (s, v) { return s + v; }, 0) / hs.length; }
      if (!pavs.length) { verif("hidrantes", "cobertura dos hidrantes", null, HX.alcance_m, "m", null, ["pendente: pavimentos sem geometria (polígono) — informe pavimentos[].poligono"], r582 && r582.fonte); ctx.pendencia("entrada.incendio.pavimentos", "pavimentos não informados — sem geometria não há como verificar a cobertura (IT 17 5.8.2)", "hidrantes"); return; }
      pavs.forEach(function (pv, ip) {
        var nome = pv.nome || ("pavimento " + (ip + 1)), ex = arr(pv.hidrantes).map(function (h) { return { id: h.id, x: num(h.x, 0), z: num(h.z != null ? h.z : h.y, 0) }; });
        ex.forEach(function (h) { HX.pontos.push({ id: h.id, pavimento: nome, x: h.x, z: h.z, origem: "modelo" }); });
        /* ⚠ revisão INC C1: D.2 dispensa os PONTOS deste pavimento só se o hidrante do pavimento vizinho o alcançar
           pelo caminhamento (escada não enclausurada) — o motor não tem o caminho entre pavimentos: pendente do RT */
        if (E.isencaoD2 && pv.isencaoD2 && confirmacaoRT("D.2")) {
          HX.cobertura.push({ pavimento: nome, existentes: ex.length, propostos: 0, status: "ok", area_descoberta_m2: null, isencaoD2: true, confirmadoRT: true });
          return;
        }
        if (E.isencaoD2 && pv.isencaoD2) {
          HX.cobertura.push({ pavimento: nome, existentes: ex.length, propostos: 0, status: "pendente", area_descoberta_m2: null, isencaoD2: true });
          verif(nome, "cobertura dos hidrantes — " + nome, null, HX.alcance_m, "m", null, ["pontos dispensados pela D.2 da IT 17: conferir que o hidrante do pavimento mais próximo alcança " + nome + " em até " + f2(HX.alcance_m) + " m de mangueira, com acesso sem escada enclausurada (o motor não tem o caminho entre pavimentos)"], fonteDe(K.isen, "D.2"));
          ctx.pendencia("entrada.incendio.isencoes.D.2[" + nome + "]", "isenção D.2 em " + nome + ": caminhamento a partir do hidrante do pavimento vizinho não conferido pelo motor — pendente de confirmação do RT", "hidrantes — isenção D.2");
          return;
        }
        var M = pv.poligono ? malha(pv.poligono, pv.obstaculos, ent.passoMalha_m) : null;
        var cob = { pavimento: nome, existentes: ex.length, propostos: 0, status: "pendente", area_descoberta_m2: null };
        HX.cobertura.push(cob);
        if (!M || !M.lista.length) {
          verif(nome, "cobertura dos hidrantes — " + nome, ex.length, null, "pontos", null, ["pendente: " + nome + " sem polígono — só a contagem de pontos (" + ex.length + ") é conhecida; a IT 17 5.8.2 pede a cobertura pelo trajeto real"], r582 && r582.fonte);
          ctx.pendencia("entrada.incendio.pavimentos[" + ip + "].poligono", nome + " sem polígono: cobertura dos hidrantes não verificada", "hidrantes");
          return;
        }
        var passos = ["malha de " + f2(M.h) + " m sobre " + f2(M.area_m2) + " m² (" + M.lista.length + " células livres, obstáculos fora); distância = caminho na malha em 16 direções (≥ trajeto real: lado seguro)",
                      "alcance = comprimento da mangueira " + f2(HX.alcance_m) + " m pelo trajeto real, SEM o alcance do jato (IT 17 5.8.2); " + nEsg + " esguicho(s) em cada ponto"];
        if (ex.length) {
          var c = cobertura(M, ex, HX.alcance_m, nEsg);
          cob.area_descoberta_m2 = c.area_descoberta_m2;
          var okC = c.descobertas === 0;
          var faltam = okC ? null : propor(M, ex, HX.alcance_m, nEsg, [], null);
          passos.push(okC ? "todas as células alcançadas" : f2(c.area_descoberta_m2) + " m² sem alcance (ex.: " + c.exemplos.map(function (p) { return "x " + f2(p.x) + ", z " + f2(p.z); }).join("; ") + ")");
          verif(nome, "cobertura dos hidrantes — " + nome, c.area_descoberta_m2, 0, "m² descobertos", okC, passos, r582 && r582.fonte, "max");
          cob.status = okC ? "ok" : "reprovado";
          if (!okC) {
            var opsF = faltam.pontos.map(function (p, k) { return opPeca("inc-hid-" + ip + "-a" + k, "hidrante_abrigo", p, pv, yT); });
            aviso("erro", nome + ": " + f2(c.area_descoberta_m2) + " m² fora do alcance das mangueiras (" + f2(HX.alcance_m) + " m pelo trajeto real)", ex.map(function (h) { return h.id; }),
                  { texto: "acrescentar " + faltam.pontos.length + " ponto(s) de hidrante nas posições sugeridas (ajustar à parede e reverificar)", ops: opsF });
          }
          pertoDoAcesso(nome, M, pv, ip, ex, raio, r571 && r571.fonte, "hidrante", "hidrante_abrigo", yT, NBR ? "NBR 13714 5.2.1" : "IT 17 5.7.1 a");
        } else {
          var pr = propor(M, [], HX.alcance_m, nEsg, pv.acessos, arr(pv.acessos).length ? raio : null);
          cob.propostos = pr.pontos.length; cob.area_descoberta_m2 = pr.area_descoberta_m2;
          pr.pontos.forEach(function (p, k) { var id = "inc-hid-" + ip + "-" + k; HX.pontos.push({ id: id, pavimento: nome, x: p.x, z: p.z, origem: "proposto" }); out.ops.push(opPeca(id, "hidrante_abrigo", p, pv, yT)); out.opsDesfazer.push({ op: "apagar", id: id }); });
          var okP = pr.descobertas === 0;
          pertoDoAcesso(nome, M, pv, ip, pr.pontos, raio, r571 && r571.fonte, "hidrante", "hidrante_abrigo", yT, NBR ? "NBR 13714 5.2.1" : "IT 17 5.7.1 a");
          passos.push("sem hidrante no modelo: " + pr.pontos.length + " ponto(s) propostos" + (arr(pv.acessos).length && raio != null ? " (o 1º a até " + f2(raio) + " m de um acesso, IT 17 5.7.1 a)" : "") + (okP ? ", cobertura completa" : ", " + f2(pr.area_descoberta_m2) + " m² inalcançáveis"));
          verif(nome, "cobertura dos hidrantes — " + nome, pr.area_descoberta_m2, 0, "m² descobertos", okP, passos, r582 && r582.fonte, "max");
          cob.status = okP ? "ok" : "reprovado";
          if (!okP) aviso("erro", nome + ": área sem acesso pelos caminhos da malha (" + f2(pr.area_descoberta_m2) + " m²) — compartimento fechado ou obstáculo cobrindo a passagem", [], { texto: "conferir portas/obstáculos do pavimento ou prever ponto dentro do compartimento" });
        }
      });
    }
    /* ⚠ revisão INC A2: a distância do acesso (porta da entrada principal / do pavimento / escada) até o ponto
       mais próximo é VERIFICADA — nos modelados e nos sugeridos. Antes só posicionava a proposta e um extintor a
       14 m do acesso saía "ok". Sem acessos no pavimento: pendente (nunca "atende"). */
    function pertoDoAcesso(nome, M, pv, ip, pontos, raio, fonte, rotulo, peca, yRel, item) {
      if (raio == null) return;
      var ids = pontos.map(function (p) { return p.id; }).filter(Boolean);
      if (!arr(pv.acessos).length) {
        verif(nome, rotulo + " a até " + f2(raio) + " m de um acesso — " + nome, null, raio, "m", null, ["pendente: " + nome + " sem acessos (portas/escadas) informados — " + item], fonte, "max");
        ctx.pendencia("entrada.incendio.pavimentos[" + ip + "].acessos", nome + " sem acessos: distância do " + rotulo + " ao acesso (" + item + ") não verificada", rotulo);
        return;
      }
      var dA = Infinity;
      pts(pv.acessos).forEach(function (a) { var d = caminhos(M, a); pontos.forEach(function (h) { var ch = celulaDe(M, h); if (ch) dA = Math.min(dA, d[ch.i] + ch.d); }); });
      var ok = dA <= raio;
      verif(nome, rotulo + " a até " + f2(raio) + " m de um acesso — " + nome, dA, raio, "m", ok, ["menor caminho de um acesso ao " + rotulo + " mais próximo = " + f2(dA) + " m (" + item + ")"], fonte, "max");
      if (!ok) {
        var pr = propor(M, [], raio, 1, pv.acessos, raio), p0 = pr.pontos[0];
        aviso("erro", nome + ": nenhum " + rotulo + " a até " + f2(raio) + " m de um acesso (o mais próximo a " + f2(dA) + " m, " + item + ")", ids,
              { texto: "pôr um " + rotulo + " junto ao acesso" + (p0 ? " (posição sugerida x " + f2(p0.x) + ", z " + f2(p0.z) + ")" : ""), ops: p0 ? [opPeca("inc-" + peca + "-acesso-" + ip, peca, p0, pv, yRel)] : [] });
      }
    }
    function opPeca(id, peca, p, pv, yRel) {
      var y = num(pv.cota, 0) + (yRel == null ? 0 : yRel);
      var oP = { op: "peca", id: id, peca: peca, sistema: SIS, x: Math.round(p.x * L_POR_M3) / L_POR_M3, y: Math.round(y * L_POR_M3) / L_POR_M3, z: Math.round(p.z * L_POR_M3) / L_POR_M3 };
      /* a capacidade que o PROPRIO Hidro calculou para o risco (EX.tipoSugerido.capacidadeExigida, IT 16 Tabelas 4 e 5) vai gravada na peca: o auditor e o
         lancador do incendio (js/incauto.js, js/incauditor.js) contam o extintor como po ABC dessa capacidade (revisao 27/10/2026: sem ela a peca perdeu a
         cobertura e o lancador punha outro ao lado) */
      if (peca === "extintor" && EX && EX.tipoSugerido && EX.tipoSugerido.capacidadeExigida) oP.capacidade = String(EX.tipoSugerido.capacidadeExigida);
      return oP;
    }

    /* ----------------------------- rede: 2 jatos mais desfavoráveis, perdas, DN, fonte */
    function redeHidrantes() {
      var rd = ent.rede;
      if (!rd || !arr(rd.trechos).length) {
        verif("rede", "cálculo hidráulico dos hidrantes", null, null, "", null, ["pendente: rede de incêndio não informada (trechos, nós com cota, hidrantes e origem) — traçar a rede e recalcular"], fonteDe(K.r17, "item 5.8"));
        ctx.pendencia("entrada.incendio.rede", "rede de incêndio não modelada: sem ela não há perda de carga, pressão no esguicho nem bomba", "hidrantes");
        return;
      }
      var Qmin = HX.vazaoMin_lpm, mat = rd.material || "aco_galvanizado";
      /* C de Hazen-Williams (Tabela 1) */
      var nomeTubo = rd.tipoTubo || TUBO_HW[mat];
      var cC = nomeTubo ? ctx.consulta(K.hw, { tipo_de_tubo: nomeTubo }, "C", "hidrantes — C de Hazen-Williams") : null;
      if (!nomeTubo) ctx.pendencia("entrada.incendio.rede.material", "material \"" + mat + "\" sem linha na Tabela 1 da IT 17 (informe rede.tipoTubo com o nome da tabela)", "hidrantes");
      var C = cC && cC.ok ? num(cC.valor, null) : null;
      /* esguicho: K do fabricante, ou Cd + Ø do requinte (Tabela 2) por Torricelli, ou pressão no esguicho com a vazão mínima */
      var eg = ent.esguicho || {}, passosE = [];
      if (num(eg.k_lpm_mca05, null) != null) { KEsg = num(eg.k_lpm_mca05, null); passosE.push("esguicho: K = " + f2(KEsg) + " L/min/mca^½ (fabricante, entrada)"); }
      else if (num(eg.pressao_mca, null) != null && Qmin) { KEsg = Qmin / Math.sqrt(num(eg.pressao_mca, 0)); passosE.push("esguicho: " + f2(eg.pressao_mca) + " mca com " + f2(Qmin) + " L/min (fabricante) → K = " + f2(KEsg)); }
      else if (num(eg.cd, null) != null) {
        var mO = /Ø\s*(\d+)\s*mm/.exec(String(tipoRow.esguicho || "")), dO = num(eg.diametro_mm, mO ? Number(mO[1]) : null);
        if (dO != null) { KEsg = kEsguicho(num(eg.cd, 0), dO); passosE.push("esguicho de jato compacto Ø " + f2(dO) + " mm (Tabela 2), Cd = " + f2(eg.cd) + " (fabricante): K = Cd·A·√(2g) = " + f2(KEsg) + " L/min/mca^½"); }
      }
      if (KEsg == null) ctx.pendencia("entrada.incendio.esguicho", "coeficiente do esguicho não informado (k_lpm_mca05, pressao_mca na vazão mínima, ou cd do requinte) — a IT 17 dá a vazão, não a pressão", "hidrantes — pressão no esguicho");
      var mg = ent.mangueira || {}, Cm = num(mg.c, null), Dm = num(mg.di_mm, null), Lm = num(mg.comprimento_m, HX.mangueira.comprimento_m);
      if (Cm == null || Dm == null) ctx.pendencia("entrada.incendio.mangueira", "C de Hazen-Williams e diâmetro interno da mangueira (fabricante; a IT 17 Tabela 1 não traz mangueira) não informados", "hidrantes — perda na mangueira");
      if (Lm > HX.mangueira.comprimento_m) verif("mangueira", "comprimento da mangueira", Lm, HX.mangueira.comprimento_m, "m", false, ["mangueira informada " + f2(Lm) + " m > " + f2(HX.mangueira.comprimento_m) + " m"], fonteDe(K.tipos, "Tipo " + HX.tipo), "max");
      if (Cm != null && Dm != null) premissa("mangueira de incêndio", "C = " + f2(Cm) + ", Di = " + f2(Dm) + " mm, " + f2(Lm) + " m (fabricante; perda pela fórmula da IT 17)", "entrada");
      passosE.forEach(function (p) { premissa("esguicho", p, "entrada"); });
      /* pressão requerida na válvula do hidrante para a vazão q: esguicho + mangueira */
      function Pv(q) { return KEsg == null || Cm == null || Dm == null ? null : Math.pow(q / KEsg, 2) + jHW(q, Cm, Dm) * Lm; }
      PvAt = Pv;
      if (C == null || Pv(Qmin) == null) { verif("rede", "cálculo hidráulico dos hidrantes", null, null, "", null, ["pendente: " + (C == null ? "C de Hazen-Williams; " : "") + (Pv(Qmin) == null ? "esguicho/mangueira" : "")], fonteDe(K.r17, "item 5.8")); return; }

      /* grafo da rede (árvore a partir da origem) */
      var nos = rd.nos || {}, trs = arr(rd.trechos).map(function (t) { return { id: t.id, de: t.de, para: t.para, L: num(t.comprimento_m, 0), dn: num(t.dn, null), dnModelo: num(t.dn, null), di: num(t.di_mm, null), conexoes: arr(t.conexoes), travado: !!t.travado }; });
      var dis = rd.diametros || diametrosAco(mat, rd.schedule, "hidrantes — DI do tubo de aço") || {};
      var fonteDi = rd.diametros ? "entrada (catálogo do fabricante)" : (ACO[mat] ? "NBR 5590 / ASME B36.10M, Sch " + (rd.schedule || SCH_PADRAO) + ": DI = DE − 2·e" : null);
      if (fonteDi) HX.diametrosInternos = { fonte: fonteDi, dn_di_mm: dis };
      var org = rd.origem || {}, raiz = org.no;
      var adj = {}; trs.forEach(function (t) { (adj[t.de] = adj[t.de] || []).push(t); (adj[t.para] = adj[t.para] || []).push(t); });
      var pai = {}, viaT = {}, fila = [raiz], vis = {}; vis[raiz] = 1;
      while (fila.length) { var n = fila.shift(); arr(adj[n]).forEach(function (t) { var o = t.de === n ? t.para : t.de; if (vis[o]) return; vis[o] = 1; pai[o] = n; viaT[o] = t; fila.push(o); }); }
      function caminho(no) { var c = [], x = no; while (x !== raiz && viaT[x]) { c.unshift(viaT[x]); x = pai[x]; } return x === raiz ? c : null; }
      function cota(no) { return nos[no] && num(nos[no].cota, null); }
      var hids = arr(rd.hidrantes).filter(function (h) { return caminho(h.no) && cota(h.no) != null; });
      arr(rd.hidrantes).forEach(function (h) { if (!caminho(h.no) || cota(h.no) == null) ctx.pendencia("entrada.incendio.rede.hidrantes[" + h.id + "]", "hidrante " + h.id + " sem ligação com a origem " + raiz + " ou sem cota", "hidrantes"); });
      if (!hids.length || cota(raiz) == null) { verif("rede", "cálculo hidráulico dos hidrantes", null, null, "", null, ["pendente: nenhum hidrante ligado à origem com cota"], fonteDe(K.r17, "item 5.8")); return; }
      /* Di e Leq de cada trecho: entrada (catálogo) — a base não tem a NBR 5580/5590 nem Leq de conexão de aço */
      var semDi = {}, semLeq = {};
      function di(t) { var d = t.di != null && t.dn === t.dnModelo ? t.di : num(dis[t.dn], null); if (d == null) semDi[t.dn] = 1; return d; }
      function leq(t) { var s = 0; t.conexoes.forEach(function (c) { var l = num(c.leq_m, null); if (l == null) semLeq[c.tipo || "?"] = 1; else s += l; }); return s; }
      function hf(t, q) { var d = di(t); return d == null ? null : jHW(q, C, d) * (t.L + leq(t)); }
      function soma(lista, q) { var s = 0; for (var i = 0; i < lista.length; i++) { var h = hf(lista[i], q); if (h == null) return null; s += h; } return s; }
      var r5814 = regra(K.r17, "item_IT17", "5.8.14", null, "hidrantes — equilíbrio de pressão");
      /* trecho abaixo do DN mínimo sobe ANTES da conta (o Di do DN do modelo pode nem estar no catálogo) */
      (function () { var dm = dnMinimo(); if (!dm) return; var ok = Object.keys(dis).map(Number).filter(function (d) { return d >= dm.valor && num(dis[d], null) != null; }).sort(function (a, b) { return a - b; });
        if (ok.length) trs.forEach(function (t) { if (!t.travado && (t.dn == null || t.dn < dm.valor)) t.dn = ok[0]; }); })();
      var calc = null, volta;
      for (volta = 0; volta < IT_DIMENSIONAR; volta++) {
        calc = doisJatos(); if (!calc) break;
        if (!dimensionar(calc)) break;
      }
      if (Object.keys(semDi).length) ctx.pendencia("entrada.incendio.rede.diametros", "diâmetro interno dos tubos DN " + Object.keys(semDi).join(", ") + " não informado (NBR 5580/5590 fora da base — informe pelo catálogo do fabricante)", "hidrantes — perda de carga");
      if (Object.keys(semLeq).length) ctx.pendencia("entrada.incendio.rede.conexoes.leq_m", "comprimento equivalente das conexões (" + Object.keys(semLeq).join(", ") + ") não informado — a IT 17 não traz tabela de Leq e a NBR 13714 está fora da base", "hidrantes — perda localizada");
      if (!calc) { verif("rede", "cálculo hidráulico dos hidrantes", null, null, "", null, ["pendente: diâmetro interno ou comprimento equivalente faltando (ver pendências)"], fonteDe(K.r17, "item 5.8.10")); return; }
      HX.calculo = calc;

      function doisJatos() {
        var Pmin = Pv(Qmin);
        var unico = hids.map(function (h) { var s = soma(caminho(h.no), Qmin); return s == null ? null : { h: h, Hreq: cota(h.no) + Pmin + s }; });
        if (unico.some(function (x) { return x === null; })) return null;
        unico.sort(function (a, b) { return b.Hreq - a.Hreq; });
        var A = unico[0].h, B = unico.length > 1 ? unico[1].h : null, res = ancora(A, B);
        if (res && B && res.QB < Qmin) res = ancora(B, A);
        /* ⚠ revisão INC M7: hidrante de expedição DUPLA (Tipo 5) — as 2 saídas do MESMO hidrante abertas
           (2 × a vazão mínima no ramal dele) também é cenário; vale o que exige mais carga na origem (lado
           seguro; a IT 17 não diz qual — premissa para o RT confirmar) */
        if (res && /duplo/i.test(String(HX.expedicoes || ""))) {
          var cA = caminho(A.no), sD = soma(cA, 2 * Qmin);
          if (sD != null) {
            var ED = cota(A.no) + Pv(Qmin) + sD;
            premissa("2 jatos no hidrante de expedição dupla", "considerados os 2 cenários (2 saídas do hidrante " + A.id + " × 2 hidrantes); vale o de maior carga na origem — a IT 17 não define (RT confirma)", "padrao_motor", fonteDe(K.tipos, "Tipo " + HX.tipo));
            if (ED > res.E_origem) res = { A: A.id, B: A.id + " (2ª saída)", duplo: true, QA: Qmin, QB: Qmin, juncao: A.no, E_juncao: cota(A.no) + Pv(Qmin), E_origem: ED,
                                           fluxo: fluxos(cA, [], [], Qmin, Qmin), PA_esg: Math.pow(Qmin / KEsg, 2), PB_esg: Math.pow(Qmin / KEsg, 2), desequilibrio_m: 0 };
          }
        }
        if (res) res.ranking = unico.map(function (x) { return { id: x.h.id, Hreq_m: x.Hreq }; });
        return res;
      }
      /* âncora A com a vazão mínima; B recebe o que a pressão no nó de junção dá (5.8.4) */
      function ancora(A, B) {
        var cA = caminho(A.no), EA = cota(A.no) + Pv(Qmin);
        if (!B) { var s0 = soma(cA, Qmin); return { A: A.id, B: null, QA: Qmin, QB: 0, juncao: raiz, E_origem: EA + s0, fluxo: fluxos(cA, [], [], Qmin, 0), PA_esg: Math.pow(Qmin / KEsg, 2), PB_esg: null }; }
        var cB = caminho(B.no), k = 0;
        while (k < cA.length && k < cB.length && cA[k] === cB[k]) k++;
        var tronco = cA.slice(0, k), rA = cA.slice(k), rB = cB.slice(k);
        /* nó de junção = ponta de jusante do último trecho comum */
        var juncao = raiz; tronco.forEach(function (t) { juncao = t.de === juncao ? t.para : t.de; });
        var EJ = EA + soma(rA, Qmin);
        function g(q) { return EJ - soma(rB, q) - cota(B.no) - Pv(q); }
        var QB;
        if (g(0) <= 0) QB = 0;
        else { var hi = Qmin; while (g(hi) > 0) hi *= 2; QB = bissecao(g, 0, hi); }
        var res = { A: A.id, B: B.id, QA: Qmin, QB: QB, juncao: juncao, E_juncao: EJ, E_origem: EJ + soma(tronco, Qmin + QB), fluxo: fluxos(tronco, rA, rB, Qmin, QB),
                    PA_esg: Math.pow(Qmin / KEsg, 2), PB_esg: Math.pow(QB / KEsg, 2), desequilibrio_m: g(QB) };
        return res;
      }
      function fluxos(tronco, rA, rB, QA, QB) {
        var m = {}; tronco.forEach(function (t) { m[t.id] = QA + QB; }); rA.forEach(function (t) { m[t.id] = QA; }); rB.forEach(function (t) { m[t.id] = QB; }); return m;
      }
      /* DN: o menor do catálogo (rede.diametros) que respeita o DN mínimo e a velocidade; devolve true se mudou algo */
      function dimensionar(cl) {
        var dnMin = dnMinimo(), vmax = vMax();
        if (dnMin == null || vmax == null) return false;
        var lista = Object.keys(dis).map(Number).filter(function (d) { return d >= dnMin.valor && num(dis[d], null) != null; }).sort(function (a, b) { return a - b; });
        var mudou = false;
        trs.forEach(function (t) {
          var q = cl.fluxo[t.id]; if (q == null || t.travado || !lista.length) return;
          var esc = null;
          for (var i = 0; i < lista.length; i++) if (velocidade(q, num(dis[lista[i]], 0)) <= vmax.valor) { esc = lista[i]; break; }
          if (esc == null) esc = lista[lista.length - 1];
          if (t.dn == null || t.dn < dnMin.valor || velocidade(q, di(t)) > vmax.valor) { if (esc !== t.dn) { t.dn = esc; mudou = true; } }
        });
        return mudou;
      }
      var _dnMin = null, _vMax = null;
      function dnMinimo() {
        if (_dnMin) return _dnMin;
        if (NBR) {
          var rn = r13("4.3.1", null, "hidrantes — DN mínimo"); if (!rn) return null;
          _dnMin = { valor: rn.num, fonte: rn.fonte, passo: "DN mínimo " + f2(rn.num) + " (NBR 13714 4.3.1)" };
          if (HX.tipo === 1 && ent.rede && ent.rede.dn50Aprovado) { var rn2 = r13("4.3.2", null, "hidrantes — DN mínimo"); if (rn2) { _dnMin = { valor: rn2.num, fonte: rn2.fonte, passo: "DN mínimo " + f2(rn2.num) + " (NBR 13714 4.3.2: tipo 1, comprovado e aprovado)" }; premissa("DN 50 no tipo 1 (NBR 13714 4.3.2)", "comprovado e aprovado — informado pelo RT", "entrada", rn2.fonte); } }
          return _dnMin;
        }
        var r = regra(K.r17, "item_IT17", "5.16.1", null, "hidrantes — DN mínimo"); if (!r) return null;
        _dnMin = { valor: r.num, fonte: r.fonte, passo: "DN mínimo " + f2(r.num) + " (IT 17 5.16.1)" };
        var exc = EXCECAO_DN[mat];
        if (exc && (HX.tipo === 1 || HX.tipo === 2)) { var re = regra(K.r17, "item_IT17", "5.16.2", exc, "hidrantes — DN mínimo (exceção)"); if (re && re.num != null) { _dnMin = { valor: re.num, fonte: re.fonte, passo: "DN mínimo " + f2(re.num) + " (IT 17 5.16.2: tipos 1 e 2 em " + exc + ")" }; nota13("4.3.1/4.3.2", "DN mínimo 65; DN 50 só no tipo 1, comprovado e aprovado (a IT 17 5.16.2 admite " + f2(re.num) + " nos tipos 1 e 2 em " + exc + ")"); } }
        return _dnMin;
      }
      /* velocidade na rede: IT 17 5.8.12 e NBR 13714 5.3.10 — vale a MAIS RESTRITIVA (em MG e fora) */
      function vMax() {
        if (_vMax) return _vMax;
        var a = NBR ? null : regra(K.r17, "item_IT17", "5.8.12", null, "hidrantes — velocidade"), b = r13("5.3.10", null, "hidrantes — velocidade");
        var c = [a, b].filter(function (x) { return x && x.num != null; }).sort(function (x, y) { return x.num - y.num; })[0];
        if (c) _vMax = { valor: c.num, fonte: c.fonte };
        return _vMax;
      }

      /* verificações e saída por trecho */
      var dnM = dnMinimo(), vM = vMax();
      var E_no = {}; E_no[raiz] = calc.E_origem;
      var ordemT = []; (function ordena(no) { arr(adj[no]).forEach(function (t) { var o = t.de === no ? t.para : t.de; if (pai[o] !== no) return; ordemT.push({ t: t, de: no, para: o }); ordena(o); }); })(raiz);
      ordemT.forEach(function (x) {
        var t = x.t, q = calc.fluxo[t.id] || 0, d = di(t), J = jHW(q, C, d), h = J * (t.L + leq(t)), v = velocidade(q, d);
        if (E_no[x.de] != null && q > 0) E_no[x.para] = E_no[x.de] - h;
        var tr = { id: t.id, de: x.de, para: x.para, material: mat, dnModelo: t.dnModelo, dn: t.dn, di_mm: d, comprimento_m: t.L, leq_m: leq(t), vazao_lpm: q, velocidade_ms: v, J_m_m: J, perda_m: h,
                   pressaoMontante_mca: E_no[x.de] != null && q > 0 ? E_no[x.de] - cota(x.de) : null, pressaoJusante_mca: E_no[x.para] != null && q > 0 ? E_no[x.para] - cota(x.para) : null, status: "ok",
                   passos: q > 0 ? ["Q = " + f2(q) + " L/min, Di = " + f2(d) + " mm, C = " + f2(C), "J = 605·Q^1,85·C^-1,85·D^-4,87·10^4 = " + J.toExponential(CASAS_J) + " m/m (IT 17 5.8.10 b)",
                                    "hf = J·(L + ΣLeq) = J·(" + f2(t.L) + " + " + f2(leq(t)) + ") = " + f2(h) + " m", "v = Q/A = " + f2(v) + " m/s"] : ["sem vazão nos 2 jatos de cálculo"] };
        HX.trechos.push(tr);
        if (q > 0 && vM) { var okv = v <= vM.valor; verif(t.id, "velocidade — " + t.id, v, vM.valor, "m/s", okv, tr.passos.slice(-1), vM.fonte, "max"); if (!okv) tr.status = "reprovado"; }
        if (dnM) { var okd = t.dn != null && t.dn >= dnM.valor; verif(t.id, "DN mínimo — " + t.id, t.dn, dnM.valor, "DN", okd, [dnM.passo], dnM.fonte, "min"); if (!okd) tr.status = "reprovado"; }
        if (t.dn !== t.dnModelo && t.dn != null) { out.ops.push({ op: "instAlterar", id: t.id, dn: t.dn }); out.opsDesfazer.unshift({ op: "instAlterar", id: t.id, dn: t.dnModelo }); }
      });
      var fJ = fonteDe(K.r17, "item 5.8.4");
      var r584 = regra(K.r17, "item_IT17", "5.8.4", null, "hidrantes — jatos simultâneos");
      var passosC = HX.passosVazao.concat(["2 jatos simultâneos mais desfavoráveis (IT 17 5.8.4" + (r584 ? ": " + r584.valor + " jatos" : "") + "): ranking pela carga exigida na origem com 1 jato = " + calc.ranking.map(function (x) { return x.id + " " + f2(x.Hreq_m) + " m"; }).join(" · "),
                     "âncora " + calc.A + " com " + f2(calc.QA) + " L/min: pressão no esguicho = (Q/K)² = " + f2(calc.PA_esg) + " mca; na válvula = esguicho + mangueira = " + f2(Pv(calc.QA)) + " mca"]);
      if (calc.B) passosC.push("2º jato " + calc.B + ": vazão pela pressão no nó de junção " + calc.juncao + " (carga " + f2(calc.E_juncao) + " m) → " + f2(calc.QB) + " L/min, esguicho " + f2(calc.PB_esg) + " mca (desequilíbrio " + f2(Math.abs(calc.desequilibrio_m)) + " m" + (r5814 ? " ≤ " + f2(r5814.num) + " mca, IT 17 5.8.14" : "") + ")");
      else aviso("aviso", "a rede tem um só hidrante ligado: o cálculo usa 1 jato, e a IT 17 5.8.4 pede os 2 mais desfavoráveis", [], { texto: "ligar os demais hidrantes à rede e recalcular" });
      passosC.push("carga necessária na origem " + raiz + " (piezométrica, cota + pressão): " + f2(calc.E_origem) + " m; vazão total " + f2(calc.QA + calc.QB) + " L/min");
      calc.passos = passosC;
      var okQ = calc.B ? calc.QB >= Qmin - 1e-9 : true;   // hid:ok tolerância numérica
      verif(calc.B || calc.A, "vazão no 2º jato mais desfavorável", calc.QB, Qmin, "L/min", calc.B ? okQ : null, passosC, fonteDe(K.tipos, "Tipo " + HX.tipo + " (vazão por saída)"), "min");
      /* fonte: gravidade ou bomba */
      fonteAgua(calc, Pv, C, mat, raiz, cota, caminho, hids, soma);
    }

    function fonteAgua(calc, Pv, C, mat, raiz, cota, caminho, hids, soma) {
      var org = ent.rede.origem || {}, nivel = num(org.nivelAgua_m, null), Qt = calc.QA + calc.QB;
      var r588, r589;
      if (NBR) {
        /* NBR 13714 5.3.6: no máximo o DOBRO do mais desfavorável, sem teto absoluto; 5.3.7: 1.000 kPa recomendado */
        var r536 = r13("5.3.6", null, "hidrantes — pressão máxima no esguicho"), r537 = r13("5.3.7", null, "hidrantes — pressão de trabalho");
        r588 = r536 ? { linha: { regra: r536.linha.regra }, num: null, fonte: r536.fonte } : null;
        r589 = r537 ? { num: HH().kpaParaM(r537.num), fonte: r537.fonte, item: "NBR 13714 5.3.7" } : null;
      } else {
        r588 = regra(K.r17, "item_IT17", "5.8.8", null, "hidrantes — pressão máxima no esguicho");
        r589 = regra(K.r17, "item_IT17", "5.8.9", null, "hidrantes — pressão de trabalho");
        if (r588) nota13("5.3.6", "pressão em qualquer esguicho ≤ o dobro da do mais desfavorável (a IT 17 5.8.8 admite o triplo, com teto de " + f2(r588.num) + " mca sem brigada intermediária)");
      }
      if (nivel == null) { ctx.pendencia("entrada.incendio.rede.origem.nivelAgua_m", "nível mínimo da água da reserva (nível X) não informado", "hidrantes — fonte"); verif("fonte", "carga na origem", null, calc.E_origem, "m", null, ["pendente: nível da reserva"], null); return; }
      /* ⚠ revisão INC M1: a pressão MÁXIMA nos esguichos usa o nível MÁXIMO da reserva (caixa cheia); a mínima,
         o nível X. Antes as duas usavam o nível X — lado contra a segurança (o mesmo defeito do A2 da F7).
         Sem nível máximo: a verificação de máximo fica pendente (nunca com o mínimo). */
      var nivMax = num(org.nivelMax_m, null);
      if (nivMax != null && nivMax < nivel) { aviso("aviso", "nível máximo da reserva (" + f2(nivMax) + " m) abaixo do nível X (" + f2(nivel) + " m)", [], { texto: "corrigir origem.nivelMax_m (topo da lâmina, extravasor)" }); nivMax = nivel; }
      var Esrc = null;   /* carga na origem em função da vazão total, com o nível MÁXIMO (pressão máxima nos esguichos) */
      if (org.tipo === "gravidade") {
        var ok = nivel >= calc.E_origem;
        verif("fonte", "reservatório elevado: carga disponível ≥ necessária", nivel, calc.E_origem, "m", ok, ["nível mínimo da reserva " + f2(nivel) + " m ≥ carga necessária na origem " + f2(calc.E_origem) + " m"], fonteDe(K.r17, "item 5.8.6"), "min");
        if (!ok) aviso("erro", "a reserva elevada não dá pressão aos 2 hidrantes mais desfavoráveis: faltam " + f2(calc.E_origem - nivel) + " m de carga", [calc.A], { texto: "prever bomba de incêndio com Q ≥ " + f2(Qt) + " L/min e AMT ≥ " + f2(calc.E_origem - nivel) + " m (by-pass, IT 17 5.10.1), aumentar o DN ou elevar a reserva" });
        if (nivMax != null) Esrc = function () { return nivMax; };
      } else {
        bomba(calc, C, mat, nivel, Qt);
        var B = HX.bomba, esc = B && B.escolha;
        /* sem bomba escolhida não há curva: a carga no ponto de projeto NÃO é a máxima (a bomba dá mais carga com
           menos vazão) — a verificação de máximo fica pendente */
        if (esc && nivMax != null) Esrc = function (q) { var h = interpCurva(esc.curva, q); var hs = B.perdaSuccaoDe(q); return h == null || hs == null ? null : nivMax + h - hs; };
      }
      if (!Esrc && r588) {
        var falta = nivMax == null ? "nível máximo da reserva (origem.nivelMax_m)" : "curva da bomba escolhida";
        verif("esguichos", "pressão máxima no esguicho (hidrante sozinho)", null, null, "mca", null, ["pendente: " + falta + " — a pressão máxima é com a reserva cheia e a fonte real (IT 17 5.8.8)"], r588.fonte, "max");
        if (nivMax == null) ctx.pendencia("entrada.incendio.rede.origem.nivelMax_m", "nível MÁXIMO da reserva (caixa cheia) não informado — a pressão máxima nos esguichos (IT 17 5.8.8) não é verificada com o nível X", "hidrantes — pressão máxima");
      }
      /* pressão máxima nos esguichos: cada hidrante sozinho com a fonte real (o lado da maior pressão) */
      if (Esrc && r588) {
        var lim3 = null, mT = /(dobro|triplo|quádruplo)/.exec(String(r588.linha.regra)); if (mT) lim3 = MULTIPLOS[mT[1]] * calc.PA_esg;
        var limAbs = ent.brigadaIntermediaria ? null : r588.num, piores = [];
        hids.forEach(function (h) {
          var cam = caminho(h.no), f = function (q) { var e = Esrc(q), s = soma(cam, q); return e == null || s == null ? -1 : e - s - cota(h.no) - Pv(q); };
          if (f(0) <= 0) return;
          var hi = HX.vazaoMin_lpm; while (f(hi) > 0 && hi < HX.vazaoMin_lpm * L_POR_M3) hi *= 2;
          var q = bissecao(f, 0, hi), p = Math.pow(q / KEsg, 2);
          piores.push({ id: h.id, q: q, p: p });
        });
        piores.sort(function (a, b) { return b.p - a.p; });
        var pmax = piores.length ? piores[0] : null;
        if (pmax) {
          var lim = [lim3, limAbs].filter(function (x) { return x != null; }), L = Math.min.apply(null, lim);
          var okP = pmax.p <= L + 1e-9;   // hid:ok tolerância numérica
          verif(pmax.id, "pressão máxima no esguicho (hidrante sozinho)", pmax.p, L, "mca", okP,
                ["hidrante " + pmax.id + " aberto sozinho com a fonte real: Q = " + f2(pmax.q) + " L/min, esguicho = " + f2(pmax.p) + " mca",
                 "limite = " + (lim3 != null ? mT[1] + " da pressão no esguicho mais desfavorável (" + f2(calc.PA_esg) + " mca) = " + f2(lim3) + " mca" : "") + (limAbs != null ? (lim3 != null ? "; " : "") + "sem brigada de nível intermediário: " + f2(limAbs) + " mca" : "") + (NBR ? " (NBR 13714 5.3.6)" : " (IT 17 5.8.8)")].concat(NBR ? [] : notas13714.filter(function (n) { return n.indexOf("5.3.6") >= 0; })), r588.fonte, "max");
          if (!okP) aviso("erro", "pressão no esguicho do hidrante " + pmax.id + " = " + f2(pmax.p) + " mca acima do limite de " + f2(L) + " mca (IT 17 5.8.8)", [pmax.id], { texto: "prever dispositivo de redução de pressão comprovado (IT 17 5.8.8) nos hidrantes baixos, ou setorizar a rede" });
        }
        if (r589) { var pTrab = Math.max.apply(null, HX.trechos.map(function (t) { return t.pressaoMontante_mca || 0; }).concat([HX.bomba && HX.bomba.AMT_m || 0]));
          if (pTrab > r589.num) aviso("aviso", "pressão de trabalho " + f2(pTrab) + " mca acima da recomendada de " + f2(r589.num) + " mca (" + (r589.item || "IT 17 5.8.9") + ")", [], { texto: "comprovar a classe de pressão dos componentes ou reduzir a pressão (5.8.9)" }); }
      }
      if (ent.brigadaIntermediaria) premissa("brigada de incêndio de nível intermediário", "sim — sem o teto absoluto de pressão no esguicho (IT 17 5.8.8)", "entrada");
      var r532 = regra(K.r17, "item_IT17", "5.3.2", null, "hidrantes — recalque");
      if (r532 && Qt > r532.num) aviso("info", "vazão do sistema " + f2(Qt) + " L/min > " + f2(r532.num) + " L/min: o dispositivo de recalque precisa de registro adicional (IT 17 5.3.2)", [], { texto: "prever o 2º registro de recalque no detalhe" });
    }
    function interpCurva(curva, q) {
      var p = arr(curva).slice().sort(function (a, b) { return a.q_lpm - b.q_lpm; });
      if (!p.length || q < p[0].q_lpm || q > p[p.length - 1].q_lpm) return null;
      for (var i = 1; i < p.length; i++) if (q <= p[i].q_lpm) { var a = p[i - 1], b = p[i]; return b.q_lpm === a.q_lpm ? b.h_m : a.h_m + (b.h_m - a.h_m) * (q - a.q_lpm) / (b.q_lpm - a.q_lpm); }
      return p[p.length - 1].h_m;
    }
    /* catálogo de bombas → [{id, nome, fabricante, potencia_cv, curva:[{q_lpm, h_m}], aConferir}] */
    function catalogoBombas() {
      /* bombas na entrada (lista explícita, mesmo vazia) mandam; sem elas, o HidCatalogo (aplicação incêndio) */
      var lista = arr(ent.bombas), origem = "entrada";
      if (!Array.isArray(ent.bombas) && CAT()) { lista = CAT().itens({ tipo: "bomba" }).filter(function (b) { return /inc[eê]ndio/i.test((b.descricao || "") + " " + JSON.stringify(b.dados || {})); }); origem = "catálogo"; }
      return lista.map(function (b) {
        /* formato Dancor (curva.pontos {Q m³/h, H mca}) ou o do HidBombas ([{q_m3h, h_m}]) */
        var pc = b.curva && b.curva.pontos ? b.curva.pontos.map(function (p) { return { q_m3h: num(p.Q, 0), h_m: num(p.H, 0) }; })
               : arr(b.curva).map(function (p) { return { q_m3h: num(p.q_m3h, 0), h_m: num(p.h_m, 0) }; });
        pc.forEach(function (p) { p.q_lpm = p.q_m3h * L_POR_M3 / S_POR_MIN; });
        var pot = num(b.potencia_cv, null); if (pot == null && b.dados) pot = num(b.dados.potenciaCandidato_cv, null);
        return { id: b.id || b.codigo, nome: b.nome || b.descricao || b.codigo, fabricante: b.fabricante || "", potencia_cv: pot, curva: pc, origem: origem,
                 aConferir: !!(b.dados && (b.dados.potenciaCandidato_cv != null || b.dados.AMTmax_mca_colunaAMT != null)), fonte: b.fonte || null, pagina: b.pagina || null };
      });
    }
    function bomba(calc, C, mat, nivel, Qt) {
      var org = ent.rede.origem || {}, sc = org.succao || {}, B = HX.bomba = { vazao_lpm: Qt, AMT_m: null, perdaSuccao_m: null, succao: null, escolha: null, ranking: [], passos: [] };
      var cotaB = num(org.cotaBomba_m, null), dS = num(sc.di_mm, null), LS = num(sc.comprimento_m, null);
      if (dS == null && num(sc.dn, null) != null) { var dAc = (ent.rede.diametros ? null : diametrosAco(ent.rede.material || "aco_galvanizado", ent.rede.schedule, "bomba — DI da sucção")); dS = num((ent.rede.diametros || dAc || {})[num(sc.dn, 0)], null); }
      var leqS = 0, faltaLeq = false; arr(sc.conexoes).forEach(function (c) { var l = num(c.leq_m, null); if (l == null) faltaLeq = true; else leqS += l; });
      if (cotaB == null || dS == null || LS == null || faltaLeq) {
        ctx.pendencia("entrada.incendio.rede.origem.succao", "sucção da bomba incompleta (cotaBomba_m, succao.di_mm, succao.comprimento_m, Leq das conexões)", "bomba");
        verif("bomba", "bomba de incêndio", null, null, "", null, ["pendente: sucção da bomba"], fonteDe(K.r17, "Anexo C")); return;
      }
      B.perdaSuccaoDe = function (q) { return jHW(q, C, dS) * (LS + leqS); };
      var hs = B.perdaSuccaoDe(Qt), vS = velocidade(Qt, dS);
      B.perdaSuccao_m = hs;
      B.AMT_m = calc.E_origem - nivel + hs;
      B.passos.push("Q = " + f2(calc.QA) + " + " + f2(calc.QB) + " = " + f2(Qt) + " L/min (" + f2(Qt * S_POR_MIN / L_POR_M3) + " m³/h)");
      B.passos.push("AMT = carga na saída da bomba − nível X + perda na sucção = " + f2(calc.E_origem) + " − " + f2(nivel) + " + " + f2(hs) + " = " + f2(B.AMT_m) + " m");
      /* sucção positiva: eixo abaixo do nível X ou até o desnível admitido (IT 17 C.1.10) */
      /* sucção positiva: eixo abaixo do nível X ou até o MENOR entre o desnível admitido e 1/3 da capacidade efetiva
         (IT 17 C.1.10 = NBR 13714 B.1.10). Sem a altura útil da reserva (nível normal → nível X), eixo acima do
         nível X é tratado como sucção NEGATIVA (lado seguro: limite de velocidade menor) */
      var rC110 = NBR ? r13("B.1.10", "acima do nível X", "bomba — sucção") : regra(K.r17, "item_IT17", "C.1.10", null, "bomba — sucção");
      var acima = cotaB - nivel, hU = num(org.alturaUtil_m, null), limPos = null, txtPos = "";
      if (rC110) { limPos = hU != null ? Math.min(rC110.num, hU / FRACAO_CAPACIDADE) : (acima <= 0 ? 0 : null); txtPos = hU != null ? "menor entre " + f2(rC110.num) + " m e 1/3 da altura útil " + f2(hU) + " m = " + f2(limPos) + " m" : "sem a altura útil da reserva: eixo acima do nível X conta como NEGATIVA (lado seguro)"; }
      var positiva = acima <= 0 || (limPos != null && acima <= limPos);
      B.succao = { positiva: positiva, eixoAcimaDoNivelX_m: acima, limitePositiva_m: limPos, velocidade_ms: vS, di_mm: dS };
      if (rC110) premissa("condição de sucção", (positiva ? "positiva" : "negativa") + ": eixo " + f2(acima) + " m em relação ao nível X (" + (NBR ? "NBR 13714 B.1.10" : "IT 17 C.1.10 = NBR 13714 B.1.10") + ": " + txtPos + ")", "norma", rC110.fonte);
      var rV = NBR ? r13("5.3.9", null, "bomba — velocidade na sucção") : regra(K.r17, "item_IT17", "5.8.11", positiva ? "positiva" : "negativa", "bomba — velocidade na sucção");
      if (!NBR) { var v13 = NR().consulta(K.r13, { item: "5.3.9" }, "valor"); if (v13.ok && rV && num(v13.valor, null) > rV.num) nota13("5.3.9", "sucção ≤ " + v13.valor + " m/s (a IT 17 5.8.11 é mais restritiva: " + f2(rV.num) + " m/s na sucção " + (positiva ? "positiva" : "negativa") + ")"); }
      if (rV) verif("succao", "velocidade na sucção (" + (positiva ? "positiva" : "negativa") + ")", vS, rV.num, "m/s", vS <= rV.num, ["v = Q/A = " + f2(vS) + " m/s com Di " + f2(dS) + " mm (" + (NBR ? "NBR 13714 5.3.9" : "IT 17 5.8.11") + ")"], rV.fonte, "max");
      var rC112 = NBR ? (function () { var x = r13("B.1.12", null, "bomba — pressão"); return x ? { num: HH().kpaParaM(x.num), fonte: x.fonte } : null; })() : regra(K.r17, "item_IT17", "C.1.12", null, "bomba — pressão");
      if (rC112 && B.AMT_m > rC112.num) aviso("aviso", "AMT de " + f2(B.AMT_m) + " m acima de " + f2(rC112.num) + " mca (IT 17 C.1.12 não recomenda)", [], { texto: "setorizar a rede ou usar bomba por zona de pressão" });
      /* poço de sucção (Tabela B.1) pelo DN da sucção */
      if (num(sc.dn, null) != null) { var cp = ctx.consulta(NBR ? K.n13poco : K.poco, { dn_tubo_succao_mm: num(sc.dn, 0) }, "dimensao_A_mm", "bomba — poço de sucção");
        if (cp.ok) HX.pocoSuccao = { dn: num(sc.dn, 0), A_mm: cp.linha.dimensao_A_mm, B_mm: cp.linha.dimensao_B_mm, fonte: cp.fonte }; }
      /* escolha no catálogo: H da curva na vazão total ≥ AMT; menor potência, depois menor folga */
      var todas = catalogoBombas(), cat = todas.filter(function (b) { return b.curva.length >= 2; });
      /* ⚠ item de catálogo SEM curva (o gerador do HidCatalogo não exporta a curva da tabela de seleção) não
         pode ser aprovado nem reprovado: sem curva a bomba fica pendente, nunca "nenhuma atende" */
      if (todas.length && !cat.length) ctx.pendencia("catalogo.bombas_incendio.curva", todas.length + " bomba(s) de incêndio no catálogo sem a curva (Q × H) — o gerador do catálogo não exporta curva.pontos; passe as bombas na entrada", "bomba");
      if (!cat.length) {
        verif("bomba", "bomba de incêndio do catálogo", null, B.AMT_m, "m", null, ["pendente: nenhum catálogo de bomba de incêndio carregado (bombas na entrada ou HidCatalogo com aplicação incêndio)", "ponto exigido: " + f2(Qt) + " L/min a " + f2(B.AMT_m) + " m"], fonteDe(K.r17, "Anexo C"), "min");
        ctx.pendencia("catalogo.bombas_incendio", "catálogo de bombas de incêndio não carregado: a bomba fica especificada pelo ponto (Q, AMT) sem modelo", "bomba");
      } else {
        cat.forEach(function (b) { var h = interpCurva(b.curva, Qt); B.ranking.push({ id: b.id, nome: b.nome, potencia_cv: b.potencia_cv, h_m: h, folga_m: h == null ? null : h - B.AMT_m, aprovada: h != null && h >= B.AMT_m, b: b }); });
        var ap = B.ranking.filter(function (r) { return r.aprovada; }).sort(function (x, y) { return ((x.potencia_cv == null ? Infinity : x.potencia_cv) - (y.potencia_cv == null ? Infinity : y.potencia_cv)) || (x.folga_m - y.folga_m); });
        var e = ap[0];
        if (e) {
          B.escolha = { id: e.id, nome: e.nome, potencia_cv: e.potencia_cv, h_m: e.h_m, curva: e.b.curva, fabricante: e.b.fabricante, aConferir: e.b.aConferir, fonte: e.b.fonte, pagina: e.b.pagina };
          verif(e.id, "bomba de incêndio: H na vazão de projeto ≥ AMT", e.h_m, B.AMT_m, "m", true, ["curva " + e.nome + ": H(" + f2(Qt) + " L/min) = " + f2(e.h_m) + " m ≥ AMT " + f2(B.AMT_m) + " m (folga " + f2(e.folga_m) + " m)"], fonteDe(K.r17, "Anexo C, C.1.11"), "min");
          if (e.b.aConferir) aviso("aviso", "bomba " + e.nome + ": potência e AMT máxima do catálogo foram lidas de colunas mescladas do PDF (\"a conferir\") — confirmar no catálogo antes de especificar", [e.id], { texto: "abrir o catálogo na página " + (e.b.pagina || "?") + " e confirmar o modelo" });
        } else {
          verif("bomba", "bomba de incêndio: H na vazão de projeto ≥ AMT", null, B.AMT_m, "m", false, B.ranking.map(function (r) { return r.nome + ": " + (r.h_m == null ? "vazão fora da curva" : "H = " + f2(r.h_m) + " m"); }), fonteDe(K.r17, "Anexo C, C.1.11"), "min");
          aviso("erro", "nenhuma bomba do catálogo dá " + f2(Qt) + " L/min a " + f2(B.AMT_m) + " m", [], { texto: "ampliar o catálogo, aumentar o DN (baixa a AMT) ou reposicionar a reserva" });
        }
        verif("bomba", "NPSH da bomba de incêndio", null, null, "m", null, ["pendente: o catálogo de incêndio não traz NPSH requerido — conferir na curva do fabricante"], fonteDe(K.r17, "Anexo C"));
      }
      /* jockey (C.1.13): quando a partida é automática por pressostato, a rede fica pressurizada */
      if (org.automatica !== false) {
        var rJ = NBR ? r13("B.1.13", "vazão", "bomba — jockey") : regra(K.r17, "item_IT17", "C.1.13", null, "bomba — jockey"), rP = NBR ? r13("5.7.7.3", null, "bomba — pressostato") : regra(K.r17, "item_IT17", "5.17.4", null, "bomba — pressostato");
        var rDj = r13("B.1.13", "diferencial", "bomba — jockey");
        var shut = B.escolha ? Math.max.apply(null, B.escolha.curva.map(function (p) { return p.h_m; })) : null;
        HX.jockey = { exigida: true, vazaoMax_lpm: rJ ? rJ.num : null, pressao_m: shut, passos: [
          "partida automática por pressostato → bomba de pressurização (jockey) para manter a rede pressurizada (IT 17 C.1.13)",
          "vazão máxima " + (rJ ? f2(rJ.num) + " L/min" : "—") + "; pressão máxima = shut-off da principal" + (shut != null ? " (≥ " + f2(shut) + " m: maior altura da tabela de seleção; o shut-off em Q = 0 está na curva do fabricante)" : " (pendente: bomba principal sem curva)"),
          rP ? "pressostato: acionamento a no máximo " + f2(rP.num) + " % da maior pressão de funcionamento (" + (NBR ? "NBR 13714 5.7.7.3" : "IT 17 5.17.4") + ")" : "",
          rDj ? "diferencial recomendado entre os acionamentos sequenciais das bombas ≈ " + f2(rDj.num) + " kPa (NBR 13714 B.1.13)" : ""].filter(Boolean), fonte: rJ && rJ.fonte, diferencial_kpa: rDj ? rDj.num : null };
        premissa("bomba jockey", "exigida: bomba principal com partida automática (informe origem.automatica = false para partida manual)", "padrao_motor", rJ && rJ.fonte);
      }
    }

    /* ------------------------------------------------------------------ 4. EXTINTORES */
    var EX = out.extintores = { exigido: E.medidas.extintores.exigido, risco: null, classes: null, distanciaMax_m: null, capacidade: null, tipoSugerido: null, porPavimento: [] };
    if (EX.exigido === true) extintores();
    function extintores() {
      var carga = num(ent.cargaIncendio_MJm2, null), risco = ent.riscoExtintor || null, fR = null;
      if (risco) premissa("risco para extintores (IT 16 Tabela 3)", risco + " — informado pelo RT", "entrada");
      else if (carga != null) {
        var rs = ctx.linhas(K.risco16, null, "extintores — risco");
        var l = rs && rs.filter(function (x) { var mi = num(x.carga_incendio_mj_m2_min_exclusivo, null), ma = num(x.carga_incendio_mj_m2_max, null); return (mi == null || carga > mi || (mi === 0 && carga >= 0)) && (ma == null || carga <= ma); })[0];
        if (l) { risco = l.risco; fR = fonteDe(K.risco16); }
      } else ctx.pendencia("entrada.incendio.cargaIncendio_MJm2", "carga de incêndio (IT 09, fora da base) não informada — o risco dos extintores (IT 16 Tabela 3) depende dela (ou informe riscoExtintor)", "extintores");
      EX.risco = risco;
      var classes = arr(ent.classesFogo).length ? arr(ent.classesFogo).map(String) : null;
      if (!classes) { classes = ["A", "B", "C"]; premissa("classes de fogo protegidas", "A, B e C (lado seguro: a IT 16 6.2.1 pede pó ABC ou unidades A + BC por pavimento) — informe classesFogo para mudar", "padrao_motor", fonteDe(K.r16, "6.2.1")); }
      EX.classes = classes;
      if (!risco) { verif("extintores", "distância máxima a percorrer até o extintor", null, null, "m", null, ["pendente: risco (carga de incêndio)"], fonteDe(K.a16)); return; }
      var alt = num(ent.alternativaRiscoAlto, 0), dist = [], cap = { A: null, B: null }, passos = ["risco " + risco + (fR ? " (carga " + f2(carga) + " MJ/m², IT 16 Tabela 3)" : "")];
      function porRisco(chave, classe) {
        var ls = ctx.linhas(chave, null, "extintores — classe " + classe); if (!ls) return;
        var cand = ls.filter(function (x) { return x.risco === risco; }), l = cand[Math.min(alt, cand.length - 1)];
        if (!l) { ctx.pendencia(chave + "[" + risco + "]", "risco " + risco + " sem linha", "extintores"); return; }
        if (cand.length > 1) premissa("alternativa do risco alto (IT 16, classe " + classe + ")", l.capacidade_extintora_minima + " a até " + f2(l.distancia_max_m) + " m (" + l.obs + ") — alternativaRiscoAlto troca", "padrao_motor");
        dist.push({ classe: classe, d: num(l.distancia_max_m, null), fonte: fonteDe(chave) });
        cap[classe] = capacidade(l.capacidade_extintora_minima)[classe];
        passos.push("classe " + classe + ": " + l.capacidade_extintora_minima + ", até " + f2(l.distancia_max_m) + " m");
      }
      if (classes.indexOf("A") >= 0) porRisco(K.a16, "A");
      if (classes.indexOf("B") >= 0) porRisco(K.b16, "B");
      var lsC = ctx.linhas(K.cdk16, null, "extintores — classes C, D, K");
      ["C", "D", "K"].forEach(function (c) { if (classes.indexOf(c) < 0 || !lsC) return; var l = lsC.filter(function (x) { return x.classe === c; })[0]; if (l) { dist.push({ classe: c, d: num(l.distancia_max_m, null), fonte: fonteDe(K.cdk16) }); passos.push("classe " + c + ": até " + f2(l.distancia_max_m) + " m (" + l.obs + ")"); } });
      if (classes.indexOf("D") >= 0 || classes.indexOf("K") >= 0) ctx.pendencia("entrada.incendio.extintores.agente_especial", "classe D/K: agente e quantidade pelo combustível específico (IT 16 6.2.4.2/6.2.4.3) — o RT especifica", "extintores");
      var dmin = dist.filter(function (x) { return x.d != null; }).sort(function (a, b) { return a.d - b.d; })[0];
      if (!dmin) return;
      EX.distanciaMax_m = dmin.d; EX.capacidade = cap;
      passos.push("um só tipo de extintor cobrindo todas as classes → distância = a menor: " + f2(dmin.d) + " m (classe " + dmin.classe + ")");
      premissa("distribuição dos extintores", "um tipo (pó ABC) para todas as classes; distância = a menor das classes (" + f2(dmin.d) + " m), pelo percurso real (IT 16 4.11)", "padrao_motor");
      /* tipo sugerido: a unidade mínima de pó ABC portátil atende a capacidade exigida? */
      var cMin = ctx.consulta(K.cap16, { tipo_de_extintor: "portatil", agente: "Pó ABC" }, "capacidade_extintora_minima", "extintores — capacidade");
      if (cMin.ok) { var u = capacidade(cMin.valor), atende = (cap.A == null || (u.A != null && u.A >= cap.A)) && (cap.B == null || (u.B != null && u.B >= cap.B));
        EX.tipoSugerido = { agente: "Pó ABC", tipo: "portátil", capacidadeExigida: (cap.A != null ? cap.A + "-A" : "") + (cap.B != null ? ":" + cap.B + "-B" : "") + (classes.indexOf("C") >= 0 ? ":C" : ""), unidadeMinima: cMin.valor, atendePelaUnidadeMinima: atende };
        passos.push("pó ABC: unidade mínima " + cMin.valor + (atende ? " atende" : " NÃO atende a capacidade exigida"));
        /* ⚠ revisão INC M2 (decisão do RT): capacidade não atendida é REPROVADO (antes só aviso, com ok = true).
           O extintor especificado pelo RT (extintor.capacidade, do catálogo) é o que se confere; sem ele, a
           unidade mínima de pó ABC da Tabela 1 */
        var esp = (ent.extintor || {}).capacidade, uE = esp ? capacidade(esp) : u, nomeE = esp ? "especificado " + esp : "pó ABC unidade mínima " + cMin.valor;
        var okCap = (cap.A == null || (uE.A != null && uE.A >= cap.A)) && (cap.B == null || (uE.B != null && uE.B >= cap.B)) && (classes.indexOf("C") < 0 || uE.C);
        if (esp) premissa("extintor especificado", esp + " (RT, catálogo do fabricante)", "entrada");
        verif("extintores", "capacidade extintora", uE.texto, EX.tipoSugerido.capacidadeExigida, "", okCap, ["exigida (risco " + risco + "): " + EX.tipoSugerido.capacidadeExigida + "; " + nomeE + (okCap ? " atende" : " NÃO atende")], fonteDe(K.a16, "Tabelas 4 e 5"));
        if (!okCap) aviso("erro", "capacidade extintora exigida " + EX.tipoSugerido.capacidadeExigida + " maior que a do extintor (" + nomeE + ")", [], { texto: "especificar extintor pó ABC com capacidade ≥ " + EX.tipoSugerido.capacidadeExigida + " (informe extintor.capacidade do catálogo)" }); }
      var rMin = regra(K.r16, "item_IT16", "6.2.1", null, "extintores — mínimo por pavimento"), rPorta = regra(K.r16, "item_IT16", "5.2.2.9", null, "extintores — junto ao acesso");
      var rAlt = regra(K.r16, "item_IT16", "5.2.2.2", "alça", "extintores — altura"), yE = rAlt ? rAlt.num : null;
      var minPav = rMin ? rMin.num : null;
      var lista = pavs.length ? pavs : (num(ent.nPavimentos, null) ? Array.apply(null, Array(num(ent.nPavimentos, 0))).map(function (_, i) { return { nome: "pavimento " + (i + 1) }; }) : []);
      if (!lista.length) { ctx.pendencia("entrada.incendio.pavimentos", "pavimentos não informados — extintores por pavimento", "extintores"); return; }
      lista.forEach(function (pv, ip) {
        var nome = pv.nome || ("pavimento " + (ip + 1)), ex = arr(pv.extintores).map(function (h) { return { id: h.id, x: num(h.x, 0), z: num(h.z != null ? h.z : h.y, 0) }; });
        var reg2 = { pavimento: nome, minimo: minPav, existentes: ex.length, propostos: 0, total: ex.length, status: "pendente", pontos: ex.map(function (h) { return { id: h.id, x: h.x, z: h.z, origem: "modelo" }; }) };
        EX.porPavimento.push(reg2);
        var M = pv.poligono ? malha(pv.poligono, pv.obstaculos, ent.passoMalha_m) : null;
        var ps = passos.slice();
        if (!M || !M.lista.length) {
          ctx.pendencia("entrada.incendio.pavimentos[" + ip + "].poligono", nome + " sem polígono: cobertura dos extintores não verificada (só o mínimo por pavimento)", "extintores");
          verif(nome, "extintores — cobertura por distância — " + nome, ex.length, minPav, "un", null, ps.concat(["pendente: sem polígono; mínimo " + minPav + " unidade(s) por pavimento (IT 16 6.2.1)"]), dmin.fonte);
          return;
        }
        ps.push("malha de " + f2(M.h) + " m sobre " + f2(M.area_m2) + " m²; distância pelo percurso (16 direções, ≥ o real)");
        if (ex.length) {
          var c = cobertura(M, ex, dmin.d, 1), okC = c.descobertas === 0, okN = minPav == null || ex.length >= minPav;
          ps.push(okC ? "toda a área a até " + f2(dmin.d) + " m de um extintor" : f2(c.area_descoberta_m2) + " m² além de " + f2(dmin.d) + " m");
          verif(nome, "extintores — cobertura por distância — " + nome, c.area_descoberta_m2, 0, "m² descobertos", okC, ps, dmin.fonte, "max");
          if (minPav != null) verif(nome, "extintores — mínimo por pavimento — " + nome, ex.length, minPav, "un", okN, [ex.length + " extintor(es) no modelo; mínimo " + minPav + " (IT 16 6.2.1)"], rMin && rMin.fonte, "min");
          if (!okN) aviso("erro", nome + ": " + ex.length + " extintor(es), mínimo " + minPav + " por pavimento (IT 16 6.2.1)", ex.map(function (h) { return h.id; }), { texto: "acrescentar " + (minPav - ex.length) + " extintor(es)" });
          pertoDoAcesso(nome, M, pv, ip, ex, rPorta ? rPorta.num : null, rPorta && rPorta.fonte, "extintor", "extintor", yE, "IT 16 5.2.2.9");
          reg2.status = okC && okN ? "ok" : "reprovado";
          if (!okC) { var pr0 = propor(M, ex, dmin.d, 1, [], null);
            aviso("erro", nome + ": " + f2(c.area_descoberta_m2) + " m² a mais de " + f2(dmin.d) + " m de um extintor", ex.map(function (h) { return h.id; }), { texto: "acrescentar " + pr0.pontos.length + " extintor(es) nas posições sugeridas", ops: pr0.pontos.map(function (p, k) { return opPeca("inc-ext-" + ip + "-a" + k, "extintor", p, pv, yE); }) }); }
        } else {
          var pr = propor(M, [], dmin.d, 1, pv.acessos, arr(pv.acessos).length && rPorta ? rPorta.num : null);
          var n = Math.max(pr.pontos.length, minPav || 0);
          pr.pontos.forEach(function (p, k) { var id = "inc-ext-" + ip + "-" + k; reg2.pontos.push({ id: id, x: p.x, z: p.z, origem: "proposto" }); out.ops.push(opPeca(id, "extintor", p, pv, yE)); out.opsDesfazer.push({ op: "apagar", id: id }); });
          reg2.propostos = pr.pontos.length; reg2.total = n;
          var okP = pr.descobertas === 0;
          ps.push("sem extintor no modelo: " + pr.pontos.length + " proposto(s)" + (arr(pv.acessos).length && rPorta ? " (o 1º a até " + f2(rPorta.num) + " m do acesso, IT 16 5.2.2.9)" : "") + "; mínimo " + minPav + " por pavimento (IT 16 6.2.1)");
          verif(nome, "extintores — cobertura por distância — " + nome, pr.area_descoberta_m2, 0, "m² descobertos", okP, ps, dmin.fonte, "max");
          pertoDoAcesso(nome, M, pv, ip, pr.pontos, rPorta ? rPorta.num : null, rPorta && rPorta.fonte, "extintor", "extintor", yE, "IT 16 5.2.2.9");
          reg2.status = okP ? "ok" : "reprovado";
        }
      });
    }

    /* ------------------------------------------------------------------ 5. CHUVEIROS */
    /* NBR 10897:2020 (texto conferido em 17/10/2026, nbr10897.json — exemplar não licenciado à RA): classificação,
       densidade × área (Figura 42, LIDA EM GRÁFICO), ajustes da área (8.5.4–8.5.5), tetos altos (Tabelas 23–26),
       espaçamento (Tabela 10), defletor (7.8), obstrução lateral (Tabela 15; 16–22 fora da base), fator K e pressão
       mínima, cálculo hidráulico (Hazen-Williams da 9.4.2.1.1 com C da Tabela 30), método por tabela (Tabelas 28,
       31–35), duração (Tabela 27) e reserva. Antes (Tigre, secundária) tudo isto era pendente. */
    var CH = out.chuveiros = { exigido: E.medidas.chuveiros_automaticos.exigido, risco: null, grupo: null, densidade: null, areaOperacao_m2: null, areaPorChuveiro_m2: null,
                               espacamento: null, nChuveirosArea: null, porRamal: null, k: null, vazaoMinChuveiro_lpm: null, hidraulico: null, demanda: null, ramais: [], pontos: [], status: null };
    if (CH.exigido === true) chuveiros();
    function chuveiros() {
      var ch = ent.chuveiros || {}, fR18 = fonteDe(K.r18, "item 5.1 (adota a NBR 10897)");
      function r10(item, contem, uso) { return regra(K.r10, "item", item, contem, uso || "chuveiros"); }
      /* --- risco (Seção 4 / Anexo A) */
      var risco = ch.risco ? String(ch.risco).toLowerCase() : null, origemR = "entrada";
      if (risco === "ordinario") { risco = "ordinario_2"; premissa("risco dos chuveiros", "\"ordinário\" sem grupo → Grupo 2 (lado seguro)", "padrao_motor"); }
      if (!risco && E.grupoLetra === "J") risco = "armazenamento";
      if (!risco) {
        var lr = ctx.linhas(K.riscoDiv, null, "chuveiros — risco pela ocupação"), mr = lr && lr.filter(function (l) { return l.divisao === E.divisao; })[0];
        if (mr) { risco = mr.risco; origemR = "padrao_motor"; premissa("classe de risco dos chuveiros (NBR 10897)", mr.risco + " — sugerida pela Tabela A.1 (exemplo: " + mr.exemplo_a1 + "); o RT confirma em chuveiros.risco", "padrao_motor", fonteDe(K.riscoDiv)); }
      } else premissa("classe de risco dos chuveiros (NBR 10897)", risco + " — classificada pelo RT (NBR 10897 Seção 4)", "entrada", fonteDe(K.densArea));
      if (risco === "armazenamento") { ctx.consulta(K.armaz, null, "valor", "chuveiros — armazenamento (NBR 13792)"); verif("chuveiros", "chuveiros em armazenamento (NBR 13792)", null, null, "", null, ["pendente: armazenamento de qualquer altura segue a NBR 13792 (NBR 10897 4.4), fora da base"], fonteDe(K.densArea)); CH.status = "pendente"; return; }
      if (!risco || !/^(leve|ordinario_1|ordinario_2|extra_1|extra_2)$/.test(risco)) { ctx.pendencia("entrada.incendio.chuveiros.risco", "classe de risco dos chuveiros não informada nem sugerida para " + E.divisao + " (leve, ordinario_1, ordinario_2, extra_1, extra_2 — NBR 10897 Seção 4 e Tabela A.1)", "chuveiros"); CH.status = "pendente"; return; }
      var grupo = risco.split("_")[0]; CH.risco = risco; CH.grupo = grupo;
      var metodo = ch.metodo === "tabela" ? "tabela" : "calculo", cobertura = ch.cobertura === "estendida" ? "estendida" : "padrao";
      var pd = num(ch.peDireito_m, null), passos = ["risco " + risco + (origemR === "entrada" ? " (RT)" : " (sugerido pela Tabela A.1)") + "; método " + (metodo === "tabela" ? "por tabela (8.4)" : "por cálculo hidráulico (8.5)") + "; cobertura " + cobertura];
      /* --- fator K (Tabela 1) e pressão mínima (9.4.4.10) */
      var kIn = num(ch.k, null), lk = ctx.linhas(K.fatorK, null, "chuveiros — fator K"), Kc = null;
      if (lk) {
        if (kIn == null) { var l80 = lk.filter(function (l) { return num(l.k_lpm_bar05, 0) === num((r10("9.5.1.2", "fator K") || {}).num, -1); })[0]; if (l80) { Kc = num(l80.k_lpm_bar05, null); premissa("fator K dos chuveiros", "K " + Kc + " (o da Tabela 1 exigido no método por tabela) — informe chuveiros.k", "padrao_motor", fonteDe(K.fatorK)); } }
        else if (lk.some(function (l) { return num(l.k_lpm_bar05, null) === kIn; })) Kc = kIn;
        else verif("chuveiros", "fator K nominal (Tabela 1)", kIn, null, "L/min/bar^½", false, ["K " + kIn + " não é nominal na Tabela 1 (" + lk.map(function (l) { return l.k_lpm_bar05; }).join(", ") + ")"], fonteDe(K.fatorK));
      }
      CH.k = Kc;
      var rPmin = r10("9.4.4.10"), Pmin = rPmin ? rPmin.num : null;
      if (Kc != null && Pmin != null) { CH.vazaoMinChuveiro_lpm = Kc * Math.sqrt(Pmin / BAR_KPA); passos.push("vazão mínima de um chuveiro = K·√P = " + Kc + "·√(" + f2(Pmin) + " kPa) = " + f2(CH.vazaoMinChuveiro_lpm) + " L/min (9.4.4.10)"); }
      /* --- densidade × área */
      var rTetoAlto = r10("8.5.2", "Teto alto"), dens = null, Ao = null, fD = null;
      if (pd != null && rTetoAlto && pd > rTetoAlto.num) {
        /* teto alto sem armazenagem: Tabela 24 (padrão) / 25 (estendida K 160/200) e K mínimo da Tabela 23 */
        var lkm = ctx.linhas(K.kMinTeto, null, "chuveiros — K mínimo em teto alto"), km = lkm && lkm.filter(function (l) { return l.grupo === grupo && pd > num(l.altura_de_m, 0) && (l.altura_ate_m == null || pd <= num(l.altura_ate_m, 0)); })[0];
        if (km && Kc != null) { var okK = Kc >= num(km.k_min, 0) && (km.cobertura !== "padrao" || cobertura === "padrao");
          verif("chuveiros", "K mínimo para teto de " + f2(pd) + " m (Tabela 23)", Kc, num(km.k_min, 0), "L/min/bar^½", okK, ["teto " + f2(pd) + " m, risco " + grupo + ": K ≥ " + km.k_min + (km.cobertura === "padrao" ? ", só cobertura-padrão" : "")], fonteDe(K.kMinTeto), "min"); }
        var tb = cobertura === "padrao" ? ctx.linhas(K.tetoAltoP, null, "chuveiros — teto alto (Tabela 24)") : ctx.linhas(K.tetoAltoE, null, "chuveiros — teto alto (Tabela 25)");
        var lt = tb && tb.filter(function (l) { return l.grupo === grupo && pd > num(l.altura_de_m, 0) && pd <= num(l.altura_ate_m, 0) && (cobertura === "padrao" || (l.orientacao === ch.orientacao && num(l.k, 0) === Kc)); })[0];
        if (!lt) { ctx.pendencia("in.nbr10897.teto_alto[" + grupo + ", " + pd + " m, " + cobertura + "]", "teto de " + f2(pd) + " m sem linha nas Tabelas 24/25 da NBR 10897 (acima de 18 m: Tabela 26 com K 360; estendida: orientação e K)", "chuveiros — densidade"); }
        else { dens = num(lt.densidade, null); Ao = num(lt.area_m2, null); fD = fonteDe(cobertura === "padrao" ? K.tetoAltoP : K.tetoAltoE);
               passos.push("teto alto " + f2(pd) + " m (> " + f2(rTetoAlto.num) + " m, 8.5.2): Tabela " + (cobertura === "padrao" ? "24" : "25") + " → " + f2(dens) + " L/min/m² sobre " + f2(Ao) + " m²" + (lt.min_chuveiros ? " (mín. " + lt.min_chuveiros + " chuveiros a " + f2(lt.pressao_min_bar) + " bar)" : "")); }
      } else {
        var cv = ctx.consulta(K.densArea, { risco: risco }, "densidade_1", "chuveiros — densidade × área (Figura 42)");
        if (cv.ok) {
          var L = cv.linha, d1 = num(L.densidade_1, 0), a1 = num(L.area_1, 0), d2 = num(L.densidade_2, 0), a2 = num(L.area_2, 0), aMin = Math.min(a1, a2), aMax = Math.max(a1, a2);
          var pedida = num(ch.areaOperacao_m2, null), aUso = pedida == null ? aMin : Math.max(aMin, Math.min(aMax, pedida));
          if (pedida != null && pedida < aMin) passos.push("área pedida " + f2(pedida) + " m² < " + f2(aMin) + " m²: vale a densidade da área mínima da curva (8.5.4)");
          if (pedida != null && pedida > aMax) passos.push("área pedida " + f2(pedida) + " m² além do fim da curva: densidade do ponto de " + f2(aMax) + " m²");
          dens = d1 + (d2 - d1) * (aUso - a1) / (a2 - a1);
          Ao = pedida != null && pedida > aMin ? pedida : aUso;
          fD = cv.fonte;
          passos.push("Figura 42, curva " + risco + ": reta de (" + f2(d1) + "; " + f2(a1) + " m²) a (" + f2(d2) + "; " + f2(a2) + " m²) — LIDO EM GRÁFICO, ±0,1 L/min/m² (lado seguro: maior densidade lida); em " + f2(aUso) + " m² → " + f2(dens) + " L/min/m² (interpolação linear)");
        }
      }
      if (dens == null || Ao == null) { verif("chuveiros", "densidade × área de operação", null, null, "L/min/m²", null, passos.concat(["pendente: densidade/área não determinadas"]), fD || fR18); CH.status = "pendente"; return; }
      /* --- ajustes da área de operação (8.5.5.2.2 resposta rápida; 8.5.5.7 teto inclinado e ação prévia: cumulativos) */
      var Aaj = Ao, rRRpd = r10("8.5.5.2.2", "pé-direito máximo"), rRRmin = r10("8.5.5.2.2", "mínimo de chuveiros");
      var rapida = ch.respostaRapida !== false && grupo !== "extra" && ch.tuboMolhado !== false;
      if (rapida && pd != null && rRRpd && pd <= rRRpd.num) {
        var lr2 = ctx.linhas(K.respRap, null, "chuveiros — resposta rápida (Figura 43)"), fx = lr2 && lr2.filter(function (l) { return pd > num(l.pe_direito_de_m, 0) && (l.pe_direito_ate_m == null || pd <= num(l.pe_direito_ate_m, 0)); })[0];
        if (fx) { var y = num(fx.a, 0) * pd + num(fx.b, 0); if (y > 0) { Aaj = Aaj * (1 - y / PCT); passos.push("resposta rápida, tubo molhado, pé-direito " + f2(pd) + " m: redução de " + f2(y) + " % (Figura 43) → " + f2(Aaj) + " m²"); } }
        premissa("chuveiros de resposta rápida", "sim (7.5.1: obrigatórios em sistema novo de risco leve) — informe respostaRapida = false para não reduzir a área", "padrao_motor");
      } else if (rapida && pd == null) passos.push("resposta rápida sem pé-direito informado: área sem redução (lado seguro)");
      var rInc = r10("8.5.5.7", "inclinação acima"), rAcr = r10("8.5.5.7", "Acréscimo");
      if (rInc && rAcr && num(ch.inclinacaoTeto_pct, 0) > rInc.num) { Aaj = Aaj * (1 + rAcr.num / PCT); passos.push("teto com " + f2(ch.inclinacaoTeto_pct) + " % > " + f2(rInc.num) + " %: área +" + f2(rAcr.num) + " % → " + f2(Aaj) + " m² (8.5.5.7)"); }
      if (rAcr && ch.acaoPreviaBloqueioDuplo) { Aaj = Aaj * (1 + rAcr.num / PCT); passos.push("ação prévia com bloqueio duplo: área +" + f2(rAcr.num) + " % → " + f2(Aaj) + " m² (8.5.5.7)"); }
      /* --- espaçamento e área por chuveiro (Tabela 10; 7.6.2) */
      var teto = ch.teto || "nao_combustivel_ou_combustivel_desobstruido", Amax = null, Dmax = null, fE = null;
      if (!ch.teto) premissa("tipo de teto (Tabela 10)", "não combustível ou combustível desobstruído — informe chuveiros.teto", "padrao_motor");
      if (cobertura === "padrao") {
        var le = ctx.linhas(K.espPadrao, null, "chuveiros — espaçamento (Tabela 10)"), lE = le && le.filter(function (l) { return l.teto === teto && l.metodo === metodo && l.grupo === grupo && (l.densidade_de == null || dens >= num(l.densidade_de, 0)) && (l.densidade_ate == null || dens < num(l.densidade_ate, 0)); })[0];
        if (lE) { Amax = num(lE.area_max_m2, null); Dmax = num(lE.dist_max_m, null); fE = fonteDe(K.espPadrao); passos.push("Tabela 10 (" + teto + ", " + metodo + ", " + grupo + "): área ≤ " + f2(Amax) + " m² por chuveiro, distância ≤ " + f2(Dmax) + " m"); }
        else ctx.pendencia("in.nbr10897.espacamento_padrao[" + teto + ", " + metodo + ", " + grupo + "]", "combinação sem linha na Tabela 10", "chuveiros — espaçamento");
      } else ctx.pendencia("in.nbr10897.cobertura_estendida", "cobertura estendida: área e distância pela Tabela 11 dependem do ensaio do chuveiro (listagem do fabricante) — não implementado", "chuveiros — espaçamento");
      var S = num((ch.espacamento || {}).s_m, null), Lr = num((ch.espacamento || {}).l_m, null);
      if ((S == null || Lr == null) && Dmax != null && Amax != null) { S = Lr = Math.min(Dmax, Math.sqrt(Amax)); premissa("espaçamento dos chuveiros", "quadrado " + f2(S) + " × " + f2(S) + " m (menor entre a distância máxima e √área máxima da Tabela 10)", "padrao_motor", fE); }
      var As = S != null && Lr != null ? areaCobertura(S, Lr) : null;
      CH.densidade = dens; CH.areaOperacao_m2 = Aaj; CH.espacamento = { s_m: S, l_m: Lr }; CH.areaPorChuveiro_m2 = As;
      if (As != null && Amax != null) verif("chuveiros", "área de cobertura por chuveiro (S × L)", As, Amax, "m²", As <= Amax + EPS, ["S × L = " + f2(S) + " × " + f2(Lr) + " = " + f2(As) + " m² (Figura 14)"], fE, "max");
      if (S != null && Dmax != null) verif("chuveiros", "distância entre chuveiros", Math.max(S, Lr), Dmax, "m", Math.max(S, Lr) <= Dmax + EPS, ["maior lado " + f2(Math.max(S, Lr)) + " m ≤ " + f2(Dmax) + " m (Tabela 10)"], fE, "max");
      /* --- chuveiros na área de operação (9.4.4.2; exemplo da Figura 46) */
      var rLado = r10("9.4.4.2"), nA = null;
      if (As != null) {
        var na = numeroNaArea(Aaj, As, S, rLado ? rLado.num : null);
        nA = na.n;
        if (rapida && rRRmin && nA < rRRmin.num && Aaj < Ao) { nA = rRRmin.num; passos.push("resposta rápida: nunca menos de " + rRRmin.num + " chuveiros na área (8.5.5.2.2)"); }
        CH.nChuveirosArea = nA; CH.porRamal = na.porRamal;
        passos.push("chuveiros na área de operação = ⌈" + f2(Aaj) + " / " + f2(As) + "⌉ = " + nA + "; por ramal = ⌈" + f2(rLado ? rLado.num : 0) + "·√" + f2(Aaj) + " / " + f2(S) + "⌉ = " + na.porRamal + " (9.4.4.2)");
      }
      var qMin = dens * (As || 0), qCh = Math.max(qMin, CH.vazaoMinChuveiro_lpm || 0);
      if (As != null) passos.push("vazão por chuveiro = máx(densidade × área do chuveiro = " + f2(qMin) + "; mínima pela pressão = " + f2(CH.vazaoMinChuveiro_lpm) + ") = " + f2(qCh) + " L/min");
      verif("chuveiros", "densidade × área de operação (NBR 10897)", dens, null, "L/min/m²", true, passos, fD, "min");
      /* --- defletor × teto (7.8) */
      var tipoCh = ch.tipoChuveiro || "spray", dT = num(ch.defletorTeto_mm, null), lDef = ctx.linhas(K.defletor, null, "chuveiros — defletor");
      var rowDef = lDef && lDef.filter(function (l) { return l.tipo_chuveiro === tipoCh && l.teto === (ch.tetoObstruido ? "obstruido" : "liso"); })[0];
      if (dT == null) { verif("chuveiros", "distância do defletor ao teto", null, rowDef ? num(rowDef.max_mm, null) : null, "mm", null, ["pendente: informe chuveiros.defletorTeto_mm (7.8.1)"], fonteDe(K.defletor), "max"); ctx.pendencia("entrada.incendio.chuveiros.defletorTeto_mm", "distância do defletor ao teto não informada (NBR 10897 7.8)", "chuveiros — defletor"); }
      else if (rowDef) { var okDef = dT >= num(rowDef.min_mm, 0) && dT <= num(rowDef.max_mm, 0) && (rowDef.max_ao_teto_mm == null || num(ch.defletorAoTetoTotal_mm, dT) <= num(rowDef.max_ao_teto_mm, 0));
        verif("chuveiros", "distância do defletor ao teto", dT, num(rowDef.max_mm, null), "mm", okDef, [tipoCh + ", teto " + rowDef.teto + ": " + rowDef.min_mm + " a " + rowDef.max_mm + " mm" + (rowDef.max_ao_teto_mm != null ? " (abaixo do elemento estrutural; ≤ " + rowDef.max_ao_teto_mm + " mm do teto)" : "") + "; informado " + f2(dT) + " mm"], fonteDe(K.defletor), "max");
        if (!okDef) aviso("erro", "defletor a " + f2(dT) + " mm do teto fora de " + rowDef.min_mm + "–" + rowDef.max_mm + " mm (NBR 10897 7.8)", [], { texto: "ajustar a altura do chuveiro para " + rowDef.min_mm + "–" + rowDef.max_mm + " mm abaixo do teto" }); }
      else ctx.pendencia("in.nbr10897.defletor_teto[" + tipoCh + "]", "tipo de chuveiro sem linha de distância ao teto", "chuveiros — defletor");
      /* --- obstruções (7.10): Tabela 15 conferida; as demais (Tabelas 16–22) fora da base */
      if (!Array.isArray(ch.obstrucoes)) { verif("chuveiros", "obstruções ao jato dos chuveiros (7.10)", null, null, "", null, ["pendente: declare chuveiros.obstrucoes (lista vazia = nenhuma obstrução)"], fonteDe(K.obst)); ctx.pendencia("entrada.incendio.chuveiros.obstrucoes", "obstruções (vigas, dutos, luminárias) não declaradas — informe a lista (vazia se não houver)", "chuveiros — obstruções"); }
      else {
        var lo = ctx.linhas(K.obst, null, "chuveiros — obstrução (Tabela 15)"), col = cobertura === "padrao" ? "b_max_padrao_mm" : "b_max_estendida_mm";
        ch.obstrucoes.forEach(function (o) {
          if (o.tipo && o.tipo !== "lateral") { ctx.consulta("in.nbr10897.obstrucoes_tabelas_16_22", null, "valor", "chuveiros — obstrução " + o.id);
            verif(o.id, "obstrução " + o.id + " (" + o.tipo + ")", null, null, "mm", null, ["pendente: Tabelas 16–22 da NBR 10897 não transcritas — conferir a obstrução no texto da norma (PDF p.59–70)"], fonteDe(K.obst)); return; }
          var A = num(o.a_mm, null), B = num(o.b_mm, null), lx = lo && A != null && lo.filter(function (l) { return A >= num(l.a_de_mm, 0) && A < num(l.a_ate_mm, 0); })[0], bm = lx ? num(lx[col], null) : null;
          if (bm == null) { verif(o.id, "obstrução lateral " + o.id + " (Tabela 15)", B, null, "mm", null, ["pendente: distância A " + f2(A) + " mm fora da Tabela 15 ou célula N.A."], fonteDe(K.obst)); ctx.pendencia("entrada.incendio.chuveiros.obstrucoes[" + o.id + "]", "obstrução sem limite na Tabela 15", "chuveiros — obstruções"); return; }
          var okO = B <= bm;
          verif(o.id, "obstrução lateral " + o.id + " (Tabela 15)", B, bm, "mm", okO, ["A = " + f2(A) + " mm → B máx " + bm + " mm (" + cobertura + "); B = " + f2(B) + " mm"], fonteDe(K.obst), "max");
          if (!okO) aviso("erro", "obstrução " + o.id + ": defletor " + f2(B) + " mm acima do nível inferior da obstrução (máx. " + bm + " mm a " + f2(A) + " mm dela)", [o.id], { texto: "afastar o chuveiro da obstrução ou baixar o defletor (Tabela 15)" });
        });
      }
      /* --- distribuição nos pavimentos: verificar os modelados ou propor a malha S × L */
      var rMinEntre = r10("7.7.4", cobertura === "padrao" ? "cobertura-padrão" : "cobertura estendida"), rParede = r10("7.7.4", "à parede"), rCol = r10("Tabela 8", metodo === "tabela" ? "por tabela" : (grupo === "extra" ? "extraordinário" : "leve/ordinário por cálculo"));
      pavs.forEach(function (pv, ip) {
        var P = pts(pv.poligono), nome = pv.nome || ("pavimento " + (ip + 1)); if (P.length < MIN_VERTICES) return;
        var areaP = areaPol(P);
        if (rCol) verif(nome, "área por coluna de alimentação — " + nome + " (Tabela 8)", areaP, rCol.num, "m²", areaP <= rCol.num, ["área do pavimento " + f2(areaP) + " m² ≤ " + f2(rCol.num) + " m² por coluna"], rCol.fonte, "max");
        var mod = arr(pv.chuveiros).map(function (c) { return { id: c.id, x: num(c.x, 0), z: num(c.z != null ? c.z : c.y, 0) }; });
        var lista = mod;
        if (!mod.length && S != null) {
          var minx = Math.min.apply(null, P.map(function (p) { return p.x; })), maxx = Math.max.apply(null, P.map(function (p) { return p.x; })), minz = Math.min.apply(null, P.map(function (p) { return p.z; })), maxz = Math.max.apply(null, P.map(function (p) { return p.z; }));
          var nx = Math.ceil((maxx - minx) / S), nz = Math.ceil((maxz - minz) / Lr), sx = (maxx - minx) / nx, sz = (maxz - minz) / nz, k = 0;
          for (var ix = 0; ix < nx; ix++) for (var iz = 0; iz < nz; iz++) {
            var x = minx + (ix + 1 / 2) * sx, z = minz + (iz + 1 / 2) * sz;
            if (!dentro(P, x, z) || arr(pv.obstaculos).some(function (o) { return dentro(pts(o), x, z); })) continue;
            var id = "inc-chu-" + ip + "-" + (k++); lista.push({ id: id, x: x, z: z }); CH.pontos.push({ id: id, pavimento: nome, x: x, z: z, origem: "proposto" });
            out.ops.push(opPeca(id, "chuveiro_automatico", { x: x, z: z }, pv, num(pv.peDireito_m, pd))); out.opsDesfazer.push({ op: "apagar", id: id });
          }
        } else mod.forEach(function (c) { CH.pontos.push({ id: c.id, pavimento: nome, x: c.x, z: c.z, origem: "modelo" }); });
        if (!lista.length) return;
        if (Amax != null) { var nNec = Math.ceil(areaP / Amax - EPS); verif(nome, "número de chuveiros — " + nome, lista.length, nNec, "un", lista.length >= nNec, ["área " + f2(areaP) + " m² / " + f2(Amax) + " m² por chuveiro → ≥ " + nNec], fE, "min"); }
        if (rMinEntre) { var dmin = Infinity; lista.forEach(function (a, i) { lista.forEach(function (b, j) { if (j > i) dmin = Math.min(dmin, Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z))); }); });
          if (lista.length > 1) verif(nome, "distância mínima entre chuveiros — " + nome, dmin, rMinEntre.num, "m", dmin >= rMinEntre.num - EPS, ["menor distância " + f2(dmin) + " m ≥ " + f2(rMinEntre.num) + " m (7.7.4)"], rMinEntre.fonte, "min"); }
        if (rParede) { var dpar = Infinity; lista.forEach(function (c) { dpar = Math.min(dpar, distPoligono(P, c)); });
          verif(nome, "distância mínima do chuveiro à parede — " + nome, dpar, rParede.num / MM_POR_M, "m", dpar >= rParede.num / MM_POR_M - EPS, ["menor distância à parede " + f2(dpar) + " m ≥ " + f2(rParede.num / MM_POR_M) + " m (7.7.4)"], rParede.fonte, "min"); }
        if (Dmax != null) { var M = malha(P, pv.obstaculos, ent.passoMalha_m), pior = 0;
          if (M) M.lista.forEach(function (i) { var c = centro(M, i), best = Infinity; lista.forEach(function (s) { best = Math.min(best, Math.sqrt((s.x - c.x) * (s.x - c.x) + (s.z - c.z) * (s.z - c.z))); }); pior = Math.max(pior, best); });
          var limP = Dmax / Math.SQRT2;
          verif(nome, "ponto do piso mais longe de um chuveiro — " + nome, pior, limP, "m", pior <= limP + (M ? M.h : 0), ["maior distância horizontal de um ponto do piso ao chuveiro mais próximo " + f2(pior) + " m ≤ meia diagonal do quadrado de " + f2(Dmax) + " m (" + f2(limP) + " m; critério derivado de S, L ≤ " + f2(Dmax) + " m e parede ≤ metade, 7.7.2)"], fE, "max"); }
      });
      /* --- duração, demanda e reserva (Tabelas 27, 28, 29) */
      var cDur = ctx.consulta(K.duracao, { risco: risco }, "duracao_min", "chuveiros — duração (Tabela 27)"), tDur = cDur.ok ? num(cDur.valor, null) : null;
      var cHid = ctx.consulta(K.demHid, { risco: risco }, "demanda_lpm", "chuveiros — demanda de hidrantes (Tabela 29)");
      CH.demanda = { densidade: dens, area_m2: Aaj, vazaoMinima_lpm: dens * Aaj, duracao_min: tDur, demandaHidrantes10897_lpm: cHid.ok ? num(cHid.valor, null) : null, fonte: cDur.fonte || fD, passos: [] };
      /* --- cálculo hidráulico (9.4) */
      var Qch = null;
      if (metodo === "calculo") Qch = hidraulicoChuveiros(ch, dens, As, Kc, Pmin, risco, CH);
      var vol = [];
      if (tDur != null) {
        var qBase = Math.max(dens * Aaj, Qch || 0);
        vol.push({ v: qBase * tDur / L_POR_M3, txt: "Q = " + f2(qBase) + " L/min" + (Qch ? " (cálculo hidráulico)" : " (densidade × área: mínimo, sem o cálculo da rede)") + " × " + tDur + " min (Tabela 27)" });
      }
      if (metodo === "tabela") {
        var cT = ctx.consulta(K.metTab, { risco: risco }, "vazao_lpm", "chuveiros — método por tabela (Tabela 28)");
        if (cT.ok) { vol.push({ v: num(cT.valor, 0) * num(cT.linha.duracao_min, 0) / L_POR_M3, txt: "método por tabela: " + cT.valor + " L/min (inclui hidrantes) × " + cT.linha.duracao_min + " min (Tabela 28)" });
                     CH.demanda.pressaoResidual_kpa = num(cT.linha.pressao_residual_kpa, null); }
        metodoTabela(ch, grupo, Kc, CH);
      }
      if (vol.length) {
        vol.sort(function (a, b) { return b.v - a.v; });
        R.chuveiros_m3 = vol[0].v; R.fonte.push(CH.demanda.fonte);
        CH.demanda.passos = vol.map(function (x) { return x.txt + " = " + f2(x.v) + " m³"; }).concat(["reserva dos chuveiros = a maior = " + f2(vol[0].v) + " m³"]);
        R.passos.push("chuveiros (NBR 10897, risco " + risco + "): " + vol.map(function (x) { return f2(x.v) + " m³"; }).join(" / ") + " → " + f2(R.chuveiros_m3) + " m³ (a maior)");
        if (CH.demanda.demandaHidrantes10897_lpm != null) premissa("hidrantes junto com chuveiros", "reserva dos hidrantes pela IT 17 Tabela 4 somada (IT 18 5.11); a demanda de hidrantes da NBR 10897 Tabela 29 (" + CH.demanda.demandaHidrantes10897_lpm + " L/min) fica só como referência — sem soma dupla", "padrao_motor", fonteDe(K.demHid));
      }
      CH.status = "calculado";
    }
    /* cálculo hidráulico da área de operação (9.4): árvore a partir da origem; os chuveiros da área são os
       informados (areaOperacaoChuveiros) ou os N mais distantes da origem pelo caminho (premissa); em cada nó
       vale a maior pressão exigida e os ramos de menor pressão sobem a vazão pelo K do ramo, Q·√(P/Pr) (9.4.3.3).
       Perda: Hazen-Williams da 9.4.2.1.1 (kPa/m) com C da Tabela 30; desnível por ρg. Pressão TOTAL (sem
       descontar a de velocidade: lado seguro — ver PV_DECLARACAO). */
    function hidraulicoChuveiros(ch, dens, As, Kc, Pmin, risco, CHo) {
      var rd = ch.rede, H = HH();
      if (!rd || !arr(rd.trechos).length) {
        verif("chuveiros", "cálculo hidráulico dos chuveiros (9.4)", null, null, "kPa", null, ["pendente: rede dos chuveiros não informada (chuveiros.rede: nós com cota, trechos, chuveiros, origem)"], fonteDe(K.hwC));
        ctx.pendencia("entrada.incendio.chuveiros.rede", "rede de chuveiros não modelada: sem ela não há pressão na origem nem vazão real (a reserva usa densidade × área, que é o mínimo)", "chuveiros — cálculo hidráulico");
        return null;
      }
      if (Kc == null || As == null || Pmin == null) { verif("chuveiros", "cálculo hidráulico dos chuveiros (9.4)", null, null, "kPa", null, ["pendente: fator K, área por chuveiro ou pressão mínima"], fonteDe(K.hwC)); return null; }
      var mat = rd.material || "aco_preto", nomeC = rd.tipoTubo || TUBO_10897[mat];
      var cC = nomeC ? ctx.consulta(K.hwC, { tipo_de_tubo: nomeC }, "C", "chuveiros — C de Hazen-Williams (Tabela 30)") : null, C = cC && cC.ok ? num(cC.valor, null) : null;
      if (!nomeC) ctx.pendencia("entrada.incendio.chuveiros.rede.material", "material \"" + mat + "\" sem linha na Tabela 30 da NBR 10897", "chuveiros");
      if (C == null) return null;
      var nos = rd.nos || {}, raiz = (rd.origem || {}).no, adj = {}, faltaDi = {}, faltaLeq = {};
      arr(rd.trechos).forEach(function (t) { (adj[t.de] = adj[t.de] || []).push(t); (adj[t.para] = adj[t.para] || []).push(t); });
      var pai = {}, viaT = {}, fila = [raiz], vis = {}, ordem = []; vis[raiz] = 1;
      while (fila.length) { var n = fila.shift(); ordem.push(n); arr(adj[n]).forEach(function (t) { var o = t.de === n ? t.para : t.de; if (vis[o]) return; vis[o] = 1; pai[o] = n; viaT[o] = t; fila.push(o); }); }
      function dist(no) { var s = 0, x = no; while (x !== raiz && viaT[x]) { s += num(viaT[x].comprimento_m, 0); x = pai[x]; } return x === raiz ? s : null; }
      var chs = arr(rd.chuveiros).filter(function (c) { return dist(c.no) != null; });
      var nA = CHo.nChuveirosArea || 0, ids = arr(ch.areaOperacaoChuveiros);
      var operam = ids.length ? chs.filter(function (c) { return ids.indexOf(c.id) >= 0; }) : chs.slice().sort(function (a, b) { return dist(b.no) - dist(a.no); }).slice(0, nA);
      if (!ids.length) premissa("chuveiros da área de operação", "os " + nA + " mais distantes da origem pelo caminho da rede (informe areaOperacaoChuveiros para fixar a área retangular remota, 9.4.4.2)", "padrao_motor");
      if (operam.length < nA) { verif("chuveiros", "chuveiros na área de operação", operam.length, nA, "un", false, ["a rede tem " + operam.length + " chuveiros ligados; a área de operação pede " + nA], fonteDe(K.densArea), "min"); }
      var noOp = {}; operam.forEach(function (c) { noOp[c.no] = (noOp[c.no] || 0) + 1; });
      var qReq = Math.max(dens * As, Kc * Math.sqrt(Pmin / BAR_KPA));
      var disCh = rd.diametros || diametrosAco(mat, rd.schedule, "chuveiros — DI do tubo de aço") || {};
      function hf(t, q) { var d = num(t.di_mm, num(disCh[t.dn], null)); if (d == null) { faltaDi[t.dn] = 1; return null; } var l = 0; arr(t.conexoes).forEach(function (c) { var v = num(c.leq_m, null); if (v == null) faltaLeq[c.tipo || "?"] = 1; else l += v; }); return jNBR10897(q, C, d) * (num(t.comprimento_m, 0) + l); }
      function cota(no) { return num((nos[no] || {}).cota, 0); }
      /* resolve(no) → {Q, P} no nó, só com os ramos que têm chuveiro operando */
      function resolve(no) {
        var reqs = [];
        if (noOp[no]) for (var i = 0; i < noOp[no]; i++) reqs.push({ Q: qReq, P: Math.pow(qReq / Kc, 2) * BAR_KPA, chuveiro: true });
        var filhos = arr(adj[no]).filter(function (t) { var o = t.de === no ? t.para : t.de; return pai[o] === no; });
        for (var f = 0; f < filhos.length; f++) {
          var t = filhos[f], o = t.de === no ? t.para : t.de, r = resolve(o); if (r === null) return null; if (!r) continue;
          var h = hf(t, r.Q); if (h == null) return null;
          reqs.push({ Q: r.Q, P: r.P + h + H.mParaKpa(cota(o) - cota(no)) });
        }
        if (!reqs.length) return false;
        var Pmax = Math.max.apply(null, reqs.map(function (x) { return x.P; })), Q = 0;
        reqs.forEach(function (x) { Q += x.P > 0 ? x.Q * Math.sqrt(Pmax / x.P) : x.Q; });
        return { Q: Q, P: Pmax };
      }
      var res = resolve(raiz);
      if (Object.keys(faltaDi).length) ctx.pendencia("entrada.incendio.chuveiros.rede.diametros", "diâmetro interno dos tubos DN " + Object.keys(faltaDi).join(", ") + " não informado", "chuveiros — cálculo hidráulico");
      if (Object.keys(faltaLeq).length) ctx.pendencia("in.nbr10897.comprimento_equivalente", "comprimento equivalente das conexões (" + Object.keys(faltaLeq).join(", ") + ") — a NBR 10897 não traz a tabela (9.4.3.4): informe o do fabricante", "chuveiros — cálculo hidráulico");
      if (!res) { verif("chuveiros", "cálculo hidráulico dos chuveiros (9.4)", null, null, "kPa", null, ["pendente: diâmetro interno ou comprimento equivalente (ver pendências)"], fonteDe(K.hwC)); return null; }
      CHo.hidraulico = { C: C, material: mat, chuveirosOperando: operam.map(function (c) { return c.id; }), vazaoChuveiro_lpm: qReq, Q_lpm: res.Q, P_origem_kpa: res.P,
                         passos: ["C = " + C + " (Tabela 30, " + nomeC + ")", "J = 605·Q^1,85/(C^1,85·d^4,87)·10^5 kPa/m (9.4.2.1.1); desnível por ρg", "chuveiro mais remoto: Q = " + f2(qReq) + " L/min, P = (Q/K)² = " + f2(Math.pow(qReq / Kc, 2) * BAR_KPA) + " kPa",
                                  "balanceamento nos nós pelo K do ramo, Q·√(P/Pr) (9.4.3.3); pressão TOTAL (a de velocidade não é descontada: lado seguro)", "origem " + raiz + ": Q = " + f2(res.Q) + " L/min, P = " + f2(res.P) + " kPa"] };
      premissa("pressão de velocidade (9.4.2.1.2)", PV_DECLARACAO, "padrao_motor", fonteDe(K.hwC));
      verif("chuveiros", "cálculo hidráulico dos chuveiros (9.4)", res.P, null, "kPa", true, CHo.hidraulico.passos, fonteDe(K.hwC));
      var rPmax = regra(K.r10, "item", "9.4.4.11", null, "chuveiros — pressão máxima");
      if (/^extra/.test(risco) && rPmax) verif("chuveiros", "pressão máxima em risco extra", res.P, rPmax.num, "kPa", res.P <= rPmax.num, ["pressão na origem " + f2(res.P) + " kPa ≤ " + f2(rPmax.num) + " kPa (9.4.4.11)"], rPmax.fonte, "max");
      var pDisp = num((rd.origem || {}).pressaoDisponivel_kpa, null);
      if (pDisp == null) { verif("chuveiros", "pressão disponível na origem dos chuveiros", null, res.P, "kPa", null, ["pendente: informe chuveiros.rede.origem.pressaoDisponivel_kpa (bomba ou reservatório) para " + f2(res.Q) + " L/min"], fonteDe(K.hwC), "min"); ctx.pendencia("entrada.incendio.chuveiros.rede.origem.pressaoDisponivel_kpa", "pressão disponível na origem dos chuveiros não informada (a bomba é especificada pelo ponto Q × P)", "chuveiros — fonte"); }
      else verif("chuveiros", "pressão disponível na origem dos chuveiros", pDisp, res.P, "kPa", pDisp >= res.P, ["disponível " + f2(pDisp) + " kPa ≥ exigida " + f2(res.P) + " kPa com " + f2(res.Q) + " L/min"], fonteDe(K.hwC), "min");
      return res.Q;
    }
    /* método por tabela (8.4, 9.5): condições de uso + nº de chuveiros por DN (Tabelas 31–35) */
    function metodoTabela(ch, grupo, Kc, CHo) {
      var rA = regra(K.r10, "item", "9.5.1.1", null, "chuveiros — método por tabela"), rK = regra(K.r10, "item", "9.5.1.2", "fator K", "chuveiros — método por tabela"), rLado = regra(K.r10, "item", "9.5.2", null, "chuveiros — método por tabela");
      var area = num(ch.areaSistema_m2, null), motivos = [];
      if (grupo === "extra") motivos.push("risco extra é sempre por cálculo hidráulico (9.5.1.2)");
      if (rA && area != null && area > rA.num) motivos.push("área do sistema " + f2(area) + " m² > " + f2(rA.num) + " m² (9.5.1.1)");
      if (rA && area == null) { ctx.pendencia("entrada.incendio.chuveiros.areaSistema_m2", "área do sistema não informada: o método por tabela só vale até o limite da 9.5.1.1", "chuveiros — método por tabela"); }
      if (rK && Kc != null && Kc !== rK.num) motivos.push("K " + Kc + " ≠ " + rK.num + " (9.5.1.2)");
      arr(ch.ramais).forEach(function (r) { if (!/a[cç]o|cobre|inox/i.test(r.material || "")) motivos.push("ramal " + r.id + " em " + (r.material || "material não informado") + " (só aço, aço inoxidável ou cobre, 9.5.1.2)"); });
      verif("chuveiros", "método por tabela aplicável (9.5.1)", motivos.length, 0, "", motivos.length === 0, motivos.length ? motivos : ["risco " + grupo + ", área ≤ limite, K e material conferidos"], rA && rA.fonte, "max");
      if (motivos.length) aviso("erro", "método por tabela não se aplica: " + motivos.join("; "), [], { texto: "usar o cálculo hidráulico (chuveiros.metodo = \"calculo\")" });
      arr(ch.ramais).forEach(function (r) {
        var chave = grupo === "leve" ? (r.acimaAbaixoForro ? K.tubLeveForro : K.tubLeve) : (r.acimaAbaixoForro ? K.tubOrdForro : (r.espacamentoMaior ? K.tubOrdEsp : K.tubOrd));
        var lt = ctx.linhas(chave, null, "chuveiros — tubos por tabela"), col = /cobre/i.test(r.material || "") ? "cobre" : "aco";
        var ln = lt && lt.filter(function (x) { return num(x.dn, null) === num(r.dn, null); })[0];
        if (!ln && chave === K.tubOrdEsp) { lt = ctx.linhas(K.tubOrd, null, "chuveiros — tubos por tabela"); ln = lt && lt.filter(function (x) { return num(x.dn, null) === num(r.dn, null); })[0]; }
        var mx = ln ? num(ln[col], null) : null, n = num(r.chuveiros, 0);
        if (mx == null) { verif(r.id, "chuveiros por DN — " + r.id, n, null, "un", null, ["pendente: DN " + r.dn + " sem limite na tabela"], fonteDe(chave)); return; }
        var ok = n <= mx; CHo.ramais.push({ id: r.id, dn: r.dn, chuveiros: n, max: mx, ok: ok });
        verif(r.id, "chuveiros por DN — " + r.id, n, mx, "un", ok, ["DN " + r.dn + " (" + col + "): até " + mx + " chuveiros (" + (fonteDe(chave) || {}).tabela + "); a jusante " + n], fonteDe(chave), "max");
        if (!ok) { var maior = lt.filter(function (x) { var v = num(x[col], null); return v != null && v >= n; })[0];
          aviso("erro", "ramal " + r.id + " DN " + r.dn + " com " + n + " chuveiros (máx. " + mx + ")", [r.id], { texto: maior ? "trocar para DN " + maior.dn : "dividir o ramal", ops: maior ? [{ op: "instAlterar", id: r.id, dn: num(maior.dn, 0) }] : [] }); }
        if (rLado && num(r.porLado, null) != null) verif(r.id, "chuveiros por lado da subgeral — " + r.id, num(r.porLado, 0), rLado.num, "un", num(r.porLado, 0) <= rLado.num, ["≤ " + rLado.num + " por lado (9.5.2)"], rLado.fonte, "max");
      });
    }

    /* ------------------------------------------------------------------ RESERVA TOTAL */
    var r511 = CH.exigido === true ? regra(K.r18, "item_IT18", "5.11", null, "reserva — hidrantes e chuveiros") : null;
    var partes = [R.hidrantes_m3, CH.exigido === true ? R.chuveiros_m3 : 0];
    if (HX.exigido === null || partes.some(function (v) { return v == null; })) {
      R.status = "pendente";
      verif("reserva", "reserva técnica de incêndio", null, null, "m³", null, R.passos.concat(["pendente: " + (HX.exigido === null ? "exigência de hidrantes não determinada" : (R.hidrantes_m3 == null ? "reserva dos hidrantes" : "reserva dos chuveiros"))]), R.fonte[0] || fonteDe(K.ri));
    } else {
      R.chuveiros_m3 = CH.exigido === true ? R.chuveiros_m3 : 0;
      R.total_m3 = R.hidrantes_m3 + R.chuveiros_m3; R.total_L = R.total_m3 * L_POR_M3; R.status = "ok";
      if (CH.exigido === true) R.passos.push("hidrantes + chuveiros somados" + (r511 ? " (IT 18 5.11: " + r511.valor + ")" : "") + " = " + f2(R.total_m3) + " m³");
      R.passos.push("reserva técnica de incêndio = " + f2(R.total_m3) + " m³ = " + f2(R.total_L) + " L (somada à reservação da água fria pelo orquestrador)");
    }

    /* ------------------------------------------------------------------ NBR 13714: o que a IT não cobre */
    if (HX.exigido === true && HX.tipo != null) requisitos13714();
    function requisitos13714() {
      var REQ = HX.requisitos13714 = [], ri = R.hidrantes_m3;
      function req(item, texto, valor) { REQ.push({ item: "NBR 13714 " + item, texto: texto, valor: valor == null ? null : valor, fonte: fonteDe(K.r13, item) }); }
      var a13 = r13("A.1.3", null, "reservatório"), a18 = r13("A.1.8", null, "reservatório");
      if (a13) req("A.1.3", "reservatório em 2 células interligadas, cada uma com ≥ " + f2(a13.num) + " % da reserva" + (ri != null ? " (≥ " + f2(ri * a13.num / PCT) + " m³ cada)" : ""), ri != null ? ri * a13.num / PCT : null);
      if (a18 && ri != null) req("A.1.8", "reposição recomendada " + f2(a18.num) + " L/min por m³ → " + f2(ri * a18.num) + " L/min", ri * a18.num);
      var org = (ent.rede || {}).origem || {};
      if (a13 && org.celulas != null) verif("reservatorio", "reservatório em células (limpeza sem esvaziar)", num(org.celulas, 0), 2, "células", num(org.celulas, 0) >= 2, ["NBR 13714 A.1.3: manter ≥ " + f2(a13.num) + " % da reserva na limpeza → 2 células interligadas"], a13.fonte, "min");
      if (a18 && ri != null && org.reposicao_lpm != null) verif("reservatorio", "reposição da reserva", num(org.reposicao_lpm, 0), ri * a18.num, "L/min", num(org.reposicao_lpm, 0) >= ri * a18.num, ["recomendada " + f2(a18.num) + " L/min × " + f2(ri) + " m³ = " + f2(ri * a18.num) + " L/min (NBR 13714 A.1.8)"], a18.fonte, "min");
      var s1 = r13("5.7.6.3", "espaçamento"), s2 = r13("5.7.6.3", "massa"), s3 = r13("5.7.6.3", "parcela fixa");
      if (s1 && s2 && s3) req("5.7.6.3", "suportes metálicos rígidos a cada ≤ " + f2(s1.num) + " m; cada fixação resiste a " + f2(s2.num) + " × a massa do tubo cheio + " + f2(s3.num) + " kg", s1.num);
      var rc1 = r13("4.2.1"), rc3 = r13("4.2.3", "caixa"), rc4 = r13("4.2.4");
      if (rc1 && rc3 && rc4) req("4.2", "recalque: prolongamento com o DN da principal (DN " + rc1.valor + "); no passeio, caixa " + rc3.valor + " m; na fachada/muro a " + rc4.valor + " m do piso" + (NBR ? "" : " — em MG o engate DN 65 e a caixa seguem a IT 17 5.3"), null);
      var b19 = r13("B.1.9"), b218 = r13("B.2.18");
      if (HX.bomba) {
        if (b19) req("B.1.9", "bomba em pleno regime em cerca de " + f2(b19.num) + " s", b19.num);
        if (b218) req("B.2.18", "recirculação por tubo ou orifício de " + f2(b218.num) + " mm", b218.num);
        if (org.motor === "combustao") { var t2 = r13("B.3.6", "tanque"), t3 = r13("B.3.6", "bacia"), t6 = r13("B.3.2"); if (t2 && t3) req("B.3", "motor a combustão: " + (t6 ? f2(t6.num) + " h a plena carga; " : "") + "tanque ≥ " + f2(t2.num) + " × o tempo de funcionamento; bacia ≥ " + f2(t3.num) + " × o tanque", null); }
      }
      var c1 = r13("C.1.2", "fator"), c2 = r13("C.1.2", "mínima"), c3 = r13("C.1.2", "duração");
      if (c1 && c2 && c3) { var pMaxKpa = HX.trechos.length ? HH().mParaKpa(Math.max.apply(null, HX.trechos.map(function (t) { return t.pressaoMontante_mca || 0; }).concat([HX.bomba && HX.bomba.AMT_m || 0]))) : null;
        var pEns = pMaxKpa != null ? Math.max(c1.num * pMaxKpa, c2.num) : c2.num;
        req("C.1.2", "ensaio de estanqueidade a " + f2(pEns) + " kPa (" + f2(c1.num) + " × a pressão máxima de trabalho ou " + f2(c2.num) + " kPa, o maior) por " + f2(c3.num) + " h, sem vazamento", pEns); }
      var v1 = r13("C.2"), v2 = r13("C.3.1");
      if (v1 && v2) req("C.2/C.3", "vistoria a cada ≤ " + f2(v1.num) + " meses; plano de manutenção com ciclo ≤ " + f2(v2.num) + " ano", null);
      /* termoplástico só enterrado e fora da projeção (NBR 13714 5.7.6.4 = IT 17 5.16.11) */
      var matR = (ent.rede || {}).material;
      if (/pvc|cpvc|ppr|plastic/i.test(String(matR || ""))) {
        var r764 = r13("5.7.6.4"), enterr = (ent.rede || {}).enterradaForaProjecao;
        verif("rede", "tubulação termoplástica só enterrada e fora da projeção", enterr === true ? "sim" : (enterr === false ? "não" : null), "sim", "", enterr === true ? true : (enterr === false ? false : null),
              [enterr == null ? "pendente: declare rede.enterradaForaProjecao (NBR 13714 5.7.6.4 / IT 17 5.16.11)" : "rede de " + matR + (enterr ? "" : " NÃO") + " enterrada fora da projeção"], r764 && r764.fonte);
        if (enterr == null) ctx.pendencia("entrada.incendio.rede.enterradaForaProjecao", "rede termoplástica: só é admitida enterrada e fora da projeção da edificação", "hidrantes — material");
        else if (!enterr) aviso("erro", "tubulação termoplástica fora das condições (só enterrada e fora da projeção)", [], { texto: "trocar por aço/cobre nos trechos aparentes ou dentro da projeção" });
      }
    }
    /* conferência IT 17 × NBR 13714: Hazen-Williams (forma e C) e poço de sucção — iguais viram premissa; diferente, aviso */
    (function () {
      if (HX.exigido !== true) return;
      var a = NR().tabela(K.hw), b = NR().tabela(K.n13hw), p = NR().tabela(K.poco), q = NR().tabela(K.n13poco), dif = [];
      if (a && b) { if (a.linhas.length !== b.linhas.length) dif.push("C: " + a.linhas.length + " × " + b.linhas.length + " linhas"); else a.linhas.forEach(function (l, i) { if (num(l.C, null) !== num(b.linhas[i].C, null)) dif.push("C de " + l.tipo_de_tubo + ": " + l.C + " (IT 17) × " + b.linhas[i].C + " (13714)"); }); }
      if (p && q) p.linhas.forEach(function (l) { var m = q.linhas.filter(function (x) { return num(x.dn_tubo_succao_mm, null) === num(l.dn_tubo_succao_mm, null); })[0]; if (!m || num(m.dimensao_A_mm, null) !== num(l.dimensao_A_mm, null) || num(m.dimensao_B_mm, null) !== num(l.dimensao_B_mm, null)) dif.push("poço DN " + l.dn_tubo_succao_mm); });
      if (dif.length) aviso("aviso", "IT 17 × NBR 13714 divergem: " + dif.join("; ") + (NBR ? " — vale a 13714 (regra escolhida)" : " — em MG vale a IT 17"), [], { texto: "conferir as duas tabelas no texto" });
      else premissa("conferência IT 17 × NBR 13714", "Hazen-Williams: a forma da IT 17 5.8.10 b (J m/m, ×10^4) é a da 13714 5.3.8 (J kPa/m, ×10^5) com 1 mca = 10 kPa; Tabela 1 da IT 17 = Tabela 3 da 13714 (" + (a ? a.linhas.length : 0) + " C iguais); poço de sucção B.1 = A.1", "norma", fonteDe(K.n13hw));
    })();
    if (notas13714.length) out.premissas.push({ item: "NBR 13714 × IT 17 (MG: vale a IT)", valor: notas13714.join(" | "), origem: "norma", fonte: fonteDe(K.r13) });

    /* ------------------------------------------------------------------ fechamento */
    if (out.ops.length && !out.aplicavel) aviso("info", out.ops.length + " operação(ões) de incêndio para o modelo (hidrantes, extintores, chuveiros, DN): o biminst desta instalação não tem o sistema \"incendio\"", [],
                              { texto: "aplicar o patch de " + out.patch + " para as ops entrarem no modelo" });
    var sec = out.verificacoes.filter(function (v) { return v.fonte && v.fonte.tipo === "secundaria"; }).length;
    if (sec) aviso("aviso", sec + " verificação(ões) de incêndio com fonte SECUNDÁRIA (manual Tigre / artigo): conferir na NBR 10897 antes de assinar", [], { texto: "consultar a NBR 10897 (convênio Confea) e trocar a fonte" });
    aviso("info", "ITs 16 e 17 citam os Decretos 44.746/2008 e 44.270/2006, revogados pelo Decreto 47.998/2020 (vigente); a IT 16 cita a NBR 12693:2013 e a vigente é a 2021 — o memorial declara",
          [], { texto: "manter a declaração no memorial; conferir decreto posterior antes de emitir o PSCIP (in.decreto.alteracoes_recentes)" });
    out.pendencias = minhas;
    out.normas = base.normas();
    var reprov = out.verificacoes.filter(function (v) { return v.status === "reprovado"; }).length, pend = out.verificacoes.filter(function (v) { return v.status === "pendente"; }).length;
    var erros = out.avisos.filter(function (a) { return a.gravidade === "erro"; }).length;
    out.status = reprov || erros ? "reprovado" : (pend || minhas.length || E.status !== "ok" ? "pendente" : "ok");
    out.ok = out.status === "ok" && !out.fixture;
    out.resumo = { exigencias: MEDIDAS.reduce(function (o, m) { o[m] = E.medidas[m].exigido; return o; }, {}), tipoSistema: HX.tipo, reserva_m3: R.total_m3,
                   hidrantes: HX.pontos.length, extintores: EX.porPavimento.reduce(function (s, p) { return s + p.total; }, 0), chuveiros: CH.pontos.length,
                   reprovadas: reprov, pendentes: pend + minhas.length, erros: erros };
    return out;
  }

  /* GANCHO do orquestrador (uma linha no hiddimensionar): calcula o incêndio no MESMO contexto
     (normas e pendências juntas), põe verificações/avisos/premissas no resultado geral e devolve
     a entrada com programa.reservaIncendio_L preenchida (a AF soma a reserva técnica). A entrada
     original não é alterada. As ops do incêndio entram em res.ops quando o biminst aceita o sistema
     (sistemas.incendio.aplicavel — hiddimensionar, passo 6). Revisão da junção J19. */
  function gancho(entrada, ctx, res) {
    if (!entrada || !entrada.incendio) return entrada;
    var r = calcular(entrada.incendio, ctx), Rv = r.reserva, e2 = entrada, prem = [];
    function avisoG(grav, texto, corrigir) { r.avisos.push({ id: "in-" + r.avisos.length, sistema: SIS, gravidade: grav, texto: texto, elementos: [], corrigir: corrigir }); r.problemas.push({ texto: texto, elementos: [], acao: corrigir }); }
    if (Rv && Rv.total_L != null) {
      var prog = entrada.programa, inf = prog ? num(prog.reservaIncendio_L, null) : null;
      if (!prog) /* revisão INC B2: sem programa a reserva não entra na reservação — avisar, nunca calar */
        avisoG("aviso", "reserva técnica de incêndio de " + Rv.total_L + " L calculada, mas NÃO somada à reservação: a entrada não tem programa de necessidades", { texto: "informar o programa (ou somar " + Rv.total_L + " L ao reservatório à mão)" });
      else if (inf == null) {
        e2 = {}; Object.keys(entrada).forEach(function (k) { e2[k] = entrada[k]; });
        e2.programa = {}; Object.keys(prog).forEach(function (k) { e2.programa[k] = prog[k]; });
        e2.programa.reservaIncendio_L = Rv.total_L;
        e2.programa.reservaIncendioOrigem = "calculada pela IT 17 (reserva técnica de incêndio)";   /* revisão da junção J13 */
        prem.push({ item: "reserva de incêndio somada à reservação", valor: Rv.total_L + " L (" + Rv.passos.join("; ") + ")", origem: "norma", fonte: Rv.fonte[0] || null });
      } else {
        /* ⚠ revisão INC A1 (decisão do RT): reserva informada MENOR que a calculada é reprovada — antes a AF usava a
           informada (1.000 L no lugar de 8.000) calada. Maior ou igual: premissa do RT. */
        var okR = inf >= Rv.total_L;
        var vR = { id: "in-v" + r.verificacoes.length, sistema: SIS, alvo: "reserva", nome: "reserva de incêndio informada ≥ calculada", valor: inf, limite: Rv.total_L, unidade: "L",
                   eta: inf > 0 ? Rv.total_L / inf : null, ok: okR, status: okR ? "ok" : "reprovado",
                   passos: ["informada no programa: " + inf + " L; calculada: " + Rv.total_L + " L (" + Rv.passos.join("; ") + ")"], fonte: Rv.fonte[0] || null };
        r.verificacoes.push(vR);
        if (!okR) { avisoG("erro", "reserva de incêndio informada (" + inf + " L) menor que a exigida pela IT 17 (" + Rv.total_L + " L)", { texto: "usar " + Rv.total_L + " L (programa.reservaIncendio_L)" });
                    r.status = "reprovado"; r.ok = false; if (r.resumo) { r.resumo.reprovadas++; r.resumo.erros++; } }
        else prem.push({ item: "reserva de incêndio informada", valor: inf + " L ≥ " + Rv.total_L + " L calculados", origem: "entrada", fonte: Rv.fonte[0] || null });
      }
    }
    prem.forEach(function (p) { r.premissas.push(p); });
    if (res) {
      res.sistemas = res.sistemas || {};
      res.sistemas.incendio = r;
      r.verificacoes.forEach(function (v) { res.verificacoes.push(v); });
      r.avisos.forEach(function (a) { res.avisos.push(a); });
      r.premissas.forEach(function (p) { if (!res.premissas.some(function (q) { return q.item === p.item; })) res.premissas.push(p); });
    }
    return e2;
  }

  var HidInc = { VERSAO: 1, SISTEMA: SIS, calcular: calcular, gancho: gancho,
                 /* expostos para teste e para a tela */
                 jHW: jHW, velocidade: velocidade, kEsguicho: kEsguicho, numBR: numBR, faixaAltura: faixaAltura, faixaArea: faixaArea,
                 clausulasRI: clausulasRI, capacidade: capacidade, areaCobertura: areaCobertura, numeroNaArea: numeroNaArea, jNBR10897: jNBR10897, pressaoVelocidade: pressaoVelocidade, malha: malha, caminhos: caminhos, cobertura: cobertura, propor: propor, TUBO_HW: TUBO_HW };
  global.HidInc = HidInc;
  if (typeof module !== "undefined" && module.exports) module.exports = HidInc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
