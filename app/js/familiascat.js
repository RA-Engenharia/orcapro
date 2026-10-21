/* =====================================================================
 * familiascat.js — MOBILIÁRIO POR CATEGORIA DO CATÁLOGO (20/10/2026)
 *
 * Pedido do Rogério (20/10/2026, "um clique por ambiente"): o catálogo dos móveis mais usados como
 * famílias paramétricas de VERDADE, cada peça comercial um TIPO, com o preço e a fonte em cada tipo,
 * e 5 ou mais opções de troca por peça.
 *
 * O QUE É. Uma família por CATEGORIA do catálogo (64), com geometria da categoria — sofá com pés,
 * base, almofadas, encosto e braços; cama com estrutura, cabeceira, colchão e travesseiros; mesa com
 * tampo e pés/cavalete; cadeira com assento, encosto e pés… — dirigida por Largura × Profundidade ×
 * Altura e pelo `Modelo` (variante da categoria: redonda, de correr, cooktop…). Cada peça do
 * js/mobcatalogodados.js (gerado pelo tools/gerar-mobcatalogo.js a partir da pesquisa com fonte) vira
 * um TIPO: nome comercial, medidas da ficha, acabamento, estilo, fabricante, URL e o PREÇO.
 *
 * COMO FUNCIONA. Mesma mecânica do js/familiasmob.js (`geometria: "mob"`, gerador com js/mobgeo.js,
 * portas e gavetas pelo js/partesmoveis.js). Onde a biblioteca RA já tinha o desenho (sofá, poltrona,
 * cama, guarda-roupa, aparador, criado, geladeira, lavadora, tapete, mesa de centro, escrivaninha) o
 * gerador de lá é REUSADO com as medidas da ficha. Depois de desenhar, `encaixar` acerta a caixa da peça
 * na medida da ficha (L × P × A) — o desenho já nasce perto dela; o teste (tools/test-mob-familias.js)
 * recusa ajuste fora de 0,85–1,15 em qualquer eixo, para ninguém "esticar caixa" no lugar de modelar.
 *
 * ORIGEM: peça encostada (sofá, armário, cama, rack, cortina, quadro…) no piso, meio da largura,
 * FUNDO em Z = 0 e frente em +Z; peça solta (mesa, cadeira, poltrona, tapete, luminária…) no centro.
 * Luminária de teto e pendente: a caixa vai de 0 (ponto mais baixo) a A (teto) — a elevação é da instância.
 *
 * PREÇO EM TODO TIPO (parâmetros de tipo, grupo "Catálogo e preço"): Preco_unitario (R$ sem BDI),
 * Fonte_preco, Data_preco, Composicao_id (vazio = peça de varejo). A peça de varejo é SÓ fornecimento:
 * a montagem e o frete são outra linha (serviço "montagem"), nunca dentro do Preco_unitario.
 *
 * ⚠ REGRAS (cada uma existe por um defeito que ela impede):
 *  1. Nada de medida inventada: a medida é a da ficha; a que a ficha não trouxe é a MEDIANA da categoria e o
 *     tipo diz isso em `Medida_conferir` (o desenho mostra, o engenheiro confere).
 *  2. Nunca preço zero nem "a cotar": o preço vem do arquivo de preços com a fonte; provisório = o MAIOR da
 *     categoria (DUVIDAS-INTERNAS.md, fora do documento do cliente).
 *  3. Teto de 12 mil triângulos por instância (o mesmo das famílias RA de mobiliário — malha mesclada do 3D).
 *  4. Nada de nome de cliente, endereço ou obra neste arquivo (test-cliente-nao-vaza).
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js"), FM = dep("FamiliasMob", "familiasmob.js"), D = dep("MobCatalogoDados", "mobcatalogodados.js");
  if (typeof require === "function" && FM && !FM.gerador("ra-coz-geladeira")) { try { require("./familiasmobcoz.js"); } catch (e0) { /* sem a cozinha: a geladeira e a lavadora usam o desenho próprio */ } }
  if (!Mob || !FM || !D) return;
  var H = FM.H, MAT = FM.MAT, P = FM.P, T = FM.T, def = FM.def;
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function cl(x, a, b) { return x < a ? a : (x > b ? b : x); }
  var TETO_TRI = 12000;

  /* ------------------------------------------------ MATERIAIS NOVOS (nomes que o 3D conhece: js/bim.js FAM_PBR; textura pelo dicionário do js/bimtextura.js) */
  var M = {
    LINHO: "tecido linho", VELUDO_V: "tecido veludo verde", VELUDO_A: "tecido veludo azul", VELUDO_R: "tecido veludo rosa", BOUCLE: "tecido boucle",
    OFF: "tecido off-white", MOSTARDA: "tecido mostarda", ROSA: "tecido rosa", COURO_P: "couro preto", COURO_M: "couro marrom", COURO_C: "couro caramelo", SINT_P: "couro sintetico preto",
    MDF_CARV: "mdf carvalho", MDF_NOG: "mdf nogueira", MDF_FREI: "mdf freijo", MDF_BR: "mdf branco", MDF_OFF: "mdf off-white", MDF_GRAF: "mdf grafite", MDF_PRETO: "mdf preto", MDF_VERDE: "mdf verde", MDF_AZUL: "mdf azul",
    MET_BR: "metal branco", COBRE: "metal cobre", DOURADO: "metal dourado", RATTAN: "rattan natural", CONCRETO: "concreto", VIDRO: "vidro"
  };
  var CORES_NOVAS = { "tecido linho": "#cbbd9f", "tecido veludo verde": "#2f5a46", "tecido veludo azul": "#2d4a6e", "tecido veludo rosa": "#c98f8f", "tecido boucle": "#e6e0d3",
    "tecido off-white": "#e9e4d8", "tecido mostarda": "#c79a2e", "tecido rosa": "#d6a2a0", "couro preto": "#1c1b1b", "couro marrom": "#5a3a25", "couro sintetico preto": "#222222",
    "mdf carvalho": "#b8916a", "mdf nogueira": "#6e4c33", "mdf freijo": "#a8794a", "mdf branco": "#f1f0ec", "mdf off-white": "#e8e2d4", "mdf grafite": "#3d4043", "mdf preto": "#1e1f21",
    "mdf verde": "#5d7462", "mdf azul": "#3f5a78", "metal branco": "#eeeeec", "metal cobre": "#b87333", "metal dourado": "#c9a24a", "rattan natural": "#c4a068", "concreto": "#a3a19c", "vidro": "#9fd3f0" };
  Object.keys(CORES_NOVAS).forEach(function (k) { if (!FM.CORES[k]) FM.CORES[k] = CORES_NOVAS[k]; });

  /* ------------------------------------------------ LEITURA DO TEXTO DA FICHA → acabamento */
  var ACENTO = { "á": "a", "à": "a", "â": "a", "ã": "a", "é": "e", "ê": "e", "í": "i", "ó": "o", "ô": "o", "õ": "o", "ú": "u", "ü": "u", "ç": "c" };
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[áàâãéêíóôõúüç]/g, function (c) { return ACENTO[c] || c; }); }
  function textoDe(p) { return norm([p.n, (p.k || []).join(" "), p.m || ""].join(" | ")); }
  /* a COR do produto: a do nome comercial manda (é o que se compra), depois o 1º acabamento da ficha */
  var CORES_RE = [["off", /off.?white|offwhite|gelo|marfim|creme|perola/], ["branco", /branc|white/], ["preto", /pret|black|onix/], ["grafite", /grafite|chumbo|cinza escuro|antracite|carbono/],
    ["cinza", /cinza|gray|grey|prata|fendi/], ["bege", /bege|areia|cru\b|natural|aveia|caqui|linho|nude|camel|palha|cappuccino/], ["verde", /verde|oliva|musgo|green/],
    ["azul", /azul|marinho|petroleo|blue/], ["terracota", /terracota|ferrugem|telha|tijolo|laranja|cobre|caramelo|conhaque|whisky|mostarda/], ["rosa", /rosa|rose|blush/],
    ["marrom", /marrom|cafe|chocolate|tabaco|castanh|nogueira|imbuia|tabaco/]];
  function cor(txtN) { for (var i = 0; i < CORES_RE.length; i++) if (CORES_RE[i][1].test(txtN)) return CORES_RE[i][0]; return ""; }
  function corPeca(p) { return cor(norm(p.n)) || cor(norm((p.k || [])[0])) || cor(norm(p.m)); }
  function tecidoDe(p) {
    var t = textoDe(p), c = corPeca(p);
    if (/couro|courino|corino|courissimo|\bpu\b|sintetico/.test(t)) return /sintetic|courino|corino|\bpu\b/.test(t) && c === "preto" ? M.SINT_P : (c === "preto" ? M.COURO_P : (c === "marrom" ? M.COURO_M : M.COURO_C));
    if (/veludo|velvet/.test(t)) return c === "azul" ? M.VELUDO_A : (c === "rosa" ? M.VELUDO_R : (c === "verde" ? M.VELUDO_V : tecCor(c, M.VELUDO_V)));
    if (/boucle/.test(t)) return M.BOUCLE;
    if (/linho|linhao/.test(t) && (c === "bege" || c === "" || c === "off")) return M.LINHO;
    return tecCor(c, "tecido cinza");
  }
  function tecCor(c, pad) {
    return ({ off: M.OFF, branco: M.OFF, preto: "tecido grafite", grafite: "tecido grafite", cinza: "tecido cinza", bege: "tecido bege", verde: "tecido verde", azul: "tecido azul",
      terracota: "tecido terracota", rosa: M.ROSA, marrom: "tecido terracota" })[c] || pad;
  }
  function madeiraDe(p, padrao) {
    var t = textoDe(p), c = cor(norm(p.n));
    if (/carvalho|\boak\b|rustic|demolicao|pinus|eucalipto|pinho/.test(t) && !c) return M.MDF_CARV;
    if (c === "branco") return M.MDF_BR; if (c === "off") return M.MDF_OFF; if (c === "preto") return M.MDF_PRETO; if (c === "grafite" || c === "cinza") return M.MDF_GRAF;
    if (c === "verde") return M.MDF_VERDE; if (c === "azul") return M.MDF_AZUL;
    if (/nogueira|imbuia|tabaco|castanh|cafe|wengue|\bipe\b|mogno|marrom|jatoba|cumaru|amendoa escur/.test(t)) return M.MDF_NOG;
    if (/carvalho|\boak\b|rustic|demolicao|pinus|eucalipto|pinho/.test(t)) return M.MDF_CARV;
    if (/freijo|cinamomo|\bmel\b|jequitiba|teca|tauari|amendoa|nature|natural|madeira/.test(t)) return M.MDF_FREI;
    return padrao || M.MDF_FREI;
  }
  function metalDe(p) {
    var t = textoDe(p);
    if (/dourad|\bgold|latao|champagne/.test(t)) return M.DOURADO;
    if (/cobre|rose gold|bronze/.test(t)) return M.COBRE;
    if (/cromad|inox|prata|aluminio|niquel|escovad/.test(t)) return "inox";
    if (/metal branco|aco branco|estrutura branca|pintura branca|epoxi branc/.test(t)) return M.MET_BR;
    return MAT.PRETO;
  }
  function pesDe(p) { var t = textoDe(p); return /pes? (de |em )?madeira|pe palito|pes? (de )?(eucalipto|tauari|pinus|freijo|carvalho)|madeira macica/.test(t) && !/pes? (de |em )?(metal|aco|ferro)/.test(t) ? madeiraDe(p, MAT.ESC) : metalDe(p); }
  function tampoDe(p, padrao) {
    var t = textoDe(p);
    if (/marmore|marble|travertino/.test(t)) return MAT.MARMORE; if (/granito|quartzo|silestone/.test(t)) return /branc|quartzo/.test(t) ? MAT.QUARTZO : MAT.GRANITO;
    if (/vidro|cristal/.test(t)) return /fume|preto/.test(t) ? MAT.FUME : M.VIDRO; if (/concreto|cimento/.test(t)) return M.CONCRETO;
    return padrao || madeiraDe(p);
  }

  /* ------------------------------------------------ ENCAIXE NA MEDIDA DA FICHA
   * Depois de desenhar, a caixa da peça vira L × P × A exatos (afim por eixo). Os eixos das partes móveis e o curso andam junto.
   * O desenho nasce perto da medida (o teste recusa fator fora de 0,85–1,15): isto acerta o milímetro, não modela. */
  var ULTIMO = null;
  function encaixar(c, L, Pz, A, centro) {
    var e = c.env; if (!e || !isFinite(e.x0)) return null;
    var dx = e.x1 - e.x0, dy = e.y1 - e.y0, dz = e.z1 - e.z0;
    var sx = dx > 1e-6 ? L / dx : 1, sy = dy > 1e-6 ? A / dy : 1, sz = dz > 1e-6 ? Pz / dz : 1;
    var X0 = -L / 2, Y0 = 0, Z0 = centro ? -Pz / 2 : 0;
    function mx(x) { return X0 + (x - e.x0) * sx; } function my(y) { return Y0 + (y - e.y0) * sy; } function mz(z) { return Z0 + (z - e.z0) * sz; }
    c.ordem.forEach(function (k) {
      var g = c.grupos[k], v = g.v;
      for (var i = 0; i + 2 < v.length; i += 3) { v[i] = Math.round(mx(v[i]) * 1e6) / 1e6; v[i + 1] = Math.round(my(v[i + 1]) * 1e6) / 1e6; v[i + 2] = Math.round(mz(v[i + 2]) * 1e6) / 1e6; }
      g.volume *= sx * sy * sz;
    });
    c.partes.forEach(function (pt) {
      if (pt.eixo) pt.eixo = [mx(pt.eixo[0]), my(pt.eixo[1]), mz(pt.eixo[2])];
      if (pt.curso != null && pt.vetor) { var vv = pt.vetor; pt.curso = pt.curso * Math.sqrt(Math.pow(vv[0] * sx, 2) + Math.pow(vv[1] * sy, 2) + Math.pow(vv[2] * sz, 2)) / (Math.sqrt(vv[0] * vv[0] + vv[1] * vv[1] + vv[2] * vv[2]) || 1); }
    });
    c.env = { x0: -L / 2, y0: 0, z0: Z0, x1: L / 2, y1: A, z1: Z0 + Pz };
    ULTIMO = { sx: sx, sy: sy, sz: sz };
    return ULTIMO;
  }

  /* reusar(id, valores): o gerador de uma família RA que já existe, com os padrões dela e as medidas da ficha por cima */
  function reusar(c, id, over) {
    var g = FM.gerador(id), f = FM.obter(id);
    if (!g || !f) return false;
    var v = {};
    f.parametros.forEach(function (p) { v[p.nome] = p.valor; });
    Object.keys(over).forEach(function (k) { if (over[k] != null) v[k] = over[k]; });
    g(c, v);
    return true;
  }

  /* ------------------------------------------------ PEÇAS COMUNS (além do H do js/familiasmob.js) */
  function pes4(c, mat, L, Pz, z0, alt, rec, estilo) {   /* 4 pés: "conico" (madeira afunilada), "palito" (aberto), "quadrado" (metal), "tubo" */
    var r = rec == null ? 0.06 : rec, pts = [[-L / 2 + r, z0 + r], [L / 2 - r, z0 + r], [-L / 2 + r, z0 + Pz - r], [L / 2 - r, z0 + Pz - r]];
    pts.forEach(function (q, i) {
      var sx = q[0] < 0 ? -1 : 1, sz = q[1] < z0 + Pz / 2 ? -1 : 1;
      if (estilo === "palito") c.tronco(mat, q[0], 0, q[1], 0.022, 0.022, 0.034, 0.034, alt, { rotX: sz * 6, rotZ: -sx * 6 });
      else if (estilo === "quadrado") c.caixa(mat, q[0], 0, q[1], 0.03, alt, 0.03);
      else if (estilo === "tubo") c.cil(mat, q[0], 0, q[1], 0.014, alt, { seg: 10 });
      else c.tronco(mat, q[0], 0, q[1], 0.03, 0.03, 0.045, 0.045, alt);
    });
  }
  function corpoCaixa(c, mat, L, Pz, y0, h, esp) {   /* caixa de móvel aberta na frente: base, tampo, laterais e fundo (vê-se o vão do nicho) */
    esp = esp || 0.018;
    c.caixa(mat, 0, y0, Pz / 2, L, esp, Pz); c.caixa(mat, 0, y0 + h - esp, Pz / 2, L, esp, Pz);
    c.caixa(mat, -L / 2 + esp / 2, y0 + esp, Pz / 2, esp, h - 2 * esp, Pz); c.caixa(mat, L / 2 - esp / 2, y0 + esp, Pz / 2, esp, h - 2 * esp, Pz);
    c.caixa(mat, 0, y0 + esp, 0.003, L - 2 * esp, h - 2 * esp, 0.006);
  }
  function portaGiro(c, id, mat, xc, y0, zf, w, h, lado, estilo, puxMat) {   /* porta de armário que abre (dobradiça do lado `lado`) */
    H.giro(c, id, xc + lado * w / 2, y0 + h / 2, zf + 0.009, lado, function () {
      H.porta(c, mat, xc, y0, zf, w, h, 0.018, estilo || "liso");
      if (puxMat) H.puxador(c, xc - lado * (w / 2 - 0.04), y0 + h * 0.5, zf + 0.018, Math.min(0.16, h * 0.4), true, puxMat); else H.cava(c, xc - lado * (w / 2 - 0.02), y0 + h - 0.03, zf + 0.018, 0.012);
    });
  }
  function gaveta(c, id, mat, xc, y0, zf, w, h, prof, puxMat) {
    H.gaveta(c, id, prof * 0.7, function () {
      H.porta(c, mat, xc, y0, zf, w, h, 0.018, "liso");
      if (puxMat) H.puxador(c, xc, y0 + h * 0.62, zf + 0.018, Math.min(0.16, w * 0.35), false, puxMat); else H.cava(c, xc, y0 + h - 0.03, zf + 0.018, w * 0.45);
      H.gavetaCaixa(c, MAT.CLARA, xc, y0, zf, w, h, prof);
    });
  }
  function livros(c, x0, x1, y, z, prof, semente) {   /* fileira de livros e um vaso (o que faz a estante parecer estante na foto) */
    var rnd = Mob.sorteio(semente || 3), x = x0, cores = ["tecido terracota", "tecido azul", "tecido verde", "tecido bege", "tecido grafite", "laca branca"];
    while (x < x1 - 0.05) {
      if (rnd() < 0.12) { x += 0.08 + rnd() * 0.1; continue; }
      var w = 0.02 + rnd() * 0.03, h = 0.17 + rnd() * 0.1, d = Math.min(prof - 0.04, 0.15 + rnd() * 0.07);
      if (x + w > x1) break;
      c.caixa(cores[Math.floor(rnd() * cores.length)], x + w / 2, y, z, w, h, d); x += w + 0.002;
    }
  }

  /* =================================================================== GERADORES POR ARQUÉTIPO
   * g(c, v, p): v = valores da família (Largura, Profundidade, Altura, Modelo, Assento, Acabamento, Estrutura, Detalhe…)
   * Devolve "centro" (peça solta) ou "" (encostada). */
  var G = {};
  function L_(v) { return v.Largura; } function P_(v) { return v.Profundidade; } function A_(v) { return v.Altura; }
  function tem(v, re) { return re.test(norm(v.Modelo)); }

  /* ---- ESTOFADOS ---- */
  G.sofa = function (c, v) {
    var L = L_(v), Pz = P_(v), A = A_(v), lug = Math.max(1, Math.round(v.Lugares || (L < 1.7 ? 2 : 3)));
    reusar(c, "ra-mob-sofa-reto", { Largura: L, Profundidade: Pz, Altura: A, Altura_assento: cl(num(v.Assento, 0.44), 0.36, A - 0.2), Braco: cl(L * 0.075, 0.1, 0.22), Lugares: lug, Almofadas: A >= 0.85 ? 2 : 0,
      Tecido: v.Acabamento, Cor_almofada: v.Detalhe, Pe: v.Estrutura });
    return "";
  };
  G.chaise = function (c, v) {
    var L = L_(v), Pz = P_(v), A = A_(v), D = cl(Math.min(Pz * 0.62, 0.98), 0.8, 1.0);
    if (Pz < 1.25) return G.sofa(c, v);   /* módulo de canto sem chaise longa: a ficha dá a profundidade de um sofá */
    reusar(c, "ra-mob-sofa-l", { Largura: L, Profundidade: D, Altura: A, Altura_assento: cl(num(v.Assento, 0.44), 0.36, A - 0.2), Braco: cl(L * 0.06, 0.1, 0.2), Lugares: L > 2.7 ? 4 : 3, Almofadas: A >= 0.85 ? 2 : 0,
      Tecido: v.Acabamento, Cor_almofada: v.Detalhe, Pe: v.Estrutura, Largura_chaise: cl(L * 0.36, 0.75, 1.1), Comprimento_chaise: Math.max(Pz, D + 0.25), Lado_chaise: tem(v, /esquerd/) ? "esquerda" : "direita" });
    return "";
  };
  G.retratil = function (c, v) {   /* sofá retrátil e reclinável: assento que corre para a frente, encosto de almofadão com pillow-top */
    var L = L_(v), Pz = P_(v), A = A_(v), tec = v.Acabamento, br = cl(L * 0.09, 0.16, 0.26), n = L > 2.1 ? 3 : 2, hs = cl(num(v.Assento, 0.45), 0.38, 0.5), peH = 0.06;
    var Df = Math.min(Pz, 1.0);   /* profundidade fechado; a ficha às vezes dá o aberto: aí o apoio de pés reclinado completa até P */
    if (Pz > Df + 0.05) { c.caixaR(tec, 0, hs - 0.24, Df + (Pz - Df) / 2 - 0.01, L - 2 * br - 0.04, 0.12, Pz - Df, 0.04, { k: 2 }); c.caixa(MAT.PRETO, 0, hs - 0.36, Df + (Pz - Df) / 2, L * 0.5, 0.02, (Pz - Df) * 0.6, { rotX: 30 }); }
    [-1, 1].forEach(function (s) { c.caixaR(MAT.PRETO, s * (L / 2 - br / 2), 0, Df / 2, br - 0.04, peH, Df - 0.1, 0.01, { k: 1 }); });
    c.caixaR(tec, 0, peH, Df / 2 - 0.05, L - 2 * br + 0.02, hs - 0.18 - peH, Df - 0.12, 0.03, { k: 1 });
    [-1, 1].forEach(function (s) { c.caixaR(tec, s * (L / 2 - br / 2), peH, Df / 2, br, hs + 0.16 - peH, Df, 0.07, { k: 2 }); });
    c.caixaR(tec, 0, hs - 0.18, 0.12, L - 2 * br, A - 0.06 - (hs - 0.18), 0.24, 0.05, { k: 1 });
    var wi = (L - 2 * br) / n;
    for (var i = 0; i < n; i++) {
      var xi = -L / 2 + br + wi * (i + 0.5);
      c.caixaR(tec, xi, hs - 0.02, 0.33, wi - 0.015, A - (hs - 0.02), 0.22, 0.08, { k: 2, rotX: -10 });
      c.caixaR(tec, xi, A - 0.17, 0.25, wi - 0.03, 0.16, 0.2, 0.07, { k: 2, rotX: -18 });   /* pillow-top do encosto */
      (function (xx, ii) { H.gaveta(c, "assento" + (ii + 1), Math.max(0.15, Pz - Df) || 0.3, function () { c.caixaR(tec, xx, hs - 0.19, (Df - 0.32) / 2 + 0.36, wi - 0.015, 0.21, Df - 0.33, 0.07, { k: 2 }); }); })(xi, i);
    }
    return "";
  };
  G.poltrona = function (c, v) {
    reusar(c, "ra-mob-poltrona", { Largura: L_(v), Profundidade: P_(v), Altura: A_(v), Altura_assento: cl(num(v.Assento, 0.42), 0.34, A_(v) - 0.18), Tecido: v.Acabamento, Pe: v.Estrutura });
    return "centro";
  };
  G.longarina = function (c, v) {   /* longarina de espera: viga de aço, pés em T, assentos e encostos em concha */
    var L = L_(v), Pz = P_(v), A = A_(v), n = cl(Math.round(L / 0.56), 2, 6), w = L / n, hs = cl(num(v.Assento, 0.45), 0.4, 0.48), es = v.Estrutura, tec = v.Acabamento;
    c.caixa(es, 0, hs - 0.1, 0, L - 0.04, 0.05, 0.06);
    [-1, 1].forEach(function (s) { var x = s * (L / 2 - 0.12); c.caixa(es, x, 0.02, 0, 0.05, hs - 0.1, 0.05); c.caixaR(es, x, 0, 0, 0.06, 0.025, Pz - 0.04, 0.01, { k: 1 }); });
    for (var i = 0; i < n; i++) {
      var x = -L / 2 + w * (i + 0.5);
      c.caixa(es, x, hs - 0.05, 0.02, 0.04, 0.03, Pz * 0.6);
      c.caixaR(tec, x, hs - 0.03, 0.04, w - 0.05, 0.05, Pz * 0.62, 0.02, { k: 2, rotX: 4 });
      c.caixaR(tec, x, hs + 0.04, -Pz / 2 + 0.06, w - 0.06, A - hs - 0.05, 0.04, 0.02, { k: 2, rotX: -10 });
      c.caixa(es, x, hs - 0.02, -Pz / 2 + 0.03, 0.03, 0.12, 0.03, { rotX: -10 });
    }
    return "centro";
  };
  G.puff = function (c, v) {
    var L = L_(v), Pz = P_(v), A = A_(v), tec = v.Acabamento;
    if (Math.abs(L - Pz) < 0.12 * L && L < 0.75 && !tem(v, /banco|bau/)) {   /* puff redondo: almofadão torneado com costura */
      var r = Math.min(L, Pz) / 2;
      c.torno(tec, 0, 0, 0, [[r * 0.9, 0], [r * 0.98, 0.02], [r, A * 0.25], [r, A * 0.75], [r * 0.97, A - 0.02], [r * 0.85, A], [0, A]], { seg: 28 });
      c.torno(MAT.PRETO, 0, A * 0.5 - 0.004, 0, [[r + 0.003, 0], [r + 0.003, 0.008]], { seg: 28, aberto: true });
      return "centro";
    }
    var bau = tem(v, /bau/), hp = cl(A * 0.25, 0.06, 0.14);   /* banco/puff retangular com pés palito (baú: tampa estofada) */
    pes4(c, v.Estrutura, L, Pz, -Pz / 2, hp + 0.01, 0.07, "palito");
    c.caixaR(bau ? v.Detalhe : tec, 0, hp, 0, L, A - hp - 0.1, Pz, 0.02, { k: 1 });
    c.caixaR(tec, 0, A - 0.12, 0, L, 0.12, Pz, 0.04, { k: 2 });
    return "centro";
  };

  /* ---- CADEIRAS ---- */
  G.cadeira = function (c, v) {   /* cadeira de jantar: estofada, de madeira (ripas/palha) ou concha com pés palito */
    var L = L_(v), Pz = P_(v), A = A_(v), hs = cl(num(v.Assento, 0.46), 0.4, 0.5), tec = v.Acabamento, es = v.Estrutura, mod = norm(v.Modelo);
    var zf = Pz / 2, zb = -Pz / 2 + 0.04;
    if (/concha/.test(mod)) {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.tronco(es, s[0] * (L / 2 - 0.08), 0, s[1] * (Pz / 2 - 0.1), 0.022, 0.022, 0.03, 0.03, hs - 0.05, { rotX: s[1] * 8, rotZ: -s[0] * 8 }); });
      c.caixa(MAT.PRETO, 0, hs * 0.45, -Pz / 2 + 0.1, L * 0.62, 0.012, 0.012); c.caixa(MAT.PRETO, 0, hs * 0.45, Pz / 2 - 0.1, L * 0.62, 0.012, 0.012);
      c.caixaR(tec, 0, hs - 0.05, 0.02, L - 0.02, 0.05, Pz * 0.78, 0.022, { k: 3 });
      c.caixaR(tec, 0, hs - 0.02, zb + 0.03, L - 0.04, A - hs + 0.02, 0.05, 0.022, { k: 3, rotX: -12 });
      return "centro";
    }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.tronco(es, s[0] * (L / 2 - 0.035), 0, s[1] * (Pz / 2 - 0.04), 0.032, 0.032, 0.026, 0.026, hs - 0.06, { rotX: s[1] * -3, rotZ: s[0] * 3 }); });
    c.caixa(es, 0, hs - 0.11, -Pz / 2 + 0.04, L - 0.08, 0.04, 0.02); c.caixa(es, 0, hs - 0.11, Pz / 2 - 0.04, L - 0.08, 0.04, 0.02);
    c.caixaR(es, 0, hs - 0.06, 0, L, 0.03, Pz - 0.02, 0.008, { k: 1 });
    [-1, 1].forEach(function (s) { c.caixaR(es, s * (L / 2 - 0.03), hs - 0.06, zb, 0.035, A - hs + 0.06, 0.03, 0.008, { k: 1, rotX: -7 }); });
    if (/madeira|ripa|palha/.test(mod)) {
      c.caixaR(/palha/.test(mod) ? MAT.PALHA : es, 0, hs - 0.035, 0.005, L - 0.06, 0.03, Pz - 0.07, 0.01, { k: 1 });
      var nR = /palha/.test(mod) ? 1 : 3;
      for (var i = 0; i < nR; i++) c.caixaR(/palha/.test(mod) ? MAT.PALHA : es, 0, A - 0.09 - i * 0.075 - (nR === 1 ? 0.14 : 0), zb + 0.005, L - 0.09, nR === 1 ? 0.22 : 0.05, 0.02, 0.006, { k: 1, rotX: -7 });
    } else {
      c.caixaR(tec, 0, hs - 0.035, 0.01, L - 0.03, 0.06, Pz - 0.06, 0.025, { k: 2 });
      c.caixaR(tec, 0, hs + 0.09, zb + 0.025, L - 0.08, A - hs - 0.1, 0.05, 0.02, { k: 2, rotX: -7 });
    }
    return "centro";
  };
  G.giratoria = function (c, v) {   /* cadeira de escritório: base estrela de 5 pás com rodízio, pistão, assento, encosto alto e braços */
    var L = L_(v), Pz = P_(v), A = A_(v), hs = cl(num(v.Assento, 0.48), 0.42, 0.56), tec = v.Acabamento, es = v.Estrutura, rb = Math.min(L, Pz) / 2 - 0.03;
    for (var i = 0; i < 5; i++) {
      var a = (i * 72 + 18) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      c.caixaR(es, ca * rb / 2, 0.055, sa * rb / 2, rb, 0.028, 0.045, 0.01, { k: 1, rotY: -(i * 72 + 18) });
      c.cil(MAT.BORRACHA, ca * (rb - 0.01), 0.03, sa * (rb - 0.01), 0.026, 0.05, { seg: 10, rotX: 90, centro: true });
      c.caixa(es, ca * (rb - 0.01), 0.04, sa * (rb - 0.01), 0.02, 0.03, 0.02);
    }
    c.cil(MAT.CROMO, 0, 0.07, 0, 0.026, hs - 0.16, { seg: 12 });
    c.caixa(MAT.PRETO, 0, hs - 0.1, 0, 0.2, 0.03, 0.2);
    c.caixaR(tec, 0, hs - 0.08, 0.03, L - 0.12, 0.08, Pz * 0.68, 0.03, { k: 2 });
    c.caixa(MAT.PRETO, 0, hs - 0.06, -Pz / 2 + 0.14, 0.06, 0.25, 0.03, { rotX: -8 });
    c.caixaR(tec, 0, hs + 0.08, -Pz / 2 + 0.1, L - 0.16, A - hs - 0.08, 0.06, 0.03, { k: 2, rotX: -8 });
    [-1, 1].forEach(function (s) { c.caixa(MAT.PRETO, s * (L / 2 - 0.035), hs - 0.06, 0.0, 0.025, 0.2, 0.025); c.caixa(MAT.PRETO, s * (L / 2 - 0.06), hs - 0.07, 0.0, 0.07, 0.02, 0.025); c.caixaR(MAT.PRETO, s * (L / 2 - 0.025), hs + 0.14, 0.0, 0.05, 0.03, 0.26, 0.012, { k: 1 }); });
    return "centro";
  };
  G.visitante = function (c, v) {   /* cadeira fixa de visitante: estrutura em trenó (tubo) ou 4 pés, assento e encosto estofados */
    var L = L_(v), Pz = P_(v), A = A_(v), hs = cl(num(v.Assento, 0.46), 0.42, 0.5), tec = v.Acabamento, es = v.Estrutura;
    if (tem(v, /treno|\bs\b|balanco/)) {
      [-1, 1].forEach(function (s) {
        var x = s * (L / 2 - 0.03);
        c.cilH(es, x, 0.012, 0, 0.012, Pz - 0.04, "z", { seg: 8 });
        c.cil(es, x, 0, Pz / 2 - 0.04, 0.012, hs - 0.04, { seg: 8 }); c.cil(es, x, 0, -Pz / 2 + 0.06, 0.012, A - 0.02, { seg: 8, rotX: -6 });
        c.cilH(es, x, hs - 0.04, 0.0, 0.012, Pz - 0.1, "z", { seg: 8 });
      });
    } else pes4(c, es, L, Pz, -Pz / 2, hs - 0.06, 0.04, "tubo");
    c.caixaR(MAT.PRETO, 0, hs - 0.07, 0.01, L - 0.06, 0.02, Pz - 0.1, 0.008, { k: 1 });
    c.caixaR(tec, 0, hs - 0.06, 0.02, L - 0.03, 0.07, Pz - 0.08, 0.025, { k: 2 });
    c.caixaR(tec, 0, hs + 0.07, -Pz / 2 + 0.05, L - 0.07, A - hs - 0.07, 0.055, 0.025, { k: 2, rotX: -6 });
    return "centro";
  };
  G.banqueta = function (c, v) {   /* banqueta de bancada: assento redondo estofado (H.banqueta da biblioteca) e, se a ficha é alta, encosto */
    var L = L_(v), Pz = P_(v), A = A_(v), hs = num(v.Assento, 0);
    if (!(hs > 0.4)) hs = A > 0.9 ? A - 0.28 : A;
    hs = cl(hs, 0.45, 0.85);
    if (Math.abs(L - Pz) > 0.12 * Math.max(L, Pz)) {   /* assento quadrado/selim: 4 pés abertos com aro de apoio dos pés */
      var es = v.Estrutura, tec = v.Acabamento, hA = Math.min(hs, A);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.tronco(es, s[0] * (L / 2 - 0.04), 0, s[1] * (Pz / 2 - 0.04), 0.022, 0.022, 0.03, 0.03, hA - 0.05, { rotX: -s[1] * 5, rotZ: s[0] * 5 }); });
      [-1, 1].forEach(function (s) { c.caixa(es, 0, hA * 0.3, s * (Pz / 2 - 0.065), L - 0.12, 0.018, 0.018); c.caixa(es, s * (L / 2 - 0.065), hA * 0.3, 0, 0.018, 0.018, Pz - 0.12); });
      c.caixaR(es, 0, hA - 0.06, 0, L - 0.04, 0.025, Pz - 0.04, 0.008, { k: 1 });
      c.caixaR(tec, 0, hA - 0.045, 0, L - 0.02, 0.045, Pz - 0.02, 0.02, { k: 2 });
      if (A > hA + 0.12) { c.caixa(es, 0, hA - 0.02, -Pz / 2 + 0.03, 0.025, A - hA - 0.06, 0.02, { rotX: -6 }); c.caixaR(tec, 0, A - 0.16, -Pz / 2 + 0.025, L * 0.8, 0.15, 0.04, 0.015, { k: 2, rotX: -6 }); }
      return "centro";
    }
    H.banqueta(c, Math.min(hs, A) - 0.005, Math.min(L, Pz) * 0.92, v.Acabamento, v.Estrutura);
    if (A > hs + 0.07) {
      c.caixa(v.Estrutura, -0.0, hs - 0.02, -Math.min(L, Pz) / 2 + 0.04, 0.025, A - hs - 0.05, 0.02, { rotX: -8 });
      c.caixaR(v.Acabamento, 0, A - 0.16, -Math.min(L, Pz) / 2 + 0.03, Math.min(L, Pz) * 0.78, 0.15, 0.04, 0.015, { k: 2, rotX: -8 });
    }
    return "centro";
  };
  G.varanda = function (c, v) {   /* varanda/área gourmet: cadeira de corda/rattan ou mesa redonda de pedestal, conforme a peça */
    var L = L_(v), Pz = P_(v), A = A_(v);
    if (tem(v, /cadeira|poltrona/)) {
      var hs = 0.43, es = v.Estrutura;
      pes4(c, es, L, Pz, -Pz / 2, hs - 0.04, 0.05, "tubo");
      c.caixaR(es, 0, hs - 0.05, 0, L - 0.02, 0.03, Pz - 0.04, 0.012, { k: 1 });
      for (var i = 0; i < 7; i++) c.cil(M.RATTAN, -L / 2 + 0.05 + i * (L - 0.1) / 6, hs - 0.02, -Pz / 2 + 0.05, 0.006, A - hs, { seg: 6, rotX: -10 });
      c.caixaR(es, 0, A - 0.04, -Pz / 2 + 0.01, L - 0.04, 0.03, 0.03, 0.01, { k: 1, rotX: -10 });
      c.caixaR(v.Acabamento, 0, hs - 0.02, 0.02, L - 0.08, 0.07, Pz - 0.12, 0.03, { k: 2 });
      return "centro";
    }
    var r = Math.min(L, Pz) / 2;
    c.prisma(v.Detalhe, 0, A - 0.025, 0, Mob.contornoElipse(L / 2, Pz / 2, 40), 0.025);
    c.torno(v.Estrutura, 0, 0, 0, [[r * 0.6, 0], [r * 0.6, 0.015], [0.05, 0.04], [0.035, A - 0.06], [0.12, A - 0.025]], { seg: 20 });
    return "centro";
  };

  /* ---- MESAS ---- */
  G.mesaCentro = function (c, v) {
    var f = tem(v, /redond/) ? "redonda" : (tem(v, /oval|organic/) ? "oval" : "retangular");
    reusar(c, "ra-mob-mesa-centro", { Formato: f, Largura: L_(v), Profundidade: P_(v), Altura: A_(v), Espessura_tampo: cl(num(v.Espessura_tampo, 0.03), 0.015, 0.08), Tampo: v.Acabamento, Estrutura: v.Estrutura });
    return "centro";
  };
  G.mesaLateral = function (c, v) {   /* mesa lateral: tampo redondo/quadrado e pé central torneado ou 3 pés */
    var L = L_(v), Pz = P_(v), A = A_(v), e = 0.025;
    if (tem(v, /quadrad|retangul|cubo/)) { c.caixaR(v.Acabamento, 0, A - e, 0, L, e, Pz, 0.004, { k: 1 }); pes4(c, v.Estrutura, L, Pz, -Pz / 2, A - e, 0.03, "quadrado"); c.caixa(v.Estrutura, 0, A * 0.3, 0, L - 0.04, 0.015, Pz - 0.04); return "centro"; }
    c.prisma(v.Acabamento, 0, A - e, 0, Mob.contornoElipse(L / 2, Pz / 2, 36), e);
    if (tem(v, /3 pes|tripe|palito/)) { [0, 120, 240].forEach(function (g) { var a = g * Math.PI / 180; c.tronco(v.Estrutura, Math.cos(a) * L * 0.32, 0, Math.sin(a) * Pz * 0.32, 0.02, 0.02, 0.028, 0.028, A - e, { rotZ: -Math.cos(a) * 7, rotX: Math.sin(a) * 7 }); }); }
    else c.torno(v.Estrutura, 0, 0, 0, [[Math.min(L, Pz) * 0.36, 0], [Math.min(L, Pz) * 0.36, 0.012], [0.03, 0.03], [0.022, A - e - 0.03], [0.07, A - e]], { seg: 18 });
    return "centro";
  };
  function mesaBase(c, v, L, Pz, A, e, tipoPe) {
    var es = v.Estrutura;
    if (tipoPe === "pedestal") {
      var r = Math.min(L, Pz) * 0.3;
      c.torno(es, 0, 0, 0, [[r, 0], [r, 0.02], [r * 0.4, 0.06], [0.06, 0.2], [0.05, A - e - 0.12], [r * 0.6, A - e]], { seg: 24, ez: Pz / L });
    } else if (tipoPe === "cavalete") {
      [-1, 1].forEach(function (s) {
        var x = s * (L / 2 - Math.min(0.3, L * 0.18));
        c.caixa(es, x, 0, 0, 0.05, 0.03, Pz - 0.16); c.caixa(es, x, A - e - 0.03, 0, 0.05, 0.03, Pz - 0.16);
        c.caixa(es, x, 0.03, -Pz / 2 + 0.16, 0.05, A - e - 0.06, 0.05, { rotX: 8 }); c.caixa(es, x, 0.03, Pz / 2 - 0.16, 0.05, A - e - 0.06, 0.05, { rotX: -8 });
      });
      c.caixa(es, 0, A - e - 0.03, 0, L - 2 * Math.min(0.3, L * 0.18), 0.03, 0.05);
    } else if (tipoPe === "painel") {
      [-1, 1].forEach(function (s) { c.caixa(es, s * (L / 2 - 0.12), 0, 0, 0.03, A - e, Pz - 0.2); });
      c.caixa(es, 0, A - e - 0.32, 0, L - 0.27, 0.3, 0.02);
    } else {
      c.caixa(v.Acabamento, 0, A - e - 0.07, 0, L - 0.2, 0.07, Pz - 0.2);
      [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { c.tronco(es, s * (L / 2 - 0.1), 0, t * (Pz / 2 - 0.1), 0.045, 0.045, 0.065, 0.065, A - e); }); });
    }
  }
  G.mesaJantar = function (c, v) {   /* mesa de jantar sem as cadeiras (cada cadeira é peça própria, com preço próprio) */
    var L = L_(v), Pz = P_(v), A = A_(v), e = cl(num(v.Espessura_tampo, 0.035), 0.018, 0.08), mod = norm(v.Modelo);
    var redonda = /redond|oval/.test(mod) || (Math.abs(L - Pz) < 0.05 && /redond/.test(mod));
    if (redonda) c.prisma(v.Acabamento, 0, A - e, 0, Mob.contornoElipse(L / 2, Pz / 2, 48), e);
    else c.caixaR(v.Acabamento, 0, A - e, 0, L, e, Pz, Math.min(0.01, e / 3), { k: 2 });
    mesaBase(c, v, L, Pz, A, e, /pedestal|tulipa|redond/.test(mod) ? "pedestal" : (/cavalete|trapezio|\bx\b/.test(mod) ? "cavalete" : "pes"));
    return "centro";
  };
  G.mesaReuniao = function (c, v) {   /* mesa de reunião: tampo, pés em painel e caixa de tomadas no centro */
    var L = L_(v), Pz = P_(v), A = A_(v), e = 0.03, mod = norm(v.Modelo);
    if (/redond/.test(mod) || Math.abs(L - Pz) < 0.06) { c.prisma(v.Acabamento, 0, A - e, 0, Mob.contornoElipse(L / 2, Pz / 2, 48), e); mesaBase(c, v, L, Pz, A, e, "pedestal"); return "centro"; }
    c.caixaR(v.Acabamento, 0, A - e, 0, L, e, Pz, 0.006, { k: 1 });
    if (L > 2.6) { mesaBase(c, v, L, Pz, A, e, "painel"); c.caixa(v.Estrutura, 0, 0, 0, 0.03, A - e, Pz - 0.3); } else mesaBase(c, v, L, Pz, A, e, "painel");
    c.caixa(MAT.PRETO, 0, A - 0.002, 0, 0.3, 0.004, 0.12); c.caixa(MAT.INOX, 0, A, 0, 0.28, 0.003, 0.1);
    return "centro";
  };
  G.escrivaninha = function (c, v) {
    var L = L_(v), Pz = P_(v), A = A_(v);
    if (tem(v, /\bl\b|em l|canto/) && Pz > 0.95) {   /* mesa em L: tampo principal + retorno à direita */
      var e = 0.025, pp = Math.min(0.7, Pz * 0.45), wr = Math.min(0.6, L * 0.35);
      c.caixaR(v.Acabamento, 0, A - e, pp / 2, L, e, pp, 0.004, { k: 1 });
      c.caixaR(v.Acabamento, L / 2 - wr / 2, A - e, pp + (Pz - pp) / 2, wr, e, Pz - pp, 0.004, { k: 1 });
      c.caixa(v.Estrutura, -L / 2 + 0.025, 0, pp / 2, 0.03, A - e, pp - 0.06);
      c.caixa(v.Estrutura, L / 2 - wr / 2, 0, Pz - 0.025, wr - 0.06, A - e, 0.03);
      c.caixa(v.Estrutura, 0, A - e - 0.3, 0.02, L - 0.1, 0.26, 0.015);
      return "";
    }
    reusar(c, "ra-mob-escrivaninha", { Largura: L, Profundidade: Pz, Altura: A, Com_cadeira: false, Tampo: v.Acabamento, Estrutura: v.Estrutura });
    return "";
  };
  G.recepcao = function (c, v) {   /* balcão de recepção: frente alta, tampo de atendimento por cima e tampo de trabalho atrás */
    var L = L_(v), Pz = P_(v), A = A_(v), corpo = v.Acabamento, tp = v.Detalhe, hT = 0.74;
    c.caixa(MAT.PRETO, 0, 0, Pz - 0.06, L - 0.04, 0.06, 0.05);
    c.caixaR(corpo, 0, 0.06, Pz - 0.05, L, A - 0.06 - 0.03, 0.05, 0.004, { k: 1 });
    c.caixaR(tp, 0, A - 0.03, Pz - 0.15, L + 0.0, 0.03, 0.3, 0.004, { k: 1 });
    [-1, 1].forEach(function (s) { c.caixa(corpo, s * (L / 2 - 0.025), 0, (Pz - 0.05) / 2, 0.05, hT, Pz - 0.05); });
    c.caixaR(corpo, 0, hT - 0.03, (Pz - 0.08) / 2, L - 0.02, 0.03, Pz - 0.08, 0.004, { k: 1 });
    c.caixa(M.MDF_GRAF, 0, A * 0.35, Pz + 0.002 - 0.0, L * 0.8, 0.04, 0.004);
    return "";
  };
  G.maca = function (c, v) {   /* maca/divã de consultório: estrutura tubular, leito estofado e cabeceira reclinável */
    var L = L_(v), Pz = P_(v), A = A_(v), es = v.Estrutura, tec = v.Acabamento, hl = A - 0.08, zc = Pz / 2 - 0.5;
    pes4(c, es, L, Pz, -Pz / 2, hl - 0.03, 0.05, "tubo");
    [-1, 1].forEach(function (s) { c.cilH(es, s * (L / 2 - 0.05), 0.15, 0, 0.012, Pz - 0.1, "z", { seg: 8 }); c.cilH(es, s * (L / 2 - 0.05), hl - 0.03, 0, 0.014, Pz - 0.1, "z", { seg: 8 }); });
    c.caixaR(es, 0, hl - 0.03, 0, L - 0.02, 0.03, Pz, 0.01, { k: 1 });
    c.caixaR(tec, 0, hl, 0.25, L, 0.08, Pz - 0.5, 0.03, { k: 2 });
    c.caixaR(tec, 0, hl, zc - 0.25 + 0.02, L, 0.08, 0.5, 0.03, { k: 2, rotX: 14 });
    c.caixa(MAT.PRETO, 0, hl - 0.2, -Pz / 2 + 0.05, L * 0.7, 0.015, 0.02);
    return "centro";
  };

  /* ---- ARMAZENAGEM ---- */
  G.rack = function (c, v) {   /* rack (de piso ou suspenso) e, se a ficha é alta, o painel ripado de home */
    var L = L_(v), Pz = P_(v), A = A_(v), corpo = v.Acabamento, fr = v.Detalhe, hr = Math.min(0.55, A);
    if (A > 1.0) {
      c.caixa(corpo, 0, 0, 0.0125, L, A, 0.025);
      var nr = Math.floor(L / 0.07); for (var i = 0; i < nr; i++) c.caixa(corpo, -L / 2 + (L - nr * 0.07) / 2 + 0.035 + i * 0.07, 0, 0.0375, 0.035, A, 0.02);
      var yR = 0.25, hR = Math.min(0.42, A * 0.22), D2 = Math.max(0.2, Pz - 0.05);
      c.caixaR(corpo, 0, yR, 0.05 + D2 / 2, L * 0.92, hR, D2, 0.005, { k: 1 });
      var n2 = Math.max(2, Math.round(L * 0.92 / 0.6)), w2 = L * 0.92 / n2;
      for (var j = 0; j < n2; j++) { var xj = -L * 0.46 + w2 * (j + 0.5); if (j === 1 && n2 >= 3) continue; portaGiro(c, "porta" + (j + 1), fr, xj, yR + 0.01, 0.05 + D2, w2 - 0.01, hR - 0.02, j % 2 ? 1 : -1, "liso", null); }
      c.caixa(MAT.GRAFITE, 0, yR + hR + 0.45, 0.05 + 0.11, L * 0.6, 0.02, 0.22);
      return "";
    }
    var y0 = cl(A * 0.25, 0.08, 0.2), h = A - y0;
    pes4(c, v.Estrutura, L, Pz, 0, y0 + 0.005, 0.08, tem(v, /palito|madeira/) ? "palito" : "quadrado");
    c.caixaR(corpo, 0, y0, Pz / 2, L, h, Pz, 0.006, { k: 1 });
    var n = Math.max(2, Math.round(L / 0.55)), w = L / n;
    for (var k = 0; k < n; k++) {
      var x = -L / 2 + w * (k + 0.5);
      if (k === Math.floor(n / 2) && n >= 3) { c.caixa(MAT.GRAFITE, x, y0 + 0.02, Pz - 0.02 - (Pz - 0.06) / 2 + 0.0, w - 0.03, h - 0.04, 0.01); c.caixa(corpo, x, y0 + h / 2, Pz / 2, w - 0.04, 0.018, Pz - 0.04); continue; }
      if (tem(v, /gaveta/) && k === 0) gaveta(c, "gaveta" + (k + 1), fr, x, y0 + 0.01, Pz, w - 0.012, h - 0.02, Pz - 0.06, v.Estrutura);
      else portaGiro(c, "porta" + (k + 1), fr, x, y0 + 0.01, Pz, w - 0.012, h - 0.02, k % 2 ? 1 : -1, tem(v, /ripad|friso/) ? "friso" : "liso", null);
    }
    return "";
  };
  G.aparador = function (c, v) {
    reusar(c, "ra-mob-aparador", { Comprimento: L_(v), Profundidade: P_(v), Altura: A_(v), Altura_pe: cl(A_(v) * 0.18, 0.08, 0.2), Corpo: v.Acabamento, Tampo: v.Detalhe });
    return "";
  };
  G.buffet = function (c, v) {   /* buffet / bar: gavetas em cima, portas embaixo (frisadas), pés; "adega" leva grade de garrafas */
    var L = L_(v), Pz = P_(v), A = A_(v), corpo = v.Acabamento, y0 = cl(A * 0.17, 0.08, 0.2), h = A - y0, e = 0.025;
    pes4(c, v.Estrutura, L, Pz, 0, y0 + 0.005, 0.07, "palito");
    c.caixaR(corpo, 0, y0, Pz / 2, L, h - e, Pz - 0.01, 0.005, { k: 1 });
    c.caixaR(v.Detalhe, 0, A - e, Pz / 2, L, e, Pz, 0.004, { k: 1 });
    var n = Math.max(2, Math.round(L / 0.5)), w = L / n, hg = Math.min(0.16, h * 0.22);
    for (var i = 0; i < n; i++) {
      var x = -L / 2 + w * (i + 0.5);
      if (tem(v, /adega|bar|garraf/) && i === n - 1) {
        c.caixa(MAT.PRETO, x, y0 + 0.02, Pz - 0.02 - 0.3, w - 0.03, h - e - 0.04, 0.01);
        for (var a = 0; a < 4; a++) c.caixa(corpo, x, y0 + 0.04 + a * (h - e - 0.08) / 4, Pz / 2, w - 0.04, 0.012, Pz - 0.04);
        continue;
      }
      gaveta(c, "gaveta" + (i + 1), corpo, x, y0 + h - e - hg - 0.005, Pz, w - 0.01, hg, Pz - 0.08, null);
      portaGiro(c, "porta" + (i + 1), corpo, x, y0 + 0.01, Pz, w - 0.01, h - e - hg - 0.03, i % 2 ? 1 : -1, "friso", v.Estrutura);
    }
    return "";
  };
  G.criado = function (c, v) {
    reusar(c, "ra-mob-criado", { Largura: L_(v), Profundidade: P_(v), Altura: A_(v), Altura_pe: cl(A_(v) * 0.22, 0.06, 0.2), Corpo: v.Acabamento });
    return "";
  };
  G.cabeceira = function (c, v) {   /* cabeceira/painel: gomos estofados verticais sobre base de madeira (P grosso: nichos laterais) */
    var L = L_(v), Pz = P_(v), A = A_(v), tec = v.Acabamento, esp = Math.min(Pz, 0.12), n = cl(Math.round(L / 0.3), 3, 10), w = L / n, eb = esp * 0.4, eg = esp - eb;
    c.caixa(v.Detalhe, 0, 0, eb / 2, L, A, eb);
    for (var i = 0; i < n; i++) c.caixaR(tec, -L / 2 + w * (i + 0.5), A * 0.32, eb + eg / 2, w - 0.008, A * 0.68 - 0.005, eg, Math.min(0.022, eg / 2.2), { k: 2 });
    if (Pz > 0.2) [-1, 1].forEach(function (s) { c.caixaR(v.Detalhe, s * (L / 2 - 0.25), 0.45, Pz / 2, 0.5, 0.2, Pz, 0.004, { k: 1 }); });
    return "";
  };
  G.guardaRoupa = function (c, v) {
    var L = L_(v), mod = norm(v.Modelo), correr = /correr/.test(mod), m = /(\d+)\s*portas?/.exec(mod), np = m ? +m[1] : (correr ? (L > 2.2 ? 3 : 2) : Math.max(2, Math.round(L / 0.45)));
    reusar(c, "ra-mob-guarda-roupa", { Largura: L, Profundidade: P_(v), Altura: A_(v), Altura_bagageiro: A_(v) > 2.1 ? 0.4 : 0, Tipo_porta: correr ? "correr" : "abrir", Portas: cl(np, 2, 8),
      Corpo: v.Detalhe, Frente: v.Acabamento, Espelho: /espelh/.test(mod) });
    return "";
  };
  G.comoda = function (c, v) {   /* cômoda (gavetas) ou sapateira (portas basculantes) */
    var L = L_(v), Pz = P_(v), A = A_(v), corpo = v.Acabamento, y0 = cl(A * 0.1, 0.05, 0.14), h = A - y0, sap = tem(v, /sapateir/);
    pes4(c, v.Estrutura, L, Pz, 0, y0 + 0.005, 0.05, "quadrado");
    c.caixaR(corpo, 0, y0, Pz / 2, L, h, Pz - 0.01, 0.005, { k: 1 });
    var col = L > 1.1 ? 2 : 1, lin = cl(Math.round(h / (sap ? 0.3 : 0.2)), 2, 9), w = L / col, hh = h / lin;
    for (var j = 0; j < col; j++) for (var i = 0; i < lin; i++) {
      var x = -L / 2 + w * (j + 0.5), y = y0 + 0.008 + i * hh, id = (sap ? "porta" : "gaveta") + (j * lin + i + 1);
      if (sap) { (function (xx, yy, ii) { c.parte(ii, { tipo: "basculante", eixo: [xx, yy, Pz + 0.009], angulo: 35, sentido: 1 }, function () { H.porta(c, corpo, xx, yy, Pz - 0.005, w - 0.01, hh - 0.012, 0.018, "liso"); H.cava(c, xx, yy + hh - 0.04, Pz + 0.013, w * 0.5); }); })(x, y, id); }
      else gaveta(c, id, corpo, x, y, Pz - 0.005, w - 0.01, hh - 0.012, Pz - 0.08, v.Detalhe === corpo ? null : v.Detalhe);
    }
    return "";
  };
  G.estante = function (c, v) {   /* estante de livros: laterais, prateleiras, fundo e livros */
    var L = L_(v), Pz = P_(v), A = A_(v), mat = v.Acabamento, e = 0.02, n = cl(Math.round(A / 0.36), 2, 8), col = L > 1.1 ? 2 : 1;
    c.caixa(mat, -L / 2 + e / 2, 0, Pz / 2, e, A, Pz); c.caixa(mat, L / 2 - e / 2, 0, Pz / 2, e, A, Pz);
    c.caixa(mat, 0, 0, 0.004, L - 2 * e, A, 0.008);
    if (col === 2) c.caixa(mat, 0, 0, Pz / 2, e, A - e, Pz - 0.01);
    for (var i = 0; i <= n; i++) {
      var y = i === 0 ? 0.04 : (i === n ? A - e : 0.04 + i * (A - 0.04 - e) / n);
      c.caixa(mat, 0, y, Pz / 2, L - 2 * e, e, Pz - 0.005);
      if (i < n && (i % 2 === 0 || i === 1)) livros(c, -L / 2 + e + 0.02, (col === 2 && i % 2 ? 0 : L / 2 - e - 0.03), y + e, Pz / 2 + 0.01, Pz, 11 + i);
    }
    c.caixa(mat, 0, 0, Pz - 0.01, L - 2 * e, 0.04, 0.02);
    return "";
  };
  G.estanteMetal = function (c, v) {   /* estante industrial: cantoneiras de aço, prateleiras de madeira e travamento em X */
    var L = L_(v), Pz = P_(v), A = A_(v), es = v.Estrutura, mat = v.Acabamento, n = cl(Math.round(A / 0.4), 2, 6);
    [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(function (s) { c.caixa(es, s[0] * (L / 2 - 0.0125), 0, s[1] ? Pz - 0.0125 : 0.0125, 0.025, A, 0.025); });
    for (var i = 0; i < n; i++) { var y = 0.08 + i * (A - 0.11) / (n - 1); c.caixa(mat, 0, y, Pz / 2, L - 0.01, 0.025, Pz - 0.01); c.caixa(es, 0, y - 0.025, Pz - 0.0125, L - 0.05, 0.025, 0.012); c.caixa(es, 0, y - 0.025, 0.0125, L - 0.05, 0.025, 0.012); }
    var diag = Math.atan2(A - 0.2, L - 0.06) * 180 / Math.PI, comp = Math.sqrt(Math.pow(A - 0.2, 2) + Math.pow(L - 0.06, 2));
    c.cil(es, 0, A / 2, 0.006, 0.004, comp, { seg: 6, centro: true, rotZ: 90 - diag });
    c.cil(es, 0, A / 2, 0.006, 0.004, comp, { seg: 6, centro: true, rotZ: -(90 - diag) });
    return "";
  };
  G.nicho = function (c, v) {   /* nicho (caixa aberta) ou prateleira (tábua com suporte oculto) */
    var L = L_(v), Pz = P_(v), A = A_(v), mat = v.Acabamento;
    if (A < 0.08) { c.caixaR(mat, 0, 0, Pz / 2, L, A, Pz, 0.003, { k: 1 }); return ""; }
    var col = cl(Math.round(L / Math.max(0.2, A)), 1, 4), w = L / col;
    for (var i = 0; i < col; i++) corpoCaixa(c, mat, w - 0.002, Pz, 0, A, 0.015), c.empilhar(0, 0, 0, 0), c.desempilhar();
    if (col > 1) { c.ordem.length = 0; c.grupos = {}; c.env = null; c.tri = 0; for (var j = 0; j < col; j++) c.grupo(-L / 2 + w * (j + 0.5), 0, 0, 0, function (k) { corpoCaixa(k, mat, w - 0.004, Pz, 0, A, 0.015); }); }
    return "";
  };
  G.gaveteiro = function (c, v) {   /* gaveteiro de escritório com rodízios: 3 gavetas (ou 2 + pasta suspensa) */
    var L = L_(v), Pz = P_(v), A = A_(v), corpo = v.Acabamento, y0 = 0.06, h = A - y0;
    [[-1, 0.06], [1, 0.06], [-1, Pz - 0.06], [1, Pz - 0.06]].forEach(function (s) { c.cil(MAT.BORRACHA, s[0] * (L / 2 - 0.05), 0.025, s[1], 0.025, 0.025, { seg: 10, rotZ: 90, centro: true }); c.caixa(MAT.PRETO, s[0] * (L / 2 - 0.05), 0.04, s[1], 0.02, 0.02, 0.02); });
    c.caixaR(corpo, 0, y0, Pz / 2, L, h, Pz, 0.004, { k: 1 });
    var hs = [0.15, 0.15, h - 0.33];
    var y = y0 + 0.01;
    for (var i = 2; i >= 0; i--) { gaveta(c, "gaveta" + (3 - i), v.Detalhe, 0, y, Pz, L - 0.02, hs[i] - 0.01, Pz - 0.08, null); y += hs[i]; }
    return "";
  };
  G.armario = function (c, v) {   /* armário de escritório (baixo ou alto): portas de giro e puxadores */
    var L = L_(v), Pz = P_(v), A = A_(v), corpo = v.Acabamento, rod = 0.06;
    c.caixa(MAT.PRETO, 0, 0, Pz / 2 - 0.02, L - 0.04, rod, Pz - 0.05);
    c.caixaR(corpo, 0, rod, Pz / 2, L, A - rod, Pz - 0.01, 0.004, { k: 1 });
    var n = Math.max(2, Math.round(L / 0.45)), w = L / n, linhas = A > 1.3 ? 2 : 1, hh = (A - rod - 0.01) / linhas;
    for (var r = 0; r < linhas; r++) for (var i = 0; i < n; i++) portaGiro(c, "porta" + (r * n + i + 1), v.Detalhe, -L / 2 + w * (i + 0.5), rod + 0.005 + r * hh, Pz - 0.005, w - 0.008, hh - 0.008, i % 2 ? 1 : -1, "liso", v.Estrutura);
    return "";
  };
  G.vitrine = function (c, v) {   /* vitrine/expositor: base, cantoneiras, vidros, prateleiras de vidro e topo */
    var L = L_(v), Pz = P_(v), A = A_(v), es = v.Estrutura, base = v.Acabamento, hb = A < 1.2 ? A * 0.55 : 0.12;
    c.caixaR(base, 0, 0, Pz / 2, L, hb, Pz, 0.004, { k: 1 });
    var hv = A - hb - 0.04;
    [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(function (s) { c.caixa(es, s[0] * (L / 2 - 0.01), hb, s[1] ? Pz - 0.01 : 0.01, 0.02, hv, 0.02); });
    c.caixa(M.VIDRO, 0, hb, Pz - 0.004, L - 0.04, hv, 0.006); c.caixa(M.VIDRO, -L / 2 + 0.004, hb, Pz / 2, 0.006, hv, Pz - 0.04); c.caixa(M.VIDRO, L / 2 - 0.004, hb, Pz / 2, 0.006, hv, Pz - 0.04);
    c.caixa(MAT.ESPELHO, 0, hb, 0.004, L - 0.04, hv, 0.006);
    var np = cl(Math.round(hv / 0.4), 1, 4); for (var i = 1; i <= np; i++) c.caixa(M.VIDRO, 0, hb + i * hv / (np + 1), Pz / 2, L - 0.05, 0.008, Pz - 0.05);
    c.caixaR(base, 0, A - 0.04, Pz / 2, L, 0.04, Pz, 0.004, { k: 1 });
    return "";
  };
  G.cabideiro = function (c, v) {   /* cabideiro de pé, banco de hall ou painel de hall com ganchos e banco */
    var L = L_(v), Pz = P_(v), A = A_(v), mad = v.Acabamento, es = v.Estrutura, i;
    if (A > 1.4 && L < 0.7) {
      c.cil(es, 0, 0, 0, Math.min(L, Pz) / 2 - 0.01, 0.025, { seg: 24 }); c.cil(mad, 0, 0.025, 0, 0.018, A - 0.06, { seg: 10 }); c.elipsoide(mad, 0, A - 0.025, 0, 0.025, 0.025, 0.025, { seg: 10 });
      for (i = 0; i < 6; i++) { var a = i * 60 * Math.PI / 180, yy = A - 0.12 - (i % 2) * 0.12; c.cil(es, Math.cos(a) * 0.05, yy, Math.sin(a) * 0.05, 0.008, 0.12, { seg: 6, rotZ: -Math.cos(a) * 55, rotX: Math.sin(a) * 55 }); }
      return "centro";
    }
    var hb = Math.min(0.48, A);
    pes4(c, es, L, Pz, 0, Math.max(0.05, hb - 0.04), 0.04, "quadrado");
    c.caixaR(mad, 0, hb - 0.04, Pz / 2, L, 0.04, Pz, 0.004, { k: 1 });
    c.caixa(mad, 0, 0.12, Pz / 2, L - 0.06, 0.02, Pz - 0.04);
    if (A > 0.9) { c.caixa(mad, 0, A - 0.45, 0.01, L, 0.45, 0.02); for (i = 0; i < Math.max(3, Math.round(L / 0.2)); i++) c.cil(es, -L / 2 + 0.1 + i * (L - 0.2) / Math.max(2, Math.round(L / 0.2) - 1), A - 0.22, 0.02, 0.008, 0.08, { seg: 6, rotX: 70 }); }
    return "";
  };
  G.tanque = function (c, v) {   /* tanque de lavanderia com gabinete (tanque com esfregador; sem gabinete se a ficha é baixa) */
    var L = L_(v), Pz = P_(v), A = A_(v), hT = Math.min(0.3, A * 0.45), yT = A - hT, louca = v.Detalhe;
    if (A > 0.6) {
      c.caixa(MAT.PRETO, 0, 0, Pz / 2 - 0.02, L - 0.04, 0.08, Pz - 0.06);
      c.caixaR(v.Acabamento, 0, 0.08, Pz / 2, L, yT - 0.08, Pz - 0.02, 0.004, { k: 1 });
      portaGiro(c, "porta1", v.Acabamento, 0, 0.09, Pz - 0.01, L - 0.02, yT - 0.11, -1, "liso", MAT.CROMO);
    } else { c.torno(louca, 0, 0, Pz * 0.4, [[0.14, 0], [0.12, 0.05], [0.1, yT * 0.5], [0.13, yT]], { seg: 20, ez: 0.7 }); }
    var ext = Mob.contornoRR(L, Pz, 0.03, 4), int = Mob.contornoRR(L - 0.06, Pz * 0.62, 0.04, 4);
    c.bandeja(louca, louca, 0, yT, Pz / 2, ext, int.map(function (q) { return [q[0], q[1] + Pz * 0.14]; }), hT, 0.03);
    for (var i = 0; i < 6; i++) c.caixa(louca, 0, A - 0.02, Pz / 2 - Pz * 0.3 + i * 0.022, L - 0.1, 0.012, 0.01);
    return "";
  };

  /* ---- CAMAS ---- */
  G.cama = function (c, v) {   /* cama: só a base box (ficha baixa), base + colchão, ou completa com cabeceira (reusa a cama da biblioteca) */
    var L = L_(v), Pz = P_(v), A = A_(v), base = v.Acabamento;
    if (A >= 0.75) {
      reusar(c, "ra-mob-cama", { Largura_colchao: L - 0.22, Comprimento_colchao: Pz - 0.16, Altura_base: 0.3, Altura_colchao: cl(num(v.Altura_colchao, 0.26), 0.15, 0.35), Altura_cabeceira: A,
        Travesseiros: L > 1.8 ? 4 : (L < 1.2 ? 1 : 2), Base: base, Cabeceira: v.Detalhe });
      return "";
    }
    [[-1, 0.12], [1, 0.12], [-1, Pz - 0.12], [1, Pz - 0.12]].forEach(function (s) { c.cil(MAT.PRETO, s[0] * (L / 2 - 0.08), 0, s[1], 0.03, 0.08, { r2: 0.022, seg: 10 }); });
    var hb = A < 0.45 ? A - 0.07 : Math.min(0.3, A * 0.5);
    c.caixaR(base, 0, 0.07, Pz / 2, L, hb, Pz, 0.025, { k: 2 });
    if (A >= 0.45) {
      var yc = A - 0.12;   /* colchão até A − 12 cm; lençol, manta e travesseiros completam a altura da ficha */
      c.caixaR(MAT.COLCHAO, 0, 0.07 + hb, Pz / 2, L - 0.02, Math.max(0.08, yc - 0.07 - hb), Pz - 0.02, 0.05, { k: 2 });
      c.caixaR(MAT.ROUPA, 0, yc - 0.01, Pz / 2 + 0.02, L, 0.03, Pz - 0.06, 0.012, { k: 1 });
      c.caixaR(v.Detalhe, 0, yc - 0.005, Pz * 0.68, L + 0.02, 0.04, Pz * 0.55, 0.02, { k: 2 });
      c.caixaR(MAT.ROUPA, -L / 4 + 0.02, yc + 0.02, 0.32, Math.min(0.62, L / 2 - 0.08), 0.1, 0.38, 0.045, { k: 2 });
      if (L > 1.2) c.caixaR(MAT.ROUPA, L / 4 - 0.02, yc + 0.02, 0.32, Math.min(0.62, L / 2 - 0.08), 0.1, 0.38, 0.045, { k: 2 });
    }
    return "";
  };
  G.beliche = function (c, v) {   /* beliche (dois leitos, escada e grade) ou cama infantil com grade */
    var L = L_(v), Pz = P_(v), A = A_(v), mad = v.Acabamento, p = 0.06, i;
    var leitos = A > 1.3 ? [0.25, A - 0.62] : [Math.min(0.2, A * 0.25)], baixa = A < 0.75;
    [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(function (s) { c.caixa(mad, s[0] * (L / 2 - p / 2), 0, s[1] ? Pz - p / 2 : p / 2, p, A, p); });
    leitos.forEach(function (y) {
      c.caixa(mad, 0, y, p / 2, L - 2 * p, 0.12, 0.025); c.caixa(mad, 0, y, Pz - p / 2, L - 2 * p, 0.12, 0.025);
      c.caixa(mad, -L / 2 + p / 2, y, Pz / 2, 0.025, 0.12, Pz - 2 * p); c.caixa(mad, L / 2 - p / 2, y, Pz / 2, 0.025, 0.12, Pz - 2 * p);
      var hcol = Math.min(0.16, A - y - 0.08);
      c.caixaR(MAT.COLCHAO, 0, y + 0.04, Pz / 2, L - 2 * p - 0.01, hcol, Pz - 2 * p - 0.01, Math.min(0.04, hcol / 2.5), { k: 2 });
      c.caixaR(MAT.ROUPA, 0, y + 0.03 + hcol, Pz / 2 + 0.05, L - 2 * p, 0.03, Pz - 2 * p - 0.2, 0.012, { k: 1 });
    });
    if (baixa) return "";
    var yt = leitos[leitos.length - 1];
    c.caixa(mad, 0, yt + 0.12, Pz - p / 2, L - 2 * p, 0.04, 0.03); c.caixa(mad, 0, yt + 0.3, Pz - p / 2, L - 2 * p, 0.04, 0.03);
    for (i = 0; i < 4; i++) c.caixa(mad, -L / 2 + p + 0.05 + i * (L - 2 * p - 0.1) / 3, yt + 0.12, Pz - p / 2, 0.025, 0.2, 0.025);
    if (leitos.length > 1) { var xe = L / 2 - p / 2; for (i = 1; i <= 4; i++) c.cilH(mad, xe + 0.0, i * (yt / 4.2), Pz * 0.2, 0.014, 0.36, "z", { seg: 8 }); }
    return "";
  };
  G.colchao = function (c, v) {   /* colchão: corpo, faixa lateral, pillow-top e alças */
    var L = L_(v), Pz = P_(v), A = A_(v), pt = Math.min(0.06, A * 0.25);
    c.caixaR(MAT.COLCHAO, 0, 0, Pz / 2, L, A - pt, Pz, 0.035, { k: 2 });
    c.caixaR(v.Acabamento, 0, (A - pt) * 0.15, Pz / 2, L + 0.004, (A - pt) * 0.7, Pz + 0.004, 0.02, { k: 1 });
    c.caixaR(MAT.COLCHAO, 0, A - pt - 0.005, Pz / 2, L - 0.01, pt + 0.005, Pz - 0.01, Math.min(0.03, pt / 2), { k: 2 });
    [-1, 1].forEach(function (s) { c.caixa(MAT.ROUPA, s * (L / 2 + 0.002), (A - pt) * 0.5, Pz / 2, 0.006, 0.03, 0.14); });
    return "";
  };

  /* ---- ELETRODOMÉSTICOS ---- */
  G.geladeira = function (c, v) {
    var mod = norm(v.Modelo), m = /side/.test(mod) ? "sidebyside" : (/french/.test(mod) ? "frenchdoor" : (/inverse|bottom/.test(mod) ? "inverse" : "duplex"));
    if (!reusar(c, "ra-coz-geladeira", { Largura: L_(v), Altura: A_(v), Profundidade: P_(v), Modelo: m, Acabamento: v.Acabamento })) {
      c.caixaR(v.Acabamento, 0, 0, P_(v) / 2, L_(v), A_(v), P_(v), 0.01, { k: 1 });
    }
    return "";
  };
  G.lavadora = function (c, v) {
    if (!reusar(c, "ra-coz-lavadora", { Largura: L_(v), Altura: A_(v), Profundidade: P_(v), Modelo: tem(v, /superior|tanquinho|top/) ? "superior" : "frontal", Corpo: v.Acabamento })) c.caixaR(v.Acabamento, 0, 0, P_(v) / 2, L_(v), A_(v), P_(v), 0.01, { k: 1 });
    return "";
  };
  G.fogao = function (c, v) {   /* fogão de piso (corpo, forno com visor, painel, mesa com queimadores e trempes) ou cooktop (placa e queimadores) */
    var L = L_(v), Pz = P_(v), A = A_(v), corpo = v.Acabamento, mq = /(\d)\s*(bocas|queimadores|zonas)/.exec(norm(v.Modelo)), nq = mq ? +mq[1] : (L > 0.7 ? 5 : 4), i;
    function mesa(y0, w, d, z0) {
      c.caixaR(/inducao|vitro/.test(norm(v.Modelo)) ? MAT.TELA : MAT.FUME, 0, y0, z0 + d / 2, w, 0.006, d, 0.003, { k: 1 });
      var pos = nq === 5 ? [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25], [0, 0]] : (nq === 2 ? [[-0.25, 0], [0.25, 0]] : [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]);
      var ind = /inducao|vitro|eletric/.test(norm(v.Modelo));
      pos.slice(0, nq).forEach(function (q) {
        var x = q[0] * w, z = z0 + d / 2 + q[1] * d, r = Math.min(w, d) * (q[0] === 0 && q[1] === 0 ? 0.11 : 0.085);
        if (ind) { c.torno(MAT.CROMO, x, y0 + 0.006, z, [[r, 0], [r, 0.0008], [r - 0.004, 0.0008], [r - 0.004, 0]], { seg: 24, aberto: false }); return; }
        c.cil(MAT.PRETO, x, y0 + 0.006, z, r * 0.62, 0.014, { seg: 16 }); c.cil(MAT.PRETO, x, y0 + 0.02, z, r * 0.36, 0.008, { seg: 14 });
        [0, 90].forEach(function (g) { c.caixa(MAT.PRETO, x, y0 + 0.024, z, g ? 0.012 : r * 2.2, 0.012, g ? r * 2.2 : 0.012); });
      });
    }
    if (A < 0.3) { var ym = Math.max(0.01, A - 0.036); mesa(ym, L, Pz, 0); c.caixa(MAT.PRETO, 0, 0, Pz / 2, L - 0.06, ym, Pz - 0.06); for (i = 0; i < nq; i++) c.cil(MAT.INOX, -L / 2 + 0.08 + i * 0.04, ym + 0.006, Pz - 0.04, 0.008, 0.004, { seg: 10 }); return ""; }
    var hm = 0.88 > A - 0.02 ? A - 0.06 : 0.86;
    c.caixa(MAT.PRETO, 0, 0, Pz / 2 - 0.01, L - 0.04, 0.08, Pz - 0.05);
    c.caixaR(corpo, 0, 0.08, Pz / 2, L, hm - 0.08, Pz, 0.004, { k: 1 });
    c.parte("porta_forno", { tipo: "basculante", eixo: [0, 0.12, Pz + 0.01], angulo: 85, sentido: 1 }, function () {
      c.caixaR(corpo, 0, 0.12, Pz + 0.0, L - 0.04, hm - 0.32, 0.02, 0.004, { k: 1 }); c.caixa(MAT.FUME, 0, 0.18, Pz + 0.016, L - 0.18, hm - 0.48, 0.008);
      c.cilH(MAT.INOX, 0, hm - 0.24, Pz + 0.06, 0.012, L - 0.16, "x", { seg: 8 });
    });
    c.caixa(MAT.PRETO, 0, hm - 0.17, Pz - 0.06 + 0.07, L - 0.04, 0.13, 0.004);
    for (i = 0; i < nq + 1; i++) c.cilH(MAT.INOX, -L / 2 + 0.08 + i * (L - 0.16) / nq, hm - 0.1, Pz + 0.03, 0.02, 0.03, "z", { seg: 12 });
    mesa(hm, L - 0.02, Pz - 0.04, 0.0);
    if (A > hm + 0.05) c.caixa(M.VIDRO, 0, hm, 0.03, L - 0.02, A - hm, 0.008);
    return "";
  };
  G.forno = function (c, v) {   /* forno de embutir ou micro-ondas: corpo, porta com visor escuro e painel */
    var L = L_(v), Pz = P_(v), A = A_(v), ac = v.Acabamento, micro = tem(v, /micro/);
    c.caixa(MAT.PRETO, 0, 0, (Pz - 0.025) / 2, L - 0.02, A - 0.01, Pz - 0.025);
    if (micro) {
      c.parte("porta", { tipo: "giro", eixo: [-L / 2, A / 2, Pz], angulo: 100, sentido: -1 }, function () { c.caixaR(MAT.FUME, -0.12 * L / 2 - L * 0.06 + 0.0, 0.0, Pz - 0.025, L * 0.76, A, 0.025, 0.004, { k: 1 }); c.caixa(MAT.TELA, -L * 0.1, 0.05, Pz - 0.003, L * 0.6, A - 0.1, 0.003); });
      c.caixaR(ac, L * 0.38, 0, Pz - 0.025, L * 0.24, A, 0.025, 0.004, { k: 1 });
      for (var i = 0; i < 4; i++) c.cil(MAT.PRETO, L * 0.38, A * 0.7 - i * 0.05, Pz, 0.01, 0.004, { seg: 10, rotX: 90 });
    } else {
      c.caixaR(ac, 0, A - 0.11, Pz - 0.025, L, 0.11, 0.025, 0.004, { k: 1 });
      c.parte("porta", { tipo: "basculante", eixo: [0, 0.0, Pz], angulo: 85, sentido: 1 }, function () { c.caixaR(MAT.FUME, 0, 0, Pz - 0.025, L, A - 0.115, 0.025, 0.004, { k: 1 }); c.cilH(ac, 0, A - 0.16, Pz + 0.03, 0.01, L * 0.7, "x", { seg: 8 }); c.caixa(ac, -L * 0.35, A - 0.17, Pz + 0.005, 0.015, 0.02, 0.03); c.caixa(ac, L * 0.35, A - 0.17, Pz + 0.005, 0.015, 0.02, 0.03); });
      c.cilH(MAT.PRETO, -L * 0.3, A - 0.055, Pz + 0.008, 0.02, 0.02, "z", { seg: 12 }); c.cilH(MAT.PRETO, L * 0.3, A - 0.055, Pz + 0.008, 0.02, 0.02, "z", { seg: 12 });
      c.caixa(MAT.TELA, 0, A - 0.075, Pz + 0.0, 0.12, 0.04, 0.003);
    }
    return "";
  };
  G.lavaLoucas = function (c, v) {
    var L = L_(v), Pz = P_(v), A = A_(v), ac = v.Acabamento;
    c.caixa(MAT.PRETO, 0, 0, Pz / 2 - 0.02, L - 0.04, 0.08, Pz - 0.05);
    c.caixaR(ac, 0, 0.08, Pz / 2, L, A - 0.08, Pz - 0.02, 0.004, { k: 1 });
    c.parte("porta", { tipo: "basculante", eixo: [0, 0.09, Pz], angulo: 85, sentido: 1 }, function () {
      c.caixaR(ac, 0, 0.09, Pz - 0.02, L - 0.01, A - 0.22, 0.02, 0.004, { k: 1 }); c.caixa(MAT.PRETO, 0, A - 0.2, Pz - 0.002, L - 0.01, 0.07, 0.004);
      c.cilH(MAT.INOX, 0, A - 0.17, Pz + 0.025, 0.008, L * 0.5, "x", { seg: 8 });
    });
    c.caixa(MAT.TELA, L * 0.25, A - 0.1, Pz - 0.0, 0.14, 0.03, 0.003);
    return "";
  };
  G.coifa = function (c, v) {   /* coifa de parede (campânula + chaminé) ou depurador plano */
    var L = L_(v), Pz = P_(v), A = A_(v), ac = v.Acabamento;
    if (A < 0.25 || tem(v, /depurador|embutir|slim/)) { c.caixaR(ac, 0, 0, Pz / 2, L, A, Pz, 0.004, { k: 1 }); c.caixa(MAT.FUME, 0, -0.0, Pz / 2, L - 0.1, 0.004, Pz - 0.06); c.caixa(MAT.PRETO, 0, A * 0.4, Pz + 0.0, L * 0.3, 0.02, 0.004); return ""; }
    var hc = Math.min(0.18, A * 0.35);
    c.caixaR(ac, 0, 0, Pz / 2, L, 0.05, Pz, 0.004, { k: 1 });
    c.tronco(ac, 0, 0.05, 0.14, L, Pz * 0.56, 0.3, 0.22, hc, {});
    c.caixa(MAT.INOX, 0, 0.002, Pz / 2, L - 0.04, 0.002, Pz - 0.04);
    c.caixa(ac, 0, 0.05 + hc, 0.12, 0.28, A - 0.05 - hc, 0.24);
    c.caixa(MAT.PRETO, 0, 0.015, Pz + 0.001, L * 0.25, 0.02, 0.002);
    return "";
  };
  G.tv = function (c, v) {   /* TV: tela, moldura fina, corpo traseiro e, se a ficha é funda, base */
    var L = L_(v), Pz = P_(v), A = A_(v), comBase = Pz > 0.12, hb = comBase ? Math.min(0.08, A * 0.1) : 0, ht = A - hb, ze = comBase ? Pz / 2 - 0.02 : 0;
    if (comBase) { c.caixaR(MAT.PRETO, 0, 0, Pz / 2, Math.min(0.4, L * 0.35), 0.012, Pz, 0.004, { k: 1 }); c.caixa(MAT.PRETO, 0, 0.012, Pz / 2, 0.06, hb + 0.06, 0.03); }
    var dTela = comBase ? 0.03 : Math.min(0.025, Pz * 0.45), dCorpo = comBase ? 0.04 : Pz - dTela, zt = comBase ? ze : dCorpo;
    c.caixaR(MAT.PRETO, 0, hb, zt + dTela / 2, L, ht, dTela, 0.004, { k: 1 });
    c.caixa(MAT.TELA, 0, hb + 0.008, zt + dTela - 0.0015, L - 0.016, ht - 0.03, 0.002);
    c.caixaR(MAT.PRETO, 0, hb + ht * 0.2, zt - dCorpo / 2 + 0.001, L * 0.62, ht * 0.55, dCorpo, Math.min(0.01, dCorpo / 3), { k: 1 });
    return "";
  };
  G.arCond = function (c, v) {   /* evaporadora de parede: corpo, aleta de saída inclinada, grade de entrada e visor */
    var L = L_(v), Pz = P_(v), A = A_(v), ac = v.Acabamento;
    c.caixaR(ac, 0, 0.03, Pz / 2, L, A - 0.03, Pz, Math.min(0.04, Pz / 3), { k: 3 });
    c.caixaR(ac, 0, 0.0, Pz * 0.62, L - 0.06, 0.03, Pz * 0.6, 0.01, { k: 1, rotX: -14 });
    for (var i = 0; i < 8; i++) c.caixa(MAT.GRAFITE, 0, A - 0.004, Pz * 0.15 + i * Pz * 0.09, L - 0.1, 0.004, 0.006);
    c.caixa(MAT.TELA, L * 0.3, A * 0.42, Pz + 0.0, 0.05, 0.02, 0.002);
    return "";
  };

  /* ---- ILUMINAÇÃO E DECORAÇÃO ---- */
  function cupula(c, mat, y0, rb, rt, h, seg, ez) { c.torno(mat, 0, y0, 0, [[rb, 0], [rt, h], [rt - 0.004, h], [rb - 0.004, 0.0]], { seg: seg || 28, ez: ez || 1 }); }
  G.lumPiso = function (c, v) {   /* luminária de piso: base, haste e cúpula (ou arco com cúpula pendurada) */
    var L = L_(v), Pz = P_(v), A = A_(v), es = v.Estrutura, cu = v.Acabamento, r = Math.min(L, Pz) / 2;
    if (tem(v, /arco/)) {
      c.caixaR(MAT.MARMORE, -L / 2 + 0.17, 0, 0, 0.32, 0.06, Math.min(0.3, Pz * 0.6), 0.01, { k: 1 });
      var n = 10, R = (L - 0.34) / 2, x0 = -L / 2 + 0.17;
      c.cil(es, x0, 0.06, 0, 0.012, A * 0.55, { seg: 8 });
      for (var i = 0; i < n; i++) { var a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n, xa = x0 + R - Math.cos(a0) * R, ya = A * 0.6 + Math.sin(a0) * (A * 0.36), xb = x0 + R - Math.cos(a1) * R, yb = A * 0.6 + Math.sin(a1) * (A * 0.36);
        var len = Math.sqrt((xb - xa) * (xb - xa) + (yb - ya) * (yb - ya)), ang = Math.atan2(yb - ya, xb - xa) * 180 / Math.PI;
        c.cil(es, (xa + xb) / 2, (ya + yb) / 2, 0, 0.011, len + 0.004, { seg: 8, centro: true, rotZ: ang - 90 }); }
      var rc = Pz / 2 - 0.004; c.torno(cu, L / 2 - rc, A * 0.45, 0, [[rc, 0], [rc * 0.6, 0.15], [0.03, 0.17], [0, 0.18]], { seg: 24 });
      return "centro";
    }
    c.cil(es, 0, 0, 0, r * 0.75, 0.025, { seg: 24 }); c.cil(es, 0, 0.025, 0, 0.011, A - 0.3, { seg: 8 });
    cupula(c, cu, A - 0.32, r, r * 0.72, 0.32, 28);
    return "centro";
  };
  G.pendente = function (c, v) {   /* pendente: canopla no teto (A), cabo e cúpula (domo, cone ou globo) */
    var L = L_(v), Pz = P_(v), A = A_(v), cu = v.Acabamento, r = Math.min(L, Pz) / 2, hc = Math.min(A * 0.45, r * 1.2), mod = norm(v.Modelo);
    if (L > 1.6 * Pz) {   /* pendente linear: barra com difusor e dois cabos */
      var hb2 = Math.min(0.08, A * 0.3);
      c.caixaR(cu, 0, 0, 0, L, hb2, Pz, Math.min(0.01, hb2 / 3), { k: 1 }); c.caixa(MAT.ACRILICO, 0, -0.0, 0, L - 0.02, 0.002, Pz - 0.02);
      [-1, 1].forEach(function (s) { c.cil(MAT.PRETO, s * (L / 2 - 0.1), hb2, 0, 0.002, A - hb2 - 0.02, { seg: 6 }); c.cil(v.Estrutura, s * (L / 2 - 0.1), A - 0.02, 0, 0.04, 0.02, { seg: 14 }); });
      return "centro";
    }
    c.cil(v.Estrutura, 0, A - 0.025, 0, 0.06, 0.025, { seg: 18 }); c.cil(MAT.PRETO, 0, hc, 0, 0.002, A - 0.025 - hc, { seg: 6 });
    if (/globo|bola|esfer/.test(mod)) c.elipsoide(M.VIDRO, 0, hc / 2, 0, L / 2, hc / 2, Pz / 2, { seg: 24 });
    else if (/cone|funil/.test(mod)) cupula(c, cu, 0, r, 0.03, hc, 28);
    else c.torno(cu, 0, 0, 0, [[r, 0], [r * 0.96, hc * 0.35], [r * 0.75, hc * 0.75], [r * 0.3, hc * 0.98], [0, hc], [0, hc - 0.003], [r * 0.3 - 0.004, hc * 0.98 - 0.003], [r * 0.75 - 0.004, hc * 0.75 - 0.003], [r * 0.96 - 0.004, hc * 0.35], [r - 0.004, 0.0]], { seg: 28 });
    c.elipsoide(MAT.ACRILICO, 0, Math.min(0.06, hc * 0.4), 0, 0.03, 0.04, 0.03, { seg: 10 });
    return "centro";
  };
  G.abajur = function (c, v) {   /* abajur: base torneada, haste e cúpula de tecido */
    var L = L_(v), Pz = P_(v), A = A_(v), r = L / 2, ez = Pz / L, hb = A * 0.45;   /* cúpula oval quando a ficha é mais larga que funda */
    c.torno(v.Estrutura, 0, 0, 0, [[r * 0.45, 0], [r * 0.5, hb * 0.3], [r * 0.38, hb * 0.8], [0.012, hb]], { seg: 22, ez: ez });
    c.cil(MAT.CROMO, 0, hb, 0, 0.006, A * 0.2, { seg: 6 });
    cupula(c, v.Acabamento, A - A * 0.38, r, r * 0.7, A * 0.38, 28, ez);
    return "centro";
  };
  G.plafon = function (c, v) {   /* plafon (disco com difusor), spot ou trilho com spots — a caixa vai do ponto mais baixo (0) ao teto (A) */
    var L = L_(v), Pz = P_(v), A = A_(v), es = v.Estrutura, mod = norm(v.Modelo), i;
    if (/trilho/.test(mod) && L > 0.3) {
      var hr = Math.min(0.03, A * 0.45), n = cl(Math.round(L / 0.3), 2, 6);
      c.caixa(es, 0, A - hr, 0, L, hr, Math.min(Pz, 0.035));
      for (i = 0; i < n; i++) {
        var x = -L / 2 + L * (i + 0.5) / n;
        if (A > 0.1) { c.cil(es, x, A - hr - 0.04, 0, 0.012, 0.04, { seg: 8 }); c.cil(es, x, 0, 0, Math.min(0.03, Pz / 2 - 0.002), A - hr - 0.04, { seg: 14 }); }
        else c.cilH(es, x, (A - hr) / 2 + 0.0005, 0, Math.max(0.004, (A - hr) / 2), Math.min(0.08, Pz), "z", { seg: 12 });
      }
      return "centro";
    }
    if (/spot/.test(mod) || L < 0.2) { c.cil(es, 0, A - Math.min(0.015, A * 0.2), 0, Math.min(L, Pz) / 2, Math.min(0.015, A * 0.2), { seg: 20 }); c.cil(es, 0, 0, 0, Math.min(L, Pz) / 2 * 0.7, A - Math.min(0.015, A * 0.2), { seg: 18 }); return "centro"; }
    if (Math.abs(L - Pz) > 0.1) { c.caixaR(es, 0, 0, 0, L, A, Pz, Math.min(0.01, A / 3), { k: 1 }); c.caixa(MAT.ACRILICO, 0, -0.0, 0, L - 0.02, 0.002, Pz - 0.02); return "centro"; }
    c.cil(es, 0, A * 0.5, 0, L / 2, A * 0.5, { seg: 36 });
    c.torno(MAT.ACRILICO, 0, 0, 0, [[L / 2 - 0.01, A * 0.5], [L / 2 * 0.8, A * 0.15], [0, 0]], { seg: 36 });
    return "centro";
  };
  G.cortina = function (c, v) {   /* cortina de tecido pregueado no trilho ou persiana/rolô (tubo, tela e barra) */
    var L = L_(v), Pz = P_(v), A = A_(v), tec = v.Acabamento;
    if (tem(v, /persiana|rolo|romana|blackout rolo/)) {
      var hbd = Math.min(0.09, A * 0.05);   /* bandô (caixa do rolo) no topo, tela descendo e barra de peso embaixo */
      c.caixaR(MAT.LACA, 0, A - hbd, Pz / 2, L, hbd, Pz, 0.004, { k: 1 }); c.cilH(MAT.PRETO, 0, A - hbd / 2, Pz * 0.5, Math.min(0.025, hbd / 2 - 0.004), L - 0.04, "x", { seg: 12 });
      c.caixa(tec, 0, 0.03, Pz * 0.6, L - 0.03, A - hbd - 0.03, 0.003); c.caixaR(MAT.PRETO, 0, 0.0, Pz * 0.6, L - 0.03, 0.03, Math.min(0.016, Pz * 0.3), 0.006, { k: 1 });
      return "";
    }
    var rv = Math.min(0.012, Pz * 0.15);
    c.cilH(v.Estrutura, 0, A - 0.02, Pz * 0.5, rv, L - 0.02, "x", { seg: 10 });
    [-1, 1].forEach(function (s) { c.cil(v.Estrutura, s * (L / 2 - 0.01), A - 0.02, Pz * 0.5, rv * 1.6, 0.02, { seg: 10, rotZ: 90, centro: true }); c.caixa(v.Estrutura, s * (L / 2 - 0.1), A - 0.04, Pz * 0.25, 0.015, 0.03, Pz * 0.5); });
    var n = cl(Math.round(L / 0.11), 6, 40), amp = Math.max(0.005, Pz * 0.45 - 0.005), frente = [], tras = [], k;
    for (k = 0; k <= n * 4; k++) { var x = -L / 2 + 0.02 + (L - 0.04) * k / (n * 4), z = Pz * 0.5 + Math.sin(k / 4 * Math.PI * 2) * amp; frente.push([x, z + 0.004]); tras.push([x, z - 0.004]); }
    c.prisma(tec, 0, 0.01, 0, frente.concat(tras.reverse()), A - 0.05);
    return "";
  };
  G.espelho = function (c, v) {   /* espelho na parede: moldura e vidro (redondo, oval, orgânico ou retangular) */
    var L = L_(v), Pz = P_(v), A = A_(v), mol = v.Estrutura, mod = norm(v.Modelo), e = Math.max(0.006, Pz);
    if (/redond|oval|organic|circ/.test(mod)) {
      c.prisma(mol, 0, A / 2, 0, Mob.contornoElipse(L / 2, A / 2, 48), e * 0.7, { rotX: 90 });
      c.prisma(MAT.ESPELHO, 0, A / 2, 0, Mob.contornoElipse(L / 2 - 0.018, A / 2 - 0.018, 48), e, { rotX: 90 });
    } else {
      c.caixa(mol, 0, 0, e * 0.35, L, A, e * 0.7);
      c.caixa(MAT.ESPELHO, 0, 0.02, e * 0.7 + 0.0015, L - 0.04, A - 0.04, 0.003);
    }
    return "";
  };
  G.vaso = function (c, v) {   /* vaso decorativo (e planta artificial, se for o caso) */
    var L = L_(v), Pz = P_(v), A = A_(v), mat = v.Acabamento, r = Math.min(L, Pz) / 2, comPlanta = tem(v, /planta|artificial|folha|arvore|costela|samambaia|ficus|oliveira/), hv = comPlanta ? A * 0.4 : A;
    c.torno(mat, 0, 0, 0, [[r * 0.6, 0], [r * 0.95, hv * 0.35], [r, hv * 0.6], [r * 0.7, hv * 0.92], [r * 0.72, hv], [r * 0.66, hv], [r * 0.64, hv * 0.92]], { seg: 24 });
    if (comPlanta) {
      c.cil(MAT.TERRA, 0, hv * 0.9, 0, r * 0.62, hv * 0.06, { seg: 18 });
      var rnd = Mob.sorteio(9), nf = 14;
      for (var i = 0; i < nf; i++) c.lamina(i % 3 ? "folha verde" : "folha verde escura", Math.cos(i * 2.4) * 0.01, hv * 0.95, Math.sin(i * 2.4) * 0.01, (A - hv) * (0.95 + rnd() * 0.15), r * 0.45, { rotY: i * 360 / nf + rnd() * 15, inclina: 80 + rnd() * 8, curva: 25 + rnd() * 20, seg: 6 });
    }
    return "centro";
  };
  G.quadro = function (c, v) {   /* quadro/painel: moldura, tela e a arte em faixas de cor */
    var L = L_(v), Pz = P_(v), A = A_(v), e = Math.max(0.02, Pz), mol = v.Estrutura;
    c.caixa(mol, 0, 0, e / 2, L, A, e);
    c.caixa("laca branca", 0, 0.03, e + 0.0005, L - 0.06, A - 0.06, 0.002);
    var cores = [v.Acabamento, "tecido terracota", "tecido azul", "tecido bege"], rnd = Mob.sorteio(Math.round(L * 100 + A * 10));
    for (var i = 0; i < 3; i++) c.caixa(cores[i % cores.length], -L / 4 + rnd() * L / 2 * 0.5, 0.08 + rnd() * A * 0.4, e + 0.0015, (L - 0.2) * (0.25 + rnd() * 0.3), (A - 0.2) * (0.2 + rnd() * 0.35), 0.001);
    return "";
  };
  G.tapete = function (c, v) {
    reusar(c, "ra-mob-tapete", { Formato: tem(v, /redond/) ? "redondo" : "retangular", Largura: L_(v), Profundidade: P_(v), Espessura: Math.max(0.0005, A_(v) - 0.0015), Miolo: v.Acabamento, Borda: v.Detalhe });
    return "centro";
  };
  G.espreguicadeira = function (c, v) {   /* espreguiçadeira (estrutura, rodas, colchonete, encosto inclinado) ou poltrona externa de corda */
    var L = L_(v), Pz = P_(v), A = A_(v), es = v.Estrutura, tec = v.Acabamento;
    if (Pz < 1.2) return G.varanda(c, { Largura: L, Profundidade: Pz, Altura: A, Modelo: "poltrona", Estrutura: es, Acabamento: tec, Detalhe: v.Detalhe });
    var hs = Math.min(0.32, A * 0.85), Le = Math.min(0.75, Pz * 0.38), z0 = -Pz / 2;
    [-1, 1].forEach(function (s) {
      var x = s * (L / 2 - 0.02);
      c.caixa(es, x, hs - 0.05, z0 + Le + (Pz - Le) / 2, 0.035, 0.035, Pz - Le);
      c.cil(es, x, 0, z0 + Le + 0.05, 0.018, hs - 0.04, { seg: 8 }); c.cil(es, x, 0, Pz / 2 - 0.08, 0.018, hs - 0.04, { seg: 8 });
      c.cil(MAT.BORRACHA, x, 0.04, Pz / 2 - 0.08, 0.04, 0.03, { seg: 12, rotZ: 90, centro: true });
    });
    c.caixaR(tec, 0, hs - 0.02, z0 + Le + (Pz - Le) / 2, L - 0.04, 0.07, Pz - Le - 0.02, 0.03, { k: 2 });
    var dzB = Le - 0.05, dyB = A - 0.04 - hs, lb = Math.sqrt(dzB * dzB + dyB * dyB), phi = Math.atan2(dzB, dyB) * 180 / Math.PI;   /* encosto inclinado: da dobradiça (fim do assento) ao topo */
    c.caixaR(tec, 0, hs - 0.02, z0 + Le, L - 0.04, lb, 0.07, 0.03, { k: 2, rotX: -phi });
    [-1, 1].forEach(function (s) { c.caixa(es, s * (L / 2 - 0.02), hs - 0.05, z0 + Le, 0.035, lb, 0.035, { rotX: -phi }); });
    return "centro";
  };

  /* =================================================================== AS 64 CATEGORIAS
   * cat: [gerador, nome da família, tipo de acabamento principal (tec|mad|metal|tampo|louca|eletro|lum), quantos lugares (sofá) ] */
  var CAT = {
    "sofa-2-lugares": ["sofa", "Sofá 2 lugares", "tec", 2], "sofa-3-lugares": ["sofa", "Sofá 3 lugares", "tec", 3], "sofa-retratil-reclinavel": ["retratil", "Sofá retrátil e reclinável", "tec"],
    "sofa-canto-chaise": ["chaise", "Sofá de canto ou com chaise", "tec"], "sofa-espera-longarina": ["longarina", "Longarina de espera", "tec"], "poltrona": ["poltrona", "Poltrona", "tec"],
    "poltrona-externa-espreguicadeira": ["espreguicadeira", "Espreguiçadeira e poltrona externa", "tec"], "puff-banco": ["puff", "Puff e banco estofado", "tec"],
    "cadeira-jantar": ["cadeira", "Cadeira de jantar", "tec"], "cadeira-escritorio-giratoria": ["giratoria", "Cadeira de escritório giratória", "tec"], "cadeira-visitante-fixa": ["visitante", "Cadeira de visitante (fixa)", "tec"],
    "banqueta-bancada": ["banqueta", "Banqueta de bancada", "tec"], "mesa-cadeira-varanda-gourmet": ["varanda", "Mesa e cadeira de varanda / gourmet", "tampo"],
    "mesa-centro": ["mesaCentro", "Mesa de centro", "tampo"], "mesa-lateral": ["mesaLateral", "Mesa lateral", "tampo"],
    "mesa-jantar-4": ["mesaJantar", "Mesa de jantar 4 lugares", "tampo"], "mesa-jantar-6": ["mesaJantar", "Mesa de jantar 6 lugares", "tampo"], "mesa-jantar-8": ["mesaJantar", "Mesa de jantar 8 lugares", "tampo"],
    "mesa-reuniao-4-lugares": ["mesaReuniao", "Mesa de reunião 4 lugares", "tampo"], "mesa-reuniao-6-lugares": ["mesaReuniao", "Mesa de reunião 6 lugares", "tampo"],
    "mesa-reuniao-8-lugares": ["mesaReuniao", "Mesa de reunião 8 lugares", "tampo"], "mesa-reuniao-10-lugares": ["mesaReuniao", "Mesa de reunião 10 lugares", "tampo"],
    "escrivaninha-home-office": ["escrivaninha", "Escrivaninha / home office", "tampo"], "mesa-escritorio-reta-L": ["escrivaninha", "Mesa de escritório (reta ou em L)", "tampo"],
    "balcao-recepcao": ["recepcao", "Balcão de recepção", "mad"], "maca-consultorio-mesa-clinica": ["maca", "Maca de consultório", "tec"],
    "rack-painel-tv": ["rack", "Rack e painel de TV", "mad"], "aparador": ["aparador", "Aparador", "mad"], "buffet-bar": ["buffet", "Buffet e bar", "mad"], "criado-mudo": ["criado", "Criado-mudo", "mad"],
    "cabeceira-painel": ["cabeceira", "Cabeceira e painel de cama", "tec"], "guarda-roupa-pronto": ["guardaRoupa", "Guarda-roupa", "mad"], "comoda-sapateira": ["comoda", "Cômoda e sapateira", "mad"],
    "estante-livros": ["estante", "Estante de livros", "mad"], "estante-industrial-metal": ["estanteMetal", "Estante industrial (metal)", "mad"], "nicho-prateleira-modular": ["nicho", "Nicho e prateleira", "mad"],
    "gaveteiro-arquivo": ["gaveteiro", "Gaveteiro e arquivo", "mad"], "armario-baixo-escritorio": ["armario", "Armário de escritório", "mad"], "vitrine-expositor-loja": ["vitrine", "Vitrine e expositor", "mad"],
    "cabideiro-hall-banco-hall": ["cabideiro", "Cabideiro e banco de hall", "mad"], "tanque-lavanderia-gabinete": ["tanque", "Tanque com gabinete", "mad"],
    "cama-casal": ["cama", "Cama de casal", "tec"], "cama-queen": ["cama", "Cama queen", "tec"], "cama-king": ["cama", "Cama king", "tec"], "cama-solteiro": ["cama", "Cama de solteiro", "tec"],
    "beliche-cama-infantil": ["beliche", "Beliche e cama infantil", "mad"], "colchao": ["colchao", "Colchão", "tec"],
    "geladeira": ["geladeira", "Geladeira", "eletro"], "fogao-cooktop": ["fogao", "Fogão e cooktop", "eletro"], "forno-embutir-micro-ondas": ["forno", "Forno de embutir e micro-ondas", "eletro"],
    "lava-loucas": ["lavaLoucas", "Lava-louças", "eletro"], "coifa-depurador": ["coifa", "Coifa e depurador", "eletro"], "lava-seca-maquina": ["lavadora", "Lava e seca", "eletro"],
    "tv": ["tv", "TV", "eletro"], "ar-condicionado-split": ["arCond", "Ar-condicionado split (evaporadora)", "eletro"],
    "luminaria-piso": ["lumPiso", "Luminária de piso", "lum"], "luminaria-pendente": ["pendente", "Luminária pendente", "lum"], "abajur-mesa": ["abajur", "Abajur", "lum"],
    "plafon-spot-trilho": ["plafon", "Plafon, spot e trilho", "lum"], "cortina-persiana": ["cortina", "Cortina e persiana", "tec"], "espelho-decorativo": ["espelho", "Espelho decorativo", "mad"],
    "vaso-planta-decorativa": ["vaso", "Vaso e planta decorativa", "louca"], "quadro-painel-decorativo": ["quadro", "Quadro e painel decorativo", "tec"], "tapete": ["tapete", "Tapete", "tec"]
  };
  /* HORAS DE MONTAGEM (marceneiro SINAPI 88273, h) — PROVISÓRIO RA, sem produtividade com fonte (DUVIDAS-INTERNAS.md §4):
     o lado conservador (na dúvida, o maior), a medir na obra. 0 = a peça chega pronta (estofado, eletro de piso, tapete, vaso):
     a linha sai com quantidade zero e fica fora do orçamento, dita na lista. Luminária e eletro embutido: a instalação é da elétrica/hidráulica. */
  var HORAS = { sofa: 0.5, chaise: 1, retratil: 1, poltrona: 0.5, longarina: 1, puff: 0, cadeira: 0.5, giratoria: 0.5, visitante: 0.5, banqueta: 0.5, varanda: 0.5,
    mesaCentro: 1, mesaLateral: 0.5, mesaJantar: 2, mesaReuniao: 3, escrivaninha: 2, recepcao: 4, maca: 1, rack: 3, aparador: 2, buffet: 3, criado: 1.5, cabeceira: 2,
    guardaRoupa: 6, comoda: 3, estante: 3, estanteMetal: 2, nicho: 1, gaveteiro: 1.5, armario: 3, vitrine: 3, cabideiro: 1, tanque: 2, cama: 2, beliche: 4, colchao: 0,
    geladeira: 0, lavadora: 0, fogao: 0, forno: 1, lavaLoucas: 1, coifa: 2, tv: 1, arCond: 0, lumPiso: 0, pendente: 0, abajur: 0, plafon: 0, cortina: 1, espelho: 1, vaso: 0, quadro: 0.5, tapete: 0, espreguicadeira: 0 };
  /* a categoria da biblioteca (Navegador) */
  function catBib(cat) {
    if (/geladeira|fogao|forno|lava-loucas|coifa|tanque/.test(cat)) return "cozinha";
    if (/lava-seca|tv|ar-condicionado/.test(cat)) return "equipamento";
    if (/luminaria|abajur|plafon/.test(cat)) return "luminaria";
    if (/varanda|espreguicadeira/.test(cat)) return "lazer";
    return "mobiliario";
  }
  /* o acabamento de cada tipo, pela ficha */
  function acabamentos(cat, kind, p) {
    var t = textoDe(p), c = corPeca(p), o = {};
    if (kind === "tec") { o.Acabamento = cat === "cortina-persiana" ? tecCor(c, M.LINHO) : tecidoDe(p); o.Estrutura = pesDe(p); o.Detalhe = /cabeceira|cama/.test(cat) ? madeiraDe(p, M.MDF_NOG) : (o.Acabamento === "tecido terracota" ? "tecido bege" : "tecido terracota"); if (/cama/.test(cat)) { o.Acabamento = tecidoDe(p); o.Detalhe = tecidoDe(p); } }
    else if (kind === "mad") { o.Acabamento = madeiraDe(p); o.Estrutura = metalDe(p); o.Detalhe = /bicolor|com tampo|tampo/.test(t) ? tampoDe(p, madeiraDe(p, M.MDF_FREI)) : o.Acabamento; if (/guarda-roupa/.test(cat)) o.Detalhe = /branc/.test(t) ? M.MDF_BR : o.Acabamento; }
    else if (kind === "tampo") { o.Acabamento = tampoDe(p); o.Estrutura = /madeira|eucalipto|tauari|pinus/.test(norm(p.m)) && !/(pes?|estrutura|base) (de |em )?(metal|aco|ferro)/.test(t) ? madeiraDe(p, MAT.ESC) : metalDe(p); o.Detalhe = tampoDe(p, M.MDF_FREI); }
    else if (kind === "eletro") { o.Acabamento = /pret|black|grafite/.test(t) && !/inox/.test(norm(p.n)) ? (/vidro/.test(t) ? MAT.FUME : MAT.GRAFITE) : (/branc|white/.test(t) && !/inox/.test(norm(p.n)) ? MAT.LACA : MAT.INOX); o.Estrutura = MAT.PRETO; o.Detalhe = MAT.PRETO; }
    else if (kind === "lum") { o.Acabamento = /vidro|cristal|acrilic/.test(t) ? M.VIDRO : (/palha|rattan|vime|bambu|fibra natural/.test(t) ? M.RATTAN : (/tecido|linho|cupula/.test(t) ? tecCor(c, M.LINHO) : metalDe(p))); o.Estrutura = metalDe(p); o.Detalhe = MAT.PRETO; }
    else { o.Acabamento = /ceramica|terracota/.test(t) ? MAT.CERAMICA : (/concreto|cimento/.test(t) ? M.CONCRETO : (/vidro/.test(t) ? M.VIDRO : (/metal|aco/.test(t) ? metalDe(p) : "louça branca"))); o.Estrutura = MAT.PRETO; o.Detalhe = MAT.PRETO; }
    if (cat === "espelho-decorativo" || cat === "quadro-painel-decorativo") { o.Estrutura = /madeira|mdf|freijo|carvalho|nogueira/.test(t) ? madeiraDe(p) : metalDe(p); if (cat === "quadro-painel-decorativo") o.Acabamento = tecCor(c, "tecido verde"); }
    if (cat === "vaso-planta-decorativa" && /planta|artificial/.test(t) && o.Acabamento === "louça branca") o.Acabamento = MAT.CERAMICA;
    return o;
  }
  /* o MODELO (variante) da peça: o texto que o gerador olha (redonda, correr, cooktop, 5 bocas, palha…) — o nome comercial manda */
  function modeloDe(cat, p) {
    var n = norm(p.n), t = textoDe(p), parts = [];
    [/redond/, /oval/, /organic/, /quadrad/, /retangul/, /pedestal|tulipa|saarinen/, /cavalete|trapezio/, /correr/, /abrir/, /espelh/, /esquerd/, /direit/, /\bl\b|em l\b|canto/, /bau/, /banco/,
     /sapateir/, /gaveta/, /ripad|friso/, /palito/, /adega|bar\b|garraf/, /cooktop/, /inducao/, /vitro/, /micro/, /depurador/, /side/, /french/, /inverse|bottom freezer/, /superior|tanquinho/,
     /persiana|rolo|romana/, /arco/, /globo|bola|esfer/, /cone|funil/, /trilho/, /spot/, /planta|artificial/, /\bcadeira|\bpoltrona/, /treno/, /3 pes|tripe/].forEach(function (re) { var m = re.exec(n); if (m) parts.push(m[0]); });
    var nb = /(\d)\s*(bocas|queimadores|zonas)/.exec(t); if (nb) parts.push(nb[0]);
    var np = /(\d+)\s*portas?/.exec(n); if (np) parts.push(np[0]);
    if (cat === "cadeira-jantar") parts.push(/concha|polipropileno|eames|charles|tulip|eiffel/.test(t) ? "concha" : (/palha|rattan|tela|junco/.test(t) ? "palha" : (/estofad|tecido|linho|veludo|couro|boucle/.test(t) ? "estofada" : "madeira")));
    if (cat === "fogao-cooktop" && !/cooktop/.test(n) && /cooktop/.test(t)) parts.push("cooktop");
    return parts.join(" ");
  }
  function fmtCm(m) { return String(Math.round(m * 1000) / 10).replace(".", ","); }
  function fmtR(v) { var s = (Math.round(v * 100) / 100).toFixed(2).split("."); return "R$ " + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1]; }
  var NOME_EST = { contemporaneo: "contemporâneo", moderno: "moderno", industrial: "industrial", escandinavo: "escandinavo", minimalista: "minimalista", classico: "clássico", rustico: "rústico", boho: "boho", retro: "retrô" };

  /* PREÇO PROVISÓRIO (revisão A1, 20/10/2026): 113 peças (87 de alto padrão "sob consulta") estão com o MAIOR preço da categoria.
     A regra RA manda orçar (incerto = o mais alto), mas a tela e o orçamento têm de dizer "provisório — cotar com o fornecedor" e por quê. */
  function provisorio(p) { return p.pt === "provisorio-maior-da-categoria" || /^\s*provis/i.test(String(p.pf || "")); }
  function motivoPreco(p) {
    if (!provisorio(p)) return "";
    var m = /\(([^)]*)\)/.exec(String(p.pf || "")), dentro = m ? m[1] : "";
    if (/sob consulta/i.test(dentro)) return "fabricante " + dentro + ", sem preço público; valor = o maior preço de varejo lido da categoria";
    return "peça sem preço público; valor = o maior preço lido na categoria" + (dentro ? " (" + dentro + ")" : "");
  }
  var PECAS_POR_CAT = {}, PECA = {};
  D.pecas.forEach(function (p) { (PECAS_POR_CAT[p.c] = PECAS_POR_CAT[p.c] || []).push(p); PECA[p.id] = p; });
  var FAMS = [];
  D.categorias.forEach(function (cat) {
    var cfg = CAT[cat], pecas = (PECAS_POR_CAT[cat] || []).slice();
    if (!cfg || !pecas.length) return;
    pecas.sort(function (a, b) { return a.L - b.L || a.pr - b.pr; });   /* ordenadas pela largura: a lista de troca lê da menor para a maior */
    var gid = cfg[0], gen = G[gid], kind = cfg[2], p0 = pecas[0], a0 = acabamentos(cat, kind, p0);
    var USUAL = "Medida da ficha do fabricante (tipo)";
    var params = [
      P("Largura", "comprimento", p0.L, "Dimensões", USUAL + " — ao longo da parede (X)."), P("Profundidade", "comprimento", p0.P, "Dimensões", USUAL + " — da parede para a frente (Z)."),
      P("Altura", "comprimento", p0.A, "Dimensões", USUAL + " — do piso ao topo."), P("Assento", "comprimento", 0, "Dimensões", "Altura do assento (ficha); 0 = a usual da categoria"),
      P("Espessura_tampo", "comprimento", 0, "Dimensões", "Espessura do tampo (ficha); 0 = a usual"), P("Altura_colchao", "comprimento", 0, "Dimensões", "Altura do colchão (cama completa); 0 = 26 cm"),
      P("Lugares", "inteiro", cfg[3] || 0, "Construção", "Lugares (sofá)"), P("Modelo", "texto", "", "Construção", "Variante lida do nome comercial (redonda, de correr, cooktop, 5 bocas, palha…)"),
      P("Acabamento", "material", a0.Acabamento, "Materiais", "Estofado, corpo, tampo ou cúpula (o principal da peça)"), P("Estrutura", "material", a0.Estrutura, "Materiais", "Pés, base, estrutura ou moldura"),
      P("Detalhe", "material", a0.Detalhe, "Materiais", "Frente, tampo, almofada ou puxador"),
      P("Preco_unitario", "numero", p0.pr, "Catálogo e preço", "R$ por unidade, SEM BDI — só o fornecimento da peça (montagem e frete são outra linha)"),
      P("Fonte_preco", "texto", p0.pf, "Catálogo e preço", "De onde veio o preço (varejo à vista com o site e a data, ou provisório = o maior da categoria)"),
      P("Data_preco", "texto", p0.pd, "Catálogo e preço", "Data da consulta do preço (AAAA-MM-DD)"), P("Composicao_id", "texto", p0.pc || "", "Catálogo e preço", "Composição (SINAPI ou própria PROP-…); vazio = peça de varejo"),
      P("Fabricante", "texto", p0.f || "", "Catálogo e preço"), P("Estilo", "texto", "", "Catálogo e preço", "Estilos da peça (classificação da pesquisa, não da ficha)"),
      P("Url_ficha", "texto", p0.u || "", "Catálogo e preço", "Ficha do fabricante/loja de onde vieram as medidas"), P("Medida_conferir", "texto", "", "Catálogo e preço", "Medida que a ficha não trouxe (veio da mediana da categoria) — conferir no produto comprado"),
      P("Peca_catalogo", "texto", p0.id, "Catálogo e preço", "Identificador da peça no catálogo da pesquisa"),
      P("Linha", "texto", p0.li || "", "Catálogo e preço", "Linha/coleção do fabricante"), P("Alto_padrao", "simnao", !!p0.ap, "Catálogo e preço", "Peça de linha de alto padrão (especificação de arquiteto)"),
      P("Horas_montagem", "numero", HORAS[gid] || 0, "Catálogo e preço", "Montagem e frete da peça pronta (marceneiro, h) — PROVISÓRIO RA, a medir; 0 = chega pronta"),
      /* revisão A1: o preço PROVISÓRIO (fabricante sob consulta / sem preço público) é dito no tipo, com o motivo — nunca passa por preço real */
      P("Preco_provisorio", "simnao", provisorio(p0), "Catálogo e preço", "Sim = o preço é PROVISÓRIO (o maior da categoria) — cotar com o fornecedor antes de fechar"),
      P("Motivo_preco", "texto", motivoPreco(p0), "Catálogo e preço", "Por que o preço é provisório")
    ];
    /* ACABAMENTO POR INSTÂNCIA: o tipo diz o da ficha; a peça colocada pode trocar (tecido, couro, madeira, metal) sem virar outro tipo */
    params.forEach(function (q) { if (q.tipoDado === "material") q.escopo = "instancia"; });
    var tipos = pecas.map(function (p) {
      var a = acabamentos(cat, kind, p), x = p.x || {}, vals = { Largura: p.L, Profundidade: p.P, Altura: p.A, Acabamento: a.Acabamento, Estrutura: a.Estrutura, Detalhe: a.Detalhe, Modelo: modeloDe(cat, p),
        Preco_unitario: p.pr, Fonte_preco: p.pf, Data_preco: p.pd, Composicao_id: p.pc || "", Fabricante: p.f || "", Estilo: (p.e || []).map(function (s) { return NOME_EST[s] || s; }).join(", "),
        Url_ficha: p.u || "", Linha: p.li || "", Alto_padrao: !!p.ap, Medida_conferir: p.sem ? p.sem.map(function (k) { return { L: "largura", P: "profundidade", A: "altura" }[k]; }).join(", ") + " pela faixa da categoria" : "", Peca_catalogo: p.id,
        Preco_provisorio: provisorio(p), Motivo_preco: motivoPreco(p) };
      if (x.altura_assento) vals.Assento = x.altura_assento;
      if (x.espessura_tampo) vals.Espessura_tampo = x.espessura_tampo;
      var t = T(p.id, p.n + " — " + fmtCm(p.L) + " × " + fmtCm(p.P) + " × " + fmtCm(p.A) + " cm", vals, p.u || "");
      if (p.pc) t.codigo = p.pc;
      t.preco = { valor: p.pr, fonte: p.pf, data: p.pd, provisorio: p.pt === "provisorio-maior-da-categoria" };
      return t;
    });
    var temPartes = /retratil|rack|buffet|criado|guardaRoupa|comoda|gaveteiro|armario|aparador|tanque|geladeira|lavadora|fogao|forno|lavaLoucas|escrivaninha/.test(gid);
    var id = "ra-cat-" + cat, centroFam = null;
    var fam = def({
      id: id, nome: cfg[1], categoria: catBib(cat), moveis: temPartes, semOrigem: true,
      descricao: cfg[1] + " — família do catálogo de mobiliário RA: cada tipo é uma peça comercial com medida da ficha, acabamento, estilo e preço com fonte (" + pecas.length + " tipos). Geometria da categoria (" + gid + ") dirigida por Largura × Profundidade × Altura.",
      parametros: params, tipos: tipos,
      gerar: function (c, v) { var lado = gen(c, v); encaixar(c, v.Largura, v.Profundidade, v.Altura, lado === "centro"); }
    });
    fam.catalogo = { categoria: cat, gerador: gid, pecas: pecas.length };
    fam.quantitativo = { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Fornecimento de " + cfg[1].toLowerCase() + " (peça pronta; preço do tipo, sem montagem nem frete)" };
    /* a MONTAGEM e o FRETE da peça pronta: linha própria (nunca dentro do Preco_unitario) — DUVIDAS-INTERNAS §4 */
    fam.servicos = [{ id: "montagem", descricao: "Montagem e frete da peça pronta (" + cfg[1].toLowerCase() + ") — marceneiro, horas provisórias RA", unidade: "h", quantidade: "Horas_montagem", codigo: "88273" }];
    FAMS.push(fam);
  });

  FM.registrar();

  /* ------------------------------------------------ TROCAR POR… (alternativas da mesma categoria, mesmo estilo primeiro) */
  function familiaDe(id) { for (var i = 0; i < FAMS.length; i++) if (FAMS[i].id === id) return FAMS[i]; return null; }
  function famDaPeca(pecaId) { var p = PECA[pecaId]; return p ? familiaDe("ra-cat-" + p.c) : null; }
  /* alternativas(famId, tipoId, n): as outras peças da categoria, primeiro as que dividem estilo, depois pela largura mais perto */
  function alternativas(famId, tipoId, n) {
    var f = familiaDe(famId); if (!f) return [];
    var t0 = null; f.tipos.forEach(function (t) { if (t.id === tipoId) t0 = t; });
    if (!t0) t0 = f.tipos[0];
    var est0 = String(t0.valores.Estilo || "").split(", ").filter(Boolean);
    var lista = f.tipos.filter(function (t) { return t.id !== t0.id; }).map(function (t) {
      var est = String(t.valores.Estilo || "").split(", ").filter(Boolean), comum = est.filter(function (s) { return est0.indexOf(s) >= 0; }).length;
      return { famId: f.id, tipoId: t.id, nome: t.nome, largura: t.valores.Largura, profundidade: t.valores.Profundidade, altura: t.valores.Altura, preco: t.valores.Preco_unitario, fontePreco: t.valores.Fonte_preco,
        estilo: t.valores.Estilo, fabricante: t.valores.Fabricante, mesmoEstilo: comum > 0, provisorio: !!t.valores.Preco_provisorio, motivoPreco: t.valores.Motivo_preco || "", _o: (comum > 0 ? 0 : 1) * 100 + Math.abs(t.valores.Largura - t0.valores.Largura) };
    });
    lista.sort(function (a, b) { return a._o - b._o || a.preco - b.preco; });
    lista.forEach(function (a) { delete a._o; a.precoTexto = fmtR(a.preco); a.altoPadrao = !!(PECA[a.tipoId] && PECA[a.tipoId].ap); });
    var nn = n || 8, out = lista.slice(0, nn);
    /* ALTO PADRÃO (público do sistema, 20/10/2026): a lista mostra também as peças de linha de arquiteto da categoria — até 3 */
    var apFora = lista.slice(nn).filter(function (a) { return a.altoPadrao; }).slice(0, Math.max(0, 3 - out.filter(function (a) { return a.altoPadrao; }).length));
    return out.concat(apFora);
  }
  /* encaixe da troca: a peça nova fica na MESMA posição e giro; a encostada mantém a face de encosto (fundo em Z = 0) na parede,
     a solta mantém o centro. Devolve o deslocamento LOCAL (em Z) a somar à origem quando as duas famílias têm origens diferentes. */
  function encaixeTroca(famVelha, famNova) {
    function centro(f) { var g = f && f.catalogo ? f.catalogo.gerador : ""; return /poltrona|longarina|puff|cadeira|giratoria|visitante|banqueta|varanda|mesa|maca|lumPiso|pendente|abajur|plafon|vaso|tapete|espreguicadeira|cabideiro/.test(g) && !/escrivaninha/.test(g); }
    return { centroAntes: centro(famVelha), centroDepois: centro(famNova) };
  }

  /* arvore(famId): FABRICANTE → LINHA/MODELO → tipos (com acabamento e preço) — a troca em Propriedades anda por ela */
  function arvore(famId) {
    var f = familiaDe(famId); if (!f) return [];
    var fab = {}, ordem = [];
    f.tipos.forEach(function (t) {
      var v = t.valores, nf = v.Fabricante || "(sem fabricante)", nl = v.Linha || String(t.nome).split(" — ")[0];
      if (!fab[nf]) { fab[nf] = { fabricante: nf, altoPadrao: false, linhas: {}, ordemL: [] }; ordem.push(nf); }
      var F = fab[nf]; if (v.Alto_padrao) F.altoPadrao = true;
      if (!F.linhas[nl]) { F.linhas[nl] = []; F.ordemL.push(nl); }
      F.linhas[nl].push({ tipoId: t.id, nome: t.nome, acabamento: v.Acabamento, estrutura: v.Estrutura, preco: v.Preco_unitario, precoTexto: fmtR(v.Preco_unitario) + (v.Preco_provisorio ? " (provisório — cotar com o fornecedor)" : ""), provisorio: !!v.Preco_provisorio, motivoPreco: v.Motivo_preco || "", fonte: v.Fonte_preco, largura: v.Largura, profundidade: v.Profundidade, altura: v.Altura });
    });
    ordem.sort(function (a, b) { return (fab[b].altoPadrao ? 1 : 0) - (fab[a].altoPadrao ? 1 : 0) || a.localeCompare(b); });
    return ordem.map(function (nf) { var F = fab[nf]; return { fabricante: nf, altoPadrao: F.altoPadrao, linhas: F.ordemL.map(function (nl) { return { linha: nl, tipos: F.linhas[nl] }; }) }; });
  }
  /* acabamentos que a peça pode vestir (a troca por instância): os materiais do 3D por família de material */
  var ACABAMENTOS = {
    tecido: ["tecido linho", "tecido boucle", "tecido off-white", "tecido bege", "tecido cinza", "tecido grafite", "tecido verde", "tecido azul", "tecido terracota", "tecido mostarda", "tecido rosa", "tecido veludo verde", "tecido veludo azul", "tecido veludo rosa"],
    couro: ["couro caramelo", "couro marrom", "couro preto", "couro sintetico preto"],
    madeira: ["mdf carvalho", "mdf nogueira", "mdf freijo", "madeira escura", "mdf branco", "mdf off-white", "mdf grafite", "mdf preto", "mdf verde", "mdf azul", "laca branca", "laca grafite"],
    metal: ["metal preto", "metal branco", "inox", "metal cromado", "metal dourado", "metal cobre"],
    pedra: ["marmore branco", "granito preto", "quartzo branco", "vidro", "vidro fume"]
  };
  var FamiliasCat = {
    arvore: arvore, ACABAMENTOS: ACABAMENTOS,
    ids: function () { return FAMS.map(function (f) { return f.id; }); },
    familias: function () { return FAMS; },
    obter: function (id) { return familiaDe(id); },
    familiaDaPeca: famDaPeca, peca: function (id) { return PECA[id] || null; },
    alternativas: alternativas, encaixeTroca: encaixeTroca,
    geradores: G, categorias: CAT, ultimoAjuste: function () { return ULTIMO; }, TETO_TRI: TETO_TRI,
    _modeloDe: modeloDe, _acabamentos: acabamentos, _norm: norm, precoProvisorio: provisorio, motivoPreco: motivoPreco
  };
  global.FamiliasCat = FamiliasCat;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasCat;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
