/* =====================================================================
 * tour360rel.js — O QUE SAI DO TOUR: o relatório fotográfico e o vídeo.
 *
 * O tour vive na tela (js/tour360view.js) e a conta vive no motor
 * (js/tour360.js). Este arquivo é a SAÍDA — o documento que vai para a
 * reunião e o arquivo de vídeo que vai para o grupo da obra. Ele não decide
 * nada de geometria nem de medida: pergunta tudo ao motor
 * (`paginasRelatorio`, `resumo`, `planoVideo`, `planoComparativo`) e ao
 * gravador já testado da casa (`BimVideo.gravar`).
 *
 * Tela nenhuma mora aqui. Quem desenha botão é js/tour360ui.js.
 *
 * ---------------------------------------------------------------------
 * COMO DOCUMENTO VIRA PDF NESTA CASA
 * ---------------------------------------------------------------------
 * Não há biblioteca de PDF. `Gestao._docShell` monta o cabeçalho da empresa,
 * `Gestao._abrirDoc` chama `App._abrirPrint`, que empilha um OVERLAY no
 * próprio DOM — e quem gera o PDF é a janela de impressão do navegador.
 * Três consequências que mandam no código daqui:
 *   · o miolo é HTML com estilo INLINE (não existe folha de estilo dentro
 *     do overlay de impressão);
 *   · quebra de página é `page-break-*`; paginação minha não existe;
 *   · a foto entra como data URI. `Fotos.url` devolve um endereço que só
 *     responde com o header da licença, e `<img src>` não manda header —
 *     por isso a foto é RESOLVIDA por `Fotos.dataURI` antes de montar o
 *     HTML, e por isso `abrir` é assíncrono.
 *
 * ---------------------------------------------------------------------
 * ⚠ SETE COISAS QUE NÃO PODEM SER "SIMPLIFICADAS"
 * ---------------------------------------------------------------------
 *
 * 1. MEDIDA APROXIMADA NUNCA SAI SÓ COMO NÚMERO. Toda medida com
 *    `erroEstimadoPct` acima de `Tour360.ERRO_AVISO_PCT` sai com "~" e com a
 *    faixa em metros à vista. O roteiro do defeito que isso evita: o motor
 *    devolve 25,86 m com ±11,2%; escrito "25,86 m" no papel, aquilo vira
 *    dimensão de projeto na cabeça de quem lê — alguém compra esquadria, ou
 *    contesta uma medição, em cima de um número que na verdade quer dizer
 *    "entre 22,9 e 28,8". O ~ e a faixa são o que impedem o documento de
 *    afirmar mais do que a foto sabe.
 *
 * 2. FOTO QUE NÃO VEIO É AVISO, NÃO MOLDURA VAZIA. Foto na fila de upload
 *    (`Tour360.fotosPendentes`) ou que não chegou a este aparelho vira um
 *    bloco DECLARANDO a ausência, com o que fazer. Documento que omite em
 *    silêncio é pior que documento incompleto: o mesmo defeito já saiu no
 *    diário de obra, que é entregável com valor de prova, e ninguém viu.
 *
 * 3. O CURSOR DO VÍDEO ANDA SEMPRE — inclusive quando o quadro falha.
 *    Ver o comentário em `Rel.gravar`.
 *
 * 4. NÃO SE PRÉ-DECODIFICA TODO PANORAMA. Resolver os data URIs antes de
 *    gravar é obrigatório (a troca no meio da gravação não pode esperar
 *    rede); DECODIFICAR os 40 panoramas de uma vez, não — 4096×2048 em RGBA
 *    são ~33 MB por foto, e 40 delas passam de 1 GB. O navegador mata a aba
 *    e o usuário perde a gravação inteira sem entender por quê. Vale para o
 *    vídeo E para os recortes.
 *
 * 5. O VÍDEO DO TOUR PREFERE MP4. O `js/bimvideo.js` tenta WebM primeiro e
 *    está certo para o BIM, que é visto no computador. O vídeo do tour vai
 *    para o grupo da obra, e WebM costuma não abrir no iPhone: o arquivo
 *    chega e não toca, sem ninguém do lado de cá ficar sabendo. A ordem daqui
 *    é MP4 → WebM, e quando sai WebM o retorno de `gravar` traz o aviso —
 *    baseado no `ext` do arquivo que existe, não na intenção. Ver a PARTE 2.
 *
 * 6. CADA APONTAMENTO SAI COM A FOTO DELE. O panorama inteiro no papel é uma
 *    faixa 2:1 esticada; a trinca apontada vira três milímetros de borrão num
 *    canto, e quem lê conclui que ela não foi registrada. A PARTE 1A recorta
 *    a vista na direção do apontamento — e o recorte NÃO substitui o
 *    panorama, que é o que dá o contexto.
 *
 * 7. A DATA DA FOTO SAI QUALIFICADA. "Foto de" só quando ela veio do aparelho
 *    (`capturadoFonte === "exif"`, gravado por js/tour360cap.js); "anexada
 *    em" quando o arquivo não trouxe data; e "registro de", neutro, para as
 *    estações de antes desta versão, em que não dá para saber qual dos dois
 *    é. Num documento que fiscal e perito leem como prova, data sem
 *    procedência é afirmação que ninguém pode conferir.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Rel = {};

  /* ⚠ TETO DE ESPERA POR FOTO. `Fotos.baixar` não tem AbortController: com a
     foto só na nuvem e a internet ruim, o `Promise.all` pode nunca assentar —
     e aí o clique no botão não abre documento nenhum, sem erro e sem spinner,
     para sempre. Mesmo teto do diário de obra (js/gestao.js, imprimirRdo). */
  Rel.TIMEOUT_FOTO_MS = 12000;

  var ACCENT = "#0f2740";

  function M() { return global.Tour360; }
  function V() { return global.Tour360View; }
  function VID() { return global.BimVideo; }

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function txt(v) { return v == null ? "" : String(v); }

  /* `Util.esc` é o escape da casa e é ele quem vale quando o app está
     carregado. O corpo abaixo só existe para este arquivo poder ser exigido
     em Node (gate) sem arrastar js/util.js junto — não é uma segunda régua de
     escape convivendo com a primeira em produção. */
  function esc(s) {
    if (global.Util && typeof global.Util.esc === "function") return global.Util.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function numBR(v, casas) {
    var c = casas === undefined ? 2 : casas;
    return num(v, 0).toFixed(c).replace(".", ",");
  }

  /* Aceita "2026-09-15" e também "2026-09-15T13:40:00" (é o formato de
     `capturadoEm`), por isso o teste é de PREFIXO.

     ⚠ QUANDO NÃO CASA, DEVOLVE A STRING CRUA — e por isso TODO uso desta
     função dentro do HTML passa por `esc()`. `App._abrirPrint` monta o
     documento com `overlay.innerHTML = ...`, ou seja: o que chega aqui
     EXECUTA. E a tela não é a única a escrever no registro do tour — o merge
     da nuvem (união por id, sem olhar campo) e `App.importarBackup` gravam
     direto, sem passar por validação nenhuma. Um `capturadoEm` com
     "<img src=x onerror=...>" chegaria inteiro. */
  function dataBR(iso) {
    var s = txt(iso);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    return s;
  }

  /* ---------------------------------------------------------------------
   * Rótulos do tipo de comentário. As chaves são as de
   * `Tour360.TIPOS_HOTSPOT`; tipo desconhecido cai em "comentário" em vez de
   * sair sem rótulo nenhum no papel.
   * ------------------------------------------------------------------- */
  var TIPOS = {
    comentario: { rotulo: "COMENTÁRIO", cor: "#0f2740", fundo: "#eef2f7", borda: "#cbd5e1" },
    atencao: { rotulo: "ATENÇÃO", cor: "#7c2d12", fundo: "#fffbeb", borda: "#f59e0b" },
    pendencia: { rotulo: "PENDÊNCIA", cor: "#7f1d1d", fundo: "#fef2f2", borda: "#dc2626" },
    aprovado: { rotulo: "APROVADO", cor: "#14532d", fundo: "#f0fdf4", borda: "#16a34a" }
  };

  function tipoDe(t) {
    var k = txt(t);
    return Object.prototype.hasOwnProperty.call(TIPOS, k) ? TIPOS[k] : TIPOS.comentario;
  }

  /* =====================================================================
   * PARTE 1 — O RELATÓRIO FOTOGRÁFICO
   * ================================================================== */

  /* Como uma medida do tour se escreve num documento. Fica separado do HTML
     de propósito: é a regra do item 1 do cabeçalho, e o gate consegue
     exercitá-la sem montar página nenhuma.

     Entra um item de `Tour360.paginasRelatorio(...).medidas` e sai
     { tipo, rotulo, valor, precisao, aproximada, problema }. */
  Rel.textoMedida = function (medida) {
    var m = medida || {};
    var tipo = txt(m.tipo) === "altura" ? "Altura" : "Distância";
    var rotulo = txt(m.rotulo);

    if (txt(m.problema) || m.metros == null) {
      return {
        tipo: tipo, rotulo: rotulo, valor: "—", precisao: "", aproximada: false,
        problema: txt(m.problema) || "Esta medida não pôde ser recalculada com os dados atuais deste ponto."
      };
    }

    var v = num(m.metros, 0);
    var pct = num(m.erroEstimadoPct, 0);
    /* ⚠ O MESMO SINAL DO MOTOR. `Tour360` marca `aproximada` com `pct >
       ERRO_AVISO_PCT`; usar ">=" aqui faria o documento e a tela discordarem
       na fronteira, e o pior tipo de divergência é a que só aparece num
       valor. O limite vem do motor — nunca escrito à mão aqui. */
    var lim = M() ? num(M().ERRO_AVISO_PCT, 10) : 10;
    var ap = pct > lim;
    var meia = v * pct / 100;

    return {
      tipo: tipo,
      rotulo: rotulo,
      valor: (ap ? "~ " : "") + numBR(v, 2) + " m",
      precisao: ap
        ? ("entre " + numBR(v - meia, 2) + " m e " + numBR(v + meia, 2) + " m (±" + numBR(pct, 1) + "%)")
        : ("±" + numBR(pct, 1) + "%"),
      aproximada: ap,
      problema: ""
    };
  };

  /* =====================================================================
   * PARTE 1A — O RECORTE ENQUADRADO DO APONTAMENTO
   *
   * O DEFEITO QUE ISTO CONSERTA. O relatório imprimia o panorama INTEIRO com
   * uma legenda dizendo que a imagem está achatada. Quem recebe vê uma faixa
   * 2:1 esticada e, num canto dela, três milímetros de borrão — e conclui que
   * a fissura NÃO FOI REGISTRADA. O apontamento existia, a foto existia, e o
   * documento conseguia esconder os dois ao mesmo tempo.
   *
   * A conta é a mesma que já roda em dois lugares desta casa, e é copiada de
   * lá de propósito para não nascer uma terceira convenção de ângulo:
   * `Tour360.anguloParaPixel` (js/tour360.js) e o desenho retilíneo do Portal
   * (loja/portal.html, `t360Desenhar`). Uma equiretangular tem 360° na
   * largura e 180° na altura — então recortar é regra de três, e é a MESMA
   * regra de três que traduz o clique em ângulo. O que a pessoa vê no papel e
   * o que ela mediu na tela não podem divergir.
   *
   * ⚠ O RECORTE É EQUIRETANGULAR, NÃO É REPROJEÇÃO. Linha reta continua
   *   curvando um pouco — menos que no panorama aberto, mas curva. É o que o
   *   Portal já faz e é suficiente para enxergar o apontamento; prometer
   *   "foto retificada" seria mentira, e por isso a legenda do documento diz
   *   o que a imagem é.
   *
   * ⚠ E O RECORTE SAI CARIMBADO. Foto de obra perde a identidade em duas
   *   horas dentro de um grupo de mensagem: sem obra, estação e data gravadas
   *   NA IMAGEM, aquela trinca vira "uma trinca qualquer" — e reaparece meses
   *   depois atribuída a outro prédio. O carimbo é pixel, não legenda: ele
   *   sobrevive ao recorte de tela e ao encaminhamento.
   * ================================================================== */

  Rel.RECORTE_FOV = 60;          /* abertura horizontal do recorte, em graus */
  Rel.RECORTE_LARGURA = 720;     /* ~1:1 com a fonte de 4096 px num FOV de 60° */
  Rel.RECORTE_ALTURA = 480;
  Rel.RECORTE_FAIXA = 46;        /* altura do carimbo, em pixels */
  Rel.RECORTE_QUALIDADE = 0.85;
  Rel.RECORTE_FOV_MAX = 110;     /* além disso a distorção come o que se quer ver */

  /* ⚠ TETO DE RECORTES POR DOCUMENTO. Cada recorte é um JPEG de ~60 KB dentro
     do HTML da impressão; um tour com 40 estações e 6 apontamentos em cada
     passaria de 14 MB no DOM e a janela de impressão engasga (ou o navegador
     mata a aba, e o usuário perde o documento inteiro sem saber por quê). */
  Rel.MAX_RECORTES = 48;

  /* ⚠ PRAZO. Decodificar panorama de 4096 px custa tempo, e o documento tem
     de abrir mesmo assim. Estourou o prazo, os recortes que faltaram
     simplesmente não aparecem — o texto do apontamento continua lá, e nada é
     afirmado a menos. Travar o botão de relatório para ganhar miniatura seria
     trocar o documento pelo enfeite dele. */
  Rel.PRAZO_RECORTES_MS = 20000;
  Rel.TIMEOUT_IMAGEM_MS = 6000;

  function limitar(v, min, max) { return v < min ? min : (v > max ? max : v); }

  /* Onde apontar a câmera do recorte, e com que abertura.
     Puro, para o gate exercitar sem canvas: entra um ponto (ou dois, no caso
     da medida) e sai { yaw, pitch, fov, coube }.

     ⚠ A MEDIDA PRECISA CABER INTEIRA. Um recorte fixo de 60° centrado no meio
       de uma distância de 12 m corta as duas pontas: sai uma linha que entra
       por uma borda e sai pela outra, sem começo nem fim, e o valor impresso
       ao lado passa a não ter a que se referir. Então a abertura ABRE até
       caber — e, quando nem no máximo cabe, `coube` volta false para o
       documento poder dizer isso em vez de fingir. */
  Rel.enquadramento = function (a, b, opts) {
    var o = opts || {};
    var fovBase = num(o.fov, Rel.RECORTE_FOV);
    var larg = num(o.largura, Rel.RECORTE_LARGURA);
    var alt = num(o.altura, Rel.RECORTE_ALTURA);
    var prop = (larg > 0 && alt > 0) ? (alt / larg) : 0.667;

    var ya = num(a && a.yaw, 0), pa = num(a && a.pitch, 0);
    if (!b) {
      return { yaw: (M() ? M().normalizarYaw(ya) : ya), pitch: pa, fov: limitar(fovBase, 20, Rel.RECORTE_FOV_MAX), coube: true };
    }
    var yb = num(b.yaw, 0), pb = num(b.pitch, 0);
    var d = M() ? M().difYaw(ya, yb) : (yb - ya);
    var yaw = M() ? M().normalizarYaw(ya + d / 2) : (ya + d / 2);
    var pitch = (pa + pb) / 2;

    /* 1,45 de folga: a marca de cada ponta tem raio próprio e o rótulo do
       valor ocupa espaço; sem folga as pontas nascem coladas na borda. */
    var precisaH = Math.abs(d) * 1.45;
    var precisaV = Math.abs(pa - pb) * 1.45;
    /* a exigência vertical vira exigência horizontal pela proporção do
       quadro — é o mesmo fovV = fovH × (altura/largura) do desenho */
    var porV = prop > 0 ? (precisaV / prop) : precisaV;

    var querido = Math.max(fovBase, precisaH, porV);
    var fov = limitar(querido, 20, Rel.RECORTE_FOV_MAX);
    return { yaw: yaw, pitch: pitch, fov: fov, coube: querido <= Rel.RECORTE_FOV_MAX };
  };

  /* A janela de recorte dentro da foto, em pixels da FONTE. Pura e testável:
     é aqui que mora a regra de três, e é ela que tem de bater com
     `Tour360.anguloParaPixel`. */
  Rel.janelaDoRecorte = function (yaw, pitch, fov, larguraFonte, alturaFonte, larguraAlvo, alturaAlvo) {
    var iw = num(larguraFonte, 0), ih = num(alturaFonte, 0);
    var W = num(larguraAlvo, Rel.RECORTE_LARGURA), H = num(alturaAlvo, Rel.RECORTE_ALTURA);
    if (!(iw > 0) || !(ih > 0) || !(W > 0) || !(H > 0)) return { ok: false, motivo: "Imagem sem dimensão." };
    var fovH = limitar(num(fov, Rel.RECORTE_FOV), 1, 360);
    var fovV = fovH * (H / W);
    var y = M() ? M().normalizarYaw(yaw) : num(yaw, 0);
    var p = limitar(num(pitch, 0), -90, 90);
    return {
      ok: true,
      fovH: fovH, fovV: fovV, yaw: y, pitch: p,
      sw: (fovH / 360) * iw,
      sh: (fovV / 180) * ih,
      /* pode sair negativo de propósito: quem desenha dá a volta pela emenda */
      sx: ((y - fovH / 2 + 180) / 360) * iw,
      sy: ((90 - (p + fovV / 2)) / 180) * ih
    };
  };

  /* Ângulo → pixel DENTRO do recorte, ou null quando está fora dele. Mesma
     conta do Portal (`t360Tela`): null em vez de grudar o marcador na borda,
     porque marcador na borda aponta para algo que não está à vista. */
  function noRecorte(j, W, H, yaw, pitch) {
    var d = M() ? M().difYaw(j.yaw, num(yaw, 0)) : (num(yaw, 0) - j.yaw);
    if (Math.abs(d) > j.fovH / 2) return null;
    var dy = num(pitch, 0) - j.pitch;
    if (Math.abs(dy) > j.fovV / 2) return null;
    return { x: (d / j.fovH + 0.5) * W, y: (0.5 - dy / j.fovV) * H };
  }

  /* Corta o texto pela largura REAL medida no contexto, não por contagem de
     caracteres: "Bloco A — cobertura" e "IIIIIIIIIIIIIIIIIII" têm o mesmo
     tamanho em letras e larguras muito diferentes, e o carimbo estourado sai
     por cima do outro campo. */
  function cortarTexto(g, s, largMax) {
    var t = txt(s);
    if (!t) return "";
    if (g.measureText(t).width <= largMax) return t;
    while (t.length > 1 && g.measureText(t + "…").width > largMax) t = t.slice(0, -1);
    return t + "…";
  }

  /* O carimbo. Duas linhas: obra em cima, estação e data embaixo, e à direita
     o rótulo do apontamento. */
  Rel.carimbar = function (g, W, H, faixa, info) {
    var i = info || {};
    g.fillStyle = "rgba(11,26,43,.92)";
    g.fillRect(0, H - faixa, W, faixa);
    g.fillStyle = "rgba(255,255,255,.18)";
    g.fillRect(0, H - faixa, W, 1);

    g.textBaseline = "middle";
    g.textAlign = "left";

    var dir = txt(i.rotulo);
    var largDir = 0;
    if (dir) {
      g.font = "600 12px Segoe UI, Arial, sans-serif";
      dir = cortarTexto(g, dir, W * 0.34);
      largDir = g.measureText(dir).width + 18;
      g.fillStyle = "rgba(255,255,255,.72)";
      g.textAlign = "right";
      g.fillText(dir, W - 12, H - faixa * 0.5);
      g.textAlign = "left";
    }

    g.font = "bold 15px Segoe UI, Arial, sans-serif";
    g.fillStyle = "#ffffff";
    g.fillText(cortarTexto(g, txt(i.obra) || "Obra não informada", W - 24 - largDir), 12, H - faixa * 0.66);

    g.font = "12px Segoe UI, Arial, sans-serif";
    g.fillStyle = "rgba(255,255,255,.80)";
    g.fillText(cortarTexto(g, txt(i.linha2), W - 24 - largDir), 12, H - faixa * 0.24);

    g.textBaseline = "alphabetic";
  };

  /* Recorta a vista na direção do apontamento e devolve um data URI.
   *
   * opts: { yaw, pitch, b:{yaw,pitch}, fov, cor, valor, obra, estacao,
   *         linha2, rotulo, largura, altura }
   *
   * Precisa de canvas: em Node devolve { ok:false, codigo:"sem-navegador" } —
   * e quem chama trata isso como "não há recorte", nunca como erro do
   * documento.
   */
  Rel.recorte = function (img, opts) {
    var o = opts || {};
    if (!M()) return { ok: false, codigo: "sem-motor", motivo: "O motor do tour não carregou nesta página." };
    var doc = global.document;
    if (!doc || typeof doc.createElement !== "function") {
      return { ok: false, codigo: "sem-navegador", motivo: "Sem navegador para montar o recorte." };
    }
    var iw = num(img && (img.naturalWidth || img.width), 0);
    var ih = num(img && (img.naturalHeight || img.height), 0);
    if (!(iw > 0) || !(ih > 0)) return { ok: false, codigo: "sem-dimensao", motivo: "A foto não abriu." };
    /* ⚠ SÓ EQUIRETANGULAR. Numa foto comum o yaw do apontamento não quer
       dizer pixel nenhum: o recorte sairia num lugar qualquer da imagem, com
       cara de precisão. Sem geometria, sem recorte. */
    if (!M().ehEquiretangular(iw, ih)) {
      return { ok: false, codigo: "nao-equirect", motivo: "Esta foto não é 360 — não há como recortar por ângulo." };
    }

    var W = Math.round(num(o.largura, Rel.RECORTE_LARGURA));
    var Himg = Math.round(num(o.altura, Rel.RECORTE_ALTURA));
    var faixa = Math.round(num(o.faixa, Rel.RECORTE_FAIXA));
    var H = Himg + faixa;

    var enq = Rel.enquadramento({ yaw: o.yaw, pitch: o.pitch }, o.b || null, { fov: o.fov, largura: W, altura: Himg });
    var j = Rel.janelaDoRecorte(enq.yaw, enq.pitch, enq.fov, iw, ih, W, Himg);
    if (!j.ok) return { ok: false, codigo: "sem-dimensao", motivo: j.motivo };

    var cv = doc.createElement("canvas");
    cv.width = W; cv.height = H;
    var g = cv.getContext ? cv.getContext("2d") : null;
    if (!g) return { ok: false, codigo: "sem-canvas", motivo: "Este navegador não montou a tela do recorte." };

    /* fundo escuro: o que ficar fora da foto (acima do zênite, abaixo do
       nadir) aparece como ausência, não como sombra do ambiente */
    g.fillStyle = "#0b1a2b";
    g.fillRect(0, 0, W, H);

    /* --- a imagem, com volta pela emenda e corte no topo/base --- */
    var escY = j.sh > 0 ? (Himg / j.sh) : 0;
    var sy0 = Math.max(0, j.sy), sy1 = Math.min(ih, j.sy + j.sh);
    if (sy1 > sy0 && escY > 0) {
      var dy = (sy0 - j.sy) * escY;
      var dh = (sy1 - sy0) * escY;
      var escX = W / j.sw;
      var sx = j.sx;
      while (sx < 0) sx += iw;
      sx = sx % iw;
      /* ⚠ A FOTO DÁ A VOLTA. Quando o recorte cruza a emenda ele vira dois
         desenhos; sem isto, o apontamento que está atrás do fotógrafo sai com
         uma tarja preta do lado — e quem lê acha que a foto está furada. */
      var parte1 = Math.min(j.sw, iw - sx);
      try {
        g.drawImage(img, sx, sy0, parte1, sy1 - sy0, 0, dy, parte1 * escX, dh);
        if (parte1 < j.sw) {
          g.drawImage(img, 0, sy0, j.sw - parte1, sy1 - sy0, parte1 * escX, dy, (j.sw - parte1) * escX, dh);
        }
      } catch (e) {
        return { ok: false, codigo: "desenho", motivo: "Não consegui recortar esta foto." };
      }
    }

    /* --- a marca do apontamento --- */
    var cor = txt(o.cor) || "#38bdf8";
    var pa = noRecorte(j, W, Himg, o.yaw, o.pitch);
    var pb = o.b ? noRecorte(j, W, Himg, o.b.yaw, o.b.pitch) : null;

    if (pa && pb) {
      g.beginPath();
      g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y);
      g.lineWidth = 3; g.strokeStyle = cor; g.stroke();
      anel(g, pa.x, pa.y, 7, cor);
      anel(g, pb.x, pb.y, 7, cor);
      if (txt(o.valor)) {
        etiqueta(g, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - 16, txt(o.valor), cor);
      }
    } else if (pa || pb) {
      var p = pa || pb;
      /* ⚠ ANEL VAZADO, NÃO BOLINHA CHEIA. O apontamento costuma ser uma
         trinca de milímetros bem no centro: marcador preenchido tapa
         exatamente o que o documento existe para mostrar. */
      anel(g, p.x, p.y, 26, cor);
    }

    Rel.carimbar(g, W, H, faixa, {
      obra: o.obra,
      linha2: o.linha2 || (txt(o.estacao) + (txt(o.data) ? " · " + txt(o.data) : "")),
      rotulo: o.rotulo
    });

    var uri = "";
    try { uri = cv.toDataURL("image/jpeg", Rel.RECORTE_QUALIDADE); } catch (e) { uri = ""; }
    if (!uri) return { ok: false, codigo: "exportar", motivo: "Não consegui exportar o recorte." };
    return { ok: true, dataURI: uri, fov: Math.round(enq.fov), coube: enq.coube, largura: W, altura: H };
  };

  function anel(g, x, y, r, cor) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.lineWidth = 4; g.strokeStyle = "rgba(0,0,0,.55)"; g.stroke();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.lineWidth = 2.2; g.strokeStyle = cor; g.stroke();
  }

  function etiqueta(g, x, y, texto, cor) {
    g.font = "bold 14px Segoe UI, Arial, sans-serif";
    var larg = g.measureText(texto).width + 14;
    g.fillStyle = "rgba(0,0,0,.66)";
    g.fillRect(x - larg / 2, y - 11, larg, 22);
    g.fillStyle = cor;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(texto, x, y);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
  }

  /* Carrega um data URI e devolve a imagem (ou null). Sempre resolve: imagem
     que não abre não pode segurar o relatório. */
  function carregarImagem(dataURI) {
    return new Promise(function (res) {
      try {
        if (!dataURI || typeof global.Image !== "function") { res(null); return; }
        var img = new global.Image();
        var pronto = false;
        var t = global.setTimeout(function () { if (!pronto) { pronto = true; res(null); } }, Rel.TIMEOUT_IMAGEM_MS);
        img.onload = function () { if (!pronto) { pronto = true; global.clearTimeout(t); res(img); } };
        img.onerror = function () { if (!pronto) { pronto = true; global.clearTimeout(t); res(null); } };
        img.src = dataURI;
      } catch (e) { res(null); }
    });
  }

  /* Recorta a partir do data URI (assíncrono porque a imagem precisa abrir). */
  Rel.recortarFoto = function (dataURI, opts) {
    return carregarImagem(dataURI).then(function (img) {
      if (!img) return { ok: false, codigo: "nao-abre", motivo: "A foto não abriu para recortar." };
      return Rel.recorte(img, opts);
    });
  };

  /* Chave do recorte no mapa. Prefixada de propósito: um pid chamado
     "constructor" cairia no protótipo do objeto e devolveria uma função no
     lugar de uma imagem. */
  Rel.chaveRecorte = function (pid, tipo, i) {
    return "r:" + txt(pid) + "|" + txt(tipo) + i;
  };

  /* Monta TODOS os recortes de um tour, um panorama por vez.
   *
   * ⚠ UM DE CADA VEZ, e a imagem é solta antes da próxima. Um equiretangular
   *   de 4096×2048 ocupa ~33 MB decodificado; abrir os 40 de uma vez passa de
   *   1 GB e o navegador mata a aba — é o mesmo item 4 do cabeçalho deste
   *   arquivo, que já valia para o vídeo.
   *
   * Devolve { recortes, feitos, pulados, estourouPrazo, cortadoPeloTeto }.
   */
  Rel.recortesDoTour = function (tour, fotos, opts) {
    var o = opts || {};
    var vazio = { recortes: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 };
    if (!M()) return Promise.resolve(vazio);
    if (!global.document || typeof global.document.createElement !== "function") return Promise.resolve(vazio);

    var t = tour || {};
    var mapaFotos = fotos || {};
    var pgs = M().paginasRelatorio(t, { soComFoto: !!o.soComFoto, soAtencao: !!o.soAtencao });
    var limite = Math.max(0, Math.round(num(o.maxRecortes, Rel.MAX_RECORTES)));
    var prazo = (global.Date && global.Date.now ? global.Date.now() : new Date().getTime()) + num(o.prazoMs, Rel.PRAZO_RECORTES_MS);

    var saida = { recortes: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 };
    var i = 0;

    function agora() { return (global.Date && global.Date.now) ? global.Date.now() : new Date().getTime(); }

    function proximo() {
      if (i >= pgs.length) return Promise.resolve(saida);
      var pg = pgs[i++];
      var dataURI = Object.prototype.hasOwnProperty.call(mapaFotos, pg.pid) ? mapaFotos[pg.pid] : "";
      var pedidos = Rel.apontamentosDe(t, pg, o);
      if (!dataURI || txt(pg.tipo) !== "equirect" || !pedidos.length) return proximo();

      if (agora() > prazo) { saida.estourouPrazo = true; saida.pulados += pedidos.length; return proximo(); }

      return carregarImagem(dataURI).then(function (img) {
        if (!img) { saida.pulados += pedidos.length; return null; }
        for (var k = 0; k < pedidos.length; k++) {
          if (saida.feitos >= limite) { saida.cortadoPeloTeto++; continue; }
          var r = Rel.recorte(img, pedidos[k].opts);
          if (r && r.ok) {
            saida.recortes[pedidos[k].chave] = r.dataURI;
            saida.feitos++;
          } else {
            saida.pulados++;
          }
        }
        /* ⚠ soltar a referência aqui é o que impede a soma dos panoramas
           ficar viva até o fim do laço */
        img = null;
        return null;
      })["catch"](function () { saida.pulados += pedidos.length; return null; }).then(proximo);
    }

    return proximo()["catch"](function () { return saida; });
  };

  /* O que merece recorte numa página, já com a chave e as opções de desenho.
     Separado para o gate exercitar a LISTA sem canvas nenhum. */
  Rel.apontamentosDe = function (tour, pg, opts) {
    var o = opts || {};
    var lista = [];
    if (!M() || !pg) return lista;
    var ponto = M().pontoDe(tour, pg.pid) || {};
    var obra = txt(o.obraNome) || txt(tour && tour.obraNome);
    var estacao = txt(pg.nome) || "Ponto";
    var quando = Rel.legendaData(pg, ponto, tour && tour.data);
    var linha2 = estacao + (quando ? " · " + quando : "");

    var cs = pg.comentarios || [], i;
    for (i = 0; i < cs.length; i++) {
      var tp = tipoDe(cs[i].tipo);
      lista.push({
        chave: Rel.chaveRecorte(pg.pid, "c", i),
        opts: {
          yaw: num(cs[i].yaw, 0), pitch: num(cs[i].pitch, 0),
          cor: tp.borda, obra: obra, linha2: linha2, rotulo: tp.rotulo
        }
      });
    }

    /* ⚠ OS ÂNGULOS DA MEDIDA SÓ EXISTEM NO PONTO CRU. `paginasRelatorio`
       devolve o valor em metros e a faixa de erro, não as duas pontas — e é
       delas que sai o enquadramento. Por isso a medida é lida daqui, do
       registro, e não da página. */
    var ms = ponto.medidas || [];
    var pgm = pg.medidas || [];
    for (i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (!m || !m.a || !m.b) continue;
      var d = pgm[i] ? Rel.textoMedida(pgm[i]) : null;
      lista.push({
        chave: Rel.chaveRecorte(pg.pid, "m", i),
        opts: {
          yaw: num(m.a.yaw, 0), pitch: num(m.a.pitch, 0),
          b: { yaw: num(m.b.yaw, 0), pitch: num(m.b.pitch, 0) },
          cor: (d && d.aproximada) ? "#f59e0b" : "#22c55e",
          valor: d ? d.valor : "",
          obra: obra, linha2: linha2,
          rotulo: (d ? d.tipo : "Medida") + (txt(m.rotulo) ? " — " + txt(m.rotulo) : "")
        }
      });
    }
    return lista;
  };

  /* Como a data desta estação se escreve — e é AQUI que a honestidade da data
     mora, para o carimbo da imagem e o cabeçalho da página dizerem a mesma
     coisa.

     ⚠ TRÊS CASOS, TRÊS FRASES, e um deles é "não sei":
       · "exif"  → a data veio do aparelho que fotografou (informada, não
                   verificada — a nota do rodapé explica);
       · "anexo" → o arquivo não trouxe data; o que existe é o momento em que
                   a foto entrou no aplicativo, e o texto DIZ isso;
       · sem `capturadoFonte` → estação de antes desta versão. Não dá para
                   saber qual dos dois é, então o texto fica neutro
                   ("registro de"). Escrever "foto de" ali seria repetir, com
                   dado velho, exatamente a afirmação que este conserto tirou. */
  Rel.legendaData = function (pg, ponto, dataVisita) {
    var quando = txt(pg && pg.capturadoEm);
    var fonte = txt(ponto && ponto.capturadoFonte);
    if (!quando) return txt(dataVisita) ? "visita de " + dataBR(dataVisita) : "";
    if (fonte === "exif") return "foto de " + dataBR(quando);
    if (fonte === "anexo") return "anexada em " + dataBR(quando);
    if (fonte === "manual") return "foto de " + dataBR(quando);
    return "registro de " + dataBR(quando);
  };

  Rel.notaDataDe = function (ponto) {
    var f = txt(ponto && ponto.capturadoFonte);
    if (f === "exif") return "data informada pelo aparelho que fotografou; ela não é verificada.";
    if (f === "anexo") return "esta foto não trouxe a data do aparelho — a data é a do momento em que ela entrou no aplicativo.";
    if (f === "manual") return "data informada por quem anexou a foto.";
    return "";
  };

  function caixaAviso(htmlInterno) {
    return '<div style="border:1px solid #f59e0b;border-radius:6px;padding:7px 10px;font-size:10.5px;color:#7c2d12;background:#fffbeb;margin-bottom:8px">'
      + htmlInterno + "</div>";
  }

  function chip(valor, rot) {
    return '<span style="display:inline-block;border:1px solid #cbd5e1;border-radius:12px;padding:2px 10px;font-size:10.5px;color:#334155;margin:0 6px 6px 0">'
      + "<b>" + esc(valor) + "</b> " + esc(rot) + "</span>";
  }

  /* A miniatura enquadrada, ao lado do texto do apontamento.

     ⚠ ELA NÃO SUBSTITUI O PANORAMA, ela o completa. O panorama mostra o
       CONTEXTO (de onde a foto foi tirada, o que há em volta); o recorte
       mostra O QUE está sendo apontado. Trocar um pelo outro reabre o defeito
       por outro lado: sem contexto, quem lê não sabe em que parede aquilo
       está. */
  function figuraRecorte(uri) {
    if (!uri) return "";
    return '<img src="' + esc(uri) + '" alt="" style="width:46%;max-width:300px;border:1px solid #cbd5e1;border-radius:4px;display:block;flex:none">';
  }

  function linhaApontamento(uri, htmlTexto) {
    if (!uri) return htmlTexto;
    return '<div style="display:flex;gap:9px;align-items:flex-start">'
      + figuraRecorte(uri)
      + '<div style="flex:1;min-width:0">' + htmlTexto + "</div></div>";
  }

  function blocoComentarios(lista, recortes, pid) {
    if (!lista || !lista.length) return "";
    var h = '<div style="font-weight:800;font-size:10.5px;letter-spacing:.4px;margin:10px 0 5px">COMENTÁRIOS DESTE PONTO (' + lista.length + ")</div>";
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i], t = tipoDe(c.tipo);
      var miolo = '<span style="font-size:9px;font-weight:800;letter-spacing:.5px;color:' + t.cor + '">' + t.rotulo + "</span>"
        + '<div style="font-size:11.5px;color:#111;margin-top:2px">' + esc(txt(c.texto) || "(sem texto)") + "</div>"
        + '<div style="font-size:9.5px;color:#64748b;margin-top:3px">'
        + (txt(c.autor) ? esc(c.autor) : "")
        + (txt(c.autor) && txt(c.em) ? " · " : "")
        + (txt(c.em) ? esc(dataBR(c.em)) : "")
        /* onde no panorama o comentário está: é isso que deixa quem lê o papel
           reencontrar o ponto exato dentro do tour, no aplicativo */
        + " · giro " + numBR(c.yaw, 0) + "°, inclinação " + numBR(c.pitch, 0) + "°"
        + "</div>";
      h += '<div style="border:1px solid ' + t.borda + ';border-left-width:4px;border-radius:5px;background:' + t.fundo + ';padding:6px 9px;margin-bottom:6px;page-break-inside:avoid">'
        + linhaApontamento(pegar(recortes || {}, Rel.chaveRecorte(pid, "c", i)), miolo)
        + "</div>";
    }
    return h;
  }

  function blocoMedidas(lista, recortes, pid) {
    if (!lista || !lista.length) return "";
    var h = '<div style="font-weight:800;font-size:10.5px;letter-spacing:.4px;margin:10px 0 5px">MEDIDAS TIRADAS NESTE PONTO (' + lista.length + ")</div>"
      + '<table style="width:100%;border-collapse:collapse;font-size:11px">'
      + '<thead><tr style="background:' + ACCENT + ';color:#fff">'
      + '<th style="border:1px solid #bbb;padding:4px 6px;text-align:left">O que foi medido</th>'
      + '<th style="border:1px solid #bbb;padding:4px 6px;width:24%">Valor</th>'
      + '<th style="border:1px solid #bbb;padding:4px 6px;width:38%">Precisão</th>'
      + "</tr></thead><tbody>";
    var i, comRecorte = [];
    for (i = 0; i < lista.length; i++) {
      var d = Rel.textoMedida(lista[i]);
      var fundo = d.aproximada ? "#fffbeb" : "#fff";
      h += '<tr style="background:' + fundo + '">'
        + '<td style="border:1px solid #bbb;padding:4px 6px"><b>' + esc(d.tipo) + "</b>" + (d.rotulo ? " — " + esc(d.rotulo) : "") + "</td>"
        + '<td style="border:1px solid #bbb;padding:4px 6px;text-align:center;font-weight:700' + (d.aproximada ? ";color:#7c2d12" : "") + '">' + esc(d.valor) + "</td>"
        + '<td style="border:1px solid #bbb;padding:4px 6px;font-size:10px;color:#475569">' + esc(d.problema || d.precisao) + "</td>"
        + "</tr>";
      var uri = pegar(recortes || {}, Rel.chaveRecorte(pid, "m", i));
      if (uri) comRecorte.push({ uri: uri, rotulo: esc(d.tipo) + (d.rotulo ? " — " + esc(d.rotulo) : "") + ": " + esc(d.valor) });
    }
    h += "</tbody></table>";

    /* ⚠ O RECORTE DA MEDIDA VEM DEPOIS DA TABELA, não dentro dela. Imagem em
       célula de tabela quebra a paginação da janela de impressão: a linha vai
       para a folha seguinte e a foto fica sozinha na anterior. */
    if (comRecorte.length) {
      h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:7px">';
      for (i = 0; i < comRecorte.length; i++) {
        h += '<figure style="margin:0;width:47%;page-break-inside:avoid">'
          + '<img src="' + esc(comRecorte[i].uri) + '" alt="" style="width:100%;border:1px solid #cbd5e1;border-radius:4px;display:block">'
          + '<figcaption style="font-size:9px;color:#64748b;padding-top:2px">' + comRecorte[i].rotulo + "</figcaption></figure>";
      }
      h += "</div>";
    }
    return h;
  }

  function molduraFoto(dataURI, pg) {
    if (dataURI) {
      /* ⚠ a MESMA régua do motor: `Tour360.validar` conta como foto comum
         tudo que não for "equirect". Testar por "plana" chamaria um tipo
         desconhecido de panorama e a legenda mentiria. */
      var eh360 = txt(pg.tipo) === "equirect";
      return '<figure style="margin:0 0 8px;border:1px solid #ddd;border-radius:6px;overflow:hidden;page-break-inside:avoid">'
        + '<img src="' + esc(dataURI) + '" style="width:100%;max-height:420px;object-fit:contain;display:block;background:#0b1a2b">'
        + '<figcaption style="padding:4px 8px;font-size:9.5px;color:#555;background:#f8fafc">'
        + (eh360
          ? "Foto panorâmica 360° — no aplicativo ela gira; no papel ela aparece aberta, com as bordas esquerda e direita se encontrando atrás de quem fotografou."
          : "Foto comum (não gira em 360°).")
        + "</figcaption></figure>";
    }
    /* ⚠ item 2 do cabeçalho: sem foto NÃO vira moldura vazia */
    if (!pg.foto) {
      return caixaAviso("<b>Este ponto ainda não foi fotografado.</b> Ele existe no tour (é o que faz a comparação com a próxima visita ser possível), mas não há imagem para este documento.");
    }
    return caixaAviso("<b>A foto deste ponto não entrou no documento.</b> Os arquivos não estão neste aparelho e ainda não chegaram à nuvem. Abra o tour com internet, espere as fotos subirem e gere o relatório de novo.");
  }

  function paginaHTML(pg, fotos, dataVisita, ultima, recortes, ponto) {
    var dataURI = (fotos && Object.prototype.hasOwnProperty.call(fotos, pg.pid)) ? fotos[pg.pid] : "";
    /* a classe existe para css/tour360.css poder mandar na paginacao junto;
       o page-break inline continua porque o documento tambem e aberto por
       janela de impressao, onde a folha do app pode nao estar carregada */
    var h = '<div class="t360-estacao" style="page-break-inside:avoid' + (ultima ? "" : ";page-break-after:always") + ';padding-top:6px">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid ' + ACCENT + ';padding-bottom:4px;margin-bottom:8px">'
      + '<b style="font-size:13px;color:' + ACCENT + '">' + esc(txt(pg.nome) || "Ponto") + "</b>"
      /* ⚠ A DATA SAI QUALIFICADA. "foto de" só quando se sabe que a data é a
         do disparo; "anexada em" quando a foto não trouxe data; e "registro
         de", neutro, para estação de antes desta versão, em que não dá para
         saber. Ver `Rel.legendaData` e o rodapé sobre datas. */
      + '<span style="font-size:10px;color:#64748b">'
      + (txt(pg.nivel) ? esc(pg.nivel) + " · " : "")
      + esc(Rel.legendaData(pg, ponto, dataVisita))
      + "</span></div>"
      + molduraFoto(dataURI, pg)
      + blocoComentarios(pg.comentarios, recortes, pg.pid)
      + blocoMedidas(pg.medidas, recortes, pg.pid);
    if (!(pg.comentarios || []).length && !(pg.medidas || []).length) {
      h += '<div style="font-size:10.5px;color:#64748b;margin-top:8px">Sem comentários e sem medidas neste ponto.</div>';
    }
    return h + "</div>";
  }

  /* O miolo do documento. SÍNCRONO de propósito: quem chama já resolveu as
     fotos (`Rel.resolverFotos`) e entrega o mapa pronto em `opts.fotos` — é
     assim que o mesmo HTML serve para a impressão e para um teste que não
     tem IndexedDB nenhum.
     opts: { fotos, recortes, soComFoto, soAtencao, obraNome, local, autor } */
  Rel.html = function (tour, opts) {
    var o = opts || {};
    if (!M()) {
      return '<p style="font-size:12px;color:#7f1d1d">O motor do tour (js/tour360.js) não carregou nesta página — sem ele não há relatório.</p>';
    }
    var t = tour || {};
    var fotos = o.fotos || {};
    /* os recortes vêm PRONTOS (Rel.recortesDoTour), pelo mesmo motivo das
       fotos: este HTML é síncrono para servir à impressão e ao gate. Mapa
       vazio é caso normal — em Node não há canvas, e o documento sai sem
       miniatura sem afirmar nada a menos. */
    var recortes = o.recortes || {};
    var pgs = M().paginasRelatorio(t, { soComFoto: !!o.soComFoto, soAtencao: !!o.soAtencao });
    var res = M().resumo(t);

    var i, semArquivo = 0;
    for (i = 0; i < pgs.length; i++) {
      if (pgs[i].foto && !(Object.prototype.hasOwnProperty.call(fotos, pgs[i].pid) && fotos[pgs[i].pid])) semArquivo++;
    }

    var h = '<table style="width:100%;font-size:11.5px;margin-bottom:10px">'
      + "<tr><td><b>Obra:</b> " + esc(txt(o.obraNome) || txt(t.obraNome) || "—") + "</td>"
      + "<td><b>Visita:</b> " + esc(dataBR(t.data)) + "</td></tr>"
      + "<tr><td><b>Tour:</b> " + esc(txt(t.titulo) || "—") + "</td>"
      + "<td><b>Responsável:</b> " + esc(txt(o.autor) || txt(t.autor) || "—") + "</td></tr>"
      + (txt(o.local) ? '<tr><td colspan="2"><b>Local:</b> ' + esc(o.local) + "</td></tr>" : "")
      + "</table>";

    h += '<div style="margin-bottom:10px">'
      + chip(res.pontos, res.pontos === 1 ? "ponto" : "pontos")
      + chip(res.comFoto, "com foto")
      + (res.semFoto ? chip(res.semFoto, "sem foto") : "")
      + chip(res.comentarios, res.comentarios === 1 ? "comentário" : "comentários")
      + (res.pontosDeAtencao ? chip(res.pontosDeAtencao, "de atenção") : "")
      + chip(res.medidas, res.medidas === 1 ? "medida" : "medidas")
      + "</div>";

    /* ⚠ item 2 do cabeçalho, agora no alto do documento: quem recebe o PDF
       precisa saber do buraco ANTES de folhear e concluir que a obra não foi
       fotografada. */
    if (res.fotosPendentes) {
      h += caixaAviso("<b>" + res.fotosPendentes + " foto(s) desta visita ainda não subiram para a nuvem.</b> "
        + "Elas estão no aparelho que fotografou e só aparecem para quem estiver nele. "
        + "Abra o tour naquele aparelho com internet para que subam.");
    }
    if (semArquivo) {
      h += caixaAviso("<b>" + semArquivo + " ponto(s) tinham foto, mas ela não entrou neste documento.</b> "
        + "Os arquivos não estão neste aparelho e ainda não chegaram à nuvem — o documento sai sem eles, e é isto que este aviso declara.");
    }
    if (res.semFoto && !o.soComFoto) {
      h += caixaAviso("<b>" + res.semFoto + " ponto(s) deste tour ainda não foram fotografados.</b> "
        + "Eles continuam no relatório porque são o que permite comparar esta visita com a próxima, do mesmo lugar.");
    }

    if (!pgs.length) {
      return h + caixaAviso("<b>Não há nada para mostrar neste relatório.</b> "
        + (o.soComFoto ? "Nenhum ponto deste tour tem foto." : "Este tour ainda não tem ponto nenhum."));
    }

    /* A nota das medidas só entra quando existe medida aproximada: aviso que
       aparece sempre vira moldura e a pessoa para de ler. */
    var temAprox = false;
    for (i = 0; i < pgs.length; i++) {
      var ms = pgs[i].medidas || [];
      for (var k = 0; k < ms.length; k++) if (Rel.textoMedida(ms[k]).aproximada) { temAprox = true; break; }
      if (temAprox) break;
    }

    /* quais rodapés de honestidade este documento precisa: eles só aparecem
       quando há motivo, porque nota que sai sempre vira moldura e a pessoa
       para de ler */
    var temExif = false, temAnexo = false, temNeutro = false, temRecorte = false;
    for (i = 0; i < pgs.length; i++) {
      var pt = M().pontoDe(t, pgs[i].pid) || {};
      var fonte = txt(pt.capturadoFonte);
      if (fonte === "exif" || fonte === "manual") temExif = true;
      else if (fonte === "anexo") temAnexo = true;
      /* ⚠ ESTAÇÃO DE ANTES DESTA VERSÃO conta também, e é o caso mais comum
         hoje: ela tem data e não tem procedência, e por isso sai como
         "registro de". Sem esta linha, o documento inteiro de um tour antigo
         usaria uma palavra que ninguém explica em lugar nenhum — e palavra
         nova sem explicação é lida como erro do sistema. */
      else if (txt(pgs[i].capturadoEm)) temNeutro = true;
    }
    for (var ch in recortes) { if (Object.prototype.hasOwnProperty.call(recortes, ch)) { temRecorte = true; break; } }
    var temNotaData = temExif || temAnexo || temNeutro;
    var temRodape = temAprox || temNotaData || temRecorte;

    h += '<div style="border-top:1px solid #ddd;margin:12px 0 0"></div>';
    for (i = 0; i < pgs.length; i++) {
      h += paginaHTML(pgs[i], fotos, t.data, i === pgs.length - 1 && !temRodape, recortes, M().pontoDe(t, pgs[i].pid));
    }

    if (temRecorte) {
      h += '<div style="page-break-inside:avoid;margin-top:12px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;padding:8px 10px;font-size:10.5px;color:#334155">'
        + "<b>Sobre as fotos menores, ao lado de cada apontamento</b><br>"
        + "Cada uma é um recorte de cerca de " + numBR(Rel.RECORTE_FOV, 0) + "° da própria foto 360 da estação, na direção do que está sendo apontado — "
        + "não é outra fotografia, e nada foi acrescentado a ela. Por sair de uma imagem 360, linhas retas ainda curvam um pouco. "
        + "Obra, estação e data vão gravadas dentro da imagem para que ela continue identificada depois de encaminhada."
        + "</div>";
    }

    if (temNotaData) {
      h += '<div style="page-break-inside:avoid;margin-top:8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;padding:8px 10px;font-size:10.5px;color:#334155">'
        + "<b>Sobre as datas das fotos</b><br>"
        + (temExif
          ? '"Foto de" é a data que o APARELHO gravou no arquivo no momento do disparo. Ela é informada pelo aparelho e não é verificada: relógio ou fuso desacertados gravam o que estiver no aparelho. '
          : "")
        + (temAnexo
          ? '"Anexada em" quer dizer que o arquivo NÃO trouxe a data do disparo (é o que acontece com print de tela e com foto reenviada por aplicativo de mensagem); a data mostrada é a do momento em que a foto entrou no aplicativo, e pode ser posterior à visita. '
          : "")
        + (temNeutro
          ? '"Registro de" é a data guardada na estação sem que se saiba se ela veio do aparelho ou do momento do anexo — é o caso das estações fotografadas antes desta versão. Para essas, confira a data com quem esteve na obra antes de usá-la como referência.'
          : "")
        + "</div>";
    }

    if (temAprox) {
      h += '<div style="page-break-inside:avoid;margin-top:8px;border:1px solid #f59e0b;border-radius:6px;background:#fffbeb;padding:8px 10px;font-size:10.5px;color:#7c2d12">'
        + "<b>Sobre as medidas marcadas com ~</b><br>"
        + "As medidas deste relatório saem do ângulo dentro da foto panorâmica e da altura em que a câmera estava — não de trena. "
        + "As marcadas com <b>~</b> passaram de ±" + numBR(M().ERRO_AVISO_PCT, 0) + "% de erro estimado: para elas o documento mostra a FAIXA em metros, "
        + "porque o número sozinho seria lido como dimensão de projeto, e não é isso que ele é. "
        + "Servem para ordem de grandeza e para conferir o que se vê; conferência de projeto se faz em campo."
        + "</div>";
    }
    return h;
  };

  /* ---------------------------------------------------------------------
   * Resolver as fotos (assíncrono, com teto por foto)
   * ------------------------------------------------------------------- */

  function resolverUm(ref) {
    if (!ref) return Promise.resolve("");
    if (ref.d) return Promise.resolve(ref.d);      /* formato velho: os bytes já estão no registro */
    var F = global.Fotos;
    if (!F || typeof F.dataURI !== "function") return Promise.resolve("");
    return Promise.race([
      F.dataURI(ref).then(function (d) { return d || ""; }),
      new Promise(function (res) { global.setTimeout(function () { res(""); }, Rel.TIMEOUT_FOTO_MS); })
    ])["catch"](function () { return ""; });
  }

  /* Devolve { fotos: {pid: dataURI}, faltando, comRef, total }. `faltando`
     conta o ponto que TINHA referência de foto e mesmo assim voltou vazio —
     é ele que vira o aviso do documento. */
  Rel.resolverFotos = function (tour, opts) {
    var o = opts || {};
    var ps = ((tour && tour.pontos) || []);
    var alvos = [], i;
    for (i = 0; i < ps.length; i++) {
      if (o.soComFoto && !ps[i].foto) continue;
      alvos.push(ps[i]);
    }
    return Promise.all(alvos.map(function (p) {
      return resolverUm(p.foto).then(function (d) {
        return { pid: txt(p.pid), d: d || "", temRef: !!p.foto };
      });
    })).then(function (lista) {
      var mapa = {}, faltando = 0, comRef = 0, k;
      for (k = 0; k < lista.length; k++) {
        if (lista[k].temRef) comRef++;
        if (lista[k].d) mapa[lista[k].pid] = lista[k].d;
        else if (lista[k].temRef) faltando++;
      }
      return { fotos: mapa, faltando: faltando, comRef: comRef, total: lista.length };
    });
  };

  /* Abre o documento pronto para imprimir. Assíncrono porque as fotos são
     assíncronas — ver o cabeçalho.
     Resolve { ok, paginas, faltando, pendentes } ou { ok:false, motivo }. */
  Rel.abrir = function (tour, opts) {
    var o = opts || {};
    if (!M()) return Promise.resolve({ ok: false, motivo: "O motor do tour não carregou nesta página." });

    var t = tour || {};
    var res = M().resumo(t);
    if (!res.pontos) {
      return Promise.resolve({ ok: false, motivo: "Este tour ainda não tem ponto nenhum — não há relatório para gerar." });
    }
    if (o.soComFoto && !res.comFoto) {
      return Promise.resolve({ ok: false, motivo: "Nenhum ponto deste tour tem foto ainda." });
    }

    /* o mesmo recado do diário: resolver foto do servidor demora, e sem aviso
       o usuário clica de novo achando que o botão não pegou */
    if (res.comFoto && global.UI && typeof global.UI.toast === "function") {
      try { global.UI.toast("Preparando o relatório do tour…", "ok"); } catch (e) {}
    }

    return Rel.resolverFotos(t, o).then(function (r) {
      /* ⚠ OS RECORTES NÃO PODEM SEGURAR O DOCUMENTO. `recortesDoTour` tem
         prazo próprio e sempre resolve; e se ainda assim algo estourar, o
         `catch` devolve mapa vazio e o relatório sai como saía antes — com o
         panorama e o texto. Trocar o documento pela miniatura dele seria pior
         que não ter miniatura. */
      return Rel.recortesDoTour(t, r.fotos, o)["catch"](function () {
        return { recortes: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 };
      }).then(function (rc) { return { r: r, rc: rc }; });
    }).then(function (par) {
      var r = par.r, rc = par.rc;
      var op = {
        fotos: r.fotos,
        recortes: rc.recortes,
        soComFoto: !!o.soComFoto,
        soAtencao: !!o.soAtencao,
        obraNome: o.obraNome,
        local: o.local,
        autor: o.autor
      };
      var corpo = Rel.html(t, op);
      var titulo = "Tour 360 — " + (txt(t.titulo) || dataBR(t.data));
      var cabec = "TOUR VIRTUAL DA OBRA · RELATÓRIO FOTOGRÁFICO";

      var G = global.Gestao;
      if (G && typeof G._docShell === "function" && typeof G._abrirDoc === "function") {
        G._abrirDoc(titulo, G._docShell(cabec, ACCENT, corpo, "tour360"));
      } else if (global.App && typeof global.App._abrirPrint === "function") {
        /* sem a Gestão carregada o documento sai sem o cabeçalho da empresa,
           mas sai — recusar aqui deixaria o usuário sem saída nenhuma */
        global.App._abrirPrint(titulo, corpo);
      } else {
        return { ok: false, motivo: "Não há como abrir o documento nesta tela." };
      }
      return {
        ok: true,
        paginas: M().paginasRelatorio(t, { soComFoto: !!o.soComFoto, soAtencao: !!o.soAtencao }).length,
        faltando: r.faltando,
        pendentes: res.fotosPendentes,
        /* o que a tela pode dizer sobre as miniaturas — sem inventar: são os
           números do que realmente foi montado */
        recortes: rc.feitos,
        recortesPulados: rc.pulados,
        recortesCortados: rc.cortadoPeloTeto,
        recortesNoPrazo: !rc.estourouPrazo
      };
    });
  };

  /* =====================================================================
   * PARTE 2 — O VÍDEO
   *
   * ---------------------------------------------------------------------
   * ⚠ AQUI O MP4 VEM PRIMEIRO — E ISSO NÃO É PREFERÊNCIA, É DESTINO
   * ---------------------------------------------------------------------
   * `js/bimvideo.js` tenta WebM (VP9, VP8, genérico) e só então MP4. Para o
   * vídeo do BIM está certo: ele é aberto no computador, e o VP9 tem metade
   * do tamanho na mesma qualidade.
   *
   * O vídeo do TOUR tem outro destino: o grupo da obra. Ele sai daqui e cai
   * no telefone do cliente, do fiscal e do mestre — e uma parte deles usa
   * iPhone, onde o WebM não abre no aplicativo de Fotos. O arquivo chega,
   * ocupa espaço e não toca. O engenheiro não fica sabendo: para ele o vídeo
   * abriu normalmente no computador dele.
   *
   * Por isso a ordem AQUI é MP4 → WebM. O `js/bimvideo.js` não muda: quem
   * decide o formato é o uso, e são dois usos diferentes no mesmo aplicativo.
   *
   * ⚠ COMO A ESCOLHA CHEGA AO GRAVADOR. `BimVideo.gravar` chama
   *   `BimVideo.suportado()` sozinho, sem aceitar formato por parâmetro — e
   *   este arquivo NÃO pode alterá-lo. A saída é trocar `suportado` pela
   *   escolha deste uso durante a chamada e devolvê-lo em seguida. A troca é
   *   SÍNCRONA e dura o tempo de `vid.gravar(...)` retornar, porque o
   *   `suportado()` de lá é lido dentro do executor da Promise, antes de
   *   qualquer espera. O `finally` devolve a função original mesmo se a
   *   gravação estourar.
   *   E — o que sustenta a honestidade — o que a tela recebe NÃO é a intenção:
   *   é o `ext` que o arquivo gravado realmente tem. Se um dia o BimVideo
   *   passar a ler o formato depois (fora da janela da troca), o vídeo sai em
   *   WebM e o aviso sai junto, em vez de sair um MP4 mentiroso.
   * ================================================================== */

  /* ⚠ A ORDEM É O CONTEÚDO DESTA LISTA. Mexer nela é mexer no que chega ao
     telefone do cliente. O avc1 com perfil explícito vem antes do genérico
     porque alguns navegadores só respondem "sim" à forma completa. */
  Rel.FORMATOS_TOUR = [
    { mime: "video/mp4;codecs=avc1.42E01E", ext: "mp4", nome: "MP4 (H.264)", universal: true },
    { mime: "video/mp4;codecs=avc1", ext: "mp4", nome: "MP4 (H.264)", universal: true },
    { mime: "video/mp4", ext: "mp4", nome: "MP4", universal: true },
    { mime: "video/webm;codecs=vp9", ext: "webm", nome: "WebM (VP9)", universal: false },
    { mime: "video/webm;codecs=vp8", ext: "webm", nome: "WebM (VP8)", universal: false },
    { mime: "video/webm", ext: "webm", nome: "WebM", universal: false }
  ];

  /* ⚠ O aviso tem PORTA. Recusar a gravação porque só há WebM deixaria o
     engenheiro sem vídeo nenhum — e ele voltaria a filmar a tela com o
     celular, que é o que este recurso existe para acabar. Então grava, avisa,
     e diz o que fazer. */
  Rel.AVISO_WEBM =
    "Este vídeo saiu em WebM porque este navegador não grava MP4. WebM costuma NÃO abrir no iPhone e no iPad — quem receber por mensagem pode não conseguir assistir. " +
    "Saídas: gravar de um Chrome ou Edge atualizado (as versões novas gravam MP4), ou mandar o relatório fotográfico, que abre em qualquer aparelho.";

  /* Puro: recebe um MediaRecorder (ou usa o da página) e devolve o formato
     escolhido PARA ESTE USO. Separado de `gravar` para o gate exercitar a
     ordem sem navegador nenhum. */
  Rel.formatoPreferido = function (MR) {
    var R = MR || (typeof global.MediaRecorder !== "undefined" ? global.MediaRecorder : null);
    if (!R) {
      var vid = VID();
      /* o motivo do BimVideo é melhor que um meu: ele distingue "não tem
         gravador" de "tem e não aceita formato", e um recado genérico daqui
         jogaria os dois no mesmo balde */
      if (vid && typeof vid.suportado === "function") return vid.suportado(R);
      return { ok: false, motivo: "Este navegador não sabe gravar vídeo (falta o MediaRecorder)." };
    }
    if (typeof R.isTypeSupported !== "function") {
      /* Navegador que grava mas não diz o que aceita. Recusar seria negar por
         precaução um caminho que provavelmente funciona; afirmar que sai MP4
         seria mentir. Então grava no padrão dele e avisa que não dá para
         saber — que é a verdade. */
      return {
        ok: true, mime: "", ext: "webm", nome: "padrão do navegador",
        universal: false, incerto: true,
        aviso: "Este navegador não informa em que formato ele grava; o arquivo sai no padrão dele, que costuma ser WebM. " + Rel.AVISO_WEBM
      };
    }
    for (var i = 0; i < Rel.FORMATOS_TOUR.length; i++) {
      var f = Rel.FORMATOS_TOUR[i];
      if (R.isTypeSupported(f.mime)) {
        return {
          ok: true, mime: f.mime, ext: f.ext, nome: f.nome,
          universal: !!f.universal, incerto: false,
          aviso: f.universal ? "" : Rel.AVISO_WEBM
        };
      }
    }
    return { ok: false, motivo: "Este navegador tem o gravador, mas não aceita nenhum formato de vídeo que eu saiba montar (tentei MP4 e WebM)." };
  };

  /* O aviso a partir do que o arquivo REALMENTE é. `ext` vem do resultado da
     gravação, não da intenção — ver a nota do cabeçalho desta parte. */
  Rel.avisoDoFormato = function (ext) {
    return txt(ext).toLowerCase() === "mp4" ? "" : Rel.AVISO_WEBM;
  };

  /* Antes de oferecer o botão: dá para gravar aqui, e em que formato?
     Devolve também `aviso`, para a tela poder dizer ANTES da gravação que o
     arquivo pode não abrir no iPhone — descobrir isso depois de esperar o
     passeio inteiro é o mesmo defeito de outra forma. */
  Rel.podeGravar = function (viewer) {
    var vid = VID();
    if (!vid || typeof vid.suportado !== "function") {
      return { ok: false, motivo: "O gravador de vídeo (js/bimvideo.js) não carregou nesta página." };
    }
    var sup = Rel.formatoPreferido();
    if (!sup.ok) return { ok: false, motivo: sup.motivo };
    var vw = viewer || V();
    if (!vw || typeof vw.quadro !== "function") {
      return { ok: false, motivo: "O visualizador 360 não carregou nesta página." };
    }
    if (typeof vw.montado === "function" && !vw.montado()) {
      return { ok: false, motivo: "Abra o tour na tela antes de gravar — o vídeo é gravado do que o visualizador desenha." };
    }
    return {
      ok: true, formato: sup.nome, ext: sup.ext,
      universal: !!sup.universal, aviso: txt(sup.aviso)
    };
  };

  function chaveFoto(lado, pid) { return lado + ":" + txt(pid); }

  /* Resolve as fotos que o PLANO vai pedir, dos dois lados quando é
     comparativo. Chave prefixada ("a:"/"b:") de propósito: além de separar os
     lados, ela impede que um pid chamado "constructor" caia no protótipo do
     objeto e devolva uma função no lugar de uma foto. */
  function fotosDoPlano(plano, tourA, tourB) {
    var vistos = {}, pids = [], i, pd;
    for (i = 0; i < plano.poses.length; i++) {
      pd = plano.poses[i] && plano.poses[i].pid;
      if (!pd) continue;
      if (Object.prototype.hasOwnProperty.call(vistos, "#" + pd)) continue;
      vistos["#" + pd] = true;
      pids.push(pd);
    }
    var pedidos = [];
    for (i = 0; i < pids.length; i++) {
      pedidos.push({ chave: chaveFoto("a", pids[i]), ponto: M().pontoDe(tourA, pids[i]) });
      if (tourB) pedidos.push({ chave: chaveFoto("b", pids[i]), ponto: M().pontoDe(tourB, pids[i]) });
    }
    return Promise.all(pedidos.map(function (p) {
      return resolverUm(p.ponto && p.ponto.foto).then(function (d) { return { chave: p.chave, d: d || "" }; });
    })).then(function (lista) {
      var mapa = {}, k;
      for (k = 0; k < lista.length; k++) if (lista[k].d) mapa[lista[k].chave] = lista[k].d;
      return { mapa: mapa, pids: pids };
    });
  }

  function pegar(mapa, chave) {
    return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : "";
  }

  function nomeArquivo(tour, tourB, ext) {
    var base = "Tour360" + (tourB ? "_comparativo" : "") + "_" + (txt(tour && tour.data) || "");
    var tit = txt(tour && tour.titulo).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").slice(0, 40);
    return (base + (tit ? "_" + tit : "")).replace(/_+/g, "_") + "." + (ext || "webm");
  }

  /* Grava o passeio.
   *
   * opts: { fps, segundosPorPonto, voltas, pitch, yawInicial, pausaFinal,
   *         largura, altura, bitrate, fov, aoAndar(i,n),
   *         comparativo: <outro tour> }   — o resto vai para o motor
   *
   * Resolve { blob, ext, nome, formato, quadros, duracaoSeg, quadrosPerdidos,
   *           pontos } e rejeita com Error(motivo) quando não dá para gravar.
   */
  Rel.gravar = function (tour, viewer, opts) {
    var o = opts || {};
    var vw = viewer || V();
    var vid = VID();

    if (!M()) return Promise.reject(new Error("O motor do tour não carregou nesta página."));
    if (!vid || typeof vid.gravar !== "function") return Promise.reject(new Error("O gravador de vídeo (js/bimvideo.js) não carregou nesta página."));
    if (!vw || typeof vw.quadro !== "function") return Promise.reject(new Error("O visualizador 360 não carregou nesta página."));
    /* ⚠ VISUALIZADOR DESMONTADO GRAVA ARQUIVO VAZIO EM SILÊNCIO. Sem a esfera
       na tela, `quadro()` devolve null a cada passo: todo quadro é pulado, o
       MediaRecorder para com zero quadro e o usuário recebe um arquivo que não
       abre — depois de esperar o passeio inteiro. Recusar aqui é a diferença
       entre um recado e um mistério. */
    if (typeof vw.montado === "function" && !vw.montado()) {
      return Promise.reject(new Error("Abra o tour na tela antes de gravar — o vídeo é gravado do que o visualizador 360 desenha."));
    }

    /* ⚠ PERGUNTA ANTES DE COMEÇAR, E DEVOLVE O MOTIVO DELE. Descobrir no meio
       da gravação que o navegador não grava significa o usuário esperar o
       passeio inteiro correr na tela para receber um erro no fim.
       A pergunta é a DESTE uso (MP4 primeiro), não a do BIM. */
    var sup = Rel.formatoPreferido();
    if (!sup.ok) return Promise.reject(new Error(sup.motivo));

    var tourB = o.comparativo || null;
    var plano = tourB ? M().planoComparativo(tour, tourB, o) : M().planoVideo(tour, o);
    if (!plano.ok) return Promise.reject(new Error(plano.motivo));

    return fotosDoPlano(plano, tour, tourB).then(function (r) {
      var mapa = r.mapa;

      /* nenhuma foto resolvida: gravar renderizaria a esfera vazia e
         entregaria um arquivo preto com a duração certa — o pior defeito
         possível, porque parece que funcionou */
      var alguma = false, i;
      for (i = 0; i < r.pids.length; i++) {
        if (pegar(mapa, chaveFoto("a", r.pids[i]))) { alguma = true; break; }
      }
      if (!alguma) {
        throw new Error("Nenhuma das fotos deste tour está neste aparelho — o vídeo sairia em preto. Abra o tour com internet para que elas desçam e tente de novo.");
      }

      var cursor = 0;          /* ⚠ ver o comentário dentro de desenhar() */
      var pidNaTela = "";
      var pontoNaTela = null;
      var carregando = false;
      var falhou = {};
      var perdidos = 0;

      var ctxDes = {
        largura: num(o.largura, 1280),
        altura: num(o.altura, 720),
        bitrate: num(o.bitrate, 6000000),
        /* o BimVideo lê `rodape` DEPOIS de chamar desenhar() (js/bimvideo.js,
           dentro de passo()). É por isso que dá para trocá-lo a cada quadro
           aqui dentro e ter o nome do ponto acompanhando a imagem; se fosse
           lido antes, a faixa inteira sairia com o nome de um ponto só. */
        rodape: "",
        aoAndar: typeof o.aoAndar === "function" ? o.aoAndar : null,

        desenhar: function (data) {
          /* ⚠ O CONTRATO COM O BimVideo, E O DEFEITO QUE ELE EVITA.
             `BimVideo.gravar` chama desenhar(data) UMA vez por quadro, em
             ordem, e só passa a DATA — que é o que a faixa escreve. A câmera
             de cada quadro anda num array PARALELO (plano.poses), então o
             cursor daqui é o único elo entre os dois.
             Se ele deixar de andar num quadro que falhou (foto que não abriu,
             viewer que devolveu null), as poses seguintes passam a valer para
             quadros anteriores: o vídeo sai girando fora de hora, mostrando o
             ponto errado com a data certa, e nada acusa. Por isso o cursor
             anda AQUI, antes de qualquer linha que possa falhar. */
          var i = cursor;
          cursor++;

          var pose = plano.poses[i];
          if (!pose) { perdidos++; return null; }

          if (Object.prototype.hasOwnProperty.call(falhou, "#" + pose.pid)) { perdidos++; return null; }

          if (pose.pid !== pidNaTela) {
            pidNaTela = pose.pid;
            pontoNaTela = M().pontoDe(tour, pose.pid);
            carregando = true;
            var dA = pegar(mapa, chaveFoto("a", pose.pid));
            var dB = tourB ? pegar(mapa, chaveFoto("b", pose.pid)) : "";
            var pr;
            if (tourB && dA && dB && typeof vw.abrirComparativo === "function") {
              pr = vw.abrirComparativo(dA, dB, pontoNaTela);
            } else if (dA) {
              pr = vw.abrir(dA, pontoNaTela);
            } else {
              pr = Promise.resolve({ ok: false });
            }
            /* ⚠ NÃO SE PRÉ-DECODIFICA TUDO (item 4 do cabeçalho): a textura
               troca aqui, no meio da gravação, e por isso os quadros que caem
               na espera são PULADOS — devolver o canvas antigo poria a foto
               do ponto anterior debaixo do nome do ponto novo, que é mentir
               com imagem. Quadro pulado encurta o vídeo; ele é contado e
               devolvido em `quadrosPerdidos` para a tela poder dizer isso. */
            pr.then(function (res) {
              carregando = false;
              if (!res || res.ok === false) falhou["#" + pose.pid] = true;
            })["catch"](function () {
              carregando = false;
              falhou["#" + pose.pid] = true;
            });
          }

          if (carregando) { perdidos++; return null; }

          try {
            /* ⚠ O YAW DO PLANO É O CORRIGIDO; O VIEWER GIRA NO BRUTO.
               `Tour360.corrigir` faz bruto − nortear = corrigido, e
               `aplicarGiroDoPonto` (tour360view.js) abre a estação em
               S.yaw = nortear. Somar de volta é o que faz duas visitas
               olharem para a MESMA parede — sem isso, a cortina do
               comparativo abre em paredes opostas quando o fotógrafo começou
               o giro de lados diferentes, e o cliente vê "mudança" onde não
               houve nenhuma. */
            var pt = pontoNaTela || {};
            var yawTela = M().normalizarYaw(num(pose.yaw, 0) + num(pt.nortear, 0));
            var pitchTela = num(pose.pitch, 0) + num(pt.horizonte, 0);
            vw.olharPara(yawTela, pitchTela, o.fov);
            if (pose.cortina !== undefined && typeof vw.cortina === "function") vw.cortina(pose.cortina);
          } catch (e) { perdidos++; return null; }

          ctxDes.rodape = txt(pose.nome);

          /* ⚠ `quadro()` renderiza SÍNCRONO de propósito (tour360view.js): aba
             oculta não recebe requestAnimationFrame, e sem esse render o vídeo
             sairia em branco sem erro nenhum. Não troque por pose()+canvas. */
          var cv = vw.quadro();
          if (!cv) { perdidos++; return null; }
          return { canvas: cv };
        }
      };

      /* ⚠ A JANELA DA TROCA. `BimVideo.gravar` lê `BimVideo.suportado()` de
         dentro do executor da Promise — ou seja, ANTES de a chamada abaixo
         retornar. Por isso a troca cobre só esta linha, e o `finally` devolve
         a função original mesmo se `gravar` estourar de forma síncrona.
         Deixar a troca pendurada estragaria o vídeo do BIM, que é de outro
         módulo e tem outro destino. */
      var suportadoOriginal = vid.suportado;
      var gravando;
      try {
        vid.suportado = function () { return sup; };
        gravando = vid.gravar(plano, ctxDes);
      } finally {
        vid.suportado = suportadoOriginal;
      }

      return gravando.then(function (res) {
        /* ⚠ O AVISO SAI DO ARQUIVO, NÃO DA INTENÇÃO. `res.ext` é o que o
           gravador de fato produziu; se por qualquer motivo a preferência não
           tiver valido, o vídeo é WebM e o aviso vai junto. Recado que afirma
           MP4 sobre um arquivo WebM é pior que recado nenhum — o engenheiro
           manda para o cliente confiando nele. */
        var aviso = Rel.avisoDoFormato(res.ext);
        return {
          blob: res.blob,
          ext: res.ext,
          nome: nomeArquivo(tour, tourB, res.ext),
          formato: res.nome,
          /* os três campos que a tela lê para decidir se avisa */
          mp4: txt(res.ext).toLowerCase() === "mp4",
          universal: txt(res.ext).toLowerCase() === "mp4",
          avisoFormato: aviso,
          quadros: res.quadros,
          duracaoSeg: res.duracaoSeg,
          quadrosPerdidos: perdidos,
          pontos: plano.pontos
        };
      });
    });
  };

  /* Para uma gravação em andamento. `BimVideo.cancelar` é trocado a cada
     gravação, então chamar o de agora é o certo. */
  Rel.cancelar = function () {
    var vid = VID();
    if (vid && typeof vid.cancelar === "function") { try { vid.cancelar(); } catch (e) {} return true; }
    return false;
  };

  /* Oferece o arquivo ao usuário. Recebe o que `Rel.gravar` resolveu. */
  Rel.baixar = function (res, nome) {
    if (!res || !res.blob) return { ok: false, motivo: "Não há vídeo para baixar." };
    var doc = global.document;
    if (!doc || !global.URL || typeof global.URL.createObjectURL !== "function") {
      return { ok: false, motivo: "Este navegador não deixa salvar o arquivo direto." };
    }
    var url = global.URL.createObjectURL(res.blob);
    var a = doc.createElement("a");
    a.href = url;
    a.download = txt(nome) || txt(res.nome) || ("tour360." + (res.ext || "webm"));
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    /* ⚠ REVOGAR, MAS NÃO AGORA. O blob de um vídeo segura dezenas de MB
       enquanto a URL existir, e nunca revogar deixa isso preso até a aba
       fechar. Revogar na linha seguinte ao clique, porém, cancela o download
       que o navegador ainda nem começou — o arquivo sai com 0 byte. O atraso
       é a única saída; 30 s cobre a partida do download com folga. */
    global.setTimeout(function () {
      try { global.URL.revokeObjectURL(url); } catch (e) {}
    }, 30000);
    return { ok: true, nome: a.download };
  };

  global.Tour360Rel = Rel;
  if (typeof module !== "undefined" && module.exports) module.exports = Rel;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
