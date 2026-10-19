/* =====================================================================
 * climsistema.js — ESCOLHA DA SOLUÇÃO de climatização (frente C1).
 * Motor PURO, ES5, Node-testável. Contrato: docs/hidro/CONTRATO-CLIMA.md.
 *
 * Por ambiente devolve até 3 soluções VIÁVEIS (janela, hi-wall, piso-teto,
 * cassete, duto) com a justificativa e o que impede as outras; para o
 * conjunto devolve as soluções CENTRAIS (multi-split, VRF; chiller+fancoil e
 * self só por pedido) com a simultaneidade declarada e quantas condensadoras
 * saem da fachada. Ambiente que não se climatiza (banheiro, circulação,
 * serviço) recebe a ventilação/exaustão.
 *
 * ⚠ Sem PESO numérico inventado: o desempate é LEXICOGRÁFICO pela ordem de
 *   prioridade do usuário (custo → ruído → estética, padrão) sobre ORDENS
 *   RELATIVAS por tipo (ORDENS abaixo — decisão de engenharia C1 §6.8, a
 *   aprovar). A viabilidade usa o catálogo (o maior hi-wall que existe) e o
 *   modelo (parede externa, forro, plenum), nunca um "ambiente grande > X m²".
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v) { var n = Number(v); return v !== null && v !== "" && v !== undefined && isFinite(n) ? n : null; }
  function fmt(v, c) { return v == null || !isFinite(v) ? "—" : v.toFixed(c == null ? 1 : c).replace(".", ","); }

  var NOMES = { janela: "Aparelho de janela", hiwall: "Split hi-wall", pisoteto: "Split piso-teto", cassete: "Split cassete", duto: "Split duto (embutido no forro)",
                multisplit: "Multi-split (uma condensadora para vários ambientes)", vrf: "VRF (vazão de refrigerante variável)", chiller_fancoil: "Chiller + fancoils", self: "Self-contained",
                exaustao: "Exaustão mecânica", ventilacao: "Ventilação natural (sem climatização)" };
  /* ⚠ ORDENS RELATIVAS (do melhor para o pior) — decisão de engenharia C1 §6.8, para o gerente aprovar:
       custo instalado: janela < hi-wall < piso-teto < cassete < duto
       ruído no ambiente: o duto e o cassete afastam o ventilador; o de janela tem o compressor dentro
       estética: embutido (duto, cassete) antes do aparente (hi-wall, piso-teto, janela) */
  var ORDENS = {
    custo:    ["janela", "hiwall", "pisoteto", "cassete", "duto"],
    ruido:    ["duto", "cassete", "hiwall", "pisoteto", "janela"],
    estetica: ["duto", "cassete", "hiwall", "pisoteto", "janela"],
    /* ⚠ sem prioridade do usuário vale a PRÁTICA DE MERCADO (C1 §6.8): na residência o hi-wall é o
       padrão (o de janela fica por último: ruído e fachada furada); no comercial com forro, o cassete.
       Só "custo" primeiro poria o aparelho de janela no topo de todo quarto com fachada. */
    padrao_residencial: ["hiwall", "pisoteto", "cassete", "duto", "janela"],
    padrao_comercial:   ["cassete", "duto", "hiwall", "pisoteto", "janela"]
  };
  var PRIORIDADE_PADRAO = ["custo", "ruido", "estetica"];
  var MAX_SOLUCOES = 3;   /* clim:ok pedido do Rogério: até 3 sugestões por ambiente */
  var TIPOS_AMBIENTE = ["janela", "hiwall", "pisoteto", "cassete", "duto"];
  var NAO_CLIMATIZA = { banheiro: 1, circulacao: 1, servico: 1, garagem: 1, deposito: 1 };
  var EXAUSTAO = { banheiro: 1, cozinha: 1, servico: 1 };

  function temParedeExterna(amb) { return arr(amb.paredes).some(function (p) { return p.externa; }); }
  function climatiza(amb) { return typeof amb.climatizar === "boolean" ? amb.climatizar : !NAO_CLIMATIZA[amb.uso] && amb.uso !== "cozinha"; }

  /* uma solução avaliada: viável? por quê? */
  function avaliar(tipo, amb, carga, info) {
    var just = [], imp = [], req = carga && carga.requerida_BTUh, ext = temParedeExterna(amb), forro = amb.forro || {};
    var maiorHW = info.maior.hiwall, temCat = info.temCatalogo[tipo];
    if (!temCat) just.push("equipamento a definir: o catálogo de " + NOMES[tipo].toLowerCase() + " ainda não foi extraído (pendente)");
    if (tipo === "janela") {
      if (!ext) imp.push("sem parede externa: o aparelho de janela precisa atravessar a fachada");
      else just.push("parede externa disponível; menor custo; compressor no ambiente (mais ruído)");
    } else if (tipo === "hiwall") {
      if (req != null && maiorHW != null && req > maiorHW) imp.push("carga de " + Math.round(req) + " BTU/h acima do maior hi-wall do catálogo (" + maiorHW + " BTU/h)");
      just.push(ext ? "condensadora na fachada do próprio ambiente (linha curta)" : "sem parede externa: condensadora REMOTA, linha pelo forro/parede até a fachada ou a área técnica");
      just.push("evaporadora aparente na parede; instalação mais simples");
    } else if (tipo === "pisoteto") {
      if (req != null && maiorHW != null && req > maiorHW) just.push("carga acima do maior hi-wall do catálogo (" + maiorHW + " BTU/h): piso-teto atende ambiente grande com uma unidade");
      else just.push("unidade de teto/parede para ambiente amplo; aparente");
      if (!ext) just.push("condensadora remota");
    } else if (tipo === "cassete" || tipo === "duto") {
      if (!forro.existe) imp.push("sem forro: " + (tipo === "cassete" ? "o cassete" : "a unidade dutada") + " fica entre o forro e a laje");
      else if (num(forro.plenum_m) == null) just.push("forro existe, plenum não medido (sem laje acima no modelo): conferir com a altura da unidade do catálogo");
      else {
        var h = info.alturaUnidade[tipo];
        if (h != null && forro.plenum_m < h) imp.push("plenum de " + fmt(forro.plenum_m, 2) + " m menor que a unidade (" + fmt(h, 2) + " m)");
        else just.push("plenum de " + fmt(forro.plenum_m, 2) + " m" + (h != null ? " ≥ unidade " + fmt(h, 2) + " m" : " — altura da unidade pendente de catálogo"));
      }
      if (tipo === "cassete") just.push("insuflamento em 4 vias pelo forro: distribuição uniforme, embutido");
      else just.push("insuflamento por grelhas/difusores e retorno pelo forro: silencioso e embutido; atende ambiente sem parede externa");
      if (!ext) just.push("condensadora remota");
    }
    return { tipo: tipo, nome: NOMES[tipo], viavel: imp.length === 0, justificativa: just, impedimentos: imp,
             criterios: { custo: ORDENS.custo.indexOf(tipo), ruido: ORDENS.ruido.indexOf(tipo), estetica: ORDENS.estetica.indexOf(tipo),
                          padrao_residencial: ORDENS.padrao_residencial.indexOf(tipo), padrao_comercial: ORDENS.padrao_comercial.indexOf(tipo) }, equipamentoNoCatalogo: !!temCat };
  }

  /* info do catálogo para a viabilidade: o maior de cada tipo, a altura da unidade (plenum) */
  function infoCatalogo(conjs) {
    var info = { maior: {}, temCatalogo: {}, alturaUnidade: {} };
    arr(conjs).forEach(function (c) {
      info.temCatalogo[c.tipo] = true;
      if (c.capacidade_BTUh != null && (info.maior[c.tipo] == null || c.capacidade_BTUh > info.maior[c.tipo])) info.maior[c.tipo] = c.capacidade_BTUh;
      var h = num((c.evaporadora.dim || {}).altura_mm);
      if (h != null) { h = h / 1000; if (info.alturaUnidade[c.tipo] == null || h > info.alturaUnidade[c.tipo]) info.alturaUnidade[c.tipo] = h; }
    });
    return info;
  }

  /* prioridade do usuário (lexicográfica) ou, sem ela, a ordem padrão do tipo de edificação */
  function ordenar(lista, prioridade, padrao) {
    var pr = arr(prioridade).filter(function (k) { return ORDENS[k]; });
    if (!pr.length) pr = [padrao === "padrao_comercial" ? "padrao_comercial" : "padrao_residencial"];
    PRIORIDADE_PADRAO.forEach(function (k) { if (pr.indexOf(k) < 0) pr.push(k); });
    return lista.slice().sort(function (a, b) {
      for (var i = 0; i < pr.length; i++) { var d = a.criterios[pr[i]] - b.criterios[pr[i]]; if (d) return d; }
      return 0;
    });
  }

  /* -------------------------------------------- POR AMBIENTE (≤ 3) */
  function porAmbiente(amb, carga, conjs, pref, ctx) {
    pref = pref || {};
    if (!climatiza(amb)) {
      var out = [];
      if (EXAUSTAO[amb.uso]) {
        var semJanela = !arr(amb.vidros).length;
        var sol = { tipo: "exaustao", nome: NOMES.exaustao, viavel: true, justificativa: [semJanela ? "ambiente sem janela: exaustão mecânica para o exterior" : "exaustão do ar viciado (umidade/odor) para o exterior"], impedimentos: [], criterios: {} };
        if (ctx) { var c = ctx.consulta("cl.exaustao.vazao", { uso: amb.uso }, "trocas_h", "exaustão de " + (amb.nome || amb.id)); if (c.ok && num(amb.volume_m3) != null) { sol.vazao_m3h = num(c.valor) * amb.volume_m3; sol.justificativa.push("vazão = " + fmt(num(c.valor)) + " trocas/h × " + fmt(amb.volume_m3, 2) + " m³ = " + fmt(sol.vazao_m3h) + " m³/h"); } else sol.justificativa.push("vazão de exaustão pendente (cl.exaustao.vazao)"); }
        out.push(sol);
      } else out.push({ tipo: "ventilacao", nome: NOMES.ventilacao, viavel: true, justificativa: ["uso " + (amb.uso || "?") + " não climatizado por padrão (ambiente.climatizar = true força)"], impedimentos: [], criterios: {} });
      return { climatizar: false, solucoes: out, todas: out };
    }
    var info = infoCatalogo(conjs);
    var todas = TIPOS_AMBIENTE.map(function (t) { return avaliar(t, amb, carga, info); });
    var comercial = pref.edificacao === "comercial" || /escritorio|loja|reuniao|restaurante|escola/.test(amb.uso || "");
    var padrao = comercial ? "padrao_comercial" : "padrao_residencial";
    var viaveis = ordenar(todas.filter(function (s) { return s.viavel; }), pref.prioridade, padrao);
    /* quem tem modelo no catálogo vem antes, entre as viáveis da mesma ordem? NÃO: a ordem é a do usuário;
       o "sem catálogo" só vira pendência do equipamento (recado honesto, não troca a engenharia) */
    return { climatizar: true, solucoes: viaveis.slice(0, MAX_SOLUCOES), todas: todas, prioridade: arr(pref.prioridade).length ? pref.prioridade : [padrao] };
  }

  /* ------------------------------------------------------ CENTRAIS */
  function centrais(ambs, cargas, pref, ctx, opcoes) {
    pref = pref || {}; opcoes = opcoes || {};
    var lst = arr(ambs).filter(function (a) { return climatiza(a) && cargas[a.id] && cargas[a.id].requerida_BTUh != null; });
    var out = [];
    if (lst.length < 2) return out;
    var soma = lst.reduce(function (s, a) { return s + cargas[a.id].requerida_BTUh; }, 0);
    var fs = num(opcoes.simultaneidade), fsOrig = "entrada";
    if (fs == null && ctx) { var c = ctx.consulta("cl.simultaneidade", { uso: opcoes.edificacao || "residencial" }, "fator", "simultaneidade da central"); if (c.ok) { fs = num(c.valor); fsOrig = "norma"; } }
    if (fs == null) { fs = 1; fsOrig = "padrao_motor"; }
    var pavs = {}; lst.forEach(function (a) { pavs[a.pavimento || "?"] = 1; });
    var nPav = Object.keys(pavs).length, comercial = opcoes.edificacao === "comercial" || lst.some(function (a) { return /escritorio|loja|reuniao/.test(a.uso || ""); });
    var pedido = pref.central === "sim" || pref.reduzirFachada === true;
    var condInd = lst.length;
    function central(tipo, extra) {
      var o = { tipo: tipo, nome: NOMES[tipo], ambientes: lst.map(function (a) { return a.id; }), soma_BTUh: Math.round(soma), simultaneidade: fs, simultaneidadeOrigem: fsOrig,
                carga_BTUh: Math.round(soma * fs), condensadoras: 1, fachadaEvitada: condInd - 1, recomendada: pedido,
                justificativa: [condInd + " evaporadora(s) numa só condensadora: " + (condInd - 1) + " condensadora(s) a menos na fachada",
                                fsOrig === "padrao_motor" ? "simultaneidade = 1 (soma das cargas, sem diversidade — conservador; CONTRATO-CLIMA §6.10)" : "simultaneidade = " + fmt(fs, 2) + " (" + fsOrig + ")"],
                pendencias: ["catálogo de " + NOMES[tipo].toLowerCase() + " não extraído: capacidade da condensadora, nº máximo de evaporadoras e limites de tubulação pendentes"] };
      (extra || []).forEach(function (t) { o.justificativa.push(t); });
      /* revisão 17/10/2026 B5: a pendência do catálogo da central só entra quando a central foi PEDIDA — como
         alternativa ela fica no texto da solução (senão o ok nunca fecharia em casa com dois cômodos) */
      if (ctx && (pedido || pref.central === "chiller" || pref.central === "self")) ctx.pendencia("catalogo.clim." + tipo, "sem catálogo de " + NOMES[tipo] + " extraído", "solução central");
      return o;
    }
    var ms = central("multisplit", ["indicado para residência/poucos ambientes no mesmo pavimento"]);
    var vrf = central("vrf", ["indicado para muitos ambientes, mais de um pavimento ou uso comercial; controle individual"]);
    if (comercial || nPav > 1) out.push(vrf, ms); else out.push(ms, vrf);
    if (pref.central === "chiller" || pref.central === "self") out.unshift(central(pref.central === "chiller" ? "chiller_fancoil" : "self", ["pedido do usuário"]));
    return out;
  }

  var ClimSistema = { VERSAO: 1, NOMES: NOMES, ORDENS: ORDENS, PRIORIDADE_PADRAO: PRIORIDADE_PADRAO, TIPOS_AMBIENTE: TIPOS_AMBIENTE,
                      climatiza: climatiza, temParedeExterna: temParedeExterna, avaliar: avaliar, infoCatalogo: infoCatalogo, ordenar: ordenar,
                      porAmbiente: porAmbiente, centrais: centrais };
  global.ClimSistema = ClimSistema;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimSistema;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
