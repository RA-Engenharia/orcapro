/* =====================================================================
 * painel.js — O MOTOR DO PAINEL DE GESTÃO (a tela só desenha). Único desde a 1.2.93.
 *
 * Motor PURO: não lê o DOM, não lê o Store, não chama `new Date()`. Recebe
 * listas já recortadas por obra, as regras de dinheiro que o resto do app
 * usa (FinStatus, a régua de avanço) e a data de hoje, e devolve o MODELO
 * da tela: caixa, fila de decisões em grupos, obras, categorias, contadores,
 * metas, previsão de caixa de 30 dias e a agenda da semana.
 * Roda em Node (tools/test-painel-dados.js).
 *
 * POR QUE ESTE ARQUIVO EXISTE (24/09/2026)
 * O Painel antigo (`renderDashboard`, tela até a 1.2.92) calculava dentro do HTML: a fórmula de
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
  var DIAS_SEM_DIARIO = 7;       /* obra em andamento sem diário há mais que isto pede atenção */
  var ABAS_OBRAS = { andamento: 1, todas: 1, concluidas: 1 };
  var POR_PAGINA = 12;           /* cartões por página nas abas Todas e Concluídas; Em andamento nunca é cortada */
  var PERIODOS = { mes: 1, "6m": 1, ano: 1, tudo: 1 };
  var STATUS = { andamento: 1, planejamento: 1, pausada: 1, concluida: 1 };
  /* os blocos da tela, na ordem padrão. `col` = onde mora: "esq" (coluna dos
     gráficos) ou "cheia" (largura inteira, depois da grade). A fila de
     decisões não está aqui: ela é a coluna da direita e não se esconde. */
  /* ORDEM PADRÃO (25/10/2026): depois do resumo do topo (hero, atalhos e obras em
     cartão), vêm os números do caixa e o FLUXO — o gráfico que conta a história —,
     depois os de apoio (categorias, previsão, lucratividade, metas). "Posição de
     hoje" e "Agenda" repetem o que o hero e a fila já dizem, por isso descem;
     continuam aqui para quem os quer (Organizar painel). Quem já organizou o
     painel mantém a ordem dele: só entra aqui quem não tem preferência gravada.
     26/10/2026: a linha do tempo dos 7 dias e o caixa projetado de 30 dias (que mostra a
     conta inteira: caixa hoje + entradas − vencimentos) sobem logo depois do caixa, porque
     respondem "o que vem aí e o que sobra"; o fluxo mensal desce um degrau. */
  var BLOCOS = [
    { id: "tiles", nome: "Caixa (recebido, pago, resultado, saldo a faturar)", col: "esq" },
    { id: "agenda", nome: "Próximos 7 dias (linha do tempo)", col: "esq" },
    { id: "previsao", nome: "Caixa e previsão, 30 dias", col: "esq" },
    { id: "fluxo", nome: "Fluxo de caixa por mês", col: "esq" },
    { id: "composicao", nome: "Despesas por categoria e custo por obra", col: "esq" },
    { id: "lucro", nome: "Lucratividade por mês", col: "esq" },
    { id: "metas", nome: "Metas (medidores)", col: "esq" },
    { id: "posicao", nome: "Posição de hoje (a receber, a pagar)", col: "esq" },
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

  /* mesma regra do Util.parseNum (js/util.js): "1,5"→1.5 · "0.12"→0.12 · "1.5"→1.5 · "1.234,56"→1234.56 · "1.000"→1000 (milhar BR; zero à esquerda NÃO é milhar) */
  function _brNorm(s) {
    var v = s.indexOf(",") > -1, np = (s.match(/\./g) || []).length, i;
    if (v && np) return s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    if (v) return (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    if (np > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return s.replace(/\./g, "");
      i = s.lastIndexOf("."); return s.slice(0, i).replace(/\./g, "") + "." + s.slice(i + 1);
    }
    if (np === 1 && /^-?\d{1,3}\.\d{3}$/.test(s) && !/^-?0\./.test(s)) return s.replace(/\./g, "");
    return s;
  }
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === "") return 0;
    var s = _brNorm(String(v).replace(/\s/g, ""));
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
    DIAS_SEM_DIARIO: DIAS_SEM_DIARIO,
    POR_PAGINA: POR_PAGINA,
    BLOCOS: BLOCOS,
    GRUPOS: GRUPOS,

    /* ------------------------------------------------------------------
     * PREFERÊNCIAS DE TELA — por pessoa e aparelho, como `paineis.js`.
     * Moram numa chave própria do localStorage: NÃO entram no Store, nas
     * prefs (que viajam pela Nuvem), no backup. O registro da pessoa guarda
     * os FILTROS (obra, período, somar, status, comparar), a ORDEM E
     * VISIBILIDADE dos blocos e os pontos ADIADOS — estado de tela, nunca
     * dado de orçamento; F5 não zera.
     * Forma: { v:1, u:{ <hash>: { obra, per, multi, status, comparar,
     *                              blocos:[{id,on}], adiados:{chave:"AAAA-MM-DD"} } } }.
     * Até a 1.2.92 o mesmo registro carregava a chave `novo` (o Painel em
     * avaliação, ligado por ?painel=novo). Desde a 1.2.93 o Painel é um só e
     * o campo é ignorado; o registro antigo (string "novo") continua legível.
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
     * PRIMEIRA TELA (25/10/2026) — o que o topo do Painel diz, sem DOM.
     * ------------------------------------------------------------------ */
    /* "Bom dia" de 5h às 11h59, "Boa tarde" até 17h59, "Boa noite" no resto.
       A hora vem de fora (o motor não lê o relógio). */
    saudacao: function (hora) {
      var h = Number(hora);
      if (!(h >= 0 && h < 24)) return "Olá";
      return h >= 5 && h < 12 ? "Bom dia" : (h >= 12 && h < 18 ? "Boa tarde" : "Boa noite");
    },
    /* só o primeiro nome, e só de PESSOA: e-mail ou campo vazio não vira
       "Bom dia, fulano@..." — quem nunca preencheu o nome é saudado sem nome. */
    primeiroNome: function (nome) {
      var s = String(nome == null ? "" : nome).replace(/^\s+|\s+$/g, "");
      if (!s || s.indexOf("@") > -1) return "";
      return s.split(/\s+/)[0];
    },
    /* Conta que ainda não tem NADA (nenhuma obra, lançamento, orçamento ou
       diário) recebe os passos de começo, não uma tela de zeros. Qualquer um
       dos quatro já existir tira a conta deste estado — apagar o exemplo não
       pode devolver o convite se a pessoa já trabalhou. */
    contaVazia: function (c) {
      c = c || {};
      return !(Number(c.obras) > 0 || Number(c.financeiro) > 0 || Number(c.orcamentos) > 0 || Number(c.rdo) > 0);
    },
    /* A linha "próximo marco" do cartão da obra. O único marco com data que o
       Painel guarda é a ENTREGA; o texto diz isso e não finge outro. `l` é a
       linha da obra do próprio modelo (prazo, entregue, status, fim). */
    proximoMarco: function (l) {
      var pz = (l && l.prazo) || {}, n, dd = "";
      if (l && l.entregue) return { tom: "ok", texto: "Obra entregue" };
      if (!pz.temDatas) return { tom: "neutro", texto: "Informe início e término da obra" };
      if (pz.vencido) { n = -pz.dias; return { tom: "alerta", texto: "Prazo venceu há " + n + (n === 1 ? " dia" : " dias") }; }
      if (pz.terminoSuspeito) return { tom: "aviso", texto: "Confira o término: fica a mais de 5 anos" };
      if (l && /^\d{4}-\d{2}-\d{2}/.test(String(l.fim || ""))) dd = ", " + String(l.fim).slice(8, 10) + "/" + String(l.fim).slice(5, 7);
      if (pz.dias === 0) return { tom: "aviso", texto: "Entrega hoje" };
      if (pz.dias === 1) return { tom: "aviso", texto: "Entrega amanhã" + dd };
      return { tom: pz.dias <= 15 ? "aviso" : "neutro", texto: "Entrega em " + pz.dias + " dias" + dd };
    },
    /* ⚠ LEGADO: a tela não usa mais (ela lê `obrasPainel`, que não corta nada). Fica porque
       test-painel-primeira-tela ainda guarda a ordem por status. Quais obras viram cartão e
       em que ordem: em andamento primeiro, depois
       pausada, planejamento e concluída; dentro do status, a entrega mais
       próxima primeiro (sem data por último). Corta em `max`; o resto vira a
       contagem do "ver todas". `semDinheiro` = quem não pode ver Financeiro. */
    cartoesObras: function (obras, max) {
      var ordem = { andamento: 0, pausada: 1, planejamento: 2, concluida: 3 };
      var todas = ((obras && obras.comMovimento) || []).concat((obras && obras.semMovimento) || []);
      var ord = todas.map(function (l, i) { return { l: l, i: i }; });
      ord.sort(function (x, y) {
        var sx = own(ordem, x.l.status) ? ordem[x.l.status] : 9, sy = own(ordem, y.l.status) ? ordem[y.l.status] : 9;
        if (sx !== sy) return sx - sy;
        var dx = (x.l.prazo && x.l.prazo.dias != null) ? x.l.prazo.dias : 1e9, dy = (y.l.prazo && y.l.prazo.dias != null) ? y.l.prazo.dias : 1e9;
        if (dx !== dy) return dx - dy;
        return x.i - y.i;
      });
      var m = max > 0 ? max : 6, lista = ord.map(function (x) { return x.l; });
      return { itens: lista.slice(0, m), restantes: Math.max(0, lista.length - m), total: lista.length };
    },



    /* ------------------------------------------------------------------
     * VARIAÇÃO E SPARKLINE (26/10/2026) — os números que a dica dos gráficos
     * e o resumo do topo dizem. Puros: `hoje` e os eventos vêm de fora.
     * ------------------------------------------------------------------ */
    /* variação de `atual` contra `anterior`. Sem base de comparação NÃO
       inventa porcentagem: anterior zerado e atual positivo é "novo", e os
       dois zerados é "sem". Denominador em módulo (saldo anterior negativo). */
    variacao: function (atual, anterior) {
      var a = num(atual), p = num(anterior);
      if (a === 0 && p === 0) return { pct: null, dir: "sem", texto: "sem valor nos dois períodos" };
      if (p === 0) return { pct: null, dir: a > 0 ? "novo" : "baixa", texto: a > 0 ? "novo, sem valor no período anterior" : "zerou" };
      var pct = Math.round((a - p) / Math.abs(p) * 100);
      if (pct === 0) return { pct: 0, dir: "igual", texto: "igual ao período anterior" };
      return { pct: pct, dir: pct > 0 ? "alta" : "baixa", texto: (pct > 0 ? "+" : "−") + Math.abs(pct) + "% sobre o período anterior" };
    },
    /* 30 dias terminando em `hoje`, um valor por dia. `eventos` = [{data, valor}].
       Só devolve algo com DADO REAL: menos de 2 dias com movimento não desenha
       tendência (um ponto isolado não é série). A tendência compara os últimos
       15 dias com os 15 anteriores; dentro de ±5% é "estavel". */
    sparkline: function (hojeISO, eventos) {
      var hoje = data(hojeISO);
      if (!hoje) return null;
      var dias = [], idx = {}, i;
      for (i = 29; i >= 0; i--) { var iso1 = somaDias(hojeISO, -i); idx[iso1] = dias.length; dias.push(0); }
      var comMov = {};
      (ehArr(eventos) ? eventos : []).forEach(function (e) {
        if (!e || !ehISO(e.data)) return;
        var k = String(e.data).slice(0, 10);
        if (!own(idx, k)) return;
        var v = num(e.valor);
        dias[idx[k]] += v;
        if (v !== 0) comMov[k] = 1;
      });
      var nMov = Object.keys(comMov).length;
      if (nMov < 2) return null;
      var ant = 0, rec = 0, tot = 0, max = 0;
      dias.forEach(function (v, k) { tot += v; if (v > max) max = v; if (k < 15) ant += v; else rec += v; });
      var dir, pct = null;
      if (ant === 0 && rec > 0) dir = "alta";
      else if (ant === 0) dir = "estavel";
      else {
        pct = Math.round((rec - ant) / Math.abs(ant) * 100);
        dir = pct > 5 ? "alta" : (pct < -5 ? "baixa" : "estavel");
      }
      return { dias: dias, total: tot, max: max, ultimos15: rec, anteriores15: ant, pct: pct, dir: dir, diasComMovimento: nMov };
    },

    /* ------------------------------------------------------------------
     * OBRAS DO PAINEL (26/10/2026) — abas, busca e ordem por atenção.
     * `todas` = a lista COMPLETA do modelo (`obras.todas`), nunca a que o
     * filtro de status do bloco "Obras" já cortou. ⚠ Foi assim que o Painel
     * da 1.2.182 mostrou só 2 obras concluídas: os cartões liam a lista
     * filtrada pelo status gravado nas preferências ("Concluídas") enquanto o
     * topo contava 7 em andamento de 24.
     * ------------------------------------------------------------------ */
    _semAcento: function (s) {
      var x = String(s == null ? "" : s).toLowerCase();
      try { if (x.normalize) x = x.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
      return x;
    },
    abaPadrao: function (abas, escolhida) {
      if (typeof escolhida === "string" && own(ABAS_OBRAS, escolhida)) return escolhida;
      return (abas && abas.andamento > 0) ? "andamento" : "todas";
    },
    obrasPainel: function (todas, o) {
      o = o || {};
      var self = this, lista = ehArr(todas) ? todas : [];
      var abas = { andamento: 0, concluidas: 0, todas: lista.length };
      lista.forEach(function (l) { if (!l) return; if (l.status === "andamento") abas.andamento++; else if (l.status === "concluida") abas.concluidas++; });
      var aba = this.abaPadrao(abas, o.aba);
      var q = this._semAcento(o.busca).replace(/^\s+|\s+$/g, "");
      var grupo = { andamento: 0, pausada: 1, planejamento: 2, concluida: 3 };
      var sel = lista.map(function (l, i) { return { l: l, i: i }; }).filter(function (x) {
        var l = x.l; if (!l) return false;
        if (aba === "andamento" && l.status !== "andamento") return false;
        if (aba === "concluidas" && l.status !== "concluida") return false;
        if (q && self._semAcento(l.nome).indexOf(q) < 0) return false;
        return true;
      });
      sel.sort(function (x, y) {
        var a = x.l, b = y.l;
        var ga = own(grupo, a.status) ? grupo[a.status] : 9, gb = own(grupo, b.status) ? grupo[b.status] : 9;
        if (ga !== gb) return ga - gb;
        var pa = (a.atencao && a.atencao.pontos) || 0, pb = (b.atencao && b.atencao.pontos) || 0;
        if (pa !== pb) return pb - pa;
        var da = (a.prazo && a.prazo.dias != null) ? a.prazo.dias : 1e9, db = (b.prazo && b.prazo.dias != null) ? b.prazo.dias : 1e9;
        if (da !== db) return da - db;
        return x.i - y.i;
      });
      var ordenadas = sel.map(function (x) { return x.l; });
      var corta = aba !== "andamento";
      var lim = corta ? Math.max(POR_PAGINA, Math.floor(num(o.ate)) || POR_PAGINA) : ordenadas.length;
      return { aba: aba, abas: abas, busca: q, total: ordenadas.length, itens: ordenadas.slice(0, lim), restantes: Math.max(0, ordenadas.length - lim), pagina: POR_PAGINA };
    },

    /* a tela pergunta, antes de desenhar, se a conta do caixa fecha */
    caixa30Total: function (c30) {
      if (!c30) return 0;
      return c30.saldoHoje + c30.entradas - c30.saidas - c30.atrasadasSaidas;
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
      var fimDias7 = somaDias(hoje, 6);    /* a linha do tempo mostra 7 dias: hoje e os 6 seguintes */
      var vencPorObra = {}, eventosFin = [], sparkRec = [], sparkPag = [];
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
          if (ehISO(f.data)) (t === "receita" ? sparkRec : sparkPag).push({ data: f.data, valor: v });
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
            if (temData && dv <= limiteContas) contas.push({ valor: v, vencimento: dv, vencida: dv < hoje, id: f.id || "", desc: f.desc || f.fornecedor || "", obraId: oid });
            if (temData && dv < hoje && oid) { if (!vencPorObra[oid]) vencPorObra[oid] = { n: 0, valor: 0 }; vencPorObra[oid].n++; vencPorObra[oid].valor += v; }
          }
          if (temData && dv >= hoje && dv <= fimDias7) eventosFin.push({ tipo: t === "receita" ? "recebimento" : "vencimento", data: dv, valor: v, titulo: f.desc || f.fornecedor || (t === "receita" ? "Receita prevista" : "Conta a pagar"), id: f.id || "", obraId: oid, view: "financeiro" });
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
        /* o mês de trás vem do mapa COMPLETO (não só da janela): o 1º mês do
           gráfico também se compara com o mês anterior que existe nos dados */
        var chAnt = self._mesesAnteriores([m], "mes")[0], ya = porMes[chAnt] || { recebido: 0, pago: 0 };
        var temAnt = own(porMes, chAnt);
        saldo += x.recebido - x.pago;
        return { mes: m, recebido: x.recebido, pago: x.pago, saldo: saldo,
          lucratividade: (x.recebido > 0 && x.pago > 0) ? Math.round((x.recebido - x.pago) / x.recebido * 100) : null,
          vs: temAnt ? { mes: chAnt, recebido: self.variacao(x.recebido, ya.recebido), pago: self.variacao(x.pago, ya.pago), resultado: self.variacao(x.recebido - x.pago, ya.recebido - ya.pago) } : null };
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
      var ultRdo = {}, medPendObra = {}, medAprovObra = {}, faturadoObra = {};
      rdos.forEach(function (r) { if (r && r.obraId && ehISO(r.data)) { var dd = String(r.data).slice(0, 10); if (dd <= hoje && (!ultRdo[r.obraId] || dd > ultRdo[r.obraId])) ultRdo[r.obraId] = dd; } });
      medicoes.forEach(function (m) {
        if (!m || !m.obraId) return;
        var o2 = m.obraId;
        if (m.status === "pendente") { if (!medPendObra[o2]) medPendObra[o2] = { n: 0, numero: "" }; medPendObra[o2].n++; if (!medPendObra[o2].numero) medPendObra[o2].numero = String(m.numero || ""); }
        if (m.status === "aprovada" && !m.dataPgto) { if (!medAprovObra[o2]) medAprovObra[o2] = { n: 0, valor: 0, numero: "" }; medAprovObra[o2].n++; medAprovObra[o2].valor += num(m.valor); if (!medAprovObra[o2].numero) medAprovObra[o2].numero = String(m.numero || ""); }
        if (m.status === "aprovada" || m.status === "paga") faturadoObra[o2] = (faturadoObra[o2] || 0) + num(m.valor);
      });
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
        var linha = { id: o.id, nome: o.nome || "", status: o.status || "", entregue: pz.entregue, prazo: pz, fim: ehISO(o.termino || o.previsaoFim) ? String(o.termino || o.previsaoFim).slice(0, 10) : "", avanco: semPct ? null : av, defasagem: defas, sinal: sinal,
          contratado: ctrPorObra[o.id] > 0 ? ctrPorObra[o.id] : 0, valorObra: num(o.valor), base: base, semContrato: !(ctrPorObra[o.id] > 0),
          recebido: a.rec, custoPago: a.custo, margem: (a.rec > 0 && a.custo > 0) ? (a.rec - a.custo) / a.rec * 100 : null,
          custoM2: (a.custo > 0 && area > 0) ? a.custo / area : null, area: area, orcado: orcado, avisos: avisos };
        /* ---- o que o CARTÃO da obra diz (26/10/2026) ---- */
        linha.faturado = faturadoObra[o.id] || 0;
        linha.avancoFin = base > 0 ? Math.max(0, Math.round(a.rec / base * 100)) : null;       /* recebido / contratado */
        linha.saldoReceber = base > 0 ? Math.max(0, base - a.rec) : null;                      /* contratado menos recebido */
        linha.ultimoDiario = ultRdo[o.id] || null;
        linha.diasSemDiario = linha.ultimoDiario ? diasEntre(linha.ultimoDiario, hoje) : null;
        linha.vencidas = vencPorObra[o.id] || { n: 0, valor: 0 };
        linha.medPendente = medPendObra[o.id] || null;
        linha.medAprovada = medAprovObra[o.id] || null;
        linha.atraso = null;
        if (o.status === "andamento" && pz.temDatas) {
          if (pz.vencido && !(linha.avanco !== null && linha.avanco >= 100)) linha.atraso = { tom: "alerta", texto: "Atrasada " + (-pz.dias) + (pz.dias === -1 ? " dia" : " dias") };
          else if (defas !== null && defas >= DEFASAGEM_PONTOS) linha.atraso = { tom: sinal === "alerta" ? "alerta" : "aviso", texto: defas + " pontos atrás do calendário" };
        }
        var pts = 0, motivos = [];
        if (o.status === "andamento") {
          if (linha.atraso && linha.atraso.tom === "alerta" && pz.vencido) { pts += 60 + Math.min(40, Math.floor(-pz.dias / 3)); motivos.push({ cod: "vencida", texto: linha.atraso.texto }); }
          else if (linha.atraso) { pts += 30 + (linha.atraso.tom === "alerta" ? 10 : 0); motivos.push({ cod: "defasagem", texto: linha.atraso.texto }); }
          if (orcado && orcado.estourou) { pts += 25; motivos.push({ cod: "estouro", texto: "Custo acima do orçado" }); }
          if (linha.vencidas.n > 0) { pts += 25 + Math.min(15, linha.vencidas.n); motivos.push({ cod: "vencidas", texto: linha.vencidas.n + (linha.vencidas.n === 1 ? " conta vencida" : " contas vencidas") }); }
          if (linha.ultimoDiario === null) { pts += 12; motivos.push({ cod: "sem-diario", texto: "Sem diário lançado" }); }
          else if (linha.diasSemDiario > DIAS_SEM_DIARIO) { pts += 12 + Math.min(10, Math.floor(linha.diasSemDiario / 7)); motivos.push({ cod: "sem-diario", texto: "Sem diário há " + linha.diasSemDiario + " dias" }); }
          if (linha.medPendente) { pts += 8; motivos.push({ cod: "medicao", texto: "Medição aguarda aprovação" }); }
          if (semPct && pz.temDatas) pts += 4;
        } else if (linha.vencidas.n > 0 && o.status !== "concluida") { pts += 10; motivos.push({ cod: "vencidas", texto: linha.vencidas.n + (linha.vencidas.n === 1 ? " conta vencida" : " contas vencidas") }); }
        linha.atencao = { pontos: pts, motivos: motivos };
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
      semanas.forEach(function (s, i) {
        liq += s.entradas - s.saidas; s.liquido = liq;
        s.vs = i === 0 ? null : { entradas: self.variacao(s.entradas, semanas[i - 1].entradas), saidas: self.variacao(s.saidas, semanas[i - 1].saidas) };
      });
      var previsao30 = { semanas: semanas, atrasadas: atrasadas, semData: semData, depois: depois,
        entradas: semanas.reduce(function (s, x) { return s + x.entradas; }, 0), saidas: semanas.reduce(function (s, x) { return s + x.saidas; }, 0),
        temDado: abertos.length > 0 };
      /* ---------- CAIXA PROJETADO, 30 DIAS (26/10/2026) ----------
         saldoHoje = o caixa realizado de SEMPRE do recorte (recebido menos pago),
         a mesma conta que o Financeiro faz (`PorObra.totais().saldoRealizado`).
         Desconta os vencimentos dos 30 dias E o que já venceu e segue em aberto
         (conta atrasada é dívida de hoje, não de depois); soma as entradas
         previstas dos 30 dias. Entrada já atrasada NÃO entra: dinheiro que
         ainda não chegou não paga conta. Sem data e depois de 30 dias ficam
         de fora e são ditos em separado. */
      var saldoHoje = 0, kk;
      for (kk in acum) if (own(acum, kk)) saldoHoje += acum[kk].rec - acum[kk].custo;
      var caixa30 = { saldoHoje: saldoHoje, entradas: previsao30.entradas, saidas: previsao30.saidas, atrasadasSaidas: atrasadas.saidas, atrasadasEntradas: atrasadas.entradas,
        semData: semData, depois: depois, temDado: previsao30.temDado || saldoHoje !== 0 };
      caixa30.projetado = saldoHoje + previsao30.entradas - previsao30.saidas - atrasadas.saidas;

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

      /* ---------- LINHA DO TEMPO DA SEMANA (26/10/2026) ----------
         Só fontes que existem nos dados: entregas de obra (prazo), contas a pagar e
         receitas previstas do Financeiro, pagamento previsto de boletim aprovado
         (data do boletim + prazo de receber), entrega de compra (previsão ou data
         confirmada) e prazo de tarefa. Visita e reunião não têm data neste cadastro. */
      var eventos = [];
      var objDia = {};
      eventosFin.forEach(function (e) { eventos.push(e); });
      entregas.forEach(function (o) { eventos.push({ tipo: "entrega", data: somaDias(hoje, o.dias), titulo: o.nome, detalhe: o.avanco === null ? "" : o.avanco + "% medido", obraId: o.id, view: "cronobra" }); });
      aprov.forEach(function (m) {
        var base0 = ehISO(m.data) ? String(m.data).slice(0, 10) : (ehISO(m.periodoFim) ? String(m.periodoFim).slice(0, 10) : null);
        var dp = base0 ? somaDias(base0, metas.prazoReceber) : null;
        if (dp && dp >= hoje && dp <= fimDias7) eventos.push({ tipo: "recebimento", data: dp, valor: num(m.valor), titulo: "Boletim " + (m.numero || "") + " aprovado", detalhe: "pagamento previsto", obraId: m.obraId || "", view: "medicoes", id: m.id || "" });
      });
      medPend.forEach(function (m) {
        var pf = ehISO(m.periodoFim) ? String(m.periodoFim).slice(0, 10) : null;
        if (pf && pf >= hoje && pf <= fimDias7) eventos.push({ tipo: "medicao", data: pf, valor: num(m.valor), titulo: "Fecha a medição " + (m.numero || ""), detalhe: "aguarda aprovação", obraId: m.obraId || "", view: "medicoes", id: m.id || "" });
      });
      compras.forEach(function (c) {
        if (!c || compraTerminal(c.status)) return;
        var dc = (c.confirmacao && ehISO(c.confirmacao.dataEntrega)) ? String(c.confirmacao.dataEntrega).slice(0, 10) : (ehISO(c.previsaoEntrega) ? String(c.previsaoEntrega).slice(0, 10) : null);
        if (dc && dc >= hoje && dc <= fimDias7) eventos.push({ tipo: "compra", data: dc, titulo: "Entrega" + (c.fornecedorNome ? " de " + c.fornecedorNome : " de material"), detalhe: c.numero ? "pedido " + c.numero : "", obraId: c.obraId || "", view: "compras", id: c.id || "" });
      });
      var tarAtr = 0;
      (ehArr(d.tarefasLista) ? d.tarefasLista : []).forEach(function (t) {
        if (!t || !ehISO(t.prazo) || t.status === "feita" || t.status === "cancelada") return;
        var dt = String(t.prazo).slice(0, 10);
        if (dt < hoje) tarAtr++;
        else if (dt <= fimDias7) eventos.push({ tipo: "tarefa", data: dt, titulo: t.titulo || t.descricao || "Tarefa", obraId: t.obraId || "", view: "tarefas", id: t.id || "" });
      });
      var ordemTipo = { vencimento: 0, entrega: 1, medicao: 2, recebimento: 3, compra: 4, tarefa: 5 };
      var diasSemana = [];
      for (var di = 0; di < 7; di++) {
        var isoD = somaDias(hoje, di);
        var doDia = eventos.filter(function (e) { return e.data === isoD; }).map(function (e) {
          return { tipo: e.tipo, titulo: String(e.titulo || ""), detalhe: String(e.detalhe || ""), valor: e.valor === undefined ? null : e.valor, obraId: e.obraId || "", obraNome: e.obraId && own(nomeObra, e.obraId) ? nomeObra[e.obraId] : "", view: e.view || "", id: e.id || "" };
        });
        doDia.sort(function (x, y) { var ox = own(ordemTipo, x.tipo) ? ordemTipo[x.tipo] : 9, oy = own(ordemTipo, y.tipo) ? ordemTipo[y.tipo] : 9; if (ox !== oy) return ox - oy; return num(y.valor) - num(x.valor); });
        diasSemana.push({ data: isoD, hoje: di === 0, eventos: doDia });
      }
      var atrasadosCont = { n: contas.filter(function (c) { return c.vencida; }).length, valor: contas.filter(function (c) { return c.vencida; }).reduce(function (s, c) { return s + c.valor; }, 0) };
      var nEventos = diasSemana.reduce(function (s, x) { return s + x.eventos.length; }, 0);
      agenda.dias = diasSemana; agenda.atrasados = { contas: atrasadosCont, tarefas: tarAtr || ((d.tarefas && d.tarefas.atrasadas) || 0), medicoes: 0 }; agenda.totalEventos = nEventos;

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
      /* itens que a fila deixa resolver sem sair do Painel (no máximo 4 por ponto) */
      var itensContas = contas.slice().sort(function (x, y) { return x.vencimento < y.vencimento ? -1 : (x.vencimento > y.vencimento ? 1 : 0); }).slice(0, 4)
        .map(function (c) { return { id: c.id, rotulo: c.desc || "Conta a pagar", sub: (c.vencida ? "vencida em " : "vence em ") + c.vencimento.slice(8, 10) + "/" + c.vencimento.slice(5, 7), valor: c.valor, obraNome: c.obraId && own(nomeObra, c.obraId) ? nomeObra[c.obraId] : "" }; })
        .filter(function (i) { return !!i.id; });
      if (contas.length) push({ codigo: "contas", gravidade: caixa.contasVencendo.vencidas ? 3 : 2, unidade: "R$", valor: contasVal, n: contas.length, vencidas: caixa.contasVencendo.vencidas, ate: limiteContas, dias: caixa.contasVencendo.dias, itens: itensContas, itensAcao: "abrir-lancamento", acao: { tipo: "view", valor: "financeiro" } });
      /* ⚠ RBAC: `mostrarDinheiro: false` (quem não tem o módulo Financeiro) tira
         o R$ da fila — a medição a aprovar vira contagem e o "boletim aprovado
         sem receita" (que só o Financeiro resolve) não entra. Pegou na
         e2e-painel-kpis [f] da 1.2.93: o encarregado de RDO lia o valor do
         boletim em "Dinheiro parado". */
      var dinheiro = d.mostrarDinheiro !== false;
      var itemMed = function (m) { return { id: m.id || "", rotulo: "Medição " + (m.numero || "") + (m.obraId && own(nomeObra, m.obraId) ? " · " + nomeObra[m.obraId] : ""), sub: "", valor: dinheiro ? num(m.valor) : null, obraNome: "" }; };
      if (medPend.length) push({ codigo: "medicoes-aprovar", gravidade: 2, unidade: dinheiro ? "R$" : "un", valor: dinheiro ? medPend.reduce(function (s, m) { return s + num(m.valor); }, 0) : medPend.length, n: medPend.length, itens: medPend.slice(0, 4).map(itemMed).filter(function (i) { return !!i.id; }), itensAcao: "aprovar-medicao", acao: { tipo: "view", valor: "medicoes" } });
      var rec = d.reconciliacao || null;
      if (rec && rec.itens) rec.itens.forEach(function (i) {
        var x = { codigo: "reconciliacao", gravidade: i.gravidade >= 3 ? 3 : 2, unidade: "R$", valor: num(i.valor), titulo: i.titulo, detalhe: i.detalhe, porque: i.porque, acaoTexto: i.acao, docId: i.docId || i.id || "", acao: { tipo: "view", valor: i.view } };
        /* boletim aprovado há dias e sem recebimento: o botão registra o pagamento pelo ID do boletim
           (o carimbo `docId`) — nunca por semelhança de número, valor ou data */
        if (i.tipo === "medicao-sem-recebimento" && i.docId && dinheiro) {
          var med = medicoes.filter(function (m) { return m && m.id === i.docId && m.status === "aprovada" && !m.dataPgto; })[0];
          if (med) { x.itens = [itemMed(med)]; x.itensAcao = "pagar-medicao"; x.n = 1; }
        }
        push(x);
      });
      if (dinheiro && !rec && aprov.length) push({ codigo: "aprovado-nao-pago", gravidade: 2, unidade: "R$", valor: caixa.aprovadoNaoPago.valor, n: aprov.length, itens: aprov.filter(function (m) { return !m.dataPgto; }).slice(0, 4).map(itemMed).filter(function (i) { return !!i.id; }), itensAcao: "pagar-medicao", acao: { tipo: "view", valor: "medicoes" } });
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
        obras: { comMovimento: comMovVis, semMovimento: semMovVis, todas: comMov.concat(semMov), total: obras.length, emAndamento: emAndamento, filtroStatus: statusObras,
          ocultasPeloStatus: (comMov.length - comMovVis.length) + (semMov.length - semMovVis.length), semDatasAndamento: semDatasAndamento, semDatasPlanejamento: semDatasPlanej },
        categorias: categorias, porObra: porObraPerLista.slice(0, 8), semObraPeriodo: semObraPer,
        contratos: contratosOut, operacao: operacao, metas: metasOut, previsao30: previsao30, caixa30: caixa30, agenda: agenda,
        spark: { recebido: this.sparkline(hoje, sparkRec), pago: this.sparkline(hoje, sparkPag), obrasComDiario: this.sparkline(hoje, (function () { var seen = {}, out = []; rdos.forEach(function (r) { if (!r || !r.obraId || !ehISO(r.data)) return; var k2 = String(r.data).slice(0, 10) + "|" + r.obraId; if (seen[k2]) return; seen[k2] = 1; out.push({ data: r.data, valor: 1 }); }); return out; })()) },
        prevReal: pr
      };
    }
  };

  global.PainelDados = PainelDados;
  if (typeof module !== "undefined" && module.exports) module.exports = PainelDados;
})(typeof window !== "undefined" ? window : this);
