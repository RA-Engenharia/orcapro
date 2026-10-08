/* =====================================================================
 * iafamilia.js — FAMÍLIA POR IA (F3, 07/10/2026)
 *
 * O usuário descreve a peça e/ou anexa imagens (planta, corte, isométrico,
 * foto de catálogo) e o servidor de IA (POST /ia/familia, server/ia-gemini.js)
 * devolve uma família paramétrica NO FORMATO de js/familia.js, já validada
 * pelo mesmo familia.js. Aqui ela é validada DE NOVO (defesa: servidor velho
 * ou trocado) e abre no Editor de família (js/familiaui.js) para o usuário
 * conferir na prévia 3D e salvar — nada entra na biblioteca sem ele salvar.
 *
 * ⚠ CÓDIGO DE ORÇAMENTO SEMPRE VAZIO, também aqui (regra da casa: a IA não
 *   inventa SINAPI). Quem escolhe é o orçamentista.
 * ⚠ IMAGEM REDUZIDA NO APARELHO antes de subir (1600 px, JPEG): o servidor
 *   recusa acima de 3 MB por imagem e cada byte é tempo na rede da obra.
 *
 * Também guarda o que o render por IA (js/iarender.js) reusa: o POST com
 * prazo e a tradução dos recados do servidor. ES5, sem dependência além de
 * UI/CONFIG/Licenca/Familia no navegador; as partes puras rodam no Node.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, k, ms) { try { if (global.UI && UI.toast) UI.toast(t, k || "info", ms); } catch (e) {} }
  function ic(n) { try { return global.Icones && Icones.get ? Icones.get(n, 15) : ""; } catch (e) { return ""; } }

  var PAPEIS = { planta: "Planta / vista superior", corte: "Corte / elevação", isometrico: "Isométrico / perspectiva", foto: "Foto de catálogo", outro: "Outra referência" };
  var MAX_IMAGENS = 3, LADO_MAX = 1600;

  var IAFamilia = {
    PAPEIS: PAPEIS,
    _st: null,

    back: function () { try { return (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? String(CONFIG.iaBackend).replace(/\/$/, "") : "http://localhost:3041"; } catch (e) { return "http://localhost:3041"; } },
    chave: function () { try { return (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : ""; } catch (e) { return ""; } },

    /* POST com prazo: {status, j} — rede caída vira status 0 (nunca rejeita) */
    post: function (caminho, corpo, prazoMs) {
      var ctrl = null, timer = null, self = this;
      try { if (typeof AbortController !== "undefined") ctrl = new AbortController(); } catch (e) { ctrl = null; }
      if (ctrl && prazoMs > 0) timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, prazoMs);
      return fetch(this.back() + caminho, { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": self.chave() }, body: JSON.stringify(corpo || {}), signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          var s = (r && typeof r.status === "number") ? r.status : 200;
          return r.json().then(function (j) { return { status: s, j: j || {} }; }, function () { return { status: s, j: {} }; });
        }, function (e) { return { status: 0, j: {}, abortou: !!(e && e.name === "AbortError") }; })
        .then(function (x) { if (timer) clearTimeout(timer); return x; });
    },

    /* recado do servidor em português, para a TELA (o técnico vai para o console) */
    recado: function (r, oque) {
      var j = (r && r.j) || {}, s = r ? r.status : 0;
      if (s === 0) return r && r.abortou ? "A IA demorou demais e o pedido foi cancelado. Tente de novo." : "Sem conexão com o servidor de IA. Confira a internet e tente de novo.";
      if (s === 404) return "O servidor de IA ainda não tem " + oque + " (versão antiga). Peça a atualização do servidor.";
      if (s === 403 && /licen/i.test(j.error || "")) return "Ative sua licença do OrçaPRO para usar a IA.";
      var m = String(j.error || ("erro " + s));
      return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
    },

    /* família que CHEGOU: valida de novo, limpa o código e marca a origem.
       Devolve {ok, familia, erros}. */
    aceitar: function (fam, meta) {
      var F = global.Familia;
      if (!fam || typeof fam !== "object" || !F) return { ok: false, erros: ["a resposta não trouxe família"] };
      var c = JSON.parse(JSON.stringify(fam));
      c.quantitativo = c.quantitativo || {};
      c.quantitativo.codigo = ""; c.quantitativo.fonte = "";
      if (!/^fam-/.test(String(c.id || ""))) c.id = "fam-ia-" + Date.now().toString(36);
      c._origem = "minha";
      c.geradaPorIA = { modelo: String((meta && meta.modelo) || ""), em: new Date().toISOString() };
      var prem = (meta && meta.premissas) || [];
      if (prem.length) c.descricao = (String(c.descricao || "") + (c.descricao ? " · " : "") + "Premissas da IA: " + prem.join("; ")).slice(0, 600);
      var v = F.validar(c);
      if (!v.ok) return { ok: false, erros: v.erros };
      var errs = [];
      (c.tipos || []).forEach(function (t) { var r = F.avaliar(c, t.id, {}); if (!r.ok) errs = errs.concat(r.erros); });
      if (errs.length) return { ok: false, erros: errs };
      return { ok: true, familia: c };
    },

    /* chama o servidor; {ok, familia, premissas, avisos, tentativas, cota} ou {ok:false, erro, erros} */
    pedir: function (dados) {
      var self = this;
      return this.post("/ia/familia", { pedido: dados.pedido || "", categoria: dados.categoria || "", imagens: dados.imagens || [] }, 170000).then(function (r) {
        if (r.status !== 200 || !r.j || !r.j.ok) return { ok: false, erro: self.recado(r, "a família por IA"), erros: (r.j && r.j.erros) || [], cota: r.j && r.j.cota };
        var a = self.aceitar(r.j.familia, { modelo: r.j.modelo, premissas: r.j.premissas });
        if (!a.ok) return { ok: false, erro: "A família que chegou não passou na conferência do OrçaPRO e foi descartada.", erros: a.erros };
        return { ok: true, familia: a.familia, premissas: r.j.premissas || [], avisos: r.j.avisos || [], tentativas: r.j.tentativas || 1, cota: r.j.cota || null, modelo: r.j.modelo || "" };
      });
    },

    /* ------------------------------------------------ imagens (navegador) */
    lerArquivo: function (file) {
      return new Promise(function (ok, erro) {
        var rd = new FileReader();
        rd.onload = function () { ok(String(rd.result || "")); };
        rd.onerror = function () { erro(new Error("não consegui ler " + (file && file.name))); };
        rd.readAsDataURL(file);
      });
    },
    reduzir: function (dataUrl, lado, qual) {
      lado = lado || LADO_MAX; qual = qual || 0.85;
      return new Promise(function (ok) {
        try {
          var img = new Image();
          img.onload = function () {
            try {
              var f = Math.min(1, lado / Math.max(img.width, img.height));
              var c = document.createElement("canvas");
              c.width = Math.max(1, Math.round(img.width * f)); c.height = Math.max(1, Math.round(img.height * f));
              var g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
              g.drawImage(img, 0, 0, c.width, c.height);
              ok(c.toDataURL("image/jpeg", qual));
            } catch (e) { ok(dataUrl); }
          };
          img.onerror = function () { ok(""); };
          img.src = dataUrl;
        } catch (e) { ok(dataUrl); }
      });
    },

    /* cota do mês, para a linha do diálogo (falha calada: é só informação) */
    cota: function () {
      return this.post("/ia/cota", {}, 15000).then(function (r) { return r.status === 200 && r.j && r.j.ok ? r.j : null; });
    },
    textoCota: function (c, tipo) {
      if (!c || !c[tipo]) return "";
      var x = c[tipo];
      return "Neste mês: " + x.usado + " de " + x.teto + (tipo === "render" ? " renders" : " famílias por IA") + " usados" + (x.resta === 0 ? " — cota esgotada" : "") + ".";
    },

    /* ------------------------------------------------------------ TELA
     * ctx = { abrirEditor(fam), pedidoInicial, imagensIniciais:[{dados,papel}],
     *         aoGerar(fam) } */
    abrir: function (ctx) {
      var self = this;
      ctx = ctx || {};
      if (!global.UI || !UI.modal) return;
      var st = this._st = { ctx: ctx, imagens: (ctx.imagensIniciais || []).slice(0, MAX_IMAGENS), enviando: false };
      var cats = (global.Familia && Familia.CATEGORIAS) || {};
      var h = '<div class="iaf" data-ia="familia">' +
        '<p class="muted" style="margin:0 0 8px;font-size:12.5px">Descreva a peça e, se tiver, anexe a <b>planta</b> (largura e profundidade), o <b>corte</b> (alturas) e um <b>isométrico ou foto</b> (forma). A IA monta a família paramétrica, o OrçaPRO confere e ela abre no editor para você revisar e salvar.</p>' +
        '<div class="field"><label>Pedido</label><textarea id="iaf-pedido" rows="4" maxlength="2000" placeholder="Ex.: mesa de jantar em madeira maciça para 6 lugares, tampo 1,80 x 0,90 m com 4 cm, pés quadrados 8 x 8 cm, altura 75 cm; tipos de 4 e 6 lugares">' + esc(ctx.pedidoInicial || "") + "</textarea></div>" +
        '<div class="field"><label>Categoria</label><select id="iaf-cat"><option value="">A IA decide</option>' +
          Object.keys(cats).map(function (k) { return '<option value="' + esc(k) + '">' + esc(cats[k]) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Imagens (até ' + MAX_IMAGENS + ')</label><input type="file" id="iaf-arq" accept="image/png,image/jpeg,image/webp" multiple></div>' +
        '<div id="iaf-imgs"></div>' +
        '<p class="muted" style="font-size:11.5px;margin:6px 0 0">O código de orçamento fica vazio: você escolhe na base depois. Medidas em metros.</p>' +
        '<div id="iaf-cota" class="muted" style="font-size:11.5px;margin-top:4px"></div>' +
        '<div id="iaf-msg" style="margin-top:8px"></div></div>';
      UI.modal(ic("ia") + " Família por IA", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { self._st = null; UI.fecharModal(); } },
        { texto: "Gerar família", classe: "primary", onClick: function () { self._gerar(this); } }
      ]);
      this._pintarImagens();
      var arq = document.getElementById("iaf-arq");
      if (arq) arq.onchange = function () { self._anexar(arq.files); arq.value = ""; };
      this.cota().then(function (c) { var el = document.getElementById("iaf-cota"); if (el && self._st === st) el.textContent = self.textoCota(c, "familia"); });
    },
    _anexar: function (files) {
      var self = this, st = this._st; if (!st) return;
      var lista = Array.prototype.slice.call(files || []);
      if (st.imagens.length + lista.length > MAX_IMAGENS) toast("No máximo " + MAX_IMAGENS + " imagens; fiquei com as primeiras.", "aviso");
      lista = lista.slice(0, Math.max(0, MAX_IMAGENS - st.imagens.length));
      var papelPadrao = ["planta", "corte", "isometrico"];
      lista.reduce(function (p, f) {
        return p.then(function () { return self.lerArquivo(f); }).then(function (d) { return self.reduzir(d); }).then(function (d) {
          if (d && self._st === st) st.imagens.push({ dados: d, papel: papelPadrao[st.imagens.length] || "outro", nome: f.name });
        })["catch"](function (e) { toast(String(e && e.message || e), "erro"); });
      }, Promise.resolve()).then(function () { self._pintarImagens(); });
    },
    _pintarImagens: function () {
      var st = this._st, el = document.getElementById("iaf-imgs"), self = this;
      if (!st || !el) return;
      el.innerHTML = st.imagens.map(function (im, i) {
        return '<div class="iaf-img" data-i="' + i + '" style="display:flex;gap:8px;align-items:center;margin:4px 0">' +
          '<img src="' + esc(im.dados) + '" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1">' +
          '<select data-iaf="papel">' + Object.keys(PAPEIS).map(function (k) { return '<option value="' + k + '"' + (k === im.papel ? " selected" : "") + ">" + PAPEIS[k] + "</option>"; }).join("") + "</select>" +
          '<button class="btn sm ghost" data-iaf="tirar" title="Tirar a imagem">Tirar</button></div>';
      }).join("");
      el.onchange = function (e) { var t = e.target; if (t.getAttribute("data-iaf") === "papel") { var i = +t.closest(".iaf-img").getAttribute("data-i"); if (st.imagens[i]) st.imagens[i].papel = t.value; } };
      el.onclick = function (e) { var b = e.target.closest ? e.target.closest('[data-iaf="tirar"]') : null; if (!b) return; st.imagens.splice(+b.closest(".iaf-img").getAttribute("data-i"), 1); self._pintarImagens(); };
    },
    _gerar: function (botao) {
      var self = this, st = this._st; if (!st || st.enviando) return;   // ⚠ clique duplo não paga duas chamadas
      var pedido = String((document.getElementById("iaf-pedido") || {}).value || "").trim();
      var cat = String((document.getElementById("iaf-cat") || {}).value || "");
      var msg = document.getElementById("iaf-msg");
      if (pedido.length < 3 && !st.imagens.length) { if (msg) msg.innerHTML = '<div class="fe-erro">Descreva a peça ou anexe uma imagem dela.</div>'; return; }
      st.enviando = true;
      if (botao) botao.disabled = true;
      if (msg) msg.innerHTML = '<div class="muted">A IA está modelando a família e o OrçaPRO confere cada versão (até 3 tentativas). Pode levar até 2 minutos.</div>';
      this.pedir({ pedido: pedido, categoria: cat, imagens: st.imagens.map(function (im) { return { dados: im.dados, papel: im.papel }; }) }).then(function (r) {
        if (self._st !== st) return;
        st.enviando = false; if (botao) botao.disabled = false;
        if (!r.ok) {
          if (msg) msg.innerHTML = '<div class="fe-erro">' + esc(r.erro) + (r.erros && r.erros.length ? '<br><small>' + r.erros.slice(0, 6).map(esc).join("<br>") + "</small>" : "") + "</div>";
          return;
        }
        self._st = null;
        UI.fecharModal();
        if (st.ctx.aoGerar) { try { st.ctx.aoGerar(r.familia); } catch (e) {} }
        if (st.ctx.abrirEditor) st.ctx.abrirEditor(r.familia);
        toast("Família \"" + r.familia.nome + "\" gerada por IA" + (r.tentativas > 1 ? " (" + r.tentativas + " tentativas)" : "") + ". Confira na prévia 3D e clique Salvar na biblioteca." +
          (r.avisos.length ? " " + r.avisos[0].charAt(0).toUpperCase() + r.avisos[0].slice(1) + "." : ""), "ok", 7000);
      });
    }
  };

  global.IAFamilia = IAFamilia;
  if (typeof module !== "undefined" && module.exports) module.exports = IAFamilia;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
