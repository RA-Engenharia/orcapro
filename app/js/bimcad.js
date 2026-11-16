/* =====================================================================
 * bimcad.js — O ARQUIVO CAD ÚNICO DE QUALQUER FOLHA DO BIM (16/11/2026). Motor PURO, ES5, sem DOM, Node-testável.
 *
 * POR QUE. O caminho CAD/DWG provado no AutoCAD (js/arqcad.js: MODEL em escala real + um LAYOUT por folha, viewports travadas, CTB, refino do LibreDWG)
 * só existia para as pranchas de arquitetura. O hidrossanitário (HidPranchas.exportar "dxf") e o "Gerar pranchas" do BIM (BimDxf.daFolha) saíam por outro
 * caminho. Roteiro do defeito (Casa 487, hidro): um DXF R2000 sem layout algum (todas as folhas lado a lado no MODEL, Layout1 vazio); o CARIMBO caía no canto
 * (0,0) da folha, em cima do desenho (o conversor ignorava o translate do grupo do carimbo) e vermelho (texto cinza lido como "pendência"); sem CTB nem
 * $PSTYLEMODE (plotar = penas da camada, tudo na cor da ACI); $LWDISPLAY = 1 (a linha engrossa na tela); cinzas de 0,05–0,13 mm para o contexto; HATCH sem
 * $FILLMODE no DWG; arcos (path) perdidos. Aqui tudo vai pelo mesmo motor:
 *
 *   BimCad.paraCad(r, { disciplina })      pranchas em SVG (hidro, e as demais disciplinas com SVG por folha) → ArqCad.paraCad com o CTB FIXO da disciplina
 *   BimCad.paraCadFolhas(ent, op)          folhas do BIM (viewports do Desenho2D) → MODEL em metros + layout por folha (BimDxf.daFolhaCad) + CTB "geral"
 *   BimCad.ctbs()                          [{ nome, bytes }] os CTB fixos (RA_Hidrossanitario.ctb, RA_Geral.ctb) — o botão "Instalar penas RA" copia todos
 *   BimCad.zip(o) / BimCad.zipDwg(o, dwg)  ZIP (DXF|DWG + CTB + LEIA-ME)
 *
 * CTB POR DISCIPLINA (paleta FIXA, ver ArqCad.perfilDe): o usuário instala uma vez e todo desenho da disciplina plota certo. Pretos = padrão RA/TQS da skill
 * padrao-detalhamento (ACI 1 = 0,13 · 2 = 0,18 · 3 = 0,25 · 4 = 0,35 · 5 = 0,50 · 6 = 0,70 · 8 = 0,05 · 9 = 0,09; 7 = texto e cheio); a TUBULAÇÃO tem uma cor por
 * sistema (as do Padrão RA de hidráulica v1.0, js/hidpranchas.js K2.cor) e a espessura vem do par cor × espessura do desenho (AF/AQ/AP/IN/IND/GAS 0,35 ·
 * ES 0,50 · VE 0,25).
 * ⚠ Folha com escalas misturadas (planta 1:50 + cortes 1:25, a maioria das folhas do hidro) fica TODA no layout, em mm de papel (a geometria exata do PDF):
 *   o SVG do hidro não marca o bloco de cada vista (data-bloco/data-escala, como js/arqdiagrama.js faz). Quando marcar, o ArqCad já monta as viewports.
 * Teste: node tools/test-bimcad.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function CD() { return dep("ArqCad", "./arqcad.js"); }
  function BD() { return dep("BimDxf", "./bimdxf.js"); }
  function txt(v) { return v == null ? "" : String(v); }
  function hx(h) { return CD().hexRgb(h); }

  /* ---------------------------------------------------------------- perfis (paletas fixas) */
  var L_COR = [18, 25, 35, 50, 70];           /* espessuras (centésimos) de uma cor de tubulação */
  function cor(nome, h, lws) { return { nome: nome, rgb: hx(h), lws: lws || L_COR }; }
  function cheio(nome, h) { return { nome: nome, rgb: hx(h) }; }
  var PALETA_SISTEMAS = [
    cor("agua-fria", "#1E6FD9"), cor("agua-fria-iso", "#0D3A9A", [18, 25, 35]), cor("agua-fria-claro", "#5B9BD5", [18, 25]),
    cor("agua-quente", "#D93025"), cor("agua-quente-iso", "#A01818", [18, 25, 35]),
    cor("esgoto", "#2E9E44"), cor("esgoto-marrom", "#B5694A", [18, 25]),
    cor("pluvial", "#00ACC1"), cor("incendio", "#C62828", [25, 35, 50]), cor("industrial", "#6D4C41", [25, 35, 50]), cor("gas", "#C9A400", [25, 35, 50])
  ];
  var PALETA_BASE = [
    cor("pendencia", "#C00000", [18, 25, 35]), cor("destaque-ra", "#00406A", [13, 18, 25])
  ];
  /* cinzas (contexto: arquitetura de fundo, louças): ACI cinza do CAD (250–254), para não aparecerem coloridos na tela; a saída é um cinza ESCURO o bastante para imprimir.
     Só 5 ACI cinza existem (a 8 e a 9 são do preto fino 0,05 e 0,09 do padrão RA/TQS e ficam assim): 3 para linha de contexto (0,25 · 0,13 · 0,09 mm; a espessura do desenho
     encaixa na mais próxima) e 2 para preenchimento/texto cinza (médio e claro). */
  var CINZAS = [{ aci: 250, rgb: [85, 85, 85], lw: 25 }, { aci: 251, rgb: [135, 135, 135], lw: 13 }, { aci: 252, rgb: [165, 165, 165], lw: 9 }];
  var NEUTROS = [{ aci: 253, rgb: [160, 160, 160] }, { aci: 254, rgb: [232, 232, 232] }];   /* preenchimento e texto cinza */
  var CHEIOS_BASE = [
    cheio("cheio-pendencia", "#C00000"), cheio("cheio-destaque-ra", "#00406A"), cheio("cheio-azul-aco", "#2E4050"), cheio("cheio-azul-claro", "#D7EBF8"), cheio("cheio-bege", "#E7E2D6"), cheio("cheio-verde-palido", "#E6EFE2"), cheio("cheio-cinza-azul", "#D3D8DE")
  ];
  var CHEIOS_SISTEMAS = [
    cheio("cheio-agua-fria", "#1E6FD9"), cheio("cheio-agua-quente", "#D93025"), cheio("cheio-esgoto", "#2E9E44"), cheio("cheio-pluvial", "#00ACC1"),
    cheio("cheio-azul-agua", "#2A93FF"), cheio("cheio-azul-agua-2", "#34B2FF"), cheio("cheio-verde-3", "#3FD05B"), cheio("cheio-verde-4", "#4DFA6F")
  ];
  var PERFIS = {
    hidrossanitario: {
      id: "hidrossanitario", ctbNome: "RA_Hidrossanitario.ctb", dxfNome: "HIDRO_CAD.dxf", titulo: "PRANCHAS DO HIDROSSANITARIO",
      descricao: "RA Engenharia - hidrossanitario: cor ACI = pena. Preto ACI 1-6/8/9 pela espessura (padrao RA/TQS), 7 = texto; tubulacao por sistema (AF azul, AQ vermelho, ES verde, AP ciano, IN, IND, GAS) em 0,25-0,70 mm.",
      paleta: PALETA_SISTEMAS.concat(PALETA_BASE), cheios: CHEIOS_BASE.concat(CHEIOS_SISTEMAS), cinzas: CINZAS, neutros: NEUTROS
    },
    geral: {
      id: "geral", ctbNome: "RA_Geral.ctb", dxfNome: "FOLHAS_CAD.dxf", titulo: "FOLHAS DO PROJETO (BIM)",
      descricao: "RA Engenharia - folhas do BIM (estrutural, eletrica e demais disciplinas): cor ACI = pena. Preto ACI 1-6/8/9 pela espessura (padrao RA/TQS), 7 = texto; cinzas e destaque do carimbo RA.",
      paleta: PALETA_BASE, cheios: CHEIOS_BASE, cinzas: CINZAS, neutros: NEUTROS
    }
  };
  var DISCIPLINA_PERFIL = { hidrossanitario: "hidrossanitario", hidraulica: "hidrossanitario", hidro: "hidrossanitario", agua: "hidrossanitario" };
  function perfil(disciplina) { return PERFIS[DISCIPLINA_PERFIL[txt(disciplina).toLowerCase()] || "geral"]; }
  function ctbs() { var C = CD(); return Object.keys(PERFIS).map(function (k) { return { id: k, nome: PERFIS[k].ctbNome, bytes: C.ctbDoPerfil(PERFIS[k]) }; }); }

  /* ---------------------------------------------------------------- pranchas em SVG (hidro e afins) */
  function paraCad(r, op) {
    op = op || {}; var C = CD(), P = perfil(op.disciplina || "hidrossanitario");
    if (!C || !r || !r.ok || !r.folhas || !r.folhas.length) return null;
    var o = C.paraCad(r, { perfil: P, dxfNome: op.dxfNome, dwgNome: op.dwgNome, ctbNome: op.ctbNome, hachuraGeometria: op.hachuraGeometria });
    if (!o) return null;
    var imgs = 0; r.folhas.forEach(function (f) { imgs += (txt(f.svg).match(/<image\b/g) || []).length; });
    if (imgs) o.avisos.push(imgs + " imagem(ns) (foto do modelo 3D, ícones) ficam só no PDF: o CAD leva os traços vetoriais por cima.");
    o.leiame = C.leiame(o);
    return o;
  }

  /* ---------------------------------------------------------------- folhas do BIM (Desenho2D) */
  /* ent = { pr, folhas: [{ folha, vps }], geo, projeto, empresa, logo }   (vps = { vistaId: { dados, estilo, vb, svgSemTitulo } }, como no BimFolhaUI.exportarDxf) */
  function paraCadFolhas(ent, op) {
    op = op || {}; var C = CD(), B = BD(), P = perfil(op.disciplina || "geral");
    if (!C || !B || !B.daFolhaCad || !ent || !ent.folhas || !ent.folhas.length) return null;
    var PF = C.perfilDe(P), doc = B.novoDoc({ unidade: "m" }), resumo = { layouts: [], quadros: [] }, avisos = [], modelo = { x: 0, topo: 0, altLinha: 0 };
    doc.escala = 1;
    ent.folhas.forEach(function (q) {
      var geo = q.geo || ent.geo;
      var info = B.daFolhaCad(doc, ent.pr, q.folha, geo, q.vps || {}, { projeto: ent.projeto, empresa: ent.empresa, logo: !!ent.logo, modelo: modelo, nome: q.nome, papelNome: C.papelNome, ctbNome: P.ctbNome });
      resumo.layouts.push(info);
    });
    avisos = doc.avisos.slice();
    /* as camadas passam à paleta fixa: preto pela espessura (a convenção ACI 8/9/4/3/2/1 do BimDxf é "cor pela espessura"), cor exata das camadas de cor própria */
    var COR_LW = B.COR_LW, lwPorCor = {}; Object.keys(COR_LW).forEach(function (k) { lwPorCor[COR_LW[k]] = +k; });
    Object.keys(doc.camadas).forEach(function (n) {
      var c = doc.camadas[n]; if (n === "DEFPOINTS" || n === "0") return;
      var pretaPorLw = COR_LW[c.lw] === c.cor, rgb = pretaPorLw ? [0, 0, 0] : C.aciRgb(c.cor);
      var pn = PF.snap(rgb, c.lw, false); c.cor = pn.aci; c.lw = pn.lw || 13;
    });
    var dp = doc.camadas.DEFPOINTS; if (dp) { dp.cor = 7; dp.lw = 13; }
    var o = C.finalizar(doc, PF.pens.slice(), resumo, avisos, { dwgNome: op.dwgNome, hachuraGeometria: op.hachuraGeometria }, { ctbNome: txt(op.ctbNome) || P.ctbNome, dxfNome: txt(op.dxfNome) || P.dxfNome, perfil: PF, titulo: PF.titulo, desc: PF.descricao });
    return o;
  }

  /* ---------------------------------------------------------------- ZIP */
  function zip(o) {
    var Z = dep("BimBcf", "./bimbcf.js"); if (!o || !Z || !Z.zipEscrever) return null;
    var arq = {}; arq[o.dxfNome] = o.dxf; arq[o.ctbNome] = o.ctb; arq["LEIA-ME.txt"] = o.leiame; return Z.zipEscrever(arq);
  }
  function zipDwg(o, dwg) { var C = CD(); return C ? C.zipDwg(o, dwg) : null; }

  var BimCad = { VERSAO: 1, PERFIS: PERFIS, perfil: perfil, ctbs: ctbs, paraCad: paraCad, paraCadFolhas: paraCadFolhas, zip: zip, zipDwg: zipDwg };
  global.BimCad = BimCad;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCad;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
