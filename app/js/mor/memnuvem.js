/* =====================================================================
 * mor/memnuvem.js — A MEMÓRIA DO MOTOR NA NUVEM (motor puro; a fiação fina está em ui.js → MorUI.memoria)
 *
 * A memória (js/mor/memoria.js) morava só no localStorage do aparelho: a correção que o orçamentista fez no
 * computador não valia no celular nem para o colega da mesma empresa. Aqui ela vira a entidade «mor_memoria» da
 * nuvem (js/nuvem.js), UM REGISTRO PLANO POR ITEM:
 *     { id, empresaId, tipo: "casamento"|"composicao"|"frase", chave, dados: JSON.stringify(item), ultima, usos }
 * ⚠ POR QUE PLANO E COM `dados` EM TEXTO: o Firestore recusa lista dentro de lista e cada documento tem teto de
 *   1 MiB. A composição tem `insumos` (lista) dentro de `comp`, o casamento tem `historico` e `numeros`: como TEXTO
 *   nada disso vira array do documento, e um item nunca divide documento com os outros (a gravação em partes põe
 *   cada registro inteiro numa parte). Item acima de LIMITE_DADOS caracteres NÃO viaja (fica só local).
 * ⚠ ID ESTÁVEL = tipo + hash 64 bits da chave: o mesmo casamento tem o mesmo id em todo aparelho — é isso que faz o
 *   merge por id da nuvem juntar o que dois aparelhos aprenderam em vez de duplicar.
 * Só viajam as três coisas que o USUÁRIO ensina (casamentos, composições aceitas, frases). Respostas e perfis de
 *   custo são estatística do aparelho e seguem locais.
 *
 * REGRA DE MESCLA (mesclar) — por chave:
 *   · item CORRIGIDO pelo usuário vence o não corrigido (a correção vence sempre, como em memoria.js/importar),
 *     mesmo que o outro seja mais novo; entre dois corrigidos ou dois não corrigidos vence `ultima` mais nova;
 *   · `usos` = o MAIOR dos dois (não a soma: a mesma contagem chega por dois caminhos e somar inflaria a cada sync);
 *   · `corrigido` nunca se perde; empate de `ultima` com conteúdo diferente desempata pelo texto (resultado igual
 *     nos dois aparelhos); idempotente e comutativa: mesclar(a,b) = mesclar(mesclar(a,b),b).
 * Puro, ES5. Store e MorMemoria entram por parâmetro; sem Store, tudo segue só local, sem erro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ENTIDADE = "mor_memoria";
  var LIMITE_DADOS = 400000;   /* caracteres de `dados`: bem abaixo de 1 MiB, mesma folga do bim_cenas */
  var TIPOS = { casamento: 1, composicao: 1, frase: 1, camada: 1 };   /* camada: camadas/blocos do projeto ensinados (js/projclass.js) */

  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function s(v) { return v == null ? "" : String(v); }

  /* hash de 64 bits (dois FNV-1a de 32 bits com sementes diferentes) em 16 hex */
  function hash64(txt) {
    var h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x9e3779b9, i, c;
    for (i = 0; i < txt.length; i++) {
      c = txt.charCodeAt(i);
      h1 ^= c; h1 = Math.imul ? Math.imul(h1, 16777619) >>> 0 : ((h1 * 16777619) >>> 0);
      h2 ^= (c + i) & 0xffff; h2 = Math.imul ? Math.imul(h2, 2246822519) >>> 0 : ((h2 * 2246822519) >>> 0); h2 ^= h2 >>> 13;
    }
    function hx(n) { var t = (n >>> 0).toString(16); while (t.length < 8) t = "0" + t; return t; }
    return hx(h1) + hx(h2);
  }
  function idDe(tipo, chave) { return "mm_" + tipo.slice(0, 3) + "_" + hash64(tipo + "|" + chave); }

  function registro(tipo, chave, item, ultima, emp) {
    var dados = JSON.stringify(item);
    if (dados.length > LIMITE_DADOS) return null;
    return { id: idDe(tipo, chave), empresaId: s(emp), tipo: tipo, chave: s(chave), dados: dados, ultima: s(ultima), usos: Number(item.usos) || 0 };
  }
  function chaveComp(c) { return s(c.chave) + "#" + s(c.comp && c.comp.codigo); }

  /* mem → [registro plano]. Ordem estável (tipo, chave) para a saída ser reproduzível. */
  function paraRegistros(mem, emp) {
    var out = [], r;
    mem = mem || {};
    Object.keys(mem.casamentos || {}).sort().forEach(function (k) { r = registro("casamento", k, mem.casamentos[k], mem.casamentos[k].ultima, emp); if (r) out.push(r); });
    (mem.composicoes || []).forEach(function (c) { if (c && c.chave && c.comp) { r = registro("composicao", chaveComp(c), c, c.ultima, emp); if (r) out.push(r); } });
    Object.keys(mem.frases || {}).sort().forEach(function (k) { r = registro("frase", k, mem.frases[k], mem.frases[k].em, emp); if (r) out.push(r); });
    Object.keys(mem.camadas || {}).sort().forEach(function (k) { r = registro("camada", k, mem.camadas[k], mem.camadas[k].ultima, emp); if (r) out.push(r); });
    return out;
  }

  /* [registros] → mem parcial (só casamentos, composições, frases; o resto vazio). Registro ilegível é ignorado. */
  function deRegistros(registros) {
    var m = { v: 1, criadoEm: "", atualizadoEm: "", casamentos: {}, composicoes: [], respostas: {}, perfis: [], frases: {}, camadas: {} };
    (registros || []).forEach(function (r) {
      var it;
      if (!r || !tem(TIPOS, r.tipo) || !r.chave || typeof r.dados !== "string") return;
      try { it = JSON.parse(r.dados); } catch (e) { return; }
      if (!it || typeof it !== "object" || Array.isArray(it)) return;
      if (r.tipo === "casamento") { if (it.codigo) m.casamentos[r.chave] = it; }
      else if (r.tipo === "composicao") { if (it.chave && it.comp && it.comp.codigo) m.composicoes.push(it); }
      else if (r.tipo === "camada") { if (it.classe) m.camadas[r.chave] = it; }
      else if (it.frase && it.entrada) m.frases[r.chave] = it;
    });
    return m;
  }

  /* o conteúdo SEM usos/corrigido: o desempate de `ultima` igual não pode mudar quando `usos` sobe (senão a mescla deixa de ser idempotente) */
  function miolo(x) { var c = copia(x); delete c.usos; delete c.corrigido; return JSON.stringify(c); }

  /* quem vence entre dois itens da MESMA chave; devolve novo objeto (nunca altera os de entrada) */
  function vencedor(a, b, campoUltima) {
    var w, ua = s(a[campoUltima]), ub = s(b[campoUltima]);
    if (!!a.corrigido !== !!b.corrigido) w = a.corrigido ? a : b;
    else if (ua !== ub) w = ua > ub ? a : b;
    else w = miolo(a) >= miolo(b) ? a : b;
    var r = copia(w);
    r.usos = Math.max(Number(a.usos) || 0, Number(b.usos) || 0);
    if (a.corrigido || b.corrigido) r.corrigido = true;
    if (ua || ub) r[campoUltima] = ua > ub ? ua : ub;   /* `ultima` nunca anda para trás */
    return r;
  }

  /* memLocal + memRemota → NOVA mem (as de entrada ficam intactas). Respostas e perfis ficam os do LOCAL. */
  function mesclar(memLocal, memRemota) {
    var m = copia(memLocal), b = memRemota || {};
    m.casamentos = m.casamentos || {}; m.composicoes = m.composicoes || []; m.frases = m.frases || {};
    Object.keys(b.casamentos || {}).forEach(function (k) {
      m.casamentos[k] = m.casamentos[k] ? vencedor(m.casamentos[k], b.casamentos[k], "ultima") : copia(b.casamentos[k]);
    });
    (b.composicoes || []).forEach(function (c) {
      var i, k = chaveComp(c);
      for (i = 0; i < m.composicoes.length; i++) if (chaveComp(m.composicoes[i]) === k) { m.composicoes[i] = vencedor(m.composicoes[i], c, "ultima"); return; }
      m.composicoes.push(copia(c));
    });
    Object.keys(b.frases || {}).forEach(function (k) {
      m.frases[k] = m.frases[k] ? vencedor(m.frases[k], b.frases[k], "em") : copia(b.frases[k]);
    });
    m.camadas = m.camadas || {};
    Object.keys(b.camadas || {}).forEach(function (k) {
      m.camadas[k] = m.camadas[k] ? vencedor(m.camadas[k], b.camadas[k], "ultima") : copia(b.camadas[k]);
    });
    if (m.composicoes.length > 200) m.composicoes = m.composicoes.slice(-200);   /* mesmo teto de memoria.js */
    return m;
  }

  /* ---------------- fiação testável (Store por parâmetro) ---------------- */
  function listaStore(Store, emp) {
    if (!Store || !emp || typeof Store.listar !== "function") return null;
    try { var l = Store.listar(emp, ENTIDADE); return Array.isArray(l) ? l : []; } catch (e) { return null; }
  }

  /* lê local (Mem.carregar) + nuvem e mescla. Devolve o mesmo formato de Mem.carregar + `conhecidos` (ids já
     vistos, para a exclusão não apagar o que chegou de outro aparelho depois) e `nuvem` (true/false). */
  function carregar(Mem, storage, emp, Store) {
    var r = Mem.carregar(storage, emp), regs = listaStore(Store, emp);
    r.conhecidos = {}; r.nuvem = false;
    if (regs === null) return r;
    try {
      r.mem = mesclar(r.mem, deRegistros(regs));
      regs.forEach(function (x) { if (x && x.id) r.conhecidos[x.id] = 1; });
      r.nuvem = true;
    } catch (e) { /* mescla falhou: segue só local */ }
    return r;
  }

  /* grava local (como sempre) e SÓ os registros que mudaram no Store; o que o usuário esqueceu (e já era conhecido)
     é excluído (o Store deixa lápide). Sem Store ou com erro nele: o resultado local não é afetado. */
  function salvar(Mem, storage, emp, mem, Store, conhecidos) {
    var res = Mem.salvar(storage, emp, mem), regs, atuais, mudou = [], i, ex, ids = {}, apagar = [], porId = {};
    res.nuvem = { gravados: 0, excluidos: 0 };
    atuais = listaStore(Store, emp);
    if (atuais === null) return res;
    try {
      regs = paraRegistros(mem, emp);
      atuais.forEach(function (x) { if (x && x.id) porId[x.id] = x; });
      for (i = 0; i < regs.length; i++) {
        ids[regs[i].id] = 1; ex = porId[regs[i].id];
        if (ex && ex.dados === regs[i].dados && ex.ultima === regs[i].ultima && Number(ex.usos) === regs[i].usos && ex.empresaId === regs[i].empresaId) continue;
        mudou.push(regs[i]);
      }
      if (conhecidos) Object.keys(conhecidos).forEach(function (id) { if (!ids[id]) apagar.push(id); });
      if (mudou.length) res.nuvem.gravados = typeof Store.salvarVarios === "function" ? Store.salvarVarios(emp, ENTIDADE, mudou) : mudou.filter(function (x) { return Store.salvar(emp, ENTIDADE, x); }).length;
      if (apagar.length && typeof Store.excluirVarios === "function") { Store.excluirVarios(emp, ENTIDADE, apagar); res.nuvem.excluidos = apagar.length; apagar.forEach(function (id) { delete conhecidos[id]; }); }
      if (conhecidos) Object.keys(ids).forEach(function (id) { conhecidos[id] = 1; });
    } catch (e) { res.nuvem.erro = s(e && e.message); }
    return res;
  }

  var Mn = { ENTIDADE: ENTIDADE, LIMITE_DADOS: LIMITE_DADOS, idDe: idDe, paraRegistros: paraRegistros, deRegistros: deRegistros, mesclar: mesclar, carregar: carregar, salvar: salvar };
  if (typeof module !== "undefined" && module.exports) module.exports = Mn;
  global.MorMemNuvem = Mn;
})(typeof window !== "undefined" ? window : globalThis);
