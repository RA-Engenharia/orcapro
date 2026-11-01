/* =====================================================================
 * prodpremio.js — PRODUTIVIDADE E PRÊMIO POR META (motor puro)
 *
 * Quem paga salário em carteira + PRÊMIO por desempenho medido dia a dia.
 * O prêmio é uma fração do prêmio máximo da função, e a fração sai da
 * produção medida contra uma META por serviço (m³ montados, m² de forro, m
 * de testeira...). A tela mora em js/prodpremioui.js; aqui só há conta.
 *
 * ---------------------------------------------------------------------
 * A CONTA (o roteiro inteiro, para quem for mexer)
 * ---------------------------------------------------------------------
 *   meta/dia do serviço = referência × fatorMeta
 *       referência = menor (pessoas da função na equipe padrão × horasDia ÷ Hh da função por unidade)
 *   "dias-pessoa ganhos" de quem produziu q = q × pessoas da equipe padrão ÷ meta/dia
 *   "dias-pessoa trabalhados" = (horas − horas de apoio) ÷ horasDia
 *   atingimento individual do dia = ganhos ÷ trabalhados
 *   atingimento da obra no dia    = Σ ganhos ÷ Σ trabalhados (todos da obra)
 *   nota do dia = pesoIndividual × individual + pesoObra × obra
 *   valor do dia = fracao(nota)  — gatilho, teto, modo (proporcional | rampa)
 *   prêmio do mês = prêmio máximo × média dos valores dos dias que contam
 *
 * ---------------------------------------------------------------------
 * REGRAS QUE NÃO PODEM SAIR DAQUI PARA A TELA
 * ---------------------------------------------------------------------
 * 1) NENHUM NÚMERO DE NEGÓCIO NASCE AQUI. Salário, prêmio, meta e encargo
 *    chegam como DADO (o JSON de configuração da empresa, fora de js/).
 *    `PADRAO` só traz a régua da conta (gatilho 80, teto 100, 50/50), e o
 *    prêmio máximo nulo vira PENDÊNCIA, nunca R$ 0,00 — zero é uma folha
 *    bonita que paga nada, e ninguém confere o que parece certo.
 *
 * 2) UMA FONTE DE PRODUÇÃO POR OBRA. A mesma metragem pode estar no diário
 *    (RDO, js/producao.js) e no lançamento de equipe desta tela. Somar as
 *    duas pagaria o mesmo m² duas vezes, e nada acusaria. Por isso a obra
 *    escolhe `fonte: "rdo" | "lancamento"` e o motor lê SÓ aquela.
 *
 * 3) SÓ CONTA O QUE ESTÁ APROVADO. Lançamento desta tela: só o estado
 *    `aprovado` (encarregado e depois gestão). Diário: o `Producao.podePagar`
 *    (1º nível); o 2º nível é o fechamento homologado. O que não está
 *    aprovado VOLTA em `pendentes` — sumir com dado é como o erro fica
 *    invisível.
 *
 * 4) DIA SEM LANÇAMENTO NÃO É FALTA. Só conta como zero a falta
 *    INJUSTIFICADA registrada. Dia esquecido pelo gestor não pode tirar
 *    dinheiro de quem trabalhou: ele fica de fora e a tela avisa.
 *
 * 5) LIGAR SERVIÇO DO DIÁRIO À META É POR VÍNCULO EXPLÍCITO, nunca por
 *    semelhança de descrição (skill dinheiro). Serviço sem vínculo vira
 *    pendência "sem meta".
 *
 * 6) DINHEIRO EM CENTAVOS INTEIROS. O prêmio de cada pessoa é arredondado
 *    uma vez, no fim, e o total é a soma dos arredondados (fecha com a folha).
 * ===================================================================== */
(function (global) {
  "use strict";

  var PP = {};

  function arr(x) { return Array.isArray(x) ? x : []; }
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    var s = String(x == null ? "" : x).replace(/[^0-9,.\-]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function numOuNulo(x) { if (x == null || x === "") return null; var n = num(x); return isFinite(n) ? n : null; }
  function r(x, c) { var p = Math.pow(10, c == null ? 2 : c); return Math.round((x + (x >= 0 ? 1e-12 : -1e-12)) * p) / p; }
  function txt(x) { return String(x == null ? "" : x).trim(); }
  PP.num = num;

  /* ------------------------------------------------------------------
   * A RÉGUA DA CONTA (não é número de negócio — ver regra 1)
   * ------------------------------------------------------------------ */
  PP.PADRAO = {
    horasDia: 8.8,                 // 44 h semanais em 5 dias
    horasMesContratuais: 220,      // divisor legal (inclui o DSR)
    regimeEncargos: "sem_desoneracao",
    encargosSociais: null,         // { sem_desoneracao:{mensalista,horista}, com_desoneracao:{...} } — DADO, com fonte
    encargoPremioPct: 0,
    taxaAtingimentoEsperadaPct: 85,
    fatorMeta: 1.25,
    modo: "proporcional",          // proporcional | rampa
    gatilhoPct: 80,
    tetoPct: 100,
    pesoIndividualPct: 50,
    pesoObraPct: 50
  };
  PP.MODOS = { proporcional: "Proporcional com gatilho", rampa: "Rampa (0 no gatilho, cheio na meta)" };
  PP.ESTADOS = {
    rascunho: { rotulo: "Rascunho", conta: false },
    enviado: { rotulo: "Aguardando encarregado", conta: false },
    aprovado_encarregado: { rotulo: "Aguardando gestão", conta: false },
    aprovado: { rotulo: "Aprovado", conta: true },
    devolvido: { rotulo: "Devolvido para correção", conta: false }
  };
  /* o fluxo combinado com o cliente (decisões D1 e C5): todos lançam, o encarregado
     aprova, a gestão aprova; reprovado volta para quem lançou */
  var TRANS = {
    rascunho: { enviar: "enviado" },
    devolvido: { enviar: "enviado" },
    enviado: { aprovar: "aprovado_encarregado", devolver: "devolvido" },
    aprovado_encarregado: { aprovar: "aprovado", devolver: "devolvido" },
    aprovado: { reabrir: "aprovado_encarregado" }
  };
  PP.transicao = function (estado, acao) {
    var t = TRANS[estado || "rascunho"] || {};
    return t[acao] ? { ok: true, estado: t[acao] } : { ok: false, erro: "Não dá para " + acao + " um lançamento " + ((PP.ESTADOS[estado] || {}).rotulo || estado || "sem estado").toLowerCase() + "." };
  };

  PP.parametros = function (p) {
    var o = {}, k, src = p || {};
    for (k in PP.PADRAO) if (Object.prototype.hasOwnProperty.call(PP.PADRAO, k)) o[k] = PP.PADRAO[k];
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k) && src[k] != null && src[k] !== "") o[k] = src[k];
    ["horasDia", "horasMesContratuais", "encargoPremioPct", "taxaAtingimentoEsperadaPct", "fatorMeta", "gatilhoPct", "tetoPct", "pesoIndividualPct", "pesoObraPct"].forEach(function (c) { o[c] = num(o[c]); });
    if (!PP.MODOS[o.modo]) o.modo = "proporcional";
    /* ⚠ TETO NUNCA PASSA DE 100 %: prêmio é fração do máximo da função — teto
       120 pagaria 120 % do prêmio máximo. O gatilho fica abaixo do teto. */
    if (o.gatilhoPct > 99) o.gatilhoPct = 99;
    if (o.gatilhoPct < 0) o.gatilhoPct = 0;
    if (o.tetoPct > 100) o.tetoPct = 100;
    if (o.tetoPct <= o.gatilhoPct) o.tetoPct = Math.min(100, o.gatilhoPct + 1);    // rampa com divisor zero não existe
    if (!(o.horasDia > 0)) o.horasDia = PP.PADRAO.horasDia;
    o.pesoIndividualPct = Math.max(0, Math.min(100, o.pesoIndividualPct));
    o.pesoObraPct = 100 - o.pesoIndividualPct;                      // os dois pesos SEMPRE fecham 100
    return o;
  };

  /* ------------------------------------------------------------------
   * FAIXA DO PRÊMIO
   * ------------------------------------------------------------------ */
  PP.fracao = function (notaPct, par) {
    var p = par && par.gatilhoPct != null ? par : PP.parametros(par);
    var n = num(notaPct), g = p.gatilhoPct, t = p.tetoPct;
    if (p.modo === "rampa") {
      if (n <= g) return 0;
      return Math.min(1, (Math.min(n, t) - g) / (t - g));
    }
    if (n < g) return 0;
    return Math.min(1, Math.min(n, t) / 100);        // a fração nunca passa de 1
  };

  /* ------------------------------------------------------------------
   * CUSTO DA FUNÇÃO (o mesmo da planilha parametros_equipe)
   * ------------------------------------------------------------------ */
  PP.encargosAtivos = function (par) {
    var p = PP.parametros(par), es = p.encargosSociais || {}, reg = es[p.regimeEncargos] || null;
    if (!reg || numOuNulo(reg.mensalista) == null || numOuNulo(reg.horista) == null) return null;
    return { mensalista: num(reg.mensalista), horista: num(reg.horista) };
  };
  /* horas produtivas equivalentes: a equivalência que a SINAPI usa entre o
     insumo mensalista e o horista. 220 h incluiria o DSR e daria custo/h
     menor que o real. */
  PP.horasProdutivas = function (par) {
    var p = PP.parametros(par), e = PP.encargosAtivos(p);
    if (!e) return null;
    return p.horasMesContratuais * (1 + e.mensalista / 100) / (1 + e.horista / 100);
  };
  function somaCompl(c) {
    if (c == null) return 0;
    if (typeof c === "number") return c;
    var s = 0, k;
    for (k in c) if (Object.prototype.hasOwnProperty.call(c, k)) s += num(c[k] && typeof c[k] === "object" ? c[k].valor : c[k]);
    return s;
  }
  PP.custoFuncao = function (f, par, fracPremio) {
    var p = PP.parametros(par), e = PP.encargosAtivos(p), H = PP.horasProdutivas(p), pend = [];
    var sal = numOuNulo(f && f.salarioCarteira), pm = numOuNulo(f && f.premioMax);
    if (!e) pend.push("encargos sociais sem fonte (parâmetro vazio)");
    if (sal == null) pend.push("salário em carteira vazio");
    if (pm == null) pend.push("prêmio máximo vazio");
    if (pend.length) return { ok: false, pendencias: pend };
    var fr = fracPremio == null ? 1 : fracPremio;
    var salEnc = sal * (1 + e.mensalista / 100), compl = somaCompl(f.complementares);
    var premio = pm * fr * (1 + p.encargoPremioPct / 100);
    var mes = salEnc + premio + num(f.valeAlimentacao) + compl + num(f.deslocamentoHospedagem);
    return { ok: true, salarioComEncargos: r(salEnc), complementares: r(compl), premio: r(premio), mes: r(mes), hora: r(mes / H), hora220: r(mes / p.horasMesContratuais), horasProdutivas: r(H) };
  };
  PP.custosDaEquipe = function (cfg) {
    var p = PP.parametros(cfg && cfg.parametros), fe = PP.fracao(p.taxaAtingimentoEsperadaPct, p);
    return arr(cfg && cfg.funcoes).map(function (f) {
      return { id: f.id, nome: f.nome, meta: PP.custoFuncao(f, p, 1), esperado: PP.custoFuncao(f, p, fe), fracaoEsperada: fe };
    });
  };

  /* ------------------------------------------------------------------
   * METAS
   * ------------------------------------------------------------------ */
  function mapa(lista) { var m = {}; arr(lista).forEach(function (x) { if (x && x.id != null) m[String(x.id)] = x; }); return m; }
  PP.pessoasPadrao = function (equipe) {
    var c = (equipe && equipe.composicao) || {}, n = 0, k;
    for (k in c) if (Object.prototype.hasOwnProperty.call(c, k)) n += num(c[k]);
    return n;
  };
  PP.metaServico = function (serv, cfg) {
    var p = PP.parametros(cfg && cfg.parametros), eqs = mapa(cfg && cfg.equipes), eq = eqs[String(serv && serv.equipePadrao)];
    var N = PP.pessoasPadrao(eq), hh = (serv && serv.hhRefPorUnidade) || {}, ref = null, k;
    if (eq) {
      var c = eq.composicao || {};
      for (k in hh) {
        if (!Object.prototype.hasOwnProperty.call(hh, k)) continue;
        var h = num(hh[k]), n = num(c[k]);
        if (h > 0 && n > 0) { var v = n * p.horasDia / h; if (ref == null || v < ref) ref = v; }
      }
    }
    var manual = numOuNulo(serv && serv.metaDiaManual);
    var meta = manual != null && manual > 0 ? manual : (ref != null ? ref * p.fatorMeta : null);
    return { servicoId: serv && serv.id, referenciaDia: ref == null ? null : r(ref, 3), metaDia: meta == null ? null : r(meta, 3), pessoasPadrao: N, manual: manual != null && manual > 0,
      pendencia: meta == null ? "sem meta (falta Hh da referência ou equipe padrão)" : (!N ? "equipe padrão sem pessoas" : null) };
  };
  PP.metas = function (cfg) {
    var out = {};
    arr(cfg && cfg.servicos).forEach(function (s) { out[String(s.id)] = PP.metaServico(s, cfg); });
    return out;
  };

  /* ------------------------------------------------------------------
   * DE ONDE VEM O DIA DE CADA PESSOA
   *   apontamento = { data, obraId, colaboradorId, horas, apoio, itens:[{servicoId,qtd}],
   *                   retrabalho, semEpi, falta: null|"injustificada"|"justificada", origem }
   * ------------------------------------------------------------------ */

  /* lançamento de EQUIPE desta tela → um apontamento por pessoa.
     A produção da equipe se divide pelas horas trabalhadas de cada um: quem
     ficou meio dia leva metade — e o atingimento individual de todos da
     equipe sai igual ao da equipe, que é o que se mediu. */
  PP.apontamentosDoLancamento = function (l, par, ocorrencias) {
    var p = PP.parametros(par), out = [];
    if (!l) return out;
    var membros = arr(l.membros).filter(function (m) { return m && m.colaboradorId; });
    /* ⚠ FALTA E APOIO POR OCORRÊNCIA ENTRAM ANTES DA DIVISÃO. Se entrassem
       depois (aplicarOcorrencias), a produção já teria sido dividida como se o
       faltoso tivesse trabalhado: o colega ficaria com metade e seria punido
       pela falta dele. Os dois caminhos (falta marcada no lançamento ou por
       ocorrência aprovada) têm de dar o mesmo resultado. A ocorrência usada
       aqui fica marcada em `_ocs`, e o aplicarOcorrencias não a soma de novo
       (apoio somaria duas vezes). */
    var usadas = {};
    membros = membros.map(function (m) {
      var c = {}, k; for (k in m) if (Object.prototype.hasOwnProperty.call(m, k)) c[k] = m[k];
      arr(ocorrencias).forEach(function (oc) {
        if (!oc || String(oc.colaboradorId) !== String(c.colaboradorId) || txt(oc.data) !== txt(l.data) || txt(oc.obraId) !== txt(l.obraId)) return;
        if (oc.tipo === "falta_injustificada") { c.falta = "injustificada"; (usadas[c.colaboradorId] = usadas[c.colaboradorId] || []).push(oc); }
        else if (oc.tipo === "falta_justificada") { c.falta = "justificada"; (usadas[c.colaboradorId] = usadas[c.colaboradorId] || []).push(oc); }
        else if (oc.tipo === "apoio") { c.apoio = num(c.apoio) + num(oc.horas); (usadas[c.colaboradorId] = usadas[c.colaboradorId] || []).push(oc); }
      });
      return c;
    });
    var trab = membros.map(function (m) {
      if (m.falta) return 0;
      var h = m.horas == null || m.horas === "" ? p.horasDia : num(m.horas);
      return Math.max(0, h - num(m.apoio));
    });
    var tot = trab.reduce(function (s, v) { return s + v; }, 0);
    var semEpi = {}; arr(l.semEpi).forEach(function (id) { semEpi[String(id)] = 1; });
    membros.forEach(function (m, i) {
      var parte = tot > 0 ? trab[i] / tot : 0;
      out.push({
        data: txt(l.data), obraId: txt(l.obraId), colaboradorId: String(m.colaboradorId), equipeId: txt(l.equipeId),
        horas: m.horas == null || m.horas === "" ? p.horasDia : num(m.horas), apoio: num(m.apoio),
        falta: m.falta || null, retrabalho: !!l.retrabalho, semEpi: !!semEpi[String(m.colaboradorId)],
        itens: m.falta ? [] : arr(l.itens).filter(function (it) { return it && it.servicoId && num(it.qtd) > 0; })
          .map(function (it) { return { servicoId: String(it.servicoId), qtd: num(it.qtd) * parte }; }),
        origem: "lanc:" + (l.id || "") + ":" + m.colaboradorId, _ocs: usadas[m.colaboradorId] || []
      });
    });
    return out;
  };

  /* mesma identidade do js/producao.js (Producao.identidadeServico): o
     vínculo diário→meta usa a chave que a Produção já usa para preço */
  PP.identidadeItemRdo = function (rdo, it) {
    var x = it || {};
    if (x.codigo) return "b:" + String(x.codigo);
    if (x.refId) return "r:" + String((rdo && rdo.obraId) || "") + ":" + String(x.refId);
    return "d:" + String((rdo && rdo.obraId) || "") + ":" + String(x.descricao || x.numero || "");
  };
  function podePagarRdo(r) {
    if (global.Producao && global.Producao.podePagar) return global.Producao.podePagar(r);
    var e = String((r && r.estado) || "");
    if (e) return ["aprovado", "publicado", "publicado_legado", "finalizado_legado"].indexOf(e) > -1;
    var s = String((r && r.status) || "");
    return s === "finalizado" || s === "publicado";
  }
  /* diário → apontamentos. `vinculos` = { identidade: servicoId }. */
  PP.apontamentosDoRdo = function (rdos, vinculos, opcoes) {
    var o = opcoes || {}, p = PP.parametros(o.parametros), v = vinculos || {}, porPessoaDia = {}, aps = [], pendentes = [], semVinculo = {};
    arr(rdos).forEach(function (rd) {
      if (!rd) return;
      if (o.obraId && rd.obraId !== o.obraId) return;
      var d = txt(rd.data);
      if (o.de && d && d < o.de) return;
      if (o.ate && d && d > o.ate) return;
      var pag = podePagarRdo(rd);
      arr(rd.atividadesItens).forEach(function (it) {
        arr(it && it.producao).forEach(function (pr) {
          if (!pr || !pr.colaboradorId || !(num(pr.qtd) > 0)) return;
          var idt = PP.identidadeItemRdo(rd, it), sid = v[idt];
          var base = { data: d, obraId: rd.obraId || "", colaboradorId: String(pr.colaboradorId), nome: pr.nome || "", servico: it.descricao || "", unidade: it.unidade || "", qtd: num(pr.qtd), identidade: idt, rdoId: rd.id };
          if (!pag) { pendentes.push(base); return; }
          if (!sid) { semVinculo[idt] = semVinculo[idt] || { identidade: idt, servico: it.descricao || "", unidade: it.unidade || "", qtd: 0 }; semVinculo[idt].qtd = r(semVinculo[idt].qtd + base.qtd, 3); return; }
          var k = base.obraId + "|" + d + "|" + base.colaboradorId;
          if (!porPessoaDia[k]) { porPessoaDia[k] = { data: d, obraId: base.obraId, colaboradorId: base.colaboradorId, horas: p.horasDia, apoio: 0, falta: null, retrabalho: false, semEpi: false, itens: [], origem: "rdo:" + rd.id + ":" + base.colaboradorId }; aps.push(porPessoaDia[k]); }
          porPessoaDia[k].itens.push({ servicoId: String(sid), qtd: base.qtd });
        });
      });
    });
    return { apontamentos: aps, pendentes: pendentes, semVinculo: Object.keys(semVinculo).map(function (k) { return semVinculo[k]; }) };
  };

  /* ⚠ OCORRÊNCIA SÓ VALE COM APROVADOR DA GESTÃO, EM TODOS OS TIPOS. Falta,
     apoio, retrabalho e EPI mexem direto no dinheiro de quem trabalhou; quem
     registra (autor) não é quem valida (aprovadoPor). O que não está aprovado
     NÃO entra no cálculo — e a tela mostra como "aguardando gestão". */
  PP.ocorrenciaAprovada = function (oc) { return !!(oc && txt(oc.aprovadoPor)); };
  PP.ocorrenciasAprovadas = function (ocs) { return arr(ocs).filter(PP.ocorrenciaAprovada); };

  /* ocorrências do gestor (retrabalho, EPI, falta, apoio) por cima dos
     apontamentos — é assim que o gate chega à produção que veio do diário */
  PP.aplicarOcorrencias = function (aps, ocorrencias) {
    var idx = {}, out = arr(aps).slice();
    out.forEach(function (a) { idx[a.obraId + "|" + a.data + "|" + a.colaboradorId] = a; });
    arr(ocorrencias).forEach(function (oc) {
      if (!oc || !oc.colaboradorId || !oc.data) return;
      var k = (oc.obraId || "") + "|" + oc.data + "|" + oc.colaboradorId, a = idx[k];
      if (a && arr(a._ocs).indexOf(oc) > -1) return;      // já entrou antes da divisão (apontamentosDoLancamento)
      if (!a) {
        /* falta e presença sem produção (o encarregado) também são dias */
        if (oc.tipo !== "falta_injustificada" && oc.tipo !== "falta_justificada" && oc.tipo !== "presenca") return;
        a = { data: oc.data, obraId: oc.obraId || "", colaboradorId: String(oc.colaboradorId), horas: null, apoio: 0, falta: null, retrabalho: false, semEpi: false, itens: [], origem: "oc" };
        idx[k] = a; out.push(a);
      }
      if (oc.tipo === "retrabalho") a.retrabalho = true;
      else if (oc.tipo === "sem_epi") a.semEpi = true;
      else if (oc.tipo === "falta_injustificada") a.falta = "injustificada";
      else if (oc.tipo === "falta_justificada") a.falta = "justificada";
      else if (oc.tipo === "apoio") a.apoio = num(a.apoio) + num(oc.horas);
    });
    return out;
  };

  /* ------------------------------------------------------------------
   * APURAÇÃO DO MÊS
   * entrada = { config, apontamentos, diasSemFrente:[{obraId,data}], obraId, de, ate }
   * ------------------------------------------------------------------ */
  function nucleo(e) {
    var cfg = e.config || {}, p = PP.parametros(cfg.parametros), metas = PP.metas(cfg);
    var colabs = mapa(cfg.colaboradores), funcs = mapa(cfg.funcoes), eqs = mapa(cfg.equipes), servs = mapa(cfg.servicos);
    var semFrente = {}; arr(e.diasSemFrente).forEach(function (x) { if (x) semFrente[(x.obraId || "") + "|" + x.data] = 1; });
    var pend = [], dias = {}, porObraDia = {}, progresso = {};
    function pendencia(t) { if (pend.indexOf(t) < 0) pend.push(t); }

    /* 1) cada apontamento vira ganhos e trabalhados */
    var linhas = [];
    arr(e.apontamentos).forEach(function (a) {
      if (!a || !a.colaboradorId || !a.data) return;
      if (e.obraId && a.obraId !== e.obraId) return;
      if (e.de && a.data < e.de) return;
      if (e.ate && a.data > e.ate) return;
      var horas = a.horas == null ? p.horasDia : num(a.horas);
      var trab = a.falta ? 0 : Math.max(0, horas - num(a.apoio)) / p.horasDia, ganho = 0;
      arr(a.itens).forEach(function (it) {
        var m = metas[String(it.servicoId)], s = servs[String(it.servicoId)];
        if (!s) { pendencia("Serviço \"" + it.servicoId + "\" lançado mas não cadastrado nas metas."); return; }
        if (!m || !m.metaDia || !m.pessoasPadrao) { pendencia("Serviço \"" + (s.nome || s.id) + "\" sem meta: a produção dele não entra na conta."); return; }
        ganho += num(it.qtd) * m.pessoasPadrao / m.metaDia;
        var pg = progresso[s.id] || (progresso[s.id] = { servicoId: s.id, nome: s.nome || s.id, unidade: s.unidade || "", feito: 0, total: numOuNulo(s.qtdObra) });
        pg.feito += num(it.qtd);
      });
      var L = { a: a, trab: trab, ganho: ganho, semFrente: !!semFrente[(a.obraId || "") + "|" + a.data] };
      linhas.push(L);
      /* ⚠ quem não produz por função (o encarregado: peso individual 0) não
         entra na média da obra — o dia inteiro dele sem m² diluiria o
         atingimento de todo mundo e derrubaria o prêmio da equipe */
      var fc = funcs[(colabs[a.colaboradorId] || {}).funcaoId];
      var naoProduz = fc && numOuNulo(fc.pesoIndividualPct) === 0;
      if (!L.semFrente && !a.falta && !naoProduz) {
        var ko = (a.obraId || "") + "|" + a.data, od = porObraDia[ko] || (porObraDia[ko] = { ganho: 0, trab: 0 });
        od.ganho += ganho; od.trab += trab;
      }
    });

    /* 2) nota e valor de cada pessoa-dia */
    linhas.forEach(function (L) {
      var a = L.a, c = colabs[a.colaboradorId] || {}, f = funcs[c.funcaoId] || null;
      var pInd = f && numOuNulo(f.pesoIndividualPct) != null ? Math.max(0, Math.min(100, num(f.pesoIndividualPct))) : p.pesoIndividualPct;
      var k = a.colaboradorId, P = dias[k] || (dias[k] = { colaboradorId: k, nome: c.nome || a.nome || k, funcaoId: c.funcaoId || "", equipeId: c.equipeId || a.equipeId || "", dias: [], ganho: 0, trab: 0 });
      var od = porObraDia[(a.obraId || "") + "|" + a.data] || { ganho: 0, trab: 0 };
      var obraPct = od.trab > 0 ? 100 * od.ganho / od.trab : null;
      var indPct = L.trab > 0 ? 100 * L.ganho / L.trab : null;
      var dia = { data: a.data, obraId: a.obraId, individualPct: indPct == null ? null : r(indPct, 1), obraPct: obraPct == null ? null : r(obraPct, 1), conta: true, motivo: "", notaPct: null, valor: 0 };
      if (L.semFrente) { dia.conta = false; dia.motivo = "sem frente (chuva/impedimento)"; }
      else if (a.falta === "justificada") { dia.conta = false; dia.motivo = "falta justificada"; }
      else if (a.falta === "injustificada") { dia.motivo = "falta injustificada"; dia.notaPct = 0; }
      else if (a.retrabalho) { dia.motivo = "retrabalho (portão)"; dia.notaPct = 0; }
      else if (a.semEpi) { dia.motivo = "sem EPI (portão)"; dia.notaPct = 0; }
      else if (L.trab <= 0) { dia.conta = false; dia.motivo = "dia só de apoio"; }
      else if (obraPct == null) { dia.conta = false; dia.motivo = "obra sem produção medida no dia"; }
      else {
        var nota = (pInd / 100) * (indPct || 0) + (1 - pInd / 100) * obraPct;
        dia.notaPct = r(nota, 2);
        dia.valor = PP.fracao(nota, p);
      }
      P.dias.push(dia);
      if (dia.conta && !a.falta) { P.ganho += L.ganho; P.trab += L.trab; }
    });

    /* 3) o mês de cada pessoa — prêmio em centavos, arredondado uma vez */
    var pessoas = Object.keys(dias).map(function (k) { return dias[k]; });
    pessoas.forEach(function (P) {
      P.dias.sort(function (x, y) { return x.data < y.data ? -1 : x.data > y.data ? 1 : 0; });
      var cont = P.dias.filter(function (d) { return d.conta; });
      var soma = cont.reduce(function (s, d) { return s + d.valor; }, 0);
      P.diasQueContam = cont.length;
      P.fracaoMes = cont.length ? soma / cont.length : 0;
      P.atingimentoPct = P.trab > 0 ? r(100 * P.ganho / P.trab, 1) : null;
      var f = funcs[P.funcaoId];
      if (!f) { P.pendencia = "pessoa sem função cadastrada"; P.premioCent = null; pendencia(P.nome + ": sem função cadastrada no módulo — prêmio não apurado."); }
      else if (numOuNulo(f.premioMax) == null) { P.pendencia = "função sem prêmio máximo"; P.premioCent = null; pendencia("Função " + (f.nome || f.id) + " sem prêmio máximo — prêmio não apurado."); }
      else { P.premioCent = Math.round(num(f.premioMax) * 100 * P.fracaoMes); P.salarioCarteira = numOuNulo(f.salarioCarteira); P.premioMax = num(f.premioMax); P.funcaoNome = f.nome || f.id; }
      P.premio = P.premioCent == null ? null : P.premioCent / 100;
      P.fracaoMes = r(P.fracaoMes, 4);
      P.sequencia = (function () { var best = 0, cur = 0; P.dias.forEach(function (d) { if (!d.conta) return; if (d.notaPct != null && d.notaPct >= 100) { cur++; if (cur > best) best = cur; } else cur = 0; }); return best; })();
      P.semPortao = !P.dias.some(function (d) { return /portão/.test(d.motivo); });
    });
    pessoas.sort(function (x, y) { return (y.fracaoMes - x.fracaoMes) || String(x.nome).localeCompare(String(y.nome)); });

    /* 4) ranking por EQUIPE, nunca por pessoa (regra do painel) */
    var porEq = {};
    pessoas.forEach(function (P) {
      var id = P.equipeId || "(sem equipe)", q = porEq[id] || (porEq[id] = { equipeId: id, nome: (eqs[id] && eqs[id].nome) || id, ganho: 0, trab: 0, pessoas: 0, semPortao: true });
      q.ganho += P.ganho; q.trab += P.trab; q.pessoas++; if (!P.semPortao) q.semPortao = false;
    });
    var ranking = Object.keys(porEq).map(function (k) { var q = porEq[k]; q.atingimentoPct = q.trab > 0 ? r(100 * q.ganho / q.trab, 1) : null; delete q.ganho; delete q.trab; return q; })
      .sort(function (x, y) { return (y.atingimentoPct || 0) - (x.atingimentoPct || 0); });

    var obraTot = Object.keys(porObraDia).reduce(function (s, k) { s.g += porObraDia[k].ganho; s.t += porObraDia[k].trab; return s; }, { g: 0, t: 0 });
    var totalCent = pessoas.reduce(function (s, P) { return s + (P.premioCent || 0); }, 0);
    return {
      parametros: p, metas: metas, pessoas: pessoas, ranking: ranking,
      progresso: Object.keys(progresso).map(function (k) { var g = progresso[k]; g.feito = r(g.feito, 3); g.pct = g.total ? r(100 * g.feito / g.total, 1) : null; return g; }),
      atingimentoObraPct: obraTot.t > 0 ? r(100 * obraTot.g / obraTot.t, 1) : null,
      totalPremioCent: totalCent, totalPremio: totalCent / 100,
      pendencias: pend
    };
  }
  /* ⚠ TETO POR PESSOA NO MÊS, NÃO POR OBRA. A pessoa que trabalhou em duas
     obras tem UMA fração do mês (todos os dias dela, em todas as obras, cada
     obra com a sua fonte) e UM prêmio P = máximo × fração. Na obra X ela leva
     P × (dias que contam em X ÷ dias que contam no mês). Calcular obra por
     obra pagaria o máximo duas vezes. Quem chama deve passar os apontamentos
     de TODAS as obras do mês; `obraId` só recorta o que se mostra. */
  PP.apurar = function (e) {
    var res = nucleo(e);
    if (!e.obraId) return res;
    var largo = {}, k; for (k in e) if (Object.prototype.hasOwnProperty.call(e, k)) largo[k] = e[k];
    delete largo.obraId;
    var W = {}; nucleo(largo).pessoas.forEach(function (P) { W[P.colaboradorId] = P; });
    res.pessoas.forEach(function (P) {
      var w = W[P.colaboradorId]; if (!w) return;
      P.fracaoObra = P.fracaoMes; P.diasNoMes = w.diasQueContam; P.fracaoMes = w.fracaoMes;
      if (P.premioCent != null && w.premioCent != null) {
        P.premioMesCent = w.premioCent;
        P.premioCent = w.diasQueContam ? Math.round(w.premioCent * P.diasQueContam / w.diasQueContam) : 0;
        P.premio = P.premioCent / 100;
      }
    });
    res.pessoas.sort(function (x, y) { return (y.fracaoMes - x.fracaoMes) || String(x.nome).localeCompare(String(y.nome)); });
    res.totalPremioCent = res.pessoas.reduce(function (s, P) { return s + (P.premioCent || 0); }, 0);
    res.totalPremio = res.totalPremioCent / 100;
    return res;
  };

  /* ------------------------------------------------------------------
   * FECHAMENTO E FOLHA
   * id determinístico por obra × competência: dois aparelhos offline não
   * criam dois fechamentos do mesmo mês (mesma régua do estorno).
   * ------------------------------------------------------------------ */
  PP.idFechamento = function (obraId, competencia) { return "ppf_" + String(obraId || "todas") + "_" + String(competencia || ""); };
  PP.periodoDe = function (comp) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(comp || ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2], ult = new Date(y, mo, 0).getDate();
    return { de: m[1] + "-" + m[2] + "-01", ate: m[1] + "-" + m[2] + "-" + (ult < 10 ? "0" : "") + ult };
  };
  PP.RUBRICA = "Prêmio por desempenho (CLT art. 457 §4º)";
  PP.linhasFolha = function (apur) {
    return arr(apur && apur.pessoas).map(function (P) {
      return { colaboradorId: P.colaboradorId, nome: P.nome, funcao: P.funcaoNome || P.funcaoId || "", salarioCarteira: P.salarioCarteira == null ? null : P.salarioCarteira,
        diasQueContam: P.diasQueContam, atingimentoPct: P.atingimentoPct, fracaoPct: r(100 * P.fracaoMes, 2), premio: P.premio, premioCent: P.premioCent == null ? null : P.premioCent,
        tetoCent: P.premioMax == null ? null : Math.round(P.premioMax * 100), rubrica: PP.RUBRICA, pendencia: P.pendencia || "" };
    });
  };
  /* ⚠ `;` e aspas protegidos (a planilha trocaria de coluna) e fórmula
     neutralizada: texto que começa com = + - @ vira texto com apóstrofo */
  function csvCampo(v) {
    var s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function br(v, c) { return v == null ? "" : r(v, c == null ? 2 : c).toFixed(c == null ? 2 : c).replace(".", ","); }
  /* o CSV sai de LINHAS (as da conta de hoje ou as congeladas do fechamento):
     um só caminho de escrita, um só lugar para proteger campo */
  PP.csvLinhas = function (linhas, totalCent, meta) {
    var m = meta || {}, L = ["Competência;" + csvCampo(m.competencia || ""), "Obra;" + csvCampo(m.obra || ""), ""];
    L.push("Colaborador;Função;Salário em carteira;Dias que contam;Atingimento (%);Fração do prêmio (%);Prêmio (R$);Rubrica;Pendência");
    arr(linhas).forEach(function (x) {
      L.push([csvCampo(x.nome), csvCampo(x.funcao), br(x.salarioCarteira), x.diasQueContam, br(x.atingimentoPct, 1), br(x.fracaoPct), br(x.premio), csvCampo(x.rubrica), csvCampo(x.pendencia)].join(";"));
    });
    L.push(";;;;;Total;" + br((totalCent || 0) / 100) + ";;");
    return "﻿" + L.join("\r\n");
  };
  PP.csvFolha = function (apur, meta) {
    return PP.csvLinhas(PP.linhasFolha(apur), apur ? (apur.totalPremioCent != null ? apur.totalPremioCent : Math.round(100 * (apur.totalPremio || 0))) : 0, meta);
  };

  /* ------------------------------------------------------------------
   * TETO MENSAL DA PESSOA NO FECHAMENTO
   * A mesma pessoa pode estar em fechamentos de várias obras no mesmo mês
   * (cada um homologado por si, em momentos diferentes). Antes de gravar, a
   * soma do que ela já tem homologado nas OUTRAS obras + o desta não passa do
   * máximo da função: corta no que sobrar e diz por quê na própria linha.
   * `outros` = fechamentos homologados do mesmo mês em outras obras.
   * ------------------------------------------------------------------ */
  PP.limitarAoTeto = function (linhas, outros) {
    var ja = {};
    arr(outros).forEach(function (f) {
      if (!f || f.estado !== "homologado") return;
      arr(f.linhas).forEach(function (x) {
        if (!x || x.colaboradorId == null) return;
        ja[x.colaboradorId] = (ja[x.colaboradorId] || 0) + (x.premioCent != null ? num(x.premioCent) : Math.round(100 * num(x.premio)));
      });
    });
    var cortes = [];
    var out = arr(linhas).map(function (x) {
      var y = {}, k; for (k in x) if (Object.prototype.hasOwnProperty.call(x, k)) y[k] = x[k];
      var antes = ja[y.colaboradorId] || 0;
      if (y.premioCent == null || y.tetoCent == null) return y;
      var pode = Math.max(0, y.tetoCent - antes);
      if (y.premioCent > pode) {
        var motivo = "cortado no teto mensal da pessoa (já homologado em outras obras: R$ " + (antes / 100).toFixed(2).replace(".", ",") + " de R$ " + (y.tetoCent / 100).toFixed(2).replace(".", ",") + ")";
        cortes.push({ colaboradorId: y.colaboradorId, nome: y.nome, de: y.premioCent, para: pode, motivo: motivo });
        y.premioCentAntes = y.premioCent; y.premioCent = pode; y.premio = pode / 100; y.corteTeto = motivo;
        y.pendencia = (y.pendencia ? y.pendencia + "; " : "") + motivo;
      }
      return y;
    });
    return { linhas: out, totalCent: out.reduce(function (s, x) { return s + (x.premioCent || 0); }, 0), cortes: cortes };
  };

  /* ------------------------------------------------------------------
   * HOMOLOGAR E REABRIR, COM HISTÓRICO
   * `historico` é uma LISTA DE OBJETOS ({acao, por, em, ...}) — nunca lista
   * dentro de lista, que o Firestore recusa. Reabrir não apaga nada: as
   * linhas congeladas ficam, e o histórico só cresce.
   * ------------------------------------------------------------------ */
  function copia(o) { var c = {}, k; for (k in (o || {})) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }
  PP.homologarFechamento = function (atual, d) {
    if (atual && atual.estado === "homologado")
      return { ok: false, erro: "Este mês já está homologado" + (atual.homologadoPor ? " por " + atual.homologadoPor : "") + " (talvez em outro aparelho). Atualize a tela; para alterar, reabra o mês." };
    var f = copia(atual);
    f.id = PP.idFechamento(d.obraId, d.competencia); f.obraId = d.obraId; f.competencia = d.competencia; f.estado = "homologado";
    f.linhas = arr(d.linhas); f.totalCent = d.totalCent; f.parametros = d.parametros;
    f.homologadoPor = d.por || ""; f.homologadoEm = d.em || "";
    f.historico = arr(atual && atual.historico).concat([{ acao: "homologar", por: d.por || "", em: d.em || "", totalCent: d.totalCent, pessoas: f.linhas.length }]);
    return { ok: true, f: f };
  };
  PP.reabrirFechamento = function (atual, por, em) {
    if (!atual || atual.estado !== "homologado") return { ok: false, erro: "Só se reabre um mês homologado." };
    var f = copia(atual);
    f.estado = "reaberto"; f.reabertoPor = por || ""; f.reabertoEm = em || "";
    f.historico = arr(atual.historico).concat([{ acao: "reabrir", por: por || "", em: em || "", totalCent: atual.totalCent, pessoas: arr(atual.linhas).length }]);
    return { ok: true, f: f };
  };
  /* mês homologado trava lançamento, aprovação, ocorrência e fonte daquela
     obra/mês — a porta é reabrir (só gestão). Devolve o fechamento que trava. */
  PP.mesHomologado = function (fechamentos, obraId, competencia) {
    var out = null;
    arr(fechamentos).forEach(function (f) { if (f && f.estado === "homologado" && f.obraId === obraId && f.competencia === competencia) out = f; });
    return out;
  };
  PP.MSG_MES_TRAVADO = "Este mês está homologado para esta obra. Reabra o mês (aba Fechamento, só a gestão) para alterar.";

  /* um lançamento ativo por obra + equipe + data: dois somariam a mesma
     produção duas vezes */
  PP.lancamentoDuplicado = function (lancs, novo) {
    var achou = null;
    arr(lancs).forEach(function (l) {
      if (!achou && l && novo && l.id !== novo.id && l.obraId === novo.obraId && l.equipeId === novo.equipeId && l.data === novo.data) achou = l;
    });
    return achou;
  };
  PP.horasValidas = function (h) { return h == null || (isFinite(h) && h >= 0 && h <= 24); };

  /* ------------------------------------------------------------------
   * CONFIGURAÇÃO IMPORTADA — só entram os campos conhecidos (o arquivo vem
   * de fora; o que não é do formato não vai para o armazenamento) e as chaves
   * perigosas de objeto são cortadas em qualquer profundidade.
   * ------------------------------------------------------------------ */
  var CAMPOS_CFG = ["schema", "geradoEm", "empresa", "obra", "aviso", "parametros", "funcoes", "equipes", "obras", "colaboradores", "colaboradoresObs", "servicos", "foraDaEquipe", "exemploMes", "vinculos"];
  function limpar(v, nivel) {
    if (nivel > 8) return null;
    if (Array.isArray(v)) return v.map(function (x) { return limpar(x, nivel + 1); });
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) { if (k === "__proto__" || k === "constructor" || k === "prototype") return; o[k] = limpar(v[k], nivel + 1); });
      return o;
    }
    return v;
  }
  PP.filtrarConfig = function (cfg) {
    var out = {};
    if (!cfg || typeof cfg !== "object") return out;
    CAMPOS_CFG.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(cfg, k)) out[k] = limpar(cfg[k], 0); });
    return out;
  };

  /* ------------------------------------------------------------------
   * CONFIGURAÇÃO IMPORTADA (orcapro.prodpremio.v1)
   * Confere o formato e devolve o que falta — não grava nada.
   * ------------------------------------------------------------------ */
  PP.validarConfig = function (cfg) {
    var erros = [], avisos = [];
    if (!cfg || typeof cfg !== "object") return { ok: false, erros: ["Arquivo vazio ou não é JSON."], avisos: [] };
    if (cfg.schema && cfg.schema !== "orcapro.prodpremio.v1") erros.push("Formato " + cfg.schema + " não reconhecido (esperado orcapro.prodpremio.v1).");
    if (!arr(cfg.funcoes).length) erros.push("Nenhuma função cadastrada.");
    if (!arr(cfg.equipes).length) erros.push("Nenhuma equipe cadastrada.");
    if (!arr(cfg.servicos).length) erros.push("Nenhum serviço com meta.");
    if (!PP.encargosAtivos(cfg.parametros)) avisos.push("Encargos sociais sem valor: o custo por hora fica pendente.");
    var eqs = mapa(cfg.equipes);
    arr(cfg.servicos).forEach(function (s) {
      if (!eqs[String(s.equipePadrao)]) erros.push("Serviço " + (s.nome || s.id) + ": equipe padrão \"" + s.equipePadrao + "\" não existe.");
      else { var m = PP.metaServico(s, cfg); if (m.pendencia) avisos.push("Serviço " + (s.nome || s.id) + ": " + m.pendencia + "."); }
    });
    arr(cfg.funcoes).forEach(function (f) { if (numOuNulo(f.premioMax) == null) avisos.push("Função " + (f.nome || f.id) + " sem prêmio máximo."); });
    return { ok: !erros.length, erros: erros, avisos: avisos };
  };

  global.ProdPremio = PP;
  if (typeof module !== "undefined" && module.exports) module.exports = PP;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
