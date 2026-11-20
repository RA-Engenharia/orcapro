/* =====================================================================
 * metalporticosacab.js — O ACABAMENTO DO PÓRTICO DA BIBLIOTECA (estrutura
 * desenhada): TELHAS da cobertura e do fechamento, LIGAÇÕES padrão e a COR
 * do aço — motor PURO, ES5, sem DOM, Node-testável. 20/11/2026.
 *
 * Pedido do Rogério (print do galpão "Pedido Gabriel", tesoura leve 20 × 30 m):
 * "a cobertura aparece como um plano liso; não aparecem telhas de verdade,
 * fechamento, ligações; o aço está cinza feio".
 *
 * DIAGNÓSTICO: o pórtico de alma cheia vai pelo gerador do GALPÃO
 * (js/metalgalpao.js), que já chama a vedação (js/acovedacao.js) e as ligações
 * (js/metalligacao.js). As tipologias da ESTRUTURA DESENHADA (treliças,
 * tesoura leve, coluna treliçada, ponte, mezanino…) saíam de
 * MetalPorticos.gerar só com as BARRAS — sem telha, sem fechamento, sem
 * placa de base nem clip, com o material cinza padrão do aço.
 *
 *   completar(t, p, g, novoId, op) → { ok, ops, pecas, vedacao, ligacoes,
 *                                      contagem, chapas, avisos, resumo }
 *     t, p  = a tipologia e os parâmetros NORMALIZADOS (MetalPorticos.normalizar)
 *     g     = o resultado de MetalPorticos.gerar (motor "livre")
 *     op    = { vedacao (true), ligacoes (true), telhaId, telhaFechamento,
 *               acab ({ tipo, ral|cor, brilho } — null = sem cor própria), corTelha ("#rrggbb" = pré-pintada; sem = zincado),
 *               beiral, beiralOitao }
 *
 * O QUE NÃO MUDA O CÁLCULO (conferido no teste tools/test-metal-porticos-acab.js):
 *   · a telha é peça tipo "vedacao" (o leitor da estrutura desenhada só lê
 *     tipo metal) — o peso dela já entra pelas ÁREAS de cobertura do gerar;
 *   · as ligações desenhadas aqui são só as que a estrutura JÁ supõe:
 *     placa de base (os banzos e as colunas de tapamento são rotulados na
 *     base), clip de terça (terça biapoiada → rotulada) e a chapa de apoio
 *     da barra redonda do contraventamento (só tração). NÃO entra gusset no
 *     nó da treliça: o leitor tornaria rotulada a ponta do banzo contínuo
 *     (cumeeira, joelho) e o cálculo mudaria — os nós da treliça de tubo
 *     são SOLDADOS (NBR 16239), declarado nas decisões da tipologia;
 *   · a cor é `caixa.acab` (js/metalacab.js), a mesma das Propriedades.
 *
 * A TELHA SOBRE A ESTRUTURA DE VERDADE: a face de baixo da telha fica acima
 * de TODO o aço desenhado (o ponto mais alto de cada peça, medido na normal
 * da água) e o fechamento por fora da face mais externa — sem peça
 * atravessando a telha e sem z-fighting (folga de 3 mm).
 * Teste: node tools/test-metal-porticos-acab.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function LG() { return dep("BimMetalLig", "./metalligacao.js"); }
  function VD() { return dep("AcoVedacao", "./acovedacao.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  /* a cor de partida do aço: pintura azul-aço acetinada (configurável: op.acab, ou peça a peça nas Propriedades) */
  var ACAB_PADRAO = { tipo: "pintura", cor: "#3e5b74", brilho: "acetinado", sistema: null };
  var ACAB_PARAFUSO = { tipo: "galvanizado" };
  /* tipologias da estrutura desenhada com cobertura em duas águas simétricas (a linha do telhado H + i·min(x, B − x)) */
  var DUAS_AGUAS = { "tesoura-leve": 1, "tesoura": 1, "trelica-paralelos": 1, "trelica-trapezoidal": 1, "coluna-trelicada": 1, "ponte": 1, "mezanino": 1, "misula": 1, "atirantado": 1 };
  var FOLGA = 0.025;   /* 25 mm: com 3 mm a ponta das peças (e as arestas desenhadas delas) furava a telha de longe, pela precisão do depth — pontinhos regulares no oitão (20/11) */

  /* os vértices da peça no mundo (os sólidos do js/metalpeca.js, nas duas pontas da extrusão) */
  function vertices(c) {
    var M = BM(), out = []; if (!M || !c || !c.metal) return out;
    var sd; try { sd = M.solidos(c); } catch (e) { return out; }
    sd.forEach(function (s) { arr(s.poli).forEach(function (q) { out.push(s.ponto(q[0], q[1], s.z0)); out.push(s.ponto(q[0], q[1], s.z1)); }); });
    return out;
  }

  function completar(t, p, g, novoId, op) {
    op = op || {};
    var avisos = [], ops = [], novas = [], ligs = [], cont = { placaBase: 0, clipTerca: 0, barraRedonda: 0, vedacao: 0 };
    if (!g || !g.ok || g.motor !== "livre" || !g.modelo) return { ok: false, motivo: "Sem o pórtico gerado (estrutura desenhada)." };
    if (typeof novoId !== "function") return { ok: false, motivo: "Sem gerador de id." };
    var Mod = g.modelo, nos = Mod.nos, gid = g.porticoId, porId = {};
    g.pecas.forEach(function (c) { porId[c.id] = c; });
    var cx = function (b) { return b ? porId[g.mapa[b.id]] : null; };

    /* ------------------------------------------------ COR DO AÇO (caixa.acab — a das Propriedades) */
    var acab = op.acab === null ? null : clone(op.acab || ACAB_PADRAO);
    if (acab) g.pecas.forEach(function (c) { if (!c.acab) c.acab = clone(acab); });

    /* ------------------------------------------------ LIGAÇÕES PADRÃO */
    if (op.ligacoes !== false) {
      var Lg = LG();
      if (!Lg) avisos.push("Ligações: o motor das ligações (js/metalligacao.js) não carregou — o pórtico saiu sem placas e clips.");
      else {
        var atual = {}; g.pecas.forEach(function (c) { atual[c.id] = c; });
        var cur = function (c) { return c && atual[c.id] ? atual[c.id] : c; };
        var aplicar = function (tipo, sel, par) {
          var pr = clone(par || {}); if (pr.terca2) pr.terca2 = cur(par.terca2); pr.lig = String(novoId());   /* cada ligação com o seu id (sem ele todas viravam UMA ligação "lig-<tipo>" no leitor do cálculo) */
          var r; try { r = Lg.aplicar(tipo, sel.map(cur), pr); } catch (eL) { r = { ok: false, motivo: String(eL && eL.message || eL) }; }
          ligs.push({ tipo: tipo, ok: !!r.ok, motivo: r.ok ? "" : r.motivo });
          if (!r.ok) return false;
          var lote = Lg.ops(r, novoId);
          lote.ops.forEach(function (o) {
            if (o.op === "criar" && o.caixa) {
              if (atual[o.id]) { o.caixa.id = o.id; atual[o.id] = clone(o.caixa); }
              else { o.caixa.id = o.id; o.caixa.portico = gid; if (acab) o.caixa.acab = clone(o.caixa.metal && o.caixa.metal.kind === "parafuso" ? ACAB_PARAFUSO : acab); novas.push(o.caixa); }
            }
            if (o.op === "metalFuros" && atual[o.id]) { var q = atual[o.id]; q.metalFuros = arr(q.metalFuros).filter(function (f) { return f.lig !== o.lig; }).concat(o.furos.map(function (f) { var h = clone(f); h.lig = o.lig; return h; })); }
            ops.push(o);
          });
          cont[tipo] = (cont[tipo] || 0) + 1;
          return true;
        };
        var cota = num(p.cota, 0);
        /* placa de base: toda barra vertical que nasce na cota da base (banzos da coluna, pilares, colunas de tapamento) */
        Mod.barras.forEach(function (b) {
          if (b.ferr !== "pilar") return;
          var a = nos[b.a], z = nos[b.b]; if (!a || !z || Math.abs(a[1] - cota) > 1e-6) return;
          aplicar("placaBase", [cx(b)], { nChumb: 4 });
        });
        /* clip de terça: em cada pórtico, cada linha de terça (as dos dois vãos vizinhos dividem o clip) sobre a viga/banzo de cima */
        var porK = {}, linhaDe = function (nm) { var m = /^t(\d+):(\d+)'?$/.exec(nm); return m ? { k: +m[1], j: +m[2] } : null; };
        var vigasK = {}, semClip = 0;
        Mod.barras.forEach(function (b) {
          if (b.grupo === "banzoSup" || b.grupo === "viga" || b.grupo === "misula") { var k = +String(b.a).split(":")[0]; (vigasK[k] = vigasK[k] || []).push(b); }
          if (b.grupo !== "terca") return;
          var la = linhaDe(b.a), lb = linhaDe(b.b); if (!la || !lb) return;
          (porK[la.k] = porK[la.k] || {})[la.j] = (porK[la.k] || {})[la.j] || {}; porK[la.k][la.j].depois = b;
          (porK[lb.k] = porK[lb.k] || {})[lb.j] = (porK[lb.k] || {})[lb.j] || {}; porK[lb.k][lb.j].antes = b;
        });
        Object.keys(porK).forEach(function (k) {
          Object.keys(porK[k]).forEach(function (j) {
            var par = porK[k][j], t1 = par.antes || par.depois, t2 = par.antes && par.depois ? par.depois : null, P = nos[par.depois ? par.depois.a : par.antes.b];
            /* a viga/banzo de cima mais perto do ponto da terça, no plano do pórtico */
            var vs = arr(vigasK[k]), melhor = null, dMin = 1e9, sM = 0, LM = 0;
            vs.forEach(function (v) {
              var A = nos[v.a], B = nos[v.b], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1, s = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2;
              if (s < -0.02 || s > 1.02) return;
              var ex = A[0] + s * dx - P[0], ey = A[1] + s * dy - P[1], d = Math.sqrt(ex * ex + ey * ey);
              if (d < dMin) { dMin = d; melhor = v; sM = s; LM = Math.sqrt(L2); }
            });
            if (!melhor || dMin > 0.5) return;
            /* na PONTA do banzo (beiral, cumeeira) o clip não entra: o leitor daria a rótula do clip à ponta do banzo contínuo e o
               cálculo mudaria (a terça ali apoia no nó da treliça — detalhe da serralheria, declarado) */
            if (sM * LM < 0.10 || (1 - sM) * LM < 0.10) { semClip++; return; }
            aplicar("clipTerca", [cx(t1), cx(melhor)], { terca2: t2 ? cx(t2) : null, parafuso: "M12", parafusos: 2 });
          });
        });
        /* contraventamento em BARRA REDONDA: chapa de apoio com furo, porca e contraporca nas duas pontas, na peça que passa pelo nó */
        var apoios = Mod.barras.filter(function (b) { return b.grupo !== "contravento" && b.grupo !== "corrente" && b.grupo !== "maoFrancesa" && b.ferr !== "diagonal"; });
        var apoioEm = function (P, excl) {
          var melhor = null, dMin = 0.03;
          apoios.forEach(function (b) {
            if (b === excl) return;
            var A = nos[b.a], B = nos[b.b], d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
            var s = ((P[0] - A[0]) * d[0] + (P[1] - A[1]) * d[1] + (P[2] - A[2]) * d[2]) / L2; if (s < -1e-6 || s > 1 + 1e-6) return;
            var e = [A[0] + s * d[0] - P[0], A[1] + s * d[1] - P[1], A[2] + s * d[2] - P[2]], dd = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
            if (dd < dMin) { dMin = dd; melhor = b; }
          });
          return melhor;
        };
        Mod.barras.forEach(function (b) {
          if (b.grupo !== "contravento") return;
          var c = cx(b); if (!c || !c.metal || !c.metal.perfil || c.metal.perfil.forma !== "circ") return;
          /* uma ligação por barra (a macro põe a chapa nas duas pontas, na peça de apoio da ponta de baixo) */
          var Pa = nos[b.a], Pb = nos[b.b], ap = apoioEm(Pa[1] <= Pb[1] ? Pa : Pb) || apoioEm(Pa[1] <= Pb[1] ? Pb : Pa);
          if (ap) aplicar("barraRedonda", [c, cx(ap)], { ajustar: false });   /* a barra fica do nó ao nó (o comprimento do cálculo) */
        });
        if (semClip) avisos.push("Clip de terça: " + semClip + " terça(s) na ponta do banzo (beiral/cumeeira) sem clip — o apoio no nó da treliça é detalhe da serralheria (um clip ali mudaria a ponta contínua do banzo no cálculo).");
        var falhas = ligs.filter(function (l) { return !l.ok; });
        if (falhas.length) avisos.push("Ligações: " + falhas.length + " não couberam (" + falhas.slice(0, 3).map(function (l) { return l.tipo + ": " + l.motivo; }).join("; ") + (falhas.length > 3 ? "…" : "") + ") — detalhe à mão.");
        g.pecas.forEach(function (c, i) { if (atual[c.id] !== c) g.pecas[i] = atual[c.id]; });
      }
    }

    /* ------------------------------------------------ TELHAS (cobertura + fechamento) */
    var ved = null, chapas = null;
    if (op.vedacao !== false) {
      var V = VD();
      if (!V) avisos.push("Vedação: o motor das telhas (js/acovedacao.js) não carregou — o pórtico saiu sem telhas.");
      else if (!DUAS_AGUAS[t]) avisos.push("Vedação: a tipologia " + t + " (telhado múltiplo/geminado) ainda não desenha as telhas — lance pelo Telhado.");
      else {
        var B = num(p.vao, 0), H = num(p.peDireito, 0), i = num(p.inclinacao, 0) / 100, th = Math.atan(i), co = Math.cos(th);
        var X0 = num(p.x0, 0), Z0 = num(p.z0, 0), B0 = num(p.cota, 0), Lt = (num(p.nPorticos, 2) - 1) * num(p.espacamento, 6);
        var yLin = function (xl) { return B0 + H + i * Math.min(xl, B - xl); };
        var dT = 0, xmin = 1e9, xmax = -1e9, zmin = 1e9, zmax = -1e9;
        g.pecas.concat(novas).forEach(function (c) {
          vertices(c).forEach(function (P) {
            var xl = P[0] - X0;
            if (xl > -1 && xl < B + 1) { var h = (P[1] - yLin(xl)) * co; if (h > dT) dT = h; }
            if (P[0] < xmin) xmin = P[0]; if (P[0] > xmax) xmax = P[0]; if (P[2] < zmin) zmin = P[2]; if (P[2] > zmax) zmax = P[2];
          });
        });
        var fech = p.fechamento === "fechado", tF = op.telhaFechamento || op.telhaId || null, faces = {};
        ["esquerda", "direita", "frente", "fundo"].forEach(function (k) { faces[k] = fech ? { tipo: "telha", telhaId: tF || "" } : { tipo: "aberto" }; });
        ved = V.galpao({ vao: B, comprimento: Lt, peDireito: H, inclinacao: num(p.inclinacao, 0), aguas: 2, base: B0, x0: X0, z0: Z0,
          apoio: { telha: dT + FOLGA, lateral: { esquerda: Math.max(0, X0 - xmin) + FOLGA, direita: Math.max(0, xmax - X0 - B) + FOLGA }, oitao: { frente: Math.max(0, Z0 - zmin) + FOLGA, fundo: Math.max(0, zmax - Z0 - Lt) + FOLGA } },
          cobertura: { telhaId: op.telhaId || "" }, faces: faces, beiral: op.beiral, beiralOitao: op.beiralOitao, calha: false });
        if (!ved.ok) avisos.push("Vedação: " + ved.motivo);
        else {
          ved.pecas.forEach(function (pv) {
            var c = V.caixa(pv); if (c.erro) { avisos.push("Vedação (" + pv.nome + "): " + c.erro); return; }
            c.id = String(novoId()); c.portico = gid; if (op.corTelha && c.vedacao && c.vedacao.material === "telha") c.vedacao.cor = String(op.corTelha); novas.push(c); ops.push({ op: "criar", id: c.id, caixa: c }); cont.vedacao++;
          });
          ved.avisos.forEach(function (a) { avisos.push("Vedação: " + a); });
          /* a PAGINAÇÃO das chapas: número de telhas pela largura útil do catálogo, comprimento de cada uma */
          chapas = { cobertura: [], fechamento: [] };
          var tc = ved.telhas && ved.telhas.cobertura;
          ved.pecas.forEach(function (pv) {
            if (pv.papel === "Telha de cobertura" && pv.nPecas) chapas.cobertura.push({ agua: pv.chave, n: pv.nPecas, comprimento: pv.comprimentoPeca, telha: tc && tc.nome });
            if (pv.papel === "Telha de fechamento" && pv.telha && pv.telha.larguraUtil > 0 && pv.chapa) {
              var us = arr(pv.chapa.contorno).map(function (q) { return Array.isArray(q) ? q[0] : q.u; }), vs = arr(pv.chapa.contorno).map(function (q) { return Array.isArray(q) ? q[1] : q.v; });
              var larg = Math.max.apply(null, us) - Math.min.apply(null, us), alt = Math.max.apply(null, vs) - Math.min.apply(null, vs);
              chapas.fechamento.push({ face: pv.face, n: Math.ceil(larg / pv.telha.larguraUtil - 1e-6), comprimento: Math.round(alt * 1000) / 1000, telha: pv.telha.nome });
            }
          });
        }
      }
    }
    var q = ved && ved.ok ? ved.quantidades : null, nCob = chapas ? chapas.cobertura.reduce(function (s, x) { return s + x.n; }, 0) : 0, nFech = chapas ? chapas.fechamento.reduce(function (s, x) { return s + x.n; }, 0) : 0;
    var nLig = ligs.filter(function (l) { return l.ok; }).length;
    var resumo = (nLig ? nLig + " ligações (" + cont.placaBase + " placas de base, " + cont.clipTerca + " clips de terça, " + cont.barraRedonda + " contraventos em barra redonda)" : "") +
      (q ? (nLig ? "; " : "") + "telhas: " + nCob + " na cobertura" + (nFech ? ", " + nFech + " no fechamento" : "") : "");
    return { ok: true, ops: ops, pecas: novas, vedacao: q, chapas: chapas, ligacoes: ligs, contagem: cont, avisos: avisos, resumo: resumo };
  }

  var MetalPorticosAcab = { completar: completar, vertices: vertices, ACAB_PADRAO: ACAB_PADRAO, DUAS_AGUAS: DUAS_AGUAS };
  global.MetalPorticosAcab = MetalPorticosAcab;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalPorticosAcab;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
