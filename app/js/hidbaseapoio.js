/* =====================================================================
 * hidbaseapoio.js — BASE DE APOIO DA CAIXA D'ÁGUA ELEVADA (N23, 23/10/2026) — motor PURO (ES5, Node-testável): devolve a proposta
 * (forma, cargas, verificações, orçamento e as ops do lote); não grava nada.
 *
 * PEDIDO DO ROGÉRIO (23/10/2026): "confere a pressão no ponto mais desfavorável; se não atende, SUGERE elevar a caixa com base de
 * apoio (opções madeira ou metálica: estrutura de apoio + caixa em cima, peso cheio no cálculo do apoio, orçada com SINAPI / maior
 * preço público marcado provisório) e mostra o ganho de pressão; também calço/base se a caixa não estiver na altura certa."
 *
 * ANTES: o Corrigir da pressão baixa (js/hidbarrilete.js) só mudava a cota da caixa ("subir a caixa 0,85 m") — a caixa ficava no
 * ar, sem nada embaixo, e nada ia ao orçamento.
 *
 * O QUE ESTE MOTOR FAZ:
 *  1. FORMA (a família hid-base-caixa, js/hidfamilias.js + js/hidlouca.js geoBaseCaixa): 4 pilares nos cantos, 2 vigas principais,
 *     barrotes, tablado, travessas a meia altura e contraventamento em X nas 4 faces. Lado = o maior diâmetro da caixa (com a
 *     tampa) + a folga de cada lado (critério de projeto: a base inteira apoiada — o manual do fabricante pede apoio plano e
 *     contínuo, sem ponto solto; conferir no manual do modelo).
 *  2. CARGAS — a caixa CHEIA: o volume do tipo × o peso específico da água (física: o maior ρ da tabela da água do
 *     js/hidhidraulica.js, 4 °C, × g); o peso próprio da caixa vazia NÃO está na ficha → premissa declarada (fração da água,
 *     GEO_BASE.pesoCaixaFracao) com pendência; o peso próprio da estrutura e do tablado pelas seções (madeira: ρ da classe;
 *     metálica: a massa por metro do perfil e a chapa xadrez pela massa da descrição SINAPI). Ponderação: o γ do perfil de
 *     cálculo da madeira (NBR 8681:2003, edificação tipo 2) nas duas.
 *  3. VERIFICAÇÕES (seção a seção, da menor que passa): tablado (faixa de 1 m entre barrotes), barrote (entre as vigas), viga
 *     principal (entre pilares, a caixa como carga distribuída no diâmetro da base), pilar (N = 1/4 do total, L0 = a altura do
 *     pilar: travado pelo X nas duas direções). Madeira pela NBR 7190-1:2022 (js/maddim7190.js — valores de FONTE SECUNDÁRIA, o
 *     memorial do módulo diz); metálica pela NBR 8800 (js/acodim8800.js). O VENTO (NBR 6123) e a ligação na laje de apoio NÃO são
 *     verificados aqui: a proposta sai "PRÉ-DIMENSIONAMENTO (gravidade)" com a pendência — nunca "aprovado".
 *  4. ORÇAMENTO: madeira pelas composições SINAPI MG 06/2026 (pilar e viga de maçaranduba não aparelhada, assoalho) nos serviços
 *     medidos da instância; metálica sem composição SINAPI → a referência pública de maior preço (SETOP-MG ED-49664, estrutura
 *     metálica em perfil com fabricação, transporte, montagem e fundo anticorrosivo, R$/kg) × a massa, marcada PROVISÓRIA.
 *  5. GANHO DE PRESSÃO: Δp = ρ·g·Δh (física) no ponto mais desfavorável; quem chama (js/hidbarrilete.js) refaz a conferência da
 *     NBR 5626 com a caixa elevada e mostra o antes e o depois.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function MM() { return dep("MadMateriais", "./madmateriais.js"); }
  function MD() { return dep("MadDim", "./maddim7190.js"); }
  function AD() { return dep("AcoDim8800", "./acodim8800.js"); }
  function AM() { return dep("AcoMateriais", "./acomateriais.js"); }
  function PA() { return dep("PerfisAco", "./perfisaco.js"); }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(num(v, 0) * 100) / 100).toFixed(2).replace(".", ","); }   // hid:ok formatação
  function teto(v, passo) { return Math.ceil(v / passo - 1e-9) * passo; }   // hid:ok tolerância numérica
  var EPS = 1e-6;   // hid:ok tolerância numérica

  var FAM = "hid-base-caixa";
  /* critérios de PROJETO (não são valor de norma — cada um com o porquê) */
  var GEO_BASE = {
    folgaLado: 0.05,          // hid:ok de cada lado da caixa (com a tampa) até a borda do tablado: a base inteira apoiada
    passoLado: 0.05,          // hid:ok o lado sai em múltiplo de 5 cm
    vaoTabua: 0.40,           // hid:ok vão máximo da tábua/chapa entre barrotes
    espTabua: 0.02,           // hid:ok REVISÃO N23: a tábua da composição SINAPI 101746 (insumo 6178, cumaru 10 × 2 cm) — a verificação usa a que se orça
    pilarMin: 0.10,           // hid:ok REVISÃO N23: o menor pilar com travessa e diagonal (abaixo disto a pilha tablado + barrote + viga não cabe: a caixa sobe o que a base pede)
    espChapa: 0.0063,         // hid:ok chapa xadrez 1/4" (a da SINAPI 1337)
    massaChapa: 54.53,        // hid:ok kg/m² da chapa xadrez 1/4" — a própria descrição do insumo SINAPI 1337 (MG 06/2026)
    pesoCaixaFracao: 0.05,    // hid:ok PREMISSA: o peso da caixa vazia (a ficha não dá) = 5 % do peso da água — pendência
    elevarMin: 0.10,          // hid:ok abaixo disto é calço, não torre (a proposta vira "calço": um tablado sobre barrotes)
    limVao: 300, limBalanco: 150   // hid:ok flecha L/300 e L/150 (a Tabela 21 da 7190-1 dá faixa; decisão de projeto do perfil)
  };
  /* MADEIRA: maçaranduba (o nome das composições SINAPI) com a classe nativa D40 como PREMISSA conservadora (a literatura dá D60 —
     a RA adota a menor da faixa até o ensaio/certificado); umidade 4 (a caixa fica ao tempo ou no ático sem controle), carga de
     longa duração = permanente (a água fica). As seções são as das composições SINAPI (o que se compra e se orça). */
  var MAD = {
    classe: "nativa:D40", especie: "maçaranduba (ou equivalente da região), não aparelhada", umidade: 4, carregamento: "permanente",   // hid:ok classe de umidade 4 (exposto)
    pilares: [[0.10, "105061", "105064"], [0.15, "105068", "105071"], [0.20, "105074", "105077"]],   // hid:ok seções (m) e as composições SINAPI MG 06/2026 (comprimento 3 m / 6 m)
    vigas: [[0.06, 0.12, "105082"], [0.06, 0.16, "105083"], [0.06, 0.20, "105084"], [0.08, 0.16, "105085"], [0.06, 0.25, "105086"], [0.06, 0.30, "105087"], [0.08, 0.30, "105093"]],   // hid:ok seções b × h (m) e SINAPI
    pilar3m: 3.0,             // hid:ok até 3 m de pilar vale a composição de 3 m; acima, a de 6 m
    tablado: "101746",        // SINAPI MG 06/2026: ASSOALHO DE MADEIRA (m²) — o tablado
    contravento: "105082"     // SINAPI: viga 6 × 12 cm (m) — travessas e diagonais
  };
  /* METÁLICA: tubo quadrado (catálogo Tuper do js/perfisaco.js) com aço de fy ≥ 250 MPa como PREMISSA (o certificado confere);
     preço pela referência pública de maior valor por kg (sem composição SINAPI de estrutura metálica na base MG) */
  var MET = {
    aco: "ASTM A501 Gr A",    // fy 250 MPa (o menor dos tubos do js/acomateriais.js: premissa a favor da segurança)
    tubos: ["TQ 40 x 40 x 2 Tuper", "TQ 50 x 50 x 2 Tuper", "TQ 50 x 50 x 3 Tuper", "TQ 60 x 60 x 3 Tuper", "TQ 70 x 70 x 3 Tuper", "TQ 80 x 80 x 3 Tuper", "TQ 100 x 100 x 3 Tuper", "TQ 100 x 100 x 4,75 Tuper"],
    precoKg: 27.43,           // hid:ok R$/kg SETOP-MG ONERADA 08/2023 (data/setop-MG-onerada-current.json, todas as regiões) ED-49664 — o regime da SINAPI não desonerada do sistema
    fontePreco: "SETOP-MG onerada 08/2023 (a mais recente no sistema) ED-49664 — fornecimento de estrutura metálica em PERFIL LAMINADO, inclusive fabricação, transporte, montagem e fundo anticorrosivo: R$ 27,43/kg (a referência pública mais próxima: as bases do sistema não têm estrutura de tubo formado a frio)",
    dataPreco: "2023-08"
  };

  /* ================================================ cargas */
  function pesoAgua_kN(volumeL) {
    var H = HH(); if (!H) return null;
    /* hid:fisica-inicio peso da água: o MAIOR ρ da tabela (4 °C) × g — a favor da segurança (≈ 9,81 kN/m³) */
    var rho = Math.max.apply(null, arr(H.TABELA_AGUA).map(function (l) { return num(l.rho != null ? l.rho : l[1], 0); }).concat([H.agua(4).rho]));
    return volumeL / 1000 * rho * H.G / 1000;
    /* hid:fisica-fim */
  }
  function ganhoKpa(dh) { var H = HH(); return H ? H.mParaKpa(dh) : null; }

  /* ================================================ MADEIRA */
  function propMadeira(g, out) {
    var M = MM(), D = MD(); if (!M || !D) { out.pendencias.push("o módulo de madeira (js/madmateriais.js, js/maddim7190.js) não carregou: sem verificação da base de madeira"); return null; }
    var perfil = M.perfil2022({ produto: "serrada", carregamento: MAD.carregamento, umidade: MAD.umidade, limVao: GEO_BASE.limVao, limBalanco: GEO_BASE.limBalanco });
    var cl = M.classe2022(MAD.classe), gam = num(perfil.gamaG, null), H = HH();
    var gMad = cl.rho12 * (H ? H.G : 0) / 1000;   /* kN/m³ (ρ12 da classe × g; N → kN) */   // hid:ok N → kN
    var vf = [], L = g.L, Db = g.Db;
    function viga(b, h, vao, qd, qG) {   /* qd = carga de cálculo uniforme (kN/m) já ponderada (parcial em [a, c]) — a verificação do módulo */
      var o = { L: vao, apoios: [0, vao], G: { d: qG }, Q: { d: [] }, b: b, h: h, classe: MAD.classe, perfil: perfil };
      return D.vigaFletida(o);
    }
    /* (1) tablado: faixa de 1 m entre barrotes (vão = espaçamento) */
    var nb = Math.max(2, Math.ceil((L - 0.06) / GEO_BASE.vaoTabua) + 1), s = (L - 0.06) / (nb - 1);   // hid:ok largura do barrote de reserva
    var pC = g.Pcaixa_k / (Math.PI * Db * Db / 4);   /* kN/m² sob a base da caixa (característico) */   // hid:ok área do círculo
    var et = GEO_BASE.espTabua, pT = pC + et * gMad;
    var tb = viga(1, et, s, null, [[0, s, pT]]);   // hid:ok faixa de 1 m
    vf.push({ nome: "Tablado (tábua de " + f2(et * 100) + " cm, vão " + f2(s * 100) + " cm entre barrotes)", eta: tb.eta, ok: tb.ok, passos: tb.passos });
    /* (2) barrote: vão = entre as vigas principais (L − seção do pilar); a faixa s */
    function escolher(lista, teste) { for (var i = 0; i < lista.length; i++) { var r = teste(lista[i]); if (r && r.ok) return { s: lista[i], r: r }; } var u = lista[lista.length - 1]; return { s: u, r: teste(u), falha: true }; }
    var vaoB = L;   /* REVISÃO N23: o vão do barrote verificado = o lado inteiro (o desenho dá L − a seção do pilar; antes L − 15 cm, menor que o desenhado) */
    var bar = escolher(MAD.vigas, function (v) { var q = pT * s + v[0] * v[1] * gMad; return viga(v[0], v[1], vaoB, null, [[0, vaoB, q]]); });
    vf.push({ nome: "Barrote " + f2(bar.s[0] * 100) + " × " + f2(bar.s[1] * 100) + " cm (vão " + f2(vaoB) + " m)", eta: bar.r.eta, ok: !bar.falha && bar.r.ok, passos: bar.r.passos });
    /* (3) viga principal: vão entre os pilares; a caixa distribuída no diâmetro da base (metade em cada viga) + tablado + barrotes */
    var pesoTab = L * L * et * gMad + nb * bar.s[0] * bar.s[1] * L * gMad, a0 = Math.max(0, (L - Db) / 2), a1 = Math.min(L, a0 + Db);
    var vig = escolher(MAD.vigas, function (v) {
      var qC = g.Pcaixa_k / 2 / (a1 - a0), qU = pesoTab / 2 / L + v[0] * v[1] * gMad;
      return viga(v[0], v[1], L, null, [[a0, a1, qC], [0, L, qU]]);
    });
    vf.push({ nome: "Viga principal " + f2(vig.s[0] * 100) + " × " + f2(vig.s[1] * 100) + " cm (vão " + f2(L) + " m, a caixa cheia no diâmetro da base)", eta: vig.r.eta, ok: !vig.falha && vig.r.ok, passos: vig.r.passos });
    /* (4) pilar: N = 1/4 do total (caixa + tablado + barrotes + vigas) ponderado; L0 = altura do pilar */
    var pilha = et + bar.s[1] + vig.s[1] + GEO_BASE.pilarMin, hP = Math.max(GEO_BASE.pilarMin, g.H - et - bar.s[1] - vig.s[1]);
    var pesoVig = 2 * vig.s[0] * vig.s[1] * L * gMad, Nk = (g.Pcaixa_k + pesoTab + pesoVig) / 4;   // hid:ok 4 pilares
    var pil = escolher(MAD.pilares, function (p) { var N = gam * (Nk + p[0] * p[0] * hP * gMad); return D.compressao2022({ N: N, Mx: 0, My: 0, b: p[0], h: p[0], L0x: hP, L0y: hP, classe: MAD.classe, perfil: perfil }); });
    vf.push({ nome: "Pilar " + f2(pil.s[0] * 100) + " × " + f2(pil.s[0] * 100) + " cm (altura " + f2(hP) + " m, contraventado em X: L0 = altura)", eta: pil.r.eta, ok: !pil.falha && pil.r.ok, passos: pil.r.passos });
    var pesoEst = pesoTab + pesoVig + 4 * pil.s[0] * pil.s[0] * hP * gMad;   // hid:ok 4 pilares
    /* contravento (travessas + diagonais nas 4 faces) em 6 × 12 */
    var Lc = 4 * (L - pil.s[0]) + 8 * Math.sqrt(Math.pow(L - 2 * pil.s[0], 2) + hP * hP);   // hid:ok 4 travessas + 8 diagonais (X nas 4 faces)
    var cod = hP <= MAD.pilar3m ? pil.s[1] : pil.s[2];
    var servicos = [
      { id: "pilares", unidade: "m", quantidade: r4(4 * hP), codigo: cod, rotulo: "Base da caixa — pilares " + f2(pil.s[0] * 100) + " × " + f2(pil.s[0] * 100) + " cm (SINAPI " + cod + ")" },   // hid:ok 4 pilares
      { id: "vigas", unidade: "m", quantidade: r4(2 * L), codigo: vig.s[2], rotulo: "Base da caixa — vigas " + f2(vig.s[0] * 100) + " × " + f2(vig.s[1] * 100) + " cm (SINAPI " + vig.s[2] + ")" },
      { id: "barrotes", unidade: "m", quantidade: r4(nb * L), codigo: bar.s[2], rotulo: "Base da caixa — barrotes " + f2(bar.s[0] * 100) + " × " + f2(bar.s[1] * 100) + " cm (SINAPI " + bar.s[2] + ")" },
      { id: "contravento", unidade: "m", quantidade: r4(Lc), codigo: MAD.contravento, rotulo: "Base da caixa — travessas e diagonais 6 × 12 cm (SINAPI " + MAD.contravento + ")" },
      { id: "tablado", unidade: "m2", quantidade: r4(L * L), codigo: MAD.tablado, rotulo: "Base da caixa — tablado (assoalho de madeira, SINAPI " + MAD.tablado + ")" }
    ];
    return { pilha: r4(pilha), material: "madeira", nome: "madeira (" + MAD.especie + ", classe " + cl.nome + " — premissa)", geo: { Secao_pilar: pil.s[0], Base_viga: vig.s[0], Altura_viga: vig.s[1], Base_barrote: bar.s[0], Altura_barrote: bar.s[1], Espessura_tablado: et, N_barrotes: nb, Metalica: false },
      hPilar: r4(hP), verificacoes: vf, pesoEstrutura_kN: r4(pesoEst), servicos: servicos, precoRef: null, norma: perfil.fonte + " — valores de fonte secundária (o memorial da madeira diz)" };
  }

  /* ================================================ METÁLICA */
  function propMetalica(g, out) {
    var A = AD(), C = PA(), Mt = AM(), M = MM(); if (!A || !C || !Mt) { out.pendencias.push("o módulo da metálica (js/acodim8800.js, js/perfisaco.js) não carregou: sem verificação da base metálica"); return null; }
    var aco = Mt.aco(MET.aco); if (!aco) { out.pendencias.push("aço " + MET.aco + " fora do js/acomateriais.js"); return null; }
    var gam = M ? num(M.perfil2022({ produto: "serrada", carregamento: "permanente", umidade: 1, limVao: GEO_BASE.limVao, limBalanco: GEO_BASE.limBalanco }).gamaG, null) : null, H = HH(), gg = H ? H.G : 0;
    if (gam == null) { out.pendencias.push("sem o coeficiente de ponderação (NBR 8681): a base metálica não foi verificada"); return null; }
    var L = g.L, Db = g.Db, vf = [];
    function secao(n) { var s = C.completo(n); return s && s.A > 0 ? s : null; }
    function kgm(s) { return num(s.massa, 0); }
    function barra(s, Lb, est, papel) { return A.verificarBarra({ secao: s, aco: aco, L: Lb, estacoes: est, flambagem: { Lx: Lb, Ly: Lb, Lz: Lb }, travamentos: { mais: [], menos: [] }, papel: papel }); }
    function estViga(Lv, cargas) {   /* biapoiada: cargas [[a, b, q]] (kN/m, de cálculo) → estações N, V, M */
      var R1 = 0, o = [], n = 16, i; cargas.forEach(function (c) { var P = c[2] * (c[1] - c[0]), xc = (c[0] + c[1]) / 2; R1 += P * (Lv - xc) / Lv; });   // hid:ok 16 estações
      for (i = 0; i <= n; i++) { var x = Lv * i / n, V = R1, Mz = R1 * x; cargas.forEach(function (c) { var a = c[0], b = Math.min(c[1], x); if (b > a) { var P = c[2] * (b - a); V -= P; Mz -= P * (x - (a + b) / 2); } }); o.push({ x: x, N: 0, Vy: V, Mz: Mz, comb: "ELU" }); }
      return o;
    }
    /* REVISÃO N23: a esbeltez acima de 200 (NBR 8800 5.3.7.1, o aviso do js/acodim8800.js) reprova a seção — antes o ok dele a ignorava
       e o pilar TQ 40 × 40 × 2 com 3,4 m (λ = 219) saía "PRÉ-DIMENSIONADO" */
    function okEsb(r) { return !!(r && r.ok && !arr(r.avisos).some(function (a) { return /Esbeltez/i.test(String(a)); })); }
    function escolher(lista, teste) { for (var i = 0; i < lista.length; i++) { var s = secao(lista[i]); if (!s) continue; var r = teste(s); if (okEsb(r)) return { n: lista[i], s: s, r: r }; } var u = lista[lista.length - 1], su = secao(u); return { n: u, s: su, r: su ? teste(su) : { ok: false, razao: Infinity, verificacoes: [] }, falha: true }; }
    function passosDe(r) { return arr(r && r.verificacoes).map(function (v) { return v.nome + ": " + f2(v.solicitante) + " / " + f2(v.resistencia) + " " + (v.unidade || "") + " = " + f2(v.razao) + " (" + (v.item || "") + ")"; }); }
    var et = GEO_BASE.espChapa, pC = g.Pcaixa_k / (Math.PI * Db * Db / 4), pT = pC + GEO_BASE.massaChapa * gg / 1000;   // hid:ok área do círculo; kg·g → kN
    var nb = Math.max(2, Math.ceil(L / GEO_BASE.vaoTabua) + 1), s = L / (nb - 1);   // hid:ok
    var vaoB = L;   /* REVISÃO N23: o lado inteiro (a favor da segurança; antes L − 8 cm, menor que o desenhado) */
    var bar = escolher(MET.tubos, function (sc) { var q = gam * (pT * s + kgm(sc) * gg / 1000); return barra(sc, vaoB, estViga(vaoB, [[0, vaoB, q]]), "viga"); });   // hid:ok kg → kN
    vf.push({ nome: "Barrote " + bar.n + " (vão " + f2(vaoB) + " m, chapa xadrez 1/4\" com vão " + f2(s * 100) + " cm)", eta: bar.r.razao, ok: !bar.falha && bar.r.ok, passos: passosDe(bar.r) });
    var pesoTab = L * L * GEO_BASE.massaChapa * gg / 1000 + nb * L * kgm(bar.s) * gg / 1000, a0 = Math.max(0, (L - Db) / 2), a1 = Math.min(L, a0 + Db);   // hid:ok kg → kN
    var vig = escolher(MET.tubos, function (sc) { var qC = gam * g.Pcaixa_k / 2 / (a1 - a0), qU = gam * (pesoTab / 2 / L + kgm(sc) * gg / 1000); return barra(sc, L, estViga(L, [[a0, a1, qC], [0, L, qU]]), "viga"); });   // hid:ok kg → kN
    vf.push({ nome: "Viga principal " + vig.n + " (vão " + f2(L) + " m, a caixa cheia no diâmetro da base)", eta: vig.r.razao, ok: !vig.falha && okEsb(vig.r), passos: passosDe(vig.r) });
    var hV = num(vig.s.h, 0) / 1000, hB = num(bar.s.h, 0) / 1000, hP = Math.max(GEO_BASE.pilarMin, g.H - et - hB - hV), pilha = et + hB + hV + GEO_BASE.pilarMin;   // hid:ok mm → m; pilar mínimo de desenho
    var pesoVig = 2 * L * kgm(vig.s) * gg / 1000, Nk = (g.Pcaixa_k + pesoTab + pesoVig) / 4;   // hid:ok kg → kN; 4 pilares
    var pil = escolher(MET.tubos, function (sc) { var N = gam * (Nk + hP * kgm(sc) * gg / 1000); return barra(sc, hP, [{ x: 0, N: -N, Vy: 0, Mz: 0, comb: "ELU" }, { x: hP, N: -N, Vy: 0, Mz: 0, comb: "ELU" }], "pilar"); });   // hid:ok kg → kN
    vf.push({ nome: "Pilar " + pil.n + " (altura " + f2(hP) + " m, contraventado em X: L0 = altura)", eta: pil.r.razao, ok: !pil.falha && okEsb(pil.r), passos: passosDe(pil.r) });
    var Lc = 4 * L + 8 * Math.sqrt(L * L + hP * hP), sd = secao(MET.tubos[0]);   // hid:ok 4 travessas + 8 diagonais
    var kg = 4 * hP * kgm(pil.s) + 2 * L * kgm(vig.s) + nb * L * kgm(bar.s) + Lc * (sd ? kgm(sd) : 0) + L * L * GEO_BASE.massaChapa;   // hid:ok 4 pilares, 2 vigas
    var preco = r4(Math.round(kg * MET.precoKg * 100) / 100);   // hid:ok centavos
    var lado = function (sc) { return num(sc.b, 0) / 1000; };   // hid:ok mm → m
    return { pilha: r4(pilha), material: "metalica", nome: "metálica (tubo quadrado, aço fy ≥ 250 MPa — premissa; chapa xadrez 1/4\")", geo: { Secao_pilar: lado(pil.s), Base_viga: lado(vig.s), Altura_viga: hV, Base_barrote: lado(bar.s), Altura_barrote: hB, Espessura_tablado: et, N_barrotes: nb, Metalica: true },
      hPilar: r4(hP), verificacoes: vf, pesoEstrutura_kN: r4(kg * gg / 1000), massa_kg: r4(kg), servicos: [], norma: "ABNT NBR 8800 (js/acodim8800.js)",   // hid:ok kg → kN
      precoRef: { valor: preco, data: MET.dataPreco, fonte: MET.fontePreco + " × " + f2(kg) + " kg (pilares, vigas, barrotes, travessas, diagonais e a chapa)", provisorio: true, motivo: "estrutura metálica sem composição SINAPI na base MG: a referência pública por kg (SETOP-MG onerada 08/2023, perfil laminado) — desatualizada e de outro perfil: cotar com o serralheiro" } };
  }

  /* ================================================ a PROPOSTA
   * o = { caixa: (HidBarrilete.caixas) { id, D, R, H, yb, c: {x, z}, volume, av: { valores } }, elevar (m), material: "madeira" | "metalica",
   *       apoio (y do apoio sob a caixa; padrão yb), id (o id da base) }
   * → { ok, material, nome, elevar, H, L, cargas, verificacoes[], status, ops[], pendencias[], premissas[], ganho_kPa, orcamento } */
  function propor(o) {
    o = o || {};
    var cx = o.caixa || {}, out = { ok: false, pendencias: [], premissas: [], verificacoes: [], ops: [] };
    var v = (cx.av && cx.av.valores) || {}, D = num(cx.D, 0), Db = num(v.Diametro_base, 0) > 0 ? num(v.Diametro_base, 0) : D, Vl = num(cx.volume, 0);
    var elevar = num(o.elevar, 0), apoio = num(o.apoio, num(cx.yb, 0));
    if (!(D > 0) || !(Vl > 0)) { out.pendencias.push("a caixa " + (cx.id || "?") + " não tem diâmetro ou volume no tipo: sem base proposta"); return out; }
    if (!(elevar > 0)) { out.pendencias.push("nada a elevar"); return out; }
    var calco = elevar < GEO_BASE.elevarMin;
    var Pagua = pesoAgua_kN(Vl); if (Pagua == null) { out.pendencias.push("sem o módulo de hidráulica (peso da água)"); return out; }
    var Pcx = Pagua * (1 + GEO_BASE.pesoCaixaFracao);   // hid:ok
    out.premissas.push("Peso da caixa CHEIA: " + f2(Vl).replace(",00", "") + " L de água = " + f2(Pagua) + " kN (ρ máximo da água × g) + o peso da caixa vazia, que a ficha do fabricante não dá: adotados " + f2(GEO_BASE.pesoCaixaFracao * 100) + " % do peso da água (" + f2(Pcx - Pagua) + " kN) — confira no manual do modelo");   // hid:ok
    var L = r4(teto(D + 2 * GEO_BASE.folgaLado, GEO_BASE.passoLado));   // hid:ok 2 lados
    var g = { L: L, Db: Math.min(Db, L), H: elevar, Pcaixa_k: Pcx };
    var prop = o.material === "metalica" ? propMetalica : propMadeira, P = prop(g, out);
    if (!P) return out;
    /* REVISÃO N23: a pilha (tablado + barrote + viga + o pilar mínimo) maior que o Δh pedido — a estrutura atravessava a caixa (subir
       0,10 m com 0,38 m de base desenhada). A caixa sobe o que a base pede (o ganho de pressão é o desse Δh) */
    if (P.pilha > elevar + EPS) {
      out.premissas.push("A base pede no mínimo " + f2(P.pilha) + " m (tablado + barrote + viga + o pilar mínimo com travessa e diagonal): a caixa sobe " + f2(P.pilha) + " m em vez dos " + f2(elevar) + " m que a pressão pedia");
      elevar = r4(P.pilha); g.H = elevar; P = prop(g, out); if (!P) return out;
    }
    var todasOk = P.verificacoes.every(function (x) { return x.ok; });
    out.fecha = todasOk; out.material = P.material; out.nome = (calco ? "calço/base baixa " : "base ") + P.nome; out.elevar = r4(elevar); out.L = L; out.H = r4(elevar); out.hPilar = P.hPilar;
    out.cargas = { agua_kN: r4(Pagua), caixa_kN: r4(Pcx), estrutura_kN: P.pesoEstrutura_kN, total_kN: r4(Pcx + P.pesoEstrutura_kN), porPilar_kN: r4((Pcx + P.pesoEstrutura_kN) / 4) };   // hid:ok 4 pilares
    out.verificacoes = P.verificacoes; out.norma = P.norma;
    /* ⚠ nada sai "aprovado" com verificação crítica não feita (o vento, a laje de apoio): PRÉ-DIMENSIONAMENTO, com a pendência */
    out.status = todasOk ? "PRÉ-DIMENSIONADO (gravidade) — vento e apoio na laje com o RT" : "NÃO FECHOU — a maior seção da lista não atende: estrutura de projeto (RT)";
    out.pendencias.push("Base da caixa " + cx.id + ": o vento sobre a caixa elevada (NBR 6123) e o contraventamento não foram verificados — o RT confere a ligação das diagonais e o tombamento");
    out.pendencias.push("Base da caixa " + cx.id + ": a laje/forro de apoio recebe " + f2(out.cargas.porPilar_kN) + " kN por pilar (característico, caixa cheia) — confira com o projeto estrutural");
    if (!todasOk) out.pendencias.push("Base da caixa " + cx.id + ": " + P.verificacoes.filter(function (x) { return !x.ok; }).map(function (x) { return x.nome + " (η = " + f2(x.eta) + ")"; }).join("; ") + " — não atende com a maior seção da lista");
    out.ganho_kPa = r4(ganhoKpa(elevar));
    var id = o.id || ("base-" + cx.id), inst = { Lado: L, Altura: r4(elevar), Peso_cheio_kN: r4(Pcx) };
    Object.keys(P.geo).forEach(function (k) { inst[k] = typeof P.geo[k] === "number" ? r4(P.geo[k]) : P.geo[k]; });
    if (P.precoRef) { inst.Preco_unitario = P.precoRef.valor; inst.Fonte_preco = P.precoRef.fonte; inst.Peca_catalogo = "base-caixa-metalica"; inst.Preco_provisorio = true; inst.Motivo_preco = P.precoRef.motivo; inst.Data_preco = P.precoRef.data || ""; }
    out.pilha = P.pilha;
    /* REVISÃO N23: a base que NÃO FECHA (a maior seção da lista não atende) não vira Corrigir nem orçamento: fica a pendência para o RT */
    if (!todasOk) { out.servicos = P.servicos; out.precoRef = P.precoRef || null; out.id = id; out.ok = true; return out; }
    out.ops.push({ op: "familia", id: id, famId: FAM, tipoId: "t-generico", x: r4(num(cx.c && cx.c.x, 0)), y: r4(apoio), z: r4(num(cx.c && cx.c.z, 0)), rotY: num(cx.rot, 0), inst: inst, baseDe: String(cx.id) });
    out.ops.push({ op: "instancia", id: String(cx.id), y: r4(apoio + elevar) });
    if (P.servicos.length) out.ops.push({ op: "orcar", id: id, servicos: P.servicos.map(function (s) { return { codigo: s.codigo, medida: "servico:" + s.id, fator: 1, rotulo: s.rotulo }; }) });
    out.servicos = P.servicos; out.precoRef = P.precoRef || null; out.id = id;
    out.ok = true;
    return out;
  }
  /* as duas opções (madeira e metálica) para o mesmo Δh */
  function opcoes(o) { var a = {}, b = {}; Object.keys(o || {}).forEach(function (k) { a[k] = o[k]; b[k] = o[k]; }); a.material = "madeira"; b.material = "metalica"; return [propor(a), propor(b)]; }

  var HidBaseApoio = { VERSAO: 1, FAM: FAM, GEO_BASE: GEO_BASE, MAD: MAD, MET: MET, propor: propor, opcoes: opcoes, _int: { pesoAgua_kN: pesoAgua_kN, ganhoKpa: ganhoKpa } };
  global.HidBaseApoio = HidBaseApoio;
  if (typeof module !== "undefined" && module.exports) module.exports = HidBaseApoio;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
