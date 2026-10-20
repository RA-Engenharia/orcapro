/* =====================================================================
 * bimacabvis.js — ACABAMENTO VISUAL DO MODELO (motor PURO, ES5)
 *
 * O que decide, e por que é puro: de que COR e de que TEXTURA o 3D desenha
 * cada acabamento — o da face de uma parede (op `pintar`, js/bimpintar.js) e
 * o do piso de um ambiente (campo `acabPiso`) ou de uma zona externa (volume
 * de piso). A tela (js/bim.js, js/bimprecisaoui.js) só desenha o que sai daqui.
 *
 * POR QUE EXISTE (19/10/2026). Um modelo de reforma saiu todo branco/cinza:
 * a película da P4 era MeshBasicMaterial (cor chapada, sem luz, sem textura),
 * a paleta do `pintar` não tinha grafite nem concreto aparente nem ripado, e os
 * pisos não mostravam material nenhum. O sistema já tinha o estilo Realista
 * (texturas CC0 por nome de material, js/bimtextura.js) — mas o NOME que o
 * modelo usava não casava com o dicionário. Aqui cada acabamento tem um nome
 * FIXO, uma cor sRGB e a textura da biblioteca que ele veste (`slug`):
 * a cor vale no Sombreado, a textura (tingida pela cor, quando a textura não
 * tem cor própria) vale no Textura/Realista. Um nome, três estilos.
 *
 * ⚠ TEXTURA = SÓ DA BIBLIOTECA EMPACOTADA (img/texturas, CC0, fontes em
 * ORIGEM.txt). Nenhuma imagem de site foi baixada para isto.
 * ⚠ A cor é a cor COMO SE VÊ (sRGB), a mesma convenção do material do IFC
 * (js/bim.js criarGetMat). Textura "natural" (madeira, pedra, grama) mantém a
 * cor dela; a que não é natural (reboco, concreto) é tingida até a cor daqui.
 *
 * API: CATALOGO, porNome(texto) (nome exato do catálogo), resolver(texto, grupo)
 *      (texto livre de acabamento: "porcelanato 90x90 acetinado areia"),
 *      rgb(hex) → [r,g,b] 0..1, normalizar(texto).
 * Teste: node tools/test-c487-materiais.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var ACENTOS = { "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "ê": "e", "è": "e", "ë": "e", "í": "i", "ì": "i", "î": "i", "ï": "i",
                  "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o", "ú": "u", "ù": "u", "û": "u", "ü": "u", "ç": "c", "ñ": "n" };
  function normalizar(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[áàâãäéêèëíìîïóòôõöúùûüçñ]/g, function (c) { return ACENTOS[c] || c; })
      .replace(/[_\-\/]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function rgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return [0.5, 0.5, 0.5];
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* grupo: "fachada" (parede, qualquer face), "piso" (piso interno e externo), "metal".
     slug: textura da biblioteca (js/bimtextura.js BIB); "" = cor sólida.
     rug/met: rugosidade e metalicidade no Sombreado (a textura, no Realista, traz a dela). */
  var CATALOGO = [
    /* ---- paredes: fachada e interior ---- */
    { id: "ac-textura-grafite", rotulo: "Textura grafite", grupo: "fachada", cor: "#3b3e42", slug: "pintura_lisa", rug: 0.9, met: 0 },
    { id: "ac-cimenticio-grafite", rotulo: "Cimentício grafite (concreto polido)", grupo: "fachada", cor: "#45484c", slug: "concreto_liso_claro", rug: 0.8, met: 0 },
    { id: "ac-textura-offwhite", rotulo: "Textura off-white", grupo: "fachada", cor: "#e7e2d6", slug: "pintura_lisa", rug: 0.95, met: 0 },
    { id: "ac-pintura-branca", rotulo: "Pintura branca", grupo: "fachada", cor: "#f3f2ee", slug: "reboco_rustico_offwhite", rug: 0.85, met: 0 },
    { id: "ac-pintura-branco-gelo", rotulo: "Pintura branco gelo", grupo: "fachada", cor: "#ebe8e0", slug: "reboco_rustico_offwhite", rug: 0.9, met: 0 },
    { id: "ac-concreto-aparente", rotulo: "Concreto aparente (fôrma)", grupo: "fachada", cor: "#a09f9b", slug: "concreto_aparente_formas", rug: 0.9, met: 0 },
    { id: "ac-ripado-cumaru", rotulo: "Ripado de madeira (cumaru)", grupo: "fachada", cor: "#9c6a3c", slug: "madeira_angelim_pedra", rug: 0.6, met: 0 },
    { id: "ac-ripado-freijo", rotulo: "Ripado de madeira (freijó)", grupo: "fachada", cor: "#c4a073", slug: "madeira_clara_freijo", rug: 0.6, met: 0 },
    { id: "ac-cimenticio", rotulo: "Revestimento cimentício (concreto liso)", grupo: "fachada", cor: "#b9b7b1", slug: "concreto_liso_claro", rug: 0.8, met: 0 },
    { id: "ac-pedra-sao-tome", rotulo: "Pedra São Tomé", grupo: "fachada", cor: "#d8b283", slug: "pedra_sao_tome", rug: 0.85, met: 0 },
    { id: "ac-pedra-moledo", rotulo: "Pedra moledo", grupo: "fachada", cor: "#d2c9a7", slug: "pedra_moledo_clara", rug: 0.9, met: 0 },
    { id: "ac-porcelanato-amadeirado", rotulo: "Porcelanato amadeirado", grupo: "fachada", cor: "#b58a55", slug: "piso_laminado_claro", rug: 0.5, met: 0 },
    { id: "ac-tijolinho", rotulo: "Tijolinho aparente", grupo: "fachada", cor: "#b86b43", slug: "tijolinho_laranja", rug: 0.9, met: 0 },
    { id: "ac-metal-preto", rotulo: "Metal preto fosco", grupo: "metal", cor: "#1f2123", slug: "", rug: 0.45, met: 0.5 },
    { id: "ac-azulejo-branco", rotulo: "Revestimento cerâmico branco", grupo: "fachada", cor: "#f1f1ee", slug: "azulejo_porcelanato_bwc", rug: 0.3, met: 0 },
    /* ---- pisos: interno e externo ---- */
    { id: "ac-grama", rotulo: "Grama", grupo: "piso", cor: "#5e8f2e", slug: "grama", rug: 0.95, met: 0 },
    { id: "ac-deck-cumaru", rotulo: "Deck de madeira (cumaru)", grupo: "piso", cor: "#8d6a43", slug: "madeira_deck", rug: 0.7, met: 0 },
    { id: "ac-porcelanato-areia", rotulo: "Porcelanato areia 90x90", grupo: "piso", cor: "#d9ccb1", slug: "porcelanato_acetinado_claro", rug: 0.45, met: 0 },
    { id: "ac-porcelanato-externo", rotulo: "Porcelanato externo antiderrapante", grupo: "piso", cor: "#bfb39c", slug: "porcelanato_antiderrapante_externo", rug: 0.75, met: 0 },
    { id: "ac-porcelanato-branco", rotulo: "Porcelanato branco 60x60", grupo: "piso", cor: "#e9e8e3", slug: "porcelanato_branco_60", rug: 0.4, met: 0 },
    { id: "ac-concregrama", rotulo: "Concregrama (piso drenante)", grupo: "piso", cor: "#7a8a52", slug: "piso_permeavel", rug: 0.9, met: 0 },
    { id: "ac-seixo", rotulo: "Seixo rolado", grupo: "piso", cor: "#d3cdbf", slug: "cascalho", rug: 0.95, met: 0 },
    { id: "ac-concreto-desempenado", rotulo: "Concreto desempenado", grupo: "piso", cor: "#a9a59d", slug: "concreto_natural_greige", rug: 0.9, met: 0 },
    { id: "ac-terra", rotulo: "Terra", grupo: "piso", cor: "#7a6143", slug: "terra", rug: 1, met: 0 },
    { id: "ac-borda-atermica", rotulo: "Borda atérmica de concreto claro", grupo: "piso", cor: "#e4e0d5", slug: "concreto_liso_claro", rug: 0.8, met: 0 },
    /* ---- peças ---- */
    { id: "ac-face-madeirada", rotulo: "Face inferior madeirada", grupo: "madeira", cor: "#b98f5f", slug: "madeira_clara_freijo", rug: 0.6, met: 0 },   /* a telha sanduíche (frente da cobertura) usa este nome na camada de baixo */
    { id: "ac-casco-fibra", rotulo: "Casco de plástico reforçado (fibra) azul-claro", grupo: "agua", cor: "#5db7e4", slug: "", rug: 0.3, met: 0 },
    { id: "ac-agua-piscina", rotulo: "Água da piscina (turquesa)", grupo: "agua", cor: "#35c2d6", slug: "", rug: 0.03, met: 0, op: 0.55 }
  ];

  var POR_ID = {}, POR_NOME = {};
  CATALOGO.forEach(function (e) { POR_ID[e.id] = e; POR_NOME[normalizar(e.rotulo)] = e; });

  /* o nome EXATO do catálogo (rótulo ou id) — o que o `pintar` e o volume de piso gravam */
  function porNome(texto) {
    var t = normalizar(texto); if (!t) return null;
    return POR_NOME[t] || POR_ID[String(texto).trim()] || null;
  }

  /* texto LIVRE de acabamento ("porcelanato 90x90 acetinado areia", "grama esmeralda + pisantes de concreto") →
     entrada do catálogo. Ordem = do específico ao genérico. `grupo` filtra: "piso" ou "parede". */
  var REGRAS_PISO = [
    [/deck|cumaru/, "ac-deck-cumaru"],
    [/concregrama|drenante|intertravad|permeavel/, "ac-concregrama"],
    [/seixo|pedrisco|brita/, "ac-seixo"],
    [/concreto desempenado|desempenado|passeio/, "ac-concreto-desempenado"],
    [/grama|gramado|forracao/, "ac-grama"],
    [/sao tome|pedra/, "ac-pedra-sao-tome"],
    [/externo|antiderrapante/, "ac-porcelanato-externo"],
    [/porcelanato.{0,40}(branco|60x60|60x120)|60x60|60x120/, "ac-porcelanato-branco"],
    [/porcelanato|ceramic|piso/, "ac-porcelanato-areia"],
    [/terra|solo/, "ac-terra"]
  ];
  var REGRAS_PAREDE = [
    [/grafite/, "ac-textura-grafite"],
    [/concreto aparente/, "ac-concreto-aparente"],
    [/ripad|cumaru/, "ac-ripado-cumaru"],
    [/freijo/, "ac-ripado-freijo"],
    [/cimenticio/, "ac-cimenticio"],
    [/sao tome/, "ac-pedra-sao-tome"],
    [/moledo|pedra/, "ac-pedra-moledo"],
    [/amadeirad/, "ac-porcelanato-amadeirado"],
    [/tijolinho|tijolo aparente/, "ac-tijolinho"],
    [/preto fosco|metal/, "ac-metal-preto"],
    [/azulejo|revestimento ceramic|porcelanato/, "ac-azulejo-branco"],
    [/off ?white|textura/, "ac-textura-offwhite"],
    [/branco gelo|pintura|reboco|gesso/, "ac-pintura-branco-gelo"],
    [/branc/, "ac-pintura-branca"]
  ];
  function resolver(texto, grupo) {
    var ex = porNome(texto); if (ex) return ex;
    var t = normalizar(texto); if (!t || t === "-") return null;
    var R = grupo === "piso" ? REGRAS_PISO : REGRAS_PAREDE;
    for (var i = 0; i < R.length; i++) if (R[i][0].test(t)) return POR_ID[R[i][1]];
    return null;
  }

  /* A TINTA da textura até a cor do catálogo (fator LINEAR por canal). ⚠ Não usa o `tinta` do js/bimtextura.js: ele tem piso 0,2 no fator,
     e com ele um grafite (#3b3e42) sobre a textura clara saía cinza médio (fator pedido 0,07, entregue 0,2). Aqui o piso é 0,02.
     Textura "natural" (madeira, pedra, grama) mantém a cor dela. `BIB` = BimTextura.BIB (média linear de cada textura). */
  function lin(c) { c = c < 0 ? 0 : (c > 1 ? 1 : c); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function tinta(ent, BIB) {
    var b = ent && BIB && ent.slug ? BIB[ent.slug] : null;
    if (!b || b.natural) return [1, 1, 1];
    var c = rgb(ent.cor), out = [];
    for (var i = 0; i < 3; i++) { var f = lin(c[i]) / Math.max(lin(b.media[i]), 0.002); out.push(f < 0.02 ? 0.02 : (f > 6 ? 6 : f)); }
    return out;
  }

  var BimAcabVis = { tinta: tinta, CATALOGO: CATALOGO, porNome: porNome, resolver: resolver, rgb: rgb, normalizar: normalizar, REGRAS_PISO: REGRAS_PISO, REGRAS_PAREDE: REGRAS_PAREDE };
  global.BimAcabVis = BimAcabVis;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAcabVis;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
