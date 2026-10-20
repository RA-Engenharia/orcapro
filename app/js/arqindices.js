/* =====================================================================
 * arqindices.js — ÍNDICES URBANÍSTICOS DO PROJETO (motor PURO, ES5, Node-testável).
 *
 *   ArqIndices.calcular(dados, opcoes) → {
 *     ok, terreno: { area, fonte, contorno },
 *     areas: { existente, demolir, construir, total },        área construída (m²), por status da fase de agora
 *     porPavimento: [{ pav, nome, existente, demolir, construir, total }],
 *     projecao: { existente, antes, depois, foraDoLote },     m² de projeção da edificação (ocupação)
 *     permeavel: { area, regioes: [{ rotulo, area, fator, origem }] },
 *     ocupacaoPct, permeavelPct, aproveitamento,              taxa de ocupação %, taxa de permeabilidade %, coeficiente de aproveitamento
 *     antes: { ocupacaoPct, aproveitamento },                 o mesmo na situação existente (antes da reforma)
 *     recuos: [{ lado, nome, de, para, comprimento, recuo, recuoCobertura }],
 *     limites, verificacao: [{ indice, rotulo, valor, limite, op, atende, texto }], avisos }
 *   dados = ArqModelo.extrair(...)        (js/arqmodelo.js)
 *   opcoes = { contornoLote: [[x, z]…] | [{x, z}…], areaTerreno, limites: { nome, ocupacaoMax, permeavelMin, aproveitamentoMax, conferir },
 *              permeaveis: [{ rotulo, pts | ambienteId | subregiaoId, fator }], fatores: { deckVazado }, beiralNaProjecao, frente (índice do lado da divisa) }
 *   ArqIndices.limitesDe(chave)  → limites de um município (tabela abaixo) ou o objeto vazio "informe os limites"
 *
 * REGRAS (cada uma vira número, então está escrita):
 *   ÁREA CONSTRUÍDA = por pavimento, a UNIÃO de paredes + pilares + ambientes + lajes de piso da mesma
 *     classe de fase; "existente" (a manter), "demolir" (a demolir), "construir" (novo) e TOTAL = existente ∪ construir.
 *     Soma dos pavimentos. Muro não entra. Área de varanda/garagem coberta sem parede: modele a laje (piso).
 *   PROJEÇÃO (ocupação) = união, em planta, de tudo o que está de pé depois da reforma (existente ∪ novo):
 *     paredes, pilares, ambientes, lajes e o contorno do telhado (com `beiralNaProjecao` o beiral também).
 *     Ambiente permeável (grama, jardim…) não entra na projeção nem na área construída.
 *   PERMEÁVEL = solo natural descoberto dentro do lote: sub-região do terreno com material permeável (grama, jardim, canteiro,
 *     terra), ambiente marcado (piso/nome) e as regiões informadas, ∩ lote, MENOS o que a projeção cobre, vezes o fator
 *     de cada região (solo 1,00; deck vazado: `fatores.deckVazado`, padrão 1,00 com aviso "conferir na lei").
 *   COEFICIENTE DE APROVEITAMENTO = área construída total ÷ área do terreno.
 *   RECUO = menor distância da edificação (e, à parte, do telhado) a cada lado da divisa.
 * LIMITES: a tabela abaixo traz só EXEMPLOS marcados "conferir na lei" — o motor nunca assume lei de município.
 * Teste: tools/ (índices das pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* limites por município: SÓ exemplo documentado (o motor não assume lei). `conferir: true` aparece na tela. */
  var MUNICIPIOS = {
    uberlandia: { nome: "Uberlândia/MG — LC 812/2026 (exemplo)", ocupacaoMax: 60, permeavelMin: 20, aproveitamentoMax: null, conferir: true,
                  fonte: "Valores de exemplo informados pela RA (taxa de ocupação ≤ 60 %, permeabilidade ≥ 20 %); a lei não foi lida aqui: CONFERIR NA LEI e no zoneamento do lote." }
  };
  var LIMITES_VAZIOS = { nome: "", ocupacaoMax: null, permeavelMin: null, aproveitamentoMax: null, conferir: false, fonte: "Informe os limites do município e do zoneamento do lote." };
  var PERMEAVEL_RE = /(grama|gramado|jardim|canteiro|terra|perme|drenante|vegeta|horta|pomar|solo)/i;
  var DECK_VAZADO_RE = /(deck\s*vazado|vazado)/i;
  var MATERIAL_PERM = /(grama|gramado|jardim|canteiro|terra|solo|vegeta|brita drenante|seixo)/i;

  function limitesDe(chave) {
    if (chave && typeof chave === "object") {
      return { nome: txt(chave.nome), ocupacaoMax: num(chave.ocupacaoMax, null), permeavelMin: num(chave.permeavelMin, null), aproveitamentoMax: num(chave.aproveitamentoMax, null), conferir: !!chave.conferir, fonte: txt(chave.fonte) };
    }
    var m = MUNICIPIOS[txt(chave).toLowerCase()];
    return m ? limitesDe(m) : limitesDe(LIMITES_VAZIOS);
  }

  function paraPts(c) { return arr(c).map(function (q) { return Array.isArray(q) ? [+q[0], +q[1]] : [+q.x, +q.z]; }); }

  /* área de (A ∩ lote) \ B com A, B listas de polígonos: |A∩L| − |A∩L∩B| (inclusão-exclusão exata sobre uniões) */
  function areaMenos(G, A, L, B) {
    var uA = G.uniaoArea(A), uL = G.uniaoArea(L), uB = G.uniaoArea(B);
    var AL = uA + uL - G.uniaoArea(A.concat(L)), AB = uA + uB - G.uniaoArea(A.concat(B)), LB = uL + uB - G.uniaoArea(L.concat(B));
    var tri = G.uniaoArea(A.concat(L, B)) - uA - uL - uB + AL + AB + LB;
    return Math.max(0, AL - tri);
  }

  function nomeLado(i, lados) { return lados.nomes[i] || ("divisa " + (i + 1)); }
  /* a frente = o lado de maior z médio (o de baixo na planta, o sul); o fundo = o paralelo mais distante dela */
  function classificarLados(pts, frente) {
    var n = pts.length, med = [], nomes = [], i;
    for (i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; med.push((a[1] + b[1]) / 2); }
    var f = isFinite(frente) && frente >= 0 && frente < n ? frente : med.indexOf(Math.max.apply(null, med));
    var fa = pts[f], fb = pts[(f + 1) % n], fx = fb[0] - fa[0], fz = fb[1] - fa[1], fL = Math.sqrt(fx * fx + fz * fz) || 1, fundo = -1, dm = -1;
    for (i = 0; i < n; i++) {
      if (i === f) continue;
      var a2 = pts[i], b2 = pts[(i + 1) % n], dx = b2[0] - a2[0], dz = b2[1] - a2[1], L = Math.sqrt(dx * dx + dz * dz) || 1;
      var par = Math.abs((dx * fx + dz * fz) / (L * fL));
      var dist = Math.abs(((a2[0] + b2[0]) / 2 - fa[0]) * (-fz / fL) + ((a2[1] + b2[1]) / 2 - fa[1]) * (fx / fL));
      if (par > 0.9 && dist > dm) { dm = dist; fundo = i; }
    }
    for (i = 0; i < n; i++) nomes.push(i === f ? "frente" : (i === fundo ? "fundos" : "lateral"));
    var cont = { esq: 0, dir: 0 };
    for (i = 0; i < n; i++) if (nomes[i] === "lateral") {
      var a3 = pts[i], b3 = pts[(i + 1) % n], mx = (a3[0] + b3[0]) / 2, cx = 0, k;
      for (k = 0; k < n; k++) cx += pts[k][0]; cx /= n;
      nomes[i] = mx < cx ? "lateral esquerda" : "lateral direita";
    }
    return { frente: f, fundos: fundo, nomes: nomes };
  }

  function calcular(dados, opcoes) {
    var G = GEO(), op = opcoes || {}, d = dados || {}, avisos = [];
    var lim = limitesDe(op.limites || {}), T = d.terreno || {}, dv = T.divisa;
    var lote = null, fonte = "";
    if (arr(op.contornoLote).length >= 3) { lote = paraPts(op.contornoLote); fonte = "contorno informado"; }
    else if (dv && arr(dv.pts).length >= 3) { lote = dv.pts; fonte = "divisa do terreno (" + (dv.nome || dv.id) + ")"; }
    var areaLote = lote ? G.areaPol(lote) : null;
    if (num(op.areaTerreno, 0) > 0) { areaLote = +op.areaTerreno; fonte = lote ? fonte + "; área informada" : "área informada"; }
    if (!(areaLote > 0)) avisos.push("Sem a divisa do lote (op divisa do terreno) nem a área do terreno: as taxas e os recuos não são calculados. Informe o contorno do lote.");

    function st(s) { return function (x) { return x.status === s; }; }
    function pegadas(filtro, comLajeTodas) {
      var L = [];
      arr(d.paredes).filter(function (w) { return !w.muro; }).filter(filtro).forEach(function (w) { L.push({ pts: w.pts, pav: w.pav }); });
      arr(d.pilares).filter(filtro).forEach(function (w) { L.push({ pts: w.pts, pav: w.pav }); });
      arr(d.lajes).filter(filtro).forEach(function (l) { if (l.piso || comLajeTodas) L.push({ pts: l.pts, pav: l.pav }); });
      arr(d.ambientes).filter(filtro).filter(function (a) { return !ambPerm(a); }).forEach(function (a) { L.push({ pts: a.pts, pav: a.pav }); });
      return L;
    }
    function ambPerm(a) {
      var par = a.params || {};
      if (par.permeavel === true || par.permeavel === "true" || par.permeavel === 1 || par.permeavel === "1") return true;
      return PERMEAVEL_RE.test(txt(a.piso)) || PERMEAVEL_RE.test(txt(a.nome)) || DECK_VAZADO_RE.test(txt(a.piso));
    }
    var nPav = Math.max(1, arr(d.pavimentos).length);
    function areaPorPav(lista) {
      var tot = 0, por = [];
      for (var p = 0; p < nPav; p++) {
        var a = G.uniaoArea(lista.filter(function (x) { return (x.pav || 0) === p; }).map(function (x) { return x.pts; }));
        por.push(a); tot += a;
      }
      return { total: tot, por: por };
    }
    var existente = pegadas(st("existente")), demolir = pegadas(st("demolido")), construir = pegadas(st("novo"));
    var aEx = areaPorPav(existente), aDe = areaPorPav(demolir), aCo = areaPorPav(construir), aTo = areaPorPav(existente.concat(construir));
    var areas = { existente: r2(aEx.total), demolir: r2(aDe.total), construir: r2(aCo.total), total: r2(aTo.total) };
    var porPavimento = [];
    for (var p = 0; p < nPav; p++) porPavimento.push({ pav: p, nome: (arr(d.pavimentos)[p] || {}).nome || "Térreo", existente: r2(aEx.por[p]), demolir: r2(aDe.por[p]), construir: r2(aCo.por[p]), total: r2(aTo.por[p]) });

    /* PROJEÇÃO (ocupação): tudo de pé, em qualquer nível, mais o telhado */
    function projecao(filtro, comTelhado) {
      var L = pegadas(filtro, true).map(function (x) { return x.pts; });
      if (comTelhado) arr(d.telhados).filter(filtro).forEach(function (t) { L.push(op.beiralNaProjecao && t.pBeiral ? t.pBeiral : t.pts); });
      return L;
    }
    var final = function (x) { return x.status === "existente" || x.status === "novo"; };
    var antes = function (x) { return x.status === "existente" || x.status === "demolido"; };
    var projF = projecao(final, true), projA = projecao(antes, true), projE = projecao(st("existente"), true);
    var aProjF = G.uniaoArea(projF), aProjA = G.uniaoArea(projA), aProjE = G.uniaoArea(projE);
    var fora = lote ? Math.max(0, aProjF - (aProjF + G.uniaoArea([lote]) - G.uniaoArea(projF.concat([lote])))) : 0;
    if (fora > 0.005) avisos.push("Parte da edificação (" + r2(fora).toString().replace(".", ",") + " m²) está FORA da divisa do lote: confira o contorno do lote e as paredes.");
    if (op.beiralNaProjecao !== true && arr(d.telhados).some(function (t) { return t.beiral > 0; })) avisos.push("A projeção usa o contorno do telhado SEM o beiral; se a lei do município conta o beiral, ligue 'beiralNaProjecao'.");

    /* PERMEÁVEL */
    var regioes = [];
    arr(T.subregioes).forEach(function (s) {
      if (MATERIAL_PERM.test(txt(s.material)) || PERMEAVEL_RE.test(txt(s.nome))) regioes.push({ rotulo: s.nome || ("Sub-região " + s.id) + " (" + (s.material || "?") + ")", pts: s.pts, fator: 1, origem: "terreno" });
    });
    arr(d.ambientes).forEach(function (a) {
      if (!ambPerm(a)) return;
      var deck = DECK_VAZADO_RE.test(txt(a.piso));
      regioes.push({ rotulo: a.nome + (a.piso ? " (" + a.piso + ")" : ""), pts: a.pts, fator: deck ? num(op.fatores && op.fatores.deckVazado, 1) : 1, origem: "ambiente", deck: deck });
    });
    arr(op.permeaveis).forEach(function (r) {
      var pts = arr(r.pts).length ? paraPts(r.pts) : null;
      if (!pts && r.ambienteId != null) arr(d.ambientes).forEach(function (a) { if (a.id === String(r.ambienteId)) pts = a.pts; });
      if (!pts && r.subregiaoId != null) arr(T.subregioes).forEach(function (s) { if (s.id === String(r.subregiaoId)) pts = s.pts; });
      if (pts && pts.length >= 3) regioes.push({ rotulo: txt(r.rotulo) || "Região permeável", pts: pts, fator: num(r.fator, 1), origem: "informada" });
    });
    if (regioes.some(function (r) { return r.deck; })) avisos.push("Deck vazado contado como permeável com fator " + String(num(op.fatores && op.fatores.deckVazado, 1)).replace(".", ",") + ": conferir na lei do município.");
    var permArea = 0, permReg = [];
    regioes.forEach(function (r) {
      var a = lote ? areaMenos(G, [r.pts], [lote], projF) : 0;
      permReg.push({ rotulo: r.rotulo, area: r2(a), fator: r.fator, origem: r.origem, util: r2(a * r.fator) });
      permArea += a * r.fator;
    });
    /* regiões que se sobrepõem entre si seriam contadas duas vezes */
    if (regioes.length > 1) {
      var soma = 0; regioes.forEach(function (r) { soma += G.areaPol(r.pts); });
      if (soma - G.uniaoArea(regioes.map(function (r) { return r.pts; })) > 0.01) avisos.push("Há regiões permeáveis que se sobrepõem: a área permeável pode estar contada em dobro.");
    }

    var out = { ok: true, terreno: { area: areaLote != null ? r2(areaLote) : null, fonte: fonte, contorno: lote }, areas: areas, porPavimento: porPavimento,
      projecao: { existente: r2(aProjE), antes: r2(aProjA), depois: r2(aProjF), foraDoLote: r2(fora) }, permeavel: { area: r2(permArea), regioes: permReg },
      limites: lim, avisos: avisos, ocupacaoPct: null, permeavelPct: null, aproveitamento: null, antes: { ocupacaoPct: null, aproveitamento: null }, recuos: [], verificacao: [] };
    if (areaLote > 0) {
      out.ocupacaoPct = r2(aProjF / areaLote * 100); out.permeavelPct = r2(permArea / areaLote * 100); out.aproveitamento = r2(aTo.total / areaLote);
      out.antes = { ocupacaoPct: r2(aProjA / areaLote * 100), aproveitamento: r2((aEx.total + aDe.total) / areaLote) };
    }
    /* RECUOS */
    if (lote) {
      var ed = pegadas(final, true).map(function (x) { return x.pts; }), tel = arr(d.telhados).filter(final).map(function (t) { return t.pBeiral || t.pts; });
      var cls = classificarLados(lote, op.frente), n = lote.length;
      for (var i = 0; i < n; i++) {
        var a = lote[i], b = lote[(i + 1) % n], dxl = b[0] - a[0], dzl = b[1] - a[1], m = Infinity, mt = Infinity;
        ed.forEach(function (P) { var q = G.distPolSeg(P, a, b); if (q < m) m = q; });
        tel.forEach(function (P) { var q = G.distPolSeg(P, a, b); if (q < mt) mt = q; });
        out.recuos.push({ lado: i, nome: cls.nomes[i], de: a, para: b, comprimento: r2(Math.sqrt(dxl * dxl + dzl * dzl)), recuo: m === Infinity ? null : r2(m), recuoCobertura: mt === Infinity ? null : r2(mt) });
      }
      out.ladoFrente = cls.frente; out.ladoFundos = cls.fundos;
    }
    /* VERIFICAÇÃO contra os limites */
    function ver(indice, rotulo, valor, limite, op2, un) {
      var v = { indice: indice, rotulo: rotulo, valor: valor, limite: limite, op: op2, un: un, atende: null, texto: "" };
      if (limite == null) { v.texto = "informe o limite"; }
      else if (valor == null) { v.texto = "sem cálculo"; }
      else { v.atende = op2 === "<=" ? valor <= limite + 1e-9 : valor >= limite - 1e-9; v.texto = v.atende ? "ATENDE" : "NÃO ATENDE"; }
      return v;
    }
    out.verificacao.push(ver("ocupacao", "Taxa de ocupação", out.ocupacaoPct, lim.ocupacaoMax, "<=", "%"));
    out.verificacao.push(ver("permeavel", "Taxa de permeabilidade", out.permeavelPct, lim.permeavelMin, ">=", "%"));
    out.verificacao.push(ver("aproveitamento", "Coeficiente de aproveitamento", out.aproveitamento, lim.aproveitamentoMax, "<=", ""));
    if (!lim.ocupacaoMax && !lim.permeavelMin && !lim.aproveitamentoMax) avisos.push("Limites do município não informados: os índices saem sem a comparação ATENDE / NÃO ATENDE.");
    if (lim.conferir) avisos.push("Limites de EXEMPLO (" + (lim.nome || "município") + "): conferir na lei e no zoneamento do lote antes de protocolar.");
    return out;
  }

  var ArqIndices = { calcular: calcular, limitesDe: limitesDe, MUNICIPIOS: MUNICIPIOS, LIMITES_VAZIOS: LIMITES_VAZIOS, classificarLados: classificarLados, PERMEAVEL_RE: PERMEAVEL_RE, _areaMenos: areaMenos };
  global.ArqIndices = ArqIndices;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqIndices;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
