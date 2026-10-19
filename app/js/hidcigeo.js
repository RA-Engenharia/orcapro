/* =====================================================================
 * hidcigeo.js — a CAIXA DE INSPEÇÃO (motor PURO de geometria e de escolha, ES5, Node-testável). 18/10/2026.
 *
 * PENDÊNCIAS FINAIS (18/10/2026, decisão da coordenação — ver dados-fonte/hidro/inspecao/caixas.json):
 *   · onde a NBR 8160 exige CAIXA de inspeção, o padrão é a CAIXA DE 0,60 m — de ALVENARIA (tijolo maciço, padrão) ou
 *     PRÉ-MOLDADA de concreto —, com TAMPA de concreto (padrão) ou de ferro fundido. A composição SINAPI REAL é escolhida
 *     pela profundidade (a primeira cuja profundidade interna cobre a da caixa; passou da maior, a maior + aviso), e o 3D é
 *     a caixa DELA: paredes, fundo com a CANALETA (meia-cana) no rumo da saída e a tampa rente ao piso/terreno (nível
 *     automático do js/hidnivel.js). As dimensões saem da descrição oficial (js/hidcidados.js, GERADO).
 *   · o DISPOSITIVO DE INSPEÇÃO de PVC Ø 300 (Amanco) continua como OPÇÃO (tipoCaixa "pvc300"), desenhado como o produto
 *     da ficha (corpo, prolongadores, tampa — abaixo, geoPvc); a 8160 só o aceita onde aceita dispositivo e não caixa: na
 *     rede ENTERRADA a pendência continua (js/hides.js: erro com Corrigir → caixa de alvenaria). Sem SINAPI: a soma das
 *     referências de mercado do corpo, dos prolongadores e da tampa (js/hidprecomercado.js).
 *   HidCI.tipoDe(k) → "alvenaria" | "premoldado" | "pvc300"           (padrão: alvenaria)
 *   HidCI.escolher(tipo, prof_m, tampa) → { tipo, composicao, forma, lado, lado2, diam, profInterna, tampa, linhas:[sinapi], avisos }
 *   HidCI.dims(k) → { tipoCaixa, forma, diametro_m | lado_m, prof_m, dispositivo }         (o cálculo: js/hidgrafo.js)
 *   HidCI.orcamento(k) → { nome, chaveExtra, composicoes:[sinapi] } | { nome, semTabela, mercadoSoma }   (js/biminst.js)
 *
 * O DISPOSITIVO DE PVC (geoPvc) — regra do Rogério: "volumetria igual à do produto comprado". A caixa da linha da rede (peça `caixa_inspecao` do js/hidrede.js,
 * com a PROFUNDIDADE da instância) sai como o conjunto da ficha: CORPO (Ø e altura cotados), PROLONGADORES até o terreno (as
 * peças de catálogo, a última cortada na obra) e TAMPA com PORTA-TAMPA rente ao terreno. As BOCAS saem na direção e na
 * ALTURA do tubo real (a caixa gira na obra); o tubo para no fundo da bolsa (portas → recuo do tubo, como na caixa sifonada).
 * Cotas: js/biminstgeodados.js (pecas.caixa_inspecao, GERADO por tools/gerar-hidgeo-dados.js da ficha Amanco Wavin
 * FTC000003 págs. 8–10 — a única ficha cotada do acervo; o Manual Técnico Tigre 2025 p.140–141 traz o desenho do corpo sem
 * números). Nenhuma cota aqui: os "hid:ok" são forma de desenho (chanfros, colarinho, folgas visuais), declarados.
 *
 *   HidCI.geo(k, ligados, o) → { partes:[{papel, malha}], portas:[{trecho, lado, raio, centro}], cotas, compra:[{codigo,
 *                                 descricao, qtd, obs}], avisos:[texto], fontes, aConferir }  | null (sem a ficha)
 *   HidCI.composicao(prof_m) → { corpo, prolongadores:[{codigo, comprimento_mm, corte}], tampa, falta_mm, cabe }
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function G() { return dep("HidGeo", "./biminstgeo.js"); }
  function D300() { var d = dep("HidGeoDados", "./biminstgeodados.js"); return d && d.pecas && d.pecas.caixa_inspecao ? d.pecas.caixa_inspecao["300"] : null; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  var MM = 0.001;   // hid:ok mm → m
  var EPS = 1e-6;   // hid:ok
  var RAIZ2 = Math.SQRT2;
  /* forma de DESENHO (não é cota do produto): chanfro do fundo, colarinho que recebe o prolongador, parede dos tubos */
  var FORMA = {
    chanfroFundo: 4,      // hid:ok mm — o fundo injetado é levemente menor
    colarinho: 12,        // hid:ok mm — altura do encaixe do prolongador no topo do corpo
    parede: 3,            // hid:ok mm — espessura visual da parede do prolongador
    folgaBolsa: 1.5       // hid:ok mm — folga visual entre o tubo e a bolsa
  };
  function d1(v) { return Math.round(v * 10) / 10; }   // hid:ok arredonda a 0,1 mm
  var LADOS_QUADRADO = 4;   // hid:ok o porta-tampa é quadrado (varrido com 4 lados)
  function escala(p) { return p.map(function (x) { return [x[0] * MM, x[1] * MM]; }); }
  function nrmz(v) { var L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return L > EPS ? [v[0] / L, v[1] / L, v[2] / L] : [0, 0, 0]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

  /* a pilha de prolongadores entre o topo do corpo e o fundo do porta-tampa (mm): peças inteiras da maior, e a última cortada */
  function composicao(prof) {
    var d = D300(); if (!d) return null;
    var falta = num(prof, 0) / MM - d.corpo.alt - d.tampa.alt, pr = d.prolongadores.slice().sort(function (a, b) { return b.util - a.util; }), out = [];
    var cabe = falta >= -EPS;
    var resto = Math.max(0, falta);
    while (resto > EPS) {
      var p = pr.filter(function (x) { return x.util >= resto - EPS; }).sort(function (a, b) { return a.util - b.util; })[0] || pr[0];
      var usa = Math.min(p.util, resto);
      out.push({ codigo: p.codigo, descricao: p.descricao, comprimento_mm: d1(usa), util_mm: p.util, total_mm: p.total, corte: usa < p.util - EPS, diam: p.diam, diamBolsa: p.diamBolsa });
      resto -= usa;
    }
    return { corpo: d.corpo, tampa: d.tampa, prolongadores: out, falta_mm: d1(falta), cabe: cabe };
  }

  function geoPvc(k, ligados, o) {
    o = o || {};
    var H = G(), d = D300(); if (!H || !d || !k) return null;
    var seg = o.lod === "longe" ? 12 : 28, Y = [0, 1, 0], prof = num(k.prof, 0);   // hid:ok lados do polígono (desenho)
    var topo = [num(k.x, 0), num(k.y, 0), num(k.z, 0)], base = [topo[0], topo[1] - prof, topo[2]];
    var C = composicao(prof), avisos = [], compra = [], portas = [];
    var mc = new H.Malha(), mt = new H.Malha(), mb = new H.Malha(), mA = new H.Malha();
    /* CORPO: cilindro Ø A × B, fundo chanfrado, colarinho no topo para o prolongador (Ø do corpo do prolongador) */
    var rC = d.corpo.diam / 2, hC = d.corpo.alt, rP = (d.prolongadores[0] || { diam: d.corpo.diam }).diam / 2, cf = FORMA.chanfroFundo, cl = FORMA.colarinho;
    H.varrer(mc, H.reta(base, Y), escala([[0, 0], [0, rC - cf], [cf, rC], [hC - cl, rC], [hC - cl, rP + FORMA.parede], [hC, rP + FORMA.parede], [hC, rP - FORMA.parede], [hC - cl, rP - FORMA.parede], [hC - cl, 0]]), seg, false);
    compra.push({ codigo: d.corpo.codigo, descricao: d.corpo.descricao, qtd: 1 });
    /* PROLONGADORES: do topo do corpo ao fundo do porta-tampa, cada um com a bolsa (Ø B) em cima recebendo o próximo */
    var y0 = hC, extras = [];
    if (C && !C.cabe) avisos.push("profundidade " + (prof / MM).toFixed(0) + " mm menor que corpo + tampa (" + (hC + d.tampa.alt) + " mm): a caixa não cabe — aprofunde o tubo ou use outra caixa");
    /* cada prolongador é um ELEMENTO (entra no quantitativo com o código e o corte) */
    (C ? C.prolongadores : []).forEach(function (p, ip) {
      var L = p.comprimento_mm, rb = p.diamBolsa / 2, lb = Math.min(L, p.total_mm - p.util_mm), rp = p.diam / 2, e = FORMA.parede, mpi = new H.Malha();
      H.varrer(mpi, H.reta(add(base, [0, y0 * MM, 0]), Y), escala([[0, rp - e], [0, rp], [L - lb, rp], [L - lb, rb], [L, rb], [L, rp - e]]), seg, true);
      var obs = p.corte ? "cortado na obra em " + p.comprimento_mm + " mm" : null;
      compra.push({ codigo: p.codigo, descricao: p.descricao, qtd: 1, obs: obs });
      extras.push({ suf: "pl" + (ip + 1), nome: "Prolongador " + p.descricao.replace(/^PROLONGADOR\s*/i, "") + " (" + p.codigo + ")" + (obs ? " — " + obs : ""), codigo: p.codigo, papel: "corpo", malha: mpi, comprimento_mm: p.comprimento_mm });
      y0 += L;
    });
    /* TAMPA + PORTA-TAMPA: quadrado (base A, topo B, altura C; a tampa D em cima) com o topo no terreno */
    var T = d.tampa, yT = prof / MM - T.alt, Rb = T.ladoBase / 2 * RAIZ2, Rt = T.ladoTopo / 2 * RAIZ2;
    H.varrer(mt, H.reta(add(base, [0, yT * MM, 0]), Y), escala([[0, 0], [0, Rb], [T.alt - T.altTampa, Rb], [T.alt - T.altTampa, Rt], [T.alt, Rt], [T.alt, 0]]), LADOS_QUADRADO, false);
    compra.push({ codigo: T.codigo, descricao: T.descricao, qtd: 1 });
    /* BOCAS: cada tubo ligado sai na direção e na altura dele; a face da bolsa fica a C1/2 do eixo (boca a boca da ficha) */
    var Lb = d.corpo.bocaABoca / 2, entradaNoProlongador = 0;
    (ligados || []).forEach(function (l) {
      var dir = l.dir || [1, 0, 0], dh = nrmz([dir[0], 0, dir[2]]); if (Math.abs(dir[1]) > 0.9 || (!dh[0] && !dh[2])) return;   // hid:ok tubo vertical: não é boca radial
      var c = H.cotasConexao("pvc_esgoto", "luva", num(l.dn, d.corpo.dnSaida)), pt = l.ponto || {}, h = (num(pt.y, base[1]) - base[1]) / MM;
      if (h + c.od / 2 > hC - cl + EPS) entradaNoProlongador++;
      var C0 = add(base, [0, h * MM, 0]), cam = H.reta(C0, dh), rf = c.de / 2 + FORMA.folgaBolsa;
      H.varrer(mb, cam, escala([[0, 0], [0, c.od / 2], [Lb, c.od / 2], [Lb, rf], [Lb - c.pb, rf], [Lb - c.pb, 0]]), Math.max(12, seg - 8), false);   // hid:ok lados da boca
      portas.push({ trecho: l.trecho, lado: l.lado, raio: (Lb - c.pb) * MM, centro: topo });
    });
    if (entradaNoProlongador) {
      avisos.push(entradaNoProlongador + " tubo(s) chegam acima do corpo da caixa: use prolongador COM entrada (o Manual Tigre p.141 prevê) ou rebaixe o tubo");
      compra.push({ codigo: null, descricao: "prolongador com entrada DN 100 (sem cota na ficha do acervo)", qtd: entradaNoProlongador, obs: "pendente: ficha" });
    }
    var partes = [{ papel: "corpo", malha: mc }, { papel: "corpo", malha: mb }, { papel: "grelha", malha: mt }];
    if (mA.idx.length) partes.push({ papel: "anel", malha: mA });
    return { partes: partes.filter(function (p) { return p.malha.idx.length; }), extras: extras, portas: portas, avisos: avisos, compra: compra, aConferir: true,
             cotas: { diam: d.corpo.diam, altCorpo: hC, tampa: [T.ladoBase, T.ladoTopo, T.alt], prof_mm: Math.round(prof / MM), prolongadores: C ? C.prolongadores.map(function (p) { return p.comprimento_mm; }) : [] },
             fontes: ["ficha Amanco Wavin FTC000003 (Ago/2024) págs. 8–10 — corpo 13154, prolongadores 70900/70901, tampa 13151; Tigre 27801056/27801552/27801340 sem cotas do corpo no acervo"] };
  }

  /* ====================================================== CAIXA DE 0,60 m (alvenaria / pré-moldada) */
  function DC() { return dep("HidCIDados", "./hidcidados.js"); }
  var TIPOS_CAIXA = { alvenaria: 1, premoldado: 1, pvc300: 1 };
  function tipoDe(k) { return k && TIPOS_CAIXA[k.tipoCaixa] ? k.tipoCaixa : "alvenaria"; }
  function tampaDe(k) { return k && k.tampa === "ferro" ? "ferro" : "concreto"; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function spDe(c, rot) { return { status: "ok", chave: "caixa_inspecao|" + c.codigo, rotulo: rot, codigo: c.codigo, unidade: c.unidade, descricao: c.descricao, alternativas: 0, preco: c.preco }; }
  /* ====================================================== POÇO DE VISITA (decisão da coordenação, 18/10/2026, noite)
     A caixa acima da profundidade da NBR 8160 (5.1.5.3, p.19: "profundidade maior que 1,00 m") vira PV AUTOMATICAMENTE:
     balão (a menor base de esgoto com Ø ≥ a dimensão mínima da norma), laje de redução, chaminé (Ø da composição, ≥ o mínimo
     da norma) e tampão de ferro fundido rente ao piso/terreno. Os limites vêm do HidNormas (es.poco_visita); sem eles (norma
     não carregada) não há PV — a caixa fica como antes, com o aviso. Orçamento: base + acréscimo (m) + chaminé (m) + tampão. */
  function NRm() { return dep("HidNormas", "./hidnormas.js"); }
  function normaPV() {
    var N = NRm(); if (!N || !N.consulta) return {};
    function v(ch, p) { var c = N.consulta(ch, { parametro: p }, "valor"); return c && c.ok ? num(c.valor, null) : null; }
    return { profMax: v("es.caixa_inspecao", "Profundidade máxima"), pvAcima: v("es.poco_visita", "Profundidade a partir da qual é poço de visita (maior que)"),
             dimMin: v("es.poco_visita", "Dimensão mínima em planta (lado ou diâmetro interno)"), balaoMin: v("es.poco_visita", "Câmara de trabalho (balão): altura mínima"),
             chamineMin: v("es.poco_visita", "Chaminé de acesso: diâmetro interno mínimo") };
  }
  function ehPV(prof) {
    var Dd = DC(), n = normaPV(), lim = n.pvAcima != null ? n.pvAcima : n.profMax;
    return !!(Dd && Dd.pocoVisita && Dd.pocoVisita.tipos && lim != null && num(prof, 0) > lim + EPS);
  }
  function r2(v) { return Math.round(v * 100) / 100; }   // hid:ok arredonda a cm (quantidade em m da composição)
  function escolherPV(tipo, prof) {
    var Dd = DC(), PV = Dd && Dd.pocoVisita; if (!PV || !PV.tipos) return null;
    var tPV = PV.tipos[tipo] ? tipo : "alvenaria", T = PV.tipos[tPV]; if (!T || !T.bases || !T.bases.length) return null;
    var n = normaPV(), avisos = [], p = num(prof, 0), ds = T.desenho || {}, laje = num(ds.laje_m, 0);
    if (tipo !== tPV) avisos.push("o dispositivo de PVC não vale como poço de visita: o PV desta profundidade é o de alvenaria");
    var bi = -1; T.bases.forEach(function (b, i) { if (bi < 0 && n.dimMin != null && b.diam >= n.dimMin - EPS) bi = i; });
    if (bi < 0) { bi = T.bases.length - 1; avisos.push(n.dimMin == null ? "dimensão mínima do PV sem a norma carregada (es.poco_visita): orçado pela maior base" : "nenhuma base de PV com Ø ≥ " + f2(n.dimMin) + " m: orçado pela maior (Ø " + f2(T.bases[bi].diam) + " m) — confira"); }
    var b = T.bases[bi], a = (T.acrescimos || [])[bi] || null, ch = T.chamine, hb, hc;
    if (n.balaoMin == null) { hb = Math.max(0, p - laje); hc = 0; avisos.push("altura mínima do balão sem a norma carregada: PV sem chaminé"); }
    else if (p - laje <= n.balaoMin + EPS) {
      hb = Math.max(0, p - laje); hc = 0;
      if (hb < n.balaoMin - EPS) avisos.push("PV raso: o balão fica com " + f2(hb) + " m, abaixo dos " + f2(n.balaoMin) + " m da NBR 8160 (5.1.5.3 f) — sem chaminé; confira a cota da rede");
    } else { hb = n.balaoMin; hc = p - laje - n.balaoMin; }
    if (ch && n.chamineMin != null && ch.diam < n.chamineMin - EPS) avisos.push("a chaminé da composição (Ø " + f2(ch.diam) + " m) é menor que o mínimo da norma (Ø " + f2(n.chamineMin) + " m)");
    var linha = function (c, rot, q) { var o = spDe(c, rot); o.qtd = q; o.unidadeQto = String(c.unidade || "UN").toLowerCase(); o.chave = "poco_visita|" + c.codigo; return o; };
    var qAcr = r2(Math.max(0, hb + laje - b.prof)), linhas = [linha(b, T.nome + " — base Ø " + f2(b.diam) + " m (profundidade " + f2(b.prof) + " m da composição)", 1)];
    if (qAcr > 0 && a) linhas.push(linha(a, T.nome + " — acréscimo do balão acima da base", qAcr));
    if (hc > EPS && ch) linhas.push(linha(ch, T.nome + " — chaminé de acesso Ø " + f2(ch.diam) + " m", r2(hc)));
    if (PV.tampao) linhas.push(linha(PV.tampao, "Tampão de ferro fundido Ø " + f2(PV.tampao.diam) + " m do poço de visita", 1));
    return { tipo: tPV, pv: true, nome: T.nome, composicao: b, forma: "circular", lado: null, lado2: null, diam: b.diam, profInterna: p, prof: p, tampa: "ferro", tampaComp: PV.tampao,
             linhas: linhas, avisos: avisos, desenho: ds, balao: hb, laje: laje, chamine: { diam: ch ? ch.diam : null, h: hc }, norma: n };
  }
  /* a composição pela profundidade: a primeira (em ordem) que cobre; passou da maior, a maior (o lado mais alto) + aviso */
  function escolher(tipo, prof, tampa) {
    if (ehPV(prof)) return escolherPV(tipo, prof);
    var Dd = DC(); if (!Dd || !Dd.tipos || !Dd.tipos[tipo]) return null;
    var T = Dd.tipos[tipo], cs = T.composicoes || [], p = num(prof, 0), avisos = [];
    var c = cs.filter(function (x) { return x.prof >= p - EPS; })[0];
    if (!c) { c = cs[cs.length - 1]; if (c) avisos.push("profundidade " + f2(p) + " m passa da maior composição de " + T.nome.toLowerCase() + " (" + c.codigo + ", " + f2(c.prof) + " m): orçada pela maior (lado mais alto) — confira: acima da profundidade máxima da caixa, a NBR 8160 (5.1.5.3) pede poço de visita"); }
    if (!c) return null;
    var tp = tampa === "ferro" ? "ferro" : "concreto", T2 = (Dd.tampas || {})[tp] || null;
    var linhas = [spDe(c, T.nome + " — " + (c.forma === "circular" ? "Ø " + f2(c.diam) : f2(c.lado) + " × " + f2(c.lado2)) + " m, profundidade até " + f2(c.prof) + " m")];
    /* a tampa: a composição SEM tampão leva a tampa escolhida; a que já traz a tampa de concreto leva o tampão de ferro por cima, se pedido */
    if (!c.incluiTampa && T2) linhas.push(spDe(T2, "Tampa da caixa de inspeção — " + T2.nome));
    else if (c.incluiTampa && tp === "ferro" && T2) linhas.push(spDe(T2, "Tampão de ferro fundido sobre a laje da caixa"));
    return { tipo: tipo, nome: T.nome, composicao: c, forma: c.forma, lado: c.lado || null, lado2: c.lado2 || null, diam: c.diam || null, profInterna: c.prof, prof: p, tampa: tp, tampaComp: T2, linhas: linhas, avisos: avisos, desenho: T.desenho || {} };
  }
  function dims(k) {
    var t = tipoDe(k), p = num(k && k.prof, 0);
    if (ehPV(p)) {   /* poço de visita: o Ø do balão, a chaminé e o balão (o cálculo e a conferência do js/hides.js) */
      var ep = escolherPV(t, p);
      if (ep) return { tipoCaixa: t, pv: true, forma: "circular", diametro_m: ep.diam, prof_m: p, composicao: ep.composicao.codigo, chamine_m: ep.chamine.diam, chamineAltura_m: r2(ep.chamine.h), balao_m: r2(ep.balao) };
    }
    if (t === "pvc300") { var d = D300(); return { tipoCaixa: t, forma: "circular", diametro_m: d ? (d.prolongadores[0] || { diam: d.corpo.diam }).diam * MM : null, prof_m: p, dispositivo: true }; }
    var e = escolher(t, p, tampaDe(k)); if (!e) return { tipoCaixa: t, forma: null, prof_m: p };
    return e.forma === "circular" ? { tipoCaixa: t, forma: "circular", diametro_m: e.diam, prof_m: p, composicao: e.composicao.codigo }
                                  : { tipoCaixa: t, forma: "prismatica", lado_m: Math.min(e.lado, e.lado2), prof_m: p, composicao: e.composicao.codigo };
  }
  function orcamento(k) {
    var t = tipoDe(k);
    if (ehPV(num(k && k.prof, 0))) {
      var ep = escolherPV(t, num(k && k.prof, 0));
      if (ep) return { nome: "Poço de visita " + (ep.tipo === "premoldado" ? "pré-moldado" : "de alvenaria") + " (balão Ø " + f2(ep.diam) + " m, profundidade " + f2(ep.prof) + " m, tampão de ferro fundido)", pv: true,
                       chaveExtra: "pv|" + ep.tipo + "|" + ep.linhas.map(function (l) { return l.codigo + "x" + l.qtd; }).join("+"), composicoes: ep.linhas, avisos: ep.avisos };
    }
    if (t === "pvc300") {
      var d = D300(), C = composicao(num(k && k.prof, 0)), Dd = DC(), M = Dd && Dd.dispositivoPvc && Dd.dispositivoPvc.mercado;
      if (!d || !C || !M) return { nome: "Dispositivo de inspeção de PVC Ø 300", semTabela: "dispositivo de inspeção de PVC Ø 300: sem a ficha do produto — pendente", chaveExtra: "pvc300" };
      var ids = [M.corpo].concat(C.prolongadores.map(function (p) { return M.prolongadores[p.codigo]; })).concat([M.tampa]);
      return { nome: "Dispositivo de inspeção de PVC Ø 300 (Amanco: corpo, " + C.prolongadores.length + " prolongador(es), tampa)", chaveExtra: "pvc300|" + ids.join("+"),
               semTabela: "a SINAPI 06/2026 não tem composição do dispositivo de inspeção de PVC Ø 300 — pendente (nunca a parecida)", mercadoSoma: ids.filter(Boolean), mercadoRotulo: "dispositivo de inspeção PVC Ø 300" };
    }
    var e = escolher(t, num(k && k.prof, 0), tampaDe(k));
    if (!e) return { nome: "Caixa de inspeção", semTabela: "caixa de inspeção: a tabela das composições (js/hidcidados.js) não carregou — pendente", chaveExtra: t };
    return { nome: e.nome + " (" + (e.forma === "circular" ? "Ø " + f2(e.diam) : f2(e.lado) + " × " + f2(e.lado2)) + " m, tampa de " + (e.tampa === "ferro" ? "ferro" : "concreto") + ")",
             chaveExtra: t + "|" + e.linhas.map(function (l) { return l.codigo; }).join("+"), composicoes: e.linhas, avisos: e.avisos };
  }

  /* um sólido de SEÇÕES ao longo de x. Cada seção = a linha de CIMA (u crescente, v > 0) no plano (u, v); a seção fechada
     é ela + o fundo (v = 0) nos MESMOS u, de volta — as tampas saem em faixas verticais (trapézios), sem T nas arestas
     (a seção com a meia-cana não é "estrelada": leque a partir de um ponto deixaria triângulo do avesso) */
  function solidoSecoes(m, origem, eX, eU, eV, xs, topos) {
    var secoes = topos.map(function (T) { return T.concat(T.slice().reverse().map(function (q) { return [q[0], 0]; })); });
    m.abrir();
    function P3(x, uv) { return [origem[0] + eX[0] * x + eU[0] * uv[0] + eV[0] * uv[1], origem[1] + eX[1] * x + eU[1] * uv[0] + eV[1] * uv[1], origem[2] + eX[2] * x + eU[2] * uv[0] + eV[2] * uv[1]]; }
    function tri(a, b, c, nEsp) {
      var ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      var L = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]); if (L < EPS * EPS) return;
      if (n[0] * nEsp[0] + n[1] * nEsp[1] + n[2] * nEsp[2] < 0) { var t0 = b; b = c; c = t0; n = [-n[0], -n[1], -n[2]]; }
      var nn = [n[0] / L, n[1] / L, n[2] / L];
      m.t(m.v(a, nn), m.v(b, nn), m.v(c, nn));
    }
    var s0 = secoes[0], area = 0;   /* o sentido da seção (área com sinal): dá a normal de FORA de cada aresta */
    for (var i = 0; i < s0.length; i++) { var q0 = s0[i], q1 = s0[(i + 1) % s0.length]; area += q0[0] * q1[1] - q1[0] * q0[1]; }
    var sg = area > 0 ? 1 : -1;
    for (var k = 0; k < xs.length - 1; k++) {
      var A = secoes[k], B = secoes[k + 1];
      for (var j = 0; j < A.length; j++) {
        var j2 = (j + 1) % A.length, du = (A[j2][0] + B[j2][0] - A[j][0] - B[j][0]) / 2, dv = (A[j2][1] + B[j2][1] - A[j][1] - B[j][1]) / 2, nu = sg * dv, nv = -sg * du;
        var nEsp = [eU[0] * nu + eV[0] * nv, eU[1] * nu + eV[1] * nv, eU[2] * nu + eV[2] * nv];
        var a = P3(xs[k], A[j]), b = P3(xs[k], A[j2]), c = P3(xs[k + 1], B[j2]), d = P3(xs[k + 1], B[j]);
        tri(a, b, c, nEsp); tri(a, c, d, nEsp);
      }
    }
    [[0, -1], [xs.length - 1, 1]].forEach(function (pr) {
      var T = topos[pr[0]], x = xs[pr[0]], nE = [eX[0] * pr[1], eX[1] * pr[1], eX[2] * pr[1]];
      for (var j = 0; j < T.length - 1; j++) {
        var a = P3(x, T[j]), b = P3(x, T[j + 1]), c = P3(x, [T[j + 1][0], 0]), d = P3(x, [T[j][0], 0]);
        tri(a, b, c, nE); tri(a, c, d, nE);
      }
    });
    m.fechar();
  }
  /* a seção da BERMA (o enchimento do fundo) com a MEIA-CANA: largura w, topo hb, a canaleta de raio r centrada em (0, hb)
     — o fundo dela em hb − r, alinhado com a geratriz de baixo do tubo de saída */
  function secaoBerma(w, hb, r, n) {
    var rr = Math.min(r, w / 2 * FORMA_CX.margemCanal, hb * FORMA_CX.margemCanal), p = [[-w / 2, hb], [-rr, hb]];
    for (var i = 1; i < n; i++) { var a = Math.PI + Math.PI * i / n; p.push([rr * Math.cos(a), hb + rr * Math.sin(a)]); }
    p.push([rr, hb], [w / 2, hb]);
    return { topo: p, raio: rr };   /* a linha de CIMA (u crescente); o fundo é v = 0 */
  }
  function norm2(v) { var L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return L > EPS ? [v[0] / L, v[1] / L, v[2] / L] : [1, 0, 0]; }
  /* forma de DESENHO da caixa de 0,60 m (não é cota de norma nem de composição) */
  var FORMA_CX = {
    calha: 0.10,         // hid:ok sem tubo ligado: a canaleta a 10 cm do fundo (a mesma folga de assentamento do js/hidrede.js)
    calhaMin: 0.02,      // hid:ok a canaleta nunca encosta no fundo (desenho)
    margemCanal: 0.96,   // hid:ok a canaleta não toca a parede nem fura o fundo (desenho)
    tampao: 0.03,        // hid:ok espessura do tampão de ferro (desenho)
    aro: 0.03,           // hid:ok largura do aro do tampão (desenho)
    saliencia: 0.002,    // hid:ok o tampão sai 2 mm acima da laje (vê-se a peça)
    segs: 40, segsLonge: 16, arco: 14, arcoLonge: 6, estacoes: 16, estacoesLonge: 6,   // hid:ok segmentos de malha (desenho)
    dnSemTubo: 100,      // hid:ok DN de desenho da canaleta quando não há tubo ligado
    /* os PUXADORES da tampa de concreto (alças de vergalhão chumbadas na tampa — desenho, como a tampa pré-moldada na obra) */
    puxComp: 0.10,       // hid:ok comprimento da alça (desenho)
    puxBitola: 0.010,    // hid:ok bitola do vergalhão da alça (desenho)
    puxSai: 0.001,       // hid:ok a alça EMBUTIDA na tampa aflora 1 mm (a tampa fica rente ao piso: ninguém tropeça)
    puxPos: 0.5          // hid:ok as duas alças a meio caminho entre o centro e a borda da tampa (desenho)
  };
  function geoCaixa(k, ligados, o) {
    o = o || {};
    var H = G(); if (!H || !k) return null;
    var t = tipoDe(k), e = escolher(t, num(k.prof, 0), tampaDe(k)); if (!e) return null;
    var ds = e.desenho || {}, ep = num(ds.parede_m, 0), ef = num(ds.fundo_m, 0), et = num(ds.tampa_m, 0), longe = o.lod === "longe";
    var Y = [0, 1, 0], seg = longe ? FORMA_CX.segsLonge : FORMA_CX.segs, prof = num(k.prof, e.profInterna), topo = [num(k.x, 0), num(k.y, 0), num(k.z, 0)];
    var yF = topo[1] - prof;   /* o FUNDO interno (a berma assenta nele) */
    var mP = new H.Malha(), mF = new H.Malha(), mT = new H.Malha(), mB = new H.Malha(), mFe = new H.Malha(), mPx = new H.Malha(), avisos = e.avisos.slice(), portas = [];
    /* o rumo da SAÍDA (o tubo mais baixo): a canaleta e a caixa alinhadas com ele */
    var lig = (ligados || []).filter(function (l) { return l && l.dir && Math.abs(l.dir[1]) < 0.9; });   // hid:ok tubo vertical não é boca radial
    var saida = lig.slice().sort(function (a, b) { return num((a.ponto || {}).y, 0) - num((b.ponto || {}).y, 0); })[0];
    var eX = saida ? norm2([saida.dir[0], 0, saida.dir[2]]) : [1, 0, 0], eZ = [-eX[2], 0, eX[0]];
    var rS = (saida ? num(saida.dn, FORMA_CX.dnSemTubo) : FORMA_CX.dnSemTubo) * MM / 2;
    var yInv = saida && saida.ponto ? num(saida.ponto.y, yF) - rS : yF + FORMA_CX.calha;
    var hb = Math.max(FORMA_CX.calhaMin, yInv - yF) + rS;   /* o topo da berma = o eixo do tubo de saída */
    var hParede = prof - et;   /* do fundo interno até a laje da tampa */
    var nA = longe ? FORMA_CX.arcoLonge : FORMA_CX.arco, sb;
    if (e.forma === "prismatica") {
      var L1 = e.lado, L2 = e.lado2, hp = (hParede + ef) / 2, yc = yF - ef + hp;
      /* as duas paredes do rumo da saída passam por fora das outras duas */
      [1, -1].forEach(function (s) { H.caixaM(mP, [topo[0] + eX[0] * s * (L1 / 2 + ep / 2), yc, topo[2] + eX[2] * s * (L1 / 2 + ep / 2)], [eX, Y, eZ], [ep / 2, hp, L2 / 2 + ep]); });
      [1, -1].forEach(function (s) { H.caixaM(mP, [topo[0] + eZ[0] * s * (L2 / 2 + ep / 2), yc, topo[2] + eZ[2] * s * (L2 / 2 + ep / 2)], [eX, Y, eZ], [L1 / 2, hp, ep / 2]); });
      H.caixaM(mF, [topo[0], yF - ef / 2, topo[2]], [eX, Y, eZ], [L1 / 2 + ep, ef / 2, L2 / 2 + ep]);
      H.caixaM(mT, [topo[0], topo[1] - et / 2, topo[2]], [eX, Y, eZ], [L1 / 2 + ep, et / 2, L2 / 2 + ep]);
      sb = secaoBerma(L2, hb, rS, nA);
      solidoSecoes(mB, [topo[0], yF, topo[2]], eX, eZ, Y, [-L1 / 2, L1 / 2], [sb.topo, sb.topo]);
    } else {
      var R = e.diam / 2, ht = e.tampaComp && e.tampaComp.h ? e.tampaComp.h : et;
      H.varrer(mP, H.reta([topo[0], yF - ef, topo[2]], Y), escala([[0, R / MM], [0, (R + ep) / MM], [(hParede + ef) / MM, (R + ep) / MM], [(hParede + ef) / MM, R / MM]]), seg, true);   /* oco: o laço no sentido do tubo (faces para fora) */
      H.varrer(mF, H.reta([topo[0], yF - ef, topo[2]], Y), escala([[0, 0], [0, (R + ep) / MM], [ef / MM, (R + ep) / MM], [ef / MM, 0]]), seg, false);
      H.varrer(mT, H.reta([topo[0], topo[1] - ht, topo[2]], Y), escala([[0, 0], [0, (R + ep) / MM], [ht / MM, (R + ep) / MM], [ht / MM, 0]]), seg, false);
      /* a berma: seções ao longo da saída, cada uma com a CORDA do círculo naquela estação (a canaleta cabe inteira) */
      var rC = rS / FORMA_CX.margemCanal, xm = Math.sqrt(Math.max(0, R * R - rC * rC)), nX = longe ? FORMA_CX.estacoesLonge : FORMA_CX.estacoes, xs = [], secs = [];
      for (var ix = 0; ix <= nX; ix++) { var xx = -xm + 2 * xm * ix / nX; xs.push(xx); sb = secaoBerma(2 * Math.sqrt(Math.max(rC * rC, R * R - xx * xx)), hb, rS, nA); secs.push(sb.topo); }
      solidoSecoes(mB, [topo[0], yF, topo[2]], eX, eZ, Y, xs, secs);
    }
    if (e.tampa !== "ferro") {
      /* a TAMPA DE CONCRETO com os dois PUXADORES (pedido do Rogério, 18/10/2026: a caixa como na obra — a tampa pré-moldada
         tem as alças de vergalhão para levantar), EMBUTIDOS: a barra aflora na face da tampa, que fica rente ao piso */
      var meioT = e.forma === "prismatica" ? Math.min(e.lado, e.lado2) / 2 + ep : e.diam / 2 + ep, bt = FORMA_CX.puxBitola / 2, cA = FORMA_CX.puxComp / 2;
      [1, -1].forEach(function (sg) {
        H.caixaM(mPx, [topo[0] + eZ[0] * sg * meioT * FORMA_CX.puxPos, topo[1] + FORMA_CX.puxSai - bt, topo[2] + eZ[2] * sg * meioT * FORMA_CX.puxPos], [eX, Y, eZ], [cA, bt, bt]);
      });
    }
    if (e.tampa === "ferro") {   /* o tampão de ferro fundido (Ø da composição da tampa) rente ao piso, com o aro */
      var Rf = (e.tampaComp && e.tampaComp.diam ? e.tampaComp.diam : (e.diam || Math.min(e.lado, e.lado2))) / 2, hT = FORMA_CX.tampao + FORMA_CX.saliencia;
      H.varrer(mFe, H.reta([topo[0], topo[1] - FORMA_CX.tampao, topo[2]], Y), escala([[0, 0], [0, (Rf + FORMA_CX.aro) / MM], [hT / MM, (Rf + FORMA_CX.aro) / MM], [hT / MM, 0]]), seg, false);
    }
    /* as BOCAS: o tubo para na face de DENTRO da parede (portas → recuo do tubo) */
    (ligados || []).forEach(function (l) {
      var dir = l.dir || [1, 0, 0], dh = norm2([dir[0], 0, dir[2]]); if (Math.abs(dir[1]) > 0.9) return;   // hid:ok tubo vertical não é boca radial
      var rec = e.forma === "prismatica" ? Math.min(e.lado / 2 / Math.max(EPS, Math.abs(dh[0] * eX[0] + dh[2] * eX[2])), e.lado2 / 2 / Math.max(EPS, Math.abs(dh[0] * eZ[0] + dh[2] * eZ[2]))) : e.diam / 2;
      portas.push({ trecho: l.trecho, lado: l.lado, raio: rec, centro: topo });
      var pt = l.ponto || {}; if (num(pt.y, yF) - num(l.dn, 0) * MM / 2 < yF - EPS) avisos.push("o tubo " + l.trecho + " chega abaixo do fundo da caixa: aprofunde a caixa");
    });
    var partes = [{ papel: "corpo", malha: mP }, { papel: "corpo", malha: mF }, { papel: "corpo", malha: mB }, { papel: "tampaConcreto", malha: mT }];
    if (mFe.idx.length) partes.push({ papel: "ferro", malha: mFe });
    if (mPx.idx.length) partes.push({ papel: "puxador", malha: mPx });
    var Dd = DC() || {}, SN = Dd.sinapi || {};
    return { partes: partes.filter(function (p) { return p.malha.idx.length; }), extras: [], portas: portas, avisos: avisos, aConferir: true, tipoCaixa: t,
             compra: e.linhas.map(function (l) { return { codigo: l.codigo, descricao: l.descricao, qtd: 1, obs: "composição SINAPI" }; }),
             cotas: { forma: e.forma, lado: e.lado, lado2: e.lado2, diam: e.diam, prof_m: prof, profComposicao: e.profInterna, parede: ep, fundo: ef, tampa: et, composicao: e.composicao.codigo, tampaMaterial: e.tampa, canaleta: { raio: rS, topoBerma: hb } },
             fontes: ["SINAPI " + SN.uf + " " + SN.mes + ": " + e.linhas.map(function (l) { return l.codigo; }).join(" + ") + " (dimensões da descrição oficial)", "espessuras de desenho: " + (ds.obs || "")] };
  }
  /* forma de DESENHO do poço de visita (não é cota de norma nem de composição) */
  var FORMA_PV = {
    degrauLarg: 0.30,      // hid:ok largura do degrau (desenho)
    degrauSai: 0.12,       // hid:ok quanto o degrau sai da parede (desenho)
    degrauEsp: 0.025,      // hid:ok espessura do degrau (desenho)
    degrauPrimeiro: 0.40   // hid:ok o primeiro degrau acima do fundo (desenho)
  };
  /* o POÇO DE VISITA: fundo, balão (oco), berma com a meia-cana no rumo da saída, laje de redução com o furo da chaminé,
     chaminé (oca) até o piso/terreno, tampão de ferro fundido rente ao piso e os degraus (5.1.5.3 c) */
  function geoPV(k, ligados, o) {
    o = o || {};
    var H = G(); if (!H || !k) return null;
    var e = escolherPV(tipoDe(k), num(k.prof, 0)); if (!e) return null;
    var ds = e.desenho || {}, ep = num(ds.parede_m, 0), ec = num(ds.chamine_parede_m, ep), ef = num(ds.fundo_m, 0), laje = e.laje, longe = o.lod === "longe";
    var Y = [0, 1, 0], seg = longe ? FORMA_CX.segsLonge : FORMA_CX.segs, prof = e.prof, topo = [num(k.x, 0), num(k.y, 0), num(k.z, 0)];
    var yF = topo[1] - prof, R = e.diam / 2, rc = num(e.chamine.diam, 0) / 2 || R, yB = yF + e.balao, yL = yB + laje;
    var mP = new H.Malha(), mF = new H.Malha(), mB = new H.Malha(), mL = new H.Malha(), mC = new H.Malha(), mFe = new H.Malha(), mD = new H.Malha(), avisos = e.avisos.slice(), portas = [];
    var lig = (ligados || []).filter(function (l) { return l && l.dir && Math.abs(l.dir[1]) < 0.9; });   // hid:ok tubo vertical não é boca radial
    var saida = lig.slice().sort(function (a, b) { return num((a.ponto || {}).y, 0) - num((b.ponto || {}).y, 0); })[0];
    var eX = saida ? norm2([saida.dir[0], 0, saida.dir[2]]) : [1, 0, 0], eZ = [-eX[2], 0, eX[0]];
    var rS = (saida ? num(saida.dn, FORMA_CX.dnSemTubo) : FORMA_CX.dnSemTubo) * MM / 2;
    var yInv = saida && saida.ponto ? num(saida.ponto.y, yF) - rS : yF + FORMA_CX.calha;
    var hb = Math.max(FORMA_CX.calhaMin, yInv - yF) + rS, nA = longe ? FORMA_CX.arcoLonge : FORMA_CX.arco;
    /* balão e fundo */
    H.varrer(mP, H.reta([topo[0], yF - ef, topo[2]], Y), escala([[0, R / MM], [0, (R + ep) / MM], [(e.balao + ef) / MM, (R + ep) / MM], [(e.balao + ef) / MM, R / MM]]), seg, true);
    H.varrer(mF, H.reta([topo[0], yF - ef, topo[2]], Y), escala([[0, 0], [0, (R + ep) / MM], [ef / MM, (R + ep) / MM], [ef / MM, 0]]), seg, false);
    /* a berma com a meia-cana (a mesma da caixa circular) */
    var rC = rS / FORMA_CX.margemCanal, xm = Math.sqrt(Math.max(0, R * R - rC * rC)), nX = longe ? FORMA_CX.estacoesLonge : FORMA_CX.estacoes, xs = [], secs = [];
    for (var ix = 0; ix <= nX; ix++) { var xx = -xm + 2 * xm * ix / nX; xs.push(xx); secs.push(secaoBerma(2 * Math.sqrt(Math.max(rC * rC, R * R - xx * xx)), hb, rS, nA).topo); }
    solidoSecoes(mB, [topo[0], yF, topo[2]], eX, eZ, Y, xs, secs);
    /* laje de redução (anel: o furo é a chaminé) e a chaminé oca até o piso */
    H.varrer(mL, H.reta([topo[0], yB, topo[2]], Y), escala([[0, rc / MM], [0, (R + ep) / MM], [laje / MM, (R + ep) / MM], [laje / MM, rc / MM]]), seg, true);
    if (e.chamine.h > EPS) H.varrer(mC, H.reta([topo[0], yL, topo[2]], Y), escala([[0, rc / MM], [0, (rc + ec) / MM], [e.chamine.h / MM, (rc + ec) / MM], [e.chamine.h / MM, rc / MM]]), seg, true);
    /* tampão de ferro fundido (Ø da composição) rente ao piso, com o aro */
    var Rf = (e.tampaComp && e.tampaComp.diam ? e.tampaComp.diam : rc * 2) / 2, hT = FORMA_CX.tampao + FORMA_CX.saliencia;
    H.varrer(mFe, H.reta([topo[0], topo[1] - FORMA_CX.tampao, topo[2]], Y), escala([[0, 0], [0, (Rf + FORMA_CX.aro) / MM], [hT / MM, (Rf + FORMA_CX.aro) / MM], [hT / MM, 0]]), seg, false);
    /* DEGRAUS (5.1.5.3 c): no lado oposto à saída — no balão, na parede; na chaminé, na parede dela */
    var passo = num(ds.degrau_passo_m, 0), nDeg = 0;
    if (passo > EPS) for (var yd = yF + Math.max(hb, FORMA_PV.degrauPrimeiro); yd < topo[1] - passo / 2; yd += passo) {
      var rr = yd < yB ? R : (yd < yL ? null : rc); if (rr == null) continue;
      var c0 = [topo[0] - eX[0] * (rr - FORMA_PV.degrauSai / 2), yd, topo[2] - eX[2] * (rr - FORMA_PV.degrauSai / 2)];
      H.caixaM(mD, c0, [eX, Y, eZ], [FORMA_PV.degrauSai / 2, FORMA_PV.degrauEsp / 2, FORMA_PV.degrauLarg / 2]); nDeg++;
    }
    (ligados || []).forEach(function (l) {
      var dir = l.dir || [1, 0, 0]; if (Math.abs(dir[1]) > 0.9) return;   // hid:ok tubo vertical não é boca radial
      portas.push({ trecho: l.trecho, lado: l.lado, raio: R, centro: topo });
      var pt = l.ponto || {}; if (num(pt.y, yF) - num(l.dn, 0) * MM / 2 < yF - EPS) avisos.push("o tubo " + l.trecho + " chega abaixo do fundo do poço de visita: aprofunde o PV");
      if (num(pt.y, yF) + num(l.dn, 0) * MM / 2 > yB + EPS) avisos.push("o tubo " + l.trecho + " chega acima do balão (na laje/chaminé): rebaixe o tubo ou aprofunde o PV");
    });
    var partes = [{ papel: "corpo", malha: mP }, { papel: "corpo", malha: mF }, { papel: "corpo", malha: mB }, { papel: "corpo", malha: mL }, { papel: "corpo", malha: mC }, { papel: "ferro", malha: mFe }, { papel: "ferro", malha: mD }];
    var Dd = DC() || {}, SN = Dd.sinapi || {};
    return { partes: partes.filter(function (p) { return p.malha.idx.length; }), extras: [], portas: portas, avisos: avisos, aConferir: true, tipoCaixa: tipoDe(k), pv: true,
             compra: e.linhas.map(function (l) { return { codigo: l.codigo, descricao: l.descricao, qtd: l.qtd, unidade: l.unidadeQto, obs: "composição SINAPI" }; }),
             cotas: { forma: "circular", diam: e.diam, prof_m: prof, balao: e.balao, laje: laje, chamine: e.chamine, parede: ep, fundo: ef, degraus: nDeg, composicao: e.composicao.codigo, tampaMaterial: "ferro", canaleta: { raio: rS, topoBerma: hb } },
             fontes: ["SINAPI " + SN.uf + " " + SN.mes + ": " + e.linhas.map(function (l) { return l.codigo + " × " + l.qtd + " " + l.unidadeQto; }).join(" + ") + " (Ø e profundidade da descrição oficial)",
                      "NBR 8160:1999 5.1.5.3 (p.19) pelo HidNormas es.poco_visita", "espessuras e degraus de desenho: " + (ds.obs || "")] };
  }
  function geo(k, ligados, o) { if (ehPV(num(k && k.prof, 0))) { var g = geoPV(k, ligados, o); if (g) return g; } return tipoDe(k) === "pvc300" ? geoPvc(k, ligados, o) : geoCaixa(k, ligados, o); }

  var HidCI = { VERSAO: 3, // hid:ok versão do motor
                FORMA: FORMA, FORMA_CX: FORMA_CX, FORMA_PV: FORMA_PV, geo: geo, geoPvc: geoPvc, geoCaixa: geoCaixa, geoPV: geoPV, ehPV: ehPV, escolherPV: escolherPV, normaPV: normaPV, composicao: composicao, ficha: D300,
                tipoDe: tipoDe, tampaDe: tampaDe, escolher: escolher, dims: dims, orcamento: orcamento, TIPOS: TIPOS_CAIXA, _int: { secaoBerma: secaoBerma, solidoSecoes: solidoSecoes } };
  global.HidCI = HidCI;
  if (typeof module !== "undefined" && module.exports) module.exports = HidCI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
