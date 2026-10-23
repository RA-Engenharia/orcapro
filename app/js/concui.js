/* =====================================================================
 * concui.js — a TELA do "Pré-lançar estrutura" de concreto e do auditor (frente "concreto F1", 21/10/2026).
 * Fiação fina: a conta está nos motores puros (js/conclanc.js, js/concauditor.js) e os números em js/concdados.js.
 * Molde: js/eleautoui.js / js/esqautoui.js.
 *
 * Fita: Estrutura › "Pré-lançamento" (registrado pelo js/gestao.js, logo depois dos Pontos elétricos):
 *   conc-prelancar     menu: laje automática (maciça até 5 m, treliçada acima) · só maciça · só treliçada · refazer tudo
 *   conc-auditar       o auditor (cada problema: o que é + Corrigir + Mostrar no 3D — js/problemacard.js)
 *   conc-quant         o quantitativo preliminar (concreto, fôrma, aço por taxa) — ESTIMATIVA, já no orçamento do modelo
 *   conc-ifc           o IFC para o cálculo externo (IfcColumn/IfcBeam/IfcSlab com seção e o rótulo A CALCULAR)
 *   conc-criterios     os critérios com a fonte e o status (norma lida · literatura · regra do produto)
 * Todo comando aplica UM lote (BIM.editarLote): um Ctrl+Z desfaz. Rodar de novo não duplica nem passa por cima do que foi
 * mexido à mão. ⚠ Nada aqui é cálculo: tudo sai "PRÉ-DIMENSIONAMENTO — A CALCULAR".
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function CL() { return global.ConcLanc || null; }
  function AU() { return global.ConcAuditor || null; }

  /* TRAVA POR LICENÇA NA FUNÇÃO (como js/eleautoui.js): a fita esconde o grupo quando a disciplina Estrutura não está
     liberada, mas o comando também vem por atalho, busca de comandos e pelo "Corrigir" do auditor */
  var TRANCADA = "O pré-lançamento de estrutura faz parte do OrçaPRO Modela Estrutura: a disciplina não está liberada nesta conta.";
  function liberada() { try { var D = global.BimDisciplinas; return !(D && typeof D.trancada === "function" && D.trancada("estrutura")); } catch (e) { return true; } }
  function trancou(titulo) { if (liberada()) return false; status(TRANCADA); janela(titulo, "<p>" + esc(TRANCADA) + "</p>"); return true; }
  function ops() { var B = global.BIM; try { return B && B.editarOps ? B.editarOps() : []; } catch (e) { return []; } }
  function niveis() { var E = global.BimEdit; try { return E && E.niveisAtuais ? E.niveisAtuais() : null; } catch (e) { return null; } }
  function estado() { var E = global.BimEdit, B = global.BIM; if (!B || !B.editarOps || !E) return null; try { return E.aplicar(B.editarOps()); } catch (e) { return null; } }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }
  /* a categoria da família (pilar/viga/laje): a estrutura já modelada por família não recebe outra por cima */
  function catFam() { var B = global.BIM; return B && B.familiaCategoria ? function (id) { return B.familiaCategoria(id); } : null; }
  function aplicar(lote) { var B = global.BIM; if (!liberada()) { status(TRANCADA); return false; } if (!B || !B.editarLote) { status("O editor 3D não está aberto."); return false; } return !!B.editarLote(lote); }

  function janela(titulo, html) {
    if (typeof document === "undefined") return null;
    var velho = document.getElementById("conc-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = document.createElement("div"); ov.id = "conc-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" data-conc-caixa style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:1080px;width:100%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-conc-fechar class="btn sm">Fechar</button></div>' + html + "</div>";
    ov.addEventListener("click", function (e) { if (e.target === ov || (e.target && e.target.hasAttribute && e.target.hasAttribute("data-conc-fechar"))) { if (ov.parentNode) ov.parentNode.removeChild(ov); } });
    document.body.appendChild(ov);
    return ov;
  }
  function lista(titulo, itens) {
    itens = arr(itens); if (!itens.length) return "";
    return '<h4 style="margin:10px 0 4px">' + esc(titulo) + '</h4><ul style="margin:0 0 0 18px;padding:0">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }
  /* a faixa que nunca sai da tela: nada aqui é cálculo */
  function faixa() {
    return '<p data-conc-rotulo style="margin:0 0 8px;padding:7px 10px;border-radius:6px;background:rgba(163,90,0,.12);border-left:4px solid #a35a00;font-size:12.5px"><b>PRÉ-DIMENSIONAMENTO — A CALCULAR.</b> ' +
      "Posição e seção de partida por regras de concepção com fonte (NBR 6118:2014 lida e Emenda 1:2026 conferida — a vigente é a 6118:2026, conferir; literatura de pré-dimensionamento). " +
      "Não é cálculo: o engenheiro responsável (ART) calcula, dimensiona e assina.</p>";
  }
  function tabela(cab, linhas) {
    if (!linhas.length) return "";
    return '<table class="tbl" style="width:100%;border-collapse:collapse;margin:4px 0 8px"><thead><tr>' + cab.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      linhas.map(function (l) { return "<tr>" + l.map(function (c) { return '<td style="font-size:12px">' + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  function mostrar(ids) { var PC = global.ProblemaCard; if (PC && PC.mostrarNo3D) PC.mostrarNo3D(ids); }

  /* ----------------------------------------------------------- comandos */
  function prelancar(modo) {
    var T = "Pré-lançar estrutura (concreto)";
    if (trancou(T)) return null;
    var st = estado(), C = CL(); if (!st || !C) { status("O editor 3D não está aberto."); return null; }
    var res = C.gerar(st, { avaliarFam: avaliar(), categoriaFam: catFam(), niveis: niveis(), ops: ops(), forcar: modo === "refazer", tipoLaje: modo === "macica" || modo === "trelicada" ? modo : "auto" });
    if (!res.ok) { janela(T, faixa() + "<p>" + esc(res.motivo) + "</p>" + lista("Avisos", res.avisos)); status(res.motivo); return res; }
    var ok = aplicar(res.lote), R = res.resumo;
    var html = faixa() + "<p><b>" + res.pecas.length + "</b> peça(s): " + R.pilar.n + " pilar(es), " + R.viga.n + " viga(s), " + R.laje.n + " laje(s) em " + res.pavimentos.length + " pavimento(s)" +
      (ok ? " — aplicado num lote (Ctrl+Z desfaz tudo)." : " — <b>não aplicado</b>.") + ' <button type="button" class="btn ghost sm" data-conc-ver>Mostrar no 3D</button></p>' +
      (res.manuais.mantidos.length ? "<p>Mexido à mão e mantido como está: " + esc(res.manuais.mantidos.join(", ")) + ' (para refazer tudo: Pré-lançar › "Refazer tudo").</p>' : "") +
      "<p>Estimativa (já no orçamento do modelo, marcada): concreto " + f2(R.m3, 3) + " m³ · fôrma " + f2(R.forma) + " m² · aço " + f2(R.aco, 0) + " kg (taxa " + R.taxa + " kg/m³)" + (R.trelicadaM2 ? " · laje treliçada " + f2(R.trelicadaM2) + " m²" : "") + ".</p>" +
      "<h4 style=\"margin:10px 0 4px\">Pilares</h4>" + tabela(["Marca", "Pavimento", "Seção (cm)", "Onde", "Ai (m²)", "Regra"], res.pilares.map(function (p) { return [p.marca, p.pav, p.secao, p.tipoNo + (p.transicao ? " · TRANSIÇÃO" : "") + (p.conflito ? " · encosta em " + p.conflito : ""), f2(p.Ai), p.regra]; })) +
      "<h4 style=\"margin:10px 0 4px\">Vigas</h4>" + tabela(["Peça", "Pavimento", "Seção (cm)", "Vão (m)", "Regra"], res.vigas.filter(function (x) { return !x.pulada; }).map(function (x) { return [x.id, x.pav, x.secao, f2(x.vao), x.regra]; })) +
      "<h4 style=\"margin:10px 0 4px\">Lajes</h4>" + tabela(["Marca", "Ambiente", "Tipo", "h (cm)", "lx × ly (m)", "Regra"], res.lajes.filter(function (x) { return !x.pulada; }).map(function (x) { return [x.marca, x.amb, x.tipo === "macica" ? "maciça" : "treliçada", String(x.h), f2(x.lx) + " × " + f2(x.ly), x.regra]; })) +
      lista("Avisos", res.avisos) + lista("Premissas e fontes", res.premissas) + lista("Pendências", res.pendencias) +
      '<p style="margin-top:8px"><button type="button" class="btn primary sm" data-conc-auditar>Auditar a estrutura</button> <button type="button" class="btn ghost sm" data-conc-ifc>IFC para o cálculo</button></p>';
    var ov = janela(T, html);
    if (ov) ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-conc-ver")) mostrar(res.pecas.map(function (c) { return c.id; }));
      if (t.hasAttribute("data-conc-auditar")) auditar();
      if (t.hasAttribute("data-conc-ifc")) ifc();
    });
    status("Pré-lançamento: " + R.pilar.n + " pilar(es), " + R.viga.n + " viga(s), " + R.laje.n + " laje(s) — PRÉ-DIMENSIONAMENTO, A CALCULAR.");
    return res;
  }
  function auditar() {
    var T = "Auditar estrutura (concreto)";
    if (trancou(T)) return null;
    var st = estado(), A = AU(), PC = global.ProblemaCard; if (!st || !A) { status("O editor 3D não está aberto."); return null; }
    var res = A.auditar({ estado: st, avaliarFam: avaliar(), categoriaFam: catFam() }), probs = res.problemas;
    var erros = probs.filter(function (p) { return p.gravidade === "erro"; }), avs = probs.filter(function (p) { return p.gravidade !== "erro"; });
    var opts = { acoes: function (s) { return s && arr(s.ops).length ? (s.texto || true) : false; } };
    function bloco(L, tit, grav) {
      if (!L.length) return "";
      var o = {}; Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); o.titulo = tit; o.gravidade = grav; o.prefixoIndice = grav === "aviso" ? "a" : "e";
      o.depois = function (p) { return '<p style="font-size:11px;margin:2px 0 0">' + esc(p.tipo) + " · " + esc(p.nivelRotulo) + "</p>"; };
      return PC ? PC.lista(L, o) : lista(tit, L.map(function (p) { return p.titulo + " — " + p.texto; }));
    }
    var html = faixa() + "<p>" + res.resumo.pilares + " pilar(es), " + res.resumo.vigas + " viga(s), " + res.resumo.lajes + " laje(s) conferidos (pré-lançados e lançados à mão).</p>" +
      (erros.length ? "" : "<p><b>Nenhum erro</b> de concepção nas regras conferidas.</p>") + bloco(erros, "Erros (" + erros.length + ")", "erro") + bloco(avs, "Avisos e escalar (" + avs.length + ")", "aviso");
    var ov = janela(T, html);
    if (ov && PC) PC.ligar(ov, {
      corrigir: function (solId, k) {
        var L = String(k).charAt(0) === "a" ? avs : erros, p = L[+String(k).slice(1)], s = p && arr(p.solucoes).filter(function (x) { return x.id === solId; })[0];
        if (!s || !arr(s.ops).length) return;
        if (aplicar({ op: "lote", id: "conc-corr-" + Date.now().toString(36), origem: "conc-auditor", pedido: ("Corrigir: " + s.texto).slice(0, 300), ops: s.ops })) { status("Corrigido: " + s.texto + " (Ctrl+Z desfaz)."); auditar(); }
      },
      mostrar: function (ids) { PC.mostrarNo3D(ids); }
    });
    status("Auditar estrutura: " + erros.length + " erro(s), " + avs.length + " aviso(s).");
    return res;
  }
  function quant() {
    var T = "Quantitativo preliminar da estrutura";
    if (trancou(T)) return null;
    var st = estado(), C = CL(); if (!st || !C) { status("O editor 3D não está aberto."); return null; }
    var q = C.quantitativo(st), R = q.total;
    var html = faixa() + (q.itens.length ? "" : "<p>Nenhuma peça pré-lançada: rode o Pré-lançar estrutura.</p>") +
      tabela(["Peça", "Marca", "Pavimento", "Seção", "Concreto (m³)", "Fôrma (m²)", "Aço (kg, taxa)", "Treliçada (m²)", "Composições"], q.itens.map(function (i) {
        return [i.id, i.marca, i.pav, i.secao, i.concretoM3 == null ? "na composição" : f2(i.concretoM3, 3), i.formaM2 == null ? "—" : f2(i.formaM2), i.acoKg == null ? "—" : String(i.acoKg), i.trelicadaM2 == null ? "—" : f2(i.trelicadaM2), i.servicos.join(", ")];
      })) +
      "<p><b>Total (estimativa):</b> concreto " + f2(R.m3, 3) + " m³ · fôrma " + f2(R.forma) + " m² · aço " + f2(R.aco, 0) + " kg" + (R.trelicadaM2 ? " · treliçada " + f2(R.trelicadaM2) + " m²" : "") + ".</p>" +
      lista("Avisos", q.avisos);
    janela(T, html);
    return q;
  }
  function ifc() {
    var T = "IFC para o cálculo externo";
    if (trancou(T)) return null;
    var st = estado(), C = CL(), B = global.BIM; if (!st || !C) { status("O editor 3D não está aberto."); return null; }
    var ids = arr(st.caixas).filter(C.ehPreLanc).map(function (c) { return String(c.id); });
    if (!B || !B.ifcSaida) { janela(T, faixa() + "<p>O exportador IFC não está montado.</p>"); return null; }
    return B.ifcSaida({}).then(function (r) {
      if (!r || !r.ok) { janela(T, faixa() + "<p>O IFC não saiu: " + esc((r && r.erro) || "erro") + "</p>"); return r; }
      var cf = C.ifcConferir(r.texto, ids);
      janela(T, faixa() + "<p>Peças pré-lançadas no IFC: <b>" + cf.colunas + "</b> IfcColumn, <b>" + cf.vigas + "</b> IfcBeam, <b>" + cf.lajes + "</b> IfcSlab, com a seção (IfcRectangleProfileDef) e o rótulo nos comentários." +
        (cf.faltando.length ? ' <b style="color:#8a1c1c">Faltaram: ' + esc(cf.faltando.join(", ")) + "</b>" : "") +
        (arr(cf.semRotulo).length ? ' <b style="color:#8a1c1c">Sem o rótulo A CALCULAR no tipo: ' + esc(cf.semRotulo.join(", ")) + "</b>" : "") + "</p>" +
        "<p>O arquivo é o IFC4 do projeto inteiro (arquitetura + estrutura): abra no programa de cálculo, lance as cargas e dimensione. O pré-lançamento só dá a posição e a seção de partida.</p>" +
        '<p><button type="button" class="btn primary sm" data-conc-baixar>Baixar o IFC</button></p>');
      var ov = document.getElementById("conc-modal");
      if (ov) ov.addEventListener("click", function (e) {
        if (!e.target || !e.target.hasAttribute || !e.target.hasAttribute("data-conc-baixar")) return;
        try { if (global.Gestao && global.Gestao._ifcSaidaExportar) global.Gestao._ifcSaidaExportar(); } catch (eX) { status("Não consegui baixar o IFC."); }
      });
      return { ok: true, conferencia: cf };
    });
  }
  function criterios() {
    var D = global.ConcDados; if (!D) return null;
    var ST = { "norma-lida": "N", "literatura-primaria": "L", "literatura-secundaria": "S", "decisao-produto": "P", "sem-fonte": "X" }, COR = { N: "#1e5a7a", L: "#1e7a3c", S: "#a35a00", P: "#2d6a9c", X: "#8a1c1c" };
    function selo(st) { var k = ST[st] || "X"; return '<span title="' + esc(D.statusLegenda[st] || st) + '" style="display:inline-block;min-width:18px;text-align:center;border-radius:4px;padding:0 4px;color:#fff;background:' + COR[k] + ';font-weight:700">' + k + "</span>"; }
    var linhas = Object.keys(D.criterios).map(function (k) {
      var c = D.criterios[k], val = typeof c.valor === "object" ? JSON.stringify(c.valor) : String(c.valor);
      return "<tr><td>" + selo(c.status) + "</td><td>" + esc(k) + "</td><td>" + esc(val) + '</td><td style="font-size:12px">' + esc((c.fonte && D.fontes[c.fonte] ? D.fontes[c.fonte] : "sem fonte") + (c.item ? " — " + c.item : "")) + "</td></tr>";
    }).join("");
    var nm = D.normas || {};
    janela("Critérios do pré-lançamento (concreto)", faixa() +
      '<p style="font-size:12px">' + Object.keys(ST).map(function (s) { return selo(s) + " " + esc(D.statusLegenda[s] || s); }).join(" &nbsp; ") + "</p>" +
      lista("Normas", Object.keys(nm).map(function (k) { var n = nm[k]; return n.titulo + ": " + (n.vigente ? "vigente " + n.vigente + "; " : "") + (n.lida ? "lida " + n.lida + "; " : "") + (n.conferencia || n.uso || ""); })) +
      '<table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th></th><th>Critério</th><th>Valor</th><th>Fonte</th></tr></thead><tbody>' + linhas + "</tbody></table>" +
      lista("Pendências", arr(D.pendencias).map(function (p) { return p.id + " — " + p.texto; })));
    return D;
  }

  var ConcUI = {
    registrar: function (reg) {
      var R = global.BimRibbon;
      if (!R || !reg || !global.ConcLanc) return false;
      R.acrescentar("estrutura", "Estrutura", "Pré-lançamento", [
        { id: "conc-prelancar", rotulo: "Pré-lançar\nestrutura", icone: "estrutura", grande: true, tipo: "menu",
          dica: "Sobre a arquitetura: pilares nos cantos, encontros e pontas das paredes (dentro delas, fora das portas e janelas, em prumo nos pavimentos, vão até 5,5 m), vigas sob as paredes de pilar a pilar (h = ℓ/10 ou ℓ/12) e lajes por ambiente (maciça até 5 m, treliçada acima). PRÉ-DIMENSIONAMENTO — A CALCULAR. Um Ctrl+Z desfaz; rodar de novo não duplica nem passa por cima do que você mexeu.",
          itens: [{ id: "conc-pre-auto", rotulo: "Laje automática (maciça até 5 m, treliçada acima)", icone: "estrutura" }, { id: "conc-pre-macica", rotulo: "Todas as lajes maciças", icone: "estrutura" },
                  { id: "conc-pre-trelicada", rotulo: "Todas as lajes treliçadas", icone: "estrutura" }, { id: "conc-pre-refazer", rotulo: "Refazer tudo (descarta o que mexi no pré-lançamento)", icone: "estrutura" }] },
        { id: "conc-auditar", rotulo: "Auditar\nestrutura", icone: "calculadora", grande: true, dica: "Confere qualquer estrutura de concreto do modelo: pilar no vão de porta/janela, viga cortando janela, vão de viga e de laje acima do limite, balanço, pilar desalinhado ou sem continuidade, viga sem apoio, seções mínimas da NBR 6118 — cada item com Corrigir e Mostrar no 3D." },
        { id: "conc-quant", rotulo: "Quantitativo\npreliminar", icone: "regua", grande: true, dica: "Concreto (m³), fôrma (m²) e aço por taxa de fonte declarada das peças pré-lançadas — ESTIMATIVA marcada, já no orçamento do modelo (sem cobrar em dobro o que foi orçado à mão)." },
        { id: "conc-ifc", rotulo: "IFC para\no cálculo", icone: "estrutura", grande: true, dica: "Exporta o IFC4 com os pilares, vigas e lajes pré-lançados como IfcColumn, IfcBeam e IfcSlab com a seção — para o programa de cálculo." },
        { id: "conc-criterios", rotulo: "Critérios do\npré-lançamento", icone: "regua", grande: true, dica: "Os números usados, com a fonte e o status: norma lida (edição), literatura ou regra do produto." }
      ]);
      reg["conc-prelancar"] = function () { return true; };
      reg["conc-pre-auto"] = function () { prelancar("auto"); return true; };
      reg["conc-pre-macica"] = function () { prelancar("macica"); return true; };
      reg["conc-pre-trelicada"] = function () { prelancar("trelicada"); return true; };
      reg["conc-pre-refazer"] = function () { prelancar("refazer"); return true; };
      reg["conc-auditar"] = function () { auditar(); return true; };
      reg["conc-quant"] = function () { quant(); return true; };
      reg["conc-ifc"] = function () { ifc(); return true; };
      reg["conc-criterios"] = function () { criterios(); return true; };
      return true;
    },
    prelancar: prelancar, auditar: auditar, quantitativo: quant, ifc: ifc, criterios: criterios, liberada: liberada
  };
  global.ConcUI = ConcUI;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
