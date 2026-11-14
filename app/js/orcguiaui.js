/* =====================================================================
 * orcguiaui.js — a FIAÇÃO do orçamento guiado (prévia ?previa=orcamento)
 *
 * O motor mora em js/orcguia.js (puro). Aqui ficam as pontes com o app: reunir
 * o que o motor precisa (bases instaladas, o resultado de Proposta.validar),
 * desenhar o roteiro pelo kit (Modulo.roteiro) e tratar o clique de cada passo.
 *
 * ⚠ TODO clique desta área chega por `data-acao="orcguia-…"` e é despachado
 *   pelo App (um gancho só, em js/app.js, logo depois do `data-gopen`). Nada
 *   aqui ouve clique por conta própria: dois ouvintes no mesmo botão já
 *   duplicaram ação neste app.
 * ⚠ NADA DAQUI GRAVA PREÇO NEM DECIDE REGRA: navega, abre painel e chama o
 *   que o app já tinha (abrirTabelas, gerarProposta, o modal Dados). Quem
 *   grava é o App (persistir), com as mesmas travas de sempre.
 * ES5, IIFE.
 * ===================================================================== */
(function (global) {
  "use strict";

  function s(v) { return String(v === null || v === undefined ? "" : v); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function esc(v) { return (global.Util && Util.esc) ? Util.esc(v) : s(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg, tipo) { try { if (global.UI && UI.toast) UI.toast(msg, tipo || "ok"); } catch (e) {} }

  var OrcGuiaUI = {
    /* a prévia está ligada neste aparelho? */
    ativa: function () { return !!(global.OrcGuia && OrcGuia.previa()); },

    /* O que o motor precisa saber do app. `extra` traz o que o editor já calculou
       (itens sem preço/quantidade) para não refazer a conta do orçamento inteiro. */
    ctx: function (orc, extra) {
      var x = extra || {}, c = { bases: [], sinapi: {}, totais: {}, semPreco: [], semQtd: [], provisorio: 0, validar: { ok: false, faltando: [] } };
      try { c.bases = (global.Bases && Bases.lista) ? Bases.lista() : []; } catch (e) {}
      try { c.sinapi = { carregado: !!(global.Sinapi && Sinapi.carregado), uf: global.Sinapi ? Sinapi.uf : "", competencia: global.Sinapi ? Sinapi.competencia : "" }; } catch (e1) {}
      try { c.totais = x.totais || Orcamento.totais(orc); } catch (e2) {}
      try { c.semPreco = x.semPreco || (Orcamento.itensSemPreco ? Orcamento.itensSemPreco(orc) : []); } catch (e3) {}
      try { c.semQtd = x.semQtd || (Orcamento.itensSemQuantidade ? Orcamento.itensSemQuantidade(orc) : []); } catch (e4) {}
      try { c.provisorio = x.provisorio != null ? x.provisorio : (Orcamento.itensPrecoProvisorio ? Orcamento.itensPrecoProvisorio(orc).length : 0); } catch (e5) {}
      try { c.validar = Proposta.validar(orc); } catch (e6) {}
      return c;
    },

    passos: function (orc, extra) { return OrcGuia.passos(orc, this.ctx(orc, extra)); },

    /* o HTML do roteiro, para o editor encaixar no topo */
    roteiroHtml: function (orc, extra) {
      try {
        return Modulo.roteiro(this.passos(orc, extra), { id: "orcguia-roteiro", rotulo: "Roteiro do orçamento até a proposta" });
      } catch (e) { return ""; }
    },

    /* ---- despacho: tudo que começa por `orcguia-` ---- */
    acao: function (app, acao, t) {
      var d = (t && t.dataset) || {};
      switch (acao) {
        case "orcguia-passo": this.passo(app, d.passo); break;
        case "orcguia-ir": this.ir(app, d.alvo, { fechar: true }); break;
        case "orcguia-cond-salvar": this.salvarCondicoes(app); break;
        case "orcguia-dados": app.editarDadosOrc(); break;
        case "orcguia-params": this.abrirParametros(app); break;
        case "orcguia-interesse": this.escolherInteresse(app, d.id); break;
        case "orcguia-liberar": try { var ap0 = document.querySelector(".app"); if (ap0) ap0.classList.remove("menu-aberto"); } catch (eM) {} this.abrirInteresse(app, { liberar: true }); break;   /* no celular a gaveta do menu fecha antes do quadro abrir */
        case "orcguia-bases": this.abrirBases(app, app.tela === "editor" ? app.orcAtual : null); break;
        case "orcguia-base-instalar": this.instalarBase(app, d.cat, false); break;
        case "orcguia-base-atualizar": this.instalarBase(app, d.cat, true); break;
        default: break;
      }
    },

    /* o clique num passo do roteiro: leva ao lugar que o resolve */
    passo: function (app, id) {
      var orc = app.orcAtual; if (!orc) return;
      var p = this.passos(orc).filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      if (id === "base") {
        /* faltando uma base que o programa sabe instalar: abre o painel e já começa a instalar — "Falta a base X. Clique para instalar" é UM clique */
        var pf = p.pendencias.filter(function (x) { return x.instalar && x.item; })[0];
        if (pf && p.estado === "falta") this.abrirBases(app, orc, { foco: pf.item.catId, instalarAuto: pf.item.catId });
        else this.abrirBases(app, orc);
        return;
      }
      if (id === "itens") {
        var tipo = (p.pendencias[0] && p.pendencias[0].alvo) || "itens";
        this.ir(app, tipo === "itens" && p.estado === "ok" ? "planilha" : tipo); return;
      }
      if (id === "bdi") { this.ir(app, (p.pendencias[0] && p.pendencias[0].alvo) || "bdi"); return; }
      if (id === "proposta") { app.gerarProposta(); return; }   /* pendente: o próprio gerarProposta abre o quadro "Falta para gerar" */
    },

    /* Vai até o lugar que resolve uma pendência. `alvo` vem do motor
       (base | itens | preco | quantidade | escopo | cliente | condicoes | bdi | planilha). */
    ir: function (app, alvo, op) {
      var self = this, orc = app.orcAtual; if (!orc) return;
      if (op && op.fechar) { try { UI.fecharModal(); } catch (e) {} }
      var aba = function (n) { if (app.aba !== n) { app.aba = n; } app.render(); };
      switch (alvo) {
        case "base": this.abrirBases(app, orc); break;
        case "itens":
          if (!(global.Orcamento && Orcamento.totais(orc).qtdItens > 0)) { aba("planilha"); try { app.abrirEscopo(); } catch (eE) {} }
          else aba("planilha");
          break;
        case "planilha": case "escopo": aba("planilha"); break;
        case "preco": case "quantidade": this.irItemPendente(app, orc, alvo); break;
        case "cliente": case "condicoes": case "bdi":
          aba("bdi");
          this.focar(alvo === "cliente" ? "og-cliente" : (alvo === "condicoes" ? "og-pagamento" : "og-cond"));
          break;
        default: break;
      }
    },

    /* a primeira linha da planilha com preço zerado (ou quantidade pendente): abre a etapa, rola e põe o cursor no campo */
    irItemPendente: function (app, orc, alvo) {
      var campo = alvo === "quantidade" ? "quantidade" : "custoUnitario", achou = null;
      arr(orc.etapas).forEach(function (e) {
        if (achou) return;
        arr(e.itens).forEach(function (it) {
          if (achou) return;
          var falta = alvo === "quantidade" ? (it.qtdPendente || !(Number(it.quantidade) > 0)) : !(Number(it.custoUnitario) > 0);
          if (falta) achou = { e: e, it: it };
        });
      });
      if (app.aba !== "planilha") app.aba = "planilha";
      if (achou) { try { app.expandirEtapa(achou.e.id, achou.it.subEtapaId); } catch (eX) {} }
      app.render();
      if (!achou) return;
      setTimeout(function () {
        var el = document.querySelector('input[data-edit="' + campo + '"][data-eta="' + achou.e.id + '"][data-itm="' + achou.it.id + '"]');
        if (el) { try { el.scrollIntoView({ block: "center" }); el.focus(); } catch (e2) {} }
        else toast("O item " + (achou.it.codigo || "") + " está numa etapa recolhida ou fora do filtro. Abra a etapa para editar.", "erro");
      }, 30);
    },

    /* =================================================================
     * O PAINEL "BASES E COMPOSIÇÕES"
     *
     * Antes: a base de preço só se instalava no menu da conta > "Tabelas de
     * preço", e o cliente novo descobria que faltava quando a busca vinha
     * vazia. Aqui as bases que importam ao orçamento, uma linha cada, com o
     * que são, a UF, a competência instalada e o botão que resolve.
     *
     * ⚠ NÃO HÁ MOTOR NOVO: a conta de "o que está instalado" é a do
     *   BaseExigida.situacao e a instalação é o BaseExigida.garantir /
     *   instaladorPadrao (o MESMO caminho do CPLPRO: pacote do app, servidor,
     *   espelho). Instalar grava na empresa inteira, por isso respeita o
     *   App._podeBases (só administrador) — a guarda é na função, não no botão.
     * ⚠ NUNCA INVENTA BASE: sem internet o recado diz que não conseguiu; a
     *   linha continua "Falta".
     * ================================================================= */
    DESCRICAO: {
      SINAPI: "Preços e composições de obras da Caixa, por estado. A mão de obra leva a contribuição previdenciária sobre a folha.",
      SINAPI_DES: "A mesma tabela, com a mão de obra sem essa contribuição. Use quando o edital ou o contrato pedir preço desonerado."
    },

    /* as linhas do painel: SINAPI (as duas), as demais bases instaladas ou exigidas pelos itens, e as composições próprias */
    linhasBases: function (orc, ufSel) {
      var bases = [], B = global.BaseExigida, uso = orc ? OrcGuia.usoDeBases(orc) : {}, linhas = [];
      try { bases = Bases.lista(); } catch (e) {}
      var uf = String((orc && orc.uf) || ufSel || (global.Sinapi && Sinapi.uf) || "").toUpperCase();
      ["SINAPI", "SINAPI_DES"].forEach(function (cat) {
        var item = { catId: cat, base: "SINAPI", uf: uf, competencia: "", regime: cat === "SINAPI" ? "onerado" : "desonerado" };
        var st = B.situacao([item], bases)[0] || { estado: "ausente", instalada: null };
        linhas.push({ cat: cat, item: item, titulo: "SINAPI", sub: cat === "SINAPI" ? "não desonerada" : "desonerada", desc: OrcGuiaUI.DESCRICAO[cat],
          estado: st.estado, instalada: st.instalada, exigida: uso[cat] > 0, uf: uf });
      });
      var vistos = { SINAPI: 1, SINAPI_DES: 1, PROPRIA: 1 };
      bases.forEach(function (b) {
        var cat = String(b.fonte || "").toUpperCase();
        if (vistos[cat]) return; vistos[cat] = 1;
        var item = { catId: cat, base: b.label || cat, uf: b.uf || "", competencia: "", regime: "" };
        linhas.push({ cat: cat, item: item, titulo: b.label || cat, sub: "", desc: "Tabela de preço instalada nesta conta. Atualiza sozinha uma vez por dia.", estado: "instalada", instalada: b, exigida: uso[cat] > 0, uf: b.uf || "" });
      });
      Object.keys(uso).forEach(function (cat) {
        if (vistos[cat]) return; vistos[cat] = 1;
        var item = { catId: cat, base: cat, uf: "", competencia: "", regime: "" };
        var st = B.situacao([item], bases)[0] || { estado: "ausente" };
        linhas.push({ cat: cat, item: item, titulo: cat, sub: "", desc: st.estado === "assinatura" ? "Base de assinatura do órgão: a RA não a distribui. Importe o arquivo da sua empresa em Todas as tabelas de preço." : "Base usada por itens deste orçamento e ainda não instalada.",
          estado: st.estado, instalada: null, exigida: true, uf: "" });
      });
      return linhas;
    },

    _compTxt: function (b) {
      if (!b) return "";
      var c = b.competencia;
      try { if (global.BasesCat && BasesCat.fmtVersao) return BasesCat.fmtVersao(c) || s(c); } catch (e) {}
      return s(c);
    },

    _htmlBases: function (orc) {
      var st = this._bs, self = this, ocupado = st.ocupado || {};
      var linhas = st.linhas = this.linhasBases(orc, st.ufSel);
      var propria = 0; try { (Bases.lista() || []).forEach(function (b) { if (String(b.fonte).toUpperCase() === "PROPRIA") propria = b.total || 0; }); } catch (e) {}
      var uf = linhas[0] ? linhas[0].uf : "";
      var ufCampo;
      if (orc) {
        var cd = orc.competenciaSinapi ? (global.BaseExigida ? (BaseExigida.fmtComp(BaseExigida.comp(orc.competenciaSinapi)) || orc.competenciaSinapi) : orc.competenciaSinapi) : "";
        ufCampo = '<p class="obs-uf">Estado do orçamento: <b>' + esc(uf || "não informado") + "</b>" + (cd ? ", competência declarada <b>" + esc(cd) + "</b>" : "") + ".</p>";
      } else {
        var ufs = []; try { (global.App._estados || []).forEach(function (e) { var u = String(e.uf).toUpperCase(); if (u && ufs.indexOf(u) < 0) ufs.push(u); }); } catch (e1) {}
        ufs.sort();
        ufCampo = '<div class="field obs-uf-campo"><label for="obs-uf">Estado</label><select id="obs-uf">' + ufs.map(function (u) { return '<option value="' + u + '"' + (u === uf ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></div>";
      }
      /* o recado da última instalação fica no TOPO: no celular, no pé da lista, ficava fora da tela */
      var recado = st.recado ? '<div class="mod-aviso mod-aviso-' + (st.recado.tom || "info") + '" role="status"><div class="mod-aviso-txt"><span>' + esc(st.recado.texto) + "</span></div></div>" : "";
      var html = '<p class="obs-intro">Os preços do orçamento vêm destas tabelas. Instale a que você vai usar; o programa a mantém atualizada.</p>' + ufCampo + recado;
      html += '<ul class="obs-lista">' + linhas.map(function (l) {
        var inst = l.instalada, compTxt = self._compTxt(inst), pil, acao = "", meta;
        var busy = !!ocupado[l.cat];
        if (l.estado === "instalada") { pil = Modulo.pilula("Instalada", "ok"); meta = (inst && inst.uf ? esc(inst.uf) + ", " : "") + "competência " + esc(compTxt || "—"); }
        else if (l.estado === "assinatura") { pil = Modulo.pilula("Assinatura", "info"); meta = "Importe o arquivo do órgão"; }
        else {
          pil = Modulo.pilula(l.exigida ? "Falta" : "Não instalada", l.exigida ? "alerta" : "neutro");
          meta = inst && inst.uf && l.uf && String(inst.uf).toUpperCase() !== l.uf ? "Carregada agora: " + esc(inst.uf) + ", " + esc(compTxt || "—") + ". Falta " + esc(l.uf) + "." : (l.uf ? "Estado " + esc(l.uf) : "");
        }
        if (busy) acao = '<span class="obs-pontos" aria-hidden="true"><i></i><i></i><i></i></span><span class="obs-andamento" role="status">Baixando e conferindo</span>';
        else if (l.estado === "ausente") acao = '<button type="button" class="btn ' + (l.exigida ? "primary" : "") + '" data-acao="orcguia-base-instalar" data-cat="' + esc(l.cat) + '">Instalar</button>';
        else if (l.estado === "instalada") acao = '<button type="button" class="btn ghost" data-acao="orcguia-base-atualizar" data-cat="' + esc(l.cat) + '" title="Baixa a competência mais recente desta base">Atualizar</button>';
        return '<li class="obs-linha' + (st.foco === l.cat ? " obs-foco" : "") + '" data-base="' + esc(l.cat) + '">' +
          '<div class="obs-nome"><b>' + esc(l.titulo) + "</b>" + (l.sub ? '<span class="obs-sub">' + esc(l.sub) + "</span>" : "") + pil + "</div>" +
          '<p class="obs-desc">' + esc(l.desc) + "</p>" + '<p class="obs-meta">' + meta + "</p>" +
          '<div class="obs-acao">' + acao + "</div></li>";
      }).join("") +
        '<li class="obs-linha" data-base="PROPRIA"><div class="obs-nome"><b>Composições próprias</b>' + Modulo.pilula(propria ? propria + (propria === 1 ? " item" : " itens") : "Nenhuma", propria ? "ok" : "neutro") + "</div>" +
        '<p class="obs-desc">Composições que você mesmo criou, a partir dos insumos das bases. Valem só nesta conta.</p><p class="obs-meta"></p>' +
        '<div class="obs-acao"><button type="button" class="btn ghost" data-acao="criar-composicao">Criar composição</button></div></li></ul>';
      return html;
    },

    _pintarBases: function () {
      var st = this._bs, el = document.getElementById("obs-corpo");
      if (!st || !el) return;
      el.innerHTML = this._htmlBases(st.orc);
      this._ligarBases();
    },
    _ligarBases: function () {
      var self = this, sel = document.getElementById("obs-uf");
      if (sel) sel.onchange = function () { self._bs.ufSel = sel.value; self._pintarBases(); };
      var foco = this._bs && this._bs.foco;
      if (foco && !this._bs.focoFeito) {
        this._bs.focoFeito = true;
        var li = document.querySelector('.obs-linha[data-base="' + foco + '"]');
        if (li) { try { li.scrollIntoView({ block: "center" }); var b = li.querySelector("button"); if (b) b.focus(); } catch (e) {} }
      }
    },

    /* op: { foco: catId (a linha que a pessoa veio resolver), instalarAuto: catId (começa a instalar ao abrir) } */
    abrirBases: function (app, orc, op) {
      op = op || {};
      this._bs = { orc: orc || null, ocupado: {}, foco: op.foco || "", focoFeito: false, ufSel: "", recado: null, linhas: [] };
      var bg = UI.modal("Bases e composições",
        '<div id="obs-corpo" class="obs">' + this._htmlBases(orc || null) + "</div>",
        [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); if (app.render && app.tela === "editor") app.render(); } },
         { texto: "Todas as tabelas de preço", classe: "", onClick: function () { UI.fecharModal(); app.abrirTabelas(); } }]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "780px";
      this._ligarBases();
      if (op.instalarAuto) this.instalarBase(app, op.instalarAuto, false);
    },

    instalarBase: function (app, cat, atualizar) {
      var self = this, st = this._bs; if (!st) return;
      cat = String(cat || "").toUpperCase();
      var linha = (st.linhas || []).filter(function (l) { return l.cat === cat; })[0];
      if (!linha) return;
      if (app._podeBases && !app._podeBases()) { app._recusaBases("Instalar uma tabela de preço"); return; }
      if (st.ocupado[cat]) return;   /* clique duplo não baixa duas vezes */
      var B = global.BaseExigida, item = {}, k; for (k in linha.item) item[k] = linha.item[k];
      var lista = function () { try { return Bases.lista(); } catch (e) { return []; } };
      st.ocupado[cat] = true; st.recado = null; st.foco = cat; this._pintarBases();
      var fim = function (tom, texto) {
        st.ocupado[cat] = false; st.recado = { tom: tom, texto: texto };
        if (document.getElementById("obs-corpo")) self._pintarBases();
        toast(texto, tom === "erro" ? "erro" : "ok");
        if (tom !== "erro" && app.render && app.tela === "editor") { try { app.render(); } catch (eR) {} }
      };
      var nome = (item.catId === "SINAPI_DES" ? "SINAPI desonerada" : (linha.titulo || item.catId)) + (item.uf ? " " + item.uf : "");
      if (atualizar) {
        return B.instaladorPadrao()(item).then(function () { fim("ok", nome + " atualizada."); }, function (err) { fim("erro", "Não consegui atualizar " + nome + ": " + s(err && err.message ? err.message : err) + ". A base atual foi mantida."); });
      }
      return B.garantir([item], { instalar: B.instaladorPadrao(), instaladas: lista }).then(function (res) {
        if (res.ok) { var av = (res.avisos && res.avisos[0]) || ""; fim(av ? "info" : "ok", nome + " instalada." + (av ? " " + av : "")); return; }
        var f = (res.falhou[0] || res.precisaImportar[0] || {}).motivo || ("Não consegui instalar " + nome + ".");
        fim("erro", f);
      }, function (err) { fim("erro", "Não consegui instalar " + nome + ": " + s(err && err.message ? err.message : err)); });
    },

    /* =================================================================
     * D — O QUADRO "FALTA PARA GERAR A PROPOSTA"
     *
     * Antes: [Gerar Proposta] sem os dados mostrava um toast ("Faltam dados:
     * …") que some em poucos segundos — a pessoa lia a metade e saía
     * procurando onde resolver. Agora é um quadro que fica na tela: uma linha
     * por pendência de Proposta.validar (a mesma lista, sem regra nova), e o
     * botão de cada linha leva direto ao lugar (aba, campo ou linha da
     * planilha). Ao resolver e voltar, o roteiro do topo já está atualizado.
     * ================================================================= */
    ROTULO_ALVO: { cliente: "Informar o cliente", condicoes: "Definir o pagamento", preco: "Informar o preço", quantidade: "Calcular a quantidade", itens: "Montar os itens", escopo: "Ver as etapas", base: "Abrir as bases" },

    htmlQuadroFalta: function (pendencias) {
      var lista = arr(pendencias);
      return '<p class="ogf-intro">A proposta só sai depois de resolver ' + (lista.length === 1 ? "este ponto" : "estes " + lista.length + " pontos") + ". Cada botão leva ao lugar onde se resolve.</p>" +
        '<ul class="ogf-lista">' + lista.map(function (p) {
          var alvo = p.alvo || "condicoes";
          return '<li class="ogf-item"><span class="ogf-txt">' + esc(p.texto) + '</span><button type="button" class="btn" data-acao="orcguia-ir" data-alvo="' + esc(alvo) + '">' + esc(OrcGuiaUI.ROTULO_ALVO[alvo] || "Resolver") + "</button></li>";
        }).join("") + "</ul>";
    },

    /* `val` = o resultado de Proposta.validar (com `itens`); sem ele, o quadro o pede */
    quadroFalta: function (app, orc, val) {
      var v = val || Proposta.validar(orc), pend = OrcGuia.pendenciasProposta(v);
      if (!pend.length) { app.gerarProposta(); return; }
      var bg = UI.modal("Falta para gerar a proposta", this.htmlQuadroFalta(pend),
        [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "620px";
      try { var b = document.querySelector("#modal-bg .ogf-item .btn"); if (b) b.focus(); } catch (e) {}
    },

    /* =================================================================
     * C — A ESCOLHA DO DESENHO, POR TIPO DE CLIENTE
     *
     * No passo ④ a pergunta é "para quem é a proposta?", não "qual layout?".
     * Três cartões (Prefeitura / Órgão público, Particular, Empresa /
     * Condomínio) levam ao modelo de fábrica do tipo; o quarto é o documento
     * padrão de sempre. Os modelos do próprio usuário ficam em "Outros
     * desenhos". ⚠ Os inputs são os MESMOS de antes (`name="opl"`): quem
     * lê a escolha (App.gerarProposta) não mudou.
     * ================================================================= */
    tipoSugerido: function (orc) {
      try { if (global.Orcamento && Orcamento.ehCertame && Orcamento.ehCertame(orc)) return "publico"; } catch (e) {}
      var doc = s(orc && orc.cliente && orc.cliente.doc).replace(/\D/g, "");
      if (doc.length === 14) return "empresa";
      if (doc.length === 11) return "particular";
      return "";
    },

    htmlEscolhaModelo: function (app, orc, modelos, sugId) {
      var T = global.PropTpl, tipos = T.TIPOS_CLIENTE, brutos = arr(modelos);
      var norm = brutos.map(function (m) { var mm = T.modelo(m); mm.id = m.id; return mm; });
      var doTipo = function (id) { return norm.filter(function (m) { return m.tipoCliente === id; })[0]; };
      var sugTipo = this.tipoSugerido(orc);
      /* ⚠ `sugId` (App.gerarProposta) cai no PRIMEIRO modelo da lista quando ninguém escolheu um — e com os três por tipo semeados isso
         marcaria sempre o da prefeitura. Aqui só vale a PREFERÊNCIA de verdade: o modelo do cliente ou o marcado como padrão. */
      var cliId = ""; try { cliId = Proposta.clienteIdDoOrcamento(orc); } catch (eC) {}
      var pref = norm.filter(function (m) { return cliId && brutos.filter(function (b) { return b.id === m.id; })[0].paraCliente === cliId; })[0] || norm.filter(function (m) { return m.padrao; })[0] || null;
      /* quem montou um modelo PRÓPRIO (sem origem de fábrica) quer usá-lo — a regra da carpintaria (`propModeloPara`) e do e2e-proposta-modelo: vem
         depois da preferência do cliente / do padrão e do tipo sugerido, e antes do documento padrão */
      var proprio = norm.filter(function (m) { return !m.base && !m.tipoCliente; })[0] || null;
      var marcado = pref ? pref.id : (sugTipo && doTipo(sugTipo) ? doTipo(sugTipo).id : (proprio ? proprio.id : ""));
      var card = function (valor, titulo, desc, extra, sugerido, classe) {
        return '<label class="ogm-card' + (classe ? " " + classe : "") + '"><input type="radio" name="opl" value="' + esc(valor) + '"' + (valor === marcado ? " checked" : "") + ">" +
          '<span class="ogm-txt"><span class="ogm-tit"><b>' + esc(titulo) + "</b>" + (valor && valor === marcado ? Modulo.pilula("Sugerido", "info") : "") + '</span><span class="ogm-desc">' + esc(desc) + "</span>" + (extra || "") + "</span></label>";
      };
      var h = '<p class="ogm-intro">Para quem é esta proposta? O conteúdo e os preços são os mesmos; muda o layout do papel. <b>Gerar</b> abre para imprimir ou salvar em PDF; <b>Gerar em Word</b> baixa o .docx com o texto editável.</p>';
      h += '<div class="ogm-grade">';
      tipos.forEach(function (tp) {
        var mod = doTipo(tp.id);
        if (!mod) return;
        var extra = tp.id === "publico"
          ? '<button type="button" class="btn sm ogm-pacote" data-acao="orc-ref" title="Orçamento de referência no padrão do órgão: sintética, analítica, BDI, encargos, curva ABC, cronograma e declarações (PDF + Excel)">Pacote da prefeitura</button>' : "";
        h += card(mod.id, tp.nome, tp.desc, extra, tp.id === sugTipo, tp.id === "publico" ? "ogm-card-publico" : "");
      });
      h += card("", "Documento padrão do sistema", "O documento completo de sempre", "", false);
      h += "</div>";
      /* as declarações opcionais só aparecem com o cartão do órgão público marcado (CSS: .ogm-grade:has(.ogm-card-publico input:checked) ~ .ogm-decl) */
      if (doTipo("publico")) h += this.htmlDeclaracoes(orc);
      var outros = norm.filter(function (m) { return !m.tipoCliente; });
      if (outros.length) {
        var abre = outros.some(function (m) { return m.id === marcado; });
        h += '<details class="ogm-outros"' + (abre ? " open" : "") + "><summary>Outros desenhos (" + outros.length + ")</summary><div class=\"ogm-grade\">" +
          outros.map(function (m) { return card(m.id, m.nome, m.descricao || (m.paginas.length + " páginas"), "", false); }).join("") + "</div></details>";
      }
      return h;
    },

    /* =================================================================
     * AS DECLARAÇÕES OPCIONAIS DA CARTA DE ÓRGÃO PÚBLICO (13/11/2026)
     *
     * As declarações OBRIGATÓRIAS ficam gravadas no modelo e saem sempre
     * (js/proptpl.js, página "Declarações" do modelo de órgão público) — nada
     * aqui as altera. Estas são as que dependem do edital e do licitante, e a
     * pessoa as marca na hora de gerar a proposta (passo ④), no próprio quadro
     * do desenho: desmarcadas por padrão, e a escolha fica gravada NO
     * ORÇAMENTO (`comercial.declaracoesOpcionais`) para a próxima vez.
     *
     * ⚠ O QUE CADA FRASE CITA FOI CONFERIDO NO PLANALTO (13/11/2026):
     *   · ME/EPP: art. 3º da LC nº 123/2006 define microempresa e empresa de
     *     pequeno porte; o § 4º do mesmo artigo lista as vedações — a frase
     *     cita o artigo e o parágrafo, como no texto da lei.
     *   · Elaboração independente: sem citação legal (o pedido foi esse).
     *   · Art. 14 da Lei nº 14.133/2021: o inciso IV é o do vínculo com
     *     dirigente do órgão ou agente público da licitação / fiscalização /
     *     gestão do contrato, inclusive por parentesco até o terceiro grau. A
     *     frase só diz isso e cita "art. 14" e "IV"; nenhum outro inciso.
     * ⚠ A IMPUGNAÇÃO: quem impugna (ou já impugnou) o edital não pode, na mesma
     *   carta, declarar que "concorda com todas as suas condições". A caixa troca
     *   essa frase por "Temos pleno conhecimento do edital e de seus anexos".
     * ⚠ O DOCUMENTO LEVA UMA CÓPIA AJUSTADA DO MODELO (modeloComDeclaracoes): o
     *   modelo gravado da empresa não é tocado.
     * ================================================================= */
    DECLARACOES_OPCIONAIS: [
      { id: "mepp", rotulo: "Sou microempresa ou empresa de pequeno porte",
        dica: "LC nº 123/2006, art. 3º",
        texto: "Declaramos, sob as penas da lei, que esta empresa se enquadra como microempresa ou empresa de pequeno porte, nos termos do art. 3º da Lei Complementar nº 123/2006, e não se enquadra nas vedações do § 4º do mesmo artigo" },
      { id: "indep", rotulo: "Elaboração independente da proposta",
        dica: "o edital costuma pedir",
        texto: "Declaramos que esta proposta foi elaborada de maneira independente, e que seu conteúdo não foi, no todo ou em parte, informado, discutido ou recebido de qualquer outro participante ou potencial participante desta licitação" },
      { id: "art14", rotulo: "Sem vínculo nem impedimento do art. 14",
        dica: "Lei nº 14.133/2021, art. 14",
        texto: "Declaramos que não incorremos nas hipóteses de impedimento do art. 14 da Lei nº 14.133/2021 e que não mantemos vínculo com dirigente do órgão contratante nem com agente público que atue nesta licitação ou na fiscalização ou na gestão do contrato, inclusive por parentesco até o terceiro grau (art. 14, IV)" }
    ],
    FRASE_CONCORDO: "Temos pleno conhecimento do edital e de seus anexos e concordamos com todas as suas condições",
    FRASE_IMPUGNA: "Temos pleno conhecimento do edital e de seus anexos",

    /* o que a pessoa marcou neste orçamento (tudo desmarcado quando nunca escolheu) */
    declaracoesDoOrc: function (orc) {
      var d = (orc && orc.comercial && orc.comercial.declaracoesOpcionais) || {};
      return { mepp: d.mepp === true, indep: d.indep === true, art14: d.art14 === true, impugna: d.impugna === true };
    },

    /* a cópia do modelo com as declarações da escolha. Só mexe na página de declarações do modelo de ÓRGÃO PÚBLICO
       (a que começa com "Declaramos que:"); modelo de outro tipo volta igual. */
    modeloComDeclaracoes: function (modelo, orc) {
      if (!modelo || modelo.tipoCliente !== "publico") return modelo;
      var sel = this.declaracoesDoOrc(orc), self = this;
      var m = JSON.parse(JSON.stringify(modelo));
      (m.paginas || []).forEach(function (pg) {
        if (pg.tipo !== "condicoes" || !/^Declaramos que:/.test(s(pg.paragrafos))) return;
        var linhas = s(pg.paragrafos).split(/\r?\n/), cab = linhas.shift();
        var corpo = linhas.filter(function (l) { return s(l).replace(/^\s+|\s+$/g, ""); }).map(function (l) { return s(l).replace(/^\s+|\s+$/g, "").replace(/[;.]$/, ""); });
        if (sel.impugna) corpo = corpo.map(function (l) { return l === self.FRASE_CONCORDO ? self.FRASE_IMPUGNA : l; });
        self.DECLARACOES_OPCIONAIS.forEach(function (d) { if (sel[d.id]) corpo.push(d.texto); });
        pg.paragrafos = [cab].concat(corpo.map(function (l, i) { return l + (i === corpo.length - 1 ? "." : ";"); })).join("\n");
      });
      return m;
    },

    htmlDeclaracoes: function (orc) {
      var sel = this.declaracoesDoOrc(orc);
      var caixa = function (id, rotulo, dica) {
        return '<label class="od-linha"><input type="checkbox" id="od-' + id + '"' + (sel[id] ? " checked" : "") + '><span class="od-txt">' + esc(rotulo) + (dica ? '<small>' + esc(dica) + "</small>" : "") + "</span></label>";
      };
      return '<fieldset class="ogm-decl"><legend>Declarações da carta</legend>' +
        '<p class="od-sub">As declarações obrigatórias saem sempre. Marque as que o edital pede; a escolha fica gravada neste orçamento.</p>' +
        this.DECLARACOES_OPCIONAIS.map(function (d) { return caixa(d.id, d.rotulo, d.dica); }).join("") +
        '<div class="od-sep"></div>' +
        caixa("impugna", "Vou impugnar (ou já impugnei) o edital", "troca “concordamos com todas as suas condições” por “Temos pleno conhecimento do edital e de seus anexos”") +
        "</fieldset>";
    },

    /* lê as caixas do quadro do desenho e grava no orçamento (só se o quadro as trouxe) */
    guardarDeclaracoes: function (app) {
      var orc = app && app.orcAtual; if (!orc || !document.getElementById("od-mepp")) return;
      /* ⚠ SÓ COM O CARTÃO DO ÓRGÃO PÚBLICO MARCADO (as caixas estão no quadro, escondidas por CSS, com qualquer desenho). Persistir é uma
         edição à mão: apaga o [Desfazer] da IA. Gravar "tudo desmarcado" ao gerar o documento de sempre faria isso a toda proposta. */
      if (!document.querySelector(".ogm-card-publico input:checked")) return;
      var v = function (id) { var el = document.getElementById("od-" + id); return !!(el && el.checked); };
      var novo = { mepp: v("mepp"), indep: v("indep"), art14: v("art14"), impugna: v("impugna") };
      var atual = this.declaracoesDoOrc(orc), salvo = !!(orc.comercial && orc.comercial.declaracoesOpcionais);
      /* nada marcado e nada gravado = o padrão: não há o que lembrar (e não se persiste à toa) */
      if (!salvo && !novo.mepp && !novo.indep && !novo.art14 && !novo.impugna) return;
      if (salvo && novo.mepp === atual.mepp && novo.indep === atual.indep && novo.art14 === atual.art14 && novo.impugna === atual.impugna) return;
      orc.comercial = orc.comercial || {};
      orc.comercial.declaracoesOpcionais = novo;
      try { app.persistir(); } catch (e) {}   /* orçamento aprovado recusa gravar: a carta sai com a escolha mesmo assim */
    },

    /* semeia os modelos por tipo de cliente (idempotente; só com a prévia ligada) */
    semearModelos: function () {
      try { return (global.Gestao && Gestao.propModelosSemearTipos) ? Gestao.propModelosSemearTipos() : 0; } catch (e) { return 0; }
    },

    /* =================================================================
     * E — A PORTA ÚNICA DE BDI E CONDIÇÕES (a aba "BDI & Parâmetros" = passo ③)
     *
     * Antes: o cliente e o pagamento moravam no modal Dados (menu Mais), os
     * parâmetros noutro modal (Mais > Parâmetros) e o BDI na aba — três
     * lugares para o mesmo passo. Na prévia a aba reúne tudo: o BDI, o
     * cliente e as condições da proposta (com o botão de salvar ali mesmo) e o
     * resumo dos parâmetros. [Dados] e [Parâmetros] do menu Mais viram
     * ATALHOS para esta aba; o modal completo continua a um clique
     * ("Mais dados da proposta", "Editar parâmetros").
     *
     * ⚠ NADA DE REGRA NOVA: grava os mesmos campos do modal Dados
     *   (cliente.nome, comercial.condicoesPagamento / prazoExecucao /
     *   validadeDias) pelo mesmo App.persistir — inclusive a trava do
     *   orçamento aprovado e a regra do certame (validade vazia = "conforme o
     *   edital", nunca 0).
     * ================================================================= */
    htmlCondicoes: function (orc) {
      var o = orc || {}, c = (global.Orcamento && Orcamento.garantirComercial) ? Orcamento.garantirComercial(o) : (o.comercial || {});
      var certame = false; try { certame = !!(global.Orcamento && Orcamento.ehCertame && Orcamento.ehCertame(o)); } catch (e) {}
      var nomes = [];
      try { (Store.listar(Auth.empresaId(), "clientes") || []).forEach(function (x) { var n = s((x && (x.nome || x.razaoSocial)) || "").trim(); if (n && nomes.indexOf(n) < 0) nomes.push(n); }); } catch (e1) {}
      var val = c.validadeDias == null ? (certame ? "" : 15) : c.validadeDias;
      var h = '<div class="og-campos">' +
        '<div class="field og-largo"><label for="og-cliente">Cliente</label><input id="og-cliente" type="text" autocomplete="off" list="og-clientes" value="' + esc(o.cliente && o.cliente.nome) + '" placeholder="Nome de quem recebe a proposta">' +
          '<datalist id="og-clientes">' + nomes.slice(0, 200).map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join("") + "</datalist></div>" +
        '<div class="field"><label for="og-validade">Validade da proposta (dias)</label><input id="og-validade" type="number" min="0" step="1" value="' + esc(val) + '"' + (certame ? ' placeholder="Conforme o edital"' : "") + "></div>" +
        '<div class="field"><label for="og-prazo">Prazo de execução</label><input id="og-prazo" type="text" value="' + esc(c.prazoExecucao) + '"></div>' +
        '<div class="field og-largo"><label for="og-pagamento">Condições de pagamento</label><textarea id="og-pagamento" rows="3">' + esc(c.condicoesPagamento) + "</textarea></div></div>" +
        '<div class="og-rodape"><button type="button" class="btn acao-forte" data-acao="orcguia-cond-salvar">Salvar condições</button>' +
        '<button type="button" class="btn ghost" data-acao="orcguia-dados" title="Garantia, incluso e não incluso, premissas, responsabilidades, ART e data da vistoria">Mais dados da proposta</button></div>';
      return h;
    },
    secaoCondicoes: function (orc) {
      return Modulo.secao({ id: "og-cond", titulo: "Cliente e condições", sub: "O que a proposta imprime. Sem o cliente e o pagamento ela não é gerada.", corpoHtml: this.htmlCondicoes(orc) });
    },

    /* o resumo dos parâmetros; o botão abre o MESMO modal de sempre (OrcWizard.editarParametros) */
    secaoParametros: function (orc) {
      var cfg = {}; try { cfg = Orcamento.garantirConfig(orc) || {}; } catch (e) {}
      var arred = ""; try { arred = Arred.rotulo(cfg.arredondamento); } catch (e1) {}
      var reg = (cfg.encargos && cfg.encargos.tipo) === "desonerado" ? "desonerado" : "não desonerado";
      var inc = cfg.bdiIncidencia === "final" ? "só no preço final" : "dentro de cada preço unitário";
      var linha = function (r, v) { return "<div><dt>" + esc(r) + "</dt><dd>" + esc(v) + "</dd></div>"; };
      var corpo = '<dl class="og-resumo">' + linha("Arredondamento", arred || "padrão do sistema") + linha("Encargos declarados", reg) + linha("BDI entra", inc) + "</dl>";
      return Modulo.secao({ id: "og-params", titulo: "Parâmetros do orçamento", sub: "Como o preço é arredondado, o regime dos encargos e onde o BDI incide.",
        acoesHtml: '<button type="button" class="btn" data-acao="orcguia-params">Editar parâmetros</button>', corpoHtml: corpo });
    },

    /* salva os campos da seção (o mesmo que o modal Dados grava) */
    salvarCondicoes: function (app) {
      var orc = app.orcAtual; if (!orc) return;
      var v = function (id) { var el = document.getElementById(id); return el ? String(el.value == null ? "" : el.value) : null; };
      var cli = v("og-cliente"), pag = v("og-pagamento"), prazo = v("og-prazo"), vd = v("og-validade");
      var c = Orcamento.garantirComercial(orc), certame = false;
      try { certame = !!Orcamento.ehCertame(orc); } catch (e) {}
      orc.cliente = orc.cliente || { nome: "", doc: "", contato: "" };
      if (cli !== null) {
        var nome = cli.trim();
        /* nome que bate com UM cliente cadastrado traz o documento dele (sugere o desenho da proposta e liga a proposta ao cadastro) */
        if (nome && nome !== s(orc.cliente.nome)) {
          try {
            var ach = (Store.listar(Auth.empresaId(), "clientes") || []).filter(function (x) { return s(x && (x.nome || x.razaoSocial)).trim().toLowerCase() === nome.toLowerCase(); });
            if (ach.length === 1 && !s(orc.cliente.doc)) orc.cliente.doc = s(ach[0].doc || ach[0].cnpj || ach[0].cpfCnpj || ach[0].documento || "");
          } catch (e2) {}
        }
        orc.cliente.nome = nome;
      }
      if (pag !== null) c.condicoesPagamento = pag.trim();
      if (prazo !== null) c.prazoExecucao = prazo.trim();
      if (vd !== null) c.validadeDias = (certame && vd.trim() === "") ? null : Util.num(vd);
      var g = app.persistir(); app.render();
      if (app._gravou(g)) toast("Condições salvas.", "ok");
    },

    /* [Dados] e [Parâmetros] do menu Mais: na prévia levam à aba (a porta única). Devolve true se tratou o clique. */
    interceptaAtalho: function (app, t) {
      if (!this.ativa() || this._passando || !t || !t.dataset) return false;
      var a = t.dataset.acao;
      if (a !== "config-orc" && a !== "parametros-orc") return false;
      if (app.tela !== "editor" || !app.orcAtual || !(t.closest && t.closest(".mod-mais-menu"))) return false;
      if (app.aba !== "bdi") app.aba = "bdi";
      app.render();
      this.focar(a === "config-orc" ? "og-cliente" : "og-params");
      return true;
    },

    /* abre o modal de parâmetros de sempre, pelo clique no botão original (o guarda de orçamento aprovado e o wizard são os de antes) */
    abrirParametros: function (app) {
      var b = document.querySelector('#orc-ed-cab [data-acao="parametros-orc"]');
      if (!b) { toast("Os parâmetros não estão disponíveis nesta tela.", "erro"); return; }
      this._passando = true;
      try { b.click(); } finally { this._passando = false; }
    },

    /* =================================================================
     * F — TESTE GRÁTIS POR INTERESSE: a tela "O que você quer conhecer?"
     *
     * Abre UMA vez, na primeira entrada de quem está no teste grátis (7 dias,
     * já com telefone e e-mail confirmados), e só se a conta ainda estiver no
     * perfil "completo". A escolha vira o perfil `teste` (js/perfis.js) e o
     * menu passa a mostrar só aquele assunto + "Liberar outro módulo".
     * O motor (as listas de módulos, o perfil) mora em js/perfis.js.
     * ================================================================= */
    _chaveInteresse: function () { return "orcapro:interesse:v1:" + String((global.Auth && Auth.empresaId && Auth.empresaId()) || ""); },
    _interesseFeito: function () { try { return !!localStorage.getItem(this._chaveInteresse()); } catch (e) { return false; } },
    _marcarInteresse: function () { try { localStorage.setItem(this._chaveInteresse(), "1"); } catch (e) {} },

    /* `?interesse=1` na prévia abre a tela também na vitrine (?demo=1), para o dono do produto ver e aprovar */
    _interesseForcado: function () { try { return /[?&]interesse=1\b/.test(String(global.location && location.search || "")); } catch (e) { return false; } },

    /* A tela deve abrir agora? Só no teste grátis ATIVO (nem aguardando confirmação, nem vencido, nem licença paga), perfil completo, uma vez. */
    interessePendente: function (app) {
      if (!this.ativa() || !global.Perfis) return false;
      if (this._interesseForcado()) return Perfis.idAtual() === "completo" || Perfis.idAtual() === "teste";
      if (app && app._demo) return false;
      var st = null; try { st = global.Licenca && Licenca.status ? Licenca.status() : null; } catch (e) {}
      if (!st || !st.trial || !st.ativo || st.pendente || st.expirado) return false;
      if (Perfis.idAtual() !== "completo") return false;
      /* ⚠ É A "PRIMEIRA ENTRADA": quem já viu o tour (flag `orcapro:tour:v1`, a mesma que as e2e gravam) NÃO leva a tela de surpresa no meio
         do teste — as contas que já estavam no teste continuam com o menu completo, e a tela nunca cobre o que a pessoa está fazendo. */
      try { if (localStorage.getItem("orcapro:tour:v1")) return false; } catch (eT) {}
      return !this._interesseFeito();
    },

    htmlInteresse: function (opcoes) {
      var o = opcoes || {}, ja = o.liberados || [];
      var cartoes = Perfis.ORDEM_INTERESSES.map(function (id) {
        var it = Perfis.INTERESSES_TESTE[id], lib = ja.indexOf(id) > -1;
        var ic = ""; try { ic = (global.Gestao && Gestao.iconeModulo) ? Gestao.iconeModulo(it.icone, 28) : ""; } catch (e) {}
        return '<button type="button" class="oi-card" data-acao="orcguia-interesse" data-id="' + esc(id) + '"' + (lib ? ' disabled aria-disabled="true"' : "") + ">" +
          '<span class="oi-ic" aria-hidden="true">' + ic + "</span>" +
          '<span class="oi-txt"><b>' + esc(it.nome) + "</b><span>" + esc(it.desc) + "</span>" + (lib ? Modulo.pilula("Liberado", "ok") : "") + "</span></button>";
      }).join("");
      return '<p class="oi-intro">' + esc(o.intro || "Escolha por onde começar. Durante o teste o menu mostra só esse assunto; os outros módulos você libera quando quiser.") + "</p>" +
        '<div class="oi-grade">' + cartoes + "</div>" + this.htmlCertame();
    },

    /* =================================================================
     * O BLOCO "CERTAMEPRO — CONHEÇA" (decisão do Rogério, 13/11/2026)
     *
     * O CertamePRO é um produto À PARTE (do edital ao contrato) e NUNCA entra
     * no teste grátis: por isso não é um quinto cartão (cartão = o que o teste
     * libera), e sim um aviso discreto abaixo deles, com a porta para a venda.
     * ⚠ As frases são as do que o produto faz de verdade (conferidas no site
     *   certamepro.com.br e no projeto Licitacoes): resumo do edital com a
     *   página de cada dado, planilha do órgão e proposta conferidas contra o
     *   edital, pacote da habilitação (carta, declarações e documentos com
     *   prazo) e a conferência de validade e CNPJ. Não prometa o que não está aí.
     * ⚠ SEM CANAL NOVO: os dois botões abrem o WhatsApp de venda que o app já
     *   usa em "Novo usuário" (`Licenca.status().whatsappRA`, com o número do
     *   Rogério como reserva — js/gestao.js, _avisoPlanoSemUsuarios), só com
     *   a mensagem pedindo a apresentação ou a compra.
     * ⚠ No app da Google Play não há oferta nem link de compra (política da
     *   loja; é a mesma regra do _upsell): o bloco some.
     * ================================================================= */
    CERTAME_LINHAS: [
      "Lê o edital e monta o resumo, com a página de cada dado.",
      "Confere a planilha do órgão e a proposta contra o edital.",
      "Monta o pacote da habilitação: carta, declarações e documentos, com os prazos.",
      "Confere a validade e o CNPJ dos documentos e deixa o aviso para você conferir."
    ],
    urlVendaCertame: function (assunto) {
      var st = {}; try { st = (global.Licenca && Licenca.status) ? (Licenca.status() || {}) : {}; } catch (e) { st = {}; }
      /* ⚠ "Quero comprar" vai DIRETO ao checkout do CertamePRO (o mesmo que os botões de preço do certamepro.com.br usam; conferido
           em 13/11/2026: GET devolve 200). "Agendar apresentação" é a conversa: o WhatsApp de venda do app (`whatsappRA`); na falta
           dele, o número que o próprio site do CertamePRO publica. */
      if (assunto === "comprar") return "https://app.certamepro.com.br/comprar";
      var fone = s(st.whatsappRA).replace(/\D/g, "") || "5534992869383";
      var msg = "Olá, Rogério! Estou usando o OrçaPRO e quero agendar uma apresentação do CertamePRO.";
      return "https://wa.me/" + fone + "?text=" + encodeURIComponent(msg);
    },
    htmlCertame: function () {
      try { if (document.documentElement.getAttribute("data-origem") === "play") return ""; } catch (e) {}
      return '<section class="oi-certame" aria-labelledby="oi-certame-t"><h3 id="oi-certame-t">CertamePRO — conheça</h3>' +
        '<p class="oi-certame-sub">Sistema à parte, do edital ao contrato. Não faz parte do teste.</p>' +
        "<ul>" + this.CERTAME_LINHAS.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" +
        '<div class="oi-certame-acoes"><a class="btn" href="' + esc(this.urlVendaCertame("agendar")) + '" target="_blank" rel="noopener" data-certame="agendar">Agendar apresentação</a>' +
        '<a class="btn" href="' + esc(this.urlVendaCertame("comprar")) + '" target="_blank" rel="noopener" data-certame="comprar">Quero comprar</a></div></section>';
    },

    abrirInteresse: function (app, op) {
      var self = this, o = op || {}, ja = Perfis.interessesTeste();
      var botoes = o.liberar
        ? [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
           { texto: "Liberar tudo", classe: "", onClick: function () { self.liberarTudo(app); } }]
        : [{ texto: "Quero ver tudo", classe: "ghost", onClick: function () { self._marcarInteresse(); UI.fecharModal(); self._depois(app, false, "", true); } }];
      var bg = UI.modal(o.liberar ? "Liberar outro módulo" : "O que você quer conhecer?",
        this.htmlInteresse({ liberados: ja, intro: o.liberar ? "Marque o assunto que você quer somar ao menu. O que já está liberado continua." : "" }), botoes);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "640px";
      this._liberando = !!o.liberar;
      try { var b = document.querySelector("#modal-bg .oi-card:not([disabled])"); if (b) b.focus(); } catch (e) {}
    },

    /* a escolha: grava o perfil de teste e leva ao primeiro módulo do assunto */
    escolherInteresse: function (app, id) {
      var atual = Perfis.interessesTeste(), novos = atual.indexOf(id) > -1 ? atual : atual.concat([id]);
      var r = Perfis.aplicarTeste(novos);
      if (!r.ok) { toast(r.erro || "Não consegui guardar a escolha.", "erro"); return; }
      this._marcarInteresse();
      /* o assunto escolhido também vai ao registro do teste no servidor (painel do admin); falha de rede não muda nada aqui */
      try { if (global.Licenca && Licenca.enviarInteresseTeste) Licenca.enviarInteresseTeste(r.interesses || novos); } catch (eSv) {}
      try { UI.fecharModal(); } catch (e) {}
      var primeiro = { orcamento: "orcamentos", bim: "bim", gestao: "obras", licitacao: "orcamentos" }[id] || "orcamentos";
      var liberando = this._liberando;
      this._liberando = false;
      toast(liberando ? Perfis.INTERESSES_TESTE[id].nome + " liberado no menu." : "Pronto. O menu mostra só " + Perfis.INTERESSES_TESTE[id].nome + ". Use Liberar outro módulo quando quiser mais.", "ok");
      this._depois(app, true, primeiro, !liberando);
    },

    /* redesenha com o menu novo, vai ao módulo e (só na primeira vez) mostra o tour */
    _depois: function (app, mudou, primeiro, comTour) {
      try {
        if (mudou && primeiro && app.irPara) app.irPara(primeiro); else app.render();
        if (comTour && global.Tour && Tour.iniciar) setTimeout(function () { try { Tour.iniciar(); } catch (e) {} }, 400);
      } catch (e) { try { app.render(); } catch (e2) {} }
    },

    liberarTudo: function (app) {
      var r = Perfis.aplicar("completo");
      try { UI.fecharModal(); } catch (e) {}
      if (!r.ok) { toast(r.erro || "Não consegui liberar tudo.", "erro"); return; }
      toast("Todos os módulos liberados.", "ok");
      try { app.render(); } catch (e2) {}
    },

    /* o botão da barra lateral (só com o perfil `teste`) */
    menuLiberar: function () {
      try {
        if (!this.ativa() || !global.Perfis || Perfis.idAtual() !== "teste") return "";
        return '<button type="button" class="sb-org sb-liberar" data-acao="orcguia-liberar" title="Somar outro assunto ao menu durante o teste">Liberar outro módulo</button>';
      } catch (e) { return ""; }
    },

    /* no começo da sessão: quem virou cliente pago sai do menu de teste; quem entra no teste pela primeira vez escolhe o assunto */
    interesseVerificar: function (app) {
      var self = this;
      try { if (global.Perfis && Perfis.liberarTesteSePago && global.Licenca) { if (Perfis.liberarTesteSePago(Licenca.status())) { try { app.render(); } catch (e) {} } } } catch (e0) {}
      if (this.interessePendente(app)) setTimeout(function () { try { if (global.Auth && Auth.usuario() && self.interessePendente(app)) self.abrirInteresse(app); } catch (e) {} }, 500);
    },

    /* põe o cursor num campo da tela que acabou de ser desenhada */
    focar: function (id) {
      setTimeout(function () {
        var el = document.getElementById(id);
        if (!el) return;
        try { el.scrollIntoView({ block: "center" }); if (el.focus && /^(input|select|textarea|button)$/i.test(el.tagName)) el.focus(); } catch (e) {}
      }, 30);
    }
  };

  global.OrcGuiaUI = OrcGuiaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcGuiaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
