/* =====================================================================
 * hidbombas.js — RECALQUE: altura manométrica, NPSH disponível, curva do
 * sistema, ponto de operação e escolha da bomba (motor PURO, ES5,
 * Node-testável). Fase 1 do docs/hidro/PLANO-HIDROSSANITARIO.md; contrato
 * em docs/hidro/CONTRATO.md (resultado.recalque).
 *
 *   AMT   = Hg + hf_sucção + hf_recalque + pressão residual
 *           Hg = nível de chegada − nível mínimo de sucção
 *   NPSHd = (p_atm − p_vapor)/(ρg) + (NA_sucção − cota da bomba) − hf_sucção
 *           p_atm pela altitude (atmosfera padrão ISO 2533), p_vapor pela
 *           temperatura (CRC) — física, em js/hidhidraulica.js
 *   curva do sistema H(Q) com as MESMAS perdas (js/hidperda.js), ponto de
 *   operação = cruzamento com a curva da bomba (interpolação linear entre os
 *   pontos do catálogo), aprovada se Q_op ≥ Q pedido e NPSHd ≥ NPSHr + margem.
 *
 * Catálogo de bombas (formato simples, o catálogo de verdade vem da F2):
 *   [{ id, nome, fabricante, curva: [{ q_m3h, h_m }], npshr: [{ q_m3h, npshr_m }], potencia_cv }]
 *
 * ⚠ Nenhum valor de norma aqui: margem de NPSH e velocidades limite vêm do
 *   HidNormas (ou da entrada, como premissa do RT). Faltou → pendente.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v !== null && v !== "" && isFinite(n) ? n : d; }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function HP() { return dep("HidPerda", "./hidperda.js"); }
  function f2(v) { return v == null ? "—" : String(Math.round(v * 100) / 100).replace(".", ","); }
  var S_POR_H = 3600, LS = 1000;   /* s por hora; L por m³ */

  /* interpolação linear numa curva [{x, y}] ordenada; fora da faixa = null */
  function interp(pts, x, kx, ky) {
    var p = pts.slice().sort(function (a, b) { return num(a[kx], 0) - num(b[kx], 0); });
    if (!p.length || x < num(p[0][kx], 0) || x > num(p[p.length - 1][kx], 0)) return null;
    for (var i = 1; i < p.length; i++) {
      var a = p[i - 1], b = p[i], xa = num(a[kx], 0), xb = num(b[kx], 0);
      if (x <= xb) return xb === xa ? num(b[ky], 0) : num(a[ky], 0) + (num(b[ky], 0) - num(a[ky], 0)) * (x - xa) / (xb - xa);
    }
    return null;
  }

  /* a linha (sucção ou recalque): explícita { material, dn, comprimento_m, conexoes[] }
     ou pelos trechos do modelo (ids) — comprimento somado, material/DN do 1º, e as
     conexões deduzidas pelo biminst cujos ramos estão todos na linha */
  function linha(def, ids, R) {
    if (def && def.material) return { material: def.material, dn: num(def.dn, null), comprimento_m: num(def.comprimento_m, 0), conexoes: arr(def.conexoes).slice(), trechos: [] };
    if (!arr(ids).length || !R) return null;
    var ts = arr(R.trechos).filter(function (t) { return ids.indexOf(t.id) >= 0; });
    if (!ts.length) return null;
    var cx = arr(R.conexoes).filter(function (c) { return c.ramos.length && c.ramos.every(function (r) { return ids.indexOf(r) >= 0; }); })
      .map(function (c) { return c.tipo === "te" ? "te_passagem_direta" : (c.tipo === "te_reducao" ? "reducao" : c.tipo); });
    return { material: ts[0].material, dn: ts[0].dn, comprimento_m: ts.reduce(function (s, t) { return s + t.comprimento; }, 0), conexoes: cx, trechos: ts.map(function (t) { return t.id; }) };
  }

  /* calcular(recalque, ctx, R) — R = BimInst.rede(...) quando a linha vem dos trechos */
  function calcular(rec, ctx, R) {
    var H = HH();
    rec = rec || {}; ctx = ctx || NR().contexto();
    var out = { status: "ok", vazao_m3h: null, Hg_m: null, perdaSuccao_m: null, perdaRecalque_m: null, AMT_m: null, NPSHd_m: null,
                curvaSistema: [], escolha: null, ranking: [], verificacoes: [], avisos: [], premissas: [], passos: [] };
    function premissa(item, valor) { if (!out.premissas.some(function (p) { return p.item === item; })) out.premissas.push({ item: item, valor: valor, origem: "padrao_motor" }); }
    function verif(alvo, nome, valor, limite, unidade, eta, ok, passos, fonte) {
      out.verificacoes.push({ id: "bo-v" + out.verificacoes.length, sistema: "recalque", alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unidade, eta: eta, ok: ok,
                              status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), passos: passos || [], fonte: fonte || null });
    }
    function aviso(grav, texto, elementos, corrigir) { out.avisos.push({ id: "bo-" + out.avisos.length, sistema: "recalque", gravidade: grav, texto: texto, elementos: elementos || [], corrigir: corrigir || null }); }
    var fluido = H.agua(rec.temperatura_C == null ? H.T_PADRAO_C : rec.temperatura_C);
    var PD = HP().criar(ctx, fluido, rec.formulaPerda || "auto", premissa);

    /* vazão de recalque */
    var q3h = num(rec.vazao_m3h, null);
    if (q3h == null && num(rec.consumoDiario_L, null) != null && num(rec.horasFuncionamento, null) > 0) {
      q3h = num(rec.consumoDiario_L, 0) / LS / num(rec.horasFuncionamento, 0);
      out.passos.push("Q = consumo diário ÷ horas de funcionamento = " + f2(num(rec.consumoDiario_L, 0) / LS) + " m³ ÷ " + rec.horasFuncionamento + " h = " + f2(q3h) + " m³/h");
    }
    if (q3h == null) { ctx.pendencia("entrada.recalque.vazao_m3h", "vazão de recalque não informada (vazao_m3h, ou consumoDiario_L + horasFuncionamento)", "recalque"); out.status = "pendente"; return out; }
    out.vazao_m3h = q3h;
    ["nivelSuccao", "nivelChegada", "cotaBomba"].forEach(function (k) { if (num(rec[k], null) == null) ctx.pendencia("entrada.recalque." + k, "cota não informada", "recalque"); });
    if (num(rec.nivelSuccao, null) == null || num(rec.nivelChegada, null) == null || num(rec.cotaBomba, null) == null) { out.status = "pendente"; return out; }
    var Ls = linha(rec.succao, rec.trechosSuccao, R), Lr = linha(rec.recalque, rec.trechosRecalque, R);
    if (!Ls || !Lr) { ctx.pendencia("entrada.recalque." + (!Ls ? "succao" : "recalque"), "linha de " + (!Ls ? "sucção" : "recalque") + " não informada (trechos do modelo ou {material, dn, comprimento_m})", "recalque"); out.status = "pendente"; return out; }
    out.linhas = { succao: Ls, recalque: Lr };

    /* perda numa linha para a vazão q (m³/h) — distribuída + localizadas */
    function perdaLinha(L, q, nome) {
      var d = PD.di(L.material, L.dn, nome); if (d == null) return null;
      var qls = q * LS / S_POR_H, dist = PD.distribuida(qls, d, L.comprimento_m, L.material, nome); if (!dist) return null;
      var loc = 0, ok = true, cxs = [];
      L.conexoes.forEach(function (cx) { var pl = PD.local(cx, L.material, L.dn, dist.J, dist.v, nome); if (pl) { loc += pl.perda_m; cxs.push(pl); } else ok = false; });
      if (!ok) return null;
      return { hf: dist.hf + loc, v: dist.v, J: dist.J, distribuida: dist.hf, localizada: loc, conexoes: cxs, passos: dist.passos };
    }
    var ps = perdaLinha(Ls, q3h, "sucção"), pr = perdaLinha(Lr, q3h, "recalque");
    var Hg = num(rec.nivelChegada, 0) - num(rec.nivelSuccao, 0), pres = num(rec.pressaoResidual_m, 0);
    out.Hg_m = Hg;
    if (!ps || !pr) { out.status = "pendente"; out.passos.push("pendente: perda de carga da " + (!ps ? "sucção" : "recalque") + " sem tabela"); return out; }
    out.perdaSuccao_m = ps.hf; out.perdaRecalque_m = pr.hf;
    out.AMT_m = Hg + ps.hf + pr.hf + pres;
    out.passos.push("AMT = Hg + hf_s + hf_r + residual = " + f2(Hg) + " + " + f2(ps.hf) + " + " + f2(pr.hf) + " + " + f2(pres) + " = " + f2(out.AMT_m) + " m");
    var patm = H.pressaoAtmosferica(num(rec.altitude_m, 0)), hs = num(rec.nivelSuccao, 0) - num(rec.cotaBomba, 0);
    function npshd(q) { var p = perdaLinha(Ls, q, "sucção"); return p ? H.kpaParaM(patm - fluido.pv_kpa, fluido.rho) + hs - p.hf : null; }
    out.NPSHd_m = npshd(q3h);
    out.passos.push("NPSHd = (p_atm − p_v)/ρg + h_s − hf_s = (" + f2(patm) + " − " + f2(fluido.pv_kpa) + ") kPa/ρg " + (hs >= 0 ? "+ " : "− ") + f2(Math.abs(hs)) + " − " + f2(ps.hf) + " = " + f2(out.NPSHd_m) + " m (altitude " + num(rec.altitude_m, 0) + " m, água a " + fluido.T + " °C)");
    if (rec.altitude_m == null) premissa("altitude do local (NPSH)", "não informada: nível do mar (o NPSHd real é MENOR em altitude — informe)");

    /* NBR 5626:2020, 6.5.11.7: a perda do dispositivo de proteção da sucção (crivo/válvula de pé) entra no
       NPSH disponível — sem ele nas conexões da sucção, a conta fica otimista: avisa com a correção */
    if (!Ls.conexoes.some(function (c) { return /crivo|protecao/.test(String(c)); }))
      aviso("aviso", "sucção sem dispositivo de proteção (crivo/válvula de pé) nas conexões: a perda dele não entra no NPSHd (NBR 5626:2020, 6.5.11.7)", Ls.trechos, { texto: "incluir \"valvula_pe_crivo\" nas conexões da sucção" });
    /* NBR 5626:2020, 6.5.11.2: recalque/pressurização com no mínimo 2 bombas independentes */
    var cB = NR().consulta("bombas.minimo", null, "valor"), qB = num(rec.quantidadeBombas, null);
    if (!cB.ok) { ctx.consulta("bombas.minimo", null, "valor", "recalque"); verif("bombas", "número de bombas (6.5.11.2)", qB, null, "un", null, null, ["pendente: " + cB.motivo], null); }
    else {
      var minB = num(ctx.consulta("bombas.minimo", null, "valor", "recalque").valor, 0);
      if (qB == null) { ctx.pendencia("entrada.recalque.quantidadeBombas", "número de bombas não informado (a NBR 5626:2020, 6.5.11.2, pede no mínimo " + minB + " independentes)", "recalque");
                        verif("bombas", "número de bombas (6.5.11.2)", null, minB, "un", null, null, ["pendente: informe entrada.recalque.quantidadeBombas"], cB.fonte); }
      else { var okB = qB >= minB; verif("bombas", "número de bombas (6.5.11.2)", qB, minB, "un", minB / qB, okB, [qB + " bomba(s) ≥ " + minB + " independentes (uma reserva)"], cB.fonte);
             if (!okB) aviso("erro", "recalque com " + qB + " bomba(s): a NBR 5626:2020 (6.5.11.2) pede no mínimo " + minB + " independentes", [], { texto: "prever " + minB + " bombas (uma de reserva)" }); }
    }

    /* velocidades (limites da tabela, se houver) */
    [["sucção", ps, "bombas.velocidade.succao_maxima"], ["recalque", pr, "bombas.velocidade.recalque_maxima"]].forEach(function (x) {
      var c = ctx.consulta(x[2], null, "valor", "recalque — velocidade na " + x[0]);
      if (!c.ok) verif(x[0], "velocidade na " + x[0], x[1].v, null, "m/s", null, null, ["pendente: " + c.motivo], null);
      else { var lim = num(c.valor, 0); verif(x[0], "velocidade na " + x[0], x[1].v, lim, "m/s", x[1].v / lim, x[1].v <= lim, ["v = " + f2(x[1].v) + " m/s ≤ " + f2(lim) + " m/s"], c.fonte);
        if (x[1].v > lim) aviso("erro", "velocidade na " + x[0] + " de " + f2(x[1].v) + " m/s acima de " + f2(lim) + " m/s", (x[0] === "sucção" ? Ls : Lr).trechos, { texto: "aumentar o DN da " + x[0] }); }
    });

    /* curva do sistema nos pontos dos catálogos (e em 0, Q e 2Q) */
    var bombas = arr(rec.bombas), qs = [0, q3h, 2 * q3h];
    bombas.forEach(function (b) { arr(b.curva).forEach(function (p) { qs.push(num(p.q_m3h, 0)); }); });
    qs = qs.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    function Hsis(q) { if (!(q > 0)) return Hg + pres; var a = perdaLinha(Ls, q, "sucção"), b = perdaLinha(Lr, q, "recalque"); return a && b ? Hg + pres + a.hf + b.hf : null; }
    out.curvaSistema = qs.map(function (q) { return { q_m3h: q, h_m: Hsis(q) }; });

    /* margem de NPSH: tabela, ou a entrada (premissa do RT) */
    var cm = NR().consulta("bombas.npsh.margem", null, "valor"), margem = null, fonteM = null;
    if (cm.ok) { margem = num(ctx.consulta("bombas.npsh.margem", null, "valor", "recalque").valor, null); fonteM = cm.fonte; }
    else if (num(rec.margemNpsh_m, null) != null) { margem = num(rec.margemNpsh_m, 0); out.premissas.push({ item: "margem de NPSH", valor: margem + " m", origem: "entrada" }); }
    else ctx.consulta("bombas.npsh.margem", null, "valor", "recalque — NPSH");

    /* ponto de operação de cada bomba: bisseção em H_b(Q) − H_s(Q) (decrescente) */
    var TOL_Q = 1e-6;   // hid:ok precisão numérica da bisseção (m³/h)
    bombas.forEach(function (b) {
      var cur = arr(b.curva), r = { id: b.id, nome: b.nome, fabricante: b.fabricante, potencia_cv: num(b.potencia_cv, null), q_op: null, h_op: null, npshr: null, npshd: null, aprovada: false, motivos: [] };
      if (cur.length < 2) { r.motivos.push("curva com menos de 2 pontos"); out.ranking.push(r); return; }
      var qMax = Math.max.apply(null, cur.map(function (p) { return num(p.q_m3h, 0); })), qMin = Math.min.apply(null, cur.map(function (p) { return num(p.q_m3h, 0); }));
      function f(q) { var hb = interp(cur, q, "q_m3h", "h_m"), hs2 = Hsis(q); return hb == null || hs2 == null ? null : hb - hs2; }
      var a = qMin, z = qMax, fa = f(a), fz = f(z);
      if (fa == null || fz == null) { r.motivos.push("curva do sistema pendente"); out.ranking.push(r); return; }
      if (fa < 0) { r.motivos.push("não vence a altura do sistema nem na vazão mínima da curva (" + f2(interp(cur, a, "q_m3h", "h_m")) + " m < " + f2(Hsis(a)) + " m)"); out.ranking.push(r); return; }
      if (fz > 0) { r.q_op = z; r.motivos.push("opera além do fim da curva do catálogo (ponto fora da faixa)"); }
      else { while (z - a > TOL_Q) { var m = (a + z) / 2; if (f(m) > 0) a = m; else z = m; } r.q_op = (a + z) / 2; }
      r.h_op = interp(cur, r.q_op, "q_m3h", "h_m");
      r.npshd = npshd(r.q_op);
      r.npshr = arr(b.npshr).length ? interp(b.npshr, r.q_op, "q_m3h", "npshr_m") : null;
      var okQ = r.q_op >= q3h - TOL_Q;
      if (!okQ) r.motivos.push("vazão no ponto de operação " + f2(r.q_op) + " m³/h < " + f2(q3h) + " m³/h pedidos");
      var okN = null;
      if (r.npshr == null) r.motivos.push("NPSH requerido fora da curva do catálogo");
      else if (margem == null) r.motivos.push("margem de NPSH pendente");
      else { okN = r.npshd >= r.npshr + margem; if (!okN) r.motivos.push("cavita: NPSHd " + f2(r.npshd) + " m < NPSHr " + f2(r.npshr) + " + margem " + f2(margem) + " m"); }
      if (fz > 0) okQ = false;
      r.aprovada = okQ && okN === true;
      out.ranking.push(r);
    });
    /* escolha: aprovada de menor potência (sem potência: a de menor folga de vazão) */
    var ap = out.ranking.filter(function (r) { return r.aprovada; }).sort(function (x, y) { return (x.potencia_cv == null || y.potencia_cv == null ? 0 : x.potencia_cv - y.potencia_cv) || (x.q_op - y.q_op); });
    out.escolha = ap[0] || null;
    if (bombas.length) {
      if (out.escolha) verif(out.escolha.id, "bomba escolhida", out.escolha.q_op, q3h, "m³/h", q3h / out.escolha.q_op, true,
                             ["ponto de operação: Q = " + f2(out.escolha.q_op) + " m³/h, H = " + f2(out.escolha.h_op) + " m; NPSHd " + f2(out.escolha.npshd) + " m ≥ NPSHr " + f2(out.escolha.npshr) + " + " + f2(margem) + " m"], fonteM);
      else { verif("bomba", "bomba escolhida", null, q3h, "m³/h", null, margem == null ? null : false, out.ranking.map(function (r) { return r.nome + ": " + r.motivos.join("; "); }), fonteM);
             aviso("erro", "nenhuma bomba do catálogo atende Q = " + f2(q3h) + " m³/h e AMT = " + f2(out.AMT_m) + " m", [], { texto: "ampliar o catálogo, aumentar o DN do recalque (baixa a AMT) ou rebaixar a bomba (NPSH)" }); }
    }
    var sts = out.verificacoes.map(function (v) { return v.status; });
    out.status = sts.indexOf("reprovado") >= 0 ? "reprovado" : (sts.indexOf("pendente") >= 0 ? "pendente" : "ok");
    return out;
  }

  var HidBombas = { VERSAO: 1, calcular: calcular, interp: interp, linha: linha };
  global.HidBombas = HidBombas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidBombas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
