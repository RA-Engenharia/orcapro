/* =====================================================================
 * conclanc.js — PRÉ-LANÇAR ESTRUTURA DE CONCRETO sobre o modelo de arquitetura (frente "concreto F1", 21/10/2026).
 * Motor PURO (ES5, Node-testável, sem DOM). Molde: js/bimtelhadoestrut.js (lote idempotente, ids fixos) e a pesquisa
 * docs/concreto/pesquisa/RESUMO.md (8 passos). Os números e as fontes moram em js/concdados.js (gerado de
 * dados-fonte/concreto/criterios.json): aqui só a geometria e as regras.
 *
 * ⚠ TUDO O QUE SAI DAQUI É "PRÉ-DIMENSIONAMENTO — A CALCULAR". Nenhuma peça é calculada: as seções saem de regras de
 *   concepção e de pré-dimensionamento com a fonte citada (NBR 6118:2014 lida + Em1:2026 conferida; a vigente
 *   6118:2026 não está na biblioteca — pendência P1). O rótulo vai na peça (Comentários, conc.rotulo), no IFC e na tela.
 *
 * O QUE FAZ (por pavimento = paredes com a mesma base):
 *  1. paredes úteis: sem as demolidas, sem as EXISTENTES (reforma: a estrutura existente não se lança), sem muro/mureta
 *     (altura < 2,20 m) e sem parede curva; paredes colineares que se tocam viram UMA linha de viga;
 *  2. pilares nos cantos (L), encontros em T e X e nas pontas livres, DENTRO da parede (face com face), girados para
 *     não cair no vão de porta/janela; pilar intermediário onde o vão entre pilares passa de 5,5 m (Bacarji 1996),
 *     deslocado para fora das aberturas; pilar em prumo nos pavimentos (o de cima desce se há parede embaixo; sem
 *     parede embaixo = transição, marcada para o engenheiro); seção pela parede (19×19, 14×26) e pela área de
 *     influência (Bacarji: Ac = α·Ai·p·(n+0,7)/σid), a mesma em todos os pavimentos;
 *  3. vigas sob as paredes, de pilar a pilar (b = parede, h = ℓ/10 no tramo extremo, ℓ/12 no intermediário,
 *     múltiplo de 5, mínimo 25, uniforme na linha; limitada pela verga da porta/janela);
 *  4. lajes por ambiente (o contorno do ambiente, entre as faces das vigas): maciça até 5,0 m de vão (h de Bastos,
 *     mínimos de 13.2.4.1), treliçada acima (alturas da NBR 14859-1), > 6,0 m marcada;
 *  5. orçamento: cada peça leva os SERVIÇOS (op `orcar`) com código SINAPI que existe na base — concreto, fôrma e aço
 *     por taxa (100 kg/m³, fonte declarada); a treliçada vai só pela composição por m² (já tem capa e armadura).
 *
 * UM LOTE, IDEMPOTENTE, SEM SOBRESCREVER O MANUAL:
 *  - a op é UMA `lote` (id fixo "conc-prelanc", origem "conc-prelanc"): um Ctrl+Z desfaz tudo;
 *  - rodar de novo APAGA o pré-lançamento anterior e cria o novo (ids fixos pela posição): mesmo modelo = mesmo estado;
 *  - peça pré-lançada que o usuário MEXEU depois (mover, ajustar, orçar, marcar… qualquer op fora de um lote do
 *    pré-lançamento) fica como está e conta como "manual"; a que ele APAGOU não volta (opc.forcar refaz tudo);
 *  - pilar/viga/laje lançados à mão nunca são apagados: o pilar à mão perto do candidato toma o lugar dele, a viga à
 *    mão no mesmo trecho e a laje à mão no mesmo ambiente idem.
 *
 * API
 *   ConcLanc.gerar(estado, opc)  → { ok, motivo, lote, pecas, pilares, vigas, lajes, pavimentos, avisos, pendencias, premissas, manuais, resumo }
 *     opc = { avaliarFam, niveis, ops (as ops do editor, para achar o que foi mexido à mão), forcar, tipoLaje: "auto"|"macica"|"trelicada",
 *             vaoMax, incluirExistente, caa, fck }
 *   ConcLanc.opsSubstituir(ops, res)   → a lista de ops com o lote anterior trocado pelo novo (teste/ida e volta)
 *   ConcLanc.quantitativo(estado, opc) → { itens, total, manuais, avisos } (estimativa marcada)
 *   ConcLanc.ifcConferir(texto, ids)   → o que o IFC de saída levou das peças pré-lançadas (classe, seção, rótulo)
 *   ConcLanc.manuais(ops)              → { editados, apagados } (o que o usuário mexeu nas peças pré-lançadas)
 *   ConcLanc.ehPreLanc(c), ConcLanc.LOTE, ConcLanc.ROTULO
 * Teste: node tools/test-conc-prelanc.js · e2e: tools/e2e-conc-prelanc.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function DADOS() { return dep("ConcDados", "./concdados.js"); }
  function ARQ() { return dep("BimArq", "./bimarq.js"); }
  function EDIT() { return dep("BimEdit", "./bimedit.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function virg(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function cm(v) { return Math.round(v * 100); }
  function teto5(m) { return Math.ceil(m * 100 / 5 - 1e-6) * 5 / 100; }
  function piso5(m) { return Math.floor(m * 100 / 5 + 1e-6) * 5 / 100; }
  function coord(v) { var n = Math.round(v * 100); return (n < 0 ? "m" : "") + Math.abs(n); }

  var LOTE = "conc-prelanc";
  var ROTULO = "PRÉ-DIMENSIONAMENTO — A CALCULAR";
  function crit(k, d) { var D = DADOS(), c = D && D.criterios && D.criterios[k]; return c && c.valor != null ? c.valor : d; }
  function fonteDe(k) {
    var D = DADOS(), c = D && D.criterios && D.criterios[k]; if (!c) return "";
    var f = c.fonte && D.fontes[c.fonte] ? D.fontes[c.fonte] : "sem fonte";
    return (c.status === "decisao-produto" ? "regra do produto (sem fonte)" : f.split(" (")[0]) + (c.item ? " — " + c.item : "");
  }
  function sinapi(k) { var D = DADOS(); return D && D.sinapi ? D.sinapi[k] : null; }
  function ehPreLanc(c) { return !!(c && c.conc && c.conc.origem === "prelanc"); }
  /* o tipo da laje: o do TIPO da peça (o Corrigir do auditor e a paleta mudam o tipoLaje), senão o do pré-lançamento */
  function tipoLajeDe(c) {
    var t = c && c.tipoLaje ? String(c.tipoLaje.id || "") + " " + String(c.tipoLaje.rotulo || "") : "";
    if (/\S/.test(t)) return /treli/i.test(t) ? "trelicada" : "macica";
    return c && c.conc && c.conc.tipoLaje ? c.conc.tipoLaje : "macica";
  }

  /* ---------------------------------------------------------------- vetores no plano XZ */
  function v(x, z) { return { x: x, z: z }; }
  function sub(a, b) { return v(a.x - b.x, a.z - b.z); }
  function add(a, b) { return v(a.x + b.x, a.z + b.z); }
  function mul(a, k) { return v(a.x * k, a.z * k); }
  function dot(a, b) { return a.x * b.x + a.z * b.z; }
  function len(a) { return Math.sqrt(a.x * a.x + a.z * a.z); }
  function dist(a, b) { return len(sub(a, b)); }
  function rotYde(u) { return r4(Math.atan2(-u.z, u.x)); }

  /* ---------------------------------------------------------------- as peças estruturais que já estão no modelo */
  function ehConcreto(c) {
    if (!c || (c.tipo !== "pilar" && c.tipo !== "viga" && c.tipo !== "laje")) return false;
    if ((c.tipo === "pilar" || c.tipo === "viga") && c.perfil && c.material && c.material !== "concreto") return false;
    return true;
  }
  function ativa(c) { return !(c && c.faseDemolida) && !(c && c.faseCriada === "Existente"); }

  /* ESTRUTURA JÁ MODELADA QUE NÃO É CAIXA DE CONCRETO (revisão 21/10/2026): pilar/viga de AÇO ou MADEIRA do modelador e as
     FAMÍLIAS de pilar/viga/laje (as orçáveis "Pilar de concreto armado (SINAPI)" etc.). Antes o pré-lançamento não as via:
     punha um pilar de concreto em cima do pilar de aço/família, uma viga sob a viga, uma laje sobre a laje — e cobrava as
     duas. Aqui viram "peças à mão" (caixas de leitura, sem op) para tomar o lugar do candidato, como o concreto à mão. */
  function catFamDe(opc) {
    var dada = opc && typeof opc.categoriaFam === "function" ? opc.categoriaFam : null;
    return function (famId) {
      var R = global.FamiliasRA, O = global.FamiliasOrc, f = null, k = null;
      if (dada) { try { k = dada(famId); } catch (e0) { k = null; } if (k) return k; }
      try { f = R && R.obter ? R.obter(famId) : null; } catch (e) {}
      if (!f && O && O.lista) { try { f = O.lista().filter(function (x) { return x && x.id === famId; })[0] || null; } catch (e2) {} }
      return f ? f.categoria : null;
    };
  }
  function estruturaModelada(estado, opc) {
    opc = opc || {};
    var out = [], semGeo = [], catDe = catFamDe(opc);
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || (c.tipo !== "pilar" && c.tipo !== "viga") || ehConcreto(c) || !ativa(c)) return;
      out.push({ id: String(c.id), tipo: c.tipo, cx: num(c.cx, 0), cz: num(c.cz, 0), cy: num(c.cy, 0), altura: num(c.altura, 0), comprimento: num(c.comprimento, 0.2), espessura: num(c.espessura, 0.2), rotY: num(c.rotY, 0), origemEstr: "material " + (c.material || "?") });
    });
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || f.faseDemolida || f.faseCriada === "Existente") return;
      var cat = null; try { cat = catDe(f.famId); } catch (e) { cat = null; }
      if (cat !== "pilar" && cat !== "viga" && cat !== "laje") return;
      var av = null; try { av = typeof opc.avaliarFam === "function" ? opc.avaliarFam(f.famId, f.tipoId, f.inst || {}) : null; } catch (e3) { av = null; }
      var th = num(f.rotY, 0), ux = v(Math.cos(th), -Math.sin(th)), uz = v(Math.sin(th), Math.cos(th)), o = v(num(f.x, 0), num(f.z, 0));
      var sols = arr(av && av.solidos).map(function (sd) {
        /* LOTE 2 (28/10/2026): pilar/viga com CHANFRO é uma extrusão de contorno: entra como a caixa que a envolve (girada pelo rot da extrusão) */
        if (!sd || sd.forma !== "extrusao" || !arr(sd.contorno).length) return sd;
        var rr = num(sd.rot, 0) * Math.PI / 180, cr = Math.cos(rr), sr = Math.sin(rr), a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        arr(sd.contorno).forEach(function (q) {
          (sd.plano === "frente" ? [[q[0], q[1], 0], [q[0], q[1], sd.altura]] : [[q[0], 0, q[1]], [q[0], sd.altura, q[1]]]).forEach(function (t) {
            var wx = num(sd.x, 0) + t[0] * cr + t[2] * sr, wz = num(sd.z, 0) - t[0] * sr + t[2] * cr, wy = num(sd.y, 0) + t[1];
            a0 = Math.min(a0, wx); a1 = Math.max(a1, wx); c0 = Math.min(c0, wz); c1 = Math.max(c1, wz); b0 = Math.min(b0, wy); b1 = Math.max(b1, wy);
          });
        });
        return { forma: "caixa", x: (a0 + a1) / 2, z: (c0 + c1) / 2, y: b0, dx: a1 - a0, dz: c1 - c0, dy: b1 - b0 };
      }).filter(function (sd) { return sd && sd.forma === "caixa" && num(sd.dx, 0) > 0 && num(sd.dy, 0) > 0 && num(sd.dz, 0) > 0; });
      if (!sols.length) { semGeo.push(String(f.id)); if (cat === "pilar") out.push({ id: String(f.id), tipo: "pilar", cx: o.x, cz: o.z, cy: num(f.y, 0) + 1.4, altura: 2.8, comprimento: 0.2, espessura: 0.2, rotY: th, origemEstr: "família" }); return; }
      /* a família é UMA peça: a caixa que envolve os sólidos dela (no local), levada ao mundo */
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      sols.forEach(function (sd) { var sx = num(sd.x, 0), sy = num(sd.y, 0), sz = num(sd.z, 0); x0 = Math.min(x0, sx - sd.dx / 2); x1 = Math.max(x1, sx + sd.dx / 2); z0 = Math.min(z0, sz - sd.dz / 2); z1 = Math.max(z1, sz + sd.dz / 2); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy + sd.dy); });
      var cl = v((x0 + x1) / 2, (z0 + z1) / 2), cw = add(o, add(mul(ux, cl.x), mul(uz, cl.z))), dx = x1 - x0, dz = z1 - z0;
      var p = { id: String(f.id), tipo: cat, cx: r4(cw.x), cz: r4(cw.z), cy: r4(num(f.y, 0) + (y0 + y1) / 2), altura: r4(y1 - y0), comprimento: r4(dx), espessura: r4(dz), rotY: th, origemEstr: "família " + f.famId };
      if (cat === "laje") p.contorno = [v(x0, z0), v(x1, z0), v(x1, z1), v(x0, z1)].map(function (q) { var w = add(o, add(mul(ux, q.x), mul(uz, q.z))); return { x: r4(w.x), z: r4(w.z) }; });
      out.push(p);
    });
    return { pecas: out, semGeometria: semGeo };
  }

  /* o que o usuário mexeu nas peças do pré-lançamento (qualquer op fora de um lote do pré-lançamento) */
  function idsDaOp(o) {
    var L = [];
    ["id", "a", "b", "ferramenta"].forEach(function (k) { if (o && o[k] != null) L.push(String(o[k])); });
    arr(o && o.ids).forEach(function (x) { L.push(String(x)); });
    if (o && o.marcas && typeof o.marcas === "object") Object.keys(o.marcas).forEach(function (k) { L.push(String(k)); });
    return L;
  }
  function manuais(ops) {
    var nossas = {}, editados = {}, apagados = {};
    function ver(o) {
      if (!o || !o.op) return;
      if (o.op === "lote") {
        if (o.origem === LOTE || o.id === LOTE) {
          arr(o.ops).forEach(function (x) { if (x && x.op === "criar" && x.id != null) { var k = String(x.id); nossas[k] = 1; delete editados[k]; delete apagados[k]; } });
          return;
        }
        arr(o.ops).forEach(ver); return;
      }
      idsDaOp(o).forEach(function (k) {
        if (!nossas[k]) return;
        if (o.op === "apagar") { apagados[k] = 1; delete editados[k]; }
        else editados[k] = 1;   /* mover, ajustar, orçar, marcar e até criar de novo (o Corrigir do auditor refaz a viga com o mesmo id): é do usuário */
      });
    }
    arr(ops).forEach(ver);
    return { editados: Object.keys(editados), apagados: Object.keys(apagados), nossas: Object.keys(nossas) };
  }

  /* ---------------------------------------------------------------- 1. paredes úteis e pavimentos */
  function nucleoDe(c) {
    var cam = c && c.tipoParede && arr(c.tipoParede.camadas).filter(function (k) { return k && k.face === "nucleo"; })[0];
    return cam && num(cam.e, 0) > 0.03 ? num(cam.e, 0) : null;
  }
  function paredesUteis(estado, opc) {
    var BE = EDIT(), usadas = [], ignoradas = [], hMin = crit("paredeAlturaMinimaM", 2.2);
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "parede") return;
      if (c.faseDemolida) { ignoradas.push({ id: c.id, motivo: "demolida" }); return; }
      if (c.faseCriada === "Existente" && !opc.incluirExistente) { ignoradas.push({ id: c.id, motivo: "existente (reforma: a estrutura existente não se lança)" }); return; }
      if (c.arco) { ignoradas.push({ id: c.id, motivo: "parede curva (lance a viga curva à mão)" }); return; }
      if (num(c.altura, 0) < hMin) { ignoradas.push({ id: c.id, motivo: "muro/mureta (altura " + virg(c.altura) + " m < " + virg(hMin) + " m)" }); return; }
      var e = BE.eixoDaCaixa(c), nuc = nucleoDe(c);
      usadas.push({ id: String(c.id), a: v(e[0].x, e[0].z), b: v(e[1].x, e[1].z), esp: num(c.espessura, 0.15), nucleo: nuc, nucleoAssumido: nuc == null,
                    yb: r4(num(c.cy, 0) - num(c.altura, 0) / 2), yt: r4(num(c.cy, 0) + num(c.altura, 0) / 2), c: c });
    });
    return { usadas: usadas, ignoradas: ignoradas };
  }
  function pavimentosDe(paredes, niveis) {
    var grupos = [];
    paredes.forEach(function (w) {
      var g = grupos.filter(function (x) { return Math.abs(x.yb - w.yb) < 0.06; })[0];
      if (!g) { g = { yb: w.yb, paredes: [] }; grupos.push(g); }
      g.paredes.push(w);
    });
    grupos.sort(function (a, b) { return a.yb - b.yb; });
    /* DESNÍVEL NO MESMO PAVIMENTO (revisão 21/10/2026): garagem rebaixada 15 cm, degrau, cozinha num patamar — a base
       mais baixa NÃO é outro pavimento. Antes virava um "pavimento" de 15 cm: pilar de 0,15 m, viga de 18 cm, laje no
       chão e o concreto de multipavimentos numa casa térrea. Regra: o grupo cuja base fica ABAIXO do topo das paredes
       do pavimento de baixo menos 1,0 m é o mesmo pavimento (cada parede guarda a base dela). */
    function topoMed(ps) { var t = ps.map(function (w) { return w.yt; }).sort(function (a, b) { return a - b; }); return t[Math.floor(t.length / 2)]; }
    var juntos = [];
    grupos.forEach(function (g) {
      var ult = juntos[juntos.length - 1];
      if (ult && g.yb < topoMed(ult.paredes) - 1.0) { ult.paredes = ult.paredes.concat(g.paredes); ult.ybMax = g.yb; return; }
      juntos.push({ yb: g.yb, ybMax: g.yb, paredes: g.paredes.slice() });
    });
    grupos = juntos;
    var NV = arr(niveis).filter(function (n) { return n && n.id != null && fin(Number(n.elevacao)); });
    function nivelEm(y) { var n = NV.filter(function (x) { return Math.abs(Number(x.elevacao) - y) < 0.06; })[0]; return n || null; }
    grupos.forEach(function (g, i) {
      var tops = g.paredes.map(function (w) { return w.yt; }).sort(function (a, b) { return a - b; });
      var topoParedes = tops[Math.floor(tops.length / 2)];
      g.idx = i; g.topo = r4(i + 1 < grupos.length ? Math.min(grupos[i + 1].yb, Math.max(topoParedes, grupos[i + 1].yb)) : topoParedes);
      var nb = nivelEm(g.yb), nt = nivelEm(g.topo);
      g.nivelBase = nb ? String(nb.id) : null; g.nivelTopo = nt ? String(nt.id) : null;
      g.nome = nb && nb.nome ? String(nb.nome) : (i === 0 ? "Térreo" : "Pavimento " + (i + 1));
      g.ultimo = i === grupos.length - 1;
      g.paredes = g.paredes.filter(function (w) { return w.yt >= g.topo - 0.06; });   /* parede que não chega no teto não leva viga */
      g.ybMax = Math.max.apply(null, [g.yb].concat(g.paredes.map(function (w) { return w.yb; })));
    });
    return grupos;
  }

  /* ---------------------------------------------------------------- linhas de viga (paredes colineares unidas) */
  function linhasDe(pav, vaos) {
    var grupos = [];
    pav.paredes.forEach(function (w) {
      var d = sub(w.b, w.a), L = len(d); if (!(L > 0.05)) return;
      var u = mul(d, 1 / L);
      if (u.x < -1e-6 || (Math.abs(u.x) <= 1e-6 && u.z < 0)) u = mul(u, -1);
      var n = v(-u.z, u.x), c = dot(n, w.a), ang = Math.atan2(u.z, u.x);
      var g = grupos.filter(function (x) { return Math.abs(x.ang - ang) < 0.01 && Math.abs(x.c - c) < 0.02; })[0];
      if (!g) { g = { ang: ang, u: u, n: n, c: c, itens: [] }; grupos.push(g); }
      var sa = dot(u, w.a), sb = dot(u, w.b);
      g.itens.push({ w: w, s0: Math.min(sa, sb), s1: Math.max(sa, sb) });
    });
    var linhas = [];
    grupos.forEach(function (g) {
      g.itens.sort(function (a, b) { return a.s0 - b.s0; });
      var cur = null;
      g.itens.forEach(function (it) {
        if (cur && it.s0 <= cur.s1 + 0.03) { cur.s1 = Math.max(cur.s1, it.s1); cur.paredes.push(it.w); return; }
        cur = { u: g.u, n: g.n, c: g.c, s0: it.s0, s1: it.s1, paredes: [it.w] }; linhas.push(cur);
      });
    });
    linhas.forEach(function (l, i) {
      l.id = "l" + i;
      l.esp = Math.max.apply(null, l.paredes.map(function (w) { return w.esp; }));
      var nucs = l.paredes.map(function (w) { return w.nucleo; }).filter(function (x) { return x != null; });
      l.nucleo = nucs.length ? Math.min.apply(null, nucs) : null;
      l.larg = l.nucleo != null ? l.nucleo : l.esp;   /* espessura que vale para o pilar e a viga embutidos */
      l.yb = Math.min.apply(null, l.paredes.map(function (w) { return w.yb; }));
      l.aberturas = [];
      l.paredes.forEach(function (w) {
        var vz = vaos[w.id]; if (!vz) return;
        var dir = mul(sub(w.b, w.a), 1 / dist(w.a, w.b)), cen = mul(add(w.a, w.b), 0.5);
        arr(vz.aceitos).forEach(function (a) {
          var p0 = add(cen, mul(dir, a.x0)), p1 = add(cen, mul(dir, a.x1)), s0 = dot(l.u, p0), s1 = dot(l.u, p1);
          /* y0/y1 a partir da base da LINHA (a parede do desnível tem outra base: a verga é a dela) */
          l.aberturas.push({ id: a.id, parede: w.id, s0: Math.min(s0, s1), s1: Math.max(s0, s1), y0: num(a.y0, 0) + (w.yb - l.yb), y1: num(a.y1, 0) + (w.yb - l.yb) });
        });
      });
      l.comprimento = l.s1 - l.s0;
    });
    return linhas;
  }
  function ponto(l, s) { return add(mul(l.n, l.c), mul(l.u, s)); }
  /* o ponto está sobre a linha? (folga na largura; nas pontas, a meia parede que chega nela: o nó fica no eixo da outra) */
  function naLinha(l, p, folga) { var off = Math.abs(dot(l.n, p) - l.c), s = dot(l.u, p); return off <= l.esp / 2 + (folga == null ? 0.02 : folga) && s >= l.s0 - 0.15 && s <= l.s1 + 0.15; }
  function conflitoAbertura(l, s0, s1) {
    for (var i = 0; i < l.aberturas.length; i++) { var a = l.aberturas[i]; if (s1 > a.s0 + 0.005 && s0 < a.s1 - 0.005) return a; }
    return null;
  }

  /* ---------------------------------------------------------------- 2. nós (cantos, T, X, pontas) */
  function nosDe(linhas) {
    var nos = [];
    function addNo(p, itens) {
      var no = nos.filter(function (x) { return dist(x.p, p) < 0.06; })[0];
      if (!no) { no = { p: p, linhas: [] }; nos.push(no); }
      itens.forEach(function (it) { if (!no.linhas.some(function (y) { return y.l === it.l; })) no.linhas.push(it); });
    }
    for (var i = 0; i < linhas.length; i++) for (var j = i + 1; j < linhas.length; j++) {
      var A = linhas[i], B = linhas[j], den = dot(B.n, A.u);
      if (Math.abs(den) < 0.2) continue;   /* quase paralelas */
      var P0 = mul(A.n, A.c), t = (B.c - dot(B.n, P0)) / den, P = add(P0, mul(A.u, t)), sA = t, sB = dot(B.u, P);
      var tA = B.esp / 2 + 0.03, tB = A.esp / 2 + 0.03;
      if (sA < A.s0 - tA || sA > A.s1 + tA || sB < B.s0 - tB || sB > B.s1 + tB) continue;
      addNo(P, [{ l: A, s: sA, tol: tA }, { l: B, s: sB, tol: tB }]);
    }
    /* pontas livres: fim de linha sem encontro */
    linhas.forEach(function (l) {
      [l.s0, l.s1].forEach(function (s) {
        var tem = nos.some(function (no) { return no.linhas.some(function (it) { return it.l === l && Math.abs(it.s - s) <= it.tol + 0.02; }); });
        if (!tem) addNo(ponto(l, s), [{ l: l, s: s, tol: 0.03, ponta: true }]);
      });
    });
    nos.forEach(function (no) {
      no.bracos = [];
      no.linhas.forEach(function (it) {
        if (it.l.s1 - it.s > it.tol) no.bracos.push({ l: it.l, sinal: 1, comp: it.l.s1 - it.s });
        if (it.s - it.l.s0 > it.tol) no.bracos.push({ l: it.l, sinal: -1, comp: it.s - it.l.s0 });
      });
      var nb = no.bracos.length;
      no.tipo = nb <= 1 ? "ponta" : (nb === 2 ? (no.bracos[0].l === no.bracos[1].l ? "passa" : "canto") : (nb === 3 ? "T" : "X"));
    });
    return nos;
  }

  /* ---------------------------------------------------------------- seção de partida do pilar pela parede */
  function secaoPelaParede(larg) {
    var cmL = cm(larg), bMin = crit("pilarLadoMinimoCm", 19), bEsp = crit("pilarLadoEspecialCm", 14), aMin = crit("pilarAreaMinimaCm2", 360);
    if (cmL >= bMin) return { b: bMin / 100, L: bMin / 100, embutido: true, gamaN: 1.0, regra: "parede ≥ " + bMin + " cm → " + bMin + " × " + bMin };
    var Lc = Math.max(26, Math.ceil(aMin / bEsp - 1e-9));   /* 14 × 26 = 364 cm² ≥ 360 (a tabela da pesquisa: parede de 14 → 14 × 26) */
    return { b: bEsp / 100, L: Lc / 100, embutido: cmL >= bEsp, gamaN: 1.25, regra: cmL >= bEsp ? "parede de " + bEsp + " a " + bMin + " cm → " + bEsp + " × " + Lc + " (γn 1,25 no cálculo)" : "parede < " + bEsp + " cm → " + bEsp + " × " + Lc + " SOBRESSAINDO da parede" };
  }

  /* o pilar no nó: direção do lado maior, deslocamento para ficar dentro da parede e fora dos vãos */
  function pilarNoNo(no) {
    var cands = [];
    no.bracos.forEach(function (b) { if (!cands.some(function (c) { return c.l === b.l; })) cands.push({ l: b.l }); });
    cands.forEach(function (c) {
      var mais = no.bracos.filter(function (b) { return b.l === c.l && b.sinal > 0; })[0], menos = no.bracos.filter(function (b) { return b.l === c.l && b.sinal < 0; })[0];
      var outras = no.linhas.filter(function (it) { return it.l !== c.l; }).map(function (it) { return it.l.esp / 2; });
      var meia = outras.length ? Math.max.apply(null, outras) : 0;
      c.passa = !!(mais && menos);
      c.aNeg = menos ? menos.comp : meia; c.aPos = mais ? mais.comp : meia;
      c.comp = (mais ? mais.comp : 0) + (menos ? menos.comp : 0);
    });
    cands.sort(function (a, b) { return (b.passa ? 1 : 0) - (a.passa ? 1 : 0) || b.comp - a.comp; });
    var melhor = null;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i], sec = secaoPelaParede(c.l.larg), it = no.linhas.filter(function (x) { return x.l === c.l; })[0];
      var lo = -c.aNeg + sec.L / 2, hi = c.aPos - sec.L / 2, off = lo <= hi ? Math.min(Math.max(0, lo), hi) : (lo + hi) / 2;
      var centro = add(no.p, mul(c.l.u, off)), s = it.s + off;
      var conf = conflitoAbertura(c.l, s - sec.L / 2, s + sec.L / 2);
      no.linhas.forEach(function (o) {
        if (conf || o.l === c.l) return;
        var sc = dot(o.l.u, centro), h = Math.abs(dot(o.l.u, c.l.u)) * sec.L / 2 + Math.abs(dot(o.l.u, c.l.n)) * sec.b / 2;
        conf = conflitoAbertura(o.l, sc - h, sc + h);
      });
      var cand = { centro: centro, l: c.l, u: c.l.u, sec: sec, cabe: lo <= hi + 1e-9, conflito: conf };
      if (!melhor) melhor = cand;
      if (!conf) { melhor = cand; break; }
    }
    return melhor;
  }
  /* o pilar intermediário mais perto de `alvo` fora dos vãos (passo de 5 cm, até `raio`) */
  function posLivre(l, alvo, Lp, raio) {
    for (var k = 0; k * 0.05 <= raio + 1e-9; k++) {
      var cs = k === 0 ? [alvo] : [alvo + k * 0.05, alvo - k * 0.05];
      for (var i = 0; i < cs.length; i++) if (!conflitoAbertura(l, cs[i] - Lp / 2, cs[i] + Lp / 2) && cs[i] - Lp / 2 >= l.s0 - 0.01 && cs[i] + Lp / 2 <= l.s1 + 0.01) return cs[i];
    }
    return null;
  }

  /* ---------------------------------------------------------------- polígonos */
  function areaPoli(P) { var a = 0; for (var i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length]; a += p.x * q.z - q.x * p.z; } return Math.abs(a) / 2; }
  function centroide(P) { var x = 0, z = 0; P.forEach(function (p) { x += p.x; z += p.z; }); return v(x / P.length, z / P.length); }
  function dentro(p, P) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) c = !c; }
    return c;
  }
  function distSeg(p, a, b) { var d = sub(b, a), L2 = dot(d, d); if (L2 < 1e-12) return dist(p, a); var t = Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)); return dist(p, add(a, mul(d, t))); }
  function distBorda(p, P) { var m = Infinity; for (var i = 0; i < P.length; i++) m = Math.min(m, distSeg(p, P[i], P[(i + 1) % P.length])); return m; }
  /* recorte de polígono por semiplano (Sutherland–Hodgman): fica o lado com dot(n, p) <= k */
  function cortarSemiplano(P, n, k) {
    var out = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], da = dot(n, a) - k, db = dot(n, b) - k;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { var t = da / (da - db); out.push(add(a, mul(sub(b, a), t))); }
    }
    return out;
  }
  /* ESCADA (revisão 21/10/2026): a laje do ambiente fechava o vão da escada que sobe para o pavimento de cima. A planta
     da escada (a caixa dela) vira FURO da laje — recortada 2 cm para dentro da caixa do ambiente (o furo tem de ficar
     inteiro dentro da laje). Devolve [{ id, P }] das escadas que chegam no teto deste pavimento. */
  function escadasDe(estado) {
    return arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "escada" && ativa(c); }).map(function (c) {
      var th = num(c.rotY, 0), ux = v(Math.cos(th), -Math.sin(th)), uz = v(Math.sin(th), Math.cos(th)), hx = num(c.comprimento, 0) / 2, hz = num(c.espessura, 0) / 2, o = v(num(c.cx, 0), num(c.cz, 0));
      return { id: String(c.id), yb: num(c.cy, 0) - num(c.altura, 0) / 2, yt: num(c.cy, 0) + num(c.altura, 0) / 2,
               P: [add(o, add(mul(ux, -hx), mul(uz, -hz))), add(o, add(mul(ux, hx), mul(uz, -hz))), add(o, add(mul(ux, hx), mul(uz, hz))), add(o, add(mul(ux, -hx), mul(uz, hz)))] };
    });
  }
  function furoEscada(esc, P) {
    var bx = caixaDe(P), e = 0.02, F = esc.P.slice();
    F = cortarSemiplano(F, v(-1, 0), -(bx.x0 + e)); F = cortarSemiplano(F, v(1, 0), bx.x1 - e);
    F = cortarSemiplano(F, v(0, -1), -(bx.z0 + e)); F = cortarSemiplano(F, v(0, 1), bx.z1 - e);
    if (F.length < 3 || areaPoli(F) < 0.1) return null;
    return F;
  }
  function caixaDe(P) { var xs = P.map(function (p) { return p.x; }), zs = P.map(function (p) { return p.z; }); return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) }; }

  /* ---------------------------------------------------------------- serviços do orçamento (códigos do js/concdados.js) */
  function servicosDe(papel, tipoLaje, hCm, nPav) {
    var taxa = crit("taxaAcoKgM3", 100), conc = sinapi(nPav > 1 ? "vigaLajeConcretoMulti" : "vigaLajeConcretoTerrea"), S = [];
    var est = " — ESTIMATIVA (" + ROTULO + ")";
    function sv(k, medida, fator, rot) { var s = sinapi(k); if (s && s.codigo) S.push({ codigo: s.codigo, medida: medida, fator: fator || 1, rotulo: (rot + est).slice(0, 80) }); }
    if (papel === "pilar") { sv("pilarConcreto", "volume", 1, "Concreto C25 do pilar"); sv("formaPilar", "areaForma", 1, "Fôrma do pilar"); sv("acoPilarViga", "kgPorM3", taxa, "Aço " + taxa + " kg/m³ (taxa)"); }
    else if (papel === "viga") { if (conc) S.push({ codigo: conc.codigo, medida: "volume", fator: 1, rotulo: ("Concreto C25 da viga" + est).slice(0, 80) }); sv("formaViga", "areaForma", 1, "Fôrma da viga"); sv("acoPilarViga", "kgPorM3", taxa, "Aço " + taxa + " kg/m³ (taxa)"); }
    else if (papel === "laje" && tipoLaje === "trelicada") {
      var T = sinapi("trelicada"), t = T && T[String(hCm)];
      if (t) S.push({ codigo: t.codigo, medida: "area", fator: 1, rotulo: ("Laje treliçada h " + hCm + " cm" + est).slice(0, 80) });
    } else if (papel === "laje") { if (conc) S.push({ codigo: conc.codigo, medida: "volume", fator: 1, rotulo: ("Concreto C25 da laje" + est).slice(0, 80) }); sv("formaLaje", "area", 1, "Fôrma da laje"); sv("acoLaje", "kgPorM3", taxa, "Aço " + taxa + " kg/m³ (taxa)"); }
    return S;
  }

  /* ================================================================ GERAR */
  function gerar(estado, opc) {
    opc = opc || {};
    var BA = ARQ(), BE = EDIT(), DD = DADOS();
    if (!BA || !BE) return { ok: false, motivo: "O modelador (js/bimarq.js) não carregou." };
    if (!DD) return { ok: false, motivo: "Os critérios do concreto (js/concdados.js) não carregaram." };
    if (!estado) return { ok: false, motivo: "Sem modelo aberto." };
    var avisos = [], pendencias = [], premissas = [];
    var vaoMax = num(opc.vaoMax, crit("vaoEconomicoMaxM", 5.5)), hMinViga = crit("vigaAlturaMinimaCm", 25) / 100;
    var PU = paredesUteis(estado, opc);
    if (!PU.usadas.length) return { ok: false, motivo: "Nenhuma parede para apoiar a estrutura" + (PU.ignoradas.length ? " (" + PU.ignoradas.length + " ignorada(s): " + PU.ignoradas[0].motivo + ")" : "") + ". Lance as paredes da arquitetura antes." };
    var vaos = typeof opc.avaliarFam === "function" ? BE.vaosDasParedes(estado, opc.avaliarFam) : {};
    if (typeof opc.avaliarFam !== "function") avisos.push("Sem o catálogo das famílias: as portas e janelas NÃO foram conferidas (pilar e verga).");
    var pavs = pavimentosDe(PU.usadas, opc.niveis);
    if (pavs.length > 4) avisos.push("Mais de 4 pavimentos: fora do pré-lançamento automático (ESCALAR o engenheiro — 6118 15.5.2).");

    /* o que o usuário mexeu à mão (fica) e as peças do pré-lançamento anterior (saem) */
    var MN = opc.forcar ? { editados: [], apagados: [] } : manuais(opc.ops);
    var editado = {}, apagado = {};
    MN.editados.forEach(function (k) { editado[k] = 1; }); MN.apagados.forEach(function (k) { apagado[k] = 1; });
    /* gerenciadas = as que um lote do pré-lançamento criou e ninguém mexeu (com as ops; sem elas, as marcadas) */
    var criouLote = null; if (Array.isArray(opc.ops)) { criouLote = {}; manuais(opc.ops).nossas.forEach(function (k) { criouLote[k] = 1; }); }
    var nossas = arr(estado.caixas).filter(function (c) { return ehPreLanc(c) && (!criouLote || criouLote[String(c.id)]); }), gerenciadas = nossas.filter(function (c) { return !editado[String(c.id)]; });
    var gerId = {}; gerenciadas.forEach(function (c) { gerId[String(c.id)] = 1; });
    var existentes = arr(estado.caixas).filter(function (c) { return ehConcreto(c) && ativa(c) && !gerId[String(c.id)]; });
    var EM = estruturaModelada(estado, opc);
    existentes = existentes.concat(EM.pecas);
    if (EM.pecas.length) avisos.push("Estrutura já modelada (aço, madeira ou família): " + EM.pecas.length + " peça(s) — o pré-lançamento não lança outra no lugar delas (sem cobrar em dobro); confira a ligação.");
    if (EM.semGeometria.length) avisos.push("Família estrutural sem geometria lida (" + EM.semGeometria.join(", ") + "): só a posição foi considerada — confira se não há viga/laje em dobro.");

    var pilares = [], vigas = [], lajes = [];
    /* --- por pavimento: linhas, nós, pilares */
    pavs.forEach(function (pav) {
      pav.linhas = linhasDe(pav, vaos);
      pav.nos = nosDe(pav.linhas);
      pav.pilares = [];
      pav.linhas.forEach(function (l) {
        if (l.paredes.some(function (w) { return w.nucleoAssumido; })) l.espAssumida = true;
      });
      pav.nos.forEach(function (no) {
        if (no.tipo === "passa") return;
        if (no.tipo === "ponta") {
          var lp = no.linhas[0].l;
          if (lp.comprimento < crit("trechoCurtoSemVigaM", 1.0)) { lp.semViga = true; return; }
        }
        var pc = pilarNoNo(no); if (!pc) return;
        pav.pilares.push({ p: pc.centro, u: pc.u, l: pc.l, sec: pc.sec, tipoNo: no.tipo, cabe: pc.cabe, conflito: pc.conflito ? pc.conflito.id : null,
          yb: Math.min.apply(null, no.linhas.map(function (it) { return it.l.yb; })),
          regras: [no.tipo === "ponta" ? "pilarPontaLivre" : "pilarNosEncontros", "pilarEmbutido"] });
      });
      /* linhas curtas soltas nas duas pontas: sem viga */
      pav.linhas.forEach(function (l) { if (l.comprimento < crit("trechoCurtoSemVigaM", 1.0) && !pav.pilares.some(function (p) { return naLinha(l, p.p); })) l.semViga = true; });
    });
    /* --- prumo entre pavimentos (Bacarji p. 857): o de cima desce onde há parede; o de baixo sobe onde há parede em cima */
    function achaPilar(pav, p, tol) { return pav.pilares.filter(function (x) { return dist(x.p, p) < (tol || 0.06); })[0] || null; }
    function linhaSob(pav, p) { return pav.linhas.filter(function (l) { return !l.semViga && naLinha(l, p) && !conflitoAbertura(l, dot(l.u, p) - 0.1, dot(l.u, p) + 0.1); })[0] || null; }
    function prumo() {
    for (var k = pavs.length - 1; k >= 1; k--) {
      pavs[k].pilares.forEach(function (pp) {
        if (achaPilar(pavs[k - 1], pp.p)) return;
        var lb = linhaSob(pavs[k - 1], pp.p);
        if (lb) pavs[k - 1].pilares.push({ p: pp.p, u: pp.u, l: lb, yb: lb.yb, sec: secaoPelaParede(lb.larg), tipoNo: "prumo", cabe: true, conflito: null, regras: ["pilarPrumo", "pilarEmbutido"] });
        else if (!pp.transicao) { pp.transicao = true; avisos.push("Pilar do " + pavs[k].nome + " sem parede embaixo: nasce em viga (TRANSIÇÃO) — ESCALAR o engenheiro."); }
      });
    }
    for (var k2 = 0; k2 + 1 < pavs.length; k2++) {
      pavs[k2].pilares.forEach(function (pp) {
        if (achaPilar(pavs[k2 + 1], pp.p)) return;
        var la = linhaSob(pavs[k2 + 1], pp.p);
        if (la) pavs[k2 + 1].pilares.push({ p: pp.p, u: pp.u, l: la, yb: la.yb, sec: secaoPelaParede(la.larg), tipoNo: "prumo", cabe: true, conflito: null, regras: ["pilarPrumo", "pilarEmbutido"] });
      });
    }
    }
    prumo();
    /* --- intermediários: vão entre pilares > vão máximo (Bacarji p. 858), DEPOIS do prumo e preferindo o prumo de outro pavimento */
    function intermediarios() { pavs.forEach(function (pav) {
      /* intermediários: vão entre pilares > vão máximo */
      pav.linhas.forEach(function (l) {
        if (l.semViga) return;
        var ss = pav.pilares.filter(function (p) { return naLinha(l, p.p); }).map(function (p) { return dot(l.u, p.p); }).sort(function (a, b) { return a - b; });
        for (var i = 0; i + 1 < ss.length; i++) {
          var g = ss[i + 1] - ss[i]; if (g <= vaoMax + 1e-9) continue;
          var n = Math.ceil(g / vaoMax - 1e-9), sec = secaoPelaParede(l.larg);
          for (var k = 1; k < n; k++) {
            var alvo = ss[i] + g * k / n, raio = Math.max(0.3, g / n / 2 - 0.4), viz = prumoPerto(pav, l, alvo, raio), s = viz != null && !conflitoAbertura(l, viz - sec.L / 2, viz + sec.L / 2) ? viz : posLivre(l, alvo, sec.L, raio);
            if (s == null) { avisos.push("Vão de " + virg(g) + " m numa parede do " + pav.nome + " sem lugar livre de porta/janela para o pilar intermediário: conferir."); continue; }
            pav.pilares.push({ p: ponto(l, s), u: l.u, l: l, yb: l.yb, sec: sec, tipoNo: "intermediario", cabe: true, conflito: null, regras: ["vaoEconomicoMaxM", "pilarEmbutido"] });
          }
        }
      });
    }); }
    /* um pilar de OUTRO pavimento sobre esta linha perto do alvo: o intermediário fica no prumo dele */
    function prumoPerto(pav, l, alvo, raio) {
      var melhor = null;
      pavs.forEach(function (o) { if (o === pav) return; o.pilares.forEach(function (pp) { if (!naLinha(l, pp.p)) return; var s = dot(l.u, pp.p); if (Math.abs(s - alvo) <= raio && (melhor == null || Math.abs(s - alvo) < Math.abs(melhor - alvo))) melhor = s; }); });
      return melhor;
    }
    intermediarios();
    prumo();
    /* --- o pilar lançado à mão perto do candidato toma o lugar dele */
    pavs.forEach(function (pav) {
      pav.manuaisPil = existentes.filter(function (c) {
        if (c.tipo !== "pilar") return false;
        var base = num(c.cy, 0) - num(c.altura, 0) / 2, topo = num(c.cy, 0) + num(c.altura, 0) / 2;
        return base < pav.topo - 0.1 && topo > pav.yb + 0.1;
      });
      pav.pilares = pav.pilares.filter(function (pp) {
        var m = pav.manuaisPil.filter(function (c) { return dist(v(c.cx, c.cz), pp.p) < 0.4; })[0];
        if (m) { pp.substituidoPor = m.id; return false; }
        return true;
      });
    });

    /* --- 4. lajes por ambiente */
    var ignoradaId = {}; PU.ignoradas.forEach(function (x) { ignoradaId[String(x.id)] = x.motivo; });
    var tipoPref = opc.tipoLaje === "macica" || opc.tipoLaje === "trelicada" ? opc.tipoLaje : "auto";
    function delimitados(e) { return arr(e && e.ambientes).filter(function (a) { return a && a.calc && a.calc.estado === "delimitado" && arr(a.calc.contorno).length >= 3; }); }
    function calcLajes(ambs) { pavs.forEach(function (pav) {
      pav.lajes = [];
      var paredesPav = {}; pav.paredes.forEach(function (w) { paredesPav[w.id] = w; });
      /* o ambiente é deste pavimento se as paredes dele são deste pavimento (o ambiente sem nível tem base 0 mesmo com as
         paredes noutra cota — achado na e2e: o exemplo do app fica a −0,60 m); sem parede conhecida, pela base */
      var meus = ambs.filter(function (a) {
        var ids = arr(a.calc.lados).filter(function (ld) { return ld.fonte && ld.fonte.tipo === "parede"; }).map(function (ld) { return String(ld.fonte.id); });
        var daqui = ids.filter(function (k) { return paredesPav[k]; }).length, deOutro = ids.filter(function (k) { return !paredesPav[k] && pavs.some(function (o) { return o !== pav && o.paredes.some(function (w) { return w.id === k; }); }); }).length;
        if (daqui || deOutro) return daqui >= deOutro && daqui > 0;
        var b0 = num(a.calc.base, 0); return b0 > pav.yb - 0.1 && b0 < pav.ybMax + 0.1;   /* sem parede conhecida: pela base (o desnível do pavimento conta — revisão R1) */
      });
      /* ambientes ligados por separador (laje contínua, sem viga entre eles) */
      var sepDe = {};
      meus.forEach(function (a) { arr(a.calc.lados).forEach(function (ld) { if (ld.fonte && ld.fonte.tipo === "separador") { var L = sepDe[ld.fonte.id] = sepDe[ld.fonte.id] || []; if (L.indexOf(a.id) < 0) L.push(a.id); } }); });
      meus.forEach(function (a) { a._P = a.calc.contorno.map(function (p) { return v(num(p.x, 0), num(p.z, 0)); }); a._bx = caixaDe(a._P); });
      meus.forEach(function (a) {
        var lados = arr(a.calc.lados), parLados = lados.filter(function (ld) { return ld.fonte && ld.fonte.tipo === "parede"; });
        var todasIgnoradas = parLados.length && parLados.every(function (ld) { return ignoradaId[String(ld.fonte.id)] && !paredesPav[String(ld.fonte.id)]; });
        if (todasIgnoradas) { pav.lajes.push({ amb: a, pulada: "ambiente da construção existente (reforma)" }); return; }
        var cen = centroide(a._P);
        var mao = existentes.filter(function (c) {
          if (c.tipo !== "laje") return false;
          var topo = num(c.cy, 0) + num(c.altura, 0) / 2; if (Math.abs(topo - pav.topo) > 0.16) return false;
          if (arr(c.contorno).length >= 3) return dentro(cen, c.contorno.map(function (p) { return v(p.x, p.z); }));
          return Math.abs(cen.x - c.cx) <= num(c.comprimento, 0) / 2 && Math.abs(cen.z - c.cz) <= num(c.espessura, 0) / 2;
        })[0];
        if (mao) { pav.lajes.push({ amb: a, pulada: "laje já lançada (" + mao.id + ")", existente: mao.id }); return; }
        var espMed = parLados.length ? parLados.reduce(function (s, ld) { var w = paredesPav[String(ld.fonte.id)]; return s + (w ? w.esp : 0.15); }, 0) / parLados.length : 0.15;
        /* o vão do painel: a caixa do ambiente + a parede (de eixo a eixo das vigas) */
        var g = a._bx, dx = g.x1 - g.x0 + espMed, dz = g.z1 - g.z0 + espMed, lx = Math.min(dx, dz), ly = Math.max(dx, dz);
        /* bordas engastadas (continuidade): lado sobre parede com OUTRO ambiente na face oposta, ou separador (laje contínua) */
        var faceOutro = {}; meus.forEach(function (b) { if (b !== a) arr(b.calc.lados).forEach(function (ld) { if (ld.fonte && ld.fonte.tipo === "parede" && ld.fonte.face !== "ponta") (faceOutro[String(ld.fonte.id)] = faceOutro[String(ld.fonte.id)] || {})[ld.fonte.face] = 1; }); });
        var lad = {}, continuaCom = [];
        lados.forEach(function (ld) {
          if (!ld.fonte) return;
          var cont = false;
          if (ld.fonte.tipo === "separador") { cont = true; (sepDe[ld.fonte.id] || []).forEach(function (o) { if (o !== a.id && continuaCom.indexOf(o) < 0) continuaCom.push(o); }); }
          else if (ld.fonte.tipo === "parede" && ld.fonte.face !== "ponta" && paredesPav[String(ld.fonte.id)]) { var fo = faceOutro[String(ld.fonte.id)]; cont = !!(fo && Object.keys(fo).some(function (f) { return f !== ld.fonte.face; })); }
          if (!cont) return;
          var mx = (ld.x0 + ld.x1) / 2, mz = (ld.z0 + ld.z1) / 2, hor = Math.abs(ld.x1 - ld.x0) >= Math.abs(ld.z1 - ld.z0);
          lad[hor ? (mz < cen.z ? "N" : "S") : (mx < cen.x ? "O" : "L")] = 1;
        });
        var nEng = Object.keys(lad).length, apoiosExistentes = parLados.filter(function (ld) { return /^existente/.test(ignoradaId[String(ld.fonte.id)] || ""); }).map(function (ld) { return String(ld.fonte.id); });
        /* BORDA LIVRE = BALANÇO (revisão 21/10/2026): a varanda delimitada por separador (sem outro ambiente do outro lado),
           por mureta/muro (não recebe viga) ou por nada saía como laje apoiada — 7 cm na cobertura, abaixo dos 10 cm da
           6118 13.2.4.1-c para laje em balanço, e treliçada "biapoiada" em balanço. Agora: maciça, ≥ 10 cm, ESCALAR. */
        var livres = lados.filter(function (ld) {
          var comp = Math.sqrt(Math.pow(num(ld.x1, 0) - num(ld.x0, 0), 2) + Math.pow(num(ld.z1, 0) - num(ld.z0, 0), 2)); if (!(comp >= 0.2)) return false;
          var f = ld.fonte; if (!f) return true;
          if (f.tipo === "separador") return (sepDe[f.id] || []).length < 2;
          if (f.tipo === "parede") { var mot = ignoradaId[String(f.id)]; return !!mot && !paredesPav[String(f.id)] && !/^existente/.test(mot); }
          return false;
        }).map(function (ld) { return virg(Math.sqrt(Math.pow(num(ld.x1, 0) - num(ld.x0, 0), 2) + Math.pow(num(ld.z1, 0) - num(ld.z0, 0), 2))) + " m"; });
        var balanco = livres.length > 0;
        var tipo = balanco ? "macica" : (tipoPref === "auto" ? (lx <= crit("lajeMacicaVaoMaxM", 5.0) + 1e-9 ? "macica" : "trelicada") : tipoPref);
        var hCm, regras = [], av = [];
        if (balanco) av.push("BALANÇO: " + livres.length + " borda(s) livre(s) (" + livres.join(", ") + ") — maciça com o mínimo de " + crit("lajeMinBalancoCm", 10) + " cm (" + fonteDe("lajeMinBalancoCm") + ") e γn; ESCALAR o engenheiro");
        if (balanco && tipoPref === "trelicada") av.push("treliçada pedida, mas a laje é em balanço: vai maciça (a treliçada da NBR 14859-1 é biapoiada)");
        if (tipo === "macica") {
          var lE = Math.min(lx, 0.7 * ly), d = (2.5 - 0.1 * nEng) * lE, hMin = balanco ? crit("lajeMinBalancoCm", 10) : (pav.ultimo ? crit("lajeMinCoberturaCm", 7) : crit("lajeMinPisoCm", 8));
          hCm = Math.max(hMin, Math.round(d + 2.5));
          regras.push("lajeAlturaFormula", balanco ? "lajeMinBalancoCm" : (pav.ultimo ? "lajeMinCoberturaCm" : "lajeMinPisoCm"));
          if (lx > crit("lajeMacicaVaoMaxM", 5.0) + 1e-9) av.push("maciça com vão de " + virg(lx) + " m (acima de 5,0 m)");
        } else {
          var alts = crit("trelicadaAlturasCm", [12, 16, 20, 25]), alvo = Math.max(12, lx * 100 / crit("trelicadaHPorVao", 25));
          hCm = alts.filter(function (h) { return h >= alvo - 1e-9; })[0] || alts[alts.length - 1];
          regras.push("trelicadaAlturasCm", "trelicadaHPorVao");
          /* vão acima do que a maior altura da Tabela 1 cobre pela regra lx/25 (revisão 21/10/2026: saía 25 cm calado) */
          if (hCm < alvo - 1e-9) av.push("treliçada: a regra h ≥ lx/25 pede " + Math.ceil(alvo) + " cm e a maior altura da NBR 14859-1 Tabela 1 é " + hCm + " cm — ESCALAR o engenheiro / tabela do fabricante");
          if (lx > crit("trelicadaEnsaioVaoM", 6.0) + 1e-9) av.push("treliçada com vão de " + virg(lx) + " m: ensaio do conjunto (NBR 14859-1:2002 6.3.1)");
        }
        if (lx > crit("vaoEscalarM", 8.0)) av.push("vão de " + virg(lx) + " m: ESCALAR o engenheiro");
        if (continuaCom.length) av.push("contínua com " + continuaCom.join(", ") + " pelo separador (sem viga entre eles): conferir o vão conjunto");
        if (apoiosExistentes.length) av.push("apoiada em parede EXISTENTE (" + apoiosExistentes.join(", ") + "): conferir a ligação com a estrutura existente");
        var furos = [], escIds = [];
        ESC.forEach(function (es) {
          if (es.yb > pav.ybMax + 0.2 || es.yb < pav.yb - 0.2 || es.yt < pav.topo - 0.6) return;   /* só a escada que SOBE deste pavimento até o teto dele */
          var F = furoEscada(es, a._P); if (!F) return;
          if (!F.some(function (q) { return dentro(q, a._P) || distBorda(q, a._P) < 0.03; })) return;
          furos.push(F); escIds.push(es.id);
        });
        if (escIds.length) av.push("vão da escada " + escIds.join(", ") + " aberto na laje (furo pela planta da escada) — o engenheiro confere a borda do vão");
        pav.lajes.push({ amb: a, P: a._P, tipo: tipo, hCm: hCm, lx: r3(lx), ly: r3(ly), nEng: nEng, umaDirecao: ly / lx > crit("lajeUmaDirecaoRazao", 2), regras: regras, avisos: av,
          area: Math.max(0, areaPoli(a._P) - furos.reduce(function (s0, F) { return s0 + areaPoli(F); }, 0)), balanco: balanco, furos: furos, escadas: escIds });
      });
    }); }
    var ESC = escadasDe(estado);
    calcLajes(delimitados(estado));

    /* --- área de influência e seção final do pilar (Bacarji 1996) */
    var fck = num(opc.fck, crit("fckPadraoMPa", 25)), sigId = 0.85 * fck / crit("gamaC", 1.4) + crit("pilarTaxaRho", 0.02) * crit("pilarSigmaS2MPa", 420);
    var ALFA = crit("pilarAlfa", { interno: 1.8, extremidade: 2.2, canto: 2.5 }), pCarga = crit("pilarCargaPartidaKNm2", 10);
    pavs.forEach(function (pav, ip) {
      pav.pilares.forEach(function (pp) { pp.ai = 0; pp.nPaineis = 0; });
      pav.lajes.forEach(function (lj) {
        if (!lj.P) return;
        var viz = pav.pilares.filter(function (pp) { return distBorda(pp.p, lj.P) < 0.35; });
        viz.forEach(function (pp) { pp.ai += lj.area / viz.length; pp.nPaineis++; });
      });
      var nAcima = pavs.length - 1 - ip;
      pav.pilares.forEach(function (pp) {
        var pos = pp.nPaineis >= 3 ? "interno" : (pp.nPaineis === 2 ? "extremidade" : "canto"), alfa = ALFA[pos];
        var Ac = alfa * pp.ai * pCarga * (nAcima + 0.7) / (sigId / 10);   /* cm²: Ai m², p kN/m², σid MPa → kN/cm² */
        pp.pos = pos; pp.Ac = Math.round(Ac);
        var Lc = Math.max(cm(pp.sec.L), Math.ceil(Ac / cm(pp.sec.b) / 5 - 1e-9) * 5);
        pp.Lfinal = Lc / 100;
      });
    });
    /* mesma seção em todos os pavimentos (a maior da prumada) */
    var prumadas = [];
    pavs.forEach(function (pav) { pav.pilares.forEach(function (pp) {
      var pr = prumadas.filter(function (x) { return dist(x.p, pp.p) < 0.06; })[0];
      if (!pr) { pr = { p: pp.p, itens: [] }; prumadas.push(pr); }
      pr.itens.push(pp); pp.prumada = pr;
    }); });
    prumadas.sort(function (a, b) { return (a.p.z - b.p.z) || (a.p.x - b.p.x); });
    prumadas.forEach(function (pr, i) {
      pr.marca = "P" + (i + 1);
      var L = Math.max.apply(null, pr.itens.map(function (x) { return x.Lfinal; })), b = Math.min.apply(null, pr.itens.map(function (x) { return x.sec.b; }));
      pr.itens.forEach(function (x) { x.Lfinal = L; x.bFinal = b; });
    });

    /* a base do pilar = a da parede que o contém (a linha de viga junta paredes de bases diferentes no desnível) */
    function baseEm(pav, p, dflt) {
      var bs = pav.paredes.filter(function (w) { return distSeg(p, w.a, w.b) <= w.esp / 2 + 0.05; }).map(function (w) { return w.yb; });
      return bs.length ? Math.min.apply(null, bs) : (fin(dflt) ? dflt : pav.yb);
    }
    /* --- caixas dos pilares */
    var pecas = [], novoIds = {}, uniaoDe = {};
    function guardar(c, papel, pav, extra) {
      var id = String(c.id);
      if (novoIds[id]) return null;
      novoIds[id] = 1;
      c.comentarios = ROTULO;
      c.conc = { origem: "prelanc", versao: 1, papel: papel, pav: pav.idx, pavNome: pav.nome, rotulo: ROTULO };
      Object.keys(extra || {}).forEach(function (k) { c.conc[k] = extra[k]; });
      pecas.push(c);
      return c;
    }
    pavs.forEach(function (pav) {
      pav.pilares.forEach(function (pp) {
        var b = pp.bFinal, L = pp.Lfinal, yb0 = baseEm(pav, pp.p, pp.yb), H = pav.topo - yb0;   /* a base da parede dele (desnível no pavimento) */
        var c = BA.pilarPerfil({ x: r4(pp.p.x), z: r4(pp.p.z) }, { perfil: { forma: "ret", b: r4(L), h: r4(b) }, material: "concreto", base: r4(yb0), altura: r4(H), rotY: rotYde(pp.u) });
        if (!c) return;
        c.id = "cp-p" + pav.idx + "-" + coord(pp.p.x) + "_" + coord(pp.p.z);
        c.marca = pp.prumada.marca;
        if (pav.nivelBase) c.nivelId = pav.nivelBase;
        var reg = pp.regras.slice(); if (L > pp.sec.L + 1e-9) reg.push("pilarAlfa", "pilarCargaPartidaKNm2");
        var g = guardar(c, "pilar", pav, { secao: cm(b) + " × " + cm(L), tipoNo: pp.tipoNo, posicao: pp.pos, Ai: r3(pp.ai), Ac: pp.Ac, regras: reg,
          gamaN: cm(b) < crit("pilarLadoMinimoCm", 19) ? 1.25 : 1.0, sobressai: !pp.sec.embutido || !pp.cabe, transicao: !!pp.transicao, conflito: pp.conflito });
        if (!g) return;
        uniaoDe[c.id] = pav.paredes.filter(function (w) { return distSeg(pp.p, w.a, w.b) <= w.esp / 2 + Math.max(b, L) / 2 + 0.02 && w.yb < pav.topo - 0.1 && w.yt > yb0 + 0.1; }).map(function (w) { return w.id; });
        pilares.push({ id: c.id, marca: c.marca, pav: pav.nome, secao: cm(b) + " × " + cm(L), tipoNo: pp.tipoNo, posicao: pp.pos, Ai: r3(pp.ai), Ac: pp.Ac, x: r3(pp.p.x), z: r3(pp.p.z),
          regra: pp.sec.regra + (L > pp.sec.L + 1e-9 ? "; área de influência pede " + pp.Ac + " cm² → " + cm(b) + " × " + cm(L) : ""), transicao: !!pp.transicao, conflito: pp.conflito });
        if (cm(L) > crit("pilarParedeRazao", 5) * cm(b)) avisos.push("Pilar " + c.marca + " (" + cm(b) + " × " + cm(L) + ") virou pilar-parede: ESCALAR o engenheiro (6118 14.4.2.4).");
        if (pp.conflito) avisos.push("Pilar " + c.marca + " no " + pav.nome + " encosta no vão " + pp.conflito + ": veja o auditor.");
      });
    });
    /* o pilar que sobressai muda o contorno do ambiente (js/bimambiente.js conta o pilar): a laje sai do ambiente JÁ com os
       pilares novos — senão a 2ª rodada daria outra laje e o lote não seria idempotente */
    if (Array.isArray(opc.ops)) {
      try {
        var tmp = { op: "lote", id: LOTE, origem: LOTE, ops: gerenciadas.map(function (c) { return { op: "apagar", id: c.id }; }).concat(pecas.filter(function (c) { return !editado[String(c.id)] && !apagado[String(c.id)]; }).map(function (c) { return { op: "criar", id: c.id, caixa: BA.paraOp(c) }; })) };
        var est2 = BE.aplicar(clone(opc.ops).concat([tmp]), opc.niveis ? { niveis: opc.niveis } : undefined);
        if (est2 && delimitados(est2).length) calcLajes(delimitados(est2));
      } catch (eR) { avisos.push("Não consegui refazer os ambientes com os pilares novos: a laje sai do contorno de antes."); }
    }

    /* --- 3. vigas sob as paredes, de pilar a pilar */
    pavs.forEach(function (pav) {
      var apoios = pav.pilares.map(function (pp) { return { p: pp.p }; }).concat(pav.manuaisPil.map(function (c) { return { p: v(c.cx, c.cz), mao: c.id }; }));
      var manuaisViga = existentes.filter(function (c) { return c.tipo === "viga" && Math.abs((num(c.cy, 0) + num(c.altura, 0) / 2) - pav.topo) < 0.16; });
      var porLinha = [];
      pav.linhas.forEach(function (l) {
        if (l.semViga) return;
        var ss = apoios.filter(function (a) { return naLinha(l, a.p, 0.05); }).map(function (a) { return dot(l.u, a.p); }).sort(function (a, b) { return a - b; });
        ss = ss.filter(function (s, i) { return i === 0 || s - ss[i - 1] > 0.05; });
        if (ss.length < 2) { if (l.comprimento >= crit("trechoCurtoSemVigaM", 1.0)) avisos.push("Parede de " + virg(l.comprimento) + " m no " + pav.nome + " sem dois apoios: sem viga (conferir)."); return; }
        var tr = [];
        for (var i = 0; i + 1 < ss.length; i++) tr.push({ a: ss[i], b: ss[i + 1], ext: i === 0 || i + 2 === ss.length });
        var hLinha = 0;
        tr.forEach(function (t) { t.L = t.b - t.a; t.k = t.ext ? crit("vigaAlturaExtremo", 10) : crit("vigaAlturaInterno", 12); t.hReq = Math.max(hMinViga, teto5(t.L / t.k)); hLinha = Math.max(hLinha, t.hReq); });
        porLinha.push({ l: l, tr: tr, h: hLinha });
      });
      porLinha.forEach(function (pl) {
        var l = pl.l, bCm = Math.max(crit("vigaLarguraMinimaCm", 12), Math.min(20, Math.floor(cm(l.larg) + 1e-6))), b = bCm / 100;
        pl.tr.forEach(function (t) {
          var pa = ponto(l, t.a), pb = ponto(l, t.b);
          var mao = manuaisViga.filter(function (c) {
            var e = BE.eixoDaCaixa(c), m = mul(add(v(e[0].x, e[0].z), v(e[1].x, e[1].z)), 0.5);
            return naLinha(l, m, 0.05) && dot(l.u, m) > t.a && dot(l.u, m) < t.b;
          })[0];
          if (mao) { vigas.push({ id: mao.id, pulada: "viga já lançada" }); return; }
          var h = pl.h, ab = l.aberturas.filter(function (a) { return a.s1 > t.a && a.s0 < t.b; }), lim = null;
          ab.forEach(function (a) { var disp = pav.topo - (l.yb + a.y1); if (lim == null || disp < lim.disp) lim = { disp: disp, id: a.id }; });
          var limitada = false;
          if (lim && h > lim.disp + 1e-9 && lim.disp >= 0.20 - 1e-9) { h = piso5(lim.disp); limitada = true; }
          var c = BA.vigaPerfil({ x: r4(pa.x), z: r4(pa.z) }, { x: r4(pb.x), z: r4(pb.z) }, { perfil: { forma: "ret", b: b, h: r4(h) }, material: "concreto", topo: pav.topo });
          if (!c) return;
          c.id = "cp-v" + pav.idx + "-" + coord(pa.x) + "_" + coord(pa.z) + "-" + coord(pb.x) + "_" + coord(pb.z);
          if (pav.nivelTopo) c.nivelId = pav.nivelTopo;
          var reg = [t.ext ? "vigaAlturaExtremo" : "vigaAlturaInterno", "vigaAlturaMinimaCm", "vigaAlturaPassoCm", "vigaAlturaUniforme", "vigaLarguraMinimaCm"];
          var g = guardar(c, "viga", pav, { secao: bCm + " × " + cm(h), vao: r3(t.L), tramo: t.ext ? "extremo" : "intermediario", regras: reg, limitadaPor: limitada ? lim.id : null, sobressai: cm(l.esp) < bCm });
          if (!g) return;
          uniaoDe[c.id] = l.paredes.filter(function (w) { var sa = dot(l.u, w.a), sb = dot(l.u, w.b); return Math.min(t.b, Math.max(sa, sb)) - Math.max(t.a, Math.min(sa, sb)) > 0.05; }).map(function (w) { return w.id; });
          vigas.push({ id: c.id, pav: pav.nome, secao: bCm + " × " + cm(h), vao: r3(t.L), regra: "h = ℓ/" + t.k + " = " + virg(t.L / t.k) + " m → " + cm(pl.h) + " cm (uniforme na linha)" + (limitada ? "; limitada a " + cm(h) + " cm pela verga de " + lim.id + " — A CALCULAR" : ""), limitadaPor: limitada ? lim.id : null });
          if (limitada) avisos.push("Viga " + c.id + " limitada a " + cm(h) + " cm pela verga de " + lim.id + " (pedia " + cm(pl.h) + " cm): A CALCULAR.");
        });
      });
    });
    /* nome das vigas: horizontais primeiro, de cima para baixo e da esquerda para a direita */
    var vigCx = pecas.filter(function (c) { return c.conc.papel === "viga"; });
    pavs.forEach(function (pav) {
      var L = vigCx.filter(function (c) { return c.conc.pav === pav.idx; });
      L.sort(function (a, b) { var ha = Math.abs(Math.cos(a.rotY)) >= 0.7 ? 0 : 1, hb = Math.abs(Math.cos(b.rotY)) >= 0.7 ? 0 : 1; return ha - hb || (ha === 0 ? (a.cz - b.cz) || (a.cx - b.cx) : (a.cx - b.cx) || (a.cz - b.cz)); });
      L.forEach(function (c, i) { c.marca = "V" + (pavs.length > 1 ? (pav.idx + 1) * 100 + i + 1 : i + 1); });
    });
    /* --- caixas das lajes */
    pavs.forEach(function (pav) {
      var nl = 0;
      pav.lajes.forEach(function (lj) {
        if (!lj.P) { if (lj.pulada) lajes.push({ amb: lj.amb.nome || lj.amb.id, pulada: lj.pulada }); return; }
        var rot = (lj.tipo === "macica" ? "Laje maciça " + lj.hCm + " cm" : "Laje treliçada h " + lj.hCm + " cm") + " — PRÉ-DIM.";
        var c = BA.lajeContorno(lj.P.map(function (p) { return { x: r4(p.x), z: r4(p.z) }; }), { espessura: lj.hCm / 100, topo: pav.topo, tipoLaje: { id: "conc-" + lj.tipo + "-" + lj.hCm, rotulo: rot },
          furos: arr(lj.furos).map(function (F) { return F.map(function (p) { return { x: r4(p.x), z: r4(p.z) }; }); }) });
        if (!c) { avisos.push("Ambiente " + (lj.amb.nome || lj.amb.id) + ": contorno que não vira laje (conferir)."); return; }
        if (arr(lj.furos).length && arr(c.furos).length < lj.furos.length) avisos.push("Laje do ambiente " + (lj.amb.nome || lj.amb.id) + ": o vão da escada " + lj.escadas.join(", ") + " NÃO coube como furo — abra o vão à mão antes de orçar (veja o auditor).");
        c.id = "cp-l" + pav.idx + "-" + String(lj.amb.id).replace(/[^A-Za-z0-9_-]/g, "_");
        if (pav.nivelTopo) c.nivelId = pav.nivelTopo;
        nl++; c.marca = "L" + (pavs.length > 1 ? (pav.idx + 1) * 100 + nl : nl);
        var g = guardar(c, "laje", pav, { tipoLaje: lj.tipo, h: lj.hCm, lx: lj.lx, ly: lj.ly, bordasEngastadas: lj.nEng, umaDirecao: lj.umaDirecao, ambiente: String(lj.amb.id), regras: lj.regras, avisos: lj.avisos, balanco: !!lj.balanco, escadas: arr(lj.escadas) });
        if (!g) return;
        lajes.push({ id: c.id, marca: c.marca, amb: lj.amb.nome || lj.amb.id, pav: pav.nome, tipo: lj.tipo, h: lj.hCm, lx: lj.lx, ly: lj.ly, nEng: lj.nEng,
          regra: lj.tipo === "macica" ? "d = (2,5 − 0,1·" + lj.nEng + ")·min(lx; 0,7 ly) + 2,5 cm → " + lj.hCm + " cm (mínimo " + (lj.balanco ? "10 cm em balanço" : (pav.ultimo ? "7 cm cobertura" : "8 cm piso")) + ", 6118 13.2.4.1)" : "treliçada: altura da NBR 14859-1 Tabela 1 ≥ lx/25 → " + lj.hCm + " cm (conferir na tabela do fabricante)",
          avisos: lj.avisos });
        lj.avisos.forEach(function (t) { avisos.push("Laje " + c.marca + " (" + (lj.amb.nome || lj.amb.id) + "): " + t + "."); });
      });
    });

    if (!pecas.length) return { ok: false, motivo: "Nada a lançar: " + (PU.ignoradas.length ? PU.ignoradas.length + " parede(s) fora (" + PU.ignoradas.map(function (x) { return x.motivo; }).filter(function (m, i, a) { return a.indexOf(m) === i; }).join("; ") + ")" : "o que existe já atende") + ".", avisos: avisos };

    /* --- o lote: apaga o pré-lançamento anterior (o que não foi mexido à mão) e cria o novo, sem o que o usuário mexeu ou apagou */
    var nPav = pavs.length, ops = [], criadas = [], puladasMao = [];
    gerenciadas.forEach(function (c) { ops.push({ op: "apagar", id: c.id }); });
    pecas.forEach(function (c) {
      var id = String(c.id);
      if (editado[id] || apagado[id]) { puladasMao.push(id); return; }
      var hCm = c.conc.papel === "laje" ? c.conc.h : null;
      ops.push({ op: "criar", id: c.id, caixa: BA.paraOp(c) });
      var S = servicosDe(c.conc.papel, c.conc.tipoLaje, hCm, nPav);
      if (S.length) ops.push({ op: "orcar", id: c.id, servicos: S });
      criadas.push(c);
    });
    /* ALVENARIA EM DOBRO (revisão 21/10/2026): o pilar e a viga embutidos ocupam a parede, mas a parede seguia com a área
       cheia — o bloco era orçado onde vai concreto (~20 % a mais de alvenaria numa casa). A união de geometria (a de
       maior prioridade, pilar/viga, CORTA a parede: js/bimarq.js descontarUnioes) tira o volume comum da parede. */
    criadas.forEach(function (c) { arr(uniaoDe[c.id]).forEach(function (wid) { ops.push({ op: "unirGeometria", a: String(c.id), b: String(wid) }); }); });
    var lote = { op: "lote", id: LOTE, origem: LOTE, pedido: "Pré-lançar estrutura de concreto (" + ROTULO + ")", ops: ops };

    /* --- premissas e pendências (o que a tela e o memorial mostram) */
    premissas.push("Concreto armado, pórtico (pilar + viga + laje) com vedação em alvenaria; CAA " + (opc.caa || crit("caaPadrao", "II")) + " e C" + fck + " ASSUMIDOS (" + fonteDe("fckPadraoMPa") + ") — o engenheiro escolhe.");
    premissas.push("Cobrimento nominal (para o detalhamento): viga/pilar " + crit("cobrimentoVigaPilarMm", 30) + " mm, laje " + crit("cobrimentoLajeMm", 25) + " mm (" + fonteDe("cobrimentoVigaPilarMm") + ").");
    premissas.push("Pilares nos cantos, encontros e pontas, dentro da parede (" + fonteDe("pilarNosEncontros") + "); vão máximo entre pilares " + virg(vaoMax) + " m (" + fonteDe("vaoEconomicoMaxM") + ").");
    premissas.push("Seção mínima do pilar: " + crit("pilarLadoMinimoCm", 19) + " cm (" + crit("pilarLadoEspecialCm", 14) + " cm com γn) e " + crit("pilarAreaMinimaCm2", 360) + " cm² (" + fonteDe("pilarAreaMinimaCm2") + "); área de influência: Ac = α·Ai·p·(n + 0,7)/σid, p = " + pCarga + " kN/m², σid = " + virg(sigId, 1) + " MPa (" + fonteDe("pilarAlfa") + ").");
    premissas.push("Viga: b = parede (mín. " + crit("vigaLarguraMinimaCm", 12) + " cm, " + fonteDe("vigaLarguraMinimaCm") + "), h = ℓ/10 (tramo extremo) ou ℓ/12 (intermediário), múltiplo de 5 cm, mín. " + cm(hMinViga) + " cm (" + fonteDe("vigaAlturaExtremo") + ").");
    premissas.push("Laje maciça até " + virg(crit("lajeMacicaVaoMaxM", 5.0)) + " m de vão (" + fonteDe("lajeMacicaVaoMaxM") + "); h pela fórmula de " + fonteDe("lajeAlturaFormula") + "; mínimos " + fonteDe("lajeMinPisoCm").split(" — ")[0] + " 13.2.4.1. Acima: treliçada (" + fonteDe("trelicadaAlturasCm") + ").");
    premissas.push("Orçamento: concreto, fôrma e aço por taxa de " + crit("taxaAcoKgM3", 100) + " kg/m³ (" + fonteDe("taxaAcoKgM3").split(" — ")[0] + ") — ESTIMATIVA; o quantitativo do projeto estrutural substitui.");
    arr(DD.pendencias).forEach(function (p) { pendencias.push(p.id + " — " + p.texto); });
    if (PU.usadas.some(function (w) { return w.nucleoAssumido; })) pendencias.push("Paredes sem tipo (camadas): a espessura TOTAL foi tomada como a da alvenaria — o pilar/viga embutido pode ficar 1 a 2 cm maior que o bloco; conferir.");
    if (!opc.sondagem) pendencias.push("A-17 — Sem sondagem SPT: fundação não pré-lançada (NBR 6122:2022 4.3).");
    PU.ignoradas.forEach(function (x) { premissas.push("Parede " + x.id + " fora: " + x.motivo + "."); });

    var res = { ok: true, lote: lote, ops: [lote], pecas: criadas, todas: pecas, pilares: pilares, vigas: vigas, lajes: lajes,
      pavimentos: pavs.map(function (p) { return { idx: p.idx, nome: p.nome, base: p.yb, topo: p.topo, nivelBase: p.nivelBase, nivelTopo: p.nivelTopo, paredes: p.paredes.length, linhas: p.linhas.length }; }),
      avisos: avisos, pendencias: pendencias, premissas: premissas, rotulo: ROTULO,
      manuais: { editados: MN.editados, apagados: MN.apagados, mantidos: puladasMao, pilaresAMao: [].concat.apply([], pavs.map(function (p) { return p.manuaisPil.map(function (c) { return c.id; }); })) },
      ignoradas: PU.ignoradas };
    res.resumo = resumo(criadas, nPav);
    return res;
  }

  /* ---------------------------------------------------------------- quantitativo preliminar (estimativa marcada) */
  function medidas(c) {
    var vol = num(c.volume, 0), forma = c.tipo === "laje" ? num(c.area, 0) : num(c.areaForma, num(c.area, 0));
    return { vol: vol, forma: forma, area: num(c.area, 0) };
  }
  function resumo(pecas, nPav) {
    var taxa = crit("taxaAcoKgM3", 100), R = { pilar: { n: 0, m3: 0, forma: 0, aco: 0 }, viga: { n: 0, m3: 0, forma: 0, aco: 0 }, laje: { n: 0, m3: 0, forma: 0, aco: 0, trelicadaM2: 0 }, m3: 0, forma: 0, aco: 0, trelicadaM2: 0, taxa: taxa };
    arr(pecas).forEach(function (c) {
      if (!ehPreLanc(c)) return;
      var g = R[c.conc.papel]; if (!g) return;
      var m = medidas(c); g.n++;
      if (c.conc.papel === "laje" && tipoLajeDe(c) === "trelicada") { g.trelicadaM2 += m.area; R.trelicadaM2 += m.area; return; }
      g.m3 += m.vol; g.forma += m.forma; g.aco += m.vol * taxa;
      R.m3 += m.vol; R.forma += m.forma; R.aco += m.vol * taxa;
    });
    ["pilar", "viga", "laje"].forEach(function (k) { R[k].m3 = r3(R[k].m3); R[k].forma = r3(R[k].forma); R[k].aco = Math.round(R[k].aco); if (R[k].trelicadaM2 != null) R[k].trelicadaM2 = r3(R[k].trelicadaM2); });
    R.m3 = r3(R.m3); R.forma = r3(R.forma); R.aco = Math.round(R.aco); R.trelicadaM2 = r3(R.trelicadaM2);
    return R;
  }
  function quantitativo(estado, opc) {
    opc = opc || {};
    var cx = arr(estado && estado.caixas), nossas = cx.filter(ehPreLanc), avisos = [];
    var nPav = 0; nossas.forEach(function (c) { nPav = Math.max(nPav, num(c.conc.pav, 0) + 1); });
    var R = resumo(nossas, nPav), itens = [];
    nossas.forEach(function (c) {
      var m = medidas(c), tr = c.conc.papel === "laje" && tipoLajeDe(c) === "trelicada";
      itens.push({ id: c.id, marca: c.marca || "", papel: c.conc.papel, pav: c.conc.pavNome, secao: c.conc.secao || (c.conc.h ? c.conc.h + " cm" : ""),
        concretoM3: tr ? null : r3(m.vol), formaM2: tr ? null : r3(m.forma), acoKg: tr ? null : Math.round(m.vol * R.taxa), trelicadaM2: tr ? r3(m.area) : null,
        servicos: arr(c.servicos).map(function (s) { return s.codigo; }), rotulo: ROTULO });
    });
    /* as peças de concreto lançadas à mão: ficam no orçamento DELAS (nada é somado aqui) */
    var manuaisL = cx.filter(function (c) { return ehConcreto(c) && ativa(c) && !ehPreLanc(c) && !(c.tipo === "laje" && num(c.cy, 0) + num(c.altura, 0) / 2 < 0.05); }).map(function (c) {
      return { id: c.id, tipo: c.tipo, comServico: arr(c.servicos).length > 0 };
    });
    if (manuaisL.length) avisos.push(manuaisL.length + " peça(s) de concreto lançada(s) à mão: ficam com o orçamento delas (não entram nesta estimativa, sem cobrança em dobro).");
    var semServ = nossas.filter(function (c) { return !arr(c.servicos).length; });
    if (semServ.length) avisos.push(semServ.length + " peça(s) pré-lançada(s) sem serviço (o usuário tirou): fora do orçamento.");
    avisos.push("ESTIMATIVA — " + ROTULO + ": aço pela taxa de " + R.taxa + " kg/m³ (" + fonteDe("taxaAcoKgM3").split(" — ")[0] + "); fôrma e concreto pela geometria pré-dimensionada. O quantitativo do projeto estrutural substitui tudo isto.");
    return { itens: itens, total: R, manuais: manuaisL, avisos: avisos, rotulo: ROTULO };
  }

  /* ---------------------------------------------------------------- troca do lote na lista (teste e ida e volta) */
  function opsSubstituir(ops, res) {
    var lote = res && res.ok ? res.lote : null; if (!lote) return arr(ops).slice();
    var out = [], pos = -1;
    arr(ops).forEach(function (o) { if (o && o.op === "lote" && o.id === LOTE) { if (pos < 0) pos = out.length; return; } out.push(o); });
    if (pos < 0) pos = out.length;
    out.splice(pos, 0, lote);
    return out;
  }

  /* ---------------------------------------------------------------- o que o IFC de saída levou (4) */
  function ifcConferir(texto, ids) {
    var t = String(texto || ""), linhas = {}, out = { colunas: 0, vigas: 0, lajes: 0, perfisRet: 0, comRotulo: 0, faltando: [], semRotulo: [], porId: {} };
    t.split(/\r?\n/).forEach(function (ln) { var m = /^#(\d+)\s*=\s*(\w+)\((.*)\);\s*$/.exec(ln); if (m) linhas[m[1]] = { ent: m[2], args: m[3] }; });
    Object.keys(linhas).forEach(function (k) {
      var L = linhas[k];
      if (L.ent === "IFCRECTANGLEPROFILEDEF") out.perfisRet++;
      if (L.ent !== "IFCCOLUMN" && L.ent !== "IFCBEAM" && L.ent !== "IFCSLAB") return;
      var m = /'ORC_edit_([^']+)'/.exec(L.args); if (!m) return;
      var id = m[1]; out.porId[id] = L.ent;
      if (/PR\\X2\\00C9\\X0\\-DIMENSIONAMENTO|PRÉ-DIMENSIONAMENTO/.test(L.args)) (out.tipoComRotulo = out.tipoComRotulo || {})[id] = 1;   /* o rótulo no ObjectType DA peça */
      if (L.ent === "IFCCOLUMN") out.colunas++; else if (L.ent === "IFCBEAM") out.vigas++; else out.lajes++;
    });
    out.comRotulo = (t.match(/PR\\X2\\00C9\\X0\\-DIMENSIONAMENTO|PRÉ-DIMENSIONAMENTO|PRE-DIMENSIONAMENTO/g) || []).length;
    arr(ids).forEach(function (id) { if (!out.porId[String(id)]) out.faltando.push(String(id)); else if (!(out.tipoComRotulo && out.tipoComRotulo[String(id)])) out.semRotulo.push(String(id)); });
    return out;
  }

  /* quantos pavimentos o modelo tem pela regra do lançador (o desnível no mesmo pavimento não conta): o auditor usa
     para escolher o concreto térreo × multipavimentos no Corrigir */
  function contarPavimentos(estado) { try { var PU = paredesUteis(estado, {}); return PU.usadas.length ? pavimentosDe(PU.usadas, null).length : 1; } catch (e) { return 1; } }

  var ConcLanc = {
    VERSAO: 1, LOTE: LOTE, ROTULO: ROTULO, contarPavimentos: contarPavimentos, estruturaModelada: estruturaModelada,
    gerar: gerar, quantitativo: quantitativo, opsSubstituir: opsSubstituir, ifcConferir: ifcConferir, manuais: manuais,
    ehPreLanc: ehPreLanc, ehConcreto: ehConcreto, tipoLajeDe: tipoLajeDe, servicosDe: servicosDe, secaoPelaParede: secaoPelaParede, fonteDe: fonteDe, crit: crit,
    /* geometria reaproveitada pelo auditor */
    _geo: { escadasDe: escadasDe, furoEscada: furoEscada, paredesUteis: paredesUteis, pavimentosDe: pavimentosDe, linhasDe: linhasDe, naLinha: naLinha, conflitoAbertura: conflitoAbertura, posLivre: posLivre, ponto: ponto, dentro: dentro, distBorda: distBorda, caixaDe: caixaDe, areaPoli: areaPoli }
  };
  global.ConcLanc = ConcLanc;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcLanc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
