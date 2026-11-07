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
 *  2. CUSTO MO/MAT/EQ NUNCA É RATEIO. Só aparece quando o item traz a
 *     discriminação dele (parcelas do próprio item, ou os insumos do analítico
 *     que somam o custo do item). Item sem isso mostra "—" e fica FORA dos
 *     subtotais, que dizem quantos itens ficaram de fora. Dividir o custo por
 *     proporção "média" seria inventar dado.
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
    { id: "cat", rotulo: "Custo MO / MAT / EQ", ajuda: "Custo total da linha separado em mão de obra, material e equipamento, na proporção do analítico do item (a soma fecha com o Custo Total). Item sem analítico fica com “—”." },
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
    categoriasItem: function (it) {
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
      return null;
    },

    /* Totais por linha, etapa, sub etapa e geral. `calc` é o Orcamento.calcular
       que a tela já tem (evita recalcular). Etapa opcional ENTRA, como entra no
       total da planilha. */
    categorias: function (orc, calc) {
      var self = this;
      calc = calc || O().calcular(orc);
      var out = { porLinha: {}, porEtapa: [], porSub: {}, total: this._zero() };
      (calc.linhas || []).forEach(function (L) {
        var c = self.categoriasItem(L.item);
        var lin = c ? self._linhaNoCusto(c, num(L.custoTotal)) : { tem: false, mo: 0, mat: 0, eq: 0 };
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
      var lin = { tem: true, mo: 0, mat: 0, eq: 0, fonte: c.fonte };
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
