/* =====================================================================
 * madmateriais.js — MATERIAIS do cálculo de estruturas de madeira (motor
 * PURO, ES5, sem DOM, Node-testável): classes de resistência, espécies,
 * coeficientes de modificação (kmod), de ponderação (γw), de fluência (φ)
 * e os PERFIS de cálculo (conjunto coerente de coeficientes de uma edição
 * da norma, ou de uma emissão já assinada).
 *
 * ORIGEM DOS NÚMEROS (nada digitado de cabeça; cada valor carrega `fonte`):
 *   · NBR 7190:1997 — Tabelas 8 e 9 (classes C de coníferas e de
 *     dicotiledôneas: fc0k, fvk, Ec0,m, ρbas,m, ρaparente), Tabelas 10–12
 *     (kmod1, kmod2, kmod3), 6.4.4 (γwc 1,4; γwt 1,8; γwv 1,8) e Tabela 15
 *     (coeficiente de fluência φ). É a base do PROJ-EST R03 (quiosque de referência).
 *   · NBR 7190-1:2022 (vigente; partes 1 a 7 publicadas em 29/06/2022) —
 *     o TEXTO NÃO ESTÁ NA BIBLIOTECA DA RA. O que se sabe por fonte não
 *     normativa (artigos — ver docs/madeira/PLANO-MADEIRA-CALCULO.md):
 *     kmod = kmod1·kmod2 (kmod3 extinto), Xd = kmod·Xk/γw, kM 0,5 → 0,7,
 *     estabilidade de barra comprimida reescrita, tração com γ 1,4. Os
 *     valores numéricos da 2022 entram aqui SÓ com fonte citada; enquanto
 *     faltar, o perfil "NBR7190_2022" fica INCOMPLETO e o motor recusa
 *     calcular com ele (pendência visível, nunca um zero calado).
 *   · Peso próprio: NBR 6120:2019, Tabela 1 (madeiras — peso específico
 *     aparente). O Quiosque adotou 10 kN/m³ para a Tatajuba (a favor).
 *
 * ⚠ Densidade de RESISTÊNCIA (ρk, usada em ligações) ≠ peso específico de
 *   CARGA (NBR 6120). Não trocar um pelo outro: a ligação ficaria contra a
 *   segurança e o peso próprio a favor, ou vice-versa.
 * Teste: node tools/test-mad-materiais.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var F97 = "NBR 7190:1997";

  /* Classes de resistência da NBR 7190:1997 (umidade 12 %). MPa e kg/m³. */
  var CLASSES_1997 = {
    "C20-con": { grupo: "conifera", nome: "C 20 (conífera)", fc0k: 20, fvk: 4, Ec0m: 3500, rhoBas: 400, rhoAp: 500, fonte: F97 + ", Tabela 8" },
    "C25-con": { grupo: "conifera", nome: "C 25 (conífera)", fc0k: 25, fvk: 5, Ec0m: 8500, rhoBas: 450, rhoAp: 550, fonte: F97 + ", Tabela 8" },
    "C30-con": { grupo: "conifera", nome: "C 30 (conífera)", fc0k: 30, fvk: 6, Ec0m: 14500, rhoBas: 500, rhoAp: 600, fonte: F97 + ", Tabela 8" },
    "C20-dic": { grupo: "dicotiledonea", nome: "C 20 (dicotiledônea)", fc0k: 20, fvk: 4, Ec0m: 9500, rhoBas: 500, rhoAp: 650, fonte: F97 + ", Tabela 9" },
    "C30-dic": { grupo: "dicotiledonea", nome: "C 30 (dicotiledônea)", fc0k: 30, fvk: 5, Ec0m: 14500, rhoBas: 650, rhoAp: 800, fonte: F97 + ", Tabela 9" },
    "C40-dic": { grupo: "dicotiledonea", nome: "C 40 (dicotiledônea)", fc0k: 40, fvk: 6, Ec0m: 19500, rhoBas: 750, rhoAp: 950, fonte: F97 + ", Tabela 9" },
    "C60-dic": { grupo: "dicotiledonea", nome: "C 60 (dicotiledônea)", fc0k: 60, fvk: 8, Ec0m: 24500, rhoBas: 800, rhoAp: 1000, fonte: F97 + ", Tabela 9" }
  };

  /* kmod da 1997 */
  var KMOD1_1997 = { permanente: 0.60, longa: 0.70, media: 0.80, curta: 0.90, instantanea: 1.10, fonte: F97 + ", Tabela 10 (madeira serrada, MLC, compensado)" };
  var KMOD2_1997 = { 1: 1.0, 2: 1.0, 3: 0.8, 4: 0.8, fonte: F97 + ", Tabela 11 (madeira serrada, MLC, compensado)" };
  var KMOD3_1997 = { primeira: 1.0, segunda: 0.8, fonte: F97 + ", 6.4.4 (conífera: sempre 0,8)" };
  var GAMA_1997 = { c: 1.4, t: 1.8, v: 1.8, fonte: F97 + ", 6.4.5" };
  /* coeficiente de fluência φ por classe de carregamento e de umidade */
  var PHI_1997 = {
    "12": { permanente: 0.8, longa: 0.8, media: 0.3, curta: 0.1 },
    "34": { permanente: 2.0, longa: 2.0, media: 1.0, curta: 0.5 },
    fonte: F97 + ", Tabela 15"
  };

  /* Espécies usadas pela RA. A classe é a atribuição de PROJETO (premissa do RT),
   * não um ensaio; o memorial diz isso. `gamaCarga` = peso específico para cargas (kN/m³). */
  var ESPECIES = {
    tatajuba: { nome: "Tatajuba (Bagassa guianensis)", grupo: "dicotiledonea", classe1997: "C40-dic", classe2022: "nativa:D40", gamaCarga: 10.0,
      classeLiteratura: "nativa:D60 (NBR 7190-3:2022, Tab. A.1, fc0,k 64,62 MPa)",
      fonteGama: "NBR 6120:2019, Tabela 1 (adotado 10 kN/m³ no PROJ-EST, a favor da segurança)", rhoKLig: 550,
      fonteRhoK: "PROJ-EST R00 calc_ligacoes.py: classe ≥ D40, ρk 550 kg/m³ (EN 338) — premissa do RT", uso: "pilares, vigas, piso seco" },
    itauba: { nome: "Itaúba (Mezilaurus itauba)", grupo: "dicotiledonea", classe1997: "C40-dic", classe2022: "nativa:D40", gamaCarga: 10.0,
      fonteGama: "NBR 6120:2019, Tabela 1 (p. 16): Itaúba não consta pelo nome; dicotiledônea classe C60 = 10 kN/m³ (NBR 7190-3:2022, Tab. A.1: D60)",
      rhoKLig: 550, fonteRhoK: "mesma premissa do RT para a Tatajuba (classe ≥ D40, ρk 550 kg/m³, EN 338) — a favor da segurança",
      classeLiteratura: "nativa:D60 (NBR 7190-3:2022, Tab. A.1, fc0,k 61,71 MPa)", uso: "pergolado, brise, ripado (especificação do cliente 11/10/2026)" },
    pinus_cca: { nome: "Pinus elliottii/taeda tratado em autoclave (CCA)", grupo: "conifera", classe1997: "C25-con", gamaCarga: 6.0,
      /* conferido no texto em 13/10/2026: coníferas C20 5 / C25 5,5 / C30 6 kN/m³ (U = 12 %) — o pinus tratado entra com o MAIOR (6) */
      fonteGama: "NBR 6120:2019, Tabela 1 (p. 16): coníferas C20 = 5, C25 = 5,5, C30 = 6 kN/m³ (U = 12 %); adotado 6 kN/m³, o maior, a favor da segurança (pinus tratado em autoclave)",
      rhoKLig: 330, fonteRhoK: "PROJ-EST R00 calc_ligacoes.py: Pinus ≥ C20, ρk 330 kg/m³ — premissa do RT",
      uso: "wood frame (montantes, guias, travessas), forro" }
  };

  /* PERFIS DE CÁLCULO — conjunto fechado de coeficientes. */
  var PERFIS = {
    /* exatamente o que o calc_piso_v18.py (PROJ-EST R03, 11/10/2026) usou — base da regressão */
    QUIO_R03_PISO: {
      nome: "PROJ-EST R03 — piso seco (critério conservador do RT, NBR 7190:1997)",
      kmod: 0.70 * 0.80 * 0.80, kmodPartes: "kmod1 0,70 (longa) × kmod2 0,80 (umidade 3/4) × kmod3 0,80",
      gw: { c: 1.4, t: 1.8, v: 1.8 }, flexaoPor: "fc0d", fc90Fator: 0.25,
      gamaG: 1.4, gamaQ: 1.4, psi2: 0.4, phi: 2.0, limVao: 350, limBalanco: 175, eRigidez: "kmod·Ec0m",
      fonte: "calc_piso_v18.py / piso_pw.py (quiosque de referência) — NBR 7190:1997 6.4 e Tab. 10–11, 15; NBR 8681 (γ 1,4)",
      completo: true
    },
    NBR7190_2022: {
      nome: "NBR 7190-1:2022 (vigente)", completo: false, edicao: "2022",
      falta: "use MadMateriais.perfil2022({carregamento, umidade, produto, limVao, limBalanco}) — o kmod depende da obra"
    }
  };

  /* ------------------------------------------------------------------
   * NBR 7190-1:2022 — valores de FONTE SECUNDÁRIA (o texto não está na
   * biblioteca). Só entra aqui o que tem confiança R2 (duas fontes
   * independentes concordando, ou imagem da tabela + texto) na pesquisa
   * BIBLIOTECA TÉCNICA - NORMAS\_ÍNDICE\NBR7190-2022_parametros_pesquisa.md
   * (12/10/2026). O memorial imprime "fonte secundária — conferir no texto
   * da norma" em cada item até a RA ter o texto.
   * ⚠ "D40" tem DOIS sentidos: nativa por corpo de prova (fc0,k = 40) e
   *   peça estrutural (fm,k = 40, fc0,k = 26). Chaves distintas:
   *   "nativa:D40" e "peca:D40". Não existe C25 na 2022.
   * ------------------------------------------------------------------ */
  var F22 = "NBR 7190-1:2022";   // valores conferidos em fonte técnica secundária (pesquisa de 12/10/2026) — registro interno, não vai ao memorial
  var CLASSES_2022 = {};
  [["D20", 20, 4, 10000, 500], ["D30", 30, 5, 12000, 625], ["D40", 40, 6, 14500, 750], ["D50", 50, 7, 16500, 850], ["D60", 60, 8, 19500, 1000]]
    .forEach(function (r) {
      CLASSES_2022["nativa:" + r[0]] = { origem: "nativa_cp", grupo: "dicotiledonea", nome: r[0] + " (nativa, corpo de prova)", fc0k: r[1], fvk: r[2], Ec0m: r[3],
        rho12: r[4], E005: 0.7 * r[3], fonte: F22 + ", Tabela 2 (fm,d = ft0,d = fc0,d e E0,05 = 0,7·Ec0,m para nativas)" };
    });
  /* peças estruturais (7190-4): [fmk, ft0k, ft90k, fc0k, fc90k, fvk, E0m GPa, E005 GPa, E90m GPa, Gm GPa, ρk, ρm] */
  var PECAS22 = {
    C14: [14, 8, 0.4, 16, 2.0, 3.0, 7, 4.7, 0.2, 0.4, 290, 350], C16: [16, 10, 0.4, 17, 2.2, 3.2, 8, 5.4, 0.3, 0.5, 310, 370],
    C18: [18, 11, 0.4, 18, 2.2, 3.4, 9, 6.0, 0.3, 0.6, 320, 380], C20: [20, 12, 0.4, 19, 2.3, 3.6, 9.5, 6.4, 0.3, 0.6, 330, 390],
    C22: [22, 13, 0.4, 20, 2.4, 3.8, 10, 6.7, 0.3, 0.6, 340, 410], C24: [24, 14, 0.4, 21, 2.5, 4.0, 11, 7.4, 0.4, 0.7, 350, 420],
    C27: [27, 16, 0.4, 22, 2.6, 4.0, 12, 7.7, 0.4, 0.7, 370, 450], C30: [30, 18, 0.4, 23, 2.7, 4.0, 12, 8.0, 0.4, 0.8, 380, 460],
    C35: [35, 21, 0.4, 25, 2.8, 4.0, 13, 8.7, 0.4, 0.8, 400, 480], C40: [40, 24, 0.4, 26, 2.9, 4.0, 14, 9.4, 0.5, 0.9, 420, 500],
    C45: [45, 27, 0.4, 27, 3.1, 4.0, 15, 10, 0.5, 0.9, 440, 520], C50: [50, 30, 0.4, 29, 3.2, 4.0, 16, 11, 0.5, 1.0, 460, 550],
    D18: [18, 11, 0.6, 18, 7.5, 3.4, 9.5, 8, 0.6, 0.6, 475, 570], D24: [24, 14, 0.6, 21, 7.8, 4.0, 10, 8.5, 0.7, 0.6, 485, 580],
    D30: [30, 18, 0.6, 23, 8.0, 4.0, 11, 9.2, 0.7, 0.7, 530, 640], D35: [35, 21, 0.6, 25, 8.1, 4.0, 12, 10, 0.8, 0.8, 540, 650],
    D40: [40, 24, 0.6, 26, 8.3, 4.0, 13, 11, 0.9, 0.8, 560, 660], D50: [50, 30, 0.6, 29, 9.3, 4.0, 14, 12, 0.9, 0.9, 620, 750],
    D60: [60, 36, 0.6, 32, 11, 4.5, 17, 14, 1.1, 1.1, 700, 840], D70: [70, 42, 0.6, 34, 13.5, 5.0, 20, 16.8, 1.33, 1.25, 900, 1080]
  };
  Object.keys(PECAS22).forEach(function (k) {
    var r = PECAS22[k];
    CLASSES_2022["peca:" + k] = { origem: "peca", grupo: k.charAt(0) === "C" ? "conifera" : "dicotiledonea", nome: k + " (peça estrutural)",
      fmk: r[0], ft0k: r[1], ft90k: r[2], fc0k: r[3], fc90k: r[4], fvk: r[5], Ec0m: r[6] * 1000, E005: r[7] * 1000, E90m: r[8] * 1000,
      Gm: r[9] * 1000, rhok: r[10], rhom: r[11], fonte: F22 + ", tabela de peças estruturais (7190-4)" };
  });
  var KMOD1_2022 = {
    serrada: { permanente: 0.60, longa: 0.70, media: 0.80, curta: 0.90, instantanea: 1.10 },
    recomposta: { permanente: 0.30, longa: 0.45, media: 0.65, curta: 0.90, instantanea: 1.10 },
    fonte: F22 + ", Tabela 4 (serrada, roliça, MLC, MLCC, LVL × recomposta)"
  };
  var KMOD2_2022 = { serrada: { 1: 1.00, 2: 0.90, 3: 0.80, 4: 0.70 }, recomposta: { 1: 1.00, 2: 0.95, 3: 0.93, 4: 0.90 },
    fonte: F22 + ", Tabela 5 (MLCC proibido na classe 4)" };
  var PHI_2022 = { serrada: { 1: 0.60, 2: 0.80, 3: 0.80, 4: 2.00 }, compensado: { 1: 0.80, 2: 1.00, 3: 1.00, 4: 2.50 },
    osb: { 1: 1.50, 2: 2.25, 3: 2.25, 4: null }, fonte: F22 + ", coeficiente de fluência φ por classe de umidade" };
  var GAMA_2022 = { c: 1.4, t: 1.4, m: 1.4, v: 1.8, lig: 1.4, fonte: F22 + " (tração 1,8 → 1,4; cisalhamento 1,8)" };


  var MadMateriais = {
    CLASSES_1997: CLASSES_1997, KMOD1_1997: KMOD1_1997, KMOD2_1997: KMOD2_1997, KMOD3_1997: KMOD3_1997,
    GAMA_1997: GAMA_1997, PHI_1997: PHI_1997, ESPECIES: ESPECIES, PERFIS: PERFIS,
    CLASSES_2022: CLASSES_2022, KMOD1_2022: KMOD1_2022, KMOD2_2022: KMOD2_2022, PHI_2022: PHI_2022, GAMA_2022: GAMA_2022
  };

  /**
   * Perfil de cálculo da NBR 7190-1:2022 para uma situação de projeto.
   * o = { carregamento: "longa"…, umidade: 1–4, produto: "serrada"|"recomposta", fluencia: "serrada"|"compensado"|"osb",
   *       limVao (ex. 300 = L/300 na flecha final líquida), limBalanco, psi2, gamaG, gamaQ }
   * γG/γQ/ψ2: NBR 8681:2003 (texto na biblioteca); a 8681:2025 está vigente e não foi conferida — o memorial avisa.
   * Limites de flecha da Tabela 21 são FAIXAS (L/250 a L/350 líquida, vão): o perfil exige o valor escolhido.
   */
  MadMateriais.perfil2022 = function (o) {
    o = o || {};
    var prod = o.produto || "serrada", u = o.umidade, car = o.carregamento;
    var k1 = (KMOD1_2022[prod] || {})[car], k2 = (KMOD2_2022[prod] || {})[u];
    var phi = (PHI_2022[o.fluencia || prod] || PHI_2022.serrada)[u];
    if (k1 == null || k2 == null) throw new Error("madmateriais: perfil2022 sem kmod para " + prod + "/" + car + "/umidade " + u);
    if (phi == null) throw new Error("madmateriais: perfil2022 sem φ para umidade " + u + " (OSB na classe 4 não se aplica)");
    if (!o.limVao || !o.limBalanco) throw new Error("madmateriais: perfil2022 exige limVao e limBalanco (a Tabela 21 dá faixas; decisão de projeto)");
    return {
      nome: "NBR 7190-1:2022 — " + prod + ", " + car + ", umidade " + u, edicao: "2022", completo: true, fonteSecundaria: true,
      kmod: k1 * k2, kmodPartes: "kmod1 " + String(k1).replace(".", ",") + " (" + car + ") × kmod2 " + String(k2).replace(".", ",") + " (umidade " + u + ")",
      gw: { c: GAMA_2022.c, t: GAMA_2022.t, m: GAMA_2022.m, v: GAMA_2022.v }, flexaoPor: "fmd", fc90Fator: null,
      gamaG: o.gamaG || 1.4, gamaQ: o.gamaQ || 1.4, psi2: o.psi2 == null ? 0.4 : o.psi2, phi: phi,
      limVao: o.limVao, limBalanco: o.limBalanco, eRigidez: "E0m", flecha: "2022",
      kM: 0.7, betaC: prod === "serrada" ? 0.2 : 0.1,
      fonte: F22 + "; ações NBR 8681:2003 (γ 1,4 edificação tipo 2; ψ2 Tab. 6) — 8681:2025 vigente, não conferida"
    };
  };

  /** classe da 2022 ("nativa:D40", "peca:C24"…) */
  MadMateriais.classe2022 = function (id) {
    var c = CLASSES_2022[id];
    if (!c) throw new Error("madmateriais: classe 2022 desconhecida " + id + (/C25$/.test(id) ? " (C25 não existe na 7190-1:2022)" : ""));
    return c;
  };

  /** valores de cálculo (MPa) de uma classe da 2022 num perfil2022 */
  MadMateriais.resistencias2022 = function (classeId, perfil) {
    var c = MadMateriais.classe2022(classeId), p = perfil, k = p.kmod;
    var nat = c.origem === "nativa_cp";
    var fc0d = k * c.fc0k / p.gw.c;
    return {
      fc0d: fc0d, ft0d: nat ? fc0d : k * c.ft0k / p.gw.t, fmd: nat ? fc0d : k * c.fmk / p.gw.m, fvd: k * c.fvk / p.gw.v,
      fc90d: c.fc90k != null ? k * c.fc90k / p.gw.c : null, E0m: c.Ec0m, E005: c.E005, Eef: k * c.Ec0m, fc0k: c.fc0k,
      classe: c, perfil: p
    };
  };


  MadMateriais.classe = function (id) {
    var c = CLASSES_1997[id];
    if (!c) throw new Error("madmateriais: classe desconhecida " + id);
    return c;
  };

  MadMateriais.especie = function (id) {
    var e = ESPECIES[id];
    if (!e) throw new Error("madmateriais: espécie desconhecida " + id);
    return e;
  };

  /** perfil de cálculo; recusa perfil incompleto (sem texto de norma não se calcula calado) */
  MadMateriais.perfil = function (id) {
    var p = PERFIS[id];
    if (!p) throw new Error("madmateriais: perfil desconhecido " + id);
    if (!p.completo) throw new Error("madmateriais: perfil " + id + " incompleto — falta " + p.falta);
    return p;
  };

  /** kmod pela NBR 7190:1997 (produto dos três) */
  MadMateriais.kmod1997 = function (carregamento, umidade, categoria, grupo) {
    var k1 = KMOD1_1997[carregamento], k2 = KMOD2_1997[umidade];
    var k3 = grupo === "conifera" ? 0.8 : KMOD3_1997[categoria || "segunda"];
    if (k1 == null || k2 == null || k3 == null) throw new Error("madmateriais: kmod1997 com parâmetro inválido");
    return k1 * k2 * k3;
  };

  /** valores de cálculo de uma classe num perfil (MPa) */
  MadMateriais.resistencias = function (classeId, perfilId) {
    var c = MadMateriais.classe(classeId), p = MadMateriais.perfil(perfilId);
    var fc0d = p.kmod * c.fc0k / p.gw.c;
    return {
      fc0d: fc0d, ft0d: p.kmod * c.fc0k / 0.77 / p.gw.t, fvd: p.kmod * c.fvk / p.gw.v,
      fmd: p.flexaoPor === "fc0d" ? fc0d : null, fc90d: p.fc90Fator * fc0d,
      Eef: p.kmod * c.Ec0m, classe: c, perfil: p
    };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MadMateriais;
  else global.MadMateriais = MadMateriais;
})(typeof window !== "undefined" ? window : this);
