/* =====================================================================
 * metalelementoui.js — a TELA do ELEMENTO e do TIPO do pórtico da
 * biblioteca (21/11/2026). Quem decide é o js/metalelemento.js (puro).
 *
 *   · CLIQUE numa peça do pórtico → o elemento inteiro (pilar treliçado com
 *     banzos, travejamento e placas; a tesoura; a terça) — gancho no
 *     compExp do js/bim.js, depois do componente das peças prontas;
 *   · TAB ou DUPLO CLIQUE entram na peça; Tab passa para a próxima;
 *     Shift+Tab volta ao elemento; ESC sai (limpa e esquece o "dentro");
 *   · Propriedades: "Editando tipo TS-1 (7 iguais)" e o botão
 *     "Separar este (criar TS-2)"; trocar perfil, aço ou giro de uma peça
 *     troca a mesma peça em todos os elementos do tipo, num lote (um
 *     Ctrl+Z) — gancho no js/metalcriarui.js mudarPeca.
 * Mesmo padrão do js/metalcomponenteui.js (que segue valendo para as peças
 * prontas: ele é consultado ANTES).
 * ===================================================================== */
(function (global) {
  "use strict";

  function ME() { return global.MetalElemento || null; }
  function B() { return global.BIM || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function caixas() { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return (e && e.estado && e.estado.caixas) || []; } catch (e2) { return []; } }
  function modalAberto() { try { return !!(global.document && global.document.getElementById("modal-bg")); } catch (e) { return false; } }
  function bimNaTela() { var b = B(), h = b && b.host ? b.host() : null; return !!(h && h.isConnected && h.getClientRects().length); }
  function lote(ops, pedido) {
    var b = B(); if (!b || !b.editarLote || !ops.length) return false;
    return !!b.editarLote({ op: "lote", id: "mel-" + Date.now().toString(36) + Math.round(Math.random() * 1e4).toString(36), origem: "metal-elemento", pedido: String(pedido || "").slice(0, 300), ops: ops });
  }

  var st = null;   /* { chave, peca, dentro } — o elemento da última seleção */

  var MetalElementoUI = {
    ativo: function () { return previa() && !!ME(); },
    estado: function () { return st ? JSON.parse(JSON.stringify(st)) : null; },
    /* o CLIQUE: uid → as uids do elemento (ou [uid] quando não é de pórtico ou o Tab já entrou) */
    expandir: function (uid) {
      if (!this.ativo() || !uid) return uid ? [uid] : [];
      var r = ME().expandir(caixas(), uid, st);
      st = r.st;
      if (st && !st.dentro) { var p = ME().painel(caixas(), uid); if (p) status(p.rot + " " + p.tipo + " (" + r.uids.length + " peças) — " + p.texto + ". Tab ou duplo clique entra na peça; Esc sai."); }
      return r.uids;
    },
    /* DUPLO CLIQUE: entra na peça clicada */
    duplo: function (uid) {
      if (!this.ativo() || !uid) return false;
      var e = ME().elemento(caixas(), uid); if (!e || e.n < 2) return false;
      st = { chave: e.chave, peca: uid, dentro: true };
      try { B().selecionar([uid], "trocar"); } catch (eS) {}
      var p = ME().painel(caixas(), uid);
      status("Peça do " + e.rot.toLowerCase() + " " + e.tipo + " — " + (p ? p.texto : "") + ". Trocar o perfil troca em todos do tipo; Esc sai.");
      return true;
    },
    tecla: function (e) {
      if (!st || !this.ativo()) return false;
      if (e.key === "Escape") { if (st.dentro) { st = null; status("Saiu do elemento."); } else st = null; return false; }   /* o Esc segue para quem limpa a seleção */
      if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey || modalAberto()) return false;
      var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName || "") || t.isContentEditable || !bimNaTela()) return false;
      var b = B(), sel = b && b.selecao ? b.selecao().uids || [] : [], cs = caixas(), M = ME();
      if (!sel.length || !sel.every(function (u) { var c = cs.filter(function (x) { return String(x.id) === M.idDe(u); })[0]; return M.chave(c) === st.chave; })) return false;
      var r = M.tab(cs, st, !!e.shiftKey); if (!r) return false;
      e.preventDefault(); e.stopPropagation();
      st = r.st;
      try { b.selecionar(r.uids, "trocar"); } catch (eS) {}
      status(r.texto);
      return true;
    },
    /* Propriedades: a seção do TIPO (só para peça de elemento com mais de uma peça) */
    secao: function (id, pre) {
      if (!this.ativo()) return null;
      var M = ME(), p = M.painel(caixas(), id); if (!p) return null;
      pre = pre || "mel:";
      var self = this, par = [{ id: pre + "tipo", rotulo: p.rot, leitura: true, valor: p.texto }];
      if (p.proximo) par.push({ id: pre + "separar", rotulo: "Só este elemento", tipo: "botao", rotuloBotao: "Separar este (criar " + p.proximo + ")", fn: function () { self.separar(id); } });
      par.push({ id: pre + "regra", rotulo: "Regra", leitura: true, valor: p.n > 1 ? "perfil, aço e giro mudam a mesma peça nos " + p.n + " elementos do tipo; posição e comprimento são só desta peça" : "único do tipo: a edição vale só para ele" });
      return { nome: "Tipo do elemento", params: par };
    },
    separar: function (id) {
      var r = ME().separar(caixas(), id);
      if (!r.ok) { status(r.motivo); toast(r.motivo, "aviso"); return false; }
      if (!lote([r.op], "Separar elemento: " + r.de + " → " + r.tipo)) { status("O editor recusou a separação."); return false; }
      var tx = "Elemento separado: agora é o tipo " + r.tipo + " (as edições dele não mexem mais no " + r.de + "). Ctrl+Z desfaz.";
      status(tx); toast(tx, "ok", 7000);
      return true;
    },
    /* a edição das Propriedades → as ops do tipo inteiro (null = não é de elemento: segue o caminho de sempre) */
    opsDaEdicao: function (id, mud, editar) {
      if (!this.ativo() || !mud || typeof editar !== "function") return null;
      var M = ME(), cs = caixas(), c = cs.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!c || !c.elemMetal || !Object.keys(mud).some(function (k) { return M.CAMPOS_TIPO[k]; })) return null;
      var r = M.propagar(cs, id, mud, editar);
      if (!r.ops.length) return null;
      if (r.erros.length) toast(r.erros.length + " peça(s) do tipo recusaram a mudança: " + r.erros.slice(0, 2).join("; "), "aviso", 9000);
      return r;
    }
  };

  if (typeof global.addEventListener === "function") global.addEventListener("keydown", function (e) { try { MetalElementoUI.tecla(e); } catch (eT) {} }, true);

  global.MetalElementoUI = MetalElementoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalElementoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
