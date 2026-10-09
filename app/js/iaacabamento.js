/* =====================================================================
 * iaacabamento.js — ACABAMENTO COM IA (RENDER-IA, 09/10/2026)
 *
 * O botão "Acabamento com IA" do painel de Render: pega a imagem do render
 * físico (BimRender.imagemAtual(), js/bimrender*.js) — ou, sem ele, a
 * captura da vista 3D (IARender.capturar) — e o DESCRITIVO da cena
 * (BimRender.descritivo(): materiais, luzes, hora, câmera), junta o pedido
 * do usuário ("noite, luz quente, cozinha com mais vida") e manda ao
 * servidor de IA (POST /ia/render/acabamento, server/ia-acabamento.js), que
 * usa o modelo de imagem de mais qualidade do Gemini preservando geometria
 * e materiais.
 *
 * DECISÃO DO ROGÉRIO (09/10/2026): 2 por mês no plano; passou disso o render
 * é PAGO, e o preço aparece ANTES de gerar:
 *   • dentro da cota → "Incluído no seu plano (1 de 2 este mês)";
 *   • fora → "Este render custa R$ X,XX — confirmar?" e o botão vira
 *     "Confirmar R$ X,XX e gerar". O clique leva o ORÇAMENTO que o servidor
 *     devolveu (POST /ia/render/preco); o servidor debita a CARTEIRA de
 *     créditos da licença e estorna se a IA não entregar.
 * ⚠ SEM CONFIRMAÇÃO NÃO HÁ COBRANÇA: fora da cota, o pedido sem orçamento é
 *   recusado no servidor (402) — a tela não consegue cobrar calada.
 * ⚠ CLIQUE DUPLO NÃO PAGA DOIS: o botão trava enquanto gera, e o servidor
 *   recusa o mesmo orçamento duas vezes.
 * ⚠ A imagem vai para a galeria da obra pelo IARender.salvar (registro leve
 *   no Store, bytes no IndexedDB) com a MARCA de IA — nunca base64 no Store.
 *
 * A carteira (saldo, extrato) aparece na tela de Licença (montarCarteira).
 * ES5; as partes puras são exportadas para o Node (tools/test-ia-render-srv.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, k, ms) { try { if (global.UI && UI.toast) UI.toast(t, k || "info", ms); } catch (e) {} }
  function ic(n) { try { return global.Icones && Icones.get ? Icones.get(n, 15) : ""; } catch (e) { return ""; } }
  function IAF() { return global.IAFamilia; }

  var TAMANHOS = ["1K", "2K", "4K"];
  var NOME_TAM = { "1K": "1K (rápido)", "2K": "2K (recomendado)", "4K": "4K (impressão)" };

  var IAAcabamento = {
    TAMANHOS: TAMANHOS,
    _st: null, _ctx: null,

    /* ------------------------------------------------------- puros */
    brl: function (cent) {
      var c = Math.round(Number(cent) || 0), neg = c < 0, a = Math.abs(c), s = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      var ce = String(a % 100); if (ce.length < 2) ce = "0" + ce;
      return (neg ? "-" : "") + "R$ " + s + "," + ce;
    },
    /* o texto da decisão, igual ao combinado com o Rogério */
    textoPreco: function (p) {
      if (!p || !p.ok) return "";
      if (p.dentroCota) return "Incluído no seu plano (" + ((p.cota && p.cota.usado) + 1) + " de " + (p.cota && p.cota.teto) + " este mês)";
      return "Este render custa " + this.brl(p.precoCent) + " — confirmar?";
    },
    rotuloBotao: function (p) {
      if (!p || !p.ok) return "Gerar acabamento";
      return p.dentroCota ? "Gerar (incluído no plano)" : "Confirmar " + this.brl(p.precoCent) + " e gerar";
    },
    /* só confirma o que dá para pagar: dentro da cota, ou orçamento + saldo */
    podeConfirmar: function (p) { return !!(p && p.ok && (p.dentroCota || (p.orcamentoId && p.carteira && p.carteira.suficiente))); },
    /* a imagem que vai: o render físico, se houver; senão a vista 3D */
    fonte: function () {
      var BR = global.BimRender, img = "", origem = "captura", w = 0, h = 0;
      try {
        if (BR && typeof BR.imagemAtual === "function") {
          var x = BR.imagemAtual();
          if (x && typeof x.toDataURL === "function") { w = x.width; h = x.height; x = x.toDataURL("image/jpeg", 0.92); }
          else if (x && typeof x === "object" && typeof x.dataUrl === "string") { w = x.largura || x.width || 0; h = x.altura || x.height || 0; x = x.dataUrl; }
          if (typeof x === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(x)) { img = x; origem = "render"; }
        }
      } catch (e) { img = ""; }
      var IR = global.IARender;
      if (!img) {
        var cap = IR && IR.capturar ? IR.capturar() : null;
        if (!cap || !cap.ok) return { ok: false, erro: (cap && cap.erro) || "O visualizador 3D não está aberto." };
        return { ok: true, imagem: cap.vista, origem: "captura", proporcao: cap.proporcao };
      }
      if (!(w > 0 && h > 0)) { try { var t = global.BIM && BIM.desenharQuadro ? BIM.desenharQuadro() : null; w = t && t.width; h = t && t.height; } catch (e2) {} }
      var pr = IR && IR.proporcaoDe ? IR.proporcaoDe(w, h).nome : "16:9";
      return { ok: true, imagem: img, origem: origem, proporcao: pr };
    },
    descritivo: function () {
      try {
        var BR = global.BimRender;
        if (BR && typeof BR.descritivo === "function") { var d = BR.descritivo(); return typeof d === "string" ? d : (d ? JSON.stringify(d) : ""); }
      } catch (e) {}
      return "";
    },
    montarCorpo: function (f, desc, pedido, tamanho, orcamentoId) {
      return { imagem: f.imagem, origem: f.origem, descritivo: desc || "", pedido: String(pedido || "").trim(), tamanho: tamanho, proporcao: f.proporcao, orcamentoId: orcamentoId || "" };
    },

    /* ----------------------------------------------------- servidor */
    preco: function (tamanho, pedido, desc, origem) {
      var IA = IAF();
      if (!IA) return Promise.resolve({ ok: false, erro: "O módulo de IA não carregou." });
      return IA.post("/ia/render/preco", { tamanho: tamanho, pedido: pedido, descritivo: desc, origem: origem }, 20000).then(function (r) {
        return r.status === 200 && r.j && r.j.ok ? r.j : { ok: false, erro: IA.recado(r, "o preço do acabamento com IA") };
      });
    },
    carteira: function () {
      var IA = IAF();
      if (!IA) return Promise.resolve(null);
      return IA.post("/ia/carteira", {}, 15000).then(function (r) { return r.status === 200 && r.j && r.j.ok ? r.j : null; });
    },

    /* =============================================================== TELA
     * ctx = o mesmo do IARender ({ empresaId(), obraId, autor }) */
    abrir: function (ctx) {
      var self = this;
      this._ctx = ctx || this._ctx || {};
      if (!global.UI || !UI.modal) return;
      var f = this.fonte();
      if (!f.ok) { toast(f.erro, "erro"); return; }
      var st = this._st = { fonte: f, desc: this.descritivo(), pedido: (this._st && this._st.pedido) || "", tamanho: (this._st && this._st.tamanho) || "2K", preco: null, enviando: false, seq: 0 };
      var h = '<div class="iaa" data-ia="acabamento">' +
        '<div style="position:relative;margin-bottom:8px"><img src="' + esc(f.imagem) + '" alt="Imagem que vai para o acabamento" style="width:100%;max-height:220px;object-fit:contain;border-radius:8px;background:#dfe7ef">' +
        '<span style="position:absolute;left:8px;bottom:8px;background:rgba(11,26,43,.8);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px">' + (f.origem === "render" ? "Render físico" : "Vista 3D (sem render físico)") + " · " + esc(f.proporcao) + "</span></div>" +
        '<p class="muted" style="margin:0 0 6px;font-size:12px">A IA mantém a câmera, a geometria e os materiais' + (st.desc ? " (vai junto a descrição da cena: materiais, luzes, hora e câmera)" : "") + " e só realça o realismo: luz, sombra, reflexo e textura.</p>" +
        '<div class="field"><label for="iaa-pedido">O que realçar</label><textarea id="iaa-pedido" rows="3" maxlength="2000" placeholder="Ex.: noite, luz quente, cozinha com mais vida">' + esc(st.pedido) + "</textarea></div>" +
        '<div class="field"><label for="iaa-tam">Resolução</label><select id="iaa-tam">' + TAMANHOS.map(function (t) { return '<option value="' + t + '"' + (t === st.tamanho ? " selected" : "") + ">" + NOME_TAM[t] + "</option>"; }).join("") + "</select></div>" +
        '<div id="iaa-preco" aria-live="polite" style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#f1f5f9;font-size:13px"><span class="muted">Consultando o preço…</span></div>' +
        '<div id="iaa-msg" style="margin-top:6px"></div>' +
        '<p style="font-size:11px;margin:8px 0 0;color:#b45309">' + esc((global.IARender && IARender.MARCA) || "Ilustração gerada por IA — não é projeto executivo") + ".</p></div>";
      UI.modal(ic("camera") + " Acabamento com IA", h, [
        { texto: "Fechar", classe: "ghost", onClick: function () { self._lerForm(); UI.fecharModal(); } },
        { texto: "Gerar acabamento", classe: "primary", onClick: function () { self._confirmar(this); } }
      ]);
      var tx = document.getElementById("iaa-pedido"), tm = document.getElementById("iaa-tam");
      /* o preço muda com a resolução (e pouco com o texto): consulta de novo, sem martelar o servidor */
      if (tm) tm.onchange = function () { self._lerForm(); self._consultar(); };
      if (tx) tx.oninput = function () { self._lerForm(); clearTimeout(self._t); self._t = setTimeout(function () { self._consultar(); }, 700); };
      this._consultar();
    },
    _lerForm: function () {
      var st = this._st; if (!st) return;
      var tx = document.getElementById("iaa-pedido"), tm = document.getElementById("iaa-tam");
      if (tx) st.pedido = tx.value; if (tm && TAMANHOS.indexOf(tm.value) >= 0) st.tamanho = tm.value;
    },
    _botao: function () { var bs = document.querySelectorAll("#modal-footer .btn.primary"); return bs.length ? bs[bs.length - 1] : null; },
    _consultar: function () {
      var self = this, st = this._st; if (!st) return Promise.resolve(null);
      var meu = ++st.seq;
      st.preco = null; this._pintarPreco();
      return this.preco(st.tamanho, st.pedido, st.desc, st.fonte.origem).then(function (p) {
        if (self._st !== st || meu !== st.seq) return null;          // resposta velha (trocou a resolução no meio)
        st.preco = p; self._pintarPreco(); return p;
      });
    },
    _pintarPreco: function () {
      var st = this._st, el = document.getElementById("iaa-preco"), b = this._botao(); if (!st || !el) return;
      var p = st.preco;
      if (!p) { el.innerHTML = '<span class="muted">Consultando o preço…</span>'; if (b) { b.disabled = true; b.textContent = "Gerar acabamento"; } return; }
      if (!p.ok) { el.innerHTML = '<span class="fe-erro">' + esc(p.erro) + "</span>"; if (b) { b.disabled = true; b.textContent = "Gerar acabamento"; } return; }
      var h = "<b>" + esc(this.textoPreco(p)) + "</b>";
      if (!p.dentroCota) {
        h += '<div class="muted" style="font-size:11.5px;margin-top:4px">Os ' + esc(p.cota && p.cota.teto) + " acabamentos do plano deste mês já foram usados. O preço inclui:</div>" +
          '<ul style="margin:4px 0 0 18px;padding:0;font-size:11.5px">' + (p.inclui || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
          '<div style="font-size:12px;margin-top:6px">Saldo da carteira de créditos: <b>' + esc(this.brl(p.carteira && p.carteira.saldoCent)) + "</b>" +
          (p.carteira && p.carteira.suficiente ? "" : ' — <span style="color:#b91c1c">insuficiente.</span> ' + esc((p.compraCreditos && p.compraCreditos.texto) || "")) + "</div>" +
          '<div class="muted" style="font-size:11px;margin-top:2px">Preço válido por ' + esc(p.validadeMin || 15) + " minutos. Se a IA não entregar a imagem, o valor volta para a carteira.</div>";
      }
      el.innerHTML = h;
      if (b) { b.disabled = !this.podeConfirmar(p); b.textContent = this.rotuloBotao(p); }
    },
    _msg: function (html) { var m = document.getElementById("iaa-msg"); if (m) m.innerHTML = html; },
    _confirmar: function (botao) {
      var self = this, st = this._st, ctx = this._ctx || {}, IA = IAF();
      if (!st || st.enviando || !IA) return;                                     // ⚠ clique duplo não paga dois
      this._lerForm();
      var p = st.preco;
      if (!this.podeConfirmar(p)) { this._msg('<div class="fe-erro">' + esc(p && !p.ok ? p.erro : "Aguarde o preço — ou carregue créditos na carteira.") + "</div>"); return; }
      var corpo = this.montarCorpo(st.fonte, st.desc, st.pedido, st.tamanho, p.dentroCota ? "" : p.orcamentoId);
      st.enviando = true; if (botao) botao.disabled = true;
      this._msg('<div class="muted">Gerando o acabamento com IA… pode levar até 3 minutos.</div>');
      return IA.post("/ia/render/acabamento", corpo, 170000).then(function (r) {
        st.enviando = false;
        if (r.status !== 200 || !r.j || !r.j.ok || !r.j.imagem || !r.j.imagem.data) {
          var j = r.j || {};
          self._msg('<div class="fe-erro">' + esc(IA.recado(r, "o acabamento com IA")) + "</div>");
          /* orçamento vencido/usado, cota que acabou no meio, saldo: o preço é consultado de novo (porta para seguir) */
          if (r.status === 402 || r.status === 409 || j.estornado) self._consultar(); else if (botao) botao.disabled = false;
          return null;
        }
        var IR = global.IARender;
        var info = { obraId: ctx.obraId || "", prompt: "Acabamento com IA" + (st.pedido ? ": " + String(st.pedido).trim() : ""), objetos: [], refs: 0, autor: ctx.autor || "" };
        if (r.j.cobrado) toast("Cobrado " + r.j.cobrado.texto + " da carteira de créditos (saldo: " + r.j.cobrado.saldo + ").", "info", 6000);
        if (!IR || !IR.salvar) { self._msg('<div class="fe-erro">A galeria de renders não carregou — a imagem não foi guardada.</div>'); return null; }
        return IR.salvar(r.j, info).then(function (s) {
          if (s.semIdb) toast("Este navegador não guarda imagens (janela anônima?): o acabamento aparece agora e dá para baixar, mas não fica na galeria.", "aviso", 7000);
          else if (!s.ok) { self._msg('<div class="fe-erro">' + esc(s.erro) + "</div>"); return null; }
          IR.mostrar(s.reg, s.dataUrl, null);
          return s;
        });
      });
    },

    /* RENDER-IA: o botão para o painel de Render (o motor chama com o contêiner dele) */
    botao: function (contem, ctx) {
      var self = this;
      if (!contem || !global.document) return null;
      var b = document.createElement("button");
      b.className = "btn sm primary"; b.type = "button"; b.setAttribute("data-ia", "acabamento-botao");
      b.innerHTML = ic("camera") + " Acabamento com IA";
      b.onclick = function () { self.abrir(ctx || self._ctx); };
      contem.appendChild(b);
      return b;
    },

    /* a carteira na tela de Licença: saldo, uso do mês e extrato. Sem servidor, fica vazio (nunca atrapalha a tela). */
    montarCarteira: function (elId) {
      var self = this, el = global.document && document.getElementById(elId);
      if (!el) return Promise.resolve(null);
      return this.carteira().then(function (c) {
        if (!c || !document.getElementById(elId)) return null;
        var ext = (c.extrato || []).slice(0, 10);
        var NOME = { credito: "Crédito", debito: "Débito", estorno: "Estorno" };
        el.innerHTML = '<div class="card" style="margin-top:8px" data-ia="carteira"><b>Créditos de IA</b>' +
          '<div style="font-size:13px;margin-top:4px">Saldo: <b>' + esc(c.saldo) + "</b>" + (c.acabamento ? " · Acabamentos com IA neste mês: " + esc(c.acabamento.usado + " de " + c.acabamento.teto) + " incluídos no plano" : "") + "</div>" +
          (ext.length ? '<table style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse"><thead><tr><th style="text-align:left">Data</th><th style="text-align:left">Lançamento</th><th style="text-align:right">Valor</th><th style="text-align:right">Saldo</th></tr></thead><tbody>' +
            ext.map(function (l) {
              return "<tr><td>" + esc(new Date(l.em).toLocaleDateString("pt-BR")) + "</td><td>" + esc((NOME[l.tipo] || l.tipo) + (l.descricao ? " — " + l.descricao : "")) + '</td><td style="text-align:right;color:' + (l.tipo === "debito" ? "#b91c1c" : "#15803d") + '">' +
                (l.tipo === "debito" ? "−" : "+") + esc(self.brl(l.valorCent).replace("R$ ", "")) + '</td><td style="text-align:right">' + esc(self.brl(l.saldoCent)) + "</td></tr>";
            }).join("") + "</tbody></table>" : '<div class="muted" style="font-size:12px;margin-top:4px">Nenhum lançamento ainda.</div>') +
          '<div class="muted" style="font-size:11px;margin-top:6px">Os créditos pagam o acabamento com IA além do que o plano inclui. ' + esc((c.compraCreditos && c.compraCreditos.texto) || "") + "</div></div>";
        return c;
      });
    }
  };

  global.IAAcabamento = IAAcabamento;
  if (typeof module !== "undefined" && module.exports) module.exports = IAAcabamento;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
