/* =====================================================================
 * orccompletoui.js — ORÇAMENTO COMPLETO PELO ESCOPO (fiação; 20/10/2026)
 *
 * Pedido do Rogério: "a gente coloca os parâmetros, mas ele fica com as
 * sugestões e um monte de coisa pendente. Quero que, quando a pessoa só
 * colocar os parâmetros, ele seja bem preciso e gere o orçamento sem o
 * usuário ficar preenchendo. Item que não tiver nos bancos, cria a
 * composição própria. E grava o orçamento." E, em seguida: "às vezes vai ter
 * um orçamento grande, um texto grandão. Tem que dar certo, não tem que dar
 * erro."
 *
 * O QUE ERA. No Escopo Inteligente, "Adicionar selecionados" DESCARTAVA toda
 * linha sem candidato ("N pendentes ignorados"): o orçamento saía faltando
 * serviço, e o único remédio era um modal "Elaborar composição" por linha.
 * O Agente Orçamentista — que casa código, descrição e elabora composição
 * própria em lote — só rodava na importação de planilha. E o "Estruturar
 * com IA" mandava o texto inteiro num pedido só: texto grande = JSON cortado
 * = "IA não retornou estrutura válida", trabalho perdido.
 *
 * O QUE É AGORA (motores puros; aqui só a fiação):
 *   · Parâmetros da obra (js/orcparam.js) → linhas com código SINAPI
 *     conferido e a fórmula de cada quantidade.
 *   · Texto (digitado, colado, planilha, PDF) → IA em BLOCOS de 6.000
 *     caracteres, cada bloco com 2 tentativas; bloco que falhar é analisado
 *     linha a linha SEM IA — nada se perde, e a tela diz quantos foram assim.
 *   · Tudo passa pelo Orçamentista (js/orcamentista.js) em modo SEM PENDENTE:
 *     código → descrição → composição própria por analogia (gravada na base
 *     PRÓPRIA, com insumos e coeficientes) → aproximação de mesma unidade
 *     pelo maior preço. Insumo sem preço na UF: preço por equivalência, o
 *     maior. Cada item leva a origem e a memória de cálculo.
 *   · Grava o orçamento (persistir, com todas as travas de sempre) e mostra
 *     o relatório do que conferir — que também baixa como arquivo interno.
 * ===================================================================== */
(function (global) {
  "use strict";
  if (typeof App === "undefined" || typeof UI === "undefined") return;
  var ic = function (n, s) { return (typeof Icones !== "undefined" && Icones.get) ? Icones.get(n, s || 15) : ""; };
  var esc = function (s) { return Util.esc(String(s == null ? "" : s)); };
  var BLOCO = 6000;

  /* ---------------- tela: parâmetros da obra (dentro do Escopo) ---------------- */
  UI.renderEscopoParametros = function () {
    if (typeof OrcParam === "undefined") return "";
    var sel = function (id, mapa, padrao) {
      return '<select id="' + id + '" style="width:100%;box-sizing:border-box">' + Object.keys(mapa).map(function (k) {
        var r = mapa[k]; var rot = typeof r === "string" ? r : r.rotulo;
        return '<option value="' + k + '"' + (k === padrao ? " selected" : "") + '>' + esc(rot) + "</option>";
      }).join("") + "</select>";
    };
    var campo = function (rot, html, dica) {
      return '<div class="field" style="margin:0;min-width:0"><label style="font-size:11px"' + (dica ? ' title="' + esc(dica) + '"' : "") + ">" + rot + "</label>" + html + "</div>";
    };
    var num = function (id, ph) { return '<input id="' + id + '" inputmode="decimal" placeholder="' + esc(ph) + '" style="width:100%;box-sizing:border-box">'; };
    return '<details id="esc-param" class="card" style="padding:9px 12px;margin-bottom:8px">' +
      '<summary style="cursor:pointer;font-weight:600;font-size:13px">' + ic("regua") + ' Parâmetros da obra — gerar o orçamento só com a área</summary>' +
      '<p class="muted" style="font-size:12px;margin:6px 0 8px">Preencha o que souber; o resto entra como premissa escrita. Cada quantidade sai com a fórmula ao lado e o código SINAPI conferido. Pode somar com o texto acima.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">' +
        campo("Tipo", sel("escp-tipo", OrcParam.TIPOS, "residencial")) +
        campo("Área construída (m²) *", num("escp-area", "ex.: 120")) +
        campo("Pavimentos", num("escp-pav", "1")) +
        campo("Pé-direito (m)", num("escp-pd", "2,80")) +
        campo("Padrão", sel("escp-padrao", OrcParam.PADROES, "normal")) +
        campo("Quartos", num("escp-quartos", "auto")) +
        campo("Banheiros", num("escp-banh", "auto")) +
        campo("Cobertura", sel("escp-cob", OrcParam.COBERTURAS, "ceramica")) +
        campo("Forro", '<select id="escp-forro" style="width:100%;box-sizing:border-box"><option value="">Pelo padrão</option>' + Object.keys(OrcParam.FORROS).map(function (k) { return '<option value="' + k + '">' + esc(OrcParam.FORROS[k]) + "</option>"; }).join("") + "</select>") +
        campo("Piso", '<select id="escp-piso" style="width:100%;box-sizing:border-box"><option value="">Pelo padrão</option>' + Object.keys(OrcParam.PISOS).map(function (k) { return '<option value="' + k + '">' + esc(OrcParam.PISOS[k]) + "</option>"; }).join("") + "</select>") +
        campo("Perímetro externo (m)", num("escp-perim", "auto"), "Se souber, informe: deixa paredes, reboco e fundação mais precisos") +
        campo("Esgoto", '<select id="escp-esgoto" style="width:100%;box-sizing:border-box"><option value="rede">Rede pública</option><option value="fossa">Fossa e sumidouro</option></select>') +
      "</div>" +
      '<div class="flex" style="gap:8px;margin-top:8px"><button type="button" class="btn sm" data-acao="escopo-param-previa">' + ic("buscar") + " Ver as quantidades</button></div>" +
      '<div id="esc-param-prev"></div>' +
      "</details>";
  };

  App._escopoParamLer = function () {
    var v = function (id) { var e = UI.el(id); return e ? String(e.value || "").trim() : ""; };
    return { tipo: v("escp-tipo"), area: v("escp-area"), pavimentos: v("escp-pav"), peDireito: v("escp-pd"), padrao: v("escp-padrao"),
      quartos: v("escp-quartos"), banheiros: v("escp-banh"), cobertura: v("escp-cob"), forro: v("escp-forro"), piso: v("escp-piso"),
      perimetro: v("escp-perim"), esgoto: v("escp-esgoto") };
  };

  App.escopoParamPrevia = function () {
    var box = UI.el("esc-param-prev"); if (!box || typeof OrcParam === "undefined") return;
    var r = OrcParam.gerar(this._escopoParamLer());
    if (!r.ok) { box.innerHTML = '<div style="color:var(--vermelho);font-size:12.5px;margin-top:6px">' + esc(r.erros.join(" ")) + "</div>"; return; }
    this._escParam = r;
    box.innerHTML = '<div style="max-height:260px;overflow:auto;margin-top:8px;border:1px solid var(--linha);border-radius:8px">' +
      '<table class="tbl"><thead><tr><th>Etapa</th><th>Código</th><th>Serviço</th><th class="num">Qtd</th><th>Un</th><th>Fórmula</th></tr></thead><tbody>' +
      r.linhas.map(function (l) {
        return "<tr><td style=\"font-size:11px\">" + esc(l.etapa) + "</td><td>" + (l.codigo ? esc(l.codigo) : '<span class="muted" title="A SINAPI não tem o serviço inteiro: o Orçamentista acha pela descrição ou elabora a composição própria">própria</span>') + "</td><td style=\"font-size:12px\">" + esc(String(l.descricao).slice(0, 70)) +
          '</td><td class="num">' + Util.fmtNum(l.quantidade, 2) + "</td><td>" + esc(l.unidade) + '</td><td class="muted" style="font-size:11px">' + esc(l.formula) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="muted" style="font-size:11.5px;margin-top:6px"><b>' + r.linhas.length + " serviços.</b> Premissas: " + esc(r.premissas.join(" · ")) + "</div>";
  };

  /* ---------------- IA em blocos: texto grande não falha ---------------- */
  /* Promise → {linhas, blocos, semIA, avisos}. Nunca rejeita: bloco que a IA
     não estruturar (rede, limite, servidor) vira análise linha a linha. */
  App._escopoEstruturar = function (txt, aoProgredir, sessao) {
    var self = this, back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "http://localhost:3041";
    var blocos = Escopo.dividirEmBlocos(txt, BLOCO), out = { linhas: [], blocos: blocos.length, semIA: 0, avisos: [], modelo: "" };
    var excl = this._fontesExcluidas();
    var pedir = function (texto) {
      var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var prazo = ctl ? setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 330000) : null;
      return fetch(back + "/ia/orcamento", { method: "POST", signal: ctl ? ctl.signal : undefined,
        headers: (function () { var h = { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }; if (sessao) h["x-orcm-sessao"] = sessao; return h; })(),
        body: JSON.stringify({ descricao: texto }) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: {} }; }); })
        .then(function (o) { if (prazo) clearTimeout(prazo); return o; }, function (e) { if (prazo) clearTimeout(prazo); throw e; });
    };
    var umBloco = function (texto, tentativa) {
      return pedir(texto).then(function (o) {
        var j = o.j || {};
        if (j.ok && j.resultado && (j.resultado.etapas || []).length) {
          out.modelo = j.model || out.modelo;
          /* resposta cortada (raro com blocos de 6.000): divide o bloco ao meio e refaz — uma vez */
          if (j.truncado && tentativa < 2 && texto.length > 1500) {
            var metades = Escopo.dividirEmBlocos(texto, Math.ceil(texto.length / 2) + 10);
            if (metades.length > 1) return metades.reduce(function (p, m) { return p.then(function () { return umBloco(m, 2); }); }, Promise.resolve());
          }
          Escopo.analisarItensIA(j.resultado.etapas, { excluirFontes: excl }).forEach(function (l) { out.linhas.push(l); });
          return;
        }
        if (tentativa < 1 && o.status !== 400 && o.status !== 401 && o.status !== 402 && o.status !== 403) return umBloco(texto, tentativa + 1);
        throw new Error(j.error || ("HTTP " + o.status));
      }, function (e) {
        if (tentativa < 1) return umBloco(texto, tentativa + 1);
        throw e;
      }).catch(function (e) {
        if (tentativa >= 1 || /HTTP 40[0123]/.test(String(e && e.message))) {
          /* a IA não respondeu para este bloco: análise linha a linha, sem perder nada */
          out.semIA++;
          if (out.avisos.length < 3) out.avisos.push(String((e && e.message) || e).slice(0, 140));
          Escopo.analisar(texto, { excluirFontes: excl }).forEach(function (l) { l.semIA = true; out.linhas.push(l); });
          return;
        }
        throw e;
      });
    };
    var feitos = 0;
    return blocos.reduce(function (p, b) {
      return p.then(function () {
        if (aoProgredir) { try { aoProgredir(feitos, blocos.length); } catch (e) {} }
        return umBloco(b, 0).then(function () { feitos++; });
      });
    }, Promise.resolve()).then(function () { return out; });
  };

  /* ---------------- linhas do escopo → etapas do Orçamentista ---------------- */
  function etapaDe(l) {
    if (l.etapaSugerida) return String(l.etapaSugerida).trim().toUpperCase();
    var cat = (typeof Cronograma !== "undefined" && Cronograma.classificar) ? Cronograma.classificar(l.textoOriginal) : null;
    return cat ? String(cat.nome).toUpperCase() : "SERVIÇOS GERAIS";
  }
  App._escopoParaEtapas = function (linhasEscopo, param) {
    var ls = [];
    if (param && param.ok) param.linhas.forEach(function (l) { ls.push(l); });
    (linhasEscopo || []).forEach(function (l) {
      if (!l) return;
      var cand = (l.escolhido > -1 && l.candidatos) ? l.candidatos[l.escolhido] : null;
      /* código só quando foi ESCOLHA (digitado, aceito pela pessoa ou pela
         IA): o ranking do Escopo é por fração de palavras e já mostrou erro
         de 5× no preço — o Orçamentista decide melhor pela descrição */
      var firme = !!cand && (l.decididoPeloUsuario || l.refinadoIA || cand.motivo === "código informado");
      ls.push({
        etapa: etapaDe(l),
        codigo: firme ? String(cand.item.codigo) : "",
        fonte: firme ? (cand.fonte || "SINAPI") : "",
        descricao: l.descricao || Escopo.descricaoLimpa(l.textoOriginal),
        unidade: l.unidade || (firme ? cand.item.unidade : "") || "",
        quantidade: Number(l.quantidade) || 1,
        formula: l.observacao ? l.observacao : (l.qtdInferida ? "quantidade não informada no escopo — conferir" : "quantidade informada no escopo"),
        textoOriginal: l.textoOriginal
      });
    });
    return OrcParam.paraEtapas(ls);
  };

  /* ---------------- o botão: gerar o orçamento completo ---------------- */
  App.escopoGerarCompleto = function (origem) {
    var self = this, orc = this.orcAtual;
    if (!orc) { UI.toast("Abra um orçamento primeiro.", "erro"); return; }
    if (this._trialBloqueado && this._trialBloqueado()) { this._avisoTrial(); return; }
    if (typeof Orcamento !== "undefined" && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc)) {
      UI.toast("Este orçamento está aprovado — crie uma revisão para gerar itens nele.", "erro"); return;
    }
    if (typeof Licitacao !== "undefined" && Licitacao.temBasesExigidas && Licitacao.temBasesExigidas(orc) && this._licCtxBases && Licitacao.basesPendentes(orc, this._licCtxBases()).length) {
      UI.toast("O edital exige bases que ainda não estão em uso — resolva no Orçamentista antes de gerar.", "erro"); return;
    }
    var param = null, txt = "";
    if (origem !== "revisao") {
      var temArea = UI.el("escp-area") && String(UI.el("escp-area").value || "").trim();
      if (temArea) { param = OrcParam.gerar(this._escopoParamLer()); if (!param.ok) { UI.toast(param.erros.join(" "), "erro"); return; } }
      txt = String((UI.el("esc-txt") || {}).value || "").trim();
      if (!param && !txt) { UI.toast("Descreva a obra ou preencha a área nos Parâmetros da obra.", "erro"); return; }
    }
    var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "";
    if (!back) { UI.toast("O servidor de IA não está configurado neste aparelho — o orçamento por IA não pode ser gerado.", "erro"); return; }
    var linhasRev = origem === "revisao" ? (this._escopo || []) : null;
    UI.fecharModal();
    /* ⚠ PAGA ANTES DE GERAR (Rogério, 21/10/2026): nenhuma chamada à IA sai antes da janela —
       grátis do mês (2) ou preço mostrado e confirmado, com a carteira carregada por PIX. */
    this._escopoComPagamento({ texto: txt, param: param, linhas: linhasRev }, function (sessao) {
      self._escopoGerarPago(origem, txt, param, linhasRev, sessao);
    });
  };

  /* Monta o estado da cobrança do Escopo e abre a janela da IA (a MESMA máquina do Orçamentista por IA:
     preço → confirmação → débito na carteira → janela). A assinatura são hashes das linhas do escopo —
     nada do texto sai para o preço; só o tamanho (caracteres, linhas, se há parâmetros). */
  App._escopoComPagamento = function (o, seguir) {
    var self = this, orc = this.orcAtual, back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "";
    if (!orc) return;
    var linhasTxt = o.texto ? String(o.texto).split(/\r?\n/).filter(function (x) { return String(x).trim(); })
      : (o.linhas || []).map(function (l) { return String(l.textoOriginal || l.descricao || ""); });
    var assin = [], vistos = {};
    linhasTxt.forEach(function (l) {
      var h = self._orcmHash(String(Util.normalizar(l)).toUpperCase().replace(/\s+/g, " ").trim());
      if (!vistos[h]) { vistos[h] = 1; assin.push(h); }
    });
    if (o.param && o.param.ok) assin.push(self._orcmHash("PARAM:" + JSON.stringify(o.param.p)));
    if (!assin.length) assin.push(self._orcmHash("ESCOPO:" + orc.id));
    var st = this._orcm = { modo: "escopo", orcId: orc.id, nome: orc.nome, carimboEm: orc.atualizadoEm, plano: [], assinaturaEscopo: assin.slice(0, 2000),
      escopo: { caracteres: String(o.texto || "").length, linhas: linhasTxt.length, parametros: !!(o.param && o.param.ok) } };
    /* desistiu no quadro do preço: nada é gerado, e o que a pessoa digitou NÃO se perde — o Escopo
       reabre com o texto e os parâmetros como estavam */
    var form = {};
    ["escp-tipo", "escp-area", "escp-pav", "escp-pd", "escp-padrao", "escp-quartos", "escp-banh", "escp-cob", "escp-forro", "escp-piso", "escp-perim", "escp-esgoto"].forEach(function (id) { var e = UI.el(id); if (e) form[id] = e.value; });
    st.aoDesistir = function () {
      UI.toast("Nada foi gerado: o orçamento por IA só é gerado depois de confirmado o pagamento (ou dentro dos grátis do mês).", "erro");
      if (o.linhas || typeof self.abrirEscopo !== "function") return;
      self.abrirEscopo();
      var t = UI.el("esc-txt"); if (t && o.texto) t.value = o.texto;
      var temForm = false;
      Object.keys(form).forEach(function (id) { var e = UI.el(id); if (e) { e.value = form[id]; if (id === "escp-area" && form[id]) temForm = true; } });
      var det = UI.el("esc-param"); if (det && temForm) det.open = true;
    };
    var go = function (sessao) { if (self._orcm !== st) return; st.aoDesistir = null; st.sessao = sessao || null; seguir(sessao || null); };
    st.retomarIA = function () { self._orcmJanelaIA(back, go); };
    this._orcmJanelaIA(back, go);
  };

  /* Já pago (ou grátis): estrutura, casa, compõe o resíduo e grava. */
  App._escopoGerarPago = function (origem, txt, param, linhasRev, sessao) {
    var self = this, orc = this.orcAtual, st0 = this._orcm;
    if (!orc || !st0 || st0.modo !== "escopo" || st0.orcId !== orc.id) { UI.toast("Você saiu do orçamento — a geração foi descartada.", "erro"); return; }
    var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "";
    var orcId = orc.id;
    var noMesmo = function () { return self.orcAtual && self.orcAtual.id === orcId && self._orcm === st0; };
    var setTxt = function (t) { var d = document.getElementById("ui-loading"), box = d && d.firstElementChild, tn = box && box.lastChild; if (tn && tn.nodeType === 3) tn.nodeValue = t; };
    var info = { blocos: 0, semIA: 0, avisos: [], modelo: "" };
    var etapaTexto;
    if (origem === "revisao") etapaTexto = Promise.resolve(linhasRev || []);
    else if (txt) {
      UI.loading("Estruturando o escopo com a IA…");
      etapaTexto = this._escopoEstruturar(txt, function (f, t) { setTxt("Estruturando o escopo com a IA — parte " + (f + 1) + " de " + t + "…"); }, sessao)
        .then(function (r) { info = r; return r.linhas; });
    } else etapaTexto = Promise.resolve([]);

    etapaTexto.then(function (linhas) {
      if (!noMesmo()) { UI.loadingFim(); UI.toast("Você saiu do orçamento — a geração foi descartada.", "erro"); return; }
      var etapas = self._escopoParaEtapas(linhas, param);
      var total = 0; etapas.forEach(function (e) { total += e.itens.length; });
      if (!total) { UI.loadingFim(); UI.toast("Nenhum serviço reconhecido.", "erro"); return; }
      var lim = Auth.limite ? Auth.limite("limiteItensPorOrcamento") : Infinity;
      var ja = Orcamento.totais(orc).qtdItens || 0;
      if (ja + total > lim) { UI.loadingFim(); UI.toast("O plano permite " + lim + " itens por orçamento; este geraria " + (ja + total) + ".", "erro"); return; }
      var rodar = function () {
        var excl = self._fontesExcluidas() || [];
        var fontes = ((typeof Bases !== "undefined" && Bases.lista) ? Bases.lista() : [])
          .filter(function (b) { return b.ativa !== false && excl.indexOf(b.fonte) < 0; })
          .sort(function (a, b) { return (a.fonte === "SINAPI" ? 0 : 1) - (b.fonte === "SINAPI" ? 0 : 1); })
          .map(function (b) { return b.fonte; });
        if (!fontes.length) fontes = ["SINAPI"];
        var cfg = { fontes: fontes, elaborar: typeof Analitico !== "undefined" && Analitico.carregado, planilhaVence: false };
        var ctx = self._orcmCtx(cfg);
        ctx.semPendente = true;
        self._escopoPrecoEquivalencia(ctx);
        setTxt("Orçamentista: casando e precificando…");
        Orcamentista.planejarAsync(etapas, ctx, function (f, t) { setTxt("Orçamentista: " + f + " de " + t + " serviços…"); })
          .then(function (r) {
            UI.loadingFim();
            if (!noMesmo()) { UI.toast("Você saiu do orçamento — a geração foi descartada.", "erro"); return; }
            var cur = self.orcAtual;
            /* o MESMO estado da cobrança (janela, raiz): só ganha o plano */
            var st = Object.assign(st0, { etapas: etapas, etapasRodadas: etapas, nome: cur.nome, total: total, orcId: cur.id, carimboEm: cur.atualizadoEm,
              plano: r.plano, fontes: r.fontes, cfg: cfg, ctx: ctx,
              escopoGerado: { em: new Date().toISOString(), parametros: param && param.ok ? param.p : null, premissas: param && param.ok ? param.premissas : [],
                blocosIA: info.blocos || 0, blocosSemIA: info.semIA || 0, modelo: info.modelo || "", cobranca: st0.janela ? "janela" : "sem-cobranca" } });
            var aplicar = function () {
              if (self._orcm !== st) return;               // outra geração tomou o lugar: esta não grava
              if (self._orcmAplicar()) self._escopoRelatorio(st, info);
            };
            /* RESÍDUO → A IA COMPÕE, na MESMA janela já paga. O que nenhuma base tem
               com segurança (sem código, sem descrição parecida, sem análoga de
               confiança alta) é o "cria a composição disso" do pedido. Falhou: grava
               com o resíduo marcado no relatório — a geração nunca fica pela metade. */
            var pend = r.plano.filter(function (L) { return L.status === "pendente"; });
            if (!pend.length || !back) { aplicar(); return; }
            self._escopoComporIA(back, sessao, pend).then(aplicar, aplicar);
          })
          .catch(function (e) { UI.loadingFim(); UI.toast("A geração falhou: " + ((e && e.message) || e) + " — nada foi gravado.", "erro"); });
      };
      if (typeof Analitico !== "undefined" && Analitico.carregado) { rodar(); return; }
      setTxt("Carregando a base analítica (insumos e coeficientes)…");
      var urls = self._prepararAnalitico();
      Analitico.carregarArquivo(urls.alts).then(rodar, function () {
        UI.toast("A base analítica não carregou — os serviços sem correspondência vão para a IA compor.", "erro");
        rodar();
      });
    }).catch(function (e) { UI.loadingFim(); UI.toast("A geração falhou: " + ((e && e.message) || e) + " — nada foi gravado.", "erro"); });
  };

  /* Insumo sem preço na UF (rota "cotar") → preço por equivalência, o MAIOR.
     Embrulha o `ctx.elaborar` do Orçamentista; o motor puro decide a regra
     (Orcamentista.precoPorEquivalencia). */
  App._escopoPrecoEquivalencia = function (ctx) {
    if (!ctx || typeof ctx.elaborar !== "function" || typeof ComposicaoPropria === "undefined") return;
    var original = ctx.elaborar;
    ctx.elaborar = function (desc, o) {
      var r = original(desc, o);
      if (!r || !r.ok || !r.comp || !r.rota || r.rota.tipo !== "cotar") return r;
      var faltou = 0, preench = 0;
      (r.comp.insumos || []).forEach(function (ins) {
        if (Number(ins.custoUnitario) > 0) return;
        var cands = (typeof Bases !== "undefined" && Bases.buscar) ? Bases.buscar(String(ins.descricao || "").split(/\s+/).slice(0, 4).join(" "), { max: 60, fontes: ctx.fontes, tipo: "insumo" }) : [];
        var eq = Orcamentista.precoPorEquivalencia(ins, cands.map(function (x) { return { item: x.item, fonte: x.fonte }; }), ctx);
        if (!eq) { faltou++; return; }
        ins.custoUnitario = eq.custoUnitario;
        ins.memoria = (ins.memoria ? ins.memoria + " · " : "") + "Sem preço na UF: adotado o de " + eq.fonte + " " + eq.codigo + " (" + String(eq.descricao).slice(0, 60) + "), maior valor entre " + eq.equivalentes + " equivalente(s) — conferir.";
        preench++;
      });
      if (preench) {
        r.custo = ComposicaoPropria.custo(r.comp.insumos, r.comp.metodo || "truncar2");
        r.aviso = (r.aviso ? r.aviso + " " : "") + preench + " insumo(s) sem preço na UF precificado(s) por equivalência (maior valor) — conferir.";
        if (!faltou) r.rota = { tipo: "calculada", codigo: r.rota.codigo, descricao: r.rota.descricao, unidade: r.rota.unidade, preco: 0, faltam: [] };
        else r.rota.faltam = (r.rota.faltam || []).filter(function (f) { return !(r.comp.insumos || []).some(function (i) { return String(i.codigo) === String(f.codigo) && Number(i.custoUnitario) > 0; }); });
      }
      return r;
    };
  };

  /* A IA compõe o resíduo (POST /ia/compor, lotes de 12 — o teto da rota).
     Cada proposta passa pelo validador do motor (Orcamentista.validarComposicaoIA:
     insumo casado nas bases com semelhança ≥ 0,6 ganha código e preço reais);
     o insumo que a IA citar e nenhuma base tiver recebe o preço do equivalente
     de mesma unidade, o MAIOR (precoPorEquivalencia). Nunca lança. */
  App._escopoComporIA = function (back, sessao, pend) {
    var self = this, st = this._orcm, ctx = st.ctx;
    var hdr = { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") };
    if (sessao) hdr["x-orcm-sessao"] = sessao;
    /* o MESMO serviço repetido (descrição + unidade) é UMA composição: uma
       chamada à IA e um código na base PRÓPRIA para todas as linhas iguais —
       a e2e de 1.000 linhas criava 142 cópias da mesma composição */
    var grupos = {}, unicos = [];
    pend.forEach(function (L) {
      var chave = Util.normalizar(L.item.descricao) + "|" + (ctx.unidadeChave ? ctx.unidadeChave(L.item.unidade || "") : String(L.item.unidade || ""));
      if (!grupos[chave]) { grupos[chave] = []; unicos.push(L); }
      grupos[chave].push(L);
      L._grupoIA = chave;
    });
    var irmaos = function (L) { return grupos[L._grupoIA] || [L]; };
    var lotes = []; for (var k = 0; k < unicos.length; k += 12) lotes.push(unicos.slice(k, k + 12));   // 12 = MAX_ITENS do server/ia-compor.js
    var feitas = 0, parar = "";
    UI.loading("A IA está compondo " + pend.length + " serviço(s) que nenhuma base tem…");
    return lotes.reduce(function (p, lote, li) {
      return p.then(function () {
        if (parar) return;
        var d = document.getElementById("ui-loading"), box = d && d.firstElementChild, tn = box && box.lastChild;
        if (tn && tn.nodeType === 3) tn.nodeValue = "A IA está compondo os serviços sem base — lote " + (li + 1) + " de " + lotes.length + "…";
        var payload = lote.map(function (L) { return { i: L.i, descricao: L.item.descricao, unidade: L.item.unidade || "" }; });
        return fetch(back + "/ia/compor", { method: "POST", headers: hdr, body: JSON.stringify({ itens: payload }) })
          .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: {} }; }); })
          .then(function (o) {
            if (o.status === 402 || (o.j && o.j.devolvido)) { parar = (o.j && o.j.error) || "a janela da IA foi encerrada"; st.janela = null; return; }
            if (o.status === 404) { parar = "o servidor de IA ainda não tem a rota de composição"; return; }
            var j = o.j; if (!j || !j.ok || !Array.isArray(j.composicoes)) return;
            j.composicoes.forEach(function (c) {
              var L = st.plano[c.i]; if (!L || L.status !== "pendente") return;
              var v = Orcamentista.validarComposicaoIA(L, c, ctx); L.refinadoIA = true;
              if (!v) return;
              var eqN = 0;
              v.insumos.forEach(function (ins) {
                if (Number(ins.custoUnitario) > 0) return;
                var q = Orcamentista.termosDeBusca(ins.descricao, ctx.normalizar).slice(0, 3).join(" ");
                /* insumo OU composição auxiliar: "PEDREIRO COM ENCARGOS COMPLEMENTARES" é composição
                   na SINAPI (88309), e a própria SINAPI usa auxiliar dentro de composição — só
                   insumo deixava a mão de obra que a IA cita sem preço (achado pela e2e) */
                var eq = Orcamentista.precoPorEquivalencia(ins, ctx.buscar(q, { fontes: ctx.fontes, max: 80 }) || [], ctx);
                if (!eq) return;
                ins.custoUnitario = eq.custoUnitario; ins.fonte = eq.fonte; ins.codigo = eq.codigo; eqN++;
                ins.memoria = "insumo proposto pela IA sem igual nas bases — preço de " + eq.fonte + " " + eq.codigo + " (" + String(eq.descricao).slice(0, 60) + "), o maior entre " + eq.equivalentes + " equivalente(s); conferir";
              });
              var custo = ComposicaoPropria.custo(v.insumos, "truncar2");
              var semPreco = v.insumos.filter(function (i) { return !(Number(i.custoUnitario) > 0); }).length;
              var cods = self._cpCodigosExistentes().concat(ctx.codigosGerados || []);
              var codigo = ComposicaoPropria.gerarCodigoLegivel("OUTROS", cods); (ctx.codigosGerados = ctx.codigosGerados || []).push(codigo);
              L.comp = { codigo: codigo, codigoSec: "", descricao: L.item.descricao, grupo: "OUTROS", unidade: v.unidade, modeloRef: "SINAPI", metodo: "truncar2",
                maoDeObra: v.insumos.some(function (i) { return i.categoria === "MO"; }),
                observacao: "Composição criada pela IA no Escopo e validada contra as bases: " + v.insumos.length + " insumo(s)" + (eqN ? ", " + eqN + " com preço por equivalência (maior valor)" : "") + (semPreco ? ", " + semPreco + " SEM preço" : "") + ". Confira coeficiente por coeficiente.",
                insumos: v.insumos };
              var comp = L.comp, motivo = "composição própria criada pela IA (insumos e coeficientes; preços das bases" + (eqN ? ", " + eqN + " por equivalência" : "") + (semPreco ? "; " + semPreco + " insumo(s) sem preço" : "") + ")";
              irmaos(L).forEach(function (X, xi) {
                if (X.status !== "pendente") return;
                /* o MESMO objeto `comp` nas linhas iguais: o _orcmAplicar grava um código uma vez só */
                X.comp = comp; X.status = "propria"; X.via = "ia"; X.fonte = "PROPRIA"; X.codigo = codigo; X.refinadoIA = true;
                X.custoUnitario = custo.total; X.custoMO = custo.mo; X.custoMAT = custo.mat; X.custoEQ = custo.eq;
                X.confianca = 30; X.motivo = motivo + (xi ? " — a mesma da linha " + (L.i + 1) : "");
                X.avisos.push(v.aviso);
              });
              feitas++;
            });
          }, function () {});
      });
    }, Promise.resolve()).then(function () {
      UI.loadingFim();
      pend.forEach(function (L) { delete L._grupoIA; });
      var resto = pend.filter(function (L) { return L.status === "pendente"; }).length;
      st.escopoGerado.compostasIA = feitas;
      if (parar) UI.toast("A IA parou: " + parar + ". " + feitas + " composição(ões) criada(s); " + resto + " serviço(s) ficam marcados para completar.", "erro");
      else if (resto) UI.toast(feitas + " composição(ões) criada(s) pela IA; " + resto + " ainda sem composição — estão no relatório.", "erro");
    });
  };

  /* ---------------- o relatório do que conferir ---------------- */
  App._escopoRelatorio = function (st, info) {
    var plano = st.plano || [], n = { casado: 0, revisar: 0, propria: 0, pendente: 0 }, custo = 0;
    var codsProprias = {};
    var conferir = [];
    plano.forEach(function (L) {
      n[L.status] = (n[L.status] || 0) + 1;
      if (L.status === "propria" && L.codigo) codsProprias[L.codigo] = 1;
      custo += (Number(L.item.quantidade) || 0) * (Number(L.custoUnitario) || 0);
      if (L.status !== "casado") conferir.push(L);
    });
    var rot = { revisar: "Conferir", propria: "Composição própria", pendente: "Sem preço" };
    var linhas = conferir.slice(0, 200).map(function (L) {
      return "<tr><td>" + esc(rot[L.status] || L.status) + "</td><td>" + esc(L.codigo || "") + "</td><td style=\"font-size:12px\">" + esc(String(L.item.descricao).slice(0, 70)) +
        '</td><td class="num">' + Util.fmtMoeda(Number(L.custoUnitario) || 0) + '</td><td class="muted" style="font-size:11px">' + esc(String(L.motivo || "").slice(0, 120)) + "</td></tr>";
    }).join("");
    var g = st.escopoGerado || {};
    var corpo = '<p style="font-size:13.5px;margin-top:0"><b>' + plano.length + " serviços gravados no orçamento</b> — custo direto estimado " + Util.fmtMoeda(Math.round(custo * 100) / 100) + " (antes do BDI).</p>" +
      '<div class="flex" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<span class="pill" style="background:#16a34a;color:#fff">' + n.casado + " da base oficial</span>" +
        '<span class="pill" style="background:#2e6f9e;color:#fff">' + Object.keys(codsProprias).length + " composições próprias criadas" + (n.propria > Object.keys(codsProprias).length ? " (" + n.propria + " linhas)" : "") + "</span>" +
        '<span class="pill" style="background:#f59e0b;color:#fff">' + n.revisar + " a conferir</span>" +
        (n.pendente ? '<span class="pill" style="background:#dc2626;color:#fff">' + n.pendente + " sem preço</span>" : "") +
      "</div>" +
      (info && info.blocos ? '<p class="muted" style="font-size:12px;margin:0 0 6px">Texto estruturado pela IA em ' + info.blocos + " parte(s)" + (info.modelo ? " (" + esc(info.modelo) + ")" : "") + "." +
        (info.semIA ? " <b>" + info.semIA + " parte(s) sem resposta da IA foram analisadas linha a linha</b> — nada ficou de fora." : "") + "</p>" : "") +
      (g.premissas && g.premissas.length ? '<details style="margin-bottom:8px"><summary style="cursor:pointer;font-size:12.5px"><b>Premissas dos parâmetros</b> (' + g.premissas.length + ")</summary><ul style=\"font-size:12px;margin:6px 0 0 16px\">" + g.premissas.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></details>" : "") +
      (conferir.length ? '<div style="max-height:320px;overflow:auto;border:1px solid var(--linha);border-radius:8px"><table class="tbl"><thead><tr><th>Situação</th><th>Código</th><th>Serviço</th><th class="num">Unitário</th><th>Por quê</th></tr></thead><tbody>' + linhas + "</tbody></table></div>" +
        (conferir.length > 200 ? '<p class="muted" style="font-size:11.5px">… e mais ' + (conferir.length - 200) + " no arquivo.</p>" : "") : "") +
      '<p class="muted" style="font-size:11.5px;margin:8px 0 0">Cada item guarda a origem do preço e a memória de cálculo da quantidade (coluna Memória). O relatório de conferência é <b>interno</b> — não vai na proposta.</p>';
    var self = this;
    UI.modal(ic("check") + " Orçamento gerado", corpo, [
      { texto: ic("baixar") + " Baixar relatório de conferência", classe: "ghost", onClick: function () { self._escopoBaixarRelatorio(st); } },
      { texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }
    ]);
    var m = document.querySelector(".modal-bg:last-child .modal"); if (m) m.style.maxWidth = "980px";
  };

  App._escopoBaixarRelatorio = function (st) {
    var g = st.escopoGerado || {}, L = [];
    L.push("RELATÓRIO INTERNO DE CONFERÊNCIA — orçamento gerado pelo Escopo Inteligente");
    L.push("Orçamento: " + (st.nome || "") + " · gerado em " + new Date(g.em || Date.now()).toLocaleString("pt-BR"));
    L.push("Bases varridas: " + (st.fontes || []).join(" > "));
    if (g.parametros) L.push("Parâmetros: " + JSON.stringify(g.parametros));
    (g.premissas || []).forEach(function (p) { L.push("Premissa: " + p); });
    L.push("");
    (st.plano || []).forEach(function (Lx, i) {
      L.push((i + 1) + ". [" + Lx.status.toUpperCase() + "] " + (Lx.codigo || "-") + " " + (Lx.fonte || "") + " | " + Lx.item.descricao + " | " + Lx.item.quantidade + " " + (Lx.item.unidade || "") +
        " | unit. " + (Number(Lx.custoUnitario) || 0).toFixed(2) + " | " + (Lx.motivo || "") + (Lx.item.formula ? " | quantidade: " + Lx.item.formula : "") + ((Lx.avisos || []).length ? " | AVISOS: " + Lx.avisos.join(" / ") : ""));
    });
    try {
      var blob = new Blob([L.join("\r\n")], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "conferencia-" + String(st.nome || "orcamento").replace(/[^\w\-]+/g, "_").slice(0, 40) + ".txt";
      document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 500);
    } catch (e) { UI.toast("Não consegui gerar o arquivo: " + e.message, "erro"); }
  };
})(typeof window !== "undefined" ? window : this);
