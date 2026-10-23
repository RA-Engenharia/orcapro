/* =====================================================================
 * mobautoui.js — a TELA do "Mobiliar ambiente" e do "Auditar layout" (21/10/2026). Fiação fina: a conta está nos motores
 * puros (js/mobregras.js, js/mobauto.js, js/mobauditor.js).
 *
 * Fita: Arquitetura › "Mobiliário" (registrado pelo js/bimarqui.js, ao lado das portas e janelas):
 *   mob-auto       menu: no ambiente selecionado · em todos · refazer o automático (só o que ninguém mexeu) · projeto acessível
 *   mob-opcoes     estilo (contemporâneo/moderno/industrial…), padrão (econômico/médio/alto) e opcionais — neste aparelho
 *   mob-auditar    o auditor (cada problema: o que é + Corrigir + Mostrar no 3D — js/problemacard.js)
 * Todo comando aplica UM lote (BIM.editarLote): um Ctrl+Z desfaz. Rodar de novo não duplica; o que foi mexido à mão fica.
 * Ambiente sem tipo reconhecido: a janela oferece a lista curta de tipos (PADROES 1.3) — a escolha fica gravada no ambiente.
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var CHAVE = "raerp:bim:mobiliario-opcoes";
  var ESTILOS = [["contemporaneo", "Contemporâneo"], ["moderno", "Moderno"], ["industrial", "Industrial"], ["escandinavo", "Escandinavo"], ["minimalista", "Minimalista"]];
  var PADROES = [["economico", "Econômico"], ["medio", "Médio"], ["alto", "Alto padrão (fabricante › linha › acabamento)"]];

  function ops() { var B = global.BIM; try { return B && B.editarOps ? B.editarOps() : null; } catch (e) { return null; } }
  function estado() { var E = global.BimEdit, o = ops(); if (!o || !E) return null; try { return E.aplicar(o); } catch (e) { return null; } }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }
  function aplicar(lote) { var B = global.BIM; if (!B || !B.editarLote) { status("O editor 3D não está aberto."); return false; } return !!B.editarLote(lote); }
  function lerOpc() { try { var t = global.localStorage && global.localStorage.getItem(CHAVE), o = t ? JSON.parse(t) || {} : {}; return { estilo: o.estilo || "contemporaneo", padrao: o.padrao || "medio", opcionais: o.opcionais !== false }; } catch (e) { return { estilo: "contemporaneo", padrao: "medio", opcionais: true }; } }
  function gravarOpc(o) { try { if (global.localStorage) global.localStorage.setItem(CHAVE, JSON.stringify(o || {})); } catch (e) {} }
  function selecionados(st) {
    var B = global.BIM, uids = []; try { uids = (B && B.selecao ? B.selecao().uids : []) || []; } catch (e) { uids = []; }
    var ids = uids.map(function (u) { return String(u).replace(/^edit:/, ""); }), ambs = arr(st && st.ambientes).map(function (a) { return String(a.id); });
    try { var AU = global.BimAmbienteUI, s0 = AU && AU.selecionado ? AU.selecionado() : null; if (s0 != null && ids.indexOf(String(s0)) < 0) ids.push(String(s0)); } catch (e2) {}
    return ids.filter(function (id) { return ambs.indexOf(id) >= 0; });
  }

  function janela(titulo, html) {
    if (typeof document === "undefined") return null;
    var velho = document.getElementById("mob-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = document.createElement("div"); ov.id = "mob-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" data-mob-caixa style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:1080px;width:100%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-mob-fechar class="btn sm">Fechar</button></div>' + html + '</div>';
    ov.addEventListener("click", function (e) { if (e.target === ov || (e.target && e.target.hasAttribute && e.target.hasAttribute("data-mob-fechar"))) { if (ov.parentNode) ov.parentNode.removeChild(ov); } });
    document.body.appendChild(ov);
    return ov;
  }
  function lista(titulo, itens) { itens = arr(itens); if (!itens.length) return ""; return '<h4 style="margin:10px 0 4px">' + esc(titulo) + '</h4><ul style="margin:0 0 0 18px;padding:0">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"; }
  var COR = { N: "#1e7a3c", L: "#2d6a9c", S: "#5a6b7a", D: "#6a4c93", P: "#a35a00", "?": "#8a1c1c" };
  function selo(n) { var R = global.MobRegras, k = String(n || "?"); return '<span title="' + esc(R && R.NIVEIS[k] ? R.NIVEIS[k] : k) + '" style="display:inline-block;min-width:16px;text-align:center;border-radius:4px;padding:0 4px;color:#fff;background:' + (COR[k] || "#555") + ';font-weight:700;font-size:11px">' + esc(k) + "</span>"; }
  function legenda() { var R = global.MobRegras; if (!R) return ""; return '<p style="margin:4px 0 8px;font-size:12px">' + ["N", "L", "S", "D", "P", "?"].map(function (k) { return selo(k) + " " + esc(R.NIVEIS[k]); }).join(" &nbsp; ") + "</p>"; }
  function regrasHtml(rs) { return arr(rs).map(function (r) { return selo(r.nivel) + " " + esc(r.texto) + ' <span style="color:#667;font-size:11px" title="' + esc(r.fonte) + '">(' + esc(r.regra) + ")</span>"; }).join("<br>"); }

  /* ----------------------------------------------------------- comandos */
  function lancar(modo, extra) {
    var st = estado(), MA = global.MobAuto; if (!st || !MA) { status("O editor 3D não está aberto."); return; }
    var ids = null, op = lerOpc();
    if (modo === "sel" || modo === "refazer") { ids = selecionados(st); if (!ids.length) { status("Selecione um ambiente (clique no ambiente na planta) ou use \"Em todos os ambientes\"."); return; } }
    if (extra && extra.ids) ids = extra.ids;
    var res = MA.gerar({ estado: st, avaliarFam: avaliar(), ambientes: ids, estilo: op.estilo, padrao: op.padrao, opcionais: op.opcionais, acessivel: modo === "acess", refazer: modo === "refazer", ops: ops(), tipos: extra && extra.tipos });
    if (!res.ok) { janela("Mobiliar ambiente", "<p>" + esc(res.motivo) + "</p>"); status(res.motivo); return; }
    /* o tipo escolhido na janela fica gravado no ambiente (no MESMO lote: um Ctrl+Z volta os dois) */
    if (res.lote && extra && extra.tipos) Object.keys(extra.tipos).forEach(function (id) { res.lote.ops.unshift({ op: "ajustarAmbiente", id: id, campos: { params: { Uso_mobiliario: extra.tipos[id] } } }); });
    var aplicado = res.lote ? aplicar(res.lote) : false;
    mostrarResultado(res, aplicado, op);
    status("Mobiliar ambiente: " + res.resumo.pecas + " peça(s) em " + res.resumo.ambientes + " ambiente(s)" + (res.pendencias.length ? "; " + res.pendencias.length + " pendência(s)" : "") + ".");
    return res;
  }
  function mostrarResultado(res, aplicado, op) {
    var R = global.MobRegras, pecas = res.itens.filter(function (x) { return x.tipo === "peca"; });
    var linhas = pecas.map(function (x) {
      return "<tr><td>" + esc(x.ambienteNome) + "</td><td>" + esc(x.nome) + (x.escolha ? '<br><span style="font-size:11px;color:#667">' + esc(x.escolha) + "</span>" : "") + "</td><td>" + f2(x.L) + " × " + f2(x.P) + " × " + f2(x.A) + "</td><td>" + esc(x.precoTexto) +
        (x.provisorio ? ' <span style="color:#a35a00">(provisório — cotar com o fornecedor)</span>' : "") + "</td><td style=\"font-size:12px\">" + regrasHtml(x.regras) + "</td></tr>";
    }).join("");
    var naoRec = Object.keys(res.porAmbiente || {}).filter(function (k) { return !res.porAmbiente[k].tipo; });
    var tiposHtml = "";
    if (naoRec.length && R) {
      var opts = Object.keys(R.PROGRAMAS).filter(function (k) { return !R.PROGRAMAS[k].nada; }).map(function (k) { return '<option value="' + esc(k) + '">' + esc(R.NOMES[k] || k) + "</option>"; }).join("");
      tiposHtml = '<h4 style="margin:10px 0 4px">Ambientes sem tipo reconhecido</h4>' + naoRec.map(function (id) {
        var a = (res.leitura && res.leitura.ambientes || []).filter(function (x) { return String(x.id) === String(id); })[0];
        return '<div style="display:flex;gap:8px;align-items:center;margin:4px 0">"' + esc(a ? a.nome : id) + '" é <select data-mob-tipo="' + esc(id) + '"><option value="">— escolha —</option>' + opts + '</select><button type="button" class="btn sm" data-mob-tipo-ok="' + esc(id) + '">Gravar e mobiliar</button></div>';
      }).join("");
    }
    var html = legenda() + "<p><b>" + res.resumo.pecas + "</b> peça(s) em " + res.resumo.ambientes + " ambiente(s) — estilo <b>" + esc(op.estilo) + "</b>, padrão <b>" + esc(op.padrao) + "</b>" +
      (aplicado ? " — aplicado num lote (Ctrl+Z desfaz)." : (res.lote ? " — <b>não aplicado</b>." : ": nada a lançar (o que existe já atende).")) + (res.resumo.totalVarejo ? " Peças de varejo: <b>" + esc(res.resumo.totalVarejoTexto) + "</b> (o planejado sai pela composição própria, em m²)." : "") + "</p>" +
      (linhas ? '<table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th>Ambiente</th><th>Peça</th><th>L × P × A (m)</th><th>Preço (família)</th><th>Por que ficou ali (regra · fonte)</th></tr></thead><tbody>' + linhas + "</tbody></table>" : "") +
      tiposHtml + lista("Reduções (o que não coube e por quê)", res.reduzidos.map(function (x) { return x.texto; })) + lista("Pendências", res.pendencias.map(function (p) { return p.texto; })) +
      lista("Avisos", res.avisos) + lista("Notas", res.itens.filter(function (x) { return x.tipo !== "peca" && x.texto; }).map(function (x) { return x.texto; }));
    var ov = janela("Mobiliar ambiente", html);
    if (ov) ov.addEventListener("click", function (e) {
      var t = e.target, id = t && t.getAttribute ? t.getAttribute("data-mob-tipo-ok") : null; if (!id) return;
      var sel = ov.querySelector('[data-mob-tipo="' + id + '"]'), v = sel ? sel.value : ""; if (!v) { status("Escolha o tipo do ambiente."); return; }
      var tp = {}; tp[id] = v; lancar("todos", { ids: [id], tipos: tp });
    });
  }
  function auditar() {
    var st = estado(), AU = global.MobAuditor, PC = global.ProblemaCard; if (!st || !AU) { status("O editor 3D não está aberto."); return; }
    var res = AU.auditar({ estado: st, avaliarFam: avaliar(), ops: ops() }), probs = res.problemas;
    var erros = probs.filter(function (p) { return p.gravidade === "erro"; }), avs = probs.filter(function (p) { return p.gravidade !== "erro"; });
    var opts = { acoes: function (s) { return s && arr(s.ops).length ? (s.texto || true) : false; } };
    function bloco(L, tit, grav) {
      if (!L.length) return "";
      var o = { acoes: opts.acoes, titulo: tit, gravidade: grav, prefixoIndice: grav === "aviso" ? "a" : "e" };
      o.depois = function (p) { return '<p style="font-size:11px;margin:2px 0 0">' + selo(p.nivel) + " " + esc(p.regra ? p.regra + " — " : "") + esc(p.nivelRotulo) + "</p>"; };
      return PC ? PC.lista(L, o) : lista(tit, L.map(function (p) { return p.titulo; }));
    }
    var html = legenda() + (probs.length ? "" : "<p><b>Nenhum problema</b> no layout do mobiliário.</p>") + bloco(erros, "Erros (" + erros.length + ")", "erro") + bloco(avs, "Avisos (" + avs.length + ")", "aviso");
    var ov = janela("Auditar layout do mobiliário", html);
    if (ov && PC) PC.ligar(ov, {
      corrigir: function (solId, k) {
        var L = String(k).charAt(0) === "a" ? avs : erros, p = L[+String(k).slice(1)], s = p && arr(p.solucoes).filter(function (x) { return x.id === solId; })[0];
        if (!s || !arr(s.ops).length) return;
        if (aplicar({ op: "lote", id: "mob-corr-" + Date.now().toString(36), origem: (global.MobAuto && global.MobAuto.ORIGEM_AUD) || "mobiliario-auditor", pedido: "Corrigir: " + s.texto, ops: s.ops })) { status("Corrigido: " + s.texto + " (Ctrl+Z desfaz)."); auditar(); }
      },
      mostrar: function (ids) { PC.mostrarNo3D(ids); }
    });
    status("Auditar layout: " + erros.length + " erro(s), " + avs.length + " aviso(s).");
    return res;
  }
  function opcoesTela() {
    var o = lerOpc();
    function sel(nome, lst, v) { return '<select data-mob-op="' + nome + '">' + lst.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === v ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select>"; }
    var ov = janela("Estilo e padrão do mobiliário", '<p>Estilo ' + sel("estilo", ESTILOS, o.estilo) + ' &nbsp; Padrão ' + sel("padrao", PADROES, o.padrao) + '</p><p><label><input type="checkbox" data-mob-op="opcionais"' + (o.opcionais ? " checked" : "") + '> Lançar também os opcionais (tapete, poltrona, aparador, cômoda, aéreo…) quando couberem</label></p>' +
      '<p style="font-size:12px">O estilo filtra o catálogo (sem peça do estilo que caiba, usa a contemporânea — PADROES §5). Econômico = a de menor preço que cabe; médio = a de preço mediano; alto = a linha de arquiteto da categoria (fabricante › linha › acabamento) — preço sob consulta entra como provisório.</p>' +
      '<button type="button" class="btn primary sm" data-mob-salvar>Salvar</button>');
    if (!ov) return;
    ov.addEventListener("click", function (e) {
      if (!e.target || !e.target.hasAttribute || !e.target.hasAttribute("data-mob-salvar")) return;
      var n = {}; arr(ov.querySelectorAll("[data-mob-op]")).forEach(function (i) { var k = i.getAttribute("data-mob-op"); n[k] = i.type === "checkbox" ? !!i.checked : i.value; });
      gravarOpc(n); status("Mobiliário: estilo " + n.estilo + ", padrão " + n.padrao + " (neste aparelho)."); if (ov.parentNode) ov.parentNode.removeChild(ov);
    });
  }

  var MobAutoUI = {
    registrar: function (reg) {
      var R = global.BimRibbon;
      if (!R || !reg || !global.MobAuto) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Mobiliário", [
        { id: "mob-auto", rotulo: "Mobiliar\nambiente", icone: "mais", grande: true, tipo: "menu",
          dica: "Lança o mobiliário pelo uso do ambiente (quarto, sala, cozinha, escritório…) com as regras de circulação, porta, janela e encosto — cada peça com preço e a regra que a pôs ali. Um Ctrl+Z desfaz; rodar de novo não duplica; o que você mexeu fica.",
          itens: [{ id: "mob-auto-sel", rotulo: "No ambiente selecionado", icone: "mais" }, { id: "mob-auto-todos", rotulo: "Em todos os ambientes", icone: "mais" },
            { id: "mob-auto-refazer", rotulo: "Refazer o automático (selecionado)", icone: "mais" }, { id: "mob-auto-acess", rotulo: "Em todos — projeto acessível (NBR 9050)", icone: "mais" }] },
        { id: "mob-opcoes", rotulo: "Estilo e\npadrão", icone: "regua", grande: true, dica: "Contemporâneo, moderno ou industrial; econômico, médio ou alto padrão (fabricante › linha › acabamento)." },
        { id: "mob-auditar", rotulo: "Auditar\nlayout", icone: "calculadora", grande: true, dica: "Confere circulação, portas, janelas, sobreposição e passagem do layout (automático ou feito à mão) — cada item com Corrigir e Mostrar no 3D." }
      ]);
      reg["mob-auto"] = function () { return true; };
      reg["mob-auto-sel"] = function () { lancar("sel"); return true; };
      reg["mob-auto-todos"] = function () { lancar("todos"); return true; };
      reg["mob-auto-refazer"] = function () { lancar("refazer"); return true; };
      reg["mob-auto-acess"] = function () { lancar("acess"); return true; };
      reg["mob-opcoes"] = function () { opcoesTela(); return true; };
      reg["mob-auditar"] = function () { auditar(); return true; };
      return true;
    },
    lancar: lancar, auditar: auditar, opcoes: opcoesTela, lerOpcoes: lerOpc, gravarOpcoes: gravarOpc
  };
  global.MobAutoUI = MobAutoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MobAutoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
