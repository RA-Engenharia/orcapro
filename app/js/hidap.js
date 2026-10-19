/* =====================================================================
 * hidap.js — ÁGUAS PLUVIAIS (sistema "pluvial" do biminst) e
 * APROVEITAMENTO DE ÁGUA DE CHUVA — motor PURO, ES5, Node-testável.
 * Fase 2 do docs/hidro/PLANO-HIDROSSANITARIO.md; contrato em
 * docs/hidro/CONTRATO.md (§6, sistemas.pluvial).
 *
 * O que faz:
 *  1. INTENSIDADE: a da entrada COM A FONTE do projetista ("informada pelo
 *     projetista" no memorial) → a da localidade na tabela (período de retorno
 *     pela tabela de situações) → 150 mm/h só se o projetista PEDIR e a área
 *     for ≤ a da tabela. Cidade fora da tabela = PENDENTE, nunca um padrão.
 *  2. ÁREA DE CONTRIBUIÇÃO pelas fórmulas da tabela (casos a–h: horizontal,
 *     inclinada, paredes) e VAZÃO Q = I·A/60 (L/min).
 *  3. CALHAS: vazão pelas saídas (coeficiente multiplicativo da curva perto
 *     da saída), capacidade pela tabela da semicircular ou por Manning
 *     (retangular, ou n fora da tabela), declividade mínima, e o bocal/
 *     condutor pelo ÁBACO da norma — pendente (o ábaco não está digitalizado).
 *  4. CONDUTORES do modelo: vazão acumulada no sentido do escoamento; vertical
 *     pela tabela DN × vazão (Botelho & Ribeiro Jr., secundária) e DN mínimo;
 *     horizontal pela tabela DN × n × declividade (coluna de declividade NÃO
 *     ACIMA da do trecho); DN nunca diminui a jusante; ops de DN.
 *  5. APROVEITAMENTO (NBR 15527): descarte inicial, volume aproveitável e o
 *     reservatório pelos métodos da fonte (Rippl, simulação, Azevedo Neto,
 *     alemão, inglês, australiano) — ⚠ a fonte lida cita a edição 2007.
 *
 * ⚠ Nenhum valor de norma aqui (CONTRATO §0): tabelas por HidNormas
 *   (dados-fonte/hidro/normas/nbr10844.json e nbr15527.json, derivadas em
 *   tools/hid-normas-derivar.js). Física (Manning, conversões) no bloco
 *   hid:fisica. Faltou → pendente com a chave; pendência nunca vira "ok".
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v !== null && v !== undefined && v !== "" && isFinite(n) ? n : d; }
  function f2(v) { return v == null ? "—" : String(Math.round(v * 100) / 100).replace(".", ","); }
  function f3(v) { return v == null ? "—" : String(Math.round(v * 1000) / 1000).replace(".", ","); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function GR() { return dep("HidGrafo", "./hidgrafo.js"); }
  var MM = 1000, PCT = 100;

  /* hid:fisica-inicio — física e unidades (não é norma)
   * I [mm/h] × A [m²] = L/h; ÷ 60 min/h = L/min.  Q [L/s] = Q [L/min] ÷ 60 s/min.
   * Manning-Strickler: Q = (1/n)·S·R_H^(2/3)·i^(1/2) [m³/s] (Manning, 1891; forma SI); × 60 000 = L/min
   *   (1000 L/m³ × 60 s/min) — a mesma constante K = 60.000 impressa na fonte (UFSM, eq. da calha).
   * Seção semicircular cheia até o diâmetro: S = πD²/8, perímetro molhado πD/2, R_H = D/4.
   * Seção retangular de lâmina a e base b: S = a·b, R_H = a·b/(b + 2a). */
  var MIN_POR_H = 60, S_POR_MIN = 60;
  var K_MANNING_LMIN = 60000;
  var EXP_RH = 2 / 3, EXP_I = 0.5;
  var SEMI_S = 8, SEMI_RH = 4;
  /* hid:fisica-fim */

  function aviso(lista, grav, texto, elementos, corrigir) {
    lista.push({ id: "ap-x" + lista.length, sistema: "pluvial", gravidade: grav, texto: texto, elementos: elementos || [], corrigir: corrigir || null });
  }
  /* Manning (física): Q em L/min, S em m², R em m, i em m/m */
  function manning(S, R, i, n) { return K_MANNING_LMIN * S / n * Math.pow(R, EXP_RH) * Math.pow(i, EXP_I); }
  function manningSemicircular(dMm, iPct, n) { var D = dMm / MM; return manning(Math.PI * D * D / SEMI_S, D / SEMI_RH, iPct / PCT, n); }
  function manningRetangular(bMm, aMm, iPct, n) { var b = bMm / MM, a = aMm / MM; return manning(a * b, a * b / (b + 2 * a), iPct / PCT, n); }

  /* ------------------------------------------------ 1) intensidade */
  /* postos sugeridos para cidade fora da Tabela 5: a correlação indicada pelo RT (ap.postos_vizinhos) ou, sem ela, os
     postos da mesma UF com dado para o T pedido (não há coordenada dos postos na base para medir a distância) */
  function postosSugeridos(cidade, T, ctx) {
    var v = NR().linhas("ap.postos_vizinhos", { localidade: cidade })[0];
    if (v) { ctx.consulta("ap.postos_vizinhos", { localidade: cidade }, "posto1", "pluvial — posto de referência"); return [v.posto1, v.posto2].filter(Boolean); }
    var uf = /\/([A-Z]{2})$/.exec(cidade); if (!uf) return [];
    var vistos = {};
    return NR().linhas("ap.intensidade.localidade", { periodo_anos: T }).map(function (x) { return x.localidade; }).filter(function (l) { if (vistos[l] || !new RegExp("/" + uf[1] + "$").test(l)) return false; vistos[l] = 1; return true; });
  }
  function intensidade(cfg, ctx, areaTotal, premissa, out) {
    var r = { valor_mm_h: null, origem: null, periodo_anos: null, localidade: cfg.cidade || null, fonte: null, passos: [], status: "pendente" };
    var T = num(cfg.periodoRetorno_anos, null);
    if (T == null && cfg.situacao) {
      var cT = ctx.consulta("ap.periodo_retorno.situacao", { situacao: cfg.situacao }, "anos", "pluvial — período de retorno");
      if (cT.ok) { T = num(cT.valor, null); r.fonteT = cT.fonte; r.passos.push("período de retorno: " + T + " anos (" + cfg.situacao + ")"); }
    } else if (T != null) r.passos.push("período de retorno: " + T + " anos (informado)");
    r.periodo_anos = T;
    if (num(cfg.intensidade_mm_h, null) != null) {
      if (!cfg.fonteIntensidade) { ctx.pendencia("entrada.pluvial.fonteIntensidade", "intensidade de " + cfg.intensidade_mm_h + " mm/h informada SEM a fonte (equação IDF, posto, estudo): não entra no cálculo", "pluvial — intensidade"); return r; }
      r.valor_mm_h = num(cfg.intensidade_mm_h, 0); r.origem = "informada";
      r.fonte = { doc: String(cfg.fonteIntensidade), tipo: "informada pelo projetista", norma: "informada pelo projetista", edicao: "" };
      r.passos.push("I = " + r.valor_mm_h + " mm/h — informada pelo projetista (" + cfg.fonteIntensidade + ")");
      premissa("intensidade pluviométrica", r.valor_mm_h + " mm/h — informada pelo projetista: " + cfg.fonteIntensidade, "entrada");
      r.status = "ok"; return r;
    }
    /* posto de referência (nota a da Tabela 5 da NBR 10844): só com a confirmação do projetista */
    if (cfg.postoReferencia && cfg.cidade) {
      if (cfg.postoConfirmado !== true) { ctx.pendencia("entrada.pluvial.postoConfirmado", "posto de referência " + cfg.postoReferencia + " indicado para " + cfg.cidade + " sem a confirmação do projetista (entrada.pluvial.postoConfirmado = true)", "pluvial — intensidade"); return r; }
      if (T == null) { ctx.pendencia("entrada.pluvial.periodoRetorno_anos", "período de retorno não informado", "pluvial — intensidade"); return r; }
      var cP = NR().consulta("ap.intensidade.localidade", { localidade: cfg.postoReferencia, periodo_anos: T }, "intensidade_mm_h");
      if (!cP.ok) { ctx.pendencia("ap.intensidade.localidade[" + cfg.postoReferencia + "]", "o posto " + cfg.postoReferencia + " não tem intensidade para T = " + T + " anos na Tabela 5", "pluvial — intensidade"); return r; }
      ctx.consulta("ap.intensidade.localidade", { localidade: cfg.postoReferencia, periodo_anos: T }, "intensidade_mm_h", "pluvial — intensidade");
      r.valor_mm_h = num(cP.valor, null); r.origem = "posto_referencia"; r.fonte = cP.fonte; r.posto = cfg.postoReferencia;
      r.periodoObservado_anos = num(cP.linha.periodo_observado_anos, null);
      r.passos.push("I = " + r.valor_mm_h + " mm/h do posto " + cfg.postoReferencia + " (T = " + T + " anos), escolhido e confirmado pelo projetista para " + cfg.cidade + " (nota a da Tabela 5)");
      if (r.periodoObservado_anos != null) r.passos.push("⚠ período de retorno realmente observado no posto: " + r.periodoObservado_anos + " anos (série curta — nota b da tabela)");
      premissa("posto de referência da intensidade", cfg.postoReferencia + " para " + cfg.cidade + " — escolhido e confirmado pelo projetista (nota a da Tabela 5)", "entrada");
      r.status = "ok"; return r;
    }
    if (cfg.cidade) {
      if (T == null) { ctx.pendencia("entrada.pluvial.periodoRetorno_anos", "período de retorno não informado (nem situacao: pavimentada, cobertura, sem_extravasamento)", "pluvial — intensidade"); return r; }
      var c = NR().consulta("ap.intensidade.localidade", { localidade: cfg.cidade, periodo_anos: T }, "intensidade_mm_h");
      if (!c.ok) {
        var temCidade = NR().linhas("ap.intensidade.localidade", { localidade: cfg.cidade }).length > 0;
        /* ⚠ nota a da Tabela 5: fora da tabela o motor PROPÕE os postos vizinhos de clima semelhante (correlação do RT ou os
           da mesma UF) e o projetista confirma — nunca adota sozinho */
        var sug = temCidade ? [] : postosSugeridos(cfg.cidade, T, ctx);
        r.sugestaoPostos = sug;
        ctx.pendencia("ap.intensidade.localidade[" + cfg.cidade + "]", temCidade ? "a Tabela 5 tem " + cfg.cidade + " mas sem dado para T = " + T + " anos ('-')" :
                      cfg.cidade + " não está na Tabela 5 da NBR 10844: escolha o posto de clima semelhante (nota a) — sugestão: " + (sug.length ? sug.join(", ") : "nenhum posto da mesma UF") + " — e confirme (entrada.pluvial.postoReferencia + postoConfirmado), ou informe entrada.pluvial.intensidade_mm_h COM a fonte", "pluvial — intensidade");
        if (sug.length) aviso(out.avisos, "aviso", cfg.cidade + " fora da Tabela 5: postos sugeridos " + sug.join(", ") + " (nota a) — o projetista escolhe e confirma", [], { texto: "escolher o posto de referência", acao: { tipo: "escolherPosto", sistema: "pluvial", cidade: cfg.cidade, opcoes: sug } });
        return r;
      }
      ctx.consulta("ap.intensidade.localidade", { localidade: cfg.cidade, periodo_anos: T }, "intensidade_mm_h", "pluvial — intensidade");
      r.valor_mm_h = num(c.valor, null); r.origem = "localidade"; r.fonte = c.fonte;
      r.periodoObservado_anos = num(c.linha.periodo_observado_anos, null);
      r.passos.push("I = " + r.valor_mm_h + " mm/h (" + cfg.cidade + ", T = " + T + " anos, duração da tabela)");
      if (r.periodoObservado_anos != null) { r.passos.push("⚠ período de retorno realmente observado no posto: " + r.periodoObservado_anos + " anos (série curta — nota da tabela)"); }
      r.status = "ok"; return r;
    }
    if (cfg.intensidadeSimplificada === true) {
      var ls = ctx.linhas("ap.intensidade.simplificada", null, "pluvial — intensidade simplificada"), l0 = ls && ls[0];
      if (!l0) return r;
      if (areaTotal == null || areaTotal > num(l0.area_max_m2, 0)) {
        ctx.pendencia("entrada.pluvial.cidade", "a intensidade simplificada só vale até " + l0.area_max_m2 + " m² de projeção (a área é " + f2(areaTotal) + " m²): informe a cidade ou a intensidade com a fonte", "pluvial — intensidade");
        return r;
      }
      r.valor_mm_h = num(l0.intensidade_mm_h, null); r.origem = "simplificada"; r.fonte = NR().fonte("ap.intensidade.simplificada");
      r.passos.push("I = " + r.valor_mm_h + " mm/h (construção até " + l0.area_max_m2 + " m² de projeção; área " + f2(areaTotal) + " m²) — adotada a pedido do projetista");
      premissa("intensidade pluviométrica", "simplificada " + r.valor_mm_h + " mm/h (área ≤ " + l0.area_max_m2 + " m²), pedida em entrada.pluvial.intensidadeSimplificada", "entrada");
      r.status = "ok"; return r;
    }
    ctx.pendencia("entrada.pluvial.cidade", "intensidade pluviométrica sem dado: informe a cidade (tabela) ou entrada.pluvial.intensidade_mm_h com a fonte", "pluvial — intensidade");
    return r;
  }

  /* ------------------------------------------------ 2) área de contribuição */
  var CASOS = {
    a: { vars: ["a", "b"], f: function (v) { return v.a * v.b; }, txt: "A = a·b" },
    b: { vars: ["a", "b", "h"], f: function (v) { return (v.a + v.h / 2) * v.b; }, txt: "A = (a + h/2)·b" },
    c: { vars: ["a", "b"], f: function (v) { return v.a * v.b / 2; }, txt: "A = a·b/2" },
    d: { vars: ["a", "b"], f: function (v) { return v.a * v.b / 2; }, txt: "A = a·b/2" },
    e: { vars: ["a", "b", "c", "d"], f: function (v) { return Math.abs(v.a * v.b - v.c * v.d) / 2; }, txt: "A = (a·b − c·d)/2 (a·b = a parede maior)" },
    f: { vars: ["A1", "A2"], f: function (v) { return Math.sqrt(v.A1 * v.A1 + v.A2 * v.A2) / 2; }, txt: "A = √(A1² + A2²)/2" },
    g: { vars: ["a", "b"], f: function (v) { return v.a * v.b / 2; }, txt: "A = a·b/2" },
    h: { vars: ["a", "b"], f: function (v) { return v.a * v.b / 2; }, txt: "A = a·b/2" }
  };
  function areaDe(x, ctx, linhasArea, premissa) {
    var r = { id: x.id, caso: x.caso || null, destino: x.destino || null, area_m2: null, projecao_m2: null, passos: [], status: "pendente", fonte: null };
    if (num(x.area_m2, null) != null && !x.caso) {
      r.area_m2 = num(x.area_m2, 0); r.projecao_m2 = r.area_m2; r.status = "ok"; r.passos.push("A = " + f2(r.area_m2) + " m² (informada)");
      premissa("área " + x.id, f2(r.area_m2) + " m² informada pelo projetista (sem o caso da fórmula)", "entrada"); return r;
    }
    var C = CASOS[x.caso];
    if (!C) { ctx.pendencia("entrada.pluvial.areas[" + x.id + "].caso", "caso de superfície \"" + x.caso + "\" desconhecido (a–h da tabela de área de contribuição)", "pluvial — área " + x.id); return r; }
    var lin = linhasArea ? linhasArea.filter(function (l) { return String(l.caso || "").indexOf("(" + x.caso + ")") === 0; })[0] : null;
    if (!lin) { if (linhasArea) ctx.pendencia("ap.area_contribuicao[" + x.caso + "]", "o caso (" + x.caso + ") não está na tabela de área de contribuição", "pluvial — área " + x.id); return r; }
    var v = {}, falta = C.vars.filter(function (k) { v[k] = num(x[k], null); return v[k] == null || v[k] < 0; });
    if (falta.length) { ctx.pendencia("entrada.pluvial.areas[" + x.id + "]." + falta.join(","), "medidas que faltam para " + C.txt, "pluvial — área " + x.id); return r; }
    r.area_m2 = C.f(v); r.fonte = NR().fonte("ap.area_contribuicao"); r.status = "ok";
    if (x.caso === "a" || x.caso === "b") r.projecao_m2 = v.a * v.b;
    r.passos.push(lin.caso + ": " + C.txt + " = " + f2(r.area_m2) + " m² (" + C.vars.map(function (k) { return k + " = " + f2(v[k]); }).join("; ") + ")");
    if (C.nota) premissa("área de contribuição, caso (" + x.caso + ")", C.nota);
    return r;
  }

  /* ------------------------------------------------ CALCULAR */
  function calcular(entrada, ctx, R) {
    entrada = entrada || {}; ctx = ctx || NR().contexto();
    var cfg = entrada.pluvial || {}, mod = entrada.modelo || {}, est = mod.estado || {}, opc = entrada.opcoes || {};
    R = R || BI().rede(est, mod.avaliarFam);
    var temRede = arr(R && R.trechos).some(function (t) { return t.sistema === "pluvial"; });
    var out = { status: "ok", intensidade: null, areas: [], calhas: [], trechos: [], aproveitamento: null, verificacoes: [], avisos: [], premissas: [], ops: [], opsDesfazer: [] };
    if (!temRede && !entrada.pluvial) { out.status = "vazio"; return out; }
    function premissa(item, valor, origem) { if (!out.premissas.some(function (p) { return p.item === item; })) out.premissas.push({ item: item, valor: valor, origem: origem || "padrao_motor" }); }
    function verif(alvo, nome, valor, limite, unidade, ok, passos, fonte, status, etaInv) {
      var eta = ok === null || valor == null || limite == null ? null : (etaInv ? (valor > 0 ? limite / valor : null) : (limite > 0 ? valor / limite : null));
      var v = { id: "ap-v" + out.verificacoes.length, sistema: "pluvial", alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unidade, eta: eta, ok: ok,
                status: status || (ok === null ? "pendente" : (ok ? "ok" : "reprovado")), passos: passos || [], fonte: fonte || null };
      out.verificacoes.push(v); return v;
    }
    var travados = {}; arr(opc.travados).forEach(function (id) { travados[id] = 1; });

    /* áreas → intensidade → vazões */
    var la = arr(cfg.areas).length ? ctx.linhas("ap.area_contribuicao", null, "pluvial — área de contribuição") : null;
    out.areas = arr(cfg.areas).map(function (x) { return areaDe(x, ctx, la, premissa); });
    var projTot = out.areas.reduce(function (s, a) { return a.projecao_m2 == null || s == null ? null : s + a.projecao_m2; }, out.areas.length ? 0 : null);
    out.intensidade = intensidade(cfg, ctx, projTot, premissa, out);
    var I = out.intensidade.valor_mm_h;
    /* laje horizontal (5.4.2): declividade mínima — quando a área traz a declividade */
    arr(cfg.areas).forEach(function (x) {
      if (num(x.declividade_pct, null) == null) return;
      var lj = ctx.consulta("ap.laje.declividade_minima", null, "valor", "pluvial — laje " + x.id);
      if (lj.ok) { var okL = num(x.declividade_pct, 0) >= num(lj.valor, 0); verif(x.id, "declividade da laje", num(x.declividade_pct, 0), num(lj.valor, 0), "%", okL, [f2(num(x.declividade_pct, 0)) + "% " + (okL ? "≥" : "<") + " " + f2(num(lj.valor, 0)) + "%"], lj.fonte, null, true);
                   if (!okL) aviso(out.avisos, "erro", "laje " + x.id + " com declividade " + f2(num(x.declividade_pct, 0)) + "% (mínima " + f2(num(lj.valor, 0)) + "%)", [x.id], { texto: "dar caimento de pelo menos " + f2(num(lj.valor, 0)) + "% até os ralos" }); }
    });
    out.areas.forEach(function (a) {
      if (a.area_m2 == null || I == null) { a.vazao_l_min = null; if (a.status === "ok") a.status = "pendente"; a.passos.push("pendente: " + (I == null ? "intensidade pluviométrica" : "área")); return; }
      a.vazao_l_min = I * a.area_m2 / MIN_POR_H;
      a.passos.push("Q = I·A/60 = " + f2(I) + " × " + f2(a.area_m2) + " / 60 = " + f2(a.vazao_l_min) + " L/min");
    });

    /* ⚠ revisão fase 2 C1 (decisão do RT): área cuja calha/condutor não existe, ou sem destino, é ERRO — a vazão dela não
       some calada (antes: 370 L/min descartados, condutores com Q = 0 reduzidos ao DN mínimo e a capa "Atende") */
    var idsCalha = arr(cfg.calhas).map(function (c) { return c.id; }), idsCond = {};
    arr(R && R.trechos).forEach(function (t) { if (t.sistema === "pluvial") idsCond[t.id] = 1; });
    out.areasOrfas = [];
    out.areas.forEach(function (a) {
      var d = a.destino || {}, motivo = null;
      if (d.calha != null) { if (idsCalha.indexOf(d.calha) < 0) motivo = "a calha \"" + d.calha + "\" não existe" + (idsCalha.length ? " (calhas: " + idsCalha.join(", ") + ")" : " (nenhuma calha informada)"); }
      else if (d.condutor != null) { if (!idsCond[d.condutor]) motivo = "o condutor \"" + d.condutor + "\" não existe no modelo de pluvial"; }
      else motivo = "sem destino (calha ou condutor)";
      if (!motivo) return;
      a.orfa = true; a.status = "reprovado"; out.areasOrfas.push(a.id);
      verif(a.id, "área de contribuição ligada a calha/condutor", a.vazao_l_min, null, "L/min", false, ["área " + a.id + ": " + motivo + (a.vazao_l_min != null ? " — " + f2(a.vazao_l_min) + " L/min sem caminho" : "")], null);
      aviso(out.avisos, "erro", "área " + a.id + " sem calha/destino: " + motivo, [a.id],
            { texto: "escolher a calha da área " + a.id + (idsCalha.length ? " (" + idsCalha.join(", ") + ")" : "") + " ou o condutor que a recebe", acao: { tipo: "destino", sistema: "pluvial", area: a.id, calhas: idsCalha } });
    });

    /* calhas */
    var injeta = {}, injPend = {};   /* trecho (condutor) → L/min que chega pela boca de cima */
    function poeNoCondutor(tid, q, pend) { if (!tid) return; if (pend) injPend[tid] = 1; else injeta[tid] = (injeta[tid] || 0) + q; }
    var lsN = null;
    function nMaterial(mat, uso) { var c = ctx.consulta("ap.manning.n", { material: mat }, "n", uso); return c.ok ? { n: num(c.valor, null), fonte: c.fonte } : null; }
    arr(cfg.calhas).forEach(function (ch) {
      var r = { id: ch.id, secao: ch.secao || "semicircular", declividade_pct: num(ch.declividade_pct, null), passos: [], saidas: [], status: "pendente" };
      out.calhas.push(r);
      var as = out.areas.filter(function (a) { return a.destino && a.destino.calha === ch.id; });
      var pend = !as.length || as.some(function (a) { return a.vazao_l_min == null; });
      r.vazao_l_min = pend ? null : as.reduce(function (s, a) { return s + a.vazao_l_min; }, 0);
      if (!as.length) { aviso(out.avisos, "aviso", "calha " + ch.id + " sem área de contribuição ligada", [ch.id], { texto: "ligar as áreas à calha (areas[].destino.calha)" }); }
      var sds = arr(ch.saidas); if (!sds.length) { ctx.pendencia("entrada.pluvial.calhas[" + ch.id + "].saidas", "calha sem saída (condutor) informada", "pluvial — calha " + ch.id); return; }
      /* ⚠ revisão fase 2 M1: "partes iguais" subdimensionava a saída do meio. Vale a área de influência de cada saída
         (saidas[].areaInfluencia_m2); sem ela, cada saída é verificada para a vazão TOTAL da calha (lado seguro) */
      var aInf = sds.map(function (s) { return num(s.areaInfluencia_m2, null); }), somaInf = aInf.reduce(function (x, y) { return y == null || x == null ? null : x + y; }, 0);
      var porArea = sds.length > 1 && somaInf != null && somaInf > 0;
      if (sds.length > 1) premissa("vazão nas saídas da calha " + ch.id, porArea ? "pela área de influência de cada saída" : "sem a área de influência de cada saída (saidas[].areaInfluencia_m2): cada saída verificada para a vazão TOTAL da calha (lado seguro)");
      var qProj = null;
      sds.forEach(function (s, iS) {
        var qs = r.vazao_l_min == null ? null : (porArea ? r.vazao_l_min * aInf[iS] / somaInf : r.vazao_l_min), coef = 1, pc = [];
        if (s.curva && num(s.distanciaCurva_m, null) != null) {
          var lc = ctx.linhas("ap.calha.coef_saida", { curva: s.curva }, "pluvial — calha " + ch.id);
          var lin = lc ? lc.filter(function (x) { return num(x.dist_max_m, 0) >= num(s.distanciaCurva_m, 0); }).sort(function (a, b) { return a.dist_max_m - b.dist_max_m; })[0] : null;
          if (lc && !lc.length) ctx.pendencia("ap.calha.coef_saida[" + s.curva + "]", "tipo de curva \"" + s.curva + "\" fora da tabela (canto_reto, canto_arredondado)", "pluvial — calha " + ch.id);
          if (lin) { coef = num(lin.coef, 1); pc.push("curva " + s.curva + " a " + f2(s.distanciaCurva_m) + " m da saída: coeficiente " + f2(coef)); }
        }
        var sd = { condutor: s.condutor || null, vazao_l_min: qs, coef: coef, vazaoProjeto_l_min: qs == null ? null : qs * coef, passos: pc };
        r.saidas.push(sd);
        if (sd.vazaoProjeto_l_min != null && (qProj == null || sd.vazaoProjeto_l_min > qProj)) qProj = sd.vazaoProjeto_l_min;
        if (s.condutor && !idsCond[s.condutor]) {
          verif(ch.id, "saída da calha ligada a condutor", qs, null, "L/min", false, ["a saída aponta o condutor \"" + s.condutor + "\", que não existe no modelo de pluvial"], null);
          aviso(out.avisos, "erro", "calha " + ch.id + ": saída para o condutor " + s.condutor + ", que não existe no modelo", [ch.id], { texto: "escolher o condutor da saída da calha " + ch.id });
        } else poeNoCondutor(s.condutor, qs, qs == null);
      });
      r.vazaoProjeto_l_min = qProj;
      if (r.vazao_l_min != null) r.passos.push("Q da calha = Σ áreas = " + f2(r.vazao_l_min) + " L/min; Q de projeto (maior saída × coeficiente) = " + f2(qProj) + " L/min");
      /* declividade mínima */
      var dm = ctx.consulta("ap.calha.declividade_minima", null, "valor", "pluvial — calha " + ch.id);
      if (r.declividade_pct == null) ctx.pendencia("entrada.pluvial.calhas[" + ch.id + "].declividade_pct", "declividade da calha não informada", "pluvial — calha " + ch.id);
      else if (dm.ok) verif(ch.id, "declividade da calha", r.declividade_pct, num(dm.valor, 0), "%", r.declividade_pct >= num(dm.valor, 0), [f2(r.declividade_pct) + "% ≥ " + f2(num(dm.valor, 0)) + "%"], dm.fonte, null, true);
      /* capacidade */
      var cap = null, metodo = null, fonteCap = null, mat = ch.material || "pvc";
      if (r.declividade_pct != null && r.declividade_pct > 0) {
        if (r.secao === "semicircular" && num(ch.diametro_mm, null) != null) {
          var nm = nMaterial(mat, "pluvial — calha " + ch.id);
          var lsC = NR().linhas("ap.calha.semicircular", { di_mm: num(ch.diametro_mm, 0) }).filter(function (x) { return num(x.declividade_pct, Infinity) <= r.declividade_pct; }).sort(function (a, b) { return b.declividade_pct - a.declividade_pct; });
          /* a tabela é de n = 0,011 (título da fonte): só vale para material com esse n */
          var nTab = NR().consulta("ap.manning.n", { material: "pvc" }, "n");
          if (lsC.length && nm && nTab.ok && nm.n === num(nTab.valor, null)) {
            ctx.consulta("ap.calha.semicircular", { di_mm: num(ch.diametro_mm, 0), declividade_pct: lsC[0].declividade_pct }, "vazao_l_min", "pluvial — calha " + ch.id);
            cap = num(lsC[0].vazao_l_min, null); metodo = "tabela (D " + ch.diametro_mm + " mm, i " + f2(lsC[0].declividade_pct) + "% — a coluna não acima da declividade da calha)"; fonteCap = NR().fonte("ap.calha.semicircular");
          } else if (nm) {
            cap = manningSemicircular(num(ch.diametro_mm, 0), r.declividade_pct, nm.n); metodo = "Manning, semicircular, n = " + nm.n; fonteCap = nm.fonte;
          }
        } else if (r.secao === "retangular" && num(ch.base_mm, null) != null && num(ch.lamina_mm, null) != null) {
          /* ⚠ revisão fase 2 M2: a capacidade é pela LÂMINA d'água (lamina_mm), nunca pela altura da calha (calha transbordando);
             a fonte não traz borda livre: sem lâmina → pendente */
          var nr = nMaterial(mat, "pluvial — calha " + ch.id), lam = num(ch.lamina_mm, 0);
          if (num(ch.altura_mm, null) != null && lam > num(ch.altura_mm, 0)) { verif(ch.id, "lâmina d'água ≤ altura da calha", lam, num(ch.altura_mm, 0), "mm", false, ["lâmina " + lam + " mm > altura " + ch.altura_mm + " mm"], null); aviso(out.avisos, "erro", "calha " + ch.id + ": lâmina d'água maior que a altura da calha", [ch.id], { texto: "corrigir lamina_mm ou altura_mm" }); }
          if (nr) { cap = manningRetangular(num(ch.base_mm, 0), lam, r.declividade_pct, nr.n); metodo = "Manning, retangular, base " + ch.base_mm + " mm e lâmina d'água " + lam + " mm, n = " + nr.n; fonteCap = nr.fonte; }
        } else if (r.secao === "retangular") ctx.pendencia("entrada.pluvial.calhas[" + ch.id + "].lamina_mm", "calha retangular sem a LÂMINA d'água de projeto (lamina_mm; altura_mm é a da calha) — a fonte não traz borda livre", "pluvial — calha " + ch.id);
        else ctx.pendencia("entrada.pluvial.calhas[" + ch.id + "].secao", "seção da calha incompleta (semicircular: diametro_mm; retangular: base_mm e lamina_mm)", "pluvial — calha " + ch.id);
      }
      r.capacidade_l_min = cap; r.metodoCapacidade = metodo;
      if (cap != null && qProj != null) {
        var okC = qProj <= cap;
        verif(ch.id, "capacidade da calha", qProj, cap, "L/min", okC, ["Q projeto " + f2(qProj) + " L/min " + (okC ? "≤" : ">") + " capacidade " + f2(cap) + " L/min (" + metodo + ")"], fonteCap);
        if (!okC) aviso(out.avisos, "erro", "calha " + ch.id + ": " + f2(qProj) + " L/min acima da capacidade " + f2(cap) + " L/min", [ch.id], { texto: "aumentar a seção ou a declividade da calha, ou mais saídas" });
      } else verif(ch.id, "capacidade da calha", qProj, cap, "L/min", null, ["pendente: " + (qProj == null ? "vazão" : "capacidade da seção")], fonteCap);
      /* bocal / condutor pelo ábaco (H, L): sem o ábaco digitalizado, PENDENTE declarado */
      var ab = ctx.consulta("ap.condutor_vertical.abacos", null, "valor", "pluvial — bocal da calha " + ch.id);
      verif(ch.id, "bocal de saída (ábaco: lâmina na calha × comprimento do condutor)", null, null, "mm", null, ["pendente: " + ab.motivo], null);
      var stC = out.verificacoes.filter(function (v) { return v.alvo === ch.id; }).map(function (v) { return v.status; });
      r.status = stC.indexOf("reprovado") >= 0 ? "reprovado" : (stC.indexOf("pendente") >= 0 ? "pendente" : "ok");
    });
    /* áreas que vão direto a um condutor */
    out.areas.forEach(function (a) { if (a.destino && a.destino.condutor) poeNoCondutor(a.destino.condutor, a.vazao_l_min, a.vazao_l_min == null); });

    /* condutores do modelo */
    if (temRede) rede(entrada, ctx, R, out, injeta, injPend, travados, verif, premissa, nMaterial);
    if (cfg.aproveitamento) out.aproveitamento = aproveitamento(cfg, ctx, out, verif, premissa);

    var sts = out.verificacoes.map(function (v) { return v.status; }).concat([out.intensidade.status]).concat(out.areas.map(function (a) { return a.status; })).concat(out.trechos.map(function (t) { return t.status; }))
      .concat(out.calhas.map(function (c) { return c.status; })).concat(out.aproveitamento ? [out.aproveitamento.status] : []);
    out.status = sts.indexOf("reprovado") >= 0 ? "reprovado" : (sts.indexOf("pendente") >= 0 ? "pendente" : "ok");
    if (out.avisos.some(function (a) { return a.gravidade === "erro"; }) && out.status === "ok") out.status = "reprovado";
    return out;
  }

  /* ------------------------------------------------ diâmetro interno do condutor
   * Tabela de norma (materiais.diametro_interno) → tubo do catálogo da série (DE − 2e, com a fonte do catálogo) → null
   * (pendente): os catálogos de série R extraídos têm o DE mas NÃO a espessura da parede. */
  var CATALOGO_TUBO = { pvc_serie_r: ["amanco-wavin-esgoto-serie-reforcada.json", "tigre-esgoto-serie-reforcada.json"], pvc_esgoto: ["amanco-wavin-esgoto-serie-normal.json", "tigre-esgoto-serie-normal.json"] };
  function diInfo(mat, dn) {
    var c = NR().consulta("materiais.diametro_interno", { material: mat, dn: dn }, "di_mm");
    if (c.ok) return { di: num(c.valor, null), fonte: c.fonte };
    var Cg = dep("HidCatalogo", "./hidcatalogo.js"); if (!Cg || typeof Cg.itens !== "function") return null;
    var js = CATALOGO_TUBO[mat] || [];
    for (var i = 0; i < js.length; i++) {
      var it = Cg.itens({ tipo: "tubo", fonteJson: js[i], dn: dn }).filter(function (x) { var d = x.dim || {}; return num(x.de_mm, num(d.D, null)) != null && num(x.espessura_mm, num(d.e, null)) != null; })[0];
      if (it) { var d0 = it.dim || {}, de = num(it.de_mm, num(d0.D, null)), e = num(it.espessura_mm, num(d0.e, null)), F = Cg.fonte(it);
                /* ⚠ a Tigre não rotula a coluna lida como espessura ("Cota E"): a ressalva segue para a verificação; a Amanco (ficha p.8,
                   rotulada) vem primeiro na lista do material */
                var ress = it.dados && it.dados.fonteEspessura && /não rotula/.test(String(it.dados.fonteEspessura)) ? String(it.dados.fonteEspessura) : null;
                return { di: de - 2 * e, de: de, e: e, ressalva: ress, fonte: F ? { doc: F.texto, pagina: F.pagina, url: F.url, tipo: "secundaria", norma: "catálogo do fabricante", tabela: "DE − 2e", obs: ress || undefined } : null }; }
    }
    return null;
  }

  /* ------------------------------------------------ rede de condutores */
  function rede(entrada, ctx, R, out, injeta, injPend, travados, verif, premissa, nMaterial) {
    var B = BI(), Gr = GR(), est = (entrada.modelo || {}).estado || {};
    var G = Gr.montar(R, est, ["pluvial"]);
    if (!G.ordemA.length) return;
    /* sentido: vertical desce (do nó mais alto para o mais baixo); horizontal de p1 para p2 (convenção do biminst) */
    var dir = {};
    G.ordemA.forEach(function (eid) {
      var e = G.arestas[eid], de = e.a, para = e.b;
      if (e.vertical && G.nos[e.a].y < G.nos[e.b].y) { de = e.b; para = e.a; }
      dir[eid] = { de: de, para: para };
    });
    /* injeção: a boca do condutor = o nó mais alto do trecho (vertical) ou o de montante (horizontal) */
    var inj = {}, injP = {};
    function bocaDe(tid) {
      var ps = G.partes[tid]; if (!ps || !ps.length) return null;
      var nos = []; ps.forEach(function (eid) { nos.push(dir[eid].de, dir[eid].para); });
      var temEntrada = function (n) { return ps.some(function (eid) { return dir[eid].para === n; }); };
      var cab = nos.filter(function (n) { return !temEntrada(n); });
      return cab.length ? cab[0] : null;
    }
    Object.keys(injeta).concat(Object.keys(injPend)).forEach(function (tid) {
      var n = bocaDe(tid);
      if (n == null) { aviso(out.avisos, "erro", "o condutor " + tid + " (saída de calha/área) não existe no modelo de pluvial", [tid], { texto: "conferir o id do trecho em pluvial.calhas[].saidas[].condutor / areas[].destino.condutor" }); ctx.pendencia("entrada.pluvial.condutor[" + tid + "]", "condutor inexistente no modelo", "pluvial"); return; }
      if (injPend[tid]) injP[n] = 1;
      if (injeta[tid] != null) inj[n] = (inj[n] || 0) + injeta[tid];
    });
    /* ordem topológica (Kahn) */
    var entra = {}, sai = {};
    G.ordemN.forEach(function (n) { entra[n] = []; sai[n] = []; });
    G.ordemA.forEach(function (eid) { sai[dir[eid].de].push(eid); entra[dir[eid].para].push(eid); });
    var grau = {}, fila = [], ordem = [];
    G.ordemN.forEach(function (n) { grau[n] = entra[n].length; if (!grau[n]) fila.push(n); });
    while (fila.length) { var n0 = fila.shift(); ordem.push(n0); sai[n0].forEach(function (eid) { var p = dir[eid].para; if (--grau[p] === 0) fila.push(p); }); }
    if (ordem.length < G.ordemN.length) aviso(out.avisos, "erro", "a rede de pluvial tem um ciclo (o escoamento volta ao mesmo ponto): os trechos do ciclo não foram calculados", [], { texto: "conferir o sentido dos trechos horizontais (p1 → p2 desce)" });
    var Q = {}, pendQ = {}, dnAcc = {}, E = {};
    /* ⚠ NBR 10844 5.6.3 (texto conferido 17/10/2026): DIÂMETRO INTERNO mínimo 70 mm — substitui o "DN 75" do manual.
       DN comercial cujo Di ≥ 70; sem o Di do material, o menor DN ≥ 70 (Di ≤ DN) e a verificação do Di fica pendente */
    var diMinV = ctx.consulta("ap.condutor_vertical.di_minimo_mm", null, "valor", "pluvial — condutor vertical");
    function diDe(mat, dn) { var x = diInfo(mat, dn); return x ? x.di : null; }
    var decMinH = ctx.consulta("ap.condutor_horizontal.declividade_minima", null, "valor", "pluvial — condutor horizontal");
    var capV = ctx.linhas("ap.condutor_vertical.capacidade", null, "pluvial — condutor vertical");
    /* ⚠ revisão fase 2 M3: a própria fonte diz que a tabela de Botelho & Ribeiro Jr. NÃO é a da norma ("serve de conferência");
       a 10844 dimensiona pelo ábaco (Q × lâmina × comprimento), não digitalizado → todo condutor vertical fica PENDENTE,
       com o DN de conferência mostrado (e reprovado se o do modelo for menor) */
    premissa("condutor vertical", "tabela DN × vazão de Botelho & Ribeiro Jr. usada só como CONFERÊNCIA (a fonte diz que não é a tabela da norma); o dimensionamento pela NBR 10844 (ábaco) está pendente");
    var abV = ctx.consulta("ap.condutor_vertical.abacos", null, "valor", "pluvial — condutores verticais");
    ordem.forEach(function (n) {
      var qIn = (inj[n] || 0), pIn = !!injP[n], dnIn = 0;
      entra[n].forEach(function (eid) { qIn += Q[eid] || 0; pIn = pIn || !!pendQ[eid]; dnIn = Math.max(dnIn, dnAcc[eid] || 0); });
      var outs = sai[n];
      if (outs.length > 1) aviso(out.avisos, "aviso", "nó de pluvial com " + outs.length + " saídas: a vazão foi dividida em partes iguais", outs.map(function (eid) { return G.arestas[eid].trecho; }), { texto: "um condutor por saída (sem derivação a jusante)" });
      outs.forEach(function (eid) {
        var e = G.arestas[eid], d = dir[eid], q = qIn / (outs.length || 1), r = { e: e, de: d.de, para: d.para, q: pIn ? null : q, passos: [], pend: [], dnMin: dnIn };
        E[eid] = r; Q[eid] = q; pendQ[eid] = pIn;
        var travado = !!travados[e.trecho], mat = e.material, dns = ((B.MATERIAIS[mat] || {}).dns || []).slice().sort(function (a, b) { return a - b; });
        r.classe = e.vertical ? "condutor_vertical" : "condutor_horizontal"; r.travado = travado;
        if (pIn) { r.dn = e.dn; r.pend.push("vazão a montante"); r.passos.push("pendente: vazão a montante (intensidade, área ou calha)"); dnAcc[eid] = Math.max(dnIn, e.dn); return; }
        /* ⚠ C1: sem nenhuma contribuição a montante, Q = 0 não é "atende": pendente, sem op (nunca reduzir o DN do modelo) */
        if (!(q > 0)) { r.q = null; r.dn = e.dn; r.pend.push("sem área de contribuição ligada"); r.passos.push("pendente: nenhuma área, calha ou trecho chega a este condutor"); dnAcc[eid] = Math.max(dnIn, e.dn); return; }
        r.passos.push("Q = " + f2(q) + " L/min (" + f3(q / S_POR_MIN) + " L/s), acumulada de montante");
        var req = null;
        if (e.vertical) {
          if (!capV) { r.pend.push("ap.condutor_vertical.capacidade"); }
          else {
            var lin = capV.filter(function (x) { return num(x.vazao_ls, -1) >= q / S_POR_MIN; }).sort(function (a, b) { return a.dn - b.dn; })[0];
            if (!lin) { r.pend.push("vazão acima da tabela de condutor vertical"); ctx.pendencia("pluvial.trecho[" + e.trecho + "]", "vazão " + f3(q / S_POR_MIN) + " L/s acima da tabela de condutor vertical", "trecho " + e.trecho); }
            else { req = num(lin.dn, null); r.passos.push("conferência (tabela do livro-texto, não a da norma): DN " + lin.dn + " leva " + f2(lin.vazao_ls) + " L/s ≥ " + f3(q / S_POR_MIN) + " L/s"); }
            if (diMinV.ok && req != null) {
              var dMin = num(diMinV.valor, 0), dnDi = dns.filter(function (x) { var di = diDe(mat, x); return di != null ? di >= dMin : x >= dMin; })[0];
              if (dnDi != null && dnDi > req) { req = dnDi; r.passos.push("diâmetro interno mínimo " + dMin + " mm (NBR 10844 5.6.3): DN " + req); }
              r.diMin = dMin;
            }
          }
        } else {
          /* horizontal escoa de p1 (pa) para p2 (pb): declividade = queda / comprimento em planta */
          var hz = Math.sqrt(Math.pow(e.pb.x - e.pa.x, 2) + Math.pow(e.pb.z - e.pa.z, 2)), dec = hz > 0 ? (e.pa.y - e.pb.y) / hz * PCT : null;
          r.declividade_pct = dec;
          if (decMinH.ok) {
            r.declividadeMin_pct = num(decMinH.valor, null);
            var okD = dec != null && dec >= r.declividadeMin_pct - 1e-9;   // hid:ok tolerância de ponto flutuante
            verif(e.trecho, "declividade do condutor horizontal", dec, r.declividadeMin_pct, "%", okD, [f2(dec) + "% " + (okD ? "≥" : "<") + " " + f2(r.declividadeMin_pct) + "%"], decMinH.fonte, null, true);
            if (!okD) aviso(out.avisos, "erro", "condutor " + e.trecho + " com declividade " + f2(dec) + "% (mínima " + f2(r.declividadeMin_pct) + "%)", [e.trecho], { texto: "rebaixar a ponta de jusante em " + f2((r.declividadeMin_pct - (dec || 0)) / PCT * hz) + " m" });
          }
          var nm = nMaterial(mat, "trecho " + e.trecho);
          if (!nm) r.pend.push("ap.manning.n");
          else {
            var lsH = NR().linhas("ap.condutor_horizontal.capacidade", { n: nm.n });
            if (!lsH.length) { r.pend.push("tabela de condutor horizontal para n = " + nm.n); ctx.pendencia("ap.condutor_horizontal.capacidade[n=" + nm.n + "]", "sem a coluna de n = " + nm.n + " na tabela de condutores horizontais", "trecho " + e.trecho); }
            else {
              var decs = lsH.map(function (x) { return num(x.declividade_pct, null); }).filter(function (x, i, a) { return x != null && a.indexOf(x) === i && dec != null && x <= dec + 1e-9; }).sort(function (a, b) { return b - a; });   // hid:ok tolerância
              if (!decs.length) { r.pend.push("declividade abaixo da menor coluna da tabela"); r.passos.push("declividade " + f2(dec) + "% abaixo da menor coluna da tabela: capacidade não verificada"); }
              else {
                ctx.consulta("ap.condutor_horizontal.capacidade", { n: nm.n, declividade_pct: decs[0] }, "vazao_l_min", "trecho " + e.trecho);
                var lH = lsH.filter(function (x) { return num(x.declividade_pct, null) === decs[0] && num(x.vazao_l_min, -1) >= q; }).sort(function (a, b) { return a.dn - b.dn; })[0];
                r.colunaDecl_pct = decs[0];
                if (!lH) { r.pend.push("vazão acima da tabela de condutor horizontal"); ctx.pendencia("pluvial.trecho[" + e.trecho + "]", "vazão " + f2(q) + " L/min acima da tabela (n " + nm.n + ", i " + decs[0] + "%)", "trecho " + e.trecho); }
                else { req = num(lH.dn, null); r.passos.push("tabela (n " + nm.n + ", coluna i = " + f2(decs[0]) + "% ≤ " + f2(dec) + "%): DN " + lH.dn + " leva " + f2(lH.vazao_l_min) + " L/min ≥ " + f2(q) + " L/min"); }
              }
            }
          }
        }
        /* DN: o do cálculo, nunca menor que o de montante; comercial do material */
        if (req != null) {
          var reqF = Math.max(req, dnIn);
          if (reqF > req) r.passos.push("DN nunca diminui a jusante: " + reqF + " (montante)");
          var dnC = dns.filter(function (x) { return x >= reqF; })[0];
          if (dnC == null) { r.pend.push("DN " + reqF + " acima do maior DN de " + mat); ctx.pendencia("pluvial.trecho[" + e.trecho + "]", "DN " + reqF + " acima do maior DN comercial de " + mat, "trecho " + e.trecho); }
          else r.dnReq = dnC;
        }
        if (e.vertical) {
          /* vertical: o DN do modelo fica (o cálculo da norma está pendente); a conferência só aponta o DN menor */
          r.dn = e.dn; r.conferencia = true; r.pend.push("ap.condutor_vertical.abacos");
          r.passos.push("pendente: dimensionamento pelo ábaco da NBR 10844 — " + abV.motivo);
          dnAcc[eid] = Math.max(dnIn, e.dn, r.dnReq || 0);
        } else {
          r.dn = travado ? e.dn : (r.dnReq != null ? r.dnReq : e.dn);
          dnAcc[eid] = Math.max(dnIn, r.dn || 0);
        }
      });
    });
    /* resultado por trecho + verificação de capacidade/DN */
    G.ordemA.forEach(function (eid) {
      var r = E[eid]; if (!r) return;
      var e = r.e, t = { id: e.trecho, aresta: eid, parte: e.parte, de: r.de, para: r.para, classe: r.classe, material: e.material, dnModelo: e.dn, dn: r.dn, dnReq: r.dnReq || null, travado: r.travado,
                         comprimento_m: e.comprimento, vazao_l_min: r.q, vazao_ls: r.q == null ? null : r.q / S_POR_MIN, declividade_pct: r.declividade_pct == null ? null : r.declividade_pct,
                         declividadeMin_pct: r.declividadeMin_pct == null ? null : r.declividadeMin_pct, colunaDecl_pct: r.colunaDecl_pct == null ? null : r.colunaDecl_pct, status: r.pend.length ? "pendente" : "ok", passos: r.passos, pendencias: r.pend };
      if (r.conferencia && r.dnReq != null) {
        var okC = e.dn >= r.dnReq;
        verif(e.trecho, "DN do condutor vertical — conferência (tabela do livro-texto, não a da norma)", e.dn, r.dnReq, "mm", okC, ["DN do modelo " + e.dn + (okC ? " ≥ " : " < ") + "DN de conferência " + r.dnReq], NR().fonte("ap.condutor_vertical.capacidade"), null, true);
        if (!okC) { t.status = "reprovado"; aviso(out.avisos, "erro", "condutor vertical " + e.trecho + " DN " + e.dn + " menor que o DN de conferência " + r.dnReq, [e.trecho], { texto: "aumentar o condutor " + e.trecho + " para DN " + r.dnReq, ops: r.travado ? [] : [{ op: "instAlterar", id: e.trecho, dn: r.dnReq }] }); }
        verif(e.trecho, "condutor vertical pelo ábaco da NBR 10844", null, null, "mm", null, ["pendente: " + abV.motivo], null);
        if (r.diMin != null) {
          var diI = diInfo(e.material, e.dn), diM = diI ? diI.di : null;
          if (diM == null) { ctx.pendencia("materiais.diametro_interno[" + e.material + "]", "diâmetro interno de " + e.material + " DN " + e.dn + ": sem tabela e o catálogo não traz a espessura da parede (DE − 2e) — o Di mínimo de " + r.diMin + " mm (NBR 10844 5.6.3) não foi verificado", "trecho " + e.trecho);
                             verif(e.trecho, "diâmetro interno mínimo do condutor vertical", null, r.diMin, "mm", null, ["pendente: Di de " + e.material + " DN " + e.dn + " sem tabela"], diMinV.fonte); }
          else verif(e.trecho, "diâmetro interno mínimo do condutor vertical", diM, r.diMin, "mm", diM >= r.diMin, ["Di " + f2(diM) + " mm " + (diM >= r.diMin ? "≥" : "<") + " " + r.diMin + " mm (Di: " + (diI.fonte ? diI.fonte.doc + ", DE " + f2(diI.de) + " − 2 × " + f2(diI.e) + " mm" : "tabela") + ")" + (diI.ressalva ? " — ressalva da fonte: " + diI.ressalva : "")], diMinV.fonte, null, true);
        }
      }
      if (!r.pend.length && r.dnReq != null) {
        var ok = r.dn >= r.dnReq;
        verif(e.trecho, "DN do " + (r.classe === "condutor_vertical" ? "condutor vertical" : "condutor horizontal"), r.dn, r.dnReq, "mm", ok, ["DN " + r.dn + (ok ? " ≥ " : " < ") + "DN exigido " + r.dnReq], NR().fonte(r.classe === "condutor_vertical" ? "ap.condutor_vertical.capacidade" : "ap.condutor_horizontal.capacidade"), null, true);
        if (!ok) { t.status = "reprovado"; aviso(out.avisos, "erro", "condutor " + e.trecho + " travado em DN " + r.dn + " (exigido DN " + r.dnReq + ")", [e.trecho], { texto: "destravar o trecho para o cálculo aumentar o DN" }); }
      }
      if (out.verificacoes.some(function (v) { return v.alvo === e.trecho && v.status === "reprovado"; })) t.status = "reprovado";
      out.trechos.push(t);
    });
    inspecao(G, dir, E, ctx, out, verif);
    /* ops: o maior DN das partes do trecho (só trecho calculado e não travado) */
    Object.keys(G.partes).forEach(function (tid) {
      var ps = G.partes[tid].map(function (eid) { return E[eid]; }).filter(Boolean);
      if (!ps.length || ps.some(function (r) { return r.pend.length || r.dnReq == null; }) || ps[0].travado) return;
      var dnF = Math.max.apply(null, ps.map(function (r) { return r.dn; })), dn0 = ps[0].e.dn;
      if (dnF < dn0 && out.areasOrfas.length) return;   /* ⚠ C1: vazão incompleta (área órfã) nunca reduz DN */
      if (dnF !== dn0) { out.ops.push({ op: "instAlterar", id: tid, dn: dnF }); out.opsDesfazer.push({ op: "instAlterar", id: tid, dn: dn0 }); }
    });
  }

  /* ------------------------------------------------ inspeção / caixa de areia (NBR 10844 5.7.3, 5.7.4, 5.7.5)
   * Exige inspeção (aparente) ou caixa de areia (enterrada) em toda conexão, mudança de declividade ou de direção, na
   * ligação vertical → horizontal e a cada 20 m de trecho reto. O nó com peça de pluvial do modelo conta como ponto de
   * inspeção (premissa); sem peça → reprovado com "Corrigir" (inserir a peça). */
  /* ⚠ decisão do gerente (17/10/2026): só conta peça que É dispositivo de inspeção — caixa de areia, caixa de inspeção/
     passagem ou peça de inspeção. Ralo, caixa sifonada, calha e bocal NÃO contam. */
  var PECA_INSPECAO = { caixa_areia: 1, caixa_inspecao: 1, caixa_passagem: 1, peca_inspecao: 1 };
  var FAMILIA_INSPECAO = "hid-caixa-areia";
  function inspecao(G, dir, E, ctx, out, verif) {
    var GrM = GR(), dm = ctx.consulta("ap.inspecao.distancia_max_m", null, "valor", "pluvial — inspeção");
    /* hid:fisica-inicio — tolerâncias geométricas (não é norma): desvio de 1° = mudança de direção; 1e-6 % = mudança de declividade */
    var TOL_ANG = 1, TOL_DEC = 1e-6;
    /* hid:fisica-fim */
    var precisa = {}, horiz = function (eid) { return !G.arestas[eid].vertical; };
    G.ordemN.forEach(function (n) {
      var es = G.nos[n].arestas, H = es.filter(horiz), V = es.filter(function (x) { return !horiz(x); });
      if (!H.length) return;
      var porque = null;
      if (V.length) porque = "ligação condutor vertical → horizontal (5.7.5)";
      else if (H.length >= 3) porque = "conexão de condutores (5.7.3)";   // hid:ok 3 trechos no nó = conexão (contagem, não norma)
      else if (H.length === 2) {
        var e1 = G.arestas[H[0]], e2 = G.arestas[H[1]], dv = GrM.desvio(GrM.dirSaindo(e1, n), GrM.dirSaindo(e2, n));
        var d1 = E[H[0]] ? E[H[0]].declividade_pct : null, d2 = E[H[1]] ? E[H[1]].declividade_pct : null;
        if (dv > TOL_ANG) porque = "mudança de direção (5.7.3)";
        else if (d1 != null && d2 != null && Math.abs(d1 - d2) > TOL_DEC) porque = "mudança de declividade (5.7.3)";
      }
      if (!porque) return;
      precisa[n] = 1;
      var ids = es.map(function (x) { return G.arestas[x].trecho; }), N0 = G.nos[n], alvo = "nó " + ids.join("/");
      if (N0.peca && PECA_INSPECAO[N0.peca.peca]) { verif(alvo, "inspeção ou caixa de areia", 1, 1, "un", true, [porque + ": " + N0.peca.peca + " " + (N0.peca.id || "") + " no nó"], dm.ok ? dm.fonte : null); return; }
      verif(alvo, "inspeção ou caixa de areia", 0, 1, "un", false, [porque + ": nenhuma inspeção/caixa de areia modelada no nó (" + f2(N0.x) + "; " + f2(N0.y) + "; " + f2(N0.z) + ")"], dm.ok ? dm.fonte : null);
      aviso(out.avisos, "erro", "falta inspeção ou caixa de areia em " + porque + " — trechos " + ids.join(", "), ids,
            { texto: "inserir inspeção (aparente) ou caixa de areia (enterrada) no nó" + (N0.peca ? " — " + N0.peca.peca + " não é dispositivo de inspeção" : ""), acao: { tipo: "inserirFamilia", sistema: "pluvial", famId: FAMILIA_INSPECAO, ponto: { x: N0.x, y: N0.y, z: N0.z }, trechos: ids } });
    });
    if (!dm.ok) return;
    /* trechos retos entre pontos de inspeção: a soma do comprimento horizontal não passa de 20 m */
    var lim = num(dm.valor, null), visto = {};
    G.ordemA.filter(horiz).forEach(function (eid) {
      if (visto[eid]) return;
      var run = [], fila = [eid]; visto[eid] = 1;
      while (fila.length) {
        var x = fila.shift(); run.push(x); var e = G.arestas[x];
        [e.a, e.b].forEach(function (n) { if (precisa[n]) return; G.nos[n].arestas.filter(horiz).forEach(function (y) { if (!visto[y]) { visto[y] = 1; fila.push(y); } }); });
      }
      var L = run.reduce(function (s, x) { return s + G.arestas[x].comprimento; }, 0), ids = [];
      run.forEach(function (x) { if (ids.indexOf(G.arestas[x].trecho) < 0) ids.push(G.arestas[x].trecho); });
      if (L > lim) {
        verif(ids.join("/"), "inspeção a cada " + lim + " m em trecho reto", L, lim, "m", false, ["trecho reto de " + f2(L) + " m sem inspeção (máximo " + lim + " m)"], dm.fonte);
        aviso(out.avisos, "erro", "trecho reto de pluvial com " + f2(L) + " m sem inspeção/caixa de areia (máximo " + lim + " m)", ids,
              { texto: "inserir inspeção ou caixa de areia a cada " + lim + " m", acao: { tipo: "inserirFamilia", sistema: "pluvial", famId: FAMILIA_INSPECAO, trechos: ids, cada_m: lim } });
      }
    });
  }

  /* ------------------------------------------------ aproveitamento (NBR 15527) */
  function serie(v, n) { if (Array.isArray(v)) return v.map(function (x) { return num(x, null); }); var x = num(v, null); if (x == null) return null; var o = []; for (var i = 0; i < n; i++) o.push(x); return o; }
  function aproveitamento(cfg, ctx, out, verif, premissa) {
    var a = cfg.aproveitamento || {}, r = { passos: [], metodos: [], status: "pendente" };
    aviso(out.avisos, "aviso", "aproveitamento de água de chuva: os métodos e coeficientes foram lidos em fontes que citam a NBR 15527:2007 (a vigente é a 2019) — conferir na norma antes de assinar", [], { texto: "consultar a NBR 15527:2019 (convênio Confea)" });
    premissa("edição da NBR 15527 nos métodos do reservatório", "fontes citam a edição 2007; a vigente é 2019 (a conferir)");
    var A = num(a.area_m2, null);
    if (A == null) {
      var proj = out.areas.filter(function (x) { return x.projecao_m2 != null; });
      if (proj.length) { A = proj.reduce(function (s, x) { return s + x.projecao_m2; }, 0); premissa("área de captação do aproveitamento", f2(A) + " m² = soma das projeções horizontais das áreas de cobertura (casos a e b)"); }
    }
    if (A == null) { ctx.pendencia("entrada.pluvial.aproveitamento.area_m2", "área de captação não informada", "aproveitamento"); return r; }
    r.area_m2 = A;
    var dc = ctx.consulta("ch.descarte.mm", null, "valor", "aproveitamento — descarte");
    if (dc.ok) { r.descarte_L = num(dc.valor, 0) * A; r.passos.push("descarte do escoamento inicial = " + dc.valor + " mm × " + f2(A) + " m² = " + f2(r.descarte_L) + " L por chuva"); }
    var P = Array.isArray(a.precipitacaoMensal_mm) ? a.precipitacaoMensal_mm.map(function (x) { return num(x, null); }) : null;
    if (!P || !P.length || P.some(function (x) { return x == null; }) || !a.fontePrecipitacao) {
      ctx.pendencia("entrada.pluvial.aproveitamento.precipitacaoMensal_mm", "série de precipitação mensal (mm) com a FONTE (posto, INMET/ANA) não informada", "aproveitamento");
      r.passos.push("pendente: precipitação mensal com fonte"); return r;
    }
    r.fontePrecipitacao = a.fontePrecipitacao;
    var cC = NR().consulta("ch.metodo.coef", { metodo: "australiano", parametro: "C" }, "valor"), C = num(a.coeficienteEscoamento, null);
    if (C != null) premissa("coeficiente de escoamento (aproveitamento)", C + " — informado pelo projetista" + (a.fonteCoeficiente ? " (" + a.fonteCoeficiente + ")" : ""), "entrada");
    else if (cC.ok) { C = num(cC.valor, null); ctx.consulta("ch.metodo.coef", { metodo: "australiano", parametro: "C" }, "valor", "aproveitamento — coeficiente de escoamento"); premissa("coeficiente de escoamento (aproveitamento)", C + " — valor geral citado na descrição dos métodos (cobertura em geral); informe o da cobertura em entrada.pluvial.aproveitamento.coeficienteEscoamento"); }
    else { ctx.pendencia("entrada.pluvial.aproveitamento.coeficienteEscoamento", "coeficiente de escoamento sem dado", "aproveitamento"); return r; }
    var Pano = P.reduce(function (s, x) { return s + x; }, 0), nAnos = P.length / 12;   // hid:ok 12 meses por ano (calendário)
    var Pmedia = Pano / nAnos;
    var Vaprov = C * Pmedia * A; r.precipitacaoAnual_mm = Pmedia; r.volumeAproveitavelAnual_L = Vaprov;
    r.passos.push("P média anual = " + f2(Pmedia) + " mm (" + P.length + " meses, fonte: " + a.fontePrecipitacao + ")");
    r.passos.push("V aproveitável anual = C·P·A = " + f2(C) + " × " + f2(Pmedia) + " × " + f2(A) + " = " + f2(Vaprov) + " L (mm·m² = L)");
    if (num(a.eficiencia, null) != null) { r.volumeAproveitavelEta_L = Vaprov * num(a.eficiencia, 0); r.passos.push("× eficiência η = " + a.eficiencia + " (informada) = " + f2(r.volumeAproveitavelEta_L) + " L (equação atribuída à edição 2019)"); }
    aviso(out.avisos, "info", "série de precipitação com " + P.length + " meses: a fonte recomenda séries longas (de preferência diárias; ver o critério do método de Rippl na tabela) para Rippl e simulação", [], null);
    var D = serie(a.demandaMensal_L, P.length);
    function k(metodo, par) { var c = ctx.consulta("ch.metodo.coef", { metodo: metodo, parametro: par }, "valor", "aproveitamento — " + metodo); return c.ok ? num(c.valor, null) : null; }
    function met(nome, V, passos, st) { r.metodos.push({ metodo: nome, volume_L: V, passos: passos, status: st || (V == null ? "pendente" : "ok") }); }
    var kI = k("ingles", "k"); met("prático inglês", kI == null ? null : kI * Pmedia * A, kI == null ? ["pendente: coeficiente"] : ["V = " + kI + " · P · A = " + f2(kI * Pmedia * A) + " L"]);
    var kAN = k("azevedo_neto", "k"), Tsec = num(a.mesesSecos, null);
    if (Tsec == null) { ctx.pendencia("entrada.pluvial.aproveitamento.mesesSecos", "número de meses de pouca chuva (método Azevedo Neto) não informado", "aproveitamento"); met("Azevedo Neto", null, ["pendente: meses secos"]); }
    else met("Azevedo Neto", kAN == null ? null : kAN * Pmedia * A * Tsec, kAN == null ? ["pendente: coeficiente"] : ["V = " + kAN + " · P · A · T = " + kAN + " × " + f2(Pmedia) + " × " + f2(A) + " × " + Tsec + " = " + f2(kAN * Pmedia * A * Tsec) + " L"]);
    if (!D || D.some(function (x) { return x == null; })) {
      ctx.pendencia("entrada.pluvial.aproveitamento.demandaMensal_L", "demanda mensal de água não potável não informada (métodos alemão, Rippl, simulação, australiano)", "aproveitamento");
      ["prático alemão", "Rippl", "simulação", "prático australiano"].forEach(function (m) { met(m, null, ["pendente: demanda mensal"]); });
      r.status = "pendente"; return r;
    }
    var Dano = D.reduce(function (s, x) { return s + x; }, 0) / nAnos;
    var kAl = k("alemao", "k"); met("prático alemão", kAl == null ? null : kAl * Math.min(Vaprov, Dano), kAl == null ? ["pendente: coeficiente"] : ["V = " + kAl + " · min(V aproveitável " + f2(Vaprov) + "; demanda " + f2(Dano) + ") = " + f2(kAl * Math.min(Vaprov, Dano)) + " L"]);
    /* ⚠ revisão fase 2 A2 — Rippl como a fonte transcreve a NBR 15527 (TCC UFAL 2025, PDF p.29, citando a edição 2007):
       V = Σ S(t), só para S(t) > 0, SENDO QUE Σ D(t) < Σ Q(t). Demanda maior que a oferta → o método NÃO se aplica (antes
       somava os déficits e dava 143,6 m³ "ok" para uma chuva que cobre 40% da demanda). Série de vários anos: Rippl sobre os
       12 meses MÉDIOS (senão o Σ cresce com o número de anos), declarado. */
    var MES = 12;   // hid:ok meses do ano (calendário)
    var Pr = P, Dr = D;
    if (P.length !== MES) {
      if (P.length % MES) { Pr = null; }
      else { Pr = []; Dr = []; for (var mI = 0; mI < MES; mI++) { var sp = 0, sd = 0; for (var y = 0; y < nAnos; y++) { sp += P[y * MES + mI]; sd += D[y * MES + mI]; } Pr.push(sp / nAnos); Dr.push(sd / nAnos); }
             premissa("Rippl com série de vários anos", "aplicado aos 12 meses médios da série (" + nAnos + " anos)"); }
    }
    var Vr = null, pr = [], stR = null;
    if (!Pr) { pr.push("pendente: série de " + P.length + " meses não é de anos completos"); }
    else {
      var sQ = Pr.reduce(function (x, p) { return x + C * p * A; }, 0), sD = Dr.reduce(function (x, d) { return x + d; }, 0);
      pr.push("Σ D(t) = " + f2(sD) + " L; Σ Q(t) = Σ C·P(t)·A = " + f2(sQ) + " L");
      if (!(sD < sQ)) {
        stR = "nao_aplicavel";
        pr.push("Σ D(t) ≥ Σ Q(t): a chuva atende " + f2(sQ / sD * PCT) + "% da demanda — o método de Rippl não se aplica (condição Σ D(t) < Σ Q(t) da fonte)");
        aviso(out.avisos, "aviso", "aproveitamento: a chuva aproveitável (" + f2(sQ) + " L/ano) não cobre a demanda (" + f2(sD) + " L/ano) — Rippl não se aplica", [],
              { texto: "reduzir a demanda atendida pela água de chuva (ex.: só descargas ou rega) ou informar volumeAdotado_L para a simulação" });
      } else {
        Vr = 0; Pr.forEach(function (p, i) { var s0 = Dr[i] - C * p * A; if (s0 > 0) Vr += s0; });
        pr.push("Σ D(t) < Σ Q(t): S(t) = D(t) − C·P(t)·A; V = Σ S(t) positivos = " + f2(Vr) + " L");
      }
    }
    met("Rippl", Vr, pr, stR);
    r.volumeRippl_L = Vr;
    var Vad = num(a.volumeAdotado_L, null);
    if (Vad == null && Vr != null) { Vad = Vr; premissa("volume do reservatório de água de chuva verificado", f2(Vr) + " L (Rippl) — informe entrada.pluvial.aproveitamento.volumeAdotado_L para verificar outro"); }
    r.volumeAdotado_L = Vad;
    var cfS = k("simulacao", "confianca_min"), cA = k("australiano", "C"), iA = k("australiano", "I_mm"), cfA = k("australiano", "confianca_min");
    if (Vad == null) {
      ctx.pendencia("entrada.pluvial.aproveitamento.volumeAdotado_L", "sem volume para a simulação (Rippl não se aplica): informe o volume adotado do reservatório", "aproveitamento");
      met("simulação", null, ["pendente: volume do reservatório"]); met("prático australiano", null, ["pendente: volume do reservatório"]);
    } else {
      /* ⚠ A2 (decisão do RT): a simulação começa com o reservatório VAZIO (lado seguro; a fonte admite começar cheio, o que
         tornava a verificação tautológica com V = Σ déficits). Falha = mês em que a demanda não é atendida (Pr = Nr/N). */
      premissa("início da simulação do reservatório de chuva", "reservatório VAZIO no 1º mês (lado seguro; a fonte admite começar cheio)");
      var simula = function (Qm) {
        var S = 0, falhas = 0;
        Qm.forEach(function (q, i) { var disp = S + q; if (disp < D[i] - 1e-9) falhas++; S = Math.max(0, Math.min(Vad, disp - D[i])); });   // hid:ok tolerância
        return { falhas: falhas, confianca: 1 - falhas / Qm.length };
      };
      var sm = simula(P.map(function (p) { return C * p * A; }));
      met("simulação", Vad, ["V = " + f2(Vad) + " L, começando vazio; meses sem atender a demanda: " + sm.falhas + " de " + P.length + "; confiança = 1 − Nr/N = " + f3(sm.confianca)]);
      if (cfS != null) verif("reservatório de chuva", "confiança de atendimento (simulação)", sm.confianca, cfS, "", sm.confianca >= cfS, [f3(sm.confianca) + (sm.confianca >= cfS ? " ≥ " : " < ") + f2(cfS)], NR().fonte("ch.metodo.coef"), null, true);
      if (cA != null && iA != null) {
        var sa = simula(P.map(function (p) { return A * cA * Math.max(0, p - iA); }));
        met("prático australiano", Vad, ["Q = A·C·(P − I) com C = " + cA + ", I = " + iA + " mm, começando vazio; meses sem atender: " + sa.falhas + " de " + P.length + "; confiança = " + f3(sa.confianca)]);
        if (cfA != null) verif("reservatório de chuva", "confiança de atendimento (australiano)", sa.confianca, cfA, "", sa.confianca >= cfA, [f3(sa.confianca) + (sa.confianca >= cfA ? " ≥ " : " < ") + f2(cfA)], NR().fonte("ch.metodo.coef"), null, true);
      } else met("prático australiano", null, ["pendente: coeficientes"]);
    }
    var stv = out.verificacoes.filter(function (v) { return v.alvo === "reservatório de chuva"; }).map(function (v) { return v.status; });
    r.status = stv.indexOf("reprovado") >= 0 ? "reprovado" : (r.metodos.some(function (m) { return m.status === "pendente"; }) ? "pendente" : "ok");
    return r;
  }

  var HidAP = { VERSAO: 1, CASOS: CASOS, calcular: calcular, manning: manning, manningSemicircular: manningSemicircular, manningRetangular: manningRetangular };
  global.HidAP = HidAP;
  if (typeof module !== "undefined" && module.exports) module.exports = HidAP;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
