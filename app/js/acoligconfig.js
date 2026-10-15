/* =====================================================================
 * acoligconfig.js — CONFIGURAÇÃO DAS LIGAÇÕES DA OBRA (motor PURO, ES5,
 * sem DOM, Node-testável). 15/10/2026 — frente F3b (docs/metalica, comparativo
 * de ligações: item 2 de "O que falta trazer").
 *
 * Um lugar só para o que vale em TODAS as ligações da obra (padrão
 * brasileiro, ABNT NBR 8800): o meio padrão, a classe e os diâmetros de
 * parafuso disponíveis (da lista ÚNICA do js/acomateriais.js), parafuso por
 * atrito, o eletrodo, a folga de montagem, o espaçamento entre furos e o
 * acréscimo sobre a borda mínima da norma, o enrijecedor com ou sem recorte e
 * a tipologia preferida por situação. A Ligação inteligente (js/acoligsugere.js)
 * e as ligações automáticas (js/metalligauto.js, que chama a sugestão) passam
 * a obedecer: opSugerir(cfg) é o que vai no `op` do AcoLigSugere.sugerir, e a
 * sugestão põe cfgCalculo(cfg) na entrada de cada dimensionamento
 * (js/acoligcalc2.js lê `entrada.config`).
 *
 * DE ONDE VÊM OS PADRÕES (nada de cabeça):
 *   · furo-padrão = db + 1,5 mm ........ NBR 8800, 6.3.6 / Tabela 12 (js/metalnorma.js, conferido)
 *   · espaçamento mínimo 2,7 db, de preferência 3 db ... NBR 8800, 6.3.9 (js/metalnorma.js, conferido)
 *     → o padrão é 3 db (o que o motor sempre usou); abaixo de 2,7 db a configuração é RECUSADA
 *   · borda mínima ...................... NBR 8800, 6.3.11 / Tabela 14 (js/metalnorma.js): o acréscimo
 *     só AUMENTA a distância (nunca abaixo da tabela)
 *   · folga de montagem viga → apoio 12,7 mm — prática corrente (o FOLGA do js/acoligcalc2.js)
 *   · classes de parafuso, eletrodos ..... js/acomateriais.js (NBR 8800, Tabela A.3; AWS A5.1/A5.5)
 *   · parafuso por ATRITO: o motor verifica a ligação POR CONTATO; o deslizamento (NBR 8800, 6.3.4.3)
 *     precisa da protensão mínima da Tabela 15, que não está conferida na biblioteca → com atrito
 *     ligado a ligação sai BLOQUEADA ("não verificado"), nunca "passa".
 *   · só o furo-padrão é verificado: furo alargado/alongado é recusado na validação.
 *   · enrijecedor com/sem recorte: GUARDADO e mostrado, mas o desenho e o cálculo do enrijecedor ainda não o
 *     usam (pendência declarada no resumo).
 *   · o passo vale ao longo da linha de parafusos; o gabarito transversal continua ≥ 3 db (a favor).
 *
 * GUARDA: a configuração mora no navegador (como o padrão por seção e os materiais do
 * js/metalligsugui.js) — conveniência, não dado da obra no arquivo do modelo (pendência).
 *
 * API
 *   AcoLigConfig.PADRAO, SITUACOES, MEIOS
 *   normalizar(cfg)        → cópia completa (campos que faltam = padrão)
 *   validar(cfg)           → { ok, erros: [texto], avisos: [texto] }
 *   situacaoDe(ctx)        → "viga-mesa-pilar" | "viga-alma-pilar" | "viga-viga" | "base" | null
 *   opSugerir(cfg, op0)    → o `op` do AcoLigSugere.sugerir (execucao, meio, materiais, preferidas, config)
 *   cfgCalculo(cfg)        → { diametros, espacamentoFator, bordaAcrescimo, folgaMontagem, atrito, classeAtrito, enrijRecorte }
 *   resumo(cfg)            → [{ campo, valor, fonte }] (para a tela e o relatório)
 * Teste: node tools/test-aco-ligconfig.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Tip() { return dep("AcoLigTipos", "./acoligtipos.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function br(v, c) { c = c == null ? 1 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  var MEIOS = { parafusada: "parafusada (sem solda na obra)", soldada: "soldada (prefere as soldadas)", "por-peca": "por peça (a regra de cada encontro)" };
  var SITUACOES = { "viga-mesa-pilar": "Viga × pilar na MESA", "viga-alma-pilar": "Viga × pilar na ALMA", "viga-viga": "Viga × viga", base: "Base de pilar" };
  var ATRITO = { A: { mu: 0.35, texto: "classe A (μ = 0,35)" }, B: { mu: 0.50, texto: "classe B (μ = 0,50)" }, C: { mu: 0.35, texto: "classe C (μ = 0,35)" }, galv: { mu: 0.20, texto: "galvanizada a quente (μ = 0,20)" } };
  var ESP_MIN = 2.7, ESP_PADRAO = 3.0, FOLGA_PADRAO = 12.7;
  var PADRAO = {
    versao: 1,
    meio: "por-peca",
    parafuso: { classe: "ASTM A325", diametros: null },   /* null = TODOS os da lista central (js/acomateriais.js) — a configuração padrão não restringe nada */
    atrito: false, classeAtrito: "A",
    eletrodo: "E70XX",
    furo: "padrao",
    folgaMontagem: FOLGA_PADRAO,
    espacamentoFator: ESP_PADRAO,
    bordaAcrescimo: 0,
    enrijRecorte: true,
    tipologia: { "viga-mesa-pilar": "", "viga-alma-pilar": "", "viga-viga": "", base: "" }
  };

  function normalizar(c) {
    c = c && typeof c === "object" ? c : {};
    var o = clone(PADRAO);
    if (MEIOS[c.meio]) o.meio = c.meio;
    var pf = c.parafuso || {};
    if (pf.classe) o.parafuso.classe = String(pf.classe).slice(0, 80);
    if (Array.isArray(pf.diametros)) o.parafuso.diametros = pf.diametros.map(String);
    else { var M0 = Mat(); o.parafuso.diametros = M0 && M0.diametros ? M0.diametros("parafuso").map(function (x) { return x.id; }) : ["M12", "M16", "M20", "M22", "M24", "M27", "M30"]; }
    o.atrito = !!c.atrito;
    if (ATRITO[c.classeAtrito]) o.classeAtrito = c.classeAtrito;
    if (c.eletrodo) o.eletrodo = String(c.eletrodo);
    if (c.furo) o.furo = String(c.furo);
    o.folgaMontagem = num(c.folgaMontagem, FOLGA_PADRAO);
    o.espacamentoFator = num(c.espacamentoFator, ESP_PADRAO);
    o.bordaAcrescimo = num(c.bordaAcrescimo, 0);
    if (c.enrijRecorte === false) o.enrijRecorte = false;
    var tp = c.tipologia || {};
    Object.keys(SITUACOES).forEach(function (k) { if (tp[k]) o.tipologia[k] = String(tp[k]); });
    return o;
  }

  function validar(c0) {
    var c = normalizar(c0), erros = [], avisos = [], M = Mat(), T = Tip();
    var disp = M && M.diametros ? M.diametros("parafuso").map(function (x) { return x.id; }) : [];
    if (!c.parafuso.diametros.length) erros.push("Escolha pelo menos um diâmetro de parafuso.");
    c.parafuso.diametros.forEach(function (d) { if (disp.indexOf(d) < 0) erros.push("Diâmetro " + d + " não está na lista de parafusos (" + disp.join(", ") + ")."); });
    if (M && M.parafuso && !M.parafuso(c.parafuso.classe, 20)) erros.push("Classe de parafuso desconhecida: " + c.parafuso.classe + ".");
    if (M && M.eletrodo && !M.eletrodo(c.eletrodo)) erros.push("Eletrodo desconhecido: " + c.eletrodo + " (use " + M.ELETRODOS.map(function (e) { return e.id; }).join(" ou ") + ").");
    if (c.furo !== "padrao") erros.push("Só o furo-padrão (db + 1,5 mm, NBR 8800 6.3.6 / Tabela 12) é verificado: furo alargado ou alongado não.");
    if (!(c.espacamentoFator >= ESP_MIN - 1e-9)) erros.push("Espaçamento entre furos de " + br(c.espacamentoFator, 2) + " db: abaixo do mínimo da NBR 8800, 6.3.9 (2,7 db).");
    else if (c.espacamentoFator < ESP_PADRAO - 1e-9) avisos.push("Espaçamento de " + br(c.espacamentoFator, 2) + " db: atende o mínimo (2,7 db) mas a NBR 8800, 6.3.9, recomenda 3 db.");
    if (c.espacamentoFator > 6) erros.push("Espaçamento de " + br(c.espacamentoFator, 2) + " db: fora da faixa da configuração (2,7 a 6 db).");
    if (!(c.bordaAcrescimo >= 0)) erros.push("O acréscimo sobre a borda mínima não pode ser negativo: a Tabela 14 da NBR 8800 é o mínimo.");
    if (c.bordaAcrescimo > 50) erros.push("Acréscimo de borda acima de 50 mm: confira o valor.");
    if (!(c.folgaMontagem >= 10 && c.folgaMontagem <= 30)) erros.push("Folga de montagem de " + br(c.folgaMontagem, 1) + " mm fora da faixa aceita (10 a 30 mm; prática corrente 12,7 mm).");
    if (M && M.parafuso && M.diametros) {
      var fubs = {}; M.diametros("parafuso").forEach(function (x) { if (c.parafuso.diametros.indexOf(x.id) >= 0) { var p = M.parafuso(c.parafuso.classe, x.d); if (p) fubs[p.fub] = 1; } });
      if (Object.keys(fubs).length > 1) avisos.push(c.parafuso.classe + ": os diâmetros escolhidos têm fub diferentes (" + Object.keys(fubs).join(" e ") + " MPa) — o cálculo usa o MENOR para todos (a favor).");
    }
    if (c.atrito) avisos.push("Parafuso por ATRITO: o deslizamento (NBR 8800, 6.3.4.3) NÃO é verificado pelo motor (falta a protensão mínima da Tabela 15 conferida) — as ligações parafusadas saem BLOQUEADAS até a verificação manual.");
    Object.keys(SITUACOES).forEach(function (k) {
      var id = c.tipologia[k]; if (!id) return;
      var t = T && T.obter(id);
      if (!t) { erros.push(SITUACOES[k] + ": tipologia desconhecida (" + id + ")."); return; }
      var ap = k === "viga-viga" ? "viga-viga" : k;
      if (arr(t.aplicacoes).indexOf(ap) < 0) erros.push(SITUACOES[k] + ": " + t.nome + " não se aplica a esta situação.");
      if (c.meio === "parafusada" && t.meio === "soldada" && k !== "base") erros.push(SITUACOES[k] + ": " + t.nome + " tem solda na obra e o meio da obra é \"parafusada\".");
    });
    return { ok: !erros.length, erros: erros, avisos: avisos, config: c };
  }

  function situacaoDe(ctx) {
    if (!ctx) return null;
    if (ctx.relacao === "viga-pilar" && !ctx.pilarTubo) return ctx.face === "alma" ? "viga-alma-pilar" : "viga-mesa-pilar";
    if (ctx.relacao === "viga-viga") return "viga-viga";
    if (ctx.relacao === "base") return "base";
    return null;
  }

  /* o que o cálculo (js/acoligcalc2.js) lê em entrada.config */
  function cfgCalculo(c0) {
    var c = normalizar(c0);
    return { diametros: c.parafuso.diametros.slice(), espacamentoFator: Math.max(ESP_MIN, c.espacamentoFator), bordaAcrescimo: Math.max(0, c.bordaAcrescimo),
             folgaMontagem: c.folgaMontagem, atrito: !!c.atrito, classeAtrito: c.classeAtrito, enrijRecorte: c.enrijRecorte !== false };
  }

  /* o parafuso da obra: a classe com o fub do MAIOR diâmetro disponível (A325 acima de 25,4 mm cai para 725 MPa — a favor) */
  function parafusoDe(c) {
    var M = Mat(); if (!M || !M.parafuso) return null;
    var p = null; (M.diametros ? M.diametros("parafuso") : []).forEach(function (x) { if (c.parafuso.diametros.indexOf(x.id) < 0) return; var q = M.parafuso(c.parafuso.classe, x.d); if (q && (!p || q.fub < p.fub)) p = q; });
    if (!p) p = M.parafuso(c.parafuso.classe, 20); return p ? { id: p.id, fub: p.fub } : null;
  }

  function opSugerir(c0, op0) {
    var v = validar(c0), c = v.config, op = clone(op0 || {}) || {};
    if (!v.ok) { op.configInvalida = v.erros.slice(); return op; }   /* configuração recusada: a sugestão segue com o padrão (e a tela mostra os erros) */
    if (c.meio === "parafusada") op.execucao = "parafusada";
    if (c.meio === "soldada") op.meio = "soldada";
    op.materiais = op.materiais || {};
    var pf = parafusoDe(c); if (pf && !op.materiais.parafuso) op.materiais.parafuso = pf;
    var M = Mat(), el = M && M.eletrodo ? M.eletrodo(c.eletrodo) : null;
    if (el) op.materiais.eletrodo = { id: el.id, fw: el.fw };
    op.preferidas = {}; Object.keys(SITUACOES).forEach(function (k) { if (c.tipologia[k]) op.preferidas[k] = c.tipologia[k]; });
    op.config = cfgCalculo(c);
    return op;
  }

  function resumo(c0) {
    var c = normalizar(c0), M = Mat(), pf = parafusoDe(c), T = Tip();
    var L = [
      { campo: "Meio padrão", valor: MEIOS[c.meio], fonte: "configuração da obra" },
      { campo: "Parafuso", valor: c.parafuso.classe + (pf ? " (fub = " + pf.fub + " MPa)" : "") + " — " + c.parafuso.diametros.join(", "), fonte: M ? M.FONTE_PARAF : "" },
      { campo: "Ligação por atrito", valor: c.atrito ? "sim — " + ATRITO[c.classeAtrito].texto + " (deslizamento NÃO verificado pelo motor)" : "não (por contato)", fonte: "NBR 8800, 6.3.4.3" },
      { campo: "Eletrodo", valor: c.eletrodo, fonte: "AWS A5.1/A5.5 (js/acomateriais.js)" },
      { campo: "Furo", valor: "furo-padrão db + 1,5 mm", fonte: "NBR 8800, 6.3.6 / Tabela 12" },
      { campo: "Espaçamento entre furos", valor: br(c.espacamentoFator, 2) + " db (mínimo 2,7 db)", fonte: "NBR 8800, 6.3.9" },
      { campo: "Distância à borda", valor: "Tabela 14" + (c.bordaAcrescimo > 0 ? " + " + br(c.bordaAcrescimo, 0) + " mm" : ""), fonte: "NBR 8800, 6.3.11 / Tabela 14" },
      { campo: "Folga de montagem", valor: br(c.folgaMontagem, 1) + " mm", fonte: "prática corrente" },
      { campo: "Enrijecedor", valor: (c.enrijRecorte ? "com recorte nos cantos" : "sem recorte") + " — GUARDADO; o desenho e o cálculo do enrijecedor ainda não mudam com esta escolha (pendência)", fonte: "configuração da obra" }
    ];
    Object.keys(SITUACOES).forEach(function (k) { var t = c.tipologia[k] && T ? T.obter(c.tipologia[k]) : null; L.push({ campo: "Preferida — " + SITUACOES[k], valor: t ? t.nome : "a regra do encontro", fonte: "configuração da obra" }); });
    return L;
  }

  var AcoLigConfig = { PADRAO: PADRAO, SITUACOES: SITUACOES, MEIOS: MEIOS, ATRITO: ATRITO, ESP_MIN: ESP_MIN,
                       normalizar: normalizar, validar: validar, situacaoDe: situacaoDe, opSugerir: opSugerir, cfgCalculo: cfgCalculo, resumo: resumo };
  global.AcoLigConfig = AcoLigConfig;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigConfig;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
