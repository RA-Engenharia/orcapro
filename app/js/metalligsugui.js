/* =====================================================================
 * metalligsugui.js — a TELA da LIGAÇÃO INTELIGENTE e do CATÁLOGO DE
 * LIGAÇÕES (aba Metálica & Mecânica › grupo "Ligação inteligente"; só com a
 * prévia do modelador). 14/10/2026.
 *
 * Fina: quem entende as peças e sugere é o js/acoligsugere.js; quem
 * dimensiona é o js/acoligcalc2.js (e o js/acoligcalc.js); quem desenha no 3D
 * é o js/metalligacao.js. Aqui:
 *   · "Ligação inteligente": as peças selecionadas (clique no pilar e, com
 *     Ctrl, na viga) → painel com até 3 sugestões (regra, confiança, prós e
 *     contras, o dimensionamento, o reforço, o desenho) → "Aplicar" cria a
 *     ligação no modelo num lote só (Ctrl+Z desfaz) e guarda a escolha na 1ª
 *     peça (caixa.ligInfo) — é dela que saem o memorial e o quantitativo
 *     (as chapas e os parafusos entram no peso do modelo como toda peça);
 *   · "Catálogo de ligações": todas as tipologias por aplicação, com o
 *     desenho, a família, as verificações (item da NBR 8800) e as limitações;
 *   · "Memorial das ligações": cada ligação aplicada, verificação por
 *     verificação (o memorial da estrutura desenhada também traz a seção);
 *   · "Ligar todos os nós": a melhor opção que passa em cada nó da seleção.
 * Cores: tokens do css/app.css (tema claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  function S() { return global.AcoLigSugere || null; }
  function T() { return global.AcoLigTipos || null; }
  function C2() { return global.AcoLigCalc2 || null; }
  function L() { return global.BimMetalLig || null; }
  function MU() { return global.BimMetalUI || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 0 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  var FAM = { flexivel: "flexível", rigida: "rígida", semirrigida: "semirrígida", reforco: "reforço" };
  var REL = { "viga-pilar": "viga → pilar", "viga-viga": "viga → viga", "emenda-viga": "emenda de viga", cumeeira: "cumeeira", "emenda-pilar": "emenda de pilar", base: "base de pilar", contraventamento: "contraventamento", "no-trelica": "nó de treliça", tubular: "nó tubular", terca: "terça → viga", "viga-sobre-pilar": "viga contínua sobre o pilar", consolo: "consolo" };

  var COMANDOS = [
    { id: "met-lig-inteligente", rotulo: "Ligação\ninteligente", icone: "raio", grande: true, dica: "Clique no PILAR e, com Ctrl, na VIGA (ou viga e viga, um pilar sozinho para a base, a diagonal e o apoio) e chame: o sistema entende o encontro (mesa ou alma, topo, nó rígido ou rotulado no cálculo) e traz até 3 ligações dimensionadas pela NBR 8800, com o reforço que precisar. Aplicar cria as chapas, parafusos e soldas." },
    { id: "met-lig-catalogo", rotulo: "Catálogo de\nligações", icone: "livro", grande: true, dica: "Todas as tipologias de ligação por aplicação — cantoneiras, chapas, talas, chapa de extremidade, assento, mísula, emendas, bases, gussets, nós tubulares, consolo — com o desenho, a família, as verificações e as limitações." },
    { id: "met-lig-lote", rotulo: "Ligar todos\nos nós", icone: "grade", grande: true, dica: "Para as peças selecionadas (ou o modelo todo): em cada encontro viga × pilar, viga × viga e base, aplica a melhor ligação que passa e tem desenho automático. Um lote só — Ctrl+Z desfaz." },
    { id: "met-lig-config", rotulo: "Configuração\ndas ligações", icone: "grade", grande: false, dica: "Configuração das ligações da obra (NBR 8800): meio padrão, classe e diâmetros de parafuso, atrito, eletrodo, folga, passo e borda, enrijecedor com ou sem recorte e a tipologia preferida por situação. A Ligação inteligente, o Ligar todos e as ligações automáticas obedecem." },
    { id: "met-lig-tipos", rotulo: "Dimensionar\ntodas (Tipos)", icone: "grade", grande: false, dica: "Dimensiona todas as ligações dos encontros com os esforços de TODAS as combinações do cálculo, diz a combinação que governa e agrupa os nós iguais em Tipos (o Tipo leva o pior nó). Não muda o modelo: é o quadro-resumo." },
    { id: "met-lig-memorial", rotulo: "Memorial das\nligações", icone: "relatorio", grande: false, dica: "Cada ligação aplicada pela ligação inteligente, verificação por verificação (item da NBR 8800, fórmula, valores e razão), com os reforços e o que não foi verificado." }
  ];

  /* ------------------------------------------------------------ estilo (tokens) */
  function css() {
    if (typeof document === "undefined" || document.getElementById("lsg-css")) return;
    var s = document.createElement("style"); s.id = "lsg-css";
    s.textContent = ".lsg{display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--texto)}" +
      ".lsg-topo{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}.lsg-topo b{font-weight:600}.lsg-topo select{min-height:30px}" +
      ".lsg-av{margin:0;padding:8px 10px 8px 26px;border:1px solid var(--linha);border-radius:8px;background:var(--surface);font-size:12px;color:var(--texto-fraco)}" +
      ".lsg-av li.inc{color:var(--vermelho);font-weight:600}" +
      ".lsg-ops{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}" +
      ".lsg-op{border:1px solid var(--linha);border-radius:10px;background:var(--card-bg,var(--surface));padding:10px;display:flex;flex-direction:column;gap:6px;min-width:0}" +
      ".lsg-op.ok{border-color:var(--verde)}.lsg-op.nok{border-color:var(--vermelho)}" +
      ".lsg-op h3{font-size:14px;margin:0;display:flex;gap:6px;align-items:baseline}.lsg-op h3 .n{color:var(--texto-fraco);font-weight:500}" +
      ".lsg-chips{display:flex;flex-wrap:wrap;gap:4px}.lsg-chip{font-size:11px;border:1px solid var(--linha);border-radius:999px;padding:1px 8px;color:var(--texto-fraco)}" +
      ".lsg-chip.ok{color:var(--verde);border-color:var(--verde)}.lsg-chip.nok{color:var(--vermelho);border-color:var(--vermelho)}" +
      ".lsg-svg svg{width:100%;height:auto;display:block;background:#fff;border-radius:6px;border:1px solid var(--linha)}" +
      ".lsg-op p{margin:0;font-size:12px}.lsg-op ul{margin:0;padding-left:16px;font-size:11.5px}.lsg-op .pro li{color:var(--verde)}.lsg-op .con li{color:var(--texto-fraco)}" +
      ".lsg-op details{font-size:11.5px}.lsg-op details table{width:100%;border-collapse:collapse;font-size:11px}.lsg-op details td{border-top:1px solid var(--linha);padding:2px 4px;vertical-align:top}" +
      ".lsg-op .acoes{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.lsg-op .sem3d{font-size:11px;color:var(--texto-fraco)}" +
      ".lsg-cat{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;max-height:64vh;overflow:auto}" +
      ".lsg-cat .lsg-op h3{font-size:13px}.lsg-nota{font-size:11px;color:var(--texto-fraco);margin:0}" +
      ".lsg-tab{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.lsg-tab th{text-align:left;font-weight:600;color:var(--texto-fraco);border-bottom:1px solid var(--linha);padding:3px 6px}" +
      ".lsg-tab td{border-top:1px solid var(--linha);padding:3px 6px;vertical-align:top}.lsg-tab tr.ok td.sit{color:var(--verde)}.lsg-tab tr.nok td.sit{color:var(--vermelho)}.lsg-tab tr.nd td.sit{color:var(--texto-fraco)}" +
      ".lsg-tab button{min-height:26px}.lsg-fora li{margin-bottom:2px}.lsg-det:empty{display:none}" +
      "@media (max-width:760px){.lsg-ops{grid-template-columns:1fr}.lsg-tab td:nth-child(3),.lsg-tab th:nth-child(3),.lsg-tab td:nth-child(5),.lsg-tab th:nth-child(5){display:none}}";
    document.head.appendChild(s);
  }

  var U = { preferir: "", execucao: "", ultimo: null, ctx: null, sg: null };
  /* SIMULAÇÃO S1 (14/10/2026): as fundações do BIM (a placa de base é verificada na sapata/bloco sob o pilar) */
  function fundacoes() { try { var st = global.BIM && BIM.editarEstado ? BIM.editarEstado().estado : null; return (st && st.fundacoes) || []; } catch (e) { return []; } }
  /* PADRÃO por combinação de seções (R-TAB): guardado NESTE navegador (conveniência; não é dado da obra) */
  var CHAVE_TAB = "orcapro:metal:ligpadrao:v1";
  function lerTabela() { try { var t = JSON.parse(global.localStorage.getItem(CHAVE_TAB) || "{}"); return t && typeof t === "object" ? t : {}; } catch (e) { return {}; } }
  function gravarTabela(t) { try { global.localStorage.setItem(CHAVE_TAB, JSON.stringify(t)); return true; } catch (e) { return false; } }
  /* MATERIAIS escolhidos no Catálogo BR (frente M1, 1.2.145): classe do parafuso, aço do chumbador e aço da chapa da
     ligação. Guardados NESTE navegador, como o padrão da tabela; sem escolha o motor usa os de sempre (ASTM A325,
     ASTM F1554 Gr.36, ASTM A36). O painel mostra os que estão valendo. */
  var CHAVE_MAT = "orcapro:metal:ligmateriais:v1", CAMPOS_MAT = ["parafuso", "chumbador", "aco"];
  function lerMat() { try { var t = JSON.parse(global.localStorage.getItem(CHAVE_MAT) || "{}"); return t && typeof t === "object" && !Array.isArray(t) ? t : {}; } catch (e) { return {}; } }
  function gravarMat(t) { try { global.localStorage.setItem(CHAVE_MAT, JSON.stringify(t)); return true; } catch (e) { return false; } }
  function opMat() { var m = lerMat(), o = null; CAMPOS_MAT.forEach(function (k) { if (m[k] && m[k].id) { o = o || {}; o[k] = m[k]; } }); return o; }
  function textoMat() { var m = opMat(); if (!m) return ""; var nomes = { parafuso: "parafuso", chumbador: "chumbador", aco: "chapa" }; return CAMPOS_MAT.filter(function (k) { return m[k]; }).map(function (k) { return nomes[k] + " " + m[k].id; }).join(" · "); }
  /* CONFIGURAÇÃO DAS LIGAÇÕES DA OBRA (F3b, 15/10/2026 — js/acoligconfig.js): guardada NESTE navegador, como a tabela e os
     materiais (pendência: gravar no arquivo da obra). SEM configuração salva, a sugestão é a de sempre; a salva já foi validada. */
  var CHAVE_CFG = "orcapro:metal:ligconfig:v1";
  function CF() { return global.AcoLigConfig || null; }
  function lerCfg() { try { var t = JSON.parse(global.localStorage.getItem(CHAVE_CFG) || "null"); return t && typeof t === "object" && !Array.isArray(t) ? t : null; } catch (e) { return null; } }
  function gravarCfg(t) { try { if (t == null) global.localStorage.removeItem(CHAVE_CFG); else global.localStorage.setItem(CHAVE_CFG, JSON.stringify(t)); return true; } catch (e) { return false; } }
  function opObra(base) { var c = lerCfg(), F = CF(); if (!c || !F) return base; return F.opSugerir(c, base); }
  var CUSTO = { 1: "baixo", 2: "médio", 3: "alto" };
  /* QUEM PODE SER APLICADA (revisão A1): só a opção que PASSA, sem bloqueio e com desenho; a chapa estendida que pede o
     pilar prolongado só pelo botão de prolongar. Devolve { ok, prolongar, motivo } */
  function podeAplicar(o) {
    if (!o) return { ok: false, motivo: "opção inexistente" };
    var r = o.resultado || {}, bq = o.bloqueio || arr(r.bloqueante)[0] || "";
    if (bq) return { ok: false, motivo: "não verificado: " + bq };
    if (!o.aplicar) return o.passa ? { ok: false, semDesenho: true, motivo: "desenho no 3D ainda não automático para esta tipologia" } : { ok: false, motivo: o.bloqueioProlongar || "NÃO PASSA (governa: " + (r.governante || "—") + ")" };
    /* o prolongar só destrava quando é o ÚNICO bloqueio (revisão N1: a oblíqua no topo do pilar ganhava o botão) */
    if (o.bloqueioProlongar) return o.aplicar.prolongar && r.ok ? { ok: false, prolongar: true, motivo: o.bloqueioProlongar } : { ok: false, motivo: o.bloqueioProlongar };
    if (!o.passa) return { ok: false, motivo: "NÃO PASSA (governa: " + (r.governante || "—") + ")" };
    return { ok: true };
  }

  function clone2(o) { var n = {}; Object.keys(o || {}).forEach(function (k) { n[k] = o[k]; }); return n; }
  /* LIGAÇÃO AO LANÇAR (15/10/2026, js/metalligauto.js): a ligação lançada com a viga só pelo peso próprio é PROVISÓRIA —
     quem aplica a ligação no mesmo encontro (Ligação inteligente, Ligar todos os nós) a SUBSTITUI (as peças e os furos dela
     saem no mesmo lote, DEPOIS da nova: a viga refeita pela nova ainda leva os furos velhos, que o apagar tira) */
  /* AUTOMÁTICA = lançada com a viga (origem "lancar-viga"), em qualquer estado — a confirmada/ajustada pelo cálculo também: quem
     aplica a ligação no encontro é o engenheiro, e a dele substitui a automática (sem isso a Ligação inteligente desenhava a 2ª
     ligação no mesmo joelho e o Ligar todos pulava o nó — e2e das simulações) */
  function provisoria(c) { var li = c && c.ligInfo; return !!(li && li.origem === "lancar-viga" && c.metal && c.metal.lig); }
  function provisoriasEntre(cxs, ids) {
    var out = []; ids = arr(ids).map(String);
    arr(cxs).forEach(function (c) { if (!provisoria(c)) return; var pp = arr(c.ligInfo.pecas).map(String); if (ids.length >= 2 && ids.every(function (i) { return pp.indexOf(i) >= 0; }) && out.indexOf(c.metal.lig) < 0) out.push(String(c.metal.lig)); });
    return out;
  }
  /* M2 (1.2.145): os botões levam o índice da LISTA COMPLETA (todasOpcoes); os 3 cartões são as 3 primeiras coerentes */
  function idxDe(o) { var L = arr(U.sg && U.sg.todasOpcoes), i = L.indexOf(o); return i >= 0 ? i : arr(U.sg && U.sg.opcoes).indexOf(o); }
  function opDe(i) { var L = arr(U.sg && U.sg.todasOpcoes); return L[i] || (U.sg && arr(U.sg.opcoes)[i]) || null; }
  function situacao(o) {
    var r = o.resultado || {}, pa = podeAplicar(o), inc = o.avisos.some(function (a) { return /INCOER/.test(a); });
    if (r.naoDimensionada) return { cl: "nd", t: "não dimensionada — " + String(r.governante || "").replace(/^não dimensionada: /, "") };
    var pct = isFinite(num(r.razao, NaN)) ? br(num(r.razao, 0) * 100) + " %" : "—";
    if (pa.ok) return { cl: "ok", t: "passa · " + pct + (inc ? " · incoerente com o cálculo" : "") };
    if (pa.semDesenho) return { cl: "ok", t: "passa · " + pct + " (desenho no 3D não automático)" };
    if (o.passa === false && !(o.bloqueio || o.bloqueioProlongar || arr(r.bloqueante).length)) return { cl: "nok", t: "não passa · " + pct + " — governa: " + (r.governante || "—") };
    return { cl: "nok", t: "bloqueada — " + pa.motivo };
  }
  function selCaixas() { var M = MU(); if (!M) return []; return M.caixas(M.selecao()); }
  function todasCaixas() { var M = MU(), st = M && M.estado ? M.estado() : null; return (st && st.caixas) || []; }
  function resultadoCalc() { try { var C = global.MetalCalcLivreUI; return C && C.resultado ? C.resultado() : null; } catch (e) { return null; } }

  /* ------------------------------------------------------------ painel de sugestões */
  function cartao(o, i) {
    var r = o.resultado || {}, bloq = o.bloqueio || o.bloqueioProlongar || arr(r.bloqueante)[0] || "", pa = podeAplicar(o), Tp = T(), svg = Tp ? Tp.svg(o.tipologia) : "", inc = o.avisos.some(function (a) { return /INCOER/.test(a); });
    var h = '<div class="lsg-op ' + (o.passa ? "ok" : "nok") + '" data-lsg-op="' + i + '" data-lsg-tip="' + esc(o.tipologia) + '">' +
      '<h3><span class="n">' + (i + 1) + "º</span> " + esc(o.nome) + "</h3>" +   /* i = a posição na lista completa */
      '<div class="lsg-chips">' + (r.naoDimensionada ? '<span class="lsg-chip nok" data-lsg="passa">não dimensionada</span>' : '<span class="lsg-chip ' + (o.passa ? "ok" : "nok") + '" data-lsg="passa">' + (o.passa ? "passa" : "não passa") + " · " + br(num(r.razao, 0) * 100) + " %</span>") +
      '<span class="lsg-chip">' + esc(FAM[o.familia] || o.familia) + '</span><span class="lsg-chip">confiança ' + esc(o.confianca) + '</span>' +
      '<span class="lsg-chip" data-lsg="custo">custo ' + esc(CUSTO[o.custo.custo] || "—") + " · fabricação " + esc(CUSTO[o.custo.fabricacao] || "—") + " · montagem " + esc(CUSTO[o.custo.montagem] || "—") + "</span>" +
      (o.peso != null ? '<span class="lsg-chip" data-lsg="peso">≈ ' + esc(String(o.peso).replace(".", ",")) + " kg de aço</span>" : "") + '<span class="lsg-chip" title="' + esc(o.regra.texto) + '">regra ' + esc(o.regra.id) + "</span>" +
      (inc ? '<span class="lsg-chip nok">incoerente com o cálculo</span>' : "") + "</div>" +
      (svg ? '<div class="lsg-svg">' + svg + "</div>" : "") +
      "<p>" + esc(o.justificativa) + "</p>" +
      (function () { var t0 = Tp && Tp.obter(o.tipologia), ft = t0 && t0.faces && U.ctx ? t0.faces[U.ctx.face] : null; return ft ? '<p data-lsg="face-txt"><b>' + (U.ctx.face === "alma" ? "Na alma" : "Na mesa") + ":</b> " + esc(String(ft).replace(/^Na (MESA|ALMA): /, "")) + "</p>" : ""; })() +
      '<p><b>Dimensionado:</b> ' + esc(r.resumo || r.motivo || "—") + "</p>" +
      (r.notaCorte ? '<p data-lsg="corte"><b>Corte:</b> ' + esc(r.notaCorte) + "</p>" : "") +
      (o.reforcos.length ? '<p data-lsg="reforco"><b>Reforço:</b> ' + esc(o.reforcos.join("; ")) + "</p>" : "") +
      (o.pros.length ? '<ul class="pro">' + o.pros.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (o.contras.length ? '<ul class="con">' + o.contras.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (o.avisos.length ? '<ul class="con" data-lsg="avisos-op">' + o.avisos.map(function (x) { return '<li' + (/INCOER/.test(x) ? ' style="color:var(--vermelho)"' : "") + ">" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      "<details><summary>Verificações (" + arr(r.verificacoes).length + ")</summary><table>" + arr(r.verificacoes).map(function (v) { return "<tr><td>" + esc(v.nome) + '<br><span class="lsg-nota">' + esc(v.item) + '</span></td><td style="text-align:right;white-space:nowrap;color:' + (v.razao <= 1 + 1e-9 ? "var(--verde)" : "var(--vermelho)") + '">' + br(v.razao * 100) + " %</td></tr>"; }).join("") + "</table></details>" +
      '<div class="acoes">' + (pa.prolongar ? '<button class="btn primary sm" data-lsg-prolongar="' + i + '" title="' + esc(bloq) + '">Prolongar o pilar ' + o.aplicar.prolongar.mm + ' mm e aplicar</button>' : !pa.ok && !pa.semDesenho ? '<span class="sem3d" data-lsg="bloqueio">Não aplicável: ' + esc(pa.motivo) + '.</span>' : o.aplicar ? '<button class="btn primary sm" data-lsg-aplicar="' + i + '">Aplicar no modelo</button>' : '<span class="sem3d" data-lsg="sem3d">Desenho no 3D ainda não automático para esta tipologia — o dimensionamento vale e vai no memorial.</span>') +
      '<button class="btn ghost sm" data-lsg-memorial="' + i + '">Memorial</button>' +
      (o.regra.id === "R-TAB" ? '<span class="sem3d">padrão guardado</span>' : '<button class="btn ghost sm" data-lsg-padrao="' + i + '" title="Nas próximas vezes, esta combinação de seções traz esta ligação primeiro (guardado neste navegador)">Usar como padrão</button>') + "</div></div>";
    return h;
  }
  function painelHtml(ctx, sg) {
    var pecas = arr(ctx.pecas).map(function (p) { return esc(p.papel) + " " + esc(p.id) + " (" + esc(p.perfil && p.perfil.nome) + ")"; }).join(" · ");
    var no = ctx.no || {}, rel = REL[ctx.relacao] || ctx.relacao;
    var h = '<div class="lsg" data-lsg="painel" data-modal-largo data-lsg-relacao="' + esc(ctx.relacao) + '" data-lsg-face="' + esc(ctx.face) + '">' +
      '<div class="lsg-topo"><span><b>Encontro:</b> ' + esc(rel) + (ctx.relacao === "viga-pilar" ? (ctx.face === "tubo" ? " — no <b data-lsg=\"face\">pilar tubular</b>" : " — na <b data-lsg=\"face\">" + esc(ctx.face) + "</b> do pilar") + (ctx.topoPilar ? " (topo do pilar)" : "") + (ctx.face === "alma" && ctx.cabeEntreMesas === false ? " — a viga NÃO cabe entre as mesas" : "") : "") + "</span>" +
      "<span><b>Nó:</b> " + esc(no.rigido === true ? "rígido" : no.rigido === false ? "rotulado" : "padrão (rotulado)") + " — " + esc(no.texto || "") + "</span>" +
      '<label>Preferência <select data-lsg="preferir"><option value=""' + (!U.preferir ? " selected" : "") + '>pelo cálculo</option><option value="rigida"' + (U.preferir === "rigida" ? " selected" : "") + '>rígida</option><option value="flexivel"' + (U.preferir === "flexivel" ? " selected" : "") + ">flexível</option></select></label>" +
      '<label>Na obra <select data-lsg="execucao"><option value=""' + (!U.execucao ? " selected" : "") + '>solda ou parafuso</option><option value="parafusada"' + (U.execucao === "parafusada" ? " selected" : "") + ">tudo parafusado</option></select></label></div>" +
      (ctx.fundacao ? '<p class="lsg-nota" data-lsg="fundacao">Fundação sob o pilar: ' + esc(ctx.fundacao.rotulo) + " " + esc(ctx.fundacao.id) + (ctx.fundacao.dimensoes ? " " + br(ctx.fundacao.dimensoes.B, 2) + " × " + br(ctx.fundacao.dimensoes.L, 2) + " × " + br(ctx.fundacao.dimensoes.h, 2) + " m" : "") + " · fck " + br(ctx.fundacao.fck, 0) + " MPa" + (ctx.fundacao.fckInformado ? "" : " (adotado — informe nas Propriedades da fundação)") + " — a ancoragem é verificada nela.</p>" : "") +
      (textoMat() ? '<p class="lsg-nota" data-lsg="materiais">Materiais escolhidos no Catálogo BR: ' + esc(textoMat()) + '</p>' : '') +
      '<p class="lsg-nota">Peças: ' + pecas + ". Esforços: " + esc(ctx.origemEsforcos || "—") + "</p>";
    var av = arr(sg.avisos);
    if (av.length) h += '<ul class="lsg-av" data-lsg="avisos">' + av.map(function (a) { return "<li" + (/INCOER/.test(a) ? ' class="inc"' : "") + ">" + esc(a) + "</li>"; }).join("") + "</ul>";
    var E0 = sg.escopo;
    if (E0) h += '<details class="lsg-av" data-lsg="escopo"><summary><b>Escopo:</b> o que o sistema verificou e o que NÃO verificou (efeito alavanca e placa de base da NBR 8800:2024 pendentes do texto)</summary><p>' + esc(E0.verificado) + "</p><ul>" + E0.naoVerificado.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>";
    h += '<div class="lsg-ops">' + sg.opcoes.map(function (o) { return cartao(o, idxDe(o)); }).join("") + "</div>";
    /* M2 (1.2.145): TODAS as tipologias que servem nesta geometria, ranqueadas, e as que ficaram de fora com o motivo */
    var tod = arr(sg.todasOpcoes);
    if (tod.length) {
      h += '<details class="lsg-av" data-lsg="todas"' + (tod.length > sg.opcoes.length ? " open" : "") + '><summary><b>Todas as tipologias que servem neste encontro (' + tod.length + ")</b> — ranqueadas; as que não passam dizem por quê</summary>" +
        (sg.criterio ? '<p class="lsg-nota" data-lsg="criterio">' + esc(sg.criterio) + "</p>" : "") +
        '<table class="lsg-tab"><tr><th>#</th><th>Tipologia</th><th>Família</th><th>Situação</th><th>Regra</th><th></th></tr>' +
        tod.map(function (o, k) { var st = situacao(o); return '<tr class="' + st.cl + '" data-lsg-lin="' + k + '" data-lsg-tip="' + esc(o.tipologia) + '"><td>' + (k + 1) + "</td><td>" + esc(o.nome) + "</td><td>" + esc(FAM[o.familia] || o.familia) + '</td><td class="sit">' + esc(st.t) + '</td><td title="' + esc(o.regra.texto) + '">' + esc(o.regra.id) + '</td><td><button class="btn ghost sm" data-lsg-ver="' + k + '">Ver</button></td></tr>'; }).join("") + "</table></details>";
      h += '<div class="lsg-det" data-lsg="detalhe"></div>';
    }
    var fora = arr(sg.fora);
    if (fora.length) h += '<details class="lsg-av" data-lsg="fora"><summary><b>Fora da lista (' + fora.length + ")</b> — não servem nesta geometria ou neste nó; o motivo de cada uma</summary><ul class=\"lsg-fora\">" + fora.map(function (f) { return '<li data-lsg-fora="' + esc(f.tipologia) + '"><b>' + esc(f.nome) + "</b>: " + esc(f.motivo) + "</li>"; }).join("") + "</ul></details>";
    h += '<p class="lsg-nota">' + esc(T() ? T().EDICAO.aviso : "") + " Regras usadas: " + sg.regras.map(function (r) { return esc(r.id); }).join(", ") + ' — passe o mouse na regra para ler. <a href="#" data-lsg="ver-catalogo">Ver todas as tipologias deste encontro</a>.</p></div>';
    return h;
  }
  function ligar(raiz) {
    if (!raiz) return;
    raiz.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest("[data-lsg-aplicar],[data-lsg-prolongar],[data-lsg-memorial],[data-lsg-padrao],[data-lsg-ver],[data-lsg='ver-catalogo']") : null; if (!a) return;
      ev.preventDefault();
      if (a.getAttribute("data-lsg-ver") != null) { var k = +a.getAttribute("data-lsg-ver"), o = opDe(k), det = raiz.querySelector("[data-lsg='detalhe']"); if (o && det) { det.innerHTML = cartao(o, k).replace('class="lsg-op ', 'data-lsg-det="' + k + '" class="lsg-op '); try { det.scrollIntoView({ block: "nearest" }); } catch (eS) {} } return; }
      if (a.getAttribute("data-lsg-aplicar") != null) MetalLigSugUI.aplicar(+a.getAttribute("data-lsg-aplicar"));
      else if (a.getAttribute("data-lsg-prolongar") != null) MetalLigSugUI.aplicar(+a.getAttribute("data-lsg-prolongar"), { prolongar: true });
      else if (a.getAttribute("data-lsg-memorial") != null) MetalLigSugUI.memorialOpcao(+a.getAttribute("data-lsg-memorial"));
      else if (a.getAttribute("data-lsg-padrao") != null) MetalLigSugUI.usarComoPadrao(+a.getAttribute("data-lsg-padrao"));
      else MetalLigSugUI.catalogo(apDe(U.ctx));
    });
    var sel = raiz.querySelector("[data-lsg='preferir']");
    if (sel) sel.addEventListener("change", function () { U.preferir = sel.value; MetalLigSugUI.abrir({ manter: true }); });
    var selE = raiz.querySelector("[data-lsg='execucao']");
    if (selE) selE.addEventListener("change", function () { U.execucao = selE.value; MetalLigSugUI.abrir({ manter: true }); });
  }
  function apDe(ctx) {
    if (!ctx) return "";
    var m = { "viga-pilar": ctx.face === "tubo" ? "viga-pilar-tubo" : ctx.face === "alma" ? "viga-alma-pilar" : "viga-mesa-pilar", "viga-sobre-pilar": "viga-sobre-pilar", "viga-viga": "viga-viga", "emenda-viga": "emenda-viga", cumeeira: "emenda-viga", "emenda-pilar": "emenda-pilar", base: "base", contraventamento: "contraventamento", "no-trelica": "no-trelica", tubular: "tubular", terca: "terca" };
    return m[ctx.relacao] || "";
  }

  /* ------------------------------------------------------------ aplicar */
  /* a altura da viga no pilar: o ponto do eixo da viga na ponta do nó, medido ao longo do pilar (m, do início do sólido) */
  function alturaNoPilar(pil, vg) {
    var M = global.BimMetal; if (!pil || !vg || !M) return null;
    var mp = M.membro(pil), mv = M.membro(vg); if (!mp || !mv) return null;
    var V = M.vet, pts = [mv.P0, V.add(mv.P0, V.mul(mv.X, mv.L))];
    function perp(P) { var d = V.sub(P, mp.P0), t = V.dot(d, mp.X); return V.len(V.sub(d, V.mul(mp.X, t))); }
    var P = perp(pts[1]) < perp(pts[0]) ? pts[1] : pts[0];
    return { mp: mp, mv: mv, xc: V.dot(V.sub(P, mp.P0), mp.X) };
  }
  /* aplica a opção: o lote (prolongar o pilar, se pedido + a macro + enrijecedores + chapa de reforço da alma) e a escolha
     guardada; op = { prolongar: true } faz o pilar subir o que a chapa estendida pede (no MESMO lote: um Ctrl+Z) */
  function aplicarOpcao(o, ctx, porId, novoId, op) {
    op = op || {};
    var BL = L(), ap = o.aplicar; if (!BL || !ap) return { ok: false, motivo: "Esta tipologia não tem desenho automático." };
    var pre = [];
    if (op.prolongar) {
      if (!ap.prolongar) return { ok: false, motivo: "Esta opção não pede pilar prolongado." };
      var pil0 = porId[String(ap.prolongar.alvo)], opP = pil0 && BL.prolongar ? BL.prolongar(pil0, ap.prolongar.mm / 1000) : null;
      if (!opP || !opP._apos) return { ok: false, motivo: "Este pilar não é de aço do modelador (prolongue pelas Propriedades: " + ap.prolongar.mm + " mm)." };
      porId = clone2(porId); porId[String(ap.prolongar.alvo)] = opP._apos; pre.push(opP);
    }
    var cx = ap.ordem.map(function (id) { return porId[String(id)]; }).filter(Boolean);
    if (cx.length !== ap.ordem.length) return { ok: false, motivo: "As peças da ligação não estão mais no modelo." };
    var lig = novoId(), par = clone(ap.par) || {}, r, lote; par.lig = lig;
    if (ap.macro) {
      r = BL.aplicar(ap.macro, cx, par);
      if (!r.ok && cx.length === 2) { var r2 = BL.aplicar(ap.macro, [cx[1], cx[0]], par); if (r2.ok) r = r2; }
      if (!r.ok) return { ok: false, motivo: r.motivo || "a macro recusou" };
      lote = BL.ops(r, novoId);
    } else { r = { ok: true, resumo: o.nome, avisos: [] }; lote = { op: "lote", id: String(novoId()), origem: "metal-lig", ops: [] }; }
    lote.ops = pre.concat(lote.ops);
    var extras = [];
    /* enrijecedores de continuidade no pilar, na altura das mesas da viga (mesma ligação: "Desfazer ligação" leva junto) */
    arr(ap.enrijecedores).forEach(function (en) {
      var pil = porId[String(en.alvo)], an = alturaNoPilar(pil, porId[String(ctx.A)]); if (!an) return;
      var mp = an.mp, mv = an.mv, xc = an.xc, h = mv.s.alt / 2 - num(mv.perfil.tf, 0.01) / 2;
      [xc + h, xc - h].forEach(function (x) {
        var tq = en.t || 0.0125; if (x < -0.05 || x > mp.L + 0.05) return;
        x = Math.max(tq / 2 + 0.002, Math.min(mp.L - tq / 2 - 0.002, x));   /* no topo do pilar o enrijecedor de cima encosta na ponta (vira a tampa entre as mesas) */
        var re = BL.enrijecedor(pil, { x: x, t: tq, lig: lig, aco: en.aco || undefined });
        if (re.ok) { var lo = BL.ops(re, novoId); if (lo) extras = extras.concat(lo.ops.filter(function (q) { return q.op === "criar"; })); }
      });
    });
    /* chapa de reforço da alma do pilar no painel do nó (altura da viga + 100 mm de cada lado) */
    arr(ap.reforcos).forEach(function (rf) {
      var pil = porId[String(rf.alvo)], an = alturaNoPilar(pil, porId[String(ctx.A)]); if (!an || !BL.reforcoAlma) return;
      var rr = BL.reforcoAlma(pil, { x: an.xc, t: rf.t || 0.008, altura: an.mv.s.alt + 0.2, lig: lig, aco: rf.aco || undefined });
      if (rr.ok) { var lo2 = BL.ops(rr, novoId); if (lo2) extras = extras.concat(lo2.ops.filter(function (q) { return q.op === "criar"; })); }
    });
    if (!lote.ops.length && !extras.length) return { ok: false, motivo: "Nada a desenhar para esta opção." };
    lote.ops = lote.ops.concat(extras);
    /* a 1ª peça NOVA da ligação (as primeiras ops podem ser o ajuste da ponta da viga, que recria a viga) */
    var primeira = lote.ops.filter(function (q) { return q.op === "criar" && q.caixa && q.caixa.metal && q.caixa.metal.lig === lig; })[0];
    if (op.prolongar) r.resumo = "Pilar prolongado " + ap.prolongar.mm + " mm; " + (r.resumo || "");
    var S0 = S(), ent = o.entrada || (S0 ? S0.entradaCalc(ctx, {}) : null);
    if (primeira) primeira.caixa.ligInfo = { v: 1, tipologia: o.tipologia, nome: o.nome, familia: o.familia, regra: o.regra.id, pecas: arr(ctx.ordem).slice(), entrada: ent, notaCorte: (o.resultado && o.resultado.notaCorte) || null,
      resumo: (o.resultado || {}).resumo || "", razao: num((o.resultado || {}).razao, 0), ok: !!o.passa, estimativa: !!ctx.estimativa, em: new Date().toISOString() };
    /* SIMULAÇÃO S1: a fundação em que a placa foi verificada (contornos como lista de objetos — a nuvem recusa lista em lista) */
    if (primeira && o.fundacao) primeira.caixa.ligInfo.fundacao = clone(o.fundacao);
    return { ok: true, lote: lote, r: r, lig: lig, n: lote.ops.length, aviso: ap.aviso };
  }

  var MetalLigSugUI = {
    COMANDOS: COMANDOS,
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    registrar: function (reg) {
      if (!previa() || !S() || !T() || !C2()) return false;
      var self = this, h = { "met-lig-config": function () { self.configurar(); }, "met-lig-tipos": function () { self.tipos(); }, "met-lig-inteligente": function () { self.abrir(); }, "met-lig-catalogo": function () { self.catalogo(); }, "met-lig-lote": function () { self.lote(); }, "met-lig-memorial": function () { self.memorial(); } };
      Object.keys(h).forEach(function (k) { reg[k] = function () { try { h[k](); } catch (e) { toast("Ligação inteligente: " + (e && e.message ? e.message : e), "erro", 8000); } return true; }; });
      try {
        var D = global.DicaRica;
        if (D && D.item && D.registrar) {
          D.item("lig-inteligente", { titulo: "Ligação inteligente", oQueE: "O sistema entende o encontro das peças selecionadas e sugere a ligação que fica melhor, dimensionada.", ondeUsa: "Viga × pilar (mesa ou alma), viga × viga, emendas, bases, contraventamento, treliça, terça.", dica: "Clique no pilar e, com Ctrl, na viga; depois chame o comando.", svg: T().svg("chapa-ext-estendida-enrij") });
          D.item("lig-catalogo", { titulo: "Catálogo de ligações", oQueE: T().TIPOS.length + " tipologias de ligação com desenho, família, verificações e limitações.", ondeUsa: "Escolher e conhecer a ligação antes de detalhar.", dica: "Filtre pela aplicação.", svg: T().svg("cant-dupla-paraf") });
          D.registrar("met-lig-inteligente", "lig-inteligente"); D.registrar("met-lig-catalogo", "lig-catalogo");
        }
      } catch (eD) {}
      return true;
    },

    /* abre o painel com as sugestões para a seleção (devolve o resultado — a e2e usa) */
    abrir: function (o) {
      o = o || {};
      var S0 = S(); if (!S0 || !global.UI) return null;
      css();
      var cxs = o.manter && U.cxs ? U.cxs : selCaixas();
      if (!cxs.length) { var t = "Ligação inteligente: selecione as peças que se encontram — clique no PILAR e, com Ctrl, na VIGA (ou um pilar sozinho para a base)."; status(t); toast(t, "aviso", 8000); return null; }
      var ctx = S0.analisar(cxs, { resultado: resultadoCalc(), fundacoes: fundacoes() });
      if (!ctx.ok) { status("Ligação inteligente: " + ctx.motivo); toast(ctx.motivo, "aviso", 8000); return null; }
      var sg = S0.sugerir(ctx, opObra({ preferir: U.preferir || null, execucao: U.execucao || null, tabela: lerTabela(), materiais: opMat() }));
      U.cxs = cxs; U.ctx = ctx; U.sg = sg;
      if (!sg.ok || !sg.opcoes.length) { toast("Ligação inteligente: nenhuma tipologia para este encontro (" + (REL[ctx.relacao] || ctx.relacao) + ").", "aviso", 8000); return sg; }
      UI.modal("Ligação inteligente — " + (REL[ctx.relacao] || ctx.relacao), painelHtml(ctx, sg), [{ texto: "Catálogo", onClick: function () { MetalLigSugUI.catalogo(apDe(ctx)); } }, { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      ligar(document.querySelector("[data-lsg='painel']"));
      status("Ligação inteligente: " + sg.opcoes.length + " opção(ões) para " + (REL[ctx.relacao] || ctx.relacao) + "; a 1ª " + (sg.opcoes[0].passa ? "passa" : "NÃO passa") + ".");
      return sg;
    },
    sugestao: function () { return U.sg; },
    /* a opção vira o padrão desta combinação de seções (R-TAB) e o painel se refaz */
    usarComoPadrao: function (i) {
      var o = opDe(i); if (!o || !U.sg.chave) return false;
      var t = lerTabela(); t[U.sg.chave] = o.tipologia;
      if (!gravarTabela(t)) { toast("Não deu para guardar o padrão neste navegador.", "aviso", 6000); return false; }
      toast(o.nome + ": padrão para " + U.sg.chave.split("|").join(" · ") + ".", "ok", 6000);
      this.abrir({ manter: true });
      return true;
    },
    tabela: function () { return lerTabela(); },
    /* materiais(): os escolhidos; materiais({ parafuso: {id, fub} | null, chumbador: {id, fy, fu} | null, aco: {id, fy, fu} | null })
       grava (null tira o campo); materiais(null) limpa tudo. Devolve o que ficou valendo. */
    materiais: function (novo) {
      if (novo === null) gravarMat({});
      else if (novo && typeof novo === "object") {
        var t = lerMat();
        CAMPOS_MAT.forEach(function (k) {
          if (!(k in novo)) return;
          var m = novo[k];
          if (m === null) { delete t[k]; return; }
          if (!m || !m.id) return;
          var o = { id: String(m.id).slice(0, 80) };
          if (k === "parafuso") { if (!(Number(m.fub) > 0)) return; o.fub = Number(m.fub); }
          else { if (!(Number(m.fy) > 0 && Number(m.fu) > 0)) return; o.fy = Number(m.fy); o.fu = Number(m.fu); }
          t[k] = o;
        });
        gravarMat(t);
      }
      return opMat() || {};
    },
    /* "tudo parafusado na obra" (sem solda de campo) vale também para Ligar todos os nós */
    execucao: function (v) { if (v !== undefined) U.execucao = v === "parafusada" ? "parafusada" : ""; return U.execucao || null; },
    /* CONFIGURAÇÃO DA OBRA (F3b): configuracao() → { config (normalizada), salva, validacao }; configuracao(obj) valida e grava
       (inválida NÃO grava: devolve os erros); configuracao(null) volta ao padrão (nada salvo) */
    configuracao: function (novo) {
      var F = CF(); if (!F) return null;
      if (novo === null) gravarCfg(null);
      else if (novo && typeof novo === "object") { var v = F.validar(novo); if (!v.ok) return { config: v.config, salva: false, validacao: v }; gravarCfg(v.config); }
      var c = lerCfg(); return { config: F.normalizar(c), salva: !!c, validacao: F.validar(c || {}) };
    },
    configuracaoSalva: function () { return lerCfg(); },
    /* o painel da configuração (um lugar só) */
    configurar: function () {
      var F = CF(), Tp = T(), Mt = global.AcoMateriais; if (!F || !Tp || !global.UI) return false;
      css();
      var c = F.normalizar(lerCfg()), di = Mt ? Mt.diametros("parafuso") : [];
      function opt(v, txt, sel) { return '<option value="' + esc(v) + '"' + (sel ? " selected" : "") + ">" + esc(txt) + "</option>"; }
      var classes = (Mt ? Mt.PARAFUSOS : []).map(function (p) { return p.id.split(" (")[0]; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      var h = '<div class="lsg" data-lsg="config" data-modal-largo><p class="lsg-nota">Vale para todas as ligações da obra (NBR 8800). Os padrões são os da norma; valor abaixo do mínimo é recusado.</p>' +
        '<label>Meio padrão <select data-cfg="meio">' + Object.keys(F.MEIOS).map(function (k) { return opt(k, F.MEIOS[k], c.meio === k); }).join("") + "</select></label>" +
        '<label>Classe do parafuso <select data-cfg="classe">' + classes.map(function (k) { return opt(k, k, c.parafuso.classe === k); }).join("") + "</select></label>" +
        "<fieldset><legend>Diâmetros disponíveis</legend>" + di.map(function (x) { return '<label><input type="checkbox" data-cfg-d="' + esc(x.id) + '"' + (c.parafuso.diametros.indexOf(x.id) >= 0 ? " checked" : "") + "> " + esc(x.id) + "</label>"; }).join(" ") + "</fieldset>" +
        '<label><input type="checkbox" data-cfg="atrito"' + (c.atrito ? " checked" : "") + "> Parafuso por atrito (o deslizamento não é verificado pelo sistema: a ligação fica bloqueada até a verificação manual)</label>" +
        '<label>Superfície <select data-cfg="classeAtrito">' + Object.keys(F.ATRITO).map(function (k) { return opt(k, F.ATRITO[k].texto, c.classeAtrito === k); }).join("") + "</select></label>" +
        '<label>Eletrodo <select data-cfg="eletrodo">' + (Mt ? Mt.ELETRODOS : []).map(function (e) { return opt(e.id, e.id + " (fw = " + e.fw + " MPa)", c.eletrodo === e.id); }).join("") + "</select></label>" +
        '<label>Passo entre furos (× db; mínimo 2,7 — 6.3.9) <input type="number" step="0.1" min="2.7" data-cfg="espacamentoFator" value="' + c.espacamentoFator + '"></label>' +
        '<label>Acréscimo sobre a borda mínima da Tabela 14 (mm) <input type="number" step="1" min="0" data-cfg="bordaAcrescimo" value="' + c.bordaAcrescimo + '"></label>' +
        '<label>Folga de montagem viga → apoio (mm) <input type="number" step="0.1" min="10" max="30" data-cfg="folgaMontagem" value="' + c.folgaMontagem + '"></label>' +
        '<label><input type="checkbox" data-cfg="enrijRecorte"' + (c.enrijRecorte ? " checked" : "") + "> Enrijecedor com recorte nos cantos (guardado; o desenho e o cálculo do enrijecedor ainda não mudam com ele)</label>" +
        "<fieldset><legend>Tipologia preferida por situação</legend>" + Object.keys(F.SITUACOES).map(function (k) { return "<label>" + esc(F.SITUACOES[k]) + ' <select data-cfg-t="' + k + '">' + opt("", "a regra do encontro", !c.tipologia[k]) + Tp.porAplicacao(k).filter(function (t0) { return t0.calc && t0.familia !== "reforco"; }).map(function (t0) { return opt(t0.id, t0.nome, c.tipologia[k] === t0.id); }).join("") + "</select></label>"; }).join("") + "</fieldset>" +
        '<p class="lsg-nota" data-lsg="cfg-erros"></p></div>';
      function ler(raiz) {
        function q(s) { return raiz.querySelector(s); }
        var o = { meio: q("[data-cfg=meio]").value, parafuso: { classe: q("[data-cfg=classe]").value, diametros: [] }, atrito: q("[data-cfg=atrito]").checked, classeAtrito: q("[data-cfg=classeAtrito]").value, eletrodo: q("[data-cfg=eletrodo]").value,
                  espacamentoFator: q("[data-cfg=espacamentoFator]").value, bordaAcrescimo: q("[data-cfg=bordaAcrescimo]").value, folgaMontagem: q("[data-cfg=folgaMontagem]").value, enrijRecorte: q("[data-cfg=enrijRecorte]").checked, tipologia: {} };
        Array.prototype.forEach.call(raiz.querySelectorAll("[data-cfg-d]"), function (b) { if (b.checked) o.parafuso.diametros.push(b.getAttribute("data-cfg-d")); });
        Array.prototype.forEach.call(raiz.querySelectorAll("[data-cfg-t]"), function (s) { if (s.value) o.tipologia[s.getAttribute("data-cfg-t")] = s.value; });
        return o;
      }
      var self = this;
      UI.modal("Configuração das ligações da obra", h, [
        { texto: "Salvar", classe: "primary", onClick: function () { var raiz = document.querySelector("[data-lsg='config']"), r = self.configuracao(ler(raiz)), box = raiz.querySelector("[data-lsg='cfg-erros']"); if (!r.salva) { box.textContent = "Não salvo: " + r.validacao.erros.join(" "); return; } UI.fecharModal(); toast("Configuração das ligações salva." + (r.validacao.avisos.length ? " " + r.validacao.avisos.join(" ") : ""), "ok", 8000); } },
        { texto: "Voltar ao padrão", classe: "ghost", onClick: function () { self.configuracao(null); UI.fecharModal(); toast("Configuração das ligações: de volta ao padrão.", "info", 5000); } },
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      return true;
    },
    /* DIMENSIONAR TODAS (F3b): os encontros da seleção (ou do modelo) com TODAS as combinações, agrupados em Tipos — não muda o modelo */
    tipos: function () {
      var S0 = S(), LL = global.AcoLigLote; if (!S0 || !LL) return null;
      var sel = selCaixas(), base = sel.length ? sel : todasCaixas().filter(function (c) { return c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && !c.metal.lig; });
      var pares = this.nos(base, todasCaixas()), rc = resultadoCalc(), itens = [];
      pares.forEach(function (pp) {
        var rot = pp.map(function (c) { return c.id; }).join(" × ");
        if (pp.pular) { itens.push({ no: rot, semOpcao: pp.pular }); return; }
        var ctx = S0.analisar(pp, { resultado: rc, fundacoes: fundacoes() });
        if (!ctx.ok) { itens.push({ no: rot, semOpcao: ctx.motivo }); return; }
        itens.push(LL.itemDaSugestao(arr(ctx.ordem).join(" × ") || rot, S0.sugerir(ctx, opObra({ execucao: U.execucao || null, materiais: opMat() }))));
      });
      var d = LL.dimensionarTodas(itens); U.tipos = d;
      if (global.UI) {
        css();
        UI.modal("Ligações — Tipos e combinação que governa", '<div class="lsg" data-lsg="tipos" data-modal-largo><p>' + itens.length + " encontro(s), " + d.tipos.length + " Tipo(s)" + (rc && rc.ok ? "" : " — SEM CÁLCULO DA ESTRUTURA: esforços estimados, tudo A CONFIRMAR") + ".</p>" + LL.quadroHtml(d.quadro) +
          '<p class="lsg-nota">Cada Tipo é dimensionado com as combinações de todos os seus nós (o arranjo cobre o pior nó). "PASSA (ENVOLTÓRIA)": a tipologia refaz o arranjo por combinação, e a combinação que governa não é determinada.</p></div>', [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      }
      return d;
    },
    podeAplicar: podeAplicar, _cartao: function (o, i) { return cartao(o, i || 0); }, provisoriasEntre: provisoriasEntre,
    /* VIGAS ENTRE PILARES (15/10/2026, js/metalvigaspilares.js): o mesmo aplicar do lote, para o lançamento automático */
    aplicarOpcao: aplicarOpcao,
    limparTabela: function () { return gravarTabela({}); },
    contexto: function () { return U.ctx; },
    aplicar: function (i, opA) {
      opA = opA || {};
      var sg = U.sg, ctx = U.ctx, o = sg && opDe(i), M = MU(); if (!o || !M) return null;
      if (!o.aplicar) { toast("Esta tipologia ainda não tem desenho automático no 3D.", "aviso", 7000); return null; }
      var pod = podeAplicar(o);
      if (!(pod.ok || (opA.prolongar && pod.prolongar))) { toast("Não aplicável: " + pod.motivo + ".", "aviso", 8000); return null; }
      var por = {}; todasCaixas().forEach(function (c) { por[String(c.id)] = c; });
      var a = aplicarOpcao(o, ctx, por, M.novoId.bind(M), { prolongar: !!opA.prolongar });
      if (!a.ok) { toast("Aplicar: " + a.motivo, "aviso", 8000); return a; }
      var prov = provisoriasEntre(todasCaixas(), ctx.ordem);
      prov.forEach(function (lg) { a.lote.ops.push({ op: "metalApagarLig", lig: lg }); });
      if (!M.enviar(a.lote)) { toast("O editor recusou a ligação.", "erro"); return { ok: false, motivo: "editor recusou" }; }
      U.ultimo = { lig: a.lig, tipologia: o.tipologia, n: a.n, substituiu: prov };
      try { UI.fecharModal(); } catch (e) {}
      var av = arr(a.r.avisos);
      status(o.nome + " aplicada: " + a.r.resumo + "." + (a.aviso ? " " + a.aviso : "") + (av.length ? " " + av.length + " aviso(s) de furação." : "") + " Ctrl+Z desfaz.");
      toast(o.nome + " aplicada (" + (o.passa ? "passa" : "NÃO passa") + ", " + br(num(o.resultado.razao, 0) * 100) + " %).", o.passa ? "ok" : "aviso", 7000);
      return a;
    },
    ultimo: function () { return U.ultimo; },

    /* ------------------------------------------------------------ catálogo */
    catalogo: function (ap) {
      var Tp = T(); if (!Tp || !global.UI) return false;
      css();
      var opts = '<option value="">Todas as aplicações</option>' + Object.keys(Tp.APLICACOES).map(function (k) { return '<option value="' + k + '"' + (k === ap ? " selected" : "") + ">" + esc(Tp.APLICACOES[k]) + "</option>"; }).join("");
      function lista(a) {
        return (a ? Tp.porAplicacao(a) : Tp.TIPOS).map(function (t) {
          return '<div class="lsg-op" data-lsg-cat="' + esc(t.id) + '"><h3>' + esc(t.nome) + '</h3><div class="lsg-chips"><span class="lsg-chip">' + esc(FAM[t.familia]) + '</span><span class="lsg-chip">' + esc(t.meio === "mista" ? "soldada + parafusada" : t.meio) + '</span><span class="lsg-chip' + (!t.calc ? ' nok' : '') + '">' + (!t.calc ? "não dimensionada" : t.geometria ? "desenho no 3D" : "só cálculo") + "</span></div>" +
            '<div class="lsg-svg">' + (Tp.svg(t.id) || "") + "</div><p>" + esc(t.dica) + "</p>" +
            "<details><summary>Verificações e limitações</summary><ul>" + Tp.verificacoesDe(t.id).map(function (v) { return "<li>" + esc(v.texto) + " — " + esc(v.norma) + ", " + esc(v.item) + "</li>"; }).join("") + "</ul><ul class=\"con\">" + t.limitacoes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
            (t.faces ? '<ul data-lsg="cat-faces">' + ["mesa", "alma"].map(function (f) { return "<li>" + esc(t.faces[f] || (f === "mesa" ? "Na MESA: não vale." : "Na ALMA: não vale.")) + "</li>"; }).join("") + "</ul>" : "") + "</details></div>";
        }).join("");
      }
      var h = '<div class="lsg" data-lsg="catalogo" data-modal-largo><div class="lsg-topo"><label>Aplicação <select data-lsg="cat-ap">' + opts + '</select></label><span class="lsg-nota" data-lsg="cat-n"></span></div><div class="lsg-cat" data-lsg="cat-lista">' + lista(ap) + '</div><p class="lsg-nota">' + esc(Tp.EDICAO.aviso) + " Os desenhos são esquemas didáticos, sem escala.</p></div>";
      UI.modal("Catálogo de ligações (" + Tp.TIPOS.length + " tipologias)", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var raiz = document.querySelector("[data-lsg='catalogo']"), sel = raiz && raiz.querySelector("[data-lsg='cat-ap']"), cont = raiz && raiz.querySelector("[data-lsg='cat-n']"), box = raiz && raiz.querySelector("[data-lsg='cat-lista']");
      function conta() { if (cont && box) cont.textContent = box.querySelectorAll("[data-lsg-cat]").length + " tipologia(s)"; }
      if (sel) sel.addEventListener("change", function () { box.innerHTML = lista(sel.value); conta(); });
      conta();
      return true;
    },

    /* ------------------------------------------------------------ memorial */
    ligacoesDoModelo: function (caixas) {
      var C = C2(); if (!C) return [];
      var out = [];
      arr(caixas || todasCaixas()).forEach(function (c) {
        var li = c && c.ligInfo; if (!li || !li.tipologia) return;
        var ent = clone(li.entrada) || {};
        /* VIGAS ENTRE PILARES (15/10/2026): a ligação lançada sem esforço da análise fica A DIMENSIONAR — nunca "atende" */
        var adz = li.aDimensionar ? "A DIMENSIONAR — " + li.aDimensionar : null;
        /* LIGAÇÃO AO LANÇAR (15/10/2026, js/metalligauto.js): pré-dimensionada só pelo peso próprio — A CONFIRMAR NO CÁLCULO, nunca "atende"
           (o dimensionamento com o esforço do PP passa quase sempre: é só a partida dos parafusos e da chapa) */
        var acf = li.aConfirmar ? String(li.aConfirmar) : null;
        if (acf) {
          var rA = li.entrada ? C.verificar(li.tipologia, clone(li.entrada) || {}) : null;
          rA = rA ? clone(rA) : { naoDimensionada: true, razao: 0, governante: "a confirmar no cálculo", resumo: li.resumo || "", verificacoes: [] };
          rA.ok = false; rA.aConfirmar = acf; rA.governante = "A CONFIRMAR NO CÁLCULO (pré-dimensionada pelo peso próprio)";
          out.push({ id: String((c.metal && c.metal.lig) || c.id), titulo: (li.nome || li.tipologia) + " — peças " + arr(li.pecas).join(" × ") + " — A CONFIRMAR NO CÁLCULO", resultado: rA, info: li, aConfirmar: acf });
          return;
        }
        if (adz && !li.entrada) { out.push({ id: String((c.metal && c.metal.lig) || c.id), titulo: (li.nome || li.tipologia) + " — peças " + arr(li.pecas).join(" × ") + " — A DIMENSIONAR", resultado: { ok: false, naoDimensionada: true, razao: 0, governante: "a dimensionar", resumo: li.aDimensionar, verificacoes: [] }, info: li, aDimensionar: adz }); return; }
        var r = C.verificar(li.tipologia, ent), LF0 = global.AcoLigFundacao;
        if (adz && r) { r = clone(r); r.ok = false; r.aDimensionar = adz; }
        if (li.fundacao && LF0 && r && r.dimensoes && r.dimensoes.chumbadores) r = LF0.verificar(r, li.fundacao, { suporte: ent.concreto && ent.concreto.suporte, esforcos: arr(ent.esforcos).map(function (s) { return { comb: s.comb, N: num(s.N, 0), Vx: num(s.Vx, num(s.V, 0)), Vz: num(s.Vz, 0), M: num(s.M, 0) }; }) });
        /* VÍNCULOS (js/bimvinculos.js): um membro mudou de lugar ou de comprimento depois de a ligação ser dimensionada */
        var dz = c.desatualizado && c.desatualizado.motivo ? "DESATUALIZADA — " + c.desatualizado.motivo + (c.desatualizado.em ? " em " + String(c.desatualizado.em).slice(0, 10) : "") + ": recalcule a estrutura e refaça a ligação" : null;
        out.push({ id: String((c.metal && c.metal.lig) || c.id), titulo: (li.nome || li.tipologia) + " — peças " + arr(li.pecas).join(" × ") + (dz ? " — DESATUALIZADA" : "") + (adz ? " — A DIMENSIONAR" : ""), resultado: r, info: li, desatualizada: dz, aDimensionar: adz });
      });
      return out;
    },
    /* SIMULAÇÃO S1: as ligações do modelo REFEITAS com os esforços do cálculo `r` (o último da Estrutura desenhada) —
       cada uma diz se o que está desenhado é o que esse cálculo dimensiona (confere) ou se precisa reaplicar */
    ligacoesComCalculo: function (r, caixas) {
      var S0 = S(), C = C2(); if (!S0 || !C) return [];
      var todas = arr(caixas || todasCaixas()), por = {}; todas.forEach(function (c) { por[String(c.id)] = c; });
      var antigas = this.ligacoesDoModelo(todas), out = [];
      antigas.forEach(function (l) {
        var li = l.info, cxs = arr(li.pecas).map(function (id) { return por[String(id)]; }).filter(Boolean), novo = null;
        if (cxs.length === arr(li.pecas).length && r && r.ok) {
          var ctx = S0.analisar(cxs, { resultado: r, fundacoes: fundacoes() });
          if (ctx.ok && !ctx.estimativa) {
            /* REVISÃO M1 (14/10/2026): a ligação JÁ DESENHADA é refeita pela tipologia dela, sem o filtro da execução
               escolhida depois (antes, "tudo parafusado" tirava a soldada da lista e ela voltava com os esforços guardados) */
            var sg = S0.sugerir(ctx, { materiais: opMat() }), o = arr(sg.todasOpcoes).filter(function (x) { return x.tipologia === li.tipologia; })[0];
            if (o) novo = { resultado: o.resultado, passa: o.passa, origem: ctx.origemEsforcos, no: ctx.no };
          }
        }
        var r0 = novo ? novo.resultado : l.resultado, confere = !!novo && String(r0.resumo || "") === String(li.resumo || "");
        /* LIGAÇÃO AO LANÇAR: a ligação A CONFIRMAR só deixa de ser "a confirmar" pelo js/metalligauto.js (aposCalculo), que confere o
           arranjo DESENHADO — aqui ela sai como está: não aprovada, com o resultado do cálculo como referência */
        if (l.aConfirmar) { r0 = clone(r0) || {}; r0.ok = false; r0.aConfirmar = l.aConfirmar; confere = false; }
        /* VÍNCULOS: refeita com o cálculo de agora, a comparação é a de agora; sem ele, a marca de desatualizada manda */
        var velha = !novo && l.desatualizada ? l.desatualizada : null;
        out.push({ id: l.id, titulo: l.titulo, resultado: r0, info: li, confere: confere && !velha, comCalculo: !!novo, aConfirmar: l.aConfirmar || null, origem: novo ? novo.origem : "esforços guardados na ligação (" + (li.em || "") + ")",
                   desatualizada: velha, diferenca: velha || (novo && !confere ? "desenhada: " + (li.resumo || "—") + " · com os esforços deste cálculo: " + (r0.resumo || "—") : null) });
      });
      return out;
    },
    memorialHtml: function (lista, titulo) {
      var S0 = S(), sec = S0 ? S0.secaoMemorial(lista) : null;
      return "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>" + esc(titulo || "Memorial das ligações") + "</title><style>body{font:11pt/1.45 system-ui,sans-serif;color:#1d2733;max-width:190mm;margin:12mm auto;padding:0 8mm}h1{font-size:16pt}h3{font-size:12pt;margin-top:8mm;border-bottom:1px solid #ccd5de}h4{font-size:10pt;margin:4mm 0 1mm}.eq{font-family:ui-monospace,monospace;color:#2d6a9c}.nota{color:#5b6774;font-size:9pt}li{margin-bottom:.6mm}</style></head><body><h1>" + esc(titulo || "Memorial das ligações") + "</h1>" +
        /* VÍNCULOS: a ligação cujo membro mudou NÃO sai como válida — o aviso vem antes de tudo */
        (arr(lista).some(function (l) { return l && l.desatualizada; }) ? '<div style="border:2px solid #b45309;background:#fff7ed;padding:3mm 4mm;margin:4mm 0"><b>DESATUALIZADO — recalcular.</b> ' + arr(lista).filter(function (l) { return l && l.desatualizada; }).map(function (l) { return esc(l.titulo.replace(/ — DESATUALIZADA$/, "") + ": " + l.desatualizada); }).join("<br>") + "</div>" : "") +
        /* LIGAÇÃO AO LANÇAR (15/10/2026, js/metalligauto.js): as A CONFIRMAR e o balanço com rótula (CRÍTICO) vêm antes de tudo */
        (arr(lista).some(function (l) { return l && l.aConfirmar; }) ? '<div style="border:2px solid #b45309;background:#fff7ed;padding:3mm 4mm;margin:4mm 0"><b>A CONFIRMAR NO CÁLCULO — ' + arr(lista).filter(function (l) { return l && l.aConfirmar; }).length + " ligação(ões) pré-dimensionada(s) só pelo peso próprio da viga.</b> Não estão aprovadas: calcule a estrutura (Cálculo › Estrutura desenhada) para confirmar ou ajustar com os esforços da análise.</div>" : "") +
        (function () { var LA = global.MetalLigAuto, cr = LA && LA.balancosCriticos ? LA.balancosCriticos(todasCaixas()) : []; return cr.length ? '<div style="border:2px solid #b91c1c;background:#fef2f2;padding:3mm 4mm;margin:4mm 0;color:#7f1d1d">' + cr.map(function (x) { return "<b>" + esc(x.texto) + "</b>"; }).join("<br>") + "</div>" : ""; })() +
        (sec ? sec.html : "<p>Nenhuma ligação aplicada pela ligação inteligente neste modelo.</p>" + (S0 && S0.escopoHtml ? S0.escopoHtml() : "")) + "</body></html>";
    },
    abrirHtml: function (html, nome) {
      if (global.UnidadesMemorial) html = UnidadesMemorial.preparar(html);   /* aba SI | Técnica (kgf / tf) */
      var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
      if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); toast("Memorial aberto em outra aba (Ctrl+P para PDF).", "ok", 6000); return true; }
      var M = MU(); if (M && M.baixar) { M.baixar((M.arqBase ? M.arqBase() : "obra") + "-" + nome + ".html", html, "text/html"); toast("Memorial baixado (.html).", "ok", 6000); return true; }
      return false;
    },
    memorialOpcao: function (i) {
      var o = opDe(i); if (!o) return null;
      var html = this.memorialHtml([{ id: o.tipologia, titulo: o.nome, resultado: o.resultado }], "Memorial — " + o.nome);
      this._ultimoMemorial = { n: 1, bytes: html.length };
      this.abrirHtml(html, "memorial-ligacao");
      return html;
    },
    memorial: function () {
      var lst = this.ligacoesDoModelo();
      if (!lst.length) { toast("Memorial das ligações: nenhuma ligação aplicada pela Ligação inteligente neste modelo.", "aviso", 7000); return null; }
      var html = this.memorialHtml(lst, "Memorial das ligações");
      this._ultimoMemorial = { n: lst.length, bytes: html.length };
      this.abrirHtml(html, "memorial-ligacoes");
      return html;
    },

    /* ------------------------------------------------------------ ligar todos os nós */
    /* `todas`: o modelo inteiro, de onde saem as ligações JÁ feitas (chapas soldadas e furos) — SIMULAÇÃO S1 (14/10/2026):
       o "Ligar todos os nós" passava só os perfis, as chapas da ligação já aplicada ficavam de fora e o joelho era
       ligado DE NOVO (três talas no mesmo nó) */
    nos: function (caixas, todas) {
      var M = global.BimMetal, S0 = S(); if (!M || !S0) return [];
      var mbs = [];
      arr(caixas).forEach(function (c) { var mb = M.membro(c); if (mb && !(c.metal && c.metal.lig)) mbs.push({ c: c, mb: mb, vert: Math.abs(mb.X[1]) >= Math.cos(15 * Math.PI / 180) }); });
      var V = M.vet, pares = [], vistos = {}, ligados = {};
      var provs = {}; arr(todas || caixas).forEach(function (c) { if (provisoria(c)) provs[String(c.metal.lig)] = 1; });
      arr(todas || caixas).forEach(function (c) { if (c && c.metal && c.metal.lig && provs[String(c.metal.lig)]) return; if (c && c.metal && c.metal.lig && c.metal.soldadaEm) (ligados[String(c.metal.lig)] = ligados[String(c.metal.lig)] || {})[String(c.metal.soldadaEm)] = 1; arr(c && c.metalFuros).forEach(function (f) { if (f.lig && !provs[String(f.lig)]) (ligados[String(f.lig)] = ligados[String(f.lig)] || {})[String(c.id)] = 1; });
        /* SIMULAÇÃO S2: as peças que a ligação escolhida liga (ligInfo) — a barra redonda não leva furo nem é soldada, e o lote a ligava de novo */
        if (c && c.metal && c.metal.lig && c.ligInfo) arr(c.ligInfo.pecas).forEach(function (id) { (ligados[String(c.metal.lig)] = ligados[String(c.metal.lig)] || {})[String(id)] = 1; }); });
      function jaLigados(a, b) { return Object.keys(ligados).some(function (k) { return ligados[k][a] && ligados[k][b]; }); }
      /* LIGAÇÃO AO LANÇAR / VIGAS ENTRE PILARES (15/10/2026): a viga com RECUO na receita tem o sólido parado na face do pilar +
         12,7 mm de folga — a ponta do sólido fica fora da seção do pilar e, no canto onde chegam duas vigas, o encontro virava
         viga × viga (e2e da simulação espacial). O encontro dessas vigas é pela ponta da LINHA (no eixo do pilar), como no cálculo */
      function pontasEncontro(A) {
        var P0 = A.mb.P0, P1 = V.add(A.mb.P0, V.mul(A.mb.X, A.mb.L)), MCr = global.MetalCriar, li = null;
        try { li = A.c.metal && A.c.metal.cria && A.c.metal.cria.recuo && MCr ? MCr.linhaAtual(A.c) : null; } catch (eL) { li = null; }
        if (!li || !li.a || !li.b) return [P0, P1];
        var aPerto = V.len(V.sub(li.a, P0)) <= V.len(V.sub(li.b, P0));
        return aPerto ? [li.a, li.b] : [li.b, li.a];
      }
      mbs.forEach(function (A) {
        if (A.vert) return;
        pontasEncontro(A).forEach(function (P) {
          var melhor = null, dm = Infinity, melhorP = null, dmP = Infinity, jaFeita = false;
          /* a PONTA já ligada (a peça recuada pela ligação fica até 60 cm fora do apoio: a mesma ponta não ganha outra) */
          mbs.forEach(function (B) {
            if (B === A || jaFeita) return;
            var d = V.sub(P, B.mb.P0), t = V.dot(d, B.mb.X), perp = V.len(V.sub(d, V.mul(B.mb.X, t)));
            if (t < -0.65 || t > B.mb.L + 0.65 || perp > Math.max(B.mb.s.alt, B.mb.s.larg) / 2 + A.mb.s.alt / 2 + 0.65) return;
            if (jaLigados(String(A.c.id), String(B.c.id))) jaFeita = true;
          });
          if (jaFeita) return;
          mbs.forEach(function (B) {
            if (B === A) return;
            var d = V.sub(P, B.mb.P0), t = V.dot(d, B.mb.X), perp = V.len(V.sub(d, V.mul(B.mb.X, t)));
            if (t < -0.05 || t > B.mb.L + 0.05 || Math.abs(V.dot(A.mb.X, B.mb.X)) > 0.996) return;
            if (perp < Math.max(B.mb.s.alt, B.mb.s.larg) / 2 + A.mb.s.alt / 2 + 0.05) {
              if (perp < dm) { dm = perp; melhor = B; }
              /* REVISÃO A3: o pilar só tem a preferência se a ponta está DENTRO da seção dele (a secundária que apoia na
                 principal a 20 cm do eixo do pilar é viga × viga — reprodução h15) */
              if (B.vert && perp <= Math.max(B.mb.s.alt, B.mb.s.larg) / 2 + 0.01 && perp < dmP) { dmP = perp; melhorP = B; }
            }
          });
          /* SIMULAÇÃO S2 (14/10/2026): ponta de viga no topo de um PILAR onde chega outra viga (canto do pórtico espacial):
             a ligação é com o pilar — antes o empate de distância escolhia a outra viga pela ordem das peças ("cumeeira") */
          if (melhorP) melhor = melhorP;
          if (!melhor) return;
          var k = A.c.id + "|" + melhor.c.id + "|" + (V.dot(V.sub(P, A.mb.P0), A.mb.X) < A.mb.L / 2 ? "i" : "f");
          if (vistos[k] || jaLigados(String(A.c.id), String(melhor.c.id))) return; vistos[k] = 1;
          pares.push([A.c, melhor.c]);
        });
      });
      /* REVISÃO C3: a ponta de PILAR (topo ou pé que não é base) dentro de uma peça CONTÍNUA (a viga passa por ela) ou na
         ponta de outro pilar colinear (emenda): também é encontro. Pilar × viga contínua não tem tipologia automática — vai
         para "puladas" com o motivo (e o memorial a lista sem ligação: a capa não diz "atendem") */
      mbs.forEach(function (A) {
        if (!A.vert) return;
        [A.mb.P0, V.add(A.mb.P0, V.mul(A.mb.X, A.mb.L))].forEach(function (P) {
          mbs.forEach(function (B) {
            if (B === A) return;
            var d = V.sub(P, B.mb.P0), t = V.dot(d, B.mb.X), perp = V.len(V.sub(d, V.mul(B.mb.X, t))), tolS = Math.max(B.mb.s.alt, B.mb.s.larg) / 2 + A.mb.s.alt / 2 + 0.05;
            if (perp > tolS) return;
            var dentro = t > 0.05 && t < B.mb.L - 0.05, colinear = B.vert && Math.abs(V.dot(A.mb.X, B.mb.X)) > 0.996 && (t < 0.05 || t > B.mb.L - 0.05);
            if (!(dentro && !B.vert) && !colinear) return;
            var k2 = [A.c.id, B.c.id].sort().join("|") + "|pilar";
            if (vistos[k2] || jaLigados(String(A.c.id), String(B.c.id))) return; vistos[k2] = 1;
            var par = [A.c, B.c]; if (dentro) par.pular = "pilar (" + A.c.id + ") com a ponta numa viga CONTÍNUA (" + B.c.id + "): a ligação é a CHAPA DE CABEÇA (viga contínua sobre o pilar): selecione o pilar e a viga e use a Ligação inteligente — o lote não a aplica sozinho; o memorial lista o encontro sem ligação";
            pares.push(par);
          });
        });
      });
      /* bases: a ponta de baixo do pilar sem nada embaixo */
      var minY = Infinity; mbs.forEach(function (m) { minY = Math.min(minY, m.mb.P0[1], m.mb.P0[1] + m.mb.X[1] * m.mb.L); });
      mbs.forEach(function (m) { if (m.vert && Math.min(m.mb.P0[1], m.mb.P0[1] + m.mb.X[1] * m.mb.L) < minY + 0.05 && !Object.keys(ligados).some(function (k) { return ligados[k][String(m.c.id)] && Object.keys(ligados[k]).length === 1; })) pares.push([m.c]); });
      return pares;
    },
    lote: function () {
      var S0 = S(), M = MU(); if (!S0 || !M) return null;
      var sel = selCaixas(), base = sel.length ? sel : todasCaixas().filter(function (c) { return c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && !c.metal.lig; });
      var pares = this.nos(base, todasCaixas());
      if (!pares.length) { toast("Ligar todos os nós: nenhum encontro sem ligação nas peças " + (sel.length ? "selecionadas" : "do modelo") + ".", "aviso", 7000); return null; }
      /* o estado LOCAL anda junto: a 2ª ligação da mesma viga vê a ponta já ajustada e os furos da 1ª (replay do BimEdit) */
      var E = global.BimEdit, baseOps = todasCaixas().map(function (c) { return { op: "criar", id: String(c.id), caixa: clone(c) }; });
      var res = { feitas: [], puladas: [], ajustes: [] }, ops = [], rc = resultadoCalc();
      function porAtual() {
        var lst = todasCaixas();
        if (ops.length && E && E.aplicar) { try { var st = E.aplicar(baseOps.concat([{ op: "lote", id: "lsg-tmp", origem: "metal-lig", ops: ops }])); if (st && st.caixas) lst = st.caixas; } catch (e) {} }
        var o = {}; lst.forEach(function (c) { o[String(c.id)] = c; }); return o;
      }
      pares.forEach(function (pp0) {
        if (pp0.pular) { res.puladas.push({ pecas: pp0.map(function (c) { return c.id; }), motivo: pp0.pular }); return; }
        var por = porAtual(), pp = pp0.map(function (c) { return por[String(c.id)] || c; });
        var ctx = S0.analisar(pp, { resultado: rc, fundacoes: fundacoes() }); if (!ctx.ok) { res.puladas.push({ pecas: pp.map(function (c) { return c.id; }), motivo: ctx.motivo }); return; }
        /* REVISÃO S5 N1: a escolha do lote é do motor (AcoLigSugere.escolherLote): nunca o químico nem reforço sozinho; na
           sapata do modelo, a placa verificada nela — e, se ela só reprova pela cota, aplicada com a proposta do ajuste */
        var sg = S0.sugerir(ctx, opObra({ execucao: U.execucao || null, materiais: opMat() })), esc = S0.escolherLote ? S0.escolherLote(sg) : { opcao: sg.opcoes.filter(function (x) { return x.passa && x.aplicar && !x.avisos.some(function (a) { return /INCOER/.test(a); }); })[0] || null }, o = esc.opcao;
        if (!o) { res.puladas.push({ pecas: ctx.ordem, motivo: esc.motivo || "nenhuma opção que passa com desenho automático" }); return; }
        var a = aplicarOpcao(o, ctx, por, M.novoId.bind(M));
        if (!a.ok) { res.puladas.push({ pecas: ctx.ordem, motivo: a.motivo }); return; }
        var provL = provisoriasEntre(Object.keys(por).map(function (k) { return por[k]; }), ctx.ordem);
        ops = ops.concat(a.lote.ops, provL.map(function (lg) { return { op: "metalApagarLig", lig: lg }; })); res.feitas.push({ pecas: ctx.ordem, tipologia: o.tipologia, resumo: a.r.resumo, pendente: esc.pendente || null, substituiu: provL.length ? provL : undefined });
        /* FRENTE S5 (14/10/2026): a base aplicada com o topo da sapata fora do graute (20–50 mm) traz a PROPOSTA do topo */
        var aj = (a.r && a.r.ajusteCota) || (o.resultado && o.resultado.ajusteCota);
        if (aj && !res.ajustes.some(function (x) { return x.fundacao === aj.fundacao; })) res.ajustes.push(aj);
      });
      if (ops.length && !M.enviar({ op: "lote", id: M.novoId(), origem: "metal-lig", ops: ops })) { toast("O editor recusou o lote.", "erro"); return null; }
      var msg = res.feitas.length + " ligação(ões) aplicada(s)" + (res.puladas.length ? "; " + res.puladas.length + " encontro(s) sem solução automática" : "") + ". Ctrl+Z desfaz.";
      status("Ligar todos os nós: " + msg); toast(msg, res.feitas.length ? "ok" : "aviso", 8000);
      if (res.ajustes.length && global.UI) {
        var self0 = this;
        UI.modal("Ligar todos os nós — ajuste de cota", '<div class="lsg" data-lsg="ajuste-cota"><p>' + esc(msg) + "</p>" + (res.puladas.length ? "<ul>" + res.puladas.map(function (p) { return "<li>" + esc(arr(p.pecas).join(" × ")) + ": " + esc(p.motivo) + "</li>"; }).join("") + "</ul>" : "") +
          "<p><b>" + res.ajustes.length + " fundação(ões) com o topo fora do graute do detalhe</b> (25 mm sob a placa; abaixo de 20 mm o graute não cabe e acima de 25 mm o chumbador perde ancoragem). O sistema propõe o topo em −(placa + 25 mm) abaixo do pé do pilar:</p><ul>" +
          res.ajustes.map(function (x) { return "<li>" + esc(x.texto) + "</li>"; }).join("") + '</ul><p class="lsg-nota">É ajuste de cota (o desenho da fundação), não da ligação. Um lote só — Ctrl+Z desfaz.</p></div>',
          [{ texto: "Ajustar o topo das fundações (" + res.ajustes.length + ")", classe: "primary", onClick: function () { UI.fecharModal(); self0.ajustarTopos(res.ajustes); } }, { texto: "Agora não", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      } else if (res.puladas.length && global.UI) {
        UI.modal("Ligar todos os nós", '<div class="lsg" data-lsg="lote"><p>' + esc(msg) + "</p><ul>" + res.puladas.map(function (p) { return "<li>" + esc(arr(p.pecas).join(" × ")) + ": " + esc(p.motivo) + "</li>"; }).join("") + "</ul><p class=\"lsg-nota\">Os que ficaram: selecione as peças e use a Ligação inteligente.</p></div>", [{ texto: "Ok", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      }
      this._ultimoLote = res;
      return res;
    },
    /* FRENTE S5 (14/10/2026): aplica as propostas de topo das fundações (op "fundacao" com o deslocamento novo) num lote */
    ajustarTopos: function (ajustes) {
      var M = MU(), L0 = arr(ajustes).filter(function (x) { return x && x.fundacao != null && isFinite(x.deslocTopoNovo); });
      if (!M || !L0.length) return false;
      var ok = M.enviar({ op: "lote", id: M.novoId(), origem: "metal-lig-cota", ops: L0.map(function (x) { return { op: "fundacao", id: String(x.fundacao), deslocTopo: x.deslocTopoNovo }; }) });
      toast(ok ? L0.length + " fundação(ões) com o topo ajustado (graute de 25 mm sob a placa). Ctrl+Z desfaz." : "O editor recusou o ajuste do topo das fundações.", ok ? "ok" : "erro", 7000);
      if (ok) { this._ultimosAjustes = L0; if (this._ultimoLote) this._ultimoLote.ajustes = []; }
      return ok;
    },
    ajustesCota: function () { return (this._ultimoLote && this._ultimoLote.ajustes) || []; }
  };
  global.MetalLigSugUI = MetalLigSugUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalLigSugUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
