/* =====================================================================
 * busca-ui.js — Overlay da Busca universal (Ctrl+K)
 * "Pule pra qualquer obra, orçamento ou ação digitando."
 * Motor: js/busca.js (puro). Aqui: fontes do Store + overlay + teclado.
 * ===================================================================== */
(function () {
  "use strict";

  var BuscaUI = {
    _sel: 0, _res: [], _aberto: false,

    /* Monta as fontes pesquisáveis a partir do estado atual (barato: só ao abrir).
     * RBAC/plano LEVADOS A SÉRIO (achado do gate v1.1.63): sub-usuário só indexa o
     * que Auth.podeModulo permite; sem plano de gestão (Gestao.podeGestao) as
     * entidades de gestão ficam FORA — guard em função, não só esconder botão. */
    _pode: function (mod) { return !(typeof Auth !== "undefined" && Auth.podeModulo) || Auth.podeModulo(mod); },
    fontes: function () {
      var f = [], self = this;
      var logado = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario());
      if (!logado) return f;
      var eid = Auth.empresaId();
      var podeGestao = (typeof Gestao !== "undefined" && Gestao.podeGestao) ? Gestao.podeGestao() : false;

      // ações rápidas (primeiro no ranking por tipo)
      f.push({ tipo: "acao", id: "novo-orcamento", titulo: "Novo Orçamento", subtitulo: "criar um orçamento em branco", palavras: "criar novo adicionar" });
      if (typeof Tour !== "undefined") f.push({ tipo: "acao", id: "tour", titulo: "Rever o tour guiado", subtitulo: "conheça o sistema em 60 segundos", palavras: "ajuda tutorial guia" });
      // backup é ação de DONO (sub-usuário não tem o menu — sem beco sem saída)
      if (logado.papel !== "usuario") f.push({ tipo: "acao", id: "backup", titulo: "Backup dos dados", subtitulo: "exportar ou restaurar", palavras: "exportar salvar restaurar seguranca" });

      // módulos (nome real da sidebar, já respeitando RBAC) + aliases da linguagem
      // do canteiro (quem digita "diário" quer o RDO; "cronograma" mora no orçamento)
      var ALIAS = {
        orcamentos: "orçamento cronograma proposta planilha sinapi bdi excel",
        rdo: "diário diario de obra ocorrências clima",
        medicoes: "medição boletim aprovação faturamento",
        lastplanner: "last planner ppc semana restrições lookahead lean",
        folhasemanal: "folha diaristas pix pagamento semanal",
        previstoreal: "custo previsto real comparativo desvio",
        bim: "3d ifc modelo maquete 4d 5d clash reunião quantitativos",
        financeiro: "contas pagar receber caixa",
        fiscal: "nota nf-e xml imposto",
        galeria: "fotos imagens obra",
        ponto: "cartão de ponto folha espelho faltas",
        epi: "equipamento proteção ficha ca",
        insumos: "banco de insumos materiais preços"
      };
      if (typeof Gestao !== "undefined" && Gestao.modulos) {
        Gestao.modulos.forEach(function (m) {
          // sem plano de gestão, listar módulo de gestão é beco sem saída (o render
          // devolve pro Orçamentos calado) — plano base vê só orçamentos + ajuda
          if (!podeGestao && m.id !== "orcamentos" && m.id !== "ajuda") return;
          if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo(m.id)) return;
          f.push({ tipo: "modulo", id: m.id, titulo: m.nome, subtitulo: "módulo", palavras: m.id + " " + (ALIAS[m.id] || "") });
        });
      }

      // orçamentos (respeitando RBAC do módulo). cliente/obra são OBJETOS {nome}
      // no schema v3 (string só em dado legado) — revisão do líder.
      var nomeDe = function (v) { return (v && typeof v === "object") ? (v.nome || "") : (v || ""); };
      if (this._pode("orcamentos")) {
        try {
          (Store.listar(eid, "orcamentos") || []).forEach(function (o) {
            var cli = nomeDe(o.cliente), obr = nomeDe(o.obra);
            f.push({ tipo: "orcamento", id: o.id, titulo: (o.numero ? o.numero + " · " : "") + (o.nome || "Sem nome"), subtitulo: cli || obr || "orçamento", palavras: cli + " " + obr + " " + (o.uf || "") });
          });
        } catch (e) {}
      }

      // entidades de gestão (abrem direto no registro via Gestao.abrir) —
      // cada entidade exige o RBAC do MÓDULO dela (ids coincidem)
      if (podeGestao && typeof Gestao !== "undefined") {
        var puxar = function (ent, tipo, tit, sub) {
          if (!self._pode(ent)) return; // sub-usuário sem o módulo não vê nem o título
          try {
            (Store.listar(eid, ent) || []).forEach(function (r) {
              var t = tit(r); if (!t) return;
              f.push({ tipo: tipo, id: ent + ":" + r.id, titulo: t, subtitulo: sub(r), palavras: "" });
            });
          } catch (e) {}
        };
        puxar("obras", "obra", function (r) { return r.nome; }, function (r) { return "obra" + (r.clienteNome ? " · " + r.clienteNome : ""); });
        puxar("clientes", "cliente", function (r) { return r.nome; }, function (r) { return "cliente" + (r.cidade ? " · " + r.cidade : ""); });
        puxar("contratos", "contrato", function (r) { return r.numero ? "Contrato " + r.numero : null; }, function (r) { return r.clienteNome || "contrato"; });
        puxar("colaboradores", "colaborador", function (r) { return r.nome; }, function (r) { return r.funcao || "colaborador"; });
      }
      return f;
    },

    abrir: function () {
      if (this._aberto) { this.fechar(); return; }
      var logado = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario());
      if (!logado || typeof Busca === "undefined") return;
      this._indice = Busca.indexar(this.fontes());
      this._sel = 0; this._res = [];
      var ov = document.getElementById("busca-ov");
      if (!ov) {
        ov = document.createElement("div"); ov.id = "busca-ov";
        ov.innerHTML = '<div class="busca-caixa" role="dialog" aria-label="Busca universal">' +
          '<div class="busca-topo"><span class="busca-lupa">🔍</span>' +
          '<input id="busca-inp" type="text" placeholder="Buscar obra, orçamento, módulo ou ação…" autocomplete="off" spellcheck="false">' +
          '<span class="busca-esc">Esc</span></div>' +
          '<div id="busca-res" class="busca-res"></div>' +
          '<div class="busca-dica">↑↓ navegar · Enter abrir · <b>Ctrl+K</b> abre de qualquer tela</div></div>';
        document.body.appendChild(ov);
        var self = this;
        ov.addEventListener("mousedown", function (e) { if (e.target === ov) self.fechar(); });
        var inp = document.getElementById("busca-inp");
        inp.addEventListener("input", function () { self._buscar(this.value); });
        inp.addEventListener("keydown", function (e) {
          if (e.key === "ArrowDown") { e.preventDefault(); self._mover(1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); self._mover(-1); }
          else if (e.key === "Enter") { e.preventDefault(); self._executar(self._res[self._sel]); }
          else if (e.key === "Escape") { self.fechar(); }
        });
        document.getElementById("busca-res").addEventListener("click", function (e) {
          var it = e.target.closest("[data-bidx]"); if (it) self._executar(self._res[parseInt(it.dataset.bidx, 10)]);
        });
      }
      ov.style.display = "flex"; this._aberto = true;
      var input = document.getElementById("busca-inp");
      input.value = ""; this._buscar("");
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
    },

    fechar: function () {
      var ov = document.getElementById("busca-ov");
      if (ov) ov.style.display = "none";
      this._aberto = false;
    },

    _buscar: function (q) {
      this._res = Busca.buscar(this._indice, q, 12);
      // sem consulta: sugestões úteis (ações + módulos mais comuns)
      if (!this._res.length && !String(q || "").trim()) {
        var vistos = 0, sug = [];
        for (var i = 0; i < this._indice.itens.length && vistos < 8; i++) {
          var it = this._indice.itens[i];
          if (it.tipo === "acao" || it.tipo === "modulo") { sug.push({ tipo: it.tipo, id: it.id, titulo: it.titulo, subtitulo: it.subtitulo, score: 0 }); vistos++; }
        }
        this._res = sug;
      }
      this._sel = 0; this._render();
    },

    _mover: function (d) {
      if (!this._res.length) return;
      this._sel = (this._sel + d + this._res.length) % this._res.length;
      this._render();
    },

    _render: function () {
      var el = document.getElementById("busca-res"); if (!el) return;
      var ICO = { acao: "⚡", modulo: "🧩", orcamento: "📋", obra: "🏗️", cliente: "👤", contrato: "📄", colaborador: "👷" };
      var self = this, h = "";
      if (!this._res.length) h = '<div class="busca-vazio">Nada encontrado — tente outro termo.</div>';
      this._res.forEach(function (r, i) {
        h += '<div class="busca-item' + (i === self._sel ? " on" : "") + '" data-bidx="' + i + '">' +
          '<span class="busca-ico">' + (ICO[r.tipo] || "•") + "</span>" +
          '<span class="busca-tit">' + Util.esc(r.titulo) + "</span>" +
          '<span class="busca-sub">' + Util.esc(r.subtitulo || "") + "</span></div>";
      });
      el.innerHTML = h;
      var on = el.querySelector(".busca-item.on");
      if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
    },

    _executar: function (r) {
      if (!r) return;
      this.fechar();
      if (r.tipo === "acao") {
        if (r.id === "novo-orcamento" && typeof App !== "undefined") { App.irPara("orcamentos"); App.novoOrcamento(); }
        else if (r.id === "tour" && typeof Tour !== "undefined") Tour.iniciar(true);
        else if (r.id === "backup") { var b = document.querySelector('[data-acao="backup"]'); if (b) b.click(); else if (typeof UI !== "undefined") UI.toast("Abra ⚙ (menu da conta) → 💾 Backup.", "ok"); }
        return;
      }
      if (r.tipo === "modulo" && typeof App !== "undefined") { App.irPara(r.id); return; }
      if (r.tipo === "orcamento" && typeof App !== "undefined") { App.irPara("orcamentos"); App.abrirOrcamento(r.id); return; }
      // entidades: "ent:id" → navega e abre o registro (re-checa RBAC na hora do clique)
      var p = String(r.id).split(":");
      if (p.length === 2 && typeof App !== "undefined" && typeof Gestao !== "undefined") {
        if (!this._pode(p[0])) { if (typeof UI !== "undefined") UI.toast("Sem permissão para este módulo.", "erro"); return; }
        App.irPara(p[0]);
        setTimeout(function () { try { Gestao.abrir(p[0], p[1]); } catch (e) {} }, 60);
      }
    }
  };

  if (typeof window !== "undefined") window.BuscaUI = BuscaUI;
})();
