/* =====================================================================
 * metalproducaoui.js — a TELA do CONTROLE DE PRODUÇÃO POR QR (Metálica)
 * Fina: quem calcula e decide é o motor puro js/metalproducao.js.
 *   etiquetas()   (aba Metálica › Fabricação) cadastra as marcas do modelo
 *                 na obra e baixa a folha de etiquetas com QR para imprimir;
 *   acompanhar()  tabela por marca e por etapa (% do peso), filtros, marcar a
 *                 próxima etapa, .xlsx;
 *   abrirPeca()   o que o QR abre no CELULAR: a marca, as 6 etapas e o botão
 *                 de marcar a etapa cumprida.
 * Mora no NÚCLEO (não no grupo BIM): o celular do pátio abre o QR sem carregar
 * o modelador. Só `etiquetas()` precisa do modelo (BimMetalFab, do grupo BIM).
 *
 * O QR leva  <endereço do app>#metalprod=<obra>~<marca>. Ao abrir o app com
 * esse endereço, depois do login e do banco prontos, abre a marca (ouvinte no
 * fim deste arquivo). O celular precisa da MESMA conta e da sincronização
 * ligada: é ela que leva as marcas (cadastradas no escritório) até o pátio e
 * as etapas marcadas no pátio de volta ao escritório.
 * ===================================================================== */
(function (global) {
  "use strict";
  function P() { return global.BimMetalProducao; }
  function U() { return global.BimMetalUI; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function toast(t, tipo, ms) { try { if (global.UI) UI.toast(t, tipo || "ok", ms || 6000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function q(sel) { return document.querySelector(sel); }
  function eid() { try { return global.Auth && Auth.empresaId ? Auth.empresaId() : "default"; } catch (e) { return "default"; } }
  function quem() {
    try { var u = (global.Auth && Auth.usuario && Auth.usuario()) || {}; return (global.Auth && Auth.nome && Auth.nome()) || u.email || u.usuarioId || u.nome || ""; } catch (e) { return ""; }
  }
  function dataBr(iso) { if (!iso) return ""; var d = new Date(iso); if (isNaN(d.getTime())) return String(iso); function z(n) { return (n < 10 ? "0" : "") + n; } return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear() + " " + z(d.getHours()) + ":" + z(d.getMinutes()); }
  var CSS_TAB = "width:100%;font-size:12px";

  var MetalProducaoUI = {
    ultimo: null, _obra: null, _filtro: { texto: "", kind: "", etapa: "", estado: "" },
    /* endereço do app para o QR (o do PWA publicado; sem ele, o do endereço aberto agora) */
    base: function () {
      var b = ""; try { b = (global.App && App.URL_PWA) || ""; } catch (e) { b = ""; }
      if (!b) { try { b = String(global.location.href || "").replace(/#.*$/, "").replace(/\?.*$/, ""); } catch (e2) { b = ""; } }
      return /^https?:/i.test(b) ? b : "";
    },
    obraAtual: function () {
      var G = (U() && U()._G) || global.Gestao, id = G && G._bimSel, o = null;
      try { o = id && global.Store ? Store.obter(eid(), "obras", id) : null; } catch (e) { o = null; }
      return id ? { id: id, nome: (o && o.nome) || (U() && U().nomeObra ? U().nomeObra() : "obra") } : null;
    },
    todos: function () { try { return global.Store ? Store.listar(eid(), P().ENTIDADE) : []; } catch (e) { return []; } },
    nomeDaObra: function (obraId) { try { var o = global.Store ? Store.obter(eid(), "obras", obraId) : null; return (o && o.nome) || ""; } catch (e) { return ""; } },
    nomeArq: function (obra, suf) { return (U() && U().arqBase ? U().arqBase() : String(obra && obra.nome || "obra").replace(/[^\w.-]+/g, "-")) + "-" + suf; },
    baixar: function (nome, dados, mime) { return U() ? U().baixar(nome, dados, mime) : false; },

    /* grava (idempotente) o pedido de etapa. Devolve o resultado do motor (+ `salvou`). */
    marcar: function (obraId, marca, etapa, qtd, desfazer) {
      var r = P().registrar(this.todos(), { obraId: obraId, marca: marca, etapa: etapa, qtd: qtd, desfazer: !!desfazer, por: quem() });
      if (!r.ok) { toast(r.erro, "erro"); return r; }
      if (r.registro) {
        var ok = !!(global.Store && Store.salvar(eid(), P().ENTIDADE, r.registro));
        r.salvou = ok;
        if (!ok) { toast("Não consegui gravar o registro (armazenamento cheio?).", "erro"); return r; }
      }
      var en = P().nomeEtapa(etapa);
      toast(r.acao === "igual" ? marca + ": " + en + " já estava registrado." : marca + ": " + en + (r.acao === "desfez" ? " desfeito" : " registrado") + (r.foraDeOrdem ? " (fora de ordem — fica escrito)" : "") + ".", r.foraDeOrdem ? "aviso" : "ok");
      this.ultimo = { tipo: "marcar", resultado: r };
      return r;
    },

    /* ============================================================ ETIQUETAS (precisa do modelo — grupo BIM) */
    etiquetas: function () {
      var self = this, obra = this.obraAtual();
      if (!P()) { toast("O controle de produção não carregou (js/metalproducao.js).", "erro", 8000); return; }
      if (!obra) { toast("Abra uma obra antes: o QR leva o código da obra.", "aviso"); return; }
      var st = U() && U().estado ? U().estado() : null; if (!st) { toast("Abra o modelador primeiro.", "aviso"); return; }
      var F = global.BimMetalFab; if (!F) { toast("A fabricação da Metálica não carregou (js/metalfab.js).", "erro", 8000); return; }
      var L = F.listas(st), itens = P().itensDoModelo(L, obra.id);
      if (!itens.length) { toast("Não há peça de aço numerada no modelo para etiquetar.", "aviso"); return; }
      var sinc = P().sincronizar(itens, this.todos());
      if (sinc.gravar.length) {
        var n = global.Store && Store.salvarVarios ? Store.salvarVarios(eid(), P().ENTIDADE, sinc.gravar) : 0;
        if (!n) { toast("Não consegui cadastrar as marcas da obra (armazenamento cheio?).", "erro"); return; }
      }
      this.ultimo = { tipo: "etiquetas", obraId: obra.id, itens: itens, sincronizacao: sinc, base: this.base() };
      var sem = this.base() ? "" : '<p style="font-size:12px;color:#a86a10">Sem endereço do app neste aparelho: o QR leva só o texto "orcapro-metalprod:…" (o leitor do OrçaPRO entende, a câmera do celular não abre sozinha).</p>';
      var h = '<p style="font-size:12.5px;margin:0 0 8px">Obra <b>' + esc(obra.nome) + "</b>: <b>" + itens.length + "</b> etiqueta(s) — " + itens.filter(function (i) { return i.kind === "peca"; }).length + " de peça e " + itens.filter(function (i) { return i.kind === "conjunto"; }).length + " de conjunto soldado. Marcas cadastradas agora: " + sinc.novos + " nova(s), " + sinc.mudados + " atualizada(s), " + sinc.iguais + " já estavam iguais (o que já foi marcado na produção não muda).</p>" +
        '<p class="muted" style="font-size:12px;margin:0 0 6px">Cada QR abre a marca no OrçaPRO do celular (mesma conta, sincronização ligada) para marcar a etapa cumprida. Baixe a folha, abra e use <b>Imprimir / salvar em PDF</b>.</p>' + sem +
        '<div data-mp="res-etiquetas"></div>';
      UI.modal("Etiquetas de produção com QR", h, [
        { texto: "Baixar folha de etiquetas (HTML)", classe: "primary", onClick: function () { self.etiquetasHtml(); } },
        { texto: "Abrir o acompanhamento", onClick: function () { UI.fecharModal(); self.acompanhar(); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      status("Etiquetas de produção: " + itens.length + " marca(s) cadastrada(s) na obra.");
    },
    etiquetasHtml: function () {
      var u = this.ultimo && this.ultimo.tipo === "etiquetas" ? this.ultimo : null, obra = this.obraAtual(); if (!u || !obra) return;
      var html = P().etiquetasHtml(u.itens, { obraNome: obra.nome, base: u.base });
      var nome = this.nomeArq(obra, "etiquetas-producao.html"); this.baixar(nome, html, "text/html;charset=utf-8");
      this.ultimo.html = nome;
      toast("Folha de etiquetas: " + u.itens.length + " etiqueta(s) — " + nome + ". Abra e use Imprimir / salvar em PDF.", "ok", 9000);
    },

    /* ============================================================ ACOMPANHAMENTO */
    acompanhar: function (obraId) {
      var self = this, obra = obraId ? { id: obraId, nome: this.nomeDaObra(obraId) } : this.obraAtual();
      if (!P()) { toast("O controle de produção não carregou (js/metalproducao.js).", "erro", 8000); return; }
      if (!obra) { toast("Abra uma obra para ver a produção dela.", "aviso"); return; }
      this._obra = obra;
      var h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 8px;align-items:end">' +
        '<label style="font-size:12px">Buscar<br><input data-mp-f="texto" placeholder="marca ou perfil" value="' + esc(this._filtro.texto) + '"></label>' +
        '<label style="font-size:12px">Tipo<br><select data-mp-f="kind"><option value="">Todos</option><option value="peca">Peças</option><option value="conjunto">Conjuntos soldados</option></select></label>' +
        '<label style="font-size:12px">Etapa<br><select data-mp-f="etapa"><option value="">—</option>' + P().ETAPAS.map(function (e) { return '<option value="' + e[0] + '">' + esc(e[1]) + "</option>"; }).join("") + "</select></label>" +
        '<label style="font-size:12px">Situação<br><select data-mp-f="estado"><option value="">—</option><option value="feito">Concluída</option><option value="falta">Falta</option></select></label>' +
        '<button class="btn sm" data-mp-acao="filtrar">Filtrar</button><button class="btn sm" data-mp-acao="limpar">Limpar</button></div>' +
        '<div data-mp="res-acomp"></div>';
      UI.modal("Produção por QR — " + obra.nome, h, [
        { texto: "Baixar .xlsx", classe: "primary", onClick: function () { self.xlsx(); } },
        { texto: "Atualizar", onClick: function () { self._acomp(true); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      this._acomp(false);
    },
    _lerFiltro: function () {
      var f = this._filtro;
      ["texto", "kind", "etapa", "estado"].forEach(function (k) { var e = q('[data-mp-f="' + k + '"]'); if (e && e.value != null) f[k] = e.value; });
      return f;
    },
    _acomp: function (ler) {
      var f = ler ? this._lerFiltro() : this._filtro, obra = this._obra; if (!obra) return null;
      var Pg = P().progresso(this.todos(), obra.id), lin = P().filtrar(Pg.linhas, f);
      this.ultimo = { tipo: "acompanhamento", progresso: Pg, linhas: lin, filtro: JSON.parse(JSON.stringify(f)) };
      var E = P().ETAPAS, el = q('[data-mp="res-acomp"]'); if (!el) return Pg;
      function tot(rot, T) { return "<tr style=\"font-weight:600\"><td colspan=\"3\">" + rot + " — " + P().br(T.pesoTotal, 1) + " kg (" + T.marcas + " marca(s))</td>" + E.map(function (e) { return '<td class="num">' + P().br(T.etapas[e[0]].pct, 1) + " %</td>"; }).join("") + '<td class="num">' + P().br(T.pctGeral, 1) + " %</td><td></td></tr>"; }
      var corpo = lin.map(function (l) {
        return '<tr data-mp-marca="' + esc(l.marca) + '"><td><b>' + esc(l.marca) + "</b></td><td>" + esc(l.descricao) + '</td><td class="num">' + l.qtd + "</td>" +
          E.map(function (e) { var x = l.etapas[e[0]]; return '<td class="num" title="' + esc(x.por ? x.por + " — " + dataBr(x.em) : "") + '"' + (x.completa ? ' style="background:rgba(22,163,74,.15)"' : "") + ">" + (x.qtd ? P().br(x.pct, 0) + " %" : "—") + "</td>"; }).join("") +
          '<td class="num"><b>' + P().br(l.pctPeso, 0) + ' %</b></td><td>' + (l.proxima ? '<button class="btn sm" data-mp-acao="avancar" data-mp-m="' + esc(l.marca) + '" data-mp-e="' + l.proxima + '">Marcar ' + esc(P().nomeEtapa(l.proxima)) + "</button>" : "concluída") + "</td></tr>";
      }).join("");
      el.innerHTML = '<table class="tbl tbl-compacta" data-mp="tab-acomp" style="' + CSS_TAB + '"><thead><tr><th>Marca</th><th>Descrição</th><th class="num">Qtd</th>' + E.map(function (e) { return '<th class="num">' + esc(e[1]) + "</th>"; }).join("") + '<th class="num">Avanço</th><th>Próxima</th></tr></thead><tbody>' +
        corpo + (Pg.pecas.marcas ? tot("Peças", Pg.pecas) : "") + (Pg.conjuntos.marcas ? tot("Conjuntos soldados", Pg.conjuntos) : "") + "</tbody></table>" +
        (lin.length ? "" : '<p class="muted" style="font-size:12px">' + (Pg.linhas.length ? "Nenhuma marca no filtro." : "Nenhuma marca cadastrada nesta obra: gere as etiquetas pelo modelo (Metálica › Fabricação › Etiquetas de produção).") + "</p>") +
        '<p class="muted" style="font-size:11px;margin:6px 0 0">% = peso concluído ÷ peso total (peças e conjuntos têm totais separados: o conjunto é feito das peças). Avanço = média das 6 etapas. Passe o mouse numa etapa para ver quem marcou e quando.</p>';
      this._ligar(el);
      return Pg;
    },
    /* cliques da tabela (delegação) e dos filtros */
    _ligar: function (el) {
      var self = this;
      if (!el || !el.addEventListener || el._mpLigado) return; el._mpLigado = true;
      el.addEventListener("click", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest("[data-mp-acao]") : null; if (!b) return;
        if (b.getAttribute("data-mp-acao") === "avancar") { self.marcar(self._obra.id, b.getAttribute("data-mp-m"), b.getAttribute("data-mp-e")); self._acomp(false); }
      });
    },
    xlsx: function () {
      var obra = this._obra || this.obraAtual(); if (!obra) return;
      var Pg = P().progresso(this.todos(), obra.id), self = this, nome = this.nomeArq(obra, "producao-acompanhamento.xlsx");
      var go = function () {
        P().xlsx(Pg, global.ExcelJS, { obra: obra.nome }).xlsx.writeBuffer().then(function (buf) {
          self.baixar(nome, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          self.ultimo = { tipo: "acompanhamento", progresso: Pg, xlsx: nome };
          toast("Acompanhamento da produção: " + Pg.linhas.length + " marca(s) — " + nome + ".", "ok", 8000);
        }, function (e) { toast("Não gerei a planilha: " + (e && e.message ? e.message : e), "erro"); });
      };
      if (global.ExcelJS) go(); else if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(go); else toast("O gerador de Excel não carregou.", "erro");
    },

    /* ============================================================ A PEÇA (o que o QR abre) */
    abrirPeca: function (obraId, marca) {
      var self = this, todos = this.todos(), Pg = P().progresso(todos, obraId), l = null;
      Pg.linhas.forEach(function (x) { if (x.marca === marca) l = x; });
      if (!l) { toast("A marca " + marca + " não está neste aparelho. Confira se é a mesma conta e se a sincronização está ligada; no escritório, gere as etiquetas pelo modelo.", "aviso", 12000); return false; }
      this._obra = { id: obraId, nome: this.nomeDaObra(obraId) };
      var prox = l.proxima, E = P().ETAPAS;
      var h = '<p style="margin:0 0 4px"><b style="font-size:20px">' + esc(l.marca) + "</b> — " + esc(l.descricao) + '</p><p class="muted" style="font-size:12px;margin:0 0 8px">' + esc(this._obra.nome) + " · " + l.qtd + " un · " + P().br(l.pesoUnit, 1) + " kg/un · avanço " + P().br(l.pctPeso, 0) + " %</p>" +
        '<label style="font-size:12px">Quantas peças desta etapa? <input data-mp-q="qtd" value="' + l.qtd + '" inputmode="numeric" style="width:70px"></label>' +
        '<table class="tbl tbl-compacta" data-mp="tab-peca" style="' + CSS_TAB + '"><tbody>' + E.map(function (e) {
          var x = l.etapas[e[0]];
          return '<tr data-mp-etapa="' + e[0] + '"><td>' + (x.completa ? "✔" : (x.qtd ? "◐" : "○")) + " <b>" + esc(e[1]) + "</b>" + (x.qtd ? " — " + x.qtd + "/" + l.qtd + (x.por ? '<br><span class="muted" style="font-size:11px">' + esc(x.por) + " · " + esc(dataBr(x.em)) + "</span>" : "") : "") + "</td>" +
            '<td style="text-align:right"><button class="btn sm' + (e[0] === prox ? " primary" : "") + '" data-mp-acao="marcar" data-mp-e="' + e[0] + '">' + (x.completa ? "Marcar de novo" : "Marcar") + "</button>" +
            (x.qtd ? ' <button class="btn sm" data-mp-acao="desfazer" data-mp-e="' + e[0] + '">Desfazer</button>' : "") + "</td></tr>";
        }).join("") + "</tbody></table>";
      UI.modal("Produção — " + l.marca, h, [{ texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      this.ultimo = { tipo: "peca", obraId: obraId, marca: marca, linha: l };
      var el = q('[data-mp="tab-peca"]');
      if (el && el.addEventListener && !el._mpLigado) {
        el._mpLigado = true;
        el.addEventListener("click", function (ev) {
          var b = ev.target && ev.target.closest ? ev.target.closest("[data-mp-acao]") : null; if (!b) return;
          var qe = q('[data-mp-q="qtd"]'), qt = qe ? qe.value : null;
          self.marcar(obraId, marca, b.getAttribute("data-mp-e"), qt, b.getAttribute("data-mp-acao") === "desfazer");
          self.abrirPeca(obraId, marca);
        });
      }
      return true;
    },
    /* o que o ouvinte do endereço chama: aceita o hash inteiro ou o texto lido do QR */
    abrirPorQr: function (texto) {
      var r = P() ? P().lerQr(texto) : null; if (!r) return false;
      return this.abrirPeca(r.obraId, r.marca);
    },
    /* o endereço do app foi aberto com #metalprod=: espera o banco e o login e abre a marca. */
    esperarQr: function () {
      var self = this, hash = ""; try { hash = String(global.location && global.location.hash || ""); } catch (e) { hash = ""; }
      if (!/#metalprod=/.test(hash)) return false;
      var n = 0;
      (function tenta() {
        n++;
        var pronto = false;
        try { pronto = !!(global.Auth && Auth.usuario && Auth.usuario() && global.UI && UI.modal && global.Store && Store.listar && !(Store.naoCarregada && Store.naoCarregada(eid(), P().ENTIDADE))); } catch (e) { pronto = false; }
        if (pronto) { self.abrirPorQr(hash); return; }
        if (n < 60) setTimeout(tenta, 500);
        else toast("Entre no OrçaPRO com a conta da empresa para abrir a marca do QR.", "aviso", 10000);
      })();
      return true;
    }
  };

  global.MetalProducaoUI = MetalProducaoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalProducaoUI;
  /* QR lido pelo celular: o endereço traz #metalprod=<obra>~<marca> (ver o cabeçalho). Só no navegador, uma vez. */
  try { if (typeof window !== "undefined" && window.location && /#metalprod=/.test(window.location.hash || "")) setTimeout(function () { MetalProducaoUI.esperarQr(); }, 0); } catch (eQ) {}
  try { if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("hashchange", function () { try { if (/#metalprod=/.test(window.location.hash || "")) MetalProducaoUI.esperarQr(); } catch (e) {} }); } catch (eH) {}
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
