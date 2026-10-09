/* =====================================================================
 * orcmodelo.js — ORÇAMENTO PELO MODELO (F1, motor puro, Node-testável)
 *
 * Pedido do Rogério (07/10/2026): "quando o usuário modelar, ele já tem o
 * orçamento — e o tempo, e o peso". Cada peça do BIM (família colocada,
 * parede/laje/pilar/viga/cobertura criadas no editor) tem um ou mais
 * SERVIÇOS: um código de composição + a quantidade que a geometria dá. Este
 * motor cruza isso com a base SINAPI ANALÍTICA que o app já carrega
 * (js/analitico.js) e devolve, por serviço:
 *   custo MO/MAT/EQ (quantidade × composição), horas de mão de obra por
 *   FUNÇÃO (pedreiro, servente…, inclusive as que vêm de subcomposição),
 *   duração com a equipe informada e o peso da peça (NBR 6120, js/bimpeso.js).
 *
 * ⚠ AS TRÊS REGRAS QUE NÃO DOBRAM (é dinheiro):
 *   1. Código que não está na base = "pendente". Nunca se inventa composição,
 *      nem se procura "a parecida": o orçamento diria um serviço que ninguém
 *      escolheu.
 *   2. A unidade da composição TEM de ser a da quantidade (m² × M2). Se não
 *      bater, a linha sai com aviso e SEM custo — nunca se converte calado
 *      (m² de parede vezes um preço por m³ é erro de 7×, 10×, e ninguém vê).
 *   3. O preço vem da base VIGENTE no momento da conta, nunca da família: a
 *      família leva o código, não o valor (PLANO-BIM-FAMILIAS-FORMATOS.md §1).
 *
 * P1-D (09/10/2026): a QUANTIDADE de cada serviço sai do REGISTRO ÚNICO de
 *   parâmetros (js/bimparam.js) pelo id do parâmetro (`orc.medida`), e a linha
 *   leva esse id (l.param) — o mesmo número da tela e do Qto do IFC. A regra 2
 *   compara com a unidade do PARÂMETRO. Prova: tools/test-p1-saida.js.
 *
 * P2 integração (09/10/2026): FORRO (Área, Área bruta, Perímetro = tabica,
 *   Volume) é peça do orçamento como as outras; AMBIENTE orça também pelas
 *   medidas DELE no registro (Área, Perímetro, Volume — além do acabamento
 *   da P2-C). Mesmas três regras. Prova: tools/test-p2-saida.js.
 *
 * ⚠ HORAS: só entra como hora de mão de obra o insumo que É mão de obra
 *   (`tipoInsumo: mao_obra`, ou "… COM ENCARGOS COMPLEMENTARES/SOCIAIS",
 *   "(HORISTA)", "(MENSALISTA)" — a mesma régua do Analitico._normalizar) e
 *   está em H. A `categoria` NÃO serve: o Analitico reclassifica subcomposição
 *   pela razão predominante, e uma argamassa com muita mão de obra viraria
 *   "hora de servente" inteira. Mão de obra em MES não vira hora (aviso).
 *   Subcomposição (argamassa, concreto…) é aberta: as horas dela, vezes o
 *   coeficiente, entram na função certa, com a trilha em `via`.
 *
 * ⚠ DURAÇÃO: por serviço, a função que mais demora com a equipe dada
 *   (h ÷ (nº de pessoas × horas/dia)) — a "crítica". No modelo inteiro são
 *   DOIS números, e a tela diz os dois: em paralelo (cada função trabalhando
 *   sem esperar a outra = o piso) e em sequência (um serviço depois do outro
 *   = o teto). A sequência real é do cronograma.
 *
 * ⚠ PESO: família = Σ volume de cada sólido × γ do material dele (tabela da
 *   NBR 6120 no js/bimpeso.js). Material sem γ (ex.: "Madeira" sem espécie)
 *   deixa a peça SEM peso, com o motivo — nunca um peso de reserva. Elemento
 *   do editor: volume × γ casado pela DESCRIÇÃO do serviço principal, só
 *   quando ele é de volume (alvenaria, concreto); pintura não pesa a parede.
 * ===================================================================== */
(function (global) {
  "use strict";

  var G = 9.80665;   /* kN → kg (o mesmo do js/bimpeso.js) */
  var RE_MO = / COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/;

  function txt(v) { return v == null ? "" : String(v).trim(); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function r2(v) { return Math.round((num(v) + 1e-9) * 100) / 100; }
  function r4(v) { return Math.round(num(v) * 10000) / 10000; }
  function semAcento(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s); }

  /* dependências do app, com a cópia para o Node (o gate roda sem DOM) */
  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }

  /* A UNIDADE comparada por CHAVE ("M2" = "m²" = "m2"): a régua do app é o
     Util.unidadeChave; sem ele (Node), a mesma regra curta. */
  function unidadeChave(u) {
    var U = global.Util;
    if (U && typeof U.unidadeChave === "function") return U.unidadeChave(u);
    var s = semAcento(u).toLowerCase().replace(/²/g, "2").replace(/³/g, "3").replace(/[^a-z0-9]/g, "");
    if (s === "und" || s === "unid" || s === "uni" || s === "unidade") return "un";
    if (s === "hora" || s === "hr") return "h";
    return s;
  }
  function mesmaUnidade(a, b) { return !!txt(a) && unidadeChave(a) === unidadeChave(b); }

  /* "PEDREIRO COM ENCARGOS COMPLEMENTARES" → "Pedreiro" (o nome que a tela mostra) */
  function funcaoDe(descricao) {
    var s = txt(descricao).toUpperCase().replace(RE_MO, "").replace(/\s+/g, " ").trim();
    if (!s) return "Mão de obra";
    return s.charAt(0) + s.slice(1).toLowerCase();
  }
  /* a chave da função para somar e para a equipe: sem acento, maiúscula */
  function chaveFuncao(nome) { return semAcento(nome).toUpperCase().replace(/\s+/g, " ").trim(); }
  function ehMaoDeObra(it) {
    return it && (it.tipoInsumo === "mao_obra" || RE_MO.test(txt(it.descricao).toUpperCase()) || (it.tipo === "INSUMO" && it.categoria === "MO"));
  }

  /* --------------------------------------------------------------------
   * HORAS de uma composição × quantidade, abrindo as subcomposições.
   * acc[chaveFuncao] = { funcao, h, direta, via:{codigoSub:1} }
   * ------------------------------------------------------------------ */
  function horasDe(comp, qtd, base, acc, avisos, trilha, via, prof) {
    arr(comp && comp.insumos).forEach(function (it) {
      var coef = num(it.coeficiente, 0);
      if (!(coef > 0)) return;
      if (ehMaoDeObra(it)) {
        var nome = funcaoDe(it.descricao), k = chaveFuncao(nome);
        if (unidadeChave(it.unidade) !== "h") {
          var av = "mão de obra em " + txt(it.unidade) + " não vira horas: " + nome + (via ? " (dentro de " + via + ")" : "");
          if (avisos.indexOf(av) < 0) avisos.push(av);
          return;
        }
        var a = acc[k] || (acc[k] = { funcao: nome, h: 0, direta: 0, via: {} });
        a.h += coef * qtd;
        if (via) a.via[via] = 1; else a.direta += coef * qtd;
        return;
      }
      if (it.tipo !== "COMPOSICAO") return;
      var cod = txt(it.codigo);
      if (trilha[cod] || prof > 8) return;           /* ciclo ou profundidade absurda: não segue */
      var sub = base && typeof base.obter === "function" ? base.obter(cod) : null;
      if (!sub) {
        var av2 = "subcomposição " + cod + " não está na base analítica: a mão de obra dela não foi contada";
        if (avisos.indexOf(av2) < 0) avisos.push(av2);
        return;
      }
      trilha[cod] = 1;
      horasDe(sub, qtd * coef, base, acc, avisos, trilha, via || cod, prof + 1);
      delete trilha[cod];
    });
  }

  function equipeDe(opcoes, chave) {
    var eq = (opcoes && opcoes.equipe) || {}, n = null;
    Object.keys(eq).forEach(function (k) { if (chaveFuncao(k) === chave) n = num(eq[k], 0); });
    return n > 0 ? n : 1;                             /* sem equipe informada: 1 pessoa por função */
  }
  function horasDia(opcoes) { var h = num(opcoes && opcoes.horasDia, 8); return h > 0 && h <= 24 ? h : 8; }

  /* lista de horas (ordenada, maior primeiro) + a função crítica e a duração */
  function fecharHoras(acc, opcoes) {
    var hd = horasDia(opcoes), lista = [], crit = null, dur = 0, tot = 0;
    Object.keys(acc).forEach(function (k) {
      var a = acc[k], n = equipeDe(opcoes, k), d = a.h / (n * hd);
      tot += a.h;
      lista.push({ funcao: a.funcao, chave: k, h: r2(a.h), direta: r2(a.direta), via: Object.keys(a.via || {}), pessoas: n, dias: r2(d) });
      if (d > dur + 1e-12) { dur = d; crit = a.funcao; }
    });
    lista.sort(function (x, y) { return y.h - x.h || x.funcao.localeCompare(y.funcao); });
    return { horas: lista, horasTotal: r2(tot), duracaoDias: r2(dur), funcaoCritica: crit, horasDia: hd };
  }

  /* --------------------------------------------------------------------
   * orcar — UM serviço: { codigo, unidade, quantidade, descricao? }
   * status: "ok" | "sem-codigo" | "pendente" (código fora da base) |
   *         "unidade" (não bate) | "sem-base" (base não carregada)
   * ------------------------------------------------------------------ */
  function orcar(servico, base, opcoes) {
    servico = servico || {};
    var cod = txt(servico.codigo), q = num(servico.quantidade, 0), un = txt(servico.unidade);
    var L = { codigo: cod, descricao: txt(servico.descricao), unidade: "", unidadeQto: un, quantidade: r4(q), status: "ok",
              custo: null, unitario: null, horas: [], horasTotal: 0, duracaoDias: 0, funcaoCritica: null, avisos: [],
              servico: servico.id || null, rotulo: txt(servico.rotulo) };
    if (!cod) { L.status = "sem-codigo"; L.avisos.push("sem código de composição: não entra no orçamento"); return L; }
    if (!base || typeof base.obter !== "function") { L.status = "sem-base"; L.avisos.push("a base analítica não está carregada"); return L; }
    var c = base.obter(cod);
    if (!c) { L.status = "pendente"; L.avisos.push("o código " + cod + " não existe na base analítica carregada — pendente (nunca se inventa composição)"); return L; }
    L.descricao = txt(c.descricao) || L.descricao;
    L.unidade = txt(c.unidade);
    L.grupo = txt(c.grupo);
    if (!mesmaUnidade(c.unidade, un)) {
      L.status = "unidade";
      L.avisos.push("a composição " + cod + " é em " + txt(c.unidade) + " e a quantidade do modelo é em " + (un || "(sem unidade)") + " — não converto: escolha outra composição ou outra medida");
      return L;
    }
    if (!(q > 0)) L.avisos.push("quantidade zero: confira as medidas da peça");
    var mo = num(c.custoMO), mat = num(c.custoMAT), eq = num(c.custoEQ), cu = num(c.custoUnitario, mo + mat + eq);
    L.unitario = { mo: mo, mat: mat, eq: eq, total: cu };
    L.custo = { mo: mo * q, mat: mat * q, eq: eq * q, total: cu * q };
    if (c._precoAviso) L.avisos.push(c._precoAviso);
    var acc = {};
    horasDe(c, q, base, acc, L.avisos, (function () { var t = {}; t[cod] = 1; return t; })(), "", 0);
    var fh = fecharHoras(acc, opcoes);
    L.horas = fh.horas; L.horasTotal = fh.horasTotal; L.duracaoDias = fh.duracaoDias; L.funcaoCritica = fh.funcaoCritica;
    return L;
  }

  /* --------------------------------------------------------------------
   * PESO
   * ------------------------------------------------------------------ */
  function volumeSolido(s) {
    if (!s) return 0;
    if (s.forma === "caixa") return num(s.dx) * num(s.dy) * num(s.dz);
    if (s.forma === "cilindro") return Math.PI * num(s.raio) * num(s.raio) * num(s.altura);
    var c = arr(s.contorno), a = 0;
    for (var i = 0; i < c.length; i++) { var p = c[i], q = c[(i + 1) % c.length]; a += num(p[0]) * num(q[1]) - num(q[0]) * num(p[1]); }
    return Math.abs(a) / 2 * num(s.altura);
  }
  function gamaDe(nomeMaterial) {
    var BP = dep("BimPeso", "./bimpeso.js");
    if (!BP || !BP.casarMaterial) return null;
    return BP.casarMaterial(nomeMaterial);
  }
  /* sólidos AVALIADOS da família → { ok, kg, kN, porMaterial:[...], motivo } */
  function pesoSolidos(solidos) {
    var faltam = [], porMat = {}, kN = 0, n = 0;
    arr(solidos).forEach(function (s) {
      var v = volumeSolido(s); if (!(v > 0)) return;
      n++;
      var nome = txt(s.material) || "(sem material)", t = txt(s.material) ? gamaDe(s.material) : null;
      if (!t) { if (faltam.indexOf(nome) < 0) faltam.push(nome); return; }
      var pm = porMat[t.id] || (porMat[t.id] = { material: nome, entrada: t.id, kNm3: t.kNm3, ref: t.ref, volume: 0, kN: 0 });
      pm.volume += v; pm.kN += v * t.kNm3; kN += v * t.kNm3;
    });
    if (!n) return { ok: false, motivo: "a peça não tem volume", kg: null, kN: null, porMaterial: [] };
    var lista = Object.keys(porMat).map(function (k) { var p = porMat[k]; return { material: p.material, entrada: p.entrada, kNm3: p.kNm3, ref: p.ref, volume: r4(p.volume), kg: r2(p.kN * 1000 / G) }; });
    if (faltam.length) return { ok: false, motivo: "material sem peso específico na NBR 6120: " + faltam.join(", ") + " (informe o material com a espécie/tipo)", kg: null, kN: null, porMaterial: lista };
    return { ok: true, kg: r2(kN * 1000 / G), kN: r4(kN), porMaterial: lista, motivo: "" };
  }
  /* elemento do editor: volume × γ pela descrição do serviço principal */
  function pesoPorDescricao(volume, descricao, classe) {
    var vol = num(volume, 0);
    if (!(vol > 0)) return { ok: false, motivo: "sem volume", kg: null };
    if (classe && !/^(alvenaria|concreto|parede_concreto|fundacao_concreto|premoldado)/.test(classe)) return { ok: false, motivo: "o serviço principal não é de volume (" + classe + "): o peso da peça não sai dele", kg: null };
    if (!classe && !/^(ALVENARIA|CONCRETAGEM|CONCRETO)/i.test(txt(descricao))) return { ok: false, motivo: "o serviço principal não é de alvenaria nem de concreto: o peso da peça não sai dele", kg: null };
    /* "CONCRETAGEM DE PILARES…" não diz "concreto armado" — mas concretagem de
       estrutura É concreto armado, e é o que a própria tabela do bimpeso usa
       para concreto sem especificação (25 kN/m³, o lado seguro no içamento) */
    var ehConc = classe ? /^(concreto|parede_concreto|fundacao_concreto|premoldado)/.test(classe) : /^CONCRETAGEM/i.test(txt(descricao));
    var t = gamaDe(ehConc ? "Concreto armado" : descricao);
    if (!t) return { ok: false, motivo: "a descrição do serviço não casa com material da NBR 6120", kg: null };
    var kN = vol * t.kNm3;
    return { ok: true, kg: r2(kN * 1000 / G), kN: r4(kN), porMaterial: [{ material: t.nome, entrada: t.id, kNm3: t.kNm3, ref: t.ref, volume: r4(vol), kg: r2(kN * 1000 / G) }], motivo: "" };
  }

  /* --------------------------------------------------------------------
   * RESUMO de várias linhas (uma peça, ou o modelo inteiro)
   * ------------------------------------------------------------------ */
  function resumir(linhas, opcoes) {
    var c = { mo: 0, mat: 0, eq: 0, total: 0 }, acc = {}, seq = 0, nOk = 0, prob = [];
    arr(linhas).forEach(function (l) {
      if (l.status !== "ok") { prob.push(l); return; }
      nOk++;
      c.mo += l.custo.mo; c.mat += l.custo.mat; c.eq += l.custo.eq; c.total += l.custo.total;
      seq += num(l.duracaoDias);
      arr(l.horas).forEach(function (h) {
        var a = acc[h.chave] || (acc[h.chave] = { funcao: h.funcao, h: 0, direta: 0, via: {} });
        a.h += num(h.h); a.direta += num(h.direta); arr(h.via).forEach(function (v) { a.via[v] = 1; });
      });
    });
    var fh = fecharHoras(acc, opcoes);
    return { custo: { mo: r2(c.mo), mat: r2(c.mat), eq: r2(c.eq), total: r2(c.total) }, horas: fh.horas, horasTotal: fh.horasTotal,
             prazoParaleloDias: fh.duracaoDias, funcaoCritica: fh.funcaoCritica, prazoSequencialDias: r2(seq), horasDia: fh.horasDia,
             linhasOk: nOk, problemas: prob.length };
  }
  function arredLinha(l) {
    if (l.custo) l.custo = { mo: r2(l.custo.mo), mat: r2(l.custo.mat), eq: r2(l.custo.eq), total: r2(l.custo.total) };
    return l;
  }

  /* --------------------------------------------------------------------
   * FAMÍLIA avaliada (Familia.avaliar) → linhas: o quantitativo (principal)
   * + os serviços da família + os que a INSTÂNCIA ganhou no editor
   * (servicosInst: [{codigo, medida:'quantidade', fator}]).
   * ------------------------------------------------------------------ */
  function daFamilia(av, base, opcoes, servicosInst, peca) {
    if (!av || !av.quantitativo) return { linhas: [], resumo: resumir([], opcoes), peso: { ok: false, motivo: "família não avaliada", kg: null } };
    var q = av.quantitativo, linhas = [];
    /* P1-D: com a peça resolvida pelo registro, a quantidade e a unidade do
       quantitativo são as dos parâmetros RA_FAM_QUANTIDADE / RA_FAM_UNIDADE */
    var BP = dep("BimParam", "./bimparam.js"), qReg = peca && BP && BP.quantidade ? BP.quantidade(peca, "quantidade") : null;
    if (qReg) {
      var unR = peca.porId && peca.porId.RA_FAM_UNIDADE ? peca.porId.RA_FAM_UNIDADE.valor : q.unidade, q2 = {};
      Object.keys(q).forEach(function (k) { q2[k] = q[k]; });
      q2.quantidade = qReg.valorOrc != null ? qReg.valorOrc : qReg.valor; q2.unidade = unR; q2.param = qReg.def.id; q = q2;   /* P1-acab: a régua do orçamento */
    }
    /* serviços da INSTÂNCIA (Propriedades › Orçamento): "servico:<id>" dá o
       código a um serviço da família (SOBREPÕE o dela — nunca soma dois);
       "quantidade" é camada a mais sobre a quantidade da família (ex.: o
       reboco das duas faces da alvenaria, fator 2) */
    var sobre = {}, extras = [];
    arr(servicosInst).forEach(function (s) {
      var m = /^servico:(.+)$/.exec(txt(s.medida));
      if (m) sobre[m[1].toLowerCase()] = s; else extras.push(s);
    });
    linhas.push(orcar({ id: "principal", codigo: q.codigo, unidade: q.unidade, quantidade: q.quantidade, descricao: q.descricao, rotulo: "Quantitativo da família" }, base, opcoes));
    linhas[0].codigoOrigem = q.codigoOrigem || "";
    if (q.param) linhas[0].param = q.param;
    arr(av.servicos).forEach(function (s) {
      var si = sobre[String(s.id).toLowerCase()], cod = si ? txt(si.codigo) : txt(s.codigo);
      if (si) delete sobre[String(s.id).toLowerCase()];
      if (!cod) return;                                /* serviço da família ainda sem código: não entra (a tela mostra o campo vazio) */
      var l = orcar({ id: s.id, codigo: cod, unidade: s.unidade, quantidade: s.quantidade * (si ? num(si.fator, 1) : 1), descricao: s.descricao, rotulo: s.descricao }, base, opcoes);
      l.codigoOrigem = si ? "instancia" : s.codigoOrigem; l.medida = "servico:" + s.id; linhas.push(l);
    });
    Object.keys(sobre).forEach(function (k) {         /* serviço que a família não tem (ela mudou): diz, não some */
      var lx = orcar({ id: "inst-" + k, codigo: sobre[k].codigo, unidade: "", quantidade: 0 }, null, opcoes);
      lx.status = "unidade"; lx.avisos = ["a família não tem mais o serviço \"" + k + "\""]; linhas.push(lx);
    });
    extras.forEach(function (s, i) {
      if (s.medida !== "quantidade") {
        var lx = orcar({ id: "inst" + i, codigo: s.codigo, unidade: "", quantidade: 0 }, null, opcoes);
        lx.status = "unidade"; lx.avisos = ["família colocada só aceita a medida \"quantidade da família\" ou um serviço dela"]; linhas.push(lx); return;
      }
      var l2 = orcar({ id: "inst" + i, codigo: s.codigo, unidade: q.unidade, quantidade: q.quantidade * num(s.fator, 1), rotulo: s.rotulo || "Camada da peça" }, base, opcoes);
      l2.codigoOrigem = "instancia"; l2.medida = "quantidade"; l2.fator = num(s.fator, 1); if (q.param) l2.param = q.param; linhas.push(l2);
    });
    linhas.forEach(arredLinha);
    return { linhas: linhas, resumo: resumir(linhas, opcoes), peso: pesoSolidos(av.solidos) };
  }

  /* --------------------------------------------------------------------
   * P1-D — A QUANTIDADE SAI DO REGISTRO (js/bimparam.js), pelo id do
   * parâmetro: a mesma "Área" da tela de Propriedades e do Qto do IFC. Este
   * motor não faz conta de medida. Duas medidas não são parâmetro:
   *   "un"      = CONTAGEM da peça (1) — o campo "Contagem" da tabela;
   *   "kgPorM3" = o parâmetro Volume × a taxa de aço (o fator).
   * A regra 2 segue: a unidade da composição tem de ser a do PARÂMETRO.
   * Volume livre (B4) não é categoria do registro: as medidas da malha
   * (BimEdit.medidasDe), como sempre.
   * ------------------------------------------------------------------ */
  /* P2 integração: + forro (js/bimforro.js — Área, Área bruta, Perímetro = tabica, Volume) e
     ambiente (js/bimambiente.js — Área, Perímetro, Volume), as medidas do registro */
  var CAT_EL = { parede: "parede", laje: "laje", pilar: "pilar", viga: "viga", escada: "escada", guarda: "guarda", cobertura: "cobertura", rampa: "rampa", forro: "forro", ambiente: "ambiente" };   /* P9: rampa (Volume, Área de piso, Projeção, Fôrma, Percurso) */
  /* P11 (js/bimterreno.js): as peças do terreno e a lista do estado.terreno de cada uma */
  var CAT_P11 = { topossolido: "topossolido", subregiao: "subregiao", plataforma: "plataforma", divisa: "divisa", compTerreno: "componente_terreno" };
  var LISTA_P11 = { topossolido: "topos", subregiao: "subregioes", plataforma: "plataformas", divisa: "divisas", componente_terreno: "componentes" };
  Object.keys(CAT_P11).forEach(function (k) { CAT_EL[k] = CAT_P11[k]; });
  CAT_EL.telhado = "telhado"; CAT_EL.borda = "borda"; CAT_EL.fundacao = "fundacao";   /* P3: js/bimtelhado.js, js/bimfundacao.js */
  /* categorias que nunca são de concreto: não oferecem armação por taxa (kg/m³) */
  var SEM_ARMACAO = { cobertura: 1, guarda: 1, forro: 1, ambiente: 1, topossolido: 1, subregiao: 1, plataforma: 1, divisa: 1, componente_terreno: 1, telhado: 1, borda: 1 };   /* P3: telhado e borda */   /* P11: terreno */
  var ORDEM_MEDIDAS = ["area", "areaBruta", "volume", "comprimento", "areaForma", "areaProjecao", "un", "kgPorM3", "areaFora", "areaDentro", "massa", "corte", "aterro", "areaEspelho", "comprimentoCorrimao",
                       /* P3: linhas do telhado e derivados da fundação (BimEdit.MEDIDAS_ORC) */
                       "espigao", "rincao", "beiral", "empena", "escavacao", "reaterro", "lastro", "lastroArea", "aco", "estacas", "volumeEstacas", "acoEstacas"];   /* P11: corte e aterro da plataforma */
  function categoriaDe(el) { if (!el || el.tipo === "volume") return null; return el.planos ? "cobertura" : (CAT_EL[el.tipo] || null); }
  /* a peça do registro de UM elemento (o orçamento de uma peça recebe só ela e a área dos vãos).
     cat: a categoria quando o elemento não diz (o ambiente não tem `tipo`) */
  function pecaRegistro(el, areaVaos, catIn) {
    var BP = dep("BimParam", "./bimparam.js"), cat = catIn || categoriaDe(el);
    if (!BP || !BP.resolver || !cat || !el) return null;
    /* peça solta, sem id (montada direto do BimEdit): uma cópia rasa com id — o registro só lê */
    var e2 = el;
    if (el.id == null) { e2 = {}; Object.keys(el).forEach(function (k) { e2[k] = el[k]; }); e2.id = "peca"; }
    if (LISTA_P11[cat]) {   /* P11: a peça do terreno vai na lista dela em estado.terreno */
      var est11 = { caixas: [], coberturas: [], familias: [], terreno: { topos: [], subregioes: [], plataformas: [], divisas: [], componentes: [] } };
      est11.terreno[LISTA_P11[cat]].push(e2);
      return BP.resolver(est11, {}).porId[String(e2.id)] || null;
    }
    var est = cat === "cobertura" ? { caixas: [], coberturas: [e2], familias: [] } : (cat === "forro" ? { caixas: [], coberturas: [], familias: [], forros: [e2] }
      : (cat === "ambiente" ? { caixas: [], coberturas: [], familias: [], ambientes: [e2] } : { caixas: [e2], coberturas: [], familias: [] }));
    var LP3 = { telhado: "telhados", borda: "bordas", fundacao: "fundacoes" };   /* P3 */
    if (LP3[cat]) { est = { caixas: [], coberturas: [], familias: [] }; est[LP3[cat]] = [e2]; }
    var av = {}; av[String(e2.id)] = num(areaVaos, 0);
    return BP.resolver(est, { areaVaos: av }).porId[String(e2.id)] || null;
  }
  /* as medidas que o orçamento oferece numa categoria — as do registro, mais
     a contagem e a armação por taxa (quando há volume) */
  function medidasDaCategoria(tipo) {
    var BP = dep("BimParam", "./bimparam.js"), cat = CAT_EL[tipo];
    if (!BP || !BP.medidasOrc || !cat) return null;
    var tem = {}; BP.medidasOrc(cat).forEach(function (k) { tem[k] = 1; });
    /* armação por taxa é de peça que PODE ser de concreto (parede, laje, pilar,
       viga, escada); telhado e guarda-corpo nunca ofereceram */
    tem.un = 1; if (tem.volume && !SEM_ARMACAO[cat]) tem.kgPorM3 = 1;
    return ORDEM_MEDIDAS.filter(function (k) { return tem[k]; });
  }
  /* medida → { valor, def } pelo registro (def null: contagem) */
  function medidasDaPeca(peca, cat) {
    var BP = dep("BimParam", "./bimparam.js"), out = {};
    /* P1-acab: o registro leva a medida EXATA (a do IFC); o orçamento segue com a
       RÉGUA DE 4 CASAS de sempre (valorOrc) — custo = preço × quantidade sem
       arredondar a quantidade antes: a medida exata mudaria o total de
       orçamentos existentes nos centavos (prova: tools/fixtures/orc-antes-p1acab.json) */
    BP.medidasOrc(cat).forEach(function (k) { var q = BP.quantidade(peca, k); if (q) out[k] = { valor: q.valorOrc != null ? q.valorOrc : q.valor, exato: q.valor, def: q.def }; });
    out.un = { valor: 1, def: null };
    return out;
  }

  /* --------------------------------------------------------------------
   * ELEMENTO do editor (caixa ou cobertura) com `servicos`. `peca` (opcional):
   * a peça já resolvida pelo registro (o doModelo resolve o estado inteiro).
   * ------------------------------------------------------------------ */
  function daElemento(el, areaVaos, base, opcoes, peca) {
    var BE = dep("BimEdit", "./bimedit.js"), linhas = [];
    var MU = (BE && BE.MEDIDAS_ORC) || {}, cat = categoriaDe(el);
    var pc = cat ? (peca || pecaRegistro(el, areaVaos)) : null, porMedida = null, med = {};
    if (pc) { porMedida = medidasDaPeca(pc, cat); Object.keys(porMedida).forEach(function (k) { med[k] = porMedida[k].valor; }); }
    else if (cat) {
      var lz = orcar({ id: "s0", codigo: "", unidade: "", quantidade: 0 }, null, opcoes);
      lz.status = "sem-base"; lz.avisos = ["o registro de parâmetros (js/bimparam.js) não carregou: sem ele o orçamento da peça não sai (a quantidade é do registro)"];
      return { linhas: arr(el && el.servicos).length ? [lz] : [], resumo: resumir([], opcoes), peso: { ok: false, motivo: "registro de parâmetros não carregado", kg: null }, medidas: med };
    } else med = BE && BE.medidasDe ? BE.medidasDe(el, areaVaos) : {};
    arr(BE && BE.limparServicos ? BE.limparServicos(el && el.servicos) : el && el.servicos).forEach(function (s, i) {
      var k = s.medida, fator = num(s.fator, 1), kb = k === "kgPorM3" ? "volume" : k, q;
      var fonte = porMedida && porMedida[kb] ? porMedida[kb].def : null;
      /* a unidade da quantidade: a do PARÂMETRO (o kg da armação é volume × kg/m³) */
      var un = k === "kgPorM3" ? MU.kgPorM3 : (fonte ? fonte.un : MU[k]);
      if (!MU[k] || med[kb] == null) {
        var lx = orcar({ id: "s" + i, codigo: s.codigo, unidade: "", quantidade: 0 }, null, opcoes);
        lx.status = "unidade"; lx.avisos = ["a medida \"" + k + "\" não existe para " + (el && el.tipo ? el.tipo : "este elemento")]; lx.medida = k; linhas.push(lx); return;
      }
      q = num(med[kb]) * fator;
      var l = orcar({ id: "s" + i, codigo: s.codigo, unidade: un, quantidade: q, rotulo: s.rotulo || "" }, base, opcoes);
      l.medida = k; l.fator = fator; l.codigoOrigem = "elemento";
      if (fonte) { l.param = fonte.id; l.paramNome = fonte.nome; } else if (pc && k === "un") l.param = "CONTAGEM";
      linhas.push(arredLinha(l));
    });
    var classeDe = opcoes && typeof opcoes.classeDe === "function" ? opcoes.classeDe : null;
    var p0 = linhas[0], peso;
    if (p0 && p0.status === "ok") peso = pesoPorDescricao(med.volume, p0.descricao, classeDe ? classeDe(p0.codigo) : null);
    else peso = { ok: false, motivo: linhas.length ? "o serviço principal não está orçado" : "sem serviço (dê um código à peça)", kg: null };
    return { linhas: linhas, resumo: resumir(linhas, opcoes), peso: peso, medidas: med };
  }

  /* --------------------------------------------------------------------
   * P2-C — AMBIENTE (js/bimacabamento.js): os serviços do acabamento que o
   * ambiente guarda (servicos: [{codigo, medida, fator, acab, rotulo}]) ×
   * as quantidades da fronteira (q = BimAcabamento.quantidades().porId[id]).
   * As três regras seguem: código fora da base = pendente; unidade da
   * composição = unidade da medida (m² × m² de piso, m × m de rodapé); preço
   * da base vigente. Ambiente sem região fechada = PENDENTE com o motivo
   * (nunca zero calado). Acabamento escolhido (o texto) sem
   * composição = linha "sem código" — aparece em "Fora do orçamento".
   * ------------------------------------------------------------------ */
  /* P2 integração: a medida do PRÓPRIO ambiente (Área, Perímetro, Volume —
     BimEdit.MEDIDAS_AMBIENTE_REG) sai do REGISTRO (js/bimparam.js, a mesma da
     tela de Propriedades e do Qto_SpaceBaseQuantities do IFC), na régua do
     orçamento (valorOrc); a unidade da composição tem de ser a do PARÂMETRO.
     `peca` (opcional): o ambiente já resolvido pelo registro. */
  var NOME_MED_AMB = { area: "Área", comprimento: "Perímetro", volume: "Volume" };
  function daAmbiente(amb, q, base, opcoes, peca) {
    var BE = dep("BimEdit", "./bimedit.js"), BA = dep("BimAcabamento", "./bimacabamento.js"), BP = dep("BimParam", "./bimparam.js"), linhas = [];
    var MU = (BE && BE.MEDIDAS_AMBIENTE) || { areaPiso: "m2", rodape: "m", areaParede: "m2", areaTeto: "m2" };
    var MR = (BE && BE.MEDIDAS_AMBIENTE_REG) || { area: "m2", comprimento: "m", volume: "m3" };
    var servs = BE && BE.limparServicosAmbiente ? BE.limparServicosAmbiente(amb && amb.servicos) : [];
    var delim = !!(q && q.estado === "delimitado") || (!q && amb && amb.calc && amb.calc.estado === "delimitado"), nome = txt(amb && amb.nome) || "Ambiente";
    var pc = null;
    if (servs.some(function (s) { return MR[s.medida] && !MU[s.medida]; })) pc = peca || (amb ? pecaRegistro(amb, 0, "ambiente") : null);
    servs.forEach(function (s, i) {
      var reg = !!MR[s.medida] && !MU[s.medida], qr = reg && pc && BP && BP.quantidade ? BP.quantidade(pc, s.medida) : null;
      var un = reg ? (qr ? qr.def.un : MR[s.medida]) : MU[s.medida], fator = num(s.fator, 1), it = !reg && BA ? BA.itemDoServico(s) : null;
      var rot = (s.rotulo || (it && it.rotulo) || (reg ? NOME_MED_AMB[s.medida] + " do ambiente" : s.medida)) + " — " + nome, l;
      var qv = !delim ? null : (reg ? (qr ? (qr.valorOrc != null ? qr.valorOrc : qr.valor) : null) : (q ? q[s.medida] : null));
      if (qv == null) {
        var motivo = !delim ? ((q && q.avisos && q.avisos[0]) || "ambiente sem região fechada: sem quantidade — pendente")
          : (reg && !BP ? "o registro de parâmetros (js/bimparam.js) não carregou: sem ele a medida do ambiente não sai" : "a medida \"" + s.medida + "\" não existe para este ambiente — pendente");
        l = { codigo: s.codigo, descricao: rot, unidade: "", unidadeQto: un, quantidade: 0, status: "pendente", horas: [], servico: "a" + i, rotulo: rot, avisos: [motivo] };
      } else {
        l = arredLinha(orcar({ id: "a" + i, codigo: s.codigo, unidade: un, quantidade: num(qv) * fator, rotulo: rot }, base, opcoes));
        if (qr) { l.param = qr.def.id; l.paramNome = qr.def.nome; }
      }
      l.medida = s.medida; l.fator = fator; l.codigoOrigem = "ambiente"; if (s.acab) l.acab = s.acab;
      linhas.push(l);
    });
    /* o acabamento escolhido (texto) sem nenhuma composição da medida dele */
    arr(BA && BA.ACABS).forEach(function (ac) {
      var t = txt(amb && amb[ac.campo]); if (!t) return;
      if (servs.some(function (s) { return s.acab === ac.id || (!s.acab && s.medida === ac.medida); })) return;
      linhas.push({ codigo: "", descricao: ac.nome + " \"" + t + "\" sem composição", unidade: "", unidadeQto: MU[ac.medida], quantidade: 0, status: "sem-codigo", horas: [], servico: "acab:" + ac.id,
                    avisos: ["escolha a composição em Propriedades do ambiente › Acabamentos e clique Aplicar por ambiente"] });
    });
    return { linhas: linhas, resumo: resumir(linhas, opcoes), peso: false, quantidades: q || null };
  }

  /* --------------------------------------------------------------------
   * O MODELO INTEIRO — estado de BimEdit.aplicar(); avaliarFam(famId,
   * tipoId, inst) = o mesmo do bim.js. Soma por COMPOSIÇÃO (código +
   * unidade): é o que vira linha de orçamento.
   * ------------------------------------------------------------------ */
  function doModelo(estado, avaliarFam, base, opcoes) {
    var BE = dep("BimEdit", "./bimedit.js");
    /* P10 — OPÇÕES DE PROJETO (js/bimopcoes.js): o orçamento é o do modelo principal +
       a opção escolhida de cada conjunto (padrão: a principal).
       FASES (js/bimfases.js): o EXISTENTE fica fora, o DEMOLIDO vira serviço de demolição
       (bloco "demolicao", no fim). Sem opção e sem fase, nada muda (FX = null). */
    var BOp = dep("BimOpcoes", "./bimopcoes.js"), BFa = dep("BimFases", "./bimfases.js");
    if (BOp && BOp.filtrar && estado && estado.opcoes) estado = BOp.filtrar(estado, opcoes && opcoes.escolhaOpcoes);
    var FX = BFa && BFa.paraOrcamento ? BFa.paraOrcamento(estado, opcoes) : null, estTodo = estado;
    if (FX) estado = FX.estado;
    var vaos = (BE && BE.vaosDasParedes) ? BE.vaosDasParedes(estTodo, avaliarFam) : {};
    /* P1-D: o registro resolve o modelo UMA vez (o mesmo resolver da tela de Propriedades e do IFC) */
    var BP = dep("BimParam", "./bimparam.js"), reg = null;
    if (BP && BP.resolver) reg = BP.resolver(estTodo, { avaliarFam: typeof avaliarFam === "function" ? avaliarFam : null, categoriaFam: opcoes && opcoes.categoriaFam, niveis: opcoes && opcoes.niveis });
    function pecaDe(id) { return reg && reg.porId ? reg.porId[String(id)] || null : null; }
    var elementos = [], todas = [], porCod = {}, ordem = [], pesoKg = 0, comPeso = 0, semPeso = 0;
    function somar(elId, rotulo, r) {
      elementos.push({ id: elId, rotulo: rotulo, linhas: r.linhas, resumo: r.resumo, peso: r.peso });
      /* peso === false: a peça não entra na conta de peso (tubo, conexão — B5) */
      if (r.peso && r.peso.ok) { pesoKg += r.peso.kg; comPeso++; } else if (r.peso !== false) semPeso++;
      r.linhas.forEach(function (l) {
        todas.push(l);
        /* orçada: soma por composição; problema: agrupa pelo MESMO problema
           (as 12 paredes sem código viram uma linha "12 elementos") */
        var k = l.status === "ok" ? l.codigo + "|" + unidadeChave(l.unidade) : "~" + l.status + "|" + l.codigo + "|" + l.descricao + "|" + unidadeChave(l.unidadeQto);
        if (l.bloco) k = l.bloco + "#" + k;   /* P10: a demolição não soma com a construção (mesmo código, outro bloco) */
        var g = porCod[k];
        if (!g) {
          g = porCod[k] = { chave: k, codigo: l.codigo, descricao: l.descricao, unidade: l.unidade || l.unidadeQto, status: l.status, quantidade: 0, bloco: l.bloco || null,
                            custo: { mo: 0, mat: 0, eq: 0, total: 0 }, unitario: l.unitario, horasAcc: {}, elementos: [], avisos: [] };
          ordem.push(k);
        }
        g.quantidade += num(l.quantidade);
        if (g.elementos.indexOf(elId) < 0) g.elementos.push(elId);
        l.avisos.forEach(function (a) { if (g.avisos.indexOf(a) < 0) g.avisos.push(a); });
        if (l.status === "ok") {
          g.custo.mo += l.custo.mo; g.custo.mat += l.custo.mat; g.custo.eq += l.custo.eq; g.custo.total += l.custo.total;
          l.horas.forEach(function (h) { var a = g.horasAcc[h.chave] || (g.horasAcc[h.chave] = { funcao: h.funcao, h: 0, direta: 0, via: {} }); a.h += h.h; a.direta += h.direta; h.via.forEach(function (v) { a.via[v] = 1; }); });
        }
      });
    }
    /* peça do editor SEM serviço entra como "sem código" — some do total, mas
       aparece na lista: modelo com 12 paredes e orçamento com 9 tem de se ver */
    var NOME_EL = { parede: "Parede", laje: "Laje", pilar: "Pilar", viga: "Viga", escada: "Escada", guarda: "Guarda-corpo", forro: "Forro", rampa: "Rampa", telhado: "Telhado", borda: "Borda do telhado", fundacao: "Fundação" };   /* P9: rampa */   /* escada e guarda-corpo: modelador B2; forro: P2 */
    function semServico(el, tipo) {
      var nm = (NOME_EL[tipo] || "Cobertura") + " sem composição";
      return { linhas: [{ codigo: "", descricao: nm, unidade: "", unidadeQto: "", quantidade: 0, status: "sem-codigo", avisos: ["dê uma composição à peça em Propriedades › Orçamento"], horas: [], servico: "principal" }],
               resumo: null, peso: tipo === "forro" ? false : { ok: false, kg: null, motivo: "sem serviço (dê um código à peça)" } };
    }
    arr(estado && estado.caixas).forEach(function (c) {
      if (!arr(c.servicos).length) { somar(c.id, (c.tipo || "elemento") + " " + c.id, semServico(c, c.tipo)); return; }
      somar(c.id, (c.tipo || "elemento") + " " + c.id, daElemento(c, vaos[c.id] ? vaos[c.id].areaVaos : 0, base, opcoes, pecaDe(c.id)));
    });
    /* P4 — PINTAR FACE (js/bimpintar.js): cada região pintada (material por face,
       faixa do barrado) é uma linha em m² pela ÁREA DELA — líquida dos vãos, dos
       encostos e do que a peça unida tirou. Sem composição: "sem composição"
       com os m² (aparece em Fora do orçamento, nunca some). Mesmas três regras. */
    var BPt = dep("BimPintar", "./bimpintar.js");
    if (BPt && BPt.servicosOrc) BPt.servicosOrc(estado, vaos).forEach(function (s) {
      var l;
      if (s.codigo) { l = arredLinha(orcar({ id: s.id, codigo: s.codigo, unidade: s.unidade, quantidade: s.quantidade, rotulo: s.rotulo }, base, opcoes)); l.codigoOrigem = "pintura"; }
      else l = { codigo: "", descricao: "Pintura \"" + s.material + "\" sem composição", unidade: "", unidadeQto: s.unidade, quantidade: r4(s.quantidade), status: "sem-codigo", horas: [], servico: s.id,
                 avisos: ["escolha a composição na barra de opções do Pintar (ou pinte de novo a face com o código)"] };
      l.medida = "pintura"; l.face = s.face; l.regiao = s.regiao; l.material = s.material;
      somar(s.id, s.rotulo, { linhas: [l], resumo: null, peso: false });
    });
    /* EMBREVE — GRAUTE E ARMADURA (js/bimgraute.js): cada parede de alvenaria
       estrutural grauteada dá o graute (m³ = pontos × furos × área do furo ×
       altura) e o aço vertical (kg, com o transpasse). Código: o da parede ou a
       tabela SINAPI do motor pelo fgk/bitola; sem composição = PENDENTE com a
       quantidade (nunca a parecida). Mesmas três regras. */
    var BGr = dep("BimGraute", "./bimgraute.js");
    if (BGr && BGr.servicosOrc) BGr.servicosOrc(estado, vaos).forEach(function (s) {
      var l;
      if (s.codigo) { l = arredLinha(orcar({ id: s.id, codigo: s.codigo, unidade: s.unidade, quantidade: s.quantidade, descricao: s.descricao, rotulo: s.rotulo }, base, opcoes)); l.codigoOrigem = s.origemCodigo === "projeto" ? "projeto" : "graute"; }
      else l = { codigo: "", descricao: s.rotulo, unidade: "", unidadeQto: s.unidade, quantidade: r4(s.quantidade), status: "pendente", avisos: [s.motivo], horas: [], servico: s.id };
      l.medida = s.medida;
      somar(s.id, s.rotulo, { linhas: [l], resumo: null, peso: false });
    });
    arr(estado && estado.coberturas).forEach(function (c) {
      if (!arr(c.servicos).length) { somar(c.id, "cobertura " + c.id, semServico(c, "cobertura")); return; }
      somar(c.id, "cobertura " + c.id, daElemento(c, 0, base, opcoes, pecaDe(c.id)));
    });
    /* P2 integração — FORRO (js/bimforro.js): uma peça como as outras; a
       quantidade sai do REGISTRO (Área = placa, Área bruta, Perímetro =
       tabica/negativo, Volume). Forro sem contorno (ok:false) com serviço =
       PENDENTE com o motivo, nunca zero calado; sem serviço, "sem composição". */
    arr(estado && estado.forros).forEach(function (f) {
      if (!f || f.id == null) return;
      var rot = "forro " + (txt(f.tipoForro && f.tipoForro.rotulo) || "") + " " + f.id;
      if (!arr(f.servicos).length) { somar(f.id, rot, semServico(f, "forro")); return; }
      if (f.ok === false) {
        var mot = "forro sem contorno (" + (arr(f.avisos)[0] || "região não fechada") + "): sem quantidade — pendente";
        somar(f.id, rot, { linhas: (BE && BE.limparServicos ? BE.limparServicos(f.servicos) : []).map(function (s, i) {
          return { codigo: s.codigo, descricao: "Forro " + f.id, unidade: "", unidadeQto: (BE.MEDIDAS_ORC || {})[s.medida] || "", quantidade: 0, status: "pendente", horas: [], servico: "s" + i, medida: s.medida, avisos: [mot] };
        }), resumo: null, peso: false });
        return;
      }
      var rF = daElemento(f, 0, base, opcoes, pecaDe(f.id)); rF.peso = false;   /* forro não entra na conta de peso da estrutura */
      somar(f.id, rot, rF);
    });
    /* P11 — TERRENO (js/bimterreno.js). A PLATAFORMA orça o CORTE e o ATERRO
       (Corte e Preenchimento do registro, m³ — o método está no js/bimterreno.js).
       Plataforma SEM composição: as duas linhas saem PENDENTES com a
       quantidade (o volume aparece no Orçamento do modelo; a composição de
       movimento de terra o usuário escolhe — nunca se inventa); plataforma
       sem terreno embaixo, pendente com o motivo. Topossólido, sub-região,
       divisa e componente entram só quando têm serviço (limpeza de terreno,
       grama, muro de divisa…), pelas medidas do registro. */
    var T11 = estado && estado.terreno;
    if (T11) {
      arr(T11.plataformas).forEach(function (pl) {
        if (!pl || pl.id == null) return;
        var rotP = "plataforma " + (txt(pl.nome) || pl.id);
        if (!arr(pl.servicos).length || pl.ok === false) {
          var ls = [];
          [["corte", "Terraplenagem: corte (escavação)", "escavação"], ["aterro", "Terraplenagem: aterro (preenchimento)", "aterro"]].forEach(function (k) {
            var q = num(pl[k[0]], 0);
            var mot = pl.ok === false ? "plataforma sem terreno medido embaixo (" + (arr(pl.avisos)[0] || "sem topossólido") + "): sem quantidade — pendente"
              : "escolha a composição de " + k[2] + " em Propriedades da plataforma › Orçamento (SINAPI, movimento de terra) — sem composição, pendente";
            if (pl.ok !== false && !(q > 0)) return;
            ls.push({ codigo: "", descricao: k[1], unidade: "", unidadeQto: "m3", quantidade: r4(q), status: "pendente", avisos: [mot], horas: [], servico: k[0], medida: k[0] });
          });
          if (ls.length) somar(pl.id, rotP, { linhas: ls, resumo: null, peso: false });
          return;
        }
        var rP = daElemento(pl, 0, base, opcoes, pecaDe(pl.id)); rP.peso = false;
        /* o volume (corte ou aterro) que nenhum serviço cobre segue PENDENTE com a quantidade — não some */
        [["corte", "Terraplenagem: corte (escavação)", "escavação"], ["aterro", "Terraplenagem: aterro (preenchimento)", "aterro"]].forEach(function (k) {
          var q = num(pl[k[0]], 0);
          if (!(q > 0) || arr(pl.servicos).some(function (s) { return s && s.medida === k[0]; })) return;
          rP.linhas.push({ codigo: "", descricao: k[1], unidade: "", unidadeQto: "m3", quantidade: r4(q), status: "pendente", horas: [], servico: k[0], medida: k[0],
                           avisos: ["escolha a composição de " + k[2] + " em Propriedades da plataforma › Orçamento (SINAPI, movimento de terra) — sem composição, pendente"] });
        });
        somar(pl.id, rotP, rP);
      });
      [].concat(arr(T11.topos), arr(T11.subregioes), arr(T11.divisas), arr(T11.componentes)).forEach(function (e) {
        if (!e || e.id == null || !arr(e.servicos).length) return;
        var rE = daElemento(e, 0, base, opcoes, pecaDe(e.id)); rE.peso = false;
        somar(e.id, (txt(e.nome) || e.tipo) + " " + e.id, rE);
      });
    }
    /* P3 — TELHADO, BORDAS e FUNDAÇÃO (js/bimtelhado.js, js/bimfundacao.js):
       peças como as outras, a quantidade sai do REGISTRO. Peça que não fechou
       (ok:false) com serviço = PENDENTE com o motivo, nunca zero calado; sem
       serviço, "sem composição". Telhado e borda não entram no peso da estrutura. */
    [["telhados", "telhado"], ["bordas", "borda"], ["fundacoes", "fundacao"]].forEach(function (par) {
      arr(estado && estado[par[0]]).forEach(function (e3) {
        if (!e3 || e3.id == null) return;
        var rot = NOME_EL[par[1]].toLowerCase() + " " + e3.id;
        if (!arr(e3.servicos).length) { var s3 = semServico(e3, par[1]); if (par[1] !== "fundacao") s3.peso = false; somar(e3.id, rot, s3); return; }
        if (e3.ok === false) {
          var mot3 = NOME_EL[par[1]].toLowerCase() + " sem geometria (" + (arr(e3.avisos)[0] || "confira as Propriedades") + "): sem quantidade — pendente";
          somar(e3.id, rot, { linhas: (BE && BE.limparServicos ? BE.limparServicos(e3.servicos) : []).map(function (s, i) {
            return { codigo: s.codigo, descricao: NOME_EL[par[1]] + " " + e3.id, unidade: "", unidadeQto: (BE.MEDIDAS_ORC || {})[s.medida] || "", quantidade: 0, status: "pendente", horas: [], servico: "s" + i, medida: s.medida, avisos: [mot3] };
          }), resumo: null, peso: false });
          return;
        }
        var r3 = daElemento(e3, 0, base, opcoes, pecaDe(e3.id)); if (par[1] !== "fundacao") r3.peso = false;
        /* fundação sem a TAXA de aço: o aço não tem quantidade — pendente com o que fazer (nunca zero calado, nem "medida que não existe") */
        if (par[1] === "fundacao") r3.linhas.forEach(function (l) {
          if ((l.medida === "aco" || l.medida === "acoEstacas") && l.status === "unidade") { l.status = "pendente"; l.avisos = ["informe a taxa de aço (kg/m³) " + (l.medida === "aco" ? "da fundação" : "das estacas") + " em Propriedades — sem ela o aço não tem quantidade"]; }
        });
        somar(e3.id, rot, r3);
      });
    });
    /* VOLUME LIVRE (B4): orça como a peça do editor — as medidas vêm da malha
       (BimEdit.medidasDe lê `medidas`); sem serviço, "sem composição" na lista */
    arr(estado && estado.volumes).forEach(function (v) {
      var rot = "volume " + (v.categoria || "") + " " + v.id;
      if (!arr(v.servicos).length) { var s0 = semServico(v, "volume"); s0.linhas[0].descricao = "Volume (" + (v.categoria || "genérico") + ") sem composição"; somar(v.id, rot, s0); return; }
      somar(v.id, rot, daElemento(v, 0, base, opcoes));
    });
    var BIp12 = dep("BimInst", "./biminst.js");
    arr(estado && estado.familias).forEach(function (f) {
      var av = typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst) : null;
      /* P12: dispositivo MEP (tomada, interruptor, luminária, quadro — família com `mep`) sem serviço
         próprio é orçado pelo js/biminst.js com o código do MAPA (bloco INSTALAÇÕES abaixo): não conta duas vezes */
      if (av && BIp12 && BIp12.familiaMep && BIp12.familiaMep(av, f)) return;
      if (!av) {
        somar(f.id, "família " + f.famId, { linhas: [{ codigo: "", descricao: "família \"" + f.famId + "\" não está na biblioteca deste aparelho", unidade: "", unidadeQto: "", quantidade: 0, status: "sem-codigo", avisos: ["família não carregada"], horas: [], servico: "principal" }], resumo: null, peso: { ok: false, kg: null, motivo: "família não carregada" } });
        return;
      }
      somar(f.id, (av.quantitativo && av.quantitativo.descricao) || f.famId, daFamilia(av, base, opcoes, f.servicos, pecaDe(f.id)));
    });
    /* P2-C: ACABAMENTO POR AMBIENTE (js/bimacabamento.js) — piso, contrapiso,
       rodapé, revestimento/pintura de parede e teto, pelas quantidades da
       fronteira do ambiente. Ambiente sem acabamento escolhido não entra
       (ambiente não é peça que precise de composição). */
    var BA = dep("BimAcabamento", "./bimacabamento.js"), ambs = arr(estado && estado.ambientes);
    if (BA && ambs.length) {
      /* P10: o acabamento do ambiente mede as paredes de TODAS as fases (pintar a parede existente é serviço de reforma) */
      var QA = BA.quantidades(estTodo, { avaliarFam: typeof avaliarFam === "function" ? avaliarFam : null, vaos: vaos, forroDe: opcoes && opcoes.forroDe });
      ambs.forEach(function (a) {
        if (!a || a.id == null) return;
        var r = daAmbiente(a, QA.porId[String(a.id)], base, opcoes, pecaDe(a.id));
        if (r.linhas.length) somar(a.id, "ambiente " + (txt(a.nome) || "Ambiente") + (a.calc && a.calc.numeroAuto && !a.numero ? " " + a.calc.numeroAuto : (a.numero ? " " + a.numero : "")), r);
      });
    }
    /* INSTALAÇÕES (B5, js/biminst.js): cada tubo, conexão e peça chega com a
       composição da tabela do mapa — ou PENDENTE com o motivo (sem chave na
       tabela nunca vira "a parecida"). A quantidade é a da geometria. */
    var BI = dep("BimInst", "./biminst.js");
    if (BI && BI.servicosOrc && estado && estado.instalacoes) BI.servicosOrc(estado, avaliarFam).forEach(function (s) {
      var l;
      if (s.codigo) { l = arredLinha(orcar({ id: s.id, codigo: s.codigo, unidade: s.unidade, quantidade: s.quantidade, descricao: s.descricao, rotulo: s.rotulo }, base, opcoes)); l.codigoOrigem = "mapa"; }
      else l = { codigo: "", descricao: s.rotulo, unidade: "", unidadeQto: s.unidade, quantidade: r4(s.quantidade), status: "pendente", avisos: [s.motivo], horas: [], servico: s.id };
      somar(s.id, s.rotulo, { linhas: [l], resumo: null, peso: false });
    });
    /* P10 — DEMOLIÇÃO (js/bimfases.js): cada peça demolida na fase do orçamento vira o
       serviço de demolição do MAPA (código SINAPI conferido) ou do projeto, na medida do
       REGISTRO (a mesma da tela). Sem composição, ou sem a medida: PENDENTE com o motivo. */
    if (FX) {
      var catFx = opcoes && (opcoes.categoriaFamFases || opcoes.categoriaFam);
      FX.demolir.forEach(function (p) {
        var sv = BFa.servicoDemolicao(p, FX.mapa), rot = sv.rotulo || ("Demolição — " + p.rotulo), l, q = null;
        if (sv.codigo && sv.medida !== "un") {
          var pc = p.origem === "familia" && BP && BP.resolver && catFx ? BP.resolver({ caixas: [], coberturas: [], familias: [p.el] }, { avaliarFam: typeof avaliarFam === "function" ? avaliarFam : null, categoriaFam: catFx }).porId[String(p.id)] : pecaDe(p.id);
          q = pc && BP && BP.quantidade ? BP.quantidade(pc, sv.medida) : null;
        }
        if (!sv.codigo) l = { codigo: "", descricao: rot + " (" + p.rotulo + ")", unidade: "", unidadeQto: (BE && BE.MEDIDAS_ORC || {})[sv.medida] || "", quantidade: 0, status: "pendente", horas: [], servico: "demolicao", avisos: [sv.motivo] };
        else if (sv.medida !== "un" && !q) l = { codigo: sv.codigo, descricao: rot + " (" + p.rotulo + ")", unidade: "", unidadeQto: (BE && BE.MEDIDAS_ORC || {})[sv.medida] || "", quantidade: 0, status: "pendente", horas: [], servico: "demolicao",
                                                 avisos: ["a medida \"" + sv.medida + "\" não existe para " + p.rotulo + " no registro de parâmetros — pendente"] };
        else {
          l = arredLinha(orcar({ id: "demolicao", codigo: sv.codigo, unidade: q ? q.def.un : "un", quantidade: q ? (q.valorOrc != null ? q.valorOrc : q.valor) : 1, rotulo: rot }, base, opcoes));
          if (q) { l.param = q.def.id; l.paramNome = q.def.nome; }
        }
        l.bloco = "demolicao"; l.medida = sv.medida; l.codigoOrigem = sv.fonte || "mapa"; l.fase = FX.fase; l.statusFase = p.status;
        somar(p.id, rot + " — " + p.rotulo, { linhas: [l], resumo: resumir([l], opcoes), peso: false });
      });
    }
    var porComposicao = ordem.map(function (k) {
      var g = porCod[k], fh = fecharHoras(g.horasAcc, opcoes);
      return { codigo: g.codigo, descricao: g.descricao, unidade: g.unidade, status: g.status, quantidade: r4(g.quantidade),
               custo: g.status === "ok" ? { mo: r2(g.custo.mo), mat: r2(g.custo.mat), eq: r2(g.custo.eq), total: r2(g.custo.total) } : null,
               unitario: g.unitario, horas: fh.horas, horasTotal: fh.horasTotal, duracaoDias: fh.duracaoDias, funcaoCritica: fh.funcaoCritica,
               elementos: g.elementos, avisos: g.avisos, bloco: g.bloco || undefined };
    });
    porComposicao.forEach(function (g) { if (!g.bloco) delete g.bloco; });   /* P10: só a demolição leva bloco (o resto fica como antes) */
    var ok = porComposicao.filter(function (g) { return g.status === "ok"; });
    var res = resumir(ok.map(function (g) { return { status: "ok", custo: g.custo, duracaoDias: g.duracaoDias, horas: g.horas }; }), opcoes);
    var saida = {
      porComposicao: porComposicao, elementos: elementos, resumo: res,
      peso: { kg: r2(pesoKg), comPeso: comPeso, semPeso: semPeso },
      pendencias: porComposicao.filter(function (g) { return g.status !== "ok"; })
    };
    /* P10: os três blocos da reforma (só quando o modelo usa fases) */
    if (FX) {
      var tot = function (b) { return r2(ok.filter(function (g) { return (g.bloco || "construcao") === b; }).reduce(function (s, g) { return s + g.custo.total; }, 0)); };
      saida.fases = { fase: FX.fase, lista: FX.lista, n: FX.n, avisos: FX.avisos,
                      construcao: tot("construcao"), demolicao: tot("demolicao"),
                      demolidos: FX.demolir.map(function (p) { return p.id; }),
                      existentes: FX.existentes.map(function (p) { return { id: p.id, rotulo: p.rotulo }; }),
                      fora: FX.fora.map(function (p) { return { id: p.id, rotulo: p.rotulo, status: p.status }; }) };
    }
    if (estTodo && estTodo.opcoesEscolha) saida.opcoes = estTodo.opcoesEscolha;   /* P10: a escolha de opções orçada */
    return saida;
  }

  /* --------------------------------------------------------------------
   * A BASE com o PREÇO VIGENTE: o analítico dá os insumos (horas, MO/MAT/EQ);
   * o preço é o da base sintética do orçamento, quando ela tem o código — é a
   * mesma régua do app (Analitico.quebra: a proporção do analítico aplicada
   * ao custo unitário real). Se os dois divergem, a linha leva o aviso.
   * ------------------------------------------------------------------ */
  function baseComPreco(analitico, sintetico) {
    return {
      obter: function (cod) {
        var a = analitico && analitico.obter ? analitico.obter(cod) : null;
        if (!a) return null;
        var s = sintetico && sintetico.obter ? sintetico.obter(cod) : null, cu = s ? num(s.custoUnitario, NaN) : NaN;
        if (!s || !isFinite(cu) || Math.abs(cu - num(a.custoUnitario)) < 0.005) return a;
        var t = num(a.custoMO) + num(a.custoMAT) + num(a.custoEQ), c = {};
        Object.keys(a).forEach(function (k) { c[k] = a[k]; });
        c.custoUnitario = cu;
        c.custoMO = t > 0 ? cu * num(a.custoMO) / t : 0; c.custoMAT = t > 0 ? cu * num(a.custoMAT) / t : cu; c.custoEQ = t > 0 ? cu * num(a.custoEQ) / t : 0;
        /* ⚠ DIFERENÇA DE CENTAVOS É A REGRA, NÃO A EXCEÇÃO: medido em 07/10/2026
           (MG 06/2026), 7.096 das 8.402 composições que estão nas duas bases
           diferem — 687,42 na sintética × 687,46 no analítico (arredondamento
           por insumo). Avisar em todas seria ruído que ensina a ignorar aviso;
           avisa quando passa de 0,5% (aí é base de outra competência/regime). */
        c._precoFonte = "sintetica";
        if (Math.abs(cu - num(a.custoUnitario)) > 0.005 * Math.max(Math.abs(cu), 0.01))
          c._precoAviso = "preço da base do orçamento (" + r2(cu) + ") difere do analítico (" + r2(a.custoUnitario) + ") em mais de 0,5%: MO/MAT/EQ na proporção do analítico — confira a competência das duas bases";
        return c;
      }
    };
  }

  /* --------------------------------------------------------------------
   * paraOrcamento — o que o botão "Enviar ao orçamento" lança: só as
   * composições ORÇADAS (o resto volta em `fora`, com o motivo, para a tela
   * mostrar antes de lançar — nada some calado).
   * ------------------------------------------------------------------ */
  function paraOrcamento(modelo, opts) {
    opts = opts || {};
    var itens = [], fora = [];
    arr(modelo && modelo.porComposicao).forEach(function (g) {
      if (g.status === "ok" && g.quantidade > 0) { var it = { codigo: g.codigo, descricao: g.descricao, unidade: g.unidade, quantidade: r4(g.quantidade), elementos: g.elementos.slice() }; if (g.bloco === "demolicao") it.bloco = "demolicao"; itens.push(it); }   /* P10: bloco */
      else fora.push({ codigo: g.codigo, descricao: g.descricao, status: g.status, quantidade: g.quantidade, motivo: (g.avisos || [])[0] || (g.status === "ok" ? "quantidade zero" : g.status), elementos: g.elementos.slice() });
    });
    return { nome: opts.nomeEtapa || "Modelo BIM (orçamento pelo modelo)", itens: itens, fora: fora };
  }

  var OrcModelo = {
    VERSAO: 1,
    unidadeChave: unidadeChave, mesmaUnidade: mesmaUnidade, funcaoDe: funcaoDe, chaveFuncao: chaveFuncao,
    orcar: orcar, daFamilia: daFamilia, daElemento: daElemento, daAmbiente: daAmbiente, doModelo: doModelo, resumir: resumir,
    medidasDaCategoria: medidasDaCategoria, pecaRegistro: pecaRegistro,
    volumeSolido: volumeSolido, pesoSolidos: pesoSolidos, pesoPorDescricao: pesoPorDescricao,
    baseComPreco: baseComPreco, paraOrcamento: paraOrcamento
  };
  global.OrcModelo = OrcModelo;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcModelo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
