/* =====================================================================
 * simboloporta.js — SÍMBOLO DE ABERTURA DA PORTA NA PLANTA (09/10/2026)
 *
 * Pedido do Rogério: na planta baixa a porta saía como janela — só o vão
 * cortado na parede. Quem lê a planta precisa ver que ali é PORTA: a folha
 * desenhada aberta a 90° (retângulo fino da espessura da folha) e o ARCO do
 * giro (quarto de círculo, raio = largura da folha), do lado e no sentido
 * certos.
 *
 * MOTOR PURO (ES5, Node-testável, sem DOM e sem three.js):
 *   gerar(o) → as linhas e arcos da planta, em METROS, no plano do desenho
 *     o = { centro:[x,y] (meio do vão no EIXO da parede), dir:[ux,uy] (eixo
 *           da parede = +x local), largura (largura livre da(s) folha(s)),
 *           espParede, espFolha (0,035), dobradica ('ini' = ponta −x local,
 *           'fim' = ponta +x; aceita 'esquerda'/'direita' = ini/fim),
 *           abre (+1 = abre para o lado da normal n = [−uy, ux]; −1 = o
 *           outro), tipo ('giro' | 'giro-duplo' | 'correr'), folhas (1|2),
 *           vaivem (giro para os dois lados) }
 *     → { ok, tipo, folhas:[[[x,y]×4]], arcos:[{ c, r, de, ate }],
 *         linhas:[[x1,y1,x2,y2]], aviso }
 *     O ARCO começa no centro da DOBRADIÇA: c = a dobradiça, de = a ponta
 *     livre da folha FECHADA (no vão), ate = a ponta da folha ABERTA a 90°.
 *     Arco sempre ≤ 90°: quem desenha (js/desenho2d.js, js/bimdxf.js) acha o
 *     sentido pelo produto vetorial (de − c) × (ate − c) — vale com o desenho
 *     espelhado (forro refletido) e com o Y da tela para baixo.
 *   daFamilia(fam, av, inst) → a porta NATIVA (js/familia.js avaliada) no
 *     sistema LOCAL da família: { tipo, folhas, dobradica, abre, largura,
 *     espFolha, espParede, folhaIds } (folhaIds = os sólidos da folha, que a
 *     planta deixa de cortar: a folha aparece ABERTA, não fechada no vão).
 *   daIfc(op) → o OperationType do IfcDoor / IfcDoorType / IfcDoorStyle
 *     → { tipo, folhas, mao ('esquerda'|'direita'), vaivem, aproximado }.
 *   ladoIfc(eixoX, eixoY) → no plano (x, z) da cena, a dobradiça LEFT do IFC
 *     cai na ponta 'ini' ou 'fim' do eixo X da porta (IFC: a folha abre para
 *     +Y local; LEFT = dobradiça à esquerda de quem olha na direção de +Y).
 *
 * PENAS (NBR 8403, js/desenho2d.js): o ARCO e a seta do correr na pena de
 * VISTA (fina, projeção); a FOLHA na pena de MARCA (média). No DXF
 * (js/bimdxf.js): camadas ARQ-PORTA-GIRO e ARQ-PORTA-FOLHA.
 * Sem tipo conhecido: giro simples pelo lado gravado — porta nunca fica sem
 * símbolo.
 * Teste: node tools/test-simboloporta.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var ESP_FOLHA = 0.035;

  function num(v, pad) { var n = +v; return isFinite(n) ? n : pad; }
  function norm(v) { var L = Math.sqrt(v[0] * v[0] + v[1] * v[1]); return L > 1e-12 ? [v[0] / L, v[1] / L] : null; }
  function ladoDob(d) {
    var s = String(d == null ? "" : d).toLowerCase();
    return (s === "fim" || s === "direita" || s === "right" || s === "d") ? "fim" : "ini";
  }

  /* --------------------------------------------------------------- gerar */
  function gerar(o) {
    o = o || {};
    var u = norm(o.dir || [1, 0]) || [1, 0], n = [-u[1], u[0]];
    var c0 = o.centro || [0, 0], cx = num(c0[0], 0), cy = num(c0[1], 0);
    var L = num(o.largura, 0), e = Math.max(0, num(o.espParede, 0)), ef = num(o.espFolha, ESP_FOLHA);
    if (!(ef > 0)) ef = ESP_FOLHA;
    var sg = num(o.abre, 1) < 0 ? -1 : 1, dob = ladoDob(o.dobradica);
    var tipo = String(o.tipo || "giro"), nf = num(o.folhas, 0) === 2 ? 2 : 1, aviso = "";
    if (tipo !== "giro" && tipo !== "giro-duplo" && tipo !== "correr") { aviso = "tipo de abertura \"" + tipo + "\" sem desenho próprio: giro simples"; tipo = "giro"; nf = 1; }
    if (tipo === "giro-duplo") nf = 2;
    if (tipo === "giro" && nf === 2) tipo = "giro-duplo";
    var out = { ok: false, tipo: tipo, folhas: [], arcos: [], linhas: [], aviso: aviso };
    if (!(L > 0.05)) { out.aviso = "porta sem largura"; return out; }
    out.ok = true;
    /* (s, t) local → plano: s ao longo da parede, t na normal */
    function P(s, t) { return [cx + u[0] * s + n[0] * t, cy + u[1] * s + n[1] * t]; }
    function ret(s0, t0, s1, t1) { return [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)]; }

    /* GIRO: folha de largura W, dobradiça em sH, abrindo para o lado lado (±1) */
    function giro(sH, sLivre, W, lado) {
      var f = e / 2, ds = sLivre > sH ? 1 : -1;
      out.folhas.push(ret(sH, lado * f, sH + ds * ef, lado * (f + W)));
      out.arcos.push({ c: P(sH, lado * f), r: W, de: P(sLivre, lado * f), ate: P(sH, lado * (f + W)) });
    }
    function seta(s0, s1, t) {
      var cab = Math.min(0.08, Math.abs(s1 - s0) * 0.35), ds = s1 > s0 ? 1 : -1;
      var a = P(s0, t), b = P(s1, t), b1 = P(s1 - ds * cab, t + cab * 0.5), b2 = P(s1 - ds * cab, t - cab * 0.5);
      out.linhas.push([a[0], a[1], b[0], b[1]], [b[0], b[1], b1[0], b1[1]], [b[0], b[1], b2[0], b2[1]]);
    }

    if (tipo === "giro") {
      var sH = dob === "fim" ? L / 2 : -L / 2;
      giro(sH, -sH, L, sg);
      if (o.vaivem) { var fv = e / 2; out.arcos.push({ c: P(sH, -sg * fv), r: L, de: P(-sH, -sg * fv), ate: P(sH, -sg * (fv + L)) }); }
    } else if (tipo === "giro-duplo") {
      var W2 = L / 2;
      giro(-L / 2, 0, W2, sg);
      giro(L / 2, 0, W2, sg);
      if (o.vaivem) {
        var fw = e / 2;
        [-L / 2, L / 2].forEach(function (sh) { out.arcos.push({ c: P(sh, -sg * fw), r: W2, de: P(0, -sg * fw), ate: P(sh, -sg * (fw + W2)) }); });
      }
    } else {
      /* CORRER: as folhas FECHADAS em trilhos paralelos à parede + a seta do
         sentido em que cada uma corre (fora da parede, no lado `abre`) */
      var tS = sg * (e / 2 + 0.12);
      if (nf === 2) {
        var w = L / 2 + 0.025, tr = ef * 0.6;
        out.folhas.push(ret(-L / 2, -tr - ef / 2, -L / 2 + w, -tr + ef / 2));
        out.folhas.push(ret(L / 2 - w, tr - ef / 2, L / 2, tr + ef / 2));
        seta(-L / 2 + w * 0.2, -L / 2 + w * 0.8, tS);   /* a da ponta ini corre para o meio */
        seta(L / 2 - w * 0.2, L / 2 - w * 0.8, tS);
      } else {
        /* uma folha de sobrepor na face do lado `abre`, correndo para a ponta da `dobradica` */
        var tf = sg * (e / 2 + 0.005 + ef / 2), dsC = dob === "fim" ? 1 : -1;
        out.folhas.push(ret(-L / 2 - 0.025, tf - ef / 2, L / 2 + 0.025, tf + ef / 2));
        seta(-dsC * L * 0.3, dsC * L * 0.3, tS);
      }
    }
    return out;
  }

  /* ----------------------------------------------------- porta NATIVA */
  /* o tipo pela família: id, nome e descrição (biblioteca RA e cópias) e os
     sólidos da folha ("Folha", "Folha 1", "Folha esquerda"…) */
  function daFamilia(fam, av, inst) {
    fam = fam || {}; av = av || {}; inst = inst || {};
    var val = av.valores || {}, sol = av.solidos || [];
    var txt = (String(fam.id || "") + " " + String(fam.nome || "") + " " + String(fam.descricao || "")).toLowerCase();
    var folhas = sol.filter(function (s) { return s && s.forma === "caixa" && /^folha/i.test(String(s.nome || "")); });
    var mac = sol.filter(function (s) { return s && /ma[cç]aneta|puxador/i.test(String(s.nome || "")); })[0];
    var tipo = /correr/.test(txt) ? "correr" : (/(2 ?f\b|2 folhas|duas folhas)/.test(txt) || (folhas.length === 2 && !/correr/.test(txt)) ? "giro-duplo" : "giro");
    var nf = tipo === "giro" ? 1 : (tipo === "giro-duplo" ? 2 : (folhas.length === 1 ? 1 : 2));
    /* largura livre: "Largura" da família; senão o vão */
    var L = num(val.Largura, 0) > 0 ? num(val.Largura, 0) : (av.abertura ? num(av.abertura.largura, 0) : 0);
    var ef = num(val.Espessura_folha, 0) > 0 ? num(val.Espessura_folha, 0) : (folhas[0] && folhas[0].dz > 0 && folhas[0].dz < 0.2 ? folhas[0].dz : ESP_FOLHA);
    var ep = num(inst.Espessura_parede, 0) > 0 ? num(inst.Espessura_parede, 0) : num(val.Espessura_parede, 0.15);
    /* SENTIDO (para que face abre, eixo z local): Abre_para_fora gravado → +z; senão o lado em
       que a folha encosta (z do sólido — a folha encosta na face para onde abre); senão −z (para dentro) */
    var abre = -1, apf = inst.Abre_para_fora != null ? inst.Abre_para_fora : val.Abre_para_fora;
    if (apf != null) abre = (apf === true || apf === 1 || apf === "1" || String(apf).toLowerCase() === "true" || String(apf).toLowerCase() === "sim") ? 1 : -1;
    else if (folhas[0] && Math.abs(num(folhas[0].z, 0)) > 1e-4) abre = folhas[0].z > 0 ? 1 : -1;
    /* MÃO (lado da dobradiça, eixo x local): parâmetro gravado vence; senão o lado OPOSTO à maçaneta; senão −x */
    var dob = "ini", mao = inst.Dobradica != null ? inst.Dobradica : (inst.Mao != null ? inst.Mao : null);
    if (mao != null && String(mao).trim() !== "") dob = ladoDob(mao);
    else if (mac && Math.abs(num(mac.x, 0)) > 1e-4) dob = mac.x > 0 ? "ini" : "fim";
    if (inst.Mao_direita === true || inst.Dobradica_direita === true) dob = "fim";
    return { tipo: tipo, folhas: nf, dobradica: dob, abre: abre, largura: L, espFolha: ef, espParede: ep,
             folhaIds: folhas.map(function (s) { return s.id; }) };
  }

  /* ------------------------------------------------------- porta do IFC */
  /* IfcDoorTypeOperationEnum (IFC4) e IfcDoorStyleOperationEnum (IFC2x3) */
  function daIfc(op) {
    var s = String(op == null ? "" : op).toUpperCase().replace(/^\./, "").replace(/\.$/, "");
    var r = { tipo: "giro", folhas: 1, mao: "esquerda", vaivem: false, aproximado: false, op: s || "NOTDEFINED" };
    if (/^SINGLE_SWING_(LEFT|RIGHT)$/.test(s)) r.mao = /RIGHT/.test(s) ? "direita" : "esquerda";
    else if (/^DOUBLE_SWING_(LEFT|RIGHT)$/.test(s)) { r.mao = /RIGHT/.test(s) ? "direita" : "esquerda"; r.vaivem = true; }
    else if (/^DOUBLE_DOOR_SINGLE_SWING/.test(s)) { r.tipo = "giro-duplo"; r.folhas = 2; }
    else if (s === "DOUBLE_DOOR_DOUBLE_SWING") { r.tipo = "giro-duplo"; r.folhas = 2; r.vaivem = true; }
    else if (/^SLIDING_TO_(LEFT|RIGHT)$/.test(s)) { r.tipo = "correr"; r.mao = /RIGHT/.test(s) ? "direita" : "esquerda"; }
    else if (s === "DOUBLE_DOOR_SLIDING") { r.tipo = "correr"; r.folhas = 2; }
    else if (/^SWING_FIXED_(LEFT|RIGHT)$/.test(s)) r.mao = /RIGHT/.test(s) ? "direita" : "esquerda";
    else r.aproximado = true;   /* FOLDING, REVOLVING, ROLLINGUP, USERDEFINED, NOTDEFINED: giro simples */
    return r;
  }
  /* no plano (x, z) da cena (Y para cima): de que ponta do eixo X da porta fica a dobradiça
     "esquerda" do IFC — a esquerda de quem olha na direção de +Y local (o lado para onde a
     folha abre). esquerda = cima × frente = (fz, −fx). Devolve 'ini' (−X) ou 'fim' (+X). */
  function ladoIfc(eixoX, eixoY, mao) {
    var ux = norm(eixoX || [1, 0]) || [1, 0], f = norm(eixoY || [-ux[1], ux[0]]) || [-ux[1], ux[0]];
    var esq = [f[1], -f[0]], d = esq[0] * ux[0] + esq[1] * ux[1];
    var ladoEsq = d > 0 ? "fim" : "ini";
    return String(mao || "esquerda") === "direita" ? (ladoEsq === "fim" ? "ini" : "fim") : ladoEsq;
  }
  /* a porta do IFC no plano: pontos da malha (x, z), eixos X e Y locais projetados e o
     OperationType → a entrada do gerar() (largura e espessura pela malha, no eixo da porta) */
  function entradaIfc(pts, eixoX, eixoY, op) {
    var ux = norm(eixoX || [1, 0]) || [1, 0], n = [-ux[1], ux[0]], f = norm(eixoY || n) || n;
    var s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    (pts || []).forEach(function (p) {
      var s = p[0] * ux[0] + p[1] * ux[1], t = p[0] * n[0] + p[1] * n[1];
      if (s < s0) s0 = s; if (s > s1) s1 = s; if (t < t0) t0 = t; if (t > t1) t1 = t;
    });
    if (!(s1 > s0)) return null;
    var ti = daIfc(op), sm = (s0 + s1) / 2, tm = (t0 + t1) / 2;
    return { centro: [ux[0] * sm + n[0] * tm, ux[1] * sm + n[1] * tm], dir: ux, largura: s1 - s0, espParede: Math.max(0, t1 - t0),
             espFolha: ESP_FOLHA, dobradica: ladoIfc(ux, f, ti.mao), abre: (f[0] * n[0] + f[1] * n[1]) < 0 ? -1 : 1,
             tipo: ti.tipo, folhas: ti.folhas, vaivem: ti.vaivem, aproximado: ti.aproximado, op: ti.op };
  }

  /* os pontos de um símbolo (para a caixa do desenho e o recorte da vista) */
  function pontos(sp) {
    var p = [];
    (sp.folhas || []).forEach(function (f) { f.forEach(function (q) { p.push(q); }); });
    (sp.arcos || []).forEach(function (a) {
      p.push(a.de, a.ate);
      var mx = (a.de[0] + a.ate[0]) / 2 - a.c[0], my = (a.de[1] + a.ate[1]) / 2 - a.c[1], L = Math.sqrt(mx * mx + my * my) || 1;
      p.push([a.c[0] + mx / L * a.r, a.c[1] + my / L * a.r]);   /* o meio do arco */
    });
    (sp.linhas || []).forEach(function (l) { p.push([l[0], l[1]], [l[2], l[3]]); });
    return p;
  }
  /* sentido do arco no plano do desenho: true = do `de` ao `ate` girando no sentido do ângulo
     POSITIVO (x → y) — no SVG (Y para baixo) é o sweep-flag 1 */
  function positivo(a) { return ((a.de[0] - a.c[0]) * (a.ate[1] - a.c[1]) - (a.de[1] - a.c[1]) * (a.ate[0] - a.c[0])) > 0; }

  var SimboloPorta = { ESP_FOLHA: ESP_FOLHA, gerar: gerar, daFamilia: daFamilia, daIfc: daIfc, ladoIfc: ladoIfc, entradaIfc: entradaIfc, pontos: pontos, positivo: positivo };
  global.SimboloPorta = SimboloPorta;
  if (typeof module !== "undefined" && module.exports) module.exports = SimboloPorta;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
