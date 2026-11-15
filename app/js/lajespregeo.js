/* =====================================================================
 * lajespregeo.js — GEOMETRIA DA LAJE PRÉ-FABRICADA PARA O BIM (14/11/2026). Motor PURO (ES5), Node-testável.
 *
 * A laje sai do modelo com PEÇAS REAIS, não com uma caixa única: vigota (base de concreto), enchimento (EPS ou cerâmica), nervuras de
 * concreto moldado no local e capa. Desenho = orçamento: o volume de cada peça é o da geometria que o 3D mostra.
 *
 * ENTRADA  gerar({ serieId | serie, comprimentoM, larguraM, direcao:"x"|"z", origem:{x,y,z}, detalharTrelica, cobrimentoBanzoM })
 *            comprimentoM = ao longo das vigotas ; larguraM = perpendicular (onde se repete o intereixo)
 *            direcao      = eixo ao longo do qual correm as nervuras ("x" ou "z"); y = vertical, origem na FACE INFERIOR do canto mín.
 * SAÍDA    { ok, pecas:[{ id, papel, forma:"caixa", x, y, z, dx, dy, dz, material, volumeM3, celula }], resumo, avisos, assumidos }
 *            convenção das famílias (js/familiasra.js): x e z = CENTRO da caixa; y = BASE da caixa; dx, dy, dz = dimensões.
 *
 * COMO A LAJE É REPARTIDA (modelo de células)
 *   n = ceil(larguraM / intereixo); intereixo efetivo = larguraM / n (≤ nominal; nunca maior). Cada célula tem a vigota no CENTRO,
 *   a nervura moldada no local sobre ela e meia peça de enchimento em cada lado; as meias peças vizinhas formam a peça inteira, e nas
 *   duas bordas da laje ficam meias peças (cortadas). A largura da nervura é a nominal (intereixo − largura do enchimento): quem
 *   encolhe é o enchimento, nunca a nervura (que já está no mínimo da NBR 14859-1:2002, 5.4).
 *   ⚠ O que a fonte NÃO diz (posição da vigota junto à viga de borda, largura da lajota quando o fabricante não informa) é MODELAGEM
 *   da RA e sai em `assumidos`.
 *
 * PONTO DE FIAÇÃO NO BIM (não feito aqui — js/bim.js não foi tocado): ver o fim deste arquivo.
 * Testes: node tools/test-lajespre.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var LP = dep("LajesPre", "./lajespre.js");
  var D = dep("LajesPreDados", "./lajespredados.js");
  var EPS = 1e-9;
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function MAT(ench) { return ench === "eps" ? "EPS" : "Cerâmica"; }

  function gerar(par) {
    par = par || {};
    var out = { ok: false, pecas: [], resumo: {}, avisos: [], assumidos: [] };
    if (!LP || !D) { out.motivo = "catálogo não carregado (js/lajespre.js, js/lajespredados.js)"; return out; }
    var s = par.serie || LP.serie(par.serieId);
    if (!s) { out.motivo = "série \"" + par.serieId + "\" não existe"; return out; }
    if (s.tabela && s.tabela.tipo === "vao-maximo-por-painel") { out.motivo = "laje alveolar: a geometria por painel ainda não foi feita (só catálogo e tabela)"; return out; }
    var L = num(par.comprimentoM, NaN), W = num(par.larguraM, NaN);
    if (!(L > 0) || !(W > 0)) { out.motivo = "informe comprimentoM e larguraM (> 0)"; return out; }
    var dir = par.direcao === "z" ? "z" : "x";
    var o = par.origem || {}, ox = num(o.x, 0), oy = num(o.y, 0), oz = num(o.z, 0);
    var g = LP.geometria(s); out.assumidos = g.assumidos.slice();
    if (!(g.i > 0) || !(g.hEnch > 0) || !(g.hCapa > 0)) { out.motivo = "série sem intereixo/enchimento/capa"; return out; }
    var n = Math.max(1, Math.ceil(W / g.i - 1e-9)), iEf = W / n, wEf = g.wEnch - (g.i - iEf), nerv = g.nervura;
    var hB = g.hBase, hE = g.hEnch, hC = g.hCapa, bv = g.bv;
    if (wEf <= 0.01) { out.motivo = "a largura da laje (" + W + " m) deixa o enchimento sem largura (intereixo efetivo " + r6(iEf) + " m)"; return out; }
    if (n > 1 && iEf < g.i - 0.01) out.avisos.push("largura " + W + " m não é múltipla do intereixo " + g.i + " m: intereixo efetivo " + r6(iEf) + " m (enchimento " + Math.round((g.i - iEf) * 1000) / 10 + " cm mais estreito)");
    var degrau = g.wEnch > g.i - bv + EPS;   /* o enchimento é mais largo que o vão entre as bases das vigotas: apoia nas abas da base */
    var gap = iEf - bv;                      /* vão livre entre as bases de duas vigotas vizinhas */
    var mat = MAT(s.enchimento);

    /* conversão (a, b, c) do plano da laje para o espaço: u = ao longo das vigotas, v = através */
    function P(id, papel, u0, u1, v0, v1, y0, y1, material, celula) {
      var du = u1 - u0, dv = v1 - v0, dy = y1 - y0;
      if (du <= EPS || dv <= EPS || dy <= EPS) return;
      var uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, p = { id: id, papel: papel, forma: "caixa", y: r6(oy + y0), dy: r6(dy), material: material, celula: celula };
      if (dir === "x") { p.x = r6(ox + uc); p.z = r6(oz + vc); p.dx = r6(du); p.dz = r6(dv); }
      else { p.x = r6(ox + vc); p.z = r6(oz + uc); p.dx = r6(dv); p.dz = r6(du); }
      p.volumeM3 = r6(du * dv * dy);
      out.pecas.push(p);
    }
    var k, c, v0, v1, vigotaCentro;
    /* vigotas e nervuras */
    for (k = 0; k < n; k++) {
      vigotaCentro = iEf * (k + 0.5);
      P("vigota-" + (k + 1), "vigota", 0, L, vigotaCentro - bv / 2, vigotaCentro + bv / 2, 0, hB, "Concreto", k + 1);
      P("nervura-" + (k + 1), "nervura", 0, L, vigotaCentro - nerv / 2, vigotaCentro + nerv / 2, hB, hE, "Concreto", k + 1);
      if (nerv > bv + EPS) {   /* nervura mais larga que a base: concreto moldado no local ao lado da base, até o fundo */
        P("nervura-pe-e-" + (k + 1), "nervura", 0, L, vigotaCentro - nerv / 2, vigotaCentro - bv / 2, 0, hB, "Concreto", k + 1);
        P("nervura-pe-d-" + (k + 1), "nervura", 0, L, vigotaCentro + bv / 2, vigotaCentro + nerv / 2, 0, hB, "Concreto", k + 1);
      }
    }
    /* enchimento: n+1 vãos (as 2 bordas com meia peça); o corpo em cima, o pé estreito embaixo quando há degrau */
    for (k = 0; k <= n; k++) {
      var cxv = iEf * k;                       /* eixo da fronteira entre células (onde a peça inteira é centrada) */
      v0 = Math.max(0, cxv - wEf / 2); v1 = Math.min(W, cxv + wEf / 2);
      var ncel = k;                            /* 0 = borda inicial, n = borda final */
      if (degrau) {
        P("enchimento-corpo-" + (k + 1), "enchimento", 0, L, v0, v1, hB, hE, mat, ncel);
        P("enchimento-pe-" + (k + 1), "enchimento", 0, L, Math.max(0, cxv - gap / 2), Math.min(W, cxv + gap / 2), 0, hB, mat, ncel);
      } else P("enchimento-" + (k + 1), "enchimento", 0, L, v0, v1, 0, hE, mat, ncel);
    }
    /* capa */
    P("capa", "capa", 0, L, 0, W, hE, hE + hC, "Concreto", 0);

    /* treliça (opcional): banzo superior e 2 inferiores; posições dos fios NÃO constam das fontes → assumidas */
    var tr = s.trelica && D.trelicas[s.trelica];
    if (par.detalharTrelica && tr) {
      var cob = num(par.cobrimentoBanzoM, 0.015), esp = num(par.espacamentoBanzosInferioresM, 0.08);
      out.assumidos.push("treliça: cobrimento inferior do banzo " + cob * 100 + " cm e distância entre os banzos inferiores " + esp * 100 + " cm (as fontes não informam: modelagem da RA)");
      var hT = tr.hMm / 1000, dS = tr.banzoSup / 1000, dI = tr.banzoInf / 1000;
      for (k = 0; k < n; k++) {
        vigotaCentro = iEf * (k + 0.5);
        P("trelica-sup-" + (k + 1), "trelica", 0, L, vigotaCentro - dS / 2, vigotaCentro + dS / 2, cob + hT - dS, cob + hT, "Aço", k + 1);
        P("trelica-infe-" + (k + 1), "trelica", 0, L, vigotaCentro - esp / 2 - dI / 2, vigotaCentro - esp / 2 + dI / 2, cob, cob + dI, "Aço", k + 1);
        P("trelica-infd-" + (k + 1), "trelica", 0, L, vigotaCentro + esp / 2 - dI / 2, vigotaCentro + esp / 2 + dI / 2, cob, cob + dI, "Aço", k + 1);
      }
      if (cob + hT > hE + hC - 0.02 + EPS) out.avisos.push("o banzo superior da treliça (" + r6(cob + hT) + " m) fica a menos de 2 cm do topo da laje (" + r6(hE + hC) + " m)");
      if (cob + hT < hE - EPS) out.avisos.push("o banzo superior da treliça (" + r6(cob + hT) + " m) não chega à capa (começa em " + r6(hE) + " m): a vigota não fica solidarizada");
    }

    /* resumo: volumes por papel e totais */
    var vol = { vigota: 0, nervura: 0, enchimento: 0, capa: 0, trelica: 0 };
    out.pecas.forEach(function (p) { vol[p.papel] += p.volumeM3; });
    Object.keys(vol).forEach(function (kk) { vol[kk] = r6(vol[kk]); });
    out.resumo = { serieId: s.id, designacao: s.designacao, fonte: LP.fonteTxt(s), direcao: dir, comprimentoM: L, larguraM: W, areaM2: r6(L * W), nVigotas: n, intereixoEfetivoM: r6(iEf), larguraEnchimentoEfetivaM: r6(wEf),
      hTotalM: r6(hE + hC), degrau: degrau, volumesM3: vol, concretoNoLocalM3: r6(vol.nervura + vol.capa), concretoPrefabricadoM3: vol.vigota,
      concretoNoLocalLM2: r6((vol.nervura + vol.capa) / (L * W) * 1000), pecasEnchimento: (g.comprEnch ? n_pecas(L, W, iEf, wEf, g.comprEnch, n) : null), vigotasMetros: r6(n * L) };
    var av = LP.avisosNorma({ vaoM: L, areaM2: L * W });   /* o vão das vigotas é o comprimento */
    av.forEach(function (a) { out.avisos.push(a.texto); });
    LP.verificarNorma(s).forEach(function (a) { out.avisos.push(a); });
    out.ok = true;
    return out;
  }
  /* peças de enchimento: n−1 inteiras + 2 meias = n inteiras na largura × (L / comprimento da peça) */
  function n_pecas(L, W, iEf, wEf, comp, n) { return r6(n * (L / comp)); }

  global.LajesPreGeo = { gerar: gerar, versao: 1 };
  if (typeof module !== "undefined" && module.exports) module.exports = global.LajesPreGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * PONTO DE FIAÇÃO NO 3D (a fazer pela sessão principal, depois dos pilares — NÃO mexi em js/bim.js)
 *   1. Carregar, nesta ordem, em index.html: js/lajespredados.js, js/lajespre.js, js/lajespregeo.js, js/familiaslajepre.js
 *      (o último registra a família "ra-laje-pre" em FamiliasRA: aparece na biblioteca de famílias e os TIPOS já vêm do catálogo).
 *   2. O comando de lançar laje (onde hoje nasce a caixa de laje maciça — BimEdit.laje, js/bimedit* / bim.js): quando o tipo escolhido for
 *      "Laje pré-fabricada", chamar LajesPreGeo.gerar({ serieId, comprimentoM, larguraM, direcao, origem:{x,y,z} }) e criar UMA op "lote"
 *      (como js/bimestrut.js opsTrelica) com uma caixa por peça de `pecas` (papel → material: vigota/nervura/capa = Concreto, enchimento = EPS
 *      ou Cerâmica), todas com a marca c.lajePre = { id, serie, papel } para o Ctrl+Z desfazer tudo e para o orçamento somar por papel.
 *   3. Orçamento: o quantitativo vem de LajesPre.quantitativos(serie, par) (por m²) — vigotas (m), enchimento (peças ou m³), capa (m³),
 *      concreto no local, aço da treliça e armadura adicional — e a linha "laje pré-fabricada" do orçamento guarda o fabricante/série/página.
 * ===================================================================== */
