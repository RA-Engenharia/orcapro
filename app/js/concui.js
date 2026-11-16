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
  function prelancar(modo) { return lancar(modo, null, "Pré-lançar estrutura (concreto)"); }

  /* ----------------------------------------------------------- SUGERIR ESTRUTURA (S2, 14/11/2026)
     O mesmo lançador (um só), agora com o auditor de precisão BLOQUEANTE (s1), a viga baldrame e a opção de PROJETO do pilar de 12 a 14 cm
     (desligada por padrão: decisão do Rogério, 14/11/2026). Guardada por obra no aparelho: o texto do memorial e a marca laranja dependem dela. */
  function obraKey() { var G = global.Gestao; return String((G && G._bimSel) || "geral"); }
  function lerOpcao() { try { var v = JSON.parse(global.localStorage.getItem("orcapro:conc:opc:" + obraKey()) || "null"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function gravarOpcao(o) { try { global.localStorage.setItem("orcapro:conc:opc:" + obraKey(), JSON.stringify(o)); return true; } catch (e) { return false; } }
  function permitirPilar12() { return lerOpcao().permitirPilar12 === true; }
  function definirPilar12(on) { var o = lerOpcao(); o.permitirPilar12 = !!on; return gravarOpcao(o) ? !!on : permitirPilar12(); }
  /* o que cada bloqueio do auditor de precisão significa, em palavras simples (regra do dono: todo problema tem o que é + Corrigir + Mostrar no 3D) */
  var S1_TIT = { "S1-01": "Pilar fora da parede", "S1-02": "Pilar em vão de porta ou janela", "S1-03": "Pilar fora de prumo entre os pavimentos", "S1-04": "Viga sem apoio", "S1-05": "Eixos a menos de 30 cm um do outro", "S1-06": "Pilar abaixo da seção mínima" };
  var S1_QUE = {
    "S1-01": "O pilar sugerido ficaria para fora da parede que ele deveria acompanhar. O pré-lançamento não aplica um pilar fora do lugar.",
    "S1-02": "O pilar sugerido cairia onde há porta ou janela. O pré-lançamento não aplica pilar dentro de vão.",
    "S1-03": "O pilar de um pavimento não está na mesma prumada do pilar de baixo.",
    "S1-04": "Uma viga sugerida termina sem pilar nem outra viga que a apoie (só a ponta livre do balanço é permitida).",
    "S1-05": "Duas paredes do mesmo alinhamento estão a menos de 30 cm uma da outra, e a grade de eixos ficaria confusa.",
    "S1-06": "A seção do pilar ficou abaixo do mínimo da NBR 6118:2023 (lado de 14 cm e área de 360 cm²)."
  };
  function problemasDosBloqueios(res, extra) {
    return arr(res.auditoria && res.auditoria.bloqueios).map(function (b) {
      var sol = [];
      if (b.id === "S1-05") sol.push({ id: "juntar", texto: "O melhor é juntar as paredes que estão a menos de 30 cm (ou apagar a duplicada) e rodar o Sugerir estrutura de novo", pecas: arr(b.pecas) });   /* sem botão: não há como o sistema escolher qual parede vale */
      sol.push({ id: "assim-mesmo", texto: "Lançar assim mesmo e deixar este ponto no Auditar (o lote é aplicado; um Ctrl+Z desfaz tudo)", pecas: arr(b.pecas) });
      if (b.id === "S1-06" && !permitirPilar12() && !(extra && extra.permitirPilar12)) sol.push({ id: "pilar12", texto: "Ligar a opção do projeto “Permitir pilar 12–14 cm (fora da NBR 6118:2023)”: decisão do responsável técnico, entra no memorial", pecas: arr(b.pecas) });
      return { tipo: b.id, titulo: S1_TIT[b.id] || b.id, texto: S1_QUE[b.id] ? S1_QUE[b.id] + " " + b.texto : b.texto, gravidade: "erro", pecas: arr(b.pecas), solucoes: sol };
    });
  }
  function aoCorrigirBloqueio(solId) {
    if (solId === "pilar12") { definirPilar12(true); status("Opção ligada: pilar de 12 a 14 cm (fora da NBR 6118:2023, decisão do RT)."); return sugerir(); }
    if (solId === "assim-mesmo") return sugerir({ assimMesmo: true });
    return null;
  }
  function janelaBloqueios(T, res, extra) {
    var PC = global.ProblemaCard, probs = problemasDosBloqueios(res, extra);
    var html = faixa() + "<p><b>Nada foi aplicado.</b> O auditor de precisão achou " + probs.length + " ponto(s) que impedem o lançamento. Cada um diz o que é e como corrigir:</p>" +
      (PC ? PC.lista(probs, { titulo: "Bloqueios do auditor de precisão (" + probs.length + ")", gravidade: "erro", prefixoIndice: "e", acoes: function (s) { return s && (s.id === "assim-mesmo" || s.id === "pilar12") ? (s.texto || true) : false; } }) : lista("Bloqueios", probs.map(function (p) { return p.titulo + " — " + p.texto; }))) +
      lista("Avisos", res.avisos);
    var ov = janela(T, html);
    if (ov && PC) PC.ligar(ov, { corrigir: aoCorrigirBloqueio, mostrar: function (ids) { PC.mostrarNo3D(ids); } });
    status("Sugerir estrutura: o auditor de precisão bloqueou (" + probs.length + ").");
  }
  function sugerir(o) {
    o = o || {};
    return lancar("auto", { s1: o.assimMesmo ? false : true, baldrame: true, permitirPilar12: permitirPilar12(), assimMesmo: !!o.assimMesmo }, "Sugerir estrutura");
  }

  /* ----------------------------------------------------------- VISTA DE ESTRUTURA (S2, 14/11/2026)
     Criada sempre que se lança ou se altera estrutura: um registro de folhas por obra (origem "estrutura-vista", sempre o MESMO id — gerar de novo
     SUBSTITUI as folhas, nunca duplica) nas abas de folha do BIM. Regenera quando o modelo muda: a assinatura (js/concvista.js) das peças e paredes
     fica gravada no registro e um vigia leve compara quando o editor mexe. Tudo sai do modelo (ConcLanc.dadosDoModelo); a folha leva o rótulo de pré-dimensionamento. */
  var ORIGEM_VISTA = "estrutura-vista";
  function BF() { return global.BimFolhaUI || null; }
  function dataUrlSvg(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
  function registroDaVista() { var b = BF(); if (!b || !b.registros) return null; try { return arr(b.registros()).filter(function (x) { return x && x.origem === ORIGEM_VISTA; })[0] || null; } catch (e) { return null; } }
  function ctxCarimbo() {
    var em = {}, ob = {}, logo = null, G = global.Gestao;
    try { if (global.Empresa && global.Empresa.dados) em = global.Empresa.dados() || {}; if (global.Empresa && global.Empresa.logo) logo = global.Empresa.logo(); } catch (e1) { /* sem empresa */ }
    try { if (G && G._bimSel && global.Store && global.Auth) ob = global.Store.obter(global.Auth.empresaId(), "obras", G._bimSel) || {}; } catch (e2) { /* sem obra */ }
    return { empresa: em, obra: ob, logo: logo, obraId: String((G && G._bimSel) || "") };
  }
  function registroFolhas(r, existente, ctx, ass) {
    var folhas = r.folhas.map(function (f, i) { return { id: "est-" + f.id, n: i + 1, conteudo: f.numero + " - " + f.titulo, escala: f.escala, blocos: [], imagemInteira: "estsvg:" + f.id }; });
    var reg = { nome: "Vista de Estrutura", origem: ORIGEM_VISTA, formato: r.formato, orientacao: "paisagem", carimbo: { modelo: "RA" }, folhas: folhas, assinaturaModelo: ass };
    if (existente && existente.id) { reg.id = existente.id; reg.criadoEm = existente.criadoEm; }
    reg.obraId = txt(ctx && ctx.obraId);
    return reg;
  }
  function txt(v) { return v == null ? "" : String(v); }
  function vistaEstrutura(o) {
    o = o || {};
    var V = global.ConcVista, C = CL(), b = BF(), st = estado();
    if (!V || !C || !st || !b || !b.salvarRegistro) return { ok: false, motivo: "A vista de estrutura precisa do editor 3D e das abas de folha abertos." };
    var ass = V.assinatura(st), exist = registroDaVista();
    if (!o.forcar && exist && exist.assinaturaModelo === ass) return { ok: true, igual: true, registro: exist.id };
    var d = C.dadosDoModelo(st, { avaliarFam: avaliar(), categoriaFam: catFam(), niveis: niveis() });
    if (!d.ok) return { ok: false, motivo: d.motivo };
    var cx = ctxCarimbo(), em = cx.empresa || {}, ob = cx.obra || {};
    var r = V.gerar({ estado: st, res: d }, { empresa: em.nome ? em : "", responsavel: txt(em.responsavel), registro: txt(em.crea), tituloProfissional: txt(em.titulo), obra: txt(ob.nome),
      proprietario: txt(ob.clienteNome), contratante: txt(ob.clienteNome), local: txt(ob.local || ob.endereco), logo: cx.logo || null });
    if (!r.ok) return { ok: false, motivo: arr(r.avisos).join(" ") };
    var salvo = b.salvarRegistro(registroFolhas(r, exist, cx, ass));
    if (!salvo) return { ok: false, motivo: "Não consegui guardar as folhas da vista de estrutura neste aparelho." };
    b._imagensExternas = b._imagensExternas || {};
    r.folhas.forEach(function (f) { b._imagensExternas["estsvg:" + f.id] = dataUrlSvg(f.svg); });
    r.registro = salvo.id; r.primeira = b.idFolha ? b.idFolha(salvo.id, "est-" + r.folhas[0].id) : null; r.assinatura = ass;
    if (o.abrir && r.primeira) { try { if (b.ativo && b.ativo()) b.abrir(r.primeira); } catch (eA) { /* sem a casca do BIM: fica no registro */ } }
    var v = r.verificacao || {};
    status("Vista de Estrutura: " + r.folhas.length + " folha(s) · sobreposição: texto×texto " + v.textoTexto + ", texto×linha " + v.textoLinha + ", fora da moldura " + v.foraJanela + (o.abrir ? "" : " — abra em Estrutura › Vista de estrutura."));
    return r;
  }
  /* o vigia leve: só compara a assinatura quando o editor mexeu (conta barata primeiro) e só refaz se já existe vista nesta obra */
  var VIGIA = { cheap: null, timer: null };
  function chaveBarata() { var o = ops(), u = o.length ? o[o.length - 1] : null; return o.length + ":" + (u ? (u.id || u.op || "") : ""); }
  function vigiarVista() {
    var cheap = chaveBarata(); if (cheap === VIGIA.cheap) return false;
    VIGIA.cheap = cheap;
    var reg = registroDaVista(); if (!reg || !global.ConcVista) return false;
    var st = estado(); if (!st || global.ConcVista.assinatura(st) === reg.assinaturaModelo) return false;
    var r = vistaEstrutura({ forcar: true }); return !!(r && r.ok && !r.igual);
  }
  function ligarVigia() {
    if (VIGIA.timer || typeof setInterval !== "function" || typeof document === "undefined") return false;
    VIGIA.timer = setInterval(function () { try { vigiarVista(); } catch (e) { /* o vigia nunca derruba a tela */ } }, 4000);
    return true;
  }

  /* ----------------------------------------------------------- OCULTAR ARQUITETURA e CALCULAR (S2, 14/11/2026, etapa 8)
     Ocultar = visibilidade por CATEGORIA do foco de disciplina (js/bimfoco.js): é só gráfico de vista, nunca de dado. A categoria "Lajes e pisos" fica de fora de propósito:
     a laje de concreto lançada é IfcSlab, a mesma classe do piso da arquitetura, e esconder a categoria esconderia a estrutura junto.
     Calcular = C1–C4 (js/conccalcular.js) sobre o que está lançado; cada peça fica VERDE (atende), VERMELHA (reprovada) ou LARANJA (pilar de 12 a 14 cm: atende na conta,
     mas fora da NBR 6118:2023), pintada por BIM.pintarUids; a vermelha traz a seção sugerida, que se aplica com 1 clique (a operação grava a seção ABSOLUTA: idempotente). */
  function catsArquitetura() { var F = global.BimFoco; return F && F.CATEGORIAS ? F.CATEGORIAS.filter(function (c) { return c.disc === "arquitetura" && c.id !== "lajes"; }).map(function (c) { return c.id; }) : []; }
  function arquiteturaOculta() {
    var B = global.BIM, ids = catsArquitetura(); if (!B || !B.foco || !ids.length) return false;
    var f = B.foco(); return ids.every(function (id) { return f.cats && f.cats[id] && f.cats[id].vis === false; });
  }
  function ocultarArquitetura(on) {
    var B = global.BIM, ids = catsArquitetura();
    if (!B || !B.foco || !ids.length) { status("O editor 3D não está aberto."); return null; }
    var quer = on == null ? !arquiteturaOculta() : !!on, cats = {};
    ids.forEach(function (id) { cats[id] = { vis: !quer }; });
    var r = B.foco({ cats: cats });
    status(quer ? "Arquitetura oculta (" + (r && r.ocultas != null ? r.ocultas : "?") + " peça(s)); a estrutura fica sozinha. Clique de novo para mostrar." : "Arquitetura visível de novo.");
    return { oculta: quer, ocultas: r ? r.ocultas : null };
  }
  var ULTIMO_CALC = null;
  function estadoRotulo(p) { var K = global.ConcCalcular; return K && K.ROTULO_ESTADO[p.estado] || p.estado; }
  function problemasDoCalculo(r) {
    var K = global.ConcCalcular, nome = { pilar: "Pilar", viga: "Viga", laje: "Laje" };
    return arr(r.pecas).filter(function (p) { return p.estado === "falha" || p.estado === "fora-norma"; }).map(function (p) {
      var apr = p.aproveitamento != null && isFinite(p.aproveitamento) ? " (aproveitamento " + f2(p.aproveitamento) + ")" : "";
      if (p.estado === "fora-norma") return { tipo: "calc-12", titulo: nome[p.tipo] + " " + p.marca + " " + p.secao + " — LARANJA", gravidade: "aviso", pecas: [p.id], solucoes: [{ id: "nota", texto: "A peça atende na conta (γn estendido, área ≥ 360 cm²), mas a NBR 6118:2023 (13.2.3) NÃO cobre pilar abaixo de 14 cm. O uso é decisão do responsável técnico e entra no memorial; para voltar à norma, aumente a seção." }],
        texto: "Pilar de 12 a 14 cm: habilitado pela opção do projeto. " + (p.motivo || "") };
      var sol = []; if (p.sugestao) sol.push({ id: "secao", texto: p.sugestao.texto, ops: p.sugestao.ops, pecas: p.sugestao.pecas || [p.id] }); else sol.push({ id: "nota", texto: "O motor não achou uma seção que feche: o engenheiro concebe outra solução (vão, apoio ou altura)." });
      return { tipo: "calc-" + p.tipo, titulo: nome[p.tipo] + " " + p.marca + " " + p.secao + " — REPROVADO" + apr, gravidade: "erro", pecas: [p.id], solucoes: sol,
        texto: "Não atende nas verificações do cálculo de apoio (C1–C4). " + (p.motivo || "") };
    });
  }
  function aplicarSugestao(sol, p) {
    if (!sol || !arr(sol.ops).length) return false;
    var ok = aplicar({ op: "lote", id: "conc-sug-" + (p && p.id ? p.id : "x") + "-" + String(p && p.sugestao ? p.sugestao.secao : "").replace(/[^0-9x]+/g, "x"), origem: "conc-calcular", pedido: ("Seção sugerida pelo Calcular: " + sol.texto).slice(0, 300), ops: sol.ops });
    if (ok) { status("Seção aplicada: " + sol.texto + " (Ctrl+Z desfaz). Calculando de novo…"); try { vistaEstrutura({ forcar: true }); } catch (eV) { /* o vigia refaz */ } }
    return ok;
  }
  /* ⚠ O "CALCULAR" NA TELA NUNCA RODA EM LAÇO SÍNCRONO (14/11/2026): sobrado de 18 pilares levava ~20 s com o navegador congelado. Com tela (document), o cálculo é a fila de
   * passos de ConcCalcular.iniciar(), um passo por setTimeout, com barra de progresso e "Cancelar". Sem tela (teste em Node) ou sem iniciar(), cai no caminho síncrono de
   * sempre — o mesmo resultado. CALCULANDO impede dois cálculos ao mesmo tempo (clique duplo). */
  var CALCULANDO = null;
  function calcular() {
    var T = "Calcular estrutura (C1–C4)";
    if (trancou(T)) return null;
    var st = estado(), K = global.ConcCalcular; if (!st || !K) { status("O editor 3D não está aberto."); return null; }
    if (CALCULANDO) { status("O cálculo já está rodando — aguarde ou cancele."); return null; }
    var opcCalc = { ops: ops(), niveis: niveis(), permitirPilar12: permitirPilar12() };
    if (typeof document === "undefined" || !K.iniciar || typeof setTimeout !== "function") {
      status("Calculando a estrutura (pórtico, vigas, lajes e pilares)… pode levar alguns segundos.");
      return mostrarCalculo(K.rodar(st, opcCalc), T);
    }
    var tarefa = K.iniciar(st, opcCalc), cancelado = false, ov = null, t0 = Date.now();
    function pintarProgresso() {
      var feitos = tarefa.feitos || 0, total = feitos + (tarefa.restantes ? tarefa.restantes() : 0), pct = total ? Math.round(100 * feitos / total) : 0;
      status("Calculando… " + pct + "% (" + (tarefa.rotulo || "iniciando") + ")");
      var barra = ov && ov.querySelector ? ov.querySelector("[data-conc-prog]") : null, txt = ov && ov.querySelector ? ov.querySelector("[data-conc-prog-txt]") : null;
      if (barra) barra.style.width = pct + "%"; if (txt) txt.textContent = pct + "% — " + (tarefa.rotulo || "iniciando") + " (" + Math.round((Date.now() - t0) / 1000) + " s)";
    }
    CALCULANDO = tarefa;
    ov = janela(T, '<p>Calculando a estrutura (pórtico, vigas, lajes e pilares). A tela continua livre: o cálculo roda em pedaços.</p>' +
      '<div style="height:12px;border-radius:6px;background:rgba(127,127,127,.25);overflow:hidden;margin:8px 0"><div data-conc-prog style="height:100%;width:0;background:#2e9e4f;transition:width .15s"></div></div>' +
      '<p data-conc-prog-txt style="margin:0 0 8px;font-size:12px">0%</p><button type="button" class="btn sm" data-conc-cancelar>Cancelar o cálculo</button>');
    if (ov) ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-conc-cancelar") || t.hasAttribute("data-conc-fechar") || t === ov) { if (CALCULANDO === tarefa && !tarefa.feito) { cancelado = true; CALCULANDO = null; status("Cálculo cancelado. Nada foi pintado nem alterado no modelo."); } }
    });
    function andar() {
      if (cancelado) return;
      var fim = Date.now() + 40;   /* dá pra juntar passos curtos (laje, viga) numa fatia; um pilar já passa disso e devolve a vez à tela */
      do { tarefa.passo(); } while (!tarefa.feito && Date.now() < fim);
      if (cancelado) return;
      if (!tarefa.feito) { pintarProgresso(); setTimeout(andar, 0); return; }
      CALCULANDO = null;
      mostrarCalculo(tarefa.resultado, T);
    }
    setTimeout(andar, 0);
    return null;
  }
  function mostrarCalculo(r, T) {
    var B = global.BIM, K = global.ConcCalcular;
    if (!r.ok) { janela(T, faixa() + "<p>" + esc(r.motivo) + "</p>" + lista("Avisos", r.avisos)); status(r.motivo); return r; }
    ULTIMO_CALC = r;
    var pintou = B && B.pintarUids ? B.pintarUids(r.pintura, "conc-calcular") : 0, R = r.resumo, probs = problemasDoCalculo(r), PC = global.ProblemaCard;
    function selo(cor, t) { return '<span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:' + cor + ';margin-right:4px;vertical-align:-1px"></span>' + t; }
    var sem = arr(r.pecas).filter(function (p) { return p.estado === "sem-calculo"; });
    var html = faixa() + "<p><b>" + R.total + "</b> peça(s) calculadas pelo C1–C4 (C" + r.fck + ", CAA " + r.caa + "): " + selo(K.COR.ok, "<b>" + R.ok + "</b> atendem") + " · " + selo(K.COR.falha, "<b>" + R.falha + "</b> reprovadas") + " · " +
      selo(K.COR["fora-norma"], "<b>" + R.foraNorma + "</b> fora da norma (pilar 12–14 cm)") + (R.semCalculo ? " · " + R.semCalculo + " sem cálculo" : "") + ". " + (pintou ? "As cores já estão no 3D." : "") +
      ' <button type="button" class="btn ghost sm" data-conc-limpar>Tirar as cores</button> <button type="button" class="btn ghost sm" data-conc-ocultar>' + (arquiteturaOculta() ? "Mostrar" : "Ocultar") + " arquitetura</button></p>" +
      (probs.length ? "" : "<p><b>Nenhuma peça reprovada.</b></p>");
    var erros = probs.filter(function (p) { return p.gravidade === "erro"; }), avs = probs.filter(function (p) { return p.gravidade !== "erro"; });
    function bloco(L, tit, grav) { if (!L.length) return ""; var o = { titulo: tit, gravidade: grav, prefixoIndice: grav === "aviso" ? "a" : "e", acoes: function (s) { return s && arr(s.ops).length ? (s.texto || true) : false; } }; return PC ? PC.lista(L, o) : lista(tit, L.map(function (p) { return p.titulo + " — " + p.texto; })); }
    html += bloco(erros, "Reprovadas (" + erros.length + ") — a seção sugerida se aplica com 1 clique", "erro") + bloco(avs, "Fora da NBR 6118:2023 (" + avs.length + ")", "aviso") +
      (sem.length ? lista("Sem cálculo (ficam sem cor)", sem.map(function (p) { return p.tipo + " " + p.marca + " — " + p.motivo; })) : "") +
      (r.memorialPilar12 ? "<details><summary>Texto do memorial (pilar de 12 a 14 cm)</summary><p style=\"font-size:12px\">" + esc(typeof r.memorialPilar12 === "string" ? r.memorialPilar12 : JSON.stringify(r.memorialPilar12)) + "</p></details>" : "") +
      lista("Avisos", r.avisos) + lista("Pendências", r.pendencias);
    var ov = janela(T, html);
    if (ov) {
      ov.addEventListener("click", function (e) { var t = e.target; if (!t || !t.hasAttribute) return; if (t.hasAttribute("data-conc-limpar")) limparCores(); if (t.hasAttribute("data-conc-ocultar")) { ocultarArquitetura(); t.textContent = (arquiteturaOculta() ? "Mostrar" : "Ocultar") + " arquitetura"; } });
      if (PC) PC.ligar(ov, {
        corrigir: function (solId, k) { var L = String(k).charAt(0) === "a" ? avs : erros, p = L[+String(k).slice(1)], pe = p && arr(r.pecas).filter(function (x) { return x.id === p.pecas[0]; })[0], s = p && arr(p.solucoes).filter(function (x) { return x.id === solId; })[0]; if (aplicarSugestao(s, pe)) calcular(); },
        mostrar: function (ids) { PC.mostrarNo3D(ids); }
      });
    }
    status("Calcular: " + R.ok + " atendem · " + R.falha + " reprovadas · " + R.foraNorma + " fora da norma (cálculo de apoio — o engenheiro confere e assina).");
    return r;
  }
  /* MEMORIAL DE CÁLCULO (C6, 16/11/2026): depois do Calcular. Usa o ÚLTIMO cálculo (resultados brutos dos motores C1–C5 em `motor`), pergunta só o que o modelo não sabe — uso e nº de pavimentos habitáveis
   * (classe de consequência CC1/CC2/CC3, Em1 5.3) — e entrega o HTML para imprimir/salvar em PDF (o mesmo caminho do memorial da madeira) e a tabela de aço em .xlsx (nunca CSV). */
  function memorial() {
    var T = "Memorial de cálculo estrutural";
    if (trancou(T)) return null;
    var M = global.ConcMemorial, pac = M && ULTIMO_CALC && M.pacoteDe ? M.pacoteDe(ULTIMO_CALC) : null;
    if (!M) { status("O gerador do memorial não carregou."); return null; }
    if (!pac) { status("Rode o Calcular antes: o memorial usa o último cálculo."); janela(T, '<p>O memorial de cálculo usa o resultado do <b>Calcular</b>. Rode o Calcular estrutura e abra o memorial em seguida.</p>'); return null; }
    var KC = global.ConcCalcular, atual = KC && KC.assinaturaDe ? KC.assinaturaDe(estado()) : null;
    if (pac.assinaturaModelo && atual && pac.assinaturaModelo !== atual) { status("O modelo mudou depois do Calcular: recalcule antes do memorial."); janela(T, '<p><b>O modelo mudou depois do último Calcular.</b> O memorial seria de um cálculo antigo e por isso não foi gerado. Rode o <b>Calcular estrutura</b> de novo e abra o memorial em seguida.</p>'); return null; }
    var n0 = arr(pac.an.modelo && pac.an.modelo.niveis).length || 1;
    var ov = janela(T, faixa() + '<p>O memorial junta as ações, a análise, as vigas, lajes e pilares calculados, o detalhamento e a tabela de aço, as pendências com a fonte e a ressalva do exemplar da norma. A taxa de aço sai marcada PARCIAL.</p>' +
      '<p><label>Uso da edificação <select data-conc-mem-uso><option value="unifamiliar">residencial unifamiliar</option><option value="multifamiliar">residencial multifamiliar</option><option value="comercial">comercial</option><option value="outro">outro</option></select></label> ' +
      '<label>Pavimentos habitáveis <input type="number" min="1" max="60" value="' + n0 + '" data-conc-mem-npav style="width:64px"></label></p>' +
      '<p style="font-size:12px">A classe de consequência (Em1:2026, 5.3 e Tabela 5.1) sai deste uso e deste número de pavimentos; na dúvida vale CC3.</p>' +
      '<p><button type="button" class="btn primary sm" data-conc-mem-html>Abrir o memorial (imprimir / salvar em PDF)</button> <button type="button" class="btn ghost sm" data-conc-mem-xlsx>Baixar a tabela de aço (.xlsx)</button></p>');
    function lerPac() { var q = ov && ov.querySelector; pac.projeto.uso = q ? ov.querySelector("[data-conc-mem-uso]").value : "outro"; pac.projeto.nPavimentos = q ? +ov.querySelector("[data-conc-mem-npav]").value : n0; return pac; }
    function baixar(nome, dados, tipo) { try { var b = new Blob([dados], { type: tipo }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = nome; a.click(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); } catch (e) { status("Não consegui baixar o arquivo: " + (e && e.message)); } }
    if (ov) ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-conc-mem-html")) {
        var g = M.gerar(lerPac(), { assinaturaAtual: atual, obra: { nome: "" }, documento: { revisao: "R00", data: new Date().toISOString().slice(0, 10) } });
        if (!g.ok) { status("Memorial: " + (g.motivo || "não saiu")); return; }
        var w = null; try { w = global.open("", "_blank"); } catch (e1) { w = null; }
        if (w && w.document) { w.document.open(); w.document.write(g.html + "<script>setTimeout(function(){try{window.print()}catch(e){}},700)<\/script>"); w.document.close(); }
        else baixar(g.nomeArquivo, g.html, "text/html");
        status((g.bloqueado ? "NÃO LIBERADO — " : "") + "Memorial de cálculo: " + g.secoes.length + " seções, " + g.tabelas + " tabelas, " + g.classeConsequencia.cc + " — taxa de aço PARCIAL.");
      }
      if (t.hasAttribute("data-conc-mem-xlsx")) {
        var EX = global.ExcelOrc || global.Excel; if (!EX || !EX.ensureExcelJS) { status("Excel indisponível."); return; }
        EX.ensureExcelJS(function () {
          try { var wb = M.xlsx(global.ExcelJS, lerPac(), {}); if (!wb) { status("Sem detalhamento para a planilha."); return; }
            wb.xlsx.writeBuffer().then(function (buf) { baixar(wb.nomeArquivo || "tabela-aco-concreto.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); status("Tabela de aço (.xlsx) gerada — taxa PARCIAL."); }); } catch (e2) { status("Planilha: " + (e2 && e2.message)); }
        });
      }
    });
    return ov;
  }
  function limparCores() { var B = global.BIM; if (B && B.pintarUids) B.pintarUids({}, "conc-calcular"); status("Cores do cálculo retiradas."); return true; }

  function lancar(modo, extra, T) {
    if (trancou(T)) return null;
    var st = estado(), C = CL(); if (!st || !C) { status("O editor 3D não está aberto."); return null; }
    var opc = { avaliarFam: avaliar(), categoriaFam: catFam(), niveis: niveis(), ops: ops(), forcar: modo === "refazer", tipoLaje: modo === "macica" || modo === "trelicada" ? modo : "auto" };
    if (extra) Object.keys(extra).forEach(function (k) { if (k !== "assimMesmo") opc[k] = extra[k]; });
    var res = C.gerar(st, opc);
    if (res.bloqueado) { janelaBloqueios(T, res, extra); return res; }
    if (!res.ok) { janela(T, faixa() + "<p>" + esc(res.motivo) + "</p>" + lista("Avisos", res.avisos)); status(res.motivo); return res; }
    var ok = aplicar(res.lote), R = res.resumo, vz = null;
    if (ok) { try { vz = vistaEstrutura({ forcar: true }); } catch (eV) { vz = { ok: false, motivo: String((eV && eV.message) || eV) }; } }   /* a vista nasce junto com a estrutura */
    /* lançou com o auditor desligado (“assim mesmo”): os pontos ficam listados para conferir, nunca em silêncio */
    var conferir = extra && extra.assimMesmo ? arr(res.auditoria && res.auditoria.bloqueios).map(function (b) { return (S1_TIT[b.id] || b.id) + " — " + b.texto; }) : [];
    var html = faixa() + "<p><b>" + res.pecas.length + "</b> peça(s): " + R.pilar.n + " pilar(es), " + R.viga.n + " viga(s), " + R.laje.n + " laje(s) em " + res.pavimentos.length + " pavimento(s)" +
      (ok ? " — aplicado num lote (Ctrl+Z desfaz tudo)." : " — <b>não aplicado</b>.") + (vz && vz.ok ? " Vista de Estrutura: " + vz.folhas.length + " folha(s) (Estrutura › Vista de estrutura)." : (vz && vz.motivo ? " Vista de Estrutura não saiu: " + esc(vz.motivo) : "")) + ' <button type="button" class="btn ghost sm" data-conc-ver>Mostrar no 3D</button></p>' +
      (res.manuais.mantidos.length ? "<p>Mexido à mão e mantido como está: " + esc(res.manuais.mantidos.join(", ")) + ' (para refazer tudo: Pré-lançar › "Refazer tudo").</p>' : "") +
      "<p>Estimativa (já no orçamento do modelo, marcada): concreto " + f2(R.m3, 3) + " m³ · fôrma " + f2(R.forma) + " m² · aço " + f2(R.aco, 0) + " kg (taxa " + R.taxa + " kg/m³)" + (R.trelicadaM2 ? " · laje treliçada " + f2(R.trelicadaM2) + " m²" : "") + ".</p>" +
      "<h4 style=\"margin:10px 0 4px\">Pilares</h4>" + tabela(["Marca", "Pavimento", "Seção (cm)", "Onde", "Ai (m²)", "Regra"], res.pilares.map(function (p) { return [p.marca, p.pav, p.secao, p.tipoNo + (p.transicao ? " · TRANSIÇÃO" : "") + (p.conflito ? " · encosta em " + p.conflito : ""), f2(p.Ai), p.regra]; })) +
      "<h4 style=\"margin:10px 0 4px\">Vigas</h4>" + tabela(["Peça", "Pavimento", "Seção (cm)", "Vão (m)", "Regra"], res.vigas.filter(function (x) { return !x.pulada; }).map(function (x) { return [x.id, x.pav, x.secao, f2(x.vao), x.regra]; })) +
      "<h4 style=\"margin:10px 0 4px\">Lajes</h4>" + tabela(["Marca", "Ambiente", "Tipo", "h (cm)", "lx × ly (m)", "Regra"], res.lajes.filter(function (x) { return !x.pulada; }).map(function (x) { return [x.marca, x.amb, x.tipo === "macica" ? "maciça" : "treliçada", String(x.h), f2(x.lx) + " × " + f2(x.ly), x.regra]; })) +
      lista("Conferir (auditor de precisão)", conferir) + lista("Avisos", res.avisos) + lista("Premissas e fontes", res.premissas) + lista("Pendências", res.pendencias) +
      '<p style="margin-top:8px"><button type="button" class="btn primary sm" data-conc-auditar>Auditar a estrutura</button> <button type="button" class="btn ghost sm" data-conc-ifc>IFC para o cálculo</button> <button type="button" class="btn primary sm" data-conc-calcular>Calcular</button> <button type="button" class="btn ghost sm" data-conc-ocultar>Ocultar arquitetura</button></p>';
    var ov = janela(T, html);
    if (ov) ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-conc-ver")) mostrar(res.pecas.map(function (c) { return c.id; }));
      if (t.hasAttribute("data-conc-auditar")) auditar();
      if (t.hasAttribute("data-conc-ifc")) ifc();
      if (t.hasAttribute("data-conc-calcular")) calcular();
      if (t.hasAttribute("data-conc-ocultar")) ocultarArquitetura();
    });
    status(T + ": " + R.pilar.n + " pilar(es), " + R.viga.n + " viga(s), " + R.laje.n + " laje(s) — PRÉ-DIMENSIONAMENTO, A CALCULAR.");
    return res;
  }
  function opcoes() {
    var T = "Opções da estrutura";
    var on = permitirPilar12();
    var ov = janela(T, faixa() + '<label style="display:block;margin:6px 0"><input type="checkbox" data-conc-p12' + (on ? " checked" : "") + '> <b>Permitir pilar 12–14 cm (fora da NBR 6118:2023)</b></label>' +
      '<p style="font-size:12px">Desligada por padrão; a sugestão automática começa em 14 cm. Ligada, a peça aparece em laranja e o memorial leva a seção própria: ' +
      "“A ABNT NBR 6118 em vigor NÃO cobre essas peças… o uso desta seção é decisão do responsável técnico, que o assume com a assinatura do memorial e da ART”. " +
      "Regra do cálculo: lado ≥ 12 cm, Ac ≥ 360 cm², γn = 1,95 − 0,05·b (a fórmula da Tabela 13.1, estendida). Status do dado: decisão do produto.</p>");
    if (ov) ov.addEventListener("change", function (e) {
      var t = e.target; if (!t || !t.hasAttribute || !t.hasAttribute("data-conc-p12")) return;
      var v = definirPilar12(t.checked); t.checked = v; status("Pilar de 12 a 14 cm: " + (v ? "LIGADO (fora da NBR 6118:2023, decisão do RT)." : "desligado."));
    });
    return on;
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
        if (aplicar({ op: "lote", id: "conc-corr-" + Date.now().toString(36), origem: "conc-auditor", pedido: ("Corrigir: " + s.texto).slice(0, 300), ops: s.ops })) { status("Corrigido: " + s.texto + " (Ctrl+Z desfaz)."); try { vistaEstrutura({ forcar: true }); } catch (eV) { /* a vista é refeita pelo vigia */ } auditar(); }
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
        { id: "conc-sugerir", rotulo: "Sugerir\nestrutura", icone: "estrutura", grande: true,
          dica: "Lê a arquitetura e sugere a estrutura inteira com precisão: grade de eixos (A, B… e 1, 2…), pilares dentro das paredes e fora dos vãos, vigas com a viga baldrame e as vigas em balanço, lajes por ambiente. Com o auditor de precisão bloqueando o que estiver fora do lugar (cada ponto com o que é e como corrigir). PRÉ-DIMENSIONAMENTO — A CALCULAR. Um Ctrl+Z desfaz." },
        { id: "conc-ocultar", rotulo: "Ocultar\narquitetura", icone: "estrutura", grande: true, dica: "Esconde a arquitetura (paredes, coberturas, forros, portas, janelas, escadas, mobiliário) para ver só a estrutura; clique de novo para mostrar. É só a vista: não muda o modelo, o orçamento nem a quantidade." },
        { id: "conc-calcular", rotulo: "Calcular\nestrutura", icone: "calculadora", grande: true, dica: "Roda o cálculo de apoio C1–C4 (pórtico, vigas, lajes e pilares) sobre o que está lançado e pinta cada peça: verde (atende), vermelho (reprovada, com a seção sugerida em 1 clique) e laranja (pilar de 12 a 14 cm, fora da NBR 6118:2023). Pode levar alguns segundos." },
        { id: "conc-memorial", rotulo: "Memorial de\ncálculo", icone: "calculadora", grande: true, dica: "Depois do Calcular: o memorial de cálculo estrutural (ações, análise, vigas, lajes, pilares, detalhamento, tabela de aço com a taxa marcada PARCIAL, pendências com a fonte, classe de consequência e ATP da Em1:2026) para imprimir/salvar em PDF, e a tabela de aço em .xlsx. Cálculo de apoio — o engenheiro responsável confere e assina (ART)." },
        { id: "conc-vista", rotulo: "Vista de\nestrutura", icone: "estrutura", grande: true,
          dica: "Abre a Vista de Estrutura (criada e atualizada sozinha quando se lança ou se altera a estrutura): uma planta de fôrma por nível com a estrutura em cor sobre a arquitetura em meio-tom, grade de eixos com bolhas e cotas parciais e acumuladas, nome e seção de cada peça, cortes automáticos pelos eixos principais e as tabelas de locação dos pilares, níveis e vigas." },
        { id: "conc-opc", rotulo: "Opções da\nestrutura", icone: "regua", grande: true, dica: "Opções do projeto: permitir o pilar de 12 a 14 cm (fora da NBR 6118:2023; decisão do responsável técnico, entra no memorial). Desligada por padrão." },
        { id: "conc-auditar", rotulo: "Auditar\nestrutura", icone: "calculadora", grande: true, dica: "Confere qualquer estrutura de concreto do modelo: pilar no vão de porta/janela, viga cortando janela, vão de viga e de laje acima do limite, balanço, pilar desalinhado ou sem continuidade, viga sem apoio, seções mínimas da NBR 6118 — cada item com Corrigir e Mostrar no 3D." },
        { id: "conc-quant", rotulo: "Quantitativo\npreliminar", icone: "regua", grande: true, dica: "Concreto (m³), fôrma (m²) e aço por taxa de fonte declarada das peças pré-lançadas — ESTIMATIVA marcada, já no orçamento do modelo (sem cobrar em dobro o que foi orçado à mão)." },
        { id: "conc-ifc", rotulo: "IFC para\no cálculo", icone: "estrutura", grande: true, dica: "Exporta o IFC4 com os pilares, vigas e lajes pré-lançados como IfcColumn, IfcBeam e IfcSlab com a seção — para o programa de cálculo." },
        { id: "conc-criterios", rotulo: "Critérios do\npré-lançamento", icone: "regua", grande: true, dica: "Os números usados, com a fonte e o status: norma lida (edição), literatura ou regra do produto." }
      ]);
      reg["conc-prelancar"] = function () { return true; };
      reg["conc-sugerir"] = function () { sugerir(); return true; };
      reg["conc-opc"] = function () { opcoes(); return true; };
      reg["conc-ocultar"] = function () { ocultarArquitetura(); return true; };
      reg["conc-calcular"] = function () { calcular(); return true; };
      reg["conc-memorial"] = function () { memorial(); return true; };
      reg["conc-vista"] = function () { var r = vistaEstrutura({ forcar: true, abrir: true }); if (!r || !r.ok) { janela("Vista de Estrutura", faixa() + "<p>" + esc((r && r.motivo) || "Não saiu.") + "</p>"); } return true; };
      ligarVigia();
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
    ocultarArquitetura: ocultarArquitetura, arquiteturaOculta: arquiteturaOculta, calcular: calcular, memorial: memorial, limparCores: limparCores, problemasDoCalculo: problemasDoCalculo, aplicarSugestao: aplicarSugestao, ultimoCalculo: function () { return ULTIMO_CALC; },
    sugerir: sugerir, opcoes: opcoes, vistaEstrutura: vistaEstrutura, vigiarVista: vigiarVista, registroDaVista: registroDaVista, permitirPilar12: permitirPilar12, definirPilar12: definirPilar12, problemasDosBloqueios: problemasDosBloqueios, aoCorrigirBloqueio: aoCorrigirBloqueio,
    prelancar: prelancar, auditar: auditar, quantitativo: quant, ifc: ifc, criterios: criterios, liberada: liberada
  };
  global.ConcUI = ConcUI;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
