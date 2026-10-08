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
  function daFamilia(av, base, opcoes, servicosInst) {
    if (!av || !av.quantitativo) return { linhas: [], resumo: resumir([], opcoes), peso: { ok: false, motivo: "família não avaliada", kg: null } };
    var q = av.quantitativo, linhas = [];
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
      l2.codigoOrigem = "instancia"; l2.medida = "quantidade"; l2.fator = num(s.fator, 1); linhas.push(l2);
    });
    linhas.forEach(arredLinha);
    return { linhas: linhas, resumo: resumir(linhas, opcoes), peso: pesoSolidos(av.solidos) };
  }

  /* --------------------------------------------------------------------
   * ELEMENTO do editor (caixa ou cobertura) com `servicos`
   * ------------------------------------------------------------------ */
  function daElemento(el, areaVaos, base, opcoes) {
    var BE = dep("BimEdit", "./bimedit.js"), linhas = [];
    var med = BE && BE.medidasDe ? BE.medidasDe(el, areaVaos) : {};
    var MU = (BE && BE.MEDIDAS_ORC) || {};
    arr(BE && BE.limparServicos ? BE.limparServicos(el && el.servicos) : el && el.servicos).forEach(function (s, i) {
      var k = s.medida, fator = num(s.fator, 1), un = MU[k], q;
      if (k === "kgPorM3") q = num(med.volume) * fator;
      else q = num(med[k]) * fator;
      if (!un || med[k === "kgPorM3" ? "volume" : k] == null) {
        var lx = orcar({ id: "s" + i, codigo: s.codigo, unidade: "", quantidade: 0 }, null, opcoes);
        lx.status = "unidade"; lx.avisos = ["a medida \"" + k + "\" não existe para " + (el && el.tipo ? el.tipo : "este elemento")]; lx.medida = k; linhas.push(lx); return;
      }
      var l = orcar({ id: "s" + i, codigo: s.codigo, unidade: un, quantidade: q, rotulo: s.rotulo || "" }, base, opcoes);
      l.medida = k; l.fator = fator; l.codigoOrigem = "elemento";
      linhas.push(arredLinha(l));
    });
    var classeDe = opcoes && typeof opcoes.classeDe === "function" ? opcoes.classeDe : null;
    var p0 = linhas[0], peso;
    if (p0 && p0.status === "ok") peso = pesoPorDescricao(med.volume, p0.descricao, classeDe ? classeDe(p0.codigo) : null);
    else peso = { ok: false, motivo: linhas.length ? "o serviço principal não está orçado" : "sem serviço (dê um código à peça)", kg: null };
    return { linhas: linhas, resumo: resumir(linhas, opcoes), peso: peso, medidas: med };
  }

  /* --------------------------------------------------------------------
   * O MODELO INTEIRO — estado de BimEdit.aplicar(); avaliarFam(famId,
   * tipoId, inst) = o mesmo do bim.js. Soma por COMPOSIÇÃO (código +
   * unidade): é o que vira linha de orçamento.
   * ------------------------------------------------------------------ */
  function doModelo(estado, avaliarFam, base, opcoes) {
    var BE = dep("BimEdit", "./bimedit.js");
    var vaos = (BE && BE.vaosDasParedes) ? BE.vaosDasParedes(estado, avaliarFam) : {};
    var elementos = [], todas = [], porCod = {}, ordem = [], pesoKg = 0, comPeso = 0, semPeso = 0;
    function somar(elId, rotulo, r) {
      elementos.push({ id: elId, rotulo: rotulo, linhas: r.linhas, resumo: r.resumo, peso: r.peso });
      if (r.peso && r.peso.ok) { pesoKg += r.peso.kg; comPeso++; } else semPeso++;
      r.linhas.forEach(function (l) {
        todas.push(l);
        /* orçada: soma por composição; problema: agrupa pelo MESMO problema
           (as 12 paredes sem código viram uma linha "12 elementos") */
        var k = l.status === "ok" ? l.codigo + "|" + unidadeChave(l.unidade) : "~" + l.status + "|" + l.codigo + "|" + l.descricao + "|" + unidadeChave(l.unidadeQto);
        var g = porCod[k];
        if (!g) {
          g = porCod[k] = { chave: k, codigo: l.codigo, descricao: l.descricao, unidade: l.unidade || l.unidadeQto, status: l.status, quantidade: 0,
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
    var NOME_EL = { parede: "Parede", laje: "Laje", pilar: "Pilar", viga: "Viga" };
    function semServico(el, tipo) {
      var nm = (NOME_EL[tipo] || "Cobertura") + " sem composição";
      return { linhas: [{ codigo: "", descricao: nm, unidade: "", unidadeQto: "", quantidade: 0, status: "sem-codigo", avisos: ["dê uma composição à peça em Propriedades › Orçamento"], horas: [], servico: "principal" }],
               resumo: null, peso: { ok: false, kg: null, motivo: "sem serviço (dê um código à peça)" } };
    }
    arr(estado && estado.caixas).forEach(function (c) {
      if (!arr(c.servicos).length) { somar(c.id, (c.tipo || "elemento") + " " + c.id, semServico(c, c.tipo)); return; }
      somar(c.id, (c.tipo || "elemento") + " " + c.id, daElemento(c, vaos[c.id] ? vaos[c.id].areaVaos : 0, base, opcoes));
    });
    arr(estado && estado.coberturas).forEach(function (c) {
      if (!arr(c.servicos).length) { somar(c.id, "cobertura " + c.id, semServico(c, "cobertura")); return; }
      somar(c.id, "cobertura " + c.id, daElemento(c, 0, base, opcoes));
    });
    arr(estado && estado.familias).forEach(function (f) {
      var av = typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst) : null;
      if (!av) {
        somar(f.id, "família " + f.famId, { linhas: [{ codigo: "", descricao: "família \"" + f.famId + "\" não está na biblioteca deste aparelho", unidade: "", unidadeQto: "", quantidade: 0, status: "sem-codigo", avisos: ["família não carregada"], horas: [], servico: "principal" }], resumo: null, peso: { ok: false, kg: null, motivo: "família não carregada" } });
        return;
      }
      somar(f.id, (av.quantitativo && av.quantitativo.descricao) || f.famId, daFamilia(av, base, opcoes, f.servicos));
    });
    var porComposicao = ordem.map(function (k) {
      var g = porCod[k], fh = fecharHoras(g.horasAcc, opcoes);
      return { codigo: g.codigo, descricao: g.descricao, unidade: g.unidade, status: g.status, quantidade: r4(g.quantidade),
               custo: g.status === "ok" ? { mo: r2(g.custo.mo), mat: r2(g.custo.mat), eq: r2(g.custo.eq), total: r2(g.custo.total) } : null,
               unitario: g.unitario, horas: fh.horas, horasTotal: fh.horasTotal, duracaoDias: fh.duracaoDias, funcaoCritica: fh.funcaoCritica,
               elementos: g.elementos, avisos: g.avisos };
    });
    var ok = porComposicao.filter(function (g) { return g.status === "ok"; });
    var res = resumir(ok.map(function (g) { return { status: "ok", custo: g.custo, duracaoDias: g.duracaoDias, horas: g.horas }; }), opcoes);
    return {
      porComposicao: porComposicao, elementos: elementos, resumo: res,
      peso: { kg: r2(pesoKg), comPeso: comPeso, semPeso: semPeso },
      pendencias: porComposicao.filter(function (g) { return g.status !== "ok"; })
    };
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
      if (g.status === "ok" && g.quantidade > 0) itens.push({ codigo: g.codigo, descricao: g.descricao, unidade: g.unidade, quantidade: r4(g.quantidade), elementos: g.elementos.slice() });
      else fora.push({ codigo: g.codigo, descricao: g.descricao, status: g.status, quantidade: g.quantidade, motivo: (g.avisos || [])[0] || (g.status === "ok" ? "quantidade zero" : g.status), elementos: g.elementos.slice() });
    });
    return { nome: opts.nomeEtapa || "Modelo BIM (orçamento pelo modelo)", itens: itens, fora: fora };
  }

  var OrcModelo = {
    VERSAO: 1,
    unidadeChave: unidadeChave, mesmaUnidade: mesmaUnidade, funcaoDe: funcaoDe, chaveFuncao: chaveFuncao,
    orcar: orcar, daFamilia: daFamilia, daElemento: daElemento, doModelo: doModelo, resumir: resumir,
    volumeSolido: volumeSolido, pesoSolidos: pesoSolidos, pesoPorDescricao: pesoPorDescricao,
    baseComPreco: baseComPreco, paraOrcamento: paraOrcamento
  };
  global.OrcModelo = OrcModelo;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcModelo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
