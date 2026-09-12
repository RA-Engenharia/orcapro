/* =====================================================================
 * cronoexecui.js — A TELA do cronograma executivo (aba Cronograma do
 * orçamento). Desenho PURO: recebe dados prontos, devolve HTML. Não lê o
 * DOM, não grava, não chama rede — roda em Node (tools/test-cronoexecui.js).
 *
 * POR QUE ISTO É UM MÓDULO À PARTE (espec v2, Fase 2, 11/09/2026)
 * A aba Cronograma passou de uma tabela por etapa para quatro leituras do
 * mesmo cronograma (Cronograma · Físico-financeiro · Parâmetros, e o
 * Previsto × Realizado que chega com o planejamento da obra). Colocar isso
 * dentro do ui.js (3.000 linhas) deixaria o desenho sem teste: aqui ele é
 * função pura, e o ui.js só junta os dados (fiação fina). O que o ui.js
 * continua dono: o cartão de parâmetros de hoje (ids cron-*), o Gantt por
 * etapa (UI._gantt — proposta e PDF dependem dele) e a tabela físico-
 * financeira por etapa (a MESMA função da aba Relatórios).
 *
 * ⚠ AS REGRAS QUE ESTE DESENHO NÃO PODE QUEBRAR
 *  1) A linha de ETAPA da tabela preserva o `<tr>` puro, `data-cron-dur`,
 *     `data-cron-pred` e a célula "codigo nome"(+pílula de marco)`</td>`, e
 *     as 8 colunas NA ORDEM DE HOJE (Etapa · Categoria · Eq-dias · Duração ·
 *     Depende de · Folga · Início · Fim): tools/e2e-cronograma-gantt.js lê a
 *     coluna pela POSIÇÃO (tds[5] = Folga) e test-cronograma-render acha a
 *     linha por `lastIndexOf("<tr>")`. Linha filha usa `<tr class=…>`.
 *  2) Nenhum número de dinheiro vem de custo direto: a camada detalhada do
 *     físico-financeiro só distribui VALOR DE VENDA (Orcamento.valoresEAP);
 *     sem ele, recado — nunca o custo no lugar (margem do escritório virando
 *     curva do cliente).
 *  3) Estado de tela (sub-aba, detalhe, etapas recolhidas) NUNCA vai para o
 *     orçamento: mora em App._cronoSub/_cronoDet/_cronoAbertas/_cronoFF.
 *     Gravar no orçamento a cada clique de visualização mudaria o
 *     `atualizadoEm`, sincronizaria à toa e esbarraria na trava do aprovado.
 *  4) Gantt é PAPEL BRANCO (fundo #fff cravado, como ui.js _gantt): as cores
 *     das categorias foram calibradas para fundo claro, e token de tema
 *     trocaria a tinta do texto para a do tema escuro sobre o papel branco.
 * ===================================================================== */
(function (global) {
  "use strict";

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function ehArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function arr(v) { return ehArr(v) ? v : []; }
  function G(nome) { return (typeof global[nome] !== "undefined") ? global[nome] : null; }
  function C() { return (typeof Cronograma !== "undefined") ? Cronograma : G("Cronograma"); }
  function Ut() { return (typeof Util !== "undefined") ? Util : G("Util"); }
  function esc(s) {
    var u = Ut();
    if (u && u.esc) return u.esc(s);
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function moeda(v) {
    var u = Ut();
    if (u && u.fmtMoeda) return u.fmtMoeda(v);
    return "R$ " + (Math.round((v || 0) * 100) / 100).toFixed(2).replace(".", ",");
  }
  function pct(v, casas) {
    var u = Ut();
    if (u && u.fmtPct) return u.fmtPct(v, casas == null ? 1 : casas);
    return (Math.round((v || 0) * 10) / 10).toFixed(casas == null ? 1 : casas).replace(".", ",") + "%";
  }
  function ic(nome) { var I = (typeof Icones !== "undefined") ? Icones : G("Icones"); try { return I && I.get ? I.get(nome, 15) : ""; } catch (e) { return ""; } }
  function dd(n) { return ("0" + n).slice(-2); }
  function ehData(d) { return !!d && typeof d.getTime === "function" && !isNaN(d.getTime()); }
  function dma(d) { return ehData(d) ? dd(d.getDate()) + "/" + dd(d.getMonth() + 1) + "/" + d.getFullYear() : "—"; }
  /* dd/mm com o ano no CABEÇALHO (espec 2.3). Obra que atravessa o ano ganha
     o ano curto em cada data: "05/01" sozinho seria de qual dos dois anos? */
  function dm(d, multiAno) { return ehData(d) ? dd(d.getDate()) + "/" + dd(d.getMonth() + 1) + (multiAno ? "/" + String(d.getFullYear()).slice(2) : "") : "—"; }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  // número de TELA (vírgula decimal): "769.9" na coluna Eq-dias se lia como milhar
  function nBR(x, casas) {
    var u = Ut(), v = Number(x) || 0;
    if (u && u.fmtNum) return u.fmtNum(v, casas);
    return (Math.round(v * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas).replace(".", ",");
  }
  /* código da etapa que JÁ É o nº da linha ("1", "01", "1.0"): mostrar os dois
     dava "1 1.0 Serviços preliminares" (6 de 6 orçamentos do backup usam N.0) */
  function codNum(c) { var m = /^0*(\d+)(?:\.0+)?$/.exec(String(c == null ? "" : c).trim()); return m ? String(parseInt(m[1], 10)) : null; }
  function corta(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  /* data "AAAA-MM-DD" (como o CronoPlan grava) → texto, SEM passar por Date:
     `new Date("2026-05-04")` é meia-noite UTC e, no Brasil, vira o dia 03.
     Carimbo ISO com hora ("…T12:00:00Z") é instante: esse vai pelo Date local. */
  function dmaS(s) {
    s = String(s == null ? "" : s);
    if (/T\d/.test(s)) { var d = new Date(s); if (ehData(d)) return dma(d); }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "—";
  }
  function dmS(s, multi) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? "" : s));
    return m ? m[3] + "/" + m[2] + (multi ? "/" + m[1].slice(2) : "") : "—";
  }
  /* percentual de TELA; null (não se sabe) sai "—", nunca "0%" — "não sei" e
     "zero" são respostas diferentes para quem pergunta quanto andou */
  function pctOu(v, casas) { var x = Number(v); return (v == null || v === "" || !isFinite(x)) ? "—" : pct(x, casas == null ? 1 : casas); }
  function ppTxt(v) { var x = Number(v); if (v == null || !isFinite(x)) return "—"; return (x > 0 ? "+" : (x < 0 ? "−" : "")) + nBR(Math.abs(x), 1) + " p.p."; }
  // desvio de término em dias úteis (+ = atraso), contra a linha de base
  function termTxt(d) {
    var x = Number(d);
    if (d == null || !isFinite(x)) return "";
    if (x === 0) return "término no dia da linha de base";
    return "término " + Math.abs(x) + " dia(s) útil(eis) " + (x > 0 ? "depois" : "antes") + " da linha de base";
  }
  function sitHtml(s) {
    if (!s) return '<span class="muted">—</span>';
    var x = own(SIT, s) ? SIT[s] : [s, "#64748b"];
    return '<span class="cx-sit" style="background:' + x[1] + '1a;color:' + x[1] + '">' + esc(x[0]) + '</span>';
  }
  /* previsto / real / desvio numa célula, com a mini-barra (barra = real;
     traço = previsto na data) */
  function celPR(n) {
    var pv = n.previstoPct, rl = n.realPct, d = n.desvioPP;
    if (pv == null && rl == null) return '<span class="muted">—</span>';
    function cl(v) { var x = Number(v); return isFinite(x) ? Math.max(0, Math.min(100, x)) : 0; }
    var cor = d == null ? "" : (d < 0 ? "color:#b91c1c" : "color:#15803d");
    return '<span>previsto ' + pctOu(pv) + ' · real ' + pctOu(rl) + (d != null ? ' · <b style="' + cor + '">' + esc(ppTxt(d)) + '</b>' : '') + '</span>' +
      '<div class="cx-mb" title="barra = executado; traço = previsto na data">' + (rl != null ? '<i style="width:' + f1(cl(rl)) + '%"></i>' : '') + (pv != null ? '<em style="left:' + f1(cl(pv)) + '%"></em>' : '') + '</div>';
  }
  /* número digitado pela pessoa: "5", "5,5", "1.500" (milhar BR com vírgula
     decimal). Texto que não é número vira NaN — e NaN nunca é gravado. */
  function numTxt(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return NaN;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    return /^[+\-]?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  var DETALHES = ["etapa", "subetapa", "servico"];
  var CAMADAS = ["etapa", "folha", "servico"];   // camadas do físico-financeiro (Cronograma.periodos)
  var DET_ROT = { etapa: "Etapa", subetapa: "Subetapa", servico: "Serviço" };
  /* "real" (Previsto × Realizado) chegou com o planejamento da obra (Fase 3).
     ⚠ Ela só aparece com a Gestão de Obras (plano Plus): sem Gestão não há
     obra, nem diário, nem medição — a sub-aba seria porta que não leva a lugar
     nenhum (memória "porta prometida precisa existir"), e a faixa já diz a
     linha honesta. Quem esconde é o `render` (est.semReal), não o FASE. */
  var SUBS = [
    { id: "cronograma", nome: "Cronograma" },
    { id: "fisico", nome: "Físico-financeiro" },
    { id: "real", nome: "Previsto × Realizado", fase: 3 },
    { id: "parametros", nome: "Parâmetros" }
  ];
  var FASE = 3;
  /* estados do painel (CronoPlan.montarPainel) que vêm COM números; os
     outros são erro com a frase do motor */
  var PR_OK = { ok: 1, "sem-diarios": 1, "sem-inicio": 1 };
  /* situação do nó → [rótulo de gente, cor]. O que não está aqui (sem valor
     orçado, opcional fora, fora da linha de base…) sai com o próprio texto */
  var SIT = {
    "concluida": ["concluída", "#15803d"], "adiantada": ["adiantada", "#0d6ebd"], "no prazo": ["no prazo", "#15803d"],
    "atrasada": ["atrasada", "#b91c1c"], "nao iniciada": ["não iniciada", "#64748b"], "atrasada (não iniciada)": ["atrasada (não iniciada)", "#b91c1c"]
  };
  /* fonte da duração → [marca curta, explicação]. I7: a tela diz o que é
     heurística de categoria e o que é custo de MO ÷ R$/dia-equipe. */
  var FONTES = {
    usuario: ["✎", "Duração digitada por você"],
    ia: ["IA", "Duração sugerida pela IA"],
    exec: ["Hh", "Duração do Hh SINAPI (aba Execução → Enviar ao cronograma)"],
    subetapas: ["∑", "Duração = vão das subetapas (modo executivo)"],
    estimado: ["≈", "Estimada pelo agente: equipe-dias ÷ equipes"],
    semBase: ["—", "Sem serviço com quantidade: 1 dia"],
    categoria: ["≈", "Produtividade da categoria (heurística do agente)"],
    custoMO: ["R$", "Custo de mão de obra ÷ R$/dia-equipe informado por você"],
    custoEstimado: ["R$", "Sem categoria nem MO: 35% do custo como mão de obra ÷ R$/dia-equipe (estimativa)"]
  };
  var CRIT = "#b91c1c", CINZA = "#94a3b8", HOJE = "#b45309", RESUMO = "#1e293b", INTERNA = "#64748b";

  var CSS =
    ".cx-barra{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}" +
    ".cx-subs,.cx-acoes{display:flex;gap:6px;flex-wrap:wrap;align-items:center}" +
    ".cx-sub{border:1px solid var(--linha,#c9d6e4);background:transparent;color:inherit;border-radius:8px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}" +
    ".cx-sub.on{background:var(--aco,#0d6ebd);border-color:var(--aco,#0d6ebd);color:#fff;font-weight:600}" +
    ".cx-faixa{font-size:12px;margin:0 0 6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
    ".cx-chip{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--linha,#c9d6e4);border-radius:99px;padding:2px 4px 2px 10px}" +
    ".cx-seg{display:inline-flex;border:1px solid var(--linha,#c9d6e4);border-radius:8px;overflow:hidden;vertical-align:middle}" +
    ".cx-seg button{border:0;background:transparent;padding:4px 10px;font:inherit;font-size:12.5px;cursor:pointer;color:inherit}" +
    ".cx-seg button.on{background:var(--aco,#0d6ebd);color:#fff;font-weight:600}" +
    ".cx-toggle{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--linha,#c9d6e4);background:transparent;color:inherit;border-radius:99px;padding:3px 12px 3px 4px;font:inherit;font-size:12.5px;cursor:pointer}" +
    ".cx-toggle .cx-knob{width:28px;height:16px;border-radius:99px;background:var(--linha,#c9d6e4);position:relative;flex:none}" +
    ".cx-toggle .cx-knob:after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff}" +
    ".cx-toggle.on{border-color:var(--aco,#0d6ebd)}" +
    ".cx-toggle.on .cx-knob{background:var(--aco,#0d6ebd)}" +
    ".cx-toggle.on .cx-knob:after{left:14px}" +
    ".cx-gantt{overflow-x:auto;max-width:100%}" +
    ".cx-aviso{font-size:12px;margin:6px 0;padding:6px 10px;border-radius:8px;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35)}" +
    ".cx-tabela{overflow:auto;max-width:100%}" +
    "table.tbl.cx-eap th,table.tbl.cx-eap td,table.tbl.cx-ff th,table.tbl.cx-ff td{padding:6px 8px;white-space:nowrap}" +
    "table.tbl.cx-eap td.cx-nome{width:100%;min-width:300px;white-space:normal}" +
    "table.tbl.cx-eap tr.cx-f td{font-size:12.5px}" +
    "table.tbl.cx-eap tr.cx-s td{font-size:12px;color:var(--texto-fraco,#64748b)}" +
    "table.tbl.cx-ff tr.cx-grupo td{font-weight:600;background:var(--surface-2,#eef2f7)}" +
    ".cx-n{color:var(--texto-fraco,#64748b);font-variant-numeric:tabular-nums;margin-right:4px}" +
    ".cx-chev{border:0;background:transparent;cursor:pointer;color:inherit;font:inherit;font-size:12px;width:20px;padding:0;margin-right:2px}" +
    /* ⚠ a porta "Detalhar em subetapas" é um RÓTULO, não um "+" solto na
       coluna do chevron: ali ela parecia "expandir" e o clique saía da aba */
    ".cx-detsub{border:1px dashed var(--aco,#0d6ebd);background:transparent;color:var(--aco,#0d6ebd);border-radius:99px;font:inherit;font-size:10.5px;line-height:16px;padding:0 7px;margin-right:6px;cursor:pointer;white-space:nowrap}" +
    /* ⚠ campo editável da subetapa com borda EM REPOUSO: com a borda
       transparente do .cell ele parecia texto, igual à etapa só leitura — e
       editar a folha é o que o modo executivo existe para fazer */
    "table.tbl.cx-eap tr.cx-f input.cell{border-color:var(--linha-forte,#b9c7d6);background:var(--surface,#fff)}" +
    "table.tbl.cx-eap input.cell[readonly]{border-color:transparent;background:var(--surface-2,#eef2f7);cursor:not-allowed}" +
    /* coluna do nome FIXA ao rolar os meses (obra de 13 meses não cabe a 1366) */
    "table.tbl.cx-ff th:first-child,table.tbl.cx-ff td:first-child{position:sticky;left:0;z-index:1;background:var(--surface,#fff)}" +
    "table.tbl.cx-ff tr.cx-grupo td:first-child{background:var(--surface-2,#eef2f7)}" +
    ".cx-barra .cx-faixa{margin:0;flex:1 1 260px;min-width:0}" +
    /* ⚠ A FAIXA DA OBRA EM UMA LINHA a 1366 (revisão 3 da Fase 3, lentes UX e
       navegador). O chip com os números era espremido numa coluna de 302 px e
       virava uma oval de 8 linhas: a faixa ia a 225–243 px, a 1ª barra do
       Gantt caía em y 791–886 de 768 (o critério de aceite da Fase 2) e, na
       revisão, [Passar a obra] saía cortado e por baixo de [Imprimir / PDF].
       Agora: o texto do chip é UMA linha que encolhe com reticências (o texto
       inteiro vai no title) — `width:0` + `flex:1` faz o texto não impor
       largura, só ocupar a que sobra; botão não encolhe nem quebra; o aviso
       "editando o PLANO" tem linha própria dentro da faixa (1 linha); e abaixo
       de 1600 px as duas ações ficam só com o ícone. */
    ".cx-faixa{row-gap:4px}" +
    ".cx-faixa .btn{flex:0 0 auto;white-space:nowrap}" +
    ".cx-chip{flex:1 1 auto;min-width:0;max-width:100%}" +
    ".cx-chip-txt{flex:1 1 auto;width:0;min-width:4em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".cx-modo{flex:1 1 100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".cx-faixa-nota{flex:1 1 auto;width:0;min-width:4em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "@media (max-width:1599px){.cx-acoes .cx-rot{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}}" +
    /* cartão compacto: campos mais baixos só com mouse (acima de 820 px) — o
       alvo de 44 px do toque (app.css) continua valendo no celular. Medido a
       1366×768: a 1ª barra do Gantt passava 3 px da dobra com os campos de 38 px. */
    "@media (min-width:821px){.cx .card.cx-cartao .field input:not([type=checkbox]),.cx .card.cx-cartao .field select{padding:5px 8px}}" +
    ".cx-fonte{display:inline-block;min-width:14px;font-size:10.5px;font-weight:700;color:var(--aco,#0d6ebd);cursor:help;margin-left:3px}" +
    ".cx-card{margin-bottom:12px}" +
    ".cx-card h4{margin:0 0 8px;font-size:14px}" +
    ".cx-lista{margin:4px 0 0;padding-left:18px;font-size:12.5px;line-height:1.6}" +
    /* ⚠ a faixa "editando o PLANO DE EXECUÇÃO" tem de se ver: editar o plano
       achando que é a proposta (ou o contrário) é o erro que ela impede */
    ".cx-modo{background:rgba(13,110,189,.10);border:1px solid rgba(13,110,189,.40);border-radius:8px;padding:2px 8px}" +
    ".cx-chipnum{font-variant-numeric:tabular-nums}";

  /* CSS do painel previsto × realizado — emitido pelo próprio painelPR, porque
     a ficha da obra (outra tela, sem o <style> da aba) também o desenha */
  var CSS_PR =
    ".cx-pr{font-size:13px}" +
    /* ⚠ o nº EAP antes do nome precisa do espaço AQUI também: a ficha da obra
       não tem o <style> da aba, e na foto saía "2.gServiços" e "3Piscina" */
    ".cx-pr .cx-n{color:var(--texto-fraco,#64748b);font-variant-numeric:tabular-nums;margin-right:5px}" +
    ".cx-pr-cab{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin:0 0 8px;font-size:12.5px}" +
    ".cx-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 10px}" +
    ".cx-pr-comp .cx-kpis{grid-template-columns:repeat(auto-fit,minmax(118px,1fr))}" +
    ".cx-kpi{border:1px solid var(--linha,#c9d6e4);border-radius:10px;padding:8px 10px;background:var(--surface,#fff);min-width:0}" +
    ".cx-kpi-rot{font-size:11px;color:var(--texto-fraco,#64748b);line-height:1.3}" +
    ".cx-kpi-v{font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}" +
    ".cx-kpi-sub{font-size:11px;color:var(--texto-fraco,#64748b);margin-top:2px;line-height:1.3}" +
    ".cx-pr-acoes{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 4px}" +
    ".cx-pr-sec{margin:14px 0 6px;font-size:13px}" +
    ".cx-curva{display:block;width:100%;height:auto;background:#fff;border:1px solid var(--linha,#e2e8f0);border-radius:8px}" +
    ".cx-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;margin-top:4px;color:var(--texto-fraco,#64748b)}" +
    /* ⚠ ROLAGEM DENTRO DO PRÓPRIO CONTÊINER (revisão 3, lente UX): o
       `.cx-tabela{overflow:auto}` morava só no CSS da ABA do orçamento; no
       módulo "Cronograma da obra" e na ficha — que só recebem este CSS_PR — a
       tabela (1192 px) e o Gantt (1448 px) empurravam o #main para o lado a
       1366 (scrollLeft 328, a coluna Nº sumia ao rolar). */
    ".cx-pr .cx-tabela,.cx-pr .cx-gantt{overflow-x:auto;max-width:100%}" +
    "table.tbl.cx-pr-tab th,table.tbl.cx-pr-tab td{padding:5px 8px;white-space:nowrap;vertical-align:top}" +
    "table.tbl.cx-pr-tab td.cx-nome{white-space:normal;min-width:220px;width:100%}" +
    "table.tbl.cx-pr-tab tr.cx-pr-et td{font-weight:600}" +
    ".cx-mb{position:relative;height:6px;border-radius:3px;background:var(--surface-2,#eef2f7);margin-top:3px;min-width:120px}" +
    ".cx-mb i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:#0d6ebd}" +
    ".cx-mb em{position:absolute;top:-2px;bottom:-2px;width:2px;margin-left:-1px;background:#0f172a}" +
    ".cx-sit{display:inline-block;border-radius:99px;padding:1px 8px;font-size:11.5px;font-weight:600}";

  function normDet(d) { return DETALHES.indexOf(d) > -1 ? d : "subetapa"; }
  function subVisivel(id) { for (var i = 0; i < SUBS.length; i++) if (SUBS[i].id === id) return !(SUBS[i].fase && SUBS[i].fase > FASE); return false; }

  /* resultado com Date NOVOS: o memo entrega o mesmo cálculo a mais de um
     leitor no mesmo render, e um `setDate` num deles (addDiasUteis muda a
     própria data de trabalho) moveria a data do outro calado. */
  function cpNo(n) {
    var c = {}, k, v;
    for (k in n) if (own(n, k)) { v = n[k]; c[k] = ehData(v) ? new Date(v.getTime()) : v; }
    return c;
  }
  function copiaR(r) {
    if (!r) return r;
    var c = cpNo(r);
    c.etapas = arr(r.etapas).map(cpNo);
    if (ehArr(r.atividades)) c.atividades = r.atividades.map(cpNo);
    return c;
  }
  var _memo = { chave: null, v: null };

  var CronoExecUI = {
    DETALHES: DETALHES,
    SUBS: SUBS,
    FASE: FASE,
    CSS: CSS,

    /* ------------------------------------------------------------------
       DADOS — o cálculo que a aba precisa, UMA vez por render.
       ⚠ DESEMPENHO: estimar com a árvore EAP + Orcamento.calcular +
       Orcamento.valoresEAP custam dezenas de ms num orçamento grande, e a
       aba chamava o motor várias vezes por render. `opts.tok` é o contador
       de App.render: dentro do mesmo render o cálculo é reaproveitado; no
       render seguinte (algo mudou) é refeito. Sem token, sem memo.
       Nenhuma DATA depende do ctx (I4): `r.etapas` é o de `estimar(orc)`.
       ------------------------------------------------------------------ */
    preparar: function (orc, opts) {
      opts = opts || {};
      // ⚠ o id do orçamento na chave: dois orçamentos no mesmo render não podem receber o mesmo cronograma
      var chave = (opts.tok != null && orc) ? String(opts.tok) + "|" + orc.id : null;
      /* ⚠ o PLANO DE EXECUÇÃO da obra (CronoBase.orcComPlano) tem o MESMO id do
         orçamento: sem a marca na chave, a proposta e o plano desenhados no
         mesmo render receberiam um o cronograma do outro */
      if (chave && orc._planoDaObra) chave += "|plano:" + orc._planoDaObra;
      if (chave && _memo.chave === chave) return this._copiaDados(_memo.v);
      var v = this._calcular(orc);
      if (!chave) return v;
      /* ⚠ cópia só no ACERTO do memo: copiar no 1º acesso custava ~5 ms por
         render (+32%) para um memo que hoje não tem segundo leitor (medido na
         revisão da Fase 2). O 1º leitor recebe o ORIGINAL — ⚠ não mutar as
         datas do resultado (o desenho só lê); os leitores seguintes do mesmo
         render recebem cópias com Date novos. */
      _memo.chave = chave; _memo.v = v;
      return v;
    },
    _copiaDados: function (v) { return { r: copiaR(v.r), valores: v.valores, ms: v.ms, memo: true }; },
    _calcular: function (orc) {
      var Cr = C(), O = (typeof Orcamento !== "undefined") ? Orcamento : G("Orcamento");
      var t0 = Date.now(), calc = null, valores = null;
      try { if (O && O.calcular) calc = O.calcular(orc); } catch (e) { calc = null; }
      try { if (O && O.valoresEAP) valores = O.valoresEAP(orc); }
      catch (e2) { valores = { ok: false, motivo: "não consegui calcular o valor de venda por subetapa (" + String((e2 && e2.message) || e2) + ")" }; }
      var ctx = { eap: true };
      if (calc) ctx.calc = calc;
      /* ⚠ valores com ok:false NÃO vão ao motor: ele poria o aviso "a coluna
         de valor fica em branco" em toda aba, e a tabela nem tem coluna de
         valor — o motivo aparece onde o valor é usado (Físico-financeiro). */
      if (valores && valores.ok === true) ctx.valores = valores;
      var r = Cr.estimar(orc, null, ctx);
      return { r: r, valores: valores, ms: Date.now() - t0 };
    },

    /* estado de TELA (nunca do orçamento) lido do App; tudo com padrão */
    estado: function (app, orc) {
      var id = orc && orc.id, ex = (orc && orc.cronograma && orc.cronograma.exec) || {};
      function de(m) { return (app && app[m] && typeof app[m] === "object" && own(app[m], id)) ? app[m][id] : null; }
      var sub = de("_cronoSub"); if (!subVisivel(sub)) sub = "cronograma";
      var det = de("_cronoDet");
      if (DETALHES.indexOf(det) < 0) det = DETALHES.indexOf(ex.detalhe) > -1 ? ex.detalhe : "subetapa";
      var ab = de("_cronoAbertas"); if (!ab || typeof ab !== "object" || ehArr(ab)) ab = {};
      var ff = de("_cronoFF") || {};
      /* ⚠ a camada do físico-financeiro é "etapa" | "folha" | "servico" (o
         nome do Cronograma.periodos), NÃO a lista de detalhes: validada contra
         DETALHES, "folha" virava "etapa" e o botão Subetapa não fazia nada
         (achado pela suíte, 11/09/2026) */
      return { sub: sub, detalhe: det, abertas: ab,
        ff: { camada: CAMADAS.indexOf(ff.camada) > -1 ? ff.camada : "etapa", modo: ff.modo === "pct" ? "pct" : "valor" } };
    },

    /* ------------------------------------------------------------------
       OBRA do orçamento — pela CADEIA `revisaoDe` (espec 3.2): a obra pode
       estar ligada a este orçamento ou a qualquer revisão anterior dele.
       ⚠ Sem a cadeia, a revisão -R1 de um orçamento com obra aparecia "sem
       obra" — e a porta natural seria criar outra obra, com a medição em
       dobro (o avanço anterior é por obra). `podeVer(obra)` filtra o que o
       usuário não pode ver (RBAC por módulo e por obra): o nome não aparece.
       ------------------------------------------------------------------ */
    obraDaCadeia: function (orc, orcamentos, obras, podeVer) {
      var porId = {}, ids = {}, cadeia = [], vistos = {}, cur = orc, n = 0;
      arr(orcamentos).forEach(function (o) { if (o && o.id) porId[o.id] = o; });
      while (cur && cur.id && !own(vistos, cur.id) && n++ < 60) {
        vistos[cur.id] = true; ids[cur.id] = cadeia.length; cadeia.push(cur);
        var pai = cur.revisaoDe;
        if (!pai) break;
        /* ancestral apagado da lista: o id dele ainda casa a obra */
        if (!own(porId, pai)) { if (!own(ids, pai)) ids[pai] = cadeia.length; break; }
        cur = porId[pai];
      }
      /* ⚠ A FAMÍLIA INTEIRA DE REVISÕES, não só a subida (revisão 3 da Fase 3,
         lente dinheiro). Com a obra passada para a R1 — que é exatamente o que
         [Passar a obra para esta revisão] produz —, abrir a R0 subia a cadeia
         a partir da R0, não achava obra e oferecia [Criar obra]: a segunda obra
         nascia com o acumulado anterior ZERADO nos itens que a primeira já
         mediu (Gestao._pctAnterioresPorItem é por obra), medição em dobro.
         O mesmo com revisões irmãs (R1 e R2 da mesma R0). Então: toda obra
         ligada a QUALQUER revisão da família (descendentes dos ancestrais,
         o próprio orçamento incluído) conta — só não vira alvo de edição (ela
         planeja e mede pelo orçamento ligado a ela). */
      var filhos = {}, familia = {}, fila = [], desc = {}, g = 0, k;
      arr(orcamentos).forEach(function (o) { if (o && o.id && o.revisaoDe) (filhos[o.revisaoDe] = filhos[o.revisaoDe] || []).push(o.id); });
      for (k in ids) if (own(ids, k)) { familia[k] = true; fila.push(k); }
      while (fila.length && g++ < 5000) {
        var pk = fila.shift();
        arr(filhos[pk]).forEach(function (fid) { if (!own(familia, fid)) { familia[fid] = true; fila.push(fid); } });
      }
      // as MAIS NOVAS (descendentes deste orçamento): o recado diz "revisão mais nova"
      if (orc && orc.id) { fila = [orc.id]; g = 0; while (fila.length && g++ < 5000) { var dk = fila.shift(); arr(filhos[dk]).forEach(function (fid) { if (!own(desc, fid)) { desc[fid] = true; fila.push(fid); } }); } }
      var achadas = [], ocultas = 0, outras = [], ocultasOutras = 0;
      arr(obras).forEach(function (ob) {
        if (!ob || !ob.orcamentoId) return;
        if (own(ids, ob.orcamentoId)) {
          if (podeVer && !podeVer(ob)) { ocultas++; return; }
          var nv = ids[ob.orcamentoId];
          achadas.push({ obra: ob, nivel: nv, orcNumero: cadeia[nv] ? (cadeia[nv].numero || "") : "" });
          return;
        }
        if (!own(familia, ob.orcamentoId)) return;
        if (podeVer && !podeVer(ob)) { ocultasOutras++; return; }
        var oo = porId[ob.orcamentoId];
        outras.push({ obra: ob, orcId: String(ob.orcamentoId), orcNumero: oo ? (oo.numero || "") : "", maisNova: own(desc, ob.orcamentoId) });
      });
      achadas.sort(function (a, b) { return a.nivel - b.nivel; });
      return { obras: achadas, ocultas: ocultas, cadeia: cadeia.length, cadeiaIds: Object.keys(ids),
        outras: outras, ocultasOutras: ocultasOutras };
    },
    /* os ids do orçamento e dos ancestrais dele (a cadeia `revisaoDe`), para
       saber se um plano/linha de base "é deste orçamento" — as revisões
       conservam os ids das etapas; um orçamento de fora da cadeia, não */
    cadeiaIds: function (orc, orcamentos) { return this.obraDaCadeia(orc, orcamentos, [], null).cadeiaIds; },

    /* ------------------------------------------------------------------
       LINHAS VISÍVEIS — o que o Gantt e a tabela mostram, pelo TIPO do nó
       (nunca pela profundidade: serviço solto de etapa sem subetapa fica na
       mesma profundidade de uma subetapa, e filtrar por nível punha 40
       serviços no Gantt de todo orçamento sem subetapa).
         etapa    → etapas
         subetapa → etapas + subetapas/"serviços gerais" (folhas)
         servico  → tudo
       `abertas[etapaId] === false` recolhe a etapa (estado de tela).
       ------------------------------------------------------------------ */
    linhas: function (r, opts) {
      opts = opts || {};
      var det = normDet(opts.detalhe), ab = opts.abertas || {}, out = [], nos = arr(r && r.atividades);
      if (!nos.length || det === "etapa") {
        arr(r && r.etapas).forEach(function (e, i) { out.push({ tipo: "etapa", i: i, et: e, no: null }); });
        return out;
      }
      var aberta = true;
      nos.forEach(function (n) {
        if (n.tipo === "etapa") { aberta = ab[n.id] !== false; out.push({ tipo: "etapa", i: n.etapaIdx, et: r.etapas[n.etapaIdx], no: n }); return; }
        if (!aberta) return;
        if (n.tipo === "subetapa" || n.tipo === "soltos") { out.push({ tipo: "folha", no: n }); return; }
        if (n.tipo === "servico" && det === "servico") out.push({ tipo: "servico", no: n });
      });
      return out;
    },
    temFolhas: function (r) {
      var nos = arr(r && r.atividades);
      for (var i = 0; i < nos.length; i++) if (nos[i].tipo === "subetapa" || nos[i].tipo === "soltos") return true;
      return false;
    },
    /* há linha abaixo da etapa nesse detalhe (com tudo aberto)? */
    temFilhos: function (r, detalhe) {
      var L = this.linhas(r, { detalhe: detalhe, abertas: {} });
      for (var i = 0; i < L.length; i++) if (L[i].tipo !== "etapa") return true;
      return false;
    },

    /* ------------------------------------------------------------------
       GANTT HIERÁRQUICO (tela e PDF). opts:
         detalhe, abertas — como `linhas`;
         papel  — versão de documento: largura fixa, sem rolagem;
         de, ate — fatia de linhas (paginar o PDF: cada página redesenha a
                   régua de tempo);
         hoje   — Date ou "AAAA-MM-DD" (linha hoje; sem ele, hoje);
         limpo  — versão do CLIENTE: sem folga, setas, crítico e hoje (ver o
                  porquê em UI._gantt: "folga de 3 dias" na proposta é
                  convite a negociar a reserva de chuva);
         semLegenda.
       ⚠ ESCALA EM PX POR DIA ÚTIL com piso: obra longa não pode espremer um
       ano em 700 px (uma semana virava 13 px e a subetapa de 2 dias sumia).
       Abaixo do piso o desenho ganha largura mínima e o CONTÊINER rola na
       horizontal — a página nunca rola de lado.
       ------------------------------------------------------------------ */
    gantt: function (r, opts) {
      opts = opts || {};
      var Cr = C();
      if (!r || !arr(r.etapas).length) return "";
      var papel = !!opts.papel, limpo = !!opts.limpo, det = normDet(opts.detalhe);
      var L = this.linhas(r, { detalhe: det, abertas: opts.abertas });
      if (opts.de != null || opts.ate != null) L = L.slice(opts.de || 0, opts.ate == null ? L.length : opts.ate);
      /* PREVISTO × REALIZADO (Fase 3): `opts.base` = {id: {ini, fim}} (datas
         "AAAA-MM-DD" da linha de base) desenha a barra FANTASMA atrás da barra
         de hoje; `opts.realizado` = {id: pct} desenha a fração executada dentro
         dela. As datas da base viram índice de dia útil no calendário DESTE
         cálculo (com feriado — a régua das barras). ⚠ Base que termina depois
         do plano de hoje ALARGA o desenho: cortada na borda, a obra que
         recuperou o atraso pareceria ter prometido menos. Sem os dois opts o
         desenho é o de antes, byte a byte. */
      var gBase = (opts.base && typeof opts.base === "object") ? opts.base : null;
      var gReal = (opts.realizado && typeof opts.realizado === "object") ? opts.realizado : null;
      var janB = {}, maxB = 0;
      if (gBase) {
        var calG = null;
        try { calG = Cr && Cr.calendario ? Cr.calendario(r) : null; } catch (eCg) { calG = null; }
        var limG = Math.ceil((r.totalDias || 1) * 4) + 400;
        var idxG = function (sd) {
          var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sd || ""));
          if (!m || !calG) return null;
          var jg = calG.indice(new Date(+m[1], +m[2] - 1, +m[3]).getTime(), limG);
          return jg < 0 ? 0 : jg;
        };
        L.forEach(function (l) {
          var idB = l.no ? l.no.id : l.et.id, b = own(gBase, idB) ? gBase[idB] : null;
          if (!b || !b.ini) return;
          var bi = idxG(b.ini), bf = idxG(b.fim || b.ini);
          if (bi == null || bf == null) return;
          if (bf < bi) bf = bi;
          janB[idB] = { i: bi, f: bf, di: b.ini, df: b.fim || b.ini };
          if (bf > maxB) maxB = bf;
        });
      }
      var dias = Math.max(r.totalDias || 1, maxB), rowH = papel ? 20 : 24, top = 30, labelW = papel ? 250 : 300;
      var W0 = 1000, pxMin = papel ? 0 : 3;
      var W = Math.max(W0, labelW + 14 + Math.ceil(dias * pxMin));
      var plotW = W - labelW - 14, pxDia = plotW / dias;
      var h = top + L.length * rowH + 10, dpw = (r.params && r.params.diasUteisSemana) || 5;
      function X(d) { return labelW + Math.max(0, Math.min(dias, d || 0)) * pxDia; }
      function yRow(i) { return top + i * rowH; }
      function yc(i) { return yRow(i) + rowH / 2; }
      var idx = {}, numEt = {};
      r.etapas.forEach(function (e, i) { numEt[e.id] = i + 1; });
      L.forEach(function (l, i) { idx[l.no ? l.no.id : l.et.id] = i; });
      var s = '<svg class="gantt gantt-exec" viewBox="0 0 ' + W + ' ' + h + '" style="width:100%;' + (W > W0 ? 'min-width:' + W + 'px;' : '') +
        'background:#fff;border:1px solid var(--linha,#e2e8f0);border-radius:8px;font-family:inherit">';
      // faixa das linhas de ETAPA: o olho acha o começo de cada bloco sem ler número
      L.forEach(function (l, i) { if (l.tipo === "etapa" && L.length > r.etapas.length) s += '<rect x="0" y="' + yRow(i) + '" width="' + W + '" height="' + rowH + '" fill="#f1f5f9"/>'; });
      // régua: meses (calendário real, com feriado) em cima, semanas embaixo
      var cal = null; try { cal = Cr && Cr.calendario ? Cr.calendario(r) : null; } catch (eC) { cal = null; }
      if (cal) {
        var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"], mAnt = -1, xAnt = -999;
        for (var k = 0; k <= dias; k++) {
          var dk = cal.dia(k); if (!ehData(dk)) break;
          var mk = dk.getFullYear() * 12 + dk.getMonth();
          if (mk !== mAnt) {
            var xm = X(k);
            s += '<line x1="' + f1(xm) + '" y1="2" x2="' + f1(xm) + '" y2="' + (h - 6) + '" stroke="#cbd5e1" stroke-width="1"/>';
            if (xm - xAnt >= 34) { s += '<text x="' + f1(xm + 3) + '" y="11" font-size="9" fill="#475569">' + MES[dk.getMonth()] + '/' + String(dk.getFullYear()).slice(2) + '</text>'; xAnt = xm; }
            mAnt = mk;
          }
        }
      }
      var nSem = Math.max(1, Math.ceil(dias / dpw)), passo = Math.max(1, Math.ceil(nSem / Math.max(1, Math.floor(plotW / 34))));
      for (var sm = 0; sm <= nSem; sm += passo) {
        var gx = X(sm * dpw);
        s += '<line x1="' + f1(gx) + '" y1="' + (top - 4) + '" x2="' + f1(gx) + '" y2="' + (h - 6) + '" stroke="#e2e8f0" stroke-width="1"/>';
        if (sm < nSem) s += '<text x="' + f1(gx + 3) + '" y="' + (top - 7) + '" font-size="8.5" fill="#94a3b8">S' + (sm + 1) + '</text>';
      }
      // linha de HOJE com feriado (Cronograma.diaUtilDoCorte, a mesma régua das barras)
      var hojeX = null;
      if (!limpo) {
        var j = null;
        try { j = Cr.diaUtilDoCorte(r, opts.hoje); } catch (eH) { j = null; }
        if (j != null && j <= dias) hojeX = X(j);
      }
      // no previsto × realizado a linha é a DATA DE CORTE (o dia que os números descrevem), não hoje
      var rotHoje = opts.rotHoje || "hoje";
      if (hojeX != null) s += '<line x1="' + f1(hojeX) + '" y1="' + (top - 2) + '" x2="' + f1(hojeX) + '" y2="' + (h - 6) + '" stroke="' + HOJE + '" stroke-width="1.2" stroke-dasharray="4,3"><title>' + esc(rotHoje) + '</title></line>';

      function numF(n) { return n && n.numero ? n.numero : ""; }
      var porIdNo = {};
      arr(r.atividades).forEach(function (n) { porIdNo[n.id] = n; });
      function textoPreds(n, ehEtapa) {
        if (!n.preds || !n.preds.length) return ehEtapa ? "início da obra" : "início da etapa";
        if (ehEtapa) return Cr.predsTexto(n, numEt);
        var mp = {}; n.preds.forEach(function (p) { mp[p] = numF(porIdNo[p]); });
        return Cr.predsTextoSub(n, mp);
      }
      function tituloBarra(n, rot, ehEtapa) {
        var t = rot + (n.marco ? " — MARCO (sem duração) · " + dma(n.dataInicio)
          : " — " + n.duracao + " dia(s) útil(eis) · " + dma(n.dataInicio) + " → " + dma(n.dataFim));
        if (!limpo && n.tipo !== "servico") t += n.critico ? " · CRÍTICA (sem folga)" : " · folga de " + (n.folga || 0) + " dia(s)" + (ehData(n.dataLimite) ? ", até " + dma(n.dataLimite) : "");
        if (!limpo && n.tipo !== "servico") t += " · depende de: " + textoPreds(n, ehEtapa);
        if (n.tipo === "subetapa" || n.tipo === "soltos") {
          if (n.escala === "escalada" && n.duracaoRede !== n.duracao) t += " · a rede das subetapas pede " + n.duracaoRede + " d; desenhada dentro da duração da etapa";
          if (n.comprimida) t += " · ⚠ etapa curta demais: sobrepõe outra subetapa";
        }
        if (n.tipo === "servico" && FONTES[n.fonte]) t += " · " + FONTES[n.fonte][1];
        return esc(t);
      }
      // rótulos (recuo por nível, nº EAP, até 48 caracteres com o nome inteiro no <title>)
      L.forEach(function (l, i) {
        var n = l.no || l.et, prof = l.no ? (l.no.prof || 0) : 0;
        var num = l.no ? l.no.numero : String(l.i + 1), nome = n.nome || "";
        var txt = corta(num + " " + nome, 48), y = yRow(i) + rowH / 2 + 3.5;
        var peso = l.tipo === "etapa" ? ' font-weight="600"' : (n.critico && !limpo ? ' font-weight="600"' : "");
        var cor = l.tipo === "servico" ? "#64748b" : (l.tipo === "etapa" ? "#0f172a" : "#334155");
        s += '<text x="' + (6 + prof * 14) + '" y="' + y + '" font-size="' + (l.tipo === "servico" ? 9.5 : 10) + '" fill="' + cor + '"' + peso + '><title>' + esc(num + " " + nome) + '</title>' + esc(txt) + '</text>';
      });
      /* a LINHA DE BASE atrás da barra: tracejada e sem a cor da categoria —
         é o combinado, não o plano de hoje; a barra de hoje vem por cima */
      if (gBase) L.forEach(function (l, i) {
        var idB = l.no ? l.no.id : l.et.id, jb = own(janB, idB) ? janB[idB] : null;
        if (!jb) return;
        s += '<rect class="gantt-base" x="' + f1(X(jb.i)) + '" y="' + (yRow(i) + 2) + '" width="' + f1(Math.max(3, (jb.f - jb.i) * pxDia)) + '" height="' + (rowH - 4) +
          '" rx="3" fill="#cbd5e1" fill-opacity="0.35" stroke="#475569" stroke-width="1" stroke-dasharray="4,2"><title>' + esc("linha de base: " + dmaS(jb.di) + " → " + dmaS(jb.df)) + '</title></rect>';
      });
      /* fração EXECUTADA (realPct do nó — a régua do confronto) numa faixa
         escura no pé da barra: quem lê o Gantt vê quanto da janela já foi feito */
      function realBar(n, x, w, y, hh) {
        if (!gReal || !own(gReal, n.id) || gReal[n.id] == null) return "";
        var pr = Math.max(0, Math.min(100, Number(gReal[n.id]) || 0));
        if (!(pr > 0)) return "";
        return '<rect class="gantt-real" x="' + f1(x) + '" y="' + y + '" width="' + f1(Math.max(1, w * pr / 100)) + '" height="' + hh + '" fill="#0f172a" opacity="0.6"><title>' + esc("executado: " + pct(pr, 1)) + '</title></rect>';
      }
      /* barras. ⚠ Os números de duração ("61d") vão para `rotDur` e são
         desenhados DEPOIS das setas, com contorno branco: desenhados antes, a
         seta crítica vertical passava por cima do "61d" de Pilares e cortava o
         "65d" do resumo na borda do papel (foto do e2e, tela e PDF). */
      var rotDur = "", HALO = ' stroke="#fff" stroke-width="2.4" paint-order="stroke"';
      L.forEach(function (l, i) {
        var n = l.no || l.et, y0 = yRow(i), cor = n.cor || (Cr.cat(n.categoria) || {}).cor || CINZA;
        var rot = (l.no ? l.no.numero : String(l.i + 1)) + " " + (n.nome || "");
        var ehEtapa = l.tipo === "etapa", resumo = ehEtapa && l.no && l.no.papel === "resumo" && det !== "etapa";
        var crit = !!n.critico && !limpo;
        if (l.tipo === "servico" && (n.semBase || n.inicio == null)) {
          s += '<text x="' + (labelW + 4) + '" y="' + (y0 + rowH / 2 + 3) + '" font-size="8.5" fill="#94a3b8">sem quantidade — sem barra</text>';
          return;
        }
        var x = X(n.inicio), w = Math.max(3, (Math.min(dias, n.fim) - Math.max(0, n.inicio)) * pxDia);
        if (n.marco) {
          var cy = y0 + rowH / 2, rr = l.tipo === "servico" ? 5 : 7;
          s += '<polygon class="gantt-marco' + (crit ? ' gantt-critica' : '') + '" points="' + f1(x) + ',' + (cy - rr) + ' ' + f1(x + rr) + ',' + cy + ' ' + f1(x) + ',' + (cy + rr) + ' ' + f1(x - rr) + ',' + cy + '" fill="' + (crit ? CRIT : '#0f172a') + '"><title>' + tituloBarra(n, rot, ehEtapa) + '</title></polygon>';
          return;
        }
        if (resumo) {
          // barra de RESUMO estilo MS Project: fina, escura, colchetes nas pontas
          var yr = y0 + rowH / 2 - 4, x1 = x + w;
          s += '<rect class="gantt-resumo' + (crit ? ' gantt-critica' : '') + '" x="' + f1(x) + '" y="' + yr + '" width="' + f1(w) + '" height="5" fill="' + RESUMO + '"' + (crit ? ' stroke="' + CRIT + '" stroke-width="1.2"' : '') + '><title>' + tituloBarra(n, rot, true) + '</title></rect>';
          s += realBar(n, x, w, yr + 5, 3);
          s += '<polygon class="gantt-colchete" points="' + f1(x) + ',' + yr + ' ' + f1(x + 6) + ',' + yr + ' ' + f1(x) + ',' + (yr + 10) + '" fill="' + RESUMO + '"/>';
          s += '<polygon class="gantt-colchete" points="' + f1(x1 - 6) + ',' + yr + ' ' + f1(x1) + ',' + yr + ' ' + f1(x1) + ',' + (yr + 10) + '" fill="' + RESUMO + '"/>';
          rotDur += '<text x="' + f1(Math.min(W - 26, x1 + 4)) + '" y="' + (yr + 6) + '" font-size="8.5" fill="#475569"' + HALO + ' pointer-events="none">' + n.duracao + 'd</text>';
          return;
        }
        var hb = l.tipo === "servico" ? 7 : (ehEtapa ? 16 : 13), yb = y0 + (rowH - hb) / 2;
        var folga = n.folga || 0;
        if (folga > 0 && !limpo && l.tipo !== "servico") {
          var wF = Math.max(2, Math.min(folga, dias - n.fim) * pxDia);
          if (wF > 0) s += '<rect class="gantt-folga" x="' + f1(x + w) + '" y="' + yb + '" width="' + f1(wF) + '" height="' + hb + '" rx="3" fill="' + cor + '" fill-opacity="0.13" stroke="' + cor + '" stroke-opacity="0.55" stroke-dasharray="3,3"><title>folga: pode ir até ' + dma(n.dataLimite) + ' sem atrasar a obra</title></rect>';
        }
        var cls = l.tipo === "servico" ? "gantt-serv" : ("gantt-barra" + (l.tipo === "folha" ? " gantt-folha" : "") + (crit ? " gantt-critica" : ""));
        s += '<rect class="' + cls + '" x="' + f1(x) + '" y="' + yb + '" width="' + f1(w) + '" height="' + hb + '" rx="' + (l.tipo === "servico" ? 2 : 3) + '" fill="' + cor + '" opacity="' + (l.tipo === "servico" ? 0.55 : 0.92) + '"' +
          (crit && l.tipo !== "servico" ? ' stroke="' + CRIT + '" stroke-width="1.4"' : '') + '><title>' + tituloBarra(n, rot, ehEtapa) + '</title></rect>';
        if (l.tipo !== "servico") s += realBar(n, x, w, yb + hb - 4, 4);
        if (l.tipo !== "servico") {
          if (w >= 30) rotDur += '<text x="' + f1(x + w - 4) + '" y="' + (yb + hb / 2 + 3) + '" font-size="8.5" font-weight="600" fill="#fff" text-anchor="end" pointer-events="none">' + n.duracao + 'd</text>';
          else rotDur += '<text x="' + f1(Math.min(W - 24, x + w + 3)) + '" y="' + (yb + hb / 2 + 3) + '" font-size="8.5" fill="#64748b"' + HALO + ' pointer-events="none">' + n.duracao + 'd</text>';
        }
      });
      // setas, por cima das barras (como no MS Project)
      function seta(px, py, sx, sy, cor, cls, larg, tracejada) {
        var d;
        if (sx >= px + 12) d = "M" + f1(px) + "," + py + " H" + f1(sx - 5) + " V" + sy + " H" + f1(sx - 1);
        else {
          var faixa = py + (sy > py ? rowH / 2 : -rowH / 2), volta = Math.max(labelW + 2, sx - 6);
          d = "M" + f1(px) + "," + py + " H" + f1(px + 5) + " V" + faixa + " H" + f1(volta) + " V" + sy + " H" + f1(sx - 1);
        }
        return '<path class="' + cls + '" d="' + d + '" fill="none" stroke="' + cor + '" stroke-width="' + larg + '"' + (tracejada ? ' stroke-dasharray="3,2"' : '') + ' opacity="0.9"/>' +
          '<polygon points="' + f1(sx) + ',' + sy + ' ' + f1(sx - 5) + ',' + (sy - 3) + ' ' + f1(sx - 5) + ',' + (sy + 3) + '" fill="' + cor + '"/>';
      }
      if (!limpo) L.forEach(function (l, si) {
        var sN = l.no || l.et;
        if (l.tipo === "etapa") {
          // EXTERNA etapa → etapa: fica vermelho só o elo que APERTA duas críticas (ver UI._gantt)
          (sN.preds || []).forEach(function (pid) {
            var pi = idx[pid]; if (pi == null) return;
            var pL = L[pi], p = pL.no || pL.et;
            var off = (sN.predDesloc && sN.predDesloc[pid] != null) ? sN.predDesloc[pid] : -Math.floor(((r.params && r.params.paralelismo) || 0) * p.duracao);
            var verm = sN.inicio === Math.max(0, p.fim + off) && sN.critico && p.critico;
            s += seta(X(p.fim), yc(pi), X(sN.inicio), yc(si), verm ? CRIT : CINZA, "gantt-dep" + (verm ? " gantt-dep-critica" : ""), verm ? 1.8 : 1.1, false);
            var lagE = sN.predLag && sN.predLag[pid];
            if (lagE != null && X(sN.inicio) >= X(p.fim) + 12) s += '<text class="gantt-lag" x="' + f1((X(p.fim) + X(sN.inicio)) / 2) + '" y="' + (yc(pi) - 4) + '" font-size="8.5" fill="' + (verm ? CRIT : CINZA) + '" text-anchor="middle" pointer-events="none">' + (lagE >= 0 ? "+" : "") + lagE + 'd</text>';
          });
          return;
        }
        if (l.tipo !== "folha") return;
        // INTERNA folha → folha (mesma etapa), tracejada; II sai do INÍCIO da predecessora
        (sN.preds || []).forEach(function (pid) {
          var pi = idx[pid]; if (pi == null) return;
          var p = L[pi].no; if (!p || p.inicio == null) return;
          var ii = sN.predTipo && sN.predTipo[pid] === "II";
          var verm = sN.critico && p.critico, cor = verm ? CRIT : INTERNA;
          if (ii) {
            var px = X(p.inicio), sx = X(sN.inicio), py = yRow(pi) + rowH - 4, sy = yc(si);
            s += '<path class="gantt-dep gantt-dep-int" d="M' + f1(px) + ',' + py + ' V' + sy + ' H' + f1(sx - 1) + '" fill="none" stroke="' + cor + '" stroke-width="1" stroke-dasharray="3,2" opacity="0.9"/>' +
              '<polygon points="' + f1(sx) + ',' + sy + ' ' + f1(sx - 5) + ',' + (sy - 3) + ' ' + f1(sx - 5) + ',' + (sy + 3) + '" fill="' + cor + '"/>';
          } else s += seta(X(p.fim), yc(pi), X(sN.inicio), yc(si), cor, "gantt-dep gantt-dep-int", 1, true);
        });
      });
      s += rotDur + '</svg>';   // os números de duração por cima das setas (ver `rotDur`)
      var envolto = papel ? s : '<div class="cx-gantt">' + s + '</div>';
      if (limpo || opts.semLegenda) return envolto;
      function amostra(css) { return '<span style="display:inline-block;width:16px;' + css + ';vertical-align:middle;margin-right:5px"></span>'; }
      return envolto + '<div class="muted" style="font-size:11px;margin-top:4px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">' +
        '<span>' + amostra('height:0;border-top:2px solid ' + CRIT) + 'caminho crítico (sem folga)</span>' +
        '<span>' + amostra('height:0;border-top:2px solid ' + CINZA) + 'dependência entre etapas</span>' +
        '<span>' + amostra('height:0;border-top:2px dashed ' + INTERNA) + 'dependência entre subetapas</span>' +
        '<span>' + amostra('height:5px;background:' + RESUMO) + 'resumo da etapa</span>' +
        '<span>' + amostra('width:12px;height:10px;border:1px dashed ' + CINZA + ';border-radius:2px') + 'folga</span>' +
        (gBase ? '<span>' + amostra('width:12px;height:10px;border:1px dashed #475569;background:rgba(203,213,225,.35);border-radius:2px') + 'linha de base (o combinado)</span>' : '') +
        (gReal ? '<span>' + amostra('height:4px;background:#0f172a;opacity:.6') + 'executado (faixa escura no pé da barra)</span>' : '') +
        (hojeX != null ? '<span>' + amostra('height:0;border-top:2px dashed ' + HOJE) + esc(rotHoje) + '</span>' : '') +
        (W > W0 ? '<span>role o desenho para o lado para ver a obra inteira</span>' : '') +
        '</div>';
    },

    /* ------------------------------------------------------------------
       TELA
       ------------------------------------------------------------------ */
    render: function (d, est) {
      est = est || this.estado(null, d.orc);
      // sem Gestão de Obras não há obra para comparar: a sub-aba some (ver SUBS)
      if (!(d.obra && d.obra.podeGestao)) { est.semReal = true; if (est.sub === "real") est.sub = "cronograma"; }
      var html = '<style>' + CSS + '</style><div class="cx" data-cx-sub="' + esc(est.sub) + '">';
      /* ⚠ a faixa da obra mora NA LINHA das sub-abas: numa linha própria ela
         empurrava o Gantt 42 px para baixo — medido a 1366×768, a 1ª barra
         ficava em y=898, abaixo da dobra (critério de aceite da espec 2) */
      html += this.barra(est, this.faixaObra(d.obra));
      if (est.sub === "fisico") html += this.fisico(d, est);
      else if (est.sub === "parametros") html += this.parametros(d, est);
      else if (est.sub === "real") html += this.real(d);
      else html += this.cronograma(d, est);
      return html + '</div>';
    },

    /* Sub-aba Previsto × Realizado do orçamento: o MESMO painel da ficha da
       obra (painelPR completo), com os dados de App._cronoPainelDados. Sem
       painel, diz por quê e a porta que existe — nunca um quadro vazio. */
    real: function (d) {
      var info = d.obra || {}, a = info.alvo || {};
      if (d.pr && d.pr.painel) return this.painelPR(d.pr, { completo: true, origem: "orc" });
      var msg, porta = "";
      var outs = arr(info.outras);
      if (!arr(info.obras).length && !info.ocultas && outs.length) {
        // a obra é de outra revisão da família: o previsto × realizado dela mora no orçamento ligado a ela
        msg = "A obra " + (outs[0].obra.nome || "") + " está ligada à revisão " + (outs[0].maisNova ? "mais nova " : "") + (outs[0].orcNumero || outs[0].orcId) + " deste orçamento — o previsto × realizado dela é medido sobre aquele orçamento.";
        porta = '<button class="btn sm" data-acao="crono-abrir-orc" data-orc="' + esc(outs[0].orcId) + '">Abrir o orçamento ligado à obra</button>';
      } else if (!arr(info.obras).length) {
        msg = info.ocultas || info.ocultasOutras ? (Number(info.ocultas) || 0) + (Number(info.ocultasOutras) || 0) + " obra(s) ligada(s) a este orçamento (ou a uma revisão dele) que o seu usuário não vê — o previsto × realizado é da obra, e fica com quem pode vê-la."
          : "Nenhuma obra ligada a este orçamento. O previsto × realizado compara o planejado com os diários e as medições de uma obra: crie a obra deste orçamento (botão na linha de cima) para acompanhar.";
      } else if (!a.obra) msg = arr(info.obras).length + " obras ligadas a este orçamento — escolha na linha de cima qual acompanhar.";
      else if (a.nivel > 0) {
        msg = "A obra " + (a.obra.nome || "") + " está ligada a uma revisão anterior deste orçamento — o previsto × realizado mede sobre o orçamento ligado a ela. Passe a obra para esta revisão (linha de cima) ou abra o orçamento ligado a ela.";
        if (a.obra.orcamentoId) porta = '<button class="btn sm" data-acao="crono-abrir-orc" data-orc="' + esc(a.obra.orcamentoId) + '">Abrir o orçamento ligado à obra</button>';
      } else msg = "Não consegui montar o previsto × realizado da obra " + (a.obra.nome || "") + " agora — a sub-aba Cronograma continua valendo. Se persistir, avise o suporte.";
      return '<div class="card cx-card"><p style="margin:0 0 8px;font-size:13px">' + esc(msg) + '</p>' + porta + '</div>';
    },

    /* Faixa da obra (1 linha). Fase 2: a obra ligada — pela cadeia de
       revisões — e a porta até ela. O previsto × realizado por nó chega com
       o planejamento da obra (Fase 3) e NÃO é inventado aqui.
       Sem Gestão (plano base): nenhuma porta de obra, uma linha honesta. */
    faixaObra: function (info) {
      info = info || {};
      if (!info.podeGestao) {
        return '<div class="cx-faixa muted" title="Aqui fica o cronograma da proposta; o acompanhamento da obra (executado × previsto) é feito na Gestão de Obras.">Previsto × realizado da obra é da <b>Gestão de Obras</b>.</div>';
      }
      var obs = arr(info.obras), dec = info.alvo || {}, html = '<div class="cx-faixa">';
      var outs = arr(info.outras), oOut = Number(info.ocultasOutras) || 0;
      /* ⚠ obra ligada a OUTRA revisão da família (mais nova ou irmã): nunca
         [Criar obra] — a porta é o orçamento ligado a ela (ver obraDaCadeia) */
      if (!obs.length && !info.ocultas && (outs.length || oOut)) return html + this._faixaOutras(outs, oOut) + '</div>';
      if (!obs.length && !info.ocultas) {
        return html + '<span class="muted" title="O acompanhamento previsto × realizado começa quando uma obra for vinculada a este orçamento (Gestão → Obras).">Nenhuma obra ligada a este orçamento.</span>' +
          (info.podeCriar ? '<button class="btn sm" data-acao="crono-obra-criar" title="Abre o cadastro de obra já preenchido com este orçamento, o início do cronograma e o término que ele calcula. Nada é gravado sem você salvar.">Criar obra deste orçamento</button>' : '') + '</div>';
      }
      /* ⚠ NUNCA "Criar obra" com obra na CADEIA de revisões — nem com a que o
         usuário não vê. O acumulado já medido de cada item é por obra (e por
         orçamento): uma segunda obra começaria a medição do zero nos itens já
         medidos na primeira — faturamento em dobro (crítica dinheiro #2). */
      if (!obs.length) return html + '<span class="muted">' + info.ocultas + ' obra(s) ligada(s) que o seu usuário não vê</span></div>';
      var a = null;
      if (dec.obra) obs.forEach(function (x) { if (x.obra && x.obra.id === dec.obra.id) a = x; });
      if (!a && obs.length === 1) a = obs[0];
      if (!a) {
        // várias obras e nenhuma escolhida: a escolha é da pessoa (estado de tela), nunca da ordem da lista
        html += '<span><b>' + obs.length + ' obras</b> ligadas a este orçamento — escolha qual acompanhar:</span>';
        obs.slice(0, 6).forEach(function (x) {
          html += '<button class="btn sm" data-acao="crono-obra-sel" data-obra="' + esc(x.obra.id) + '" title="' + esc(x.obra.nome || "") + '">' + esc(corta(x.obra.nome || "sem nome", 28)) +
            (x.nivel > 0 ? ' <span class="muted">(revisão ' + esc(x.orcNumero || "anterior") + ')</span>' : '') + '</button>';
        });
        if (obs.length > 6) html += '<span class="muted">e mais ' + (obs.length - 6) + '</span>';
        if (info.ocultas) html += '<span class="muted">' + info.ocultas + ' obra(s) ligada(s) que o seu usuário não vê</span>';
        return html + '</div>';
      }
      var ob = a.obra, nomeC = esc(corta(ob.nome || "sem nome", 32));
      if (dec.tipo === "plano") html += '<span class="cx-modo" title="Este orçamento está aprovado: o que se edita aqui (durações, dependências, parâmetros, modo executivo, Execução → Enviar) vai para o plano de execução da obra. A proposta aprovada, o PDF da proposta e o desembolso dela ficam como foram.">Editando o <b>PLANO DE EXECUÇÃO</b> da obra <b>' + nomeC + '</b> — a proposta aprovada não muda.</span>';
      if (a.nivel > 0) {
        html += '<span class="cx-chip" title="' + esc(ob.nome || "") + '"><span class="cx-chip-txt">Obra: <b>' + nomeC + '</b>';
        html += ' <span class="muted">· ligada à revisão anterior ' + esc(a.orcNumero || "") + '</span></span>';
        if (info.podeEditarObra) html += '<button class="btn sm primary" data-acao="crono-obra-passar" data-obra="' + esc(ob.id) + '" title="Mostra o antes → depois das quantidades e pede confirmação. Diários e medições continuam na mesma obra.">Passar a obra para esta revisão</button>';
        html += '<button class="btn sm" data-gopen="obras:' + esc(ob.id) + '" title="Abrir cadastro da obra — na Gestão de Obras">Cadastro da obra</button></span>';
      } else {
        /* os NÚMEROS primeiro: na linha que encolhe com reticências é o que
           ainda aparece; o texto inteiro (com as três réguas) vai no title do
           chip. A porta [Informar início] fica FORA do texto que encolhe (um
           botão dentro do texto cortado sumiria junto). */
        html += '<span class="cx-chip" title="' + esc("Obra " + (ob.nome || "") + (info.chipTitulo ? " — " + info.chipTitulo : "")) + '"><span class="cx-chip-txt">' +
          (info.chip ? '<span class="cx-chipnum">' + info.chip + '</span> <span class="muted">·</span> ' : '') + 'Obra <b>' + nomeC + '</b></span>';
        html += (info.chipPorta || '') + '<button class="btn sm" data-acao="crono-planejamento" data-obra="' + esc(ob.id) + '" title="Abrir planejamento da obra — o cronograma da obra: previsto × realizado, linha de base e histórico">Abrir planejamento</button></span>';
        if (dec.planoAlheio) {
          /* ⚠ plano iniciado sobre OUTRO orçamento (a obra foi religada pelo
             cadastro): as etapas não são as mesmas, e editar aqui gravaria
             durações em ids que este orçamento não tem. A porta é reiniciar,
             com confirmação que diz o que se perde (App.cronoIniciarPlano). */
          html += '<span class="muted cx-faixa-nota" title="O plano de execução da obra foi iniciado a partir do orçamento ' + esc(dec.planoAlheio.orcNumero || dec.planoAlheio.orcamentoId || "") + ', que não é este nem uma revisão dele.">Plano da obra: de outro orçamento (' + esc(corta(dec.planoAlheio.orcNumero || dec.planoAlheio.orcamentoId || "", 20)) + ')</span>';
          if (info.podeEditarObra) html += '<button class="btn sm primary" data-acao="crono-plano-iniciar" data-obra="' + esc(ob.id) + '" data-reiniciar="1" title="Copia o cronograma deste orçamento para o plano da obra. Mostra antes o que se perde e pede confirmação.">Reiniciar plano a partir deste orçamento</button>';
        } else if (dec.travado && !dec.plano) {
          html += '<span class="muted cx-faixa-nota" title="Aprovado: o cronograma da proposta não muda — para replanejar a obra, inicie o plano de execução dela.">Aprovado: o cronograma da proposta não muda.</span>';
          if (info.podeEditarObra) html += '<button class="btn sm primary" data-acao="crono-plano-iniciar" data-obra="' + esc(ob.id) + '" title="Copia este cronograma para a obra: a partir daí as edições desta aba vão para o plano da obra e a proposta aprovada fica intacta.">Iniciar plano de execução da obra</button>';
        } else if (!dec.aprovado && !dec.travado && dec.plano) {
          /* ⚠ só SEM aprovação (revisão 3, lente UX): no aprovado o decidirAlvo
             destrava (o alvo é o plano) e o seletor aparecia com [Proposta]
             mudo — o clique não tinha para onde ir, porque a proposta aprovada
             não se edita. Porta que não abre é pior que porta nenhuma. */
          // não aprovado com plano: as duas coisas existem e a pessoa escolhe qual edita (estado de tela)
          var emPlano = dec.tipo === "plano";
          html += '<span class="cx-seg" role="group" aria-label="O que esta aba edita"><button class="' + (emPlano ? '' : 'on') + '" data-acao="crono-editar" data-modo="orc" aria-pressed="' + (emPlano ? 'false' : 'true') + '" title="O cronograma da proposta (PDF, desembolso)">Proposta</button>' +
            '<button class="' + (emPlano ? 'on' : '') + '" data-acao="crono-editar" data-modo="plano" aria-pressed="' + (emPlano ? 'true' : 'false') + '" title="O plano de execução da obra (previsto × realizado)">Plano da obra</button></span>';
        }
      }
      if (obs.length > 1) html += '<button class="btn sm ghost" data-acao="crono-obra-sel" data-obra="" title="Este orçamento tem ' + obs.length + ' obras ligadas — escolher outra">trocar obra (' + obs.length + ')</button>';
      if (info.ocultas) html += '<span class="muted">' + info.ocultas + ' obra(s) ligada(s) que o seu usuário não vê</span>';
      return html + '</div>';
    },
    /* a obra está ligada a OUTRA revisão da família (mais nova ou irmã): diz
       qual e oferece a porta que existe — abrir o orçamento ligado a ela */
    _faixaOutras: function (outs, oOut) {
      var h = '', a = outs[0];
      if (a) {
        h += '<span title="' + esc(a.obra.nome || "") + '">Obra <b>' + esc(corta(a.obra.nome || "sem nome", 28)) + '</b> <span class="muted">· ligada à revisão ' + (a.maisNova ? 'mais nova ' : '') + '<b>' + esc(a.orcNumero || a.orcId) +
          '</b> — é por ela que a obra planeja e mede</span></span>';
        h += '<button class="btn sm" data-acao="crono-abrir-orc" data-orc="' + esc(a.orcId) + '" title="Abre o orçamento ligado à obra na aba Cronograma">Abrir o orçamento ligado à obra</button>';
        if (outs.length > 1) h += '<span class="muted">e mais ' + (outs.length - 1) + ' obra(s) em outras revisões</span>';
      }
      if (oOut) h += '<span class="muted">' + oOut + ' obra(s) ligada(s) a outra revisão deste orçamento que o seu usuário não vê</span>';
      return h;
    },

    barra: function (est, faixa) {
      var html = '<div class="cx-barra"><div class="cx-subs" role="tablist">';
      SUBS.forEach(function (s) {
        if (!subVisivel(s.id)) return;
        if (s.id === "real" && est.semReal) return;   // sem Gestão de Obras: ver render
        html += '<button class="cx-sub' + (est.sub === s.id ? ' on' : '') + '" role="tab" aria-selected="' + (est.sub === s.id ? 'true' : 'false') + '" data-acao="crono-sub" data-sub="' + s.id + '">' + esc(s.nome) + '</button>';
      });
      /* o rótulo das duas ações vai num span que some abaixo de 1600 px (fica
         o ícone, com title e aria-label): a 1366 são ~200 px que a faixa da
         obra precisa para mostrar os números numa linha só (ver CSS) */
      html += '</div>' + (faixa || '') + '<div class="cx-acoes">' +
        '<button class="btn sm" data-acao="cron-pdf" aria-label="Imprimir / PDF" title="Imprimir / PDF — abre o cronograma pronto para imprimir ou salvar em PDF (A4 paisagem), no detalhe que está na tela">' + ic('imprimir') + '<span class="cx-rot"> Imprimir / PDF</span></button>' +
        '<button class="btn sm" data-acao="cron-msproject" aria-label="MS Project (XML)" title="MS Project (XML) — exporta as etapas, durações e dependências, no detalhe que está na tela. Abre também no Project Libre e no GanttProject.">' + ic('exportar') + '<span class="cx-rot"> MS Project (XML)</span></button>' +
        '</div></div>';
      return html;
    },

    seletorDetalhe: function (det) {
      var html = '<span style="font-size:12.5px" class="muted">Detalhe:</span> <span class="cx-seg" role="group" aria-label="Detalhe do cronograma">';
      DETALHES.forEach(function (k) {
        html += '<button class="' + (det === k ? 'on' : '') + '" data-acao="crono-det" data-det="' + k + '" aria-pressed="' + (det === k ? 'true' : 'false') + '">' + DET_ROT[k] + '</button>';
      });
      return html + '</span>';
    },

    interruptor: function (r) {
      var rede = !!(r.exec && r.exec.rede);
      return '<button class="cx-toggle' + (rede ? ' on' : '') + '" data-acao="crono-exec" data-ligar="' + (rede ? '0' : '1') + '" role="switch" aria-checked="' + (rede ? 'true' : 'false') + '" title="' +
        (rede ? 'LIGADO: a duração de cada etapa com subetapas é o vão da rede das subetapas (e é esse prazo que vai ao PDF, à proposta e ao desembolso). Clique para ver o antes → depois de desligar.'
          : 'DESLIGADO: as subetapas são desenhadas dentro da duração de cada etapa. Clique para ver o antes → depois de ligar — nada é gravado sem você confirmar.') +
        '"><span class="cx-knob"></span>Detalhar o prazo pelas subetapas (cronograma executivo)</button>';
    },

    cronograma: function (d, est) {
      var r = d.r, det = est.detalhe, html = d.cartao || "";
      var temArv = ehArr(r.atividades) && !(r.exec && r.exec.erro), temF = temArv && this.temFolhas(r);
      if (!temArv) det = "etapa";
      var nCrit = (r.caminhoCritico || []).length;
      // cabeçalho de sempre (as e2e e a suíte de render leem estes textos)
      html += '<div class="flex" style="gap:18px;margin-bottom:4px;align-items:baseline;flex-wrap:wrap"><b style="font-size:16px">⏱ ' + r.totalDias + ' dias úteis (~' + r.totalSemanas + ' semanas)</b>' +
        '<span class="muted">' + r.dataInicio.toLocaleDateString("pt-BR") + ' → ' + r.dataFim.toLocaleDateString("pt-BR") + '</span>' +
        '<span class="pill" style="background:#b91c1c14;color:var(--graf-alerta,#b91c1c);font-weight:600" title="Etapas sem folga: atrasar qualquer uma delas atrasa a entrega da obra.">caminho crítico: ' + nCrit + ' de ' + r.etapas.length + ' etapa' + (r.etapas.length === 1 ? '' : 's') + '</span>' +
        (r.temCiclo ? '<span class="pill" style="background:#f59e0b22;color:#b45309;font-weight:700" title="Uma etapa depende de outra que, por sua vez, depende dela. O elo que fecha o laço foi ignorado no cálculo.">dependência circular — elo ignorado; revise a coluna “Depende de”</span>' : '') +
        (d.pillFeriados || '') + '</div>';
      /* seletor + interruptor + a nota do agente numa linha só: em três
         linhas (medido por foto a 1366×768) o Gantt começava abaixo da dobra */
      html += '<div class="flex" style="gap:12px;margin-bottom:6px;align-items:center;flex-wrap:wrap">' + (temArv ? this.seletorDetalhe(det) + (temF ? this.interruptor(r) : '') : '') +
        '<span class="muted" style="font-size:12px">' + ic('ia') + ' estimado pelo agente · edite duração e dependências na tabela</span></div>';
      if (r.exec && r.exec.erro) html += '<div class="cx-aviso">' + esc(r.exec.erro) + '</div>';
      /* ⚠ os avisos das subetapas vão LOGO ABAIXO do Gantt, antes da tabela:
         em cima dele custavam ~60 px e, somados à faixa e ao cartão, a 1ª barra
         caía abaixo da dobra a 1366×768 (medido: y=898). */
      /* ⚠ O AVISO DO APROVADO VAI NA FRENTE DA FILA, E A PORTA É DECIDIDA SOBRE
         A LISTA INTEIRA. Roteiro do defeito (medido na revisão de 11/09/2026):
         num aprovado com 6 etapas em dependência circular, os avisos saíam
         `ciclo × 6, comprimida, aprovado-gravado` — o do aprovado era o 8º,
         caía no "e mais 3 aviso(s)", e como `temAprov` só era marcado DENTRO
         do `slice(0, 5)` o botão [Criar revisão] nem era desenhado. A pessoa
         ficava com a data divergindo, sem recado e sem porta: trava sem saída
         é o que faz a pessoa procurar saída errada (skill dinheiro, regra 6).
         Sem `sort` de propósito — ordenação estável não é garantida em ES5, e
         a ordem relativa dos outros avisos é a do motor. */
      var todosAv = arr(r.exec && r.exec.avisos), htmlAv = "", temAprov = false;
      var avisos = [], _outros = [];
      todosAv.forEach(function (a) {
        if (a && a.tipo === "aprovado-gravado") { temAprov = true; avisos.push(a); }
        else _outros.push(a);
      });
      avisos = avisos.concat(_outros);
      /* a frase da obra só sai quando a faixa da obra EXISTE nesta tela: sem
         Gestão (ou sem obra ligada) ela é desenhada como texto morto e manda
         por um caminho que não está ali (memória "porta prometida precisa
         existir") */
      var _temFaixaObra = !!(d.obra && d.obra.podeGestao && arr(d.obra.obras).length);
      if (avisos.length) {
        htmlAv += '<div class="cx-aviso"><b>Subetapas:</b><ul class="cx-lista">';
        avisos.slice(0, 5).forEach(function (a) {
          var msg = a.msg;
          /* ⚠ APROVADO: a data é a GRAVADA e ela NÃO muda (o motor congela —
             Cronograma.congeladoPorAprovacao, 12/09/2026). O recado do motor
             já diz os dois números; aqui entra só a PORTA que existe, porque
             recado de trava sem saída faz a pessoa procurar saída errada.
             Antes deste passo a tela dizia "esta tela usa o vão novo, mas os
             outros aparelhos imprimem o gravado" — duas entregas para a mesma
             proposta aprovada; agora é uma só, a do contrato. */
          if (a.tipo === "aprovado-gravado") {
            msg = String(a.msg || "") + " Para trabalhar com o prazo novo, crie uma revisão" +
              (_temFaixaObra ? " (com obra ligada, a porta de replanejar a obra está na linha de cima)." : ".");
          }
          htmlAv += '<li>' + esc(msg) + '</li>';
        });
        if (avisos.length > 5) htmlAv += '<li>e mais ' + (avisos.length - 5) + ' aviso(s)</li>';
        htmlAv += '</ul>' + (temAprov ? '<button class="btn sm" data-acao="crono-revisao" title="Cria a revisão deste orçamento aprovado (o aprovado fica intacto) e abre ela">Criar revisão</button>' : '') + '</div>';
      }
      /* Gantt: por etapa → o SVG de sempre (UI._gantt), que a proposta e o PDF
         também desenham; com linhas abaixo da etapa → o hierárquico */
      var hier = temArv && det !== "etapa" && this.temFilhos(r, det);
      if (hier) html += this.gantt(r, { detalhe: det, abertas: est.abertas, hoje: est.hoje });
      else html += d.ganttEtapa ? d.ganttEtapa(r) : this.gantt(r, { detalhe: "etapa", hoje: est.hoje });
      html += htmlAv;
      if (temArv && det !== "etapa") {
        var semSub = r.atividades.filter(function (n) { return n.tipo === "etapa" && n.papel === "folha"; }).length;
        if (semSub) html += '<div class="muted" style="font-size:11.5px;margin-top:8px">' + semSub + ' etapa(s) sem subetapas: o cronograma detalha até onde a planilha detalha — use <b>+ subetapa</b> na linha da etapa para criar subetapas na planilha.</div>';
      }
      html += this.tabela(r, d, { detalhe: det, abertas: est.abertas, temF: temF && det !== "etapa" });
      html += '<div class="muted" style="font-size:11px;margin-top:6px"><b>Depende de:</b> nº das etapas que precisam terminar antes (ex.: <code>1,3</code>). Vazio = a etapa anterior · <code>0</code> = começa no início da obra · <code>1+7</code> = espera 7 dias úteis depois da 1ª (cura, secagem) · <code>1-3</code> = começa 3 dias antes de a 1ª acabar · sem lag, vale a sobreposição do paralelismo. <b>Duração 0</b> = marco (◆). <b>Folga:</b> quanto a etapa pode atrasar sem mudar a entrega — folga zero é o caminho crítico.' +
        (temF ? '<br><b>Subetapas:</b> com “Detalhar o prazo pelas subetapas” ligado, duração, equipes e “Depende de” das subetapas são editáveis e a etapa passa a durar o vão delas; desligado, elas são desenhadas dentro da duração da etapa (só leitura). “Depende de” da subetapa usa o nº da MESMA etapa: <code>2.1</code>, <code>2.g</code> (serviços gerais da etapa), <code>2.1+3</code> espera, <code>2.1-1</code> avanço, <code>2.1II</code> começa junto (início-início), <code>0</code> = início da etapa. Não há elo entre subetapas de etapas diferentes — o elo entre etapas fica na linha da etapa.' : '') + '</div>';
      html += '<div class="muted" style="font-size:11.5px;margin-top:8px">A planilha Excel do orçamento leva este cronograma por etapa, com fórmulas vivas (aba Gantt).</div>';
      return html;
    },

    /* Motivo pelo qual a duração da ETAPA não se edita (ou null). ⚠ No modo
       executivo a etapa com subetapas dura o vão delas: um número digitado ali
       seria regravado no próximo salvar — a pessoa veria 10 e o PDF sairia
       com 14. A tela deixa só leitura e o handler recusa com o motivo.
       `nos` = r.atividades de Cronograma.estimar(orc, null, {eap:true}) — é
       a `fonte` do nó que diz se o VÃO manda. ⚠ Não basta "tem subetapa"
       (papel resumo): na etapa cujas subetapas são TODAS marco não há vão, o
       motor usa o que se digita nela, e a trava virava trava sem porta com
       recado falso ("é o vão das subetapas (4 dias)") — achado no navegador. */
    motivoEtapaTravada: function (cron, nos, etapaId) {
      if (!(cron && cron.exec && cron.exec.rede === true)) return null;
      var n = null;
      arr(nos).forEach(function (x) { if (x.tipo === "etapa" && x.id === etapaId) n = x; });
      if (!n || n.fonte !== "subetapas") return null;
      return "No modo executivo a duração da etapa " + n.numero + " (" + corta(n.nome, 40) + ") é o vão das subetapas (" + n.duracao + " dias) — edite a duração das subetapas dela, ou desligue “Detalhar o prazo pelas subetapas”. Nada foi gravado.";
    },

    tabela: function (r, d, o) {
      var Cr = C(), det = o.detalhe, L = this.linhas(r, { detalhe: det, abertas: o.abertas }), rede = !!(r.exec && r.exec.rede);
      var iaM = d.iaMotivos || {}, ab = o.abertas || {}, multi = ehData(r.dataInicio) && ehData(r.dataFim) && r.dataInicio.getFullYear() !== r.dataFim.getFullYear();
      var ano = multi ? "" : (ehData(r.dataInicio) ? " (" + r.dataInicio.getFullYear() + ")" : "");
      var numPorId = {}, numF = {}, folhasEt = {}, noEtapa = {};
      r.etapas.forEach(function (e, i) { numPorId[e.id] = i + 1; });
      arr(r.atividades).forEach(function (n) {
        if (n.tipo === "etapa") noEtapa[n.id] = n;
        if (n.numero) numF[n.id] = n.numero;
        if (n.tipo === "subetapa" || n.tipo === "soltos") { if (!own(folhasEt, n.etapaId)) folhasEt[n.etapaId] = []; folhasEt[n.etapaId].push(n); }
      });
      function crit(n) { return '<span class="pill" style="background:#b91c1c14;color:var(--graf-alerta,#b91c1c);font-weight:700" title="Sem folga: atrasar isto atrasa a obra inteira.">crítica</span>'; }
      /* `base` troca a frase padrão da fonte mantendo o MESMO símbolo: no
         orçamento aprovado o ∑ continua valendo (a duração veio das subetapas),
         mas "Duração = vão das subetapas" passaria a mentir — ali o número é o
         do dia da aprovação, não o de hoje. */
      function fonte(f, extra, base) {
        var F = FONTES[f]; if (!F) return "";
        return ' <span class="cx-fonte" title="' + esc((base || F[1]) + (extra ? " — " + extra : "")) + '">' + esc(F[0]) + '</span>';
      }
      var html = '';
      if (o.temF) html += '<div class="flex" style="gap:8px;margin-top:12px;justify-content:flex-end;font-size:12px"><button class="btn sm ghost" data-acao="crono-abrir" data-etapa="*" data-valor="1">Expandir tudo</button><button class="btn sm ghost" data-acao="crono-abrir" data-etapa="*" data-valor="0">Recolher tudo</button></div>';
      html += '<div class="cx-tabela"><table class="tbl cx-eap" style="margin-top:' + (o.temF ? 4 : 12) + 'px"><thead><tr><th>Etapa</th><th>Categoria (agente)</th><th class="num" title="Equipe-dias estimados. Na subetapa, no modo executivo: o nº de equipes trabalhando nela.">Eq-dias</th><th class="num" title="Dias úteis. 0 = marco (entrega, vistoria, liberação): sem barra, um losango no Gantt.">Duração (d)</th>' +
        '<th class="num" title="Nº das etapas que precisam terminar antes desta (ex.: 1,3). Vazio = a anterior; 0 = começa no início da obra. 1+7 = 7 dias úteis depois da 1ª; 1-3 = começa 3 dias antes de a 1ª acabar.">Depende de</th>' +
        '<th class="num" title="Quanto a etapa pode atrasar sem mudar a entrega. Folga zero = caminho crítico.">Folga</th><th>Início' + ano + '</th><th>Fim</th></tr></thead><tbody>';
      L.forEach(function (l) {
        if (l.tipo === "etapa") {
          var e = l.et, i = l.i, no = l.no, c = Cr.cat(e.categoria);
          var valPred = e.predsExplicito ? Cr.predsTexto(e, numPorId) : "";
          /* ⚠ no detalhe "Etapa" a linha vem SEM nó (l.no null): o nó da árvore
             ainda diz a fonte — sem ele o campo da etapa com subetapas saía
             com a caixa azul de "editado", parecia o MAIS editável da tabela, e
             digitar era recusado (achado da revisão da Fase 2) */
          var noEt = no || (own(noEtapa, e.id) ? noEtapa[e.id] : null);
          var resumo = no && no.papel === "resumo";
          // ⚠ trava só onde o VÃO manda (fonte "subetapas"): ver motivoEtapaTravada
          var travada = rede && !!noEt && noEt.fonte === "subetapas";
          var ctrl = "";
          if (no && det !== "etapa") {
            if (resumo || (det === "servico" && no.filhos && no.filhos.length))
              ctrl = '<button class="cx-chev" data-acao="crono-abrir" data-etapa="' + esc(e.id) + '" title="' + (ab[e.id] === false ? 'Expandir' : 'Recolher') + ' esta etapa" aria-expanded="' + (ab[e.id] === false ? 'false' : 'true') + '">' + (ab[e.id] === false ? '▸' : '▾') + '</button>';
            if (!resumo) ctrl += '<button class="cx-detsub" data-acao="crono-detalhar" data-etapa="' + esc(e.id) + '" title="Detalhar em subetapas: abre a planilha para criar uma subetapa nesta etapa. O cronograma detalha até onde a planilha detalha." aria-label="Detalhar em subetapas">+ subetapa</button>';
          }
          var numEap = (no && codNum(e.codigo) !== String(i + 1)) ? '<span class="cx-n">' + (i + 1) + '</span>' : '';
          /* ⚠ APROVADO (12/09/2026): a duração da etapa é a data APROVADA, não
             o vão de hoje (o motor marca `congelado`/`vaoHoje`). Sem separar os
             dois casos, a linha que mostra 6 dias dizia "é o vão das subetapas
             (6 dias)" e o ícone dizia "vão de 15 dia(s)" — dois números
             discordando na mesma linha, e o da proposta não era nenhum deles. */
          var congEt = !!(noEt && noEt.congelado);
          /* ⚠ VÃO ZERO NÃO SE ESCREVE COMO NÚMERO. Com todas as subetapas em
             marco o vão é 0, e "as subetapas hoje dariam 0 dias" se lê como
             defeito do sistema — é o caso da etapa aprovada que a revisão de
             11/09/2026 encontrou caindo no recado errado. */
          var _vh = congEt ? (noEt.vaoHoje != null ? noEt.vaoHoje : e.duracao) : 0;
          var vaoHojeTxt = congEt && _vh === 0
            ? "hoje as subetapas são todas marco — elas não dão vão nenhum"
            : "as subetapas hoje dariam " + _vh + " dia(s)";
          var fonteEt = iaM[e.id] ? ' <span title="🤖 IA: ' + esc(iaM[e.id]) + '" style="cursor:help">' + ic('ia') + '</span>'
            : (noEt && (noEt.fonte === "usuario" || noEt.fonte === "exec" || noEt.fonte === "subetapas")
              ? (congEt && noEt.fonte === "subetapas"
                ? fonte("subetapas", vaoHojeTxt,
                  "Duração = a data aprovada (o vão das subetapas no dia em que o orçamento foi aprovado)")
                : fonte(noEt.fonte, noEt.fonte === "subetapas" ? "vão de " + (noEt.vao != null ? noEt.vao : e.duracao) + " dia(s)" : "")) : "");
          var motivoTrava = congEt
            ? "Orçamento aprovado: esta é a data aprovada (" + e.duracao + " dias) e ela não muda — nem aqui, nem na proposta. " +
              (_vh === 0 ? "Hoje as subetapas são todas marco e não dão vão nenhum" : "As subetapas hoje dariam " + _vh + " dias") +
              "; para trabalhar com outro prazo, crie uma revisão."
            : (travada ? "No modo executivo a duração desta etapa é o vão das subetapas (" + e.duracao + " dias). Edite as subetapas abaixo, ou desligue “Detalhar o prazo pelas subetapas”." : "Dias úteis · 0 = marco");
          // ⚠ `<tr>` puro, data-cron-dur/data-cron-pred e a célula "codigo nome"</td>: ver a regra 1 do cabeçalho
          // ⚠ esc no id: ele vem também de pacote, backup e sincronização (dado de outro aparelho)
          html += '<tr><td class="cx-nome">' + ctrl + numEap + esc(e.codigo) + ' ' + esc(e.nome) + (e.marco ? ' <span class="pill" style="background:#0f172a14;color:#0f172a;font-weight:700;font-size:11px" title="Marco: evento sem duração (entrega, vistoria, liberação).">◆ marco</span>' : '') + '</td>' +
            '<td><span class="pill" style="background:' + c.cor + '22;color:' + c.cor + '">' + esc(c.nome) + '</span></td>' +
            '<td class="num" title="Equipe-dias estimados da etapa">' + nBR(e.equipeDias, 1) + '</td>' +
            '<td class="num"><input class="cell" type="number" min="0" data-cron-dur="' + esc(e.id) + '" value="' + e.duracao + '" title="' + esc(motivoTrava) + '"' + (travada ? ' readonly aria-readonly="true"' : '') + ' style="width:60px;text-align:right' + (travada ? '' : (e.editado || e.marco ? ';border-color:var(--azul,#2563eb)' : '')) + '">' + fonteEt + '</td>' +
            '<td class="num"><input class="cell" type="text" data-cron-pred="' + esc(e.id) + '" value="' + esc(valPred) + '" placeholder="' + (i > 0 ? i : '—') + '" title="Nº das etapas que precisam terminar antes (ex.: 1,3). Vazio = a anterior; 0 = começa no início da obra. 1+7 = espera 7 dias úteis; 1-3 = começa 3 dias antes." style="width:72px;text-align:right' + (e.predsExplicito ? ';border-color:var(--aco,#0d6ebd)' : '') + '"></td>' +
            '<td class="num">' + (e.critico ? crit(e) : '+' + e.folga + ' d') + '</td>' +
            '<td>' + dm(e.dataInicio, multi) + '</td><td>' + dm(e.dataFim, multi) + '</td></tr>';
          return;
        }
        var n = l.no, cat = Cr.cat(n.categoria);
        if (l.tipo === "folha") {
          var irmas = folhasEt[n.etapaId] || [], pos = irmas.indexOf(n), mp = {};
          (n.preds || []).forEach(function (p) { mp[p] = numF[p]; });
          var predTxt = n.predsExplicito ? Cr.predsTextoSub(n, mp) : "";
          var durRede = n.marco ? 0 : (n.duracaoRede != null ? n.duracaoRede : n.duracao);
          var tituloLeitura = "Pela rede das subetapas: " + durRede + " d; desenhada com " + n.duracao + " d dentro da duração da etapa. Só leitura no modo padrão — para a etapa durar o que as subetapas pedem, ligue “Detalhar o prazo pelas subetapas”.";
          /* ⚠ duração DIGITADA na subetapa manda sobre as equipes: o campo
             aceitava 5 e nada acontecia, sem recado — o title diz, e o
             editarFolha devolve o recado ao gravar */
          var durDigF = n.duracaoDigitada != null;
          var celEq = rede
            ? '<input class="cell" type="number" min="1" max="50" data-crono-sub-eq="' + esc(n.id) + '" value="' + (n.equipes || 1) + '" title="' + esc(durDigF
              ? "A duração digitada nesta subetapa (" + n.duracaoDigitada + " d) manda — as equipes só contam depois de apagar a duração. Equipe-dias: " + nBR(n.equipeDias, 1)
              : "Equipes trabalhando nesta subetapa (vazio = as da obra). Equipe-dias: " + nBR(n.equipeDias, 1)) + '" style="width:44px;text-align:right' + (durDigF ? ';opacity:.6' : '') + '"><span class="muted" style="font-size:10px"> eq.</span>'
            : '<span title="' + esc("Equipe-dias: " + nBR(n.equipeDias, 1) + " · equipes: " + (n.equipes || 1)) + '">' + nBR(n.equipeDias, 1) + '</span>';
          var celDur = rede
            ? '<input class="cell" type="number" min="0" data-crono-sub-dur="' + esc(n.id) + '" value="' + durRede + '" title="Dias úteis da subetapa · 0 = marco · vazio = volta à estimativa" style="width:56px;text-align:right' + (n.editado || n.marco ? ';border-color:var(--azul,#2563eb)' : '') + '">' + fonte(n.fonte === "estimado" ? "" : n.fonte)
            : '<span title="' + esc(tituloLeitura) + '">' + n.duracao + (n.escala === "escalada" && durRede !== n.duracao ? ' <span class="muted" style="font-size:10.5px">(rede ' + durRede + ')</span>' : '') + '</span>' + fonte(n.fonte === "estimado" ? "" : n.fonte);
          var celPred = rede
            ? '<input class="cell" type="text" data-crono-sub-pred="' + esc(n.id) + '" value="' + esc(predTxt) + '" placeholder="' + (pos > 0 ? esc(irmas[pos - 1].numero) : '—') + '" title="Nº de subetapas da MESMA etapa: 2.1, 2.g; 2.1+3 espera; 2.1-1 avanço; 2.1II começa junto; 0 = início da etapa; vazio = a anterior." style="width:96px;text-align:right' + (n.predsExplicito ? ';border-color:var(--aco,#0d6ebd)' : '') + '">'
            : '<span class="muted" title="Só leitura no modo padrão">' + esc((n.preds && n.preds.length) ? Cr.predsTextoSub(n, mp) : "início") + '</span>';
          html += '<tr class="cx-f"><td class="cx-nome"><span style="padding-left:22px"></span><span class="cx-n">' + esc(n.numero) + '</span>' + esc(n.nome) +
            (n.marco ? ' <span class="pill" style="font-size:10.5px">◆ marco</span>' : '') +
            (n.comprimida ? ' <span title="A etapa é curta demais para as subetapas: no desenho elas se sobrepõem além do que a rede pede." style="color:#b45309;cursor:help">⚠</span>' : '') +
            (n.cicloDep ? ' <span title="Dependência circular entre subetapas — o elo de volta foi ignorado." style="color:#b45309;cursor:help">⟲</span>' : '') + '</td>' +
            '<td><span class="pill" style="background:' + cat.cor + '22;color:' + cat.cor + ';font-size:11px">' + esc(cat.nome) + '</span></td>' +
            '<td class="num">' + celEq + '</td><td class="num">' + celDur + '</td><td class="num">' + celPred + '</td>' +
            '<td class="num">' + (n.critico ? crit(n) : '+' + (n.folga || 0) + ' d') + '</td>' +
            '<td>' + dm(n.dataInicio, multi) + '</td><td>' + dm(n.dataFim, multi) + '</td></tr>';
          return;
        }
        // serviço: sempre só leitura (a duração dele é a parte da janela da subetapa)
        var sb = n.semBase || n.inicio == null;
        html += '<tr class="cx-s"><td class="cx-nome" title="' + esc((n.codigo ? n.codigo + " · " : "") + n.nome) + '"><span style="padding-left:' + (n.prof >= 2 ? 44 : 22) + 'px"></span><span class="cx-n">' + esc(n.numero) + '</span>' + esc(corta(n.nome, 110)) + (sb ? ' <span class="muted" style="font-size:10.5px">(sem quantidade)</span>' : '') + '</td>' +
          '<td><span style="font-size:11px">' + esc(cat.nome) + '</span></td>' +
          '<td class="num">' + nBR(n.equipeDias || 0, 1) + '</td>' +
          '<td class="num" title="Parte da janela da subetapa, pelo peso em equipe-dias. Só leitura.">' + (sb ? '—' : n.duracao) + fonte(n.fonte) + '</td>' +
          '<td class="num">—</td><td class="num" title="Herdada da subetapa">—</td>' +
          '<td>' + (sb ? '—' : dm(n.dataInicio, multi)) + '</td><td>' + (sb ? '—' : dm(n.dataFim, multi)) + '</td></tr>';
      });
      return html + '</tbody></table></div>';
    },

    /* ------------------------------------------------------------------
       FÍSICO-FINANCEIRO. Nível ETAPA = Orcamento.cronograma (a MESMA função
       da aba Relatórios, com o estouro e o recado dela — d.fisicoEtapa vem
       do ui.js). Camadas subetapa/serviço = Cronograma.periodos por camada,
       com VALOR DE VENDA obrigatório e o rótulo de que mês a mês pode
       diferir do desembolso da proposta (é matemática, não defeito).
       ------------------------------------------------------------------ */
    fisico: function (d, est) {
      var camada = est.ff.camada, modo = est.ff.modo, r = d.r;
      var html = '<div class="flex" style="gap:12px;margin-bottom:10px;align-items:center;flex-wrap:wrap"><span class="muted" style="font-size:12.5px">Distribuir por:</span><span class="cx-seg">';
      [["etapa", "Etapa"], ["folha", "Subetapa"], ["servico", "Serviço"]].forEach(function (k) {
        html += '<button class="' + (camada === k[0] ? 'on' : '') + '" data-acao="crono-ff" data-camada="' + k[0] + '">' + k[1] + '</button>';
      });
      html += '</span><span class="cx-seg">' +
        '<button class="' + (modo === 'valor' ? 'on' : '') + '" data-acao="crono-ff" data-modo="valor">R$</button>' +
        '<button class="' + (modo === 'pct' ? 'on' : '') + '" data-acao="crono-ff" data-modo="pct">%</button></span></div>';
      if (camada === "etapa") return html + (d.fisicoEtapa ? d.fisicoEtapa(modo) : '<div class="vazio card">Físico-financeiro por etapa indisponível.</div>');
      return html + this.fisicoCamada(d, camada, modo);
    },

    fisicoCamada: function (d, camada, modo) {
      var Cr = C(), r = d.r, nomeC = camada === "folha" ? "subetapa" : "serviço";
      function aviso(t) { return '<div class="cx-aviso">' + t + '</div>'; }
      if (!ehArr(r.atividades) || (r.exec && r.exec.erro))
        return aviso("A distribuição por " + nomeC + " precisa da árvore do cronograma, que não pôde ser montada" + (r.exec && r.exec.erro ? ": " + esc(r.exec.erro) : "") + ". A distribuição por etapa continua valendo.");
      if (!d.valores || d.valores.ok !== true)
        return aviso("A distribuição por " + nomeC + " usa o <b>valor de venda</b> de cada " + nomeC + ", e ele não pôde ser calculado" +
          (d.valores && d.valores.motivo ? ": " + esc(d.valores.motivo) : "") + ". Custo direto não é mostrado no lugar. A distribuição por etapa continua valendo.");
      var per;
      try { per = Cr.periodos(r, { camada: camada, valores: d.valores }); } catch (e) { per = { erro: String((e && e.message) || e) }; }
      if (per.erro) return aviso(esc(per.erro));
      var lista = arr(per.lista), total = per.total || 0, porNo = per.porNo || {};
      if (!lista.length) return aviso("Sem data de início válida — não há meses para distribuir.");
      function cel(v) {
        if (modo === "pct") return total ? pct((v / total) * 100, 1) : "—";
        return Math.abs(v) > 0.005 ? moeda(v) : "—";
      }
      var html = '<div class="muted" style="font-size:11.5px;margin:0 0 8px">' + ic('cronograma') + ' ' + esc(per.rotulo || "") +
        '. O desembolso de registro (proposta, contrato, Portal do cliente) continua por <b>etapa</b>.</div>';
      html += '<div class="cx-tabela"><table class="tbl cx-ff"><thead><tr><th>' + (camada === "folha" ? "Subetapa" : "Serviço") + '</th>';
      lista.forEach(function (p) { html += '<th class="num">' + esc(p.rotulo) + '</th>'; });
      html += '<th class="num">Total</th></tr></thead><tbody>';
      var etAtual = null, nEt = {};
      r.etapas.forEach(function (e, i) { nEt[e.id] = (i + 1) + " " + (e.nome || ""); });
      arr(r.atividades).forEach(function (n) {
        if (!own(porNo, n.id)) return;
        if (n.etapaId !== etAtual && !(n.tipo === "etapa")) {
          etAtual = n.etapaId;
          html += '<tr class="cx-grupo"><td colspan="' + (lista.length + 2) + '">' + esc(corta(nEt[n.etapaId] || "", 90)) + '</td></tr>';
        } else if (n.tipo === "etapa") etAtual = n.etapaId;
        var col = porNo[n.id], soma = 0;
        col.forEach(function (v) { soma += v; });
        var rot = (n.numero ? n.numero + " " : "") + (n.nome || "");
        html += '<tr><td title="' + esc(rot) + '">' + esc(corta(rot, 70)) + '</td>';
        col.forEach(function (v) { html += '<td class="num">' + cel(v) + '</td>'; });
        html += '<td class="num"><b>' + cel(soma) + '</b></td></tr>';
      });
      html += '</tbody><tfoot><tr class="etapa-row"><td>Total mensal</td>';
      var picoV = null;
      lista.forEach(function (p) { html += '<td class="num">' + cel(p.valor) + '</td>'; if (!picoV || p.valor > picoV.valor) picoV = p; });
      html += '<td class="num">' + cel(total) + '</td></tr><tr><td class="muted">Acumulado %</td>';
      lista.forEach(function (p) { html += '<td class="num muted">' + pct(p.acumPct, 1) + '</td>'; });
      html += '<td class="num muted">' + pct(total ? 100 : 0, 0) + '</td></tr><tr><td class="muted" title="Dias-equipe do mês ÷ dias úteis do mês. É o nº de FRENTES abertas ao mesmo tempo, não o nº de pessoas.">Frentes (média do mês)</td>';
      lista.forEach(function (p) { html += '<td class="num muted">' + (p.frentes || 0) + '</td>'; });
      html += '<td></td></tr></tfoot></table></div>';
      html += '<div class="muted" style="font-size:11.5px;margin-top:6px">' +
        /* ⚠ "maior desembolso" é o nome do pico do desembolso de REGISTRO (por
           etapa, o da proposta); aqui é outra distribuição e o pico pode cair
           em outro mês (medido: dez/26 aqui × set/26 lá) — o rótulo diz qual */
        (picoV ? 'Mês de maior valor nesta distribuição por ' + nomeC + ': <b>' + esc(picoV.rotulo) + '</b> (' + cel(picoV.valor) + ') — o desembolso de registro, por etapa, pode ter o pico em outro mês. ' : '') +
        (per.mesPico ? 'Pico de frentes: <b>' + esc(per.mesPico.rotulo) + '</b> (' + per.mesPico.frentes + ' frente(s) em média) — frentes = dias-equipe ÷ dias úteis, não é número de pessoas.' : '') + '</div>';
      return html;
    },

    /* ------------------------------------------------------------------
       PARÂMETROS (avançados). ⚠ Nada aqui é regravado pelo "Recalcular" do
       cartão da sub-aba Cronograma: aquele botão grava só os inputs que
       existem na tela (Cronograma.mesclarParams), e os daqui só existem
       aqui. Os parâmetros novos moram em `exec` (fora de `params`), porque o
       Recalcular das versões ANTIGAS substitui `params` inteiro (I5).
       ------------------------------------------------------------------ */
    parametros: function (d, est) {
      var r = d.r, p = r.params || {}, ex = d.exec || {}, rede = ex.rede === true;
      var temF = ehArr(r.atividades) && this.temFolhas(r);
      var paralObra = Math.round(((p.paralelismo != null ? p.paralelismo : 0.15) || 0) * 100);
      function opt(v, txt, sel) { return '<option value="' + v + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + txt + '</option>'; }
      var parSub = (ex.paralelismoSub != null && ex.paralelismoSub !== "") ? ex.paralelismoSub : "";
      var html = '<div class="card cx-card"><h4>Modo executivo</h4>';
      if (!temF) {
        html += '<p class="muted" style="font-size:12.5px;margin:0">A planilha deste orçamento não tem subetapas — o cronograma fica por etapa. O cronograma detalha até onde a planilha detalha: crie subetapas na aba Planilha (ou pelo <b>+ subetapa</b> na linha da etapa, sub-aba Cronograma).</p>';
      } else {
        html += '<div class="flex" style="gap:12px;align-items:center;flex-wrap:wrap">' + this.interruptor(r) + '</div>' +
          '<p class="muted" style="font-size:12.5px;margin:8px 0 0">' + (rede
            ? '<b>Ligado:</b> a duração de cada etapa com subetapas é o vão da rede das subetapas — e é esse prazo que vai ao PDF, à proposta, ao desembolso e à versão antiga do app (fica gravado na etapa com a marca ∑).'
            : '<b>Desligado:</b> as subetapas são desenhadas dentro da duração de cada etapa (só visual). Ao ligar, você vê o prazo antes → depois e confirma — nada é gravado sem isso.') + '</p>';
      }
      html += '</div>';
      html += '<div class="card cx-card"><h4>Subetapas e acompanhamento</h4><div class="flex" style="gap:14px;flex-wrap:wrap;align-items:flex-end">' +
        '<div class="field" style="margin:0"><label title="Quanto uma subetapa começa antes de a anterior da mesma etapa terminar (cascata padrão). Vale só entre subetapas.">Paralelismo entre subetapas</label><select id="cronx-parsub">' +
          opt("", "igual ao da obra (" + paralObra + "%)", parSub) + opt(0, "Nenhum", parSub) + opt(0.15, "Leve 15%", parSub) + opt(0.3, "Médio 30%", parSub) + opt(0.5, "Alto 50%", parSub) + '</select></div>' +
        '<div class="field" style="margin:0"><label title="Diferença, em pontos percentuais, entre executado e previsto que ainda conta como “no prazo”.">Tolerância (p.p.)</label><input id="cronx-tol" type="number" min="0.1" max="50" step="0.5" value="' + (Number(ex.toleranciaPP) > 0 ? ex.toleranciaPP : 1) + '" style="width:80px"></div>' +
        '<div class="field" style="margin:0"><label title="Com que detalhe a aba abre neste orçamento. Trocar o detalhe na sub-aba Cronograma não grava nada.">Detalhe padrão da aba</label><select id="cronx-detalhe">' +
          opt("etapa", "Etapa", ex.detalhe || "subetapa") + opt("subetapa", "Subetapa", ex.detalhe || "subetapa") + opt("servico", "Serviço", ex.detalhe || "subetapa") + '</select></div>' +
        '<div class="field" style="margin:0"><label>Pontos facultativos</label><label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer" title="Carnaval e Corpus Christi são ponto facultativo, mas param a maioria das obras. Desmarque se a sua obra trabalha nesses dias.">' +
          '<input id="cron-facult" type="checkbox"' + (p.feriadosFacultativos !== false ? ' checked' : '') + '> contar como dia parado</label></div>' +
        '<button class="btn sm primary" data-acao="crono-params">Salvar parâmetros</button></div>' +
        '<p class="muted" style="font-size:11.5px;margin:8px 0 0">A tolerância vale para o previsto × realizado da obra (Gestão de Obras). Os pontos facultativos só contam com “Feriados: descontar” ligado no cartão da sub-aba Cronograma.</p></div>';
      html += '<div class="card cx-card"><h4>De onde vêm os números</h4><ul class="cx-lista">' +
        '<li><b>R$/dia-equipe: ' + moeda(p.custoDiaEquipe || 700) + '</b> — informado por você (cartão da sub-aba Cronograma). Converte custo de mão de obra em equipe-dias quando o serviço não tem categoria.</li>' +
        '<li><b>Jornada: ' + (d.jornada != null ? esc(d.jornada) + ' h/dia' : 'a da aba Execução') + '</b> — da aba Execução, que transforma o Hh SINAPI em duração (<a role="button" tabindex="0" style="cursor:pointer;text-decoration:underline" data-aba="execucao">abrir Execução</a>).</li>' +
        '<li><b>Produtividade por categoria</b> — heurística do agente (≈ na tabela); a duração digitada por você (✎), pela IA ou pelo Hh da Execução (Hh) manda sobre ela.</li></ul></div>';
      html += '<div class="card cx-card"><h4>Não modelado nesta versão</h4><ul class="cx-lista">' +
        '<li>Sábado meio período (6 dias/semana conta o sábado inteiro).</li><li>Turnos.</li>' +
        '<li>Restrição de data (“não iniciar antes de”) — a data sai da rede.</li>' +
        '<li>Término-término e início-término (há término-início com espera/avanço, e início-início só entre subetapas).</li>' +
        '<li>Dependência entre subetapas de etapas diferentes — o elo entre etapas fica na linha da etapa.</li></ul></div>';
      return html;
    },

    /* Campos de `exec` que o formulário de Parâmetros tem NA TELA (el(id)
       devolve o elemento ou null). Chave ausente = input ausente (conserva o
       gravado); null = apagar a chave (volta ao padrão). `rede` nunca vem
       daqui: só pelo interruptor, que mostra o antes → depois. */
    execDoForm: function (el) {
      var f = {}, x;
      x = el("cronx-parsub");
      if (x) { var v = String(x.value == null ? "" : x.value).trim(); f.paralelismoSub = v === "" ? null : Math.max(0, Math.min(0.9, numTxt(v) || 0)); }
      x = el("cronx-tol");
      if (x) { var t = numTxt(x.value); f.toleranciaPP = t > 0 ? Math.min(50, t) : null; }
      x = el("cronx-detalhe");
      if (x) f.detalhe = DETALHES.indexOf(x.value) > -1 ? x.value : null;
      return f;
    },
    mesclarExec: function (atual, doForm) {
      var out = {}, k;
      if (atual && typeof atual === "object" && !ehArr(atual)) for (k in atual) if (own(atual, k)) out[k] = atual[k];
      if (doForm) for (k in doForm) if (own(doForm, k) && k !== "rede") { if (doForm[k] === null) delete out[k]; else if (doForm[k] !== undefined) out[k] = doForm[k]; }
      return out;
    },

    /* ------------------------------------------------------------------
       EDIÇÃO DE UMA FOLHA (subetapa ou "serviços gerais") pela tabela —
       a DECISÃO pura; o app.js só chama isto no alvo único (App._cronoAlvo)
       e salva. `nos` = Cronograma.eap(orc). Muta `cron` só quando ok.
       ⚠ Só no modo executivo: no padrão a folha é desenhada dentro da
       duração da etapa, e a pessoa digitaria 10 e veria 4.
       ⚠ Inválido NUNCA vira "sem predecessora" nem "1 dia": nada é gravado
       e a tela devolve o valor anterior (como a etapa faz hoje).
       Devolve {ok, mudou, msg?}.
       ------------------------------------------------------------------ */
    editarFolha: function (cron, nos, campo, id, valor) {
      var Cr = C(), no = null;
      arr(nos).forEach(function (n) { if (n.id === id && (n.tipo === "subetapa" || n.tipo === "soltos")) no = n; });
      if (!no) return { ok: false, mudou: false, msg: "Essa subetapa não existe mais neste orçamento — nada foi gravado. A tela foi atualizada." };
      if (!(cron && cron.exec && cron.exec.rede === true))
        return { ok: false, mudou: false, msg: "As subetapas só se editam com “Detalhar o prazo pelas subetapas” ligado (aba Cronograma). No modo padrão elas são desenhadas dentro da duração da etapa — nada foi gravado." };
      if (!cron.sub || typeof cron.sub !== "object" || ehArr(cron.sub)) cron.sub = {};
      var sub = cron.sub;
      function mapa(k) { if (!sub[k] || typeof sub[k] !== "object" || ehArr(sub[k])) sub[k] = {}; return sub[k]; }
      var antes = JSON.stringify(sub), s = String(valor == null ? "" : valor).trim(), nome = no.numero + " (" + corta(no.nome, 40) + ")";
      if (campo === "dur") {
        var n = numTxt(s);
        if (s !== "" && (isNaN(n) || n < 0 || n > 999)) return { ok: false, mudou: false, msg: "“" + s + "” não é duração válida para a subetapa " + nome + " — use dias úteis de 1 a 999 (0 = marco; vazio = volta à estimativa). Nada foi gravado." };
        var dur = mapa("duracoes"), mc = mapa("marcos");
        if (s === "") { delete dur[id]; delete mc[id]; }
        else if (n === 0) { mc[id] = true; delete dur[id]; }
        else { dur[id] = Math.max(1, Math.round(n)); delete mc[id]; }
        // virou decisão do USUÁRIO: a marca de agente e o motivo da IA saem
        if (sub.agente && typeof sub.agente === "object") delete sub.agente[id];
        if (sub.iaMotivos && typeof sub.iaMotivos === "object") delete sub.iaMotivos[id];
      } else if (campo === "pred") {
        var irmas = [];
        arr(nos).forEach(function (x) { if ((x.tipo === "subetapa" || x.tipo === "soltos") && x.etapaId === no.etapaId) irmas.push({ id: x.id, numero: x.numero }); });
        var pr = Cr.parsePredsSub(s, irmas, id);
        if (pr.invalidos.length) return { ok: false, mudou: false, msg: "“" + pr.invalidos.join(", ") + "” não é subetapa válida em “Depende de” da " + nome +
          " — use o nº de outra subetapa da MESMA etapa (" + irmas.filter(function (x) { return x.id !== id; }).map(function (x) { return x.numero; }).join(", ") + "); 0 = início da etapa; espera 2.1+3, avanço 2.1-1, começa junto 2.1II. Nada foi gravado." };
        var pc = mapa("predecessoras"), lc = mapa("lags"), tc = mapa("tipos");
        if (pr.preds === null) { delete pc[id]; delete lc[id]; delete tc[id]; }
        else {
          pc[id] = pr.preds;
          if (Object.keys(pr.lags).length) lc[id] = pr.lags; else delete lc[id];
          if (Object.keys(pr.tipos).length) tc[id] = pr.tipos; else delete tc[id];
        }
      } else if (campo === "eq") {
        var q = numTxt(s);
        if (s !== "" && (isNaN(q) || q < 1 || q > 50 || Math.round(q) !== q)) return { ok: false, mudou: false, msg: "“" + s + "” não é nº de equipes válido para a subetapa " + nome + " — use um inteiro de 1 a 50 (vazio = as equipes da obra). Nada foi gravado." };
        var eq = mapa("equipes");
        if (s === "") delete eq[id]; else eq[id] = q;
        /* ⚠ gravou, mas NÃO muda o prazo enquanto houver duração digitada na
           subetapa (a duração manda sobre as equipes): sem o recado, o campo
           mostrava 5 e o prazo ficava igual — a pessoa achava que tinha valido */
        var dg = sub.duracoes && typeof sub.duracoes === "object" && own(sub.duracoes, id) ? sub.duracoes[id] : null;
        if (s !== "" && dg != null && JSON.stringify(sub) !== antes)
          return { ok: true, mudou: true, msg: "Equipes gravadas (" + q + ") na subetapa " + nome + ", mas a duração digitada nela (" + dg + " d) continua mandando — apague a duração da subetapa para o prazo sair das equipes." };
      } else return { ok: false, mudou: false, msg: "campo desconhecido: " + campo };
      return { ok: true, mudou: JSON.stringify(sub) !== antes };
    },

    /* ------------------------------------------------------------------
       ALVO DAS EDIÇÕES — a DECISÃO pura do App._cronoAlvo (espec 3.2).
       p = {info (obraDaCadeia + podeGestao), travado (orçamento aprovado),
       escolha (obraId da tela, com várias obras), editaPlano (tela; só vale
       sem aprovação), lista (entidade crono_obra), CronoBase}.
       Devolve {tipo:"orc"|"plano", travado, obra, nivel, plano, multi, opcoes}.
       ⚠ O plano só é alvo com a obra ligada A ESTE orçamento (nivel 0): obra
         numa revisão anterior se PASSA antes (esta revisão pode ter outras
         quantidades), e com várias obras sem escolha nada vai para plano
         nenhum — a ordem da lista não decide qual obra se replaneja.
       ------------------------------------------------------------------ */
    decidirAlvo: function (p) {
      p = p || {};
      var info = p.info || {}, obs = arr(info.obras), a = null;
      /* `aprovado` guarda o estado REAL do orçamento: `travado` vira false quando
         o alvo é o plano (a aba destrava), e a faixa precisava saber que a
         proposta continua aprovada para não oferecer [Proposta] mudo */
      var out = { tipo: "orc", travado: !!p.travado, aprovado: !!p.travado, obra: null, nivel: null, plano: null, planoAlheio: null, multi: false, opcoes: [] };
      if (!info.podeGestao) return out;
      if (obs.length === 1) a = obs[0];
      else if (obs.length > 1) {
        obs.forEach(function (x) { if (p.escolha != null && p.escolha !== "" && x && x.obra && String(x.obra.id) === String(p.escolha)) a = x; });
        if (!a) { out.multi = true; out.opcoes = obs; return out; }
      }
      if (!a || !a.obra) return out;
      out.obra = a.obra; out.nivel = a.nivel;
      if (a.nivel !== 0) return out;
      var CB = p.CronoBase, pl = (CB && typeof CB.plano === "function") ? CB.plano(p.lista, a.obra.id) : null;
      /* ⚠ PLANO DE OUTRO ORÇAMENTO (revisão 3, lente sync): a obra religada pelo
         cadastro a um orçamento de fora da cadeia de revisões ficava editando o
         plano copiado do orçamento antigo — durações gravadas em ids de etapa
         que este orçamento não tem, e o [Iniciar plano] recusado ("já existe").
         Esse plano não é alvo: a faixa oferece reiniciá-lo a partir daqui. */
      var cadIds = arr(info.cadeiaIds);
      if (pl && pl.orcamentoId && cadIds.length && cadIds.indexOf(String(pl.orcamentoId)) < 0) { out.planoAlheio = pl; pl = null; }
      out.plano = pl || null;
      if (pl && (p.travado || p.editaPlano === true)) { out.tipo = "plano"; out.travado = false; }
      return out;
    },

    /* os números da obra no CHIP da faixa: executado × previsto, base vN e
       IDP — ⚠ o IDP SÓ COM BASE (sem ela ele muda a cada edição do plano e
       chega perto de 1 sozinho depois de reprogramar). As três réguas vão no
       title, cada uma com o rótulo dela. HTML com todo dado escapado. */
    _chipMontar: function (p, lead) {
      if (!p || !p.kpis) return { txt: "", porta: "", titulo: "" };
      if (!p.estado || (p.erro && !own(PR_OK, p.estado))) return { txt: '<span class="muted" title="' + esc(p.erro || "") + '">' + lead + 'previsto × realizado indisponível</span>', porta: "", titulo: String(p.erro || "") };
      var K = p.kpis, ex = K.executadoOrcamento || {}, pv = K.previstoNaData, partes = [], tit = [];
      /* ⚠ O PAR QUE SE COMPARA É DA MESMA RÉGUA (revisão 3, lente dinheiro).
         O chip juntava o "executado sobre o orçamento" (cada serviço pelo valor
         de HOJE) com o previsto (cada subetapa pelo valor da BASE): depois de
         uma revisão de quantidades saía "executado 17,1% × previsto 60%" — 43
         pontos de atraso quando a comparação que vale (a do IDP e da situação)
         dava 33,3% × 60%. Com previsto, o executado do chip é o da régua dele
         (`previstoNaData.realPct`); o outro número vai no title, rotulado. */
      var exCmp = (pv && pv.pct != null && pv.realPct != null) ? pv.realPct : ex.pct;
      partes.push("executado " + pctOu(exCmp) + (pv && pv.pct != null ? " × previsto " + pctOu(pv.pct) : ""));
      partes.push(p.base ? "base v" + p.base.versao : (p.baseAlheia ? "base v" + p.baseAlheia.versao + " de outro orçamento" : "sem linha de base"));
      if (p.base && K.idp && K.idp.valor != null) partes.push("IDP " + nBR(K.idp.valor, 2));
      if (exCmp !== ex.pct && pv) tit.push("executado na régua do previsto (" + (pv.rotulo || "previsto na data").replace(/^Previsto na data /, "") + "): " + pctOu(exCmp));
      tit.push((ex.rotulo || "Executado sobre o orçamento") + ": " + pctOu(ex.pct));
      if (K.portal) tit.push((K.portal.rotulo || "no Portal do cliente") + ": " + pctOu(K.portal.pct));
      if (K.medido) tit.push((K.medido.rotulo || "Medido") + ": " + pctOu(K.medido.pct, 0));
      if (pv) tit.push((pv.rotulo || "Previsto na data") + ": " + pctOu(pv.pct));
      if (p.dataCorte) tit.push("data de corte: " + dmaS(p.dataCorte));
      var h = '<span title="' + esc(tit.join(" · ")) + '">' + lead + esc(partes.join(" · ")) + '</span>';
      // "Início: obra dd/mm (a proposta dizia dd/mm)": a frase do painel, sem o resto
      // "Início: obra dd/mm (a proposta dizia dd/mm)" e "Término: cadastro da obra dd/mm": a 1ª metade da frase do painel
      arr(p.avisos).forEach(function (a) { if (a && (a.tipo === "inicio-diverge" || a.tipo === "termino-diverge")) { h += ' <span class="muted" title="' + esc(a.msg) + '">· ' + esc(String(a.msg || "").split(/ — |; /)[0]) + '</span>'; tit.push(String(a.msg || "")); } });
      var obI = p.obra || {}, porta = "";
      if (obI.id != null && obI.id !== "" && !obI.inicio) porta = '<button class="btn sm" data-gopen="obras:' + esc(obI.id) + '" title="Informar início da obra — ela não tem data de início, e é dela que o plano, a linha de base e o previsto contam">Informar início</button>';
      return { txt: h, porta: porta, titulo: tit.join(" · ") };
    },
    /* o chip num HTML só (texto + porta), como sempre foi */
    chipNumeros: function (p) { var c = this._chipMontar(p, "· "); return c.txt + (c.porta ? " " + c.porta : ""); },
    /* as partes, para a faixa: o TEXTO encolhe com reticências, a PORTA não */
    chipPartes: function (p) { return this._chipMontar(p, ""); },

    /* ------------------------------------------------------------------
       PREVISTO × REALIZADO DA OBRA — o desenho do CronoPlan.montarPainel.
       UM desenho para os três lugares (espec 3.2; adendo A2):
         {compacto:true} — aba "cronograma" da FICHA DA OBRA: as réguas, base e
                           data, mini-curva, até 5 nós em atenção, [Congelar]/
                           [Reprogramar] e [Abrir cronograma completo];
         {completo:true} — sub-aba do orçamento e módulo "Cronograma da obra":
                           + seletor de data de corte, curva S, Gantt com a base
                           fantasma, tabela por nó e o que ficou fora da conta.
       dados = {painel (saída do montarPainel), r? (o plano atual com a árvore,
       para o Gantt — App._cronoPainelDados com comGantt), bases, podeEditar,
       podeMedicoes}. opts.origem "obra" acrescenta [Abrir cronograma no
       orçamento]. Estado de tela (data de corte) mora no App, nunca aqui.
       ⚠ AS TRÊS RÉGUAS LADO A LADO E ROTULADAS (memória "seis réguas para o
         avanço"): o engenheiro responde ao cliente que liga com o número da
         tela DELE — e o Portal mostra outro. Esconder uma é criar a pergunta
         sem resposta.
       ⚠ Todo texto de dado passa por esc: nome de obra e de subetapa, motivo
         e aviso vêm de outro aparelho pela nuvem.
       ------------------------------------------------------------------ */
    painelPR: function (dados, opts) {
      dados = dados || {}; opts = opts || {};
      var p = dados.painel || {}, K = p.kpis || {}, comp = !!opts.compacto && !opts.completo;
      var ob = p.obra || dados.obra || {}, obId = ob.id != null ? String(ob.id) : "";
      var html = '<style>' + CSS_PR + '</style><div class="cx-pr ' + (comp ? 'cx-pr-comp' : 'cx-pr-full') + '" data-cx-pr="' + esc(obId) + '">';
      if (!p.estado || (p.erro && !own(PR_OK, p.estado))) {
        return html + '<div class="cx-aviso">' + esc(p.erro || "O previsto × realizado desta obra não pôde ser montado.") + '</div>' + this._prAcoes(p, dados, opts, comp, true) + '</div>';
      }
      var eixo = arr(p.curva && p.curva.eixo), multi = eixo.length > 1 && String(eixo[0]).slice(0, 4) !== String(eixo[eixo.length - 1]).slice(0, 4);
      // CABEÇALHO: de onde vêm os números (plano, linha de base, data de corte)
      var cab = [];
      if (!opts.semNomeObra) cab.push('Obra <b>' + esc(corta(ob.nome || "sem nome", 48)) + '</b>');
      if (p.orcamento) cab.push('orçamento ' + esc(p.orcamento.numero || ""));
      cab.push(p.plano && p.plano.fonte === "plano" ? 'plano de execução da obra' + (p.plano.atualizadoEm ? ' <span class="muted">(gravado ' + esc(dmaS(p.plano.atualizadoEm)) + ')</span>' : '') : 'plano: cronograma do orçamento');
      cab.push(p.base ? 'linha de base <b>v' + esc(p.base.versao) + '</b> de ' + esc(dmaS(p.base.criadaEm)) + (p.base.motivo ? ' <span class="muted">— ' + esc(corta(p.base.motivo, 80)) + '</span>' : '') : '<b>sem linha de base</b>');
      var FCo = { informada: "escolhida", ultimoDiario: "último diário publicado", hoje: "hoje — nenhum diário publicado" }, fc = FCo[p.fonteCorte] || "";
      if (comp || !obId) cab.push('até <b>' + esc(dmaS(p.dataCorte)) + '</b>' + (fc ? ' <span class="muted">(' + fc + ')</span>' : ''));
      else cab.push('<label style="display:inline-flex;gap:6px;align-items:center;font-weight:400">Data de corte <input type="date" data-crono-corte="' + esc(obId) + '" value="' + esc(p.dataCorte || "") +
        '" title="O dia que os números descrevem: executado, Portal e previsto saem todos desta data. Apague para voltar ao último diário publicado." style="width:140px"></label>' + (fc ? '<span class="muted">(' + fc + ')</span>' : ''));
      html += '<div class="cx-pr-cab">' + cab.join('<span class="muted">·</span>') + '</div>';
      html += this._prKpis(p, dados, comp);
      var avs = arr(p.avisos);
      if (avs.length) {
        var lim = comp ? 3 : 12;
        html += '<div class="cx-aviso"><ul class="cx-lista" style="margin:0">';
        avs.slice(0, lim).forEach(function (a) { html += '<li>' + esc(a && a.msg) + '</li>'; });
        if (avs.length > lim) html += '<li>e mais ' + (avs.length - lim) + ' aviso(s)' + (comp ? ' — veja no cronograma completo' : '') + '</li>';
        html += '</ul></div>';
      }
      if (comp) {
        html += this.curvaS(p.curva, { mini: true });
        var at = arr(p.atencao);
        if (at.length) {
          html += '<div class="cx-pr-sec"><b>Pedem atenção</b> <span class="muted">(até 5, da mais atrasada)</span></div><ul class="cx-lista cx-pr-atencao">';
          at.slice(0, 5).forEach(function (n) { html += '<li><span class="cx-n">' + esc(n.numero) + '</span>' + esc(corta(n.nome, 60)) + ' — previsto ' + pctOu(n.previstoPct) + ', real ' + pctOu(n.realPct) + ' (' + esc(ppTxt(n.desvioPP)) + ')</li>'; });
          html += '</ul>';
        } else if (p.estado === "ok" && K.situacao) html += '<div class="muted" style="font-size:12px;margin-top:6px">Nenhuma subetapa atrasada nesta data.</div>';
        return html + this._prAcoes(p, dados, opts, comp, false) + '</div>';
      }
      html += '<div class="cx-pr-sec"><b>Curva S</b> <span class="muted">— acumulado mensal, % do valor de venda</span></div>' + this.curvaS(p.curva, {});
      var r = dados.r;
      if (r && arr(r.atividades).length) {
        var mB = {}, mR = {};
        arr(p.nos).forEach(function (n) {
          if (n.base && n.base.ini) mB[n.id] = { ini: n.base.ini, fim: n.base.fim || n.base.ini };
          if (n.realPct != null) mR[n.id] = n.realPct;
        });
        html += '<div class="cx-pr-sec"><b>Gantt</b> <span class="muted">— barra = plano atual' + (p.base ? '; tracejado = linha de base v' + esc(p.base.versao) : '') + '; faixa escura = executado; linha laranja = data de corte</span></div>' +
          this.gantt(r, { detalhe: "subetapa", base: p.base ? mB : null, realizado: mR, hoje: p.dataCorte || null, rotHoje: "data de corte" });
      }
      html += this._prTabela(p, multi) + this._prFora(p, dados);
      return html + this._prAcoes(p, dados, opts, comp, false) + '</div>';
    },
    _prKpis: function (p, dados, comp) {
      var K = p.kpis || {}, ex = K.executadoOrcamento || {}, po = K.portal || {}, me = K.medido || {}, pv = K.previstoNaData, idp = K.idp;
      /* ⚠ SEM DINHEIRO (dados.semDinheiro — quem não pode Medições nem
         Financeiro; o removedor da ficha zera os valores): os percentuais
         ficam, nenhum R$ sai — nem "R$ 0,00" de um valor apagado, que se lê
         como "não tem valor" */
      var semD = !!dados.semDinheiro;
      function rs(v) { return (semD || v == null || !isFinite(Number(v))) ? "" : moeda(v); }
      function kpi(rot, v, sub, cls) {
        return '<div class="cx-kpi ' + cls + '"><div class="cx-kpi-rot">' + esc(rot) + '</div><div class="cx-kpi-v">' + esc(v) + '</div>' + (sub ? '<div class="cx-kpi-sub">' + esc(sub) + '</div>' : '') + '</div>';
      }
      var h = kpi(ex.rotulo || "Executado sobre o orçamento (diários publicáveis)", pctOu(ex.pct),
        ex.base === "financeira" ? "pesado pelo valor de venda de cada serviço" : (ex.base === "simples" ? "média simples — menos de 60% dos serviços têm valor" : ""), "cx-kpi-exec");
      /* ⚠ O NÚMERO DO PORTAL COM O DENOMINADOR DELE (revisão 3, lente UX): "89,3%
         no Portal" ao lado de "34,4% executado" sem dizer que o Portal é a
         média dos serviços JÁ LANÇADOS (11 de 24) fazia o engenheiro achar que o
         cliente vê a obra quase pronta sem saber por quê — e é ele quem atende
         o telefone. A régua do Portal não muda (I11): a tela só diz o que ela é. */
      var subPortal = "";
      if (po.fonte === "diario") {
        var nL = Number(po.servicos) || 0, nO = Number(po.doOrcamento) || 0;
        /* "o orçamento tem M", e não "de M": o Portal também pondera linha de
           diário que não é item do orçamento — N pode não ser parte de M */
        subPortal = (po.base === "simples" ? "média simples" : (po.base === "financeira" ? "pesado pelo valor" : "sobre")) + (nL ? " dos " + nL + " serviço(s) já lançado(s) nos diários" + (nO ? " (o orçamento tem " + nO + ")" : "") : "") +
          (po.ate ? " — é o que o cliente vê até " + dmaS(po.ate) : "");
      } else if (po.fonte) subPortal = "é o número de hoje (não foi cortado na data)";
      h += kpi(po.rotulo || "no Portal do cliente", pctOu(po.pct), subPortal, "cx-kpi-portal");
      /* ⚠ com data de corte ESCOLHIDA o medido continua o de hoje (boletim não
         entra na conta pela data): o card diz isso quando algum boletim contado
         é depois do corte — senão a obra parecia medida à frente do executado
         naquela data (revisão 3: corte 30/06, 42% contando o boletim de 31/07) */
      var subMed = me.pct == null && (me.emValor || semD) ? "boletins só em valor" + (rs(me.emValor) ? " (" + rs(me.emValor) + ")" : "") + ", sem % — não dá para dizer quanto da obra é" : (me.boletins ? me.boletins + " boletim(ns) aprovado(s) ou pago(s)" : "nenhum boletim aprovado");
      if (me.depoisDoCorte) subMed = "acumulado de hoje — inclui " + me.depoisDoCorte + " boletim(ns) com data depois de " + dmaS(p.dataCorte);
      if (dados.podeMedicoes === false) h += kpi(me.rotulo || "Medido (boletins aprovados)", "—", "seu usuário não vê medições", "cx-kpi-medido");
      else h += kpi(me.rotulo || "Medido (boletins aprovados)", pctOu(me.pct, 0), subMed, "cx-kpi-medido");
      if (pv) h += kpi(pv.rotulo || "Previsto na data", pctOu(pv.pct), pv.realPct != null ? "executado na mesma régua: " + pctOu(pv.realPct) : "", "cx-kpi-prev");
      else h += kpi("Previsto na data", "—", p.estado === "sem-inicio" ? "sem data de início — não dá para dizer se está atrasada" : "sem previsto nesta data", "cx-kpi-prev");
      // ⚠ IDP SÓ COM LINHA DE BASE: o montarPainel já não o entrega sem ela; a tela repete a regra
      /* no compacto (ficha) o IDP vinha sem explicação nenhuma: "2,65" solto.
         A frase curta diz como ler; o completo diz a conta (quem vê dinheiro) */
      if (p.base && idp && idp.valor != null) h += kpi("IDP " + (idp.rotulo || ""), nBR(idp.valor, 2), (comp || !rs(idp.va) || !rs(idp.vp)) ? "acima de 1 = à frente da linha de base; abaixo de 1 = atrás" : "valor agregado " + rs(idp.va) + " ÷ previsto " + rs(idp.vp), "cx-kpi-idp");
      if (K.situacao) h += kpi("Situação" + (K.situacaoContra ? " — contra " + K.situacaoContra : ""), (SIT[K.situacao] || [K.situacao])[0], termTxt(K.desvioTerminoDias), "cx-kpi-sit");
      return '<div class="cx-kpis">' + h + '</div>';
    },
    _prTabela: function (p, multi) {
      var nos = arr(p.nos);
      if (!nos.length) return '<div class="muted" style="font-size:12px">Sem etapas para comparar.</div>';
      function jan(o) { return o && o.ini ? dmS(o.ini, multi) + "–" + (o.fim ? dmS(o.fim, multi) : "…") : "—"; }
      var h = '<div class="cx-pr-sec"><b>Por etapa e subetapa</b> <span class="muted">— janela da linha de base · do plano atual · real (1º lançamento → último serviço concluído); previsto × real na data de corte</span></div>' +
        '<div class="cx-tabela"><table class="tbl cx-pr-tab"><thead><tr><th>Nº</th><th>Etapa / subetapa</th><th>Base</th><th>Atual</th><th>Real</th><th>Previsto × real</th><th>Situação</th></tr></thead><tbody>';
      nos.forEach(function (n) {
        var et = n.tipo === "etapa";
        h += '<tr class="' + (et ? 'cx-pr-et' : 'cx-pr-f') + '" data-no="' + esc(n.id) + '"><td class="cx-n">' + esc(n.numero) + '</td>' +
          '<td class="cx-nome" title="' + esc(n.nome + (n.nomeBase ? " (na linha de base: " + n.nomeBase + ")" : "")) + '">' + (et ? '' : '<span style="padding-left:14px"></span>') + esc(corta(n.nome, 80)) + '</td>' +
          '<td>' + jan(n.base) + '</td><td>' + jan(n.atual) + '</td><td>' + jan(n.real) + '</td>' +
          '<td>' + celPR(n) + '</td><td>' + sitHtml(n.situacao) + '</td></tr>';
      });
      return h + '</tbody></table></div>';
    },
    _prFora: function (p, dados) {
      var F = p.foraDaConta || {}, li = [];
      var na = arr(F.naoApropriadas), sq = arr(F.semQuantidade), ef = arr(F.escopoForaDaBase);
      // ⚠ sem dinheiro, nenhum R$ (nem o "(R$ X)" que o motor escreve na frase) — ver _prKpis
      var semDF = !!(dados && dados.semDinheiro);
      function rsF(v) { return (semDF || v == null || !isFinite(Number(v))) ? "" : moeda(v); }
      function it(x, n) { return '<span class="cx-n">' + esc(x.numero) + '</span>' + esc(corta(x.nome || x.descricao, n)); }
      if (na.length) li.push('<b>' + na.length + ' linha(s) de diário fora do avanço sobre o orçamento</b> (sem vínculo com item, item fora do orçamento ligado ou unidade diferente): ' +
        na.slice(0, 5).map(function (x) { return esc(corta(x.descricao || x.refId || "linha", 50)) + (x.msg ? ' <span class="muted">(' + esc(corta(x.msg, 110)) + ')</span>' : ''); }).join("; ") + (na.length > 5 ? "; e mais " + (na.length - 5) : ""));
      if (sq.length) li.push('<b>' + sq.length + ' serviço(s) sem quantidade no orçamento</b> com lançamento nos diários (não entram no %): ' + sq.slice(0, 5).map(function (x) { return it(x, 50); }).join("; ") + (sq.length > 5 ? "; e mais " + (sq.length - 5) : ""));
      arr(F.opcionaisFora).forEach(function (x) { li.push(it(x, 50) + (rsF(x.valor) ? ' (' + esc(rsF(x.valor)) + ')' : '') + ': ' + esc(x.msg)); });
      if (F.msgForaDaBase) li.push(esc(semDF ? "escopo fora da linha de base — não entra no IDP." : F.msgForaDaBase) + (ef.length ? ' ' + ef.slice(0, 5).map(function (x) { return it(x, 40); }).join("; ") : ''));
      arr(F.sumiramDoAtual).forEach(function (x) { li.push(it(x, 50) + ': ' + esc(x.msg)); });
      arr(F.reagrupadas).forEach(function (x) { li.push(it(x, 50) + ': ' + esc(x.msg)); });
      if (!li.length) return '<div class="muted" style="font-size:12px;margin-top:8px">Nada ficou fora da conta.</div>';
      return '<div class="cx-pr-sec"><b>O que ficou fora da conta</b></div><ul class="cx-lista cx-pr-fora">' + li.map(function (x) { return '<li>' + x + '</li>'; }).join("") + '</ul>';
    },
    /* ⚠ só as portas que EXISTEM (memória "porta prometida precisa existir"):
       congelar pede orçamento ligado e permissão; histórico só com base */
    _prAcoes: function (p, dados, opts, comp, erro) {
      var ob = p.obra || dados.obra || {}, obId = ob.id != null ? String(ob.id) : "", h = "", nB = arr(dados.bases).length;
      if (!erro && obId && dados.podeEditar !== false && p.orcamento) {
        if (!p.base && p.baseAlheia) h += '<button class="btn sm primary" data-acao="crono-congelar" data-obra="' + esc(obId) + '" data-reprogramar="1" title="A linha de base ativa foi congelada sobre outro orçamento e não vale para este: grava a versão seguinte, a partir do plano atual, com motivo.">Reprogramar (nova base)</button>';
        else if (!p.base) h += '<button class="btn sm primary" data-acao="crono-congelar" data-obra="' + esc(obId) + '" title="Congela o plano como está agora: é contra ele que a obra passa a ser comparada (previsto na data e IDP). Linha de base não se regrava — reprogramar cria a versão seguinte.">Congelar linha de base</button>';
        else h += '<button class="btn sm" data-acao="crono-congelar" data-obra="' + esc(obId) + '" data-reprogramar="1" title="Grava a versão seguinte da linha de base, com motivo. A atual fica no histórico.">Reprogramar (nova base)</button>';
      }
      if (!erro && obId && (p.base || nB)) h += '<button class="btn sm ghost" data-acao="crono-historico" data-obra="' + esc(obId) + '">Histórico de bases' + (nB ? ' (' + nB + ')' : '') + '</button>';
      if (comp && obId) h += '<button class="btn sm" data-acao="crono-planejamento" data-obra="' + esc(obId) + '">Abrir cronograma completo</button>';
      if (opts.origem === "obra" && p.orcamento && p.orcamento.id) h += '<button class="btn sm ghost" data-acao="crono-abrir-orc" data-orc="' + esc(p.orcamento.id) + '" title="Abre o orçamento da obra na aba Cronograma">Abrir cronograma no orçamento</button>';
      return h ? '<div class="cx-pr-acoes">' + h + '</div>' : '';
    },

    /* CURVA S: base × plano atual × executado, no eixo do painel.
       ⚠ O executado chega TRUNCADO (acaba no último mês com lançamento) e é
       desenhado só até onde tem valor, com o x calculado sobre o eixo INTEIRO
       — "daqui para frente ninguém mediu", sem a queda a pique que um zero ou
       null desenham (memória "portal lê null como zero"). Papel branco, como
       o Gantt. */
    curvaS: function (c, o) {
      o = o || {}; c = c || {};
      var rot = arr(c.rotulos), n = rot.length, mini = !!o.mini;
      if (!n) return '<div class="muted" style="font-size:12px">Sem meses para a curva S (sem data de início, ou sem valor de venda nos serviços).</div>';
      var W = mini ? 300 : 820, H = mini ? 78 : 230, L = mini ? 4 : 36, R = mini ? 4 : 12, T = 8, B = mini ? 6 : 30;
      function X(i) { return n === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (n - 1); }
      function Y(v) { var x = Number(v); if (!isFinite(x)) x = 0; x = Math.max(0, Math.min(100, x)); return T + (H - T - B) * (1 - x / 100); }
      function path(a) { var d = ""; arr(a).forEach(function (v, i) { if (v == null || i >= n) return; d += (d ? " L" : "M") + f1(X(i)) + "," + f1(Y(v)); }); return d; }
      var s = '<svg class="cx-curva' + (mini ? ' cx-curva-mini' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" style="max-width:' + W + 'px" role="img" aria-label="Curva S: linha de base, plano atual e executado">';
      [0, 50, 100].forEach(function (g) {
        s += '<line x1="' + L + '" y1="' + f1(Y(g)) + '" x2="' + (W - R) + '" y2="' + f1(Y(g)) + '" stroke="#e2e8f0" stroke-width="1"/>';
        if (!mini) s += '<text x="' + (L - 4) + '" y="' + f1(Y(g) + 3) + '" font-size="9" fill="#94a3b8" text-anchor="end">' + g + '%</text>';
      });
      if (!mini) {
        var passo = Math.max(1, Math.ceil(n / 12));
        rot.forEach(function (rt, i) { if (i % passo && i !== n - 1) return; s += '<text x="' + f1(X(i)) + '" y="' + (H - 12) + '" font-size="9" fill="#475569" text-anchor="middle">' + esc(rt) + '</text>'; });
      }
      var pb = path(c.base), pa = path(c.atual), pe = path(c.executado);
      if (pb) s += '<path class="cx-c-base" d="' + pb + '" fill="none" stroke="#64748b" stroke-width="1.6" stroke-dasharray="5,3"/>';
      if (pa) s += '<path class="cx-c-atual" d="' + pa + '" fill="none" stroke="#0d6ebd" stroke-width="1.8"/>';
      if (pe) {
        var ue = arr(c.executado).length - 1;
        s += '<path class="cx-c-exec" d="' + pe + '" fill="none" stroke="#15803d" stroke-width="2.6"/>';
        if (ue >= 0 && ue < n) s += '<circle cx="' + f1(X(ue)) + '" cy="' + f1(Y(c.executado[ue])) + '" r="' + (mini ? 2.5 : 3.5) + '" fill="#15803d"><title>' + esc("executado até " + rot[ue] + ": " + pctOu(c.executado[ue])) + '</title></circle>';
      }
      s += '</svg>';
      if (mini) return s;
      function am(css) { return '<span style="display:inline-block;width:18px;height:0;vertical-align:middle;margin-right:5px;' + css + '"></span>'; }
      return s + '<div class="cx-leg">' +
        (pb ? '<span>' + am('border-top:2px dashed #64748b') + esc(c.fonteBase || "linha de base") + '</span>' : '<span>sem linha de base</span>') +
        '<span>' + am('border-top:2px solid #0d6ebd') + esc(c.fonteAtual || "plano atual") + '</span>' +
        '<span>' + am('border-top:3px solid #15803d') + 'executado (diários publicados' + (pe ? '' : ' — nada lançado ainda') + ')</span></div>';
    },

    /* ------------------------------------------------------------------
       PASSAR A OBRA PARA A REVISÃO (espec 3.2) — as duas decisões puras.
       diffQuantidades(de, para): o antes → depois das quantidades pelos ids
       (a revisão clona o orçamento, os ids ficam iguais). Nº = o da planilha
       (Orcamento.calcular). {mudaram, novos, removidos, iguais}; null sem um
       dos dois.
       ------------------------------------------------------------------ */
    diffQuantidades: function (de, para) {
      if (!de || !para) return null;
      var O = (typeof Orcamento !== "undefined") ? Orcamento : G("Orcamento"), U = Ut();
      function num(v) { return U && U.num ? U.num(v) : (Number(v) || 0); }
      function idx(o) {
        var m = {}, ordem = [], numero = {};
        try { if (O && O.calcular) arr(O.calcular(o).linhas).forEach(function (l) { if (l && l.itemId != null && !own(numero, l.itemId)) numero[l.itemId] = l.numero; }); } catch (eC) {}
        arr(o.etapas).forEach(function (e, ie) {
          arr(e && e.itens).forEach(function (it, ii) {
            if (!it || it.id == null || own(m, it.id)) return;
            m[it.id] = it; ordem.push(it.id);
            if (!own(numero, it.id)) numero[it.id] = (ie + 1) + "." + (ii + 1);
          });
        });
        return { m: m, ordem: ordem, numero: numero };
      }
      var A = idx(de), B = idx(para), out = { mudaram: [], novos: [], removidos: [], iguais: 0 };
      B.ordem.forEach(function (id) {
        var b = B.m[id], lin = { id: id, numero: B.numero[id], descricao: b.descricao || "", unidade: b.unidade || "", de: null, para: num(b.quantidade) };
        if (!own(A.m, id)) { out.novos.push(lin); return; }
        var a = A.m[id];
        lin.de = num(a.quantidade);
        if (Math.abs(lin.de - lin.para) > 1e-9 || String(a.unidade || "") !== String(b.unidade || "")) { lin.unidadeDe = a.unidade || ""; out.mudaram.push(lin); }
        else out.iguais++;
      });
      A.ordem.forEach(function (id) {
        if (own(B.m, id)) return;
        var a = A.m[id];
        out.removidos.push({ id: id, numero: A.numero[id], descricao: a.descricao || "", unidade: a.unidade || "", de: num(a.quantidade), para: null });
      });
      return out;
    },
    /* bloqueioPassarObra(obra, medicoes, destinoId, numeros?) → null | {n,
       valor, orcamentos, msg}.
       ⚠ DINHEIRO: o acumulado já medido de cada item é contado por obra E POR
       ORÇAMENTO (Gestao._pctAnterioresPorItem: `x.orcamentoId !== orcamentoId`
       sai da conta; pendente CONTA, só rejeitada não). Com boletim sobre outro
       orçamento, passar a obra faria o próximo boletim sobre esta revisão
       começar do zero nos itens já medidos — medição em dobro. Boletim por
       valor ou por atividades (sem orçamento) não entra na trava. */
    bloqueioPassarObra: function (obra, medicoes, destinoId, numeros) {
      if (!obra) return null;
      var U = Ut(), n = 0, v = 0, orcs = {}, ks = [];
      arr(medicoes).forEach(function (m) {
        if (!m || String(m.obraId) !== String(obra.id) || m.status === "rejeitada" || !m.orcamentoId || String(m.orcamentoId) === String(destinoId)) return;
        n++; v += U && U.num ? U.num(m.valor) : (Number(m.valor) || 0);
        if (!own(orcs, m.orcamentoId)) { orcs[m.orcamentoId] = 1; ks.push(String(m.orcamentoId)); }
      });
      if (!n) return null;
      var nomes = ks.map(function (id) { return (numeros && numeros[id]) || id; }).join(", ");
      return { n: n, valor: Math.round(v * 100) / 100, orcamentos: ks,
        msg: "A obra " + String(obra.nome || "") + " tem " + n + " boletim(ns) de medição feitos sobre o orçamento " + nomes + " (" + moeda(v) + "). O acumulado já medido de cada item é contado por orçamento: com a obra nesta revisão, o próximo boletim começaria do zero nos itens já medidos — medição em dobro. Nada foi mudado: a obra continua ligada ao " + nomes + ". Planeje e meça pelo orçamento ligado a ela; para trocar de orçamento uma obra que já tem medição, fale com o suporte da RA." };
    },
    passarObraHtml: function (d) {
      d = d || {};
      var ob = d.obra || {}, para = d.para || {}, df = d.diff, h = '';
      h += '<p style="font-size:13px;margin:0 0 8px">A obra <b>' + esc(ob.nome || "") + '</b> está ligada ao <b>' + esc(d.deNumero || "orçamento anterior") + '</b>. Passando para o <b>' + esc(para.numero || "") +
        '</b>, os diários e o planejamento da obra passam a medir sobre esta revisão. Os diários e as medições já feitos continuam na mesma obra.</p>';
      if (!df) h += '<div class="cx-aviso">O ' + esc(d.deNumero || "orçamento anterior") + ' não está neste aparelho — não dá para mostrar o antes → depois das quantidades.</div>';
      else {
        h += '<p style="font-size:12.5px;margin:0 0 6px">Quantidades, pelos mesmos itens: <b>' + df.mudaram.length + '</b> mudam, <b>' + df.novos.length + '</b> entram, <b>' + df.removidos.length + '</b> saem e ' + df.iguais + ' ficam iguais.</p>';
        var lin = df.mudaram.concat(df.novos, df.removidos);
        if (lin.length) {
          h += '<div class="cx-tabela" style="max-height:280px"><table class="tbl" style="font-size:12px"><thead><tr><th>Nº</th><th>Serviço</th><th>Un.</th><th class="num">' + esc(d.deNumero || "antes") + '</th><th class="num">' + esc(para.numero || "depois") + '</th></tr></thead><tbody>';
          lin.slice(0, 40).forEach(function (x) {
            h += '<tr><td class="cx-n">' + esc(x.numero) + '</td><td style="white-space:normal">' + esc(corta(x.descricao, 80)) + '</td><td>' + esc(x.unidade) +
              (x.unidadeDe != null && x.unidadeDe !== x.unidade ? ' <span class="muted">(era ' + esc(x.unidadeDe) + ')</span>' : '') + '</td>' +
              '<td class="num">' + (x.de == null ? '<span class="muted">entra</span>' : esc(nBR(x.de, 2))) + '</td><td class="num">' + (x.para == null ? '<span class="muted">sai</span>' : esc(nBR(x.para, 2))) + '</td></tr>';
          });
          if (lin.length > 40) h += '<tr><td colspan="5" class="muted">e mais ' + (lin.length - 40) + ' item(ns)</td></tr>';
          h += '</tbody></table></div>';
        }
        if (df.removidos.length) h += '<div class="cx-aviso">O que foi lançado nos diários nos ' + df.removidos.length + ' item(ns) que saem fica fora do avanço sobre o orçamento ("item fora do orçamento vinculado").</div>';
      }
      if (d.temPlano) h += '<p class="muted" style="font-size:12px;margin:6px 0 0">O plano de execução da obra passa junto (as etapas e subetapas têm os mesmos ids).</p>';
      /* ⚠ O PORTAL DO CLIENTE MUDA JUNTO (revisão 3, lente dinheiro): o snapshot
         lê o cronograma, a curva planejada e os pesos do orçamento LIGADO à
         obra, e se republica sozinho a cada diário publicado. Esta porta se
         apresentava como segura ("os diários continuam") e trocava, sem aviso,
         o que o contratante vê. O recado diz o que muda e quando. */
      var pz = d.prazo || null;
      h += '<div class="cx-aviso">O <b>Portal do cliente</b> passa a mostrar o cronograma e a curva planejada do <b>' + esc(para.numero || "orçamento novo") + '</b> na próxima publicação (ela é refeita sozinha a cada diário publicado)' +
        (pz && pz.de != null && pz.para != null ? (pz.de === pz.para ? ' — o prazo do cronograma continua ' + esc(pz.para) + ' dias úteis.' : ': o prazo do cronograma vai de <b>' + esc(pz.de) + '</b> para <b>' + esc(pz.para) + '</b> dias úteis.') : '.') + '</div>';
      return h + '<p class="muted" style="font-size:12px;margin:6px 0 0">Fica registrado na obra quem passou e quando.</p>';
    },

    /* ------------------------------------------------------------------
       CONGELAR / REPROGRAMAR — o diálogo e a leitura dele (puros).
       d = {obra, inicio ("AAAA-MM-DD" do cadastro), inicioPlano, versao,
       ativa (base ativa | null), opcionais [{id, numero, nome}], sim (a base
       que sairia, ou {erro}), fontePlano "plano"|"orcamento", orcNumero}.
       ⚠ Opcional DESMARCADA por padrão (segue a proposta, que imprime a
         opcional fora do total — decisão de produto pendente do Rogério).
       ⚠ Os ids das opcionais não vão para o id do elemento (vêm de fora):
         `congelarDoForm` lê pela POSIÇÃO na mesma lista.
       ------------------------------------------------------------------ */
    congelarForm: function (d) {
      d = d || {};
      var v = d.versao || 1, sim = d.sim, h = '';
      h += '<p style="font-size:13px;margin:0 0 10px">' + (v > 1
        ? 'Reprogramar grava a <b>linha de base v' + v + '</b>: a obra passa a ser comparada com ela. A v' + (v - 1) + ' fica no histórico — linha de base não se apaga nem se regrava.'
        : 'A linha de base é o combinado com que a obra passa a ser comparada (previsto na data e IDP). Ela congela ' + (d.fontePlano === "plano" ? 'o <b>plano de execução da obra</b>' : 'o <b>cronograma do orçamento ' + esc(d.orcNumero || "") + '</b>') +
          ' como está agora e não se regrava: reprogramar cria a versão seguinte.') + '</p>';
      h += '<div class="field"><label>Início da obra *</label><input type="date" id="cxb-inicio" value="' + esc(d.inicio || "") + '" style="width:160px">' +
        '<div class="muted" style="font-size:11.5px;margin-top:3px">' + (d.inicio ? 'O do cadastro da obra.' : 'A obra ainda não tem início.') + ' A linha de base conta dele; mudando aqui, o cadastro da obra passa a ter esta data.' +
        (d.inicioPlano && d.inicio && d.inicioPlano !== d.inicio ? ' (O ' + (d.fontePlano === "plano" ? 'plano' : 'orçamento') + ' dizia ' + esc(dmaS(d.inicioPlano)) + '.)' : '') + '</div></div>';
      var opc = arr(d.opcionais);
      if (opc.length) {
        h += '<div class="field"><label>Etapas opcionais no avanço</label>';
        opc.forEach(function (x, i) { h += '<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="cxb-opc-' + i + '"> ' + esc(x.numero) + ' ' + esc(corta(x.nome, 60)) + '</label>'; });
        h += '<div class="muted" style="font-size:11.5px;margin-top:3px">Desmarcada = fora do avanço, do previsto e do IDP, como a proposta, que imprime a opcional fora do total. Marque só a que o cliente contratou.</div></div>';
      }
      h += '<div class="field"><label>Motivo' + (v > 1 ? ' * <span class="muted" style="font-weight:400">(obrigatório: a v' + v + ' substitui a v' + (v - 1) + ')</span>' : ' <span class="muted" style="font-weight:400">(opcional)</span>') +
        '</label><textarea id="cxb-motivo" rows="2" maxlength="200" placeholder="' + (v > 1 ? 'Ex.: chuva atrasou a fundação 10 dias' : 'Ex.: plano assinado com o cliente') + '"></textarea></div>';
      /* ⚠ SEM DINHEIRO (quem não pode Medições nem Financeiro — a regra do
         painel da obra, Gestao._cronoDinheiro): prazo e datas ficam, o valor de
         venda sai. O diálogo vazava "R$ 4.500,00" pela porta da própria ficha
         que já escondia o dinheiro (revisão 3, lentes dinheiro e código). */
      var semD = !!d.semDinheiro;
      if (sim && sim.erro) h += '<div class="cx-aviso">Com o início ' + (d.inicio ? esc(dmaS(d.inicio)) + ' ' : '') + 'a linha de base não sai: ' + esc(sim.erro) + '</div>';
      else if (sim) {
        var mq = (v > 1 && d.ativa) ? this.oQueMuda(d.ativa, sim) : null;
        if (mq) h += this._oQueMudaHtml(mq, v, semD);
        else h += '<p class="muted" style="font-size:12px;margin:6px 0 0">Com o início acima e as opcionais desmarcadas: ' + esc(sim.totalDias) + ' dias úteis, término ' + esc(dmaS(sim.dataFim)) + (semD ? '' : ', ' + esc(moeda(sim.valor))) + '.</p>';
        /* ⚠ O TÉRMINO DO CADASTRO (revisão 3, lente UX): a obra de 04/05 a 18/12
           congelava uma base de 378 dias úteis (até 11/2027) sem nenhuma
           menção ao término digitado — e a mesma ficha passava a dar duas
           respostas de prazo (Resumo: 18/12/2026; Cronograma: "adiantada"
           contra 2027). O diálogo mostra os dois e deixa a pessoa decidir se o
           cadastro passa a ter o término da linha de base. Desmarcado: nada
           muda no cadastro. */
        var tObra = /^\d{4}-\d{2}-\d{2}$/.test(String(d.termino || "")) ? String(d.termino) : "";
        if (sim.dataFim && tObra !== sim.dataFim) {
          h += '<div class="cx-aviso">' + (tObra ? 'Término: o cadastro da obra diz <b>' + esc(dmaS(tObra)) + '</b>; esta linha de base termina em <b>' + esc(dmaS(sim.dataFim)) + '</b> (com o início acima).'
            : 'A obra não tem término no cadastro; esta linha de base termina em <b>' + esc(dmaS(sim.dataFim)) + '</b> (com o início acima).') +
            '<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin-top:6px"><input type="checkbox" id="cxb-termino"> ' +
            (tObra ? 'Atualizar o término do cadastro da obra para o fim desta linha de base' : 'Gravar no cadastro da obra o término desta linha de base') + '</label></div>';
        }
      }
      return h;
    },
    /* o diálogo → {dataInicio, motivo, opcionaisIncluidos, erro?}.
       `el(id)` = o elemento ou null; opcIds na MESMA ordem do congelarForm */
    congelarDoForm: function (el, opcIds, versao) {
      var ini = el("cxb-inicio"), mot = el("cxb-motivo");
      var f = { dataInicio: ini ? String(ini.value == null ? "" : ini.value).trim() : "",
        motivo: mot ? String(mot.value == null ? "" : mot.value).replace(/\s+/g, " ").trim().slice(0, 200) : "", opcionaisIncluidos: [] };
      arr(opcIds).forEach(function (id, i) { var c = el("cxb-opc-" + i); if (c && c.checked) f.opcionaisIncluidos.push(id); });
      var tb = el("cxb-termino");
      f.atualizarTermino = !!(tb && tb.checked);
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.dataInicio), ok = false;
      if (m) { var dt = new Date(+m[1], +m[2] - 1, +m[3]); ok = dt.getFullYear() === +m[1] && dt.getMonth() === +m[2] - 1 && dt.getDate() === +m[3]; }
      if (!ok) f.erro = "Informe a data de início da obra — a linha de base congela as datas a partir dela. Nada foi gravado.";
      else if (versao > 1 && !f.motivo) f.erro = "Informe o motivo da reprogramação — a v" + versao + " substitui a v" + (versao - 1) + " na comparação da obra. Nada foi gravado.";
      return f;
    },
    /* o que muda da base ativa para a que sairia: prazo, término, valor e as
       janelas por nó — comparadas em DATA (CronoPlan.dataDaBase), porque o
       offset de cada base conta do início dela */
    oQueMuda: function (ativa, nova) {
      if (!ativa || !nova || nova.erro) return null;
      var P = (typeof CronoPlan !== "undefined") ? CronoPlan : G("CronoPlan");
      function dat(b, k) { if (P && P.dataDaBase) { try { return P.dataDaBase(b, k); } catch (e) { return null; } } return null; }
      var porId = {}, vistos = {}, mud = [], novos = 0, sairam = 0;
      arr(ativa.nos).forEach(function (n) { if (n && n.id != null) porId[n.id] = n; });
      arr(nova.nos).forEach(function (n) {
        if (!n) return;
        vistos[n.id] = true;
        var a = own(porId, n.id) ? porId[n.id] : null;
        if (!a) { novos++; return; }
        var ai = dat(ativa, a.i), af = dat(ativa, a.f), ni = dat(nova, n.i), nf = dat(nova, n.f);
        if (ai == null || ni == null) { if (a.i !== n.i || a.f !== n.f) mud.push({ numero: n.n, nome: n.nm, de: null, para: null }); return; }
        if (ai !== ni || af !== nf) mud.push({ numero: n.n, nome: n.nm, de: [ai, af], para: [ni, nf] });
      });
      arr(ativa.nos).forEach(function (n) { if (n && !own(vistos, n.id)) sairam++; });
      return { prazo: [ativa.totalDias, nova.totalDias], termino: [ativa.dataFim, nova.dataFim], valor: [ativa.valor, nova.valor],
        inicio: [ativa.cal && ativa.cal.dataInicio, nova.cal && nova.cal.dataInicio], mudaram: mud, novos: novos, sairam: sairam };
    },
    _oQueMudaHtml: function (mq, v, semDinheiro) {
      var h = '<div style="font-size:12.5px;margin-top:6px"><b>O que muda da v' + (v - 1) + ' para a v' + v + '</b> <span class="muted">(com o início acima e as opcionais desmarcadas)</span>' +
        '<table class="tbl cx-muda" style="font-size:12px;margin:4px 0"><thead><tr><th></th><th class="num">v' + (v - 1) + '</th><th class="num">v' + v + '</th></tr></thead><tbody>' +
        '<tr><td>Início</td><td class="num">' + esc(dmaS(mq.inicio[0])) + '</td><td class="num">' + esc(dmaS(mq.inicio[1])) + '</td></tr>' +
        '<tr><td>Prazo</td><td class="num">' + esc(mq.prazo[0]) + ' dias úteis</td><td class="num">' + esc(mq.prazo[1]) + ' dias úteis</td></tr>' +
        '<tr><td>Término</td><td class="num">' + esc(dmaS(mq.termino[0])) + '</td><td class="num">' + esc(dmaS(mq.termino[1])) + '</td></tr>' +
        // ⚠ sem dinheiro: a linha do valor de venda não existe (ver congelarForm)
        (semDinheiro ? '' : '<tr><td>Valor</td><td class="num">' + esc(moeda(mq.valor[0])) + '</td><td class="num">' + esc(moeda(mq.valor[1])) + '</td></tr>') + '</tbody></table>';
      if (mq.mudaram.length) {
        h += mq.mudaram.length + ' etapa(s)/subetapa(s) mudam de janela:<ul class="cx-lista">';
        mq.mudaram.slice(0, 8).forEach(function (x) { h += '<li><span class="cx-n">' + esc(x.numero) + '</span>' + esc(corta(x.nome, 50)) + (x.de ? ': ' + esc(dmaS(x.de[0]) + "–" + dmaS(x.de[1]) + " → " + dmaS(x.para[0]) + "–" + dmaS(x.para[1])) : '') + '</li>'; });
        if (mq.mudaram.length > 8) h += '<li>e mais ' + (mq.mudaram.length - 8) + '</li>';
        h += '</ul>';
      } else h += 'Nenhuma etapa ou subetapa muda de janela.';
      if (mq.novos || mq.sairam) h += ' <span class="muted">' + (mq.novos ? mq.novos + ' nó(s) entram' : '') + (mq.novos && mq.sairam ? ', ' : '') + (mq.sairam ? mq.sairam + ' saem' : '') + '.</span>';
      return h + '</div>';
    },
    /* HISTÓRICO DE BASES: da mais nova para a mais velha, dizendo o que cada
       versão ainda guarda (ativa completa; antigas resumidas ou arquivadas
       pela porta do espaço do CronoBase, com o que saiu). */
    historicoBases: function (bases, ativaId, ocup, opts) {
      opts = opts || {};
      // ⚠ sem dinheiro: a coluna Valor não existe (ver congelarForm)
      var semD = !!opts.semDinheiro;
      var bs = arr(bases).slice().reverse();
      if (!bs.length) return '<p style="font-size:13px">Esta obra ainda não tem linha de base. Use <b>Congelar linha de base</b> no previsto × realizado da obra.</p>';
      var h = '<p class="muted" style="font-size:12px;margin:0 0 8px">Linha de base não se apaga nem se regrava: reprogramar grava a versão seguinte. Para caber no limite da nuvem, as versões antigas são resumidas sozinhas — nunca a ativa, e a v1 (a contratual) por último.</p>';
      /* duas bases da MESMA versão = congeladas ao mesmo tempo em aparelhos
         diferentes (o id é único por gravação, nenhuma some no merge): vale a
         ativa (CronoBase.ativa — a mais recente, a mesma em todo aparelho), e
         a outra fica aqui dita, com quem e quando */
      var ativaB = null, porV = {};
      bs.forEach(function (b) { if (b.id === ativaId) ativaB = b; porV[b.versao] = (porV[b.versao] || 0) + 1; });
      h += '<div class="cx-tabela"><table class="tbl cx-hist" style="font-size:12.5px"><thead><tr><th>Versão</th><th>Congelada em</th><th>Por</th><th>Motivo</th><th class="num">Prazo</th><th>Término</th>' + (semD ? '' : '<th class="num">Valor</th>') + '<th>O que ficou guardado</th></tr></thead><tbody>';
      bs.forEach(function (b) {
        var guard = b.id === ativaId ? '<b>ativa</b> — completa'
          : (b.arquivada ? 'arquivada: só o cabeçalho (saíram ' + (Number(b.etapasArquivadas) || 0) + ' etapa(s), ' + (Number(b.folhasResumidas) || 0) + ' subetapa(s) e ' + (Number(b.mesesResumidos) || 0) + ' mês(es) de curva)'
            : (b.resumida ? 'resumida: sem ' + (Number(b.folhasResumidas) || 0) + ' subetapa(s) e sem a curva de ' + (Number(b.mesesResumidos) || 0) + ' mês(es)' : 'completa'));
        if (b.id !== ativaId && porV[b.versao] > 1 && ativaB && ativaB.versao === b.versao) {
          guard = '<b>não vale</b>: outra v' + esc(b.versao) + ' foi congelada ao mesmo tempo em outro aparelho (' + esc(dmaS(ativaB.criadaEm)) + (ativaB.por ? ', por ' + esc(corta(ativaB.por, 30)) : '') + ') e é ela que vale — para mudar, reprograme. ' + guard;
        }
        h += '<tr><td><b>v' + esc(b.versao) + '</b></td><td>' + esc(dmaS(b.criadaEm)) + '</td><td>' + esc(corta(b.por || "—", 30)) + '</td><td style="white-space:normal">' + esc(b.motivo || "—") +
          '</td><td class="num">' + esc(b.totalDias) + ' d</td><td>' + esc(dmaS(b.dataFim)) + '</td>' + (semD ? '' : '<td class="num">' + esc(moeda(b.valor)) + '</td>') + '<td style="white-space:normal">' + guard + '</td></tr>';
      });
      h += '</tbody></table></div>';
      if (ocup && ocup.bytes != null && ocup.teto) h += '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Planejamento das obras desta empresa: ' + esc(nBR(ocup.bytes / 1024, 0)) + ' KB de ' + esc(nBR(ocup.teto / 1024, 0)) + ' KB (a nuvem guarda tudo num documento só, de 1 MiB).</p>';
      return h;
    },

    /* O "antes → depois" do interruptor, em HTML (Cronograma.simularExec).
       Os números vêm do motor; a tela só os escreve — e separa o que é
       arredondamento (piso de 1 dia por subetapa) do que é a rede, senão
       "+4 dias" se lia como obra mais realista quando era só arredondar. */
    textoSimulacao: function (sim, nomes) {
      nomes = nomes || {};
      var liga = !!sim.ligar, a = sim.antes || {}, b = sim.depois || {}, dif = (b.totalDias || 0) - (a.totalDias || 0);
      // de onde vinha a duração que muda: "digitada" para a da IA ou do Hh escondia uma duração rastreável (I7)
      var ORIG = { ia: "sugerida pela IA", exec: "do Hh SINAPI (aba Execução)" };
      function orig(ag) { return ORIG[ag] || "digitada"; }
      var html = '<p style="margin:0 0 10px;font-size:13px">' + (liga
        ? 'Ligando, a duração de cada etapa com subetapas passa a ser o <b>vão da rede das subetapas</b> — e o PDF, a proposta, o desembolso e o MS Project passam a usar esse prazo. A duração que cada etapa tem hoje fica <b>guardada</b> e volta se você desligar.'
        : 'Desligando, as etapas com subetapas voltam à duração que tinham <b>antes de ligar</b> (a guardada — se ninguém editou a etapa depois) ou, sem ela, à estimada pelo agente; as subetapas continuam desenhadas dentro delas.') + '</p>';
      html += '<table class="tbl" style="margin-bottom:10px"><tbody>' +
        '<tr><td>Hoje</td><td class="num"><b>' + a.totalDias + ' dias úteis</b></td><td>término ' + dma(a.dataFim) + '</td></tr>' +
        '<tr><td>' + (liga ? 'Pelas subetapas' : 'Sem o modo executivo') + '</td><td class="num"><b>' + b.totalDias + ' dias úteis</b></td><td>término ' + dma(b.dataFim) + '</td></tr>' +
        '</tbody></table>';
      html += '<p style="margin:0 0 8px;font-size:13px">' + (dif === 0 ? 'O prazo total não muda.' : 'O prazo ' + (dif > 0 ? 'aumenta' : 'diminui') + ' <b>' + Math.abs(dif) + ' dia(s) útil(eis)</b>.') + '</p>';
      if (liga && sim.arredondamento > 0 && sim.semPiso)
        html += '<p style="margin:0 0 8px;font-size:12.5px">Desses ' + b.totalDias + ' dias, <b>' + sim.arredondamento + '</b> vêm só do arredondamento — cada subetapa dura no mínimo 1 dia inteiro; sem ele a rede daria ' + sim.semPiso.totalDias + ' dias úteis. Não é a obra que ficou mais lenta.</p>';
      var et = arr(sim.etapas);
      if (et.length) {
        html += '<div style="font-size:12.5px"><b>Etapas que mudam:</b><ul class="cx-lista">';
        et.slice(0, 8).forEach(function (x) { html += '<li>' + esc(nomes[x.etapaId] || "etapa") + ': ' + x.antes + ' → ' + x.depois + ' dia(s)</li>'; });
        if (et.length > 8) html += '<li>e mais ' + (et.length - 8) + '</li>';
        html += '</ul></div>';
      }
      arr(sim.avisos).forEach(function (x) {
        html += '<div class="cx-aviso">' + esc(nomes[x.etapaId] || "Etapa") + ' tinha a duração <b>' + x.digitado + ' dia(s)</b> ' + orig(x.agente) + ' e passa a durar o vão das subetapas: <b>' + x.vao + ' dia(s)</b>. Os ' + x.digitado + ' dia(s) ficam guardados e voltam se o modo for desligado.</div>';
      });
      arr(sim.restauradas).forEach(function (x) {
        html += '<div class="cx-aviso">' + esc(nomes[x.etapaId] || "Etapa") + ' volta a ' + (x.dur != null ? '<b>' + x.dur + ' dia(s)</b> ' + orig(x.agente) : 'a duração de antes') + ' — o valor de antes de ligar o modo executivo.</div>';
      });
      if (arr(sim.semVao).length) html += '<div class="muted" style="font-size:12px">' + sim.semVao.length + ' etapa(s) só com subetapas marco: a duração delas não vem das subetapas.</div>';
      var pt = sim.prazoTexto;
      if (pt && pt.msg && (pt.difere || pt.ambiguo))
        html += '<div class="cx-aviso">' + esc(pt.msg) + ' O texto da proposta <b>não</b> é alterado — ajuste o campo “Prazo de execução” dos dados comerciais do orçamento.</div>';
      html += '<p class="muted" style="font-size:12px;margin:8px 0 0">Nada é gravado até você confirmar.</p>';
      return html;
    }
  };

  global.CronoExecUI = CronoExecUI;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoExecUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
