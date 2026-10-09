/* =====================================================================
 * bimestilo.js — ESTILO VISUAL DO BIM: o seletor e a troca de textura
 * (prévia `?previa=visual`, 07/10/2026)
 *
 * Pedido do Rogério: "quero ver a parede com preenchimento de
 * cor normal, com a textura, com a textura realista, e só preto e branco. O
 * sistema tem que vir com as texturas."
 *
 * Este arquivo é só a TELA: o menu dos quatro estilos (aberto pela fita, em
 * Vista › Exibir › Estilo, e pelo botão na barra das vistas) e a seção
 * "Material e textura" de Propriedades. Quem decide o que cada estilo liga é o
 * motor (js/bimtextura.js, planoEstilo); quem pinta é o viewer (js/bim.js,
 * "ESTILO VISUAL").
 *
 * ⚠ A TROCA DE TEXTURA É POR OBRA E POR NOME DE MATERIAL. Chave
 * `orcapro:bim:materiais-obra:<obra>` (a mesma forma das vistas 2D,
 * `orcapro:bim:desenho2d:<obra>`). O nome é normalizado (sem acento,
 * minúsculas): "Bloco Cerâmico" e "bloco ceramico" são o mesmo material — e a
 * troca vale para TODAS as peças dele.
 * ⚠ Fora da prévia, nada aqui aparece: o menu não abre e a seção não monta.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREF_OBRA = "orcapro:bim:materiais-obra:";
  var MODOS = [
    { id: "linha", nome: "Linha oculta", dica: "Preto e branco: faces brancas e as arestas — para ler a forma." },
    { id: "sombreado", nome: "Sombreado", dica: "A cor de cada material, com luz." },
    { id: "textura", nome: "Textura", dica: "A textura do material (tijolo, madeira, telha…) com luz simples." },
    { id: "realista", nome: "Realista", dica: "Textura com relevo, brilho e sombra. Usa mais a placa de vídeo." }
  ];

  function previa() { try { return document.documentElement.getAttribute("data-visual") === "nova"; } catch (e) { return false; } }
  function T() { return global.BimTextura || null; }
  function bim() { return global.BIM || null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function status(msg) { try { if (global.BimShell && BimShell.status) BimShell.status(msg); } catch (e) {} }
  function nomeModo(id) { for (var i = 0; i < MODOS.length; i++) if (MODOS[i].id === id) return MODOS[i].nome; return "Sombreado"; }

  var BimEstilo = {
    MODOS: MODOS,
    _cache: { chave: null, trocas: {} },
    previa: previa,

    /* ---------------------------------------------------- troca por obra */
    obraKey: function () { try { return String((global.Gestao && global.Gestao._bimSel) || "geral"); } catch (e) { return "geral"; } },
    chave: function () { return PREF_OBRA + this.obraKey(); },
    /* lida a cada abertura de peça (o viewer chama por peça ao montar o
       modelo): o objeto fica em cache enquanto a obra for a mesma */
    trocasAtuais: function () {
      var k = this.chave();
      if (this._cache.chave !== k) {
        var o = {};
        try { o = JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { o = {}; }
        this._cache = { chave: k, trocas: T() ? T().limparTrocas(o) : {} };
      }
      return this._cache.trocas;
    },
    /* grava a troca (slug vazio = volta ao automático) e refaz as peças */
    trocar: function (nomeMaterial, slug) {
      var B = T();
      if (!B) return { ok: false, motivo: "O motor de texturas não carregou." };
      var k = B.chaveMaterial(nomeMaterial);
      if (!k) return { ok: false, motivo: "O material não tem nome." };
      if (slug && slug !== "#cor" && slug !== "#vidro" && !B.existe(slug)) return { ok: false, motivo: "Essa textura não está na biblioteca." };
      var atual = this.trocasAtuais(), tr = {};
      Object.keys(atual).forEach(function (x) { tr[x] = atual[x]; });
      if (slug) tr[k] = slug; else delete tr[k];
      try { localStorage.setItem(this.chave(), JSON.stringify(tr)); }
      catch (e) { return { ok: false, motivo: "Não consegui gravar neste aparelho (armazenamento cheio)." }; }
      this._cache = { chave: this.chave(), trocas: tr };
      var n = 0;
      try { n = (bim() && bim().estiloRedecidir) ? bim().estiloRedecidir() : 0; } catch (e2) { n = 0; }
      return { ok: true, pecas: n };
    },

    /* --------------------------------------------------------- o seletor */
    estado: function () { try { return (bim() && bim().estiloVisualEstado) ? bim().estiloVisualEstado() : null; } catch (e) { return null; } },
    rotulo: function () { var e = this.estado(); return nomeModo(e ? e.modo : "sombreado"); },
    escolher: function (modo) {
      var b = bim();
      if (!b || !b.estiloVisual) return Promise.resolve(null);
      var nome = nomeModo(modo);
      status(modo === "realista" || modo === "textura" ? "Estilo " + nome + ": carregando as texturas…" : "Estilo " + nome + ".");
      return b.estiloVisual(modo).then(function (st) {
        if (!st) return st;
        var tx = st.texturas || {};
        if (st.modo === "linha") status("Linha oculta — " + Math.round(st.arestas.segmentos).toLocaleString("pt-BR") + " arestas" + (st.arestas.pulados ? " (" + st.arestas.pulados + " peça(s) densa(s) sem contorno)" : "") + ".");
        else if (st.modo === "textura" || st.modo === "realista") {
          status(nome + " — " + (tx.vestidos || 0) + " material(is) com textura" + (tx.erros && tx.erros.length ? "; não carregou: " + tx.erros.join(", ") : "") +
            (st.modo === "realista" && !st.sombras ? " (sem sombra: modelo pesado demais)" : "") + ".");
        } else status("Sombreado — a cor de cada material.");
        return st;
      });
    },
    _fecharMenu: function () {
      var m = document.querySelector(".rv-menu-estilo");
      if (m && m.parentNode) m.parentNode.removeChild(m);
    },
    /* o menu, junto de quem o abriu */
    menu: function (ancora) {
      if (!previa()) return false;
      var self = this;
      this._fecharMenu();
      var atual = (this.estado() || {}).modo || "sombreado";
      var desenho = false;
      try { desenho = !!(bim() && bim().estiloDesenhoAtivo && bim().estiloDesenhoAtivo()); } catch (e) {}
      var m = document.createElement("div");
      m.className = "rv-menu-doc rv-menu-estilo";
      m.setAttribute("role", "menu");
      m.setAttribute("aria-label", "Estilo visual");
      var h = '<div class="rv-me-tit">Estilo visual</div>';
      MODOS.forEach(function (o) {
        var on = o.id === atual && !desenho;
        h += '<button type="button" role="menuitemradio" aria-checked="' + (on ? "true" : "false") + '" data-estilo="' + o.id + '">' +
          '<span class="rv-me-amostra" data-amostra="' + o.id + '"></span><span class="rv-me-txt"><b>' + esc(o.nome) + "</b><small>" + esc(o.dica) + "</small></span></button>";
      });
      h += '<div class="rv-me-sep"></div><button type="button" role="menuitemcheckbox" aria-checked="' + (desenho ? "true" : "false") + '" data-estilo="desenho">' +
        '<span class="rv-me-amostra" data-amostra="desenho"></span><span class="rv-me-txt"><b>Desenho (massa cinza)</b><small>O da planta: tudo cinza com arestas, sem as cores.</small></span></button>';
      m.innerHTML = h;
      document.body.appendChild(m);
      var r = ancora && ancora.getBoundingClientRect ? ancora.getBoundingClientRect() : { left: 80, bottom: 80, top: 80 };
      var mr = m.getBoundingClientRect(), W = global.innerWidth || 1200, H = global.innerHeight || 800;
      var top = r.bottom + 4; if (top + mr.height > H - 6) top = Math.max(6, r.top - mr.height - 4);
      m.style.left = Math.max(6, Math.min(r.left, W - mr.width - 6)) + "px";
      m.style.top = top + "px";
      Array.prototype.forEach.call(m.querySelectorAll("button[data-estilo]"), function (b) {
        b.onclick = function () {
          var id = b.getAttribute("data-estilo");
          self._fecharMenu();
          if (id === "desenho") { try { bim().estiloDesenho(!desenho); } catch (e) {} status(desenho ? "Desenho (massa cinza) desligado." : "Desenho: massa cinza com arestas, como na planta."); return; }
          self.escolher(id);
        };
      });
      var foco = m.querySelector('button[aria-checked="true"]') || m.querySelector("button");
      try { if (foco) foco.focus(); } catch (e) {}
      m.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") { ev.preventDefault(); self._fecharMenu(); try { if (ancora) ancora.focus(); } catch (e) {} return; }
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          var bs = Array.prototype.slice.call(m.querySelectorAll("button")), i = bs.indexOf(document.activeElement);
          i = (i + (ev.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length; bs[i].focus();
        }
      });
      setTimeout(function () {
        document.addEventListener("pointerdown", function fora(ev) {
          if (!m.contains(ev.target)) { self._fecharMenu(); document.removeEventListener("pointerdown", fora, true); }
        }, true);
      }, 0);
      return true;
    },

    /* ------------------------------------------------ Propriedades da peça */
    secaoProps: function (info) {
      if (!previa() || !info || !info.uid) return [];
      var b = bim(), B = T();
      if (!b || !b.materialDaPeca || !B) return [];
      var md = null;
      try { md = b.materialDaPeca(info.uid); } catch (e) { md = null; }
      if (!md) return [];
      var self = this;
      var porque = md.fonte === "troca" ? " (trocada nesta obra)" : (md.fonte === "propriedade" ? " (do IFC)" : (md.termo ? ' (pelo nome: "' + md.termo + '")' : ""));
      var params = [{ id: "mat-tex", rotulo: "Textura", leitura: true, valor: md.nomeTextura ? md.nomeTextura + porque : "só a cor do material" }];
      if (!md.materiais.length) params.push({ id: "mat-sem", rotulo: "Material", leitura: true, valor: "a peça não traz material" });
      var opcoes = [{ id: "", rotulo: "Automático (pelo nome)" }];
      B.catalogo().forEach(function (c) { c.itens.forEach(function (it) { opcoes.push({ id: it.slug, rotulo: it.nome, grupo: c.nome }); }); });
      md.materiais.slice(0, 6).forEach(function (mt, i) {
        params.push({ id: "mat-troca-" + i, rotulo: mt.nome, tipo: "lista", opcoes: opcoes, valor: mt.troca || "",
          aoMudar: function (v) {
            var r = self.trocar(mt.nome, v);
            if (!r.ok) { try { if (global.UI && UI.toast) UI.toast(r.motivo, "erro"); } catch (e) {} return; }
            status(v ? "Textura de \"" + mt.nome + "\" nesta obra: " + B.nomeDe(v) + " (" + r.pecas + " peça(s) refeita(s))." : "\"" + mt.nome + "\" volta ao automático (" + r.pecas + " peça(s)).");
          } });
      });
      var st = this.estado();
      if (st && st.modo !== "textura" && st.modo !== "realista") {
        params.push({ id: "mat-ver", rotulo: "Ver no 3D", tipo: "botao", rotuloBotao: "Estilo Textura", fn: function () { self.escolher("textura"); } });
      }
      return [{ nome: "Material e textura", params: params }];
    }
  };

  /* o botão da barra das vistas acompanha o estilo, venha a troca de onde vier */
  try {
    global.addEventListener("bim:estilo", function () {
      var nome = BimEstilo.rotulo();
      Array.prototype.forEach.call(document.querySelectorAll("[data-rv-estilo] span"), function (s) { s.textContent = nome; });
    });
  } catch (e) {}

  global.BimEstilo = BimEstilo;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEstilo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
