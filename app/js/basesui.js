/* =====================================================================
 * basesui.js — a TABELA de bancos de preço do Passo 3 (Base | Local |
 * Versão | Situação), agrupada por região.
 *
 * Só monta STRING. Sem DOM, sem fetch, sem estado global — assim o gate
 * confere o HTML no Node (tools/test-basesui.js) em vez de depender de
 * navegador para saber se uma linha vazou um checkbox que não devia.
 *
 * ⚠ NENHUMA AÇÃO DAQUI PODE CHAMAR UI.modal — e isto é a regra mais
 * importante do arquivo. `UI.modal()` começa com `this.fecharModal()`
 * incondicional (js/ui.js:64) e `fecharModal()` faz `m.remove()` direto
 * (js/ui.js:127). A guarda `temTrabalhoNaoSalvo` só é consultada no clique
 * do véu e do ✕ (js/ui.js:101-103), NUNCA no caminho programático. Ou seja:
 * um botãozinho inocente aqui ("atualizar", "importar planilha") arrancaria
 * o modal do assistente e levaria junto tudo que o usuário digitou nos
 * passos 1 e 2 — descrição, cliente, licitação, BDI — sem uma linha de
 * aviso. Por isso a coluna Situação só tem TEXTO e chips informativos.
 *
 * ⚠ LINHA SEM FONTE NÃO GANHA `data-base`. Os 15 bancos do mercado que
 * ainda não distribuímos são exibidos (o cliente merece ver o mapa), mas
 * sem checkbox e sem o atributo que o coletor de seleção procura. Não é um
 * `if` de UI: é a ausência do gancho. Sem `data-base`, não há por onde
 * vazar banco fantasma para a denylist do orçamento nem para o cabeçalho
 * de um laudo em licitação.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) {
    if (typeof Util !== "undefined" && Util.esc) return Util.esc(String(s == null ? "" : s));
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nfmt(n) {
    n = Number(n) || 0;
    try { return n.toLocaleString("pt-BR"); } catch (e) { return String(n); }
  }

  var BasesUI = {
    /* ----------------------------------------------------------------
     * ESTADO INICIAL — quais linhas nascem marcadas.
     *
     * A régua é a DENYLIST, igual à de hoje: banco instalado entra marcado
     * a menos que este orçamento o tenha excluído. Banco não instalado
     * nasce desmarcado (marcar = "instale e use"), exceto a SINAPI, que é
     * obrigatória e nem tem como desmarcar.
     *
     * ⚠ UNIÃO com Bases.lista(), não só o catálogo. Uma base que o cliente
     * IMPORTOU (planilha do órgão, o caminho que a própria tela recomenda
     * para os 15 ausentes) não está no catálogo — e sem esta união ela
     * sumiria do Passo 3 e ficaria impossível de tirar de um orçamento.
     * O dado é real; a honestidade proíbe inventar, não proíbe listar o
     * que o cliente carregou com as próprias mãos.
     * ---------------------------------------------------------------- */
    estadoInicial: function (ctx, excluidas) {
      ctx = ctx || {};
      var inst = ctx.instaladas || {};
      var neg = {};
      (excluidas || []).forEach(function (f) { neg[String(f).toUpperCase()] = 1; });
      var linhas = [], vistos = {};

      BasesCat.CATALOGO.forEach(function (e) {
        var av = BasesCat.avaliar(e, ctx);
        vistos[e.id] = 1;
        linhas.push({
          catId: e.id,
          fora: false,
          // SINAPI é obrigatória; as outras seguem a denylist
          marcada: e.principal ? true : (av.instalada && !neg[e.id]),
          // a variante da base JÁ instalada vence o padrão do catálogo:
          // reabrir o passo não pode trocar o preço que já está carregado
          sel: (inst[e.id] && inst[e.id].sel) || BasesCat.selPadrao(e.id, ctx)
        });
      });
      /* bases instaladas que o catálogo não conhece (importadas pelo cliente) */
      Object.keys(inst).forEach(function (f) {
        if (vistos[f]) return;
        linhas.push({ catId: f, fora: true, marcada: !neg[f], sel: null });
      });
      return { linhas: linhas, mostrarAusentes: false };
    },

    linhaDe: function (st, catId) {
      for (var i = 0; i < st.linhas.length; i++) { if (st.linhas[i].catId === catId) return st.linhas[i]; }
      return null;
    },

    /* ----------------------------------------------------------------
     * O <select> de um eixo (Local, Regime, Preço).
     * Recebe o valor CRU no `value` e mostra o rótulo bonito — mandar o
     * rótulo para o lookup faria o preço voltar como o do padrão, em
     * silêncio (as chaves de precos[] do SETOP são "Triangulo", sem acento).
     * ---------------------------------------------------------------- */
    _select: function (entrada, eixo, valor, ctx, ligada) {
      var ops = BasesCat.opcoesDoEixo(entrada, eixo, ctx);
      if (!ops.length) return "";
      /* o Local do SINAPI mantém o id `ow-uf`: é ele que o assistente preenche
         com os estados do manifesto (orcwizard.js:469) e que o _criar lê para
         decidir se precisa recarregar a base. Trocar o id aqui quebraria os
         dois caminhos sem que nada acusasse. */
      var idFixo = (entrada.principal && eixo.id === "uf") ? ' id="ow-uf"' : "";
      var h = '<select class="p3-sel"' + idFixo + ' data-eixo="' + esc(eixo.id) + '" data-eixo-base="' + esc(entrada.id) + '"' +
        (ligada ? "" : " disabled") +
        ' aria-label="' + esc(eixo.rotulo + " de " + entrada.nome) + '">';
      ops.forEach(function (o) {
        h += '<option value="' + esc(o.v) + '"' + (String(o.v) === String(valor) ? " selected" : "") + ">" + esc(o.r || o.v) + "</option>";
      });
      return h + "</select>";
    },

    /* Uma linha da tabela. `pronta` = tem fonte; sem isso não há checkbox
       nem data-base, e os selects saem desabilitados. */
    _linha: function (e, st, ctx) {
      var self = this;
      var av = BasesCat.avaliar(e, ctx);
      var lin = this.linhaDe(st, e.id) || { marcada: false, sel: null };
      var pronta = av.podeUsar;
      var marcada = pronta && lin.marcada;
      var fixa = !!e.principal;   // SINAPI: sempre ligada, não desmarca

      /* coluna 1 — Base */
      var c1 = '<td class="p3-c-base">';
      if (pronta) {
        c1 += '<label class="p3-marca"><input type="checkbox" data-base="' + esc(e.id) + '"' +
          (marcada ? " checked" : "") + (fixa ? " disabled" : "") +
          ' aria-label="usar ' + esc(e.nome) + ' neste orçamento"> ' +
          '<b>' + esc(e.nome) + "</b></label>";
      } else {
        // sem checkbox e SEM data-base: não existe gancho para marcar
        c1 += '<span class="p3-marca p3-off"><b>' + esc(e.nome) + "</b></span>";
      }
      c1 += '<small title="' + esc(e.orgao) + '">' + esc(e.orgao) + "</small>";
      if (av.instalada) c1 += '<small class="p3-itens">' + nfmt(av.itensInstalados) + " itens instalados</small>";
      else if (pronta && e.itens) c1 += '<small class="p3-itens">' + nfmt(e.itens) + " itens</small>";
      c1 += "</td>";

      /* coluna 2 — Local */
      var c2 = '<td class="p3-c-local">';
      /* Eixo só vira <select> quando há escolha REAL a fazer — um select de
         uma opção só é ruído (é o caso do SICRO enquanto o servidor não
         responde com as UFs que tem). A exceção é o Local do SINAPI: ele
         SEMPRE existe porque o assistente o preenche depois, quando o
         manifesto de estados chega (orcwizard.js:469). */
      var eixos = (e.eixos || []).filter(function (x) {
        if (e.principal && x.id === "uf") return true;
        return BasesCat.opcoesDoEixo(e, x, ctx).length > 1;
      });
      if (pronta && eixos.length) {
        eixos.forEach(function (ex) {
          // `somenteMarcar` = tela de ⚙ Parâmetros: lá dá para ligar/desligar
          // o banco neste orçamento, mas NÃO trocar a variante — isso é efeito
          // global (uma cópia por banco) e quem sabe perguntar é o assistente
          c2 += self._select(e, ex, (lin.sel || {})[ex.id], ctx, marcada && !st.somenteMarcar);
        });
      } else {
        c2 += '<span class="p3-fixo">' + esc(e.localRotulo || e.uf || "—") + "</span>";
      }
      c2 += "</td>";

      /* coluna 3 — Versão. Só a SINAPI tem select (as competências realmente
         instaladas); trocar a competência de um banco COMPARTILHADO dentro do
         assistente de UM orçamento seria efeito global disparado de tela
         local. Os outros mostram o que está instalado. */
      var c3 = '<td class="p3-c-versao">';
      if (fixa) {
        c3 += '<select id="ow-comp" class="p3-sel" aria-label="competência do SINAPI"><option value="' + esc(av.versao) + '">' + esc(BasesCat.fmtVersao(av.versao)) + "</option></select>" +
          '<small class="ow-hint" id="ow-comp-hint"></small>';
      } else if (pronta) {
        c3 += '<span class="p3-versao">' + esc(BasesCat.fmtVersao(av.versao) || "—") + "</span>";
        if (av.versaoOrigem === "pacote") c3 += '<small>vem no app</small>';
        if (av.temNova) c3 += '<small class="p3-nova">há ' + esc(BasesCat.fmtVersao(av.versaoServidor)) + ' no servidor — atualize em Tabelas</small>';
      } else {
        c3 += '<span class="p3-fixo">—</span>';
      }
      c3 += "</td>";

      /* coluna 4 — Situação. As DUAS verdades, separadas: como a RA produz
         o dado e como ele chega neste computador. */
      var c4 = '<td class="p3-c-sit"><span class="p3-selo p3-g' + av.grau + '">' + esc(av.rotulo) + "</span>";
      if (av.coletaServidor) c4 += "<small>" + esc(av.coletaServidor) + "</small>";
      if (av.atualizacaoCliente) c4 += "<small>" + esc(av.atualizacaoCliente) + "</small>";
      if (av.nota) c4 += '<small class="p3-nota" title="' + esc(av.nota) + '">' + esc(av.nota) + "</small>";
      c4 += "</td>";

      return '<tr class="p3-lin' + (marcada ? " p3-on" : "") + (pronta ? "" : " p3-ausente") + '" data-lin="' + esc(e.id) + '">' + c1 + c2 + c3 + c4 + "</tr>";
    },

    /* Linha de banco AUSENTE (os 15 do mercado sem fonte nossa). Sem
       checkbox, sem data-base, sem select — e dizendo o caminho honesto. */
    _linhaAusente: function (a) {
      return '<tr class="p3-lin p3-ausente" data-lin="' + esc(a.id) + '">' +
        '<td class="p3-c-base"><span class="p3-marca p3-off"><b>' + esc(a.nome) + "</b></span>" +
        '<small title="' + esc(a.orgao) + '">' + esc(a.orgao) + "</small></td>" +
        '<td class="p3-c-local"><span class="p3-fixo">' + esc(a.uf) + "</span></td>" +
        '<td class="p3-c-versao"><span class="p3-fixo">—</span></td>' +
        '<td class="p3-c-sit"><span class="p3-selo p3-g1">Ainda não distribuímos</span>' +
        "<small>Dá para usar hoje: importe a planilha oficial do órgão em Tabelas, depois de criar o orçamento.</small></td></tr>";
    },

    /* Linha de base que o CLIENTE importou (está instalada, fora do catálogo). */
    _linhaFora: function (b, st) {
      var lin = this.linhaDe(st, b.fonte) || { marcada: true };
      return '<tr class="p3-lin' + (lin.marcada ? " p3-on" : "") + '" data-lin="' + esc(b.fonte) + '">' +
        '<td class="p3-c-base"><label class="p3-marca"><input type="checkbox" data-base="' + esc(b.fonte) + '"' + (lin.marcada ? " checked" : "") +
        ' aria-label="usar ' + esc(b.label || b.fonte) + ' neste orçamento"> <b>' + esc(b.label || b.fonte) + "</b></label>" +
        '<small>Importada por você</small><small class="p3-itens">' + nfmt(b.total) + " itens</small></td>" +
        '<td class="p3-c-local"><span class="p3-fixo">' + esc(b.uf || "—") + "</span></td>" +
        '<td class="p3-c-versao"><span class="p3-versao">' + esc(BasesCat.fmtVersao(b.competencia) || "—") + "</span></td>" +
        '<td class="p3-c-sit"><span class="p3-selo p3-g2">Instalada</span><small>Você mantém esta base atualizada.</small></td></tr>';
    },

    /* ----------------------------------------------------------------
     * A TABELA INTEIRA.
     * ---------------------------------------------------------------- */
    tabela: function (st, ctx, listaInstalada) {
      ctx = ctx || {};
      var self = this;
      var h = '<div class="p3-wrap"><table class="p3-tab"><thead><tr>' +
        "<th>Base</th><th>Local</th><th>Versão</th><th>Situação</th></tr></thead>";

      BasesCat.REGIOES.forEach(function (reg) {
        var doGrupo = BasesCat.CATALOGO.filter(function (e) { return e.regiao === reg.id; });
        var ausGrupo = st.mostrarAusentes ? BasesCat.AUSENTES.filter(function (a) { return a.regiao === reg.id; }) : [];
        if (!doGrupo.length && !ausGrupo.length) return;
        var n = doGrupo.length + ausGrupo.length;
        h += '<tbody class="p3-grupo"><tr class="p3-cab"><td colspan="4">' + esc(reg.titulo) +
          ' <small>' + n + (n === 1 ? " banco" : " bancos") + "</small></td></tr>";
        doGrupo.forEach(function (e) { h += self._linha(e, st, ctx); });
        ausGrupo.forEach(function (a) { h += self._linhaAusente(a); });
        h += "</tbody>";
      });

      /* bases importadas pelo cliente — grupo próprio, no fim */
      var fora = (listaInstalada || []).filter(function (b) {
        return b.fonte !== "SINAPI" && !BasesCat.get(b.fonte);
      });
      if (fora.length) {
        h += '<tbody class="p3-grupo"><tr class="p3-cab"><td colspan="4">Instaladas por você <small>' + fora.length +
          (fora.length === 1 ? " banco" : " bancos") + "</small></td></tr>";
        fora.forEach(function (b) { h += self._linhaFora(b, st); });
        h += "</tbody>";
      }

      h += "</table>";
      var nAus = BasesCat.AUSENTES.length;
      h += '<button type="button" class="p3-toggle" data-p3-toggle="1">' +
        (st.mostrarAusentes ? "Ocultar" : "Ver") + " os " + nAus + " bancos que ainda não distribuímos</button>";
      h += '<p class="p3-rodape">Desmarcar tira o banco da <b>busca de itens</b> deste orçamento — não desinstala nada e não afeta os outros orçamentos. Banco instalado depois entra sozinho.</p>';
      return h + "</div>";
    },

    /* Quantos MB este passo vai baixar: só o que está MARCADO e ainda NÃO
       instalado. Marcar uma base que já está no computador não soma nada —
       prometer download que não vai acontecer é ruído. */
    plano: function (st, ctx) {
      var mb = 0, baixar = [];
      (st.linhas || []).forEach(function (l) {
        if (!l.marcada || l.fora) return;
        var e = BasesCat.get(l.catId); if (!e) return;
        var av = BasesCat.avaliar(e, ctx);
        if (!av.podeUsar || av.instalada) return;
        baixar.push(l.catId);
        mb += Number(e.pesoMb) || 0;
      });
      return { baixar: baixar, mb: Math.round(mb * 10) / 10 };
    },

    /* O que o assistente grava: marcadas (com variante) e a DENYLIST.
       ⚠ Só entra na denylist banco que EXISTE e foi desmarcado. Banco sem
       fonte não tem data-base, então nunca chega aqui — e banco silenciado
       por UF não pode ser confundido com "o usuário não quis". */
    coletar: function (st, ctx) {
      var usar = [], excluir = [];
      var inst = (ctx && ctx.instaladas) || {};
      (st.linhas || []).forEach(function (l) {
        var e = BasesCat.get(l.catId);
        var pode = l.fora || (e && BasesCat.avaliar(e, ctx).podeUsar);
        if (!pode) return;
        if (l.catId === "SINAPI") return;         // obrigatória, não entra em lista nenhuma
        if (l.marcada) { usar.push({ catId: l.catId, sel: l.sel || null }); return; }
        /* ⚠ SÓ ENTRA NA DENYLIST BANCO QUE ESTÁ INSTALADO.
           A tabela nova mostra o catálogo inteiro, inclusive o que ainda não
           foi instalado — e desmarcado é o estado NATURAL desses. Jogá-los na
           denylist quebraria a promessa que o próprio rodapé faz ("banco
           instalado depois entra sozinho"): o cliente instalaria o IOPES
           semanas depois e ele não apareceria neste orçamento, sem nenhuma
           pista do porquê. Desmarcar só significa "não use" para o que já
           está no computador; para o resto, não instalar já é não usar. */
        if (inst[l.catId] || l.fora) excluir.push(l.catId);
      });
      return { usar: usar, excluir: excluir };
    }
  };

  global.BasesUI = BasesUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BasesUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
