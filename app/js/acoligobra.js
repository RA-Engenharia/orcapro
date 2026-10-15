/* =====================================================================
 * acoligobra.js — LIGAÇÕES NO DADO DA OBRA: a configuração das ligações e a
 * BIBLIOTECA de ligações do usuário moram no modelo da obra (as ops do
 * js/bimedit.js — o mesmo dado que sincroniza), não no navegador. Motor PURO,
 * ES5, sem DOM, Node-testável. 15/10/2026 — frente C, 1.2.148.
 *
 * AS OPS (extensão do replay — BimEdit.estender):
 *   {op:"metalLigConfig", config:{…} | null}       a configuração (js/acoligconfig.js) — null volta ao padrão
 *   {op:"metalLigBiblio", acao:"salvar", item:{…}}  guarda uma ligação configurada (sem esforço e SEM o "passa")
 *   {op:"metalLigBiblio", acao:"apagar", id}
 *   A saída do replay ganha `ligConfig` e `ligBiblioteca` (só quando há op delas: o estado antigo fica igual).
 *   Nada de lista dentro de lista (a nuvem recusa): os diâmetros da configuração vão como TEXTO "M16,M20".
 *
 * MIGRAÇÃO: a configuração que estava no navegador (orcapro:metal:ligconfig:v1, 1.2.147) vira a da obra na
 *   primeira abertura sem configuração na obra — quem faz é a tela (js/metalligsugui.js) com migracao().
 *
 * BIBLIOTECA
 *   itemDe(opcao, nome)        a opção dimensionada → item { id, nome, tipologia, relacao, face, arranjo (forcar),
 *                              perfis (só para mostrar) } — o resultado, o ok, o passa e os esforços NÃO vão
 *   reaplicar(item, ctx, op)   no NÓ NOVO: a sugestão (js/acoligsugere.js) com os esforços dele, a tipologia do item e
 *                              o arranjo fixado (forcar) → opção RECALCULADA (passa = o cálculo novo). Tipologia que não
 *                              serve no nó → { ok:false, motivo }. Arranjo que o motor não manteve → aviso.
 * Teste: node tools/test-aco-ligobra.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function CF() { return dep("AcoLigConfig", "./acoligconfig.js"); }
  function Tip() { return dep("AcoLigTipos", "./acoligtipos.js"); }
  function Sug() { return dep("AcoLigSugere", "./acoligsugere.js"); }
  function C2() { return dep("AcoLigCalc2", "./acoligcalc2.js"); }
  function LL() { return dep("AcoLigLote", "./acoliglote.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function txt(v, n) { return String(v == null ? "" : v).slice(0, n || 80); }

  /* ---------------------------------------------------- configuração ⇄ op (sem lista dentro de lista) */
  function configParaOp(c0) {
    var F = CF(); if (!F) return null;
    var c = F.normalizar(c0), o = clone(c);
    o.parafuso = { classe: c.parafuso.classe, diametros: c.parafuso.diametros.join(",") };
    return o;
  }
  function configDaOp(o) {
    if (!o || typeof o !== "object") return null;
    var c = clone(o); if (c.parafuso && typeof c.parafuso.diametros === "string") c.parafuso.diametros = c.parafuso.diametros ? c.parafuso.diametros.split(",") : [];
    return c;
  }
  var ARR_CAMPOS = ["pf", "t", "linhas", "a", "cat", "ts"];
  function arranjoOk(a) {
    if (!a || typeof a !== "object" || Array.isArray(a)) return false;
    return Object.keys(a).every(function (k) { var v = a[k]; return ARR_CAMPOS.indexOf(k) >= 0 && (typeof v === "string" ? v.length <= 40 : typeof v === "number" && isFinite(v) && v > 0); });
  }
  function itemOk(it) {
    var T = Tip();
    if (!it || typeof it !== "object" || !it.id || !it.nome || !it.tipologia) return false;
    if (T && !T.obter(it.tipologia)) return false;
    if (!arranjoOk(it.arranjo || {})) return false;
    /* nunca o "aprovado" junto: um item com resultado/passa/ok/esforços é recusado */
    return !("resultado" in it || "passa" in it || "ok" in it || "esforcos" in it || "razao" in it);
  }
  function valida(o) {
    if (!o) return undefined;
    if (o.op === "metalLigConfig") {
      if (o.config === null) return true;
      var F = CF(); if (!F || !o.config || typeof o.config !== "object") return false;
      if (o.config.parafuso && typeof o.config.parafuso.diametros !== "string") return false;   /* texto, não lista */
      return F.validar(configDaOp(o.config)).ok;
    }
    if (o.op === "metalLigBiblio") {
      if (o.acao === "apagar") return typeof o.id === "string" && o.id.length > 0;
      if (o.acao === "salvar") return itemOk(o.item);
      return false;
    }
    return undefined;
  }
  function aplicar(o, ctx) {
    if (!o || (o.op !== "metalLigConfig" && o.op !== "metalLigBiblio")) return false;
    if (valida(o) !== true) return false;
    var x = ctx.ext || (ctx.ext = {});
    if (o.op === "metalLigConfig") { x.ligConfig = o.config === null ? null : clone(o.config); x.ligConfigVisto = true; return true; }
    var b = x.ligBib || (x.ligBib = { por: {}, ordem: [] });
    if (o.acao === "salvar") { if (!b.por[o.item.id]) b.ordem.push(o.item.id); b.por[o.item.id] = clone(o.item); }
    else if (b.por[o.id]) { delete b.por[o.id]; b.ordem.splice(b.ordem.indexOf(o.id), 1); }
    return true;
  }
  function fim(ctx, saida) {
    var x = ctx && ctx.ext; if (!x) return;
    if (x.ligConfigVisto) saida.ligConfig = x.ligConfig ? configDaOp(x.ligConfig) : null;
    if (x.ligBib) saida.ligBiblioteca = x.ligBib.ordem.map(function (id) { return clone(x.ligBib.por[id]); });
  }
  function registrar(BE) {
    if (!BE || typeof BE.estender !== "function") return false;
    BE.estender({ nome: "metal-lig-obra", aplicar: aplicar, valida: valida, fim: fim });
    return true;
  }
  /* as ops que a tela manda */
  function opConfig(c) {
    if (c === null) return { op: "metalLigConfig", config: null };
    var F = CF(), v = F ? F.validar(c) : { ok: false, erros: ["motor da configuração não carregou"] };
    if (!v.ok) return { erro: v.erros.join(" ") };
    return { op: "metalLigConfig", config: configParaOp(v.config) };
  }
  /* migração: a do navegador vira a da obra (só se a obra ainda não tem) → a op, ou null */
  function migracao(estado, local) {
    if (!local || typeof local !== "object") return null;
    if (estado && estado.ligConfig !== undefined) return null;
    var op = opConfig(local); return op && !op.erro ? op : null;
  }

  /* ---------------------------------------------------- biblioteca */
  var seq = 0;
  function novoId() { seq++; return "lb-" + Date.now().toString(36) + "-" + seq; }
  function itemDe(opcao, nome, id) {
    if (!opcao || !opcao.tipologia) return { erro: "sem ligação para salvar" };
    var L = LL(), dims = opcao.resultado && opcao.resultado.dimensoes, ent = opcao.entrada || {};
    var arranjo = L && L.forcarDe ? L.forcarDe(dims) : {};
    var it = { id: id || novoId(), nome: txt(nome || opcao.nome || opcao.tipologia, 60), tipologia: opcao.tipologia, relacao: txt(opcao.relacao || (ent.face === "nenhuma" ? "" : ""), 30),
               face: txt(ent.face || "", 10), arranjo: arranjo,
               perfis: txt([ent.viga && ent.viga.nome, ent.apoio && ent.apoio.nome].filter(Boolean).join(" × "), 80) };
    if (!itemOk(it)) return { erro: "a ligação não pôde ser guardada (tipologia ou arranjo inválido)" };
    return { ok: true, item: it };
  }
  function opSalvar(item) { return itemOk(item) ? { op: "metalLigBiblio", acao: "salvar", item: clone(item) } : { erro: "item inválido" }; }
  function opApagar(id) { return { op: "metalLigBiblio", acao: "apagar", id: String(id) }; }

  function reaplicar(item, ctx, op) {
    var S = Sug(), C = C2(), L = LL();
    if (!itemOk(item)) return { ok: false, motivo: "item da biblioteca inválido" };
    if (!S || !C) return { ok: false, motivo: "motor de ligações não carregou" };
    if (!ctx || !ctx.ok) return { ok: false, motivo: (ctx && ctx.motivo) || "sem encontro de peças" };
    var sg = S.sugerir(ctx, op || {});
    var base = arr(sg.todasOpcoes).filter(function (o) { return o.tipologia === item.tipologia; })[0];
    if (!base) {
      var fora = arr(sg.fora).filter(function (f) { return f.tipologia === item.tipologia; })[0];
      return { ok: false, motivo: "a ligação \"" + item.nome + "\" (" + item.tipologia + ") não serve neste nó" + (fora ? ": " + fora.motivo : " (" + (sg.relacao || ctx.relacao) + ")") };
    }
    /* o arranjo do item fixado; os ESFORÇOS são os deste nó — o cálculo é refeito, nada do "passa" de antes */
    var ent = clone(base.entrada); ent.forcar = clone(item.arranjo || {});
    var r = C.verificar(item.tipologia, ent), o = clone(base);
    o.entrada = ent; o.resultado = r; o.passa = !!(r && r.ok) && !base.bloqueio; o.reforcos = arr(r && r.reforcos);
    o.origemBiblioteca = { id: item.id, nome: item.nome };
    o.avisos = arr(base.avisos).filter(function (a) { return !/aproveitamento/.test(a); });
    var novo = L && L.forcarDe ? L.forcarDe(r && r.dimensoes) : {};
    var mudou = Object.keys(item.arranjo || {}).filter(function (k) { return JSON.stringify(item.arranjo[k]) !== JSON.stringify(novo[k]); });
    if (mudou.length) o.avisos.unshift("O arranjo salvo não se manteve neste nó (" + mudou.map(function (k) { return k + ": " + item.arranjo[k] + " → " + (novo[k] == null ? "—" : novo[k]); }).join("; ") + "): o motor refez o que esta tipologia não aceita fixo.");
    if (base.bloqueio) o.avisos.unshift("Bloqueada neste nó: " + base.bloqueio + ".");
    if (r && r.ok === false) o.avisos.unshift("NÃO PASSA neste nó com o arranjo da biblioteca (" + (r.governante || r.motivo || "") + ").");
    o.aplicar = S.aplicacao ? S.aplicacao(o, ctx) : base.aplicar;
    return { ok: true, opcao: o, passa: o.passa, mudou: mudou };
  }

  var AcoLigObra = { valida: valida, aplicar: aplicar, fim: fim, registrar: registrar, opConfig: opConfig, migracao: migracao, configParaOp: configParaOp, configDaOp: configDaOp,
                     itemDe: itemDe, itemOk: itemOk, opSalvar: opSalvar, opApagar: opApagar, reaplicar: reaplicar };
  registrar(dep("BimEdit", "./bimedit.js"));
  global.AcoLigObra = AcoLigObra;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigObra;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
