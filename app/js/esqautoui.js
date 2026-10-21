/* =====================================================================
 * esqautoui.js — a TELA de "Portas e janelas automáticas" e do "Auditar esquadrias" (20/10/2026). Fiação fina: a conta
 * está nos motores puros (js/esqregras.js, js/esqauto.js, js/esqauditor.js).
 *
 * Fita: Arquitetura › "Portas e janelas" (registrado pelo js/bimarqui.js, ao lado do telhado):
 *   esq-auto        menu: no ambiente selecionado · em todos · todos com projeto acessível (NBR 9050)
 *   esq-auditar     o auditor (cada problema: o que é + Corrigir + Mostrar no 3D — js/problemacard.js)
 *   esq-criterios   os critérios com o NÍVEL de fonte (lei lida · provisório · critério RA), editáveis neste aparelho
 * Todo comando aplica UM lote (BIM.editarLote): um Ctrl+Z desfaz. Rodar de novo não duplica (o que existe conta).
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var CHAVE = "raerp:bim:esquadrias-criterios";

  function estado() {
    var B = global.BIM, E = global.BimEdit;
    if (!B || !B.editarOps || !E) return null;
    try { return E.aplicar(B.editarOps()); } catch (e) { return null; }
  }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }
  function aplicar(lote) {
    var B = global.BIM;
    if (!B || !B.editarLote) { status("O editor 3D não está aberto."); return false; }
    return !!B.editarLote(lote);
  }
  function lerCriterios() { try { var t = global.localStorage && global.localStorage.getItem(CHAVE); return t ? JSON.parse(t) || {} : {}; } catch (e) { return {}; } }
  function gravarCriterios(o) { try { if (global.localStorage) global.localStorage.setItem(CHAVE, JSON.stringify(o || {})); } catch (e) {} }
  function selecionados(st) {
    var B = global.BIM, uids = []; try { uids = (B && B.selecao ? B.selecao().uids : []) || []; } catch (e) { uids = []; }
    var ids = uids.map(function (u) { return String(u).replace(/^edit:/, ""); }), ambs = arr(st && st.ambientes).map(function (a) { return String(a.id); });
    /* o ambiente selecionado na planta/3D mora no js/bimambienteui.js (selecionado()) */
    try { var AU = global.BimAmbienteUI, s0 = AU && AU.selecionado ? AU.selecionado() : null; if (s0 != null && ids.indexOf(String(s0)) < 0) ids.push(String(s0)); } catch (e2) {}
    return ids.filter(function (id) { return ambs.indexOf(id) >= 0; });
  }

  /* ----------------------------------------------------------- janela */
  function janela(titulo, html) {
    if (typeof document === "undefined") return null;
    var velho = document.getElementById("esq-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = document.createElement("div"); ov.id = "esq-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" data-esq-caixa style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:980px;width:100%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-esq-fechar class="btn sm">Fechar</button></div>' + html + '</div>';
    ov.addEventListener("click", function (e) { if (e.target === ov || (e.target && e.target.hasAttribute && e.target.hasAttribute("data-esq-fechar"))) { if (ov.parentNode) ov.parentNode.removeChild(ov); } });
    document.body.appendChild(ov);
    return ov;
  }
  function lista(titulo, itens) {
    itens = arr(itens); if (!itens.length) return "";
    return '<h4 style="margin:10px 0 4px">' + esc(titulo) + '</h4><ul style="margin:0 0 0 18px;padding:0">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }
  var COR_NIVEL = { A: "#1e7a3c", B: "#a35a00", C: "#2d6a9c", X: "#8a1c1c" };
  function selo(n) { var k = String(n || "X").charAt(0), R = global.EsqRegras; return '<span title="' + esc(R ? R.rotuloNivel(k) : k) + '" style="display:inline-block;min-width:18px;text-align:center;border-radius:4px;padding:0 4px;color:#fff;background:' + (COR_NIVEL[k] || "#555") + ';font-weight:700">' + esc(k) + "</span>"; }
  function legenda() {
    var R = global.EsqRegras; if (!R) return "";
    return '<p style="margin:4px 0 8px;font-size:12px">' + ["A", "B", "C"].map(function (k) { return selo(k) + " " + esc(R.NIVEIS[k]); }).join(" &nbsp; ") + "</p>";
  }

  /* ----------------------------------------------------------- comandos */
  function lancar(modo) {
    var st = estado(), EA = global.EsqAuto; if (!st || !EA) { status("O editor 3D não está aberto."); return; }
    var ids = null;
    if (modo === "sel") { ids = selecionados(st); if (!ids.length) { status("Selecione um ambiente (clique no ambiente na planta) ou use \"Em todos os ambientes\"."); return; } }
    var res = EA.gerar({ estado: st, avaliarFam: avaliar(), ambientes: ids, criterios: lerCriterios(), acessivel: modo === "acess" });
    if (!res.ok) { janela("Portas e janelas automáticas", "<p>" + esc(res.motivo) + "</p>"); status(res.motivo); return; }
    var aplicado = res.lote ? aplicar(res.lote) : false;
    var R = global.EsqRegras, it = res.itens.filter(function (x) { return x.tipo === "porta" || x.tipo === "janela"; });
    var linhas = it.map(function (x) {
      var s = x.sinapi || {};
      return "<tr><td>" + esc(x.id) + "</td><td>" + esc(x.ambienteNome) + "</td><td>" + (x.tipo === "porta" ? "Porta " + f2(x.folha) + " × 2,10" + (x.abreEm ? " · abre para " + esc(x.abreEm) : "") : "Janela " + f2(x.largura) + " × " + f2(x.altura) + " · peitoril " + f2(x.peitoril)) + "</td><td>" +
        (s.codigo ? "SINAPI " + esc(s.codigo) + (s.aproximada ? ' <span style="color:#a35a00">(' + esc(s.aproximada) + ")</span>" : "") : '<span style="color:#a35a00">sem composição — ' + esc(s.motivo || "") + "</span>") + "</td><td style=\"font-size:12px\">" + arr(x.regras).map(esc).join("<br>") + "</td></tr>";
    }).join("");
    var html = legenda() + "<p><b>" + res.resumo.portas + "</b> porta(s) e <b>" + res.resumo.janelas + "</b> janela(s) em " + res.resumo.ambientes + " ambiente(s)" + (aplicado ? " — aplicado num lote (Ctrl+Z desfaz)." : (res.lote ? " — <b>não aplicado</b>." : ": nada a lançar (o que existe já atende).")) + "</p>" +
      (linhas ? '<table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th>Peça</th><th>Ambiente</th><th>O quê</th><th>Orçamento</th><th>Regras aplicadas</th></tr></thead><tbody>' + linhas + "</tbody></table>" : "") +
      '<p style="font-size:12px;margin-top:8px">' + selo("B") + " Iluminação 1/6 e 1/8 e ventilação 50 %: Uberlândia LC 524/2011 — <b>provisório, conferir o texto consolidado</b>. " + selo("A") + " Divisa 1,50 m: Código Civil art. 1.301. " + selo("A") + " Vão livre 0,80 e banheiro acessível abrindo para fora: NBR 9050:2020. " + selo("C") + " Peitoril, verga, boneca e largura por ambiente: critério RA (editável em \"Critérios das esquadrias\").</p>" +
      lista("Pendências", res.pendencias.map(function (p) { return p.texto; })) + lista("Avisos", res.avisos);
    janela("Portas e janelas automáticas", html);
    status("Portas e janelas automáticas: " + res.resumo.portas + " porta(s), " + res.resumo.janelas + " janela(s)" + (res.pendencias.length ? "; " + res.pendencias.length + " pendência(s)" : "") + ".");
    return res;
  }
  function auditar() {
    var st = estado(), AU = global.EsqAuditor, PC = global.ProblemaCard; if (!st || !AU) { status("O editor 3D não está aberto."); return; }
    var res = AU.auditar({ estado: st, avaliarFam: avaliar(), criterios: lerCriterios() }), probs = res.problemas;
    var erros = probs.filter(function (p) { return p.gravidade === "erro"; }), avs = probs.filter(function (p) { return p.gravidade !== "erro"; });
    var opts = { acoes: function (s) { return s && arr(s.ops).length ? (s.texto || true) : false; } };
    function bloco(L, tit, grav) {
      if (!L.length) return "";
      var o = {}; Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); o.titulo = tit; o.gravidade = grav; o.prefixoIndice = grav === "aviso" ? "a" : "e";
      o.depois = function (p) { return '<p style="font-size:11px;margin:2px 0 0">' + selo(p.nivel) + " " + esc(p.nivelRotulo) + "</p>"; };
      return PC ? PC.lista(L, o) : lista(tit, L.map(function (p) { return p.titulo; }));
    }
    var html = legenda() + (probs.length ? "" : "<p><b>Nenhum problema</b> nas portas e janelas do modelo.</p>") + bloco(erros, "Erros (" + erros.length + ")", "erro") + bloco(avs, "Avisos (" + avs.length + ")", "aviso");
    var ov = janela("Auditar esquadrias", html);
    if (ov && PC) PC.ligar(ov, {
      corrigir: function (solId, k) {
        var L = String(k).charAt(0) === "a" ? avs : erros, p = L[+String(k).slice(1)], s = p && arr(p.solucoes).filter(function (x) { return x.id === solId; })[0];
        if (!s || !arr(s.ops).length) return;
        if (aplicar({ op: "lote", id: "esq-corr-" + Date.now().toString(36), origem: "esquadrias-auditor", pedido: "Corrigir: " + s.texto, ops: s.ops })) { status("Corrigido: " + s.texto + " (Ctrl+Z desfaz)."); auditar(); }
      },
      mostrar: function (ids) { PC.mostrarNo3D(ids); }
    });
    status("Auditar esquadrias: " + erros.length + " erro(s), " + avs.length + " aviso(s).");
    return res;
  }
  function criteriosTela() {
    var R = global.EsqRegras; if (!R) return;
    var C = R.criterios(lerCriterios());
    var linhas = Object.keys(C).filter(function (k) { return C[k].valor > 0; }).map(function (k) {
      var c = C[k];
      return "<tr><td>" + selo(c.nivel) + "</td><td>" + esc(c.rotulo) + '</td><td><input data-esq-crit="' + esc(k) + '" type="number" step="0.01" value="' + (Math.round(c.valor * 10000) / 10000) + '" style="width:80px"></td><td style="font-size:12px">' + esc(c.fonte) + "</td></tr>";
    }).join("");
    var ov = janela("Critérios das esquadrias", legenda() + '<table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th></th><th>Critério</th><th>Valor</th><th>Fonte</th></tr></thead><tbody>' + linhas + "</tbody></table>" +
      '<p style="font-size:12px">O valor alterado vira critério RA (C) e vale neste aparelho. Peitoril por ambiente: Sala/Quarto 0,90–1,10 · Cozinha/Serviço 1,10–1,20 · Banheiro 1,50–1,60 (C).</p>' +
      '<div style="display:flex;gap:8px"><button type="button" class="btn primary sm" data-esq-salvar>Salvar</button><button type="button" class="btn ghost sm" data-esq-padrao>Voltar ao padrão</button></div>');
    if (!ov) return;
    ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-esq-salvar")) { var o = {}; arr(ov.querySelectorAll("[data-esq-crit]")).forEach(function (i) { var v = parseFloat(String(i.value).replace(",", ".")); if (isFinite(v)) o[i.getAttribute("data-esq-crit")] = v; }); gravarCriterios(o); status("Critérios das esquadrias gravados neste aparelho."); criteriosTela(); }
      if (t.hasAttribute("data-esq-padrao")) { gravarCriterios({}); status("Critérios das esquadrias: padrão."); criteriosTela(); }
    });
  }

  var EsqAutoUI = {
    registrar: function (reg) {
      var R = global.BimRibbon;
      if (!R || !reg || !global.EsqAuto) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Portas e janelas", [
        { id: "esq-auto", rotulo: "Portas e janelas\nautomáticas", icone: "mais", grande: true, tipo: "menu",
          dica: "Lança portas e janelas pelo uso do ambiente: janela com a área mínima de iluminação e ventilação (1/6 e 1/8 — provisório, Uberlândia), tamanho comercial, só em parede externa, longe da divisa (1,50 m, Código Civil); porta na parede do acesso, boneca no canto, folha sem bater. Um Ctrl+Z desfaz; rodar de novo não duplica.",
          itens: [{ id: "esq-auto-sel", rotulo: "No ambiente selecionado", icone: "mais" }, { id: "esq-auto-todos", rotulo: "Em todos os ambientes", icone: "mais" }, { id: "esq-auto-acess", rotulo: "Em todos — projeto acessível (NBR 9050)", icone: "mais" }] },
        { id: "esq-auditar", rotulo: "Auditar\nesquadrias", icone: "calculadora", grande: true, dica: "Confere iluminação, ventilação, divisa, largura e varredura das portas, peitoril e banheiro sem ventilação — cada item com Corrigir e Mostrar no 3D." },
        { id: "esq-criterios", rotulo: "Critérios das\nesquadrias", icone: "regua", grande: true, dica: "Os números usados, com o nível da fonte: lei lida, provisório (conferir) ou critério RA (editável)." }
      ]);
      reg["esq-auto"] = function () { return true; };
      reg["esq-auto-sel"] = function () { lancar("sel"); return true; };
      reg["esq-auto-todos"] = function () { lancar("todos"); return true; };
      reg["esq-auto-acess"] = function () { lancar("acess"); return true; };
      reg["esq-auditar"] = function () { auditar(); return true; };
      reg["esq-criterios"] = function () { criteriosTela(); return true; };
      return true;
    },
    lancar: lancar, auditar: auditar, criterios: criteriosTela
  };
  global.EsqAutoUI = EsqAutoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = EsqAutoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
