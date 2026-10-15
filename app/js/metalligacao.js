/* =====================================================================
 * metalligacao.js — METÁLICA & MECÂNICA: LIGAÇÕES PARAMÉTRICAS (motor
 * PURO, ES5, sem DOM, Node-testável).
 *
 * Cada macro recebe as peças do modelo (pilar/viga do modelador ou perfil
 * do js/metalpeca.js) e devolve as CHAPAS, os PARAFUSOS (com o comprimento
 * pelo aperto), os FUROS que vão nas peças ligadas e a CONFERÊNCIA das
 * distâncias da NBR 8800 (js/metalnorma.js) — aviso, não bloqueio.
 *
 *   placaBase           pilar → fundação: placa + chumbadores + solda
 *   chapaExtremidade    viga → pilar (mesa ou alma) ou viga → viga
 *                       (cumeeira: duas chapas aparafusadas)
 *   cantoneiraDupla     viga → pilar por duas cantoneiras na alma
 *   emendaCobrejunta    viga + viga colineares: talas na alma e nas mesas
 *   clipTerca           terça sobre a mesa da viga: cantoneira soldada na
 *                       viga, aparafusada na alma da terça
 *   contraventamento    diagonal → apoio por chapa gusset soldada no apoio
 *   noTrelica           várias barras num nó, uma chapa gusset aparafusada
 *
 * ⚠ NÃO DIMENSIONA. Quantidade de parafusos, espessura de chapa e tamanho
 *   de solda saem de VALORES DE PARTIDA (editáveis na tela) — quem garante a
 *   resistência é o projeto estrutural. A tela diz isso.
 *
 * Saída de cada macro: { ok, tipo, lig, pecas:[caixas], parafusos:[caixas],
 *   furos:{idMembro:[furo]}, ajustes:[ops], conferencia:[{peca, avisos}],
 *   avisos:[texto], resumo } — e `ops(r, novoId)` faz o LOTE (um Ctrl+Z).
 * Teste: node tools/test-metal-ligacoes.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function N() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function cima5(mm) { return Math.ceil(mm / 5 - 1e-9) * 5; }
  function baixo5(mm) { return Math.floor(mm / 5 + 1e-9) * 5; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function V() { return M().vet; }

  /* ---------------------------------------------------- parâmetros comuns
   * parafuso (id do catálogo), classe, borda ("laminada" | "serra"),
   * furo ("padrao" | "pouco" | "muito" | "alargado") */
  function comuns(par) {
    par = par || {};
    var n = N(), p = n.parafuso(par.parafuso || "M20") || n.parafuso("M20"), pt = n.partida(p.d, "laminada");
    return { pf: p, db: p.d, id: p.id, classe: par.classe || (p.sistema === "POL" ? "A325" : "8.8"), furo: par.furo || "padrao",
             eP: num(par.borda, pt.borda) / 1000,                       /* borda da chapa (cortada a maçarico/plasma/laser) */
             eS: num(par.bordaPonta, cima5(n.bordaMin(p.d, "serra").e)) / 1000,   /* ponta serrada do perfil */
             passo: num(par.passo, pt.passo) / 1000 };
  }
  function furoD(c, tipo) { var f = N().furo(c.db, tipo || c.furo); return f ? f.d / 1000 : c.db / 1000 + 0.0015; }

  /* --------------------------------------------------- geometria auxiliar */
  function uvDe(O, U, Vv, P) { var d = V().sub(P, O); return [V().dot(d, U), V().dot(d, Vv)]; }
  function octo(c, r) { var o = []; for (var i = 0; i < 8; i++) { var a = Math.PI / 8 + i * Math.PI / 4; o.push([c[0] + r / Math.cos(Math.PI / 8) * Math.cos(a), c[1] + r / Math.cos(Math.PI / 8) * Math.sin(a)]); } return o; }
  function casca(pts) {   /* fecho convexo (cadeia monótona), anti-horário */
    var p = pts.map(function (q) { return [r6(q[0]), r6(q[1])]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (p.length < 3) return p;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [];
    p.forEach(function (q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop(); lo.push(q); });
    for (var i = p.length - 1; i >= 0; i--) { var q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  /* a ponta do membro mais perto de um ponto (ou de uma reta) */
  function distReta(P, O, D) { var d = V().sub(P, O), t = V().dot(d, D); return V().len(V().sub(d, V().mul(D, t))); }
  function pontas(mb) {
    var x0 = mb.xOff, x1 = mb.xOff + mb.L;
    return [{ qual: "ini", x: x0, P: M().membroPonto(mb, x0, 0, 0), sai: V().mul(mb.X, -1) }, { qual: "fim", x: x1, P: M().membroPonto(mb, x1, 0, 0), sai: mb.X }];
  }
  function pontaPerto(mb, alvo) {
    var ps = pontas(mb);
    var d = ps.map(function (p) { return alvo.X ? distReta(p.P, alvo.Pref, alvo.X) : V().len(V().sub(p.P, alvo)); });
    return d[0] <= d[1] ? ps[0] : ps[1];
  }

  /* o ajuste do comprimento da barra (a ponta anda `delta` para FORA) */
  function ajustarPonta(mb, qual, delta) {
    if (Math.abs(delta) < 0.0005) return null;
    var c = mb.caixa;
    if (mb.origem === "arq" && c.tipo === "viga") {
      var k = qual === "fim" ? "extFim" : "extIni", campos = { estrut: {} };
      campos.estrut[k] = r6(num(c[k], 0) + delta);
      var c2 = clone(c); c2[k] = campos.estrut[k];
      return comApos({ op: "ajustar", id: c.id, campos: campos }, c2);
    }
    if (mb.origem === "metal") {
      /* a ponta inicial anda e a REFERÊNCIA fica (xRef): os furos já abertos não se mexem */
      var m = c.metal, q = M().quadro(c), O = qual === "ini" ? V().sub(q.O, V().mul(q.X, delta)) : q.O;
      var nv = M().perfil({ origem: O, ex: q.X, ey: q.Y, perfil: m.perfil, L: m.L + delta, cortes: m.cortes, furos: arr(m.furos), xRef: num(m.xRef, 0) - (qual === "ini" ? delta : 0),
        papel: m.papel, aco: m.aco, lig: m.lig, soldadaEm: m.soldadaEm, nome: m.nome, ifc: c.ifc, solda: m.solda });
      if (nv.erro) return null;
      ["marca", "metalFuros"].forEach(function (k) { if (c[k] != null) nv[k] = clone(c[k]); });
      /* VIGAS ENTRE PILARES (15/10/2026, js/metalvigaspilares.js): a viga com RECUO na receita tem a linha de eixo a eixo
         dos pilares — a ligação muda só o recuo da ponta; a linha (nó do cálculo, vínculos, Propriedades) continua.
         Sem recuo na receita: como sempre (a peça sai sem receita) */
      var MCr = dep("MetalCriar", "./metalcriar.js");
      if (m.cria && m.cria.recuo && MCr && MCr.reancorar) { var cr2 = MCr.reancorar(c, nv, qual, delta); if (cr2) { nv.metal.cria = cr2; if (m.calc) nv.metal.calc = clone(m.calc); } }
      nv.id = c.id;
      return comApos({ op: "criar", id: c.id, caixa: nv }, nv);
    }
    return null;
  }
  /* a caixa DEPOIS do ajuste vai junto (fora do JSON da op): a conferência mede nas pontas novas */
  function comApos(op, cx) { try { Object.defineProperty(op, "_apos", { value: cx, enumerable: false }); } catch (e) {} return op; }
  function aplicarAjuste(res, mbVelho, aj) {
    res.ajustes.push(aj);
    var nv = aj._apos ? M().membro(aj._apos) : null; if (!nv) return mbVelho;
    nv.id = mbVelho.id;
    for (var i = 0; i < res.membros.length; i++) if (res.membros[i] === mbVelho) res.membros[i] = nv;
    return nv;
  }

  /* furos que cada parafuso abre em cada membro */
  function furosNosMembros(bolts, membros, c, res) {
    membros.forEach(function (mb) {
      if (!mb) return;
      bolts.forEach(function (b) {
        M().furosDoEixo(mb, b.P, b.D, 0, b.aperto).forEach(function (h) {
          var fx = N().furo(c.db, b.furo || c.furo);
          (res.furos[mb.id] = res.furos[mb.id] || []).push({ face: h.face, x: h.x, y: h.y, db: c.db, d: fx.d, l: fx.l, tipo: fx.tipo });
        });
      });
    });
  }
  function boltCaixas(bolts, c, lig) {
    return bolts.map(function (b) {
      var o = { origem: b.P, eixo: b.D, aperto: b.aperto, id: c.id, classe: c.classe, arrPorca: 1, lig: lig };
      if (b.chumbador) o.chumbador = b.chumbador;
      return M().parafuso(o);
    }).filter(function (x) { return !x.erro; });
  }

  /* ------------------------------------------------------ CONFERÊNCIA */
  function conferirChapa(cx, borda) {
    var m = cx.metal, C = M().pol.uv(m.contorno).map(function (q) { return [q[0] * 1000, q[1] * 1000]; });
    /* placa de base: os chumbadores não "ligam uma chapa a um perfil" (6.3.10) — o espaçamento máximo não vale */
    return N().conferir({ nome: m.papel, contorno: C, t: m.t * 1000, borda: borda || m.borda || "laminada", ignorarMaxEsp: m.papel === "Placa de base",
      furos: arr(m.furos).map(function (f, i) { return { id: i + 1, x: f.u * 1000, y: f.v * 1000, db: f.db }; }) });
  }
  /* furos numa FACE de membro: pontas serradas (x) e, na mesa, as bordas laminadas (y) */
  function conferirMembro(mb, furos, rotulo) {
    var porFace = {}, av = [], fs = M().faces(mb.perfil);
    arr(furos).forEach(function (f) { (porFace[f.face] = porFace[f.face] || []).push(f); });
    Object.keys(porFace).forEach(function (fk) {
      var fc = fs.filter(function (q) { return q.face === fk; })[0]; if (!fc) return;
      var lst = porFace[fk].map(function (f, i) { return { id: fk + (i + 1), x: f.x * 1000, y: f.y * 1000, db: f.db }; });
      var x0 = mb.xOff * 1000, x1 = (mb.xOff + mb.L) * 1000, BIG = 1e6;
      var r1c = N().conferir({ nome: rotulo + " (face " + fk + ")", contorno: [[x0, -BIG], [x1, -BIG], [x1, BIG], [x0, BIG]], t: fc.t * 1000, borda: "serra", furos: lst, ignorarMaxBorda: true, ignorarMaxEsp: true });
      av = av.concat(r1c.avisos);
      if (fc.n === "b" || mb.perfil.forma === "L") {   /* mesa e aba: as bordas da largura são livres (laminadas) */
        var r2 = N().conferir({ nome: rotulo + " (face " + fk + ", borda da aba)", contorno: [[-BIG, 0], [BIG, 0], [BIG, fc.larg * 1000], [-BIG, fc.larg * 1000]], t: fc.t * 1000, borda: "laminada",
          furos: lst, ignorarMaxBorda: true, ignorarMaxEsp: true });
        av = av.concat(r2.avisos.filter(function (a) { return a.tipo !== "espMin" && a.tipo !== "espPref"; }));
      }
    });
    return av;
  }
  function fechar(res, c) {
    res.pecas.forEach(function (p) { if (p.metal && p.metal.kind === "chapa") res.conferencia.push({ peca: p.metal.papel, avisos: conferirChapa(p).avisos }); });
    res.membros.forEach(function (mb) {
      if (!mb || !res.furos[mb.id]) return;
      var rot = (mb.caixa.tipo === "metal" ? M().nome(mb.caixa) : (mb.caixa.tipo === "pilar" ? "Pilar " : "Viga ") + mb.id);
      var todos = M().furosDe(mb.caixa).filter(function (f) { return f.lig !== res.lig; }).concat(res.furos[mb.id]);
      res.conferencia.push({ peca: rot, avisos: conferirMembro(mb, todos, rot) });
    });
    res.conferencia.forEach(function (k) { k.avisos.forEach(function (a) { res.avisos.push(a.texto + " — NBR 8800 " + a.item); }); });
    res.ok = true;
    delete res.membros;
    return res;
  }
  function novoRes(tipo, par, membros) {
    return { ok: false, tipo: tipo, lig: String(par && par.lig || ("lig-" + tipo)), pecas: [], parafusos: [], furos: {}, ajustes: [], conferencia: [], avisos: [], soldas: [], membros: arr(membros).slice() };
  }
  function erro(t) { return { ok: false, motivo: t }; }
  function solda(perna, lados, comp, campo) { return { tipo: "filete", perna: perna, lados: lados || "ambos", comprimento: r6(comp || 0), campo: !!campo }; }
  function pernaMin(tA, tB) { return Math.max(N().soldaMin(Math.min(tA, tB) * 1000).perna, 5); }

  /* ====================================================== 1. PLACA DE BASE
   * par: { B, N (m — lados da placa; vazio = seção + 2 × 75 mm), t (m,
   *        partida 25 mm), parafuso (chumbador, partida 3/4"), nChumb (4|6),
   *        ancoragem (m, partida 0,40 — dado de projeto), graute (m, partida
   *        0,025), furo (partida "alargado") } */
  function placaBase(pilar, par) {
    par = par || {};
    var mb = M().membro(pilar); if (!mb || pilar.tipo === "viga") return erro("Selecione um PILAR de aço (perfil).");
    var c = comuns({ parafuso: par.parafuso || "3/4\"", classe: par.classe || "F1554-36", borda: par.borda, furo: par.furo || "alargado" });
    var res = novoRes("placaBase", par, [mb]);
    var s = mb.s, bal = 0.075, Bp = num(par.B, Math.ceil((s.larg + 2 * bal) * 100 - 1e-9) / 100), Np = num(par.N, Math.ceil((s.alt + 2 * bal) * 100 - 1e-9) / 100), t = num(par.t, 0.025);
    var e = par.borda != null ? c.eP : Math.max(c.eP, cima5(N().bordaMin(c.db, "laminada").e) / 1000);   /* a borda pedida vale (e a conferência avisa) */
    var n6 = Math.round(num(par.nChumb, 4)) === 6, porLado = Math.round(num(par.porLado, 2));
    /* a placa EMBAIXO do pilar: u na largura (A), v na altura (B), espessura para BAIXO (A × B = −X) */
    var P0 = mb.P0, O = V().add(V().add(P0, V().mul(mb.A, -Bp / 2)), V().mul(mb.B, -Np / 2));
    var pts = [[e, e], [Bp - e, e], [Bp - e, Np - e], [e, Np - e]];
    if (porLado > 2) {
      /* base engastada (js/acoligcalc.js): porLado chumbadores em CADA extremidade da direção do momento (v = e e v = N − e) */
      pts = [];
      [e, Np - e].forEach(function (vv) { for (var iq = 0; iq < porLado; iq++) pts.push([e + iq * (Bp - 2 * e) / (porLado - 1), vv]); });
    } else if (n6) pts.push([e, Np / 2], [Bp - e, Np / 2]);
    var fx = N().furo(c.db, c.furo);
    var pl = M().chapa({ origem: O, ex: mb.A, ey: mb.B, t: t, ret: { L: Bp, B: Np }, papel: "Placa de base", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: pilar.id,
      solda: solda(pernaMin(t, Math.min(num(mb.perfil.tf, t), num(mb.perfil.tw, t))), "contorno", 2 * (s.larg + s.alt), false),
      furos: pts.map(function (q, i) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo, id: "C" + (i + 1) }; }) });
    if (pl.erro) return erro(pl.erro);
    res.pecas.push(pl);
    /* chumbadores: nascem na face de CIMA da placa (a base do pilar), descem */
    var desce = V().mul(mb.X, -1), anc = num(par.ancoragem, 0.4) + num(par.graute, 0.025);
    var bolts = pts.map(function (q) { return { P: V().add(V().add(O, V().mul(mb.A, q[0])), V().mul(mb.B, q[1])), D: desce, aperto: t, chumbador: { ancoragem: anc }, furo: c.furo }; });
    res.parafusos = boltCaixas(bolts, c, res.lig);
    /* a porca não pode cair em cima do pilar: folga entre o chumbador e a caixa da seção */
    var p = c.pf, folga = p.arr.d2 / 2000 + 0.005;
    pts.forEach(function (q, i) {
      var du = Math.max(0, Math.abs(q[0] - Bp / 2) - s.larg / 2), dv = Math.max(0, Math.abs(q[1] - Np / 2) - s.alt / 2), dist = Math.sqrt(du * du + dv * dv);
      if (dist < folga) res.avisos.push("Chumbador C" + (i + 1) + ": a " + r1(dist * 1000) + " mm da seção do pilar — a arruela (Ø" + p.arr.d2 + " mm) não cabe; aumente a placa");
    });
    res.resumo = "Placa de base " + Math.round(Bp * 1000) + " × " + Math.round(Np * 1000) + " × " + r1(t * 1000) + " mm, " + pts.length + " chumbadores " + p.id + " (furo " + (fx.tipo === "alargado" ? "alargado " : "") + "Ø" + fx.d + " mm), solda de filete em volta do pilar";
    return fechar(res, c);
  }

  /* =============================================== 2. CHAPA DE EXTREMIDADE
   * par: { t (m, partida 16 mm), parafuso, classe, linhas, gage (m), ext (m,
   *        chapa estendida além das mesas; partida 0 = faceada), largura (m),
   *        ajustar (padrão true: a viga encurta/estica até a chapa encostar) } */
  function chapaExtremidade(viga, alvo, par) {
    par = par || {};
    var mb = M().membro(viga), ma = M().membro(alvo); if (!mb || !ma) return erro("Selecione a VIGA e o PILAR (ou a outra viga) — perfis de aço.");
    if (viga.id === alvo.id) return erro("A viga e o apoio são a mesma peça.");
    var c = comuns(par), res = novoRes("chapaExtremidade", par, [mb, ma]);
    var t = num(par.t, 0.016), s = mb.s, p = mb.perfil;
    var pt = pontaPerto(mb, ma), sai = pt.sai;
    /* viga com viga PONTA COM PONTA (cumeeira, emenda de topo): a ponta desta encosta numa ponta da outra;
       senão a outra peça é APOIO (pilar, ou viga principal recebendo a secundária na alma) */
    var ehPilar = alvo.tipo === "pilar" || alvo.ifc === "IFCCOLUMN";
    var pa2 = pontaPerto(ma, pt.P), perto = V().len(V().sub(pa2.P, pt.P)) < Math.max(s.alt, ma.s.alt) / 2 + 0.05;
    var vigaVsViga = (!ehPilar || !!par.emenda) && perto;   /* METÁLICA › L: par.emenda = pilar com pilar (emenda por chapas de topo) */
    /* o plano da ponta (com o corte inclinado na alma, se houver) */
    var th = num(mb.cortes[pt.qual === "fim" ? "almaFim" : "almaIni"], 0) * Math.PI / 180, Bl = V().unit(V().add(mb.B, V().mul(mb.X, Math.tan(th))));
    var nrm = V().unit(V().cross(mb.A, Bl)); if (V().dot(nrm, sai) < 0) nrm = V().mul(nrm, -1);
    var E = pt.P, aperto = t, alvoT = 0;
    if (!vigaVsViga) {
      /* a face do pilar que a viga encontra: mesa (eixo B do pilar) ou alma (eixo A) */
      var eB = Math.abs(V().dot(nrm, ma.B)), eA = Math.abs(V().dot(nrm, ma.A)), eixo = eB >= eA ? "b" : "a";
      var ax = eixo === "b" ? ma.B : ma.A, sg = V().dot(ax, nrm) < 0 ? 1 : -1;   /* a face que olha para a viga */
      var fcs = M().faces(ma.perfil).filter(function (f) { return f.n === eixo; }), fc = null;
      fcs.forEach(function (f) { if (!fc || sg * f.meio > sg * fc.meio) fc = f; });
      if (!fc) return erro("O apoio não tem face plana voltada para a viga.");
      var face = fc.meio + sg * fc.t / 2; alvoT = fc.t;
      if (eixo === "a" && Math.max(s.larg, s.alt) > (ma.s.alt - 2 * num(ma.perfil.tf, 0)) + 1e-6 && ma.perfil.forma === "I") res.avisos.push("Ligação na ALMA do pilar: a chapa (" + Math.round(s.alt * 1000) + " mm) não cabe entre as mesas — confira o detalhe");
      var Q = V().add(ma.Pref, V().mul(ax, face)), sStar = V().dot(V().sub(Q, E), ax) / V().dot(nrm, ax);
      if (par.ajustar !== false) {
        var aj = ajustarPonta(mb, pt.qual, sStar - t);
        if (aj) { aplicarAjuste(res, mb, aj); res.avisos.push((mb.origem === "arq" ? "Viga " : "Barra ") + viga.id + ": a ponta " + (sStar - t > 0 ? "estica " : "encurta ") + r1(Math.abs(sStar - t) * 1000) + " mm para a chapa encostar no apoio"); }
        E = V().add(E, V().mul(nrm, sStar - t));
      }
      aperto = t + alvoT;
    } else aperto = 2 * t;
    /* a chapa: u na largura, v ao longo de Bl; espessura para fora da ponta */
    /* gage: 3 db, ou 0,6 da mesa; a chapa alarga se a borda mínima não couber na mesa (largura de PARTIDA) */
    var gage = num(par.gage, cima5(Math.max(3 * c.db, 0.6 * s.larg * 1000, num(p.tw, 0) * 1000 + 2 * num(p.r, 0) * 1000 + c.pf.arr.d2)) / 1000);
    /* METÁLICA › L (14/10/2026, js/acoligsugere.js): par.altura = chapa de topo CURTA (só na altura da alma; sem ela, a altura de sempre) */
    var W = num(par.largura, Math.max(s.larg, cima5((gage + 2 * c.eP) * 1000) / 1000)), ext = num(par.ext, 0), H = (par.altura != null ? num(par.altura, s.alt) : s.alt + 2 * ext) / Math.cos(th);
    var ex, ey; if (V().dot(V().cross(mb.A, Bl), nrm) > 0) { ex = mb.A; ey = Bl; } else { ex = Bl; ey = mb.A; }
    var dimX = ex === mb.A ? W : H, dimY = ex === mb.A ? H : W;
    var O = V().sub(V().sub(E, V().mul(ex, dimX / 2)), V().mul(ey, dimY / 2));
    /* parafusos: 2 colunas no gage, linhas entre as mesas */
    var pf = c.pf, tf = num(p.tf, 0), d = s.alt;
    var c1 = tf + Math.max(0.035, pf.arr.d2 / 2000 + 0.008), zona = par.altura != null ? num(par.altura, d) - 2 * c.eP : d - 2 * c1;
    var nl = Math.round(num(par.linhas, 0));
    if (!(nl >= 1)) { nl = zona > 0 ? Math.max(2, Math.min(8, Math.floor(zona / c.passo + 1e-9) + 1)) : 1; }
    var bs = [];
    if (nl === 1 || zona <= 0) bs.push(0); else for (var i = 0; i < nl; i++) bs.push(zona / 2 - i * zona / (nl - 1));
    if (nl > 1 && zona / (nl - 1) < 2.7 * c.db / 1000) res.avisos.push("Linhas de parafusos a " + r1(zona / (nl - 1) * 1000) + " mm — menos que 2,7 db; reduza o número de linhas");
    if (ext >= 2 * c.eP) { bs.unshift(d / 2 + ext - c.eP); bs.push(-(d / 2 + ext - c.eP)); }
    /* M2 (1.2.145): as linhas do DIMENSIONAMENTO (8 parafusos por mesa: 2 fora e 2 dentro de cada mesa), do eixo da viga (m) */
    if (Array.isArray(par.zs) && par.zs.length) bs = par.zs.map(function (z) { return num(z, 0); });
    var bolts = [], uvs = [];
    bs.forEach(function (b) {
      [-gage / 2, gage / 2].forEach(function (a) {
        var vv = b / Math.cos(th), Pp = V().add(V().add(E, V().mul(mb.A, a)), V().mul(Bl, vv));   /* na face da ponta (lado da viga) */
        bolts.push({ P: Pp, D: nrm, aperto: aperto });
        uvs.push(uvDe(O, ex, ey, Pp));
      });
    });
    var pernaA = pernaMin(t, Math.min(tf || t, num(p.tw, t)));
    var ch = M().chapa({ origem: O, ex: ex, ey: ey, t: t, ret: { L: dimX, B: dimY }, papel: par.papel || (vigaVsViga ? "Chapa de topo" : "Chapa de extremidade"), aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: viga.id,
      solda: par.altura != null ? solda(pernaA, "ambos", 2 * H, false) : solda(pernaA, "contorno", 2 * (s.larg + s.alt), false), furos: uvs.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
    if (ch.erro) return erro(ch.erro);
    res.pecas.push(ch);
    /* M2 (1.2.145): NERVURA da extensão (4ES / 8ES) — triângulo no plano da alma, da mesa até a ponta da chapa, soldado na mesa e na
       chapa; par.nervura = { h, L, t (m), ambas (as duas extensões) } */
    if (par.nervura && !vigaVsViga && num(par.nervura.h, 0) > 0.01) {
      var nh = num(par.nervura.h, 0), nL = num(par.nervura.L, nh * 1.732), nt = num(par.nervura.t, 0.01), chn = Math.min(0.015, nh / 4);
      (par.nervura.ambas ? [1, -1] : [1]).forEach(function (sgn) {
        var ub = V().mul(nrm, -1), vb = V().mul(Bl, sgn), tdir = V().unit(V().cross(ub, vb));
        var base = V().add(E, V().mul(Bl, sgn * (s.alt / 2) / Math.cos(th))), Or = V().sub(base, V().mul(tdir, nt / 2));
        var rb = M().chapa({ origem: Or, ex: ub, ey: vb, t: nt, contorno: [[chn, 0], [nL, 0], [0, nh], [0, chn]], papel: "Nervura da chapa de extremidade", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: viga.id,
          solda: { tipo: "topo", perna: r1(nt * 1000), lados: "ambos", comprimento: r6(nL + nh), campo: false } });
        if (!rb.erro) res.pecas.push(rb); else res.avisos.push("Nervura: " + rb.erro);
      });
    }
    if (vigaVsViga) {
      /* a outra viga leva a chapa espelhada, encostada nesta */
      var pt2 = pontaPerto(ma, E), th2 = num(ma.cortes[pt2.qual === "fim" ? "almaFim" : "almaIni"], 0) * Math.PI / 180, Bl2 = V().unit(V().add(ma.B, V().mul(ma.X, Math.tan(th2))));
      var n2 = V().mul(nrm, -1), E2 = V().add(E, V().mul(nrm, 2 * t));
      var ex2, ey2; if (V().dot(V().cross(ma.A, Bl2), n2) > 0) { ex2 = ma.A; ey2 = Bl2; } else { ex2 = Bl2; ey2 = ma.A; }
      var W2 = W, H2 = (ma.s.alt + 2 * ext) / Math.cos(th2), dX2 = ex2 === ma.A ? W2 : H2, dY2 = ex2 === ma.A ? H2 : W2;
      var O2 = V().sub(V().sub(E2, V().mul(ex2, dX2 / 2)), V().mul(ey2, dY2 / 2));
      var uv2 = bolts.map(function (b) { return uvDe(O2, ex2, ey2, V().add(b.P, V().mul(nrm, 2 * t))); });
      var ch2 = M().chapa({ origem: O2, ex: ex2, ey: ey2, t: t, ret: { L: dX2, B: dY2 }, papel: "Chapa de topo", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: alvo.id,
        solda: solda(pernaMin(t, num(ma.perfil.tf, t)), "contorno", 2 * (ma.s.larg + ma.s.alt), false), furos: uv2.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
      if (ch2.erro) return erro(ch2.erro);
      res.pecas.push(ch2);
    } else furosNosMembros(bolts, [ma], c, res);
    res.parafusos = boltCaixas(bolts, c, res.lig);
    res.resumo = (vigaVsViga ? "Chapas de topo" : "Chapa de extremidade") + " " + Math.round(W * 1000) + " × " + Math.round(H * 1000) + " × " + r1(t * 1000) + " mm, " + bolts.length + " parafusos " + c.id + " (" + bs.length + " linha(s), gage " + Math.round(gage * 1000) + " mm)";
    return fechar(res, c);
  }

  /* ================================================ 3. CANTONEIRA DUPLA
   * par: { cat (cantoneira do catálogo, partida L89X89X7.9), parafuso,
   *        linhas, comprimento (m), folga (m, viga até a face do pilar,
   *        partida 12,7 mm), gage (m, do canto), ajustar } */
  function cantoneiraDupla(viga, pilar, par) {
    par = par || {};
    var mb = M().membro(viga), ma = M().membro(pilar); if (!mb || !ma) return erro("Selecione a VIGA e o PILAR — perfis de aço.");
    var c = comuns(par), res = novoRes("cantoneiraDupla", par, [mb, ma]);
    var cat = par.cat || "L89X89X7.9", Lp = Aco() ? Aco().paraPerfil(cat) : null; if (!Lp || Lp.forma !== "L") return erro("Cantoneira não encontrada no catálogo: " + cat + ".");
    var pt = pontaPerto(mb, ma), d = pt.sai, folga = num(par.folga, 0.0127);
    var eB = Math.abs(V().dot(d, ma.B)), eA = Math.abs(V().dot(d, ma.A)), eixo = eB >= eA ? "b" : "a", ax = eixo === "b" ? ma.B : ma.A, sg = V().dot(ax, d) < 0 ? 1 : -1;
    var fc = null; M().faces(ma.perfil).filter(function (f) { return f.n === eixo; }).forEach(function (f) { if (!fc || sg * f.meio > sg * fc.meio) fc = f; });
    if (!fc) return erro("O pilar não tem face plana voltada para a viga.");
    var Q = V().add(ma.Pref, V().mul(ax, fc.meio + sg * fc.t / 2)), sStar = V().dot(V().sub(Q, pt.P), ax) / V().dot(d, ax);
    var Pf = V().add(pt.P, V().mul(d, sStar));   /* o eixo da viga na face do pilar */
    if (par.ajustar !== false) { var aj = ajustarPonta(mb, pt.qual, sStar - folga); if (aj) mb = aplicarAjuste(res, mb, aj); }
    var s = mb.s, tw = num(mb.perfil.tw, 0.006), tf = num(mb.perfil.tf, 0.01), r = num(mb.perfil.r, 0), A2 = Lp.a, B2 = Lp.b, ta = Lp.t;
    var La = num(par.comprimento, baixo5((s.alt - 2 * (tf + r) - 0.02) * 1000) / 1000);
    if (!(La > 0.05)) return erro("A viga é baixa demais para cantoneira dupla.");
    /* linhas de parafusos ao longo da cantoneira, simétricas */
    var nl = Math.round(num(par.linhas, 0)); if (!(nl >= 1)) nl = Math.max(1, Math.min(8, Math.floor((La - 2 * c.eS) / c.passo + 1e-9) + 1));
    var bs = []; for (var i = 0; i < nl; i++) bs.push((nl - 1) / 2 * c.passo - i * c.passo);
    if ((nl - 1) * c.passo + 2 * c.eS > La + 1e-6) res.avisos.push("As " + nl + " linhas não cabem na cantoneira de " + Math.round(La * 1000) + " mm com " + Math.round(c.eS * 1000) + " mm nas pontas");
    var gTip = Math.max(A2 * 0.55, folga + c.eS);   /* furo da alma: a partir do canto (a face do pilar) */
    var g = num(par.gage, cima5(gTip * 1000) / 1000);
    if (g > A2 - c.eP + 1e-6) res.avisos.push("Gage " + Math.round(g * 1000) + " mm deixa menos que " + Math.round(c.eP * 1000) + " mm até a ponta da aba da cantoneira");
    var pecas = [], boltsAlma = [], boltsPilar = [];
    /* METÁLICA › L (14/10/2026): par.simples = CANTONEIRA SIMPLES (só a do lado +a da alma) */
    (par.simples ? [1] : [1, -1]).forEach(function (sig) {
      var ez = V().mul(mb.A, sig), ey = V().mul(d, -1), ex = V().cross(ey, ez);   /* ez = ex × ey */
      var canto = V().add(Pf, V().mul(mb.A, sig * tw / 2));
      var centro = V().add(V().add(canto, V().mul(ez, B2 / 2)), V().mul(ey, A2 / 2));
      var org = V().sub(centro, V().mul(ex, La / 2));
      var cx = M().perfil({ origem: org, ex: ex, ey: ey, perfil: Lp, L: La, papel: "Cantoneira de ligação", aco: par.aco || "ASTM A36", lig: res.lig });
      if (cx.erro) return;
      pecas.push(cx);
      bs.forEach(function (b, k) {
        var Pm = V().add(Pf, V().mul(mb.B, b));
        if (sig === 1) boltsAlma.push({ P: V().add(V().add(Pm, V().mul(d, -g)), V().mul(mb.A, tw / 2 + ta)), D: V().mul(mb.A, -1), aperto: (par.simples ? 1 : 2) * ta + tw });
        boltsPilar.push({ P: V().add(V().add(Pm, V().mul(mb.A, sig * (tw / 2 + g))), V().mul(d, -ta)), D: d, aperto: ta + fc.t });
      });
    });
    if (pecas.length < (par.simples ? 1 : 2)) return erro("Não deu para montar as cantoneiras.");
    /* os furos das próprias cantoneiras (perfil daqui: os furos moram na peça) */
    pecas = pecas.map(function (cx) {
      var mbL = M().membro(cx), fl = [];
      boltsAlma.concat(boltsPilar).forEach(function (b) { M().furosDoEixo(mbL, b.P, b.D, 0, b.aperto).forEach(function (h) { var fx = N().furo(c.db, c.furo); fl.push({ face: h.face, x: h.x, y: h.y, db: c.db, d: fx.d, l: fx.l, tipo: fx.tipo }); }); });
      var m = cx.metal, q = M().quadro(cx);
      var nv = M().perfil({ origem: q.O, ex: q.X, ey: q.Y, perfil: m.perfil, L: m.L, furos: fl, papel: m.papel, aco: m.aco, lig: res.lig });
      res.conferencia.push({ peca: "Cantoneira de ligação", avisos: conferirMembro(M().membro(nv), nv.metal.furos, "Cantoneira de ligação") });
      return nv;
    });
    res.pecas = pecas;
    /* a viga (alma) e o pilar (mesa/alma) — a viga JÁ na posição ajustada: os furos medem da referência, que não muda */
    furosNosMembros(boltsAlma, [mb], c, res);
    furosNosMembros(boltsPilar, [ma], c, res);
    res.parafusos = boltCaixas(boltsAlma.concat(boltsPilar), c, res.lig);
    res.resumo = (par.simples ? "Cantoneira simples " : "Cantoneira dupla ") + cat + " × " + Math.round(La * 1000) + " mm, " + boltsAlma.length + " parafusos " + c.id + " na alma e " + boltsPilar.length + " no pilar (folga " + r1(folga * 1000) + " mm)";
    return fechar(res, c);
  }

  /* ============================================ 4. EMENDA POR COBREJUNTA
   * par: { tAlma (m, partida 8 mm), tMesa (m, partida 12,5 mm), colunas
   *        (por lado, partida 2), linhasAlma, gageMesa (m), folga (m, entre
   *        as pontas, partida 10 mm), parafuso } */
  function emendaCobrejunta(va, vb, par) {
    par = par || {};
    var ma = M().membro(va), mb2 = M().membro(vb); if (!ma || !mb2) return erro("Selecione as DUAS vigas da emenda — perfis de aço.");
    if (!(ma.perfil.forma === "I" || ma.perfil.forma === "U")) return erro("Emenda por cobrejunta: perfil I ou U.");
    if (Math.abs(V().dot(ma.X, mb2.X)) < 0.999) return erro("As vigas da emenda têm de ser colineares.");
    var c = comuns(par), res = novoRes("emendaCobrejunta", par, [ma, mb2]);
    /* as duas pontas que se encontram: o par de pontas mais próximas (as vigas são colineares — a distância à RETA não decide) */
    var pa = null, pb = null, dmin = Infinity;
    pontas(ma).forEach(function (x) { pontas(mb2).forEach(function (y) { var dd = V().len(V().sub(x.P, y.P)); if (dd < dmin) { dmin = dd; pa = x; pb = y; } }); });
    var J = V().mul(V().add(pa.P, pb.P), 0.5), dir = pa.sai;
    var gap = V().len(V().sub(pb.P, pa.P));
    if (distReta(pb.P, ma.Pref, ma.X) > 0.003) return erro("As vigas não estão alinhadas (eixos desencontrados " + r1(distReta(pb.P, ma.Pref, ma.X) * 1000) + " mm).");
    if (gap > 0.05) res.avisos.push("As pontas estão a " + r1(gap * 1000) + " mm uma da outra — confira a folga da emenda");
    var p = ma.perfil, s = ma.s, d = s.alt, bf = s.larg, tw = num(p.tw, 0.006), tf = num(p.tf, 0.01), r = num(p.r, 0);
    var tA = num(par.tAlma, 0.008), tM = num(par.tMesa, 0.0125), nc = Math.max(1, Math.round(num(par.colunas, 2))), ncA = Math.max(1, Math.round(num(par.colunasAlma, nc)));   /* METÁLICA › L: colunasAlma (padrão = colunas) */
    var x1 = gap / 2 + c.eS, comp = 2 * (x1 + (nc - 1) * c.passo + c.eP);
    var Hw = baixo5((d - 2 * (tf + r) - 0.01) * 1000) / 1000;
    var nr = Math.round(num(par.linhasAlma, 0)); if (!(nr >= 1)) nr = Math.max(1, Math.min(6, Math.floor((Hw - 2 * c.eP) / c.passo + 1e-9) + 1));
    var bs = []; for (var i = 0; i < nr; i++) bs.push((nr - 1) / 2 * c.passo - i * c.passo);
    var gf = num(par.gageMesa, cima5(Math.max(3 * c.db, Math.min(bf * 1000 - 2 * c.eP * 1000, 0.6 * bf * 1000))) / 1000);
    if (gf / 2 - tw / 2 - r < c.pf.arr.d2 / 2000) res.avisos.push("Gage da mesa " + Math.round(gf * 1000) + " mm: a arruela encosta na concordância alma-mesa");
    var xs = []; for (var k = 0; k < nc; k++) { xs.push(-(x1 + k * c.passo)); xs.push(x1 + k * c.passo); }
    var xsA = []; for (var kA = 0; kA < ncA; kA++) { xsA.push(-(x1 + kA * c.passo)); xsA.push(x1 + kA * c.passo); }
    var A = ma.A, B = ma.B, aW = p.forma === "U" ? -bf / 2 + tw / 2 : 0;
    var bolts = [], placas = [];
    /* alma: duas talas (lado +A e −A) */
    var O1 = V().add(V().add(V().add(J, V().mul(dir, -comp / 2)), V().mul(B, -Hw / 2)), V().mul(A, aW + tw / 2));
    var O2 = V().add(V().add(V().add(J, V().mul(dir, -comp / 2)), V().mul(B, -Hw / 2)), V().mul(A, aW - tw / 2));
    var nA = V().cross(dir, B);   /* deveria ser ±A */
    var ladoP = V().dot(nA, A) > 0;
    var pl1 = { O: O1, ex: ladoP ? dir : B, ey: ladoP ? B : dir, dx: ladoP ? comp : Hw, dy: ladoP ? Hw : comp };
    var pl2 = { O: V().add(O2, V().mul(A, 0)), ex: ladoP ? B : dir, ey: ladoP ? dir : B, dx: ladoP ? Hw : comp, dy: ladoP ? comp : Hw };
    xsA.forEach(function (x) { bs.forEach(function (b) { bolts.push({ P: V().add(V().add(V().add(J, V().mul(dir, x)), V().mul(B, b)), V().mul(A, aW + tw / 2 + tA)), D: V().mul(A, -1), aperto: 2 * tA + tw, grupo: "alma" }); }); });
    /* mesas: talas por FORA (em cima e embaixo) */
    var nT = V().cross(A, dir), cimaP = V().dot(nT, B) > 0;
    var Ot = V().add(V().add(V().add(J, V().mul(dir, -comp / 2)), V().mul(A, -bf / 2)), V().mul(B, d / 2));
    var Ob = V().add(V().add(V().add(J, V().mul(dir, -comp / 2)), V().mul(A, -bf / 2)), V().mul(B, -d / 2));
    var plT = { O: Ot, ex: cimaP ? A : dir, ey: cimaP ? dir : A, dx: cimaP ? bf : comp, dy: cimaP ? comp : bf };
    var plB = { O: Ob, ex: cimaP ? dir : A, ey: cimaP ? A : dir, dx: cimaP ? comp : bf, dy: cimaP ? bf : comp };
    xs.forEach(function (x) {
      [-gf / 2, gf / 2].forEach(function (a) {
        var base = V().add(V().add(J, V().mul(dir, x)), V().mul(A, a + 0));
        bolts.push({ P: V().add(base, V().mul(B, d / 2 + tM)), D: V().mul(B, -1), aperto: tM + tf, grupo: "mesaT" });
        bolts.push({ P: V().add(base, V().mul(B, -d / 2 - tM)), D: B, aperto: tM + tf, grupo: "mesaB" });
      });
    });
    function placa(pl, tt, papel, grupo, lado) {
      /* espessura para FORA do perfil: o eixo normal da tala tem de apontar para fora */
      var nrm = V().cross(pl.ex, pl.ey), ex = pl.ex, ey = pl.ey, dx = pl.dx, dy = pl.dy;
      if (V().dot(nrm, lado) < 0) { ex = pl.ey; ey = pl.ex; dx = pl.dy; dy = pl.dx; }
      var uv = bolts.filter(function (b) { return b.grupo === grupo; }).map(function (b) { return uvDe(pl.O, ex, ey, b.P); });
      var cx = M().chapa({ origem: pl.O, ex: ex, ey: ey, t: tt, ret: { L: dx, B: dy }, papel: papel, aco: par.aco || "ASTM A36", lig: res.lig, furos: uv.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
      if (!cx.erro) placas.push(cx);
    }
    placa(pl1, tA, "Tala da alma", "alma", A);
    placa(pl2, tA, "Tala da alma", "alma", V().mul(A, -1));
    placa(plT, tM, "Tala da mesa", "mesaT", B);
    placa(plB, tM, "Tala da mesa", "mesaB", V().mul(B, -1));
    /* as talas do lado −A e de baixo: a origem está na face; a espessura vai para fora — os furos projetados no plano da face servem */
    if (placas.length < 4) return erro("Não deu para montar as talas da emenda.");
    res.pecas = placas;
    furosNosMembros(bolts, [ma, mb2], c, res);
    res.parafusos = boltCaixas(bolts.map(function (b) {
      /* o parafuso da tala de −A/baixo nasce na face externa da tala */
      return b;
    }), c, res.lig);
    res.resumo = "Emenda por cobrejunta: talas da alma " + Math.round(comp * 1000) + " × " + Math.round(Hw * 1000) + " × " + r1(tA * 1000) + " mm (2), talas das mesas " + Math.round(comp * 1000) + " × " + Math.round(bf * 1000) + " × " + r1(tM * 1000) + " mm (2), " + bolts.length + " parafusos " + c.id;
    return fechar(res, c);
  }

  /* ================================================== 5. CLIP DE TERÇA
   * par: { cat (partida L76X76X6.4), terca2 (a terça vizinha, colinear,
   *        que termina na mesma viga — o clip serve as duas), parafusos
   *        (por terça, partida 2), parafuso (partida M12), altura (m, do pé
   *        da terça ao furo) }
   * Terça PASSANTE (a viga cruza longe das pontas): parafusos centrados no
   * cruzamento. Terça que TERMINA na viga: parafusos a partir da ponta. */
  function fechoRetas(P1, D1, P2, D2) {
    var w = V().sub(P1, P2), a = V().dot(D1, D1), b = V().dot(D1, D2), cc = V().dot(D2, D2), d = V().dot(D1, w), e = V().dot(D2, w), den = a * cc - b * b;
    if (Math.abs(den) < 1e-12) return null;
    var s = (b * e - cc * d) / den, t = (a * e - b * d) / den;
    return { s: s, t: t, P: V().add(P1, V().mul(D1, s)), Q: V().add(P2, V().mul(D2, t)) };
  }
  function clipTerca(terca, viga, par) {
    par = par || {};
    var mt = M().membro(terca), mv = M().membro(viga); if (!mt || !mv) return erro("Selecione a TERÇA e a VIGA de cobertura — perfis de aço.");
    var mt2 = par.terca2 ? M().membro(par.terca2) : null;
    var c = comuns({ parafuso: par.parafuso || "M12", classe: par.classe, borda: par.borda, passo: par.passo });
    var res = novoRes("clipTerca", par, mt2 ? [mt, mt2, mv] : [mt, mv]);
    var cat = par.cat || "L76X76X6.4", Lp = Aco() ? Aco().paraPerfil(cat) : null; if (!Lp || Lp.forma !== "L") return erro("Cantoneira não encontrada no catálogo: " + cat + ".");
    var fr = fechoRetas(mt.Pref, mt.X, mv.Pref, mv.X); if (!fr) return erro("A terça e a viga são paralelas — não se cruzam.");
    var xT = fr.s, tolF = 0.06;
    if (xT < mt.xOff - tolF || xT > mt.xOff + mt.L + tolF) return erro("A terça não passa por cima desta viga.");
    var fw = M().faces(mt.perfil).filter(function (f) { return f.face === "v"; })[0]; if (!fw) return erro("A terça precisa de alma plana (U, I, L ou chata).");
    var aFora = fw.meio - fw.t / 2, bPe = -mt.s.alt / 2;
    var canto = M().membroPonto(mt, xT, aFora, bPe);
    /* a terça encosta na mesa de cima da viga? */
    var topoV = M().membroPonto(mv, fr.t, 0, mv.s.alt / 2), folgaApoio = V().dot(V().sub(canto, topoV), mv.B);
    if (Math.abs(folgaApoio) > 0.01) res.avisos.push("A terça está a " + r1(folgaApoio * 1000) + " mm da mesa de cima da viga — o clip foi posto no pé da terça");
    var A2 = Lp.a, B2 = Lp.b, ta = Lp.t, np = Math.max(1, Math.round(num(par.parafusos, 2)));
    var h = num(par.altura, cima5(Math.max(A2 * 0.55, c.eP + ta) * 1000) / 1000);
    if (h > A2 - c.eP + 1e-6) res.avisos.push("Furo a " + Math.round(h * 1000) + " mm do pé: menos de " + Math.round(c.eP * 1000) + " mm até a ponta da aba do clip");
    /* os parafusos de cada terça, como posição ao longo do eixo da terça 1 (s, a partir do cruzamento) */
    var ss = [];
    [mt, mt2].forEach(function (m) {
      if (!m) return;
      var frm = fechoRetas(m.Pref, m.X, mv.Pref, mv.X); if (!frm) return;
      var x = frm.s, x0 = m.xOff, x1 = m.xOff + m.L, sgn = V().dot(m.X, mt.X) >= 0 ? 1 : -1, lst = [];
      var meio = x > x0 + c.eS + (np - 1) * c.passo + 0.05 && x < x1 - c.eS - (np - 1) * c.passo - 0.05;
      if (meio) for (var k = 0; k < np; k++) lst.push(x + (k - (np - 1) / 2) * c.passo);
      else { var pIni = Math.abs(x - x0) < Math.abs(x - x1), xp = pIni ? x0 : x1, dd = pIni ? 1 : -1; for (var k2 = 0; k2 < np; k2++) lst.push(xp + dd * (c.eS + k2 * c.passo)); }
      lst.forEach(function (xx) { ss.push({ s: (xx - x) * sgn, m: m }); });
    });
    var smin = Math.min.apply(null, ss.map(function (q) { return q.s; })) - c.eS, smax = Math.max.apply(null, ss.map(function (q) { return q.s; })) + c.eS;
    var La = num(par.comprimento, Math.max(smax - smin, 0.06));
    var sMeio = (smin + smax) / 2;
    var ez = V().mul(mt.A, -1), ey = mt.B, ex = V().cross(ey, ez);
    var centro = V().add(V().add(V().add(canto, V().mul(mt.X, sMeio)), V().mul(ez, B2 / 2)), V().mul(ey, A2 / 2)), org = V().sub(centro, V().mul(ex, La / 2));
    var bolts = ss.map(function (q) { return { P: V().add(V().add(V().add(canto, V().mul(mt.X, q.s)), V().mul(mt.B, h)), V().mul(ez, ta)), D: mt.A, aperto: ta + fw.t, m: q.m }; });
    var cx = M().perfil({ origem: org, ex: ex, ey: ey, perfil: Lp, L: La, papel: "Clip de terça", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: viga.id,
      solda: solda(pernaMin(ta, num(mv.perfil.tf, ta)), "ambos", 2 * La, false) });
    if (cx.erro) return erro(cx.erro);
    var mbL = M().membro(cx), fl = [];
    bolts.forEach(function (b) { M().furosDoEixo(mbL, b.P, b.D, 0, b.aperto).forEach(function (hh) { var fx = N().furo(c.db, c.furo); fl.push({ face: hh.face, x: hh.x, y: hh.y, db: c.db, d: fx.d, l: fx.l, tipo: fx.tipo }); }); });
    var q = M().quadro(cx);
    cx = M().perfil({ origem: q.O, ex: q.X, ey: q.Y, perfil: Lp, L: La, furos: fl, papel: "Clip de terça", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: viga.id, solda: cx.metal.solda });
    res.conferencia.push({ peca: "Clip de terça", avisos: conferirMembro(M().membro(cx), cx.metal.furos, "Clip de terça") });
    res.pecas.push(cx);
    [mt, mt2].forEach(function (m) { if (m) furosNosMembros(bolts.filter(function (b) { return b.m === m; }), [m], c, res); });
    res.parafusos = boltCaixas(bolts, c, res.lig);
    res.resumo = "Clip de terça " + cat + " × " + Math.round(La * 1000) + " mm soldado na viga, " + bolts.length + " parafuso(s) " + c.id + " na alma da terça" + (mt2 ? " (2 terças)" : "");
    return fechar(res, c);
  }

  /* =========================================== 6/7. CHAPA GUSSET (comum)
   * A barra encosta a face (a aba da cantoneira, a alma do U, a chata) no
   * plano da chapa; os parafusos correm no gage, a partir da ponta. */
  function faceNoPlano(mb, nP) {
    var me = null;
    M().faces(mb.perfil).forEach(function (f) {
      var ax = f.n === "a" ? mb.A : mb.B, k = Math.abs(V().dot(ax, nP));
      if (k > 0.95 && (!me || Math.abs(f.meio) > Math.abs(me.f.meio) - 1e-9)) me = { f: f, ax: ax };
    });
    if (!me) return null;
    /* o lado de FORA da face (a chapa encosta por fora): para L, a aba fica no lado −eixo */
    var f = me.f, out = f.meio - f.t / 2, sinal = -1;
    if (f.meio > 1e-9) { out = f.meio + f.t / 2; sinal = 1; }
    if (mb.perfil.forma === "ret" || mb.perfil.forma === "circ") { out = -f.t / 2; sinal = -1; }
    return { face: f, ax: me.ax, out: out, nOut: V().mul(me.ax, sinal), gage: mb.perfil.forma === "L" ? Math.max(f.larg * 0.55, 0) : f.larg / 2 };
  }
  /* parafusos de UMA barra no gusset: n a partir da ponta (ou centrados em xMeio, barra contínua) */
  function boltsBarra(mb, fn, xs, tG) {
    return xs.map(function (x) {
      var aa = fn.face.n === "a" ? fn.out : fn.face.y0 + fn.gage, bb = fn.face.n === "b" ? fn.out : fn.face.y0 + fn.gage;
      var Pc = M().membroPonto(mb, x, aa, bb);   /* no plano de contato */
      return { P: V().sub(Pc, V().mul(fn.nOut, fn.face.t)), D: fn.nOut, aperto: fn.face.t + tG, Pc: Pc };
    });
  }
  function xsDaPonta(mb, qual, n, c) {
    var o = [], x0 = qual === "fim" ? mb.xOff + mb.L : mb.xOff, sg = qual === "fim" ? -1 : 1;
    for (var k = 0; k < n; k++) o.push(x0 + sg * (c.eS + k * c.passo));
    return o;
  }
  function gussetContorno(uvs, eP, extra) {
    var pts = [];
    uvs.forEach(function (q) { pts = pts.concat(octo(q, eP)); });
    return casca(pts.concat(extra || []));
  }

  /* 6. CONTRAVENTAMENTO: diagonal → apoio (pilar/viga), gusset soldado no apoio
   * par: { t (m, partida 9,5 mm), parafusos (partida 2), parafuso, folga
   *        (m, da ponta da diagonal à face do apoio, partida 20 mm), ajustar } */
  function contraventamento(diag, apoio, par) {
    par = par || {};
    var md = M().membro(diag), ms = M().membro(apoio); if (!md || !ms) return erro("Selecione a DIAGONAL e o APOIO (pilar ou viga) — perfis de aço.");
    var c = comuns(par), res = novoRes("contraventamento", par, [md, ms]);
    var nP0 = V().cross(md.X, ms.X); if (V().len(nP0) < 0.05) return erro("A diagonal é paralela ao apoio.");
    var nP = V().unit(nP0), fn = faceNoPlano(md, nP); if (!fn) return erro("A diagonal precisa de uma aba plana no plano do contraventamento (cantoneira, U, chata) — gire a peça.");
    var tG = num(par.t, 0.0095), n = Math.max(1, Math.round(num(par.parafusos, 2)));
    var pt = pontaPerto(md, ms);
    /* direção, no plano, do apoio para a ponta da diagonal; a face do apoio que olha para lá */
    var w0 = V().cross(fn.nOut, ms.X), wv = V().unit(w0); if (V().dot(wv, V().sub(pt.P, ms.Pref)) - V().dot(wv, V().mul(ms.X, V().dot(V().sub(pt.P, ms.Pref), ms.X))) < 0) wv = V().mul(wv, -1);
    var eB = Math.abs(V().dot(wv, ms.B)), eA = Math.abs(V().dot(wv, ms.A)), eixo = eB >= eA ? "b" : "a", ax = eixo === "b" ? ms.B : ms.A, sg = V().dot(ax, wv) > 0 ? 1 : -1;
    var fcS = null; M().faces(ms.perfil).filter(function (f) { return f.n === eixo; }).forEach(function (f) { if (!fcS || sg * f.meio > sg * fcS.meio) fcS = f; });
    var faceOut = fcS ? fcS.meio + sg * fcS.t / 2 : sg * (eixo === "b" ? ms.s.alt : ms.s.larg) / 2;
    /* a ponta da diagonal recua até `folga` + meia seção da face do apoio */
    var Qs = V().add(ms.Pref, V().mul(ax, faceOut)), dist = V().dot(V().sub(pt.P, Qs), V().mul(ax, sg)), cosA = Math.abs(V().dot(pt.sai, ax));
    var folga = num(par.folga, 0.02), quer = folga + Math.max(md.s.alt, md.s.larg) / 2 * Math.sqrt(Math.max(0, 1 - cosA * cosA));
    if (par.ajustar !== false && cosA > 0.05) {
      var delta = (dist - quer) / cosA;
      var aj = ajustarPonta(md, pt.qual, delta); if (aj) md = aplicarAjuste(res, md, aj);
    }
    var xs = xsDaPonta(md, pt.qual, n, c), bolts = boltsBarra(md, fn, xs, tG);
    /* o gusset: plano de contato, eixo u ao longo do apoio, v = do apoio para a diagonal */
    var nG = fn.nOut, Pc0 = bolts[0].Pc, u = V().unit(V().sub(ms.X, V().mul(nG, V().dot(ms.X, nG)))), vv = V().cross(nG, u);
    if (V().dot(vv, wv) < 0) { u = V().mul(u, -1); vv = V().cross(nG, u); }
    /* origem: no plano de contato, sobre a face do apoio, na altura do parafuso mais próximo */
    var dFace = V().dot(V().sub(Pc0, Qs), ax) * sg, O = V().sub(Pc0, V().mul(vv, dFace / Math.max(1e-6, V().dot(vv, V().mul(ax, sg)))));
    var uvs = bolts.map(function (b) { return uvDe(O, u, vv, b.Pc); });
    var us = uvs.map(function (q) { return q[0]; }), umin = Math.min.apply(null, us) - c.eP * 1.2, umax = Math.max.apply(null, us) + c.eP * 1.2;
    var C = gussetContorno(uvs, c.eP, [[umin, 0], [umax, 0]]);
    /* desloca para u,v ≥ 0 (origem no canto) */
    var mu = Math.min.apply(null, C.map(function (q) { return q[0]; })), mv = Math.min.apply(null, C.map(function (q) { return q[1]; }));
    var O2 = V().add(V().add(O, V().mul(u, mu)), V().mul(vv, mv));
    C = C.map(function (q) { return [q[0] - mu, q[1] - mv]; }); uvs = uvs.map(function (q) { return [q[0] - mu, q[1] - mv]; });
    var compSolda = umax - umin;
    var g = M().chapa({ origem: O2, ex: u, ey: vv, t: tG, contorno: C, papel: "Chapa gusset", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: apoio.id,
      solda: solda(pernaMin(tG, fcS ? fcS.t : tG), "ambos", compSolda, false), furos: uvs.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
    if (g.erro) return erro(g.erro);
    /* a espessura do gusset vai para FORA da diagonal (nG): se ex × ey = −nG, a chapa está do lado errado */
    if (V().dot(V().cross(u, vv), nG) < 0) res.avisos.push("Gusset: conferir o lado da chapa");
    if (fcS && fcS.n === "b") {
      var off = V().dot(V().sub(Pc0, ms.Pref), ms.A);
      if (Math.abs(off) + tG > ms.s.larg / 2 + 1e-6) res.avisos.push("O gusset sai da largura da mesa do apoio (" + r1(Math.abs(off) * 1000) + " mm do eixo) — confira a excentricidade");
    }
    res.pecas.push(g);
    furosNosMembros(bolts, [md], c, res);
    if (res.furos[diag.id] == null && res.furos[md.id]) res.furos[diag.id] = res.furos[md.id];
    res.parafusos = boltCaixas(bolts, c, res.lig);
    res.resumo = "Contraventamento: chapa gusset " + r1(tG * 1000) + " mm soldada no apoio (" + r1(compSolda * 1000) + " mm de solda, 2 lados), " + n + " parafuso(s) " + c.id + " na diagonal";
    return fechar(res, c);
  }

  /* 7. NÓ DE TRELIÇA: várias barras, um gusset aparafusado em todas
   * par: { t (m, partida 9,5 mm), parafusos (por barra, partida 2), parafuso } */
  /* SIMULAÇÃO S2 (14/10/2026) — CONTRAVENTAMENTO EM BARRA REDONDA: a barra recua da ponta até fora do apoio e leva
     uma CHAPA DE APOIO perpendicular a ela, com o furo da barra (rosca, arruela biselada, porca e contraporca), soldada
     no apoio. Desenho esquemático da tipologia "contravento-barra-redonda" (js/acoligtipos.js) — antes ela era só
     dimensionada (sem desenho) e o "Ligar todos os nós" pulava as diagonais do X.
     par = { d (mm, a barra), b (mm, lado da chapa), t (m, espessura), lig } */
  function barraRedonda(diag, apoio, par) {
    par = par || {};
    var md = M().membro(diag), ms = M().membro(apoio); if (!md || !ms) return erro("Selecione a BARRA REDONDA e o APOIO (pilar ou viga) — perfis de aço.");
    var res = novoRes("barraRedonda", par, [md, ms]);
    var pt = pontaPerto(md, ms), sai = pt.sai, dB = num(par.d, Math.max(md.s.alt, md.s.larg) * 1000), b = Math.max(num(par.b, 0), 3 * dB + 20) / 1000, t = num(par.t, 0.0125);
    /* recuo: a chapa fica fora da seção do apoio, na linha da barra */
    var cosA = Math.abs(V().dot(sai, ms.X)), recuo = (Math.max(ms.s.alt, ms.s.larg) / 2 + 0.01) / Math.max(0.2, Math.sqrt(Math.max(0, 1 - cosA * cosA))) + t;
    if (par.ajustar !== false) { var aj = ajustarPonta(md, pt.qual, -recuo); if (aj) md = aplicarAjuste(res, md, aj); }
    var P = pontas(md).filter(function (q) { return q.qual === pt.qual; })[0].P;
    var ref = Math.abs(sai[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], ex = V().unit(V().cross(sai, ref)), ey = V().cross(sai, ex);
    var O = V().sub(V().sub(P, V().mul(ex, b / 2)), V().mul(ey, b / 2));
    var g = M().chapa({ origem: O, ex: ex, ey: ey, t: t, ret: { L: b, B: b }, papel: "Chapa de apoio do tirante", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: apoio.id,
      solda: solda(pernaMin(t, t), "ambos", b, false), furos: [{ u: b / 2, v: b / 2, db: dB, tipo: "padrao" }] });
    if (g.erro) return erro(g.erro);
    res.pecas.push(g);
    res.avisos.push("Desenho esquemático: chapa de apoio perpendicular à barra; a solda no apoio, a arruela biselada, a porca e a contraporca vão no detalhe de fabricação.");
    res.ok = true; res.resumo = "Barra redonda Ø " + r1(dB) + " mm: chapa de apoio " + Math.round(b * 1000) + " × " + Math.round(b * 1000) + " × " + r1(t * 1000) + " mm com furo, arruela biselada, porca e contraporca";
    return res;
  }
  function noTrelica(barras, par) {
    par = par || {};
    var mbs = arr(barras).map(function (b) { return M().membro(b); });
    if (mbs.length < 2 || mbs.some(function (m) { return !m; })) return erro("Selecione 2 ou mais barras de aço que chegam no nó.");
    var c = comuns(par), res = novoRes("noTrelica", par, mbs);
    /* o nó: o ponto mais perto de todos os eixos (mínimos quadrados) */
    var Mx = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bv = [0, 0, 0];
    mbs.forEach(function (m) { var d = m.X, p = m.Pref; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { var k = (i === j ? 1 : 0) - d[i] * d[j]; Mx[i][j] += k; bv[i] += k * p[j]; } });
    var no = resolver3(Mx, bv); if (!no) return erro("As barras são paralelas — não há nó.");
    var nP = null; for (var i2 = 1; i2 < mbs.length && !nP; i2++) { var cr = V().cross(mbs[0].X, mbs[i2].X); if (V().len(cr) > 0.05) nP = V().unit(cr); }
    if (!nP) return erro("As barras são paralelas — não há nó.");
    mbs.forEach(function (m, k) { if (Math.abs(V().dot(m.X, nP)) > 0.02) res.avisos.push("Barra " + (k + 1) + " fora do plano da treliça (" + r1(Math.asin(Math.min(1, Math.abs(V().dot(m.X, nP)))) * 180 / Math.PI) + "°)"); });
    var fn0 = faceNoPlano(mbs[0], nP); if (!fn0) return erro("A barra 1 precisa de aba plana no plano da treliça.");
    var nG = fn0.nOut, tG = num(par.t, 0.0095), n = Math.max(1, Math.round(num(par.parafusos, 2)));
    var planoRef = V().dot(boltsBarra(mbs[0], fn0, [mbs[0].xOff + mbs[0].L / 2], tG)[0].Pc, nG);
    /* cada barra: CONTÍNUA (o nó cai no meio dela — banzo passante: parafusos
       centrados) ou de PONTA (diagonal, montante: a ponta RECUA do nó até não
       encostar nas outras barras, e os parafusos não podem chegar a menos de
       3 db dos de outra barra — o recuo cresce de 10 em 10 mm até caber) */
    var info = [];
    mbs.forEach(function (m, k) {
      var fn = faceNoPlano(m, nP); if (!fn) { res.avisos.push("Barra " + (k + 1) + ": sem aba no plano da treliça — ficou sem parafuso"); return; }
      if (V().dot(fn.nOut, nG) < 0) res.avisos.push("Barra " + (k + 1) + ": a aba está do outro lado do plano — vire a cantoneira");
      fn.nOut = nG;
      var dx = V().dot(V().sub(no, m.Pref), m.X), x0 = m.xOff, x1 = m.xOff + m.L, folgaFim = c.eS + (n - 1) * c.passo;
      var perp = V().unit(V().cross(nG, m.X)), larg = Math.abs(V().dot(perp, m.A)) * m.s.larg + Math.abs(V().dot(perp, m.B)) * m.s.alt;
      var cont = dx > x0 + folgaFim + 0.05 && dx < x1 - folgaFim - 0.05, qual = Math.abs(dx - x0) < Math.abs(dx - x1) ? "ini" : "fim";
      info.push({ m: m, k: k, fn: fn, dx: dx, cont: cont, qual: qual, dir: qual === "ini" ? 1 : -1, larg: larg, recuo: 0 });
    });
    info.forEach(function (a) {
      if (a.cont) return;
      info.forEach(function (b) {
        if (b === a) return;
        var cs = Math.abs(V().dot(a.m.X, b.m.X)), sn = Math.sqrt(Math.max(0, 1 - cs * cs));
        var r = sn < 0.1 ? 0.005 : (b.larg / 2 + 0.01) / sn + (a.larg / 2) * cs / sn;
        if (r > a.recuo) a.recuo = r;
      });
    });
    function xsDe(a) {
      var xs = [];
      if (a.cont) { for (var q = 0; q < n; q++) xs.push(a.dx + (q - (n - 1) / 2) * c.passo); }
      else for (var q2 = 0; q2 < n; q2++) xs.push(a.dx + a.dir * (a.recuo + c.eS + q2 * c.passo));
      return xs;
    }
    var todos = [];
    for (var it = 0; it < 60; it++) {
      todos = [];
      info.forEach(function (a) { boltsBarra(a.m, a.fn, xsDe(a), tG).forEach(function (b) { b.mb = a.m; b.inf = a; todos.push(b); }); });
      var bate = null;
      for (var i3 = 0; i3 < todos.length && !bate; i3++) for (var j3 = i3 + 1; j3 < todos.length; j3++) {
        if (todos[i3].inf === todos[j3].inf) continue;
        if (V().len(V().sub(todos[i3].Pc, todos[j3].Pc)) < 3 * c.db / 1000 - 1e-6) { bate = [todos[i3].inf, todos[j3].inf]; break; }
      }
      if (!bate) break;
      bate.forEach(function (a) { if (!a.cont) a.recuo += 0.01; });
      if (bate[0].cont && bate[1].cont) { res.avisos.push("Duas barras contínuas com parafusos a menos de 3 db no nó — confira"); break; }
    }
    /* a ponta da barra vai para o recuo (encurta ou estica): os furos medem da referência, não mudam */
    info.forEach(function (a) {
      if (a.cont || par.ajustar === false) return;
      var xEnd = a.qual === "ini" ? a.m.xOff : a.m.xOff + a.m.L, xQuer = a.dx + a.dir * a.recuo;
      var delta = a.qual === "ini" ? xEnd - xQuer : xQuer - xEnd;
      var aj = ajustarPonta(a.m, a.qual, delta); if (aj) aplicarAjuste(res, a.m, aj);
    });
    todos.forEach(function (b) { var dz = V().dot(b.Pc, nG) - planoRef; if (Math.abs(dz) > 0.002) res.avisos.push("Barra " + (b.inf.k + 1) + ": a aba fica a " + r1(dz * 1000) + " mm do plano do gusset"); });
    if (!todos.length) return erro("Nenhuma barra ficou com parafuso.");
    var u = V().unit(V().sub(mbs[0].X, V().mul(nG, V().dot(mbs[0].X, nG)))), vv = V().cross(nG, u);
    var O = V().add(no, V().mul(nG, planoRef - V().dot(no, nG)));
    var uvs = todos.map(function (b) { return uvDe(O, u, vv, b.Pc); });
    /* nó no APOIO (treliça chegando no pilar): o gusset vai até a face do apoio e é soldado nela */
    var extra = octo([0, 0], c.eP), ms = par.apoio ? M().membro(par.apoio) : null, compSolda = 0, fcS = null;
    if (ms) {
      var wv = V().cross(nG, ms.X); if (V().len(wv) < 0.05) return erro("O apoio é perpendicular ao plano da treliça.");
      wv = V().unit(wv); var rel = V().sub(no, ms.Pref); if (V().dot(wv, rel) < 0) wv = V().mul(wv, -1);
      var eixo = Math.abs(V().dot(wv, ms.B)) >= Math.abs(V().dot(wv, ms.A)) ? "b" : "a", ax = eixo === "b" ? ms.B : ms.A, sg = V().dot(ax, wv) > 0 ? 1 : -1;
      M().faces(ms.perfil).filter(function (f) { return f.n === eixo; }).forEach(function (f) { if (!fcS || sg * f.meio > sg * fcS.meio) fcS = f; });
      var axn = V().mul(ax, sg), Qs = V().add(ms.Pref, V().mul(ax, fcS ? fcS.meio + sg * fcS.t / 2 : sg * ms.s.alt / 2));
      var k0 = V().dot(V().sub(O, Qs), axn), ku = V().dot(u, axn), kv = V().dot(vv, axn);
      /* a reta da face no plano (u, v): k0 + ku·u + kv·v = 0; a direção dela é (−kv, ku) */
      var dl = [-kv, ku], nd = Math.sqrt(dl[0] * dl[0] + dl[1] * dl[1]); dl = [dl[0] / nd, dl[1] / nd];
      var p0 = [-k0 * ku / (ku * ku + kv * kv), -k0 * kv / (ku * ku + kv * kv)];
      var ts = uvs.map(function (q) { return (q[0] - p0[0]) * dl[0] + (q[1] - p0[1]) * dl[1]; });
      var t0 = Math.min.apply(null, ts) - c.eP * 1.2, t1 = Math.max.apply(null, ts) + c.eP * 1.2;
      extra = [[p0[0] + dl[0] * t0, p0[1] + dl[1] * t0], [p0[0] + dl[0] * t1, p0[1] + dl[1] * t1]];
      compSolda = t1 - t0;
    }
    var C = gussetContorno(uvs, c.eP, extra);
    var mu = Math.min.apply(null, C.map(function (q) { return q[0]; })), mv = Math.min.apply(null, C.map(function (q) { return q[1]; }));
    var O2 = V().add(V().add(O, V().mul(u, mu)), V().mul(vv, mv));
    C = C.map(function (q) { return [q[0] - mu, q[1] - mv]; }); uvs = uvs.map(function (q) { return [q[0] - mu, q[1] - mv]; });
    var g = M().chapa({ origem: O2, ex: u, ey: vv, t: tG, contorno: C, papel: "Gusset de nó", aco: par.aco || "ASTM A36", lig: res.lig, furos: uvs.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }),
      soldadaEm: ms ? par.apoio.id : null, solda: ms ? solda(pernaMin(tG, fcS ? fcS.t : tG), "ambos", compSolda, false) : null });
    if (g.erro) return erro(g.erro);
    res.pecas.push(g);
    mbs.forEach(function (m) { furosNosMembros(todos.filter(function (b) { return b.mb === m; }), [m], c, res); });
    res.parafusos = boltCaixas(todos, c, res.lig);
    res.resumo = "Nó de treliça: gusset " + r1(tG * 1000) + " mm, " + mbs.length + " barras, " + todos.length + " parafusos " + c.id;
    return fechar(res, c);
  }
  function resolver3(A, b) {
    var m = A.map(function (l, i) { return l.concat([b[i]]); });
    for (var c = 0; c < 3; c++) {
      var p = c; for (var r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      if (Math.abs(m[p][c]) < 1e-10) return null;
      var t = m[c]; m[c] = m[p]; m[p] = t;
      for (var r2 = 0; r2 < 3; r2++) if (r2 !== c) { var f = m[r2][c] / m[c][c]; for (var k = c; k < 4; k++) m[r2][k] -= f * m[c][k]; }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }

  /* ===================================================== 8. ENRIJECEDOR
   * Chapas no plano da seção, soldadas na alma e nas mesas de um perfil I/U.
   * par: { x (m, do início da barra; vazio = no meio), t (m, partida 8 mm),
   *        lados ("ambos" | "um"), chanfro (m, partida = raio + 5 mm: livra a
   *        concordância alma-mesa) } */
  function enrijecedor(membro, par) {
    par = par || {};
    var mb = M().membro(membro); if (!mb || !(mb.perfil.forma === "I" || mb.perfil.forma === "U")) return erro("Selecione um pilar ou viga de perfil I ou U.");
    var res = novoRes("enrijecedor", par, [mb]), p = mb.perfil, d = mb.s.alt, bf = mb.s.larg, tw = num(p.tw, 0.006), tf = num(p.tf, 0.01), r = num(p.r, 0);
    var t = num(par.t, 0.008), x = mb.xOff + num(par.x, mb.L / 2), ch = num(par.chanfro, r + 0.005), H = d - 2 * tf;
    var lados = par.lados === "um" ? [1] : (p.forma === "U" ? [1] : [1, -1]);
    var aW = p.forma === "U" ? -bf / 2 + tw / 2 : 0;
    lados.forEach(function (sg) {
      var W = p.forma === "U" ? bf - tw : (bf - tw) / 2;
      if (!(W > 0.01 && H > 0.02)) return;
      var ex = V().mul(mb.A, sg), ey = mb.B;   /* ex × ey = −sg·X: a espessura vai para trás; a origem fica meio t à frente */
      var O = M().membroPonto(mb, x + sg * t / 2, aW + sg * tw / 2, -(d / 2 - tf));
      var C = [[0, 0], [W, 0], [W, H], [0, H]];
      var cx = M().chapa({ origem: O, ex: ex, ey: ey, t: t, contorno: C, chanfros: ch > 0 ? [{ i: 0, c: ch }, { i: 3, c: ch }] : [], papel: "Enrijecedor", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: membro.id,
        solda: solda(pernaMin(t, Math.min(tw, tf)), "ambos", 2 * (W - ch) + (H - 2 * ch), false) });
      if (!cx.erro) res.pecas.push(cx);
    });
    if (!res.pecas.length) return erro("O perfil não tem espaço para o enrijecedor.");
    res.resumo = res.pecas.length + " enrijecedor(es) #" + r1(t * 1000) + " mm a " + r1((x - mb.xOff) * 1000) + " mm do início, soldados na alma e nas mesas (chanfro " + r1(ch * 1000) + " mm)";
    return fechar(res, {});
  }

  /* =========================================== 9. CHAPA SIMPLES DE CISALHAMENTO
   * METÁLICA › L (14/10/2026, js/acoligsugere.js). Chapa soldada no apoio (mesa ou alma do pilar, alma da viga
   * principal), paralela à alma da viga, do lado +a; uma linha vertical de parafusos na alma.
   * par: { t (m, partida 9,5 mm), parafuso, linhas, a (m, da face do apoio à linha de parafusos, partida 75 mm),
   *        altura (m, da chapa; vazio = pelas linhas), largura (m; vazio = a + borda), folga (m, partida 12,7 mm),
   *        ajustar } */
  function chapaSimples(viga, apoio, par) {
    par = par || {};
    var mb = M().membro(viga), ma = M().membro(apoio); if (!mb || !ma) return erro("Selecione a VIGA e o APOIO (pilar ou viga principal) — perfis de aço.");
    if (viga.id === apoio.id) return erro("A viga e o apoio são a mesma peça.");
    var c = comuns(par), res = novoRes("chapaSimples", par, [mb, ma]);
    var pt = pontaPerto(mb, ma), d = pt.sai, folga = num(par.folga, 0.0127), t = num(par.t, 0.0095), a = num(par.a, 0.075);
    var eB = Math.abs(V().dot(d, ma.B)), eA = Math.abs(V().dot(d, ma.A)), eixo = eB >= eA ? "b" : "a", ax = eixo === "b" ? ma.B : ma.A, sg = V().dot(ax, d) < 0 ? 1 : -1;
    var fc = null, sStar, Dpass = 0, tw0 = num(mb.perfil.tw, 0.006);
    if (ma.perfil && ma.perfil.forma === "tubo-circ") {
      /* M2 (1.2.145): pilar TUBULAR circular — a chapa (no plano da alma da viga, afastada tw/2 + t/2 do eixo) encosta na superfície do
         tubo a √(R² − e²) do eixo; a parede é a "face" (espessura t0) */
      var R0 = num(ma.perfil.D, num(ma.perfil.d, 0.2)) / 2, t0 = num(ma.perfil.t, 0.006), eo = tw0 / 2 + t / 2, rel = V().sub(pt.P, ma.Pref); rel = V().sub(rel, V().mul(ma.X, V().dot(rel, ma.X)));
      var dAx = -V().dot(rel, d) / Math.max(1e-9, V().dot(d, d)), rr = Math.sqrt(Math.max(R0 * R0 - eo * eo, 0));
      sStar = dAx - rr; fc = { t: t0, meio: 0 }; Dpass = 2 * rr;
    } else {
      M().faces(ma.perfil).filter(function (f) { return f.n === eixo; }).forEach(function (f) { if (!fc || sg * f.meio > sg * fc.meio) fc = f; });
      if (!fc) return erro("O apoio não tem face plana voltada para a viga.");
      var Q = V().add(ma.Pref, V().mul(ax, fc.meio + sg * fc.t / 2)); sStar = V().dot(V().sub(Q, pt.P), ax) / V().dot(d, ax);
      if (par.passante) Dpass = ma.perfil.forma === "tubo-ret" ? (eixo === "b" ? num(ma.perfil.h, ma.s.alt) : num(ma.perfil.b, ma.s.larg)) : 0;
    }
    if (par.passante && !(Dpass > 0)) return erro("Chapa passante: o apoio tem de ser um pilar TUBULAR.");
    var Pf = V().add(pt.P, V().mul(d, sStar));
    if (par.ajustar !== false) { var aj = ajustarPonta(mb, pt.qual, sStar - folga); if (aj) { mb = aplicarAjuste(res, mb, aj); res.avisos.push((mb.origem === "arq" ? "Viga " : "Barra ") + viga.id + ": a ponta " + (sStar - folga > 0 ? "estica " : "encurta ") + r1(Math.abs(sStar - folga) * 1000) + " mm (folga de " + r1(folga * 1000) + " mm até o apoio)"); } }
    var s = mb.s, tw = num(mb.perfil.tw, 0.006), tf = num(mb.perfil.tf, 0.01), r = num(mb.perfil.r, 0);
    var nl = Math.round(num(par.linhas, 0)), livre = s.alt - 2 * (tf + r) - 0.015;
    if (!(nl >= 1)) nl = Math.max(2, Math.min(9, Math.floor((livre - 2 * c.eP) / c.passo + 1e-9) + 1));
    var Lp = num(par.altura, (nl - 1) * c.passo + 2 * c.eP), W = num(par.largura, a + Math.max(c.eP, 0.035));
    if (Lp > livre + 0.015 + 1e-6) res.avisos.push("A chapa (" + Math.round(Lp * 1000) + " mm) passa da altura livre da alma (" + Math.round((livre + 0.015) * 1000) + " mm)");
    if (eixo === "a" && ma.perfil.forma === "I" && s.larg > ma.s.alt - 2 * num(ma.perfil.tf, 0) + 1e-6) res.avisos.push("Ligação na ALMA do pilar: a viga (" + Math.round(s.larg * 1000) + " mm) não cabe entre as mesas — recorte as mesas da viga");
    /* quadro da chapa: u da face do apoio para dentro da viga (−sai), v na altura (±B), espessura (u × v) para +a */
    var u = V().mul(d, -1), sv = V().dot(u, mb.X) > 0 ? 1 : -1, vv = V().mul(mb.B, sv);
    var O = V().sub(V().add(Pf, V().mul(mb.A, tw / 2)), V().mul(vv, Lp / 2));
    var bolts = [], uvs = [];
    /* chapa PASSANTE: começa na parede do fundo (Dpass para dentro do apoio) — os furos ficam a Dpass + a da origem */
    var du = par.passante ? Dpass : 0, Op = par.passante ? V().add(O, V().mul(d, Dpass)) : O;
    for (var i = 0; i < nl; i++) {
      var vq = Lp / 2 + (i - (nl - 1) / 2) * c.passo, Pp = V().add(V().add(V().add(O, V().mul(u, a)), V().mul(vv, vq)), V().mul(mb.A, t));
      bolts.push({ P: Pp, D: V().mul(mb.A, -1), aperto: (par.dupla ? 2 * t : t) + tw }); uvs.push([a + du, vq]);
    }
    var ch = M().chapa({ origem: Op, ex: u, ey: vv, t: t, ret: { L: W + du, B: Lp }, papel: "Chapa simples", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: apoio.id,
      solda: solda(pernaMin(t, fc.t), "ambos", par.passante ? 2 * Lp : Lp, false), furos: uvs.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
    if (par.passante) res.avisos.push("Chapa passante: rasgos nas duas paredes do tubo (largura da chapa + 2 mm) e solda dos dois lados da chapa em cada parede — no desenho de fabricação");
    if (ch.erro) return erro(ch.erro);
    if (V().dot(V().cross(u, vv), mb.A) < 0) res.avisos.push("Chapa simples: conferir o lado da chapa");
    res.pecas.push(ch);
    if (par.dupla) {
      /* TALA DUPLA: a 2ª chapa do lado −a da alma (espessura para −a: u × (−v) = −a); os mesmos parafusos atravessam as duas */
      var ey2 = V().mul(vv, -1), O2 = V().add(V().sub(Pf, V().mul(mb.A, tw / 2)), V().mul(vv, Lp / 2));
      var ch2 = M().chapa({ origem: O2, ex: u, ey: ey2, t: t, ret: { L: W, B: Lp }, papel: "Chapa simples", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: apoio.id,
        solda: solda(pernaMin(t, fc.t), "ambos", Lp, false), furos: bolts.map(function (b) { var q = uvDe(O2, u, ey2, b.P); return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
      if (ch2.erro) return erro(ch2.erro);
      res.pecas.push(ch2);
    }
    furosNosMembros(bolts, [mb], c, res);
    res.parafusos = boltCaixas(bolts, c, res.lig);
    res.resumo = (par.dupla ? "Tala dupla (2 chapas) " : par.passante ? "Chapa passante " : "Chapa simples ") + Math.round((W + du) * 1000) + " × " + Math.round(Lp * 1000) + " × " + r1(t * 1000) + " mm " + (par.passante ? "atravessando o tubo" : "soldada no apoio") + ", " + nl + " parafusos " + c.id + " na alma (a = " + Math.round(a * 1000) + " mm, folga " + r1(folga * 1000) + " mm)";
    return fechar(res, c);
  }

  /* ============================================ 10. ASSENTO (cantoneira de assento ou assento enrijecido)
   * METÁLICA › L (14/10/2026, js/acoligsugere.js). A viga apoia na aba horizontal de uma cantoneira aparafusada no
   * pilar (mesa ou alma); cantoneira de topo L 76 de estabilidade; 2 parafusos de montagem em cada mesa da viga.
   * Enrijecido (par.enrijecido): chapa de assento + enrijecedor vertical soldados no pilar (sem parafusos no pilar).
   * par: { cat (partida L102X102X12.7), comprimento (m, ao longo da largura da viga), parafuso, parafusos (no pilar: 2 | 4),
   *        catTopo (L76X76X6.4), folga (m, 12,7 mm), enrijecido, largura (m, chapa de assento), t (m, chapa),
   *        ts (m, enrijecedor), hs (m, altura do enrijecedor), ajustar } */
  function assento(viga, apoio, par) {
    par = par || {};
    var mb = M().membro(viga), ma = M().membro(apoio); if (!mb || !ma) return erro("Selecione a VIGA e o APOIO (pilar) — perfis de aço.");
    var c = comuns(par), res = novoRes("assento", par, [mb, ma]);
    var pt = pontaPerto(mb, ma), d = pt.sai, folga = num(par.folga, 0.0127);
    var eB = Math.abs(V().dot(d, ma.B)), eA = Math.abs(V().dot(d, ma.A)), eixo = eB >= eA ? "b" : "a", ax = eixo === "b" ? ma.B : ma.A, sg = V().dot(ax, d) < 0 ? 1 : -1;
    var fc = null; M().faces(ma.perfil).filter(function (f) { return f.n === eixo; }).forEach(function (f) { if (!fc || sg * f.meio > sg * fc.meio) fc = f; });
    if (!fc) return erro("O apoio não tem face plana voltada para a viga.");
    var Q = V().add(ma.Pref, V().mul(ax, fc.meio + sg * fc.t / 2)), sStar = V().dot(V().sub(Q, pt.P), ax) / V().dot(d, ax);
    var Pf = V().add(pt.P, V().mul(d, sStar));
    if (par.ajustar !== false) { var aj = ajustarPonta(mb, pt.qual, sStar - folga); if (aj) mb = aplicarAjuste(res, mb, aj); }
    var s = mb.s, tf = num(mb.perfil.tf, 0.01), bf = s.larg, UPv = [0, 1, 0];
    var dn = V().dot(mb.B, UPv) >= 0 ? V().mul(mb.B, -1) : mb.B, up = V().mul(dn, -1);
    var Y = V().mul(d, -1);
    function cantoneira(cat, canto, Z, L, papel) {
      var Lp = Aco() ? Aco().paraPerfil(cat) : null; if (!Lp || Lp.forma !== "L") return null;
      var X = V().cross(Y, Z), centro = V().add(V().add(canto, V().mul(Z, Lp.b / 2)), V().mul(Y, Lp.a / 2)), org = V().sub(centro, V().mul(X, L / 2));
      var cx = M().perfil({ origem: org, ex: X, ey: Y, perfil: Lp, L: L, papel: papel, aco: par.aco || "ASTM A36", lig: res.lig });
      return cx.erro ? null : { cx: cx, Lp: Lp, X: X };
    }
    var La = num(par.comprimento, Math.ceil((bf + 0.02) * 100 - 1e-9) / 100), boltsCol = [], boltsVig = [], pecas = [];
    var gf = Math.max(3 * c.db / 1000, cima5(0.55 * bf * 1000) / 1000), gv = 0, gh = 0;
    var cantoB = V().add(Pf, V().mul(dn, s.alt / 2)), cantoT = V().add(Pf, V().mul(up, s.alt / 2));
    if (!par.enrijecido) {
      var an = cantoneira(par.cat || "L102X102X12.7", cantoB, dn, La, "Cantoneira de assento"); if (!an) return erro("Cantoneira de assento não encontrada no catálogo: " + (par.cat || "L102X102X12.7") + ".");
      var ta = an.Lp.t, X = an.X, nCol = Math.round(num(par.parafusos, 2)) >= 4 ? 4 : 2;
      gv = Math.max(cima5((ta + c.eP) * 1000) / 1000, cima5(0.55 * an.Lp.b * 1000) / 1000);
      gh = Math.max(cima5((folga + c.eS) * 1000) / 1000, cima5(0.5 * an.Lp.a * 1000) / 1000);
      if (par.gv != null) gv = num(par.gv, gv); if (par.gh != null) gh = num(par.gh, gh);
      var gx = par.gx != null ? num(par.gx, 0) : Math.min(gf, La - 2 * c.eP), gxP = par.gxPilar != null ? num(par.gxPilar, gx) : gx, linhasV = nCol === 4 ? [gv, gv + c.passo] : [gv];
      var nhV = Math.max(1, Math.round(num(par.linhasViga, 1))), psV = num(par.passoViga, c.passo), linhasH = []; for (var ih = 0; ih < nhV; ih++) linhasH.push(gh + ih * psV);
      if (nCol === 4 && gv + c.passo > an.Lp.b - c.eP + 1e-6) res.avisos.push("Assento: a 2ª linha de parafusos não cabe na aba vertical (" + Math.round(an.Lp.b * 1000) + " mm)");
      linhasV.forEach(function (z) { [-gxP / 2, gxP / 2].forEach(function (x) { boltsCol.push({ P: V().add(V().add(V().add(cantoB, V().mul(dn, z)), V().mul(X, x)), V().mul(Y, ta)), D: d, aperto: ta + fc.t }); }); });
      linhasH.forEach(function (yh) { [-gx / 2, gx / 2].forEach(function (x) { boltsVig.push({ P: V().add(V().add(V().add(cantoB, V().mul(Y, yh)), V().mul(X, x)), V().mul(dn, ta)), D: up, aperto: ta + tf }); }); });
      pecas.push(an);
    } else {
      var X2 = V().cross(Y, dn), W = num(par.largura, 0.15), tp = num(par.t, 0.0125), ts = num(par.ts, 0.0125), hs = num(par.hs, Math.max(2 * W, 0.15));
      var Oc = V().sub(cantoB, V().mul(X2, La / 2));
      var chA = M().chapa({ origem: Oc, ex: X2, ey: Y, t: tp, ret: { L: La, B: W }, papel: "Chapa de assento", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: apoio.id, solda: solda(pernaMin(tp, fc.t), "ambos", La, false), furos: [] });
      if (chA.erro) return erro(chA.erro);
      var Os = V().sub(V().add(cantoB, V().mul(dn, tp)), V().mul(X2, ts / 2)), cont = [[0, 0], [W, 0], [W, Math.min(0.3 * hs, 0.06)], [0, hs]];
      var chS = M().chapa({ origem: Os, ex: Y, ey: dn, t: ts, contorno: cont, papel: "Enrijecedor do assento", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: apoio.id, solda: solda(pernaMin(ts, fc.t), "ambos", hs + W, false) });
      if (chS.erro) return erro(chS.erro);
      gh = Math.max(cima5((folga + c.eS) * 1000) / 1000, W / 2);
      var gx2 = Math.min(gf, La - 2 * c.eP);
      [-gx2 / 2, gx2 / 2].forEach(function (x) { boltsVig.push({ P: V().add(V().add(V().add(cantoB, V().mul(Y, gh)), V().mul(X2, x)), V().mul(dn, tp)), D: up, aperto: tp + tf }); });
      chA.metal.furos = boltsVig.map(function (b) { var q = uvDe(Oc, X2, Y, b.P); return M().normFuroFace ? { u: q[0], v: q[1], db: c.db, tipo: c.furo } : { u: q[0], v: q[1], db: c.db, tipo: c.furo }; });
      chA = M().chapa({ origem: Oc, ex: X2, ey: Y, t: tp, ret: { L: La, B: W }, papel: "Chapa de assento", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: apoio.id, solda: solda(pernaMin(tp, fc.t), "ambos", La, false), furos: chA.metal.furos });
      res.pecas.push(chA, chS);
    }
    /* cantoneira de topo (estabilidade): aba horizontal sobre a mesa de cima, aba vertical no apoio */
    /* M2 (1.2.145): par.topoMomento — a cantoneira de topo da ligação SEMIRRÍGIDA (leva a tração do binário): o perfil, os gabaritos e
       as linhas na mesa da viga do dimensionamento; papel próprio (o cálculo da estrutura a lê como nó rígido — js/acomodelolivre.js) */
    var top = cantoneira(par.catTopo || "L89X89X6.4", cantoT, up, La, par.topoMomento ? "Cantoneira de topo (momento)" : "Cantoneira de topo");   /* L 89: a borda dos furos cabe (revisão A4: 26,2 < 27 na L 76) */
    if (top) {
      var tt = top.Lp.t, Xt = top.X, gvt = Math.max(cima5((tt + c.eP) * 1000) / 1000, cima5(0.55 * top.Lp.b * 1000) / 1000), ght = Math.max(cima5((folga + c.eS) * 1000) / 1000, cima5(0.5 * top.Lp.a * 1000) / 1000), gxt = Math.min(gf, La - 2 * c.eP), gxtV = gxt, linT = [ght];
      if (par.topoMomento) { if (par.gv != null) gvt = num(par.gv, gvt); if (par.gh != null) ght = num(par.gh, ght); if (par.gxPilar != null) gxt = num(par.gxPilar, gxt); if (par.gx != null) gxtV = num(par.gx, gxtV);
        linT = []; for (var it2 = 0; it2 < Math.max(1, Math.round(num(par.linhasViga, 1))); it2++) linT.push(ght + it2 * num(par.passoViga, c.passo)); }
      [-gxt / 2, gxt / 2].forEach(function (x) { boltsCol.push({ P: V().add(V().add(V().add(cantoT, V().mul(up, gvt)), V().mul(Xt, x)), V().mul(Y, tt)), D: d, aperto: tt + fc.t }); });
      linT.forEach(function (yh) { [-gxtV / 2, gxtV / 2].forEach(function (x) { boltsVig.push({ P: V().add(V().add(V().add(cantoT, V().mul(Y, yh)), V().mul(Xt, x)), V().mul(up, tt)), D: dn, aperto: tt + tf }); }); });
      pecas.push(top);
    }
    /* os furos das cantoneiras (os furos moram na peça) */
    pecas.forEach(function (pc) {
      var mbL = M().membro(pc.cx), fl = [];
      boltsCol.concat(boltsVig).forEach(function (b) { M().furosDoEixo(mbL, b.P, b.D, 0, b.aperto).forEach(function (h) { var fx = N().furo(c.db, c.furo); fl.push({ face: h.face, x: h.x, y: h.y, db: c.db, d: fx.d, l: fx.l, tipo: fx.tipo }); }); });
      var m = pc.cx.metal, q = M().quadro(pc.cx);
      var nv = M().perfil({ origem: q.O, ex: q.X, ey: q.Y, perfil: m.perfil, L: m.L, furos: fl, papel: m.papel, aco: m.aco, lig: res.lig });
      res.conferencia.push({ peca: m.papel, avisos: conferirMembro(M().membro(nv), nv.metal.furos, m.papel) });
      res.pecas.push(nv);
    });
    furosNosMembros(boltsVig, [mb], c, res);
    if (boltsCol.length) furosNosMembros(boltsCol, [ma], c, res);
    res.parafusos = boltCaixas(boltsCol.concat(boltsVig), c, res.lig);
    res.resumo = (par.enrijecido ? "Assento enrijecido (chapa de assento + enrijecedor soldados no apoio)" : "Cantoneira de assento " + (par.cat || "L102X102X12.7") + " × " + Math.round(La * 1000) + " mm") + ", cantoneira de topo " + (par.catTopo || "L89X89X6.4") + ", " + res.parafusos.length + " parafusos " + c.id;
    return fechar(res, c);
  }

  /* ===================== 11. LIGAÇÕES DE MOMENTO SEM CHAPA DE EXTREMIDADE: talas de mesa, soldada direta; reforço
   * METÁLICA › L (14/10/2026, rodada 2, js/acoligsugere.js). A face do apoio, a ponta da viga e o quadro (Y para dentro da
   * viga a partir da face; up/dn na altura da seção) são os mesmos do assento. */
  function faceDoApoio(mb, ma, par, res, viga) {
    var pt = pontaPerto(mb, ma), d = pt.sai, folga = num(par.folga, 0.0127);
    var eB = Math.abs(V().dot(d, ma.B)), eA = Math.abs(V().dot(d, ma.A)), eixo = eB >= eA ? "b" : "a", ax = eixo === "b" ? ma.B : ma.A, sg = V().dot(ax, d) < 0 ? 1 : -1;
    var fc = null; M().faces(ma.perfil).filter(function (f) { return f.n === eixo; }).forEach(function (f) { if (!fc || sg * f.meio > sg * fc.meio) fc = f; });
    if (!fc) return null;
    var Q = V().add(ma.Pref, V().mul(ax, fc.meio + sg * fc.t / 2)), sStar = V().dot(V().sub(Q, pt.P), ax) / V().dot(d, ax);
    var Pf = V().add(pt.P, V().mul(d, sStar)), cxV = viga;
    if (par.ajustar !== false) { var aj = ajustarPonta(mb, pt.qual, sStar - folga); if (aj) { mb = aplicarAjuste(res, mb, aj); if (aj._apos) cxV = aj._apos; } }
    var dn = V().dot(mb.B, [0, 1, 0]) >= 0 ? V().mul(mb.B, -1) : mb.B;
    return { mb: mb, Pf: Pf, d: d, Y: V().mul(d, -1), fc: fc, folga: folga, dn: dn, up: V().mul(dn, -1), viga: cxV };
  }
  /* par: { t (m), largura (m), parafuso, linhas (por mesa, 2 parafusos cada), gage (m), passo (m), comprimento (m),
   *        soldada (sem parafusos nas mesas), alma: { parâmetros da chapa simples } | null, folga, ajustar } */
  function talasMesa(viga, apoio, par) {
    par = par || {};
    var mb = M().membro(viga), ma = M().membro(apoio); if (!mb || !ma) return erro("Selecione a VIGA e o PILAR — perfis de aço.");
    if (!(mb.perfil.forma === "I")) return erro("Talas de mesa: viga de perfil I.");
    var c = comuns(par), res = novoRes("talasMesa", par, [mb, ma]), F = faceDoApoio(mb, ma, par, res, viga);
    if (!F) return erro("O apoio não tem face plana voltada para a viga.");
    mb = F.mb;
    var s = mb.s, tf = num(mb.perfil.tf, 0.01), t = num(par.t, 0.0125), bp = num(par.largura, s.larg), sold = !!par.soldada;
    var nr = Math.max(1, Math.round(num(par.linhas, 2))), passo = num(par.passo, c.passo), gg = num(par.gage, cima5(Math.max(3 * c.db, 0.55 * s.larg * 1000)) / 1000);
    var u1 = F.folga + Math.max(c.eS, c.eP), Lt = num(par.comprimento, sold ? F.folga + 0.1 : u1 + (nr - 1) * passo + c.eP);
    if (!sold) Lt = Math.max(Lt, u1 + (nr - 1) * passo + c.eP);
    var bolts = [];
    [[F.up, "Chapa de mesa (superior)"], [F.dn, "Chapa de mesa (inferior)"]].forEach(function (q) {
      var Z = q[0], ey = V().cross(Z, F.Y), canto = V().add(F.Pf, V().mul(Z, s.alt / 2)), O = V().sub(canto, V().mul(ey, bp / 2)), fur = [], bs = [];
      if (!sold) for (var i = 0; i < nr; i++) [bp / 2 - gg / 2, bp / 2 + gg / 2].forEach(function (v) {
        var u = u1 + i * passo; fur.push({ u: u, v: v, db: c.db, tipo: c.furo });
        bs.push({ P: V().add(V().add(V().add(O, V().mul(F.Y, u)), V().mul(ey, v)), V().mul(Z, t)), D: V().mul(Z, -1), aperto: t + tf });
      });
      var ch = M().chapa({ origem: O, ex: F.Y, ey: ey, t: t, ret: { L: Lt, B: bp }, papel: q[1], aco: par.aco || "ASTM A572 Gr.50", lig: res.lig, soldadaEm: apoio.id,
        solda: solda(pernaMin(t, F.fc.t), "ambos", bp, false), furos: fur });
      if (!ch.erro) res.pecas.push(ch);
      bolts = bolts.concat(bs);
    });
    if (res.pecas.length < 2) return erro("Não deu para montar as talas de mesa.");
    furosNosMembros(bolts, [mb], c, res);
    res.parafusos = boltCaixas(bolts, c, res.lig);
    /* a alma: chapa simples (mesma ligação), com a viga JÁ na posição ajustada */
    if (par.alma !== null) {
      var pa = {}; Object.keys(par.alma || {}).forEach(function (k) { pa[k] = par.alma[k]; }); pa.lig = res.lig; pa.ajustar = false; pa.folga = F.folga;
      var ra = chapaSimples(F.viga, apoio, pa);
      if (ra.ok) {
        res.pecas = res.pecas.concat(ra.pecas); res.parafusos = res.parafusos.concat(ra.parafusos);
        Object.keys(ra.furos).forEach(function (id) { res.furos[id] = (res.furos[id] || []).concat(ra.furos[id]); });
        res.conferencia = res.conferencia.concat(ra.conferencia);
      } else res.avisos.push("Chapa da alma: " + ra.motivo);
    }
    res.resumo = "Talas de mesa " + Math.round(bp * 1000) + " × " + Math.round(Lt * 1000) + " × " + r1(t * 1000) + " mm soldadas no apoio" + (sold ? " e na viga (sem parafusos)" : ", " + bolts.length + " parafusos " + c.id + " nas mesas") + (par.alma !== null ? " + chapa simples na alma" : "");
    return fechar(res, c);
  }
  /* VIGA SOLDADA DIRETO: a ponta encosta no apoio (abertura da raiz) e as mesas levam MATA-JUNTAS (as soldas de
   * penetração total vão no desenho de fabricação). par: { folga (m, abertura da raiz, partida 6 mm), ajustar } */
  function soldadaDireta(viga, apoio, par) {
    par = par || {};
    var mb = M().membro(viga), ma = M().membro(apoio); if (!mb || !ma) return erro("Selecione a VIGA e o PILAR — perfis de aço.");
    var p2 = {}; Object.keys(par).forEach(function (k) { p2[k] = par[k]; }); if (p2.folga == null) p2.folga = 0.006;
    var c = comuns(par), res = novoRes("soldadaDireta", par, [mb, ma]), F = faceDoApoio(mb, ma, p2, res, viga);
    if (!F) return erro("O apoio não tem face plana voltada para a viga.");
    var s = F.mb.s, tf = num(F.mb.perfil.tf, 0.01), Lb = s.larg + 0.05, bt = 0.025, tb = 0.008;
    [[s.alt / 2 - tf, "Mata-junta (mesa superior)"], [s.alt / 2, "Mata-junta (mesa inferior)"]].forEach(function (q, k) {
      var ey = V().cross(F.dn, F.Y), base = k === 0 ? V().add(F.Pf, V().mul(F.up, q[0])) : V().add(F.Pf, V().mul(F.dn, q[0]));
      var O = V().sub(base, V().mul(ey, Lb / 2));
      var ch = M().chapa({ origem: O, ex: F.Y, ey: ey, t: tb, ret: { L: bt, B: Lb }, papel: q[1], aco: "ASTM A36", lig: res.lig, soldadaEm: apoio.id, solda: solda(5, "ambos", Lb, true) });
      if (!ch.erro) res.pecas.push(ch);
    });
    res.resumo = "Viga soldada no apoio: mesas em penetração total com mata-juntas " + Math.round(bt * 1000) + " × " + Math.round(tb * 1000) + " mm, alma em filete (abertura da raiz " + r1(F.folga * 1000) + " mm)";
    return fechar(res, c);
  }
  /* CHAPA DE REFORÇO DA ALMA do pilar (painel do nó): entre as mesas, de um lado da alma, na altura x (m, do início).
   * par: { t (m), x (m), altura (m, ao longo do pilar), lado: "+"|"-" } */
  function reforcoAlma(pilar, par) {
    par = par || {};
    var mb = M().membro(pilar); if (!mb || mb.perfil.forma !== "I") return erro("Selecione um pilar de perfil I.");
    var res = novoRes("reforcoAlma", par, [mb]), p = mb.perfil, tw = num(p.tw, 0.008), tf = num(p.tf, 0.012), r = num(p.r, 0);
    var t = num(par.t, 0.008), H = num(par.altura, 0.5), x = mb.xOff + Math.max(H / 2, Math.min(mb.L - H / 2, num(par.x, mb.L / 2))), w = mb.s.alt - 2 * (tf + r) - 0.01;
    if (!(w > 0.03)) return erro("O pilar não tem altura de alma livre para a chapa de reforço.");
    var mais = par.lado !== "-", ex = mais ? mb.X : mb.B, ey = mais ? mb.B : mb.X;
    var O = M().membroPonto(mb, x - H / 2, (mais ? 1 : -1) * tw / 2, -w / 2);
    var ch = M().chapa({ origem: O, ex: ex, ey: ey, t: t, ret: mais ? { L: H, B: w } : { L: w, B: H }, papel: "Chapa de reforço da alma", aco: par.aco || "ASTM A572 Gr.50", lig: res.lig, soldadaEm: pilar.id,
      solda: solda(pernaMin(t, tw), "contorno", 2 * (H + w), false) });
    if (ch.erro) return erro(ch.erro);
    res.pecas.push(ch);
    res.resumo = "Chapa de reforço da alma " + Math.round(w * 1000) + " × " + Math.round(H * 1000) + " × " + r1(t * 1000) + " mm soldada entre as mesas do pilar";
    return fechar(res, {});
  }
  /* MÍSULA: trecho mais alto na ponta da viga (mesa inclinada + alma triangular) e a chapa de extremidade na altura
   * d + hm, estendida em cima e embaixo; 4 linhas de 2 parafusos (fora e dentro de cada mesa — a da mísula embaixo).
   * par: { hm (m), Lm (m), t (m, chapa), parafuso, classe, ext (m), gage (m), largura (m), tMesa, tAlma (m), ajustar } */
  function misula(viga, apoio, par) {
    par = par || {};
    var mb = M().membro(viga), ma = M().membro(apoio); if (!mb || !ma) return erro("Selecione a VIGA e o PILAR — perfis de aço.");
    if (mb.perfil.forma !== "I") return erro("Mísula: viga de perfil I.");
    var c = comuns(par), t = num(par.t, 0.019), res = novoRes("misula", par, [mb, ma]);
    var p2 = {}; Object.keys(par).forEach(function (k) { p2[k] = par[k]; }); p2.folga = t;
    var F = faceDoApoio(mb, ma, p2, res, viga); if (!F) return erro("O apoio não tem face plana voltada para a viga.");
    var s = F.mb.s, tf = num(F.mb.perfil.tf, 0.01), tw = num(F.mb.perfil.tw, 0.006), hm = num(par.hm, Math.ceil(s.alt * 50) / 100), Lm = num(par.Lm, 2 * hm);
    var ext = num(par.ext, Math.max(2 * c.eP, 0.05)), W = num(par.largura, s.larg), gage = num(par.gage, cima5(Math.max(3 * c.db, 0.6 * s.larg * 1000)) / 1000);
    var tM = num(par.tMesa, tf), tW = num(par.tAlma, Math.max(tw, 0.008)), H = s.alt + hm + 2 * ext;
    var wd = V().cross(F.up, F.Y), O = V().add(V().sub(F.Pf, V().mul(wd, W / 2)), V().mul(F.dn, s.alt / 2 + hm + ext));
    var pfi = Math.max(0.035, c.db / 1000 + 0.008), zs = [s.alt / 2 + ext / 2, s.alt / 2 - tf - pfi, -(s.alt / 2 + hm) + tM + pfi, -(s.alt / 2 + hm) - ext / 2];
    var bolts = [], uvs = [];
    zs.forEach(function (z) { [-gage / 2, gage / 2].forEach(function (a) {
      var P = V().add(V().add(V().add(F.Pf, V().mul(F.up, z)), V().mul(wd, a)), V().mul(F.Y, t));
      bolts.push({ P: P, D: F.d, aperto: t + F.fc.t }); uvs.push(uvDe(O, wd, F.up, P));
    }); });
    var ch = M().chapa({ origem: O, ex: wd, ey: F.up, t: t, ret: { L: W, B: H }, papel: "Chapa de extremidade", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: viga.id,
      solda: solda(pernaMin(t, tf), "contorno", 2 * (s.larg + s.alt + hm), false), furos: uvs.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
    if (ch.erro) return erro(ch.erro);
    /* chapa de extremidade: a espessura vai da face do pilar para a viga (wd × up = Y) */
    if (V().dot(V().cross(wd, F.up), F.Y) < 0) res.avisos.push("Mísula: conferir o lado da chapa de extremidade");
    res.pecas.push(ch);
    /* mesa inclinada: do pé da chapa (d/2 + hm abaixo do eixo) até a mesa de baixo da viga a Lm da face */
    var A1 = V().add(V().add(F.Pf, V().mul(F.Y, t)), V().mul(F.dn, s.alt / 2 + hm)), A2 = V().add(V().add(F.Pf, V().mul(F.Y, t + Lm)), V().mul(F.dn, s.alt / 2));
    var u = V().unit(V().sub(A2, A1)), Lh = V().len(V().sub(A2, A1)), ex = u, ey = wd, dx = Lh, dy = s.larg;
    if (V().dot(V().cross(ex, ey), F.dn) < 0) { ex = wd; ey = u; dx = s.larg; dy = Lh; }
    var mf = M().chapa({ origem: V().sub(A1, V().mul(wd, s.larg / 2)), ex: ex, ey: ey, t: tM, ret: { L: dx, B: dy }, papel: "Mísula (mesa)", aco: par.aco || "ASTM A572 Gr.50", lig: res.lig, soldadaEm: viga.id,
      solda: solda(pernaMin(tM, tf), "ambos", Lh, false) });
    if (!mf.erro) res.pecas.push(mf);
    /* alma triangular, no plano da alma da viga */
    var nW = V().cross(F.Y, F.dn), Ow = V().sub(V().add(F.Pf, V().mul(F.dn, s.alt / 2)), V().mul(nW, tW / 2));
    var mw = M().chapa({ origem: Ow, ex: F.Y, ey: F.dn, t: tW, contorno: [[t, 0], [t + Lm, 0], [t, hm]], papel: "Mísula (alma)", aco: par.aco || "ASTM A572 Gr.50", lig: res.lig, soldadaEm: viga.id,
      solda: solda(pernaMin(tW, tw), "ambos", Lm + hm, false) });
    if (!mw.erro) res.pecas.push(mw);
    furosNosMembros(bolts, [ma], c, res);
    res.parafusos = boltCaixas(bolts, c, res.lig);
    res.resumo = "Mísula " + Math.round(hm * 1000) + " × " + Math.round(Lm * 1000) + " mm e chapa de extremidade " + Math.round(W * 1000) + " × " + Math.round(H * 1000) + " × " + r1(t * 1000) + " mm, " + bolts.length + " parafusos " + c.id;
    return fechar(res, c);
  }

  /* CONSOLO: perfil curto soldado na face do pilar, em balanço até passar 150 mm do eixo da viga que senta nele (o topo do
   * consolo na mesa de baixo da viga). par: { perfil (nome do catálogo, partida W250X32.7), alem (m, 0,15) } */
  function consolo(pilar, viga, par) {
    par = par || {};
    var mp = M().membro(pilar), mv = M().membro(viga); if (!mp || !mv) return erro("Selecione o PILAR e a VIGA que senta no consolo — perfis de aço.");
    var cat = par.perfil || "W250X32.7", Lp = Aco() ? Aco().paraPerfil(cat) : null; if (!Lp) return erro("Perfil do consolo não encontrado: " + cat + ".");
    var res = novoRes("consolo", par, [mp]), t = V().dot(V().sub(mp.Pref, mv.Pref), mv.X), Pn = V().add(mv.Pref, V().mul(mv.X, t));
    var hz = V().sub(Pn, mp.Pref); hz = V().sub(hz, V().mul(mp.X, V().dot(hz, mp.X))); if (V().len(hz) < 1e-6) return erro("A viga passa pelo eixo do pilar: não é consolo.");
    var d = V().unit(hz), eB = Math.abs(V().dot(d, mp.B)), eA = Math.abs(V().dot(d, mp.A)), eixo = eB >= eA ? "b" : "a", ax = eixo === "b" ? mp.B : mp.A, sg = V().dot(ax, d) > 0 ? 1 : -1;
    var fc = null; M().faces(mp.perfil).filter(function (f) { return f.n === eixo; }).forEach(function (f) { if (!fc || sg * f.meio > sg * fc.meio) fc = f; });
    if (!fc) return erro("O pilar não tem face plana voltada para a viga.");
    var faceD = V().dot(ax, d) * (fc.meio + sg * fc.t / 2) * sg, up = [0, 1, 0];
    var baixoViga = Pn[1] - Math.abs(V().dot(mv.B, up)) * mv.s.alt / 2, hC = Lp.d;
    var dist = V().len(hz), L = dist - Math.abs(fc.meio + sg * fc.t / 2) + num(par.alem, 0.15);
    if (!(L > 0.1)) return erro("A viga está encostada no pilar: use a ligação viga × pilar.");
    var base = V().add(V().add(mp.Pref, V().mul(mp.X, V().dot(V().sub(Pn, mp.Pref), mp.X))), V().mul(d, Math.abs(fc.meio + sg * fc.t / 2)));
    var O = [base[0], baixoViga - hC / 2, base[2]];
    var cx = M().perfil({ origem: O, ex: d, ey: up, perfil: Lp, L: L, papel: "Consolo", aco: par.aco || "ASTM A572 Gr.50", lig: res.lig, soldadaEm: pilar.id });
    if (cx.erro) return erro(cx.erro);
    res.pecas.push(cx);
    res.resumo = "Consolo " + cat + " × " + Math.round(L * 1000) + " mm soldado no pilar (topo na mesa de baixo da viga, a " + Math.round(dist * 1000) + " mm do eixo do pilar)";
    res.avisos.push("Consolo: os enrijecedores do pilar na altura das mesas do consolo, se o cálculo pedir, vão pelo comando Enrijecedor.");
    return fechar(res, {});
  }

  /* M2 (1.2.145) CHAPA DE CABEÇA: viga CONTÍNUA sobre o pilar. O topo do pilar desce/sobe até a chapa (que encosta na mesa de baixo
   * da viga), 4 parafusos na mesa de baixo e os pares de enrijecedores de apoio na viga sobre as mesas do pilar (mesma ligação).
   * par: { t (m), B (m, através da viga), L (m, ao longo da viga), parafuso, gx (m), xb (m, do eixo do pilar aos parafusos ao longo
   *        da viga), enrij: { t (m), xs: [m, …] (do eixo do pilar) } | null, aco, ajustar } — ordem das peças: [viga, pilar] */
  function chapaCabeca(viga, pilar, par) {
    par = par || {};
    var mv = M().membro(viga), mp = M().membro(pilar); if (!mv || !mp) return erro("Selecione a VIGA contínua e o PILAR que acaba sob ela — perfis de aço.");
    if (Math.abs(V().dot(mp.X, [0, 1, 0])) < 0.9) return erro("Chapa de cabeça: o pilar tem de ser vertical.");
    var c = comuns(par), res = novoRes("chapaCabeca", par, [mv, mp]), t = num(par.t, 0.016), UPv = [0, 1, 0];
    var ps = pontas(mp), cima = ps[0].P[1] >= ps[1].P[1] ? ps[0] : ps[1], Pt = cima.P;
    var up = V().dot(mv.B, UPv) >= 0 ? mv.B : V().mul(mv.B, -1), dn = V().mul(up, -1);
    var tB = V().dot(V().sub(Pt, mv.Pref), mv.X), Pax = V().add(mv.Pref, V().mul(mv.X, tB));
    if (tB < mv.xOff + 0.05 || tB > mv.xOff + mv.L - 0.05) return erro("O topo do pilar não fica sob a viga (a viga tem de passar sobre o pilar).");
    var Pbase = V().add(Pax, V().mul(dn, mv.s.alt / 2)), Pc = V().add(Pbase, V().mul(dn, t));
    var lateral = V().sub(Pt, Pax); lateral = V().sub(lateral, V().mul(mv.X, V().dot(lateral, mv.X))); lateral = V().sub(lateral, V().mul(UPv, V().dot(lateral, UPv)));
    if (V().len(lateral) > 0.02) res.avisos.push("O eixo do pilar está a " + Math.round(V().len(lateral) * 1000) + " mm do plano da alma da viga — a chapa fica centrada na viga");
    /* o topo do pilar encosta na chapa (ponta faceada) */
    var delta = V().dot(V().sub(Pc, Pt), cima.sai);
    if (par.ajustar !== false && Math.abs(delta) > 0.0005) {
      var aj = ajustarPonta(mp, cima.qual, delta);
      if (aj) { aplicarAjuste(res, mp, aj); res.avisos.push("Pilar " + pilar.id + ": o topo " + (delta > 0 ? "sobe " : "desce ") + r1(Math.abs(delta) * 1000) + " mm para encostar na chapa de cabeça"); }
      else res.avisos.push("Ajuste o topo do pilar " + pilar.id + " em " + r1(delta * 1000) + " mm para encostar na chapa de cabeça (pilar que não é do modelador)");
    }
    var Lp = num(par.L, 0.3), Bp = num(par.B, Math.max(mv.s.larg, 0.15)), gx = num(par.gx, 0.09), xb = num(par.xb, Lp / 2 - 0.04);
    var ex = mv.X, ey = V().unit(V().cross(up, ex)), O = V().sub(V().sub(Pc, V().mul(ex, Lp / 2)), V().mul(ey, Bp / 2)), tf = num(mv.perfil.tf, 0.01);
    var bolts = [], uvs = [];
    [-xb, xb].forEach(function (x) { [-gx / 2, gx / 2].forEach(function (y) {
      var P = V().add(V().add(Pc, V().mul(ex, x)), V().mul(ey, y)); bolts.push({ P: P, D: up, aperto: t + tf }); uvs.push([Lp / 2 + x, Bp / 2 + y]);
    }); });
    var ch = M().chapa({ origem: O, ex: ex, ey: ey, t: t, ret: { L: Lp, B: Bp }, papel: "Chapa de cabeça", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: pilar.id,
      solda: solda(pernaMin(t, num(mp.perfil.tf, num(mp.perfil.t, t))), "contorno", 2 * (mp.s.alt + mp.s.larg), false), furos: uvs.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
    if (ch.erro) return erro(ch.erro);
    res.pecas.push(ch);
    furosNosMembros(bolts, [mv], c, res);
    res.parafusos = boltCaixas(bolts, c, res.lig);
    /* os pares de enrijecedores de apoio na viga, SOBRE AS MESAS DO PILAR (par.enrij.xs, m, do eixo do pilar ao longo da viga — o
       cálculo dá ±(d − tf)/2); sem xs (chamada antiga): um par sobre o eixo do pilar */
    if (par.enrij !== null && mv.perfil.forma === "I") {
      var xsE = par.enrij && par.enrij.xs && par.enrij.xs.length ? par.enrij.xs : [0];
      xsE.forEach(function (dx) {
        var re = enrijecedor(viga, { x: tB - mv.xOff + num(dx, 0), t: num(par.enrij && par.enrij.t, 0.0095), lig: res.lig, aco: par.aco });
        if (re.ok) re.pecas.forEach(function (q) { q.metal.papel = "Enrijecedor de apoio"; res.pecas.push(q); }); else res.avisos.push("Enrijecedores de apoio: " + re.motivo);
      });
    }
    res.resumo = "Chapa de cabeça " + Math.round(Lp * 1000) + " × " + Math.round(Bp * 1000) + " × " + r1(t * 1000) + " mm no topo do pilar, " + bolts.length + " parafusos " + c.id + " na mesa de baixo da viga" + (par.enrij !== null ? (par.enrij && par.enrij.xs && par.enrij.xs.length > 1 ? " e " + par.enrij.xs.length + " pares de enrijecedores de apoio sobre as mesas do pilar" : " e par de enrijecedores de apoio") : "");
    return fechar(res, c);
  }

  /* PROLONGAR a ponta de cima de um pilar de aço (a chapa estendida pede): a op do lote e a caixa depois */
  function prolongar(pilar, delta) {
    var mb = M().membro(pilar); if (!mb) return null;
    var ps = pontas(mb), cima = ps[0].P[1] >= ps[1].P[1] ? ps[0] : ps[1];
    return ajustarPonta(mb, cima.qual, num(delta, 0));
  }

  /* =============================================================== OPS
   * o LOTE: ajustes de barra, criar chapas e parafusos, furos nos membros */
  function ops(r, novoId) {
    if (!r || !r.ok || typeof novoId !== "function") return null;
    var lista = [], lig = r.lig;
    r.ajustes.forEach(function (a) { lista.push(a); });
    r.pecas.concat(r.parafusos).forEach(function (cx) {
      var k = clone(cx); k.metal.lig = lig;
      lista.push({ op: "criar", id: String(novoId()), caixa: k });
    });
    Object.keys(r.furos).forEach(function (id) { lista.push({ op: "metalFuros", id: id, lig: lig, furos: r.furos[id] }); });
    return { op: "lote", id: String(novoId()), origem: "metal-lig", ops: lista };
  }

  var MACROS = {
    placaBase: { rotulo: "Placa de base", pede: ["pilar"], fn: function (s, p) { return placaBase(s[0], p); } },
    chapaExtremidade: { rotulo: "Chapa de extremidade", pede: ["viga", "apoio"], fn: function (s, p) { return chapaExtremidade(s[0], s[1], p); } },
    cantoneiraDupla: { rotulo: "Cantoneira dupla", pede: ["viga", "pilar"], fn: function (s, p) { return cantoneiraDupla(s[0], s[1], p); } },
    emendaCobrejunta: { rotulo: "Emenda por cobrejunta", pede: ["viga", "viga"], fn: function (s, p) { return emendaCobrejunta(s[0], s[1], p); } },
    clipTerca: { rotulo: "Clip de terça", pede: ["terça", "viga"], fn: function (s, p) { return clipTerca(s[0], s[1], p); } },
    contraventamento: { rotulo: "Contraventamento com gusset", pede: ["diagonal", "apoio"], fn: function (s, p) { return contraventamento(s[0], s[1], p); } },
    barraRedonda: { rotulo: "Contraventamento em barra redonda", pede: ["barra redonda", "apoio"], fn: function (s, p) { return barraRedonda(s[0], s[1], p); } },
    noTrelica: { rotulo: "Nó de treliça", pede: ["barras (2 ou mais)"], fn: function (s, p) { return noTrelica(s, p); } },
    enrijecedor: { rotulo: "Enrijecedor", pede: ["pilar ou viga (I/U)"], fn: function (s, p) { return enrijecedor(s[0], p); } },
    chapaSimples: { rotulo: "Chapa simples", pede: ["viga", "apoio"], fn: function (s, p) { return chapaSimples(s[0], s[1], p); } },
    assento: { rotulo: "Assento", pede: ["viga", "apoio"], fn: function (s, p) { return assento(s[0], s[1], p); } },
    talasMesa: { rotulo: "Talas de mesa", pede: ["viga", "pilar"], fn: function (s, p) { return talasMesa(s[0], s[1], p); } },
    soldadaDireta: { rotulo: "Viga soldada no pilar", pede: ["viga", "pilar"], fn: function (s, p) { return soldadaDireta(s[0], s[1], p); } },
    reforcoAlma: { rotulo: "Chapa de reforço da alma", pede: ["pilar"], fn: function (s, p) { return reforcoAlma(s[0], p); } },
    misula: { rotulo: "Mísula", pede: ["viga", "pilar"], fn: function (s, p) { return misula(s[0], s[1], p); } },
    consolo: { rotulo: "Consolo", pede: ["pilar", "viga"], fn: function (s, p) { return consolo(s[0], s[1], p); } },
    chapaCabeca: { rotulo: "Chapa de cabeça (viga contínua sobre o pilar)", pede: ["viga", "pilar"], fn: function (s, p) { return chapaCabeca(s[0], s[1], p); } }
  };

  var BimMetalLig = {
    MACROS: MACROS,
    placaBase: placaBase, chapaExtremidade: chapaExtremidade, cantoneiraDupla: cantoneiraDupla, emendaCobrejunta: emendaCobrejunta,
    clipTerca: clipTerca, contraventamento: contraventamento, noTrelica: noTrelica, enrijecedor: enrijecedor, chapaSimples: chapaSimples, assento: assento, talasMesa: talasMesa, barraRedonda: barraRedonda, soldadaDireta: soldadaDireta, reforcoAlma: reforcoAlma, prolongar: prolongar, misula: misula, consolo: consolo,
    aplicar: function (tipo, caixas, par) { var m = MACROS[tipo]; return m ? m.fn(caixas, par || {}) : erro("Ligação desconhecida: " + tipo + "."); },
    ops: ops, conferirChapa: conferirChapa, conferirMembro: conferirMembro, casca: casca
  };
  global.BimMetalLig = BimMetalLig;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalLig;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
