/* =====================================================================
 * mor/ui.js — FIAÇÃO FINA do Manual acelerado (prévia `?previa=motor`)
 *
 * A regra mora em js/mor/manual.js (puro e testado); aqui só há tela:
 *   1. no assistente de novo orçamento: o campo "Tipo de obra" (já nascem as etapas);
 *   2. na etapa do orçamento: o botão "Itens guiados" (abre o painel);
 *   3. em "Nova etapa": se o nome existe no catálogo, o painel abre logo depois;
 *   4. o painel: perguntas da etapa (padrões marcados) + prévia dos itens, TODOS
 *      DESMARCADOS até a pessoa marcar e confirmar.
 * ⚠ ATRÁS DE PRÉVIA: `MorUI.ativo()` lê a chave que `?previa=motor` grava
 *   (App._PREVIAS). Desligada, NENHUMA destas funções muda a tela — o orçamento de hoje
 *   segue idêntico. `?previa=motor-desligar` volta ao de antes.
 * ⚠ Os builders de HTML (`htmlPainel`, `campoTipo`) são puros e testáveis em Node; os que
 *   tocam DOM/Store/UI ficam separados e só rodam no navegador.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE = "orcapro:tela:motor:v1";
  var C = global.MorCatalogo || (typeof require === "function" ? require("./catalogo.js") : null);
  var MM = global.MorManual || (typeof require === "function" ? require("./manual.js") : null);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function f2(x) { return String(Math.round((Number(x) || 0) * 100) / 100).replace(".", ","); }
  function vazio(v) { return v === undefined || v === null || v === ""; }

  var CONFIANCA = { alta: "ok", media: "info", pendente: "alerta" };

  function pilula(txt, tom) { return (global.Modulo && Modulo.pilula) ? Modulo.pilula(txt, tom) : '<span class="mod-pil mod-pil-' + tom + '">' + esc(txt) + "</span>"; }

  var MorUI = {
    CHAVE: CHAVE,
    _st: null,

    /* a prévia `?previa=motor` está ligada NESTE aparelho? (armazenamento bloqueado = desligada) */
    ativo: function () {
      try { var v = typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE) : null; return !!v && JSON.parse(v).motor === true; } catch (e) { return false; }
    },

    /* ---------------- builders puros ---------------- */

    /* campo do assistente de novo orçamento */
    campoTipo: function (valor) {
      var ops = '<option value="">— não usar o assistente de etapas —</option>' + C.tipologias().map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === valor ? " selected" : "") + ">" + esc(t.rotulo) + "</option>";
      }).join("");
      return '<div class="field" id="mor-campo-tipo"><label for="mor-tipologia">Tipo de obra <span class="muted" style="font-weight:400">(prévia)</span></label>' +
        '<select id="mor-tipologia">' + ops + "</select>" +
        '<span class="muted" style="font-size:12px">Escolhendo, o orçamento já nasce com as etapas padrão e os Serviços Preliminares. Nenhum item entra sozinho: cada etapa abre um painel com perguntas e a prévia dos itens.</span>' +
        MorUI.blocoDocumento() + "</div>";
    },

    /* ---------------- F5: gerar a partir de documento ---------------- */

    /* o bloco do assistente (texto colado ou arquivo) */
    blocoDocumento: function () {
      return '<details id="mor-doc" style="margin-top:8px"><summary><b>Gerar a partir de documento</b> <span class="muted" style="font-weight:400">(prévia — sem IA)</span></summary>' +
        '<div class="field"><label for="mor-doc-txt">Cole o escopo, o memorial ou o objeto do edital</label><textarea id="mor-doc-txt" rows="5" placeholder="Ex.: Casa térrea de 120 m², 3 quartos, fundação em sapatas, telha cerâmica…"></textarea></div>' +
        '<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><input type="file" id="mor-doc-arq" accept=".txt,.pdf,.docx,.xlsx,.xls,.csv" aria-label="Arquivo do documento"> <button type="button" class="btn sm" id="mor-doc-ler">Ler o documento</button> <button type="button" class="btn sm ghost" id="mor-doc-mem">Memória do Motor</button></div>' +
        '<div id="mor-doc-res" aria-live="polite"></div></details>';
    },

    /* O que o leitor entendeu, em HTML (puro): tipo, área, etapas, respostas, itens e — à vista — o que NÃO foi entendido. */
    htmlPlano: function (pl) {
      var h = '<div class="mor-doc-plano" style="margin-top:8px">';
      var rows = [["Tipo de obra", pl.tipologia ? ((C.tipologia(pl.tipologia) || {}).rotulo || pl.tipologia) : "não identificado"], ["Área", pl.obra && pl.obra.area !== undefined ? f2(pl.obra.area) + " m²" : "não informada — o Manual vai pedir"]];
      ["pavimentos", "quartos", "banheiros", "peDireito", "padrao", "perimetro"].forEach(function (k) { if (pl.obra && pl.obra[k] !== undefined) rows.push([k, String(pl.obra[k])]); });
      rows.push(["Etapas encontradas", pl.etapas.length ? pl.etapas.map(function (e) { return e.nome; }).join("; ") : "nenhuma"]);
      var rp = Object.keys(pl.respostas || {}).map(function (k) { var q = C.pergunta(k); return (q ? q.txt : k) + " = " + ((q && q.rotulos && q.rotulos[pl.respostas[k]]) || pl.respostas[k]); });
      rows.push(["Respostas implícitas", rp.length ? rp.join("; ") : "nenhuma"]);
      if (pl.prazo) rows.push(["Prazo", pl.prazo.valor + " " + pl.prazo.unidade]);
      if (pl.edital) rows.push(["Edital", (pl.edital.bases || []).map(function (b) { return b.ordem + "º " + b.fonte; }).join(", ") + (pl.edital.competencia ? " · " + pl.edital.competencia : "") + (pl.edital.uf ? " · " + pl.edital.uf : "") + (pl.edital.bdi ? " · BDI " + f2(pl.edital.bdi.percentual) + "%" : "") + (pl.edital.presetId ? " · tipo: " + pl.edital.presetId : "")]);
      h += '<table class="tbl"><tbody>' + rows.map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table>";
      if (pl.itens.length) {
        h += '<div class="row" style="gap:6px;margin-top:8px"><span class="muted" style="font-size:12px">Só entra no orçamento o que estiver marcado. Vêm marcados os de confiança alta; confira os demais.</span> <button type="button" class="btn sm ghost" data-mor-doc-todos="1">Marcar todos com código</button> <button type="button" class="btn sm ghost" data-mor-doc-todos="0">Desmarcar</button></div>';
        h += '<table class="tbl" style="margin-top:6px"><thead><tr><th>Entra</th><th>Item do documento</th><th>Un</th><th class="right">Qtd</th><th>Base</th></tr></thead><tbody>' + pl.itens.map(function (x, idx) {
          var s = x.resolucao || {}, rot, tom;
          if (s.estado === "casado" || s.estado === "codigo-do-documento") { rot = (s.fonte || "SINAPI") + " " + s.codigo + (s.estado === "casado" ? " · casado (" + Math.round((s.confianca || 0) * 100) + "%) — confira" : " · código do documento"); tom = s.estado === "casado" ? "info" : "ok"; }
          else if (s.estado === "composto") { rot = "composição sugerida " + (s.composicao ? s.composicao.familia : "") + " — a gravar"; tom = "alerta"; }
          else { rot = "pendente — " + String(s.motivo || "").slice(0, 80); tom = "alerta"; }
          var aceitar = (s.estado === "composto" && s.composicao && s.composicao.comp) ? ' <button type="button" class="btn sm" data-mor-aceitar="' + idx + '" title="Grava esta composição na base PRÓPRIA e na memória da empresa (só com o seu clique)">Aceitar composição</button>' : "";
          if (s.via === "memoria" || s.confiancaTexto === "memória") rot = (s.fonte || "SINAPI") + " " + s.codigo + " · memória (decidido igual antes)";
          if (s.escolhido) rot = (s.fonte || "SINAPI") + " " + s.codigo + " · escolhido por você";
          var sug = "";
          if (!s.codigo) sug = MorUI.htmlSugestoes(idx, s);
          var caixa = (s.codigo && (s.estado === "casado" || s.estado === "codigo-do-documento")) ? '<input type="checkbox" data-mor-doc-item="' + idx + '"' + (x.marcado === true ? " checked" : "") + ' aria-label="Incluir ' + esc(x.bruto) + '">' : '<span class="muted">—</span>';
          return "<tr><td>" + caixa + "</td><td>" + esc(x.bruto) + "</td><td>" + esc(x.unidade) + '</td><td class="right">' + f2(x.quantidade) + "</td><td>" + pilula(rot, tom) + aceitar + sug + "</td></tr>";
        }).join("") + "</tbody></table>";
      }
      if (pl.conflitos.length) h += '<p class="muted" style="font-size:12px"><b>Conflitos (' + pl.conflitos.length + "):</b> " + pl.conflitos.map(function (c) { return esc(c.motivo); }).join(" · ") + "</p>";
      if (pl.negados.length) h += '<p class="muted" style="font-size:12px"><b>Marcado como “sem/não” (' + pl.negados.length + "):</b> " + pl.negados.map(function (n) { return esc(n.termo); }).join(", ") + "</p>";
      if (pl.naoEntendidas.length) h += '<div class="mod-aviso mod-aviso-alerta" role="status"><div class="mod-aviso-txt"><b>Não entendi ' + pl.naoEntendidas.length + " frase(s)</b><span>" + pl.naoEntendidas.map(function (n, i) { return "«" + esc(n.bruto.slice(0, 120)) + "»" + MorUI.htmlEnsinar(i, n.bruto); }).join(" ") + "</span></div></div>";
      (pl.avisos || []).forEach(function (a) { h += '<p class="muted" style="font-size:12px">' + esc(a) + "</p>"; });
      h += '<p class="muted" style="font-size:12px">Ao criar o orçamento entram: as etapas, as respostas e os itens com código na base. O que ficou pendente é guardado no orçamento (orc.mor.documento) — nada some e nada é inventado.</p></div>';
      return h;
    },

    /* ---------------- F7: «Por quê?», «conferir», relatório, roteiro, chave de BDI, aceitar composição ---------------- */

    /* o ícone «?» e a marca amarela «conferir» (com OK) na linha gerada pelo motor — vazio se a prévia está desligada */
    marcaItem: function (e, it) {
      if (!MorUI.ativo() || !it || !it.mor || !global.MorPorque) return "";
      var par = esc(e.id + "|" + it.id);
      var h = ' <button type="button" class="btn sm ico" data-mor-porque="' + par + '" title="Por quê? — a regra, a conta e a origem desta linha" aria-label="Por quê?">?</button>';
      if (global.MorPorque.precisaConferir(it)) h += ' <span class="g-pill" style="background:#f6d94d66;color:#7a5f00;font-weight:700;font-size:10px" title="Linha do motor que espera o seu OK">conferir</span> <button type="button" class="btn sm" data-mor-ok="' + par + '" title="Está certo: tirar a marca">OK</button>';
      else if (it.mor.conferido === true) h += ' <span class="muted" style="font-size:10px" title="Conferido por ' + esc(it.mor.conferidoPor || "") + '">✓ conferido</span>';
      return h;
    },

    /* a explicação em HTML (pura): regra, conta com números, premissas, origem, elemento */
    htmlPorque: function (it) {
      var x = global.MorPorque.explicar(it); if (!x.tem) return '<p class="muted">Esta linha não foi gerada pelo motor (foi digitada ou importada).</p>';
      var vars = Object.keys(x.variaveis).map(function (k) { return "<code>" + esc(k) + "</code> = " + esc(typeof x.variaveis[k] === "number" ? f2(x.variaveis[k]) : String(x.variaveis[k])); }).join(" · ");
      var h = '<table class="tbl"><tbody>' +
        "<tr><th>Regra</th><td><code>" + esc(x.regra || "—") + "</code></td></tr>" +
        "<tr><th>Conta</th><td>" + (x.formulaNumeros ? "<b>" + esc(x.formulaNumeros) + "</b>" : "—") + (x.formula ? '<div class="muted" style="font-size:12px">fórmula: <code>' + esc(x.formula) + "</code></div>" : "") + (vars ? '<div class="muted" style="font-size:12px">' + vars + "</div>" : "") + "</td></tr>" +
        "<tr><th>Origem</th><td>" + esc(x.origem.rotulo) + "</td></tr>" +
        (x.porque ? "<tr><th>Por que entrou</th><td>" + esc(x.porque) + "</td></tr>" : "") +
        "<tr><th>Elemento de origem</th><td>" + (x.elemento ? esc(x.elemento) : '<span class="muted">— (não veio de um elemento do modelo/documento)</span>') + "</td></tr>" +
        (x.casamento ? "<tr><th>Código</th><td>" + esc(x.casamento.motivo || "") + "</td></tr>" : "") +
        "<tr><th>Premissas</th><td>" + (x.premissas.length ? "<ul style=\"margin:0;padding-left:18px\">" + x.premissas.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" : "—") + "</td></tr>" +
        "<tr><th>Situação</th><td>" + (x.conferido ? "conferido (OK) em " + esc(x.conferidoEm.slice(0, 10)) : (x.conferir ? pilula("conferir", "alerta") + " espera o seu OK" : "sem pendência")) + "</td></tr></tbody></table>";
      return h;
    },
    _acharItem: function (orc, etapaId, itemId) {
      var r = null; (orc.etapas || []).forEach(function (e) { if (e.id === etapaId) (e.itens || []).forEach(function (i) { if (i.id === itemId) r = { e: e, it: i }; }); });
      return r;
    },
    porque: function (app, etapaId, itemId) {
      var orc = app && app.orcAtual, a = orc ? MorUI._acharItem(orc, etapaId, itemId) : null; if (!a) return;
      var bt = [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
      if (global.MorPorque.precisaConferir(a.it)) bt.push({ texto: "OK, está certo", classe: "primary", onClick: function () { MorUI.confirmarOk(app, etapaId, itemId); UI.fecharModal(); } });
      UI.modal("Por quê? — " + String(a.it.descricao).slice(0, 70), MorUI.htmlPorque(a.it), bt);
    },
    confirmarOk: function (app, etapaId, itemId) {
      var orc = app && app.orcAtual; if (!orc) return 0;
      var quem = ""; try { quem = (typeof Auth !== "undefined" && Auth.usuario && (Auth.usuario() || {}).nome) || ""; } catch (e) {}
      var n = global.MorPorque.conferir(orc, etapaId, itemId, quem);
      if (n) { try { app.persistir(); } catch (e2) {} try { app.render(); } catch (e3) {} UI.toast(n + " linha(s) conferida(s) — marca «conferir» retirada.", "ok"); }
      return n;
    },

    /* a lista da Conferência (passo ④ do roteiro) */
    htmlConferencia: function (orc) {
      var linhas = [];
      (orc.etapas || []).forEach(function (e) { (e.itens || []).forEach(function (it) { if (global.MorPorque.precisaConferir(it)) linhas.push({ e: e, it: it }); }); });
      if (!linhas.length) return '<p class="muted">Nada a conferir: todas as linhas do motor têm OK (ou não precisam).</p>';
      return '<table class="tbl"><thead><tr><th>Etapa</th><th>Linha</th><th>Origem</th><th></th></tr></thead><tbody>' + linhas.map(function (l) {
        var o = global.MorPorque.origemDe(l.it.mor), par = esc(l.e.id + "|" + l.it.id);
        return "<tr><td>" + esc(l.e.nome) + "</td><td>" + esc(l.it.descricao) + "</td><td>" + esc(o) + '</td><td><button type="button" class="btn sm" data-mor-porque="' + par + '">Por quê?</button> <button type="button" class="btn sm" data-mor-ok="' + par + '">OK</button></td></tr>';
      }).join("") + "</tbody></table>";
    },
    abrirConferencia: function (app) {
      var orc = app && app.orcAtual; if (!orc) return;
      UI.modal("Conferência — linhas do motor", MorUI.htmlConferencia(orc), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Como foi montado (relatório)", classe: "", onClick: function () { MorUI.abrirRelatorio(app); } },
        { texto: "Automações", classe: "", onClick: function () { MorUI.abrirAutomacoes(app); } },
        { texto: "OK todos", classe: "primary", onClick: function () { MorUI.confirmarOk(app, "", ""); UI.fecharModal(); } }
      ]);
    },

    /* ---------------- F11: painel «Automações» (ESPEC §15 itens 1–6) ----------------
       A regra mora em js/mor/{recotar,abc,coerencia,faixa,pedidocot}.js (puros e testados); aqui só há tela.
       Nada grava sem o OK: «Aplicar» pede confirmação e usa MorRecotar.aplicar com confirmado:true. */
    _auto: null,
    _autoBase: function () { var S = global.Sinapi; return { uf: String((S && S.uf) || (global.App && global.App._baseUf) || ""), competencia: String((S && S.competencia) || "") }; },
    _historicoOrc: function (orc) {
      try { if (typeof Store === "undefined" || !Store.listarOrcamentos) return []; return Store.listarOrcamentos(MorUI._empresaId()).filter(function (o) { return o && o.id !== orc.id; }); } catch (e) { return []; }
    },
    autoCalcular: function (orc, ctx) {
      var est = { orc: orc };
      est.abc = global.MorAbc.curva(orc);
      est.coer = global.MorCoerencia.verificar(orc);
      est.faixa = global.MorFaixa.analisar(orc, MorUI._historicoOrc(orc), { cub: null });   /* o sistema ainda não importa CUB: «sem referência» */
      est.pedido = global.MorPedidoCot.itensParaCotar(orc);
      est.base = MorUI._autoBase();
      est.plano = null;
      return est;
    },
    htmlPlanoRecot: function (pl) {
      if (!pl) return '<p class="muted">Ainda não comparado. Use os botões acima (a base carregada é a UF/competência vigente neste aparelho).</p>';
      if (!pl.ok) return '<p class="muted">' + esc(pl.motivo || "Sem base carregada.") + "</p>";
      var R = pl.resumo, c = pl.contexto, h = '<p class="muted" style="font-size:12.5px">Orçamento: ' + esc((c.ufOrc || "?") + " " + (c.compOrc || "")) + " · base carregada: " + esc((c.ufBase || "?") + " " + (c.compBase || "")) + (c.troca ? " — <b>troca de UF/competência</b>" : "") + ".</p>";
      h += "<p><b>" + R.nMudaram + "</b> preço(s) mudaram · " + R.nIguais + " iguais · " + R.nPreservados + " preservados (cotação/ajuste seu)" + (pl.modo === "recasar" ? " · <b>" + R.nPendentes + " pendente(s)</b> (código não existe na base nova; valor ainda na base antiga R$ " + f2(R.valorPendente) + ")" : " · " + R.nAusentes + " sem código na base") + (R.nSemPreco ? " · " + R.nSemPreco + " sem preço na base" : "") + ".</p>";
      h += "<p>Antes R$ " + f2(R.totalAntes) + " → depois R$ " + f2(R.totalDepois) + " · diferença <b>R$ " + f2(R.diferenca) + "</b> (" + f2(R.pct) + "%) nos itens que mudaram.</p>";
      var ls = pl.linhas.filter(function (l) { return l.estado === "mudou" || l.estado === "pendente"; });
      if (ls.length) h += '<table class="tbl"><thead><tr><th>Item</th><th class="right">Antes</th><th class="right">Depois</th><th class="right">Diferença</th></tr></thead><tbody>' + ls.slice(0, 200).map(function (l) {
        return "<tr><td>" + esc(l.codigo + " — " + l.descricao) + (l.estado === "pendente" ? "<br>" + pilula("pendente", "alerta") : "") + '</td><td class="right">' + f2(l.antes) + '</td><td class="right">' + (l.estado === "pendente" ? "—" : f2(l.depois)) + '</td><td class="right">' + (l.estado === "pendente" ? "—" : f2(l.diferenca)) + "</td></tr>";
      }).join("") + "</tbody></table>" + (ls.length > 200 ? '<p class="muted">…e mais ' + (ls.length - 200) + " (todos entram ao aplicar).</p>" : "");
      if (ls.length) h += '<button type="button" class="btn sm primary" data-mor-auto="aplicar">Aplicar ' + (pl.modo === "recasar" ? "a troca" : "a recotação") + " (peço o seu OK)</button>";
      return h;
    },
    htmlAutomacoes: function (est) {
      var A = est.abc, h = '<div class="mor-auto">';
      h += '<h3 style="margin:0 0 4px">1 e 2 · Recotação e troca de UF/competência</h3><div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-mor-auto="recotar">Recotar na base carregada</button> <button type="button" class="btn sm" data-mor-auto="recasar">Re-casar na base carregada (troca de UF/competência)</button></div><div id="mor-auto-plano" aria-live="polite">' + MorUI.htmlPlanoRecot(est.plano) + "</div>";
      h += '<h3 style="margin:14px 0 4px">3 · Pedido de cotação a fornecedor</h3>';
      if (!est.pedido.length) h += '<p class="muted">Nenhum item sob consulta ou sem preço.</p>';
      else h += "<p>" + est.pedido.length + ' item(ns) sem preço / sob consulta.</p><button type="button" class="btn sm" data-mor-auto="pedido">Gerar o pedido (WhatsApp, e-mail e página para imprimir)</button><div id="mor-auto-pedido"></div>' +
        '<table class="tbl" style="margin-top:6px"><thead><tr><th>Item</th><th>Resposta do fornecedor (preço · fornecedor · data DD/MM/AAAA)</th></tr></thead><tbody>' + est.pedido.map(function (p, i) {
          return "<tr><td>" + esc(p.descricao) + '<br><span class="muted">' + esc(p.motivo) + " · " + esc(f2(p.quantidade) + " " + p.unidade) + '</span></td><td><input id="mor-resp-p-' + i + '" placeholder="preço un." size="8" aria-label="Preço"> <input id="mor-resp-f-' + i + '" placeholder="fornecedor" size="14" aria-label="Fornecedor"> <input id="mor-resp-d-' + i + '" placeholder="DD/MM/AAAA" size="10" aria-label="Data"> <button type="button" class="btn sm" data-mor-auto="resp|' + i + '">Gravar no item</button></td></tr>';
        }).join("") + "</tbody></table>";
      h += '<h3 style="margin:14px 0 4px">4 · Curva ABC</h3><p>' + esc(A.texto) + "</p>";
      if (A.linhas.length) h += '<table class="tbl"><thead><tr><th>Cl.</th><th>Item</th><th class="right">Valor</th><th class="right">% acum.</th></tr></thead><tbody>' + A.linhas.slice(0, 25).map(function (l) { return "<tr><td>" + l.classe + "</td><td>" + esc(l.descricao) + (l.classe === "A" && !l.cotado ? " " + pilula("cotar primeiro", "alerta") : "") + '</td><td class="right">' + f2(l.valor) + '</td><td class="right">' + f2(l.acumPct) + "</td></tr>"; }).join("") + "</tbody></table>" + (A.linhas.length > 25 ? '<p class="muted">Mostrando os 25 maiores de ' + A.linhas.length + ".</p>" : "");
      h += '<h3 style="margin:14px 0 4px">5 · Coerência</h3>';
      if (!est.coer.avisos.length) h += '<p class="muted">Nenhum par faltando' + (est.coer.ok.length ? " (" + est.coer.ok.length + " regra(s) conferida(s))" : "") + ".</p>";
      else h += est.coer.avisos.map(function (a) { return '<div class="mod-aviso mod-aviso-alerta" role="status"><div class="mod-aviso-txt"><b>' + esc(a.gatilhos.length + " item(ns): " + a.gatilhos[0].descricao.slice(0, 60)) + "</b><span>" + esc(a.aviso) + "</span></div></div>"; }).join("");
      h += '<h3 style="margin:14px 0 4px">6 · Faixa de custo por m²</h3>' + est.faixa.textos.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
      return h + "</div>";
    },
    abrirAutomacoes: function (app) {
      var orc = app && app.orcAtual; if (!orc) return;
      if (!global.MorAbc || !global.MorRecotar || !global.MorCoerencia || !global.MorFaixa || !global.MorPedidoCot) { UI.toast("Automações indisponíveis nesta versão.", "erro"); return; }
      MorUI._auto = MorUI.autoCalcular(orc, null);
      UI.modal("Automações do orçamento", '<div id="mor-auto-corpo">' + MorUI.htmlAutomacoes(MorUI._auto) + "</div>", [{ texto: "Fechar", classe: "primary", onClick: function () { MorUI._auto = null; UI.fecharModal(); } }]);
    },
    _autoRefazer: function () {
      var st = MorUI._auto, c = document.getElementById("mor-auto-corpo"); if (!st || !c) return;
      var plano = st.plano; MorUI._auto = MorUI.autoCalcular(st.orc, null); MorUI._auto.plano = plano; c.innerHTML = MorUI.htmlAutomacoes(MorUI._auto);
    },
    _autoCtx: function (app) { var c = MorUI._ctxBases(app), b = MorUI._autoBase(); if (c) { c.uf = b.uf; c.competencia = b.competencia; } return c; },
    /* data-mor-auto="recotar|recasar|aplicar|pedido|resp|N" */
    acaoAutomacao: function (acao) {
      var st = MorUI._auto, app = global.App; if (!st || !app || !app.orcAtual) return;
      var orc = app.orcAtual, ps = String(acao).split("|"), quem = "";
      try { quem = (typeof Auth !== "undefined" && Auth.usuario && (Auth.usuario() || {}).nome) || ""; } catch (e0) {}
      var travado = false; try { travado = !!(global.Orcamento && global.Orcamento.travadoPorAprovacao && global.Orcamento.travadoPorAprovacao(orc)); } catch (e1) {}
      var mostrar = function () { var b = document.getElementById("mor-auto-plano"); if (b) b.innerHTML = MorUI.htmlPlanoRecot(st.plano); };
      if (ps[0] === "recotar" || ps[0] === "recasar") {
        var ctx = MorUI._autoCtx(app); if (!ctx) { UI.toast("Base de preços indisponível.", "erro"); return; }
        st.plano = ps[0] === "recotar" ? global.MorRecotar.comparar(orc, ctx, st.base) : global.MorRecotar.recasar(orc, ctx, st.base);
        mostrar(); return;
      }
      if (ps[0] === "aplicar") {
        var pl = st.plano; if (!pl || !pl.ok) return;
        var msg = pl.modo === "recasar" ? "Aplicar a troca? " + pl.resumo.nMudaram + " preço(s) mudam (diferença R$ " + f2(pl.resumo.diferenca) + "), " + pl.resumo.nPendentes + " item(ns) ficam pendentes e o orçamento passa para " + (pl.contexto.ufBase || "?") + " " + (pl.contexto.compBase || "") + "."
          : "Aplicar a recotação? " + pl.resumo.nMudaram + " preço(s) mudam; diferença total R$ " + f2(pl.resumo.diferenca) + ". Cotações de fornecedor e ajustes seus são preservados.";
        if (typeof window !== "undefined" && window.confirm && !window.confirm(msg)) return;
        var r = global.MorRecotar.aplicar(orc, pl, { confirmado: true, travado: travado, quem: quem, atualizarOrcamento: pl.modo === "recasar" });
        if (!r.ok) { UI.toast(r.motivo, "erro"); return; }
        try { var g = app.persistir(); app.render(); if (app._gravou && !app._gravou(g)) return; } catch (e2) {}
        st.plano = null; MorUI._autoRefazer();
        UI.toast(r.aplicados + " preço(s) atualizado(s)" + (r.pendentes ? "; " + r.pendentes + " item(ns) pendente(s) na base nova" : "") + ".", "ok"); return;
      }
      if (ps[0] === "pedido") {
        var emp = ""; try { emp = (typeof Empresa !== "undefined" && Empresa.dados && (Empresa.dados() || {}).nome) || ""; } catch (e3) {}
        var P = global.MorPedidoCot.gerar(orc, st.pedido, { empresa: emp });
        MorUI._auto.ultimoPedido = P;
        var box = document.getElementById("mor-auto-pedido");
        if (box) box.innerHTML = '<label for="mor-auto-ptxt">Texto para WhatsApp / e-mail (copie)</label><textarea id="mor-auto-ptxt" rows="8" style="width:100%">' + esc(P.texto) + '</textarea><button type="button" class="btn sm" data-mor-auto="pagina">Abrir a página para imprimir</button>';
        return;
      }
      if (ps[0] === "pagina") { if (st.ultimoPedido) MorUI.imprimirRelatorio(st.ultimoPedido.html); return; }
      if (ps[0] === "resp") {
        var i = Number(ps[1]), p = st.pedido[i]; if (!p) return;
        var gv = function (k) { var el = document.getElementById("mor-resp-" + k + "-" + i); return el ? el.value : ""; };
        var rr = global.MorPedidoCot.registrarResposta(orc, p.etapaId, p.itemId, { preco: gv("p"), fornecedor: gv("f"), data: gv("d") }, { travado: travado, quem: quem, agora: new Date().toISOString(), Orcamento: global.Orcamento });
        if (!rr.ok) { UI.toast(rr.motivo, "erro"); return; }
        try { var g2 = app.persistir(); app.render(); if (app._gravou && !app._gravou(g2)) return; } catch (e4) {}
        MorUI._autoRefazer(); UI.toast("Preço gravado no item com a fonte «cotação fornecedor».", "ok");
      }
    },

    /* ---- relatório «Como este orçamento foi montado» ---- */
    relatorioHtml: function (orc) {
      var m = MorUI.memoria(), perfil = null;
      try { perfil = MorUI.perfilDe(orc); } catch (e) { perfil = null; }
      var R = global.MorRelatorio.montar(orc, { catalogo: C, memoria: m ? m.mem : null, perfil: perfil });
      var emp = ""; try { emp = (typeof Empresa !== "undefined" && Empresa.dados && (Empresa.dados() || {}).nome) || ""; } catch (e2) {}
      return { rel: R, html: global.MorRelatorio.html(R, { empresa: emp, data: new Date().toISOString().slice(0, 10) }) };
    },
    /* PDF pelo mesmo caminho dos outros relatórios do app: janela própria + impressão (Salvar como PDF) */
    imprimirRelatorio: function (html) {
      var w = window.open("", "_blank"); if (!w) { UI.toast("O navegador bloqueou a janela do relatório — libere pop-ups.", "erro"); return false; }
      w.document.open(); w.document.write(html.replace("</body>", "<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body>")); w.document.close();
      return true;
    },
    abrirRelatorio: function (app) {
      var orc = app && app.orcAtual; if (!orc) return;
      var r = MorUI.relatorioHtml(orc);
      UI.modal("Como este orçamento foi montado", '<iframe title="Relatório" style="width:100%;height:52vh;border:1px solid var(--linha)" srcdoc="' + esc(r.html) + '"></iframe>', [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Baixar em PDF", classe: "primary", onClick: function () { MorUI.imprimirRelatorio(r.html); } }
      ]);
    },

    /* ---- passos do roteiro estendido ---- */
    irPasso: function (app, id) {
      var orc = app && app.orcAtual; if (!orc) return;
      if (id === "tipo") return MorUI.abrirTipo(app);
      if (id === "parametros") return MorUI.abrirParametros(app);
      if (id === "conferencia") return MorUI.abrirConferencia(app);
      if (id === "etapas") {
        var alvo = null; (orc.etapas || []).forEach(function (e) { if (!alvo && !(e.itens || []).length && C.etapaPorNome(e.nome)) alvo = e; });
        if (alvo) { if (app.aba !== "planilha") app.aba = "planilha"; try { app.render(); } catch (e) {} MorUI.abrirEtapa(app, alvo.id); }
        else { if (app.aba !== "planilha") app.aba = "planilha"; try { app.render(); } catch (e2) {} }
      }
    },
    abrirTipo: function (app) {
      var orc = app.orcAtual, mor = MM.garantir(orc);
      UI.modal("Tipo de obra", '<p class="muted">As etapas padrão e os Serviços Preliminares já nascem (nenhum item entra sozinho).</p>' + MorUI.campoTipo(mor.tipologia || ""), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar as etapas", classe: "primary", onClick: function () {
          var t = MorUI.lerTipoDoAssistente(); if (!t) { UI.toast("Escolha o tipo de obra.", "info"); return; }
          var r = MM.nascer(orc, t, global.Orcamento); try { app.persistir(); } catch (e) {} UI.fecharModal(); app.render();
          UI.toast(r.erro ? r.erro : (r.criadas.length + " etapa(s) criada(s)."), r.erro ? "erro" : "ok");
        } }
      ]);
      MorUI._escutarDoc();
    },
    abrirParametros: function (app) {
      var orc = app.orcAtual, mor = MM.garantir(orc), obra = {};
      MM.CAMPOS_OBRA.forEach(function (c) { if (!vazio(mor.params[c])) obra[c] = mor.params[c]; });
      var campos = '<div class="row" style="flex-wrap:wrap;gap:8px">' + C.PERGUNTAS_OBRA.map(function (q) {
        var v = vazio(obra[q.id]) ? (q.opcional ? "" : q.padrao) : obra[q.id];
        return '<div style="flex:1 1 150px">' + MorUI._campo({ id: q.id, txt: q.txt, op: q.op, rotulos: q.rotulos, num: q.num }, v, "mor-o-") + "</div>";
      }).join("") + "</div>";
      UI.modal("Parâmetros da obra / documento", campos + MorUI.blocoDocumento(), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar parâmetros", classe: "primary", onClick: function () {
          var o = {}; C.PERGUNTAS_OBRA.forEach(function (q) { var el = document.getElementById("mor-o-" + q.id); if (el) o[q.id] = String(el.value || "").replace(/^\s+|\s+$/g, ""); });
          MM.definirParams(orc, o);
          if (MorUI._plano) { try { var rr = MorUI._aplicarPlano(orc, MorUI._plano); UI.toast("Documento aplicado: " + rr.inseridos + " item(ns), " + rr.pendentes + " pendente(s).", "ok"); } catch (e) { UI.toast("Não consegui aplicar o documento: " + ((e && e.message) || e), "erro"); } MorUI._plano = null; }
          try { app.persistir(); } catch (e2) {} UI.fecharModal(); app.render();
        } }
      ]);
      MorUI._escutarDoc();
    },

    /* ---- chave «Mostrar BDI na proposta» (liga/desliga; desligada = NENHUMA menção a BDI no documento) ---- */
    bdiOculto: function (orc) { return !!(orc && orc.mor && orc.mor.proposta && orc.mor.proposta.mostrarBdi === false); },
    /* o que a chave faz com as frases (a prévia ao vivo) */
    textoPreviaBdi: function (orc, ligado) {
      var pct = 0; try { pct = Number(orc.bdi && orc.bdi.percentual) || 0; } catch (e) {}
      return ligado ? ('A proposta cita o BDI (' + f2(pct) + '%): «Os preços já incluem o BDI (' + f2(pct) + '%)», a metodologia do Acórdão TCU e a nota «Valores com BDI de ' + f2(pct) + '% incluso».')
        : "O documento não terá NENHUMA menção a BDI: nem percentual, nem metodologia, nem «preços já incluem». Os preços seguem iguais; o BDI só não é dito.";
    },
    chaveBdi: function (orc) {
      var lig = !MorUI.bdiOculto(orc);
      return '<div id="mor-bdi-chave" class="mod-aviso" style="margin:0 0 10px;padding:10px;border:2px solid var(--p-aco,#2e6f9e);border-radius:6px"><label style="display:flex;gap:10px;align-items:center;font-size:15px;font-weight:700;cursor:pointer"><input type="checkbox" id="mor-bdi-ck" data-mor-bdi="1" style="width:22px;height:22px"' + (lig ? " checked" : "") + '> Mostrar BDI na proposta <span id="mor-bdi-est" class="g-pill" style="background:' + (lig ? "#16a34a22;color:#16a34a" : "#b4231822;color:#b42318") + ';font-weight:700">' + (lig ? "LIGADO" : "DESLIGADO") + '</span></label><div id="mor-bdi-previa" class="muted" style="font-size:12.5px;margin-top:4px">' + esc(MorUI.textoPreviaBdi(orc, lig)) + "</div></div>";
    },
    definirMostrarBdi: function (orc, ligado) {
      var mor = MM.garantir(orc); mor.proposta = mor.proposta || {}; mor.proposta.mostrarBdi = !!ligado; return mor.proposta.mostrarBdi;
    },
    injetarChaveBdi: function (orc) {
      if (!MorUI.ativo() || typeof document === "undefined") return false;
      var corpo = document.querySelector("#modal-bg .body"); if (!corpo || document.getElementById("mor-bdi-chave")) return false;
      var d = document.createElement("div"); d.innerHTML = MorUI.chaveBdi(orc); corpo.insertBefore(d.firstChild, corpo.firstChild); return true;
    },
    /* o modelo de proposta sem BDI: nenhuma página cita (percentual, metodologia TCU, nota de preços) */
    semBdiNoModelo: function (m, orc) {
      if (!MorUI.bdiOculto(orc)) return m;
      var c = JSON.parse(JSON.stringify(m));
      (c.paginas || []).forEach(function (p) {
        if (p.mostrarBdi !== undefined) p.mostrarBdi = false;
        if (p.mostrarBdiTcu !== undefined) p.mostrarBdiTcu = false;
        p.mostrarBdi = false; p.mostrarBdiTcu = false;
        /* a FRASE INTEIRA que cita BDI (nota de preços, lista de serviços, texto personalizado) sai — não só a palavra */
        var limpar = function (o) {
          Object.keys(o).forEach(function (k) {
            if (typeof o[k] === "string") o[k] = global.Proposta && global.Proposta.semBdiTexto ? global.Proposta.semBdiTexto(o[k]) : o[k];
            else if (o[k] && typeof o[k] === "object") limpar(o[k]);
          });
        };
        limpar(p);
      });
      return c;
    },

    /* ---- aceitar a composição por família (só com o clique do usuário): grava na PROPRIA e na memória ---- */
    aceitarComposicao: function (idx) {
      var pl = MorUI._plano, A = global.App; if (!pl || !pl.itens[idx]) return { ok: false, motivo: "item inexistente" };
      var x = pl.itens[idx], s = x.resolucao || {}, comp = s.composicao && s.composicao.comp;
      if (s.estado !== "composto" || !comp) return { ok: false, motivo: "este item não tem composição proposta" };
      if (!A || typeof A._propriaGravarVarios !== "function") return { ok: false, motivo: "a base PRÓPRIA não está disponível aqui" };
      var existentes = A._cpCodigosExistentes ? A._cpCodigosExistentes() : [];
      var c = JSON.parse(JSON.stringify(comp));
      if (existentes.some(function (k) { return String(k).toLowerCase() === String(c.codigo).toLowerCase(); }) && global.MorCompositor) c.codigo = global.MorCompositor.gerarCodigoAuto(existentes);
      var agora = new Date().toISOString(); c.criadoEm = c.criadoEm || agora; c.atualizadoEm = agora;
      try { A._propriaGravarVarios([c]); } catch (e) { return { ok: false, motivo: "não consegui gravar: " + ((e && e.message) || e) }; }
      var m = MorUI.memoria();
      if (m) { global.MorMemoria.registrarComposicao(m.mem, x.descricao, c, { unidade: x.unidade }); m.salvar(); }
      x.marcado = true;
      x.resolucao = { estado: "casado", codigo: c.codigo, fonte: "PROPRIA", confianca: 0.9, escolhido: true, aceita: true, motivo: "composição própria aceita por você (" + (s.composicao.familia || "") + ")", sugestoes: [] };
      pl.relatorio.compostos = Math.max(0, pl.relatorio.compostos - 1); pl.relatorio.casados++;
      return { ok: true, codigo: c.codigo };
    },

    /* A2 (revisão adversária): o item é buscado pela (FONTE, código) que o motor resolveu — o mesmo número existe em bases
       diferentes (o 010808 do IOPES não é o da SINAPI). Sem fonte (ou SINAPI): SINAPI; PROP*: base PRÓPRIA; outra: Bases.obter(fonte, código). */
    _obterBase: function (cod, fonte) {
      try {
        var f = String(fonte || "").toUpperCase(), c = String(cod);
        if (f && f !== "SINAPI" && typeof Bases !== "undefined" && Bases.obter) { var b = Bases.obter(f, c); return b || null; }   /* fonte pedida e não achada: NÃO cai na SINAPI */
        if (/^PROP/i.test(c) && typeof Bases !== "undefined" && Bases.obter) { var p = Bases.obter("PROPRIA", c); if (p) return p; }
        return (typeof Sinapi !== "undefined" && Sinapi.obter) ? Sinapi.obter(c) : null;
      } catch (e) { return null; }
    },
    /* A1: o que entra marcado na prévia do documento — só o de confiança ALTA (código do documento conferido, memória idêntica,
       escolhido/aceito por você, casado com ≥ 90%) */
    confiancaAlta: function (x) {
      var s = (x && x.resolucao) || {};
      if (!s.codigo) return false;
      if (s.estado === "codigo-do-documento" || s.escolhido === true || s.aceita === true || s.via === "memoria") return true;
      return s.estado === "casado" && Number(s.confianca) >= 0.9;
    },
    /* ---------------- F6: sugestões de 1 clique, «ensinar», memória ---------------- */

    /* até 3 melhores sugestões do casador para um item PENDENTE, com a confiança de cada uma (só ≥ 70%) */
    htmlSugestoes: function (idx, s) {
      var l = (s.sugestoes || []).filter(function (g) { return Number(g.confianca) >= 0.7; }).slice(0, 3);
      if (!l.length) return "";
      return '<div class="mor-sugs" style="margin-top:4px;display:flex;flex-direction:column;gap:3px">' + l.map(function (g) {
        return '<button type="button" class="btn sm ghost" data-mor-sug="' + idx + "|" + esc(g.codigo) + "|" + esc(g.fonte || "SINAPI") + '" title="' + esc((g.aviso ? g.aviso + " — " : "") + g.descricao) + '">' + (g.memoria ? "<b>memória</b> · " : "") + esc((g.fonte || "SINAPI") + " " + g.codigo) + " · " + (g.memoria ? "usado antes" : Math.round((g.confianca || 0) * 100) + "%") + " — " + esc(String(g.descricao).slice(0, 70)) + "</button>";
      }).join("") + "</div>";
    },
    /* «ensinar»: associa um trecho da frase a uma intenção do dicionário (vale nas próximas leituras) */
    htmlEnsinar: function (i, frase) {
      var ops = global.MorIntencoes ? global.MorIntencoes.entradas().filter(function (e) { return e.origem === "dicionario" && /^[SM]$/.test(e.tipo); }).map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.id) + "</option>"; }).join("") : "";
      return ' <details style="display:inline-block"><summary class="muted" style="font-size:12px;cursor:pointer">ensinar</summary><span class="row" style="gap:4px;flex-wrap:wrap"><input data-mor-ens-txt="' + i + '" value="' + esc(frase.slice(0, 120)) + '" aria-label="Trecho da frase" style="min-width:220px"><select data-mor-ens-int="' + i + '" aria-label="Intenção">' + ops + '</select><button type="button" class="btn sm" data-mor-ens="' + i + '">Ensinar</button></span></details>';
    },
    _ufEmpresa: function () { try { var A = global.App; return String((A && A._baseUf) || (typeof Sinapi !== "undefined" && Sinapi.uf) || "").toUpperCase(); } catch (e) { return ""; } },
    _empresaId: function () { try { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : ""; } catch (e) { return ""; } },
    /* a memória desta empresa neste aparelho: { mem, salvar() } ou null (sem armazenamento) */
    memoria: function () {
      if (!global.MorMemoria || typeof localStorage === "undefined") return null;
      var emp = MorUI._empresaId();
      if (!MorUI._mem || MorUI._memEmp !== emp) {
        var r = global.MorMemoria.carregar(localStorage, emp);
        MorUI._mem = { mem: r.mem, avisos: r.avisos, salvar: function () { return global.MorMemoria.salvar(localStorage, emp, MorUI._mem.mem); } };
        MorUI._memEmp = emp;
      }
      return MorUI._mem;
    },
    _optsLeitor: function () { var m = MorUI.memoria(); return { frases: m ? global.MorMemoria.frasesEnsinadas(m.mem) : [], ufEmpresa: MorUI._ufEmpresa() }; },
    _padroes: function (orc) {
      try { var m = MorUI.memoria(); if (!m) return null; var tp = orc && orc.mor && orc.mor.tipologia; return tp ? global.MorMemoria.padroes(m.mem, tp, C) : null; } catch (e) { return null; }
    },
    /* o usuário clicou numa das ≤ 3 sugestões: vale para este item e fica na memória (correção do usuário vence sempre) */
    escolherSugestao: function (idx, codigo, fonte) {
      var pl = MorUI._plano; if (!pl || !pl.itens[idx]) return false;
      var x = pl.itens[idx], s = x.resolucao || {}, g = (s.sugestoes || []).filter(function (q) { return String(q.codigo) === String(codigo); })[0];
      x.resolucao = { estado: "casado", codigo: String(codigo), fonte: fonte || "SINAPI", confianca: g ? g.confianca : 0, escolhido: true, motivo: "escolhido por você entre as sugestões", sugestoes: s.sugestoes || [] }; x.marcado = true;
      pl.relatorio.pendentes = Math.max(0, pl.relatorio.pendentes - 1); pl.relatorio.casados++;
      var m = MorUI.memoria();
      if (m) { global.MorMemoria.registrarCasamento(m.mem, x.descricao, { codigo: codigo, fonte: fonte || "SINAPI" }, { corrigido: true, unidade: x.unidade }); m.salvar(); }
      return true;
    },
    ensinar: function (i, trecho, entradaId) {
      var m = MorUI.memoria(); if (!m) return { ok: false, motivo: "sem armazenamento neste aparelho" };
      var r = global.MorMemoria.ensinarFrase(m.mem, trecho, entradaId); if (r.ok) m.salvar(); return r;
    },
    /* custo/m² por etapa do orçamento (em ids do catálogo) e a leitura da faixa contra os anteriores */
    perfilDe: function (orc) {
      var c = global.Orcamento.calcular(orc), area = Number(orc.mor && orc.mor.params && orc.mor.params.area), et = {};
      (orc.etapas || []).forEach(function (e, i) { var cat = C.etapaPorNome(e.nome); if (cat && c.porEtapa[i] && c.porEtapa[i].custoDireto > 0) et[cat.id] = c.porEtapa[i].custoDireto; });
      return { orcId: orc.id, tipologia: orc.mor && orc.mor.tipologia, area: area, etapas: et };
    },
    /* depois de inserir: alerta de faixa (contra os anteriores) e grava o perfil deste orçamento */
    perfilEAlertas: function (orc) {
      var m = MorUI.memoria(); if (!m || !global.Orcamento) return [];
      var p = MorUI.perfilDe(orc), out = [];
      if (!(p.area > 0) || !p.tipologia) return out;
      Object.keys(p.etapas).forEach(function (id) {
        var f = global.MorMemoria.faixa(m.mem, p.tipologia, id, p.etapas[id] / p.area, { ignorarOrc: orc.id });
        if (f.alerta) out.push((C.etapa(id) || {}).etapa + " " + f.texto);
      });
      global.MorMemoria.registrarPerfil(m.mem, p); m.salvar();
      return out;
    },

    /* a tela de Memória do Motor (ver / esquecer / exportar / importar) */
    htmlMemoria: function (mem) {
      var r = global.MorMemoria.resumo(mem), h = '<div class="mor-memoria">';
      h += '<p class="muted">O motor aprende com o que você escolhe. Fica neste aparelho (não vai para a nuvem). Resumo: <b>' + r.casamentos + "</b> casamento(s) (" + r.corrigidos + " corrigido(s) por você), <b>" + r.composicoes + "</b> composição(ões) aceita(s), <b>" + r.perfis + "</b> orçamento(s) no perfil de custo, <b>" + r.frases + "</b> frase(s) ensinada(s).</p>";
      var ks = Object.keys(mem.casamentos);
      if (ks.length) h += '<table class="tbl"><thead><tr><th>Intenção</th><th>Código</th><th class="right">Usos</th><th></th></tr></thead><tbody>' + ks.map(function (k) { var c = mem.casamentos[k]; return "<tr><td>" + esc(c.intencao) + "</td><td>" + esc(c.fonte + " " + c.codigo) + (c.corrigido ? " " + pilula("corrigido por você", "ok") : "") + '</td><td class="right">' + c.usos + '</td><td><button type="button" class="btn sm ghost" data-mor-esq="casamento|' + esc(k) + '">Esquecer</button></td></tr>'; }).join("") + "</tbody></table>";
      var fs = Object.keys(mem.frases);
      if (fs.length) h += '<table class="tbl" style="margin-top:6px"><thead><tr><th>Frase ensinada</th><th>Intenção</th><th></th></tr></thead><tbody>' + fs.map(function (k) { var f = mem.frases[k]; return "<tr><td>" + esc(f.frase) + "</td><td>" + esc(f.entrada) + '</td><td><button type="button" class="btn sm ghost" data-mor-esq="frase|' + esc(k) + '">Esquecer</button></td></tr>'; }).join("") + "</tbody></table>";
      h += '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn sm" data-mor-mem="exportar">Exportar JSON</button> <input type="file" id="mor-mem-arq" accept=".json" aria-label="Importar memória (JSON)"> <button type="button" class="btn sm" data-mor-mem="importar">Importar (somar)</button> <button type="button" class="btn sm ghost" data-mor-esq="tudo|">Esquecer tudo</button></div><textarea id="mor-mem-json" rows="4" style="width:100%;margin-top:6px" placeholder="O JSON exportado aparece aqui"></textarea></div>';
      return h;
    },
    abrirMemoria: function () {
      var m = MorUI.memoria(); if (!m) { UI.toast("Sem armazenamento neste aparelho.", "erro"); return; }
      UI.modal("Memória do Motor", '<div id="mor-mem-corpo">' + MorUI.htmlMemoria(m.mem) + "</div>", [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },

    /* texto do arquivo (txt/pdf/docx) ou matriz (planilha) → leitura. cb(leitura, erro) */
    _lerArquivo: function (file, cb) {
      var nome = String(file.name || "").toLowerCase(), A = global.App;
      if (/\.(xlsx|xls|csv)$/.test(nome)) {
        if (!A || !A._lerPlanilha) { cb(null, "Leitor de planilha indisponível."); return; }
        A._lerPlanilha(file, function (matriz, err) {
          if (!matriz) { cb(null, err || "Não consegui ler a planilha."); return; }
          cb(global.MorLeitor.dePlanilha(matriz, MorUI._optsLeitor()), null);
        });
        return;
      }
      if (/\.(pdf|docx)$/.test(nome)) {
        if (typeof CplproTpl === "undefined" || !CplproTpl.memorialParaEscopo) { cb(null, "Leitor de memorial indisponível."); return; }
        var fim = function (r) { if (!r.ok) cb(null, r.erro); else cb(global.MorLeitor.deMemorial(r.texto, MorUI._optsLeitor()), null); };
        if (/\.pdf$/.test(nome)) { CplproTpl.memorialParaEscopo(file.name, null, null, (typeof Gestao !== "undefined" && Gestao._pdfTexto) ? function (cb2) { Gestao._pdfTexto(file, cb2); } : null).then(fim); return; }
        var fr = new FileReader();
        fr.onload = function () {
          var inflar = (typeof DecompressionStream === "undefined" || typeof Response === "undefined") ? null : function (b) { var ds = new DecompressionStream("deflate-raw"); return new Response(new Blob([b]).stream().pipeThrough(ds)).arrayBuffer().then(function (x) { return new Uint8Array(x); }); };
          CplproTpl.memorialParaEscopo(file.name, new Uint8Array(fr.result), inflar, null).then(fim);
        };
        fr.onerror = function () { cb(null, "Falha ao ler o arquivo."); };
        fr.readAsArrayBuffer(file);
        return;
      }
      var fr2 = new FileReader();
      fr2.onload = function () { cb(global.MorLeitor.deMemorial(String(fr2.result), MorUI._optsLeitor()), null); };
      fr2.onerror = function () { cb(null, "Falha ao ler o arquivo."); };
      fr2.readAsText(file);
    },

    /* o botão «Ler o documento»: lê, entende, resolve cada item nas bases e mostra. Não grava nada. */
    lerDocumento: function () {
      var d = document, res = d.getElementById("mor-doc-res"), A = global.App;
      if (!res || !global.MorLeitor) return;
      var arq = d.getElementById("mor-doc-arq"), txt = d.getElementById("mor-doc-txt");
      var seguir = function (leitura, erro) {
        if (!leitura) { res.innerHTML = '<p class="muted">' + esc(erro || "Não consegui ler.") + "</p>"; return; }
        var ctx = MorUI._ctxBases(A), mem = MorUI.memoria();
        var plano = global.MorLeitor.montar(leitura, ctx, { memoria: mem ? mem.mem : null });
        MorUI._leitura = leitura;
        if (txt && /edital|licita/i.test(String(txt.value).slice(0, 400))) { try { plano.edital = global.MorLeitor.deEdital(String(txt.value), { ufEmpresa: MorUI._ufEmpresa() }); } catch (e) { /* ajuda */ } }
        plano.itens.forEach(function (x) { x.marcado = MorUI.confiancaAlta(x); });   /* A1: só a confiança ALTA nasce marcada */
        MorUI._plano = plano;
        res.innerHTML = MorUI.htmlPlano(plano);
        var sel = d.getElementById("mor-tipologia");
        if (sel && plano.tipologia && C.tipologia(plano.tipologia)) sel.value = plano.tipologia;
      };
      if (arq && arq.files && arq.files[0]) { res.innerHTML = '<p class="muted">Lendo…</p>'; MorUI._lerArquivo(arq.files[0], seguir); return; }
      if (!txt || !String(txt.value || "").trim()) { res.innerHTML = '<p class="muted">Cole um texto ou escolha um arquivo.</p>'; return; }
      seguir(global.MorLeitor.deMemorial(String(txt.value), MorUI._optsLeitor()), null);
    },

    _escutarDoc: function () {
      if (MorUI._escutando || typeof document === "undefined") return;
      MorUI._escutando = true;
      document.addEventListener("change", function (ev) {
        var t = ev.target;
        if (t && t.getAttribute && t.getAttribute("data-mor-bdi")) {
          var A = global.App, orc = A && A.orcAtual; if (!orc) return;
          var lig = !!t.checked; MorUI.definirMostrarBdi(orc, lig); try { A.persistir({ semBackupModal: true }); } catch (e) {}
          var est = document.getElementById("mor-bdi-est"), pv = document.getElementById("mor-bdi-previa");
          if (est) { est.textContent = lig ? "LIGADO" : "DESLIGADO"; est.style.background = lig ? "#16a34a22" : "#b4231822"; est.style.color = lig ? "#16a34a" : "#b42318"; }
          if (pv) pv.textContent = MorUI.textoPreviaBdi(orc, lig);
        }
      });
      document.addEventListener("click", function (ev) {
        var t = ev.target;
        var di = t && t.getAttribute && t.getAttribute("data-mor-doc-item");
        if (di !== null && di !== undefined && di !== "" && MorUI._plano && MorUI._plano.itens[Number(di)]) { MorUI._plano.itens[Number(di)].marcado = !!t.checked; return; }
        var dt = t && t.getAttribute && t.getAttribute("data-mor-doc-todos");
        if (dt !== null && dt !== undefined && MorUI._plano) {
          MorUI._plano.itens.forEach(function (x) { var s0 = x.resolucao || {}; if (s0.codigo && (s0.estado === "casado" || s0.estado === "codigo-do-documento")) x.marcado = dt === "1"; });
          var rr1 = document.getElementById("mor-doc-res"); if (rr1) rr1.innerHTML = MorUI.htmlPlano(MorUI._plano); return;
        }
        var ac = t && t.getAttribute && t.getAttribute("data-mor-aceitar");
        if (ac !== null && ac !== undefined && ac !== "" ) {
          var ra = MorUI.aceitarComposicao(Number(ac));
          if (ra.ok) { var rr0 = document.getElementById("mor-doc-res"); if (rr0) rr0.innerHTML = MorUI.htmlPlano(MorUI._plano); UI.toast("Composição " + ra.codigo + " gravada na base PRÓPRIA e na memória.", "ok"); } else UI.toast(ra.motivo, "erro");
          return;
        }
        var inModal = t && t.closest && t.closest("#modal-bg");
        if (inModal && t.getAttribute && t.getAttribute("data-mor-porque")) { var pq = t.getAttribute("data-mor-porque").split("|"); MorUI.porque(global.App, pq[0], pq[1]); return; }
        if (inModal && t.getAttribute && t.getAttribute("data-mor-ok")) { var ok = t.getAttribute("data-mor-ok").split("|"); MorUI.confirmarOk(global.App, ok[0], ok[1]); var cc = document.querySelector("#modal-bg .body"); if (cc && /Conferência/.test(((document.querySelector("#modal-bg h2") || {}).textContent) || "")) cc.innerHTML = MorUI.htmlConferencia(global.App.orcAtual); return; }
        var sg = t && t.getAttribute && t.getAttribute("data-mor-sug");
        if (sg) { var pp = sg.split("|"); if (MorUI.escolherSugestao(Number(pp[0]), pp[1], pp[2])) { var rr = document.getElementById("mor-doc-res"); if (rr) rr.innerHTML = MorUI.htmlPlano(MorUI._plano); } return; }
        var en = t && t.getAttribute && t.getAttribute("data-mor-ens");
        if (en) {
          var tx = document.querySelector('[data-mor-ens-txt="' + en + '"]'), sl = document.querySelector('[data-mor-ens-int="' + en + '"]');
          var re = tx && sl ? MorUI.ensinar(Number(en), tx.value, sl.value) : { ok: false, motivo: "campos ausentes" };
          if (re.ok) MorUI.lerDocumento(); else UI.toast(re.motivo || "Não consegui ensinar.", "erro");
          return;
        }
        var esq = t && t.getAttribute && t.getAttribute("data-mor-esq");
        if (esq) { var ps2 = esq.split("|"), mm = MorUI.memoria(); if (mm && global.MorMemoria.esquecer(mm.mem, ps2[0], ps2[1])) { mm.salvar(); var cb2 = document.getElementById("mor-mem-corpo"); if (cb2) cb2.innerHTML = MorUI.htmlMemoria(mm.mem); } return; }
        var mo = t && t.getAttribute && t.getAttribute("data-mor-mem");
        if (mo) {
          var mm2 = MorUI.memoria(), ta = document.getElementById("mor-mem-json");
          if (mo === "exportar" && mm2 && ta) ta.value = global.MorMemoria.exportar(mm2.mem);
          if (mo === "importar" && mm2) {
            var ar = document.getElementById("mor-mem-arq"), usar = function (txt) { var ri = global.MorMemoria.importar(mm2.mem, txt, "mesclar"); if (!ri.ok) { UI.toast(ri.motivo, "erro"); return; } mm2.mem = ri.mem; MorUI._mem.mem = ri.mem; mm2.salvar(); var cb3 = document.getElementById("mor-mem-corpo"); if (cb3) cb3.innerHTML = MorUI.htmlMemoria(ri.mem); UI.toast("Memória importada (somada à atual; correções suas vencem).", "ok"); };
            if (ar && ar.files && ar.files[0]) { var fr3 = new FileReader(); fr3.onload = function () { usar(String(fr3.result)); }; fr3.readAsText(ar.files[0]); } else if (ta && ta.value.trim()) usar(ta.value);
            else UI.toast("Escolha um arquivo .json ou cole o JSON.", "info");
          }
          return;
        }
        var au = t && t.getAttribute && t.getAttribute("data-mor-auto");
        if (au) { try { MorUI.acaoAutomacao(au); } catch (eAu) { UI.toast("Falha na automação: " + ((eAu && eAu.message) || eAu), "erro"); } return; }
        if (t && t.id === "mor-doc-mem") { ev.preventDefault(); MorUI.abrirMemoria(); return; }
        if (t && t.id === "mor-doc-ler") { ev.preventDefault(); try { MorUI.lerDocumento(); } catch (e) { var r = document.getElementById("mor-doc-res"); if (r) r.innerHTML = '<p class="muted">Falha ao ler: ' + esc((e && e.message) || e) + "</p>"; } }
      });
    },

    /* aplica o plano lido ao orçamento RECÉM-CRIADO: parâmetros, respostas, etapas e itens com código. O resto fica em orc.mor.documento. */
    _aplicarPlano: function (orc, pl) {
      var O = global.Orcamento, mor = MM.garantir(orc), k, res = { etapas: 0, inseridos: 0, pendentes: 0, semPreco: 0 };
      MM.definirParams(orc, pl.obra || {});
      for (k in (pl.respostas || {})) if (Object.prototype.hasOwnProperty.call(pl.respostas, k)) MM.definirResposta(orc, k, pl.respostas[k]);
      var existentes = {}; (orc.etapas || []).forEach(function (e) { existentes[C.semAcento(e.nome)] = e; });
      pl.etapas.forEach(function (e) { if (!existentes[C.semAcento(e.nome)]) { O.addEtapa(orc, e.nome); res.etapas++; } });
      (orc.etapas || []).forEach(function (e) { existentes[C.semAcento(e.nome)] = e; });
      var cfg = O.garantirConfig ? O.garantirConfig(orc) : {}, porEtapa = {}, pend = [];
      pl.itens.forEach(function (x, i) {
        var s = x.resolucao || {};
        if ((s.estado === "casado" || s.estado === "codigo-do-documento") && s.codigo && x.marcado === true) {
          var cat = x.etapa ? C.etapa(x.etapa) : null, nomeEt = cat ? cat.etapa : (x.etapaNome || "SERVIÇOS DO DOCUMENTO");
          var et = existentes[C.semAcento(nomeEt)];
          if (!et) { O.addEtapa(orc, nomeEt); (orc.etapas || []).forEach(function (e) { existentes[C.semAcento(e.nome)] = e; }); et = existentes[C.semAcento(nomeEt)]; }
          (porEtapa[et.id] = porEtapa[et.id] || []).push({
            etapa: nomeEt, codigo: s.codigo, fonte: s.fonte || "SINAPI", descricao: x.descricao, unidade: x.unidade, quantidade: x.quantidade, formula: "do documento: " + x.bruto, estado: "ok",
            mor: { regra: "doc." + (i + 1), formula: "", premissas: ["Quantidade escrita no documento: " + x.bruto], origem: s.aceita ? "composta" : (s.estado === "casado" ? (s.via === "memoria" ? "memoria" : "casador") : "documento"), confianca: s.estado === "casado" ? "media" : "alta", codigos: [s.codigo], intencao: x.busca || "", elementoOrigem: x.bruto || "", vars: {}, conferido: false, casamento: s.estado === "casado" ? { confianca: s.confianca, motivo: s.motivo } : undefined }
          });
        } else pend.push({ bruto: x.bruto, quantidade: x.quantidade, unidade: x.unidade, etapa: x.etapa || x.etapaNome || "", motivo: ((s.estado === "casado" || s.estado === "codigo-do-documento") && s.codigo) ? "resolvido (" + s.fonte + " " + s.codigo + ") mas NÃO marcado na prévia — marque para entrar" : (s.motivo || ""), sugestoes: (s.sugestoes || []).map(function (g) { return g.codigo; }), composicao: s.composicao ? { codigo: s.composicao.codigo, familia: s.composicao.familia, referencia: s.composicao.referencia } : null });
      });
      Object.keys(porEtapa).forEach(function (etId) {
        var linhas = porEtapa[etId], marc = linhas.map(function (l) { return l.mor.regra; });
        var r = MM.inserir(orc, etId, { itens: linhas }, marc, {
          Orcamento: O, permitirZerado: !!cfg.permitirZerado,
          obter: function (cod, fonte) { return MorUI._obterBase(cod, fonte); },
          totalItens: O.totais(orc).qtdItens, limiteItens: (typeof Auth !== "undefined" && Auth.limite) ? Auth.limite("limiteItensPorOrcamento") : 0
        });
        res.inseridos += r.inseridos; res.semPreco += r.semPreco.length;
      });
      res.pendentes = pend.length;
      mor.documento = { v: 1, origem: pl.origem, tipologia: pl.tipologia, pendentes: pend, naoEntendidas: pl.naoEntendidas, conflitos: pl.conflitos, negados: pl.negados, prazo: pl.prazo || null, edital: pl.edital || null, relatorio: pl.relatorio, em: new Date().toISOString() };
      return res;
    },

    /* um campo de pergunta (da etapa ou da obra) */
    _campo: function (q, valor, prefixo) {
      var id = prefixo + q.id, v = valor;
      if (q.tipo === "bool" || q.bool) return '<label class="ow-check" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="' + esc(id) + '"' + (v ? " checked" : "") + "> <span>" + esc(q.txt) + "</span></label>";
      var h = '<div class="field"><label for="' + esc(id) + '">' + esc(q.txt) + (q.daMemoria ? ' <span class="muted" style="font-weight:400;font-size:12px">(padrão da sua empresa)</span>' : "") + "</label>";
      if (q.op) {
        h += '<select id="' + esc(id) + '">' + q.op.map(function (o) { return '<option value="' + esc(o) + '"' + (o === v ? " selected" : "") + ">" + esc((q.rotulos && q.rotulos[o]) || o) + "</option>"; }).join("") + "</select>";
      } else {
        h += '<input id="' + esc(id) + '" inputmode="decimal" value="' + esc(vazio(v) ? "" : String(v).replace(".", ",")) + '">';
      }
      return h + "</div>";
    },

    /* O painel inteiro (corpo do modal) a partir do estado:
       { nomeEtapa, obra:{campo:valor}, previa (de MorManual.previa), marcadas:{regra:true}, tipologiaRotulo } */
    htmlPainel: function (st) {
      var p = st.previa, h = "";
      /* parâmetros da obra: abertos quando falta a área (sem ela não há quantidade) */
      var faltaArea = !!(p && p.precisaObra) || vazio(st.obra.area);
      h += '<details' + (faltaArea ? " open" : "") + ' class="mor-obra"><summary><b>Parâmetros da obra</b>' + (st.tipologiaRotulo ? ' <span class="muted">— ' + esc(st.tipologiaRotulo) + "</span>" : "") + "</summary>" +
        '<div class="row" style="flex-wrap:wrap;gap:8px">' + C.PERGUNTAS_OBRA.map(function (q) {
          var pq = { id: q.id, txt: q.txt, op: q.op, rotulos: q.rotulos, num: q.num };
          var v = vazio(st.obra[q.id]) ? (q.opcional ? "" : q.padrao) : st.obra[q.id];
          return '<div style="flex:1 1 150px">' + MorUI._campo(pq, v, "mor-o-") + "</div>";
        }).join("") + "</div>" +
        '<span class="muted" style="font-size:12px">Sem banheiros, quartos e perímetro o motor estima (e diz isso nas premissas). Informe o real para mais precisão.</span></details>';
      if (!p || !p.ok) {
        return h + '<div class="mod-aviso mod-aviso-alerta" role="status" style="margin-top:10px"><div class="mod-aviso-txt"><b>Falta um dado para calcular</b><span>' + esc(((p && p.erros) || ["Informe a área da obra."]).join(" ")) + "</span></div></div>";
      }
      /* perguntas da etapa */
      if (p.perguntas.length) {
        h += '<div class="mod-sec" style="margin-top:10px"><div class="mod-sec-cab"><div><h2>Perguntas desta etapa</h2><p class="mod-sub">Já vêm com o padrão marcado — mude só o que for diferente.</p></div></div><div class="mod-sec-corpo"><div class="row" style="flex-wrap:wrap;gap:8px">' +
          p.perguntas.map(function (q) { return '<div style="flex:1 1 200px">' + MorUI._campo(q, q.valor, "mor-q-") + "</div>"; }).join("") + "</div></div></div>";
      }
      /* prévia dos itens */
      var n = p.itens.length, marc = 0;
      p.itens.forEach(function (l) { if (st.marcadas[l.mor.regra]) marc++; });
      h += '<div class="mod-sec" style="margin-top:10px"><div class="mod-sec-cab"><div><h2>Prévia dos itens</h2><p class="mod-sub">' + n + " item(ns) · " + marc + ' marcado(s). Nada entra no orçamento até confirmar.</p></div>' +
        '<div class="mod-sec-acoes"><button type="button" class="btn sm" data-mor-todos="1">Marcar todos</button> <button type="button" class="btn sm ghost" data-mor-todos="0">Desmarcar</button></div></div>' +
        '<div class="mod-sec-corpo">';
      if (!n) h += '<p class="muted">Com estas respostas nenhum item desta etapa se aplica.</p>';
      else {
        h += '<table class="tbl"><thead><tr><th></th><th>Item</th><th>Un</th><th class="right">Qtd</th><th>Origem</th></tr></thead><tbody>' + p.itens.map(function (l) {
          var ck = st.marcadas[l.mor.regra] ? " checked" : "";
          var tom = l.estado === "erro" ? "erro" : (CONFIANCA[l.mor.confianca] || "neutro");
          var rot = l.estado === "erro" ? "Fórmula inválida" : (l.estado === "qtdpendente" ? "Quantidade do projeto" : (l.codigo ? "SINAPI " + l.codigo : "Sem código — pendente"));
          if (l.mor.origem === "casador" && l.codigo) rot = (l.fonte || "SINAPI") + " " + l.codigo + " · casado pelo texto (" + Math.round((l.mor.casamento && l.mor.casamento.confianca || 0) * 100) + "%) — confira";
          else if (l.mor.propostaComposicao) rot = "Composição sugerida (" + l.mor.propostaComposicao.familia + ", ref. SINAPI " + l.mor.propostaComposicao.referencia.codigo + ") — a gravar na base própria";
          return '<tr><td><input type="checkbox" data-mor-item="' + esc(l.mor.regra) + '"' + ck + ' aria-label="Incluir ' + esc(l.descricao) + '"></td>' +
            "<td><b>" + esc(l.descricao) + '</b><div class="muted" style="font-size:12px">' + esc(l.formula) + (l.erro ? " — " + esc(l.erro) : "") + "</div></td>" +
            "<td>" + esc(l.unidade) + '</td><td class="right" title="' + esc(l.mor.formula) + '">' + (l.estado === "qtdpendente" || l.estado === "erro" ? "—" : f2(l.quantidade)) + "</td>" +
            "<td>" + pilula(rot, tom) + "</td></tr>";
        }).join("") + "</tbody></table>";
      }
      h += "</div></div>";
      if (p.premissas && p.premissas.length) h += '<details style="margin-top:8px"><summary>Premissas desta estimativa (' + p.premissas.length + ")</summary><ul>" + p.premissas.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>";
      if (p.avisos && p.avisos.length) h += '<p class="muted" style="font-size:12px">' + p.avisos.map(esc).join(" ") + "</p>";
      return h;
    },

    /* ---------------- fiação (só no navegador) ---------------- */

    /* assistente de novo orçamento: HTML do campo (vazio se a prévia está desligada) */
    campoTipoSeAtivo: function (valor) { if (!MorUI.ativo()) return ""; MorUI._escutarDoc(); return MorUI.campoTipo(valor); },
    lerTipoDoAssistente: function () { var el = typeof document !== "undefined" ? document.getElementById("mor-tipologia") : null; return el ? String(el.value || "") : ""; },

    /* o orçamento acabou de ser montado (antes de gravar): cria as etapas da tipologia */
    aoCriarOrcamento: function (orc, tipologiaId) {
      if (!MorUI.ativo() || !tipologiaId) return null;
      try {
        var r = MM.nascer(orc, tipologiaId, global.Orcamento);
        if (MorUI._plano) { try { r.documento = MorUI._aplicarPlano(orc, MorUI._plano); } catch (e2) { r.documento = { erro: String((e2 && e2.message) || e2) }; } MorUI._plano = null; }
        return r;
      } catch (e) { return { criadas: [], jaExistiam: [], erro: String((e && e.message) || e) }; }
    },

    /* botão "Itens guiados" no cabeçalho da etapa (vazio se desligada ou etapa fora do catálogo) */
    botaoEtapa: function (etapa) {
      if (!MorUI.ativo() || !etapa || !C.etapaPorNome(etapa.nome)) return "";
      var nConf = 0; try { var oa = global.App && global.App.orcAtual; if (oa && global.MorPorque) nConf = global.MorPorque.contar(oa, etapa.id); } catch (eC) { nConf = 0; }
      return '<button class="btn sm" data-mor-etapa="' + esc(etapa.id) + '" title="Perguntas desta etapa e prévia dos itens (você confirma o que entra)">Itens guiados</button>' +
        (nConf ? ' <button class="btn sm" data-mor-ok-etapa="' + esc(etapa.id) + '" title="Tirar a marca «conferir» de todas as linhas desta etapa">OK todos (' + nConf + ")</button>" : "");
    },

    /* "Nova etapa" acabou de criar a etapa `nome`: se existe no catálogo, abre o painel */
    aoAdicionarEtapa: function (app, nome) {
      if (!MorUI.ativo() || !app || !app.orcAtual || !C.etapaPorNome(nome)) return false;
      var et = null, ls = app.orcAtual.etapas || [];
      for (var i = ls.length - 1; i >= 0; i--) if (C.semAcento(ls[i].nome) === C.semAcento(nome)) { et = ls[i]; break; }
      if (!et) return false;
      MorUI.abrirEtapa(app, et.id);
      return true;
    },

    /* F4: contexto das bases do app para o casador/compositor (só leitura). null = indisponível. */
    _ctxBases: function (app) {
      try {
        if (!app || typeof app._orcmCtx !== "function") return null;
        var ctx = app._orcmCtx({ fontes: ["SINAPI"], elaborar: false });
        var tem = typeof Analitico !== "undefined" && Analitico.carregado;
        if (tem) {
          ctx.analitico = Analitico.todos();
          ctx.competencia = Analitico.competencia || "";
          ctx.resolve = function (cod, fonte) { return app._cpResolve ? app._cpResolve(cod, fonte) : null; };
          ctx.codigosExistentes = app._cpCodigosExistentes ? app._cpCodigosExistentes() : [];
        }
        return ctx;
      } catch (e) { return null; }
    },

    /* F4: item SEM código tenta o casador e o compositor (js/mor/casador.js, compositor.js). O casamento
       por texto vira o código do item (marcado «casado pelo texto — confira»); a composição por família
       é só PROPOSTA: fica pendente na prévia, com a origem à vista — gravar PROP-AUTO é decisão do orçamentista. */
    _resolver: function (st) {
      try {
        var p = st.previa; if (!p || !p.ok || !global.Mor || !global.Mor.resolverPendentes) return;
        var pend = p.itens.filter(function (l) { return !l.codigo && l.estado !== "erro"; });
        if (!pend.length) return;
        st.cacheRes = st.cacheRes || {};
        var novos = [];
        pend.forEach(function (l) {
          var c = st.cacheRes[l.mor.regra];
          if (c) { l.codigo = c.codigo; l.fonte = c.fonte; l.mor = c.mor; if (c.compPropria) l.compPropria = c.compPropria; } else novos.push(l);
        });
        if (!novos.length) return;
        if (!st.ctxBases) st.ctxBases = MorUI._ctxBases(st.app);
        if (!st.ctxBases) return;
        global.Mor.resolverPendentes(novos, st.ctxBases, {});
        novos.forEach(function (l) {
          if (l.mor.origem === "composta") {
            l.mor.propostaComposicao = l.mor.composicao; delete l.mor.composicao; delete l.compPropria;
            l.codigo = ""; l.fonte = ""; l.mor.origem = "catalogo"; l.mor.confianca = "pendente";
          }
          st.cacheRes[l.mor.regra] = { codigo: l.codigo, fonte: l.fonte, mor: l.mor };
        });
      } catch (e) { /* o resolvedor é ajuda; sem ele a prévia segue como era */ }
    },

    _marcarTudo: function (v) {
      var st = MorUI._st; if (!st || !st.previa || !st.previa.itens) return;
      st.previa.itens.forEach(function (l) { if (v) st.marcadas[l.mor.regra] = true; else delete st.marcadas[l.mor.regra]; });
    },

    /* lê os campos da tela para o estado e recalcula a prévia */
    _recalcular: function () {
      var st = MorUI._st, d = document, k;
      if (!st) return;
      C.PERGUNTAS_OBRA.forEach(function (q) { var el = d.getElementById("mor-o-" + q.id); if (el) st.obra[q.id] = String(el.value || "").replace(/^\s+|\s+$/g, ""); });
      var ps = st.previa && st.previa.perguntas || [];
      ps.forEach(function (q) {
        var el = d.getElementById("mor-q-" + q.id); if (!el) return;
        var v = q.tipo === "bool" ? el.checked : el.value;
        if (String(v) !== String(q.valor)) st.respostas[q.id] = v;     /* só vira resposta o que a pessoa mudou */
      });
      Array.prototype.forEach.call(d.querySelectorAll("[data-mor-item]"), function (el) { if (el.checked) st.marcadas[el.getAttribute("data-mor-item")] = true; else delete st.marcadas[el.getAttribute("data-mor-item")]; });
      MorUI._atualizar();
    },
    _atualizar: function () {
      var st = MorUI._st, app = st.app, orc = app.orcAtual;
      /* a prévia usa o que está na tela, sem gravar no orçamento */
      st.previa = MM.previa(orc, st.catId, st.respostas, st.obra, MorUI._padroes(orc));
      MorUI._resolver(st);
      var box = document.getElementById("mor-corpo");
      if (box) { box.innerHTML = MorUI.htmlPainel(st); MorUI._ligar(box); }
    },
    _ligar: function (box) {
      Array.prototype.forEach.call(box.querySelectorAll("input,select"), function (el) {
        el.addEventListener("change", function () { MorUI._recalcular(); });
      });
      Array.prototype.forEach.call(box.querySelectorAll("[data-mor-todos]"), function (el) {
        el.addEventListener("click", function () { MorUI._marcarTudo(el.getAttribute("data-mor-todos") === "1"); MorUI._atualizar(); });
      });
    },

    /* abre o painel da etapa `etapaOrcId` do orçamento aberto */
    abrirEtapa: function (app, etapaOrcId) {
      var orc = app && app.orcAtual; if (!orc) return;
      var et = null; (orc.etapas || []).forEach(function (e) { if (e.id === etapaOrcId) et = e; });
      var cat = et ? C.etapaPorNome(et.nome) : null;
      if (!cat) { UI.toast("Esta etapa ainda não tem itens guiados no catálogo.", "info"); return; }
      if (Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc)) { UI.toast("Este orçamento está aprovado — crie uma revisão para acrescentar itens.", "erro"); return; }
      var mor = MM.garantir(orc), t = C.tipologia(mor.tipologia);
      var obra = {}; MM.CAMPOS_OBRA.forEach(function (c) { if (!vazio(mor.params[c])) obra[c] = mor.params[c]; });
      MorUI._st = { app: app, etapaOrcId: et.id, catId: cat.id, obra: obra, respostas: {}, marcadas: {}, previa: null, tipologiaRotulo: t ? t.rotulo : "" };
      MorUI._st.previa = MM.previa(orc, cat.id, {}, obra, MorUI._padroes(orc));
      MorUI._resolver(MorUI._st);
      UI.modal("Itens guiados — " + et.nome,
        '<div id="mor-corpo">' + MorUI.htmlPainel(MorUI._st) + "</div>",
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { MorUI._st = null; UI.fecharModal(); } },
          { texto: "Inserir os itens marcados", classe: "primary", onClick: function () { MorUI.confirmar(); } }
        ]);
      var box = document.getElementById("mor-corpo"); if (box) MorUI._ligar(box);
    },

    confirmar: function () {
      var st = MorUI._st; if (!st) return;
      MorUI._recalcular();
      var app = st.app, orc = app.orcAtual, p = st.previa;
      if (!p || !p.ok) { UI.toast("Informe a área da obra para calcular as quantidades.", "erro"); return; }
      var chaves = Object.keys(st.marcadas);
      if (!chaves.length) { UI.toast("Marque ao menos um item na prévia.", "info"); return; }
      /* a confirmação grava os parâmetros e as respostas no orçamento — só agora */
      MM.definirParams(orc, st.obra);
      Object.keys(st.respostas).forEach(function (id) { MM.definirResposta(orc, id, st.respostas[id]); });
      var cfg = Orcamento.garantirConfig(orc);
      var res = MM.inserir(orc, st.etapaOrcId, p, chaves, {
        Orcamento: Orcamento, permitirZerado: !!cfg.permitirZerado,
        obter: function (cod, fonte) { return MorUI._obterBase(cod, fonte); },
        totalItens: Orcamento.totais(orc).qtdItens, limiteItens: Auth.limite("limiteItensPorOrcamento")
      });
      if (res.recusado && !res.inseridos) { UI.toast(res.recusado, "erro"); return; }
      if (app.expandirEtapa) { try { app.expandirEtapa(st.etapaOrcId, ""); } catch (e1) {} }
      /* F6: o que a pessoa RESPONDEU vira voto para o padrão da empresa; o custo/m² por etapa vira perfil e alerta de faixa */
      var memo = MorUI.memoria(), alertas = [];
      if (memo) {
        var tpl = orc.mor && orc.mor.tipologia;
        Object.keys(st.respostas).forEach(function (id) { global.MorMemoria.registrarResposta(memo.mem, tpl, id, st.respostas[id]); });
        memo.salvar();
      }
      try { alertas = MorUI.perfilEAlertas(orc); } catch (eP) { alertas = []; }
      var g = app.persistir(); UI.fecharModal(); app.render(); MorUI._st = null;
      if (app._gravou && !app._gravou(g)) return;
      var msg = res.inseridos + " item(ns) inserido(s)";
      if (res.jaExistiam) msg += "; " + res.jaExistiam + " já estava(m) na etapa";
      if (res.pendentes) msg += "; " + res.pendentes + " pendente(s) de código ou quantidade";
      if (res.semPreco.length) msg += ". " + res.semPreco.length + " ficou(aram) de fora por falta de preço na base — libere “Permitir insumos com preço zerado” em Parâmetros ou resolva no Orçamentista";
      if (alertas.length) msg += ". Confira a faixa: " + alertas.slice(0, 3).join("; ");
      UI.toast(msg + ".", (res.semPreco.length || alertas.length) ? "info" : "ok", (res.semPreco.length || alertas.length) ? 9000 : 4000);
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MorUI;
  global.MorUI = MorUI;
})(typeof window !== "undefined" ? window : globalThis);
