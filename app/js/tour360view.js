/* =====================================================================
 * tour360view.js — a ESFERA: o que desenha a foto 360 na tela.
 *
 * Motor da conta está em js/tour360.js (puro, testável em Node). Aqui mora
 * só o que precisa de navegador: WebGL, arrastar com o dedo, marcador na
 * tela, cortina do comparativo e o quadro que o gravador de vídeo consome.
 *
 * ---------------------------------------------------------------------
 * CINCO DECISÕES QUE PARECEM DETALHE E NÃO SÃO
 * ---------------------------------------------------------------------
 *
 * 1) `import()` ESCONDIDO DO PARSER. O three.js só existe como módulo ES, e
 *    este arquivo é ES5 clássico porque o produto roda em WebView de
 *    instalador antigo. `import(...)` escrito à vista é ERRO DE SINTAXE nesses
 *    motores — e erro de sintaxe mata o arquivo INTEIRO no parse, então nem a
 *    mensagem "seu navegador não suporta" apareceria. Por isso o import mora
 *    dentro de um `new Function`: o parser antigo lê uma string, e só o
 *    navegador que de fato executa a linha precisa entender a sintaxe.
 *    O caminho é resolvido a partir de `document.baseURI` — o mesmo cuidado
 *    do import dinâmico do pdf.js em js/gestao.js, onde "./js/..." virava
 *    "/js/js/..." porque import() resolve pelo ARQUIVO, não pela página.
 *
 * 2) UM CONTEXTO WEBGL DE CADA VEZ. O viewer BIM já segura um. Dois vivos ao
 *    mesmo tempo é o que produz "Too many active WebGL contexts" e derruba os
 *    dois. `montar` cria sob demanda e `desmontar` faz dispose de tudo —
 *    geometria, material, textura e renderer — no molde de `desmontarMorto()`
 *    do js/bim.js. Sair da tela sem desmontar vaza o contexto e a terceira
 *    visita à aba abre em preto.
 *
 * 3) SEM TONE MAPPING E SEM CONVERSÃO DE COR. O renderer do BIM usa
 *    ACESFilmic com exposure 1,12 porque lá o assunto é modelo iluminado.
 *    Aqui o assunto é FOTOGRAFIA: qualquer curva aplicada devolve a obra com
 *    outra cor, e o cliente compara duas visitas achando que a parede mudou
 *    de tom. O renderer nasce sem tone mapping e a textura sem marcação de
 *    encoding, de propósito — o pixel do JPEG chega à tela como está.
 *
 * 4) A CENA FALA EM ÂNGULO BRUTO; A SETA CHEGA EM ÂNGULO CORRIGIDO. Tudo que
 *    é projetado nesta esfera (marcador, seta) usa o yaw/pitch DA FOTO — o
 *    mesmo que `Tour360.anguloParaPixel` converte em pixel. Só que
 *    `Tour360.setasDe` já devolve o rumo CORRIGIDO pelo `nortear` da estação,
 *    porque é assim que o rumo atravessa duas visitas. Jogar esse número
 *    direto em `Tour360.direcao` põe a seta girada do tamanho exato do
 *    nortear: numa estação nortearada em 90°, a passagem do corredor aparece
 *    desenhada na parede lateral, e a pessoa anda para a parede. Por isso
 *    existe `paraBruto()` — o inverso literal de `Tour360.corrigir`, aplicado
 *    em TODA entrada de ângulo corrigido (as setas e o `girarParaCorrigido`).
 *
 * 5) TELA CHEIA TEM DE TER DUAS IMPLEMENTAÇÕES. No Safari de iPhone o
 *    `requestFullscreen` de ELEMENTO não existe (só de <video>), e dentro de
 *    iframe sem `allowfullscreen` a chamada é negada. Deixar o recurso fora
 *    do ar nesses casos é tirar a tela grande justamente de quem está no
 *    canteiro com o celular na mão. A "tela cheia falsa" (`position:fixed`
 *    cobrindo a viewport) cobre os dois casos, e sai pelo mesmo botão e pelo
 *    Esc. Nos DOIS caminhos o `redimensionar` do viewer é chamado ao entrar e
 *    ao sair — ver a armadilha do host de altura 0 em `agendarRedimensionar`.
 *
 * API (fachada única, no padrão da casa):
 *   Tour360View.disponivel()                 → {ok} | {ok:false, motivo}
 *   Tour360View.montar(host, opts)           → Promise<{ok}|{ok:false, motivo}>
 *   Tour360View.montado()                    → boolean
 *   Tour360View.abrir(dataURI, ponto)        → Promise<{ok, w, h, equirect}>
 *   Tour360View.abrirComparativo(dA, dB, p)  → Promise
 *   Tour360View.cortina(f)                   // 1 = só o ANTES, 0 = só o depois
 *   Tour360View.olharPara(yaw, pitch, fov)   // ângulo BRUTO (o da foto)
 *   Tour360View.girarPara(yaw, pitch, ms)    // idem, com animação curta
 *   Tour360View.girarParaCorrigido(y, p, ms) // ângulo CORRIGIDO (o do rumo)
 *   Tour360View.pose()                       → {yaw, pitch, fov}
 *   Tour360View.poseCorrigida()              → {yaw, pitch, fov, corrigido}
 *   Tour360View.zoom(delta)
 *   Tour360View.aoClicar(fn) / aoMover(fn) / aoMarcador(fn) / aoSeta(fn)
 *   Tour360View.marcadores(lista)            // [{id, yaw, pitch, tipo, rotulo}]
 *   Tour360View.setas(lista)                 // o que Tour360.setasDe devolve
 *   Tour360View.telaCheia(liga)              → Promise<{ok, modo}>  (sem
 *                                             argumento, alterna)
 *   Tour360View.emTelaCheia()                → boolean
 *   Tour360View.aoTelaCheia(fn)              // fn(ligada, "real"|"falsa")
 *   Tour360View.teclado(liga)                → boolean (estado depois)
 *   Tour360View.sobrepor(canvasOuNull, op)   // o render do BIM por cima
 *   Tour360View.redimensionar()
 *   Tour360View.quadro()                     → HTMLCanvasElement | null
 *   Tour360View.aoQuadro(fn)
 *   Tour360View.desmontar()
 *
 * ⚠ `abrir` REPÕE A POSE NO NORTE DA ESTAÇÃO (`aplicarGiroDoPonto`). Quem
 *   troca de estação andando por uma seta tem de ler `poseCorrigida()` ANTES
 *   e chamar `girarParaCorrigido(...)` DEPOIS — senão a estação nova abre
 *   olhando para o rumo combinado e não para onde a pessoa estava indo, que
 *   é exatamente o solavanco que a navegação por seta existe para evitar.
 *
 * ⚠ A LISTA DE SETAS É DO CHAMADOR, e `abrir` NÃO a limpa de propósito: a
 *   tela chama `setas(Tour360.setasDe(t, p))` no mesmo lugar em que já chama
 *   `marcadores(p)`, ou seja, a cada sincronização — e é isso que garante que
 *   a seta desenhada seja sempre a da estação aberta. Se a tela deixar de
 *   chamar numa troca de estação, o que fica na foto são as saídas da estação
 *   ANTERIOR: seta que aponta para a sala errada é pior que nenhuma seta.
 * ===================================================================== */
(function (global) {
  "use strict";

  var View = {};
  var S = null;             /* estado do mount — um só, como no js/bim.js */
  var THREE = null;         /* cache do módulo entre montagens */

  var FOV_MIN = 25, FOV_MAX = 100, FOV_PADRAO = 75;
  var ROT_ESFERA = -Math.PI / 2;   /* medido; ver esferaCom() */
  var RAIO = 500;

  /* A seta de passagem mora PERTO DO CHÃO, não na linha do horizonte. É a
     convenção do Matterport e do HoloBuilder, e não é enfeite: no horizonte a
     pastilha cobre a parede — que é onde estão a trinca, a prumada e o
     comentário. Lá embaixo ela cobre piso, que é o que ninguém está olhando,
     e ainda lê como "o caminho é por ali". −25° com fov 75 cai no terço de
     baixo da tela em qualquer proporção de palco. */
  var PITCH_SETA = -25;

  /* Duração do giro entre estações. Curto de propósito: acima de ~450 ms a
     pessoa sente que o app "demorou"; sem nenhum, a troca de estação dá um
     salto de rumo que parece defeito de carregamento. */
  var MS_GIRO = 300;

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function str(v) { return (v === null || v === undefined) ? "" : String(v); }
  function M() { return global.Tour360; }   /* o motor; a conta mora lá */

  function agora() {
    try {
      if (global.performance && global.performance.now) return global.performance.now();
    } catch (e) {}
    return +new Date();
  }

  /* ⚠ INVERSO LITERAL DE `Tour360.corrigir` — ver a decisão 4 do cabeçalho.
     `corrigir` faz corrigido = bruto − nortear/horizonte; aqui desfaz. Se um
     dia o motor mudar o sinal daquela conta, ESTA função muda junto, ou a
     seta e o marcador passam a discordar em silêncio (cada um coerente
     consigo, nenhum coerente com o outro — o defeito de 90° que já custou
     caro neste módulo). */
  function paraBruto(ang) {
    var p = (S && S.ponto) || {};
    var y = num(ang && ang.yaw, 0) + num(p.nortear, 0);
    var t = num(ang && ang.pitch, 0) + num(p.horizonte, 0);
    return {
      yaw: M() ? M().normalizarYaw(y) : y,
      pitch: Math.max(-90, Math.min(90, t))
    };
  }

  /* ---------------------------------------------------------------------
   * Carga do three.js
   * ------------------------------------------------------------------- */

  /* ⚠ NÃO transforme isto num `import()` escrito à vista — ver a nota 1 do
     cabeçalho. O `new Function` é o que mantém este arquivo parseável em
     motor antigo. */
  var importar = null;
  try { importar = new Function("u", "return import(u);"); } catch (e) { importar = null; }

  function urlDoThree() {
    var base = (global.document && global.document.baseURI) || "";
    try { return new global.URL("bim/vendor/three.module.js", base).href; }
    catch (e) { return "bim/vendor/three.module.js"; }
  }

  View.disponivel = function () {
    if (!global.document) return { ok: false, motivo: "Sem navegador." };
    if (!importar) return { ok: false, motivo: "Este navegador é antigo demais para abrir o tour 360. Abra o OrçaPRO num navegador atualizado." };
    try {
      var c = global.document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return { ok: false, motivo: "Este aparelho não tem aceleração 3D disponível — o tour 360 não abre aqui, mas as fotos continuam na galeria." };
    } catch (e) {
      return { ok: false, motivo: "Não consegui abrir o 3D neste aparelho." };
    }
    return { ok: true };
  };

  function carregarThree() {
    if (THREE) return Promise.resolve(THREE);
    if (!importar) return Promise.reject(new Error("Navegador sem suporte a módulos."));
    return importar(urlDoThree()).then(function (mod) { THREE = mod; return mod; });
  }

  /* ---------------------------------------------------------------------
   * Montar / desmontar
   * ------------------------------------------------------------------- */

  View.montar = function (host, opts) {
    var o = opts || {};
    var d = View.disponivel();
    if (!d.ok) return Promise.resolve(d);
    if (!host) return Promise.resolve({ ok: false, motivo: "Sem lugar para desenhar." });

    /* re-home: mesma cena, host novo. Recriar o renderer aqui é o que abria
       um segundo contexto WebGL a cada troca de aba. */
    if (S && S.alive) {
      if (S.host !== host) {
        /* ⚠ A TELA CHEIA MORRE NA MUDANÇA DE CASA. O host antigo é um <div>
           que a tela acabou de substituir; se ele ficar com o
           `position:fixed;z-index:9999` da tela cheia falsa, sobra um
           retângulo morto cobrindo o app inteiro e sem nada dentro — e o
           usuário só sai recarregando. Solta ANTES de trocar, porque
           `restaurarHost` escreve no host que ainda está em `S.host`. */
        if (S.tcFalsa) falsaDesligar();
        restaurarHost();
        host.appendChild(S.renderer.domElement);
        if (S.camadaSetas) host.appendChild(S.camadaSetas);
        if (S.camadaMarc) host.appendChild(S.camadaMarc);
        if (S.camadaSobre) host.appendChild(S.camadaSobre);
        S.host = host;
        redimensionar();
      }
      return Promise.resolve({ ok: true });
    }

    return carregarThree().then(function (T) {
      var scene = new T.Scene();
      var camera = new T.PerspectiveCamera(FOV_PADRAO, 1, 0.1, 1100);
      camera.position.set(0, 0, 0);

      var renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      /* ⚠ preserveDrawingBuffer: sem isto o canvas volta vazio quando o
         gravador de vídeo (BimVideo) faz drawImage dele fora do quadro. */
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      /* ⚠ sem tone mapping e sem encoding: ver a nota 3 do cabeçalho */
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%;outline:none;touch-action:none;cursor:grab";
      host.appendChild(renderer.domElement);

      /* ⚠ A CAMADA DAS SETAS ENTRA ANTES DA DOS MARCADORES, E ISSO É REGRA.
         Os dois são overlays absolutos; quando uma seta de passagem e um
         marcador de pendência caem no mesmo pixel, quem está por cima no DOM
         recebe o clique. Tem de ser o marcador: a seta o usuário reencontra
         girando meio metro, o ponto de atenção não — ele aponta um defeito
         específico da parede. (A folha ainda dá z-index 2 aos marcadores e 3
         à sobreposição do BIM; a ordem do DOM é o que garante o desempate
         mesmo sem css/tour360.css carregada.) */
      var camadaSetas = global.document.createElement("div");
      camadaSetas.className = "t360-setas";
      camadaSetas.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
      host.appendChild(camadaSetas);

      var camadaMarc = global.document.createElement("div");
      camadaMarc.className = "t360-marcadores";
      camadaMarc.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
      host.appendChild(camadaMarc);

      /* ⚠ O CINZA PRECISA SE APRESENTAR. Depois do encaixe, a foto que não
         fecha a esfera é gravada como uma faixa dentro de uma equiretangular
         2:1, com o não-fotografado em cinza chapado. Girando até lá, a pessoa
         via um retângulo vazio e nenhuma palavra — e não dá para distinguir
         "aqui ninguém fotografou" de "a foto não carregou" ou "o aplicativo
         travou". A recusa de medir só aparecia DEPOIS de tentar medir, ou
         seja, tarde. Visto na foto da tela em 08/09/2026.
         É uma etiqueta discreta e sem clique: quem está dentro da parte
         fotografada nunca a vê. */
      var camadaVazio = global.document.createElement("div");
      /* ⚠ NOME PRÓPRIO, E ESTILO PRÓPRIO — os dois por causa do mesmo tropeço.
         A primeira versão chamou esta camada de `t360-vazio`, e essa classe JÁ
         EXISTE em css/tour360.css para outra coisa (o estado "nenhum tour",
         :430). A folha vestiu a camada com fundo CLARO e o texto, que era
         cinza claro, saiu ilegível. Os asserts continuaram verdes: a mensagem
         estava no DOM. Quem pegou foi a foto da tela.
         Então: classe que ninguém mais usa, e o estilo inteiro escrito aqui,
         sem depender do que a folha do aplicativo fizer. */
      camadaVazio.className = "t360-forafoto";
      camadaVazio.style.cssText = "position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);"
        + "text-align:center;pointer-events:none;display:none;padding:0 18px";
      host.appendChild(camadaVazio);

      var camadaSobre = global.document.createElement("canvas");
      camadaSobre.className = "t360-sobre";
      camadaSobre.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none";
      host.appendChild(camadaSobre);

      S = {
        alive: true, host: host, T: T, scene: scene, camera: camera, renderer: renderer,
        camadaMarc: camadaMarc, camadaSobre: camadaSobre, camadaSetas: camadaSetas,
        camadaVazio: camadaVazio,
        esferaA: null, esferaB: null, texA: null, texB: null,
        yaw: 0, pitch: 0, fov: FOV_PADRAO, cortina: 1, modo: "simples",
        ponto: null, marcadores: [], elMarc: {},
        setas: [], elSeta: {}, onSeta: null,
        anim: null,
        tcFalsa: false, hostCssGuardado: false, hostCssAntes: null, onTelaCheia: null,
        tecladoLigado: false,
        raf: 0, arrastando: false, lx: 0, ly: 0, moveu: 0,
        onClicar: null, onMover: null, onTocar: null,
        pinch: 0, ticks: []
      };

      ligarEventos();
      redimensionar();
      loop();
      return { ok: true };
    })["catch"](function (e) {
      /* ⚠ bim/vendor NÃO está no pré-cache do service worker (sw.js só varre
         js/ e css/ do index.html). Na primeira visita offline, o import falha
         aqui — e a mensagem tem que dizer isso, não "erro inesperado". */
      return {
        ok: false,
        motivo: "Não consegui carregar o visualizador 3D. Na primeira vez ele precisa de internet para baixar; depois funciona offline. (" + (e && e.message ? e.message : "falha ao carregar") + ")"
      };
    });
  };

  View.montado = function () { return !!(S && S.alive); };

  View.desmontar = function () {
    if (!S) return;
    /* ⚠ SAIR DA TELA CHEIA É A PRIMEIRA COISA, ainda com `S.alive` ligado.
       Duas razões: `falsaDesligar` chama `agendarRedimensionar`, que desiste
       sozinho quando o palco já morreu; e o estilo salvo do host tem de
       voltar ANTES de o <div> ser esquecido — um host largado em
       `position:fixed` fica cobrindo a tela seguinte do app, sem canvas
       dentro, e a saída do usuário vira recarregar a página. */
    sairDaTelaCheiaSemAvisar();
    S.alive = false;
    S.anim = null;
    if (S.raf) { try { global.cancelAnimationFrame(S.raf); } catch (e) {} S.raf = 0; }
    desligarEventos();
    soltarEsferas();
    try { S.renderer.dispose(); } catch (e) {}
    try { S.renderer.forceContextLoss(); } catch (e) {}
    [S.renderer.domElement, S.camadaSetas, S.camadaMarc, S.camadaSobre].forEach(function (el) {
      try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
    });
    S = null;
  };

  function soltarEsferas() {
    ["esferaA", "esferaB"].forEach(function (k) {
      var m = S[k];
      if (!m) return;
      try { S.scene.remove(m); } catch (e) {}
      try { m.geometry.dispose(); } catch (e) {}
      try { if (m.material.map) m.material.map.dispose(); } catch (e) {}
      try { m.material.dispose(); } catch (e) {}
      S[k] = null;
    });
    S.texA = S.texB = null;
  }

  /* ---------------------------------------------------------------------
   * A imagem
   * ------------------------------------------------------------------- */

  function carregarImagem(dataURI) {
    return new Promise(function (resolve, reject) {
      if (!dataURI) { reject(new Error("Sem imagem.")); return; }
      var img = new global.Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Não consegui abrir a imagem desta estação.")); };
      img.src = dataURI;
    });
  }

  function esferaCom(img) {
    var T = S.T;
    var tex = new T.Texture(img);
    tex.needsUpdate = true;
    tex.minFilter = T.LinearFilter;     /* sem mipmap: a foto é grande e o
                                           mipmap dobra a memória de vídeo */
    tex.generateMipmaps = false;
    tex.wrapS = T.RepeatWrapping;
    var geo = new T.SphereGeometry(RAIO, 60, 40);
    /* ⚠ `geometry.scale(-1,1,1)`, E NÃO `side: BackSide`. Os dois deixam a
       esfera visível por dentro, mas NÃO são equivalentes: o BackSide sozinho
       mantém as coordenadas de textura e a foto sai ESPELHADA — o que está à
       direita na imagem aparece à esquerda na tela. Medido em
       tools/e2e-tour360.js com uma foto de quatro faixas de cor: olhando para
       yaw 0 (pixel 512 de 1024, a fronteira azul|verde) apareciam VERDE no
       meio e AMARELO à esquerda, quando o amarelo mora à DIREITA do verde.
       Espelhado, todo texto de obra (placa, prumada, número de sala) sai ao
       contrário, e o yaw do clique fica com o sinal invertido em relação ao
       que `Tour360.anguloParaPixel` diz — ou seja, o comentário que o
       engenheiro marca aqui apareceria do outro lado no Portal do cliente,
       que desenha a foto plana pela conta do motor.
       Inverter a geometria é o caminho do exemplo oficial do three.js: as
       faces viram do avesso e o material continua FrontSide. Um dos dois,
       nunca os dois — juntos, espelham de volta. */
    geo.scale(-1, 1, 1);
    var mat = new T.MeshBasicMaterial({ map: tex });
    mat.toneMapped = false;
    var mesh = new T.Mesh(geo, mat);
    /* ⚠ ALINHA A ESFERA AO MOTOR. O `SphereGeometry` começa a enrolar a
       textura no eixo +X, então a câmera em yaw 0 caía no pixel 768 de 1024 —
       90° adiante do que `Tour360.anguloParaPixel(0)` diz (512, o centro da
       foto). Sem esta rotação, o app e o Portal discordam em 90°: o
       comentário que o engenheiro fixa numa parede aparece na parede vizinha
       na tela do cliente, e a estação abre olhando para o lugar errado no
       comparativo entre duas visitas. Medido em tools/e2e-tour360.js com uma
       foto de quatro faixas de cor conhecidas. */
    mesh.rotation.y = ROT_ESFERA;
    return { mesh: mesh, tex: tex };
  }

  View.abrir = function (dataURI, ponto) {
    if (!S || !S.alive) return Promise.resolve({ ok: false, motivo: "O visualizador não está aberto." });
    return carregarImagem(dataURI).then(function (img) {
      soltarEsferas();
      var e = esferaCom(img);
      S.esferaA = e.mesh; S.texA = e.tex;
      S.scene.add(e.mesh);
      S.modo = "simples";
      S.ponto = ponto || null;
      aplicarGiroDoPonto();
      return {
        ok: true, w: img.naturalWidth, h: img.naturalHeight,
        equirect: M() ? M().ehEquiretangular(img.naturalWidth, img.naturalHeight) : false
      };
    })["catch"](function (er) { return { ok: false, motivo: er.message }; });
  };

  /* Comparativo: as duas fotos na MESMA cena, cada uma desenhada na sua
     metade por scissor. A câmera é uma só — é isso que garante que o "antes"
     e o "depois" estejam olhando exatamente para o mesmo lugar, que é a
     única forma de a comparação significar alguma coisa. */
  View.abrirComparativo = function (dataA, dataB, ponto) {
    if (!S || !S.alive) return Promise.resolve({ ok: false, motivo: "O visualizador não está aberto." });
    return Promise.all([carregarImagem(dataA), carregarImagem(dataB)]).then(function (imgs) {
      soltarEsferas();
      var a = esferaCom(imgs[0]), b = esferaCom(imgs[1]);
      S.esferaA = a.mesh; S.texA = a.tex;
      S.esferaB = b.mesh; S.texB = b.tex;
      S.scene.add(a.mesh); S.scene.add(b.mesh);
      S.modo = "comparativo";
      S.cortina = 0.5;
      S.ponto = ponto || null;
      aplicarGiroDoPonto();
      return { ok: true };
    })["catch"](function (er) { return { ok: false, motivo: er.message }; });
  };

  View.cortina = function (f) {
    if (!S) return 0;
    if (f !== undefined) S.cortina = Math.max(0, Math.min(1, num(f, 0.5)));
    return S.cortina;
  };

  /* Abre a estação já apontada para o NORTE dela. `nortear` é quanto o giro
     daquela foto começou fora do rumo combinado; somando aqui, a pose
     corrigida nasce em 0 — e é isso que faz o comparativo de agosto e o de
     setembro abrirem olhando para a MESMA parede, mesmo que o fotógrafo
     tenha começado o giro de lados diferentes. Sem isto a cortina compara
     paredes opostas e o cliente vê "mudança" onde não houve nenhuma. */
  function aplicarGiroDoPonto() {
    var p = S.ponto || {};
    S.yaw = M() ? M().normalizarYaw(num(p.nortear, 0)) : num(p.nortear, 0);
    S.pitch = num(p.horizonte, 0);
  }

  /* ---------------------------------------------------------------------
   * Câmera
   * ------------------------------------------------------------------- */

  View.olharPara = function (yaw, pitch, fov) {
    if (!S) return;
    S.yaw = M() ? M().normalizarYaw(yaw) : num(yaw, 0);
    S.pitch = Math.max(-89, Math.min(89, num(pitch, 0)));
    if (fov !== undefined) S.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, num(fov, FOV_PADRAO)));
  };

  View.pose = function () {
    if (!S) return { yaw: 0, pitch: 0, fov: FOV_PADRAO };
    return { yaw: S.yaw, pitch: S.pitch, fov: S.fov };
  };

  View.zoom = function (delta) {
    if (!S) return;
    S.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, S.fov + num(delta, 0)));
  };

  /* ---------------------------------------------------------------------
   * GIRO ANIMADO — o que tira o solavanco da troca de estação
   *
   * Andar por uma seta troca a foto inteira num quadro. Se a câmera também
   * pular de rumo no mesmo quadro, a pessoa perde a referência do lugar e lê
   * isso como "carregou errado" — é o defeito clássico de tour feito com
   * troca de <img>. Com o giro curto, o olho acompanha para onde foi.
   *
   * ⚠ O ÂNGULO AQUI É BRUTO, igual ao de `olharPara` e ao dos marcadores.
   *   Quem tem o rumo em espaço corrigido (a pose que atravessa visitas, o
   *   yaw que `Tour360.setasDe` devolve) usa `girarParaCorrigido` — ver a
   *   decisão 4 do cabeçalho.
   * ------------------------------------------------------------------- */

  View.girarPara = function (yaw, pitch, ms) {
    if (!S || !S.alive) return { ok: false, motivo: "O visualizador não está aberto." };
    var dur = (ms === undefined || ms === null) ? MS_GIRO : Math.max(0, num(ms, MS_GIRO));
    var alvoY = M() ? M().normalizarYaw(yaw) : num(yaw, 0);
    var alvoP = Math.max(-89, Math.min(89, num(pitch, S.pitch)));
    if (dur <= 0) {
      S.anim = null;
      View.olharPara(alvoY, alvoP);
      avisarMovimento();
      return { ok: true, ms: 0 };
    }
    S.anim = {
      y0: S.yaw, p0: S.pitch,
      /* ⚠ `difYaw`, NUNCA a subtração crua. De 170° para −170° são 20° pelo
         caminho curto e 340° pelo longo: com a subtração, a câmera dá quase
         uma volta inteira na tela para chegar ao vizinho ao lado. */
      dy: M() ? M().difYaw(S.yaw, alvoY) : (alvoY - S.yaw),
      dp: alvoP - S.pitch,
      t0: agora(), ms: dur
    };
    return { ok: true, ms: dur };
  };

  View.girarParaCorrigido = function (yaw, pitch, ms) {
    if (!S || !S.alive) return { ok: false, motivo: "O visualizador não está aberto." };
    /* ⚠ PITCH OMITIDO MANTÉM A INCLINAÇÃO ATUAL, igual a `girarPara`. É a
       chamada normal de quem anda por uma seta: `girarParaCorrigido(rumo)`,
       só o rumo. Sem este cuidado, `paraBruto` transformaria o `undefined`
       num 0 e a câmera se nivelaria sozinha no horizonte — quem estava
       olhando para a laje ou para o piso chegaria à estação seguinte de
       cabeça endireitada, e isso não se lê como defeito: lê-se como se o
       tour tivesse "escolhido" outra vista, que é justamente o solavanco que
       manter o rumo existe para evitar. */
    var manter = (pitch === undefined || pitch === null);
    var b = paraBruto({ yaw: yaw, pitch: manter ? 0 : num(pitch, 0) });
    return View.girarPara(b.yaw, manter ? S.pitch : b.pitch, ms);
  };

  function avisarMovimento() {
    if (S && typeof S.onMover === "function") {
      try { S.onMover(View.poseCorrigida()); } catch (e) {}
    }
  }

  /* Avança a animação um quadro. Roda dentro de `desenhar`, e não num
     `setInterval` próprio, para que `View.quadro()` (o gravador de vídeo e o
     e2e, que desenham fora do rAF) veja exatamente os mesmos quadros. */
  function animarGiro() {
    var a = S.anim;
    if (!a) return;
    var f = a.ms > 0 ? ((agora() - a.t0) / a.ms) : 1;
    if (!(f > 0)) f = 0;
    if (f > 1) f = 1;
    /* ease-out cúbico: sai rápido e ENCOSTA devagar. Movimento linear de
       câmera parece máquina; o freio no fim é o que faz parecer que alguém
       virou a cabeça. */
    var e = 1 - Math.pow(1 - f, 3);
    var y = a.y0 + a.dy * e;
    S.yaw = M() ? M().normalizarYaw(y) : y;
    S.pitch = Math.max(-89, Math.min(89, a.p0 + a.dp * e));
    if (f >= 1) {
      S.anim = null;
      /* o aviso sai UMA vez, no fim, e não a cada quadro: `onMover` é da tela
         (redesenha painel, repinta bússola) e chamá-lo 18 vezes em 300 ms
         transformaria um giro suave numa tela piscando. Quem precisa do valor
         a cada quadro tem `aoQuadro`, que já roda no ritmo do render. */
      avisarMovimento();
    }
  }

  function aplicarCamera() {
    var T = S.T;
    /* ⚠ `-yaw` NA ROTAÇÃO. A câmera do three olha para −Z e gira pela regra da
       mão direita: rotation.y POSITIVO leva o olhar para −X, que é a ESQUERDA
       da tela. Como a convenção do motor é yaw crescendo para a DIREITA (o
       lado em que o pixel da foto cresce), a rotação tem de ser o negativo.
       Com o sinal direto, girar para a direita diminuía o yaw e tudo que era
       gravado a partir do clique saía espelhado em relação ao Portal. */
    var e = new T.Euler(S.pitch * Math.PI / 180, -S.yaw * Math.PI / 180, 0, "YXZ");
    S.camera.quaternion.setFromEuler(e);
    if (Math.abs(S.camera.fov - S.fov) > 0.01) {
      S.camera.fov = S.fov;
      S.camera.updateProjectionMatrix();
    }
  }

  /* ---------------------------------------------------------------------
   * Eventos de ponteiro — arrastar, tocar, zoom
   * ------------------------------------------------------------------- */

  var _h = {};

  function ligarEventos() {
    var el = S.renderer.domElement;

    _h.down = function (ev) {
      /* ⚠ A MÃO GANHA DA ANIMAÇÃO. Sem isto, quem encosta o dedo no meio do
         giro de 300 ms briga com a câmera: arrasta 10°, a animação devolve, e
         a foto "escorrega". Quem tocou mandou. */
      S.anim = null;
      S.arrastando = true; S.moveu = 0;
      var p = pos(ev);
      S.lx = p.x; S.ly = p.y;
      el.style.cursor = "grabbing";
      if (ev.touches && ev.touches.length === 2) S.pinch = dist2(ev);
    };
    _h.move = function (ev) {
      if (ev.touches && ev.touches.length === 2) {
        var d = dist2(ev);
        if (S.pinch) View.zoom((S.pinch - d) * 0.15);
        S.pinch = d;
        ev.preventDefault();
        return;
      }
      if (!S.arrastando) return;
      var p = pos(ev);
      var dx = p.x - S.lx, dy = p.y - S.ly;
      S.lx = p.x; S.ly = p.y;
      S.moveu += Math.abs(dx) + Math.abs(dy);
      /* a sensibilidade acompanha o zoom: com fov pequeno o mesmo arrasto
         teria que girar menos, senão a imagem "foge" do dedo */
      var k = (S.fov / 75) * 0.16;
      S.yaw = M() ? M().normalizarYaw(S.yaw - dx * k) : (S.yaw - dx * k);
      S.pitch = Math.max(-89, Math.min(89, S.pitch - dy * k));
      if (typeof S.onMover === "function") { try { S.onMover(View.poseCorrigida()); } catch (e) {} }
      if (ev.preventDefault) ev.preventDefault();
    };
    _h.up = function (ev) {
      var eraArrasto = S.moveu > 6;
      S.arrastando = false; S.pinch = 0;
      el.style.cursor = "grab";
      /* clique = ponteiro que quase não andou. Sem este corte, todo fim de
         arrasto marcaria um ponto de medida onde o dedo parou. */
      if (!eraArrasto && typeof S.onClicar === "function") {
        var ang = anguloEmTela(ev);
        if (ang) { try { S.onClicar(ang); } catch (e) {} }
      }
    };
    _h.roda = function (ev) {
      View.zoom(num(ev.deltaY, 0) * 0.05);
      if (ev.preventDefault) ev.preventDefault();
    };
    _h.resize = function () { redimensionar(); };

    /* Teclado. NÃO é ligado aqui: só entra por `View.teclado(true)` — ver a
       função, e o motivo de ela ser opcional. */
    _h.tecla = function (ev) { aoTeclar(ev); };

    /* ⚠ A PORTA DA TELA CHEIA FALSA. A de verdade o navegador fecha sozinho
       no Esc; a falsa é só um `position:fixed` e ninguém a fecha por nós.
       Sem esta escuta, quem entra e não acha o botão de sair fica preso numa
       camada que cobre o app inteiro, e a saída dele é recarregar a página —
       perdendo a medida em curso e o comentário não salvo. Por isso ela é
       ligada junto com a tela cheia falsa e vale MESMO com
       `View.teclado(false)`: sair de uma trava não é conforto de teclado, é
       a porta que toda trava tem de ter. */
    _h.escFalsa = function (ev) {
      if (!S || !S.alive || !S.tcFalsa) return;
      var k = ev.key || "", c = ev.keyCode || ev.which || 0;
      if (k !== "Escape" && k !== "Esc" && c !== 27) return;
      if (digitando(ev)) return;
      View.telaCheia(false);
      if (ev.preventDefault) ev.preventDefault();
    };

    /* ⚠ SAIR PELO Esc NÃO PASSA POR `View.telaCheia`. Na tela cheia de
       verdade o navegador devolve o elemento ao tamanho normal por conta
       própria; se o host ficar com o `height:100%` que escrevemos para
       esticá-lo, ele volta para dentro da página medindo a altura do pai — e
       o palco sai achatado ou de altura 0 (tela PRETA, sem erro). Este
       ouvinte é o único lugar que cobre os dois jeitos de sair. */
    _h.tcMudou = function () {
      if (!S || !S.alive) return;
      if (S.tcFalsa) return;
      if (docEmTelaCheia() === S.host) esticarHost();
      else restaurarHost();
      agendarRedimensionar();
      avisarTelaCheia();
    };

    el.addEventListener("mousedown", _h.down);
    el.addEventListener("touchstart", _h.down, { passive: true });
    global.addEventListener("mousemove", _h.move);
    el.addEventListener("touchmove", _h.move, { passive: false });
    global.addEventListener("mouseup", _h.up);
    el.addEventListener("touchend", _h.up);
    el.addEventListener("wheel", _h.roda, { passive: false });
    global.addEventListener("resize", _h.resize);
    var doc = global.document;
    doc.addEventListener("fullscreenchange", _h.tcMudou, false);
    doc.addEventListener("webkitfullscreenchange", _h.tcMudou, false);
    doc.addEventListener("MSFullscreenChange", _h.tcMudou, false);
  }

  function desligarEventos() {
    if (!S) return;
    var el = S.renderer.domElement;
    try {
      el.removeEventListener("mousedown", _h.down);
      el.removeEventListener("touchstart", _h.down);
      global.removeEventListener("mousemove", _h.move);
      el.removeEventListener("touchmove", _h.move);
      global.removeEventListener("mouseup", _h.up);
      el.removeEventListener("touchend", _h.up);
      el.removeEventListener("wheel", _h.roda);
      global.removeEventListener("resize", _h.resize);
      /* removeEventListener com ouvinte que nunca foi adicionado é inofensivo
         — vale tirar sem perguntar se `View.teclado(true)` chegou a ser
         chamado. Ouvinte de teclado esquecido no `document` gira uma foto que
         não existe mais e engole a seta de quem está navegando na lista. */
      var doc = global.document;
      doc.removeEventListener("keydown", _h.tecla, false);
      doc.removeEventListener("keydown", _h.escFalsa, false);
      doc.removeEventListener("fullscreenchange", _h.tcMudou, false);
      doc.removeEventListener("webkitfullscreenchange", _h.tcMudou, false);
      doc.removeEventListener("MSFullscreenChange", _h.tcMudou, false);
    } catch (e) {}
  }

  function pos(ev) {
    var c = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
    return { x: num(c.clientX, 0), y: num(c.clientY, 0) };
  }
  function dist2(ev) {
    var a = ev.touches[0], b = ev.touches[1];
    return Math.sqrt(Math.pow(a.clientX - b.clientX, 2) + Math.pow(a.clientY - b.clientY, 2));
  }

  /* Onde o dedo tocou, em yaw/pitch da FOTO. Sai pela direção do raio e não
     por interseção com a esfera: assim não depende de a geometria estar lá
     nem do lado do material, e vale igual nos dois modos. */
  function anguloEmTela(ev) {
    if (!S) return null;
    var el = S.renderer.domElement;
    var r = el.getBoundingClientRect();
    var c = (ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0] : ev;
    var nx = ((num(c.clientX, 0) - r.left) / (r.width || 1)) * 2 - 1;
    var ny = -((num(c.clientY, 0) - r.top) / (r.height || 1)) * 2 + 1;

    var T = S.T;
    var v = new T.Vector3(nx, ny, 0.5).unproject(S.camera).sub(S.camera.position).normalize();
    var pitch = Math.asin(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI;
    /* inverso de Tour360.direcao (x = sin·cos, z = −cos·cos) */
    var yaw = Math.atan2(v.x, -v.z) * 180 / Math.PI;
    var bruto = { yaw: M() ? M().normalizarYaw(yaw) : yaw, pitch: pitch };
    /* devolve o ângulo BRUTO e o corrigido: quem grava marcador guarda o
       bruto (é o pixel da foto); quem mede usa o corrigido (nivelado) */
    var corr = M() ? M().corrigir(bruto, S.ponto) : bruto;
    return { yaw: bruto.yaw, pitch: bruto.pitch, corrigido: corr, tela: { x: num(c.clientX, 0) - r.left, y: num(c.clientY, 0) - r.top } };
  }

  View.poseCorrigida = function () {
    var p = View.pose();
    var c = M() ? M().corrigir(p, S && S.ponto) : p;
    return { yaw: p.yaw, pitch: p.pitch, fov: p.fov, corrigido: c };
  };

  View.aoClicar = function (fn) { if (S) S.onClicar = fn; };
  /* ⚠ O MARCADOR É UM <button> COM ALVO DE TOQUE DE 44px — foi desenhado para
     ser clicado, tem foco e tem hover. Sem ouvinte, ele era uma promessa de
     interface que não cumpria nada: a pessoa toca no ponto de atenção na foto
     e não acontece coisa alguma, o que se lê como travamento.
     Delegado na camada, e não em cada botão, porque `marcadores()` recria a
     lista inteira a cada render. */
  View.aoMarcador = function (fn) {
    if (!S) return;
    S.onMarcador = fn;
    if (S._marcLigado) return;
    S._marcLigado = true;
    S.camadaMarc.addEventListener("click", function (ev) {
      var el = ev.target;
      while (el && el !== S.camadaMarc && !el.getAttribute("data-mk")) el = el.parentNode;
      var id = el && el.getAttribute && el.getAttribute("data-mk");
      if (id && typeof S.onMarcador === "function") { try { S.onMarcador(id); } catch (e) {} }
    });
  };
  View.aoMover = function (fn) { if (S) S.onMover = fn; };

  /* ---------------------------------------------------------------------
   * Marcadores (comentários, pontos de atenção, pontas de medida)
   * ------------------------------------------------------------------- */

  View.marcadores = function (lista) {
    if (!S) return;
    S.marcadores = lista || [];
    var doc = global.document;
    S.camadaMarc.innerHTML = "";
    S.elMarc = {};
    for (var i = 0; i < S.marcadores.length; i++) {
      var m = S.marcadores[i];
      var el = doc.createElement("button");
      el.type = "button";
      el.className = "t360-mk t360-mk-" + (m.tipo || "comentario");
      el.setAttribute("data-mk", m.id);
      el.style.cssText = "position:absolute;transform:translate(-50%,-50%);pointer-events:auto";
      el.title = m.rotulo || "";
      el.textContent = m.texto || "";
      S.camadaMarc.appendChild(el);
      S.elMarc[m.id] = el;
    }
  };

  /* Projeta cada marcador na tela. Marcador ATRÁS da câmera projeta para um
     ponto válido em coordenadas normalizadas — sem o teste de z, o comentário
     da parede das costas aparece flutuando na frente. */
  function posicionarMarcadores() {
    if (!S || !S.marcadores.length) return;
    var T = S.T;
    var el = S.renderer.domElement;
    var w = el.clientWidth, h = el.clientHeight;
    for (var i = 0; i < S.marcadores.length; i++) {
      var m = S.marcadores[i];
      var e = S.elMarc[m.id];
      if (!e) continue;
      var d = M().direcao(num(m.yaw, 0), num(m.pitch, 0));
      var v = new T.Vector3(d.x, d.y, d.z).multiplyScalar(RAIO * 0.5);
      v.project(S.camera);
      if (v.z > 1) { e.style.display = "none"; continue; }
      var x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) { e.style.display = "none"; continue; }
      e.style.display = "";
      e.style.left = Math.round(x) + "px";
      e.style.top = Math.round(y) + "px";
    }
  }

  /* =====================================================================
   * SETAS DE PASSAGEM — o que transforma álbum de fotos redondas em TOUR
   *
   * A lista vem pronta de `Tour360.setasDe(tour, ponto)`:
   *     [{pid, nome, nivel, yaw, distancia, semFoto}]
   * A conta é toda do motor (rumo gravado na ligação, ou deduzido da planta,
   * ou null); aqui só se projeta e se desenha.
   *
   * ⚠ TRÊS COISAS QUE NÃO PODEM SER "SIMPLIFICADAS":
   *
   * 1) O `yaw` que chega é CORRIGIDO pelo nortear da estação e a esfera fala
   *    em bruto — por isso passa por `paraBruto`. Ver a decisão 4 do
   *    cabeçalho: sem isso, numa estação nortearada em 90° a passagem do
   *    corredor é desenhada na parede lateral.
   *
   * 2) `yaw === null` NÃO VIRA SETA. Null é o motor dizendo "não sei o rumo":
   *    a ligação não guardou o rumo e as duas estações não estão marcadas na
   *    planta. Desenhar em 0° seria afirmar "a saída é bem à sua frente" sem
   *    saber — recado que mente. Some da foto; quem avisa que falta marcar na
   *    planta é a tela do engenheiro, que tem onde escrever isso.
   *
   * 3) A DISTÂNCIA NÃO VAI PARA A TELA. `Tour360.distanciaPelaPlanta` é
   *    fração da imagem da planta, não metro — e o próprio motor diz isso no
   *    comentário dele. Um "12" ao lado de uma seta o cliente lê como 12 m.
   *    Aqui ela serve só para ordenar o DOM.
   * ================================================================== */

  /* A aparência PADRÃO das setas mora aqui, e não só em css/tour360.css, por
     um motivo prático: este arquivo pode desenhar setas antes de a folha do
     tour existir (Portal, página de demonstração, e2e que monta o palco num
     host solto). Sem nenhum estilo, a pastilha vira um <button> cinza do
     navegador atravessado na foto.
     ⚠ O <style> entra no TOPO do <head>, de propósito: assim qualquer regra
     de css/tour360.css — que é um <link> logo abaixo — vence na mesma
     especificidade e continua sendo o lugar de mexer no visual. Injetado no
     fim, ele passaria a mandar e o CSS do produto viraria decoração. */
  var CSS_SETA_ID = "t360-css-seta";
  function garantirEstiloSeta() {
    var doc = global.document;
    if (!doc || !doc.head || doc.getElementById(CSS_SETA_ID)) return;
    var st = doc.createElement("style");
    st.id = CSS_SETA_ID;
    st.textContent = [
      ".t360-setas{z-index:1}",
      ".t360-seta{display:inline-flex;align-items:center;justify-content:center;gap:6px;",
      "max-width:190px;height:30px;padding:0 12px;border:0;border-radius:999px;",
      "font-family:inherit;font-size:12px;font-weight:700;line-height:1;white-space:nowrap;",
      "cursor:pointer;",
      /* ⚠ `clip`, NUNCA `hidden`: `hidden` cortaria também o ::after que
         estende o alvo de toque para 44px, e a seta continuaria bonita
         valendo 30px de alvo, sem nada na tela denunciando. É o mesmo
         defeito já documentado em css/tour360.css para o marcador. */
      "overflow:clip;overflow-clip-margin:12px;",
      "color:var(--t360-sobre-foto-claro,rgba(255,255,255,.94));",
      "background:var(--t360-sobre-foto-escuro,rgba(0,0,0,.62));",
      "text-shadow:0 1px 2px rgba(0,0,0,.85);",
      /* dois anéis, claro e escuro, pela mesma medição do marcador: um
         sobrevive na foto escura, o outro na foto clara. Um só reprova em
         metade dos tours — e é sempre a metade que ninguém testou. */
      "box-shadow:0 0 0 2px var(--t360-sobre-foto-claro,rgba(255,255,255,.94)),",
      "0 0 0 4px var(--t360-sobre-foto-escuro,rgba(0,0,0,.62)),0 4px 10px rgba(0,0,0,.5);",
      "transition:box-shadow .14s,background .14s}",
      ".t360-seta::after{content:\"\";position:absolute;left:50%;top:50%;width:44px;height:44px;",
      "transform:translate(-50%,-50%);border-radius:999px}",
      ".t360-seta:hover{background:rgba(0,0,0,.82);",
      "box-shadow:0 0 0 3px var(--t360-sobre-foto-claro,rgba(255,255,255,.94)),",
      "0 0 0 5px var(--t360-sobre-foto-escuro,rgba(0,0,0,.62)),0 5px 14px rgba(0,0,0,.55)}",
      ".t360-seta:focus-visible{outline:2px solid var(--t360-sobre-foto-claro,rgba(255,255,255,.94));outline-offset:5px}",
      ".t360-seta-i{font-size:13px;line-height:1}",
      /* apagada e sem cursor de clique: a estação existe, mas não há foto
         para onde ir. O motivo está ESCRITO na pastilha (não só no title) —
         ver o comentário em `View.setas`. */
      ".t360-seta[disabled]{opacity:.5;cursor:not-allowed;box-shadow:0 0 0 2px rgba(255,255,255,.6),0 0 0 4px rgba(0,0,0,.5)}"
    ].join("");
    doc.head.insertBefore(st, doc.head.firstChild);
  }

  View.setas = function (lista) {
    if (!S || !S.alive) return;
    garantirEstiloSeta();
    var doc = global.document;
    var origem = lista || [], arr = [], i, s;

    for (i = 0; i < origem.length; i++) {
      s = origem[i];
      if (!s || !s.pid) continue;
      if (s.yaw === null || s.yaw === undefined) continue;   /* motivo 2 do bloco acima */
      arr.push(s);
    }

    /* Mais perto por ÚLTIMO no DOM. Duas pastilhas sobrepostas: ganha o
       clique quem está por cima, e tem de ser a estação vizinha, não a do
       fim do corredor. Sem distância conhecida (planta não marcada) a seta
       vai para o começo — palpite não desempata em cima de medida. */
    arr.sort(function (a, b) {
      var da = (a.distancia === null || a.distancia === undefined) ? 1e9 : num(a.distancia, 1e9);
      var db = (b.distancia === null || b.distancia === undefined) ? 1e9 : num(b.distancia, 1e9);
      return db - da;
    });

    S.setas = arr;
    S.camadaSetas.innerHTML = "";
    S.elSeta = {};

    for (i = 0; i < arr.length; i++) {
      s = arr[i];
      var nome = str(s.nome) || "Estação";
      var el = doc.createElement("button");
      el.type = "button";
      el.className = "t360-seta" + (s.semFoto ? " t360-seta-sem-foto" : "");
      el.setAttribute("data-seta", str(s.pid));
      /* posição inline, como o marcador: quem manda no LUGAR é o render, e a
         folha manda na aparência. Nada aqui pode depender de `transform` — a
         translação de −50% é o que centra a pastilha no pixel que ela aponta. */
      el.style.cssText = "position:absolute;transform:translate(-50%,-50%);pointer-events:auto";

      var glifo = doc.createElement("span");
      glifo.className = "t360-seta-i";
      glifo.setAttribute("aria-hidden", "true");
      glifo.textContent = "▲";
      el.appendChild(glifo);

      /* ⚠ SEMPRE COM O NOME DA ESTAÇÃO, e por `textContent`. O nome é o que o
         levantamento contra o HoloBuilder chama de "show titles": uma seta
         muda obriga a pessoa a andar para descobrir para onde ela ia, e num
         corredor com três saídas isso é o passeio inteiro por tentativa.
         `textContent` porque o nome é digitado pelo usuário: por `innerHTML`,
         um nome com `<` viraria marcação dentro da foto. */
      var rot = doc.createElement("span");
      rot.className = "t360-seta-nome";
      rot.textContent = s.semFoto ? (nome + " (sem foto)") : nome;
      el.appendChild(rot);

      if (s.semFoto) {
        /* ⚠ O MOTIVO VAI NA PASTILHA, NÃO SÓ NO `title`. Botão `disabled` não
           recebe evento de ponteiro em vários navegadores — e sem evento não
           há tooltip: o `title` que explica ficaria escrito para ninguém, e a
           pessoa leria a seta apagada como app quebrado. Escrito na tela, o
           recado chega; o `title` continua para quem chega por leitor de tela
           e para quem passa o mouse onde funciona. */
        el.disabled = true;
        el.setAttribute("aria-disabled", "true");
        el.tabIndex = -1;
        el.title = "\"" + nome + "\" ainda não tem foto — não há para onde ir. "
          + "Tire a foto dessa estação e a passagem abre sozinha.";
      } else {
        el.title = "Ir para \"" + nome + "\"" + (str(s.nivel) ? " · " + str(s.nivel) : "");
      }

      S.camadaSetas.appendChild(el);
      S.elSeta[str(s.pid)] = el;
    }
  };

  /* Delegado na camada, e não em cada botão, porque `setas()` recria a lista
     inteira a cada troca de estação — ouvinte por botão vazaria um a cada
     passo do passeio. Mesma escolha do `aoMarcador`. */
  View.aoSeta = function (fn) {
    if (!S) return;
    S.onSeta = fn;
    if (S._setaLigado) return;
    S._setaLigado = true;
    S.camadaSetas.addEventListener("click", function (ev) {
      var el = ev.target;
      while (el && el !== S.camadaSetas && !(el.getAttribute && el.getAttribute("data-seta"))) el = el.parentNode;
      if (!el || !el.getAttribute) return;
      var pid = el.getAttribute("data-seta");
      if (!pid) return;
      if (el.disabled) return;   /* sem foto: o motivo já está escrito na pastilha */
      if (typeof S.onSeta === "function") { try { S.onSeta(pid); } catch (e) {} }
    });
  };

  /* A FAIXA FOTOGRAFADA DESTA ESTAÇÃO, em pitch BRUTO (o da imagem), ou
     `null` quando não dá para saber.

     ⚠ BRUTO, E NÃO CORRIGIDO. `panoCobV`/`panoCentroPitch` descrevem um
       retângulo no espaço da IMAGEM — é a mesma convenção que faz
       `Tour360.podeMedirAqui` receber o ângulo ANTES de `corrigir`. Quem
       comparar com o ângulo corrigido erra a borda pelo tanto que a estação
       estiver desnivelada (`horizonte`), e erra calado: a seta some para
       dentro em uma estação e continua no cinza em outra, sem nada na tela
       dizendo por quê. Por isso o clamp mora DEPOIS de `paraBruto`.

     ⚠ AUSÊNCIA SÓ PERMITE, como no motor. Ponto sem `panoCobV` é toda a base
       já gravada nas 38 instalações, e esfera fechada (>= 180°) não tem cinza
       nenhum: nos dois casos a seta segue no −25° de sempre. Um padrão
       inventado aqui mexeria na altura da seta de quem nunca teve problema. */
  function faixaDaFoto() {
    var p = (S && S.ponto) || {};
    var cV = num(p.panoCobV, 0);
    if (!(cV > 0) || cV >= 180) return null;
    /* A MESMA MARGEM DE 3° DE `Tour360.planoVideo`, de propósito: lá ela
       impede o filme de começar apontado para o cinza, aqui impede a pastilha
       de nascer nele, e os dois têm de concordar — seta e filme discordando
       da mesma borda é defeito que ninguém reproduz. A folga existe porque a
       pastilha é centrada no pixel (`translate(-50%,-50%)`): plantada
       exatamente na borda, metade dela já está fora da foto. Faixa estreita
       perde a folga antes de perder o centro (`Math.max(0, ...)`). */
    var m = Math.max(0, cV / 2 - 3);
    var cp = num(p.panoCentroPitch, 0);
    return { min: cp - m, max: cp + m };
  }

  /* Mesma projeção dos marcadores — inclusive o teste de `v.z > 1`, que é o
     que impede a seta das COSTAS de aparecer flutuando na frente (ponto atrás
     da câmera projeta para coordenada normalizada válida; sem o teste, a
     saída de trás convida a pessoa a andar para o lado errado). */
  function posicionarSetas() {
    if (!S || !S.setas.length || !M()) return;
    var T = S.T;
    var el = S.renderer.domElement;
    var w = el.clientWidth, h = el.clientHeight;
    var faixa = faixaDaFoto();
    for (var i = 0; i < S.setas.length; i++) {
      var s = S.setas[i];
      var e = S.elSeta[str(s.pid)];
      if (!e) continue;
      var pit = (s.pitch === null || s.pitch === undefined) ? PITCH_SETA : num(s.pitch, PITCH_SETA);
      var b = paraBruto({ yaw: num(s.yaw, 0), pitch: pit });
      /* ⚠ O PITCH DA SETA ENTRA NA FAIXA; O YAW NÃO.
         `PITCH_SETA` planta a pastilha 25° abaixo do horizonte porque é onde
         o chão fica. Depois do encaixe isso deixou de ser sempre verdade: a
         foto que não fecha a esfera é gravada como uma faixa dentro de uma
         equiretangular 2:1, com o não-fotografado em cinza, e numa cinta de
         45° o alcance vertical é de uns ±22° — os 25° caem FORA da parte
         fotografada. A seta continua clicável (é objeto 3D na frente da
         textura), então "andar para o próximo ambiente" nunca chegou a
         quebrar; ela só nasce boiando no cinza, e pastilha no vazio a pessoa
         lê como app quebrado e não clica. Trazer para a borda de baixo da
         faixa a devolve para cima do chão que a foto realmente tem.

         ⚠ E SÓ O PITCH — NUNCA O YAW. A seta de volta fica em yaw+180 e, numa
         faixa parcial, cai mesmo no cinza. Desenhada ali ela ainda APONTA
         para o lado certo, que é o serviço dela; puxada para dentro da faixa
         passaria a apontar para uma parede que não é a saída. Feia e certa é
         melhor que bonita e errada, e este é o tipo de "melhoria" que uma
         próxima sessão tenta fazer por simetria com a linha de cima. */
      if (faixa) b.pitch = Math.max(faixa.min, Math.min(faixa.max, b.pitch));
      var d = M().direcao(b.yaw, b.pitch);
      var v = new T.Vector3(d.x, d.y, d.z).multiplyScalar(RAIO * 0.5);
      v.project(S.camera);
      if (v.z > 1) { e.style.display = "none"; continue; }
      var x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      /* folga maior na horizontal que a do marcador: a pastilha leva o nome
         da estação e pode ter 190px, então some bem depois do centro sair */
      if (x < -110 || y < -40 || x > w + 110 || y > h + 40) { e.style.display = "none"; continue; }
      e.style.display = "";
      e.style.left = Math.round(x) + "px";
      e.style.top = Math.round(y) + "px";
    }
  }

  /* =====================================================================
   * TELA CHEIA
   * ================================================================== */

  function docEmTelaCheia() {
    var d = global.document;
    return d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement || null;
  }

  View.emTelaCheia = function () {
    if (!S || !S.alive) return false;
    if (S.tcFalsa) return true;
    return !!(S.host && docEmTelaCheia() === S.host);
  };

  View.aoTelaCheia = function (fn) { if (S) S.onTelaCheia = fn; };

  function avisarTelaCheia() {
    if (S && typeof S.onTelaCheia === "function") {
      try { S.onTelaCheia(View.emTelaCheia(), S.tcFalsa ? "falsa" : "real"); } catch (e) {}
    }
  }

  /* ⚠ REDIMENSIONAR UMA VEZ SÓ NÃO BASTA, e este é o defeito mais caro desta
     seção. O host só muda de tamanho DEPOIS que o navegador troca de modo, e
     em alguns aparelhos isso demora um par de quadros; medir antes devolve a
     altura antiga. Pior: `redimensionar` desiste calado quando o host mede 0
     (`if (!w || !alt) return`, a armadilha já escrita em js/tour360ui.js), e o
     resultado é o palco PRETO sem uma linha de erro — o usuário lê como app
     travado e fecha a aba. Por isso a medida é repetida: agora, no quadro
     seguinte, e mais duas vezes com folga. Depois de `desmontar` as chamadas
     atrasadas caem no guarda de `redimensionar` e não fazem nada. */
  function agendarRedimensionar() {
    redimensionar();
    try { global.requestAnimationFrame(function () { redimensionar(); }); } catch (e) {}
    global.setTimeout(redimensionar, 60);
    global.setTimeout(redimensionar, 260);
  }

  function guardarHost() {
    if (!S || S.hostCssGuardado) return;
    S.hostCssGuardado = true;
    S.hostCssAntes = S.host.getAttribute("style");
  }

  /* CINTO A MAIS NA TELA CHEIA DE VERDADE — e o comentário aqui diz o que foi
     MEDIDO, não o que parecia óbvio.

     O palco tem altura inline (`height:min(70vh,620px)`, escrita em
     js/tour360ui.js) e a folha ainda põe `max-height:76vh` e
     `aspect-ratio:16/9` em `.t360-palco`. A suspeita era que a tela cheia
     abrisse uma moldura preta com a foto de 620px no meio. MEDIDO em Chrome
     (headless, clique de verdade pelo CDP, com esta função esvaziada de
     propósito): o host mediu 900px de 900px assim mesmo — porque a folha do
     próprio navegador para `:fullscreen` traz `width/height:100%` E
     `max-width/max-height:none` marcados `!important`, e `!important` de UA
     vence estilo inline de autor. Ou seja: no Blink esta função é redundante,
     e nenhum assert consegue reprovar a falta dela.

     ⚠ Fica assim mesmo, e não é teimosia: `!important` na regra de
     `:fullscreen` é o que a especificação manda, mas quem garante é o motor,
     e o produto roda em WebView de instalador antigo — exatamente o lugar
     onde a folha da UA costuma estar incompleta. O custo são cinco
     atribuições; o preço de errar é o palco de 620px numa moldura preta. E a
     simetria com `restaurarHost` mantém uma única regra de entrada e saída.
     Na tela cheia FALSA, onde não existe regra de UA nenhuma, o mesmo
     `maxHeight:none` é obrigatório — lá o `max-height:76vh` da folha clampa
     de verdade, e isso tem controle negativo. */
  function esticarHost() {
    if (!S) return;
    var st = S.host.style;
    st.width = "100%"; st.height = "100%";
    st.maxWidth = "none"; st.maxHeight = "none";
    st.borderRadius = "0";
  }

  function restaurarHost() {
    if (!S || !S.hostCssGuardado) return;
    if (S.hostCssAntes === null || S.hostCssAntes === undefined) S.host.removeAttribute("style");
    else S.host.setAttribute("style", S.hostCssAntes);
    S.hostCssGuardado = false;
    S.hostCssAntes = null;
  }

  function falsaLigar() {
    guardarHost();
    var st = S.host.style;
    st.position = "fixed";
    st.left = "0"; st.top = "0"; st.right = "0"; st.bottom = "0";
    st.width = "100%"; st.height = "100%";
    st.maxWidth = "none"; st.maxHeight = "none";
    st.margin = "0"; st.borderRadius = "0";
    st.zIndex = "9999";
    try { S.host.classList.add("t360-tela-cheia"); } catch (e) {}
    S.tcFalsa = true;
    try { global.document.addEventListener("keydown", _h.escFalsa, false); } catch (e) {}
    agendarRedimensionar();
  }

  function falsaDesligar() {
    if (!S) return;
    S.tcFalsa = false;
    try { global.document.removeEventListener("keydown", _h.escFalsa, false); } catch (e) {}
    try { S.host.classList.remove("t360-tela-cheia"); } catch (e) {}
    restaurarHost();
    agendarRedimensionar();
  }

  function sairDaTelaCheiaSemAvisar() {
    if (!S) return;
    if (S.tcFalsa) { falsaDesligar(); return; }
    if (docEmTelaCheia() === S.host) {
      var sair = global.document.exitFullscreen || global.document.webkitExitFullscreen || global.document.msExitFullscreen;
      try { if (sair) sair.call(global.document); } catch (e) {}
    }
    restaurarHost();
  }

  /* Pede a tela cheia de verdade e responde com a VERDADE: `false` quando o
     navegador não tem a API, quando ele recusa, e também quando ele aceita a
     chamada e simplesmente não entra (webkit antigo devolve `undefined` em
     vez de promessa — sem o prazo abaixo, o app anunciaria tela cheia que não
     aconteceu, e o usuário ficaria com o palco pequeno e um botão dizendo
     "sair da tela cheia"). */
  function pedirReal(host) {
    return new Promise(function (resolve) {
      var req = host.requestFullscreen || host.webkitRequestFullscreen || host.msRequestFullscreen;
      if (!req) { resolve(false); return; }
      var respondeu = false;
      function fim(v) { if (respondeu) return; respondeu = true; resolve(!!v); }
      var prazo = global.setTimeout(function () { fim(docEmTelaCheia() === host); }, 500);
      try {
        var r = req.call(host);
        if (r && typeof r.then === "function") {
          r.then(function () { global.clearTimeout(prazo); fim(true); },
                 function () { global.clearTimeout(prazo); fim(false); });
        }
      } catch (e) {
        global.clearTimeout(prazo);
        fim(false);
      }
    });
  }

  View.telaCheia = function (liga) {
    if (!S || !S.alive) return Promise.resolve({ ok: false, motivo: "O visualizador não está aberto." });
    var estava = View.emTelaCheia();
    var quer = (liga === undefined || liga === null) ? !estava : !!liga;

    if (quer === estava) {
      return Promise.resolve({ ok: true, modo: estava ? (S.tcFalsa ? "falsa" : "real") : "nenhuma" });
    }

    if (!quer) {
      if (S.tcFalsa) {
        falsaDesligar();
        avisarTelaCheia();
        return Promise.resolve({ ok: true, modo: "nenhuma" });
      }
      var sair = global.document.exitFullscreen || global.document.webkitExitFullscreen || global.document.msExitFullscreen;
      try { if (sair) sair.call(global.document); } catch (e) {}
      /* o host volta ao tamanho normal no `_h.tcMudou` — é o mesmo caminho de
         quem sai apertando Esc, e ter UM caminho é o que impede o palco de
         ficar esticado numa das duas saídas */
      return Promise.resolve({ ok: true, modo: "nenhuma" });
    }

    guardarHost();
    return pedirReal(S.host).then(function (deu) {
      if (deu) {
        esticarHost();
        agendarRedimensionar();
        avisarTelaCheia();
        return { ok: true, modo: "real" };
      }
      /* ⚠ A PORTA. Ver a decisão 5 do cabeçalho: iPhone e iframe sem
         permissão não têm tela cheia de elemento, e ficar sem o recurso por
         causa disso é tirar a tela grande de quem está no canteiro. */
      falsaLigar();
      avisarTelaCheia();
      return { ok: true, modo: "falsa" };
    });
  };

  /* =====================================================================
   * TECLADO
   *
   * Opcional de propósito (`View.teclado(true)`): o ouvinte é do `document`,
   * porque o canvas não recebe foco, e um viewer que sequestra as setas em
   * toda página em que foi montado atrapalha quem só queria rolar a lista.
   * Quem abre o visualizador liga; quem sai, desliga (e `desmontar` desliga
   * sozinho).
   * ================================================================== */

  /* ⚠ NUNCA GIRAR A FOTO ENQUANTO ALGUÉM DIGITA. O comentário da obra é
     escrito num <input> que fica NA MESMA TELA do palco: sem este teste,
     apertar a seta para corrigir uma letra gira a foto atrás, e o "+" de uma
     medida some dentro de um zoom. Cobre também `contenteditable`, que é onde
     campo rico costuma morar. */
  function digitando(ev) {
    var el = (ev && ev.target) || null;
    try { if (!el) el = global.document.activeElement; } catch (e) {}
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return true;
    var tag = str(el.tagName).toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION";
  }

  function girarRelativo(dYaw, dPitch) {
    S.anim = null;                    /* tecla manda mais que animação em curso */
    var y = S.yaw + num(dYaw, 0);
    S.yaw = M() ? M().normalizarYaw(y) : y;
    S.pitch = Math.max(-89, Math.min(89, S.pitch + num(dPitch, 0)));
    avisarMovimento();
  }

  function aoTeclar(ev) {
    if (!S || !S.alive) return;
    /* atalho com Ctrl/Cmd/Alt é do navegador ou do sistema — não é nosso */
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (digitando(ev)) return;
    /* ⚠ E SÓ COM O PALCO NA PÁGINA. A tela do app é redesenhada por string de
       HTML: o host sai do documento sem `desmontar` ser chamado (é o que
       `_vigiarPalco` em js/tour360ui.js persegue). Sem este teste, as setas
       do teclado continuariam girando uma foto que ninguém está vendo e
       roubando a navegação da lista que tomou o lugar dela. */
    var doc = global.document;
    if (!S.host || !doc.body || !doc.body.contains(S.host)) return;

    var k = ev.key || "", c = ev.keyCode || ev.which || 0;
    /* o passo acompanha o zoom, pelo mesmo motivo do arrasto: com fov pequeno
       um passo fixo saltaria meia parede por toque */
    var passo = (S.fov / 75) * (ev.shiftKey ? 12 : 4);
    var pegou = true;

    if (k === "ArrowLeft" || k === "Left" || c === 37) girarRelativo(-passo, 0);
    else if (k === "ArrowRight" || k === "Right" || c === 39) girarRelativo(passo, 0);
    else if (k === "ArrowUp" || k === "Up" || c === 38) girarRelativo(0, passo);
    else if (k === "ArrowDown" || k === "Down" || c === 40) girarRelativo(0, -passo);
    /* "+" e "−" chegam com nome diferente em cada teclado e em cada motor:
       teclado numérico manda "Add"/"Subtract" (107/109), o de cima manda "="
       com Shift (187) e o Firefox antigo manda 61/173. Aceitar só `ev.key`
       deixaria o zoom morto no WebView antigo, que é onde o produto roda. */
    else if (k === "+" || k === "=" || k === "Add" || c === 107 || c === 187 || c === 61) { S.anim = null; View.zoom(-4); }
    else if (k === "-" || k === "_" || k === "Subtract" || c === 109 || c === 189 || c === 173) { S.anim = null; View.zoom(4); }
    else if (k === "Escape" || k === "Esc" || c === 27) {
      if (View.emTelaCheia()) View.telaCheia(false);
      else pegou = false;   /* fora da tela cheia o Esc é de quem fecha modal */
    } else pegou = false;

    if (pegou && ev.preventDefault) ev.preventDefault();
  }

  View.teclado = function (liga) {
    if (!S || !S.alive) return false;
    var quer = (liga === undefined || liga === null) ? true : !!liga;
    if (quer === !!S.tecladoLigado) return quer;
    try {
      if (quer) global.document.addEventListener("keydown", _h.tecla, false);
      else global.document.removeEventListener("keydown", _h.tecla, false);
    } catch (e) { return !!S.tecladoLigado; }
    S.tecladoLigado = quer;
    return quer;
  };

  /* ---------------------------------------------------------------------
   * Sobreposição do BIM (projetado × executado)
   * ------------------------------------------------------------------- */

  View.sobrepor = function (canvasBim, opacidade) {
    if (!S) return;
    var cv = S.camadaSobre;
    if (!canvasBim) { cv.style.display = "none"; return; }
    var el = S.renderer.domElement;
    var w = el.clientWidth, h = el.clientHeight;
    cv.width = w; cv.height = h;
    var g = cv.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = Math.max(0, Math.min(1, num(opacidade, 0.5)));
    try { g.drawImage(canvasBim, 0, 0, w, h); } catch (e) {}
    g.globalAlpha = 1;
    cv.style.display = "";
  };

  /* ---------------------------------------------------------------------
   * Render
   * ------------------------------------------------------------------- */

  function redimensionar() {
    if (!S || !S.alive) return;
    var h = S.host;
    var w = h.clientWidth, alt = h.clientHeight;
    if (!w || !alt) return;
    S.renderer.setSize(w, alt, false);
    S.camera.aspect = w / alt;
    S.camera.updateProjectionMatrix();
  }
  View.redimensionar = redimensionar;

  function desenhar() {
    if (!S || !S.alive) return;
    animarGiro();
    aplicarCamera();
    var r = S.renderer, T = S.T;
    var w = r.domElement.width, h = r.domElement.height;

    if (S.modo === "comparativo" && S.esferaB) {
      /* cortina: o "antes" ocupa a faixa da esquerda, o "depois" o resto.
         scissor em pixels do buffer, não em CSS — com devicePixelRatio 2 a
         divisão sairia na metade errada da tela. */
      var corte = Math.round(w * S.cortina);
      r.setScissorTest(true);
      S.esferaA.visible = true; S.esferaB.visible = false;
      r.setScissor(0, 0, corte, h); r.setViewport(0, 0, w, h);
      r.render(S.scene, S.camera);
      S.esferaA.visible = false; S.esferaB.visible = true;
      r.setScissor(corte, 0, w - corte, h);
      r.render(S.scene, S.camera);
      r.setScissorTest(false);
      S.esferaA.visible = true;
    } else {
      r.render(S.scene, S.camera);
    }
    posicionarSetas();
    posicionarMarcadores();
    avisarVazio();
    for (var i = 0; i < S.ticks.length; i++) { try { S.ticks[i](); } catch (e) {} }
  }

  /* Mostra o recado quando o CENTRO da vista está fora da parte fotografada.
     ⚠ O CRITÉRIO É O CENTRO, NÃO A BORDA, e de propósito: exigir o quadro
     inteiro dentro da faixa faria o recado piscar o tempo todo em quem está
     olhando a obra de perto da borda — e recado que pisca a pessoa aprende a
     ignorar. Assim ele só aparece quando ela de fato saiu da foto.
     ⚠ E o ângulo comparado é o BRUTO (S.yaw/S.pitch), porque `panoCobV` e
     `panoCentroPitch` descrevem um retângulo no espaço da IMAGEM — a mesma
     convenção de `Tour360.podeMedirAqui` e do clamp da seta. */
  function avisarVazio() {
    var el = S && S.camadaVazio;
    if (!el) return;
    var p = (S && S.ponto) || {};
    var cH = num(p.panoCobH, 0), cV = num(p.panoCobV, 0);
    if ((!(cH > 0) || cH >= 360) && (!(cV > 0) || cV >= 180)) {
      if (el.style.display !== "none") { el.style.display = "none"; el.innerHTML = ""; }
      return;
    }
    var cp = num(p.panoCentroPitch, 0);
    var y = S.yaw, pt = S.pitch;
    var d = ((y % 360) + 540) % 360 - 180;
    var foraH = (cH > 0 && cH < 360) && Math.abs(d) > cH / 2;
    var foraV = (cV > 0 && cV < 180) && (pt > cp + cV / 2 || pt < cp - cV / 2);
    if (!foraH && !foraV) {
      if (el.style.display !== "none") { el.style.display = "none"; el.innerHTML = ""; }
      return;
    }
    if (el.style.display === "none") {
      el.innerHTML = '<span style="display:inline-block;max-width:430px;text-align:left;'
        + 'background:rgba(9,15,26,.90);border:1px solid rgba(148,163,184,.38);border-radius:12px;'
        + 'padding:11px 15px;box-shadow:0 6px 22px rgba(0,0,0,.5);'
        + 'font:500 13px/1.5 system-ui,-apple-system,\'Segoe UI\',Roboto,sans-serif;color:#e2e8f0">'
        + '<b style="display:block;font-size:14.5px;margin-bottom:3px;color:#fff">Aqui a foto acabou</b>'
        + "Esta estação foi fotografada em "
        + (cH > 0 && cH < 360 ? Math.round(cH) + "° de giro" : "toda a volta")
        + (cV > 0 && cV < 180 ? " por " + Math.round(cV) + "° de altura" : "")
        + ". Volte para a parte colorida — fora dela não há o que ver nem o que medir.</span>";
      el.style.display = "block";
    }
  }

  function loop() {
    if (!S || !S.alive) return;
    desenhar();
    S.raf = global.requestAnimationFrame(loop);
  }

  /* Um quadro SÍNCRONO, para o gravador de vídeo e para o e2e. ⚠ Aba oculta
     não recebe rAF: sem este gancho, quem lê o canvas fora da tela mede uma
     imagem em branco e culpa o produto. */
  View.quadro = function () {
    if (!S || !S.alive) return null;
    desenhar();
    return S.renderer.domElement;
  };

  View.aoQuadro = function (fn) { if (S && typeof fn === "function") S.ticks.push(fn); };

  global.Tour360View = View;
  if (typeof module !== "undefined" && module.exports) module.exports = View;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
