/* =====================================================================
 * saidasui.js — FIAÇÃO do "O que sai no documento" (prévia ?previa=motor)
 *
 * O motor é js/saidas.js (puro). Aqui só: o modal (perfil no topo, seções em grupos, PDF/Excel, "Salvar como meu
 * modelo") e os dois caminhos de geração, que já existiam e só ganham a opção `secoes`:
 *   - Excel do orçamento  → App.exportarExcel({ secoes })   (js/excel.js)
 *   - PDF/Excel de referência → OrcRefUI.abrir(orc, { secoes, formatos })  (js/orcrefui.js)
 * O pacote do licitante (LicitacaoDocs.gerar) aceita a mesma opção; a tela dele ainda não lê o modelo (pendência).
 * ⚠ O HTML do corpo é função PURA (`htmlCorpo`): testável em Node sem navegador.
 * ES5 de propósito.
 * ===================================================================== */
(function (global) {
  "use strict";

  function s(v) { return String(v == null ? "" : v); }
  function esc(v) { return s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  var ONDE = { pacote: "pacote do licitante", ref: "orçamento de referência", excel: "Excel", proposta: "proposta comercial" };

  /* perfil de partida: orçamento em modo licitação começa no edital; o resto, no residencial (o mais comum) */
  function perfilInicial(orc) {
    try { if (orc && orc.config && orc.config.licitacao && orc.config.licitacao.ativo) return "edital"; } catch (e) {}
    return "residencial";
  }

  /* HTML do corpo do modal. estado = { escolha, meus:[{id,nome}], meuId, nomeNovo } */
  function htmlCorpo(estado, S) {
    S = S || global.Saidas;
    var e = estado.escolha, p = S.perfil(e.perfil), h = "";
    h += '<label style="display:block;margin:4px 0"><span style="font-size:12px;color:#64748b">Tipo de orçamento</span>' +
      '<select id="saidas-perfil" style="width:100%">' + S.perfis().map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === e.perfil ? " selected" : "") + '>' + esc(x.nome) + '</option>'; }).join("") + '</select></label>';
    h += '<p id="saidas-desc" style="font-size:12.5px;color:#475569;margin:6px 0">' + esc(p ? p.desc : "") + '</p>';
    if (estado.meus && estado.meus.length) {
      h += '<label style="display:block;margin:4px 0"><span style="font-size:12px;color:#64748b">Meus modelos</span><select id="saidas-meu" style="width:100%"><option value="">(escolha para carregar)</option>' +
        estado.meus.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === estado.meuId ? " selected" : "") + '>' + esc(m.nome) + '</option>'; }).join("") + '</select></label>';
    }
    var grupos = [], porGrupo = {};
    S.secoes().forEach(function (x) { if (!porGrupo[x.grupo]) { porGrupo[x.grupo] = []; grupos.push(x.grupo); } porGrupo[x.grupo].push(x); });
    grupos.forEach(function (g) {
      h += '<fieldset style="border:1px solid #e2e8f0;margin:8px 0;padding:6px 10px"><legend style="font-size:12px;font-weight:600;color:#334155">' + esc(g) + '</legend>';
      porGrupo[g].forEach(function (x) {
        var onde = x.aplica.map(function (a) { return ONDE[a] || a; }).join(", ");
        h += '<label style="display:flex;gap:8px;align-items:flex-start;margin:3px 0;font-size:13px" title="' + esc(x.desc) + '">' +
          '<input type="checkbox" data-sec="' + esc(x.id) + '"' + (e.secoes[x.id] ? " checked" : "") + ' style="margin-top:3px">' +
          '<span>' + esc(x.rotulo) + ' <span style="font-size:11px;color:#94a3b8">(' + esc(onde) + ')</span></span></label>';
      });
      h += '</fieldset>';
    });
    var CE = global.CronoEstilo;
    if (CE) {
      h += '<label style="display:block;margin:8px 0"><span style="font-size:12px;color:#64748b">Estilo do cronograma</span><select id="saidas-estilo" style="width:100%">' +
        CE.ESTILOS.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === e.estiloCronograma ? " selected" : "") + ' title="' + esc(x.desc) + '">' + esc(x.nome) + '</option>'; }).join("") + '</select></label>';
    }
    h += '<div style="margin:8px 0;font-size:13px"><b>Formato:</b> ' +
      '<label style="margin-left:8px"><input type="checkbox" id="saidas-pdf"' + (e.formato.pdf ? " checked" : "") + '> PDF</label>' +
      '<label style="margin-left:12px"><input type="checkbox" id="saidas-xlsx"' + (e.formato.xlsx ? " checked" : "") + '> Excel</label></div>';
    if (p && p.parametros.length) {
      h += '<details style="margin:8px 0"><summary style="cursor:pointer;font-size:13px;font-weight:600">Textos-padrão deste tipo (editáveis)</summary>';
      p.parametros.forEach(function (q) {
        h += '<label style="display:block;margin:6px 0"><span style="font-size:12px;color:#64748b">' + esc(q.rotulo) + '</span>' +
          '<textarea data-txt="' + esc(q.id) + '" rows="3" style="width:100%">' + esc(e.textos[q.id] != null ? e.textos[q.id] : q.padrao) + '</textarea></label>';
      });
      h += '<p style="font-size:11.5px;color:#94a3b8;margin:2px 0">O que está entre chaves, como {prazo}, é preenchido na hora de gerar, com os dados do orçamento. Não escreva nome, CNPJ, e-mail nem telefone aqui.</p></details>';
    }
    h += '<div style="display:flex;gap:8px;align-items:flex-end;margin-top:10px"><label style="flex:1"><span style="font-size:12px;color:#64748b">Salvar como meu modelo</span>' +
      '<input id="saidas-nome" value="' + esc(estado.nomeNovo || "") + '" placeholder="Nome do modelo" style="width:100%"></label>' +
      '<button type="button" class="btn" id="saidas-salvar">Salvar</button></div>';
    h += '<div id="saidas-msg" style="margin-top:8px;font-size:12.5px"></div>';
    return h;
  }

  /* lê o que a pessoa marcou no DOM e devolve a escolha atual */
  function lerDoDom(raiz, S, perfilId) {
    var aj = { secoes: {}, formato: {}, textos: {} };
    [].slice.call(raiz.querySelectorAll("[data-sec]")).forEach(function (c) { aj.secoes[c.getAttribute("data-sec")] = !!c.checked; });
    var pdf = raiz.querySelector("#saidas-pdf"), xl = raiz.querySelector("#saidas-xlsx");
    aj.formato.pdf = !!(pdf && pdf.checked); aj.formato.xlsx = !!(xl && xl.checked);
    var es = raiz.querySelector("#saidas-estilo"); if (es && es.value) aj.estiloCronograma = es.value;
    [].slice.call(raiz.querySelectorAll("[data-txt]")).forEach(function (t) { aj.textos[t.getAttribute("data-txt")] = t.value; });
    return S.escolha(perfilId, aj);
  }

  function abrir(app) {
    var UI = global.UI, S = global.Saidas, doc = global.document;
    var orc = app && app.orcAtual;
    if (!UI || !S || !doc || !orc) return;
    var estado = { escolha: S.escolha(perfilInicial(orc)), meus: S.meus().map(function (m) { return { id: m.id, nome: m.nome }; }), meuId: "", nomeNovo: "" };
    function raiz() { return doc.getElementById("saidas-corpo"); }
    function pintar() { var r = raiz(); if (r) r.innerHTML = htmlCorpo(estado, S); }
    function msg(t, erro) { var m = doc.getElementById("saidas-msg"); if (m) { m.style.color = erro ? "#c00000" : "#1a7f37"; m.textContent = t; } }
    function atual() { var r = raiz(); return r ? lerDoDom(r, S, estado.escolha.perfil) : estado.escolha; }
    function conferir() {
      var e = atual(), v = S.validar(e);
      if (!v.ok) { msg(v.erros.join(" "), true); return null; }
      return e;
    }
    /* mudanças no corpo: troca de perfil / de modelo salvo repinta; o botão Salvar grava */
    function aoMudar(ev) {
      var t = ev.target;
      if (t && t.id === "saidas-perfil") { estado.escolha = S.escolha(t.value); estado.meuId = ""; estado.nomeNovo = ""; pintar(); }
      else if (t && t.id === "saidas-meu") {
        var m = t.value ? S.carregarMeu(t.value) : null;
        if (m) { estado.escolha = m.escolha; estado.meuId = m.id; estado.nomeNovo = m.nome; pintar(); }
      }
    }
    function aoClicar(ev) {
      var t = ev.target;
      if (!t || t.id !== "saidas-salvar") return;
      var e = conferir(); if (!e) return;
      var nome = (doc.getElementById("saidas-nome") || {}).value;
      var r = S.salvarMeu(nome, e);
      if (!r.ok) { msg(r.erros.join(" "), true); return; }
      estado.escolha = e; estado.meus = S.meus().map(function (m) { return { id: m.id, nome: m.nome }; }); estado.meuId = r.id; estado.nomeNovo = s(nome);
      S.definirAtivo(r.id);
      pintar(); msg("Modelo salvo e em uso nos próximos documentos (proposta e pacote).", false);
    }
    UI.modal("O que sai no documento", '<div id="saidas-corpo">' + htmlCorpo(estado, S) + '</div>', [
      { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Parar de usar o modelo", classe: "ghost", onClick: function () { S.definirAtivo(""); UI.toast("Os documentos voltam a sair como antes.", "ok"); } },
      { texto: "Gerar Excel do orçamento", classe: "ghost", onClick: function () {
          var e = conferir(); if (!e) return;
          if (!e.formato.xlsx) { msg("O formato Excel está desmarcado.", true); return; }
          UI.fecharModal(); app.exportarExcel({ secoes: S.secoesParaGerador(e) });
        } },
      { texto: "Gerar pacote de referência", classe: "primary", onClick: function () {
          var e = conferir(); if (!e) return;
          var formatos = []; if (e.formato.pdf) formatos.push("pdf"); if (e.formato.xlsx) formatos.push("xlsx");
          UI.fecharModal();
          var og = S.opcoesGerador(e);
          if (global.OrcRefUI) global.OrcRefUI.abrir(orc, { secoes: og.secoes, formatos: formatos, perfil: og.perfil, estiloCronograma: og.estiloCronograma, ligadas: og.ligadas, textos: og.textos });
        } }
    ]);
    var r0 = raiz();
    if (r0) { r0.addEventListener("change", aoMudar); r0.addEventListener("click", aoClicar); }
  }

  var SaidasUI = { abrir: abrir, htmlCorpo: htmlCorpo, perfilInicial: perfilInicial, lerDoDom: lerDoDom };
  global.SaidasUI = SaidasUI;
  if (typeof module !== "undefined" && module.exports) module.exports = SaidasUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
