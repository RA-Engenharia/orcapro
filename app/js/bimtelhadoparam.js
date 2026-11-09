/* =====================================================================
 * bimtelhadoparam.js — TELHADO PARAMÉTRICO (o CONJUNTO), motor PURO (ES5, Node).
 * Frente "telhado-param" (09/11/2026), plano PLANO-TELHADO-PARAMETRICO.md (pasta RA-Equipe, frente orcapro).
 *
 * O que é: o usuário desenha o contorno na planta de cobertura, aponta a aresta onde cai a água (a calha) e o sistema lança, num
 * LOTE (um Ctrl+Z desfaz tudo), o CONJUNTO vinculado:
 *     telhado (modelo "aco-sanduiche-forro", js/bimtelhadoestrut.js)  +  forro hospedado (js/bimforro.js `telhado`)
 *     +  bordas calha / rufo / testeira (js/bimtelhado.js)  +  orçamento (op orcar de cada um).
 * Pilha, de baixo para cima: peças DA OBRA → forro (face de baixo no plano) → terças → telha. A ferramenta NÃO cria viga.
 *
 * O que lê da obra (BimTelhadoParam.lerObra): a altura (o plano é o mais baixo que nenhuma peça fura) e a inclinação (nesta ordem,
 * SEMPRE com a fonte na tela): ajuste das peças sob o tracejado; peça escolhida com "Seguir"; mediana dos telhados da obra; mínima do
 * fabricante.
 *
 * O que NÃO é: dimensionamento do conjunto. SÓ a terça é verificada (motor NBR 14762, biapoiada, isolada). X, correntes além da força da
 * terça, calços, ligações e peças da obra ficam "a conferir pelo cálculo", e o resumo diz isso. A palavra "dimensionada" não aparece.
 *
 * Contrato:
 *   montarLote(estado, { contorno, arestaQueda, tipoId, forroTipoId, amostras, nivel, obra, cliente, v0, inclinacao, inclinacaoPeca, medianaTelhados, ops, id })
 *     → { ok, lote, resumo, pendencias, leitura, conjunto }   ou   { ok:false, motivo, corrigir }
 *   `conjunto` do telhado é objeto plano: { eForro, perfilTerca, apoios:[{ax,az,bx,bz,y}], calc, fontes, forroId, arestaQueda, v0 }. SEM lista dentro de lista.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function virg(v, c) { c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function BT() { return dep("BimTelhado", "./bimtelhado.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function BC() { return dep("BimCobertura", "./bimcobertura.js"); }
  function ES() { return dep("BimTelhadoEstrut", "./bimtelhadoestrut.js"); }

  var MODELO = "aco-sanduiche-forro";
  var TELHA_PADRAO = "kingspan-isotelha-trapezoidal-pir-ap";
  var FORRO_PADRAO = "drywall-12_5-madeira";
  var FORROS = { "drywall-12_5-madeira": ["96110", "88484", "104640"], "gesso-12_5": ["96109"], "pvc-8": ["96485"] };
  /* Aba mínima da terça que o fabricante pede (data/telhado-metalica.json, requisitos_terca_do_fabricante_da_telha, Manual Isotelha
     Trapezoidal PIR AP, versão 12 — 06.03.25, p. 10-15): 40 mm; 100 mm quando há transpasse (emenda de peças no comprimento). */
  var ABA_MIN = { sanduiche: { mm: 40, comTranspasseMm: 100, fonte: "Kingspan Isoeste, Manual Isotelha Trapezoidal PIR AP (v12, 06.03.25), p. 10-15: aba mínima da terça 40 mm; 100 mm no transpasse" } };
  var LIM = { passo: 0.25, maxAmostras: 1500, altaM: 0.30, tolAjuste: 0.02, fracAjuste: 0.6, vaoAjuste: 0.5, inclMinAjuste: 0.01, peDireitoPadrao: 2.80, balancoCalha: 0.30, inclinacaoForroMax: 173.2051, avancoTelha: 0.05, folgaCalhaTesteiraM: 0.0005, distCalcoApoioM: 0.15, recuoTesteira: 0.0645, secaoAdotada: [200, 100], limitePeca: 6 };
  var FONTES = {
    altura: "o plano é o mais baixo que nenhuma peça da obra fura (raios verticais sob o tracejado)",
    barra: "BR 1/2\" (D 12,70 mm) Gerdau — VALOR DE PARTIDA, a conferir pelo cálculo",
    carga: "peso da telha do catálogo; forro e instalações 0,10 kN/m² e sobrecarga 0,25 kN/m² são os valores de partida do motor do galpão (js/acosecundarias.js)"
  };

  /* ------------------------------------------------------------------ geometria do quadro (aresta de queda) */
  function pt(p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p && p.x), Number(p && p.z)]; }
  function areaSinal(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function dentro(p, P) { var T = BT(); return T && T.dentro ? T.dentro(p, P) : false; }
  function distSeg(p, a, b) { var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, k = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.sqrt(Math.pow(p[0] - (a[0] + k * dx), 2) + Math.pow(p[1] - (a[1] + k * dz), 2)); }
  /* o quadro: A = início da aresta de queda, t = ao longo dela, n = para DENTRO do contorno (a água sobe nesse sentido; u = distância à aresta) */
  function quadro(contorno, k) {
    var P = arr(contorno).map(pt), n = P.length;
    if (n < 3 || !(k >= 0 && k < n)) return null;
    var A = P[k], B = P[(k + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.sqrt(dx * dx + dz * dz);
    if (!(L > 1e-6)) return null;
    var t = [dx / L, dz / L], nn = [-t[1], t[0]], cx = 0, cz = 0;
    P.forEach(function (q) { cx += q[0] / n; cz += q[1] / n; });
    if ((cx - A[0]) * nn[0] + (cz - A[1]) * nn[1] < 0) nn = [-nn[0], -nn[1]];
    var umax = 0, tmin = Infinity, tmax = -Infinity;
    P.forEach(function (q) { var u = (q[0] - A[0]) * nn[0] + (q[1] - A[1]) * nn[1], tt = (q[0] - A[0]) * t[0] + (q[1] - A[1]) * t[1]; if (u > umax) umax = u; if (tt < tmin) tmin = tt; if (tt > tmax) tmax = tt; });
    return { P: P, k: k, A: A, B: B, t: t, n: nn, L: L, umax: umax, tmin: tmin, tmax: tmax,
             u: function (p) { return (p[0] - A[0]) * nn[0] + (p[1] - A[1]) * nn[1]; }, tt: function (p) { return (p[0] - A[0]) * t[0] + (p[1] - A[1]) * t[1]; } };
  }

  /* ------------------------------------------------------------------ E6: amostras (grade de 0,25 m, máximo 1500 pontos) */
  /* estado (opcional): a grade de 0,25 m passa batida por parede fina (15 cm entre dois pontos da grade) — com o estado, entram também pontos ao
     longo do EIXO de cada parede e viga do modelo que cai dentro do contorno (o raio vertical lê o topo delas). */
  function amostrasDe(contorno, passo, maximo, estado) {
    var P = arr(contorno).map(pt); if (P.length < 3) return [];
    passo = passo > 0 ? passo : LIM.passo; maximo = maximo > 0 ? maximo : LIM.maxAmostras;
    var linhas = [];
    if (estado) {
      var Te = ES(); arr(Te && Te.paredesDe ? Te.paredesDe(estado) : []).forEach(function (w) { linhas.push([[w.cx - w.ux * w.L / 2, w.cz - w.uz * w.L / 2], [w.cx + w.ux * w.L / 2, w.cz + w.uz * w.L / 2]]); });
      arr(estado.caixas).forEach(function (c) { if (c && c.tipo === "viga") { var th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th), L = num(c.comprimento, 0); linhas.push([[num(c.cx, 0) - ux * L / 2, num(c.cz, 0) - uz * L / 2], [num(c.cx, 0) + ux * L / 2, num(c.cz, 0) + uz * L / 2]]); } });
    }
    function sobreLinhas(out) {
      linhas.forEach(function (ln) {
        var L = Math.sqrt(Math.pow(ln[1][0] - ln[0][0], 2) + Math.pow(ln[1][1] - ln[0][1], 2)), n = Math.max(1, Math.ceil(L / passo));
        for (var i = 0; i <= n; i++) {
          var q = [ln[0][0] + (ln[1][0] - ln[0][0]) * i / n, ln[0][1] + (ln[1][1] - ln[0][1]) * i / n];
          /* o ponto na borda do contorno (a parede do perímetro) entra empurrado 3 cm para dentro, para o raio e o "dentro" concordarem */
          if (!dentro(q, P)) { var cx = 0, cz = 0; P.forEach(function (v) { cx += v[0] / P.length; cz += v[1] / P.length; }); var dx = cx - q[0], dz = cz - q[1], dl = Math.sqrt(dx * dx + dz * dz) || 1; q = [q[0] + dx / dl * 0.03, q[1] + dz / dl * 0.03]; if (!dentro(q, P)) continue; }
          out.push({ x: r6(q[0]), z: r6(q[1]) });
        }
      });
      return out;
    }
    var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    P.forEach(function (q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; });
    for (var it = 0; it < 12; it++) {
      var out = [];
      for (var x = x0 + passo / 2; x < x1; x += passo) for (var z = z0 + passo / 2; z < z1; z += passo) if (dentro([x, z], P)) out.push({ x: r6(x), z: r6(z) });
      sobreLinhas(out);
      if (out.length <= maximo) return out;
      passo *= Math.sqrt(out.length / maximo) * 1.02;
    }
    return [];
  }

  /* ------------------------------------------------------------------ E6: lerObra
     amostras = [{x, z, hits:[{y, uid}]}] (BIM.apoiarRaios: do alto para baixo; hits[0] = o que se VÊ). Devolve a altura do plano na linha da
     aresta de queda, a inclinação e a FONTE de cada uma, as peças "altas" e o que faltou. */
  function ajusteReta(pts) {
    var n = pts.length; if (n < 3) return null;
    var su = 0, sy = 0, suu = 0, suy = 0;
    pts.forEach(function (p) { su += p.u; sy += p.y; suu += p.u * p.u; suy += p.u * p.y; });
    var den = n * suu - su * su; if (Math.abs(den) < 1e-9) return { s: 0, c: sy / n };
    var s = (n * suy - su * sy) / den; return { s: s, c: (sy - s * su) / n };
  }
  function lerObra(entrada) {
    entrada = entrada || {};
    var Q = quadro(entrada.contorno, num(entrada.arestaQueda, 0)), saida = { ok: false, fontes: {}, altas: [], pecas: 0, amostras: 0, semTopo: false };
    if (!Q) { saida.motivo = "Contorno ou aresta de queda inválidos."; return saida; }
    var nivel = entrada.nivel || {}, elev = num(nivel.elevacao, 0), minPct = num(entrada.inclinacaoMinPct, null);
    var pts = [];
    arr(entrada.amostras).forEach(function (a) {
      if (!a || !fin(Number(a.x)) || !fin(Number(a.z))) return;
      var p = [Number(a.x), Number(a.z)]; if (!dentro(p, Q.P)) return;
      var h = arr(a.hits)[0]; if (!h || !fin(Number(h.y))) return;
      pts.push({ x: p[0], z: p[1], u: Q.u(p), y: Number(h.y), uid: h.uid != null ? String(h.uid) : "sem-uid" });
    });
    saida.amostras = arr(entrada.amostras).length; saida.pontosComTopo = pts.length;
    /* o PISO não é topo de peça: o hit a até 0,30 m do nível (laje, varanda, terreno) não entra na altura nem na inclinação; só piso → pé-direito do nível */
    /* piso = peça que cobre boa parte do tracejado (laje, varanda, terreno) com o topo a até 0,30 m do nível; o topo de PAREDE a essa altura (linha fina, poucos pontos) não é piso */
    var baixosPorUid = {}; pts.forEach(function (p) { if (p.y <= elev + 0.30) baixosPorUid[p.uid] = (baixosPorUid[p.uid] || 0) + 1; });
    var pisoUid = {}; Object.keys(baixosPorUid).forEach(function (u) { if (baixosPorUid[u] >= 0.4 * pts.length) pisoUid[u] = 1; });
    var acimaPiso = pts.filter(function (p) { return !(p.y <= elev + 0.30 && pisoUid[p.uid]); });
    if (acimaPiso.length !== pts.length) {
      if (!acimaPiso.length) {
        /* I4: SÓ há piso sob o tracejado. Se as paredes da obra terminam no topo dele (laje de cobertura no nível ativo), ele é a leitura válida: o plano fica nele.
           Sem paredes que terminem ali não dá para saber se é piso do nível ou laje de cobertura: pé-direito do nível e cartão ALTO citando a peça e a cota (nunca "nenhuma peça"). */
        var pisoTopo = -Infinity, pisoIds = {}; pts.forEach(function (p) { if (p.y > pisoTopo) pisoTopo = p.y; pisoIds[p.uid] = 1; });
        var termina = arr(entrada.paredesTopo).some(function (tp) { return fin(Number(tp)) && Math.abs(Number(tp) - pisoTopo) <= LIM.altaM; });
        if (termina) saida.pisoComoLeitura = { pecas: Object.keys(pisoIds), topo: r4(pisoTopo) };
        else { saida.pisoUnico = { pecas: Object.keys(pisoIds), topo: r4(pisoTopo) }; saida.pisoIgnorado = pts.length; pts = acimaPiso; }
      } else { saida.pisoIgnorado = pts.length - acimaPiso.length; pts = acimaPiso; }
    }
    /* ---- inclinação: a) ajuste das peças sob o tracejado */
    var sUso = null, fonteIncl = null, contrario = null, naoAltos = pts.slice(), digitada = fin(num(entrada.inclinacaoDigitada, NaN)) && num(entrada.inclinacaoDigitada, 0) > 0 ? num(entrada.inclinacaoDigitada, 0) : null, seguirIgnorado = null;
    if (digitada != null) { sUso = digitada / 100; fonteIncl = "informada pelo usuário (" + virg(digitada, 1) + " %)"; }
    else if (pts.length >= 3) {
      var f1 = ajusteReta(pts), pol = pts;
      if (f1) { pol = pts.filter(function (p) { return Math.abs(p.y - (f1.c + f1.s * p.u)) <= 0.05; }); if (pol.length >= 3) f1 = ajusteReta(pol) || f1; }
      var inl = pts.filter(function (p) { return Math.abs(p.y - (f1.c + f1.s * p.u)) <= LIM.tolAjuste; });
      var ul = inl.map(function (p) { return p.u; }), vao = Q.umax, cob = ul.length ? (Math.max.apply(null, ul) - Math.min.apply(null, ul)) / Math.max(vao, 1e-9) : 0;
      if (inl.length >= LIM.fracAjuste * pts.length && cob >= LIM.vaoAjuste && Math.abs(f1.s) >= LIM.inclMinAjuste) {
        if (f1.s > 0) { sUso = f1.s; fonteIncl = "ajuste das peças sob o tracejado (" + inl.length + " de " + pts.length + " pontos a ±" + virg(LIM.tolAjuste * 100, 0) + " cm, cobrindo " + virg(cob * 100, 0) + " % do vão)"; }
        else contrario = { pct: r4(f1.s * 100), texto: "as peças da obra caem para o lado de dentro (" + virg(f1.s * 100, 1) + " %): a queda do telhado está ao contrário" };
      }
    }
    if (sUso != null && digitada == null && fin(num(entrada.inclinacaoPeca, NaN)) && num(entrada.inclinacaoPeca, 0) > 0 && Math.abs(num(entrada.inclinacaoPeca, 0) - sUso * 100) > 0.5) seguirIgnorado = { pedida: r4(num(entrada.inclinacaoPeca, 0)), obra: r4(sUso * 100) };
    if (sUso == null && fin(num(entrada.inclinacaoPeca, NaN)) && num(entrada.inclinacaoPeca, 0) > 0) { sUso = num(entrada.inclinacaoPeca, 0) / 100; fonteIncl = "peça escolhida com \"Seguir\" (" + virg(num(entrada.inclinacaoPeca, 0), 1) + " %)"; }
    if (sUso == null && fin(num(entrada.medianaTelhados, NaN)) && num(entrada.medianaTelhados, 0) > 0) { sUso = num(entrada.medianaTelhados, 0) / 100; fonteIncl = "mediana dos telhados da obra (" + virg(num(entrada.medianaTelhados, 0), 1) + " %)"; }
    if (sUso == null && minPct != null) { sUso = minPct / 100; fonteIncl = "mínima do fabricante (" + virg(minPct, 1) + " %)"; }
    if (sUso == null) { saida.motivo = "Sem inclinação: nem peça sob o tracejado, nem telha com mínima do fabricante."; return saida; }
    var abaixo = null;
    if (minPct != null && sUso * 100 < minPct - 1e-6) { abaixo = { lida: r4(sUso * 100), minima: minPct, fonte: fonteIncl }; sUso = minPct / 100; fonteIncl = "mínima do fabricante (" + virg(minPct, 1) + " %) — " + (digitada != null ? "você informou " : "a obra pedia ") + virg(abaixo.lida, 1) + " %, abaixo dela"; }
    /* ---- altura: o plano é o mais baixo que nenhuma peça fura; peça acima de 0,30 m do plano = parede alta (fora do ajuste) */
    var grupos = {};
    pts.forEach(function (p) { p.r = p.y - sUso * p.u; var g = grupos[p.uid] || (grupos[p.uid] = { uid: p.uid, rMax: -Infinity, n: 0, pts: [] }); g.n++; g.pts.push(p); if (p.r > g.rMax) g.rMax = p.r; });
    var lista = Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(function (a, b) { return b.rMax - a.rMax; });
    saida.pecas = lista.length;
    var cortou = 0;
    /* peças ALTAS = as acima do maior salto (> 0,30 m) que deixa abaixo dele a maioria dos pontos (a parede alta de um trecho só, dois trechos ou o oitão; não o corpo da obra) */
    var totalPts = 0; lista.forEach(function (g) { totalPts += g.n; });
    (function () { var acima = 0; for (var ic = 0; ic + 1 < lista.length; ic++) { acima += lista[ic].n; if (lista[ic].rMax - lista[ic + 1].rMax > LIM.altaM && acima <= totalPts - acima) { cortou = ic + 1; break; } } })();   /* o PRIMEIRO salto de cima para baixo: as de baixo (piso, cobertura) ficam e o plano é o topo mais alto delas */
    var altas = lista.slice(0, cortou), baixas = lista.slice(cortou), y0 = null;
    baixas.forEach(function (g) { if (y0 == null || g.rMax > y0) y0 = g.rMax; });
    altas.forEach(function (g) {
      var mx = 0, mz = 0; g.pts.forEach(function (p) { mx += p.x / g.n; mz += p.z / g.n; });
      var ar = -1, dm = Infinity; Q.P.forEach(function (a, i) { var d = distSeg([mx, mz], a, Q.P[(i + 1) % Q.P.length]); if (d < dm) { dm = d; ar = i; } });
      saida.altas.push({ uid: g.uid, acimaM: r4(g.rMax - (y0 == null ? g.rMax : y0)), pontos: g.n, aresta: ar, topoMax: r4(Math.max.apply(null, g.pts.map(function (p) { return p.y; }))) });
    });
    if (y0 == null) {
      saida.semTopo = true;
      var pe = num(nivel.peDireito, NaN);
      y0 = elev + (fin(pe) && pe > 0 ? pe : LIM.peDireitoPadrao);
      saida.fontes.altura = (fin(pe) && pe > 0 ? "pé-direito do nível (" + virg(pe, 2) + " m)" : "pé-direito de " + virg(LIM.peDireitoPadrao, 2) + " m ADOTADO — o nível não informa o dele") + (saida.pisoUnico ? ": a única peça sob o tracejado é " + saida.pisoUnico.pecas.join(", ") + " (topo em " + virg(saida.pisoUnico.topo, 2) + " m), tratada como piso do nível" : ": nenhuma peça da obra sob o tracejado");
    } else saida.fontes.altura = FONTES.altura + (saida.pisoComoLeitura ? ", laje/peça " + saida.pisoComoLeitura.pecas.join(", ") + " com topo em " + virg(saida.pisoComoLeitura.topo, 2) + " m e as paredes terminando nela" : "") + " (" + baixas.length + " peça(s) lida(s)" + (altas.length ? "; " + altas.length + " parede(s) alta(s) fora do ajuste: ver a pendência do encontro" : "") + ")";
    saida.ok = true; saida.y0 = r6(y0); saida.altura = r4(y0 - elev); saida.alturaNecessaria = r4(y0);
    /* a altura lida longe do pé-direito (varanda, platibanda de 4 faces, peça isolada muito alta, parede alta em trechos) NUNCA passa calada */
    var peRef = fin(num(nivel.peDireito, NaN)) && num(nivel.peDireito, 0) > 0 ? num(nivel.peDireito, 0) : LIM.peDireitoPadrao;
    /* plano NO nível ou até 0,50 m dele (nível de cobertura cadastrado, laje de cobertura): não há pé-direito para comparar */
    if (!saida.semTopo && Math.abs(y0 - elev) > 0.5 && Math.abs((y0 - elev) - peRef) > 0.5) saida.alturaDiverge = { lida: r4(y0 - elev), peDireito: peRef, adotado: !(fin(num(nivel.peDireito, NaN)) && num(nivel.peDireito, 0) > 0) };
    saida.inclinacao = { pct: r6(sUso * 100), fonte: fonteIncl }; saida.fontes.inclinacao = fonteIncl;
    if (abaixo) saida.abaixoDaMinima = abaixo;
    if (seguirIgnorado) saida.seguirIgnorado = seguirIgnorado;
    if (contrario) saida.contrario = contrario;
    saida.quadro = { L: r4(Q.L), umax: r4(Q.umax) };
    return saida;
  }

  /* ------------------------------------------------------------------ a aresta de queda SUGERIDA (Enter aceita)
     1º o sentido da obra: as peças sob o tracejado caem para algum lado (plano ajustado por mínimos quadrados em x, z) → a aresta cuja normal
     de dentro mais sobe com o gradiente; 2º sem sentido na obra, a aresta mais comprida. → { k, fonte } */
  function sugerirQueda(contorno, amostras) {
    var P = arr(contorno).map(pt), n = P.length; if (n < 3) return { k: 0, fonte: "contorno incompleto" };
    var pts = [];
    arr(amostras).forEach(function (a) { var h = arr(a && a.hits)[0]; if (h && fin(Number(h.y)) && fin(Number(a.x)) && fin(Number(a.z)) && dentro([Number(a.x), Number(a.z)], P)) pts.push({ x: Number(a.x), z: Number(a.z), y: Number(h.y) }); });
    if (pts.length >= 6) {
      var mx = 0, mz = 0, my = 0; pts.forEach(function (p) { mx += p.x / pts.length; mz += p.z / pts.length; my += p.y / pts.length; });
      var sxx = 0, sxz = 0, szz = 0, sxy = 0, szy = 0;
      pts.forEach(function (p) { var dx = p.x - mx, dz = p.z - mz, dy = p.y - my; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; sxy += dx * dy; szy += dz * dy; });
      var det = sxx * szz - sxz * sxz;
      if (Math.abs(det) > 1e-9) {
        var gx = (sxy * szz - szy * sxz) / det, gz = (szy * sxx - sxy * sxz) / det, g = Math.sqrt(gx * gx + gz * gz);
        if (g >= LIM.inclMinAjuste) {
          var melhor = -1, mv = -Infinity;
          P.forEach(function (a, i) { var q = quadro(P.map(function (v) { return { x: v[0], z: v[1] }; }), i); if (!q) return; var c = (q.n[0] * gx + q.n[1] * gz) / g; if (c > mv + 1e-9) { mv = c; melhor = i; } });
          if (melhor >= 0 && mv > 0.5) return { k: melhor, fonte: "sentido da obra: as peças sob o tracejado sobem " + virg(g * 100, 1) + " % para o lado oposto a esta aresta" };
        }
      }
    }
    var kk = 0, ml = -1; P.forEach(function (a, i) { var b = P[(i + 1) % n], L = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); if (L > ml + 1e-9) { ml = L; kk = i; } });
    return { k: kk, fonte: "a aresta mais comprida (a obra não indica o sentido)" };
  }

  /* ------------------------------------------------------------------ E6: apoiosDe — as linhas da obra que seguram as terças */
  function apoiosDe(estado, entrada) {
    var Q = quadro(entrada.contorno, num(entrada.arestaQueda, 0)), out = [], T = ES();
    if (!Q) return out;
    var s = num(entrada.inclinacaoPct, 0) / 100, y0 = num(entrada.y0, 0);
    function planoEm(p) { return y0 + s * Q.u(p); }
    function recorta(a, b) {
      var L = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)), n = Math.max(2, Math.ceil(L / 0.05)), lo = null, hi = null;
      for (var i = 0; i <= n; i++) { var q = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]; if (dentro(q, Q.P) || Q.P.some(function (v, j) { return distSeg(q, v, Q.P[(j + 1) % Q.P.length]) < 0.2; })) { if (lo == null) lo = q; hi = q; } }
      return lo && hi ? [lo, hi] : null;
    }
    function cruzaTerca(ux, uz) { return Math.abs(ux * Q.t[1] - uz * Q.t[0]) >= 0.34; }   /* ≥ 20° com a terça (a terça corre ao longo da aresta de queda) */
    var altas = {}; arr(entrada.altas).forEach(function (a) { altas[String(a.uid)] = 1; });
    /* paredes do nativo: a parede sob o telhado que sobe até o plano (anexar topo) segura a terça */
    arr(T && T.paredesDe ? T.paredesDe(estado) : []).forEach(function (w) {
      if (!cruzaTerca(w.ux, w.uz)) return;
      if (w.base >= y0 + s * Q.umax) return;
      if (!(w.topo > y0 - 0.6 && w.base < y0)) return;   /* mureta baixa não apoia nem sobe até o telhado: o calço ficaria solto no ar */
      var ptA = [w.cx - w.ux * w.L / 2, w.cz - w.uz * w.L / 2], ptB = [w.cx + w.ux * w.L / 2, w.cz + w.uz * w.L / 2], r = recorta(ptA, ptB);
      if (!r || Math.sqrt(Math.pow(r[1][0] - r[0][0], 2) + Math.pow(r[1][1] - r[0][1], 2)) < 0.5) return;
      var m = [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2], plano = planoEm(m);
      if (w.topo > plano + LIM.altaM) return;   /* parede alta: não é apoio, é encontro (rufo) */
      out.push({ ax: r6(r[0][0]), az: r6(r[0][1]), bx: r6(r[1][0]), bz: r6(r[1][1]), y: r4(plano), fonte: "parede", id: String(w.id) });
    });
    /* vigas do nativo e peças (IFC) cujo topo toca o plano: a viga segura a terça no cruzamento */
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "viga") return;
      var th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th), L = num(c.comprimento, 0), cx = num(c.cx, 0), cz = num(c.cz, 0), topo = num(c.cy, 0) + num(c.altura, 0) / 2;
      if (!cruzaTerca(ux, uz)) return;
      var ptA = [cx - ux * L / 2, cz - uz * L / 2], ptB = [cx + ux * L / 2, cz + uz * L / 2], r = recorta(ptA, ptB); if (!r) return;
      var m = [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2];
      if (Math.abs(topo - planoEm(m)) > 0.03) return;
      out.push({ ax: r6(r[0][0]), az: r6(r[0][1]), bx: r6(r[1][0]), bz: r6(r[1][1]), y: r4(topo), fonte: "viga", id: String(c.id) });
    });
    var grp = {};
    arr(entrada.amostras).forEach(function (a) {
      var h = arr(a && a.hits)[0]; if (!h || !fin(Number(h.y)) || h.uid == null || altas[String(h.uid)]) return;
      var p = [Number(a.x), Number(a.z)]; if (!dentro(p, Q.P) || Math.abs(Number(h.y) - planoEm(p)) > 0.03) return;
      (grp[h.uid] = grp[h.uid] || []).push(p);
    });
    Object.keys(grp).forEach(function (k) {
      var L = grp[k]; if (L.length < 4) return;
      var mx = 0, mz = 0; L.forEach(function (p) { mx += p[0] / L.length; mz += p[1] / L.length; });
      var sxx = 0, sxz = 0, szz = 0; L.forEach(function (p) { sxx += Math.pow(p[0] - mx, 2); sxz += (p[0] - mx) * (p[1] - mz); szz += Math.pow(p[1] - mz, 2); });
      var ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang);
      if (!cruzaTerca(ux, uz)) return;
      var lo = Infinity, hi = -Infinity; L.forEach(function (p) { var d = (p[0] - mx) * ux + (p[1] - mz) * uz; if (d < lo) lo = d; if (d > hi) hi = d; });
      if (hi - lo < 1) return;
      var A = [mx + ux * lo, mz + uz * lo], B = [mx + ux * hi, mz + uz * hi], m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      out.push({ ax: r6(A[0]), az: r6(A[1]), bx: r6(B[0]), bz: r6(B[1]), y: r4(planoEm(m)), fonte: "raio", id: String(k) });
    });
    /* junta linhas a menos de 0,15 m uma da outra (a mesma peça lida duas vezes) */
    var res = [];
    out.sort(function (a, b) { return Q.tt([(a.ax + a.bx) / 2, (a.az + a.bz) / 2]) - Q.tt([(b.ax + b.bx) / 2, (b.az + b.bz) / 2]); });
    out.forEach(function (a) {
      var ta = Q.tt([(a.ax + a.bx) / 2, (a.az + a.bz) / 2]), dup = res.filter(function (b) { return Math.abs(Q.tt([(b.ax + b.bx) / 2, (b.az + b.bz) / 2]) - ta) < 0.15; })[0];
      if (!dup) res.push(a);
    });
    return res.slice(0, 64);
  }

  /* ------------------------------------------------------------------ E5: a terça pelo motor NBR 14762 (biapoiada, isolada) */
  function ventoEnvoltoria(g, v0) {
    var AD = dep("AcoDimensionar", "./acodimensionar.js"), AS = dep("AcoSecundarias", "./acosecundarias.js");
    if (!AD || !AD.ventoDoPar || !AS) return { ok: false, motivo: "O motor de vento (js/acodimensionar.js, js/acovento.js) não carregou." };
    var par = { geometria: { aguas: 1, inclinacaoPct: g.inclinacaoPct, vao: g.b, comprimento: g.a, peDireito: g.h },
                vento: { v0: v0, categoria: "II", grupoS3: 2 },
                fechamentos: { frente: { tipo: "alvenaria" }, fundo: { tipo: "alvenaria" }, esquerda: { tipo: "alvenaria" }, direita: { tipo: "alvenaria" } } };
    var r; try { r = AD.ventoDoPar(par); } catch (e) { return { ok: false, motivo: "O cálculo do vento falhou: " + e.message }; }
    if (!r || !r.ok) return { ok: false, motivo: r && r.motivo ? r.motivo : "O cálculo do vento falhou." };
    var vt = r.adaptado, pre = 0, suc = 0;
    arr(vt.casos).forEach(function (c) {
      var fq = vt.qLocal > 0 && c.q > 0 ? Math.max(1, vt.qLocal / c.q) : 1;
      for (var i = 0; i < 12; i++) for (var j = 0; j < 12; j++) {
        var p = num(vt.pressao(c.id, "cobertura", (i + 0.5) / 12 * g.b, (j + 0.5) / 12 * g.a), 0) * fq;
        if (p > pre) pre = p; if (p < suc) suc = p;
      }
    });
    var lo = AS.localFaixa ? AS.localFaixa(vt, "cobertura", 0, g.b, 0, g.a, suc) : null;
    if (lo && lo.w < suc) suc = lo.w;
    return { ok: true, wPre: r4(pre), wSuc: r4(suc), v0: v0, avisos: arr(r.avisos), qLocal: vt.qLocal };
  }
  /* entrada = { vao (m, entre linhas de apoio), espacamento (m, faixa da terça no plano), inclinacaoPct, tipoId, v0?, geometria:{a,b,h}, rampa (m) } */
  function dimensionarTercas(entrada) {
    entrada = entrada || {};
    var AS = dep("AcoSecundarias", "./acosecundarias.js"), MT = dep("AcoMateriais", "./acomateriais.js"), T = BT();
    if (!AS || !MT) return { ok: false, motivo: "O motor das terças (js/acosecundarias.js) não carregou.", avisos: [] };
    var tel = T ? T.telha(entrada.tipoId) : null, avisos = [], pend = [];
    var aco = MT.aco(MT.PADRAO.frio) || { id: "NBR 6650 CF-26", fy: 260, fu: 410 };
    var gSup = tel && fin(tel.pesoKgM2) ? tel.pesoKgM2 * 9.80665 / 1000 : 0;
    if (!gSup) avisos.push("Peso da telha sem fonte no catálogo: a carga permanente da telha NÃO entrou na verificação.");
    var abaMm = ABA_MIN.sanduiche.mm, rampa = num(entrada.rampa, 0), cmax = tel && fin(tel.comprimentoMaxM) ? tel.comprimentoMaxM : 12;
    var transpasse = rampa > cmax + 1e-9;
    if (transpasse) abaMm = ABA_MIN.sanduiche.comTranspasseMm;
    var wPre = 0, wSuc = 0, vento = null, ventoMotivo = null, v0 = num(entrada.v0, NaN);
    if (fin(v0) && v0 > 0 && entrada.geometria) {
      vento = ventoEnvoltoria({ a: entrada.geometria.a, b: entrada.geometria.b, h: entrada.geometria.h, inclinacaoPct: entrada.inclinacaoPct }, v0);
      if (vento.ok) { wPre = vento.wPre; wSuc = vento.wSuc; } else { avisos.push(vento.motivo); ventoMotivo = txt(vento.motivo); vento = null; }
    }
    var d = { tipo: "terca", L: entrada.vao, s: entrada.espacamento, gSup: gSup, gPlano: 0.10, q: 0.25, P: 1.0, wPre: wPre, wSuc: wSuc, th: Math.atan(num(entrada.inclinacaoPct, 0) / 100), nLinhaTirante: Math.max(1, Math.round(num(entrada.nTercas, 1))), abaMin: abaMm };
    var r; try { r = AS.dimensionarBarra(d, aco); } catch (e) { return { ok: false, motivo: "A verificação da terça falhou: " + e.message, avisos: avisos }; }
    if (!r || !r.ok) return { ok: false, motivo: r && r.motivo ? r.motivo : "Nenhum Ue do catálogo passa.", sugestao: r && r.sugestao, avisos: avisos, entrada: d, vento: vento, ventoMotivo: ventoMotivo, abaMinMm: abaMm, transpasse: transpasse };
    return { ok: true, perfil: r.perfil, correntes: r.linhas, entreCorrentes: r.entreLinhas, razao: r.razao, governante: r.governante, combinacao: r.combinacaoGovernante, massa: r.massa, linhaTirante: r.linhaTirante || null,
             vento: vento, ventoMotivo: ventoMotivo, comVento: !!vento, entrada: d, abaMinMm: abaMm, transpasse: transpasse, aco: r.aco, avisos: avisos.concat(arr(r.avisos)), alternativas: arr(r.alternativas) };
  }

  /* ------------------------------------------------------------------ hash da entrada (a verificação envelhece quando a geometria muda) */
  function hashDe(o) {
    var s = JSON.stringify(o, function (k, v) { return typeof v === "number" ? Math.round(v * 10000) / 10000 : v; }), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  function entradaDoHash(t) {
    var c = t && t.conjunto || {};
    return { contorno: arr(t && t.contorno).map(function (q) { return [r4(q.x), r4(q.z), q.d === false ? 0 : 1]; }), incl: num(t && t.inclinacao, 0), beiral: num(t && t.beiral, 0), tipoId: t && t.tipoId, perfil: c.perfilTerca, apoios: arr(t && t.pacote && t.pacote.conjunto && t.pacote.conjunto.apoiosVivos ? t.pacote.conjunto.apoiosVivos : c.apoios).map(function (a) { return [r4(a.ax), r4(a.az), r4(a.bx), r4(a.bz)]; }), cota: r4(num(t && t.cotaApoio, 0)) };
  }
  /* o conjunto já criado: a verificação ainda vale? → { vale, motivo } */
  function verificacaoAtual(t) {
    var c = t && t.conjunto; if (!c || !c.calc) return { vale: false, motivo: "O telhado não tem a verificação das terças." };
    if (c.calc.hash && c.calc.hash !== hashDe(entradaDoHash(t))) return { vale: false, motivo: "A geometria mudou depois da verificação das terças: refazer a verificação." };
    return { vale: true, motivo: null };
  }

  /* ------------------------------------------------------------------ pendências (cartões) */
  function pend(tipo, grav, titulo, texto, solucoes, extra) { var o = { tipo: tipo, gravidade: grav, titulo: titulo, texto: texto, solucoes: solucoes || [] }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }

  /* as duas linhas de apoio das pontas do contorno (a terça vence de borda a borda quando não há peça da obra embaixo) */
  function apoiosBordaBorda(contorno, k, y0) {
    var Q = quadro(contorno, k), out = []; if (!Q) return out;
    [Q.tmin, Q.tmax].forEach(function (tt) { var q0 = [Q.A[0] + Q.t[0] * tt, Q.A[1] + Q.t[1] * tt], q1 = [q0[0] + Q.n[0] * Q.umax, q0[1] + Q.n[1] * Q.umax]; out.push({ ax: r6(q0[0]), az: r6(q0[1]), bx: r6(q1[0]), bz: r6(q1[1]), y: r4(y0), fonte: "borda" }); });
    return out;
  }
  /* o que fica gravado do cálculo das terças (vão e espaçamento são os REAIS do modelo; o motivo guarda o que o motor recusou) */
  /* I3: terça sem 2 apoios ou com ponta em balanço maior que o beiral → o motor biapoiado NÃO se aplica: calc.ok = false e o motivo diz isso (sa = { n, balancoM, limiteM }) */
  function semApoioDe(pcj) {
    var n = num(pcj && pcj.tercasSemApoio, 0); if (!(n > 0)) return null;
    return { n: n, balancoM: r4(num(pcj.balancoPiorM, 0)), limiteM: r4(num(pcj.balancoLimiteM, 0)) };
  }
  function textoSemApoio(sa) { return sa.n + " terça(s) com menos de 2 apoios ou com ponta em balanço (pior " + virg(sa.balancoM) + " m, o beiral é " + virg(Math.max(0, sa.limiteM - 0.10)) + " m): o motor NBR 14762 só verifica terça entre dois apoios e este modelo não é assim"; }
  function registroCalc(calc, vao, esp, sa) {
    var ok = !!(calc && calc.ok) && !sa;
    if (sa) return { ok: false, correntes: 0, razao: null, vaoM: r4(vao), espacamentoM: r4(esp), comVento: false, wPre: null, wSuc: null, abaMinMm: null, governante: null, motivo: textoSemApoio(sa), sugestao: "Lance a parede ou a viga sob a ponta da terça (ou confira as terças à mão).", ventoMotivo: null, semApoio: sa };
    return { ok: ok, correntes: ok ? num(calc.correntes, 0) : 0, razao: ok ? r4(calc.razao) : null, vaoM: r4(vao), espacamentoM: r4(esp), comVento: !!(ok && calc.comVento), wPre: calc && calc.vento ? calc.vento.wPre : null, wSuc: calc && calc.vento ? calc.vento.wSuc : null,
             abaMinMm: calc && calc.abaMinMm || null, governante: ok ? txt(calc.governante) : null, motivo: ok ? null : txt(calc && calc.motivo), sugestao: ok ? null : txt(calc && calc.sugestao), ventoMotivo: calc && calc.ventoMotivo ? txt(calc.ventoMotivo) : null };
  }
  /* AS PENDÊNCIAS DA VERIFICAÇÃO, derivadas do que está gravado (conjunto.calc) e do que o replay mediu (vão e espaçamento reais): saem a CADA replay
     (pacote.avisos, diagnóstico, Propriedades) — não só na janela que abre na criação e fecha. */
  function pendenciasVerificacao(cj, med) {
    var c = cj && cj.calc, out = [], v0 = cj && fin(num(cj.v0, NaN)) && num(cj.v0, 0) > 0 ? num(cj.v0, 0) : null;
    var refaz = { id: "refazer-verificacao", texto: "Refazer a verificação das terças", muda: "o motor NBR 14762 refaz o perfil com o vão e o espaçamento reais de agora" };
    med = med || {};
    if (!c) { out.push(pend("telhado-param-sem-verificacao", "alta", "Terças sem verificação", "O conjunto não tem a verificação das terças (motor NBR 14762): o perfil está NÃO verificado.", [refaz])); return out; }
    if (!c.ok && c.semApoio) { /* I3: tratado abaixo, com a medida de agora */ }
    else if (!c.ok) out.push(pend("telhado-param-terca-nenhuma", "alta", "Nenhum Ue do catálogo passa para a terça",
      txt(c.motivo || "Nenhum Ue do catálogo passa.") + (c.sugestao ? " " + c.sugestao : "") + " Mantive o perfil de partida " + txt(cj.perfilTerca) + ", NÃO verificado.",
      [{ id: "lancar-apoio", texto: "Lançar uma peça de apoio no meio do vão e refazer", muda: "o vão da terça cai" }, { id: "outro-perfil", texto: "Escolher outro perfil nas Propriedades", muda: "o perfil é seu e fica a conferir" }, refaz]));
    else if (!v0) out.push(pend("telhado-param-sem-v0", "alta", "Vento NÃO verificado", "Só gravidade, vento NÃO verificado: a conferir pelo cálculo. Informe a velocidade básica V0 (NBR 6123) do local para verificar a sucção nas terças.",
      [{ id: "informar-v0", texto: "Informar V0", muda: "as terças são verificadas também com o vento (pressão e sucção)" }], { campo: "v0" }));
    else if (!c.comVento) out.push(pend("telhado-param-vento-nao-verificado", "alta", "Vento NÃO verificado (V0 informado)", "V0 = " + virg(v0, 0) + " m/s informado, mas o vento NÃO foi verificado (o motor de vento recusou esta geometria): " + txt(c.ventoMotivo || "motivo não informado") + ". As terças foram verificadas só para gravidade: a conferir pelo cálculo.",
      [{ id: "informar-v0", texto: "Informar outro V0 ou ajustar a geometria", muda: "o motor tenta de novo" }], { campo: "v0" }));
    if (num(med.tercasSemApoio, 0) > 0) { var saM = semApoioDe(med); out.push(pend("telhado-param-terca-sem-apoio", "alta", "Terça sem apoio: NÃO verificada", textoSemApoio(saM) + ". Mantive o perfil " + txt(cj.perfilTerca) + ", NÃO verificado.", [{ id: "lancar-apoio", texto: "Lançar a parede ou a viga sob a ponta e refazer", muda: "a terça passa a ter 2 apoios" }, refaz])); }
    if (c.ok && fin(num(med.piorVaoTerca, NaN)) && num(med.piorVaoTerca, 0) > num(c.vaoM, 0) + 0.02) out.push(pend("telhado-param-vao-real", "alta", "Vão real da terça maior que o verificado",
      "O modelo tem terça com " + virg(med.piorVaoTerca) + " m entre apoios e a verificação usou " + virg(c.vaoM) + " m. O perfil NÃO vale para esse vão.", [refaz]));
    if (c.ok && fin(num(med.espacamentoMaxM, NaN)) && num(med.espacamentoMaxM, 0) > num(c.espacamentoM, 0) + 0.005) out.push(pend("telhado-param-espacamento-real", "alta", "Espaçamento real das terças maior que o verificado",
      "O modelo tem terças a " + virg(med.espacamentoMaxM) + " m uma da outra e a verificação usou " + virg(c.espacamentoM) + " m. O perfil NÃO vale para essa faixa de telha.", [refaz]));
    return out;
  }
  /* M2: o forro de gesso precisa de estrutura de fixação com vão máximo de chapa; o sistema NÃO tem esse valor com fonte, então não há número aqui — só a pendência */
  function pendForroEstrutura(espTercas) {
    return pend("telhado-param-forro-estrutura", "aviso", "Estrutura do forro a definir", "O forro está hospedado no plano e as terças estão a " + virg(num(espTercas, 0)) + " m uma da outra; o sistema NÃO tem vão máximo da chapa de forro com fonte, então não decidi se as terças servem de apoio. A composição 96110 inclui a estrutura de fixação, mas a pilha não reserva altura para ela. Defina a estrutura do forro (vão da chapa do fabricante) e a altura dela na pilha.", []);
  }
  /* M1: trocou o forro depois de criado → a espessura e os serviços do conjunto são os do tipo ANTIGO: a folga forro × terça abre e o orçamento fica com a composição errada */
  function opsAjustarForro(estado, t) {
    var FORm = dep("BimForro", "./bimforro.js"), f = arr(estado && estado.forros).filter(function (x) { return x && String(x.telhado) === String(t.id); })[0];
    if (!FORm || !f || !t.conjunto) return null;
    var tf = FORm.tipo(f.tipoId), cj = clone(t.conjunto); cj.eForro = r6(num(tf && tf.espessura, cj.eForro));
    var ops = [{ op: "telhado", id: String(t.id), conjunto: cj }, { op: "orcar", id: String(f.id), servicos: servicosDe({ tipoForro: f.tipoId }).forro }];
    return ops;
  }
  /* AS PEÇAS DO CONJUNTO apagadas SOZINHAS (forro, calha, rufo, testeira): o conjunto segue, mas o que ficou sem elas é problema — terça e X aparentes por baixo, calha ausente.
     Lê o estado já derivado (forros e bordas existem só depois do telhado). */
  /* pendência 5: o forro vai até a linha do beiral e a face interna da calha fica o avanço da telha para dentro dela; com a calha FUNDA (o fundo abaixo do topo do forro) o forro entra no canal.
     Lê o estado derivado: → [{ calha, entraM, fundo, topoForro }] */
  function forroNaCalha(estado, t) {
    var out = [], tid = String(t && t.id);
    var f = arr(estado && estado.forros).filter(function (x) { return x && x.ok !== false && String(x.telhado) === tid; })[0]; if (!f || !arr(f.contorno).length) return out;
    var P = arr(f.contorno).map(function (q) { return [q.x, q.z]; }), ang = num(f.dirInclinacao, 0) * Math.PI / 180, tg = Math.tan(num(f.inclinacao, 0) * Math.PI / 180);
    arr(estado && estado.bordas).forEach(function (b) {
      if (!b || String(b.telhado) !== tid || b.tipoBorda !== "calha" || !b.ok || !b.perfil) return;
      arr(b.perfil.subs).forEach(function (s) {
        if (!s || !s.ia || !s.oa) return;
        var dx = s.oa.x - s.ia.x, dz = s.oa.z - s.ia.z, L = Math.sqrt(dx * dx + dz * dz) || 1, pm = [(s.ia.x + s.ib.x) / 2 + dx / L * 0.02, (s.ia.z + s.ib.z) / 2 + dz / L * 0.02];
        if (!dentro(pm, P)) return;
        var topo = num(f.cota, 0) + ((pm[0] * Math.cos(ang) + pm[1] * Math.sin(ang)) - num(f.projMin, 0)) * tg + num(f.espessura, 0) * Math.sqrt(1 + tg * tg), fundo = Math.min(num(s.ya, Infinity), num(s.yb, Infinity));
        if (fundo < topo - 0.001) out.push({ calha: b.id, entraM: LIM.avancoTelha, fundo: r4(fundo), topoForro: r4(topo) });
      });
    });
    return out;
  }
  function pendenciasMembros(estado, t) {
    var out = [], tid = String(t && t.id);
    /* pendência 6: a testeira apagada de UMA aresta não pode passar (o pacote fica aberto nela); antes bastava existir qualquer testeira */
    var cobertas = {}; arr(estado && estado.bordas).forEach(function (b) { if (b && String(b.telhado) === tid && b.tipoBorda === "testeira" && b.ok !== false) arr(b.arestas).forEach(function (k) { cobertas[Number(k)] = 1; }); });
    var faltaTest = []; for (var kt = 0; kt < arr(t && t.contorno).length; kt++) if (!cobertas[kt]) faltaTest.push(kt + 1);
    var fnc = forroNaCalha(estado, t);
    if (fnc.length) out.push(pend("telhado-param-forro-na-calha", "alta", "O forro entra no canal da calha", "O forro vai até a linha do beiral e a face interna da calha fica " + virg(fnc[0].entraM * 100, 0) + " cm para dentro dela: com a calha funda (fundo em " + virg(fnc[0].fundo, 3) + " m, abaixo do topo do forro em " + virg(fnc[0].topoForro, 3) + " m) o forro avança ~" + virg(fnc[0].entraM * 100, 0) + " cm dentro do canal. O recuo do forro nessa aresta ainda é manual: use uma calha mais rasa ou corte o forro à mão.", []));
    var tem = function (lista, tipo) { return arr(estado && estado[lista]).some(function (x) { return x && String(x.telhado) === tid && (!tipo || x.tipoBorda === tipo); }); };
    [["forro", tem("forros"), "O forro do conjunto foi apagado: as terças e o X ficam aparentes por baixo. Lance o forro de novo ou apague o conjunto inteiro."],
     ["calha", tem("bordas", "calha"), "A calha do conjunto foi apagada: a água do beiral cai sem calha."],
     ["rufo", tem("bordas", "rufo") || arr(t && t.contorno).length < 2, "O rufo do conjunto foi apagado: a borda da telha nas arestas livres ficou sem capa."],
     ["testeira", faltaTest.length === 0, faltaTest.length === arr(t && t.contorno).length ? "A testeira do conjunto foi apagada: o pacote (forro, terça, telha) fica aberto na borda." : "A testeira da(s) aresta(s) " + faltaTest.join(", ") + " foi apagada: o pacote (forro, terça, telha) fica aberto nela."]].forEach(function (m) {
      if (!m[1]) out.push(pend("telhado-param-membro-apagado-" + m[0], "alta", "Peça do conjunto apagada: " + m[0], m[2], []));
    });
    /* M1: forro trocado (espessura ou serviços do tipo antigo) */
    var FORm = dep("BimForro", "./bimforro.js"), fT = arr(estado && estado.forros).filter(function (x) { return x && String(x.telhado) === tid; })[0];
    if (fT && FORm && t.conjunto) {
      var tfT = FORm.tipo(fT.tipoId), dEsp = num(tfT && tfT.espessura, 0) - num(t.conjunto.eForro, 0);
      var codNovo = (FORROS[fT.tipoId] || []).join(","), codAtual = arr(fT.servicos).map(function (s) { return s.codigo; }).join(",");
      if (Math.abs(dEsp) > 0.0005 || (codNovo && codAtual && codNovo !== codAtual)) out.push(pend("telhado-param-forro-trocado", "alta", "Forro trocado depois do conjunto", "O forro agora é " + txt(tfT && tfT.rotulo) + " (" + virg(num(tfT && tfT.espessura, 0) * 1000, 1) + " mm) e o conjunto foi montado com " + virg(num(t.conjunto.eForro, 0) * 1000, 1) + " mm: a folga forro × terça abre " + virg(dEsp * 1000, 1) + " mm e o orçamento do forro segue com os serviços do tipo antigo.", [{ id: "ajustar-forro", texto: "Ajustar o conjunto ao forro atual", muda: "a espessura do forro e os serviços do orçamento passam a ser os do tipo atual" }]));
    }
    /* M8: telha trocada para uma que o conjunto não verifica */
    var T8 = BT(), tel8 = T8 && t.tipoId ? T8.telha(t.tipoId) : null;
    if (!tel8 || tel8.familia !== "sanduiche" || !fin(tel8.vaoMaxEntreApoios) || !fin(tel8.pesoKgM2)) out.push(pend("telhado-param-telha-trocada", "alta", "Telha trocada: o conjunto não a verifica", "A telha " + txt(tel8 && tel8.produto ? tel8.produto : t.tipoId) + " não é sanduíche do catálogo com vão máximo e peso com fonte: o serviço 94216 (telha termoacústica), a verificação das terças e o espaçamento NÃO valem para ela. Volte a uma telha sanduíche com dados ou monte o telhado sem o conjunto.", []));
    arr(t.avisos).filter(function (av) { return !/refazer a verificação/.test(av); }).forEach(function (av) { out.push(pend("telhado-param-aviso-telhado", "aviso", "Aviso do telhado", txt(av), [])); });
    if (fT) out.push(pendForroEstrutura(num(t.conjunto && t.conjunto.calc && t.conjunto.calc.espacamentoM, 0)));
    return out;
  }
  /* O QUE FICA FORA DO TOTAL do orçamento do conjunto, com a peça, a quantidade e o motivo (nunca código inventado, nunca "A COTAR"):
       · X, correntes e calços: o 104314 é "trama de aço composta por TERÇAS" — não cobre barra de travamento nem calço; PROP-MET-9001 é do orçamentista, fora da base;
       · testeira: o 100327 é "rufo externo/interno, corte de 33 cm" — o desenvolvimento da testeira (altura do pacote + dobras) não é conferido contra ele. */
  /* A composição existe na base do ORÇAMENTO? true / false / null (não dá para saber: sem base e código que não é da Metálica).
     Com a base do app (OrcModeloUI.base, que inclui MetalOrc.Propria) a resposta é a mesma do doModelo. Sem base, só os PROP-MET-90xx (que vêm no app) são conhecidos. */
  function temComposicao(base, cod) {
    if (!cod) return false;
    try { if (base && typeof base.obter === "function") return !!base.obter(String(cod)); } catch (e) { return false; }
    if (/^PROP-MET-/i.test(String(cod))) { var MO = global.MetalOrc; return !!(MO && MO.Propria && MO.Propria.obter && MO.Propria.obter(String(cod))); }
    return null;
  }
  function servicoDe(t, medida) { return arr(t && t.servicos).filter(function (s) { return s && s.medida === medida; })[0] || null; }
  /* A peça entra no total quando há serviço lançado com essa medida E a base do orçamento tem o código; senão fica FORA, com o motivo que a base diz (nunca afirmado) */
  function foraPorBase(out, t, base, o) {
    if (!(o.qtd > 0)) return;
    var sv = servicoDe(t, o.medida);
    if (!sv) { out.push({ tipo: o.tipo, peca: o.peca, qtd: r4(o.qtd), un: o.un, motivo: o.semServico }); return; }
    var ok = temComposicao(base, sv.codigo);
    if (ok === false) out.push({ tipo: o.tipo, peca: o.peca, qtd: r4(o.qtd), un: o.un, motivo: "a base do orçamento não tem a composição " + sv.codigo + " (o serviço está lançado e fica pendente até ela existir)" });
  }
  function baseDoApp() { try { var U = global.OrcModeloUI; return U && typeof U.base === "function" ? U.base() : null; } catch (e) { return null; } }
  function foraDoTotalDe(t, estado, base) {
    if (base === undefined) base = baseDoApp();   /* a tela pergunta à MESMA base do orçamento do app */
    var out = [], pk = t && t.pacote && t.pacote.ok ? t.pacote : null; if (!pk) return out;
    var med = pk.medidas || {};
    /* X e correntes: barra → PROP-MET-9001 (a descrição cita barra); calços: chapa → PROP-MET-9003 (chapas de ligação). O 104314 é só a trama de TERÇAS. */
    foraPorBase(out, t, base, { tipo: "telhado-param-contravento-sem-composicao", peca: "X e correntes (barra)", qtd: num(med.contraventoKg, 0), un: "kg", medida: "contraventoKg", semServico: "não há serviço lançado: o 104314 é a trama de TERÇAS e não cobre barra de travamento" });
    foraPorBase(out, t, base, { tipo: "telhado-param-calco-sem-composicao", peca: "Calços (chapa)", qtd: num(med.calcoKg, 0), un: "kg", medida: "calcoKg", semServico: "não há serviço lançado: o 104314 é a trama de TERÇAS e não cobre chapa de calço" });
    /* encontro com parede alta: o contrarrufo vai pelo código do quantitativo da cobertura; o rufo e a fixação não têm serviço no orçamento do conjunto */
    var re = t && t.rufoEnc;
    if (re) {
      foraPorBase(out, t, base, { tipo: "telhado-param-contrarrufo-sem-composicao", peca: "Contrarrufo de encontro", qtd: num(re.contraM, 0), un: "m", medida: "contrarrufoM", semServico: re.codigoContra ? "não há serviço lançado para o contrarrufo" : "o quantitativo da cobertura não tem composição para o corte do contrarrufo" });
      if (num(re.rufoM, 0) > 0) out.push({ tipo: "telhado-param-rufo-encontro-sem-composicao", peca: "Rufo de encontro", qtd: r4(num(re.rufoM, 0)), un: "m", motivo: "o orçamento do conjunto não lança o rufo de encontro (cada corte tem a sua composição no quantitativo da cobertura, que não vai para este orçamento); a chapa e a fixação dele também ficam de fora" });
    }
    var compT = 0, altT = 0;
    arr(estado && estado.bordas).forEach(function (b) { if (b && String(b.telhado) === String(t.id) && b.tipoBorda === "testeira" && b.ok) { compT += num(b.comprimento, 0); altT = Math.max(altT, num(b.alturaEf, 0)); } });
    arr(estado && estado.bordas).forEach(function (b) {
      if (!b || String(b.telhado) !== String(t.id) || b.tipoBorda !== "calha" || !b.ok) return;
      var dev = desenvolvimentoCalha(0, num(b.larguraEf, 0.2), num(b.alturaEf, 0.1) + num(b.perfil && b.perfil.desnivel, 0));
      if (dev > 1.0 + 1e-9) out.push({ tipo: "telhado-param-calha-sem-composicao", peca: "Calha", qtd: r4(num(b.comprimento, 0)), un: "m", motivo: "desenvolvimento de " + Math.round(dev * 100) + " cm: a composição 94229 vai só até 100 cm e não há outra na base" });
    });
    if (compT > 0) out.push({ tipo: "telhado-param-testeira-sem-composicao", peca: "Testeira", qtd: r4(compT), un: "m", motivo: "sem composição na base: o 100327 é rufo de corte de 33 cm e a testeira tem " + virg(altT * 100, 1) + " cm de altura mais as dobras, desenvolvimento não conferido" });
    return out;
  }

  /* ------------------------------------------------------------------ E7: o lote */
  function proximoId(estado) {
    var usados = {}; arr(estado && estado.telhados).forEach(function (t) { usados[String(t.id)] = 1; });
    for (var i = 1; i < 500; i++) if (!usados["tp" + i]) return "tp" + i;
    return "tp" + new Date().getTime();
  }
  function desenvolvimentoCalha(c, larg, alt) { var C = BC(); return C && C.desenvolvimentoCalha ? C.desenvolvimentoCalha(larg, alt) : larg + 2 * alt; }
  function codigoCalha(dev) { return dev <= 0.33 + 1e-9 ? "94227" : (dev <= 0.50 + 1e-9 ? "94228" : (dev <= 1.0 + 1e-9 ? "94229" : null)); }

  function montarLote(estado, a) {
    a = a || {};
    var T = BT(), E = BE(), C = BC(), ESm = ES(), FOR = dep("BimForro", "./bimforro.js");
    if (!T || !E || !C || !ESm || !FOR) return { ok: false, motivo: "Os motores do telhado não carregaram.", corrigir: "Recarregue a página." };
    var tipoId = a.tipoId || TELHA_PADRAO, tel = T.telha(tipoId);
    if (!tel || tel.familia !== "sanduiche") return { ok: false, motivo: "O Telhado paramétrico usa telha sanduíche do catálogo (a lista traz só essas).", corrigir: "Escolha uma telha sanduíche na lista." };
    if (!fin(tel.vaoMaxEntreApoios) || !fin(tel.pesoKgM2)) return { ok: false, motivo: "A telha " + txt(tel.produto) + " não tem vão máximo e peso com fonte no catálogo: o conjunto não pode verificar a terça.", corrigir: "Escolha a telha " + TELHA_PADRAO + " (vão, peso e balanço com fonte)." };
    var k = num(a.arestaQueda, NaN), Q = quadro(a.contorno, k);
    if (!Q) return { ok: false, motivo: "Falta o contorno fechado e a aresta onde cai a água (a da calha).", corrigir: "Desenhe o contorno e clique na aresta da queda." };
    var Pc = Q.P; if (Math.abs(areaSinal(Pc)) < 1) return { ok: false, motivo: "O contorno tem menos de 1 m².", corrigir: "Desenhe um contorno maior." };
    var forroTipo = FORROS[a.forroTipoId] ? a.forroTipoId : FORRO_PADRAO, tf = FOR.tipo(forroTipo), eForro = num(tf && tf.espessura, 0.0125);
    var nivel = a.nivel || {}, elev = num(nivel.elevacao, 0), pendencias = [];
    var minPct = fin(tel.inclinacaoMinPct) ? tel.inclinacaoMinPct : null;
    /* a leitura da obra NÃO enxerga o que já é de conjunto (o telhado, o forro e as bordas de um conjunto lançado antes) */
    var amostras = semConjunto(estado, a.amostras);
    /* o tracejado cai sobre um conjunto que já existe: só entra se o usuário aceitar substituir (a.substituir = os ids; o lote apaga o antigo e cria o novo) */
    var beiralN = fin(num(a.beiral, NaN)) ? num(a.beiral, 0) : 0.30;
    var sobre = conjuntosSobre(estado, a.contorno, beiralN), subst = arr(a.substituir).map(String), faltaSub = sobre.filter(function (i) { return subst.indexOf(i) < 0; });
    if (faltaSub.length) return { ok: false, substituir: faltaSub, motivo: "O tracejado cai sobre o conjunto " + faltaSub.join(", ") + " que já existe.", corrigir: "Aceite substituir o conjunto existente, ou desenhe em outro lugar." };
    /* 1) altura e inclinação lidas da obra */
    var leitura = lerObra({ contorno: Pc, arestaQueda: k, amostras: amostras, nivel: nivel, inclinacaoMinPct: minPct, inclinacaoPeca: a.inclinacaoPeca, inclinacaoDigitada: a.inclinacao, medianaTelhados: a.medianaTelhados,
      paredesTopo: arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede"; }).map(function (c) { return num(c.base, 0) + num(c.altura, 0); }) });
    if (!leitura.ok) return { ok: false, motivo: leitura.motivo || "Não consegui ler a obra.", corrigir: "Informe a inclinação nas Propriedades." };
    var pct = leitura.inclinacao.pct, s = pct / 100, f = Math.sqrt(1 + s * s);
    var LIm = T.LIM && T.LIM.inclinacao ? T.LIM.inclinacao : [1, 300];
    if (pct < LIm[0] - 1e-9 || pct > LIm[1] + 1e-9) return { ok: false, motivo: "A inclinação de " + virg(pct, 1) + " % está fora do que o telhado aceita (" + virg(LIm[0], 0) + " a " + virg(LIm[1], 0) + " %).", corrigir: "Informe uma inclinação dentro desse limite." };
    if (pct > LIM.inclinacaoForroMax) return { ok: false, motivo: "A inclinação de " + virg(pct, 1) + " % passa do que o forro do conjunto acompanha (60°, " + virg(LIM.inclinacaoForroMax, 0) + " %): a folga forro × terça ficaria aberta.", corrigir: "Use até " + virg(LIM.inclinacaoForroMax, 0) + " %." };
    if (leitura.abaixoDaMinima && !(fin(num(a.inclinacao, NaN)) && num(a.inclinacao, 0) > 0)) {
      pendencias.push(pend("telhado-param-abaixo-da-minima", "aviso", "Inclinação da obra abaixo da mínima da telha",
        "A obra pede " + virg(leitura.abaixoDaMinima.lida, 1) + " %, e a telha " + txt(tel.produto) + " exige no mínimo " + virg(minPct, 1) + " % (" + txt(tel.inclinacaoFonte) + "). Usei a mínima do fabricante.",
        [{ id: "usar-minima", texto: "Manter a mínima do fabricante (" + virg(minPct, 1) + " %)", muda: "o telhado sobe mais que a obra: a altura necessária no alto aumenta" }, { id: "outra-telha", texto: "Trocar de telha", muda: "outra telha com mínima menor, se o catálogo tiver" }]));
    } else if (leitura.abaixoDaMinima) {
      pendencias.push(pend("telhado-param-abaixo-da-minima", "alta", "Inclinação informada abaixo da mínima da telha", "Você informou " + virg(num(a.inclinacao, 0), 1) + " %, e a telha exige no mínimo " + virg(minPct, 1) + " % (" + txt(tel.inclinacaoFonte) + ").",
        [{ id: "usar-minima", texto: "Usar " + virg(minPct, 1) + " %", muda: "inclinação sobe para a mínima do fabricante" }, { id: "outra-telha", texto: "Trocar de telha", muda: "outra telha com mínima menor, se o catálogo tiver" }]));
    }
    if (leitura.seguirIgnorado) pendencias.push(pend("telhado-param-seguir-ignorado", "aviso", "\"Seguir\" não foi aplicado", "Você escolheu seguir " + virg(leitura.seguirIgnorado.pedida, 1) + " %, mas as peças da obra sob o tracejado dão " + virg(leitura.seguirIgnorado.obra, 1) + " % e a leitura da obra vem primeiro (ordem: ajuste das peças, \"Seguir\", mediana, mínima). Digite a inclinação nas Propriedades para valer a sua.", []));
    if (leitura.alturaDiverge) pendencias.push(pend("telhado-param-altura-diverge", "alta", "Altura lida da obra longe do pé-direito", "A altura lida (" + virg(leitura.alturaDiverge.lida, 2) + " m acima do nível) difere do pé-direito " + (leitura.alturaDiverge.adotado ? "ADOTADO" : "do nível") + " de " + virg(leitura.alturaDiverge.peDireito, 2) + " m em mais de 0,50 m: varanda, platibanda nas 4 faces, peça isolada muito alta ou parede alta em trechos podem ter enganado a leitura. Confira a altura do plano antes de seguir.", []));
    if (leitura.pisoUnico) pendencias.push(pend("telhado-param-piso-unico", "alta", "Só uma peça sob o tracejado: piso ou laje de cobertura?", "A única peça sob o tracejado é " + leitura.pisoUnico.pecas.join(", ") + ", com o topo em " + virg(leitura.pisoUnico.topo, 2) + " m. Tratei como piso do nível e usei o pé-direito (plano em " + virg(leitura.y0, 2) + " m). Se ela for a laje de cobertura, o plano deve ficar em " + virg(leitura.pisoUnico.topo, 2) + " m: lance as paredes até ela ou ajuste o nível.", []));
    if (leitura.contrario) pendencias.push(pend("telhado-param-queda-contraria", "alta", "A obra cai ao contrário do telhado", txt(leitura.contrario.texto) + ".",
      [{ id: "inverter-queda", texto: "Inverter queda", muda: "a aresta da queda (calha) passa para o lado oposto" }]));
    /* 2) o plano: a altura no pé da água (a linha da parede da aresta de queda) */
    var y0 = leitura.y0, deslocBase = r6(y0 - elev);
    /* 3) beiral, balanço da telha e as linhas de apoio */
    var beiral = fin(num(a.beiral, NaN)) ? num(a.beiral, 0) : 0.30, balMax = tel.balanco && tel.balanco.comCalha ? tel.balanco.comCalha.max : null;
    if (balMax != null && beiral > balMax + 1e-6) pendencias.push(pend("telhado-param-balanco", "aviso", "Beiral maior que o balanço da telha", "O beiral de " + virg(beiral) + " m passa do balanço máximo com calha (" + virg(balMax) + " m, " + txt(tel.balancoFonte) + ").",
      [{ id: "beiral-max", texto: "Beiral de " + virg(balMax) + " m", muda: "o beiral cai para o balanço do fabricante" }]));
    var apoios = apoiosDe(estado, { contorno: Pc, arestaQueda: k, inclinacaoPct: pct, y0: y0, amostras: amostras, altas: leitura.altas });
    var apoioSrc = "peças da obra sob o tracejado";
    if (!apoios.length) {
      /* sem peça embaixo: a terça vence de borda a borda (as duas pontas do contorno no sentido da terça) ou abre cartão */
      apoiosBordaBorda(Pc, k, y0).forEach(function (ap) { apoios.push(ap); });
      apoioSrc = "borda a borda (nenhuma peça da obra sob o tracejado)";
      pendencias.push(pend("telhado-param-sem-apoio", "aviso", "Sem peça da obra embaixo: a terça vai de borda a borda",
        "Não achei parede, viga nem peça sob o tracejado. A terça foi tratada como apoiada nas duas pontas do contorno (vão de " + virg(Q.tmax - Q.tmin) + " m). A ferramenta não cria viga: confirme o apoio nas pontas ou lance uma peça (a linha de apoio entra pela leitura da obra).",
        [{ id: "confirmar-bordas", texto: "Confirmar o apoio nas pontas", muda: "nada: a verificação já considera as pontas" }, { id: "lancar-peca", texto: "Lançar uma peça da obra embaixo e refazer", muda: "a terça ganha uma linha de apoio" }]));
    }
    /* o vão da terça = a maior distância entre linhas de apoio (no sentido da terça) */
    var tl = apoios.map(function (ap) { return Q.tt([(ap.ax + ap.bx) / 2, (ap.az + ap.bz) / 2]); }).sort(function (x, y) { return x - y; });
    var vaoTerca = 0;
    var ext = [Q.tmin].concat(tl.filter(function (v) { return v > Q.tmin + 0.35 && v < Q.tmax - 0.35; })).concat([Q.tmax]);
    for (var i = 1; i < ext.length; i++) vaoTerca = Math.max(vaoTerca, ext[i] - ext[i - 1]);
    /* 4) a terça pelo motor (faixa = o espaçamento real no plano) */
    var rampa = Q.umax * f, espT = tel.vaoMaxEntreApoios, nT = Math.max(1, Math.ceil(rampa / espT - 1e-9)), esp = rampa / nT;
    /* a altura do vento é medida do CHÃO da obra (o nível mais baixo), não do nível em que a ferramenta abriu: o mesmo telhado não muda de sucção conforme o nível ativo */
    var cotaBase = fin(num(a.cotaBase, NaN)) ? num(a.cotaBase, 0) : elev, hVento = Math.max(0.5, y0 - cotaBase);
    var v0 = fin(num(a.v0, NaN)) && num(a.v0, 0) > 0 ? num(a.v0, 0) : null;
    var calc = dimensionarTercas({ vao: vaoTerca, espacamento: esp, inclinacaoPct: pct, tipoId: tipoId, v0: v0, rampa: rampa, nTercas: nT + 1, geometria: { a: Q.L, b: Q.umax, h: hVento } });
    var perfil = ESm.PERFIS_TEL.terca, calcOk = !!calc.ok;
    if (calcOk) perfil = calc.perfil;   /* as pendências da verificação (nenhum Ue, vento, vão e espaçamento reais) saem de pendenciasVerificacao, depois do replay */
    if (calcOk && calc.abaMinMm) pendencias.push(pend("telhado-param-aba", "info", "Aba mínima da terça", ABA_MIN.sanduiche.fonte + (calc.transpasse ? ". A água passa de " + virg(tel.comprimentoMaxM, 0) + " m: há transpasse e a aba mínima é de " + ABA_MIN.sanduiche.comTranspasseMm + " mm." : "."), []));
    if (calcOk && calc.linhaTirante && calc.linhaTirante.d > 12.7 + 1e-9) pendencias.push(pend("telhado-param-corrente", "aviso", "Corrente pede barra maior que a de partida", "O motor pede corrente de Ø " + virg(calc.linhaTirante.d, 1) + " mm; o conjunto usa BR 1/2\" (Ø 12,70 mm) de partida. Conferir pelo cálculo.", []));
    if (leitura.semTopo) pendencias.push(pend("telhado-param-sem-leitura", "aviso", "Altura sem peça da obra para ler", txt(leitura.fontes.altura) + ". Conferir a altura do apoio.", []));
    /* a parede alta: o RUFO de encontro e o contrarrufo vão pela op `rufo` da cobertura SE o gerador achar o encontro (parede mais alta na borda do contorno); o contorno NÃO é recortado na V1 */
    var altasTxt = leitura.altas.map(function (al) { return "aresta " + (al.aresta + 1) + " (" + virg(al.acimaM * 100, 0) + " cm acima do plano)"; }).join(", ");
    /* 5) o conjunto (objeto plano) */
    var id = a.id || proximoId(estado), idForro = id + "-forro", idCalha = id + "-calha", idRufo = id + "-rufo", idTest = id + "-testeira";
    var conjunto = { eForro: r6(eForro), perfilTerca: perfil, apoios: apoios.map(function (ap) { var o = { ax: ap.ax, az: ap.az, bx: ap.bx, bz: ap.bz, y: ap.y }; if (ap.fonte) o.fonte = ap.fonte; if (ap.id != null) o.id = String(ap.id); return o; }), arestaQueda: k, forroId: idForro, cotaBase: r4(cotaBase), y0Lido: r6(y0),
                     fontes: { altura: leitura.fontes.altura, inclinacao: leitura.fontes.inclinacao, apoios: apoioSrc, barra: FONTES.barra, cargas: FONTES.carga },
                     calc: registroCalc(calc, vaoTerca, esp) };
    if (v0) conjunto.v0 = v0;
    /* 6) as ops do lote: telhado + forro + calha + rufo + testeira */
    var d = { contorno: Pc.map(function (q, i) { var o = { x: q[0], z: q[1] }, ex = a.contorno[i] || {}; if (ex.pr != null && ex.pr !== "") { o.pr = ex.pr; if (ex.pf) o.pf = ex.pf; if (fin(Number(ex.po))) o.po = Number(ex.po); } if (i !== k) o.d = false; return o; }), inclinacao: pct, beiral: beiral, nivelId: nivel.id, base: nivel.id == null ? elev : undefined, deslocBase: deslocBase, tipoId: tipoId, modelo: MODELO };
    if (nivel.id == null) delete d.nivelId;
    var opT = T.op(id, d);
    if (!opT) return { ok: false, motivo: "O telhado não passou na validação (contorno com cruzamento ou valores fora do limite).", corrigir: "Refaça o contorno sem cruzar linhas." };
    opT.conjunto = clone(conjunto);
    opT.anexarParedes = true;
    conjunto.calc.hash = "";   /* preenchido abaixo, depois do replay provisório (a entrada do hash é o telhado já gravado) */
    var ops = [], apagados = [];
    sobre.forEach(function (i) { var ap = opsApagar(estado, i); if (ap) ap.ops.forEach(function (o) { ops.push(o); }); apagados.push(i); });
    ops.push(opT);
    var opF = { op: "forro", id: idForro, telhado: id, tipoId: forroTipo, contorno: Pc.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }) };
    if (nivel.id != null) opF.nivelId = String(nivel.id); else opF.base = elev;
    opF.deslocNivel = r6(y0 - elev);
    if (!E.opForroValida(opF)) return { ok: false, motivo: "O forro do conjunto não passou na validação.", corrigir: "Refaça o contorno." };
    ops.push(opF);
    /* a calha: SEM condutor; o bocal (saidas) dá o caimento; seção pela NBR 10844 (ou 200 × 100 ADOTADO) */
    var calhaNenhuma = false, larg = LIM.secaoAdotada[0] / 1000, alt = LIM.secaoAdotada[1] / 1000, secaoTxt = "200 × 100 mm ADOTADO", secaoAdotada = true, cidadeInfo = C.cidadeDaObra ? C.cidadeDaObra(a.obra, a.cliente) : { cidade: null };
    var opC = T.opBorda(idCalha, { telhado: id, tipoBorda: "calha", arestas: [k], largura: larg, altura: alt, cotaAuto: true });
    opC.saidas = [0.5]; opC.semDescida = true;
    var opR = null, rufoArestas = [];
    for (var e = 0; e < Pc.length; e++) if (e !== k) rufoArestas.push(e);
    if (rufoArestas.length) { opR = T.opBorda(idRufo, { telhado: id, tipoBorda: "rufo", arestas: rufoArestas }); if (opR) opR.alturaAuto = true; }   /* a capa que cobre a borda de cima da telha */
    var opS = null;   /* a testeira entra depois do replay (a altura é a do pacote) */
    var opRE = leitura.altas.length ? { op: "rufo", id: id + "-rufoenc", telhado: id } : null;
    /* replay provisório: a seção da calha (com 1 condutor SÓ aqui, para o cálculo — o lote final NÃO leva condutor) e o pacote real */
    var base = arr(a.ops).length ? clone(a.ops) : arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede"; }).map(function (c) { return { op: "criar", id: c.id, caixa: clone(c) }; });
    var opCond = C.opCondutor("trial-cd", { calha: idCalha, pos: 0.5 });
    function replay(extra) { try { return E.aplicar(E.sanear(base.concat(ops, extra || []))); } catch (ex) { return null; } }
    var st1 = replay(opCond ? [opC, opCond].concat(opR ? [opR] : []) : [opC]);
    var t1 = st1 && arr(st1.telhados).filter(function (x) { return String(x.id) === id; })[0];
    /* O MOTOR RECEBE O QUE O MODELO TEM: o maior vão real de terça (entre apoios que existem) e o maior espaçamento real; refaz até o perfil assentar */
    for (var itV = 0; itV < 4 && t1 && t1.pacote && t1.pacote.ok; itV++) {
      var cj1 = t1.pacote.conjunto || {}, vaoR = num(cj1.piorVaoTerca, 0), espR = num(cj1.espacamentoMaxM, 0);
      if (vaoR <= vaoTerca + 0.02 && espR <= esp + 0.002) break;
      vaoTerca = Math.max(vaoTerca, vaoR); esp = Math.max(esp, espR);
      calc = dimensionarTercas({ vao: vaoTerca, espacamento: esp, inclinacaoPct: pct, tipoId: tipoId, v0: v0, rampa: rampa, nTercas: nT + 1, geometria: { a: Q.L, b: Q.umax, h: hVento } });
      calcOk = !!calc.ok; perfil = calcOk ? calc.perfil : ESm.PERFIS_TEL.terca;
      conjunto.perfilTerca = perfil; conjunto.calc = registroCalc(calc, vaoTerca, esp); opT.conjunto = clone(conjunto);
      st1 = replay(opCond ? [opC, opCond].concat(opR ? [opR] : []) : [opC]);
      t1 = st1 && arr(st1.telhados).filter(function (x) { return String(x.id) === id; })[0];
    }
    /* I3: o que o replay mediu nas pontas e nos apoios das terças. Sem 2 apoios, ou com ponta em balanço maior que o beiral, a terça NÃO está verificada. */
    var saF = semApoioDe(t1 && t1.pacote && t1.pacote.ok ? t1.pacote.conjunto : null);
    if (saF) {
      calc = clone(calc); calc.ok = false; calc.comVento = false; calc.motivo = textoSemApoio(saF);
      calcOk = false; perfil = ESm.PERFIS_TEL.terca; conjunto.perfilTerca = perfil; conjunto.calc = registroCalc(calc, vaoTerca, esp, saF); opT.conjunto = clone(conjunto);
      st1 = replay(opCond ? [opC, opCond].concat(opR ? [opR] : []) : [opC]);
      t1 = st1 && arr(st1.telhados).filter(function (x) { return String(x.id) === id; })[0];
    }
    if (st1 && C.secaoMinimaCalha) {
      try {
        var sm = C.secaoMinimaCalha(st1, idCalha, { cidade: cidadeInfo.naTabela ? cidadeInfo.cidade : (cidadeInfo.cidade || undefined), obra: a.obra, cliente: a.cliente, calhaBeiral: true });
        if (sm && sm.ok && sm.baseMm) { larg = sm.baseMm / 1000; alt = sm.alturaMm / 1000; secaoAdotada = false; secaoTxt = sm.baseMm + " × " + sm.alturaMm + " mm (NBR 10844: " + virg(sm.capacidade_l_min, 0) + " L/min ≥ " + virg(sm.vazaoProjeto_l_min, 0) + " L/min)"; }
        else if (sm && sm.nenhuma) { calhaNenhuma = true; pendencias.push(pend("telhado-param-calha-nenhuma", "alta", "Nenhuma seção de calha passa", "Nenhuma seção candidata (até 500 × 200 mm) comporta a vazão da calha pela NBR 10844. Mantive " + secaoTxt + ", que NÃO comporta. Neste conjunto a descida é do projeto hidrossanitário: aumente o número de descidas lá ou divida a calha.", [])); }
      } catch (ex2) { /* mantém 200 × 100 ADOTADO */ }
    }
    if (secaoAdotada && !calhaNenhuma) pendencias.push(pend("telhado-param-calha-adotada", "aviso", "Seção da calha adotada: " + LIM.secaoAdotada[0] + " × " + LIM.secaoAdotada[1] + " mm",
      "A vazão da calha não foi calculada" + (cidadeInfo.cidade && !cidadeInfo.naTabela ? " (a cidade \"" + cidadeInfo.cidade + "\" está fora da Tabela 5 da NBR 10844)" : (cidadeInfo.cidade ? "" : " (a obra não informa a cidade)")) + ": adotei " + secaoTxt + ". Informe a cidade ou a intensidade de chuva com fonte para a NBR 10844 calcular a seção.",
      [{ id: "informar-cidade", texto: "Informar a cidade da obra", muda: "a seção sai da NBR 10844" }]));
    opC.largura = r6(larg); opC.altura = r6(alt);
    ops.push(opC); if (opR) ops.push(opR);
    /* o replay do lote final (sem condutor): o pacote, o hash e a testeira */
    var st2 = replay(opR ? [opC, opR] : [opC]);
    var t2 = st2 && arr(st2.telhados).filter(function (x) { return String(x.id) === id; })[0];
    var alturaPacote = t2 && t2.pacote && t2.pacote.ok ? r4(num(t2.pacote.camadas && t2.pacote.camadas.telha, 0) + num(t2.pacote.telhaEsp, 0)) : r4(eForro * f + 0.15 + 0.04);
    opS = T.opBorda(idTest, { telhado: id, tipoBorda: "testeira", arestas: [k], altura: Math.min(2, Math.max(0.01, alturaPacote)) });
    /* A5/A6: a testeira da aresta da calha recua para trás da face interna da calha; as arestas LIVRES fecham o pacote com testeira rente à borda (o rufo é a capa por cima) */
    if (opS) { opS.alturaAuto = true; opS.recuo = LIM.recuoTesteira; ops.push(opS); }
    var opS2 = null;
    if (rufoArestas.length) { opS2 = T.opBorda(id + "-testeira2", { telhado: id, tipoBorda: "testeira", arestas: rufoArestas, altura: Math.min(2, Math.max(0.01, alturaPacote)) }); if (opS2) { opS2.alturaAuto = true; ops.push(opS2); } }
    if (t2) { var hashOp = hashDe(entradaDoHash(t2)); opT.conjunto.calc.hash = hashOp; conjunto.calc.hash = hashOp; }
    else { pendencias.push(pend("telhado-param-sem-replay", "aviso", "Não pude conferir o conjunto antes de lançar", "O replay de conferência falhou: o conjunto vai ser lançado e conferido no modelo.", [])); }
    if (t2 && t2.ok === false) return { ok: false, motivo: txt(arr(t2.avisos)[0] || "As águas deste contorno não fecham (aresta reentrante, contorno em L ou U).") + " Nada foi lançado.", corrigir: "Desenhe um contorno convexo ou escolha outra aresta de queda." };
    if (t2 && t2.pacote && !t2.pacote.ok) return { ok: false, motivo: txt(arr(t2.pacote.avisos)[0] || "O gerador do conjunto recusou este contorno."), corrigir: "Ajuste o contorno ou a inclinação." };
    var cjMed = t2 && t2.pacote && t2.pacote.conjunto ? t2.pacote.conjunto : {}, pvs = pendenciasVerificacao(opT.conjunto, cjMed), textosPv = {};
    pvs.forEach(function (p) { pendencias.push(p); textosPv[p.texto] = 1; });
    var avPacote = (t2 && t2.pacote ? arr(t2.pacote.avisos) : []).filter(function (av) { return !textosPv[av]; });
    avPacote.forEach(function (av) { pendencias.push(pend("telhado-param-pacote", /NÃO|SEM|sem apoio/.test(av) ? "alta" : "aviso", "Aviso do gerador", av, [])); });
    if (t2 && t2.pacote && t2.pacote.conjunto && t2.pacote.conjunto.calcos) pendencias.push(pend("telhado-param-calcos", "info", "Calços metálicos a conferir", t2.pacote.conjunto.calcos + " calço(s) atravessam o forro nos cruzamentos terça × linha de apoio: a conferir pelo cálculo.", []));
    var nParedes = t2 && t2.pacote ? arr(t2.pacote.paredes).length : 0;
    pendencias.push(pendForroEstrutura(esp));
    arr(t2 && t2.avisos).filter(function (av) { return !/refazer a verificação/.test(av); }).forEach(function (av) { pendencias.push(pend("telhado-param-aviso-telhado", "aviso", "Aviso do telhado", txt(av), [])); });
    /* A3: o rufo de encontro só entra se o encontro existe (a parede alta na borda); senão a pendência diz a verdade: o telhado atravessa a peça */
    var encontros = opRE && C.encontrosDoTelhado && t2 ? C.encontrosDoTelhado(st2, t2, {}) : [];
    if (opRE && encontros.length) { ops.push(opRE); pendencias.push(pend("telhado-param-parede-alta", "aviso", "Parede alta junto ao telhado", "Parede(s) mais alta(s) que o plano: " + altasTxt + ". Lancei o RUFO de encontro e o contrarrufo (" + encontros.length + " trecho(s)); o contorno do telhado NÃO é recortado pela parede (V1): confira o encontro.", [])); }
    else if (leitura.altas.length) pendencias.push(pend("telhado-param-parede-alta", "alta", "Parede alta junto ao telhado: sem rufo de encontro", "Peça(s) mais alta(s) que o plano: " + altasTxt + ". NÃO há rufo de encontro nem contrarrufo lançados e o telhado NÃO é recortado pela peça: ele passa por ela. Resolva o encontro à mão (rufo e contrarrufo, ou recorte do contorno).", [], { aresta: leitura.altas[0].aresta }));
    /* testeira sem composição: visível */
    var st3 = t2 ? replay([]) : null, t3 = st3 && arr(st3.telhados).filter(function (x) { return String(x.id) === id; })[0];   /* o lote já com a testeira e o rufo de encontro */
    /* o contrarrufo de encontro entra no orçamento com o código que o quantitativo da cobertura dá a ele (nunca um código meu) */
    var rEnc = st3 && opRE && encontros.length ? arr(st3.rufosEncontro).filter(function (r) { return r && String(r.id) === String(opRE.id); })[0] : null;
    var codContra = rEnc && rEnc.ok && rEnc.sinapiContra ? rEnc.sinapiContra.codigo : null;
    pendencias.push(pend("telhado-param-rufo-fornecedor", "info", "Rufo: conferir com o fornecedor", "O rufo usa a composição 100327 (corte de 33 cm); o desenvolvimento real da peça dobrada é aproximado: conferir com o fornecedor.", []));
    /* 7) orçamento: um `orcar` por elemento */
    var sv = servicosDe({ tipoForro: forroTipo, larguraCalha: larg, alturaCalha: alt, desnivelCalha: t2 ? num(arr(st2.bordas).filter(function (b) { return b.id === idCalha; })[0] && arr(st2.bordas).filter(function (b) { return b.id === idCalha; })[0].perfil && arr(st2.bordas).filter(function (b) { return b.id === idCalha; })[0].perfil.desnivel, 0) : 0 });
    if (codContra) sv.telhado.push({ codigo: String(codContra), medida: "contrarrufoM", fator: 1, rotulo: "Contrarrufo de encontro" });
    ops.push({ op: "orcar", id: id, servicos: sv.telhado });
    ops.push({ op: "orcar", id: idForro, servicos: sv.forro });
    ops.push({ op: "orcar", id: idCalha, servicos: sv.calha });
    if (opR) ops.push({ op: "orcar", id: idRufo, servicos: sv.rufo });
    var lote = { op: "lote", id: "telhado-param-" + id, origem: "telhado-param", ops: ops };
    /* O QUE FICA FORA DO TOTAL: pergunta à base do orçamento (a do app, com a Metálica) e ao lote que vai ser lançado — não afirma */
    var st4 = t2 ? (function () { try { return E.aplicar(E.sanear(base.concat([lote]))); } catch (exL) { return null; } })() : null, t4 = st4 && arr(st4.telhados).filter(function (x) { return String(x.id) === id; })[0];
    var fora = t4 ? foraDoTotalDe(t4, st4, a.base) : [];
    fora.forEach(function (fx) { pendencias.push(pend(fx.tipo || "telhado-param-fora-do-total", "aviso", fx.peca + ": FORA do total do orçamento", fx.peca + " — " + virg(fx.qtd, 2) + " " + fx.un + ": " + fx.motivo + ". O total do orçamento NÃO inclui esta peça; ela aparece na lista com a quantidade (nada de valor inventado). Recomendado: composição própria de mercado, feita pelo orçamentista.", [])); });
    /* 8) o resumo (texto da tela) */
    var linhas = [];
    linhas.push("Telhado paramétrico " + id + ": " + virg(Q.L) + " × " + virg(Q.umax) + " m (projeção), uma água a " + virg(pct, 1) + " %, telha " + txt(tel.produto) + ".");
    linhas.push("Altura: " + virg(leitura.alturaNecessaria, 2) + " m no pé da água (" + txt(leitura.fontes.altura) + "). Inclinação: " + txt(leitura.fontes.inclinacao) + ".");
    if (calcOk && calc.comVento) linhas.push("Terças: perfil " + perfil + " escolhido pelo motor NBR 14762, biapoiadas, vão " + virg(vaoTerca) + " m, espaçamento " + virg(esp) + " m; vento com V0 = " + virg(v0, 0) + " m/s a z = " + virg(hVento) + " m do chão (cota " + virg(cotaBase) + "). Travamento em X, ligações, calços e peças da obra: a conferir pelo cálculo.");
    else if (calcOk) linhas.push("Terças: perfil " + perfil + " escolhido pelo motor NBR 14762, biapoiadas, vão " + virg(vaoTerca) + " m, espaçamento " + virg(esp) + " m. Só gravidade, vento NÃO verificado" + (v0 ? " (" + txt(calc.ventoMotivo) + ")" : "") + ": a conferir pelo cálculo.");
    else if (saF) linhas.push("Terças: perfil de partida " + perfil + ", NÃO verificado: " + textoSemApoio(saF) + ".");
    else linhas.push("Terças: perfil de partida " + perfil + ", NÃO verificado (nenhum Ue passa no vão de " + virg(vaoTerca) + " m).");
    linhas.push("Calha " + secaoTxt + " na aresta " + (k + 1) + " (sem tubo de queda: a descida é do projeto hidrossanitário); rufo nas " + rufoArestas.length + " arestas livres; testeira de " + virg(alturaPacote * 100, 1) + " cm; forro: " + txt(tf && tf.rotulo) + ".");
    if (fora.length) linhas.push("O total do orçamento NÃO inclui: " + fora.map(function (fx) { return fx.peca + " (" + virg(fx.qtd, 2) + " " + fx.un + ")"; }).join("; ") + " — o motivo de cada uma está nas pendências.");
    if (apagados.length) linhas.push("Substituiu o conjunto " + apagados.join(", ") + " (apagado no mesmo passo: um Ctrl+Z restaura).");
    if (nParedes) linhas.push(nParedes + " parede(s) subiram até o telhado.");
    return { ok: true, lote: lote, id: id, ids: { telhado: id, forro: idForro, calha: idCalha, rufo: opR ? idRufo : null, testeira: opS ? idTest : null }, resumo: { titulo: "Telhado paramétrico lançado", linhas: linhas, texto: linhas.join("\n"), paredesQueSubiram: nParedes, secaoCalha: secaoTxt },
             pendencias: pendencias, foraDoTotal: fora, leitura: { y0: leitura.y0, altura: leitura.altura, alturaNecessaria: leitura.alturaNecessaria, fonteAltura: leitura.fontes.altura, inclinacaoPct: pct, fonteInclinacao: leitura.fontes.inclinacao, semTopo: leitura.semTopo, altas: leitura.altas, pecas: leitura.pecas, amostras: leitura.amostras, apoios: apoios.length, fonteApoios: apoioSrc },
             conjunto: conjunto, calc: calc, estado: t2 ? { pacote: t2.pacote ? { ok: t2.pacote.ok, medidas: t2.pacote.medidas, conjunto: t2.pacote.conjunto } : null } : null };
  }

  /* ------------------------------------------------------------------ E7: os serviços (op orcar) */
  function servicosDe(o) {
    o = o || {};
    var forro = (FORROS[o.tipoForro] || FORROS[FORRO_PADRAO]).map(function (c) { return { codigo: c, medida: "area", fator: 1, rotulo: c === "88484" ? "Fundo selador no forro" : (c === "104640" ? "Pintura do forro" : "Forro") }; });
    var dev = desenvolvimentoCalha(0, num(o.larguraCalha, 0.2), num(o.alturaCalha, 0.1) + num(o.desnivelCalha, 0)), cc = codigoCalha(dev);
    return {
      telhado: [{ codigo: "94216", medida: "area", fator: 1, rotulo: "Telhamento termoacústico" }, { codigo: "104314", medida: "acoKg", fator: 1, rotulo: "Trama de aço das terças" }, { codigo: "PROP-MET-9001", medida: "contraventoKg", fator: 1, rotulo: "X e correntes (barra de aço)" }, { codigo: "PROP-MET-9003", medida: "calcoKg", fator: 1, rotulo: "Calços (chapa de aço)" }],
      forro: forro,
      calha: cc ? [{ codigo: cc, medida: "comprimento", fator: 1, rotulo: "Calha (desenvolvimento " + Math.round(dev * 100) + " cm)" }] : [],
      rufo: [{ codigo: "100327", medida: "comprimento", fator: 1, rotulo: "Rufo (corte 33 cm — conferir com o fornecedor)" }]
    };
  }

  /* ------------------------------------------------------------------ refazer a verificação das terças (V0 novo, geometria mudou)
     Lê o telhado do conjunto no estado, refaz o perfil (e as correntes) e devolve a op que grava conjunto.calc novo (com o hash de agora). */
  function refazerVerificacao(estado, idTelhado, opc) {
    opc = opc || {};
    var T = BT(), t = arr(estado && estado.telhados).filter(function (x) { return x && String(x.id) === String(idTelhado); })[0];
    if (!t || !t.conjunto) return { ok: false, motivo: "Este telhado não é do conjunto." };
    var tel = T ? T.telha(t.tipoId) : null; if (!tel) return { ok: false, motivo: "A telha do telhado não está no catálogo." };
    var k = num(t.conjunto.arestaQueda, 0), Q = quadro(arr(t.contorno).map(function (q) { return { x: q.x, z: q.z }; }), k);
    if (!Q) return { ok: false, motivo: "O contorno do telhado é inválido." };
    var pct = num(t.inclinacao, 0), f = Math.sqrt(1 + Math.pow(pct / 100, 2));
    var pcj = t.pacote && t.pacote.ok && t.pacote.conjunto ? t.pacote.conjunto : null;
    var tl = arr(pcj && pcj.apoiosVivos ? pcj.apoiosVivos : t.conjunto.apoios).map(function (ap) { return Q.tt([(ap.ax + ap.bx) / 2, (ap.az + ap.bz) / 2]); }).sort(function (x, y) { return x - y; });
    var ext = [Q.tmin].concat(tl.filter(function (v) { return v > Q.tmin + 0.35 && v < Q.tmax - 0.35; })).concat([Q.tmax]), vao = 0;
    for (var i = 1; i < ext.length; i++) vao = Math.max(vao, ext[i] - ext[i - 1]);
    var rampa = Q.umax * f, nT = Math.max(1, Math.ceil(rampa / tel.vaoMaxEntreApoios - 1e-9)), esp = rampa / nT;
    /* o que o modelo TEM (o replay mede): o maior vão entre apoios que existem e o maior espaçamento entre terças */
    if (pcj) { vao = Math.max(vao, num(pcj.piorVaoTerca, 0)); esp = Math.max(esp, num(pcj.espacamentoMaxM, 0)); }
    var cotaBase = t.conjunto.cotaBase != null ? num(t.conjunto.cotaBase, 0) : num(t.elevNivel, 0);
    var v0 = opc.v0 === undefined ? (t.conjunto.v0 || null) : (fin(num(opc.v0, NaN)) && num(opc.v0, 0) > 0 ? num(opc.v0, 0) : null);
    var calc = dimensionarTercas({ vao: vao, espacamento: esp, inclinacaoPct: pct, tipoId: t.tipoId, v0: v0, rampa: rampa, nTercas: nT + 1, geometria: { a: Q.L, b: Q.umax, h: Math.max(0.5, num(t.cotaApoio, 0) - cotaBase) } });
    var cj = clone(t.conjunto);
    if (calc.ok) cj.perfilTerca = calc.perfil; else cj.perfilTerca = ES().PERFIS_TEL.terca;   /* pendência 9: sem Ue que passe o perfil é o de PARTIDA (antes ficava o antigo, rotulado de partida) */
    if (v0) cj.v0 = v0; else delete cj.v0;
    var saR = semApoioDe(pcj);
    if (saR) { cj.perfilTerca = ES().PERFIS_TEL.terca; }
    cj.calc = registroCalc(calc, vao, esp, saR);
    var fake = clone(t); fake.conjunto = cj; cj.calc.hash = hashDe(entradaDoHash(fake));
    return { ok: !!calc.ok && !saR, motivo: saR ? textoSemApoio(saR) : (calc.ok ? null : calc.motivo), calc: calc, op: { op: "telhado", id: String(idTelhado), conjunto: cj },
             texto: saR ? "Terças NÃO verificadas: " + textoSemApoio(saR) + "." : calc.ok ? "Terças: perfil " + calc.perfil + " escolhido pelo motor NBR 14762, biapoiadas, vão " + virg(vao) + " m, espaçamento " + virg(esp) + " m. " + (calc.comVento ? "Travamento em X, ligações, calços e peças da obra: a conferir pelo cálculo." : "Só gravidade, vento NÃO verificado" + (v0 ? " (" + txt(calc.ventoMotivo) + ")" : "") + ": a conferir pelo cálculo.") : "Nenhum Ue do catálogo passa no vão de " + virg(vao) + " m." };
  }

  /* ------------------------------------------------------------------ E10: apagar em cascata */
  function opsApagar(estado, idTelhado) {
    var t = arr(estado && estado.telhados).filter(function (x) { return x && String(x.id) === String(idTelhado); })[0];
    if (!t || !t.conjunto) return null;
    var ops = [], ids = [];
    arr(estado.bordas).forEach(function (b) { if (b && String(b.telhado) === String(idTelhado)) ids.push(b.id); });
    arr(estado.calhasEmbutidas).forEach(function (b) { if (b && String(b.telhado) === String(idTelhado)) ids.push(b.id); });
    arr(estado.rufosEncontro).forEach(function (b) { if (b && String(b.telhado) === String(idTelhado)) ids.push(b.id); });   /* o rufo de encontro lançado com a parede alta */
    arr(estado.platibandas).forEach(function (b) { if (b && String(b.telhado) === String(idTelhado)) ids.push(b.id); });
    var forrosT = {}; arr(estado.forros).forEach(function (f) { if (f && String(f.telhado) === String(idTelhado)) forrosT[String(f.id)] = 1; });
    arr(estado.sancas).forEach(function (s) { if (s && forrosT[String(s.forro)]) ids.push(s.id); });   /* o que está pendurado no forro vai junto */
    arr(estado.caixas).forEach(function (c) { if (c && c.cob && forrosT[String(c.cob.forro)]) ids.push(c.id); });   /* a estrutura do forro */
    arr(estado.forros).forEach(function (f) { if (f && String(f.telhado) === String(idTelhado)) ids.push(f.id); });
    arr(estado.condutores).forEach(function (c) { if (c && ids.indexOf(c.calha) >= 0) ids.push(c.id); });
    ids.forEach(function (i) { ops.push({ op: "apagar", id: i }); });
    ops.push({ op: "apagar", id: idTelhado });
    return { op: "lote", id: "apagar-telhado-param-" + idTelhado + "-" + new Date().getTime(), origem: "telhado-param", ops: ops };
  }
  function eConjunto(t) { return !!(t && t.conjunto); }
  /* classes IFC que o raio da leitura da obra NÃO atravessa: o terreno e o sítio ficam sempre abaixo do que importa e custam a maior parte dos triângulos */
  var TIPOS_SEM_TOPO = ["IFCGEOGRAPHICELEMENT", "IFCSITE", "IFCSPACE"];
  /* SEGUNDO CONJUNTO NO MESMO LUGAR: os ids (do editor, "edit:<id>") do que é de conjunto — o telhado, o forro hospedado e as bordas dele. A leitura da obra
     NÃO enxerga essas peças: o raio vertical que acerta o telhado de um conjunto já lançado leria a altura dele como se fosse da obra e o novo subiria. */
  function uidsDoConjunto(estado) {
    var ids = {}, set = {};
    arr(estado && estado.telhados).forEach(function (t) { if (t && t.conjunto) { ids[String(t.id)] = 1; set["edit:" + t.id] = 1; set[String(t.id)] = 1; } });
    arr(estado && estado.forros).forEach(function (f) { if (f && f.telhado != null && ids[String(f.telhado)]) { set["edit:" + f.id] = 1; set[String(f.id)] = 1; } });
    arr(estado && estado.bordas).forEach(function (b) { if (b && ids[String(b.telhado)]) { set["edit:" + b.id] = 1; set[String(b.id)] = 1; } });
    arr(estado && estado.calhasEmbutidas).forEach(function (b) { if (b && ids[String(b.telhado)]) { set["edit:" + b.id] = 1; set[String(b.id)] = 1; } });
    arr(estado && estado.rufosEncontro).forEach(function (b) { if (b && ids[String(b.telhado)]) { set["edit:" + b.id] = 1; set[String(b.id)] = 1; } });
    return set;
  }
  /* as amostras sem o que é de conjunto (hits[0] passa a ser o que vem abaixo do telhado do conjunto) */
  function semConjunto(estado, amostras) {
    var set = uidsDoConjunto(estado);
    if (!Object.keys(set).length) return arr(amostras);
    return arr(amostras).map(function (a) {
      if (!a) return a;
      return { x: a.x, z: a.z, hits: arr(a.hits).filter(function (h) { return !(h && h.uid != null && set[String(h.uid)]); }) };
    });
  }
  /* os conjuntos já lançados que o contorno novo cobre (área em comum; encostar na borda não conta): lista de ids de telhado */
  function distPoli(p, P) { if (dentro(p, P)) return 0; var m = Infinity; for (var i = 0; i < P.length; i++) m = Math.min(m, distSeg(p, P[i], P[(i + 1) % P.length])); return m; }
  /* o BEIRAL conta: o telhado ocupa o contorno MAIS o beiral dele; sobrepor só os contornos deixava beirais se cruzando, com telha e forro duplicados na faixa */
  function conjuntosSobre(estado, contorno, beiral) {
    var P = arr(contorno).map(pt), out = [], b1 = fin(num(beiral, NaN)) && beiral > 0 ? beiral : 0;
    if (P.length < 3) return out;
    var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    P.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); });
    x0 -= b1; x1 += b1; z0 -= b1; z1 += b1;
    var passo = Math.max(0.1, Math.min(x1 - x0, z1 - z0) / 40);
    arr(estado && estado.telhados).forEach(function (t) {
      if (!t || !t.conjunto || arr(t.contorno).length < 3) return;
      var Q = t.contorno.map(pt), b2 = num(t.beiral, 0), achou = false;
      for (var x = x0 + passo / 2; x < x1 && !achou; x += passo) for (var z = z0 + passo / 2; z < z1; z += passo) { var pp = [x, z]; if (distPoli(pp, P) <= b1 - 0.01 + (dentro(pp, P) ? 1 : 0) && distPoli(pp, Q) <= b2 - 0.01 + (dentro(pp, Q) ? 1 : 0)) { achou = true; break; } }
      if (achou) out.push(String(t.id));
    });
    return out;
  }

  /* ------------------------------------------------------------------ encontros (zero folga) */
  function conferirEncontros(estado, idTelhado) {
    var falhas = [], med = {}, T = BT(), C = BC();
    var t = arr(estado && estado.telhados).filter(function (x) { return x && x.conjunto && (idTelhado == null || String(x.id) === String(idTelhado)); })[0];
    if (!t || !t.pacote || !t.pacote.ok) return { ok: false, falhas: [{ tipo: "sem-conjunto", texto: "Sem telhado do conjunto no estado." }], medidas: med };
    var pk = t.pacote, ag = arr(t.aguasCalc).filter(function (x) { return x.plano && Math.abs(x.plano.bx || 0) + Math.abs(x.plano.bz || 0) > 1e-9; })[0], pl = ag.plano, s = Math.sqrt(pl.bx * pl.bx + pl.bz * pl.bz), f = Math.sqrt(1 + s * s);
    var y = function (x, z) { return pl.a + pl.bx * x + pl.bz * z; };
    /* 1) pilha: plano + eForro·f = fundo da terça; fundo + h·f = fundo da telha (1 mm) */
    var eF = num(t.conjunto.eForro, 0), terca = arr(pk.pecas).filter(function (o) { return o.p === "terca"; });
    var fundoT = eF * f; med.fundoTerca = r6(fundoT);
    terca.forEach(function (o) {
      var xm = (o.a[0] + o.b[0]) / 2, zm = (o.a[2] + o.b[2]) / 2, esp = o.a[1] - y(o.a[0], o.a[2]);
      if (Math.abs(esp - fundoT) > 0.001) falhas.push({ tipo: "terca-forro", texto: "Terça " + o.id + " a " + virg(esp * 1000, 2) + " mm do plano (esperado " + virg(fundoT * 1000, 2) + " mm).", valor: esp - fundoT });
      void xm; void zm;
    });
    var fTel = (eF + (terca[0] ? terca[0].h : 0)) * f;
    if (Math.abs(num(pk.camadas && pk.camadas.telha, 0) - fTel) > 0.001) falhas.push({ tipo: "telha-terca", texto: "Fundo da telha a " + virg(num(pk.camadas.telha, 0) * 1000, 2) + " mm do plano (esperado " + virg(fTel * 1000, 2) + " mm).", valor: num(pk.camadas.telha, 0) - fTel });
    /* 2) folga forro × terça: a face de cima do forro = a de baixo da terça */
    var forro = arr(estado.forros).filter(function (x) { return x && String(x.telhado) === String(t.id); })[0];
    if (!forro || !forro.ok) falhas.push({ tipo: "forro-ausente", texto: "O forro hospedado não existe ou não calculou." });
    else {
      var topoF = forro.cota + num(forro.espessura, 0) * Math.sqrt(1 + Math.pow(Math.tan(num(forro.inclinacao, 0) * Math.PI / 180), 2));
      terca.forEach(function (o0, io) {
        var x0 = o0.a[0], z0 = o0.a[2], cotaF = forro.cota + ((x0 * Math.cos(forro.dirInclinacao * Math.PI / 180) + z0 * Math.sin(forro.dirInclinacao * Math.PI / 180)) - num(forro.projMin, 0)) * Math.tan(num(forro.inclinacao, 0) * Math.PI / 180);
        var topoLocal = cotaF + num(forro.espessura, 0) * Math.sqrt(1 + Math.pow(Math.tan(num(forro.inclinacao, 0) * Math.PI / 180), 2));
        if (io === 0) med.folgaForroTerca = r6(o0.a[1] - topoLocal);
        if (Math.abs(o0.a[1] - topoLocal) > 0.001) falhas.push({ tipo: "forro-terca", texto: "Folga forro × terça de " + virg((o0.a[1] - topoLocal) * 1000, 2) + " mm (terça " + o0.id + ").", valor: o0.a[1] - topoLocal });
      });
      void topoF;
      /* o forro cobre a projeção do telhado */
      var Pf = arr(forro.contorno).map(function (q) { return [q.x, q.z]; }), aF = Math.abs(areaSinal(Pf));
      if (aF < num(t.areaProjecao, 0) - 1e-4) falhas.push({ tipo: "forro-projecao", texto: "O forro (" + virg(aF) + " m²) não cobre a projeção do telhado (" + virg(num(t.areaProjecao, 0)) + " m²)." });
      med.areaForro = r4(aF);
    }
    /* 3) pontas do X e das correntes dentro da seção da terça */
    var nVer = 0;
    arr(pk.pecas).forEach(function (o) {
      if (o.p !== "contravento" && o.p !== "corrente") return;
      [o.a, o.b].forEach(function (p) {
        var ok = terca.some(function (tc) {
          var ax = [tc.b[0] - tc.a[0], tc.b[1] - tc.a[1], tc.b[2] - tc.a[2]], L = Math.sqrt(ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2]), e = [ax[0] / L, ax[1] / L, ax[2] / L], d = [p[0] - tc.a[0], p[1] - tc.a[1], p[2] - tc.a[2]];
          var tt = d[0] * e[0] + d[1] * e[1] + d[2] * e[2]; if (tt < -0.02 || tt > L + 0.02) return false;
          var up = tc.up, w = [e[1] * up[2] - e[2] * up[1], e[2] * up[0] - e[0] * up[2], e[0] * up[1] - e[1] * up[0]], wl = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]); w = [w[0] / wl, w[1] / wl, w[2] / wl];
          var uu = d[0] * up[0] + d[1] * up[1] + d[2] * up[2], ww = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
          return uu >= -0.002 && uu <= tc.h + 0.002 && Math.abs(ww) <= tc.w / 2 + 0.002;
        });
        nVer++; if (!ok) falhas.push({ tipo: "x-terca", texto: "Ponta de " + o.p + " fora da seção de uma terça.", valor: null });
      });
    });
    med.pontasVerificadas = nVer;
    /* 4) calha sem peça solta e o encaixe telha × calha; testeira × rufo */
    arr(estado.bordas).forEach(function (b) {
      if (String(b.telhado) !== String(t.id)) return;
      if (b.tipoBorda === "calha") {
        var p = b.perfil; med.calhaBocais = p ? arr(p.bocais).length : 0;
        if (!p || !arr(p.bocais).length) falhas.push({ tipo: "calha-sem-bocal", texto: "A calha " + b.id + " não tem bocal: sem caimento." });
        else {
          med.calhaDesnivel = p.desnivel;
          /* o fundo da telha vem do PLANO + a camada do pacote (não das próprias bordas: seria conferir o motor com ele mesmo) */
          var yRimMax = Math.max.apply(null, p.subs.map(function (u) { return u.yRim; })), yTelhaBaixo = Math.min.apply(null, arr(b.segs).map(function (sg) { return Math.min(y(sg.a.x, sg.a.z), y(sg.b.x, sg.b.z)) + num(pk.camadas.telha, 0); }));
          med.folgaCalhaTelha = r6(yTelhaBaixo - yRimMax);
          if (Math.abs((yTelhaBaixo - yRimMax) - (C ? C.FOLGA_VERTICAL : 0.02)) > 0.001) falhas.push({ tipo: "calha-telha", texto: "A borda da calha está a " + virg((yTelhaBaixo - yRimMax) * 1000, 1) + " mm da telha (esperado " + virg((C ? C.FOLGA_VERTICAL : 0.02) * 1000, 1) + " mm).", valor: yTelhaBaixo - yRimMax });
          if (!(p.desnivel > 0)) falhas.push({ tipo: "calha-caimento", texto: "A calha " + b.id + " não tem caimento (desnível zero)." });
        }
      }
      if (b.tipoBorda === "testeira") {
        /* a testeira RECUADA (aresta da calha) para no FUNDO da telha, que segue por cima dela até a calha; a das arestas livres vai até a face de cima */
        var esperado = r4(num(pk.camadas.telha, 0) + (num(b.recuo, 0) > 0 ? 0 : num(pk.telhaEsp, 0)));
        med.testeira = b.alturaEf;
        /* a POSIÇÃO: o topo da chapa na face de cima da telha e o pé no plano (face de baixo do forro) — a chapa é pendurada do y do segmento para baixo */
        var dTopo = 0, dPe = 0;
        arr(b.segs).forEach(function (sg) { [sg.a, sg.b].forEach(function (q) { var yPlano = y(q.x, q.z); dTopo = Math.max(dTopo, Math.abs(q.y - (yPlano + esperado))); dPe = Math.max(dPe, Math.abs((q.y - num(b.alturaEf, 0)) - yPlano)); }); });
        med.testeiraDesvioTopo = r6(dTopo); med.testeiraDesvioPe = r6(dPe);
        if (dTopo > 0.0006 || dPe > 0.0006) falhas.push({ tipo: "testeira-posicao", texto: "A testeira está fora do pacote: o topo desvia " + virg(dTopo * 1000, 1) + " mm da face de cima da telha e o pé " + virg(dPe * 1000, 1) + " mm do plano do forro.", valor: Math.max(dTopo, dPe) });
        if (Math.abs(num(b.alturaEf, 0) - esperado) > 0.0006) falhas.push({ tipo: "testeira-rufo", texto: "A testeira (" + virg(num(b.alturaEf, 0) * 100, 2) + " cm) não fecha o pacote (" + virg(esperado * 100, 2) + " cm): há vão aberto.", valor: num(b.alturaEf, 0) - esperado });
      }
    });
    /* 5) PRESENÇA E POSIÇÃO (A9): apagar a calha, o rufo ou a testeira, ou deslocá-los, não pode dar ok */
    var bsT = arr(estado.bordas).filter(function (b) { return b && String(b.telhado) === String(t.id); }), calhasT = bsT.filter(function (b) { return b.tipoBorda === "calha"; }), rufosT = bsT.filter(function (b) { return b.tipoBorda === "rufo"; }), testT = bsT.filter(function (b) { return b.tipoBorda === "testeira"; });
    var nArestas = arr(t.contorno).length;
    if (!calhasT.length) falhas.push({ tipo: "calha-ausente", texto: "O conjunto não tem calha." });
    if (nArestas > 1 && !rufosT.length) falhas.push({ tipo: "rufo-ausente", texto: "O conjunto não tem rufo nas arestas livres." });
    if (!testT.length) falhas.push({ tipo: "testeira-ausente", texto: "O conjunto não tem testeira." });
    var cobertas = {}; testT.forEach(function (b) { arr(b.arestas).forEach(function (k) { cobertas[k] = 1; }); });
    for (var ka = 0; ka < nArestas; ka++) if (testT.length && !cobertas[ka]) falhas.push({ tipo: "aresta-aberta", texto: "A aresta " + (ka + 1) + " ficou sem testeira: o pacote está aberto nela." });
    /* distância assinada de um ponto à linha do beiral da aresta k, positiva para DENTRO do telhado */
    function dentroDoBeiral(k, q) {
      var e = arr(t.arestasCalc).filter(function (x) { return x.orig === k; })[0]; if (!e || !e.beiral || !e.parede) return null;
      var ax = e.beiral.a.x, az = e.beiral.a.z, dx = e.beiral.b.x - ax, dz = e.beiral.b.z - az, L = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / L, nz = dx / L;
      if ((e.parede.a.x - ax) * nx + (e.parede.a.z - az) * nz < 0) { nx = -nx; nz = -nz; }
      return (q.x - ax) * nx + (q.z - az) * nz;
    }
    calhasT.forEach(function (b) {
      var p = b.perfil, k = arr(b.arestas)[0]; if (!p || !arr(p.subs).length) return;
      var s0 = p.subs[0], dI = s0.ia ? dentroDoBeiral(k, s0.ia) : null, dO = s0.oa ? dentroDoBeiral(k, s0.oa) : null;
      if (num(b.larguraEf, 0) < 0.10 - 1e-9 || num(b.alturaEf, 0) < 0.05 - 1e-9) falhas.push({ tipo: "calha-fina", texto: "A calha tem " + virg(num(b.larguraEf, 0) * 1000, 0) + " × " + virg(num(b.alturaEf, 0) * 1000, 0) + " mm: abaixo do mínimo para escoar.", valor: num(b.larguraEf, 0) });
      if (dI != null && Math.abs(dI - LIM.avancoTelha) > 0.003) falhas.push({ tipo: "calha-posicao", texto: "A telha avança " + virg(dI * 100, 1) + " cm dentro da calha (esperado " + virg(LIM.avancoTelha * 100, 0) + " cm): a calha está deslocada do beiral.", valor: dI });
      if (dI != null && dO != null && Math.abs((dI - dO) - num(b.larguraEf, 0)) > 0.003) falhas.push({ tipo: "calha-largura", texto: "A largura desenhada da calha não é a da seção.", valor: dI - dO });
      /* a testeira da aresta da calha não atravessa o canal: a face de fora dela fica do lado de dentro da face interna da calha */
      testT.forEach(function (tb) {
        if (arr(tb.arestas).indexOf(k) < 0 || !arr(tb.segs).length || dI == null) return;
        var dT = dentroDoBeiral(k, tb.segs[0].a);
        if (dT != null && (dT - num(tb.larguraEf, 0.025) / 2) < dI - LIM.folgaCalhaTesteiraM) falhas.push({ tipo: "testeira-calha", texto: "A testeira atravessa a calha: a face de fora dela passa " + virg((dI - (dT - num(tb.larguraEf, 0.025) / 2)) * 1000, 1) + " mm da face interna da calha.", valor: dI - (dT - num(tb.larguraEf, 0.025) / 2) });
      });
    });
    /* o rufo cobre a borda de cima da telha: o topo passa da face da telha e o pé desce abaixo do fundo dela */
    rufosT.forEach(function (rb) {
      var piorTopo = Infinity, piorFundo = -Infinity, tEsp = num(pk.telhaEsp, 0);
      arr(rb.segs).forEach(function (sg) { [sg.a, sg.b].forEach(function (q) { var pt = y(q.x, q.z); piorTopo = Math.min(piorTopo, q.y - (pt + num(pk.camadas.telha, 0) + tEsp)); piorFundo = Math.max(piorFundo, (q.y - num(rb.alturaEf, 0)) - (pt + num(pk.camadas.telha, 0))); }); });
      med.rufoTopoSobreTelha = r6(piorTopo); med.rufoPeSobreFundoTelha = r6(piorFundo);
      if (piorTopo < 0.005) falhas.push({ tipo: "rufo-telha", texto: "O rufo " + rb.id + " NÃO cobre a borda de cima da telha: o topo dele está " + virg(piorTopo * 1000, 1) + " mm da face da telha (precisa passar dela).", valor: piorTopo });
      if (piorFundo > -0.015) falhas.push({ tipo: "rufo-telha", texto: "O rufo " + rb.id + " não desce abaixo do fundo da telha.", valor: piorFundo });
    });
    /* calços: cada um sobre uma linha de apoio VIVA */
    var apV = arr(pk.conjunto && pk.conjunto.apoiosVivos);
    arr(pk.pecas).forEach(function (o) {
      if (o.p !== "calco" || !apV.length) return;
      var dmin = Infinity; apV.forEach(function (ap) { dmin = Math.min(dmin, distSeg([o.a[0], o.a[2]], [ap.ax, ap.az], [ap.bx, ap.bz])); });
      if (dmin > LIM.distCalcoApoioM) falhas.push({ tipo: "calco-solto", texto: "O calço " + o.id + " fica a " + virg(dmin * 100, 0) + " cm da linha de apoio mais próxima: está solto.", valor: dmin });
    });
    /* o X nos dois painéis extremos de cada faixa entre terças */
    if (terca.length) {
      var tdx = terca[0].b[0] - terca[0].a[0], tdz = terca[0].b[2] - terca[0].a[2], tL = Math.sqrt(tdx * tdx + tdz * tdz) || 1; tdx /= tL; tdz /= tL;
      var tLo = Infinity, tHi = -Infinity; terca.forEach(function (o) { [o.a, o.b].forEach(function (q) { var tt = q[0] * tdx + q[2] * tdz; tLo = Math.min(tLo, tt); tHi = Math.max(tHi, tt); }); });
      var porFx = {}; arr(pk.pecas).forEach(function (o) { if (o.p === "contravento") { var tm = ((o.a[0] + o.b[0]) / 2) * tdx + ((o.a[2] + o.b[2]) / 2) * tdz, g = porFx[o.fileira] = porFx[o.fileira] || { lo: 0, hi: 0 }; if (tm < (tLo + tHi) / 2) g.lo++; else g.hi++; } });
      Object.keys(porFx).forEach(function (kf) { if (porFx[kf].lo < 2 || porFx[kf].hi < 2) falhas.push({ tipo: "x-painel", texto: "A faixa " + kf + " tem X só numa ponta (" + porFx[kf].lo + " barras de um lado e " + porFx[kf].hi + " do outro): precisa dos dois painéis extremos.", valor: null }); });
    }
    /* o plano é o que a leitura da obra deu */
    if (fin(num(t.conjunto.y0Lido, NaN)) && Math.abs(num(t.cotaApoio, 0) - num(t.conjunto.y0Lido, 0)) > 0.002) falhas.push({ tipo: "plano-leitura", texto: "O plano do telhado está em " + virg(num(t.cotaApoio, 0), 3) + " m e a leitura da obra deu " + virg(num(t.conjunto.y0Lido, 0), 3) + " m.", valor: num(t.cotaApoio, 0) - num(t.conjunto.y0Lido, 0) });
    /* V0 informado: o vento entrou (sucção negativa) ou a tela tem o motivo de não ter entrado */
    var cc = t.conjunto.calc, v0c = num(t.conjunto.v0, 0);
    if (cc && v0c > 0 && cc.ok) {
      if (cc.comVento && !(num(cc.wSuc, 0) < 0)) falhas.push({ tipo: "vento-zerado", texto: "V0 informado e o vento verificado, mas a sucção gravada é " + cc.wSuc + " kN/m².", valor: cc.wSuc });
      if (!cc.comVento && !cc.ventoMotivo) falhas.push({ tipo: "vento-sem-motivo", texto: "V0 informado, o vento não entrou e não há motivo gravado.", valor: null });
    }
    void T;
    return { ok: falhas.length === 0, falhas: falhas, medidas: med };
  }

  var BimTelhadoParam = {
    MODELO: MODELO, TELHA_PADRAO: TELHA_PADRAO, FORRO_PADRAO: FORRO_PADRAO, FORROS: FORROS, ABA_MIN: ABA_MIN, LIM: LIM, FONTES: FONTES,
    quadro: quadro, amostrasDe: amostrasDe, sugerirQueda: sugerirQueda, lerObra: lerObra, apoiosDe: apoiosDe, dimensionarTercas: dimensionarTercas, ventoEnvoltoria: ventoEnvoltoria,
    montarLote: montarLote, servicosDe: servicosDe, pendenciasVerificacao: pendenciasVerificacao, pendenciasMembros: pendenciasMembros, opsAjustarForro: opsAjustarForro, foraDoTotalDe: foraDoTotalDe, apoiosBordaBorda: apoiosBordaBorda, registroCalc: registroCalc, opsApagar: opsApagar, uidsDoConjunto: uidsDoConjunto, TIPOS_SEM_TOPO: TIPOS_SEM_TOPO, semConjunto: semConjunto, conjuntosSobre: conjuntosSobre, refazerVerificacao: refazerVerificacao, eConjunto: eConjunto, conferirEncontros: conferirEncontros,
    hashDe: hashDe, entradaDoHash: entradaDoHash, verificacaoAtual: verificacaoAtual, proximoId: proximoId
  };
  global.BimTelhadoParam = BimTelhadoParam;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTelhadoParam;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
