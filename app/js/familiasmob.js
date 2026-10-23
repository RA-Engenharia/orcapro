/* =====================================================================
 * familiasmob.js — BIBLIOTECA RA DE MOBILIÁRIO RESIDENCIAL (19/10/2026)
 *
 * Pedido do Rogério: distribuir móveis em todos os ambientes de uma casa contemporânea (estilo
 * caixote) para validar a arquitetura e gerar a planta humanizada, com peças de PROPORÇÃO e
 * DETALHE de produto (almofada, pé cônico, tampo com espessura, porta com friso, colchão +
 * cabeceira) e sem pesar a cena.
 *
 * COMO FUNCIONA. É uma família do js/familia.js com `geometria: "mob"`: os parâmetros, os tipos
 * (medidas de catálogo) e o quantitativo são os de qualquer família (Propriedades, tipo, instância);
 * a malha sai do gerador DESTE arquivo, com as ferramentas do js/mobgeo.js, e volta ao motor pelo
 * gancho `completar` (js/familia.js). As famílias entram na biblioteca por FamiliasRA.registrar.
 *
 * ORIGEM DAS PEÇAS (anotada na descrição de cada uma):
 *   · peça ENCOSTADA (sofá, rack, armário, cama, geladeira…): origem no PISO, no MEIO da largura,
 *     com o FUNDO da peça em Z = 0 e a frente em +Z — o ponto clicado é o da parede;
 *   · peça SOLTA (mesa, poltrona, ilha, tapete…): origem no PISO, no CENTRO da peça.
 * Giro (rotY) pelo posicionamento, como toda família.
 *
 * ⚠ REGRAS DA CASA (cada uma existe por um defeito que ela impede):
 *  1. Código de orçamento em BRANCO. Mobiliário não tem SINAPI: o quantitativo sai (unidade +
 *     quantidade) e a descrição diz "orçar à parte". Nunca inventar código nem preço.
 *  2. Medida de CATÁLOGO leva a fonte (tipo.fonte) e a data da consulta. Medida "usual de mercado" é
 *     dita assim na descrição do parâmetro — o engenheiro confere no modelo que for comprar.
 *  3. Nada de nome de cliente, endereço ou número de obra neste arquivo (test-cliente-nao-vaza).
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js");
  var PMov = dep("PartesMoveis", "partesmoveis.js");   /* porta, folha e gaveta que abrem (c.parte, js/mobgeo.js) */
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* ------------------------------------------------ MATERIAIS (nomes que o 3D conhece: js/bim.js FAM_PBR) */
  var MAT = {
    NOZ: "madeira nogueira", CLARA: "madeira clara", ESC: "madeira escura", DECK: "madeira deck", FREIJO: "madeira freijo",
    LACA: "laca branca", GRAFITE: "laca grafite", PRETO: "metal preto", INOX: "inox", CROMO: "metal cromado", LATAO: "latão",
    MARMORE: "marmore branco", QUARTZO: "quartzo branco", GRANITO: "granito preto", VIDRO: "vidro", ESPELHO: "espelho", FUME: "vidro fume",
    LOUCA: "louça branca", TELA: "tela preta", COURO: "couro caramelo", COLCHAO: "colchao", ROUPA: "roupa de cama", MANTA: "manta cinza",
    CONCRETO: "cimento queimado", TIJOLO: "tijolo refratario", PEDRA: "pedra cinza", ACRILICO: "acrilico branco", BORRACHA: "borracha preta",
    PALHA: "palha natural", LINHO: "linho natural", TERRA: "terra", CERAMICA: "ceramica terracota"
  };
  var TECIDOS = ["tecido cinza", "tecido bege", "tecido grafite", "tecido verde", "tecido terracota", "tecido azul", "linho natural", "couro caramelo"];

  var LISTA = [], GER = {}, SIMB = {};
  function P(nome, tipoDado, valor, grupo, descricao, escopo) {
    var o = { nome: nome, tipoDado: tipoDado, escopo: escopo || "tipo", valor: valor, grupo: grupo || "Dimensões" };
    if (descricao) o.descricao = descricao;
    return o;
  }
  function T(id, nome, valores, fonte) { var t = { id: id, nome: nome, valores: valores || {} }; if (fonte) t.fonte = fonte; return t; }
  var USUAL = "Medida usual de mercado — conferir o modelo comprado.";
  var ORIGEM_ENC = " Origem: no piso, no meio da largura, com o FUNDO em Z = 0 (encostar na parede) e a frente em +Z.";
  var ORIGEM_CEN = " Origem: no piso, no centro da peça.";
  var APARTE = " Mobiliário não tem composição SINAPI: orçar à parte (quantitativo em unidade).";

  /* def({id, nome, categoria, descricao, parametros, tipos, gerar, unidade, quantidade, quantDesc}) */
  function def(o) {
    var fam = {
      id: o.id, previa: "modelador", nome: o.nome, categoria: o.categoria || "mobiliario", hospedagem: "livre", geometria: "mob", mob: o.id, disciplina: "mobiliario",
      descricao: o.descricao + (o.semOrigem ? "" : (o.centro ? ORIGEM_CEN : ORIGEM_ENC)) + APARTE,
      parametros: o.parametros, tipos: o.tipos,
      quantitativo: { unidade: o.unidade || "un", quantidade: o.quantidade || "1", codigo: "", fonte: "", descricao: (o.quantDesc || o.nome) + " (orçar à parte)" }
    };
    if (o.fonteGeral) fam.fonteMedidas = o.fonteGeral;
    /* PARTES MÓVEIS: a peça com porta/gaveta carrega o estado Aberto/Abertura na instância (o mesmo da pele de vidro); não entra no orçamento */
    if (o.moveis && PMov) fam.parametros = fam.parametros.concat(PMov.parametrosEstado());
    LISTA.push(fam); GER[o.id] = o.gerar; if (o.simbolo) SIMB[o.id] = o.simbolo;
    return fam;
  }

  /* ------------------------------------------------ PEÇAS COMUNS */
  var H = {};
  /* porta de armário: "liso" ou "friso" (moldura em relevo e miolo rebaixado). Frente em +Z; x,y,z = centro/base/face de trás */
  H.porta = function (c, mat, x, y, z, w, h, esp, estilo) {
    if (estilo === "friso" && w > 0.2 && h > 0.2) {
      var f = Math.min(0.06, w / 5), mi = esp * 0.55;
      c.caixa(mat, x, y, z, w, h, mi);
      c.caixa(mat, x, y, z + mi * 0.0, w, f, esp); c.caixa(mat, x, y + h - f, z, w, f, esp);
      c.caixa(mat, x - w / 2 + f / 2, y + f, z, f, h - 2 * f, esp); c.caixa(mat, x + w / 2 - f / 2, y + f, z, f, h - 2 * f, esp);
    } else c.caixaR(mat, x, y, z, w, h, esp, Math.min(0.006, esp / 2.5), { k: 1 });
  };
  /* puxador de barra (cilindro deitado) — vertical (eixo y) ou horizontal (eixo x) */
  H.puxador = function (c, x, y, z, comp, vertical, mat) {
    mat = mat || MAT.PRETO;
    if (vertical) { c.cil(mat, x, y - comp / 2, z + 0.03, 0.008, comp, { seg: 8 }); c.cil(mat, x, y - comp / 2 + 0.03, z, 0.005, 0.03, { seg: 6, rotX: 90, centro: true }); c.cil(mat, x, y + comp / 2 - 0.03, z, 0.005, 0.03, { seg: 6, rotX: 90, centro: true }); }
    else { c.cilH(mat, x, y, z + 0.03, 0.008, comp, "x", { seg: 8 }); c.cilH(mat, x - comp / 2 + 0.03, y, z + 0.015, 0.005, 0.03, "z", { seg: 6 }); c.cilH(mat, x + comp / 2 - 0.03, y, z + 0.015, 0.005, 0.03, "z", { seg: 6 }); }
  };
  /* puxador cava (reentrância preta fina) */
  H.cava = function (c, x, y, z, comp, mat) { c.caixa(mat || MAT.PRETO, x, y, z, comp, 0.012, 0.012); };
  /* ------------------------------------------------ PARTES MÓVEIS (porta, folha, gaveta — js/partesmoveis.js)
   * O 3D abre a parte no clique. Tudo o que `fn` desenha vira a parte; as coordenadas do eixo são as da PEÇA (as mesmas do desenho).
   *   H.giro(c, id, hx, hy, hz, lado, fn[, ang])  porta de giro que abre para a FRENTE (+Z): (hx, hz) = a dobradiça (borda da folha, meio da
   *       espessura), hy = meio da altura; lado = -1 dobradiça à ESQUERDA (a folha vai para +X) ou +1 à direita. Abre 105° (porta de armário).
   *   H.gaveta(c, id, curso, fn)                  gaveta que sai para a frente (+Z) o `curso` (= profundidade da gaveta x fração).
   *   H.correr(c, id, dx, fn)                     folha de correr: anda `dx` em X (o sinal manda; o curso é |dx|).
   *   H.gavetaCaixa(c, mat, x, y, zFrente, w, h, prof)  o corpo da gaveta (fundo, laterais, traseira) atrás da frente — anda junto. */
  H.giro = function (c, id, hx, hy, hz, lado, fn, ang) { c.parte(id, { tipo: "giro", eixo: [hx, hy, hz], angulo: ang || 105, sentido: lado < 0 ? -1 : 1 }, fn); };
  H.gaveta = function (c, id, curso, fn) { c.parte(id, { tipo: "gaveta", vetor: [0, 0, 1], curso: curso }, fn); };
  H.correr = function (c, id, dx, fn) { c.parte(id, { tipo: "correr", vetor: [dx < 0 ? -1 : 1, 0, 0], curso: Math.abs(dx) }, fn); };
  H.gavetaCaixa = function (c, mat, x, y, zf, w, h, prof) {
    var e = 0.012, ww = Math.max(0.05, w - 0.05), hh = Math.max(0.04, h - 0.05), pp = Math.max(0.08, prof);
    c.caixa(mat, x, y + 0.02, zf - pp / 2, ww, e, pp);                                              // fundo
    c.caixa(mat, x - ww / 2 + e / 2, y + 0.02, zf - pp / 2, e, hh, pp); c.caixa(mat, x + ww / 2 - e / 2, y + 0.02, zf - pp / 2, e, hh, pp);   // laterais
    c.caixa(mat, x, y + 0.02, zf - pp + e / 2, ww, hh, e);                                           // traseira
  };
  /* pé de móvel afunilado */
  H.pe = function (c, mat, x, z, alt, topo, base, giroX, giroZ) { c.tronco(mat, x, 0, z, base, base, topo, topo, alt, { rotX: giroX, rotZ: giroZ }); };
  /* almofada de decoração */
  H.almofada = function (c, mat, x, y, z, lado, giroY, inclina) { c.caixaR(mat, x, y, z, lado, lado, lado * 0.28, lado * 0.12, { k: 2, rotY: giroY || 0, rotX: inclina == null ? -12 : inclina }); };
  /* cadeira de jantar estofada, olhando para +Z (o assento voltado para +Z, o encosto em −Z) */
  H.cadeiraJantar = function (c, tec, madeira) {
    var L = 0.46, hA = 0.46;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.tronco(madeira, s[0] * (L / 2 - 0.03), 0, s[1] * (L / 2 - 0.03), 0.045, 0.045, 0.03, 0.03, hA - 0.07, { rotX: s[1] * -4, rotZ: s[0] * 4 }); });
    c.caixaR(madeira, 0, hA - 0.07, 0, L, 0.035, L, 0.008, { k: 1 });
    c.caixaR(tec, 0, hA - 0.035, 0.005, L - 0.02, 0.06, L - 0.02, 0.025);
    c.caixaR(madeira, -L / 2 + 0.03, hA - 0.035, -L / 2 + 0.03, 0.04, 0.46, 0.035, 0.008, { k: 1, rotX: 8 });
    c.caixaR(madeira, L / 2 - 0.03, hA - 0.035, -L / 2 + 0.03, 0.04, 0.46, 0.035, 0.008, { k: 1, rotX: 8 });
    c.caixaR(tec, 0, hA + 0.14, -L / 2 + 0.05, L - 0.06, 0.30, 0.05, 0.02, { rotX: 8 });
  };
  H.MAT = MAT; H.TECIDOS = TECIDOS; H.P = P; H.T = T; H.def = def; H.USUAL = USUAL; H.clamp = clamp; H.num = num;

  /* ================================================================ SALA */
  var P_TEC = function (padrao) { return P("Tecido", "material", padrao || "tecido cinza", "Materiais", "Revestimento do estofado: " + TECIDOS.join(", ") + "."); };

  /* ---- sofá reto e em L ---- */
  function gerarSofa(c, v, emL) {
    var W = v.Largura, D = v.Profundidade, Ht = v.Altura, hs = v.Altura_assento, br = v.Braco, n = Math.max(1, Math.round(v.Lugares)), tec = v.Tecido, madeira = v.Pe;
    var peH = 0.13, cushT = 0.17, cushY = hs - cushT + 0.01, ha = hs + 0.17;
    var Wc = emL ? clamp(v.Largura_chaise, 0.7, W - 2 * br - 0.5) : 0, Lc = emL ? Math.max(v.Comprimento_chaise, D + 0.2) : D;
    var lado = String(v.Lado_chaise).toLowerCase() === "esquerda" ? -1 : 1;
    // pés
    var ptsPe = [[-W / 2 + 0.1, 0.1], [W / 2 - 0.1, 0.1], [-W / 2 + 0.1, D - 0.1], [W / 2 - 0.1, D - 0.1]];
    if (emL) { ptsPe.push([lado * (W / 2 - 0.1), Lc - 0.1]); ptsPe.push([lado * (W / 2 - Wc + 0.1), Lc - 0.1]); }
    ptsPe.forEach(function (p) { c.tronco(madeira, p[0], 0, p[1], 0.05, 0.05, 0.036, 0.036, peH + 0.01, { rotX: 0 }); });
    // estrutura (caixa baixa) e braços
    c.caixaR(tec, 0, peH, D / 2, W, cushY - peH, D, 0.03, { k: 1 });
    if (emL) c.caixaR(tec, lado * (W / 2 - Wc / 2), peH, (D + Lc) / 2 - 0.0, Wc, cushY - peH, Lc - D + 0.02, 0.03, { k: 1 });
    [-1, 1].forEach(function (s) {
      var comprim = (emL && s === lado) ? Lc : D;
      c.caixaR(tec, s * (W / 2 - br / 2), peH, comprim / 2, br, ha - peH, comprim, Math.min(0.05, br / 3));
    });
    // encosto: estrutura + almofadas inclinadas
    var wi = W - 2 * br;
    c.caixaR(tec, 0, cushY, 0.095, wi, Ht - 0.1 - cushY, 0.19, 0.04, { k: 1 });
    var wn = wi / n;
    for (var i = 0; i < n; i++) {
      var xi = -wi / 2 + wn * (i + 0.5);
      c.caixaR(tec, xi, cushY + cushT - 0.02, 0.28, wn - 0.012, Ht - 0.04 - (cushY + cushT - 0.02), 0.17, 0.06, { rotX: -9 });
      c.caixaR(tec, xi, cushY, 0.19 + (D - 0.19) / 2, wn - 0.012, cushT, D - 0.19 - 0.015, 0.055);
    }
    if (emL) {   // chaise: almofada comprida
      var xc = lado * (W / 2 - br - Wc / 2 + br / 2);
      c.caixaR(tec, lado * (W / 2 - Wc / 2 - br / 2 + 0.005), cushY, D + (Lc - D) / 2 + 0.005, Wc - br - 0.012, cushT, Lc - D + 0.02, 0.055);
    }
    // almofadas de decoração
    var na = Math.max(0, Math.round(v.Almofadas)), cor = v.Cor_almofada;
    for (var k = 0; k < na; k++) {
      var sg = (k % 2 === 0) ? -1 : 1, off = Math.floor(k / 2) * 0.19;
      H.almofada(c, cor, sg * (wi / 2 - 0.27 - off), hs + 0.02, 0.36 + (k % 3) * 0.02, 0.42, sg * -14, -14);
    }
  }
  var PAR_SOFA = function (L) {
    return [P("Largura", "comprimento", L, "Dimensões", "Largura total, com os braços. " + USUAL), P("Profundidade", "comprimento", 0.95, "Dimensões", USUAL), P("Altura", "comprimento", 0.88, "Dimensões", "Até o topo do encosto. " + USUAL),
      P("Altura_assento", "comprimento", 0.45, "Dimensões", "Do piso ao topo da almofada do assento. " + USUAL), P("Braco", "comprimento", 0.16, "Dimensões", "Largura de cada braço"),
      P("Lugares", "inteiro", 3, "Dimensões", "Almofadas de assento e encosto"), P("Almofadas", "inteiro", 2, "Construção", "Almofadas de decoração (0 a 4)"),
      P_TEC("tecido cinza"), P("Cor_almofada", "material", "tecido terracota", "Materiais"), P("Pe", "material", "madeira escura", "Materiais", "Material dos pés")];
  };
  def({
    id: "ra-mob-sofa-reto", nome: "Sofá reto 2 a 4 lugares", descricao: "Sofá estofado com estrutura baixa, braços, almofadas de assento e encosto inclinado, almofadas de decoração e pés cônicos.",
    parametros: PAR_SOFA(2.10),
    tipos: [T("s2", "2 lugares — 1,60 m", { Largura: 1.60, Lugares: 2, Almofadas: 2 }), T("s3", "3 lugares — 2,10 m", {}), T("s3g", "3 lugares — 2,30 m", { Largura: 2.30 }), T("s4", "4 lugares — 2,60 m", { Largura: 2.60, Lugares: 4, Almofadas: 4 })],
    gerar: function (c, v) { gerarSofa(c, v, false); }
  });
  def({
    id: "ra-mob-sofa-l", nome: "Sofá em L com chaise", descricao: "Sofá com chaise comprida em uma das pontas. O lado e o tamanho da chaise são parâmetros.",
    parametros: PAR_SOFA(2.80).concat([P("Largura_chaise", "comprimento", 1.00, "Dimensões", "Largura da chaise"), P("Comprimento_chaise", "comprimento", 1.60, "Dimensões", "Profundidade total até a ponta da chaise"), P("Lado_chaise", "texto", "direita", "Construção", "direita ou esquerda (vista de frente)", "instancia")]),
    tipos: [T("l260", "Chaise à direita — 2,60 m", { Largura: 2.60, Lugares: 3 }), T("l280", "Chaise à direita — 2,80 m", { Lugares: 3 }), T("l320", "Chaise à direita — 3,20 m", { Largura: 3.20, Lugares: 4, Almofadas: 4 }), T("l280e", "Chaise à esquerda — 2,80 m", { Lado_chaise: "esquerda" })],
    gerar: function (c, v) { gerarSofa(c, v, true); }
  });

  /* ---- poltrona ---- */
  def({
    id: "ra-mob-poltrona", centro: true, nome: "Poltrona", descricao: "Poltrona estofada com braços, assento e encosto de almofada e pés de madeira abertos.",
    parametros: [P("Largura", "comprimento", 0.80, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.85, "Dimensões", USUAL), P("Altura", "comprimento", 0.85, "Dimensões", USUAL), P("Altura_assento", "comprimento", 0.43, "Dimensões"), P_TEC("tecido bege"), P("Pe", "material", "madeira nogueira", "Materiais")],
    tipos: [T("p80", "80 × 85 cm", {}), T("p70", "70 × 75 cm (compacta)", { Largura: 0.70, Profundidade: 0.75, Altura: 0.82 })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, hs = v.Altura_assento, tec = v.Tecido, mp = v.Pe, br = 0.14;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.cil(mp, s[0] * (W / 2 - 0.1), 0, s[1] * (D / 2 - 0.1), 0.028, 0.2, { r2: 0.02, rotX: s[1] * 7, rotZ: -s[0] * 7, seg: 10 }); });
      c.caixaR(tec, 0, 0.17, 0, W, hs - 0.17 - 0.12, D, 0.04, { k: 1 });
      c.caixaR(tec, 0, hs - 0.14, 0.04, W - 2 * br, 0.15, D - 0.14, 0.06);
      [-1, 1].forEach(function (s) { c.caixaR(tec, s * (W / 2 - br / 2), 0.17, 0, br, hs + 0.13 - 0.17, D, 0.05); });
      c.caixaR(tec, 0, hs - 0.05, -D / 2 + 0.1, W - 2 * br + 0.02, Ht - hs + 0.03, 0.2, 0.07, { rotX: -12 });
    }
  });

  /* ---- mesa de centro ---- */
  def({
    id: "ra-mob-mesa-centro", centro: true, nome: "Mesa de centro", descricao: "Mesa baixa com tampo de espessura real e estrutura em metal ou madeira. Formato redondo, oval ou retangular.",
    parametros: [P("Formato", "texto", "retangular", "Dimensões", "retangular, redonda ou oval"), P("Largura", "comprimento", 1.00, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.60, "Dimensões"), P("Altura", "comprimento", 0.40, "Dimensões"), P("Espessura_tampo", "comprimento", 0.03, "Dimensões"),
      P("Tampo", "material", "marmore branco", "Materiais"), P("Estrutura", "material", "metal preto", "Materiais")],
    tipos: [T("r100", "Retangular 1,00 × 0,60", {}), T("r120", "Retangular 1,20 × 0,70 (marmore)", { Largura: 1.20, Profundidade: 0.70, Altura: 0.38 }), T("o90", "Redonda Ø 0,90", { Formato: "redonda", Largura: 0.90, Profundidade: 0.90, Altura: 0.38, Estrutura: "madeira escura", Tampo: "madeira nogueira" }), T("ov", "Oval 1,10 × 0,70", { Formato: "oval", Largura: 1.10, Profundidade: 0.70, Altura: 0.38 })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Hh = v.Altura, e = v.Espessura_tampo, f = String(v.Formato).toLowerCase();
      if (f === "redonda" || f === "oval") {
        var ct = Mob.contornoElipse(W / 2, D / 2, 40);
        c.prisma(v.Tampo, 0, Hh - e, 0, ct, e);
        c.torno(v.Estrutura, 0, 0, 0, [[0.16, 0], [0.16, 0.012], [0.06, 0.03], [0.05, Hh - e - 0.02], [0.2, Hh - e]], { seg: 20, ez: D / W });
      } else {
        c.caixaR(v.Tampo, 0, Hh - e, 0, W, e, D, 0.006, { k: 1 });
        [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { c.caixa(v.Estrutura, s * (W / 2 - 0.06), 0, t * (D / 2 - 0.06), 0.025, Hh - e, 0.025); }); });
        c.caixa(v.Estrutura, 0, Hh - e - 0.03, D / 2 - 0.06, W - 0.1, 0.025, 0.025); c.caixa(v.Estrutura, 0, Hh - e - 0.03, -D / 2 + 0.06, W - 0.1, 0.025, 0.025);
        c.caixa(v.Estrutura, W / 2 - 0.06, Hh - e - 0.03, 0, 0.025, 0.025, D - 0.1); c.caixa(v.Estrutura, -W / 2 + 0.06, Hh - e - 0.03, 0, 0.025, 0.025, D - 0.1);
      }
    }
  });

  /* ---- rack + painel + TV ---- */
  def({
    id: "ra-mob-rack-tv", moveis: true, nome: "Rack com painel e TV", descricao: "Rack suspenso com portas e nicho, painel de fundo com ripas e TV. A TV tem as proporções 16:9 da polegada escolhida (largura = 0,8719 × diagonal; altura = 0,4905 × diagonal).",
    parametros: [P("Comprimento", "comprimento", 1.80, "Dimensões", "Comprimento do rack. " + USUAL), P("Profundidade", "comprimento", 0.40, "Dimensões"), P("Altura_rack", "comprimento", 0.40, "Dimensões"), P("Altura_pe", "comprimento", 0.20, "Dimensões", "Vão livre sob o rack (suspenso)"),
      P("TV_polegadas", "inteiro", 55, "TV", "Diagonal da tela, em polegadas"), P("Altura_centro_tv", "comprimento", 1.10, "TV", "Do piso ao centro da tela", "instancia"),
      P("Painel_largura", "comprimento", 2.40, "Painel"), P("Painel_altura", "comprimento", 2.40, "Painel", "Do piso ao topo do painel"), P("Painel_ripado", "simnao", true, "Painel"),
      P("Rack", "material", "madeira nogueira", "Materiais"), P("Painel", "material", "madeira freijo", "Materiais")],
    tipos: [T("r180", "Rack 1,80 + TV 55\"", {}), T("r220", "Rack 2,20 + TV 65\"", { Comprimento: 2.20, TV_polegadas: 65, Painel_largura: 2.80 }), T("r260", "Rack 2,60 + TV 75\"", { Comprimento: 2.60, TV_polegadas: 75, Painel_largura: 3.20 }), T("r150", "Rack 1,50 + TV 50\"", { Comprimento: 1.50, TV_polegadas: 50, Painel_largura: 2.00 })],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, h = v.Altura_rack, y0 = v.Altura_pe, pw = v.Painel_largura, ph = v.Painel_altura;
      var dg = v.TV_polegadas * 0.0254, tw = dg * 0.8719, th = dg * 0.4905, yc = v.Altura_centro_tv;
      // painel de fundo + ripas
      c.caixa(v.Painel, 0, 0, 0.0125, pw, ph, 0.025);
      if (v.Painel_ripado) { var nr = Math.floor(pw / 0.075); for (var i = 0; i < nr; i++) c.caixa(v.Painel, -pw / 2 + 0.0375 + i * 0.075 + (pw - nr * 0.075) / 2, 0.0, 0.025 + 0.0125, 0.04, ph, 0.025); }
      else c.caixa(MAT.LACA, 0, 0, 0.03, pw, ph, 0.006);
      // rack suspenso: caixa + 3 módulos
      var zc = 0.05 + D / 2;
      c.caixaR(v.Rack, 0, y0, zc, L, h, D, 0.006, { k: 1 });
      var nm = Math.max(2, Math.round(L / 0.6)), wm = L / nm;
      for (var m = 0; m < nm; m++) {
        var xm = -L / 2 + wm * (m + 0.5);
        if (m === 1 && nm >= 3) { c.caixa(MAT.GRAFITE, xm, y0 + 0.02, 0.05 + 0.02, wm - 0.03, h - 0.04, D - 0.04); continue; }   // nicho aberto
        var wpR = wm - 0.012, ladoR = m % 2 ? 1 : -1;
        H.giro(c, "porta" + (m + 1), xm + ladoR * wpR / 2, y0 + h / 2, 0.05 + D + 0.009, ladoR, function () { H.porta(c, v.Rack, xm, y0 + 0.01, 0.05 + D, wpR, h - 0.02, 0.018, "liso"); H.cava(c, xm, y0 + h - 0.045, 0.05 + D + 0.018, 0.12); });
      }
      c.caixa(MAT.PRETO, 0, y0 - 0.02, zc, L - 0.08, 0.02, D - 0.1);
      // TV
      var tz = 0.05 + 0.02;
      c.caixaR(MAT.PRETO, 0, yc - th / 2, tz + 0.01, tw, th, 0.04, 0.008, { k: 1 });
      c.caixa(MAT.TELA, 0, yc - th / 2 + 0.01, tz + 0.0305, tw - 0.02, th - 0.02, 0.003);
    }
  });

  /* ---- aparador ---- */
  def({
    id: "ra-mob-aparador", moveis: true, nome: "Aparador", descricao: "Aparador baixo com portas de friso, gavetas e pés cônicos.",
    parametros: [P("Comprimento", "comprimento", 1.60, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.45, "Dimensões"), P("Altura", "comprimento", 0.80, "Dimensões"), P("Altura_pe", "comprimento", 0.15, "Dimensões"),
      P("Corpo", "material", "madeira nogueira", "Materiais"), P("Tampo", "material", "marmore branco", "Materiais")],
    tipos: [T("a160", "1,60 m", {}), T("a120", "1,20 m", { Comprimento: 1.20 }), T("a200", "2,00 m", { Comprimento: 2.00 })],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, Ht = v.Altura, y0 = v.Altura_pe, e = 0.025;
      [[-1, 0.08], [1, 0.08], [-1, D - 0.08], [1, D - 0.08]].forEach(function (s) { c.tronco(MAT.PRETO, s[0] * (L / 2 - 0.1), 0, s[1], 0.04, 0.04, 0.028, 0.028, y0, { rotZ: 0 }); });
      c.caixaR(v.Corpo, 0, y0, D / 2, L - 0.02, Ht - y0 - e, D - 0.02, 0.005, { k: 1 });
      c.caixaR(v.Tampo, 0, Ht - e, D / 2, L, e, D, 0.004, { k: 1 });
      var nm = Math.max(2, Math.round(L / 0.55)), wm = (L - 0.04) / nm;
      for (var m = 0; m < nm; m++) {
        var xm = -(L - 0.04) / 2 + wm * (m + 0.5), wpA = wm - 0.008, ladoA = m % 2 ? 1 : -1;   // o puxador fica do lado oposto à dobradiça
        H.giro(c, "porta" + (m + 1), xm + ladoA * wpA / 2, y0 + (Ht - y0 - e) / 2, D + 0.01, ladoA, function () {
          H.porta(c, v.Corpo, xm, y0 + 0.02, D, wpA, Ht - y0 - e - 0.04, 0.02, "friso"); H.puxador(c, xm + (m % 2 ? -1 : 1) * (wm / 2 - 0.05), y0 + (Ht - y0) * 0.55, D + 0.02, 0.1, true);
        });
      }
    }
  });

  /* ---- tapete ---- */
  def({
    id: "ra-mob-tapete", centro: true, nome: "Tapete", descricao: "Tapete retangular ou redondo com bordas e miolo em tons diferentes (dá a leitura de tapete na planta humanizada).",
    parametros: [P("Formato", "texto", "retangular", "Dimensões", "retangular ou redondo"), P("Largura", "comprimento", 2.00, "Dimensões"), P("Profundidade", "comprimento", 3.00, "Dimensões"), P("Espessura", "comprimento", 0.012, "Dimensões"), P("Miolo", "material", "tecido bege", "Materiais"), P("Borda", "material", "tecido grafite", "Materiais")],
    tipos: [T("t2030", "2,00 × 3,00 m", {}), T("t1520", "1,50 × 2,00 m", { Largura: 1.50, Profundidade: 2.00 }), T("t2535", "2,50 × 3,50 m", { Largura: 2.50, Profundidade: 3.50 }), T("tr20", "Redondo Ø 2,00 m", { Formato: "redondo", Largura: 2.00, Profundidade: 2.00 })],
    unidade: "m2", quantidade: "Largura * Profundidade",
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, e = v.Espessura, b = Math.min(0.06, Math.min(W, D) / 8);
      if (String(v.Formato).toLowerCase() === "redondo") { c.prisma(v.Borda, 0, 0, 0, Mob.contornoElipse(W / 2, D / 2, 40), e); c.prisma(v.Miolo, 0, 0.0005, 0, Mob.contornoElipse(W / 2 - b, D / 2 - b, 40), e + 0.001); }
      else { c.caixaR(v.Borda, 0, 0, 0, W, e, D, 0.004, { k: 1 }); c.caixa(v.Miolo, 0, 0.0005, 0, W - 2 * b, e + 0.001, D - 2 * b); }
    }
  });

  /* ================================================================ JANTAR */
  def({
    id: "ra-mob-mesa-jantar", centro: true, nome: "Mesa de jantar com cadeiras (4, 6 ou 8 lugares)", descricao: "Mesa com tampo de madeira, pés cônicos e as cadeiras estofadas em volta (4: duas por lado; 6: duas por lado e uma em cada cabeceira; 8: três por lado e uma em cada cabeceira). O comprimento da mesa é do tipo.",
    parametros: [P("Comprimento", "comprimento", 1.80, "Dimensões", USUAL), P("Largura", "comprimento", 0.90, "Dimensões"), P("Altura", "comprimento", 0.75, "Dimensões", "Altura usual de mesa de refeição"), P("Lugares", "inteiro", 6, "Construção", "4, 6 ou 8"),
      P("Tampo", "material", "madeira nogueira", "Materiais"), P("Tecido", "material", "tecido bege", "Materiais", "Estofado das cadeiras"), P("Pe", "material", "madeira escura", "Materiais")],
    tipos: [T("j4", "4 lugares — 1,40 × 0,90", { Comprimento: 1.40, Lugares: 4 }), T("j6", "6 lugares — 1,80 × 0,90", {}), T("j8", "8 lugares — 2,40 × 1,00", { Comprimento: 2.40, Largura: 1.00, Lugares: 8 })],
    gerar: function (c, v) {
      var L = v.Comprimento, W = v.Largura, Ht = v.Altura, e = 0.04, lug = Math.round(v.Lugares);
      c.caixaR(v.Tampo, 0, Ht - e, 0, L, e, W, 0.012);
      c.caixa(v.Pe, 0, Ht - e - 0.06, 0, L - 0.5, 0.06, 0.07);
      [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { c.tronco(v.Pe, s * (L / 2 - 0.2), 0, t * (W / 2 - 0.12), 0.075, 0.075, 0.05, 0.05, Ht - e - 0.0); }); });
      var porLado = lug >= 8 ? 3 : 2, ends = lug >= 6;
      for (var i = 0; i < porLado; i++) {
        var x = (-0.5 + (i + 0.5) / porLado) * (L - 0.35);
        c.grupo(x, 0, -W / 2 - 0.02, 0, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); });
        c.grupo(x, 0, W / 2 + 0.02, 180, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); });
      }
      if (ends) { c.grupo(-L / 2 - 0.02, 0, 0, 90, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); }); c.grupo(L / 2 + 0.02, 0, 0, -90, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); }); }
    }
  });
  def({
    id: "ra-mob-banqueta", centro: true, nome: "Banqueta alta", descricao: "Banqueta de ilha com assento estofado, travessa para os pés e pernas de metal.",
    parametros: [P("Altura_assento", "comprimento", 0.65, "Dimensões", "Balcão de 0,90 m: assento a 0,65 m. " + USUAL), P("Diametro", "comprimento", 0.36, "Dimensões"), P("Tecido", "material", "couro caramelo", "Materiais"), P("Estrutura", "material", "metal preto", "Materiais")],
    tipos: [T("b65", "Assento a 0,65 m (balcão 0,90)", {}), T("b75", "Assento a 0,75 m (balcão 1,05)", { Altura_assento: 0.75 }), T("b45", "Assento a 0,45 m (mesa)", { Altura_assento: 0.45 })],
    gerar: function (c, v) { H.banqueta(c, v.Altura_assento, v.Diametro, v.Tecido, v.Estrutura); }
  });
  H.banqueta = function (c, hs, d, tec, es) {
    var r = d / 2;
    [0, 90, 180, 270].forEach(function (g) { var a = g * Math.PI / 180; c.cil(es, Math.cos(a) * (r - 0.04), 0, Math.sin(a) * (r - 0.04), 0.014, hs - 0.05, { r2: 0.011, rotZ: -Math.cos(a) * 5, rotX: Math.sin(a) * 5, seg: 8 }); });
    c.torno(es, 0, hs * 0.32, 0, [[r - 0.03, 0], [r - 0.03, 0.015], [r - 0.045, 0.015], [r - 0.045, 0]], { seg: 24 });
    c.cil(es, 0, hs - 0.06, 0, r - 0.02, 0.02, { seg: 24 });
    c.torno(tec, 0, hs - 0.05, 0, [[0, 0], [r, 0.0], [r, 0.04], [r - 0.02, 0.05], [0, 0.055]], { seg: 28 });
  };

  /* ================================================================ QUARTO */
  /* colchões usuais no Brasil (cm): solteiro 88 × 188; casal padrão 138 × 188; queen 158 × 198; king 193 × 203 */
  var FONTE_COLCHAO = "Medidas usuais de colchão no mercado brasileiro (solteiro 88×188, casal 138×188, queen 158×198, king 193×203 cm) — conferir o fabricante do colchão comprado; não verificado em catálogo único.";
  def({
    id: "ra-mob-cama", nome: "Cama com cabeceira e colchão", descricao: "Base box baú, colchão, roupa de cama (lençol, edredom dobrado no pé e travesseiros) e cabeceira estofada. Solteiro, casal, queen e king.",
    parametros: [P("Largura_colchao", "comprimento", 1.58, "Dimensões", "Largura do colchão. " + FONTE_COLCHAO), P("Comprimento_colchao", "comprimento", 1.98, "Dimensões"), P("Altura_base", "comprimento", 0.30, "Dimensões", "Altura da base box (do piso ao topo)"), P("Altura_colchao", "comprimento", 0.26, "Dimensões"),
      P("Altura_cabeceira", "comprimento", 1.10, "Dimensões", "Do piso ao topo da cabeceira"), P("Travesseiros", "inteiro", 2, "Construção"),
      P("Base", "material", "tecido grafite", "Materiais"), P("Cabeceira", "material", "tecido bege", "Materiais"), P("Roupa", "material", "roupa de cama", "Materiais"), P("Edredom", "material", "manta cinza", "Materiais")],
    tipos: [T("sol", "Solteiro 0,88 × 1,88", { Largura_colchao: 0.88, Comprimento_colchao: 1.88, Travesseiros: 1, Altura_cabeceira: 1.00 }, FONTE_COLCHAO), T("cas", "Casal 1,38 × 1,88", { Largura_colchao: 1.38, Comprimento_colchao: 1.88 }, FONTE_COLCHAO), T("que", "Queen 1,58 × 1,98", {}, FONTE_COLCHAO), T("kin", "King 1,93 × 2,03", { Largura_colchao: 1.93, Comprimento_colchao: 2.03, Travesseiros: 4 }, FONTE_COLCHAO)],
    gerar: function (c, v) {
      var W = v.Largura_colchao, L = v.Comprimento_colchao, hb = v.Altura_base, hc = v.Altura_colchao, hh = v.Altura_cabeceira, zc = 0.10 + L / 2 + 0.01;
      var Wb = W + 0.06, topo = hb + hc;
      c.caixaR(v.Cabeceira, 0, 0.0, 0.05, Wb + 0.16, hh, 0.10, 0.04, { k: 2 });
      c.caixaR(v.Base, 0, 0.08, zc + 0.02, Wb, hb - 0.08, L + 0.06, 0.025);
      [[-1, 0.1], [1, 0.1], [-1, L], [1, L]].forEach(function (s) { c.cil(MAT.PRETO, s[0] * (Wb / 2 - 0.06), 0, s[1] + 0.1, 0.03, 0.08, { r2: 0.022, seg: 10 }); });
      c.caixaR(MAT.COLCHAO, 0, hb, zc, W, hc, L, 0.06);
      c.caixaR(v.Roupa, 0, hb + hc - 0.03, zc, W + 0.02, 0.045, L - 0.01, 0.02);                                  // lençol sobre o colchão
      var ze = L * 0.64 + 0.04, zce = zc + L / 2 + 0.03 - ze / 2;                                                    // edredom: do meio da cama até um pouco além do pé
      c.caixaR(v.Edredom, 0, hb + hc - 0.005, zce, W + 0.05, 0.07, ze, 0.035);
      [-1, 1].forEach(function (s) { c.caixaR(v.Edredom, s * (W / 2 + 0.035), hb + 0.06, zce, 0.045, hc - 0.05, ze, 0.02); });   // caimento nas laterais
      c.caixaR(v.Edredom, 0, hb + hc + 0.05, zc + L / 2 - 0.2, W + 0.03, 0.08, 0.34, 0.04);                         // dobra no pé da cama
      var nt = Math.round(v.Travesseiros);
      for (var i = 0; i < nt; i++) {
        var col = nt === 1 ? 0 : (i % 2 ? 1 : -1), linha = Math.floor(i / 2), larg = nt === 1 ? 0.6 : (W - 0.1) / (nt > 2 ? 2 : nt) - 0.05;
        c.caixaR(v.Roupa, nt === 1 ? 0 : col * (W / 4), topo - 0.01, 0.10 + 0.34 + linha * 0.0 + (nt > 2 && i >= 2 ? 0.28 : 0), Math.min(0.7, larg), 0.14, 0.38, 0.06, { rotX: -7 });
      }
    }
  });
  def({
    id: "ra-mob-criado", moveis: true, nome: "Criado-mudo", descricao: "Criado-mudo com duas gavetas, puxador cava e pés cônicos.",
    parametros: [P("Largura", "comprimento", 0.50, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.40, "Dimensões"), P("Altura", "comprimento", 0.50, "Dimensões", "Em geral na altura do colchão. " + USUAL), P("Altura_pe", "comprimento", 0.15, "Dimensões"), P("Corpo", "material", "madeira nogueira", "Materiais")],
    tipos: [T("c50", "50 × 40 × 50", {}), T("c40", "40 × 35 × 45", { Largura: 0.40, Profundidade: 0.35, Altura: 0.45 })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, y0 = v.Altura_pe, h = Ht - y0;
      [[-1, 0.06], [1, 0.06], [-1, D - 0.06], [1, D - 0.06]].forEach(function (s) { c.tronco(MAT.PRETO, s[0] * (W / 2 - 0.05), 0, s[1], 0.035, 0.035, 0.025, 0.025, y0); });
      c.caixaR(v.Corpo, 0, y0, D / 2 - 0.01, W, h, D - 0.02, 0.006, { k: 1 });
      var hg = (h - 0.06) / 2;
      var profG = (D - 0.06) * 0.85;
      [0, 1].forEach(function (i) {
        var yg = y0 + 0.02 + i * (hg + 0.015);
        H.gaveta(c, "gaveta" + (i + 1), profG * 0.75, function () { H.porta(c, v.Corpo, 0, yg, D - 0.02, W - 0.03, hg, 0.02, "liso"); H.cava(c, 0, yg + hg - 0.03, D, W * 0.5); H.gavetaCaixa(c, MAT.CLARA, 0, yg, D - 0.02, W - 0.03, hg, profG); });
      });
    }
  });

  /* ---- guarda-roupa ---- */
  def({
    id: "ra-mob-guarda-roupa", moveis: true, nome: "Guarda-roupa (portas de correr ou de abrir)", descricao: "Armário de quarto até o teto baixo com portas de correr em trilho ou de abrir com friso, bagageiro, rodapé recuado e puxadores.",
    parametros: [P("Largura", "comprimento", 2.40, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.60, "Dimensões"), P("Altura", "comprimento", 2.50, "Dimensões"), P("Altura_bagageiro", "comprimento", 0.45, "Dimensões", "0 = sem bagageiro"), P("Tipo_porta", "texto", "correr", "Construção", "correr ou abrir", "instancia"), P("Portas", "inteiro", 3, "Construção", "Folhas de porta (por faixa)"),
      P("Corpo", "material", "madeira clara", "Materiais"), P("Frente", "material", "madeira freijo", "Materiais"), P("Espelho", "simnao", true, "Construção", "Uma folha com espelho")],
    tipos: [T("g240c", "2,40 m — 3 portas de correr", {}), T("g300c", "3,00 m — 4 portas de correr", { Largura: 3.00, Portas: 4 }), T("g180a", "1,80 m — 4 portas de abrir", { Largura: 1.80, Portas: 4, Tipo_porta: "abrir", Altura: 2.40 }), T("g240a", "2,40 m — 6 portas de abrir", { Tipo_porta: "abrir", Portas: 6 })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, rod = 0.08, esp = 0.018, nP = Math.max(2, Math.round(v.Portas)), correr = String(v.Tipo_porta).toLowerCase() === "correr", bag = v.Altura_bagageiro;
      c.caixa(MAT.PRETO, 0, 0, D / 2 - 0.04, W - 0.06, rod, D - 0.1);
      c.caixa(v.Corpo, 0, rod, D / 2, W, Ht - rod, D - 0.02);                                 // corpo (miolo fechado)
      var hp = Ht - rod - bag - 0.03, zf = D - 0.02;
      if (correr) {
        var wf = (W + 0.08 * (nP - 1)) / nP;
        for (var i = 0; i < nP; i++) {
          var x = -W / 2 + wf / 2 + i * (W - wf) / (nP - 1), z = zf + 0.012 + (i % 2) * 0.026;
          var mat = (v.Espelho && i === nP - 1) ? MAT.ESPELHO : v.Frente;
          var folhaC = function () {
            c.caixaR(mat, x, rod + 0.02, z, wf, hp - 0.02, esp, 0.004, { k: 1 });
            H.cava(c, x + (i % 2 ? -1 : 1) * (wf / 2 - 0.03), rod + hp * 0.5, z + esp / 2 + 0.006, 0.01);
            c.caixa(MAT.PRETO, x + (i % 2 ? -1 : 1) * (wf / 2 - 0.03), rod + hp * 0.45, z + esp / 2 + 0.003, 0.012, 0.3, 0.008);
          };
          /* só as folhas da frente (ímpares) correm, por cima da vizinha de trás; as de trás ficam no trilho, como no móvel real */
          if (i % 2 === 1) H.correr(c, "folha" + (i + 1), -(W - wf) / (nP - 1), folhaC); else folhaC();
        }
        c.caixa(MAT.PRETO, 0, rod + hp - 0.005, zf + 0.02, W, 0.02, 0.07);
      } else {
        var wp = W / nP;
        for (var j = 0; j < nP; j++) {
          var xj = -W / 2 + wp * (j + 0.5), m2 = (v.Espelho && j === nP - 1) ? MAT.ESPELHO : v.Frente;
          var ladoG = j % 2 ? -1 : 1, wpG = wp - 0.006;   // a dobradiça fica do lado oposto ao puxador
          H.giro(c, "porta" + (j + 1), xj + ladoG * wpG / 2, rod + hp * 0.5, zf + esp / 2, ladoG, function () {
            if (m2 === MAT.ESPELHO) c.caixa(m2, xj, rod + 0.02, zf, wp - 0.006, hp - 0.02, 0.012); else H.porta(c, m2, xj, rod + 0.02, zf, wp - 0.006, hp - 0.02, esp, "friso");
            H.puxador(c, xj + (j % 2 ? 1 : -1) * (wp / 2 - 0.05), rod + hp * 0.5, zf + esp, 0.2, true);
          });
        }
      }
      if (bag > 0.05) { var nb = Math.max(2, Math.round(W / 0.6)), wb = W / nb; for (var b = 0; b < nb; b++) { var xb = -W / 2 + wb * (b + 0.5), wbp = wb - 0.006, ladoB = b % 2 ? 1 : -1; H.giro(c, "bagageiro" + (b + 1), xb + ladoB * wbp / 2, Ht - bag / 2, zf + esp / 2, ladoB, function () { H.porta(c, v.Frente, xb, Ht - bag, zf, wbp, bag - 0.01, esp, "liso"); H.cava(c, xb, Ht - bag + 0.03, zf + esp, 0.1); }); } }
    }
  });
  def({
    id: "ra-mob-closet", moveis: true, nome: "Módulo de closet aberto (cabideiro e prateleiras)", descricao: "Módulo de closet sem portas: cabideiro de tubo, prateleiras, gaveteiro inferior e fundo. Vários módulos lado a lado formam o closet.",
    parametros: [P("Largura", "comprimento", 1.20, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.55, "Dimensões"), P("Altura", "comprimento", 2.40, "Dimensões"), P("Prateleiras", "inteiro", 4, "Construção"), P("Gavetas", "inteiro", 2, "Construção"), P("Cabideiro_altura", "comprimento", 1.75, "Construção", "Do piso ao eixo do tubo"),
      P("Corpo", "material", "madeira clara", "Materiais"), P("Gaveta", "material", "madeira freijo", "Materiais"), P("Tubo", "material", "inox", "Materiais")],
    tipos: [T("c120", "1,20 m", {}), T("c90", "0,90 m", { Largura: 0.90 }), T("c60", "0,60 m", { Largura: 0.60, Prateleiras: 5, Gavetas: 0 })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, e = 0.018, ng = Math.round(v.Gavetas), np = Math.round(v.Prateleiras), rod = 0.07;
      c.caixa(v.Corpo, -W / 2 + e / 2, 0, D / 2, e, Ht, D); c.caixa(v.Corpo, W / 2 - e / 2, 0, D / 2, e, Ht, D);
      c.caixa(v.Corpo, 0, 0, 0.005, W, Ht, 0.01);
      c.caixa(v.Corpo, 0, Ht - e, D / 2, W - 2 * e, e, D); c.caixa(MAT.PRETO, 0, 0, D / 2 - 0.03, W - 2 * e, rod, D - 0.06); c.caixa(v.Corpo, 0, rod, D / 2, W - 2 * e, e, D);
      var hg = 0.16, y = rod + e;
      for (var g = 0; g < ng; g++) {
        (function (yg, ig) { H.gaveta(c, "gaveta" + (ig + 1), (D - 0.1) * 0.7, function () { H.porta(c, v.Gaveta, 0, yg, D - 0.01, W - 2 * e - 0.01, hg - 0.01, 0.02, "liso"); H.cava(c, 0, yg + hg - 0.035, D + 0.01, 0.15); H.gavetaCaixa(c, v.Gaveta, 0, yg, D - 0.01, W - 2 * e - 0.01, hg - 0.01, D - 0.1); }); })(y, g);
        y += hg;
      }
      c.cilH(v.Tubo, 0, v.Cabideiro_altura, D / 2, 0.015, W - 2 * e, "x", { seg: 10 });
      for (var p = 0; p < np; p++) { var yp = Ht - e - 0.30 - p * 0.30; if (yp > v.Cabideiro_altura + 0.05) c.caixa(v.Corpo, 0, yp, D / 2, W - 2 * e, e, D - 0.02); }
      if (ng > 0) c.caixa(v.Corpo, 0, Math.max(rod + e + ng * hg + 0.30, 1.0), D / 2, W - 2 * e, e, D - 0.02);
    }
  });

  /* ---- escrivaninha + cadeira ---- */
  H.cadeiraEscritorio = function (c, tec) {
    var hA = 0.47;
    for (var i = 0; i < 5; i++) { var a = i * 72 * Math.PI / 180; c.caixaR(MAT.PRETO, Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14, 0.30, 0.025, 0.045, 0.01, { k: 1, rotY: -i * 72 }); c.cil(MAT.PRETO, Math.cos(a) * 0.27, 0.0, Math.sin(a) * 0.27, 0.025, 0.045, { seg: 8 }); }
    c.cil(MAT.CROMO, 0, 0.06, 0, 0.025, hA - 0.12, { seg: 10 });
    c.caixaR(tec, 0, hA - 0.07, 0, 0.50, 0.08, 0.48, 0.03);
    c.caixaR(tec, 0, hA + 0.01, -0.22, 0.46, 0.52, 0.07, 0.03, { rotX: -6 });
    [-1, 1].forEach(function (s) { c.caixaR(MAT.PRETO, s * 0.27, hA + 0.08, -0.02, 0.04, 0.03, 0.26, 0.012, { k: 1 }); c.caixa(MAT.PRETO, s * 0.27, hA - 0.04, -0.02, 0.025, 0.12, 0.025); });
  };
  def({
    id: "ra-mob-escrivaninha", moveis: true, nome: "Escrivaninha com cadeira", descricao: "Mesa de trabalho com tampo de madeira, painéis laterais, gaveteiro suspenso e cadeira de escritório giratória com base estrela. A cadeira fica a 0,25 m da borda.",
    parametros: [P("Largura", "comprimento", 1.40, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.60, "Dimensões"), P("Altura", "comprimento", 0.75, "Dimensões", "Altura usual de mesa de trabalho"), P("Com_cadeira", "simnao", true, "Construção"), P("Tampo", "material", "madeira nogueira", "Materiais"), P("Estrutura", "material", "metal preto", "Materiais"), P("Tecido", "material", "tecido grafite", "Materiais", "Estofado da cadeira")],
    tipos: [T("e140", "1,40 × 0,60", {}), T("e120", "1,20 × 0,60", { Largura: 1.20 }), T("e160", "1,60 × 0,70", { Largura: 1.60, Profundidade: 0.70 })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, e = 0.03;
      c.caixaR(v.Tampo, 0, Ht - e, D / 2, W, e, D, 0.005, { k: 1 });
      c.caixa(v.Estrutura, -W / 2 + 0.03, 0, D / 2, 0.03, Ht - e, D - 0.08); c.caixa(v.Estrutura, W / 2 - 0.03, 0, D / 2, 0.03, Ht - e, D - 0.08);
      c.caixa(v.Estrutura, 0, Ht - e - 0.25, 0.05, W - 0.1, 0.20, 0.015);
      var gx = W / 2 - 0.30; c.caixaR(MAT.CLARA, gx, Ht - e - 0.42, D / 2, 0.40, 0.40, D - 0.12, 0.005, { k: 1 });
      [0, 1].forEach(function (i) {
        H.gaveta(c, "gaveta" + (i + 1), (D - 0.2) * 0.7, function () { H.porta(c, MAT.FREIJO, gx, Ht - e - 0.41 + i * 0.19, D - 0.06 + 0.01, 0.38, 0.18, 0.016, "liso"); H.cava(c, gx, Ht - e - 0.41 + i * 0.19 + 0.14, D - 0.06 + 0.026, 0.14); H.gavetaCaixa(c, MAT.CLARA, gx, Ht - e - 0.41 + i * 0.19, D - 0.05, 0.38, 0.18, D - 0.2); });
      });
      if (v.Com_cadeira) c.grupo(-0.15, 0, D + 0.28, 180, function (k) { H.cadeiraEscritorio(k, v.Tecido); });
    }
  });

  /* ---------------------------------------------------------------- registro / gancho de geometria */
  function completar(fam, tipo, inst, saida) {
    var g = GER[fam.mob || fam.id];
    if (!g || !Mob) { saida.ok = false; saida.erros = (saida.erros || []).concat(["o gerador de mobiliário \"" + (fam.mob || fam.id) + "\" não carregou"]); return saida; }
    var c = Mob.cena(), v = saida.valores || {};
    try { g(c, v); } catch (e) { saida.ok = false; saida.erros = (saida.erros || []).concat(["mobiliário \"" + fam.nome + "\": " + e.message]); return saida; }
    /* aviso do gerador (ex.: o vão de eletro do armário planejado que não coube na largura total) chega a quem avalia */
    if (c.avisos && c.avisos.length) saida.avisos = (saida.avisos || []).concat(c.avisos);
    /* a QUANTIDADE que o desenho constrói (o armário planejado: módulos + tamponamentos, sem a sobra que não vira módulo) — vence a
       fórmula do quantitativo, que não sabe a fila de módulos (js/familiasplanejado.js gerar) */
    if (typeof c.quantidade === "number" && isFinite(c.quantidade) && saida.quantitativo) saida.quantitativo.quantidade = c.quantidade;
    saida.solidos = c.solidos(fam.id.replace(/^ra-/, "") + ":");
    saida.caixa = c.env ? { x0: c.env.x0, y0: c.env.y0, z0: c.env.z0, x1: c.env.x1, y1: c.env.y1, z1: c.env.z1 } : null;
    saida.mob = { triangulos: c.triangulos(), pecas: saida.solidos.length };
    /* PARTES MÓVEIS: as que o gerador declarou (c.parte); o eixo tem de estar dentro da caixa da peça e o ângulo de 0 a 180 */
    saida.partesMoveis = c.partes.slice(); saida.errosPartes = c.errosPartes.slice();
    if (PMov && c.partes.length) {
      var ck = PMov.checar(c.partes, saida.caixa);
      saida.errosPartes = saida.errosPartes.concat(ck.erros);
    }
    if (PMov) saida.estadoPartes = { fracao: PMov.fracaoDe(v, inst) };
    if (saida.errosPartes.length) { saida.ok = false; saida.erros = (saida.erros || []).concat(saida.errosPartes); }
    /* SÍMBOLO DE PLANTA (copa, faixa de forração): o desenho técnico usa no lugar do emaranhado de arestas da malha */
    var simK = SIMB[fam.id] ? fam.id : (fam.mob && SIMB[fam.mob] ? fam.mob : null);   /* a cópia da família numa obra (outro id) guarda o id de origem em `mob` */
    if (simK) { try { saida.simboloPlanta = SIMB[simK](v); } catch (eS) { /* sem símbolo: a planta usa a malha */ } }
    return saida;
  }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function registrarNoRA() {
    var RA = global.FamiliasRA || dep("FamiliasRA", "familiasra.js");
    if (RA && RA.registrar) RA.registrar(clonar(LISTA));
  }
  /* cor de cada material para a MINIATURA da biblioteca (a mesma da tabela FAM_PBR do js/bim.js — o teste de mobiliário (tools/test-*mobiliario.js) confere que os nomes existem lá) */
  var CORES = { "madeira nogueira": "#6b4a32", "madeira clara": "#b58a55", "madeira escura": "#3b2a20", "madeira deck": "#6a3d25", "madeira freijo": "#a27240", "laca branca": "#f2f2ef", "laca grafite": "#3a3d40",
    "metal preto": "#1f2023", "inox": "#d0d4d8", "metal cromado": "#cfd3d8", "latão": "#b89b47", "marmore branco": "#ece9e4", "quartzo branco": "#e9e8e4", "granito preto": "#1d1e20", "vidro": "#9fd3f0", "espelho": "#c9d3d8", "vidro fume": "#4a5560",
    "louça branca": "#f4f4f2", "tela preta": "#0b0c0e", "couro caramelo": "#9a5f34", "colchao": "#e9e5dc", "roupa de cama": "#e2ded4", "manta cinza": "#9a9a98", "cimento queimado": "#9b9a96", "tijolo refratario": "#c79a6a", "tijolinho aparente": "#b5683f", "tijolinho escuro": "#5d4a40",
    "pedra cinza": "#8a8d8f", "acrilico branco": "#f7f7f5", "borracha preta": "#1a1a1a", "linho natural": "#cdbfa6", "terra": "#5a4332", "ceramica terracota": "#b5623c", "tecido cinza": "#777a7e", "tecido bege": "#b09b7e",
    "tecido grafite": "#35383c", "tecido verde": "#5a7058", "tecido terracota": "#b4603f", "tecido azul": "#4a6a8a", "tronco palmeira": "#6a5238", "casca de arvore": "#7b6a5a", "folha verde escura": "#2f5a2e", "folha verde": "#4a7f35",
    "folha verde clara": "#7fae4a", "folha variegada": "#6f9a48", "flor amarela": "#f2c53a", "flor rosa": "#e58aa6", "flor lilas": "#b48ad2", "flor azul": "#6f7fd8", "flor branca": "#f4f2ee", "grama esmeralda": "#3f7d2b", "grama amendoim": "#5f9b35", "seixo": "#d8d0c0" };
  var _mini = {};
  /* miniatura(famId, tipoId): PNG (data URL) da peça em perspectiva isométrica; guardada por família + tipo. Só no navegador. */
  function miniatura(famId, tipoId) {
    var f = null, i, F = global.Familia;
    for (i = 0; i < LISTA.length; i++) if (LISTA[i].id === famId) f = LISTA[i];
    if (!f || !F || !Mob || !global.document) return "";
    var tp = tipoId || (f.tipos[0] || {}).id, k = famId + "|" + tp;
    if (_mini[k] != null) return _mini[k];
    var av = F.avaliar(f, tp, {});
    _mini[k] = av && av.ok ? Mob.miniatura(av.solidos, 96, function (m) { return CORES[String(m).toLowerCase()] || "#9a9a9a"; }) : "";
    return _mini[k];
  }
  /* ---------------------------------------------------------------- SÍMBOLO DE PLANTA (2D)
   * linhasPlanta(simbolo): segmentos [x1, z1, x2, z2, …] LOCAIS da família, que o desenho técnico (js/bim.js vista2d) usa no
   * lugar das arestas da malha. `simboloPlanta` vem do gerador: { copa: [{x, z, r, estilo}], tronco: [{x, z, r}], faixa: {x, z, larg, prof, trama, pontos} }.
   *   estilo "arvore"   = contorno ondulado (copa) + círculo interno + cruz e círculo do tronco;
   *   estilo "palmeira" = estrela de folhas com farpas; estilo "arbusto" = contorno ondulado miúdo;
   *   faixa (forração, pedras): retângulo + hachura a 45° (cruzada na grama-amendoim) ou pontos no seixo. */
  function linhasPlanta(sim) {
    var out = [], i, j;
    function seg(a, b, c, d) { out.push(a, b, c, d); }
    function poli(pts) { for (var k = 0; k + 1 < pts.length; k++) seg(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]); }
    ((sim && sim.copa) || []).forEach(function (cp) {
      var r = cp.r, est = cp.estilo || "arvore", n, pts = [];
      if (est === "palmeira") {
        n = clamp(Math.round(r * 9), 8, 18);
        for (i = 0; i < n; i++) {
          var a = Math.PI * 2 * i / n, ca = Math.cos(a), sa = Math.sin(a);
          seg(cp.x + ca * r * 0.12, cp.z + sa * r * 0.12, cp.x + ca * r, cp.z + sa * r);
          var bx = cp.x + ca * r * 0.62, bz = cp.z + sa * r * 0.62;
          seg(bx, bz, bx + Math.cos(a + 0.55) * r * 0.3, bz + Math.sin(a + 0.55) * r * 0.3); seg(bx, bz, bx + Math.cos(a - 0.55) * r * 0.3, bz + Math.sin(a - 0.55) * r * 0.3);
        }
        return;
      }
      n = est === "arbusto" ? clamp(Math.round(r * 22), 12, 36) : clamp(Math.round(r * 9), 10, 22);
      var amp = est === "arbusto" ? 0.07 : 0.1, N = n * 5;
      for (i = 0; i <= N; i++) { var t = Math.PI * 2 * i / N, rr = r * (1 + amp * Math.cos(t * n)) * 0.96; pts.push([cp.x + Math.cos(t) * rr, cp.z + Math.sin(t) * rr]); }
      poli(pts);
      if (est === "arvore") { var p2 = []; for (i = 0; i <= 24; i++) { var t2 = Math.PI * 2 * i / 24; p2.push([cp.x + Math.cos(t2) * r * 0.55, cp.z + Math.sin(t2) * r * 0.55]); } poli(p2); }
    });
    ((sim && sim.tronco) || []).forEach(function (tr) {
      var p = []; for (i = 0; i <= 14; i++) { var t = Math.PI * 2 * i / 14; p.push([tr.x + Math.cos(t) * tr.r, tr.z + Math.sin(t) * tr.r]); }
      poli(p); seg(tr.x - tr.r * 1.7, tr.z, tr.x + tr.r * 1.7, tr.z); seg(tr.x, tr.z - tr.r * 1.7, tr.x, tr.z + tr.r * 1.7);
    });
    var f = sim && sim.faixa;
    if (f) {
      var a2 = f.larg / 2, b2 = f.prof / 2, x0 = f.x - a2, x1 = f.x + a2, z0 = f.z - b2, z1 = f.z + b2;
      poli([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]);
      if (f.trama) {
        var st = f.passo || 0.28;
        for (var c0 = -(a2 + b2) + st / 2; c0 < a2 + b2; c0 += st) { var xa = Math.max(-a2, c0 - b2), xb = Math.min(a2, c0 + b2); if (xb - xa > 0.02) seg(f.x + xa, f.z + c0 - xa, f.x + xb, f.z + c0 - xb); }
        if (f.trama === "cruzada") for (var c1 = -(a2 + b2) + st / 2; c1 < a2 + b2; c1 += st) { var xc = Math.max(-a2, -c1 - b2), xd = Math.min(a2, -c1 + b2); if (xd - xc > 0.02) seg(f.x + xc, f.z + c1 + xc, f.x + xd, f.z + c1 + xd); }
      }
      if (f.pontos) {
        var rnd = Mob.sorteio(5), np = clamp(Math.round(f.larg * f.prof * 18), 10, 140);
        for (j = 0; j < np; j++) { var qx = f.x + rnd.entre(-a2 + 0.04, a2 - 0.04), qz = f.z + rnd.entre(-b2 + 0.04, b2 - 0.04), q = 0.025; seg(qx - q, qz, qx, qz - q); seg(qx, qz - q, qx + q, qz); seg(qx + q, qz, qx, qz + q); seg(qx, qz + q, qx - q, qz); }
      }
    }
    return out;
  }
  var FamiliasMob = {
    linhasPlanta: linhasPlanta,
    miniatura: miniatura, CORES: CORES,
    lista: function () { return clonar(LISTA); }, obter: function (id) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id) return clonar(LISTA[i]); return null; },
    completar: completar, gerador: function (id) { return GER[id] || null; }, def: def, H: H, MAT: MAT, P: P, T: T, registrar: registrarNoRA, TECIDOS: TECIDOS,
    ids: function () { return LISTA.map(function (f) { return f.id; }); }
  };
  global.FamiliasMob = FamiliasMob;
  registrarNoRA();
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasMob;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
