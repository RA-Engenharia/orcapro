/* =====================================================================
 * hiddimensionar.js — ORQUESTRADOR do cálculo hidrossanitário, fase 1
 * (água fria + esgoto + recalque + programa). Motor PURO, ES5,
 * Node-testável. O contrato é docs/hidro/CONTRATO.md:
 *   HidDimensionar.calcular(entrada) → resultado
 * Quem consome (memorial, planilhas, pranchas/isométrico, tela) lê o
 * resultado e NÃO recalcula.
 *
 * Passos: normas (contexto) → programa → rede do biminst (uma só, para AF e
 * ES) → água fria → esgoto → recalque → (fase 2) água quente e pluvial →
 * ops de DN (com as inversas) → verificações achatadas, avisos, premissas,
 * pendências e o resumo.
 *
 * Fase 2 (CONTRATO §6): a água quente usa o MESMO método da água fria
 * (js/hidaq.js → HidAF com perfil); se o aquecedor é alimentado pela água
 * fria do modelo (aguaQuente.alimentacao.entradaAF), a ordem é: 1ª passada da
 * água quente (contexto descartável) só para a DEMANDA na saída do aquecedor →
 * água fria com essa demanda na entrada do aquecedor → água quente com a
 * PRESSÃO da água fria ali. Depois, os misturadores (AF × AQ no mesmo ponto).
 *
 * ⚠ ok só é true sem verificação reprovada, sem aviso de erro e SEM
 *   PENDÊNCIA: o que não foi calculado nunca aparece como atendido.
 * ⚠ Fixture de teste carregada → aviso de erro "TABELAS DE TESTE" no
 *   resultado (e ok = false): resultado de fixture nunca vai a memorial.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* decisões de engenharia (gerente, 16/10/2026 — CONTRATO §1.2) que o memorial declara */
  var DECLARACOES = {
    pesos: "Vazão de projeto da água fria pelo método dos pesos (NBR 5626:1998, Anexo A), adotado como método reconhecido conforme a NBR 5626:2020, que deixa a escolha do método ao projetista.",
    consumo_maximo: "Vazão de projeto da água fria pelo consumo máximo possível (todos os pontos abertos ao mesmo tempo).",
    esgoto: "Esgoto dimensionado pelo método tabular da NBR 8160:1999 (Unidades Hunter de Contribuição × DN, tabelas conferidas no texto da norma). O método hidráulico (Anexo B, alternativo) não foi aplicado: as tabelas binomiais B.1 a B.3 não estão transcritas."
  };

  function calcular(entrada) {
    var BI = dep("BimInst", "./biminst.js"), NR = dep("HidNormas", "./hidnormas.js"), PG = dep("HidPrograma", "./hidprograma.js");
    var AF = dep("HidAF", "./hidaf.js"), ES = dep("HidES", "./hides.js"), BO = dep("HidBombas", "./hidbombas.js");
    var AQ = dep("HidAQ", "./hidaq.js"), AP = dep("HidAP", "./hidap.js"), HP = dep("HidPerda", "./hidperda.js");
    entrada = entrada || {};
    var mod = entrada.modelo || {}, est = mod.estado || {}, opc = entrada.opcoes || {};
    var ctx = NR.contexto();
    var R = BI.rede(est, mod.avaliarFam);
    var res = { versao: 1, ok: false, fixture: !!ctx.fixture, normas: [], premissas: [], programa: null, sistemas: { agua_fria: null, esgoto: null, agua_quente: null, pluvial: null }, recalque: null,
                verificacoes: [], avisos: [], pendencias: [], ops: [], opsDesfazer: [], resumo: null };
    /* PROJETO INTELIGENTE (js/hidkit.js, js/hidambiente.js): as decisões automáticas (kit da válvula, caixa sifonada, ventilação…) vão ao memorial */
    res.decisoesAutomaticas = arr(entrada.decisoesAutomaticas);
    /* incêndio (HidInc): calcula antes da AF porque a reserva técnica entra na reservação (IT 17) */
    var INC = dep("HidInc", "./hidinc.js"); if (INC && entrada.incendio) entrada = INC.gancho(entrada, ctx, res);
    /* confirmações do RT (item, justificativa, responsável): premissa de origem confirmacao_rt, que o memorial mostra em seção própria */
    arr(entrada.incendio && entrada.incendio.confirmacoesRT).forEach(function (c) {
      if (c && c.item && !res.premissas.some(function (q) { return q.origem === "confirmacao_rt" && q.item === c.item; })) res.premissas.push({ item: c.item, valor: (c.justificativa || "sem justificativa") + " — responsável: " + (c.responsavel || "não informado"), origem: "confirmacao_rt" });
    });
    /* tratamento (HidTrat fossa+filtro+sumidouro | HidETE | HidETA) e fluidos industriais (HidInd): mesmo padrão do incêndio — rodam no MESMO contexto
       (normas e pendências juntas) e põem verificações/avisos/premissas no resultado geral; o status entra no ok (stSis). */
    function juntar(r) {
      /* os motores de tratamento devolvem só ok: o status do sistema sai das verificações e dos avisos (pendência nunca vira ok) */
      if (!r.status) r.status = r.ok ? "ok" : (arr(r.verificacoes).some(function (v) { return v.status === "reprovado"; }) || arr(r.avisos).some(function (x) { return x.gravidade === "erro"; }) ? "reprovado" : "pendente");
      arr(r.verificacoes).forEach(function (v) { res.verificacoes.push(v); });
      arr(r.avisos).forEach(function (a) { res.avisos.push(a); });
      arr(r.premissas).forEach(function (p) { if (!res.premissas.some(function (q) { return q.item === p.item; })) res.premissas.push(p); });
    }
    function aviso(sistema, grav, texto, elementos, corrigir) { res.avisos.push({ id: "hd-" + res.avisos.length, sistema: sistema, gravidade: grav, texto: texto, elementos: elementos || [], corrigir: corrigir || null }); }

    /* aparelhos do modelo, para o programa comparar com o exigido */
    var noModelo = {}, forc = entrada.aparelhos || {};
    arr(est.familias).forEach(function (f) { var ap = forc[f.id] ? PG.grupo(forc[f.id]) : AF.grupoDaFamilia(f.famId); if (ap) noModelo[ap] = (noModelo[ap] || 0) + 1; });

    /* 1) programa */
    if (entrada.programa) {
      res.programa = PG.calcular(entrada.programa, ctx, noModelo);
      arr(res.programa.avisos).forEach(function (a) { aviso("programa", a.gravidade, a.texto, [], a.corrigir); });
      /* ⚠ revisão F7 A3: aparelho mínimo faltando era só aviso e o resultado saía "Atende".
         Agora cada item vira verificação (falta = reprovado; sem base = pendente) e o programa
         entra no ok. Dispensa só por decisão do RT, registrada como premissa (opcoes.dispensas). */
      /* NBR 9050:2020 (Tabela 7, 7.4.5, 7.10.4): aparelhos ACESSÍVEIS entram no quadro de aparelhos mínimos */
      var pavsAc = arr(entrada.pavimentos).map(function (p) { return Number(p.cota); }).sort(function (a, b) { return a - b; }), acs = entrada.acessiveis || {};
      var apAc = [];
      arr(est.familias).forEach(function (f) {
        var g = forc[f.id] ? PG.grupo(forc[f.id]) : AF.grupoDaFamilia(f.famId); if (!g || ["bacia", "lavatorio", "mictorio", "chuveiro"].indexOf(g) < 0) return;
        var av = null; if (typeof mod.avaliarFam === "function") { try { av = mod.avaliarFam(f.famId, f.tipoId, f.inst); } catch (eA) { av = null; } }
        var vv = (av && av.valores) || {}, y = Number(f.inst && f.inst.y != null ? f.inst.y : f.y), pv = -1;
        pavsAc.forEach(function (c, i) { if (y >= c - 1e-6) pv = i; });   // hid:ok tolerância de cota
        apAc.push({ id: f.id, grupo: g, famId: f.famId, valores: vv, pavimento: pv, acessivel: acs[f.id] != null ? !!acs[f.id] : (vv.Acessivel != null ? !!vv.Acessivel : null) });
      });
      var AC = PG.acessibilidade(entrada.programa, apAc, ctx);
      AC.itens.forEach(function (it) { res.programa.aparelhosMinimos.push(it); });
      AC.pendencias.forEach(function (p) { ctx.pendencia(p.chave, p.motivo, "acessibilidade"); });
      AC.verificacoes.forEach(function (v) { res.verificacoes.push({ id: "ac-v" + res.verificacoes.length, sistema: "programa", alvo: v.alvo, nome: v.nome, valor: v.valor, limite: v.limite, unidade: v.unidade, eta: null, ok: v.ok, status: v.status, passos: v.passos, fonte: v.fonte });
        if (v.corrigir) aviso("programa", "aviso", v.nome + ": " + v.passos[0], [v.alvo], v.corrigir); });
      if (AC.itens.some(function (it) { return it.status === "reprovado"; }) && res.programa.status === "ok") res.programa.status = "reprovado";
      if (AC.itens.some(function (it) { return it.status === "pendente"; }) && res.programa.status === "ok") res.programa.status = "pendente";
      res.acessibilidade = AC;
      var disp = {}; arr(opc.dispensas).forEach(function (d) { disp[d] = 1; });
      arr(res.programa.aparelhosMinimos).forEach(function (it) {
        var dispensado = !!disp[it.aparelho] && it.falta > 0;
        if (dispensado) res.premissas.push({ item: "dispensa de " + it.aparelho, valor: "faltam " + it.falta + " — dispensado pelo RT", origem: "entrada" });
        res.verificacoes.push({ id: "pg-v" + res.verificacoes.length, sistema: "programa", alvo: it.aparelho, nome: "aparelhos mínimos (" + it.aparelho + ")", valor: it.noModelo, limite: it.exigido, unidade: "un",
                                eta: it.exigido && it.noModelo ? it.exigido / it.noModelo : null, ok: it.status === "pendente" ? null : (it.falta === 0 || dispensado),
                                status: it.status === "pendente" ? "pendente" : (it.falta === 0 || dispensado ? "ok" : "reprovado"), passos: [it.regra || "pendente: " + it.base], fonte: it.fonte || null });
      });
      if (res.programa.populacao && res.programa.populacao.origem === "entrada") res.premissas.push({ item: "população", valor: res.programa.populacao.valor + " pessoas", origem: "entrada" });
    }

    /* 2) água fria e esgoto (a mesma rede); a água quente antes, se o aquecedor sai da água fria */
    var cfgAQ = entrada.aguaQuente || null, perfilAF;
    var entradaAF = cfgAQ && cfgAQ.alimentacao ? cfgAQ.alimentacao.entradaAF : null;
    if (AQ && entradaAF) {
      /* 1ª passada da água quente em contexto DESCARTÁVEL: só a demanda (ΣP e Q na saída do aquecedor) — ela não
         depende de pressão. A pendência de pressão desta passada não pode ir ao resultado. */
      var dem = AQ.demanda(AQ.calcular(entrada, NR.contexto(), R, { programa: res.programa, soDemanda: true }));
      perfilAF = { pontosExtra: {} };
      perfilAF.pontosExtra[entradaAF] = dem ? { aparelho: "aquecedor (" + entradaAF + ")", vazao_ls: dem.vazao_ls, peso: dem.peso, pressaoMin_kpa: (cfgAQ.aquecedor || {}).pressaoMin_kpa,
                                                fonte: { doc: "soma da água quente a jusante do aquecedor (HidAQ)", tipo: "calculado" } }
                                              : { aparelho: "aquecedor (" + entradaAF + ")" };
      if (!dem) ctx.pendencia("agua_quente.demanda", "a demanda da água quente na saída do aquecedor não foi calculada (vazão de ponto pendente): a água fria do aquecedor fica sem consumo", "água fria — aquecedor " + entradaAF);
    }
    var af = AF.calcular(entrada, ctx, R, perfilAF), es = ES.calcular(entrada, ctx, R);
    res.sistemas.agua_fria = af; res.sistemas.esgoto = es;
    var aq = AQ ? AQ.calcular(entrada, ctx, R, { programa: res.programa, af: af }) : null;
    if (aq && aq.status !== "vazio") {
      var mx = AQ.misturadores(af, aq, cfgAQ || {}, ctx);
      aq.misturadores = mx.lista; mx.verificacoes.forEach(function (v) { aq.verificacoes.push(v); });
      if (mx.verificacoes.some(function (v) { return v.status === "reprovado"; })) aq.status = "reprovado";
      else if (aq.status === "ok" && mx.verificacoes.some(function (v) { return v.status === "pendente"; })) aq.status = "pendente";
      res.sistemas.agua_quente = aq;
    }
    var ap = AP ? AP.calcular(entrada, ctx, R) : null;
    if (ap && ap.status !== "vazio") res.sistemas.pluvial = ap;

    /* 3) recalque (se pedido); sem vazão, usa o consumo diário do programa */
    if (entrada.recalque) {
      var rec = copia(entrada.recalque);
      rec.bombas = entrada.recalque.bombas;
      /* sem bomba informada: as centrífugas do catálogo (js/hidpressaodados.js, fichas com página) — antes ficava "falta a curva" */
      var HPZr = dep("HidPressao", "./hidpressao.js");
      if (!(rec.bombas && rec.bombas.length) && HPZr && HPZr.bombasRecalque) { rec.bombas = HPZr.bombasRecalque(); if (rec.bombas.length) res.premissas.push({ item: "catálogo de bombas do recalque", valor: rec.bombas.length + " motobomba(s) centrífuga(s) do catálogo dos fabricantes (" + rec.bombas.map(function (b) { return b.nome; }).join(", ") + ")", origem: "catalogo" }); }
      if (rec.vazao_m3h == null && rec.consumoDiario_L == null && res.programa && res.programa.consumoDiario && res.programa.consumoDiario.L != null) {
        rec.consumoDiario_L = res.programa.consumoDiario.L;
        res.premissas.push({ item: "consumo diário do recalque", valor: rec.consumoDiario_L + " L/dia (do programa de necessidades)", origem: "norma" });
      }
      if (rec.margemNpsh_m == null && opc.margemNpsh_m != null) rec.margemNpsh_m = opc.margemNpsh_m;
      res.recalque = BO.calcular(rec, ctx, R);
    }

    /* tratamento e industrial rodam DEPOIS do programa (a população da ETE vem dele) */
    if (entrada.tratamento) {
      var TRT = dep("HidTrat", "./hidtrat.js"), tcfg = copia(entrada.tratamento), tm = tcfg.tipo === "ete" ? dep("HidETE", "./hidete.js") : (tcfg.tipo === "eta" ? dep("HidETA", "./hideta.js") : TRT);
      if (tm) {
        tcfg.ctx = ctx;
        if (tcfg.populacao == null && !tcfg.programa && entrada.programa && tcfg.tipo !== "eta") tcfg.programa = copia(entrada.programa);   /* a população vem do programa de necessidades */
        if (tcfg.tipo === "ete" && tcfg.populacao == null && res.programa && res.programa.populacao && res.programa.populacao.valor != null) { tcfg.populacao = res.programa.populacao.valor; res.premissas.push({ item: "população da ETE", valor: tcfg.populacao + " pessoas (do programa de necessidades)", origem: "norma" }); }
        var rt = tm.calcular(tcfg); delete tcfg.ctx;
        res.sistemas.tratamento = rt; juntar(rt);
      }
    }
    var INDM = dep("HidInd", "./hidind.js");
    if (INDM && entrada.industrial) { var ri = INDM.calcular(copia(entrada.industrial), ctx); res.sistemas.industrial = ri; juntar(ri); }
    /* 3b) reservatórios do modelo × reservação (revisão da junção J3) */
    if (res.programa) {
      var CA = AF.CONECTOR_ALIMENTACAO || {}, reservs = [];
      arr(est.familias).forEach(function (f) {
        if (!CA[f.famId]) return;
        var av = null; if (typeof mod.avaliarFam === "function") { try { av = mod.avaliarFam(f.famId, f.tipoId, f.inst); } catch (eA) { av = null; } }
        var vv = (av && av.valores) || {}, sai = arr(av && av.conectores).filter(function (k) { return k.id === "saida"; })[0];
        var vol = vv.Volume_L != null ? Number(vv.Volume_L) : (vv.Capacidade_L != null ? Number(vv.Capacidade_L) : null);
        var ent0 = arr(av && av.conectores).filter(function (k) { return k.id === "entrada"; })[0];
        reservs.push({ id: f.id, volume_L: isFinite(vol) ? vol : null, diametro_m: vv.Diametro != null && isFinite(Number(vv.Diametro)) ? Number(vv.Diametro) : null, ySaida_m: sai && isFinite(Number(sai.y)) ? Number(sai.y) : null,
                       compartimentos: vv.Compartimentos != null ? Number(vv.Compartimentos) : null, funcao: (entrada.reservatorios || {})[f.id] || null,
                       dnEntrada: vv.DN_entrada != null ? Number(vv.DN_entrada) : (ent0 && ent0.dn != null ? Number(ent0.dn) : null), familia: f });
      });
      var FAMH = dep("HidFamilias", "./hidfamilias.js"), cx = null, catR = [];
      try { cx = FAMH && FAMH.porId ? FAMH.porId("hid-caixa-dagua") : null; } catch (eC) { cx = null; }
      if (cx) arr(cx.tipos).forEach(function (t0) { var vl = t0.valores && Number(t0.valores.Volume_L); if (isFinite(vl)) catR.push({ volume_L: vl, nome: t0.nome }); });
      var VR = PG.verificarReservatorios(res.programa, reservs, catR, !!(entrada.alimentacao && entrada.alimentacao.saidaConsumoAcimaReserva), ctx, entrada.programa && entrada.programa.uso);
      arr(VR.avisos).forEach(function (a) { aviso("programa", a.gravidade, a.texto, [a.alvo], a.corrigir); });
      /* NBR 5626:2020, Tabela 1 (6.15): separação atmosférica S na entrada do reservatório e L ≥ 3d do obstáculo.
         Precisa da cota da entrada e do extravasor (a família não traz): sem elas, PENDENTE com o valor exigido. */
      function f1(x) { return x == null ? "?" : String(Math.round(x * 10) / 10).replace(".", ","); }   // hid:ok 1 casa decimal (texto)
      reservs.forEach(function (rv) {
        var nomeS = "separação atmosférica na entrada do reservatório (Tabela 1)";
        if (rv.dnEntrada == null) { ctx.pendencia("modelo.reservatorio[" + rv.id + "].entrada", "DN da entrada do reservatório não identificado", "separação atmosférica"); res.verificacoes.push({ id: "rs-v" + res.verificacoes.length, sistema: "programa", alvo: rv.id, nome: nomeS, valor: null, limite: null, unidade: "mm", eta: null, ok: null, status: "pendente", passos: ["pendente: DN da entrada desconhecido"], fonte: null }); return; }
        var cdi = NR.consulta("materiais.diametro_interno", { material: "pvc_soldavel", dn: rv.dnEntrada }, "di_mm"), dmm = cdi.ok ? Number(cdi.valor) : rv.dnEntrada;
        var tS = ctx.linhas("af.separacao_atmosferica", null, "separação atmosférica " + rv.id), Sreq = null;
        if (tS) { var lS = tS.filter(function (x) { return x.d_max_mm !== "*" && dmm <= Number(x.d_max_mm); }).sort(function (a, b) { return a.d_max_mm - b.d_max_mm; })[0] || tS.filter(function (x) { return x.d_max_mm === "*"; })[0];
                  if (lS) Sreq = lS.s_min_mm != null ? Number(lS.s_min_mm) : Number(lS.s_fator_d) * dmm; }
        var cL = ctx.consulta("af.separacao.obstaculo_fator", null, "valor", "separação atmosférica " + rv.id), Lreq = cL.ok ? Number(cL.valor) * dmm : null;
        var Sdecl = rv.familia && entrada.alimentacao && entrada.alimentacao.separacaoAtmosferica_mm != null ? Number(entrada.alimentacao.separacaoAtmosferica_mm) : null;
        var passosS = ["entrada DN " + rv.dnEntrada + " (d = " + f1(dmm) + " mm" + (cdi.ok ? "" : ", DN usado como d — sem diâmetro interno tabelado") + "): S ≥ " + f1(Sreq) + " mm; obstáculo lateral L ≥ " + f1(Lreq) + " mm (NBR 5626:2020, Tabela 1 e Figuras 3/4)"];
        if (Sreq == null) { res.verificacoes.push({ id: "rs-v" + res.verificacoes.length, sistema: "programa", alvo: rv.id, nome: nomeS, valor: null, limite: null, unidade: "mm", eta: null, ok: null, status: "pendente", passos: passosS.concat(["pendente: tabela de separação atmosférica"]), fonte: null }); return; }
        if (Sdecl == null) {
          ctx.pendencia("modelo.reservatorio[" + rv.id + "].separacaoAtmosferica", "cota da entrada × extravasor não está no modelo: separação atmosférica S ≥ " + f1(Sreq) + " mm e L ≥ " + f1(Lreq) + " mm não verificadas", "separação atmosférica");
          res.verificacoes.push({ id: "rs-v" + res.verificacoes.length, sistema: "programa", alvo: rv.id, nome: nomeS, valor: null, limite: Sreq, unidade: "mm", eta: null, ok: null, status: "pendente", passos: passosS.concat(["pendente: informe a separação da entrada (entrada.alimentacao.separacaoAtmosferica_mm) ou use família com a cota do extravasor"]), fonte: NR.fonte("af.separacao_atmosferica") });
          return;
        }
        var okS = Sdecl >= Sreq;
        res.verificacoes.push({ id: "rs-v" + res.verificacoes.length, sistema: "programa", alvo: rv.id, nome: nomeS, valor: Sdecl, limite: Sreq, unidade: "mm", eta: Sreq / Sdecl, ok: okS, status: okS ? "ok" : "reprovado", passos: passosS.concat(["S informada = " + Sdecl + " mm"]), fonte: NR.fonte("af.separacao_atmosferica") });
        if (!okS) aviso("programa", "erro", "separação atmosférica da entrada do reservatório " + rv.id + " = " + Sdecl + " mm < " + Sreq + " mm (refluxo para a rede pública)", [rv.id], { texto: "subir a entrada para ≥ " + Sreq + " mm acima do extravasor" });
      });
      /* NBR 5626:2020, 6.7.2: alimentador predial repõe o consumo diário em ≤ 6 h (≤ 3 h residência unifamiliar) */
      if (res.programa.consumoDiario && res.programa.consumoDiario.L != null) {
        var ALI = AF.alimentador(entrada.alimentador, res.programa.consumoDiario.L, entrada.programa && entrada.programa.uso, ctx);
        res.alimentador = ALI;
        arr(ALI.verificacoes).forEach(function (v) { v.id = "al-v" + res.verificacoes.length; res.verificacoes.push(v); });
        arr(ALI.avisos).forEach(function (a) { aviso("alimentador", a.gravidade, a.texto, a.elementos || [], a.corrigir); });
      }
      VR.pendencias.forEach(function (p) { ctx.pendencia(p.chave, p.motivo, "reservatório"); });
      VR.premissas.forEach(function (p) { res.premissas.push(p); });
      VR.verificacoes.forEach(function (v) {
        res.verificacoes.push({ id: "rs-v" + res.verificacoes.length, sistema: "programa", alvo: v.alvo, nome: v.nome, valor: v.valor, limite: v.limite, unidade: v.unidade,
                                eta: v.valor && v.limite ? v.limite / v.valor : null, ok: v.ok, status: v.status, passos: v.passos, fonte: v.fonte });
        if (v.status === "reprovado") aviso("programa", "erro", v.nome + ": " + v.passos.join("; "), [v.alvo], v.corrigir);
      });
      res.reservatorios = { modelo: reservs, verificacoes: VR.verificacoes };
    }

    /* 4) premissas e declarações para o memorial */
    if (af.status !== "vazio") {
      res.premissas.push({ item: "método de vazão da água fria", valor: DECLARACOES[af.metodoVazao] || af.metodoVazao, origem: opc.metodoVazao ? "entrada" : "padrao_motor" });
      res.premissas.push({ item: "fórmula de perda de carga", valor: af.formulaPerda, origem: opc.formulaPerda ? "entrada" : "padrao_motor" });
      res.premissas.push({ item: "temperatura da água", valor: af.temperatura_C + " °C", origem: opc.temperatura_C != null ? "entrada" : "padrao_motor" });
    }
    if (es.status !== "vazio") res.premissas.push({ item: "método do esgoto", valor: DECLARACOES.esgoto, origem: "padrao_motor" });
    var SIS2 = [res.sistemas.agua_quente, res.sistemas.pluvial];
    [af, es, res.recalque].concat(SIS2).forEach(function (s) { arr(s && s.premissas).forEach(function (p) { if (!res.premissas.some(function (q) { return q.item === p.item; })) res.premissas.push(p); }); });

    /* 5) achatar verificações e avisos */
    [af, es, res.recalque].concat(SIS2).forEach(function (s) {
      if (!s) return;
      arr(s.verificacoes).forEach(function (v) { res.verificacoes.push(v); });
      arr(s.avisos).forEach(function (a) { res.avisos.push(a); });
    });

    /* 5b) PRESSURIZAÇÃO (js/hidpressao.js): ponto sem pressão → Corrigir com (a) elevar, (b) DN, (c) pressurizador na curva,
       (d) conjunto predial — cada uma com custo e consequência; pressurizador já modelado → ponto de operação no memorial */
    var HPZ = dep("HidPressao", "./hidpressao.js");
    if (HPZ) { try { HPZ.diagnosticar(res, entrada, R); } catch (ePz) { aviso("agua_fria", "aviso", "pressurização: o diagnóstico falhou (" + ePz.message + ") — as opções de correção da pressão não foram montadas", [], { texto: "dimensionar de novo; se repetir, informar o suporte" }); } }

    /* 6) ops: DN calculado → modelo; as inversas em ordem contrária */
    var vistos = {};
    /* incêndio: as ops (hidrantes, extintores, chuveiros, DN) só entram quando o biminst aceita o sistema (aplicavel) */
    var SIS3 = SIS2.concat(res.sistemas.incendio && res.sistemas.incendio.aplicavel ? [res.sistemas.incendio] : [], res.sistemas.industrial && res.sistemas.industrial.aplicavel ? [res.sistemas.industrial] : []);
    [af, es].concat(SIS3).forEach(function (s) { arr(s && s.ops).forEach(function (o) { if (vistos[o.id]) { aviso("geral", "erro", "trecho " + o.id + " recebeu DN de dois sistemas", [o.id], null); return; } vistos[o.id] = 1; res.ops.push(o); }); });
    [af, es].concat(SIS3).forEach(function (s) { arr(s && s.opsDesfazer).forEach(function (o) { res.opsDesfazer.push(o); }); });
    res.opsDesfazer.reverse();

    /* 6b) tubos pela NORMA DO PRODUTO (NBR 5688:2018 e NBR 5648/5688 × catálogo; texto lido em 17/10/2026)
       - pluvial em PVC série NORMAL: a 5688 reserva a água pluvial à série REFORÇADA (CT 75 °C) → reprovado, com a troca;
       - catálogo do fabricante × norma: DE e espessura fora da tolerância → aviso (o cálculo usa sempre o Di da norma). */
    var trs = arr(est.instalacoes && est.instalacoes.trechos), plSN = [];
    trs.forEach(function (t) { if (t.sistema === "pluvial" && t.material === "pvc_esgoto") plSN.push(t.id); });
    if (plSN.length) {
      var cSe = NR.consulta("tubo.nbr5688.series", { material: "pvc_esgoto" }, "pluvial");
      if (!cSe.ok) ctx.consulta("tubo.nbr5688.series", { material: "pvc_esgoto" }, "pluvial", "pluvial em série normal");
      else {
        ctx.consulta("tubo.nbr5688.series", { material: "pvc_esgoto" }, "pluvial", "pluvial em série normal");
        var okSe = cSe.valor === true;
        res.verificacoes.push({ id: "tb-v" + res.verificacoes.length, sistema: "pluvial", alvo: plSN[0], nome: "série do tubo de água pluvial (NBR 5688)", valor: null, limite: null, unidade: "", eta: null, ok: okSe, status: okSe ? "ok" : "reprovado",
                                passos: ["trechos " + plSN.join(", ") + " em PVC série normal (" + (cSe.linha.usos || "") + "): a NBR 5688 dá a água pluvial à série reforçada (CT 75 °C)"], fonte: cSe.fonte });
        if (!okSe) aviso("pluvial", "erro", "água pluvial em PVC série normal nos trechos " + plSN.join(", ") + " (NBR 5688: pluvial é série reforçada)", plSN,
                         { texto: "trocar para PVC série reforçada (SR)", ops: plSN.map(function (t0) { return { op: "instAlterar", id: t0, material: "pvc_serie_r" }; }) });
      }
    }
    if (HP && HP.conferirCatalogo) {
      var parTub = {};
      trs.forEach(function (t) { var k = t.material + "|" + t.dn; if (!parTub[k]) parTub[k] = { material: t.material, dn: t.dn, ids: [] }; parTub[k].ids.push(t.id); });
      Object.keys(parTub).forEach(function (k) {
        var pq = parTub[k], cf = HP.conferirCatalogo(pq.material, pq.dn); if (!cf || !cf.divergencias.length) return;
        aviso("geral", "aviso", "catálogo × norma do tubo " + pq.material + " DN " + pq.dn + ": " + cf.divergencias.map(function (d) { return d.texto; }).join(" · ") + " — o cálculo usa o Di da norma (dem − 2·(e_mín + tol))", pq.ids,
              { texto: "conferir com o fabricante; na compra, exigir tubo conforme a norma (" + (cf.fonte && cf.fonte.doc ? cf.fonte.doc : "norma do produto") + ")" });
      });
    }

    /* PEÇA "SÓ DESENHO" EM PROJETO COM MEMORIAL (18/10/2026, pedido do Rogério): a família do escritório que o motor não reconhece nem foi
       mapeada não entra no cálculo. O resultado a lista (res.pecasSemCalculo) e cada uma vira aviso com Corrigir (mapear ou trocar pela
       equivalente do OrçaPRO); o memorial a põe em "pendências" e em "não abrangido". Não reprova nem derruba o resto: é aviso, não erro. */
    res.pecasSemCalculo = [];
    if (entrada.memorial === true) {
      var HBq = dep("HidBiblioteca", "./biminstbiblioteca.js"), semCalc = [];
      try { semCalc = HBq && HBq.pecasSemCalculo ? HBq.pecasSemCalculo(est) : []; } catch (eSc) { semCalc = []; }
      semCalc.forEach(function (p) {
        res.pecasSemCalculo.push(p);
        res.avisos.push({ id: "peca-sem-calculo-" + p.id, sistema: "geral", gravidade: "aviso", texto: "peça sem cálculo: " + p.nome + " (" + p.id + ") — " + p.motivo, elementos: [p.id],
                          corrigir: { texto: "mapear a peça para um tipo do motor ou trocar pela equivalente do OrçaPRO (a posição e as ligações ficam)", acao: { tipo: "semCalculo", id: p.id, famId: p.famId, equivalente: p.equivalente || null } } });
      });
    }

    /* 7) normas, fonte e pendências */
    res.normas = ctx.normas();
    /* catálogo de fabricante usado no cálculo (diâmetro interno, pressão de serviço dos tubos de água quente) também é fonte */
    if (res.sistemas.agua_quente) arr(res.sistemas.agua_quente.catalogos).forEach(function (c) { res.normas.push({ chave: "catalogo:" + c.json, titulo: c.uso, norma: c.fabricante + " — " + c.linha, edicao: c.edicao || "", doc: c.texto, url: c.url || "", pagina: "", tabela: "", tipo: "secundaria", unidade: "" }); });
    res.pendencias = ctx.pendencias();
    var sec = res.normas.filter(function (n) { return n.tipo === "secundaria"; });
    if (sec.length) aviso("geral", "aviso", sec.length + " de " + res.normas.length + " tabela(s) de norma usadas vêm de FONTE SECUNDÁRIA (transcrição de terceiros, com página): conferir na norma antes de assinar", [],
                          { texto: "comprar/consultar a norma (convênio Confea) e trocar a fonte para primária" });
    /* tabela conferida no TEXTO da norma em cópia não licenciada (NBR 10844, 17/10/2026): o memorial avisa que falta o exemplar */
    var semEx = res.normas.filter(function (n) { return n.exemplarLicenciado === false; });
    if (semEx.length) aviso("geral", "aviso", semEx.length + " tabela(s) conferida(s) no texto da norma (" + semEx.map(function (n) { return n.norma + (n.edicao ? ":" + n.edicao : ""); }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(", ") + ") em cópia NÃO licenciada: a RA precisa do exemplar próprio antes de emitir", [],
                            { texto: "adquirir o exemplar da norma (convênio Confea) e marcar exemplarLicenciado = true na fonte" });
    if (res.fixture) aviso("geral", "erro", "TABELAS DE TESTE — NÃO É NORMA: este resultado foi calculado com a fixture de teste e não pode ir a memorial", [], null);
    if (res.pendencias.length) aviso("geral", "aviso", res.pendencias.length + " valor(es) de norma ou de entrada pendente(s): o cálculo não está completo (ver pendências)", [], { texto: "completar as tabelas (dados-fonte/hidro/normas) ou a entrada" });

    var reprov = res.verificacoes.filter(function (v) { return v.status === "reprovado"; }).length, pend = res.verificacoes.filter(function (v) { return v.status === "pendente"; }).length;
    var erros = res.avisos.filter(function (a) { return a.gravidade === "erro"; }).length;
    /* ⚠ revisão F7 C1/A3 (decisão do gerente 17/10): ok só se NADA está pendente nem reprovado —
       inclusive o status de cada sistema e do programa (pendência de trecho/ponto que não virou
       verificação também derruba o ok). */
    var stSis = [af.status, es.status, res.recalque ? res.recalque.status : "ok", res.programa ? res.programa.status : "ok"].concat(SIS2.map(function (s) { return s ? s.status : "ok"; })).concat(res.sistemas.incendio ? [res.sistemas.incendio.status] : []).concat(res.sistemas.tratamento ? [res.sistemas.tratamento.status] : []).concat(res.sistemas.industrial ? [res.sistemas.industrial.status] : []);
    var sisRuim = stSis.filter(function (x) { return x === "pendente" || x === "reprovado"; }).length;
    res.ok = !reprov && !erros && !res.pendencias.length && !pend && !sisRuim;
    res.resumo = { sistemasNaoOk: sisRuim, trechosAF: arr(af.trechos).length, trechosES: arr(es.trechos).length, alterados: res.ops.length, reprovadas: reprov, pendentes: pend + res.pendencias.length, erros: erros,
                   trechosAQ: res.sistemas.agua_quente ? arr(res.sistemas.agua_quente.trechos).length : 0, trechosAP: res.sistemas.pluvial ? arr(res.sistemas.pluvial.trechos).length : 0,
                   statusAQ: res.sistemas.agua_quente ? res.sistemas.agua_quente.status : null, statusAP: res.sistemas.pluvial ? res.sistemas.pluvial.status : null,
                   statusAF: af.status, statusES: es.status, statusRecalque: res.recalque ? res.recalque.status : null, statusPrograma: res.programa ? res.programa.status : null };
    return res;
  }

  var HidDimensionar = { VERSAO: 1, DECLARACOES: DECLARACOES, calcular: calcular };
  global.HidDimensionar = HidDimensionar;
  if (typeof module !== "undefined" && module.exports) module.exports = HidDimensionar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
