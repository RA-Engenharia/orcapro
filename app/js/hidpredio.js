/* =====================================================================
 * hidpredio.js — PROJETO INTELIGENTE etapa 3: REPLICAR UNIDADE (pavimento-tipo) e PRUMADAS (motor PURO, ES5, Node-testável).
 * 17/10/2026.
 *
 * Pedido do Rogério: "o pavimento-tipo é replicado" — copiar a unidade (o apartamento) para os outros pavimentos e ESPELHAR a
 * vizinha; as prumadas (tubo de queda, coluna de ventilação, coluna de água fria) alinhadas no shaft entre os pavimentos; os
 * ramais de cada unidade ligados sozinhos a elas; no térreo o tubo de queda desce até a rede (subcoletor e caixas).
 *
 *   HidPredio.replicar({ estado, avaliarFam, ops, unidade: [ids dos aparelhos], eixo: {p1:{x,z}, p2:{x,z}} | null,
 *                        pavimentos: [cotas] | null, parametros, id })
 *     → { ok, ops (o LOTE), unidades[], prumadas[], ambientes[], avisos[], pendencias[], decisoes[], normas[] }
 *
 * COMO MONTA:
 *  1. a unidade = os aparelhos dados (os do kit — válvula, torneira — vêm junto pelo kit); o piso dela = o da bacia;
 *  2. os PAVIMENTOS = as cotas de base das paredes (a arquitetura do pavimento-tipo já está no modelo) acima do piso da unidade,
 *     na planta dela; cada um recebe a CÓPIA (e, com eixo, a ESPELHADA — posição e frente refletidas pelo eixo);
 *  3. o SHAFT = atrás da parede molhada, no eixo da bacia (parametros.shaft troca): tubo de queda no eixo, coluna de água fria
 *     para o lado dos pontos de água, coluna de ventilação para o outro; a espelhada tem o shaft espelhado;
 *  4. PRUMADAS por shaft: TQ do pé (abaixo do piso térreo, passa sob a viga baldrame) até o terminal acima da cobertura
 *     (ventilação primária); o PÉ sai na horizontal até a espera fora da obra (a linha da rede o recolhe numa caixa); a coluna
 *     de ventilação nasce no TQ abaixo do 1º ramal (meia altura do térreo) e sai acima da cobertura; a coluna de água fria
 *     desce do barrilete (topo da obra, ponta "continua") até a ligação mais baixa. DN do TQ pela Tabela 6 da 8160 (UHC,
 *     até/mais de 3 pavimentos; ≥ o maior ramal), da coluna de ventilação pela Tabela 2 (DN do TQ, UHC, comprimento);
 *  5. o KIT de cada aparelho copiado e o "Ligar ambiente" de cada unidade (o térreo vai à espera própria; os andares ao TQ; a
 *     ventilação de todos à coluna de ventilação); a válvula de descarga liga o ramal exclusivo dela à coluna de água fria.
 * ⚠ Nenhum número de norma aqui: DN, declividade, terminal e UHC vêm do HidNormas; os "hid:ok" são geometria/critério de
 *   desenho, declarados e trocáveis em parametros.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function HA() { return dep("HidAmbiente", "./hidambiente.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function HRd() { return dep("HidRede", "./hidrede.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var EPS = 1e-6;   // hid:ok
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function raio(dn) { return dn / 1000 / 2; }   /* DN em mm → raio em m */

  /* ⚠ GEOMETRIA / CRITÉRIO DE PROJETO (não é norma) — trocável em parametros, declarado no memorial */
  var GEO_PREDIO = {
    recuoShaft: 0.10,      // hid:ok das faces das paredes do canto ao EIXO do tubo de queda (meio DN 100 + folga de montagem)
    buscaLado: 1.50,       // hid:ok até onde procura a parede lateral (o canto do shaft) ao longo da parede de trás
    meiaBacia: 0.20,       // hid:ok meia largura da bacia quando a família não diz (só para afastar o shaft dela)
    passoShaft: 0.10,      // hid:ok entre dois lugares do shaft testados
    lugaresShaft: 12,      // hid:ok quantos lugares do shaft a sonda testa (cada um = um "ligar" de um andar)
    afastPrumadas: 0.20,   // hid:ok entre eixos das prumadas no shaft (DN 100 ao lado de DN 75/50 com folga de montagem)
    peQueda: 0.40,         // hid:ok o pé do tubo de queda abaixo do piso térreo (curva de raio longo + subcoletor enterrado)
    peMin: 0.50,           // hid:ok comprimento mínimo do pé até a espera, quando o shaft já está fora da obra
    buscaParede: 0.80,     // hid:ok até onde procura a parede atrás da bacia (m)
    passoBusca: 0.01,      // hid:ok passo da busca
    tolNivel: 0.10,        // hid:ok paredes com a base a menos disto = o mesmo pavimento
    raioUnidade: 4.0,      // hid:ok planta da unidade: aparelhos ± isto (as paredes do pavimento-tipo ficam nela)
    margemNo: 0.05,        // hid:ok
    acimaUltimoPiso: 0.30, // hid:ok o TQ passa o piso do último pavimento e vira ventilador primário (o ramal mais alto entra abaixo do piso)
    tocoAF: 0.10,          // hid:ok toco da coluna de água fria abaixo da ligação mais baixa (tampão / registro de limpeza)
    afBase: 0.10,          // hid:ok a coluna de água fria nasce provisória a isto acima do piso térreo e é aparada na ligação mais baixa
    registroAcima: 0.20,   // hid:ok face de baixo do registro da coluna acima do topo da obra (laje de cobertura): montagem e acesso no barrilete
    tocoBarrilete: 0.15    // hid:ok espera da coluna acima do registro (ponta "continua" que o barrilete recebe)
  };
  function geo(par, k) { return par && par[k] != null && isFinite(Number(par[k])) ? Number(par[k]) : GEO_PREDIO[k]; }

  /* ---------------------------------------------------------- ESPELHO */
  function espelharP(p, eixo) {
    if (!eixo) return { x: p.x, z: p.z };
    var a = eixo.p1, b = eixo.p2, dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > EPS)) return { x: p.x, z: p.z };
    var ux = dx / L, uz = dz / L, vx = p.x - a.x, vz = p.z - a.z, t = vx * ux + vz * uz;
    return { x: r4(a.x + 2 * t * ux - vx), z: r4(a.z + 2 * t * uz - vz) };
  }
  /* a FRENTE do aparelho (sen r, cos r) refletida pelo eixo → o novo rotY */
  function espelharRot(rot, eixo) {
    if (!eixo) return rot;
    var dx = eixo.p2.x - eixo.p1.x, dz = eixo.p2.z - eixo.p1.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > EPS)) return rot;
    var ux = dx / L, uz = dz / L, fx = Math.sin(rot), fz = Math.cos(rot), k = fx * ux + fz * uz;
    return r4(Math.atan2(2 * k * ux - fx, 2 * k * uz - fz));
  }

  /* ---------------------------------------------------------- PAVIMENTOS */
  function paredesTodas(estado) {
    return arr(estado.caixas).filter(function (c) { return c && c.tipo === "parede" && !c.shaft; })   /* N23: o fechamento do shaft não é parede do pavimento */.map(function (c) {
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, alt = num(c.altura, 0);
      return { id: c.id, p1: { x: c.cx - h * cs, z: c.cz + h * sn }, p2: { x: c.cx + h * cs, z: c.cz - h * sn }, espessura: num(c.espessura, 0), base: r4(c.cy - alt / 2), altura: alt, topo: r4(c.cy + alt / 2) };
    });
  }
  function pavimentosDe(estado, fams, y0, par) {
    var cx = 0, cz = 0; fams.forEach(function (f) { cx += num(f.x, 0); cz += num(f.z, 0); }); cx /= fams.length || 1; cz /= fams.length || 1;
    var R = geo(par, "raioUnidade"), tol = geo(par, "tolNivel"), niveis = [];
    paredesTodas(estado).forEach(function (w) {
      var m = { x: (w.p1.x + w.p2.x) / 2, z: (w.p1.z + w.p2.z) / 2 };
      if (d2(m, { x: cx, z: cz }) > R || w.base < y0 - tol) return;
      if (!niveis.some(function (n) { return Math.abs(n - w.base) <= tol; })) niveis.push(w.base);
    });
    niveis.sort(function (a, b) { return a - b; });
    if (!niveis.length || Math.abs(niveis[0] - y0) > tol) niveis.unshift(y0); else niveis[0] = y0;
    return niveis;
  }

  /* ---------------------------------------------------------- SHAFT */
  /* os lugares do SHAFT, do melhor para o pior: ao longo da parede LATERAL mais perto da bacia (por dentro do cômodo, a
     recuoShaft dela), começando no canto com a parede de trás e afastando a cada passoShaft; sem parede lateral, ao longo da
     de trás, a partir do lado da bacia. Cada lugar = tubo de queda + coluna de ventilação + coluna de água fria enfileiradas.
     ⚠ Atrás da parede molhada (fora do cômodo) o ramal dos andares não chega: sobre laje a parede desce o enchimento (passar
     por baixo dela é furar a base da alvenaria). ⚠ Colado na bacia o ramal dela e o da caixa sifonada não cabem até o TQ — por
     isso a sonda do replicar escolhe o 1º lugar em que o pavimento-tipo traça de verdade. */
  function shaftCandidatos(estado, avaliarFam, fams, par) {
    var K = HK(), bac = fams.filter(function (f) { return /^bacia/.test(String(K.tipoDaFamilia(f.famId, f.tipoId) || "")); })[0];
    if (!bac) return { erro: "a unidade não tem bacia sanitária: informe o shaft (parametros.shaft)", lista: [] };
    var r = num(bac.rotY, 0), b = { x: -Math.sin(r), z: -Math.cos(r) }, y = num(bac.y, 0) + geo(par, "margemNo") * 2, w = null;
    var O = { x: num(bac.x, 0), z: num(bac.z, 0) };
    for (var t = 0; t <= geo(par, "buscaParede") + EPS && !w; t += geo(par, "passoBusca")) w = K._int.paredeDe(estado, { x: O.x + b.x * t, z: O.z + b.z * t }, y);
    if (!w) return { erro: "nenhuma parede atrás da bacia " + bac.id + " (até " + f2(geo(par, "buscaParede")) + " m): informe o shaft (parametros.shaft)", lista: [] };
    var dx = w.p2.x - w.p1.x, dz = w.p2.z - w.p1.z, L = Math.sqrt(dx * dx + dz * dz), u = { x: dx / L, z: dz / L };
    var tt = (O.x - w.p1.x) * u.x + (O.z - w.p1.z) * u.z, eixoW = { x: w.p1.x + u.x * tt, z: w.p1.z + u.z * tt }, face = { x: eixoW.x - b.x * w.esp / 2, z: eixoW.z - b.z * w.esp / 2 };
    var fr = { x: -b.x, z: -b.z }, rc = geo(par, "recuoShaft"), a = geo(par, "afastPrumadas"), ps = geo(par, "passoShaft"), lado = null, lista = [];
    /* a parede lateral mais perto (os dois lados), medida a recuoShaft da de trás */
    [1, -1].forEach(function (sg) {
      for (var d = 0; d <= geo(par, "buscaLado") + EPS; d += geo(par, "passoBusca")) {
        var q = { x: face.x + fr.x * rc + u.x * sg * d, z: face.z + fr.z * rc + u.z * sg * d }, wl = K._int.paredeDe(estado, q, y);
        if (wl && wl.id !== w.id) { if (!lado || d < lado.d) lado = { sg: sg, d: d, w: wl }; return; }
      }
    });
    function P(o, v, k) { return { x: r4(o.x + v.x * k), z: r4(o.z + v.z * k) }; }
    if (lado) {
      /* o eixo das prumadas corre paralelo à parede lateral, a rc da face dela; a profundidade útil = até a parede da frente */
      var cn = P(face, u, lado.sg * lado.d), base = P(cn, { x: -u.x * lado.sg, z: -u.z * lado.sg }, rc), prof = 0;
      for (var dd = rc; dd <= geo(par, "buscaLado") + EPS; dd += geo(par, "passoBusca")) { var wq = K._int.paredeDe(estado, P(base, fr, dd), y); if (wq && wq.id !== w.id && wq.id !== lado.w.id) { prof = dd; break; } prof = dd; }
      for (var s0 = rc; s0 + 2 * a <= prof - rc + EPS; s0 += ps) {
        /* o TQ na frente; as colunas atrás dele (para o canto), ou à frente quando não cabem */
        var S = P(base, fr, s0 + 2 * a);
        lista.push({ tq: S, cv: P(S, fr, -a), af: P(S, fr, -2 * a), parede: w.id, onde: "ao longo da parede " + lado.w.id + " (canto com a " + w.id + "), a " + f2(s0 + 2 * a) + " m da parede de trás", atras: b, bacia: bac.id });
      }
    }
    /* ao longo da parede de trás, do lado da bacia oposto aos pontos de água */
    var sAF = 0, nAF = 0;
    fams.forEach(function (f) { K._int.conectores(avaliarFam, f).forEach(function (c) { if (c.sistema === "agua_fria") { sAF += (c.x - O.x) * u.x + (c.z - O.z) * u.z; nAF++; } }); });
    var sg2 = nAF && sAF / nAF > 0 ? -1 : 1, av = avaliarFam ? avaliarFam(bac.famId, bac.tipoId, bac.inst || {}) : null, meia = av && av.caixa ? Math.max(Math.abs(num(av.caixa.x0, 0)), Math.abs(num(av.caixa.x1, 0))) : geo(par, "meiaBacia");
    var v2 = { x: u.x * sg2, z: u.z * sg2 };
    for (var k = 0; k < geo(par, "lugaresShaft"); k++) {
      var S2 = P(P(face, fr, rc), v2, meia + rc + 2 * a + k * ps);
      if (lado && d2(S2, O) > d2(P(face, u, lado.sg * lado.d), O) + EPS) break;   /* não passa da parede lateral */
      lista.push({ tq: S2, cv: P(S2, v2, -a), af: P(S2, v2, -2 * a), parede: w.id, onde: "contra a parede " + w.id + ", ao lado da bacia", atras: b, bacia: bac.id });
    }
    return { lista: lista.slice(0, geo(par, "lugaresShaft")) };
  }
  function espelharShaft(sh, eixo) {
    var t0 = espelharP(sh.tq, eixo), t1 = sh.atras ? espelharP({ x: sh.tq.x + sh.atras.x, z: sh.tq.z + sh.atras.z }, eixo) : null;
    return { tq: t0, af: espelharP(sh.af, eixo), cv: espelharP(sh.cv, eixo), parede: sh.parede, onde: sh.onde, atras: t1 ? { x: r4(t1.x - t0.x), z: r4(t1.z - t0.z) } : null, espelhado: true };
  }

  /* ---------------------------------------------------------- LIMPEZA (refazer = idempotente) */
  function apagadosDepois(lista) { var a = {}; lista.forEach(function (o, i) { if (o && (o.op === "apagar" || o.op === "desanotar") && o.id != null) a[o.id] = i; }); return a; }
  function limpeza(ops, id) {
    var K = HK(), lista = K.achatar(ops), apag = apagadosDepois(lista), copiados = {}, ambs = {}, vivos = {}, ordem = { acessorio: 0, trecho: 1, peca: 2, familia: 3, anotar: 4, criar: 5 }, out = [];   // hid:ok ordem de remoção (criar = o shaft das prumadas, N23)
    lista.forEach(function (o, i) { if (o && o.predio === id && o.predioParte === "copia" && o.op === "familia" && !(apag[o.id] > i)) { copiados[String(o.id)] = 1; ambs["amb" + o.id] = 1; } });
    lista.forEach(function (o, i) {
      if (!o || o.id == null || o.op === "apagar" || o.op === "desanotar" || ordem[o.op] == null || apag[o.id] > i) return;
      if (o.predio === id || (o.kit != null && copiados[String(o.kit)]) || (o.amb != null && ambs[String(o.amb)])) vivos[o.id] = o.op;
    });
    Object.keys(vivos).sort(function (a, b) { return ordem[vivos[a]] - ordem[vivos[b]]; }).forEach(function (k) { out.push({ op: vivos[k] === "anotar" ? "desanotar" : "apagar", id: k, predio: id, predioParte: "limpar" }); });
    return out;
  }

  /* ======================================================= REPLICAR */
  function replicar(e) {
    e = e || {};
    var par = e.parametros || {}, id = String(e.id || "predio1"), ops0 = arr(e.ops), avaliarFam = e.avaliarFam;
    var out = { ok: false, id: id, ops: [], unidades: [], prumadas: [], ambientes: [], avisos: [], pendencias: [], decisoes: [], normas: [] };
    function pend(chave, motivo, els, acao) { out.pendencias.push({ chave: chave, motivo: motivo, texto: motivo, elementos: arr(els), acao: acao || null }); }
    function aviso(t, els, acao) { out.avisos.push({ texto: t, elementos: arr(els), acao: acao || null }); }
    function decide(idD, t) { var ja = out.decisoes.filter(function (d) { return d.id === idD; })[0]; if (ja) { ja.texto += " " + t; return; } out.decisoes.push({ id: idD, texto: t }); }
    var K = HK(), A = HA(), B = BI(), H = HR(), Rd = HRd(), N = NN();
    if (!K || !A || !B || !H || !BE() || !N) { pend("predio.motores", "motores não carregados (HidKit, HidAmbiente, BimInst, HidRota, BimEdit, HidNormas)"); return out; }
    var ctx = N.contexto();
    var acc = limpeza(ops0, id);
    function est() { return BE().aplicar(acc.length ? ops0.concat([{ op: "lote", id: "previa-" + id, ops: acc }]) : ops0); }
    function opsAgora() { return ops0.concat([{ op: "lote", id: "previa-" + id, ops: acc.slice() }]); }
    var st = est();

    /* 1) a UNIDADE */
    var famsBase = arr(e.unidade).map(function (u) { return arr(st.familias).filter(function (f) { return String(f.id) === String(u); })[0]; }).filter(function (f) { return f && K.tipoDaFamilia(f.famId, f.tipoId); });
    if (!famsBase.length) { pend("predio.unidade", "selecione os aparelhos da unidade (o apartamento) a replicar"); return out; }
    var bac0 = famsBase.filter(function (f) { return /^bacia/.test(String(K.tipoDaFamilia(f.famId, f.tipoId) || "")); })[0] || famsBase[0];
    var P0 = K._int.pisoDe(st, avaliarFam, bac0, null); if (!P0.ok) { pend("predio.piso", P0.motivo, [bac0.id]); return out; }
    var y0 = P0.y;

    /* 2) PAVIMENTOS e variantes (cópia, espelhada) */
    var pavs = arr(e.pavimentos).length ? arr(e.pavimentos).map(function (v) { return r4(num(v, 0)); }).sort(function (a, b) { return a - b; }) : pavimentosDe(st, famsBase, y0, par);
    if (Math.abs(pavs[0] - y0) > geo(par, "tolNivel")) pavs.unshift(y0);
    var eixo = e.eixo && e.eixo.p1 && e.eixo.p2 ? { p1: { x: num(e.eixo.p1.x, 0), z: num(e.eixo.p1.z, 0) }, p2: { x: num(e.eixo.p2.x, 0), z: num(e.eixo.p2.z, 0) } } : null;
    if (pavs.length < 2 && !eixo) { pend("predio.pavimentos", "nenhum outro pavimento com paredes na planta da unidade e nenhum eixo de espelho: modele as paredes do pavimento-tipo (ou escolha o eixo)", famsBase.map(function (f) { return f.id; })); return out; }
    var unidades = [{ id: "p0", k: 0, y: y0, esp: false, base: true, fams: famsBase.map(function (f) { return String(f.id); }) }];
    pavs.forEach(function (y, k) {
      if (k > 0) unidades.push({ id: "p" + k, k: k, y: y, esp: false, fams: [] });
      if (eixo) unidades.push({ id: "p" + k + "e", k: k, y: y, esp: true, fams: [] });
    });
    unidades.forEach(function (u) {
      if (u.base) return;
      famsBase.forEach(function (f) {
        var q = espelharP({ x: num(f.x, 0), z: num(f.z, 0) }, u.esp ? eixo : null), nid = u.id + "-" + f.id;
        var o = { op: "familia", id: nid, famId: f.famId, tipoId: f.tipoId, x: q.x, y: r4(num(f.y, 0) - y0 + u.y), z: q.z, rotY: espelharRot(num(f.rotY, 0), u.esp ? eixo : null), inst: copia(f.inst || {}), predio: id, predioParte: "copia", predioUn: u.id };
        acc.push(o); u.fams.push(nid);
      });
    });
    decide("predio.unidades", "Unidade " + famsBase.map(function (f) { return f.id; }).join(", ") + " (piso " + f2(y0) + " m) replicada em " + (pavs.length - 1) + " pavimento(s) acima (" + pavs.slice(1).map(f2).join("; ") + " m)" + (eixo ? " e ESPELHADA pelo eixo (" + f2(eixo.p1.x) + "; " + f2(eixo.p1.z) + ") – (" + f2(eixo.p2.x) + "; " + f2(eixo.p2.z) + ") em todos os pavimentos" : "") + ": " + (unidades.length - 1) + " unidade(s) nova(s).");
    st = est();

    /* 3) KITS dos aparelhos copiados (não dependem do shaft) */
    unidades.forEach(function (u) {
      if (u.base) return;
      u.fams.forEach(function (fid) {
        var g = K.gerar({ estado: st, avaliarFam: avaliarFam, famInst: fid, parametros: par });
        g.pendencias.forEach(function (p) { pend(p.chave, fid + ": " + p.motivo, [fid]); });
        if (g.ops.length) { g.ops.forEach(function (o) { acc.push(o); }); st = est(); }
      });
    });

    /* 4) PRUMADAS de um grupo (um shaft): as ops; as decisões/pendências só quando "valer" (a sonda do shaft não registra) */
    var Td = Rd ? Rd.terrenoDe(st, par) : null, terreno = Td ? Td.y : y0;
    var topos = arr(st.caixas).filter(function (c) { return c && (c.tipo === "parede" || c.tipo === "laje"); }).map(function (c) { return c.cy + num(c.altura, 0) / 2; });
    var topoObra = topos.length ? r4(Math.max.apply(null, topos)) : r4(pavs[pavs.length - 1] + K._int.geo(null, "peDireito"));
    var NRt = { terminal: function (p, uso) { var c = ctx.consulta("es8160.terminal_ventilacao", { parametro: p }, "valor", uso); return c.ok ? num(c.valor, null) : null; } };
    var topoV = A._int.topoVentilacao(st, pavs[pavs.length - 1], K._int.tetoDe(st, famsBase[0], pavs[pavs.length - 1]), NRt);
    if (topoV.pend) pend(topoV.pend.chave, topoV.pend.motivo, [id]);
    var yTopo = r4(topoV.y), tbEs = ctx.linhas("es.tubo_queda", null, "tubo de queda"), tbCv = ctx.linhas("es.coluna_ventilacao", null, "coluna de ventilação");
    var iPe = null, pvcEs = B.MATERIAIS.pvc_esgoto, pvcAf = B.MATERIAIS.pvc_soldavel, acl = ctx.consulta("es8160.ventilacao_regras", { parametro: "aclive_min_pct" }, "valor", "ventilação: aclive");
    var ac = acl.ok ? num(acl.valor, 0) / 100 : 0;
    var BL = Rd ? Rd.baldrames(st, par) : { lista: [] }, modo = par.baldrameModo === "atravessar" ? "atravessar" : "por_baixo";
    var paredesT = A._int.noPavimento(H.obstaculosDoBim(st, null), terreno, par).paredes;
    var yJ = pavs.length > 1 ? r4(terreno + (pavs[1] - terreno) / 2) : null;
    function prumadasGrupo(G, valer) {
      function D(i, t) { if (valer) decide(i, t); }
      function Pn(c, m, els, acao) { if (valer) pend(c, m, els, acao); }
      function Av(t, els, acao) { if (valer) aviso(t, els, acao); }
      var acima = G.unidades.filter(function (u) { return u.y > terreno + geo(par, "tolNivel"); });
      if (!acima.length) { if (G.unidades.length && valer) D("predio.sem_prumada", "Unidade(s) " + G.unidades.map(function (u) { return u.id; }).join(", ") + " só no térreo: sem tubo de queda (cada uma vai à rede pela espera própria)."); return null; }
      /* UHC servido pelo TQ e o maior ramal (a bacia: o DN do tubo de ligação) */
      var uhc = 0, dnMax = 0, nPav = {};
      acima.forEach(function (u) {
        nPav[u.k] = 1;
        u.fams.forEach(function (fid) {
          var f = arr(st.familias).filter(function (x) { return String(x.id) === fid; })[0] || famsBase.filter(function (x) { return u.base && String(x.id) === fid; })[0]; if (!f) return;
          var tipo = K.tipoDaFamilia(f.famId, f.tipoId), c = ctx.consulta("es.aparelhos", { aparelho: tipo }, "uhc", "tubo de queda: UHC de " + tipo); if (c.ok) uhc += num(c.valor, 0);
          K._int.conectores(avaliarFam, f).forEach(function (q) { if (q.sistema === "esgoto") dnMax = Math.max(dnMax, num(q.dn, 0)); });
        });
      });
      /* Tabela 6 (derivada): a linha "até N pavimentos" (pavimentos_max numérico ≥ np) ou a "mais de" ("*") */
      var np = Object.keys(nPav).length;
      var faixa = arr(tbEs).filter(function (l) { return l.pavimentos_max !== "*" && num(l.pavimentos_max, -1) >= np; }).length ? function (l) { return l.pavimentos_max !== "*" && num(l.pavimentos_max, -1) >= np; } : function (l) { return l.pavimentos_max === "*"; };
      var lin = arr(tbEs).filter(function (l) { return faixa(l) && num(l.uhc_max, -1) >= uhc && num(l.dn, 0) >= dnMax; }).sort(function (a, b) { return a.dn - b.dn; })[0];
      if (!lin) { Pn("es.tubo_queda", "DN do tubo de queda " + G.id + " sem linha na Tabela 6 para " + uhc + " UHC", [G.id]); return null; }
      var dnTQ = (pvcEs.dns || []).filter(function (d) { return d >= lin.dn; })[0] || lin.dn;
      iPe = B.declMinDn("esgoto", dnTQ) / 100;
      /* o PÉ: horizontal do eixo do TQ até a espera fora da obra (o lado que olha a linha da rede) */
      var S = G.sh.tq, E = A._int.esperaFora(paredesT, S, par, st.hidRedes) || { x: S.x + G.sh.atras.x * geo(par, "peMin"), z: S.z + G.sh.atras.z * geo(par, "peMin") };
      if (d2(S, E) < geo(par, "peMin")) { var vx = E.x - S.x, vz = E.z - S.z, Lv = Math.sqrt(vx * vx + vz * vz); if (!(Lv > EPS)) { vx = (G.sh.atras || { x: 0, z: -1 }).x; vz = (G.sh.atras || { x: 0, z: -1 }).z; Lv = 1; } E = { x: r4(S.x + vx / Lv * geo(par, "peMin")), z: r4(S.z + vz / Lv * geo(par, "peMin")) }; }
      var yPe = r4(terreno - geo(par, "peQueda")), Lpe = d2(S, E);
      var cr = Rd ? Rd.cruzamentos({ x: S.x, y: yPe, z: S.z }, { x: E.x, y: yPe - Lpe * iPe, z: E.z }, raio(dnTQ), BL.lista).filter(function (q) { return q.atravessa; }) : [];
      if (cr.length && modo === "por_baixo") {
        var need = Math.min.apply(null, cr.map(function (q) { return q.b.yBase - Rd.GEO_REDE.folgaBaldrame - raio(dnTQ) + iPe * d2(S, q.ponto); }));
        if (need < yPe) { yPe = r4(need); D("predio.baldrame", "Pé do tubo de queda " + G.id + " a " + f2(yPe) + " m: passa POR BAIXO da viga baldrame " + cr.map(function (q) { return q.b.id; }).join(", ") + " com " + f2(Rd.GEO_REDE.folgaBaldrame) + " m de folga."); }
      }
      var pid = G.id, novas = [];
      /* o TQ (esgoto) vai até o piso do último pavimento (acima do ramal mais alto); dali para cima é o VENTILADOR PRIMÁRIO
         (sistema ventilação, mesmo DN) até o terminal — o HidES confere a ventilação primária pelo trecho que sai do topo */
      var yVP = r4(pavs[pavs.length - 1] + geo(par, "acimaUltimoPiso"));
      novas.push({ op: "trecho", id: pid + "-tq", sistema: "esgoto", material: "pvc_esgoto", dn: dnTQ, p1: { x: S.x, y: yVP, z: S.z }, p2: { x: S.x, y: yPe, z: S.z }, continua: "p1", predio: id, predioParte: "tq" });
      /* FRENTE H3 (20/10/2026): o TERMINAL DE VENTILAÇÃO (a peça do produto, como no ambiente: js/hidambiente.js) no topo do
         ventilador primário e da coluna — antes as duas terminavam em ponta aberta ("continua") acima da cobertura */
      function terminal(tid, dn, P0) {
        var pc = B.PECAS && B.PECAS.terminal_ventilacao;
        if (pc && arr(pc.dns).indexOf(String(dn)) >= 0) { novas.push({ op: "peca", id: tid, peca: "terminal_ventilacao", sistema: "ventilacao", dn: String(dn), x: r4(P0.x), y: r4(P0.y), z: r4(P0.z), predio: id, predioParte: "terminal" }); return true; }
        pend("predio.terminal", "terminal de ventilação DN " + dn + " sem peça no catálogo: a ponta " + tid + " ficou aberta", [tid]); return false;
      }
      var opVP = { op: "trecho", id: pid + "-vp", sistema: "ventilacao", material: "pvc_esgoto", dn: dnTQ, p1: { x: S.x, y: yVP, z: S.z }, p2: { x: S.x, y: yTopo, z: S.z }, continua: "ambos", predio: id, predioParte: "ventilador_primario" };
      novas.push(opVP);
      if (terminal(pid + "-vp-terminal", dnTQ, opVP.p2)) opVP.continua = "p1";
      novas.push({ op: "trecho", id: pid + "-pe", sistema: "esgoto", material: "pvc_esgoto", dn: dnTQ, p1: { x: S.x, y: yPe, z: S.z }, p2: { x: r4(E.x), y: r4(yPe - Lpe * iPe), z: r4(E.z) }, continua: "p2", predio: id, predioParte: "pe" });
      if (cr.length && modo === "atravessar") cr.forEach(function (q, i) {
        novas.push({ op: "anotar", id: pid + "-furo" + (i + 1), x: q.ponto.x, y: r4(q.b.yTopo + Rd.GEO_REDE.folgaBaldrame), z: q.ponto.z, texto: "Furo em viga baldrame " + q.b.id + ": pé do tubo de queda DN " + dnTQ + " com tubo-camisa — verificar com o projeto estrutural", predio: id, predioParte: "furo" });
        Av("furo em viga: verificar com o projeto estrutural (pé do tubo de queda " + pid + " na viga " + q.b.id + ")", [pid + "-pe"], { tipo: "parametro", campo: "baldrame" });
      });
      /* COLUNA DE VENTILAÇÃO: nasce no TQ abaixo do 1º ramal (meia altura do térreo), sobe ao lado e sai acima da cobertura */
      var C = G.sh.cv, dnCV = null, Lcv = yTopo - yJ;
      var linV = arr(tbCv).filter(function (l) { return num(l.dn_tubo_queda_ou_ramal_esgoto_mm, 0) === lin.dn && num(l.uhc, -1) >= uhc; }).sort(function (a, b) { return a.uhc - b.uhc; })[0];
      if (linV) [40, 50, 75, 100, 150, 200, 250, 300].some(function (d) { var v = linV["ventilador_dn" + d + "_m"]; if (v != null && num(v, -1) >= Lcv) { dnCV = d; return true; } return false; });   // hid:ok colunas da Tabela 2 (DN do ventilador)
      if (dnCV == null) { Pn("es.coluna_ventilacao", "DN da coluna de ventilação " + pid + " sem linha na Tabela 2 (TQ DN " + lin.dn + ", " + uhc + " UHC, " + f2(Lcv) + " m)", [pid]); dnCV = dnTQ; }
      dnCV = (pvcEs.dns || []).filter(function (d) { return d >= dnCV; })[0] || dnCV;
      /* FRENTE H3 (20/10/2026): no tubo VERTICAL a ventilação liga por junção a 45° (NBR 8160 4.3.16 a, es8160.ventilacao_regras): a
         ligação sobe a 45° do TQ até a coluna. Antes saía deitada (aclive de 1 %) do TQ — um tê de lado no tubo de queda */
      var yC0 = r4(yJ + d2(S, C));
      novas.push({ op: "trecho", id: pid + "-cvl", sistema: "ventilacao", material: "pvc_esgoto", dn: dnCV, p1: { x: S.x, y: yJ, z: S.z }, p2: { x: C.x, y: yC0, z: C.z }, continua: "p1", predio: id, predioParte: "cv_ligacao" });
      var opCV = { op: "trecho", id: pid + "-cv", sistema: "ventilacao", material: "pvc_esgoto", dn: dnCV, p1: { x: C.x, y: yC0, z: C.z }, p2: { x: C.x, y: yTopo, z: C.z }, continua: "p2", predio: id, predioParte: "cv" };
      novas.push(opCV);
      if (terminal(pid + "-cv-terminal", dnCV, opCV.p2)) delete opCV.continua;
      /* COLUNA DE ÁGUA FRIA: do barrilete (topo da obra) para baixo; aparada na ligação mais baixa depois do "ligar" */
      var F = G.sh.af, dnAF = pvcAf.dn, yAF0 = r4(terreno + geo(par, "afBase"));
      var opAF = { op: "trecho", id: pid + "-af", sistema: "agua_fria", material: "pvc_soldavel", dn: dnAF, p1: { x: F.x, y: topoObra, z: F.z }, p2: { x: F.x, y: yAF0, z: F.z }, continua: "p1", predio: id, predioParte: "af" };
      novas.push(opAF);
      /* N23 EMBUTIDO (26/10/2026): o SHAFT das prumadas MODELADO e ORÇADO — antes o tubo de queda, a coluna de ventilação e a de água
         fria subiam soltas no canto do banheiro (o "shaft" era só o lugar escolhido). Em cada pavimento, um fechamento de drywall de
         face simples (SINAPI 96370, js/biminstembutido.js) do pé da parede até o fundo da laje de cima, cobrindo as três prumadas com a
         folga, encostado na parede de trás (e na lateral, quando ela está a menos da folga). Marca `predio` (refazer = o mesmo). */
      var HEs = dep("HidEmbutido", "./biminstembutido.js"), BEs = BE();
      if (HEs && BEs && BEs.parede && G.sh.atras) (function () {
        var b = G.sh.atras, Lb = Math.sqrt(b.x * b.x + b.z * b.z); if (!(Lb > EPS)) return;
        b = { x: b.x / Lb, z: b.z / Lb };
        var fr = { x: -b.x, z: -b.z }, u = { x: -b.z, z: b.x }, fol = HEs.GEO.folgaEnchimento;
        var GBs = dep("HidGeo", "./biminstgeo.js");
        function rr(mat, dn) { try { var c = GBs && GBs.cotasTubo ? GBs.cotasTubo(mat, dn) : null; if (c && c.de > 0) return c.de / 2000; } catch (eC) {} return dn / 2000; }   // hid:ok DE mm → raio m
        var pts = [{ p: S, r: rr("pvc_esgoto", dnTQ) }, { p: C, r: rr("pvc_esgoto", dnCV) }, { p: F, r: rr("pvc_soldavel", dnAF) }];
        function loc(q) { var dx = q.x - S.x, dz = q.z - S.z; return { s: dx * u.x + dz * u.z, f: dx * fr.x + dz * fr.z }; }
        var s0 = Infinity, s1 = -Infinity, f0 = Infinity, f1 = -Infinity;
        pts.forEach(function (q) { var l = loc(q.p); s0 = Math.min(s0, l.s - q.r - fol); s1 = Math.max(s1, l.s + q.r + fol); f0 = Math.min(f0, l.f - q.r - fol); f1 = Math.max(f1, l.f + q.r + fol); });
        pavs.forEach(function (yb, k) {
          var yM = r4(yb + geo(par, "margemNo") * 4), Pt = HEs.paredeAtras(st, { x: S.x, y: yM, z: S.z }, b, { alcance: f1 - f0 + 1 });   // hid:ok procura até a profundidade do shaft + 1 m
          if (!Pt) return;
          var ff0 = -Pt.face, ss0 = s0, ss1 = s1, lat = { "1": false, "-1": false };
          [1, -1].forEach(function (sg) { var Pl = HEs.paredeAtras(st, { x: S.x, y: yM, z: S.z }, { x: u.x * sg, z: u.z * sg }, { alcance: Math.abs(sg > 0 ? s1 : s0) + fol }); if (Pl) { lat[String(sg)] = true; if (sg > 0) ss1 = Pl.face; else ss0 = -Pl.face; } });
          var T = K._int.tetoDe(st, { x: S.x, z: S.z }, yb), topo = r4(T.y);
          if (!(topo > yb + geo(par, "margemNo"))) return;
          var sm = (ss0 + ss1) / 2, esp = r4(ss1 - ss0), prof = f1 - ff0;
          var a0 = { x: r4(S.x + u.x * sm + fr.x * ff0), z: r4(S.z + u.z * sm + fr.z * ff0) }, a1 = { x: r4(S.x + u.x * sm + fr.x * f1), z: r4(S.z + u.z * sm + fr.z * f1) };
          var cx = BEs.parede(a0, a1, esp, r4(topo - yb), yb); if (!cx) return;
          cx.drywall = true; cx.shaft = { prumada: pid, faces: 1 + (lat["1"] ? 0 : 1) + (lat["-1"] ? 0 : 1) };
          /* o orçamento: as faces que ficam para o cômodo (a da frente + as laterais sem parede), em m² de face simples de drywall —
             a medida "area" da caixa é comprimento (a profundidade) × altura; o fator leva às faces de verdade */
          var faces = esp + (lat["1"] ? 0 : prof) + (lat["-1"] ? 0 : prof), fator = r4(faces / Math.max(prof, EPS));
          var sid = pid + "-shaft-p" + k, sp = HEs.SINAPI.drywallFace;
          novas.push({ op: "criar", id: sid, caixa: cx, predio: id, predioParte: "shaft" });
          novas.push({ op: "orcar", id: sid, servicos: [{ codigo: sp[0], medida: "area", fator: fator, rotulo: "Shaft das prumadas " + pid + " (drywall, face simples)" }], predio: id, predioParte: "shaft" });
        });
        D("predio.shaft", "Shaft das prumadas " + pid + " (tubo de queda, ventilação e água fria) fechado em drywall de face simples em cada pavimento (SINAPI " + HEs.SINAPI.drywallFace[0] + ": " + HEs.SINAPI.drywallFace[2].split(",")[0].toLowerCase() + "), com " + Math.round(fol * 100) + " cm de folga em volta dos tubos — o tubo não fica aparente no cômodo.");
      })();
      G.prumada = { id: pid, tq: pid + "-tq", vp: pid + "-vp", cv: pid + "-cv", af: pid + "-af", opAF: opAF, dnTQ: dnTQ, dnCV: dnCV, dnAF: dnAF, uhc: uhc, pavimentos: np, x: S.x, z: S.z, yPe: yPe, yTopo: yTopo, espera: { x: r4(E.x), z: r4(E.z) } };
      D("predio.tubo_queda", "Tubo de queda " + pid + " DN " + dnTQ + " (NBR 8160 Tabela 6: " + uhc + " UHC em " + np + " pavimento(s), linha '" + (lin.pavimentos_max === "*" ? "mais de " : "até ") + (lin.pavimentos_max === "*" ? "3" : lin.pavimentos_max) + " pavimentos'; ≥ o maior ramal DN " + dnMax + "), do pé a " + f2(yPe) + " m ao terminal a " + f2(yTopo) + " m (" + topoV.origem + "): esgoto até acima do piso do último pavimento (" + f2(yVP) + " m) e, acima, o ventilador primário DN " + dnTQ + "; pé na horizontal a " + f2(iPe * 100) + " % até a espera em (" + f2(E.x) + "; " + f2(E.z) + ") — a linha da rede leva a uma caixa de inspeção.");
      D("predio.coluna_ventilacao", "Coluna de ventilação " + pid + "-cv DN " + dnCV + " (Tabela 2: TQ DN " + lin.dn + ", " + uhc + " UHC, " + f2(Lcv) + " m), ligada ao TQ a " + f2(yJ) + " m — abaixo do ramal mais baixo — e com terminal próprio acima da cobertura; os ventiladores de cada unidade chegam nela sob o teto.");
      D("predio.coluna_af", "Coluna de água fria " + pid + "-af do barrilete (topo da obra, " + f2(topoObra) + " m — a ligação ao reservatório fica pendente) até a ligação mais baixa; DN " + dnAF + " provisório do material: o dimensionamento (NBR 5626) confere pela soma dos pesos.");
      return { novas: novas, prumada: G.prumada };
    }

    /* 5) SHAFT: o informado, ou o 1º candidato em que o pavimento-tipo traça de verdade (sonda num andar) */
    var cands = par.shaft && par.shaft.tq ? { lista: [par.shaft] } : shaftCandidatos(st, avaliarFam, famsBase, par);
    if (cands.erro || !cands.lista.length) { pend("predio.shaft", cands.erro || "nenhum lugar para o shaft", [bac0.id], { tipo: "parametro", campo: "shaft" }); return out; }
    var sonda = unidades.filter(function (u) { return !u.esp && u.y > terreno + geo(par, "tolNivel"); })[0], sh0 = null, tentados = 0;
    for (var ic = 0; ic < cands.lista.length && !sh0; ic++) {
      var Gs = { id: id + "-a", sh: cands.lista[ic], unidades: unidades.filter(function (u) { return !u.esp; }) }, Ps = prumadasGrupo(Gs, false);
      if (!Ps || !sonda || cands.lista.length === 1) { sh0 = cands.lista[ic]; break; }
      tentados++;
      var opsS = opsAgora().concat([{ op: "lote", id: "sonda-" + id, ops: Ps.novas }]), stS = BE().aplicar(opsS);
      var seedS = sonda.fams.filter(function (fid) { var f = arr(stS.familias).filter(function (x) { return String(x.id) === fid; })[0]; return f && /^bacia/.test(String(K.tipoDaFamilia(f.famId, f.tipoId) || "")); })[0] || sonda.fams[0];
      var RS = A.ligar({ estado: stS, avaliarFam: avaliarFam, ops: opsS, famInst: seedS, parametros: par });
      if (RS.rota) sh0 = cands.lista[ic];
    }
    if (!sh0) { sh0 = cands.lista[0]; pend("predio.shaft", "nenhum dos " + cands.lista.length + " lugares do shaft deu traçado no pavimento-tipo: informe o shaft (parametros.shaft) ou ajuste a arquitetura (rebaixo da laje do banheiro)", [bac0.id], { tipo: "parametro", campo: "shaft" }); }
    var grupos = [{ id: id + "-a", sh: sh0, unidades: [] }];
    if (eixo) grupos.push({ id: id + "-b", sh: espelharShaft(sh0, eixo), unidades: [] });
    unidades.forEach(function (u) { (u.esp ? grupos[1] : grupos[0]).unidades.push(u); });
    decide("predio.shaft", "Shaft " + (par.shaft && par.shaft.tq ? "informado" : sh0.onde + (tentados > 1 ? " (o " + tentados + "º lugar testado: o traçado do pavimento-tipo passou ali; os anteriores ficavam sem caminho junto da bacia)" : "")) + ": tubo de queda, coluna de ventilação e coluna de água fria enfileiradas a " + f2(geo(par, "afastPrumadas")) + " m entre eixos, a " + f2(geo(par, "recuoShaft")) + " m da parede (critério do projetista; o shaft é fechado e visitável)" + (eixo ? "; a unidade espelhada tem o shaft espelhado" : "") + ".");
    grupos.forEach(function (G) { var Pg = prumadasGrupo(G, true); if (Pg) { Pg.novas.forEach(function (o) { acc.push(o); }); out.prumadas.push(Pg.prumada); } });
    if (out.prumadas.length) pend("predio.barrilete", "ligue a(s) coluna(s) de água fria " + out.prumadas.map(function (p) { return p.af; }).join(", ") + " ao barrilete/reservatório superior (não modelado): a espera acima do registro de gaveta de cada coluna recebe o barrilete; na saída do reservatório, outro registro de gaveta (NBR 5626:2020, 6.5.12.4 a) — com a caixa d'água no modelo, o Traçar automaticamente (ou Montar barrilete) liga", out.prumadas.map(function (p) { return p.af; }), { tipo: "modelar", sistema: "agua_fria", elemento: "barrilete" });
    st = est();

    /* 6) LIGAR AMBIENTE de cada unidade (o térreo à espera; os andares ao TQ; a ventilação à coluna) */
    unidades.forEach(function (u) {
      var seed = u.fams.filter(function (fid) { var f = arr(st.familias).filter(function (x) { return String(x.id) === fid; })[0]; return f && /^bacia/.test(String(K.tipoDaFamilia(f.famId, f.tipoId) || "")); })[0] || u.fams[0];
      var R = A.ligar({ estado: st, avaliarFam: avaliarFam, ops: opsAgora(), famInst: seed, parametros: par });
      /* a coluna de água fria ainda é PROVISÓRIA (aparada no passo 7): a "ponta solta" dela no meio do caminho não é aviso */
      R.avisos = R.avisos.filter(function (a) { return !arr(a.elementos).some(function (x) { return out.prumadas.some(function (p) { return String(x) === p.af; }); }) && !out.prumadas.some(function (p) { return a.texto.indexOf(p.af + " ") >= 0; }); });
      out.ambientes.push(R);
      R.pendencias.forEach(function (p) { pend(p.chave, u.id + ": " + p.motivo, p.elementos, p.acao); });
      if (R.ops.length) {
        var o1 = R.ops.filter(function (o) { return o.op !== "apagar" && o.op !== "desanotar"; })[0];
        if (o1) o1.ambInfo = { id: R.ambiente.id, aparelhos: R.ambiente.aparelhos, terreo: R.ambiente.terreo, decisoes: R.decisoes, pendencias: R.pendencias.map(function (p) { return { chave: p.chave, motivo: p.motivo }; }) };
        R.ops.forEach(function (o) { acc.push(o); }); st = est();
      }
      u.ambiente = R.ambiente ? R.ambiente.id : null; u.terreo = R.ambiente ? R.ambiente.terreo : null;
      u.destino = R.rota ? R.rota.nome : null;
    });

    /* FRENTE H2 (20/10/2026): REGISTRO DE SETORIZAÇÃO no início de cada coluna de água fria — NBR 5626:2020, 6.5.12.4 a (no
       barrilete, em cada trecho que liga o barrilete ao reservatório) e b (na coluna, a montante do 1º ramal); PADROES-PROJETO-RA
       R-C2/R-E17. Antes a coluna nascia no topo da obra sem registro (o HidAF avisava "sem registro de setorização").
       ⚠ O ID DA COLUNA FICA: vários pontos chamam a coluna pelo id (o "ligar" do ambiente acha a coluna por ele, o aparar acima,
       a válvula, os testes). Por isso o registro NÃO divide o trecho: a coluna sobe até a face de baixo do registro (acima da
       laje de cobertura — o topo da obra é o topo da laje e o registro dentro dela não se alcança), o registro é um acessório
       LIVRE (sem `trecho`: as duas faces são pontos de ligação, como os do kit depois de inseridos) e, acima dele, a ESPERA do
       barrilete (ponta "continua"). Entra depois do "ligar" (passo 6): o traçado das unidades nunca vê a espera como coluna.
       O giro: o volante para o lado LIVRE do shaft — perpendicular à fileira das prumadas (nunca na direção do tubo de queda
       ou da coluna de ventilação), para o lado com mais espaço até a parede. */
    function frenteShaft(sh) {
      var a = sh.af, b = sh.tq, dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz);
      var perp = L > EPS ? { x: -dz / L, z: dx / L } : { x: 1, z: 0 }, yS = y0 + geo(par, "margemNo") * 2, melhor = null;
      [1, -1].forEach(function (sg) {
        var v = { x: perp.x * sg, z: perp.z * sg }, livre = geo(par, "buscaLado");
        for (var d = geo(par, "passoBusca"); d <= geo(par, "buscaLado") + EPS; d += geo(par, "passoBusca")) { if (K._int.paredeDe(st, { x: a.x + v.x * d, z: a.z + v.z * d }, yS)) { livre = d; break; } }
        if (!melhor || livre > melhor.livre + EPS) melhor = { v: v, livre: livre };
      });
      return { x: r4(melhor.v.x), y: 0, z: r4(melhor.v.z) };
    }
    function registroColuna(G, opAF) {
      var F = G.sh.af, Lr = B.ACESSORIO_PADRAO, yTop = r4(topoObra + geo(par, "registroAcima")), dirR = { x: 0, y: -1, z: 0 };   /* a água desce: face 1 em cima */
      var BIC = dep("BimInstColocar", "./biminstcolocar.js"), fr = frenteShaft(G.sh), giro = BIC && BIC.giroPara ? BIC.giroPara(dirR, fr) : 0;
      opAF.p1.y = yTop;   /* a coluna sobe até a face de baixo do registro */
      if (opAF.continua === "ambos") opAF.continua = "p2"; else if (opAF.continua === "p1") delete opAF.continua;
      var rg = { op: "acessorio", id: G.prumada.id + "-af-rg", famId: "ra-registro-gaveta", tipoId: B.varianteAuto ? B.varianteAuto("registro_gaveta", { sistema: "agua_fria", material: opAF.material, aplicacao: "reservacao" }) : "bruto",
                 x: F.x, y: r4(yTop + Lr / 2), z: F.z, dir: dirR, sistema: "agua_fria", material: opAF.material, dn: opAF.dn, comprimento: Lr, predio: id, predioParte: "registro_coluna" };
      if (giro) rg.giro = giro;
      var esp = { op: "trecho", id: G.prumada.id + "-af-bar", sistema: "agua_fria", material: opAF.material, dn: opAF.dn, p1: { x: F.x, y: r4(yTop + Lr + geo(par, "tocoBarrilete")), z: F.z }, p2: { x: F.x, y: r4(yTop + Lr), z: F.z }, continua: "p1", predio: id, predioParte: "af_barrilete" };
      acc.push(rg); acc.push(esp);
      G.prumada.registro = rg.id; G.prumada.esperaBarrilete = esp.id; G.prumada.frenteRegistro = fr;
    }

    /* 7) VÁLVULA → coluna de água fria (o ramal exclusivo da válvula sai da coluna) e a coluna APARADA na ligação mais baixa */
    var lista = K.achatar(opsAgora()), apag = apagadosDepois(lista);
    grupos.forEach(function (G) {
      if (!G.prumada) return;
      var F = G.sh.af, opAF = G.prumada.opAF, yLow = null;
      G.unidades.forEach(function (u) {
        u.fams.forEach(function (fid) {
          var vr = lista.filter(function (o, i) { return o && o.op === "trecho" && String(o.kit) === fid && /-vd-ramal$/.test(String(o.id)) && !(apag[o.id] > i); }).pop();
          if (!vr) return;
          var T = vr.p1.y >= vr.p2.y ? vr.p1 : vr.p2;
          if (T.y > opAF.p1.y - EPS) { aviso("o ramal da válvula " + fid + " chega acima do topo da coluna de água fria " + opAF.id, [fid]); return; }
          var lig = { op: "trecho", id: G.prumada.id + "-vd-" + fid, sistema: "agua_fria", material: vr.material || "pvc_soldavel", dn: vr.dn, p1: { x: F.x, y: r4(T.y), z: F.z }, p2: { x: r4(T.x), y: r4(T.y), z: r4(T.z) }, predio: id, predioParte: "valvula_af" };
          acc.push(lig);
          if (yLow == null || T.y < yLow) yLow = T.y;
        });
      });
      /* a ligação mais baixa de água na coluna (ramais do "ligar" que terminam no eixo dela) */
      var stA = est();
      arr(stA.instalacoes && stA.instalacoes.trechos).forEach(function (t) {
        if (t.sistema !== "agua_fria" || t.id === opAF.id) return;
        [t.p1, t.p2].forEach(function (p) { if (d2(p, F) <= B.TOL && p.y < opAF.p1.y - EPS && (yLow == null || p.y < yLow)) yLow = p.y; });
      });
      /* ⚠ a base fica um TOCO abaixo da ligação mais baixa (tampão/registro de limpeza, ponta "continua"): rente à ligação, o
         "religar" do térreo (a linha da rede, o modo do baldrame) não alcançava a coluna — a cota do ramal saía 1 cm abaixo */
      var yBaseAF = yLow != null ? r4(yLow - geo(par, "tocoAF")) : null;
      if (yBaseAF != null && yBaseAF > opAF.p2.y + EPS) { opAF.p2.y = yBaseAF; opAF.continua = "ambos"; G.prumada.yBaseAF = yBaseAF; G.prumada.yLigAF = r4(yLow); }
      else if (yLow == null) aviso("nenhum ramal de água chegou à coluna " + opAF.id + ": confira os pontos de água", [opAF.id]);
      registroColuna(G, opAF);
    });
    if (out.prumadas.some(function (p) { return p.registro; })) decide("predio.registro_coluna", "Registro de gaveta no início de cada coluna de água fria (" + out.prumadas.filter(function (p) { return p.registro; }).map(function (p) { return p.registro; }).join(", ") + "), no barrilete, acima da laje de cobertura e a montante do 1º ramal (NBR 5626:2020, 6.5.12.4 a e b): o volante para o lado livre do shaft (fora das outras prumadas e das paredes); acima dele, a espera que o barrilete recebe. O registro na saída do reservatório entra com o barrilete (pendência predio.barrilete).");
    if (out.prumadas.some(function (p) { return p.yBaseAF != null; })) decide("predio.valvula", "Válvula de descarga: o ramal exclusivo de cada bacia sai da coluna de água fria do shaft sob a laje (NBR 5626, 6.14.5) — a coluna termina " + f2(geo(par, "tocoAF")) + " m abaixo da ligação mais baixa (tampão / registro de limpeza; critério do projetista).");

    /* FRENTE H8 (21/10/2026): com a CAIXA D'ÁGUA no modelo, o barrilete (js/hidbarrilete.js) liga a espera acima do registro de cada
       coluna — a pendência predio.barrilete fecha (sem caixa, ela fica, e o Traçar automaticamente liga quando a caixa for posta) */
    var HBR = dep("HidBarrilete", "./hidbarrilete.js");
    /* ⚠ a caixa é procurada no estado que já existe (st, as famílias não mudam depois do passo 6): o replicar sem caixa não paga mais
       um BimEdit.aplicar do prédio inteiro (o test-hid-predio roda o replicar 6 vezes) */
    if (out.prumadas.length && HBR && HBR.caixas(st, avaliarFam).length) {
      try {
        var RB = HBR.montar({ estado: est(), avaliarFam: avaliarFam, ops: opsAgora(), parametros: par, pressao: true });
        var esperasP = out.prumadas.map(function (p) { return p.esperaBarrilete; }).filter(Boolean), todasLig = esperasP.length && esperasP.every(function (x) { return RB.esperasLigadas.indexOf(x) >= 0; });
        RB.ops.forEach(function (o) { acc.push(o); });
        RB.pendencias.forEach(function (p) { pend(p.chave, p.texto, p.elementos, p.acao); });
        RB.avisos.forEach(function (a) { aviso(a.texto, a.elementos, a.acao); });
        RB.decisoes.forEach(function (d) { decide(d.id, d.texto); });
        if (todasLig) out.pendencias = out.pendencias.filter(function (p) { return p.chave !== "predio.barrilete"; });
        out.barrilete = { ligadas: RB.ligadas, esperas: RB.esperasLigadas, caixas: RB.caixas };
      } catch (eB) { aviso("barrilete: o traçado falhou (" + (eB && eB.message ? eB.message : eB) + ") — ligue as colunas à caixa à mão", out.prumadas.map(function (p) { return p.af; })); }
    }
    out.unidades = unidades.map(function (u) { return { id: u.id, pavimento: u.k, y: u.y, espelhada: u.esp, aparelhos: u.fams.slice(), ambiente: u.ambiente, terreo: u.terreo }; });
    ctx.pendencias().forEach(function (p) { pend(p.chave, p.motivo, [id]); });
    out.normas = ctx.normas();
    /* N23 (24/10/2026): os PASSANTES nas lajes dos pavimentos (tubo de queda, ventilação, colunas) — o mesmo lançamento do Traçar
       automaticamente (js/hidcriterios.js): a travessia sai com o furo previsto e vai ao orçamento do modelo */
    var HCrP = global.HidCriterios;
    if (HCrP && HCrP.lancarPassantes) { try { var LPp = HCrP.lancarPassantes(acc, st, avaliarFam); out.passantes = LPp.n; if (LPp.n) aviso("Passantes: " + LPp.n + " travessia(s) de laje com o furo previsto (tubo-camisa na fôrma; vai ao orçamento do modelo) — confira a posição com o projeto estrutural", LPp.trechos.slice(0, 40)); } catch (eLP) { aviso("Passantes: não consegui conferir as travessias de laje (" + (eLP && eLP.message ? eLP.message : eLP) + ") — confira à mão", []); } }   // hid:ok até 40 elementos no Mostrar
    out.ops = acc;
    out.ok = acc.some(function (o) { return o.op !== "apagar" && o.op !== "desanotar"; });
    return out;
  }

  var HidPredio = { VERSAO: 1, GEO_PREDIO: GEO_PREDIO, replicar: replicar, _int: { espelharP: espelharP, espelharRot: espelharRot, pavimentosDe: pavimentosDe, shaftCandidatos: shaftCandidatos, limpeza: limpeza } };
  global.HidPredio = HidPredio;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPredio;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
