/* =====================================================================
 * modelaui.js — a tela do OrçaPRO Modela (fiação fina sobre js/modela.js).
 *
 *  - o SELO na barra de título do BIM: "Modela · teste: 5 dias",
 *    "Modela · Hidráulica", "Modela · teste encerrado"… Clique abre o aviso.
 *  - o AVISO (modal): teste terminado / disciplina não contratada, a lista
 *    das disciplinas com o que está liberado e o botão Comprar, que leva à
 *    página da loja (/modelagem?plano=…).
 *  ⚠ origem=play (app da Google Play): NENHUM botão nem link de compra — a
 *    política da loja não deixa vender por fora dela. Só texto informativo.
 *
 * A regra de quem tem direito NÃO mora aqui (js/modela.js). Esta tela só
 * pinta o que o motor responde; `rotulo()` e `aviso()` são puros (testáveis).
 * ===================================================================== */
(function (global) {
  "use strict";
  function M() { return global.Modela || null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function data(ms) { try { return new Date(ms).toLocaleDateString("pt-BR"); } catch (e) { return ""; } }
  function nome(id) { var m = M(); return m ? m.nome(id) : id; }
  function dias(n) { return n + (n === 1 ? " dia" : " dias"); }

  var ModelaUI = {
    /* o texto do selo para um status (puro) */
    rotulo: function (s) {
      if (!s) return "";
      if (s.motivo === "demo") return "Modela · demonstração";
      if (s.motivo === "vitalicia") return "Modela · completo";
      if (s.motivo === "teste") return "Modela · teste: " + dias(Math.max(1, s.teste.dias));
      if (s.motivo === "teste-disponivel") return "Modela · teste de 7 dias";
      if (s.motivo === "compra") {
        if (s.completo) return "Modela · completo";
        if (s.disciplinas.length <= 2) return "Modela · " + s.disciplinas.map(nome).join(" + ");
        return "Modela · " + s.disciplinas.length + " disciplinas";
      }
      if (s.motivo === "revalidar") return "Modela · conecte à internet";
      return "Modela · teste encerrado";
    },

    /* o conteúdo do aviso (puro): { titulo, html, comprar: url|"" } */
    aviso: function (s, disc, url) {
      var m = M(), linhas = [], t = "OrçaPRO Modela", abre;
      disc = disc ? String(disc).toLowerCase() : "";
      if (disc && s.disciplinas.indexOf(disc) < 0) {
        abre = "A disciplina <b>" + esc(nome(disc)) + "</b> não está no seu OrçaPRO Modela.";
      } else if (s.motivo === "teste") {
        abre = "Você está no teste do OrçaPRO Modela completo: faltam <b>" + dias(Math.max(1, s.teste.dias)) +
          "</b> (até " + esc(data(s.teste.fim)) + "). Depois do teste ficam liberadas só as disciplinas contratadas.";
      } else if (s.motivo === "revalidar") {
        abre = "O OrçaPRO Modela precisa confirmar a sua contratação com o servidor. Conecte à internet e abra o BIM de novo.";
      } else if (!s.liberado) {
        abre = "Seu teste do OrçaPRO Modela terminou. A modelagem (paredes, lajes, famílias, instalações, pranchas e render) " +
          "é contratada por disciplina ou no pacote completo.";
      } else {
        abre = "A modelagem (paredes, lajes, famílias, instalações, pranchas e render) é contratada por disciplina ou no pacote completo.";
      }
      linhas.push("<p>" + abre + "</p>");
      var li = (m ? m.DISCIPLINAS : []).map(function (d) {
        var ate = s.compradas && s.compradas[d.id];
        var st = s.completo && s.motivo !== "compra" ? (s.motivo === "teste" ? "no teste" : "liberada")
          : (ate ? "contratada até " + data(ate) : "não contratada");
        return "<li><b>" + esc(d.nome) + "</b> — " + esc(st) + "</li>";
      }).join("");
      linhas.push("<p style=\"margin-top:10px\">Disciplinas:</p><ul style=\"margin:4px 0 0 18px\">" + li + "</ul>");
      var comprar = "";
      if (s.play) {
        linhas.push("<p style=\"margin-top:10px;opacity:.85\">Este aplicativo não faz contratações. As disciplinas liberadas para a sua conta aparecem aqui sozinhas.</p>");
      } else if (s.podeComprar && url) {
        comprar = url;
      }
      return { titulo: t, html: linhas.join(""), comprar: comprar };
    },

    abrirAviso: function (disc) {
      var m = M(); if (!m) return false;
      var s = m.status();
      var plano = disc && m.IDS.indexOf(String(disc).toLowerCase()) >= 0 ? "modela_" + String(disc).toLowerCase() + "_mensal" : "modela_completo_mensal";
      var a = this.aviso(s, disc, s.podeComprar ? m.urlCompra(plano) : "");
      var bts = [{ texto: "Fechar", classe: "ghost", onClick: function () { try { global.UI.fecharModal(); } catch (e) {} } }];
      if (a.comprar) bts.push({ texto: "Comprar", classe: "primary", onClick: function () {
        try { global.open(a.comprar, "_blank", "noopener"); } catch (e) {}
        try { global.UI.fecharModal(); } catch (e2) {}
      } });
      try {
        if (global.UI && global.UI.modal) { global.UI.modal(a.titulo, a.html, bts); return true; }
      } catch (e) {}
      return false;
    },

    /* o selo na barra de título do BIM (chamado ao montar a tela do BIM) */
    montarSelo: function (raiz) {
      var m = M(); if (!m || !raiz || !raiz.querySelector || !global.document) return null;
      var alvo = raiz.querySelector(".rv-titulo-nome") || raiz.querySelector(".rv-titulo") || null;
      if (!alvo) return null;
      var velho = alvo.querySelector(".modela-selo"); if (velho) velho.remove();
      var b = global.document.createElement("button");
      b.type = "button"; b.className = "modela-selo";
      b.style.cssText = "margin-left:10px;padding:2px 9px;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;opacity:.8;font-size:11px;cursor:pointer;white-space:nowrap";
      var self = this;
      function pintar() {
        var s = m.status();
        b.textContent = self.rotulo(s);
        b.title = "OrçaPRO Modela — ver as disciplinas liberadas";
        b.setAttribute("data-modela", s.motivo);
      }
      b.onclick = function () { self.abrirAviso(); };
      pintar();
      alvo.appendChild(b);
      try {
        if (self._pintar) global.removeEventListener("orcapro:modela", self._pintar);
        self._pintar = pintar; global.addEventListener("orcapro:modela", pintar);
      } catch (e) {}
      /* pede o status novo; teste terminado sem compra avisa uma vez por sessão */
      m.atualizar(function () {
        pintar();
        var s = m.status();
        if (!s.liberado && !s.demo) {
          var ja = false; try { ja = global.sessionStorage.getItem("orcapro:modela:avisado") === "1"; global.sessionStorage.setItem("orcapro:modela:avisado", "1"); } catch (e) {}
          if (!ja) self.abrirAviso();
        }
      });
      return b;
    }
  };

  global.ModelaUI = ModelaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = ModelaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
