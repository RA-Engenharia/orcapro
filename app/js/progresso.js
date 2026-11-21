/* =====================================================================
 * progresso.js — BARRA DE PROGRESSO GLOBAL (regra do Rogério, 20/11/2026:
 * "TUDO que carrega no sistema mostra progresso"). Motor PURO (estimador de
 * etapas, sem DOM) + o componente de tela (UI.progresso).
 *
 *   var est = Progresso.estimador([{ id, peso, rotulo }…])
 *   est.etapa(id, frac, texto)  → avança (nunca volta: o % é MONOTÔNICO);
 *   est.estado(agoraMs)         → { pct 0–100, etapa, texto, decorridoMs, restanteMs|null }
 *   Os PESOS são a fração do tempo de cada etapa medida no perfil do cálculo
 *   (galpão tesoura leve 20 × 30 m, 20/11/2026: análise 2ª ordem ~78 %,
 *   flambagem ~7 %, verificação das barras ~8 %, montagem/leitura ~7 % — com o
 *   solver esparso; antes dele a fatoração sozinha era 71 %).
 *
 *   var p = UI.progresso(elementoOuSeletor, { titulo, etapas, cancelar: fn, indeterminado })
 *   p.etapa(id, frac, texto) · p.texto(t) · p.fim() · p.erro(msg) · p.elemento
 *   Sem etapas (ou indeterminado: true): barra em movimento, sem %, com o tempo decorrido.
 *   O desenho é throttled (no máximo ~4 por segundo): quem chama pode avisar a cada passo.
 *
 * Teste: node tools/test-progresso.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function agora() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

  function estimador(etapas, op) {
    op = op || {};
    var lista = (etapas || []).map(function (e) { return { id: e.id, peso: Math.max(0, num(e.peso, 1)), rotulo: e.rotulo || e.id }; });
    var total = 0; lista.forEach(function (e) { total += e.peso; }); if (!(total > 0)) total = 1;
    var ini = {}, acc = 0; lista.forEach(function (e) { ini[e.id] = acc / total; acc += e.peso; });
    var t0 = num(op.t0, agora()), pct = 0, atual = null, texto = "";
    var E = {
      etapa: function (id, frac, txt) {
        var e = lista.filter(function (x) { return x.id === id; })[0];
        if (e) {
          var f = Math.max(0, Math.min(1, num(frac, 0))), alvo = 100 * (ini[id] + f * e.peso / total);
          if (alvo > pct) pct = alvo;   /* MONOTÔNICO: etapa que volta (rodada nova do otimizador) não desce a barra */
          atual = e;
        }
        if (txt != null) texto = String(txt); else if (e) texto = e.rotulo;
        return E;
      },
      concluir: function () { pct = 100; return E; },
      estado: function (t) {
        var d = num(t, agora()) - t0, p = Math.min(100, pct);
        return { pct: p, etapa: atual ? atual.id : null, texto: texto, decorridoMs: d, restanteMs: p > 2 && p < 100 ? d * (100 - p) / p : (p >= 100 ? 0 : null) };
      }
    };
    return E;
  }
  function tempo(ms) {
    if (ms == null || !isFinite(ms)) return "—";
    var s = Math.round(ms / 1000); if (s < 60) return s + " s";
    var m = Math.floor(s / 60); return m + " min " + (s % 60 < 10 ? "0" : "") + (s % 60) + " s";
  }
  function html(st, op) {
    op = op || {};
    var ind = !!op.indeterminado, pct = Math.round(num(st.pct, 0));
    return '<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="100"' + (ind ? "" : ' aria-valuenow="' + pct + '"') + ' aria-label="' + esc(op.titulo || "Progresso") + '" data-prog="' + (ind ? "ind" : pct) + '">' +
      (op.titulo ? '<div class="prog-tit">' + esc(op.titulo) + "</div>" : "") +
      '<div class="prog-trilho"><div class="prog-barra' + (ind ? " ind" : "") + '" style="width:' + (ind ? 35 : pct) + '%"></div></div>' +
      '<div class="prog-lin"><span class="prog-etapa">' + esc(st.texto || "") + "</span><span class=\"prog-num\">" + (ind ? "" : pct + " % · ") + tempo(st.decorridoMs) + (ind || st.restanteMs == null ? "" : " · falta ~" + tempo(st.restanteMs)) + "</span></div>" +
      (op.cancelar ? '<button type="button" class="prog-cancelar" data-prog-cancelar>Cancelar</button>' : "") + "</div>";
  }
  var CSS = ".prog{font:13px system-ui,sans-serif;padding:10px 0}.prog-tit{font-weight:600;margin-bottom:6px}.prog-trilho{height:8px;border-radius:4px;background:var(--borda,#dde5ee);overflow:hidden;position:relative}" +
    ".prog-barra{height:100%;background:var(--pri,#0d6ebd);border-radius:4px;transition:width .2s linear}.prog-barra.ind{position:absolute;left:-35%;animation:prog-ind 1.2s ease-in-out infinite}" +
    "@keyframes prog-ind{0%{left:-35%}100%{left:100%}}@media (prefers-reduced-motion:reduce){.prog-barra.ind{animation:none;left:0;width:100%!important;opacity:.45}}" +
    ".prog-lin{display:flex;justify-content:space-between;gap:12px;margin-top:6px;color:var(--muted,#55677a)}.prog-num{font-variant-numeric:tabular-nums;white-space:nowrap}.prog-cancelar{margin-top:8px}";
  function garantirCss(doc) { try { if (!doc || doc.getElementById("prog-css")) return; var s = doc.createElement("style"); s.id = "prog-css"; s.textContent = CSS; doc.head.appendChild(s); } catch (e) {} }

  /* componente: desenha no elemento, no máximo a cada `intervaloMs` (padrão 250 ms ≈ 4/s) */
  function criar(alvo, op) {
    op = op || {};
    var doc = typeof document !== "undefined" ? document : null, el = typeof alvo === "string" && doc ? doc.querySelector(alvo) : alvo;
    garantirCss(doc);
    /* 21/11/2026: fundo decorativo de estrutura metálica atrás do cartão (js/fundometal.js) — op.fundo: true (o .ml-palco ou o pai do cartão) ou o elemento/seletor */
    var fundo = null;
    if (op.fundo && el && global.FundoMetal && doc) { try { var hosp = op.fundo === true ? (el.closest && (el.closest(".ml-palco") || el.closest("[data-fundo-metal-host]"))) || el.parentNode : (typeof op.fundo === "string" ? doc.querySelector(op.fundo) : op.fundo); if (hosp) fundo = global.FundoMetal.montar(hosp, {}); } catch (eF) { fundo = null; } }
    var ind = !!op.indeterminado || !(op.etapas && op.etapas.length), est = estimador(ind ? [{ id: "_", peso: 1 }] : op.etapas, {}), ult = 0, timer = null, vivo = true, intervalo = num(op.intervaloMs, 250);
    if (op.texto) est.etapa(ind ? "_" : op.etapas[0].id, 0, op.texto);
    function desenhar() {
      timer = null; ult = agora(); if (!el) return;
      el.innerHTML = html(est.estado(), { titulo: op.titulo, indeterminado: ind, cancelar: vivo && op.cancelar });
      var b = el.querySelector && el.querySelector("[data-prog-cancelar]");
      if (b) b.onclick = function () { if (!vivo) return; vivo = false; b.disabled = true; b.textContent = "Cancelando…"; try { op.cancelar(); } catch (e) {} };
    }
    function agendar() { if (timer) return; var falta = intervalo - (agora() - ult); if (falta <= 0) desenhar(); else timer = setTimeout(desenhar, falta); }
    desenhar();
    /* o relógio anda mesmo quando ninguém avisa (modo indeterminado, etapa longa) */
    var relogio = setInterval(function () { if (vivo) agendar(); }, 1000);
    var P = {
      elemento: el,
      etapa: function (id, frac, txt) { est.etapa(ind ? "_" : id, frac, txt); agendar(); return P; },
      texto: function (t) { est.etapa(ind ? "_" : (est.estado().etapa || op.etapas[0].id), 0, t); agendar(); return P; },
      estado: function () { return est.estado(); },
      fim: function () { if (fundo) { fundo.remover(); fundo = null; } vivo = false; clearInterval(relogio); est.concluir(); if (timer) clearTimeout(timer); desenhar(); return P; },
      erro: function (msg) { if (fundo) { fundo.remover(); fundo = null; } vivo = false; clearInterval(relogio); if (timer) clearTimeout(timer); if (el) el.innerHTML = '<div class="prog prog-erro" role="alert">' + esc(msg) + "</div>"; return P; }
    };
    return P;
  }

  /* pesos medidos (perfil do cálculo da estrutura desenhada, 20/11/2026) */
  var ETAPAS_CALCULO = [
    { id: "modelo", peso: 4, rotulo: "Montando o modelo" },
    { id: "analise", peso: 50, rotulo: "Análise (combinações, 2ª ordem)" },
    { id: "analise80", peso: 28, rotulo: "Análise com rigidez reduzida (0,8)" },
    { id: "flambagem", peso: 7, rotulo: "Flambagem global" },
    { id: "verificacao", peso: 8, rotulo: "Verificando as barras" },
    { id: "fim", peso: 3, rotulo: "Resultados" }
  ];
  var Progresso = { estimador: estimador, html: html, criar: criar, tempo: tempo, ETAPAS_CALCULO: ETAPAS_CALCULO, CSS: CSS };
  global.Progresso = Progresso;
  if (global.UI && !global.UI.progresso) global.UI.progresso = criar;
  if (typeof module !== "undefined" && module.exports) module.exports = Progresso;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
