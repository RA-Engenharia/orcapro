/* =====================================================================
 * orcamentistaui.js — TELA E FLUXO do Agente Orçamentista (v1.2.83).
 *
 * O motor (js/orcamentista.js) é puro; aqui mora o que precisa de DOM,
 * Store, Bases, Analitico e rede. Dois pontos de entrada:
 *   · App.orcamentistaDaImportacao()  — depois de ler a planilha (modal de
 *     importação): casa, precifica, elabora e CRIA o orçamento.
 *   · App.orcamentistaDoOrcamento()   — num orçamento aberto: pega os itens
 *     sem preço (ou todos) e aplica as decisões nos itens existentes.
 *
 * Passos: (1) escolher as bases e a ordem de varredura → (2) o motor roda em
 * fatias com barra de progresso → (3) revisão item a item (trocar candidato,
 * deixar pendente, ver a composição elaborada, refinar com IA) → (4) aplicar:
 * composições próprias vão para a base PROPRIA (com insumos e coeficientes,
 * espelhadas para a nuvem) e os itens recebem código/fonte/preço com a
 * rastreabilidade em `item.orcamentista`.
 * ===================================================================== */
(function (global) {
  "use strict";
  if (typeof App === "undefined" || typeof UI === "undefined") return;

  var ic = function (n, s) { return (typeof Icones !== "undefined" && Icones.get) ? Icones.get(n, s || 15) : ""; };
  var esc = function (s) { return Util.esc(String(s == null ? "" : s)); };

  var ROTULO = { casado: "Casado", revisar: "Revisar", propria: "Própria", pendente: "Pendente" };
  var COR = { casado: "#16a34a", revisar: "#f59e0b", propria: "#2e6f9e", pendente: "#dc2626" };
  var VIA = { codigo: "código na base declarada", "codigo-inferido": "código nas bases", "descricao-exata": "descrição idêntica", descricao: "descrição parecida", "analogia-oficial": "análoga oficial", analogia: "composição própria (analogia)", ia: "escolha da IA", nenhum: "sem correspondência" };

  /* ---------------- UI: configuração ---------------- */
  UI.renderOrcamentistaConfig = function (st) {
    var lista = (typeof Bases !== "undefined" && Bases.lista) ? Bases.lista() : [];
    lista.sort(function (a, b) { return (a.fonte === "SINAPI" ? 0 : 1) - (b.fonte === "SINAPI" ? 0 : 1); });
    var rows = lista.map(function (b) {
      var on = b.ativa !== false;
      return '<label style="display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid var(--linha);border-radius:8px;margin-bottom:6px">' +
        '<input type="checkbox" class="orcm-fonte" value="' + esc(b.fonte) + '"' + (on ? " checked" : "") + '>' +
        '<span class="pill ' + esc((b.cor || b.fonte || "").toLowerCase()) + '">' + esc(b.label || b.fonte) + '</span>' +
        '<span class="muted" style="font-size:12px">' + esc((b.competencia || "") + (b.uf ? " · " + b.uf : "")) + " · " + Util.fmtNum(b.total || 0, 0) + " itens</span>" +
        '<span style="flex:1"></span><label style="font-size:11px;display:flex;align-items:center;gap:4px">prioridade <input type="number" class="orcm-prio" data-fonte="' + esc(b.fonte) + '" min="1" max="99" value="' + (b.fonte === "SINAPI" ? 1 : 2) + '" style="width:52px;padding:2px 4px"></label></label>';
    }).join("");
    var fontesLidas = {};
    (st.etapas || []).forEach(function (e) { (e.itens || []).forEach(function (it) { if (it.fonte) fontesLidas[it.fonte] = (fontesLidas[it.fonte] || 0) + 1; }); });
    var lidas = Object.keys(fontesLidas).map(function (f) { return f + " (" + fontesLidas[f] + ")"; }).join(", ");
    /* licitação: diz ANTES de rodar que a família SINAPI é a do edital */
    var famL = (App._orcmFamiliaLic && App._orcmFamiliaLic()) || null, exL = "";
    if (famL && typeof Licitacao !== "undefined") {
      var exS = Licitacao.basesExigidas(App.orcAtual).filter(function (e) { return e.catId === famL; })[0];
      exL = '<p style="font-size:12.5px;margin:0 0 8px;padding:6px 8px;border-left:3px solid #b45309;background:rgba(234,88,12,.08)"><b>Licitação:</b> o edital exige ' +
        esc(exS ? Licitacao.fmtBase(exS) : famL) + ". Para item SINAPI o Orçamentista usa <b>só " + (famL === "SINAPI_DES" ? "a SINAPI desonerada" : "a SINAPI onerada") +
        "</b> (mesmo desmarcada abaixo) — nunca a do outro regime.</p>";
    }
    return '<p style="font-size:13px;margin:0 0 8px">O agente vai casar <b>' + st.total + ' item(ns)</b> pelo <b>código</b> (na base que a planilha declara, depois nas bases abaixo, na ordem de prioridade), depois pela <b>descrição</b>; o que não existir em nenhuma base vira <b>composição própria com insumos e coeficientes</b>, elaborada por analogia com a base analítica SINAPI.</p>' +
      exL +
      (lidas ? '<p class="muted" style="font-size:12px;margin:0 0 8px">Fontes declaradas na planilha: ' + esc(lidas) + '.</p>' : '') +
      (lista.length ? rows : '<p class="muted">Nenhuma base carregada — abra Tabelas e carregue a SINAPI ou importe a planilha do órgão.</p>') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">' +
      '<label style="font-size:12.5px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="orcm-elaborar" checked> Elaborar composição própria (analogia, com coeficientes)</label>' +
      '<label style="font-size:12.5px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="orcm-planilha-vence" checked> Preço da planilha prevalece quando existir</label>' +
      (st.modo === "orcamento" ? '<label style="font-size:12.5px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="orcm-so-sem-preco" checked> Só itens sem preço (desmarque para reprocessar todos)</label>' : '') +
      '</div>' +
      '<p class="muted" style="font-size:11px;margin:10px 0 0">Nada é inventado: sem correspondência e sem análoga, o item fica <b>pendente</b> (casca de composição própria, para você completar). Toda decisão sai com fonte, código, confiança e motivo.</p>';
  };

  /* ---------------- UI: revisão ---------------- */
  UI.renderOrcamentistaRevisao = function (st) {
    var P = st.plano || [], r = (typeof Orcamentista !== "undefined") ? Orcamentista.resumo(P) : {};
    var pill = function (k) { return '<span class="g-pill" style="background:' + COR[k] + '22;color:' + COR[k] + '">' + ROTULO[k] + ': <b>' + (r[k] || 0) + '</b></span>'; };
    var filtro = st.filtro || "todos";
    /* o recado da recusa mora DENTRO da revisão (App._orcmRecado). Nasce
       sempre, escondido quando vazio: quem escreve nele não pode depender de a
       revisão ter sido redesenhada. Texto por esc()/textContent, nunca HTML —
       por aqui passa mensagem de exceção. */
    var html = '<p id="orcm-recado" role="alert" style="color:#b91c1c;font-weight:600;font-size:12.5px;margin:0 0 8px' + (st.recado ? "" : ";display:none") + '">' + esc(st.recado || "") + "</p>";
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' + pill("casado") + pill("revisar") + pill("propria") + pill("pendente") +
      '<span class="muted" style="font-size:12.5px">' + r.total + " itens · custo direto " + Util.fmtMoeda(r.custoDireto || 0) + (r.semPreco ? " · " + r.semPreco + " sem preço" : "") + "</span>" +
      '<span style="flex:1"></span><select id="orcm-filtro" style="font-size:12px;padding:3px 6px">' +
      ["todos", "revisar", "pendente", "propria", "casado"].map(function (k) { return '<option value="' + k + '"' + (filtro === k ? " selected" : "") + ">" + (k === "todos" ? "Todos" : ROTULO[k]) + "</option>"; }).join("") + "</select></div>";
    var linhas = [];
    P.forEach(function (L) {
      if (filtro !== "todos" && L.status !== filtro) return;
      var it = L.item, opts = "";
      L.candidatos.forEach(function (c, k) {
        var lab = "[" + c.fonte + "] " + c.item.codigo + " · " + String(c.item.descricao || "").slice(0, 70) + " · " + Util.unidadeExibir(c.item.unidade || "") + " · " + Util.fmtMoeda(c.item.custoUnitario || 0) + " (" + Math.round(c.score * 100) + "%)";
        opts += '<option value="c' + k + '"' + ((L.status === "casado" || L.status === "revisar") && L.escolhido === k ? " selected" : "") + ">" + esc(lab) + "</option>";
      });
      if (L.comp && (L.comp.insumos || []).length) opts += '<option value="propria"' + (L.status === "propria" ? " selected" : "") + ">" + esc("[PRÓPRIA] " + (L.comp.codigo || "nova") + " · " + L.comp.insumos.length + " insumos · " + Util.fmtMoeda(L.custoUnitario) + "/" + Util.unidadeExibir(L.comp.unidade || it.unidade)) + "</option>";
      opts += '<option value="pendente"' + (L.status === "pendente" ? " selected" : "") + ">— Pendente (casca de composição própria, sem preço) —</option>";
      var precoPlan = Number(it.custoUnitario) > 0 ? '<div class="muted" style="font-size:11px">planilha: ' + Util.fmtMoeda(it.custoUnitario) + "</div>" : "";
      var av = (L.avisos || []).length ? '<div class="muted" style="font-size:11px;margin-top:3px;color:#92400e" title="' + esc(L.avisos.join("\n")) + '">' + L.avisos.map(function (a) { a = String(a); return esc(a.length > 220 ? a.slice(0, 217) + "…" : a); }).join("<br>") + "</div>" : "";
      var ver = (L.status === "propria" && L.comp) ? ' <button class="btn ghost sm" data-orcm-ver="' + L.i + '" title="Ver insumos e coeficientes">' + ic("tabela", 13) + "</button>" : "";
      linhas.push('<tr data-orcm-i="' + L.i + '"><td style="font-size:11px;color:var(--fraca)">' + esc(it.numero || (L.i + 1)) + "</td>" +
        "<td><div>" + esc(it.descricao) + '</div><div class="muted" style="font-size:11px">' + esc((it.fonte ? it.fonte + " " : "") + (L.codigoLido || "sem código")) + " · " + esc(Util.unidadeExibir(it.unidade)) + " · qtd " + Util.fmtNum(it.quantidade, 2) + "</div></td>" +
        '<td><select class="orcm-dec" data-i="' + L.i + '" style="max-width:420px;font-size:12px">' + opts + "</select>" + ver +
        '<div class="muted" style="font-size:11px;margin-top:3px">' + esc(VIA[L.via] || L.via) + (L.motivo ? " — " + esc(L.motivo) : "") + "</div>" + av + "</td>" +
        '<td class="num">' + Util.fmtMoeda(L.status === "pendente" ? 0 : L.custoUnitario) + precoPlan + "</td>" +
        '<td><span class="g-pill" style="background:' + COR[L.status] + '22;color:' + COR[L.status] + '">' + ROTULO[L.status] + (L.confianca ? " " + L.confianca + "%" : "") + "</span></td></tr>");
    });
    html += '<div style="max-height:420px;overflow:auto;border:1px solid var(--linha);border-radius:8px"><table class="tbl"><thead><tr><th>#</th><th>Item da planilha</th><th>Decisão do orçamentista</th><th class="num">Custo unit.</th><th>Status</th></tr></thead><tbody>' +
      (linhas.join("") || '<tr><td colspan="5" class="muted">Nada neste filtro.</td></tr>') + "</tbody></table></div>";
    html += '<p class="muted" style="font-size:11px;margin:8px 0 0">Bases varridas, na ordem: <b>' + esc((st.fontes || []).join(" › ")) + '</b>. Composições próprias são gravadas na sua base PRÓPRIA com os insumos e coeficientes (analítico disponível no orçamento). Itens pendentes entram com custo R$ 0,00 e uma casca de composição para você completar.</p>';
    return '<div id="orcm-body">' + html + "</div>";
  };

  /* ---------------- App: fluxo ---------------- */
  App.orcamentistaDaImportacao = function () {
    if (this._trialBloqueado && this._trialBloqueado()) { this._avisoTrial(); return; }
    /* escopo por obra: a importação cria orçamento NOVO, sem obra (Auth.orcNovoRestrito) */
    if (this._orcNovoRecusado && this._orcNovoRecusado()) return;
    var res = this._imp && this._imp.res;
    if (!res || !res.etapas || !res.etapas.length) { UI.toast("Nada para o orçamentista — ajuste o mapeamento das colunas e clique Reanalisar.", "erro"); return; }
    var nome = String(this._imp.nome || "Orçamento importado").replace(/\.(xlsx|xls|csv)$/i, "");
    this._orcm = { modo: "importacao", etapas: res.etapas, nome: nome, total: res.resumo.itens };
    this._orcmAbrirConfig();
  };

  App.orcamentistaDoOrcamento = function () {
    var orc = this.orcAtual; if (!orc) return;
    /* a mesma porta do orcamentistaDaImportacao: com a licença bloqueada o
       persistir() recusa no fim, e a pessoa teria rodado e revisado tudo (e
       talvez pago o Refinar com IA) para nada. Recusa na entrada, com o aviso
       que leva à licença. */
    if (this._trialBloqueado && this._trialBloqueado()) { this._avisoTrial(); return; }
    /* ⚠ APROVADO NÃO PASSA NEM POR AQUI (21/09/2026, revisão da fusão da
       1.2.83). Roteiro do defeito: o botão "Orçamentista" aparece sempre; num
       orçamento aprovado o _orcmAplicar trocava código e preço dos itens NA
       MEMÓRIA, o persistir() recusava gravar — o aprovado é o preço que foi
       ao cliente — e o toast final saía verde, "N casados…". A tela ficava
       com preço que não existia no disco, e na segunda rodada nem o aviso do
       cadeado aparecia (ele avisa uma vez por abertura). É o defeito da
       v1.1.234 em ⚙ Parâmetros de novo: a trava valia numa porta e não na
       outra. A regra do persistir é "o aprovado não é tocado nem em memória",
       então a recusa é AQUI, antes de montar qualquer estado.
       ⚠ Modal com o botão, e não toast mandando "criar revisão": a revisão
       não tem botão permanente na tela — recado que aponta para um caminho
       que a pessoa não acha é trava sem porta.
       Guardado por tools/test-orcamentista-fiacao.js. */
    /* ⚠ LICITAÇÃO: o Orçamentista precifica pela TABELA DO EDITAL. Com uma
       base exigida que não está em uso (nem registrada como substituída), ele
       não roda: rodar seria precificar com outra tabela em silêncio — o
       defeito que desclassifica. A porta está no próprio quadro: instalar a
       exigida ou usar outra registrando na justificativa de preços. */
    if (typeof Licitacao !== "undefined" && Licitacao.temBasesExigidas && Licitacao.temBasesExigidas(orc) && this._licCtxBases) {
      var pendL = Licitacao.basesPendentes(orc, this._licCtxBases());
      if (pendL.length) {
        UI.modal(ic("alerta") + " Bases exigidas pelo edital — o Orçamentista espera",
          '<p style="font-size:13px;margin-top:0">O edital fixa a tabela de preços, e ' + (pendL.length === 1 ? "esta" : "estas " + pendL.length) +
          ' ainda não ' + (pendL.length === 1 ? "está" : "estão") + ' em uso. Instale a exigida ou registre o uso de outra — a escolha sai na justificativa de preços.</p>' +
          UI._licBasesLinhas(pendL),
          [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
        return;
      }
    }
    if (typeof Orcamento !== "undefined" && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc)) {
      var selfT = this;
      UI.modal(ic("cadeado") + " Orçamento aprovado — o Orçamentista não roda nele",
        '<p style="font-size:13px">O <b>' + esc(orc.numero || orc.nome || "") + '</b> está <b>aprovado</b>. ' +
        'O Orçamentista troca código e preço dos itens, e o que foi aprovado é o preço que chegou ao cliente.</p>' +
        '<p class="muted" style="font-size:12.5px">O caminho é a <b>revisão</b>: ela nasce como orçamento próprio, com todo o conteúdo copiado, e o aprovado fica intacto para consulta. Dentro dela, clique em Orçamentista de novo.</p>',
        [
          { texto: "Voltar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: ic("mais") + " Criar revisão", classe: "success", onClick: function () { UI.fecharModal(); selfT.criarRevisao(orc); } }
        ]);
      return;
    }
    var etapas = [];
    Util.arr(orc.etapas).forEach(function (e) {
      var et = { nome: e.nome, codigo: e.codigo, itens: [] };
      Util.arr(e.itens).forEach(function (it) {
        var cod = it.codigo && it.codigo !== "—" ? String(it.codigo) : "", fonte = it.baseFonte || (it.origem === "SINAPI" ? "SINAPI" : "");
        /* casca pendente (PROP-xxx sem insumo e sem preço) não é código para
           casar — o item volta a ser procurado pela descrição; o código da
           casca fica guardado para ser reaproveitado se continuar pendente */
        var casca = "";
        if (cod && fonte === "PROPRIA" && typeof Bases !== "undefined") {
          var bp = Bases.obter("PROPRIA", cod);
          if (bp && (bp.pendente || !((bp.insumos || []).length) && !(Number(bp.custoUnitario) > 0))) { casca = cod; cod = ""; fonte = ""; }
        }
        et.itens.push({ _ref: it, codigo: cod, fonte: fonte, cascaCodigo: casca, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, custoUnitario: 0, custoPlanilha: Number(it.custoUnitario) || 0 });
      });
      if (et.itens.length) etapas.push(et);
    });
    var total = 0; etapas.forEach(function (e) { total += e.itens.length; });
    if (!total) { UI.toast("O orçamento não tem itens.", "erro"); return; }
    /* `carimboEm`: o atualizadoEm do orçamento que o agente LEU. O _orcmAplicar
       confere antes de gravar qualquer coisa — ver a nota de lá. */
    this._orcm = { modo: "orcamento", etapas: etapas, nome: orc.nome, total: total, orcId: orc.id, carimboEm: orc.atualizadoEm };
    this._orcmAbrirConfig();
  };

  App._orcmAbrirConfig = function () {
    var self = this, st = this._orcm;
    UI.modal(ic("ia") + " Orçamentista — bases e regras", UI.renderOrcamentistaConfig(st), [
      { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); if (st.modo === "importacao") self._abrirImportPreview(); } },
      { texto: ic("ia") + " Rodar o orçamentista", classe: "primary", onClick: function () { self._orcmRodar(); } }
    ]);
  };

  App._orcmLerConfig = function () {
    var fontes = [], prio = {};
    Array.prototype.forEach.call(document.querySelectorAll(".orcm-prio"), function (i) { prio[i.dataset.fonte] = parseInt(i.value, 10) || 99; });
    Array.prototype.forEach.call(document.querySelectorAll(".orcm-fonte:checked"), function (c) { fontes.push(c.value); });
    fontes.sort(function (a, b) { return (prio[a] || 99) - (prio[b] || 99); });
    var el = function (id) { var e = document.getElementById(id); return e ? !!e.checked : false; };
    return { fontes: fontes, elaborar: el("orcm-elaborar"), planilhaVence: el("orcm-planilha-vence"), soSemPreco: document.getElementById("orcm-so-sem-preco") ? el("orcm-so-sem-preco") : false };
  };

  /* ⚠ LICITAÇÃO: só a família SINAPI que o edital exige. O motor acrescenta
     sempre a base canônica da fonte declarada ("SINAPI") — com o edital
     pedindo DESONERADO, o item declarado SINAPI que não estivesse na
     desonerada caía na onerada calado. Com a exigida definida: a outra família
     sai da lista, e `obter`/`itensDe` respondem nada por ela. */
  var FAMILIA_SINAPI = { SINAPI: 1, SINAPI_DES: 1 };
  App._orcmFamiliaLic = function () {
    var st = this._orcm, orc = this.orcAtual;
    if (!st || st.modo !== "orcamento" || !orc || orc.id !== st.orcId || typeof Licitacao === "undefined" || !Licitacao.familiaSinapiExigida) return null;
    return Licitacao.familiaSinapiExigida(orc);
  };
  App._orcmFontesLic = function (fontes, fam) {
    if (!fam) return fontes.slice();
    var out = fontes.filter(function (f) { return !FAMILIA_SINAPI[f] || f === fam; });
    if (out.indexOf(fam) < 0) out.unshift(fam);   // a exigida entra mesmo desmarcada: é ela que o edital pede
    return out;
  };

  /* ctx do motor amarrado às bases do app — fonte honesta, sem fallback amplo */
  App._orcmCtx = function (cfg) {
    var self = this, famLic = this._orcmFamiliaLic();
    var barrada = function (f) { return !!(famLic && FAMILIA_SINAPI[f] && f !== famLic); };
    return {
      fontes: this._orcmFontesLic(cfg.fontes, famLic),
      familiaLicitacao: famLic,
      normalizar: function (s) { return Util.normalizar(s); },
      unidadeChave: function (u) { return Util.unidadeChave ? Util.unidadeChave(u) : String(u || "").toLowerCase(); },
      sinonimos: (typeof Escopo !== "undefined" && Escopo.SINONIMOS) || null,
      /* casca pendente da base PRÓPRIA (sem insumo, sem preço) nunca é
         resposta: senão o item pendente "casa" consigo mesmo na 2ª rodada */
      ehCasca: function (it) { return !!it && it.origem === "PROPRIA" && (it.pendente || (!((it.insumos || []).length) && !(Number(it.custoUnitario) > 0))); },
      obter: function (f, cod) {
        if (barrada(f)) return null;
        var it = (f === "SINAPI") ? ((typeof Sinapi !== "undefined" && Sinapi.obter) ? Sinapi.obter(cod) : null)
          : ((typeof Bases !== "undefined" && Bases.obter) ? Bases.obter(f, cod) : null);
        return (f === "PROPRIA" && this.ehCasca(it)) ? null : it;
      },
      itensDe: function (f) {
        if (barrada(f)) return [];
        if (f === "SINAPI") return (typeof Sinapi !== "undefined" && Sinapi._itens) || [];
        var b = (typeof Bases !== "undefined" && Bases.extras) ? Bases.extras().filter(function (x) { return x.fonte === f; })[0] : null;
        var lista = b ? b.itens : [];
        return f === "PROPRIA" ? lista.filter(function (it) { return !this.ehCasca(it); }, this) : lista;
      },
      buscar: function (txt, o) {
        if (typeof Bases === "undefined" || !Bases.buscar) return [];
        var self2 = this;
        return Bases.buscar(txt, { max: (o && o.max) || 120, fontes: (o && o.fontes) || self2.fontes, tipo: o && o.tipo })
          .filter(function (r) { return !(r.fonte === "PROPRIA" && self2.ehCasca(r.item)) && !barrada(r.fonte); })
          .map(function (r) { return { item: r.item, fonte: r.fonte }; });
      },
      elaborar: cfg.elaborar ? function (desc, o) {
        if (typeof ComposicaoPropria === "undefined" || typeof Analitico === "undefined" || !Analitico.carregado) return { ok: false, erro: "analítico não carregado" };
        return ComposicaoPropria.elaborar(desc, {
          analitico: Analitico.todos(),
          resolve: function (cod, fonte) { return self._cpResolve(cod, fonte); },
          precoOficial: function (cod) { return self._cpPrecoOficial(cod); },
          codigosExistentes: self._cpCodigosExistentes().concat(o.codigosExistentes || []),
          unidade: o.unidade || ""
        });
      } : null
    };
  };

  App._orcmRodar = function () {
    var self = this, st = this._orcm, cfg = this._orcmLerConfig();
    if (!cfg.fontes.length) { UI.toast("Escolha pelo menos uma base para varrer.", "erro"); return; }
    st.cfg = cfg;
    var etapas = st.etapas;
    if (st.modo === "orcamento" && cfg.soSemPreco) {
      etapas = st.etapas.map(function (e) { return { nome: e.nome, codigo: e.codigo, itens: e.itens.filter(function (it) { return !(it.custoPlanilha > 0); }) }; }).filter(function (e) { return e.itens.length; });
      if (!etapas.length) { UI.toast("Todos os itens já têm preço — desmarque 'só itens sem preço' para reprocessar.", "ok"); return; }
    }
    st.etapasRodadas = etapas;
    UI.fecharModal();
    var rodar = function () {
      var ctx = self._orcmCtx(cfg); st.ctx = ctx;
      UI.loading("Orçamentista: casando e precificando…");
      var setTxt = function (t) { var d = document.getElementById("ui-loading"), box = d && d.firstElementChild, tn = box && box.lastChild; if (tn && tn.nodeType === 3) tn.nodeValue = t; };
      Orcamentista.planejarAsync(etapas, ctx, function (feitos, total) { setTxt("Orçamentista: " + feitos + " de " + total + " itens…"); })
        .then(function (r) { UI.loadingFim(); st.plano = r.plano; st.fontes = r.fontes; st.filtro = "todos"; self._orcmAbrirRevisao(); })
        .catch(function (e) { UI.loadingFim(); UI.toast("O orçamentista falhou: " + (e && e.message ? e.message : e), "erro"); });
    };
    if (!cfg.elaborar || (typeof Analitico !== "undefined" && Analitico.carregado)) { rodar(); return; }
    var urls = this._prepararAnalitico();
    UI.loading("Carregando a base analítica (insumos e coeficientes)…");
    Analitico.carregarArquivo(urls.alts).then(function () { UI.loadingFim(); rodar(); })
      .catch(function () { UI.loadingFim(); UI.toast("Não consegui carregar o analítico — o orçamentista vai casar e precificar, mas sem elaborar composições próprias.", "erro"); cfg.elaborar = false; rodar(); });
  };

  App._orcmAbrirRevisao = function () {
    var self = this, st = this._orcm;
    var botoes = [
      { texto: "Voltar", classe: "ghost", onClick: function () { self._orcmAbrirConfig(); } },
      { texto: ic("alvo") + " Refinar com IA", classe: "", onClick: function () { self._orcmRefinarIA(); } },
      { texto: ic("check") + (st.modo === "importacao" ? " Criar orçamento com estas decisões" : " Aplicar no orçamento"), classe: "success", onClick: function () { self._orcmAplicar(); } }
    ];
    var bg = UI.modal(ic("ia") + " Orçamentista — revisão das decisões (" + esc(st.nome) + ")", UI.renderOrcamentistaRevisao(st), botoes);
    var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "1100px";
    this._orcmLigar();
  };

  App._orcmLigar = function () {
    var self = this, st = this._orcm, body = document.getElementById("orcm-body"); if (!body) return;
    var f = document.getElementById("orcm-filtro");
    if (f) f.onchange = function () { st.filtro = f.value; body.outerHTML = UI.renderOrcamentistaRevisao(st); self._orcmLigar(); };
    Array.prototype.forEach.call(body.querySelectorAll(".orcm-dec"), function (sel) {
      sel.onchange = function () {
        var L = st.plano[parseInt(sel.dataset.i, 10)]; if (!L) return;
        var v = sel.value;
        if (v === "pendente") { L.status = "pendente"; L.via = "nenhum"; L.escolhido = -1; L.confianca = 0; L.motivo = "deixado pendente por você"; }
        else if (v === "propria") { L.status = "propria"; L.via = "analogia"; L.escolhido = -1; L.fonte = "PROPRIA"; L.codigo = L.comp.codigo; L.motivo = "composição própria escolhida por você"; }
        else { Orcamentista.aplicarCandidato(L, parseInt(v.slice(1), 10), null, st.ctx); L.motivo = "escolhido por você: " + L.motivo; }
        L.decididoPeloUsuario = true;
        var tr = sel.closest("tr"); if (tr) { var novo = document.createElement("tbody"); novo.innerHTML = UI.renderOrcamentistaRevisao({ plano: [L], filtro: "todos", fontes: st.fontes }).match(/<tbody>([\s\S]*)<\/tbody>/)[1]; tr.replaceWith(novo.firstElementChild); self._orcmLigar(); }
      };
    });
    Array.prototype.forEach.call(body.querySelectorAll("[data-orcm-ver]"), function (b) {
      b.onclick = function () {
        var L = st.plano[parseInt(b.dataset.orcmVer, 10)]; if (!L || !L.comp) return;
        var c = L.comp, custo = ComposicaoPropria.custo(c.insumos, c.metodo || "truncar2");
        var a = { codigo: c.codigo || "(nova)", descricao: c.descricao, unidade: c.unidade, grupo: c.grupo || "Composição própria", custoUnitario: custo.total, custoMO: custo.mo, custoMAT: custo.mat, custoEQ: custo.eq,
          insumos: (c.insumos || []).map(function (i) { return { tipo: "INSUMO", codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, coeficiente: Number(i.coeficiente) || 0, custoUnitario: Number(i.custoUnitario) || 0, custoTotal: (Number(i.coeficiente) || 0) * (Number(i.custoUnitario) || 0), categoria: i.categoria || "MAT" }; }) };
        var salvo = { st: st };
        UI.modal(ic("tabela") + " Composição própria elaborada — " + esc(c.codigo || "") + (L.referencia ? " (a partir da " + esc(L.referencia.codigo) + ")" : ""),
          '<p class="muted" style="font-size:12px">' + esc(c.observacao || "") + "</p>" + UI.renderInsumos(a, String(self._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : "") || "")),
          [{ texto: "Voltar à revisão", classe: "primary", onClick: function () { self._orcm = salvo.st; self._orcmAbrirRevisao(); } }]);
      };
    });
  };

  /* ⚠ A IA DO ORÇAMENTISTA É COBRADA POR ORÇAMENTO (decisão do Rogério, 13/10/2026): 1 grátis por mês;
     depois o preço do orçamento, com revisão incluída; revisão extra paga. A REGRA E OS NÚMEROS SÃO DO
     SERVIDOR (server/ia-cobranca.js, bloco do fim): a tela pede a situação, mostra, e só abre a JANELA com
     a confirmação. Dentro da janela (horas), todo clique de IA neste orçamento passa sem cobrar de novo.
     Servidor antigo (sem a rota de preço) ou sem o segredo da licença: segue como antes, sem cobrança.
     O "mesmo orçamento" é a RAIZ (a 1ª versão da cadeia de revisões; gravada em `orcmRaiz`) com a mesma
     planilha — a ASSINATURA: um hash curto de cada descrição (o texto não vai ao servidor).
     Guardado por tools/test-ia-orcamentista-cobranca.js. */
  App._orcmRaiz = function () {
    var st = this._orcm;
    if (st.raiz) return st.raiz;
    /* o modo escopo (js/orccompletoui.js) roda sobre o orçamento ABERTO: a cobrança é dele, como no modo orçamento */
    var orc = ((st.modo === "orcamento" || st.modo === "escopo") && this.orcAtual && this.orcAtual.id === st.orcId) ? this.orcAtual : null, r = "";
    if (orc) {
      r = orc.orcmRaiz || "";
      if (!r) {
        var lista = [];
        try { lista = (typeof Store !== "undefined" && Store.listarOrcamentos) ? (Store.listarOrcamentos(Auth.empresaId()) || []) : []; } catch (e) { lista = []; }
        var porId = {}; lista.forEach(function (o) { if (o && o.id) porId[o.id] = o; });
        var cur = orc, passos = 0;
        while (cur && !cur.orcmRaiz && cur.revisaoDe && porId[cur.revisaoDe] && passos < 50) { cur = porId[cur.revisaoDe]; passos++; }
        r = (cur && (cur.orcmRaiz || cur.id)) || orc.id || "";
      }
    }
    r = String(r || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80);
    /* importação (o orçamento ainda não existe): a raiz sai da PRÓPRIA planilha. Quem paga, roda a IA e
       fecha o quadro sem criar o orçamento, ao importar a mesma planilha de novo cai na mesma raiz — a
       janela paga (ou a revisão incluída) vale, e não um orçamento novo cobrado outra vez. */
    if (!r) { var asg = this._orcmAssinatura().slice().sort(); r = "imp_" + asg.length.toString(36) + "_" + this._orcmHash(asg.join(",")); }
    return (st.raiz = r);
  };
  App._orcmHash = function (s) {
    var h = 0x811c9dc5;
    s = String(s || "");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  };
  /* FNV-1a de 32 bits da descrição normalizada, em 8 hex; sem repetir (a multiplicação pelo primo em
     deslocamentos: Math.imul não é ES5) */
  App._orcmAssinatura = function () {
    /* modo escopo: ainda não há plano quando o preço é pedido — a assinatura são as linhas do escopo (js/orccompletoui.js) */
    if (this._orcm && this._orcm.modo === "escopo" && this._orcm.assinaturaEscopo) return this._orcm.assinaturaEscopo.slice();
    var self = this, vistos = {}, out = [];
    Util.arr(this._orcm && this._orcm.plano).forEach(function (L) {
      var d = String((typeof Util !== "undefined" && Util.normalizar) ? Util.normalizar(L.item.descricao || "") : (L.item.descricao || "")).toUpperCase().replace(/\s+/g, " ").trim();
      if (!d) return;
      var hx = self._orcmHash(d);
      if (!vistos[hx]) { vistos[hx] = 1; out.push(hx); }
    });
    return out.slice(0, 2000);
  };
  /* a janela do preço: o texto do servidor, a regra, o saldo e o botão que confirma */
  App._orcmPrecoModal = function (p, confirmar) {
    var self = this, rg = p.regra || {}, pago = p.precoCent > 0, suficiente = !pago || !!(p.carteira && p.carteira.suficiente);
    var revs = function (n) { return n === 1 ? "1 revisão incluída" : n + " revisões incluídas"; };
    var html = '<p style="font-size:14px;margin-top:0" data-orcm="preco-texto"><b>' + esc(p.texto || "") + "</b></p>";
    /* ORÇAMENTO PELO ESCOPO (21/10/2026): outra regra — grátis do mês e, depois, preço pelo tamanho do escopo */
    if (rg.escopo) {
      html += '<p class="muted" style="font-size:12.5px">A IA estrutura o escopo, casa cada serviço com as bases e cria a composição própria do que nenhuma base tem. Ela nunca inventa código nem preço.</p>' +
        '<p class="muted" style="font-size:12.5px">Regra: ' + (rg.gratisPorMes === 1 ? "1 orçamento" : esc(String(rg.gratisPorMes)) + " orçamentos") + " por IA por mês incluído" + (rg.gratisPorMes === 1 ? "" : "s") +
        " no plano; depois, cada orçamento tem o preço calculado pelo tamanho do escopo, mostrado aqui ANTES de gerar. Confirmado, a IA fica liberada neste orçamento por " + esc(String(rg.janelaHoras || "")) +
        " h. Se ela não entregar, o valor volta para a carteira.</p>";
    } else if (rg.porUso) {
      /* ORÇAMENTISTA PELO USO (21/10/2026: "cobra só o uso mais 100%") */
      html += '<p class="muted" style="font-size:12.5px">A IA escolhe entre os candidatos que o Orçamentista achou nas bases e propõe a estrutura das composições que nenhuma base tem. Ela nunca inventa código nem preço.</p>' +
        '<p class="muted" style="font-size:12.5px">Regra: ' + (rg.gratisPorMes === 1 ? "1 orçamento" : esc(String(rg.gratisPorMes)) + " orçamentos") + " por IA por mês incluído" + (rg.gratisPorMes === 1 ? "" : "s") +
        " no plano; depois, você paga " + esc(rg.preco || "o custo do uso") + (rg.minimo ? " (mínimo " + esc(rg.minimo) + ")" : "") +
        ", calculado pelo número de linhas que a IA vai trabalhar e mostrado aqui ANTES. Confirmado, a IA fica liberada neste orçamento por " + esc(String(rg.janelaHoras || "")) +
        " h. Se ela não responder, o valor volta para a carteira.</p>";
    } else html +=
      '<p class="muted" style="font-size:12.5px">A IA escolhe entre os candidatos que o Orçamentista achou nas bases e propõe a estrutura das composições que nenhuma base tem. Ela nunca inventa código nem preço.</p>' +
      '<p class="muted" style="font-size:12.5px">Regra: ' + (rg.gratisPorMes === 1 ? "1 orçamento" : esc(String(rg.gratisPorMes)) + " orçamentos") + " por IA por mês incluído" + (rg.gratisPorMes === 1 ? "" : "s") + " no plano; depois, " + esc(rg.preco || "") +
      " por orçamento, com " + revs(rg.revisoesIncluidas) + "; revisão extra, " + esc(rg.revisao || "") + ". Confirmado, a IA fica liberada neste orçamento por " + esc(String(rg.janelaHoras || "")) +
      " h. Se ela não responder, o valor volta para a carteira.</p>";
    if (pago) html += '<p style="font-size:13px">Saldo da carteira de créditos: <b>' + esc((p.carteira && p.carteira.saldo) || "") + "</b>" + (suficiente ? "" : " — insuficiente.") + "</p>" +
      (suficiente ? "" : '<p class="muted" style="font-size:12.5px">' + esc((p.compraCreditos && p.compraCreditos.texto) || "") + "</p>");
    var botoes = [{ texto: "Voltar", classe: "ghost", onClick: function () { UI.fecharModal(); self._orcmVoltar(true); } }];
    if (suficiente) botoes.push({ texto: ic("alvo") + (pago ? " Confirmar " + esc(p.preco || "") + " e usar a IA" : " Usar a IA (incluído)"), classe: "success", onClick: function () { confirmar(); } });
    /* sem saldo: compra por PIX aqui mesmo (js/iaacabamento.js); creditou → volta à janela do preço */
    else if (p.compraCreditos && p.compraCreditos.pix && typeof IAAcabamento !== "undefined" && IAAcabamento.comprarCreditos) botoes.push({ texto: "Comprar créditos (PIX)", classe: "success", onClick: function () {
      var falta = Math.max(0, (Number(p.precoCent) || 0) - (Number(p.carteira && p.carteira.saldoCent) || 0));
      IAAcabamento.comprarCreditos({ valorCent: falta, aoCreditar: function () { var stC = self._orcm; if (stC && stC.modo === "escopo" && stC.retomarIA) stC.retomarIA(); else self._orcmRefinarIA(); }, aoFechar: function () { self._orcmVoltar(true); } });
    } });
    UI.modal(ic("ia") + " IA do Orçamentista — " + (pago ? "o preço antes de usar" : "incluído no plano"), html, botoes);
  };
  /* Para onde a tela volta depois do quadro do preço. No Orçamentista, para a
     revisão (como sempre). No modo escopo NÃO há revisão: fecha o quadro e,
     se a pessoa desistiu ou deu erro, segue `st.aoDesistir` — o orçamento é
     gravado com o resíduo marcado, nunca fica a geração pela metade. */
  App._orcmVoltar = function (desistiu) {
    var st = this._orcm;
    if (st && st.modo === "escopo") {
      UI.fecharModal();
      if (desistiu && typeof st.aoDesistir === "function") { var f = st.aoDesistir; st.aoDesistir = null; f(); }
      return;
    }
    this._orcmAbrirRevisao();
  };
  /* pede a situação, mostra, confirma e abre a janela; `seguir(sessao)` roda a IA (sessao null = servidor sem cobrança) */
  App._orcmJanelaIA = function (back, seguir) {
    var self = this, st = this._orcm;
    if (st.janela && st.janela.ate > new Date().getTime() + 60000) { seguir(st.janela.id); return; }
    var hdr = { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") };
    var corpo = { raiz: this._orcmRaiz(), assinatura: this._orcmAssinatura() };
    /* escopo: o servidor calcula o preço pelo TAMANHO (caracteres, linhas, parâmetros) — nunca pelo texto */
    if (st.modo === "escopo" && st.escopo) corpo.escopo = st.escopo;
    else if (st.uso) corpo.uso = st.uso;
    var post = function (rota, b) {
      return fetch(back + rota, { method: "POST", headers: hdr, body: JSON.stringify(b) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j || {} }; }, function () { return { status: r.status, j: {} }; }); });
    };
    var semRede = function () { UI.loadingFim(); UI.toast("Sem conexão com o servidor de IA — nada foi cobrado.", "erro"); if (st.modo === "escopo") self._orcmVoltar(true); };
    var abrir = function (orcamentoId) {
      var b = { raiz: corpo.raiz, assinatura: corpo.assinatura };
      if (corpo.escopo) b.escopo = corpo.escopo;
      if (corpo.uso) b.uso = corpo.uso;
      if (orcamentoId) b.orcamentoId = orcamentoId;
      UI.loading("Liberando a IA neste orçamento…");
      post("/ia/orcamentista/abrir", b).then(function (o) {
        UI.loadingFim();
        if (o.status !== 200 || !o.j.ok) { UI.toast(o.j.error || ("Não consegui liberar a IA (HTTP " + o.status + ") — nada foi cobrado."), "erro"); UI.fecharModal(); self._orcmVoltar(true); return; }
        st.janela = { id: o.j.sessao, ate: Date.parse(o.j.ate) || (new Date().getTime() + 3600000) };
        if (o.j.cobrado) UI.toast("Cobrado " + o.j.cobrado.texto + " da carteira de créditos (saldo: " + o.j.cobrado.saldo + ").", "ok");
        UI.fecharModal(); self._orcmVoltar(false);
        seguir(st.janela.id);
      }, semRede);
    };
    UI.loading("Consultando o preço da IA…");
    post("/ia/orcamentista/preco", corpo).then(function (o) {
      UI.loadingFim();
      if (o.status === 404 || o.status === 503) { seguir(null); return; }   // servidor sem a cobrança: como antes
      if (o.status !== 200 || !o.j.ok) { UI.toast(o.j.error || ("Não consegui consultar o preço da IA (HTTP " + o.status + ")."), "erro"); if (st.modo === "escopo") self._orcmVoltar(true); return; }
      if (o.j.situacao === "aberta") { abrir(null); return; }
      self._orcmPrecoModal(o.j, function () { abrir(o.j.orcamentoId || null); });
    }, semRede);
  };

  /* IA no resíduo: /ia/casar escolhe entre candidatos das linhas em revisão;
     /ia/compor propõe estrutura para as pendentes (validada pelo motor). */
  App._orcmRefinarIA = function () {
    var self = this, st = this._orcm, back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "";
    if (!back) { UI.toast("Servidor de IA não configurado.", "erro"); return; }
    var revisar = st.plano.filter(function (L) { return L.status === "revisar" && L.candidatos.length >= 2 && !L.decididoPeloUsuario && !L.refinadoIA; });
    var pend = st.plano.filter(function (L) { return L.status === "pendente" && !L.decididoPeloUsuario && !L.refinadoIA; });
    if (!revisar.length && !pend.length) { UI.toast("Nada para a IA refinar: sem linhas em revisão ou pendentes.", "ok"); return; }
    /* o preço é PELO USO (21/10/2026): o servidor estima o custo pelo que a IA vai fazer — só contagens */
    st.uso = { revisar: revisar.length, pendentes: pend.length };
    this._orcmJanelaIA(back, function (sessao) { self._orcmRefinarIAComJanela(back, sessao, revisar, pend); });
  };
  App._orcmRefinarIAComJanela = function (back, sessao, revisar, pend) {
    var self = this, st = this._orcm;
    var hdr = { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") };
    if (sessao) hdr["x-orcm-sessao"] = sessao;
    UI.toast(ic("alvo") + " IA: " + revisar.length + " em revisão, " + pend.length + " pendente(s)…", "ok");
    var refinados = 0, compostas = 0, limite = false, parar = "";
    /* a janela fechou no meio (a IA não respondeu e o valor voltou, ou ela venceu): para e diz por quê */
    var fechou = function (o) {
      if (o.status === 402 || (o.j && o.j.devolvido)) { parar = (o.j && o.j.error) || "A janela da IA deste orçamento foi encerrada — confirme de novo."; st.janela = null; return true; }
      return false;
    };
    var lotes = []; for (var k = 0; k < revisar.length; k += 6) lotes.push(revisar.slice(k, k + 6));
    var casar = lotes.reduce(function (p, lote) {
      return p.then(function () {
        if (limite || parar) return;
        var payload = lote.map(function (L) { return { descricao: L.item.descricao, unidade: L.item.unidade || "", candidatos: L.candidatos.slice(0, 3).map(function (c) { return { codigo: c.item.codigo, descricao: String(c.item.descricao || "").slice(0, 70), unidade: c.item.unidade }; }) }; });
        return fetch(back + "/ia/casar", { method: "POST", headers: hdr, body: JSON.stringify({ itens: payload }) })
          .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: {} }; }); })
          .then(function (o) {
            var j = o.j;
            if (fechou(o)) return;
            if (!j.ok && (o.status === 429 || /rate limit|429/i.test(String(j.error || "")))) { limite = true; return; }
            if (!j.ok || !j.escolhas) return;
            j.escolhas.forEach(function (e) {
              var L = lote[e.i]; if (!L) return; L.refinadoIA = true;
              if (!e.codigo) return;
              for (var z = 0; z < L.candidatos.length; z++) {
                if (String(L.candidatos[z].item.codigo) === String(e.codigo)) { Orcamentista.aplicarCandidato(L, z, "ia", st.ctx); L.motivo = "IA escolheu entre os candidatos do motor: " + L.motivo; refinados++; break; }
              }
            });
          }, function () {});
      });
    }, Promise.resolve());
    var compor = casar.then(function () {
      if (limite || parar || !pend.length) return;
      var payload = pend.slice(0, 20).map(function (L) { return { i: L.i, descricao: L.item.descricao, unidade: L.item.unidade || "" }; });
      return fetch(back + "/ia/compor", { method: "POST", headers: hdr, body: JSON.stringify({ itens: payload }) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: {} }; }); })
        .then(function (o) {
          if (fechou(o)) return;
          if (o.status === 404) { UI.toast("O servidor de IA ainda não tem a rota /ia/compor — pendentes ficam para você completar.", "erro"); return; }
          var j = o.j; if (!j || !j.ok || !Array.isArray(j.composicoes)) return;
          j.composicoes.forEach(function (c) {
            var L = st.plano[c.i]; if (!L || L.status !== "pendente") return;
            var v = Orcamentista.validarComposicaoIA(L, c, st.ctx); L.refinadoIA = true;
            if (!v) return;
            var cods = self._cpCodigosExistentes().concat(st.ctx.codigosGerados || []);
            var codigo = ComposicaoPropria.gerarCodigoLegivel("OUTROS", cods); (st.ctx.codigosGerados = st.ctx.codigosGerados || []).push(codigo);
            L.comp = { codigo: codigo, codigoSec: "", descricao: L.item.descricao, grupo: "OUTROS", unidade: v.unidade, modeloRef: "SINAPI", metodo: "truncar2", maoDeObra: v.insumos.some(function (i) { return i.categoria === "MO"; }), observacao: "Estrutura proposta pela IA e validada contra as bases (" + v.aCotar + " insumo(s) a cotar). Confira coeficiente por coeficiente.", insumos: v.insumos };
            L.status = "propria"; L.via = "ia"; L.fonte = "PROPRIA"; L.codigo = codigo; L.custoUnitario = v.custo.total; L.custoMO = v.custo.mo; L.custoMAT = v.custo.mat; L.custoEQ = v.custo.eq;
            L.confianca = 30; L.motivo = "composição proposta pela IA (insumos casados nas bases; " + v.aCotar + " a cotar)"; L.avisos.push(v.aviso); compostas++;
          });
        }, function () {});
    });
    compor.then(function () {
      var body = document.getElementById("orcm-body"); if (body) { body.outerHTML = UI.renderOrcamentistaRevisao(st); self._orcmLigar(); }
      if (parar) { UI.toast(parar + (refinados || compostas ? " (antes disso: " + refinados + " escolha(s), " + compostas + " composição(ões))" : ""), "erro"); return; }
      UI.toast("IA: " + refinados + " escolha(s) refinada(s), " + compostas + " composição(ões) proposta(s)." + (limite ? " ⏳ Limite da IA por minuto — clique de novo daqui ~1 min." : ""), limite ? "erro" : "ok");
    });
  };

  /* Composição própria pronta para a base PROPRIA (mesmo schema do criador). */
  App._orcmItemPropria = function (L) {
    var c = L.comp, custo = ComposicaoPropria.custo(c.insumos || [], c.metodo || "truncar2");
    return {
      codigo: c.codigo, codigoSecundario: c.codigoSec || "", descricao: c.descricao, unidade: c.unidade || L.item.unidade || "un",
      custoUnitario: custo.total, custoMO: custo.mo, custoMAT: custo.mat, custoEQ: custo.eq, tipoItem: "composicao", origem: "PROPRIA",
      grupo: c.grupo || "OUTROS", metodo: c.metodo || "truncar2", modeloRef: c.modeloRef || "SINAPI", maoDeObra: !!c.maoDeObra,
      observacao: (c.observacao || "") + " [Orçamentista v" + (typeof CONFIG !== "undefined" ? CONFIG.versao : "") + ": " + (VIA[L.via] || L.via) + (L.referencia ? ", referência " + L.referencia.codigo : "") + "]",
      referenciaCodigo: (L.referencia && L.referencia.codigo) || "", criadoEm: Util.agoraISO ? Util.agoraISO() : new Date().toISOString(),
      criadoPor: (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : "", insumos: c.insumos || []
    };
  };

  /* O recado da recusa, DENTRO da revisão — o mesmo desenho da tela da IA
     (App.iaEditarAplicar): nada gravado = nada mudado, e as decisões (que
     podem ter custado chamada paga de IA) continuam no quadro. ⚠ Nunca estado
     sem tela: se outro quadro tomou o lugar da revisão (o da licença, que o
     persistir abre para o suspenso), a revisão volta com o recado. */
  App._orcmRecado = function (msg) {
    var st = this._orcm; if (!st) return;
    st.recado = String(msg == null ? "" : msg);
    /* no modo escopo não há quadro de revisão: o recado vai direto à pessoa */
    if (st.modo === "escopo") { if (st.recado) UI.toast(st.recado, "erro"); return; }
    var el = document.getElementById("orcm-recado");
    if (el) { el.textContent = st.recado; el.style.display = st.recado ? "" : "none"; try { el.scrollIntoView({ block: "nearest" }); } catch (e) {} }
    else if (st.recado) this._orcmAbrirRevisao();
  };

  /* as duas pontas da frase do conflito — o diagnóstico é o do app.js, um só */
  var QUEM = { leu: "o Orçamentista o leu", refazer: "rode o Orçamentista de novo" };

  /* ⚠ APLICA NUMA CÓPIA; A MEMÓRIA SÓ TROCA DEPOIS DE GRAVAR (21/09/2026).
     Roteiro do defeito: no modo "orçamento" as decisões entravam direto nos
     itens do `orcAtual` (pelo `_ref`) e SÓ DEPOIS vinha o persistir(). Ele
     recusa em cinco ramos — licença, plano da obra, aprovado, outra janela,
     armazenamento — e em todos a planilha ficava mostrando código e preço que
     o disco não tinha; a saída era um recado mandando recarregar a página. E
     o recado mentia num deles: na recusa da trava de carimbo o persistir JÁ
     relê a tela do disco, então "a tela mostra valores não salvos" era falso.
     Agora: (1) nada é gravado — nem a base PRÓPRIA — antes das guardas que dá
     para conferir de antemão; (2) as decisões entram numa CÓPIA, que é o que o
     persistir recebe; (3) recusou, a cópia é descartada, o `orcAtual` é o
     mesmo objeto de antes e a revisão fica aberta com o motivo.
     ⚠ `if (this.orcAtual === copia)` na volta: se a releitura do persistir já
     trocou o `orcAtual` pelo do disco, devolver o objeto velho faria a tela
     regredir e TODA edição seguinte ser recusada pela trava.
     Guardado por tools/test-orcamentista-fiacao.js (blocos 3 a 7) e, no
     navegador, por tools/e2e-orcamentista-ia.js (bloco 6). */
  App._orcmAplicar = function () {
    var self = this, st = this._orcm, plano = st.plano || [];
    if (!plano.length) return;
    var porque = function () { return self._iaPorqueNaoGravou ? self._iaPorqueNaoGravou(false, QUEM) : "o motivo está no aviso que apareceu"; };
    this._orcmRecado("");
    if (this._trialBloqueado && this._trialBloqueado()) { this._orcmRecado("Nada foi aplicado: " + porque() + ". As decisões continuam neste quadro."); return; }
    /* ⚠ escopo por obra, NA FUNÇÃO que grava: no modo importação nasce um
       orçamento sem obra, invisível para o restrito que o criou. Antes das
       composições próprias, que também gravam. */
    if (st.modo === "importacao") {
      var rnOm = (typeof Auth !== "undefined" && Auth.orcNovoRestrito) ? Auth.orcNovoRestrito() : "";
      if (rnOm) { this._orcmRecado("Nada foi criado: " + rnOm); return; }
    }
    var orcA = null, copia = null, pares = [];
    if (st.modo !== "importacao") {
      orcA = this.orcAtual;
      if (!orcA || orcA.id !== st.orcId) { UI.fecharModal(); this._orcm = null; UI.toast("Você saiu do orçamento em que o Orçamentista rodou — nada foi aplicado.", "erro"); return; }
      /* ⚠ O PLANO É DO ORÇAMENTO QUE O AGENTE LEU. Enquanto o motor roda não há
         quadro aberto (só o "carregando"), e a releitura entre janelas troca o
         `orcAtual` pelo do disco. Os `_ref` do plano ficavam apontando para o
         objeto DESCARTADO: as decisões iam para lá, o persistir gravava o
         objeto novo sem elas e o toast saía verde. Carimbo diferente = o plano
         é de outra versão; recusa antes de gravar qualquer coisa. */
      if (String(orcA.atualizadoEm || "") !== String(st.carimboEm || "")) {
        this._orcmRecado("Nada foi aplicado: este orçamento foi alterado depois que o Orçamentista o leu — feche este quadro, confira o que está salvo e rode o Orçamentista de novo.");
        return;
      }
      copia = Util.clone(orcA);
      /* Util.clone devolve o PRÓPRIO objeto quando não consegue copiar — e aí
         "aplicar na cópia" seria aplicar no original, calado */
      if (!copia || copia === orcA) { this._orcmRecado("Nada foi aplicado: não consegui preparar a cópia de segurança deste orçamento. Recarregue o app (F5) e rode o Orçamentista de novo."); return; }
      /* original → cópia pela POSIÇÃO (a cópia acabou de sair deste objeto);
         por id deixaria de fora item antigo que não tem id */
      Util.arr(orcA.etapas).forEach(function (e, ei) {
        var ec = Util.arr(copia.etapas)[ei];
        Util.arr(e.itens).forEach(function (it, ii) { pares.push([it, (ec && Util.arr(ec.itens)[ii]) || null]); });
      });
    }
    // 1) composições próprias (elaboradas E cascas dos pendentes) → base PROPRIA, uma gravação só
    var cods = this._cpCodigosExistentes(), comps = {}, ordem = [];
    plano.forEach(function (L) {
      if (L.status === "propria" && L.comp && (L.comp.insumos || []).length) {
        if (!L.comp.codigo) L.comp.codigo = ComposicaoPropria.gerarCodigoLegivel(L.comp.grupo || "OUTROS", cods.concat(ordem));
        if (!comps[L.comp.codigo]) { comps[L.comp.codigo] = self._orcmItemPropria(L); ordem.push(L.comp.codigo); }
        L.codigo = L.comp.codigo;
      } else if (L.status === "pendente") {
        /* casca: código próprio, unidade da planilha, SEM insumo — fica na base
           PRÓPRIA para a pessoa completar (e o item já aponta para ela) */
        var chave = Util.normalizar(L.item.descricao) + "|" + String(L.item.unidade || "");
        st._cascas = st._cascas || {};
        if (L.item.cascaCodigo && !st._cascas[chave]) { st._cascas[chave] = L.item.cascaCodigo; } // já existe na base: não duplica
        if (!st._cascas[chave]) {
          var codigo = ComposicaoPropria.gerarCodigoLegivel("OUTROS", cods.concat(ordem));
          st._cascas[chave] = codigo; ordem.push(codigo);
          comps[codigo] = { codigo: codigo, codigoSecundario: "", descricao: L.item.descricao, unidade: L.item.unidade || "un", custoUnitario: 0, custoMO: 0, custoMAT: 0, custoEQ: 0, tipoItem: "composicao", origem: "PROPRIA", grupo: "OUTROS", metodo: "truncar2", modeloRef: "SINAPI", maoDeObra: false,
            observacao: "PENDENTE — casca criada pelo Orçamentista: nenhuma base escolhida tem este serviço e não houve análoga. Informe os insumos e coeficientes.", referenciaCodigo: "", criadoEm: Util.agoraISO ? Util.agoraISO() : new Date().toISOString(), criadoPor: (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : "", insumos: [], pendente: true };
        }
        L.comp = L.comp || {}; L.comp.codigo = st._cascas[chave]; L.codigo = L.comp.codigo; L.fonte = "PROPRIA";
      }
    });
    var gravadas = 0;
    if (ordem.length) { try { gravadas = this._propriaGravarVarios(ordem.map(function (c) { return comps[c]; })); } catch (e) { UI.toast("Não consegui gravar as composições próprias: " + e.message, "erro"); return; } }

    var planilhaVence = !!(st.cfg && st.cfg.planilhaVence);
    var n = { casado: 0, revisar: 0, propria: 0, pendente: 0 };
    if (st.modo === "importacao") {
      var orc = Orcamento.novo({ nome: st.nome });
      var porEtapa = {}, etapaIds = {}, subIds = {};
      st.etapasRodadas.forEach(function (et, ei) {
        var nomePai = et.pai || null, idPai;
        if (nomePai) {
          if (!etapaIds[nomePai]) { Orcamento.addEtapa(orc, nomePai); etapaIds[nomePai] = orc.etapas[orc.etapas.length - 1].id; }
          idPai = etapaIds[nomePai];
          var sub = Orcamento.addSubEtapa(orc, idPai, et.nome || "Etapa", false);
          porEtapa[ei] = { etapaId: idPai, subId: sub ? sub.id : "" };
        } else {
          if (!etapaIds[et.nome]) { Orcamento.addEtapa(orc, et.nome || "Etapa"); etapaIds[et.nome] = orc.etapas[orc.etapas.length - 1].id; }
          porEtapa[ei] = { etapaId: etapaIds[et.nome], subId: "" };
        }
      });
      plano.forEach(function (L) {
        var dest = porEtapa[L.etapaIdx] || porEtapa[0];
        var item = Orcamentista.itemParaOrcamento(L);
        if (!planilhaVence && (L.status === "casado" || L.status === "revisar" || L.status === "propria")) { item.custoUnitario = Number(L.custoUnitario) || 0; item.custoMO = Number(L.custoMO) || 0; item.custoMAT = Number(L.custoMAT) || 0; item.custoEQ = Number(L.custoEQ) || 0; }
        var etapaDest = Util.arr(orc.etapas).filter(function (e) { return e.id === dest.etapaId; })[0], antes = {};
        Util.arr(etapaDest && etapaDest.itens).forEach(function (x) { antes[x.id] = 1; });
        Orcamento.addItem(orc, dest.etapaId, item, L.item.quantidade, dest.subId || undefined);
        /* addItem devolve o orçamento e pode reordenar por sub etapa: o item novo é o id que não existia */
        var it = Util.arr(etapaDest && etapaDest.itens).filter(function (x) { return !antes[x.id]; })[0];
        if (it && item.orcamentista) it.orcamentista = item.orcamentista;
        n[L.status]++;
      });
      orc.orcamentista = { em: new Date().toISOString(), fontes: st.fontes, resumo: n, versao: (typeof CONFIG !== "undefined" ? CONFIG.versao : "") };
      /* a raiz da cobrança da IA fica no orçamento: o próximo uso nele (e nas revisões dele) é revisão, não orçamento novo */
      if (st.raiz) orc.orcmRaiz = st.raiz;
      /* ⚠ o retorno importa aqui também: sem gravar (armazenamento cheio, lista
         ilegível) o editor abria um orçamento que só existia na memória, com o
         toast verde por cima. Recusou: nada troca de tela e a revisão fica. */
      if (!Store.salvarOrcamento(Auth.empresaId(), orc)) {
        this._orcmRecado("O orçamento NÃO foi criado: " + porque() + ". " +
          (gravadas ? gravadas + " composição(ões) própria(s) já ficaram na sua base PRÓPRIA. " : "") + "As decisões continuam neste quadro.");
        return;
      }
      UI.fecharModal();
      this.orcAtual = orc; this.tela = "editor"; this.aba = "planilha"; this.render();
    } else {
      var fora = 0;
      /* MODO ESCOPO (20/10/2026, js/orccompletoui.js): os itens NÃO existem
         ainda — nascem na CÓPIA, na etapa de mesmo nome (ou numa nova), com a
         memória de cálculo da quantidade. Pendente também entra (com a casca
         de código próprio), para nada sumir do orçamento calado. */
      if (st.modo === "escopo") {
        var idPorNome = {};
        Util.arr(copia.etapas).forEach(function (e) { idPorNome[String(e.nome || "").trim().toUpperCase()] = e.id; });
        var destinoDe = function (nome) {
          var k = String(nome || "SERVIÇOS GERAIS").trim().toUpperCase();
          if (!idPorNome[k]) { Orcamento.addEtapa(copia, nome || "SERVIÇOS GERAIS"); idPorNome[k] = copia.etapas[copia.etapas.length - 1].id; }
          return idPorNome[k];
        };
        plano.forEach(function (L) {
          var et = (st.etapasRodadas || [])[L.etapaIdx] || {};
          var etapaId = destinoDe(et.nome);
          var item = Orcamentista.itemParaOrcamento(L);
          if (L.status !== "pendente") { item.custoUnitario = Number(L.custoUnitario) || 0; item.custoMO = Number(L.custoMO) || 0; item.custoMAT = Number(L.custoMAT) || 0; item.custoEQ = Number(L.custoEQ) || 0; }
          var etapaDest = Util.arr(copia.etapas).filter(function (e) { return e.id === etapaId; })[0], antes = {};
          Util.arr(etapaDest && etapaDest.itens).forEach(function (x) { antes[x.id] = 1; });
          Orcamento.addItem(copia, etapaId, item, L.item.quantidade);
          var novo = Util.arr(etapaDest && etapaDest.itens).filter(function (x) { return !antes[x.id]; })[0];
          if (novo) {
            if (item.orcamentista) novo.orcamentista = item.orcamentista;
            if (L.item.formula && !novo.memoriaCalculo) novo.memoriaCalculo = String(L.item.formula);
          }
          n[L.status]++;
        });
        if (st.escopoGerado) copia.escopoGerado = st.escopoGerado;
      } else plano.forEach(function (L) {
        var orig = L.item._ref; if (!orig) return;
        var ref = null;
        for (var k = 0; k < pares.length; k++) { if (pares[k][0] === orig) { ref = pares[k][1]; break; } }
        /* item do plano que o orçamento não tem mais: fica de fora E É DITO */
        if (!ref) { fora++; return; }
        var item = Orcamentista.itemParaOrcamento(L);
        if (L.status === "pendente") { ref.codigo = item.codigo || ref.codigo; ref.baseFonte = item.baseFonte || ref.baseFonte; ref.orcamentista = item.orcamentista; n.pendente++; return; }
        ref.codigo = item.codigo; ref.baseFonte = item.baseFonte;
        ref.origem = (Orcamento._origemDe) ? Orcamento._origemDe(item.codigo, item.baseFonte) : (item.baseFonte || "SINAPI");
        var custoNovo = Number(L.custoUnitario) || 0;
        if (!(L.item.custoPlanilha > 0) || !planilhaVence) { ref.custoUnitario = custoNovo; ref.custoMO = Number(L.custoMO) || 0; ref.custoMAT = Number(L.custoMAT) || 0; ref.custoEQ = Number(L.custoEQ) || 0; }
        ref.orcamentista = item.orcamentista; n[L.status]++;
      });
      copia.orcamentista = { em: new Date().toISOString(), fontes: st.fontes, resumo: n, versao: (typeof CONFIG !== "undefined" ? CONFIG.versao : "") };
      if (st.raiz && !copia.orcmRaiz) copia.orcmRaiz = st.raiz;
      /* ⚠ O RECADO SÓ AFIRMA O QUE O persistir() CONFIRMOU (21/09/2026). Ele
         devolve false em cinco ramos — licença suspensa, plano da obra,
         orçamento alterado em outra janela, aprovado… Esta tela ignorava o
         retorno e soltava o toast verde "N casados" em todos: recado que mente
         é pior que recado nenhum.
         ⚠ O quadro fica ABERTO durante o persistir (como na tela da IA): a
         recusa precisa de onde pousar. `semBackupModal` pelo mesmo motivo de
         lá — o quadro de Backup, por cima, levava a revisão embora. */
      var gravou = false, excecao = null;
      this.orcAtual = copia;
      try { gravou = this.persistir ? this.persistir({ semBackupModal: true, rotulo: "decisões do Orçamentista" }) : !!Store.salvarOrcamento(Auth.empresaId(), copia); }
      catch (eP) { excecao = eP; gravou = false; }
      if (!gravou) {
        if (this.orcAtual === copia) this.orcAtual = orcA;
        var motivo = excecao ? "a gravação falhou (" + String((excecao && excecao.message) || excecao).slice(0, 120) + ")" : porque();
        /* quando o motivo já manda FECHAR o quadro (outra janela gravou: o plano é de
           uma versão que não existe mais), "as decisões continuam aqui" seria um
           segundo caminho, contrário ao primeiro, no mesmo recado */
        this._orcmRecado("As decisões do Orçamentista NÃO foram gravadas: " + motivo + ". " +
          "O orçamento ficou como estava" + (gravadas ? "; " + gravadas + " composição(ões) própria(s) já ficaram na sua base PRÓPRIA" : "") + "." +
          (/feche este quadro/i.test(motivo) ? "" : " As decisões continuam neste quadro."));
        return;
      }
      UI.fecharModal();
      this.render();
    }
    /* ⚠ O USO SE CONTA PELO CONTRATO QUE EXISTE (21/09/2026). Aqui havia
       `Telemetria.evento("orcamentista", {modo, resumo, fontes})` atrás de uma
       guarda `&& Telemetria.evento` — e `evento` NUNCA existiu no
       js/telemetria.js. A guarda calava o erro e o painel de vendas nunca
       soube que o Orçamentista era usado: medição que não mede, com cara de
       medição. O contrato que existe é o contador de módulos, que viaja no
       ping de 5 min e o painel soma em "Módulos mais usados"; o servidor
       (server/vps/telemetria-srv.js) aceita qualquer chave. Conta UMA vez por
       aplicação GRAVADA — as recusas saem por `return` antes daqui. Só o
       contador: nada do orçamento sai da máquina (cabeçalho do telemetria.js).
       ⚠ Sem `&& Telemetria.contaModulo` na guarda, de propósito: se o método
       sumir, o try/catch segura a tela e a suíte acusa — guarda que testa a
       existência do método é o que escondeu este defeito. */
    try { if (typeof Telemetria !== "undefined") Telemetria.contaModulo("orcamentista"); } catch (e) {}
    UI.toast("Orçamentista: " + n.casado + " casados · " + n.revisar + " para revisar · " + n.propria + " composições próprias · " + n.pendente + " pendentes" + (gravadas ? " · " + gravadas + " composição(ões) gravada(s) na base PRÓPRIA" : "") +
      (fora ? " · ⚠ " + fora + " item(ns) do plano não estão mais neste orçamento e ficaram de fora" : "") + ".", (n.pendente || fora) ? "erro" : "ok");
    return true;   // gravado — o modo escopo abre o relatório só neste caso
  };
})(typeof window !== "undefined" ? window : this);
