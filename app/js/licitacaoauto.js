/* =====================================================================
 * licitacaoauto.js — ORÇAMENTO DE LICITAÇÃO AUTOMÁTICO (CertamePRO -> OrçaPRO -> CertamePRO)
 *
 * Pedido do Rogério (08/11/2026): "quando sair do CertamePRO e for para o
 * OrçaPRO, lá também vai ser automatizado; tem que estar parametrizado lá
 * dentro, com pré-configurações e presets; pelo edital, ser autossuficiente,
 * com todas as regras que a gente sabe que precisa, de onde baixar os valores,
 * e voltar esse orçamento para o CertamePRO sozinho."
 *
 * Contrato: RA-Equipe\licitacoes\contrato-orcamento-automatico-v1.md. Os campos
 * novos do bloco `certamepro` (orcamento_automatico, preset, regime_execucao,
 * arredondamento) são OPCIONAIS: sem eles nada muda no comportamento de hoje.
 *
 * O QUE ESTE MÓDULO FAZ (puro: sem DOM e sem rede; a fiação fica em js/app.js)
 *   1. PRESETS: o conjunto de regras de cada tipo de contratação (obra,
 *      serviço de engenharia, serviço comum, compra).
 *   2. escolherPreset / aplicarPreset: qual preset vale e a sua aplicação,
 *      idempotente, sem soltar a trava dos itens do órgão.
 *   3. orcar: refaz o CUSTO de cada item do órgão a partir das bases que o
 *      edital exige, na competência que o edital exige.
 *   4. marcar / marcarConferido: a marca `config.licitacao.automatico`, que
 *      segue no _meta do _PRO.xlsx de volta ao CertamePRO.
 *
 * ⚠ REGRAS QUE NÃO PODEM SER "SIMPLIFICADAS"
 *  a) NUNCA SE INVENTA CÓDIGO NEM PREÇO. O custo só vem da base quando o item
 *     casou na base EXIGIDA, na COMPETÊNCIA EXIGIDA, com confiança acima do
 *     limiar automático do Orçamentista e na mesma unidade. Qualquer outra
 *     coisa — não achou, confiança baixa, base ou competência que não está
 *     instalada — MANTÉM o preço do órgão que veio no pacote e entra em
 *     `baixa_confianca`, com o motivo em português.
 *  b) NUNCA OUTRA COMPETÊNCIA EM SILÊNCIO. Só conta como "base exigida" a que
 *     Licitacao.situacaoBases dá como "instalada" (fonte, UF/praça,
 *     competência e regime iguais aos do edital). "outra" (a pessoa escolheu
 *     uma competência diferente) NÃO vale aqui: no automático ninguém está
 *     olhando, e preço de outro mês é a diferença que desclassifica.
 *  c) ITEM DO ÓRGÃO CONTINUA TRAVADO. Este módulo só mexe em preço (custo
 *     unitário e parcelas MO/MAT/EQ) e, no máximo, no código de um item que
 *     veio sem código. Descrição, unidade e quantidade ficam como o órgão
 *     mandou.
 *  d) ITEM COM CÓDIGO DO ÓRGÃO QUE A BASE NÃO TEM não é "corrigido" pela
 *     descrição: trocar o código que o órgão listou pelo de um serviço
 *     parecido é decisão de quem orça. Mantém o preço do órgão e avisa.
 *  e) IDEMPOTENTE. O preço do órgão é guardado no item (autoOrc.custoOrgao) na
 *     primeira rodada; rodar de novo parte DELE, não do preço já trocado. Preço
 *     que a pessoa editou depois do automático (diferente do que o automático
 *     gravou) não é refeito.
 *
 * ES5 de propósito (ver CLAUDE.md).
 * ===================================================================== */
(function (global) {
  "use strict";

  function _dep(nome) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") {
      try { var m = require("./" + nome.toLowerCase() + ".js"); if (m) return m; } catch (e) {}
    }
    return null;
  }
  function s(v) { return String(v == null ? "" : v).trim(); }
  function num(v) { var u = _dep("Util"); return u ? u.num(v) : (Number(v) || 0); }
  function r4(v) { return Math.round((Number(v) || 0) * 10000) / 10000; }
  function agora() { var u = _dep("Util"); return (u && u.agoraISO) ? u.agoraISO() : new Date().toISOString(); }
  function versaoApp() {
    var c = _dep("CONFIG") || global.CONFIG;
    return (c && c.versao) ? String(c.versao) : "";
  }

  var COLUNAS_TODAS = { pubdi: true, cat: true, ref: true };

  /* ------------------------------------------------------------------
   * PRESETS
   *   obra       — liga os limites de 75%/85% do art. 59, §§ 4º e 5º da Lei
   *                14.133 (só valem para obra e serviço de engenharia).
   *   tipoTcu    — a faixa de BDI do Acórdão TCU 2.622/2013 usada no aviso
   *                (Bdi.FAIXAS_TCU). Compra de material usa "fornecimento".
   *   regime     — regime de execução que o preset assume.
   *   bases      — como as bases são escolhidas: as EXIGIDAS no edital, na
   *                ordem do edital, cada uma na praça/UF, competência e
   *                regime pedidos (exatos: ver regra b do cabeçalho).
   *   arredondamento — null = o do pacote, se veio; senão o do orçamento.
   *   colunas    — colunas extras da planilha (js/colunas.js) ligadas.
   * ------------------------------------------------------------------ */
  var BASES_DO_EDITAL = { origem: "edital", ordem: "do edital", praca: "exata", competencia: "exata", regime: "exato" };
  function preset(id, rotulo, obra, tipoTcu, regime, colunas) {
    return { id: id, rotulo: rotulo, obra: obra, tipoTcu: tipoTcu, regime: regime, bases: BASES_DO_EDITAL, arredondamento: null, colunas: colunas };
  }
  var PRESETS = {
    obra_global: preset("obra_global", "Obra — empreitada por preço global", true, "edificacoes", "empreitada_global", COLUNAS_TODAS),
    obra_unitario: preset("obra_unitario", "Obra — empreitada por preço unitário", true, "edificacoes", "empreitada_unitario", COLUNAS_TODAS),
    servico_engenharia: preset("servico_engenharia", "Serviço de engenharia", true, "edificacoes", null, COLUNAS_TODAS),
    servico_comum: preset("servico_comum", "Serviço comum", false, "edificacoes", null, COLUNAS_TODAS),
    compra: preset("compra", "Compra de material ou equipamento", false, "fornecimento", null, { pubdi: true, cat: false, ref: true })
  };
  var ORDEM_PRESETS = ["obra_global", "obra_unitario", "servico_engenharia", "servico_comum", "compra"];

  var ARRED_PACOTE = { truncar2: "truncar2", arredondar2: "arred2" };

  var LicitacaoAuto = {
    PRESETS: PRESETS,
    ORDEM_PRESETS: ORDEM_PRESETS,

    presetValido: function (id) { return !!(id && Object.prototype.hasOwnProperty.call(PRESETS, s(id))); },

    /* ------------------------------------------------------------------
     * Qual preset vale. Sem `preset` válido no pacote, deduz de
     * `obra_engenharia` + `regime_execucao` e DIZ que deduziu (o motivo vai
     * para a marca e para o aviso). Nada é inventado: sem pista suficiente
     * cai no preset mais conservador (serviço comum: limites de 75%/85%
     * desligados, que é como o OrçaPRO já tratava pacote sem a informação).
     * ------------------------------------------------------------------ */
    escolherPreset: function (bloco) {
      bloco = (bloco && typeof bloco === "object") ? bloco : {};
      var pedido = s(bloco.preset);
      if (this.presetValido(pedido)) return { id: pedido, deduzido: false, motivo: "preset informado pelo pacote" };
      var aviso = pedido ? ("preset “" + pedido + "” não existe; ") : "";
      var obra = bloco.obra_engenharia === true ? true : (bloco.obra_engenharia === false ? false : null);
      var reg = s(bloco.regime_execucao);
      if (obra === true) {
        if (reg === "empreitada_unitario") return { id: "obra_unitario", deduzido: true, motivo: aviso + "deduzido: obra de engenharia, empreitada por preço unitário" };
        if (reg === "empreitada_global" || reg === "integral") return { id: "obra_global", deduzido: true, motivo: aviso + "deduzido: obra de engenharia, regime " + (reg === "integral" ? "de contratação integral" : "de empreitada por preço global") };
        return { id: "servico_engenharia", deduzido: true, motivo: aviso + "deduzido: obra ou serviço de engenharia" + (reg === "tarefa" ? " por tarefa" : " sem regime de execução informado") };
      }
      if (obra === false) return { id: "servico_comum", deduzido: true, motivo: aviso + "deduzido: não é obra nem serviço de engenharia (o pacote não permite distinguir serviço comum de compra)" };
      return { id: "servico_comum", deduzido: true, motivo: aviso + "deduzido: o pacote não informa se é obra de engenharia; tratado como serviço comum (limites de 75% e 85% desligados)" };
    },

    /* ------------------------------------------------------------------
     * Aplica o preset ao orçamento. Idempotente: aplicar duas vezes deixa o
     * orçamento igual. Não solta a trava e não mexe em item.
     *  · lic.preset (id), lic.presetDeduzido, lic.presetMotivo
     *  · lic.obra, só quando o pacote/a pessoa NÃO informou (uma marcação
     *    explícita vale mais que o preset; se discordar, vira aviso)
     *  · arredondamento: o do pacote, quando veio e é válido
     *  · colunas extras ligadas no que ainda é "não escolhido" (null); o que a
     *    pessoa desligou (false) fica desligado
     * ------------------------------------------------------------------ */
    aplicarPreset: function (orc, presetId, bloco, info) {
      var L = _dep("Licitacao"), O = _dep("Orcamento");
      var p = this.presetValido(presetId) ? PRESETS[s(presetId)] : null;
      if (!orc || !L || !p) return null;
      bloco = (bloco && typeof bloco === "object") ? bloco : {};
      info = info || {};
      var lic = L.cfg(orc);
      if (!lic) return null;
      if (O && O.garantirConfig) O.garantirConfig(orc);
      var avisos = [];
      lic.preset = p.id;
      lic.presetDeduzido = info.deduzido === true;
      lic.presetMotivo = s(info.motivo);
      if (lic.obraInformada === true && lic.obra !== p.obra) {
        avisos.push("O pacote marca " + (lic.obra ? "obra ou serviço de engenharia" : "que NÃO é obra nem serviço de engenharia") + ", e o preset “" + p.rotulo + "” pede o contrário. Vale a marcação do pacote; confira os limites de 75% e 85%.");
      } else if (lic.obraInformada !== true) {
        lic.obra = p.obra;
      }
      var arr = ARRED_PACOTE[s(bloco.arredondamento)] || ARRED_PACOTE[s(lic.arredondamentoPacote)] || null;
      if (arr) { orc.config.arredondamento = arr; lic.arredondamentoPacote = s(bloco.arredondamento) || s(lic.arredondamentoPacote); }
      var col = orc.config.colunas;
      if (col && typeof col === "object") {
        Object.keys(p.colunas).forEach(function (k) { if (p.colunas[k] === true && col[k] === null) col[k] = true; });
      }
      lic.autoAvisos = avisos;
      return { preset: p, avisos: avisos };
    },

    /* ------------------------------------------------------------------
     * BDI: LÊ o BDI que o orçamento carrega e só AVISA. ⚠ O automático NUNCA
     * escreve em orc.bdi.percentual (revisão de 08/11/2026: refazer o percentual
     * dos parâmetros mudava 25,1249 para 25,12 em silêncio — e o BDI é o que o
     * órgão confere). Avisa se (a) fugir da faixa do Acórdão TCU 2.622/2013 do
     * tipo do preset, ou (b) os parâmetros e o percentual gravado divergirem.
     * ------------------------------------------------------------------ */
    conferirBdi: function (orc, presetId) {
      var B = _dep("Bdi") || global.Bdi, p = PRESETS[s(presetId)] || PRESETS.servico_comum;
      if (!orc || !orc.bdi || !B) return { percentual: null, aviso: null, avisoDivergencia: null, tipoTcu: p.tipoTcu };
      var pct = num(orc.bdi.percentual), div = null;
      if (orc.bdi.params && typeof orc.bdi.params === "object") {
        var dosParams = B.calcular(orc.bdi.params);
        /* o cálculo arredonda em 2 casas: até 0,01 de diferença é só o arredondamento */
        if (Math.abs(dosParams - pct) > 0.011) div = "Os parâmetros do BDI dão " + dosParams + "% e o percentual gravado no orçamento é " + pct + "%. O automático usou o gravado; confira na aba BDI.";
      }
      return { percentual: pct, aviso: B.avisoFaixa ? B.avisoFaixa(pct, p.tipoTcu) : null, avisoDivergencia: div, tipoTcu: p.tipoTcu };
    },

    /* a fonte do item como o pacote a declarou ("" = não declarou) */
    _fonteDeclarada: function (it) {
      var b = s(it.baseFonte), o = s(it.origem).toUpperCase();
      if (b) return b;
      if (!o || o === "PROPRIA" || o === "PROPRIO" || o === "OUTRA" || o === "OUTRO") return "";
      return s(it.origem);
    },
    _fonteEhPropria: function (it) {
      var L = _dep("Licitacao"), o = s(it.origem).toUpperCase(), b = s(it.baseFonte).toUpperCase().replace(/[^A-Z0-9_]/g, "");
      return o === "PROPRIA" || o === "PROPRIO" || b === "PROPRIA" || !!(L && L.FONTES_PROPRIAS && (L.FONTES_PROPRIAS[b] || L.FONTES_PROPRIAS[o]));
    },

    /* ------------------------------------------------------------------
     * SITUAÇÃO DAS BASES NO AUTOMÁTICO. Mais rígida que a do modo manual
     * (Licitacao.situacaoBases, que fica como está): além de instalada, a base
     * tem de DECLARAR o regime — onerado ou desonerado — igual ao exigido.
     * Base sem regime declarado não serve: não se sabe que preço ela traz.
     * ------------------------------------------------------------------ */
    situacaoAuto: function (orc, ctx) {
      var L = _dep("Licitacao");
      if (!orc || !L || !L.basesExigidas(orc).length) return [];
      ctx = ctx || {};
      return L.situacaoBases(orc, ctx).map(function (x) {
        var ex = x.exigida, ok = x.estado === "instalada", motivo = ok ? "" : (L.fmtBase(ex) + " não instalada"), aviso = "";
        if (ok && ex.catId === "SINAPI_DES") {
          /* ⚠ o regime da SINAPI desonerada NÃO vem do Licitacao._emUso, que o infere do nome da base.
             Tem de estar DECLARADO na base instalada (desonerado === true). */
          var inst = (ctx.instaladas || []).filter(function (b) { return b && s(b.fonte).toUpperCase() === "SINAPI_DES"; })[0];
          if (!inst || inst.desonerado !== true) { ok = false; motivo = "a base SINAPI desonerada instalada (" + L.fmtBase(x.emUso || ex) + ") não declara que é desonerada"; }
        } else if (ok && ex.catId === "SINAPI") {
          /* motor SINAPI do app: pede o regime declarado na carga (ctx.sinapi.regime). Sem declaração, só a
             base que vem no app serve, como onerada — e o aviso diz isso. */
          var rg = s((ctx.sinapi || {}).regime).toLowerCase();
          if (rg === "desonerado") { ok = false; motivo = "a carga da SINAPI declara ser desonerada e o edital pede onerada"; }
          else if (rg !== "onerado") aviso = "regime assumido: base do app, não desonerada (a carga da SINAPI não declara o regime)";
        } else if (ok && ex.regime && (!x.emUso || x.emUso.regime !== ex.regime)) {
          ok = false;
          motivo = "a base instalada (" + L.fmtBase(x.emUso || ex) + ") não declara se é " + (ex.regime === "desonerado" ? "desonerada" : "onerada");
        }
        return { exigida: ex, emUso: x.emUso, ok: ok, motivo: motivo, aviso: aviso, texto: x.texto };
      });
    },

    /* ------------------------------------------------------------------
     * O QUE O ÓRGÃO MANDOU PARA O ITEM. Fonte, em ordem:
     *   1. a marca gravada no item na importação (it.orgao);
     *   2. lic.refs (preço de referência do pacote, por número ou código).
     * ⚠ NUNCA o preço atual do item: quem já mexeu no preço (fluxo manual)
     * perderia o valor do órgão e a cotação dele seria tratada como "do órgão".
     * ------------------------------------------------------------------ */
    _origemDoItem: function (lic, it) {
      if (it.orgao && typeof it.orgao === "object" && it.orgao.custo != null) return it.orgao;
      var refs = lic && lic.refs, ref = null;
      if (refs) {
        if (s(it.numeroOrigem) && refs.n && refs.n[s(it.numeroOrigem)]) ref = refs.n[s(it.numeroOrigem)];
        else if (s(it.codigo) && refs.c && refs.c[s(it.codigo)]) ref = refs.c[s(it.codigo)];
      }
      if (ref && num(ref.preco) > 0) {
        /* ⚠ A REFERÊNCIA NUNCA É ESCRITA NO ITEM (revisão de 08/11/2026, volta 2). Só serve de prova: se o custo
           atual está a até 1% dela, é o preço do órgão (o PU impresso tem 2 casas, o custo tem 6); fora disso não
           dá para saber se alguém mexeu — o item fica como está. */
        var cur = num(it.custoUnitario), rp = num(ref.preco);
        if (Math.abs(cur - rp) <= 0.01 * rp) return { custo: cur, mo: null, mat: null, eq: null, codigo: s(it.codigo), origem: it.origem, baseFonte: it.baseFonte, deRef: true };
        return { antigo: true };
      }
      return null;
    },
    _estadoItem: function (lic, it) {
      var ao = (it.autoOrc && typeof it.autoOrc === "object") ? it.autoOrc : null, org = this._origemDoItem(lic, it), antigo = false;
      if (org && org.antigo) { org = null; antigo = true; }
      if (!org && ao && ao.custoOrgao != null) { org = { custo: num(ao.custoOrgao), mo: null, mat: null, eq: null }; antigo = false; }
      var editado = false;
      if (ao && ao.custoAplicado != null) editado = Math.abs(num(it.custoUnitario) - num(ao.custoAplicado)) > 0.005;
      else if (org) editado = Math.abs(num(it.custoUnitario) - num(org.custo)) > 0.005;
      return { ao: ao, org: org, editado: editado, semOrigem: !org, antigo: antigo };
    },
    /* quantos itens do órgão a pessoa já alterou (o automático não os refaz) */
    contarEditados: function (orc) {
      var L = _dep("Licitacao"), lic = L ? L.cfg(orc) : null, self = this, n = 0;
      (orc && orc.etapas || []).forEach(function (e) {
        ((e && e.itens) || []).forEach(function (it) { if (it && it.travadoOrgao === true && self._estadoItem(lic, it).editado) n++; });
      });
      return n;
    },

    /* ------------------------------------------------------------------
     * ORÇAR. `ctx` junta o que o Orçamentista pede (obter, buscar, itensDe,
     * normalizar, unidadeChave, sinonimos) e o que Licitacao.situacaoBases
     * pede (sinapi, instaladas, compsOnerada, fatos, catalogo). Devolve:
     *   { itens, pela_base, por_descricao, preco_do_orgao_mantido,
     *     baixa_confianca:[...], editados_pelo_usuario, bases:[...] }
     * e grava o rastro em cada item (autoOrc).
     *
     * QUEM PODE TROCAR O PREÇO (revisão adversarial de 08/11/2026)
     *  · item com FONTE DECLARADA e código: só via "codigo", na mesma família da
     *    base declarada. Antes, "codigo-inferido" deixava o preço do SINAPI 2046
     *    ir para o do ORSE 2046 (outro serviço, 95%).
     *  · item sem fonte declarada e com código: "codigo-inferido" só se o código
     *    existe em UMA única base exigida e a descrição parece (>= limiar auto).
     *  · item SEM código: casa por descrição (>= limiar auto, mesma unidade),
     *    mas SEMPRE entra em baixa_confianca (por_descricao).
     *  · fora disso: preço do órgão + baixa_confianca.
     * ------------------------------------------------------------------ */
    orcar: function (orc, ctx, opts) {
      var L = _dep("Licitacao"), Orq = _dep("Orcamentista") || global.Orcamentista;
      if (!orc || !L || !Orq) throw new Error("licitacaoauto: faltam Licitacao ou Orcamentista.");
      ctx = ctx || {}; opts = opts || {};
      var self = this, lic = L.cfg(orc);
      var exigidas = L.basesExigidas(orc);
      var situacao = this.situacaoAuto(orc, ctx);
      var elegiveis = [], porCat = {};
      situacao.forEach(function (x) {
        if (x.ok && elegiveis.indexOf(x.exigida.catId) < 0) { elegiveis.push(x.exigida.catId); porCat[x.exigida.catId] = x.exigida; }
      });
      var faltam = situacao.filter(function (x) { return !x.ok; });
      var resumo = { itens: 0, pela_base: 0, por_descricao: 0, preco_do_orgao_mantido: 0, baixa_confianca: [], editados_pelo_usuario: 0, sem_preco_do_orgao: 0,
        avisos: situacao.filter(function (x) { return !!x.aviso; }).map(function (x) { return L.fmtBase(x.exigida) + ": " + x.aviso; }),
        bases: situacao.map(function (x) { return { base: L.fmtBase(x.exigida), estado: x.ok ? "instalada" : "ausente", texto: x.ok ? x.texto : x.motivo }; }) };

      /* as bases, só as exigidas e aceitas, na ordem do edital */
      var ok = function (f) { return elegiveis.indexOf(f) >= 0; };
      var ctx2 = {};
      Object.keys(ctx).forEach(function (k) { ctx2[k] = ctx[k]; });
      ctx2.fontes = elegiveis.slice();
      ctx2.elaborar = null;              // composição própria por analogia é preço inventado aqui
      ctx2.semPendente = true;           // só mesma unidade decide na busca por descrição
      ctx2._idxDesc = null; ctx2._compCache = null;
      if (typeof ctx.obter === "function") ctx2.obter = function (f, cod) { return ok(f) ? ctx.obter(f, cod) : null; };
      if (typeof ctx.itensDe === "function") ctx2.itensDe = function (f) { return ok(f) ? ctx.itensDe(f) : []; };
      if (typeof ctx.buscar === "function") ctx2.buscar = function (q, o) {
        o = o || {};
        return (ctx.buscar(q, { fontes: elegiveis.slice(), max: o.max, tipo: o.tipo }) || []).filter(function (r) { return r && ok(r.fonte); });
      };
      var lim = ctx2.limiares || Orq.LIMIARES;

      /* em quantas bases aceitas o código existe (e o item achado, para a semelhança) */
      var basesComCodigo = function (cod) {
        var achou = [], vars = Orq.variantes(cod);
        elegiveis.forEach(function (f) {
          for (var v = 0; v < vars.length; v++) { var b = ctx2.obter ? ctx2.obter(f, vars[v]) : null; if (b) { achou.push({ fonte: f, item: b }); break; } }
        });
        return achou;
      };
      var nomeSemEstado = function (f) { return Orq.normalizarFonte(f); };

      /* itens do órgão -> entrada do Orçamentista */
      var entrada = [], refs = [];
      (orc.etapas || []).forEach(function (e, ei) {
        var et = { nome: e.nome, codigo: e.codigo, itens: [] };
        ((e && e.itens) || []).forEach(function (it, ii) {
          if (!it || it.travadoOrgao !== true) return;
          var cod = s(it.codigo) && s(it.codigo) !== "—" ? s(it.codigo) : "";
          var est = self._estadoItem(lic, it), ao = est.ao, org = est.org;
          /* código que o PRÓPRIO automático pôs (item que veio sem código): para esta rodada o item
             continua "sem código", senão a 2ª rodada o trataria como item com código e perderia a
             marca de casado por descrição */
          var aplicadoAntes = !!(ao && ao.codigoAplicado !== undefined && ao.codigoAplicado !== null && cod === ao.codigoAplicado);
          if (aplicadoAntes) cod = "";
          var numero = s(it.numeroOrigem) || (s(e.codigo) ? s(e.codigo).replace(/\.0$/, "") + "." + (ii + 1) : String(ii + 1));
          /* código/origem COMO O ÓRGÃO MANDOU (para restaurar quando o preço volta ao do órgão) */
          /* orçamento importado antes desta marca, ainda NUNCA tocado pelo automático: o estado de agora
             (com o custo dentro de 1% da referência) vira a marca do órgão. O preço da referência não é escrito. */
          if (!it.orgao && !ao && org && !est.semOrigem) {
            it.orgao = { custo: num(org.custo), mo: it.custoMO != null ? num(it.custoMO) : null, mat: it.custoMAT != null ? num(it.custoMAT) : null,
              eq: it.custoEQ != null ? num(it.custoEQ) : null, codigo: s(it.codigo), origem: it.origem };
            if (Object.prototype.hasOwnProperty.call(it, "baseFonte")) it.orgao.baseFonte = it.baseFonte;
          }
          var orig, og = (it.orgao && typeof it.orgao === "object") ? it.orgao : null;
          if (ao && ao.codigoOrgao !== undefined) orig = { codigo: ao.codigoOrgao, origem: ao.origemOrgao, temBaseFonte: ao.temBaseFonteOrgao === true, baseFonte: ao.baseFonteOrgao };   // formato antigo do autoOrc
          else if (og) orig = { codigo: s(og.codigo), origem: og.origem, temBaseFonte: Object.prototype.hasOwnProperty.call(og, "baseFonte"), baseFonte: og.baseFonte };
          else orig = { codigo: it.codigo, origem: it.origem, temBaseFonte: Object.prototype.hasOwnProperty.call(it, "baseFonte"), baseFonte: it.baseFonte };
          var custoOrg = org ? num(org.custo) : null;
          var decl0 = aplicadoAntes ? "" : self._fonteDeclarada(it);
          refs.push({ it: it, etapa: e, numero: numero, cod: cod, decl: decl0, editado: est.editado, semOrigem: est.semOrigem, antigo: est.antigo, ao: ao, org: org, orig: orig, custoOrg: custoOrg });
          et.itens.push({ _ref: it, _n: refs.length - 1, codigo: cod, fonte: decl0, descricao: it.descricao, unidade: it.unidade,
            quantidade: it.quantidade, custoUnitario: 0, custoPlanilha: custoOrg || 0 });
        });
        if (et.itens.length) entrada.push(et);
      });

      var plano = [];
      if (entrada.length) {
        if (elegiveis.length) plano = Orq.planejar(entrada, ctx2).plano;
        else {
          entrada.forEach(function (et) { et.itens.forEach(function (x) { plano.push({ item: x, status: "pendente", via: "nenhum", confianca: 0, motivo: "", sem: true }); }); });
        }
      }

      var textoFaltam = function (decl) {
        var fam = /^SINAPI/i.test(s(decl)) ? "SINAPI" : "";
        var rel = faltam.filter(function (x) { return !fam || /^SINAPI/.test(x.exigida.catId); });
        if (!rel.length) rel = faltam;
        return rel.length ? rel[0].motivo : "";
      };
      var restaurarCodigo = function (r) {
        var it = r.it, ao = r.ao;
        if (ao && ao.codigoAplicado !== undefined && ao.codigoAplicado !== null && it.codigo === ao.codigoAplicado) {
          it.codigo = r.orig.codigo; it.origem = r.orig.origem;
          if (r.orig.temBaseFonte) it.baseFonte = r.orig.baseFonte; else delete it.baseFonte;
        }
      };
      /* parcelas MO/MAT/EQ do órgão: de it.orgao (ou do autoOrc no formato antigo); sem elas, as atuais */
      var parcelasDoOrgao = function (r) {
        if (r.ao && r.ao.parcelasOrgao) return r.ao.parcelasOrgao;
        if (r.org && !r.org.deRef && (r.org.mo != null || r.org.mat != null || r.org.eq != null)) return { mo: num(r.org.mo), mat: num(r.org.mat), eq: num(r.org.eq) };
        if (r.it.orgao && (r.it.orgao.mo != null || r.it.orgao.mat != null || r.it.orgao.eq != null)) return { mo: num(r.it.orgao.mo), mat: num(r.it.orgao.mat), eq: num(r.it.orgao.eq) };
        return { mo: num(r.it.custoMO), mat: num(r.it.custoMAT), eq: num(r.it.custoEQ) };
      };
      var juntar = function (a, b) { Object.keys(b).forEach(function (k) { a[k] = b[k]; }); return a; };
      /* ⚠ NO ITEM VAI SÓ UM CÓDIGO CURTO DO MOTIVO (autoOrc.motivo); o texto completo fica na marca
         (config.licitacao.automatico.baixa_confianca) e na tela. 600 itens com o texto repetido em cada um
         pesavam centenas de KB no orçamento e no _meta do Excel. */
      var manter = function (r, motivo, conf, codMotivo) {
        var it = r.it, ao = r.ao || {};
        if (r.editado) {
          resumo.editados_pelo_usuario++;
          var m1 = "preço alterado por você depois do que o órgão mandou; o automático não o refaz";
          it.autoOrc = juntar(juntar({}, ao), { via: "editado", motivo: "editado", baixa: true, confianca: 0 });
          if (it.autoOrc.custoOrgao === undefined) it.autoOrc.custoOrgao = r.custoOrg;
          if (it.autoOrc.custoAplicado === undefined) it.autoOrc.custoAplicado = null;
          resumo.baixa_confianca.push({ numero: r.numero, codigo: r.cod, descricao: s(it.descricao), motivo: m1, confianca: 0 });
          return;
        }
        if (r.semOrigem) {
          var m2 = r.antigo ? "orçamento antigo: não dá para saber se o preço foi alterado; o automático não mexeu no preço"
            : "o preço original do órgão não está registrado neste orçamento; o automático não mexeu no preço";
          it.autoOrc = { via: "orgao", motivo: r.antigo ? "antigo" : "sem-origem", baixa: true };
          resumo.baixa_confianca.push({ numero: r.numero, codigo: r.cod, descricao: s(it.descricao), motivo: m2, confianca: 0 });
          return;
        }
        var parc = parcelasDoOrgao(r);
        restaurarCodigo(r);
        if (it.composicaoOrgaoGuardada) {   // o preço do órgão volta: a composição dele também
          if (it.composicaoOrgaoGuardada.insumos) it.insumos = it.composicaoOrgaoGuardada.insumos;
          if (it.composicaoOrgaoGuardada.composicaoOrgao) it.composicaoOrgao = it.composicaoOrgaoGuardada.composicaoOrgao;
          delete it.composicaoOrgaoGuardada;
        }
        it.custoUnitario = r.custoOrg; it.custoMO = parc.mo; it.custoMAT = parc.mat; it.custoEQ = parc.eq;
        /* item sem preço do órgão (R$ 0,01 simbólico do CertamePRO) que a base não casou: não é "preço do órgão" */
        var simb = it.semPrecoReferencia === true && num(r.custoOrg) <= 0.01 + 1e-9;
        if (simb) { motivo = "o órgão não deu preço (R$ 0,01 simbólico)"; codMotivo = "simbolico"; resumo.sem_preco_do_orgao++; }
        /* só o que não está em it.orgao: o preço do órgão (custoOrgao) já mora lá */
        it.autoOrc = { via: "orgao", motivo: codMotivo || "orgao", custoAplicado: r.custoOrg, baixa: true };
        if (conf) it.autoOrc.confianca = conf;
        if (!it.orgao) it.autoOrc.custoOrgao = r.custoOrg;
        resumo.preco_do_orgao_mantido++;
        resumo.baixa_confianca.push({ numero: r.numero, codigo: r.cod, descricao: s(it.descricao), motivo: motivo, confianca: conf || 0 });
      };

      plano.forEach(function (Lx) {
        var r = refs[Lx.item._n];
        var it = r.it, decl = r.decl;
        var conf = Math.round(((Number(Lx.confianca) || 0) / 100) * 100) / 100;
        if (r.editado || r.semOrigem) { manter(r, "", 0); return; }
        if (self._fonteEhPropria(it)) {
          manter(r, "composição própria do órgão: não há base para refazer o preço; mantido o preço do órgão", 0, "propria"); return;
        }
        if (Lx.sem) {
          manter(r, (exigidas.length ? (textoFaltam(decl) || "nenhuma base exigida é aceita") : "o pacote não traz base de preço exigida (competência desconhecida)") + "; mantido o preço do órgão", 0, "sem-base"); return;
        }
        var aprov = false, porDesc = false, rejeicao = "";
        if (Lx.status === "casado" && ok(Lx.fonte) && conf >= lim.auto && num(Lx.custoUnitario) > 0) {
          if (r.cod) {
            if (decl) {
              if (Lx.via === "codigo" && nomeSemEstado(Lx.fonte) === nomeSemEstado(decl)) aprov = true;
              else rejeicao = "o código " + r.cod + " do órgão (" + decl + ") não existe na base " + decl + " exigida" + (Lx.via === "codigo-inferido" ? "; existe em " + Lx.fonte + ", mas é outra base e o preço não passa de uma base para outra" : "; a descrição lembra " + Lx.codigo + " (" + Math.round(conf * 100) + "%), mas o código do órgão não é trocado sem você");
            } else if (Lx.via === "codigo-inferido") {
              var onde = basesComCodigo(r.cod);
              var simD = Orq.similaridade(s(it.descricao), s(Lx.descricaoBase), it.unidade, Lx.unidadeBase, ctx2);
              if (onde.length === 1 && simD >= lim.auto) aprov = true;
              else rejeicao = onde.length > 1 ? "o código " + r.cod + " existe em mais de uma base exigida (" + onde.map(function (x) { return x.fonte; }).join(", ") + "), e o item não diz de qual é" : "o código " + r.cod + " existe em " + Lx.fonte + ", mas a descrição não confere (" + Math.round(simD * 100) + "%)";
            } else rejeicao = "o código " + r.cod + " do órgão não existe nas bases exigidas; a descrição lembra " + Lx.codigo + " (" + Math.round(conf * 100) + "%), mas o código do órgão não é trocado sem você";
          } else if (Lx.via === "descricao" || Lx.via === "descricao-exata") { aprov = true; porDesc = true; }
        }
        if (aprov) {
          var ex = porCat[Lx.fonte] || {};
          var cb = num(Lx.custoUnitario);
          var codigoAplicado = null;
          if (!r.cod) {
            it.codigo = s(Lx.codigo);
            it.baseFonte = Lx.fonte === "SINAPI" ? null : Lx.fonte;
            var OO = _dep("Orcamento");
            if (OO && OO._origemDe) it.origem = OO._origemDe(it.codigo, it.baseFonte);
            codigoAplicado = it.codigo;
          }
          it.custoUnitario = cb; it.custoMO = num(Lx.custoMO); it.custoMAT = num(Lx.custoMAT); it.custoEQ = num(Lx.custoEQ);
          /* ⚠ preço de base no lugar do do órgão: a composição do órgão (insumos) já não dá o custo do item (+0,5% gera 120 notas falsas; +5% bloqueia
             "O pacote não pode sair assim"). Ela sai do item e fica guardada, e `manter` a devolve quando o preço do órgão volta. */
          /* só quando o preço MUDA: base de preço igual ao do órgão (0 custos alterados) não pode trocar o analítico por "Sem detalhamento" */
          if ((it.insumos || it.composicaoOrgao) && r.custoOrg !== null && r.custoOrg !== undefined && Math.abs(cb - num(r.custoOrg)) > 0.005) {
            if (!it.composicaoOrgaoGuardada) it.composicaoOrgaoGuardada = { insumos: it.insumos, composicaoOrgao: it.composicaoOrgao };
            delete it.insumos; delete it.composicaoOrgao;
          }
          it.autoOrc = { via: Lx.via, confianca: conf, motivo: porDesc ? "por-descricao" : "codigo", fonte: Lx.fonte, competencia: s(ex.competencia),
            custoOrgao: r.custoOrg, custoBase: cb, custoAplicado: cb, codigoAplicado: codigoAplicado, baixa: porDesc };
          if (porDesc) {
            var md = "casado por descrição (" + Math.round(conf * 100) + "%) com " + Lx.fonte + " " + s(Lx.codigo) + " — conferir";
            resumo.por_descricao++;
            resumo.baixa_confianca.push({ numero: r.numero, codigo: s(Lx.codigo), descricao: s(it.descricao), motivo: md, confianca: conf });
          } else resumo.pela_base++;
          return;
        }
        /* não deu: preço do órgão, e o porquê */
        var motivo;
        if (rejeicao) motivo = rejeicao;
        else if (Lx.status === "casado" && !ok(Lx.fonte)) motivo = "casou na base " + Lx.fonte + ", que não é uma das bases exigidas aceitas";
        else if (Lx.status === "casado") motivo = "confiança " + Math.round(conf * 100) + "% abaixo do mínimo automático";
        else if (Lx.status === "revisar") motivo = "casamento incerto (" + Math.round(conf * 100) + "%): " + s(Lx.motivo) + ((Lx.avisos && Lx.avisos.length) ? " — " + Lx.avisos.join(" ") : "");
        else motivo = s(Lx.motivo) || "sem correspondência nas bases exigidas";
        var tf = textoFaltam(decl);
        if (tf) motivo += "; " + tf;
        manter(r, motivo + "; mantido o preço do órgão", Lx.status === "pendente" ? 0 : conf, rejeicao ? "rejeitado" : (Lx.status === "casado" ? "baixa-confianca" : (Lx.status === "revisar" ? "incerto" : "sem-correspondencia")));
      });
      resumo.itens = refs.length;
      return resumo;
    },

    /* ------------------------------------------------------------------
     * A MARCA da volta (contrato): config.licitacao.automatico
     * ------------------------------------------------------------------ */
    marcar: function (orc, resumo, presetId, info) {
      var L = _dep("Licitacao"), lic = L ? L.cfg(orc) : null;
      if (!lic || !resumo) return null;
      info = info || {};
      var bc = (resumo.baixa_confianca || []).map(function (b) {
        return { numero: s(b.numero), codigo: s(b.codigo), descricao: s(b.descricao), motivo: s(b.motivo), confianca: Number(b.confianca) || 0 };
      });
      lic.automatico = {
        orcamento_automatico: true,
        conferido_pelo_usuario: false,
        preset: s(presetId) || s(lic.preset),
        preset_deduzido: info.deduzido != null ? info.deduzido === true : lic.presetDeduzido === true,
        em: agora(),
        versao_orcapro: versaoApp(),
        resumo: { itens: resumo.itens | 0, pela_base: resumo.pela_base | 0, por_descricao: resumo.por_descricao | 0, preco_do_orgao_mantido: resumo.preco_do_orgao_mantido | 0 },
        baixa_confianca: bc
      };
      /* itens que o órgão não precificou (R$ 0,01 simbólico) e que ficaram assim: o automático SALVA e NÃO devolve */
      if ((resumo.sem_preco_do_orgao | 0) > 0) lic.automatico.sem_preco_do_orgao = resumo.sem_preco_do_orgao | 0;
      return lic.automatico;
    },
    marcarConferido: function (orc) {
      var L = _dep("Licitacao"), lic = L ? L.cfg(orc) : null;
      if (!lic || !lic.automatico) return false;
      lic.automatico.conferido_pelo_usuario = true;
      lic.automatico.conferido_em = agora();
      return true;
    },

    /* texto completo do motivo de um item (o item guarda só um código curto): vem da marca, pelo número */
    motivoDoItem: function (orc, it) {
      var a = this.automatico(orc), n = s(it && it.numeroOrigem), r = null;
      if (a && n) (a.baixa_confianca || []).forEach(function (b) { if (!r && s(b.numero) === n) r = b.motivo; });
      return r || s(it && it.autoOrc && it.autoOrc.motivo);
    },

    /* o bloco `certamepro` como o orçamento o guardou: serve ao escolherPreset
       depois da importação (o pacote em si já não está à mão). */
    blocoDe: function (orc) {
      var L = _dep("Licitacao"), lic = L ? L.cfg(orc) : null, b = {};
      if (!lic) return b;
      if (s(lic.presetPacote)) b.preset = s(lic.presetPacote);
      if (lic.obraInformada === true) b.obra_engenharia = lic.obra === true;
      if (s(lic.regimeExecucao)) b.regime_execucao = s(lic.regimeExecucao);
      if (s(lic.arredondamentoPacote)) b.arredondamento = s(lic.arredondamentoPacote);
      return b;
    },

    /* ---- perguntas da tela ---- */
    automatico: function (orc) {
      var L = _dep("Licitacao"), lic = L ? L.cfg(orc) : null;
      return (lic && lic.automatico && lic.automatico.orcamento_automatico === true) ? lic.automatico : null;
    },
    naoConferido: function (orc) { var a = this.automatico(orc); return !!(a && a.conferido_pelo_usuario !== true); },
    /* ids dos itens que o automático deixou com o preço do órgão (para destacar na planilha) */
    idsBaixaConfianca: function (orc) {
      var ids = [];
      (orc && orc.etapas || []).forEach(function (e) {
        ((e && e.itens) || []).forEach(function (it) { if (it && it.autoOrc && it.autoOrc.baixa === true && it.id != null) ids.push(it.id); });
      });
      return ids;
    },
    /* o pacote pede o automático? (campo opcional; ausente = fluxo manual de hoje) */
    pedeAutomatico: function (orc) {
      var L = _dep("Licitacao"), lic = L ? L.cfg(orc) : null;
      return !!(lic && lic.orcamentoAutomatico === true);
    }
  };

  global.LicitacaoAuto = LicitacaoAuto;
  if (typeof module !== "undefined" && module.exports) module.exports = LicitacaoAuto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
