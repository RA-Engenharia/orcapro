/* =====================================================================
 * woodframeui.js — a FIAÇÃO FINA do Wood Frame no BIM (20/11/2026).
 * O motor é o js/woodframequadro.js; aqui só moram o botão do RAIO-X DO QUADRO e o das PRANCHAS WOOD FRAME.
 *
 * ONDE O USUÁRIO CLICA
 *   · TIPO DE PAREDE: no seletor "Tipo" da parede (barra de opções e Propriedades) aparecem
 *     os tipos "Wood Frame · …" (js/alvtipos.js). Espaçamento dos montantes, OSB e canto
 *     ficam em Propriedades de tipo (Editar tipo › Construção › "Wood Frame: …").
 *   · QUADRO NA PLANTA: o nível de detalhe da vista (Fino/Alto = camadas + montantes + cota
 *     do espaçamento; Médio = só as camadas; Baixo = só o contorno).
 *   · RAIO-X DO QUADRO: Vista › Exibir › "Quadro de madeira" — a casca da parede some no 3D e
 *     ficam as guias, montantes, ombreiras, vergas, cripples e bloqueadores (sem as placas).
 *     Clicar de novo volta a parede inteira. O mesmo interruptor mora na barra de baixo da vista 3D ("Quadro WF", só com
 *     parede Wood Frame no modelo) e nas Propriedades da vista 3D ("Mostrar quadro Wood Frame"). A parede Wood Frame SELECIONADA
 *     mostra o próprio quadro mesmo com o interruptor desligado (js/bim.js, wfSelecaoMudou). Converter alvenaria: menu de seleção › "Converter para Wood Frame…".
 *   · CÁLCULO ESTRUTURAL (fase 2B, js/woodframecalc.js): as Pranchas e o Memorial rodam o cálculo NBR 7190-1:2022 das paredes (montante, verga, contraventamento,
 *     hold-down, ligações) no Worker (js/madengworker.js, mensagem "woodframe"); V0 e categoria saem do cadastro da obra no módulo Madeira (mesmo armazenamento da cobertura).
 *     Sem localização da obra o vento não é calculado e a emissão sai PRELIMINAR — nunca com um V0 de cabeça.
 *   · PRANCHAS WOOD FRAME (fase 2A): Vista › Composição da folha › "Pranchas Wood Frame" — gera o PDF (A1, carimbo RA) com a
 *     planta de painéis, a elevação de cada painel (P01, P02…) com a lista de corte, a lista consolidada e os detalhes típicos
 *     (js/woodframepranchas.js e js/woodframedetalhes.js; os motores de folha da madeira vêm do mesmo grupo do BIM).
 * O estado vive em window.WoodFrameModo (lembrado em localStorage); o 3D lê no rebuild (js/bim.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  function B() { return global.BIM; }
  function status(msg) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(msg); else if (B() && B().hint) B().hint(msg); } catch (e) { /* sem barra de status */ } }

  var CHAVE = "orcapro:bim:wf-quadro";
  var WoodFrameUI = {
    /* o modo vive na vista 3D (Propriedades › "Mostrar quadro Wood Frame") e no botão "Quadro WF" da barra de baixo — os dois leem e gravam AQUI */
    modo: function () {
      if (global.WoodFrameModo === undefined) { try { global.WoodFrameModo = global.localStorage && global.localStorage.getItem(CHAVE) === "1" ? "quadro" : "normal"; } catch (e) { global.WoodFrameModo = "normal"; } }
      return global.WoodFrameModo === "quadro" ? "quadro" : "normal";
    },
    definirModo: function (m) {
      global.WoodFrameModo = m === "quadro" ? "quadro" : "normal";
      try { if (global.localStorage) global.localStorage.setItem(CHAVE, global.WoodFrameModo === "quadro" ? "1" : "0"); } catch (eL) { /* sem armazenamento: vale na sessão */ }
      try { if (global.BimRibbon && global.BimRibbon.setAtivo) global.BimRibbon.setAtivo("wf-quadro", global.WoodFrameModo === "quadro"); } catch (e) { /* fita ausente */ }
      this.sincBotao();
      try { if (B() && B().editarReconstruir) B().editarReconstruir(); } catch (eR) { /* sem cena */ }
      return global.WoodFrameModo;
    },
    alternar: function (ligado) {
      var novo = ligado === true ? "quadro" : (ligado === false ? "normal" : (this.modo() === "quadro" ? "normal" : "quadro"));
      if (!this.temWf()) { status("Este modelo não tem parede Wood Frame: o quadro só aparece nas paredes de tipo \"Wood Frame · …\" (use Converter para Wood Frame…)."); return false; }
      this.definirModo(novo);
      status(novo === "quadro" ? "Raio-X do quadro: só a madeira (guias, montantes, ombreiras, vergas, bloqueadores); as placas somem em TODAS as paredes Wood Frame (" + (+global.WoodFrameTem || 0) + " no modelo); parede de alvenaria ou de outro tipo não muda." : "Parede inteira de novo (camadas e placas).");
      return true;
    },
    /* o modelo tem parede Wood Frame? (a cena conta ao montar: window.WoodFrameTem) */
    temWf: function () { return (+global.WoodFrameTem || 0) > 0; },
    /* a propriedade da vista 3D (Propriedades › Gráficos); null quando não há parede Wood Frame */
    paramVista: function () {
      if (!this.temWf()) return null;
      return { id: "wf:quadro", rotulo: "Mostrar quadro Wood Frame", tipo: "sim-nao", valor: this.modo() === "quadro" };
    },
    mudarVista: function (pid, valor) {
      if (pid !== "wf:quadro") return false;
      var sim = valor === true || valor === "true" || valor === "sim";
      if (sim !== (this.modo() === "quadro")) this.alternar(sim);
      return true;
    },
    /* o botão "Quadro WF" da barra de baixo da vista 3D (ao lado de Cores): só aparece com parede Wood Frame no modelo */
    botaoBarra: function (el, ico) {
      var self = this, bt = el("button", "rv-vb");
      bt.type = "button"; bt.setAttribute("data-rv-vb", "wf-quadro"); bt.setAttribute("aria-pressed", this.modo() === "quadro" ? "true" : "false");
      bt.setAttribute("aria-label", "Quadro Wood Frame"); bt.title = "Quadro WF: esconde as chapas e camadas de TODAS as paredes Wood Frame e mostra só a estrutura. A parede selecionada sempre mostra o próprio quadro.";
      bt.innerHTML = ico("camadas", 14) + "<span>Quadro WF</span>";
      bt.hidden = !this.temWf();
      bt.onclick = function () { self.alternar(); };
      this._bt = bt;
      if (!this._ouvindo && global.addEventListener) { this._ouvindo = true; global.addEventListener("bim:wf", function () { self.sincBotao(); try { if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } catch (e) { /* sem fita */ } }); }
      return bt;
    },
    sincBotao: function () {
      var bt = this._bt; if (!bt) return;
      var tem = this.temWf();
      if (bt.hidden === tem) bt.hidden = !tem;
      bt.setAttribute("aria-pressed", this.modo() === "quadro" ? "true" : "false");
    },
    /* estado de agora do modelo (replay das ops do editor), como faz a fita da cobertura */
    _estado: function () {
      var Bm = B(), E = global.BimEdit;
      if (!Bm || !Bm.editarOps || !E) return null;
      try { return E.aplicar(Bm.editarOps()); } catch (e) { return null; }
    },
    /* dados da obra para o carimbo (a mesma fonte do conjunto "Folhas do projeto") */
    _opcoes: function () {
      var o = { empresa: "RA Engenharia", codigo: "EST-MAD-WF", revisao: "R00", numeracao: {} };
      try {
        var F = global.BimFolhaUI, G = F && F.G && F.G(), ob = G && global.Store && global.Store.obter(F.empresa(), "obras", G._bimSel);
        if (ob) { o.obra = ob.nome || ""; o.proprietario = ob.clienteNome || ""; o.local = ob.local || ob.endereco || ""; }
        o._chave = "ra:wf:painel:" + String((G && G._bimSel) || "geral");
      } catch (e) { /* sem cadastro da obra: o carimbo sai em branco nesses campos */ }
      /* a numeração dos painéis (P01…) é guardada por obra: apagar uma parede não renumera as outras e parede nova recebe o próximo número */
      try { o.numeracao = JSON.parse(global.localStorage.getItem(o._chave || "ra:wf:painel:geral") || "{}") || {}; } catch (e2) { o.numeracao = {}; }
      return o;
    },
    _baixar: function (nome, dados, mime) {
      if (global.TesteModulo && global.TesteModulo.marcarArquivo) { var w = global.TesteModulo.marcarArquivo(nome, dados, mime, ""); if (!w) return false; nome = w.nome; dados = w.dados; }
      var d = global.document; if (!d) return false;
      try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = d.createElement("a"); a.href = u; a.download = nome; d.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }
    },
    /* PRANCHAS WOOD FRAME: planta de painéis, uma elevação por painel (com a lista de corte), lista consolidada e detalhes típicos → PDF vetorial A1 */
    pranchas: function (calc) {
      var WP = global.WoodFramePranchas, PDF = global.SvgPdf;
      if (!WP || !PDF) { status("O gerador de pranchas do Wood Frame não carregou."); return false; }
      var est = this._estado();
      if (!est) { status("Abra o editor 3D para gerar as pranchas do Wood Frame."); return false; }
      var opc = this._opcoes(); if (calc && calc.ok) opc.calculo = calc;
      var x = WP.gerar(est, opc);
      try { global.localStorage.setItem(opc._chave || "ra:wf:painel:geral", JSON.stringify(opc.numeracao || {})); } catch (eL) { /* sem armazenamento: a numeração vale só desta geração */ }
      if (!x.ok) { status("Pranchas Wood Frame: " + (x.avisos[x.avisos.length - 1] || "não há parede de Wood Frame no modelo.")); return false; }
      var ok = this._baixar("pranchas-wood-frame.pdf", PDF.pdf(x.folhas.map(function (f) { return f.svg; }), { titulo: "Pranchas Wood Frame" }), "application/pdf");
      status(ok ? (x.folhas.length + " pranchas Wood Frame em PDF (A1): " + x.paineis.length + " painéis" + (x.avisos.length ? " · " + x.avisos.length + " aviso(s): " + x.avisos[0] : "") + ".") : "Não foi possível baixar o PDF das pranchas.");
      return !!ok;
    },
    /* dados da obra para o vento e a umidade: o mesmo cadastro que a cobertura calculada usa (módulo Madeira) */
    _opcCalc: function (est) {
      var o = {};
      try {
        var g = global.Gestao, id = String((g && g._bimSel) || "geral"), t = global.localStorage.getItem("orcapro:madeira:eng:v1:" + id), s = t ? JSON.parse(t) : null, ob = s && s.estado && s.estado.obra ? s.estado.obra : {};
        if (ob.lat != null && ob.lon != null) o.vento = { local: { lat: Number(ob.lat), lon: Number(ob.lon), descricao: ob.local || "" }, categoria: ob.categoria || "II", grupoS3: ob.grupoS3 || 2, s1tipo: ob.s1tipo || "plano", s1: ob.s1 != null ? ob.s1 : 1 };
        if (ob.v0 != null && Number(ob.v0) > 0) o.vento = { v0: Number(ob.v0), categoria: ob.categoria || "II", grupoS3: ob.grupoS3 || 2, s1tipo: ob.s1tipo || "plano", s1: ob.s1 != null ? ob.s1 : 1 };
        if (ob.umidade) o.umidade = Number(ob.umidade);
      } catch (e) { /* sem cadastro: o vento sai "não calculado" e a emissão PRELIMINAR */ }
      /* a cobertura DESENHADA no modelo (telha do catálogo + trama, inclinação, beiral, eixo da cumeeira): sem telhado, vira pendência do cálculo (PRELIMINAR) */
      try {
        var WC0 = global.WoodFrameCalc, tl = est && est.telhados;
        if (WC0 && WC0.coberturaDoEstado && tl && tl.length) { var cb = WC0.coberturaDoEstado(est, null); if (cb && !cb.erro) o.cobertura = cb; }
      } catch (eC) { /* sem a ponte da cobertura: o cálculo tenta ler o telhado sozinho */ }
      return o;
    },
    _obraId: function () { try { var g = global.Gestao; return String((g && g._bimSel) || "geral"); } catch (e) { return "geral"; } },
    /* o cálculo roda no Worker (leve, mas não trava a tela); sem Worker, só se os motores estiverem na página. cb(resultado | null, mensagem) */
    calcular: function (est, cb) {
      var opc = this._opcoes(), WQ = global.WoodFrameQuadro, entrada;
      try {
        var vaos = WQ && WQ.vaosDasParedes ? (WQ.vaosDasParedes(est, opc) || {}) : {};
        entrada = JSON.parse(JSON.stringify({ estado: { caixas: est.caixas, telhados: est.telhados || [] }, vaos: vaos, opc: this._opcCalc(est), obraId: this._obraId() }));
      } catch (e) { cb(null, "não consegui preparar o modelo para o cálculo: " + (e && e.message ? e.message : e)); return false; }
      var feito = false, w = null;
      function fim(r, msg) { if (feito) return; feito = true; try { if (r && r.ok && global.WoodFrameCalc && global.WoodFrameCalc.guardar) global.WoodFrameCalc.guardar(r); } catch (eG) { /* sem guarda */ } try { if (w) w.terminate(); } catch (e0) { /* já encerrado */ } cb(r, msg); }
      if (typeof global.Worker === "function") {
        var ver = ""; try { var mv = /[?&]v=([^&]+)/.exec(String(global.location && global.location.search || "")); if (mv) ver = "?v=" + mv[1]; } catch (e1) { /* sem versão */ }
        try {
          w = new global.Worker("js/madengworker.js" + ver);
          w.onmessage = function (ev) {
            var m = ev.data || {};
            if (m.tipo === "fim-woodframe") { try { fim(JSON.parse(m.texto)); } catch (e2) { fim(null, "resposta ilegível do cálculo"); } }
            else if (m.tipo === "erro") fim(null, m.mensagem || "o cálculo falhou");
          };
          w.onerror = function () { fim(null, "o Worker do cálculo não abriu"); };
          w.postMessage({ tipo: "woodframe", id: 1, entrada: entrada });
          return true;
        } catch (e3) { w = null; }
      }
      var WC = global.WoodFrameCalc;
      try { var r = WC && global.MadLigCalc && global.MadWoodFrame ? WC.calcular(entrada) : null; if (r) fim(r); else fim(null, "o Worker não abriu e os motores não estão na página"); } catch (e4) { fim(null, e4 && e4.message ? e4.message : String(e4)); }
      return true;
    },
    /* PRANCHAS: calcula, depois gera (a folha de resumo e a seção calculada entram sozinhas) */
    pranchasCalculadas: function () {
      var self = this, est = this._estado(), WQ = global.WoodFrameQuadro, resp = null, assinc = false;
      if (!est) { status("Abra o editor 3D para gerar as pranchas do Wood Frame."); return false; }
      if (!WQ || !(est.caixas || []).some(function (c) { return WQ.ehWf(c); })) return this.pranchas();      /* sem parede de quadro: o aviso de sempre, sem cálculo */
      status("Wood Frame: calculando as paredes (NBR 7190-1:2022)…");
      this.calcular(est, function (calc, msg) {
        var r;
        if (!calc || !calc.ok) { status("Cálculo do Wood Frame: " + (msg || (calc && calc.motivo) || "sem resultado") + " — pranchas sem o cálculo."); r = self.pranchas(); }
        else r = self.pranchas(calc);
        resp = r; if (assinc) return;
      });
      assinc = true;
      return resp === null ? true : resp;            /* Worker: o PDF baixa quando o cálculo volta; sem Worker: já voltou */
    },
    memorial: function () {
      var self = this, est = this._estado(), MEM = global.WoodFrameMemorial;
      if (!est) { status("Abra o editor 3D para gerar o memorial do Wood Frame."); return false; }
      if (!MEM) { status("O gerador do memorial do Wood Frame não carregou."); return false; }
      status("Wood Frame: calculando as paredes (NBR 7190-1:2022)…");
      return this.calcular(est, function (calc, msg) {
        if (!calc || !calc.ok) { status("Memorial do Wood Frame: " + (msg || (calc && calc.motivo) || "sem resultado") + "."); return; }
        var opc = self._opcoes(), r = MEM.gerar(calc, { obra: { nome: opc.obra || "", cidade: opc.local || "", proprietario: opc.proprietario || "" }, documento: { numero: opc.codigo || "EST-MAD-WF", revisao: opc.revisao || "R00", data: new Date().toISOString().slice(0, 10) } });
        if (!r.ok) { status("Memorial do Wood Frame: " + (r.motivo || "não gerou")); return; }
        var ok = self._baixar("memorial-wood-frame.html", r.html, "text/html;charset=utf-8");
        status(ok ? "Memorial do Wood Frame (" + r.tabelas + " tabelas)" + (r.preliminar ? " — PRELIMINAR: " + calc.motivosPreliminar[0] : "") + "." : "Não foi possível baixar o memorial.");
      });
    },
    /* APLICAR A SEÇÃO CALCULADA — ação explícita: troca o tipo das paredes que o cálculo manda mudar (38×89 → 38×140), o espaçamento e o prego de borda; UM desfazer volta tudo;
       depois recalcula. Só vale para o cálculo VIGENTE (o modelo não mudou depois dele). */
    aplicarSecaoCalculada: function () {
      var self = this, est = this._estado(), WC = global.WoodFrameCalc, Bm = B(), WQ = global.WoodFrameQuadro;
      if (!est || !Bm || !Bm.editarLote || !WC || !WC.planoAplicar) { status("Abra o editor 3D para aplicar a seção calculada do Wood Frame."); return false; }
      var calc = WC.ultimo();
      if (!calc) { status("Calcule antes (Memorial ou Pranchas Wood Frame): não há cálculo para aplicar."); return false; }
      var vaos = {}; try { vaos = WQ && WQ.vaosDasParedes ? (WQ.vaosDasParedes(est, this._opcoes()) || {}) : {}; } catch (e) { vaos = {}; }
      if (!WC.vigente(est, vaos, calc, { opc: this._opcCalc(est), obraId: this._obraId() })) { status("O cálculo do Wood Frame está DESATUALIZADO (o modelo mudou depois dele): calcule de novo antes de aplicar."); return false; }
      var ops = Bm.editarOps(), seq = 0;
      ops.forEach(function (o) { var m = /^[eaf](\d+)$/.exec(String(o && o.id || "")); if (m) seq = Math.max(seq, parseInt(m[1], 10)); });
      var pl = WC.planoAplicar(est, calc, seq);
      if (!pl.ok) { status("Aplicar a seção calculada: " + pl.motivo); return false; }
      if (pl.vazio) { status("Nada a aplicar: o modelo já está na seção, no espaçamento e no prego calculados." + (pl.pendencias.length ? " Pendência: " + pl.pendencias[0] : "")); return false; }
      /* o caminho de edição do USUÁRIO (BIM.editarLote): grava, limpa o refazer, passa pelo BimGrupos e não mexe na câmera; um Ctrl+Z desfaz o lote inteiro */
      if (!Bm.editarLote(pl.lote)) { status("Aplicar a seção calculada: o editor recusou o lote."); return false; }
      status("Seção calculada aplicada em " + pl.resumo.length + " parede(s) (" + pl.resumo[0].id + ": " + pl.resumo[0].mudancas.join("; ") + ") — um Ctrl+Z desfaz tudo. Recalculando…");
      var est2 = this._estado();
      if (est2) this.calcular(est2, function (c2, msg) {
        if (!c2 || !c2.ok) { status("Seção aplicada; o recálculo falhou: " + (msg || (c2 && c2.motivo) || "sem resultado") + "."); return; }
        status("Seção aplicada e recalculado: " + (c2.preliminar ? "PRELIMINAR — " + c2.motivosPreliminar[0] : "atende") + " (η máx. " + c2.resumo.etaMax.toFixed(2).replace(".", ",") + ").");
      });
      return true;
    },
    registrar: function (reg) {
      var self = this, R = global.BimRibbon;
      if (!R || !R.acrescentar) return false;
      R.acrescentar("vista", "Vista", "Exibir", [
        { id: "wf-quadro", rotulo: "Quadro de\nmadeira", icone: "camadas", tipo: "alterna", dica: "Raio-X do Wood Frame: esconde a casca e as placas das paredes de quadro de madeira e mostra só as guias, os montantes, as ombreiras, as vergas, os cripples e os bloqueadores. Clique de novo para voltar." }
      ]);
      /* junto das pranchas da folha: o mesmo painel "Composição da folha" (a fita junta pelo nome do painel) */
      R.acrescentar("vista", "Vista", "Composição da folha", [
        { id: "wf-pranchas", rotulo: "Pranchas\nWood Frame", icone: "prancha", grande: true, dica: "Gera o jogo de pranchas do Wood Frame num PDF A1 com o carimbo RA: planta de painéis (P01, P02… e o sentido de montagem), a elevação de cada painel (montantes com eixo e cotas acumuladas, guias, vãos com verga, ombreiras e cripples, bloqueadores, OSB com as juntas, chumbadores e hold-downs) com a lista de corte, a lista consolidada da obra (m³ e peças por seção) e os detalhes típicos desenhados do tipo de parede (canto, encontro, junta de OSB, esquadria, base, topo e verga)." },
        { id: "wf-memorial", rotulo: "Memorial\nWood Frame", icone: "prancha", dica: "Calcula as paredes de Wood Frame pela NBR 7190-1:2022 (montante, verga, contraventamento por OSB, hold-down, ligações) e baixa o MEMORIAL DE CÁLCULO em HTML. Sai PRELIMINAR enquanto o vento não estiver calculado (informe a localização da obra no módulo Madeira) ou houver premissa sem confirmação do RT." },
        { id: "wf-aplicar", rotulo: "Aplicar seção\ncalculada", icone: "camadas", dica: "Aplica o resultado do último cálculo do Wood Frame: troca o tipo das paredes que reprovam (38×89 → 38×140 …), o espaçamento dos montantes e o prego de borda do OSB, e recalcula. É uma ação sua; um Ctrl+Z desfaz tudo de uma vez. Precisa de um cálculo vigente (rode o Memorial ou as Pranchas antes)." }
      ]);
      reg["wf-quadro"] = function (e) { return self.alternar(e && e.ligado !== undefined ? !!e.ligado : undefined); };
      reg["wf-pranchas"] = function () { return self.pranchasCalculadas(); };
      reg["wf-memorial"] = function () { return self.memorial(); };
      reg["wf-aplicar"] = function () { return self.aplicarSecaoCalculada(); };
      return true;
    }
  };

  global.WoodFrameUI = WoodFrameUI;
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFrameUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
