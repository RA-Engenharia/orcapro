/* =====================================================================
 * hidaq.js — ÁGUA QUENTE (sistema "agua_quente" do biminst) — motor PURO,
 * ES5, Node-testável. Fase 2 do docs/hidro/PLANO-HIDROSSANITARIO.md;
 * contrato em docs/hidro/CONTRATO.md (§6, sistemas.agua_quente).
 *
 * O que faz:
 *  1. TEMPERATURAS da equação de mistura (aq.mistura) e a fração de água
 *     quente no ponto de uso — balanço de energia (física), números da tabela;
 *  2. CONSUMO DIÁRIO: por uso (Macintyre, aq.consumo.edificacao) e, na
 *     residência com o tipo de aquecedor informado, pelo roteiro do fabricante
 *     (aq.consumo.aquecedor + aq.consumo.pecas);
 *  3. AQUECIMENTO: acumulação (volume a reservar, volume comercial, potência
 *     pelo tempo de recuperação), passagem (Qnec = Qt × fator, nº de
 *     aquecedores pela vazão nominal do equipamento) e solar (nº de coletores
 *     pela produção diária tabelada);
 *  4. REDE: o MESMO método da água fria (js/hidaf.js com perfil "agua_quente"):
 *     pesos, DN pela velocidade, perdas, pressão em cada ponto, laço de DN.
 *     Vazão/peso por aparelho: Tigre 2025 × USP 1994 divergem (chuveiro,
 *     lavatório) — padrão = ENVOLTÓRIA (o maior das duas, por aparelho);
 *  5. RETORNO: maior comprimento aquecedor → ponto contra o limite da fonte
 *     (ou o informado pelo projetista, com a fonte); sem limite = PENDENTE;
 *  6. MISTURADOR: pressão da água fria × da quente no mesmo ponto (o
 *     orquestrador chama misturadores() depois das duas redes);
 *  7. ISOLAMENTO (exigência citada, sem conta: a fórmula de perda de calor
 *     está pendente na fonte), DILATAÇÃO (ΔL = α·L·ΔT, α do catálogo) e
 *     PRESSÃO DE SERVIÇO do tubo na temperatura (catálogo).
 *
 * ⚠ Nenhum valor de norma aqui (CONTRATO §0): tudo vem do HidNormas
 *   (dados-fonte/hidro/normas/aguaquente.json, derivado em
 *   tools/hid-normas-derivar.js) ou do HidCatalogo (diâmetro interno,
 *   dilatação e pressão de serviço dos tubos PPR/CPVC). Faltou → pendente.
 * ⚠ Pendência nunca vira "ok" (revisão F7 C1): retorno sem limite, misturador
 *   sem tolerância e tubo sem pressão de serviço ficam PENDENTES — o projetista
 *   pode informar o valor COM A FONTE (vai ao memorial como "informado pelo
 *   projetista"), nunca um padrão silencioso.
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
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function AFm() { return dep("HidAF", "./hidaf.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function CAT() { return dep("HidCatalogo", "./hidcatalogo.js"); }
  var LS = 1000;   /* L por m³ */
  var MM = 1000;   /* mm por m */

  /* hid:fisica-inicio — física e unidades (não é norma)
   * c: calor específico da água líquida, 4,18 kJ/(kg·K) — CRC Handbook of Chemistry and Physics, 97ª ed.,
   *   "Properties of Water in the Range 0–100 °C" (4,18 a 4,19 kJ/(kg·K) entre 15 e 70 °C; adotado 4,18).
   * 1 kgf/cm² = 98,0665 kPa (definição: kgf = 9,80665 N, g padrão; BIPM, SI Brochure 9ª ed.).
   * 60 s por minuto. */
  var C_AGUA_KJ_KG_K = 4.18;
  var KPA_POR_KGF_CM2 = 98.0665;
  var S_POR_MIN = 60;
  /* hid:fisica-fim */
  var S_POR_H = 3600;

  /* catálogo do tubo de água quente por material (HidCatalogo): a FICHA e a linha da tabela de
     pressão. A classe do PPR vem da entrada (ou do padrão do material no BimInst, declarado) */
  var TUBO_CATALOGO = {
    ppr: { json: "amanco-wavin-ppr-agua-quente.json", item: function (x, cfg) { return x.dados && x.dados.classe === "PN" + cfg.classePPR; } },
    cpvc: { json: "amanco-wavin-super-cpvc.json", item: function (x) { return x.dados && /SDR11/.test(String(x.dados.linhaFicha || "")); } }
  };
  var FONTES_VAZAO = { tigre: "aq.aparelhos.tigre", usp1994: "aq.aparelhos.usp1994" };
  var RESIDENCIAL = { residencial_unifamiliar: 1, residencial_multifamiliar: 1, residencial_popular: 1 };

  function aviso(lista, grav, texto, elementos, corrigir) {
    lista.push({ id: "aq-x" + lista.length, sistema: "agua_quente", gravidade: grav, texto: texto, elementos: elementos || [], corrigir: corrigir || null });
  }

  /* ------------------------------------------------ catálogo (tubos) */
  /* DE e espessura: o gerado (js/hidcatalogo.js) normaliza em dim.D / dim.e; o JSON cru usa de_mm / espessura_mm */
  function deDe(x) { return num(x.de_mm, num((x.dim || {}).D, null)); }
  function eDe(x) { return num(x.espessura_mm, num((x.dim || {}).e, null)); }
  function tuboCatalogo(material, dn, cfg) {
    var Cg = CAT(), T = TUBO_CATALOGO[material]; if (!Cg || !T || typeof Cg.itens !== "function") return null;
    var l = Cg.itens({ tipo: "tubo", fonteJson: T.json, dn: dn }).filter(function (x) { return T.item(x, cfg) && deDe(x) != null && eDe(x) != null; });
    return l[0] || null;
  }
  function caracteristicas(material, nome) {
    var Cg = CAT(), T = TUBO_CATALOGO[material]; if (!Cg || !T || typeof Cg.tabela !== "function") return null;
    return Cg.tabela(T.json, nome);
  }

  /* ------------------------------------------------ consumo diário */
  function populacao(cfg, prog, ctx, passos) {
    if (num(cfg.populacao, null) != null) { passos.push("população informada: " + cfg.populacao + " pessoas"); return { valor: num(cfg.populacao, 0), origem: "entrada" }; }
    if (num(cfg.dormitorios, null) != null) {
      var cs = ctx.consulta("aq.populacao.dormitorio", { dormitorio: "social" }, "pessoas", "água quente — população"), cv = ctx.consulta("aq.populacao.dormitorio", { dormitorio: "servico" }, "pessoas", "água quente — população");
      if (cs.ok && cv.ok) {
        var p = num(cs.valor, 0) * num(cfg.dormitorios, 0) + num(cv.valor, 0) * num(cfg.dormitoriosServico, 0);
        passos.push("P = " + cs.valor + " × " + cfg.dormitorios + " dorm. + " + cv.valor + " × " + num(cfg.dormitoriosServico, 0) + " dorm. de serviço = " + p + " pessoas");
        return { valor: p, origem: "norma", fonte: cs.fonte };
      }
      return null;
    }
    if (prog && prog.populacao && num(prog.populacao.valor, null) != null) { passos.push("população do programa de necessidades: " + prog.populacao.valor + " pessoas"); return { valor: num(prog.populacao.valor, 0), origem: "programa" }; }
    ctx.pendencia("entrada.aguaQuente.populacao", "população da água quente não informada (nem dormitórios, nem programa de necessidades)", "água quente — consumo");
    return null;
  }

  function temperaturas(cfg, ctx) {
    var t = cfg.temperaturas || {}, out = { passos: [], fontes: [], status: "ok" };
    [["t_aquecedor", "aquecedor_C"], ["t_fria", "fria_C"], ["t_uso", "uso_C"]].forEach(function (p) {
      if (num(t[p[1]], null) != null) { out[p[0]] = num(t[p[1]], 0); out.passos.push(p[0] + " = " + out[p[0]] + " °C (informada)"); return; }
      var c = ctx.consulta("aq.mistura", { parametro: p[0] }, "valor", "água quente — temperaturas");
      if (c.ok) { out[p[0]] = num(c.valor, null); out.fontes.push(c.fonte); out.passos.push(p[0] + " = " + c.valor + " °C (" + (c.linha && c.linha.fonte ? c.linha.fonte : "tabela") + ")"); }
      else { out[p[0]] = null; out.status = "pendente"; }
    });
    if (out.t_aquecedor != null && out.t_fria != null && out.t_uso != null) {
      if (!(out.t_aquecedor > out.t_fria) || out.t_uso < out.t_fria || out.t_uso > out.t_aquecedor) { out.status = "reprovado"; out.passos.push("temperaturas incoerentes: precisa t_fria ≤ t_uso ≤ t_aquecedor e t_aquecedor > t_fria"); out.fracao = null; }
      else {
        /* balanço de energia da mistura (física): V_AQ·t_AQ + V_AF·t_AF = V_MIST·t_MIST → V_AQ/V_MIST = (t_MIST − t_AF)/(t_AQ − t_AF) */
        out.fracao = (out.t_uso - out.t_fria) / (out.t_aquecedor - out.t_fria);
        out.passos.push("fração de água quente = (t_uso − t_fria)/(t_aquecedor − t_fria) = (" + out.t_uso + " − " + out.t_fria + ")/(" + out.t_aquecedor + " − " + out.t_fria + ") = " + f3(out.fracao));
      }
    } else out.fracao = null;
    var cm = NR().consulta("aq.mistura", { parametro: "t_misturador_obrigatorio" }, "valor");
    if (cm.ok) { out.t_misturador_obrigatorio = num(cm.valor, null); out.fonteMisturador = cm.fonte; }
    return out;
  }

  /* Macintyre (por uso) + balanço de mistura → volume a reservar na temperatura do aquecedor */
  function consumoPorUso(cfg, prog, ctx, T, pop) {
    var uso = cfg.uso || (prog && prog.uso) || null, r = { metodo: "uso", passos: [], status: "pendente" };
    if (!uso) { ctx.pendencia("entrada.aguaQuente.uso", "uso da edificação não informado para o consumo de água quente", "água quente — consumo"); return r; }
    var c = ctx.consulta("aq.consumo.edificacao", { uso: uso }, "litros_dia", "água quente — consumo (" + uso + ")");
    if (!c.ok) return r;
    var base = c.linha.base || "pessoa", qtd = base === "pessoa" ? (pop ? pop.valor : null) : num(cfg[base], null);
    if (qtd == null) { if (base !== "pessoa") ctx.pendencia("entrada.aguaQuente." + base, "quantidade de " + base + " não informada (base do consumo de " + uso + ")", "água quente — consumo"); return r; }
    r.litrosDia = num(c.valor, 0) * qtd; r.fonte = c.fonte;
    r.passos.push("V_dia (mistura) = " + c.valor + " L/dia por " + base + " × " + qtd + " = " + f2(r.litrosDia) + " L/dia");
    if (T.fracao == null) { r.passos.push("pendente: fração de mistura (temperaturas)"); return r; }
    r.volumeQuente_L = r.litrosDia * T.fracao;
    r.passos.push("V_AQ = V_dia × fração = " + f2(r.litrosDia) + " × " + f3(T.fracao) + " = " + f2(r.volumeQuente_L) + " L a " + T.t_aquecedor + " °C");
    r.status = "ok"; return r;
  }
  /* roteiro do fabricante (residência): pessoas × consumo do tipo de aquecedor + banheira/pia/máquina */
  function consumoPorAquecedor(cfg, ctx, pop) {
    var aq = cfg.aquecimento || {}, en = aq.energia, r = { metodo: "aquecedor", passos: [], status: "pendente" };
    var c = ctx.consulta("aq.consumo.aquecedor", { energia: en }, "litros_dia_pessoa", "água quente — consumo por tipo de aquecedor");
    if (!c.ok || !pop) return r;
    var v = num(c.valor, 0) * pop.valor, ps = cfg.pecas || {};
    r.passos.push("pessoas × consumo (" + en + ") = " + pop.valor + " × " + c.valor + " = " + f2(v) + " L/dia");
    if (num(ps.banheira_L, null) != null) {
      var cb = ctx.consulta("aq.consumo.pecas", { peca: "banheira" }, "fracao_volume", "água quente — banheira");
      if (!cb.ok) return r;
      v += num(ps.banheira_L, 0) * num(cb.valor, 0); r.passos.push("+ banheira " + ps.banheira_L + " L × " + cb.valor + " = " + f2(num(ps.banheira_L, 0) * num(cb.valor, 0)) + " L");
    }
    var falhou = false;
    ["pia_cozinha", "maquina_lavar_roupa"].forEach(function (p) {
      if (!(num(ps[p], 0) > 0)) return;
      var cp = ctx.consulta("aq.consumo.pecas", { peca: p }, "litros_dia", "água quente — " + p);
      if (!cp.ok) { falhou = true; return; }
      v += num(cp.valor, 0) * num(ps[p], 0); r.passos.push("+ " + p + " " + ps[p] + " × " + cp.valor + " L/dia");
    });
    if (falhou) return r;
    r.volumeQuente_L = v; r.litrosDia = v; r.fonte = c.fonte; r.status = "ok";
    r.passos.push("V = " + f2(v) + " L/dia (roteiro do fabricante: o consumo por tipo de aquecedor já considera a temperatura de armazenamento)");
    return r;
  }

  /* ------------------------------------------------ CALCULAR
   * entrada = a do HidDimensionar; entrada.aguaQuente = cfg (CONTRATO §6).
   * extra = { programa, af } — o resultado da água fria dá a pressão na entrada do aquecedor. */
  function calcular(entrada, ctx, R, extra) {
    var H = HH(); entrada = entrada || {}; ctx = ctx || NR().contexto(); extra = extra || {};
    var cfg = entrada.aguaQuente || {}, mod = entrada.modelo || {}, est = mod.estado || {};
    R = R || BI().rede(est, mod.avaliarFam);
    var temRede = arr(R && R.trechos).some(function (t) { return t.sistema === "agua_quente"; });
    var out = { status: "ok", fonteVazoes: cfg.fonteVazoes || "envoltoria", divergencias: [], temperaturas: null, consumo: null, aquecimento: null, recirculacao: null,
                isolamento: null, dilatacao: [], pressaoTubo: [], misturadores: [], catalogos: [], trechos: [], pontos: [], pontoCritico: null,
                verificacoes: [], avisos: [], premissas: [], ops: [], opsDesfazer: [], rede: null };
    if (!temRede && !entrada.aguaQuente) { out.status = "vazio"; return out; }
    function premissa(item, valor, origem) { if (!out.premissas.some(function (p) { return p.item === item; })) out.premissas.push({ item: item, valor: valor, origem: origem || "padrao_motor" }); }
    /* etaInv: verificação de MÍNIMO (valor ≥ limite) → η = limite/valor, para "η ≤ 1 atende" valer em todas (revisão fase 2, M4) */
    function verif(alvo, nome, valor, limite, unidade, ok, passos, fonte, status, etaInv) {
      var v = { id: "aq-v" + out.verificacoes.length, sistema: "agua_quente", alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unidade,
                eta: ok === null || !(limite > 0) || valor == null ? null : (etaInv ? (valor > 0 ? limite / valor : null) : valor / limite), ok: ok, status: status || (ok === null ? "pendente" : (ok ? "ok" : "reprovado")), passos: passos || [], fonte: fonte || null };
      out.verificacoes.push(v); return v;
    }
    /* cópia rasa: a classe padrão do PPR não pode ser gravada na ENTRADA do usuário (revisão fase 2, B2) */
    var cfg0 = cfg; cfg = {}; Object.keys(cfg0).forEach(function (k) { cfg[k] = cfg0[k]; });
    cfg.classePPR = cfg.classePPR || ((BI().MATERIAIS.ppr || {}).pn) || null;

    /* 1) temperaturas */
    var T = temperaturas(cfg, ctx); out.temperaturas = T;
    if (T.status === "reprovado") aviso(out.avisos, "erro", "temperaturas da água quente incoerentes (" + T.t_fria + " / " + T.t_uso + " / " + T.t_aquecedor + " °C)", [], { texto: "corrigir entrada.aguaQuente.temperaturas" });
    if (T.t_aquecedor != null && T.t_misturador_obrigatorio != null && T.t_aquecedor > T.t_misturador_obrigatorio)
      aviso(out.avisos, "info", "água no aquecedor a " + T.t_aquecedor + " °C, acima de " + T.t_misturador_obrigatorio + " °C: os pontos de banho e higiene precisam de misturador (fonte: " + ((T.fonteMisturador || {}).doc || "tabela") + ")", [], null);

    /* 2) consumo diário e aquecimento (só com a entrada da água quente) */
    var aqc = cfg.aquecimento || {}, tipo = aqc.tipo || null;
    if (entrada.aguaQuente) {
      var pp = [], pop = populacao(cfg, extra.programa, ctx, pp);
      var cu = consumoPorUso(cfg, extra.programa, ctx, T, pop);
      var uso = cfg.uso || (extra.programa && extra.programa.uso) || null;
      var ca = aqc.energia && RESIDENCIAL[uso] ? consumoPorAquecedor(cfg, ctx, pop) : null;
      out.consumo = { populacao: pop, passosPopulacao: pp, porUso: cu, porAquecedor: ca, status: cu.status === "ok" || (ca && ca.status === "ok") ? "ok" : "pendente" };
      /* ⚠ decisão (gerente aprovar): com as DUAS contas válidas vale a MAIOR (lado seguro) — o balanço de mistura (USP 1994)
         reserva a 70 °C e dá volume menor; o roteiro do fabricante já embute temperatura de armazenamento menor */
      var cands = [cu, ca].filter(function (x) { return x && x.status === "ok" && x.volumeQuente_L != null; }).sort(function (a, b) { return b.volumeQuente_L - a.volumeQuente_L; });
      out.consumo.volumeNecessario_L = cands.length ? cands[0].volumeQuente_L : null;
      out.consumo.metodoAdotado = cands.length ? cands[0].metodo : null;
      if (cands.length === 2) premissa("volume de água quente adotado", "o maior entre o balanço de mistura (" + f2(cu.volumeQuente_L) + " L) e o roteiro do fabricante (" + f2(ca.volumeQuente_L) + " L): " + f2(cands[0].volumeQuente_L) + " L");
      if (!tipo) { ctx.pendencia("entrada.aguaQuente.aquecimento.tipo", "tipo de aquecimento não informado (passagem, acumulacao ou solar)", "água quente — aquecimento"); out.aquecimento = { tipo: null, status: "pendente", passos: ["pendente: tipo de aquecimento"] }; }
      else if (tipo === "acumulacao" || tipo === "solar") out.aquecimento = acumulacao(cfg, ctx, T, out, verif, premissa);
      else if (tipo === "passagem") out.aquecimento = null;   /* depois da rede: usa as vazões dos pontos */
      else { ctx.pendencia("entrada.aguaQuente.aquecimento.tipo", "tipo de aquecimento \"" + tipo + "\" desconhecido (passagem, acumulacao, solar)", "água quente — aquecimento"); out.aquecimento = { tipo: tipo, status: "pendente", passos: [] }; }
    }

    /* 3) rede: o método da água fria com o perfil da água quente */
    if (temRede) {
      var al = alimentacaoAQ(cfg, extra.af, ctx, out, premissa, extra.soDemanda);
      var perfil = { sistema: "agua_quente", nome: "água quente", prefixo: "aq", temperatura_C: T.t_aquecedor != null ? T.t_aquecedor : null, alimentacao: al,
                     semDnMin: true, semPminPeca: true,
                     aparelho: function (c, ap, col, uso) { return aparelhoAQ(c, ap, col, uso, out); },
                     di: function (material, dn, uso, registrar) { return diAQ(material, dn, uso, registrar, ctx, cfg, out); } };
      if (perfil.temperatura_C == null) premissa("temperatura da água quente na rede", "sem temperatura do aquecedor: propriedades da água a " + H.T_PADRAO_C + " °C");
      var rd = AFm().calcular(entrada, ctx, R, perfil);
      out.rede = rd;
      ["metodoVazao", "formulaPerda", "temperatura_C", "fluido", "alimentacao", "trechos", "pontos", "pontoCritico", "iteracoes"].forEach(function (k) { out[k] = rd[k]; });
      if (out.alimentacao && al) { out.alimentacao.perdaAquecedor_kpa = al.perdaAquecedor_kpa == null ? null : al.perdaAquecedor_kpa; out.alimentacao.pressaoEntrada_kpa = al.pressaoEntrada_kpa == null ? null : al.pressaoEntrada_kpa; }
      arr(rd.verificacoes).forEach(function (v) { v.id = "aq-r" + v.id.replace(/^aq-/, ""); out.verificacoes.push(v); });
      arr(rd.avisos).forEach(function (a) { out.avisos.push(a); });
      arr(rd.premissas).forEach(function (p) { premissa(p.item, p.valor, p.origem); });
      out.ops = rd.ops; out.opsDesfazer = rd.opsDesfazer;
      if (out.fonteVazoes === "envoltoria") premissa("vazão e peso dos pontos de água quente", "envoltória das duas fontes (manual Tigre 2025 × USP 1994/NBR 7198:1993): o maior valor por aparelho" + (out.divergencias.length ? " — divergências: " + out.divergencias.map(function (d) { return d.aparelho + " " + d.coluna + " " + f3(d.tigre) + " × " + f3(d.usp1994); }).join("; ") : ""));
      premissa("método da rede de água quente", "o mesmo da água fria (pesos Q = C·√ΣP, DN pela velocidade, pressões da NBR 5626:2020, que trata água fria e quente)");
      if (rd.status !== "vazio") {
        recirculacao(cfg, ctx, out, verif, premissa);
        dilatacaoEPressao(cfg, ctx, out, verif, T, premissa);
        isolamento(ctx, out);
      }
    }
    if (entrada.aguaQuente && tipo === "passagem") out.aquecimento = passagem(cfg, ctx, out, verif);
    if (extra.af && (cfg.alimentacao || {}).entradaAF) verifPressaoAquecedor(cfg, out, verif, extra.af);
    if (!extra.soDemanda) requisitos2020(cfg, ctx, out, verif, T, extra, R, entrada);

    /* status: o pior de tudo */
    var sts = out.verificacoes.map(function (v) { return v.status; }).concat([T.status, out.consumo ? out.consumo.status : "ok", out.aquecimento ? out.aquecimento.status : "ok", out.rede ? out.rede.status : "ok"]);
    out.status = sts.indexOf("reprovado") >= 0 ? "reprovado" : (sts.indexOf("pendente") >= 0 ? "pendente" : "ok");
    if (out.avisos.some(function (a) { return a.gravidade === "erro"; }) && out.status === "ok") out.status = "reprovado";
    return out;
  }

  /* vazão/peso do ponto: fonte escolhida ou ENVOLTÓRIA (o maior das duas) — a divergência vai ao memorial */
  function aparelhoAQ(ctx, ap, col, uso, out) {
    if (out.fonteVazoes !== "envoltoria") {
      var k = FONTES_VAZAO[out.fonteVazoes];
      if (!k) { ctx.pendencia("entrada.aguaQuente.fonteVazoes", "fonte de vazões \"" + out.fonteVazoes + "\" desconhecida (envoltoria, tigre, usp1994)", uso); return { ok: false }; }
      return ctx.consulta(k, { aparelho: ap }, col, uso);
    }
    var cs = Object.keys(FONTES_VAZAO).map(function (f) { var c = NR().consulta(FONTES_VAZAO[f], { aparelho: ap }, col); c.qual = f; return c; }).filter(function (c) { return c.ok && num(c.valor, null) != null; });
    if (!cs.length) return ctx.consulta(FONTES_VAZAO.tigre, { aparelho: ap }, col, uso);   /* registra a pendência com a chave */
    cs.sort(function (a, b) { return num(b.valor, 0) - num(a.valor, 0); });
    if (cs.length > 1 && num(cs[0].valor, 0) !== num(cs[1].valor, 0) && !out.divergencias.some(function (d) { return d.aparelho === ap && d.coluna === col; })) {
      var dv = { aparelho: ap, coluna: col, adotado: cs[0].qual }; cs.forEach(function (c) { dv[c.qual] = num(c.valor, null); }); out.divergencias.push(dv);
    }
    return ctx.consulta(FONTES_VAZAO[cs[0].qual], { aparelho: ap }, col, uso);
  }

  /* diâmetro interno: tabela de norma do material → tubo do catálogo (DE − 2e) → pendência */
  function diAQ(material, dn, uso, registrar, ctx, cfg, out) {
    /* PPR na água quente: o catálogo tem a classe PN escolhida (cfg.classePPR); a tabela de norma do PPR é UMA classe por DN, adotada para a água fria
       (SINAPI) — não pode passar na frente da classe que o projetista escolheu. Sem o tubo no catálogo, vale a tabela. */
    var doCatalogo = material === "ppr" ? tuboCatalogo(material, dn, cfg) : null;
    var c = doCatalogo ? { ok: false } : NR().consulta("materiais.diametro_interno", { material: material, dn: dn }, "di_mm");
    if (c.ok) { ctx.consulta("materiais.diametro_interno", { material: material, dn: dn }, "di_mm", uso); return num(c.valor, null) / MM; }
    var t = doCatalogo || tuboCatalogo(material, dn, cfg);
    if (t) {
      var F = CAT().fonte(t);
      if (!out.catalogos.some(function (x) { return x.json === F.json; })) out.catalogos.push({ json: F.json, texto: F.texto, fabricante: F.fabricante, linha: F.linha, url: F.url, edicao: F.edicao, uso: "diâmetro interno = DE − 2e dos tubos" + (material === "ppr" ? " (classe PN" + cfg.classePPR + ")" : "") });
      return (deDe(t) - 2 * eDe(t)) / MM;
    }
    if (registrar) ctx.pendencia("materiais.diametro_interno[" + material + "]", "diâmetro interno de " + material + " DN " + dn + ": sem tabela de norma e sem o tubo no catálogo carregado (js/hidcatalogo.js)", uso);
    return null;
  }

  /* alimentação da rede de água quente: a pressão da água fria na entrada do aquecedor (menos a perda
     do aquecedor) ou o que a entrada disser */
  function alimentacaoAQ(cfg, af, ctx, out, premissa, soDemanda) {
    var H = HH(), al = cfg.alimentacao || {}, o = {};
    Object.keys(al).forEach(function (k) { o[k] = al[k]; });
    if (!al.entradaAF) return o;
    /* 1ª passada do orquestrador (contexto descartável): só a DEMANDA importa, e vazão/peso não dependem de
       pressão — carga "infinita" para o laço de DN não mexer em nada. Este resultado nunca vai ao usuário. */
    if (soDemanda) { o.tipo = "pressao"; o.carga_m = Number.MAX_VALUE; return o; }
    var pt = af ? arr(af.pontos).filter(function (p) { return p.famInst === al.entradaAF; })[0] : null;
    o.tipo = "pressao"; o.chavePressao = "agua_fria.ponto[" + al.entradaAF + "]";
    if (!pt || pt.pressaoDinamica_kpa == null) { o.motivoSemPressao = "a água fria não calculou a pressão na entrada do aquecedor " + al.entradaAF + " (ponto pendente ou ausente)"; return o; }
    var rhoAF = af.fluido ? af.fluido.rho : null, perdaKpa = num((cfg.aquecedor || {}).perda_kpa, null), tipo = (cfg.aquecimento || {}).tipo;
    /* NBR 5626:2020 6.13.1.3: perda do aquecedor × VAZÃO — com a curva do catálogo, interpola na vazão de projeto (a da água fria
       na entrada do aquecedor = a demanda da água quente); fora da curva → pendente (nunca extrapola) */
    var curva = arr((cfg.aquecedor || {}).curvaPerda).filter(function (x) { return num(x.vazao_l_min, null) != null && num(x.perda_kpa, null) != null; }).sort(function (a, b) { return a.vazao_l_min - b.vazao_l_min; });
    if (curva.length >= 2 && pt.vazao_ls != null) {
      var qL = pt.vazao_ls * S_POR_MIN, k0 = null;
      for (var iC = 0; iC + 1 < curva.length; iC++) if (qL >= curva[iC].vazao_l_min && qL <= curva[iC + 1].vazao_l_min) k0 = iC;
      if (k0 == null) { ctx.pendencia("entrada.aguaQuente.aquecedor.curvaPerda", "vazão de projeto " + f2(qL) + " L/min fora da curva de perda do aquecedor (" + curva[0].vazao_l_min + " a " + curva[curva.length - 1].vazao_l_min + " L/min)", "água quente — alimentação"); o.motivoSemPressao = "vazão fora da curva de perda do aquecedor"; return o; }
      var a0 = curva[k0], b0 = curva[k0 + 1];
      perdaKpa = a0.perda_kpa + (b0.perda_kpa - a0.perda_kpa) * (qL - a0.vazao_l_min) / (b0.vazao_l_min - a0.vazao_l_min);
      premissa("perda de carga do aquecedor", f2(perdaKpa) + " kPa a " + f2(qL) + " L/min (curva do catálogo, interpolada — NBR 5626:2020 6.13.1.3)", "entrada");
    } else if (perdaKpa != null) premissa("perda de carga do aquecedor", f2(perdaKpa) + " kPa informada (sem a curva perda × vazão do catálogo)", "entrada");
    if (perdaKpa == null && tipo === "passagem") {
      ctx.pendencia("entrada.aguaQuente.aquecedor.perda_kpa", "perda de carga do aquecedor de passagem não informada (catálogo do fabricante)", "água quente — alimentação");
      o.motivoSemPressao = "perda de carga do aquecedor de passagem não informada"; return o;
    }
    if (perdaKpa == null) { perdaKpa = 0; premissa("perda de carga no reservatório térmico", "desprezada (acumulação: velocidade baixa no reservatório)"); }
    o.carga_m = pt.cota + H.kpaParaM(pt.pressaoDinamica_kpa - perdaKpa, rhoAF);
    o.pressaoEntrada_kpa = pt.pressaoDinamica_kpa; o.perdaAquecedor_kpa = perdaKpa;
    /* ⚠ revisão fase 2 A1 (decisão do RT): a ESTÁTICA da água quente é a do nível MÁXIMO da água fria (mesma regra do
       F7-A2). Sem ele, cargaEstatica_m = null e o HidAF deixa a verificação PENDENTE — nunca a carga dinâmica na entrada
       do aquecedor (subestimava ~25 kPa e o rótulo dizia "rede pública"). */
    o.cargaEstatica_m = null; o.origemCargaEstatica = null;
    if (af.alimentacao && af.alimentacao.nivelAguaMax != null) { o.cargaEstatica_m = af.alimentacao.nivelAguaMax; o.origemCargaEstatica = "nível máximo da água fria que alimenta o aquecedor (" + (af.alimentacao.origemNivelMax || "informado") + ")"; }
    else if (af.alimentacao && af.alimentacao.tipo === "rede_publica") { o.cargaEstatica_m = af.alimentacao.carga_m; o.origemCargaEstatica = "pressão da rede pública na água fria"; }
    premissa("alimentação da água quente", "pressão da água fria na entrada do aquecedor " + al.entradaAF + " = " + f2(pt.pressaoDinamica_kpa) + " kPa, menos a perda do aquecedor " + f2(perdaKpa) + " kPa");
    return o;
  }

  /* ------------------------------------------------ acumulação e solar */
  function acumulacao(cfg, ctx, T, out, verif, premissa) {
    var aqc = cfg.aquecimento || {}, r = { tipo: aqc.tipo, passos: [], status: "pendente" }, H = HH();
    var vn = out.consumo ? out.consumo.volumeNecessario_L : null;
    if (vn == null) { r.passos.push("pendente: volume diário de água quente"); return r; }
    r.volumeNecessario_L = vn; r.passos.push("volume necessário = " + f2(vn) + " L (" + out.consumo.metodoAdotado + ")");
    var ls = ctx.linhas("aq.acumulacao.volumes_comerciais", null, "água quente — volume comercial");
    var com = ls ? ls.map(function (x) { return num(x.volume_l, null); }).filter(function (x) { return x != null && x >= vn; }).sort(function (a, b) { return a - b; }) : [];
    var fV = NR().fonte("aq.acumulacao.volumes_comerciais");
    if (num(aqc.volumeAdotado_L, null) != null) {
      r.volumeAdotado_L = num(aqc.volumeAdotado_L, 0);
      premissa("volume do reservatório térmico", r.volumeAdotado_L + " L — informado pelo projetista" + (aqc.fonteVolume ? " (" + aqc.fonteVolume + ")" : ""), "entrada");
      verif("aquecedor", "volume do reservatório térmico", r.volumeAdotado_L, vn, "L", r.volumeAdotado_L >= vn, ["V adotado " + f2(r.volumeAdotado_L) + " L ≥ V necessário " + f2(vn) + " L"], fV, null, true);
    } else if (com.length) {
      r.volumeAdotado_L = com[0]; r.passos.push("volume comercial = o menor da tabela que não fica abaixo do necessário: " + com[0] + " L");
      verif("aquecedor", "volume do reservatório térmico", com[0], vn, "L", true, ["V comercial " + com[0] + " L ≥ V necessário " + f2(vn) + " L (o menor da tabela que atende)"], fV, null, true);
    } else {
      ctx.pendencia("aq.acumulacao.volumes_comerciais[≥ " + Math.ceil(vn) + " L]", "nenhum volume comercial da tabela atende " + f2(vn) + " L: escolher no catálogo do fabricante e informar entrada.aguaQuente.aquecimento.volumeAdotado_L", "água quente — volume comercial");
      verif("aquecedor", "volume do reservatório térmico", null, vn, "L", null, ["pendente: volume comercial acima da tabela"], fV);
      r.passos.push("pendente: nenhum volume comercial da tabela ≥ " + f2(vn) + " L");
    }
    /* potência de recuperação (física): P = ρ·c·V·(t_aq − t_fria) / t_rec */
    if (aqc.tipo === "acumulacao") {
      var trec = num(aqc.tempoRecuperacao_h, null);
      if (trec == null || !(trec > 0)) ctx.pendencia("entrada.aguaQuente.aquecimento.tempoRecuperacao_h", "tempo de recuperação do reservatório não informado: a potência do aquecedor não foi calculada", "água quente — potência");
      else if (r.volumeAdotado_L != null && T.t_aquecedor != null && T.t_fria != null) {
        var rho = H.agua(T.t_fria).rho, m = rho * r.volumeAdotado_L / LS;
        r.potencia_kW = m * C_AGUA_KJ_KG_K * (T.t_aquecedor - T.t_fria) / (trec * S_POR_H);
        r.passos.push("P = ρ·V·c·ΔT / t = " + f2(rho) + " × " + f3(r.volumeAdotado_L / LS) + " m³ × " + C_AGUA_KJ_KG_K + " kJ/(kg·K) × " + (T.t_aquecedor - T.t_fria) + " K / (" + trec + " h × 3600 s/h) = " + f2(r.potencia_kW) + " kW");
      }
    }
    if (aqc.tipo === "solar") {
      var cl = ctx.linhas("aq.solar.coletor", null, "água quente — coletor solar");
      var lin = cl ? cl.filter(function (x) { return num(aqc.coletorArea_m2, null) == null || num(x.area_m2, null) === num(aqc.coletorArea_m2, null); })[0] : null;
      if (!lin) { if (cl) ctx.pendencia("aq.solar.coletor[" + aqc.coletorArea_m2 + " m²]", "coletor de " + aqc.coletorArea_m2 + " m² não está na tabela de produção", "água quente — solar"); }
      else if (r.volumeAdotado_L != null) {
        r.nColetores = Math.ceil(r.volumeAdotado_L / num(lin.producao_l_dia, 1));
        r.coletor = { area_m2: num(lin.area_m2, null), producao_l_dia: num(lin.producao_l_dia, null), obs: lin.obs || "" };
        r.areaColetores_m2 = r.nColetores * r.coletor.area_m2;
        r.passos.push("nº de coletores = V / produção de um coletor = " + r.volumeAdotado_L + " / " + lin.producao_l_dia + " = " + f2(r.volumeAdotado_L / num(lin.producao_l_dia, 1)) + " → " + r.nColetores + " coletores de " + f2(lin.area_m2) + " m² (" + f2(r.areaColetores_m2) + " m²)");
        if (num(aqc.coletorArea_m2, null) == null) premissa("coletor solar", "o primeiro da tabela (" + f2(lin.area_m2) + " m², " + lin.producao_l_dia + " L/dia) — informe entrada.aguaQuente.aquecimento.coletorArea_m2 para outro");
        if (/conferir/i.test(String(lin.obs || ""))) aviso(out.avisos, "aviso", "a produção do coletor de " + f2(lin.area_m2) + " m² está marcada 'conferir com o fabricante' na fonte", [], { texto: "confirmar a produção diária no catálogo do coletor" });
      }
    }
    r.status = out.verificacoes.some(function (v) { return v.alvo === "aquecedor" && v.status === "reprovado"; }) ? "reprovado" : (r.volumeAdotado_L != null && (aqc.tipo !== "acumulacao" || r.potencia_kW != null) && (aqc.tipo !== "solar" || r.nColetores != null) ? "ok" : "pendente");
    return r;
  }

  /* ------------------------------------------------ passagem (roteiro do fabricante) */
  function passagem(cfg, ctx, out, verif) {
    var r = { tipo: "passagem", passos: [], status: "pendente" }, aqd = cfg.aquecedor || {};
    var qt = null;
    if (arr(cfg.pecasSimultaneas).length) {
      qt = 0; var falta = false;
      arr(cfg.pecasSimultaneas).forEach(function (p) { var c = aparelhoAQ(ctx, p.aparelho, "vazao_ls", "água quente — aquecedor de passagem", out); if (!c.ok) { falta = true; return; } var q = num(c.valor, 0) * S_POR_MIN * num(p.n, 1); qt += q; r.passos.push(num(p.n, 1) + " × " + p.aparelho + " " + f2(num(c.valor, 0) * S_POR_MIN) + " L/min = " + f2(q) + " L/min"); });
      if (falta) qt = null;
    } else if (arr(out.pontos).length) {
      qt = 0; arr(out.pontos).forEach(function (p) { if (p.vazao_ls == null) qt = null; else if (qt != null) qt += p.vazao_ls * S_POR_MIN; });
      if (qt != null) r.passos.push("Qt = Σ vazões dos pontos de água quente do modelo = " + f2(qt) + " L/min");
    }
    if (qt == null) { r.passos.push("pendente: vazões dos pontos de água quente"); return r; }
    var cf = ctx.consulta("aq.passagem.fator_vazao", null, "valor", "água quente — aquecedor de passagem");
    if (!cf.ok) return r;
    r.Qt_lmin = qt; r.Qnec_lmin = qt * num(cf.valor, 0);
    r.passos.push("Qnec = Qt × " + cf.valor + " = " + f2(r.Qnec_lmin) + " L/min (regra do fabricante: a água quente é misturada com a fria)");
    var qa = num(aqd.vazao_l_min, null);
    if (qa == null || !(qa > 0)) { ctx.consulta("aq.vazao_aquecedor_passagem_por_delta_t", null, "valor", "água quente — escolha do aquecedor de passagem"); r.passos.push("pendente: vazão nominal do aquecedor (catálogo)"); return r; }
    r.nAquecedores = Math.ceil(r.Qnec_lmin / qa); r.aquecedor = { nome: aqd.nome || null, vazao_l_min: qa, fonte: aqd.fonte || null };
    r.passos.push("nº de aquecedores = Qnec / Q do aquecedor = " + f2(r.Qnec_lmin) + " / " + f2(qa) + " = " + f2(r.Qnec_lmin / qa) + " → " + r.nAquecedores + " em paralelo" + (aqd.nome ? " (" + aqd.nome + ")" : ""));
    if (!aqd.fonte) aviso(out.avisos, "aviso", "aquecedor de passagem sem a fonte da vazão nominal (catálogo)", [], { texto: "informar entrada.aguaQuente.aquecedor.fonte (catálogo, página)" });
    verif("aquecedor", "capacidade dos aquecedores de passagem", r.nAquecedores * qa, r.Qnec_lmin, "L/min", r.nAquecedores * qa >= r.Qnec_lmin, ["n × Q = " + r.nAquecedores + " × " + f2(qa) + " = " + f2(r.nAquecedores * qa) + " L/min ≥ " + f2(r.Qnec_lmin) + " L/min"], cf.fonte, null, true);
    r.status = "ok"; return r;
  }
  function verifPressaoAquecedor(cfg, out, verif, af) {
    var aqd = cfg.aquecedor || {}, al = out.alimentacao || {};
    if (num(aqd.pressaoMin_kpa, null) == null) return;
    var pt = arr(af.pontos).filter(function (p) { return p.famInst === (cfg.alimentacao || {}).entradaAF; })[0];
    if (!pt || pt.pressaoDinamica_kpa == null) return;
    var ok = pt.pressaoDinamica_kpa >= num(aqd.pressaoMin_kpa, 0);
    verif((cfg.alimentacao || {}).entradaAF, "pressão mínima de funcionamento do aquecedor", pt.pressaoDinamica_kpa, num(aqd.pressaoMin_kpa, 0), "kPa", ok, ["p na entrada (água fria) = " + f2(pt.pressaoDinamica_kpa) + " kPa ≥ " + f2(aqd.pressaoMin_kpa) + " kPa (" + (aqd.fonte || "catálogo informado") + ")"], aqd.fonte ? { doc: aqd.fonte, tipo: "secundaria", norma: "catálogo do fabricante" } : null, null, true);
    if (!ok) aviso(out.avisos, "erro", "pressão na entrada do aquecedor (" + f2(pt.pressaoDinamica_kpa) + " kPa) abaixo da mínima de funcionamento (" + f2(aqd.pressaoMin_kpa) + " kPa)", [(cfg.alimentacao || {}).entradaAF], { texto: "elevar o reservatório, pressurizar a água fria do aquecedor ou escolher aquecedor de baixa pressão" });
    void al;
  }

  /* ------------------------------------------------ caminho de cada ponto (comprimento e volume) */
  function caminhos(out) {
    var porPara = {}; arr(out.trechos).forEach(function (t) { if (t.para) porPara[t.para] = t; });
    var src = out.alimentacao ? out.alimentacao.no : null;
    return arr(out.pontos).map(function (p) {
      var n = p.no, L = 0, V = 0, semDi = false, guarda = 0;
      while (n !== src && porPara[n] && guarda++ <= arr(out.trechos).length) {
        var t = porPara[n]; L += num(t.comprimento_m, 0);
        if (t.di_mm != null) V += Math.PI * Math.pow(t.di_mm / MM, 2) / 4 * num(t.comprimento_m, 0) * LS; else semDi = true;   // hid:ok área do círculo πD²/4
        n = t.de;
      }
      return { famInst: p.famInst, aparelho: p.aparelho, comprimento_m: L, volume_L: semDi ? null : V };
    });
  }
  function recirculacao(cfg, ctx, out, verif, premissa) {
    var cs = caminhos(out); if (!cs.length) return;
    cs.sort(function (a, b) { return b.comprimento_m - a.comprimento_m; });
    var pior = cs[0], lim = null, fonte = null, origem = null;
    var c = NR().consulta("aq.recirculacao.distancia_maxima", null, "valor");
    if (c.ok) { ctx.consulta("aq.recirculacao.distancia_maxima", null, "valor", "água quente — retorno"); lim = num(c.valor, null); fonte = c.fonte; origem = "norma"; }
    else if (num(cfg.distanciaMaxSemRetorno_m, null) != null && cfg.fonteDistancia) {
      lim = num(cfg.distanciaMaxSemRetorno_m, null); origem = "entrada"; fonte = { doc: String(cfg.fonteDistancia), tipo: "informada pelo projetista", norma: "informado pelo projetista" };
      premissa("comprimento máximo sem retorno", lim + " m — informado pelo projetista (" + cfg.fonteDistancia + ")", "entrada");
    }
    out.recirculacao = { pontos: cs, maior: pior, limite_m: lim, origemLimite: origem };
    var passos = ["maior comprimento aquecedor → ponto: " + f2(pior.comprimento_m) + " m (" + pior.famInst + ")" + (pior.volume_L != null ? "; água parada no tubo até lá: " + f2(pior.volume_L) + " L" : "")];
    if (lim == null) {
      ctx.pendencia("aq.recirculacao.distancia_maxima", (c.motivo || "sem fonte") + " — informe entrada.aguaQuente.distanciaMaxSemRetorno_m COM a fonte (entrada.aguaQuente.fonteDistancia)", "água quente — retorno");
      verif(pior.famInst, "comprimento sem retorno (recirculação)", pior.comprimento_m, null, "m", null, passos.concat(["pendente: limite de comprimento sem retorno sem fonte"]), null);
      return;
    }
    var ok = pior.comprimento_m <= lim;
    out.recirculacao.precisaRetorno = !ok;
    verif(pior.famInst, "comprimento sem retorno (recirculação)", pior.comprimento_m, lim, "m", ok, passos.concat([f2(pior.comprimento_m) + " m " + (ok ? "≤ " : "> ") + f2(lim) + " m"]), fonte);
    if (!ok) {
      var ppr = arr(out.trechos).some(function (t) { return t.material === "ppr"; }), car = ppr ? caracteristicas("ppr", "caracteristicas") : null;
      aviso(out.avisos, "erro", "ponto " + pior.famInst + " a " + f2(pior.comprimento_m) + " m do aquecedor (limite " + f2(lim) + " m): precisa de retorno (recirculação)", [pior.famInst],
            { texto: "prever rede de retorno com bomba de recirculação, ou aproximar o aquecedor dos pontos" + (car && car.dados && /recircula/.test(String(car.dados.restricao || "")) ? " — a ficha do PPR do catálogo restringe o uso em recirculação: usar CPVC/cobre no retorno" : "") });
    }
  }

  /* dilatação (ΔL = α·L·ΔT) e pressão de serviço do tubo na temperatura (catálogo) */
  function dilatacaoEPressao(cfg, ctx, out, verif, T, premissa) {
    var tInst = num(cfg.temperaturaInstalacao_C, null);
    if (tInst == null && T.t_fria != null) { tInst = T.t_fria; premissa("temperatura de instalação (dilatação)", tInst + " °C (a da água fria da equação de mistura)"); }
    var mats = {};
    arr(out.trechos).forEach(function (t) {
      if (t.tipo !== "tubo") return;
      mats[t.material] = 1;
      var car = caracteristicas(t.material, "caracteristicas"), d = car ? car.dados || {} : {};
      var aMm = num(d.dilatacaoTermicaLinear_mm_por_m_C, null), aM = num(d.dilatacaoTermicaLinear_m_por_m_C, null), alfa = aMm != null ? aMm : (aM != null ? aM * MM : null);
      var item = { trecho: t.id, aresta: t.aresta, material: t.material, comprimento_m: t.comprimento_m, alfa_mm_m_C: alfa, deltaT_C: T.t_aquecedor != null && tInst != null ? T.t_aquecedor - tInst : null, deltaL_mm: null };
      if (alfa != null && item.deltaT_C != null) item.deltaL_mm = alfa * num(t.comprimento_m, 0) * item.deltaT_C;
      out.dilatacao.push(item);
    });
    if (out.dilatacao.some(function (x) { return x.deltaL_mm == null; })) aviso(out.avisos, "info", "dilatação térmica não calculada em parte dos trechos: coeficiente do material ou temperatura sem fonte (catálogo não carregado)", [], { texto: "gerar o catálogo do tubo (js/hidcatalogo.js) ou informar as temperaturas" });
    else if (out.dilatacao.length) aviso(out.avisos, "info", "dilatação térmica: maior ΔL = " + f2(Math.max.apply(null, out.dilatacao.map(function (x) { return x.deltaL_mm; }))) + " mm — prever liras/juntas de expansão conforme o fabricante (tabela de liras com unidade a conferir na fonte)", [], null);
    /* pressão de serviço: a maior estática da rede contra a do tubo na temperatura */
    /* a maior estática da REDE (todos os nós: a verificação "pressão estática máxima" do HidAF) — tubo que corre abaixo dos
       pontos tem estática maior que a deles (revisão fase 2, B1). Sem nível máximo ela está pendente → aqui também. */
    var vEst = arr(out.rede && out.rede.verificacoes).filter(function (v) { return v.nome === "pressão estática máxima"; })[0];
    var pEst = vEst && vEst.valor != null ? vEst.valor : null;
    Object.keys(mats).forEach(function (m) {
      var ps = pressaoServico(m, T.t_aquecedor, cfg), alvo = "tubos " + m;
      if (!ps) {
        ctx.pendencia("catalogo." + m + ".pressao_servico", "pressão de serviço do tubo " + m + " na temperatura da água quente: catálogo não carregado ou sem a classe", "água quente — tubo");
        verif(alvo, "pressão de serviço do tubo na temperatura", pEst, null, "kPa", null, ["pendente: pressão de serviço do tubo (catálogo)"], null); return;
      }
      if (ps.foraTemp) { verif(alvo, "temperatura máxima do tubo", T.t_aquecedor, ps.tMax, "°C", false, ["água a " + T.t_aquecedor + " °C acima da máxima do tubo (" + ps.tMax + " °C)"], ps.fonte); return; }
      out.pressaoTubo.push({ material: m, pressao_kpa: ps.kpa, temperatura_C: ps.tLinha, classe: ps.classe });
      if (pEst == null) { verif(alvo, "pressão de serviço do tubo na temperatura", null, ps.kpa, "kPa", null, ["pendente: pressão estática da rede de água quente não calculada"], ps.fonte); return; }
      var ok = pEst <= ps.kpa;
      verif(alvo, "pressão de serviço do tubo na temperatura", pEst, ps.kpa, "kPa", ok, ["maior pressão estática da água quente " + f2(pEst) + " kPa ≤ pressão de serviço " + f2(ps.kpa) + " kPa (" + (ps.classe || m) + " a " + ps.tLinha + " °C, linha da tabela não abaixo da temperatura da água)"], ps.fonte);
      if (!ok) aviso(out.avisos, "erro", "pressão estática " + f2(pEst) + " kPa acima da pressão de serviço do tubo " + m + " a " + ps.tLinha + " °C (" + f2(ps.kpa) + " kPa)", [], { texto: "classe de pressão maior, outro material ou válvula redutora de pressão" });
    });
  }
  /* pressão de serviço do catálogo: a linha de temperatura NÃO ABAIXO da temperatura da água (lado seguro) */
  function pressaoServico(material, t, cfg) {
    if (t == null) return null;
    var C0 = CAT(); if (!C0) return null;
    var fonteCat = function (pag) { var it = C0.itens({ fonteJson: TUBO_CATALOGO[material].json })[0], F = it ? C0.fonte(it) : null; return F ? { doc: F.fabricante + " — " + F.linha + " (" + (F.edicao || "") + ")", pagina: pag, url: F.url, tipo: "secundaria", norma: "catálogo do fabricante" } : null; };
    if (material === "ppr") {
      var cp = caracteristicas("ppr", "classesPressao"); if (!cp) return null;
      var cl = arr(cp.dados).filter(function (x) { return x.classe === "PN" + cfg.classePPR; })[0]; if (!cl) return null;
      if (num(cl.temperaturaMaxima_C, null) != null && t > cl.temperaturaMaxima_C) return { foraTemp: true, tMax: cl.temperaturaMaxima_C, fonte: fonteCat(cp.pagina) };
      var linhas = Object.keys(cl).map(function (k) { var m = /^pressao(\d+)C_kgf_cm2$/.exec(k); return m ? { t: Number(m[1]), v: num(cl[k], null) } : null; }).filter(function (x) { return x && x.v != null && x.t >= t; }).sort(function (a, b) { return a.t - b.t; });
      if (!linhas.length) return null;
      return { kpa: linhas[0].v * KPA_POR_KGF_CM2, tLinha: linhas[0].t, classe: cl.classe, fonte: fonteCat(cp.pagina) };
    }
    if (material === "cpvc") {
      var tb = caracteristicas("cpvc", "pressaoOperacaoAguaQuenteSDR11_kgf_cm2"); if (!tb) return null;
      var ls = Object.keys(tb.dados || {}).map(function (k) { var m = /^(?:\d+-)?(\d+)C$/.exec(k); return m ? { t: Number(m[1]), v: num(tb.dados[k], null) } : null; }).filter(function (x) { return x && x.v != null; }).sort(function (a, b) { return a.t - b.t; });
      var ac = ls.filter(function (x) { return x.t >= t; });
      if (!ac.length) return ls.length ? { foraTemp: true, tMax: ls[ls.length - 1].t, fonte: fonteCat(tb.pagina) } : null;
      return { kpa: ac[0].v * KPA_POR_KGF_CM2, tLinha: ac[0].t, classe: "SDR11", fonte: fonteCat(tb.pagina) };
    }
    return null;
  }
  function isolamento(ctx, out) {
    var ls = ctx.linhas("aq.isolamento_termico_e_perda_calor", null, "água quente — isolamento");
    var ex = ls ? ls.filter(function (x) { return /^Exigência normativa/.test(String(x.item || "")); })[0] : null;
    out.isolamento = { exigencia: ex ? ex.valor : null, obs: ex ? ex.obs : null, fonte: NR().fonte("aq.isolamento_termico_e_perda_calor"), perdaCalor: "não calculada — a fórmula de perda de calor não está na fonte (pendente aq.perda_calor_formula)" };
    aviso(out.avisos, "info", "isolamento térmico em toda a extensão da rede de água quente" + (ex ? " (" + ex.valor + ")" : "") + "; a perda de calor não foi calculada (fórmula pendente na fonte)", [], { texto: "especificar o isolamento na prancha e no quantitativo" });
  }

  /* ------------------------------------------------ requisitos da NBR 5626:2020 para a água quente
   * (texto conferido em 17/10/2026; aq2020.* em dados-fonte/hidro/normas/nbr5626-2020-aq.json). */
  var CORPORAL = { chuveiro: 1, lavatorio: 1, banheira: 1, bide: 1, ducha_higienica: 1 };
  var USO_38 = { creche: 1, hospital: 1, ambulatorio: 1, escola_externato: 1, escola_semi_internato: 1, escola_internato: 1 };
  function requisitos2020(cfg, ctx, out, verif, T, extra, R, entrada) {
    function t20(p) { var c = ctx.consulta("aq2020.temperaturas", { parametro: p }, "valor", "água quente — NBR 5626:2020"); return c.ok ? { v: num(c.valor, null), fonte: c.fonte, item: c.linha.item } : null; }
    var ta = T.t_aquecedor, aqd = cfg.aquecedor || {}, aqc = cfg.aquecimento || {};
    /* 6.10.3: em ambiente sanitário com misturador convencional, ≤ 70 °C; acima, limitador automático */
    var l70 = t20("sanitario_misturador_convencional_max");
    if (l70 && ta != null) {
      var ok70 = ta <= l70.v || cfg.limitadorTemperatura === true;
      verif("aquecedor", "temperatura em ambiente sanitário com misturador convencional", ta, l70.v, "°C", ok70, [ta + " °C " + (ta <= l70.v ? "≤ " + l70.v + " °C" : "> " + l70.v + " °C" + (cfg.limitadorTemperatura === true ? " — com limitador automático declarado" : " — sem limitador automático")) + " (" + l70.item + ")"], l70.fonte);
      if (!ok70) aviso(out.avisos, "erro", "água a " + ta + " °C acima de " + l70.v + " °C em ambiente sanitário com misturador convencional (NBR 5626:2020 " + l70.item + ")", [], { texto: "instalar limitador automático de temperatura (entrada.aguaQuente.limitadorTemperatura = true) ou baixar a temperatura do aquecedor" });
    }
    /* 6.10.4.3: ponto de uso corporal que pode passar de 45 °C → limitador automático de 45 °C */
    var l45 = t20("uso_corporal_limitador"), corp = arr(out.pontos).filter(function (p) { return CORPORAL[p.aparelho]; });
    if (l45 && ta != null && ta > l45.v && corp.length) {
      var com = {}; arr(cfg.limitador45).forEach(function (id) { com[id] = 1; });
      corp.forEach(function (p) {
        var okP = cfg.limitador45 === true || !!com[p.famInst];
        verif(p.famInst, "limitador automático de " + l45.v + " °C no ponto de uso corporal", okP ? 1 : 0, 1, "un", okP, ["a água pode chegar a " + ta + " °C (> " + l45.v + " °C) no " + p.aparelho + ": " + (okP ? "limitador declarado" : "sem limitador automático") + " (" + l45.item + ")"], l45.fonte);
        if (!okP) aviso(out.avisos, "erro", "ponto " + p.famInst + " (" + p.aparelho + ") pode passar de " + l45.v + " °C sem limitador automático (NBR 5626:2020 " + l45.item + ")", [p.famInst], { texto: "prever misturador termostático/limitador de " + l45.v + " °C no ponto (entrada.aguaQuente.limitador45: [" + p.famInst + "])" });
      });
    }
    /* 6.10.4.4 (NOTA): 38 °C recomendado em ducha higiênica, creche, clínica e hospital — aviso */
    var l38 = t20("recomendada_ducha_infantil_saude"), uso = cfg.uso || (extra.programa && extra.programa.uso) || null;
    var temDucha = arr(out.pontos).some(function (p) { return p.aparelho === "ducha_higienica"; });
    if (l38 && ta != null && ta > l38.v && (USO_38[uso] || temDucha)) aviso(out.avisos, "aviso", "recomendado no máximo " + l38.v + " °C " + (temDucha ? "na ducha higiênica" : "em " + uso) + " (NBR 5626:2020 " + l38.item + ", nota)", [], { texto: "limitar a " + l38.v + " °C nesses pontos" });
    /* 6.10.2 e 6.10.7.1: acima de 70 °C identificar/isolar/proteger; acima de 90 °C precauções */
    var l70b = t20("identificar_isolar_proteger_acima"), l90 = t20("precaucoes_acima");
    if (l70b && ta != null && ta > l70b.v) aviso(out.avisos, "aviso", "trecho que pode passar de " + l70b.v + " °C: identificar, isolar e proteger (NBR 5626:2020 " + l70b.item + ")", [], { texto: "sinalizar e proteger os trechos quentes na prancha" });
    if (l90 && ta != null && ta > l90.v) aviso(out.avisos, "erro", "água acima de " + l90.v + " °C: exige precauções específicas (NBR 5626:2020 " + l90.item + ")", [], { texto: "rever a temperatura do aquecedor" });
    /* 6.12.3: isolamento em toda a extensão (o modelo não marca isolamento no tubo: o projetista declara) + D.3.5 */
    var iso = ctx.consulta("aq2020.isolamento", { parametro: "toda_extensao" }, "valor", "água quente — isolamento");
    if (iso.ok && arr(out.trechos).length) {
      var okI = cfg.isolamento === true;
      verif("rede de água quente", "isolamento térmico em toda a extensão", okI ? 1 : null, 1, "", okI ? true : null, [okI ? "isolamento em toda a extensão declarado (" + iso.linha.item + ")" : "pendente: o modelo não informa o isolamento — declare entrada.aguaQuente.isolamento = true com a especificação (" + iso.linha.item + ")"], iso.fonte);
      if (!okI) ctx.pendencia("entrada.aguaQuente.isolamento", "isolamento térmico em toda a extensão da água quente não informado (NBR 5626:2020 6.12.3)", "água quente — isolamento");
      var d35 = ctx.consulta("aq2020.isolamento", { parametro: "trecho_sem_recirculacao_m" }, "valor", "água quente — isolamento");
      var rc = out.recirculacao;
      if (d35.ok && rc && rc.maior && !rc.precisaRetorno && rc.maior.comprimento_m > num(d35.valor, 0) && !okI) aviso(out.avisos, "aviso", "sem recirculação, trecho de " + f2(rc.maior.comprimento_m) + " m após o aquecedor (> " + d35.valor + " m): a norma recomenda isolar (" + d35.linha.item + ")", [], { texto: "especificar isolamento" });
    }
    /* 6.13.1.3: aquecedor de passagem — vazão mínima e pressão dinâmica mínima de operação do catálogo (pendente se faltar) */
    if (aqc.tipo === "passagem") {
      var dA = ctx.consulta("aq2020.aquecedor", { parametro: "dados_do_aquecedor" }, "valor", "água quente — aquecedor");
      if (num(aqd.pressaoMin_kpa, null) == null) { ctx.pendencia("entrada.aguaQuente.aquecedor.pressaoMin_kpa", "pressão dinâmica mínima de operação do aquecedor (catálogo) não informada (NBR 5626:2020 6.13.1.3)", "água quente — aquecedor"); verif("aquecedor", "pressão mínima de funcionamento do aquecedor", null, null, "kPa", null, ["pendente: catálogo do aquecedor"], dA.ok ? dA.fonte : null); }
      var qmin = num(aqd.vazaoMin_l_min, null), ptA = extra.af ? arr(extra.af.pontos).filter(function (p) { return p.famInst === (cfg.alimentacao || {}).entradaAF; })[0] : null;
      if (qmin == null) { ctx.pendencia("entrada.aguaQuente.aquecedor.vazaoMin_l_min", "vazão mínima de operação do aquecedor (catálogo) não informada (NBR 5626:2020 6.13.1.3)", "água quente — aquecedor"); verif("aquecedor", "vazão mínima de operação do aquecedor", null, null, "L/min", null, ["pendente: catálogo do aquecedor"], dA.ok ? dA.fonte : null); }
      else {
        /* o ponto que mais exige: o de menor vazão que liga sozinho */
        var qPts = arr(out.pontos).map(function (p) { return p.vazao_ls; }).filter(function (q) { return q != null; });
        if (qPts.length) { var qm = Math.min.apply(null, qPts) * S_POR_MIN, okQ = qm >= qmin;
          verif("aquecedor", "vazão mínima de operação do aquecedor", qm, qmin, "L/min", okQ, ["menor vazão de um ponto sozinho " + f2(qm) + " L/min " + (okQ ? "≥" : "<") + " " + f2(qmin) + " L/min do aquecedor (6.13.1.3)"], dA.ok ? dA.fonte : null, null, true);
          if (!okQ) aviso(out.avisos, "erro", "o aquecedor de passagem não acende com um ponto sozinho (" + f2(qm) + " < " + f2(qmin) + " L/min)", [], { texto: "aquecedor com vazão mínima menor ou acumulação" }); }
      }
      void ptA;
    }
    /* 6.13.2.6: válvula de alívio P/T ≥ 500 L/h no aquecimento indireto */
    if (aqc.indireto === true) {
      var va = ctx.consulta("aq2020.aquecedor", { parametro: "valvula_alivio_descarga_min" }, "valor", "água quente — válvula de alívio");
      if (va.ok) {
        var vd = num(cfg.valvulaAlivio_l_h, null);
        if (vd == null) { ctx.pendencia("entrada.aguaQuente.valvulaAlivio_l_h", "vazão de descarga da válvula de alívio de pressão e temperatura não informada (NBR 5626:2020 6.13.2.6)", "água quente — segurança"); verif("aquecedor", "válvula de alívio de P/T (descarga)", null, num(va.valor, 0), "L/h", null, ["pendente: válvula de alívio do catálogo"], va.fonte); }
        else verif("aquecedor", "válvula de alívio de P/T (descarga)", vd, num(va.valor, 0), "L/h", vd >= num(va.valor, 0), [f2(vd) + " L/h " + (vd >= num(va.valor, 0) ? "≥" : "<") + " " + va.valor + " L/h (" + va.linha.item + ")"], va.fonte, null, true);
      }
    }
    /* 6.13.1.5: AF que alimenta o reservatório de AQ — aviso com a expansão térmica (física: V·(ρf/ρq − 1)) */
    if ((aqc.tipo === "acumulacao" || aqc.tipo === "solar") && out.aquecimento && out.aquecimento.volumeAdotado_L != null && ta != null && T.t_fria != null) {
      var ar5 = ctx.consulta("aq2020.aquecedor", { parametro: "af_alimentacao_reservatorio" }, "valor", "água quente — alimentação do reservatório");
      var H = HH(), vexp = out.aquecimento.volumeAdotado_L * (H.agua(T.t_fria).rho / H.agua(ta).rho - 1);
      out.aquecimento.expansaoTermica_L = vexp;
      if (ar5.ok) aviso(out.avisos, "aviso", "trecho horizontal de AF que alimenta o reservatório de AQ: sem isolamento, de material resistente à água quente, com volume ≥ " + f2(vexp) + " L (expansão de " + out.aquecimento.volumeAdotado_L + " L de " + T.t_fria + " a " + ta + " °C) — NBR 5626:2020 " + ar5.linha.item, [], { texto: "especificar o trecho na prancha" });
    }
    /* 6.10.4.1: a AF que alimenta aquecedor ou misturador não alimenta válvula de descarga */
    var af = extra.af;
    if (af) {
      var r61 = ctx.consulta("aq2020.aquecedor", { parametro: "af_aquecedor_sem_valvula_descarga" }, "valor", "água quente — escaldamento");
      var porPara = {}; arr(af.trechos).forEach(function (t) { if (t.para) porPara[t.para] = t; });
      var apl = {}; arr(R && R.trechos).forEach(function (t) { apl[t.id] = t.aplicacao; });
      var src = af.alimentacao ? af.alimentacao.no : null;
      function cam(no) { var l = [], g = 0; while (no !== src && porPara[no] && g++ <= arr(af.trechos).length) { var t = porPara[no]; l.push(t); no = t.de; } return l; }
      /* barrilete (a saída do reservatório e o que estiver marcado "reservacao") é comum a todos: não conta */
      function conta(t) { return t.de !== src && apl[t.id] !== "reservacao"; }
      var quentes = arr(af.pontos).filter(function (p) { return p.famInst === (cfg.alimentacao || {}).entradaAF || arr(out.pontos).some(function (q) { return q.famInst === p.famInst; }); });
      var valvulas = arr(af.pontos).filter(function (p) { return p.aparelho === "bacia_valvula"; });
      var conflitos = [];
      valvulas.forEach(function (vv) {
        var tv = {}; cam(vv.no).filter(conta).forEach(function (t) { tv[t.aresta || t.id] = t.id; });
        quentes.forEach(function (q) { var com = cam(q.no).filter(conta).filter(function (t) { return tv[t.aresta || t.id]; }); if (com.length) conflitos.push({ valvula: vv.famInst, quente: q.famInst, trechos: com.map(function (t) { return t.id; }) }); });
      });
      if (valvulas.length && quentes.length && r61.ok) {
        verif("rede de água fria", "válvula de descarga fora da AF do aquecedor/misturador", conflitos.length, 0, "", conflitos.length === 0, [conflitos.length ? conflitos.map(function (c) { return "válvula " + c.valvula + " e " + c.quente + " pelos trechos " + c.trechos.join(", "); }).join("; ") + " (" + r61.linha.item + ")" : "nenhuma válvula de descarga na AF do aquecedor/misturador, fora do barrilete (" + r61.linha.item + ")"], r61.fonte);
        conflitos.forEach(function (c) { aviso(out.avisos, "erro", "a válvula de descarga " + c.valvula + " é alimentada pela mesma AF de " + c.quente + " (risco de escaldamento, NBR 5626:2020 " + r61.linha.item + ")", [c.valvula, c.quente].concat(c.trechos), { texto: "coluna/ramal exclusivo para as válvulas de descarga, saindo do barrilete" }); });
        premissa0(out, "6.10.4.1 na rede", "o barrilete (trecho que sai do reservatório ou marcado 'reservacao') é comum; qualquer outro trecho compartilhado entre válvula de descarga e aquecedor/misturador reprova");
      }
    }
  }
  function premissa0(out, item, valor) { if (!out.premissas.some(function (p) { return p.item === item; })) out.premissas.push({ item: item, valor: valor, origem: "padrao_motor" }); }

  /* ------------------------------------------------ misturadores (depois das duas redes) */
  function misturadores(af, aq, cfg, ctx) {
    cfg = cfg || {};
    var res = [], vs = [];
    if (!af || !aq) return { lista: res, verificacoes: vs };
    var pAF = {}; arr(af.pontos).forEach(function (p) { pAF[p.famInst] = p; });
    var lim = null, fonte = null, c = NR().consulta("aq.misturador.diferenca_max_kpa", null, "valor");
    if (c.ok) { ctx.consulta("aq.misturador.diferenca_max_kpa", null, "valor", "água quente — misturadores"); lim = num(c.valor, null); fonte = c.fonte; }
    else if (num(cfg.difPressaoMisturador_kpa, null) != null && cfg.fonteDifPressao) { lim = num(cfg.difPressaoMisturador_kpa, null); fonte = { doc: String(cfg.fonteDifPressao), tipo: "informada pelo projetista", norma: "informado pelo projetista" }; }
    arr(aq.pontos).forEach(function (q) {
      var f = pAF[q.famInst]; if (!f) return;
      var it = { famInst: q.famInst, aparelho: q.aparelho, pAF_kpa: f.pressaoDinamica_kpa, pAQ_kpa: q.pressaoDinamica_kpa, dif_kpa: null, limite_kpa: lim };
      var id = "aq-m" + vs.length, v = { id: id, sistema: "agua_quente", alvo: q.famInst, nome: "misturador: diferença de pressão água fria × quente", unidade: "kPa", fonte: fonte };
      if (f.pressaoDinamica_kpa == null || q.pressaoDinamica_kpa == null) { v.valor = null; v.limite = lim; v.ok = null; v.eta = null; v.status = "pendente"; v.passos = ["pendente: pressão da água fria ou da quente no ponto não calculada"]; }
      else {
        it.dif_kpa = Math.abs(f.pressaoDinamica_kpa - q.pressaoDinamica_kpa);
        v.valor = it.dif_kpa; v.limite = lim;
        var p0 = "p AF = " + f2(f.pressaoDinamica_kpa) + " kPa; p AQ = " + f2(q.pressaoDinamica_kpa) + " kPa; |Δp| = " + f2(it.dif_kpa) + " kPa";
        if (lim == null) { v.ok = null; v.eta = null; v.status = "pendente"; v.passos = [p0, "pendente: diferença máxima admissível sem fonte (informe entrada.aguaQuente.difPressaoMisturador_kpa com a fonte)"]; }
        else { v.ok = it.dif_kpa <= lim; v.eta = lim > 0 ? it.dif_kpa / lim : null; v.status = v.ok ? "ok" : "reprovado"; v.passos = [p0 + (v.ok ? " ≤ " : " > ") + f2(lim) + " kPa"]; }
      }
      it.status = v.status; res.push(it); vs.push(v);
    });
    if (vs.some(function (v) { return v.status === "pendente" && v.passos.length > 1; })) ctx.pendencia("aq.misturador.diferenca_max_kpa", (c.motivo || "sem fonte") + " — informe entrada.aguaQuente.difPressaoMisturador_kpa COM a fonte (entrada.aguaQuente.fonteDifPressao)", "misturadores");
    return { lista: res, verificacoes: vs };
  }

  /* demanda da água quente na saída do aquecedor (o orquestrador põe na água fria como consumo da entrada do aquecedor) */
  function demanda(aq) {
    var src = aq && aq.alimentacao ? aq.alimentacao.no : null; if (!src) return null;
    var ts = arr(aq.trechos).filter(function (t) { return t.de === src; });
    if (!ts.length || ts.some(function (t) { return t.vazao_ls == null; })) return null;
    return { vazao_ls: ts.reduce(function (s, t) { return s + t.vazao_ls; }, 0), peso: ts.reduce(function (s, t) { return s + num(t.somaPesos, 0); }, 0) };
  }

  var HidAQ = { VERSAO: 1, FONTES_VAZAO: FONTES_VAZAO, TUBO_CATALOGO: TUBO_CATALOGO, calcular: calcular, misturadores: misturadores, demanda: demanda, pressaoServico: pressaoServico };
  global.HidAQ = HidAQ;
  if (typeof module !== "undefined" && module.exports) module.exports = HidAQ;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
