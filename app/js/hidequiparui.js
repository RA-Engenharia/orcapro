/* =====================================================================
 * hidequiparui.js — a TELA do "Equipar ambiente" e do "Auditar ambientes" (FRENTE H7, 21/10/2026). Fiação fina: a conta está no
 * motor puro js/hidequipar.js (e os pontos de água no js/familiasagua.js).
 *
 * Fita: Instalações › Projeto inteligente (ao lado do Traçar automaticamente — js/hidkitui.js):
 *   hid-equipar          menu: no ambiente selecionado · em todos os ambientes · opções (padrão, bacia, PNE, traçar em seguida)
 *   hid-equipar-auditar  o auditor (cada problema: o que é + Corrigir + Mostrar no 3D — js/problemacard.js)
 * E no botão direito do ambiente (o menu do Traçar automaticamente, HidKitUI.itensMenu): "Equipar ambiente".
 * Todo comando aplica UM lote (BIM.editarLote): um Ctrl+Z desfaz. Rodar de novo não duplica; peça posta à mão fica.
 * ⚠ Não edita o js/hidkitui.js: embrulha HidKitUI.registrar / itensMenu na carga (o mesmo jeito do embrulho do BimFita lá).
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  function reais(v) { var x = Number(v); if (!isFinite(x)) return "—"; var s = x.toFixed(2).split("."); return "R$ " + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1]; }   // hid:ok formatação (não é norma)
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var CHAVE = "raerp:bim:hid-equipar-opcoes";
  var PADROES = [["economico", "Econômico (louça com coluna, pia de inox)"], ["medio", "Médio (bancada de pedra; cuba e torneira de preço mediano)"], ["alto", "Alto padrão (fabricante › linha › acabamento de maior preço)"]];

  function ops() { var B = global.BIM; try { return B && B.editarOps ? B.editarOps() : null; } catch (e) { return null; } }
  function estado() { var E = global.BimEdit, o = ops(); if (!o || !E) return null; try { return E.aplicar(o); } catch (e) { return null; } }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }
  function aplicar(lote) { var B = global.BIM; if (!B || !B.editarLote) { status("O editor 3D não está aberto."); return false; } return !!B.editarLote(lote); }
  function lerOpc() { try { var t = global.localStorage && global.localStorage.getItem(CHAVE), o = t ? JSON.parse(t) || {} : {}; return { padrao: o.padrao || "medio", bacia: o.bacia === "valvula" ? "valvula" : "caixa", acessivel: !!o.acessivel, tracar: o.tracar !== false }; } catch (e) { return { padrao: "medio", bacia: "caixa", acessivel: false, tracar: true }; } }
  function gravarOpc(o) { try { if (global.localStorage) global.localStorage.setItem(CHAVE, JSON.stringify(o || {})); } catch (e) {} }
  function selecionados(st) {
    var B = global.BIM, uids = []; try { uids = (B && B.selecao ? B.selecao().uids : []) || []; } catch (e) { uids = []; }
    var ids = uids.map(function (u) { return String(u).replace(/^edit:/, ""); }), ambs = arr(st && st.ambientes).map(function (a) { return String(a.id); });
    try { var AU = global.BimAmbienteUI, s0 = AU && AU.selecionado ? AU.selecionado() : null; if (s0 != null && ids.indexOf(String(s0)) < 0) ids.push(String(s0)); } catch (e2) {}
    return ids.filter(function (id) { return ambs.indexOf(id) >= 0; });
  }
  function janela(titulo, html) {
    if (typeof document === "undefined") return null;
    var velho = document.getElementById("hid-equipar-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = document.createElement("div"); ov.id = "hid-equipar-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:1080px;width:100%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.3)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-hq-fechar class="btn sm">Fechar</button></div>' + html + "</div>";
    ov.addEventListener("click", function (e) { if (e.target === ov || (e.target && e.target.hasAttribute && e.target.hasAttribute("data-hq-fechar"))) { if (ov.parentNode) ov.parentNode.removeChild(ov); } });
    document.body.appendChild(ov);
    return ov;
  }
  function pendHtml(pend) {
    pend = arr(pend); if (!pend.length) return "";
    return '<h4 style="margin:10px 0 4px">Pendências</h4><ul style="margin:0 0 0 18px;padding:0">' + pend.map(function (p) {
      return "<li>" + esc(p.texto) + (arr(p.ids).length ? ' <button type="button" class="btn sm" data-hq-mostrar="' + esc(arr(p.ids).join(",")) + '">Mostrar no 3D</button>' : "") + "</li>";
    }).join("") + "</ul>";
  }
  function lista(titulo, itens) { itens = arr(itens); if (!itens.length) return ""; return '<h4 style="margin:10px 0 4px">' + esc(titulo) + '</h4><ul style="margin:0 0 0 18px;padding:0">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"; }

  /* ----------------------------------------------------------- comandos */
  function equipar(modo, extra) {
    var st = estado(), HE = global.HidEquipar; if (!st || !HE) { status("O editor 3D não está aberto (ou o projeto inteligente do hidro não carregou)."); return null; }
    var op = lerOpc(), ids = null;
    if (modo === "sel") { ids = selecionados(st); if (!ids.length) { status("Selecione um ambiente (clique no ambiente na planta) ou use \"Em todos os ambientes\"."); return null; } }
    if (extra && extra.ids) ids = extra.ids;
    status("Equipar ambiente: posicionando as peças e conferindo o traçado…");
    var res = HE.gerar({ estado: st, avaliarFam: avaliar(), ops: ops(), ambientes: ids, padrao: op.padrao, bacia: op.bacia, acessivel: op.acessivel, tipos: extra && extra.tipos });
    if (!res.ok) { janela("Equipar ambiente", "<p>" + esc(res.motivo || "não deu para equipar") + "</p>"); return res; }
    var aplicado = res.lote ? aplicar(res.lote) : false;
    mostrarResultado(res, aplicado, op);
    status("Equipar ambiente: " + res.resumo.pecas + " peça(s) em " + res.resumo.ambientes + " ambiente(s)" + (res.pendencias.length ? "; " + res.pendencias.length + " pendência(s)" : "") + (aplicado ? " (Ctrl+Z desfaz)." : "."));
    /* em seguida, o Traçar automaticamente nos ambientes equipados (a prévia dele pede o OK, como sempre) */
    if (aplicado && op.tracar && global.HidKitUI && global.HidKitUI.tracarAuto) {
      var uids = Object.keys(res.porAmbiente).filter(function (k) { return res.porAmbiente[k].itens.length; }).map(function (k) { return "edit:" + k; });
      try { if (uids.length) global.setTimeout(function () { global.HidKitUI.tracarAuto({ uids: uids }); }, 0); } catch (eT) {}
    }
    return res;
  }
  function mostrarResultado(res, aplicado, op) {
    var linhas = res.itens.map(function (x) {
      var p = x.preco;
      return "<tr><td>" + esc(x.ambienteNome) + "</td><td>" + esc(x.nome) + (x.escolha ? '<br><span style="font-size:11px;color:#667">' + esc(x.escolha) + "</span>" : "") + "</td><td>" +
        (p ? (p.valor != null ? esc(reais(p.valor)) : "pela composição") + '<br><span style="font-size:11px;color:#667">' + esc(p.fonte || "") + "</span>" + (p.provisorio ? ' <span style="color:#a35a00">(provisório — cotar com o fornecedor)</span>' : "") : "—") +
        '</td><td style="font-size:12px">' + arr(x.regras).map(esc).join("<br>") + "</td></tr>";
    }).join("");
    var html = "<p><b>" + res.resumo.pecas + "</b> peça(s) em " + res.resumo.ambientes + " ambiente(s) — padrão <b>" + esc(op.padrao) + "</b>, bacia " + (op.bacia === "valvula" ? "com válvula" : "com caixa acoplada") +
      (aplicado ? " — aplicado num lote (Ctrl+Z desfaz)." : (res.lote ? " — <b>não aplicado</b>." : ": nada a pôr (o ambiente já tem as peças).")) + (op.tracar && aplicado ? " Em seguida: o Traçar automaticamente (confira a prévia)." : "") + "</p>" +
      (linhas ? '<table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th>Ambiente</th><th>Peça</th><th>Preço (fonte)</th><th>Por que ficou ali (regra · fonte)</th></tr></thead><tbody>' + linhas + "</tbody></table>" : "") +
      lista("Já tinha (não mexi)", [].concat.apply([], Object.keys(res.porAmbiente).map(function (k) { var a = res.porAmbiente[k]; return arr(a.jaTem).map(function (n) { return (a.nome || k) + ": " + n; }); }))) +
      pendHtml(res.pendencias) + lista("Avisos", res.avisos);
    var ov = janela("Equipar ambiente", html);
    /* REVISÃO H7: cada pendência com o "Mostrar no 3D" (o padrão do projeto: o que é + onde está) */
    if (ov) ov.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-hq-mostrar]") : null; if (!b) return;
      var ids = String(b.getAttribute("data-hq-mostrar") || "").split(",").filter(Boolean), PC = global.ProblemaCard;
      if (PC && PC.mostrarNo3D) PC.mostrarNo3D(ids); else { try { global.BIM.enquadrarUids(ids.map(function (i) { return "edit:" + i; })); } catch (eM) {} }
    });
  }
  function auditar() {
    var st = estado(), HE = global.HidEquipar, PC = global.ProblemaCard; if (!st || !HE) { status("O editor 3D não está aberto."); return null; }
    var op = lerOpc(), res = HE.auditar({ estado: st, avaliarFam: avaliar(), ops: ops(), padrao: op.padrao, bacia: op.bacia }), probs = res.problemas;
    var erros = probs.filter(function (p) { return p.gravidade === "erro"; }), avs = probs.filter(function (p) { return p.gravidade !== "erro"; });
    function acoes(s) { return s && (arr(s.ops).length || s.acao === "tracar") ? (s.texto || true) : false; }
    function bloco(L, tit, grav) { if (!L.length) return ""; return PC ? PC.lista(L, { acoes: acoes, titulo: tit, gravidade: grav, prefixoIndice: grav === "aviso" ? "a" : "e" }) : lista(tit, L.map(function (p) { return p.titulo + " — " + p.texto; })); }
    var html = (probs.length ? "" : "<p><b>Nenhum problema</b> nos ambientes sanitários.</p>") + bloco(erros, "Erros (" + erros.length + ")", "erro") + bloco(avs, "Avisos (" + avs.length + ")", "aviso");
    var ov = janela("Auditar ambientes sanitários", html);
    if (ov && PC) PC.ligar(ov, {
      corrigir: function (solId, k) {
        var L = String(k).charAt(0) === "a" ? avs : erros, p = L[+String(k).slice(1)], s = p && arr(p.solucoes).filter(function (x) { return x.id === solId; })[0];
        if (!s) return;
        if (s.acao === "tracar" && global.HidKitUI && global.HidKitUI.tracarAuto) { if (ov.parentNode) ov.parentNode.removeChild(ov); global.HidKitUI.tracarAuto({ uids: ["edit:" + s.ambiente] }); return; }
        if (!arr(s.ops).length) return;
        if (aplicar({ op: "lote", id: "hq-corr-" + Date.now().toString(36), origem: "hid-equipar", pedido: "Corrigir: " + s.texto, ops: s.ops })) { status("Corrigido: " + s.texto + " (Ctrl+Z desfaz)."); auditar(); }   // hid:ok formatação (não é norma)
      },
      mostrar: function (ids) { PC.mostrarNo3D(ids); }
    });
    status("Auditar ambientes: " + erros.length + " erro(s), " + avs.length + " aviso(s).");
    return res;
  }
  function opcoesTela() {
    var o = lerOpc();
    var ov = janela("Equipar ambiente — opções", '<p>Padrão <select data-hq-op="padrao">' + PADROES.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === o.padrao ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select></p>" +
      '<p>Bacia <select data-hq-op="bacia"><option value="caixa"' + (o.bacia !== "valvula" ? " selected" : "") + '>com caixa acoplada</option><option value="valvula"' + (o.bacia === "valvula" ? " selected" : "") + ">com válvula de descarga</option></select></p>" +
      '<p><label><input type="checkbox" data-hq-op="acessivel"' + (o.acessivel ? " checked" : "") + "> Banheiros acessíveis (NBR 9050: bacia e lavatório PNE, box 0,90 × 0,95, barras, giro de Ø 1,50)</label></p>" +
      '<p><label><input type="checkbox" data-hq-op="tracar"' + (o.tracar ? " checked" : "") + "> Em seguida, o Traçar automaticamente (você vê a prévia antes)</label></p>" +
      '<p style="font-size:12px">Cada peça é a família paramétrica do OrçaPRO, com os pontos de água e de esgoto e o preço (SINAPI da família; a bancada pelo orçamento da marmoraria). Fica gravado neste aparelho.</p>' +
      '<button type="button" class="btn primary sm" data-hq-salvar>Salvar</button>');
    if (!ov) return;
    ov.addEventListener("click", function (e) {
      if (!e.target || !e.target.hasAttribute || !e.target.hasAttribute("data-hq-salvar")) return;
      var n = {}; arr(ov.querySelectorAll("[data-hq-op]")).forEach(function (i) { var k = i.getAttribute("data-hq-op"); n[k] = i.type === "checkbox" ? !!i.checked : i.value; });
      gravarOpc(n); status("Equipar ambiente: padrão " + n.padrao + " (neste aparelho)."); if (ov.parentNode) ov.parentNode.removeChild(ov);
    });
  }

  var ID = "hid-equipar", ID_AUD = "hid-equipar-auditar";
  var UI = {
    registrar: function (reg, R) {
      R = R || global.BimRibbon; if (!R || !reg) return false;
      if (!(R.comando && R.comando(ID))) try {
        R.acrescentar("instalacoes", "Instalações", "Projeto inteligente", [
          { id: ID, rotulo: "Equipar\nambiente", icone: "mais", grande: true, tipo: "menu",
            dica: "Põe as peças sanitárias que faltam pelo nome do ambiente (banheiro, suíte, lavabo, PNE, cozinha, área de serviço, gourmet): bacia, lavatório ou bancada com cuba e torneira, box com chuveiro e ralo, pia, tanque e o ponto da lavadora — paramétricas, com os pontos e o preço, respeitando porta, janela e circulação. Um Ctrl+Z desfaz; rodar de novo não duplica.",
            itens: [{ id: ID + "-sel", rotulo: "No ambiente selecionado", icone: "mais" }, { id: ID + "-todos", rotulo: "Em todos os ambientes", icone: "mais" }, { id: ID + "-opcoes", rotulo: "Opções (padrão, bacia, PNE, traçar em seguida)", icone: "regua" }] },
          { id: ID_AUD, rotulo: "Auditar\nambientes", icone: "calculadora", grande: true, dica: "Ambiente sanitário sem a peça obrigatória, peça de água sem o ponto, torneira não escolhida, ponto sem tubo depois do Traçar — cada um com Corrigir e Mostrar no 3D." }
        ]);
      } catch (e) {}
      reg[ID] = function () { return true; };
      reg[ID + "-sel"] = function () { equipar("sel"); return true; };
      reg[ID + "-todos"] = function () { equipar("todos"); return true; };
      reg[ID + "-opcoes"] = function () { opcoesTela(); return true; };
      reg[ID_AUD] = function () { auditar(); return true; };
      try { var BD = global.BimDisciplinas; if (BD && BD.declarar) BD.declarar([ID, ID + "-sel", ID + "-todos", ID + "-opcoes", ID_AUD], "hidraulica"); } catch (eD) {}
      return true;
    },
    _registrarTarde: function () {
      try {
        var R = global.BimRibbon, Cm = global.BimCmd; if (!R || !Cm || !R.aba || !R.aba("instalacoes") || (R.comando && R.comando(ID))) return false;
        var reg = {}; UI.registrar(reg, R); Cm.registrar(reg);
        var Sh = global.BimShell; if (Sh && Sh.pintarFita && Sh._raiz) Sh.pintarFita();
        return true;
      } catch (e) { return false; }
    },
    equipar: equipar, auditar: auditar, opcoes: opcoesTela, lerOpcoes: lerOpc, gravarOpcoes: gravarOpc
  };
  /* o gancho no projeto inteligente (sem editar o js/hidkitui.js): o registrar dele chama o meu; o botão direito do ambiente ganha o item */
  (function embrulhar() {
    var K = global.HidKitUI; if (!K || K._hidEquiparEmbrulho) return;
    K._hidEquiparEmbrulho = true;
    var origR = K.registrar;
    if (typeof origR === "function") K.registrar = function (reg, R) { var r = origR.apply(this, arguments); try { UI.registrar(reg, R); } catch (e) {} return r; };
    var origM = K.itensMenu;
    if (typeof origM === "function") K.itensMenu = function (o) {
      var itens = arr(origM.apply(this, arguments));
      try {
        var st = estado(), uid = o && o.uid ? String(o.uid).replace(/^edit:/, "") : null;
        if (uid && arr(st && st.ambientes).some(function (a) { return String(a.id) === uid; })) itens = itens.concat([{ id: ID + "-ctx", rotulo: "Equipar ambiente (peças sanitárias)", fn: function () { equipar("ids", { ids: [uid] }); } }]);
      } catch (e) {}
      return itens;
    };
  })();
  global.HidEquiparUI = UI;
  if (global.document && global.setTimeout) global.setTimeout(function () { UI._registrarTarde(); }, 0);
  if (typeof module !== "undefined" && module.exports) module.exports = UI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
