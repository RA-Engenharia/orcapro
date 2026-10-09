/* =====================================================================
 * iamodelar.js — MODELAR POR COMANDO (B8, 08/10/2026) — a tela
 *
 * O usuário escreve o que quer ("casa térrea 8×10 com 2 quartos, sala,
 * cozinha e banheiro, pé-direito 2,80, laje e telhado 2 águas 30%") e/ou
 * anexa o croqui. O servidor de IA (POST /ia/modelar, server/ia-modelar.js)
 * devolve as OPERAÇÕES do BIM já validadas pelo js/bimmodelar.js; aqui elas
 * são validadas DE NOVO (o mesmo arquivo — defesa contra servidor velho ou
 * trocado) e aparecem como PRÉVIA: um grupo fantasma no 3D + uma barra com o
 * que vai entrar, o que foi recusado e por quê.
 *   "Aplicar ao modelo" → um LOTE na lista de edição (BIM.editarLote): desfaz
 *                          como qualquer edição, de uma vez (Ctrl+Z);
 *   "Descartar"         → some a prévia; nada foi gravado.
 *
 * ⚠ Só existe na prévia do modelador (BimPrevia.modelador(), ?previa=modelador).
 * ⚠ A IA só CRIA e não escolhe código de orçamento — quem orça é o usuário
 *   (Propriedades › Orçamento). Recusa vem com o motivo, nunca some calada.
 * ES5. O POST com prazo e o recado do servidor são os do js/iafamilia.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, k, ms) { try { if (global.UI && UI.toast) UI.toast(t, k || "info", ms); } catch (e) {} }
  function ic(n) { try { return global.Icones && Icones.get ? Icones.get(n, 15) : ""; } catch (e) { return ""; } }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : "."); }

  var MAX_IMAGENS = 2, PRAZO_MS = 120000;

  var IAModelar = {
    _st: null,     /* diálogo aberto */
    _prev: null,   /* prévia na tela: { ops, lote, recusadas, avisos, premissas, resumo, pedido } */

    ligado: function () { try { return !!(global.BimPrevia && BimPrevia.modelador()); } catch (e) { return false; } },
    IA: function () { return global.IAFamilia; },

    /* contexto do validador no APP: a biblioteca do aparelho + a avaliação das famílias (vão das portas no resumo) */
    _ctx: function (ctx) {
      var F = global.Familia, fams = (ctx && typeof ctx.familias === "function" ? ctx.familias() : (ctx && ctx.familias)) || [];
      var cat = global.BimModelar ? BimModelar.catalogo(fams, F) : [];
      var porId = {}; fams.forEach(function (f) { if (f && f.id) porId[f.id] = f; });
      return { catalogo: cat, base: ctx && isFinite(ctx.base) ? +ctx.base : 0,
               avaliarFam: function (famId, tipoId, inst) { var f = porId[famId]; try { return f && F ? F.avaliar(f, tipoId, inst || {}) : null; } catch (e) { return null; } } };
    },

    /* chama o servidor e REVALIDA aqui; {ok, ops, recusadas, avisos, premissas, resumo} ou {ok:false, erro, recusadas} */
    pedir: function (dados, ctx) {
      var self = this, IA = this.IA(), vc = this._ctx(ctx);
      if (!IA || !global.BimModelar) return Promise.resolve({ ok: false, erro: "A modelagem por comando não carregou neste aparelho." });
      var corpo = { pedido: dados.pedido || "", imagens: dados.imagens || [], catalogo: vc.catalogo,
                    contexto: { base: vc.base, existentes: (ctx && ctx.existentes) || 0 } };
      return IA.post("/ia/modelar", corpo, PRAZO_MS).then(function (r) {
        if (r.status !== 200 || !r.j || !r.j.ok) return { ok: false, erro: IA.recado(r, "a modelagem por comando"), recusadas: (r.j && r.j.recusadas) || [], cota: r.j && r.j.cota };
        var v = BimModelar.normalizar(r.j.ops, vc);
        /* o que o servidor recusou + o que ESTE aparelho recusou (biblioteca diferente, servidor velho) */
        var rec = (r.j.recusadas || []).concat(v.recusadas.map(function (x) { x.motivo = x.motivo + " (conferência do aparelho)"; return x; }));
        if (!v.ok) return { ok: false, erro: "As operações que chegaram não passaram na conferência do OrçaPRO e foram descartadas.", recusadas: rec };
        return { ok: true, ops: v.ops, recusadas: rec, avisos: (r.j.avisos || []).concat(v.avisos), premissas: r.j.premissas || [], resumo: BimModelar.resumo(v.ops, vc),
                 cota: r.j.cota || null, modelo: r.j.model || "", croqui: !!r.j.croqui };
      });
    },

    /* ------------------------------------------------------------ TELA
     * ctx = { familias: fn() → biblioteca, base, existentes, opsExistentes: fn() } */
    abrir: function (ctx) {
      var self = this;
      if (!this.ligado()) { toast("A modelagem por comando está na prévia do modelador (?previa=modelador).", "aviso"); return false; }
      if (!global.UI || !UI.modal) return false;
      ctx = ctx || {};
      var st = this._st = { ctx: ctx, imagens: [], enviando: false };
      var h = '<div class="iam" data-ia="modelar">' +
        '<p class="muted" style="margin:0 0 8px;font-size:12.5px">Escreva o que é para modelar — medidas, ambientes, pé-direito, laje e telhado — ou anexe o <b>croqui</b>. A IA monta as paredes, lajes, cobertura, portas e janelas, o OrçaPRO confere cada uma e você vê a <b>prévia</b> antes de aplicar.</p>' +
        '<div class="field"><label>Pedido</label><textarea id="iam-pedido" rows="4" maxlength="2000" placeholder="Ex.: casa térrea 8 x 10 m com 2 quartos, sala, cozinha e banheiro, pé-direito 2,80, laje e telhado 2 águas 30%">' + esc(ctx.pedidoInicial || "") + "</textarea></div>" +
        '<div class="field"><label>Croqui (até ' + MAX_IMAGENS + ' imagens)</label><input type="file" id="iam-arq" accept="image/png,image/jpeg,image/webp" multiple></div>' +
        '<div id="iam-imgs"></div>' +
        '<p class="muted" style="font-size:11.5px;margin:6px 0 0">A IA só cria: não apaga nem mexe no que já existe, e o código de orçamento fica com você. Medidas em metros.</p>' +
        '<div id="iam-cota" class="muted" style="font-size:11.5px;margin-top:4px"></div>' +
        '<div id="iam-msg" style="margin-top:8px"></div></div>';
      UI.modal(ic("ia") + " Modelar por comando", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { self._st = null; UI.fecharModal(); } },
        { texto: "Gerar prévia", classe: "primary", onClick: function () { self._gerar(this); } }
      ]);
      var arq = document.getElementById("iam-arq");
      if (arq) arq.onchange = function () { self._anexar(arq.files); arq.value = ""; };
      var IA = this.IA();
      if (IA && IA.cota) IA.cota().then(function (c) {
        var el = document.getElementById("iam-cota"); if (!el || self._st !== st || !c || !c.modelar) return;
        el.textContent = "Neste mês: " + c.modelar.usado + " de " + c.modelar.teto + " modelagens por comando usadas" + (c.modelar.resta === 0 ? " — cota esgotada" : "") + ".";
      });
      return true;
    },
    _anexar: function (files) {
      var self = this, st = this._st, IA = this.IA(); if (!st || !IA) return;
      var lista = Array.prototype.slice.call(files || []);
      if (st.imagens.length + lista.length > MAX_IMAGENS) toast("No máximo " + MAX_IMAGENS + " imagens; fiquei com as primeiras.", "aviso");
      lista = lista.slice(0, Math.max(0, MAX_IMAGENS - st.imagens.length));
      lista.reduce(function (p, f) {
        return p.then(function () { return IA.lerArquivo(f); }).then(function (d) { return IA.reduzir(d); }).then(function (d) { if (d && self._st === st) st.imagens.push({ dados: d, nome: f.name }); })["catch"](function (e) { toast(String(e && e.message || e), "erro"); });
      }, Promise.resolve()).then(function () { self._pintarImagens(); });
    },
    _pintarImagens: function () {
      var st = this._st, el = document.getElementById("iam-imgs"), self = this;
      if (!st || !el) return;
      el.innerHTML = st.imagens.map(function (im, i) {
        return '<div class="iam-img" data-i="' + i + '" style="display:flex;gap:8px;align-items:center;margin:4px 0"><img src="' + esc(im.dados) + '" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:var(--raio-sm);border:1px solid var(--linha)">' +
          '<span class="muted" style="font-size:12px">' + esc(im.nome || "croqui") + '</span><button class="btn sm ghost" data-iam="tirar">Tirar</button></div>';
      }).join("");
      el.onclick = function (e) { var b = e.target.closest ? e.target.closest('[data-iam="tirar"]') : null; if (!b) return; st.imagens.splice(+b.closest(".iam-img").getAttribute("data-i"), 1); self._pintarImagens(); };
    },
    _gerar: function (botao) {
      var self = this, st = this._st; if (!st || st.enviando) return;   /* ⚠ clique duplo não paga duas chamadas */
      var pedido = String((document.getElementById("iam-pedido") || {}).value || "").trim(), msg = document.getElementById("iam-msg");
      if (pedido.length < 3 && !st.imagens.length) { if (msg) msg.innerHTML = '<div class="fe-erro">Descreva o que é para modelar ou anexe o croqui.</div>'; return; }
      st.enviando = true; if (botao) botao.disabled = true;
      if (msg) msg.innerHTML = '<div class="muted">A IA está modelando e o OrçaPRO confere cada operação. Pode levar até 2 minutos.</div>';
      this.pedir({ pedido: pedido, imagens: st.imagens.map(function (im) { return { dados: im.dados }; }) }, st.ctx).then(function (r) {
        if (self._st !== st) return;
        st.enviando = false; if (botao) botao.disabled = false;
        if (!r.ok) {
          if (msg) msg.innerHTML = '<div class="fe-erro">' + esc(r.erro) + (r.recusadas && r.recusadas.length ? "<br><small>" + r.recusadas.slice(0, 6).map(function (x) { return esc(x.op + " " + x.id + ": " + x.motivo); }).join("<br>") + "</small>" : "") + "</div>";
          return;
        }
        self._st = null; UI.fecharModal();
        self.mostrarPrevia(r, pedido, st.ctx);
      });
    },

    /* a PRÉVIA: grupo fantasma no 3D + a barra com Aplicar / Descartar */
    mostrarPrevia: function (r, pedido, ctx) {
      var B = global.BIM, ops0 = (ctx && typeof ctx.opsExistentes === "function") ? ctx.opsExistentes() : [];
      var idLote = BimModelar.proximoLote(ops0), lote = BimModelar.lote(r.ops, idLote, pedido);
      this.descartar(true);
      this._prev = { ops: lote.ops, lote: lote, recusadas: r.recusadas || [], avisos: r.avisos || [], premissas: r.premissas || [], resumo: r.resumo, pedido: pedido, ctx: ctx };
      var vis = B && B.editarPrevia ? B.editarPrevia(lote.ops) : { ok: false };
      this._prev.malhas = vis && vis.malhas || 0;   /* quantas peças fantasmas o 3D desenhou (a e2e confere) */
      this._barra(vis && vis.ok);
    },
    _barra: function (no3d) {
      var p = this._prev, self = this; if (!p) return;
      var el = document.getElementById("iam-barra");
      if (!el) { el = document.createElement("div"); el.id = "iam-barra"; el.className = "iam-barra"; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Prévia da modelagem por comando"); document.body.appendChild(el); }
      el.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9000;max-width:min(860px,calc(100vw - 32px));background:var(--surface);color:var(--texto);" +
        "border:1px solid var(--linha-forte);border-radius:var(--raio);box-shadow:var(--sombra-lg);padding:10px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:var(--t-peq)";
      var nr = p.recusadas.length;
      el.innerHTML = '<div style="flex:1 1 320px;min-width:0"><b>Prévia da IA</b>' + (no3d ? " (em azul no 3D)" : "") + ': <span data-iam="resumo">' + esc(BimModelar.textoResumo(p.resumo)) + "</span>" +
        (nr ? ' · <span style="color:var(--vermelho)" data-iam="nrec">' + nr + (nr > 1 ? " operações recusadas" : " operação recusada") + "</span>" : "") + "</div>" +
        '<button class="btn sm ghost" data-iam="detalhes">Detalhes</button><button class="btn sm ghost" data-iam="descartar">Descartar</button><button class="btn sm primary" data-iam="aplicar">Aplicar ao modelo</button>';
      el.onclick = function (e) {
        var b = e.target.closest ? e.target.closest("[data-iam]") : null; if (!b) return;
        var k = b.getAttribute("data-iam");
        if (k === "aplicar") self.aplicar(); else if (k === "descartar") self.descartar(); else if (k === "detalhes") self.detalhes();
      };
    },
    detalhes: function () {
      var p = this._prev; if (!p || !global.UI) return;
      var vc = this._ctx(p.ctx), larg = {};
      (vc.catalogo || []).forEach(function (f) { (f.tipos || []).forEach(function (t) { if (t.largura) larg[f.id + "|" + t.id] = t.largura; }); });
      var svg = BimModelar.plantaSvg(p.ops, { larguraVao: function (f) { return larg[f.famId + "|" + f.tipoId] || 0.8; } });
      function lista(t, xs) { return xs.length ? "<h4 style=\"margin:10px 0 4px\">" + t + "</h4><ul style=\"margin:0;padding-left:18px\">" + xs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : ""; }
      UI.modal("Prévia da modelagem por comando", '<div data-iam="det">' +
        '<p style="margin:0 0 6px">' + esc(BimModelar.textoResumo(p.resumo)) + ".</p>" +
        (svg ? '<div style="max-height:46vh;overflow:auto;border:1px solid var(--linha);border-radius:var(--raio-sm);padding:6px;background:var(--surface)">' + svg + "</div>" : "") +
        lista("Recusadas pelo OrçaPRO", p.recusadas.map(function (x) { return x.op + " " + x.id + ": " + cap(x.motivo); })) +
        lista("Premissas da IA", p.premissas.map(cap)) + lista("Avisos", p.avisos.map(cap)) + "</div>", [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
      ]);
    },
    aplicar: function () {
      var p = this._prev, B = global.BIM; if (!p) return false;
      if (!B || !B.editarLote) { toast("O visualizador 3D não está aberto.", "erro"); return false; }
      var ok = B.editarLote(p.lote);
      this.descartar(true);
      if (ok) toast("Modelo aplicado: " + BimModelar.textoResumo(p.resumo) + ". Desfaz de uma vez com Ctrl+Z.", "ok", 7000);
      else toast("Não consegui aplicar a prévia ao modelo.", "erro");
      return ok;
    },
    descartar: function (calado) {
      var B = global.BIM, tinha = !!this._prev;
      if (B && B.editarPrevia) { try { B.editarPrevia(null); } catch (e) {} }
      var el = document.getElementById("iam-barra"); if (el && el.parentNode) el.parentNode.removeChild(el);
      this._prev = null;
      if (tinha && !calado) toast("Prévia descartada — nada foi gravado.", "info");
    }
  };

  global.IAModelar = IAModelar;
  if (typeof module !== "undefined" && module.exports) module.exports = IAModelar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
