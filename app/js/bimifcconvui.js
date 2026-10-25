/* =====================================================================
 * bimifcconvui.js — "CONVERTER EM ELEMENTOS EDITÁVEIS" na tela (fiação fina; a conta é do js/bimifcconv.js).
 * 23/10/2026.
 *
 * O IFC que sai do SketchUp traz tudo como "elemento genérico" (IfcBuildingElementProxy). Este comando olha a
 * GEOMETRIA de cada peça, mostra "o que vira o quê" com a confiança de cada tipo e, se o usuário confirmar,
 * grava parede, laje, pilar, viga, porta, janela e telhado do próprio modelador — UM lote, um Ctrl+Z desfaz
 * tudo. O IFC original NÃO é alterado: as peças trocadas ficam ocultas (apagarIfc) e voltam com o desfazer.
 *
 * ⚠ NÃO TRAVA A PÁGINA. A análise anda em fatias de ~30 ms (setTimeout), com barra de progresso e botão
 *   Cancelar; só a gravação final é uma operação só (é ela que faz do Ctrl+Z um passo único), e antes dela a
 *   tela pinta o aviso "Gravando…".
 * ⚠ O que não for reconhecido com segurança FICA genérico, com o motivo escrito. Confiança "baixa" nunca é aplicada.
 * ===================================================================== */
(function (global) {
  "use strict";
  var FATIA_MS = 30;
  function B() { return global.BIM || null; }
  function X() { return global.BimIfcConv || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  function br(v, c) { return String(Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).replace(".", ","); }
  function agora() { return (global.performance && global.performance.now) ? global.performance.now() : Date.now(); }

  var NOMES = { parede: ["parede", "paredes"], porta: ["porta", "portas"], janela: ["janela", "janelas"], laje: ["piso ou laje", "pisos e lajes"], pilar: ["pilar", "pilares"], viga: ["viga", "vigas"], telhado: ["telhado", "telhados"] };
  function nomeQ(c, n) { var x = NOMES[c] || [c, c]; return n + " " + (n === 1 ? x[0] : x[1]); }
  var ROTULOS = { parede: "Paredes", porta: "Portas", janela: "Janelas", laje: "Pisos e lajes", pilar: "Pilares", viga: "Vigas", telhado: "Telhados" };
  var AJUDA = {
    parede: "Prisma vertical fino e comprido: eixo, espessura, altura e base saem da geometria. Os vãos da face viram porta/janela.",
    porta: "Vão que desce até a base da parede (largura, altura) — hospedada na parede, abrindo o vão.",
    janela: "Vão com peitoril na parede (largura, altura, peitoril) — hospedada, abrindo o vão.",
    laje: "Placa horizontal: contorno, espessura e cota do topo. Piso fino de 3 cm ou menos só fora dos eixos não vira.",
    pilar: "Prisma vertical esbelto: seção (retângulo, círculo, tubo ou perfil I do catálogo), base e altura.",
    viga: "Barra horizontal: seção, eixo e topo. Perfil de aço só quando as medidas batem com o catálogo.",
    telhado: "Placas inclinadas que formam um retângulo coberto: inclinação, beiral baixo e cota."
  };

  var BimIfcConvUI = {
    _est: null, _res: null, _lista: [], _i: 0, _cancelar: false, _ocupado: false, _seq: 0, _ultimo: null, _opts: { unir: true, aceitar: {}, materiais: {} }, _ms: {},
    novoId: function (p) { BimIfcConvUI._seq++; return (p || "cv") + "ifc" + Date.now().toString(36) + BimIfcConvUI._seq; },
    estado: function () { return { ocupado: this._ocupado, resultado: this._res, ultimo: this._ultimo, ms: this._ms }; },

    /* ---------------------------------------------------------- 1) analisar (em fatias) */
    /* cb(res) quando termina; cb(null, motivo) se cancelou/falhou. Devolve false se não dá para começar. */
    analisar: function (o, cb) {
      o = o || {};
      var b = B(), motor = X(), self = this;
      if (!motor || !motor.iniciar) { status("O motor de conversão (js/bimifcconv.js) não carregou."); if (cb) cb(null, "motor"); return false; }
      if (!b || !b.ifcConvLista) { status("Abra o BIM para converter."); if (cb) cb(null, "bim"); return false; }
      if (this._ocupado) { status("Já estou analisando — aguarde ou cancele."); return false; }
      this._lista = b.ifcConvLista(); this._i = 0; this._cancelar = false; this._ocupado = true; this._res = null; this._ms = { t0: agora() };
      var arq = this._lista.length ? this._lista[0].arq : "";
      this._est = motor.iniciar({ arquivo: arq });
      var n = this._lista.length;
      if (!n) { this._ocupado = false; if (cb) cb(null, "vazio"); return true; }
      function progresso() { if (typeof o.progresso === "function") { try { o.progresso(self._i, n); } catch (e) {} } }
      function passo() {
        if (self._cancelar) { self._ocupado = false; self._est = null; if (cb) cb(null, "cancelado"); return; }
        var t0 = agora();
        while (self._i < n && agora() - t0 < FATIA_MS) {
          var it = self._lista[self._i++], el = null;
          try { el = b.ifcConvPeca(it.uid); } catch (e) { el = null; }
          if (el) { try { motor.acrescentar(self._est, el); } catch (e2) { /* uma peça ruim não derruba a análise */ } }
        }
        progresso();
        if (self._i < n) { global.setTimeout(passo, 0); return; }
        var t1 = agora();
        try { self._res = motor.fechar(self._est); } catch (e3) { self._ocupado = false; status("Falhou ao fechar a análise: " + e3.message); if (cb) cb(null, "erro"); return; }
        self._ms.analise = Math.round(t1 - self._ms.t0); self._ms.fechar = Math.round(agora() - t1); self._ms.n = n;
        self._ocupado = false;
        if (cb) cb(self._res);
      }
      global.setTimeout(passo, 0);
      return true;
    },

    /* ---------------------------------------------------------- 2) o que será feito (sem gravar) */
    plano: function () {
      if (!this._res) return null;
      var o = this._opts, g = X().gerarOps(this._res, { aceitar: o.aceitar, unir: o.unir, materiais: o.materiais, novoId: this.novoId });
      return g;
    },

    /* ---------------------------------------------------------- 3) gravar: UM lote */
    aplicar: function () {
      var b = B(), g = this.plano();
      if (!g || !g.lote) { status("Nada a converter com as categorias marcadas."); return { ok: false, erro: "vazio" }; }
      var t0 = agora(), ok = false;
      try { ok = !!(b && b.editarLote && b.editarLote(g.lote)); } catch (e) { ok = false; }
      var ms = Math.round(agora() - t0);
      if (!ok) { var er = "O editor recusou a conversão (nada mudou)."; status(er); return { ok: false, erro: er }; }
      this._ms.gravar = ms;
      var c = g.criadas, p = [];
      Object.keys(c).forEach(function (k) { p.push(nomeQ(k, c[k])); });
      var t = "Convertido: " + p.join(", ") + ". " + g.ocultados + " peça(s) genérica(s) ocultada(s) (Ctrl+Z desfaz tudo e o IFC original volta).";
      status(t); toast(t, "info");
      this._ultimo = { ok: true, criadas: c, ocultados: g.ocultados, recusadas: g.recusadas, ops: g.ops.length, ms: ms, lote: g.lote.id };
      return this._ultimo;
    },

    /* ---------------------------------------------------------- a tela */
    _q: function (k) { return global.document.querySelector('[data-cv="' + k + '"]'); },
    abrir: function () {
      var U = global.UI, d = global.document, self = this, b = B();
      if (!U || !U.modal || !b) return false;
      if (b.editarEstado && !b.editarEstado()) { try { b.editar(true); } catch (e) {} }
      var lista = b.ifcConvLista ? b.ifcConvLista() : [];
      if (!lista.length) {
        U.modal("Converter em elementos editáveis", '<p style="font-size:13px;margin:0 0 6px">Não há peça genérica (<b>elemento genérico</b>, IfcBuildingElementProxy) nos modelos abertos.</p>' +
          '<p class="muted" style="font-size:12.5px;margin:0">Este comando troca as peças que o SketchUp exporta sem classe por parede, laje, pilar, viga, porta, janela e telhado do modelador. Abra um IFC desse tipo e tente de novo.</p>',
          [{ texto: "Entendi", classe: "primary", onClick: function () { U.fecharModal(); } }]);
        status("Nenhuma peça genérica nos modelos abertos."); return true;
      }
      var corpo = '<div data-cv="prog" style="min-width:340px;font-size:13px"><p style="margin:0 0 8px" data-cv="txt">Lendo a geometria de ' + lista.length + ' peças genéricas…</p>' +
        '<div style="height:10px;border-radius:6px;background:var(--borda,#d0d5dd);overflow:hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div data-cv="barra" style="height:100%;width:0%;background:var(--primaria,#2d6a9c);transition:width .1s"></div></div>' +
        '<p class="muted" style="margin:8px 0 0;font-size:12px">A página continua livre enquanto isso. Nada é gravado antes de você confirmar.</p></div>';
      U.modal("Analisando o modelo", corpo, [{ texto: "Cancelar", classe: "ghost", onClick: function () { self._cancelar = true; U.fecharModal(); status("Conversão cancelada: nada mudou."); } }]);
      this.analisar({
        progresso: function (i, n) {
          var bar = self._q("barra"), tx = self._q("txt"); if (bar) bar.style.width = Math.round(100 * i / n) + "%";
          if (tx) tx.textContent = "Lendo a geometria: " + i + " de " + n + " peças…";
        }
      }, function (res, motivo) {
        if (!res) { if (motivo !== "cancelado") { try { U.fecharModal(); } catch (e) {} } return; }
        self._mostrarPrevia();
      });
      return true;
    },

    _linhaCat: function (c, r) {
      var s = this._res.porClasse[c], itens = this._res.itens.filter(function (it) { return it.classe === c; }), ex = itens.filter(function (it) { return it.aplicavel; })[0] || itens[0];
      var conf = [];
      if (s.alta) conf.push("alta " + s.alta); if (s.media) conf.push("média " + s.media); if (s.baixa) conf.push("baixa " + s.baixa + " (não aplica)");
      var det = itens.slice(0, 40).map(function (it) {
        return "<li><b>" + esc(it.conf) + "</b>" + (it.aplicavel ? "" : " — <i>não aplica" + (it.bloqueio ? ": " + esc(it.bloqueio) : "") + "</i>") + " — " + esc(it.motivo) + (it.dados && it.dados.perfilRotulo ? " — " + esc(it.dados.perfilRotulo) + (it.dados.material ? ", " + esc(it.dados.material) + " (" + esc(it.dados.materialFonte) + ")" : "") : "") + "</li>";
      }).join("") + (itens.length > 40 ? "<li>… e mais " + (itens.length - 40) + "</li>" : "");
      return '<tr data-cv="linha-' + c + '"><td><input type="checkbox" data-cv="cat-' + c + '" ' + (s.aplicaveis ? "checked" : "disabled") + ' aria-label="Converter ' + ROTULOS[c].toLowerCase() + '"></td>' +
        '<td><b>' + ROTULOS[c] + '</b><div class="muted" style="font-size:11.5px">' + esc(AJUDA[c]) + '</div></td>' +
        '<td style="white-space:nowrap;padding:0 12px">' + s.aplicaveis + ' de ' + s.n + '</td><td style="font-size:12px;padding:0 12px">' + (conf.join(" · ") || "—") + '</td>' +
        '<td style="font-size:12px">' + (ex ? esc(ex.motivo) : "—") + (itens.length ? '<details style="margin-top:4px"><summary style="cursor:pointer">ver os itens</summary><ul style="margin:4px 0 0 16px;padding:0;max-height:140px;overflow:auto">' + det + '</ul></details>' : "") + '</td>' +
        '<td>' + (itens.length ? '<button class="btn sm ghost" data-cv="ver-' + c + '">Mostrar no 3D</button>' : "") + '</td></tr>';
    },
    _mostrarPrevia: function () {
      var U = global.UI, self = this, res = this._res, r = res.resumoElementos, o = this._opts;
      var linhas = res.ORDEM.filter(function (c) { return res.porClasse[c].n > 0; }).map(function (c) { return self._linhaCat(c); }).join("");
      var chavesMot = Object.keys(res.motivosGenericos).sort(function (a, b) { return res.motivosGenericos[b] - res.motivosGenericos[a]; }).slice(0, 8);
      self._motKeys = chavesMot;
      var motivos = chavesMot.map(function (k, i) { return "<li style=\"margin:3px 0\">" + res.motivosGenericos[k] + " × " + esc(k.replace(/#/g, "…")) + " <button class=\"btn sm ghost\" data-cv=\"vermot-" + i + "\">Mostrar no 3D</button></li>"; }).join("");
      var temRet = res.itens.some(function (it) { return (it.classe === "pilar" || it.classe === "viga") && it.dados.perfil && (it.dados.perfil.forma === "ret" || it.dados.perfil.forma === "circ"); });
      function sel(cls) {
        var cur = res.itens.filter(function (it) { return it.classe === cls && it.dados.perfil && (it.dados.perfil.forma === "ret" || it.dados.perfil.forma === "circ"); })[0];
        if (!cur) return "";
        return '<label style="display:flex;gap:8px;align-items:center;margin:4px 0">Material dos ' + (cls === "pilar" ? "pilares" : "vigas") + ' de seção retangular/circular <select data-cv="mat-' + cls + '">' +
          '<option value="">Automático (' + esc(cur.dados.material) + ' — ' + esc(cur.dados.materialFonte) + ')</option><option value="concreto">Concreto armado</option><option value="madeira">Madeira serrada</option><option value="aco">Aço</option></select></label>';
      }
      var corpo = '<div data-modal-largo="1" style="font-size:13px">' +
        '<p style="margin:0 0 8px"><b>' + r.convertem + ' de ' + r.total + '</b> peças genéricas podem ser trocadas por elemento editável' + (r.parciais ? " (" + r.parciais + " têm só parte reconhecida e ficam como estão)" : "") + '. As outras <b>' + (r.total - r.convertem) + '</b> ficam genéricas — nunca chuto.</p>' +
        '<table class="tabela" style="width:100%;border-collapse:collapse"><thead><tr><th></th><th style="text-align:left;padding:0 8px">O que vira</th><th style="padding:0 12px">Peças</th><th style="text-align:left;padding:0 12px">Confiança</th><th style="text-align:left;padding:0 8px">Exemplo e motivo</th><th></th></tr></thead><tbody>' +
        (linhas || '<tr><td colspan="6" class="muted">Nada reconhecido com segurança neste modelo.</td></tr>') + '</tbody></table>' +
        '<div style="margin:10px 0 4px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-cv="unir" ' + (o.unir ? "checked" : "") + '> Unir as paredes nos cantos (como no editor; desmarque para manter cada parede exatamente como está no IFC)</label>' +
        (temRet ? sel("pilar") + sel("viga") : "") + '</div>' +
        '<div data-cv="resumo" class="muted" style="margin:6px 0;font-size:12.5px" aria-live="polite"></div>' +
        (motivos ? '<details><summary style="cursor:pointer">Por que o resto fica genérico</summary><ul style="margin:4px 0 0 16px;padding:0;font-size:12px">' + motivos + '</ul></details>' : "") +
        '<p class="muted" style="margin:8px 0 0;font-size:12px">O arquivo IFC original <b>não é alterado</b>: as peças trocadas ficam ocultas no projeto, e <b>Ctrl+Z desfaz a conversão inteira</b> (o IFC volta). Análise: ' + res.nPecas + ' sólidos em ' + br(self._ms.analise / 1000, 1) + ' s.</p></div>';
      U.modal("Converter em elementos editáveis", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { U.fecharModal(); status("Conversão: nada mudou."); } },
        { texto: "Converter", classe: "primary", onClick: function () { self._confirmar(); } }
      ]);
      var d = global.document, raiz = d.querySelector(".modal [data-modal-largo]");
      function ler() {
        var ac = {}; res.ORDEM.forEach(function (c) { var cb = self._q("cat-" + c); if (cb) ac[c] = !!cb.checked; });
        o.aceitar = ac; var un = self._q("unir"); o.unir = un ? !!un.checked : true;
        var mt = {}; ["pilar", "viga"].forEach(function (c) { var s = self._q("mat-" + c); if (s && s.value) mt[c] = s.value; }); o.materiais = mt;
        self._resumo();
      }
      if (raiz) { raiz.addEventListener("change", ler); raiz.addEventListener("click", function (e) {
        var tm = e.target && e.target.closest ? e.target.closest("[data-cv^='vermot-']") : null;
        if (tm) { self._mostrar3D(null, res.motivosUids[self._motKeys[+String(tm.getAttribute("data-cv")).slice(7)]] || [], "o que fica genérico"); return; }
        var t = e.target && e.target.closest ? e.target.closest("[data-cv^='ver-']") : null; if (!t) return;
        self._mostrar3D(String(t.getAttribute("data-cv")).slice(4));
      }); }
      ler();
    },
    _resumo: function () {
      var g = this.plano(), el = this._q("resumo"), btn = global.document.querySelector("#modal-footer .primary");
      if (!g) return;
      var p = []; Object.keys(g.criadas).forEach(function (k) { p.push(nomeQ(k, g.criadas[k])); });
      if (el) el.innerHTML = g.lote ? "Vai criar <b>" + esc(p.join(", ")) + "</b> e ocultar <b>" + g.ocultados + "</b> peça(s) genérica(s)." + (g.recusadas.length ? " O editor recusou " + g.recusadas.length + ": " + esc(g.recusadas[0].motivo) + (g.recusadas.length > 1 ? " …" : "") : "") : "Nada marcado para converter.";
      if (btn) { btn.disabled = !g.lote; btn.textContent = g.lote ? "Converter " + g.ocultados + " peça(s)" : "Converter"; }
    },
    /* "Mostrar no 3D": seleciona e enquadra as peças ORIGINAIS da categoria; o véu do diálogo sai da frente até "Voltar" */
    _mostrar3D: function (cls, uidsDados, rotulo) {
      var b = B(), res = this._res, d = global.document, bg = d.getElementById("modal-bg"), uids = [], vistos = {};
      if (uidsDados) uids = uidsDados.slice();
      else res.itens.forEach(function (it) { if (it.classe === cls) it.uids.forEach(function (u) { if (!vistos[u]) { vistos[u] = 1; uids.push(u); } }); });
      if (!uids.length || !b) return;
      try { if (b.selecionar) b.selecionar(uids, "trocar"); if (b.enquadrarUids) b.enquadrarUids(uids); } catch (e) {}
      if (!bg) return;
      bg.style.display = "none";
      var barra = d.createElement("div");
      barra.setAttribute("data-cv", "voltar-bar");
      barra.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:100000;background:#0f2a3f;color:#fff;border-radius:10px;padding:8px 12px;box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:13px;display:flex;gap:12px;align-items:center";
      barra.innerHTML = "<span>" + uids.length + " peça(s) de <b>" + esc(rotulo || ROTULOS[cls].toLowerCase()) + "</b> destacada(s) no 3D</span><button class='btn sm primary' data-cv='voltar'>Voltar à conversão</button>";
      d.body.appendChild(barra);
      barra.querySelector("button").onclick = function () { barra.remove(); bg.style.display = ""; };
    },
    _confirmar: function () {
      var U = global.UI, self = this, tx = global.document.querySelector("#modal-footer .primary");
      if (tx) { tx.disabled = true; tx.textContent = "Gravando…"; }
      status("Gravando a conversão…");
      /* deixa a tela pintar o "Gravando…" antes da gravação (que é uma operação só) */
      global.setTimeout(function () {
        var r = self.aplicar();
        if (!r.ok) { if (tx) { tx.disabled = false; tx.textContent = "Converter"; } toast(r.erro || "Não foi possível converter.", "erro"); return; }
        self._resultado(r);
      }, 30);
    },
    _resultado: function (r) {
      var U = global.UI, self = this, b = B(), p = [];
      Object.keys(r.criadas).forEach(function (k) { p.push("<li>" + esc(nomeQ(k, r.criadas[k])) + "</li>"); });
      var rec = r.recusadas.length ? '<p class="muted" style="font-size:12px">O editor recusou ' + r.recusadas.length + ' item(ns) e os originais deles ficaram como estavam: ' + esc(r.recusadas[0].motivo) + '</p>' : "";
      U.modal("Conversão concluída", '<div style="font-size:13px"><p style="margin:0 0 6px">Criei:</p><ul style="margin:0 0 8px 18px;padding:0">' + p.join("") + '</ul><p style="margin:0 0 6px">E ocultei <b>' + r.ocultados + '</b> peça(s) genérica(s). Gravado em ' + r.ms + ' ms, num único passo.</p>' + rec +
        '<p class="muted" style="margin:6px 0 0;font-size:12px">Para comparar: <b>Ver o original</b> desfaz a conversão e o IFC volta inteiro; <b>Voltar à conversão</b> refaz. Ctrl+Z / Ctrl+Y fazem o mesmo.</p></div>',
        [{ texto: "Ver o original", classe: "ghost", onClick: function () {
            var bt = global.document.querySelector("#modal-footer .ghost"), so = bt && /original/.test(bt.textContent);
            if (so) { if (b.desfazer()) { bt.textContent = "Voltar à conversão"; status("O IFC original está visível. 'Voltar à conversão' refaz."); } }
            else { if (b.refazer()) { bt.textContent = "Ver o original"; status("Conversão refeita."); } }
          } },
         { texto: "Fechar", classe: "primary", onClick: function () { U.fecharModal(); } }]);
    },
    registrar: function (reg) {
      var self = this;
      reg["converter-ifc"] = function () { self.abrir(); return true; };
      return true;
    }
  };
  global.BimIfcConvUI = BimIfcConvUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimIfcConvUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
