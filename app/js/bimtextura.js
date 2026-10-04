/* =====================================================================
 * bimtextura.js — MATERIAIS REALISTAS DO BIM (motor puro)
 *
 * O que decide, e por que é puro: qual textura cada peça veste, em que escala,
 * com que tinta, e como ela se assenta na peça (as coordenadas de textura).
 * É isso que a pessoa VÊ — e um tijolo que sai deitado, esticado ou da cor
 * errada é defeito que ninguém pega olhando o código. `js/bim.js` só carrega
 * as imagens e põe nos materiais.
 *
 * ─────────────────────────────────────────────────────────────────────
 * QUAL TEXTURA (`escolher`), em três portas, nesta ordem:
 *   (a) a PROPRIEDADE do IFC: `IfcMaterialProperties` "RA_Material" com
 *       `Textura` (o nome da textura da biblioteca) e `Escala_m` (metros por
 *       repetição; faltando, vale o tamanho físico da biblioteca);
 *   (b) PALAVRA-CHAVE no nome do material (tijolo, pedra, madeira, telha,
 *       concreto, porcelanato, reboco, grama, brita, metal…);
 *   (c) nada: a peça fica com a cor do IFC, como sempre foi.
 *   Vidro não ganha textura: ganha física (brilho e transparência).
 *
 * ⚠ PEÇA TRANSPARENTE NÃO VESTE TEXTURA. Um elemento pode ter várias
 * geometrias e um material só ("pvc e vidro"): sem esta regra, o vidro de uma
 * porta de madeira sairia com veio de madeira.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A TINTA (`tinta`). A cor do IFC é a intenção do projetista; a textura dá o
 * detalhe. Por isso a textura é tingida para que a sua cor MÉDIA vire a cor do
 * IFC (fator por canal, em linear, com teto). A exceção é a cor CINZA genérica
 * (o "cinza padrão" de quem exportou sem material) sobre textura colorida: aí
 * vale a cor natural da textura — tingir tijolo de cinza não é realista.
 *
 * ─────────────────────────────────────────────────────────────────────
 * COMO ASSENTA (`uvDeMalha`). O IFC não traz coordenada de textura. A projeção
 * é PLANAR PELA NORMAL da face, em METROS do modelo:
 *   · eixo u = horizontal ao longo da face (cruz do "para cima" com a normal);
 *   · eixo v = sobe pela face (no telhado, sobe o caimento);
 *   · face horizontal (piso/forro): u = X, v = −Z (norte para cima).
 * Assim a parede tem o tijolo em pé e na escala certa, o telhado tem a fiada
 * seguindo o beiral SEM esticar com o caimento (o que a projeção de caixa
 * pura faria: +15% num telhado de 30°), e o piso segue os eixos do projeto.
 *
 * ⚠ A CONTA É FEITA EM DUPLA PRECISÃO, NO MODELO, RELATIVA A UMA ÂNCORA. A
 * posição da peça vem na MATRIZ (o web-ifc entrega a geometria local e a
 * matriz em double). Fazer a conta na placa de vídeo, em float32 e na
 * coordenada do mundo, faria a textura de um modelo georreferenciado
 * (~7.000.000 m) "nadar" em passos de meio metro. Aqui a matriz é aplicada em
 * double e a âncora é subtraída ANTES de virar float32 — a mesma lição da
 * agregação (js/bimagreg.js, D8).
 *
 * ⚠ A MESMA FUNÇÃO SERVE À PEÇA E À MALHA MESCLADA. É o que garante que a
 * textura não "pula" quando uma peça sai do mesclado (seleção, porta aberta):
 * a coordenada de cada vértice é a mesma nos dois desenhos, por construção.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PASTA = "img/texturas/";

  /* a biblioteca empacotada (tools/gerar-texturas.py imprime esta tabela):
     m = metros por repetição (largura), asp = altura/largura da imagem,
     media = cor média (média LINEAR devolvida em sRGB), metal = metalicidade,
     natural = a cor É o material (tijolo, madeira, pedra, grama): sobre o cinza
     genérico de um IFC sem material, vale a cor da própria textura.
     Fontes e licenças (todas CC0) em img/texturas/ORIGEM.txt. */
  var BIB = {
    reboco_rustico_offwhite: { m: 1.0, asp: 1.0, media: [0.844, 0.829, 0.816], fonte: "ambientCG Plaster001" },
    tijolo_macico_colonial_palha: { m: 1.3, asp: 1.0, media: [0.769, 0.728, 0.635], natural: 1, fonte: "ambientCG Bricks053" },
    pedra_moledo_clara: { m: 1.5, asp: 0.5, media: [0.686, 0.649, 0.513], natural: 1, fonte: "ambientCG Bricks084" },
    madeira_tabua_vertical_avela: { m: 1.0, asp: 2.0, media: [0.792, 0.758, 0.623], natural: 1, fonte: "ambientCG WoodSiding009 (girada 90°: tábuas em pé)" },
    madeira_angelim_pedra: { m: 1.0, asp: 1.0, media: [0.669, 0.470, 0.328], natural: 1, fonte: "ambientCG Wood005" },
    telha_shingle_marrom: { m: 2.4, asp: 1.0, media: [0.241, 0.161, 0.110], natural: 1, fonte: "ambientCG RoofingTiles003 (cor reescalada para o castanho da shingle)" },
    pvc_amadeirado_caramelo: { m: 1.0, asp: 1.0, media: [0.671, 0.438, 0.199], natural: 1, fonte: "ambientCG Wood023" },
    porcelanato_acetinado_claro: { m: 1.2, asp: 1.0, media: [0.876, 0.798, 0.676], natural: 1, fonte: "ambientCG Travertine009" },
    porcelanato_antiderrapante_externo: { m: 1.2, asp: 1.0, media: [0.679, 0.644, 0.546], natural: 1, fonte: "ambientCG PavingStones133" },
    concreto_natural_greige: { m: 1.5, asp: 1.0, media: [0.636, 0.596, 0.530], fonte: "ambientCG Concrete048" },
    piso_tijolo_macico: { m: 0.5, asp: 1.0, media: [0.394, 0.342, 0.274], natural: 1, fonte: "PolyHaven brick_floor" },
    forro_madeira_lambri: { m: 1.8, asp: 1.0, media: [0.609, 0.483, 0.369], natural: 1, fonte: "ambientCG WoodFloor051" },
    grama: { m: 2.0, asp: 1.0, media: [0.399, 0.518, 0.172], natural: 1, fonte: "ambientCG Grass005" },
    cascalho: { m: 1.5, asp: 1.0, media: [0.856, 0.841, 0.811], fonte: "ambientCG Gravel023" },
    piso_permeavel: { m: 1.92, asp: 1.0, media: [0.407, 0.371, 0.327], natural: 1, fonte: "PolyHaven concrete_pavers" },
    metal_preto_fosco: { m: 1.0, asp: 1.0, media: [0.117, 0.134, 0.130], metal: 0.3, fonte: "ambientCG Metal029" },
    azulejo_porcelanato_bwc: { m: 1.0, asp: 1.0, media: [0.972, 0.972, 0.970], fonte: "ambientCG Tiles107" },
    madeira_deck: { m: 2.4, asp: 1.0, media: [0.574, 0.508, 0.392], natural: 1, fonte: "ambientCG Planks029S" }
  };

  /* ⚠ A ORDEM IMPORTA: o mais específico primeiro. "Piso de tijolo" não é
     parede de tijolo, "concregrama" não é grama, "PVC amadeirado" não é cano
     de PVC (cano fica sem textura: só "amadeirado" casa), e a madeira vem
     ANTES da pedra porque há madeira chamada "angelim pedra". */
  var REGRAS = [
    { re: /vidro|glass|cristal temperado/i, classe: "vidro" },
    { re: /alum[ií]nio|inox/i, classe: "metal" },
    { re: /concregrama|perme[aá]vel|intertravad|paver|bloquete/i, slug: "piso_permeavel" },
    { re: /piso[^|]*tijolo|tijolo[^|]*piso|ladrilho de barro/i, slug: "piso_tijolo_macico" },
    { re: /amadeirad/i, slug: "pvc_amadeirado_caramelo" },
    { re: /deck|assoalho|piso de madeira|taco/i, slug: "madeira_deck" },
    { re: /lambri|forro[^|]*madeira|macho.?f[eê]mea/i, slug: "forro_madeira_lambri" },
    { re: /t[aá]bua|siding|mata.?junta/i, slug: "madeira_tabua_vertical_avela" },
    { re: /madeira|angelim|eucalipto|pinus|cumaru|jatob[aá]|\bip[eê]\b|wood|timber/i, slug: "madeira_angelim_pedra" },
    { re: /tijolo|brick/i, slug: "tijolo_macico_colonial_palha" },
    { re: /pedra|moledo|granito|ard[oó]sia|stone/i, slug: "pedra_moledo_clara" },
    { re: /telha|shingle|roof/i, slug: "telha_shingle_marrom" },
    { re: /antiderrapante|piso externo/i, slug: "porcelanato_antiderrapante_externo" },
    { re: /porcelanato|piso cer[aâ]mico|cer[aâ]mica de piso/i, slug: "porcelanato_acetinado_claro" },
    { re: /azulejo|pastilha|revestimento cer[aâ]mico/i, slug: "azulejo_porcelanato_bwc" },
    { re: /concreto|concrete|cimentado/i, slug: "concreto_natural_greige" },
    { re: /reboco|textura|argamassa|chapisco|embo[cç]o|grafiato|pintura\s+(acr[ií]lica\s+)?externa/i, slug: "reboco_rustico_offwhite" },
    { re: /grama|gramado|grass/i, slug: "grama" },
    { re: /brita|cascalho|pedrisco|gravel/i, slug: "cascalho" },
    { re: /ferro|\ba[cç]o\b|met[aá]lic|metal|steel/i, slug: "metal_preto_fosco" }
  ];

  function num(x) { var n = +x; return isFinite(n) ? n : 0; }
  function txt(s) { return String(s == null ? "" : s).trim(); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  function existe(slug) { return Object.prototype.hasOwnProperty.call(BIB, txt(slug)); }

  /* ---------------------------------------------------------------
   * escolher — a textura de UMA peça
   *
   * `materiais` é o que o viewer já lê do IFC por peça (bim.js lerMateriais):
   * [{ n: nome, f, rho, tx: textura da propriedade, esc: Escala_m }].
   * `opts.alfa` < 1 = geometria transparente (fica sem textura).
   * Devolve { slug, escala, asp, fonte: 'propriedade'|'palavra'|'', classe,
   *           material: nome que decidiu } — `slug` vazio = sem textura.
   * ------------------------------------------------------------- */
  function escolher(materiais, opts) {
    opts = opts || {};
    var lista = Array.isArray(materiais) ? materiais : [];
    var vazio = { slug: "", escala: 0, asp: 1, fonte: "", classe: "", material: "" };
    var alfa = opts.alfa == null ? 1 : num(opts.alfa);
    var i, m, nome;
    /* (a) a propriedade manda — em qualquer material da peça */
    for (i = 0; i < lista.length; i++) {
      m = lista[i] || {};
      if (m.tx && existe(m.tx)) {
        if (alfa < 0.95) return vazio;
        var e = num(m.esc);
        return { slug: txt(m.tx), escala: (e > 0.01 && e < 100) ? e : BIB[txt(m.tx)].m, asp: BIB[txt(m.tx)].asp || 1,
                 fonte: "propriedade", classe: "", material: txt(m.n) };
      }
    }
    /* (b) a palavra-chave, material por material, na ordem da peça */
    for (i = 0; i < lista.length; i++) {
      nome = txt((lista[i] || {}).n);
      if (!nome) continue;
      for (var r = 0; r < REGRAS.length; r++) {
        if (!REGRAS[r].re.test(nome)) continue;
        if (REGRAS[r].classe) return { slug: "", escala: 0, asp: 1, fonte: "palavra", classe: REGRAS[r].classe, material: nome };
        if (alfa < 0.95) return vazio;
        var s = REGRAS[r].slug;
        return { slug: s, escala: BIB[s].m, asp: BIB[s].asp || 1, fonte: "palavra", classe: "", material: nome };
      }
    }
    return vazio;
  }

  /* a chave do material no cache do viewer: a mesma escolha = o mesmo material */
  function chave(esc) {
    if (!esc) return "";
    if (esc.slug) return esc.slug + "@" + num(esc.escala).toFixed(3);
    return esc.classe ? ("#" + esc.classe) : "";
  }

  /* ---------------------------------------------------------------
   * tinta — o fator (LINEAR, por canal) que leva a média da textura à cor do IFC
   * ------------------------------------------------------------- */
  function lin(c) { c = clamp(num(c), 0, 1); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function saturacao(c) { var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx > 0.001 ? (mx - mn) / mx : 0; }
  function tinta(corIfc, slug) {
    var b = BIB[txt(slug)];
    if (!b || !corIfc) return [1, 1, 1];
    var c = [num(corIfc[0]), num(corIfc[1]), num(corIfc[2])];
    /* cinza genérico sobre material de cor própria: a cor natural da textura */
    if (b.natural && saturacao(c) < 0.1) return [1, 1, 1];
    var out = [];
    for (var i = 0; i < 3; i++) out.push(clamp(lin(c[i]) / Math.max(lin(b.media[i]), 0.002), 0.2, 5));
    return out;
  }

  /* ---------------------------------------------------------------
   * uvPlanar / uvDeMalha — a coordenada de textura, em metros do modelo
   *
   * `p` já relativo à âncora e `n` unitário, os dois no espaço do modelo
   * (Y para cima). u, v em REPETIÇÕES (já divididos pela escala).
   * ------------------------------------------------------------- */
  function uvPlanar(px, py, pz, nx, ny, nz, escala, asp, fora, o) {
    var e = escala > 0 ? escala : 1, ev = e * (asp > 0 ? asp : 1);
    var tl = Math.sqrt(nx * nx + nz * nz), tx, tz, bx, by, bz;
    if (tl < 0.05) {
      /* horizontal: u = X; v = −Z (norte) no piso, +Z no forro (não espelha visto de baixo) */
      tx = 1; tz = 0; bx = 0; by = 0; bz = ny >= 0 ? -1 : 1;
    } else {
      /* T = cima × n (horizontal, ao longo da face);  B = n × T (sobe pela face) */
      tx = nz / tl; tz = -nx / tl;
      bx = ny * tz; by = nz * tx - nx * tz; bz = -ny * tx;
    }
    fora[o] = (px * tx + pz * tz) / e;
    fora[o + 1] = (px * bx + py * by + pz * bz) / ev;
    return fora;
  }

  /* toda a malha: `m` é a matriz do objeto (16, coluna-maior, double), a
     âncora [x,y,z] no espaço do modelo. `fora` e `offVert` permitem escrever
     direto dentro do buffer da malha mesclada. */
  function uvDeMalha(pos, nor, m, escala, asp, ancora, fora, offVert) {
    var nv = (pos.length / 3) | 0, o = (offVert | 0) * 2;
    var out = fora || new Float32Array(nv * 2);
    var a = ancora || [0, 0, 0], M = m || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (var v = 0; v < nv; v++) {
      var x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      var w = M[3] * x + M[7] * y + M[11] * z + M[15]; if (!w) w = 1;
      /* ⚠ a âncora sai ANTES de estreitar (ver o cabeçalho) */
      var px = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w - a[0];
      var py = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w - a[1];
      var pz = (M[2] * x + M[6] * y + M[10] * z + M[14]) / w - a[2];
      var nx0 = nor ? nor[v * 3] : 0, ny0 = nor ? nor[v * 3 + 1] : 1, nz0 = nor ? nor[v * 3 + 2] : 0;
      var nx = M[0] * nx0 + M[4] * ny0 + M[8] * nz0, ny = M[1] * nx0 + M[5] * ny0 + M[9] * nz0, nz = M[2] * nx0 + M[6] * ny0 + M[10] * nz0;
      var d = Math.sqrt(nx * nx + ny * ny + nz * nz); if (d > 1e-12) { nx /= d; ny /= d; nz /= d; }
      uvPlanar(px, py, pz, nx, ny, nz, escala, asp, out, o + v * 2);
    }
    return out;
  }

  /* a âncora: o centro (em double) das translações das peças, arredondado ao
     metro — determinístico pelo CONTEÚDO, então a textura não muda de lugar
     entre uma abertura e outra do mesmo arquivo */
  function ancoraDe(matrizes) {
    var sx = 0, sy = 0, sz = 0, n = 0;
    for (var i = 0; i < (matrizes || []).length; i++) {
      var m = matrizes[i]; if (!m || m.length < 16) continue;
      sx += num(m[12]); sy += num(m[13]); sz += num(m[14]); n++;
    }
    if (!n) return [0, 0, 0];
    return [Math.round(sx / n), Math.round(sy / n), Math.round(sz / n)];
  }

  /* ---------------------------------------------------------------
   * padrao — ligado ou não, sem a pessoa ter escolhido
   *
   * ⚠ LIGA SOZINHO SÓ QUANDO O MODELO PEDIU. Um modelo que traz a propriedade
   * RA_Material foi preparado para isso; um IFC qualquer do Revit casaria só
   * por palavra-chave, e virar a frota inteira de uma vez para textura
   * adivinhada mudaria a cara de todo modelo que já está aberto nas 38
   * instalações. Para esses, o botão está na fita.
   * ⚠ E NÃO LIGA SOZINHO EM APARELHO FRACO: a textura sobe para a placa de
   * vídeo (~4 MB por material) e o celular é o primeiro a perder o contexto.
   * A escolha da pessoa (`pref` '1'/'0') vale sobre tudo, menos a chave da
   * frota, que desliga o recurso inteiro.
   * ------------------------------------------------------------- */
  function aparelhoFraco(ap) {
    ap = ap || {};
    var mem = num(ap.memoria);
    if (mem && mem < 4) return true;
    if (ap.toque && num(ap.telaMax) && num(ap.telaMax) < 1000) return true;
    return false;
  }
  function padrao(o) {
    o = o || {};
    if (o.frota === false) return { ligado: false, motivo: "desligado para todas as instalações" };
    if (o.pref === "1") return { ligado: true, motivo: "ligado por você neste aparelho" };
    if (o.pref === "0") return { ligado: false, motivo: "desligado por você neste aparelho" };
    if (aparelhoFraco(o.aparelho)) return { ligado: false, motivo: "aparelho com pouca memória: ligue na fita se quiser" };
    if (o.temPropriedade) return { ligado: true, motivo: "o modelo traz as texturas dos materiais" };
    return { ligado: false, motivo: "o modelo não traz textura: ligue na fita para adivinhar pelo nome do material" };
  }

  function arquivos(slug, leve) {
    var s = txt(slug);
    if (!existe(s)) return null;
    var base = PASTA + s + "/";
    /* leve (aparelho fraco que ligou à mão): só a cor — um mapa em vez de três */
    return leve ? { cor: base + "cor.jpg" } : { cor: base + "cor.jpg", normal: base + "normal.jpg", rugosidade: base + "rugosidade.jpg" };
  }

  var BimTextura = {
    PASTA: PASTA,
    BIB: BIB,
    REGRAS: REGRAS,
    existe: existe,
    escolher: escolher,
    chave: chave,
    tinta: tinta,
    uvPlanar: uvPlanar,
    uvDeMalha: uvDeMalha,
    ancoraDe: ancoraDe,
    aparelhoFraco: aparelhoFraco,
    padrao: padrao,
    arquivos: arquivos,
    _lin: lin
  };

  global.BimTextura = BimTextura;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTextura;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
