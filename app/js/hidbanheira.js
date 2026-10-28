/* =====================================================================
 * hidbanheira.js — HIDROMASSAGEM: o que o Traçar NÃO consegue ligar sozinho (F3, Casa 487, 27/10/2026). Motor PURO, ES5, Node-testável.
 *
 * O kit `banheira_hidro` (dados-fonte/hidro/kits → js/hidkitdados.js) liga AF, AQ e esgoto nos conectores da família
 * (js/familiasmobcoz.js, ra-banho-hidromassagem). Falta dizer, em voz alta, o que fica em ESPERA ou PENDENTE:
 *   · água quente: sem aquecedor/fonte de AQ no modelo a espera fica TAMPONADA — "prever aquecedor" (aviso);
 *   · bomba integrada: potência, tensão e vazão são da ficha do fabricante, que NÃO está no acervo (pendência — nunca número de cabeça);
 *   · cotas dos pontos: BH da Tigre e 20 cm do misturador de mesa (Deca), não de ficha da banheira (pendência: conferir com o manual);
 *   · ponto de força dedicado: lista para o motor elétrico (conector `el`, js/eleregras.js `hidromassagem`, força direta).
 *
 *   HidBanheira.conferir({ estado, avaliarFam }) → { banheiras[], avisos[], pendencias[], pontosForca[] }
 *   avisos/pendencias: { chave, texto, elementos[] } (o mesmo formato das pendências do Traçar).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function HF() { return dep("HidFamilias", "./hidfamilias.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  var FAM = "ra-banho-hidromassagem";

  /* há fonte de água quente no modelo? equipamento com saída de AQ (o mesmo critério do Traçar, js/hidkitui.js) ou o aquecedor a gás */
  function temFonteAQ(estado) {
    var H = HF();
    return arr(estado && estado.familias).some(function (f) {
      var F = H && H.porId ? H.porId(f.famId) : null;
      return !!F && F.categoria === "equipamento" && arr(F.sistemas).indexOf("agua_quente") >= 0;
    });
  }
  function conferir(e) {
    e = e || {};
    var estado = e.estado || {}, aval = e.avaliarFam, B = BI();
    var out = { banheiras: [], avisos: [], pendencias: [], pontosForca: [] };
    var fonte = temFonteAQ(estado);
    arr(estado.familias).filter(function (f) { return f.famId === FAM; }).forEach(function (f) {
      var id = String(f.id), av = null; try { av = aval ? aval(f.famId, f.tipoId, f.inst || {}) : null; } catch (x) { av = null; }
      var cs = av && B && B.conectoresDe ? B.conectoresDe(av, { id: f.id, x: f.x, y: f.y, z: f.z, rotY: f.rotY }) : [];
      function pt(c) { return cs.filter(function (k) { return String(k.id).split(":").slice(1).join(":") === c; })[0] || null; }
      var tem = { af: !!pt("af"), aq: !!pt("aq"), esgoto: !!pt("esgoto"), el: !!pt("el") };
      out.banheiras.push({ id: id, aquecedor: fonte, conectores: tem });
      if (!tem.af || !tem.esgoto) out.pendencias.push({ chave: "hidromassagem.conectores", texto: "Hidromassagem " + id + ": a família não tem os pontos de água fria e/ou esgoto — o Traçar não liga.", elementos: [id] });
      if (tem.aq && !fonte) out.avisos.push({ chave: "hidromassagem.aq", texto: "Hidromassagem " + id + ": sem aquecedor no projeto — a água quente fica em ESPERA TAMPONADA; prever aquecedor (a rede de AQ liga nele).", elementos: [id] });
      out.pendencias.push({ chave: "hidromassagem.bomba", texto: "Hidromassagem " + id + ": potência, tensão e vazão da bomba integrada são da ficha do fabricante (não está no acervo) — informar para o circuito dedicado.", elementos: [id] });
      out.pendencias.push({ chave: "hidromassagem.cotas", texto: "Hidromassagem " + id + ": altura dos pontos (BH da Tigre) e afastamento fria/quente (misturador de mesa, Deca) não são de ficha da banheira — conferir com o manual do modelo comprado.", elementos: [id] });
      var el = pt("el");
      if (el) out.pontosForca.push({ famInst: id, conector: el.id, x: el.x, y: el.y, z: el.z, potW: null, dedicado: true, motivo: "bomba da hidromassagem (circuito próprio; potência = ficha do fabricante)" });
    });
    return out;
  }
  var HidBanheira = { conferir: conferir, temFonteAQ: temFonteAQ, FAM: FAM };
  global.HidBanheira = HidBanheira;
  if (typeof module !== "undefined" && module.exports) module.exports = HidBanheira;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
