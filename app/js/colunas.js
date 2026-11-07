/* =====================================================================
 * colunas.js — COLUNAS EXTRAS DA PLANILHA DO ORÇAMENTO
 *
 * Pedido do Rogério (07/11/2026), vale para TODO orçamento (não só licitação):
 *   · "Preço unit. c/ BDI" ao lado do custo unitário (sem BDI);
 *   · "Custo MO", "Custo MAT", "Custo EQ" da linha, com subtotal por etapa,
 *     por sub etapa e total geral;
 *   · em licitação, "Preço ref." do órgão e a diferença em % contra o nosso
 *     preço unitário (vermelho / verde / laranja).
 * Um menu "Colunas" liga e desliga cada grupo; a escolha fica NO ORÇAMENTO
 * (config.colunas, ver Orcamento.colunasPadrao) e a planilha, o relatório e o
 * laudo impressos obedecem a ela.
 *
 * Módulo PURO (sem DOM, sem rede): a tela (js/ui.js) e os documentos só
 * desenham o que sai daqui. ES5 de propósito (ver CLAUDE.md).
 *
 * ⚠ REGRAS QUE NÃO PODEM SER "SIMPLIFICADAS"
 *  1. O PREÇO C/ BDI É O DO MOTOR. Quando o BDI incide no unitário, é
 *     `linha.precoUnit` de Orcamento.calcular (mesmo arredondamento). Quando
 *     o BDI incide no preço final, o `precoUnit` da linha é de CUSTO e o
 *     unitário com BDI sai da mesma conta que a licitação usa
 *     (Licitacao._puComBdi) — nunca uma terceira fórmula.
 *  2. CUSTO MO/MAT/EQ NUNCA É RATEIO MÉDIO. Só aparece quando há a
 *     discriminação DO PRÓPRIO ITEM, nesta ordem: (a) as parcelas do item;
 *     (b) os insumos gravados no item que somam o custo dele; (c) a composição
 *     do CÓDIGO do item na base DELE (SINAPI pelo analítico da UF; IOPES, ORSE,
 *     SUDECAP… pelo analítico da base), aberta pelo MESMO resolvedor do
 *     "Analítico do item" e da aba Insumos & ABC (InsumosOrc.resolvedor) —
 *     nunca uma terceira regra; (d) item que É um insumo (lona, espelho): 100%
 *     da categoria do insumo na base. Em (c) as PROPORÇÕES MO/MAT/EQ da
 *     composição oficial são aplicadas ao custo do item (o preço do órgão pode
 *     diferir do da base): é a mesma conta de Orcamento.repartirParcelas quando
 *     o preço muda, e o tooltip diz de onde veio ("proporção da composição
 *     SINAPI 87878 (MG 06/2026)").
 *     A diferença para o rateio proibido: rateio "médio" usa uma proporção que
 *     não é a do item (média do orçamento, 40/55/5 de mercado). Aqui a
 *     proporção é a discriminação publicada para AQUELA composição — a mesma
 *     que o Excel (_quebraMoMatEq) já usa. Item sem composição na base (CPU/CCU
 *     própria do órgão sem analítico, cotação, SETOP — que não publica o
 *     analítico em arquivo aberto) continua "—", fica FORA dos subtotais, e o
 *     resumo diz quantos e POR QUÊ (Colunas.motivoSem).
 *     Roteiro do defeito (07/11/2026, orçamento de Muriaé importado do
 *     CertamePRO, 191 itens): a 1.2.256 só olhava (a) e (b); os itens do
 *     pacote chegam só com o preço do órgão, e a coluna inteira saiu "—" com o
 *     analítico SINAPI do item a um clique de distância.
 *  3. COMPARAR COM BDI × COM BDI. A referência do órgão com BDI contra o nosso
 *     unitário com BDI. Só havendo a referência SEM BDI, compara-se com o
 *     nosso custo unitário (sem BDI) e a célula diz "s/ BDI".
 *  4. VERMELHO É "ABAIXO DA REFERÊNCIA" (o preço pode ser inexequível ou
 *     indicar erro), VERDE É "IGUAL OU ATÉ O LIMITE ACIMA" (padrão 5%),
 *     LARANJA É "MUITO ACIMA" (em licitação, unitário acima da referência
 *     pode desclassificar a proposta).
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
  function U() { return _dep("Util"); }
  function O() { return _dep("Orcamento"); }
  function L_() { return _dep("Licitacao"); }
  function num(v) { var u = U(); return u ? u.num(v) : (Number(v) || 0); }
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  var GRUPOS = [
    { id: "pubdi", rotulo: "Preço unit. c/ BDI", ajuda: "Preço unitário COM BDI, ao lado do custo unitário (sem BDI), com o mesmo arredondamento e a mesma incidência do BDI do orçamento." },
    { id: "cat", rotulo: "Custo MO / MAT / EQ", ajuda: "Custo total da linha separado em mão de obra, material e equipamento, na proporção da composição do item na base dele (SINAPI, IOPES, ORSE, SUDECAP…) ou das parcelas do próprio item; a soma fecha com o Custo Total. Item sem composição na base fica com “—” e o resumo diz por quê." },
    { id: "ref", rotulo: "Preço ref. e diferença (licitação)", ajuda: "Preço de referência do órgão e a diferença para o nosso preço unitário com BDI." }
  ];

  var Colunas = {
    GRUPOS: GRUPOS,
    LIMITE_PADRAO: 5,
    DICA_DESCLASSIFICA: "Em licitação, preço unitário acima da referência pode desclassificar a proposta",

    /* config.colunas já normalizada (Orcamento.garantirConfig) */
    cfg: function (orc) {
      var O0 = O();
      if (O0 && O0.garantirConfig) return O0.garantirConfig(orc).colunas;
      return (orc && orc.config && orc.config.colunas) || { pubdi: null, cat: null, ref: null, limiteAcimaPct: 5 };
    },
    limite: function (orc) { var l = Number(this.cfg(orc).limiteAcimaPct); return isFinite(l) && l >= 0 ? l : this.LIMITE_PADRAO; },
    _licitacao: function (orc) { var L = L_(); return !!(L && L.ativo && L.ativo(orc)); },

    /* o grupo aparece? escolha explícita vence; sem escolha vale o padrão
       (licitação liga o preço c/ BDI e o de referência) */
    visivel: function (orc, grupo) {
      var v = this.cfg(orc)[grupo];
      if (v === true || v === false) return v;
      if (grupo === "pubdi" || grupo === "ref") return this._licitacao(orc);
      return false;
    },
    /* escolha explícita ou null (volta ao padrão) */
    definir: function (orc, grupo, valor) {
      if (["pubdi", "cat", "ref"].indexOf(grupo) < 0) return false;
      var c = this.cfg(orc);
      c[grupo] = (valor === true || valor === false) ? valor : null;
      return true;
    },
    definirLimite: function (orc, pct) {
      var n = Number(String(pct == null ? "" : pct).replace(",", "."));
      if (!isFinite(n) || n < 0 || n > 1000) return false;
      this.cfg(orc).limiteAcimaPct = n;
      return true;
    },
    /* o que a planilha desenha: quais grupos, quantas colunas antes/depois do
       "Custo Total" e o total de colunas (para colspan) */
    layout: function (orc) {
      var pub = this.visivel(orc, "pubdi"), cat = this.visivel(orc, "cat"), ref = this.visivel(orc, "ref");
      var pre = (pub ? 1 : 0) + (ref ? 2 : 0), pos = cat ? 3 : 0;
      return { pubdi: pub, cat: cat, ref: ref, nPre: pre, nPos: pos, total: 9 + pre + pos,
        algumaNova: pub || cat || ref };
    },

    /* ------------------------------------------------------------------
     * CUSTO MO / MAT / EQ de UM item (por unidade) — ou null
     * ------------------------------------------------------------------ */
    _catDe: function (i) {
      var c = String((i && (i.categoria || i.cat)) || "").toUpperCase();
      return (c === "MO" || c === "MAT" || c === "EQ") ? c : "";
    },
    categoriasItem: function (it, ctx) {
      if (!it) return null;
      var O0 = O(), self = this, r = null;
      var ativas = (O0 && O0.parcelasAtivas) ? O0.parcelasAtivas(it) : ["custoMO", "custoMAT", "custoEQ"];
      var mascara = function (v) {
        return { mo: ativas.indexOf("custoMO") >= 0 ? v.mo : 0, mat: ativas.indexOf("custoMAT") >= 0 ? v.mat : 0, eq: ativas.indexOf("custoEQ") >= 0 ? v.eq : 0 };
      };
      /* 1) parcelas do próprio item: a discriminação que o app mantém em dia
            (ajustes de preço reparcelam — Orcamento.repartirParcelas) */
      var pm = num(it.custoMO), pa = num(it.custoMAT), pe = num(it.custoEQ);
      if (pm + pa + pe > 0) { r = mascara({ mo: pm, mat: pa, eq: pe }); r.fonte = "item"; return r; }
      /* 2) insumos do analítico gravados no item (ex.: composição do órgão),
            SÓ se somarem o custo do item (até 1%): composição que não fecha com
            o preço digitado daria categoria errada */
      if (Array.isArray(it.insumos) && it.insumos.length) {
        var mo = 0, mat = 0, eq = 0, tot = 0;
        it.insumos.forEach(function (x) {
          if (!x || typeof x !== "object") return;
          var ct = num(x.coeficiente) * num(x.custoUnitario);
          tot += ct;
          if (String(x.tipo || "").toUpperCase() === "COMPOSICAO") return;
          var c = self._catDe(x);
          if (c === "MO") mo += ct; else if (c === "MAT") mat += ct; else if (c === "EQ") eq += ct;
        });
        var cu0 = num(it.custoUnitario);
        if (cu0 > 0 && (mo + mat + eq) > 0 && Math.abs(tot - cu0) <= Math.max(0.02, cu0 * 0.01) && Math.abs((mo + mat + eq) - cu0) <= Math.max(0.02, cu0 * 0.01)) {
          r = mascara({ mo: mo, mat: mat, eq: eq }); r.fonte = "insumos"; return r;
        }
      }
      /* 3) a composição do CÓDIGO do item na base dele (ver o ⚠ 2 do cabeçalho).
            `ctx` vem da tela (App._colunasCtx): sem ele (Node, documento sem
            app) o passo não existe e o item fica "—", como antes. */
      if (ctx) {
        var a = this._doAnalitico(it, ctx);
        if (a) {
          r = mascara(a);
          /* item "só MO" de composição sem mão de obra: a máscara zera tudo —
             isso não é discriminação, é ausência dela */
          if (!(r.mo + r.mat + r.eq > 0)) return null;
          r.fonte = a.fonte; r.origem = a.origem; return r;
        }
      }
      return null;
    },

    /* fonte do item na régua das telas de insumo (vazio/SINAPI_DES = SINAPI;
       PROPRIO = PROPRIA) — a MESMA função do resolvedor */
    fonteDoItem: function (it) {
      var IO = _dep("InsumosOrc");
      if (IO && IO.fonteDaLinha) return IO.fonteDaLinha({ item: it || {} });
      var f = String((it && (it.baseFonte || it.origem)) || "SINAPI").toUpperCase();
      return f === "PROPRIO" ? "PROPRIA" : f;
    },

    /* Razões MO/MAT/EQ de uma composição já resolvida (puro).
       Primeiro os totais que a base publica (o Analitico e o AnaliticoBases já
       descem nas sub-composições e os gravam em custoMO/MAT/EQ); sem eles, a
       soma dos insumos, abrindo cada sub-composição por `abrir` (o mesmo
       resolvedor) com guarda de ciclo. Sub que não abre entra pela categoria
       dela. Devolve null quando nada soma (não há discriminação). */
    proporcoes: function (comp, abrir, _trilha) {
      if (!comp) return null;
      var mo = num(comp.custoMO), mat = num(comp.custoMAT), eq = num(comp.custoEQ);
      if (mo + mat + eq > 0) return { mo: mo, mat: mat, eq: eq };
      var ins = Array.isArray(comp.insumos) ? comp.insumos : [];
      if (!ins.length) return null;
      var self = this, trilha = _trilha || {}, chave = String(comp.codigo || "");
      if (chave) { if (trilha[chave]) return null; trilha[chave] = 1; }
      mo = 0; mat = 0; eq = 0;
      ins.forEach(function (x) {
        if (!x || typeof x !== "object") return;
        var ct = (x.custoTotal != null && num(x.custoTotal) > 0) ? num(x.custoTotal) : num(x.coeficiente) * num(x.custoUnitario);
        if (!(ct > 0)) return;
        if (String(x.tipo || "").toUpperCase() === "COMPOSICAO" && typeof abrir === "function") {
          var sub = null;
          try { sub = abrir(x); } catch (e) { sub = null; }
          var rz = sub ? self.proporcoes(sub, abrir, trilha) : null;
          var t = rz ? rz.mo + rz.mat + rz.eq : 0;
          if (t > 0) { mo += ct * rz.mo / t; mat += ct * rz.mat / t; eq += ct * rz.eq / t; return; }
        }
        var c = self._catDe(x);
        if (c === "MO") mo += ct; else if (c === "EQ") eq += ct; else if (c === "MAT") mat += ct;
      });
      if (chave) delete trilha[chave];
      return (mo + mat + eq) > 0 ? { mo: mo, mat: mat, eq: eq } : null;
    },

    /* categoria de um INSUMO pelo rótulo da base ("MATERIAL", "MAO DE OBRA",
       "EQUIPAMENTO (LOCAÇÃO)", "MO"…). Rótulo que não é uma das três
       ("SERVIÇOS", "ESPECIAIS") devolve "" — o insumo de serviço traz mão de
       obra e material juntos, e chamá-lo de material seria inventar.
       ENCARGOS COMPLEMENTARES = MO, a mesma régua de InsumosOrc.categoria. */
    catInsumo: function (rot) {
      var s = String(rot == null ? "" : rot).toUpperCase().replace(/[ÃÁÂÀ]/g, "A").replace(/Ç/g, "C").replace(/\s+/g, " ").trim();
      if (s === "MO" || /^MAO DE OBRA/.test(s) || /^ENCARGO/.test(s)) return "MO";
      if (s === "MAT" || /^MATERIA/.test(s)) return "MAT";
      if (s === "EQ" || /^EQUIP/.test(s)) return "EQ";
      return "";
    },

    /* passo 3 + item-insumo: { mo, mat, eq, fonte, origem } ou null */
    _doAnalitico: function (it, ctx) {
      var cod = String(it.codigo == null ? "" : it.codigo).trim();
      if (!cod) return null;
      var F = this.fonteDoItem(it), comp = null;
      try { comp = ctx.composicao ? ctx.composicao(it) : null; } catch (e) { comp = null; }
      if (comp) {
        var p = this.proporcoes(comp, ctx.abrirSub ? function (x) { return ctx.abrirSub(x, F); } : null);
        if (p) {
          var og = (ctx.origem ? ctx.origem(F, it) : null) || {};
          return { mo: p.mo, mat: p.mat, eq: p.eq, fonte: "analitico",
            origem: { base: F, codigo: cod, uf: og.uf || "", comp: og.comp || "", regime: og.regime || "", daSintetico: !!comp.daSintetico, compOrc: og.compOrc || "" } };
        }
      }
      var ins = null;
      try { ins = ctx.insumo ? ctx.insumo(it) : null; } catch (e2) { ins = null; }
      var c = ins ? this.catInsumo(ins.categoria) : "";
      if (c) {
        var og2 = (ctx.origem ? ctx.origem(F, it) : null) || {};
        return { mo: c === "MO" ? 1 : 0, mat: c === "MAT" ? 1 : 0, eq: c === "EQ" ? 1 : 0, fonte: "insumo",
          origem: { base: F, codigo: cod, uf: og2.uf || "", comp: og2.comp || "", insumo: c } };
      }
      return null;
    },

    /* texto do tooltip da célula separada */
    textoOrigem: function (lin) {
      if (!lin || !lin.tem) return "";
      if (lin.fonte === "item") return "Parcelas MO/MAT/EQ do próprio item.";
      if (lin.fonte === "insumos") return "Insumos gravados no próprio item (somam o custo dele).";
      var o = lin.origem || {};
      var onde = [o.uf, o.comp].filter(Boolean).join(" ") + (o.regime ? ", " + o.regime : "");
      if (lin.fonte === "insumo") {
        var nome = o.insumo === "MO" ? "mão de obra" : (o.insumo === "EQ" ? "equipamento" : "material");
        return "O item é o insumo " + o.base + " " + o.codigo + ": 100% " + nome + (onde ? " (" + onde + ")" : "") + ".";
      }
      if (lin.fonte === "analitico") {
        var t = (o.daSintetico ? "Proporção MO/MAT/EQ que o sintético da " + o.base + " traz para a composição " + o.codigo
          : "Proporção da composição " + o.base + " " + o.codigo) + (onde ? " (" + onde + ")" : "") +
          ", aplicada ao custo do item.";
        if (o.compOrc && o.comp && o.compOrc !== o.comp) t += " O orçamento é de " + o.compOrc + ".";
        return t;
      }
      return "";
    },

    /* POR QUE o item ficou sem separação — { chave, texto }.
       chaves: "sem-codigo" · "propria" (composição própria do órgão ou da
       empresa sem insumos; cotação) · "sem-analitico" (a base não publica o
       analítico) · "nao-carregada" (o analítico existe e ainda não chegou,
       ou falhou) · "nao-encontrado" (código fora do analítico daquela
       competência) · "sem-discriminacao" (insumo de serviço). */
    MOTIVOS: {
      "sem-codigo": "item sem código",
      "propria": "composição própria (do órgão ou sua) ou cotação, sem analítico",
      "sem-analitico": "o órgão não publica o analítico em arquivo aberto",
      "nao-suporta": "base sem analítico no OrçaPRO",
      "nao-carregada": "analítico da base não carregado",
      "parcela-ausente": "a composição não tem a parcela que o item fatura (só MO / só MAT+EQ)",
      "nao-encontrado": "código não encontrado no analítico da competência",
      "sem-discriminacao": "insumo de serviço, sem discriminação MO/MAT/EQ"
    },
    motivoSem: function (it, ctx) {
      var cod = String((it && it.codigo) == null ? "" : it.codigo).trim();
      var M = function (k, t) { return { chave: k, texto: t }; };
      if (!cod) return M("sem-codigo", "Item sem código: não há composição para separar.");
      var F = this.fonteDoItem(it);
      var bf = String((it && it.baseFonte) || "").trim();
      /* composição achada, mas a máscara do modo de custo zerou tudo: o
         motivo é a parcela, não "código não encontrado" */
      if (ctx && this._doAnalitico(it, ctx)) return M("parcela-ausente", "A composição " + F + " " + cod + " não tem a parcela que este item fatura (" + (it.modoCusto === "mo" ? "só mão de obra" : "só material + equipamento") + ").");
      /* CPU/CCU/cotação do órgão chegam com a origem da base do edital às
         vezes: o código diz o que é */
      var ehProp = F === "PROPRIA" || /^PROP-/i.test(cod) || /^(CPU|CCU|COT)/i.test(cod) || /COTA|^CCU|^CPU/i.test(bf);
      if (ehProp) {
        if (/COTA/i.test(bf) || /^COT/i.test(cod)) return M("propria", "Cotação de mercado (" + (bf || cod) + "): preço fechado, sem composição.");
        return M("propria", "Composição própria" + (bf ? " " + bf : "") + " sem insumos na base própria — o item traz só o preço.");
      }
      var est = (ctx && ctx.estado) ? ctx.estado(F, it) : "sem-ctx";
      var og = (ctx && ctx.origem) ? (ctx.origem(F, it) || {}) : {};
      var onde = [og.uf, og.comp].filter(Boolean).join(" ");
      switch (est) {
        case "carregado":
          var ins = null;
          try { ins = ctx.insumo ? ctx.insumo(it) : null; } catch (e) { ins = null; }
          if (ins) return M("sem-discriminacao", "Insumo " + F + " " + cod + " da categoria “" + String(ins.categoria || "?") + "”: não separa em MO/MAT/EQ.");
          return M("nao-encontrado", "Código " + cod + " não está no analítico " + F + (onde ? " " + onde : "") + ".");
        case "carregando": return M("nao-carregada", "Carregando o analítico " + F + "…");
        case "pendente": return M("nao-carregada", "Analítico " + F + " ainda não carregado.");
        case "outra-uf": return M("nao-carregada", "O analítico " + F + " carregado é de outro estado; abra o orçamento de novo.");
        case "outro-regime-des": return M("nao-carregada", "Item desonerado e o analítico " + F + " carregado é o não desonerado: a proporção de MO seria a do outro regime.");
        case "outro-regime-one": return M("nao-carregada", "Item não desonerado e o analítico " + F + " carregado é o desonerado: a proporção de MO seria a do outro regime.");
        case "sem-arquivo": return M("nao-carregada", "Não há arquivo do analítico " + F + " para esta UF nesta instalação (orçamento sem UF, ou sem servidor).");
        case "falhou": return M("nao-carregada", "Não consegui baixar o analítico " + F + " — confira a internet; o sistema tenta de novo ao redesenhar, em 1 minuto.");
        case "sem-publicacao": return M("sem-analitico", "A " + F + " não publica o analítico em arquivo aberto.");
        case "sem-ctx": return M("nao-carregada", "Analítico não consultado neste documento.");
      }
      return M("nao-suporta", "A base " + F + " não tem analítico no OrçaPRO.");
    },

    /* Totais por linha, etapa, sub etapa e geral. `calc` é o Orcamento.calcular
       que a tela já tem (evita recalcular). Etapa opcional ENTRA, como entra no
       total da planilha. `ctx` (opcional, App._colunasCtx) liga o passo 3.
       `cobertura` diz quantos itens separaram, por base, e a lista dos que
       não separaram com o motivo — a tela mostra "X de Y" e "ver quais". */
    categorias: function (orc, calc, ctx) {
      var self = this;
      calc = calc || O().calcular(orc);
      var out = { porLinha: {}, porEtapa: [], porSub: {}, total: this._zero(),
        cobertura: { n: 0, sep: 0, sem: 0, porBase: {}, porMotivo: {}, carregando: [], semLista: [] } };
      var cob = out.cobertura, vistoCar = {};
      (calc.linhas || []).forEach(function (L) {
        var it = L.item || {};
        var c = self.categoriasItem(it, ctx);
        var lin = c ? self._linhaNoCusto(c, num(L.custoTotal)) : { tem: false, mo: 0, mat: 0, eq: 0 };
        var F = self.fonteDoItem(it);
        var pb = cob.porBase[F] || (cob.porBase[F] = { n: 0, sep: 0 });
        cob.n++; pb.n++;
        if (lin.tem) { cob.sep++; pb.sep++; }
        else {
          var m = self.motivoSem(it, ctx);
          lin.motivo = m.texto; lin.motivoChave = m.chave;
          cob.sem++;
          cob.porMotivo[m.chave] = (cob.porMotivo[m.chave] || 0) + 1;
          if (m.chave === "nao-carregada" && ctx && ctx.estado && ctx.estado(F, it) === "carregando" && !vistoCar[F]) { vistoCar[F] = 1; cob.carregando.push(F); }
          cob.semLista.push({ itemId: L.itemId, numero: L.numero || "", codigo: String(it.codigo == null ? "" : it.codigo), base: F,
            baseFonte: String(it.baseFonte || ""), descricao: String(it.descricao || ""), custoTotal: r2(L.custoTotal), motivo: m.texto, chave: m.chave });
        }
        out.porLinha[L.itemId] = lin;
        var e = out.porEtapa[L.etapaIdx] || (out.porEtapa[L.etapaIdx] = self._zero());
        var alvos = [e, out.total];
        if (L.subEtapaId) alvos.push(out.porSub[L.subEtapaId] || (out.porSub[L.subEtapaId] = self._zero()));
        alvos.forEach(function (a) {
          a.n++;
          if (lin.tem) { a.mo += lin.mo; a.mat += lin.mat; a.eq += lin.eq; a.comAna++; } else a.sem++;
        });
      });
      var fecha = function (a) { a.mo = r2(a.mo); a.mat = r2(a.mat); a.eq = r2(a.eq); };
      out.porEtapa.forEach(function (a) { if (a) fecha(a); });
      Object.keys(out.porSub).forEach(function (k) { fecha(out.porSub[k]); });
      fecha(out.total);
      return out;
    },
    /* "61 de 191 itens separados · 130 sem separação" */
    textoCobertura: function (cob) {
      if (!cob || !cob.n) return "";
      var t = cob.sep + " de " + cob.n + " ite" + (cob.n === 1 ? "m" : "ns") + " separado" + (cob.sep === 1 ? "" : "s");
      if (cob.sem) t += " · " + cob.sem + " sem separação";
      return t;
    },
    /* "124 a base não publica o analítico; 6 composição própria…" */
    textoMotivos: function (cob) {
      var self = this;
      if (!cob || !cob.sem) return "";
      return Object.keys(cob.porMotivo).sort(function (a, b) { return cob.porMotivo[b] - cob.porMotivo[a]; }).map(function (k) {
        return cob.porMotivo[k] + " " + (self.MOTIVOS[k] || k);
      }).join("; ");
    },
    _zero: function () { return { mo: 0, mat: 0, eq: 0, n: 0, comAna: 0, sem: 0 }; },

    /* ⚠ MO + MAT + EQ DA LINHA FECHA COM O "CUSTO TOTAL" DA MESMA LINHA.
       A discriminação do item (parcelas ou insumos) dá a PROPORÇÃO; o valor é
       o custo total que a planilha imprime ao lado (Orcamento.calcular, já no
       arredondamento do orçamento). É a mesma conta do Excel, do laudo e do
       pacote da licitação (Orcamento.repartirCusto). Roteiro do defeito que
       isto impede (revisão de 07/11/2026): trocar o coeficiente de um insumo
       (app.js, ajuste de coeficiente) ou restaurar o preço da base muda o
       custoUnitario SEM reparcelar; com "quantidade × parcela" a coluna dava
       MO+MAT+EQ diferente do Custo Total da linha e diferente do Excel do
       mesmo orçamento. Não é rateio inventado: item sem discriminação continua
       "—". O resíduo de centavo vai para a maior parcela, para fechar exato. */
    _linhaNoCusto: function (c, ct) {
      var soma = num(c.mo) + num(c.mat) + num(c.eq);
      var lin = { tem: true, mo: 0, mat: 0, eq: 0, fonte: c.fonte, origem: c.origem || null };
      if (!(soma > 0) || !(ct > 0)) return lin;
      lin.mo = r2(ct * num(c.mo) / soma); lin.mat = r2(ct * num(c.mat) / soma); lin.eq = r2(ct * num(c.eq) / soma);
      var resto = r2(r2(ct) - (lin.mo + lin.mat + lin.eq));
      if (Math.abs(resto) >= 0.005) {
        var maior = "mo";
        ["mat", "eq"].forEach(function (k) { if (lin[k] > lin[maior]) maior = k; });
        lin[maior] = r2(lin[maior] + resto);
      }
      return lin;
    },

    /* ------------------------------------------------------------------
     * PREÇO UNITÁRIO C/ BDI da linha (a conta do motor)
     * ------------------------------------------------------------------ */
    precoUnitComBdi: function (orc, L) {
      var cfg = O().garantirConfig(orc);
      if (cfg.bdiIncidencia !== "final") return num(L.precoUnit);
      var Lic = L_();
      if (Lic && Lic._puComBdi) return Lic._puComBdi(orc, L);
      var pct = orc && orc.bdi ? num(orc.bdi.percentual) : 0;
      return r2(num(L.custoUnitario) * (1 + pct / 100));
    },

    /* ------------------------------------------------------------------
     * REFERÊNCIA DO ÓRGÃO × NOSSO PREÇO
     * { ref, tipo:"comBdi"|"semBdi", nosso, difPct, faixa:"abaixo"|"proximo"|"acima",
     *   texto:"+4,2%", origem, bdiAssumido } ou null (item sem referência)
     * ------------------------------------------------------------------ */
    referencia: function (orc, L) {
      var Lic = L_();
      if (!Lic || !L || !L.item) return null;
      var ref = Lic.refDoItem(orc, L.item);
      if (!ref) return null;
      var comBdi = num(ref.comBdi) > 0 && !ref.soSemBdi, valor, nosso, tipo;
      if (comBdi) { valor = num(ref.comBdi); nosso = this.precoUnitComBdi(orc, L); tipo = "comBdi"; }
      else if (num(ref.semBdi) > 0) { valor = num(ref.semBdi); nosso = num(L.custoUnitario); tipo = "semBdi"; }
      else return null;
      var dif = valor > 0 ? (nosso / valor - 1) * 100 : 0;
      var lim = this.limite(orc), faixa;
      if (nosso < valor - 0.005) faixa = "abaixo";
      else if (dif <= lim + 1e-9) faixa = "proximo";
      else faixa = "acima";
      return { ref: valor, tipo: tipo, nosso: nosso, difPct: dif, faixa: faixa, texto: this.textoDif(dif),
        origem: ref.origem || ref.fonte || "", bdiAssumido: !!ref.bdiAssumido, doOrgao: !!ref.doOrgao };
    },
    /* "−3,2%" / "+4,2%" (sinal de menos de verdade; a vírgula é a do Brasil) */
    textoDif: function (dif) {
      var a = Math.abs(Math.round(dif * 10) / 10);
      var t = a.toFixed(1).replace(".", ",");
      return (dif < 0 ? "−" : "+") + t + "%";
    },
    /* o orçamento tem alguma referência para mostrar? (o menu só oferece o grupo se sim) */
    temReferencia: function (orc, calc) {
      var self = this;
      calc = calc || O().calcular(orc);
      return (calc.linhas || []).some(function (L) { return !!self.referencia(orc, L); });
    },
    /* mapa itemId → referência, uma passada só (a tela chama uma vez por desenho) */
    mapaReferencias: function (orc, calc) {
      var self = this, m = {};
      calc = calc || O().calcular(orc);
      (calc.linhas || []).forEach(function (L) { var r = self.referencia(orc, L); if (r) m[L.itemId] = r; });
      return m;
    }
  };

  global.Colunas = Colunas;
  if (typeof module !== "undefined" && module.exports) module.exports = Colunas;
})(typeof window !== "undefined" ? window : this);
