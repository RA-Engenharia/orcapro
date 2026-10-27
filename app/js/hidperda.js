/* =====================================================================
 * hidperda.js — PERDA DE CARGA com as tabelas de norma (motor PURO, ES5,
 * Node-testável). Usado pela água fria (hidaf.js) e pelo recalque
 * (hidbombas.js): a mesma regra de fórmula, de comprimento equivalente e de
 * premissa nas duas contas — duas cópias acabariam divergindo.
 *
 * Fórmula por material ("auto", padrão — decisão do gerente 16/10/2026,
 * docs/hidro/CONTRATO.md §1.2): Darcy-Weisbach só se a rugosidade do material
 * estiver tabelada; senão Fair-Whipple-Hsiao de tubo liso, com os
 * coeficientes da tabela af.perda.fwh quando existe (forma da 5626: J kPa/m,
 * Q L/s, d mm) e a forma SI do artigo original quando não. "darcy", "fwh" e
 * "hw" forçam a fórmula.
 * Perda localizada: comprimento equivalente (material, conexão, DN) e, se a
 * linha faltar, K (conexão). MATERIAL COM K PRÓPRIO NA TABELA (linhas com a
 * coluna material — hoje o PPR, método do fabricante Amanco: Δh = ΣR·v²/2g):
 * vale SÓ o K dele; nunca vira comprimento equivalente e nunca cai na Leq do PVC. Luva e redução sem valor tabelado: desprezadas
 * como PREMISSA declarada (nunca em silêncio).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function num(v, d) { var n = Number(v); return v !== null && v !== "" && isFinite(n) ? n : d; }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function f2(v) { return v == null ? "—" : String(Math.round(v * 100) / 100).replace(".", ","); }
  function f3(v) { return v == null ? "—" : String(Math.round(v * 1000) / 1000).replace(".", ","); }
  var LS = 1000;   /* L por m³ */
  var MM = 1000;   /* mm por m */
  /* conexões que as tabelas de comprimento equivalente da prática não trazem */
  var SEM_PERDA_TABELADA = { luva: 1, reducao: 1, uniao: 1,   /* pendências finais (18/10/2026): a união, como a luva — sem valor tabelado */
    /* 27/10/2026 (frente 1b-ii, D6): a tabela de comprimento equivalente (Tigre 2025) só tem joelho 90/45, tê, entrada/saída e registros/válvulas. As peças novas de
       passagem (adaptador, bucha, luva de redução/de correr, cap, plug, transição, união mista) são tratadas como a LUVA: desprezadas, com a premissa declarada.
       Curva 90/45 na água NÃO entra aqui: sem linha na tabela é PENDÊNCIA honesta (no esgoto não há perda de carga). */
    adaptador: 1, luva_bucha: 1, adaptador_caixa: 1, bucha: 1, bucha_longa: 1, luva_reducao: 1, luva_correr: 1, cap: 1, plug: 1, transicao: 1, uniao_mista: 1 };
  var LISOS = { pvc_soldavel: 1, ppr: 1, cpvc: 1, cobre: 1 };

  /* criar(ctx, fluido, formula, premissa) — premissa(item, valor) registra o que o motor assumiu */
  function criar(ctx, fluido, formula, premissa) {
    var H = HH();
    formula = formula || "auto";
    premissa = premissa || function () {};
    var tabLeq = !!NR().tabela("af.perda.localizada.leq"), tabK = !!NR().tabela("af.perda.localizada.k");
    var parametroFormula = {}, formulaDe = {};

    /* ⚠ NBR 5626:2020, 6.14.4 (NOTA): "a equação universal (Darcy-Weisbach) é a mais indicada". Padrão
       ("auto", decisão do RT 17/10/2026): Darcy-Weisbach com a rugosidade do material de fonte citável.
       Material LISO (plástico, cobre) sem rugosidade tabelada: Darcy com a HIPÓTESE de tubo hidraulicamente
       liso (ε → 0, Colebrook liso), DECLARADA, comparada com Fair-Whipple-Hsiao — vale a MAIOR perda (lado
       seguro). Outro material sem rugosidade: pendência. FWH fica como conferência (passo) e opção forçada. */
    var hipLiso = {};
    function formulaMat(material) {
      if (formula !== "auto") return formula;
      if (formulaDe[material]) return formulaDe[material];
      formulaDe[material] = "darcy"; return "darcy";
    }
    function paramFormula(material, uso) {
      if (parametroFormula[material] !== undefined) return parametroFormula[material];
      var v = null, fm = formulaMat(material);
      if (fm === "darcy") {
        if (!NR().consulta("materiais.rugosidade", { material: material }, "epsilon_mm").ok && LISOS[material] && formula === "auto") {
          hipLiso[material] = true; v = 0;
          premissa("rugosidade de " + material, "sem rugosidade tabelada: hipótese de tubo hidraulicamente liso (ε → 0), comparada com Fair-Whipple-Hsiao; adotada a MAIOR perda");
        } else { var c = ctx.consulta("materiais.rugosidade", { material: material }, "epsilon_mm", uso); v = c.ok ? num(c.valor, null) / MM : null; }
      }
      else if (fm === "hw") { var c2 = ctx.consulta("materiais.hazen_williams_c", { material: material }, "c", uso); v = c2.ok ? num(c2.valor, null) : null; }
      else if (fm === "fwh") v = "liso";
      else ctx.pendencia("opcoes.formulaPerda", "fórmula de perda \"" + fm + "\" desconhecida (darcy, fwh, hw)", uso);
      parametroFormula[material] = v; return v;
    }
    /* Fair-Whipple-Hsiao de tubo liso (coeficientes da tabela da fonte quando há; senão a forma SI do artigo) */
    function fwh(q, d, L, uso, registrar) {
      var Q = q / LS, cf = NR().consulta("af.perda.fwh", { tipo: "liso" }, "coef");
      if (cf.ok) {
        if (registrar) ctx.consulta("af.perda.fwh", { tipo: "liso" }, "coef", uso);
        var Jk = num(cf.valor, 0) * Math.pow(q, num(cf.linha.exp_q, 0)) * Math.pow(d * MM, num(cf.linha.exp_d, 0)), J = H.kpaParaM(Jk, fluido.rho), v = H.velocidade(Q, d);
        return { formula: "fwh", J: J, hf: J * L, v: v, fonte: cf.fonte,
                 passos: ["v = Q/A = " + f3(v) + " m/s", "J = " + cf.valor + "·Q^" + cf.linha.exp_q + "·d^" + cf.linha.exp_d + " = " + f3(Jk) + " kPa/m = " + String(Math.round(J * 1e5) / 1e5).replace(".", ",") + " m/m (Fair-Whipple-Hsiao, tubo liso; Q em L/s, d = " + f2(d * MM) + " mm)", "hf = J·L = " + f3(J * L) + " m"] };   // hid:ok 1e5 = casas decimais do texto
      }
      return H.fairWhippleHsiao(Q, d, L, "liso");
    }
    function jTxt(J) { return String(Math.round(J * 1e5) / 1e5).replace(".", ","); }   // hid:ok 1e5 = casas decimais do texto
    /* q em L/s, d (diâmetro interno) em m, L em m → { J, hf, v, passos, … } ou null (pendente) */
    function distribuida(q, d, L, material, uso) {
      var p = paramFormula(material, uso), fm = formulaMat(material); if (p == null) return null;
      var Q = q / LS;
      if (fm === "darcy") {
        var dc = H.darcy(Q, d, L, p, fluido.nu);
        if (hipLiso[material]) {
          var fw = fwh(q, d, L, uso, true);
          if (fw.J > dc.J) { fw.passos.push("conferência Darcy-Weisbach (tubo liso, ε → 0): J = " + jTxt(dc.J) + " m/m — adotada a MAIOR (FWH)"); fw.formula = "fwh (maior que Darcy liso)"; return fw; }
          dc.passos.push("conferência Fair-Whipple-Hsiao: J = " + jTxt(fw.J) + " m/m — adotada a MAIOR (Darcy liso)");
          dc.formula = "darcy (liso, maior que FWH)";
          return dc;
        }
        if (LISOS[material] && Q > 0) dc.passos.push("conferência Fair-Whipple-Hsiao (tubo liso): J = " + jTxt(fwh(q, d, L, uso, false).J) + " m/m");
        return dc;
      }
      if (fm === "hw") return H.hazenWilliams(Q, d, L, p);
      return fwh(q, d, L, uso, true);
    }
    /* comprimento equivalente (por material e DN) e, se a linha faltar, o K
       (por conexão). Só vira pendência quando NENHUM dos dois responde — e a
       pendência registrada é a do comprimento equivalente, a tabela preferida. */
    function local(conexao, material, dn, J, v, uso, variante, extra) {
      /* D6 (27/10/2026): o JOELHO COM BUCHA DE LATÃO é o joelho 90° da tabela do mesmo DN (a mesma passagem) — premissa declarada, resultado marcado com o tipo real */
      var rk = localK(conexao, material, dn, v, uso, extra);
      if (rk !== undefined) return rk;   /* material com K próprio (PPR): o K do fabricante, sem ficha, sem Leq */
      if (conexao === "joelho_bucha") {
        premissa("perda localizada do joelho com bucha de latão", "joelho com bucha de latão = joelho 90° da tabela (mesma passagem)");
        var rj = local("joelho90", material, dn, J, v, uso, variante, extra); if (rj) rj.tipo = "joelho_bucha";
        return rj;
      }
      var fLeq = { material: material, conexao: conexao, dn: dn };
      /* ⚠ FICHA DA PEÇA (js/hidpecas.js, docs/hidro/CONTRATO.md §7): a peça REAL do nó (joelho 90 de PVC soldável
         DE 25, válvula de PÉ com crivo…) diz qual linha da tabela é a dela; o valor sai da tabela carregada pela
         referência da ficha (real ou de teste). Sem ficha, ou a referência sem linha na tabela carregada: o caminho
         de sempre abaixo, com a mesma pendência. A peça vai junto no resultado (memorial trecho a trecho). */
      var PC = dep("HidPecas", "./hidpecas.js"), fx = PC && PC.coefLocal ? PC.coefLocal(conexao, material, dn, variante) : null;
      if (fx && fx.ref && (fx.grandeza === "k" ? true : J != null) && NR().consulta(fx.ref.chave, fx.ref.filtro, fx.ref.coluna).ok) {
        var cf = ctx.consulta(fx.ref.chave, fx.ref.filtro, fx.ref.coluna, uso), vf = num(cf.valor, 0);
        if (fx.grandeza === "k") return { tipo: conexao, k: vf, perda_m: H.perdaK(vf, v), peca: fx.peca, fonteFicha: fx.fonte, singularidade: fx.uso };
        return { tipo: conexao, leq_m: vf, perda_m: H.perdaLeq(J, vf), peca: fx.peca, fonteFicha: fx.fonte, singularidade: fx.uso };
      }
      var r = localTabela(conexao, fLeq, J, v, uso);
      if (r && fx && fx.peca) r.peca = fx.peca;   /* luva/redução (sem valor ou K da tabela) e pendência: a peça vai junto do mesmo jeito */
      return r;
    }
    /* ---- K DO FABRICANTE POR MATERIAL (af.perda.localizada.k com a coluna material; PPR: Amanco, Δh = K·v²/2g) ----
       Devolve undefined quando o material não tem K próprio (segue o caminho da Leq); null = pendência visível (sem extrapolar);
       objeto = a perda. extra = { dnMont, reducaoCentral, jaNoTe } dada por quem conhece a topologia (hidaf). */
    function kDoMaterial(material) {
      if (!tabK) return [];
      return NR().linhas("af.perda.localizada.k", { material: material });
    }
    function serieDn(material) {
      var ds = NR().linhas("materiais.diametro_interno", { material: material }).map(function (x) { return num(x.dn, null); }).filter(function (x) { return x != null; });
      if (ds.length < 2) { var BI = dep("BimInst", "./biminst.js"), m = BI && BI.MATERIAIS ? BI.MATERIAIS[material] : null; ds = m && m.dns ? m.dns.slice() : []; }
      return ds.sort(function (a, b) { return a - b; });
    }
    function localK(conexao, material, dn, v, uso, extra) {
      var todas = kDoMaterial(material); if (!todas.length) return undefined;
      extra = extra || {};
      var rs = todas.filter(function (x) { return x.conexao === conexao; });
      if (!rs.length) {
        var semValor = !!SEM_PERDA_TABELADA[conexao]; if (semValor) return undefined;   /* luva/união/adaptador… sem linha: a regra de sempre (desprezada com premissa) */
        ctx.consulta("af.perda.localizada.k", { material: material, conexao: conexao }, "k", uso);   /* pendência visível: o manual do fabricante não traz essa peça */
        return null;
      }
      var comDn = rs.filter(function (x) { return x.dn != null && x.dn !== ""; });
      if (comDn.length) {                                       /* registro: valor por DN, sem interpolar nem extrapolar */
        rs = comDn.filter(function (x) { return num(x.dn, null) === num(dn, null); });
        if (!rs.length) { ctx.consulta("af.perda.localizada.k", { material: material, conexao: conexao, dn: dn }, "k", uso); return null; }
      }
      if (conexao === "reducao" && extra.jaNoTe) {              /* o R do tê de redução central já contém a redução */
        premissa("perda localizada de redução ao lado do tê de redução central", "o R do tê de redução central do fabricante já inclui a redução: não somada de novo");
        return { tipo: conexao, k: 0, perda_m: 0, incluidaNoTe: true };
      }
      var lin = null, nomeVar = null;
      if (rs.some(function (x) { return x.passos_max != null && x.passos_max !== ""; }) || rs.length > 1) {
        var comP = rs.filter(function (x) { return x.passos_max != null && x.passos_max !== ""; }).sort(function (a, b) { return a.passos_max - b.passos_max; }),
            semP = rs.filter(function (x) { return x.passos_max == null || x.passos_max === ""; });
        if (comP.length) {
          var ds = serieDn(material), i1 = ds.indexOf(num(extra.dnMont, null)), i2 = ds.indexOf(num(dn, null)), passos = i1 >= 0 && i2 >= 0 ? Math.abs(i1 - i2) : null;
          if (passos != null) lin = comP.filter(function (x) { return passos <= x.passos_max; })[0] || semP[0] || null;
          else { lin = semP[0] || comP[comP.length - 1]; premissa("redução de " + material + ": número de bitolas", "DN de montante ou série de bitolas desconhecidos: adotada a linha de maior R (a favor da segurança)"); }
        } else {
          nomeVar = extra.reducaoCentral ? "reducao_central" : (extra.dnMont != null && num(extra.dnMont, null) !== num(dn, null) ? "com_reducao" : "padrao");
          lin = rs.filter(function (x) { return x.variante === nomeVar; })[0] || rs.filter(function (x) { return x.variante === "padrao"; })[0] || null;
        }
      } else lin = rs[0];
      if (!lin) { ctx.consulta("af.perda.localizada.k", { material: material, conexao: conexao, variante: nomeVar || "?" }, "k", uso); return null; }
      var f = { material: material, conexao: conexao, variante: lin.variante }; if (lin.dn != null && lin.dn !== "") f.dn = lin.dn;
      var c = ctx.consulta("af.perda.localizada.k", f, "k", uso), kv = num(c.valor, 0);
      if (lin.premissa) premissa("perda localizada de " + conexao + (lin.variante !== "padrao" ? " (" + String(lin.variante).replace(/_/g, " ") + ")" : "") + " de " + material, lin.premissa);
      return { tipo: conexao, k: kv, perda_m: H.perdaK(kv, v), variante: lin.variante, fonteK: c.fonte };
    }
    function localTabela(conexao, fLeq, J, v, uso) {
      if (tabLeq && J != null && NR().consulta("af.perda.localizada.leq", fLeq, "leq_m").ok) {
        var c = ctx.consulta("af.perda.localizada.leq", fLeq, "leq_m", uso);
        return { tipo: conexao, leq_m: num(c.valor, 0), perda_m: H.perdaLeq(J, num(c.valor, 0)) };
      }
      /* K genérico: tabela SEM coluna material (fixture/antiga) vale para todos; com a coluna, só a linha do material (ou "*"). A linha de material próprio (PPR) é tratada em localK
         e nunca serve de reserva para outro material. */
      if (tabK) {
        var kTemMat = NR().linhas("af.perda.localizada.k").some(function (x) { return x.material != null && x.material !== ""; }),
            fK = kTemMat ? { conexao: conexao, material: fLeq.material } : { conexao: conexao };
        if (NR().consulta("af.perda.localizada.k", fK, "k").ok) {
          var k2 = ctx.consulta("af.perda.localizada.k", fK, "k", uso);
          return { tipo: conexao, k: num(k2.valor, 0), perda_m: H.perdaK(num(k2.valor, 0), v) };
        }
      }
      /* luva e redução: sem valor tabelado, 0 COMO PREMISSA declarada — senão toda
         emenda reta deixava a rede inteira pendente */
      if (SEM_PERDA_TABELADA[conexao]) { premissa("perda localizada de " + conexao, "sem valor tabelado: desprezada (decisão do RT)"); return { tipo: conexao, perda_m: 0, semValorTabelado: true }; }
      ctx.consulta(tabLeq || !tabK ? "af.perda.localizada.leq" : "af.perda.localizada.k", tabLeq || !tabK ? fLeq : { conexao: conexao }, tabLeq || !tabK ? "leq_m" : "k", uso);
      return null;
    }
    /* diâmetro interno (m) do material/DN, ou null */
    function di(material, dn, uso) {
      var c = ctx.consulta("materiais.diametro_interno", { material: material, dn: dn }, "di_mm", uso);   /* faltou = pendência registrada */
      return c.ok ? num(c.valor, null) / MM : null;
    }
    return { formulaMat: formulaMat, distribuida: distribuida, local: local, di: di,
             formulasUsadas: function () { return Object.keys(formulaDe).map(function (m) { return m + ": " + formulaDe[m]; }).join("; "); } };
  }

  /* ================================================ TUBO PELA NORMA DO PRODUTO (NBR 5648 / 5688 / 7362)
   * Di de cálculo = dem − 2·(e_mín + tol) (materiais.diametro_interno, derivado em tools/hid-normas-derivar.js).
   * tuboNorma(material, dn) → { dem, tol_dem, e_min, tol_e, di_mm, fonte } ou null. */
  var EPS_MM = 1e-6;   // hid:ok tolerância de ponto flutuante em mm
  function tuboNorma(material, dn) {
    var c = NR().consulta("materiais.tubo_norma", { material: material, dn: dn }, "di_mm");
    if (!c.ok) return null;
    var L = c.linha;
    return { dem: num(L.dem, null), tol_dem: num(L.tol_dem, 0), e_min: num(L.e_min, null), tol_e: num(L.tol_e, 0), di_mm: num(L.di_mm, null), fonte: c.fonte };
  }
  /* catálogo do fabricante × norma: DE dentro de [dem, dem + tol] e e dentro de [e_mín, e_mín + tol]. A linha do catálogo
     é a do material (rótulo da linha do fabricante); sem DE/e no catálogo, nada a conferir (null). */
  var LINHA_CATALOGO = { pvc_soldavel: /sold[aá]vel/i, pvc_esgoto: /s[eé]rie normal/i, pvc_serie_r: /s[eé]rie refor[cç]ada/i };
  function conferirCatalogo(material, dn) {
    var tn = tuboNorma(material, dn), Cg = dep("HidCatalogo", "./hidcatalogo.js"), re = LINHA_CATALOGO[material];
    if (!tn || !re || !Cg || typeof Cg.itens !== "function") return null;
    var vistos = {}, out = { material: material, dn: dn, divergencias: [], conferidos: 0, fonte: tn.fonte };
    Cg.itens({ tipo: "tubo", dn: dn }).forEach(function (it) {
      if (!re.test(String(it.linha || "")) || /esgoto/i.test(String(it.linha || "")) !== (material !== "pvc_soldavel")) return;
      var d = it.dim || {}, de = num(it.de_mm, num(d.D, null)), e = num(it.espessura_mm, num(d.e, null));
      if (de == null && e == null) return;
      var chave = (it.fabricante || "") + "|" + de + "|" + e; if (vistos[chave]) return; vistos[chave] = 1;
      out.conferidos++;
      var F = typeof Cg.fonte === "function" ? Cg.fonte(it) : null, quem = (it.fabricante || "catálogo") + (F && F.pagina ? " p." + F.pagina : ""), fora = [];
      if (de != null && (de < tn.dem - EPS_MM || de > tn.dem + tn.tol_dem + EPS_MM)) fora.push("DE " + f2(de) + " mm fora de " + f2(tn.dem) + " a " + f2(tn.dem + tn.tol_dem) + " mm");
      if (e != null && (e < tn.e_min - EPS_MM || e > tn.e_min + tn.tol_e + EPS_MM)) fora.push("e " + f2(e) + " mm fora de " + f2(tn.e_min) + " a " + f2(tn.e_min + tn.tol_e) + " mm");
      if (fora.length) out.divergencias.push({ fabricante: it.fabricante || null, codigo: it.codigo || null, texto: quem + ": " + fora.join("; "), fonteCatalogo: F || null });
    });
    return out.conferidos ? out : null;
  }
  /* PVC soldável (NBR 5648): PS = PN × ft(T); acima da temperatura máxima, o material não serve (CPVC/PPR/cobre).
   * Devolve { ok, status, ps_kpa, ft, tMax, passos, fonte } — ok null = pendente (tabela faltando). */
  function pressaoServico(material, T, ctx, uso) {
    if (material !== "pvc_soldavel") return null;
    var cP = ctx.consulta("tubo.nbr5648.pressao", { parametro: "pn" }, "valor", uso), cT = ctx.consulta("tubo.nbr5648.pressao", { parametro: "temperatura_max" }, "valor", uso);
    var ft = ctx.linhas("tubo.nbr5648.ft", null, uso);
    if (!cP.ok || !cT.ok || !ft || !ft.length) return { ok: null, status: "pendente", passos: ["pendente: " + (!cP.ok ? cP.motivo : (!cT.ok ? cT.motivo : "tubo.nbr5648.ft"))], fonte: null };
    var PN = num(cP.valor, 0), tMax = num(cT.valor, 0), pts = ft.map(function (r) { return [num(r.temperatura_c, 0), num(r.ft, 0)]; }).sort(function (x, y) { return x[0] - y[0]; });
    if (T > tMax) return { ok: false, status: "reprovado", tMax: tMax, ps_kpa: null, ft: null, fonte: cT.fonte,
                           passos: ["água a " + f2(T) + " °C > " + f2(tMax) + " °C: o PVC soldável (NBR 5648, 4.1) não serve — use CPVC, PPR ou cobre"] };
    var f;
    if (T <= pts[0][0]) f = pts[0][1];
    else if (T >= pts[pts.length - 1][0]) f = pts[pts.length - 1][1];
    else for (var i = 1; i < pts.length; i++) if (T <= pts[i][0]) { f = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (T - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); break; }
    return { ok: true, status: "ok", tMax: tMax, ft: f, pn_kpa: PN, ps_kpa: PN * f, fonte: cP.fonte,
             passos: ["PS = PN × ft(" + f2(T) + " °C) = " + f2(PN) + " × " + f3(f) + " = " + f2(PN * f) + " kPa (NBR 5648, item 1 e 4.2.3, Figura 2 — ft lido em gráfico, ±0,02)"] };
  }

  var HidPerda = { VERSAO: 1, SEM_PERDA_TABELADA: SEM_PERDA_TABELADA, criar: criar, tuboNorma: tuboNorma, conferirCatalogo: conferirCatalogo, pressaoServico: pressaoServico };
  global.HidPerda = HidPerda;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPerda;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
