/* =====================================================================
 * metalorcfabui.js — a TELA do "Orçamento de fábrica por kg e hora"
 * (botão met-orcfab da aba Metálica, ao lado de "Orçamento da estrutura").
 * Fina: quem calcula é o motor puro js/metalorcfab.js. Aqui: a tabela de
 * parâmetros da metalúrgica (preço do aço por família, custo e produtividade
 * de cada posto, consumíveis, perda, BDI), SALVA POR EMPRESA na entidade
 * `metal_fab_param` (id "cfg") — preço é dinheiro, por isso entidade e não
 * prefs —, o resultado na tela e os downloads (.xlsx e HTML).
 * Defaults VAZIOS: campo em branco = "pendente", nunca valor inventado.
 * `ultimo` guarda o último resultado (o teste confere por ele).
 * ===================================================================== */
(function (global) {
  "use strict";
  function O() { return global.BimMetalOrcFab; }
  function U() { return global.BimMetalUI; }
  function RF() { return global.BimMetalRelacaoFab; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(/\./g, function (m, i, s) { return /,/.test(s) ? "" : m; }).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function toast(t, tipo, ms) { try { if (global.UI) UI.toast(t, tipo || "ok", ms || 7000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function q(sel) { return document.querySelector(sel); }
  function val(id) { var e = q('[data-mfo-campo="' + id + '"]'); return e ? e.value : null; }
  function eid() { try { return global.Auth && Auth.empresaId ? Auth.empresaId() : "default"; } catch (e) { return "default"; } }
  var ID = "cfg";
  var CSS_CAMPOS = "display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px 12px;margin:0 0 10px";
  function campo(id, rotulo, valor) {
    return '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px"><span>' + esc(rotulo) + '</span><input data-mfo-campo="' + id + '" value="' + esc(valor == null ? "" : valor) + '" inputmode="decimal" placeholder="não informado"></label>';
  }
  function titulo(t) { return '<h4 style="margin:10px 0 4px;font-size:13px">' + esc(t) + "</h4>"; }
  function chaveObra() { try { var G = U() && U()._G || global.Gestao; return (G && G._bimSel) || ""; } catch (e) { return ""; } }

  var MetalOrcFabUI = {
    ultimo: null,
    /* a tabela da empresa (normalizada); vazia se nunca foi preenchida */
    doc: function () {
      var d = null; try { d = global.Store ? Store.obter(eid(), O().ENTIDADE, ID) : null; } catch (e) { d = null; }
      return d || null;
    },
    carregar: function () { return O().normalizar(this.doc() || {}); },
    area: function () { var d = this.doc(), k = chaveObra(); return d && d.areaPorObra && k && d.areaPorObra[k] != null ? d.areaPorObra[k] : ""; },
    /* grava a tabela (idempotente: mesmo id) — e a área desta obra */
    gravar: function (P, area) {
      if (!global.Store) return false;
      var d = this.doc() || {}, o = JSON.parse(JSON.stringify(P)), k = chaveObra();
      o.id = ID; o.areaPorObra = d.areaPorObra || {};
      if (k) { if (area != null && area !== "") o.areaPorObra[k] = area; else delete o.areaPorObra[k]; }
      if (d.criadoEm) o.criadoEm = d.criadoEm;
      return !!Store.salvar(eid(), O().ENTIDADE, o);
    },
    estado: function () { return U() ? U().estado() : null; },
    numeracao: function () {
      var st = this.estado(); if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; }
      var F = global.BimMetalFab; if (!F) { toast("A fabricação da Metálica não carregou (js/metalfab.js).", "erro", 8000); return null; }
      return F.numerar(st);
    },
    nomeArq: function (suf) { return (U() ? U().arqBase() : "obra") + "-" + suf; },

    abrir: function () {
      var self = this;
      if (!O()) { toast("O orçamento de fábrica não carregou (js/metalorcfab.js).", "erro", 8000); return; }
      var n = this.numeracao(); if (!n) return;
      if (!n.pecas.length) { toast("Não há peça de aço no modelo para orçar.", "aviso"); return; }
      var P = this.carregar(), M = O(), cons = RF() && RF().INDICE_ROTULOS ? RF().INDICE_ROTULOS : {};
      var h = '<p class="muted" style="font-size:12px;margin:0 0 6px">Orçamento da <b>fábrica</b>: aço por kg, mão de obra por hora de cada posto, consumíveis e BDI. A tabela abaixo é da <b>sua empresa</b> (fica salva) e nasce <b>vazia</b>: campo em branco = <b>pendente</b>, o sistema não inventa preço nem produtividade. Modelagem e fabricação — não é cálculo estrutural.</p>';
      h += titulo("Aço — preço por kg, por família (R$/kg)") + '<div style="' + CSS_CAMPOS + '">' + M.FAMILIAS.map(function (f) { return campo("aco_" + f[0], f[1], P.aco[f[0]]); }).join("") + "</div>";
      h += titulo("Custo da hora de cada posto (R$/h)") + '<div style="' + CSS_CAMPOS + '">' + M.POSTOS.map(function (po) { return campo("hora_" + po.id, po.nome, P.hora[po.id]); }).join("") + "</div>";
      h += titulo("Produtividade por posto (horas por unidade — preencha a base que a fábrica usa)") + '<div style="' + CSS_CAMPOS + '">' +
        M.POSTOS.map(function (po) { return po.drivers.map(function (d) { return campo("prod_" + po.id + "_" + d[0], po.nome + " — " + d[1], P.prod[po.id][d[0]]); }).join(""); }).join("") + "</div>";
      h += titulo("Consumíveis — preço unitário (a quantidade vem do índice por tonelada da Relação fábrica)") + '<div style="' + CSS_CAMPOS + '">' + Object.keys(cons).map(function (k) { return campo("cons_" + k, cons[k][0] + " — preço unitário (R$)", P.consum[k]); }).join("") + "</div>";
      h += titulo("Perda, BDI e área") + '<div style="' + CSS_CAMPOS + '">' + campo("perda", "Perda de material (%)", P.perdaPct) + campo("bdi", "BDI / margem sobre o custo (%)", P.bdiPct) + campo("area", "Área construída desta obra (m²) — para o R$/m²", this.area()) + "</div>";
      h += '<div data-mfo="res-orcfab"></div>';
      UI.modal("Orçamento de fábrica — por kg e hora", h, [
        { texto: "Calcular e salvar a tabela", classe: "primary", onClick: function () { self._calc(true); } },
        { texto: "Baixar .xlsx", onClick: function () { self._calc(true); self.xlsx(); } },
        { texto: "Baixar HTML", onClick: function () { self._calc(true); self.htmlDoc(); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      this._calc(false);
    },
    /* lê os campos, grava a tabela (se `ler`) e calcula */
    _calc: function (ler) {
      var M = O(), P = this.carregar(), area = this.area();
      if (ler) {
        var cons = RF() && RF().INDICE_ROTULOS ? Object.keys(RF().INDICE_ROTULOS) : [];
        P = M.vazio();
        M.FAMILIAS.forEach(function (f) { P.aco[f[0]] = num(val("aco_" + f[0]), null); });
        M.POSTOS.forEach(function (po) { P.hora[po.id] = num(val("hora_" + po.id), null); po.drivers.forEach(function (d) { P.prod[po.id][d[0]] = num(val("prod_" + po.id + "_" + d[0]), null); }); });
        cons.forEach(function (k) { P.consum[k] = num(val("cons_" + k), null); });
        P.perdaPct = num(val("perda"), null); P.bdiPct = num(val("bdi"), null);
        P = M.normalizar(P); area = val("area");
        if (!this.gravar(P, area)) toast("Não consegui salvar a tabela de parâmetros (armazenamento cheio?).", "erro");
      }
      var n = this.numeracao(); if (!n) return null;
      var L = global.BimMetalFab.listas(this.estado(), n);
      var cfgRel = null; try { cfgRel = global.MetalFabUI && MetalFabUI.cfg ? MetalFabUI.cfg().relacao : null; } catch (e) { cfgRel = null; }
      var R = M.calcular(L, n, P, { areaM2: num(area, 0), relacao: cfgRel || {} });
      this.ultimo = { tipo: "orcfab", orcamento: R, resumo: R.resumo };
      var el = q('[data-mfo="res-orcfab"]'); if (el) el.innerHTML = M.html(R, { obra: U() ? U().nomeObra() : "" });
      status("Orçamento de fábrica: " + M.br(R.resumo.kg, 0) + " kg, custo R$ " + M.br(R.resumo.custo, 2) + (R.resumo.parcial ? " (parcial — " + R.pendencias.length + " pendência(s))" : "") + ".");
      return R;
    },
    _atual: function () { return this.ultimo && this.ultimo.tipo === "orcfab" ? this.ultimo.orcamento : this._calc(false); },
    excel: function (gerar, nome, fim) {
      var self = this;
      var go = function () {
        gerar(global.ExcelJS).xlsx.writeBuffer().then(function (buf) { if (U()) U().baixar(nome, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); if (fim) fim(buf); },
          function (e) { toast("Não gerei a planilha: " + (e && e.message ? e.message : e), "erro"); });
      };
      if (global.ExcelJS) go(); else if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(go); else toast("O gerador de Excel não carregou.", "erro");
    },
    xlsx: function () {
      var R = this._atual(), self = this, nome = this.nomeArq("orcamento-de-fabrica.xlsx"); if (!R) return;
      this.excel(function (X) { return O().xlsx(R, X, { obra: U() ? U().nomeObra() : "" }); }, nome, function () {
        self.ultimo = { tipo: "orcfab", orcamento: R, resumo: R.resumo, xlsx: nome };
        toast("Orçamento de fábrica" + (R.resumo.parcial ? " (parcial — " + R.pendencias.length + " pendência(s))" : "") + " — " + nome + ".", "ok", 9000);
      });
    },
    htmlDoc: function () {
      var R = this._atual(); if (!R) return;
      var nome = this.nomeArq("orcamento-de-fabrica.html"); if (U()) U().baixar(nome, O().htmlDocumento(R, { obra: U().nomeObra() }), "text/html;charset=utf-8");
      this.ultimo = { tipo: "orcfab", orcamento: R, resumo: R.resumo, html: nome };
      toast("Orçamento de fábrica em HTML — " + nome + ".", "ok", 7000);
    }
  };

  global.MetalOrcFabUI = MetalOrcFabUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalOrcFabUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
