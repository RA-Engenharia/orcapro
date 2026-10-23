/* =====================================================================
 * eleauto.js — "LANÇAR PONTOS ELÉTRICOS" (um clique por ambiente) — motor PURO, ES5, Node-testável (21/10/2026).
 *
 * Pedido: por AMBIENTE (o selecionado ou todos), pelo NOME/uso e pela área/perímetro, lançar os PONTOS — iluminação,
 * tomadas de uso geral (TUG), tomadas de uso específico (TUE) dos aparelhos que o modelo já tem e interruptores junto às
 * portas. Circuitos, quadro e dimensionamento de condutor ficam para quando a NBR 5410 for comprada (pendência).
 * Os números e o NÍVEL da fonte moram no js/eleregras.js (NBR 5410:2004 conferida no item, cópia não licenciada: só valores).
 *
 *   EleAuto.leitura(estado, avaliarFam) → { …EsqAuto.leitura, ambientes[{ …, cls, perimetro, alongado }], pontos[], caixas[],
 *                                            aparelhos[], fixos[], boxes[], pias[], lavatorios[] }
 *   EleAuto.gerar({ estado, avaliarFam, ambientes: [ids] | null (todos), criterios })
 *     → { ok, lote ({op:"lote"} — UM Ctrl+Z), ops, itens[], porAmbiente[], avisos[], pendencias[], criterios }
 *   EleAuto.verificar(L, C, cand, h, opcoes) → null (posição livre) | "motivo"   (o auditor usa a mesma régua de posição)
 *
 * O PONTO = a família do dispositivo (ra-tomada / ra-interruptor / ra-luminaria, js/familiasra.js) + a CAIXA elétrica
 *   (peça caixa_4x2 / caixa_octogonal das instalações, js/biminst.js). O orçamento já sabe orçar as duas: o dispositivo
 *   pela SINAPI da altura (js/biminst.js itemDispositivo — tomada baixa/média/alta, interruptor, plafon) e a caixa pela
 *   SINAPI da caixa (91939-91941 parede, 91936 laje). Nada aqui grava código: não há cobrança dupla, e trocar o tipo da
 *   tomada troca o código sozinho. A SINAPI MG 06/2026 NÃO tem composição "PONTO DE TOMADA/ILUMINAÇÃO" (conferido na
 *   base: nenhuma descrição "PONTO DE …" elétrica) — eletroduto e cabo do ponto entram com os circuitos (pendência).
 * IDEMPOTENTE: o que já existe conta (rodar de novo não duplica); ponto movido à mão não é tocado (nenhuma op sobre ele).
 * POSIÇÃO: nunca em vão de porta/janela (pela altura: tomada baixa sob a janela pode), atrás da folha aberta, atrás de
 *   móvel fixo, a < 0,60 m do box (banheiro), no canto ou colada noutro ponto. TUG distribuída "tão uniformemente quanto
 *   possível" (NBR 5410 9.5.2.2.1 d) pelo perímetro: a cada nova, a posição livre mais longe das que existem.
 * Teste: node tools/test-ele-pontos.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function RG() { return dep("EleRegras", "./eleregras.js"); }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function ER() { return dep("EsqRegras", "./esqregras.js"); }
  function VA() { return dep("BimVaoArr", "./bimvaoarr.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
  function dist(a, b) { var d = sub(a, b); return Math.sqrt(dot(d, d)); }
  function distSeg(p, a, b) { var e = sub(b, a), l2 = dot(e, e), k = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), e) / l2)) : 0; return dist(p, add(a, e, k)); }
  function distPol(p, P, dentro) { if (dentro(p, P)) return 0; var m = Infinity; for (var i = 0; i < P.length; i++) m = Math.min(m, distSeg(p, P[i], P[(i + 1) % P.length])); return m; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function frente(f) { var r = num(f.rotY, 0); return [Math.sin(r), Math.cos(r)]; }
  function local(f, lx, lz) { var r = num(f.rotY, 0), c = Math.cos(r), s = Math.sin(r); return [num(f.x, 0) + lx * c + lz * s, num(f.z, 0) - lx * s + lz * c]; }
  var PREFIXO = /^ele[ltie]-/;

  /* ---------------------------------------------------------------- LEITURA */
  function leitura(estado, avaliarFam) {
    var E = EA(), R = RG(), L = E.leitura(estado, avaliarFam), dentro = E.dentro;
    var famPorId = {}; arr(estado && estado.familias).forEach(function (f) { if (f && f.id != null) famPorId[String(f.id)] = f; });
    function aval(f) { try { return typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst) : null; } catch (e) { return null; } }
    var forros = {}; arr(estado && estado.forros).forEach(function (f) { if (f && f.ambienteId != null) forros[String(f.ambienteId)] = true; });
    L.ambientes.forEach(function (a) {
      a.cls = R.classificar(a.nome);
      var P = a.pts, per = 0, best = null;
      for (var i = 0; i < P.length; i++) { var q = P[(i + 1) % P.length], l = dist(P[i], q); per += l; if (!best || l > best.l) best = { l: l, u: [(q[0] - P[i][0]) / (l || 1), (q[1] - P[i][1]) / (l || 1)] }; }
      a.perimetro = r4(per);
      var u = best ? best.u : [1, 0], v = [-u[1], u[0]], s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
      P.forEach(function (p) { var s = dot(p, u), t = dot(p, v); s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); });
      a.quadro = { u: u, v: v, s0: s0, s1: s1, t0: t0, t1: t1 };
      var Ls = s1 - s0, Lt = t1 - t0, comp = Math.max(Ls, Lt), larg = Math.max(0.01, Math.min(Ls, Lt));
      a.comprimento = r4(comp);
      a.alongado = a.tipo.id === "circulacao" || a.tipo.id === "escada" || comp / larg >= R.CRITERIOS.alongado.valor - 1e-9;
      a.forro = !!forros[a.id];
      a._paredes = a.trechos.map(function (tr) { return L.porParede[tr.paredeId]; }).filter(Boolean);
      if (!(a.pe > 1.5)) a.pe = 2.6;
    });
    function ambDe(p, pav) { for (var i = 0; i < L.ambientes.length; i++) { var b = L.ambientes[i]; if (b.pav === pav && dentro(p, b.pts)) return b.id; } return null; }
    function pavDe(y) { var k = 0; arr(L.pavimentos).forEach(function (p, i) { if (y >= p.cota - 0.3) k = i; }); return k; }
    L.ambDe = ambDe; L.pavDe = pavDe;
    /* pontos elétricos que já existem (famílias de dispositivo) */
    L.pontos = []; L.caixas = []; L.aparelhos = []; L.chuveirosIndef = []; L.fixos = []; L.boxes = []; L.chuveiros = []; L.pias = []; L.lavatorios = []; L.bancadas = [];
    var movPorId = {}; L.moveis.forEach(function (m) { movPorId[m.id] = m; });
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || f.id == null) return;
      var av = aval(f), va = (av && av.valores) || {}, ins = f.inst || {}, fid = String(f.famId || ""), id = String(f.id);
      var peca = av && av.mep && av.mep.peca ? av.mep.peca : (/^ra-tomada/.test(fid) ? "tomada" : /^ra-interruptor/.test(fid) ? "interruptor" : /^ra-luminaria/.test(fid) ? "luminaria" : null);
      var y = num(f.y, 0), pav = pavDe(y);
      if (peca === "tomada" || peca === "interruptor" || peca === "luminaria") {
        var h = num(ins.Altura_montagem, num(va.Altura_montagem, peca === "luminaria" ? 2.6 : 0.3));
        var p = [num(f.x, 0), num(f.z, 0)], fr = frente(f), amb = peca === "luminaria" ? ambDe(p, pav) : (ambDe(add(p, fr, 0.08), pav) || ambDe(p, pav) || ambDe(add(p, fr, -0.08), pav));
        L.pontos.push({ id: id, kind: peca, famId: fid, tipoId: txt(f.tipoId), x: p[0], z: p[1], p: p, y: y, h: h, rotY: num(f.rotY, 0), dir: fr, amb: amb, pav: pav, auto: PREFIXO.test(id), corrente: num(va.Corrente_A, 10), fixo: !!f.fixo });
        return;
      }
      var m = movPorId[id];
      /* as alturas do móvel ficam DO PISO do pavimento dele (a régua de posição compara com a altura do ponto, que é do piso).
         Revisão 21/10/2026: antes eram a cota absoluta — no pavimento de cima o guarda-roupa "ficava" a 2,95 m, a tomada ia
         atrás dele, e a bancada da pia (tampo a 3,85 m) não era bancada: a cozinha de cima ficava sem as tomadas da 9.5.2.2.1 b). */
      var yRel = y - num((arr(L.pavimentos)[pav] || {}).cota, 0);
      var cx = av && av.caixa, y0 = yRel + (cx && isFinite(cx.y0) ? cx.y0 : 0), y1 = yRel + (cx && isFinite(cx.y1) ? cx.y1 : 2.2);
      var topo = null;
      if (m && R.BANCADA.test(fid)) {
        /* o TAMPO (a caixa da família sobe até a torneira): acima dele a tomada "sobre a bancada" pode */
        topo = yRel + num(va.Altura, num(va.Altura_borda, cx && isFinite(cx.y1) ? Math.min(cx.y1, 1.0) : 0.9));
        L.bancadas.push({ id: id, famId: fid, nome: m.nome, pts: m.pts, topo: topo, pav: m.pav });
      }
      if (m && R.FIXO.test(fid)) L.fixos.push({ id: id, famId: fid, nome: m.nome, pts: m.pts, y0: y0, y1: topo != null ? Math.min(y1, topo) : y1, pav: m.pav });
      if (m && R.BOX.test(fid)) L.boxes.push({ id: id, pts: m.pts, pav: m.pav });
      if (R.CHUVEIRO.test(fid)) L.chuveiros.push({ id: id, f: f, p: [num(f.x, 0), num(f.z, 0)], dir: frente(f), pav: pav });
      if (R.PIA.test(fid) && !(fid === "ra-coz-inferior" && va.Com_cuba === false)) {
        /* a cuba da bancada de cozinha: o desenho do js/familiasmobcoz.js põe a cuba no meio, ou a 0,55 m da ponta quando há cooktop */
        var Lb = num(va.Comprimento, 0), xc = fid === "ra-coz-inferior" ? (va.Com_cooktop ? -Lb / 2 + Math.min(0.55, Lb * 0.3) : 0) : 0;
        var zc = fid === "ra-coz-inferior" ? num(va.Profundidade, 0.6) / 2 : 0;   /* a pia de louça do Hidro: a origem já é o centro da cuba */
        L.pias.push({ id: id, p: local(f, xc, zc), pav: pav, estimada: fid !== "hid-pia-cozinha" });
      }
      if (R.LAVATORIO.test(fid)) L.lavatorios.push({ id: id, p: local(f, 0, cx && isFinite(cx.z0) && cx.z0 < -0.05 ? 0 : 0.2), costas: local(f, 0, cx && isFinite(cx.z0) ? cx.z0 : 0), pav: pav });
      R.aparelhosDe(fid, va, ins).forEach(function (d) {
        var ax = d.lateral || 0, pc = d.posLocal === "cooktop" ? local(f, num(va.Comprimento, 0) / 2 - Math.min(0.55, num(va.Comprimento, 0) * 0.25), 0) : local(f, ax, 0);
        L.aparelhos.push({ chave: id + (d.sufixo ? "-" + d.sufixo : ""), id: id, def: d, f: f, va: va, p: pc, dir: frente(f), pav: pav, amb: ambDe(add(pc, frente(f), 0.3), pav) || ambDe(pc, pav), pts: m ? m.pts : null });
      });
      if (R.chuveiroIndefinido(fid)) L.chuveirosIndef.push({ id: id, p: [num(f.x, 0), num(f.z, 0)], pav: pav, amb: ambDe(add([num(f.x, 0), num(f.z, 0)], frente(f), 0.3), pav) });
    });
    var inst = (estado && estado.instalacoes) || {};
    arr(inst.pecas).forEach(function (k) {
      if (!k || !/^caixa_/.test(String(k.peca))) return;
      L.caixas.push({ id: String(k.id), peca: k.peca, p: [num(k.x, 0), num(k.z, 0)], y: num(k.y, 0), h: num(k.alturaPiso, null), rotY: num(k.rotY, 0), dir: [Math.sin(num(k.rotY, 0)), Math.cos(num(k.rotY, 0))], pav: pavDe(num(k.y, 0) - 0.5), auto: PREFIXO.test(String(k.id)) });
    });
    /* a caixa de cada ponto (a ≤ 10 cm, mesma altura) e a caixa SOLTA (sem dispositivo = ligação direta, ou ponto órfão) */
    /* UM ponto, UMA caixa: o par mais perto primeiro (revisão 21/10/2026 — antes duas caixas atrás da mesma tomada tinham as
       duas o mesmo "dono", o auditor ficava calado e o orçamento cobrava as duas) */
    var pares = [];
    L.caixas.forEach(function (c, ic) {
      c.dono = null;
      L.pontos.forEach(function (p, ip) { var d = dist(p.p, c.p); if (d <= 0.10 && Math.abs(p.y + p.h - c.y) <= 0.12) pares.push({ ic: ic, ip: ip, d: d + Math.abs(p.y + p.h - c.y) }); });
      c.amb = L.ambDe(add(c.p, c.dir, 0.1), c.pav) || L.ambDe(c.p, c.pav);
    });
    pares.sort(function (x, y) { return x.d - y.d || x.ic - y.ic; }).forEach(function (q) {
      var c = L.caixas[q.ic], p = L.pontos[q.ip];
      if (c.dono || p.caixa) return;
      c.dono = p.id; p.caixa = c.id;
    });
    /* o VOLUME 1 do banheiro: o box modelado (ou a banheira); sem box, o raio de 0,60 m em volta da saída do chuveiro
       (NBR 5410 9.1.2.1, Figura 18 — chuveiro sem piso-boxe). O volume 2 (mais 0,60 m) é o afastBox da régua de posição. */
    L.chuveiros.forEach(function (ch) {
      if (L.boxes.some(function (b) { return b.pav === ch.pav && distPol(ch.p, b.pts, dentro) < 0.5; })) return;
      var rv = R.CRITERIOS.raioVolume1.valor, c0 = add(ch.p, ch.dir, R.CRITERIOS.saidaChuveiro.valor), pts = [];
      for (var k = 0; k < 16; k++) { var an = Math.PI * 2 * k / 16; pts.push([c0[0] + rv / Math.cos(Math.PI / 16) * Math.cos(an), c0[1] + rv / Math.cos(Math.PI / 16) * Math.sin(an)]); }
      L.boxes.push({ id: ch.id, pts: pts, pav: ch.pav, estimado: true });
    });
    L.boxes.forEach(function (b) { var m = b.pts.reduce(function (s0, q) { return [s0[0] + q[0] / b.pts.length, s0[1] + q[1] / b.pts.length]; }, [0, 0]); b.amb = ambDe(m, b.pav); });
    return L;
  }

  /* ---------------------------------------------------------------- CANDIDATOS na parede (de 10 em 10 cm) */
  function candidatos(L, estado, avaliarFam, a, C) {
    var E = EA(), V = VA(), out = [], fc = C.folgaCanto.valor;
    a.trechos.forEach(function (tr, kt) {
      var w = L.porParede[tr.paredeId]; if (!w) return;
      var Rf = V ? V.referencias(estado, avaliarFam, tr.paredeId) : null, base = Rf ? Rf.livres.map(function (s) { return [s.a, s.b]; }) : [[tr.t0, tr.t1]];
      var n = E.eixoN(w.rotY), dirIn = [n[0] * tr.lado, n[1] * tr.lado], rotY = Math.atan2(dirIn[0], dirIn[1]);
      base.forEach(function (s) {
        var a0 = Math.max(s[0], tr.t0) + fc, b0 = Math.min(s[1], tr.t1) - fc; if (b0 - a0 < 0.02) return;
        var nP = Math.max(1, Math.round((b0 - a0) / 0.1));
        for (var k = 0; k <= nP; k++) {
          var t = a0 + (b0 - a0) * k / nP, P = E.ptParede(w, t, tr.lado * w.espessura / 2);
          out.push({ tr: tr, kt: kt, w: w, t: r4(t), P: P, dir: dirIn, rotY: r4(rotY), s: perimetroDe(a.pts, P) });
        }
      });
    });
    return out;
  }
  /* a coordenada do ponto ao longo do perímetro do ambiente (para distribuir por igual) */
  function perimetroDe(P, p) {
    var best = null, acc = 0;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], e = sub(b, a), l = Math.sqrt(dot(e, e)), k = l > 0 ? clamp(dot(sub(p, a), e) / (l * l), 0, 1) : 0, d = dist(p, add(a, e, k));
      if (!best || d < best.d) best = { d: d, s: acc + k * l };
      acc += l;
    }
    return best ? best.s : 0;
  }

  /* ---------------------------------------------------------------- A RÉGUA DE POSIÇÃO (lançador e auditor)
     cand = { w (parede), t, P (ponto na face), dir (para dentro do ambiente), pav }; h = altura do centro (m do piso);
     opcoes = { exceto: id do aparelho dono (TUE atrás do próprio aparelho pode), semBox, novos: [pontos já escolhidos], ignorar: id } */
  function verificar(L, C, cand, h, o) {
    o = o || {};
    var E = EA(), dentro = E.dentro, w = cand.w, folga = C.folgaVao.valor, i;
    /* o ambiente do ponto: a folha da porta e o box só valem no ambiente DELES (revisão 21/10/2026 — antes a tomada do
       quarto, do outro lado da parede, era "atrás da folha" da porta do corredor ou "a menos de 0,60 m do box" do banheiro) */
    var ambC = L.ambDe ? L.ambDe(add(cand.P, cand.dir, 0.08), cand.pav) : null;
    for (i = 0; i < L.vaos.length; i++) {
      var v = L.vaos[i]; if (!w || v.parede !== w.id) continue;
      if (Math.abs(cand.t - v.t) < v.largura / 2 + folga + 0.0375 && h >= v.peitoril - folga - 1e-6 && h <= v.peitoril + v.altura + folga + 1e-6) return "no vão " + (v.tipo === "porta" ? "da porta " : "da janela ") + v.id;
    }
    for (i = 0; i < L.vaos.length; i++) {
      var d = L.vaos[i]; if (d.tipo !== "porta" || d.correr || d.pav !== cand.pav) continue;
      var wd = L.porParede[d.parede]; if (!wd) continue;
      var u = E.eixoU(wd.rotY), n = E.eixoN(wd.rotY), sH = d.maoDireita ? 1 : -1, lado = d.abreFora ? 1 : -1;
      var H = E.ptParede(wd, d.t + sH * d.folha / 2, lado * wd.espessura / 2), dF = [-sH * u[0], -sH * u[1]], dA = [lado * n[0], lado * n[1]];
      var ambF = ambC && L.ambDe ? L.ambDe(add(add(H, dA, d.folha / 2), dF, d.folha / 2), d.pav) : null;
      if (ambC && ambF && ambF !== ambC) continue;
      var q = sub(cand.P, H), x = dot(q, dF), y = dot(q, dA);
      if (x >= -C.atrasPorta.valor && x <= 0.02 && y >= -0.02 && y <= d.folha + 0.05) return "atrás da folha aberta da porta " + d.id;
      if (x > 0.02 && y > 0.02 && x * x + y * y <= d.folha * d.folha) return "na varredura da porta " + d.id;
    }
    var pin = add(cand.P, cand.dir, 0.08);
    for (i = 0; i < L.fixos.length; i++) {
      var m = L.fixos[i]; if (m.pav !== cand.pav || m.id === o.exceto) continue;
      if (dentro(pin, m.pts) && h >= m.y0 - 0.06 && h <= m.y1 + 0.06) return "atrás de " + (m.nome || m.id);
    }
    if (!o.semBox) for (i = 0; i < L.boxes.length; i++) {
      var b = L.boxes[i]; if (b.pav !== cand.pav || (ambC && b.amb && b.amb !== ambC)) continue;
      if (distPol(cand.P, b.pts, dentro) < C.afastBox.valor - 1e-6) return "a menos de " + f2(C.afastBox.valor) + " m do box";
    }
    /* colado noutro ponto da MESMA face (o das duas faces da parede, costas com costas, pode) */
    var outros = L.pontos.map(function (p) { return { id: p.id, P: p.p, y: p.kind === "luminaria" ? null : p.h, pav: p.pav, dir: p.dir }; }).concat(arr(o.novos));
    for (i = 0; i < outros.length; i++) {
      var p = outros[i]; if (p.y == null || p.pav !== cand.pav || p.id === o.ignorar || (p.dir && dot(p.dir, cand.dir) < 0.5)) continue;
      if (dist(p.P, cand.P) < C.entrePontos.valor - 1e-6 && Math.abs(p.y - h) < 0.15) return "colado no ponto " + p.id;
    }
    return null;
  }

  /* a face da parede do ambiente em volta do trecho: os trechos vizinhos da MESMA parede e do mesmo lado, emendados
     (o trecho se parte onde muda o ambiente do outro lado; a face do ambiente continua) */
  function faixaNaParede(a, tr) {
    var L = a.trechos.filter(function (x) { return x.paredeId === tr.paredeId && x.lado === tr.lado; }).sort(function (x, y) { return x.t0 - y.t0; });
    var t0 = tr.t0, t1 = tr.t1, mudou = true;
    while (mudou) { mudou = false; L.forEach(function (x) { if (x.t1 >= t0 - 0.03 && x.t0 < t0 - 1e-6) { t0 = x.t0; mudou = true; } if (x.t0 <= t1 + 0.03 && x.t1 > t1 + 1e-6) { t1 = x.t1; mudou = true; } }); }
    return { paredeId: tr.paredeId, lado: tr.lado, t0: t0, t1: t1, vizinho: tr.vizinho };
  }

  /* os lados do contorno SEM parede (a passagem do ambiente integrado): o lado que não tem candidato nenhum por perto */
  function passagens(a, cands) {
    var P = a.pts, out = [], acc = 0;
    for (var i = 0; i < P.length; i++) {
      var p = P[i], q = P[(i + 1) % P.length], l = dist(p, q), s0 = acc; acc += l; if (l < 0.3) continue;
      var m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      var k = Math.min(0.3, l / 3) / l, p2 = add(p, sub(q, p), k), q2 = add(q, sub(p, q), k);   /* o miolo do lado (o canto tem candidato da parede vizinha) */
      if (!a.trechos.length || !cands.some(function (c) { return distSeg(c.P, p2, q2) < 0.2; })) { var o = [p, q, m]; o.s0 = s0; o.s1 = s0 + l; out.push(o); }
    }
    return out;
  }
  /* o ponto do contorno não tem parede (nenhum trecho do ambiente passa por ele) */
  function semParede(a, m) {
    var E = EA();
    return !a.trechos.some(function (tr) {
      var w = null; arr(a._paredes).some(function (x) { if (x.id === tr.paredeId) { w = x; return true; } return false; });
      if (!w) return false;
      var u = E.eixoU(w.rotY), n = E.eixoN(w.rotY), q = sub(m, [w.cx, w.cz]), t = dot(q, u), s = dot(q, n);
      return t >= tr.t0 - 0.05 && t <= tr.t1 + 0.05 && Math.abs(s) <= w.espessura / 2 + 0.05;
    });
  }
  /* o maior trecho de perímetro COM PAREDE sem tomada: os lados abertos (passagem) não contam — lá não cabe tomada */
  function maiorTrecho(P, ss, abertos) {
    ss = ss.slice().sort(function (x, y) { return x - y; }); if (ss.length < 2) return 0;
    function aberto(a0, b0) { var t = 0; arr(abertos).forEach(function (o) { t += Math.max(0, Math.min(b0, o.s1) - Math.max(a0, o.s0)); }); return t; }
    var g = 0;
    for (var i = 0; i < ss.length; i++) {
      var d = i + 1 < ss.length ? (ss[i + 1] - ss[i]) - aberto(ss[i], ss[i + 1]) : (P - ss[i]) - aberto(ss[i], P) + ss[0] - aberto(0, ss[0]);
      g = Math.max(g, d);
    }
    return g;
  }

  /* o ponto que já existe SERVE ao aparelho? (revisão 21/10/2026) — aparelho de LIGAÇÃO DIRETA (chuveiro, forno, cooktop: NBR 5410
     9.5.2.3 e corrente acima de 20 A) só aceita a caixa sem dispositivo, nunca uma tomada; o de tomada aceita a caixa sem
     dispositivo ou a tomada de corrente ≥ a que ele pede (lavadora de 11,8 A não fica na tomada de 10 A).
     Antes, qualquer tomada a ≤ 1,50 m virava "o ponto do aparelho": a tomada 10 A perto do chuveiro de 6.000 W passava, o
     chuveiro ficava sem a caixa de ligação direta e o auditor não via nem o volume 2 nela. */
  function serveTue(Q, q) {
    if (!q) return false;
    var ehCaixa = q.peca != null && q.kind == null;
    if (Q.tom.ligacao === "direta") return ehCaixa;
    if (ehCaixa) return true;
    return num(q.corrente, 10) >= (Q.tom.tipoId === "t20" ? 20 : 10) - 1e-9;
  }

  /* ---------------------------------------------------------------- GERAR */
  function gerar(o) {
    o = o || {};
    var R = RG(), E = EA(), ESQ = ER(), est = o.estado, aval = o.avaliarFam, C = R.criterios(o.criterios), L = leitura(est, aval), dentro = E.dentro;
    var ops = [], itens = [], avisos = [], pend = [], porAmb = [], usados = {}, novos = [];
    arr(est && est.familias).forEach(function (f) { if (f) usados[String(f.id)] = 1; });
    arr(est && est.caixas).forEach(function (c) { if (c) usados[String(c.id)] = 1; });
    arr(est && est.instalacoes && est.instalacoes.pecas).forEach(function (k) { if (k) usados[String(k.id)] = 1; });
    arr(est && est.instalacoes && est.instalacoes.trechos).forEach(function (k) { if (k) usados[String(k.id)] = 1; });
    function novoId(pref) { var k = 1, id = pref; while (usados[id] || usados[id + "-cx"]) id = pref + "-" + (++k); usados[id] = 1; usados[id + "-cx"] = 1; return id; }
    if (!L.ambientes.length) return { ok: false, motivo: "Não há ambiente delimitado no modelo: lance os ambientes (Arquitetura › Ambiente) e rode de novo.", ops: [], itens: [], avisos: [], pendencias: [], porAmbiente: [], criterios: C };
    var sel = o.ambientes ? o.ambientes.map(String) : null, alvo = L.ambientes.filter(function (a) { return !sel || sel.indexOf(String(a.id)) >= 0; });
    if (!alvo.length) return { ok: false, motivo: "Selecione um ambiente (ou use \"todos\").", ops: [], itens: [], avisos: [], pendencias: [], porAmbiente: [], criterios: C };
    var porId = {}; L.ambientes.forEach(function (a) { porId[a.id] = a; });

    /* põe o PONTO: família + caixa (ou só a caixa: ligação direta) */
    function lancar(kind, pref, a, cand, h, tipoId, extra) {
      var id = novoId(pref), base = a.base, pt = add(cand.P, cand.dir, 0.005), cx = add(cand.P, cand.dir, -0.025);
      if (kind !== "direta") ops.push({ op: "familia", id: id, famId: kind === "tomada" ? "ra-tomada" : "ra-interruptor", tipoId: tipoId, x: r4(pt[0]), y: r4(base), z: r4(pt[1]), rotY: cand.rotY, inst: { Altura_montagem: r4(h) } });
      ops.push({ op: "peca", id: kind === "direta" ? id : id + "-cx", peca: "caixa_4x2", sistema: "eletrica", material: "pvc", x: r4(cx[0]), y: r4(base + h), z: r4(cx[1]), rotY: cand.rotY, alturaPiso: r4(h) });
      novos.push({ id: id, P: cand.P, y: h, pav: a.pav, kind: kind, t: cand.t, parede: cand.w.id, dir: cand.dir });
      var it = { id: id, tipo: kind, ambiente: a.id, ambienteNome: a.nome, tipoId: tipoId || null, altura: r4(h), parede: cand.w.id, caixa: kind === "direta" ? id : id + "-cx", regras: [] };
      Object.keys(extra || {}).forEach(function (k) { it[k] = extra[k]; });
      itens.push(it);
      return it;
    }
    function rotAltura(h) { return Math.abs(h - C.alturaBaixa.valor) < 0.06 ? "baixa " + f2(h) + " m (" + R.rotuloNivel(C.alturaBaixa.nivel) + ")" : Math.abs(h - C.alturaAlta.valor) < 0.06 ? "alta " + f2(h) + " m (" + R.rotuloNivel(C.alturaAlta.nivel) + ")" : f2(h) + " m"; }

    /* os pontos existentes por ambiente */
    function pontosDe(a, kind) { return L.pontos.filter(function (p) { return p.amb === a.id && p.kind === kind; }); }
    function caixasSoltasDe(a) { return L.caixas.filter(function (c) { return c.amb === a.id && !c.dono; }); }

    alvo.forEach(function (a) {
      var cls = a.cls, g = cls.grupo, cands = candidatos(L, est, aval, a, C).map(function (c) { c.pav = a.pav; return c; });
      var res = { ambiente: a.id, nome: a.nome, grupo: g, grupoRotulo: cls.grupoRotulo, area: r4(a.area), perimetro: a.perimetro, luz: {}, tug: {}, tue: [], interruptores: {} };
      if (!cls.casou) avisos.push("\"" + a.nome + "\": nome sem tipo conhecido — usei a regra dos \"demais cômodos\". Nomeie o ambiente (Sala, Quarto, Cozinha, Banheiro…).");
      function livre(c, h, op) { return verificar(L, C, c, h, { exceto: op && op.exceto, semBox: op && op.semBox, novos: novos }); }

      /* ---------- TUE: os aparelhos do ambiente */
      var usadosTue = {};
      L.aparelhos.filter(function (ap) { return ap.amb === a.id; }).forEach(function (ap) {
        var d = ap.def, btu = num(ap.f.inst && ap.f.inst.Capacidade_BTUh, num(ap.va.Capacidade_BTUh, 0)), Q = R.tueDe(d, btu, C), potW = Q.potW, pAr = Q.pAr;
        var tom = Q.tom, pref = "elee-" + ap.chave, dMax = C.distTue.valor;
        /* o ponto do próprio lançador (o id dele) também precisa estar a ≤ 1,50 m: aparelho movido para longe ganha ponto novo
           (revisão 21/10/2026 — antes o ponto velho, do outro lado da cozinha, "servia" para sempre: 4.2.1.2.3 d) */
        var perto = function (q) { return (q.id === pref || !q.auto) && dist(q.p, ap.p) <= dMax + 1e-6; };
        L.pontos.concat(L.caixas).filter(function (q) { return q.id === pref && dist(q.p, ap.p) > dMax + 1e-6; }).slice(0, 1).forEach(function (q) {
          avisos.push("\"" + a.nome + "\": o ponto " + q.id + " ficou a " + f2(dist(q.p, ap.p)) + " m de " + d.rotulo + " (o aparelho foi movido?) — lancei outro junto dele; apague o " + q.id + " se não for usado.");
        });
        var feito = L.pontos.filter(function (p) { return p.kind === "tomada" && p.pav === ap.pav && !usadosTue[p.id] && perto(p) && serveTue(Q, p); })[0] ||
                    L.caixas.filter(function (c) { return !c.dono && c.pav === ap.pav && !usadosTue[c.id] && perto(c) && serveTue(Q, c); })[0];
        var item = { aparelho: ap.id, nome: d.rotulo, potencia_W: potW, tensao_V: d.tensao, ligacao: tom.ligacao };
        res.tue.push(item);
        if (feito) { usadosTue[feito.id] = 1; item.existente = feito.id; return; }
        L.pontos.filter(function (p) { return p.kind === "tomada" && p.pav === ap.pav && !usadosTue[p.id] && perto(p) && !serveTue(Q, p); }).slice(0, 1).forEach(function (p) {
          avisos.push("\"" + a.nome + "\": a tomada " + p.id + " (" + num(p.corrente, 10) + " A) junto de " + d.rotulo + " não serve a ele (" + (tom.ligacao === "direta" ? "ligação direta, sem tomada" : "tomada de " + (tom.tipoId === "t20" ? "20" : "10") + " A") + "): lancei o ponto certo; a " + p.id + " ficou como tomada de uso geral.");
        });
        if (d.semParede) { pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": " + d.rotulo + " (" + ap.id + ") fica no meio do ambiente — o ponto vem pelo piso: lance à mão." }); return; }
        var h = R.alturaDe(d.altura, C), op = { exceto: ap.id, semBox: !!d.noVolume };   /* a caixa do próprio aparelho do volume pode (9.1.4.2.4) */
        var lista = cands.filter(function (c) { return dist(c.P, ap.p) <= dMax + 1e-6; }).sort(function (x, y) { return dist(x.P, ap.p) - dist(y.P, ap.p); });
        var esc = null, motivo = null;
        for (var i = 0; i < lista.length && !esc; i++) { var mv = livre(lista[i], h, op); if (!mv) esc = lista[i]; else if (!motivo) motivo = mv; }
        if (!esc) { pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": não achei parede livre a ≤ " + f2(dMax) + " m de " + d.rotulo + " (" + ap.id + ")" + (motivo ? " — " + motivo : "") + ". Lance o ponto à mão." }); return; }
        var it = lancar(tom.ligacao === "direta" ? "direta" : "tomada", pref, a, esc, h, tom.tipoId, { aparelho: ap.id, uso: "TUE", aparelhoNome: d.rotulo });
        usadosTue[it.id] = 1; item.lancado = it.id;
        it.regras.push((Q.exclusivo ? "circuito independente do aparelho (acima de 10 A — " + R.citar(C.correnteExclusivo) + ")" : "ponto dedicado ao aparelho (" + R.rotuloNivel("C") + "; até 10 A a 9.5.3.1 não exige circuito independente)") + (tom.corrente ? "; I ≈ " + f2(tom.corrente) + " A" : ""));
        it.regras.push(potW ? "potência típica " + potW + " W em " + d.tensao + " V (" + R.FONTES.CEMIG + ", " + d.cemig + (pAr ? ", " + pAr.btuTabela + " BTU/h" : "") + " — " + R.rotuloNivel("A") + "; a placa do aparelho manda)" : "potência: a da placa do aparelho (pendente)");
        it.regras.push(tom.ligacao === "direta" ? "ligação direta (sem tomada" + (/^chuveiro/.test(d.id) ? ": aquecedor elétrico de água, NBR 5410 9.5.2.3 — " + R.rotuloNivel("N") : "") + "): caixa 4×2 " + rotAltura(h) : "tomada 2P+T " + (tom.tipoId === "t20" ? "20" : "10") + " A, " + rotAltura(h) + " (corte 10/20 A: " + R.rotuloNivel(C.correnteT20.nivel) + ")");
        it.regras.push("a ≤ " + f2(dMax) + " m do aparelho (" + R.citar(C.distTue) + "); potência atribuída = a nominal do aparelho (NBR 5410 4.2.1.2.3 c — " + R.rotuloNivel("N") + ")");
        if (d.confirmar) pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": " + d.confirmar + " (" + it.id + ")." });
        if (!potW) pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": " + d.rotulo + " (" + ap.id + ") sem potência conhecida — informe a da placa." + (d.potW === "btu" ? " (Capacidade em BTU/h não informada: rode o dimensionamento da climatização.)" : "") });
      });
      L.chuveirosIndef.filter(function (ch) { return ch.amb === a.id; }).forEach(function (ch) {
        pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": o chuveiro " + ch.id + " não diz se é elétrico. Use o chuveiro do Hidro com \"Elétrico\" = sim (o ponto sai sozinho) ou lance o ponto à mão." });
      });

      /* ---------- TUG */
      var exist = pontosDe(a, "tomada").filter(function (p) { return !usadosTue[p.id] && !/^elee-/.test(p.id); });
      var nExig = R.nTug(g, a.area, a.perimetro, C), regra = R.regraTug(g, C), falta = Math.max(0, nExig - exist.length), escolhidos = [];
      res.tug = { exigido: nExig, existente: exist.length, lancado: 0, regra: regra.item, va: R.vaTug(g, Math.max(nExig, exist.length), C) };
      function alturaTug(c) {
        if (g !== "cozinha_servico" && g !== "banheiro") return { h: C.alturaBaixa.valor };
        var pin = add(c.P, c.dir, 0.08), bc = L.bancadas.filter(function (b) { return b.pav === a.pav && b.topo <= 1.05 && dentro(pin, b.pts); })[0];
        if (bc) return { h: r4(clamp(bc.topo + C.sobreBancada.valor, 1.10, C.alturaMedia.valor)), bancada: bc.id };
        /* banheiro: a tomada do lavatório fica na altura de bancada (faixa 1,10–1,30 da pesquisa), mesmo ao lado dele */
        if (g === "banheiro") return { h: 1.10, lavatorio: true };
        return { h: C.alturaBaixa.valor };
      }
      var livres = [];
      cands.forEach(function (c) { var ah = alturaTug(c); if (!livre(c, ah.h)) livres.push({ c: c, h: ah.h, bancada: ah.bancada || null, lavatorio: !!ah.lavatorio }); });
      function tomarTug(x, uso, extra) {
        var it = lancar("tomada", "elet-" + a.id, a, x.c, x.h, "t10", { uso: "TUG" });
        escolhidos.push({ s: x.c.s, id: it.id }); res.tug.lancado++;
        it.regras.push("tomadas do ambiente (" + cls.grupoRotulo + "): mínimo " + nExig + " — " + R.citar(regra));
        it.regras.push(uso + "; " + (x.bancada || x.lavatorio ? (x.bancada ? "sobre a bancada, " : "na altura do lavatório, ") + f2(x.h) + " m (" + R.rotuloNivel(C.sobreBancada.nivel) + "; orçada como média — " + R.rotuloNivel("A") + ")" : rotAltura(x.h)));
        Object.keys(extra || {}).forEach(function (k) { it[k] = extra[k]; });
        livres = livres.filter(function (y) { return !verificarNovo(y); });
        function verificarNovo(y) { return y.c.w.id === x.c.w.id && Math.abs(y.c.t - x.c.t) < C.entrePontos.valor - 1e-6; }
        return it;
      }
      /* cozinha: ≥ 2 acima da bancada da pia, longe do ponto d'água */
      if (g === "cozinha_servico" && a.tipo.id !== "area_servico") {
        var pias = L.pias.filter(function (pp) { return pp.pav === a.pav && dentro(pp.p, a.pts); });
        if (pias.length) {
          var pia = pias[0], sobre = exist.filter(function (p) { return p.h >= 1.0 && dist(p.p, pia.p) <= 2.0; }).length;
          var precisa = Math.max(0, C.tugMinBancadaPia.valor - sobre);
          res.tug.bancadaPia = { exigido: C.tugMinBancadaPia.valor, existente: sobre };
          for (var kb = 0; kb < precisa; kb++) {
            var op2 = livres.filter(function (x) { return x.bancada && dist(x.c.P, pia.p) >= C.afastAgua.valor - 1e-6 && dist(x.c.P, pia.p) <= 2.0; }).sort(function (x, y) { return dist(x.c.P, pia.p) - dist(y.c.P, pia.p); })[0];
            if (!op2) { pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": não coube a " + (kb + 1) + "ª tomada acima da bancada da pia (≥ " + f2(C.afastAgua.valor) + " m da torneira, sem janela) — " + R.citar(C.tugMinBancadaPia) + "." }); break; }
            var itB = tomarTug(op2, "acima da bancada da pia (mínimo " + C.tugMinBancadaPia.valor + " — " + R.citar(C.tugMinBancadaPia) + "), a " + f2(dist(op2.c.P, pia.p)) + " m da torneira (≥ " + f2(C.afastAgua.valor) + ", " + R.rotuloNivel(C.afastAgua.nivel) + ")" + (pia.estimada ? " — torneira no centro da cuba do desenho da bancada" : ""), { bancadaPia: true });
            falta = Math.max(0, falta - 1); void itB;
          }
        } else pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": sem bancada da pia modelada — as " + C.tugMinBancadaPia.valor + " tomadas acima dela (" + R.citar(C.tugMinBancadaPia) + ") ficam para quando a bancada for lançada (rode de novo)." });
      }
      /* banheiro: junto ao lavatório */
      if (g === "banheiro" && falta > 0) {
        var lav = L.lavatorios.filter(function (lv) { return lv.pav === a.pav && dentro(lv.p, a.pts); })[0];
        if (lav) {
          var opL = livres.filter(function (x) { var d0 = dist(x.c.P, lav.costas); return d0 >= 0.30 && d0 <= 1.0; }).sort(function (x, y) { return dist(x.c.P, lav.costas) - dist(y.c.P, lav.costas); })[0];
          if (opL) { var itL = tomarTug(opL, "próximo ao lavatório (" + R.citar(C.tugBanheiro) + "); fora dos volumes 0, 1 e 2 — ≥ " + f2(C.afastBox.valor) + " m do box/volume 1 (" + R.citar(C.afastBox) + ")"); itL.regras.push("no volume 3 a tomada pede DR ≤ 30 mA (NBR 5410 9.1.4.3.2 c) — entra com os circuitos"); falta--; }
          else pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": não coube a tomada junto ao lavatório (≥ " + f2(C.afastBox.valor) + " m do box, fora de vão). Lance à mão." });
        } else avisos.push("\"" + a.nome + "\": sem lavatório modelado — a tomada foi para a parede livre" + (L.boxes.some(function (b) { return b.pav === a.pav && b.amb === a.id; }) ? " mais longe do box" : "") + " (a norma pede junto ao lavatório: lance o lavatório e reveja).");
      }
      /* o resto: tão uniforme quanto possível pelo perímetro */
      var P = a.perimetro || 1, abertosA = a.aberto ? passagens(a, cands) : [];
      function dCirc(s1, s2) { var d = Math.abs(s1 - s2) % P; return Math.min(d, P - d); }
      var fixosS = exist.map(function (p) { return perimetroDe(a.pts, p.p); }).concat(escolhidos.map(function (e) { return e.s; }));
      /* sem ponto nenhum ainda: a grade de n posições iguais pelo perímetro, girada até cair nas paredes livres (a que deixa o
         maior trecho vazio MENOR); com pontos que já existem, uma a uma, a mais longe das outras */
      if (!fixosS.length && falta >= 2 && livres.length >= falta) {
        var melhorG = null, passoG = P / falta, nOff = Math.min(60, livres.length);
        for (var io = 0; io < nOff; io++) {
          var s0 = livres[Math.floor(io * livres.length / nOff)].c.s, usadosG = [], okG = true;
          for (var kg = 0; kg < falta && okG; kg++) {
            var alvoS = (s0 + kg * passoG) % P, bestG = null;
            livres.forEach(function (x, ix) { if (usadosG.indexOf(ix) >= 0) return; if (usadosG.some(function (j) { return livres[j].c.w.id === x.c.w.id && Math.abs(livres[j].c.t - x.c.t) < C.entrePontos.valor; })) return; var d = dCirc(x.c.s, alvoS); if (!bestG || d < bestG.d) bestG = { ix: ix, d: d }; });
            if (bestG) usadosG.push(bestG.ix); else okG = false;
          }
          if (!okG) continue;
          var gapG = maiorTrecho(P, usadosG.map(function (j) { return livres[j].c.s; }), abertosA);
          if (!melhorG || gapG < melhorG.gap - 1e-9) melhorG = { gap: gapG, ix: usadosG.slice() };
        }
        if (melhorG) {
          var escG = melhorG.ix.map(function (j) { return livres[j]; });
          escG.forEach(function (x) { tomarTug(x, "distribuída pelo perímetro em passos iguais (\"tão uniformemente quanto possível\" — " + R.citar(C.tugPerimSalaDorm) + ")"); fixosS.push(x.c.s); falta--; });
        }
      }
      while (falta > 0) {
        if (!livres.length) { pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": faltam " + falta + " tomada(s) (" + R.citar(regra) + ") e não há trecho livre de parede (vãos, móveis, box ou porta). Lance à mão ou reveja o layout." }); break; }
        var melhor = null;
        livres.forEach(function (x) {
          var sc;
          if (fixosS.length) { sc = Infinity; fixosS.forEach(function (s) { sc = Math.min(sc, dCirc(x.c.s, s)); }); }
          else if (g === "banheiro") { sc = 0; L.boxes.forEach(function (b) { if (b.pav === a.pav) sc += distPol(x.c.P, b.pts, dentro); }); }
          else sc = (x.c.tr.t1 - x.c.tr.t0) * 10 - Math.abs(x.c.t - (x.c.tr.t0 + x.c.tr.t1) / 2);   /* a primeira: o meio da parede mais comprida */
          if (!melhor || sc > melhor.sc + 1e-9) melhor = { x: x, sc: sc };
        });
        var itU = tomarTug(melhor.x, "distribuída pelo perímetro, o mais longe possível das outras (\"tão uniformemente quanto possível\" — " + R.citar(C.tugPerimSalaDorm) + ")");
        fixosS.push(melhor.x.c.s); falta--; void itU;
      }
      /* o maior trecho sem tomada (alerta, critério RA) */
      var ss = exist.map(function (p) { return perimetroDe(a.pts, p.p); }).concat(escolhidos.map(function (e) { return e.s; })).sort(function (x, y) { return x - y; });
      if (ss.length >= 2 && (g === "sala_dormitorio")) res.tug.maiorTrecho = r4(maiorTrecho(P, ss, abertosA));

      /* ---------- ILUMINAÇÃO */
      var luzEx = pontosDe(a, "luminaria"), nLuz = R.nLuminarias(a.area, a.alongado, a.comprimento, C), va = R.vaIluminacao(a.area, C);
      res.luz = { exigidoNorma: C.luzMinimo.valor, sugeridoRA: nLuz, existente: luzEx.length, lancado: 0, vaMinimo: va };
      if (!luzEx.length) {
        var Q = a.quadro, Ls = Q.s1 - Q.s0, Lt = Q.t1 - Q.t0, pts = [];
        if (a.alongado) {
          var longoU = Ls >= Lt;
          for (var k = 0; k < nLuz; k++) { var f = (k + 0.5) / nLuz; pts.push(longoU ? [Q.s0 + f * Ls, (Q.t0 + Q.t1) / 2] : [(Q.s0 + Q.s1) / 2, Q.t0 + f * Lt]); }
        } else {
          var cols = Math.max(1, Math.round(Math.sqrt(nLuz * Ls / Math.max(0.1, Lt)))), rows = Math.max(1, Math.ceil(nLuz / cols));
          for (var ir = 0; ir < rows; ir++) for (var ic = 0; ic < cols; ic++) if (pts.length < nLuz) pts.push([Q.s0 + (ic + 0.5) * Ls / cols, Q.t0 + (ir + 0.5) * Lt / rows]);
        }
        var mundo = pts.map(function (q) { return [Q.u[0] * q[0] + Q.v[0] * q[1], Q.u[1] * q[0] + Q.v[1] * q[1]]; }).filter(function (p) { return dentro(p, a.pts); });
        if (!mundo.length) mundo = [dentro([a.cx, a.cz], a.pts) ? [a.cx, a.cz] : a.pts.reduce(function (m, q) { return [m[0] + q[0] / a.pts.length, m[1] + q[1] / a.pts.length]; }, [0, 0])];
        if (mundo.length < nLuz) avisos.push("\"" + a.nome + "\": a grade de " + nLuz + " luminárias não cabe no contorno — lancei " + mundo.length + ".");
        var tipoL = a.forro ? "pq18e" : "pq24s";
        mundo.forEach(function (p) {
          var id = novoId("elel-" + a.id);
          ops.push({ op: "familia", id: id, famId: "ra-luminaria", tipoId: tipoL, x: r4(p[0]), y: r4(a.base), z: r4(p[1]), rotY: 0, inst: { Altura_montagem: r4(a.pe) } });
          ops.push({ op: "peca", id: id + "-cx", peca: "caixa_octogonal", sistema: "eletrica", material: "pvc", x: r4(p[0]), y: r4(a.base + a.pe), z: r4(p[1]), rotY: 0 });
          res.luz.lancado++;
          itens.push({ id: id, tipo: "luminaria", ambiente: a.id, ambienteNome: a.nome, tipoId: tipoL, altura: r4(a.pe), caixa: id + "-cx",
            regras: ["ao menos " + C.luzMinimo.valor + " ponto de luz no teto, comandado por interruptor (" + R.citar(C.luzMinimo) + ")",
                     "carga mínima de iluminação do ambiente: " + va + " VA para " + f2(a.area) + " m² (100 VA até 6 m² + 60 VA a cada 4 m² inteiros — " + R.citar(C.luzVaPasso) + "); é carga para o circuito, não a potência da lâmpada",
                     nLuz + " ponto(s) " + (a.alongado ? "ao longo do corredor (1 a cada " + f2(C.luzCorredorPasso.valor) + " m)" : (a.area <= C.luzAreaUmPonto.valor ? "central" : "em grade (1 a cada " + f2(C.luzAreaPorPonto.valor) + " m²)")) + " — " + R.rotuloNivel("C"),
                     (a.forro ? "plafon LED 18 W de embutir (forro)" : "plafon LED 24 W de sobrepor (laje)") + " — tipo orçado pela SINAPI (" + R.rotuloNivel("A") + "); caixa octogonal no teto"] });
        });
      }

      /* ---------- INTERRUPTORES (junto à porta, do lado da maçaneta) */
      var intEx = pontosDe(a, "interruptor");
      res.interruptores = { existente: intEx.length, lancado: 0 };
      if (!intEx.length) {
        var portas = [];
        a.trechos.forEach(function (tr) { L.vaos.forEach(function (v) { if (v.tipo === "porta" && v.parede === tr.paredeId && v.t >= tr.t0 - 0.02 && v.t <= tr.t1 + 0.02 && portas.every(function (q) { return q.v.id !== v.id; })) portas.push({ v: v, tr: tr, viz: tr.vizinho }); }); });
        if (!portas.length) {
          /* ambiente INTEGRADO (sem porta, aberto para outro): o interruptor junto à PASSAGEM — o lado do contorno sem parede */
          /* a passagem: o lado aberto para o outro ambiente (integrado) OU o lado SEM parede (varanda aberta para fora — revisão
             21/10/2026: antes a varanda de 3 paredes ficava sem interruptor) */
          var pass = passagens(a, cands).filter(function (q) { return a.aberto || semParede(a, q[2]); }), hP = C.alturaInterruptor.valor, escP = null;
          pass.forEach(function (q) {
            cands.forEach(function (cI) {
              var d0 = Math.min(dist(cI.P, q[0]), dist(cI.P, q[1]));
              if (d0 > 1.5 || (escP && d0 >= escP.d)) return;
              if (!livre(cI, hP)) escP = { c: cI, d: d0 };
            });
          });
          if (escP) {
            var itP = lancar("interruptor", "elei-" + a.id, a, escP.c, hP, "s1", { porta: null, passagem: true });
            res.interruptores.lancado++;
            itP.regras.push("comanda o ponto de luz do ambiente (" + R.citar(C.luzMinimo) + ")");
            itP.regras.push("ambiente integrado, sem porta: junto à passagem, a " + f2(escP.d) + " m dela (" + R.rotuloNivel("C") + ")");
            itP.regras.push("altura " + f2(hP) + " m (" + R.rotuloNivel(C.alturaInterruptor.nivel) + ")");
          } else if (a.aberto || a.tipo.def.semPortaPropria) pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": sem porta (integrado) e sem parede livre junto à passagem — lance o interruptor à mão." });
          else pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": sem porta — lance as portas (Portas e janelas automáticas) e rode de novo para o interruptor." });
        } else {
          portas.forEach(function (q) { var b = q.viz && porId[q.viz]; q.pub = b ? ESQ.privacidade(b.tipo.id) : 99; });
          portas.sort(function (x, y) { return y.pub - x.pub; });
          var passagem = ["circulacao", "escada", "sala_estar", "sala_jantar", "cozinha"].indexOf(a.tipo.id) >= 0 && portas.length >= 2;
          var nInt = passagem ? 2 : 1, hI = C.alturaInterruptor.valor;
          for (var kp = 0; kp < portas.length && res.interruptores.lancado < nInt; kp++) {
            var dv = portas[kp].v, tr = faixaNaParede(a, portas[kp].tr), sH = dv.maoDireita ? 1 : -1, off = dv.largura / 2 + C.distBatente.valor + 0.0375 + 0.005;
            /* 1º o lado da maçaneta; 2º o da dobradiça, ALÉM da faixa da folha aberta (critério RA) */
            var hinge = dv.t + sH * dv.folha / 2, tentar = dv.correr ? [dv.t - off, dv.t + off] : [dv.t - sH * off, hinge + sH * (C.atrasPorta.valor + 0.0375 + 0.02)], achou = null, motivoI = null;
            tentar.forEach(function (t, kl) {
              if (achou) return;
              var w = L.porParede[dv.parede];
              if (t < tr.t0 + C.folgaCanto.valor - 1e-6 || t > tr.t1 - C.folgaCanto.valor + 1e-6) { if (!motivoI) motivoI = "sem parede do lado da maçaneta"; return; }
              var Pp = E.ptParede(w, t, tr.lado * w.espessura / 2), n = E.eixoN(w.rotY), dirIn = [n[0] * tr.lado, n[1] * tr.lado];
              var c = { tr: tr, w: w, t: r4(t), P: Pp, dir: dirIn, rotY: r4(Math.atan2(dirIn[0], dirIn[1])), pav: a.pav };
              var mv = livre(c, hI); if (mv) { if (!motivoI) motivoI = mv; return; }
              achou = { c: c, lado: kl === 0 || dv.correr ? "maçaneta" : "dobradiça" };
            });
            /* 3º (revisão 21/10/2026) a parede AO LADO da porta, junto ao batente — o cômodo estreito com a porta no meio da parede
               curta (lavabo, closet, depósito, corredor de 1 m) não tem parede do lado da maçaneta nem além da folha; antes ficava
               sem interruptor (pendência e erro do auditor sem "Corrigir") */
            if (!achou) {
              var w0 = L.porParede[dv.parede], viz = null;
              (dv.correr ? [-1, 1] : [-sH, sH]).forEach(function (sg, kv) {
                if (viz && kv > 0) return;
                var J = E.ptParede(w0, dv.t + sg * dv.largura / 2, tr.lado * w0.espessura / 2);
                cands.forEach(function (cI) {
                  if (cI.w.id === dv.parede) return;
                  var d0 = dist(cI.P, J); if (d0 > C.intVizinha.valor + 1e-6 || (viz && d0 >= viz.d)) return;
                  if (!livre(cI, hI)) viz = { c: cI, d: d0, lado: kv === 0 ? "vizinha" : "vizinha-dobradica" };
                });
              });
              if (viz) achou = { c: viz.c, lado: viz.lado, d: viz.d };
            }
            if (!achou) { if (kp === portas.length - 1 && !res.interruptores.lancado) pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": não coube o interruptor junto à porta " + dv.id + " (" + motivoI + "). Lance à mão." }); continue; }
            var itI = lancar("interruptor", "elei-" + a.id, a, achou.c, hI, passagem ? "p1" : "s1", { porta: dv.id });
            res.interruptores.lancado++;
            itI.regras.push("comanda o ponto de luz do ambiente (" + R.citar(C.luzMinimo) + ")");
            if (/^vizinha/.test(achou.lado)) itI.regras.push("junto à porta " + dv.id + ", na parede ao lado" + (achou.lado === "vizinha" ? " (lado da maçaneta)" : " (lado da dobradiça)") + ", a " + f2(achou.d) + " m do batente: a parede da porta não tinha espaço (" + R.citar(C.intVizinha) + ")");
            else itI.regras.push("junto à porta " + dv.id + ", do lado " + (achou.lado === "maçaneta" ? "da maçaneta" : "da DOBRADIÇA (o da maçaneta não tinha parede livre)") + ", a " + f2(C.distBatente.valor) + " m do batente (" + R.rotuloNivel(C.distBatente.nivel) + ")");
            itI.regras.push("altura " + f2(hI) + " m (" + R.rotuloNivel(C.alturaInterruptor.nivel) + ")" + (passagem ? "; ambiente de passagem com 2 acessos: interruptor paralelo (three-way) nas 2 portas — " + R.rotuloNivel("C") : ""));
            if (achou.lado === "dobradiça" || achou.lado === "vizinha-dobradica") avisos.push("\"" + a.nome + "\": o interruptor " + itI.id + " ficou do lado da dobradiça da porta " + dv.id + ".");
          }
          /* passagem com 2 acessos mas só 1 interruptor coube: simples, não paralelo sem par */
          if (passagem && res.interruptores.lancado === 1) {
            var it1 = itens.filter(function (x) { return x.tipo === "interruptor" && x.ambiente === a.id; })[0];
            ops.forEach(function (op) { if (it1 && op.id === it1.id) op.tipoId = "s1"; });
            if (it1) { it1.tipoId = "s1"; it1.regras.push("só uma porta comportou interruptor: simples (o paralelo precisa do par)"); }
            avisos.push("\"" + a.nome + "\": é passagem com " + portas.length + " portas, mas só uma comportou interruptor — lancei um simples.");
          }
        }
      }
      /* ---------- a CAIXA que o lançador pôs e ficou SEM o ponto (revisão 21/10/2026). Roteiro: o usuário apagava só a tomada
         (a caixa é outra peça) e rodava de novo — saía tomada nova com caixa nova e a velha ficava, cobrada no orçamento; ou
         arrastava a tomada e a caixa ficava para trás. Agora: ponto apagado → a caixa sai; ponto movido → a caixa vai para
         trás dele (o ponto não é tocado). Caixa posta à mão (sem o prefixo do lançador) não é tocada. */
      res.caixas = { retiradas: [], levadas: [] };
      L.caixas.filter(function (cx) { return cx.auto && !cx.dono && /-cx$/.test(cx.id) && cx.amb === a.id && !usadosTue[cx.id]; }).forEach(function (cx) {
        var dono = L.pontos.filter(function (p) { return p.id === cx.id.replace(/-cx$/, ""); })[0];
        if (dono && !dono.caixa) {
          var luz = dono.kind === "luminaria", q = luz ? dono.p : add(dono.p, dono.dir, -0.03);
          var opC = { op: "peca", id: cx.id, peca: cx.peca, sistema: "eletrica", material: "pvc", x: r4(q[0]), y: r4(dono.y + dono.h), z: r4(q[1]), rotY: luz ? 0 : r4(dono.rotY) };
          if (!luz) opC.alturaPiso = r4(dono.h);
          ops.push(opC); dono.caixa = cx.id; res.caixas.levadas.push(cx.id);
          avisos.push("\"" + a.nome + "\": a caixa " + cx.id + " foi para trás do ponto " + dono.id + " (o ponto tinha sido movido sem ela).");
        } else {
          ops.push({ op: "apagar", id: cx.id }); res.caixas.retiradas.push(cx.id);
          avisos.push("\"" + a.nome + "\": a caixa " + cx.id + " estava sem o ponto (apagado) — retirada, para não ser orçada à toa.");
        }
      });
      porAmb.push(res);
    });

    var lote = ops.length ? { op: "lote", id: "ele-" + (o.loteId || Date.now().toString(36)), origem: "pontos-eletricos", pedido: "Lançar pontos elétricos", ops: ops } : null;
    var resumo = { luminarias: 0, tug: 0, tue: 0, interruptores: 0, ambientes: alvo.length };
    itens.forEach(function (x) { if (x.tipo === "luminaria") resumo.luminarias++; else if (x.tipo === "interruptor") resumo.interruptores++; else if (x.uso === "TUE") resumo.tue++; else resumo.tug++; });
    pend.push({ ambiente: null, texto: "Circuitos, quadro de distribuição, eletroduto, cabo e dimensionamento de condutor ficam para a próxima etapa (aguardando o exemplar da NBR 5410): o orçamento dos pontos tem o dispositivo e a caixa; eletroduto e cabo entram com os circuitos." });
    return { ok: true, lote: lote, ops: ops, itens: itens, porAmbiente: porAmb, avisos: avisos, pendencias: pend, criterios: C, leitura: L, resumo: resumo };
  }

  var EleAuto = { leitura: leitura, candidatos: candidatos, verificar: verificar, perimetroDe: perimetroDe, passagens: passagens, maiorTrecho: maiorTrecho, gerar: gerar, PREFIXO: PREFIXO, distPol: distPol, serveTue: serveTue };
  global.EleAuto = EleAuto;
  if (typeof module !== "undefined" && module.exports) module.exports = EleAuto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
