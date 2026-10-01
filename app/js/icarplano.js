/* =====================================================================
 * icarplano.js — MOTOR DO PLANO DE IÇAMENTO (plano de rigging). Puro, Node-testável.
 *
 * Recebe as peças (com o peso do js/bimpeso.js e a geometria do viewer), o
 * equipamento (js/icarcatalogo.js ou informado) e a posição marcada no
 * projeto, e devolve, para cada içamento: raio, altura do gancho, capacidade
 * pela tabela do fabricante, composição da carga, utilização, classificação
 * (normal / crítico / reprovado), lingas e manilhas, pontos de içamento,
 * vento (NBR 6123) e tempo. A tela (gestao.js) só orquestra.
 *
 * REGRAS QUE NÃO CEDEM
 * ⚠ CARGA DE PESO DESCONHECIDO NÃO SE IÇA (NR-18 18.10.1.29). Uma peça sem
 *   peso no içamento = içamento BLOQUEADO, com o nome da peça. Nunca "0 kg".
 * ⚠ CAPACIDADE NUNCA INTERPOLADA PARA CIMA. Entre duas linhas da tabela vale
 *   o MENOR dos dois valores — a capacidade não é monótona perto do raio
 *   mínimo (LTM 1030, lança 14,4 m: 19,3 t a 3 m, 19,8 t a 3,5 m), então "a
 *   linha do raio maior" sozinha não é a favor da segurança.
 * ⚠ A TABELA INCLUI O MOITÃO E OS ACESSÓRIOS (nota dos fabricantes): o peso
 *   deles ENTRA na carga. Moitão não informado = pendência, não zero.
 * ⚠ FATOR DINÂMICO: nenhuma norma brasileira com valor confirmado (pesquisa
 *   de 01/10/2026) — é premissa do engenheiro, padrão 1,00 e dito assim.
 * ⚠ V0 DO VENTO É INFORMADO (só existe o mapa de isopletas da NBR 6123; o
 *   software não tem tabela por cidade — uma tabela "de capitais" seria
 *   número inventado). As faixas por capital só aparecem como aviso.
 * ⚠ GEOMETRIA DO GUINDASTE É ESTIMATIVA: altura do pé da lança e folga
 *   ponta-gancho são premissas editáveis; o plano manda conferir no
 *   diagrama de alcance do fabricante.
 *
 * Coordenadas: metros, do modelo (x, y em planta; z para cima).
 * Fontes das normas: PLANO-ICAMENTO.md (levantamento de 01/10/2026).
 * ===================================================================== */
(function (global) {
  "use strict";

  var G = 9.80665;           // m/s² — kg ↔ N
  var CRITICO_UTIL = 0.80;   // Ultracargo ULC/0430 v11 (norma de empresa): crítico acima de 80 % da tabela
  var CRITICO_KG = 10000;    // ULC/0430 e Supergasbras PR-QSMS-31: crítico acima de 10 t
  var ANG_MAX_VERT = 60;     // cintas (NBR 15637-1, via fabricantes): perna a mais de 60° da vertical = proibido

  /* ---------------- premissas (todas editáveis; o relatório imprime as adotadas) ---------------- */
  var PREMISSAS = {
    contingenciaPct: 10,       // ULC/0430: 5 % a 10 % — adotado o teto da faixa
    fatorDinamico: 1.0,        // sem valor normativo confirmado
    folgaGancho_m: 1.0,        // folga entre o fundo da peça içada e o obstáculo/ponto de assentamento
    alturaPeLanca_m: 2.5,      // GUINDASTE: altura do pino do pé da lança acima do apoio (estimativa)
    pontaGancho_m: 3.0,        // GUINDASTE: da ponta da lança ao gancho (moitão + folga do limitador) (estimativa)
    anguloLinga_graus: 30,     // ângulo-alvo da perna com a vertical (≤ 45° = fator 1,4 da cinta)
    Ca: 2.0,                   // coeficiente de arrasto da carga: placa plana alongada, a favor da segurança — ajuste pela forma
    isolamentoFolga_m: 2.0,    // área isolada = raio + metade da maior dimensão da carga + esta folga (premissa; a NR-18 manda isolar, não dá número)
    tempo: { amarrar_min: 10, vIcar_m_min: 6, giro_rpm: 0.5, posicionar_min: 15, soltar_min: 5 }
  };

  /* FS dos acessórios — a capacidade marcada (CMT) já vem dividida por eles; o
     plano imprime a ruptura mínima que o certificado tem de mostrar. */
  var FS = {
    cabo: { fs: 5, fonte: "NR-18, Anexo II, item 3 (obrigação legal)" },
    cinta: { fs: 7, fonte: "NBR 15637-1/-2, segundo os fabricantes (Tecnotextil, Okubo)" },
    corrente: { fs: 4, fonte: "corrente grau 8 — NBR 15516-1 / EN 818, segundo os fabricantes" },
    manilha: { fs: 6, fonte: "NBR 13545, segundo o fabricante (Okubo)" }
  };
  /* fator de uso da amarração (cintas, NBR 15637-1 via fabricantes) */
  var MODO_AMARRACAO = {
    direto: { f: 1.0, rotulo: "direta (olhal no ponto)" },
    enforcado: { f: 0.8, rotulo: "enforcada (choker)" },
    cesto: { f: 2.0, rotulo: "em cesto (basket)" }
  };

  /* NBR 6123 — S2 = b·Fr·(z/10)^p (tabela igual em 1988 e 2023) */
  var S2_TAB = {
    I: { zg: 250, A: [1.10, 0.06], B: [1.11, 0.065], C: [1.12, 0.07] },
    II: { zg: 300, A: [1.00, 0.085], B: [1.00, 0.09], C: [1.00, 0.10] },
    III: { zg: 350, A: [0.94, 0.10], B: [0.94, 0.105], C: [0.93, 0.115] },
    IV: { zg: 420, A: [0.86, 0.12], B: [0.85, 0.125], C: [0.84, 0.135] },
    V: { zg: 500, A: [0.74, 0.15], B: [0.73, 0.16], C: [0.71, 0.175] }
  };
  var FR = { A: 1.00, B: 0.98, C: 0.95 };
  var S3_TAB = {
    "2023": { 1: 1.11, 2: 1.06, 3: 1.00, 4: 0.95, 5: 0.83 },
    "1988": { 1: 1.10, 2: 1.00, 3: 0.95, 4: 0.88, 5: 0.83 }
  };
  var S3_ROTULO = {
    1: "Grupo 1 — ruína prejudica o socorro (hospitais, bombeiros)",
    2: "Grupo 2 — aglomeração de pessoas",
    3: "Grupo 3 — residências, hotéis, comércio, indústria",
    4: "Grupo 4 — sem ocupação humana (depósitos, silos)",
    5: "Grupo 5 — temporárias / estruturas em construção (até 2 anos)"
  };
  /* faixas do mapa (NBR 10821 / isopletas da NBR 6123, leitura visual — catálogo Hydro Inova p. B-02).
     ⚠ Só AVISO: o V0 do cálculo é o que o engenheiro lê no mapa da norma pela coordenada da obra. */
  var V0_FAIXAS_CAPITAIS = {
    "Porto Alegre": "45–50 (borda com 40–45); valor pontual citado: 45 m/s", "Florianópolis": "40–45", "Curitiba": "40–45",
    "Campo Grande": "40–45 (perto da borda com 35–40)", "São Paulo": "35–40", "Rio de Janeiro": "30–35 ou 35–40 (borda — ambíguo)",
    "Boa Vista": "35–40", "Belo Horizonte": "30–35", "Vitória": "30–35 (borda)", "Brasília": "30–35 (borda com ≤ 30)", "Goiânia": "30–35",
    "Cuiabá": "30–35", "Manaus": "30–35; valor pontual citado: 33 m/s", "Belém": "30–35", "São Luís": "≤ 30 ou 30–35 (ambíguo)",
    "Fortaleza": "≤ 30 ou 30–35 (ambíguo)", "Macapá": "≤ 30", "Rio Branco": "≤ 30", "Porto Velho": "≤ 30", "Palmas": "≤ 30", "Teresina": "≤ 30",
    "Natal": "≤ 30", "João Pessoa": "≤ 30", "Recife": "≤ 30", "Maceió": "≤ 30", "Aracaju": "≤ 30", "Salvador": "≤ 30"
  };

  function num(v) { var n = +v; return isFinite(n) ? n : null; }
  function r2(v, c) { var f = Math.pow(10, c == null ? 2 : c); return Math.round(v * f) / f; }
  /* número para frase: vírgula decimal, ponto de milhar, sem "-0" (a frase vai para o plano impresso) */
  function br(v, c) {
    c = c == null ? 2 : c;
    var x = +v; if (!isFinite(x)) return "—";
    var f = Math.pow(10, c), r = Math.round(x * f) / f; // -0 < 0 é falso: o arredondado a zero nunca leva sinal
    var t = Math.abs(r).toFixed(c).split("."), ip = t[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    var s = ip + (t[1] && /[1-9]/.test(t[1]) ? "," + t[1].replace(/0+$/, "") : "");
    return (r < 0 ? "-" : "") + s;
  }
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function prem(p) {
    var o = {}, k;
    for (k in PREMISSAS) if (Object.prototype.hasOwnProperty.call(PREMISSAS, k)) o[k] = PREMISSAS[k];
    o.tempo = {}; for (k in PREMISSAS.tempo) o.tempo[k] = PREMISSAS.tempo[k];
    if (p) for (k in p) if (Object.prototype.hasOwnProperty.call(p, k) && p[k] != null && k !== "tempo") o[k] = p[k];
    if (p && p.tempo) for (k in p.tempo) if (p.tempo[k] != null) o.tempo[k] = p.tempo[k];
    return o;
  }

  /* ======================= CAPACIDADE PELA TABELA ======================= */
  /* as duas linhas que cercam o raio: [baixo, alto]; null = fora da tabela */
  function cercar(raios, R) {
    var lo = -1, hi = -1;
    for (var i = 0; i < raios.length; i++) {
      if (raios[i] <= R + 1e-9) lo = i;
      if (hi < 0 && raios[i] >= R - 1e-9) hi = i;
    }
    return { lo: lo, hi: hi };
  }

  /* guindaste telescópico: a melhor lança que alcança o raio E a altura do gancho */
  function capGuindaste(eq, R, H, p) {
    p = prem(p);
    var t = eq.tabela, fator = t.unidade === "t" ? 1000 : 1, raios = t.linhas.map(function (l) { return l[0]; });
    var out = { tipo: "guindaste", ok: false, cap_kg: null, raio: R, raioTab: null, lanca: null, alturaGancho: null, motivo: "", tentativas: [], avisos: [] };
    if (!(R >= 0)) { out.motivo = "raio indefinido — marque a posição do equipamento"; return out; }
    var c = cercar(raios, R);
    if (c.lo < 0) { out.motivo = "raio de " + br(R, 2) + " m menor que o mínimo da tabela (" + br(raios[0], 2) + " m): afaste o equipamento da peça"; return out; }
    if (c.hi < 0) { out.motivo = "raio de " + br(R, 2) + " m maior que o máximo da tabela (" + br(raios[raios.length - 1], 2) + " m)"; return out; }
    var melhor = null, cond = t.condicional || null, condAtiva = !!(cond && p.condicoes && p.condicoes[cond.id]), puladas = 0;
    var ehCond = function (raio, j) { var l = cond && cond.celulas[raio]; return !!(l && l.indexOf(j) >= 0); };
    for (var j = 0; j < t.lancas.length; j++) {
      var a = t.linhas[c.lo][1][j], b = t.linhas[c.hi][1][j], L = t.lancas[j];
      if (a == null || b == null) continue;           // a lança não trabalha neste raio
      /* ⚠ célula que só vale numa montagem especial (LTM 1090: contrapeso a 4,71 m) — sem a confirmação no plano, não conta */
      if (cond && !condAtiva && (ehCond(raios[c.lo], j) || ehCond(raios[c.hi], j))) { puladas++; continue; }
      var cap = Math.min(a, b) * fator;
      var Rcalc = raios[c.hi];                        // geometria no raio maior das duas linhas (a lança mais deitada)
      if (L <= Rcalc) continue;
      var ponta = p.alturaPeLanca_m + Math.sqrt(L * L - Rcalc * Rcalc), gancho = ponta - p.pontaGancho_m;
      var alcanca = !(H > 0) || gancho >= H - 1e-9;
      out.tentativas.push({ lanca: L, cap_kg: cap, alturaGancho: r2(gancho, 2), alcanca: alcanca });
      if (alcanca && (!melhor || cap > melhor.cap)) melhor = { cap: cap, L: L, gancho: gancho, ponta: ponta };
    }
    if (puladas) out.avisos.push(puladas + " lança(s) não consideradas neste raio: a capacidade delas só vale com " + cond.rotulo + " — confirme no plano se o equipamento vier montado assim.");
    if (condAtiva) out.avisos.push("Considerada a montagem com " + cond.rotulo + " (confirmada no plano).");
    if (!melhor) {
      out.motivo = out.tentativas.length ? "nenhuma lança alcança a altura do gancho de " + br(H, 2) + " m neste raio (estimativa geométrica)"
        : puladas ? "neste raio a tabela só tem capacidade com " + cond.rotulo + " (não confirmado no plano)" : "a tabela não tem capacidade neste raio";
      return out;
    }
    out.ok = true; out.cap_kg = melhor.cap; out.lanca = melhor.L; out.alturaGancho = r2(melhor.gancho, 2); out.alturaPonta = r2(melhor.ponta, 2);
    out.raioTab = c.lo === c.hi ? raios[c.lo] : [raios[c.lo], raios[c.hi]];
    out.avisos.push("Altura do gancho estimada pela geometria da lança (pé a " + br(p.alturaPeLanca_m, 2) + " m, " + br(p.pontaGancho_m, 2) + " m da ponta ao gancho): confira no diagrama de alcance do fabricante.");
    return out;
  }

  /* munck: raio → kg; altura só pelo máximo declarado */
  function capMunck(eq, R, H) {
    var pts = eq.tabela.pontos.slice().sort(function (a, b) { return a[0] - b[0]; }), raios = pts.map(function (x) { return x[0]; });
    var out = { tipo: "munck", ok: false, cap_kg: null, raio: R, raioTab: null, prolonga: false, motivo: "", avisos: [] };
    if (!(R >= 0)) { out.motivo = "raio indefinido — marque a posição do equipamento"; return out; }
    if (R > raios[raios.length - 1] + 1e-9) { out.motivo = "raio de " + br(R, 2) + " m maior que o alcance do gráfico (" + br(raios[raios.length - 1], 2) + " m)"; return out; }
    var c = cercar(raios, R), cap, pr;
    if (c.lo < 0) {
      cap = pts[0][1]; pr = !!pts[0][2]; out.raioTab = raios[0];
      out.avisos.push("Raio menor que o primeiro ponto do gráfico (" + br(raios[0], 2) + " m): adotada a capacidade desse ponto.");
    } else {
      cap = Math.min(pts[c.lo][1], pts[c.hi][1]); pr = !!(pts[c.hi][2] || pts[c.lo][2]);
      out.raioTab = c.lo === c.hi ? raios[c.lo] : [raios[c.lo], raios[c.hi]];
    }
    if (H > 0 && eq.altura_max_m != null && H > eq.altura_max_m + 1e-9) {
      out.motivo = "altura do gancho de " + br(H, 2) + " m acima da altura máxima do equipamento (" + br(eq.altura_max_m, 2) + " m)"; return out;
    }
    out.ok = true; out.cap_kg = cap; out.prolonga = pr;
    if (pr) out.avisos.push("Este raio usa prolonga manual: desconte o peso da prolonga (ficha do fabricante).");
    out.avisos.push(eq.altura_max_m != null ? "Altura × raio: confira no diagrama de alcance do fabricante (o catálogo guarda só a altura máxima, " + br(eq.altura_max_m, 2) + " m)."
      : "Altura máxima não declarada no catálogo: confira no diagrama de alcance do fabricante.");
    return out;
  }

  function capacidade(eq, R, H, p) {
    if (!eq || !eq.tabela) return { ok: false, motivo: "equipamento sem tabela de carga" };
    /* equipamento informado pelo engenheiro vem como pontos raio → kg da configuração montada (guindaste ou munck) */
    var r = (eq.tipo === "munck" || eq.tabela.pontos) ? capMunck(eq, R, H) : capGuindaste(eq, R, H, p);
    r.tipo = eq.tipo || r.tipo;
    if (r.ok && eq.tabela.status === "V") r.avisos.push("Tabela lida do gráfico em imagem (status V): confira cada número na placa de carga do equipamento.");
    r.avisos.push("Vale a tabela da PLACA DE CARGA do equipamento que chegar na obra (NR-18 18.10.1.25e) — esta é a do catálogo do fabricante (" + (eq.tabela.condicao || "") + ").");
    return r;
  }

  /* porte do equipamento (para ordenar do menor para o maior) */
  function porte(eq) {
    if (!eq || !eq.tabela) return Infinity;
    if (eq.tipo === "munck") return Math.max.apply(null, eq.tabela.pontos.map(function (x) { return x[1]; }));
    var f = eq.tabela.unidade === "t" ? 1000 : 1, m = 0;
    eq.tabela.linhas.forEach(function (l) { l[1].forEach(function (v) { if (v != null && v * f > m) m = v * f; }); });
    return m;
  }

  /* ======================= CARGA ======================= */
  /* pecas: [{uid, nome, kg, estimado, ok, motivo}] (do bimpeso)
     p: { contingenciaPct, fatorDinamico, acessorios:[{nome, kg, qtd}], moitao_kg (null = não informado) } */
  function carga(pecas, p) {
    p = prem(p);
    var o = { pecas_kg: 0, n: 0, semPeso: [], estimadas: [], contingencia_kg: 0, acessorios_kg: 0, moitao_kg: null, fatorDinamico: +p.fatorDinamico || 1,
      total_kg: null, total_kN: null, bloqueios: [], avisos: [], composicao: [] };
    (pecas || []).forEach(function (x) {
      if (!x) return;
      o.n++;
      if (!x.ok || !(x.kg > 0)) { o.semPeso.push({ uid: x.uid, nome: x.nome || x.uid, motivo: x.motivo || "sem peso" }); return; }
      o.pecas_kg += +x.kg;
      if (x.estimado) o.estimadas.push(x.nome || x.uid);
    });
    if (!o.n) o.bloqueios.push("Nenhuma peça neste içamento.");
    if (o.semPeso.length) o.bloqueios.push("Carga de peso desconhecido não se iça (NR-18 18.10.1.29): " + o.semPeso.length + " peça(s) sem peso — " +
      o.semPeso.slice(0, 5).map(function (s) { return s.nome; }).join(", ") + (o.semPeso.length > 5 ? "…" : "") + ".");
    if (o.estimadas.length) o.avisos.push(o.estimadas.length + " peça(s) com peso estimado pelo volume da malha — confira o peso real (romaneio/fabricante).");
    var cp = num(p.contingenciaPct); if (cp == null || cp < 0) cp = 0;
    if (cp < 5) o.avisos.push("Contingência de " + br(cp, 1) + " % abaixo da faixa de 5 % a 10 % (ULC/0430).");
    o.contingenciaPct = cp;
    o.contingencia_kg = o.pecas_kg * cp / 100;
    (p.acessorios || []).forEach(function (a) {
      var kg = num(a && a.kg), q = num(a && a.qtd); if (q == null) q = 1;
      if (kg != null && kg > 0) { o.acessorios_kg += kg * q; o.composicao.push({ rotulo: (a.nome || "acessório") + (q !== 1 ? " × " + q : ""), kg: kg * q }); }
    });
    var mo = num(p.moitao_kg);
    if (mo == null) o.bloqueios.push("Peso do moitão/gancho não informado (placa/manual do equipamento) — nas tabelas de guindaste ele faz parte da carga.");
    else o.moitao_kg = mo;
    if (o.fatorDinamico < 1) o.avisos.push("Fator dinâmico menor que 1 não faz sentido: adotado 1,00."), o.fatorDinamico = 1;
    var base = o.pecas_kg + o.contingencia_kg + o.acessorios_kg + (mo || 0);
    o.total_kg = base * o.fatorDinamico;
    o.total_kN = o.total_kg * G / 1000;
    o.composicao.unshift({ rotulo: "peças (" + (o.n - o.semPeso.length) + ")", kg: o.pecas_kg }, { rotulo: "contingência " + br(cp, 1) + " %", kg: o.contingencia_kg });
    o.composicao.push({ rotulo: "moitão / gancho", kg: mo == null ? null : mo });
    if (o.fatorDinamico !== 1) o.composicao.push({ rotulo: "fator dinâmico × " + br(o.fatorDinamico, 2), kg: o.total_kg - base });
    return o;
  }

  /* ======================= GEOMETRIA: CG, PONTOS, LINGAS ======================= */
  /* geos: [{min:{x,y,z}, max:{x,y,z}, cg?:{x,y,z}, kg}] das peças do içamento → caixa e CG ponderado pelo peso */
  function geometria(geos) {
    var mn = { x: Infinity, y: Infinity, z: Infinity }, mx = { x: -Infinity, y: -Infinity, z: -Infinity }, sw = 0, cg = { x: 0, y: 0, z: 0 }, n = 0;
    (geos || []).forEach(function (g) {
      if (!g || !g.min || !g.max) return;
      n++;
      ["x", "y", "z"].forEach(function (k) { if (g.min[k] < mn[k]) mn[k] = g.min[k]; if (g.max[k] > mx[k]) mx[k] = g.max[k]; });
      var c = g.cg || { x: (g.min.x + g.max.x) / 2, y: (g.min.y + g.max.y) / 2, z: (g.min.z + g.max.z) / 2 }, w = g.kg > 0 ? g.kg : 1;
      cg.x += c.x * w; cg.y += c.y * w; cg.z += c.z * w; sw += w;
    });
    if (!n) return null;
    cg.x /= sw; cg.y /= sw; cg.z /= sw;
    return { min: mn, max: mx, cg: cg, dx: mx.x - mn.x, dy: mx.y - mn.y, dz: mx.z - mn.z };
  }

  /* pontos de içamento no topo da carga. "1": um ponto acima do CG (pilar em pé,
     peça compacta). "2": dois pontos no eixo maior a 0,207·L das pontas — onde o
     momento negativo nos balanços iguala o positivo no vão (viga/estaca/painel
     deitado de seção constante). "4": 0,207 nas duas direções. */
  function pontosIcamento(geo, modo) {
    if (!geo) return [];
    var z = geo.max.z, c = geo.cg, k = 0.207;
    if (modo === "2") {
      if (geo.dx >= geo.dy) return [{ x: geo.min.x + k * geo.dx, y: c.y, z: z }, { x: geo.max.x - k * geo.dx, y: c.y, z: z }];
      return [{ x: c.x, y: geo.min.y + k * geo.dy, z: z }, { x: c.x, y: geo.max.y - k * geo.dy, z: z }];
    }
    if (modo === "4") {
      var x1 = geo.min.x + k * geo.dx, x2 = geo.max.x - k * geo.dx, y1 = geo.min.y + k * geo.dy, y2 = geo.max.y - k * geo.dy;
      return [{ x: x1, y: y1, z: z }, { x: x2, y: y1, z: z }, { x: x2, y: y2, z: z }, { x: x1, y: y2, z: z }];
    }
    return [{ x: c.x, y: c.y, z: z }];
  }

  /* tração nas pernas com o gancho na vertical do CG.
     2 pernas: equilíbrio exato no plano (T1·senα1 = T2·senα2; T1·cosα1 + T2·cosα2 = W).
     4 pernas (hiperestático): carga rígida apoia em 2 — a pior diagonal leva tudo.
     ⚠ A perna a mais de 60° da vertical é proibida (fator de uso das cintas). */
  function lingas(geo, pontos, carga_kg, p) {
    p = p || {};
    var alvo = num(p.anguloAlvo) || PREMISSAS.anguloLinga_graus;
    var o = { pernas: pontos.length, ok: true, alturaLingas: 0, gancho: null, pernasDet: [], tracaoMax_kg: 0, anguloMax: 0, bloqueios: [], avisos: [] };
    if (!geo || !pontos.length) { o.ok = false; o.bloqueios.push("Sem geometria da carga."); return o; }
    var gx = geo.cg.x, gy = geo.cg.y, dmax = 0;
    pontos.forEach(function (pt) { var d = dist2(pt, { x: gx, y: gy }); if (d > dmax) dmax = d; });
    var h = num(p.alturaLingas_m);
    if (!(h > 0)) h = dmax > 1e-6 ? dmax / Math.tan(alvo * Math.PI / 180) : 1.0;
    o.alturaLingas = r2(h, 3);
    var hook = { x: gx, y: gy, z: geo.max.z + h };
    o.gancho = hook;
    var angs = pontos.map(function (pt) { var dh = dist2(pt, hook), dv = hook.z - pt.z; return Math.atan2(dh, dv); });
    function par(i, j) {
      var a1 = angs[i], a2 = angs[j], s = Math.sin(a1 + a2);
      if (s < 1e-9) return [carga_kg / 2 / Math.cos(a1), carga_kg / 2 / Math.cos(a2)];
      return [carga_kg * Math.sin(a2) / s, carga_kg * Math.sin(a1) / s];
    }
    var T = pontos.map(function () { return 0; });
    if (pontos.length === 1) T[0] = carga_kg;
    else if (pontos.length === 2) T = par(0, 1);
    else if (pontos.length === 4) {
      var d1 = par(0, 2), d2 = par(1, 3);
      T = [Math.max(d1[0], 0), Math.max(d2[0], 0), Math.max(d1[1], 0), Math.max(d2[1], 0)];
      o.avisos.push("Linga de 4 pernas em carga rígida: considerado que só 2 pernas (uma diagonal) carregam.");
    } else {
      var ef = Math.min(2, pontos.length);
      T = angs.map(function (a) { return carga_kg / ef / Math.cos(a); });
    }
    pontos.forEach(function (pt, i) {
      var g = angs[i] * 180 / Math.PI, comp = Math.sqrt(Math.pow(dist2(pt, hook), 2) + Math.pow(hook.z - pt.z, 2));
      o.pernasDet.push({ ponto: pt, anguloVert: r2(g, 1), comprimento: r2(comp, 2), tracao_kg: r2(T[i], 1) });
      if (T[i] > o.tracaoMax_kg) o.tracaoMax_kg = T[i];
      if (g > o.anguloMax) o.anguloMax = g;
    });
    o.anguloMax = r2(o.anguloMax, 1);
    if (o.anguloMax > ANG_MAX_VERT + 1e-9) { o.ok = false; o.bloqueios.push("Perna a " + br(o.anguloMax, 1) + "° da vertical: acima de 60° é proibido — lingas mais compridas ou balancim."); }
    else if (o.anguloMax > 45 + 1e-9) o.avisos.push("Perna entre 45° e 60° da vertical: fator de uso da cinta cai de 1,4 para 1,0.");
    return o;
  }

  /* acessório: a CMT marcada (por perna) × fator do modo de amarração ≥ tração */
  function conferirAcessorio(tipo, cmt_kg, tracao_kg, modo) {
    var fs = FS[tipo] || null, md = MODO_AMARRACAO[modo || "direto"] || MODO_AMARRACAO.direto;
    var o = { tipo: tipo, fs: fs ? fs.fs : null, fonteFs: fs ? fs.fonte : "", cmt_kg: num(cmt_kg), modo: md.rotulo, fatorModo: md.f, tracao_kg: r2(tracao_kg, 1), ok: false, motivo: "" };
    o.rupturaMin_kg = fs ? r2(tracao_kg * fs.fs, 0) : null;
    if (!(o.cmt_kg > 0)) { o.motivo = "CMT não informada (está na etiqueta/plaqueta do acessório)"; return o; }
    o.cmtEfetiva_kg = r2(o.cmt_kg * (tipo === "cinta" ? md.f : 1), 1);
    o.util = tracao_kg / o.cmtEfetiva_kg;
    o.ok = o.util <= 1 + 1e-9;
    if (!o.ok) o.motivo = "tração de " + br(tracao_kg, 0) + " kg acima da CMT efetiva de " + br(o.cmtEfetiva_kg, 0) + " kg";
    return o;
  }

  /* ======================= VENTO — NBR 6123 ======================= */
  function classeVento(maiorDim) { return maiorDim > 50 ? "C" : maiorDim > 20 ? "B" : "A"; }
  function S2(cat, classe, z) {
    var c = S2_TAB[cat]; if (!c) return null;
    var bp = c[classe]; if (!bp) return null;
    var zz = Math.min(Math.max(z, 0), c.zg);
    return bp[0] * FR[classe] * Math.pow(zz / 10, bp[1]);
  }
  function S3(grupo, edicao) { var t = S3_TAB[String(edicao || "2023")] || S3_TAB["2023"]; return t[grupo] != null ? t[grupo] : null; }

  /* p: { V0, S1, cat, grupo, edicao, z (altura da carga, m), area (m², maior face), Ca, carga_kg,
          vLim (limite de operação do fabricante, m/s, no gancho/ponta), vPrev10 (rajada prevista a 10 m, m/s), maiorDim } */
  function vento(p) {
    p = p || {};
    var o = { ok: true, bloqueios: [], avisos: [], memoria: [] };
    var cat = p.cat || "III", classe = p.classe || classeVento(num(p.maiorDim) || 0), z = Math.max(num(p.z) || 0, 10);
    // ⚠ abaixo de 10 m adota-se o vento a 10 m: S2 menor que o de referência reduziria o vento previsto (contra a segurança)
    o.cat = cat; o.classe = classe; o.z = r2(z, 2);
    o.s2 = S2(cat, classe, z); o.s2_10 = S2(cat, classe, 10);
    o.Ca = num(p.Ca) || PREMISSAS.Ca;
    o.area = num(p.area) || 0;
    var W = (num(p.carga_kg) || 0) * G;
    /* rajada de projeto do local (V0·S1·S2·S3) — referência de clima, não condição de operação */
    if (num(p.V0) > 0) {
      o.V0 = +p.V0; o.S1 = num(p.S1) || 1.0; o.grupo = +p.grupo || 5; o.edicao = String(p.edicao || "2023"); o.S3 = S3(o.grupo, o.edicao);
      o.Vk = o.V0 * o.S1 * o.s2 * o.S3; o.q = 0.613 * o.Vk * o.Vk; o.Fk_N = o.q * o.Ca * o.area;
      o.memoria.push("Vk = V0·S1·S2·S3 = " + br(o.V0, 1) + " × " + br(o.S1, 2) + " × " + br(o.s2, 3) + " × " + br(o.S3, 2) + " = " + br(o.Vk, 2) + " m/s (NBR 6123:" + o.edicao + ")");
      o.memoria.push("q = 0,613·Vk² = " + br(o.q, 0) + " N/m²; força de projeto na carga = q·Ca·A = " + br(o.q, 0) + " × " + br(o.Ca, 2) + " × " + br(o.area, 2) + " = " + br(o.Fk_N / 1000, 2) + " kN");
    } else o.avisos.push("V0 não informado: leia no mapa de isopletas da NBR 6123 pela coordenada da obra (o software não tem tabela por cidade).");
    /* operação: vento previsto a 10 m levado à altura da carga pelo mesmo perfil S2 */
    var vLim = num(p.vLim);
    if (!(vLim > 0)) { o.ok = false; o.bloqueios.push("Limite de vento de operação do fabricante não informado (manual/tabela do equipamento)."); }
    else {
      o.vLim = vLim; o.qLim = 0.613 * vLim * vLim; o.FLim_N = o.qLim * o.Ca * o.area;
      o.anguloLim = W > 0 ? Math.atan(o.FLim_N / W) * 180 / Math.PI : null;
      o.memoria.push("No limite de " + br(vLim, 1) + " m/s: q = " + br(o.qLim, 1) + " N/m², força lateral na carga = " + br(o.FLim_N, 0) + " N" +
        (o.anguloLim != null ? " (desvio do cabo ≈ " + br(o.anguloLim, 1) + "°)" : ""));
    }
    if (num(p.vPrev10) > 0 && o.s2 && o.s2_10) {
      o.vPrev10 = +p.vPrev10; o.vPrevZ = o.vPrev10 * o.s2 / o.s2_10;
      o.memoria.push("Previsto: " + br(o.vPrev10, 1) + " m/s a 10 m → " + br(o.vPrevZ, 1) + " m/s a " + br(z, 1) + " m (S2(z)/S2(10), categoria " + cat + ", classe " + classe + ")");
      if (vLim > 0 && o.vPrevZ > vLim + 1e-9) { o.ok = false; o.bloqueios.push("Vento previsto na altura da carga (" + br(o.vPrevZ, 1) + " m/s) acima do limite do fabricante (" + br(vLim, 1) + " m/s): não içar."); }
    }
    if (W > 0 && o.area > 0) {
      o.areaPorT = o.area / (W / G / 1000);
      o.avisos.push("Área exposta de " + br(o.areaPorT, 2) + " m² por tonelada: o limite de vento da tabela pressupõe uma área de referência — carga leve e grande (painel, vidro) pode exigir limite menor (manual do equipamento).");
    }
    o.avisos.push("Vento medido no anemômetro do equipamento antes e durante o içamento manda sobre qualquer previsão.");
    return o;
  }

  /* ======================= TEMPO ======================= */
  /* sobe, gira, posiciona, solta, volta. p: {altura_m, giro_graus, tempo:{...}} */
  function tempo(p) {
    p = p || {};
    var t = prem({ tempo: p.tempo }).tempo, H = Math.max(num(p.altura_m) || 0, 0), giro = Math.abs(num(p.giro_graus) || 0) % 360;
    if (giro > 180) giro = 360 - giro;
    var subir = t.vIcar_m_min > 0 ? H / t.vIcar_m_min : 0, girar = t.giro_rpm > 0 ? (giro / 360) / t.giro_rpm : 0;
    var etapas = [
      { rotulo: "amarrar e içamento de teste", min: t.amarrar_min },
      { rotulo: "subir " + br(H, 1) + " m", min: subir },
      { rotulo: "girar " + br(giro, 0) + "°", min: girar },
      { rotulo: "posicionar e fixar", min: t.posicionar_min },
      { rotulo: "soltar a carga", min: t.soltar_min },
      { rotulo: "voltar o gancho", min: subir + girar }
    ];
    var total = 0; etapas.forEach(function (e) { e.min = r2(e.min, 1); total += e.min; });
    return { etapas: etapas, total_min: r2(total, 1), premissas: t };
  }

  /* ======================= AVALIAÇÃO DE UM IÇAMENTO ======================= */
  /* ic: { pecas:[{uid,nome,kg,ok,estimado,motivo}], geos:[...], pos:{x,y,z}, coleta:{x,y,z}|null, modo:"1"|"2"|"4",
           premissas, acessorios, moitao_kg, lingas:{tipo,cmt_kg,modo,anguloAlvo,alturaLingas_m}, manilha_cmt_kg,
           flags:{redeEletrica, doisEquipamentos, geometriaComplexa, sobreLinhas}, vento:{...} }
     eq: equipamento (catálogo ou informado) */
  function avaliar(ic, eq) {
    var p = prem(ic && ic.premissas);
    var o = { status: "pendente", bloqueios: [], avisos: [], criticoPor: [] };
    var c = carga(ic.pecas, { contingenciaPct: p.contingenciaPct, fatorDinamico: p.fatorDinamico, acessorios: ic.acessorios,
      moitao_kg: ic.moitao_kg != null ? ic.moitao_kg : (eq && eq.moitao_kg != null ? eq.moitao_kg : null) });
    o.carga = c; o.bloqueios = o.bloqueios.concat(c.bloqueios); o.avisos = o.avisos.concat(c.avisos);
    var geo = geometria(ic.geos); o.geo = geo;
    var pts = pontosIcamento(geo, ic.modo || "1"); o.pontos = pts;
    var L = lingas(geo, pts, c.total_kg || 0, ic.lingas || {}); o.lingas = L;
    o.bloqueios = o.bloqueios.concat(L.bloqueios); o.avisos = o.avisos.concat(L.avisos);
    /* posição → raio e altura */
    if (!ic.pos || !geo) o.bloqueios.push(!geo ? "Sem geometria das peças." : "Marque no projeto a posição do equipamento (centro de giro).");
    else {
      o.raioDestino = dist2(ic.pos, geo.cg);
      /* sem coleta marcada: a carroceria do munck / o lado oposto do guindaste — e o plano diz que é suposição */
      if (!ic.coleta && eq) {
        var ctmp = {}; for (var kc in ic) ctmp[kc] = ic[kc];
        ctmp.coleta = coletaPadrao(eq, ic.pos, ic.rumo != null ? ic.rumo : rumoPadrao(ic.pos, geo.cg), geo);
        o.coletaPadrao = ctmp.coleta;
        o.avisos.push("Coleta não marcada: adotada " + (eq.tipo === "munck" ? "a carroceria do caminhão" : "o lado oposto do guindaste") + " — marque onde a peça estará (carreta, pátio) para o plano real.");
        ic = ctmp;
      }
      o.raioColeta = ic.coleta ? dist2(ic.pos, ic.coleta) : null;
      o.raio = Math.max(o.raioDestino, o.raioColeta || 0);
      var zFundoNoDestino = geo.min.z, alturaCarga = geo.dz;
      /* o gancho tem de passar a carga por cima do ponto de assentamento: fundo + folga + altura da carga + lingas */
      o.alturaGancho = (zFundoNoDestino - (ic.pos.z || 0)) + p.folgaGancho_m + alturaCarga + (L.alturaLingas || 0);
      o.giro = ic.coleta ? Math.abs(angulo(ic.pos, ic.coleta) - angulo(ic.pos, geo.cg)) * 180 / Math.PI : 0;
      if (o.giro > 180) o.giro = 360 - o.giro;
      o.isolamento = o.raio + Math.max(geo.dx, geo.dy) / 2 + p.isolamentoFolga_m;
    }
    if (!eq) o.bloqueios.push("Escolha o equipamento.");
    else if (o.raio != null) {
      var cap = capacidade(eq, o.raio, o.alturaGancho, p); o.cap = cap;
      o.avisos = o.avisos.concat(cap.avisos || []);
      if (!cap.ok) o.bloqueios.push("Equipamento não atende: " + cap.motivo + ".");
      else if (c.total_kg != null) {
        o.util = c.total_kg / cap.cap_kg;
        if (o.util > 1 + 1e-9) o.reprovado = "carga de " + br(c.total_kg, 0) + " kg acima da capacidade de " + br(cap.cap_kg, 0) + " kg (" + br(o.util * 100, 1) + " %)";
        else if (o.util > CRITICO_UTIL) o.criticoPor.push("utilização de " + br(o.util * 100, 1) + " % da tabela (> 80 %)");
      }
    }
    if (c.total_kg > CRITICO_KG) o.criticoPor.push("carga acima de 10 t");
    var f = ic.flags || {};
    if (f.redeEletrica) o.criticoPor.push("perto de rede elétrica");
    if (f.doisEquipamentos) o.criticoPor.push("dois ou mais equipamentos");
    if (f.geometriaComplexa) o.criticoPor.push("geometria complexa");
    if (f.sobreLinhas) o.criticoPor.push("sobre linhas ou equipamentos em operação");
    /* acessórios */
    var lg = ic.lingas || {};
    o.acLinga = conferirAcessorio(lg.tipo || "cinta", lg.cmt_kg, L.tracaoMax_kg, lg.modo);
    o.acManilha = conferirAcessorio("manilha", ic.manilha_cmt_kg, L.tracaoMax_kg);
    if (!o.acLinga.ok) o.bloqueios.push("Linga: " + o.acLinga.motivo + ".");
    if (!o.acManilha.ok && (ic.manilha_cmt_kg != null || pts.length > 1)) o.bloqueios.push("Manilha: " + o.acManilha.motivo + ".");
    /* vento */
    if (ic.vento) {
      var vw = {}; for (var k in ic.vento) vw[k] = ic.vento[k];
      if (geo) {
        if (vw.z == null) vw.z = o.alturaGancho != null ? o.alturaGancho : geo.max.z + (L.alturaLingas || 0);
        if (vw.area == null) vw.area = Math.max(geo.dx * geo.dy, geo.dx * geo.dz, geo.dy * geo.dz);
        if (vw.maiorDim == null) vw.maiorDim = Math.max(geo.dx, geo.dy, geo.dz);
      }
      if (vw.carga_kg == null) vw.carga_kg = c.total_kg;
      if (vw.vLim == null && eq && eq.vento_ms) vw.vLim = eq.vento_ms;
      o.vento = vento(vw);
      o.bloqueios = o.bloqueios.concat(o.vento.bloqueios);
    } else o.bloqueios.push("Vento não verificado.");
    o.tempo = tempo({ altura_m: o.alturaGancho || 0, giro_graus: o.giro || 0, tempo: p.tempo });
    o.premissas = p;
    o.status = o.reprovado ? "reprovado" : o.bloqueios.length ? "pendente" : o.criticoPor.length ? "critico" : "aprovado";
    return o;
  }
  /* "TKA 12.700" e não "TKA TKA 12.700" */
  function nomeEq(eq) {
    if (!eq) return "";
    var f = String(eq.fabricante || ""), m = String(eq.modelo || "");
    return f && m.toLowerCase().indexOf(f.toLowerCase()) === 0 ? m : (f ? f + " " : "") + m;
  }
  function angulo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

  /* os equipamentos do catálogo que atendem, do menor para o maior.
     ⚠ Ordena pelo PORTE (capacidade máxima), não pela utilização: o "melhor" é
       o menor que atende com folga — o que chega na obra, cabe no acesso e custa menos. */
  function melhores(catalogo, carga_kg, R, H, p) {
    var out = [];
    (catalogo || []).forEach(function (eq) {
      var cap = capacidade(eq, R, H, p);
      if (!cap.ok) return;
      /* o moitão do próprio equipamento quando o catálogo traz; senão o informado no içamento (mesma carga do cartão) */
      var moP = p && p.moitaoPadrao_kg != null ? +p.moitaoPadrao_kg : null;
      var mo = eq.moitao_kg != null ? eq.moitao_kg : (moP != null ? moP : 0), tot = carga_kg + mo, u = tot / cap.cap_kg;
      if (u > 1 + 1e-9) return;
      out.push({ eq: eq, cap: cap, util: u, critico: u > CRITICO_UTIL, moitaoConhecido: eq.moitao_kg != null || moP != null, porte: porte(eq) });
    });
    out.sort(function (a, b) { return (a.critico - b.critico) || (a.porte - b.porte) || (a.util - b.util); });
    return out;
  }

  /* ======================= DOCUMENTOS E LIBERAÇÃO (NR-18) ======================= */
  var DOCUMENTOS = [
    { id: "plano-assinado", rotulo: "Plano de cargas assinado por profissional legalmente habilitado (no PGR)", ref: "NR-18 18.10.1.16", obrig: true },
    { id: "art", rotulo: "ART do plano de içamento", ref: "Lei 6.496/1977 (CONFEA) — a NR-18 exige o profissional habilitado", obrig: false },
    { id: "ar-pt", rotulo: "Análise de risco (e permissão de trabalho, se o içamento não for rotineiro)", ref: "NR-18 18.10.1.18 / 18.10.1.19", obrig: true },
    { id: "manutencao", rotulo: "Registros de manutenção e inspeção do equipamento (plano de manutenção)", ref: "NR-18 18.10.1.23; NR-12 12.11", obrig: true },
    { id: "entrega-tecnica", rotulo: "Termo de entrega técnica do equipamento", ref: "NR-18 18.10.1.23; NR-12 12.11", obrig: true },
    { id: "laudo", rotulo: "Laudo / inspeção do equipamento", ref: "NR-18 18.10.1.23", obrig: true },
    { id: "operador", rotulo: "Capacitação do operador (guindaste: 120 h, NR-18 Anexo I)", ref: "NR-18 18.10.1.23 / Anexo I", obrig: true },
    { id: "sinaleiro", rotulo: "Capacitação do sinaleiro/amarrador (16 h, reciclagem a cada 2 anos)", ref: "NR-18 18.10.1.23 / Anexo I", obrig: true },
    { id: "cnh", rotulo: "CNH do motorista compatível com o veículo", ref: "CTB", obrig: false },
    { id: "acessorios", rotulo: "Certificados dos acessórios (lingas, cintas, manilhas) com marcação indelével", ref: "NR-18 18.10.1.27", obrig: true },
    { id: "aterramento", rotulo: "Laudo de aterramento (semestral)", ref: "NR-18 18.10.1.23", obrig: false },
    { id: "tabela-cabine", rotulo: "Tabela de cargas em português na cabine", ref: "NR-18 18.10.1.25e", obrig: true }
  ];
  var CONFERENCIAS = [
    { id: "isolamento", rotulo: "Área de operação isolada; ninguém sob a carga", ref: "NR-18 18.10.1.17e / 18.10.1.29" },
    { id: "solo", rotulo: "Solo e apoio das patolas conferidos (estabilidade da máquina e do solo)", ref: "NR-18 18.10.1.20" },
    { id: "nivel", rotulo: "Equipamento nivelado, patolas totalmente estendidas como na tabela usada", ref: "fabricante" },
    { id: "inclinado", rotulo: "Sem içamento inclinado nem arrasto; carga totalmente desprendida", ref: "NR-18 18.10.1.29" },
    { id: "fibra", rotulo: "Sem cordas de fibra natural", ref: "NR-18 18.10.1.29" },
    { id: "clima", rotulo: "Clima adequado (vento no anemômetro abaixo do limite, sem chuva forte/raios)", ref: "NR-18 18.10.1.29" },
    { id: "dispositivos", rotulo: "Limitadores de carga/momento, anemômetro e trava do gancho funcionando", ref: "NR-18 18.10.1.24 / 18.10.1.26" },
    { id: "sinaleiro-presente", rotulo: "Sinaleiro presente quando o operador não vê a carga", ref: "NR-18 18.10.1.30" },
    { id: "interferencias", rotulo: "Interferências (rede elétrica, outros equipamentos) identificadas no croqui", ref: "NR-18 18.10.1.17d / 18.10.1.22" }
  ];

  /* liberação do plano: tudo verificado e documentos obrigatórios OK — ou a PORTA:
     liberar com pendência, registrando quem, quando e por quê (toda trava precisa de porta). */
  function liberacao(plano, avaliacoes) {
    var docs = (plano && plano.docs) || {}, conf = (plano && plano.conf) || {};
    var falta = [];
    DOCUMENTOS.forEach(function (d) { var s = docs[d.id] && docs[d.id].status; if (d.obrig && s !== "ok" && s !== "na") falta.push(d.rotulo); });
    CONFERENCIAS.forEach(function (d) { var s = conf[d.id]; if (s !== "ok" && s !== "na") falta.push(d.rotulo); });
    var porIc = [];
    (avaliacoes || []).forEach(function (a, i) { if (a && (a.status === "pendente" || a.status === "reprovado")) porIc.push((i + 1) + "º içamento: " + (a.reprovado || a.bloqueios[0] || a.status)); });
    var reprovado = (avaliacoes || []).some(function (a) { return a && a.status === "reprovado"; });
    var porta = plano && plano.liberacaoPorta;
    return { liberado: !reprovado && !falta.length && !porIc.length, comPorta: !reprovado && !!(porta && porta.quem && porta.motivo) && (falta.length + porIc.length > 0),
      reprovado: reprovado, faltaDocs: falta, pendIcamentos: porIc, porta: porta || null };
  }

  /* passo a passo de um içamento (o texto que vai para o plano e para a obra) */
  function passoAPasso(ic, a, eq) {
    var s = [], nm = eq ? nomeEq(eq) : "equipamento";
    s.push("Isolar a área de operação (raio de giro do equipamento e projeção da carga) e conferir que ninguém fica sob a carga.");
    if (ic.pos) s.push("Posicionar o " + nm + " com o centro de giro em X " + br(ic.pos.x, 2) + " / Y " + br(ic.pos.y, 2) + "; patolas totalmente estendidas sobre placas de apoio, equipamento nivelado.");
    s.push("Conferir o vento no anemômetro" + (a.vento && a.vento.vLim ? " (limite " + br(a.vento.vLim, 1) + " m/s)" : "") + " e os limitadores de carga/momento.");
    s.push("Inspecionar lingas e manilhas (etiqueta legível, sem dano) — " + (a.lingas ? a.lingas.pernas : 1) + " perna(s)" + (a.lingas && a.lingas.alturaLingas ? ", ~" + br(a.lingas.alturaLingas, 2) + " m de altura do gancho ao topo da carga" : "") + ".");
    if (a.pontos && a.pontos.length) s.push("Amarrar nos pontos " + a.pontos.map(function (p, i) { return "P" + (i + 1) + " (" + br(p.x, 2) + "; " + br(p.y, 2) + ")"; }).join(", ") + "; gancho na vertical do centro de gravidade.");
    s.push("Içar poucos centímetros e parar: conferir estabilidade do equipamento, nivelamento da carga e amarração.");
    if (a.raio != null) s.push("Subir até " + br(a.alturaGancho, 2) + " m de gancho" + (a.giro ? ", girar " + br(a.giro, 0) + "°" : "") + " e levar a carga ao raio de " + br(a.raio, 2) + " m com movimentos suaves, guiada por cabo-guia.");
    s.push("Assentar, fixar provisoriamente (escora/travamento) e só então aliviar e soltar as lingas.");
    s.push("Recolher o gancho e liberar a área.");
    return s;
  }

  /* ======================= CROQUI EM PLANTA (o mesmo desenho no PDF, no DXF e no IFC) ======================= */
  /* o caminhão no chão, no MESMO arranjo do 3D (bim.js icDesenhar): munck com o giro logo atrás da cabine e
     patolas no giro e na traseira; guindaste com o giro no meio da base das patolas.
     ⚠ ILUSTRATIVO no tamanho do caminhão; patolas e alcance vêm do catálogo. */
  function layoutEquip(eq, pos, rumoGraus) {
    eq = eq || {};
    var ehMunck = eq.tipo === "munck", dim = eq.dim_m || [], comp = +dim[0] || (ehMunck ? 8.5 : 12), larg = +dim[1] || 2.5;
    var pat = eq.patolas_m || [], pLat = Math.max(+pat[pat.length - 1] || larg + 2, larg), pLong = ehMunck ? null : (+pat[0] || comp * 0.55);
    var a = (+rumoGraus || 0) * Math.PI / 180, ax = { x: Math.cos(a), y: Math.sin(a) }, lt = { x: -Math.sin(a), y: Math.cos(a) };
    function P(al, sd) { return { x: pos.x + ax.x * al + lt.x * sd, y: pos.y + ax.y * al + lt.y * sd }; }
    function ret(a0, a1, s0, s1) { return [P(a0, s0), P(a1, s0), P(a1, s1), P(a0, s1)]; }
    var o = { ehMunck: ehMunck, comp: comp, larg: larg, retangulos: [], sapatas: [] };
    if (ehMunck) {
      o.retangulos.push({ rotulo: "caminhão", pts: ret(-comp + 2.6, 2.8, -larg / 2, larg / 2) }, { rotulo: "cabine", pts: ret(0.7, 2.8, -larg / 2, larg / 2) });
      [0.15, -comp + 2.9].forEach(function (al) { o.sapatas.push(P(al, -pLat / 2), P(al, pLat / 2)); });
    } else {
      o.retangulos.push({ rotulo: "guindaste", pts: ret(-comp / 2, comp / 2, -larg / 2, larg / 2) }, { rotulo: "cabine", pts: ret(comp / 2 - 2.3, comp / 2 - 0.1, -larg / 2, larg / 2) });
      [-pLong / 2, pLong / 2].forEach(function (al) { o.sapatas.push(P(al, -pLat / 2), P(al, pLat / 2)); });
    }
    o.patolasLat = pLat; o.patolasLong = pLong;
    return o;
  }
  /* rumo padrão: o caminhão de lado para a carga (eixo perpendicular ao raio) */
  function rumoPadrao(pos, cg) { return pos && cg ? (Math.atan2(cg.y - pos.y, cg.x - pos.x) * 180 / Math.PI + 90) : 0; }
  /* onde a peça está antes de subir, quando ninguém marcou: no munck, a carroceria (2,6 m atrás
     do giro, 1,35 m acima do chão); no guindaste, o lado oposto ao destino, no chão */
  function coletaPadrao(eq, pos, rumoGraus, geo) {
    if (!pos) return null;
    if (eq && eq.tipo === "munck") {
      var a = (+rumoGraus || 0) * Math.PI / 180;
      return { x: pos.x - Math.cos(a) * 2.6, y: pos.y - Math.sin(a) * 2.6, z: (+pos.z || 0) + 1.35 };
    }
    var cg = geo && geo.cg ? geo.cg : { x: pos.x + 1, y: pos.y }, dx = pos.x - cg.x, dy = pos.y - cg.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var r = Math.min(d, Math.max(0.8 * d, 4));
    return { x: pos.x + dx / d * r, y: pos.y + dy / d * r, z: +pos.z || 0 };
  }
  /* 1 ponto para peça em pé (pilar), 4 para placa/painel deitado, 2 para viga/estaca/perfil */
  function modoSugerido(geo) {
    if (!geo) return "2";
    var h = Math.max(geo.dx, geo.dy), m = Math.min(geo.dx, geo.dy);
    if (geo.dz >= h * 0.9) return "1";
    if (m >= 1.0 && h / m < 4) return "4";
    return "2";
  }

  /* entidades do croqui (motor, planta): {tipo:'linha'|'circulo'|'texto', ..., camada} */
  function croqui(itens) {
    var E = [];
    function L(a, b, c) { E.push({ tipo: "linha", a: a, b: b, camada: c }); }
    function poly(pts, c) { for (var i = 0; i < pts.length; i++) L(pts[i], pts[(i + 1) % pts.length], c); }
    function T(p, txt, h, c) { E.push({ tipo: "texto", p: p, txt: txt, h: h || 0.25, camada: c || "TEXTO" }); }
    (itens || []).forEach(function (it, idx) {
      var a = it.aval, eq = it.eq, pos = it.pos; if (!a || !pos) return;
      var lay = layoutEquip(eq, pos, it.rumo != null ? it.rumo : rumoPadrao(pos, a.geo && a.geo.cg));
      if (idx === 0 || !it.mesmaPosicao) {
        lay.retangulos.forEach(function (r) { poly(r.pts, "EQUIPAMENTO"); });
        lay.sapatas.forEach(function (s) { poly([{ x: s.x - 0.35, y: s.y - 0.35 }, { x: s.x + 0.35, y: s.y - 0.35 }, { x: s.x + 0.35, y: s.y + 0.35 }, { x: s.x - 0.35, y: s.y + 0.35 }], "PATOLAS"); });
        L({ x: pos.x - 0.6, y: pos.y }, { x: pos.x + 0.6, y: pos.y }, "EQUIPAMENTO"); L({ x: pos.x, y: pos.y - 0.6 }, { x: pos.x, y: pos.y + 0.6 }, "EQUIPAMENTO");
        T({ x: pos.x + 0.4, y: pos.y + 0.4 }, "CENTRO DE GIRO X " + br(pos.x, 2) + " Y " + br(pos.y, 2), 0.22);
        if (eq && (eq.alcance_max_m || eq.raio_max_m)) E.push({ tipo: "circulo", c: pos, r: eq.alcance_max_m || eq.raio_max_m, camada: "ALCANCE" });
      }
      if (a.raio > 0) E.push({ tipo: "circulo", c: pos, r: a.raio, camada: "RAIO" });
      if (a.isolamento > 0) E.push({ tipo: "circulo", c: pos, r: a.isolamento, camada: "ISOLAMENTO" });
      if (a.geo) {
        var g = a.geo;
        poly([{ x: g.min.x, y: g.min.y }, { x: g.max.x, y: g.min.y }, { x: g.max.x, y: g.max.y }, { x: g.min.x, y: g.max.y }], "PECAS");
        L(pos, { x: g.cg.x, y: g.cg.y }, "RAIO");
        T({ x: (pos.x + g.cg.x) / 2, y: (pos.y + g.cg.y) / 2 + 0.25 }, "R=" + br(a.raio, 2) + "m", 0.25, "RAIO");
        T({ x: g.max.x + 0.2, y: g.max.y + 0.2 }, (idx + 1) + " - " + (it.nome || "icamento") + " (" + br(a.carga && a.carga.total_kg || 0, 0) + " kg)", 0.25);
        (a.pontos || []).forEach(function (p, i) { E.push({ tipo: "circulo", c: { x: p.x, y: p.y }, r: 0.08, camada: "LINGAS" }); T({ x: p.x + 0.1, y: p.y - 0.3 }, "P" + (i + 1), 0.18, "LINGAS"); });
        E.push({ tipo: "circulo", c: { x: g.cg.x, y: g.cg.y }, r: 0.12, camada: "PECAS" });
      }
      var colt = it.coleta || (a && a.coletaPadrao);
      if (colt) { E.push({ tipo: "circulo", c: colt, r: 0.3, camada: "COLETA" }); T({ x: colt.x + 0.35, y: colt.y }, "COLETA " + (idx + 1) + (it.coleta ? "" : " (suposta)"), 0.2, "COLETA"); }
    });
    return E;
  }
  function semAcento(s) {
    var t = String(s == null ? "" : s);
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return t.replace(/[^\x20-\x7e]/g, "?");
  }
  /* DXF R12 ASCII (abre em qualquer CAD; o DWG sai salvando este arquivo no CAD) */
  var CORES_DXF = { EQUIPAMENTO: 2, PATOLAS: 30, RAIO: 30, ALCANCE: 8, ISOLAMENTO: 1, PECAS: 4, LINGAS: 3, COLETA: 5, TEXTO: 7 };
  function dxf(ents) {
    var o = [], camadas = {};
    function p(c, v) { o.push(String(c), String(v)); }
    function f(v) { return (Math.round(v * 10000) / 10000).toFixed(4); }
    (ents || []).forEach(function (e) { camadas[e.camada || "0"] = 1; });
    p(0, "SECTION"); p(2, "HEADER"); p(9, "$ACADVER"); p(1, "AC1009"); p(9, "$INSUNITS"); p(70, 6); p(0, "ENDSEC");
    p(0, "SECTION"); p(2, "TABLES"); p(0, "TABLE"); p(2, "LAYER"); p(70, Object.keys(camadas).length);
    Object.keys(camadas).forEach(function (c) { p(0, "LAYER"); p(2, c); p(70, 0); p(62, CORES_DXF[c] || 7); p(6, "CONTINUOUS"); });
    p(0, "ENDTAB"); p(0, "ENDSEC");
    p(0, "SECTION"); p(2, "ENTITIES");
    (ents || []).forEach(function (e) {
      var c = e.camada || "0";
      if (e.tipo === "linha") { p(0, "LINE"); p(8, c); p(10, f(e.a.x)); p(20, f(e.a.y)); p(30, "0.0"); p(11, f(e.b.x)); p(21, f(e.b.y)); p(31, "0.0"); }
      else if (e.tipo === "circulo") { p(0, "CIRCLE"); p(8, c); p(10, f(e.c.x)); p(20, f(e.c.y)); p(30, "0.0"); p(40, f(e.r)); }
      else if (e.tipo === "texto") { p(0, "TEXT"); p(8, c); p(10, f(e.p.x)); p(20, f(e.p.y)); p(30, "0.0"); p(40, f(e.h || 0.25)); p(1, semAcento(e.txt)); }
    });
    p(0, "ENDSEC"); p(0, "EOF");
    return o.join("\r\n") + "\r\n";
  }
  /* SVG do croqui (o PDF do plano): enquadra tudo, norte (y do modelo) para cima */
  var CORES_SVG = { EQUIPAMENTO: "#b45309", PATOLAS: "#ca8a04", RAIO: "#f97316", ALCANCE: "#94a3b8", ISOLAMENTO: "#ef4444", PECAS: "#0369a1", LINGAS: "#16a34a", COLETA: "#2563eb", TEXTO: "#111827" };
  function svgCroqui(ents, larg, alt) {
    larg = larg || 700; alt = alt || 520;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function inc(x, y) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    (ents || []).forEach(function (e) {
      if (e.tipo === "linha") { inc(e.a.x, e.a.y); inc(e.b.x, e.b.y); }
      else if (e.tipo === "circulo") { inc(e.c.x - e.r, e.c.y - e.r); inc(e.c.x + e.r, e.c.y + e.r); }
      else if (e.tipo === "texto") inc(e.p.x, e.p.y);
    });
    if (!isFinite(x0)) return "";
    var m = 24, esc = Math.min((larg - 2 * m) / Math.max(x1 - x0, 1), (alt - 2 * m) / Math.max(y1 - y0, 1));
    function X(x) { return (m + (x - x0) * esc).toFixed(1); }
    function Y(y) { return (alt - m - (y - y0) * esc).toFixed(1); }
    function h(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + larg + '" height="' + alt + '" viewBox="0 0 ' + larg + " " + alt + '" style="background:#fff;border:1px solid #cbd5e1">';
    (ents || []).forEach(function (e) {
      var cor = CORES_SVG[e.camada] || "#111", tr = (e.camada === "RAIO" || e.camada === "ALCANCE" || e.camada === "ISOLAMENTO") ? ' stroke-dasharray="6 4"' : "";
      if (e.tipo === "linha") s += '<line x1="' + X(e.a.x) + '" y1="' + Y(e.a.y) + '" x2="' + X(e.b.x) + '" y2="' + Y(e.b.y) + '" stroke="' + cor + '" stroke-width="1.3"' + tr + "/>";
      else if (e.tipo === "circulo") s += '<circle cx="' + X(e.c.x) + '" cy="' + Y(e.c.y) + '" r="' + Math.max(1.5, e.r * esc).toFixed(1) + '" fill="none" stroke="' + cor + '" stroke-width="1.3"' + tr + "/>";
      else if (e.tipo === "texto") s += '<text x="' + X(e.p.x) + '" y="' + Y(e.p.y) + '" font-size="' + Math.max(9, Math.min(13, (e.h || 0.25) * esc * 0.9)).toFixed(1) + '" font-family="Arial" fill="' + cor + '">' + h(e.txt) + "</text>";
    });
    /* escala gráfica e norte */
    var passo = [1, 2, 5, 10, 20, 50].filter(function (v) { return v * esc <= larg * 0.3; }).pop() || 1;
    s += '<g font-family="Arial" font-size="10" fill="#111"><line x1="' + m + '" y1="' + (alt - 8) + '" x2="' + (m + passo * esc).toFixed(1) + '" y2="' + (alt - 8) + '" stroke="#111" stroke-width="2"/><text x="' + (m + passo * esc + 6).toFixed(1) + '" y="' + (alt - 5) + '">' + passo + " m</text>" +
      '<text x="' + (larg - 30) + '" y="20">N ↑</text></g></svg>';
    return s;
  }

  /* ======================= IFC DO PLANO (equipamento, sapatas, área isolada e raio) ======================= */
  var B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  function ifcTxt(s) {
    var o = "", t = String(s == null ? "" : s);
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c === 39) o += "''"; else if (c === 92) o += "\\\\"; else if (c >= 32 && c < 127) o += t[i];
      else { var hx = c.toString(16).toUpperCase(); while (hx.length < 4) hx = "0" + hx; o += "\\X2\\" + hx + "\\X0\\"; }
    }
    return "'" + o + "'";
  }
  function ifcNum(v) { var s = String(Math.round((+v || 0) * 100000) / 100000); return s.indexOf(".") < 0 && s.indexOf("e") < 0 ? s + "." : s; }
  /* itens: [{ nome, eq, pos, rumo, aval }]; meta: { projeto, semente } */
  function ifc(itens, meta) {
    meta = meta || {};
    var linhas = [], id = 0, sem = 0;
    var seed = String(meta.semente || "orcapro-icamento");
    for (var q = 0; q < seed.length; q++) sem = (sem * 31 + seed.charCodeAt(q)) >>> 0;
    function guid() { var g = ""; for (var k = 0; k < 22; k++) { sem = (sem * 1103515245 + 12345) >>> 0; g += B64[(sem >>> 8) % (k === 0 ? 4 : 64)]; } return "'" + g + "'"; }
    function E(txt) { id++; linhas.push("#" + id + "=" + txt + ";"); return "#" + id; }
    function pt(x, y, z) { return E("IFCCARTESIANPOINT((" + ifcNum(x) + "," + ifcNum(y) + "," + ifcNum(z) + "))"); }
    function dir(x, y, z) { return E("IFCDIRECTION((" + ifcNum(x) + "," + ifcNum(y) + "," + ifcNum(z) + "))"); }
    var pessoa = E("IFCPERSON($,$,'',$,$,$,$,$)"), org = E("IFCORGANIZATION($,'OrcaPRO',$,$,$)"), po = E("IFCPERSONANDORGANIZATION(" + pessoa + "," + org + ",$)");
    var app = E("IFCAPPLICATION(" + org + ",'1','OrcaPRO','OrcaPRO')"), oh = E("IFCOWNERHISTORY(" + po + "," + app + ",$,.ADDED.,$,$,$,0)");
    var un = E("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), unM = E("IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)"), ua = E("IFCUNITASSIGNMENT((" + un + "," + unM + "))");
    var o0 = pt(0, 0, 0), ax0 = E("IFCAXIS2PLACEMENT3D(" + o0 + ",$,$)");
    var ctx = E("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05," + ax0 + ",$)");
    var body = E("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*," + ctx + ",$,.MODEL_VIEW.,$)");
    var proj = E("IFCPROJECT(" + guid() + "," + oh + "," + ifcTxt(meta.projeto || "Plano de içamento") + ",$,$,$,$,(" + ctx + ")," + ua + ")");
    var lpS = E("IFCLOCALPLACEMENT($," + ax0 + ")");
    var site = E("IFCSITE(" + guid() + "," + oh + ",'Canteiro',$,$," + lpS + ",$,$,.ELEMENT.,$,$,$,$,$)");
    E("IFCRELAGGREGATES(" + guid() + "," + oh + ",$,$," + proj + ",(" + site + "))");
    var estilos = {};
    function estilo(nome, r, g, b, tr) {
      if (estilos[nome]) return estilos[nome];
      var cor = E("IFCCOLOURRGB($," + ifcNum(r) + "," + ifcNum(g) + "," + ifcNum(b) + ")");
      var sh = E("IFCSURFACESTYLESHADING(" + cor + "," + ifcNum(tr || 0) + ")");
      return (estilos[nome] = E("IFCSURFACESTYLE(" + ifcTxt(nome) + ",.BOTH.,(" + sh + "))"));
    }
    /* caixa: centro da base (x,y,z), eixo do comprimento (ux,uy,uz), comprimento, largura, altura */
    function caixa(x, y, z, ux, uy, uz, comp, larg, alt, st) {
      var n = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= n; uy /= n; uz /= n;
      /* extrusão ao longo do eixo; a seção larg × alt no plano perpendicular */
      var ref = Math.abs(uz) < 0.9 ? [-uy, ux, 0] : [1, 0, 0], rn = Math.sqrt(ref[0] * ref[0] + ref[1] * ref[1] + ref[2] * ref[2]);
      var pl = E("IFCAXIS2PLACEMENT3D(" + pt(x, y, z) + "," + dir(ux, uy, uz) + "," + dir(ref[0] / rn, ref[1] / rn, ref[2] / rn) + ")");
      var pf = E("IFCRECTANGLEPROFILEDEF(.AREA.,$," + E("IFCAXIS2PLACEMENT2D(" + E("IFCCARTESIANPOINT((0.,0.))") + ",$)") + "," + ifcNum(larg) + "," + ifcNum(alt) + ")");
      var so = E("IFCEXTRUDEDAREASOLID(" + pf + "," + pl + "," + dir(0, 0, 1) + "," + ifcNum(comp) + ")");
      if (st) E("IFCSTYLEDITEM(" + so + ",(" + st + "),$)");
      return so;
    }
    function caixaVert(x, y, z0, rumoRad, comp, larg, alt, st) {
      /* caixa deitada no chão: perfil comp × larg (girado pelo rumo), extrudada para cima */
      var pl = E("IFCAXIS2PLACEMENT3D(" + pt(x, y, z0) + "," + dir(0, 0, 1) + "," + dir(Math.cos(rumoRad), Math.sin(rumoRad), 0) + ")");
      var pf = E("IFCRECTANGLEPROFILEDEF(.AREA.,$," + E("IFCAXIS2PLACEMENT2D(" + E("IFCCARTESIANPOINT((0.,0.))") + ",$)") + "," + ifcNum(comp) + "," + ifcNum(larg) + ")");
      var so = E("IFCEXTRUDEDAREASOLID(" + pf + "," + pl + "," + dir(0, 0, 1) + "," + ifcNum(alt) + ")");
      if (st) E("IFCSTYLEDITEM(" + so + ",(" + st + "),$)");
      return so;
    }
    function anel(x, y, z0, r, esp, st) {
      var pl = E("IFCAXIS2PLACEMENT3D(" + pt(x, y, z0) + ",$,$)");
      var pf = E("IFCCIRCLEHOLLOWPROFILEDEF(.AREA.,$," + E("IFCAXIS2PLACEMENT2D(" + E("IFCCARTESIANPOINT((0.,0.))") + ",$)") + "," + ifcNum(r) + "," + ifcNum(Math.min(esp, r * 0.5)) + ")");
      var so = E("IFCEXTRUDEDAREASOLID(" + pf + "," + pl + "," + dir(0, 0, 1) + ",0.02)");
      if (st) E("IFCSTYLEDITEM(" + so + ",(" + st + "),$)");
      return so;
    }
    function elemento(nome, itensRep, props, tipoObj) {
      var rep = E("IFCSHAPEREPRESENTATION(" + body + ",'Body','SweptSolid',(" + itensRep.join(",") + "))");
      var pds = E("IFCPRODUCTDEFINITIONSHAPE($,$,(" + rep + "))");
      var lp = E("IFCLOCALPLACEMENT(" + lpS + "," + ax0 + ")");
      var el = E("IFCBUILDINGELEMENTPROXY(" + guid() + "," + oh + "," + ifcTxt(nome) + ",$," + ifcTxt(tipoObj || "OrcaPRO_Icamento") + "," + lp + "," + pds + ",$,.NOTDEFINED.)");
      var ps = Object.keys(props || {}).map(function (k) {
        var v = props[k];
        var val = typeof v === "number" ? "IFCREAL(" + ifcNum(v) + ")" : "IFCLABEL(" + ifcTxt(v) + ")";
        return E("IFCPROPERTYSINGLEVALUE(" + ifcTxt(k) + ",$," + val + ",$)");
      });
      if (ps.length) { var pset = E("IFCPROPERTYSET(" + guid() + "," + oh + ",'OrcaPRO_Icamento',$,(" + ps.join(",") + "))"); E("IFCRELDEFINESBYPROPERTIES(" + guid() + "," + oh + ",$,$,(" + el + ")," + pset + ")"); }
      return el;
    }
    var stEq = estilo("Equipamento de içamento", 0.96, 0.62, 0.04), stCab = estilo("Cabine", 0.11, 0.3, 0.85), stPat = estilo("Patola", 0.79, 0.54, 0.02),
      stIso = estilo("Área isolada", 0.94, 0.27, 0.27, 0.3), stRaio = estilo("Raio de trabalho", 0.98, 0.45, 0.09, 0.2), stLg = estilo("Linga", 0.09, 0.64, 0.29);
    var els = [];
    (itens || []).forEach(function (it, idx) {
      var a = it.aval, eq = it.eq || {}, pos = it.pos; if (!a || !pos) return;
      var z0 = +pos.z || 0, rumo = it.rumo != null ? it.rumo : rumoPadrao(pos, a.geo && a.geo.cg), rr = rumo * Math.PI / 180;
      var lay = layoutEquip(eq, pos, rumo), reps = [];
      var cxEq = lay.ehMunck ? -lay.comp / 2 + 2.7 : 0;
      reps.push(caixaVert(pos.x + Math.cos(rr) * cxEq, pos.y + Math.sin(rr) * cxEq, z0 + 0.5, rr, lay.comp, lay.larg, 1.0, stEq));
      var cab = lay.ehMunck ? 1.75 : lay.comp / 2 - 1.2;
      reps.push(caixaVert(pos.x + Math.cos(rr) * cab, pos.y + Math.sin(rr) * cab, z0 + 1.5, rr, 2.1, lay.larg, 1.4, stCab));
      lay.sapatas.forEach(function (s) { reps.push(caixaVert(s.x, s.y, z0, rr, 0.7, 0.7, 0.1, stPat)); });
      /* lança: do pé até a ponta sobre o gancho */
      if (a.lingas && a.lingas.gancho) {
        var gk = a.lingas.gancho, pe = { x: pos.x, y: pos.y, z: z0 + (a.premissas ? a.premissas.alturaPeLanca_m : 2.5) };
        var ponta = { x: gk.x, y: gk.y, z: gk.z + (lay.ehMunck ? 1.2 : (a.premissas ? a.premissas.pontaGancho_m : 3)) };
        /* guindaste: a lança da coluna da tabela (a mesma conta do 3D) — a ponta pela geometria, o cabo desce ao gancho */
        var Lb = !lay.ehMunck && a.cap && a.cap.ok ? +a.cap.lanca : 0, dHz = Math.sqrt((gk.x - pe.x) * (gk.x - pe.x) + (gk.y - pe.y) * (gk.y - pe.y));
        if (Lb > dHz + 0.05) ponta.z = Math.max(pe.z + Math.sqrt(Lb * Lb - dHz * dHz), gk.z + 0.6);
        var ux = ponta.x - pe.x, uy = ponta.y - pe.y, uz = ponta.z - pe.z, L = Math.sqrt(ux * ux + uy * uy + uz * uz);
        reps.push(caixa(pe.x, pe.y, pe.z, ux, uy, uz, L, 0.45, 0.45, stEq));
        (a.pontos || []).forEach(function (p) {
          var vx = p.x - gk.x, vy = p.y - gk.y, vz = p.z - gk.z, Lg = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (Lg > 0.01) reps.push(caixa(gk.x, gk.y, gk.z, vx, vy, vz, Lg, 0.04, 0.04, stLg));
        });
      }
      var nm = (idx + 1) + " — " + (it.nome || "Içamento");
      els.push(elemento("Equipamento " + nm + " — " + nomeEq(eq), reps, {
        Equipamento: nomeEq(eq), Raio_m: r2(a.raio || 0, 3), AlturaGancho_m: r2(a.alturaGancho || 0, 3), Carga_kg: r2(a.carga && a.carga.total_kg || 0, 1),
        Capacidade_kg: r2(a.cap && a.cap.cap_kg || 0, 1), Utilizacao_pct: r2((a.util || 0) * 100, 2), Situacao: a.status || "", Tabela: (eq.tabela && eq.tabela.condicao) || ""
      }, "Equipamento de içamento"));
      if (a.isolamento > 0) els.push(elemento("Área isolada " + nm, [anel(pos.x, pos.y, z0, a.isolamento, 0.25, stIso)], { Raio_m: r2(a.isolamento, 3) }, "Área isolada"));
      if (a.raio > 0) els.push(elemento("Raio de trabalho " + nm, [anel(pos.x, pos.y, z0 + 0.01, a.raio, 0.12, stRaio)], { Raio_m: r2(a.raio, 3) }, "Raio de trabalho"));
    });
    if (els.length) E("IFCRELCONTAINEDINSPATIALSTRUCTURE(" + guid() + "," + oh + ",$,$,(" + els.join(",") + ")," + site + ")");
    var agora = meta.data || "2026-01-01T00:00:00";
    return "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\nFILE_NAME(" + ifcTxt(meta.arquivo || "plano-icamento.ifc") + ",'" + agora + "',(''),(''),'OrcaPRO','OrcaPRO','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n" +
      linhas.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
  }

  /* planilha de cargas (CSV com ; e vírgula decimal, como o resto do app) */
  function csvCargas(linhas) {
    function c(v) { var s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    function n(v, d) { return v == null || !isFinite(v) ? "" : (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace(".", ","); }
    var o = ["Içamento;Peça;Tipo;Peso (kg);Peso (kN);Origem do peso;Equipamento;Raio (m);Capacidade (kg);Carga total (kg);Utilização (%);Situação"];
    (linhas || []).forEach(function (l) {
      o.push([c(l.icamento), c(l.peca), c(l.tipo), n(l.kg, 1), n(l.kN, 3), c(l.origem), c(l.equipamento), n(l.raio, 2), n(l.cap, 0), n(l.total, 0), n(l.util, 1), c(l.situacao)].join(";"));
    });
    return "﻿" + o.join("\r\n") + "\r\n";
  }

  var IcarPlano = {
    G: G, CRITICO_UTIL: CRITICO_UTIL, CRITICO_KG: CRITICO_KG, ANG_MAX_VERT: ANG_MAX_VERT, PREMISSAS: PREMISSAS, FS: FS, MODO_AMARRACAO: MODO_AMARRACAO,
    S2_TAB: S2_TAB, FR: FR, S3_TAB: S3_TAB, S3_ROTULO: S3_ROTULO, V0_FAIXAS_CAPITAIS: V0_FAIXAS_CAPITAIS, DOCUMENTOS: DOCUMENTOS, CONFERENCIAS: CONFERENCIAS,
    prem: prem, cercar: cercar, capGuindaste: capGuindaste, capMunck: capMunck, capacidade: capacidade, porte: porte,
    carga: carga, geometria: geometria, pontosIcamento: pontosIcamento, lingas: lingas, conferirAcessorio: conferirAcessorio,
    classeVento: classeVento, S2: S2, S3: S3, vento: vento, tempo: tempo, avaliar: avaliar, melhores: melhores,
    liberacao: liberacao, passoAPasso: passoAPasso, nomeEq: nomeEq,
    layoutEquip: layoutEquip, rumoPadrao: rumoPadrao, coletaPadrao: coletaPadrao, modoSugerido: modoSugerido, croqui: croqui, dxf: dxf, svgCroqui: svgCroqui, ifc: ifc, ifcTxt: ifcTxt, csvCargas: csvCargas
  };
  global.IcarPlano = IcarPlano;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarPlano;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
