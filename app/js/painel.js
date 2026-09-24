/* =====================================================================
 * painel.js — O MOTOR DO PAINEL DE GESTÃO NOVO (a tela só desenha).
 *
 * Motor PURO: não lê o DOM, não lê o Store, não chama `new Date()`. Recebe
 * listas já recortadas por obra, as regras de dinheiro que o resto do app
 * usa (FinStatus, a régua de avanço) e a data de hoje, e devolve o MODELO
 * da tela: caixa, fila de decisões em grupos, obras, categorias, contadores,
 * metas, previsão de caixa de 30 dias e a agenda da semana.
 * Roda em Node (tools/test-painel-dados.js).
 *
 * POR QUE ESTE ARQUIVO EXISTE (24/09/2026)
 * O Painel antigo (`renderDashboard`) calcula dentro do HTML: a fórmula de
 * prazo está copiada três vezes com guardas diferentes, e foi assim que uma
 * obra CONCLUÍDA saiu "386% × 0% · vencido há 146d" em vermelho na tabela
 * enquanto o cartão de cima a cortava. Margem dava 100% em obra sem custo
 * pago; custo/m² imprimia "R$ 0,00/m²"; prazo saía "300%" e "8510 dias".
 * Aqui cada uma dessas perguntas tem UMA resposta, testada.
 *
 * ⚠ REGIME ESCRITO EM CADA NÚMERO. `caixa` é o que ENTROU e SAIU (pago /
 *   recebido) no período; `obras[].recebido/custoPago` é caixa ACUMULADO
 *   da obra; `contratos` não tem período; `previsao30` é PREVISÃO (o que
 *   está em aberto com vencimento), nunca caixa. Quem desenha diz isso.
 * ⚠ NADA AQUI LANÇA DINHEIRO nem liga documento por semelhança. O motor só
 *   soma o que já está carimbado e aponta o que falta (Reconciliacao, Atencao
 *   e Avisos continuam donos das regras deles: os achados chegam prontos).
 * ⚠ NÃO É A SÉTIMA RÉGUA DE AVANÇO: `regras.avancoMedido` é a
 *   `Gestao._avancoMedido` de sempre (fonte única — PLANO-MESA §2).
 * ⚠ ADIAR NÃO APAGA: um ponto adiado sai da fila por N dias e VOLTA sozinho
 *   quando vence; enquanto isso fica listado em "adiados". Dinheiro que some
 *   para sempre é a mentira que este painel existe para não contar.
 * ===================================================================== */
(function (global) {
  "use strict";

  var DIA = 86400000;
  var CHAVE = "orcapro:tela:painel:v1";
  var DIAS_SUSPEITO = 1825;      /* término a mais de 5 anos = data digitada errada */
  var DEFASAGEM_PONTOS = 20;     /* folga da curva S antes de virar defasagem */
  var DIAS_ADIAR = 7;
  var PERIODOS = { mes: 1, "6m": 1, ano: 1, tudo: 1 };
  var STATUS = { andamento: 1, planejamento: 1, pausada: 1, concluida: 1 };
  /* os blocos da tela, na ordem padrão. `col` = onde mora: "esq" (coluna dos
     gráficos) ou "cheia" (largura inteira, depois da grade). A fila de
     decisões não está aqui: ela é a coluna da direita e não se esconde. */
  var BLOCOS = [
    { id: "tiles", nome: "Caixa (recebido, pago, resultado, saldo a faturar)", col: "esq" },
    { id: "posicao", nome: "Posição de hoje (a receber, a pagar)", col: "esq" },
    { id: "agenda", nome: "Agenda da semana", col: "esq" },
    { id: "previsao", nome: "Previsão de caixa, 30 dias", col: "esq" },
    { id: "fluxo", nome: "Fluxo de caixa por mês", col: "esq" },
    { id: "composicao", nome: "Despesas por categoria e custo por obra", col: "esq" },
    { id: "lucro", nome: "Lucratividade por mês", col: "esq" },
    { id: "metas", nome: "Metas (medidores)", col: "esq" },
    { id: "obras", nome: "Obras", col: "cheia" },
    { id: "orcado", nome: "Orçado × gasto", col: "cheia" },
    { id: "operacao", nome: "Operação (contadores)", col: "cheia" }
  ];
  var GRUPOS = [
    { id: "dinheiro", nome: "Dinheiro parado", aberto: true },
    { id: "prazo", nome: "Prazo", aberto: true },
    { id: "cadastro", nome: "Arrumar cadastro", aberto: false },
    { id: "canteiro", nome: "Canteiro e equipe", aberto: false },
    { id: "compras", nome: "Compras", aberto: false },
    { id: "outros", nome: "Outros", aberto: false }
  ];

  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === "") return 0;
    var s = String(v).replace(/\./g, "").replace(",", ".");
    var x = parseFloat(s);
    if (!isFinite(x)) { x = parseFloat(String(v)); }
    return isFinite(x) ? x : 0;
  }
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function ehObj(v) { return !!v && typeof v === "object" && Object.prototype.toString.call(v) !== "[object Array]"; }
  function ehArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function ehISO(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s); }
  function data(s) {
    if (!ehISO(s)) return null;
    var d = new Date(String(s).slice(0, 10) + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  function chaveMes(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
  function iso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function somaDias(hojeISO, n) { var d = data(hojeISO); d.setDate(d.getDate() + n); return iso(d); }
  function diasEntre(aISO, bISO) { var a = data(aISO), b = data(bISO); return (a && b) ? Math.round((b - a) / DIA) : null; }

  var PainelDados = {
    CHAVE: CHAVE,
    DIAS_SUSPEITO: DIAS_SUSPEITO,
    DEFASAGEM_PONTOS: DEFASAGEM_PONTOS,
    DIAS_ADIAR: DIAS_ADIAR,
    BLOCOS: BLOCOS,
    GRUPOS: GRUPOS,

    /* ------------------------------------------------------------------
     * A CHAVE "PAINEL NOVO" — por pessoa e aparelho, como `paineis.js`.
     * Mora numa chave própria do localStorage: NÃO entra no Store, nas
     * prefs (que viajam pela Nuvem), no backup. Ligada por `?painel=novo`,
     * desligada por `?painel=antigo` ou pelo botão dentro do Painel novo.
     * O registro da pessoa guarda também os FILTROS (obra, período, somar,
     * status, comparar), a ORDEM E VISIBILIDADE dos blocos e os pontos
     * ADIADOS — estado de tela, nunca dado de orçamento; F5 não zera.
     * Forma: { v:1, u:{ <hash>: { novo, obra, per, multi, status, comparar,
     *                              blocos:[{id,on}], adiados:{chave:"AAAA-MM-DD"} } } }.
     * O valor antigo (string "novo") continua sendo lido.
     * ------------------------------------------------------------------ */
    hashUsuario: function (empresaId, email) {
      var s = String(empresaId == null ? "" : empresaId) + "|" + String(email == null ? "" : email).replace(/^\s+|\s+$/g, "").toLowerCase();
      var h = 5381, i;
      for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return "u" + (h >>> 0).toString(16);
    },
    _hashOk: function (hash) { return typeof hash === "string" && /^u[0-9a-f]{1,8}$/.test(hash); },
    _lerTudo: function (storage) {
      var raw = null, j = null;
      try { raw = storage && typeof storage.getItem === "function" ? storage.getItem(CHAVE) : null; } catch (e) { return null; }
      if (raw == null || raw === "") return null;
      try { j = JSON.parse(raw); } catch (e2) { return null; }
      if (!ehObj(j) || j.v !== 1 || !ehObj(j.u)) return null;
      return j;
    },
    _regDe: function (t, hash) {
      if (!t || !own(t.u, hash)) return null;
      var v = t.u[hash];
      if (v === "novo") return { novo: true };
      return ehObj(v) ? v : null;
    },
    _gravarTudo: function (storage, t) {
      try { storage.setItem(CHAVE, JSON.stringify(t)); return true; } catch (e) { return false; }
    },
    ligado: function (storage, hash) {
      if (!this._hashOk(hash)) return false;
      var r = this._regDe(this._lerTudo(storage), hash);
      return !!(r && r.novo === true);
    },
    gravar: function (storage, hash, valor) {
      if (!this._hashOk(hash)) return false;
      var t = this._lerTudo(storage) || { v: 1, u: {} };
      var r = this._regDe(t, hash) || {};
      if (valor === "novo") r.novo = true; else delete r.novo;
      if (Object.keys(r).length) t.u[hash] = r; else delete t.u[hash];
      return this._gravarTudo(storage, t);
    },
    _blocosLimpos: function (v) {
      if (!ehArr(v)) return null;
      var vistos = {}, out = [];
      v.forEach(function (b) {
        if (!ehObj(b) || typeof b.id !== "string" || vistos[b.id]) return;
        if (!BLOCOS.some(function (d) { return d.id === b.id; })) return;
        vistos[b.id] = 1; out.push({ id: b.id, on: b.on !== false });
      });
      return out.length ? out : null;
    },
    _adiadosLimpos: function (v, hojeISO) {
      if (!ehObj(v)) return {};
      var out = {};
      for (var k in v) {
        if (!own(v, k) || typeof k !== "string" || k.length > 160) continue;
        var ate = v[k];
        if (!ehISO(ate)) continue;
        if (hojeISO && String(ate).slice(0, 10) < hojeISO) continue;   /* venceu: volta para a fila */
        out[k] = String(ate).slice(0, 10);
      }
      return out;
    },
    _prefsLimpas: function (f, hojeISO) {
      var out = { obra: null, per: null, multi: false, status: "", comparar: false, blocos: null, adiados: {} };
      if (!ehObj(f)) return out;
      if (typeof f.obra === "string" && f.obra) out.obra = f.obra;
      else if (ehArr(f.obra)) {
        var ids = f.obra.filter(function (x) { return typeof x === "string" && x; }).slice(0, 50);
        if (ids.length) out.obra = ids.length === 1 ? ids[0] : ids;
      }
      if (typeof f.per === "string" && own(PERIODOS, f.per)) out.per = f.per;
      out.multi = f.multi === true;
      if (typeof f.status === "string" && own(STATUS, f.status)) out.status = f.status;
      out.comparar = f.comparar === true;
      out.blocos = this._blocosLimpos(f.blocos);
      out.adiados = this._adiadosLimpos(f.adiados, hojeISO);
      return out;
    },
    lerPrefs: function (storage, hash, hojeISO) {
      if (!this._hashOk(hash)) return this._prefsLimpas(null, hojeISO);
      return this._prefsLimpas(this._regDe(this._lerTudo(storage), hash), hojeISO);
    },
    /* grava só as chaves presentes em `parcial`; as outras ficam como estão */
    gravarPrefs: function (storage, hash, parcial) {
      if (!this._hashOk(hash)) return false;
      var t = this._lerTudo(storage) || { v: 1, u: {} };
      var r = this._regDe(t, hash) || {};
      var p = parcial || {};
      if (own(p, "obra")) { var l = this._prefsLimpas({ obra: p.obra }); if (l.obra !== null) r.obra = l.obra; else delete r.obra; }
      if (own(p, "per")) { if (typeof p.per === "string" && own(PERIODOS, p.per)) r.per = p.per; else delete r.per; }
      if (own(p, "multi")) { if (p.multi === true) r.multi = true; else delete r.multi; }
      if (own(p, "status")) { if (typeof p.status === "string" && own(STATUS, p.status)) r.status = p.status; else delete r.status; }
      if (own(p, "comparar")) { if (p.comparar === true) r.comparar = true; else delete r.comparar; }
      if (own(p, "blocos")) { var b = this._blocosLimpos(p.blocos); if (b) r.blocos = b; else delete r.blocos; }
      if (own(p, "adiados")) { var a = this._adiadosLimpos(p.adiados, null); if (Object.keys(a).length) r.adiados = a; else delete r.adiados; }
      t.u[hash] = r;
      return this._gravarTudo(storage, t);
    },
    /* atalhos dos filtros (mantidos: as suítes e a fiação da 1ª leva os usam) */
    lerFiltros: function (storage, hash) { return this.lerPrefs(storage, hash, null); },
    gravarFiltros: function (storage, hash, f) {
      f = f || {};
      return this.gravarPrefs(storage, hash, { obra: f.obra, per: f.per, multi: f.multi, status: f.status, comparar: f.comparar });
    },
    /* a lista de blocos na ordem da pessoa: os que ela ordenou primeiro, os
       novos (de versão mais recente) no fim, ligados */
    blocosOrdenados: function (prefs) {
      var salvos = (prefs && prefs.blocos) || [], out = [], vistos = {};
      salvos.forEach(function (b) { var d = BLOCOS.filter(function (x) { return x.id === b.id; })[0]; if (d) { vistos[b.id] = 1; out.push({ id: d.id, nome: d.nome, col: d.col, on: b.on !== false }); } });
      BLOCOS.forEach(function (d) { if (!vistos[d.id]) out.push({ id: d.id, nome: d.nome, col: d.col, on: true }); });
      return out;
    },
    moverBloco: function (blocos, id, dir) {
      var i = -1;
      blocos.forEach(function (b, k) { if (b.id === id) i = k; });
      if (i < 0) return blocos;
      var j = dir < 0 ? i - 1 : i + 1;
      if (j < 0 || j >= blocos.length) return blocos;
      /* só troca dentro da mesma coluna: mover um bloco de largura inteira
         para o meio dos gráficos não tem onde cair */
      if (blocos[i].col !== blocos[j].col) return blocos;
      var out = blocos.slice(); var t = out[i]; out[i] = out[j]; out[j] = t;
      return out;
    },
    /* "novo" | "antigo" | null a partir de `location.search` */
    lerParametroUrl: function (search) {
      var m = /[?&]painel=(novo|antigo)(?:&|$)/.exec(String(search || ""));
      return m ? m[1] : null;
    },
    tirarParametroUrl: function (search) {
      var s = String(search || "").replace(/^\?/, "").split("&").filter(function (p) { return p && !/^painel=/.test(p); }).join("&");
      return s ? "?" + s : "";
    },
    /* a chave de um ponto da fila: estável entre renders, curta, sem dado
       sensível além do que a própria tela já mostra */
    chaveDecisao: function (x) {
      var base = [x.codigo || "", x.obraId || "", x.docId || "", (x.titulo || "").slice(0, 60)].join("|");
      var h = 5381, i;
      for (i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0;
      return (x.codigo || "x") + "-" + (h >>> 0).toString(16);
    },

    /* ------------------------------------------------------------------
     * PRAZO — a única fórmula. `hojeISO` vem de fora (testável).
     * ------------------------------------------------------------------ */
    prazo: function (obra, hojeISO) {
      var out = { temDatas: false, entregue: false, prazoPct: null, prazoTexto: "—", dias: null, vencido: false, terminoSuspeito: false };
      if (!obra) return out;
      if (obra.status === "concluida") { out.entregue = true; return out; }
      var ini = data(obra.inicio), fim = data(obra.termino || obra.previsaoFim), hoje = data(hojeISO);
      if (!ini || !fim || !hoje) return out;
      var total = (fim - ini) / DIA;
      if (!(total > 0)) return out;
      var pct = Math.max(0, Math.round(((hoje - ini) / DIA) / total * 100));
      out.temDatas = true;
      out.prazoPct = pct;
      out.prazoTexto = pct > 100 ? "100%+" : pct + "%";
      out.dias = Math.ceil((fim - hoje) / DIA);
      out.vencido = out.dias < 0;
      out.terminoSuspeito = out.dias > DIAS_SUSPEITO;
      return out;
    },

    /* ------------------------------------------------------------------
     * JANELA DO PERÍODO e a janela ANTERIOR (para a variação e a comparação).
     * ------------------------------------------------------------------ */
    janela: function (periodo, hojeISO) {
      var hoje = data(hojeISO);
      var a = hoje.getFullYear(), m = hoje.getMonth();
      var ini = null, iniAnt = null, fimAnt = null, meses = null;
      if (periodo === "mes") { ini = new Date(a, m, 1); iniAnt = new Date(a, m - 1, 1); fimAnt = new Date(a, m, 0); meses = 1; }
      else if (periodo === "6m") { ini = new Date(a, m - 5, 1); iniAnt = new Date(a, m - 11, 1); fimAnt = new Date(a, m - 5, 0); meses = 6; }
      else if (periodo === "ano") { ini = new Date(a, 0, 1); iniAnt = new Date(a - 1, 0, 1); fimAnt = new Date(a - 1, 11, 31); meses = m + 1; }
      return { periodo: periodo || "tudo", meses: meses, ini: ini ? iso(ini) : null, fim: iso(hoje),
        iniAnterior: iniAnt ? iso(iniAnt) : null, fimAnterior: fimAnt ? iso(fimAnt) : null };
    },
    _noIntervalo: function (f, ini, fim) {
      var d = ehISO(f && f.data) ? String(f.data).slice(0, 10) : null;
      if (!d) return false;
      if (ini && d < ini) return false;
      if (fim && d > fim) return false;
      return true;
    },
    meses: function (periodo, hojeISO, primeiroComDado) {
      var hoje = data(hojeISO), fim = chaveMes(hoje), ini = null;
      if (periodo === "mes") ini = fim;
      else if (periodo === "6m") ini = chaveMes(new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1));
      else if (periodo === "ano") ini = hoje.getFullYear() + "-01";
      if (primeiroComDado && (!ini || primeiroComDado < ini)) ini = primeiroComDado;
      if (!ini) return [];
      if (ini > fim) ini = fim;
      var af = parseInt(fim.slice(0, 4), 10), mf = parseInt(fim.slice(5, 7), 10), out = [];
      for (var k = 11; k >= 0; k--) {
        var mm = mf - k, aa = af;
        while (mm <= 0) { mm += 12; aa--; }
        var ch = aa + "-" + ("0" + mm).slice(-2);
        if (ch >= ini) out.push(ch);
      }
      return out;
    },
    /* os mesmos meses, um período para trás (para desenhar a comparação) */
    _mesesAnteriores: function (eixo, periodo) {
      var n = periodo === "ano" ? 12 : eixo.length;
      return eixo.map(function (ch) {
        var a = parseInt(ch.slice(0, 4), 10), m = parseInt(ch.slice(5, 7), 10) - n;
        while (m <= 0) { m += 12; a--; }
        return a + "-" + ("0" + m).slice(-2);
      });
    },
    _delta: function (atual, anterior) {
      if (!(anterior > 0)) return null;
      return Math.round((atual - anterior) / anterior * 100);
    },
    _tag: function (obraNome, modulo) {
      var n = String(obraNome || "").replace(/\s+/g, " ").trim();
      if (n) return n.length > 16 ? n.slice(0, 15) + "…" : n;
      return ({ epi: "EPI", estoque: "Estoque", rdo: "Diário", tour360: "Tour 360", licenca: "Licença", compras: "Compras",
        obras: "Obra", contratos: "Contrato", financeiro: "Financeiro", medicoes: "Medição", tarefas: "Tarefa", lastplanner: "Last Planner" })[String(modulo || "")] || "";
    },
    /* o grupo de cada ponto da fila: pelo código daqui, ou pelo tema/módulo
       do motor dono (Atenção, Reconciliação, Avisos) */
    _grupoDe: function (x) {
      var c = x.codigo || "";
      if (c === "reconciliacao" || c === "contas" || c === "medicoes-aprovar" || c === "aprovado-nao-pago" || c === "estouro") return "dinheiro";
      if (x.tema === "prazo") return "prazo";
      if (c === "status-desatualizado" || c === "termino-suspeito" || c === "sem-datas" || c === "sem-contrato") return "cadastro";
      if (c === "aviso") {
        var t = String(x.avisoTipo || "");
        if (/^compra/.test(t)) return "compras";
        if (/^contrato/.test(t)) return "cadastro";
        return "canteiro";
      }
      if (c === "atencao") {
        var m = String(x.modulo || "");
        if (m === "epi" || m === "estoque" || m === "rdo" || m === "tour360") return "canteiro";
        if (m === "compras") return "compras";
        if (m === "obras" || m === "contratos") return "cadastro";
        return "outros";
      }
      return "outros";
    },

    /* ------------------------------------------------------------------
     * calcular(d) — ver cabeçalho do arquivo para o contrato.
     * ------------------------------------------------------------------ */
    calcular: function (d) {
      var self = this;
      d = d || {};
      var hoje = ehISO(d.hoje) ? String(d.hoje).slice(0, 10) : null;
      if (!hoje) throw new Error("PainelDados.calcular: falta `hoje` (AAAA-MM-DD)");
      var periodo = own(PERIODOS, d.periodo) ? d.periodo : "6m";
      var R = d.regras || {};
      var realizado = R.realizado || function (f) { return !f.status || f.status === "pago"; };
      var emAberto = R.emAberto || function (f) { return f.status === "previsto" || f.status === "pendente" || f.status === "agendado" || f.status === "falhou"; };
      var contratoVivo = R.contratoVivo || function (c) { return c.status !== "cancelado" && c.status !== "rescindido"; };
      var compraTerminal = R.compraTerminal || function (s) { return s === "recebido" || s === "cancelado" || s === "concluido"; };
      var avancoMedido = R.avancoMedido || function () { return null; };
      var obras = d.obras || [], contratos = d.contratos || [], medicoes = d.medicoes || [];
      var fin = d.financeiro || [], compras = d.compras || [], rdos = d.rdos || [];
      var metas = d.metas || {};
      metas = { margem: num(metas.margem) || 15, ppc: num(metas.ppc) || 85, contasDias: num(metas.contasDias) || 7,
        prazoReceber: num(metas.prazoReceber) || 7, recebMes: num(metas.recebMes) };
      var jan = this.janela(periodo, hoje);
      var statusObras = own(STATUS, d.statusObras) ? d.statusObras : "";
      var nomeObra = {};
      obras.forEach(function (o) { if (o && o.id) nomeObra[o.id] = o.nome || ""; });
      var adiados = this._adiadosLimpos(d.adiados, hoje);

      /* ---------- UMA passagem sobre o financeiro ---------- */
      var caixa = { recebido: 0, pago: 0, aReceber: 0, aPagar: 0 };
      var ant = { recebido: 0, pago: 0 };
      var porMes = {}, porCat = {}, porObraPer = {}, primeiroMes = null;
      var acum = {};
      var contas = [], abertos = [];   /* abertos: tudo em aberto, com data prevista (para a previsão) */
      var limiteContas = somaDias(hoje, metas.contasDias);
      var fimSemana = somaDias(hoje, 7);
      fin.forEach(function (f) {
        if (!f) return;
        var v = num(f.valor), t = f.tipo;
        if (t !== "receita" && t !== "despesa") return;
        var oid = f.obraId || "";
        if (!acum[oid]) acum[oid] = { rec: 0, custo: 0 };
        if (realizado(f)) {
          if (t === "receita") acum[oid].rec += v; else acum[oid].custo += v;
          var mes = ehISO(f.data) ? String(f.data).slice(0, 7) : null;
          if (mes) {
            if (!porMes[mes]) porMes[mes] = { recebido: 0, pago: 0 };
            if (t === "receita") porMes[mes].recebido += v; else porMes[mes].pago += v;
          }
          if (self._noIntervalo(f, jan.ini, jan.fim)) {
            if (mes && (!primeiroMes || mes < primeiroMes)) primeiroMes = mes;
            if (t === "receita") caixa.recebido += v;
            else {
              caixa.pago += v;
              var c = f.categoria || "outros";
              porCat[c] = (porCat[c] || 0) + v;
              porObraPer[oid] = (porObraPer[oid] || 0) + v;
            }
          } else if (jan.iniAnterior && self._noIntervalo(f, jan.iniAnterior, jan.fimAnterior)) {
            if (t === "receita") ant.recebido += v; else ant.pago += v;
          }
        } else if (emAberto(f)) {
          var dv = String(f.vencimento || f.data || "").slice(0, 10);
          var temData = /^\d{4}-\d{2}-\d{2}$/.test(dv);
          if (t === "receita") caixa.aReceber += v;
          else {
            caixa.aPagar += v;
            if (temData && dv <= limiteContas) contas.push({ valor: v, vencimento: dv, vencida: dv < hoje });
          }
          abertos.push({ tipo: t, valor: v, data: temData ? dv : null, origem: "financeiro" });
        }
      });
      caixa.resultado = caixa.recebido - caixa.pago;
      caixa.margem = (caixa.recebido > 0 && caixa.pago > 0) ? (caixa.resultado / caixa.recebido) * 100 : null;
      caixa.anterior = { recebido: ant.recebido, pago: ant.pago, resultado: ant.recebido - ant.pago, existe: !!jan.iniAnterior && (ant.recebido > 0 || ant.pago > 0) };
      caixa.delta = {
        recebido: this._delta(caixa.recebido, ant.recebido),
        pago: this._delta(caixa.pago, ant.pago),
        resultado: (ant.recebido > 0 || ant.pago > 0) && Math.abs(ant.recebido - ant.pago) > 0 ? Math.round((caixa.resultado - (ant.recebido - ant.pago)) / Math.abs(ant.recebido - ant.pago) * 100) : null
      };
      var contasVal = contas.reduce(function (s, c) { return s + c.valor; }, 0);
      caixa.contasVencendo = { n: contas.length, valor: contasVal, ate: limiteContas, dias: metas.contasDias,
        vencidas: contas.filter(function (c) { return c.vencida; }).length };
      var aprov = medicoes.filter(function (m) { return m && m.status === "aprovada"; });
      caixa.aprovadoNaoPago = { n: aprov.length, valor: aprov.reduce(function (s, m) { return s + num(m.valor); }, 0) };
      caixa.pagoSemReceita = d.pagoSemReceita || null;

      /* por mês (eixo) + lucratividade + o período anterior alinhado + melhor mês */
      var eixo = this.meses(periodo, hoje, primeiroMes);
      var saldo = 0;
      caixa.porMes = eixo.map(function (m) {
        var x = porMes[m] || { recebido: 0, pago: 0 };
        saldo += x.recebido - x.pago;
        return { mes: m, recebido: x.recebido, pago: x.pago, saldo: saldo,
          lucratividade: (x.recebido > 0 && x.pago > 0) ? Math.round((x.recebido - x.pago) / x.recebido * 100) : null };
      });
      caixa.porMesAnterior = null;
      if (jan.iniAnterior && eixo.length) {
        var s2 = 0;
        caixa.porMesAnterior = this._mesesAnteriores(eixo, periodo).map(function (m) {
          var x = porMes[m] || { recebido: 0, pago: 0 };
          s2 += x.recebido - x.pago;
          return { mes: m, recebido: x.recebido, pago: x.pago, saldo: s2 };
        });
        if (!caixa.porMesAnterior.some(function (x) { return x.recebido > 0 || x.pago > 0; })) caixa.porMesAnterior = null;
      }
      var melhor = { recebido: null, pago: null, resultado: null };
      caixa.porMes.forEach(function (x) {
        if (x.recebido > 0 && (!melhor.recebido || x.recebido > melhor.recebido.valor)) melhor.recebido = { mes: x.mes, valor: x.recebido };
        if (x.pago > 0 && (!melhor.pago || x.pago > melhor.pago.valor)) melhor.pago = { mes: x.mes, valor: x.pago };
        var r = x.recebido - x.pago;
        if ((x.recebido > 0 || x.pago > 0) && (!melhor.resultado || r > melhor.resultado.valor)) melhor.resultado = { mes: x.mes, valor: r };
      });
      caixa.melhorMes = melhor;

      /* ---------- categorias (caixa do período) ---------- */
      var categorias = [];
      for (var k in porCat) if (own(porCat, k) && porCat[k] > 0) categorias.push({ cat: k, valor: porCat[k] });
      categorias.sort(function (a, b) { return b.valor - a.valor; });
      categorias.forEach(function (c) { c.pct = caixa.pago > 0 ? Math.round(c.valor / caixa.pago * 100) : 0; });

      /* ---------- contratos ---------- */
      var ctrPorObra = {};
      contratos.forEach(function (c) { if (!c || !contratoVivo(c)) return; ctrPorObra[c.obraId] = (ctrPorObra[c.obraId] || 0) + num(c.valor); });
      var faturado = medicoes.filter(function (m) { return m && (m.status === "aprovada" || m.status === "paga"); }).reduce(function (s, m) { return s + num(m.valor); }, 0);
      var vivos = 0, semContrato = { n: 0, valor: 0 };
      obras.forEach(function (o) { if (ctrPorObra[o.id] > 0) vivos += ctrPorObra[o.id]; else if (num(o.valor) > 0) { semContrato.n++; semContrato.valor += num(o.valor); } });
      var contratosOut = { contratosVivos: vivos, semContrato: semContrato, valorContratado: vivos + semContrato.valor, faturado: faturado, saldoFaturar: Math.max(0, vivos + semContrato.valor - faturado) };

      /* ---------- orçado × gasto por obra ---------- */
      var pr = d.prevReal || null, orcadoPorNome = {}, orcadoUnico = null;
      if (pr && pr.linhas && pr.linhas.length) {
        if (pr.porEtapa) { if (obras.length === 1) orcadoUnico = { previsto: num(pr.prevTot), gasto: num(pr.realTot) }; }
        else pr.linhas.forEach(function (l) { if (l && l.rotulo) orcadoPorNome[l.rotulo] = { previsto: num(l.previsto), gasto: num(l.real) }; });
      }

      /* ---------- obras ---------- */
      var comMov = [], semMov = [], emAndamento = 0, semDatasAndamento = 0, semDatasPlanej = 0, porObraPerLista = [], entregas = [];
      obras.forEach(function (o) {
        if (!o) return;
        var a = acum[o.id] || { rec: 0, custo: 0 };
        var pz = self.prazo(o, hoje);
        var av = avancoMedido(o.id);
        var semPct = av === null || av === undefined;
        var defas = (pz.temDatas && !semPct) ? pz.prazoPct - av : null;
        var base = ctrPorObra[o.id] > 0 ? ctrPorObra[o.id] : num(o.valor);
        var area = num(o.areaConstruida);
        var sinal = null, avisos = [];
        if (o.status === "andamento") emAndamento++;
        if (pz.temDatas) {
          if (pz.vencido && !semPct && av >= 100) { sinal = "ok"; avisos.push("entregue-fechar"); }
          else if (pz.vencido) sinal = "alerta";
          else if (defas !== null && defas >= DEFASAGEM_PONTOS) sinal = (pz.dias <= 15 ? "alerta" : "aviso");
          else if (pz.dias <= 15 && !semPct && av < 90) sinal = "aviso";
          else if (!semPct) sinal = "ok";
          if (pz.terminoSuspeito) avisos.push("termino-suspeito");
          if (semPct && (o.status === "andamento")) avisos.push("sem-percentual");
          if (o.status === "andamento" && pz.dias >= 0 && pz.dias <= 7) entregas.push({ id: o.id, nome: o.nome || "", dias: pz.dias, avanco: semPct ? null : av });
        } else if (!pz.entregue) {
          if (o.status === "andamento") { semDatasAndamento++; avisos.push("sem-datas"); }
          else if (o.status === "planejamento") semDatasPlanej++;
        }
        if (o.status === "planejamento" && (a.rec > 0 || a.custo > 0)) avisos.push("status-desatualizado");
        if (a.rec > 0 && !(ctrPorObra[o.id] > 0)) avisos.push("recebeu-sem-contrato");
        var orc = orcadoUnico || orcadoPorNome[o.nome] || null, orcado = null;
        if (orc && (orc.previsto > 0 || orc.gasto > 0)) {
          orcado = { previsto: orc.previsto, gasto: orc.gasto, consumidoPct: orc.previsto > 0 ? Math.round(orc.gasto / orc.previsto * 100) : null, estourou: orc.previsto > 0 && orc.gasto > orc.previsto };
          if (orcado.estourou) avisos.push("estouro");
        }
        var linha = { id: o.id, nome: o.nome || "", status: o.status || "", entregue: pz.entregue, prazo: pz, avanco: semPct ? null : av, defasagem: defas, sinal: sinal,
          contratado: ctrPorObra[o.id] > 0 ? ctrPorObra[o.id] : 0, valorObra: num(o.valor), base: base, semContrato: !(ctrPorObra[o.id] > 0),
          recebido: a.rec, custoPago: a.custo, margem: (a.rec > 0 && a.custo > 0) ? (a.rec - a.custo) / a.rec * 100 : null,
          custoM2: (a.custo > 0 && area > 0) ? a.custo / area : null, area: area, orcado: orcado, avisos: avisos };
        var movimento = a.rec > 0 || a.custo > 0 || (pz.temDatas && o.status === "andamento");
        if (movimento && !pz.entregue) comMov.push(linha); else semMov.push(linha);
        if (porObraPer[o.id] > 0) porObraPerLista.push({ id: o.id, nome: o.nome || "", valor: porObraPer[o.id] });
      });
      var ordemStatus = { andamento: 0, pausada: 1, planejamento: 2, concluida: 3 };
      comMov.sort(function (x, y) {
        var sx = own(ordemStatus, x.status) ? ordemStatus[x.status] : 9, sy = own(ordemStatus, y.status) ? ordemStatus[y.status] : 9;
        if (sx !== sy) return sx - sy;
        var dx = x.prazo.dias === null ? 1e9 : x.prazo.dias, dy = y.prazo.dias === null ? 1e9 : y.prazo.dias;
        if (dx !== dy) return dx - dy;
        return y.base - x.base;
      });
      semMov.sort(function (x, y) { return x.nome.localeCompare(y.nome); });
      porObraPerLista.sort(function (a, b) { return b.valor - a.valor; });
      var semObraPer = porObraPer[""] || 0;
      var porStatus = function (l) { return !statusObras || l.status === statusObras; };
      var comMovVis = comMov.filter(porStatus), semMovVis = semMov.filter(porStatus);

      /* ---------- previsão de caixa, 30 dias (o que está em aberto COM data) ---------- */
      aprov.forEach(function (m) {
        var base = ehISO(m.data) ? String(m.data).slice(0, 10) : (ehISO(m.periodoFim) ? String(m.periodoFim).slice(0, 10) : null);
        abertos.push({ tipo: "receita", valor: num(m.valor), data: base ? somaDias(base, metas.prazoReceber) : null, origem: "boletim" });
      });
      var semanas = [0, 1, 2, 3].map(function (i) { return { ini: somaDias(hoje, i * 7 + (i ? 1 : 0)), fim: somaDias(hoje, i === 3 ? 30 : (i + 1) * 7), entradas: 0, saidas: 0, nEntradas: 0, nSaidas: 0 }; });
      var atrasadas = { entradas: 0, saidas: 0, n: 0 }, semData = { entradas: 0, saidas: 0, n: 0 }, depois = { entradas: 0, saidas: 0, n: 0 };
      abertos.forEach(function (a) {
        var alvo;
        if (!a.data) alvo = semData;
        else if (a.data < hoje) alvo = atrasadas;
        else if (a.data > somaDias(hoje, 30)) alvo = depois;
        else alvo = semanas.filter(function (s) { return a.data >= s.ini && a.data <= s.fim; })[0] || depois;
        if (a.tipo === "receita") { alvo.entradas += a.valor; if (alvo.nEntradas !== undefined) alvo.nEntradas++; }
        else { alvo.saidas += a.valor; if (alvo.nSaidas !== undefined) alvo.nSaidas++; }
        if (alvo === semData || alvo === atrasadas || alvo === depois) alvo.n++;
      });
      var liq = 0;
      semanas.forEach(function (s) { liq += s.entradas - s.saidas; s.liquido = liq; });
      var previsao30 = { semanas: semanas, atrasadas: atrasadas, semData: semData, depois: depois,
        entradas: semanas.reduce(function (s, x) { return s + x.entradas; }, 0), saidas: semanas.reduce(function (s, x) { return s + x.saidas; }, 0),
        temDado: abertos.length > 0 };

      /* ---------- agenda da semana (até hoje + 7) ---------- */
      var contasSemana = contas.filter(function (c) { return c.vencimento <= fimSemana; });
      var receberSemana = abertos.filter(function (a) { return a.tipo === "receita" && a.data && a.data >= hoje && a.data <= fimSemana; });
      var medPend = medicoes.filter(function (m) { return m && m.status === "pendente"; });
      var agenda = {
        ate: fimSemana,
        contas: { n: contasSemana.length, valor: contasSemana.reduce(function (s, c) { return s + c.valor; }, 0), vencidas: contasSemana.filter(function (c) { return c.vencida; }).length },
        receber: { n: receberSemana.length, valor: receberSemana.reduce(function (s, a) { return s + a.valor; }, 0) },
        entregas: entregas.sort(function (a, b) { return a.dias - b.dias; }),
        medicoesAAprovar: medPend.length,
        tarefasAtrasadas: (d.tarefas && d.tarefas.atrasadas) || 0,
        vazia: !contasSemana.length && !receberSemana.length && !entregas.length && !medPend.length && !((d.tarefas && d.tarefas.atrasadas) || 0)
      };

      /* ---------- decisões (fila única, em grupos) ---------- */
      var dec = [];
      function push(x) { dec.push(x); }
      comMov.forEach(function (l) {
        if (l.status !== "andamento" || !l.prazo.temDatas) return;
        if (l.avanco === null) { push({ codigo: "sem-percentual", tema: "prazo", gravidade: 1, unidade: "dias", valor: l.prazo.dias, obraId: l.id, obraNome: l.nome, prazoPct: l.prazo.prazoPct, acao: { tipo: "view", valor: "medicoes" } }); return; }
        if (l.prazo.vencido && l.avanco >= 100) push({ codigo: "concluir", tema: "prazo", gravidade: 1, unidade: "dias", valor: -l.prazo.dias, obraId: l.id, obraNome: l.nome, acao: { tipo: "view", valor: "obras" } });
        else if (l.prazo.vencido) push({ codigo: "vencido", tema: "prazo", gravidade: 3, unidade: "dias", valor: -l.prazo.dias, obraId: l.id, obraNome: l.nome, avanco: l.avanco, acao: { tipo: "view", valor: "cronobra" } });
        else if (l.defasagem !== null && l.defasagem >= DEFASAGEM_PONTOS) push({ codigo: "defasagem", tema: "prazo", gravidade: l.prazo.dias <= 15 ? 3 : 2, unidade: "dias", valor: l.prazo.dias, obraId: l.id, obraNome: l.nome, prazoPct: l.prazo.prazoPct, avanco: l.avanco, defasagem: l.defasagem, acao: { tipo: "view", valor: "cronobra" } });
        else if (l.prazo.dias <= 15 && l.avanco < 90) push({ codigo: "entrega-proxima", tema: "prazo", gravidade: 2, unidade: "dias", valor: l.prazo.dias, obraId: l.id, obraNome: l.nome, avanco: l.avanco, acao: { tipo: "view", valor: "cronobra" } });
      });
      if (pr && pr.linhas) pr.linhas.filter(function (x) { return x.estourou; }).forEach(function (x) {
        push({ codigo: "estouro", tema: "orcamento", gravidade: 3, unidade: "R$", valor: num(x.real) - num(x.previsto), obraNome: x.rotulo, previsto: num(x.previsto), real: num(x.real), acao: { tipo: "view", valor: "previstoreal" } });
      });
      if (contas.length) push({ codigo: "contas", gravidade: caixa.contasVencendo.vencidas ? 3 : 2, unidade: "R$", valor: contasVal, n: contas.length, vencidas: caixa.contasVencendo.vencidas, ate: limiteContas, dias: caixa.contasVencendo.dias, acao: { tipo: "view", valor: "financeiro" } });
      if (medPend.length) push({ codigo: "medicoes-aprovar", gravidade: 2, unidade: "R$", valor: medPend.reduce(function (s, m) { return s + num(m.valor); }, 0), n: medPend.length, acao: { tipo: "view", valor: "medicoes" } });
      var rec = d.reconciliacao || null;
      if (rec && rec.itens) rec.itens.forEach(function (i) {
        push({ codigo: "reconciliacao", gravidade: i.gravidade >= 3 ? 3 : 2, unidade: "R$", valor: num(i.valor), titulo: i.titulo, detalhe: i.detalhe, porque: i.porque, acaoTexto: i.acao, docId: i.docId || i.id || "", acao: { tipo: "view", valor: i.view } });
      });
      if (!rec && aprov.length) push({ codigo: "aprovado-nao-pago", gravidade: 2, unidade: "R$", valor: caixa.aprovadoNaoPago.valor, n: aprov.length, acao: { tipo: "view", valor: "medicoes" } });
      (d.atencao || []).forEach(function (i) {
        var v = num(i.valor);
        var oNome = i.obraId && own(nomeObra, i.obraId) ? nomeObra[i.obraId] : "";
        push({ codigo: "atencao", tema: /t[eé]rmino|prazo/i.test(String(i.titulo || "")) ? "prazo" : "", gravidade: i.gravidade >= 3 ? 3 : (i.gravidade === 2 ? 2 : 1),
          unidade: v >= 100 ? "R$" : "", valor: v >= 100 ? v : 0, valorMiudo: (v > 0 && v < 100) ? v : 0, tag: self._tag(oNome, i.modulo), obraId: i.obraId || null, obraNome: oNome,
          titulo: i.titulo, detalhe: i.detalhe, porque: i.porque, acaoTexto: i.acao, modulo: i.modulo,
          acao: i.gacao ? { tipo: "gacao", valor: i.gacao } : i.acaoGestao ? { tipo: "acaoGestao", valor: i.acaoGestao, id: i.acaoId || "" } : i.acaoBotao ? { tipo: "acaoBotao", valor: i.acaoBotao } : { tipo: "view", valor: i.view || "dashboard" } });
      });
      /* os grupos do sino (Avisos.calcular) entram na MESMA fila: uma linha por
         grupo, com a contagem. O que a fila já cobre por conta própria
         (medições a aprovar) não entra duas vezes. */
      var avisosTotal = 0;
      ((d.avisos && d.avisos.grupos) || []).forEach(function (g) {
        if (!g || !g.itens || !g.itens.length) return;
        avisosTotal += g.itens.length;
        if (g.tipo === "medicao-aprovar") return;
        var view = (g.itens[0] && g.itens[0].view) || "dashboard";
        push({ codigo: "aviso", avisoTipo: g.tipo, gravidade: g.prioridade === 1 ? 2 : 1, unidade: "un", valor: g.itens.length, titulo: g.rotulo,
          detalhe: g.itens.slice(0, 3).map(function (i) { return i.titulo; }).join("; ") + (g.itens.length > 3 ? "; …" : ""), acao: { tipo: "view", valor: view } });
      });
      comMov.concat(semMov).forEach(function (l) {
        if (l.avisos.indexOf("status-desatualizado") > -1) push({ codigo: "status-desatualizado", gravidade: 1, unidade: "R$", valor: Math.max(l.recebido, l.custoPago), obraId: l.id, obraNome: l.nome, acao: { tipo: "view", valor: "obras" } });
        if (l.avisos.indexOf("termino-suspeito") > -1) push({ codigo: "termino-suspeito", gravidade: 1, unidade: "dias", valor: l.prazo.dias, obraId: l.id, obraNome: l.nome, acao: { tipo: "view", valor: "obras" } });
        if (l.avisos.indexOf("recebeu-sem-contrato") > -1) push({ codigo: "sem-contrato", gravidade: 1, unidade: "R$", valor: l.recebido, obraId: l.id, obraNome: l.nome, acao: { tipo: "view", valor: "contratos" } });
      });
      if (semDatasAndamento) push({ codigo: "sem-datas", gravidade: 1, unidade: "un", valor: semDatasAndamento, acao: { tipo: "view", valor: "obras" } });
      /* um fato, uma linha (prazo daqui + "passou do término" do Atenção) */
      var porChave = {};
      dec.forEach(function (x) { if (x.obraId && x.tema && x.codigo !== "atencao") porChave[x.obraId + "|" + x.tema] = x; });
      dec = dec.filter(function (x) {
        if (x.codigo !== "atencao" || !x.obraId || !x.tema) return true;
        var dono = porChave[x.obraId + "|" + x.tema];
        if (!dono) return true;
        if (x.gravidade > dono.gravidade) dono.gravidade = x.gravidade;
        if (x.porque) dono.porque = x.porque;
        if (x.acaoTexto) dono.acaoTexto = x.acaoTexto;
        dono.fundido = (dono.fundido || 0) + 1;
        return false;
      });
      dec.forEach(function (x) {
        if (!x.tag) x.tag = self._tag(x.obraNome, x.modulo);
        x.grupo = self._grupoDe(x);
        x.chave = self.chaveDecisao(x);
        x.adiadoAte = own(adiados, x.chave) ? adiados[x.chave] : null;
      });
      dec.sort(function (a, b) {
        if (b.gravidade !== a.gravidade) return b.gravidade - a.gravidade;
        var va = a.unidade === "R$" ? a.valor : 0, vb = b.unidade === "R$" ? b.valor : 0;
        if (vb !== va) return vb - va;
        var da = a.unidade === "dias" ? a.valor : 1e9, db = b.unidade === "dias" ? b.valor : 1e9;
        return da - db;
      });
      var ativas = dec.filter(function (x) { return !x.adiadoAte; }), adiadas = dec.filter(function (x) { return !!x.adiadoAte; });
      var grupos = GRUPOS.map(function (g) {
        var its = ativas.filter(function (x) { return x.grupo === g.id; });
        return { id: g.id, nome: g.nome, aberto: g.aberto, itens: its, emJogo: its.reduce(function (s, x) { return s + (x.unidade === "R$" ? x.valor : 0); }, 0) };
      }).filter(function (g) { return g.itens.length; });
      var emJogo = ativas.reduce(function (s, x) { return s + (x.unidade === "R$" ? x.valor : 0); }, 0);

      /* ---------- operação ---------- */
      var comprasAbertas = compras.filter(function (c) { return c && !compraTerminal(c.status); }).length;
      var operacao = { medicoesAAprovar: medPend.length, aprovadasSemPgto: caixa.aprovadoNaoPago, comprasAbertas: comprasAbertas, rdos: rdos.length,
        m2: d.m2 || null, retencao: num(d.retencao), lp: d.lp || null, tarefas: d.tarefas || null, pendentes: d.pendentes || null };

      /* ---------- metas (medidores) ---------- */
      var metasOut = {
        margem: { valor: caixa.margem, meta: metas.margem, atingido: caixa.margem === null ? null : Math.max(0, Math.min(1.5, caixa.margem / metas.margem)) },
        ppc: { valor: (d.lp && d.lp.ppc != null) ? Math.round(d.lp.ppc * 100) : null, meta: metas.ppc, atingido: (d.lp && d.lp.ppc != null) ? Math.max(0, Math.min(1.5, (d.lp.ppc * 100) / metas.ppc)) : null },
        recebimento: (metas.recebMes > 0 && jan.meses) ? { valor: caixa.recebido, meta: metas.recebMes * jan.meses, metaMes: metas.recebMes, meses: jan.meses, atingido: Math.max(0, Math.min(1.5, caixa.recebido / (metas.recebMes * jan.meses))) } : null
      };

      return {
        hoje: hoje, periodo: periodo, janela: jan, filtrado: !!(d.obraIds && d.obraIds.length),
        caixa: caixa,
        decisoes: ativas, decisoesAdiadas: adiadas, grupos: grupos, emJogo: emJogo, avisosDoSino: avisosTotal,
        obras: { comMovimento: comMovVis, semMovimento: semMovVis, total: obras.length, emAndamento: emAndamento, filtroStatus: statusObras,
          ocultasPeloStatus: (comMov.length - comMovVis.length) + (semMov.length - semMovVis.length), semDatasAndamento: semDatasAndamento, semDatasPlanejamento: semDatasPlanej },
        categorias: categorias, porObra: porObraPerLista.slice(0, 8), semObraPeriodo: semObraPer,
        contratos: contratosOut, operacao: operacao, metas: metasOut, previsao30: previsao30, agenda: agenda,
        prevReal: pr
      };
    }
  };

  global.PainelDados = PainelDados;
  if (typeof module !== "undefined" && module.exports) module.exports = PainelDados;
})(typeof window !== "undefined" ? window : this);
