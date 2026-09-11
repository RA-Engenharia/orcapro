/* =====================================================================
 * lastplanner.js — Last Planner System (PPC) — MOTOR PURO (sem DOM).
 * Planejamento enxuto (Lean Construction): o médio prazo (Lookahead)
 * remove RESTRIÇÕES; só tarefa livre de restrição pode ser COMPROMETIDA
 * na semana; no fim da semana mede-se o PPC (% do plano concluído) e
 * registram-se as CAUSAS de não-cumprimento pra melhoria contínua.
 *
 * Modelo (por obra, persistido em raerp:lastplanner:<obraId>):
 *   { obraId, tarefas:[ {
 *       id, titulo, responsavel, frente,
 *       semana: "YYYY-MM-DD" (a SEGUNDA da semana — chave única),
 *       comprometida: bool,                       // entrou no Plano da Semana
 *       status: "afazer"|"feito"|"naofeito",
 *       causa: "" (categoria, quando naofeito),
 *       restricoes: [ { id, tipo, descricao, responsavel, prazo, removida:bool } ],
 *       criadoEm, atualizadoEm
 *   } ] }
 *
 * Node-testável. Sem inventar nada: PPC e causas saem só do que foi lançado.
 * ===================================================================== */
(function (global) {
  "use strict";

  // Categorias padrão (parametrizáveis pelo app se quiser).
  var CAUSAS = ["Material", "Mão de obra", "Projeto / detalhamento", "Equipamento", "Programação", "Retrabalho", "Clima", "Cliente / terceiros", "Frente anterior atrasada", "Outros"];
  var RESTRICOES = ["Material", "Projeto", "Mão de obra", "Equipamento", "Área / frente", "Contrato / financeiro", "Aprovação / licença", "Outros"];
  var STATUS = { AFAZER: "afazer", FEITO: "feito", NAOFEITO: "naofeito" };

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function ehData(d) { return d instanceof Date && !isNaN(d.getTime()); }

  // Segunda-feira 00:00 da semana que contém a data d (semana Seg–Dom).
  function segundaDe(d) {
    var x = new Date(d.getTime());
    var dow = (x.getDay() + 6) % 7;      // 0 = segunda … 6 = domingo
    x.setDate(x.getDate() - dow);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  // Chave de semana = data ISO (YYYY-MM-DD) da SEGUNDA. Única e ordenável.
  function chaveSemana(d) { var s = segundaDe(d); return s.getFullYear() + "-" + pad2(s.getMonth() + 1) + "-" + pad2(s.getDate()); }
  function fmtDia(d) { return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1); }

  // Janela do Lookahead: n semanas a partir da semana de 'base' (default: a atual = idx 0).
  function semanas(base, n) {
    if (!ehData(base)) base = new Date();
    n = n > 0 ? Math.floor(n) : 6;
    var seg = segundaDe(base), out = [];
    for (var i = 0; i < n; i++) {
      var ini = new Date(seg.getTime()); ini.setDate(ini.getDate() + i * 7);
      var fim = new Date(ini.getTime()); fim.setDate(fim.getDate() + 6);
      out.push({
        idx: i, chave: chaveSemana(ini), ini: ini, fim: fim,
        rotulo: i === 0 ? "Esta semana" : "Sem " + (i + 1),
        periodo: fmtDia(ini) + "–" + fmtDia(fim)
      });
    }
    return out;
  }

  function arr(x) { return Array.isArray(x) ? x : (x ? [x] : []); }
  function tarefasDe(plano) { return plano && Array.isArray(plano.tarefas) ? plano.tarefas : []; }

  // Restrições em aberto (não removidas) de UMA tarefa.
  function restricoesAbertas(t) {
    var n = 0, r = t && arr(t.restricoes);
    for (var i = 0; i < r.length; i++) { if (r[i] && !r[i].removida) n++; }
    return n;
  }
  // Tarefa está LIVRE (pode ser comprometida) quando não tem restrição em aberto.
  function podeComprometer(t) { return restricoesAbertas(t) === 0; }

  // Tarefas de uma semana (por chave).
  function daSemana(tarefas, chave) {
    return arr(tarefas).filter(function (t) { return t && t.semana === chave; });
  }

  // PPC de UMA semana: só as COMPROMETIDAS entram na conta. feito/comprometidas.
  function ppcSemana(tarefas, chave) {
    var comp = daSemana(tarefas, chave).filter(function (t) { return t.comprometida; });
    var feitas = 0, naofeitas = 0, pend = 0;
    comp.forEach(function (t) {
      if (t.status === STATUS.FEITO) feitas++;
      else if (t.status === STATUS.NAOFEITO) naofeitas++;
      else pend++;
    });
    var total = comp.length;
    return {
      chave: chave, comprometidas: total, feitas: feitas, naofeitas: naofeitas, pendentes: pend,
      ppc: total > 0 ? feitas / total : null   // null = sem tarefas comprometidas (não força 0%/100%)
    };
  }

  // Histórico de PPC pelas semanas dadas (pro gráfico "últimas N semanas").
  function historicoPPC(tarefas, listaSemanas) {
    return arr(listaSemanas).map(function (s) {
      var p = ppcSemana(tarefas, s.chave);
      return { chave: s.chave, rotulo: s.rotulo, periodo: s.periodo, ppc: p.ppc, comprometidas: p.comprometidas, feitas: p.feitas };
    });
  }
  // PPC médio (só semanas que tiveram comprometidas).
  function ppcMedio(hist) {
    var soma = 0, n = 0;
    arr(hist).forEach(function (h) { if (h.ppc != null) { soma += h.ppc; n++; } });
    return n > 0 ? soma / n : null;
  }

  // Causas de não-cumprimento agregadas (Pareto). Opcional: limitar às chaves dadas.
  function causasAgregadas(tarefas, chavesRestrito) {
    var lim = chavesRestrito ? {} : null;
    if (lim) arr(chavesRestrito).forEach(function (c) { lim[c] = 1; });
    var mapa = {}, total = 0;
    arr(tarefas).forEach(function (t) {
      if (!t || t.status !== STATUS.NAOFEITO) return;
      if (lim && !lim[t.semana]) return;
      var c = (t.causa && String(t.causa).trim()) || "Não informada";
      mapa[c] = (mapa[c] || 0) + 1; total++;
    });
    var linhas = Object.keys(mapa).map(function (c) { return { causa: c, n: mapa[c], pct: total > 0 ? mapa[c] / total : 0 }; });
    linhas.sort(function (a, b) { return b.n - a.n; });   // Pareto: maior primeiro
    return { linhas: linhas, total: total };
  }

  // Restrições agregadas (todas em aberto, pra reunião de médio prazo).
  function restricoesPendentes(tarefas) {
    var out = [];
    arr(tarefas).forEach(function (t) {
      arr(t && t.restricoes).forEach(function (r) {
        if (r && !r.removida) out.push({ tarefaId: t.id, tarefa: t.titulo, semana: t.semana, tipo: r.tipo, descricao: r.descricao, responsavel: r.responsavel, prazo: r.prazo, id: r.id });
      });
    });
    // ordena por prazo (as sem prazo ao fim)
    out.sort(function (a, b) { return String(a.prazo || "9999").localeCompare(String(b.prazo || "9999")); });
    return out;
  }

  // Resumo geral pro cabeçalho do painel.
  function resumo(tarefas, listaSemanas) {
    var atual = listaSemanas && listaSemanas.length ? listaSemanas[0] : null;
    var pAtual = atual ? ppcSemana(tarefas, atual.chave) : { comprometidas: 0, feitas: 0, ppc: null };
    var hist = historicoPPC(tarefas, listaSemanas || []);
    var restr = restricoesPendentes(tarefas);
    var noLookahead = 0, comprometiveis = 0;
    var chavesLook = {}; arr(listaSemanas).forEach(function (s) { chavesLook[s.chave] = 1; });
    arr(tarefas).forEach(function (t) {
      if (!t || !chavesLook[t.semana]) return;
      if (!t.comprometida) { noLookahead++; if (podeComprometer(t)) comprometiveis++; }
    });
    return {
      ppcSemana: pAtual.ppc, comprometidas: pAtual.comprometidas, feitas: pAtual.feitas,
      ppcMedio: ppcMedio(hist),
      restricoesAbertas: restr.length,
      naLista: noLookahead, comprometiveis: comprometiveis
    };
  }

  /* ===== Integração cronograma → plano da semana =====
   * CONTRATO: inicio/fim em DIAS CORRIDOS a partir de dataInicioISO — o caller
   * converte (Cronograma.estimar entrega offsets em dias ÚTEIS mas também as
   * datas reais; a view usa as datas). Devolve RASCUNHOS pra semana-alvo:
   * entram só as etapas cuja janela cruza a semana, sem duplicar título que já
   * exista naquela semana. Puro — quem grava no Store é a view. */
  function normTit(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function sugerirDoCronograma(etapasCrono, dataInicioISO, semanaISO, existentes) {
    var out = [];
    if (!semanaISO) return out;
    var seg = new Date(String(semanaISO).slice(0, 10) + "T00:00:00");
    if (isNaN(seg.getTime())) return out;
    var fimSem = new Date(seg.getTime() + 6 * 86400000);
    var ini = new Date(String(dataInicioISO || semanaISO).slice(0, 10) + "T00:00:00");
    if (isNaN(ini.getTime())) ini = seg;
    var jaTem = {};
    arr(existentes).forEach(function (t) { if (t && t.semana === semanaISO) jaTem[normTit(t.titulo)] = 1; });
    arr(etapasCrono).forEach(function (e) {
      if (!e || e.inicio == null || e.fim == null || !e.nome) return;
      var a = new Date(ini.getTime() + e.inicio * 86400000);
      var b = new Date(ini.getTime() + e.fim * 86400000);
      if (b < seg || a > fimSem) return; // etapa fora da janela da semana
      if (jaTem[normTit(e.nome)]) return;
      jaTem[normTit(e.nome)] = 1;
      out.push({ titulo: e.nome, frente: e.categoriaNome || e.categoria || "", semana: semanaISO, comprometida: false, status: "afazer", restricoes: [], origem: "cronograma" });
    });
    return out;
  }

  /* ===== Puxar do cronograma PELO NÓ (etapa ou subetapa) =====
   *
   * Com o cronograma executivo, o que a equipe planeja na semana é a
   * SUBETAPA ("Estrutura › Pilares"), não a etapa inteira. Com o detalhe da
   * aba Cronograma diferente de "etapa", puxam-se as FOLHAS da árvore
   * (`Cronograma.estimar(orc, {dataInicio: obra.inicio}, {eap:true})`,
   * nós de papel "folha": subetapa, "serviços gerais" da etapa, ou a
   * própria etapa quando ela não tem subetapa). Com detalhe "etapa", as
   * etapas — como sempre foi.
   *
   * A tarefa grava `cronoNoId` (o nó de onde veio) e `etapaId`: é o carimbo
   * que o diário herda e que liga o apontamento à etapa sem depender do nome.
   *
   * ⚠ NÃO DUPLICAR, nas três formas em que isto aconteceria:
   *   - a mesma folha já puxada nesta semana (mesmo `cronoNoId`);
   *   - tarefa ANTIGA (sem `cronoNoId`) com o mesmo título — era a regra de
   *     antes, e a tarefa puxada por etapa numa versão anterior tem o nome
   *     da etapa como título;
   *   - a ETAPA INTEIRA já está no plano da semana (tarefa antiga com o nome
   *     da etapa, ou tarefa com `cronoNoId` = a etapa): as subetapas dela não
   *     entram, e o recado diz quais e como sair (excluir a tarefa da etapa
   *     e puxar de novo). Sem isto, "Estrutura" e "Estrutura › Pilares"
   *     ficariam lado a lado na mesma semana e o PPC contaria o mesmo
   *     trabalho duas vezes.
   * Puro — quem grava no Store é a view. */
  function ehDataObj(d) { return Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime()); }
  function isoLocal(d) {
    if (ehDataObj(d)) return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    var s = String(d == null ? "" : d).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }
  function somaDiasISO(iso, n) {
    var p = iso.split("-"), d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return isoLocal(d);
  }

  /* r = Cronograma.estimar(orc, override, {eap:true}). Devolve os nós que
     viram tarefa, já com título, carimbo e janela em "AAAA-MM-DD". */
  function nosDoCronograma(r, detalhe) {
    var out = [], avisos = [];
    if (!r || !Array.isArray(r.etapas)) return { nos: out, detalhe: "etapa", avisos: avisos };
    var det = detalhe || (r.exec && r.exec.detalhe) || "etapa";
    var temArvore = Array.isArray(r.atividades);
    if (det !== "etapa" && !temArvore) {
      avisos.push("as subetapas não puderam ser montadas" + (r.exec && r.exec.erro ? " (" + r.exec.erro + ")" : "") + " — as tarefas foram puxadas por etapa.");
      det = "etapa";
    }
    var nomeEt = {};
    r.etapas.forEach(function (e) { if (e && e.id != null) nomeEt[e.id] = e.nome || ""; });
    if (det !== "etapa") {
      r.atividades.forEach(function (n) {
        if (!n || n.papel !== "folha") return;
        if (n.tipo !== "etapa" && n.tipo !== "subetapa" && n.tipo !== "soltos") return;
        var eNome = nomeEt[n.etapaId] || "";
        /* a subetapa leva o nome da etapa na frente: "Pilares" e "Serviços
           gerais da etapa" se repetem de uma etapa para outra, e a tarefa na
           semana precisa dizer de qual */
        var tit = n.tipo === "etapa" ? (n.nome || eNome) : ((eNome ? eNome + " › " : "") + (n.nome || ""));
        out.push({ cronoNoId: String(n.id), etapaId: n.etapaId != null ? String(n.etapaId) : "", etapaNome: eNome,
          tipo: n.tipo, titulo: tit, categoria: n.categoria || "", categoriaNome: n.categoriaNome || "",
          ini: isoLocal(n.dataInicio), fim: isoLocal(n.dataFim) });
      });
    } else {
      r.etapas.forEach(function (e) {
        if (!e) return;
        out.push({ cronoNoId: e.id != null ? String(e.id) : "", etapaId: e.id != null ? String(e.id) : "", etapaNome: e.nome || "",
          tipo: "etapa", titulo: e.nome || "", categoria: e.categoria || "", categoriaNome: e.categoriaNome || "",
          ini: isoLocal(e.dataInicio), fim: isoLocal(e.dataFim) });
      });
    }
    return { nos: out, detalhe: det, avisos: avisos };
  }

  function sugerirDoCronogramaNos(nos, semanaISO, existentes) {
    var res = { sugestoes: [], jaNoPlano: 0, cobertas: [] };
    var seg = isoLocal(semanaISO);
    if (!seg) return res;
    var fimSem = somaDiasISO(seg, 6);
    var porNo = {}, porTit = {}, cob = {}, ordemCob = [];
    arr(existentes).forEach(function (t) {
      if (!t || t.semana !== semanaISO) return;
      if (t.cronoNoId) porNo[String(t.cronoNoId)] = 1;
      else porTit[normTit(t.titulo)] = 1;
    });
    arr(nos).forEach(function (n) {
      if (!n || !n.titulo || !n.ini || !n.fim) return;
      if (n.fim < seg || n.ini > fimSem) return;           // fora da janela da semana
      if ((n.cronoNoId && porNo[n.cronoNoId]) || porTit[normTit(n.titulo)]) { res.jaNoPlano++; return; }
      if (n.tipo !== "etapa" && ((n.etapaId && porNo[n.etapaId]) || (n.etapaNome && porTit[normTit(n.etapaNome)]))) {
        if (!cob[n.etapaNome]) { cob[n.etapaNome] = []; ordemCob.push(n.etapaNome); }
        cob[n.etapaNome].push(n.titulo);
        return;
      }
      if (n.cronoNoId) porNo[n.cronoNoId] = 1;
      porTit[normTit(n.titulo)] = 1;
      var t = { titulo: n.titulo, frente: n.categoriaNome || n.categoria || "", semana: semanaISO,
        comprometida: false, status: "afazer", restricoes: [], origem: "cronograma" };
      if (n.cronoNoId) t.cronoNoId = n.cronoNoId;
      if (n.etapaId) t.etapaId = n.etapaId;
      if (n.etapaNome) t.etapaNome = n.etapaNome;
      res.sugestoes.push(t);
    });
    res.cobertas = ordemCob.map(function (e) { return { etapa: e, folhas: cob[e] }; });
    return res;
  }

  /* O caminho inteiro do botão "Puxar do cronograma", sem DOM nem Store.
     deps = { Cronograma } (injetado: em Node este módulo não enxerga o
     global do app, e a view passa o que tem em mãos). */
  function puxarDoCronograma(orc, obra, semanaISO, existentes, deps) {
    var C = deps && deps.Cronograma;
    if (!C || typeof C.estimar !== "function") return { ok: false, erro: "o motor do cronograma não está carregado.", sugestoes: [], jaNoPlano: 0, cobertas: [] };
    var r;
    try { r = C.estimar(orc, obra && obra.inicio ? { dataInicio: obra.inicio } : null, { eap: true }); }
    catch (e) { return { ok: false, erro: "falha ao estimar o cronograma: " + (e && e.message), sugestoes: [], jaNoPlano: 0, cobertas: [] }; }
    var nd = nosDoCronograma(r);
    var s = sugerirDoCronogramaNos(nd.nos, semanaISO, existentes);
    s.ok = true; s.detalhe = nd.detalhe; s.avisos = nd.avisos;
    return s;
  }

  /* O recado do botão, com os números. `tipo` = "ok" | "erro" (UI.toast). */
  function textoPuxar(res) {
    if (!res || !res.ok) return { tipo: "erro", msg: "Não deu para puxar do cronograma: " + ((res && res.erro) || "motivo desconhecido") + "." };
    var unid = res.detalhe === "etapa" ? "etapa(s)" : "subetapa(s)";
    var partes = [];
    if (res.sugestoes.length) partes.push(res.sugestoes.length + " tarefa(s) do cronograma entraram no plano desta semana (por " + (res.detalhe === "etapa" ? "etapa" : "subetapa") + ") — gerencie as restrições e comprometa.");
    else partes.push("Nada novo para esta semana: nenhuma " + unid.replace("(s)", "") + " do cronograma cai nela, ou já está no plano.");
    if (res.jaNoPlano) partes.push(res.jaNoPlano + " já estava(m) no plano.");
    res.cobertas.forEach(function (c) {
      partes.push(c.folhas.length + " subetapa(s) de \"" + c.etapa + "\" não entraram porque a etapa inteira já está no plano desta semana — para planejar por subetapa, abra a tarefa \"" + c.etapa + "\", clique em Excluir e puxe de novo.");
    });
    (res.avisos || []).forEach(function (a) { partes.push(a); });
    return { tipo: "ok", msg: partes.join(" ") };
  }

  /* ===== KPI "Previsto × Real" do Last Planner =====
   *
   * ⚠ ESTE NÚMERO SOMAVA MEDIÇÃO PENDENTE. O "real" era a soma do percentual
   * de todo boletim não rejeitado — inclusive o que o fiscal ainda nem olhou.
   * Com uma aprovada de 30% e uma pendente de 55%, o Painel dizia 30% e este
   * KPI, na tela ao lado, 85%. É a divergência que a memória "seis réguas"
   * registra no Painel × Portal; aqui ela sobrevivia. Agora vale a doutrina
   * de `BimAvanco.NAO_CONTA`: rejeitada e pendente não contam; boletim sem
   * status (antigo) conta, porque exigir "aprovada" apagaria histórico.
   * A cópia abaixo é cobrada contra a de bimavanco.js em test-lastplanner.
   *
   * Duas réguas, NUNCA misturadas numa média:
   *   - obra COM linha de base (CronoBase.ativa): previsto da base na data
   *     de corte × executado sobre o orçamento (CronoPlan.confrontoPorNo) —
   *     o KPI se chama "Previsto × Real";
   *   - obra SEM base: o prazo decorrido (linear em `cronogramaMeses` desde
   *     `obra.inicio`) × o medido nos boletins — e o KPI diz isso no nome:
   *     "Medido × prazo linear". Chamar essa conta de "previsto" era vender
   *     uma régua de régua.
   * Obra medida só em valor (boletim sem %): "não sei", fora da média — nunca
   * zero (mesma regra de Gestao._avancoMedido). */
  var NAO_CONTA = { rejeitada: 1, pendente: 1 };
  /* ⚠ A RÉGUA DO "MEDIDO (boletins aprovados)" É A DO CARTÃO DA OBRA
     (revisão 3 da Fase 3, lente dinheiro). Este KPI seguia a NAO_CONTA (lista
     de EXCLUSÃO: boletim sem status conta) e o painel da obra, o palco e o
     cartão seguem `Gestao._avancoMedido` (lista de INCLUSÃO: só aprovada ou
     paga). O MESMO rótulo, "boletins aprovados", com dois números na mesma
     obra: 40% aqui e 10% no painel com um boletim antigo sem status — o
     defeito da memória "conserto que para no segundo consumidor". Enquanto o
     Rogério não decide qual régua vale para a empresa inteira (pendência), o
     LP usa a que o engenheiro já vê no cartão; `test-lastplanner` executa o
     `_avancoMedido` REAL do gestao.js num corpus e exige o mesmo número. Se a
     decisão for a exclusão, ela muda lá e aqui junto (a suíte reprova se não).
     Nenhum boletim → 0; aprovados só em R$ (sem %) → null, "não sei". */
  var CONTA = { aprovada: 1, paga: 1 };

  function medidoBoletins(meds, obraId, num) {
    var soma = 0, algum = false, soValor = false, n = 0;
    arr(meds).forEach(function (m) {
      if (!m || m.obraId !== obraId) return;
      if (CONTA[m.status] !== 1) return;
      n++;
      if (m.percentual != null && m.percentual !== "") { soma += num(m.percentual); algum = true; }
      else if (num(m.valor) > 0) soValor = true;
    });
    if (!n) return 0;
    if (!algum && soValor) return null;
    return Math.round(soma);
  }

  /* ent = { obra, orc, orcPlano?, base?, medicoes, rdosPublicaveis, hoje (Date) }
     deps = { num (Util.num), Cronograma, CronoPlan, Orcamento, Fisico }.
     Devolve null (obra fora: sem orçamento/início, ou sem nada a mostrar) ou
     { nome, fonte:"base"|"linear", prev, real (inteiros, para o gráfico),
       prevPct, realPct, desvio, medido, idp?, baseVersao?, dataCorte?, erro? }. */
  function prevRealObra(ent, deps) {
    deps = deps || {};
    var o = ent && ent.obra, orc = ent && ent.orc;
    var num = deps.num;
    if (!o || !orc || !o.orcamentoId) return null;
    if (typeof num !== "function") return { nome: o.nome || "", erro: "conversor de número (Util.num) não informado." };
    var hoje = ehDataObj(ent.hoje) ? ent.hoje : new Date();
    var medido = medidoBoletins(ent.medicoes, o.id, num);
    var base = ent.base || null;
    if (base) {
      var CP = deps.CronoPlan, C = deps.Cronograma, O = deps.Orcamento, F = deps.Fisico;
      var falha = function (msg) { return { nome: o.nome || "", fonte: "base", baseVersao: base.versao, erro: msg, medido: medido }; };
      if (!CP || !C || !O || !F || typeof O.valoresEAP !== "function" || typeof CP.realizadoPorNo !== "function" ||
          typeof CP.confrontoPorNo !== "function" || typeof F.porServico !== "function") return falha("módulos do planejamento não carregados");
      /* ⚠ base congelada sobre OUTRO orçamento (a obra foi religada pelo
         cadastro): a MESMA regra do painel da obra (CronoPlan.baseVale) — o
         IDP contra etapas que não são as mesmas dava 0 e "atrasada" numa obra
         adiantada. Fica fora da média, com o motivo (nunca cai calada na
         régua linear). `ent.orcamentos` sobe a cadeia de revisões. */
      if (typeof CP.baseVale === "function") {
        var bv = CP.baseVale(base, orc, ent.orcamentos);
        if (!bv.ok) return falha("a linha de base v" + base.versao + " é de outro orçamento (" + (bv.orcNumero || bv.orcamentoId) + ") — reprograme a partir do plano atual");
      }
      try {
        var V = O.valoresEAP(orc);
        if (!V || !V.ok) return falha((V && V.motivo) || "valores de venda indisponíveis");
        var rdos = arr(ent.rdosPublicaveis), ult = "";
        rdos.forEach(function (r) { var d = String((r && r.data) || "").slice(0, 10); if (d > ult) ult = d; });
        /* ⚠ o corte é o ÚLTIMO DIÁRIO PUBLICÁVEL (senão hoje): o previsto
           na data de hoje contra um realizado de semanas atrás diria
           "atrasada" só porque o diário ainda não foi publicado. O realizado
           e o confronto saem com a MESMA data (o confronto recusa se não). */
        var corte = ult || isoLocal(hoje);
        var linhas = F.porServico(rdos, o.id, { ate: corte });
        var real = CP.realizadoPorNo(orc, linhas, { valores: V, dataCorte: corte, opcionaisIncluidos: arr(base.opcionaisIncluidos) });
        if (!real || real.ok === false) return falha((real && real.erro) || "realizado indisponível");
        var ini = o.inicio || (base.cal && base.cal.dataInicio) || null;
        var r = C.estimar(ent.orcPlano || orc, ini ? { dataInicio: ini } : null, { eap: true, valores: V });
        var conf = CP.confrontoPorNo(base, r, real, { dataCorte: corte, hoje: isoLocal(hoje) });
        if (!conf || conf.erro || !conf.totais) return falha((conf && conf.erro) || "confronto indisponível");
        var T = conf.totais;
        if (T.previstoPct == null || T.realPct == null) return falha("a linha de base não tem valor para comparar");
        return { nome: o.nome || "", fonte: "base", baseVersao: base.versao, dataCorte: conf.dataCorte,
          prevPct: T.previstoPct, realPct: T.realPct, prev: Math.round(T.previstoPct), real: Math.round(T.realPct),
          desvio: Math.round((T.realPct - T.previstoPct) * 10) / 10, idp: T.IDP, medido: medido };
      } catch (e) { return falha("falha ao calcular: " + (e && e.message)); }
    }
    if (!o.inicio) return null;
    var meses = parseInt(orc.cronogramaMeses || 6, 10) || 6;
    var ini0 = new Date(String(o.inicio).slice(0, 10) + "T00:00:00");
    if (isNaN(ini0.getTime())) return null;
    var prev = Math.max(0, Math.min(100, ((hoje - ini0) / (30.44 * 86400000)) / meses * 100));
    if (medido === null) return null;                     // só em valor: sem % para comparar
    if (prev <= 0 && medido <= 0) return null;
    /* o número é o do cartão da obra (sem teto: boletins que somam mais de
       100% aparecem como somam); só a BARRA do gráfico é presa em 0..100 */
    return { nome: o.nome || "", fonte: "linear", prevPct: prev, realPct: medido,
      prev: Math.round(prev), real: Math.round(Math.max(0, Math.min(100, medido))), desvio: Math.round(medido) - Math.round(prev), medido: medido };
  }

  function brPts(v) { return (v > 0 ? "+" : "") + (Math.round(v * 10) / 10).toFixed(1).replace(".", ",") + " pts"; }

  /* O cartão do KPI: {titulo, valor, sub, positivo} ou null. Texto puro —
     quem desenha escapa. */
  function kpiPrevReal(dados) {
    var todos = arr(dados);
    var ok = todos.filter(function (d) { return d && !d.erro && d.prev != null && d.real != null; });
    var comBase = ok.filter(function (d) { return d.fonte === "base"; });
    var lin = ok.filter(function (d) { return d.fonte === "linear"; });
    var erros = todos.filter(function (d) { return d && d.erro; });
    /* base: o desvio exato do confronto; linear: a conta de antes, sobre os
       inteiros que o gráfico desenha (a média não muda para quem não tem base) */
    function media(l) {
      return l.reduce(function (s, d) { return s + (d.fonte === "base" ? (d.realPct - d.prevPct) : (d.real - d.prev)); }, 0) / l.length;
    }
    var nErro = erros.length ? " · " + erros.length + " obra(s) com linha de base sem cálculo (" + erros[0].nome + ": " + erros[0].erro + ")" : "";
    if (comBase.length) {
      var dv = media(comBase);
      return { titulo: "Previsto × Real", valor: brPts(dv), positivo: dv >= 0,
        sub: "linha de base · executado × previsto na data, os dois pelo valor de cada subetapa na base · média de " + comBase.length + " obra(s)" +
          (lin.length ? " · " + lin.length + " sem linha de base fora da média" : "") + nErro };
    }
    if (lin.length) {
      var dl = media(lin);
      return { titulo: "Medido × prazo linear", valor: brPts(dl), positivo: dl >= 0,
        sub: "boletins aprovados × prazo decorrido · média de " + lin.length + " obra(s) · sem linha de base" + nErro };
    }
    if (erros.length) return { titulo: "Previsto × Real", valor: "—", positivo: true, sub: nErro.slice(3) };
    return null;
  }

  /* O que cada barra do gráfico diz ao passar o mouse — a régua daquela obra.
     A obra com base mostra também o medido nos boletins, ao lado: "executado
     sobre o orçamento" e "medido" respondem perguntas diferentes, e o
     engenheiro precisa ver os dois antes de o cliente ligar. */
  function brPct(v) { return String(Math.round(v * 10) / 10).replace(".", ",") + "%"; }
  function rotulosPrevReal(d) {
    if (!d) return { prev: "", real: "" };
    if (d.fonte === "base") {
      /* ⚠ O RÓTULO DIZ O QUE O NÚMERO É (revisão 3, lente dinheiro). O real
         daqui é o do confronto — cada subetapa pelo valor da BASE, o mesmo do
         previsto (é o que o IDP compara). Estava debaixo do rótulo "Executado
         sobre o orçamento (diários publicáveis)", que no painel da obra é outro
         número (cada serviço pelo valor de HOJE): depois de uma revisão de
         quantidades, 47,6% aqui e 23,2% no painel com o mesmo nome. Agora o
         texto é o do sub do "Previsto na data" do painel — mesmo número,
         mesmo nome. */
      return { prev: "Previsto na linha de base" + (d.baseVersao ? " v" + d.baseVersao : "") + (d.dataCorte ? " em " + d.dataCorte.split("-").reverse().join("/") : "") + ": " + brPct(d.prevPct),
        real: "Executado na régua da linha de base" + (d.baseVersao ? " v" + d.baseVersao : "") + " (diários publicáveis, cada subetapa pelo valor na base): " + brPct(d.realPct) +
          (d.medido != null ? " · medido nos boletins aprovados: " + brPct(d.medido) : " · medido nos boletins: sem percentual") };
    }
    return { prev: "Prazo decorrido (linear, sem linha de base): " + brPct(d.prevPct), real: "Medido nos boletins aprovados: " + brPct(d.realPct) };
  }
  /* título e subtítulo do cartão do gráfico, pela régua das obras mostradas */
  function legendaPrevReal(dados) {
    var ok = arr(dados).filter(function (d) { return d && !d.erro; });
    var temB = ok.some(function (d) { return d.fonte === "base"; }), temL = ok.some(function (d) { return d.fonte === "linear"; });
    if (temB && temL) return { titulo: "Previsto × Realizado", sub: "Com linha de base: previsto × executado, os dois pelo valor de cada subetapa na base (diários). Sem base: prazo decorrido × medido nos boletins aprovados." };
    if (temB) return { titulo: "Previsto × Realizado", sub: "Previsto da linha de base × executado na régua da base (diários publicáveis), por obra" };
    if (temL) return { titulo: "Medido × prazo linear", sub: "Prazo decorrido (linear) × medido nos boletins aprovados, por obra — sem linha de base" };
    return { titulo: "Previsto × Realizado", sub: "Por obra" };
  }

  /* ===== Quadro Kanban (visão em colunas do MESMO estado LPS) =====
   * Nada de status novo: as colunas DERIVAM de comprometida/status/restrições/
   * semana. Precedência: feito > naofeito > impedida > execucao > (liberada |
   * lookahead por semana). Assim o quadro nunca diverge do PPC. */
  var QUADRO_COLUNAS = [
    { id: "lookahead",  nome: "Lookahead",    desc: "Semanas futuras" },
    { id: "liberada",   nome: "Liberada",     desc: "Livre p/ comprometer" },
    { id: "execucao",   nome: "Em Execução",  desc: "Comprometidas (plano)" },
    { id: "impedida",   nome: "Impedimento",  desc: "Restrição aberta" },
    { id: "naofeito",   nome: "Não cumprida", desc: "Com causa registrada" },
    { id: "feito",      nome: "Concluída",    desc: "Entregue" }
  ];
  function classificarQuadro(t, chaveAtual) {
    if (!t) return "lookahead";
    if (t.status === STATUS.FEITO) return "feito";
    if (t.status === STATUS.NAOFEITO) return "naofeito";
    if (restricoesAbertas(t) > 0) return "impedida";
    if (t.comprometida) return "execucao";
    // livre e não comprometida: separa por semana (futura = lookahead)
    return String(t.semana || "") > String(chaveAtual || "") ? "lookahead" : "liberada";
  }

  /* Mover no quadro = ação LPS real, com as MESMAS travas do módulo.
   * Muta t só quando ok. ctx = { chaveAtual, chaveProxima, causa, hojeISO }.
   * Retorna { ok, msg } ou { ok:false, precisa:"causa"|"restricoes", msg }. */
  function moverQuadro(t, coluna, ctx) {
    if (!t) return { ok: false, msg: "Tarefa não encontrada." };
    ctx = ctx || {};
    var de = classificarQuadro(t, ctx.chaveAtual);
    if (de === coluna) return { ok: false, msg: "" }; // já está lá — nada a fazer
    // Semana JÁ MEDIDA no PPC: mexer em feito/naofeito de semana fechada reescreve
    // histórico (gráfico + Pareto de causas). Só com confirmação explícita da view.
    var historico = (de === "feito" || de === "naofeito") && !!t.semana && String(t.semana) < String(ctx.chaveAtual || "");
    if (historico && !ctx.confirmaHistorico) {
      return { ok: false, precisa: "historico", msg: "Essa tarefa é de semana já medida no PPC — mover reescreve o histórico (gráfico e causas)." };
    }
    // ao sair de "feito", o rastro de conclusão não pode sobrar num afazer
    function limpaConclusao() { delete t.concluidaEm; delete t.concluidaVia; }
    switch (coluna) {
      case "feito":
        // mesma trava do comprometer: restrição aberta se resolve antes, não se atropela
        if (!podeComprometer(t)) return { ok: false, precisa: "restricoes", msg: "Remova as restrições antes de concluir." };
        var foraDoPlano = !t.comprometida;
        t.status = STATUS.FEITO; t.causa = "";
        t.concluidaEm = String(ctx.hojeISO || "").slice(0, 10);
        return { ok: true, msg: foraDoPlano ? "✓ Concluída (fora do PPC — não estava comprometida no plano)." : "✓ Concluída." };
      case "naofeito":
        // não-cumprimento só existe pra quem foi PROMETIDO (senão o Pareto mente sobre o PPC)
        if (!t.comprometida) return { ok: false, msg: "Só tarefa comprometida no plano pode ser marcada como não cumprida — comprometa primeiro (Em Execução)." };
        // registrar não-cumprimento EXIGE causa (melhoria contínua — sem causa não move)
        if (!ctx.causa) return { ok: false, precisa: "causa", msg: "Informe a causa do não-cumprimento." };
        t.status = STATUS.NAOFEITO; t.causa = String(ctx.causa);
        limpaConclusao();
        return { ok: true, msg: "Causa registrada: " + t.causa };
      case "execucao":
        if (!podeComprometer(t)) return { ok: false, precisa: "restricoes", msg: "Remova as restrições antes de comprometer." };
        t.comprometida = true; t.status = STATUS.AFAZER; t.causa = "";
        limpaConclusao();
        // puxa pra semana atual quando estava fora dela (comprometer = plano DESTA semana)
        if (ctx.chaveAtual && t.semana !== ctx.chaveAtual) t.semana = ctx.chaveAtual;
        return { ok: true, msg: "Comprometida no plano da semana." };
      case "liberada":
        // liberar NÃO remove restrição por arrasto — remoção é ato deliberado (modal)
        if (restricoesAbertas(t) > 0) return { ok: false, precisa: "restricoes", msg: "Esta tarefa tem restrição aberta — remova no cartão antes de liberar." };
        t.comprometida = false; t.status = STATUS.AFAZER; t.causa = "";
        limpaConclusao();
        if (ctx.chaveAtual && String(t.semana || "") > String(ctx.chaveAtual)) t.semana = ctx.chaveAtual;
        return { ok: true, msg: de === "execucao" ? "Tirada do plano da semana." : "Liberada p/ comprometer." };
      case "lookahead":
        // valida ANTES de mutar (bloqueio nunca deixa a tarefa meio-movida)
        if (!ctx.chaveProxima) return { ok: false, msg: "Semana de destino indisponível." };
        t.comprometida = false; t.status = STATUS.AFAZER; t.causa = "";
        limpaConclusao();
        // garante semana FUTURA (adiar): se estava na atual/atrás, empurra pra próxima
        if (String(t.semana || "") <= String(ctx.chaveAtual || "")) t.semana = ctx.chaveProxima;
        return { ok: true, msg: "Adiada p/ o lookahead (" + t.semana + ")." };
      case "impedida":
        // arrastar p/ Impedimento cria a restrição explícita (editável no cartão)
        t.restricoes = Array.isArray(t.restricoes) ? t.restricoes : [];
        t.restricoes.push({ id: "r" + (ctx.agora || 0), tipo: "Outros", descricao: String(ctx.motivo || "A classificar (movida no quadro)"), prazo: "", removida: false });
        if (t.status === STATUS.FEITO || t.status === STATUS.NAOFEITO) { t.status = STATUS.AFAZER; t.causa = ""; limpaConclusao(); }
        return { ok: true, msg: "Restrição registrada — detalhe no cartão." };
      default:
        return { ok: false, msg: "Coluna desconhecida." };
    }
  }

  /* Diário (RDO) evidencia execução: marca a tarefa da semana como FEITA.
   * Devolve true se mudou (idempotente: já-feita não re-marca). Puro. */
  function concluirPorRdo(tarefa, dataISO) {
    if (!tarefa || tarefa.status === "feito") return false;
    tarefa.status = "feito";
    tarefa.causa = "";
    tarefa.concluidaVia = "rdo";
    tarefa.concluidaEm = String(dataISO || "").slice(0, 10);
    return true;
  }

  var LastPlanner = {
    CAUSAS: CAUSAS, RESTRICOES: RESTRICOES, STATUS: STATUS,
    segundaDe: segundaDe, chaveSemana: chaveSemana, semanas: semanas,
    tarefasDe: tarefasDe, daSemana: daSemana,
    restricoesAbertas: restricoesAbertas, podeComprometer: podeComprometer,
    ppcSemana: ppcSemana, historicoPPC: historicoPPC, ppcMedio: ppcMedio,
    causasAgregadas: causasAgregadas, restricoesPendentes: restricoesPendentes,
    resumo: resumo,
    QUADRO_COLUNAS: QUADRO_COLUNAS, classificarQuadro: classificarQuadro, moverQuadro: moverQuadro,
    sugerirDoCronograma: sugerirDoCronograma, concluirPorRdo: concluirPorRdo,
    nosDoCronograma: nosDoCronograma, sugerirDoCronogramaNos: sugerirDoCronogramaNos,
    puxarDoCronograma: puxarDoCronograma, textoPuxar: textoPuxar,
    NAO_CONTA: NAO_CONTA, CONTA: CONTA, medidoBoletins: medidoBoletins, prevRealObra: prevRealObra, kpiPrevReal: kpiPrevReal,
    rotulosPrevReal: rotulosPrevReal, legendaPrevReal: legendaPrevReal,
    novo: function (obraId) { return { obraId: obraId || "", tarefas: [] }; }
  };

  global.LastPlanner = LastPlanner;
  if (typeof module !== "undefined" && module.exports) module.exports = LastPlanner;
})(typeof window !== "undefined" ? window : this);
