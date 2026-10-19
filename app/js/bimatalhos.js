/* =====================================================================
 * bimatalhos.js — TELA DE ATALHOS do BIM (BACKLOG #63, 16/10/2026)
 *
 * Tecla "?" (fora de campo de texto, com o BIM na tela) ou o botão "Atalhos" da fita (Vista › Navegar) abrem um
 * quadro com o teclado, os atalhos de duas letras do modo de edição, o mouse, o controle de Xbox 360 e os botões
 * novos das telas; "Baixar PDF" abre a mesma página pronta para imprimir/salvar em PDF.
 *
 * ⚠ GERADO DOS MAPAS DE VERDADE, para não desatualizar: as teclas de uma letra vêm de BimMouse.TECLAS
 *   (js/bimmouse.js), os botões do controle de BimControle.MAPA (js/bimcontrole.js), os atalhos de duas letras de
 *   BimPrecisao.ATALHOS e ATALHOS_CMD (js/bimprecisao.js), com o nome do comando tirado da própria fita
 *   (BimPrecisao.FITA). Mudou uma tecla num mapa, a tela muda junto. Ação nova sem rótulo em ROTULO aparece com o
 *   nome interno — test-bim-atalhos reprova nesse caso, para ninguém esquecer de escrever o texto.
 *   O que não é "ação" de mapa (gestos do mouse, direcionais, gatilhos, Esc/Enter/Ctrl+Z do js/bimshell.js) é lista
 *   fixa abaixo, conferida no código em 16/10/2026 (base: docs/bim/ATALHOS-1.2.152.html).
 *
 *   BimAtalhos.secoes()           → [{ id, titulo, cab:[…], linhas:[[…]], nota }]   [PURA]
 *   BimAtalhos.html(op)           → o quadro (string); op.imprimir = página inteira para o PDF
 *   BimAtalhos.abrir()            → abre no UI.modal (com "Baixar PDF")
 *   BimAtalhos.baixarPdf()        → abre a página de impressão (Ctrl+P / "Salvar como PDF")
 *   BimAtalhos.registrar(reg)     → reg.atalhos (o comando da fita)
 *   BimAtalhos.instalar(win, doc) → a tecla "?"; devolve dispor()
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global && global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }

  /* o que cada AÇÃO faz, em português — uma frase por ação, valendo para o teclado e para o controle */
  var ROTULO = {
    enquadrar: "Enquadra a seleção (sem seleção, enquadra tudo)",
    ocultar: "Oculta a seleção",
    isolar: "Isola a seleção",
    caixaCorte: "Caixa de corte",
    trena: "Medir (trena)",
    passeioAuto: "Passeio automático pelas vistas salvas (de novo para parar)",
    vistaTopo: "Vista de topo",
    vistaFrente: "Vista de frente",
    vistaLateral: "Vista lateral direita",
    vistaTras: "Vista de trás",
    vistaEsquerda: "Vista lateral esquerda",
    vistaIso: "Vista isométrica",
    selecionar: "Seleciona o que está na mira do centro",
    voltar: "Limpa a seleção / volta",
    abaAnterior: "Ponto de vista anterior",
    abaProxima: "Próximo ponto de vista",
    alternarModo: "Alterna modelo ⇄ passeio"
  };
  /* comandos de duas letras sem rótulo na fita do editor (BimPrecisao.FITA) */
  var ROTULO_CMD = { parede: "Parede", "corresp-tipo": "Corresponder tipo", elevar: "Elevar a seleção (subir/descer, levar a um nível, alinhar ao topo do pilar)" };
  /* o nome do botão do controle (mapping "standard" do navegador — o mesmo índice do BimControle.MAPA) */
  var BOTAO = { 0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 8: "BACK", 9: "START", 10: "L3 (aperta o direcional esquerdo)", 11: "R3 (aperta o direcional direito)",
    12: "Cruz ↑", 13: "Cruz ↓", 14: "Cruz ←", 15: "Cruz →" };

  function rotulo(acao) { return ROTULO[acao] || acao; }
  /* o nome de um COMANDO da fita principal pelo id (os módulos que somam atalhos de duas letras ao carregar — RM, TG,
     VV, GP… — têm o comando lá, não na fita do editor) */
  function rotuloFita(id) {
    var R = global.BimRibbon; if (!R || !R.comando) return "";
    try { var c = R.comando(id); return c && c.rotulo ? String(c.rotulo).replace(/\/\s*\n\s*/g, "/").replace(/\s*\n\s*/g, " ") : ""; } catch (e) { return ""; }
  }
  function tecla(k) { return String(k).length === 1 ? String(k).toUpperCase() : String(k); }

  /* ---------------------------------------------------------- [PURA] */
  /* P8 (junção 18/10/2026): o que é da prévia `?previa=hidro` (atalhos das instalações, "Em desenvolvimento" da fita
     organizada) só aparece com ela; op.hidro força (teste em Node) */
  function hidro(op) {
    if (op && op.hidro != null) return !!op.hidro;
    try { return !!(global.BimPrevia && global.BimPrevia.hidro && global.BimPrevia.hidro()); } catch (e) { return false; }
  }
  function secoes(op) {
    var Mo = dep("BimMouse", "./bimmouse.js"), Ct = dep("BimControle", "./bimcontrole.js"), Pr = dep("BimPrecisao", "./bimprecisao.js");
    var out = [];

    /* TECLADO: as de uma letra/número (mapa) + as do bimshell (fixas) */
    var tl = [];
    if (Mo && Mo.TECLAS) Object.keys(Mo.TECLAS).sort(function (a, b) { var na = /^\d$/.test(a), nb = /^\d$/.test(b); return na !== nb ? (na ? 1 : -1) : (a < b ? -1 : a > b ? 1 : 0); })
      .forEach(function (k) { tl.push([tecla(k), rotulo(Mo.TECLAS[k])]); });
    tl.push(["G", "Grade do chão (liga/desliga)"]);
    tl.push(["Ctrl+Z / Ctrl+Y", "Desfazer / refazer (Ctrl+Shift+Z também refaz)"]);
    tl.push(["Enter", "Repete o último comando"]);
    tl.push(["Esc", "Cancela a ferramenta ou limpa a seleção (no modo foco, sai do foco primeiro)"]);
    tl.push(["Delete", "Apaga as peças selecionadas do editor"]);
    tl.push(["?", "Abre esta tela de atalhos"]);
    out.push({ id: "teclado", titulo: "Teclado no BIM", cab: ["Tecla", "O que faz"], linhas: tl,
      nota: "As teclas de uma letra não funcionam com o cursor dentro de um campo de texto nem com um diálogo aberto." });

    /* DUAS LETRAS (modo de edição): o nome do comando é o da fita do editor */
    var nomes = {};
    if (Pr && Pr.FITA) Object.keys(Pr.FITA).forEach(function (g) { (Pr.FITA[g] || []).forEach(function (c) { if (c && c.sub && !nomes[c.sub]) nomes[c.sub] = String(c.rotulo || "").replace(/\s*\n\s*/g, " "); }); });
    var dl = [];
    if (Pr && Pr.ATALHOS) Object.keys(Pr.ATALHOS).forEach(function (k) { var s = Pr.ATALHOS[k]; dl.push([k, nomes[s] || ROTULO_CMD[s] || rotuloFita(s) || s]); });
    if (Pr && Pr.ATALHOS_CMD) Object.keys(Pr.ATALHOS_CMD).forEach(function (k) { var s = Pr.ATALHOS_CMD[k]; dl.push([k, ROTULO_CMD[s] || nomes[s] || rotuloFita(s) || s]); });
    if (dl.length) out.push({ id: "duas-letras", titulo: "Atalhos de duas letras", cab: ["Teclas", "Comando"], linhas: dl,
      nota: "Digite as duas letras em seguida (até 1,2 s entre elas). Valem no modo de edição; EL vale também fora dele." });
    /* INSTALAÇÕES (js/biminsttipos.js): os de duas letras do hidro (PI, PF, PA…), editáveis por usuário */
    var TI = hidro(op) ? dep("BimInstTipos", "./biminsttipos.js") : null;
    if (TI && TI.secaoAtalhos) out.push(TI.secaoAtalhos());

    /* MOUSE: gestos (o pivô e o zoom moram no js/bim.js; os botões laterais no js/bimmouse.js) */
    out.push({ id: "mouse", titulo: "Mouse no BIM", cab: ["Ação", "O que faz"], linhas: [
      ["Shift + botão do meio", "Gira em volta do ponto sob o cursor"],
      ["Botão do meio / direito", "Desloca a vista"],
      ["Roda", "Aproxima/afasta na direção do cursor, sem travar perto da peça"],
      ["Botões laterais do mouse", rotulo("abaAnterior") + " / " + rotulo("abaProxima").toLowerCase()],
      ["Duplo clique no vazio", "Enquadra tudo"],
      ["Clique esquerdo", "Seleciona"]
    ] });

    /* CONTROLE: os contínuos (fixos) + os botões (mapa) */
    var cl = [["Direcional esquerdo", "Desloca a vista · no passeio: anda"], ["Direcional direito", "Gira o modelo · no passeio: olha em volta"],
      ["LT / RT", "Zoom (de leve devagar, com força rápido) · no passeio: desce / sobe"]];
    if (Ct && Ct.MAPA) Object.keys(Ct.MAPA).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) { cl.push([BOTAO[i] || "botão " + i, rotulo(Ct.MAPA[i])]); });
    out.push({ id: "controle", titulo: "Controle de Xbox 360 com fio", cab: ["Botão", "O que faz"], linhas: cl,
      nota: "Ligue no USB, abra o BIM e aperte qualquer botão (o navegador só vê o controle depois do primeiro botão). A velocidade fica no canto de baixo: “Controle · velocidade − 1× +” (0,25× a 4×)." });

    /* BOTÕES NOVOS das telas (14 a 16/10/2026) */
    out.push({ id: "botoes", titulo: "Botões novos nas telas", cab: ["Onde", "Botão", "O que faz"], linhas: [
      ["Calcular a estrutura desenhada", "Abrir em outra janela", "Leva o cálculo para o 2º monitor; os botões de lá agem no 3D principal; lembra o lugar"],
      ["Configuração das ligações", "Abrir em outra janela", "A configuração da obra no 2º monitor; Salvar, Voltar ao padrão e Fechar valem nas duas janelas"],
      ["Erro de mecanismo", "Resolver", "Testa as soluções e propõe a do lugar do problema; aplica só com clique, com Desfazer"],
      ["Avisos de problema", "Corrigir: … · Mostrar no 3D", "Corrige o problema (ou leva ao campo certo) e mostra a peça no 3D"],
      ["Ligações", "Ligar todos os nós", "Liga de uma vez as peças selecionadas; o que fica de fora diz o motivo"],
      ["Metálica", "Lançar vigas entre pilares", "Vigas de pilar a pilar em X, Y ou nos dois, na face certa, com emendas a cada 12 m"],
      ["Metálica", "Catálogo BR · Catálogo industrial", "Perfis, parafusos, chumbadores, chapas, telhas, aços e pintura, com a fonte"],
      ["Criar peça (pilar, viga…)", "Campo Perfil", "Digite série ou fabricante (W200, Ue 150, tubo, Gerdau); ao lado da lista, o desenho cotado da seção sob o mouse ou as setas"],
      ["Vista › Navegar", "Atalhos", "Esta tela (também pela tecla ?)"]
    ] });
    /* EM DESENVOLVIMENTO (P3 da junção, 18/10/2026 — regra de 09/10: nenhum botão sem função): o que ainda não tem
       botão, com o que já dá para fazer no lugar. A lista mora no js/bimfita.js (EM_DESENVOLVIMENTO). */
    var Fi = hidro(op) ? dep("BimFita", "./bimfita.js") : null;
    if (Fi && Fi.EM_DESENVOLVIMENTO && Fi.EM_DESENVOLVIMENTO.length) out.push({ id: "em-desenvolvimento", titulo: "Em desenvolvimento", cab: ["Ainda sem botão", "Hoje, faça assim"],
      linhas: Fi.EM_DESENVOLVIMENTO.map(function (x) { return [x.nome, x.hoje]; }),
      nota: "Estes ainda não estão na fita: entram quando estiverem prontos. Nenhum botão da fita fica sem função." });
    return out;
  }

  /* ---------------------------------------------------------- HTML */
  var CSS = ".bat{font-size:13px;line-height:1.4;color:var(--texto,#1d2733)}.bat h3{margin:14px 0 6px;font-size:14px}.bat h3:first-child{margin-top:0}" +
    ".bat table{width:100%;border-collapse:collapse;margin:0 0 4px}.bat th{text-align:left;font-weight:600;color:var(--texto-fraco,#5b6573);border-bottom:1px solid var(--linha,#d9dee5);padding:3px 8px}" +
    ".bat td{border-top:1px solid var(--linha,#e5e9ee);padding:4px 8px;vertical-align:top}.bat td:first-child{white-space:nowrap;width:1%}" +
    ".bat kbd{display:inline-block;min-width:1.4em;padding:0 5px;border:1px solid var(--linha,#c8ced6);border-bottom-width:2px;border-radius:4px;background:var(--surface-2,#f4f6f8);font:600 12px/1.6 ui-monospace,Consolas,monospace;text-align:center}" +
    ".bat .bat-nota{font-size:12px;color:var(--texto-fraco,#5b6573);margin:2px 0 0}.bat-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:4px 22px}";
  function kbd(t) { return String(t).split(/(\s*\/\s*|\s*·\s*|\s+\+\s+|\+)/).map(function (p) { return /^\s*[\/·+]\s*$|^\s*\+\s*$/.test(p) ? esc(p) : (p ? "<kbd>" + esc(p) + "</kbd>" : ""); }).join(""); }
  function tabela(s) {
    var comTecla = s.id === "teclado" || s.id === "duas-letras" || s.id === "inst";
    return '<section data-bat="' + esc(s.id) + '"><h3>' + esc(s.titulo) + "</h3><table><thead><tr>" + s.cab.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      s.linhas.map(function (l) { return "<tr>" + l.map(function (c, i) { return "<td>" + (i === 0 && comTecla ? kbd(c) : esc(c)) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table>" + (s.nota ? '<p class="bat-nota">' + esc(s.nota) + "</p>" : "") + "</section>";
  }
  function html(op) {
    op = op || {};
    var S = secoes(), larg = S.filter(function (s) { return s.id === "botoes"; }), resto = S.filter(function (s) { return s.id !== "botoes"; });
    var corpo = '<div class="bat" data-bat="raiz"><div class="bat-grade">' + resto.map(tabela).join("") + "</div>" + larg.map(tabela).join("") + "</div>";
    if (!op.imprimir) return "<style>" + CSS + "</style>" + corpo;
    var ver = global.CONFIG && global.CONFIG.versao ? String(global.CONFIG.versao) : "", hoje = new Date(), d = ("0" + hoje.getDate()).slice(-2) + "/" + ("0" + (hoje.getMonth() + 1)).slice(-2) + "/" + hoje.getFullYear();
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>OrçaPRO BIM — Atalhos e comandos</title><style>' + CSS +
      "body{margin:18mm 14mm;font-family:Segoe UI,Arial,sans-serif;color:#1d2733}h1{font-size:18px;margin:0 0 2px}.sub{font-size:12px;color:#5b6573;margin:0 0 12px}" +
      "@page{size:A4;margin:0}@media print{body{margin:12mm 10mm}section{break-inside:avoid}}</style></head><body><h1>OrçaPRO BIM — Atalhos e comandos</h1>" +
      '<p class="sub">RA Engenharia · gerado em ' + esc(d) + (ver ? " · versão " + esc(ver) : "") + "</p>" + corpo + "</body></html>";
  }

  /* ---------------------------------------------------------- VIVA */
  function baixarPdf() {
    var w = null; try { w = global.open("", "_blank"); } catch (e) {}
    if (!w || !w.document) { toast("O navegador bloqueou a janela do PDF. Libere pop-ups para o OrçaPRO e tente de novo.", "aviso", 8000); return false; }
    w.document.open(); w.document.write(html({ imprimir: true })); w.document.close();
    try { w.focus(); setTimeout(function () { try { w.print(); } catch (e2) {} }, 300); } catch (e3) {}
    toast("Atalhos abertos em outra aba: escolha “Salvar como PDF” na impressão.", "ok", 7000);
    return true;
  }
  function abrir() {
    if (!global.UI || !global.UI.modal) return false;
    var bg = global.UI.modal("Atalhos do BIM", html(), [
      { texto: "Baixar PDF", classe: "primary", onClick: function () { baixarPdf(); } }].concat(hidro() && global.BimInstTipos && global.BimInstTipos.abrirAtalhos ? [
      { texto: "Editar atalhos de instalações", classe: "ghost", onClick: function () { global.BimInstTipos.abrirAtalhos(); } }] : []).concat([
      { texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }]));
    try { var m = bg && bg.querySelector ? bg.querySelector(".modal") : null; if (m) m.classList.add("largo"); } catch (e) {}
    return true;
  }
  function campoDeTexto(el) { return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "") || !!el.isContentEditable); }
  /* "?" com o BIM na tela, fora de campo e sem diálogo aberto (no teclado ABNT2 o "?" é Shift+/ — vem em e.key) */
  function instalar(win, doc) {
    win = win || (typeof window !== "undefined" ? window : null); doc = doc || (typeof document !== "undefined" ? document : null);
    if (!win || !doc) return function () {};
    if (win.__bimAtalhosDispor) { try { win.__bimAtalhosDispor(); } catch (e0) {} }
    function naTela() { var r = doc.querySelector(".bim-revit"); return !!(r && r.isConnected && r.getClientRects().length); }
    function aoTecla(e) {
      if (e.key !== "?" || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (campoDeTexto(e.target) || campoDeTexto(doc.activeElement) || doc.getElementById("modal-bg") || !naTela()) return;
      e.preventDefault(); e.stopPropagation(); abrir();
    }
    win.addEventListener("keydown", aoTecla, true);
    var dispor = function () { win.removeEventListener("keydown", aoTecla, true); if (win.__bimAtalhosDispor === dispor) win.__bimAtalhosDispor = null; };
    win.__bimAtalhosDispor = dispor;
    return dispor;
  }

  /* as ações dos mapas que NÃO têm texto (aparecem na tela com o nome interno) — o teste exige lista vazia */
  function semRotulo() {
    var Mo = dep("BimMouse", "./bimmouse.js"), Ct = dep("BimControle", "./bimcontrole.js"), Pr = dep("BimPrecisao", "./bimprecisao.js"), out = [], nomes = {};
    if (Mo && Mo.TECLAS) Object.keys(Mo.TECLAS).forEach(function (k) { if (!ROTULO[Mo.TECLAS[k]]) out.push("tecla " + k + " → " + Mo.TECLAS[k]); });
    if (Ct && Ct.MAPA) Object.keys(Ct.MAPA).forEach(function (i) { if (!ROTULO[Ct.MAPA[i]]) out.push("botão " + i + " → " + Ct.MAPA[i]); if (!BOTAO[i]) out.push("botão " + i + " sem nome"); });
    if (Pr && Pr.FITA) Object.keys(Pr.FITA).forEach(function (g) { (Pr.FITA[g] || []).forEach(function (c) { if (c && c.sub) nomes[c.sub] = 1; }); });
    if (Pr && Pr.ATALHOS) Object.keys(Pr.ATALHOS).forEach(function (k) { var x = Pr.ATALHOS[k]; if (!nomes[x] && !ROTULO_CMD[x] && !rotuloFita(x)) out.push(k + " → " + x); });
    if (Pr && Pr.ATALHOS_CMD) Object.keys(Pr.ATALHOS_CMD).forEach(function (k) { var x = Pr.ATALHOS_CMD[k]; if (!ROTULO_CMD[x] && !nomes[x] && !rotuloFita(x)) out.push(k + " → " + x); });
    return out;
  }

  var BimAtalhos = {
    ROTULO: ROTULO, ROTULO_CMD: ROTULO_CMD, BOTAO: BOTAO,
    secoes: secoes, semRotulo: semRotulo, html: html, abrir: abrir, baixarPdf: baixarPdf, instalar: instalar,
    registrar: function (reg) { reg["atalhos"] = function () { abrir(); return true; }; return true; }
  };
  global.BimAtalhos = BimAtalhos;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAtalhos;
  /* a tecla "?" se instala sozinha no navegador (o BIM pode nem estar aberto: ela confere a tela a cada tecla) */
  if (typeof window !== "undefined" && typeof document !== "undefined") { try { instalar(window, document); } catch (eI) {} }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
