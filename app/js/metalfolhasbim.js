/* =====================================================================
 * metalfolhasbim.js — METÁLICA: as PRANCHAS do cálculo (js/acopranchas.js,
 * js/acopranchaslivre.js) gravadas nas FOLHAS do BIM (Navegador › Folhas,
 * store `bim_pranchas`). Registro puro + uma fiação fina.
 *
 * Roteiro do defeito (20/11/2026): "Calcular › Pranchas" gerava as folhas só
 * dentro da tela do cálculo (SVG/DXF/PDF): não apareciam em Navegador ›
 * Folhas, nem entravam no CAD único ou no PDF em lote. Agora cada folha vira
 * uma folha de IMAGEM INTEIRA (a folha gerada, com o carimbo RA dela) no
 * registro `origem: "metalica-calc"` — o mesmo caminho das pranchas do hidro
 * e da estrutura de concreto.
 *
 * IDEMPOTENTE: há UM registro por obra com essa origem; gerar de novo troca
 * as folhas (mesmo id "met-<folha>") e nunca duplica. O desenho em si NÃO é
 * gravado (fica na sessão e é refeito pelo Calcular › Pranchas — a folha
 * nunca guarda cópia velha); depois de recarregar o app, gere de novo.
 * Teste: node tools/test-metalfolhasbim.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var ORIGEM = "metalica-calc", PREFIXO = "metsvg:";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function dataUrlSvg(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

  /* r = o resultado de AcoPranchas(Livre).gerar ({ ok, folhas:[{ id, numero, titulo, escala, formato, svg }] }) */
  /* o.origem / o.nome: outro jogo de folhas com registro próprio (ex.: as pranchas EXECUTIVAS, js/metalexecutivo.js, origem
     "metalica-executivo") — sem isso um jogo apagaria o outro */
  function registro(r, existente, obraId, o) {
    o = o || {};
    var folhas = arr(r && r.folhas).map(function (f, i) {
      return { id: "met-" + f.id, n: i + 1, conteudo: txt(f.numero) + " - " + txt(f.titulo), escala: txt(f.escala), blocos: [], imagemInteira: PREFIXO + f.id };
    });
    var reg = { nome: o.nome || "Pranchas da estrutura metálica", origem: o.origem || ORIGEM, formato: (r && r.folhas && r.folhas[0] && r.folhas[0].formato) || "A1", orientacao: "paisagem", carimbo: { modelo: "RA" }, folhas: folhas };
    if (existente && existente.id) { reg.id = existente.id; reg.criadoEm = existente.criadoEm; }
    reg.obraId = txt(obraId);
    return reg;
  }

  /* grava nas Folhas do BIM. → { registro, primeira, folhas } | null (sem BIM aberto / sem armazenamento) */
  function enviar(r, o) {
    o = o || {};
    var BF = global.BimFolhaUI; if (!BF || !BF.salvarRegistro || !global.Store || !r || !arr(r.folhas).length) return null;
    var regs = []; try { regs = arr(BF.registros()); } catch (e) { regs = []; }
    var origem = o.origem || ORIGEM, exist = regs.filter(function (x) { return x && x.origem === origem; })[0] || null, obra = o.obraId;
    if (obra == null) { try { var G = BF.G ? BF.G() : null; obra = G && G._bimSel; } catch (e2) { obra = ""; } }
    var salvo = BF.salvarRegistro(registro(r, exist, obra, o)); if (!salvo) return null;
    BF._imagensExternas = BF._imagensExternas || {};
    r.folhas.forEach(function (f) { BF._imagensExternas[PREFIXO + f.id] = dataUrlSvg(f.svg); });
    var primeira = BF.idFolha ? BF.idFolha(salvo.id, "met-" + r.folhas[0].id) : null;
    if (o.abrir && primeira) { try { if (BF.ativo && BF.ativo()) BF.abrir(primeira); } catch (e3) { /* sem a casca do BIM: fica no registro */ } }
    return { registro: salvo.id, primeira: primeira, folhas: r.folhas.length, atualizou: !!exist };
  }

  var MetalFolhasBim = { ORIGEM: ORIGEM, PREFIXO: PREFIXO, registro: registro, enviar: enviar, dataUrlSvg: dataUrlSvg };
  global.MetalFolhasBim = MetalFolhasBim;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalFolhasBim;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
