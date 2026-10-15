/* =====================================================================
 * blocokensaio.js — ENSAIO SIMULADO do painel Blocok (motor PURO, ES5,
 * sem DOM, Node-testável). Decisão do Rogério (14/10/2026): "como não tem
 * ensaio do fabricante, o sistema é capaz de, pelos próprios materiais
 * (isopor, cimento), através de parâmetros de cálculo, fazer esse ensaio —
 * simulado dentro do nosso sistema. Não é colocar como pendência. Pode ter a
 * opção de o cara configurar manual, com o valor do fabricante."
 *
 *   BlocokEnsaio.simular(esp, opcoes) → {
 *     flexao: { MRdX, MRdY (kN·m/m), VRd (kN/m), modos:[…], governaX, governaY },
 *     compressao: { NRd (kN/m), modos:[…], governa },
 *     rigidez: { EI (kN·m²/m), S (kN/m), Ef, Gc },
 *     parametros, memoria:[…], fonte }
 *
 * O PAINEL COMO SANDUÍCHE (Allen, "Analysis and Design of Structural Sandwich
 * Panels"; Plantema; EN 14509 para painéis sanduíche): duas faces finas de
 * microconcreto (1,5 cm) separadas pelo núcleo de EPS. As faces levam a
 * flexão como tração/compressão axial com braço d = e − t; o núcleo leva o
 * cisalhamento. Modos verificados, o menor governa:
 *   1. tração da face (concreto SIMPLES, NBR 6118 seção 24);
 *   2. tração na JUNTA de argamassa (aderência argamassa × face), com a
 *      pré-compressão do peso próprio a favor na direção vertical; na
 *      horizontal a amarração (juntas desencontradas) dá o dobro — a mesma
 *      proporção ∥/⊥ da NBR 16868-1 para alvenaria;
 *   3. cisalhamento do núcleo de EPS;
 *   4. descolamento face–núcleo (aderência do EPS à face, SiNAT 019);
 *   5. enrugamento (wrinkling) da face comprimida: σ = 0,5·(Ef·Ec·Gc)^(1/3).
 * À compressão: esmagamento das faces (concreto simples), da junta, e
 * flambagem do sanduíche com a deformação por cisalhamento do núcleo
 * (Ncr = Ne / (1 + Ne/S), Ne = π²EI/H²).
 *
 * TODO valor de material vem de `PARAM` com a fonte escrita ao lado; o
 * fabricante (ou o usuário) troca qualquer um. Valor de ENSAIO do fabricante
 * (M_Rd, N_Rd) entra por cima do simulado no js/blocokcalc.js.
 *
 * Teste: node tools/test-blocokensaio.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.BlocokEnsaio = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function r3(n) { return Math.round((+n || 0) * 1000) / 1000; }
  function br(n, c) { return (+n || 0).toFixed(c == null ? 2 : c).replace(".", ","); }

  /* PARÂMETROS DOS MATERIAIS (MPa, salvo indicação). `fonte` diz de onde veio;
     `ref` = valor de referência RA quando a fonte é faixa de literatura. */
  /* OS 12 MPa (decisão de 14/10/2026): o site oficial diz "O BLOCOK possui alta
     resistência de 12MPa" sem dizer de quê nem trazer laudo, e no laudo UFMG/LAEES
     2022 o número foi informado pela empresa, não ensaiado. Entra SÓ aqui, como
     fck do MICROCONCRETO DA FACE (é o único lugar em que o ensaio simulado aceita
     valor do fabricante) — nunca como resistência ou função estrutural do painel. */
  var DECLARADO = {
    valor: 12, unidade: "MPa", uso: "fck do microconcreto da face (PARAM.face.fck)", semLaudo: true,
    fonte: "declarado pelo fabricante, sem laudo — site oficial blocok.vercel.app (acesso 14/10/2026): “alta resistência de 12MPa”, sem dizer de quê",
    naoE: "não é resistência do painel nem dá função estrutural a ele"
  };
  /* Os 8 ensaios que o site oficial LISTA (14/10/2026), só com o nome: o site não
     publica resultado numérico de nenhum. Nada aqui entra no cálculo. */
  var ENSAIOS_FABRICANTE = {
    fonte: "site oficial blocok.vercel.app (acesso 14/10/2026) — lista sem resultado numérico",
    situacao: "listado pelo fabricante, sem resultado publicado",
    nomes: ["Calor e choque térmico", "Ação de cargas provenientes de peças suspensas", "Impacto de corpo duro", "Estanqueidade",
      "Impacto de corpo mole", "Desempenho estrutural à compressão excêntrica de paredes", "Assentamento de placas cerâmicas", "Ruído externo e interno"]
  };
  var PARAM = {
    face: { t: 0.015, fck: DECLARADO.valor, declarado: true, fonte: "faces de 1,5 cm (site oficial e artigo BJD 2024); fck 12 MPa " + DECLARADO.fonte + " (no laudo UFMG/LAEES 2022 o valor foi informado pela empresa, não ensaiado) — atribuído ao microconcreto da face, " + DECLARADO.naoE + "; abaixo do C20 do escopo da NBR 6118 (1.2): as fórmulas são EXTRAPOLADAS" },
    gamaCSimples: { valor: 1.68, fonte: "NBR 6118:2014, 24.5.2.1 — concreto simples: γc = 1,2 × 1,4; tensões resistentes 24.5.2.2: σcRd = 0,85 fcd, σctRd = 0,85 fctd" },
    eps: { tauK: 0.055, Gc: 1.9, Ec: 3.2, fTperp: 0.080, fonte: "EPS 70 (≈ classe F 13–15 kg/m³): τ médio 69 kPa e G 1,9 MPa (Vėjelis et al., Materials Science 2008, EN 12090), τ característico ≈ 69 − 1,645 × 8,6 ≈ 55 kPa; módulo de compressão 3,2 MPa (geofoam 14 kg/m³, Syracuse); aderência face–EPS ≥ 0,08 MPa (Diretriz SiNAT 019) — pesquisa RA Brain 14/10/2026" },
    gamaEps: { valor: 2.0, fonte: "parâmetro RA (mesmo γm da alvenaria, NBR 16868-1)" },
    junta: { fbk: 0.20, fArg: 4.0, gamaM: 2.0, fonte: "aderência à tração argamassa × substrato cimentício 0,20 MPa (NBR 13749, revestimento interno); argamassa de assentamento fk 4 MPa; γm 2,0 (NBR 16868-1)" },
    proporcaoParalela: { valor: 2.0, fonte: "NBR 16868-1: ftk paralelo às juntas = 2 × perpendicular (amarração)" }
  };

  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function mesclar(b, o) { if (!o) return b; Object.keys(o).forEach(function (k) { var v = o[k]; if (v && typeof v === "object" && !Array.isArray(v) && b[k] && typeof b[k] === "object") mesclar(b[k], v); else if (v !== undefined && v !== null && v !== "") b[k] = v; }); return b; }

  /* esp em cm (10/13/15/20); opcoes = { H (m) altura do campo, pesoKgPeca, param:{…} } */
  function simular(esp, opcoes) {
    opcoes = opcoes || {};
    var P = mesclar(clonar(PARAM), opcoes.param || null);
    var e = num(esp, 15) > 1 ? num(esp, 15) / 100 : num(esp, 0.15);
    var t = P.face.t, d = e - t, c = Math.max(0.01, e - 2 * t);
    var mem = [];
    // face: concreto simples
    var fctm = 0.3 * Math.pow(P.face.fck, 2 / 3), fctkInf = 0.7 * fctm, ftdFace = 0.85 * fctkInf / P.gamaCSimples.valor;   // σctRd = 0,85·fctd (24.5.2.2)
    var Ef = Math.min(1, 0.8 + 0.2 * P.face.fck / 80) * 5600 * Math.sqrt(P.face.fck);      // MPa (Ecs)
    var fcdFace = 0.85 * P.face.fck / P.gamaCSimples.valor;
    mem.push({ passo: "Face — concreto simples", formula: "fctm = 0,3·fck^(2/3); fctk,inf = 0,7·fctm; σctRd = 0,85·fctk,inf/γc (γc = " + br(P.gamaCSimples.valor) + ")", resultado: "σctRd = " + br(ftdFace, 3) + " MPa · Ecs = " + br(Ef / 1000, 1) + " GPa", referencia: P.gamaCSimples.fonte });
    // 1. tração da face
    var M1 = ftdFace * t * d * 1000;                     // MPa·m·m = MN·m/m → ×1000 kN·m/m
    // 2. junta
    var fbd = P.junta.fbk / P.junta.gamaM;
    var pesoKg = num(opcoes.pesoKgPeca, 0), H = num(opcoes.H, 2.6);
    var sigPre = pesoKg > 0 ? 0.9 * (pesoKg * 0.00981 / 0.81) * (H / 2) / (2 * t * 1000) : 0;   // MPa na face, a meia altura (0,9G favorável)
    var M2y = (fbd + sigPre) * t * d * 1000;
    var M2x = P.proporcaoParalela.valor * fbd * t * d * 1000;
    // 3/4. núcleo: cisalhamento e descolamento — governa o menor
    var tauD = Math.min(P.eps.tauK, P.eps.fTperp) / P.gamaEps.valor;
    var VRd = tauD * d * 1000;                            // kN/m
    // 5. enrugamento
    var sigWr = 0.5 * Math.pow(Ef * P.eps.Ec * P.eps.Gc, 1 / 3), sigWrD = sigWr / P.gamaEps.valor;
    var M5 = Math.min(sigWrD, fcdFace) * t * d * 1000;
    var modos = [
      { modo: "tração da face", MRd: r3(M1) },
      { modo: "junta — flexão vertical (perpendicular à fiada)", MRd: r3(M2y), direcao: "y" },
      { modo: "junta — flexão horizontal (paralela à fiada, amarração)", MRd: r3(M2x), direcao: "x" },
      { modo: "enrugamento da face comprimida", MRd: r3(M5) }
    ];
    var MRdX = Math.min(M1, M2x, M5), MRdY = Math.min(M1, M2y, M5);
    function governa(dir) { var cand = modos.filter(function (m) { return !m.direcao || m.direcao === dir; }); return cand.reduce(function (a, b) { return a.MRd <= b.MRd ? a : b; }).modo; }
    mem.push({ passo: "Flexão — modos do sanduíche", formula: "M = σ·t·d (d = e − t = " + br(d * 100, 1) + " cm); junta: (fbk/γm + σpré)·t·d; ∥ = " + br(P.proporcaoParalela.valor, 1) + " × ⊥; enrugamento σ = 0,5·(Ef·Ec·Gc)^(1/3) (coeficiente empírico de Hoff & Mautner, 1945)",
      resultado: modos.map(function (m) { return m.modo + " " + br(m.MRd, 3); }).join(" · ") + " kN·m/m", referencia: "Allen / EN 14509 (sanduíche) · " + P.junta.fonte });
    mem.push({ passo: "Cisalhamento do núcleo", formula: "VRd = mín(τk; aderência)/γm · d", resultado: br(VRd, 2) + " kN/m", referencia: P.eps.fonte });
    // rigidez (composição total + cisalhamento do núcleo)
    var EI = Ef * 1000 * 2 * t * Math.pow(d / 2, 2);          // kN·m²/m (Ef em kN/m²)
    var S = P.eps.Gc * 1000 * d * d / c;                      // kN/m (rigidez ao cisalhamento por metro)
    // compressão
    var NFace = 2 * t * fcdFace * 1000;                       // kN/m
    var NJunta = 2 * t * (P.junta.fArg / P.junta.gamaM) * 1000;
    var Ne = Math.PI * Math.PI * EI / (H * H), Ncr = Ne / (1 + Ne / S), NFlamb = Ncr / P.gamaEps.valor;
    var compModos = [{ modo: "esmagamento das faces", NRd: r3(NFace) }, { modo: "esmagamento da junta", NRd: r3(NJunta) }, { modo: "flambagem do sanduíche (com cisalhamento do núcleo)", NRd: r3(NFlamb) }];
    var NRd = Math.min(NFace, NJunta, NFlamb);
    mem.push({ passo: "Compressão — modos", formula: "faces 2t·0,85fck/γc; junta 2t·fk/γm; Ncr = Ne/(1+Ne/S), Ne = π²EI/H²", resultado: compModos.map(function (m) { return m.modo + " " + br(m.NRd, 1); }).join(" · ") + " kN/m", referencia: "Allen (sanduíche) · NBR 6118 seção 24" });
    return {
      ok: true, espessura: Math.round(e * 100), d: r3(d), nucleo: r3(c),
      flexao: { MRdX: r3(MRdX), MRdY: r3(MRdY), VRd: r3(VRd), modos: modos, governaX: governa("x"), governaY: governa("y"), sigmaPre: r3(sigPre) },
      compressao: { NRd: r3(NRd), modos: compModos, governa: compModos.reduce(function (a, b) { return a.NRd <= b.NRd ? a : b; }).modo },
      rigidez: { EI: r3(EI), S: r3(S), Ef: r3(Ef), Gc: P.eps.Gc },
      parametros: P, memoria: mem,
      fonte: "Ensaio simulado RA — painel sanduíche (modelo analítico com os materiais da peça); substituível pelo ensaio do fabricante"
    };
  }

  return { PARAM: PARAM, DECLARADO: DECLARADO, ENSAIOS_FABRICANTE: ENSAIOS_FABRICANTE, simular: simular };
});
