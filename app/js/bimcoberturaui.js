/* =====================================================================
 * bimcoberturaui.js — a TELA da cobertura completa (frente "cob"): os comandos
 * da fita (Arquitetura › "Cobertura completa" e "Forro completo") e o desenho
 * 3D da platibanda, rufos, calha embutida, condutores e sanca. Fiação fina: a
 * conta está nos motores puros (js/bimtelhado.js, js/bimcobertura.js,
 * js/bimtelhadoestrut.js, js/bimforrodrywall.js).
 *
 * Só com a prévia `?previa=modelador` (como o telhado, que também é dela):
 * sem ela `registrar` sai na hora. Chamado pelo js/bimp3ui.js (registrar e
 * desenhar). Todo comando aplica UM lote (BIM.editarLote): um Ctrl+Z desfaz.
 * Os comandos agem em TODOS os telhados/forros do modelo (o caso comum é um só).
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function virg(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function TM() { return global.BimTelhado || null; }
  function BC() { return global.BimCobertura || null; }
  function ES() { return global.BimTelhadoEstrut || null; }
  function FD() { return global.BimForroDrywall || null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* o estado de agora (replay das ops do editor) */
  function estado() {
    var B = global.BIM, E = global.BimEdit;
    if (!B || !B.editarOps || !E) return null;
    try { return E.aplicar(B.editarOps()); } catch (e) { return null; }
  }
  function aplicar(lote) {
    var B = global.BIM;
    if (!B || !B.editarLote) { status("O editor 3D não está aberto."); return false; }
    return !!B.editarLote(lote);
  }

  /* ----------------------------------------------------------- janela de resultado */
  function janela(titulo, html) {
    if (typeof document === "undefined") return null;
    var velho = document.getElementById("cob-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = document.createElement("div"); ov.id = "cob-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:920px;width:100%;max-height:86vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-cob-fechar class="btn sm">Fechar</button></div>' + html + '</div>';
    ov.addEventListener("click", function (e) { if (e.target === ov || (e.target && e.target.hasAttribute && e.target.hasAttribute("data-cob-fechar"))) { if (ov.parentNode) ov.parentNode.removeChild(ov); } });
    document.body.appendChild(ov);
    return ov;
  }
  function lista(titulo, itens) {
    itens = arr(itens); if (!itens.length) return "";
    return '<h4 style="margin:10px 0 4px">' + esc(titulo) + '</h4><ul style="margin:0 0 0 18px;padding:0">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }

  /* ----------------------------------------------------------- comandos */
  function paraCadaTelhado(fn) {
    var st = estado(), ts = arr(st && st.telhados).filter(function (t) { return t && t.ok; });
    if (!ts.length) { status("Lance um telhado (Arquitetura › Telhado) antes."); return; }
    ts.forEach(function (t) { fn(t, st); });
  }
  function estrutura(material) {
    paraCadaTelhado(function (t, st) {
      var E = ES(); if (!E) { status("O motor da estrutura do telhado não carregou."); return; }
      var res = E.gerar(st, t.id, material ? { material: material } : {});
      if (!res.ok) { janela("Estrutura do telhado " + t.id, '<p>' + esc(res.motivo) + "</p>"); status(res.motivo); return; }
      if (!aplicar(res.lote)) { status("Não consegui aplicar a estrutura."); return; }
      var r = res.resumo, tx = res.material === "aco" ? virg(r.kgTotal, 0) + " kg de aço" : virg(r.m3Total, 3) + " m³ de madeira";
      status("Estrutura do telhado " + t.id + " (" + (res.material === "aco" ? "metálica" : "de madeira") + "): " + r.n + " peças, " + tx + " — PRÉ-DIMENSIONADO, confirmar no cálculo.");
      janela("Estrutura do telhado " + t.id + " — " + (res.material === "aco" ? "metálica" : "de madeira"),
        '<p><b>' + r.n + '</b> peças (terças ' + r.terca.n + ', vigas principais ' + r.viga.n + ', ' + (res.material === "aco" ? "pilares " : "pontaletes ") + r.pilar.n + '); ' + tx + '. <b>Pré-dimensionado — confirmar no cálculo.</b></p>' +
        lista("Premissas", res.premissas) + lista("Avisos", res.avisos) +
        lista("Apoios das vigas", arr(res.apoios).map(function (a) { return a.viga + " (" + a.fim + "): " + a.tipo + (a.obs ? " — " + a.obs : ""); })));
    });
  }
  function verificar() {
    paraCadaTelhado(function (t, st) {
      var E = ES(); if (!E) return;
      var v = E.verificarAco(st, t.id, {});
      if (!v.ok) { janela("Cálculo da estrutura de aço — telhado " + t.id, "<p>" + esc(v.motivo || "o cálculo não fechou") + "</p>" + lista("Avisos", v.avisos)); status("Cálculo da estrutura: " + (v.motivo || "não fechou")); return; }
      var r = v.resultado || {}, apr = r.aprovado === true ? "APROVADA" : "NÃO aprovada";
      janela("Cálculo da estrutura de aço — telhado " + t.id,
        "<p>O módulo Metálica calculou a estrutura desenhada (NBR 8800 / NBR 14762): <b>" + apr + "</b>" + (r.pesoTotal != null ? ", peso " + virg(r.pesoTotal, 0) + " kg" : "") + ".</p>" +
        lista("O que o cálculo NÃO verificou", arr(r.naoAbrangidos).map(function (x) { return x && (x.tema ? x.tema + ": " + (x.motivo || "") : x); })) + lista("Avisos do cálculo", arr(r.avisos).slice(0, 12)) + lista("Avisos", v.avisos));
      status("Cálculo da estrutura de aço do telhado " + t.id + ": " + apr + ".");
    });
  }
  function trocarTipo(tipoId) {
    var st = estado(), ts = arr(st && st.telhados);
    if (!ts.length) { try { if (global.BimP3UI) global.BimP3UI.mudar("telhado", "b2f:te:tipoId", tipoId, null); } catch (e) {} status("Próximos telhados nascem com o tipo escolhido."); return; }
    var T = TM(), ops = ts.map(function (t) { return T.opTrocarTipo(st, t.id, tipoId); }).filter(Boolean);
    if (ops.length && aplicar({ op: "lote", id: "tt-" + tipoId, origem: "tipo-telha", ops: ops })) status("Tipo de telha trocado: " + T.tipo(tipoId).rotulo + ".");
  }
  function platibanda() {
    paraCadaTelhado(function (t, st) {
      var C = BC(), ja = arr(st.platibandas).filter(function (p) { return String(p.telhado) === String(t.id); })[0];
      if (ja) { aplicar({ op: "lote", id: "pl-x-" + t.id, origem: "platibanda", ops: [{ op: "apagar", id: ja.id }] }); status("Platibanda removida."); return; }
      var d = { telhado: t.id }, b = C.baseSugerida(st, t.id); if (b != null) d.base = b;
      var op = C.opPlatibanda("plat-" + t.id, d); if (!op) { status("Platibanda inválida."); return; }
      if (aplicar({ op: "lote", id: "pl-" + t.id, origem: "platibanda", ops: [op] })) status("Platibanda com rufo de capa e contra-rufo no telhado " + t.id + ". Clique de novo para tirar.");
    });
  }
  function calha() {
    paraCadaTelhado(function (t, st) {
      var C = BC(), ja = arr(st.calhasEmbutidas).filter(function (c) { return String(c.telhado) === String(t.id); })[0];
      if (ja) { var ap = [{ op: "apagar", id: ja.id }]; arr(st.condutores).forEach(function (c) { if (String(c.calha) === String(ja.id)) ap.push({ op: "apagar", id: c.id }); }); aplicar({ op: "lote", id: "cal-x-" + t.id, origem: "calha", ops: ap }); status("Calha embutida removida."); return; }
      var origs = arr(t.arestasCalc).filter(function (e) { return e.define; }).map(function (e) { return e.orig; });
      if (!origs.length) { status("O telhado não tem aresta com beiral (todas são oitão)."); return; }
      var op = C.opCalha("cal-" + t.id, { telhado: t.id, arestas: origs }); if (!op) { status("Calha inválida."); return; }
      var E = global.BimEdit, st2 = E.aplicar(global.BIM.editarOps().concat([op])), cds = C.opsCondutores(st2, {});
      if (aplicar({ op: "lote", id: "cal-" + t.id, origem: "calha", ops: [op].concat(cds) })) status("Calha embutida (" + virg(0.30) + " × " + virg(0.12) + " m) e " + cds.length + " descida(s) no telhado " + t.id + ". Confira a seção em \"Calha pela NBR 10844\".");
    });
  }
  function calhaCalculo() {
    var st = estado(), C = BC();
    if (!st || !C || !C.listarCalhas(st).length) { status("Lance uma calha (embutida ou de beiral) antes."); return; }
    var ov = janela("Calha pela NBR 10844", '<p>A seção sai do cálculo pluvial do módulo Hidrossanitário (<code>js/hidap.js</code>). A <b>intensidade</b> é da Tabela 5 da norma pela cidade; cidade fora da tabela fica PENDENTE (nada é adotado calado) — ou informe a intensidade <b>com a fonte</b>.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin:8px 0">' +
      '<label>Cidade (como na Tabela 5)<input id="cob-cid" class="inp" placeholder="ex.: Barbacena/MG" style="width:100%"></label>' +
      '<label>Intensidade informada (mm/h)<input id="cob-int" class="inp" style="width:100%"></label>' +
      '<label>Fonte da intensidade<input id="cob-fon" class="inp" placeholder="IDF, posto, estudo…" style="width:100%"></label></div>' +
      '<button type="button" class="btn" id="cob-calc">Calcular</button><div id="cob-res" style="margin-top:10px"></div>');
    if (!ov) return;
    ov.querySelector("#cob-calc").addEventListener("click", function () {
      var cfg = {}, cid = ov.querySelector("#cob-cid").value.trim(), it = parseFloat(String(ov.querySelector("#cob-int").value).replace(",", ".")), fo = ov.querySelector("#cob-fon").value.trim();
      if (cid) cfg.cidade = cid; if (isFinite(it)) { cfg.intensidade_mm_h = it; cfg.fonteIntensidade = fo; }
      var r = C.dimensionarCalhas(estado(), cfg), out = ov.querySelector("#cob-res");
      if (!r.ok) { out.innerHTML = "<p>" + esc(r.motivo) + "</p>"; return; }
      var linhas = arr(r.calhas).map(function (c) { return "<tr><td>" + esc(c.id) + "</td><td>" + (c.vazao_l_min == null ? "—" : virg(c.vazao_l_min, 1)) + "</td><td>" + (c.vazaoProjeto_l_min == null ? "—" : virg(c.vazaoProjeto_l_min, 1)) + "</td><td>" + (c.capacidade_l_min == null ? "—" : virg(c.capacidade_l_min, 1)) + "</td><td>" + esc(c.status) + "</td></tr>"; }).join("");
      out.innerHTML = "<p><b>Situação: " + esc(r.status) + "</b>" + (r.intensidade && r.intensidade.valor_mm_h != null ? " — intensidade " + virg(r.intensidade.valor_mm_h, 0) + " mm/h" : " — intensidade PENDENTE") + "</p>" +
        '<table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Calha</th><th align="left">Q (L/min)</th><th align="left">Q de projeto</th><th align="left">Capacidade</th><th align="left">Situação</th></tr></thead><tbody>' + linhas + "</tbody></table>" +
        lista("Pendências", arr(r.pendencias).map(function (p) { return p.motivo || p.chave; })) + lista("Premissas", r.premissas);
    });
  }
  /* T2 (20/10/2026): rufos, calhas e descidas pela NBR 10844 com a cidade do ENDEREÇO DA OBRA — um lote só (ids fixos tel-calha-/tel-rufo-:
     rodar de novo refaz no lugar). Cidade fora da Tabela 5: o motor adota o MAIOR valor da tabela e avisa. */
  function obraECliente() {
    var o = null, c = null;
    try {
      var G = global.Gestao, S = global.Store, A = global.Auth;
      if (G && G._bimSel && S && A) { o = S.obter(A.empresaId(), "obras", G._bimSel) || null; if (o && o.clienteId) c = S.obter(A.empresaId(), "clientes", o.clienteId) || null; }
    } catch (e) { /* sem obra aberta */ }
    return { obra: o, cliente: c };
  }
  function pluvial() {
    var st = estado(), C = BC();
    if (!st || !C || !C.gerarPluvial) { status("O motor da cobertura não carregou."); return; }
    if (!arr(st.telhados).some(function (t) { return t && t.ok; })) { status("Lance um telhado (Arquitetura › Telhado) antes."); return; }
    var oc = obraECliente(), cid = C.cidadeDaObra(oc.obra, oc.cliente), temCalha = C.listarCalhas(st).length > 0;
    var ov = janela("Rufos, calhas e descidas — NBR 10844", '<p>Gera o <b>rufo e o contrarrufo</b> onde o telhado encosta em parede mais alta que a telha, a <b>calha</b> (embutida existente e, se marcar, a de beiral) e as <b>descidas</b>, dimensionadas pela NBR 10844: área de contribuição com a inclinação e o beiral, intensidade pela cidade da obra (Tabela 5), seção por Manning e condutor pela tabela. Rodar de novo refaz no lugar (um Ctrl+Z desfaz); descida lançada à mão fica onde está e entra na conta.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:8px 0">' +
      '<label>Cidade da obra' + (cid.origem ? ' <span style="opacity:.7">(lida de: ' + esc(cid.origem) + ')</span>' : ' <span style="opacity:.7">(a obra não tem endereço)</span>') + '<input id="cob-pl-cid" class="inp" style="width:100%" value="' + esc(cid.cidade || "") + '" placeholder="ex.: Belo Horizonte/MG"></label>' +
      '<label>Chapa do rufo<select id="cob-pl-mat" class="inp" style="width:100%"><option value="galv24">Aço galvanizado nº 24</option><option value="galv26">Aço galvanizado nº 26</option><option value="aluminio">Alumínio</option></select></label>' +
      '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cob-pl-beiral"' + (temCalha ? "" : " checked") + '> Calha de beiral nas arestas sem calha</label>' +
      '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cob-pl-hidro" checked> Descidas no sistema pluvial do hidro</label></div>' +
      '<button type="button" class="btn" id="cob-pl-gerar">Gerar</button><div id="cob-pl-res" style="margin-top:10px"></div>');
    if (!ov) return;
    ov.querySelector("#cob-pl-gerar").addEventListener("click", function () {
      var B = global.BIM, out = ov.querySelector("#cob-pl-res");
      var cfg = { obra: oc.obra, cliente: oc.cliente, material: ov.querySelector("#cob-pl-mat").value, calhaBeiral: !!ov.querySelector("#cob-pl-beiral").checked, ligarHidro: !!ov.querySelector("#cob-pl-hidro").checked };
      var cv = ov.querySelector("#cob-pl-cid").value.trim(); if (cv) cfg.cidade = cv;
      var r; try { r = C.gerarPluvial(B && B.editarOps ? B.editarOps() : [], cfg); } catch (e) { r = { ok: false, motivo: "O cálculo falhou: " + e.message }; }
      if (!r.ok) { out.innerHTML = "<p><b>" + esc(r.motivo) + "</b></p>" + lista("Avisos", r.avisos); status(r.motivo); return; }
      if (!aplicar(r.lote)) { out.innerHTML = "<p>Não consegui aplicar o lote no modelo.</p>"; return; }
      var nd = 0; r.calhas.forEach(function (c) { nd += c.descidas.length; });
      out.innerHTML = '<p><b>' + r.calhas.length + ' calha(s), ' + nd + ' descida(s)' + (r.rufos.length ? ", rufo/contrarrufo em " + r.rufos.reduce(function (s, x) { return s + x.encontros.length; }, 0) + " encontro(s)" : "") + '.</b> ' + esc(r.intensidade.texto) + '.</p>' +
        lista("Avisos", r.avisos) + '<h4 style="margin:10px 0 4px">Memorial (a conta e a fonte)</h4><div style="white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;background:var(--surface-2,#f4f4f2);padding:8px;border-radius:6px">' + esc(r.memorial.join("\n")) + "</div>" +
        lista("Premissas", r.premissas) + lista("Pendências", arr(r.pendencias).map(function (p) { return p.motivo || p.chave; }));
      status("Cobertura pela NBR 10844: " + r.calhas.length + " calha(s), " + nd + " descida(s)" + (r.avisos.length ? " — ver avisos" : "") + ".");
    });
  }
  function sanca() {
    var st = estado(), fs = arr(st && st.forros).filter(function (f) { return f && f.ok; }), F = FD();
    if (!fs.length) { status("Lance um forro antes (Arquitetura › Forro)."); return; }
    var ops = [];
    fs.forEach(function (f) {
      var ja = arr(st.sancas).filter(function (s) { return String(s.forro) === String(f.id); })[0];
      ops.push(ja ? { op: "apagar", id: ja.id } : F.opSanca("san-" + f.id, { forro: f.id }));
    });
    ops = ops.filter(Boolean);
    if (ops.length && aplicar({ op: "lote", id: "san-" + Date.now(), origem: "sanca", ops: ops })) status("Sanca com luz indireta alternada (recuo " + virg(F.PADRAO.recuo) + " m, profundidade " + virg(F.PADRAO.profundidade) + " m — parâmetros adotados).");
  }
  function porForro(fn, rotulo) {
    var st = estado(), fs = arr(st && st.forros).filter(function (f) { return f && f.ok; });
    if (!fs.length) { status("Lance um forro antes (Arquitetura › Forro)."); return; }
    fs.forEach(function (f) { fn(f, st); });
    void rotulo;
  }
  function estruturaForro() {
    porForro(function (f, st) {
      var F = FD(), res = F.opsEstruturaForro(st, f.id, {});
      if (!res.ok) { status(res.motivo); return; }
      if (aplicar(res.lote)) {
        status("Estrutura de madeira do forro " + f.id + ": " + res.pecas.length + " peças (espaçamento " + virg(res.resumo.espacamento) + " m ADOTADO — não verificado no manual do fabricante).");
        janela("Estrutura de madeira do forro " + f.id, "<p><b>" + res.pecas.length + "</b> peças: " + res.resumo.sarrafos + " sarrafos, " + res.resumo.barrotes + " barrotes, " + res.resumo.faixa + " da faixa da sanca.</p>" + lista("Premissas", res.premissas) + lista("Avisos", res.avisos));
      }
    });
  }
  function luminarias() {
    porForro(function (f, st) {
      var res = FD().opsLuminarias(st, f.id, {});
      if (!res.ok) { status(res.motivo); return; }
      if (aplicar(res.lote)) status(res.n + " luminária(s) embutida(s) no forro " + f.id + " (grade de " + virg(FD().PADRAO.espLuminarias) + " m, adotada).");
    });
  }
  function quantitativo() {
    var st = estado(), C = BC(); if (!st || !C) return;
    var q = C.quantitativo(st, {});
    if (!q.itens.length) { status("Nada de cobertura ou forro no modelo ainda."); return; }
    var linhas = q.itens.map(function (i) {
      return "<tr><td>" + esc(i.grupo) + "</td><td>" + esc(i.item) + "</td><td>" + esc(i.un) + "</td><td align=\"right\">" + virg(i.qtd, 2) + "</td><td>" + (i.sinapi ? esc(i.sinapi.codigo) + (i.sinapi.aproximado ? " (aprox.)" : "") : "<i>orçar à parte</i>") + "</td><td>" + (i.somar === false ? "<i>conferência, não somar</i> — " : "") + esc(i.obs || "") + "</td></tr>";
    }).join("");
    janela("Quantitativo da cobertura e do forro", '<p>' + q.comCodigo + ' item(ns) com composição SINAPI (' + esc(q.base) + '); ' + q.aParte + ' a orçar à parte. Código só quando existe na base do sistema.</p>' +
      '<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr><th align="left">Grupo</th><th align="left">Item</th><th align="left">Un</th><th align="right">Qtd</th><th align="left">SINAPI</th><th align="left">Observação</th></tr></thead><tbody>' + linhas + "</tbody></table>" + lista("Avisos", q.avisos));
  }

  var BimCoberturaUI = {
    ativo: previa,
    janela: janela, estado: estado,
    acoes: { estrutura: estrutura, verificar: verificar, trocarTipo: trocarTipo, platibanda: platibanda, calha: calha, calhaCalculo: calhaCalculo, pluvial: pluvial, sanca: sanca, estruturaForro: estruturaForro, luminarias: luminarias, quantitativo: quantitativo },

    /* a fita: dois painéis na aba Arquitetura. Sem duplicar comando: cada id é novo (cob-*) e os tipos de telha são os do catálogo */
    registrar: function (reg, arqui, opts) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa();
      var R = global.BimRibbon, T = TM();
      if (!pv || !R || !T || !BC() || !reg) return false;
      var tipos = T.TIPOS.map(function (x) { return { id: "cob-tt-" + x.id, rotulo: x.rotulo, icone: "telhado" }; });
      R.acrescentar("arquitetura", "Arquitetura", "Cobertura completa", [
        { id: "cob-estrutura", rotulo: "Estrutura do\ntelhado", icone: "estrutura", grande: true, tipo: "menu",
          dica: "Gera (ou refaz) a estrutura do telhado pelo vão máximo da telha: terças, vigas principais e apoios nas paredes. Metálica (Ue + W) ou de madeira (seções do catálogo). PRÉ-DIMENSIONADO — confirmar no cálculo.",
          itens: [{ id: "cob-estr-auto", rotulo: "Pelo tipo da telha (sanduíche = aço, fibrocimento = madeira)", icone: "estrutura" }, { id: "cob-estr-aco", rotulo: "Metálica (terça Ue, viga W)", icone: "estrutura" },
                  { id: "cob-estr-madeira", rotulo: "De madeira (terça, viga, pontalete)", icone: "estrutura" }, { id: "cob-estr-verificar", rotulo: "Verificar no cálculo da estrutura de aço", icone: "calculadora" }] },
        { id: "cob-telha", rotulo: "Tipo de\ntelha", icone: "telhado", grande: true, tipo: "menu", dica: "Troca o tipo de telha do telhado (sanduíche trapezoidal EPS/PIR com face inferior efeito madeira, fibrocimento 6 mm…). Os dados de catálogo trazem a fonte.", itens: tipos },
        { id: "cob-platibanda", rotulo: "Platibanda\ne rufos", icone: "parede", grande: true, dica: "Platibanda em volta do telhado com rufo de capa no topo e contra-rufo no encontro com a telha. Clique de novo para tirar." },
        { id: "cob-calha", rotulo: "Calha embutida\ne descidas", icone: "regua", grande: true, dica: "Calha embutida atrás da platibanda (na aresta do beiral) e uma descida por calha. Clique de novo para tirar." },
        { id: "cob-calha-calc", rotulo: "Calha pela\nNBR 10844", icone: "calculadora", grande: true, dica: "Vazão e capacidade da calha pela NBR 10844 (cálculo pluvial do módulo Hidrossanitário). Cidade fora da Tabela 5 fica pendente." },
        { id: "cob-pluvial", rotulo: "Rufos, calhas\ne descidas", icone: "regua", grande: true, dica: "Gera e dimensiona pela NBR 10844: rufo e contrarrufo onde o telhado encosta em parede mais alta, calha (embutida e de beiral), descidas e condutores pela cidade do endereço da obra. Rodar de novo refaz no lugar." }
      ]);
      R.acrescentar("arquitetura", "Arquitetura", "Forro completo", [
        { id: "cob-sanca", rotulo: "Sanca com\nluz indireta", icone: "camadas", grande: true, dica: "Rebaixo perimetral no forro (recuo e profundidade configuráveis) com fita de LED escondida. Clique de novo para tirar." },
        { id: "cob-forro-estrutura", rotulo: "Estrutura\ndo forro", icone: "estrutura", grande: true, dica: "Sarrafos e barrotes de madeira do forro de drywall. O espaçamento é ADOTADO: confira o manual do fabricante da chapa." },
        { id: "cob-luminarias", rotulo: "Luminárias\nembutidas", icone: "mais", grande: true, dica: "Grade de spots embutidos no forro (família ra-luminaria)." },
        { id: "cob-quant", rotulo: "Quantitativo da\ncobertura", icone: "calculadora", grande: true, dica: "Telha, estrutura, platibanda, rufos, calha, descidas, forro, sanca e luminárias — com SINAPI só onde existe na base." }
      ]);
      reg["cob-estrutura"] = function () { return true; };
      reg["cob-estr-auto"] = function () { estrutura(null); return true; };
      reg["cob-estr-aco"] = function () { estrutura("aco"); return true; };
      reg["cob-estr-madeira"] = function () { estrutura("madeira"); return true; };
      reg["cob-estr-verificar"] = function () { verificar(); return true; };
      T.TIPOS.forEach(function (x) { reg["cob-tt-" + x.id] = function () { trocarTipo(x.id); return true; }; });
      reg["cob-telha"] = function () { return true; };
      reg["cob-platibanda"] = function () { platibanda(); return true; };
      reg["cob-calha"] = function () { calha(); return true; };
      reg["cob-calha-calc"] = function () { calhaCalculo(); return true; };
      reg["cob-pluvial"] = function () { pluvial(); return true; };
      reg["cob-sanca"] = function () { sanca(); return true; };
      reg["cob-forro-estrutura"] = function () { estruturaForro(); return true; };
      reg["cob-luminarias"] = function () { luminarias(); return true; };
      reg["cob-quant"] = function () { quantitativo(); return true; };
      return true;
    },

    /* ------------------------------------------------------- desenho 3D */
    _mat: {},
    _m: function (THREE, k) {
      var M = this._mat; if (M[k]) return M[k];
      var cfg = { reboco: { c: 0xe4e0d8, m: 0.02, r: 0.9 }, capa: { c: 0x9aa5ad, m: 0.55, r: 0.45 }, calha: { c: 0xa9b3ba, m: 0.5, r: 0.5 }, pvc: { c: 0xeceae4, m: 0.0, r: 0.6 },
                  forro: { c: 0xf1eee6, m: 0, r: 0.95 }, led: { c: 0xfff1c9, m: 0, r: 0.4, e: 0xffe3a0 } }[k] || { c: 0xcccccc, m: 0, r: 0.8 };
      var o = { color: cfg.c, metalness: cfg.m, roughness: cfg.r, side: THREE.DoubleSide };
      if (cfg.e) { o.emissive = new THREE.Color(cfg.e); o.emissiveIntensity = 1.2; }
      M[k] = new THREE.MeshStandardMaterial(o);
      return M[k];
    },
    desenhar: function (THREE, st, mo, addMesh, P3, reg) {
      var self = this, V = function (a) { return new THREE.Vector2(a[0], a[1]); };
      function ccw(Q) { return THREE.ShapeUtils.area(Q.map(V)) < 0 ? Q.slice().reverse() : Q; }
      function quad2(q) { return q.map(function (p) { return [p.x, p.z]; }); }
      function prisma(Q, y0, y1) { return P3._prisma(THREE, ccw(Q), function () { return y0; }, function () { return y1; }); }
      /* uma chapa fina vertical entre dois pontos de planta, de y0 a y1 */
      function parede(a, b, y0, y1) { return P3._faces(THREE, [[[a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z]]]); }
      function nomeEl(id, ifc, nome, qto) {
        mo.tipos[ifc] = (mo.tipos[ifc] || 0) + 1; mo.qto[id] = qto;
        mo.elementos.push({ id: id, uid: "edit:" + id, mid: "edit", arquivo: mo.nome, tipo: ifc, nome: nome, etapa: null, codOrc: null, qto: qto, disciplina: "arquitetura" });
        mo.nEl++;
      }
      void reg;
      arr(st.platibandas).forEach(function (p) {
        if (!p || !p.ok) return;
        var m = self._m(THREE, "reboco"), mc = self._m(THREE, "capa"), n = 0;
        p.segs.forEach(function (s) {
          addMesh(new THREE.Mesh(prisma(quad2(s.quad), p.base, p.topo), m), p.id, p.ifc, m); n++;
          if (p.rufoCapa) {
            /* o rufo de capa: chapa no topo, uma aba de cada lado */
            var q = s.quad, ux = q[3].x - q[0].x, uz = q[3].z - q[0].z, L = Math.sqrt(ux * ux + uz * uz) || 1; ux /= L; uz /= L;
            var ab = p.abaRufoEf, Q = [[q[0].x - ux * ab, q[0].z - uz * ab], [q[1].x - ux * ab, q[1].z - uz * ab], [q[2].x + ux * ab, q[2].z + uz * ab], [q[3].x + ux * ab, q[3].z + uz * ab]];
            addMesh(new THREE.Mesh(prisma(Q, p.topo, p.topo + 0.004), mc), p.id, p.ifc, mc);
          }
          if (p.contraRufo) {
            /* o contra-rufo: faixa vertical na face de dentro, no encontro com a telha (sobe 0,12 m a partir da face de cima da telha) */
            var T = global.BimTelhado, tel = arr(st.telhados).filter(function (t) { return String(t.id) === String(p.telhado); })[0];
            var q2 = s.quad, nx = q2[0].x - q2[3].x, nz = q2[0].z - q2[3].z, Ln = Math.sqrt(nx * nx + nz * nz) || 1; nx /= Ln; nz /= Ln;
            function yEm(pt0) { var y = T && tel ? T.alturaEm(tel, pt0.x + nx * 0.05, pt0.z + nz * 0.05) : null; return (y == null ? (tel ? tel.cotaApoio : p.base) : y) + (tel ? +tel.espessura || 0 : 0); }
            var ya = yEm(s.a), yb = yEm(s.b);
            addMesh(new THREE.Mesh(P3._faces(THREE, [[[s.a.x, ya, s.a.z], [s.b.x, yb, s.b.z], [s.b.x, yb + 0.12, s.b.z], [s.a.x, ya + 0.12, s.a.z]]]), mc), p.id, p.ifc, mc);
          }
        });
        if (n) nomeEl(p.id, p.ifc, "Platibanda (sintético " + p.id + ")", { comprimento: p.comprimento, area: p.area, volume: p.volume, contagem: 1 });
      });
      arr(st.calhasEmbutidas).forEach(function (c) {
        if (!c || !c.ok) return;
        var m = self._m(THREE, "calha"), n = 0;
        c.segs.forEach(function (s) {
          var q = s.quad, a0 = q[0], b0 = q[1], b1 = q[2], a1 = q[3];
          addMesh(new THREE.Mesh(prisma(quad2(q), s.yFundo, s.yFundo + 0.004), m), c.id, c.ifc, m);
          addMesh(new THREE.Mesh(parede(a0, b0, s.yFundo, s.yBorda), m), c.id, c.ifc, m);
          addMesh(new THREE.Mesh(parede(a1, b1, s.yFundo, s.yBorda), m), c.id, c.ifc, m);
          addMesh(new THREE.Mesh(parede(a0, a1, s.yFundo, s.yBorda), m), c.id, c.ifc, m);
          addMesh(new THREE.Mesh(parede(b0, b1, s.yFundo, s.yBorda), m), c.id, c.ifc, m); n++;
        });
        if (n) nomeEl(c.id, c.ifc, "Calha embutida (sintético " + c.id + ")", { comprimento: c.comprimento, area: c.comprimento * c.desenvolvimento, contagem: 1 });
      });
      /* T2: rufo e contrarrufo de encontro — chapas finas COM volume (6 faces), malha leve */
      function chapa(Q, nx, ny, nz, e) {
        var T2 = Q.map(function (p) { return [p[0] + nx * e, p[1] + ny * e, p[2] + nz * e]; });
        return P3._faces(THREE, [Q, T2, [Q[0], Q[1], T2[1], T2[0]], [Q[1], Q[2], T2[2], T2[1]], [Q[2], Q[3], T2[3], T2[2]], [Q[3], Q[0], T2[0], T2[3]]]);
      }
      arr(st.rufosEncontro).forEach(function (r) {
        if (!r || !r.ok || !r.encontros.length) return;
        var m = self._m(THREE, "capa"), Cb = BC(), PR = Cb ? Cb.PADRAO_RUFO : { abaTelha: 0.1, abaParede: 0.15, contraDe: 0.1, contraAte: 0.22 }, n = 0;
        var tel = arr(st.telhados).filter(function (t) { return String(t.id) === String(r.telhado); })[0];
        r.encontros.forEach(function (e) {
          var nI = e.nIn, ab = PR.abaTelha;
          e.segs.forEach(function (s) {
            var fa = s.fa, fb = s.fb, ia = { x: fa.x + nI.x * ab, z: fa.z + nI.z * ab }, ib = { x: fb.x + nI.x * ab, z: fb.z + nI.z * ab };
            function yT(p, y0) { var y = Cb && tel ? Cb.topoTelhaEm(tel, p.x, p.z) : null; return (y == null ? y0 : y) + 0.002; }
            function off(p, d) { return { x: p.x + nI.x * d, z: p.z + nI.z * d }; }
            if (e.rufo) {
              /* a aba sobre a telha e a aba encostada na parede */
              addMesh(new THREE.Mesh(chapa([[fa.x, s.yA + 0.002, fa.z], [fb.x, s.yB + 0.002, fb.z], [ib.x, yT(ib, s.yB), ib.z], [ia.x, yT(ia, s.yA), ia.z]], 0, 1, 0, 0.004), m), r.id, r.ifc, m);
              var a4 = off(fa, 0.004), b4 = off(fb, 0.004);
              addMesh(new THREE.Mesh(chapa([[a4.x, s.yA, a4.z], [b4.x, s.yB, b4.z], [b4.x, s.yB + PR.abaParede, b4.z], [a4.x, s.yA + PR.abaParede, a4.z]], nI.x, 0, nI.z, 0.004), m), r.id, r.ifc, m);
            }
            /* o contrarrufo: embutido na parede, cobre a aba do rufo */
            var a9 = off(fa, 0.009), b9 = off(fb, 0.009);
            addMesh(new THREE.Mesh(chapa([[a9.x, s.yA + PR.contraDe, a9.z], [b9.x, s.yB + PR.contraDe, b9.z], [b9.x, s.yB + PR.contraAte, b9.z], [a9.x, s.yA + PR.contraAte, a9.z]], nI.x, 0, nI.z, 0.004), m), r.id, r.ifc, m);
            n++;
          });
        });
        if (n) nomeEl(r.id, r.ifc, "Rufo e contrarrufo de encontro (sintético " + r.id + ")", { comprimento: r.comprimentoContra, peso: r.kgRufo + r.kgContra, contagem: 1 });
      });
      arr(st.condutores).forEach(function (c) {
        if (!c || !c.ok || !(c.alturaM > 0.05) || c.noHidro) return;   /* a descida com tubo no hidro: o tubo pluvial do js/biminst.js é que aparece */
        var m = self._m(THREE, "pvc"), r = (c.dnDesenho || 100) / 2000;
        var cil = new THREE.Mesh(new THREE.CylinderGeometry(r, r, c.alturaM, 20), m);
        cil.position.set(c.x, c.yBase + c.alturaM / 2, c.z); addMesh(cil, c.id, c.ifc, m);
        nomeEl(c.id, c.ifc, "Condutor vertical pluvial (sintético " + c.id + ")", { comprimento: c.alturaM, contagem: 1 });
      });
      arr(st.sancas).forEach(function (s) {
        if (!s || !s.ok) return;
        var m = self._m(THREE, "forro"), led = self._m(THREE, "led"), I = s.interno, K = s.contorno, e = s.espessura || 0.0125, i, n = I.length;
        /* a testeira: uma chapa vertical em cada lado da linha do recuo, da face de baixo do forro até a faixa de cima */
        for (i = 0; i < n; i++) { addMesh(new THREE.Mesh(parede(I[i], I[(i + 1) % n], s.cota, s.cotaFaixa + e), m), s.id, "IFCCOVERING", m); }
        /* a faixa superior: o anel entre o contorno e a linha do recuo (triangulado com o buraco) */
        var O = ccw(K.map(function (p) { return [p.x, p.z]; })), H = ccw(I.map(function (p) { return [p.x, p.z]; })).reverse(), pos = [], tris;
        try { tris = THREE.ShapeUtils.triangulateShape(O.map(V), [H.map(V)]); } catch (er) { tris = []; }
        var todos = O.concat(H);
        tris.forEach(function (t) { t.forEach(function (k) { pos.push(todos[k][0], s.cotaFaixa, todos[k][1]); }); });
        if (pos.length) addMesh(new THREE.Mesh(P3._geo(THREE, pos), m), s.id, "IFCCOVERING", m);
        /* a fita de LED: atrás da testeira, virada para a faixa de cima — luz indireta */
        if (s.luzEf) for (i = 0; i < n; i++) {
          var a = I[i], b = I[(i + 1) % n], dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0.05)) continue;
          var nxx = -dz / L, nzz = dx / L, off = 0.035;   /* para fora do recuo (anti-horário: a esquerda é o dentro, então a direita é fora) */
          var cx = (a.x + b.x) / 2 - nxx * off, cz = (a.z + b.z) / 2 - nzz * off, bx = new THREE.Mesh(new THREE.BoxGeometry(L, 0.012, 0.02), led);
          bx.position.set(cx, s.cotaFaixa - 0.015, cz); bx.rotation.y = -Math.atan2(dz, dx); addMesh(bx, s.id, "IFCLIGHTFIXTURE", led);
        }
        nomeEl(s.id, "IFCCOVERING", "Sanca (sintético " + s.id + ")", { comprimento: s.comprimento, area: s.areaDesenvolvida, contagem: 1 });
      });
    }
  };
  global.BimCoberturaUI = BimCoberturaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCoberturaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
