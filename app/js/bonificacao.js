/* =====================================================================
 * bonificacao.js — BONIFICAÇÃO POR FUNÇÃO E POR METAS DE ETAPA (motor puro)
 *
 * Roda no navegador e em Node (tools/test-bonificacao.js), sem DOM e sem
 * Store. A tela mora em js/bonificacaoui.js; aqui só há conta.
 *
 * ---------------------------------------------------------------------
 * A CONTA (o roteiro inteiro, para quem for mexer)
 * ---------------------------------------------------------------------
 *   Pagamento do mês = carteira + bonificação de função + bonificação de metas
 *
 *   bonificação de função = carteira × (soma de (fator − 1) dos tipos da pessoa)
 *                           + soma dos valores fixos dos tipos
 *   bonificação de metas  = valor cheio da pessoa × (metas atingidas ÷ metas do mês)
 *                           × (dias presentes ÷ dias que contam)
 *
 *   - Fatores SOMAM os acréscimos, não se multiplicam: carpinteiro 1,20 +
 *     motorista 1,10 = fator 1,30 (e não 1,32).
 *   - Meta = etapa do cronograma com data-limite. Entregou até o limite =
 *     atingida; o limite cai no mês da meta (etapa entregue antes conta no mês
 *     do limite dela). Sem gatilho: 70 % das metas paga 70 % do valor.
 *
 * ---------------------------------------------------------------------
 * REGRAS QUE NÃO PODEM SAIR DAQUI PARA A TELA
 * ---------------------------------------------------------------------
 * 1) NENHUM NÚMERO DE NEGÓCIO NASCE AQUI. Carteira, fator, valor fixo e valor
 *    cheio chegam como DADO. Vazio é PENDÊNCIA (a parcela volta `null` e a
 *    linha diz o que falta), nunca R$ 0,00: zero é uma folha bonita que paga
 *    nada, e ninguém confere o que parece certo.
 *
 * 2) A META É CONGELADA DENTRO DA BONIFICAÇÃO. A data-limite é gravada na meta
 *    (`limite`) no dia em que ela entra e NENHUMA função daqui a recalcula a
 *    partir do cronograma. Se o cronograma fosse a fonte, reprogramar o plano
 *    "salvaria" uma meta atrasada e mudaria dinheiro de pessoa sem ninguém
 *    ver. Só a gestão muda o limite (`ajustarMeta`), com motivo, e o histórico
 *    fica na própria meta.
 *
 * 3) SÓ CONTA O QUE ESTÁ APROVADO. Diário não aprovado nunca conclui etapa e
 *    nunca vira presença; ele VOLTA em `aguardando` para a tela avisar. Sumir
 *    com dado é como o erro fica invisível. "Aprovado" é a MESMA régua do
 *    `Producao.podePagar` (prodpremio.js tem a mesma cópia de reserva).
 *
 * 4) O FECHAMENTO É DA PESSOA NO MÊS, juntando as obras da configuração. Dois
 *    diários no mesmo dia (duas obras) contam UM dia; a pessoa em duas obras
 *    sai em UMA linha. Pagar o valor cheio uma vez por obra seria pagar em
 *    dobro, e nada acusaria.
 *
 * 5) DIA ESQUECIDO NÃO TIRA DINHEIRO. Um dia em que a pessoa nem aparece na
 *    lista de presença (entrou depois, ou o diário foi feito sem ela) não
 *    entra nos dias dela. Falta só existe quando alguém marcou.
 *
 * 6) DINHEIRO EM CENTAVOS INTEIROS, arredondado UMA vez por parcela; o total
 *    é a soma dos arredondados (fecha com a folha). Na parcela de metas a
 *    conta é feita com a razão inteira (cheia × atingidas × presentes ÷
 *    (metas × dias)) e arredondada só no fim: arredondar a fração antes
 *    perderia centavos que o outro caminho pagaria.
 * ===================================================================== */
(function (global) {
  "use strict";

  var B = {};

  function arr(x) { return Array.isArray(x) ? x : []; }
  function txt(x) { return String(x == null ? "" : x).trim(); }
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : null;
    var s = String(x == null ? "" : x).replace(/[^0-9,.\-]/g, "");
    if (!s) return null;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    /* ⚠ PONTO DE MILHAR: "2.150" é duas mil cento e cinquenta, não 2,15 (carteira de R$ 2,15 pagaria quase nada,
       sem ninguém ver). Grupos de exatamente 3 dígitos depois do ponto são milhar; "1.20" (2 dígitos) segue
       sendo 1,2, o fator digitado com ponto. */
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  /* vazio é vazio: "" e null NÃO viram zero (regra 1) */
  function numOuNulo(x) { if (x == null || (typeof x === "string" && !txt(x))) return null; return num(x); }
  function cent(reais) { return Math.round(reais * 100 + (reais >= 0 ? 1e-7 : -1e-7)); }
  function r2(x) { return Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  B.num = num;

  /* ------------------------------------------------------------------
   * DATAS — tudo em "AAAA-MM-DD", aritmética em UTC (nenhum horário de verão
   * muda o dia que a pessoa vê).
   * ------------------------------------------------------------------ */
  function dataMs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? "" : s));
    if (!m) return null;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(ms);
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return ms;
  }
  function iso(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
  }
  var DIA = 86400000;
  B.dataOk = function (s) { return dataMs(s) != null; };
  B.mesDe = function (s) { return dataMs(s) == null ? "" : String(s).slice(0, 7); };
  B.periodoDe = function (comp) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(comp || ""));
    if (!m || +m[2] < 1 || +m[2] > 12) return null;
    var ult = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
    return { de: m[1] + "-" + m[2] + "-01", ate: m[1] + "-" + m[2] + "-" + (ult < 10 ? "0" : "") + ult };
  };

  /* calendário da obra: { diasSemana: 5|6|7, feriados: ["AAAA-MM-DD"] } — vem dos
     `params` do plano (diasUteisSemana, feriadosExtras). 5 = segunda a sexta,
     6 = com sábado, 7 = todo dia. Valor torto cai em 5. */
  function calNorm(cal) {
    var c = cal || {}, d = parseInt(c.diasSemana, 10), mapa = {};
    if (d !== 6 && d !== 7) d = 5;
    arr(c.feriados).forEach(function (f) { var s = txt(f && f.data != null ? f.data : f).slice(0, 10); if (dataMs(s) != null) mapa[s] = 1; });
    return { diasSemana: d, feriados: mapa };
  }
  B.calendario = function (cal) { var c = calNorm(cal); return { diasSemana: c.diasSemana, feriados: Object.keys(c.feriados).sort() }; };
  function util(ms, c) {
    var w = new Date(ms).getUTCDay();                 // 0 dom ... 6 sáb
    if (c.diasSemana === 5 && (w === 0 || w === 6)) return false;
    if (c.diasSemana === 6 && w === 0) return false;
    return !c.feriados[iso(ms)];
  }
  B.ehDiaUtil = function (data, cal) { var ms = dataMs(data); return ms != null && util(ms, calNorm(cal)); };
  var TETO_DIAS = 4000;                               // ~11 anos: guarda contra laço por data torta
  B.diasUteis = function (de, ate, cal) {
    var a = dataMs(de), b = dataMs(ate), c = calNorm(cal), n = 0, k = 0;
    if (a == null || b == null || b < a) return 0;
    for (var t = a; t <= b && k < TETO_DIAS; t += DIA, k++) if (util(t, c)) n++;
    return n;
  };
  /* o dia da data-limite: o início conta como dia 1 (se o início cai em dia
     que não se trabalha, o dia 1 é o primeiro dia útil depois dele) */
  B.limiteDe = function (inicio, dias, cal) {
    var a = dataMs(inicio), n = parseInt(dias, 10), c = calNorm(cal), cont = 0, k = 0;
    if (a == null || !(n >= 1) || n > TETO_DIAS) return null;
    for (var t = a; k < TETO_DIAS * 2; t += DIA, k++) {
      if (util(t, c)) { cont++; if (cont === n) return iso(t); }
    }
    return null;
  };

  /* ------------------------------------------------------------------
   * CONFIGURAÇÃO
   * ------------------------------------------------------------------ */
  B.RUBRICA = "Bonificação";
  B.novaConfig = function (obras) {
    return {
      obras: arr(obras).slice(), rubrica: B.RUBRICA, regras: { reduzPorFalta: true },
      /* ⚠ os quatro tipos nascem SEM valor: fator e fixo são decisão de quem paga */
      tipos: [
        { id: "tp_carpinteiro", nome: "Carpinteiro", grupo: "funcao", fator: null, fixo: null },
        { id: "tp_ajudante", nome: "Ajudante", grupo: "funcao", fator: null, fixo: null },
        { id: "tp_encarregado", nome: "Encarregado", grupo: "funcao", fator: null, fixo: null },
        { id: "tp_motorista", nome: "Motorista", grupo: "adicional", fator: null, fixo: null }
      ],
      pessoas: [], metas: []
    };
  };
  B.regras = function (cfg) {
    var r = (cfg && cfg.regras) || {};
    return { reduzPorFalta: r.reduzPorFalta !== false };
  };

  /* ⚠ O FATOR ABAIXO DE 1 É RECUSADO (a tela barra; o motor também): um fator 0,9
     REDUZIRIA o salário em carteira. Aqui vira pendência e não entra na conta. */
  /* ⚠ FATOR ACIMA DE 3 É DIGITAÇÃO ERRADA (alguém pôs 500 no lugar do valor fixo: pagaria 500 vezes o salário). */
  B.FATOR_MAX = 3;
  B.fatorValido = function (f) { var n = numOuNulo(f); return n != null && n >= 1 && n <= B.FATOR_MAX; };

  /* os tipos de UMA pessoa: a função + os adicionais, sem repetir */
  function tiposDaPessoa(pessoa, tipos) {
    var por = {}, ids = [], out = [];
    arr(tipos).forEach(function (t) { if (t && t.id != null) por[String(t.id)] = t; });
    if (txt(pessoa && pessoa.funcaoTipoId)) ids.push(String(pessoa.funcaoTipoId));
    arr(pessoa && pessoa.adicionais).forEach(function (a) { if (ids.indexOf(String(a)) < 0) ids.push(String(a)); });
    ids.forEach(function (id) { out.push(own(por, id) ? por[id] : { id: id, nome: id, _sumiu: true }); });
    return out;
  }

  /* bonificação de função. Devolve { fator, deltaFator, fixoCent, funcaoCent,
     pendencias[] }. `funcaoCent` é null quando falta dado (carteira vazia,
     função não escolhida, tipo sem fator nem fixo) — NUNCA zero calado. */
  B.bonusFuncao = function (pessoa, tipos) {
    var pend = [], carteira = numOuNulo(pessoa && pessoa.carteira);
    var lista = tiposDaPessoa(pessoa, tipos), delta = 0, fixoCent = 0, usaFator = false;
    if (!txt(pessoa && pessoa.funcaoTipoId)) pend.push("função não escolhida");
    if (carteira == null) pend.push("salário em carteira vazio");
    else if (carteira < 0) pend.push("salário em carteira negativo");
    lista.forEach(function (t) {
      if (t._sumiu) { pend.push("tipo \"" + t.id + "\" não existe mais"); return; }
      var f = numOuNulo(t.fator), x = numOuNulo(t.fixo);
      if (f == null && x == null) { pend.push("tipo \"" + (t.nome || t.id) + "\" sem fator nem valor fixo"); return; }
      if (f != null) {
        if (f < 1) { pend.push("tipo \"" + (t.nome || t.id) + "\" com fator abaixo de 1"); return; }
        if (f > B.FATOR_MAX) { pend.push("tipo \"" + (t.nome || t.id) + "\" com fator acima de " + B.FATOR_MAX + " (parece digitado errado)"); return; }
        delta += Math.round((f - 1) * 1e6) / 1e6; usaFator = true;
      }
      if (x != null) {
        if (x < 0) { pend.push("tipo \"" + (t.nome || t.id) + "\" com valor fixo negativo"); return; }
        fixoCent += cent(x);
      }
    });
    var out = { fator: Math.round((1 + delta) * 1e6) / 1e6, deltaFator: delta, fixoCent: fixoCent, usaFator: usaFator, pendencias: pend, funcaoCent: null };
    if (!pend.length) out.funcaoCent = Math.round(cent(carteira) * delta + 1e-7) + fixoCent;
    return out;
  };

  /* ------------------------------------------------------------------
   * METAS
   * meta = { id, obraId, noId, nome, inicio, dias, limite, fora, foraMotivo,
   *          ajustes: [{ de, para, motivo, por, em }], criadoPor, criadoEm }
   * ------------------------------------------------------------------ */
  B.idMeta = function (obraId, noId) { return "mt_" + txt(obraId) + "_" + txt(noId); };
  B.novaMeta = function (d, cal) {
    var lim = B.limiteDe(d && d.inicio, d && d.dias, cal);
    if (!lim) return { ok: false, erro: "Informe o início e o prazo em dias (maior que zero) para calcular o \"entregar até\"." };
    if (!txt(d.obraId) || !txt(d.noId)) return { ok: false, erro: "A meta precisa de uma obra e de uma etapa do cronograma." };
    return { ok: true, meta: { id: B.idMeta(d.obraId, d.noId), obraId: txt(d.obraId), noId: txt(d.noId), nome: txt(d.nome) || txt(d.noId),
      inicio: txt(d.inicio).slice(0, 10), dias: parseInt(d.dias, 10), limite: lim, fora: false, foraMotivo: "", ajustes: [],
      criadoPor: txt(d.por), criadoEm: txt(d.em) } };
  };
  /* ⚠ TRAZER ETAPAS É IDEMPOTENTE PELO noId E NUNCA TOCA NO QUE JÁ EXISTE.
     Roteiro do defeito que isto impede: o gestor reabre "Trazer etapas" depois
     que o cronograma foi reprogramado; se a meta já existente fosse
     reescrita com as datas novas, a data-limite combinada andaria sozinha. */
  B.trazerEtapas = function (metas, etapas, ctx) {
    var lista = arr(metas).slice(), vistos = {}, criadas = [], jaExistiam = [], recusadas = [];
    lista.forEach(function (m) { vistos[B.idMeta(m.obraId, m.noId)] = 1; });
    arr(etapas).forEach(function (e) {
      var id = B.idMeta(e.obraId, e.noId);
      if (vistos[id]) { jaExistiam.push(txt(e.nome) || txt(e.noId)); return; }
      var n = B.novaMeta({ obraId: e.obraId, noId: e.noId, nome: e.nome, inicio: e.inicio, dias: e.dias, por: ctx && ctx.por, em: ctx && ctx.em }, ctx && ctx.cal);
      if (!n.ok) { recusadas.push({ nome: txt(e.nome) || txt(e.noId), erro: n.erro }); return; }
      vistos[id] = 1; lista.push(n.meta); criadas.push(n.meta);
    });
    return { metas: lista, criadas: criadas, jaExistiam: jaExistiam, recusadas: recusadas };
  };
  function copia(o) { var c = {}, k; for (k in (o || {})) if (own(o, k)) c[k] = o[k]; return c; }
  /* mudar início e/ou prazo de uma meta já existente: recalcula o limite e
     EXIGE o motivo (é dinheiro de pessoa). O histórico fica na própria meta. */
  B.ajustarMeta = function (meta, d, cal) {
    if (!meta) return { ok: false, erro: "Meta não encontrada." };
    if (!txt(d && d.motivo)) return { ok: false, erro: "Escreva o motivo de mudar o prazo: ele fica no histórico da meta." };
    var inicio = d.inicio != null ? txt(d.inicio).slice(0, 10) : meta.inicio, dias = d.dias != null ? parseInt(d.dias, 10) : meta.dias;
    var lim = B.limiteDe(inicio, dias, cal);
    if (!lim) return { ok: false, erro: "Início ou prazo inválido: não consegui calcular o \"entregar até\"." };
    var m = copia(meta);
    m.ajustes = arr(meta.ajustes).concat([{ de: meta.limite, para: lim, motivo: txt(d.motivo), por: txt(d.por), em: txt(d.em) }]);
    m.inicio = inicio; m.dias = dias; m.limite = lim;
    return { ok: true, meta: m };
  };
  /* tirar a meta da conta (ex.: atraso do contratante) ou devolvê-la, com motivo */
  B.foraDaConta = function (meta, fora, motivo, por, em) {
    if (!meta) return { ok: false, erro: "Meta não encontrada." };
    if (!txt(motivo)) return { ok: false, erro: "Escreva o motivo: ele fica no histórico da meta." };
    var m = copia(meta);
    m.ajustes = arr(meta.ajustes).concat([{ de: meta.fora ? "fora da conta" : "na conta", para: fora ? "fora da conta" : "na conta", motivo: txt(motivo), por: txt(por), em: txt(em) }]);
    m.fora = !!fora; m.foraMotivo = fora ? txt(motivo) : "";
    return { ok: true, meta: m };
  };

  /* ------------------------------------------------------------------
   * CONCLUSÃO DA ETAPA
   * ------------------------------------------------------------------ */
  var ESTADOS_QUE_PAGAM = ["aprovado", "publicado", "publicado_legado", "finalizado_legado"];
  /* ⚠ a MESMA régua de Producao.podePagar. Usa o original quando carregado; a
     cópia existe porque este arquivo roda em Node sem o app. */
  function aprovado(rdo) {
    if (global.Producao && global.Producao.podePagar) return !!global.Producao.podePagar(rdo);
    var r = rdo || {}, e = String(r.estado || "");
    if (e) return ESTADOS_QUE_PAGAM.indexOf(e) > -1;
    var s = String(r.status || "");
    return s === "finalizado" || s === "publicado";
  }
  B.aprovado = aprovado;
  function concluidaNoAvanco(e) {
    var CA = global.CronoAvanco;
    if (CA && CA.estadoDe) return CA.estadoDe(e) === "concluida";
    return !!e && dataMs(e.f) != null;
  }

  /* conclusoes(rdos, avancosPorObra) → { porNo: {"obra|no": {data, fonte, rdoId}}, aguardando: {"obra|no": {data, rdoId}} }
     Cronograma primeiro (`f` da entrada, régua CronoAvanco.estadoDe); sem ele, a
     data MAIS ANTIGA de um diário aprovado com `etapasDia[].concluiu`. */
  B.conclusoes = function (rdos, avancos, folhas) {
    var porNo = {}, aguardando = {};
    var av = avancos || {};
    Object.keys(av).forEach(function (obraId) {
      arr(av[obraId] && av[obraId].nos).forEach(function (e) {
        if (!e || e.id == null || !concluidaNoAvanco(e) || dataMs(e.f) == null) return;
        /* ⚠ ENTRADA `o:"diario"` NÃO É CONCLUSÃO: foi o próprio sistema que a gravou quando o diário foi aprovado.
           Se o diário é devolvido ou corrigido, o `f` ficaria no avanço e a meta seguiria "entregue" sem diário
           nenhum que a sustente. A data vem só dos diários aprovados (abaixo); entrada digitada por pessoa
           continua valendo e vencendo. */
        if (e.o === "diario") return;
        porNo[txt(obraId) + "|" + txt(e.id)] = { data: String(e.f).slice(0, 10), fonte: "cronograma" };
      });
    });
    var viaDiario = {};
    arr(rdos).forEach(function (rd) {
      if (!rd || dataMs(rd.data) == null) return;
      var d = String(rd.data).slice(0, 10), ok = aprovado(rd);
      arr(rd.etapasDia).forEach(function (et) {
        if (!et || !et.concluiu || et.noId == null) return;
        var k = txt(rd.obraId) + "|" + txt(et.noId), alvo = ok ? viaDiario : aguardando;
        if (!alvo[k] || d < alvo[k].data) alvo[k] = { data: d, fonte: "diario", rdoId: rd.id };
      });
    });
    Object.keys(viaDiario).forEach(function (k) { if (!porNo[k]) porNo[k] = viaDiario[k]; });
    /* ETAPA COM SUBETAPAS: sem conclusão própria, fecha na MAIOR data entre as folhas quando TODAS concluíram.
       `folhas` = { "obra|etapa": [ids das folhas] }. Uma folha em aberto segura a etapa. */
    Object.keys(folhas || {}).forEach(function (k) {
      if (porNo[k]) return;
      var ids = arr(folhas[k]), obra = k.split("|")[0], maior = null, todas = ids.length > 0;
      ids.forEach(function (id) { var c = porNo[obra + "|" + id]; if (!c) { todas = false; return; } if (!maior || c.data > maior) maior = c.data; });
      if (todas && maior) porNo[k] = { data: maior, fonte: "subetapas" };
    });
    Object.keys(aguardando).forEach(function (k) { if (porNo[k]) delete aguardando[k]; });
    return { porNo: porNo, aguardando: aguardando };
  };

  /* situacaoMeta(meta, conclusao, hoje, cal). `conclusao` = { data } ou null.
     Atingida = antecipada ou no_prazo. Devolve também os dias usados e a folga,
     contados em dias úteis do calendário da obra. */
  B.situacaoMeta = function (meta, conclusao, hoje, cal) {
    var m = meta || {}, lim = dataMs(m.limite) != null ? String(m.limite).slice(0, 10) : null;
    var out = { estado: "", atingida: false, limite: lim, entregueEm: null, diasUsados: null, folga: null, aguardando: false };
    if (m.fora) { out.estado = "fora"; return out; }
    if (!lim) { out.estado = "sem_prazo"; return out; }
    var f = conclusao && dataMs(conclusao.data) != null ? String(conclusao.data).slice(0, 10) : null;
    /* ⚠ ENTREGA COM DATA NO FUTURO NÃO É ENTREGA: diário adiantado, data digitada errada ou `f` de teste não
       fecham meta antes do dia. Fica em andamento (ou vencida, se o prazo já passou). */
    var hj = dataMs(hoje) != null ? String(hoje).slice(0, 10) : null;
    if (f && hj && f > hj) f = null;
    if (f) {
      out.entregueEm = f;
      out.diasUsados = B.diasUteis(m.inicio, f, cal);
      out.folga = (parseInt(m.dias, 10) || 0) - out.diasUsados;
      if (f < lim) out.estado = "antecipada";
      else if (f === lim) out.estado = "no_prazo";
      else out.estado = "atrasada";
      out.atingida = out.estado === "antecipada" || out.estado === "no_prazo";
      return out;
    }
    var h = hj;
    out.estado = (h && h > lim) ? "vencida" : "em_andamento";
    return out;
  };
  B.ROTULO_SITUACAO = { fora: "Fora da conta", antecipada: "Entregue antes", no_prazo: "Entregue no prazo", atrasada: "Entregue atrasada",
    vencida: "Passou do prazo", em_andamento: "Dentro do prazo", sem_prazo: "Sem prazo" };

  /* nota do mês: metas com LIMITE no mês, sem as `fora`. As abertas (ainda
     dentro do prazo) contam no denominador: a nota só sobe quando entregam. */
  B.notaDoMes = function (metas, conclusoes, comp, hoje, cal) {
    var con = conclusoes || { porNo: {}, aguardando: {} }, itens = [], ct = { total: 0, atingidas: 0, abertas: 0, vencidas: 0, atrasadas: 0, fora: 0 };
    arr(metas).forEach(function (m) {
      if (!m || B.mesDe(m.limite) !== comp) return;
      var k = txt(m.obraId) + "|" + txt(m.noId);
      var s = B.situacaoMeta(m, con.porNo[k] || null, hoje, cal);
      if (!con.porNo[k] && con.aguardando[k]) { s.aguardando = true; s.aguardandoDesde = con.aguardando[k].data; }
      itens.push({ meta: m, sit: s });
      if (s.estado === "fora") { ct.fora++; return; }
      ct.total++;
      if (s.atingida) ct.atingidas++;
      else if (s.estado === "em_andamento") ct.abertas++;
      else if (s.estado === "vencida") ct.vencidas++;
      else if (s.estado === "atrasada") ct.atrasadas++;
    });
    return { comp: comp, total: ct.total, atingidas: ct.atingidas, abertas: ct.abertas, vencidas: ct.vencidas, atrasadas: ct.atrasadas, fora: ct.fora,
      notaPct: ct.total ? r2(100 * ct.atingidas / ct.total) : null, itens: itens };
  };

  /* ------------------------------------------------------------------
   * PRESENÇA
   * rdo.presenca = [{ colaboradorId, nome, estado: "presente"|"falta"|"justificada" }]
   * ------------------------------------------------------------------ */
  B.ESTADOS_PRESENCA = { presente: "Presente", falta: "Falta", justificada: "Falta justificada" };
  var PESO = { presente: 3, justificada: 2, falta: 1 };       // no mesmo dia, em duas obras: presente > justificada > falta
  function obrasSet(obras) { var s = {}; arr(obras).forEach(function (o) { s[txt(o)] = 1; }); return s; }
  function dentro(rd, per, obs) {
    return !!rd && own(obs, txt(rd.obraId)) && dataMs(rd.data) != null && String(rd.data).slice(0, 10) >= per.de && String(rd.data).slice(0, 10) <= per.ate;
  }
  B.presencaPreenchida = function (rdo) {
    return arr(rdo && rdo.presenca).filter(function (p) { return p && p.colaboradorId != null && own(B.ESTADOS_PRESENCA, p.estado); }).length > 0;
  };

  /* presencaDoMes → { dias: [datas que contam], porPessoa: { id: { dias:{data:estado}, presentes, faltas,
     justificadas, diasQueContam, semRegistro } }, aguardando: n, diarios: n }
     Um "dia que conta" é uma DATA com diário aprovado e presença preenchida em
     alguma obra da configuração (duas obras no mesmo dia = um dia). */
  B.presencaDoMes = function (rdos, comp, obras, colaboradores) {
    var per = B.periodoDe(comp), obs = obrasSet(obras), dias = {}, porDiaPessoa = {}, aguardando = 0, diarios = 0;
    var out = { comp: comp, dias: [], porPessoa: {}, aguardando: 0, diarios: 0 };
    if (!per) return out;
    arr(rdos).forEach(function (rd) {
      if (!dentro(rd, per, obs) || !B.presencaPreenchida(rd)) return;
      if (!aprovado(rd)) { aguardando++; return; }
      var d = String(rd.data).slice(0, 10);
      diarios++; dias[d] = 1;
      arr(rd.presenca).forEach(function (p) {
        if (!p || p.colaboradorId == null || !own(B.ESTADOS_PRESENCA, p.estado)) return;
        var k = txt(p.colaboradorId), cur = (porDiaPessoa[k] = porDiaPessoa[k] || {})[d];
        if (!cur || PESO[p.estado] > PESO[cur]) porDiaPessoa[k][d] = p.estado;
      });
    });
    out.dias = Object.keys(dias).sort(); out.aguardando = aguardando; out.diarios = diarios;
    var adm = {};
    arr(colaboradores).forEach(function (c) { if (c && c.id != null && dataMs(c.admissao) != null) adm[txt(c.id)] = String(c.admissao).slice(0, 10); });
    var ids = {};
    Object.keys(porDiaPessoa).forEach(function (k) { ids[k] = 1; });
    arr(colaboradores).forEach(function (c) { if (c && c.id != null) ids[txt(c.id)] = 1; });
    Object.keys(ids).forEach(function (k) {
      var regs = porDiaPessoa[k] || {}, o = { dias: {}, presentes: 0, faltas: 0, justificadas: 0, diasQueContam: 0, semRegistro: 0, antesDaAdmissao: 0 };
      out.dias.forEach(function (d) {
        /* ⚠ dia antes da admissão não é falta: a pessoa ainda não era da empresa */
        if (adm[k] && d < adm[k]) { o.antesDaAdmissao++; return; }
        var e = regs[d];
        if (!e) { o.semRegistro++; return; }           // regra 5: não listada no dia, não tira dinheiro
        o.dias[d] = e;
        if (e === "presente") o.presentes++;
        else if (e === "falta") o.faltas++;
        else o.justificadas++;
      });
      /* falta justificada sai da conta (nem soma, nem tira); a comum fica no denominador */
      o.diasQueContam = o.presentes + o.faltas;
      out.porPessoa[k] = o;
    });
    return out;
  };

  /* dias úteis do mês, até ontem, sem nenhum diário nas obras da configuração.
     `semAprovado` = dias que têm diário mas nenhum aprovado com presença (o diário
     existe, só não conta ainda). O início da contagem é o 1º diário já feito nessas
     obras: antes dele a obra nem tinha começado a registrar. */
  B.diasSemDiario = function (rdos, comp, obras, hoje, cal) {
    var per = B.periodoDe(comp), obs = obrasSet(obras), out = { lista: [], semAprovado: [] };
    var h = dataMs(hoje) != null ? String(hoje).slice(0, 10) : null;
    if (!per || !h) return out;
    var tem = {}, aprov = {}, primeiro = null;
    arr(rdos).forEach(function (rd) {
      if (!rd || !own(obs, txt(rd.obraId)) || dataMs(rd.data) == null) return;
      var d = String(rd.data).slice(0, 10);
      if (primeiro == null || d < primeiro) primeiro = d;
      if (d < per.de || d > per.ate) return;
      tem[d] = 1;
      if (aprovado(rd) && B.presencaPreenchida(rd)) aprov[d] = 1;
    });
    var ini = per.de; if (primeiro && primeiro > ini) ini = primeiro;
    var ms = dataMs(ini), fim = dataMs(per.ate), c = calNorm(cal), k = 0;
    for (var t = ms; t != null && t <= fim && k < 40; t += DIA, k++) {
      var d2 = iso(t);
      if (d2 >= h) break;                              // hoje ainda está aberto
      if (!util(t, c)) continue;
      if (!tem[d2]) out.lista.push(d2);
      else if (!aprov[d2]) out.semAprovado.push(d2);
    }
    return out;
  };

  /* ------------------------------------------------------------------
   * APURAÇÃO DO MÊS
   * ------------------------------------------------------------------ */
  function nomeTipo(tipos, id) {
    var r = "";
    arr(tipos).forEach(function (t) { if (t && String(t.id) === String(id)) r = t.nome || ""; });
    return r;
  }
  B.apurar = function (p) {
    p = p || {};
    var cfg = p.config || {}, comp = p.comp, per = B.periodoDe(comp), hoje = p.hoje, cal = p.cal;
    var res = { comp: comp, periodo: per, linhas: [], totalCent: null, bonusTotalCent: null, pendencias: [], avisos: [], semMeta: false,
      nota: null, presenca: null, semDiario: { lista: [], semAprovado: [] }, conclusoes: null, pessoasPendentes: 0 };
    if (!per) { res.pendencias.push("mês inválido"); return res; }
    var obras = arr(cfg.obras), regras = B.regras(cfg);
    var cons = arr(p.colaboradores), porColab = {};
    cons.forEach(function (c) { if (c && c.id != null) porColab[txt(c.id)] = c; });
    var con = B.conclusoes(arr(p.rdos).filter(function (rd) { return rd && own(obrasSet(obras), txt(rd.obraId)); }), p.avancos, p.folhas);
    var metas = arr(cfg.metas).filter(function (m) { return m && own(obrasSet(obras), txt(m.obraId)); });
    var nota = B.notaDoMes(metas, con, comp, hoje, cal);
    var pres = B.presencaDoMes(p.rdos, comp, obras, cons);
    res.nota = nota; res.presenca = pres; res.conclusoes = con;
    res.semDiario = B.diasSemDiario(p.rdos, comp, obras, hoje, cal);
    res.semMeta = nota.total === 0;
    if (res.semMeta) res.avisos.push("Este mês não tem nenhuma meta com prazo nele: a bonificação de metas fica em R$ 0,00.");
    if (pres.aguardando) res.avisos.push(pres.aguardando + " diário(s) com presença ainda não aprovado(s): não entram na conta.");
    var aguard = Object.keys(con.aguardando).length;
    if (aguard) res.avisos.push(aguard + " etapa(s) concluída(s) em diário ainda não aprovado: só valem depois da aprovação.");
    if (!pres.dias.length) res.pendencias.push("nenhum dia do mês com diário aprovado e presença preenchida");

    var vistos = {}, somaTotal = 0, somaBonus = 0, temTotal = false, temBonus = false;
    arr(cfg.pessoas).forEach(function (pe) {
      if (!pe || pe.ativo === false || pe.colaboradorId == null) return;
      var id = txt(pe.colaboradorId);
      if (vistos[id]) { res.avisos.push((pe.nome || id) + " aparece duas vezes na configuração: só a primeira linha vale."); return; }
      vistos[id] = 1;
      var co = porColab[id] || {}, pend = [];
      var fn = B.bonusFuncao(pe, cfg.tipos);
      fn.pendencias.forEach(function (x) { pend.push(x); });
      var cheia = numOuNulo(pe.metaCheia), pr = pres.porPessoa[id] || { presentes: 0, faltas: 0, justificadas: 0, diasQueContam: 0, semRegistro: 0 };
      var metasCent = null, presentesEf = pr.presentes, aviso = "";
      if (!regras.reduzPorFalta) presentesEf = pr.presentes >= 1 ? pr.diasQueContam : 0;
      if (nota.total === 0) metasCent = 0;
      else {
        if (cheia == null) pend.push("valor cheio da bonificação de metas vazio");
        else if (cheia < 0) pend.push("valor cheio da bonificação de metas negativo");
        if (!pr.diasQueContam && pr.justificadas > 0) {
          /* ⚠ ATESTADO O MÊS INTEIRO: não é pendência (a pessoa foi registrada, só não há dia que conte) e não trava
             a homologação; a bonificação de metas é zero e a linha diz por quê. */
          aviso = "todos os dias com falta justificada: sem bonificação de metas neste mês";
          metasCent = 0;
        } else if (!pr.diasQueContam) pend.push("nenhum dia com presença no mês");
        /* ⚠ a razão INTEIRA, arredondada só no fim (regra 6) */
        if (cheia != null && cheia >= 0 && pr.diasQueContam)
          metasCent = Math.round(cent(cheia) * nota.atingidas * presentesEf / (nota.total * pr.diasQueContam));
      }
      var carteiraCent = numOuNulo(pe.carteira) == null || numOuNulo(pe.carteira) < 0 ? null : cent(numOuNulo(pe.carteira));
      var bonusCent = (fn.funcaoCent == null || metasCent == null) ? null : fn.funcaoCent + metasCent;
      var totalCent = (bonusCent == null || carteiraCent == null) ? null : carteiraCent + bonusCent;
      if (totalCent != null) { somaTotal += totalCent; temTotal = true; }
      if (bonusCent != null) { somaBonus += bonusCent; temBonus = true; }
      if (pend.length) res.pessoasPendentes++;
      res.linhas.push({
        colaboradorId: id, nome: txt(pe.nome) || txt(co.nome) || id, funcao: nomeTipo(cfg.tipos, pe.funcaoTipoId),
        carteiraCent: carteiraCent, fator: fn.fator, funcaoCent: fn.funcaoCent, salarioComFuncaoCent: (carteiraCent != null && fn.funcaoCent != null) ? carteiraCent + fn.funcaoCent : null,
        metaCheiaCent: cheia == null ? null : cent(cheia), metasCent: metasCent, bonusCent: bonusCent, totalCent: totalCent,
        metasAtingidas: nota.atingidas, metasTotal: nota.total,
        diasQueContam: pr.diasQueContam, presentes: pr.presentes, faltas: pr.faltas, justificadas: pr.justificadas, semRegistro: pr.semRegistro,
        presencaPct: pr.diasQueContam ? r2(100 * presentesEf / pr.diasQueContam) : null,
        pendencias: pend, pendencia: pend.join("; "), aviso: aviso, rubrica: cfg.rubrica || B.RUBRICA
      });
    });
    /* total do mês = só o que está completo; a tela mostra quantos faltam */
    res.totalCent = temTotal ? somaTotal : (res.linhas.length ? null : 0);
    res.bonusTotalCent = temBonus ? somaBonus : (res.linhas.length ? null : 0);
    res.totalFechaCent = res.linhas.reduce(function (s, l) { return s + (l.totalCent || 0); }, 0);
    if (res.pessoasPendentes) res.pendencias.push(res.pessoasPendentes + " pessoa(s) com pendência: a parcela delas não é calculada até completar.");
    return res;
  };

  /* uma linha por pessoa para a tela, o Excel e o fechamento congelado */
  B.linhasRelatorio = function (ap) {
    return arr(ap && ap.linhas).map(function (l) {
      return { colaboradorId: l.colaboradorId, nome: l.nome, funcao: l.funcao, carteiraCent: l.carteiraCent, fator: l.fator, funcaoCent: l.funcaoCent,
        metasTexto: l.metasAtingidas + " de " + l.metasTotal, presencaTexto: l.presentes + " de " + l.diasQueContam,
        metasCent: l.metasCent, bonusCent: l.bonusCent, totalCent: l.totalCent, rubrica: l.rubrica, pendencia: l.pendencia || "", aviso: l.aviso || "" };
    });
  };

  /* ------------------------------------------------------------------
   * FECHAMENTO — id determinístico por mês: dois aparelhos offline não criam
   * dois fechamentos do mesmo mês. `historico` é lista de OBJETOS (o Firestore
   * recusa lista dentro de lista). Reabrir não apaga nada.
   * ------------------------------------------------------------------ */
  B.idFechamento = function (comp) { return "ppb_" + String(comp || ""); };
  B.homologar = function (atual, d) {
    if (atual && atual.estado === "homologado")
      return { ok: false, erro: "Este mês já está homologado" + (atual.homologadoPor ? " por " + atual.homologadoPor : "") + " (talvez em outro aparelho). Atualize a tela; para alterar, reabra o mês." };
    var f = copia(atual), l = arr(d && d.linhas);
    f.id = B.idFechamento(d.competencia); f.tipo = "bonificacao"; f.obraId = d.obraId; f.competencia = d.competencia; f.estado = "homologado";
    f.linhas = l; f.metas = arr(d.metas); f.notaPct = d.notaPct == null ? null : d.notaPct;
    f.totalCent = d.totalCent; f.homologadoPor = d.por || ""; f.homologadoEm = d.em || "";
    /* ⚠ REABRIR NÃO APAGA NADA, e agora isso vale também para o que foi pago: a cópia das linhas, da nota e das
       metas desta homologação fica NO HISTÓRICO. Reabrir e homologar de novo troca `linhas` do fechamento, e sem
       esta cópia o valor homologado antes só existiria no papel. (Lista de objetos dentro de objeto, nunca lista
       direto em lista: o Firestore recusa.) */
    f.historico = arr(atual && atual.historico).concat([{ acao: "homologar", por: d.por || "", em: d.em || "", totalCent: d.totalCent, pessoas: l.length,
      notaPct: f.notaPct, linhas: l.map(copia), metas: arr(d.metas).map(copia) }]);
    return { ok: true, f: f };
  };
  B.reabrir = function (atual, por, em) {
    if (!atual || atual.estado !== "homologado") return { ok: false, erro: "Só se reabre um mês homologado." };
    var f = copia(atual);
    f.estado = "reaberto"; f.reabertoPor = por || ""; f.reabertoEm = em || "";
    f.historico = arr(atual.historico).concat([{ acao: "reabrir", por: por || "", em: em || "", totalCent: atual.totalCent, pessoas: arr(atual.linhas).length }]);
    return { ok: true, f: f };
  };
  B.ehDeBonificacao = function (f) { return !!f && (f.tipo === "bonificacao" || String(f.id || "").indexOf("ppb_") === 0); };
  B.MSG_MES_TRAVADO = "Este mês está homologado. Reabra o mês (aba Fechamento, só a gestão) para alterar.";
  B.mesHomologado = function (fechamentos, comp) {
    var out = null;
    arr(fechamentos).forEach(function (f) { if (B.ehDeBonificacao(f) && f.estado === "homologado" && f.competencia === comp) out = f; });
    return out;
  };

  /* ------------------------------------------------------------------
   * GRAVAR O AVANÇO PELO DIÁRIO — o que vai no cronograma quando o diário é aprovado
   * Devolve as operações { alvo:"avanco", id, campo, para } para o
   * GanttUI.aplicarAvanco. PURO: quem grava é o App._cronoGravarAvanco.
   *   - início (i) = a menor data de diário da etapa, só se a entrada ainda não tem início;
   *   - p = pct do diário, NUNCA abaixo do que já está lançado (sem regressão calada);
   *   - fim (f) = a data do diário que concluiu, só se a etapa ainda não está concluída.
   * `entradas` = rec.nos do avanço atual; `dias` = [{ noId, pct, concluiu, data, menorData }].
   * ------------------------------------------------------------------ */
  B.opsDoDiario = function (entradas, itens) {
    var por = {}, ops = [], pulou = [];
    arr(entradas).forEach(function (e) { if (e && e.id != null) por[String(e.id)] = e; });
    arr(itens).forEach(function (it) {
      if (!it || it.noId == null) return;
      var id = String(it.noId), e = por[id] || null, pct = numOuNulo(it.pct);
      if (it.concluiu) pct = 100;
      if (pct == null || pct < 0 || pct > 100) { pulou.push({ noId: id, motivo: "percentual inválido" }); return; }
      var ini = txt(it.menorData || it.data).slice(0, 10), fim = txt(it.data).slice(0, 10);
      if (dataMs(ini) == null || dataMs(fim) == null) { pulou.push({ noId: id, motivo: "data do diário inválida" }); return; }
      if (e && concluidaNoAvanco(e)) {
        /* a conclusão que uma PESSOA digitou manda; a que o próprio diário gravou (`o:"diario"`) acompanha o diário:
           reaprovado com outra data, o `f` é regravado */
        if (e.o === "diario" && it.concluiu && e.f !== fim) {
          if (dataMs(e.i) != null && fim < String(e.i).slice(0, 10)) ops.push({ alvo: "avanco", id: id, campo: "i", para: ini });
          ops.push({ alvo: "avanco", id: id, campo: "f", para: fim });
        } else pulou.push({ noId: id, motivo: "já concluída no cronograma" });
        return;
      }
      var temI = e && dataMs(e.i) != null;
      if (!temI) ops.push({ alvo: "avanco", id: id, campo: "i", para: ini });
      /* ⚠ NUNCA GRAVAR `f` ANTES DO `i`: diário atrasado (evidência mais antiga que o início lançado) traria o início
         junto; o Cronograma recusaria o registro inteiro por "fim antes do início". */
      else if (it.concluiu && fim < String(e.i).slice(0, 10)) ops.push({ alvo: "avanco", id: id, campo: "i", para: ini });
      var pAtual = e && numOuNulo(e.p) != null ? numOuNulo(e.p) : null;
      if (it.concluiu) {
        ops.push({ alvo: "avanco", id: id, campo: "p", para: 100 });
        ops.push({ alvo: "avanco", id: id, campo: "f", para: fim });
      } else if (pAtual == null || pct > pAtual) {
        ops.push({ alvo: "avanco", id: id, campo: "p", para: pct });
      }
    });
    return { ops: ops, pulou: pulou };
  };

  /* diário aprovado DEVOLVIDO: limpa o fim (e devolve o %) das entradas `o:"diario"` que só ele sustentava.
     `outros` = os OUTROS diários aprovados da obra. Só mexe em entrada que o próprio diário gravou. */
  B.opsRevisaoDiario = function (entradas, rdo, outros) {
    var por = {}, ops = [], pulou = [];
    arr(entradas).forEach(function (e) { if (e && e.id != null) por[String(e.id)] = e; });
    arr(rdo && rdo.etapasDia).forEach(function (it) {
      if (!it || it.noId == null || !it.concluiu) return;
      var id = String(it.noId), e = por[id];
      if (!e || e.o !== "diario" || dataMs(e.f) == null) { pulou.push({ noId: id, motivo: "a entrada não é do diário" }); return; }
      var outroConclui = false, maior = null;
      arr(outros).forEach(function (d) {
        if (!d || d.id === rdo.id || txt(d.obraId) !== txt(rdo.obraId) || !aprovado(d)) return;
        arr(d.etapasDia).forEach(function (x) {
          if (!x || String(x.noId) !== id) return;
          if (x.concluiu) outroConclui = true;
          else { var p = numOuNulo(x.pct); if (p != null && (maior == null || p > maior)) maior = p; }
        });
      });
      if (outroConclui) { pulou.push({ noId: id, motivo: "outro diário aprovado conclui a etapa" }); return; }
      ops.push({ alvo: "avanco", id: id, campo: "f", para: null });
      ops.push({ alvo: "avanco", id: id, campo: "p", para: maior == null ? 0 : maior });
    });
    return { ops: ops, pulou: pulou };
  };

  global.Bonificacao = B;
  if (typeof module !== "undefined" && module.exports) module.exports = B;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
