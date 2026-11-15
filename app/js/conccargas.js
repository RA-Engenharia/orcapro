/* =====================================================================
 * conccargas.js — CARGAS do modelo de concreto (fase C1, 14/11/2026). Motor PURO (ES5, Node-testável, sem DOM).
 * Entra o resultado de ConcModelo.montar() + o estado BIM (paredes, ambientes); sai uma lista de CASOS DE CARGA no formato do
 * AcoAnalise (js/acoanalise.js) e o resumo de totais (o que o teste de equilíbrio confere).
 *
 * CASOS
 *   PP    peso próprio — pilares e vigas (γ = 25 kN/m³ × seção bruta) e lajes (γ × h) levadas às vigas pelas charneiras do modelo;
 *   REV   revestimento/contrapiso de piso — γ 20 kN/m³ × espessura (6120 Tabela 4) sobre a área da laje, pelas mesmas charneiras;
 *   ALV   alvenaria SOBRE a viga — para cada parede do modelo cuja base está na cota da viga e cujo eixo cai sobre ela:
 *         altura × (espessura × γ do bloco + 2 faces × revestimento × 19 kN/m³) por metro de viga (6120 Tabelas 1 e 2);
 *   SC    sobrecarga por uso do ambiente (6120 Tabela 10, residencial) sobre a laje, pelas charneiras;
 *   W+X W-X W+Z W-Z   vento (6123: q = 0,613·Vk², Vk = V0·S1·S2·S3) — SÓ se o engenheiro informar V0, S1, S2, S3 e o coeficiente de
 *         forma; senão o vento fica com status "pendente" (nada é inventado).
 *
 * PREMISSAS (registradas no resultado e a levar ao memorial): vãos de porta/janela NÃO descontados na alvenaria (lado seguro);
 *   a espessura da parede do modelo é a do bloco (o revestimento entra à parte); parede sem viga sob ela não gera carga (aviso);
 *   paredes do térreo apoiadas em fundação/baldrame não carregam o pórtico (C9); vento aplicado por pavimento nos nós de topo de pilar,
 *   dividido em partes iguais (diafragma rígido da laje NÃO modelado); desaprumo global (11.3.3.4.1, Em1:2026 Fig. 11.1) como casos D+X D-X D+Z D-Z (ver o bloco DESAPRUMO).
 *
 * API  ConcCargas.gerar(modelo, estado, opc) → { ok, casos, totais, porNivel, forcasHorizontais, vento, avisos, pendencias, premissas }
 *   opc = { revestimentoPisoM, gammaAlvenaria, revestimentoParedeFaceM, sobrecargaPorLaje:{id:kN/m²}, sobrecargaPadrao,
 *           vento:{ V0, S1, S2 (número ou lista por pavimento, de baixo para cima), S3, Ce }, semRevestimentoLaje:[ids],
 *           lajesPorTabela: true (C3) → a fração da carga de cada laje que vai a cada borda vem das tabelas de Bares (ConcLaje.fracoesDoModelo)
 *                           no lugar das charneiras; laje que não é retângulo de 4 bordas ou cai em caso não tabelado FICA nas charneiras (com aviso) }
 *   ConcCargas.usoDoAmbiente(nome) → { chave, valor, status }
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function CD() { return dep("ConcDadosCalc", "./concdadoscalc.js"); }
  function CLaje() { return dep("ConcLaje", "./conclaje.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function cv(k, d) { var D = CD(); return D ? D.v(k, d) : d; }
  function nivKey(y) { return String(Math.round(y * 100)); }

  /* uso do ambiente pelo NOME → carga da 6120 Tabela 10 (residencial). Sem reconhecer: pendente (usa o valor de dormitório, marcado). */
  function usoDoAmbiente(nome) {
    var t = String(nome || "").toLowerCase();
    var tab = [
      [/escada/, "sobrecargaEscadaUnidadeKNm2"],
      [/varanda|sacada|balc|terra[cç]o/, "sobrecargaVarandaResidencialKNm2"],
      [/servi[cç]o|lavand|despensa|dep[oó]sito/, "sobrecargaServicoLavanderiaKNm2"],
      [/corredor|circula|hall|passagem/, "sobrecargaCorredorUnidadeKNm2"],
      [/banh|wc|sanit|lavabo/, "sobrecargaSanitarioKNm2"],
      [/sala|copa|cozinha|estar|jantar|gourmet|living/, "sobrecargaSalaCopaCozinhaKNm2"],
      [/dorm|quarto|su[ií]te|closet/, "sobrecargaDormitorioKNm2"]
    ];
    for (var i = 0; i < tab.length; i++) if (tab[i][0].test(t)) return { chave: tab[i][1], valor: cv(tab[i][1], null), status: "norma-lida" };
    return { chave: "sobrecargaDormitorioKNm2", valor: cv("sobrecargaDormitorioKNm2", null), status: "pendente" };
  }

  function gerar(m, estado, opc) {
    opc = opc || {};
    var avisos = [], pendencias = [], premissas = [], D = CD();
    if (!m || !m.ok) return { ok: false, motivo: "modelo inválido" };
    if (!D) return { ok: false, motivo: "js/concdadoscalc.js ausente" };
    var gC = cv("pesoConcretoArmado", 25), TOL = cv("tolGeometriaM", 0.06), TOLY = 0.08;
    var casos = { PP: [], REV: [], ALV: [], SC: [] }, totais = { PP: 0, REV: 0, ALV: 0, SC: 0 }, porNivel = {};
    function acum(caso, y, F) { totais[caso] += F; var k = nivKey(y), p = porNivel[k] || (porNivel[k] = { y: y, PP: 0, REV: 0, ALV: 0, SC: 0 }); p[caso] += F; }
    var nosId = {}; m.nos.forEach(function (n) { nosId[n.id] = n; });

    /* PP: pilares e vigas */
    m.barras.forEach(function (b) {
      if (b.tipo === "rigido") return;
      var q = gC * b.sec.A;
      casos.PP.push({ tipo: "barra", barra: b.id, q: [0, -q, 0], a: 0, b: 1 });
      acum("PP", Math.max(nosId[b.ni].y, nosId[b.nj].y), q * b.L);
    });

    /* lajes: PP, REV, SC pelas charneiras */
    var topoMax = -1e9; m.lajes.forEach(function (l) { if (l.topo > topoMax) topoMax = l.topo; });
    var revM = num(opc.revestimentoPisoM, cv("espessuraRevestimentoPisoM", 0.05)), qRev = cv("pesoRevestimentoPiso", 20) * revM;
    premissas.push("Revestimento de piso " + Math.round(revM * 100) + " cm × " + cv("pesoRevestimentoPiso", 20) + " kN/m³ = " + qRev.toFixed(2) + " kN/m² em todas as lajes (" + (opc.revestimentoPisoM != null ? "informado" : "decisão do produto: 5 cm, entre as duas espessuras da 6120 Tabela 4") + ").");
    var ambNome = {}; arr(estado && estado.ambientes).forEach(function (a) { ambNome[String(a.id)] = a.nome; });
    var usos = {}, ambDaLaje = {}; arr(estado && estado.caixas).forEach(function (c) { if (c && c.tipo === "laje" && c.conc) ambDaLaje[String(c.id)] = c.conc.ambiente; });
    /* C3: fração por borda pelas tabelas de Bares. O total de carga da laje NÃO muda (soma das frações antigas é preservada): muda só a distribuição entre as bordas. */
    var fracTab = {};
    if (opc.lajesPorTabela) {
      var CJ = CLaje();
      if (!CJ) { avisos.push("lajesPorTabela pedido, mas js/conclaje.js está ausente: charneiras mantidas."); }
      else m.lajes.forEach(function (l) {
        if (l.semApoio || !l.reacoes || !l.reacoes.length) return;
        var f = CJ.fracoesDoModelo(l, {});
        if (!f.ok) { avisos.push("Laje " + (l.marca || l.id) + " por charneiras: " + f.motivo + "."); return; }
        var somaBorda = {}, somaTudo = 0;
        l.reacoes.forEach(function (r) { somaBorda[r.borda] = (somaBorda[r.borda] || 0) + r.fracaoArea; somaTudo += r.fracaoArea; });
        /* bordas da tabela que o modelo não carrega (ex.: bordas curtas de laje em uma direção, que a C1 já trata como sem carga) devolvem a parte delas às bordas carregadas */
        var presentes = 0; Object.keys(somaBorda).forEach(function (k) { presentes += f.fracoes[k] || 0; });
        if (!(presentes > 0)) { avisos.push("Laje " + (l.marca || l.id) + " por charneiras: as bordas com viga não recebem reação pela tabela."); return; }
        var mapa = {}; l.reacoes.forEach(function (r, i) { mapa[i] = somaBorda[r.borda] > 0 ? f.fracoes[r.borda] / presentes * somaTudo * r.fracaoArea / somaBorda[r.borda] : r.fracaoArea; });
        fracTab[l.id] = mapa; premissas.push("Laje " + (l.marca || l.id) + ": reações pelas tabelas de Bares (" + f.tipo + "), não pelas charneiras.");
      });
    }
    function aplicarLaje(l, caso, qArea) {
      l.reacoes.forEach(function (r, ri) {
        var fr = fracTab[l.id] && fracTab[l.id][ri] != null ? fracTab[l.id][ri] : r.fracaoArea;
        var F = qArea * l.areaBruta * fr, len = r.sb - r.sa; if (!(len > 1e-6) || !(F > 0)) return;
        var qL = F / len, cob = 0;
        arr(m.trecho(r.viga, r.sa, r.sb)).forEach(function (t) {
          casos[caso].push({ tipo: "barra", barra: t.barra, q: [0, -qL, 0], a: t.a, b: t.b });
          var bb = null; m.barras.forEach(function (x) { if (x.id === t.barra) bb = x; });
          cob += qL * (t.b - t.a) * bb.L;
        });
        acum(caso, l.topo, cob);
        if (Math.abs(cob - F) > 0.01 * F + 1e-6) avisos.push("Laje " + (l.marca || l.id) + ": " + (100 * (1 - cob / F)).toFixed(1) + "% da reação em viga '" + r.viga + "' caiu fora das barras (" + caso + ").");
      });
    }
    m.lajes.forEach(function (l) {
      if (l.semApoio || !l.reacoes) return;
      aplicarLaje(l, "PP", gC * l.h);
      if (arr(opc.semRevestimentoLaje).indexOf(l.id) < 0) aplicarLaje(l, "REV", qRev);
      var q, st = "norma-lida", uso, ehCob = false;
      if (opc.sobrecargaPorLaje && opc.sobrecargaPorLaje[l.id] != null) { q = num(opc.sobrecargaPorLaje[l.id], 0); uso = "informada"; }
      else if (Math.abs(l.topo - topoMax) < TOLY && m.niveis.length > 1) { q = cv("sobrecargaCoberturaLajeKNm2", 1); uso = "cobertura (6120 T10, acesso só para manutenção)"; ehCob = true; }
      else {
        var amb = ambNome[String(ambDaLaje[l.id] || "")] || "";
        var u = usoDoAmbiente(amb); q = u.valor; st = u.status; uso = amb ? amb + " (" + u.chave + ")" : "ambiente não identificado";
        if (u.status === "pendente") pendencias.push("Laje " + (l.marca || l.id) + ": uso '" + (amb || "?") + "' não reconhecido — sobrecarga de " + q + " kN/m² (dormitório, 6120 T10) ASSUMIDA; o engenheiro informa o uso.");
      }
      usos[l.id] = { qKNm2: q, uso: uso, usoLaje: ehCob ? "cobertura" : "piso" };
      aplicarLaje(l, "SC", q);
    });
    m.lajes.forEach(function (l) { if (l.semApoio) pendencias.push("Laje " + (l.marca || l.id) + " sem borda apoiada em viga: peso, revestimento e sobrecarga NÃO transmitidos."); });

    /* ALV: paredes sobre vigas */
    var gB = num(opc.gammaAlvenaria, cv("pesoBlocoCeramicoVazadoParedesVazadas", 12)), eRev = num(opc.revestimentoParedeFaceM, cv("espessuraRevestimentoParedeFaceM", 0.02)), gArg = cv("pesoArgamassaCalCimentoAreia", 19);
    premissas.push("Alvenaria: γ do bloco " + gB + " kN/m³ (" + (opc.gammaAlvenaria != null ? "informado" : "bloco cerâmico vazado de paredes vazadas, 6120 T1 — ASSUMIDO") + "); revestimento " + Math.round(eRev * 100) + " cm por face × " + gArg + " kN/m³; vãos de porta/janela NÃO descontados (lado seguro); a espessura da parede do modelo é a do bloco.");
    var vigas = Object.keys(m.pecas.vigas).map(function (k) { return m.pecas.vigas[k]; }), paredes = arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede" && !c.faseDemolida && c.faseCriada !== "Existente" && !(c.material && /concreto|vidro/i.test(String(c.material))); });
    var semViga = [], termo = 0, alvLaje = {}, nAlvLaje = 0;
    /* ponto dentro do contorno da laje (ray casting, plano x-z) */
    function noPoli(P, x, z) { var dentro = false, i, j; for (i = 0, j = P.length - 1; i < P.length; j = i++) { if (((P[i].z > z) !== (P[j].z > z)) && (x < (P[j].x - P[i].x) * (z - P[i].z) / (P[j].z - P[i].z) + P[i].x)) dentro = !dentro; } return dentro; }
    paredes.forEach(function (w) {
      var r = num(w.rotY, 0), L = num(w.comprimento, 0), h = num(w.altura, 0), esp = num(w.espessura, 0.15), yb = num(w.cy, 0) - h / 2;
      var A = { x: num(w.cx, 0) - L / 2 * Math.cos(r), z: num(w.cz, 0) + L / 2 * Math.sin(r) }, B = { x: num(w.cx, 0) + L / 2 * Math.cos(r), z: num(w.cz, 0) - L / 2 * Math.sin(r) };
      var q = h * (esp * gB + 2 * eRev * gArg), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L, achou = false;
      vigas.forEach(function (v) {
        if (Math.abs(v.y - yb) > TOLY) return;
        var vx = v.B.x - v.A.x, vz = v.B.z - v.A.z, vl = Math.sqrt(vx * vx + vz * vz), vux = vx / vl, vuz = vz / vl;
        if (Math.abs(ux * vuz - uz * vux) > 0.05) return;
        var dperp = Math.abs((A.x - v.A.x) * (-vuz) + (A.z - v.A.z) * vux);
        if (dperp > Math.max(v.b, esp) / 2 + TOL) return;
        var s0 = (A.x - v.A.x) * vux + (A.z - v.A.z) * vuz, s1 = (B.x - v.A.x) * vux + (B.z - v.A.z) * vuz;
        var a = Math.max(0, Math.min(s0, s1)), b = Math.min(vl, Math.max(s0, s1)); if (b - a < 0.05) return;
        achou = true;
        arr(m.trecho(v.id, a, b)).forEach(function (t) {
          casos.ALV.push({ tipo: "barra", barra: t.barra, q: [0, -q, 0], a: t.a, b: t.b });
          var bb = null; m.barras.forEach(function (x) { if (x.id === t.barra) bb = x; });
          acum("ALV", v.y, q * (t.b - t.a) * bb.L);
        });
      });
      /* ⚠ alvenaria apoiada DIRETO na laje (revisão de cálculo 14/11/2026): sem viga sob ela, mas com a base na cota de uma laje, vira carga distribuída equivalente
       * (peso da parede dentro do contorno ÷ área da laje) para o dimensionamento da laje (usos[laje].gKNm2). Antes a carga ficava de fora e a laje era calculada só com 25·h + 1,0. */
      if (!achou && yb > m.ymin + TOLY) {
        var sobre = false;
        m.lajes.forEach(function (l) {
          if (l.semApoio || !(l.areaBruta > 0) || Math.abs(l.topo - yb) > TOLY) return;
          var nA = 24, dentro = 0, kA;
          for (kA = 0; kA < nA; kA++) { var tA = (kA + 0.5) / nA; if (noPoli(l.poli, A.x + (B.x - A.x) * tA, A.z + (B.z - A.z) * tA)) dentro++; }
          if (!dentro) return;
          alvLaje[l.id] = (alvLaje[l.id] || 0) + q * L * dentro / nA / l.areaBruta; sobre = true;
        });
        if (sobre) { achou = true; nAlvLaje++; }
      }
      if (!achou) { if (yb > m.ymin + TOLY) semViga.push(String(w.id)); else termo++; }
    });
    /* ⚠ a mesma alvenaria apoiada direto na laje TAMBÉM vai às vigas do pórtico (revisão de cálculo 14/11/2026, decisão 3): a carga distribuída equivalente (alvLaje) é levada às vigas de borda
     * pelas MESMAS frações da laje (áreas de influência/charneiras, ou as tabelas de Bares com lajesPorTabela), no caso ALV. Antes só a laje a via e as vigas do pórtico ficavam sem esse peso. */
    m.lajes.forEach(function (l) {
      if (!(alvLaje[l.id] > 0) || l.semApoio || !l.reacoes) return;
      aplicarLaje(l, "ALV", alvLaje[l.id]);
    });
    m.lajes.forEach(function (l) {
      if (!usos[l.id]) return;
      var rv = arr(opc.semRevestimentoLaje).indexOf(l.id) < 0 ? qRev : 0, alv = alvLaje[l.id] || 0;
      usos[l.id].gKNm2 = gC * l.h + rv + alv; usos[l.id].gAlvKNm2 = alv;
    });
    if (nAlvLaje) pendencias.push(nAlvLaje + " parede(s) apoiada(s) direto na laje: o peso entra como carga distribuída equivalente no dimensionamento da laje (C3); a reação dessa carga vai às vigas de borda do pórtico (C1) pelas mesmas frações da laje (caso ALV), como carga distribuída equivalente sobre toda a laje (não na posição da parede).");
    if (semViga.length) avisos.push("Parede(s) sem viga sob elas (carga NÃO lançada — sobre laje ou sem apoio no modelo): " + semViga.join(", ") + ".");
    if (termo) premissas.push(termo + " parede(s) do pavimento mais baixo apoiam na fundação/baldrame (fora do pórtico; fase C9).");

    /* VENTO */
    var vento = { status: "pendente", motivo: [] }, forcasH = [];
    var V = opc.vento || {};
    ["V0", "S1", "S3", "Ce"].forEach(function (k) { if (!(num(V[k], 0) > 0)) vento.motivo.push(k + " não informado"); });
    var nNiv = m.niveis.length, S2 = V.S2;
    if (S2 == null || (Array.isArray(S2) ? S2.length < nNiv : !(num(S2, 0) > 0))) vento.motivo.push("S2 não informado (número ou lista por pavimento)");
    var casosVento = {};
    if (!vento.motivo.length) {
      vento.status = "informado"; vento.V0 = V.V0; vento.S1 = V.S1; vento.S3 = V.S3; vento.Ce = V.Ce; vento.porNivel = [];
      var xs = [], zs = []; Object.keys(m.pecas.pilares).forEach(function (k) { var p = m.pecas.pilares[k]; xs.push(p.cx); zs.push(p.cz); });
      var Bx = Math.max.apply(null, xs) - Math.min.apply(null, xs), Bz = Math.max.apply(null, zs) - Math.min.apply(null, zs);
      var ys = [m.ymin].concat(m.niveis.map(function (n) { return n.y; }));
      m.niveis.forEach(function (n, k) {
        var h = (ys[k + 1] - ys[k]) / 2 + (k + 1 < m.niveis.length ? (ys[k + 2] - ys[k + 1]) / 2 : 0);
        var s2 = Array.isArray(S2) ? num(S2[k], 0) : num(S2, 0), Vk = V.V0 * V.S1 * s2 * V.S3, q = cv("ventoPressaoDinamicaCoef", 0.613) * Vk * Vk / 1000;
        vento.porNivel.push({ y: n.y, S2: s2, Vk: Vk, qKNm2: q, hTrib: h });
        [["W+X", [1, 0, 0], Bz], ["W-X", [-1, 0, 0], Bz], ["W+Z", [0, 0, 1], Bx], ["W-Z", [0, 0, -1], Bx]].forEach(function (d) {
          var F = q * V.Ce * d[2] * h, c = casosVento[d[0]] || (casosVento[d[0]] = []);
          n.nos.forEach(function (nid) { c.push({ tipo: "no", no: nid, F: [d[1][0] * F / n.nos.length, 0, d[1][2] * F / n.nos.length, 0, 0, 0] }); });
          forcasH.push({ caso: d[0], y: n.y, F: F, dir: d[1] });
        });
      });
      premissas.push("Vento (6123): força por pavimento = q·Ce·largura·altura de influência, nos nós de topo dos pilares em partes iguais; diafragma rígido não modelado.");
    } else {
      pendencias.push("Vento (NBR 6123) PENDENTE: " + vento.motivo.join("; ") + ". Combinações com vento não são geradas.");
    }
    /* DESAPRUMO GLOBAL (6118:2023 11.3.3.4.1 + Figura 11.1 da Em1:2026, p.6): θ1 = 1/(100·√H), 1/300 ≤ θ1 ≤ 1/200, θa = θ1·√((1 + 1/n)/2); força horizontal em cada pavimento
     * = θa × (carga vertical característica do pavimento: PP + REV + ALV + SC), nos nós de topo dos pilares, em partes iguais; o fator γ entra na combinação (como o da carga vertical).
     * Convivência com o vento (11.3.3.4.1 a, b, c), comparando os MOMENTOS NA BASE com θa SEM o θ1,mín:
     *   a) 30 % do vento > desaprumo → só o vento (nenhum caso D);  b) vento < 30 % do desaprumo → só o desaprumo (com θ1,mín; o vento deixa de entrar no ELU dessa direção);
     *   c) demais → combina os dois, sem θ1,mín, tudo como ação de vento ampliada (a combinação leva W e D juntos).  Sem vento informado: só o desaprumo (com θ1,mín).
     * O desaprumo não é considerado no ELS (NOTA da 11.3.3.4.1). Não tratados: pilar isolado em balanço (θ1 = 1/200) e laje lisa/cogumelo (θa = θ1) — pendência. */
    var desaprumo = { status: "calculado", casos: [], regime: {}, forcas: [] }, forcasD = [], casosD = {};
    (function () {
      var topo = m.niveis.length ? m.niveis[m.niveis.length - 1].y : 0, H = topo - m.ymin, prum = {};
      Object.keys(m.pecas.pilares).forEach(function (k) { var p = m.pecas.pilares[k]; prum[Math.round(p.cx * 100) + "," + Math.round(p.cz * 100)] = 1; });
      var n = Object.keys(prum).length;
      if (!(H > 0) || !(n > 0)) { desaprumo.status = "pendente"; desaprumo.motivo = "sem pavimentos/pilares para a altura H e o número de prumadas n"; return; }
      var t1raw = 1 / (cv("theta1CoefDenominador", 100) * Math.sqrt(H)), t1min = 1 / cv("theta1MinInv", 300), t1max = 1 / cv("theta1MaxInv", 200);
      var t1u = Math.min(t1raw, t1max), t1m = Math.min(Math.max(t1raw, t1min), t1max), fa = Math.sqrt((1 + 1 / n) / 2);
      desaprumo.H = H; desaprumo.n = n; desaprumo.theta1Calc = t1raw; desaprumo.theta1 = t1m; desaprumo.theta1SemMin = t1u; desaprumo.thetaA = t1m * fa; desaprumo.thetaASemMin = t1u * fa;
      var pn = m.niveis.map(function (nv) { var q = porNivel[nivKey(nv.y)] || {}; return { y: nv.y, nos: nv.nos, P: (q.PP || 0) + (q.REV || 0) + (q.ALV || 0) + (q.SC || 0) }; });
      var dirs = [["+X", [1, 0, 0]], ["-X", [-1, 0, 0]], ["+Z", [0, 0, 1]], ["-Z", [0, 0, -1]]];
      dirs.forEach(function (d) {
        var Mw = 0; forcasH.forEach(function (f) { if (f.caso === "W" + d[0]) Mw += f.F * (f.y - m.ymin); });
        var Mu = 0; pn.forEach(function (x) { Mu += t1u * fa * x.P * (x.y - m.ymin); });
        var reg = vento.status !== "informado" ? "so-desaprumo" : (0.3 * Mw > Mu ? "so-vento" : (Mw < 0.3 * Mu ? "so-desaprumo" : "combinado"));
        desaprumo.regime[d[0]] = { regime: reg, Mvento: Mw, MdesaprumoSemMin: Mu };
        if (reg === "so-vento") return;
        var th = reg === "combinado" ? t1u * fa : t1m * fa, cs = [];
        pn.forEach(function (x) {
          var F = th * x.P; if (!(F > 0)) return;
          x.nos.forEach(function (nid) { cs.push({ tipo: "no", no: nid, F: [d[1][0] * F / x.nos.length, 0, d[1][2] * F / x.nos.length, 0, 0, 0] }); });
          forcasD.push({ caso: "D" + d[0], y: x.y, F: F, dir: d[1] });
        });
        casosD["D" + d[0]] = { cargas: cs, regime: reg, wind: "W" + d[0] };
      });
      premissas.push("Desaprumo global (6118:2023 11.3.3.4.1, Figura 11.1 da Em1:2026): H = " + (Math.round(H * 100) / 100) + " m, n = " + n + " prumadas, θ1 = 1/" + (Math.round(1 / t1m)) + " (cálculo 1/" + (Math.round(1 / t1raw)) + "), θa = " + (Math.round(t1m * fa * 1e5) / 1e5) + "; força por pavimento = θa × (PP + REV + ALV + SC); só ELU (não entra no ELS).");
    })();
    pendencias.push("Forças nocionais não incluídas; desaprumo global INCLUÍDO (11.3.3.4.1). Não tratados: pilar isolado em balanço (θ1 = 1/200) e laje lisa/cogumelo (θa = θ1).");
    if (m.niveis.length < cv("gammaZMinAndares", 4)) avisos.push("Edificação com " + m.niveis.length + " pavimento(s) (< 4): a redução de rigidez do 15.7.3 (0,3/0,4/0,8) deve ser avaliada de forma ESPECÍFICA — em especial se NSd < 0,1·Ac·fcd nos pilares, como em galpões (Em1:2026, 15.7.3).");
    ["pesoConcretoArmado", "pesoRevestimentoPiso", "pesoBlocoCeramicoVazadoParedesVazadas"].forEach(function (k) { premissas.push(k + ": " + D.fonteDe(k)); });

    var lista = [{ id: "PP", nome: "Peso próprio", tipo: "permanente", cargas: casos.PP }, { id: "REV", nome: "Revestimento de piso", tipo: "permanente", cargas: casos.REV },
                 { id: "ALV", nome: "Alvenaria sobre vigas", tipo: "permanente", cargas: casos.ALV }, { id: "SC", nome: "Sobrecarga de uso", tipo: "variavel", cargas: casos.SC }];
    Object.keys(casosVento).forEach(function (id) { lista.push({ id: id, nome: "Vento " + id.slice(1), tipo: "vento", cargas: casosVento[id] }); });
    Object.keys(casosD).forEach(function (id) { lista.push({ id: id, nome: "Desaprumo global " + id.slice(1), tipo: "desaprumo", cargas: casosD[id].cargas, regime: casosD[id].regime, vento: casosD[id].wind }); });
    return { ok: true, casos: lista, totais: totais, porNivel: porNivel, forcasHorizontais: forcasH, forcasDesaprumo: forcasD, desaprumo: desaprumo, vento: vento, usos: usos, avisos: avisos, pendencias: pendencias, premissas: premissas };
  }

  var ConcCargas = { gerar: gerar, usoDoAmbiente: usoDoAmbiente };
  global.ConcCargas = ConcCargas;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcCargas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
