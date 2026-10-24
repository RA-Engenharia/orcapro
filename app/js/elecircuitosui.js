/* =====================================================================
 * elecircuitosui.js — a TELA dos CIRCUITOS ELÉTRICOS (frente E2, 21/10/2026). Fiação fina: a conta está nos motores puros
 * (js/eletabelas.js, js/eletracado.js, js/elecircuitos.js, js/elecircauditor.js, js/elepranchas.js). Molde: js/eleautoui.js.
 *
 * Fita: Instalações › "Circuitos e quadro" (registrado pelo js/gestao.js, junto dos Pontos elétricos):
 *   ele-circ          Circuitos e quadro: divide os pontos, põe o quadro, traça os eletrodutos que faltam, dimensiona e grava o
 *                     projeto no quadro — UM lote (BIM.editarLote), um Ctrl+Z; rodar de novo sem mudança = nada
 *   ele-circ-auditar  o auditor (cada problema: o que é + Corrigir + Mostrar no 3D — js/problemacard.js)
 *   ele-circ-pranchas quadro de cargas + diagrama unifilar (PDF / DXF) e o memorial com as citações (HTML)
 *   ele-circ-criterios os critérios com o nível da fonte; os de critério RA são editáveis neste aparelho
 * TRAVA POR LICENÇA NA FUNÇÃO (como os Pontos elétricos): a disciplina elétrica trancada não roda nem pelo atalho nem pelo Corrigir.
 * NBR 5410:2004 lida numa cópia NÃO licenciada à RA, sem a Errata 1/2008: a tela diz isso em toda janela.
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  function f0(v) { var x = Number(v); return isFinite(x) ? String(Math.round(x)) : "—"; }
  function txt(v) { return v == null ? "" : String(v); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var CHAVE = "raerp:bim:eletrica-circuitos-criterios";

  function estado() { var B = global.BIM, E = global.BimEdit; if (!B || !B.editarOps || !E) return null; try { return E.aplicar(B.editarOps()); } catch (e) { return null; } }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }
  var TRANCADA = "Os circuitos elétricos fazem parte do OrçaPRO Modela Elétrica & Dados: a disciplina não está liberada nesta conta.";
  function liberada() { try { var D = global.BimDisciplinas; return !(D && typeof D.trancada === "function" && D.trancada("eletrica")); } catch (e) { return true; } }
  function trancou(titulo) { if (liberada()) return false; status(TRANCADA); janela(titulo, "<p>" + esc(TRANCADA) + "</p>"); return true; }
  function aplicar(lote) { var B = global.BIM; if (!liberada()) { status(TRANCADA); return false; } if (!B || !B.editarLote) { status("O editor 3D não está aberto."); return false; } return !!B.editarLote(lote); }
  function lerCriterios() { try { var t = global.localStorage && global.localStorage.getItem(CHAVE); return t ? JSON.parse(t) || {} : {}; } catch (e) { return {}; } }
  function gravarCriterios(o) { try { if (global.localStorage) global.localStorage.setItem(CHAVE, JSON.stringify(o || {})); } catch (e) {} }
  function janela(titulo, html) {
    if (typeof document === "undefined") return null;
    var velho = document.getElementById("elc-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = document.createElement("div"); ov.id = "elc-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" data-elc-caixa style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:1180px;width:100%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-elc-fechar class="btn sm">Fechar</button></div>' + html + "</div>";
    /* ESC FECHA (24/10/2026): a janela cobre a tela inteira (z-index 100000) e antes só fechava no clique — quem apertava Esc
       ficava com ela por cima da fita e o clique seguinte (ex.: Traçar automaticamente) caía no véu: "tela vazia" no
       e2e-bim-ferramentas, que fecha cada comando com Esc. O ouvinte sai junto com a janela. */
    function fechaElc() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener("keydown", aoEsc, true); }
    function aoEsc(e) { if (e && (e.key === "Escape" || e.keyCode === 27)) fechaElc(); }
    ov.addEventListener("click", function (e) { if (e.target === ov || (e.target && e.target.hasAttribute && e.target.hasAttribute("data-elc-fechar"))) fechaElc(); });
    document.addEventListener("keydown", aoEsc, true);
    document.body.appendChild(ov);
    return ov;
  }
  function lista(titulo, itens, cor) {
    itens = arr(itens); if (!itens.length) return "";
    return '<h4 style="margin:10px 0 4px' + (cor ? ";color:" + cor : "") + '">' + esc(titulo) + '</h4><ul style="margin:0 0 0 18px;padding:0">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }
  function avisoNorma() {
    var T = global.EleTabelas;
    return '<p data-elc-aviso-norma style="margin:0 0 8px;padding:6px 8px;border-radius:6px;background:rgba(30,90,122,.10);font-size:12px"><b>NBR 5410:2004</b> lida numa cópia <b>não licenciada</b> à RA, edição original <b>sem a Errata 1/2008</b> — só valores com o item. ' +
      esc(T ? T.NORMA.ressalva : "") + " Demanda e padrão de entrada: CEMIG ND-5.1 rev. MAR/2026. Limites por circuito e posição do quadro: critério RA.</p>";
  }
  /* a tabela do quadro de cargas (HTML) */
  function tabelaCargas(A) {
    var linhas = A.circuitos.map(function (c) {
      var d = c.dim, ruim = !d.ok || c.semRota.length;
      return "<tr" + (ruim ? ' style="color:#a00"' : "") + "><td>" + esc(c.id) + "</td><td>" + esc(c.nome) + "</td><td>" + c.tensao + " V " + esc(c.fases || "?") + "</td><td>" + f0(d.va) + "</td><td>" + f2(d.ib) + "</td><td>" + esc(d.metodo.ref) + " (" + esc(d.metodo.apl) + ")</td><td>" + d.nAgrup + " / " + f2(d.fa) + "</td><td>" +
        String(d.secao).replace(".", ",") + " + PE " + String(d.pe).replace(".", ",") + "</td><td>" + f2(d.izc) + "</td><td>" + d.In + " A " + c.polos + "P</td><td>" + esc(c.drId || "—") + "</td><td>" + f2(d.L) + (d.estimado ? " (est.)" : "") + "</td><td>" + f2(d.dv) + "</td><td>" + (ruim ? esc(d.motivos.concat(c.semRota.length ? ["falta eletroduto"] : []).join("; ")) : "atende") + "</td></tr>";
    }).join("");
    return '<table class="tbl" data-elc-cargas style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>Circ.</th><th>Descrição</th><th>Tensão</th><th>VA</th><th>IB (A)</th><th>Método</th><th>Agrup./FA</th><th>Seção (mm²)</th><th>Iz corr. (A)</th><th>Disjuntor</th><th>DR</th><th>L (m)</th><th>ΔV (%)</th><th>Situação</th></tr></thead><tbody>' + linhas + "</tbody></table>";
  }
  function resumoTexto(A) {
    var dm = A.demanda, en = dm.entrada;
    return "<p><b>Instalada</b> " + f2(dm.cargaInstalada_kW) + " kW · <b>demanda</b> " + f2(dm.demanda_kVA) + " kVA (ND-5.1 8.2.3) · <b>fornecimento</b> " + esc(dm.tipo ? "tipo " + dm.tipo : "não verificado") + (en ? " — faixa " + esc(en.faixa) + ", disjuntor " + en.disjuntor_A + " A, cobre " + en.condutor_mm2 + " mm²" : "") +
      " · <b>geral</b> " + (A.geral.In ? A.geral.In + " A " + A.geral.polos + "P" : "—") + " · <b>alimentador</b> " + (A.alimentador.secao ? String(A.alimentador.secao).replace(".", ",") + " mm² × " + f2(A.alimentador.comprimento) + " m" + (A.alimentador.provisorio ? " <b style=\"color:#a00\">(provisório)</b>" : "") : "—") +
      " · <b>DR</b> " + A.drs.length + " · <b>DPS</b> " + (A.dps.exigido ? A.dps.quantidade : 0) + " · <b>quadro</b> " + (A.quadroModelo ? A.quadroModelo.espacos + " espaços (" + A.modulos + " módulos)" : "—") + "</p>";
  }

  function lancar() {
    if (trancou("Circuitos e quadro")) return;
    var st = estado(), EC = global.EleCircuitos; if (!st || !EC) { status("O editor 3D não está aberto."); return; }
    var res = EC.lancar({ estado: st, avaliarFam: avaliar(), criterios: lerCriterios() });
    if (!res.ok) { janela("Circuitos e quadro", avisoNorma() + "<p>" + esc(res.motivo) + "</p>"); status(res.motivo); return res; }
    var aplicado = res.lote ? aplicar(res.lote) : false, z = res.resumo, A = res.analise;
    var html = avisoNorma() + "<p><b>" + z.circuitos + "</b> circuito(s): " + z.luz + " de iluminação, " + z.tug + " de tomadas, " + z.tue + " de uso específico · " + z.drs + " DR · " + z.eletrodutos + " eletroduto(s) novo(s) e " + z.caixasPassagem + " caixa(s) de passagem" + (z.quadroNovo ? " · quadro novo" : "") +
      (aplicado ? " — aplicado num lote (Ctrl+Z desfaz)." : (res.lote ? " — <b>não aplicado</b>." : ": nada a mudar (o projeto gravado já atende).")) + "</p>" + resumoTexto(A) + tabelaCargas(A) +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn primary sm" data-elc-pranchas>Pranchas (PDF)</button><button type="button" class="btn sm" data-elc-dxf>Pranchas (DXF)</button><button type="button" class="btn sm" data-elc-memorial>Memorial</button><button type="button" class="btn ghost sm" data-elc-auditar>Auditar circuitos</button></div>' +
      lista("Pendências", res.pendencias.map(function (p) { return p.texto; }), "#a00") + lista("Avisos", res.avisos);
    var ov = janela("Circuitos e quadro", html); ligarBotoes(ov);
    status("Circuitos: " + z.circuitos + " · DR " + z.drs + " · eletrodutos novos " + z.eletrodutos + (res.pendencias.length ? " · " + res.pendencias.length + " pendência(s)" : "") + ".");
    return res;
  }
  function ligarBotoes(ov) {
    if (!ov) return;
    ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-elc-pranchas")) pranchas("pdf");
      else if (t.hasAttribute("data-elc-dxf")) pranchas("dxf");
      else if (t.hasAttribute("data-elc-memorial")) memorial();
      else if (t.hasAttribute("data-elc-auditar")) auditar();
    });
  }
  function auditar() {
    if (trancou("Auditar circuitos")) return;
    var st = estado(), AU = global.EleCircAuditor, PC = global.ProblemaCard; if (!st || !AU) { status("O editor 3D não está aberto."); return; }
    var res = AU.auditar({ estado: st, avaliarFam: avaliar(), criterios: lerCriterios() }), probs = res.problemas;
    var erros = probs.filter(function (p) { return p.gravidade === "erro"; }), avs = probs.filter(function (p) { return p.gravidade !== "erro"; });
    function bloco(L, tit, grav) {
      if (!L.length) return "";
      var o = { acoes: function (s) { return s && arr(s.ops).length ? (s.texto || true) : false; }, titulo: tit, gravidade: grav, prefixoIndice: grav === "aviso" ? "a" : "e" };
      o.depois = function (p) { return '<p style="font-size:11px;margin:2px 0 0">' + esc(p.nivel) + " · " + esc(p.nivelRotulo) + "</p>"; };
      return PC ? PC.lista(L, o) : lista(tit, L.map(function (p) { return p.titulo; }));
    }
    var html = avisoNorma() + (res.analise && res.analise.ok ? resumoTexto(res.analise) : "") + (probs.length ? "" : "<p><b>Nenhum problema</b> nos circuitos, no quadro e nos eletrodutos.</p>") + bloco(erros, "Erros (" + erros.length + ")", "erro") + bloco(avs, "Avisos (" + avs.length + ")", "aviso");
    var ov = janela("Auditar circuitos", html);
    if (ov && PC) PC.ligar(ov, {
      corrigir: function (solId, k) {
        var L = String(k).charAt(0) === "a" ? avs : erros, p = L[+String(k).slice(1)], s = p && arr(p.solucoes).filter(function (x) { return x.id === solId; })[0];
        if (!s || !arr(s.ops).length) return;
        if (aplicar({ op: "lote", id: "elc-corr-" + Date.now().toString(36), origem: "eletrica-circuitos-auditor", pedido: "Corrigir: " + s.texto, ops: s.ops })) { status("Corrigido: " + s.texto + " (Ctrl+Z desfaz)."); auditar(); }
      },
      mostrar: function (ids) { PC.mostrarNo3D(ids); }
    });
    status("Auditar circuitos: " + erros.length + " erro(s), " + avs.length + " aviso(s).");
    return res;
  }
  function ctxCarimbo() {
    var em = {}, ob = {}, logo = null, G = global.Gestao;
    try { if (global.Empresa && global.Empresa.dados) em = global.Empresa.dados() || {}; if (global.Empresa && global.Empresa.logo) logo = global.Empresa.logo(); } catch (e1) {}
    try { if (G && G._bimSel && global.Store && global.Auth) ob = global.Store.obter(global.Auth.empresaId(), "obras", G._bimSel) || {}; } catch (e2) {}
    return { empresa: em.nome ? em : "", responsavel: txt(em.responsavel), registro: txt(em.crea), tituloProfissional: txt(em.titulo), obra: txt(ob.nome), proprietario: txt(ob.clienteNome), contratante: txt(ob.clienteNome), local: txt(ob.local || ob.endereco), logo: logo };
  }
  function baixar(nome, dados, mime) {
    var d = typeof document !== "undefined" ? document : null; if (!d || typeof Blob === "undefined") return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = d.createElement("a"); a.href = u; a.download = nome; d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
  }
  function analiseAtual() { var st = estado(), EC = global.EleCircuitos; if (!st || !EC) return null; return EC.analisar({ estado: st, avaliarFam: avaliar(), criterios: lerCriterios() }); }
  function pranchas(formato) {
    if (trancou("Pranchas elétricas")) return;
    var A = analiseAtual(), P = global.ElePranchas; if (!A || !P) { status("O editor 3D não está aberto."); return; }
    if (!A.ok) { status(A.motivo); return; }
    if (!A.projetoGravado) { status("Rode \"Circuitos e quadro\" antes das pranchas (o projeto fica gravado no quadro)."); return; }
    var c = ctxCarimbo(), r = P.gerar(A, c); if (!r.ok) { status(r.avisos.join(" ")); return r; }
    var dados = P.exportar(r, formato === "dxf" ? "dxf" : "pdf"), nome = "ELE " + (c.obra || "projeto") + (formato === "dxf" ? ".dxf" : ".pdf");
    var ok = dados && baixar(nome, dados, formato === "dxf" ? "application/dxf" : "application/pdf");
    status(ok ? "Pranchas elétricas: " + r.folhas.length + " folha(s) — " + nome + (r.avisos.length ? " · " + r.avisos.length + " aviso(s)" : "") : "Não consegui gerar o arquivo das pranchas.");
    return r;
  }
  function memorial() {
    if (trancou("Memorial elétrico")) return;
    var A = analiseAtual(), P = global.ElePranchas; if (!A || !P || !A.ok) { status(A && A.motivo ? A.motivo : "O editor 3D não está aberto."); return; }
    var c = ctxCarimbo(), m = P.memorial(A, c);
    var ok = baixar("Memorial elétrico " + (c.obra || "projeto") + ".html", m.html, "text/html");
    status(ok ? "Memorial elétrico gerado (" + m.secoes.length + " seções, com as citações e a ressalva da norma)." : "Não consegui gerar o memorial.");
    return m;
  }
  function criteriosTela() {
    var EC = global.EleCircuitos, R = global.EleRegras; if (!EC) return;
    var C = EC.criterios(lerCriterios());
    var linhas = Object.keys(C).map(function (k) {
      var c = C[k], ed = c.nivel === "C" || c.nivel === "X";
      return "<tr><td>" + esc(c.nivel) + "</td><td>" + esc(c.rotulo) + '</td><td>' + (ed ? '<input data-elc-crit="' + esc(k) + '" type="number" step="0.01" value="' + (Math.round(c.valor * 10000) / 10000) + '" style="width:80px">' : esc(String(c.valor).replace(".", ","))) + '</td><td style="font-size:12px">' + esc(c.fonte) + "</td></tr>";
    }).join("");
    var ov = janela("Critérios dos circuitos", avisoNorma() + (R ? '<p style="font-size:12px">' + ["N", "A", "C", "X"].map(function (k) { return "<b>" + k + "</b> " + esc(R.NIVEIS[k]); }).join(" · ") + "</p>" : "") +
      '<table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th></th><th>Critério</th><th>Valor</th><th>Fonte</th></tr></thead><tbody>' + linhas + "</tbody></table>" +
      '<div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn primary sm" data-elc-salvar>Salvar</button><button type="button" class="btn ghost sm" data-elc-padrao>Voltar ao padrão</button></div>');
    if (!ov) return;
    ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-elc-salvar")) { var o = {}; arr(ov.querySelectorAll("[data-elc-crit]")).forEach(function (i) { var v = parseFloat(String(i.value).replace(",", ".")); if (isFinite(v)) o[i.getAttribute("data-elc-crit")] = v; }); gravarCriterios(o); status("Critérios dos circuitos gravados neste aparelho."); criteriosTela(); }
      if (t.hasAttribute("data-elc-padrao")) { gravarCriterios({}); status("Critérios dos circuitos: padrão."); criteriosTela(); }
    });
  }

  var EleCircuitosUI = {
    registrar: function (reg) {
      var R = global.BimRibbon;
      if (!R || !reg || !global.EleCircuitos) return false;
      R.acrescentar("instalacoes", "Instalações", "Circuitos e quadro", [
        { id: "ele-circ", rotulo: "Circuitos\ne quadro", icone: "mais", grande: true, dica: "Divide os pontos em circuitos (luz separada de tomada, cozinha/serviço só delas, aparelho acima de 10 A sozinho), põe o quadro, traça os eletrodutos que faltam pelo teto e pela parede, dimensiona cabo, disjuntor, DR e DPS (NBR 5410:2004, cópia não licenciada) e grava o projeto no quadro. Um Ctrl+Z desfaz; rodar de novo não duplica." },
        { id: "ele-circ-auditar", rotulo: "Auditar\ncircuitos", icone: "calculadora", grande: true, dica: "Confere o projeto gravado: circuito sobrecarregado, queda de tensão, falta de DR ou DPS, seção abaixo da mínima, eletroduto lotado, luz e tomada juntas — cada item com Corrigir e Mostrar no 3D." },
        { id: "ele-circ-pranchas", rotulo: "Pranchas\nelétricas", icone: "mais", grande: true, tipo: "menu", dica: "Quadro de cargas e diagrama unifilar no carimbo RA, e o memorial com as citações.",
          itens: [{ id: "ele-circ-pdf", rotulo: "Pranchas (PDF)", icone: "mais" }, { id: "ele-circ-dxf", rotulo: "Pranchas (DXF)", icone: "mais" }, { id: "ele-circ-memorial", rotulo: "Memorial (HTML)", icone: "mais" }] },
        { id: "ele-circ-criterios", rotulo: "Critérios dos\ncircuitos", icone: "regua", grande: true, dica: "Os números usados, com o nível da fonte; os de critério RA (limites por circuito, comprimento do alimentador, posição do quadro) editáveis neste aparelho." }
      ]);
      reg["ele-circ"] = function () { lancar(); return true; };
      reg["ele-circ-auditar"] = function () { auditar(); return true; };
      reg["ele-circ-pranchas"] = function () { return true; };
      reg["ele-circ-pdf"] = function () { pranchas("pdf"); return true; };
      reg["ele-circ-dxf"] = function () { pranchas("dxf"); return true; };
      reg["ele-circ-memorial"] = function () { memorial(); return true; };
      reg["ele-circ-criterios"] = function () { criteriosTela(); return true; };
      return true;
    },
    lancar: lancar, auditar: auditar, pranchas: pranchas, memorial: memorial, criterios: criteriosTela, liberada: liberada
  };
  global.EleCircuitosUI = EleCircuitosUI;
  if (typeof module !== "undefined" && module.exports) module.exports = EleCircuitosUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
