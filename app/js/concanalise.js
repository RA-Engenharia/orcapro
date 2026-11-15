/* =====================================================================
 * concanalise.js — ANÁLISE do pórtico de concreto (fase C1, 14/11/2026). Motor PURO (ES5, Node-testável, sem DOM).
 * Orquestra: ConcModelo (peças BIM → nós/barras) → ConcCargas (casos) → ConcCombina (ELU/ELS) → AcoAnalise (o solver REAPROVEITADO;
 * proibido escrever outro) uma vez por combinação, e devolve esforços por barra, deslocamentos, reações, equilíbrio e γz.
 *
 *  · esforços/deslocamentos/reações das combinações: análise LINEAR de 1ª ordem com a rigidez BRUTA (E = Ecs, seção bruta);
 *  · γz (NBR 6118 15.5.3): para cada combinação ELU com vento, nova análise de 1ª ordem com a rigidez REDUZIDA do 15.7.3
 *    (vigas 0,4·Eci·Ic, pilares 0,8·Eci·Ic); γz = 1 / (1 − ΔMtot,d / M1,tot,d), M1 = Σ H_k·(y_k − y_fundação) com os H de cálculo da
 *    combinação, ΔM = Σ P_k·δ_k (P_k = cargas verticais de cálculo do pavimento k, δ_k = deslocamento horizontal médio dos nós de
 *    topo do pavimento NA DIREÇÃO do vento). Vale para ≥ 4 andares (aplicavel:false abaixo disso — calcula e avisa); nós fixos se γz ≤ 1,1.
 *    Sem vento (informado) não há forças horizontais: γz "não calculado".
 *  · EQUILÍBRIO: ΣR das reações × Σ das cargas aplicadas, por combinação (o teste exige ΣF = 0).
 *
 * API  ConcAnalise.rodar(estado, opc) → { ok, motivo, modelo, cargas, combinacoes, resultados:{comb:{...}}, gammaZ:[...], equilibrio:{...},
 *                                         avisos, pendencias, premissas, semFonte }
 *   opc = as de ConcModelo.montar + ConcCargas.gerar + ConcCombina.gerar (+ estacoes)
 *   ConcAnalise.resolver(m, cargas, combs, opc) → só as etapas do solver (para teste com modelo/cargas montados à mão)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function cv(k, d) { var D = dep("ConcDadosCalc", "./concdadoscalc.js"); return D ? D.v(k, d) : d; }

  /* 6118 15.7.2: γz ≤ 1,3 admite o processo aproximado (esforços horizontais × 0,95·γz). Os valores moram em calculo.json (gammaZTetoProcessoAproximado, gammaZFatorEsforcosHorizontais, norma-lida, PDF 124 / p. 106); os números abaixo são só o padrão se o dado faltar. */
  var GZ_TETO = 1.3, GZ_FATOR = 0.95;

  function envolver(res) {
    var env = {};
    Object.keys(res.barras || {}).forEach(function (bid) {
      var e = { Nmax: -1e30, Nmin: 1e30, Vymax: 0, Vzmax: 0, Mzmax: -1e30, Mzmin: 1e30, Mymax: -1e30, Mymin: 1e30, Tmax: 0 };
      arr(res.barras[bid].estacoes).forEach(function (s) {
        e.Nmax = Math.max(e.Nmax, s.N); e.Nmin = Math.min(e.Nmin, s.N); e.Vymax = Math.max(e.Vymax, Math.abs(s.Vy)); e.Vzmax = Math.max(e.Vzmax, Math.abs(s.Vz));
        e.Mzmax = Math.max(e.Mzmax, s.Mz); e.Mzmin = Math.min(e.Mzmin, s.Mz); e.Mymax = Math.max(e.Mymax, s.My); e.Mymin = Math.min(e.Mymin, s.My); e.Tmax = Math.max(e.Tmax, Math.abs(s.T));
      });
      env[bid] = e;
    });
    return env;
  }

  function resolver(m, cargas, cb, opc) {
    opc = opc || {};
    var AA = dep("AcoAnalise", "./acoanalise.js"), avisos = [], premissas = [];
    if (!AA) return { ok: false, motivo: "js/acoanalise.js ausente" };
    var modelo = m.modelo("bruta");
    modelo.casos = cargas.casos.map(function (c) { return { id: c.id, nome: c.nome, cargas: c.cargas }; });
    var combs = cb.combinacoes.map(function (c) { return { id: c.id, fatores: c.fatores }; });
    var an = AA.analisar(modelo, { combinacoes: combs, estacoes: num(opc.estacoes, 9) });
    if (!an.ok) return { ok: false, motivo: an.motivo || "análise falhou", avisos: an.avisos };
    (an.avisos || []).forEach(function (a) { avisos.push("AcoAnalise: " + a); });
    var resultados = {}, equilibrio = {}, totalCaso = cargas.totais;
    cb.combinacoes.forEach(function (c) {
      var r = an.combinacoes[c.id], sum = [0, 0, 0], k;
      Object.keys(r.reacoes || {}).forEach(function (nid) { for (k = 0; k < 3; k++) sum[k] += r.reacoes[nid][k]; });
      var aplicado = [0, 0, 0], porCaso = {};
      Object.keys(c.fatores).forEach(function (cid) {
        if (totalCaso[cid] != null) { aplicado[1] -= c.fatores[cid] * totalCaso[cid]; return; }
        arr(cargas.forcasHorizontais).forEach(function (f) { if (f.caso === cid) { aplicado[0] += c.fatores[cid] * f.F * f.dir[0]; aplicado[2] += c.fatores[cid] * f.F * f.dir[2]; } });
        arr(cargas.forcasDesaprumo).forEach(function (f) { if (f.caso === cid) { aplicado[0] += c.fatores[cid] * f.F * f.dir[0]; aplicado[2] += c.fatores[cid] * f.F * f.dir[2]; } });
      });
      var esc = Math.max(Math.abs(aplicado[0]), Math.abs(aplicado[1]), Math.abs(aplicado[2]), 1e-9);
      equilibrio[c.id] = { somaReacoes: sum, somaCargas: aplicado, residuo: [sum[0] + aplicado[0], sum[1] + aplicado[1], sum[2] + aplicado[2]], erroRelativo: Math.max(Math.abs(sum[0] + aplicado[0]), Math.abs(sum[1] + aplicado[1]), Math.abs(sum[2] + aplicado[2])) / esc };
      var dmin = 0, dno = null; Object.keys(r.desloc || {}).forEach(function (nid) { if (r.desloc[nid][1] < dmin) { dmin = r.desloc[nid][1]; dno = nid; } });
      resultados[c.id] = { tipo: c.tipo, nome: c.nome, fatores: c.fatores, esforcos: r.barras, deslocamentos: r.desloc, reacoes: r.reacoes, envoltoria: envolver(r), deslocVerticalMax: { no: dno, valor: dmin } };
    });
    /* γz */
    var gz = [], eluVento = cb.combinacoes.filter(function (c) { return c.tipo === "ELU" && Object.keys(c.fatores).some(function (k) { return /^[WD][+-][XZ]$/.test(k); }); });
    var nNiv = m.niveis.length, aplic = nNiv >= cv("gammaZMinAndares", 4);
    if (!eluVento.length) avisos.push("γz não calculado: sem vento nem desaprumo não há forças horizontais na combinação (6118 15.5.3).");
    else {
      if (!aplic) avisos.push("γz: a estrutura tem " + nNiv + " pavimento(s) — a 6118 15.5.3 vale para no mínimo " + cv("gammaZMinAndares", 4) + " andares; o valor é informativo.");
      var modR = m.modelo("reduzida"); modR.casos = modelo.casos;
      var anR = AA.analisar(modR, { combinacoes: eluVento.map(function (c) { return { id: c.id, fatores: c.fatores }; }), estacoes: 2 });
      if (!anR.ok) avisos.push("γz: análise com rigidez reduzida falhou: " + (anR.motivo || "?"));
      else eluVento.forEach(function (c) {
        var rr = anR.combinacoes[c.id], M1 = 0, dM = 0, dir = null, wcaso = Object.keys(c.fatores).filter(function (k) { return /^W[+-][XZ]$/.test(k); })[0], dcaso = Object.keys(c.fatores).filter(function (k) { return /^D[+-][XZ]$/.test(k); })[0];
        arr(cargas.forcasHorizontais).forEach(function (f) { if (f.caso === wcaso) { M1 += c.fatores[wcaso] * f.F * (f.y - m.ymin); dir = f.dir; } });
        arr(cargas.forcasDesaprumo).forEach(function (f) { if (f.caso === dcaso) { M1 += c.fatores[dcaso] * f.F * (f.y - m.ymin); dir = f.dir; } });
        m.niveis.forEach(function (n) {
          var P = 0, pn = cargas.porNivel[String(Math.round(n.y * 100))];
          if (pn) Object.keys(c.fatores).forEach(function (k) { if (pn[k] != null) P += c.fatores[k] * pn[k]; });
          var d = 0; n.nos.forEach(function (nid) { var u = rr.desloc[nid]; d += u[0] * dir[0] + u[2] * dir[2]; }); d /= n.nos.length;
          dM += P * d;
        });
        var razao = M1 > 0 ? dM / M1 : NaN;
        gz.push({ combinacao: c.id, nome: c.nome, M1: M1, dM: dM, gammaZ: razao < 1 ? 1 / (1 - razao) : Infinity, nosFixos: razao < 1 && 1 / (1 - razao) <= cv("gammaZNosFixosMax", 1.1), aplicavel: aplic });
      });
    }
    /* ⚠ 15.7.2 (revisão de cálculo 14/11/2026): estrutura de nós móveis com 1,1 < γz ≤ 1,3 — os esforços HORIZONTAIS (vento e desaprumo) de cada combinação ELU são majorados
     * por 0,95·γz da PRÓPRIA combinação (a parcela vertical não muda). A análise é linear: refazer com os fatores de W/D multiplicados dá exatamente "vertical + 0,95·γz·horizontal".
     * Ficam em resultadosGz (só as combinações majoradas); resultados[] continua o de 1ª ordem — vigas e livros não mudam. Quem usa: ConcPilar.dimensionarDeAnalise.
     * γz > 1,3: o método aproximado não vale — o pilar sai "sem-cálculo" (nunca verde), decidido em ConcPilar. */
    var resultadosGz = {}, gzFix = cv("gammaZNosFixosMax", 1.1), gzTeto = cv("gammaZTetoProcessoAproximado", GZ_TETO), kGz = cv("gammaZFatorEsforcosHorizontais", GZ_FATOR);
    var gzMaj = gz.filter(function (g) { return g.aplicavel !== false && isFinite(g.gammaZ) && g.gammaZ > gzFix + 1e-9 && g.gammaZ <= gzTeto + 1e-9; });
    if (gzMaj.length) {
      var fatPorId = {}, kPorId = {};
      gzMaj.forEach(function (g) { kPorId[g.combinacao] = kGz * g.gammaZ; });
      var combsGz = cb.combinacoes.filter(function (c) { return kPorId[c.id] != null; }).map(function (c) {
        var f = {}; Object.keys(c.fatores).forEach(function (k) { f[k] = /^[WD][+-][XZ]$/.test(k) ? c.fatores[k] * kPorId[c.id] : c.fatores[k]; });
        fatPorId[c.id] = f; return { id: c.id, fatores: f };
      });
      var anGz = AA.analisar(modelo, { combinacoes: combsGz, estacoes: num(opc.estacoes, 9) });
      if (!anGz.ok) avisos.push("γz entre 1,1 e 1,3: a reanálise com a majoração 0,95·γz (15.7.2) falhou (" + (anGz.motivo || "?") + ") — os pilares NÃO foram majorados e ficam sem cálculo.");
      else gzMaj.forEach(function (g) {
        var r = anGz.combinacoes[g.combinacao]; if (!r) return;
        resultadosGz[g.combinacao] = { k: kPorId[g.combinacao], gammaZ: g.gammaZ, fatores: fatPorId[g.combinacao], esforcos: r.barras };
      });
      if (anGz.ok) avisos.push("γz máximo = " + Math.round(Math.max.apply(null, gzMaj.map(function (g) { return g.gammaZ; })) * 1000) / 1000 + " (> 1,1 e ≤ 1,3): nós MÓVEIS — esforços horizontais das combinações ELU de vento/desaprumo majorados por 0,95·γz no dimensionamento dos pilares (6118 15.7.2); vigas e deslocamentos seguem de 1ª ordem.");
    }
    premissas.push("Esforços e deslocamentos: análise linear de 1ª ordem, rigidez bruta (Ecs). γz: rigidez reduzida do 15.7.3 (vigas " + cv("rigidezVigaAsLinhaDiferente", 0.4) + ", pilares " + cv("rigidezPilar", 0.8) + " × Ecs·Ic, 6118:2023 15.7.3 e 15.5.1, sem a majoração opcional de 10 %).");
    return { ok: true, resultados: resultados, gammaZ: gz, equilibrio: equilibrio, resultadosGz: resultadosGz, avisos: avisos, premissas: premissas, tempoMs: an.tempoMs, nGL: an.nGL };
  }

  function rodar(estado, opc) {
    opc = opc || {};
    var CM = dep("ConcModelo", "./concmodelo.js"), CC = dep("ConcCargas", "./conccargas.js"), CB = dep("ConcCombina", "./conccombina.js"), D = dep("ConcDadosCalc", "./concdadoscalc.js");
    if (!CM || !CC || !CB || !D) return { ok: false, motivo: "módulos do cálculo de concreto ausentes" };
    var m = CM.montar(estado, opc); if (!m.ok) return { ok: false, motivo: m.motivo, avisos: m.avisos };
    var c = CC.gerar(m, estado, opc); if (!c.ok) return { ok: false, motivo: c.motivo };
    var cb = CB.gerar(c.casos, opc); if (!cb.ok) return { ok: false, motivo: cb.motivo };
    var s = resolver(m, c, cb, opc); if (!s.ok) return { ok: false, motivo: s.motivo, avisos: m.avisos.concat(c.avisos, s.avisos || []) };
    var sf = D.semFonte().map(function (x) { return x.chave + " (" + x.item + ")"; });
    return { ok: true, rotulo: D.rotulo, modelo: m, cargas: c, combinacoes: cb.combinacoes, resultados: s.resultados, resultadosGz: s.resultadosGz, gammaZ: s.gammaZ, equilibrio: s.equilibrio,
             avisos: m.avisos.concat(c.avisos, cb.avisos, s.avisos), pendencias: m.pendencias.concat(c.pendencias).concat(sf.map(function (t) { return "SEM FONTE: " + t; })),
             premissas: m.premissas.concat(c.premissas, s.premissas), semFonte: D.semFonte(), tempoMs: s.tempoMs };
  }

  var ConcAnalise = { rodar: rodar, resolver: resolver };
  global.ConcAnalise = ConcAnalise;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcAnalise;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
