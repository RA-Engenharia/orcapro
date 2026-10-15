/* =====================================================================
 * metalligautoui.js — a TELA da LIGAÇÃO AO LANÇAR, da VIGA EM BALANÇO e das
 * LIGAÇÕES CONFIRMADAS PELO CÁLCULO (Metálica). 15/10/2026 — BACKLOG #43.
 *
 * Fina: quem decide é o js/metalligauto.js. Aqui:
 *   · a configuração POR OBRA ("Ligações ao lançar: parafusada | soldada |
 *     não colocar"; "Depois do cálculo: ajustar sozinho | só sugerir") —
 *     guardada no aparelho por obra (`orcapro:metal:ligauto:<obra>`, como o
 *     cálculo da estrutura desenhada guarda o dele), sem armazenamento: o
 *     padrão (parafusada, ajustar sozinho);
 *   · aoLancar(caixas, viga): o lote da viga com as ligações (a ferramenta
 *     Viga do js/metalcriarui.js envia) e depoisDeLancar(): a ponta que não
 *     encosta em nada PERGUNTA se é balanço;
 *   · balanco(id): o painel das 3 soluções ranqueadas (a carga de serviço
 *     declarada recalcula), "Aplicar esta" (um lote, Ctrl+Z desfaz);
 *   · aposCalculo(r): depois do cálculo, as ligações "a confirmar" — o lote da
 *     troca (modo ajustar) e o quadro "Ligações ajustadas pelo cálculo"
 *     (antes → depois, razão), os balanços CRÍTICOS e as sugestões de
 *     travamento (FLT).
 * Cores: tokens do css/app.css (tema claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  function A() { return global.MetalLigAuto || null; }
  function MU() { return global.BimMetalUI || null; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 1 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function pct(r) { return br(num(r, 0) * 100, 0) + " %"; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 7000); } catch (e) {} }
  function caixas() { var M = MU(), st = M && M.estado ? M.estado() : null; return (st && st.caixas) || []; }
  function novoId() { var M = MU(); return M && M.novoId ? M.novoId() : "mla-" + Date.now().toString(36) + "-" + Math.round(Math.random() * 1e6).toString(36); }
  function enviar(ops, pedido) {
    var M = MU(); if (!M || !M.enviar || !ops.length) return false;
    return !!M.enviar({ op: "lote", id: novoId(), origem: "metal-lig-auto", pedido: String(pedido || "").slice(0, 300), ops: ops });
  }
  function materiais() { try { var U = global.MetalLigSugUI; var m = U && U.materiais ? U.materiais() : null; return m && Object.keys(m).length ? m : null; } catch (e) { return null; } }
  function fundacoes() { try { var st = global.BIM && BIM.editarEstado ? BIM.editarEstado().estado : null; return (st && st.fundacoes) || []; } catch (e) { return []; } }

  /* ------------------------------------------------------------ configuração por obra */
  var CHAVE = "orcapro:metal:ligauto:";
  function obraId() { var g = global.Gestao; return String((g && g._bimSel) || "geral"); }
  var memo = {};
  function cfg() {
    var k = obraId(); if (memo[k]) return memo[k];
    var o = null; try { o = JSON.parse(global.localStorage.getItem(CHAVE + k) || "null"); } catch (e) { o = null; }
    memo[k] = A() ? A().cfgOk(o) : { aoLancar: "parafusada", aposCalculo: "ajustar" };
    return memo[k];
  }
  function definir(campo, v) {
    var c = cfg(), n = {}; Object.keys(c).forEach(function (k) { n[k] = c[k]; }); n[campo] = v;
    n = A() ? A().cfgOk(n) : n; memo[obraId()] = n;
    try { global.localStorage.setItem(CHAVE + obraId(), JSON.stringify(n)); } catch (e) { /* sem armazenamento: fica na memória */ }
    status(campo === "aoLancar" ? "Ligações ao lançar (esta obra): " + (A() ? A().MEIOS[n.aoLancar] : n.aoLancar) + "." : "Depois do cálculo (esta obra): " + (n.aposCalculo === "sugerir" ? "só sugerir" : "ajustar sozinho") + ".");
    return n;
  }

  /* ------------------------------------------------------------ estilo (tokens) */
  function css() {
    if (typeof document === "undefined" || document.getElementById("mla-css")) return;
    var s = document.createElement("style"); s.id = "mla-css";
    s.textContent = ".mla{display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--texto)}.mla p{margin:0}" +
      ".mla-nota{font-size:11.5px;color:var(--texto-fraco)}.mla-crit{border:2px solid var(--vermelho);border-radius:8px;padding:8px 10px;color:var(--vermelho);font-weight:600}" +
      ".mla-cargas{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}.mla-cargas input{width:5em;min-height:30px}" +
      ".mla-ops{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}" +
      ".mla-op{border:1px solid var(--linha);border-radius:10px;background:var(--card-bg,var(--surface));padding:10px;display:flex;flex-direction:column;gap:6px;min-width:0}" +
      ".mla-op.ok{border-color:var(--verde)}.mla-op.nok{border-color:var(--vermelho)}.mla-op.na{opacity:.8}.mla-op.aplicada{box-shadow:0 0 0 2px var(--aco,var(--verde))}" +
      ".mla-op h3{font-size:14px;margin:0}.mla-chips{display:flex;flex-wrap:wrap;gap:4px}.mla-chip{font-size:11px;border:1px solid var(--linha);border-radius:999px;padding:1px 8px;color:var(--texto-fraco)}" +
      ".mla-chip.ok{color:var(--verde);border-color:var(--verde)}.mla-chip.nok{color:var(--vermelho);border-color:var(--vermelho)}" +
      ".mla-op ul{margin:0;padding-left:16px;font-size:11.5px}.mla-op table{width:100%;border-collapse:collapse;font-size:11px}.mla-op td{border-top:1px solid var(--linha);padding:2px 4px;vertical-align:top}" +
      ".mla-op .acoes{margin-top:auto;display:flex;gap:6px;flex-wrap:wrap}" +
      ".mla-perg{position:fixed;left:16px;bottom:56px;z-index:45;max-width:min(420px,calc(100vw - 32px));background:var(--surface);color:var(--texto);border:1px solid var(--aco,var(--linha));border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:10px 12px;display:flex;flex-direction:column;gap:6px;font-size:13px}" +
      ".mla-perg p{margin:0}.mla-perg .acoes{display:flex;gap:6px;flex-wrap:wrap}" +
      "@media (max-width:760px){.mla-ops{grid-template-columns:1fr}}";
    document.head.appendChild(s);
  }

  var U = { ultimoLancar: null, ultimoBalanco: null, ultimoAplicado: null, ultimoCalculo: null };

  /* ------------------------------------------------------------ AO LANÇAR */
  function aoLancar(cxs, viga) {
    var M0 = A(); if (!M0) return null;
    var ex = M0.aoLancar(cxs || caixas(), viga, { meio: cfg().aoLancar, novoId: novoId, materiais: materiais() });
    U.ultimoLancar = ex;
    return ex;
  }
  function depoisDeLancar(ex) {
    if (!ex) return;
    if (ex.pendentes.length) toast(ex.pendentes.map(function (p) { return p.texto; }).join(" "), "aviso", 9000);
    if (ex.balanco && ex.balanco.perguntar) perguntarBalanco(ex.viga, ex.balanco.ponta);
    else if (ex.balanco && ex.balanco.marcada) balanco(ex.viga, { ponta: ex.balanco.ponta, aplicarMelhor: true });
  }
  /* a PERGUNTA não bloqueia o desenho (a 1ª versão abria um quadro modal e a e2e-metal-criar mostrou o problema: quem lança a
     viga e apoia a ponta depois ficava com o quadro por cima da planta, e os cliques seguintes não chegavam). Um cartão no
     canto, com os dois botões; some sozinho em 25 s ou quando outra viga pergunta */
  var _perg = null;
  function fecharPergunta() { if (_perg && _perg.parentNode) _perg.parentNode.removeChild(_perg); _perg = null; }
  function perguntarBalanco(vigaId, ponta) {
    if (typeof document === "undefined" || !document.body) return false;
    css(); fecharPergunta();
    var d = document.createElement("div"); d.className = "mla-perg"; d.setAttribute("data-mla", "pergunta"); d.setAttribute("data-mla-viga", String(vigaId)); d.setAttribute("role", "alertdialog");
    d.innerHTML = "<p>A " + (ponta === "a" ? "ponta inicial" : "ponta final") + " da viga não encosta em nada. Ela é <b>livre (balanço)</b>?</p>" +
      '<p class="mla-nota">Se for: engaste, mão-francesa e tirante/consolo comparados pelo peso próprio + a carga que você declarar; a melhor é aplicada e você troca. Balanço com ligação rotulada é mecanismo.</p>' +
      '<div class="acoes"><button class="btn primary sm" data-mla-sim>É balanço — ver as soluções</button><button class="btn ghost sm" data-mla-nao>Não — vou apoiar depois</button></div>';
    d.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-mla-sim],[data-mla-nao]") : null; if (!b) return;
      fecharPergunta();
      if (b.hasAttribute("data-mla-sim")) balanco(vigaId, { ponta: ponta, aplicarMelhor: true });
      else status("Ponta sem apoio: se ficar assim, o cálculo acusa (balanço com ligação rotulada = mecanismo).");
    });
    document.body.appendChild(d); _perg = d;
    setTimeout(function () { if (_perg === d) fecharPergunta(); }, 25000);
    return true;
  }

  /* ------------------------------------------------------------ BALANÇO */
  function servicoDe(id) { var c = caixas().filter(function (x) { return String(x.id) === String(id); })[0], s = c && c.metal && c.metal.cria && c.metal.cria.servico; return s ? { q: num(s.q, 0), P: num(s.P, 0) } : { q: 0, P: 0 }; }
  function cartao(s, aplicada) {
    var cl = !s.aplicavel ? "na" : s.passa ? "ok" : "nok";
    return '<div class="mla-op ' + cl + (aplicada ? " aplicada" : "") + '" data-mla-sol="' + esc(s.id) + '"><h3>' + s.rank + "º " + esc(s.nome) + "</h3>" +
      '<div class="mla-chips"><span class="mla-chip ' + (s.passa ? "ok" : "nok") + '" data-mla="sit">' + (s.aplicavel ? (s.passa ? "passa (pré-dim.)" : "não passa") + " · " + pct(s.aproveitamento) : "não se aplica") + "</span>" +
      (s.aplicavel ? '<span class="mla-chip" data-mla="custo">' + br(s.custo.kg, 1) + " kg de aço · índice " + br(s.custo.indice, 1) + (s.custo.rel != null ? " · custo relativo " + br(s.custo.rel, 2) : "") + "</span>" : "") +
      (aplicada ? '<span class="mla-chip ok" data-mla="aplicada">aplicada</span>' : "") + '<span class="mla-chip nok">' + esc(A().TXT_AC) + "</span></div>" +
      "<p>" + esc(s.situacao) + "</p>" +
      (s.precisa.length ? "<p><b>Precisa:</b></p><ul>" + s.precisa.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (s.verificacoes.length ? "<details><summary>Verificações (" + s.verificacoes.length + ")</summary><table>" + s.verificacoes.map(function (v) { return "<tr><td>" + esc(v.nome) + (v.item ? '<br><span class="mla-nota">' + esc(v.item) + "</span>" : "") + '</td><td style="text-align:right;white-space:nowrap;color:' + (v.razao <= 1 + 1e-9 ? "var(--verde)" : "var(--vermelho)") + '">' + pct(v.razao) + "</td></tr>"; }).join("") +
        s.ligacoes.map(function (l) { return "<tr><td>Ligação " + esc(l.rotulo) + ": " + esc(l.nome || l.motivo || "") + (l.resumo ? '<br><span class="mla-nota">' + esc(l.resumo) + "</span>" : "") + '</td><td style="text-align:right;color:' + (l.ok ? "var(--verde)" : "var(--vermelho)") + '">' + (l.ok ? pct(l.razao) : "não passa") + "</td></tr>"; }).join("") + "</table></details>" : "") +
      (s.naoVerificado.length ? '<ul class="mla-nota">' + s.naoVerificado.map(function (x) { return "<li>Não verificado aqui: " + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      '<div class="acoes">' + (s.aplicavel && s.passa ? '<button class="btn ' + (aplicada ? "ghost" : "primary") + ' sm" data-mla-aplicar="' + esc(s.id) + '">' + (aplicada ? "Aplicar de novo" : "Aplicar esta") + "</button>" : '<span class="mla-nota" data-mla="bloq">' + esc(!s.aplicavel ? s.motivo : "não passa no pré-dimensionamento: não aplicável") + "</span>") + "</div></div>";
  }
  function painelHtml(bal, aplicada) {
    var sv = bal.cargas;
    return '<div class="mla" data-mla="painel-balanco" data-modal-largo data-mla-viga="' + esc(bal.viga) + '" data-mla-melhor="' + esc(bal.melhor || "") + '">' +
      "<p><b>Viga " + esc(bal.viga) + "</b> em balanço a partir do pilar " + esc(bal.apoio) + " (" + esc(bal.face) + ") — " + esc(sv.texto) + ".</p>" +
      '<div class="mla-cargas"><label>Carga de serviço no balanço <input data-mla="q" inputmode="decimal" value="' + esc(br(sv.q, 2)) + '"> kN/m</label><label>Carga na ponta <input data-mla="P" inputmode="decimal" value="' + esc(br(sv.P, 1)) + '"> kN</label><button class="btn ghost sm" data-mla="recalcular">Recalcular</button></div>' +
      (bal.critico ? '<div class="mla-crit" data-mla="critico">' + esc(bal.texto) + "</div>" : '<p data-mla="melhor">' + esc(bal.texto) + "</p>") +
      '<div class="mla-ops">' + bal.opcoes.map(function (s) { return cartao(s, s.id === aplicada); }).join("") + "</div>" +
      '<p class="mla-nota">' + esc(bal.criterio) + " O pré-dimensionamento não aprova: calcule a estrutura (Cálculo › Estrutura desenhada) — as ligações são confirmadas ou ajustadas com os esforços da análise.</p></div>";
  }
  function balanco(vigaId, o) {
    o = o || {};
    var M0 = A(); if (!M0 || !global.UI) return null;
    css();
    var sv = o.servico || servicoDe(vigaId);
    var bal = M0.balanco(caixas(), vigaId, { ponta: o.ponta, servico: sv, meio: cfg().aoLancar, materiais: materiais() });
    U.ultimoBalanco = bal;
    if (!bal.ok) { toast("Balanço: " + bal.motivo, "aviso", 8000); status("Balanço: " + bal.motivo); return bal; }
    var aplicada = null;
    if (o.aplicarMelhor && bal.melhor) { var ap = aplicar(vigaId, bal.melhor, { servico: sv, ponta: bal.ponta, silencioso: true }); if (ap && ap.ok) { aplicada = bal.melhor; bal = M0.balanco(caixas(), vigaId, { ponta: bal.ponta, servico: sv, meio: cfg().aoLancar, materiais: materiais() }); U.ultimoBalanco = bal; } }
    else { var c = caixas().filter(function (x) { return String(x.id) === String(vigaId); })[0]; aplicada = c && c.metal && c.metal.cria && c.metal.cria.balanco ? c.metal.cria.balanco.solucao : null; }
    UI.modal("Viga em balanço — 3 soluções", painelHtml(bal, aplicada), [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
    var raiz = document.querySelector("[data-mla='painel-balanco']");
    if (raiz) raiz.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("[data-mla-aplicar],[data-mla='recalcular']") : null; if (!a) return;
      ev.preventDefault();
      var q = num((raiz.querySelector("[data-mla='q']") || {}).value, 0), P = num((raiz.querySelector("[data-mla='P']") || {}).value, 0);
      if (a.getAttribute("data-mla") === "recalcular") { UI.fecharModal(); balanco(vigaId, { ponta: bal.ponta, servico: { q: q, P: P } }); return; }
      var id = a.getAttribute("data-mla-aplicar"), r = aplicar(vigaId, id, { servico: { q: q, P: P }, ponta: bal.ponta });
      if (r && r.ok) { UI.fecharModal(); balanco(vigaId, { ponta: bal.ponta, servico: { q: q, P: P } }); }
    });
    status("Balanço da viga " + vigaId + ": " + bal.texto);
    if (bal.critico) toast(bal.texto, "erro", 10000);
    return bal;
  }
  function aplicar(vigaId, solId, o) {
    o = o || {};
    var M0 = A(); if (!M0) return null;
    var r = M0.aplicarBalanco(caixas(), vigaId, solId, { ponta: o.ponta, servico: o.servico, meio: cfg().aoLancar, novoId: novoId, materiais: materiais() });
    U.ultimoAplicado = r;
    if (!r.ok) { toast("Balanço: " + r.motivo, "aviso", 9000); return r; }
    if (!enviar(r.ops, "Balanço — " + r.solucao.nome)) { toast("O editor recusou a solução do balanço.", "erro"); return { ok: false, motivo: "editor recusou" }; }
    var t = r.resumo + (r.pendentes.length ? " " + r.pendentes.join(" ") : "") + " Ctrl+Z desfaz.";
    status(t); if (!o.silencioso) toast(t, r.pendentes.length ? "aviso" : "ok", 8000);
    return r;
  }

  /* ------------------------------------------------------------ DEPOIS DO CÁLCULO */
  function aposCalculo(r) {
    var M0 = A(); if (!M0 || !r || !r.ok) { U.ultimoCalculo = null; return null; }
    var c0 = cfg(), res = M0.aposCalculo(r, caixas(), { modo: c0.aposCalculo, meio: c0.aoLancar !== "nao" ? c0.aoLancar : null, novoId: novoId, materiais: materiais(), fundacoes: fundacoes() });
    res.enviado = false;
    if (res.ops.length) {
      res.enviado = enviar(res.ops, "Ligações ajustadas pelo cálculo — " + res.resumo);
      if (!res.enviado) res.resumo += " (o editor recusou a troca)";
      /* a troca mantém a ligação do nó como o cálculo a tratou (a escolha do lote não aceita incoerência): o resultado continua
         valendo para a estrutura — a não ser que a família mude (aí ele fica desatualizado e pede recalcular) */
      res.familiaMudou = res.itens.some(function (i) { return i.familiaMudou && i.acao === "ajustada"; });
    }
    U.ultimoCalculo = res;
    if (res.itens.length || res.criticos.length) status("Ligações e cálculo: " + res.resumo);
    return res;
  }
  var ACAO = { confirmada: "confirmada", ajustada: "ajustada", sugerida: "sugestão", critico: "CRÍTICO", pendente: "a confirmar" };
  function quadroHtml(res) {
    if (!res) return "";
    var h = "";
    if (res.criticos.length) h += '<div class="ml-prob" data-ml="balanco-critico"><h4 style="margin:0 0 6px">Balanço com ligação rotulada</h4>' + res.criticos.map(function (c) { return "<p><b>" + esc(c.texto) + "</b></p>"; }).join("") + "</div>";
    if (res.itens.length) {
      var ajust = res.itens.filter(function (i) { return i.acao !== "confirmada"; });
      h += '<div class="ml-card" data-ml="lig-ajustadas"><h4>Ligações ajustadas pelo cálculo</h4><p class="ml-nota" style="margin-top:0">' + esc(res.resumo) + (res.modo === "sugerir" ? " Modo \"só sugerir\": nada mudou no modelo." : res.enviado ? " A troca entrou no modelo num lote só — Ctrl+Z desfaz." : "") +
        (res.familiaMudou ? " A família de alguma ligação mudou para combinar com o nó que o cálculo considerou." : "") + "</p>" +
        '<table class="ml-t"><thead><tr><th>Ligação</th><th>Situação</th><th>Antes</th><th>Depois</th><th>Razão</th></tr></thead><tbody>' +
        res.itens.map(function (i) { return '<tr data-ml-lig="' + esc(i.lig) + '" data-ml-acao-lig="' + esc(i.acao) + '"><td>' + esc(i.pecas.join(" × ")) + '</td><td style="color:' + (i.acao === "critico" ? "var(--ml-erro)" : i.acao === "confirmada" || i.acao === "ajustada" ? "var(--ml-ok)" : "var(--ml-aviso)") + '"><b>' + esc(ACAO[i.acao] || i.acao) + "</b></td><td>" + esc(i.antes) + "</td><td>" + esc(i.depois || "—") + '</td><td class="ml-nota">' + esc(i.razao) + "</td></tr>"; }).join("") +
        "</tbody></table>" + (ajust.length ? "" : '<p class="ml-nota">Todas passaram como foram desenhadas.</p>') +
        '<p class="ml-nota">Depois do cálculo <select data-ml-campo="ligAutoModo"><option value="ajustar"' + (res.modo === "ajustar" ? " selected" : "") + '>ajustar sozinho</option><option value="sugerir"' + (res.modo === "sugerir" ? " selected" : "") + ">só sugerir</option></select> (vale para esta obra, a partir do próximo cálculo)</p></div>";
    }
    if (res.travamentos.length) h += '<div class="ml-card" data-ml="travamento"><h4>Travamento sugerido (flambagem lateral com torção)</h4><ul class="ml-l">' + res.travamentos.map(function (t) { return '<li class="' + (t.reprova ? "ml-aviso" : "ml-nota") + '">' + esc(t.texto) + " <b>" + esc(t.sugestao) + "</b></li>"; }).join("") + "</ul></div>";
    return h;
  }

  var MetalLigAutoUI = {
    cfg: cfg, definir: definir, aoLancar: aoLancar, depoisDeLancar: depoisDeLancar, perguntarBalanco: perguntarBalanco, fecharPergunta: fecharPergunta, balanco: balanco, aplicar: aplicar,
    aposCalculo: aposCalculo, quadroHtml: quadroHtml,
    ultimo: function () { return U; },
    _zerar: function () { memo = {}; U = { ultimoLancar: null, ultimoBalanco: null, ultimoAplicado: null, ultimoCalculo: null }; }
  };
  global.MetalLigAutoUI = MetalLigAutoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalLigAutoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
