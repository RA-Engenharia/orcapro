/* =====================================================================
 * metalnostubo.js — NÓS SOLDADOS TUBO-TUBO das treliças (AUDITORIA A3, 20/11/2026)
 *
 * Antes: os nós soldados de tubo (NBR 16239:2013 / EN 1993-1-8:2005 cap. 7) só eram DECLARADOS como não verificados e o
 * resultado saía "aprovado: true". Para parede de 1,1 a 3,75 mm o nó costuma governar (auditoria: a diagonal de 73,6 kN no
 * banzo TR 50×100×3,75 dá razão ≈ 1,0 — com γa1 1,10).
 *
 * MetalNosTubo.verificar(r) — r = resultado do AcoDimLivre.calcular (com r.modelo.membros, r.modelo.noInfo, r.membros):
 *   barra de alma = membro com calc.tuboSoldado (alma e travejamento da tesoura-leve); banzo = o tubo que PASSA pelo nó
 *   (ou termina nele) e não é de alma. Em cada nó do banzo: as barras de alma que chegam, N = |pior.N| de cada uma
 *   (envoltória — combinações diferentes juntas, a favor da segurança), θ da geometria, σ0 do banzo pelo N de compressão.
 *   Uma barra → nó T/Y; duas ou mais → nó K/N com afastamento (as duas mais carregadas), g pela geometria com
 *   excentricidade zero: g = (h0/2)·sen(θ1+θ2)/(sen θ1·sen θ2) − h1/(2 sen θ1) − h2/(2 sen θ2); g < 0 → nó SOBREPOSTO
 *   com λov = −g/(hi/sen θi)·100 % (a maior hi/sen θi, a favor) e as linhas de sobreposição da Tabela 7.12.
 *   Face do banzo = a dimensão ao longo da normal do plano da treliça (eixo local ey do membro); sem o eixo, calcula com
 *   cada lado e ADOTA O PIOR (a favor da segurança).
 *   → { nos: [{ no, banzo, tipo, razao, ok, bloqueante, ... }], n, reprovados, naoVerificados, pior, resumo }
 *   Barra de alma chegando em perfil que não é tubo (U da coluna): verificada pelo js/metaltubou.js (22/11/2026) → out.tuboU;
 *   out.reprovados soma as pontas no U que nenhuma correção salva; out.foraDoEscopo = só as que não deu para verificar.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(n, p) { if (global[n]) return global[n]; try { if (typeof require === "function") return require(p); } catch (e) { } return null; }
  function L2() { return dep("AcoLigCalc2", "./acoligcalc2.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var x = +v; return isFinite(x) ? x : d; }
  function br(v, c) { return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function norm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function dims(nome) {
    var C = Cat(), x = C && C.obter ? C.obter(nome) : null;
    if (!x || !/^tubo/.test(x.forma)) return null;
    if (x.forma === "tubo-circ") { var d = num(x.d, NaN); if (!(d > 0)) { var m = /([\d,\.]+)\s*x\s*([\d,\.]+)/i.exec(String(nome)); d = m ? +m[1].replace(",", ".") : NaN; } return { forma: "CHS", d: d, t: num(x.t, 0) }; }
    return { forma: "RHS", h: num(x.h, 0), b: num(x.b, 0), t: num(x.t, 0) };
  }

  function verificar(r) {
    var out = { nos: [], n: 0, reprovados: 0, naoVerificados: 0, foraDoEscopo: 0, pior: null, resumo: "" };
    var Lg = L2(); if (!Lg || !Lg.noTubular || !r || !r.modelo) { out.erro = "motor de nós (js/acoligcalc2.js) não carregado"; return out; }
    var M = arr(r.modelo.membros), NI = r.modelo.noInfo || {}, RM = r.membros || {};
    function P(id) { var I = NI[id]; return I && I.P; }
    /* o banzo também é "tuboSoldado" na tesoura-leve: banzo = nome com "banzo" ou o tubo em que o nó é INTERNO; alma = o resto */
    function ehBanzo(m) { return /banzo/i.test(String(m.nome || "") + " " + String(m.papelLivre || "")); }
    var alma = M.filter(function (m) { return m.calc && m.calc.tuboSoldado && !ehBanzo(m) && dims(m.secao && m.secao.nome); });
    var porNo = {}, semTubo = [];
    alma.forEach(function (b) {
      var ns = arr(b.nos); if (ns.length < 2) return;
      [ns[0], ns[ns.length - 1]].forEach(function (no, k) {
        var ch = M.filter(function (c) { return c !== b && arr(c.nos).indexOf(no) >= 0 && (ehBanzo(c) || !(c.calc && c.calc.tuboSoldado) || (arr(c.nos).indexOf(no) > 0 && arr(c.nos).indexOf(no) < arr(c.nos).length - 1)); });
        var tubos = ch.filter(function (c) { return dims(c.secao && c.secao.nome); }), interno = function (c) { var i = arr(c.nos).indexOf(no); return i > 0 && i < arr(c.nos).length - 1; };
        var tubo = tubos.filter(ehBanzo)[0] || tubos.filter(interno)[0] || tubos[0];
        if (!tubo) { if (ch.length) { out.foraDoEscopo++; semTubo.push({ b: b, no: no, ch: ch }); } return; }
        var k2 = no + "|" + tubo.id;
        (porNo[k2] = porNo[k2] || { no: no, banzo: tubo, barras: [] }).barras.push({ m: b, outra: k === 0 ? ns[ns.length - 1] : ns[0] });
      });
    });
    Object.keys(porNo).forEach(function (k) {
      var G = porNo[k], c = G.banzo, dc = dims(c.secao.nome), p0 = P(G.no); if (!p0 || !dc) return;
      var cn = arr(c.nos), i = cn.indexOf(G.no), viz = cn[i + 1] != null ? cn[i + 1] : cn[i - 1], pv = P(viz); if (!pv) return;
      var ec = norm(sub(pv, p0));
      var bs = G.barras.map(function (q) {
        var pq = P(q.outra), eb = pq ? norm(sub(pq, p0)) : [0, 1, 0], cs = Math.abs(dot(eb, ec)), th = Math.acos(Math.min(1, cs)) * 180 / Math.PI;
        var d = dims(q.m.secao.nome), rr = RM[q.m.id] || {}, N = Math.abs(num(rr.pior && rr.pior.N, 0));
        return { id: q.m.id, nome: q.m.nome, perfil: q.m.secao.nome, d: d, theta: th, N: N, fy1: num(q.m.aco && q.m.aco.fy, 250) };
      }).sort(function (a, b) { return b.N - a.N; });
      var rc = RM[c.id] || {}, Nc = num(rc.pior && rc.pior.N, 0), A0 = num(c.secao.mm && c.secao.mm.A, 0), sig0 = Nc < 0 && A0 > 0 ? -Nc * 1000 / A0 : 0;
      var fy0 = num(c.aco && c.aco.fy, 250), tipo = bs.length >= 2 ? "K" : "T";
      /* a face que recebe as barras: a dimensão do banzo ao longo da NORMAL do plano da treliça n = ec × eb (ey = lado h) */
      function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
      var pb0 = P(G.barras[0].outra), nPl = pb0 ? cross(ec, norm(sub(pb0, p0))) : null, nL = nPl ? Math.sqrt(dot(nPl, nPl)) : 0;
      if (nL > 1e-6) nPl = [nPl[0] / nL, nPl[1] / nL, nPl[2] / nL]; else nPl = null;
      function ladoNoPlano(m, D) { if (!nPl || !m.ey || D.forma !== "RHS") return null; return Math.abs(dot(norm(m.ey), nPl)) > 0.7 ? { b: D.h, h: D.b } : { b: D.b, h: D.h }; }
      var ldC = ladoNoPlano(c, dc);
      var lados = ldC ? [[ldC.b, ldC.h]] : dc.forma === "RHS" ? (Math.abs(dc.h - dc.b) > 1e-6 ? [[dc.b, dc.h], [dc.h, dc.b]] : [[dc.b, dc.h]]) : [[dc.d, dc.d]];
      bs.forEach(function (q) { var mq = M.filter(function (x) { return x.id === q.id; })[0], lq = mq ? ladoNoPlano(mq, q.d) : null; if (lq) q.d = { forma: "RHS", b: lq.b, h: lq.h, t: q.d.t }; });
      var piorR = null;
      lados.forEach(function (ld) {
        var b0 = ld[0], h0 = ld[1];
        var diag = bs.map(function (q) { var D = q.d; return D.forma === "RHS" ? { b1: D.b, h1: D.h, t1: D.t, theta: q.theta, N: q.N, fy1: q.fy1 } : { d1: D.d, t1: D.t, theta: q.theta, N: q.N, fy1: q.fy1 }; });
        var g = null;
        if (tipo === "K") {
          var a1 = bs[0].theta * Math.PI / 180, a2 = bs[1].theta * Math.PI / 180, h1 = diag[0].h1 || diag[0].d1, h2 = diag[1].h1 || diag[1].d1;
          g = (h0 / 2) * Math.sin(a1 + a2) / (Math.sin(a1) * Math.sin(a2)) - h1 / (2 * Math.sin(a1)) - h2 / (2 * Math.sin(a2));
        }
        var ov = 0;
        if (tipo === "K" && g < 0) {   /* sobreposição: q = −g ao longo da face; p = hi/sen θi da barra (a maior p → menor λov, a favor) */
          var pp = Math.max((diag[0].h1 || diag[0].d1) / Math.sin(bs[0].theta * Math.PI / 180), (diag[1].h1 || diag[1].d1) / Math.sin(bs[1].theta * Math.PI / 180));
          ov = Math.min(100, -g / pp * 100);
        }
        var ent = { banzo: dc.forma === "RHS" ? { forma: "RHS", b0: b0, h0: h0, t0: dc.t, fy0: fy0 } : { forma: "CHS", d0: dc.d, t0: dc.t, fy0: fy0 }, diagonais: diag, g: g > 0 ? g : null, ov: ov, sigma0: sig0 };
        var res = Lg.noTubular(ent, { tipo: tipo });
        var bl = arr(res.bloqueante), rz = bl.length ? Infinity : num(res.razao, Infinity);
        if (!piorR || rz > piorR.razao) piorR = { razao: rz, b0: b0, h0: h0, g: g, ov: ov, res: res, bloqueante: bl };
      });
      var o = { no: G.no, banzo: c.id, banzoPerfil: c.secao.nome, tipo: tipo, barras: bs.map(function (q) { return { id: q.id, perfil: q.perfil, N: Math.round(q.N * 10) / 10, theta: Math.round(q.theta * 10) / 10 }; }),
                b0: piorR.b0, g: piorR.g, ov: piorR.ov, sigma0: Math.round(sig0 * 10) / 10, razao: piorR.razao, bloqueante: piorR.bloqueante, governante: piorR.res.governante,
                ok: !piorR.bloqueante.length && piorR.razao <= 1 + 1e-9, verificacoes: piorR.res.verificacoes };
      out.nos.push(o); out.n++;
      if (o.bloqueante.length) out.naoVerificados++; else if (!o.ok) out.reprovados++;
      if (!o.bloqueante.length && (!out.pior || o.razao > out.pior.razao)) out.pior = o;
    });
    /* 22/11/2026: as pontas de tubo soldadas na ALMA DO U da coluna (antes "foraDoEscopo", não verificadas) — js/metaltubou.js.
       foraDoEscopo passa a contar SÓ as que ele não conseguiu verificar; as reprovadas (nenhuma correção passa) somam em reprovados.
       n continua = nós tubo-tubo; as pontas no U ficam em out.tuboU (e out.tuboU.ligacoes vai para a memória do js/metalligdim.js) */
    var TU = dep("MetalTuboU", "./metaltubou.js");
    if (TU && semTubo.length) {
      var vu = TU.verificar(r, { pontas: semTubo }); out.tuboU = vu;
      out.foraDoEscopo = vu.naoVerificados; out.reprovados += vu.reprovados;
    }
    out.resumo = out.n + " nó(s) tubo-tubo verificados (NBR 16239:2013 / EN 1993-1-8:2005, Tabelas 7.10 e 7.12): " + out.reprovados + " reprovado(s), " + out.naoVerificados + " fora da validade" +
      (out.pior ? "; pior razão " + br(out.pior.razao, 3) + " (nó " + out.pior.no + ", " + out.pior.tipo + ", banzo " + out.pior.banzoPerfil + ", " + out.pior.governante + ")" : "") +
      (out.tuboU ? "; pontas no U da coluna: " + out.tuboU.resumo : "") +
      (out.foraDoEscopo ? "; " + out.foraDoEscopo + " ponta(s) de tubo em perfil aberto sem verificação (peça do nó não é U)" : "");
    return out;
  }

  /* 21/11/2026 (js/acoautocorrige.js) — O QUE O NÓ PRECISA: para cada peça de BANZO com nó reprovado (ou fora da validade por
     parede/esbeltez — a sobreposição λov é geometria, não perfil), o perfil MAIS LEVE de op.candidatos(nome) que faz TODOS os nós
     dessa peça passarem; sem banzo que resolva, a(s) barra(s) da ALMA do nó. A verificação é REFEITA com o candidato (mesmos
     esforços deste cálculo; σ0 com a área do banzo atual = a favor da segurança — o banzo maior tem σ0 menor).
     op = { candidatos(nome) → [nomes, do mais leve ao mais pesado], proibido?(peca, para) }
     → { trocas: [{ peca, papel: "banzo"|"alma", de, para, nos[], motivo }], semSolucao: [{ no, motivo }] } */
  function precisa(r, op) {
    op = op || {};
    var out = { trocas: [], semSolucao: [] }, cand = op.candidatos || function () { return []; }, proib = op.proibido || function () { return false; };
    if (!r || !r.modelo) return out;
    var base = r.nosTubo || verificar(r), M = arr(r.modelo.membros), porId = {};
    M.forEach(function (m) { porId[m.id] = m; });
    function geom(o) { return arr(o.bloqueante).some(function (b) { return /sobrepost|λov|afaste/i.test(b); }); }
    var ruins = arr(base.nos).filter(function (o) { return !o.ok && !geom(o); });
    arr(base.nos).filter(function (o) { return !o.ok && geom(o); }).forEach(function (o) { out.semSolucao.push({ no: o.no, motivo: o.bloqueante[0] }); });
    if (!ruins.length) return out;
    /* r com as peças trocadas (só o nome da seção: dims() lê o nome; A0 do banzo antigo fica — a favor) */
    function comTroca(mapa) {
      var ms = M.map(function (m) { var n = mapa[String(m.peca)]; if (!n) return m; var c = {}; Object.keys(m).forEach(function (k) { c[k] = m[k]; }); c.secao = { nome: n, mm: m.secao && m.secao.mm, forma: m.secao && m.secao.forma }; return c; });
      var mo = {}; Object.keys(r.modelo).forEach(function (k) { mo[k] = r.modelo[k]; }); mo.membros = ms;
      return { ok: true, modelo: mo, membros: r.membros };
    }
    function nosOk(v, nos) { var por = {}; arr(v.nos).forEach(function (o) { por[o.no + "|" + o.banzo] = o; }); return nos.every(function (k) { var o = por[k]; return !o || o.ok; }); }
    /* 1) o BANZO: por peça */
    var gr = {}, ordem = [];
    ruins.forEach(function (o) { var mb = porId[o.banzo]; if (!mb) return; var pc = String(mb.peca); if (!gr[pc]) { gr[pc] = { peca: pc, de: o.banzoPerfil, nos: [], chaves: [] }; ordem.push(pc); } gr[pc].nos.push(o.no); gr[pc].chaves.push(o.no + "|" + o.banzo); });
    var resolvidos = {};
    ordem.forEach(function (pc) {
      var g = gr[pc], lista = cand(g.de).filter(function (n) { return !proib(pc, n); });
      for (var i = 0; i < lista.length; i++) {
        var mp = {}; mp[pc] = lista[i];
        if (nosOk(verificar(comTroca(mp)), g.chaves)) { out.trocas.push({ peca: pc, papel: "banzo", de: g.de, para: lista[i], nos: g.nos, motivo: "o nó passa com o banzo " + lista[i] }); g.chaves.forEach(function (k) { resolvidos[k] = true; }); return; }
      }
    });
    /* 2) a ALMA dos nós que o banzo não resolveu */
    ruins.filter(function (o) { return !resolvidos[o.no + "|" + o.banzo]; }).forEach(function (o) {
      var feito = false;
      arr(o.barras).forEach(function (b) {
        if (feito) return; var mb = porId[b.id]; if (!mb) return; var pc = String(mb.peca);
        if (out.trocas.some(function (t) { return t.peca === pc; })) { feito = true; return; }
        var lista = cand(b.perfil).filter(function (n) { return !proib(pc, n); });
        for (var i = 0; i < lista.length; i++) {
          var mp = {}; mp[pc] = lista[i];
          if (nosOk(verificar(comTroca(mp)), [o.no + "|" + o.banzo])) { out.trocas.push({ peca: pc, papel: "alma", de: b.perfil, para: lista[i], nos: [o.no], motivo: "o nó passa com a barra " + lista[i] }); feito = true; return; }
        }
      });
      if (!feito) out.semSolucao.push({ no: o.no, motivo: (o.bloqueante && o.bloqueante[0]) || ("razão " + br(o.razao, 2) + " — nenhum tubo da família resolve") });
    });
    return out;
  }

  var MetalNosTubo = { verificar: verificar, dims: dims, precisa: precisa };
  global.MetalNosTubo = MetalNosTubo;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalNosTubo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
