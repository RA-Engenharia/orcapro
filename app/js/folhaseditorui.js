/* =====================================================================
 * folhaseditorui.js — A TELA DO EDITOR DE FOLHAS (fiação fina sobre o motor js/folhaseditor.js). Serve a todas as disciplinas: quem chama entrega o
 * conjunto, a geometria (areaDe) e o que fazer ao salvar / gerar o PDF; a regra (validar, trocar formato, mover, desfazer) mora no motor.
 *
 *   FolhasEditorUI.abrir({ titulo, conjunto, areaDe, formatoBase, empacotar?, miniaturas?, onSalvar(r), onPDF(r), onReorganizar? }) → controle { ed, fechar() }
 *      r = { conjunto, config: { fixos, formatosFolha, arranjoFormato }, validacao }
 *   FolhasEditorUI.svgFolha(folha, area, opc)   SVG (string) da folha grande: papel, área útil, carimbo e os blocos (arrastáveis na tela)
 *   FolhasEditorUI.svgMiniatura(folha, area)    SVG (string) da miniatura da lista
 *
 * A TELA: lista de folhas à esquerda (miniatura, número, formato, ▲▼, apagar vazia, + folha); a folha grande no centro, com os blocos que se ARRASTAM
 * (mouse e toque: pointer events); arrastar um bloco para a MINIATURA de outra folha o move para lá (primeiro lugar livre). Em cima: Reorganizar
 * automático · Desfazer · Refazer. Embaixo: erros e avisos (bloco fora da área, bloco sobre bloco, bloco sobre o carimbo — em vermelho na folha) e
 * Salvar · Gerar PDF · Fechar. Fechar com alteração não salva pergunta (UI.modalSujo).
 * ⚠ O SVG usa a mesma unidade do motor (mm da área útil): converter com getScreenCTM().inverse() — nunca a razão de pixels do contêiner, que muda com a rolagem.
 * Teste: partes puras em tools/test-folhaseditor-ui.js; o e2e de navegador (tools/e2e-folhaseditor.js) arrasta de verdade.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function FE() { return dep("FolhasEditor", "./folhaseditor.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function n2(v) { return String(Math.round(v * 100) / 100); }

  /* ------------------------------------------------------------ SVG (puro) */
  /* a folha grande. Coordenadas do SVG = mm da ÁREA ÚTIL (origem no canto dela); o papel e o carimbo desenham-se em volta quando a geometria os informa
     (area.papel = { w, h, x, y }: tamanho do papel e onde fica a origem da área útil; area.carimboPapel = { x, y, w, h } em coordenadas de papel) */
  function svgFolha(folha, area, opc) {
    var o = opc || {}, val = o.validacao || { porBloco: {}, porFolha: {} }, pap = area.papel || { w: area.w + 40, h: area.h + 20, x: 20, y: 10 };
    var vx = -pap.x, vy = -pap.y, vw = pap.w, vh = pap.h, h = [];
    h.push('<svg xmlns="http://www.w3.org/2000/svg" data-fe="canvas" data-folha="' + esc(folha.id) + '" viewBox="' + n2(vx) + " " + n2(vy) + " " + n2(vw) + " " + n2(vh) + '" style="width:100%;height:100%;touch-action:none;user-select:none;background:#fff" font-family="Verdana,Arial,sans-serif">');
    h.push('<rect x="' + n2(vx) + '" y="' + n2(vy) + '" width="' + n2(vw) + '" height="' + n2(vh) + '" fill="#fff" stroke="#999" stroke-width="0.6"/>');
    if (area.papel) h.push('<rect x="' + n2(-pap.x + 20) + '" y="' + n2(-pap.y + 10) + '" width="' + n2(pap.w - 30) + '" height="' + n2(pap.h - 20) + '" fill="none" stroke="#bbb" stroke-width="0.5"/>');
    h.push('<rect data-fe="area" x="0" y="0" width="' + n2(area.w) + '" height="' + n2(area.h) + '" fill="#fafafa" stroke="#9aa" stroke-width="0.6" stroke-dasharray="4 3"/>');
    if (area.carimboPapel) { var c = area.carimboPapel; h.push('<rect data-fe="carimbo" x="' + n2(c.x + vx) + '" y="' + n2(c.y + vy) + '" width="' + n2(c.w) + '" height="' + n2(c.h) + '" fill="#e8e8e8" stroke="#888" stroke-width="0.5"/><text x="' + n2(c.x + vx + c.w / 2) + '" y="' + n2(c.y + vy + c.h / 2) + '" font-size="8" text-anchor="middle" fill="#666">CARIMBO RA</text>'); }
    if (area.carimbo) h.push('<rect data-fe="carimbo-area" x="' + n2(area.carimbo.x) + '" y="' + n2(area.carimbo.y) + '" width="' + n2(area.carimbo.w) + '" height="' + n2(area.carimbo.h) + '" fill="#e8e8e8" stroke="#888" stroke-width="0.5"/>');
    arr(folha.blocos).forEach(function (b, i) {
      var erros = arr(val.porBloco[b.id]), ruim = erros.length > 0, cor = ruim ? "#d32f2f" : (b.fixo ? "#1565c0" : "#2e7d32"), fundo = ruim ? "#ffcdd2" : (b.fixo ? "#e3f0ff" : "#e8f5e9");
      var tam = Math.max(3.2, Math.min(9, b.h / 6, b.w / (String(b.desenho).length * 0.62 + 1)));
      h.push('<g data-fe-bloco="' + esc(b.id) + '" data-x="' + n2(b.x) + '" data-y="' + n2(b.y) + '" data-w="' + n2(b.w) + '" data-h="' + n2(b.h) + '"' + (ruim ? ' data-erro="1"' : "") + (b.fixo ? ' data-fixo="1"' : "") + ' style="cursor:grab">' +
        '<rect x="' + n2(b.x) + '" y="' + n2(b.y) + '" width="' + n2(b.w) + '" height="' + n2(b.h) + '" fill="' + fundo + '" stroke="' + cor + '" stroke-width="' + (ruim ? 1.4 : 0.9) + '"/>' +
        '<text x="' + n2(b.x + b.w / 2) + '" y="' + n2(b.y + b.h / 2) + '" font-size="' + n2(tam) + '" text-anchor="middle" fill="#222" pointer-events="none">' + esc(b.desenho) + "</text>" +
        (b.escala ? '<text x="' + n2(b.x + b.w / 2) + '" y="' + n2(b.y + b.h / 2 + tam * 1.3) + '" font-size="' + n2(tam * 0.8) + '" text-anchor="middle" fill="#555" pointer-events="none">' + esc(b.escala) + "</text>" : "") +
        (b.fixo ? '<text x="' + n2(b.x + 3) + '" y="' + n2(b.y + 8) + '" font-size="7" fill="#1565c0" pointer-events="none">&#128274;</text>' : "") + "</g>");
    });
    h.push("</svg>");
    return h.join("");
  }
  function svgMiniatura(folha, area, opc) {
    var o = opc || {}, pap = area.papel || { w: area.w + 40, h: area.h + 20, x: 20, y: 10 }, val = o.validacao || { porBloco: {} }, h = [];
    h.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + n2(-pap.x) + " " + n2(-pap.y) + " " + n2(pap.w) + " " + n2(pap.h) + '" style="width:100%;height:auto;background:#fff;display:block">');
    h.push('<rect x="' + n2(-pap.x) + '" y="' + n2(-pap.y) + '" width="' + n2(pap.w) + '" height="' + n2(pap.h) + '" fill="#fff" stroke="#999" stroke-width="2"/>');
    h.push('<rect x="0" y="0" width="' + n2(area.w) + '" height="' + n2(area.h) + '" fill="#fafafa" stroke="#bbb" stroke-width="1.2"/>');
    arr(folha.blocos).forEach(function (b) { var ruim = arr(val.porBloco[b.id]).length > 0; h.push('<rect x="' + n2(b.x) + '" y="' + n2(b.y) + '" width="' + n2(b.w) + '" height="' + n2(b.h) + '" fill="' + (ruim ? "#ffcdd2" : "#c8e6c9") + '" stroke="' + (ruim ? "#d32f2f" : "#2e7d32") + '" stroke-width="2"/>'); });
    h.push("</svg>");
    return h.join("");
  }

  /* ------------------------------------------------------------ a tela */
  var CSS_FEITO = false;
  function css() {
    if (CSS_FEITO || !global.document) return; CSS_FEITO = true;
    var s = global.document.createElement("style");
    s.textContent = ".fe-raiz{display:grid;grid-template-columns:230px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:10px;height:calc(100vh - 300px);min-height:360px;font-size:13px}" +
      ".fe-lista{min-height:0;overflow:auto;border:1px solid var(--linha,#ccc);border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:8px}" +
      ".fe-item{border:2px solid var(--linha,#ccc);border-radius:6px;padding:4px;cursor:pointer;background:var(--bg,#fff)}" +
      ".fe-item.ativa{border-color:#1565c0}.fe-item.alvo{border-color:#ef6c00;background:#fff3e0}.fe-item.ruim{border-color:#d32f2f}" +
      ".fe-item .fe-linha{display:flex;gap:4px;align-items:center;margin-top:3px;flex-wrap:wrap}" +
      ".fe-centro{display:flex;flex-direction:column;min-width:0;min-height:0;gap:6px}.fe-barra{display:flex;gap:6px;flex-wrap:wrap;align-items:center}" +
      ".fe-tela{flex:1;min-height:260px;border:1px solid var(--linha,#ccc);border-radius:6px;overflow:hidden;background:#eee}" +
      ".fe-msgs{max-height:120px;overflow:auto;font-size:12.5px}.fe-msgs .e{color:#c62828}.fe-msgs .a{color:#b26a00}.fe-msgs .o{color:#2e7d32}" +
      "@media (max-width:760px){.fe-raiz{grid-template-columns:1fr;height:auto}.fe-lista{flex-direction:row;overflow-x:auto}.fe-item{min-width:150px}}";
    global.document.head.appendChild(s);
  }

  function abrir(conf) {
    var U = global.UI, doc = global.document, F = FE();
    if (!U || !U.modal || !doc || !F) return null;
    css();
    var ed = F.criar(conf.conjunto, { areaDe: conf.areaDe, formatoBase: conf.formatoBase, empacotar: conf.empacotar }), areaDe = conf.areaDe || F.areaPadrao;
    var sel = (ed.conjunto().folhas[0] || {}).id || null, msg = "", ctrl = { ed: ed }, drag = null, salvouAlgumaVez = false;
    var bg = U.modal(conf.titulo || "Editor de folhas", '<div class="fe-raiz" data-modal-largo="1" data-fe="raiz"></div><div class="fe-msgs" data-fe="msgs" style="margin-top:6px"></div>', [
      { texto: "Fechar", classe: "ghost", onClick: function () { if (ed.alterado() && !salvouAlgumaVez && !global.confirm("Há alterações não salvas no arranjo das folhas. Fechar e perder?")) return; fechar(); } },
      { texto: "Gerar PDF", classe: "ghost", onClick: function () { var r = resultado(); if (!r.validacao.ok && !global.confirm(r.validacao.erros.length + " erro(s) no arranjo (bloco fora da área ou sobreposto). Gerar o PDF assim mesmo?")) return; if (conf.onPDF) conf.onPDF(r); } },
      { texto: "Salvar", classe: "primary", onClick: function () { var r = resultado(); if (conf.onSalvar) { var ret = conf.onSalvar(r); if (ret === false) return; if (ret && ret.conjunto) { ed = F.criar(ret.conjunto, { areaDe: conf.areaDe, formatoBase: conf.formatoBase, empacotar: conf.empacotar }); ctrl.ed = ed; if (ret.miniaturas) conf.miniaturas = ret.miniaturas; } } salvouAlgumaVez = true; avisar(r.validacao.ok ? "Arranjo salvo: vale na próxima geração." : "Arranjo salvo COM " + r.validacao.erros.length + " erro(s) (veja em vermelho).", r.validacao.ok); } }
    ]);
    var modalEl = bg && bg.querySelector ? bg.querySelector(".modal") : null;
    if (modalEl) { modalEl.style.maxWidth = "96vw"; modalEl.style.width = "1280px"; }
    if (U.modalSujo) U.modalSujo(function () { return ed.alterado() && !salvouAlgumaVez; });
    var raiz = bg.querySelector('[data-fe="raiz"]'), msgs = bg.querySelector('[data-fe="msgs"]');
    function fechar() { if (U.fecharModal) U.fecharModal(); if (conf.onFechar) conf.onFechar(); }
    ctrl.fechar = fechar;
    function resultado() { return { conjunto: ed.conjunto(), config: ed.paraConfig(), validacao: ed.validar() }; }
    function avisar(t, bom) { msg = t; desenhar(bom ? "o" : "a"); }
    function areaFolha(f) { return areaDe(f.formato, f.orientacao) || F.areaPadrao(f.formato, f.orientacao); }

    function desenhar(tipoMsg) {
      var c = ed.conjunto(), v = ed.validar(), pode = ed.pode();
      if (!sel || c.folhas.filter(function (f) { return f.id === sel; }).length === 0) sel = c.folhas.length ? c.folhas[0].id : null;
      var h = '<div class="fe-lista" data-fe="lista">';
      c.folhas.forEach(function (f, i) {
        var a = areaFolha(f), ruim = arr(v.porFolha[f.id]).length > 0, mini = conf.miniaturas && conf.miniaturas[f.id] && !ed.alterado() ? '<img src="' + esc(conf.miniaturas[f.id]) + '" style="width:100%;display:block;background:#fff" alt="">' : svgMiniatura(f, a, { validacao: v });
        h += '<div class="fe-item' + (f.id === sel ? " ativa" : "") + (ruim ? " ruim" : "") + '" data-fe-folha="' + esc(f.id) + '" data-fe-numero="' + (i + 1) + '">' + mini +
          '<div class="fe-linha"><b>' + (i + 1) + "</b> · " + f.blocos.length + " bloco(s)" + (ruim ? ' <span style="color:#c62828">&#9888;</span>' : "") + "</div>" +
          '<div class="fe-linha"><select data-fe-formato="' + esc(f.id) + '" title="Formato desta folha (o carimbo vai junto)">' + F.ORDEM_FORMATOS.map(function (k) { return '<option value="' + k + '"' + (f.formato === k ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select>" +
          '<button class="btn ghost sm" data-fe-sobe="' + esc(f.id) + '" title="Subir"' + (i === 0 ? " disabled" : "") + ">&#9650;</button>" +
          '<button class="btn ghost sm" data-fe-desce="' + esc(f.id) + '" title="Descer"' + (i === c.folhas.length - 1 ? " disabled" : "") + ">&#9660;</button>" +
          '<button class="btn ghost sm" data-fe-apaga="' + esc(f.id) + '" title="Apagar (só folha vazia)"' + (f.blocos.length ? " disabled" : "") + ">&#10005;</button></div></div>";
      });
      h += '<button class="btn ghost sm" data-fe-acao="nova">+ Folha</button></div>';
      var fs = c.folhas.filter(function (f) { return f.id === sel; })[0], bsel = global.__feSelBloco && fs ? fs.blocos.filter(function (b) { return b.id === global.__feSelBloco; })[0] : null;
      h += '<div class="fe-centro"><div class="fe-barra"><button class="btn ghost sm" data-fe-acao="auto">Reorganizar automático</button>' +
        '<button class="btn ghost sm" data-fe-acao="desfazer"' + (pode.desfazer ? "" : " disabled") + '>Desfazer</button><button class="btn ghost sm" data-fe-acao="refazer"' + (pode.refazer ? "" : " disabled") + ">Refazer</button>" +
        '<span class="muted">' + (fs ? "Folha " + (c.folhas.indexOf(fs) + 1) + " · " + fs.formato + " · área útil " + Math.round(areaFolha(fs).w) + " x " + Math.round(areaFolha(fs).h) + " mm" : "") + "</span></div>" +
        '<div class="fe-tela" data-fe="tela">' + (fs ? svgFolha(fs, areaFolha(fs), { validacao: v }) : "") + "</div>" +
        '<div class="fe-barra" data-fe="props">' + (bsel ? '<b>' + esc(bsel.desenho) + '</b> x <input data-fe-x type="number" step="1" value="' + n2(bsel.x) + '" style="width:70px"> y <input data-fe-y type="number" step="1" value="' + n2(bsel.y) + '" style="width:70px"> ' +
          '<label><input type="checkbox" data-fe-fixo' + (bsel.fixo ? " checked" : "") + "> fixar (o gerador respeita)</label>" : '<span class="muted">Clique num bloco para ver e ajustar; arraste para mover; solte sobre a miniatura de outra folha para mandar para lá.</span>') + "</div></div>";
      raiz.innerHTML = h;
      var ms = "";
      v.erros.forEach(function (e) { ms += '<div class="e">&#9888; ' + esc(e.msg) + "</div>"; });
      v.avisos.slice(0, 6).forEach(function (a) { ms += '<div class="a">&#9888; ' + esc(a.msg) + "</div>"; });
      if (msg) ms += '<div class="' + (tipoMsg || "a") + '">' + esc(msg) + "</div>";
      if (!v.erros.length && !v.avisos.length && !msg) ms = '<div class="o">Arranjo sem erro: nenhum bloco fora da área, sobreposto ou sobre o carimbo.</div>';
      msgs.innerHTML = ms; msg = "";
      ligar();
    }

    function executar(r) { if (r.ok) salvouAlgumaVez = false; if (!r.ok) { msg = r.erro; desenhar("e"); return false; } if (r.aviso) msg = r.aviso; desenhar(r.semLugar && r.semLugar.length ? "e" : "a"); return true; }
    function ligar() {
      Array.prototype.forEach.call(raiz.querySelectorAll("[data-fe-folha]"), function (el) {
        el.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("select,button")) return; sel = el.getAttribute("data-fe-folha"); global.__feSelBloco = null; desenhar(); });
      });
      Array.prototype.forEach.call(raiz.querySelectorAll("[data-fe-formato]"), function (el) { el.addEventListener("change", function () { sel = el.getAttribute("data-fe-formato"); executar(ed.trocarFormato(sel, el.value)); }); });
      Array.prototype.forEach.call(raiz.querySelectorAll("[data-fe-sobe]"), function (el) { el.addEventListener("click", function () { var id = el.getAttribute("data-fe-sobe"), i = ed.conjunto().folhas.map(function (f) { return f.id; }).indexOf(id); executar(ed.reordenar(id, i)); }); });
      Array.prototype.forEach.call(raiz.querySelectorAll("[data-fe-desce]"), function (el) { el.addEventListener("click", function () { var id = el.getAttribute("data-fe-desce"), i = ed.conjunto().folhas.map(function (f) { return f.id; }).indexOf(id); executar(ed.reordenar(id, i + 2)); }); });
      Array.prototype.forEach.call(raiz.querySelectorAll("[data-fe-apaga]"), function (el) { el.addEventListener("click", function () { executar(ed.apagarFolha(el.getAttribute("data-fe-apaga"))); }); });
      Array.prototype.forEach.call(raiz.querySelectorAll("[data-fe-acao]"), function (el) {
        el.addEventListener("click", function () {
          var a = el.getAttribute("data-fe-acao");
          if (a === "nova") { var r = ed.criarFolha(); if (r.ok) sel = r.id; executar(r); }
          else if (a === "desfazer") executar(ed.desfazer());
          else if (a === "refazer") executar(ed.refazer());
          else if (a === "auto") { if (conf.onReorganizar) { var c2 = conf.onReorganizar(); if (c2 && c2.folhas) { ed = F.criar(c2, { areaDe: conf.areaDe, formatoBase: conf.formatoBase, empacotar: conf.empacotar }); ctrl.ed = ed; msg = "Arranjo automático do gerador aplicado."; desenhar("o"); return; } } executar(ed.reorganizarAuto()); }
        });
      });
      var fx = raiz.querySelector("[data-fe-fixo]"), ix = raiz.querySelector("[data-fe-x]"), iy = raiz.querySelector("[data-fe-y]");
      if (fx) fx.addEventListener("change", function () { executar(fx.checked ? ed.fixar(global.__feSelBloco) : ed.soltar(global.__feSelBloco)); });
      function numeros() { executar(ed.moverBloco(global.__feSelBloco, sel, +ix.value, +iy.value)); }
      if (ix) ix.addEventListener("change", numeros); if (iy) iy.addEventListener("change", numeros);
      var svg = raiz.querySelector('svg[data-fe="canvas"]');
      if (svg) ligarArrasto(svg);
    }

    /* ARRASTAR: pointer events (mouse e toque). Durante o arrasto o bloco anda sozinho no SVG (sem passar pelo histórico); ao soltar, UMA operação do motor. */
    function mm(svg, ev) { var p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; var m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
    function ligarArrasto(svg) {
      Array.prototype.forEach.call(svg.querySelectorAll("[data-fe-bloco]"), function (g) {
        g.addEventListener("pointerdown", function (ev) {
          ev.preventDefault();
          var id = g.getAttribute("data-fe-bloco"), p0 = mm(svg, ev), x0 = +g.getAttribute("data-x"), y0 = +g.getAttribute("data-y");
          drag = { id: id, g: g, svg: svg, dx: p0.x - x0, dy: p0.y - y0, x: x0, y: y0, moveu: false };
          global.__feSelBloco = id;
          /* ⚠ os ouvintes de mover/soltar vão no DOCUMENTO, não no bloco: com o ponteiro sobre a miniatura (o destino do arrasto) o setPointerCapture não pegou e o
             pointerup nunca chegava ao bloco (medido no e2e: o bloco soltado sobre a miniatura não mudava de folha). O documento recebe de qualquer ponto, no mouse e no toque. */
          doc.addEventListener("pointermove", mover); doc.addEventListener("pointerup", soltar); doc.addEventListener("pointercancel", soltar);
          try { g.setPointerCapture(ev.pointerId); } catch (eP) { /* sem captura: o documento cobre */ }
        });
        function mover(ev) {
          if (!drag || drag.g !== g) return;
          var p = mm(svg, ev), nx = Math.round(p.x - drag.dx), ny = Math.round(p.y - drag.dy);
          if (nx !== drag.x || ny !== drag.y) { drag.moveu = true; drag.x = nx; drag.y = ny; g.setAttribute("transform", "translate(" + (nx - (+g.getAttribute("data-x"))) + " " + (ny - (+g.getAttribute("data-y"))) + ")"); }
          var alvo = itemSob(ev.clientX, ev.clientY);
          Array.prototype.forEach.call(raiz.querySelectorAll(".fe-item"), function (it) { it.classList.toggle("alvo", it === alvo && it.getAttribute("data-fe-folha") !== sel); });
        }
        function soltar(ev) {
          doc.removeEventListener("pointermove", mover); doc.removeEventListener("pointerup", soltar); doc.removeEventListener("pointercancel", soltar);
          if (!drag || drag.g !== g) return;
          var d = drag; drag = null;
          try { g.releasePointerCapture(ev.pointerId); } catch (eP) { /* já solto */ }
          var alvo = itemSob(ev.clientX, ev.clientY), destino = alvo ? alvo.getAttribute("data-fe-folha") : null;
          if (!d.moveu) { desenhar(); return; }
          if (destino && destino !== sel) { var r = ed.moverBloco(d.id, destino); if (r.ok) sel = destino; executar(r); return; }
          executar(ed.moverBloco(d.id, sel, d.x, d.y));
        }
      });
    }
    function itemSob(x, y) {
      var el = doc.elementFromPoint ? doc.elementFromPoint(x, y) : null;
      while (el && el !== raiz) { if (el.classList && el.classList.contains("fe-item")) return el; el = el.parentNode; }
      return null;
    }

    ctrl.resultado = resultado; ctrl.redesenhar = desenhar;
    global.FolhasEditorUI._ultimo = ctrl;
    desenhar();
    return ctrl;
  }

  var FolhasEditorUI = { VERSAO: 1, abrir: abrir, svgFolha: svgFolha, svgMiniatura: svgMiniatura, _ultimo: null };
  global.FolhasEditorUI = FolhasEditorUI;
  if (typeof module !== "undefined" && module.exports) module.exports = FolhasEditorUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
