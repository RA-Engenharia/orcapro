/* =====================================================================
 * bimvideo.js — O VÍDEO DA SIMULAÇÃO 4D
 *
 * O cronograma 4D já corre na tela: a régua anda e a obra sobe. Mas o que
 * vai para a reunião, para o cliente e para o grupo do WhatsApp é um
 * ARQUIVO — e até aqui a única saída era o engenheiro filmar a tela com o
 * celular. O vídeo direto do modelo é a diferença entre "olha aqui no meu
 * computador" e "te mandei o cronograma".
 *
 * ---------------------------------------------------------------------
 * A DIVISÃO DESTE ARQUIVO
 * ---------------------------------------------------------------------
 * `plano()` é PURO e testável em Node: dada a janela do cronograma e a
 * duração desejada, ele diz quantos quadros e QUAL DATA cada quadro mostra.
 * É onde mora a decisão, e é o que a suíte exercita.
 *
 * `suportado()` também é puro o bastante: pergunta ao navegador o que ele
 * grava e devolve o motivo quando não grava nada.
 *
 * `gravar()` é a parte suja: canvas, MediaRecorder, blob. Ela não decide
 * nada — segue o plano.
 *
 * ---------------------------------------------------------------------
 * TRÊS COISAS QUE PARECEM DETALHE E NÃO SÃO
 * ---------------------------------------------------------------------
 *
 * 1. ⚠ O QUADRO É DESENHADO À MÃO, NÃO CAPTURADO PELO COMPOSITOR.
 *    `canvas.captureStream(fps)` deixa o navegador escolher quando ler o
 *    canvas. Com `preserveDrawingBuffer: false` — que é como o renderer do
 *    OrçaPRO nasce — ele lê fora do instante do `render` e grava QUADRO EM
 *    BRANCO. O arquivo sai com o tamanho certo, a duração certa, e preto.
 *    Aqui é `captureStream(0)` + `requestFrame()` depois de cada desenho:
 *    um quadro só sai quando existe.
 *
 * 2. ⚠ E POR ISSO A GRAVAÇÃO ANDA COM A ABA ESCONDIDA. `requestAnimationFrame`
 *    não dispara em aba oculta; um vídeo de 15 s gravado enquanto o usuário
 *    olha o e-mail sairia preto, sem erro nenhum. O laço aqui é por
 *    `setTimeout` e o desenho é síncrono.
 *
 * 3. ⚠ A DATA VAI DENTRO DA IMAGEM. Um vídeo de formas coloridas mudando,
 *    sem data, não é cronograma — é animação. E a data não pode ser um
 *    elemento HTML por cima do canvas: o que é gravado é o canvas.
 * ===================================================================== */
(function (global) {
  "use strict";

  var BimVideo = {};

  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d || 0); }

  /* ---------------------------------------------------------------------
   * O QUE O NAVEGADOR GRAVA
   *
   * ⚠ ORDEM IMPORTA: VP9 antes de VP8 (metade do tamanho no mesmo nível),
   *   e o mp4 por último — o Safari não faz webm, e sem ele o botão
   *   simplesmente não funcionaria no Mac, que é justamente o cliente novo.
   * ------------------------------------------------------------------- */
  BimVideo.FORMATOS = [
    { mime: "video/webm;codecs=vp9", ext: "webm", nome: "WebM (VP9)" },
    { mime: "video/webm;codecs=vp8", ext: "webm", nome: "WebM (VP8)" },
    { mime: "video/webm", ext: "webm", nome: "WebM" },
    { mime: "video/mp4;codecs=avc1", ext: "mp4", nome: "MP4 (H.264)" },
    { mime: "video/mp4", ext: "mp4", nome: "MP4" }
  ];

  BimVideo.suportado = function (MR) {
    var R = MR || (typeof global.MediaRecorder !== "undefined" ? global.MediaRecorder : null);
    if (!R) {
      return { ok: false, motivo: "Este navegador não sabe gravar vídeo (falta o MediaRecorder). Chrome, Edge e Firefox atuais gravam; o Safari mais antigo não." };
    }
    if (typeof R.isTypeSupported !== "function") {
      /* navegador que grava mas não sabe dizer o que aceita: tenta o padrão
         dele em vez de recusar — recusar aqui seria negar por precaução um
         caminho que provavelmente funciona */
      return { ok: true, mime: "", ext: "webm", nome: "padrão do navegador" };
    }
    for (var i = 0; i < BimVideo.FORMATOS.length; i++) {
      var f = BimVideo.FORMATOS[i];
      if (R.isTypeSupported(f.mime)) return { ok: true, mime: f.mime, ext: f.ext, nome: f.nome };
    }
    return { ok: false, motivo: "Este navegador tem o gravador, mas não aceita nenhum formato de vídeo que eu saiba montar (tentei WebM e MP4)." };
  };

  /* ---------------------------------------------------------------------
   * O PLANO DE QUADROS — a decisão, e a parte testável
   *
   * ⚠ A DURAÇÃO MANDA, NÃO O NÚMERO DE DIAS. Um cronograma de 10 dias e um
   *   de 600 têm de virar vídeos do mesmo tamanho: quem assiste não quer 40
   *   minutos porque a obra é longa, nem meio segundo porque é curta. Então
   *   os quadros são `fps × segundos` e as datas se distribuem por eles —
   *   repetindo quando há mais quadros que dias, pulando quando há mais dias
   *   que quadros.
   *
   * ⚠ E A ÚLTIMA DATA FICA PARADA NO FIM. Sem a pausa, o vídeo acaba no
   *   quadro em que a obra fica pronta e o espectador não chega a ver o
   *   resultado — que é a única imagem que ele queria.
   * ------------------------------------------------------------------- */
  BimVideo.plano = function (janela, opts) {
    var o = opts || {};
    var j = janela || {};
    var ini = txt(j.inicio), fim = txt(j.fim);
    if (!ini || !fim) return { ok: false, motivo: "O cronograma não tem data de início e fim — sem janela não há o que animar.", quadros: [] };

    var fps = Math.max(1, Math.min(60, Math.round(num(o.fps, 12))));
    var seg = Math.max(1, Math.min(120, num(o.segundos, 12)));
    var pausa = Math.max(0, Math.min(10, num(o.pausaFinal, 1.5)));

    var dias = Math.max(0, Math.round(num(j.dias, 0)));
    var nAnim = Math.max(1, Math.round(fps * seg));
    var nPausa = Math.round(fps * pausa);

    var somar = (o.somaDias || (global.BimTarefa && global.BimTarefa.somaDias));
    if (typeof somar !== "function") {
      return { ok: false, motivo: "O motor do cronograma não carregou.", quadros: [] };
    }

    var quadros = [];
    for (var i = 0; i < nAnim; i++) {
      /* ⚠ (nAnim - 1) no denominador: com nAnim no lugar, o último quadro
         cairia em `fim - 1 dia` e o vídeo nunca mostraria a obra pronta. */
      var frac = nAnim === 1 ? 1 : (i / (nAnim - 1));
      quadros.push(somar(ini, Math.round(frac * dias)));
    }
    for (var k = 0; k < nPausa; k++) quadros.push(quadros[quadros.length - 1]);

    return {
      ok: true,
      quadros: quadros,
      fps: fps,
      duracaoSeg: Math.round((quadros.length / fps) * 10) / 10,
      diasPorQuadro: nAnim > 1 ? Math.round((dias / (nAnim - 1)) * 100) / 100 : 0,
      inicio: ini, fim: fim, dias: dias
    };
  };

  /* ---------------------------------------------------------------------
   * A FAIXA DA DATA — desenhada DENTRO do quadro
   *
   * Recebe o contexto 2D e escreve. Separada para o teste poder conferir o
   * texto sem canvas nenhum (`BimVideo.textoFaixa`).
   * ------------------------------------------------------------------- */
  BimVideo.textoFaixa = function (data, sim, extra) {
    var d = txt(data);
    var br = /^\d{4}-\d{2}-\d{2}/.test(d) ? (d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4)) : d;
    var pe = (sim && sim.porEstado) || {};
    var ROT = { "em-execucao": "em execução", atrasado: "atrasado", concluido: "concluído", futuro: "não iniciado", removido: "removido" };
    var partes = [];
    ["concluido", "em-execucao", "atrasado", "futuro"].forEach(function (k) {
      if (pe[k]) partes.push(pe[k] + " " + ROT[k]);
    });
    return {
      data: br,
      estados: partes.join(" · "),
      rodape: txt(extra)
    };
  };

  BimVideo.desenharFaixa = function (ctx, larg, alt, alturaFaixa, info, cores) {
    var c = cores || {};
    ctx.fillStyle = c.fundo || "#0b1a2b";
    ctx.fillRect(0, alt - alturaFaixa, larg, alturaFaixa);

    ctx.fillStyle = c.data || "#ffffff";
    ctx.font = "bold " + Math.round(alturaFaixa * 0.42) + "px Segoe UI, Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(info.data, 16, alt - alturaFaixa * 0.62);

    if (info.estados) {
      ctx.fillStyle = c.estados || "#7fe0a3";
      ctx.font = Math.round(alturaFaixa * 0.26) + "px Segoe UI, Arial, sans-serif";
      ctx.fillText(info.estados, 16, alt - alturaFaixa * 0.24);
    }
    if (info.rodape) {
      ctx.fillStyle = c.rodape || "rgba(255,255,255,.62)";
      ctx.font = Math.round(alturaFaixa * 0.24) + "px Segoe UI, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(info.rodape, larg - 16, alt - alturaFaixa * 0.32);
      ctx.textAlign = "left";
    }
  };

  /* ---------------------------------------------------------------------
   * A GRAVAÇÃO
   *
   * ctx: {
   *   desenhar(data)  → chamado por quadro; o chamador aplica a data na cena
   *                     e devolve { canvas, sim } — o canvas recém-desenhado
   *   largura, altura → tamanho do vídeo
   *   rodape          → o carimbo honesto (quantos elementos a cena mostra)
   *   aoAndar(i, n)   → progresso
   * }
   * ------------------------------------------------------------------- */
  BimVideo.gravar = function (plano, ctxDes) {
    var c = ctxDes || {};
    return new Promise(function (resolve, reject) {
      var sup = BimVideo.suportado();
      if (!sup.ok) { reject(new Error(sup.motivo)); return; }
      if (!plano || !plano.ok || !plano.quadros.length) { reject(new Error("Plano de quadros vazio.")); return; }
      if (typeof c.desenhar !== "function") { reject(new Error("Sem fonte de quadros.")); return; }

      var larg = Math.max(320, Math.round(num(c.largura, 1280)));
      var alt = Math.max(240, Math.round(num(c.altura, 720)));
      var faixa = Math.max(38, Math.round(alt * 0.075));

      var cnv = global.document.createElement("canvas");
      cnv.width = larg; cnv.height = alt;
      var g = cnv.getContext("2d");
      if (!g) { reject(new Error("Não consegui abrir a tela de montagem do vídeo.")); return; }

      /* ⚠ captureStream(0): NENHUM quadro sai sozinho. Cada um é pedido
         depois de desenhado — ver a nota 1 do cabeçalho. */
      var stream;
      try { stream = cnv.captureStream(0); } catch (e) { reject(new Error("Este navegador não deixa gravar o conteúdo da tela.")); return; }
      var trilha = stream.getVideoTracks()[0];
      if (!trilha || typeof trilha.requestFrame !== "function") {
        /* sem requestFrame não dá para garantir quadro cheio; melhor recusar
           do que entregar um vídeo preto */
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) {}
        reject(new Error("Este navegador não deixa controlar os quadros da gravação — o vídeo sairia em branco."));
        return;
      }

      var opcoes = { videoBitsPerSecond: Math.round(num(c.bitrate, 6000000)) };
      if (sup.mime) opcoes.mimeType = sup.mime;
      var rec;
      try { rec = new global.MediaRecorder(stream, opcoes); }
      catch (e) { reject(new Error("Não consegui iniciar o gravador: " + e.message)); return; }

      var pedacos = [];
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) pedacos.push(ev.data); };
      rec.onerror = function (ev) { limpar(); reject(new Error("A gravação falhou no meio.")); };
      rec.onstop = function () {
        limpar();
        var blob = new global.Blob(pedacos, { type: sup.mime || "video/webm" });
        resolve({ blob: blob, ext: sup.ext || "webm", nome: sup.nome, quadros: plano.quadros.length, duracaoSeg: plano.duracaoSeg });
      };

      var parado = false;
      function limpar() { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
      BimVideo.cancelar = function () { parado = true; };

      rec.start();
      var i = 0;
      var intervalo = Math.max(1, Math.round(1000 / plano.fps));

      /* ⚠ setTimeout, não requestAnimationFrame — ver a nota 2 do cabeçalho */
      function passo() {
        if (parado) { try { rec.stop(); } catch (e) {} return; }
        if (i >= plano.quadros.length) { try { rec.stop(); } catch (e) {} return; }
        var data = plano.quadros[i];
        var r;
        try { r = c.desenhar(data); } catch (e) { r = null; }
        if (r && r.canvas) {
          try {
            g.drawImage(r.canvas, 0, 0, larg, alt - faixa);
            var info = BimVideo.textoFaixa(data, r.sim, c.rodape);
            BimVideo.desenharFaixa(g, larg, alt, faixa, info, c.cores);
            trilha.requestFrame();
          } catch (e) {}
        }
        i++;
        if (typeof c.aoAndar === "function") { try { c.aoAndar(i, plano.quadros.length); } catch (e) {} }
        global.setTimeout(passo, intervalo);
      }
      global.setTimeout(passo, intervalo);
    });
  };

  global.BimVideo = BimVideo;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVideo;
})(typeof window !== "undefined" ? window : this);
