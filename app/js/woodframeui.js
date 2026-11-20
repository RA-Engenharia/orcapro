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
 *     Clicar de novo volta a parede inteira.
 *   · PRANCHAS WOOD FRAME (fase 2A): Vista › Composição da folha › "Pranchas Wood Frame" — gera o PDF (A1, carimbo RA) com a
 *     planta de painéis, a elevação de cada painel (P01, P02…) com a lista de corte, a lista consolidada e os detalhes típicos
 *     (js/woodframepranchas.js e js/woodframedetalhes.js; os motores de folha da madeira vêm do mesmo grupo do BIM).
 * O estado é só da sessão (window.WoodFrameModo); o 3D lê no rebuild (js/bim.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  function B() { return global.BIM; }
  function status(msg) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(msg); else if (B() && B().hint) B().hint(msg); } catch (e) { /* sem barra de status */ } }

  var WoodFrameUI = {
    modo: function () { return global.WoodFrameModo === "quadro" ? "quadro" : "normal"; },
    definirModo: function (m) {
      global.WoodFrameModo = m === "quadro" ? "quadro" : "normal";
      try { if (global.BimRibbon && global.BimRibbon.setAtivo) global.BimRibbon.setAtivo("wf-quadro", global.WoodFrameModo === "quadro"); } catch (e) { /* fita ausente */ }
      try { if (B() && B().editarReconstruir) B().editarReconstruir(); } catch (eR) { /* sem cena */ }
      return global.WoodFrameModo;
    },
    alternar: function (ligado) {
      var novo = ligado === true ? "quadro" : (ligado === false ? "normal" : (this.modo() === "quadro" ? "normal" : "quadro"));
      this.definirModo(novo);
      status(novo === "quadro" ? "Raio-X do quadro: só a madeira (guias, montantes, ombreiras, vergas, bloqueadores); as placas somem." : "Parede inteira de novo (camadas e placas).");
      return true;
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
    pranchas: function () {
      var WP = global.WoodFramePranchas, PDF = global.SvgPdf;
      if (!WP || !PDF) { status("O gerador de pranchas do Wood Frame não carregou."); return false; }
      var est = this._estado();
      if (!est) { status("Abra o editor 3D para gerar as pranchas do Wood Frame."); return false; }
      var opc = this._opcoes(), x = WP.gerar(est, opc);
      try { global.localStorage.setItem(opc._chave || "ra:wf:painel:geral", JSON.stringify(opc.numeracao || {})); } catch (eL) { /* sem armazenamento: a numeração vale só desta geração */ }
      if (!x.ok) { status("Pranchas Wood Frame: " + (x.avisos[x.avisos.length - 1] || "não há parede de Wood Frame no modelo.")); return false; }
      var ok = this._baixar("pranchas-wood-frame.pdf", PDF.pdf(x.folhas.map(function (f) { return f.svg; }), { titulo: "Pranchas Wood Frame" }), "application/pdf");
      status(ok ? (x.folhas.length + " pranchas Wood Frame em PDF (A1): " + x.paineis.length + " painéis" + (x.avisos.length ? " · " + x.avisos.length + " aviso(s): " + x.avisos[0] : "") + ".") : "Não foi possível baixar o PDF das pranchas.");
      return !!ok;
    },
    registrar: function (reg) {
      var self = this, R = global.BimRibbon;
      if (!R || !R.acrescentar) return false;
      R.acrescentar("vista", "Vista", "Exibir", [
        { id: "wf-quadro", rotulo: "Quadro de\nmadeira", icone: "camadas", tipo: "alterna", dica: "Raio-X do Wood Frame: esconde a casca e as placas das paredes de quadro de madeira e mostra só as guias, os montantes, as ombreiras, as vergas, os cripples e os bloqueadores. Clique de novo para voltar." }
      ]);
      /* junto das pranchas da folha: o mesmo painel "Composição da folha" (a fita junta pelo nome do painel) */
      R.acrescentar("vista", "Vista", "Composição da folha", [
        { id: "wf-pranchas", rotulo: "Pranchas\nWood Frame", icone: "prancha", grande: true, dica: "Gera o jogo de pranchas do Wood Frame num PDF A1 com o carimbo RA: planta de painéis (P01, P02… e o sentido de montagem), a elevação de cada painel (montantes com eixo e cotas acumuladas, guias, vãos com verga, ombreiras e cripples, bloqueadores, OSB com as juntas, chumbadores e hold-downs) com a lista de corte, a lista consolidada da obra (m³ e peças por seção) e os detalhes típicos desenhados do tipo de parede (canto, encontro, junta de OSB, esquadria, base, topo e verga)." }
      ]);
      reg["wf-quadro"] = function (e) { return self.alternar(e && e.ligado !== undefined ? !!e.ligado : undefined); };
      reg["wf-pranchas"] = function () { return self.pranchas(); };
      return true;
    }
  };

  global.WoodFrameUI = WoodFrameUI;
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFrameUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
