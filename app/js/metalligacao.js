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
    var n6 = Math.round(num(par.nChumb, 4)) === 6;
    /* a placa EMBAIXO do pilar: u na largura (A), v na altura (B), espessura para BAIXO (A × B = −X) */
    var P0 = mb.P0, O = V().add(V().add(P0, V().mul(mb.A, -Bp / 2)), V().mul(mb.B, -Np / 2));
    var pts = [[e, e], [Bp - e, e], [Bp - e, Np - e], [e, Np - e]];
    if (n6) pts.push([e, Np / 2], [Bp - e, Np / 2]);
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
    var vigaVsViga = !ehPilar && perto;
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
    var W = num(par.largura, Math.max(s.larg, cima5((gage + 2 * c.eP) * 1000) / 1000)), ext = num(par.ext, 0), H = (s.alt + 2 * ext) / Math.cos(th);
    var ex, ey; if (V().dot(V().cross(mb.A, Bl), nrm) > 0) { ex = mb.A; ey = Bl; } else { ex = Bl; ey = mb.A; }
    var dimX = ex === mb.A ? W : H, dimY = ex === mb.A ? H : W;
    var O = V().sub(V().sub(E, V().mul(ex, dimX / 2)), V().mul(ey, dimY / 2));
    /* parafusos: 2 colunas no gage, linhas entre as mesas */
    var pf = c.pf, tf = num(p.tf, 0), d = s.alt;
    var c1 = tf + Math.max(0.035, pf.arr.d2 / 2000 + 0.008), zona = d - 2 * c1;
    var nl = Math.round(num(par.linhas, 0));
    if (!(nl >= 1)) { nl = zona > 0 ? Math.max(2, Math.min(8, Math.floor(zona / c.passo + 1e-9) + 1)) : 1; }
    var bs = [];
    if (nl === 1 || zona <= 0) bs.push(0); else for (var i = 0; i < nl; i++) bs.push(zona / 2 - i * zona / (nl - 1));
    if (nl > 1 && zona / (nl - 1) < 2.7 * c.db / 1000) res.avisos.push("Linhas de parafusos a " + r1(zona / (nl - 1) * 1000) + " mm — menos que 2,7 db; reduza o número de linhas");
    if (ext >= 2 * c.eP) { bs.unshift(d / 2 + ext - c.eP); bs.push(-(d / 2 + ext - c.eP)); }
    var bolts = [], uvs = [];
    bs.forEach(function (b) {
      [-gage / 2, gage / 2].forEach(function (a) {
        var vv = b / Math.cos(th), Pp = V().add(V().add(E, V().mul(mb.A, a)), V().mul(Bl, vv));   /* na face da ponta (lado da viga) */
        bolts.push({ P: Pp, D: nrm, aperto: aperto });
        uvs.push(uvDe(O, ex, ey, Pp));
      });
    });
    var pernaA = pernaMin(t, Math.min(tf || t, num(p.tw, t)));
    var ch = M().chapa({ origem: O, ex: ex, ey: ey, t: t, ret: { L: dimX, B: dimY }, papel: vigaVsViga ? "Chapa de topo" : "Chapa de extremidade", aco: par.aco || "ASTM A36", lig: res.lig, soldadaEm: viga.id,
      solda: solda(pernaA, "contorno", 2 * (s.larg + s.alt), false), furos: uvs.map(function (q) { return { u: q[0], v: q[1], db: c.db, tipo: c.furo }; }) });
    if (ch.erro) return erro(ch.erro);
    res.pecas.push(ch);
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
    [1, -1].forEach(function (sig) {
      var ez = V().mul(mb.A, sig), ey = V().mul(d, -1), ex = V().cross(ey, ez);   /* ez = ex × ey */
      var canto = V().add(Pf, V().mul(mb.A, sig * tw / 2));
      var centro = V().add(V().add(canto, V().mul(ez, B2 / 2)), V().mul(ey, A2 / 2));
      var org = V().sub(centro, V().mul(ex, La / 2));
      var cx = M().perfil({ origem: org, ex: ex, ey: ey, perfil: Lp, L: La, papel: "Cantoneira de ligação", aco: par.aco || "ASTM A36", lig: res.lig });
      if (cx.erro) return;
      pecas.push(cx);
      bs.forEach(function (b, k) {
        var Pm = V().add(Pf, V().mul(mb.B, b));
        if (sig === 1) boltsAlma.push({ P: V().add(V().add(Pm, V().mul(d, -g)), V().mul(mb.A, tw / 2 + ta)), D: V().mul(mb.A, -1), aperto: 2 * ta + tw });
        boltsPilar.push({ P: V().add(V().add(Pm, V().mul(mb.A, sig * (tw / 2 + g))), V().mul(d, -ta)), D: d, aperto: ta + fc.t });
      });
    });
    if (pecas.length < 2) return erro("Não deu para montar as cantoneiras.");
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
    res.resumo = "Cantoneira dupla " + cat + " × " + Math.round(La * 1000) + " mm, " + boltsAlma.length + " parafusos " + c.id + " na alma e " + boltsPilar.length + " no pilar (folga " + r1(folga * 1000) + " mm)";
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
    var tA = num(par.tAlma, 0.008), tM = num(par.tMesa, 0.0125), nc = Math.max(1, Math.round(num(par.colunas, 2)));
    var x1 = gap / 2 + c.eS, comp = 2 * (x1 + (nc - 1) * c.passo + c.eP);
    var Hw = baixo5((d - 2 * (tf + r) - 0.01) * 1000) / 1000;
    var nr = Math.round(num(par.linhasAlma, 0)); if (!(nr >= 1)) nr = Math.max(1, Math.min(6, Math.floor((Hw - 2 * c.eP) / c.passo + 1e-9) + 1));
    var bs = []; for (var i = 0; i < nr; i++) bs.push((nr - 1) / 2 * c.passo - i * c.passo);
    var gf = num(par.gageMesa, cima5(Math.max(3 * c.db, Math.min(bf * 1000 - 2 * c.eP * 1000, 0.6 * bf * 1000))) / 1000);
    if (gf / 2 - tw / 2 - r < c.pf.arr.d2 / 2000) res.avisos.push("Gage da mesa " + Math.round(gf * 1000) + " mm: a arruela encosta na concordância alma-mesa");
    var xs = []; for (var k = 0; k < nc; k++) { xs.push(-(x1 + k * c.passo)); xs.push(x1 + k * c.passo); }
    var A = ma.A, B = ma.B, aW = p.forma === "U" ? -bf / 2 + tw / 2 : 0;
    var bolts = [], placas = [];
    /* alma: duas talas (lado +A e −A) */
    var O1 = V().add(V().add(V().add(J, V().mul(dir, -comp / 2)), V().mul(B, -Hw / 2)), V().mul(A, aW + tw / 2));
    var O2 = V().add(V().add(V().add(J, V().mul(dir, -comp / 2)), V().mul(B, -Hw / 2)), V().mul(A, aW - tw / 2));
    var nA = V().cross(dir, B);   /* deveria ser ±A */
    var ladoP = V().dot(nA, A) > 0;
    var pl1 = { O: O1, ex: ladoP ? dir : B, ey: ladoP ? B : dir, dx: ladoP ? comp : Hw, dy: ladoP ? Hw : comp };
    var pl2 = { O: V().add(O2, V().mul(A, 0)), ex: ladoP ? B : dir, ey: ladoP ? dir : B, dx: ladoP ? Hw : comp, dy: ladoP ? comp : Hw };
    xs.forEach(function (x) { bs.forEach(function (b) { bolts.push({ P: V().add(V().add(V().add(J, V().mul(dir, x)), V().mul(B, b)), V().mul(A, aW + tw / 2 + tA)), D: V().mul(A, -1), aperto: 2 * tA + tw, grupo: "alma" }); }); });
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
    noTrelica: { rotulo: "Nó de treliça", pede: ["barras (2 ou mais)"], fn: function (s, p) { return noTrelica(s, p); } },
    enrijecedor: { rotulo: "Enrijecedor", pede: ["pilar ou viga (I/U)"], fn: function (s, p) { return enrijecedor(s[0], p); } }
  };

  var BimMetalLig = {
    MACROS: MACROS,
    placaBase: placaBase, chapaExtremidade: chapaExtremidade, cantoneiraDupla: cantoneiraDupla, emendaCobrejunta: emendaCobrejunta,
    clipTerca: clipTerca, contraventamento: contraventamento, noTrelica: noTrelica, enrijecedor: enrijecedor,
    aplicar: function (tipo, caixas, par) { var m = MACROS[tipo]; return m ? m.fn(caixas, par || {}) : erro("Ligação desconhecida: " + tipo + "."); },
    ops: ops, conferirChapa: conferirChapa, conferirMembro: conferirMembro, casca: casca
  };
  global.BimMetalLig = BimMetalLig;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalLig;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
