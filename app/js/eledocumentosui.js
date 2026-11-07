/* =====================================================================
 * eledocumentosui.js — a TELA "Gerar documentos elétricos" (Elétrica v2, lote L5, 06/11/2026). Fiação fina: a lógica é do
 * js/eledocumentos.js (motor puro). Molde: js/hiddocumentosui.js.
 *
 * Fita: Instalações › Circuitos e quadro › "Gerar documentos elétricos" (registrado pelo js/gestao.js, junto dos Circuitos e quadro).
 * Um clique gera, do modelo e do cálculo ATUAL, o pacote .zip: memorial (HTML e Word), planilha .xlsx, pranchas (PDF e DXF) e o LEIA-ME
 * com o que ficou PENDENTE. O botão "PDF" do memorial abre a impressão do navegador ("Salvar como PDF"): o app não tem gerador de PDF a
 * partir de HTML, e fingir um seria pior. A nova versão do pacote sobe a revisão (R00 → R01) por obra, no navegador.
 * TRAVA POR LICENÇA NA FUNÇÃO (como os Circuitos e quadro): a disciplina elétrica trancada não gera.
 * NBR 5410:2004 lida numa cópia NÃO licenciada à RA, sem a Errata 1/2008: a tela diz isso.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = typeof document !== "undefined" ? document : null;
  function dep(n) { return global[n] || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function hoje() { var d = new Date(); return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear(); }
  var CHAVE_CRIT = "raerp:bim:eletrica-circuitos-criterios";   /* os mesmos critérios da tela "Critérios dos circuitos" (só leitura aqui) */
  var MODULO = "modela:eletrica";
  var TRANCADA = "Os documentos elétricos fazem parte do OrçaPRO Modela Elétrica & Dados: a disciplina não está liberada nesta conta.";
  var U = { ultimo: null, ocupado: false };

  function estado() { var B = global.BIM, E = global.BimEdit; if (!B || !B.editarOps || !E) return null; try { return E.aplicar(B.editarOps()); } catch (e) { return null; } }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }
  function liberada() { try { var D = global.BimDisciplinas; return !(D && typeof D.trancada === "function" && D.trancada("eletrica")); } catch (e) { return true; } }
  function lerCriterios() { try { var t = global.localStorage && global.localStorage.getItem(CHAVE_CRIT); return t ? JSON.parse(t) || {} : {}; } catch (e) { return {}; } }
  function carimbo() {
    var em = {}, ob = {}, logo = null, G = global.Gestao;
    try { if (global.Empresa && global.Empresa.dados) em = global.Empresa.dados() || {}; if (global.Empresa && global.Empresa.logo) logo = global.Empresa.logo(); } catch (e1) {}
    try { if (G && G._bimSel && global.Store && global.Auth) ob = global.Store.obter(global.Auth.empresaId(), "obras", G._bimSel) || {}; } catch (e2) {}
    return { empresa: em.nome ? em : "", responsavel: txt(em.responsavel), registro: txt(em.crea), tituloProfissional: txt(em.titulo), obra: txt(ob.nome), obraId: txt(ob.id || (G && G._bimSel) || ""), proprietario: txt(ob.clienteNome), contratante: txt(ob.clienteNome), local: txt(ob.local || ob.endereco), logo: logo };
  }
  function chaveHist(c) { return "orcapro:ele:docs:" + (c.obraId || c.obra || "obra"); }
  function lerHist(c) { try { var o = JSON.parse(global.localStorage.getItem(chaveHist(c)) || "null"); return o && typeof o === "object" ? o : { rev: "" }; } catch (e) { return { rev: "" }; } }
  function gravarHist(c, h) { try { global.localStorage.setItem(chaveHist(c), JSON.stringify(h)); } catch (e) {} }
  function proxRev(r) { var m = /(\d+)\s*$/.exec(txt(r)); return m ? "R" + dois((parseInt(m[1], 10) || 0) + 1) : "R00"; }

  function baixar(nome, dados, mime) {
    /* teste de 1 hora (js/testemodulo.js): entregável em teste sai com a marca; módulo vencido não sai */
    if (global.TesteModulo && global.TesteModulo.marcarArquivo) { var w = global.TesteModulo.marcarArquivo(nome, dados, mime, MODULO); if (!w) return false; nome = w.nome; dados = w.dados; }
    if (!doc || typeof Blob === "undefined") return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = doc.createElement("a"); a.href = u; a.download = nome; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
  }
  function abrirPdf(html) {
    if (global.TesteModulo && global.TesteModulo.marcarHtml) { html = global.TesteModulo.marcarHtml(html, MODULO); if (html == null) return false; }
    var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
    if (!w) { toast("O navegador bloqueou a janela de impressão. Libere pop-ups para este endereço ou abra o HTML baixado e imprima.", "aviso"); return false; }
    w.document.open(); w.document.write(html.replace("</body>", "<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body>")); w.document.close();
    return true;
  }

  /* a análise ATUAL do modelo + os dados da empresa e da obra */
  function montar(cfg) {
    cfg = cfg || {};
    if (!liberada()) return { erro: TRANCADA };
    var st = estado(), EC = dep("EleCircuitos"); if (!st || !EC) return { erro: "O editor 3D não está aberto." };
    var A = EC.analisar({ estado: st, avaliarFam: avaliar(), criterios: lerCriterios() });
    if (!A.ok) return { erro: A.motivo };
    var c = carimbo(), op = {}; Object.keys(c).forEach(function (k) { op[k] = c[k]; });
    op.numero = cfg.numero || ""; op.revisao = cfg.rev || "R00"; op.data = cfg.data || hoje(); op.estado = st; op.avaliarFam = avaliar(); op.criterios = lerCriterios();
    op.documentos = cfg.documentos || {}; op.formatos = cfg.formatos || {}; if (global.ExcelJS) op.ExcelJS = global.ExcelJS;
    return { A: A, op: op, c: c };
  }
  function gerar(cfg) {
    var D = dep("EleDocumentos"); if (!D) return Promise.reject(new Error("módulo não carregado (js/eledocumentos.js)"));
    var m = montar(cfg); if (m.erro) return Promise.reject(new Error(m.erro));
    return new Promise(function (ok) {
      var XO = global.ExcelOrc;
      if (cfg.documentos && cfg.documentos.planilha === false) { ok(); return; }
      if (global.ExcelJS || !XO || !XO.ensureExcelJS) { ok(); return; }
      XO.ensureExcelJS(function () { ok(); });
    }).then(function () {
      if (global.ExcelJS) m.op.ExcelJS = global.ExcelJS;
      return D.gerar(m.A, m.op);
    }).then(function (R) {
      if (R.ok) gravarHist(m.c, { rev: cfg.rev || "R00", data: cfg.data || hoje() });
      U.ultimo = { resultado: R, cfg: cfg, ctx: m.c };
      return U.ultimo;
    });
  }

  /* --------------------------------------------------------------- a tela */
  function corpoHtml() {
    var m = montar({}), c = m.c || carimbo(), h = lerHist(c), prox = h.rev ? proxRev(h.rev) : "R00";
    var linhas = [["memorial", "Memorial descritivo e de cálculo (14 seções, com as contas)"], ["planilha", "Planilhas (.xlsx): quadro de cargas, circuitos, demanda, eletrodutos e fiação, lista de materiais, pendências"], ["pranchas", "Pranchas (PDF e DXF): quadro de cargas, unifilar e planta de pontos e eletrodutos"]];
    return '<div data-ele-docs="tela" style="font-size:13px">' +
      (m.erro ? '<p class="muted" data-ele-docs="sem-analise" style="color:#a3352b">' + esc(m.erro) + "</p>" : (m.A.projetoGravado ? "" : '<p class="muted" data-ele-docs="sem-projeto" style="color:#9a5b12">O projeto dos circuitos ainda não está gravado no quadro: rode <b>Circuitos e quadro</b> antes — sem isso as pranchas não saem (memorial e planilha saem).</p>')) +
      '<p style="margin:0 0 8px;padding:6px 8px;border-radius:6px;background:rgba(30,90,122,.10);font-size:12px"><b>NBR 5410:2004</b> lida numa cópia <b>não licenciada</b> à RA, edição original <b>sem a Errata 1/2008</b>: o pacote sai com a ressalva e a lista do que ficou pendente (vermelho = sem fonte lida ou a decidir pelo RT).</p>' +
      '<fieldset style="border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:6px 10px;margin:0 0 8px"><legend>Documentos</legend>' +
      linhas.map(function (l) { return '<label style="display:block"><input type="checkbox" data-ele-docs-doc="' + l[0] + '" checked> ' + esc(l[1]) + "</label>"; }).join("") + "</fieldset>" +
      '<fieldset style="border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:6px 10px;margin:0 0 8px"><legend>Formatos</legend><label><input type="checkbox" data-ele-docs-fmt="word" checked> Word (.docx)</label> &nbsp; <label><input type="checkbox" data-ele-docs-fmt="html" checked> HTML</label> &nbsp; <label><input type="checkbox" data-ele-docs-fmt="dxf" checked> DXF das pranchas</label></fieldset>' +
      '<div style="display:grid;grid-template-columns:90px 1fr;gap:6px 10px;align-items:center">' +
      '<label>Nº do doc.</label><input class="input" data-ele-docs-campo="numero" placeholder="ex.: ELE-001">' +
      '<label>Revisão</label><input class="input" data-ele-docs-campo="rev" value="' + esc(prox) + '">' +
      '<label>Data</label><input class="input" data-ele-docs-campo="data" value="' + esc(hoje()) + '"></div>' +
      '<div data-ele-docs="resumo" style="margin-top:10px"></div></div>';
  }
  function lerCfg(raiz) {
    function v(k) { var e = raiz.querySelector('[data-ele-docs-campo="' + k + '"]'); return e ? String(e.value || "").trim() : ""; }
    function ck(sel) { var e = raiz.querySelector(sel); return !!(e && e.checked); }
    return { numero: v("numero"), rev: v("rev") || "R00", data: v("data") || hoje(),
      documentos: { memorial: ck('[data-ele-docs-doc="memorial"]'), planilha: ck('[data-ele-docs-doc="planilha"]'), pranchas: ck('[data-ele-docs-doc="pranchas"]') },
      formatos: { word: ck('[data-ele-docs-fmt="word"]'), html: ck('[data-ele-docs-fmt="html"]'), dxf: ck('[data-ele-docs-fmt="dxf"]') } };
  }
  function resumoHtml(u) {
    var R = u.resultado, v = R.pendencias.filter(function (p) { return p.nivel === "vermelho"; }), a = R.pendencias.length - v.length;
    var bot = R.arquivos.filter(function (f) { return f.tipo !== "leiame"; }).map(function (f) { return '<button class="btn sm ghost" data-ele-docs-baixar="' + esc(f.nome) + '">' + esc(f.nome) + "</button>"; }).join(" ");
    return '<div data-ele-docs="pronto" style="border:1px solid ' + (R.situacao.ok ? "#2e9e5b" : "#e0a100") + ';border-radius:8px;padding:6px 10px">' +
      "<div><b>Documentos gerados</b> — " + esc(R.situacao.texto) + "</div>" +
      '<ul class="muted" style="margin:6px 0 0;font-size:12px">' + R.resumo.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      '<div style="margin-top:6px">' + bot + ' <button class="btn sm" data-ele-docs-pdf="1">Memorial em PDF</button></div>' +
      (v.length ? '<p style="font-size:12px;margin:8px 0 2px;color:#a3352b"><b>Pendente em vermelho (' + v.length + "):</b></p><ul style=\"margin:0;font-size:12px\">" + v.slice(0, 8).map(function (p) { return "<li>" + esc(p.texto) + "</li>"; }).join("") + (v.length > 8 ? "<li>… e mais " + (v.length - 8) + " no LEIA-ME e na aba Pendências</li>" : "") + "</ul>" : "") +
      '<p class="muted" style="font-size:12px;margin:6px 0 0">' + a + " aviso(s) em amarelo no LEIA-ME.</p>" +
      (R.naoGerados.length ? '<ul style="margin:6px 0 0;font-size:12px;color:#9a5b12">' + R.naoGerados.map(function (t) { return "<li>Não gerado — " + esc(t) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
  }
  function nomeZip(R) { return "documentos-" + dep("EleDocumentos").nomeBase({ obra: U.ultimo && U.ultimo.ctx ? U.ultimo.ctx.obra : "", revisao: U.ultimo && U.ultimo.cfg ? U.ultimo.cfg.rev : "" }) + ".zip"; }
  function acaoGerar() {
    var raiz = doc && doc.querySelector('[data-ele-docs="tela"]'); if (!raiz || U.ocupado) return null;
    var cfg = lerCfg(raiz), alvo = raiz.querySelector('[data-ele-docs="resumo"]');
    U.ocupado = true; alvo.innerHTML = '<p class="muted" data-ele-docs="gerando">Gerando os documentos…</p>';
    return gerar(cfg).then(function (u) {
      U.ocupado = false;
      var D = dep("EleDocumentos"), z = D.zipar(u.resultado.arquivos);
      if (z && u.resultado.arquivos.length) baixar(nomeZip(u.resultado), z, D.MIME.zip);
      alvo.innerHTML = u.resultado.ok ? resumoHtml(u) : '<p data-ele-docs="erro" style="color:#d33a2c">Nada foi gerado: ' + esc(u.resultado.motivo || u.resultado.naoGerados.join("; ")) + "</p>";
      try { alvo.scrollIntoView({ block: "nearest" }); } catch (eS) {}
      toast(u.resultado.ok ? "Documentos elétricos gerados: " + u.resultado.arquivos.length + " arquivo(s) no .zip." + (u.resultado.situacao.ok ? "" : " Há pendências em vermelho: veja o LEIA-ME.") : "Não foi possível gerar os documentos elétricos.", u.resultado.situacao && u.resultado.situacao.ok ? "ok" : "aviso");
      status("Documentos elétricos: " + u.resultado.resumo.join(" · "));
      return u;
    }, function (e) {
      U.ocupado = false;
      alvo.innerHTML = '<p data-ele-docs="erro" style="color:#d33a2c">Não foi possível gerar: ' + esc(e && e.message ? e.message : e) + "</p>";
      return null;
    });
  }
  function abrir() {
    if (!liberada()) { status(TRANCADA); toast(TRANCADA, "aviso"); return false; }
    if (!global.UI || !global.UI.modal) return false;
    global.UI.modal("Gerar documentos elétricos", corpoHtml(), [
      { texto: "Gerar documentos", classe: "primary", onClick: function () { acaoGerar(); } },
      { texto: "Fechar", classe: "ghost", onClick: function () { try { global.UI.fecharModal(); } catch (e) {} } }
    ]);
    var raiz = doc && doc.querySelector('[data-ele-docs="tela"]');
    if (raiz) raiz.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-ele-docs-pdf],[data-ele-docs-baixar]") : null; if (!b || !U.ultimo) return;
      var R = U.ultimo.resultado;
      if (b.hasAttribute("data-ele-docs-pdf")) { if (R.memorial && R.memorial.html) abrirPdf(R.memorial.html); return; }
      var nm = b.getAttribute("data-ele-docs-baixar"), f = R.arquivos.filter(function (x) { return x.nome === nm; })[0];
      if (f) baixar(f.nome, f.dados, f.mime);
    });
    return true;
  }
  function registrar(reg) {
    var R = global.BimRibbon;
    if (!R || !reg || !global.EleDocumentos) return false;
    R.acrescentar("instalacoes", "Instalações", "Circuitos e quadro", [
      { id: "ele-docs", rotulo: "Gerar documentos\nelétricos", icone: "mais", grande: true, dica: "Num clique: memorial descritivo e de cálculo (14 seções, com as contas passo a passo), planilhas .xlsx (quadro de cargas, circuitos, demanda, eletrodutos e fiação, lista de materiais com SINAPI, pendências), pranchas em PDF e DXF e o LEIA-ME com o que ficou pendente. NBR 5410:2004 em cópia não licenciada: o pacote sai com a ressalva." }
    ]);
    reg["ele-docs"] = function () { abrir(); return true; };
    return true;
  }

  U.abrir = abrir; U.gerar = gerar; U.acaoGerar = acaoGerar; U.registrar = registrar; U.montar = montar; U.abrirPdf = abrirPdf; U.liberada = liberada;
  global.EleDocumentosUI = U;
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
