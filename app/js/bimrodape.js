/* =====================================================================
 * bimrodape.js — RODAPÉ do modelador (peça 3D paramétrica), motor PURO (ES5).
 *
 * Pedido do Rogério (29/10/2026): "o botão de criação de rodapé: jogar rodapé em todas as paredes
 * que não tenham revestimento; embutido (rente à parede) ou não (com a espessura); lado de dentro e
 * de fora (o piso lá de fora); clicar nas paredes selecionadas, ou em cada parede; e o rodapé tem de
 * puxar a mesma textura do piso que está em contato com ele quando for para o Twinmotion."
 *
 * A OP (extensão do replay — `BimEdit.estender`, como o js/bimpintar.js):
 *   {op:"rodape", id, modo?:"todas"|"paredes", paredes?:[ids], face?:"dentro"|"fora"|"ambas",
 *    embutido?:bool, altura?:m (0,07), espessura?:m (0,015), material?:"piso"|<nome>, nivelId?}
 *   · id novo: cria; id que existe: o que vier SUBSTITUI o campo (idempotente; Ctrl+Z desfaz a op).
 *   · modo "todas" = TODAS as paredes do nível (regra: parede nova entra); "paredes" = só as da lista.
 *   · {op:"apagar", id} de um rodapé apaga o conjunto; {op:"apagar", id:"<rodape>:<parede>:<face>:<n>"}
 *     tira aquela face de parede do conjunto (lista `sem`, texto "parede:face").
 *   · sem lista dentro de lista (a nuvem recusa): só uma lista plana de ids/textos.
 *
 * A FONTE é a op; a GEOMETRIA é DERIVADA a cada aplicação das paredes ATUAIS (`derivar`): esticar ou
 * mover a parede refaz o rodapé (mesmo espírito do "segue as paredes"). O replay só deixa as
 * especificações em `estado.rodapeSpecs` (nada quando não há op de rodapé: estado igual ao de antes);
 * `BimRodape.derivar(estado, vaos)` (vaos = BimEdit.vaosDasParedes) põe `estado.rodapes` e
 * `estado.rodapeResumo`.
 *
 * REGRA DO TRECHO (por face de parede):
 *   · a face corre da ponta ao canto (faces unidas, js/bimarq.js `uniao`), menos os encostos de T/X;
 *   · a base é o piso em contato DAQUELE lado (ambiente delimitado que contém o ponto logo em frente à
 *     face; `calc.base`). Sem piso do lado (mureta/divisa, quintal sem ambiente) não nasce — só um
 *     modelo SEM nenhum ambiente usa a base da parede;
 *   · CORTA nos vãos de PORTA que chegam ao piso (janela com peitoril não corta);
 *   · não nasce em face com REVESTIMENTO cerâmico/porcelanato/azulejo/pastilha/pedra (camada do tipo da
 *     parede, região pintada que cubra a faixa do rodapé, ou o acabamento de parede do ambiente que a face
 *     encara: "porcelanato até o teto") — "sem revestimento" = só pintura/reboco;
 *   · parede curva: ainda não (conta no resumo);
 *   · sobreposto: a espessura sai da face (canto interno: um dos dois topa no outro; canto externo: um
 *     vira o canto); embutido: a face do rodapé fica rente à face acabada e a espessura entra na parede.
 *   · Material "piso": o do piso em contato (`pisoRef` = ambiente) — o 3D e o GLB do Twinmotion usam o
 *     MESMO material do piso (js/bimtwinmotion.js).
 *
 * Teste: node tools/test-rodape.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function idOk(v) { return (typeof v === "string" && v.length > 0 && v.length <= 80 && v.indexOf(":") < 0) || fin(v); }

  var PADRAO = { altura: 0.07, espessura: 0.015 };
  var FAIXA = { altura: [0.02, 0.5], espessura: [0.003, 0.1] };
  var FACES = ["dentro", "fora", "ambas"];
  var MODOS = ["todas", "paredes"];
  var MAX_PAREDES = 400, MAX_SEM = 800;
  var TOL_PORTA = 0.05;        /* a porta "chega ao piso": a base do vão até 5 cm acima do piso (a mesma de js/bimacabamento.js) */
  var TOL_CANTO = 0.03;        /* as pontas se encontram (a mesma da união de js/bimarq.js) */
  var FOLGA_RENTE = 0.006;     /* embutido: a face do rodapé fica 6 mm à frente da parede (a película de pintura do 3D fica a 3 mm da face: com menos o rodapé some embaixo dela) */
  var MIN_TRECHO = 0.03;

  function norm(s) {
    return txt(s).toLowerCase().replace(/[áàâãä]/g, "a").replace(/[éêèë]/g, "e").replace(/[íìîï]/g, "i").replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c")
      .replace(/[_\-\/]+/g, " ").replace(/\s+/g, " ").trim();
  }
  /* revestimento duro de parede: o rodapé não vai por cima dele. Pintura, textura, reboco, emboço, massa, chapisco, gesso NÃO são. */
  var RE_REVEST = /ceram|porcelan|azulej|pastilha|pedra|marmor|granit|ardosia|tijolinho|mosaico/;
  function ehRevestimento(s) { return RE_REVEST.test(norm(s)); }

  /* ------------------------------------------------------------ a op */
  function campoOk(o, k) {
    var v = o[k];
    if (v === undefined) return true;
    if (k === "modo") return MODOS.indexOf(v) >= 0;
    if (k === "face") return FACES.indexOf(v) >= 0;
    if (k === "embutido") return typeof v === "boolean";
    if (k === "altura" || k === "espessura") return fin(v) && v >= FAIXA[k][0] && v <= FAIXA[k][1];
    if (k === "material") return typeof v === "string" && v.trim().length > 0 && v.length <= 80;
    if (k === "nivelId") return v === null || (typeof v === "string" && v.length > 0 && v.length <= 120) || fin(v);
    if (k === "paredes") return Array.isArray(v) && v.length <= MAX_PAREDES && v.every(function (p) { return (typeof p === "string" && p.length > 0 && p.length <= 120) || fin(p); });
    return true;
  }
  function validaOp(o) {
    if (!o || o.op !== "rodape") return undefined;
    if (!idOk(o.id)) return false;
    return ["modo", "face", "embutido", "altura", "espessura", "material", "nivelId", "paredes"].every(function (k) { return campoOk(o, k); });
  }
  /* apagar de uma peça derivada: "<rodape>:<parede>:<face>:<n>" */
  function chavePeca(id) {
    var p = txt(id).split(":");
    return p.length === 4 && (p[2] === "dentro" || p[2] === "fora") ? { spec: p[0], parede: p[1], face: p[2] } : null;
  }
  function aplicarOp(o, ctx) {
    if (!o || !ctx) return false;
    var R = ctx.rodapes;
    if (o.op === "apagar") {
      var kp = chavePeca(o.id);
      if (kp && R && R[kp.spec]) {
        var s0 = R[kp.spec], ch = kp.parede + ":" + kp.face;
        if (s0.sem.indexOf(ch) < 0 && s0.sem.length < MAX_SEM) s0.sem.push(ch);
        return true;
      }
      if (R && R[o.id] && !chavePeca(o.id)) { delete R[o.id]; ctx.rodapeOrdem.splice(ctx.rodapeOrdem.indexOf(o.id), 1); return true; }
      return false;
    }
    if (o.op !== "rodape" || validaOp(o) !== true) return false;
    if (!R) { R = ctx.rodapes = {}; ctx.rodapeOrdem = []; }
    var id = String(o.id), s = R[id];
    if (!s) {
      if (o.modo === "paredes" && !arr(o.paredes).length) return false;
      s = R[id] = { id: id, modo: o.modo || (o.paredes != null ? "paredes" : "todas"), paredes: [], face: "dentro", embutido: false, altura: PADRAO.altura,
                    espessura: PADRAO.espessura, material: "piso", nivelId: null, sem: [] };
      ctx.rodapeOrdem.push(id);
    }
    if (o.modo != null) s.modo = o.modo;
    if (o.paredes != null) s.paredes = o.paredes.map(function (p) { return String(p); });
    if (o.face != null) s.face = o.face;
    if (o.embutido != null) s.embutido = o.embutido;
    if (o.altura != null) s.altura = o.altura;
    if (o.espessura != null) s.espessura = o.espessura;
    if (o.material != null) s.material = o.material.trim();
    if (o.nivelId !== undefined) s.nivelId = o.nivelId == null ? null : String(o.nivelId);
    /* mudar o conjunto (paredes/face) devolve as faces que o usuário tinha tirado: valem de novo */
    if (o.paredes != null || o.face != null || o.modo != null) s.sem = [];
    return true;
  }
  function fimOp(ctx, saida, niveis) {
    if (!ctx.rodapes || !ctx.rodapeOrdem || !ctx.rodapeOrdem.length) return;
    saida.rodapeSpecs = ctx.rodapeOrdem.map(function (id) { return JSON.parse(JSON.stringify(ctx.rodapes[id])); });
    /* os níveis do replay: a parede sem nivelId (a maioria nas obras antigas) é do nível pela cota da base dela */
    saida.rodapeNiveis = arr(niveis).filter(function (n) { return n && n.id != null && isFinite(Number(n.elevacao)); }).map(function (n) { return { id: String(n.id), elevacao: Number(n.elevacao) }; })
      .sort(function (a, b) { return a.elevacao - b.elevacao; });
  }
  function registrar(BE) {
    if (!BE || typeof BE.estender !== "function") return false;
    BE.estender({ nome: "rodape", aplicar: aplicarOp, valida: validaOp, fim: fimOp });
    return true;
  }
  /* a op que a ferramenta manda (conferida); dados = campos da op */
  function op(id, dados) {
    var o = { op: "rodape", id: id }, d = dados || {};
    ["modo", "paredes", "face", "embutido", "altura", "espessura", "material", "nivelId"].forEach(function (k) { if (d[k] !== undefined) o[k] = d[k]; });
    return validaOp(o) === true ? o : null;
  }

  /* ------------------------------------------------------- geometria */
  function frameDe(c) {
    var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0));
    return { cx: num(c.cx, 0), cz: num(c.cz, 0), co: co, si: si, L: num(c.comprimento, 0), t: num(c.espessura, 0), H: num(c.altura, 0),
             y0: num(c.cy, 0) - num(c.altura, 0) / 2, y1: num(c.cy, 0) + num(c.altura, 0) / 2 };
  }
  function mundo(f, u, w) { return [f.cx + u * f.co + w * f.si, f.cz - u * f.si + w * f.co]; }
  function uEm(l, w) { return l.c0 + l.c1 * w; }
  function dentroPoli(P, x, z) {
    var d = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (((a.z > z) !== (b.z > z)) && (x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x)) d = !d;
    }
    return d;
  }
  /* o ambiente DELIMITADO que contém o ponto, no nível da parede */
  function ambienteEm(ambs, x, z, wy0, wy1, alt) {
    var best = null, bd = 1e9;
    ambs.forEach(function (a) {
      var k = a.calc; if (!k || k.estado !== "delimitado" || arr(k.contorno).length < 3) return;
      var b = num(k.base, 0);
      if (b < wy0 - 0.35 || b > wy1 - alt + 1e-6) return;
      if (!dentroPoli(k.contorno, x, z) || arr(k.furos).some(function (F) { return arr(F).length >= 3 && dentroPoli(F, x, z); })) return;
      var d = Math.abs(b - wy0); if (d < bd) { bd = d; best = a; }
    });
    return best;
  }
  /* intervalos [a,b] de uma lista menos outra */
  function subtrair(lista, cortes) {
    var out = lista.slice();
    cortes.forEach(function (c) {
      var nova = [];
      out.forEach(function (t) {
        if (c[1] <= t[0] || c[0] >= t[1]) { nova.push(t); return; }
        if (c[0] > t[0]) nova.push([t[0], c[0]]);
        if (c[1] < t[1]) nova.push([c[1], t[1]]);
      });
      out = nova;
    });
    return out.filter(function (t) { return t[1] - t[0] > 1e-6; });
  }

  /* a face da parede tem REVESTIMENTO na faixa [yb, yb+alt] (cotas absolutas)? */
  function faceComRevestimento(c, face, yb, alt) {
    var tp = c.tipoParede, achou = false;
    arr(tp && tp.camadas).forEach(function (k) { if (k.face === face && ehRevestimento(txt(k.material) + " " + txt(k.rotulo) + " " + txt(k.servico))) achou = true; });
    if (achou) return true;
    var base = num(c.cy, 0) - num(c.altura, 0) / 2, cortes = arr(c.divFaces && c.divFaces[face]);
    Object.keys(c.pinturas || {}).forEach(function (k) {
      var pr = k.split("|"); if (pr[0] !== face) return;
      var reg = Number(pr[1]) || 0, ya = reg === 0 ? -1e9 : base + num(cortes[reg - 1], 0), yz = reg >= cortes.length ? 1e9 : base + num(cortes[reg], 0);
      if (Math.min(yz, yb + alt) - Math.max(ya, yb) > 1e-6 && ehRevestimento(txt(c.pinturas[k] && c.pinturas[k].material))) achou = true;
    });
    return achou;
  }

  /* ---------------------------------------------------------- derivar */
  function derivar(estado, vaos) {
    estado = estado || {};
    var specs = arr(estado.rodapeSpecs), pecas = [], resumo = { trechos: 0, comprimento: 0, pulouRevestimento: 0, pulouSemPiso: 0, pulouCurva: 0, porConjunto: {} };
    vaos = vaos || {};
    var caixas = arr(estado.caixas), paredes = caixas.filter(function (c) { return c && c.tipo === "parede" && c.id != null; });
    var ambs = arr(estado.ambientes), temAmb = ambs.some(function (a) { return a && a.calc && a.calc.estado === "delimitado"; });
    var porId = {}; paredes.forEach(function (c) { porId[String(c.id)] = c; });
    /* o nível de uma parede: o nivelId dela; sem ele, o mais alto que não passa da base dela (5 cm de folga) */
    var NIVS = arr(estado.rodapeNiveis);
    function nivelDaParede(c) {
      if (c.nivelId != null && c.nivelId !== "") return String(c.nivelId);
      var y0 = num(c.cy, 0) - num(c.altura, 0) / 2, ach = null;
      NIVS.forEach(function (n) { if (n.elevacao <= y0 + 0.05) ach = n.id; });
      return ach;
    }

    specs.forEach(function (sp) {
      var rs = { trechos: 0, comprimento: 0, pulouRevestimento: 0, pulouSemPiso: 0, pulouCurva: 0, paredes: 0 }; resumo.porConjunto[sp.id] = rs;
      var alvos = sp.modo === "paredes" ? arr(sp.paredes).map(function (i) { return porId[String(i)]; }).filter(Boolean)
        : paredes.filter(function (c) { return sp.nivelId == null || nivelDaParede(c) === String(sp.nivelId); });
      var faces = sp.face === "ambas" ? ["dentro", "fora"] : [sp.face], e = sp.espessura, alt = sp.altura;
      alvos.forEach(function (c) {
        if (c.arco) { rs.pulouCurva++; return; }
        var f = frameDe(c); if (!(f.L > 0.02 && f.t > 0 && f.H > alt)) return;
        rs.paredes++;
        var inv = !!c.inverterFaces, un = c.uniao || {};
        faces.forEach(function (face) {
          if (arr(sp.sem).indexOf(String(c.id) + ":" + face) >= 0) return;
          var s = (face === "dentro") !== inv ? 1 : -1, w = s * f.t / 2;
          var FA = un.faceIni || un.ini || { c0: -f.L / 2, c1: 0 }, FB = un.faceFim || un.fim || { c0: f.L / 2, c1: 0 };
          var uIni = uEm(FA, w), uFim = uEm(FB, w);
          if (!(uFim - uIni > MIN_TRECHO)) return;
          var corridas = [[uIni, uFim]];
          corridas = subtrair(corridas, arr(un.cruz).map(function (g) { var a = uEm(g.a, w), b = uEm(g.b, w); return [Math.min(a, b), Math.max(a, b)]; }));
          var nx = s * f.si, nz = s * f.co;   /* a normal da face (para fora da parede, do lado desta face) */
          var ordemSub = 0, pulouRev = false, pulouPiso = false;
          corridas.forEach(function (cor) {
            /* quebra a corrida por ambiente (o piso em contato muda de um trecho da face para outro) */
            var L = cor[1] - cor[0], N = Math.max(1, Math.ceil(L / 0.25)), subs = [];
            function amb(u) { var p = mundo(f, u, s * (f.t / 2 + 0.06)); return ambienteEm(ambs, p[0], p[1], f.y0, f.y1, alt); }
            var cur = null, ini = cor[0], ant = null;
            for (var k = 0; k < N; k++) {
              var uc = cor[0] + (k + 0.5) * L / N, a = amb(uc), ida = a ? String(a.id) : "";
              if (k === 0) { cur = a; ant = uc; continue; }
              if ((cur ? String(cur.id) : "") !== ida) {
                var lo = ant, hi = uc;   /* bisseção: onde o ambiente muda */
                for (var it = 0; it < 7; it++) { var mid = (lo + hi) / 2, am = amb(mid); if ((am ? String(am.id) : "") === (cur ? String(cur.id) : "")) lo = mid; else hi = mid; }
                subs.push({ a: cur, u0: ini, u1: (lo + hi) / 2 }); ini = (lo + hi) / 2; cur = a;
              }
              ant = uc;
            }
            subs.push({ a: cur, u0: ini, u1: cor[1] });
            subs.forEach(function (sb) {
              var a = sb.a;
              if (!a && temAmb) { pulouPiso = true; return; }
              var yb = a ? num(a.calc.base, f.y0) : f.y0;
              if (yb < f.y0 - 0.01) yb = f.y0;
              if (yb + alt > f.y1 + 1e-6) return;
              /* o revestimento da face vem da parede (região pintada, camada do tipo) OU do acabamento de parede do AMBIENTE que a face encara
                 ("porcelanato até o teto", "revestimento cerâmico até 1,50": o texto do ambiente cobre a faixa do rodapé) */
              if (faceComRevestimento(c, face, yb, alt) || (a && ehRevestimento(a.acabParede))) { pulouRev = true; return; }
              var runs = [[sb.u0, sb.u1]];
              /* encostos de T/X (a outra parede cobre este trecho da face) */
              runs = subtrair(runs, arr(un.abut).filter(function (ab) { return (ab.lado > 0 ? 1 : -1) === s && num(ab.base, f.y0) < yb + alt && num(ab.topo, f.y1) > yb; })
                .map(function (ab) { return [Math.min(ab.u0, ab.u1), Math.max(ab.u0, ab.u1)]; }));
              /* portas que chegam ao piso */
              var vs = vaos[c.id] && arr(vaos[c.id].aceitos) ? vaos[c.id].aceitos : [];
              runs = subtrair(runs, vs.filter(function (v) { var v0 = f.y0 + num(v.y0, 0), v1 = f.y0 + num(v.y1, 0); return v0 <= yb + TOL_PORTA && v1 > yb + TOL_PORTA; })
                .map(function (v) { return [num(v.x0, 0), num(v.x1, 0)]; }));
              runs.forEach(function (rn) {
                if (rn[1] - rn[0] < MIN_TRECHO) return;
                var pisoRef = sp.material === "piso" && a ? String(a.id) : null;
                var material = sp.material === "piso" ? (a ? txt(a.acabPiso) : "") : sp.material;
                pecas.push({ id: sp.id + ":" + c.id + ":" + face + ":" + (ordemSub++), tipo: "rodape", ifc: "IFCCOVERING", ifcPre: "SKIRTINGBOARD", conjunto: sp.id, paredeId: String(c.id), face: face,
                  conjuntoFace: sp.face, conjuntoModo: sp.modo, conjuntoMaterial: sp.material, ambienteId: a ? String(a.id) : null, pisoRef: pisoRef, material: material, materialModo: sp.material === "piso" ? "piso" : "nome",
                  u0: rn[0], u1: rn[1], y0: r4(yb), altura: alt, espessura: e, embutido: !!sp.embutido, nx: nx, nz: nz, _f: f, _s: s, _w: w, _c: c });
              });
            });
          });
          if (pulouRev) rs.pulouRevestimento++;
          if (pulouPiso) rs.pulouSemPiso++;
        });
      });
    });

    /* ---- cantos (só o sobreposto: o embutido mora dentro da parede e nada se vê) ---- */
    function pt(p, u) { return mundo(p._f, u, p._w); }
    function extremos(p) { var a = pt(p, p.u0), b = pt(p, p.u1); return { a: a, b: b }; }
    var dirU = function (p) { return [p._f.co, -p._f.si]; };   /* a direção de +u no mundo */
    function chave(p) { return String(p.paredeId) + ":" + p.face + ":" + p.id; }
    var sobrep = pecas.filter(function (p) { return !p.embutido; });
    /* canto de fora: o de menor chave vira o canto (estende e*(n_outro·d)) — só entre peças que se tocam na ponta */
    sobrep.forEach(function (p) {
      [0, 1].forEach(function (fim) {
        var P = fim ? extremos(p).b : extremos(p).a, d = dirU(p), dOut = fim ? d : [-d[0], -d[1]];
        sobrep.forEach(function (q) {
          if (q === p || q.paredeId === p.paredeId || chave(q) < chave(p)) return;   /* quem tem a menor chave estende */
          if (Math.abs(q.y0 - p.y0) > 0.02) return;
          [0, 1].forEach(function (fq) {
            var Q = fq ? extremos(q).b : extremos(q).a;
            if (Math.abs(Q[0] - P[0]) > 0.006 || Math.abs(Q[1] - P[1]) > 0.006) return;
            var dq = dirU(q), dqOut = fq ? dq : [-dq[0], -dq[1]], dqIn = [-dqOut[0], -dqOut[1]];
            /* convexo: a outra peça se afasta do lado contrário ao da normal desta */
            if (!(p.nx * dqIn[0] + p.nz * dqIn[1] < -0.1)) return;
            var ext = p.espessura * (q.nx * dOut[0] + q.nz * dOut[1]);
            if (ext > 1e-4 && ext < 4 * p.espessura) { if (fim) p.u1 += ext; else p.u0 -= ext; }
          });
        });
      });
    });
    pecas.forEach(function (p) { p.comprimento = r4(p.u1 - p.u0); });
    /* canto de dentro: se as duas peças se sobrepõem na planta, a de maior chave encurta até o fim da sobreposição */
    function retang(p) {
      var ex = extremos(p), o0 = p.embutido ? -p.espessura + FOLGA_RENTE : 0.0005, o1 = p.embutido ? FOLGA_RENTE : p.espessura;
      return [[ex.a[0] + p.nx * o0, ex.a[1] + p.nz * o0], [ex.b[0] + p.nx * o0, ex.b[1] + p.nz * o0], [ex.b[0] + p.nx * o1, ex.b[1] + p.nz * o1], [ex.a[0] + p.nx * o1, ex.a[1] + p.nz * o1]];
    }
    function recorta(sujeito, clip) {   /* Sutherland–Hodgman (clip convexo anti-horário ou horário) */
      var area = 0; for (var i = 0; i < clip.length; i++) { var j = (i + 1) % clip.length; area += clip[i][0] * clip[j][1] - clip[j][0] * clip[i][1]; }
      var sgn = area >= 0 ? 1 : -1, out = sujeito;
      for (var e0 = 0; e0 < clip.length && out.length; e0++) {
        var A = clip[e0], B = clip[(e0 + 1) % clip.length], ent = out; out = [];
        var dentro = function (P) { return sgn * ((B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0])) >= -1e-12; };
        var cruza = function (P, Q) {
          var d1 = sgn * ((B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0])), d2 = sgn * ((B[0] - A[0]) * (Q[1] - A[1]) - (B[1] - A[1]) * (Q[0] - A[0])), t = d1 / (d1 - d2);
          return [P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])];
        };
        for (var m = 0; m < ent.length; m++) {
          var P0 = ent[m], Q0 = ent[(m + 1) % ent.length], dP = dentro(P0), dQ = dentro(Q0);
          if (dP && dQ) out.push(Q0); else if (dP && !dQ) out.push(cruza(P0, Q0)); else if (!dP && dQ) { out.push(cruza(P0, Q0)); out.push(Q0); }
        }
      }
      return out;
    }
    function areaPoli(P) { var a = 0; for (var i = 0; i < P.length; i++) { var j = (i + 1) % P.length; a += P[i][0] * P[j][1] - P[j][0] * P[i][1]; } return Math.abs(a) / 2; }
    for (var i = 0; i < sobrep.length; i++) for (var j = i + 1; j < sobrep.length; j++) {
      var A = sobrep[i], B = sobrep[j];
      if (A.paredeId === B.paredeId || Math.abs(A.y0 - B.y0) > 0.02) continue;
      var ov = recorta(retang(A), retang(B));
      if (ov.length < 3 || areaPoli(ov) < 1e-6) continue;
      var perd = chave(A) > chave(B) ? A : B, d = dirU(perd), us = ov.map(function (P) { return ((P[0] - perd._f.cx) * perd._f.co - (P[1] - perd._f.cz) * perd._f.si); });
      var mn = Math.min.apply(null, us), mx = Math.max.apply(null, us);
      if (mx >= perd.u1 - 1e-3 && mn > perd.u0 + MIN_TRECHO) perd.u1 = Math.min(perd.u1, mn);
      else if (mn <= perd.u0 + 1e-3 && mx < perd.u1 - MIN_TRECHO) perd.u0 = Math.max(perd.u0, mx);
    }

    var saida = [];
    pecas.forEach(function (p) {
      p.comprimento = r4(p.u1 - p.u0);
      if (p.comprimento < MIN_TRECHO) return;
      var ex = extremos(p);
      p.ax = r4(ex.a[0]); p.az = r4(ex.a[1]); p.bx = r4(ex.b[0]); p.bz = r4(ex.b[1]);
      p.area = r4(p.comprimento * p.altura); p.volume = r4(p.comprimento * p.altura * p.espessura);
      p.cantos = retang(p).map(function (P) { return { x: r4(P[0]), z: r4(P[1]) }; });
      delete p._f; delete p._s; delete p._w; delete p._c;
      saida.push(p);
      var rs = resumo.porConjunto[p.conjunto]; rs.trechos++; rs.comprimento = r4(rs.comprimento + p.comprimento);
      resumo.trechos++; resumo.comprimento = r4(resumo.comprimento + p.comprimento);
    });
    Object.keys(resumo.porConjunto).forEach(function (k) {
      var q = resumo.porConjunto[k]; resumo.pulouRevestimento += q.pulouRevestimento; resumo.pulouSemPiso += q.pulouSemPiso; resumo.pulouCurva += q.pulouCurva;
    });
    estado.rodapes = saida; estado.rodapeResumo = resumo;
    return { pecas: saida, resumo: resumo };
  }

  /* o comprimento de rodapé (peça) por ambiente — a FONTE do `rodape` do ambiente quando existir */
  function porAmbiente(estado) {
    var out = {};
    arr(estado && estado.rodapes).forEach(function (p) {
      if (p.ambienteId == null) return;
      var q = out[p.ambienteId] || (out[p.ambienteId] = { comprimento: 0, trechos: 0, ids: [] });
      q.comprimento = r4(q.comprimento + p.comprimento); q.trechos++; q.ids.push(p.id);
    });
    return out;
  }
  function resumoTexto(r) {
    if (!r) return "";
    function f(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
    var t = r.trechos + (r.trechos === 1 ? " trecho" : " trechos") + ", " + f(r.comprimento) + " m";
    if (r.pulouRevestimento) t += "; pulou " + r.pulouRevestimento + (r.pulouRevestimento === 1 ? " face com revestimento" : " faces com revestimento");
    if (r.pulouSemPiso) t += "; " + r.pulouSemPiso + (r.pulouSemPiso === 1 ? " face sem piso do lado" : " faces sem piso do lado");
    if (r.pulouCurva) t += "; " + r.pulouCurva + (r.pulouCurva === 1 ? " parede curva ficou de fora" : " paredes curvas ficaram de fora");
    return t;
  }

  var BimRodape = {
    PADRAO: PADRAO, FAIXA: FAIXA, FACES: FACES, MODOS: MODOS, TOL_PORTA: TOL_PORTA,
    ehRevestimento: ehRevestimento, validaOp: validaOp, aplicarOp: aplicarOp, registrar: registrar, op: op, chavePeca: chavePeca,
    derivar: derivar, porAmbiente: porAmbiente, resumoTexto: resumoTexto
  };
  if (global.BimEdit) registrar(global.BimEdit);
  global.BimRodape = BimRodape;
  if (typeof module !== "undefined" && module.exports) module.exports = BimRodape;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
