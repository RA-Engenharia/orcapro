/* =====================================================================
 * hidselecao.js — SELEÇÃO E EDIÇÃO DA PEÇA DE INSTALAÇÃO (14/11/2026, ramo bim-selecao). Motor PURO, ES5, Node-testável.
 * Global: HidSelecao.
 *
 * POR QUE. Pedido do Rogério (13/11 noite, seção C): "a modelagem manual tem que ser igual ou melhor": a peça clicada mostra as bocas livres
 * com "+", setas de girar/inverter, as propriedades da conexão (família, DN de cada boca, fabricante/código, ângulo) e a TROCA da conexão
 * por outra compatível ali mesmo; e o snap visível (pontinho + nome do encaixe sob o cursor; o clique pega aquele ponto).
 *
 * O QUE CADA FUNÇÃO FAZ (nenhuma mexe no estado: devolvem a op que a tela aplica — um Ctrl+Z desfaz cada uma):
 *   bocasPeca(estado, pk)                       as bocas de CATÁLOGO da caixa/ralo (js/hidbocas.js) no formato dos pontos do "+"
 *                                               (js/biminstcon.js): livre = boca sem tubo; DN e sentido da boca. [] = sem catálogo.
 *   simular(estado, ops)                        o estado depois das ops (replay no BimInst — o mesmo do editor), para conferir.
 *   propsConexao(estado, famAval, no)           família/tipo, DN de cada boca (js/biminstportas.js), ângulo medido, fabricante/código
 *                                               do catálogo (js/hidcatalogo.js) e a fonte.
 *   compativeis(estado, famAval, no)            as conexões que SERVEM neste nó: só entra a que o motor da rede HONRA (a escolha é gravada
 *                                               num estado de teste e a rede decide — a mesma regra do orçamento, nada de lista à parte).
 *                                               Mais "2 × 45°" no lugar do 90° em planta quando os dois tubos têm comprimento para isso.
 *   trocar(estado, famAval, no, tipo)           a op da troca (peça forçada no nó: pecaIni/pecaFim — js/biminstcomponentes.js opsForcar),
 *                                               ou a geometria do 2 × 45° (dois tubos encurtados + o tubo a 45°), conferida antes.
 *   inverterRamal(estado, famAval, no)          tê/junção: o ramal passa para o OUTRO lado da linha principal (espelho em planta).
 *   inverterPeca(estado, id) / girarPeca(...)   caixa/ralo: 180° (inverter) e o passo do giro da peça (45° na caixa sifonada — o mesmo
 *                                               do js/biminstcolocar.js); os tubos que chegam nas bocas vão junto.
 *   encaixes(estado, famAval, opts)             os pontos de encaixe do modelo (boca, ponta, meio, ponto de aparelho) com o nome.
 *   encaixeTela(estado, famAval, proj, cur, o)  o encaixe sob o cursor na TELA (3D ou planta): o mais perto em px; no corpo do tubo,
 *                                               o ponto do EIXO sob o cursor. Devolve { tipo, nome, P, alvo } — `alvo` no formato do
 *                                               BimInstUI.agarrar (o clique usa exatamente aquele ponto).
 * ⚠ Nenhum valor de norma aqui: o que é regra de conexão é do js/biminst.js (decidir / decidirForcada).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HB() { return dep("HidBocas", "./hidbocas.js"); }
  function HP() { return dep("HidPortas", "./biminstportas.js"); }
  function HC() { return dep("HidComponentes", "./biminstcomponentes.js"); }
  function CAT() { return dep("HidCatalogo", "./hidcatalogo.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok arredondamento a 0,1 mm (formatação)
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function d3(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)); }
  function un(v) { var L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1; return { x: v.x / L, y: v.y / L, z: v.z / L }; }
  var TOL_NO = 0.021;   // hid:ok o mesmo raio de "mesmo nó" do BimInst (TOL = 2 cm) + folga numérica
  function ins(estado) { return (estado && estado.instalacoes) || { trechos: [], pecas: [] }; }
  function trecho(estado, id) { return arr(ins(estado).trechos).filter(function (t) { return String(t.id) === String(id); })[0] || null; }
  function lote(ops, pedido) { return ops.length === 1 ? ops[0] : { op: "lote", id: "sel" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), origem: "selecao", pedido: pedido, ops: ops }; }
  function opsDe(op) { return op && op.op === "lote" ? arr(op.ops) : (op ? [op] : []); }

  /* ================================================================ SIMULAR (o mesmo replay do editor) */
  function simular(estado, ops) {
    var I = BI(); if (!I || !estado) return estado;
    var e = I.novoEstado(), S = ins(estado);
    arr(S.trechos).forEach(function (t) { e.trechos[t.id] = copia(t); e.ordemT.push(t.id); });
    arr(S.pecas).forEach(function (k) { e.pecas[k.id] = copia(k); e.ordemP.push(k.id); });
    arr(S.acessorios).forEach(function (a) { e.acessorios[a.id] = copia(a); e.ordemAc.push(a.id); });
    if (S.nomesSistema) e.nomesSis = copia(S.nomesSistema);
    arr(ops).forEach(function (o) { opsDe(o).forEach(function (q) { I.aplicarOp(e, copia(q)); }); });
    var out = {}; Object.keys(estado).forEach(function (k) { out[k] = estado[k]; });
    out.instalacoes = I.fechar(e);
    return out;
  }
  /* o estado REDUZIDO ao entorno do nó (os trechos que tocam nele): a decisão da conexão só depende deles — a rede de teste fica rápida */
  function entorno(estado, no) {
    var S = ins(estado), ts = arr(S.trechos).filter(function (t) {
      if (!t.p1 || !t.p2) return false;
      if (d3(t.p1, no) <= 0.6 || d3(t.p2, no) <= 0.6) return true;   // hid:ok raio de busca (geometria)
      var ax = t.p2.x - t.p1.x, ay = t.p2.y - t.p1.y, az = t.p2.z - t.p1.z, L2 = ax * ax + ay * ay + az * az; if (!(L2 > 0)) return false;
      var u = Math.max(0, Math.min(1, ((no.x - t.p1.x) * ax + (no.y - t.p1.y) * ay + (no.z - t.p1.z) * az) / L2));
      return d3({ x: t.p1.x + ax * u, y: t.p1.y + ay * u, z: t.p1.z + az * u }, no) <= 0.05;
    });
    var out = {}; Object.keys(estado || {}).forEach(function (k) { out[k] = estado[k]; });
    out.instalacoes = { trechos: ts, pecas: arr(S.pecas).filter(function (k) { return Math.hypot(k.x - no.x, k.z - no.z) <= 1.5; }) };   // hid:ok raio (geometria)
    return out;
  }
  function noNaRede(R, no) { var H = HC(); return H && R ? H.noEm(R, no, 0.05) : null; }   // hid:ok 5 cm: o mesmo nó depois da op
  function redeDe(estado, famAval) { var I = BI(); try { return I.rede(estado, famAval || null); } catch (e) { return null; } }

  /* ================================================================ BOCAS DA PEÇA (o "+") */
  function bocasPeca(estado, pk) {
    var H = HB(), I = BI(); if (!H || !pk) return [];
    var bs = []; try { bs = H.bocas(estado, pk); } catch (e) { bs = []; }
    var P = (I && I.PECAS[pk.peca]) || {}, nome = txt(P.nome || "peça").toLowerCase(), nE = 0;
    return bs.map(function (b) {
      var ent = b.papel === "entrada"; if (ent) nE++;
      return { tipo: "peca", id: pk.id, peca: pk.peca, boca: b.id, x: b.x, y: b.y, z: b.z, dir: b.dir, sistema: pk.sistema, dn: b.dn, fluxo: ent ? "entrada" : "saida",
               livre: !b.ocupada, nome: (ent ? "Entrada " + nE : "Saída") + " DN " + b.dn + " da " + nome, aConferir: b.aConferir };
    });
  }

  /* ================================================================ PROPRIEDADES DA CONEXÃO */
  /* as direções dos ramos no nó (saindo do nó), por trecho */
  function ramosDoNo(estado, no) {
    var out = [];
    arr(no && no.ramos).forEach(function (id) {
      var t = trecho(estado, id); if (!t) return;
      if (d3(t.p1, no) <= TOL_NO) out.push({ trecho: t.id, lado: "p1", dir: un({ x: t.p2.x - t.p1.x, y: t.p2.y - t.p1.y, z: t.p2.z - t.p1.z }), t: t });
      else if (d3(t.p2, no) <= TOL_NO) out.push({ trecho: t.id, lado: "p2", dir: un({ x: t.p1.x - t.p2.x, y: t.p1.y - t.p2.y, z: t.p1.z - t.p2.z }), t: t });
      else { var u = un({ x: t.p2.x - t.p1.x, y: t.p2.y - t.p1.y, z: t.p2.z - t.p1.z }); out.push({ trecho: t.id, lado: "passa", dir: u, t: t }); out.push({ trecho: t.id, lado: "passa", dir: { x: -u.x, y: -u.y, z: -u.z }, t: t }); }
    });
    return out;
  }
  function distSeg(p, a, b) {
    var ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z, L2 = ax * ax + ay * ay + az * az, u = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ax + (p.y - a.y) * ay + (p.z - a.z) * az) / L2)) : 0;
    return d3(p, { x: a.x + ax * u, y: a.y + ay * u, z: a.z + az * u });
  }
  function ang(u, v) { var c = u.x * v.x + u.y * v.y + u.z * v.z; return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI; }
  /* o item do catálogo do fabricante para a conexão (tipo, material, DN): { fabricante, codigo, descricao, fonte } | null */
  var TIPO_CAT = { joelho90: ["joelho90", "joelho_90"], joelho45: ["joelho45", "joelho_45"], curva90: ["curva_90", "curva"], curva45: ["curva"], te: ["te"], juncao: ["juncao"], luva: ["luva", "luva_simples", "luva_simp"], reducao: ["reducao", "bucha_red", "luva_red"], te_inspecao: ["te_inspecao"], cap: ["cap"], uniao: ["uniao", "uniao_soldavel"] };
  var MAT_CAT = { pvc_soldavel: /soldavel|agua-fria/i, pvc_esgoto: /esgoto/i, pvc_serie_r: /serie-r|reforcad/i, cpvc: /cpvc|aquatherm|quente/i, ppr: /ppr/i };
  function itemCatalogo(tipo, material, dn) {
    var C = CAT(); if (!C || !C.itens) return null;
    var ts = TIPO_CAT[tipo] || [tipo], rx = MAT_CAT[material], dnS = txt(dn);
    var cand = []; ts.forEach(function (t) { cand = cand.concat(arr(C.itens({ tipo: t }))); });
    var achou = cand.filter(function (it) {
      var d = txt(it.descricao).toUpperCase(), js = txt(it.fonte && it.fonte.json);
      if (rx && !rx.test(js)) return false;
      if (tipo === "curva45" && !/45/.test(d)) return false;
      if (tipo === "curva90" && !/90/.test(d)) return false;
      var m = d.match(/(?:DN\s*)?(\d{2,3})\s*(?:MM)?/g) || [];
      return m.some(function (s) { return (s.match(/\d+/) || [""])[0] === dnS; }) && (/MM|DN/.test(d));
    })[0];
    return achou ? { fabricante: achou.fabricante || txt(achou.id).split("-").slice(0, 2).join(" "), codigo: achou.codigo, descricao: achou.descricao, fonte: (achou.fonte && (achou.fonte.arquivo || achou.fonte.json)) || "" } : null;
  }
  function propsConexao(estado, famAval, no) {
    var I = BI(), P = HP(); if (!I || !no) return null;
    var nome = I.nomeConexao ? I.nomeConexao(no.tipo, no.material) : no.tipo, ch = no.dn2 ? no.dn + "x" + no.dn2 : txt(no.dn);
    var portas = P && P.info(no.tipo) ? P.portasDe(no.tipo, no.material, ch) : [];
    var rs = ramosDoNo(estado, no), angulo = null;
    if (rs.length === 2) angulo = Math.round(180 - ang(rs[0].dir, rs[1].dir));
    else if (rs.length === 3) { var al = principal(rs); if (al) angulo = Math.round(Math.min(ang(rs[al.c].dir, rs[al.a].dir), ang(rs[al.c].dir, rs[al.b].dir))); }
    var cat = itemCatalogo(no.tipo, no.material, no.dn);
    return { tipo: no.tipo, nome: nome, familia: nome.split(" ")[0], material: no.material, materialNome: ((I.MATERIAIS[no.material] || {}).nome) || no.material, forcada: !!no.forcada,
             bocas: portas.filter(function (p) { return p.papel !== "tampa"; }).map(function (p) { return { id: p.id, papel: p.papel, dn: p.dn, junta: p.junta }; }),
             angulo: angulo, fabricante: cat ? cat.fabricante : null, codigo: cat ? cat.codigo : null, descricao: cat ? cat.descricao : null, fonte: cat ? cat.fonte : "não consta no catálogo de fabricante carregado" };
  }
  /* tê/junção: o par mais alinhado é a linha principal (a mesma conta do BimInst.decidir) */
  function principal(rs) {
    if (rs.length !== 3) return null;
    var best = 999, par = null;
    for (var i = 0; i < 3; i++) for (var j = i + 1; j < 3; j++) { var d = 180 - ang(rs[i].dir, rs[j].dir); if (d < best) { best = d; par = [i, j]; } }
    return { a: par[0], b: par[1], c: 3 - par[0] - par[1], desvio: best };
  }

  /* ================================================================ TROCAR A CONEXÃO */
  /* o 2 × 45° no lugar do 90° (em planta): os dois tubos recuam `d` do canto e um tubo a 45° fecha — só se cada tubo tem
     comprimento (o recuo + a perna mínima) e as duas pontas no canto são de tubo (nada passando reto) */
  var RECUO_2X45 = 0.15;   // hid:ok recuo do canto (geometria do desenho: cabe a perna dos dois joelhos de 45° até DN 100)
  function plano2x45(estado, no) {
    var rs = ramosDoNo(estado, no);
    if (rs.length !== 2 || rs.some(function (r) { return r.lado === "passa"; })) return { ok: false, motivo: "o 2 × 45° vale num canto de dois tubos" };
    if (rs.some(function (r) { return Math.abs(r.dir.y) > 0.2; })) return { ok: false, motivo: "o 2 × 45° é para o desvio em planta (um dos tubos é vertical)" };   // hid:ok ~11°: deitado
    var dv = 180 - ang(rs[0].dir, rs[1].dir); if (Math.abs(dv - 90) > 10) return { ok: false, motivo: "o canto não é de 90° (" + Math.round(dv) + "°)" };   // hid:ok a janela de 90° ± 10 do motor
    var d = RECUO_2X45, ops = [], pts = [];
    for (var i = 0; i < 2; i++) {
      var r = rs[i], t = r.t, L = d3(t.p1, t.p2); if (L < d + 0.1) return { ok: false, motivo: "o tubo " + t.id + " é curto para o 2 × 45° (" + Math.round(L * 100) + " cm)" };   // hid:ok perna mínima 10 cm
      var u = d / L, a = r.lado === "p1" ? t.p1 : t.p2, b = r.lado === "p1" ? t.p2 : t.p1;
      var q = { x: r4(a.x + (b.x - a.x) * u), y: r4(a.y + (b.y - a.y) * u), z: r4(a.z + (b.z - a.z) * u) };
      var o = BI().opDoTrecho(t); o[r.lado] = q; delete o[r.lado === "p1" ? "pecaIni" : "pecaFim"]; ops.push(o); pts.push({ q: q, r: r });   /* revisão A4: a peça forçada do canto não vai para as pontas recuadas */
    }
    /* o tubo novo a 45°: no sentido do escoamento (de quem chega no canto para quem sai) — p1 a montante */
    /* revisão A1 (14/11/2026): MONTANTE = a cota mais ALTA, sempre (antes valia o lado p2, e com os dois tubos terminando no canto a ordem de
       no.ramos decidia — o tubo a 45° nascia subindo). Só com as cotas iguais vale quem termina no canto (p2) */
    var t0 = pts[0].r.t, chega;
    if (Math.abs(pts[0].q.y - pts[1].q.y) > 1e-6) chega = pts[0].q.y > pts[1].q.y ? pts[0] : pts[1];
    else chega = pts[0].r.lado === "p2" ? pts[0] : pts[1];
    var sai = chega === pts[0] ? pts[1] : pts[0];
    var nid = "x45" + txt(t0.id) + "_" + Date.now().toString(36).slice(-4), novo = BI().opDoTrecho(t0);
    novo.id = nid; novo.p1 = chega.q; novo.p2 = sai.q; delete novo.pecaIni; delete novo.pecaFim; ops.push(novo);
    return { ok: true, ops: ops, novo: nid };
  }
  function candidatos(no) {
    var P = HP(), I = BI(); if (!P || !I) return [];
    var n = P.info(no.tipo) ? P.ligaTubo(no.tipo, false) : arr(no.ramos).length, df = P.deflexao(no.tipo);
    return P.tipos().filter(function (t) {
      var inf = P.info(t); if (!inf || inf.naoDeduzir) return false;
      if (P.ligaTubo(t, false) !== n) return false;
      if (n === 2) { var d2 = P.deflexao(t); return df != null && d2 != null && Math.abs(d2 - df) < 1 && df > 1; }   // hid:ok mesma deflexão (luva/redução não se trocam aqui)
      return n === 3;
    });
  }
  function compativeis(estado, famAval, no) {
    var I = BI(), H = HC(); if (!I || !H || !no) return [];
    var base = entorno(estado, no), out = [], rs = ramosDoNo(estado, no), al = principal(rs), beta = null;
    if (al) { var cb = Math.abs(rs[al.c].dir.x * rs[al.a].dir.x + rs[al.c].dir.y * rs[al.a].dir.y + rs[al.c].dir.z * rs[al.a].dir.z); beta = Math.acos(Math.min(1, cb)) * 180 / Math.PI; }
    candidatos(no).forEach(function (tipo) {
      var nome = I.nomeConexao(tipo, no.material);
      /* tê × junção pela GEOMETRIA (a mesma janela do BimInst.decidir): a junção só onde o ramal chega a 25–65° da linha; o tê só a 70–90° */
      if (beta != null && tipo !== no.tipo && (/^juncao/.test(tipo) ? !(beta >= 25 && beta <= 65) : beta < 70)) return;   // hid:ok janela de ângulo do motor (geometria)
      if (tipo === no.tipo) { out.push({ tipo: tipo, nome: nome, atual: true, ok: true }); return; }
      var r = H.opsForcar(base, no, tipo); if (!r.ok) return;
      var R = redeDe(simular(base, [r.op]), famAval), n2 = noNaRede(R, no);
      if (n2 && n2.tipo === tipo) out.push({ tipo: tipo, nome: nome, atual: false, ok: true });
    });
    if (/^(joelho90|curva90)/.test(no.tipo)) {
      var pl = plano2x45(estado, no);
      out.push({ tipo: "duplo45", nome: "2 × " + I.nomeConexao("joelho45", no.material) + " (com tubo a 45°)", atual: false, ok: pl.ok, motivo: pl.ok ? "" : pl.motivo });
    }
    if (no.forcada) out.push({ tipo: "auto", nome: "Voltar ao automático", atual: false, ok: true });
    return out;
  }
  function trocar(estado, famAval, no, tipo) {
    var I = BI(), H = HC(); if (!I || !H || !no) return { ok: false, motivo: "O motor de conexões ainda não carregou." };
    if (tipo === no.tipo && !no.forcada) return { ok: false, motivo: "Esta já é a conexão do nó." };
    if (tipo === "auto") return H.opsAutomatico(estado, no);
    if (tipo === "duplo45") {
      var pl = plano2x45(estado, no); if (!pl.ok) return { ok: false, motivo: pl.motivo };
      return { ok: true, op: lote(pl.ops, "Trocar o 90° por 2 × 45°"), novo: pl.novo };
    }
    var r = H.opsForcar(estado, no, tipo); if (!r.ok) return r;
    var base = entorno(estado, no), R = redeDe(simular(base, [H.opsForcar(base, no, tipo).op]), famAval), n2 = noNaRede(R, no);
    if (!n2 || n2.tipo !== tipo) {
      var av = R ? arr(R.avisos).filter(function (a) { return /conexão escolhida não aplicada/.test(a.texto); }).map(function (a) { return a.texto; })[0] : "";
      return { ok: false, motivo: av || (I.nomeConexao(tipo, no.material) + " não serve neste nó.") };
    }
    return { ok: true, op: r.op };
  }

  /* ================================================================ INVERTER O RAMAL (tê / junção) */
  function livreEm(estado, P, tExc) {
    var S = ins(estado);
    if (arr(S.trechos).some(function (t) { return String(t.id) !== String(tExc) && (d3(t.p1, P) <= TOL_NO || d3(t.p2, P) <= TOL_NO); })) return false;
    if (arr(S.pecas).some(function (k) { return Math.hypot(k.x - P.x, k.z - P.z) <= num(k.hub && k.hub.r, 0.1) + 0.01 && P.y <= k.y + 0.05 && P.y >= k.y - 1; })) return false;   // hid:ok captura da peça (geometria)
    return true;
  }
  function inverterRamal(estado, famAval, no) {
    if (!no || !/^(te|juncao)/.test(txt(no.tipo))) return { ok: false, motivo: "Inverter o ramal vale no tê e na junção." };
    var rs = ramosDoNo(estado, no), al = principal(rs); if (!al) return { ok: false, motivo: "O nó não tem três ramos." };
    var rc = rs[al.c], t = rc.t; if (rc.lado === "passa") return { ok: false, motivo: "O ramal passa direto pelo nó." };
    var u = rs[al.a].dir, ux = u.x, uz = u.z, Lu = Math.hypot(ux, uz); if (Lu < 1e-6) return { ok: false, motivo: "A linha principal é vertical: gire o ramal pela peça." };
    ux /= Lu; uz /= Lu;
    var longe = rc.lado === "p1" ? t.p2 : t.p1, vx = longe.x - no.x, vz = longe.z - no.z, s = vx * ux + vz * uz;
    var nx = r4(no.x + 2 * s * ux - vx), nz = r4(no.z + 2 * s * uz - vz);
    if (Math.hypot(nx - longe.x, nz - longe.z) < 0.005) return { ok: false, motivo: "O ramal está no eixo da linha: nada a inverter." };
    if (!livreEm(estado, longe, t.id)) return { ok: false, motivo: "A outra ponta do ramal " + t.id + " está ligada: inverter desligaria a rede. Solte a ponta ou refaça o ramal." };
    /* revisão A5: a ponta ESPELHADA não pode cair sobre outro tubo ou peça (ligaria sem querer) */
    var novoP = { x: nx, y: longe.y, z: nz }, bate = arr(ins(estado).trechos).filter(function (q) { return String(q.id) !== String(t.id) && distSeg(novoP, q.p1, q.p2) <= num(q.dn, 50) / 2000 + num(t.dn, 50) / 2000 + 0.01; })[0];   // hid:ok raios dos dois tubos + 1 cm
    if (bate) return { ok: false, motivo: "Do outro lado o ramal cairia sobre o tubo " + bate.id + ": não invertido." };
    var bateK = arr(ins(estado).pecas).filter(function (k) { return Math.hypot(k.x - nx, k.z - nz) <= num(k.hub && k.hub.r, 0.15) + 0.02 && longe.y <= k.y + 0.05 && longe.y >= k.y - 1; })[0];   // hid:ok captura da peça (geometria)
    if (bateK) return { ok: false, motivo: "Do outro lado o ramal cairia sobre a peça " + bateK.id + ": não invertido." };
    var o = BI().opDoTrecho(t); o[rc.lado === "p1" ? "p2" : "p1"] = novoP;
    var R = redeDe(simular(entorno(estado, no), [o]), famAval), n2 = noNaRede(R, no);
    if (!n2) return { ok: false, motivo: "Depois de inverter o nó some — não aplicado." };
    return { ok: true, op: o, tipoDepois: n2.tipo };
  }

  /* ================================================================ GIRAR / INVERTER A PEÇA (caixa, ralo) */
  function passoGiro(peca) { var C = dep("BimInstColocar", "./biminstcolocar.js"); return C && C.passoGiroPeca ? C.passoGiroPeca(peca) : (/^(caixa_sifonada|ralo_)/.test(txt(peca)) ? 45 : 90); }
  function normAng(a) { var t = Math.PI * 2; a = a % t; if (a > Math.PI) a -= t; if (a <= -Math.PI) a += t; return Math.round(a * 1e6) / 1e6; }
  function girarPeca(estado, id, graus) {
    var I = BI(), k = arr(ins(estado).pecas).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!k) return { ok: false, motivo: "Selecione uma caixa ou ralo." };
    var a = graus * Math.PI / 180, rN = normAng(num(k.rotY, 0) + a), ops = [{ op: "instAlterar", id: k.id, rotY: rN, saidaGirada: true }];
    /* os tubos que terminam numa BOCA da peça giram junto (a ponta acompanha a boca) */
    var bs = bocasPeca(estado, k).filter(function (b) { return !b.livre; }), co = Math.cos(a), si = Math.sin(a), nT = 0;
    arr(ins(estado).trechos).forEach(function (t) {
      var mud = null;
      ["p1", "p2"].forEach(function (pp) {
        var P = t[pp]; if (!bs.some(function (b) { return d3(b, P) <= num(b.dn, 50) / 2000 + 0.005; })) return;   // hid:ok o raio da boca + 5 mm (o mesmo do HidBocas)
        var dx = P.x - k.x, dz = P.z - k.z;
        mud = mud || I.opDoTrecho(t); mud[pp] = { x: r4(k.x + dx * co + dz * si), y: P.y, z: r4(k.z - dx * si + dz * co) };
      });
      if (mud) { ops.push(mud); nT++; }
    });
    /* revisão A2 (14/11/2026): sem bocas de catálogo os tubos não acompanhariam — com tubo chegando na peça, recusa */
    if (!bocasPeca(estado, k).length) {
      var hr = num(k.hub && k.hub.r, 0.15), chegam = arr(ins(estado).trechos).filter(function (t) { return [t.p1, t.p2].some(function (P) { return Math.hypot(P.x - k.x, P.z - k.z) <= hr + 0.01; }); });   // hid:ok captura (geometria)
      if (chegam.length) return { ok: false, motivo: "Esta peça não tem bocas de catálogo: girando, os " + chegam.length + " tubo(s) ligados ficariam soltos. Solte-os antes ou refaça a ligação." };
    }
    /* e cada tubo que girou: declividade mínima mantida e sem atravessar o corpo da peça (só a ponta na boca anda) */
    var Ii = BI(), rC = 0;
    try { var cc = dep("HidBocas", "./hidbocas.js").catalogo(k.peca, k.dn); rC = cc ? num(cc.diam, 100) / 2000 : 0.05; } catch (eC) { rC = 0.05; }   // hid:ok raio do corpo (mm → m)
    for (var j = 1; j < ops.length; j++) {
      var o2 = ops[j], dh = Math.hypot(o2.p2.x - o2.p1.x, o2.p2.z - o2.p1.z), dy = Math.abs(o2.p2.y - o2.p1.y);
      var grav = Ii.SISTEMAS[o2.sistema] && Ii.SISTEMAS[o2.sistema].gravidade;
      if (grav && dh > 1e-6 && dy > 1e-6) { var im = Ii.declMinDn ? num(Ii.declMinDn(o2.sistema, o2.dn), 0) : 0; if (dy / dh * 100 + 1e-6 < im) return { ok: false, motivo: "Girando, o tubo " + o2.id + " ficaria com " + (Math.round(dy / dh * 10000) / 100) + "% (mínimo " + im + "% para DN " + o2.dn + "): não girado. Refaça a ligação depois de girar." }; }
      /* o eixo em planta passa por DENTRO do corpo (fora os 2 cm junto da boca)? */
      if (dh > 0.03) {   // hid:ok geometria
        var ax = o2.p2.x - o2.p1.x, az = o2.p2.z - o2.p1.z, uu = Math.max(0, Math.min(1, ((k.x - o2.p1.x) * ax + (k.z - o2.p1.z) * az) / (dh * dh)));
        var naBoca = Math.hypot(o2.p1.x - k.x, o2.p1.z - k.z) < Math.hypot(o2.p2.x - k.x, o2.p2.z - k.z) ? 0 : 1, lim = 0.02 / dh;   // hid:ok 2 cm junto da boca
        uu = naBoca === 1 ? Math.min(uu, 1 - lim) : Math.max(uu, lim);
        if (Math.hypot(o2.p1.x + ax * uu - k.x, o2.p1.z + az * uu - k.z) < rC - 0.005) return { ok: false, motivo: "Girando, o tubo " + o2.id + " atravessaria o corpo da peça: não girado. Refaça a ligação depois de girar." };
      }
    }
    return { ok: true, op: lote(ops, "Girar a peça"), rotY: rN, tubos: nT };
  }
  function inverterPeca(estado, id) { return girarPeca(estado, id, 180); }

  /* ================================================================ ENCAIXES (o snap visível) */
  var PRIO = { boca: 0, conector: 0, ponta: 1, meio: 2, eixo: 3 };
  function encaixes(estado, famAval, opts) {
    opts = opts || {}; var I = BI(), out = [], S = ins(estado), sis = opts.sistema || null;
    if (!I) return out;
    try {
      I.conectoresDoEstado(estado, famAval).forEach(function (k) {
        if (sis && k.sistema !== sis) return;
        out.push({ tipo: "conector", nome: "ponto " + txt(k.nome || "do aparelho"), P: { x: k.x, y: k.y, z: k.z }, alvo: { tipo: "aparelho", x: k.x, y: k.y, z: k.z, dn: k.dn, nome: k.nome, famInst: k.famInst, parede: k.parede || null } });
      });
    } catch (e) {}
    arr(S.pecas).forEach(function (k) {
      if (sis && k.sistema !== sis) return;
      bocasPeca(estado, k).forEach(function (b) {
        out.push({ tipo: "boca", nome: b.nome + (b.livre ? "" : " (ocupada)"), P: { x: b.x, y: b.y, z: b.z }, livre: b.livre, alvo: { tipo: "peca", x: b.x, y: b.y, z: b.z, peca: k.peca, id: k.id, hub: k.hub || null, boca: b.boca, dn: b.dn } });
      });
    });
    arr(S.trechos).forEach(function (t) {
      if (sis && t.sistema !== sis) return;
      [["p1", "inicial"], ["p2", "final"]].forEach(function (e) { var p = t[e[0]]; out.push({ tipo: "ponta", nome: "ponta " + e[1] + " do tubo " + t.id + " (DN " + t.dn + ")", P: { x: p.x, y: p.y, z: p.z }, alvo: { tipo: "ponta", x: p.x, y: p.y, z: p.z, dn: t.dn, trecho: t.id } }); });
      var m = { x: r4((t.p1.x + t.p2.x) / 2), y: r4((t.p1.y + t.p2.y) / 2), z: r4((t.p1.z + t.p2.z) / 2) }, vert = Math.abs(t.p1.x - t.p2.x) < 1e-6 && Math.abs(t.p1.z - t.p2.z) < 1e-6;
      out.push({ tipo: "meio", nome: "meio do tubo " + t.id + " (DN " + t.dn + ")", P: m, trecho: t.id, alvo: vert ? { tipo: "vertical", x: t.p1.x, y: m.y, z: t.p1.z, dn: t.dn, trecho: t.id } : { tipo: "meio", x: m.x, y: m.y, z: m.z, dn: t.dn, trecho: t.id } });
    });
    return out;
  }
  /* o encaixe sob o cursor: proj(P) → {x,y} px | null; cur = {x,y}; o.tol (px, 12), o.sistema, o.lista (encaixes já calculados) */
  function encaixeTela(estado, famAval, proj, cur, o) {
    o = o || {}; if (!proj || !cur) return null;
    var tol = num(o.tol, 12), lista = o.lista || encaixes(estado, famAval, o), melhor = null;   // hid:ok 12 px de captura (tela)
    lista.forEach(function (e) {
      var q = proj(e.P); if (!q) return;
      var d = Math.hypot(q.x - cur.x, q.y - cur.y); if (d > tol) return;
      var nota = d + PRIO[e.tipo] * 3;   // hid:ok desempate: boca/ponto antes de ponta antes de meio (px)
      if (!melhor || nota < melhor.nota) melhor = { tipo: e.tipo, nome: e.nome, P: e.P, alvo: e.alvo, livre: e.livre, nota: nota, d: d };
    });
    if (!melhor) {
      /* no corpo do tubo: o ponto do EIXO sob o cursor (o parâmetro na tela vale no mundo — projeção afim por trecho curto) */
      arr(ins(estado).trechos).forEach(function (t) {
        if (o.sistema && t.sistema !== o.sistema) return;
        var a = proj(t.p1), b = proj(t.p2); if (!a || !b) return;
        var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; if (L2 < 4) return;
        var u = ((cur.x - a.x) * dx + (cur.y - a.y) * dy) / L2; if (u <= 0.03 || u >= 0.97) return;
        var d = Math.hypot(a.x + u * dx - cur.x, a.y + u * dy - cur.y); if (d > tol * 0.6 || (melhor && d >= melhor.d)) return;
        var P = { x: r4(t.p1.x + (t.p2.x - t.p1.x) * u), y: r4(t.p1.y + (t.p2.y - t.p1.y) * u), z: r4(t.p1.z + (t.p2.z - t.p1.z) * u) };
        var vert = Math.abs(t.p1.x - t.p2.x) < 1e-6 && Math.abs(t.p1.z - t.p2.z) < 1e-6;
        melhor = { tipo: "eixo", nome: "eixo do tubo " + t.id + " (DN " + t.dn + ")", P: P, d: d, alvo: vert ? { tipo: "vertical", x: t.p1.x, y: P.y, z: t.p1.z, dn: t.dn, trecho: t.id } : { tipo: "meio", x: P.x, y: P.y, z: P.z, dn: t.dn, trecho: t.id } };
      });
    }
    if (melhor) delete melhor.nota;
    return melhor;
  }

  var HidSelecao = { VERSAO: 1, simular: simular, bocasPeca: bocasPeca, propsConexao: propsConexao, itemCatalogo: itemCatalogo, compativeis: compativeis, trocar: trocar,
                     plano2x45: plano2x45, inverterRamal: inverterRamal, girarPeca: girarPeca, inverterPeca: inverterPeca, passoGiro: passoGiro, encaixes: encaixes, encaixeTela: encaixeTela,
                     _ramosDoNo: ramosDoNo };
  global.HidSelecao = HidSelecao;
  if (typeof module !== "undefined" && module.exports) module.exports = HidSelecao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
