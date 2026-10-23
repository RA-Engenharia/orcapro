/* =====================================================================
 * eleautoui.js — a TELA de "Lançar pontos elétricos" e do "Auditar pontos elétricos" (21/10/2026). Fiação fina: a conta
 * está nos motores puros (js/eleregras.js, js/eleauto.js, js/eleauditor.js). Molde: js/esqautoui.js.
 *
 * Fita: Instalações › "Pontos elétricos" (registrado pelo js/gestao.js, logo depois das Instalações P12):
 *   ele-auto        menu: no ambiente selecionado · em todos os ambientes
 *   ele-auditar     o auditor (cada problema: o que é + Corrigir + Mostrar no 3D — js/problemacard.js)
 *   ele-criterios   os critérios com o NÍVEL da fonte; os de critério RA / sem fonte são editáveis neste aparelho
 * Todo comando aplica UM lote (BIM.editarLote): um Ctrl+Z desfaz. Rodar de novo não duplica (o que existe conta).
 * NBR 5410:2004 conferida no item (cópia não licenciada à RA): a tela diz o item de cada regra; o que não é da norma sai como critério RA ou sem fonte.
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var CHAVE = "raerp:bim:eletrica-criterios";

  function estado() { var B = global.BIM, E = global.BimEdit; if (!B || !B.editarOps || !E) return null; try { return E.aplicar(B.editarOps()); } catch (e) { return null; } }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }
  /* TRAVA POR LICENÇA NA FUNÇÃO (revisão 21/10/2026): a fita esconde o grupo quando a disciplina elétrica não está liberada
     (js/bimdisciplinas.js), mas o comando também é chamado por atalho e pelo "Corrigir" do auditor — a função confere sozinha. */
  var TRANCADA = "Os pontos elétricos fazem parte do OrçaPRO Modela Elétrica & Dados: a disciplina não está liberada nesta conta.";
  function liberada() { try { var D = global.BimDisciplinas; return !(D && typeof D.trancada === "function" && D.trancada("eletrica")); } catch (e) { return true; } }
  function trancou(titulo) { if (liberada()) return false; status(TRANCADA); janela(titulo, "<p>" + esc(TRANCADA) + "</p>"); return true; }
  function aplicar(lote) { var B = global.BIM; if (!liberada()) { status(TRANCADA); return false; } if (!B || !B.editarLote) { status("O editor 3D não está aberto."); return false; } return !!B.editarLote(lote); }
  function lerCriterios() { try { var t = global.localStorage && global.localStorage.getItem(CHAVE); return t ? JSON.parse(t) || {} : {}; } catch (e) { return {}; } }
  function gravarCriterios(o) { try { if (global.localStorage) global.localStorage.setItem(CHAVE, JSON.stringify(o || {})); } catch (e) {} }
  function selecionados(st) {
    var B = global.BIM, uids = []; try { uids = (B && B.selecao ? B.selecao().uids : []) || []; } catch (e) { uids = []; }
    var ids = uids.map(function (u) { return String(u).replace(/^edit:/, ""); }), ambs = arr(st && st.ambientes).map(function (a) { return String(a.id); });
    try { var AU = global.BimAmbienteUI, s0 = AU && AU.selecionado ? AU.selecionado() : null; if (s0 != null && ids.indexOf(String(s0)) < 0) ids.push(String(s0)); } catch (e2) {}
    return ids.filter(function (id) { return ambs.indexOf(id) >= 0; });
  }

  function janela(titulo, html) {
    if (typeof document === "undefined") return null;
    var velho = document.getElementById("ele-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = document.createElement("div"); ov.id = "ele-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" data-ele-caixa style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:1080px;width:100%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-ele-fechar class="btn sm">Fechar</button></div>' + html + '</div>';
    ov.addEventListener("click", function (e) { if (e.target === ov || (e.target && e.target.hasAttribute && e.target.hasAttribute("data-ele-fechar"))) { if (ov.parentNode) ov.parentNode.removeChild(ov); } });
    document.body.appendChild(ov);
    return ov;
  }
  function lista(titulo, itens) {
    itens = arr(itens); if (!itens.length) return "";
    return '<h4 style="margin:10px 0 4px">' + esc(titulo) + '</h4><ul style="margin:0 0 0 18px;padding:0">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }
  var COR = { A: "#1e7a3c", N: "#1e5a7a", S: "#a35a00", C: "#2d6a9c", X: "#8a1c1c" };
  function selo(n) { var k = String(n || "X").charAt(0), R = global.EleRegras; return '<span title="' + esc(R ? R.rotuloNivel(k) : k) + '" style="display:inline-block;min-width:18px;text-align:center;border-radius:4px;padding:0 4px;color:#fff;background:' + (COR[k] || "#555") + ';font-weight:700">' + esc(k) + "</span>"; }
  function legenda() {
    var R = global.EleRegras; if (!R) return "";
    return '<p style="margin:4px 0 6px;font-size:12px">' + ["N", "A", "C", "X"].map(function (k) { return selo(k) + " " + esc(R.NIVEIS[k]); }).join(" &nbsp; ") + "</p>" +
      '<p data-ele-aviso-norma style="margin:0 0 8px;padding:6px 8px;border-radius:6px;background:rgba(30,90,122,.10);font-size:12px"><b>NBR 5410:2004</b> conferida no item (cópia <b>não licenciada</b> à RA: só valores e itens). Alturas, posição do interruptor e número de luminárias não são da norma: saem como critério RA ou sem fonte. Circuitos, quadro e condutor ficam para a próxima etapa.</p>';
  }
  var ROT = { tomada: "Tomada", interruptor: "Interruptor", luminaria: "Luminária", direta: "Ligação direta" };

  function lancar(modo) {
    if (trancou("Lançar pontos elétricos")) return;
    var st = estado(), EL = global.EleAuto; if (!st || !EL) { status("O editor 3D não está aberto."); return; }
    var ids = null;
    if (modo === "sel") { ids = selecionados(st); if (!ids.length) { status("Selecione um ambiente (clique no ambiente na planta) ou use \"Em todos os ambientes\"."); return; } }
    var res = EL.gerar({ estado: st, avaliarFam: avaliar(), ambientes: ids, criterios: lerCriterios() });
    if (!res.ok) { janela("Lançar pontos elétricos", "<p>" + esc(res.motivo) + "</p>"); status(res.motivo); return; }
    var aplicado = res.lote ? aplicar(res.lote) : false, z = res.resumo;
    var amb = res.porAmbiente.map(function (r) {
      return "<tr><td>" + esc(r.nome) + "</td><td>" + esc(r.grupoRotulo) + "</td><td>" + f2(r.area) + " / " + f2(r.perimetro) + "</td><td>" + r.luz.existente + " + " + r.luz.lancado + " <small>(mín. " + r.luz.exigidoNorma + "; RA " + r.luz.sugeridoRA + "; " + r.luz.vaMinimo + " VA)</small></td><td>" +
        r.tug.existente + " + " + r.tug.lancado + " <small>(mín. " + r.tug.exigido + "; " + r.tug.va + " VA)</small></td><td>" + (r.tue.length ? r.tue.map(function (t) { return esc(t.nome) + (t.potencia_W ? " " + t.potencia_W + " W" : "") + (t.existente ? " (já tem)" : t.lancado ? "" : " (pendente)"); }).join("<br>") : "—") + "</td><td>" + r.interruptores.existente + " + " + r.interruptores.lancado + "</td></tr>";
    }).join("");
    var linhas = res.itens.map(function (x) {
      return "<tr><td>" + esc(x.id) + "</td><td>" + esc(x.ambienteNome) + "</td><td>" + esc(ROT[x.tipo] || x.tipo) + (x.uso ? " " + esc(x.uso) : "") + (x.tipoId ? " · " + esc(x.tipoId) : "") + " · " + f2(x.altura) + " m</td><td style=\"font-size:12px\">" + arr(x.regras).map(esc).join("<br>") + "</td></tr>";
    }).join("");
    var html = legenda() + "<p><b>" + z.luminarias + "</b> ponto(s) de luz, <b>" + z.tug + "</b> tomada(s) de uso geral, <b>" + z.tue + "</b> de uso específico e <b>" + z.interruptores + "</b> interruptor(es) em " + z.ambientes + " ambiente(s)" +
      (aplicado ? " — aplicado num lote (Ctrl+Z desfaz)." : (res.lote ? " — <b>não aplicado</b>." : ": nada a lançar (o que existe já atende).")) + "</p>" +
      '<table class="tbl" style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>Ambiente</th><th>Regra</th><th>Área m² / perímetro m</th><th>Luz (tinha + lançou)</th><th>TUG</th><th>TUE</th><th>Interruptor</th></tr></thead><tbody>' + amb + "</tbody></table>" +
      (linhas ? '<h4 style="margin:10px 0 4px">Pontos lançados</h4><table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th>Peça</th><th>Ambiente</th><th>O quê</th><th>Regras aplicadas</th></tr></thead><tbody>' + linhas + "</tbody></table>" : "") +
      '<p style="font-size:12px;margin-top:8px">Orçamento: cada ponto entra com a composição SINAPI do dispositivo (pela altura: baixa 0,30 · média 1,30 · alta 2,00 m) e a da caixa (4×2 na parede, octogonal no teto) — ' + selo("A") + " SINAPI MG 06/2026. A base não tem composição \"ponto de tomada\": eletroduto e cabo entram com os circuitos.</p>" +
      lista("Pendências", res.pendencias.map(function (p) { return p.texto; })) + lista("Avisos", res.avisos);
    janela("Lançar pontos elétricos", html);
    status("Pontos elétricos: " + z.luminarias + " luz, " + z.tug + " TUG, " + z.tue + " TUE, " + z.interruptores + " interruptor(es)" + (res.pendencias.length > 1 ? "; " + (res.pendencias.length - 1) + " pendência(s)" : "") + ".");
    return res;
  }
  function auditar() {
    if (trancou("Auditar pontos elétricos")) return;
    var st = estado(), AU = global.EleAuditor, PC = global.ProblemaCard; if (!st || !AU) { status("O editor 3D não está aberto."); return; }
    var res = AU.auditar({ estado: st, avaliarFam: avaliar(), criterios: lerCriterios() }), probs = res.problemas;
    var erros = probs.filter(function (p) { return p.gravidade === "erro"; }), avs = probs.filter(function (p) { return p.gravidade !== "erro"; });
    function bloco(L, tit, grav) {
      if (!L.length) return "";
      var o = { acoes: function (s) { return s && arr(s.ops).length ? (s.texto || true) : false; }, titulo: tit, gravidade: grav, prefixoIndice: grav === "aviso" ? "a" : "e" };
      o.depois = function (p) { return '<p style="font-size:11px;margin:2px 0 0">' + selo(p.nivel) + " " + esc(p.nivelRotulo) + "</p>"; };
      return PC ? PC.lista(L, o) : lista(tit, L.map(function (p) { return p.titulo; }));
    }
    var html = legenda() + (probs.length ? "" : "<p><b>Nenhum problema</b> nos pontos elétricos do modelo.</p>") + bloco(erros, "Erros (" + erros.length + ")", "erro") + bloco(avs, "Avisos (" + avs.length + ")", "aviso");
    var ov = janela("Auditar pontos elétricos", html);
    if (ov && PC) PC.ligar(ov, {
      corrigir: function (solId, k) {
        var L = String(k).charAt(0) === "a" ? avs : erros, p = L[+String(k).slice(1)], s = p && arr(p.solucoes).filter(function (x) { return x.id === solId; })[0];
        if (!s || !arr(s.ops).length) return;
        if (aplicar({ op: "lote", id: "ele-corr-" + Date.now().toString(36), origem: "eletrica-auditor", pedido: "Corrigir: " + s.texto, ops: s.ops })) { status("Corrigido: " + s.texto + " (Ctrl+Z desfaz)."); auditar(); }
      },
      mostrar: function (ids) { PC.mostrarNo3D(ids); }
    });
    status("Auditar pontos elétricos: " + erros.length + " erro(s), " + avs.length + " aviso(s).");
    return res;
  }
  function criteriosTela() {
    var R = global.EleRegras; if (!R) return;
    var C = R.criterios(lerCriterios());
    var linhas = Object.keys(C).map(function (k) {
      var c = C[k], ed = c.nivel === "C" || c.nivel === "X";
      return "<tr><td>" + selo(c.nivel) + "</td><td>" + esc(c.rotulo) + (c.item ? " <small>(" + esc(c.item) + ")</small>" : "") + '</td><td>' + (ed ? '<input data-ele-crit="' + esc(k) + '" type="number" step="0.01" value="' + (Math.round(c.valor * 10000) / 10000) + '" style="width:80px">' : esc(String(c.valor).replace(".", ","))) + '</td><td style="font-size:12px">' + esc(c.fonte) + "</td></tr>";
    }).join("");
    var ov = janela("Critérios dos pontos elétricos", legenda() + '<table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th></th><th>Critério</th><th>Valor</th><th>Fonte</th></tr></thead><tbody>' + linhas + "</tbody></table>" +
      '<p style="font-size:12px">Os números da NBR 5410 (N) e da SINAPI/CEMIG (A) não se editam aqui: mudam com a fonte. Os de critério RA (C) e sem fonte (X) valem neste aparelho.</p>' +
      '<div style="display:flex;gap:8px"><button type="button" class="btn primary sm" data-ele-salvar>Salvar</button><button type="button" class="btn ghost sm" data-ele-padrao>Voltar ao padrão</button></div>');
    if (!ov) return;
    ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-ele-salvar")) { var o = {}; arr(ov.querySelectorAll("[data-ele-crit]")).forEach(function (i) { var v = parseFloat(String(i.value).replace(",", ".")); if (isFinite(v)) o[i.getAttribute("data-ele-crit")] = v; }); gravarCriterios(o); status("Critérios dos pontos elétricos gravados neste aparelho."); criteriosTela(); }
      if (t.hasAttribute("data-ele-padrao")) { gravarCriterios({}); status("Critérios dos pontos elétricos: padrão."); criteriosTela(); }
    });
  }

  var EleAutoUI = {
    registrar: function (reg) {
      var R = global.BimRibbon;
      if (!R || !reg || !global.EleAuto) return false;
      R.acrescentar("instalacoes", "Instalações", "Pontos elétricos", [
        { id: "ele-auto", rotulo: "Lançar pontos\nelétricos", icone: "mais", grande: true, tipo: "menu",
          dica: "Pelo uso e pela área do ambiente: ponto de luz no teto, tomadas de uso geral pelo perímetro (cozinha 3,5 m; sala/quarto 5 m; banheiro junto ao lavatório), tomada de uso específico dos aparelhos do modelo (chuveiro elétrico, lavadora, geladeira, forno, cooktop, ar) e interruptor junto à porta, do lado da maçaneta. Nada em vão, atrás da porta, de móvel fixo ou no box. NBR 5410:2004 conferida no item. Um Ctrl+Z desfaz; rodar de novo não duplica.",
          itens: [{ id: "ele-auto-sel", rotulo: "No ambiente selecionado", icone: "mais" }, { id: "ele-auto-todos", rotulo: "Em todos os ambientes", icone: "mais" }] },
        { id: "ele-auditar", rotulo: "Auditar pontos\nelétricos", icone: "calculadora", grande: true, dica: "Confere qualquer projeto: luz e interruptor por cômodo, mínimo de tomadas, bancada da pia, tomada dos aparelhos, ponto no vão, atrás da porta ou de móvel, perto do box, caixa — cada item com Corrigir e Mostrar no 3D." },
        { id: "ele-criterios", rotulo: "Critérios dos\npontos", icone: "regua", grande: true, dica: "Os números usados, com o nível da fonte: NBR 5410:2004 (item lido), SINAPI/CEMIG lida, critério RA ou sem fonte." }
      ]);
      reg["ele-auto"] = function () { return true; };
      reg["ele-auto-sel"] = function () { lancar("sel"); return true; };
      reg["ele-auto-todos"] = function () { lancar("todos"); return true; };
      reg["ele-auditar"] = function () { auditar(); return true; };
      reg["ele-criterios"] = function () { criteriosTela(); return true; };
      return true;
    },
    lancar: lancar, auditar: auditar, criterios: criteriosTela, liberada: liberada
  };
  global.EleAutoUI = EleAutoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = EleAutoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
