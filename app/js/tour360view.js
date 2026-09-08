/* =====================================================================
 * tour360view.js — a ESFERA: o que desenha a foto 360 na tela.
 *
 * Motor da conta está em js/tour360.js (puro, testável em Node). Aqui mora
 * só o que precisa de navegador: WebGL, arrastar com o dedo, marcador na
 * tela, cortina do comparativo e o quadro que o gravador de vídeo consome.
 *
 * ---------------------------------------------------------------------
 * TRÊS DECISÕES QUE PARECEM DETALHE E NÃO SÃO
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
 * API (fachada única, no padrão da casa):
 *   Tour360View.disponivel()                 → {ok} | {ok:false, motivo}
 *   Tour360View.montar(host, opts)           → Promise<{ok}|{ok:false, motivo}>
 *   Tour360View.abrir(dataURI, ponto)        → Promise<{ok, w, h, equirect}>
 *   Tour360View.abrirComparativo(dA, dB, p)  → Promise
 *   Tour360View.cortina(f)                   // 1 = só o ANTES, 0 = só o depois
 *   Tour360View.olharPara(yaw, pitch, fov)
 *   Tour360View.pose()                       → {yaw, pitch, fov}
 *   Tour360View.aoClicar(fn) / aoMover(fn) / aoMarcador(fn)
 *   Tour360View.marcadores(lista)            // [{id, yaw, pitch, tipo, rotulo}]
 *   Tour360View.sobrepor(canvasOuNull, op)   // o render do BIM por cima
 *   Tour360View.quadro()                     → HTMLCanvasElement | null
 *   Tour360View.desmontar()
 * ===================================================================== */
(function (global) {
  "use strict";

  var View = {};
  var S = null;             /* estado do mount — um só, como no js/bim.js */
  var THREE = null;         /* cache do módulo entre montagens */

  var FOV_MIN = 25, FOV_MAX = 100, FOV_PADRAO = 75;
  var ROT_ESFERA = -Math.PI / 2;   /* medido; ver esferaCom() */
  var RAIO = 500;

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function M() { return global.Tour360; }   /* o motor; a conta mora lá */

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
        host.appendChild(S.renderer.domElement);
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

      var camadaMarc = global.document.createElement("div");
      camadaMarc.className = "t360-marcadores";
      camadaMarc.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
      host.appendChild(camadaMarc);

      var camadaSobre = global.document.createElement("canvas");
      camadaSobre.className = "t360-sobre";
      camadaSobre.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none";
      host.appendChild(camadaSobre);

      S = {
        alive: true, host: host, T: T, scene: scene, camera: camera, renderer: renderer,
        camadaMarc: camadaMarc, camadaSobre: camadaSobre,
        esferaA: null, esferaB: null, texA: null, texB: null,
        yaw: 0, pitch: 0, fov: FOV_PADRAO, cortina: 1, modo: "simples",
        ponto: null, marcadores: [], elMarc: {},
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
    S.alive = false;
    if (S.raf) { try { global.cancelAnimationFrame(S.raf); } catch (e) {} S.raf = 0; }
    desligarEventos();
    soltarEsferas();
    try { S.renderer.dispose(); } catch (e) {}
    try { S.renderer.forceContextLoss(); } catch (e) {}
    [S.renderer.domElement, S.camadaMarc, S.camadaSobre].forEach(function (el) {
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

    el.addEventListener("mousedown", _h.down);
    el.addEventListener("touchstart", _h.down, { passive: true });
    global.addEventListener("mousemove", _h.move);
    el.addEventListener("touchmove", _h.move, { passive: false });
    global.addEventListener("mouseup", _h.up);
    el.addEventListener("touchend", _h.up);
    el.addEventListener("wheel", _h.roda, { passive: false });
    global.addEventListener("resize", _h.resize);
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
    posicionarMarcadores();
    for (var i = 0; i < S.ticks.length; i++) { try { S.ticks[i](); } catch (e) {} }
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
