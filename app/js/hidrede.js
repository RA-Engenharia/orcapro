/* =====================================================================
 * hidrede.js — PROJETO INTELIGENTE etapa 2: a LINHA DA REDE (motor PURO, ES5, Node-testável). 17/10/2026.
 *
 * Pedido do Rogério: "Quando você colocar a linha onde vai passar a rede secundária, ele já identifica e leva até ela. A gente
 * fala se vai por baixo da viga baldrame ou se corta a viga baldrame… manda tudo para a rede primária no tubo de 100, e dali
 * entra na caixa de inspeção mais próxima, e assim vai montando."
 *
 *   HidRede.gerar({ estado, avaliarFam, ops, rede (id da op hidRede), parametros })
 *     → { ok, ops (o LOTE: tira o que esta linha gerou antes e põe caixas, coletor, ramais, anotações), caixas[], coletor[],
 *         ramais[], interferencias[], baldrames[], avisos[], pendencias[], decisoes[] }
 *   HidRede.baldrames(estado, parametros) / HidRede.cruzamentos(p1, p2, raio, baldrames)   (o "Ligar ambiente" usa também)
 *
 * COMO MONTA:
 *  1. a linha (op hidRede, js/biminstrede.js) = o eixo do coletor em planta, do montante para a SAÍDA (último ponto);
 *  2. as ESPERAS de esgoto (ponta que "continua", abaixo do piso: as do "Ligar ambiente", a base de um tubo de queda) — cada uma
 *     desce perpendicular à linha e entra numa CAIXA DE INSPEÇÃO ali (junção de coletores = caixa);
 *  3. CAIXAS DE INSPEÇÃO onde a NBR 8160 exige: em cada mudança de direção (vértice), em cada junção, na saída, e entre duas
 *     caixas a mais que es8160.inspecao[entre_dispositivos_max] (intercaladas por igual);
 *  4. cotas de MONTANTE para JUSANTE: o ramal desce com a declividade mínima do DN dele; o coletor sai de cada caixa na cota da
 *     entrada mais baixa e desce com a declividade mínima do DN dele (BimInst.declMinDn = a maior entre a tabela e o modelador);
 *  5. VIGA BALDRAME (do modelo estrutural: viga com o topo perto do piso térreo; sem modelo, parametros.baldrame
 *     { altura, largura, topo } sob as paredes do térreo): "por_baixo" (padrão) — o tubo passa ABAIXO da viga com folga: o
 *     ramal ganha uma descida vertical na espera, o coletor uma queda na caixa de montante; "atravessar" — o tubo fura a viga
 *     com tubo-camisa, a interferência é marcada (anotação no 3D) e avisada: "furo em viga: verificar com o projeto estrutural".
 * ⚠ Nenhum número de norma aqui: distâncias de inspeção, DN mínimo do coletor e declividades vêm do HidNormas; os "hid:ok" são
 *   geometria/critério de desenho, declarados e trocáveis em parametros.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function chao4(v) { return Math.floor(v * CASAS + 1e-6) / CASAS; }   // hid:ok arredondamento (a cota a jusante nunca sobe)
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var EPS = 1e-6;   // hid:ok
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function raio(dn) { return dn / 1000 / 2; }   /* DN em mm → raio em m */
  (function () { var R = dep("BimInstRede", "./biminstrede.js"); if (R && R.registrar) R.registrar(); })();

  /* ⚠ GEOMETRIA / CRITÉRIO DE PROJETO (não é norma) — trocável em parametros, declarado no memorial */
  var GEO_REDE = {
    folgaBaldrame: 0.05,     // hid:ok folga livre entre o topo do tubo e o fundo da viga baldrame (critério do projetista)
    baldrameAcima: 0.20,     // hid:ok viga com o topo até 0,20 m ACIMA do piso térreo…
    baldrameAbaixo: 1.50,    // hid:ok …e até 1,50 m abaixo dele = viga baldrame
    juntarCaixas: 0.60,      // hid:ok duas caixas a menos disto ao longo da linha viram uma só (o diâmetro da caixa)
    fundoCaixa: 0.10,        // hid:ok do tubo mais baixo ao fundo da caixa (calha/assentamento)
    esperaSaida: 0.60,       // hid:ok o toco de espera da saída predial depois da última caixa (o ramal até a rede pública continua dali)
    folgaTampa: 0.10,        // hid:ok da bolsa do tubo que entra até a laje da tampa: a boca no corpo da parede, longe da tampa (desenho)
    tolPiso: 0.10            // hid:ok espera "no piso": a ponta a até 10 cm acima do terreno
  };
  function geo(par, k) { return par && par[k] != null && isFinite(Number(par[k])) ? Number(par[k]) : GEO_REDE[k]; }

  /* ---------------------------------------------------------- GEOMETRIA DA LINHA */
  function linha(pontos) {
    var P = arr(pontos).map(function (p) { return { x: num(p.x, 0), z: num(p.z, 0) }; }), s = [0];
    for (var i = 1; i < P.length; i++) s.push(s[i - 1] + d2(P[i - 1], P[i]));
    return { P: P, s: s, L: s[s.length - 1] };
  }
  function noPonto(Lh, sv) {
    for (var i = 1; i < Lh.P.length; i++) if (sv <= Lh.s[i] + EPS) { var a = Lh.P[i - 1], b = Lh.P[i], L = Lh.s[i] - Lh.s[i - 1] || 1, t = (sv - Lh.s[i - 1]) / L; return { x: r4(a.x + (b.x - a.x) * t), z: r4(a.z + (b.z - a.z) * t), seg: i - 1 }; }
    var u = Lh.P[Lh.P.length - 1]; return { x: u.x, z: u.z, seg: Lh.P.length - 2 };
  }
  function projetar(Lh, p, aceita) {
    var melhor = null, livre = null;
    for (var i = 1; i < Lh.P.length; i++) {
      var a = Lh.P[i - 1], b = Lh.P[i], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      var q = { x: a.x + dx * t, z: a.z + dz * t }, d = d2(p, q);
      if (!melhor || d < melhor.d - EPS) melhor = { d: d, s: Lh.s[i - 1] + t * Math.sqrt(L2), x: q.x, z: q.z };
      if (aceita && (!livre || d < livre.d - EPS) && aceita(p, q)) livre = { d: d, s: Lh.s[i - 1] + t * Math.sqrt(L2), x: q.x, z: q.z };
    }
    return livre || melhor;
  }

  /* ---------------------------------------------------------- BALDRAME */
  function retangulo(p1, p2, larg) {
    var dx = p2.x - p1.x, dz = p2.z - p1.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > EPS) || !(larg > 0)) return null;
    return { cx: (p1.x + p2.x) / 2, cz: (p1.z + p2.z) / 2, ux: dx / L, uz: dz / L, hl: L / 2, hw: larg / 2 };
  }
  function terrenoDe(estado, par) {
    if (par && par.cotaTerreno != null && isFinite(Number(par.cotaTerreno))) return { y: Number(par.cotaTerreno), origem: "informado" };
    var bases = arr(estado.caixas).filter(function (c) { return c && c.tipo === "parede"; }).map(function (c) { return c.cy - num(c.altura, 0) / 2; });
    if (bases.length) return { y: r4(Math.min.apply(null, bases)), origem: "base das paredes do térreo" };
    return null;
  }
  /* as vigas baldrame: do modelo (viga com o topo perto do piso térreo) ou, sem viga no modelo, as do parâmetro sob as paredes do térreo */
  function baldrames(estado, par) {
    par = par || {};
    var T = terrenoDe(estado, par), out = [];
    if (!T) return { lista: [], origem: null, terreno: null };
    arr(estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "viga") return;
      var alt = num(c.altura, 0), topo = c.cy + alt / 2;
      if (topo > T.y + geo(par, "baldrameAcima") + EPS || topo < T.y - geo(par, "baldrameAbaixo") - EPS) return;
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2;
      var R = retangulo({ x: c.cx - h * cs, z: c.cz + h * sn }, { x: c.cx + h * cs, z: c.cz - h * sn }, num(c.espessura, 0));
      if (R) { R.id = c.id; R.yBase = r4(topo - alt); R.yTopo = r4(topo); R.largura = num(c.espessura, 0); out.push(R); }
    });
    if (out.length) return { lista: out, origem: "modelo", terreno: T };
    var B = par.baldrame;
    if (B && num(B.altura, 0) > 0 && num(B.largura, 0) > 0 && isFinite(num(B.topo, NaN))) {
      arr(estado.caixas).forEach(function (c) {
        if (!c || c.tipo !== "parede" || Math.abs(c.cy - num(c.altura, 0) / 2 - T.y) > geo(par, "baldrameAcima")) return;
        var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, topo = T.y + num(B.topo, 0);
        var R = retangulo({ x: c.cx - h * cs, z: c.cz + h * sn }, { x: c.cx + h * cs, z: c.cz - h * sn }, num(B.largura, 0));
        if (R) { R.id = "baldrame:" + c.id; R.virtual = true; R.yBase = r4(topo - num(B.altura, 0)); R.yTopo = r4(topo); R.largura = num(B.largura, 0); out.push(R); }
      });
      return { lista: out, origem: "parametro", terreno: T };
    }
    return { lista: [], origem: null, terreno: T };
  }
  /* o trecho p1→p2 (3D) cruza a viga em planta? → { b, t (fração no trecho, no meio da travessia), ponto, y (eixo do tubo lá) } */
  function cruzamentos(p1, p2, r, lista) {
    var out = [];
    arr(lista).forEach(function (b) {
      function loc(p) { var dx = p.x - b.cx, dz = p.z - b.cz; return { u: dx * b.ux + dz * b.uz, v: -dx * b.uz + dz * b.ux }; }
      var a = loc(p1), c = loc(p2), du = c.u - a.u, dv = c.v - a.v, t0 = 0, t1 = 1, H = b.hl + r, W = b.hw + r;
      function clip(pp, qq) { if (Math.abs(pp) < EPS) return qq >= -EPS; var q = qq / pp; if (pp < 0) { if (q > t1) return false; if (q > t0) t0 = q; } else { if (q < t0) return false; if (q < t1) t1 = q; } return true; }
      if (!clip(-du, a.u + H) || !clip(du, H - a.u) || !clip(-dv, a.v + W) || !clip(dv, W - a.v) || !(t1 - t0 > EPS)) return;
      /* o ponto mais ALTO do tubo dentro da faixa da viga (o tubo desce: o início da travessia) */
      var ty = p1.y >= p2.y ? t0 : t1, y = p1.y + (p2.y - p1.y) * ty;
      /* ATRAVESSA = sai de um lado da viga e chega do outro (o ramal que sai do ambiente); senão o tubo corre DENTRO da faixa
         dela (descida embutida na parede, trecho paralelo sob a parede) — esse não se resolve descendo */
      var atravessa = Math.abs(a.v) > b.hw - EPS && Math.abs(c.v) > b.hw - EPS && (a.v > 0) !== (c.v > 0);
      out.push({ b: b, t: ty, ponto: { x: r4(p1.x + (p2.x - p1.x) * ty), y: r4(y), z: r4(p1.z + (p2.z - p1.z) * ty) }, y: y, faixa: [t0, t1], atravessa: atravessa });
    });
    return out;
  }

  /* ---------------------------------------------------------- AS ESPERAS */
  function vivas(ops) {
    var K = HK(), lista = K ? K.achatar(ops) : arr(ops), apag = {};
    lista.forEach(function (o, i) { if (o && o.op === "apagar" && o.id != null) apag[o.id] = i; });
    return lista.filter(function (o, i) { return o && o.op !== "apagar" && !(o.id != null && apag[o.id] > i); });
  }
  function esperasDe(estado, avaliarFam, ops, redeId, T, par) {
    var B = BI(), R = B.rede(estado, avaliarFam), porId = {}, daRede = {};
    vivas(ops).forEach(function (o) { if (o.rede != null) daRede[o.id] = 1; });
    arr(estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { porId[t.id] = t; });
    return arr(R.continuacoes).filter(function (c) {
      var t = porId[c.trecho]; if (!t || t.sistema !== "esgoto" || daRede[t.id] || daRede[String(t.id).replace(/b$/, "")]) return false;
      return c.y <= T.y + geo(par, "tolPiso");
    }).map(function (c) { var t = porId[c.trecho]; return { trecho: t.id, ponta: c.ponta, x: c.x, y: c.y, z: c.z, dn: t.dn }; });
  }

  /* ======================================================= GERAR */
  /* ⚠ COTA DE CONTROLE (19/10/2026): a cota MÁXIMA do eixo do tubo de DN `dn` que entra na caixa de inspeção cuja tampa está em `yT`
     (pela parede, abaixo da laje da tampa com folga — ou dentro do corpo do dispositivo de PVC). É a cota de entrada que o esgoto do
     ambiente (js/hidrota.js) usa como raiz para chegar na espera já na profundidade da caixa, sem descida na espera. `L0` = a linha
     (tipoCaixa/tampa), opcional. Sem ficha de geometria → Infinity (sem limite). */
  function yMaxEntrada(par, dn, yT, L0) {
    par = par || {}; L0 = L0 || {};
    var CIr = dep("HidCI", "./hidcigeo.js"), fcr = CIr && CIr.ficha ? CIr.ficha() : null, GGr = dep("HidGeo", "./biminstgeo.js");
    var tipoCx = CIr && CIr.TIPOS && CIr.TIPOS[par.tipoCaixa || L0.tipoCaixa] ? (par.tipoCaixa || L0.tipoCaixa) : "alvenaria", tampaCx = (par.tampa || L0.tampa) === "ferro" ? "ferro" : "concreto", ehPvc = tipoCx === "pvc300";
    var escCx = !ehPvc && CIr && CIr.escolher ? CIr.escolher(tipoCx, 0, tampaCx) : null, lajeCx = escCx && escCx.desenho ? num(escCx.desenho.tampa_m, 0) : 0;
    if (!GGr) return Infinity;
    if (!ehPvc) return yT - lajeCx - geo(par, "folgaTampa") - GGr.cotasConexao("pvc_esgoto", "luva", dn).od * 0.0005;   // hid:ok mm → m (meia bolsa)
    if (!fcr) return Infinity;
    return yT - (fcr.corpo.alt + fcr.tampa.alt) * 0.001 + (fcr.corpo.alt - CIr.FORMA.colarinho) * 0.001 - GGr.cotasConexao("pvc_esgoto", "luva", dn).od * 0.0005;   // hid:ok mm → m
  }
  function gerar(e) {
    e = e || {};
    var estado0 = e.estado || {}, ops0 = arr(e.ops), par = e.parametros || {}, B = BI();
    var out = { ok: false, ops: [], caixas: [], coletor: [], ramais: [], interferencias: [], baldrames: [], avisos: [], pendencias: [], decisoes: [], normas: [] };
    function pend(chave, motivo, els, acao) { out.pendencias.push({ chave: chave, motivo: motivo, texto: motivo, elementos: arr(els), acao: acao || null }); }
    function aviso(t, els, acao) { out.avisos.push({ texto: t, elementos: arr(els), acao: acao || null }); }
    function decide(id, texto) { out.decisoes.push({ id: id, texto: texto }); }
    var L0 = arr(estado0.hidRedes).filter(function (r) { return String(r.id) === String(e.rede); })[0];
    if (!L0) { pend("rede.linha", "a linha da rede " + e.rede + " não está no modelo"); return out; }
    var redeId = String(L0.id), modo = par.baldrameModo || L0.baldrame || "por_baixo";
    /* 1) limpa o que esta linha pôs antes (acessório/anotação antes do tubo, como o kit) */
    var ordem = { anotar: 0, acessorio: 0, trecho: 1, peca: 2 }, lim = [];
    vivas(ops0).forEach(function (o) { if (o.rede === redeId && o.id != null && ordem[o.op] != null) lim.push(o); });
    lim.sort(function (a, b) { return ordem[a.op] - ordem[b.op]; });
    var limpar = lim.map(function (o) { return { op: o.op === "anotar" ? "desanotar" : "apagar", id: o.id, rede: redeId, redeParte: "limpar" }; });
    var ops = ops0.concat(limpar), estado = BE().aplicar(ops), ctx = NN().contexto();
    var parT = copia(par); if (L0.cotaTerreno != null) parT.cotaTerreno = L0.cotaTerreno;
    var T = terrenoDe(estado, parT);
    if (!T) { pend("rede.terreno", "sem paredes no modelo nem cota do terreno informada: a profundidade das caixas não tem referência"); return out; }
    var Lh = linha(L0.pontos);
    if (!(Lh.L > geo(par, "juntarCaixas"))) { pend("rede.linha", "linha da rede curta demais (" + f2(Lh.L) + " m)", [redeId]); return out; }
    var BL = baldrames(estado, parT); out.baldrames = BL.lista.map(function (b) { return { id: b.id, virtual: !!b.virtual, yBase: b.yBase, yTopo: b.yTopo }; });
    if (!BL.lista.length) pend("rede.baldrame", "nenhuma viga baldrame no modelo nem parâmetro (altura, largura e topo): a travessia do tubo não foi verificada", [redeId], { tipo: "parametro", campo: "baldrame" });

    /* 2) as esperas e onde cada uma entra na linha */
    var esperas = esperasDe(estado, e.avaliarFam, ops, redeId, T, par);
    if (!esperas.length) pend("rede.esperas", "nenhuma espera de esgoto chegou à linha (ligue os ambientes antes: \"Ligar ambiente\")", [redeId], { tipo: "ligarAmbiente" });
    var dnMin = num(ctx.consulta("es8160.coletor_dn_min", null, "valor", "rede: DN mínimo do coletor predial").valor, null);
    if (dnMin == null) pend("es8160.coletor_dn_min", "DN mínimo do coletor sem tabela: usado o maior DN que chega", [redeId]);
    var nos = [];
    function no(s, tipo) { var p = noPonto(Lh, s); var n = { s: s, x: p.x, z: p.z, tipo: tipo, esperas: [] }; nos.push(n); return n; }
    for (var i = 1; i < Lh.P.length - 1; i++) no(Lh.s[i], "mudanca");
    no(Lh.L, "saida");
    /* ⚠ PADRÃO (docs/hidro/PADRAO-IMPLANTACAO-ESGOTO.md): o ramal da espera até a linha corre pela ÁREA EXTERNA — o pé mais
       perto que não atravessa a edificação (a perpendicular do corredor entre blocos cruzava um cômodo) */
    var HIm = dep("HidImplantacao", "./hidimplantacao.js"), aceitaExt = HIm ? function (p, q) { return !HIm._int.cruzaDentro(estado0, p, q, {}); } : null;
    esperas.forEach(function (w) { var q = projetar(Lh, w, aceitaExt); w.proj = q; var n = no(q.s, "juncao"); n.esperas.push(w); });
    /* junta caixas muito perto (prioridade: saída > mudança de direção > junção) */
    var PRI = { saida: 0, mudanca: 1, juncao: 2, intermediaria: 3 };   // hid:ok ordem de prioridade das caixas
    nos.sort(function (a, b) { return a.s - b.s || PRI[a.tipo] - PRI[b.tipo]; });
    var jun = [];
    nos.forEach(function (n) {
      var u = jun[jun.length - 1];
      if (u && n.s - u.s < geo(par, "juntarCaixas")) { if (PRI[n.tipo] < PRI[u.tipo]) { u.tipo = n.tipo; u.s = n.s; u.x = n.x; u.z = n.z; } u.esperas = u.esperas.concat(n.esperas); return; }
      jun.push(n);
    });
    /* só a partir da 1ª junção (o trecho a montante dela não leva nada) */
    var iJ = -1; jun.forEach(function (n, k) { if (iJ < 0 && n.esperas.length) iJ = k; });
    if (iJ < 0) iJ = jun.length - 1;
    jun = jun.slice(iJ);
    /* intercala caixas onde a distância passa da máxima da 8160 */
    var d25 = num(ctx.consulta("es8160.inspecao", { parametro: "entre_dispositivos_max" }, "valor", "rede: distância entre caixas").valor, null);
    if (d25 == null) pend("es8160.inspecao", "distância máxima entre dispositivos de inspeção sem tabela: nenhuma caixa intercalada", [redeId]);
    var cx = [jun[0]];
    for (var k = 1; k < jun.length; k++) {
      var a = cx[cx.length - 1], b = jun[k], ds = b.s - a.s;
      if (d25 != null && ds > d25 + EPS) { var n2 = Math.ceil(ds / d25); for (var m = 1; m < n2; m++) { var sm = a.s + ds * m / n2, pm = noPonto(Lh, sm); cx.push({ s: sm, x: pm.x, z: pm.z, tipo: "intermediaria", esperas: [] }); } }
      cx.push(b);
    }

    /* 3) cotas: ramais (com a descida pela viga) e coletor caixa a caixa */
    var novas = [], nR = 0, nC = 0, nI = 0, rr = function (dn) { return raio(dn); };
    function req(cr, dn) { return cr.b.yBase - geo(par, "folgaBaldrame") - rr(dn); }
    function interf(cr, idTrecho, dn) {
      var dnC = (B.MATERIAIS.pvc_esgoto.dns || []).filter(function (d) { return d > dn; })[0] || null;
      out.interferencias.push({ viga: cr.b.id, virtual: !!cr.b.virtual, trecho: idTrecho, ponto: cr.ponto, dn: dn, camisa: dnC });
      novas.push({ op: "anotar", id: redeId + "-furo" + (++nI), x: cr.ponto.x, y: r4(cr.b.yTopo + geo(par, "folgaBaldrame")), z: cr.ponto.z, texto: "Furo em viga baldrame " + cr.b.id + ": tubo DN " + dn + " com tubo-camisa" + (dnC ? " DN " + dnC : "") + " — verificar com o projeto estrutural", rede: redeId, redeParte: "furo" });
      aviso("furo em viga: verificar com o projeto estrutural — " + idTrecho + " atravessa a viga " + cr.b.id + " em (" + f2(cr.ponto.x) + "; " + f2(cr.ponto.z) + ") com tubo-camisa" + (dnC ? " DN " + dnC : ""), [idTrecho, cr.b.id], { tipo: "parametro", campo: "baldrame", valor: "por_baixo" });
    }
    var cotaCaixa = cx.map(function () { return { entradas: [], saida: null }; });
    /* NÍVEL AUTOMÁTICO (js/hidnivel.js): a TAMPA de cada caixa no nível do ponto — piso modelado, laje/calçada do IFC, terreno
       (declive: cada caixa na cota do terreno nela) ou o nível + piso acabado padrão (aviso). A profundidade sai daí. */
    var HNr = dep("HidNivel", "./hidnivel.js");
    cx.forEach(function (c) {
      var Nv = HNr ? HNr.em(estado, c, T.y, par) : { y: T.y, fonte: "referencia", origem: T.origem };
      c.yT = Nv.y; c.nivel = Nv;
      if (Nv.aviso) aviso(Nv.aviso, [], { tipo: "parametro", campo: "pisoAcabado" });
    });
    /* a caixa é o PRODUTO (js/hidcigeo.js): a mais rasa possível = corpo + tampa; o tubo tem de chegar DENTRO do corpo dela —
       eixo no máximo no topo útil do corpo (abaixo do colarinho) menos meia bolsa. Tubo mais alto desce na espera (como o da viga) */
    var CIr = dep("HidCI", "./hidcigeo.js"), fcr = CIr && CIr.ficha ? CIr.ficha() : null, GGr = dep("HidGeo", "./biminstgeo.js");
    /* PENDÊNCIAS FINAIS (18/10/2026): o TIPO da caixa — padrão a CAIXA DE 0,60 m de alvenaria (ou pré-moldada), tampa de concreto
       (ou ferro); o dispositivo de PVC Ø 300 só como opção (parametros.tipoCaixa = "pvc300"). Na caixa de 0,60 m o tubo só tem
       de passar abaixo da laje da tampa (a espessura de desenho da composição) */
    var tipoCx = CIr && CIr.TIPOS && CIr.TIPOS[par.tipoCaixa || L0.tipoCaixa] ? (par.tipoCaixa || L0.tipoCaixa) : "alvenaria", tampaCx = (par.tampa || L0.tampa) === "ferro" ? "ferro" : "concreto", ehPvc = tipoCx === "pvc300";
    var escCx = !ehPvc && CIr && CIr.escolher ? CIr.escolher(tipoCx, 0, tampaCx) : null, lajeCx = escCx && escCx.desenho ? num(escCx.desenho.tampa_m, 0) : 0;
    function yMaxCaixa(dn, yT) { return yMaxEntrada(par, dn, yT, L0); }
    cx.forEach(function (c, ci) {
      c.id = redeId + "-ci" + (ci + 1);
      c.esperas.forEach(function (w) {
        var dn = num(w.dn, 0) || B.MATERIAIS.pvc_esgoto.dn, i = B.declMinDn("esgoto", dn) / 100, alvo = { x: c.x, z: c.z }, L = d2(w, alvo), y0 = w.y;
        var cr = cruzamentos({ x: w.x, y: y0, z: w.z }, { x: c.x, y: y0 - i * L, z: c.z }, rr(dn), BL.lista);
        var desce = 0;
        cr.forEach(function (q) { var yq = y0 - i * L * q.t; if (modo === "por_baixo" && yq > req(q, dn) + EPS) desce = Math.max(desce, yq - req(q, dn)); });
        var yMx = yMaxCaixa(dn, c.yT), descCx = chao4(y0 - desce - i * L) > yMx + EPS ? chao4(y0 - desce - i * L) - yMx : 0;
        if (descCx > EPS) { desce += descCx; decide("rede.caixas.cota", "Ramal da espera " + w.trecho + " desce " + f2(descCx) + " m na espera para entrar no CORPO da caixa de inspeção " + c.id + " (a caixa do fabricante não fica mais rasa que corpo + tampa)."); }
        var idR = redeId + "-r" + (++nR), yIni = chao4(y0 - desce), yFim = chao4(yIni - i * L);
        if (desce > EPS) novas.push({ op: "trecho", id: idR + "v", sistema: "esgoto", material: "pvc_esgoto", dn: dn, p1: { x: w.x, y: y0, z: w.z }, p2: { x: w.x, y: yIni, z: w.z }, rede: redeId, redeParte: "ramal" });
        novas.push({ op: "trecho", id: idR, sistema: "esgoto", material: "pvc_esgoto", dn: dn, p1: { x: w.x, y: yIni, z: w.z }, p2: { x: c.x, y: yFim, z: c.z }, rede: redeId, redeParte: "ramal" });
        if (modo === "atravessar") cr.forEach(function (q) { interf(q, idR, dn); });
        cotaCaixa[ci].entradas.push(yFim);
        out.ramais.push({ id: idR, espera: w.trecho, caixa: c.id, dn: dn, comprimento: r4(L), descida: r4(desce), descidaCaixa: r4(descCx), cruza: cr.map(function (q) { return q.b.id; }) });
        if (desce > EPS) decide("rede.baldrame.por_baixo", "Ramal " + idR + " (espera " + w.trecho + ") desce " + f2(desce) + " m na espera para passar " + f2(geo(par, "folgaBaldrame")) + " m abaixo da viga " + cr.map(function (q) { return q.b.id; }).join(", ") + ".");
      });
    });
    var dnCol = Math.max.apply(null, [dnMin || 0].concat(esperas.map(function (w) { return num(w.dn, 0); })));
    dnCol = (B.MATERIAIS.pvc_esgoto.dns || []).filter(function (d) { return d >= dnCol; })[0] || dnCol;
    var iC = B.declMinDn("esgoto", dnCol) / 100, yPrev = null;
    cx.forEach(function (c, ci) {
      var yArr = ci === 0 ? null : chao4(yPrev - iC * d2(cx[ci - 1], c));
      if (ci > 0) {
        /* a viga no trecho anterior: por baixo = queda na caixa de montante */
        var a = cx[ci - 1], cr = cruzamentos({ x: a.x, y: yPrev, z: a.z }, { x: c.x, y: yArr, z: c.z }, rr(dnCol), BL.lista), desce = 0;
        cr.forEach(function (q) { var yq = yPrev - iC * d2(a, c) * q.t; if (modo === "por_baixo" && yq > req(q, dnCol) + EPS) desce = Math.max(desce, yq - req(q, dnCol)); });
        if (desce > EPS) {
          yPrev = chao4(yPrev - desce); cotaCaixa[ci - 1].saida = yPrev; yArr = chao4(yPrev - iC * d2(a, c));
          decide("rede.baldrame.por_baixo", "Coletor " + a.id + " → " + c.id + ": queda de " + f2(desce) + " m na caixa " + a.id + " para passar abaixo da viga " + cr.map(function (q) { return q.b.id; }).join(", ") + ".");
        }
        /* a caixa de jusante no terreno MAIS BAIXO (declive): o coletor tem de chegar no CORPO dela — queda na caixa de montante */
        var limC = yMaxCaixa(dnCol, c.yT);
        if (yArr > limC + EPS) {
          var dq = yArr - limC; yPrev = chao4(yPrev - dq); cotaCaixa[ci - 1].saida = yPrev; yArr = chao4(yPrev - iC * d2(a, c));
          decide("rede.caixas.cota", "Coletor " + a.id + " → " + c.id + ": queda de " + f2(dq) + " m na caixa " + a.id + " para entrar no CORPO da caixa " + c.id + " (tampa a " + f2(c.yT) + " m, " + c.nivel.origem + ").");
        }
        var idC = redeId + "-c" + (++nC);
        novas.push({ op: "trecho", id: idC, sistema: "esgoto", material: "pvc_esgoto", dn: dnCol, p1: { x: a.x, y: yPrev, z: a.z }, p2: { x: c.x, y: yArr, z: c.z }, rede: redeId, redeParte: "coletor" });
        if (modo === "atravessar") cr.forEach(function (q) { interf(q, idC, dnCol); });
        out.coletor.push({ id: idC, de: a.id, para: c.id, dn: dnCol, comprimento: r4(d2(a, c)), declividade_pct: r4(iC * 100), cruza: cr.map(function (q) { return q.b.id; }) });
        cotaCaixa[ci].entradas.push(yArr);
      }
      var ent = cotaCaixa[ci].entradas;
      yPrev = ent.length ? chao4(Math.min.apply(null, ent)) : yPrev;
      cotaCaixa[ci].saida = yPrev;
    });
    /* a SAÍDA PREDIAL: da última caixa o tubo SAI pela parede de jusante, no rumo da linha, em espera ("continua") para o
       ramal até a rede pública/fossa — a caixa da saída tem entrada(s) a montante e a saída a jusante (impl-07) */
    var nU = cx.length - 1, cU = cx[nU], ySa = nU >= 0 ? cotaCaixa[nU].saida : null;
    if (cU && ySa != null && Lh.P.length >= 2) {
      var PA = Lh.P[Lh.P.length - 2], PB = Lh.P[Lh.P.length - 1], dU = d2(PA, PB) || 1, uU = { x: (PB.x - PA.x) / dU, z: (PB.z - PA.z) / dU }, Ls = geo(par, "esperaSaida");
      novas.push({ op: "trecho", id: redeId + "-saida", sistema: "esgoto", material: "pvc_esgoto", dn: dnCol, p1: { x: cU.x, y: ySa, z: cU.z }, p2: { x: r4(cU.x + uU.x * Ls), y: chao4(ySa - iC * Ls), z: r4(cU.z + uU.z * Ls) }, continua: "p2", rede: redeId, redeParte: "saida" });
    }
    /* 4) as caixas: tampa no terreno, fundo abaixo do tubo mais baixo */
    cx.forEach(function (c, ci) {
      var yT = c.yT, ys = cotaCaixa[ci].entradas.concat(cotaCaixa[ci].saida != null ? [cotaCaixa[ci].saida] : []), yMin = ys.length ? Math.min.apply(null, ys) : yT;
      var yMax = ys.length ? Math.max.apply(null, ys) : yT, prof = r4(yT - yMin + rr(dnCol) + geo(par, "fundoCaixa"));
      /* a caixa é o PRODUTO (js/hidcigeo.js, ficha do fabricante): as bocas cabem no corpo — o grupo de tubos centrado na
         altura útil do corpo (abaixo do colarinho do prolongador); não cabendo, o mais baixo no fundo e o resto pede prolongador
         com entrada (aviso da geometria) */
      var CIg = dep("HidCI", "./hidcigeo.js"), fc = ehPvc && CIg && CIg.ficha ? CIg.ficha() : null, GG = dep("HidGeo", "./biminstgeo.js");
      if (fc && GG) {   /* só o dispositivo de PVC: a caixa de 0,60 m tem o fundo onde o tubo pede (acima) */
        var od = GG.cotasConexao("pvc_esgoto", "luva", dnCol).od * 0.001, util = (fc.corpo.alt - CIg.FORMA.colarinho) * 0.001, span = yMax - yMin;   // hid:ok mm → m
        var aLow = span + od <= util ? (util - span) / 2 : od / 2 + CIg.FORMA.chanfroFundo * 0.001;   // hid:ok mm → m
        prof = r4(yT - yMin + aLow);
        /* a caixa não fica mais rasa que o produto (corpo + tampa): o tubo raso entra mais alto no corpo, ainda dentro dele */
        prof = Math.max(prof, r4((fc.corpo.alt + fc.tampa.alt) * 0.001));   // hid:ok mm → m
      }
      var opCx = { op: "peca", id: c.id, peca: "caixa_inspecao", sistema: "esgoto", x: c.x, y: yT, z: c.z, prof: prof, tipoCaixa: tipoCx, rede: redeId, redeParte: "caixa" };
      if (!ehPvc) opCx.tampa = tampaCx;
      novas.unshift(opCx);
      out.caixas.push({ id: c.id, tipo: c.tipo, x: c.x, z: c.z, s: r4(c.s), prof: prof, yTampa: yT, nivel: c.nivel ? { fonte: c.nivel.fonte, origem: c.nivel.origem } : null, esperas: c.esperas.map(function (w) { return w.trecho; }) });
    });
    var ultima = out.caixas[out.caixas.length - 1];
    if (ultima) pend("rede.ligacao_publica", "saída do coletor na caixa " + ultima.id + ": informe a posição e a cota da rede pública (ou da fossa) para o ramal predial — a última caixa fica a ≤ es8160.inspecao[ligacao_publica_max] dela", [ultima.id], { tipo: "destino", sistema: "esgoto", de: ultima.id });
    /* 5) o que foi decidido */
    var tiposCx = {}; out.caixas.forEach(function (c) { tiposCx[c.tipo] = (tiposCx[c.tipo] || 0) + 1; });
    /* a caixa é o PRODUTO da ficha (js/hidcigeo.js): o Ø dele contra o da NBR 8160 — menor, a caixa vale como PEÇA de inspeção
       (a decisão de trocar por caixa de alvenaria/concreto Ø 0,60 m é do projetista: pendência, nunca escondida) */
    var CIp = dep("HidCI", "./hidcigeo.js"), fcp = ehPvc && CIp && CIp.ficha ? CIp.ficha() : null;
    if (!ehPvc && CIp && CIp.escolher && out.caixas.length) {
      /* a CAIXA DE 0,60 m (padrão): a composição SINAPI de cada uma pela profundidade dela (e a tampa) */
      out.caixas.forEach(function (c) { var ec = CIp.escolher(tipoCx, c.prof, tampaCx); c.tipoCaixa = tipoCx; c.tampa = tampaCx; c.compra = ec ? ec.linhas.map(function (l) { return "SINAPI " + l.codigo; }) : null; if (ec) ec.avisos.forEach(function (a) { aviso("caixa " + c.id + ": " + a, [c.id]); }); });
      var ec0 = CIp.escolher(tipoCx, 0, tampaCx);
      decide("rede.caixas.tipo", "Caixas de inspeção = " + (ec0 ? ec0.nome.toLowerCase() : tipoCx) + " de 0,60 m com tampa de " + (tampaCx === "ferro" ? "ferro fundido" : "concreto") + " (decisão da coordenação, 18/10/2026: onde a NBR 8160 exige caixa de inspeção); a composição SINAPI de cada uma sai da profundidade dela (a primeira que cobre; a forma — retangular 0,60 × 0,60 ou circular Ø 0,60 — é a da composição) e o fundo leva a meia-cana no rumo da saída.");
    }
    if (fcp && out.caixas.length) {
      var dMin8160 = ctx.consulta("es.caixa_inspecao", { parametro: "Caixa cilíndrica: diâmetro interno mínimo" }, "valor", "caixa de inspeção");
      var dProd = (fcp.prolongadores[0] || { diam: fcp.corpo.diam }).diam * 0.001;   // hid:ok mm → m (o Ø da abertura = o do prolongador)
      /* o DISPOSITIVO de PVC na rede ENTERRADA: a 8160 (4.2.5.5) pede caixa de inspeção ou PV — a pendência fica, com o Corrigir */
      if (dMin8160.ok && dProd < num(dMin8160.valor, 0) - EPS) pend("rede.caixa_diametro", "as inspeções desta rede enterrada são o DISPOSITIVO de PVC Ø 300 (abertura Ø " + f2(dProd) + " m, corpo Ø " + f2(fcp.corpo.diam * 0.001) + " m — ficha " + fcp.corpo.codigo + "): na rede enterrada a NBR 8160 pede caixa de inspeção (Ø ou lado interno ≥ " + f2(num(dMin8160.valor, 0)) + " m) ou poço de visita — troque pela caixa de alvenaria de 0,60 m (Corrigir)", out.caixas.map(function (c) { return c.id; }), { tipo: "parametro", campo: "tipoCaixa", sugerido: "alvenaria" });   // hid:ok mm → m
      out.caixas.forEach(function (c) { var cp = CIp.composicao(c.prof); c.compra = cp ? [fcp.corpo.codigo].concat(cp.prolongadores.map(function (p) { return p.codigo + (p.corte ? " (cortado " + p.comprimento_mm + " mm)" : ""); })).concat([fcp.tampa.codigo]) : null; });
      decide("rede.caixas.produto", "Caixa de inspeção = o produto da ficha (Amanco Wavin FTC000003 p.8–10): corpo " + fcp.corpo.codigo + " Ø " + fcp.corpo.diam + " × " + fcp.corpo.alt + " mm, prolongadores " + fcp.prolongadores.map(function (p) { return p.codigo + " (" + p.total + " mm)"; }).join(" / ") + " cortados na obra até o terreno e tampa com porta-tampa " + fcp.tampa.codigo + " (" + fcp.tampa.ladoBase + " mm, h " + fcp.tampa.alt + " mm) rente ao terreno; as bocas centradas na altura útil do corpo. Tigre equivalente: " + fcp.tigre.corpo + " / " + fcp.tigre.prolongadorSemEntrada + " / " + fcp.tigre.tampa + " (sem as cotas do corpo no acervo).");
    }
    /* POÇO DE VISITA (decisão da coordenação, 18/10/2026, noite): a caixa mais funda que a da NBR 8160 (5.1.5.3) vira PV
       automaticamente — o motor da caixa (js/hidcigeo.js) escolhe a base, o acréscimo, a chaminé e o tampão de ferro fundido */
    if (CIp && CIp.ehPV && CIp.escolherPV) {
      var pvs = out.caixas.filter(function (c) { return CIp.ehPV(c.prof); });
      pvs.forEach(function (c) {
        var ep = CIp.escolherPV(tipoCx, c.prof); if (!ep) return;
        c.pv = true; c.tampa = "ferro"; c.compra = ep.linhas.map(function (l) { return "SINAPI " + l.codigo + (l.unidadeQto === "m" ? " × " + f2(l.qtd) + " m" : ""); });
        if (ehPvc) ep.avisos.forEach(function (a) { aviso("caixa " + c.id + ": " + a, [c.id]); });
      });
      if (pvs.length) { var nPV = CIp.normaPV(); decide("rede.caixas.pv", pvs.length + " inspeção(ões) com mais de " + f2(num(nPV.pvAcima, 0)) + " m de profundidade = POÇO DE VISITA (NBR 8160 5.1.5.3, p.19): balão Ø ≥ " + f2(num(nPV.dimMin, 0)) + " m pela menor base SINAPI que cobre, laje de redução, chaminé Ø " + f2(num(nPV.chamineMin, 0)) + " m até o terreno, degraus e tampão de ferro fundido; orçado por base + acréscimo (m) + chaminé (m) + tampão (" + pvs.map(function (c) { return c.id + " " + f2(c.prof) + " m"; }).join(", ") + ")."); }
    }
    decide("rede.caixas", "Caixas de inspeção: " + out.caixas.length + " — " + Object.keys(tiposCx).map(function (k) { return tiposCx[k] + " " + ({ saida: "na saída", mudanca: "em mudança de direção", juncao: "em junção", intermediaria: "intercalada(s) pela distância máxima" + (d25 != null ? " de " + f2(d25) + " m" : "") })[k]; }).join(", ") + "; tampa no terreno (" + T.origem + ").");
    decide("rede.coletor", "Coletor DN " + dnCol + " em PVC esgoto (série normal, NBR 5688) a " + f2(iC * 100) + " % (declividade mínima do DN), de montante para a saída; " + out.ramais.length + " ramal(is) perpendicular(es) à linha, cada um numa caixa.");
    decide("rede.baldrame", BL.lista.length ? "Viga baldrame (" + (BL.origem === "modelo" ? "modelo estrutural" : "parâmetro sob as paredes do térreo") + "): " + (modo === "por_baixo" ? "o tubo passa POR BAIXO, com " + f2(geo(par, "folgaBaldrame")) + " m de folga (critério do projetista) — padrão" : "o tubo ATRAVESSA com tubo-camisa; " + out.interferencias.length + " furo(s) marcado(s) para o projeto estrutural") + "." : "Sem viga baldrame no modelo nem parâmetro: travessia não verificada (pendência).");
    ctx.pendencias().forEach(function (p) { pend(p.chave, p.motivo, [redeId]); });
    out.normas = ctx.normas();
    out.ops = limpar.concat(novas);
    out.terreno = T.y; out.modo = modo; out.ok = !!novas.length;
    return out;
  }

  var HidRede = { VERSAO: 1, GEO_REDE: GEO_REDE, gerar: gerar, yMaxEntrada: yMaxEntrada, baldrames: baldrames, cruzamentos: cruzamentos, terrenoDe: terrenoDe, _int: { linha: linha, projetar: projetar, esperasDe: esperasDe, vivas: vivas } };
  global.HidRede = HidRede;
  if (typeof module !== "undefined" && module.exports) module.exports = HidRede;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
