/* =====================================================================
 * climequip.js — ESCOLHA DO EQUIPAMENTO no catálogo (climatização, C1).
 * Motor PURO, ES5, Node-testável. Contrato: docs/hidro/CONTRATO-CLIMA.md.
 *
 * O catálogo é o do gerador tools/gerar-hid-catalogo.js (--clima): itens
 * "evaporadora" e "condensadora" com a fonte (arquivo, url, página) de cada
 * um, e as tabelas do manual em meta.fontes[].tabelas. Aqui:
 *   · conjuntos(): casa evaporadora + condensadora do mesmo fabricante, linha,
 *     capacidade e ciclo (só frio × quente/frio) e junta os LIMITES do
 *     fabricante (comprimento máximo — linear ou equivalente —, desnível,
 *     comprimento mínimo, carga adicional de gás por metro e a partir de
 *     quantos metros, sifão na sucção);
 *   · escolher(): o MENOR conjunto do tipo que atende à carga com a folga
 *     DECLARADA (preferencias.folga_pct; padrão 0 — CONTRATO-CLIMA §6.7);
 *   · verificarLinha(): comprimento, desnível, mínimo, carga adicional.
 *
 * ⚠ Nenhum número do fabricante aqui: os limites são lidos dos campos do
 *   catálogo; o que só existe em texto ("C.M.E = C.L + (nº conexões x 0,3
 *   m)", "acima de 7,5 m", "sifão … a cada 3,0 m de subida") é LIDO do texto.
 *   Campo que o catálogo não traz (Daikin e Elgin sem g/m) → PENDENTE.
 * ⚠ Hoje o catálogo só tem HI-WALL (Daikin, Springer Midea, Elgin). Cassete,
 *   piso-teto, duto, janela, multi-split e VRF saem com o equipamento
 *   pendente "sem catálogo extraído" — a solução é sugerida, o modelo não.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v) { var n = Number(v); return v !== null && v !== "" && v !== undefined && isFinite(n) ? n : null; }
  function prim() { for (var i = 0; i < arguments.length; i++) { var v = num(arguments[i]); if (v != null) return v; } return null; }
  function fmt(v, c) { return v == null || !isFinite(v) ? "—" : v.toFixed(c == null ? 1 : c).replace(".", ","); }
  var TOL = 1e-9, MAX_ALTERNATIVAS = 3;   /* clim:ok tolerância numérica; alternativas mostradas (pedido: até 3) */
  var CC = function () { return dep("ClimCarga", "./climcarga.js"); };

  /* tipo da evaporadora pela linha/descrição do catálogo */
  var TIPOS_RE = [["cassete", /cassete|k-?7/i], ["pisoteto", /piso.?teto/i], ["duto", /dut[oa]|built.?in/i], ["janela", /janela|window/i],
                  ["vrf", /\bvrf\b|vrv/i], ["multisplit", /multi.?split/i], ["hiwall", /hi.?wall|high wall/i]];
  function tipoDe(item) { var s = (item.linha || "") + " " + (item.descricao || ""); for (var i = 0; i < TIPOS_RE.length; i++) if (TIPOS_RE[i][1].test(s)) return TIPOS_RE[i][0]; return "outro"; }
  function cicloDe(item) { return /quente/i.test(item.descricao || "") ? "quente_frio" : "frio"; }
  function capBTUh(d) {
    d = d || {}; var C = CC();
    var b = prim(d.capacidadeResfriamento_Btu_h, d.capacidadeNominalResfriamento_Btu_h);
    if (b != null) return b;
    var w = prim(d.capacidadeResfriamento_W, num(d.capacidadeResfriamento_kW) != null ? d.capacidadeResfriamento_kW * 1000 : null, num(d.capacidadeNominalResfriamento_kW) != null ? d.capacidadeNominalResfriamento_kW * 1000 : null);
    return w != null && C ? C.conv.W_para_BTUh(w) : null;
  }
  function capW(d) {
    d = d || {}; var C = CC();
    var w = prim(d.capacidadeResfriamento_W, num(d.capacidadeResfriamento_kW) != null ? d.capacidadeResfriamento_kW * 1000 : null, num(d.capacidadeNominalResfriamento_kW) != null ? d.capacidadeNominalResfriamento_kW * 1000 : null);
    if (w != null) return w;
    var b = capBTUh(d); return b != null && C ? C.conv.BTUh_para_W(b) : null;
  }
  function conector(item, sistema) { return arr(item && item.conectores).filter(function (c) { return c.sistema === sistema; })[0] || null; }

  /* o catálogo: entrada.catalogo ({itens, fontes|meta}) ou o HidCatalogo do navegador (domínio clim) */
  function catalogo(cat) {
    if (cat && Array.isArray(cat.itens)) return { itens: cat.itens.filter(function (i) { return !i.dominio || i.dominio === "clim"; }), fontes: arr(cat.fontes || (cat.meta && cat.meta.fontes)) };
    var H = dep("HidCatalogo", "./hidcatalogo.js");
    if (H && H.itens) return { itens: H.itens().filter(function (i) { return i.dominio === "clim"; }), fontes: arr(H.meta && H.meta.fontes).filter(function (f) { return f.dominio === "clim"; }) };
    return { itens: [], fontes: [] };
  }
  function tabelaDaFonte(fontes, json, nome) {
    var f = arr(fontes).filter(function (x) { return x.json === json; })[0];
    return f ? arr(f.tabelas).filter(function (t) { return t.nome === nome; })[0] || null : null;
  }
  function fonteDaFicha(fontes, json) { return arr(fontes).filter(function (x) { return x.json === json; })[0] || null; }

  /* ------------------------------------------------------- CONJUNTOS */
  function conjuntos(catIn) {
    var cat = catalogo(catIn), C = CC(), out = [];
    var evs = cat.itens.filter(function (i) { return i.tipo === "evaporadora"; }), cds = cat.itens.filter(function (i) { return i.tipo === "condensadora"; });
    evs.forEach(function (e) {
      var cap = capBTUh(e.dados), ciclo = cicloDe(e);
      /* a condensadora nem sempre traz a capacidade nos dados (Daikin, Springer): vale a capacidade escrita na descrição */
      var cand = cds.filter(function (c) {
        if (c.fabricante !== e.fabricante || c.linha !== e.linha || cicloDe(c) !== ciclo) return false;
        var cc = capBTUh(c.dados); return cc != null ? cc === cap : (C ? C.numeros(c.descricao).indexOf(cap) >= 0 : false);
      });
      if (cand.length > 1) { var u = String(e.codigo).slice(-1); var mesmo = cand.filter(function (c) { return String(c.codigo).slice(-1) === u; }); if (mesmo.length) cand = mesmo; }
      var c = cand[0]; if (!c) return;
      var dc = c.dados || {}, de = e.dados || {}, json = (c.fonte || {}).json;
      /* comprimento: "equivalente" quando o catálogo diz equivalente (o acréscimo por conexão vem do texto) */
      var Leq = prim(dc.comprimentoEquivalenteMaximo_m, de.comprimentoEquivalenteMaximo_m), Llin = prim(dc.comprimentoMaximoTubulacao_m, dc.comprimentoTubosMaximo_m, de.comprimentoMaximoTubulacao_m);
      var acr = dc.compCurvaEquivalente && C ? C.numeros(dc.compCurvaEquivalente).filter(function (x) { return x > 0; })[0] : null;
      /* carga adicional: o campo g/m e o "a partir de" (no nome do campo ou no texto) */
      var gKey = Object.keys(dc).filter(function (k) { return /^cargaAdicional_g_por_m/.test(k); })[0], gPorM = gKey ? num(dc[gKey]) : null, semCarga = prim(dc.comprimentoSemAdicaoDeRefrigerante_m);
      if (gKey && semCarga == null) { var mm = /acima_de_(\d+)(?:_(\d+))?_m/.exec(gKey); if (mm) semCarga = Number(mm[1] + (mm[2] ? "." + mm[2] : "")); }
      var tLim = tabelaDaFonte(cat.fontes, json, "limites_interligacao"), sif = null;
      if (tLim && tLim.dados && tLim.dados.regra && C) sif = C.numeroAntesDe(tLim.dados.regra, /m de subida/);
      var tEsp = tabelaDaFonte(cat.fontes, json, "espessura_minima_tubulacao_mm"), esp = null, ff = fonteDaFicha(cat.fontes, json);
      if (tEsp && tEsp.dados) esp = arr(Object.keys(tEsp.dados).map(function (k) { return num(tEsp.dados[k]); })).filter(function (x) { return x != null; })[0] || null;
      if (esp == null && ff && C) { var mo = /espessura m[ií]nima[^0-9]{0,20}([\d,]+)\s*mm/i.exec(ff.observacao || ""); if (mo) esp = C.numeros(mo[1])[0]; }
      var liq = conector(c, "frigorigeno_liquido") || conector(e, "frigorigeno_liquido"), suc = conector(c, "frigorigeno_succao") || conector(e, "frigorigeno_succao");
      out.push({
        id: e.codigo + "+" + c.codigo, fabricante: e.fabricante, linha: e.linha, tipo: tipoDe(e), ciclo: ciclo,
        refrigerante: dc.refrigerante || de.refrigerante || "",
        capacidade_BTUh: cap, capacidade_W: capW(e.dados) || capW(c.dados),
        evaporadora: { codigo: e.codigo, descricao: e.descricao, dim: e.dim || {}, peso_kg: prim(de.pesoEvaporadora_kg, de.massaSemEmbalagem_kg),
                       vazaoAr_m3h: prim(de.vazaoArMaximaResfriamento_m3_h, de.vazaoDeAr_m3_h), ruido: de.ruidoEvaporadoraResfriamento_dBA_A_M_B_SL || null,
                       dreno: conector(e, "dreno"), fonte: e.fonte },
        condensadora: { codigo: c.codigo, descricao: c.descricao, dim: c.dim || {}, peso_kg: prim(dc.pesoCondensadora_kg, dc.massaSemEmbalagem_kg),
                        ruido_dBA: prim(dc.ruidoCondensadoraResfriamento_dBA), fonte: c.fonte },
        limites: { comprimentoMax_m: Leq != null ? Leq : Llin, tipoComprimento: Leq != null ? "equivalente" : (Llin != null ? "linear" : null), acrescimoPorConexao_m: Leq != null ? acr : null,
                   desnivelMax_m: prim(dc.desnivelMaximo_m, de.desnivelMaximo_m), comprimentoMin_m: prim(dc.comprimentoMinimo_m, dc.comprimentoTubosMinimo_m),
                   semCargaAdicional_m: semCarga, gPorM: gPorM, padraoFabrica_m: prim(dc.comprimentoTubosPadrao_m), sifaoSuccaoACada_m: sif, espessuraParedeTubo_mm: esp },
        diametros: { liquido_mm: liq ? num(liq.dn_mm) : null, liquido_pol: liq ? liq.dn_pol : "", succao_mm: suc ? num(suc.dn_mm) : null, succao_pol: suc ? suc.dn_pol : "",
                     tabela: tabelaDaFonte(cat.fontes, json, "diametros_linhas_por_modelo_e_comprimento_equivalente"), modelo: (/_(\d{2})\b/.exec(c.descricao || "") || [])[1] || null },
        eletrica: { disjuntor_A: prim(dc.disjuntorRecomendado_A, dc.disjuntor_A), corrente_A: prim(dc.correnteMaximaOperacao_A, dc.correnteMaxima_A, dc.correnteEletrica_A),
                    caboAlimentacao: dc.caboAlimentacao || "", caboInterligacao: dc.caboInterligacao || "", alimentacao: de.alimentacao || dc.alimentacao || "" },
        fonteFicha: ff ? { arquivo: ff.arquivo, url: ff.url, edicao: ff.edicao } : null
      });
    });
    return out;
  }

  /* ------------------------------------------------------- ESCOLHER */
  function escolher(tipo, requerida_BTUh, catIn, pref, ctx, conjs) {
    pref = pref || {};
    var todos = conjs || conjuntos(catIn), passos = [];
    var doTipo = todos.filter(function (c) { return c.tipo === tipo; });
    var res = { status: "pendente", conjunto: null, alternativas: [], passos: passos, necessaria_BTUh: null };
    if (!doTipo.length) {
      if (ctx) ctx.pendencia("catalogo.clim." + tipo, "sem catálogo de " + tipo + " extraído (dados-fonte/hidro/catalogos) — a solução é sugerida, o modelo do equipamento não", "equipamento " + tipo);
      passos.push("sem catálogo de " + tipo); return res;
    }
    if (requerida_BTUh == null) { passos.push("carga requerida indisponível"); return res; }
    var folga = num(pref.folga_pct) || 0, nec = requerida_BTUh * (1 + folga / 100);
    res.necessaria_BTUh = Math.round(nec);
    passos.push("necessária = " + Math.round(requerida_BTUh) + " BTU/h × (1 + " + fmt(folga) + " %) = " + Math.round(nec) + " BTU/h" + (folga ? " (folga declarada)" : " (sem folga: menor que atende — CONTRATO-CLIMA §6.7)"));
    var ciclo = pref.ciclo || "frio";
    var pool = doTipo.filter(function (c) { return c.ciclo === ciclo; });
    if (!pool.length) { pool = doTipo; passos.push("ciclo " + ciclo + " sem modelo no catálogo: considerados todos"); }
    var fab = pref.fabricante ? pool.filter(function (c) { return String(c.fabricante).toLowerCase().indexOf(String(pref.fabricante).toLowerCase()) >= 0; }) : [];
    if (pref.fabricante && fab.length) pool = fab;
    var atende = pool.filter(function (c) { return c.capacidade_BTUh != null && c.capacidade_BTUh >= nec - TOL; });
    atende.sort(function (a, b) {
      return (a.capacidade_BTUh - b.capacidade_BTUh) || ((b.limites.comprimentoMax_m || 0) - (a.limites.comprimentoMax_m || 0)) || String(a.id).localeCompare(String(b.id));
    });
    if (!atende.length) {
      var maior = pool.reduce(function (m, c) { return c.capacidade_BTUh > (m ? m.capacidade_BTUh : -Infinity) ? c : m; }, null);
      res.status = "reprovado"; res.maiorDoCatalogo_BTUh = maior ? maior.capacidade_BTUh : null;
      passos.push("nenhum " + tipo + " do catálogo atende: o maior tem " + (maior ? maior.capacidade_BTUh : "—") + " BTU/h");
      return res;
    }
    res.status = "ok"; res.conjunto = atende[0]; res.alternativas = atende.slice(1, 1 + MAX_ALTERNATIVAS);
    passos.push("escolhido " + atende[0].fabricante + " " + atende[0].id + " — " + atende[0].capacidade_BTUh + " BTU/h (menor do catálogo que atende" + (atende.length > 1 ? "; " + (atende.length - 1) + " alternativa(s)" : "") + ")");
    return res;
  }
  /* o maior do tipo (para o ClimSistema saber se a carga cabe num hi-wall) */
  function maiorDoTipo(tipo, conjs) { var m = null; arr(conjs).forEach(function (c) { if (c.tipo === tipo && c.capacidade_BTUh != null && (m == null || c.capacidade_BTUh > m)) m = c.capacidade_BTUh; }); return m; }

  /* ---------------------------------------------- VERIFICAR A LINHA
   * linha = { comprimento_m (linear, do traçado), conexoes (nº de curvas),
   *           desnivel_m (cond − evap: positivo = condensadora ACIMA) } */
  function verificarLinha(conj, linha, alvo) {
    var L = conj.limites || {}, v = [], ext = { cargaAdicional_g: null, sifoesSuccao: null, comprimentoEquivalente_m: null }, f = conj.fonteFicha;
    function ver(nome, valor, limite, unid, ok, passos, sentido) {
      var st = ok === null ? "pendente" : (ok ? "ok" : "reprovado");
      v.push({ id: "clv-" + alvo + "-" + v.length, sistema: "clim", alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unid,
               eta: ok === null || !limite ? null : (sentido === "min" ? limite / Math.max(valor, TOL) : valor / limite), ok: ok, status: st, passos: passos,
               fonte: f ? { chave: "catalogo:" + conj.id, norma: conj.fabricante, edicao: f.edicao, pagina: (conj.condensadora.fonte || {}).pagina, tabela: f.arquivo, tipo: "fabricante" } : null });
    }
    var Ll = num(linha.comprimento_m), n = num(linha.conexoes) || 0, H = Math.abs(num(linha.desnivel_m) || 0);
    var Lcalc = Ll, pas = ["comprimento linear = " + fmt(Ll, 2) + " m"];
    if (L.tipoComprimento === "equivalente") {
      if (L.acrescimoPorConexao_m != null) { Lcalc = Ll + n * L.acrescimoPorConexao_m; pas.push("equivalente = " + fmt(Ll, 2) + " + " + n + " conexão(ões) × " + fmt(L.acrescimoPorConexao_m, 2) + " m = " + fmt(Lcalc, 2) + " m"); }
      else { Lcalc = null; pas.push("o catálogo dá comprimento EQUIVALENTE e não o acréscimo por conexão: pendente"); }
    }
    ext.comprimentoEquivalente_m = Lcalc;
    if (L.comprimentoMax_m == null || Lcalc == null) ver("comprimento da linha frigorígena", Lcalc, L.comprimentoMax_m, "m", null, pas.concat(["limite do fabricante não consta do catálogo"]));
    else ver("comprimento da linha frigorígena (" + L.tipoComprimento + ")", Lcalc, L.comprimentoMax_m, "m", Lcalc <= L.comprimentoMax_m, pas.concat([fmt(Lcalc, 2) + " ≤ " + fmt(L.comprimentoMax_m, 1) + " m"]));
    if (L.desnivelMax_m == null) ver("desnível evaporadora × condensadora", H, null, "m", null, ["desnível máximo não consta do catálogo"]);
    else ver("desnível evaporadora × condensadora", H, L.desnivelMax_m, "m", H <= L.desnivelMax_m, [fmt(H, 2) + " ≤ " + fmt(L.desnivelMax_m, 1) + " m"]);
    if (L.comprimentoMin_m != null) ver("comprimento mínimo da linha", Ll, L.comprimentoMin_m, "m", Ll >= L.comprimentoMin_m, [fmt(Ll, 2) + " ≥ " + fmt(L.comprimentoMin_m, 1) + " m (abaixo: completar com serpentina)"], "min");
    /* carga adicional de gás (comprimento LINEAR acima do que vem de fábrica) */
    if (L.semCargaAdicional_m != null && Ll != null) {
      var exc = Math.max(0, Ll - L.semCargaAdicional_m);
      if (exc <= 0) ext.cargaAdicional_g = 0;
      else if (L.gPorM != null) ext.cargaAdicional_g = Math.round(exc * L.gPorM);
      else ext.cargaAdicional_pendente = "o catálogo não traz a carga adicional por metro (g/m) — consultar o manual de instalação";
      ext.cargaAdicionalPassos = exc <= 0 ? ["linha ≤ " + fmt(L.semCargaAdicional_m, 1) + " m: sem carga adicional"] :
        (L.gPorM != null ? ["(" + fmt(Ll, 2) + " − " + fmt(L.semCargaAdicional_m, 1) + ") m × " + fmt(L.gPorM, 0) + " g/m = " + ext.cargaAdicional_g + " g de " + (conj.refrigerante || "refrigerante")] : [ext.cargaAdicional_pendente]);
    } else ext.cargaAdicional_pendente = "o catálogo não diz até quantos metros a carga de fábrica atende";
    /* sifão na sucção quando a condensadora fica acima (regra do fabricante, lida do texto) */
    if (num(linha.desnivel_m) > 0) ext.sifoesSuccao = L.sifaoSuccaoACada_m ? Math.floor(num(linha.desnivel_m) / L.sifaoSuccaoACada_m) : null;
    return { verificacoes: v, extras: ext, ok: v.every(function (x) { return x.status === "ok"; }) };
  }

  var ClimEquip = { VERSAO: 1, TIPOS_RE: TIPOS_RE, catalogo: catalogo, conjuntos: conjuntos, escolher: escolher, maiorDoTipo: maiorDoTipo, verificarLinha: verificarLinha, tipoDe: tipoDe };
  global.ClimEquip = ClimEquip;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimEquip;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
