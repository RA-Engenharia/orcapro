/* =====================================================================
 * avisos-ui.js — Sino da Central de avisos (topbar)
 * "Medições a aprovar, tarefas atrasadas e restrições num sino só."
 * Motor: js/avisos.js (puro). Aqui: coleta do Store + badge + dropdown.
 * ===================================================================== */
(function () {
  "use strict";

  var AvisosUI = {
    /* Snapshot dos dados reais → formato do motor. Nunca lança.
     * RBAC/plano LEVADOS A SÉRIO (achado do gate v1.1.63): cada fonte só entra se o
     * usuário tem o MÓDULO dela; sem plano de gestão o sino não lê nada de gestão. */
    _pode: function (mod) { return !(typeof Auth !== "undefined" && Auth.podeModulo) || Auth.podeModulo(mod); },
    _dados: function () {
      var vazio = { medicoes: [], tarefas: [], restricoes: [], contratos: [], obras: [] };
      if (!(typeof Gestao !== "undefined" && Gestao.podeGestao && Gestao.podeGestao())) return vazio;
      var eid = Auth.empresaId(), self = this;
      var l = function (ent, mod) { if (!self._pode(mod || ent)) return []; try { return Store.listar(eid, ent) || []; } catch (e) { return []; } };
      // tarefas do app usam status afazer/fazendo/FEITA/cancelada → motor espera boolean
      var tarefas = l("tarefas").map(function (t) {
        return { id: t.id, titulo: t.titulo, prazo: t.prazo, obraId: t.obraId, concluida: (t.status === "feita" || t.status === "concluida" || t.status === "cancelada") };
      });
      // restrições moram DENTRO das tarefas do Last Planner (status do LP é "feito")
      var restricoes = [];
      l("lp_tarefas", "lastplanner").forEach(function (t) {
        if (!t || t.status === "feito") return;
        (t.restricoes || []).forEach(function (r) {
          if (!r || r.removida || r.resolvida) return;
          restricoes.push({ id: (t.id || "") + ":" + (r.id || ""), desc: r.descricao || r.desc || "Restrição", status: "aberta", prazo: r.prazo, obraId: t.obraId });
        });
      });
      // contratos: schema do app grava termino/numero — motor lê fim/titulo (revisão do líder)
      var contratos = l("contratos").map(function (c) {
        return { id: c.id, titulo: "Contrato " + (c.numero || ""), fim: c.termino, status: c.status };
      });
      return { medicoes: l("medicoes"), tarefas: tarefas, restricoes: restricoes, contratos: contratos, obras: l("obras", "obras") };
    },

    _calcular: function () {
      if (typeof Avisos === "undefined" || typeof Auth === "undefined" || !Auth.usuario || !Auth.usuario()) return { total: 0, grupos: [] };
      try { return Avisos.calcular(this._dados(), new Date().toISOString().slice(0, 10)); }
      catch (e) { return { total: 0, grupos: [] }; }
    },

    /* Nº pro badge da topbar (chamado no render — barato). */
    contar: function () { return this._calcular().total; },

    abrir: function () {
      var drop = document.getElementById("avisos-drop");
      if (drop) { drop.parentNode.removeChild(drop); return; } // toggle
      var r = this._calcular();
      drop = document.createElement("div"); drop.id = "avisos-drop";
      var h = '<div class="avisos-cab"><b>🔔 Central de avisos</b><span>' + (r.total ? r.total + " item(ns) pedindo atenção" : "tudo em dia") + "</span></div>";
      if (!r.total) h += '<div class="avisos-zen">✅ Nenhuma pendência: medições, tarefas e restrições em dia.</div>';
      r.grupos.forEach(function (g) {
        h += '<div class="avisos-grp">' + Util.esc(g.rotulo) + "</div>";
        g.itens.slice(0, 8).forEach(function (it) {
          h += '<div class="avisos-item" data-aview="' + Util.esc(it.view) + '"><b>' + Util.esc(it.titulo) + "</b>" + (it.detalhe ? "<small>" + Util.esc(it.detalhe) + "</small>" : "") + "</div>";
        });
        if (g.itens.length > 8) h += '<div class="avisos-mais" data-aview="' + Util.esc(g.itens[0].view) + '">+ ' + (g.itens.length - 8) + " — ver todos no módulo</div>";
      });
      drop.innerHTML = h;
      document.body.appendChild(drop);
      // posiciona sob o sino
      var btn = document.querySelector("[data-avisos-abrir]");
      if (btn) {
        var b = btn.getBoundingClientRect();
        drop.style.top = (b.bottom + 8) + "px";
        drop.style.right = Math.max(8, window.innerWidth - b.right) + "px";
      }
      drop.addEventListener("click", function (e) {
        var it = e.target.closest("[data-aview]");
        if (it && typeof App !== "undefined") { AvisosUI.fechar(); App.irPara(it.dataset.aview); }
      });
      setTimeout(function () {
        document.addEventListener("mousedown", AvisosUI._fora);
      }, 0);
    },

    _fora: function (e) {
      var drop = document.getElementById("avisos-drop");
      if (drop && !drop.contains(e.target) && !(e.target.closest && e.target.closest("[data-avisos-abrir]"))) AvisosUI.fechar();
    },

    fechar: function () {
      var drop = document.getElementById("avisos-drop");
      if (drop) drop.parentNode.removeChild(drop);
      document.removeEventListener("mousedown", AvisosUI._fora);
    }
  };

  if (typeof window !== "undefined") window.AvisosUI = AvisosUI;
})();
