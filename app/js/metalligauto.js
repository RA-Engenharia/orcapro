/* =====================================================================
 * metalligauto.js — METÁLICA: LIGAÇÃO AO LANÇAR A VIGA, VIGA EM BALANÇO e
 * LIGAÇÕES CONFIRMADAS PELO CÁLCULO (motor PURO, ES5, sem DOM, Node-testável).
 * 15/10/2026 — BACKLOG #43.
 *
 * Pedido do Rogério: "quando eu lançar uma viga sobre um pilar, ele já
 * reconhecer... se for viga em balanço (eu marquei que a outra ponta não tem
 * apoio), ele identifica a melhor solução — mão-francesa ou algum reforço — e
 * dá três opções ou mostra as melhores. E para TODAS as vigas: toda vez que eu
 * lançar, ele já coloca os elementos de travamento, de ligação, parafuso,
 * tudo, de acordo para sustentar o peso próprio. Depois, ao rodar o memorial
 * de cálculo, se precisar alterar a ligação, ele já altera ou dá a sugestão."
 *
 * O QUE MORA AQUI (a tela é o js/metalligautoui.js; o lançamento é o
 * js/metalcriarui.js; o pós-cálculo entra no js/metalcalclivreui.js)
 *   pontas(caixas, viga) ...... o que encosta em cada ponta da LINHA da viga:
 *                               pilar de aço vertical (a ponta dentro da seção
 *                               dele, na planta), outra viga (a ponta no eixo
 *                               dela) ou nada ("livre"); a ponta marcada
 *                               "Livre (balanço)" (metal.cria.livre) é livre;
 *   aoLancar(caixas, viga, o) . as ops de UM lote: a viga (a linha da ponta no
 *                               pilar vai para o EIXO do pilar e o sólido para
 *                               na face + folga — o mesmo das vigas entre
 *                               pilares) e, em cada ponta apoiada, a ligação
 *                               PADRÃO pela regra mesa × alma e pelo meio da
 *                               configuração ("parafusada" | "soldada" | "nao"),
 *                               escolhida pela sugestão que já existe
 *                               (js/acoligsugere.js) com o PRÉ-DIMENSIONAMENTO
 *                               PELO PESO PRÓPRIO (a reação de cálculo do PP da
 *                               viga biapoiada) — só para os parafusos e a
 *                               chapa de partida. A ligação fica no estado
 *                               "A CONFIRMAR NO CÁLCULO" (ligInfo.aConfirmar,
 *                               ok = false) — NUNCA aprovada;
 *   balanco(caixas, id, o) .... a viga com uma ponta no pilar e a outra livre:
 *                               3 soluções RANQUEADAS — (a) ENGASTE no pilar
 *                               (chapa de extremidade estendida 4E/4ES/8ES,
 *                               ajustada ou soldada, da biblioteca), (b)
 *                               MÃO-FRANCESA a 45° (precisa de pilar abaixo; o
 *                               ponto de encontro sai de uma otimização simples),
 *                               (c) TIRANTE para cima (se o pilar passa acima da
 *                               viga) ou CONSOLO (mísula sob a viga). Cada uma
 *                               com o custo relativo (massa de aço × fabricação),
 *                               o aproveitamento pelo peso próprio + a carga de
 *                               serviço declarada e o que precisa;
 *   aplicarBalanco(...) ....... a solução escolhida → as ops (um lote): tira a
 *                               ligação rotulada do pilar, marca a ponta livre,
 *                               desenha a solução — tudo A CONFIRMAR NO CÁLCULO;
 *   balancosCriticos(caixas) .. balanço com ligação ROTULADA no pilar e sem
 *                               mão-francesa/tirante = CRÍTICO (mecanismo);
 *   aposCalculo(r, caixas, o) . depois do cálculo: cada ligação "a confirmar" é
 *                               verificada com os esforços da análise (todas as
 *                               combinações ELU que o cálculo gerou): o arranjo
 *                               DESENHADO passa → CONFIRMADA; não passa → a
 *                               próxima espessura/tipologia que passa (modo
 *                               "ajustar": troca no modelo, um lote; modo
 *                               "sugerir": só lista); nada passa → CRÍTICO com o
 *                               motivo. E as sugestões de TRAVAMENTO (FLT);
 *   travamentos(r) ............ a viga com a mesa comprimida destravada num
 *                               trecho em que a FLT reduz o momento resistente:
 *                               sugestão (escora / mão-francesa de travamento),
 *                               com o motivo — nunca muda o modelo sozinha.
 * NORMA: ABNT NBR 8800:2008, Tabela 1 (γg = 1,25 peso próprio de estruturas
 * metálicas — o "G-metalica" do js/acocargas.js; γq = 1,50 demais ações
 * variáveis), 5.4 e Anexo G (flexão/FLT, js/acodim8800.js), 5.3 (compressão),
 * 6.3.3.1 (barra redonda rosqueada: Ft,Rd = 0,75·Ab·fub/γa2). O pré-dimensiona-
 * mento NÃO aprova nada: quem aprova é o cálculo da estrutura desenhada.
 * Teste: node tools/test-metal-lig-auto.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function MC() { return dep("MetalCriar", "./metalcriar.js"); }
  function MVP() { return dep("MetalVigasPilares", "./metalvigaspilares.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Mod() { return dep("AcoModelo", "./acomodelo.js"); }
  function D88() { return dep("AcoDim8800", "./acodim8800.js"); }
  function Sug() { return dep("AcoLigSugere", "./acoligsugere.js"); }
  function Tip() { return dep("AcoLigTipos", "./acoligtipos.js"); }
  function C2() { return dep("AcoLigCalc2", "./acoligcalc2.js"); }
  function LSU() { return dep("MetalLigSugUI", "./metalligsugui.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function hor(v) { return [v[0], 0, v[2]]; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 1 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function pct(r) { return br(num(r, 0) * 100, 0) + " %"; }

  /* ---------------------------------------------------------------- constantes (cada uma com a fonte) */
  var GAMA_G = 1.25;          /* NBR 8800:2008, Tabela 1 — peso próprio de estruturas metálicas (js/acocargas.js "G-metalica") */
  var GAMA_Q = 1.50;          /* NBR 8800:2008, Tabela 1 — demais ações variáveis (uso e ocupação) */
  var ACRESC = 0.05;          /* acréscimo do peso das ligações: o mesmo padrão do cálculo da estrutura desenhada (acrescimoLigacoes) */
  var G_KN = 9.80665e-3;      /* kg → kN */
  var GA1 = 1.10, GA2 = 1.35; /* NBR 8800:2008, Tabela 3 */
  var FOLGA = 0.0127;         /* a folga de fabricação até a face do apoio (js/metalvigaspilares.js FOLGA) */
  var ANG_MF = 45;            /* mão-francesa a ~45° (pedido) */
  var DIAG_MF = ["HSS101.6X101.6X6.4", "HSS127X127X6.4", "HSS152.4X152.4X6.4"];   /* tubos quadrados do catálogo, do mais leve */
  var DIAM_TIRANTE = [12.5, 16, 19.05, 22.2, 25.4, 31.75];                          /* mm — barras redondas comerciais */
  var FAB_PESO = 0.25;        /* índice de fabricação: cada degrau (1 simples → 3 trabalhosa) soma 25 % ao peso (DECISÃO do sistema, declarada) */
  var RIGIDAS_ENGASTE = ["chapa-ext-estendida", "chapa-ext-estendida-enrij", "chapa-ext-estendida-4es", "chapa-ext-estendida-8", "chapa-ext-ajustada", "chapa-ext-ajustada-enrij", "soldada-direta"];
  var PADRAO = { aoLancar: "parafusada", aposCalculo: "ajustar" };
  var MEIOS = { parafusada: "parafusada", soldada: "soldada", nao: "não colocar" };
  var TXT_AC = "A CONFIRMAR NO CÁLCULO";

  function cfgOk(c) {
    c = c || {}; var o = { aoLancar: PADRAO.aoLancar, aposCalculo: PADRAO.aposCalculo };
    if (MEIOS[c.aoLancar]) o.aoLancar = c.aoLancar;
    if (c.aposCalculo === "sugerir" || c.aposCalculo === "ajustar") o.aposCalculo = c.aposCalculo;
    return o;
  }

  /* ================================================================ PEÇAS */
  function ehBarra(c) { return !!(c && c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && !c.metal.lig); }
  function linha(c) { var M = MC(); try { return M ? M.linhaAtual(c) : null; } catch (e) { return null; } }
  function horizontal(c) { var li = linha(c); if (!li) return false; var d = unit(sub(li.b, li.a)); return !!d && Math.abs(d[1]) < 0.2; }
  function secaoM(c) { var B = BM(); try { return (B && B.secao(c.metal.perfil)) || {}; } catch (e) { return {}; } }
  function catDe(c) { return c && c.metal && c.metal.perfil ? c.metal.perfil.cat || null : null; }
  function regDe(c) { var C = Cat(), k = catDe(c); return k && C && C.obter ? C.obter(k) : null; }
  function secCalc(nome) { var Mo = Mod(); var s = nome && Mo ? Mo.secaoDe(nome) : null; return s && s.mm ? s : null; }
  function acoDe(id) { var M = Mat(); return (M && M.aco(id)) || (M && M.aco("ASTM A572 Gr.50")) || { id: "ASTM A572 Gr.50", fy: 345, fu: 450 }; }
  function CONST() { var M = Mat(); return M && M.CONST ? M.CONST : { E: 200000, G: 77000 }; }
  function porIdDe(caixas) { var o = {}; arr(caixas).forEach(function (c) { if (c && c.id != null) o[String(c.id)] = c; }); return o; }
  function papelProp(p) { return /m[aã]o.?francesa|tirante|pendural|contravent|diagonal/i.test(String(p || "")); }

  /* ================================================================ AS PONTAS DA LINHA */
  function pontas(caixas, c) {
    var li = linha(c), V0 = MVP(), id = String(c.id), out = {};
    if (!li) return { a: { tipo: "livre" }, b: { tipo: "livre" } };
    var pils = V0 ? V0.pilares(caixas) : [], ds = secaoM(c), dV = num(ds.alt, 0.25);
    var outras = arr(caixas).filter(function (x) { return ehBarra(x) && String(x.id) !== id && horizontal(x); });
    var X = unit(sub(li.b, li.a)) || [1, 0, 0];
    ["a", "b"].forEach(function (k) {
      var P = li[k];
      if (li.livre && li.livre[k]) { out[k] = { tipo: "livre", marcada: true, P: P }; return; }
      var best = null, dm = Infinity;
      pils.forEach(function (Q) {
        if (Q.id === id) return;
        var d = Math.sqrt(Math.pow(P[0] - Q.x, 2) + Math.pow(P[2] - Q.z, 2));
        if (d > Q.dim.h / 2 + 0.03 || P[1] < Q.y0 - 0.05 || P[1] > Q.y1 + dV + 0.05) return;
        if (d < dm) { dm = d; best = Q; }
      });
      if (best) {
        /* a viga que APOIA no topo do pilar (a mesa de baixo em cima dele) não é a ligação na face */
        var baixo = P[1] - dV, topo = baixo >= best.y1 - 0.005;
        out[k] = { tipo: "pilar", id: best.id, P: P, pilar: best, topo: topo };
        return;
      }
      var bv = null, dv = Infinity;
      outras.forEach(function (o) {
        var l2 = linha(o); if (!l2) return;
        var D = sub(l2.b, l2.a), L2 = len(D); if (!(L2 > 0.05)) return;
        var U = mul(D, 1 / L2); if (Math.abs(dot(U, X)) > 0.996) return;   /* colinear = emenda: fica com a Ligação inteligente */
        var w = sub(P, l2.a), t = dot(hor(w), hor(U)) / Math.max(dot(hor(U), hor(U)), 1e-9), Pp = add(l2.a, mul(U, t));
        var perp = len(hor(sub(P, Pp))), h2 = num(secaoM(o).larg, 0.1);
        if (t < -0.05 * 1 || t > L2 + 0.05 || perp > h2 / 2 + 0.05 || Math.abs(P[1] - Pp[1]) > dV + 0.3) return;
        if (perp < dv) { dv = perp; bv = { o: o, Pp: Pp, U: U }; }
      });
      if (bv) { out[k] = { tipo: "viga", id: String(bv.o.id), P: P, Pp: bv.Pp, U: bv.U }; return; }
      out[k] = { tipo: "livre", P: P };
    });
    return out;
  }

  /* a LINHA da ponta no pilar vai para o EIXO do pilar (o nó do cálculo, os vínculos) e o SÓLIDO para na face + folga;
     na viga principal, no eixo dela, parada na alma + folga (o mesmo recuo das vigas entre pilares) */
  function ajustarLinha(c, pts, por) {
    var M = MC(), V0 = MVP(), li = linha(c); if (!M || !li || !c.metal.cria) return null;
    var a = li.a.slice(), b = li.b.slice(), rec = { a: li.recuo ? num(li.recuo.a, 0) : 0, b: li.recuo ? num(li.recuo.b, 0) : 0 }, mudou = false;
    ["a", "b"].forEach(function (k) {
      var pt = pts[k], P = k === "a" ? a : b, outra = k === "a" ? b : a;
      if (pt.tipo === "pilar" && !pt.topo && V0) {
        var Q = pt.pilar, alvo = [Q.x, P[1], Q.z], dir = unit(hor(sub(outra, alvo))); if (!dir) return;
        var f = V0.face(Q, dir, c.metal.perfil);
        if (!f || !isFinite(f.dist)) return;
        P[0] = alvo[0]; P[2] = alvo[2]; rec[k] = r6(f.dist + FOLGA); mudou = true; pt.face = f.face; if (f.aviso) pt.aviso = f.aviso;
      } else if (pt.tipo === "viga" && pt.Pp) {
        var o2 = pt.Pp, tw = twDe(por && por[pt.id]);
        P[0] = o2[0]; P[2] = o2[2]; rec[k] = r6(tw / 2 + FOLGA); mudou = true;
      }
    });
    if (!mudou) return null;
    var cr = c.metal.cria, m = c.metal;
    var nv = M.barra(a, b, { ferr: cr.ferr || "viga", perfil: m.perfil, giro: cr.giro, just: cr.just, lado: cr.lado, espelhar: cr.espelhar, aco: m.aco, nivel: cr.nivel, papel: m.papel, ifc: c.ifc,
      recuo: rec, vp: cr.vp, livre: cr.livre, servico: cr.servico, nome: m.nome });
    if (!nv || nv.erro) return null;
    nv.id = c.id;
    return nv;
  }
  /* a espessura da alma da viga principal (m): do catálogo, ou da seção paramétrica; sem nenhuma, 6 mm (o recuo só afasta a ponta) */
  function twDe(o) { var reg = o ? regDe(o) : null; if (reg && num(reg.tw, 0) > 0) return reg.tw / 1000; var p = o && o.metal && o.metal.perfil; return p && num(p.tw, 0) > 0 ? num(p.tw, 0) : 0.006; }

  /* ================================================================ PESO PRÓPRIO
   * a reação de CÁLCULO do peso próprio da viga biapoiada: R = γg·(1 + acréscimo)·w·L/2 */
  function pesoProprio(c) {
    var reg = regDe(c), li = linha(c), L = li ? len(sub(li.b, li.a)) : num(c.metal && c.metal.L, 1);
    var kgm = num(reg && reg.massa, NaN); if (!isFinite(kgm)) kgm = num(c.massa, 0) / Math.max(num(c.metal && c.metal.L, 1), 0.1);
    var w = kgm * G_KN, wd = GAMA_G * (1 + ACRESC) * w;
    return { kgm: kgm, w: w, wd: wd, L: L, R: wd * L / 2,
      texto: "peso próprio da viga " + (catDe(c) || "") + " (" + br(kgm, 1) + " kg/m → " + br(w, 3) + " kN/m), γg = 1,25 (NBR 8800, Tabela 1) + " + br(ACRESC * 100, 0) + " % das ligações, vão de " + br(L, 2) + " m biapoiado: reação de cálculo R = " + br(wd * L / 2, 2) + " kN" };
  }

  /* ================================================================ O ESTADO LOCAL ANDA JUNTO (como o replay) */
  function emular(por, ops) {
    arr(ops).forEach(function (q) {
      if (!q) return;
      if (q.op === "lote") { emular(por, q.ops); return; }
      if (q.op === "criar" && q.caixa) { var k = clone(q.caixa); k.id = String(q.id); por[String(q.id)] = k; }
      else if (q.op === "metalAjustar" && q.caixa && por[String(q.id)]) { var c0 = por[String(q.id)], nv = clone(q.caixa); Object.keys(c0).forEach(function (kk) { if (!(kk in nv) && kk !== "cx" && kk !== "cy" && kk !== "cz") nv[kk] = c0[kk]; }); nv.id = String(q.id); por[String(q.id)] = nv; }
      else if (q.op === "metalFuros" && por[String(q.id)]) { var c = clone(por[String(q.id)]); c.metalFuros = arr(c.metalFuros).filter(function (f) { return f.lig !== q.lig; }).concat(arr(q.furos).map(function (f) { var h = clone(f); h.lig = q.lig; return h; })); por[String(q.id)] = c; }
      else if (q.op === "metalApagarLig") {
        Object.keys(por).forEach(function (id) {
          var c2 = por[id]; if (!c2) return;
          if (c2.metal && c2.metal.lig === q.lig) { delete por[id]; return; }
          if (c2.metalFuros && c2.metalFuros.some(function (f) { return f.lig === q.lig; })) { var c3 = clone(c2); c3.metalFuros = c3.metalFuros.filter(function (f) { return f.lig !== q.lig; }); if (!c3.metalFuros.length) delete c3.metalFuros; por[id] = c3; }
        });
      } else if (q.op === "apagar") delete por[String(q.id)];
    });
  }

  /* ================================================================ UMA LIGAÇÃO PELA SUGESTÃO, COM OS ESFORÇOS DADOS
   * o = { esforcos, origem, preferir, meio, materiais, quer: [relações aceitas], so: [tipologias aceitas] } */
  function arranjoDe(r) {
    var d = (r && r.dimensoes) || {}, o = {};
    if (d.parafuso) o.pf = String(d.parafuso); if (num(d.t, 0) > 0) o.t = num(d.t, 0); if (num(d.n, 0) > 0) o.linhas = num(d.n, 0); else if (num(d.linhas, 0) > 0) o.linhas = num(d.linhas, 0);
    if (d.cat) o.cat = String(d.cat);
    return o;
  }
  function ordenarSoldada(L0) {
    var p = { soldada: 0, mista: 1, parafusada: 2 };
    return L0.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) { return ((a.x.passa ? 0 : 10) + (p[a.x.meio] != null ? p[a.x.meio] : 3)) - ((b.x.passa ? 0 : 10) + (p[b.x.meio] != null ? p[b.x.meio] : 3)) || a.i - b.i; }).map(function (z) { return z.x; });
  }
  function sugerirCom(pecas, o) {
    var S = Sug(); if (!S) return { ok: false, motivo: "o motor da ligação inteligente (js/acoligsugere.js) não carregou" };
    var ctx = S.analisar(pecas, { resultado: o.resultado || null, preferir: o.preferir, fundacoes: o.fundacoes || [] });
    if (!ctx.ok) return { ok: false, motivo: ctx.motivo };
    if (o.quer && o.quer.indexOf(ctx.relacao) < 0) return { ok: false, motivo: "a sugestão leu o encontro como \"" + ctx.relacao + "\"" + (ctx.relacao === "viga-sobre-pilar" ? " (a viga apoia no topo do pilar: chapa de cabeça pela Ligação inteligente)" : ""), ctx: ctx };
    if (o.esforcos) { ctx.esforcos = o.esforcos; ctx.estimativa = true; ctx.origemEsforcos = o.origem || "pré-dimensionamento"; }
    var opS = { execucao: o.meio === "parafusada" ? "parafusada" : null, preferir: o.preferir, materiais: o.materiais || null };
    /* F3b (15/10/2026): a CONFIGURAÇÃO DAS LIGAÇÕES DA OBRA (js/acoligconfig.js) — o.configObra, ou a salva na tela da ligação
       inteligente; sem configuração salva nada muda */
    var CFo = dep("AcoLigConfig", "./acoligconfig.js"), UIc = global.MetalLigSugUI, cfgO = o.configObra !== undefined ? o.configObra : (UIc && UIc.configuracaoSalva ? UIc.configuracaoSalva() : null);
    if (CFo && cfgO) opS = CFo.opSugerir(cfgO, opS);
    var sg = S.sugerir(ctx, opS);
    var L0 = arr(sg.todasOpcoes);
    if (o.so) L0 = L0.filter(function (x) { return o.so.indexOf(x.tipologia) >= 0; });
    if (o.meio === "soldada") L0 = ordenarSoldada(L0);
    var esc = S.escolherLote({ todasOpcoes: L0, relacao: sg.relacao, fundacao: sg.fundacao });
    return { ok: !!esc.opcao, ctx: ctx, sg: sg, lista: L0, opcao: esc.opcao, motivo: esc.motivo, melhorQueNaoPassa: L0[0] || null };
  }
  /* a opção vira ops (o aplicar do "Ligar todos os nós") e a ligInfo ganha o estado */
  function desenhar(s, por, novoId, marca) {
    var U = LSU(); if (!U || !U.aplicarOpcao) return { ok: false, motivo: "a tela da ligação inteligente (js/metalligsugui.js) não carregou" };
    var a = U.aplicarOpcao(s.opcao, s.ctx, por, novoId);
    if (!a.ok) return { ok: false, motivo: a.motivo };
    a.lote.ops.forEach(function (q) {
      var li = q.caixa && q.caixa.ligInfo; if (!li) return;
      Object.keys(marca || {}).forEach(function (k) { if (marca[k] !== undefined) li[k] = clone(marca[k]); });
      li.forcar = arranjoDe(s.opcao.resultado);
      if (li.aConfirmar) { li.passaPreDim = !!li.ok; li.ok = false; li.estado = "a-confirmar"; }
    });
    emular(por, a.lote.ops);
    return { ok: true, ops: a.lote.ops, lig: a.lig, opcao: s.opcao };
  }
  function pesoOpcao(op) { return op && isFinite(num(op.peso, NaN)) ? num(op.peso, 0) : null; }
  function fabDe(tip) { var T = Tip(), t = T && T.obter(tip); return t ? num(t.fabricacao, 2) : 2; }

  /* ================================================================ AO LANÇAR A VIGA
   * c = a viga NOVA (a caixa do MetalCriar.barra, com id); o = { meio, novoId, materiais } → { ok, ops (UM lote), viga, pontas,
   * ligacoes, pendentes, avisos, balanco: null | { ponta, pilar, perguntar }, resumo } */
  function aoLancar(caixas, c, o) {
    o = o || {};
    var meio = MEIOS[o.meio] ? o.meio : PADRAO.aoLancar, seq = 0, base = Date.now().toString(36);
    var novoId = typeof o.novoId === "function" ? o.novoId : function () { return "mla-" + base + "-" + (seq++); };
    var id = String(c.id), por = porIdDe(caixas), res = { ok: true, ops: [], viga: id, pontas: {}, ligacoes: [], pendentes: [], avisos: [], balanco: null, meio: meio };
    var pts = pontas(caixas, c);
    var c2 = ajustarLinha(c, pts, por) || c;
    res.ops.push({ op: "criar", id: id, caixa: c2 }); por[id] = clone(c2); por[id].id = id;
    ["a", "b"].forEach(function (k) { var pt = pts[k]; res.pontas[k] = { tipo: pt.tipo, id: pt.id || null, face: pt.face || null, topo: !!pt.topo, marcada: !!pt.marcada }; if (pt.aviso) res.avisos.push(pt.aviso); });
    var pp = pesoProprio(c2), nLig = 0;
    if (meio !== "nao") ["a", "b"].forEach(function (k) {
      var pt = pts[k]; if (pt.tipo === "livre") return;
      var rot = (k === "a" ? "ponta inicial" : "ponta final") + " × " + (pt.tipo === "pilar" ? "pilar " : "viga ") + pt.id;
      if (pt.topo) { res.pendentes.push({ ponta: k, texto: rot + ": a viga APOIA no topo do pilar — chapa de cabeça pela Ligação inteligente (" + TXT_AC + ")." }); return; }
      var s = sugerirCom([por[id], por[pt.id]], { esforcos: [{ comb: "PP (pré-dimensionamento)", V: pp.R, M: 0, N: 0 }], origem: "PRÉ-DIMENSIONAMENTO PELO PESO PRÓPRIO — " + pp.texto, preferir: "flexivel", meio: meio, materiais: o.materiais, quer: ["viga-pilar", "viga-viga"] });
      if (!s.ok) { res.pendentes.push({ ponta: k, texto: rot + ": sem ligação automática — " + (s.motivo || "nenhuma tipologia com desenho") + " (" + TXT_AC + ")." }); return; }
      var txt = TXT_AC + ": pré-dimensionada só pelo peso próprio (R = " + br(pp.R, 2) + " kN) para escolher os parafusos e a chapa de partida — calcule a estrutura (Cálculo › Estrutura desenhada) para confirmar ou ajustar com os esforços da análise";
      var d = desenhar(s, por, novoId, { aConfirmar: txt, origem: "lancar-viga", preDim: { tipo: "peso-proprio", R: r6(pp.R), w: r6(pp.w), L: r6(pp.L), gamaG: GAMA_G, acrescimo: ACRESC }, meioLancar: meio });
      if (!d.ok) { res.pendentes.push({ ponta: k, texto: rot + ": " + d.motivo + " (" + TXT_AC + ")." }); return; }
      res.ops = res.ops.concat(d.ops); nLig++;
      res.ligacoes.push({ ponta: k, apoio: pt.id, tipoApoio: pt.tipo, relacao: s.ctx.relacao, face: s.ctx.face, tipologia: d.opcao.tipologia, nome: d.opcao.nome, resumo: (d.opcao.resultado || {}).resumo || "", lig: d.lig, aConfirmar: true, passaPreDim: !!d.opcao.passa, razaoPreDim: num((d.opcao.resultado || {}).razao, 0) });
    });
    var livres = ["a", "b"].filter(function (k) { return pts[k].tipo === "livre"; }), apoiadas = ["a", "b"].filter(function (k) { return pts[k].tipo !== "livre"; });
    if (livres.length === 1 && apoiadas.length === 1) {
      var kp = apoiadas[0];
      res.balanco = { ponta: livres[0], apoio: pts[kp].id, tipoApoio: pts[kp].tipo, marcada: !!pts[livres[0]].marcada, perguntar: !pts[livres[0]].marcada && pts[kp].tipo === "pilar" };
    } else if (livres.length === 2) res.avisos.push("As duas pontas da viga não encostam em nada: ela fica solta (o cálculo acusa) — encoste a viga num pilar ou noutra viga.");
    res.resumo = "Viga " + (catDe(c2) || "") + (nLig ? " com " + nLig + " ligação(ões) " + MEIOS[meio] + "(s) — " + TXT_AC + " (pré-dimensionadas pelo peso próprio)" : meio === "nao" ? " (sem ligação: \"Ligações ao lançar: não colocar\")" : " sem ligação automática") +
      (res.pendentes.length ? "; " + res.pendentes.length + " pendência(s)" : "") + (res.balanco ? "; a " + (res.balanco.ponta === "a" ? "ponta inicial" : "ponta final") + " não encosta em nada (balanço?)" : "") + ".";
    return res;
  }

  /* ================================================================ VIGA EM BALANÇO */
  function flexRd(nome, acoId, LbM, eixo) {
    var s = secCalc(nome), D = D88(), K = CONST(); if (!s || !D) return null;
    try { return D.flexao(s.mm, acoDe(acoId), K.E, K.G, Math.max(LbM, 0.05) * 1000, 1, eixo || "x").MRd; } catch (e) { return null; }
  }
  function cortRd(nome, acoId) { var s = secCalc(nome), D = D88(), K = CONST(); if (!s || !D) return null; try { return D.cortante(s.mm, acoDe(acoId), K.E, "x").VRd; } catch (e) { return null; } }
  function compRd(nome, acoId, Lm) { var s = secCalc(nome), D = D88(), K = CONST(); if (!s || !D) return null; try { return D.compressao(s.mm, acoDe(acoId), K.E, K.G, { Lx: Lm, Ly: Lm, Lz: Lm }, "contravento").NRd; } catch (e) { return null; } }
  function verif(nome, Sd, Rd, un, item) { var r = Rd > 0 ? Math.abs(Sd) / Rd : Infinity; return { nome: nome, Sd: Sd, Rd: Rd, unidade: un || "kN", razao: r, item: item || "" }; }
  /* a viga apoiada no pilar (rótula em x = 0) e num apoio em x (mão-francesa ou tirante), carga wd + Pd na ponta (x = L) */
  function apoioIntermediario(wd, Pd, L, x) {
    var Rx = (wd * L * L / 2 + Pd * L) / x, R0 = wd * L + Pd - Rx, c = L - x, Mneg = wd * c * c / 2 + Pd * c, Mpos = 0;
    if (R0 > 0) { var x0 = R0 / wd; Mpos = x0 < x ? R0 * R0 / (2 * wd) : R0 * x - wd * x * x / 2; }
    return { Rx: Rx, R0: R0, Mneg: Mneg, Mpos: Math.max(0, Mpos), c: c };
  }
  function solucaoBase(id, nome) { return { id: id, nome: nome, aplicavel: true, passa: false, aproveitamento: 0, verificacoes: [], precisa: [], naoVerificado: [], pecas: [], ligacoes: [], custo: { kg: 0, indice: 0, rel: null }, motivo: "" }; }
  function fecharSol(s, travavel) {
    s.aproveitamento = s.verificacoes.reduce(function (m, v) { return Math.max(m, isFinite(v.razao) ? v.razao : 99); }, 0);
    var semPilar = s.verificacoes.filter(function (v) { return !v.pilar; }), vp = s.verificacoes.filter(function (v) { return v.pilar; });
    var restoOk = s.aplicavel && semPilar.length > 0 && semPilar.every(function (v) { return v.razao <= 1 + 1e-9; }) && s.ligacoes.every(function (l) { return l.ok; });
    var pilarOk = vp.length > 0 && vp.every(function (v) { return v.razao <= 1 + 1e-9; });
    s.passa = restoOk && pilarOk;
    /* a conta conservadora do pilar reprova, mas o pilar recebe outras peças (pode estar travado): NÃO passa — "pilar a confirmar" */
    s.pilarAConfirmar = restoOk && !pilarOk && !!travavel;
    s.custo.kg = Math.round(s.pecas.concat(s.ligacoes).reduce(function (t, p) { return t + num(p.kg, 0); }, 0) * 10) / 10;
    s.custo.indice = Math.round(s.pecas.concat(s.ligacoes).reduce(function (t, p) { return t + num(p.kg, 0) * (1 + FAB_PESO * (num(p.fab, 1) - 1)); }, 0) * 10) / 10;
    var gv = s.verificacoes.slice().sort(function (a, b) { return b.razao - a.razao; })[0];
    s.governa = gv ? gv.nome : null;
    var lf = s.ligacoes.filter(function (l) { return !l.ok; })[0];
    if (!s.aplicavel) s.situacao = "não se aplica — " + s.motivo;
    else if (lf) s.situacao = "não passa — ligação " + lf.rotulo + ": " + (lf.motivo || "nenhuma tipologia passa");
    else if (s.pilarAConfirmar) s.situacao = "a viga e as ligações passam; PILAR A CONFIRMAR NO CÁLCULO — a conta conservadora do pilar (em balanço, Le = 2·H) dá " + pct((vp.filter(function (v) { return v.razao > 1; })[0] || {}).razao) + " e ele recebe outras peças que podem travá-lo — " + TXT_AC;
    else s.situacao = (s.passa ? "passa no pré-dimensionamento" : "não passa") + " (" + pct(s.aproveitamento) + (gv ? ", governa " + gv.nome : "") + ") — " + TXT_AC;
    return s;
  }
  function ligSol(rotulo, s, kgFallback) {
    if (!s || !s.ok) return { rotulo: rotulo, ok: false, motivo: (s && s.motivo) || "nenhuma tipologia com desenho passa", kg: num(kgFallback, 0), fab: 2 };
    return { rotulo: rotulo, ok: !!s.opcao.passa, tipologia: s.opcao.tipologia, nome: s.opcao.nome, resumo: (s.opcao.resultado || {}).resumo || "", razao: num((s.opcao.resultado || {}).razao, 0), kg: pesoOpcao(s.opcao) != null ? pesoOpcao(s.opcao) : num(kgFallback, 0), fab: fabDe(s.opcao.tipologia), _s: s };
  }

  function balanco(caixas, vigaId, o) {
    o = o || {};
    var por = porIdDe(caixas), c = por[String(vigaId)];
    if (!c || !ehBarra(c)) return { ok: false, motivo: "A peça " + vigaId + " não é uma viga de aço do modelo." };
    var li = linha(c), pts = pontas(caixas, c), cr = c.metal.cria || {};
    var k = o.ponta || (pts.a.tipo === "livre" && pts.b.tipo !== "livre" ? "a" : (pts.b.tipo === "livre" && pts.a.tipo !== "livre" ? "b" : null));
    if (!k) return { ok: false, motivo: "A viga não tem uma ponta livre e a outra apoiada: não é balanço." };
    var kp = k === "a" ? "b" : "a", ap = pts[kp];
    if (ap.tipo !== "pilar") return { ok: false, motivo: "A ponta apoiada não está num pilar de aço (" + ap.tipo + "): as soluções de balanço são para viga que sai do pilar." };
    var Q = ap.pilar, pil = por[Q.id], V0 = MVP();
    var Pe = [Q.x, li[kp][1], Q.z], dirB = unit(hor(sub(li[k], Pe))) || [1, 0, 0];
    var L = len(hor(sub(li[k], Pe)));
    var fc = V0 ? V0.face(Q, dirB, c.metal.perfil) : { dist: Q.dim.h / 2, face: "mesa" }, fd = num(fc.dist, Q.dim.h / 2);
    var sv = o.servico || cr.servico || {}, q = Math.max(0, num(sv.q, 0)), P = Math.max(0, num(sv.P, 0));
    var pp = pesoProprio(c), wd = pp.wd + GAMA_Q * q, Pd = GAMA_Q * P, Vd = wd * L + Pd, Md = wd * L * L / 2 + Pd * L;
    var cat = catDe(c), acoV = c.metal.aco, ds = secaoM(c), dV = num(ds.alt, 0.25);
    var mbV = BM().membro(c), yC = mbV.P0[1], yBot = yC - dV / 2, yTop = yC + dV / 2;
    var acoP = pil.metal ? pil.metal.aco : (pil.aco || "ASTM A572 Gr.50"), catP = pil.metal ? catDe(pil) : (pil.perfil && pil.perfil.cat), eixoP = fc.face === "alma" ? "y" : "x";
    var Hp = Q.y1 - Q.y0, MRdP = flexRd(catP, acoP, Hp, eixoP);
    /* O PILAR NA PRÉ-CHECAGEM (revisão da 1.2.147: "pilar livre de 8 m: pré 0,26 × cálculo 2,38" — antes só M/MRd, sem a
       compressão nem a flambagem): flexo-compressão com N = a cortante do balanço + o peso próprio do pilar, M do balanço
       amplificado por B2 = 1/(1 − N/Ne) e o pilar EM BALANÇO (Le = 2·H nos dois eixos — a favor; NBR 8800, 5.3, 5.4, 5.5.1.2).
       Pilar que recebe outras peças pode estar travado por elas: se a conta conservadora reprova, a opção fica "PILAR A
       CONFIRMAR NO CÁLCULO" — nunca "passa" sem o pilar. */
    var outrosP = arr(caixas).filter(function (x) {
      if (!ehBarra(x) || String(x.id) === String(c.id) || String(x.id) === String(Q.id) || String(x.metal.balanco || "") === String(c.id)) return false;
      var l2 = linha(x); if (!l2) return false;
      return [l2.a, l2.b].some(function (P) { return Math.sqrt(Math.pow(P[0] - Q.x, 2) + Math.pow(P[2] - Q.z, 2)) <= Q.dim.h / 2 + 0.05 && P[1] >= Q.y0 - 0.05 && P[1] <= Q.y1 + 0.5; });
    }).length;
    var regP = catP && Cat() && Cat().obter ? Cat().obter(catP) : null, kgmPil = num(regP && regP.massa, 0);
    function verifPilar(rot, Msd) {
      var s = secCalc(catP), D = D88(), K = CONST();
      if (!s || !D || !MRdP) return { nome: rot + " — pilar " + Q.id + " sem seção do catálogo: A CONFIRMAR NO CÁLCULO", Sd: 0, Rd: 0, unidade: "—", razao: Infinity, pilar: true, item: "NBR 8800, 5.5.1.2" };
      var Le = 2 * Hp, NRd = null; try { NRd = D.compressao(s.mm, acoDe(acoP), K.E, K.G, { Lx: Le, Ly: Le, Lz: Le }, "pilar").NRd; } catch (eC) { NRd = null; }
      var I = eixoP === "x" ? num(s.mm.Ix, 0) : num(s.mm.Iy, 0), Ne = I > 0 ? Math.PI * Math.PI * K.E * I / Math.pow(Le * 1000, 2) / 1000 : 0;
      var Nsd = Vd + GAMA_G * (1 + ACRESC) * kgmPil * G_KN * Hp, B2 = Ne > Nsd ? 1 / (1 - Nsd / Ne) : Infinity, M2 = Msd * B2;
      var rN = NRd > 0 ? Nsd / NRd : Infinity, rM = M2 / MRdP, r = rN >= 0.2 ? rN + 8 / 9 * rM : rN / 2 + rM;
      /* e a ESBELTEZ da barra comprimida (NBR 8800, 5.3.4: Le/r ≤ 200) — é ela que dava o 2,38 do cálculo no pilar livre de 8 m */
      var rmin = Math.min(num(s.mm.rx, Infinity), num(s.mm.ry, Infinity)), lam = rmin > 0 && isFinite(rmin) ? Le * 1000 / rmin : Infinity, rE = lam / 200;
      if (rE > r) r = rE;
      return { nome: rot + " — flexo-compressão e esbeltez do pilar " + Q.id + " (λ = Le/r = " + br(lam, 0) + " ≤ 200; N = " + br(Nsd, 1) + " kN, NRd = " + br(NRd, 1) + " kN com Le = 2·H = " + br(Le, 2) + " m; M = " + br(Msd, 1) + " kN·m × B2 = " + (isFinite(B2) ? br(B2, 2) : "∞") + "; MRd = " + br(MRdP, 1) + " kN·m — pilar em balanço, a favor)",
        Sd: r, Rd: 1, unidade: "—", razao: isFinite(r) ? r : Infinity, pilar: true, item: "NBR 8800, 5.3, 5.3.4, 5.4 e 5.5.1.2", lambda: lam, N: Nsd, NRd: NRd, M: Msd, B2: B2, Le: Le };
    }
    var cargas = { L: L, ppKgm: pp.kgm, w: pp.w, q: q, P: P, wd: wd, Pd: Pd, Vd: Vd, Md: Md, texto: "balanço de " + br(L, 2) + " m (do eixo do pilar à ponta); ELU: 1,25·(1 + " + br(ACRESC * 100, 0) + " %)·PP + 1,50·serviço = " + br(wd, 2) + " kN/m" + (Pd ? " + " + br(Pd, 1) + " kN na ponta" : "") + " → V = " + br(Vd, 1) + " kN, M = " + br(Md, 1) + " kN·m no pilar" + (!(q > 0) && !(P > 0) ? " — SEM carga de serviço declarada: só o peso próprio (declare a carga do balanço)" : "") };
    var meio = MEIOS[o.meio] && o.meio !== "nao" ? o.meio : "parafusada";
    var sols = [];

    /* (a) ENGASTE: ligação rígida no pilar */
    var A = solucaoBase("engaste", "Engaste no pilar (ligação rígida)");
    var MRd1 = flexRd(cat, acoV, L, "x"), VRd1 = cortRd(cat, acoV);
    A.verificacoes.push(verif("Viga à flexão no engaste (FLT com Lb = " + br(L, 2) + " m, Cb = 1 — como o cálculo trata o balanço)", Md, MRd1, "kN·m", "NBR 8800, 5.4 e Anexo G"));
    A.verificacoes.push(verif("Viga ao cortante no engaste", Vd, VRd1, "kN", "NBR 8800, 5.4.3"));
    A.verificacoes.push(verifPilar("Engaste (" + (eixoP === "x" ? "eixo de maior inércia" : "eixo de MENOR inércia — a viga chega na alma") + ", todo o momento no pilar)", Md));
    var sA = sugerirCom([c, pil], { esforcos: [{ comb: "balanço ELU", V: Vd, M: Md, N: 0 }], origem: "BALANÇO (pré-dimensionamento): " + cargas.texto, preferir: "rigida", meio: meio, materiais: o.materiais, quer: ["viga-pilar"], so: RIGIDAS_ENGASTE });
    A.ligacoes.push(ligSol("viga × pilar (rígida)", sA, 0));
    A.precisa.push("ligação de momento na " + fc.face + " do pilar " + Q.id + ": " + (sA.ok ? sA.opcao.nome + " — " + ((sA.opcao.resultado || {}).resumo || "") : "nenhuma da biblioteca (4E/4ES/8ES, ajustada" + (meio === "parafusada" ? "" : ", soldada") + ") passa" + (sA.melhorQueNaoPassa ? " — a melhor: " + sA.melhorQueNaoPassa.nome + " (" + pct((sA.melhorQueNaoPassa.resultado || {}).razao) + ")" : "")));
    A.precisa.push("a mesa e a alma do pilar conferidas pela tipologia (enrijecedores de continuidade quando a mesa/alma não resistem)");
    if (fc.face === "alma") A.naoVerificado.push("momento entrando pela ALMA do pilar (flexão fora do plano da alma): girar o pilar é o melhor; a verificação da alma fora do plano não é automática");
    if (sA.ok && Tip() && Tip().obter(sA.opcao.tipologia) && Tip().obter(sA.opcao.tipologia).familia === "semirrigida") A.naoVerificado.push("a " + sA.opcao.nome.toLowerCase() + " é SEMIRRÍGIDA (o pilar acaba no topo da viga: a estendida pediria o pilar prolongado): leva o momento, mas a rigidez à rotação não é calculada — o cálculo a trata como rígida; a rotação da ponta do balanço fica a confirmar");
    A.naoVerificado.push("flecha da ponta (ELS): conferida no cálculo da estrutura");
    sols.push(fecharSol(A, outrosP > 0));

    /* (b) MÃO-FRANCESA a 45° do pilar (abaixo da viga) até a viga */
    var B = solucaoBase("mao-francesa", "Mão-francesa (diagonal a 45° do pilar à viga)");
    /* a LINHA da mão-francesa (o que o cálculo lê) vai do EIXO do pilar à LINHA da viga (o topo, onde o cálculo põe a viga), a 45°;
       o SÓLIDO recua até a face do pilar e até a mesa de baixo da viga (o mesmo recuo das vigas entre pilares). A 1ª versão
       desenhava da face à mesa de baixo e o cálculo via "diagonal com uma ponta no ar" (achado pela e2e, 15/10/2026) */
    var yLin = li[kp][1], hDisp = yLin - (Q.y0 + 0.20), th45 = ANG_MF * Math.PI / 180;
    var fr = [0.35, 0.45, 0.55, 0.65, 0.75], melhorB = null;
    fr.forEach(function (f) {
      var x = f * L, rA = fd / Math.cos(th45), rB = Math.max(0, yLin - yBot) / Math.sin(th45), Lline = x / Math.cos(th45), xa = x;
      if (x - fd < 0.3 || x > hDisp + 1e-9 || Lline - rA - rB < 0.3) return;
      var st = apoioIntermediario(wd, Pd, L, x), th = th45, Nd = st.Rx / Math.sin(th), T = st.Rx / Math.tan(th), Ld = Lline;
      var vs = [], MRn = flexRd(cat, acoV, st.c, "x"), MRp = flexRd(cat, acoV, x, "x");
      vs.push(verif("Viga à flexão sobre a mão-francesa (trecho em balanço de " + br(st.c, 2) + " m, Lb = " + br(st.c, 2) + " m)", st.Mneg, MRn, "kN·m", "NBR 8800, 5.4 e Anexo G"));
      if (st.Mpos > 1e-6) vs.push(verif("Viga à flexão entre o pilar e a mão-francesa (Lb = " + br(x, 2) + " m)", st.Mpos, MRp, "kN·m", "NBR 8800, 5.4 e Anexo G"));
      vs.push(verif("Viga ao cortante na mão-francesa", Math.max(st.Rx - st.R0, wd * st.c + Pd, Math.abs(st.R0)), VRd1, "kN", "NBR 8800, 5.4.3"));
      var dg = null;
      DIAG_MF.forEach(function (nome) { if (dg) return; var NR = compRd(nome, "ASTM A572 Gr.50", Ld); if (NR && Nd <= NR) dg = { nome: nome, NRd: NR }; });
      if (!dg) { var NR0 = compRd(DIAG_MF[DIAG_MF.length - 1], "ASTM A572 Gr.50", Ld); dg = { nome: DIAG_MF[DIAG_MF.length - 1], NRd: NR0 || 0 }; }
      vs.push(verif("Mão-francesa " + dg.nome + " à compressão (L = " + br(Ld, 2) + " m, K = 1)", Nd, dg.NRd, "kN", "NBR 8800, 5.3"));
      vs.push(verifPilar("Binário da mão-francesa (T·h = " + br(T, 1) + " kN × " + br(x, 2) + " m — limite superior)", T * x));
      var ap0 = vs.reduce(function (m, v) { return Math.max(m, v.razao); }, 0);
      var regD = Cat() && Cat().obter ? Cat().obter(dg.nome) : null, kgD = num(regD && regD.massa, 20) * (Lline - rA - rB);
      var cand = { f: f, x: x, xa: xa, st: st, Nd: Nd, T: T, Ld: Ld, Lsol: Lline - rA - rB, rA: rA, rB: rB, dg: dg, vs: vs, ap: ap0, kg: kgD };
      if (!melhorB || (cand.ap <= 1 && !(melhorB.ap <= 1)) || ((cand.ap <= 1) === (melhorB.ap <= 1) && (cand.ap <= 1 ? cand.kg < melhorB.kg - 1e-6 || (Math.abs(cand.kg - melhorB.kg) < 1e-6 && cand.ap < melhorB.ap) : cand.ap < melhorB.ap))) melhorB = cand;
    });
    if (!melhorB) { B.aplicavel = false; B.motivo = hDisp < 0.5 ? "precisa de pilar ABAIXO da viga (o pilar " + Q.id + " passa só " + br(Math.max(0, yBot - Q.y0), 2) + " m abaixo dela)" : "o pilar abaixo da viga (" + br(hDisp, 2) + " m livres) não deixa a mão-francesa a 45° chegar a 35 % do balanço"; }
    else {
      var m0 = melhorB, th0 = ANG_MF * Math.PI / 180;
      B.verificacoes = m0.vs;
      var pPil = [Q.x, yLin - m0.x * Math.tan(th0), Q.z], pVig = add([Q.x, yLin, Q.z], mul(dirB, m0.x));
      B.geo = { de: pPil, ate: pVig, recuo: { a: r6(m0.rA), b: r6(m0.rB) }, perfil: m0.dg.nome, x: r6(m0.x), xa: r6(m0.xa), Ld: r6(m0.Ld), Lsol: r6(m0.Lsol), Nd: m0.Nd, T: m0.T, R0: m0.st.R0, Rx: m0.st.Rx };
      B.pecas.push({ rotulo: "mão-francesa " + m0.dg.nome + " × " + br(m0.Lsol, 2) + " m", kg: m0.kg, fab: 1 });
      var Mcr = MC(), dgc = Mcr ? Mcr.barra(pPil, pVig, { ferr: "diagonal", cat: m0.dg.nome, papel: "Mão-francesa", aco: "ASTM A572 Gr.50", nome: "Mão-francesa da viga " + c.id, recuo: B.geo.recuo }) : null;
      if (dgc && !dgc.erro) {
        dgc.id = "__mf-ensaio"; dgc.metal.balanco = String(c.id);
        var esfD = [{ comb: "balanço ELU", N: -m0.Nd, V: 0, M: 0 }];
        var sB1 = sugerirCom([dgc, c], { esforcos: esfD, origem: "BALANÇO — força na mão-francesa", meio: meio, materiais: o.materiais });
        var sB2 = sugerirCom([dgc, pil], { esforcos: esfD, origem: "BALANÇO — força na mão-francesa", meio: meio, materiais: o.materiais });
        B.ligacoes.push(ligSol("mão-francesa × viga", sB1, 6), ligSol("mão-francesa × pilar", sB2, 6));
      } else B.ligacoes.push({ rotulo: "mão-francesa", ok: false, motivo: (dgc && dgc.erro) || "não deu para desenhar a diagonal", kg: 0, fab: 2 });
      var sB0 = sugerirCom([c, pil], { esforcos: [{ comb: "balanço ELU", V: Math.abs(m0.st.R0), M: 0, N: m0.T }], origem: "BALANÇO — reação no pilar com a mão-francesa", preferir: "flexivel", meio: meio, materiais: o.materiais, quer: ["viga-pilar"] });
      B.ligacoes.push(ligSol("viga × pilar (flexível)", sB0, 3));
      B.precisa.push("diagonal " + m0.dg.nome + " de " + br(m0.Lsol, 2) + " m (de nó a nó " + br(m0.Ld, 2) + " m), do eixo do pilar " + br(m0.x, 2) + " m abaixo do topo da viga até a viga a " + br(m0.x, 2) + " m do eixo do pilar (" + br(m0.f * 100, 0) + " % do balanço — o ponto que dá o menor aproveitamento/peso entre 35 % e 75 %)");
      B.precisa.push("ligações nas duas pontas da diagonal (gusset) e a ligação flexível viga × pilar");
      B.naoVerificado.push("tração da viga entre o pilar e a mão-francesa (T = " + br(m0.T, 1) + " kN) na ligação viga × pilar: a ligação foi pré-dimensionada pela cortante; o cálculo da estrutura confere com a força axial");
      if (m0.st.R0 < 0) B.naoVerificado.push("a ponta do pilar fica com reação para CIMA (R = " + br(m0.st.R0, 1) + " kN): a ligação viga × pilar trabalha arrancando");
      B.naoVerificado.push("flecha da ponta (ELS): conferida no cálculo da estrutura");
    }
    sols.push(fecharSol(B, outrosP > 0));

    /* (c) TIRANTE para cima (se há estrutura acima: o pilar passa da viga) ou CONSOLO (mísula sob a viga) */
    var sobra = Q.y1 - yTop, Cc;
    if (sobra >= 0.6) {
      Cc = solucaoBase("tirante", "Tirante (barra redonda do pilar acima até a viga)");
      var ht = sobra - 0.15, melhorC = null;
      [0.6, 0.75, 0.9].forEach(function (f) {
        var x = f * L, xa = x - fd; if (xa < 0.3) return;
        var th = Math.atan2(ht, x); if (th < 20 * Math.PI / 180) return;   /* de nó a nó: do eixo do pilar à linha da viga */
        var st = apoioIntermediario(wd, Pd, L, x), T = st.Rx / Math.sin(th), Nc = st.Rx / Math.tan(th), Lt = Math.sqrt(ht * ht + x * x);
        var vs = [], MRn = flexRd(cat, acoV, st.c, "x"), MRp = flexRd(cat, acoV, x, "x"), NRv = compRd(cat, acoV, x);
        vs.push(verif("Viga à flexão sobre o tirante (trecho em balanço de " + br(st.c, 2) + " m)", st.Mneg, MRn, "kN·m", "NBR 8800, 5.4 e Anexo G"));
        var rN = NRv ? Nc / NRv : 9, rM = MRp && st.Mpos > 0 ? st.Mpos / MRp : 0, rI = rN >= 0.2 ? rN + 8 / 9 * rM : rN / 2 + rM;
        vs.push({ nome: "Viga à compressão + flexão entre o pilar e o tirante (Nc = " + br(Nc, 1) + " kN, L = " + br(x, 2) + " m)", Sd: rI, Rd: 1, unidade: "—", razao: rI, item: "NBR 8800, 5.3 e 5.5.1.2" });
        var A36 = acoDe("ASTM A36"), rod = null;
        DIAM_TIRANTE.forEach(function (dmm) { if (rod) return; var Ab = Math.PI * dmm * dmm / 4, FR = Math.min(Ab * A36.fy / GA1, 0.75 * Ab * A36.fu / GA2) / 1000; if (T <= FR) rod = { d: dmm, FRd: FR, Ab: Ab }; });
        if (!rod) { var dM = DIAM_TIRANTE[DIAM_TIRANTE.length - 1], AbM = Math.PI * dM * dM / 4; rod = { d: dM, FRd: Math.min(AbM * A36.fy / GA1, 0.75 * AbM * A36.fu / GA2) / 1000, Ab: AbM }; }
        vs.push(verif("Tirante Ø " + br(rod.d, 1) + " mm ASTM A36 à tração (mín(Ag·fy/γa1; 0,75·Ag·fu/γa2) na rosca)", T, rod.FRd, "kN", "NBR 8800, 5.2 e 6.3.3.1"));
        vs.push(verifPilar("Binário do tirante (Nc·h = " + br(Nc, 1) + " kN × " + br(ht, 2) + " m — limite superior)", Nc * ht));
        var ap0 = vs.reduce(function (m, v) { return Math.max(m, v.razao); }, 0), kg = 7850 * rod.Ab * 1e-6 * Lt;
        var cand = { f: f, x: x, xa: xa, th: th, st: st, T: T, Nc: Nc, Lt: Lt, rod: rod, vs: vs, ap: ap0, kg: kg };
        if (!melhorC || (cand.ap <= 1 && !(melhorC.ap <= 1)) || ((cand.ap <= 1) === (melhorC.ap <= 1) && cand.ap < melhorC.ap)) melhorC = cand;
      });
      if (!melhorC) { Cc.aplicavel = false; Cc.motivo = "o pilar passa só " + br(sobra, 2) + " m acima da viga: o tirante ficaria abaixo de 20° (força alta)"; }
      else {
        var m1 = melhorC;
        Cc.verificacoes = m1.vs;
        /* a LINHA do tirante: do EIXO do pilar à LINHA da viga (o topo); o sólido recua até a face do pilar */
        var pA1 = [Q.x, yLin + (yTop - yLin) + ht, Q.z], pB1 = add([Q.x, yLin, Q.z], mul(dirB, m1.x)), cT = Math.cos(Math.atan2(pA1[1] - pB1[1], m1.x));
        Cc.geo = { de: pA1, ate: pB1, recuo: { a: r6(fd / Math.max(cT, 0.2)), b: 0 }, d: m1.rod.d, x: r6(m1.x), T: m1.T, Nc: m1.Nc, R0: m1.st.R0 };
        Cc.pecas.push({ rotulo: "tirante Ø " + br(m1.rod.d, 1) + " mm × " + br(m1.Lt, 2) + " m", kg: m1.kg, fab: 1 });
        var Mcr2 = MC(), trc = Mcr2 ? Mcr2.barra(pA1, pB1, { ferr: "diagonal", perfil: { forma: "circ", d: m1.rod.d / 1000 }, papel: "Tirante", aco: "ASTM A36", nome: "Tirante da viga " + c.id, recuo: Cc.geo.recuo }) : null;
        if (trc && !trc.erro) {
          trc.id = "__tir-ensaio"; trc.metal.balanco = String(c.id);
          var esT = [{ comb: "balanço ELU", N: m1.T, V: 0, M: 0 }];
          Cc.ligacoes.push(ligSol("tirante × pilar", sugerirCom([trc, pil], { esforcos: esT, origem: "BALANÇO — força no tirante", meio: meio, materiais: o.materiais }), 4), ligSol("tirante × viga", sugerirCom([trc, c], { esforcos: esT, origem: "BALANÇO — força no tirante", meio: meio, materiais: o.materiais }), 4));
        } else Cc.ligacoes.push({ rotulo: "tirante", ok: false, motivo: (trc && trc.erro) || "não deu para desenhar o tirante", kg: 0, fab: 2 });
        Cc.ligacoes.push(ligSol("viga × pilar (flexível)", sugerirCom([c, pil], { esforcos: [{ comb: "balanço ELU", V: Math.abs(m1.st.R0), M: 0, N: -m1.Nc }], origem: "BALANÇO — reação no pilar com o tirante", preferir: "flexivel", meio: meio, materiais: o.materiais, quer: ["viga-pilar"] }), 3));
        Cc.precisa.push("tirante Ø " + br(m1.rod.d, 1) + " mm do pilar " + br(ht, 2) + " m acima da viga até a viga a " + br(m1.x, 2) + " m do eixo do pilar (" + br(m1.th * 180 / Math.PI, 0) + "°)");
        Cc.naoVerificado.push("compressão da viga na ligação viga × pilar (Nc = " + br(m1.Nc, 1) + " kN): conferida no cálculo da estrutura");
        Cc.naoVerificado.push("flecha da ponta (ELS): conferida no cálculo da estrutura");
      }
    } else {
      Cc = solucaoBase("consolo", "Consolo (mísula sob a viga, com chapa de extremidade no pilar)");
      Cc.verificacoes.push(verif("Viga à flexão no fim da mísula (a favor: o momento todo do engaste; FLT com Lb = " + br(L, 2) + " m)", Md, MRd1, "kN·m", "NBR 8800, 5.4 e Anexo G"));
      Cc.verificacoes.push(verif("Viga ao cortante", Vd, VRd1, "kN", "NBR 8800, 5.4.3"));
      Cc.verificacoes.push(verifPilar("Consolo (todo o momento no pilar)", Md));
      var sC = sugerirCom([c, pil], { esforcos: [{ comb: "balanço ELU", V: Vd, M: Md, N: 0 }], origem: "BALANÇO (pré-dimensionamento): " + cargas.texto, preferir: "rigida", meio: meio, materiais: o.materiais, quer: ["viga-pilar"], so: ["misula"] });
      Cc.ligacoes.push(ligSol("mísula + chapa de extremidade", sC, 0));
      Cc.precisa.push("sem estrutura acima da viga para um tirante: consolo (mísula soldada sob a viga, mais braço para os parafusos) — " + (sC.ok ? (sC.opcao.resultado || {}).resumo || sC.opcao.nome : "a mísula não passa: " + (sC.motivo || "")));
      Cc.naoVerificado.push("flecha da ponta (ELS): conferida no cálculo da estrutura");
    }
    sols.push(fecharSol(Cc, outrosP > 0));

    /* ranking: passa primeiro → custo (índice) → aproveitamento; o custo relativo é contra a mais barata que passa (ou a mais barata) */
    sols.sort(function (a, b) {
      var nv = function (s) { return s.passa ? 0 : s.pilarAConfirmar ? 1 : 2; };
      var d0 = (nv(a) - nv(b)) || ((a.aplicavel ? 0 : 1) - (b.aplicavel ? 0 : 1)); if (d0) return d0;
      return nv(a) < 2 ? (a.custo.indice - b.custo.indice) || (a.aproveitamento - b.aproveitamento) : (a.aproveitamento - b.aproveitamento) || (a.custo.indice - b.custo.indice);
    });
    var refC = sols.filter(function (s) { return s.passa && s.custo.indice > 0; }).map(function (s) { return s.custo.indice; });
    if (!refC.length) refC = sols.filter(function (s) { return s.aplicavel && s.custo.indice > 0; }).map(function (s) { return s.custo.indice; });
    var cMin = refC.length ? Math.min.apply(null, refC) : 0;
    sols.forEach(function (s, i) { s.rank = i + 1; s.custo.rel = cMin > 0 && s.aplicavel ? Math.round(s.custo.indice / cMin * 100) / 100 : null; });
    var melhor = sols.filter(function (s) { return s.passa; })[0] || sols.filter(function (s) { return s.pilarAConfirmar; })[0] || null;
    var out = { ok: true, viga: String(c.id), ponta: k, apoio: Q.id, face: fc.face, L: L, cargas: cargas, opcoes: sols, melhor: melhor ? melhor.id : null, critico: !melhor,
      criterio: "Ordem: passa no pré-dimensionamento (peso próprio + carga de serviço declarada, ELU) → custo (massa de aço × fabricação: cada degrau de fabricação soma " + br(FAB_PESO * 100, 0) + " % ao peso) → aproveitamento. Tudo fica " + TXT_AC + ".",
      pilarAConfirmar: !!(melhor && melhor.pilarAConfirmar),
      texto: melhor ? "Melhor: " + melhor.nome + (melhor.pilarAConfirmar ? " — " + melhor.situacao : " (" + pct(melhor.aproveitamento) + ", custo " + br(melhor.custo.indice, 1) + ").") : "CRÍTICO: nenhuma das soluções passa no balanço de " + br(L, 2) + " m — " + sols.map(function (s) { return s.nome + ": " + s.situacao; }).join("; ") + ". Troque o perfil da viga ou apoie a ponta." };
    return out;
  }

  /* ================================================================ APLICAR A SOLUÇÃO DO BALANÇO */
  function ligacoesEntre(por, ids) {
    var L0 = [];
    Object.keys(por).forEach(function (k) {
      var c = por[k], li = c && c.ligInfo; if (!li || !c.metal || !c.metal.lig) return;
      var pp = arr(li.pecas).map(String); if (ids.every(function (i) { return pp.indexOf(String(i)) >= 0; }) && L0.indexOf(c.metal.lig) < 0) L0.push(c.metal.lig);
    });
    return L0;
  }
  function aplicarBalanco(caixas, vigaId, solId, o) {
    o = o || {};
    var seq = 0, base = Date.now().toString(36), novoId = typeof o.novoId === "function" ? o.novoId : function () { return "mlb-" + base + "-" + (seq++); };
    var bal = balanco(caixas, vigaId, o); if (!bal.ok) return { ok: false, motivo: bal.motivo };
    var sol = bal.opcoes.filter(function (s) { return s.id === (solId || bal.melhor); })[0];
    if (!sol) return { ok: false, motivo: "Nenhuma solução que passa para aplicar: " + bal.texto, balanco: bal };
    if (!sol.aplicavel) return { ok: false, motivo: sol.nome + ": " + sol.motivo, balanco: bal };
    var por = porIdDe(caixas), id = String(vigaId), ops = [], meio = MEIOS[o.meio] && o.meio !== "nao" ? o.meio : "parafusada";
    /* 1. o que havia: a ligação viga × pilar e a solução anterior (mão-francesa/tirante desta viga e as ligações deles) */
    ligacoesEntre(por, [id, bal.apoio]).forEach(function (lg) { ops.push({ op: "metalApagarLig", lig: String(lg) }); });
    Object.keys(por).forEach(function (k) {
      var x = por[k]; if (!x || !x.metal || String(x.metal.balanco || "") !== id || x.metal.lig) return;
      ligacoesEntre(por, [k]).forEach(function (lg) { if (!ops.some(function (q) { return q.lig === lg; })) ops.push({ op: "metalApagarLig", lig: String(lg) }); });
      ops.push({ op: "apagar", id: k });
    });
    emular(por, ops);
    /* 2. a ponta livre marcada na receita (a carga de serviço declarada vai junto) */
    var c = clone(por[id]); c.metal.cria = c.metal.cria || {};
    c.metal.cria.livre = c.metal.cria.livre || {}; c.metal.cria.livre[bal.ponta] = true;
    var sv = o.servico || c.metal.cria.servico || {}; c.metal.cria.servico = { q: Math.max(0, num(sv.q, 0)), P: Math.max(0, num(sv.P, 0)) };
    c.metal.cria.balanco = { solucao: sol.id, em: new Date().toISOString() };
    var opV = { op: "metalAjustar", id: id, caixa: c }; ops.push(opV); emular(por, [opV]);
    var TX = TXT_AC + ": solução do balanço (" + sol.nome + ") pré-dimensionada pelo peso próprio + carga de serviço declarada — calcule a estrutura para confirmar";
    var marca = { aConfirmar: TX, origem: "balanco", balanco: { viga: id, solucao: sol.id }, meioLancar: meio };
    function lig(rot, pecas, ref) {
      var s0 = ref && ref._s; if (!s0 || !s0.ok) return { rotulo: rot, ok: false, motivo: (ref && ref.motivo) || "sem tipologia" };
      /* a opção refeita com as caixas de AGORA (o lote anda): a mesma escolha, o aplicar com o estado local */
      var s = sugerirCom(pecas.map(function (k) { return por[String(k)]; }), { esforcos: s0.ctx.esforcos, origem: s0.ctx.origemEsforcos, preferir: s0.ctx.preferir || (sol.id === "engaste" || sol.id === "consolo" ? "rigida" : (rot.indexOf("viga × pilar") === 0 ? "flexivel" : undefined)), meio: meio, materiais: o.materiais, so: [s0.opcao.tipologia, String(s0.opcao.tipologia).replace(/-enrij$/, "")] });
      if (!s.ok) return { rotulo: rot, ok: false, motivo: s.motivo };
      var d = desenhar(s, por, novoId, marca); if (!d.ok) return { rotulo: rot, ok: false, motivo: d.motivo };
      ops = ops.concat(d.ops); return { rotulo: rot, ok: true, tipologia: d.opcao.tipologia, lig: d.lig };
    }
    var feitas = [], M = MC();
    if (sol.id === "engaste" || sol.id === "consolo") feitas.push(lig(sol.ligacoes[0].rotulo, [id, bal.apoio], sol.ligacoes[0]));
    else {
      var g = sol.geo, nova = sol.id === "mao-francesa"
        ? M.barra(g.de, g.ate, { ferr: "diagonal", cat: g.perfil, papel: "Mão-francesa", aco: "ASTM A572 Gr.50", nome: "Mão-francesa da viga " + id, recuo: g.recuo })
        : M.barra(g.de, g.ate, { ferr: "diagonal", perfil: { forma: "circ", d: g.d / 1000 }, papel: "Tirante", aco: "ASTM A36", nome: "Tirante da viga " + id, recuo: g.recuo });
      if (!nova || nova.erro) return { ok: false, motivo: (nova && nova.erro) || "não deu para desenhar a peça da solução", balanco: bal };
      var nid = String(novoId()); nova.id = nid; nova.metal.balanco = id;
      var opN = { op: "criar", id: nid, caixa: nova }; ops.push(opN); emular(por, [opN]);
      feitas.push(lig(sol.ligacoes[0].rotulo, [nid, sol.id === "mao-francesa" ? id : bal.apoio], sol.ligacoes[0]));
      feitas.push(lig(sol.ligacoes[1].rotulo, [nid, sol.id === "mao-francesa" ? bal.apoio : id], sol.ligacoes[1]));
      feitas.push(lig("viga × pilar (flexível)", [id, bal.apoio], sol.ligacoes[2]));
    }
    var falhas = feitas.filter(function (f) { return !f.ok; });
    return { ok: true, ops: ops, solucao: sol, balanco: bal, ligacoes: feitas, pendentes: falhas.map(function (f) { return f.rotulo + ": A DIMENSIONAR — " + f.motivo; }),
      resumo: sol.nome + " aplicada no balanço da viga " + id + " — " + feitas.filter(function (f) { return f.ok; }).length + " ligação(ões) " + TXT_AC + (falhas.length ? "; " + falhas.length + " a dimensionar" : "") + "." };
  }

  /* ================================================================ BALANÇO COM RÓTULA = CRÍTICO */
  function familiaLig(por, lig) {
    var T = Tip(), fam = null, pap = {};
    Object.keys(por).forEach(function (k) { var c = por[k]; if (!c || !c.metal || c.metal.lig !== lig) return; pap[c.metal.papel] = true; if (c.ligInfo && c.ligInfo.tipologia && T && T.obter(c.ligInfo.tipologia)) fam = T.obter(c.ligInfo.tipologia).familia; });
    if (fam) return fam === "rigida" || fam === "semirrigida" ? "rigida" : "rotulada";
    var ML = dep("AcoModeloLivre", "./acomodelolivre.js"), t = ML && ML._int && ML._int.tipoLig ? ML._int.tipoLig(pap) : null;
    return t === "rigida" || t === "continua" ? "rigida" : "rotulada";
  }
  function balancosCriticos(caixas) {
    var por = porIdDe(caixas), out = [];
    arr(caixas).forEach(function (c) {
      if (!ehBarra(c) || !horizontal(c) || /m[aã]o.?francesa|tirante|contravent|diagonal|ter[cç]a/i.test(String(c.metal.papel || ""))) return;
      var pts = pontas(caixas, c), livres = ["a", "b"].filter(function (k) { return pts[k].tipo === "livre"; });
      if (livres.length !== 1) return;
      var kp = livres[0] === "a" ? "b" : "a", ap = pts[kp]; if (ap.tipo === "livre") return;
      var id = String(c.id), ligs = ligacoesEntre(por, [id, ap.id]), rig = ligs.some(function (lg) { return familiaLig(por, lg) === "rigida"; });
      if (rig) return;
      /* escorada: uma mão-francesa/tirante/diagonal com a ponta no eixo da viga, dentro do vão */
      var li = linha(c), X = unit(sub(li.b, li.a)), L = len(sub(li.b, li.a)), alt = num(secaoM(c).alt, 0.25);
      var escorada = arr(caixas).some(function (d) {
        if (!ehBarra(d) || String(d.id) === id || !papelProp(d.metal.papel)) return false;
        var l2 = linha(d); if (!l2) return false;
        return [l2.a, l2.b].some(function (P) { var w = sub(P, li.a), t = dot(w, X), perp = len(sub(w, mul(X, t))); return t > 0.1 && t < L + 0.05 && perp <= alt + 0.15; });
      });
      if (escorada) return;
      out.push({ viga: id, ponta: livres[0], apoio: ap.id, ligacoes: ligs, critico: true,
        texto: "CRÍTICO — viga " + id + " em BALANÇO (a " + (livres[0] === "a" ? "ponta inicial" : "ponta final") + " não tem apoio) com ligação " + (ligs.length ? "ROTULADA" : "não rígida (sem ligação desenhada o cálculo usa rotulada)") + " no " + (ap.tipo === "pilar" ? "pilar " : "apoio ") + ap.id + ": MECANISMO (a viga gira na rótula). Use o engaste, a mão-francesa ou o tirante/consolo (Soluções do balanço) — nunca aprovado assim." });
    });
    return out;
  }

  /* ================================================================ DEPOIS DO CÁLCULO
   * r = o resultado do AcoDimLivre.calcular (envoltória das combinações ELU que ele gerou); o = { modo: "ajustar" | "sugerir",
   * meio, materiais, fundacoes, novoId } → { itens: [{ lig, pecas, acao: "confirmada"|"ajustada"|"sugerida"|"critico"|"pendente",
   * antes, depois, razao }], ops (modo ajustar), criticos, travamentos, resumo } */
  function mesmoArranjo(d, f) {
    if (!f) return false;
    if (f.pf && String((d || {}).parafuso || "") !== f.pf) return false;
    if (f.t && Math.abs(num((d || {}).t, -1) - f.t) > 1e-6) return false;
    if (f.linhas && num((d || {}).n, num((d || {}).linhas, -1)) !== f.linhas) return false;
    if (f.cat && String((d || {}).cat || "") !== f.cat) return false;
    return true;
  }
  function aConfirmarDe(c) {
    var li = c && c.ligInfo; if (!li || !li.tipologia || !c.metal || !c.metal.lig) return false;
    if (li.aConfirmar) return true;
    /* as ligações das VIGAS ENTRE PILARES (lançadas sem a análise, A DIMENSIONAR) também são confirmadas aqui (não a emenda) */
    return !!(li.aDimensionar && li.origem === "vigas-pilares" && !li.emenda && arr(li.pecas).length === 2);
  }
  function aposCalculo(r, caixas, o) {
    o = o || {};
    var modo = o.modo === "sugerir" ? "sugerir" : "ajustar", meio = MEIOS[o.meio] && o.meio !== "nao" ? o.meio : null;
    var seq = 0, base = Date.now().toString(36), novoId = typeof o.novoId === "function" ? o.novoId : function () { return "mlc-" + base + "-" + (seq++); };
    var res = { ok: true, modo: modo, itens: [], ops: [], criticos: [], travamentos: [], resumo: "" };
    if (!r || !r.ok) { res.ok = false; res.resumo = "Sem cálculo que fechou: as ligações continuam " + TXT_AC + "."; return res; }
    var por = porIdDe(caixas), S = Sug(), C = C2(), T = Tip();
    var alvos = arr(caixas).filter(aConfirmarDe);
    alvos.forEach(function (c0) {
      var li = c0.ligInfo, lig = String(c0.metal.lig), ids = arr(li.pecas).map(String), cx = ids.map(function (i) { return por[i]; });
      var item = { lig: lig, pecas: ids, tipologia: li.tipologia, antes: (li.nome || li.tipologia) + " — " + (li.resumo || ""), depois: null, razao: "", acao: "pendente" };
      res.itens.push(item);
      if (!por[String(c0.id)] || cx.some(function (x) { return !x; })) { item.razao = "peça fora do modelo — continua " + TXT_AC; return; }
      var ctx = S.analisar(cx, { resultado: r, fundacoes: o.fundacoes || [] });
      if (!ctx.ok || ctx.estimativa) { item.razao = "a peça não está no último cálculo (" + ((ctx && ctx.motivo) || "sem esforços da análise") + ") — continua " + TXT_AC; return; }
      var extra = {}; if (o.materiais) ["parafuso", "chumbador", "aco"].forEach(function (k) { if (o.materiais[k]) extra[k] = o.materiais[k]; });
      var ent = S.entradaCalc(ctx, extra), entF = clone(ent); entF.forcar = clone(li.forcar || {});
      var rD = C.verificar(li.tipologia, entF), drawnOk = !!(rD && rD.ok && mesmoArranjo(rD.dimensoes, li.forcar));
      var rS = null;
      if (!drawnOk) { rS = C.verificar(li.tipologia, ent); if (rS && rS.ok && mesmoArranjo(rS.dimensoes, li.forcar)) { drawnOk = true; rD = rS; } }
      /* a ligação tem de COMBINAR com o nó do cálculo: a provisória não manda no nó (js/acomodelolivre.js) — com o nó tratado como
         rígido, a flexível de partida não é confirmada só porque a cortante passa (e a rígida num nó rotulado também não) */
      var famD = T && T.obter(li.tipologia) ? T.obter(li.tipologia).familia : null, rigN = ctx.no ? ctx.no.rigido : null;
      var incoer = (rigN === true && famD === "flexivel") || (rigN === false && (famD === "rigida" || famD === "semirrigida"));
      if (incoer) drawnOk = false;
      var nEsf = arr(ctx.esforcos).length, txtEsf = "esforços da análise — " + nEsf + " combinação(ões) ELU (" + (ctx.origemEsforcos || "") + ")";
      if (drawnOk) {
        item.acao = "confirmada"; item.depois = item.antes; item.razaoNum = rD.razao;
        item.razao = "o arranjo desenhado passa com os " + txtEsf + ": " + pct(rD.razao) + " (governa " + String(rD.governante || "—").toLowerCase() + ")";
        if (modo === "ajustar" || o.confirmarNoSugerir !== false) {
          var nc = clone(por[String(c0.id)]), nl = nc.ligInfo;
          delete nl.aConfirmar; if (nl.origem === "vigas-pilares") { delete nl.aDimensionar; delete nl.passaEstimativa; }
          nl.entrada = ent; nl.ok = true; nl.estado = "confirmada"; nl.estimativa = false; nl.razao = num(rD.razao, 0); nl.resumo = rD.resumo || nl.resumo;
          nl.confirmada = { em: new Date().toISOString(), razao: num(rD.razao, 0), origem: ctx.origemEsforcos || "", combinacoes: nEsf };
          var opc = { op: "criar", id: String(c0.id), caixa: nc }; res.ops.push(opc); emular(por, [opc]);
        }
        return;
      }
      var motivoD = incoer ? "a ligação de partida é " + (famD === "flexivel" ? "flexível" : "rígida") + " e o cálculo tratou o nó como " + (rigN ? "RÍGIDO" : "ROTULADO") + " (" + ((ctx.no && ctx.no.texto) || "") + ")"
        : rD ? (rD.ok ? "o arranjo desenhado não é o que os esforços do cálculo pedem" : "o arranjo desenhado NÃO passa com os " + txtEsf + ": " + pct(rD.razao) + " — governa " + String(rD.governante || rD.motivo || "—").toLowerCase()) : "a tipologia não verificou";
      item.razaoNum = rD ? rD.razao : null;
      /* a troca: a escolha do lote com os esforços do cálculo (coerente com o nó do cálculo — escolherLote não aceita R-INC) */
      var sg = S.sugerir(ctx, { execucao: meio === "parafusada" ? "parafusada" : null, materiais: o.materiais || null }), L0 = arr(sg.todasOpcoes);
      if (meio === "soldada") L0 = ordenarSoldada(L0);
      var esc = S.escolherLote({ todasOpcoes: L0, relacao: sg.relacao, fundacao: sg.fundacao }), op = esc.opcao;
      if (!op) {
        var mq = L0[0];
        item.acao = "critico"; item.critico = true;
        item.razao = "CRÍTICO — " + motivoD + "; e nenhuma tipologia com desenho passa com esses esforços (" + (esc.motivo || "") + (mq ? "; a melhor: " + mq.nome + " " + pct((mq.resultado || {}).razao) + ", governa " + String((mq.resultado || {}).governante || "—").toLowerCase() : "") + "). Troque o perfil ou detalhe a ligação à mão.";
        return;
      }
      item.depois = op.nome + " — " + ((op.resultado || {}).resumo || ""); item.razaoNova = num((op.resultado || {}).razao, 0);
      item.razao = motivoD + " → " + (op.tipologia === li.tipologia ? "a mesma tipologia com " : "") + op.nome.toLowerCase() + " passa (" + pct((op.resultado || {}).razao) + ")";
      item.familiaMudou = T && T.obter(op.tipologia) && T.obter(li.tipologia) ? T.obter(op.tipologia).familia !== T.obter(li.tipologia).familia : false;
      if (modo !== "ajustar") { item.acao = "sugerida"; return; }
      var ops = [{ op: "metalApagarLig", lig: lig }]; emular(por, ops);
      var ctx2 = S.analisar(ids.map(function (i) { return por[i]; }), { resultado: r, fundacoes: o.fundacoes || [] });
      var sg2 = S.sugerir(ctx2, { execucao: meio === "parafusada" ? "parafusada" : null, materiais: o.materiais || null }), L2 = arr(sg2.todasOpcoes).filter(function (x) { return x.tipologia === op.tipologia; });
      var esc2 = S.escolherLote({ todasOpcoes: L2.length ? L2 : arr(sg2.todasOpcoes), relacao: sg2.relacao, fundacao: sg2.fundacao });
      if (!esc2.opcao) { item.acao = "critico"; item.critico = true; item.razao = "CRÍTICO — " + motivoD + "; a troca não fechou depois de tirar a ligação de partida (" + (esc2.motivo || "") + ")."; return; }
      var d = desenhar({ opcao: esc2.opcao, ctx: ctx2 }, por, novoId, { origem: li.origem, preDim: li.preDim || null, meioLancar: li.meioLancar || null, balanco: li.balanco || undefined,
        ajustadaPeloCalculo: { em: new Date().toISOString(), antes: item.antes, depois: item.depois, razao: item.razao } });
      if (!d.ok) { item.acao = "critico"; item.critico = true; item.razao = "CRÍTICO — " + motivoD + "; o desenho da troca recusou (" + d.motivo + ")."; return; }
      d.ops.forEach(function (q) { var l2 = q.caixa && q.caixa.ligInfo; if (!l2) return; l2.ok = !!esc2.opcao.passa; l2.estado = "ajustada"; l2.estimativa = false; l2.confirmada = { em: new Date().toISOString(), razao: num((esc2.opcao.resultado || {}).razao, 0), origem: ctx2.origemEsforcos || "", combinacoes: arr(ctx2.esforcos).length }; });
      item.acao = "ajustada"; item.ligNova = d.lig;
      res.ops = res.ops.concat(ops, d.ops);
    });
    res.criticos = balancosCriticos(Object.keys(por).map(function (k) { return por[k]; }));
    res.travamentos = travamentos(r);
    var n = { confirmada: 0, ajustada: 0, sugerida: 0, critico: 0, pendente: 0 }; res.itens.forEach(function (i) { n[i.acao] = (n[i.acao] || 0) + 1; });
    res.contagem = n;
    res.resumo = res.itens.length ? res.itens.length + " ligação(ões) a confirmar: " + n.confirmada + " confirmada(s), " + n.ajustada + " ajustada(s), " + n.sugerida + " com sugestão, " + n.critico + " CRÍTICA(s)" + (n.pendente ? ", " + n.pendente + " ainda a confirmar" : "") + "." : "Nenhuma ligação a confirmar.";
    if (res.criticos.length) res.resumo += " " + res.criticos.length + " balanço(s) CRÍTICO(s).";
    return res;
  }

  /* ================================================================ TRAVAMENTO (só sugestão) */
  function travamentos(r) {
    var out = []; if (!r || !r.ok || !r.modelo) return out;
    arr(r.modelo.membros).forEach(function (m) {
      if (m.papelLivre !== "viga" && m.papel !== "viga") return;
      var v = (r.membros || {})[m.id], flt = v && v.pior && v.pior.flt; if (!flt || !(flt.lam > flt.lp) || !flt.trecho) return;
      var Lb = flt.trecho[1] - flt.trecho[0], rz = num(v.razao, 0);
      /* a FLT entra na flexão e na interação força axial + momentos (a viga do pórtico também tem N) */
      if (!(Lb > 1.5) || rz < 0.5 || !/Flex|momento|intera/i.test(String(v.governante || ""))) return;
      var lam2 = flt.lam / 2, volta = lam2 <= flt.lp;
      out.push({ membro: m.id, peca: m.peca, nome: m.nome, Lb: Lb, lam: flt.lam, lp: flt.lp, MRd: flt.MRd, razao: rz, mesa: flt.mesa, reprova: rz > 1 + 1e-9,
        texto: (rz > 1 + 1e-9 ? "REPROVA — " : "") + "viga " + m.id + " (" + (m.nome || m.peca) + "): a mesa " + flt.mesa + " fica comprimida e destravada em Lb = " + br(Lb, 2) + " m (trecho " + br(flt.trecho[0], 2) + "–" + br(flt.trecho[1], 2) + " m; λ = Lb/ry = " + br(flt.lam, 0) + " > λp = " + br(flt.lp, 0) + "): a flambagem lateral com torção (NBR 8800, Anexo G) baixa o momento resistente para " + br(flt.MRd, 1) + " kN·m — aproveitamento " + pct(rz) + ".",
        sugestao: "Travar a mesa " + flt.mesa + " no meio do trecho (escora até a estrutura vizinha ou mão-francesa de travamento até a viga/terça de cima): Lb cai para " + br(Lb / 2, 2) + " m (λ = " + br(lam2, 0) + (volta ? " ≤ λp: sem redução por FLT" : "") + "). É sugestão — o sistema não muda o modelo; desenhe o travamento e calcule de novo." });
    });
    return out;
  }

  var MetalLigAuto = {
    PADRAO: PADRAO, MEIOS: MEIOS, GAMA_G: GAMA_G, GAMA_Q: GAMA_Q, ACRESC: ACRESC, FOLGA: FOLGA, ANG_MF: ANG_MF, DIAG_MF: DIAG_MF, DIAM_TIRANTE: DIAM_TIRANTE, FAB_PESO: FAB_PESO, RIGIDAS_ENGASTE: RIGIDAS_ENGASTE, TXT_AC: TXT_AC,
    cfgOk: cfgOk, pontas: pontas, pesoProprio: pesoProprio, aoLancar: aoLancar, balanco: balanco, aplicarBalanco: aplicarBalanco, balancosCriticos: balancosCriticos,
    aposCalculo: aposCalculo, travamentos: travamentos, apoioIntermediario: apoioIntermediario, emular: emular, aConfirmarDe: aConfirmarDe, mesmoArranjo: mesmoArranjo, arranjoDe: arranjoDe
  };
  global.MetalLigAuto = MetalLigAuto;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalLigAuto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
