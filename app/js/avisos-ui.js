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
      var vazio = { medicoes: [], tarefas: [], restricoes: [], contratos: [], obras: [], compras: [] };
      if (!(typeof Gestao !== "undefined" && Gestao.podeGestao && Gestao.podeGestao())) return vazio;
      var eid = Auth.empresaId(), self = this;
      /* ⚠ mesmo motivo da busca: le o Store direto, fora do funil. O sino
         contava medicao e tarefa de obra alheia. */
      var l = function (ent, mod) { if (!self._pode(mod || ent)) return []; try {
        var arr = Store.listar(eid, ent) || [];
        return (typeof Gestao !== "undefined" && Gestao.filtrarPorObra) ? Gestao.filtrarPorObra(ent, arr) : arr;
      } catch (e) { return []; } };
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
      /* ⚠ QUEM SOU EU. O alerta de diário é PESSOAL: "devolvido para VOCÊ" e
       * "aguardando SUA aprovação". Sem a identidade da sessão, o motor não
       * tem como filtrar e mostraria trabalho alheio para todo mundo — o que
       * é pior que não mostrar nada, porque o alerta perde o sentido.
       * A sessão identifica por `usuarioId` (sub-usuário) ou `email` (dono);
       * NÃO existe `.id` — o mesmo campo que já deixou o RDO sem autoria. */
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      var eu = (typeof RDO !== "undefined" && RDO.idDoUsuario)
        ? RDO.idDoUsuario(u) : String(u.usuarioId || u.email || "").trim().toLowerCase();
      return {
        medicoes: l("medicoes"), tarefas: tarefas, restricoes: restricoes,
        contratos: contratos, obras: l("obras", "obras"),
        rdos: l("rdo"),
        /* compras: o sino avisa atraso e fornecedor sem resposta — só quem tem
           o módulo Compras vê (mesma régua da lista) */
        compras: l("compras"),
        eu: eu,
        /* mesma régua de RDO.podeAcao: admin/gestor, ou aprovador nomeado */
        souAprovador: (u.papel !== "usuario") || u.aprovador === true,
        /* os atrasos do cronograma das obras (planejador, 1C): do CACHE —
           montar o painel de cada obra custa ~27 ms e o badge é pedido a
           cada render (ver `_crono`) */
        crono: self._cronoGrupos(eid)
      };
    },

    /* =====================================================================
     * CRONOGRAMA DAS OBRAS NO SINO (planejador, fatia 1C; USO §1.6 e §3.4)
     * ⚠ O BADGE SÓ LÊ O CACHE. O painel de uma obra (a MESMA montagem do chip
     *   e da ficha, App._cronoPainelDados) mede ~27 ms, e `contar()` roda a
     *   cada render. O cache é refeito: ao abrir o sino; 60 s depois do boot;
     *   a cada 5 min com a janela visível; na volta do segundo plano depois de
     *   5 min; e 2 s depois de o cronograma ser gravado. Em FATIAS: uma obra
     *   por `setTimeout(0)` — 20 obras não travam o clique.
     * ⚠ Só obras "Em andamento", com orçamento, que a pessoa pode ver
     *   (decisão D23/k9). O corte é sempre o último diário.
     * ===================================================================== */
    _crono: { em: null, itens: [], pronto: false, conferindo: false, conferidas: 0, total: 0, gen: 0, de: "" },
    _hojeISO: function () {
      var d = new Date();
      return d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
    },
    _cronoLigado: function () {
      if (typeof CronoAlertas === "undefined" || typeof App === "undefined" || typeof App._cronoAlertasObra !== "function") return false;
      if (!(typeof Gestao !== "undefined" && Gestao.podeGestao && Gestao.podeGestao())) return false;
      if (!this._pode("obras")) return false;
      try { if (typeof Cronograma !== "undefined" && Cronograma.recursos && Cronograma.recursos().sino === false) return false; } catch (e) {}
      return true;
    },
    _cronoObras: function (eid) {
      var l = [];
      try { l = Store.listar(eid, "obras") || []; } catch (e) { l = []; }
      if (typeof Gestao !== "undefined" && Gestao.filtrarPorObra) { try { l = Gestao.filtrarPorObra("obras", l); } catch (e2) {} }
      return l.filter(function (o) {
        if (!o || !o.id || !o.orcamentoId || String(o.status || "") !== "andamento") return false;
        return !(typeof Auth !== "undefined" && Auth.podeObra && !Auth.podeObra(o.id));
      });
    },
    /* a chave da pessoa e da empresa: o "dispensado" é POR APARELHO E POR
       PESSOA, nunca em `prefs` (que sincroniza e deixa o local vencer) —
       molde do js/paineis.js, com o hash e sem e-mail em claro */
    _cronoChaveLocal: function () {
      var eid = "", em = "";
      try { eid = Auth.empresaId() || ""; var u = Auth.usuario ? Auth.usuario() : null; em = (u && (u.email || u.usuarioId)) || ""; } catch (e) {}
      var h = (typeof Paineis !== "undefined" && Paineis.hashUsuario) ? Paineis.hashUsuario(eid, em) : String(eid).length + "-" + String(em).length;
      return "orcapro:tela:avisos-crono:v1:" + h;
    },
    _cronoDispensas: function () {
      try { var raw = window.localStorage.getItem(this._cronoChaveLocal()); var o = raw ? JSON.parse(raw) : {}; return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; }
      catch (e) { return {}; }
    },
    _cronoDispensar: function (chaves, niveis) {
      if (typeof CronoAlertas === "undefined") return;
      var hoje = this._hojeISO(), d = CronoAlertas.podarDispensas(this._cronoDispensas(), hoje);
      (chaves || []).forEach(function (k, i) { d[k] = CronoAlertas.marcaDispensa({ nivel: niveis ? niveis[i] : 0 }, hoje); });
      try { window.localStorage.setItem(this._cronoChaveLocal(), JSON.stringify(d)); } catch (e) {}
    },
    _cronoGrupos: function (eid) {
      if (!this._cronoLigado()) return [];
      this._cronoIniciar();
      /* troca de empresa: o cache é de outra conta */
      if (this._crono.de !== String(eid || "")) return [];
      return CronoAlertas.agrupar(this._crono.itens, this._cronoDispensas(), this._hojeISO()).grupos;
    },
    /* REFAZ O CACHE, em fatias. `cb` roda no fim. Uma rodada nova cancela a
       anterior (`gen`). Falha numa obra vira o item "não consegui conferir"
       (CronoAlertas.daObra) — nunca silêncio. */
    recalcularCrono: function (cb) {
      var self = this, st = this._crono;
      if (!this._cronoLigado() || typeof Auth === "undefined" || !Auth.usuario || !Auth.usuario()) { if (cb) cb(); return; }
      var eid = Auth.empresaId(), obras = this._cronoObras(eid), gen = ++st.gen, itens = [], i = 0, hoje = this._hojeISO();
      st.conferindo = true; st.conferidas = 0; st.total = obras.length;
      function passo() {
        if (gen !== st.gen) return;
        if (i >= obras.length) {
          st.itens = itens; st.pronto = true; st.conferindo = false; st.em = new Date().toISOString(); st.de = String(eid || "");
          if (cb) { try { cb(); } catch (eC) {} }
          self._cronoAtualizarBadge();
          return;
        }
        var ob = obras[i++];
        try { itens = itens.concat(App._cronoAlertasObra(ob, hoje) || []); }
        catch (e) { itens = itens.concat(CronoAlertas.daObra({ obra: ob, painel: null, hoje: hoje })); }
        st.conferidas = i;
        setTimeout(passo, 0);
      }
      setTimeout(passo, 0);
    },
    agendarCrono: function (ms) {
      var self = this;
      if (!this._cronoLigado()) return;
      clearTimeout(this._cronoEspera);
      this._cronoEspera = setTimeout(function () { self.recalcularCrono(); }, Math.max(0, Number(ms) || 0));
    },
    _cronoIniciar: function () {
      if (this._cronoIniciado || typeof window === "undefined") return;
      this._cronoIniciado = true;
      var self = this, CINCO = 5 * 60 * 1000;
      this.agendarCrono(60000);
      setInterval(function () {
        if (document.visibilityState && document.visibilityState !== "visible") return;
        self.recalcularCrono();
      }, CINCO);
      if (document.addEventListener) document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") return;
        var em = self._crono.em ? new Date(self._crono.em).getTime() : 0;
        if (Date.now() - em >= CINCO) self.recalcularCrono();
      });
    },
    /* o número do badge, sem redesenhar a tela */
    _cronoAtualizarBadge: function () {
      try {
        var btn = document.querySelector("[data-avisos-abrir]"); if (!btn) return;
        var n = this.contar(), b = btn.querySelector(".aviso-badge");
        if (!n) { if (b) b.parentNode.removeChild(b); }
        else {
          if (!b) { b = document.createElement("span"); b.className = "aviso-badge"; btn.appendChild(b); }
          b.textContent = n > 99 ? "99+" : String(n);
        }
        var dr = document.getElementById("avisos-drop");
        if (dr) this._desenhar(dr);
      } catch (e) {}
    },

    _calcular: function () {
      if (typeof Avisos === "undefined" || typeof Auth === "undefined" || !Auth.usuario || !Auth.usuario()) return { total: 0, grupos: [] };
      /* ⚠ data LOCAL, não UTC. `toISOString()` no fuso −3 já está no dia
         seguinte a partir das 21h (−5, no Acre, a partir das 19h) — e é este
         "hoje" que decide vencimento de EPI, obra atrasada e prazo de tarefa.
         À noite os avisos passavam a contar um dia a mais do que o calendário
         de quem estava olhando a tela. */
      try {
        var d = new Date();
        var hoje = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
          + "-" + String(d.getDate()).padStart(2, "0");
        return Avisos.calcular(this._dados(), hoje);
      }
      catch (e) { return { total: 0, grupos: [] }; }
    },

    /* Nº pro badge da topbar (chamado no render — barato). */
    contar: function () { return this._calcular().total; },

    abrir: function () {
      var drop = document.getElementById("avisos-drop");
      if (drop) { drop.parentNode.removeChild(drop); return; } // toggle
      drop = document.createElement("div"); drop.id = "avisos-drop";
      this._desenhar(drop);
      document.body.appendChild(drop);
      /* abrir o sino RECONFERE os cronogramas (o cache pode ter 5 min): o que
         já está no cache aparece na hora, com o rodapé "conferindo" */
      var selfA = this;
      if (this._cronoLigado()) {
        this.recalcularCrono(function () { var d = document.getElementById("avisos-drop"); if (d) selfA._desenhar(d); });
        this._desenhar(drop);
      }
      // posiciona sob o sino
      var btn = document.querySelector("[data-avisos-abrir]");
      if (btn) {
        var b = btn.getBoundingClientRect();
        drop.style.top = (b.bottom + 8) + "px";
        drop.style.right = Math.max(8, window.innerWidth - b.right) + "px";
      }
      drop.addEventListener("click", function (e) {
        /* "Dispensar por 7 dias" vem ANTES do item (o botão mora dentro dele) */
        var ds = e.target.closest("[data-crono-dispensar]");
        if (ds) {
          e.stopPropagation();
          var cks = [], nvs = [];
          try { cks = JSON.parse(ds.getAttribute("data-crono-dispensar")); nvs = JSON.parse(ds.getAttribute("data-crono-niveis") || "[]"); } catch (eJ) { cks = []; }
          AvisosUI._cronoDispensar(cks, nvs);
          AvisosUI._cronoAtualizarBadge();
          return;
        }
        var cr = e.target.closest("[data-crono-aviso]");
        if (cr && typeof App !== "undefined") {
          var ac = null;
          try { ac = JSON.parse(cr.getAttribute("data-crono-aviso")); } catch (eA) { ac = null; }
          AvisosUI.fechar();
          if (ac && App.cronoAbrirDoAviso) App.cronoAbrirDoAviso(ac);
          return;
        }
        var it = e.target.closest("[data-aview]");
        if (it && typeof App !== "undefined") { AvisosUI.fechar(); App.irPara(it.dataset.aview); }
      });
      setTimeout(function () {
        document.addEventListener("mousedown", AvisosUI._fora);
      }, 0);
    },

    /* o conteúdo da central (redesenhado quando o cronograma termina de ser
       conferido). ⚠ Texto do disco sempre por Util.esc; a ação do cronograma
       vai num atributo JSON escapado, nunca num `onclick` (memória "XSS por
       aspas em onclick"). */
    _desenhar: function (drop) {
      if (!drop) return;
      var r = this._calcular(), st = this._crono, lig = this._cronoLigado();
      var tx = (lig && typeof CronoAlertas !== "undefined") ? CronoAlertas.textos(st) : null;
      var I = (typeof Icones !== "undefined") ? Icones : null;
      var h = '<div class="avisos-cab"><b>' + (I ? I.get("sino", 15) : "") + ' Central de avisos</b><span>' + (r.total ? r.total + " item(ns) pedindo atenção" : (lig && !st.pronto ? "conferindo…" : "tudo em dia")) + "</span></div>";
      if (!r.total) h += '<div class="avisos-zen">' + (I ? I.get("check", 15) : "") + " " + Util.esc(tx ? tx.zen : "Nenhuma pendência: medições, tarefas e restrições em dia.") + "</div>";
      r.grupos.forEach(function (g) {
        h += '<div class="avisos-grp">' + Util.esc(g.rotulo) + "</div>";
        g.itens.slice(0, 8).forEach(function (it) {
          if (it.crono) {
            var chs = it.chaves || [it.chave], nvs = it.niveis || [it.nivel];
            h += '<div class="avisos-item avisos-crono" data-crono-aviso="' + Util.esc(JSON.stringify(it.acao || {})) + '" tabindex="0"><b>' + Util.esc(it.titulo) + "</b>" +
              (it.detalhe ? "<small>" + Util.esc(it.detalhe) + "</small>" : "") +
              '<button type="button" class="avisos-dispensar" data-crono-dispensar="' + Util.esc(JSON.stringify(chs)) + '" data-crono-niveis="' + Util.esc(JSON.stringify(nvs)) +
              '" title="Some por 7 dias neste aparelho; volta antes se piorar 2 dias úteis">Dispensar por 7 dias</button></div>';
            return;
          }
          h += '<div class="avisos-item" data-aview="' + Util.esc(it.view) + '"><b>' + Util.esc(it.titulo) + "</b>" + (it.detalhe ? "<small>" + Util.esc(it.detalhe) + "</small>" : "") + "</div>";
        });
        if (g.itens.length > 8) {
          h += g.crono ? '<div class="avisos-mais">+ ' + (g.itens.length - 8) + " obra(s) — abra o módulo Cronograma da obra</div>"
            : '<div class="avisos-mais" data-aview="' + Util.esc(g.itens[0].view) + '">+ ' + (g.itens.length - 8) + " — ver todos no módulo</div>";
        }
      });
      if (tx && tx.rodape) h += '<div class="avisos-rodape">' + Util.esc(tx.rodape) + "</div>";
      drop.innerHTML = h;
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
