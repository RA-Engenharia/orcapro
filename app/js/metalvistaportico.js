/* =====================================================================
 * metalvistaportico.js — METÁLICA: "VISTA DESTE PÓRTICO" (motor PURO, ES5,
 * Node-testável). Dada UMA peça selecionada, devolve os ids de todas as
 * peças do MESMO pórtico (a tesoura inteira: banzos, diagonais, montantes,
 * pilares), para a tela isolar no 3D (BIM.isolarChaves) e salvar como vista.
 *
 * Roteiro do defeito (20/11/2026): o "Isolar seleção" do 3D isola UMA peça
 * (um `mid:expressID`); uma tesoura são dezenas. Para pôr "a tesoura" numa
 * prancha era preciso montar um conjunto de seleção à mão.
 *
 * COMO ACHA O PÓRTICO (nesta ordem):
 *  1. REFERÊNCIA: as peças geradas pela biblioteca de pórticos
 *     (js/metalporticos.js) carregam `c.portico` = o id do pórtico
 *     (gerado na hora: `portico-<id>`). Mesmo `c.portico` = mesmo pórtico.
 *  2. PLANO: sem a referência (galpão do assistente, peças desenhadas à mão)
 *     usa o PLANO do pórtico — o pórtico é plano em X–Y, a coordenada que
 *     muda de um pórtico para o outro é o Z: entram as peças cujos DOIS
 *     extremos caem no mesmo Z da peça escolhida (tolerância `tol`, em m;
 *     padrão 0,15) e as chapas/peças sem eixo cujo centro cai nele. A peça
 *     escolhida tem de estar ela mesma no plano (extremos com o mesmo Z):
 *     terça, corrente e contravento correm ao longo do Z e NÃO têm pórtico —
 *     a resposta diz isso em vez de isolar o galpão inteiro.
 *  ⚠ O plano é um critério GEOMÉTRICO: pilar de tapamento ou travessa que
 *     por acaso fique no mesmo Z entra junto. A tela diz qual critério usou.
 * Teste: node tools/test-metalvistaportico.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  var TOL = 0.15;

  /* os dois extremos (z) de uma caixa de aço, ou o z do centro; null = sem posição */
  function zs(c) {
    var m = null; try { m = M() && M().membro ? M().membro(c) : null; } catch (e) { m = null; }
    if (m && m.P0 && m.X && isFinite(m.L)) { var a = m.P0[2], b = a + m.X[2] * m.L; if (isFinite(a) && isFinite(b)) return { z0: Math.min(a, b), z1: Math.max(a, b), eixo: true }; }
    if (c && c.cz != null && isFinite(Number(c.cz))) { var z = Number(c.cz); return { z0: z, z1: z, eixo: false }; }
    return null;
  }

  /* caixas = estado.caixas do editor; id = a peça escolhida → { ok, ids, criterio, rotulo, plano, motivo } */
  function grupoDoPortico(caixas, id, opcoes) {
    var tol = num(opcoes && opcoes.tol, TOL), lista = arr(caixas), sel = null, i;
    for (i = 0; i < lista.length; i++) if (String(lista[i].id) === String(id)) { sel = lista[i]; break; }
    if (!sel) return { ok: false, ids: [], motivo: "Selecione uma peça de aço do pórtico (dois cliques no 3D)." };
    if (sel.tipo !== "metal" && sel.tipo !== "viga" && sel.tipo !== "pilar") return { ok: false, ids: [], motivo: "A peça selecionada não é de aço (perfil, chapa ou pilar/viga de aço)." };
    /* 1. a referência de pórtico */
    if (sel.portico) {
      var ids = lista.filter(function (c) { return c.portico && String(c.portico) === String(sel.portico); }).map(function (c) { return String(c.id); });
      var inf = null; lista.forEach(function (c) { if (!inf && c.portico === sel.portico && c.porticoInfo) inf = c.porticoInfo; });
      return { ok: true, ids: ids, criterio: "portico", rotulo: inf && inf.tipo ? String(inf.tipo) : "", referencia: String(sel.portico), motivo: "" };
    }
    /* 2. o plano do pórtico (mesmo Z) */
    var zsel = zs(sel);
    if (!zsel) return { ok: false, ids: [], motivo: "Não consegui a posição da peça para achar o plano do pórtico." };
    if (zsel.eixo && zsel.z1 - zsel.z0 > tol) return { ok: false, ids: [], motivo: "Esta peça corre ao longo do comprimento do galpão (terça, corrente, contravento ou viga de fechamento): não pertence a um pórtico. Selecione um banzo, diagonal, montante ou pilar do pórtico." };
    var zc = (zsel.z0 + zsel.z1) / 2, saida = [];
    lista.forEach(function (c) {
      if (c.tipo !== "metal" && c.tipo !== "viga" && c.tipo !== "pilar") return;
      var q = zs(c); if (!q) return;
      if (Math.abs(q.z0 - zc) <= tol && Math.abs(q.z1 - zc) <= tol) saida.push(String(c.id));
    });
    return { ok: true, ids: saida, criterio: "plano", rotulo: "Z = " + (Math.round(zc * 100) / 100).toString().replace(".", ",") + " m", plano: { z: zc, tol: tol }, referencia: "", motivo: "" };
  }

  var MetalVistaPortico = { TOL: TOL, grupoDoPortico: grupoDoPortico, zs: zs };
  global.MetalVistaPortico = MetalVistaPortico;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalVistaPortico;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
