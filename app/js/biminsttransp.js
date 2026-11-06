/* =====================================================================
 * biminsttransp.js — a CURVA DE TRANSPOSIÇÃO soldável (água fria): a regra de "cabe ou não cabe". Motor PURO, ES5, Node-testável.
 * Global: HidTransp.
 *
 * POR QUE (06/11/2026, pedido do Rogério): "existe a curva de transposição, para tubo de água fria, tubo marrom. Quando houver
 * interferência, você coloca uma curva de transposição; dá para passar um tubo pelo outro sem interferência." Até aqui o Traçar
 * automaticamente desviava (zigue-zague) e a peça nunca saía. Esta regra é a única verdade para os três usos: o motor do traçado
 * (js/hidrota.js, o A* escolhe a mais barata entre a peça e o desvio), a inserção à mão (js/biminstcolocar.js) e o aviso da tela.
 *
 * FONTE DA MEDIDA: Amanco Wavin, FT de água fria soldável FTC000001 (rev. Out/2025), pág. 17, "Curva de Transposição" (A, B, D, R
 * por DN) — lida no desenho da própria ficha e gravada em js/biminstgeodados.js (conexoes.pvc_soldavel.curva_transposicao) pelo
 * tools/gerar-hidgeo-dados.js. A LEITURA: A = meio comprimento (o desenho marca A dos dois lados, da face da bolsa ao centro) ⇒ a
 * peça mede 2·A de ponta a ponta; D = DE do tubo; B = Ø externo da bolsa; R = raio do arco central (a curva de baixo, sobre o
 * tubo cruzado).
 *   ⚠ PENDENTE: o desenho marca a letra C (altura total do arco) mas a tabela NÃO traz o valor. Sem C não se afirma a folga livre
 *   por cima do tubo cruzado. Regra CONSERVADORA usada aqui: o tubo cruzado tem DE ≤ D (o mesmo DN da peça) e DE ≤ 2·R (cabe sob o
 *   arco pelo raio lido) — o menor dos dois. Para o DN 20 (D = 20, R = 13): DE ≤ 20 mm. Confirmar com a peça física.
 *
 * ESCOPO (pedido do Rogério): só o DN que ele pediu — PVC soldável DN 20. A ficha traz também 25 e 32; ficam FORA até alguém validar
 * (DN_PERMITIDOS). A peça de PPR (Amanco 92349, outro material) NÃO entra.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  var MM = 1 / 1000;
  var TIPO = "curva_transposicao", MATERIAL = "pvc_soldavel";
  /* o DN que o Rogério pediu (05/11/2026); o catálogo tem 25 e 32 sem validação — não entram */
  var DN_PERMITIDOS = [20];   // hid:ok escopo do pedido, não é norma
  var AGUA = { agua_fria: 1, agua_quente: 1 };
  /* os dois tubos cruzam a 90° ± ~5° (o seno de 5°) e na mesma cota ± 5 mm — tolerâncias de GEOMETRIA, não de norma */
  var TOL_COS = 0.087, TOL_COTA = 0.005, FIM_TUBO = 0.02, EPS = 1e-9, EPS_DEN = 1e-12;   // hid:ok

  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function ficha(dn) {
    var GD = dep("HidGeoDados", "./biminstgeodados.js"), c = GD && GD.conexoes && GD.conexoes[MATERIAL] && GD.conexoes[MATERIAL][TIPO];
    return c ? (c[String(dn)] || null) : null;
  }
  /* a regra da peça no DN (m / mm); null = a peça não serve a este DN (fora do escopo ou fora do catálogo) */
  function regra(dn) {
    dn = Number(dn);
    var f = ficha(dn);
    if (!f || DN_PERMITIDOS.indexOf(dn) < 0 || !(f.A > 0) || !(f.D > 0) || !(f.R > 0)) return null;
    return { dn: dn, tipo: TIPO, material: MATERIAL,
             A: f.A * MM,                                  /* m: da face da bolsa ao centro — a reta livre que cada lado precisa */
             L: (f.L != null ? f.L : 2 * f.A) * MM,        /* m: comprimento total */
             deMaxCruzado: Math.min(f.D, 2 * f.R),         /* mm: o maior DE de tubo que passa sob o arco (conservador; ver o cabeçalho) */
             hArco: (f.R + f.D / 2) * MM,                  /* m: a crista acima do eixo (R + D/2) — só o desenho 3D */
             codigo: f.codigo || null,
             fonte: "Amanco Wavin FT FTC000001 (rev. Out/2025) pág. " + f.pag + ": A " + f.A + ", B " + f.od + ", D " + f.D + ", R " + f.R + " mm; altura C do arco não tabelada (pendente)" };
  }

  function cm(m) { return Math.round(m * 1000) / 10; }   // hid:ok formatação do texto: metros → centímetros com uma casa
  function graus(c) { return Math.round(Math.acos(Math.min(1, Math.max(0, num(c, 1)))) * 180 / Math.PI); }   // hid:ok formatação do texto: |cos| → graus
  /* o cruzamento EM PLANTA de dois tubos retos (x, z; cotas y): { x, z, sa, sb (m, ao longo de cada um a partir de p1), cos (|cos| do ângulo
     entre as direções), dy (cota de b − a no ponto) } ou null (paralelos, ou não se cruzam longe das pontas) */
  function cruzamento(a, b) {
    var dax = a.p2.x - a.p1.x, daz = a.p2.z - a.p1.z, dbx = b.p2.x - b.p1.x, dbz = b.p2.z - b.p1.z;
    var La = Math.sqrt(dax * dax + daz * daz), Lb = Math.sqrt(dbx * dbx + dbz * dbz);
    if (!(La > EPS) || !(Lb > EPS)) return null;
    var den = dax * dbz - daz * dbx;
    if (Math.abs(den) < EPS_DEN) return null;
    var wx = b.p1.x - a.p1.x, wz = b.p1.z - a.p1.z;
    var ta = (wx * dbz - wz * dbx) / den, tb = (wx * daz - wz * dax) / den;
    var sa = ta * La, sb = tb * Lb;
    if (sa < FIM_TUBO || sa > La - FIM_TUBO || sb < FIM_TUBO || sb > Lb - FIM_TUBO) return null;   /* na ponta é junção, não cruzamento */
    var ya = a.p1.y + (a.p2.y - a.p1.y) * ta, yb = b.p1.y + (b.p2.y - b.p1.y) * tb;
    return { x: a.p1.x + dax * ta, z: a.p1.z + daz * ta, sa: sa, sb: sb, La: La, Lb: Lb, cos: Math.abs((dax * dbx + daz * dbz) / (La * Lb)), dy: yb - ya, ya: ya };
  }

  /* os pontos (m, ao longo do tubo `t` a partir de p1) onde ele tem NÓ: as duas pontas e toda ponta de OUTRO tubo do mesmo sistema que cai no
     eixo dele (derivação). `tol` = a tolerância de ponta do motor (BimInst.TOL). */
  function nosNoEixo(trechos, t, tol) {
    var ux = t.p2.x - t.p1.x, uy = t.p2.y - t.p1.y, uz = t.p2.z - t.p1.z, L = Math.sqrt(ux * ux + uy * uy + uz * uz), out = [0, L];
    if (!(L > EPS)) return out;
    ux /= L; uy /= L; uz /= L; tol = num(tol, FIM_TUBO);   /* a tolerância de ponta do motor (BimInst.TOL), 2 cm */
    (trechos || []).forEach(function (o) {
      if (!o || o.id === t.id || o.sistema !== t.sistema) return;
      [o.p1, o.p2].forEach(function (p) {
        var s = (p.x - t.p1.x) * ux + (p.y - t.p1.y) * uy + (p.z - t.p1.z) * uz;
        if (s <= tol || s >= L - tol) return;
        var qx = t.p1.x + ux * s - p.x, qy = t.p1.y + uy * s - p.y, qz = t.p1.z + uz * s - p.z;
        if (Math.sqrt(qx * qx + qy * qy + qz * qz) <= tol) out.push(s);
      });
    });
    return out.sort(function (a, b) { return a - b; });
  }
  /* a reta livre (m) de cada lado do ponto s do tubo: até o nó mais perto */
  function retaLivre(trechos, t, s, tol) {
    var ns = nosNoEixo(trechos, t, tol), antes = s, depois = Infinity;
    ns.forEach(function (n) { if (n <= s + EPS) antes = Math.min(antes, s - n); else depois = Math.min(depois, n - s); });
    return { antes: antes, depois: depois };
  }

  /* CABE? c = { sistema, material, dn (do tubo que transpõe), cruzadoSistema, cruzadoDn (mm), cos, dy (m), retaAntes, retaDepois (m), margem (m: a folga de nó do motor) }
     → { ok, motivo (PT-BR, curto, o porquê), regra } */
  function avaliar(c) {
    c = c || {};
    var R = regra(c.dn);
    function nao(m) { return { ok: false, motivo: m, regra: R }; }
    if (c.sistema !== "agua_fria") return nao("a curva de transposição é de água fria; este tubo não é.");
    if (c.material !== MATERIAL) return nao("a curva de transposição é de PVC soldável (a de PPR é outra peça e não entra aqui).");
    if (!R) return nao("só há curva de transposição para DN " + DN_PERMITIDOS.join("/") + " de PVC soldável; este tubo é DN " + c.dn + ".");
    if (c.horizontal === false) return nao("a curva de transposição é para tubos horizontais (o arco sobe pelo eixo vertical).");
    if (!AGUA[c.cruzadoSistema]) return nao("só se cruza outro tubo de água; esgoto, ventilação, pluvial e gás desviam.");
    if (num(c.cruzadoDn, 0) > R.deMaxCruzado + EPS) return nao("o arco libera tubo de até DE " + R.deMaxCruzado + " mm; o tubo cruzado é DN " + c.cruzadoDn + ".");
    if (!(num(c.cos, 1) <= TOL_COS)) return nao("só cruza a 90°; este cruzamento é de " + graus(c.cos) + "°.");
    if (Math.abs(num(c.dy, 0)) > TOL_COTA) return nao("os dois tubos não estão na mesma cota (" + cm(Math.abs(c.dy)) + " cm de diferença).");
    var precisa = R.A + num(c.margem, 0);
    if (num(c.retaAntes, 0) < precisa - EPS || num(c.retaDepois, 0) < precisa - EPS) {
      var lado = num(c.retaAntes, 0) < num(c.retaDepois, 0) ? num(c.retaAntes, 0) : num(c.retaDepois, 0);
      return nao("falta reta livre: a peça ocupa " + cm(R.A) + " cm de cada lado do cruzamento (+ " + cm(num(c.margem, 0)) + " cm até o nó vizinho) e de um lado só há " + cm(lado) + " cm.");
    }
    return { ok: true, motivo: null, regra: R };
  }

  var HidTransp = { TIPO: TIPO, MATERIAL: MATERIAL, DN_PERMITIDOS: DN_PERMITIDOS, TOL_COS: TOL_COS, TOL_COTA: TOL_COTA, ficha: ficha, regra: regra, cruzamento: cruzamento, nosNoEixo: nosNoEixo, retaLivre: retaLivre, avaliar: avaliar };
  global.HidTransp = HidTransp;
  if (typeof module !== "undefined" && module.exports) module.exports = HidTransp;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
