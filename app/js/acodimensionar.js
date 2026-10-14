/* =====================================================================
 * acodimensionar.js — O CÁLCULO DO GALPÃO DE PONTA A PONTA (motor PURO,
 * ES5, sem DOM, Node-testável). Junta os motores:
 *   js/acomodelo.js     modelo, decisões, cargas
 *   js/acocargas.js     combinações (γ, ψ, forças nocionais)
 *   js/acoanalise.js    análise de 2ª ordem
 *   js/acodim8800.js    barras laminadas/soldadas/tubos/barras
 * e faz o que o engenheiro faria à mão, na ordem:
 *   1. modelo + combinações; se faltar estabilidade, devolve o problema com
 *      as soluções (e, se pedido, calcula com a solução sugerida);
 *   2. análise de 1ª e 2ª ordem das combinações últimas → CLASSIFICA a
 *      deslocabilidade (Δ2/Δ1 — NBR 8800, 4.9.4); média → refaz com a
 *      rigidez reduzida a 80 % (4.9.7.1.2); grande → aviso;
 *   3. MÃOS-FRANCESAS automáticas onde a mesa de baixo da viga (ou a de
 *      dentro do pilar) fica comprimida (envoltória) — decisão registrada;
 *   4. verifica cada barra (todas as combinações, todas as estações) e o
 *      contraventamento (barra redonda só de tração);
 *   5. ESTADO-LIMITE DE SERVIÇO: deslocamento do topo dos pilares e flecha
 *      das vigas nas combinações raras (NBR 8800, Anexo C);
 *   6. reações na fundação (por caso, característicos, e envoltória ELU);
 *   7. OTIMIZA: troca o perfil do grupo pelo mais leve da mesma família que
 *      passa (e refaz a análise, porque rigidez e peso mudam), até fechar.
 * Saída: tudo o que a tela, o memorial e as pranchas precisam.
 * Teste: node tools/test-aco-dimensionar.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Mod() { return dep("AcoModelo", "./acomodelo.js"); }
  function Car() { return dep("AcoCargas", "./acocargas.js"); }
  function Ana() { return dep("AcoAnalise", "./acoanalise.js"); }
  function D8800() { return dep("AcoDim8800", "./acodim8800.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Vento() { return dep("AcoVento", "./acovento.js"); }
  function Iso() { return dep("AcoIsopletas", "./acoisopletas.js"); }
  function Lig() { return dep("AcoLigCalc", "./acoligcalc.js"); }
  function Sec() { return dep("AcoSecundarias", "./acosecundarias.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  /* limites de deslocamento (NBR 8800:2008, Anexo C, Tabela C.1 — conferir na 2024) */
  var LIMITES = {
    viga: { div: 250, nome: "vigas de cobertura — flecha (combinação rara)", ref: "NBR 8800:2008, Tabela C.1" },
    cumeeira: { div: 250, nome: "vigas de cobertura — deslocamento vertical da cumeeira em relação aos beirais (combinação rara; L = vão do pórtico)", ref: "NBR 8800:2008, Tabela C.1" },
    pilarTopo: { div: 300, nome: "galpões em geral: deslocamento horizontal do topo dos pilares em relação à base", ref: "NBR 8800:2008, Tabela C.1" },
    tapamento: { div: 180, nome: "colunas de tapamento / travessas de fechamento (vento)", ref: "NBR 8800:2008, Tabela C.1" }
  };

  /* família de perfis para a otimização: mesmo prefixo de série, ordenados pela massa */
  function familia(nome) {
    var C = Cat(); if (!C || !nome) return [];
    var c = C.obter(nome); if (!c) return [];
    var lista = C.listar(c.serie).map(function (n) { return C.obter(n); }).filter(function (x) { return x && x.forma === c.forma && x.massa > 0; });
    /* W e HP da Gerdau: só os W para viga/pilar de galpão (HP é pilar de fundação) */
    if (/Gerdau/.test(nome) && /^W/.test(c.nome)) lista = lista.filter(function (x) { return /^W/.test(x.nome); });
    return lista.sort(function (a, b) { return a.massa - b.massa; }).map(function (x) { return x.nome; });
  }

  /* estações de um membro (cadeia de segmentos) numa combinação: x acumulado ao longo do membro */
  function estacoesMembro(res, mem, comb) {
    var o = [], x0 = 0, cb = res.combinacoes[comb];
    if (!cb || !cb.ok) return o;
    mem.segs.forEach(function (sid) {
      var b = cb.barras[sid]; if (!b) return;
      b.estacoes.forEach(function (e, q) { if (q === 0 && o.length) return; o.push({ x: x0 + e.x, N: e.N, Vy: e.Vy, Vz: e.Vz, Mz: e.Mz, My: e.My, T: e.T, comb: comb, u: e.u, flechaY: e.flechaY }); });
      x0 += b.L;
    });
    return o;
  }

  /* ================================================================ VENTO
   * par.vento = { lat, lon, v0 (opcional), endereco, categoria ("I".."V"), grupoS3 (1..5), s1 { tipo, theta, d, z },
   *               classe, estanque, nervuras, todasDirecoes }
   * → AcoVento.calcular (V0 do mapa de isopletas, S1, S2, S3, Cpe por zona, Cpi, casos) → adaptador do AcoModelo.cargas:
   *   { casos: [{ id: "W0a", nome, direcao, cpi, origem }], pressao(id, face, u, v), atrito(id) }.
   * Os dois motores usam a mesma convenção: planta x no vão, z no comprimento; frente em z = 0, esquerda em x = 0;
   * pressão positiva = para dentro da parede / para baixo na cobertura. */
  function vedacaoDe(tipo) {
    var t = String(tipo || "").toLowerCase();
    if (!t || /abert/.test(t)) return null;
    if (/pr[eé].?moldad/.test(t)) return "pré-moldado";
    if (/misto/.test(t)) return "misto";
    if (/bloco|alvenaria|cer[aâ]mic|concreto/.test(t)) return "alvenaria";
    return "telha";
  }
  function ventoDoPar(par) {
    var V = Vento(), M = Mod();
    if (!V) return { ok: false, motivo: "Motor de vento (js/acovento.js) não carregado." };
    var G0 = M.galpao(JSON.parse(JSON.stringify(par)));
    if (!G0 || !G0.par) return { ok: false, motivo: "Geometria inválida para o cálculo do vento." };
    var gp = G0.par.geometria, v = par.vento || {}, avisos = [];
    var aguas = num(gp.aguas, 2), i = num(gp.inclinacaoPct, 10) / 100, b = num(gp.vao, 20), a = num(gp.comprimento, 40), h = num(gp.peDireito, 6);
    var faces = {}, abertas = 0;
    ["frente", "fundo", "esquerda", "direita"].forEach(function (f) {
      var fc = (G0.par.fechamentos || {})[f] || {}, ved = vedacaoDe(fc.tipo);
      var ab = arr(fc.aberturas).map(function (x) {
        var o = { area: num(x.area, num(x.largura, 0) * num(x.altura, 0)), dominante: !!x.dominante };
        if (x.s0 != null) o.s0 = num(x.s0, 0); if (x.s1 != null) o.s1 = num(x.s1, 0);
        return o;
      }).filter(function (x) { return x.area > 0; });
      if (ved) faces[f] = { fechada: true, vedacao: ved, aberturas: ab }; else { faces[f] = { fechada: false }; abertas++; }
    });
    if (!v.categoria) avisos.push("Vento: categoria de rugosidade não informada — adotada a II (terreno aberto, a favor da segurança).");
    var ent = { local: { lat: v.lat, lon: v.lon, v0: v.v0, descricao: v.endereco || v.descricao }, s1: v.s1 || { tipo: "plano" },
                categoria: v.categoria || "II", grupoS3: num(v.grupoS3, 2), classe: v.classe, estanque: v.estanque,
                geometria: { a: a, b: b, h: h, hCumeeira: aguas === 1 ? h + b * i : h + b / 2 * i, inclinacaoGraus: Math.atan(i) * 180 / Math.PI,
                             cobertura: aguas === 1 ? "uma-agua" : "duas-aguas", aberta: abertas === 4, ladoAlto: aguas === 1 ? "direita" : gp.ladoAlto, nervuras: v.nervuras },   /* uma água: o modelo sobe a DIREITA (eixo B) — o vento tem de usar o mesmo lado, senão sai espelhado (a tela achou) */
                faces: faces };
    var R = V.calcular(ent, { isopletas: Iso(), todasDirecoes: !!v.todasDirecoes });
    if (!R || !R.ok) return { ok: false, motivo: (R && R.erros && R.erros.length ? R.erros.join("; ") : "falha no cálculo do vento"), resultado: R };
    var casos = [], mapa = {}, cont = {};
    R.casos.forEach(function (c) {
      var base = "W" + c.direcao; cont[base] = (cont[base] || 0) + 1;
      var id = base + String.fromCharCode(96 + cont[base]);
      mapa[id] = c; casos.push({ id: id, nome: c.nome, direcao: c.direcao, cpi: c.cpi, origem: c.id });
    });
    function dentro(u, a0, a1) { return u >= a0 - 1e-6 && u <= a1 + 1e-6; }
    var adaptado = {
      casos: casos,
      pressao: function (id, face, u, w) {
        var c = mapa[id]; if (!c || !c.pressao) return 0;
        if (face === "cobertura") {
          var Lc = c.pressao.cobertura || [];
          for (var k = 0; k < Lc.length; k++) {
            var z = Lc[k];
            if (dentro(u, z.x0, z.x1) && dentro(w, z.z0, z.z1)) return (z.p0 != null && z.p1 != null && z.x1 > z.x0) ? z.p0 + (z.p1 - z.p0) * (u - z.x0) / (z.x1 - z.x0) : num(z.p, 0);
          }
          return 0;
        }
        var P = c.pressao.paredes && c.pressao.paredes[face]; if (!P) return 0;
        for (var j = 0; j < P.length; j++) if (dentro(u, P[j].s0, P[j].s1)) return num(P[j].p, 0);
        return 0;
      },
      atrito: function (id) { var c = mapa[id]; return c && c.atrito ? c.atrito : null; }
    };
    return { ok: true, adaptado: adaptado, resultado: R, avisos: avisos.concat(arr(R.avisos).map(function (x) { return "Vento: " + x; })) };
  }

  /* ================================================================ LIGAÇÕES (js/acoligcalc.js)
   * Com os esforços de todas as combinações últimas: placa de base dos pilares e das colunas de tapamento
   * (reações), joelho e cumeeira (pontas das vigas), clip de terça (reação das terças = cargas nodais nas
   * linhas de terça, decompostas na normal e na direção da água) e contraventamento (maior tração). */
  function ligacoes(r) {
    var Lg = Lig(), Mt = Mat(); if (!Lg || !r || !r.modelo) return null;
    var G = r.modelo, A = r.analise, par = G.par, avisos = [];
    var elu = r.combinacoes.filter(function (c) { return c.tipo === "ELU"; });
    var acoChapa = (Mt && Mt.aco(Mt.PADRAO.chapa)) || { id: "ASTM A36", fy: 250, fu: 400 };
    var acoBarra = (Mt && Mt.aco(Mt.PADRAO.barra)) || { id: "ASTM A36", fy: 250, fu: 400 };
    var chumb = (Mt && Mt.chumbador("ASTM F1554 Gr.36")) || { id: "ASTM F1554 Gr.36", fy: 250, fu: 400 };
    var pA325 = (Mt && Mt.parafuso("ASTM A325", 20)) || { fub: 825 }, pA307 = (Mt && Mt.parafuso("ASTM A307", 12)) || { fub: 415 };
    var E70 = (Mt && Mt.eletrodo("E70XX")) || { id: "E70XX", fw: 485 };
    var fund = par.fundacao || {}, conc = { fck: num(fund.fck, 25), A2_A1: num(fund.A2_A1, 1) };
    function sec(m) { var q = m.secao.mm; return { d: q.d, bf: q.bf, tw: q.tw, tf: q.tf, r: num(q.r, 0) }; }
    function base(pilares, tipo) {
      var esf = [];
      pilares.forEach(function (m) {
        var nb = m.nos[0];
        elu.forEach(function (c) {
          var cb = A.combinacoes[c.id]; if (!cb || !cb.ok || !cb.reacoes || !cb.reacoes[nb]) return;
          var R = cb.reacoes[nb]; esf.push({ comb: c.id, no: nb, N: -R[1], Vx: R[0], Vz: R[2], M: R[5] });
        });
      });
      if (!esf.length) return null;
      var o = Lg.placaBase({ tipo: tipo, pilar: sec(pilares[0]), aco: acoChapa, chumbador: chumb, concreto: conc, eletrodo: E70, esforcos: esf });
      o.membros = pilares.map(function (m) { return m.id; });
      return o;
    }
    var pilares = G.membros.filter(function (m) { return m.papel === "pilar"; }), taps = G.membros.filter(function (m) { return m.papel === "tapamento"; });
    var o = {};
    o.base = base(pilares, par.geometria.base === "engastada" ? "engastada" : "rotulada");
    if (taps.length) o.baseTapamento = base(taps, "rotulada");
    /* joelho e cumeeira */
    var topos = {}; pilares.forEach(function (m) { topos[m.nos[m.nos.length - 1]] = m; });
    var esfJ = [], esfC = [], pilarJ = null, vigaJ = null;
    G.membros.filter(function (m) { return m.papel === "viga"; }).forEach(function (m) {
      var ini = m.nos[0], fim = m.nos[m.nos.length - 1], jIni = !!topos[ini], jFim = !!topos[fim];
      if ((jIni || jFim) && !pilarJ) { pilarJ = topos[jIni ? ini : fim]; vigaJ = m; }
      elu.forEach(function (c) {
        var est = estacoesMembro(A, m, c.id); if (!est.length) return;
        var e0 = est[0], e1 = est[est.length - 1];
        [[e0, jIni], [e1, jFim]].forEach(function (q) { (q[1] ? esfJ : esfC).push({ comb: c.id, M: q[0].Mz, V: q[0].Vy, N: q[0].N }); });
      });
    });
    var acoP = function (m) { return m && m.aco ? m.aco : { fy: 345 }; };
    if (esfJ.length && vigaJ) o.joelho = Lg.chapaExtremidade({ tipo: "joelho", viga: sec(vigaJ), pilar: sec(pilarJ), aco: acoChapa, acoViga: acoP(vigaJ), acoPilar: acoP(pilarJ), parafuso: { id: "ASTM A325", fub: pA325.fub }, eletrodo: E70, esforcos: esfJ });
    if (esfC.length && vigaJ && num(par.geometria.aguas, 2) === 2) o.cumeeira = Lg.chapaExtremidade({ tipo: "cumeeira", viga: sec(vigaJ), aco: acoChapa, acoViga: acoP(vigaJ), parafuso: { id: "ASTM A325", fub: pA325.fub }, eletrodo: E70, esforcos: esfC });
    /* clip de terça: reação = soma das cargas nodais do nó da terça, combinada, decomposta na normal e na água */
    var porNo = {};
    r.casos.forEach(function (c) { arr(c.cargas).forEach(function (q) { if (q.tipo !== "no" || !q.F) return; var m = porNo[q.no] || (porNo[q.no] = {}), f = m[c.id] || (m[c.id] = [0, 0, 0]); f[0] += q.F[0]; f[1] += q.F[1]; f[2] += q.F[2]; }); });
    var L = G.layout, Rn = 0, Rc = 0, Rp = 0;
    arr(G.linhasTerca).forEach(function (t) {
      var esq = L.aguas === 1 || t.x < L.vao / 2 - 1e-6, sn = Math.sin(L.th), cs = Math.cos(L.th);
      var nrm = esq ? [-sn, cs] : [sn, cs], tan = esq ? [cs, sn] : [-cs, sn];
      arr(t.nos).forEach(function (nid) {
        if (!nid || !porNo[nid]) return;
        elu.forEach(function (c) {
          var F = [0, 0]; Object.keys(c.fatores).forEach(function (cid) { var f = porNo[nid][cid]; if (f) { F[0] += c.fatores[cid] * f[0]; F[1] += c.fatores[cid] * f[1]; } });
          var fn = -(F[0] * nrm[0] + F[1] * nrm[1]), fp = Math.abs(F[0] * tan[0] + F[1] * tan[1]);
          if (fn > Rn) Rn = fn; if (-fn > Rc) Rc = -fn; if (fp > Rp) Rp = fp;
        });
      });
    });
    var terca = r.tercas && r.tercas.secao ? r.tercas.secao : null;
    if (!terca) avisos.push("Clip de terça calculado com alma de 2,0 mm (a terça ainda não dimensionada) — a favor da segurança na pressão de contato.");
    if (Rn > 0 || Rc > 0) o.clip = Lg.clipTerca({ terca: { t: terca ? num(terca.t, 2) : 2.0, fu: terca ? num(terca.fu, 410) : 410 }, reacao: { normal: Rn, cima: Rc, paralela: Rp },
      parafuso: { id: "ASTM A307", fub: pA307.fub }, aco: acoChapa, viga: { tf: vigaJ ? vigaJ.secao.mm.tf : 8 }, eletrodo: E70 });
    /* contraventamento em barra redonda */
    if (r.contravento && r.contravento.N > 0) {
      if (par.contraventamento === "X-cantoneira") avisos.push("Contraventamento em cantoneira: ligação parafusada na chapa gusset — dimensionar no detalhe (BimMetalLig.contraventamento).");
      else {
        /* o menor ângulo entre uma diagonal e a linha longitudinal (eixo z, a das escoras): é o que aperta a porca */
        var nosM = {}; (G.modelo.nos || []).forEach(function (q) { nosM[q.id] = q; });
        var alfaMin = 90;
        (G.modelo.barras || []).forEach(function (b2) {
          if (b2.papel !== "contravento" || !nosM[b2.i] || !nosM[b2.j]) return;
          var dx = nosM[b2.j].x - nosM[b2.i].x, dy = nosM[b2.j].y - nosM[b2.i].y, dz = nosM[b2.j].z - nosM[b2.i].z, Lb = Math.sqrt(dx * dx + dy * dy + dz * dz); if (!(Lb > 0)) return;
          var ang = Math.acos(Math.min(1, Math.abs(dz) / Lb)) * 180 / Math.PI; ang = Math.min(ang, 90 - ang);
          if (ang > 5) alfaMin = Math.min(alfaMin, ang);
        });
        o.contravento = Lg.contravento({ d: num(par.contraventoDiametro, num(G.par.contraventoDiametro, 12.5)), N: r.contravento.N, alfa: alfaMin < 90 ? alfaMin : 0, barra: acoBarra, chapa: acoChapa, eletrodo: E70 });
      }
    }
    /* mãos-francesas: a força vem do momento da barra na região travada (máximo das combinações), a rigidez da distância
       entre as contenções; uma para as vigas (até a terça) e outra para os pilares (até a travessa) — a pior de cada */
    var mm2 = function (v, pad) { v = num(v, pad); return v > 0 && v < 2 ? v * 1000 : v; };
    var trc = r.tercas && r.tercas.secao ? r.tercas.secao : null, tvl = r.travessas && r.travessas.lateral && r.travessas.lateral.secao ? r.travessas.lateral.secao : null;
    ["viga", "pilar"].forEach(function (papel) {
      var pior = null;
      G.membros.filter(function (m) { return m.papel === papel && arr(m.maosFrancesas).length; }).forEach(function (m) {
        var q = m.secao.mm, pos = arr(m.maosFrancesas).map(Number).sort(function (a, b) { return a - b; }), Mr = 0;
        elu.forEach(function (c) { estacoesMembro(A, m, c.id).forEach(function (e) { pos.forEach(function (x) { if (Math.abs(e.x - x) <= Math.max(0.6, m.L / 20)) Mr = Math.max(Mr, Math.abs(e.Mz)); }); }); });
        var marcos = [0].concat(pos, [m.L]), Lbr = Infinity;
        for (var i = 1; i < marcos.length; i++) if (marcos[i] - marcos[i - 1] > 1e-6) Lbr = Math.min(Lbr, marcos[i] - marcos[i - 1]);
        var alt = papel === "viga" ? q.d + 0.3 * mm2(trc && trc.bw, 200) : q.d + mm2(tvl && tvl.bw, 150) / 2;
        var cand = { m: m, Mr: Mr, ho: q.d - q.tf, Lbr: isFinite(Lbr) ? Lbr : m.L, L: alt * Math.SQRT2, tf: q.tf };
        if (!pior || cand.Mr / cand.ho > pior.Mr / pior.ho || (cand.Mr / cand.ho === pior.Mr / pior.ho && cand.Lbr < pior.Lbr)) pior = cand;
      });
      if (!pior || !(pior.Mr > 0)) return;
      var ap = papel === "viga" ? trc : tvl;
      var mf = Lg.maoFrancesa({ Mr: pior.Mr, ho: pior.ho, Lbr: pior.Lbr, L: pior.L, cos: Math.SQRT1_2, aco: acoChapa, parafuso: { id: "ISO 898-1 classe 8.8", fub: 800 },
                                apoio: { t: ap ? num(ap.t, 2) : 2.0, fu: ap ? num(ap.fu, 410) : 410 }, eletrodo: E70, mesa: { tf: pior.tf } });
      if (!mf) return;
      mf.membro = pior.m.id; mf.membros = G.membros.filter(function (m) { return m.papel === papel && arr(m.maosFrancesas).length; }).map(function (m) { return m.id; });
      if (!ap) avisos.push("Mão-francesa das " + (papel === "viga" ? "vigas" : "colunas") + ": alma de apoio de 2,0 mm (a " + (papel === "viga" ? "terça" : "travessa") + " ainda não dimensionada) — a favor da segurança.");
      o[papel === "viga" ? "maoFrancesaViga" : "maoFrancesaPilar"] = mf;
    });
    var nomes = { base: "Placa de base dos pilares", baseTapamento: "Placa de base das colunas de tapamento", joelho: "Joelho (viga × pilar)", cumeeira: "Cumeeira (viga × viga)", clip: "Clip de terça", contravento: "Contraventamento (barra redonda)",
                  maoFrancesaViga: "Mão-francesa das vigas (contenção da mesa de baixo)", maoFrancesaPilar: "Mão-francesa dos pilares (contenção da mesa de dentro)" };
    var lista = Object.keys(nomes).filter(function (k) { return o[k]; }).map(function (k) { return { id: k, nome: nomes[k], resumo: o[k].resumo, razao: o[k].razao, ok: o[k].ok, governante: o[k].governante, decisao: o[k].decisao || null, sugestao: o[k].sugestao || null }; });
    o.lista = lista; o.aprovado = lista.every(function (x) { return x.ok; }); o.falhas = lista.filter(function (x) { return !x.ok; }).length; o.avisos = avisos;
    return o;
  }

  /* ================================================================ CALCULAR */
  function calcular(par, op) {
    op = op || {};
    var t0 = Date.now(), log = [];
    var M = Mod(), C = Car(), A = Ana(), D = D8800();
    if (!M || !C || !A || !D) return { ok: false, motivo: "Motores do cálculo não carregados." };
    /* vento: calculado UMA vez (não depende dos perfis) e passado por fora da cópia JSON do par — a função
       pressao() não sobrevive ao JSON (defeito corrigido em 12/10/2026: o vento sumia dentro do laço) */
    var ventoInfo = null, ventoAd = par && par.ventoAdaptado && typeof par.ventoAdaptado.pressao === "function" ? par.ventoAdaptado : null;
    if (!ventoAd && par && par.vento) {
      ventoInfo = ventoDoPar(par);
      if (!ventoInfo.ok) return { ok: false, motivo: "Vento: " + ventoInfo.motivo, problemas: [{ tipo: "vento", texto: ventoInfo.motivo, solucoes: [] }], vento: ventoInfo.resultado || null };
      ventoAd = ventoInfo.adaptado;
    }
    /* terças e travessas (NBR 14762) — independem dos pórticos: uma vez, antes; a massa da terça entra nas cargas */
    var sec = null, S = Sec();
    if (S && !op.semSecundarias) {
      var G0 = M.galpao(JSON.parse(JSON.stringify(par || {})));
      if (G0 && G0.ok) {
        var cg0 = (par && par.cargas) || {}, sob0 = C.sobrecargaCobertura(num(G0.par.geometria.inclinacaoPct, 10), { empocamentoVerificado: G0.par.cobertura.empocamentoVerificado });
        sec = S.dimensionar({ G: G0, cargas: { telhaPeso: num(cg0.telhaPeso, 0.05), permanenteExtra: num(cg0.permanenteExtra, num(G0.par.cobertura.permanenteExtra, 0.10)), fechamentoPeso: cg0.fechamentoPeso },
                              sobrecarga: num(cg0.sobrecarga, sob0.ok ? sob0.q : 0.25), vento: ventoAd });
      }
    }
    var perfis = JSON.parse(JSON.stringify((par && par.perfis) || {}));
    var preD = (!perfis.pilar || perfis.pilar === "auto" || !perfis.viga || perfis.viga === "auto") ? preDimensionar(par) : {};
    if (!perfis.pilar || perfis.pilar === "auto") perfis.pilar = preD.pilar;
    if (!perfis.viga || perfis.viga === "auto") perfis.viga = preD.viga;
    var enrijecidas = 0;
    var historico = [], iter = 0, maxIter = num(op.maxIteracoes, 8), final = null, melhorOk = null, proibidos = {}, amostras = [];
    while (iter < maxIter) {
      iter++;
      var parI = JSON.parse(JSON.stringify(par || {})); parI.perfis = perfis;
      if (sec && sec.tercas && sec.tercas.ok) { parI.cargas = parI.cargas || {}; parI.cargas.tercaMassa = sec.tercas.massa; }
      if (sec && sec.travessas && sec.travessas.lateral && sec.travessas.lateral.ok) { parI.cargas = parI.cargas || {}; parI.cargas.travessaMassa = sec.travessas.lateral.massa; }
      var r = umaRodada(parI, op, ventoAd);
      historico.push({ iteracao: iter, perfis: JSON.parse(JSON.stringify(perfis)), ok: r.ok, falhas: r.falhas, peso: r.peso });
      final = r;
      if (!r.ok && !op.semOtimizar && enrijecidas < 3 && /instável|mecanismo/.test(String(r.motivo || "")) && /flambagem global/.test(String(r.motivo || ""))) {
        var antes = perfis.pilar + " / " + perfis.viga;
        if (enrijecer(perfis, r)) { enrijecidas++; log.push("Iteração " + iter + ": a 2ª ordem instabilizou com " + antes + " — inércia dobrada: " + perfis.pilar + " / " + perfis.viga); continue; }
      }
      if (!r.ok || op.semOtimizar) break;
      /* otimização: o par pilar + viga pela rigidez do pórtico e pela resistência; o tapamento pela resistência e flecha.
         Perfil que, ao DESCER, fez o grupo falhar fica proibido (sem vai e volta). */
      var rz = razoesPorGrupo(r), ant = historico.length > 1 ? historico[historico.length - 2] : null;
      historico[historico.length - 1].razoes = rz;
      var voltou = false;
      if (ant && ant.razoes) ["pilar", "viga", "tapamento"].forEach(function (g) {
        var pa = ant.perfis[g], pn = perfis[g];
        if (pa && pn && pa !== pn && falhaGrupo(rz[g]) && !falhaGrupo(ant.razoes[g]) && massaDe(pn) < massaDe(pa)) { (proibidos[g] = proibidos[g] || {})[pn] = true; perfis[g] = pa; voltou = true; log.push("Iteração " + iter + ": " + g + " " + pn + " não passou — volta a " + pa); }
      });
      if (r.falhas === 0 && (!melhorOk || r.peso < melhorOk.peso)) melhorOk = r;
      if (voltou) continue;   /* as razões desta rodada são do perfil que voltou atrás: a próxima rodada recalcula */
      var dT = 0; arr(r.servico).forEach(function (q) { if (q.tipo === "pilarTopo") dT = Math.max(dT, q.razao); });   /* razão, não valor (ver escolherPerfis) */
      var iPa = infoPerfil(perfis.pilar || (r.modelo.grupos.pilar && r.modelo.grupos.pilar.perfil)), iVa = infoPerfil(perfis.viga || (r.modelo.grupos.viga && r.modelo.grupos.viga.perfil));
      if (iPa && iVa && dT > 0) amostras.push({ Ic: iPa.Ix, Ib: iVa.Ix, d: dT });
      var mudou = false, esc = escolherPerfis(perfis, r, rz, proibidos, amostras, { bfMinPilar: op.bfMinPilar });
      Object.keys(esc).forEach(function (g) {
        var e = esc[g]; if (op.reduzir === false && massaDe(e.para) < massaDe(e.de)) return;
        perfis[g] = e.para; mudou = true; log.push("Iteração " + iter + ": " + g + " " + e.de + " → " + e.para + " (" + e.motivo + ")");
      });
      if (r.contravento && r.contravento.trocar) { perfis.contraventoDiametro = r.contravento.trocar; mudou = true; log.push("Iteração " + iter + ": contraventamento → Ø " + br(r.contravento.trocar, 1) + " mm"); }
      if (!mudou) break;
      if (r.falhas === 0 && historico.length > 1 && historico[historico.length - 2].falhas === 0 && r.peso > historico[historico.length - 2].peso) break;
    }
    /* termina no MAIS LEVE que passou (a última rodada pode ter sido uma tentativa que falhou) */
    if (melhorOk && final && final.ok && (final.falhas > 0 || melhorOk.peso < final.peso) && melhorOk !== final) { log.push("Fica a rodada mais leve que passou (" + br(melhorOk.peso, 0) + " kg)."); final = melhorOk; }
    final.otimizacao = { iteracoes: iter, log: log, historico: historico.map(function (h) { return { iteracao: h.iteracao, perfis: h.perfis, ok: h.ok, falhas: h.falhas, peso: h.peso }; }) };
    /* ENXUGAR o resultado: o deslocamento LOCAL de cada estação (ul, 6 números) e a 1ª ordem de cada combinação
       (desloc1, só da classificação Δ2/Δ1) não são lidos por ninguém fora daqui — no galpão 20 × 40 o resultado tinha
       34 MB e a tela segurava 0,5 GB no 30 × 60 (a tela achou). Fica o deslocamento GLOBAL (u) e a flecha. */
    if (final.analise && final.analise.combinacoes) Object.keys(final.analise.combinacoes).forEach(function (k) {
      var cb = final.analise.combinacoes[k]; if (!cb) return;
      delete cb.desloc1;
      Object.keys(cb.barras || {}).forEach(function (id) { arr(cb.barras[id].estacoes).forEach(function (e) { delete e.ul; }); });
    });
    if (final.ok) {
      if (ventoInfo) { final.vento = ventoInfo.resultado; final.ventoCasos = ventoAd.casos; ventoInfo.avisos.forEach(function (x) { final.avisos.push(x); }); }
      else if (!ventoAd) final.avisos.push("Calculado SEM vento: informe o endereço (ou o V0) para a NBR 6123.");
      /* o deslocamento do topo governa e a base é rotulada: a engastada costuma aliviar muito o aço (a tela compara) */
      if (final.grupos && final.grupos.pilar && final.grupos.pilar.governaELS && (final.modelo.par.geometria.base || "rotulada") !== "engastada")
        final.avisos.push("O deslocamento do topo dos pilares (H/300) governa os pórticos com base rotulada (" + br(final.taxa, 1) + " kg/m²): a base engastada costuma aliviar bastante o aço — compare antes de fechar (a fundação passa a receber momento).");
      if (sec) {
        final.tercas = sec.tercas; final.travessas = sec.travessas; final.pesoSecundarias = sec.pesoTotal; final.pesoTotal = final.peso + sec.pesoTotal;
        sec.decisoes.forEach(function (d) { final.decisoes.push(d); }); sec.avisos.forEach(function (x) { final.avisos.push(x); });
        if (!sec.ok) { final.aprovado = false; final.falhas += 1; }
      }
      var lg = ligacoes(final);
      if (lg && lg.joelho && !lg.joelho.ok && lg.joelho.bfMinPilar && !op._bfRefeito) {
        /* os parafusos do joelho não cabem na mesa do pilar: o pilar mais leve da família com a mesa necessária (e a
           mesma inércia ou mais), e o cálculo refeito com essa restrição — uma vez */
        var bfN = lg.joelho.bfMinPilar, pAt = infoPerfil(final.grupos.pilar.perfil);
        var novoP = familia(final.grupos.pilar.perfil).map(infoPerfil).filter(function (x) { return x && x.bf >= bfN && (!pAt || x.Ix >= pAt.Ix); }).sort(function (a, b) { return a.massa - b.massa; })[0];
        if (novoP) {
          var par2 = JSON.parse(JSON.stringify(par)); if (par.ventoAdaptado) par2.ventoAdaptado = par.ventoAdaptado;
          par2.perfis = par2.perfis || {}; par2.perfis.pilar = novoP.nome; par2.perfis.viga = final.grupos.viga.perfil; if (final.grupos.tapamento) par2.perfis.tapamento = final.grupos.tapamento.perfil;
          var op2 = {}; Object.keys(op).forEach(function (k) { op2[k] = op[k]; }); op2._bfRefeito = true; op2.bfMinPilar = bfN;
          var r2 = calcular(par2, op2);
          if (r2 && r2.ok) {
            r2.otimizacao.log.unshift("Os parafusos do joelho não cabiam na mesa do pilar " + final.grupos.pilar.perfil + " (" + br(pAt ? pAt.bf : 0, 0) + " mm): refeito com mesa de pelo menos " + bfN + " mm — " + novoP.nome + ".");
            r2.decisoes.push({ tema: "Pilar × ligação", decisao: "pilar com mesa ≥ " + bfN + " mm (" + r2.grupos.pilar.perfil + ")", motivo: "os parafusos do joelho precisam da distância mínima à borda da mesa (NBR 8800, Tabela 14)" });
            return r2;
          }
        }
      }
      if (lg) {
        final.ligacoes = lg;
        lg.avisos.forEach(function (x) { final.avisos.push(x); });
        if (!lg.aprovado) { final.aprovado = false; final.falhas += lg.falhas; }
      }
    }
    final.tempoMs = Date.now() - t0;
    return final;
  }
  function massaDe(nome) { var C = Cat(), c = C && C.obter(nome); return c ? c.massa : 1; }

  /* PRÉ-DIMENSIONAMENTO (só quando o par não traz o perfil, ou traz "auto"): a altura que a prática usa no pórtico de
     alma cheia — viga d ≈ vão/50; pilar d ≈ máx(vão/50, H/20) (engastado: vão/60, H/25) — o W mais leve da família com
     essa altura (5 % de tolerância). O otimizador refina. Sem isso, um galpão 30 × 60 × 10 m começava em W 310 e a
     2ª ordem instabilizava na primeira rodada (achado das pranchas em 12/10/2026). */
  function preDimensionar(par) {
    var C = Cat(), M = Mod(); if (!C || !M || !M.PADRAO) return {};
    var P0 = M.PADRAO.perfis || {}, g = (par && par.geometria) || {}, Pg = M.PADRAO.geometria || {};
    var vao = num(g.vao, num(Pg.vao, 20)), H = num(g.peDireito, num(Pg.peDireito, 6)), eng = g.base === "engastada";
    function escolher(base, dmin) {
      var fam = familia(base).map(function (n) { return C.obter(n); }).filter(function (c) { return c && c.d >= 0.95 * dmin; });
      fam.sort(function (a, b) { return a.massa - b.massa; });
      return fam.length ? fam[0].nome : base;
    }
    return { viga: escolher(P0.viga || "W 310 x 32,7 Gerdau", vao * 1000 / (eng ? 60 : 50)), pilar: escolher(P0.pilar || "W 310 x 38,7 Gerdau", Math.max(vao * 1000 / (eng ? 60 : 50), H * 1000 / (eng ? 25 : 20))) };
  }
  /* 2ª ordem instável: o par pilar + viga mais leve com o DOBRO da inércia (até 3 vezes) */
  function enrijecer(perfis, r) {
    var mud = false;
    ["pilar", "viga"].forEach(function (g) {
      var atual = perfis[g] || (r && r.modelo && r.modelo.grupos[g] && r.modelo.grupos[g].perfil); if (!atual) return;
      var i0 = infoPerfil(atual); if (!i0) return;
      var prox = familia(atual).map(infoPerfil).filter(function (x) { return x && x.Ix >= 2 * i0.Ix; }).sort(function (a, b) { return a.massa - b.massa; })[0];
      if (prox) { perfis[g] = prox.nome; mud = true; }
    });
    return mud;
  }

  /* ================================================================ OTIMIZAÇÃO — escolha pelo que governa
   * Resistência: o módulo resistente Wx (a razão cai mais ou menos na proporção). Serviço: a inércia Ix. O
   * deslocamento do topo do pórtico depende do PILAR e da VIGA juntos (slope-deflection, carga no topo):
   *   base rotulada:  Δ = P·h²/(12E)·(L/Ib + 2h/Ic)
   *   base engastada: Δ = P·h²·(2ic + 3ib)/(12E·ic·(ic + 6ib)),  ic = Ic/h, ib = Ib/L
   * → escolhe o PAR (pilar, viga) mais leve por pórtico que dá a rigidez e a resistência. A análise seguinte confere. */
  function flexPortico(Ic, Ib, h, L, eng) {
    if (!eng) return h * h * (L / Ib + 2 * h / Ic);
    var ic = Ic / h, ib = Ib / L; return h * h * (2 * ic + 3 * ib) / (ic * (ic + 6 * ib));
  }
  function infoPerfil(nome) { var C = Cat(), c = C && C.obter(nome); return c && c.Ix > 0 && c.Wx > 0 ? { nome: nome, massa: c.massa, Ix: c.Ix, Wx: c.Wx, bf: num(c.bf, 0) } : null; }
  function razoesPorGrupo(r) {
    var o = {}, gr = {};
    r.modelo.membros.forEach(function (m) { gr[m.id] = m.grupo; });
    function q(g) { return o[g] || (o[g] = { res: 0, els: {} }); }
    var mfDe = {}; r.modelo.membros.forEach(function (m) { if (m.razaoComMF != null) mfDe[m.id] = m.razaoComMF; });
    Object.keys(r.membros || {}).forEach(function (id) {
      var g = gr[id], v = r.membros[id]; if (!g || !v) return;
      q(g).res = Math.max(q(g).res, v.razao);
      q(g).resMF = Math.max(q(g).resMF || 0, mfDe[id] != null ? Math.min(v.razao, mfDe[id]) : v.razao);
    });
    arr(r.servico).forEach(function (s) { var g = gr[s.membro]; if (g) q(g).els[s.tipo] = Math.max(q(g).els[s.tipo] || 0, s.razao); });
    if (r.grupos && r.grupos.contravento) q("contravento").res = r.grupos.contravento.razao;
    return o;
  }
  function falhaGrupo(q) { if (!q) return false; if (q.res > 1) return true; for (var k in q.els) if (q.els[k] > 1) return true; return false; }
  /* deslocamento do topo previsto para um par (pilar, viga): com 2 ou mais rodadas, ajuste Δ = c1/Ic + c2/Ib pelos
     mínimos quadrados nas rodadas já feitas (calibra a fórmula no modelo de verdade); com 1, a fórmula escalada */
  function previsorTopo(amostras, h, Lv, eng) {
    var a = amostras.filter(function (q) { return q.d > 0 && q.Ic > 0 && q.Ib > 0; });
    if (!a.length) return null;
    var u = {}; a = a.filter(function (q) { var k = q.Ic + ":" + q.Ib; if (u[k]) return false; u[k] = 1; return true; });
    if (a.length >= 2 && false) {   /* desligado: com rodadas muito diferentes (a 1ª é muito flexível) o ajuste errava longe do ponto atual */
      var s11 = 0, s12 = 0, s22 = 0, b1 = 0, b2 = 0;
      a.forEach(function (q) { var x1 = 1 / q.Ic, x2 = 1 / q.Ib; s11 += x1 * x1; s12 += x1 * x2; s22 += x2 * x2; b1 += x1 * q.d; b2 += x2 * q.d; });
      var det = s11 * s22 - s12 * s12;
      if (Math.abs(det) > 1e-12 * s11 * s22) {
        var c1 = (b1 * s22 - b2 * s12) / det, c2 = (s11 * b2 - s12 * b1) / det;
        if (c1 >= 0 && c2 >= 0) return function (Ic, Ib) { return c1 / Ic + c2 / Ib; };
      }
    }
    var q0 = a[a.length - 1], f0 = flexPortico(q0.Ic, q0.Ib, h, Lv, eng);
    return function (Ic, Ib) { return q0.d * flexPortico(Ic, Ib, h, Lv, eng) / f0; };
  }
  function escolherPerfis(perfis, r, rz, proibidos, amostras, restr) {
    restr = restr || {};
    var G = r.modelo, L = G.layout, eng = G.par.geometria.base === "engastada", mud = {};
    function atual(g) { return perfis[g] || (G.grupos[g] && G.grupos[g].perfil); }
    function cands(g) { return familia(atual(g)).map(infoPerfil).filter(function (x) { return x && !(proibidos[g] && proibidos[g][x.nome]) && !(g === "pilar" && restr.bfMinPilar && x.bf < restr.bfMinPilar); }); }
    /* Wx exigido: subindo, a razão/0,95; descendo, a razão/0,85 (a FLT não cai na proporção — margem) */
    /* falhando: a razão/0,95; passando: o MENOR entre o atual e a razão/0,85 (o atual que passa continua elegível) */
    /* com mão-francesa automática, a razão de referência é a com mãos-francesas (o perfil mais leve + mãos-francesas) */
    var mfAuto = G.par.maoFrancesa !== "nunca";
    function rRef(q) { return mfAuto && q.resMF != null ? Math.min(q.res, q.resMF) : q.res; }
    function wReq(g, i0) { var q = rz[g]; if (!q) return 0; var rr = rRef(q); return rr > 1 ? i0.Wx * rr / 0.95 : Math.min(i0.Wx, i0.Wx * rr / 0.85); }
    function iReq(g, tipo, i0) { var q = rz[g], v = q && q.els[tipo]; if (!v) return 0; return v > 1 ? i0.Ix * v / 0.95 : Math.min(i0.Ix, i0.Ix * v / 0.9); }
    var iP = infoPerfil(atual("pilar")), iV = infoPerfil(atual("viga"));
    if (iP && iV && rz.pilar && rz.viga) {
      var h = L.H, Lv = L.vao, rTopo = Math.max(rz.pilar.els.pilarTopo || 0, rz.viga.els.pilarTopo || 0);
      /* em RAZÃO da verificação que governa (deslocamento/limite): no galpão de uma água os pilares têm alturas — e
         limites H/300 — diferentes; misturar o maior deslocamento de um com o maior limite do outro fazia o par atual
         "passar" na previsão e o otimizador parava reprovado (12/10/2026) */
      var prev = rTopo > 0 ? previsorTopo(amostras || [], h, Lv, eng) : null;
      var dMax = rTopo > 1 ? 0.95 : Math.max(0.9, prev ? prev(iP.Ix, iV.Ix) * 1.0001 : 0);
      var LP = cands("pilar").filter(function (x) { return x.Wx >= wReq("pilar", iP); });   /* o topo entra pelo fMax (par) */
      var LV = cands("viga").filter(function (x) { return x.Wx >= wReq("viga", iV) && x.Ix >= Math.max(iReq("viga", "viga", iV), iReq("viga", "cumeeira", iV)); });
      var melhor = null;
      LP.forEach(function (p) { LV.forEach(function (v) {
        /* deslocamento reprovado: só SOBE a inércia (nenhum dos dois perde) — mover rigidez de um para o outro fazia o
           otimizador oscilar (galpão de uma água 10 × 20: H/300 = 1,25 → 1,60 → 1,25 e parava reprovado; a tela achou) */
        if (rTopo > 1 && (p.Ix < iP.Ix || v.Ix < iV.Ix)) return;
        if (prev && prev(p.Ix, v.Ix) > dMax * (1 + 1e-9)) return;
        var w = 2 * h * p.massa + Lv * v.massa; if (!melhor || w < melhor.w - 1e-9) melhor = { p: p, v: v, w: w };
      }); });
      if (!melhor) {   /* nada na família dá: o mais rígido de cada uma (a próxima rodada mostra a falha com a sugestão) */
        var maxI = function (l, i0) { return l.length ? l.reduce(function (a, b) { return b.Ix > a.Ix ? b : a; }) : i0; };
        melhor = { p: maxI(cands("pilar"), iP), v: maxI(cands("viga"), iV) };
      }
      /* subindo por resistência e o escolhido é o mesmo: força o próximo com Wx maior (a estimativa linear falhou) */
      ["pilar", "viga"].forEach(function (g) {
        var esc = g === "pilar" ? melhor.p : melhor.v, i0 = g === "pilar" ? iP : iV;
        if (esc.nome === i0.nome && rz[g].res > 1) { var prox = cands(g).filter(function (x) { return x.Wx > i0.Wx * 1.02; }).sort(function (a, b) { return a.massa - b.massa; })[0]; if (prox) esc = prox; }
        if (esc.nome !== i0.nome) mud[g] = { de: i0.nome, para: esc.nome, motivo: rz[g].res > 1 ? "resistência " + br(rz[g].res, 2) : (rTopo > 1 ? "deslocamento do topo " + br(rTopo, 2) : (rz[g].els.viga > 1 ? "flecha " + br(rz[g].els.viga, 2) : (esc.massa < i0.massa ? "folga — mais leve" : "par pilar + viga mais leve no total"))) };
      });
    }
    var iT = infoPerfil(atual("tapamento"));
    if (iT && rz.tapamento) {
      var LT = cands("tapamento").filter(function (x) { return x.Wx >= wReq("tapamento", iT) && x.Ix >= iReq("tapamento", "tapamento", iT); }).sort(function (a, b) { return a.massa - b.massa; });
      var escT = LT[0] || iT;
      if (escT.nome === iT.nome && rz.tapamento.res > 1) { var proxT = cands("tapamento").filter(function (x) { return x.Wx > iT.Wx * 1.02; }).sort(function (a, b) { return a.massa - b.massa; })[0]; if (proxT) escT = proxT; }
      if (escT.nome !== iT.nome) mud.tapamento = { de: iT.nome, para: escT.nome, motivo: rz.tapamento.res > 1 ? "resistência " + br(rz.tapamento.res, 2) : "folga — mais leve" };
    }
    return mud;
  }

  function umaRodada(par, op, ventoAd) {
    var M = Mod(), C = Car(), A = Ana(), D = D8800();
    var parM = JSON.parse(JSON.stringify(par)); if (par.perfis && par.perfis.contraventoDiametro) parM.contraventoDiametro = par.perfis.contraventoDiametro;
    var G = M.galpao(parM);
    if (!G.ok && G.problemas && G.problemas.length) {
      if (op.aplicarSugestao && G.problemas[0].solucoes && G.problemas[0].solucoes.length) {
        parM.contraventamento = G.problemas[0].solucoes[0].id; G = M.galpao(parM);
        G.decisoes.push({ tema: "Estabilidade", decisao: "aplicada a solução sugerida: " + G.par.contraventamento, motivo: "o usuário pediu para calcular com a sugestão" });
      } else return { ok: false, problemas: G.problemas, motivo: G.problemas[0].texto, decisoes: G.decisoes };
    }
    if (!G.ok) return { ok: false, motivo: G.motivo || "Modelo inválido." };
    var cfgCargas = par.cargas || {};
    var sob = C.sobrecargaCobertura(num(G.par.geometria.inclinacaoPct, 10), { empocamentoVerificado: G.par.cobertura.empocamentoVerificado });
    if (!sob.ok) return { ok: false, motivo: sob.motivo };
    cfgCargas.sobrecarga = num(cfgCargas.sobrecarga, sob.q);
    var casos = M.cargas(G, cfgCargas, ventoAd || null);
    var combs = C.combinacoes(casos, { segundaOrdem: true, nocional: true });
    var elu = combs.filter(function (c) { return c.tipo === "ELU"; }), els = combs.filter(function (c) { return c.tipo !== "ELU"; });
    /* 1ª ordem das ELU (para a classificação) e 2ª ordem */
    var res = A.analisar(G.modelo, { combinacoes: elu.concat(els.map(function (c) { return { id: c.id, fatores: c.fatores }; })).concat(casos.map(function (c) { var f = {}; f[c.id] = 1; return { id: "caso_" + c.id, fatores: f }; })), estacoes: 7 });
    if (!res.ok) {
      return { ok: false, motivo: "Análise: " + res.motivo, problemas: [{ tipo: "analise", texto: res.motivo, solucoes: [] }], decisoes: G.decisoes };
    }
    /* deslocabilidade: maior Δ2/Δ1 horizontal nos topos dos pilares */
    var topos = G.membros.filter(function (m) { return m.papel === "pilar"; }).map(function (m) { return m.nos[m.nos.length - 1]; });
    /* Δ2/Δ1 por direção (x: pórticos; z: contraventamento), com os MAIORES deslocamentos dos topos em cada ordem;
       direção com Δ1 < H/5000 não classifica (razão de números desprezíveis — o defeito que dava 9,3 em 12/10/2026) */
    var razaoDesl = 1, minDesl = G.layout.H / 5000;
    elu.forEach(function (c) {
      var d2 = res.combinacoes[c.id]; if (!d2 || !d2.ok || !d2.desloc1) return;
      [0, 2].forEach(function (dir) {
        var m1 = 0, m2 = 0;
        topos.forEach(function (n) { var a = d2.desloc1[n], b = d2.desloc[n]; if (!a || !b) return; m1 = Math.max(m1, Math.abs(a[dir])); m2 = Math.max(m2, Math.abs(b[dir])); });
        if (m1 > minDesl) razaoDesl = Math.max(razaoDesl, m2 / m1);
      });
    });
    var classe = razaoDesl <= 1.13 ? "pequena" : razaoDesl <= 1.55 ? "média" : "grande";   /* NBR 8800:2024, 4.10 (com imperfeições): 1,13 e 1,55 — eram 1,1 e 1,4 */
    G.decisoes.push({ tema: "Análise estrutural", decisao: "2ª ordem (P-Δ e P-δ) com forças nocionais de 0,3 % das cargas gravitacionais; deslocabilidade " + classe + " (Δ2/Δ1 máx. = " + br(razaoDesl, 3) + ")", motivo: "NBR 8800:2024, 4.10 (limites 1,13 e 1,55)" + (classe !== "pequena" ? " — rigidez reduzida a 80 % (imperfeição de material)" : "") });
    if (classe !== "pequena") {
      var elu80 = elu.map(function (c) { return { id: c.id, fatores: c.fatores, segundaOrdem: true, nocional: c.nocional, reducaoRigidez: 0.8 }; });
      var res80 = A.analisar(G.modelo, { combinacoes: elu80, estacoes: 7 });
      if (res80.ok) Object.keys(res80.combinacoes).forEach(function (k) { res.combinacoes[k] = res80.combinacoes[k]; });
    }
    var avisos = [].concat(res.avisos || []);
    if (classe === "grande") avisos.push("Estrutura de GRANDE deslocabilidade (Δ2/Δ1 = " + br(razaoDesl, 2) + " > 1,55): a NBR 8800 pede análise rigorosa; aumente a rigidez (pilares/vigas maiores ou bases engastadas).");
    /* mãos-francesas automáticas: o MENOR conjunto que resolve (nenhuma → a cada 3 → a cada 2 → todas as posições
       onde a mesa de baixo da viga / a de dentro do pilar fica comprimida em alguma combinação) */
    var mf = G.par.maoFrancesa;
    function verif(m, extra) {
      var est = []; elu.forEach(function (c) { est = est.concat(estacoesMembro(res, m, c.id)); });
      var tr = { mais: m.travamentos.mais.slice(), menos: m.travamentos.menos.slice() };
      if (extra) { if (m.papel === "viga") tr.menos = extra; else tr.mais = extra; }
      return D.verificarBarra({ secao: m.secao.mm, aco: m.aco, estacoes: est, L: m.L, flambagem: m.flambagem, travamentos: tr, papel: m.papel });
    }
    G.membros.forEach(function (m) {
      if ((m.papel !== "viga" && m.papel !== "pilar") || mf === "nunca") return;
      var pos = m.papel === "viga" ? m.travamentos.mais.slice() : m.travamentos.menos.slice();   /* terças (viga) e travessas (pilar) */
      if (!pos.length) return;
      var neg = {};
      elu.forEach(function (c) {
        estacoesMembro(res, m, c.id).forEach(function (e) { var comp = m.papel === "viga" ? e.Mz < -1e-6 : e.Mz > 1e-6; if (comp) pos.forEach(function (p, q) { if (Math.abs(e.x - p) <= Math.max(0.6, m.L / 20)) neg[q] = true; }); });
      });
      var cand = pos.filter(function (p, q) { return neg[q]; });
      if (!cand.length) return;
      m.razaoComMF = verif(m, cand).razao;   /* com mão-francesa em todas as posições: o otimizador usa para tentar perfil mais leve */
      var opcoes = mf === "sempre" ? [cand] : [[], cand.filter(function (p, q) { return q % 3 === 0; }), cand.filter(function (p, q) { return q % 2 === 0; }), cand];
      var escolha = cand;
      for (var o = 0; o < opcoes.length; o++) { var v = verif(m, opcoes[o]); if (v.razao <= 1.0) { escolha = opcoes[o]; break; } }
      if (escolha.length) { if (m.papel === "viga") m.travamentos.menos = escolha; else m.travamentos.mais = escolha; m.maosFrancesas = escolha; }
    });
    var nMF = G.membros.reduce(function (s, m) { return s + arr(m.maosFrancesas).length; }, 0);
    if (nMF) G.decisoes.push({ tema: "Mãos-francesas", decisao: nMF + " mãos-francesas no total — o menor arranjo (nenhuma, a cada 3, a cada 2 ou todas as terças/travessas da região) que faz a barra passar", motivo: "travar a mesa comprimida pelo momento negativo (junto aos joelhos, e na sucção do vento) contra a flambagem lateral com torção" });
    else if (mf !== "nunca") G.decisoes.push({ tema: "Mãos-francesas", decisao: "dispensadas", motivo: "as barras passam com a mesa comprimida destravada entre as ligações" });
    /* verificação das barras */
    var resultadosM = {}, grupos = {}, falhas = 0;
    G.decisoes.push({ tema: "Esbeltez", decisao: "L/r ≤ 200 nas barras comprimidas e ≤ 300 nas tracionadas como EXIGÊNCIA (reprova a barra e limita o perfil mais leve); o contraventamento em barra redonda é isento",
      motivo: "NBR 8800:2008, 5.3.4.1 (compressão; na 2024, 5.3.7, recomendação) e 5.2.8.1 (tração; recomendação, exceto barra redonda pré-tensionada) — o OrçaPRO adota os dois como exigência (premissa: barras redondas montadas com pré-tensão — esticador)" });
    G.membros.forEach(function (m) {
      var est = []; elu.forEach(function (c) { est = est.concat(estacoesMembro(res, m, c.id)); });
      var v = D.verificarBarra({ secao: m.secao.mm, aco: m.aco, estacoes: est, L: m.L, flambagem: m.flambagem, travamentos: m.travamentos, papel: m.papel });
      /* SIMULAÇÃO S1 — rodada 2 (decisão do Rogério, 14/10/2026): esbeltez L/r ≤ 200/300 como EXIGÊNCIA também no galpão
         (js/acodimlivre.js; o contraventamento do galpão é barra redonda — isento) */
      var DLv = global.AcoDimLivre || (typeof require === "function" ? (function () { try { return require("./acodimlivre.js"); } catch (eL) { return null; } })() : null);
      if (DLv && DLv.aplicarEsbeltez) v = DLv.aplicarEsbeltez(v, m, est);
      resultadosM[m.id] = v;
      arr(v.avisos).forEach(function (a) { var t = m.id + " (" + m.secao.nome + "): " + a; if (avisos.indexOf(t) < 0) avisos.push(t); });
      var g = grupos[m.grupo] || (grupos[m.grupo] = { razao: 0, membro: null, perfil: m.secao.nome });
      if (v.razao > g.razao) { g.razao = v.razao; g.membro = m.id; }
      if (!v.ok) falhas++;
    });
    /* contraventamento: maior tração */
    var cvs = G.modelo.barras.filter(function (b) { return b.papel === "contravento"; }), Nmax = 0, cvMax = null;
    elu.forEach(function (c) { var cb = res.combinacoes[c.id]; if (!cb || !cb.ok) return; cvs.forEach(function (b) { var e = cb.barras[b.id]; if (e && !e.inativa) { var N = e.estacoes[0].N; if (N > Nmax) { Nmax = N; cvMax = b.id; } } }); });
    var cvRes = null;
    if (cvs.length) {
      var sCV = G.secoes.contravento, vcv = D.verificarBarra({ secao: sCV.mm, aco: G.grupos.contravento.aco, estacoes: [{ x: 0, N: Nmax, Mz: 0, My: 0, Vy: 0, Vz: 0, comb: "env" }], L: 1, papel: "tirante" });
      cvRes = { barra: cvMax, N: Nmax, verificacao: vcv, perfil: sCV.nome };
      grupos.contravento = { razao: vcv.razao, membro: cvMax, perfil: sCV.nome };
      if (vcv.razao > 1 || vcv.razao < 0.4) {
        /* diâmetro comercial que passa com folga (barra redonda; Ø em mm) */
        var dias = [9.5, 12.5, 16, 19, 22, 25, 32], A0 = sCV.mm.A, alvo = null;
        for (var q = 0; q < dias.length; q++) { var Aq = Math.PI * dias[q] * dias[q] / 4; if (vcv.razao * A0 / Aq <= 0.9) { alvo = dias[q]; break; } }
        if (alvo && Math.abs(alvo - num(G.par.contraventoDiametro, 12.5)) > 0.1) cvRes.trocar = alvo;
      }
      if (vcv.razao > 1) falhas++;
    }
    /* ELS: deslocamentos */
    var servico = [], elsRaras = els.filter(function (c) { return c.tipo === "ELS-rara"; });
    G.membros.forEach(function (m) {
      if (m.papel === "pilar") {
        var topo = m.nos[m.nos.length - 1], base = m.nos[0], max = 0, onde = null;
        elsRaras.forEach(function (c) { var cb = res.combinacoes[c.id]; if (!cb || !cb.ok) return; var a = cb.desloc[topo], b = cb.desloc[base] || [0, 0, 0]; if (!a) return; var h = Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[2] - b[2], 2)); if (h > max) { max = h; onde = c.id; } });
        var lim = m.L / LIMITES.pilarTopo.div;
        servico.push({ membro: m.id, tipo: "pilarTopo", valor: max, limite: lim, razao: max / lim, comb: onde, texto: LIMITES.pilarTopo.nome + ": H/" + LIMITES.pilarTopo.div, ref: LIMITES.pilarTopo.ref });
      } else if (m.papel === "viga") {
        /* (1) flecha da viga INTEIRA (beiral–cumeeira) em relação à corda das pontas deslocadas — antes era a flecha entre
           duas terças vizinhas (a vista 3D achou: 0,77 mm enquanto a cumeeira descia 35 mm; no exemplo sem vento, 116,7 mm
           acima dos 80 mm do limite e o cálculo aprovava — 12/10/2026). Duas águas: o vão de referência é 2 × o membro. */
        var fCorda = 0, cCorda = null;
        elsRaras.forEach(function (c) {
          var est = estacoesMembro(res, m, c.id); if (est.length < 2) return;
          var u0 = est[0].u, u1 = est[est.length - 1].u, Lm = est[est.length - 1].x;
          est.forEach(function (e) { var s2 = Lm > 0 ? e.x / Lm : 0, dv = e.u[1] - (u0[1] + (u1[1] - u0[1]) * s2); if (Math.abs(dv) > Math.abs(fCorda)) { fCorda = dv; cCorda = c.id; } });
        });
        var Lv = G.layout.aguas === 2 ? 2 * m.L : m.L, limv = Lv / LIMITES.viga.div;
        servico.push({ membro: m.id, tipo: "viga", valor: Math.abs(fCorda), limite: limv, razao: Math.abs(fCorda) / limv, comb: cCorda, texto: LIMITES.viga.nome + ": L/" + LIMITES.viga.div + " (viga inteira, em relação à corda das pontas)", ref: LIMITES.viga.ref });
        /* (2) duas águas: a CUMEEIRA em relação aos beirais do pórtico, limite vão/250 (uma vez por pórtico) */
        var par2 = G.membros.filter(function (v) { return v.papel === "viga" && v.k === m.k; });
        if (G.layout.aguas === 2 && par2.length === 2 && par2[0] === m) {
          var ends = [par2[0].nos[0], par2[0].nos[par2[0].nos.length - 1], par2[1].nos[0], par2[1].nos[par2[1].nos.length - 1]];
          var cum = ends.filter(function (n2, i2) { return ends.indexOf(n2) !== i2; })[0], beirais = ends.filter(function (n2) { return n2 !== cum; });
          if (cum && beirais.length === 2) {
            var fC = 0, cC = null;
            elsRaras.forEach(function (c) {
              var cb = res.combinacoes[c.id]; if (!cb || !cb.ok) return;
              var dc = cb.desloc[cum], d1 = cb.desloc[beirais[0]], d2 = cb.desloc[beirais[1]]; if (!dc || !d1 || !d2) return;
              var dv = dc[1] - (d1[1] + d2[1]) / 2; if (Math.abs(dv) > Math.abs(fC)) { fC = dv; cC = c.id; }
            });
            var limc = G.layout.vao / LIMITES.cumeeira.div;
            servico.push({ membro: m.id, tipo: "cumeeira", valor: Math.abs(fC), limite: limc, razao: Math.abs(fC) / limc, comb: cC, k: m.k, texto: LIMITES.cumeeira.nome + ": L/" + LIMITES.cumeeira.div, ref: LIMITES.cumeeira.ref });
          }
        }
      }
    });
    var falhasELS = servico.filter(function (s) { return s.razao > 1; }).length;
    servico.forEach(function (s) {
      var m = G.membros.filter(function (x) { return x.id === s.membro; })[0]; if (!m) return;
      var g = grupos[m.grupo]; if (g && s.razao > g.razao) { g.razao = s.razao; g.membro = m.id; g.governaELS = true; }
    });
    falhas += falhasELS;
    /* reações na fundação */
    var bases = G.modelo.apoios.map(function (a) { return a.no; }), reacoes = {};
    bases.forEach(function (b) {
      var o = { porCaso: {}, envELU: { Fx: [Infinity, -Infinity], Fy: [Infinity, -Infinity], Fz: [Infinity, -Infinity], Mx: [Infinity, -Infinity], Mz: [Infinity, -Infinity] }, combEnv: {} };   /* sem o zero falso (o memorial achou) */
      casos.forEach(function (c) { var cb = res.combinacoes["caso_" + c.id]; if (cb && cb.ok && cb.reacoes[b]) o.porCaso[c.id] = cb.reacoes[b].slice(); });
      elu.forEach(function (c) {
        var cb = res.combinacoes[c.id]; if (!cb || !cb.ok || !cb.reacoes[b]) return; var r = cb.reacoes[b];
        [["Fx", 0], ["Fy", 1], ["Fz", 2], ["Mx", 3], ["Mz", 5]].forEach(function (p) {
          var e = o.envELU[p[0]], ce = o.combEnv[p[0]] || (o.combEnv[p[0]] = [null, null]);
          if (r[p[1]] < e[0]) { e[0] = r[p[1]]; ce[0] = c.id; }
          if (r[p[1]] > e[1]) { e[1] = r[p[1]]; ce[1] = c.id; }
        });
      });
      reacoes[b] = o;
    });
    /* peso de aço */
    var peso = 0, pesoG = {};
    G.membros.forEach(function (m) { var kg = m.L * num(m.secao.massa, 0); peso += kg; pesoG[m.grupo] = (pesoG[m.grupo] || 0) + kg; });
    G.modelo.barras.forEach(function (b) {
      if (b.papel === "contravento") { var Lb = comprimento(G, b), kg = Lb * num(G.secoes.contravento.massa, 0); peso += kg; pesoG.contravento = (pesoG.contravento || 0) + kg; }
    });
    var area = G.layout.vao * G.layout.Lt;
    /* FLAMBAGEM GLOBAL: fator de carga crítica e modos na combinação gravitacional e na de vento mais carregada */
    var flamb = [];
    var refs = elu.filter(function (c) { return /principal/.test(c.nome); });
    var gravRef = elu[0], ventoRef = null, mx = 0;
    elu.forEach(function (c) { var cb = res.combinacoes[c.id]; if (!cb || !cb.ok) return; topos.forEach(function (n) { var d = cb.desloc[n]; if (d) { var h = Math.abs(d[0]) + Math.abs(d[2]); if (h > mx && c.fatores && Object.keys(c.fatores).some(function (k) { return /^W/.test(k); })) { mx = h; ventoRef = c; } } }); });
    [gravRef, ventoRef].forEach(function (c) {
      if (!c || op.semFlambagem) return;
      var fb = A.flambagem(G.modelo, { combinacao: { id: c.id, fatores: c.fatores, nocional: c.nocional }, modos: 2 });
      if (fb.ok) flamb.push({ combinacao: c.id, nome: c.nome, lambda: fb.lambdaCritico, modos: fb.modos });
    });
    if (flamb.length) {
      var lmin = Math.min.apply(null, flamb.map(function (f) { return f.lambda > 0 ? f.lambda : 1e9; }));
      G.decisoes.push({ tema: "Flambagem global", decisao: "fator de carga crítica λcr = " + br(lmin, 2) + " (a combinação de cálculo teria de ser multiplicada por " + br(lmin, 2) + " para a estrutura flambar)", motivo: "análise de autovalor da rigidez geométrica; com λcr > 10 os efeitos de 2ª ordem globais são pequenos" });
      if (lmin < 3) avisos.push("λcr = " + br(lmin, 2) + " < 3: estrutura muito flexível em 2ª ordem — aumentar a rigidez.");
    }
    /* sugestão para quem não passa: o perfil seguinte da família que deve passar (estimativa por massa; a próxima rodada confirma) */
    Object.keys(resultadosM).forEach(function (id) {
      var v = resultadosM[id], m = G.membros.filter(function (x) { return x.id === id; })[0];
      if (!m || v.ok) return;
      var fam = familia(m.secao.nome), i = fam.indexOf(m.secao.nome);
      for (var k = i + 1; k < fam.length; k++) if (v.razao * massaDe(m.secao.nome) / massaDe(fam[k]) <= 0.95) { v.sugestao = "Trocar " + m.secao.nome + " por " + fam[k] + " (aproveitamento estimado " + br(v.razao * massaDe(m.secao.nome) / massaDe(fam[k]), 2) + ")"; break; }
      if (!v.sugestao) v.sugestao = "Nenhum perfil da família " + m.secao.nome.split(" ")[0] + " resolve: usar perfil soldado, travar mais a barra ou reduzir o vão.";
    });
    return {
      ok: true, aprovado: falhas === 0, falhas: falhas, modelo: G, casos: casos, combinacoes: combs, sobrecarga: sob, analise: res, deslocabilidade: { razao: razaoDesl, classe: classe },
      membros: resultadosM, grupos: grupos, contravento: cvRes, servico: servico, reacoes: reacoes,
      peso: peso, pesoGrupos: pesoG, taxa: peso / area, decisoes: G.decisoes, avisos: avisos.concat(G.avisos), flambagem: flamb, parametros: par
    };
  }
  function comprimento(G, b) { var n = {}; G.modelo.nos.forEach(function (x) { n[x.id] = x; }); var a = n[b.i], c = n[b.j]; return Math.sqrt(Math.pow(c.x - a.x, 2) + Math.pow(c.y - a.y, 2) + Math.pow(c.z - a.z, 2)); }

  /* ============================================ ALTERNATIVA DE BASE (sob pedido — dobra o tempo)
   * O mesmo galpão com a OUTRA condição de base: o engenheiro vê o que muda no aço e o que vai para a fundação.
   * `atual` = o resultado já calculado (opcional, para a comparação). */
  function alternativaBase(par, op, atual) {
    var b0 = par && par.geometria && par.geometria.base === "engastada" ? "engastada" : "rotulada", b1 = b0 === "engastada" ? "rotulada" : "engastada";
    var p2 = JSON.parse(JSON.stringify(par || {})); p2.geometria = p2.geometria || {}; p2.geometria.base = b1;
    if (par && par.ventoAdaptado) p2.ventoAdaptado = par.ventoAdaptado;
    var r2 = calcular(p2, op || {});
    if (!r2.ok) return { ok: false, base: b1, motivo: r2.motivo, problemas: r2.problemas };
    function resumo(r) {
      if (!r || !r.ok) return null;
      var Mmax = 0, Nmax = 0, Hmax = 0;
      Object.keys(r.reacoes || {}).forEach(function (k) {
        var e = r.reacoes[k].envELU || {};
        if (e.Mz) Mmax = Math.max(Mmax, Math.abs(e.Mz[0]), Math.abs(e.Mz[1]));
        if (e.Fy) Nmax = Math.max(Nmax, Math.abs(e.Fy[0]), Math.abs(e.Fy[1]));
        if (e.Fx) Hmax = Math.max(Hmax, Math.abs(e.Fx[0]), Math.abs(e.Fx[1]));
      });
      return { aprovado: r.aprovado, peso: r.peso, pesoTotal: r.pesoTotal, taxa: r.taxa, perfis: { pilar: r.grupos.pilar && r.grupos.pilar.perfil, viga: r.grupos.viga && r.grupos.viga.perfil },
               baseLig: r.ligacoes && r.ligacoes.base ? r.ligacoes.base.resumo : null, momentoBaseMax: Mmax, verticalMax: Nmax, horizontalMax: Hmax };
    }
    var a = resumo(atual), b = resumo(r2), txt = null;
    if (a && b) {
      var dk = b.pesoTotal - a.pesoTotal;
      txt = "Com base " + b1 + ": " + (dk < 0 ? "economia de " + br(-dk, 0) + " kg de aço" : br(dk, 0) + " kg a mais de aço") + " (" + br(b.taxa, 1) + " kg/m² na estrutura principal, pilar " + b.perfis.pilar + ", viga " + b.perfis.viga + ")" +
            (b1 === "engastada" ? "; a fundação passa a receber momento de até " + br(b.momentoBaseMax, 1) + " kN·m (bloco maior e chumbadores fora das mesas)." : "; a fundação deixa de receber momento (hoje até " + br(a.momentoBaseMax, 1) + " kN·m).");
    }
    return { ok: true, base: b1, atual: a, alternativa: b, texto: txt, resultado: r2 };
  }

  var AcoDimensionar = { calcular: calcular, alternativaBase: alternativaBase, LIMITES: LIMITES, familia: familia, estacoesMembro: estacoesMembro,
                         _interno: { escolherPerfis: escolherPerfis, razoesPorGrupo: razoesPorGrupo, flexPortico: flexPortico, previsorTopo: previsorTopo, infoPerfil: infoPerfil } };   /* para teste e depuração */
  global.AcoDimensionar = AcoDimensionar;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoDimensionar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
