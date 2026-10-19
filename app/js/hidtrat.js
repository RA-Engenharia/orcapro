/* =====================================================================
 * hidtrat.js — TRATAMENTO DE ESGOTO DE PEQUENO PORTE (motor PURO, ES5,
 * Node-testável). Fase 4 do plano docs/hidro/PLANO-HIDROSSANITARIO.md.
 * Contrato: docs/hidro/CONTRATO-TRATAMENTO.md.
 *
 * Pedido do Rogério (17/10/2026): "tanques parametrizados que vão estar
 * configurados de acordo com a quantidade que chega de volume" — zero
 * configuração. Daqui sai: contribuição de esgoto e de lodo pela ocupação ×
 * população, tanque séptico (volume útil, profundidade, dimensões), filtro
 * anaeróbio, sumidouro OU vala pela taxa de infiltração do ENSAIO, os
 * afastamentos mínimos, e a escolha do produto Fortlev quando ele atende
 * (senão, tanque moldado no local). As UNIDADES saem no formato que o
 * js/hidtanques.js transforma em família paramétrica e em ops do modelo.
 *
 * ⚠ NENHUM valor de norma aqui (tools/test-hid-sem-numero-magico.js): tudo
 *   vem de tr.* (dados-fonte/hidro/normas/tratamento.json → HidNormas).
 *   Boa parte das tabelas está em TEXTO ("1,20 a 2,20", "até 1500", "2:1 a
 *   4:1"): os números são LIDOS do texto da fonte por numerosBR()/faixa() —
 *   nunca reescritos no código.
 * ⚠ CADA VALOR LEVA A EDIÇÃO DE ORIGEM. A 17076:2024 substituiu a 7229/13969
 *   (canceladas em 04/2024), mas a base só tem da 17076 a Tabela 1 e duas
 *   células confirmadas por TCC; o resto é da 7229/13969 via UFPR. O memorial
 *   tem de mostrar isso em cada número (edicaoDe), nunca "NBR 17076" genérico.
 * ⚠ FALTOU → PENDENTE COM A CHAVE, nunca valor silencioso: sem ensaio de
 *   infiltração não há sumidouro; sem intervalo de limpeza e temperatura do
 *   mês mais frio não há K (nem volume); temperatura média ≥ 15 °C não tem T
 *   do filtro na base (só com a decisão do RT "lado seguro", registrada).
 * ⚠ Pendência nunca vira "ok" (CONTRATO §1.2-8): ok = nenhuma reprovada E
 *   nenhuma pendência. Toda pendência/aviso traz o "corrigir".
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function N() { return dep("HidNormas", "./hidnormas.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v !== null && v !== undefined && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function teto2(x) { return Math.ceil(x * 100 - 1e-7) / 100; }               /* hid:ok arredondamento construtivo para cima (cm), tolerância de ponto flutuante (a mesma das fórmulas do hidtanques) */
  function r2(x) { return Math.round(x * 100) / 100; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  var C3 = 3;   /* hid:ok casas decimais de volume/área na formatação */
  function fmt(v, casas) {
    if (v == null || !isFinite(v)) return "—";
    var c = casas == null ? 2 : casas, m = Math.pow(10, c);   /* hid:ok base decimal da formatação */
    return String(Math.round(v * m) / m).replace(".", ",");
  }
  function semAcento(s) { return txt(s).toLowerCase().normalize ? txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s).toLowerCase(); }

  /* hid:fisica-inicio — conversões de unidade do SI e geometria do círculo (não são valores de norma) */
  var S_POR_DIA = 86400, H_POR_DIA = 24, MIN_POR_H = 60, S_POR_H = 3600, CM_POR_M = 100;
  function areaCirculo(d) { return Math.PI * d * d / 4; }
  function diametroDaArea(a) { return Math.sqrt(4 * a / Math.PI); }
  /* sumidouro cilíndrico (fundo + lateral): A = π·D²/4 + π·D·H → menor D para H = Hmax */
  function diametroSumidouro(A, Hmax) { var a = Math.PI / 4, b = Math.PI * Hmax; return (-b + Math.sqrt(b * b + 4 * a * A)) / (2 * a); }
  function alturaSumidouro(A, D) { return (A - Math.PI * D * D / 4) / (Math.PI * D); }
  /* hid:fisica-fim */

  /* ---------------------------------------------------------------- TEXTO → NÚMERO
   * As tabelas da F1 guardam faixas como texto ("1,20 a 2,20", "até 1500",
   * "10.000", ">= 8 h"). Número BR: vírgula = decimal; ponto seguido de
   * grupos de 3 dígitos = milhar. Devolve os números NA ORDEM do texto. */
  function numeroBR(tok) {
    var t = txt(tok);
    if (t.indexOf(",") >= 0) return parseFloat(t.replace(/\./g, "").replace(",", "."));
    if (/^\d+(\.\d\d\d)+$/.test(t)) return parseFloat(t.replace(/\./g, ""));
    return parseFloat(t);
  }
  function numerosBR(s) {
    var out = [], re = /\d+(?:[.,]\d+)*/g, m, t = txt(s);
    while ((m = re.exec(t))) { var v = numeroBR(m[0]); if (isFinite(v)) out.push(v); }
    return out;
  }
  /* faixa de um texto: { min, max, incMin, incMax } ou null. "até X" → (−∞, X];
     "acima de/mais de X" → (X, ∞); "abaixo de/menor que X" → (−∞, X); "X a Y" → [X, Y];
     ">= X", "<= X", "< X", "> X", "X < T < Y" */
  function faixa(s) {
    var t = semAcento(s), m, n = "(\\d+(?:[.,]\\d+)*)";
    if ((m = new RegExp(n + "\\s*<\\s*[a-z]+\\s*<\\s*" + n).exec(t))) return { min: numeroBR(m[1]), max: numeroBR(m[2]), incMin: false, incMax: false };
    if ((m = new RegExp("(?:^|[^a-z])ate\\s+" + n).exec(t))) return { min: -Infinity, max: numeroBR(m[1]), incMin: false, incMax: true };
    if ((m = new RegExp("(?:acima de|mais de|maior que|superior a)\\s+" + n).exec(t))) return { min: numeroBR(m[1]), max: Infinity, incMin: false, incMax: false };
    if ((m = new RegExp("(?:abaixo de|menor que|inferior a)\\s+" + n).exec(t))) return { min: -Infinity, max: numeroBR(m[1]), incMin: false, incMax: false };
    if ((m = new RegExp(">=\\s*" + n).exec(t))) return { min: numeroBR(m[1]), max: Infinity, incMin: true, incMax: false };
    if ((m = new RegExp("<=\\s*" + n).exec(t))) return { min: -Infinity, max: numeroBR(m[1]), incMin: false, incMax: true };
    if ((m = new RegExp(">\\s*" + n).exec(t))) return { min: numeroBR(m[1]), max: Infinity, incMin: false, incMax: false };
    if ((m = new RegExp("<\\s*" + n).exec(t))) return { min: -Infinity, max: numeroBR(m[1]), incMin: false, incMax: false };
    if ((m = new RegExp(n + "\\s*(?:a|-)\\s*" + n).exec(t))) return { min: numeroBR(m[1]), max: numeroBR(m[2]), incMin: true, incMax: true };
    return null;
  }
  function naFaixa(f, v) {
    if (!f || v == null) return false;
    var okMin = f.incMin ? v >= f.min : v > f.min, okMax = f.incMax ? v <= f.max : v < f.max;
    return okMin && okMax;
  }
  /* valor numérico de uma célula (número ou o PRIMEIRO número do texto) */
  function celula(v) { if (typeof v === "number") return v; var ns = numerosBR(v); return ns.length ? ns[0] : null; }

  /* ---------------------------------------------------------------- EDIÇÃO DE ORIGEM */
  var TXT_ANTIGA = "NBR 7229:1993 / 13969:1997 (canceladas em 04/2024) — conferir contra a NBR 17076:2024";
  function edicaoDe(ctx, chave, criterio, linha) {
    if (linha && linha.edicao_de_origem) return txt(linha.edicao_de_origem);
    var H = N(), conf = H.tabela("tr.confirmacoes_17076");
    if (conf && criterio != null) {
      for (var i = 0; i < conf.linhas.length; i++) {
        var c = conf.linhas[i];
        if (c.chave === chave && txt(c.criterio) === txt(criterio)) { if (ctx) ctx.consulta("tr.confirmacoes_17076", { chave: chave }, "edicao", "edição de origem"); return txt(c.edicao); }
      }
    }
    var t = H.tabela(chave), doc = t && t.fonte ? txt(t.fonte.doc) : "";
    if (new RegExp("7229|13969").test(doc) && /cancelada/i.test(doc)) return TXT_ANTIGA;
    /* a norma e a edição escritas no TÍTULO da tabela ("Reator UASB (NBR 12209:2011): …") — nunca a edição
       do ARQUIVO, que junta três normas ("17076:2024 …; 12209:2011; 12216:1992") */
    var mN = /NBR\s*\d+:\d+/.exec(txt(t && t.titulo));
    if (mN) return mN[0] + (t.fonte && t.fonte.tipo === "primaria" ? " (texto da norma" + (t.fonte.tabela ? ", " + t.fonte.tabela : "") + (t.fonte.exemplarLicenciado === false ? "; sem exemplar licenciado" : "") + ")" : " (via fonte secundária)");
    return t ? txt(t.edicao) : "";
  }

  /* ---------------------------------------------------------------- RESULTADO */
  /* ⚠ revisão da junção J6 (17/10/2026): o orquestrador passa o contexto do cálculo INTEIRO (incêndio, AF, AQ…).
     Usar ctx.pendencias() dele fazia o tratamento herdar "falta entrada.incendio.rede" e nunca ficar ok. O motor
     trabalha num contexto PRÓPRIO que repassa tudo ao de fora (o resultado geral continua vendo as pendências) e o
     resultado do tratamento lê só as suas. */
  function ctxProprio(fora) {
    var meu = N().contexto();
    if (!fora || fora === meu) return meu;
    return { fixture: meu.fixture || !!fora.fixture,
      consulta: function (chave, filtro, coluna, usadoEm) { fora.consulta(chave, filtro, coluna, usadoEm); return meu.consulta(chave, filtro, coluna, usadoEm); },
      linhas: function (chave, filtro, usadoEm) { fora.linhas(chave, filtro, usadoEm); return meu.linhas(chave, filtro, usadoEm); },
      pendencia: function (chave, motivo, usadoEm) { fora.pendencia(chave, motivo, usadoEm); meu.pendencia(chave, motivo, usadoEm); },
      normas: meu.normas, pendencias: meu.pendencias, temPendencia: meu.temPendencia };
  }
  function novoRes(sistema, ctxFora) {
    var ctx = ctxProprio(ctxFora);
    var R = { sistema: sistema, ctx: ctx, verificacoes: [], avisos: [], premissas: [], parametros: [], nV: 0, nA: 0 };
    R.fonteDe = function (chave, linha) {
      var f = N().fonte(chave);
      if (!f) return null;
      var o = { chave: f.chave, norma: f.norma, edicao: f.edicao, doc: f.doc, pagina: f.pagina, tabela: f.tabela, tipo: f.tipo };
      if (linha && linha.fonte && typeof linha.fonte === "string") o.linha = linha.fonte;
      return o;
    };
    /* valor de norma usado: nome, valor, unidade, edição de origem e fonte (memorial) */
    R.param = function (nome, valor, unidade, chave, edicao, linha) {
      var p = { nome: nome, valor: valor, unidade: unidade, edicao: edicao, fonte: chave ? R.fonteDe(chave, linha) : null };
      R.parametros.push(p); return p;
    };
    R.verif = function (alvo, nome, valor, limite, unidade, ok, passos, chave, edicao, sentido) {
      var eta = null;
      if (ok !== null && valor != null && limite != null && limite !== 0) eta = sentido === "min" ? r3(limite / valor) : r3(valor / limite);
      var v = { id: sistema + "-v" + (++R.nV), sistema: sistema, alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unidade || "", eta: eta,
                ok: ok, status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), passos: arr(passos), edicao: edicao || "", fonte: chave ? R.fonteDe(chave) : null };
      R.verificacoes.push(v); return v;
    };
    R.verifEscopo = function (nome, valor, limite, unidade, dentro, passos, chave, edicao) {
      var v = R.verif("escopo", nome, valor, limite, unidade, dentro ? true : null, passos, chave, edicao);
      if (!dentro) { v.status = "nao_aplicavel"; v.ok = null; v.passos = v.passos.concat(["fora do escopo da NBR 17076: não se aplica (ETE pela NBR 12209)"]); }
      return v;
    };
    R.aviso = function (gravidade, texto, elementos, corrigir) {
      var a = { id: sistema + "-a" + (++R.nA), sistema: sistema, gravidade: gravidade, texto: texto, elementos: arr(elementos), corrigir: corrigir || null };
      R.avisos.push(a); return a;
    };
    R.premissa = function (item, valor, origem, fonte) { R.premissas.push({ item: item, valor: valor, origem: origem, fonte: fonte || null }); };
    /* pendência que não é de tabela: entra no contexto (agrupada por chave) e vira aviso com "corrigir" */
    R.pend = function (chave, motivo, usadoEm, corrigir) {
      ctx.pendencia(chave, motivo, usadoEm);
      R.aviso("aviso", "pendente (" + usadoEm + "): " + motivo, [], { texto: corrigir || ("informar " + chave) });
    };
    R.fechar = function (corpo) {
      var H = N(), pend = ctx.pendencias(), reprov = R.verificacoes.filter(function (v) { return v.status === "reprovado"; }).length;
      var pendV = R.verificacoes.filter(function (v) { return v.status === "pendente"; }).length;
      var erros = R.avisos.filter(function (a) { return a.gravidade === "erro"; }).length;
      var out = { versao: 1, sistema: sistema, ok: !reprov && !pendV && !erros && !pend.length, fixture: ctx.fixture || (H && H.ehFixture()) || false,
                  normas: ctx.normas(), premissas: R.premissas, parametros: R.parametros, verificacoes: R.verificacoes, avisos: R.avisos, pendencias: pend,
                  resumo: { verificacoes: R.verificacoes.length, reprovadas: reprov, pendentes: pendV + pend.length } };
      if (out.fixture) out.avisos.unshift({ id: sistema + "-fixture", sistema: sistema, gravidade: "erro", texto: "TABELAS DE TESTE — NÃO É NORMA", elementos: [], corrigir: null });
      out.fonteAviso = "NBR 17076:2024 conferida no TEXTO (17/10/2026) — a RA ainda precisa do exemplar licenciado. A 12209:2011 e a 12216:1992 seguem de fonte SECUNDÁRIA. " +
                       "Valores da 7229/13969 que não constam da 17076 estão marcados por número.";
      out.status = reprov || erros ? "reprovado" : (out.ok ? "ok" : "pendente");
      /* fora do escopo da 17076: o sistema NÃO SE APLICA (nem ok, nem reprovado) e leva a ação de trocar para ETE */
      if (R.foraEscopo) {
        out.status = "nao_aplicavel"; out.ok = false; out.foraEscopo = R.foraEscopo;
        out.acoes = R.avisos.filter(function (x) { return x.corrigir && x.corrigir.acao; }).map(function (x) { return x.corrigir.acao; });
      }
      Object.keys(corpo || {}).forEach(function (k) { out[k] = corpo[k]; });
      /* ⚠ revisão J9: a linha da unidade (memorial, planilha, "Aplicar tanques") herda o PIOR status das verificações
         cujo alvo é ela — o tanque saía "OK" com o volume do produto pendente */
      arr(out.unidades).forEach(function (u) {
        var al = arr(u.alvos).length ? u.alvos : [u.id], vs = R.verificacoes.filter(function (v) { return al.indexOf(v.alvo) >= 0; });
        var st = u.status || (u.dims ? "ok" : "pendente");
        if (vs.some(function (v) { return v.status === "reprovado"; })) st = "reprovado";
        else if (st === "ok" && vs.some(function (v) { return v.status === "pendente"; })) st = "pendente";
        u.status = st; u.verificacoes = vs.map(function (v) { return v.id; });
      });
      return out;
    };
    return R;
  }

  /* linhas de uma tabela de texto, achadas pela coluna "item" (regex) */
  function linhaItem(ctx, chave, re, usadoEm) {
    var ls = ctx.linhas(chave, null, usadoEm);
    if (!ls) return null;
    for (var i = 0; i < ls.length; i++) if (re.test(semAcento(ls[i].item || ls[i].parametro || ls[i].unidade || ""))) return ls[i];
    ctx.pendencia(chave + "[" + re.source + "]", "linha não encontrada na tabela " + chave, usadoEm);
    return null;
  }

  /* ---------------------------------------------------------------- CONTRIBUIÇÃO
   * uso do programa (HidPrograma) → linha da Tabela 1 da 17076. Só nomes; o
   * número vem da tabela. Uso sem linha inequívoca (hotel tem 3 linhas, escola
   * tem 3) → o RT informa entrada.ocupacao com o texto da linha. */
  var OCUPACAO_DO_USO = {
    residencial_unifamiliar: "residência padrão {padrao}", residencial_multifamiliar: "residência padrão {padrao}", residencial: "residência padrão {padrao}",
    escritorio: "escritório", comercial: "edifício público ou comercial", publico: "edifício público ou comercial", industria: "fábrica em geral",
    creche: "creche", restaurante: "restaurante e similares", ambulatorio: "ambulatório", alojamento: "alojamento provisório", rural: "área rural",
    quartel: "quartel", presidio: "presídio", asilo: "orfanato - asilo", bar: "bar"
  };
  var PADROES = { alto: "alto", medio: "médio", "médio": "médio", baixo: "baixo" };

  function populacao(e, ctx, R) {
    if (num(e.populacao, null) != null) { R.premissa("população", Math.ceil(num(e.populacao, 0)), "entrada"); return { valor: Math.ceil(num(e.populacao, 0)), origem: "entrada", passos: ["população informada: " + Math.ceil(num(e.populacao, 0))] }; }
    var HP = dep("HidPrograma", "./hidprograma.js");
    if (e.programa && HP) {
      /* contexto PRÓPRIO: a reservação e os aparelhos mínimos do programa não são deste cálculo */
      var c2 = N().contexto(), pr = HP.calcular(e.programa, c2);
      if (pr.populacao && pr.populacao.valor != null) {
        R.premissa("população", pr.populacao.valor, pr.populacao.origem === "entrada" ? "entrada" : "norma", pr.populacao.fonte);
        if (pr.populacao.fonte) ctx.consulta(pr.populacao.fonte.chave, { uso: e.programa.uso }, "valor", "população");
        return { valor: pr.populacao.valor, origem: "programa", passos: arr(pr.populacao.passos) };
      }
    }
    R.pend("entrada.populacao", "população não informada nem calculável pelo programa de necessidades", "contribuição de esgoto", "informar entrada.populacao ou o programa (uso + porte)");
    return null;
  }

  function contribuicao(e, ctx, R) {
    var out = { N: null, unidadeN: "", ocupacao: null, q: null, Lf: null, Qd_L: null, classe: "", passos: [], edicao: "", status: "pendente" };
    var oc = txt(e.ocupacao);
    if (!oc) {
      var uso = e.programa && e.programa.uso ? e.programa.uso : e.uso, modelo = OCUPACAO_DO_USO[uso];
      if (!modelo) { R.pend("entrada.ocupacao", "uso \"" + txt(uso) + "\" sem linha inequívoca na Tabela 1 da 17076", "contribuição de esgoto", "informar entrada.ocupacao com o texto da linha (ex.: \"hotel com cozinha e lavanderia, exceto banheira\")"); return out; }
      if (modelo.indexOf("{padrao}") >= 0) {
        var p = PADROES[semAcento(e.padrao)] || PADROES[txt(e.padrao)];
        if (!p) {
          /* ⚠ decisão de engenharia (lado seguro, registrada): sem o padrão, o ALTO — maior contribuição, maior volume */
          p = "alto";
          R.premissa("padrão da residência", "alto (não informado — adotada a maior contribuição, lado seguro)", "padrao_motor");
          R.aviso("aviso", "padrão da residência não informado: adotado \"alto\" (maior contribuição — lado seguro)", [], { texto: "informar entrada.padrao (\"alto\", \"medio\" ou \"baixo\") para não superdimensionar" });
        }
        modelo = modelo.replace("{padrao}", p);
      }
      oc = modelo;
    }
    out.ocupacao = oc;
    var cq = ctx.consulta("tr.contribuicao_17076", { ocupacao: oc }, "q_l_unidade_dia", "contribuição de esgoto");
    var cl = ctx.consulta("tr.contribuicao_17076", { ocupacao: oc }, "lf_l_unidade_dia", "contribuição de lodo fresco");
    if (!cq.ok || !cl.ok) return out;
    out.q = num(cq.valor, null); out.Lf = num(cl.valor, null); out.classe = cq.linha.classe; out.unidadeN = cq.linha.unidade;
    out.edicao = edicaoDe(ctx, "tr.contribuicao_17076", null, null);
    R.param("q — contribuição de esgoto (" + oc + ")", out.q, "L/" + out.unidadeN + ".dia", "tr.contribuicao_17076", out.edicao);
    R.param("Lf — contribuição de lodo fresco (" + oc + ")", out.Lf, "L/" + out.unidadeN + ".dia", "tr.contribuicao_17076", out.edicao);
    if (out.unidadeN === "pessoa") {
      var pop = populacao(e, ctx, R);
      if (!pop) return out;
      out.N = pop.valor; out.passos = out.passos.concat(pop.passos);
    } else {
      out.N = num(e.unidades, null);
      if (out.N == null) { R.pend("entrada.unidades", "a contribuição de \"" + oc + "\" é por " + out.unidadeN + " — informar quantos", "contribuição de esgoto", "informar entrada.unidades (" + out.unidadeN + ")"); return out; }
      R.premissa("N (" + out.unidadeN + ")", out.N, "entrada");
    }
    out.Qd_L = out.N * out.q;
    out.status = "ok";
    out.passos.push("Q = N × q = " + out.N + " × " + fmt(out.q) + " = " + fmt(out.Qd_L, 0) + " L/dia (" + out.edicao + ")");
    return out;
  }

  /* ESCOPO da 17076 (seção 1 e 4.4.2): vazão do SISTEMA até 12 000 L/dia e carga orgânica até 3,80 kg DBO/dia.
     ⚠ Decisão do gerente (17/10/2026): com o texto da norma, o "limite de blog" virou o ESCOPO normativo. Acima dele a
       17076 não se aplica (o caminho é a ETE, NBR 12209): verificação REPROVADA com o "corrigir". Os tanques ainda são
       divididos (A.2: "dividir a contribuição e aplicar a equação a cada tanque") para o RT ver o porte; só passa se o RT
       declarar sistemas independentes (opcoes.sistemasIndependentes — um sistema por edificação/lote). */
  function escopo(e, con, ctx, R) {
    var E0 = "tr.escopo_17076", lQ = linhaItem(ctx, E0, /^vazao maxima do sistema/, "escopo da 17076"), lC = linhaItem(ctx, E0, /^carga organica maxima/, "escopo da 17076"), lD = linhaItem(ctx, E0, /^dbo per capita/, "escopo da 17076");
    var forc = num(e.opcoes && e.opcoes.linhas, null), indep = !!(e.opcoes && e.opcoes.sistemasIndependentes);
    var lim = lQ ? faixa(lQ.valor).max : null, n = 1;
    if (forc != null && forc >= 1) { n = Math.ceil(forc); R.premissa("tanques em paralelo", n + " (entrada)", "entrada"); }
    else if (lim > 0 && con.Qd_L > lim) n = Math.ceil(con.Qd_L / lim);
    if (n > 1) R.premissa("tanques em paralelo", n + " — contribuição dividida, parcela fixa de 1.000 L em cada tanque (A.2)" + (indep ? "; sistemas independentes declarados pelo RT" : ""), indep ? "entrada" : "norma", R.fonteDe("tr.tanque_septico_formula_e_dimensoes"));
    if (indep) R.premissa("sistemas independentes", n + " sistemas (um por edificação/lote) — declaração do RT", "entrada");
    var nSis = indep ? n : 1, Qs = con.Qd_L / nSis, carga = null, cmax = null, foraQ = false, foraC = false;
    /* ⚠ decisão do gerente (17/10/2026): acima do escopo NÃO é "reprovado" — é FORA DO ESCOPO da 17076: o sistema sai
       "nao_aplicavel" com a ação de trocar para ETE (HidETE, 12209) com a mesma população. */
    if (lim > 0) {
      foraQ = Qs > lim;
      R.verifEscopo("vazão do sistema dentro do escopo da NBR 17076", r2(Qs), lim, "L/dia", !foraQ, ["Q = " + fmt(Qs, 0) + " L/dia por sistema" + (nSis > 1 ? " (" + nSis + " sistemas independentes)" : "") + "; escopo até " + fmt(lim, 0) + " L/dia"], E0, edicaoDe(ctx, E0, null, lQ));
    }
    if (lC && lD) {
      cmax = faixa(lC.valor).max;
      /* DBO per capita: do RT (entrada.dbo_g_hab_dia) ou o valor da norma para batelada (G.2.1), como PREMISSA declarada */
      var dboE = num(e.dbo_g_hab_dia, null), dbo = dboE != null ? dboE : celula(lD.valor);
      if (dboE != null) R.premissa("DBO per capita", dbo + " g DBO/hab.dia (informada pelo RT)", "entrada");
      else R.premissa("DBO per capita", dbo + " g DBO/hab.dia — valor da norma para batelada (17076 G.2.1), usado para estimar a carga orgânica do escopo; informável pelo RT (entrada.dbo_g_hab_dia)", "norma", R.fonteDe(E0));
      if (con.unidadeN === "pessoa") {
        carga = con.N / nSis * dbo / 1000; foraC = carga > cmax + 1e-9;   /* hid:ok tolerância */
        R.verifEscopo("carga orgânica do sistema dentro do escopo da NBR 17076", r2(carga), cmax, "kg DBO/dia", !foraC,
                ["carga = N × DBO = " + fmt(con.N / nSis, 1) + " × " + fmt(dbo, 0) + " g / 1000 = " + fmt(carga, 2) + " kg DBO/dia; escopo até " + fmt(cmax) + " kg DBO/dia"], E0, edicaoDe(ctx, E0, null, lC));
      } else R.verif("escopo", "carga orgânica do sistema dentro do escopo da NBR 17076", null, cmax, "kg DBO/dia", null, ["ocupação por " + con.unidadeN + ": sem DBO por unidade na norma — informar a carga do projeto"], E0, edicaoDe(ctx, E0, null, lC));
    }
    if (foraQ || foraC) {
      R.foraEscopo = { Q_L: con.Qd_L, carga_kg: carga };
      R.aviso("aviso", "fora do escopo da NBR 17076 (Q = " + fmt(con.Qd_L, 0) + " L/d; DBO = " + (carga == null ? "—" : fmt(carga * nSis, 2)) + " kg/d) — dimensionar como ETE pela NBR 12209", ["tanque"],
              { texto: "trocar o tipo para ETE (mesma população), ou declarar sistemas independentes por edificação/lote (opcoes.sistemasIndependentes)",
                acao: { tipo: "trocarTipo", para: "ete", entrada: { tipo: "ete", populacao: con.unidadeN === "pessoa" ? con.N : null, padrao: e.padrao, ocupacao: con.ocupacao, dbo_g_hab_dia: e.dbo_g_hab_dia } } });
    }
    return n;
  }

  /* ---------------------------------------------------------------- TANQUE SÉPTICO */
  function tanque(e, con, nLin, ctx, R) {
    var T0 = "tr.tanque_septico_formula_e_dimensoes", out = { status: "pendente", passos: [], V_L: null, N: null, Q_L: null, T_d: null, K_d: null, forma: null, dims: null, linhas: nLin };
    if (con.status !== "ok") return out;
    var Nl = con.N / nLin, Ql = con.Qd_L / nLin;
    out.N = Nl; out.Q_L = Ql;
    /* T pelo Q de UMA linha (a primeira faixa cujo máximo cobre Q) */
    var ts = ctx.linhas("tr.periodo_detencao_tanque", null, "período de detenção");
    if (ts) {
      for (var i = 0; i < ts.length; i++) {
        var f = faixa(ts[i].contribuicao_diaria_l);
        if (f && Ql <= f.max) {                    /* faixas em ordem crescente: a primeira cujo máximo cobre Q */
          out.T_d = num(ts[i].detencao_dias, null);
          out.T_ed = edicaoDe(ctx, "tr.periodo_detencao_tanque", ts[i].contribuicao_diaria_l, null);
          R.param("T — período de detenção (Q = " + fmt(Ql, 0) + " L/dia, faixa \"" + ts[i].contribuicao_diaria_l + "\")", out.T_d, "dia", "tr.periodo_detencao_tanque", out.T_ed);
          break;
        }
      }
      if (out.T_d == null) ctx.pendencia("tr.periodo_detencao_tanque[" + fmt(Ql, 0) + "]", "nenhuma faixa de contribuição cobre " + fmt(Ql, 0) + " L/dia", "tanque séptico");
    }
    /* K por intervalo de limpeza × temperatura do mês mais frio — os DOIS são entrada */
    var anos = num(e.limpeza_anos, null), tFrio = num(e.clima && e.clima.tMesFrio_C, null);
    if (anos == null) R.pend("entrada.limpeza_anos", "intervalo entre limpezas não informado — sem ele não há taxa de acumulação de lodo K", "tanque séptico", "informar entrada.limpeza_anos (1 a 5 anos, conforme o plano de manutenção)");
    if (tFrio == null) R.pend("entrada.clima.tMesFrio_C", "temperatura média do mês mais frio não informada — sem ela não há K", "tanque séptico", "informar entrada.clima.tMesFrio_C (°C) do local da obra");
    if (anos != null && tFrio != null) {
      var ks = ctx.linhas("tr.taxa_acumulacao_lodo_K", null, "taxa de acumulação de lodo");
      var tab = N().tabela("tr.taxa_acumulacao_lodo_K");
      if (ks && tab) {
        var anosT = Math.ceil(anos - 1e-9), linhaK = null;                /* hid:ok tolerância de ponto flutuante */
        if (anosT !== anos) R.premissa("intervalo de limpeza", anos + " anos → linha de " + anosT + " anos (o maior, K maior — lado seguro)", "padrao_motor");
        ks.forEach(function (l) { if (num(l.intervalo_limpeza_anos, null) === anosT) linhaK = l; });
        var colK = null;
        tab.colunas.forEach(function (c) {
          if (colK || !/^t_/.test(c)) return;
          var ns = numerosBR(c), fx;
          if (/_ate_/.test(c)) fx = { min: -Infinity, max: ns[0], incMin: false, incMax: true };
          else if (/_acima_/.test(c)) fx = { min: ns[0], max: Infinity, incMin: false, incMax: false };
          else fx = { min: ns[0], max: ns[1], incMin: false, incMax: true };
          if (naFaixa(fx, tFrio)) colK = c;
        });
        if (!linhaK) ctx.pendencia("tr.taxa_acumulacao_lodo_K[" + anosT + " anos]", "intervalo de limpeza de " + anos + " anos fora da tabela", "tanque séptico");
        else if (!colK) ctx.pendencia("tr.taxa_acumulacao_lodo_K[" + tFrio + " °C]", "temperatura fora das colunas da tabela", "tanque séptico");
        else {
          out.K_d = num(linhaK[colK], null);
          out.K_ed = edicaoDe(ctx, "tr.taxa_acumulacao_lodo_K", anosT + "|" + colK, null);
          R.param("K — acumulação de lodo (limpeza " + anosT + " ano(s), mês mais frio " + fmt(tFrio, 1) + " °C → coluna " + colK + ")", out.K_d, "dia", "tr.taxa_acumulacao_lodo_K", out.K_ed);
        }
      }
    }
    var lFixa = linhaItem(ctx, T0, /parcela fixa/, "tanque séptico");
    var vFixa = lFixa ? celula(lFixa.valor) : null;
    if (vFixa != null) R.param("parcela fixa do volume (por tanque)", vFixa, "L", T0, edicaoDe(ctx, T0, null, lFixa));
    if (out.T_d == null || out.K_d == null || vFixa == null) { out.passos.push("volume pendente (falta T, K ou a parcela fixa)"); return out; }
    out.V_L = vFixa + Nl * (con.q * out.T_d + out.K_d * con.Lf);
    out.passos.push("V = " + fmt(vFixa, 0) + " + N·(q·T + K·Lf) = " + fmt(vFixa, 0) + " + " + fmt(Nl, 2) + " × (" + fmt(con.q) + " × " + fmt(out.T_d) + " + " + fmt(out.K_d, 0) + " × " + fmt(con.Lf) + ") = " + fmt(out.V_L, 0) + " L" +
                    (nLin > 1 ? " (por tanque; " + nLin + " tanques)" : ""));
    /* profundidade útil pela faixa de volume */
    var ls = ctx.linhas(T0, null, "profundidade útil") || [], Vm3 = out.V_L / 1000, prof = null;
    ls.forEach(function (l) {
      if (prof || !/profundidade util - volume/.test(semAcento(l.item))) return;
      var fv = faixa(txt(l.item).replace(/^[^-]*-\s*volume\s*/i, ""));
      if (fv && Vm3 <= fv.max) { var fp = faixa(l.valor); if (fp) prof = { min: fp.min, max: fp.max, linha: l }; }
    });
    if (!prof) { ctx.pendencia(T0 + "[profundidade " + fmt(Vm3) + " m3]", "nenhuma faixa de profundidade útil para " + fmt(Vm3) + " m³", "tanque séptico"); out.passos.push("dimensões pendentes"); return out; }
    out.hMin = prof.min; out.hMax = prof.max; out.hEd = edicaoDe(ctx, T0, null, prof.linha);
    R.param("profundidade útil (V = " + fmt(Vm3) + " m³)", fmt(prof.min) + " a " + fmt(prof.max), "m", T0, edicaoDe(ctx, T0, null, prof.linha));
    var lDes = linhaItem(ctx, T0, /desnivel entre a tubulacao/, "tanque séptico"), lGuia = linhaItem(ctx, T0, /tubo-guia/, "tanque séptico");
    out.desnivel_m = lDes ? celula(lDes.valor) : null;
    if (lDes) R.param("desnível entrada → saída", out.desnivel_m, "m", T0, edicaoDe(ctx, T0, null, lDes));
    if (lGuia) {
      /* 17076 A.5: "tubo-guia 0,15 m (…); tampa 0,60 m" — medidas em METROS (a transcrição antiga dava DN 150 / 60 cm) */
      var gg = semAcento(lGuia.valor), mG = /tubo-guia\s*(\d+(?:[.,]\d+)?)\s*m\b/.exec(gg), mT = /tampa\s*(\d+(?:[.,]\d+)?)\s*m\b/.exec(gg);
      out.dnTuboGuia = mG ? numeroBR(mG[1]) * 1000 : null; out.tampa_m = mT ? numeroBR(mT[1]) : null;
      R.param("tubo-guia de limpeza / tampa de inspeção", txt(lGuia.valor), "-", T0, edicaoDe(ctx, T0, null, lGuia));
    }
    var lLaje = linhaItem(ctx, T0, /^nivel de agua ate a laje/, "tanque séptico");
    if (lLaje) { out.folgaLaje_m = celula(lLaje.valor); R.param("nível de água → laje de cobertura (mínimo)", out.folgaLaje_m, "m", T0, edicaoDe(ctx, T0, null, lLaje)); }
    out.status = "ok";
    return out;
  }

  /* geometria do tanque moldado: prismático (padrão) ou cilíndrico */
  function geometriaTanque(tq, forma, ctx, R, alvo) {
    var T0 = "tr.tanque_septico_formula_e_dimensoes", g = { forma: forma, status: "pendente" };
    if (tq.status !== "ok") return g;
    var V = tq.V_L / 1000, h = tq.hMin;
    if (forma === "cilindrica") {
      var lD = linhaItem(ctx, T0, /cilindrico: diametro interno minimo/, alvo);
      if (!lD) return g;
      var Dmin = celula(lD.valor), D = teto2(Math.max(Dmin, diametroDaArea(V / h)));
      /* D ≤ 2·H (mesma linha da tabela): se passar, sobe a profundidade até D = 2H */
      if (D > 2 * h) {
        h = teto2(Math.pow(V / Math.PI, 1 / 3));   /* hid:ok raiz cúbica (V = π·h³ quando D = 2h) */
        D = teto2(Math.max(Dmin, diametroDaArea(V / h))); }
      g.diametro_m = D; g.profundidade_m = h; g.diametroMin_m = Dmin; g.volumeReal_m3 = r3(areaCirculo(D) * h);
      g.passos = ["D = máx(" + fmt(Dmin) + "; √(4·V/(π·h))) = " + fmt(D) + " m com h = " + fmt(h) + " m → V real = " + fmt(g.volumeReal_m3, C3) + " m³"];
      R.verif(alvo, "diâmetro interno mínimo", D, Dmin, "m", D >= Dmin - 1e-9, g.passos, T0, edicaoDe(ctx, T0, null, lD), "min");     /* hid:ok tolerância */
      R.verif(alvo, "D ≤ 2·H", D, 2 * h, "m", D <= 2 * h + 1e-9, ["D = " + fmt(D) + " m; 2·H = " + fmt(2 * h) + " m"], T0, edicaoDe(ctx, T0, null, lD));   /* hid:ok tolerância */
    } else {
      var lW = linhaItem(ctx, T0, /prismatico: largura interna minima/, alvo), lR = linhaItem(ctx, T0, /prismatico: relacao comprimento/, alvo);
      if (!lW || !lR) return g;
      var Wmin = celula(lW.valor), rr = numerosBR(lR.valor), rMin = rr[0] / rr[1], rMax = rr[2] / rr[3];   /* hid:ok índices do texto "a:b a c:d" */
      var A = V / h, W = teto2(Math.max(Wmin, Math.sqrt(A / rMin))), L = teto2(Math.max(rMin * W, A / W));
      g.largura_m = W; g.comprimento_m = L; g.profundidade_m = h; g.larguraMin_m = Wmin; g.relacao = rMin; g.relacaoMax = rMax; g.volumeReal_m3 = r3(L * W * h);
      g.passos = ["h = " + fmt(h) + " m (mínimo da faixa); A = V/h = " + fmt(A, C3) + " m²; W = máx(" + fmt(Wmin) + "; √(A/" + fmt(rMin) + ")) = " + fmt(W) + " m; L = máx(" + fmt(rMin) + "·W; A/W) = " + fmt(L) + " m → V real = " + fmt(g.volumeReal_m3, C3) + " m³"];
      R.verif(alvo, "largura interna mínima", W, Wmin, "m", W >= Wmin - 1e-9, g.passos, T0, edicaoDe(ctx, T0, null, lW), "min");       /* hid:ok tolerância */
      var rel = L / W;
      R.verif(alvo, "relação comprimento/largura", r2(rel), rMax, "-", rel >= rMin - 1e-6 && rel <= rMax + 1e-6, ["L/W = " + fmt(L) + "/" + fmt(W) + " = " + fmt(rel) + " (faixa " + txt(lR.valor) + ")"], T0, edicaoDe(ctx, T0, null, lR));   /* hid:ok tolerância */
    }
    R.verif(alvo, "volume útil do tanque ≥ V calculado", g.volumeReal_m3, r3(V), "m³", g.volumeReal_m3 >= V - 1e-6, tq.passos.concat(g.passos), T0, edicaoDe(ctx, T0, null, null), "min");   /* hid:ok tolerância */
    R.verif(alvo, "profundidade útil na faixa", h, tq.hMax, "m", h >= tq.hMin - 1e-9 && h <= tq.hMax + 1e-9, ["h = " + fmt(h) + " m; faixa " + fmt(tq.hMin) + " a " + fmt(tq.hMax) + " m"], T0, tq.hEd);   /* hid:ok tolerância */
    g.status = "ok";
    return g;
  }

  /* ---------------------------------------------------------------- PRODUTO (Fortlev)
   * Critério de "atende" = a vazão diária DECLARADA pelo fabricante ≥ Q da linha
   * (o catálogo não traz o volume útil: a conferência do volume pela 17076 fica
   * PENDENTE e o tanque moldado sai como alternativa calculada). */
  function produtos(tipo) {
    var Cat = dep("HidCatalogo", "./hidcatalogo.js");
    if (!Cat) return [];
    var porVazao = {};
    Cat.porTipo(tipo).forEach(function (it) {
      var q = num(it.dados && it.dados.vazao_L_dia, null); if (q == null) return;
      var d = it.dim || {}, k = String(q), p = porVazao[k] || { vazao_L_dia: q, itens: [] };
      p.itens.push(it);
      /* cotas com NOME na legenda (mm) valem mais que letras (A–F) do manual */
      if (d.diametro_corpo_mm != null && p.diametro_m == null) {
        p.diametro_m = d.diametro_corpo_mm / 1000; p.altura_m = num(d.altura_total_mm, 0) / 1000;
        p.entrada_m = num(d.altura_tubo_entrada_mm != null ? d.altura_tubo_entrada_mm : d.altura_painel_entrada_mm, 0) / 1000;
        p.saida_m = num(d.altura_tubo_saida_efluente_mm != null ? d.altura_tubo_saida_efluente_mm : d.altura_painel_saida_efluente_mm, 0) / 1000;
        p.tampa_m = num(d.diametro_tampa_mm, 0) / 1000;
        p.item = it;
      }
      arr(it.conectores).forEach(function (c) { if (num(c.dn_mm, null) != null) p.dn = c.dn_mm; });
      porVazao[k] = p;
    });
    return Object.keys(porVazao).map(function (k) { return porVazao[k]; }).filter(function (p) { return p.item; }).sort(function (a, b) { return a.vazao_L_dia - b.vazao_L_dia; });
  }
  function escolherProduto(e, tq, nLin, ctx, R) {
    if (e.opcoes && e.opcoes.moldado) { R.premissa("tanque séptico", "moldado no local (escolha da entrada)", "entrada"); return null; }
    if (tq.status !== "ok" || nLin > 1) return null;
    /* ⚠ revisão J9 (suspeita confirmada): a "fossa 1.500 L/dia" (Ø 1,23, saída a 1,66 m) guarda no máximo
       π·0,615²·1,66 ≈ 1,97 m³ abaixo da geratriz da saída — menos que os 2,17 m³ de 6 pessoas. O produto só atende se a
       VAZÃO declarada E o volume estimado até a saída (cotas EXTERNAS: limite superior, a conferir) cobrirem o V da norma. */
    var lista = produtos("fossa_septica"), esc = null, V = tq.V_L / 1000, recusados = [];
    for (var i = 0; i < lista.length; i++) {
      var Vs = lista[i].diametro_m && lista[i].saida_m ? areaCirculo(lista[i].diametro_m) * lista[i].saida_m : null;
      if (lista[i].vazao_L_dia < tq.Q_L) continue;
      if (Vs == null || Vs < V) { recusados.push(fmt(lista[i].vazao_L_dia, 0) + " L/dia (até a saída ≈ " + (Vs == null ? "sem cotas" : fmt(Vs, C3) + " m³") + ")"); continue; }
      esc = lista[i]; esc.volumeAteSaida_m3 = Vs; break;
    }
    if (!esc) {
      if (lista.length) R.aviso("info", "nenhum tanque séptico pré-fabricado do catálogo atende Q = " + fmt(tq.Q_L, 0) + " L/dia e V = " + fmt(V, C3) + " m³" +
        (recusados.length ? " (volume até a saída insuficiente: " + recusados.join("; ") + ")" : "") + " — tanque moldado no local", ["tanque"], null);
      return null;
    }
    var it = esc.item, Cat = dep("HidCatalogo", "./hidcatalogo.js"), f = Cat ? Cat.fonte(it) : null;
    var p = { fabricante: it.fabricante, codigo: it.codigo, descricao: it.descricao, vazao_L_dia: esc.vazao_L_dia, volumeAteSaida_m3: r3(esc.volumeAteSaida_m3), diametro_m: esc.diametro_m, altura_m: esc.altura_m, entrada_m: esc.entrada_m, saida_m: esc.saida_m,
              tampa_m: esc.tampa_m, dn: esc.dn || null, fonte: f ? f.texto : "", atende: txt(it.dados && it.dados.atende) };
    R.verif("tanque", "vazão declarada pelo fabricante ≥ contribuição", esc.vazao_L_dia, r2(tq.Q_L), "L/dia", esc.vazao_L_dia >= tq.Q_L,
            ["Q = " + fmt(tq.Q_L, 0) + " L/dia ≤ " + fmt(esc.vazao_L_dia, 0) + " L/dia (" + p.descricao + "; " + p.fonte + ")"], null, "catálogo do fabricante", "min");
    /* ⚠ não é "ok" de graça: o catálogo não dá o volume útil — sem ele não há como comparar com o V da norma */
    R.verif("tanque", "volume útil do produto ≥ V da norma", r3(esc.volumeAteSaida_m3), r3(tq.V_L / 1000), "m³", null,
            ["V calculado = " + fmt(tq.V_L, 0) + " L; volume até a geratriz da saída pelas cotas EXTERNAS do catálogo ≈ π·" + fmt(esc.diametro_m) + "²/4·" + fmt(esc.saida_m) + " = " + fmt(esc.volumeAteSaida_m3, C3) + " m³ (limite superior) — A CONFERIR: pedir ao fabricante o volume útil e a declaração de conformidade com a 17076"], null, "catálogo do fabricante");
    R.aviso("aviso", "produto " + p.descricao + " escolhido pela vazão diária declarada; volume útil não informado no catálogo (V da norma = " + fmt(tq.V_L, 0) + " L)", ["tanque"],
            { texto: "pedir ao fabricante o volume útil, ou usar o tanque moldado calculado (opcoes.moldado = true)" });
    return p;
  }

  /* ---------------------------------------------------------------- FILTRO ANAERÓBIO (17076 Anexo D)
   * ⚠ 17076 D.2.3: a altura ÚTIL (≥ 1,20 m) JÁ INCLUI o fundo falso (≤ 0,60 m, com a laje). A 13969 tratava 1,20 m
   *   como altura do leito com o fundo falso à parte — a família desenhava 1,80 m úteis. Vu = A × altura útil.
   * ⚠ T pela Tabela D.1: vazão do filtro × temperatura média do MÊS MAIS FRIO (o TCC dizia "temperatura média"). */
  function colunaTemperatura(colunas, t) {
    var achou = null;
    colunas.forEach(function (c) {
      if (achou || !/^t_/.test(c)) return;
      var ns = numerosBR(c), fx;
      if (/_abaixo_/.test(c)) fx = { min: -Infinity, max: ns[0], incMin: false, incMax: false };
      else if (/_acima_/.test(c)) fx = { min: ns[0], max: Infinity, incMin: false, incMax: false };
      else if (/_ate_/.test(c)) fx = { min: -Infinity, max: ns[0], incMin: false, incMax: true };
      else fx = { min: ns[0], max: ns[1], incMin: true, incMax: true };
      if (naFaixa(fx, t)) achou = c;
    });
    return achou;
  }
  function filtro(e, con, tq, nLin, ctx, R) {
    var F0 = "tr.filtro_anaerobio", FT = "tr.filtro_anaerobio_tdh", out = { status: "pendente", passos: [], linhas: nLin };
    if (e.opcoes && e.opcoes.semFiltro) {
      var lP = linhaItem(ctx, "tr.sumidouro_regras", /^efluente para infiltracao/, "filtro anaeróbio");
      R.verif("filtro", "tratamento complementar após o tanque séptico", 0, 1, "un", false, ["sem filtro (opcoes.semFiltro): o efluente infiltrado tem de atender " + (lP ? txt(lP.valor) : "K.2") + " — o tanque séptico sozinho não é declarado suficiente"], "tr.sumidouro_regras", lP ? edicaoDe(ctx, "tr.sumidouro_regras", null, lP) : "", "min");
      return out;
    }
    if (con.status !== "ok") return out;
    var Nl = con.N / nLin, Ql = con.Qd_L / nLin;
    var lIv = linhaItem(ctx, F0, /^volume util vu/, "filtro anaeróbio"), lMin = linhaItem(ctx, F0, /^volume minimo do filtro/, "filtro anaeróbio");
    var lH = linhaItem(ctx, F0, /^altura util minima/, "filtro anaeróbio"), lFF = linhaItem(ctx, F0, /^altura do fundo falso/, "filtro anaeróbio"), lDU = linhaItem(ctx, F0, /^area do fundo por descida/, "filtro anaeróbio");
    if (!lIv || !lMin || !lH) return out;
    var Iv = celula(lIv.valor), Vmin = celula(lMin.valor), hU = celula(lH.valor), hFF = lFF ? celula(lFF.valor) : 0;
    R.param("Iv — taxa de compensação do meio suporte (na indefinição)", Iv, "-", F0, edicaoDe(ctx, F0, null, lIv));
    R.param("volume mínimo do filtro", Vmin, "L", F0, edicaoDe(ctx, F0, null, lMin));
    R.param("altura útil mínima (fundo falso + meio suporte)", hU, "m", F0, edicaoDe(ctx, F0, null, lH));
    if (lFF) R.param("altura do fundo falso (máxima, dentro da altura útil)", hFF, "m", F0, edicaoDe(ctx, F0, null, lFF));
    var tab = N().tabela(FT), ls = ctx.linhas(FT, null, "TDH do filtro anaeróbio"), tFrio = num(e.clima && e.clima.tMesFrio_C, null), ladoSeguro = !!(e.opcoes && e.opcoes.filtroTLadoSeguro);
    if (!tab || !ls) return out;
    var linha = null;
    for (var i = 0; i < ls.length; i++) { var f = faixa(ls[i].vazao_l_dia); if (f && Ql <= f.max) { linha = ls[i]; break; } }
    if (!linha) { ctx.pendencia(FT + "[" + fmt(Ql, 0) + " L/dia]", "vazão do filtro acima da Tabela D.1", "filtro anaeróbio"); return out; }
    var col = tFrio != null ? colunaTemperatura(tab.colunas, tFrio) : null, T;
    if (col) T = num(linha[col], null);
    else if (ladoSeguro) {
      col = tab.colunas.filter(function (c) { return /_abaixo_/.test(c); })[0]; T = num(linha[col], null);
      R.premissa("T do filtro", fmt(T) + " d — coluna mais fria da Tabela D.1 (temperatura do mês mais frio não informada): decisão do RT pelo LADO SEGURO", "entrada", R.fonteDe(FT));
    } else {
      R.pend("entrada.clima.tMesFrio_C", "temperatura média do mês mais frio não informada — sem ela não há T do filtro (Tabela D.1)", "filtro anaeróbio", "informar entrada.clima.tMesFrio_C, ou o RT aceita a coluna mais fria (opcoes.filtroTLadoSeguro)");
      out.passos.push("volume do filtro pendente (T)");
      return out;
    }
    R.param("T do filtro (Q = " + fmt(Ql, 0) + " L/dia, faixa \"" + linha.vazao_l_dia + "\", coluna " + col + ")", T, "dia", FT, edicaoDe(ctx, FT, null, null));
    var Vc = Iv * Nl * con.q * T, Vu = Math.max(Vc, Vmin);
    out.V_L = Vu; out.Vcalc_L = Vc; out.T_d = T; out.hUtil_m = hU; out.fundoFalso_m = hFF; out.Iv = Iv; out.Vmin_L = Vmin;
    out.passos.push("Vu = Iv·N·q·T = " + fmt(Iv) + " × " + fmt(Nl, 2) + " × " + fmt(con.q) + " × " + fmt(T) + " = " + fmt(Vc, 1) + " L" + (Vc < Vmin ? " < mínimo " + fmt(Vmin, 0) + " L → Vu = " + fmt(Vmin, 0) + " L" : ""));
    var A = Vu / 1000 / hU, W = teto2(Math.sqrt(A)), L = teto2(Math.max(W, A / W));
    out.forma = "retangular"; out.largura_m = W; out.comprimento_m = L; out.area_m2 = r3(L * W); out.volumeReal_m3 = r3(L * W * hU);
    out.passos.push("A = Vu / altura útil = " + fmt(Vu / 1000, C3) + " / " + fmt(hU) + " = " + fmt(A, C3) + " m² → " + fmt(L) + " × " + fmt(W) + " m (planta quadrada: padrão do motor); fundo falso de " + fmt(hFF) + " m DENTRO da altura útil");
    R.premissa("planta do filtro", "quadrada (geometria, não norma) — o RT pode trocar a relação", "padrao_motor");
    R.verif("filtro", "volume útil ≥ Vu", out.volumeReal_m3, r3(Vu / 1000), "m³", out.volumeReal_m3 >= Vu / 1000 - 1e-6, out.passos.slice(), F0, edicaoDe(ctx, F0, null, lIv), "min");   /* hid:ok tolerância */
    if (lDU) {
      var aDU = celula(lDU.valor);
      out.descidas = Math.floor(out.area_m2 / aDU) + 1; out.descidaUnica = out.descidas === 1;
      out.passos.push("área " + fmt(out.area_m2) + " m² → " + out.descidas + " descida(s) de distribuição (cada uma com menos de " + fmt(aDU) + " m² de fundo — " + edicaoDe(ctx, F0, null, lDU) + ")");
    }
    out.status = "ok";
    return out;
  }

  /* ---------------------------------------------------------------- TAXA DE APLICAÇÃO (17076 Anexo N)
   * ensaio de percolação (min/m) → Tabela N.1 → taxa máxima de aplicação (m³/m².dia).
   * ⚠ A Tabela N.1 imprime "1,12" em 120 min/m (incoerente: 0,14 → ? → 0,10). O JSON guarda 0,12 e a coluna
   *   "impresso"; quando a linha usada diverge do impresso, o resultado AVISA da errata suspeita.
   * ⚠ Entre colunas: a norma não interpola — adota-se a coluna de percolação imediatamente MAIOR (menor taxa,
   *   lado seguro), declarado. Acima da última coluna: não há taxa → reprovado com o "corrigir". */
  function percolacao(e, ctx, R, tipo) {
    var inf = e.infiltracao || {}, P0 = "tr.percolacao_ensaio", K = null, passos = [];
    if (arr(inf.camadas).length && tipo === "sumidouro") {
      var sKH = 0, sH = 0;
      inf.camadas.forEach(function (c) { var k = num(c.K_min_m, null), h = num(c.H_m, null); if (k != null && h != null) { sKH += k * h; sH += h; } });
      if (sH > 0) { K = sKH / sH; passos.push("Kmédia = Σ(Ki·Hi)/ΣHi = " + fmt(sKH) + " / " + fmt(sH) + " = " + fmt(K, 1) + " min/m (" + edicaoDe(ctx, P0, null, linhaItem(ctx, P0, /^sumidouro: taxa media/, "percolação")) + ")"); }
    }
    if (K == null && arr(inf.ensaios).length) {
      var ks = inf.ensaios.map(function (x) { var t = num(x.intervalo_min, null), d = num(x.rebaixamento_m, null); return t != null && d > 0 ? t / d : null; }).filter(function (x) { return x != null; });
      if (ks.length) {
        K = ks.reduce(function (a, b) { return a + b; }, 0) / ks.length;
        var lE = linhaItem(ctx, P0, /^taxa de percolacao/, "percolação"), lP = linhaItem(ctx, P0, /^pontos de ensaio/, "percolação"), nMin = lP ? celula(lP.valor) : null;
        passos.push("taxa de percolação = intervalo / rebaixamento: " + inf.ensaios.map(function (x) { return fmt(num(x.intervalo_min, 0)) + "/" + fmt(num(x.rebaixamento_m, 0), C3); }).join("; ") + " → média " + fmt(K, 1) + " min/m (" + (lE ? edicaoDe(ctx, P0, null, lE) : "") + ")");
        if (nMin != null) R.verif("disposicao", "pontos de ensaio de percolação", ks.length, nMin, "un", ks.length >= nMin, [ks.length + " ensaio(s); mínimo " + fmt(nMin, 0)], P0, edicaoDe(ctx, P0, null, lP), "min");
      }
    }
    if (K == null && num(inf.percolacao_min_m, null) != null) { K = num(inf.percolacao_min_m, null); passos.push("taxa de percolação informada: " + fmt(K, 1) + " min/m"); }
    if (K != null) R.premissa("taxa de percolação (ensaio)", fmt(K, 1) + " min/m", "entrada");
    return { K: K, passos: passos };
  }
  function taxaAplicacao(e, ctx, R, tipo) {
    var inf = e.infiltracao || {}, out = { taxa: null, K: null, passos: [] };
    if (num(inf.taxaAplicacao_m3_m2_dia, null) != null) {
      out.taxa = num(inf.taxaAplicacao_m3_m2_dia, null);
      R.premissa("taxa máxima de aplicação", out.taxa + " m³/m².dia (informada pelo RT)", "entrada");
      out.passos.push("taxa de aplicação informada: " + fmt(out.taxa, C3) + " m³/m².dia");
      return out;
    }
    var pc = percolacao(e, ctx, R, tipo);
    out.K = pc.K; out.passos = pc.passos;
    if (pc.K == null && num(inf.coeficiente_L_m2_dia, null) != null) {
      /* compatibilidade com a tela antiga: coeficiente de infiltração da 7229 (L/m².dia) lido como taxa de aplicação */
      out.taxa = num(inf.coeficiente_L_m2_dia, null) / 1000;
      R.premissa("taxa de aplicação", fmt(out.taxa, C3) + " m³/m².dia (coeficiente de infiltração informado, conceito da 7229/13969)", "entrada");
      R.aviso("aviso", "coeficiente de infiltração (7229/13969) usado como taxa de aplicação: a NBR 17076:2024 dimensiona pelo ENSAIO DE PERCOLAÇÃO (Anexo N) e pela Tabela N.1", ["disposicao"],
              { texto: "informar entrada.infiltracao.ensaios [{intervalo_min, rebaixamento_m}] (mínimo 3 pontos) ou percolacao_min_m" });
      out.passos.push("taxa = coeficiente informado / 1000 = " + fmt(out.taxa, C3) + " m³/m².dia");
      return out;
    }
    if (pc.K == null) return out;
    var N1 = "tr.percolacao_N1", ls = ctx.linhas(N1, null, "taxa máxima de aplicação");
    if (!ls) return out;
    ls = ls.slice().sort(function (a, b) { return num(a.percolacao_min_m, 0) - num(b.percolacao_min_m, 0); });
    var esc = null;
    for (var i = 0; i < ls.length; i++) if (pc.K <= num(ls[i].percolacao_min_m, 0) + 1e-9) { esc = ls[i]; break; }   /* hid:ok tolerância */
    var ed = edicaoDe(ctx, N1, null, null);
    if (!esc) {
      R.verif("disposicao", "taxa de percolação dentro da Tabela N.1", r2(pc.K), num(ls[ls.length - 1].percolacao_min_m, 0), "min/m", false, out.passos.concat(["acima da última coluna da Tabela N.1: não há taxa de aplicação"]), N1, ed);
      R.aviso("erro", "solo com percolação de " + fmt(pc.K, 0) + " min/m: acima da Tabela N.1 — sumidouro e vala não se aplicam", ["disposicao"], { texto: "outra disposição (wetland, tanque de evapotranspiração — Anexos H e M), ou ligação à rede; o RT define" });
      return out;
    }
    out.taxa = num(esc.taxa_m3_m2_dia, null);
    if (num(esc.percolacao_min_m, 0) !== pc.K && i > 0) R.premissa("Tabela N.1 entre colunas", "percolação " + fmt(pc.K, 1) + " min/m → coluna de " + fmt(num(esc.percolacao_min_m, 0), 0) + " min/m (a imediatamente maior: menor taxa, lado seguro; a norma não define interpolação)", "padrao_motor");
    out.passos.push("Tabela N.1: percolação " + fmt(pc.K, 1) + " min/m → coluna " + (i === 0 ? "\"" + fmt(num(esc.percolacao_min_m, 0), 0) + " ou menos\"" : fmt(num(esc.percolacao_min_m, 0), 0) + " min/m") + " → taxa máxima " + fmt(out.taxa, C3) + " m³/m².dia (" + ed + ")");
    R.param("taxa máxima de aplicação (Tabela N.1, " + fmt(num(esc.percolacao_min_m, 0), 0) + " min/m)", out.taxa, "m³/m².dia", N1, ed);
    if (esc.impresso && numeroBR(esc.impresso) !== out.taxa) {
      R.aviso("aviso", "ERRATA SUSPEITA da NBR 17076:2024, Tabela N.1: a coluna de " + fmt(num(esc.percolacao_min_m, 0), 0) + " min/m está impressa \"" + esc.impresso + "\" (incoerente com a sequência decrescente); usado " + fmt(out.taxa, C3) + " m³/m².dia",
              ["disposicao"], { texto: "confirmar com a errata da ABNT; até lá vale o valor coerente com a tabela (o impresso daria área ~9 vezes menor)" });
    }
    return out;
  }

  /* ---------------------------------------------------------------- SUMIDOURO / VALA (17076 Anexos K e L) */
  function disposicao(e, con, ctx, R) {
    var out = { status: "pendente", tipo: null, passos: [] };
    if (con.status !== "ok") return out;
    var tipo = e.opcoes && e.opcoes.disposicao === "vala" ? "vala" : "sumidouro";
    if (e.opcoes && e.opcoes.disposicao) R.premissa("disposição final", tipo + " (escolha da entrada)", "entrada");
    else R.premissa("disposição final", "sumidouro (padrão; vala de infiltração por opcoes.disposicao)", "padrao_motor");
    var tx = taxaAplicacao(e, ctx, R, tipo);
    out.passos = out.passos.concat(tx.passos); out.K = tx.K;
    if (tx.taxa == null) {
      if (tx.K == null && !R.avisos.some(function (a) { return a.gravidade === "erro" && a.texto.indexOf("acima da Tabela N") >= 0; })) {
        R.pend("entrada.infiltracao.ensaios", "sem o ENSAIO DE PERCOLAÇÃO no local (17076 Anexo N) não há taxa de aplicação: sumidouro e vala não podem ser dimensionados",
               "disposição final", "fazer o ensaio de percolação (mínimo 3 pontos, Anexo N) e informar entrada.infiltracao.ensaios [{intervalo_min, rebaixamento_m}] ou percolacao_min_m");
        R.verif("disposicao", "área de infiltração (sumidouro/vala)", null, null, "m²", null, ["pendente: falta o ensaio de percolação"], null, "");
      }
      return out;
    }
    out.tipo = tipo; out.taxa = tx.taxa;
    var Q = con.Qd_L / 1000, A = Q / tx.taxa;
    out.passos.push("A = Q / taxa = " + fmt(Q, C3) + " m³/dia / " + fmt(tx.taxa, C3) + " = " + fmt(A, 2) + " m²");
    return tipo === "sumidouro" ? sumidouro(e, out, A, ctx, R) : vala(e, out, A, ctx, R);
  }
  function sumidouro(e, out, A, ctx, R) {
    var S0 = "tr.sumidouro_regras";
    var lD = linhaItem(ctx, S0, /^diametro interno minimo/, "sumidouro"), lH = linhaItem(ctx, S0, /^profundidade maxima/, "sumidouro"), lN = linhaItem(ctx, S0, /^numero de unidades/, "sumidouro");
    var lE = linhaItem(ctx, S0, /^distancia entre paredes/, "sumidouro"), lS = linhaItem(ctx, S0, /^distancia ao sistema de tratamento/, "sumidouro");
    var lL = linhaItem(ctx, S0, /^distancia minima do fundo ao nivel/, "sumidouro"), lAr = linhaItem(ctx, S0, /^taxa de percolacao media de regiao nao arenosa/, "sumidouro"), lCf = linhaItem(ctx, S0, /^camada filtrante/, "sumidouro");
    if (!lD || !lH || !lN) return out;
    var Dmin = celula(lD.valor), Hmax = celula(lH.valor), nn = numerosBR(lN.valor), n = nn[0], frac = nn[1] / 100;
    R.param("diâmetro interno mínimo do sumidouro", Dmin, "m", S0, edicaoDe(ctx, S0, null, lD));
    R.param("profundidade máxima do sumidouro", Hmax, "m", S0, edicaoDe(ctx, S0, null, lH));
    R.param("unidades em uso alternado", txt(lN.valor), "-", S0, edicaoDe(ctx, S0, null, lN));
    var Aun = A * frac, D = teto2(Math.max(Dmin, diametroSumidouro(Aun, Hmax))), H = teto2(alturaSumidouro(Aun, D));
    out.n = n; out.areaUnidade_m2 = r2(Aun); out.diametro_m = D; out.profundidadeUtil_m = H;
    out.espacamento_m = lE ? celula(lE.valor) : null;
    if (lS) { var ns = numerosBR(lS.valor); out.distanciaSistema_m = Math.max(ns[0] * D, ns[1]); }
    out.passos.push(n + " sumidouros a " + fmt(frac * 100, 0) + "% (uso alternado — " + edicaoDe(ctx, S0, null, lN) + "): A por unidade = " + fmt(Aun, 2) + " m² (fundo + lateral abaixo da entrada)");
    out.passos.push("A = π·D²/4 + π·D·H, com H ≤ " + fmt(Hmax) + " m → D = " + fmt(D) + " m; H = (A − π·D²/4)/(π·D) = " + fmt(H) + " m");
    if (out.espacamento_m != null) out.passos.push("entre paredes dos sumidouros ≥ " + fmt(out.espacamento_m) + " m; do sistema de tratamento ≥ " + txt(lS && lS.valor) + " m = " + fmt(out.distanciaSistema_m) + " m (" + edicaoDe(ctx, S0, null, lE) + ")");
    R.verif("sumidouro", "profundidade útil ≤ máxima", H, Hmax, "m", H <= Hmax + 1e-9, out.passos.slice(), S0, edicaoDe(ctx, S0, null, lH));   /* hid:ok tolerância */
    R.verif("sumidouro", "diâmetro interno mínimo", D, Dmin, "m", D >= Dmin - 1e-9, ["D = " + fmt(D) + " m"], S0, edicaoDe(ctx, S0, null, lD), "min");   /* hid:ok tolerância */
    /* região arenosa (percolação abaixo do limite): camada filtrante envolvente exigida */
    if (out.K != null && lAr && lCf && out.K < celula(lAr.valor)) {
      R.verif("sumidouro", "camada filtrante envolvente (região arenosa)", null, celula(lCf.valor), "m", null, ["percolação " + fmt(out.K, 0) + " min/m < " + fmt(celula(lAr.valor), 0) + " min/m: envolver o sumidouro com ≥ " + fmt(celula(lCf.valor)) + " m de solo com percolação > " + fmt(celula(lAr.valor), 0) + " min/m (" + edicaoDe(ctx, S0, null, lCf) + ")"], S0, edicaoDe(ctx, S0, null, lCf));
      R.aviso("aviso", "região arenosa: camada filtrante envolvente de " + fmt(celula(lCf.valor)) + " m em volta do sumidouro (17076 K.3.2)", ["sumidouro-1", "sumidouro-2"], { texto: "detalhar a camada filtrante no projeto e confirmar (opcoes.camadaFiltrante = true)" });
    }
    lencol(e, out, H, lL, S0, ctx, R, "sumidouro");
    out.status = "ok";
    return out;
  }
  function vala(e, out, A, ctx, R) {
    var V0 = "tr.vala_regras";
    var lN = linhaItem(ctx, V0, /^numero de valas em uso alternado/, "vala"), lW = linhaItem(ctx, V0, /^largura minima/, "vala"), lC = linhaItem(ctx, V0, /^comprimento maximo/, "vala");
    var lEsp = linhaItem(ctx, V0, /^distancia entre eixos/, "vala"), lL = linhaItem(ctx, V0, /^distancia minima do fundo ao lencol/, "vala");
    if (!lN || !lC) return out;
    var nn = numerosBR(lN.valor), n = nn[0], frac = nn[1] / 100, Cmax = celula(lC.valor), W = null, modulo = null;
    var mods = produtosVala();
    if (mods && !(e.opcoes && e.opcoes.moldado)) { W = mods.largura_m; modulo = mods; }
    else if (lW) { W = celula(lW.valor); R.premissa("largura da vala", fmt(W) + " m — " + txt(lW.edicao_de_origem), "padrao_motor", R.fonteDe(V0)); }
    if (W == null) { R.pend(V0 + "[largura]", "largura da vala não definida (a 17076 não fixa)", "vala", "informar a largura útil"); return out; }
    /* laterais desprezadas: a 17076 conta laterais + fundo abaixo do tubo, mas não fixa a profundidade abaixo dele (lado seguro) */
    R.premissa("área de infiltração da vala", "só o fundo (as laterais abaixo do tubo, que a 17076 também conta, ficam a favor da segurança)", "padrao_motor");
    var Aset = A * frac, C = Aset / W, nv = Math.ceil(C / Cmax - 1e-9), Cv = teto2(C / nv);   /* hid:ok tolerância */
    out.n = n; out.valasPorConjunto = nv; out.largura_m = W; out.comprimentoVala_m = Cv; out.espacamento_m = lEsp ? celula(lEsp.valor) : null;
    out.passos.push(n + " conjuntos em uso alternado a " + fmt(frac * 100, 0) + "% (" + edicaoDe(ctx, V0, null, lN) + "): C = " + fmt(Aset, 2) + " / " + fmt(W) + " = " + fmt(C, 2) + " m → " + nv + " vala(s) de " + fmt(Cv) + " m por conjunto (máximo " + fmt(Cmax) + " m cada); eixos a ≥ " + fmt(out.espacamento_m) + " m");
    if (modulo) {
      out.modulo = modulo; out.modulosPorVala = Math.ceil(Cv / modulo.comprimento_m - 1e-9);   /* hid:ok tolerância */
      out.passos.push("módulo " + modulo.descricao + " (" + fmt(modulo.largura_m) + " × " + fmt(modulo.comprimento_m) + " m): " + out.modulosPorVala + " módulos por vala (" + modulo.fonte + ")");
    }
    R.verif("vala", "comprimento de cada vala ≤ máximo", Cv, Cmax, "m", Cv <= Cmax + 1e-9, out.passos.slice(), V0, edicaoDe(ctx, V0, null, lC));   /* hid:ok tolerância */
    lencol(e, out, 0, lL, V0, ctx, R, "vala");
    out.status = "ok";
    return out;
  }
  function produtosVala() {
    var Cat = dep("HidCatalogo", "./hidcatalogo.js");
    if (!Cat) return null;
    var its = Cat.porTipo("vala_infiltracao").concat(Cat.porTipo("vala_de_infiltracao")), m = null;
    its.forEach(function (it) {
      var d = it.dim || {}; if (m || d.largura_total_mm == null) return;
      m = { descricao: it.descricao, codigo: it.codigo, largura_m: d.largura_total_mm / 1000, comprimento_m: num(d.comprimento_total_mm, 0) / 1000, altura_m: num(d.altura_total_mm, 0) / 1000, fonte: Cat.fonte(it).texto };
    });
    return m;
  }
  /* fundo da unidade × nível máximo do aquífero: precisa da profundidade do lençol (sondagem) e da profundidade da entrada */
  function lencol(e, out, H, linha, chave, ctx, R, alvo) {
    if (!linha) return;
    var dMin = celula(linha.valor), pl = num(e.lencol && e.lencol.profundidade_m, null), pe = num(e.opcoes && e.opcoes.profundidadeEntrada_m, null);
    R.param("distância mínima fundo → nível máximo do aquífero (" + alvo + ")", dMin, "m", chave, edicaoDe(ctx, chave, null, linha));
    if (pl == null || pe == null || H == null) {
      R.verif(alvo, "fundo a ≥ " + fmt(dMin) + " m do lençol", null, dMin, "m", null, ["pendente: " + (pl == null ? "profundidade do lençol (sondagem) " : "") + (pe == null ? "profundidade da entrada (opcoes.profundidadeEntrada_m)" : "")], chave, edicaoDe(ctx, chave, null, linha));
      R.pend(pl == null ? "entrada.lencol.profundidade_m" : "entrada.opcoes.profundidadeEntrada_m", "sem a profundidade do lençol e a da entrada não se confere a distância do fundo ao lençol", alvo,
             "informar entrada.lencol.profundidade_m (sondagem, nível máximo) e opcoes.profundidadeEntrada_m (geratriz inferior do tubo de chegada)");
      return;
    }
    /* ⚠ a brita de 0,50 m no fundo era da 13969: a 17076 não a fixa (K.4: brita nº 3 de enchimento) — o fundo é o da escavação útil */
    var fundo = pe + H, folga = pl - fundo;
    R.verif(alvo, "fundo a ≥ " + fmt(dMin) + " m do lençol", r2(folga), dMin, "m", folga >= dMin - 1e-9,   /* hid:ok tolerância */
            ["fundo a " + fmt(fundo) + " m de profundidade; lençol a " + fmt(pl) + " m → distância " + fmt(folga) + " m"], chave, edicaoDe(ctx, chave, null, linha), "min");
  }

  /* ---------------------------------------------------------------- AFASTAMENTOS (17076 5.1.2 e K.3.1.5)
   * ⚠ revisão M3 (17/10/2026): cada ELEMENTO tem a sua linha e a sua medida — uma medida de "construções" não
   *   aprova "limites do terreno" nem "ramal predial". */
  /* a medida casa o elemento: chave de UMA palavra pela primeira palavra (singular/plural); de várias, todas as palavras presentes */
  function casaAlvo(alvo, chave) {
    var a = semAcento(alvo), k = semAcento(chave).trim();
    if (!k) return false;
    if (a === k) return true;
    var pk = k.split(/\s+/);
    if (pk.length > 1) return pk.every(function (w) { return (" " + a + " ").indexOf(" " + w + " ") >= 0; });
    return a.split(" ")[0].replace(/s$/, "") === k.replace(/s$/, "");
  }
  function afastamentos(e, disp, ctx, R) {
    var A0 = "tr.afastamentos_17076", lst = [], ls = ctx.linhas(A0, null, "afastamentos");
    arr(ls).forEach(function (l) { lst.push({ unidade: "sistema de tratamento (tanque e filtro)", distancia_m: num(l.distancia_m, null), alvos: l.elemento, edicao: txt(l.edicao_de_origem) || edicaoDe(ctx, A0, null, null), fonte: R.fonteDe(A0) }); });
    if (disp.tipo === "sumidouro") {
      var S0 = "tr.sumidouro_regras";
      [[/^distancia a edificacoes/, "edificações"], [/^distancia a obstaculos/, "muros e obstáculos"], [/^distancia a taludes/, "taludes com inclinação acima de 20°"]].forEach(function (x) {
        var l = linhaItem(ctx, S0, x[0], "afastamentos");
        if (l) lst.push({ unidade: "sumidouro", distancia_m: celula(l.valor), alvos: x[1], edicao: edicaoDe(ctx, S0, null, l), fonte: R.fonteDe(S0) });
      });
      lst.push({ unidade: "sumidouro", distancia_m: arr(ls).filter(function (l) { return /^limites/.test(semAcento(l.elemento)); }).map(function (l) { return num(l.distancia_m, null); })[0], alvos: "limites do terreno", edicao: "NBR 17076:2024 5.1.2", fonte: R.fonteDe(A0) });
      lst.push({ unidade: "sumidouro", distancia_m: arr(ls).filter(function (l) { return /^pocos/.test(semAcento(l.elemento)); }).map(function (l) { return num(l.distancia_m, null); })[0], alvos: "poços freáticos", edicao: "NBR 17076:2024 5.1.2", fonte: R.fonteDe(A0) });
    }
    if (disp.tipo === "vala") {
      var lp = linhaItem(ctx, "tr.vala_regras", /^distancia minima aos pocos/, "afastamentos");
      if (lp) lst.push({ unidade: "vala", distancia_m: celula(lp.valor), alvos: "poços freáticos", edicao: edicaoDe(ctx, "tr.vala_regras", null, lp), fonte: R.fonteDe("tr.vala_regras") });
      lst.push({ unidade: "vala", distancia_m: arr(ls).filter(function (l) { return /^limites/.test(semAcento(l.elemento)); }).map(function (l) { return num(l.distancia_m, null); })[0], alvos: "limites do terreno", edicao: "NBR 17076:2024 5.1.2", fonte: R.fonteDe(A0) });
    }
    lst = lst.filter(function (a) { return a.distancia_m != null; });
    var dado = e.afastamentos || null, porUnidade = e.afastamentosPorUnidade || {};
    lst.forEach(function (a) {
      var medido = null, fonteMed = a.unidade === "sumidouro" || a.unidade === "vala" ? (porUnidade[a.unidade] || dado) : dado;
      if (fonteMed) Object.keys(fonteMed).forEach(function (k) { if (medido == null && casaAlvo(a.alvos, k)) medido = num(fonteMed[k], null); });
      a.medido_m = medido;
      a.status = medido == null ? "pendente" : (medido >= a.distancia_m - 1e-9 ? "ok" : "reprovado");   /* hid:ok tolerância */
    });
    var falt = lst.filter(function (a) { return a.medido_m == null; });
    lst.filter(function (a) { return a.medido_m != null; }).forEach(function (a) {
      R.verif("afastamentos", a.unidade + " → " + a.alvos, a.medido_m, a.distancia_m, "m", a.status === "ok", ["medido " + fmt(a.medido_m) + " m; mínimo " + fmt(a.distancia_m) + " m (" + a.edicao + ")"], a.fonte ? a.fonte.chave : null, a.edicao, "min");
    });
    if (falt.length) {
      R.verif("afastamentos", "afastamentos mínimos de implantação", null, null, "m", null, falt.map(function (a) { return a.unidade + ": " + fmt(a.distancia_m) + " m de " + a.alvos + " (" + a.edicao + ")"; }), A0, "");
      R.aviso("aviso", falt.length + " afastamento(s) mínimo(s) não conferido(s) na implantação", ["tanque", "filtro", "disposicao"],
              { texto: "medir na implantação e informar entrada.afastamentos { \"limites\": m, \"construções\": m, \"ramal predial\": m, \"rede pública\": m, \"poços\": m, \"corpos de água\": m, \"árvores\": m, \"sumidouros\": m, \"edificações\": m, \"muros\": m, \"taludes\": m }" });
    }
    return lst;
  }

  /* ---------------------------------------------------------------- DESINFECÇÃO (17076 Anexo J) — opcional */
  function desinfeccao(e, con, ctx, R) {
    if (!(e.opcoes && e.opcoes.desinfeccao) || con.status !== "ok") return null;
    var D0 = "tr.desinfeccao_17076", lT = linhaItem(ctx, D0, /^tempo de contato/, "desinfecção"), lC = linhaItem(ctx, D0, /^cloro livre residual/, "desinfecção");
    if (!lT) return null;
    var t = celula(lT.valor), Qmin = con.Qd_L / (H_POR_DIA * MIN_POR_H), V = Qmin * t, out = { tempo_min: t, V_L: r2(V), cloro_mg_L: lC ? celula(lC.valor) : null, passos: [] };
    out.passos.push("V = Qméd × t = " + fmt(Qmin, C3) + " L/min × " + fmt(t, 0) + " min = " + fmt(V, 1) + " L (" + edicaoDe(ctx, D0, null, lT) + ")" + (lC ? "; cloro livre residual ≥ " + fmt(out.cloro_mg_L) + " mg/L após o contato" : ""));
    R.param("tempo de contato da desinfecção", t, "min", D0, edicaoDe(ctx, D0, null, lT));
    if (lC) R.param("cloro livre residual mínimo", out.cloro_mg_L, "mg/L", D0, edicaoDe(ctx, D0, null, lC));
    return out;
  }

  /* ---------------------------------------------------------------- UNIDADES (→ HidTanques) */
  function unidades(e, con, tq, gTq, prod, fl, disp, nLin) {
    var u = [];
    for (var i = 0; i < nLin; i++) {
      var suf = nLin > 1 ? "-" + (i + 1) : "";
      if (tq.status === "ok") {
        var base = { alvos: ["tanque", "tanque-alternativa-moldada"], id: "tanque" + suf, nome: "Tanque séptico" + (nLin > 1 ? " " + (i + 1) : ""), tipo: "tanque_septico", sistema: "esgoto", linha: i,
                     param: { Vazao_m3_dia: tq.Q_L / 1000, TDH_dia: tq.T_d, Volume_extra_m3: (tq.V_L - tq.Q_L * tq.T_d) / 1000, Desnivel_ES: tq.desnivel_m || 0, Tampa_diametro: tq.tampa_m || 0, DN_tubo_guia: tq.dnTuboGuia || 0 } };
        if (tq.folgaLaje_m != null) base.param.Altura_livre = tq.folgaLaje_m;
        if (prod) {
          base.forma = "cilindrica"; base.produto = prod; base.alvos = ["tanque"];
          base.param.Diametro_produto = prod.diametro_m; base.param.Altura_produto = prod.altura_m; base.param.Cota_entrada_produto = prod.entrada_m; base.param.Cota_saida_produto = prod.saida_m;
          base.param.DN_entrada = prod.dn || 0; base.param.DN_saida = prod.dn || 0; base.param.Profundidade_util = gTq.profundidade_m || tq.hMin; base.param.Diametro_min = 0;
          base.dims = { diametro_m: prod.diametro_m, altura_m: prod.altura_m };
        } else if (gTq.status === "ok") {
          base.forma = gTq.forma; base.param.Profundidade_util = gTq.profundidade_m;
          if (gTq.forma === "cilindrica") { base.param.Diametro_min = gTq.diametroMin_m; base.dims = { diametro_m: gTq.diametro_m, profundidade_m: gTq.profundidade_m, volume_m3: gTq.volumeReal_m3 }; }
          else { base.param.Largura_min = gTq.larguraMin_m; base.param.Relacao_CL = gTq.relacao; base.dims = { comprimento_m: gTq.comprimento_m, largura_m: gTq.largura_m, profundidade_m: gTq.profundidade_m, volume_m3: gTq.volumeReal_m3 }; }
        }
        if (base.forma) u.push(base);
      }
      if (fl.status === "ok") {
        u.push({ alvos: ["filtro"], id: "filtro" + suf, nome: "Filtro anaeróbio" + (nLin > 1 ? " " + (i + 1) : ""), tipo: "filtro_anaerobio", sistema: "esgoto", forma: "retangular", linha: i,
                 param: { Vazao_m3_dia: tq.Q_L != null ? tq.Q_L / 1000 : con.Qd_L / nLin / 1000, TDH_dia: fl.Iv * fl.T_d, Volume_extra_m3: 0, Volume_min_m3: fl.Vmin_L / 1000, Profundidade_util: fl.hUtil_m, Relacao_CL: 1, Largura_min: 0, Fundo_falso: fl.fundoFalso_m, Desnivel_ES: tq.desnivel_m || 0 },
                 dims: { comprimento_m: fl.comprimento_m, largura_m: fl.largura_m, profundidade_m: fl.hUtil_m, volume_m3: fl.volumeReal_m3 } });
      }
    }
    var txL = disp.taxa != null ? disp.taxa * 1000 : null;   /* m³/m².dia → L/m².dia (parâmetro da família) */
    if (disp.status === "ok" && disp.tipo === "sumidouro") {
      for (var s = 0; s < disp.n; s++) u.push({ alvos: ["sumidouro", "disposicao"], id: "sumidouro-" + (s + 1), nome: "Sumidouro " + (s + 1), tipo: "sumidouro", sistema: "esgoto", forma: "sumidouro",
        param: { Vazao_L_dia: disp.areaUnidade_m2 * txL, Coef_infiltracao: txL, Diametro: disp.diametro_m, Brita: 0 }, dims: { diametro_m: disp.diametro_m, profundidade_m: disp.profundidadeUtil_m },
        espacamento_m: disp.espacamento_m, distanciaSistema_m: disp.distanciaSistema_m });
    }
    if (disp.status === "ok" && disp.tipo === "vala") {
      for (var c = 0; c < disp.n; c++) for (var v = 0; v < disp.valasPorConjunto; v++) u.push({ alvos: ["vala", "disposicao"], id: "vala-" + (c + 1) + "-" + (v + 1), nome: "Vala de infiltração " + (c + 1) + "." + (v + 1), tipo: "vala", sistema: "esgoto", forma: "vala", conjunto: c + 1,
        param: { Vazao_L_dia: txL * disp.largura_m * disp.comprimentoVala_m, Coef_infiltracao: txL, Largura: disp.largura_m, N_valas: 1 },
        dims: { comprimento_m: disp.comprimentoVala_m, largura_m: disp.largura_m }, espacamento_m: disp.espacamento_m });
    }
    return u;
  }

  /* ---------------------------------------------------------------- ORQUESTRAÇÃO */
  function calcular(entrada) {
    var e = entrada || {}, H = N(), R = novoRes("tratamento", e.ctx || H.contexto()), ctx = R.ctx;
    var con = contribuicao(e, ctx, R);
    var nLin = con.status === "ok" ? escopo(e, con, ctx, R) : 1;
    var tq = tanque(e, con, nLin, ctx, R);
    var prod = escolherProduto(e, tq, nLin, ctx, R);
    var forma = e.opcoes && e.opcoes.formaTanque === "cilindrica" ? "cilindrica" : "prismatica";
    /* o moldado é SEMPRE calculado: é a alternativa verificável quando o produto não informa o volume */
    var gTq = geometriaTanque(tq, forma, ctx, R, prod ? "tanque-alternativa-moldada" : "tanque");
    var fl = filtro(e, con, tq, nLin, ctx, R);
    var disp = disposicao(e, con, ctx, R);
    var af = afastamentos(e, disp, ctx, R);
    var ds = desinfeccao(e, con, ctx, R);
    var un = unidades(e, con, tq, gTq, prod, fl, disp, nLin);
    return R.fechar({ contribuicao: con, linhasParalelas: nLin, tanque: { calculo: tq, geometria: gTq, produto: prod }, filtro: fl, disposicao: disp, afastamentos: af, desinfeccao: ds, unidades: un });
  }

  /* executa a ação "trocarTipo" do resultado fora do escopo: o HidETE com a mesma população (e o contexto, se vier) */
  function executarAcao(acao, ctx) {
    if (!acao || acao.tipo !== "trocarTipo" || acao.para !== "ete") return null;
    var ETE = dep("HidETE", "./hidete.js");
    if (!ETE) return null;
    var en = JSON.parse(JSON.stringify(acao.entrada || {}));
    if (ctx) en.ctx = ctx;
    return ETE.calcular(en);
  }

  var HidTrat = {
    VERSAO: 1, calcular: calcular, executarAcao: executarAcao, OCUPACAO_DO_USO: OCUPACAO_DO_USO,
    /* ferramentas comuns (HidETE, HidETA) */
    util: { numerosBR: numerosBR, numeroBR: numeroBR, faixa: faixa, naFaixa: naFaixa, celula: celula, edicaoDe: edicaoDe, novoRes: novoRes, linhaItem: linhaItem,
            fmt: fmt, teto2: teto2, r2: r2, r3: r3, semAcento: semAcento, areaCirculo: areaCirculo, diametroDaArea: diametroDaArea,
            S_POR_DIA: S_POR_DIA, H_POR_DIA: H_POR_DIA, MIN_POR_H: MIN_POR_H, S_POR_H: S_POR_H, CM_POR_M: CM_POR_M, produtos: produtos }
  };
  global.HidTrat = HidTrat;
  if (typeof module !== "undefined" && module.exports) module.exports = HidTrat;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
