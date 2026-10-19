/* =====================================================================
 * climrede.js — REDE da climatização (frente C1): frigorígena, dreno,
 * dutos e terminais. Motor PURO, ES5, Node-testável.
 * Contrato: docs/hidro/CONTRATO-CLIMA.md.
 *
 *  · frigorigena(): diâmetros de líquido e sucção do CATÁLOGO (conector da
 *    unidade; a tabela do manual por comprimento, quando existe, manda),
 *    isolamento (cl.isolamento.espessura — pendente), espessura de parede
 *    do tubo (manual), comprimento/limites/carga de gás (ClimEquip);
 *  · dreno(): destino mais perto (esgoto, pluvial, externo), QUEDA
 *    disponível × inclinação mínima (cl.dreno.inclinacao_minima — pendente),
 *    SIFÃO quando vai a esgoto, BOMBA DE DRENO quando não há queda, DN pelo
 *    conector de dreno da unidade e pela lista comercial do biminst;
 *  · duto(): método de IGUAL PERDA DE CARGA com física pura (Darcy-Weisbach
 *    + Colebrook, diâmetro equivalente de Huebscher); a perda unitária, a
 *    rugosidade e a velocidade máxima são de norma/RT (pendentes sem fonte);
 *  · terminais(): vazão por grelha/difusor; a SELEÇÃO é pendente (catálogo
 *    Trox/Tropical não extraído).
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
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function fmt(v, c) { return v == null || !isFinite(v) ? "—" : v.toFixed(c == null ? 1 : c).replace(".", ","); }

  /* -------------------------------------------------------- FÍSICA */
  /* clim:fisica-inicio — escoamento de ar em duto (ASHRAE Handbook — Fundamentals 2017, cap. 21)
     · ar padrão: ρ = 1,204 kg/m³, μ = 1,81e−5 Pa·s (20 °C, 101,325 kPa)
     · Darcy-Weisbach: Δp/L = f/D · ρv²/2; Colebrook: 1/√f = −2 log10(ε/(3,7 D) + 2,51/(Re √f))
     · Huebscher (eq. 25): De = 1,30 (a·b)^0,625 / (a+b)^0,25
     · busca por bisseção entre 1 cm e 5 m de diâmetro (faixa de qualquer duto de edificação) */
  var RHO_PADRAO = 1.204, MU_AR = 1.81e-5, D_MIN = 0.01, D_MAX = 5, ITER = 80;
  function colebrook(Re, eRel) {
    if (Re < 2300) return 64 / Re;
    var f = 0.02;
    for (var i = 0; i < 30; i++) { var s = -2 * Math.log(eRel / 3.7 + 2.51 / (Re * Math.sqrt(f))) / Math.LN10; f = 1 / (s * s); }
    return f;
  }
  function perdaUnit(Q_m3s, D, eps_m, rho) { var A = Math.PI * D * D / 4, v = Q_m3s / A, Re = rho * v * D / MU_AR; return colebrook(Re, eps_m / D) / D * rho * v * v / 2; }
  function diametroIgualPerda(Q_m3s, R_Pa_m, eps_m, rho) {
    var a = D_MIN, b = D_MAX;
    for (var i = 0; i < ITER; i++) { var m = (a + b) / 2; if (perdaUnit(Q_m3s, m, eps_m, rho) > R_Pa_m) a = m; else b = m; }
    return (a + b) / 2;
  }
  function huebscher(a, b) { return 1.30 * Math.pow(a * b, 0.625) / Math.pow(a + b, 0.25); }
  function retangularDe(De, razao) {
    var lo = D_MIN, hi = D_MAX;
    for (var i = 0; i < ITER; i++) { var m = (lo + hi) / 2; if (huebscher(m, m * razao) < De) lo = m; else hi = m; }
    var a = (lo + hi) / 2; return { a: a, b: a * razao };
  }
  /* clim:fisica-fim */

  /* "12,70 (1/2)" → 12,7 (o número antes do parêntese da polegada) */
  var EPS = 1e-6;   /* clim:ok tolerância geométrica (m) */
  function mmDoTexto(t) { var C = dep("ClimCarga", "./climcarga.js"); var n = C ? C.numeros(String(t || "").split("(")[0]) : []; return n.length ? n[0] : null; }

  /* --------------------------------------------------- FRIGORÍGENA */
  function frigorigena(conj, rotaL, ctx) {
    var E = dep("ClimEquip", "./climequip.js"), D = conj.diametros || {}, passos = [], pend = [];
    var liq = D.liquido_mm, suc = D.succao_mm, origem = "conector da unidade (catálogo)";
    var ver = E ? E.verificarLinha(conj, rotaL, conj.id) : null;
    /* tabela do manual por modelo e faixa de comprimento: manda sobre o conector.
       ⚠ revisão 17/10/2026 M6: a tabela da Springer é por comprimento EQUIVALENTE — consultá-la com o linear
       deixava a linha com curvas na faixa curta. Tabela "equivalente" sem o equivalente calculado → pendente. */
    if (D.tabela && D.tabela.dados && D.modelo && D.tabela.dados[D.modelo]) {
      var faixas = D.tabela.dados[D.modelo], C = dep("ClimCarga", "./climcarga.js"), escolhida = null;
      var porEq = /equivalente/i.test(D.tabela.nome || ""), Lref = porEq ? (ver && ver.extras ? ver.extras.comprimentoEquivalente_m : null) : rotaL.comprimento_m;
      /* ⚠ a chave é "0-25m": o leitor de números não lê algarismo grudado em letra — separa o "m" antes
         (sem isso NENHUMA faixa casava e o diâmetro ficava sempre o do conector, calado) */
      if (Lref == null) pend.push("comprimento equivalente da linha (a tabela de diâmetros do manual é por equivalente)");
      else Object.keys(faixas).forEach(function (k) { var n = C.numeros(String(k).replace(/m/gi, " m")), max = n.length ? n[n.length - 1] : null; if (max != null && Lref <= max && (!escolhida || max < escolhida.max)) escolhida = { k: k, max: max }; });
      if (escolhida) {
        var f = faixas[escolhida.k], l2 = mmDoTexto(f.expansao || f.liquido), s2 = mmDoTexto(f.succao);
        if (l2 != null) liq = l2; if (s2 != null) suc = s2;
        origem = "tabela do manual (pág. " + D.tabela.pagina + "), modelo " + D.modelo + ", faixa " + escolhida.k;
      } else if (Lref != null) pend.push("comprimento " + (porEq ? "equivalente " : "") + fmt(Lref, 2) + " m fora das faixas da tabela de diâmetros do manual");
    }
    passos.push("líquido Ø " + fmt(liq, 2) + " mm, sucção Ø " + fmt(suc, 2) + " mm — " + origem);
    var iso = { status: "pendente", espessura_mm: null };
    if (ctx) {
      var ls = ctx.linhas("cl.isolamento.espessura", null, "isolamento da linha frigorígena");
      if (ls) {
        var r = ls.filter(function (x) { return num(x.dn_mm_max) != null && num(x.dn_mm_max) >= Math.max(liq || 0, suc || 0); }).sort(function (a, b) { return a.dn_mm_max - b.dn_mm_max; })[0];
        if (r) { iso = { status: "ok", espessura_mm: num(r.espessura_mm) }; passos.push("isolamento " + fmt(iso.espessura_mm, 0) + " mm (até Ø " + r.dn_mm_max + " mm)"); }
      }
    }
    return { liquido_mm: liq, succao_mm: suc, origem: origem, isolamento: iso, paredeTubo_mm: (conj.limites || {}).espessuraParedeTubo_mm,
             comprimento_m: r3(rotaL.comprimento_m), conexoes: rotaL.conexoes, desnivel_m: r3(rotaL.desnivel_m), segmentos: rotaL.segmentos,
             verificacoes: ver ? ver.verificacoes : [], extras: ver ? ver.extras : {}, passos: passos, pendencias: pend };
  }

  /* ---------------------------------------------------------- DRENO */
  function dreno(evapPos, conj, destinos, ctx, forro) {
    var BI = dep("BimInst", "./biminst.js"), passos = [], pend = [];
    /* ⚠ revisão 17/10/2026 B4: o destino COM queda vem antes do mais perto em planta (um ralo acima da
       evaporadora pedia bomba havendo outro abaixo); entre os de mesma condição, o mais perto */
    var dests = arr(destinos).map(function (d) { return { d: d, L: Math.abs(d.x - evapPos.x) + Math.abs(d.z - evapPos.z), cai: evapPos.y - d.y > 0 }; })
      .sort(function (a, b) { return a.cai !== b.cai ? (a.cai ? -1 : 1) : a.L - b.L; });
    var res = { destino: null, sifao: false, bomba: false, dn: null, material: "pvc_soldavel", queda_m: null, comprimentoH_m: null, inclinacaoDisp_pct: null, inclinacaoMin_pct: null,
                status: "pendente", segmentos: [], passos: passos, pendencias: pend };
    if (!dests.length) { pend.push("destino do dreno"); passos.push("nenhum ponto de esgoto/pluvial no modelo: informar o destino (gotejar na fachada não)"); return res; }
    var dd = dests[0].d; res.destino = dd; res.comprimentoH_m = r3(dests[0].L);
    res.queda_m = r3(evapPos.y - dd.y);
    res.sifao = dd.tipo === "esgoto";
    if (res.sifao) passos.push("destino esgoto: SIFÃO no dreno (fecho hídrico contra odor — C1 §6.12)");
    /* DN: o menor da lista comercial do material ≥ o conector de dreno da unidade */
    var con = conj && conj.evaporadora && conj.evaporadora.dreno ? num(conj.evaporadora.dreno.dn_mm) : null, dns = BI && BI.MATERIAIS && BI.MATERIAIS.pvc_soldavel ? BI.MATERIAIS.pvc_soldavel.dns : null;
    /* NBR 16655-1:2018 4.5.4 (lida no texto): tubo de dreno mínimo de 20 mm e caimento mínimo de 1 % sem motobomba */
    var r1655 = function (par) { return ctx ? ctx.consulta("cl.nbr16655_1.requisitos", { parametro: par }, "valor", "dreno") : { ok: false }; };
    var dMin = r1655("dreno_dn_min"), dnMin = dMin.ok ? num(dMin.valor) : null;
    if (con == null && dnMin == null) pend.push("diâmetro da saída de dreno da evaporadora (catálogo)");
    else if (!dns) pend.push("lista comercial de PVC soldável (biminst)");
    else {
      var alvo = Math.max(con || 0, dnMin || 0); res.dn = dns.filter(function (x) { return x >= alvo; })[0] || null; res.dnMinNorma = dnMin;
      passos.push((con != null ? "saída de dreno Ø " + fmt(con, 0) + " mm" : "saída de dreno não consta do catálogo") + (dnMin != null ? "; mínimo " + dnMin + " mm (NBR 16655-1 4.5.4)" : "") + " → tubo DN " + res.dn);
    }
    var imin = r1655("dreno_inclinacao_min");
    if (!imin.ok) imin = ctx ? ctx.consulta("cl.dreno.inclinacao_minima", null, "valor", "dreno") : { ok: false };
    if (imin.ok) { res.inclinacaoMin_pct = num(imin.valor); res.inclinacaoFonte = imin.fonte; }
    /* vazão de condensado da ordem de 1 L/h por 12 000 BTU/h (4.5.4) — vai ao memorial */
    var vc = r1655("dreno_condensado"), CCd = dep("ClimCarga", "./climcarga.js");
    if (vc.ok && CCd && conj && conj.capacidade_BTUh) {
      var por = CCd.numeroAntesDe(vc.linha.unidade, /BTU/);
      if (por) { res.condensado_Lh = Math.round(conj.capacidade_BTUh / por * num(vc.valor) * 100) / 100; passos.push("condensado ≈ " + fmt(res.condensado_Lh, 2) + " L/h (" + vc.valor + " L/h por " + por + " BTU/h, NBR 16655-1 4.5.4)"); }
    }
    if (res.queda_m <= 0) { res.bomba = true; passos.push("destino " + fmt(-res.queda_m, 2) + " m ACIMA (ou no nível) da evaporadora: BOMBA DE DRENO"); }
    else if (res.comprimentoH_m > 0) {
      res.inclinacaoDisp_pct = r3(res.queda_m / res.comprimentoH_m * 100);
      if (res.inclinacaoMin_pct == null) passos.push("queda de " + fmt(res.queda_m, 2) + " m em " + fmt(res.comprimentoH_m, 2) + " m (" + fmt(res.inclinacaoDisp_pct, 2) + " %): inclinação mínima pendente de fonte");
      else if (res.inclinacaoDisp_pct < res.inclinacaoMin_pct) { res.bomba = true; passos.push("inclinação disponível " + fmt(res.inclinacaoDisp_pct, 2) + " % < mínima " + fmt(res.inclinacaoMin_pct, 2) + " %: BOMBA DE DRENO"); }
      else passos.push("inclinação disponível " + fmt(res.inclinacaoDisp_pct, 2) + " % ≥ mínima " + fmt(res.inclinacaoMin_pct, 2) + " %: por gravidade");
    }
    /* traçado: horizontal com a inclinação mínima (ou nível, com bomba) até sobre o destino, e desce */
    var i = res.bomba || res.inclinacaoMin_pct == null ? 0 : res.inclinacaoMin_pct / 100, yH = evapPos.y - i * res.comprimentoH_m;
    /* B6: dreno recalcado vai como "bomba" (o biminst não cobra inclinação de trecho bombeado) */
    var pts = [{ x: evapPos.x, y: evapPos.y, z: evapPos.z }, { x: dd.x, y: evapPos.y - i * Math.abs(dd.x - evapPos.x), z: evapPos.z }, { x: dd.x, y: yH, z: dd.z }, { x: dd.x, y: dd.y, z: dd.z }];
    for (var k = 1; k < pts.length; k++) { var a = pts[k - 1], b = pts[k]; if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) > EPS) res.segmentos.push({ p1: a, p2: b, aplicacao: res.bomba ? "bomba" : (Math.abs(b.y - a.y) > Math.abs(b.x - a.x) + Math.abs(b.z - a.z) ? "parede" : (forro ? "forro" : "parede")) }); }
    /* destino "externo" (pé da condensadora, sem ponto de pluvial/esgoto): nunca ok — gotejar na fachada não */
    if (dd.tipo === "externo") { pend.push("destino do dreno (externo: ligar a pluvial/esgoto)"); if (ctx) ctx.pendencia("dreno.destino", "dreno sem ponto de pluvial/esgoto no modelo: levado ao pé da condensadora", "dreno"); }
    res.status = pend.length || (!res.bomba && res.inclinacaoMin_pct == null) ? "pendente" : "ok";
    return res;
  }

  /* ----------------------------------------------------------- DUTO
   * igual perda de carga: D tal que Δp/L = R; retangular de mesma perda
   * (Huebscher) pela razão de aspecto pedida (1 = quadrado). */
  function duto(Q_m3h, L_m, opc, ctx, uso) {
    opc = opc || {};
    var passos = [], pend = [], res = { vazao_m3h: Q_m3h, status: "pendente", passos: passos, pendencias: pend };
    function de(campo, chave, filtro, col) {
      if (num(opc[campo]) != null) { passos.push(campo + " = " + opc[campo] + " (entrada)"); return num(opc[campo]); }
      var c = ctx ? ctx.consulta(chave, filtro, col, "duto" + (uso ? " (" + uso + ")" : "")) : { ok: false };
      if (c.ok) return num(c.valor);
      pend.push(chave); return null;
    }
    var R = de("perdaUnitaria_Pa_m", "cl.duto.perda_unitaria", null, "valor"), eps = de("rugosidade_mm", "cl.duto.rugosidade", { material: "duto_chapa" }, "epsilon_mm");
    var CC = dep("ClimCarga", "./climcarga.js"), usoT = CC ? CC.rotuloDe("cl.duto.velocidade_maxima", uso) : null;
    var vmax = num(opc.velocidadeMax_ms) != null || usoT ? de("velocidadeMax_ms", "cl.duto.velocidade_maxima", { trecho: opc.trecho || "principal", uso: usoT }, "v_ms") : null;
    if (vmax == null && !usoT && num(opc.velocidadeMax_ms) == null) { pend.push("cl.duto.velocidade_maxima[uso=" + uso + "]"); if (ctx) ctx.pendencia("cl.duto.velocidade_maxima[uso=" + uso + "]", "uso sem rótulo na tabela de velocidades", "duto"); }
    if (Q_m3h == null) { pend.push("vazão de ar"); return res; }
    if (R == null || eps == null) { passos.push("perda unitária ou rugosidade sem fonte: diâmetro não calculado"); return res; }
    var Q = Q_m3h / 3600, Dc = diametroIgualPerda(Q, R, eps / 1000, RHO_PADRAO), razao = num(opc.razaoAspecto) || 1, ret = retangularDe(Dc, razao);
    var v = Q / (Math.PI * Dc * Dc / 4), vR = Q / (ret.a * ret.b);   /* clim:ok área do círculo */
    res.De_mm = Math.round(Dc * 1000); res.a_mm = Math.round(ret.a * 1000); res.b_mm = Math.round(ret.b * 1000); res.velocidade_ms = r3(vR); res.velocidadeCircular_ms = r3(v);
    res.perda_Pa = L_m != null ? r3(R * L_m) : null;
    passos.push("D (igual perda, R = " + fmt(R, 2) + " Pa/m, ε = " + fmt(eps, 3) + " mm) = " + res.De_mm + " mm; retangular " + res.a_mm + " × " + res.b_mm + " mm (Huebscher, razão " + fmt(razao, 2) + ")");   /* clim:ok casas na formatação */
    passos.push("v = Q/A = " + fmt(Q, 4) + " / (" + fmt(ret.a, 3) + " × " + fmt(ret.b, 3) + ") = " + fmt(vR, 2) + " m/s");   /* clim:ok casas na formatação */
    if (vmax == null) { res.verificacaoVelocidade = { status: "pendente", valor: vR, limite: null }; }
    else res.verificacaoVelocidade = { status: vR <= vmax ? "ok" : "reprovado", valor: r3(vR), limite: vmax };
    /* NBR 16401-1:2024 (lida no texto): velocidade máxima da CLASSE DE PRESSÃO do duto (Tabela 1; classe não indicada = 250,
       10.4.1.3) e a perda unitária dentro dos valores usuais (10.2.3.1: 0,7 a 5,0 Pa/m) */
    if (ctx) {
      var rg = function (par) { var c = ctx.consulta("cl.nbr16401_1.regras", { parametro: par }, "valor", "duto (NBR 16401-1)"); return c.ok ? num(c.valor) : null; };
      var classe = num(opc.classePressao_Pa) != null ? num(opc.classePressao_Pa) : rg("classe_pressao_padrao");
      var cv = classe != null ? ctx.consulta("cl.nbr16401_1.duto_classe_pressao", { classe_pa: classe }, "v_max_ms", "duto (classe de pressão)") : { ok: false };
      res.verificacaoClasse = cv.ok ? { status: vR <= num(cv.valor) ? "ok" : "reprovado", valor: r3(vR), limite: num(cv.valor), classe_Pa: classe, item: "NBR 16401-1 Tabela 1" + (num(opc.classePressao_Pa) == null ? " (classe 250 por 10.4.1.3)" : "") }
                                    : { status: "pendente", valor: r3(vR), limite: null, classe_Pa: classe };
      var pMin = rg("perda_unitaria_min"), pMax = rg("perda_unitaria_max");
      res.verificacaoPerda = pMin != null && pMax != null ? { status: R >= pMin && R <= pMax ? "ok" : "reprovado", valor: R, de: pMin, a: pMax, item: "NBR 16401-1 10.2.3.1" } : { status: "pendente", valor: R };
      passos.push("classe de pressão " + classe + " Pa: v ≤ " + (cv.ok ? fmt(num(cv.valor), 1) : "—") + " m/s; perda unitária " + fmt(R, 2) + " Pa/m na faixa " + fmt(pMin, 1) + " a " + fmt(pMax, 1) + " Pa/m (NBR 16401-1)");
    }
    var rep = [res.verificacaoVelocidade, res.verificacaoClasse, res.verificacaoPerda].some(function (v) { return v && v.status === "reprovado"; });
    res.status = pend.length ? "pendente" : (rep ? "reprovado" : "ok");
    return res;
  }

  /* vazão de insuflamento pela carga sensível (ρ·cp·ΔT) quando o catálogo não traz a vazão */
  function vazaoPelaCarga(sensivel_W, opc, ctx) {
    var dT = opc && num(opc.deltaT_K) != null ? num(opc.deltaT_K) : null;
    if (dT == null && ctx) { var c = ctx.consulta("cl.insuflamento.delta_t", null, "valor", "vazão de insuflamento"); if (c.ok) dT = num(c.valor); }
    var CC = dep("ClimCarga", "./climcarga.js");
    if (dT == null || !CC) return null;
    return sensivel_W / CC.psicro.arSensivel_W(1, RHO_PADRAO, 0, dT);   /* m³/h: Qs / (calor de 1 m³/h com ΔT) */
  }

  function terminais(Q_m3h, n, ctx, alvo) {
    var k = Math.max(1, num(n) || 1);
    if (ctx) ctx.pendencia("catalogo.clim.terminais", "seleção de grelha/difusor (alcance, ruído, perda) sem catálogo extraído (Trox/Tropical)", "terminais de " + (alvo || "?"));
    return { quantidade: k, vazaoCada_m3h: Q_m3h == null ? null : r3(Q_m3h / k), status: "pendente", passos: ["seleção do modelo pendente de catálogo (Trox/Tropical)"] };
  }

  var ClimRede = { VERSAO: 1, frigorigena: frigorigena, dreno: dreno, duto: duto, vazaoPelaCarga: vazaoPelaCarga, terminais: terminais,
                   fisica: { perdaUnit: perdaUnit, diametroIgualPerda: diametroIgualPerda, huebscher: huebscher, retangularDe: retangularDe, colebrook: colebrook, RHO_PADRAO: RHO_PADRAO } };
  global.ClimRede = ClimRede;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimRede;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
