/* =====================================================================
 * eleprojetoui.js — O CLIQUE "PROJETO ELÉTRICO COMPLETO" e a FITA Instalações › Elétrica (Elétrica v2, lote L6, 07/11/2026)
 *
 *   ele-projeto         Projeto elétrico completo: pontos + ligação da iluminação + circuitos + quadro + eletrodutos + auditoria, UM lote (Ctrl+Z)
 *                       e o relatório na tela, com "Gerar documentos" e "Mostrar fiação"
 *   ele-m-caixa         abre a biblioteca SÓ nas caixas, placas e tampas ele-*
 *   ele-m-aparelhos     abre a biblioteca SÓ nos aparelhos que pedem ponto e nas luminárias
 *   ele-ilum            Ligação da iluminação (o painel do js/eletilumui.js) no ambiente selecionado
 *   ele-aparelho-ponto  chave "Aparelho cria ponto" (EleAparelhos.cfg.auto)
 *   ele-fiacao          chave "Mostrar fiação" (EleFiacao3D)
 * A fita é reagrupada em js/bimfita.js (ABA_INSTALACOES): Modelar · Projeto inteligente · Dimensionar · Documentos · Ver. Nenhum id foi removido.
 * ES5, IIFE, global.EleProjetoUI.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = typeof document !== "undefined" ? document : null;
  function arr(a) { return Array.isArray(a) ? a : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function f1(v) { var x = Number(v); return isFinite(x) ? x.toFixed(1).replace(".", ",") : "—"; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var TRANCADA = "O projeto elétrico faz parte do OrçaPRO Modela Elétrica & Dados: a disciplina não está liberada nesta conta.";
  function liberada() { try { var D = global.BimDisciplinas; return !(D && typeof D.trancada === "function" && D.trancada("eletrica")); } catch (e) { return true; } }
  function lerChave(k) { try { var t = global.localStorage && global.localStorage.getItem(k); return t ? JSON.parse(t) || {} : {}; } catch (e) { return {}; } }
  function criterios() { var a = lerChave("raerp:bim:eletrica-criterios"), b = lerChave("raerp:bim:eletrica-circuitos-criterios"), o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; if (global.EleAparelhos && global.EleAparelhos.cfg && global.EleAparelhos.cfg.mobiliario === false) o.mobiliario = false; return o; }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }

  function janela(titulo, html) {
    if (!doc) return null;
    var velho = doc.getElementById("ele-proj-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = doc.createElement("div"); ov.id = "ele-proj-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:900px;width:100%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-ele-proj-fechar class="btn sm">Fechar</button></div>' + html + "</div>";
    function fecha() { if (ov.parentNode) ov.parentNode.removeChild(ov); doc.removeEventListener("keydown", aoEsc, true); }
    function aoEsc(e) { if (e && (e.key === "Escape" || e.keyCode === 27)) fecha(); }
    ov.addEventListener("click", function (e) {
      var t = e.target; if (!t) return;
      if (t === ov || (t.hasAttribute && t.hasAttribute("data-ele-proj-fechar"))) { fecha(); return; }
      if (t.hasAttribute && t.hasAttribute("data-ele-proj-docs")) { fecha(); if (global.EleDocumentosUI && global.EleDocumentosUI.abrir) global.EleDocumentosUI.abrir(); return; }
      if (t.hasAttribute && t.hasAttribute("data-ele-proj-fiacao")) { mostrarFiacao(true); t.textContent = "Fiação ligada"; return; }
    });
    doc.addEventListener("keydown", aoEsc, true);
    doc.body.appendChild(ov);
    return ov;
  }

  function mostrarFiacao(on) {
    var F = global.EleFiacao3D; if (!F) { status("A fiação em 3D não carregou."); return false; }
    var r = on === undefined ? F.alternar() : F.ligar(!!on);
    try { if (global.BimRibbon && global.BimRibbon.setAtivo) global.BimRibbon.setAtivo("ele-fiacao", !!F.ligada()); } catch (e) {}
    status(F.ligada() ? "Fiação elétrica em 3D: ligada (fios com a bitola e a cor do projeto dentro do eletroduto)." : "Fiação elétrica em 3D: desligada.");
    return r;
  }

  function relatorioHtml(res, aplicado) {
    var r = res.relatorio || {}, t = r.pontosPorTipo || {}, q = r.quadro, mq = q && q.montado, d = r.demanda || {}, au = r.auditoria || {}, ci = r.circuitos || {};
    var linhasAmb = arr(r.porAmbiente).map(function (a) { return "<tr><td>" + esc(a.nome) + "</td><td>" + a.luz + "</td><td>" + a.interruptor + "</td><td>" + a.tug + "</td><td>" + (a.tue + (a.ld || 0)) + "</td></tr>"; }).join("");
    var pend = arr(res.pendencias).filter(function (p, i, L) { return L.indexOf(p) === i; });
    return '<div data-ele-proj="relatorio">' +
      "<p>" + (aplicado ? "<b>Projeto elétrico gerado</b> num lote só — <b>Ctrl+Z</b> desfaz tudo." : (res.lote ? "<b>Não foi possível aplicar</b> o lote no editor." : "<b>Nada a mudar:</b> o projeto elétrico do modelo já está completo (rodar de novo não duplica).")) + "</p>" +
      '<table class="tbl" style="width:100%;border-collapse:collapse;font-size:12px" data-ele-proj="pontos"><thead><tr><th>Ambiente</th><th>Luz</th><th>Interruptor</th><th>TUG</th><th>TUE / ligação direta</th></tr></thead><tbody>' + linhasAmb +
      '<tr><td><b>Total</b></td><td><b>' + (t.luz || 0) + "</b></td><td><b>" + (t.interruptor || 0) + "</b></td><td><b>" + (t.tug || 0) + "</b></td><td><b>" + ((t.tue || 0) + (t.ld || 0)) + "</b></td></tr></tbody></table>" +
      "<p><b>Circuitos:</b> " + (ci.total || 0) + " (" + (ci.luz || 0) + " de iluminação, " + (ci.tug || 0) + " de tomadas, " + (ci.tue || 0) + " de uso específico) · <b>DR</b> " + (ci.dr || 0) + " · <b>eletrodutos</b> " + f1(r.eletrodutosMetros) + " m</p>" +
      "<p><b>Quadro:</b> " + (q ? esc(q.id) + " — " + (q.modelo ? q.modelo.espacos + " módulos, " + esc(q.modelo.material) + " de " + esc(q.modelo.instalacao) : "") + (mq ? " · montado com " + mq.disjuntores + " disjuntor(es), " + mq.dr + " DR, " + mq.dps + " DPS e o geral" : "") : "sem quadro") + "</p>" +
      "<p><b>Demanda</b> " + f1(d.demanda_kVA) + " kVA (carga instalada " + f1(d.instalada_kW) + " kW) · <b>padrão de entrada</b> " + (r.entrada ? "faixa " + esc(r.entrada.faixa) + ", disjuntor " + r.entrada.disjuntor_A + " A" : "não verificado") + (d.tipo ? " (fornecimento tipo " + esc(d.tipo) + ", CEMIG ND-5.1)" : "") + "</p>" +
      "<p><b>Auditoria:</b> pontos " + (au.pontos ? au.pontos.erros + " erro(s), " + au.pontos.avisos + " aviso(s)" : "—") + " · circuitos " + (au.circuitos ? au.circuitos.erros + " erro(s), " + au.circuitos.avisos + " aviso(s)" : "—") + "</p>" +
      (pend.length ? '<h4 style="margin:8px 0 4px;color:#a00">Pendências (' + pend.length + ')</h4><ul style="margin:0 0 0 18px;padding:0" data-ele-proj="pendencias">' + pend.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" : "") +
      '<p style="font-size:12px;margin-top:6px">NBR 5410:2004 lida numa cópia <b>não licenciada</b> à RA, sem a Errata 1/2008: só valores com o item. Demanda e entrada: CEMIG ND-5.1.</p>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn primary sm" data-ele-proj-docs>Gerar documentos</button><button type="button" class="btn sm" data-ele-proj-fiacao>Mostrar fiação</button></div></div>';
  }

  function projeto() {
    if (!liberada()) { status(TRANCADA); janela("Projeto elétrico completo", "<p>" + esc(TRANCADA) + "</p>"); return null; }
    var B = global.BIM, EP = global.EleProjeto; if (!B || !B.editarOps || !B.editarLote || !EP) { status("O editor 3D não está aberto."); return null; }
    var res = null;
    try { res = EP.gerar({ ops: B.editarOps(), avaliarFam: avaliar(), criterios: criterios() }); } catch (e) { res = { ok: false, motivo: "falhou: " + (e && e.message ? e.message : e) }; }
    if (!res.ok) { janela("Projeto elétrico completo", "<p>" + esc(res.motivo) + "</p>"); status(res.motivo); return res; }
    var aplicado = res.lote ? !!B.editarLote(res.lote) : false;
    janela("Projeto elétrico completo", relatorioHtml(res, aplicado));
    var rp = res.relatorio || {}, t = rp.pontosPorTipo || {};
    status("Projeto elétrico: " + (t.luz || 0) + " luz, " + (t.tug || 0) + " TUG, " + (t.tue || 0) + " TUE, " + (t.interruptor || 0) + " interruptor(es) · " + (rp.circuitos ? rp.circuitos.total : 0) + " circuito(s)" + (aplicado ? " (Ctrl+Z desfaz tudo)" : "") + ".");
    return res;
  }

  /* a biblioteca de famílias filtrada (familiaui.js: _filtroId) */
  function aparelhosRegex() {
    var ids = ["ele-eq-[a-z0-9-]+", "ele-lum-[a-z0-9-]+", "ra-ilum-[a-z0-9-]+", "ra-luminaria", "ra-clim-[a-z0-9-]+", "ra-coz-(geladeira|torre-quente|inferior|ilha|lavadora)", "hid-chuveiro", "hid-bomba", "hid-aquecedor-eletrico-passagem"];
    try { arr(global.EleAparelhosDados && global.EleAparelhosDados.aparelhos).forEach(function (a) { arr(a.casar && a.casar.fam).forEach(function (f) { if (ids.indexOf(f) < 0 && /^[a-z0-9-]+$/.test(f)) ids.push(f); }); }); } catch (e) {}
    return new RegExp("^(" + ids.join("|") + ")$");
  }
  function biblioteca(re, rotulo, G) {
    var FU = global.FamiliaUI; if (!FU) { status("A biblioteca de famílias não carregou."); return false; }
    try { if (G && G._famSync) G._famSync(); if (G && G._famAbrir) G._famAbrir("biblioteca"); } catch (e) {}
    FU._filtroId = re; FU._filtroRotulo = rotulo; FU._busca = "";
    try { FU.render(); } catch (e2) {}
    status("Biblioteca filtrada em " + rotulo + ": escolha o tipo e clique Colocar.");
    return true;
  }
  function ilum(G) {
    var U = global.EletIlumUI; if (!U || !U.abrir) { status("A ligação da iluminação não carregou."); return false; }
    var amb = null; try { var AU = global.BimAmbienteUI; amb = AU && AU.selecionado ? AU.selecionado() : null; } catch (e) { amb = null; }
    return U.abrir(amb != null ? String(amb) : undefined);
  }

  var DICA_PROJETO = "Num clique: pontos (luz, tomadas pelo perímetro, cabeceira da cama, rack, bancada, tomada de cada aparelho, interruptor junto à porta), a ligação da iluminação de cada ambiente, os circuitos, o quadro com disjuntores, DR e DPS, os eletrodutos traçados e a auditoria. Tudo num lote só: Ctrl+Z desfaz. Rodar de novo não duplica nada.";
  var U = {
    registrar: function (reg, G) {
      var R = global.BimRibbon; if (!R || !reg || !global.EleProjeto) return false;
      R.acrescentar("instalacoes", "Instalações", "Projeto elétrico", [
        { id: "ele-projeto", rotulo: "Projeto elétrico\ncompleto", icone: "estrela", grande: true, dica: DICA_PROJETO },
        { id: "ele-m-caixa", rotulo: "Caixa e\nplaca", icone: "grade", grande: true, dica: "Abre a biblioteca só nas caixas 4×2, 4×4 e octogonal (PVC e metálica), placas e tampas ele-*; escolha o tipo e clique no modelo." },
        { id: "ele-m-aparelhos", rotulo: "Aparelhos e\nluminárias", icone: "familia", grande: true, dica: "Abre a biblioteca só nos aparelhos que pedem o próprio ponto (geladeira, micro-ondas, cooktop, split, chuveiro…) e nas luminárias." },
        { id: "ele-ilum", rotulo: "Ligação da\niluminação", icone: "ima", grande: true, dica: "O painel da ligação da iluminação do ambiente selecionado: caminho do eletroduto, regra dos interruptores, comandos e problemas." },
        { id: "ele-aparelho-ponto", rotulo: "Aparelho\ncria ponto", icone: "mais", grande: true, tipo: "alterna", dica: "Ligado: ao colocar a geladeira, o chuveiro, o split… o ponto elétrico dele nasce junto (um Ctrl+Z desfaz os dois). Desligado: o aparelho entra sozinho." },
        { id: "ele-fiacao", rotulo: "Mostrar\nfiação", icone: "olho", grande: true, tipo: "alterna", dica: "Liga os fios em 3D dentro do eletroduto, com a bitola e a cor do projeto (fase, neutro, retorno, terra). Desligado de fábrica para não pesar." }
      ]);
      reg["ele-projeto"] = function () { projeto(); return true; };
      reg["ele-m-caixa"] = function () { return biblioteca(/^ele-(caixa|placa|tampa)-/, "caixas, placas e tampas elétricas", G); };
      reg["ele-m-aparelhos"] = function () { return biblioteca(aparelhosRegex(), "aparelhos e luminárias", G); };
      reg["ele-ilum"] = function () { ilum(G); return true; };
      reg["ele-aparelho-ponto"] = function (e) {
        var A = global.EleAparelhos; if (!A) return false;
        var on = !(e && e.ligado === false); A.definir("auto", on);
        status(on ? "Aparelho cria ponto: ligado." : "Aparelho cria ponto: desligado (o aparelho entra sem o ponto dele).");
        return true;
      };
      reg["ele-fiacao"] = function (e) { mostrarFiacao(!(e && e.ligado === false)); return true; };
      try { if (global.EleAparelhos && R.setAtivo) R.setAtivo("ele-aparelho-ponto", !!global.EleAparelhos.cfg.auto); } catch (e1) {}
      return true;
    },
    projeto: projeto, mostrarFiacao: mostrarFiacao, aparelhosRegex: aparelhosRegex, liberada: liberada, relatorioHtml: relatorioHtml
  };
  global.EleProjetoUI = U;
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
