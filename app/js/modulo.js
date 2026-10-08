/* =====================================================================
 * modulo.js — O PADRÃO DE TELA DE MÓDULO (kit único, 08/10/2026)
 *
 * Pedido do Rogério: "cada módulo está de um jeito — o Last Planner de um,
 * o orçamento de outro. Tem que ter um padrão, um roteiro, para TODOS os
 * módulos: organizado, sem coisa repetida, sem poluição". O roteiro está em
 * ROTEIRO-MODULO.md; este arquivo é a ÚNICA fonte das peças que toda tela
 * usa, na ordem fixa:
 *
 *   cab (cabeçalho) → aviso (no máx. 1) → filtros → kpis → abas → seções/tabela
 *
 * Regras que as funções impõem sozinhas (para não depender de disciplina):
 *  - cabeçalho: ícone + título + 1 linha de contexto; à direita o seletor de
 *    obra (sempre no mesmo lugar), no máx. 2 ações secundárias visíveis, o
 *    resto num menu "Mais", e UMA ação primária, sempre por último;
 *  - indicadores: uma faixa só, no máx. 5, mesmo desenho em todo módulo;
 *  - texto que vem de dado é escapado; HTML só entra pelos campos `*Html`.
 * Os botões que vão para o "Mais" continuam no DOM com o mesmo id e o mesmo
 * clique (só mudam de lugar) — quem os liga por id, inclusive as e2e, segue
 * funcionando.
 * Motor de texto puro (devolve HTML), Node-testável: tools/test-modulo.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MAX_ACOES = 2, MAX_KPIS = 5;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function icone(nome, tam) {
    /* ⚠ O ÍCONE DO MÓDULO É O DO MENU LATERAL (ROTEIRO §2), e esse desenho
       mora no js/gestao.js (ICON, o mesmo `svg(id)` da barra), não no
       js/icones.js. Sem esta ponte, `icone: "financeiro"` não achava nada e o
       cabeçalho desenhava a caixa de 40 px VAZIA — e "relatorios" achava um
       desenho diferente do menu. Primeiro o do menu; o resto (nomes de ação:
       "obra", "nota"…) segue no js/icones.js. */
    try { if (nome && global.Gestao && Gestao.iconeModulo) { var m = Gestao.iconeModulo(nome, tam || 20); if (m) return m; } } catch (e0) {}
    try { if (nome && global.Icones && Icones.get) return Icones.get(nome, tam || 20) || ""; } catch (e) {}
    return "";
  }

  var Modulo = {
    MAX_ACOES: MAX_ACOES, MAX_KPIS: MAX_KPIS,

    /* CABEÇALHO.
       o = { icone | iconeHtml, titulo, sub, obraHtml, acoes:[html de <button>…], primariaHtml, id }
       `acoes` na ordem de importância: as MAX_ACOES primeiras ficam à vista,
       as outras vão para o menu "Mais". */
    cab: function (o) {
      o = o || {};
      /* separador (Modulo.SEP) nunca ocupa lugar à vista: só agrupa o "Mais" */
      var acoes = (o.acoes || []).filter(Boolean), vis = [], mais = [];
      acoes.forEach(function (a) { if (a !== Modulo.SEP && vis.length < MAX_ACOES) vis.push(a); else mais.push(a); });
      mais = Modulo._limparSep(mais);
      var h = '<header class="mod-cab"' + (o.id ? ' id="' + esc(o.id) + '"' : "") + ">";
      /* `iconeHtml` (08/10/2026): o ícone do MENU LATERAL não mora no
         Icones — é o mapa `ICON` privado do gestao.js (svg(id)). Sem esta porta
         o cabeçalho não conseguia cumprir "ícone = o mesmo do menu" (§2 do
         roteiro), e `icone` com nome que o Icones não conhece desenhava a
         moldura de 40 px vazia. */
      h += '<div class="mod-tit">' + (o.iconeHtml || o.icone ? '<span class="mod-ic" aria-hidden="true">' + (o.iconeHtml || icone(o.icone, 22)) + "</span>" : "") +
        "<div><h1>" + esc(o.titulo) + "</h1>" + (o.sub || o.subHtml ? '<p class="mod-sub">' + (o.subHtml || esc(o.sub)) + "</p>" : "") + "</div></div>";
      if (o.obraHtml || acoes.length || o.primariaHtml) {
        h += '<div class="mod-lado">';
        if (o.obraHtml) h += '<div class="mod-obra">' + o.obraHtml + "</div>";
        h += '<div class="mod-acoes">' + vis.join("");
        if (mais.length) h += Modulo.mais(mais);
        if (o.primariaHtml) h += o.primariaHtml;
        h += "</div></div>";
      }
      return h + "</header>";
    },
    /* menu "Mais": os botões continuam inteiros (id e clique), só escondidos */
    mais: function (itens, rotulo) {
      return '<div class="mod-mais"><button type="button" class="btn mod-mais-bt" aria-haspopup="menu" aria-expanded="false">' + esc(rotulo || "Mais") +
        '<span class="mod-mais-seta" aria-hidden="true">▾</span></button><div class="mod-mais-menu" role="menu" hidden>' +
        Modulo._limparSep(itens).map(function (b) {
          return b === Modulo.SEP ? '<div class="mod-mais-sep" role="separator"></div>' : '<div class="mod-mais-item" role="menuitem">' + b + "</div>";
        }).join("") + "</div></div>";
    },
    /* SEPARADOR do menu "Mais" (08/10/2026): o editor de orçamento guarda 12
       ações; em grupos (arquivo · proposta · ferramentas) acha-se de olho.
       Use Modulo.SEP entre os grupos na lista de `acoes`. */
    SEP: "-",
    _limparSep: function (itens) {
      var out = [];
      (itens || []).filter(Boolean).forEach(function (b) {
        if (b === Modulo.SEP && (!out.length || out[out.length - 1] === Modulo.SEP)) return;   /* sem separador no início nem dobrado */
        out.push(b);
      });
      while (out.length && out[out.length - 1] === Modulo.SEP) out.pop();
      return out;
    },

    /* PÍLULA DE STATUS (08/10/2026): cada módulo pintava a sua com cor escrita
       em linha. Tons fixos, pelos tokens: ok (pago, concluído), alerta
       (pendente, vencendo), erro (atrasado, recusado), info (em andamento),
       neutro (rascunho, sem situação). */
    pilula: function (texto, tom) {
      var t = /^(ok|alerta|erro|info|neutro)$/.test(tom || "") ? tom : "neutro";
      return '<span class="mod-pil mod-pil-' + t + '">' + esc(texto) + "</span>";
    },

    /* INDICADORES: [{ rotulo, valor, sub, tom: ''|'pos'|'neg'|'alerta'|'info', id, valorHtml }] */
    kpis: function (lista, o) {
      lista = (lista || []).filter(Boolean);
      if (lista.length > MAX_KPIS && !(o && o.semTeto)) lista = lista.slice(0, MAX_KPIS);
      return '<div class="mod-kpis" data-n="' + lista.length + '">' + lista.map(function (k) {
        var tom = /^(pos|neg|alerta|info)$/.test(k.tom || "") ? " mod-kpi-" + k.tom : "";
        return '<div class="mod-kpi' + tom + '"' + (k.id ? ' id="' + esc(k.id) + '"' : "") + ">" +
          '<span class="mod-kpi-r">' + esc(k.rotulo) + "</span>" +
          '<b class="mod-kpi-v">' + (k.valorHtml || esc(k.valor == null ? "—" : k.valor)) + "</b>" +
          (k.sub || k.subHtml ? '<span class="mod-kpi-s">' + (k.subHtml || esc(k.sub)) + "</span>" : "") + "</div>";
      }).join("") + "</div>";
    },

    /* FILTROS: uma barra só (campos em HTML, já com seus ids) */
    filtros: function (camposHtml, o) {
      o = o || {};
      return '<div class="mod-filtros"' + (o.id ? ' id="' + esc(o.id) + '"' : "") + ">" + (camposHtml || []).filter(Boolean).join("") +
        (o.direitaHtml ? '<div class="mod-filtros-dir">' + o.direitaHtml + "</div>" : "") + "</div>";
    },

    /* ABAS acessíveis (teclado): [{ id, rotulo, ativa, attrs }] */
    abas: function (lista, o) {
      return '<div class="tabs mod-abas" role="tablist"' + (o && o.id ? ' id="' + esc(o.id) + '"' : "") + ">" + (lista || []).map(function (a) {
        return '<div class="tab' + (a.ativa ? " ativa" : "") + '" role="tab" tabindex="0" aria-selected="' + (a.ativa ? "true" : "false") + '"' +
          (a.id ? ' data-aba="' + esc(a.id) + '"' : "") + (a.attrs ? " " + a.attrs : "") + ">" + (a.icone ? icone(a.icone, 16) : "") + esc(a.rotulo) + "</div>";
      }).join("") + "</div>";
    },

    /* SEÇÃO (cartão com título): { titulo, sub, acoesHtml, corpoHtml, id, classe } */
    secao: function (o) {
      o = o || {};
      return '<section class="mod-sec' + (o.classe ? " " + esc(o.classe) : "") + '"' + (o.id ? ' id="' + esc(o.id) + '"' : "") + ">" +
        (o.titulo ? '<div class="mod-sec-cab"><div><h2>' + esc(o.titulo) + "</h2>" + (o.sub ? '<p class="mod-sub">' + esc(o.sub) + "</p>" : "") + "</div>" +
          (o.acoesHtml ? '<div class="mod-sec-acoes">' + o.acoesHtml + "</div>" : "") + "</div>" : "") +
        '<div class="mod-sec-corpo">' + (o.corpoHtml || "") + "</div></section>";
    },

    /* AVISO (no máx. um no topo): { tom: 'info'|'alerta'|'erro'|'ok', titulo, texto, textoHtml, acaoHtml } */
    aviso: function (o) {
      o = o || {};
      var tom = /^(info|alerta|erro|ok)$/.test(o.tom || "") ? o.tom : "info";
      return '<div class="mod-aviso mod-aviso-' + tom + '" role="' + (tom === "erro" ? "alert" : "status") + '">' +
        '<div class="mod-aviso-txt">' + (o.titulo ? "<b>" + esc(o.titulo) + "</b>" : "") + (o.textoHtml || (o.texto ? "<span>" + esc(o.texto) + "</span>" : "")) + "</div>" +
        (o.acaoHtml ? '<div class="mod-aviso-acao">' + o.acaoHtml + "</div>" : "") + "</div>";
    },

    /* ESTADO VAZIO: { icone, titulo, texto, acaoHtml } */
    vazio: function (o) {
      o = o || {};
      return '<div class="mod-vazio">' + (o.icone ? '<span class="mod-vazio-ic" aria-hidden="true">' + icone(o.icone, 28) + "</span>" : "") +
        "<b>" + esc(o.titulo || "Nada por aqui ainda") + "</b>" + (o.texto ? "<p>" + esc(o.texto) + "</p>" : "") + (o.acaoHtml || "") + "</div>";
    },

    /* liga o menu "Mais" (uma vez, por delegação no documento) */
    ligar: function (doc) {
      doc = doc || (typeof document !== "undefined" ? document : null);
      if (!doc || doc._modLigado) return;
      doc._modLigado = true;
      function fechar(exceto) {
        Array.prototype.forEach.call(doc.querySelectorAll(".mod-mais-menu:not([hidden])"), function (m) {
          if (m === exceto) return;
          m.hidden = true; var b = m.parentNode.querySelector(".mod-mais-bt"); if (b) b.setAttribute("aria-expanded", "false");
        });
      }
      doc.addEventListener("click", function (e) {
        var bt = e.target && e.target.closest ? e.target.closest(".mod-mais-bt") : null;
        if (bt) {
          var menu = bt.parentNode.querySelector(".mod-mais-menu"), abrir = menu.hidden;
          fechar(menu); menu.hidden = !abrir; bt.setAttribute("aria-expanded", abrir ? "true" : "false");
          return;
        }
        /* clique num item: o botão faz o que sempre fez, e o menu fecha */
        fechar(null);
      });
      doc.addEventListener("keydown", function (e) {
        if (e.key === "Escape") fechar(null);
        /* aba por teclado: Enter/Espaço ativam como o clique */
        if ((e.key === "Enter" || e.key === " ") && e.target && e.target.getAttribute && e.target.getAttribute("role") === "tab") { e.preventDefault(); e.target.click(); }
      });
    }
  };

  global.Modulo = Modulo;
  if (typeof document !== "undefined") { try { Modulo.ligar(document); } catch (e) {} }
  if (typeof module !== "undefined" && module.exports) module.exports = Modulo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
