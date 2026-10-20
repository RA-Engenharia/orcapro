/* =====================================================================
 * hidpiscinadoc.js — PISCINA: DOCUMENTOS (motor PURO, ES5; Node gera HTML/SVG/planilha). Frente PISCINA, 18/10/2026.
 *
 *   HidPiscinaDoc.memorial(rede, info)      → { ok, titulo, html }   memorial de cálculo parametrizado (fonte em cada número)
 *   HidPiscinaDoc.manual(rede, info)        → { ok, titulo, html }   manual de operação e manutenção da piscina
 *   HidPiscinaDoc.quantitativo(estado, avaliarFam, rede) → { linhas[], avisos[] }   equipamentos, dispositivos, tubos,
 *        conexões (do BimInst.qto), vala; SINAPI só a conferida (dados-fonte/hidro/piscina/sinapi-piscina.json) — o resto PENDENTE
 *   HidPiscinaDoc.planilha(rede, quant, ExcelJS) → Promise<Buffer> (.xlsx formatado: cálculo, verificações, quantitativo, pendências)
 *   HidPiscinaDoc.pranchas(estado, rede, opcoes) → { ok, folhas[], avisos[] }   no FORMATO das folhas do js/hidpranchas.js
 *        (RA: carimbo e penas do Padrão): planta da piscina, casa de máquinas, cortes, isométrico, detalhes
 *   HidPiscinaDoc.secoes(rede) → os blocos que o "Gerar documentos" das outras frentes acrescenta (gancho em js/hidpiscinaui.js)
 *
 * `rede` = o resultado do HidPiscinaRede.gerar (traz o dimensionamento final em rede.dim, a casa, os dispositivos e as linhas).
 * ⚠ Nenhum número de norma aqui: os textos citam o que o motor calculou e a fonte que ele guardou. Os números escritos são
 *   DIAGRAMAÇÃO (mm de papel, escala, letra) dentro dos blocos hid:geometria.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function HP() { return dep("HidPiscina", "./hidpiscina.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function HPR() { return dep("HidPranchas", "./hidpranchas.js"); }
  function DADOS() { return dep("HidPiscinaDados", "./hidpiscinadados.js") || { sinapi: { itens: [] } }; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fx(v, c) { if (v == null || !isFinite(v)) return "—"; var m = Math.pow(10, c); return (Math.round(v * m) / m).toFixed(c).replace(".", ","); }   // hid:ok casas decimais (base 10)
  function f2(v) { return fx(v, 2); }
  function f1(v) { return fx(v, 1); }
  var NOME_SIS = { pisc_succao: "Sucção", pisc_retorno: "Retorno", pisc_hidro: "Hidromassagem", pisc_aquec: "Aquecimento", pisc_dreno: "Dreno e descarte", pisc_reposicao: "Reposição de água potável", pluvial: "Saída do descarte (pluvial)", esgoto: "Saída do descarte (esgoto)" };
  var STATUS = { atende: "atende", nao_atende: "NÃO ATENDE", pendente: "pendente" };
  function hoje() { var d = new Date(); return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear(); }   // hid:ok formatação de data

  /* ======================================================= HTML comum */
  var CSS = "body{font-family:Arial,Helvetica,sans-serif;color:#1d2733;margin:28px auto;max-width:980px;font-size:13px;line-height:1.45}" +
    "h1{font-size:21px;margin:0 0 4px}h2{font-size:15.5px;margin:22px 0 6px;border-bottom:2px solid #0f2740;padding-bottom:3px}h3{font-size:13.5px;margin:14px 0 4px}" +
    "table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:12px}th,td{border:1px solid #c9d2dc;padding:4px 6px;vertical-align:top;text-align:left}" +
    "th{background:#eef2f7}td.n{text-align:right;white-space:nowrap}.pend{color:#a3352b}.ok{color:#1b6e37}.nao{color:#a3352b;font-weight:700}" +
    ".muted{color:#5b6775}.capa{border:1px solid #c9d2dc;padding:10px 14px;border-radius:6px;background:#fafbfd}.tag{display:inline-block;padding:1px 6px;border-radius:4px;background:#eef2f7;font-size:11px}";
  function pagina(titulo, corpo) { return "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>" + esc(titulo) + "</title><style>" + CSS + "</style></head><body>" + corpo + "</body></html>"; }
  function tabela(cab, linhas, nCols) {
    return "<table><thead><tr>" + cab.map(function (c, i) { return "<th" + (nCols && nCols.indexOf(i) >= 0 ? ' class="n"' : "") + ">" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      linhas.map(function (l) { return "<tr>" + l.map(function (c, i) { return "<td" + (nCols && nCols.indexOf(i) >= 0 ? ' class="n"' : "") + ">" + (c && c.html != null ? c.html : esc(c)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  function cabecalho(rede, info, tipo) {
    info = info || {}; var d = rede.dim || {}, P = d.piscina || {}, o = info.obra || {}, em = info.empresa || {}, rs = info.responsavel || {};
    return "<div class=\"capa\"><h1>" + esc(tipo) + " — " + esc(P.nome || "Piscina") + "</h1>" +
      "<div class=\"muted\">" + esc(o.nome || "Obra") + (o.endereco ? " · " + esc(o.endereco) : "") + (o.cliente ? " · " + esc(o.cliente) : "") + "</div>" +
      "<div>" + (em.nome ? esc(em.nome) + " · " : "") + (rs.nome ? "Responsável técnico: " + esc(rs.nome) + (rs.crea ? " (CREA " + esc(rs.crea) + ")" : "") + " · " : "") + "Revisão " + esc(info.revisao || "R00") + " · " + esc(info.data || hoje()) + "</div>" +
      "<div style=\"margin-top:6px\">Situação do cálculo: <b class=\"" + (d.status === "atende" ? "ok" : (d.status === "nao_atende" ? "nao" : "pend")) + "\">" + esc(STATUS[d.status] || d.status || "—") + "</b>" +
      (d.status !== "atende" ? " <span class=\"muted\">— com pendência ou verificação a conferir, este documento NÃO afirma atendimento (ver o item Pendências)</span>" : "") + "</div></div>";
  }

  /* ======================================================= MEMORIAL */
  function normasTabela(d) {
    return tabela(["Tabela usada", "Documento", "Página / tabela", "Fonte"], arr(d.normas).map(function (n) {
      var tipo = n.tipo === "primaria" ? "primária" : "secundária";
      if (n.exemplarLicenciado === false) tipo += " — conferido em exemplar de terceiro; a RA precisa do exemplar próprio";
      return [n.titulo || n.chave, n.doc || n.norma, [n.pagina, n.tabela].filter(Boolean).join(" · "), tipo];
    }));
  }
  function memorial(rede, info) {
    if (!rede || !rede.dim || !rede.dim.ok) return { ok: false, motivo: "Lance o projeto da piscina primeiro (o dimensionamento não fechou)." };
    var d = rede.dim, P = d.piscina, h = cabecalho(rede, info, "Memorial de cálculo da piscina");
    h += "<h2>1. Objeto e premissas</h2>" + tabela(["Item", "Valor"], [
      ["Contorno", P.origem === "desenhado" ? "desenhado no OrçaPRO" : "do modelo arquitetônico (" + P.origem + ")"],
      ["Uso (NBR 10339, 4.2.1)", d.vazao && d.vazao.uso], ["Dimensões (eixo principal)", f2(P.comprimento) + " × " + f2(P.largura) + " m"],
      ["Área da superfície da água", f2(P.area) + " m²"], ["Profundidade da água (rasa → funda)", f2(P.profRasa) + " → " + f2(P.profFunda) + " m (média " + f2(P.profMedia) + " m)"],
      ["Volume", f2(P.volume) + " m³"], ["Cota da borda / do nível da água", f2(P.yBorda) + " / " + f2(P.yAgua) + " m"]]);
    h += "<h2>2. Normas e fontes</h2><p class=\"muted\">Cada número do cálculo vem de uma destas tabelas (dados-fonte/hidro/normas/piscina.json). Fonte secundária = manual de fabricante; o RT confere.</p>" + normasTabela(d);
    h += "<h2>3. Memória de cálculo</h2>" + tabela(["Grandeza", "Cálculo", "Valor", "Un.", "Fonte"], arr(d.memoria).map(function (m) { return [m.rotulo, m.formula, m.valor, m.unidade, m.fonte]; }), [2]);
    var lin = arr(rede.linhas);
    h += "<h2>4. Tubulações (PVC soldável, NBR 5648)</h2>" + tabela(["Linha", "Sistema", "Conjunto", "Q (m³/h)", "DN", "L (m)", "Trechos", "Joelhos", "Tês"], lin.map(function (l) {
      return [l.id.replace(/^[^-]*-/, ""), NOME_SIS[l.sistema] || l.sistema, l.conjunto === "succao" ? "sucção" : "recalque", f2(l.Q), l.dn, f2(l.L), l.trechos, l.pecas.joelho_90, num(l.pecas.te90_passagem_direta, 0) + num(l.pecas.te90_saida_lado, 0)];
    }), [3, 4, 5, 6, 7, 8]);   // hid:ok apresentação (índice de coluna, fatia de lista)
    var eq = d.equipamentos || {}, eqL = [];
    function linEq(nome, e, extra) { if (e) eqL.push([nome, e.fabricante + " " + e.codigo, extra || "", e.fonte]); }
    linEq("Filtro de areia", eq.filtro, eq.filtro ? "área " + f2(eq.filtro.area) + " m²; taxa " + f1(eq.filtro.taxa) + " m³/h/m²" : "");
    linEq("Motobomba de recirculação", eq.bomba, eq.bomba && eq.bomba.op ? "ponto " + f2(eq.bomba.op.Q) + " m³/h × " + f2(eq.bomba.op.H) + " mca; " + f2(num(eq.bomba.norm.potencia_cv, null)) + " cv" : "");
    linEq("Motobomba da hidromassagem", eq.bombaHidro, eq.bombaHidro && eq.bombaHidro.op ? "ponto " + f2(eq.bombaHidro.op.Q) + " m³/h × " + f2(eq.bombaHidro.op.H) + " mca" : "");
    linEq("Coadeira", eq.coadeira, eq.coadeira ? "vazão máx. " + f2(eq.coadeira.norm.vazao_max_m3h) + " m³/h" : "");
    linEq("Ralo de fundo", eq.ralo, eq.ralo ? "vazão máx. " + f2(eq.ralo.norm.vazao_max_m3h) + " m³/h (0,5 m/s nas aberturas)" : "");
    linEq("Dispositivo de aspiração", eq.aspiracao, ""); linEq("Dispositivo de retorno", eq.retorno, "");
    if (d.hidro && d.hidro.bocal) linEq("Bocal de hidromassagem", d.hidro.bocal, d.hidro.bocais + " un × " + f2(d.hidro.q_bocal) + " m³/h");
    if (d.aquecimento && d.aquecimento.solar && d.aquecimento.solar.placa) linEq("Placa coletora solar", d.aquecimento.solar.placa, d.aquecimento.solar.nPlacas + " placa(s); " + f2(d.aquecimento.solar.areaColetores) + " m² de coletor");
    if (d.aquecimento && d.aquecimento.bombaCalor) linEq("Bomba de calor", d.aquecimento.bombaCalor, f1(num(d.aquecimento.bombaCalor.norm.capacidade_kw, null)) + " kW");
    if (rede.aquecimento && rede.aquecimento.escolha) linEq("Motobomba do aquecimento solar", rede.aquecimento.escolha, rede.aquecimento.escolha.op ? "ponto " + f2(rede.aquecimento.escolha.op.Q) + " m³/h × " + f2(rede.aquecimento.escolha.op.H) + " mca (desnível " + f2(rede.aquecimento.estimativa.estatica) + " m)" : "");
    h += "<h2>5. Equipamentos e dispositivos (catálogo do fabricante, com página)</h2>" + tabela(["Função", "Produto", "Dados", "Fonte"], eqL);
    var es = d.estimativa || {};
    h += "<h2>6. Altura manométrica e NPSH (com os comprimentos e conexões traçados)</h2>" + tabela(["Parcela", "Valor (mca)"], [
      ["Sucção (pior ramo)", f2(es.hs)], ["Recalque (bomba → filtro → retornos)", f2(es.hr)], ["Filtro sujo (na iminência da lavagem)", f2(es.filtro)], ["Válvula seletora", f2(es.seletora)],
      ["Saída no bocal de retorno (v²/2g)", f2(es.bocal)], ["Desnível estático (circuito fechado)", f2(es.estatica)], [{ html: "<b>Altura manométrica total</b>" }, { html: "<b>" + f2(es.amt) + "</b>" }]], [1]) +
      tabela(["Trecho", "Q (m³/h)", "DN", "L (m)", "L eq. (m)", "v (m/s)", "h_f (mca)"], arr(es.detalhe).map(function (x) { return [x.papel, f2(x.Q), x.dn, f2(x.L), f2(x.Leq), f2(x.v), f2(x.hf)]; }), [1, 2, 3, 4, 5, 6]);   // hid:ok apresentação (índice de coluna, fatia de lista)
    if (d.npsh) h += tabela(["NPSH", "Valor"], [["Pressão atmosférica (m)", f2(d.npsh.hAtm)], ["Pressão de vapor (m)", f2(d.npsh.hVapor)], ["Desnível água → bomba (+ = afogada)", f2(d.npsh.desnivel)], ["Perda na sucção (m)", f2(d.npsh.hfSuccao)], [{ html: "<b>NPSH disponível</b>" }, { html: "<b>" + f2(d.npsh.disp) + " m</b>" }], ["NPSH requerido", d.npsh.req != null ? f2(d.npsh.req) + " m" : "não publicado em tabela pelo fabricante"]], [1]) + (d.npsh.obs ? "<p class=\"pend\">" + esc(d.npsh.obs) + "</p>" : "");
    h += "<h2>7. Verificações</h2>" + tabela(["Verificação", "Valor", "Limite", "Un.", "Situação", "Fonte"], arr(rede.verificacoes).map(function (v) {
      return [v.nome, v.valor, v.limite, v.unidade, { html: "<b class=\"" + (v.status === "atende" ? "ok" : (v.status === "nao_atende" ? "nao" : "pend")) + "\">" + esc(STATUS[v.status] || v.status) + "</b>" + (v.obs ? "<div class=\"muted\">" + esc(v.obs) + "</div>" : "") }, v.fonte];
    }));
    h += "<h2>8. Decisões de projeto (declaradas)</h2><ul>" + arr(rede.decisoes).map(function (x) { return "<li>" + esc(x.texto) + "</li>"; }).join("") + "</ul>";
    var C = rede.casa || {}, cm = d.casaMaquinas || {};
    h += "<h2>9. Casa de máquinas</h2>" + tabela(["Item", "Valor"], [["Dimensões internas (C × L × pé-direito)", f2(C.C) + " × " + f2(C.L) + " × " + f2(C.H) + " m"], ["Nível", C.nivel === "afogada" ? "enterrada — bomba abaixo do nível da água (afogada)" : "na superfície — bomba acima do nível da água"], ["Piso (cota)", f2(C.yPiso) + " m"], ["Alçapão de acesso", f2(C.alcapao) + " m"], ["Posição", C.origem === "usuario" ? "definida pelo projetista (arrastada no modelo)" : "o melhor lugar calculado pelo OrçaPRO"]]) +
      "<ul>" + arr(cm.requisitos).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul><p class=\"muted\">" + esc(cm.fonte || "") + "</p>";
    h += "<h2>10. Pendências (o que falta para o RT fechar)</h2>" + (arr(rede.pendencias).length ? "<ul>" + arr(rede.pendencias).map(function (p) { return "<li class=\"pend\"><span class=\"tag\">" + esc(p.chave) + "</span> " + esc(p.motivo) + "</li>"; }).join("") + "</ul>" : "<p>Nenhuma.</p>") +
      (arr(rede.avisos).length ? "<h3>Avisos</h3><ul>" + arr(rede.avisos).map(function (a) { return "<li>" + esc(a.texto) + "</li>"; }).join("") + "</ul>" : "");
    return { ok: true, titulo: "Memorial de cálculo da piscina", html: pagina("Memorial de cálculo da piscina", h) };
  }

  /* ======================================================= MANUAL DE OPERAÇÃO E MANUTENÇÃO */
  /* a qualidade da água (NBR 10818:2016) pela tabela — sem a tabela, o manual diz que falta (nunca um número de cabeça) */
  function qualidadeAgua() {
    var N = global.HidNormas || (typeof require === "function" ? (function () { try { return require("./hidnormas.js"); } catch (e) { return null; } })() : null);
    var L = N && N.linhas ? N.linhas("pisc.qualidade_agua") : null;
    if (!L || !L.length) return null;
    var v = {}; L.forEach(function (x) { v[x.parametro] = Number(x.valor); });
    var f = N.fonte("pisc.qualidade_agua") || {};
    return { ph: [v.ph_min, v.ph_max], cloro: [v.cloro_livre_min, v.cloro_livre_max], lavapes: v.cloro_lavapes_min, fonte: (f.norma || "") + (f.edicao ? ":" + f.edicao : "") + (f.tabela ? ", " + f.tabela : "") };
  }
  function manual(rede, info) {
    if (!rede || !rede.dim || !rede.dim.ok) return { ok: false, motivo: "Lance o projeto da piscina primeiro." };
    var d = rede.dim, P = d.piscina, eq = d.equipamentos || {}, h = cabecalho(rede, info, "Manual de operação e manutenção da piscina");
    var filt = d.vazao || {}, bomba = eq.bomba, fil = eq.filtro, QA = qualidadeAgua();
    h += "<h2>1. O sistema instalado</h2><ul>" +
      "<li>Volume: <b>" + f2(P.volume) + " m³</b>; recirculação de projeto <b>" + f2(filt.Q_m3h) + " m³/h</b> — a água inteira passa pelo filtro em até <b>" + f1(filt.t_max_h) + " h</b> (NBR 10339:2018, 5.4.4.14, Tabela 4).</li>" +
      (fil ? "<li>Filtro de areia " + esc(fil.fabricante + " " + fil.codigo) + " com válvula seletora (" + esc(fil.fonte) + ").</li>" : "") +
      (bomba ? "<li>Motobomba " + esc(bomba.fabricante + " " + bomba.codigo) + " com pré-filtro (cesto) na casa de máquinas.</li>" : "") +
      "<li>Sucção: " + arr(rede.dispositivos).filter(function (x) { return x.tipo === "coadeira"; }).length + " coadeira(s), " + arr(rede.dispositivos).filter(function (x) { return x.tipo === "ralo"; }).length + " ralo(s) de fundo com grelha antiaprisionamento e " + arr(rede.dispositivos).filter(function (x) { return x.tipo === "aspiracao"; }).length + " dispositivo(s) de aspiração; retorno por " + arr(rede.dispositivos).filter(function (x) { return x.tipo === "retorno"; }).length + " bocal(is).</li>" +
      (d.hidro ? "<li>Hidromassagem: " + d.hidro.bocais + " bocais com bomba própria, ligada pelo botão pneumático na borda.</li>" : "") +
      (d.aquecimento ? "<li>Aquecimento: " + esc(d.aquecimento.tipo === "solar" ? "solar (placas coletoras) com bomba própria" : (d.aquecimento.tipo === "bomba_calor" ? "bomba de calor" : d.aquecimento.tipo)) + "; água a " + f1(d.aquecimento.tAgua) + " °C.</li>" : "") + "</ul>";
    h += "<h2>2. Rotina diária</h2><ol><li>Ligar a filtração (seletora em <b>FILTRAR</b>) pelo tempo do item 1 — com a piscina em uso, sempre ligada.</li><li>Recolher as folhas da superfície (peneira) e esvaziar o cesto das coadeiras.</li>" +
      (QA ? "<li>Medir o pH e o cloro livre (kit) e anotar no livro de registro (item 6): <b>pH de " + f1(QA.ph[0]) + " a " + f1(QA.ph[1]) + "</b> e <b>cloro livre de " + f1(QA.cloro[0]) + " a " + f1(QA.cloro[1]) + " mg/L</b>" + (QA.lavapes ? "; lava-pés com no mínimo " + f1(QA.lavapes) + " mg/L" : "") + " (" + esc(QA.fonte) + ").</li>" : "<li>Medir pH e cloro livre (kit) e anotar no livro de registro (item 6) — os limites da NBR 10818 não estão carregados (ver Pendências).</li>") + "<li>Conferir se o botão de emergência está desobstruído e visível.</li></ol>";
    h += "<h2>3. Válvula seletora — quando usar cada posição</h2>" + tabela(["Posição", "Para quê", "Como"], [
      ["FILTRAR", "operação normal", "bomba ligada; a água passa pela areia e volta pelos retornos"],
      ["RETROLAVAR", "limpar a areia", "com a bomba DESLIGADA, mude a posição; ligue até a água sair limpa no visor de lavagem; o descarte vai para a rede indicada no projeto" + (rede.dim.decisoes.some(function (x) { return x.id === "pisc.filtro_sujo"; }) ? " — faça quando a diferença entre os manômetros chegar ao valor do fabricante (ver memorial)" : "")],
      ["ENXAGUAR", "assentar a areia depois da retrolavagem", "1 a 2 minutos, depois volte para FILTRAR (conforme o manual do filtro)"],
      ["DRENAR", "aspirar sujeira pesada ou baixar o nível", "a água aspirada vai ao descarte sem passar pela areia"],
      ["RECIRCULAR", "circular sem filtrar (tratamento de choque)", "a água não passa pela areia"],
      ["FECHADO", "manutenção da bomba", "nunca ligue a bomba nesta posição"]]) + "<p class=\"muted\">⚠ Nunca mude a posição da seletora com a bomba ligada. Os tempos e a sequência exatos são os do manual do fabricante do filtro.</p>";
    h += "<h2>4. Aspiração do fundo</h2><ol><li>Encher a mangueira de água e encaixá-la no dispositivo de aspiração (a tampa fecha sozinha ao retirar).</li><li>Fechar os registros das outras sucções no barrilete da casa de máquinas e deixar só a aspiração aberta.</li><li>Aspirar devagar; ao terminar, reabrir os registros na posição de operação (todos abertos).</li></ol>" +
      (arr(rede.pendencias).some(function (p) { return p.chave === "pisc.fab.mangueira_aspiracao"; }) ? "<p class=\"pend\">O alcance da mangueira não foi publicado pelo fabricante: confira na obra se o aspirador alcança todo o fundo.</p>" : "");
    h += "<h2>5. Manutenção periódica</h2>" + tabela(["Quando", "O quê"], [
      ["Semanal", "limpar o cesto do pré-filtro da bomba (bomba desligada, registros fechados); escovar paredes e fundo; aspirar"],
      ["Na diferença de pressão do fabricante", "retrolavar o filtro e enxaguar"],
      ["Mensal", "alcalinidade e dureza cálcica (NBR 10339, 6 h); conferir vazamentos no barrilete e na casa de máquinas; testar o botão de emergência"],
      ["Trimestral", "ácido cianúrico (recomendação da NBR 10339); conferir o ralo do piso da casa de máquinas"],
      ["Na periodicidade do fabricante", "trocar as tampas/grelhas antiaprisionamento dos ralos (o fabricante indica a troca periódica); trocar a areia do filtro"],
      ["Anual", "revisar motores, quadro de comando, DR e aterramento (NBR 5410); programa de manutenção pela NBR 5674"]]);
    h += "<h2>6. Livro de registro (NBR 10339:2018, seção 6 h)</h2><p>Manter um livro com: volume dos tanques; número de banhistas simultâneos; vazão pelos filtros; anotação diária de banhistas, temperatura da água (e do ar, se coberta), limpidez, pH e desinfetante; mensal de alcalinidade e dureza; anormalidades; análises microbiológicas pela NBR 10818. (Piscina residencial: a anotação diária é recomendada, não exigida.)</p>";
    h += "<h2>7. Casa de máquinas e produtos químicos (NBR 10339:2018, 6.1.2 e 6.2; 5.2.1 h)</h2><ul><li>Manter trancada; acesso só de pessoa autorizada.</li><li>Não armazenar produto químico que não esteja em uso; guardar em compartimento separado, em estrados ou prateleiras, nunca no piso, nas embalagens originais.</li><li>Nunca misturar produtos; diluir sempre o produto na água (nunca a água no produto); não fumar perto dos produtos.</li><li>Em vazamento: limpar e ventilar na hora. Manter as FISPQ e os manuais dos equipamentos.</li><li>O ralo do piso tem de escoar: casa enterrada inunda.</li></ul>";
    h += "<h2>8. Segurança</h2><ul><li>Nunca tirar as grelhas dos ralos com a bomba ligada; grelha quebrada = piscina interditada até a troca.</li><li>Nunca nadar com capa de proteção ou térmica sobre a água.</li><li>O botão de emergência desliga toda a circulação: mostre a todos onde fica.</li><li>Equipamento elétrico só com DR e aterramento (NBR 5410).</li></ul>";
    if (d.hidro) h += "<h2>9. Hidromassagem</h2><ul><li>Liga e desliga pelo botão pneumático na borda (sem eletricidade junto da água).</li><li>Não ligar com o nível da água abaixo dos bocais nem com a grelha da sucção obstruída.</li><li>Cada bocal tem a sua entrada de ar: mantenha-a desobstruída.</li></ul>";
    if (d.aquecimento) h += "<h2>10. Aquecimento</h2><ul>" + (d.aquecimento.tipo === "solar" ? "<li>A bomba do aquecimento liga pelo controlador (sol nas placas mais quente que a água). Registros da derivação abertos; o by-pass fica parcialmente fechado conforme o ajuste do instalador.</li><li>Lave as placas com água; inspecione vazamentos depois de granizo.</li>" : "<li>Siga o manual da bomba de calor: vazão mínima pelo aparelho, by-pass e registros da derivação.</li>") + "<li>Use a capa térmica à noite: a evaporação é a maior perda de calor.</li></ul>";
    h += "<h2>Pendências deste projeto</h2>" + (arr(rede.pendencias).length ? "<ul>" + arr(rede.pendencias).map(function (p) { return "<li class=\"pend\">" + esc(p.motivo) + "</li>"; }).join("") + "</ul>" : "<p>Nenhuma.</p>");
    return { ok: true, titulo: "Manual de operação e manutenção da piscina", html: pagina("Manual de operação e manutenção da piscina", h) };
  }

  /* ======================================================= QUANTITATIVO */
  function sinapiDe(chave) { var s = arr(DADOS().sinapi && DADOS().sinapi.itens).filter(function (x) { return x.chave === chave; })[0]; return s || null; }
  function quantitativo(estado, avaliarFam, rede) {
    var out = { linhas: [], avisos: [] }, B = BI();
    function add(grupo, descricao, un, q, sin, fonte, obs) { out.linhas.push({ grupo: grupo, descricao: descricao, unidade: un, quantidade: q, codigo: sin ? sin.codigo : "", sinapi: sin ? sin.descricao : "", status: sin ? "SINAPI " + (DADOS().sinapi.mes || "") : "pendente", fonte: fonte || "", obs: obs || "" }); }
    var pid = rede && rede.geometria ? rede.geometria.id : null, fams = arr(estado && estado.familias).filter(function (f) { return pid && String(f.id).indexOf(pid + "-") === 0; });
    var grupos = {};
    fams.forEach(function (f) { var k = f.famId + "|" + txt(f.inst && f.inst.Produto); (grupos[k] = grupos[k] || { f: f, n: 0 }).n++; });
    var FAM = dep("HidPiscinaFam", "./hidpiscinafam.js");
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k], fa = FAM && FAM.porId(g.f.famId), nome = fa ? fa.nome : g.f.famId, prod = txt(g.f.inst && g.f.inst.Produto);
      var sin = null;
      if (g.f.famId === "hid-pisc-coletor") sin = sinapiDe("coletor_laje");
      if (g.f.famId === "hid-pisc-registro") { var dn = num(g.f.inst && g.f.inst.DN, 0); sin = sinapiDe("registro_esfera_soldavel_" + dn); }
      if (g.f.famId === "hid-pisc-coletor" && sin) {
        /* a composição é de coletor de 1,5 m² "ou área equivalente": a quantidade vai pela ÁREA */
        var aTot = 0; fams.forEach(function (f) { if (f.famId === "hid-pisc-coletor") aTot += num(f.inst.Largura, 0) * num(f.inst.Profundidade, 0); });
        var aSin = num((/(\d+,\d+) M2/.exec(sin.descricao) || [])[1] ? String((/(\d+,\d+) M2/.exec(sin.descricao) || [])[1]).replace(",", ".") : null, null);
        var area = rede.dim && rede.dim.aquecimento && rede.dim.aquecimento.solar ? rede.dim.aquecimento.solar.areaColetores : aTot;
        add("Aquecimento", nome + (prod ? " — " + prod : ""), sin.unidade, aSin ? Math.ceil(area / aSin - 1e-9) : g.n, sin, txt(g.f.inst && g.f.inst.Fonte), "composição por placa de " + (aSin ? f2(aSin) : "—") + " m² 'ou área equivalente': quantidade = área de coletor do cálculo ÷ área da composição");   // hid:ok tolerância de arredondamento
        return;
      }
      add(/bomba|filtro|casa|quadro|caixa-descarte|poco/.test(g.f.famId) ? "Equipamentos e casa de máquinas" : "Dispositivos do tanque", nome + (prod ? " — " + prod : ""), "un", g.n, sin, txt(g.f.inst && g.f.inst.Fonte), sin ? "" : "sem composição SINAPI deste produto — cotação do fornecedor");
    });
    var q = null; try { q = B && B.qto ? B.qto(estado, avaliarFam) : null; } catch (e) { q = null; out.avisos.push("quantitativo do modelo: " + e.message); }
    var Lvala = 0;
    if (q) {
      arr(q.tubos).filter(function (t) { return /^pisc_/.test(t.sistema); }).forEach(function (t) {
        Lvala += num(t.metros, 0);
        add("Tubulação", "Tubo PVC soldável DN " + t.dn + " — " + (NOME_SIS[t.sistema] || t.sistema), "m", Math.round(num(t.quantidade, 0) * 100) / 100, t.sinapi && t.sinapi.status === "ok" ? { codigo: t.sinapi.codigo, descricao: t.sinapi.descricao } : null, "modelo (BimInst)", t.sinapi && t.sinapi.status !== "ok" ? t.sinapi.motivo : "aplicação SINAPI 'reservação (barrilete)'");   // hid:ok 2 casas
      });
      arr(q.conexoes).filter(function (c) { return /^pisc_/.test(c.sistema); }).forEach(function (c) {
        add("Conexões", c.nome + " PVC soldável DN " + c.dn + (c.dn2 ? " × " + c.dn2 : "") + " — " + (NOME_SIS[c.sistema] || c.sistema), "un", c.n, c.sinapi && c.sinapi.status === "ok" ? { codigo: c.sinapi.codigo, descricao: c.sinapi.descricao } : null, "modelo (BimInst)", c.sinapi && c.sinapi.status !== "ok" ? c.sinapi.motivo : "");
      });
    }
    /* a ESPERA da saída da caixa receptora do descarte (rede pluvial ou de esgoto, frente C 19/10/2026): tubo da rede, não de PVC soldável */
    arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      if (!pid || String(t.id) !== pid + "-saida-descarte") return;
      add("Tubulação", "Tubo DN " + t.dn + " — saída da caixa receptora do descarte (espera para a rede " + (t.sistema === "esgoto" ? "de esgoto" : "pluvial") + ")", "m", Math.round(num(t.comprimento, 0) * 100) / 100, null, "modelo (BimInst)", "liga na rede da obra; composição SINAPI pela rede escolhida");   // hid:ok 2 casas
    });
    /* VALA: os tubos enterrados (fora da casa de máquinas) — largura × profundidade de DESENHO, declaradas */
    var GV = { largura: 0.40, profundidade: 0.60 };   // hid:ok vala de referência (40 × 60 cm): critério do projetista; o volume real é da execução
    var enterr = 0; arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { if (/^pisc_/.test(t.sistema) && Math.max(t.p1.y, t.p2.y) < num(rede.geometria && rede.geometria.yBorda, 0) && Math.abs(t.p1.y - t.p2.y) < 1e-6) enterr += num(t.comprimento, 0); });   // hid:ok tolerância
    if (enterr > 0) {
      var vol = Math.round(enterr * GV.largura * GV.profundidade * 100) / 100;   // hid:ok 2 casas
      add("Serviços", "Escavação manual de vala para os tubos da piscina (" + f2(enterr) + " m × " + f2(GV.largura) + " × " + f2(GV.profundidade) + " m)", "m³", vol, sinapiDe("escavacao_vala"), "comprimento horizontal enterrado do modelo", "seção de vala de referência (critério do projetista) — ajustar à execução");
      add("Serviços", "Reaterro manual da vala", "m³", vol, sinapiDe("reaterro_vala"), "idem", "descontar o volume dos tubos na execução");
    }
    return out;
  }

  /* ======================================================= PLANILHA .xlsx */
  function planilha(rede, quant, ExcelJS) {
    var X = ExcelJS || global.ExcelJS || dep("ExcelJS", "exceljs");
    if (!X) return Promise.reject(new Error("ExcelJS não carregado"));
    var wb = new X.Workbook(), d = rede.dim || {};
    /* hid:geometria-inicio — APRESENTAÇÃO da planilha (larguras de coluna, cores): não é norma */
    var AZUL = "FF0F2740", BR = "FFFFFFFF";
    function aba(nome, cab, linhas, larg) {
      var ws = wb.addWorksheet(nome); ws.addRow(cab);
      var h = ws.getRow(1); h.font = { bold: true, color: { argb: BR } }; h.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; c.alignment = { wrapText: true, vertical: "middle" }; });
      linhas.forEach(function (l) { var r = ws.addRow(l); r.alignment = { wrapText: true, vertical: "top" }; });
      (larg || []).forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: "frozen", ySplit: 1 }];
      return ws;
    }
    aba("Cálculo", ["Grandeza", "Cálculo", "Valor", "Unidade", "Fonte"], arr(d.memoria).map(function (m) { return [m.rotulo, m.formula, m.valor, m.unidade, m.fonte]; }), [34, 60, 14, 10, 60]);
    aba("Linhas", ["Linha", "Sistema", "Q (m³/h)", "DN", "L (m)", "Joelhos", "Tês"], arr(rede.linhas).map(function (l) { return [l.id, NOME_SIS[l.sistema] || l.sistema, l.Q, l.dn, l.L, l.pecas.joelho_90, num(l.pecas.te90_passagem_direta, 0) + num(l.pecas.te90_saida_lado, 0)]; }), [22, 18, 10, 8, 10, 10, 8]);
    aba("Verificações", ["Verificação", "Valor", "Limite", "Unidade", "Situação", "Fonte"], arr(rede.verificacoes).map(function (v) { return [v.nome, v.valor, v.limite, v.unidade, STATUS[v.status] || v.status, v.fonte]; }), [60, 12, 20, 10, 14, 70]);
    var wq = aba("Quantitativo", ["Grupo", "Descrição", "Un.", "Quantidade", "SINAPI", "Descrição SINAPI", "Situação", "Fonte", "Observação"], arr(quant && quant.linhas).map(function (l) { return [l.grupo, l.descricao, l.unidade, l.quantidade, l.codigo, l.sinapi, l.status, l.fonte, l.obs]; }), [22, 60, 6, 12, 10, 60, 16, 40, 50]);
    wq.getColumn(4).numFmt = "#,##0.00";
    aba("Pendências", ["Chave", "O que falta"], arr(rede.pendencias).map(function (p) { return [p.chave, p.motivo]; }), [34, 120]);
    /* hid:geometria-fim */
    return wb.xlsx.writeBuffer();
  }

  /* ======================================================= PRANCHAS (formato do js/hidpranchas.js) */
  /* hid:geometria-inicio — DIAGRAMAÇÃO da prancha: mm de papel, escalas candidatas, tamanhos de letra e símbolo. Nenhuma norma. */
  var K = { formato: "A1", escalas: [20, 25, 50, 75, 100, 125, 150, 200], margem: 12, hTitulo: 5, hTexto: 2.5, hRot: 2.0, hTab: 2.2, rDisp: 1.4, tabLin: 4.2,
            cores: { pisc_succao: "#00838F", pisc_retorno: "#29B6F6", pisc_hidro: "#7E57C2", pisc_aquec: "#EF6C00", pisc_dreno: "#8D6E63", pisc_reposicao: "#1565C0" }, pena: 0.35, penaFina: 0.18, isoAng: 30 };
  var SIGLA_DISP = { coadeira: "CO", aspiracao: "AS", retorno: "RE", ralo: "RF", hidro: "HI", succao_hidro: "SH", refletor: "IL" };
  function estiloP() {
    var H = HPR(), A = AP(), E = H && H.estilo ? H.estilo() : (A ? A.estilo() : null); if (!E) return null;
    Object.keys(K.cores).forEach(function (s) { E.camadas["PISC-" + s] = { mm: K.pena, dash: null, cor: K.cores[s] }; });
    E.camadas["PISC-AGUA"] = { mm: K.penaFina, dash: "4 2", cor: "#1E6FD9" };
    return E;
  }
  function caixaDe(pts) { var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; pts.forEach(function (p) { b.x0 = Math.min(b.x0, p[0]); b.y0 = Math.min(b.y0, p[1]); b.x1 = Math.max(b.x1, p[0]); b.y1 = Math.max(b.y1, p[1]); }); return b; }
  /* escala que cabe: o maior denominador da lista em que o desenho (m) cabe na janela (mm) */
  function escalaQueCabe(wM, hM, wMm, hMm) { for (var i = 0; i < K.escalas.length; i++) { var e = K.escalas[i]; if (wM * 1000 / e <= wMm && hM * 1000 / e <= hMm) return e; } return K.escalas[K.escalas.length - 1]; }
  function Janela(b, jan, esc) { this.b = b; this.j = jan; this.e = esc; this.k = 1000 / esc; var wM = (b.x1 - b.x0) * this.k, hM = (b.y1 - b.y0) * this.k; this.ox = jan.x + (jan.w - wM) / 2; this.oy = jan.y + (jan.h - hM) / 2; }
  Janela.prototype.p = function (u, v) { return [this.ox + (u - this.b.x0) * this.k, this.oy + (v - this.b.y0) * this.k]; };
  function tituloVista(D, x, y, t, esc) { D.texto(x, y, t, K.hTitulo, { cor: "#000" }); if (esc) D.texto(x, y + K.hTitulo + 1.5, "ESCALA 1:" + esc, K.hTexto); }
  function tabelaP(D, x, y, cab, linhas, larg) {
    var lh = K.tabLin, W = larg.reduce(function (a, b) { return a + b; }, 0), yy = y;
    D.ret(x, yy, W, lh, "HID-TABELA"); var xx = x; cab.forEach(function (c, i) { D.texto(xx + 1, yy + lh - 1.2, c, K.hTab); xx += larg[i]; }); yy += lh;
    linhas.forEach(function (l) { D.ret(x, yy, W, lh, "HID-TABELA"); var x2 = x; l.forEach(function (c, i) { D.texto(x2 + 1, yy + lh - 1.2, txt(c).slice(0, Math.max(4, Math.floor(larg[i] / (K.hTab * 0.55)))), K.hTab); x2 += larg[i]; }); yy += lh; });
    return yy;
  }
  /* hid:geometria-fim */

  function pranchas(estado, rede, opcoes) {
    opcoes = opcoes || {};
    var A = AP(), P = PR(), E = estiloP(), avisos = [];
    if (!A || !P || !E || !rede || !rede.ok) return { ok: false, folhas: [], avisos: ["Motores de prancha não carregados ou projeto da piscina não lançado."] };
    var g = rede.geometria, d = rede.dim, pid = g.id, cm = rede.cm, casa = rede.casa;
    var linhaDe = {}; arr(rede.ops).forEach(function (o) { if (o && o.op === "trecho" && o.piscLinha) linhaDe[o.id] = o.piscLinha; });   /* o estado não guarda a marca da linha: vem do lote */
    var trs = arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return /^pisc_/.test(t.sistema); }).map(function (t) { var c = JSON.parse(JSON.stringify(t)); c.piscLinha = linhaDe[t.id] || null; return c; });
    var fams = arr(estado && estado.familias).filter(function (f) { return String(f.id).indexOf(pid + "-") === 0; });
    var formato = opcoes.formato || K.formato, geo = P.geometria(formato, "paisagem", "RA"), ar = geo.area;
    var defs = [], prefixo = (opcoes.prefixo || "PIS").toUpperCase(), rev = opcoes.revisao || "R00", data = opcoes.data || hoje();
    function novaFolha(id, titulo) { var D = new A.Desenho(E, []); defs.push({ id: id, titulo: titulo, D: D, escala: "INDICADA" }); return defs[defs.length - 1]; }
    function cantoCasa(lx, lz) { var c = Math.cos(cm.rotY), s = Math.sin(cm.rotY); return { x: cm.x + lx * c + lz * s, z: cm.z - lx * s + lz * c }; }
    function contornoCasa(m) { var hc = casa.C / 2 + m, hl = casa.L / 2 + m; return [cantoCasa(-hc, -hl), cantoCasa(hc, -hl), cantoCasa(hc, hl), cantoCasa(-hc, hl)]; }

    /* ---------------- 01 PLANTA */
    (function () {
      /* hid:geometria-inicio */
      var F = novaFolha("planta", "PISCINA — PLANTA DOS DISPOSITIVOS E TUBULAÇÕES"), D = F.D;
      var pts = g.contorno.map(function (p) { return [p.x, p.z]; }).concat(contornoCasa(0.2).map(function (p) { return [p.x, p.z]; }));
      trs.forEach(function (t) { if (Math.max(t.p1.y, t.p2.y) < g.yBorda + 0.5) { pts.push([t.p1.x, t.p1.z]); pts.push([t.p2.x, t.p2.z]); } });
      var b = caixaDe(pts); b.x0 -= 1; b.y0 -= 1; b.x1 += 1; b.y1 += 1;
      var jan = { x: ar.x + K.margem, y: ar.y + K.margem + 14, w: ar.w * 0.72 - 2 * K.margem, h: ar.h - 2 * K.margem - 14 }, esc = escalaQueCabe(b.x1 - b.x0, b.y1 - b.y0, jan.w, jan.h), J = new Janela(b, jan, esc);
      F.escala = "1:" + esc;
      tituloVista(D, ar.x + K.margem, ar.y + K.margem + 4, "PLANTA DA PISCINA — DISPOSITIVOS, CASA DE MÁQUINAS E TUBULAÇÕES", esc);
      /* contexto: paredes da casa (cinza) */
      arr(estado.caixas).forEach(function (c) { if (!c || c.tipo !== "parede") return; var cs = Math.cos(c.rotY || 0), sn = Math.sin(c.rotY || 0), h = c.comprimento / 2; var a = J.p(c.cx - h * cs, c.cz + h * sn), e = J.p(c.cx + h * cs, c.cz - h * sn); if (a[0] < jan.x || a[0] > jan.x + jan.w || e[0] < jan.x - 5 || e[0] > jan.x + jan.w + 5) return; D.linha(a[0], a[1], e[0], e[1], "HID-CONTEXTO"); });
      /* tanque: borda interna + parede */
      D.poli(g.contorno.map(function (p) { return J.p(p.x, p.z); }), "HID-SIMBOLO", true);
      var ep = 0.2, ext = g.lados.map(function (l) { return { a: { x: l.a.x + l.n.x * ep, z: l.a.z + l.n.z * ep }, b: { x: l.b.x + l.n.x * ep, z: l.b.z + l.n.z * ep } }; });
      ext.forEach(function (l) { var a = J.p(l.a.x, l.a.z), e = J.p(l.b.x, l.b.z); D.linha(a[0], a[1], e[0], e[1], "HID-CONTEXTO"); });
      var c0 = J.p(g.centroide.x, g.centroide.z);
      D.texto(c0[0], c0[1] - 3, "PISCINA " + f2(g.eixo.comprimento) + " × " + f2(g.eixo.largura) + " m", K.hTexto, { al: "C" });
      D.texto(c0[0], c0[1] + 1, "A = " + f2(g.area) + " m²  ·  V = " + f2(g.volume) + " m³", K.hTexto, { al: "C" });
      D.texto(c0[0], c0[1] + 5, "PROF. " + f2(g.profRasa) + " → " + f2(g.profFunda) + " m  ·  N.A. " + f2(g.yAgua), K.hTexto, { al: "C" });
      /* casa de máquinas */
      D.poli(contornoCasa(0.12).map(function (p) { return J.p(p.x, p.z); }), "HID-SIMBOLO", true);
      D.poli(contornoCasa(0).map(function (p) { return J.p(p.x, p.z); }), "HID-CONTEXTO", true);
      var pc = J.p(cm.x, cm.z); D.texto(pc[0], pc[1] + (casa.L / 2 + 0.5) * J.k, "CASA DE MÁQUINAS (ver folha 02)", K.hRot, { al: "C" });
      /* tubos (projeção horizontal; vertical = círculo) */
      var rotulados = {};
      trs.forEach(function (t) {
        var a = J.p(t.p1.x, t.p1.z), e = J.p(t.p2.x, t.p2.z), cam = "PISC-" + t.sistema;
        if (Math.abs(a[0] - e[0]) < 0.05 && Math.abs(a[1] - e[1]) < 0.05) { D.circ(a[0], a[1], 0.6, cam); return; }
        D.linha(a[0], a[1], e[0], e[1], cam);
      });
      /* um rótulo de DN por linha (no trecho mais comprido) */
      arr(rede.linhas).forEach(function (l, i) {
        var ts = trs.filter(function (t) { return t.id && t.sistema === l.sistema; }).filter(function (t) { return true; });
        var meu = null; ts.forEach(function (t) { var L = Math.sqrt(Math.pow(t.p1.x - t.p2.x, 2) + Math.pow(t.p1.z - t.p2.z, 2)); if (Math.abs(t.p1.y - t.p2.y) < 1e-6 && (!meu || L > meu.L) && !rotulados[t.id] && t.piscLinha === l.id) meu = { t: t, L: L }; });
        if (!meu) return; rotulados[meu.t.id] = 1;
        var m = J.p((meu.t.p1.x + meu.t.p2.x) / 2, (meu.t.p1.z + meu.t.p2.z) / 2), hor = Math.abs(meu.t.p1.x - meu.t.p2.x) > Math.abs(meu.t.p1.z - meu.t.p2.z);
        D.texto(m[0] + (hor ? 0 : 1.2), m[1] - (hor ? 1.2 : 0), (NOME_SIS[l.sistema] || "").toUpperCase().slice(0, 4) + " Ø" + l.dn, K.hRot, { cor: K.cores[l.sistema], rot: hor ? 0 : -90 });
      });
      /* dispositivos */
      var cont = {};
      arr(rede.dispositivos).forEach(function (dv) {
        var p = J.p(dv.x, dv.z), s = SIGLA_DISP[dv.tipo] || "D"; cont[s] = (cont[s] || 0) + 1;
        D.circ(p[0], p[1], K.rDisp, "HID-SIMBOLO"); D.texto(p[0] + K.rDisp + 0.6, p[1] - K.rDisp, s + cont[s], K.hRot);
      });
      /* legenda e quadro dos dispositivos */
      var lx = ar.x + ar.w * 0.74, ly = ar.y + K.margem + 6;
      D.texto(lx, ly, "LEGENDA", K.hTitulo * 0.8); ly += 6;
      Object.keys(K.cores).forEach(function (s) { D.linha(lx, ly - 1, lx + 10, ly - 1, "PISC-" + s); D.texto(lx + 12, ly, NOME_SIS[s], K.hTexto); ly += 5; });
      ly += 3;
      var nomes = { CO: "Coadeira (skimmer)", AS: "Dispositivo de aspiração", RE: "Bocal de retorno", RF: "Ralo de fundo antiaprisionamento", HI: "Bocal de hidromassagem", SH: "Sucção da hidro (grelha)", IL: "Refletor LED" };
      var linhasT = Object.keys(cont).map(function (s) { return [s, nomes[s] || s, cont[s]]; });
      ly = tabelaP(D, lx, ly, ["SIGLA", "DISPOSITIVO", "QTD"], linhasT, [14, 72, 12]) + 6;
      var notas = ["Tubos de PVC soldável (NBR 5648) enterrados em vala: sucção a " + f2(g.yBorda - rede.vala.ySuccao) + " m e retorno a " + f2(g.yBorda - rede.vala.yRetorno) + " m abaixo do deck.",
        "Retornos na parede oposta às coadeiras; ralos de fundo interligados por tê no meio (ramos iguais).", "Ver memorial de cálculo da piscina para vazões, DN e verificações; pendências na folha 05."];
      D.texto(lx, ly, "NOTAS", K.hTexto); ly += 4;
      notas.forEach(function (n) { A.quebrar ? A.quebrar(n, 46).forEach(function (q) { D.texto(lx, ly, q, K.hRot); ly += 3.2; }) : (D.texto(lx, ly, n.slice(0, 90), K.hRot), ly += 3.2); ly += 1; });
      /* hid:geometria-fim */
    })();

    /* ---------------- 02 CASA DE MÁQUINAS (planta ampliada) */
    (function () {
      /* hid:geometria-inicio */
      var F = novaFolha("casa", "PISCINA — CASA DE MÁQUINAS"), D = F.D;
      var c = Math.cos(cm.rotY), s = Math.sin(cm.rotY);
      function loc(x, z) { var dx = x - cm.x, dz = z - cm.z; return [dx * c - dz * s, dx * s + dz * c]; }
      var b = { x0: -casa.C / 2 - 0.8, y0: -casa.L / 2 - 0.8, x1: casa.C / 2 + 0.8, y1: casa.L / 2 + 0.8 };
      var jan = { x: ar.x + K.margem, y: ar.y + K.margem + 14, w: ar.w * 0.6, h: ar.h * 0.55 }, esc = escalaQueCabe(b.x1 - b.x0, b.y1 - b.y0, jan.w, jan.h), J = new Janela(b, jan, esc);
      F.escala = "1:" + esc;
      tituloVista(D, ar.x + K.margem, ar.y + K.margem + 4, "CASA DE MÁQUINAS — PLANTA (frente = lado da piscina, embaixo)", esc);
      var e = 0.12, hc = casa.C / 2, hl = casa.L / 2;
      D.ret(J.p(-hc - e, -hl - e)[0], J.p(-hc - e, -hl - e)[1], (casa.C + 2 * e) * J.k, (casa.L + 2 * e) * J.k, "HID-SIMBOLO");
      D.ret(J.p(-hc, -hl)[0], J.p(-hc, -hl)[1], casa.C * J.k, casa.L * J.k, "HID-SIMBOLO");
      D.ret(J.p(-hc, hl - casa.alcapao)[0], J.p(-hc, hl - casa.alcapao)[1], casa.alcapao * J.k, casa.alcapao * J.k, "HID-CONTEXTO", { dash: "2 1" });
      D.texto(J.p(-hc + 0.05, hl - casa.alcapao / 2)[0], J.p(-hc + 0.05, hl - casa.alcapao / 2)[1], "ALÇAPÃO " + f2(casa.alcapao), K.hRot);
      /* tubos dentro da casa */
      trs.forEach(function (t) {
        var a = loc(t.p1.x, t.p1.z), z = loc(t.p2.x, t.p2.z);
        if (Math.abs(a[0]) > hc + 0.7 || Math.abs(a[1]) > hl + 0.7) return;
        var pa = J.p(a[0], a[1]), pz = J.p(z[0], z[1]);
        if (Math.abs(pa[0] - pz[0]) < 0.05 && Math.abs(pa[1] - pz[1]) < 0.05) { D.circ(pa[0], pa[1], 0.9, "PISC-" + t.sistema); return; }
        D.linha(pa[0], pa[1], pz[0], pz[1], "PISC-" + t.sistema);
      });
      /* equipamentos */
      var lista = [], k = 0;
      fams.forEach(function (f) {
        var l = loc(f.x, f.z); if (Math.abs(l[0]) > hc + 0.2 || Math.abs(l[1]) > hl + 0.2) return;
        var p = J.p(l[0], l[1]), I = f.inst || {}, rot = (f.rotY || 0) - cm.rotY;
        k++;
        if (f.famId === "hid-pisc-filtro") D.circ(p[0], p[1], num(I.Diametro, 0.4) / 2 * J.k, "HID-SIMBOLO");
        else if (/hid-pisc-bomba/.test(f.famId)) { var C2 = num(I.Comprimento, 0.56) * J.k, L2 = num(I.Largura, 0.24) * J.k, hor = Math.abs(Math.cos(rot)) > 0.5; D.ret(p[0] - (hor ? C2 : L2) / 2, p[1] - (hor ? L2 : C2) / 2, hor ? C2 : L2, hor ? L2 : C2, "HID-SIMBOLO"); }
        else if (f.famId === "hid-pisc-registro" || f.famId === "hid-pisc-derivacao") D.cheio([[p[0] - 1, p[1] - 1], [p[0] + 1, p[1] + 1], [p[0] + 1, p[1] - 1], [p[0] - 1, p[1] + 1]], "#a3352b");
        else if (f.famId === "hid-pisc-quadro") D.ret(p[0] - 4, p[1] - 1, 8, 2, "HID-SIMBOLO");
        else { k--; return; }
        if (f.famId === "hid-pisc-registro" || f.famId === "hid-pisc-derivacao") return;
        D.texto(p[0], p[1] + 0.8, String(k), K.hTexto, { al: "C" });
        lista.push([String(k), FAMN(f.famId), txt(I.Produto) || "—", txt(I.Fonte) || "—"]);
      });
      var tx = ar.x + ar.w * 0.64, ty = ar.y + K.margem + 6;
      D.texto(tx, ty, "EQUIPAMENTOS", K.hTitulo * 0.8); ty += 4;
      ty = tabelaP(D, tx, ty, ["Nº", "EQUIPAMENTO", "PRODUTO", "FONTE (CATÁLOGO)"], lista, [8, 46, 46, 70]) + 6;
      D.texto(tx, ty, "REQUISITOS (NBR 10339, 5.2)", K.hTexto); ty += 4;
      arr(d.casaMaquinas && d.casaMaquinas.requisitos).forEach(function (r) { (A.quebrar ? A.quebrar(r, 78) : [r]).forEach(function (q) { D.texto(tx, ty, q, K.hRot); ty += 3.1; }); ty += 0.8; });
      var by = ar.y + ar.h * 0.62 + 10; D.texto(ar.x + K.margem, by, "Piso a " + f2(casa.yPiso) + " m; pé-direito interno " + f2(casa.H) + " m; " + (casa.nivel === "afogada" ? "bomba AFOGADA (eixo abaixo do nível da água)" : "bomba ACIMA do nível da água (autoescorvante)") + ".", K.hTexto);
      D.texto(ar.x + K.margem, by + 5, "Barrilete: um registro por linha de sucção (coadeira, aspiração, fundo, hidro) antes do pré-filtro; derivação do aquecimento com by-pass.", K.hTexto);
      /* hid:geometria-fim */
    })();

    /* ---------------- 03 CORTES */
    (function () {
      /* hid:geometria-inicio */
      var F = novaFolha("cortes", "PISCINA — CORTES"), D = F.D, E2 = g.eixo;
      var s0 = E2.s0, s1 = E2.s1, prof = Math.max(g.profRasa, g.profFunda) + (g.yBorda - g.yAgua);
      var b = { x0: s0 - 1.2, y0: -(g.yBorda + 0.6), x1: s1 + 1.2, y1: -(g.yBorda - prof - 0.8) };
      var jan = { x: ar.x + K.margem, y: ar.y + K.margem + 14, w: ar.w - 2 * K.margem, h: ar.h * 0.42 }, esc = escalaQueCabe(b.x1 - b.x0, b.y1 - b.y0, jan.w, jan.h), J = new Janela(b, jan, esc);
      F.escala = "1:" + esc;
      tituloVista(D, ar.x + K.margem, ar.y + K.margem + 4, "CORTE LONGITUDINAL A-A (pelo eixo maior da piscina)", esc);
      function P2(sv, y) { return J.p(sv, -y); }
      var yR = g.yBorda, yF0 = g.yAgua - (g.fundoInvertido ? g.profFunda : g.profRasa), yF1 = g.yAgua - (g.fundoInvertido ? g.profRasa : g.profFunda);
      D.poli([P2(s0 - 1, yR), P2(s0, yR), P2(s0, yF0), P2(s1, yF1), P2(s1, yR), P2(s1 + 1, yR)], "HID-SIMBOLO");
      var na0 = P2(s0, g.yAgua), na1 = P2(s1, g.yAgua); D.linha(na0[0], na0[1], na1[0], na1[1], "PISC-AGUA");
      D.texto(na1[0] - 22, na1[1] - 1, "N.A. " + f2(g.yAgua), K.hRot, { cor: "#1E6FD9" });
      D.texto(P2(s0, yR)[0] - 2, P2(s0, yR)[1] - 1.5, "DECK " + f2(yR), K.hRot, { al: "D" });
      D.texto(P2(s0, yF0)[0] + 2, P2(s0, yF0)[1] - 1, "FUNDO " + f2(yF0), K.hRot);
      D.texto(P2(s1, yF1)[0] - 2, P2(s1, yF1)[1] - 1, "FUNDO " + f2(yF1), K.hRot, { al: "D" });
      /* dispositivos projetados no plano do corte (s = posição ao longo do eixo) */
      var cont = {};
      arr(rede.dispositivos).forEach(function (dv) {
        var sv = dv.x * E2.u.x + dv.z * E2.u.z, p = P2(sv, dv.y), sg = SIGLA_DISP[dv.tipo] || "D"; cont[sg] = (cont[sg] || 0) + 1;
        D.circ(p[0], p[1], 0.9, "HID-SIMBOLO"); D.texto(p[0] + 1.3, p[1] - 0.8, sg + cont[sg] + " " + f2(dv.y), K.hRot * 0.85);
      });
      /* corte da casa de máquinas: x local × y */
      var b2 = { x0: -casa.C / 2 - 0.8, y0: -(g.yBorda + 0.6), x1: casa.C / 2 + 0.8, y1: -(casa.yPiso - 0.4) };
      var jan2 = { x: ar.x + K.margem, y: ar.y + ar.h * 0.52, w: ar.w * 0.55, h: ar.h * 0.42 }, esc2 = escalaQueCabe(b2.x1 - b2.x0, b2.y1 - b2.y0, jan2.w, jan2.h), J2 = new Janela(b2, jan2, esc2);
      tituloVista(D, jan2.x, jan2.y - 8, "CORTE B-B — CASA DE MÁQUINAS (vista de frente para a piscina)", esc2);
      function Q2(xl, y) { return J2.p(xl, -y); }
      var hc = casa.C / 2;
      D.poli([Q2(-hc - 0.12, g.yBorda), Q2(-hc - 0.12, casa.yPiso - 0.12), Q2(hc + 0.12, casa.yPiso - 0.12), Q2(hc + 0.12, g.yBorda)], "HID-SIMBOLO");
      D.poli([Q2(-hc, g.yBorda - 0.12), Q2(-hc, casa.yPiso), Q2(hc, casa.yPiso), Q2(hc, g.yBorda - 0.12)], "HID-CONTEXTO");
      var n0 = Q2(-hc - 0.6, g.yAgua), n1 = Q2(hc + 0.6, g.yAgua); D.linha(n0[0], n0[1], n1[0], n1[1], "PISC-AGUA"); D.texto(n1[0], n1[1] - 1, "N.A. DA PISCINA " + f2(g.yAgua), K.hRot, { cor: "#1E6FD9", al: "D" });
      var c = Math.cos(cm.rotY), s = Math.sin(cm.rotY);
      fams.forEach(function (f) {
        var dx = f.x - cm.x, dz = f.z - cm.z, xl = dx * c - dz * s, zl = dx * s + dz * c, I = f.inst || {};
        if (Math.abs(xl) > hc + 0.1 || Math.abs(zl) > casa.L / 2 + 0.1) return;
        if (f.famId === "hid-pisc-filtro") { var Dd = num(I.Diametro, 0.43), Hh = num(I.Altura, 0.86), a = Q2(xl - Dd / 2, f.y + Hh); D.ret(a[0], a[1], Dd * J2.k, Hh * J2.k, "HID-SIMBOLO"); D.texto(a[0] + Dd * J2.k / 2, a[1] - 1, "FILTRO", K.hRot, { al: "C" }); }
        else if (/hid-pisc-bomba/.test(f.famId)) { var Cc = num(I.Comprimento, 0.56), Ha = num(I.Altura, 0.3), a2 = Q2(xl - Cc / 2, f.y + Ha); D.ret(a2[0], a2[1], Cc * J2.k, Ha * J2.k, "HID-SIMBOLO"); D.texto(a2[0] + Cc * J2.k / 2, a2[1] - 1, f.famId === "hid-pisc-bomba" ? "BOMBA" : (f.famId === "hid-pisc-bomba-hidro" ? "BOMBA HIDRO" : "BOMBA AQUEC."), K.hRot, { al: "C" }); }
      });
      if (d.npsh) D.texto(jan2.x + jan2.w + 8, jan2.y + 6, "Eixo da bomba " + (d.npsh.desnivel >= 0 ? f2(d.npsh.desnivel) + " m ABAIXO" : f2(-d.npsh.desnivel) + " m ACIMA") + " do N.A. — NPSH disponível " + f2(d.npsh.disp) + " m", K.hTexto);
      /* hid:geometria-fim */
    })();

    /* ---------------- 04 ISOMÉTRICO */
    (function () {
      /* hid:geometria-inicio */
      var F = novaFolha("iso", "PISCINA — ISOMÉTRICO DAS TUBULAÇÕES"), D = F.D, a = K.isoAng * Math.PI / 180;
      function iso(p) { return [(p.x - p.z) * Math.cos(a), -(p.y) - (p.x + p.z) * Math.sin(a) * 0]; }
      function isoP(p) { return [(p.x - p.z) * Math.cos(a), -p.y + (p.x + p.z) * Math.sin(a)]; }
      var pts = []; trs.forEach(function (t) { pts.push(isoP(t.p1)); pts.push(isoP(t.p2)); }); g.contorno.forEach(function (p) { pts.push(isoP({ x: p.x, y: g.yBorda, z: p.z })); });
      if (!pts.length) return; void iso;
      var b = caixaDe(pts); b.x0 -= 0.8; b.y0 -= 0.8; b.x1 += 0.8; b.y1 += 0.8;
      var jan = { x: ar.x + K.margem, y: ar.y + K.margem + 14, w: ar.w - 2 * K.margem, h: ar.h - 2 * K.margem - 30 }, esc = escalaQueCabe(b.x1 - b.x0, b.y1 - b.y0, jan.w, jan.h), J = new Janela(b, jan, esc);
      F.escala = "SEM ESCALA";
      tituloVista(D, ar.x + K.margem, ar.y + K.margem + 4, "ISOMÉTRICO DAS TUBULAÇÕES DA PISCINA (sem escala)", null);
      D.poli(g.contorno.map(function (p) { var q = isoP({ x: p.x, y: g.yBorda, z: p.z }); return J.p(q[0], q[1]); }), "HID-CONTEXTO", true);
      trs.forEach(function (t) { var p1 = isoP(t.p1), p2 = isoP(t.p2), A1 = J.p(p1[0], p1[1]), A2 = J.p(p2[0], p2[1]); D.linha(A1[0], A1[1], A2[0], A2[1], "PISC-" + t.sistema); });
      var rot = {};
      arr(rede.linhas).forEach(function (l) {
        var ts = trs.filter(function (t) { return t.piscLinha === l.id; }); if (!ts.length) return;
        var t = ts[Math.floor(ts.length / 2)], m = isoP({ x: (t.p1.x + t.p2.x) / 2, y: (t.p1.y + t.p2.y) / 2, z: (t.p1.z + t.p2.z) / 2 }), q = J.p(m[0], m[1]);
        var k = Math.round(q[0]) + "|" + Math.round(q[1]); if (rot[k]) return; rot[k] = 1;
        D.texto(q[0] + 1, q[1] - 1, l.id.replace(/^[^-]*-/, "").toUpperCase() + " Ø" + l.dn, K.hRot, { cor: K.cores[l.sistema] });
      });
      var ly = ar.y + ar.h - 26, lx = ar.x + K.margem;
      Object.keys(K.cores).forEach(function (s, i) { D.linha(lx + i * 48, ly, lx + i * 48 + 10, ly, "PISC-" + s); D.texto(lx + i * 48 + 12, ly + 1, NOME_SIS[s], K.hTexto); });
      /* hid:geometria-fim */
    })();

    /* ---------------- 05 DETALHES, VERIFICAÇÕES E PENDÊNCIAS */
    (function () {
      /* hid:geometria-inicio */
      var F = novaFolha("detalhes", "PISCINA — DETALHES TÍPICOS, VERIFICAÇÕES E PENDÊNCIAS"), D = F.D, x0 = ar.x + K.margem, y0 = ar.y + K.margem + 4;
      tituloVista(D, x0, y0, "DETALHES TÍPICOS DOS DISPOSITIVOS (sem escala; alturas do projeto)", null);
      var w = 60, hgt = 50, yy = y0 + 14;
      function det(ix, titulo, desenha) { var x = x0 + ix * (w + 8); D.ret(x, yy, w, hgt, "HID-TABELA"); D.texto(x + 2, yy + 4, titulo, K.hTexto); desenha(x, yy); }
      var yA = g.yAgua, nk = function (dv) { return arr(rede.dispositivos).filter(function (q) { return q.tipo === dv; })[0]; };
      function parede(x, y) { D.ret(x + 30, y + 10, 4, 36, "HID-SIMBOLO"); D.linha(x + 2, y + 16, x + 30, y + 16, "PISC-AGUA"); D.texto(x + 3, y + 15, "N.A.", K.hRot, { cor: "#1E6FD9" }); }
      det(0, "RETORNO", function (x, y) { parede(x, y); var r = nk("retorno"); var dy = r ? (yA - r.y) : 0; D.circ(x + 32, y + 16 + dy * 30, 1.5, "PISC-pisc_retorno"); D.texto(x + 3, y + 16 + dy * 30 + 1, f2(dy) + " m abaixo do N.A.", K.hRot); D.linha(x + 34, y + 16 + dy * 30, x + 56, y + 16 + dy * 30, "PISC-pisc_retorno"); });
      det(1, "ASPIRAÇÃO", function (x, y) { parede(x, y); var r = nk("aspiracao"); var dy = r ? (yA - r.y) : 0; D.circ(x + 32, y + 16 + dy * 30, 1.8, "PISC-pisc_succao"); D.texto(x + 3, y + 16 + dy * 30 + 1, f2(dy) + " m abaixo do N.A.", K.hRot); D.linha(x + 34, y + 16 + dy * 30, x + 56, y + 16 + dy * 30, "PISC-pisc_succao"); D.texto(x + 3, y + 46, "tampa de fechamento automático", K.hRot); });
      det(2, "COADEIRA (SKIMMER)", function (x, y) { parede(x, y); D.ret(x + 34, y + 12, 16, 22, "HID-SIMBOLO"); D.texto(x + 35, y + 11, "boca no N.A.", K.hRot); D.linha(x + 42, y + 34, x + 42, y + 44, "PISC-pisc_succao"); D.texto(x + 3, y + 46, "barragem flutuante e cesto", K.hRot); });
      det(3, "RALO DE FUNDO (2 un, interligados)", function (x, y) { D.linha(x + 4, y + 30, x + 56, y + 30, "HID-SIMBOLO"); D.ret(x + 22, y + 30, 16, 8, "HID-SIMBOLO"); D.linha(x + 38, y + 35, x + 56, y + 35, "PISC-pisc_succao"); D.texto(x + 4, y + 26, "grelha antiaprisionamento (≤ 7 mm, 0,5 m/s)", K.hRot); D.texto(x + 4, y + 44, "distância grelha → tubo ≥ 1,5 D; c/c ≥ " + f2(d.dispositivos.distanciaRalos) + " m", K.hRot); });
      if (d.hidro) det(4, "BOCAL DE HIDROMASSAGEM", function (x, y) { parede(x, y); var r = nk("hidro"); var dy = r ? (yA - r.y) : 0; D.circ(x + 32, y + 16 + dy * 30, 1.5, "PISC-pisc_hidro"); D.texto(x + 3, y + 16 + dy * 30 + 1, f2(dy) + " m (máx. " + f2(d.hidro.prof_max) + ")", K.hRot); D.linha(x + 34, y + 16 + dy * 30, x + 56, y + 16 + dy * 30, "PISC-pisc_hidro"); });
      /* verificações e pendências */
      var ty = yy + hgt + 14;
      D.texto(x0, ty, "VERIFICAÇÕES (memorial de cálculo da piscina)", K.hTexto); ty += 4;
      ty = tabelaP(D, x0, ty, ["VERIFICAÇÃO", "VALOR", "LIMITE", "SITUAÇÃO"], arr(rede.verificacoes).slice(0, 30).map(function (v) { return [v.nome, v.valor + " " + v.unidade, v.limite, STATUS[v.status] || v.status]; }), [150, 30, 54, 26]) + 8;
      D.texto(x0, ty, "PENDÊNCIAS", K.hTexto, { cor: "#a3352b" }); ty += 4;
      arr(rede.pendencias).slice(0, 24).forEach(function (p) { (A.quebrar ? A.quebrar("• " + p.motivo, 150) : [p.motivo]).forEach(function (q) { D.texto(x0, ty, q, K.hRot, { cor: "#a3352b" }); ty += 3.1; }); });
      /* hid:geometria-fim */
    })();

    function FAMN(id) { var FM = dep("HidPiscinaFam", "./hidpiscinafam.js"), f = FM && FM.porId(id); return f ? f.nome : id; }
    void FAMN;
    /* carimbo RA (o MESMO das pranchas do hidrossanitário) */
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, codigo = opcoes.codigo || prefixo;
    var pr = P.normalizar({ id: "hidpiscina", nome: "Projeto da piscina", formato: formato, orientacao: "paisagem", origem: "hidro",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local), codigo: codigo, data: data, revisoes: [[rev.replace(/^R/i, "") || "00", "EMISSÃO INICIAL", data]] },
      folhas: defs.map(function (f, i) { return { id: f.id, n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var folhas = defs.map(function (f, i) {
      var W = geo.papel.w, Hp = geo.papel.h, M = geo.moldura, Fd = new A.Desenho(E, null), rot = ("0" + (i + 1)).slice(-2), numero = prefixo + "-" + rot;   // hid:ok número da folha com 2 dígitos
      Fd.ret(M.x, M.y, M.w, M.h, "HID-MOLDURA");
      A.carimbo(Fd, pr, pr.folhas[i], geo, empObj, opcoes.logo || null, rot + "/" + ("0" + defs.length).slice(-2));   // hid:ok idem
      var nn = function (v) { return (Math.round(v * 100) / 100).toString(); };   // hid:ok 2 casas
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + nn(W) + 'mm" height="' + nn(Hp) + 'mm" viewBox="0 0 ' + nn(W) + " " + nn(Hp) + '" font-family="' + (A.FONTE || "Arial") + '" data-folha="pisc-' + esc(f.id) + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + f.titulo + " - " + rev) + "</title><rect x=\"0\" y=\"0\" width=\"" + nn(W) + "\" height=\"" + nn(Hp) + "\" fill=\"#fff\"/><g data-corpo=\"1\">" + f.D.svg() + "</g><g data-folha-moldura=\"1\">" + Fd.svg() + "</g></svg>";
      if (/NaN|undefined/.test(svg)) avisos.push("Folha " + numero + ": há valor inválido no desenho.");
      return { id: "pisc-" + f.id, rotulo: rot, numero: numero, titulo: f.titulo, tipo: "piscina", grupo: "piscina", formato: formato, escala: f.escala, svg: svg, caixasTexto: f.D.caixas || [] };
    });
    return { ok: true, folhas: folhas, avisos: avisos, prefixo: prefixo, revisao: rev };
  }

  /* os blocos que o "Gerar documentos" das outras frentes acrescenta ao memorial e ao manual (gancho do js/hidpiscinaui.js) */
  function secoes(rede, info) {
    var m = memorial(rede, info), u = manual(rede, info);
    function corpo(h) { var a = h.indexOf("<body>"), b = h.lastIndexOf("</body>"); return a >= 0 && b > a ? h.slice(a + 6, b) : h; }   // hid:ok apresentação (índice de coluna, fatia de lista)
    return { ok: m.ok && u.ok, memorial: m.ok ? "<section data-piscina=\"memorial\" style=\"page-break-before:always\">" + corpo(m.html) + "</section>" : "", manual: u.ok ? "<section data-piscina=\"manual\" style=\"page-break-before:always\">" + corpo(u.html) + "</section>" : "" };
  }

  /* PROJETO EM UM CLIQUE (frente C, 19/10/2026): memorial + lista de material + pranchas num documento só — o "Traçar
     automaticamente" e o botão "Projeto da piscina em um clique" abrem este (a planilha .xlsx segue no botão dela) */
  function pacote(estado, avaliarFam, rede, info, opcoes) {
    var m = memorial(rede, info); if (!m.ok) return { ok: false, motivo: m.motivo };
    var I = info || {}, o = opcoes || {}, q = quantitativo(estado, avaliarFam, rede), pr = null;
    try { pr = pranchas(estado, rede, { obra: o.obra || (I.obra || {}).nome, responsavel: o.responsavel || (I.responsavel || {}).nome, registro: o.registro || (I.responsavel || {}).crea, empresa: o.empresa || (I.empresa || {}).nome }); } catch (e) { pr = { ok: false, avisos: [String(e && e.message || e)] }; }
    var lista = "<h2>Lista de material</h2>" + tabela(["Grupo", "Descrição", "Un.", "Qtd.", "SINAPI", "Situação"], q.linhas.map(function (l) { return [l.grupo, l.descricao, l.unidade, l.quantidade, l.codigo, l.status]; }), [3]);   // hid:ok índice da coluna numérica
    var folhas = pr && pr.ok ? pr.folhas.map(function (f) { return "<div style=\"margin:8px 0\">" + f.svg + "</div>"; }).join("") : "<p class=\"pend\">Pranchas não geradas: " + esc(arr(pr && pr.avisos).join("; ")) + "</p>";
    var html = m.html.replace(/<\/body>/i, "<div style=\"page-break-before:always\">" + lista + "</div><div style=\"page-break-before:always\"><h2>Pranchas</h2>" + folhas + "</div></body>");
    return { ok: true, titulo: "Projeto da piscina — memorial, lista de material e pranchas", html: html, memorial: m, quantitativo: q, pranchas: pr };
  }
  var HidPiscinaDoc = { VERSAO: 1, memorial: memorial, manual: manual, quantitativo: quantitativo, planilha: planilha, pranchas: pranchas, secoes: secoes, pacote: pacote, K: K };
  global.HidPiscinaDoc = HidPiscinaDoc;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPiscinaDoc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
