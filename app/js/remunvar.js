/* =====================================================================
 * remunvar.js — REMUNERAÇÃO VARIÁVEL POR PRODUÇÃO
 *
 * Motor puro (sem DOM, sem Store) da parte variável de quem paga por
 * metragem produzida. A parte FIXA (piso da categoria, vale alimentação)
 * não passa por aqui — ela é folha, e o vale, por decisão do cliente, fica
 * "fora de qualquer cálculo".
 *
 * ---------------------------------------------------------------------
 * A CONTA
 * ---------------------------------------------------------------------
 *
 *   pote da obra = m² aprovado na obra × R$/m²
 *      parte EQUIPE     (50%)  → dividida em partes iguais entre TODOS os
 *                                colaboradores daquela obra
 *      parte INDIVIDUAL (50%)  → rateada entre quem produziu, na proporção
 *                                do que cada um produziu
 *
 * Os dois percentuais e o R$/m² são parâmetro. Nada disso nasce escrito no
 * arquivo — ver a regra 1.
 *
 * ---------------------------------------------------------------------
 * CINCO REGRAS QUE NÃO PODEM SAIR DAQUI PARA A TELA
 * ---------------------------------------------------------------------
 *
 * 1) NENHUM NÚMERO DE NEGÓCIO NASCE AQUI. `PADRAO` tem R$/m² nulo. O 5,31
 *    da New Form mora na semente do perfil (js/perfis.js) e chega como dado.
 *    Um default plausível viraria folha errada no cliente seguinte, calada.
 *
 * 2) NÃO SE PAGA DUAS VEZES A MESMA PRODUÇÃO — e este é o defeito assinado
 *    deste canto do sistema. O módulo `producao.js` inteiro existe para
 *    impedir isso: cada linha carrega a CHAVE da origem (diário + item +
 *    pessoa) e `Producao.jaMedido` diz quanto já foi pago por origem.
 *    ⚠ Um motor irmão que leia os mesmos diários e gere um segundo pagamento
 *      SEM passar por essa chave desfaz a proteção por fora, e nada no
 *      sistema acusa: a mesma metragem sai pela tela de Produção e sai de
 *      novo aqui. Por isso `apurar` recebe `jaMedido` e o repassa para o
 *      `Producao.acumular` — e devolve as origens de cada linha, para a
 *      apuração poder ser registrada como pagamento e travar a próxima.
 *
 * 3) SÓ PAGA O QUE PASSOU PELAS DUAS APROVAÇÕES.
 *    O 1º nível é o do diário (o encarregado), e quem o aplica é o
 *    `Producao.ESTADOS_QUE_PAGAM`. O 2º nível é a APURAÇÃO — a gestão
 *    homologa o fechamento do mês antes de virar pagamento.
 *    ⚠ POR QUE O 2º NÍVEL MORA AQUI E NÃO NO DIÁRIO. Em `RDO.ESTADOS` o
 *      único estado depois de `aprovado` é `publicado`, e publicado é o que
 *      o CLIENTE FINAL enxerga. Usar "publicar" como homologação da gestão
 *      amarraria o pagamento da equipe a mostrar o diário para o cliente:
 *      obra sem portal nunca pagaria. Além disso `RDO.ESTADOS` é regra
 *      compartilhada com todos os clientes do OrçaPRO, e este segundo nível
 *      é deste. Aqui ele é dado da apuração, não estado do diário.
 *
 * 4) DINHEIRO EM CENTAVOS INTEIROS, DIVIDIDO PELO `Dinheiro`.
 *    Rateio em ponto flutuante perde e cria centavo: dez pessoas dividindo
 *    R$ 100,00 dá dez de R$ 10,00, mas três dividindo R$ 100,00 não dá três
 *    de R$ 33,33. `Dinheiro.dividir`/`Dinheiro.ratear` fecham a soma sempre —
 *    e fecham igual nos dois aparelhos, que é o que o merge da nuvem exige.
 *
 * 5) SEM PARÂMETRO NÃO SE APURA ZERO. R$/m² em branco não vira R$ 0,00 —
 *    vira pendência e a apuração não fecha. Zero é uma folha bonita que paga
 *    nada, e ninguém confere o que parece certo.
 * ===================================================================== */
(function (global) {
  "use strict";

  var RemunVar = {};

  function txt(x) { return String(x == null ? "" : x).trim(); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    if (global.Util && global.Util.parseNum) { var v = global.Util.parseNum(x); return isFinite(v) ? v : 0; }
    var s = String(x == null ? "" : x).replace(/[^0-9,.\-]/g, "");
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  RemunVar.num = num;

  /* centavos — usa o helper do app quando existe */
  function cent(reais) {
    if (global.Dinheiro && global.Dinheiro.paraCentavos) return global.Dinheiro.paraCentavos(reais);
    return Math.round(num(reais) * 100);
  }
  function reais(c) {
    if (global.Dinheiro && global.Dinheiro.paraReais) return global.Dinheiro.paraReais(c);
    return Math.round(Number(c) || 0) / 100;
  }
  function dividir(totalCent, n) {
    if (global.Dinheiro && global.Dinheiro.dividir) return global.Dinheiro.dividir(totalCent, n, "espalhar");
    var q = Math.max(1, n), base = Math.floor(totalCent / q), resto = totalCent - base * q, out = [], i;
    for (i = 0; i < q; i++) out.push(base + (i < resto ? 1 : 0));
    return out;
  }
  function ratear(totalCent, pesos) {
    if (global.Dinheiro && global.Dinheiro.ratear) return global.Dinheiro.ratear(totalCent, pesos);
    var soma = pesos.reduce(function (s, p) { return s + p; }, 0);
    if (!(soma > 0)) return pesos.map(function () { return 0; });
    var out = pesos.map(function (p) { return Math.floor(totalCent * p / soma); });
    var falta = totalCent - out.reduce(function (s, v) { return s + v; }, 0);
    for (var k = 0; k < falta; k++) out[k % out.length] += 1;
    return out;
  }

  /* ===================================================================
   * PARÂMETROS
   * =================================================================== */

  RemunVar.PADRAO = {
    porM2: null,              // R$ por m² produzido — sem isto não se apura
    rateioEquipePct: 50,      // quanto do pote é da equipe; o resto é individual
    equipe: "obra",           // "obra" = todos os colaboradores daquela obra
    periodicidade: "mensal",  // "mensal" | "quinzenal" | "semanal"
    exigeDoisNiveis: true,    // a gestão homologa a apuração antes de pagar
    unidade: "m2",
    /* ⚠ Os dois abaixo são da parte FIXA e NÃO entram em conta nenhuma aqui.
       Ficam guardados junto porque é o mesmo cadastro na cabeça de quem usa,
       e porque o vale, por decisão do cliente, é "valor fixo mensal, fora do
       cálculo" — não ter onde guardá-lo faria alguém somá-lo por engano. */
    valeAlimentacao: null,
    pisoCategoria: null
  };

  RemunVar.EQUIPES = {
    obra: "todos os colaboradores daquela obra",
    produtores: "somente quem produziu no período",
    empresa: "todos os colaboradores da empresa"
  };
  RemunVar.PERIODOS = { mensal: "Mensal", quinzenal: "A cada quinze dias", semanal: "Semanal" };

  RemunVar.parametros = function (bruto) {
    var b = bruto && typeof bruto === "object" ? bruto : {};
    return {
      porM2: b.porM2 == null || txt(b.porM2) === "" ? null : num(b.porM2),
      rateioEquipePct: b.rateioEquipePct == null || txt(b.rateioEquipePct) === "" ? 50 : num(b.rateioEquipePct),
      equipe: RemunVar.EQUIPES[b.equipe] ? b.equipe : "obra",
      periodicidade: RemunVar.PERIODOS[b.periodicidade] ? b.periodicidade : "mensal",
      exigeDoisNiveis: b.exigeDoisNiveis !== false,
      unidade: txt(b.unidade) || "m2",
      valeAlimentacao: b.valeAlimentacao == null || txt(b.valeAlimentacao) === "" ? null : num(b.valeAlimentacao),
      pisoCategoria: b.pisoCategoria == null || txt(b.pisoCategoria) === "" ? null : num(b.pisoCategoria)
    };
  };

  RemunVar.validarParametros = function (bruto) {
    var p = RemunVar.parametros(bruto);
    var f = [];
    if (p.porM2 == null) f.push("Falta o valor por m² produzido — sem ele não há o que dividir.");
    else if (p.porM2 <= 0) f.push("O valor por m² precisa ser maior que zero.");
    if (p.rateioEquipePct < 0 || p.rateioEquipePct > 100) f.push("O rateio da equipe precisa ficar entre 0 e 100%.");
    return f;
  };

  /* ===================================================================
   * PERÍODO — o fechamento
   * =================================================================== */

  /* "2026-08" → { de: "2026-08-01", ate: "2026-08-31" }. Recebe a competência
     pronta para o teste não depender do relógio. */
  RemunVar.periodoDe = function (competencia, periodicidade) {
    var c = txt(competencia);
    if (/^\d{4}-\d{2}$/.test(c)) {
      var ano = +c.slice(0, 4), mes = +c.slice(5, 7);
      var ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      return { de: c + "-01", ate: c + "-" + (ultimo < 10 ? "0" : "") + ultimo, rotulo: c };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return { de: c, ate: c, rotulo: c };
    return { de: "", ate: "", rotulo: c };
  };

  /* ===================================================================
   * QUEM DIVIDE O POTE DA OBRA
   *
   * ⚠ O DENOMINADOR DO RATEIO É A PARTE FRÁGIL DESTA CONTA. O único vínculo
   *   pessoa↔obra no sistema é `colaborador.obraId` — um campo único,
   *   opcional e sem histórico: quem troca de obra no meio do mês muda o
   *   valor de todo mundo, retroativamente. Por isso a lista sai daqui
   *   MARCADA (quem está alocado, quem produziu, quem é os dois) e a tela
   *   mostra nome por nome antes de fechar. Um rateio que a pessoa não
   *   consegue conferir é um rateio que ela vai contestar.
   * =================================================================== */
  RemunVar.equipeDaObra = function (colaboradores, linhasProducao, obraId, par) {
    var p = RemunVar.parametros(par);
    var oid = txt(obraId);
    var produziu = {};
    arr(linhasProducao).forEach(function (l) {
      if (l && txt(l.colaboradorId)) produziu[txt(l.colaboradorId)] = 1;
    });

    var out = [];
    arr(colaboradores).forEach(function (c) {
      if (!c || !txt(c.id)) return;
      if (c.ativo === false) return;
      var id = txt(c.id);
      var alocado = p.equipe === "empresa" ? true : (oid ? txt(c.obraId) === oid : false);
      var prod = !!produziu[id];
      if (p.equipe === "produtores" && !prod) return;
      if (p.equipe === "obra" && !alocado && !prod) return;
      out.push({
        id: id, nome: c.nome || c.apelido || id,
        alocado: alocado, produziu: prod,
        origem: alocado && prod ? "ambos" : (alocado ? "alocado" : "produziu")
      });
    });

    /* quem produziu e nem está no cadastro de colaboradores não pode sumir:
       ele tem direito à parte individual, e a tela precisa saber que existe */
    Object.keys(produziu).forEach(function (id) {
      for (var i = 0; i < out.length; i++) if (out[i].id === id) return;
      out.push({ id: id, nome: "(colaborador não cadastrado)", alocado: false, produziu: true, origem: "produziu", semCadastro: true });
    });

    return out.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "pt-BR"); });
  };

  /* ===================================================================
   * APURAR
   *
   * entrada: {
   *   obraId, competencia | de/ate,
   *   producao: [linhas de Producao.acumular],   // já filtradas por unidade
   *   equipe:   [{id, nome}],                    // quem divide o pote
   *   parametros: {}
   * }
   * =================================================================== */
  RemunVar.apurar = function (entrada) {
    var e = entrada || {};
    var p = RemunVar.parametros(e.parametros);
    var pend = RemunVar.validarParametros(e.parametros);

    var unidade = String(p.unidade).toLowerCase().replace("²", "2");
    var linhas = arr(e.producao).filter(function (l) {
      return l && String(txt(l.unidade)).toLowerCase().replace("²", "2") === unidade;
    });
    var foraDaUnidade = arr(e.producao).length - linhas.length;
    if (foraDaUnidade > 0) {
      pend.push(foraDaUnidade + " lançamento(s) em outra unidade ficaram de fora — a conta é por " + unidade + ".");
    }

    /* --- m² por pessoa e origens (regra 2) --- */
    var porPessoa = {}, ordem = [], m2Total = 0, origens = [];
    linhas.forEach(function (l) {
      var id = txt(l.colaboradorId);
      if (!id) return;
      var q = num(l.qtd);
      if (q <= 0) return;
      if (!porPessoa[id]) { porPessoa[id] = { colaboradorId: id, nome: l.nome || "", m2: 0, origens: [] }; ordem.push(id); }
      porPessoa[id].m2 = Math.round((porPessoa[id].m2 + q) * 100) / 100;
      m2Total = Math.round((m2Total + q) * 100) / 100;
      arr(l.origens).forEach(function (o) {
        porPessoa[id].origens.push(o);
        origens.push(o);
      });
      if (!arr(l.origens).length && l.origem) { porPessoa[id].origens.push(l.origem); origens.push(l.origem); }
    });

    /* --- o pote --- */
    var poteCent = p.porM2 == null ? null : cent(m2Total * p.porM2);
    var equipeCent = poteCent == null ? null : Math.round(poteCent * p.rateioEquipePct / 100);
    var individualCent = poteCent == null ? null : poteCent - equipeCent;

    /* --- quem divide a parte da equipe --- */
    var equipe = arr(e.equipe).filter(function (x) { return x && txt(x.id); });
    if (poteCent != null && equipeCent > 0 && !equipe.length) {
      pend.push("A parte da equipe tem valor mas ninguém para dividir — indique quem trabalha nesta obra.");
    }
    var fatiaEquipe = (equipe.length && equipeCent != null) ? dividir(equipeCent, equipe.length) : [];

    /* --- a parte individual, proporcional ao que cada um produziu --- */
    var pesos = ordem.map(function (id) { return porPessoa[id].m2; });
    var fatiaIndiv = (ordem.length && individualCent != null) ? ratear(individualCent, pesos) : [];

    /* --- junta os dois lados numa linha por pessoa --- */
    var mapa = {};
    function linhaDe(id, nome) {
      if (!mapa[id]) mapa[id] = { colaboradorId: id, nome: nome || "", m2: 0, equipeCent: 0, individualCent: 0, origens: [] };
      if (nome && !mapa[id].nome) mapa[id].nome = nome;
      return mapa[id];
    }
    ordem.forEach(function (id, i) {
      var L = linhaDe(id, porPessoa[id].nome);
      L.m2 = porPessoa[id].m2;
      L.individualCent = fatiaIndiv[i] || 0;
      L.origens = porPessoa[id].origens.slice();
    });
    equipe.forEach(function (x, i) {
      var L = linhaDe(txt(x.id), x.nome);
      L.equipeCent = fatiaEquipe[i] || 0;
      L.naEquipe = true;
      if (x.origem) L.origemEquipe = x.origem;
      if (x.semCadastro) L.semCadastro = true;
    });

    var out = Object.keys(mapa).map(function (id) {
      var L = mapa[id];
      L.totalCent = L.equipeCent + L.individualCent;
      L.equipe = reais(L.equipeCent);
      L.individual = reais(L.individualCent);
      L.total = reais(L.totalCent);
      return L;
    }).sort(function (a, b) { return b.totalCent - a.totalCent; });

    var somaCent = out.reduce(function (s, L) { return s + L.totalCent; }, 0);
    /* ⚠ INVARIANTE: o que sai tem de ser exatamente o que foi distribuído.
       Cada metade só é distribuída se tiver para quem ir — sem ninguém na
       equipe, a parte da equipe não some no rateio, fica de fora e a
       pendência acima diz isso. Se este assert falhar um dia, é centavo
       criado ou perdido no rateio: vira diferença de folha que ninguém
       sabe explicar, e é por isso que `podeAprovar` recusa. */
    var distribuidoCent = poteCent == null ? 0
      : (equipe.length ? equipeCent : 0) + (ordem.length ? individualCent : 0);
    var fecha = poteCent == null || somaCent === distribuidoCent;

    if (m2Total <= 0) pend.push("Nenhuma metragem aprovada no período.");
    /* ⚠ O POTE É DA OBRA, então a apuração também é. Sem obra, `equipeDaObra`
       não tem como saber quem está alocado onde e a parte de equipe acabaria
       dividida só entre quem produziu — o encarregado que não põe a mão na
       massa ficaria de fora, que é o oposto da decisão C2 ("todos os
       colaboradores daquela obra"). Melhor recusar do que ratear errado. */
    if (!txt(e.obraId) && p.equipe === "obra") {
      pend.push("Escolha a obra — o pote é por obra, e sem ela não dá para saber quem divide a parte da equipe.");
    }

    return {
      obraId: txt(e.obraId),
      de: txt(e.de), ate: txt(e.ate), competencia: txt(e.competencia),
      unidade: unidade,
      m2: m2Total,
      porM2: p.porM2,
      poteCent: poteCent, pote: poteCent == null ? null : reais(poteCent),
      equipeCent: equipeCent, equipeTotal: equipeCent == null ? null : reais(equipeCent),
      individualCent: individualCent, individualTotal: individualCent == null ? null : reais(individualCent),
      rateioEquipePct: p.rateioEquipePct,
      quantosDividem: equipe.length,
      linhas: out,
      origens: origens,
      somaCent: somaCent, soma: reais(somaCent),
      fecha: fecha,
      exigeDoisNiveis: p.exigeDoisNiveis,
      pendencias: pend,
      completa: pend.length === 0 && poteCent != null && m2Total > 0
    };
  };

  /* ===================================================================
   * A APURAÇÃO COMO REGISTRO — o 2º nível de aprovação (regra 3)
   * =================================================================== */

  RemunVar.ESTADOS = {
    rascunho: "Rascunho",
    aprovada: "Aprovada pela gestão",
    paga: "Paga"
  };

  RemunVar.podeAprovar = function (apuracao, resultado) {
    var f = [];
    if (!apuracao || apuracao.estado === "paga") f.push("Apuração já paga.");
    if (resultado && !resultado.completa) f.push("A apuração tem pendências.");
    if (resultado && !resultado.fecha) f.push("O rateio não fechou com o pote — não aprove; isso é centavo criado ou perdido.");
    return { ok: f.length === 0, motivos: f };
  };

  /* Congela o resultado dentro da apuração. Depois disso a folha lê o que foi
     homologado, não o que o diário disser depois. */
  RemunVar.aprovar = function (apuracao, resultado, quem, quandoISO) {
    var chk = RemunVar.podeAprovar(apuracao, resultado);
    if (!chk.ok) return { ok: false, motivos: chk.motivos };
    var a = apuracao;
    a.estado = "aprovada";
    a.aprovadaPor = txt(quem);
    a.aprovadaEm = txt(quandoISO) || (global.Util && global.Util.agoraISO ? global.Util.agoraISO() : new Date().toISOString());
    a.m2 = resultado.m2;
    a.porM2 = resultado.porM2;
    a.poteCent = resultado.poteCent;
    a.rateioEquipePct = resultado.rateioEquipePct;
    a.linhas = resultado.linhas.map(function (L) {
      return {
        colaboradorId: L.colaboradorId, nome: L.nome, m2: L.m2,
        equipeCent: L.equipeCent, individualCent: L.individualCent, totalCent: L.totalCent
      };
    });
    /* ⚠ as origens vão junto: é o que permite a próxima apuração saber que
       esta metragem já foi paga (regra 2). Sem elas, refazer o mês paga de
       novo e nada acusa. */
    a.origens = (resultado.origens || []).slice();
    return { ok: true, apuracao: a };
  };

  /* Quanto cada origem já foi paga por apurações anteriores — no MESMO
     formato de `Producao.jaMedido`, que é o que `Producao.acumular` espera
     em `jaMedido`: chave da origem → QUANTIDADE já paga.
     ⚠ A quantidade importa. Guardar só "foi paga" faria a correção de um
       apontamento para MAIS sumir para sempre: o dia foi pago com 20 m², o
       encarregado corrigiu para 30, e os 10 que faltam nunca mais apareceriam.
       É a mesma razão pela qual producao.js guarda `{o, q}` e não a chave
       crua — e é por isso que `apurar` devolve as origens como objetos. */
  RemunVar.jaPago = function (apuracoes) {
    var mapa = {};
    arr(apuracoes).forEach(function (a) {
      if (!a || (a.estado !== "aprovada" && a.estado !== "paga")) return;
      arr(a.origens).forEach(function (o) {
        if (!o) return;
        /* forma antiga (chave crua, sem quantidade): trata como paga por
           inteiro — é o mais seguro quando não se sabe quanto foi */
        if (typeof o === "string") { mapa[o] = Infinity; return; }
        if (!o.o) return;
        mapa[o.o] = (mapa[o.o] === Infinity ? Infinity : (mapa[o.o] || 0) + num(o.q));
      });
    });
    return mapa;
  };

  /* Lançamentos prontos para a Folha Semanal (`fs_lancamentos`). O objeto é
     o mesmo que a tela de Produção grava — ver `prodParaFolha` no gestao.js —
     para o valor entrar no fechamento por obra e na lista de PIX sem que a
     Folha precise conhecer este módulo. */
  RemunVar.paraFolha = function (apuracao, colaboradores) {
    var ix = {};
    arr(colaboradores).forEach(function (c) { if (c && c.id) ix[txt(c.id)] = c; });
    return arr(apuracao && apuracao.linhas).filter(function (L) { return L.totalCent > 0; }).map(function (L) {
      var c = ix[txt(L.colaboradorId)] || {};
      return {
        obraId: txt(apuracao.obraId),
        colaboradorId: L.colaboradorId,
        nome: L.nome || c.nome || "",
        funcao: c.funcao || "",
        favorecido: c.favorecido || c.nome || L.nome || "",
        chavePix: c.chavePix || "",
        tipo: "producao",
        valor: reais(L.totalCent),
        dias: {}, he: 0,
        obs: "Parte variável " + (apuracao.competencia || "") + " · " + L.m2 + " m² · equipe "
          + reais(L.equipeCent).toFixed(2) + " + individual " + reais(L.individualCent).toFixed(2),
        remunvarId: txt(apuracao.id)
      };
    });
  };

  global.RemunVar = RemunVar;
  if (typeof module !== "undefined" && module.exports) module.exports = RemunVar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
