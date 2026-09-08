/* =====================================================================
 * tour360cap.js — COMO A FOTO 360 ENTRA NO APLICATIVO.
 *
 * O que é: o pedaço que resolve o problema mais chato do tour virtual — o
 * navegador NÃO TEM "modo panorama". Não existe API para pedir ao celular
 * "me devolva uma equiretangular". Existem dois caminhos, e este arquivo
 * implementa os dois, com a fronteira entre eles escrita em letra de fôrma.
 *
 * ---------------------------------------------------------------------
 * CAMINHO A — IMPORTAR (funciona SEMPRE, até em http puro)
 * ---------------------------------------------------------------------
 * `<input type="file" accept="image/*">`. O aplicativo de câmera do celular
 * tem modo Panorama / Photo Sphere; o usuário tira lá e escolhe o arquivo
 * aqui. `classificar` lê as dimensões e decide o que aquilo é:
 *
 *   2:1 (Tour360.ehEquiretangular)  → panorama de verdade, ponto "equirect";
 *   qualquer outra proporção        → foto comum, ponto "plana": aparece no
 *                                     tour, mas NÃO gira e NÃO permite medir
 *                                     por ângulo (a medição de Tour360 vive
 *                                     da geometria equiretangular).
 *
 * ⚠ O atributo `capture="environment"` ABRE A CÂMERA DIRETO e, em vários
 *   Androids, TIRA A GALERIA DA JOGADA — ou seja, o panorama que o usuário
 *   acabou de tirar fica inalcançável justamente por causa do atributo que
 *   deveria ajudar. Por isso `abrirSeletor` só põe `capture` quando a tela
 *   pede "tirar agora"; o botão de importar panorama chama SEM ele. São dois
 *   botões diferentes de propósito, não é duplicação.
 *
 * ---------------------------------------------------------------------
 * CAMINHO B — CAPTURA ASSISTIDA (só em contexto seguro)
 * ---------------------------------------------------------------------
 * getUserMedia + DeviceOrientationEvent: o usuário gira devagar, o módulo
 * pega um quadro a cada N graus de guinada e costura por PROJEÇÃO
 * CILÍNDRICA — cada quadro vira uma faixa vertical do panorama, posicionada
 * pelo ÂNGULO DO SENSOR. Não há casamento de características (não há
 * biblioteca aqui e não caberia): a costura é geométrica.
 *
 * ⚠ E AQUI ESTÁ A ARMADILHA QUE ESTE ARQUIVO EXISTE PARA EVITAR:
 *   getUserMedia e DeviceOrientationEvent só existem em CONTEXTO SEGURO
 *   (https ou localhost). O servidor local do OrçaPRO (server/static.js) é
 *   http puro — então, no CELULAR, acessando pelo IP da rede, o caminho B
 *   NUNCA vai funcionar, por mais permissão que a pessoa conceda. Botão que
 *   aparece e falha depois é pior que botão que não aparece: a pessoa tenta
 *   três vezes, culpa o aplicativo e volta a mandar foto por mensagem.
 *   Por isso `podeCapturar()` decide ANTES, e toda recusa carrega `saida` —
 *   o caminho que de fato funciona naquele aparelho.
 *
 * ⚠ iOS 13+: `DeviceOrientationEvent.requestPermission()` existe e EXIGE
 *   gesto do usuário. Chamado fora de um clique ele rejeita, e não há
 *   segunda chance sem recarregar a página. `pedirPermissao` tem que ser
 *   chamada de dentro do manipulador do toque.
 *
 * ---------------------------------------------------------------------
 * MOTOR PURO E FIAÇÃO FINA
 * ---------------------------------------------------------------------
 * A MATEMÁTICA da costura não toca canvas nem DOM e roda em Node:
 *   plano · faixaDe · cobertura · aceitaQuadro · classificar ·
 *   colunasDaProjecao · retanguloDaColuna · rumoDoSensor · yawRelativo ·
 *   pitchDoSensor · aceitaArquivo · aplicarNoPonto · podeCapturar(amb)
 * O que precisa de navegador (câmera, canvas, FileReader, seletor de
 * arquivo) mora na seção 6 e chama a seção 3.
 *
 * ⚠ `podeCapturar` recebe um AMBIENTE opcional justamente para que o teste
 *   exercite o MESMO código que roda em produção, em vez de uma cópia.
 *
 * ---------------------------------------------------------------------
 * HONESTIDADE (não é enfeite: é requisito)
 * ---------------------------------------------------------------------
 * Costura por sensor tem emenda visível, linha reta que quebra na junta, e
 * — o que mais surpreende quem usa — NÃO TEM CHÃO NEM TETO: a câmera do
 * celular enxerga uns 45° na vertical, então o panorama costurado é uma
 * cinta no meio da esfera. Consequência prática que precisa estar na tela:
 * numa foto costurada NÃO DÁ PARA MEDIR distância no chão, porque medir
 * exige marcar onde o objeto encosta no piso — e o piso não foi fotografado.
 * `AVISO_COSTURA` diz isso com todas as letras, e a tela é obrigada a
 * mostrá-lo. Prometer "panorama profissional" aqui seria mentira.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Cap = {};

  var RAD = Math.PI / 180;
  var GRAU = 180 / Math.PI;

  /* ---------------------------------------------------------------------
   * 0. UTILITÁRIOS LOCAIS
   *
   * ⚠ A conta de ÂNGULO mora no motor (js/tour360.js) e NÃO é copiada para
   *   cá. Réplica de utilitário apodrece: nesta base já houve 33 módulos com
   *   cópia do mesmo conversor e duas cópias erradas em sentidos opostos,
   *   as duas mexendo em número que o cliente lê. Se o motor não estiver
   *   carregado, este arquivo RECUSA o serviço em vez de inventar uma
   *   segunda convenção de guinada.
   * ------------------------------------------------------------------- */

  function M() { return global.Tour360; }

  function semMotor() {
    return {
      ok: false, codigo: "sem-motor",
      motivo: "O motor do tour (tour360.js) não está carregado nesta página. Feche e abra o aplicativo; se continuar, reinstale a atualização."
    };
  }

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function txt(v) { return v == null ? "" : String(v); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r3(n) { return Math.round(n * 1000) / 1000; }
  function mod(v, m) { return ((v % m) + m) % m; }

  function NY(g) { return M().normalizarYaw(g); }
  function DY(a, b) { return M().difYaw(a, b); }

  /* ⚠ Data e hora LOCAIS, nunca toISOString(): das 21h à meia-noite em
     Brasília o ISO já está em amanhã, e a foto tirada hoje nasceria carimbada
     de amanhã no relatório que o cliente lê. Mesmo padrão do resto da casa. */
  function agoraLocal(quando) {
    var d = quando || new Date();
    function d2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + d2(d.getMonth() + 1) + "-" + d2(d.getDate()) +
      " " + d2(d.getHours()) + ":" + d2(d.getMinutes());
  }
  Cap.agoraLocal = agoraLocal;

  /* =====================================================================
   * 1. NÚMEROS DE CALIBRAGEM
   * ================================================================== */

  /* Palpite honesto da abertura horizontal da câmera traseira de celular.
     O navegador NÃO informa o campo de visão em lugar nenhum da API — logo
     isto é um chute com nome. Chute errado para menos repete conteúdo na
     emenda; para mais, engole pedaço do ambiente. A tela deixa ajustar. */
  Cap.FOV_PADRAO = 60;

  /* Sobreposição entre quadros vizinhos. Não é luxo: é a folga que absorve o
     erro do sensor de bússola, que erra alguns graus com facilidade perto de
     ferragem e de quadro elétrico — que é exatamente onde a obra acontece. */
  Cap.SOBREPOSICAO_PADRAO = 0.30;

  /* Distância angular mínima entre um quadro e o anterior. Sem isto o
     manipulador de orientação dispara dezenas de vezes por segundo e o
     panorama recebe 200 desenhos do mesmo lugar — canvas quente, telefone
     quente, e nenhuma cobertura a mais. */
  Cap.PASSO_MIN_PADRAO = 5;

  /* Buraco menor que isto é tremor de sensor, não falta de foto. Tratá-lo
     como buraco faria a barra nunca chegar a 100% e a pessoa giraria para
     sempre atrás de um pedaço que já está lá. */
  Cap.BURACO_MIN = 1;

  Cap.LARGURA_PADRAO = 4096;
  Cap.LARGURA_MIN = 1024;
  Cap.LARGURA_MAX = 8192;

  /* Fatias verticais por quadro na reprojeção. Poucas = curva aproximada por
     poucos degraus (a linha reta sai quebrada); muitas = uma chamada de
     desenho por fatia e o celular engasga. 24 é o meio-termo medido a olho. */
  Cap.FATIAS_PADRAO = 24;

  Cap.QUALIDADE_JPEG = 0.82;
  Cap.MAX_QUADROS = 200;
  Cap.MAX_BYTES_ARQUIVO = 25 * 1024 * 1024;
  Cap.INTERVALO_MIN_MS = 220;

  /* Cinza neutro no que não foi fotografado. Preto se lê como sombra dentro
     do ambiente ("que buraco é aquele no teto?"); cinza chapado se lê como
     "aqui não há dado", que é a verdade. */
  Cap.COR_VAZIO = "#2b2f33";

  Cap.DICA_PANORAMA =
    "Saída que funciona sempre: abra o aplicativo de câmera do celular, escolha o modo Panorama (ou Photo Sphere), dê a volta completa e depois toque em \"Importar panorama\" aqui.";

  /* ⚠ Texto obrigatório na tela da captura assistida. Não é aviso jurídico:
     é o que impede a pessoa de fotografar a obra inteira e só descobrir na
     hora de medir que a foto costurada não tem chão. */
  Cap.AVISO_COSTURA =
    "A costura usa o sensor de direção do celular, não o conteúdo da imagem: as emendas ficam visíveis e linhas retas podem quebrar na junta. " +
    "E a faixa cobre só a altura que a câmera enxergou — a foto costurada NÃO tem chão nem teto, então nela não dá para medir distância no piso. " +
    "Para uma foto 360 sem emenda e com chão, use o modo Panorama do aplicativo de câmera ou uma câmera 360.";

  /* =====================================================================
   * 2. AMBIENTE: o que ESTE aparelho deixa fazer
   *
   * Decidir aqui, antes de desenhar botão. Todo "não" carrega `saida`.
   * ================================================================== */

  function recusaAmbiente(codigo, motivo) {
    return { ok: false, codigo: codigo, motivo: motivo, saida: Cap.DICA_PANORAMA };
  }

  Cap.podeCapturar = function (amb) {
    var w = amb || global;
    var nav = w && w.navigator;
    var proto = (w && w.location && txt(w.location.protocol)) || "";

    if (!w || !nav || typeof w.addEventListener !== "function") {
      return recusaAmbiente("sem-navegador",
        "Esta tela não está rodando dentro de um navegador com câmera.");
    }

    /* ⚠ A checagem que sustenta o arquivo. Em http puro (que é como o
       servidor local do OrçaPRO serve o aplicativo na rede), o navegador do
       celular simplesmente não expõe câmera nem bússola. Sem esta recusa o
       botão aparece, a pessoa concede permissão, nada acontece, e o suporte
       recebe "a câmera do aplicativo não funciona". */
    if (!w.isSecureContext) {
      return recusaAmbiente("sem-contexto-seguro",
        "Esta página está aberta em " + (proto ? proto.replace(":", "") : "endereço comum") +
        " e o navegador só entrega câmera e bússola em https ou no próprio computador. " +
        "No celular, abrindo pelo endereço de rede, a captura dentro do aplicativo não vai abrir — não é permissão faltando, é regra do navegador.");
    }

    if (!nav.mediaDevices || typeof nav.mediaDevices.getUserMedia !== "function") {
      return recusaAmbiente("sem-camera",
        "Este navegador não entrega a câmera para a página.");
    }

    if (!w.DeviceOrientationEvent) {
      return recusaAmbiente("sem-bussola",
        "Este aparelho não informa para onde está apontando (sem bússola ou giroscópio). A costura é feita pelo ângulo do sensor: sem ele, os quadros não têm onde pousar.");
    }

    return { ok: true, precisaPermissao: Cap.precisaPedirPermissao(w) };
  };

  Cap.precisaPedirPermissao = function (amb) {
    var w = amb || global;
    var D = w && w.DeviceOrientationEvent;
    return !!(D && typeof D.requestPermission === "function");
  };

  /* ⚠ TEM que ser chamada de dentro do manipulador do toque. O iOS conta
     como "gesto do usuário" só a pilha de chamada síncrona do clique; um
     setTimeout de 0 no meio já invalida, o pedido é rejeitado, e o iOS não
     pergunta de novo sem recarregar a página. */
  Cap.pedirPermissao = function (amb) {
    var w = amb || global;
    if (!Cap.precisaPedirPermissao(w)) return Promise.resolve({ ok: true, pedido: false });

    var p;
    try {
      p = w.DeviceOrientationEvent.requestPermission();
    } catch (e) {
      return Promise.resolve({
        ok: false, codigo: "sem-gesto",
        motivo: "O iPhone só pergunta pela bússola quando você TOCA no botão. Toque em \"Começar a girar\" de novo; se ainda assim não perguntar, feche e abra a página."
      });
    }
    if (!p || typeof p.then !== "function") return Promise.resolve({ ok: true, pedido: true });

    return p.then(function (r) {
      if (r === "granted") return { ok: true, pedido: true };
      return {
        ok: false, codigo: "negado",
        motivo: "Permissão de movimento e orientação negada. Sem ela não dá para saber para onde o celular aponta. " + Cap.DICA_PANORAMA,
        saida: Cap.DICA_PANORAMA
      };
    })["catch"](function () {
      return {
        ok: false, codigo: "sem-gesto",
        motivo: "O pedido de permissão não chegou a ser feito. Toque no botão novamente.",
        saida: Cap.DICA_PANORAMA
      };
    });
  };

  /* =====================================================================
   * 3. MOTOR — a matemática da volta e da costura (puro, roda em Node)
   * ================================================================== */

  /* Quantos quadros e em que guinadas capturar para fechar 360°.
     O passo é REDISTRIBUÍDO (360/n) depois de arredondar o número de quadros
     para cima: sem isso o último quadro cai por cima do primeiro com uma
     sobra qualquer, e a única emenda dupla da volta fica no lugar onde a
     pessoa começou — justamente o pedaço que ela olha primeiro. */
  Cap.plano = function (fovH, sobreposicao, opts) {
    if (!M()) return semMotor();
    var o = opts || {};
    var f = num(fovH, Cap.FOV_PADRAO);
    if (!(f > 0) || f > 179) {
      return { ok: false, codigo: "fov", motivo: "Abertura da câmera fora do possível: informe entre 1° e 179°.", quadros: 0, yaws: [] };
    }
    var s = num(sobreposicao, Cap.SOBREPOSICAO_PADRAO);
    if (s < 0) s = 0;
    if (s > 0.9) s = 0.9;

    var passoBruto = f * (1 - s);
    var n = Math.ceil(360 / passoBruto);
    if (n < 2) n = 2;                       /* com um quadro só não existe volta */

    if (n > Cap.MAX_QUADROS) {
      return {
        ok: false, codigo: "quadros-demais", quadros: n, yaws: [],
        motivo: "Com essa abertura (" + r1(f) + "°) e essa sobreposição (" + Math.round(s * 100) +
          "%) seriam " + n + " quadros — o giro levaria minutos e o celular não aguenta. Reduza a sobreposição ou informe a abertura correta da câmera."
      };
    }

    var passo = 360 / n;
    var yawInicial = num(o.yawInicial, -180);
    var yaws = [], i;
    for (i = 0; i < n; i++) yaws.push(NY(yawInicial + i * passo));

    return {
      ok: true,
      quadros: n,
      passo: r2(passo),
      fovH: f,
      sobreposicao: s,
      /* a sobreposição que de fato sai depois do arredondamento; é ela que a
         tela deve mostrar, não a que foi pedida */
      sobreposicaoReal: r3(f > passo ? (f - passo) / f : 0),
      passoMin: r2(Math.max(1, passo * 0.5)),
      yaws: yaws
    };
  };

  /* Onde o quadro tirado em `yaw` pousa no panorama equiretangular.
     A convenção de coluna é a MESMA de Tour360.anguloParaPixel:
     x = ((yaw + 180) / 360) · largura.

     ⚠ A faixa pode atravessar a emenda (a coluna 0 e a coluna W são o mesmo
       meridiano). Quem desenhar tem que pintar as DUAS partes: um único
       drawImage com x negativo ou maior que W simplesmente não desenha, e o
       panorama fica com uma fatia faltando bem no ponto de partida do giro. */
  Cap.faixaDe = function (yaw, fovH, larguraPanorama) {
    if (!M()) return semMotor();
    var W = num(larguraPanorama, 0);
    var f = num(fovH, Cap.FOV_PADRAO);
    if (!(W > 0)) return { ok: false, codigo: "sem-largura", motivo: "Panorama sem largura." };
    if (!(f > 0) || f > 360) return { ok: false, codigo: "fov", motivo: "Abertura da câmera fora do possível." };

    var largura = (f / 360) * W;
    var centro = mod(((NY(yaw) + 180) / 360) * W, W);
    var x = mod(centro - largura / 2, W);
    var cruza = (x + largura) > W + 1e-9;

    var partes = cruza
      ? [{ x: x, largura: W - x }, { x: 0, largura: largura - (W - x) }]
      : [{ x: x, largura: largura }];

    return { ok: true, x: x, largura: largura, centro: centro, cruzaEmenda: cruza, partes: partes };
  };

  /* O que já foi coberto e o que ainda falta girar.
     Trabalha num eixo linear 0..360 (0 = guinada −180) porque intervalo que
     dá a volta não se ordena; no fim converte de volta para guinada e
     RECOSTURA o buraco que atravessa a emenda, senão a tela diria
     "falta de 170° a 180° e de −180° a −150°" para um buraco só de 40°. */
  Cap.cobertura = function (yawsCapturados, fovH) {
    if (!M()) {
      var sm = semMotor();
      sm.fracao = 0; sm.graus = 0; sm.completo = false;
      sm.buracos = [{ de: -180, ate: 180, tamanho: 360 }];
      return sm;
    }
    var f = num(fovH, Cap.FOV_PADRAO);
    var lista = (yawsCapturados || []).filter(function (y) { return isFinite(+y); });

    if (!(f > 0) || !lista.length) {
      return { ok: true, fracao: 0, graus: 0, completo: false, quadros: lista.length, buracos: [{ de: -180, ate: 180, tamanho: 360 }] };
    }
    if (f >= 360) {
      return { ok: true, fracao: 1, graus: 360, completo: true, quadros: lista.length, buracos: [] };
    }

    var tol = Cap.BURACO_MIN;
    var brutos = [], i, c, a, b;
    for (i = 0; i < lista.length; i++) {
      c = mod(NY(lista[i]) + 180, 360);
      a = c - f / 2; b = c + f / 2;
      if (a < 0) { brutos.push([0, b]); brutos.push([a + 360, 360]); }
      else if (b > 360) { brutos.push([a, 360]); brutos.push([0, b - 360]); }
      else brutos.push([a, b]);
    }
    brutos.sort(function (p, q) { return p[0] - q[0]; });

    var uni = [], ult;
    for (i = 0; i < brutos.length; i++) {
      ult = uni.length ? uni[uni.length - 1] : null;
      /* junta também o que está separado por menos que BURACO_MIN: aquele
         vão é tremor de sensor, e contá-lo como buraco travaria a barra em
         99% para sempre (ver comentário da constante) */
      if (ult && brutos[i][0] <= ult[1] + tol) {
        if (brutos[i][1] > ult[1]) ult[1] = brutos[i][1];
      } else {
        uni.push([brutos[i][0], brutos[i][1]]);
      }
    }

    var graus = 0;
    for (i = 0; i < uni.length; i++) graus += (uni[i][1] - uni[i][0]);
    if (graus > 360) graus = 360;

    var buracos = [], pos = 0;
    for (i = 0; i < uni.length; i++) {
      if (uni[i][0] - pos > tol) buracos.push([pos, uni[i][0]]);
      if (uni[i][1] > pos) pos = uni[i][1];
    }
    if (360 - pos > tol) buracos.push([pos, 360]);

    /* buraco que encosta nas duas pontas do eixo linear é UM buraco só,
       atravessando a emenda */
    if (buracos.length > 1 && buracos[0][0] <= tol && buracos[buracos.length - 1][1] >= 360 - tol) {
      var ini = buracos[buracos.length - 1][0];
      var fim = buracos[0][1] + 360;
      buracos.pop();
      buracos.shift();
      buracos.push([ini, fim]);
    }

    var saida = buracos.map(function (h) {
      return { de: r2(paraYaw(h[0])), ate: r2(paraYaw(h[1])), tamanho: r2(h[1] - h[0]) };
    });

    return {
      ok: true,
      fracao: Math.min(1, r3(graus / 360)),
      graus: r1(graus),
      completo: saida.length === 0,
      quadros: lista.length,
      buracos: saida
    };
  };

  function paraYaw(a) {
    var v = a - 180;
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
  }

  /* Vale a pena guardar este quadro? Evita 200 desenhos do mesmo lugar.
     ⚠ Sem o motor devolve FALSE: recusar um quadro atrasa o usuário alguns
       segundos; aceitar sem saber medir ângulo pinta a faixa no lugar errado
       e estraga o panorama inteiro sem aviso. */
  Cap.aceitaQuadro = function (yawNovo, yawsJa, passoMin) {
    if (!M()) return false;
    var y = +yawNovo;
    if (!isFinite(y)) return false;
    var p = num(passoMin, 0);
    if (!(p > 0)) p = Cap.PASSO_MIN_PADRAO;
    var ja = yawsJa || [], i;
    for (i = 0; i < ja.length; i++) {
      if (!isFinite(+ja[i])) continue;
      if (Math.abs(DY(ja[i], y)) < p) return false;
    }
    return true;
  };

  /* Frase para a tela. Número o usuário confere; "quase lá" ele ignora. */
  Cap.textoCobertura = function (cov) {
    if (!cov) return "";
    var pct = Math.round(num(cov.fracao, 0) * 100);
    if (cov.completo) return "Volta fechada: 100% do giro coberto.";
    if (!cov.buracos || !cov.buracos.length) return pct + "% do giro coberto.";
    var partes = cov.buracos.map(function (b) {
      return "de " + Math.round(b.de) + "° a " + Math.round(b.ate) + "°";
    });
    return pct + "% do giro coberto. Falta girar " + partes.join(" e ") + ".";
  };

  /* =====================================================================
   * 4. PROJEÇÃO CILÍNDRICA (puro)
   *
   * O quadro da câmera é uma imagem em PERSPECTIVA (buraco de agulha): a
   * escala horizontal cresce com a tangente do ângulo. Colar o retângulo
   * inteiro numa faixa do equiretangular estica o centro e comprime as
   * bordas — o resultado é uma obra com paredes onduladas.
   *
   * Reprojetar de verdade exige percorrer pixel a pixel, o que o celular não
   * aguenta em tempo real. O meio-termo usado aqui é o clássico: cortar o
   * quadro em FATIAS verticais e reposicionar cada fatia pelo ângulo real do
   * seu centro. Com 24 fatias o erro que sobra é menor que a própria emenda.
   *
   * Geometria (câmera olhando para +z, x para a direita, y para cima):
   *   focal  f = (larguraFonte/2) / tan(fovH/2)
   *   coluna no ângulo θ  →  x = larguraFonte/2 + f·tan(θ)
   *   meia-altura em graus daquela coluna: atan((alturaFonte/2)·cos(θ) / f)
   *   (o cos(θ) é o que faz a faixa AFINAR nas bordas — sem ele, a foto sai
   *    esticada verticalmente nas pontas e a emenda desalinha na horizontal)
   * ================================================================== */

  Cap.colunasDaProjecao = function (fovH, larguraFonte, alturaFonte, fatias) {
    var f = num(fovH, Cap.FOV_PADRAO);
    var SW = num(larguraFonte, 0), SH = num(alturaFonte, 0);
    if (!(f > 0) || f >= 180) return { ok: false, codigo: "fov", motivo: "Abertura da câmera fora do possível para uma imagem em perspectiva (tem que ser menor que 180°)." };
    if (!(SW > 0) || !(SH > 0)) return { ok: false, codigo: "sem-quadro", motivo: "O quadro da câmera veio sem dimensão." };

    var n = Math.round(num(fatias, Cap.FATIAS_PADRAO));
    if (!(n >= 1)) n = Cap.FATIAS_PADRAO;
    if (n > 256) n = 256;

    var focal = (SW / 2) / Math.tan((f / 2) * RAD);
    var cols = [], i, t0, t1, x0, x1, tm, meia;

    for (i = 0; i < n; i++) {
      t0 = (i / n - 0.5) * f;
      t1 = ((i + 1) / n - 0.5) * f;
      x0 = SW / 2 + focal * Math.tan(t0 * RAD);
      x1 = SW / 2 + focal * Math.tan(t1 * RAD);
      if (x0 < 0) x0 = 0;
      if (x1 > SW) x1 = SW;
      tm = (t0 + t1) / 2;
      meia = Math.atan(((SH / 2) * Math.cos(tm * RAD)) / focal) * GRAU;
      cols.push({
        sx: x0,
        sw: Math.max(0, x1 - x0),
        deYaw: t0,
        ateYaw: t1,
        meiaAlturaGraus: meia
      });
    }

    return {
      ok: true, fatias: n, focal: focal, colunas: cols,
      fovVertical: r2(2 * Math.atan((SH / 2) / focal) * GRAU)
    };
  };

  /* Retângulo de destino de uma fatia, no panorama de largura W (altura W/2).
     `x` pode terminar depois de W: quem desenha pinta de novo em `x - W`
     (ver a armadilha da emenda em `faixaDe`). */
  Cap.retanguloDaColuna = function (col, yawCentro, larguraPanorama, pitchCentro) {
    if (!M()) return null;
    var W = num(larguraPanorama, 0);
    if (!col || !(W > 0)) return null;
    var H = W / 2;
    var pc = num(pitchCentro, 0);
    var meia = num(col.meiaAlturaGraus, 0);

    var dw = ((num(col.ateYaw, 0) - num(col.deYaw, 0)) / 360) * W;
    var xEsq = mod(((NY(num(yawCentro, 0) + num(col.deYaw, 0)) + 180) / 360) * W, W);

    var topo = Math.max(-90, Math.min(90, pc + meia));
    var base = Math.max(-90, Math.min(90, pc - meia));

    return {
      x: xEsq,
      largura: dw,
      y: ((90 - topo) / 180) * H,
      altura: ((topo - base) / 180) * H
    };
  };

  /* =====================================================================
   * 5. CAMINHO A — o arquivo que veio do aplicativo de câmera (puro)
   * ================================================================== */

  function ehHeic(nome, tipo) {
    var n = txt(nome).toLowerCase(), t = txt(tipo).toLowerCase();
    return t.indexOf("heic") >= 0 || t.indexOf("heif") >= 0 ||
      /\.(heic|heif)$/.test(n);
  }

  Cap.MSG_HEIC =
    "Esta foto é um arquivo HEIC do iPhone, que o navegador não consegue abrir. " +
    "No iPhone: Ajustes → Câmera → Formatos → \"Mais compatível\" e tire a foto de novo; ou envie a foto por um caminho que a converta para JPEG.";

  /* Só olha nome, tipo e tamanho — por isso roda em Node com um objeto
     simulando o File, e o teste exercita o mesmo código da produção. */
  Cap.aceitaArquivo = function (arq) {
    if (!arq) return { ok: false, codigo: "vazio", motivo: "Nenhum arquivo escolhido." };
    var nome = txt(arq.name);
    var tipo = txt(arq.type).toLowerCase();
    var bytes = num(arq.size, 0);

    if (ehHeic(nome, tipo)) return { ok: false, codigo: "heic", motivo: Cap.MSG_HEIC, saida: Cap.DICA_PANORAMA };

    if (tipo && tipo.indexOf("image/") !== 0) {
      return { ok: false, codigo: "nao-imagem", motivo: "\"" + (nome || "o arquivo escolhido") + "\" não é uma imagem." };
    }
    if (!tipo && !/\.(jpe?g|png|webp)$/i.test(nome)) {
      return { ok: false, codigo: "nao-imagem", motivo: "Não reconheci \"" + (nome || "o arquivo escolhido") + "\" como foto. Escolha um arquivo .jpg ou .png." };
    }
    if (bytes > Cap.MAX_BYTES_ARQUIVO) {
      return {
        ok: false, codigo: "grande",
        motivo: "Esta foto tem " + r1(bytes / (1024 * 1024)) + " MB e o limite por ponto é " +
          Math.round(Cap.MAX_BYTES_ARQUIVO / (1024 * 1024)) + " MB. Reduza a resolução no aplicativo de câmera e tente de novo."
      };
    }
    return { ok: true, nome: nome, bytes: bytes, tipoArquivo: tipo };
  };

  /* A classificação que decide se o ponto gira ou não.
     ⚠ Panorama de celular costuma sair MUITO mais largo que 2:1 (uma cinta de
       200° por 40°). Ele não é equiretangular e não pode virar esfera: ficaria
       com a obra espremida e o resto preto. Dizer só "não é panorama" faria a
       pessoa repetir a mesma foto — por isso o caso tem código e recado
       próprios. */
  Cap.classificar = function (largura, altura, tol) {
    if (!M()) return semMotor();
    var W = num(largura, 0), H = num(altura, 0);
    if (!(W > 0) || !(H > 0)) {
      return { ok: false, codigo: "sem-dimensao", motivo: "Não consegui ler o tamanho desta imagem." };
    }
    var prop = W / H;
    var eq = M().ehEquiretangular(W, H, tol);

    if (eq) {
      return {
        ok: true, largura: W, altura: H, proporcao: r3(prop),
        equirect: true, tipo: "equirect", codigo: "equirect", aviso: ""
      };
    }
    if (prop > 2) {
      return {
        ok: true, largura: W, altura: H, proporcao: r3(prop),
        equirect: false, tipo: "plana", codigo: "pano-parcial",
        aviso: "Este panorama é uma faixa (proporção " + r2(prop) + ":1), não uma esfera 2:1: ele tem largura, mas não tem chão nem teto. " +
          "Ele entra no tour como foto comum — aparece no ponto, mas não gira em 360 e não permite medir por ângulo. " +
          "Para girar, o arquivo precisa fechar a volta inteira (modo Photo Sphere, ou uma câmera 360)."
      };
    }
    return {
      ok: true, largura: W, altura: H, proporcao: r3(prop),
      equirect: false, tipo: "plana", codigo: "comum",
      aviso: "Esta é uma foto comum (proporção " + r2(prop) + ":1). Ela entra no tour como foto do ponto: aparece, mas não gira em 360 e não permite medir por ângulo. " + Cap.DICA_PANORAMA
    };
  };

  /* Grava o resultado da leitura no ponto do tour. `opts.foto` existe para a
     tela poder passar a REFERÊNCIA já guardada (Fotos.guardar) em vez do
     data URI inteiro — o registro do tour não deve carregar megabytes. */
  Cap.aplicarNoPonto = function (ponto, res, opts) {
    var o = opts || {};
    if (!ponto) return { ok: false, motivo: "Ponto não informado." };
    if (!res || !res.ok) return { ok: false, motivo: (res && res.motivo) || "Foto não lida." };

    var foto = o.foto !== undefined && o.foto !== null ? o.foto : res.dataURI;
    if (!foto) return { ok: false, motivo: "A leitura não devolveu imagem nenhuma." };

    ponto.foto = foto;
    /* ⚠ Só "equirect" e "plana": Tour360.validar conta como plana tudo que
       não for "equirect", e um terceiro rótulo inventado aqui viraria aviso
       silencioso lá. */
    ponto.tipo = res.tipo === "equirect" ? "equirect" : "plana";
    ponto.capturadoEm = txt(o.capturadoEm) || agoraLocal(o.quando);

    return { ok: true, tipo: ponto.tipo, aviso: txt(res.aviso), proporcao: res.proporcao };
  };

  /* Cria o ponto já com a foto. Usa Tour360.novoPonto para não duplicar o
     formato do registro — campo novo no ponto nasce lá, não aqui. */
  Cap.pontoDeFoto = function (nome, res, opts) {
    if (!M()) return semMotor();
    var o = opts || {};
    var p = M().novoPonto(nome, o);
    var r = Cap.aplicarNoPonto(p, res, o);
    if (!r.ok) return r;
    return { ok: true, ponto: p, tipo: r.tipo, aviso: r.aviso };
  };

  /* =====================================================================
   * 6. FIAÇÃO — o que só existe dentro do navegador
   * ================================================================== */

  Cap.ATRIBUTOS_INPUT = { type: "file", accept: "image/*", capture: "environment" };

  /* Abre o seletor de arquivo. `opts.captura` liga o `capture="environment"`
     — leia a armadilha no cabeçalho antes de ligá-lo por padrão. */
  Cap.abrirSeletor = function (opts, aoEscolher) {
    var o = opts || {};
    var doc = o.doc || (global.document);
    if (!doc || typeof doc.createElement !== "function") {
      return { ok: false, codigo: "sem-navegador", motivo: "Sem navegador para abrir o seletor de arquivos." };
    }
    var inp = doc.createElement("input");
    inp.type = "file";
    inp.accept = txt(o.accept) || "image/*";
    if (o.captura) inp.setAttribute("capture", "environment");

    /* fora da tela, mas NÃO display:none — em alguns navegadores o clique
       programático é ignorado num elemento removido do fluxo de layout */
    inp.style.position = "fixed";
    inp.style.left = "-10000px";
    inp.style.top = "0";
    inp.style.opacity = "0";

    function limpar() {
      try { if (inp.parentNode) inp.parentNode.removeChild(inp); } catch (e) {}
    }

    inp.addEventListener("change", function () {
      var arq = (inp.files && inp.files.length) ? inp.files[0] : null;
      limpar();
      if (typeof aoEscolher === "function") aoEscolher(arq);
    });

    /* ⚠ Cancelar o seletor NÃO dispara "change". Sem esta limpeza sobra um
       <input> preso na página a cada tentativa, e depois de algumas idas e
       vindas a página fica com uma pilha deles. */
    if (typeof global.addEventListener === "function") {
      global.addEventListener("focus", function aoVoltar() {
        global.removeEventListener("focus", aoVoltar);
        setTimeout(limpar, 1500);
      });
    }

    (doc.body || doc.documentElement).appendChild(inp);
    inp.click();
    return { ok: true, input: inp };
  };

  /* Lê o arquivo escolhido: data URI + dimensões + classificação. */
  Cap.lerArquivo = function (arq, opts) {
    var o = opts || {};
    var w = o.janela || global;
    var v = Cap.aceitaArquivo(arq);
    if (!v.ok) return Promise.resolve(v);
    if (typeof w.FileReader !== "function" || typeof w.Image !== "function") {
      return Promise.resolve({ ok: false, codigo: "sem-navegador", motivo: "Este navegador não consegue ler arquivos de imagem." });
    }

    return new Promise(function (res) {
      var fr = new w.FileReader();
      fr.onerror = function () {
        res({ ok: false, codigo: "leitura", motivo: "Não consegui ler \"" + txt(arq.name) + "\". Tente escolher a foto de novo." });
      };
      fr.onload = function () {
        var uri = txt(fr.result);
        var img = new w.Image();
        img.onload = function () {
          var c = Cap.classificar(img.naturalWidth || img.width, img.naturalHeight || img.height);
          if (!c.ok) { res(c); return; }
          res({
            ok: true, dataURI: uri,
            largura: c.largura, altura: c.altura, proporcao: c.proporcao,
            equirect: c.equirect, tipo: c.tipo, codigo: c.codigo, aviso: c.aviso,
            bytes: v.bytes, nome: v.nome
          });
        };
        /* ⚠ HEIC do iPhone passa pelo filtro de tipo (o sistema às vezes
           declara "image/heic", às vezes nada) e só falha AQUI, na decodificação.
           Sem este recado o usuário lê "não consegui abrir a imagem" e conclui
           que o aplicativo está quebrado. */
        img.onerror = function () {
          res({
            ok: false, codigo: ehHeic(arq.name, arq.type) ? "heic" : "nao-abre",
            motivo: ehHeic(arq.name, arq.type) ? Cap.MSG_HEIC : "O navegador não conseguiu abrir esta imagem. Ela pode estar corrompida ou num formato que ele não lê.",
            saida: Cap.DICA_PANORAMA
          });
        };
        img.src = uri;
      };
      fr.readAsDataURL(arq);
    });
  };

  /* --------------------------------------------------------------------
   * 6.1 Sensor de direção
   * ------------------------------------------------------------------ */

  /* Rumo de bússola em graus (0..360, crescendo no sentido horário). */
  Cap.rumoDoSensor = function (ev) {
    if (!ev) return null;
    var ch = +ev.webkitCompassHeading;
    if (isFinite(ch)) return mod(ch, 360);      /* iOS já entrega rumo horário */
    var a = +ev.alpha;
    if (!isFinite(a)) return null;
    /* ⚠ `alpha` da especificação cresce no sentido ANTI-HORÁRIO, e rumo de
       bússola cresce no horário. Sem esta inversão o usuário gira para a
       direita e a costura anda para a esquerda: o ambiente sai espelhado, e
       o comparativo do mês seguinte abre olhando a parede oposta. */
    return mod(360 - a, 360);
  };

  Cap.yawRelativo = function (rumo, rumoRef) {
    if (!M()) return null;
    var r = +rumo;
    if (!isFinite(r)) return null;
    return NY(mod(r - num(rumoRef, 0), 360));
  };

  /* ⚠ Vale só com o celular EM PÉ (retrato): beta ≈ 90 é o aparelho na
     vertical com a câmera olhando o horizonte. Em paisagem quem manda é
     gamma e a conta é outra — por isso `usarPitch` nasce DESLIGADO em
     `iniciar`: inclinação errada faz a faixa ondular e piora a emenda em vez
     de melhorar. */
  Cap.pitchDoSensor = function (ev) {
    if (!ev) return null;
    var b = +ev.beta;
    if (!isFinite(b)) return null;
    return Math.max(-60, Math.min(60, b - 90));
  };

  /* --------------------------------------------------------------------
   * 6.2 Desenho de um quadro no panorama
   * ------------------------------------------------------------------ */

  /* Pinta o quadro `fonte` (vídeo, canvas ou imagem) na faixa de `yaw`.
     Sem mistura de bordas de propósito: desenhar com alpha por cima de um
     canvas VAZIO escurece a borda do primeiro quadro (o alfa acumula contra
     o nada) — e borda escura é mais feia que emenda. O quadro mais recente
     simplesmente cobre o anterior. */
  Cap.pintarQuadro = function (ctx, fonte, yaw, opts) {
    var o = opts || {};
    if (!M()) return semMotor();
    if (!ctx || typeof ctx.drawImage !== "function") return { ok: false, codigo: "sem-canvas", motivo: "Sem contexto de desenho." };

    var SW = num(fonte && (fonte.videoWidth || fonte.naturalWidth || fonte.width), 0);
    var SH = num(fonte && (fonte.videoHeight || fonte.naturalHeight || fonte.height), 0);
    var W = num(o.largura, Cap.LARGURA_PADRAO);
    var f = num(o.fovH, Cap.FOV_PADRAO);

    var proj = Cap.colunasDaProjecao(f, SW, SH, o.fatias);
    if (!proj.ok) return proj;

    var pitch = num(o.pitch, 0);
    var pintadas = 0, i, r;

    for (i = 0; i < proj.colunas.length; i++) {
      var col = proj.colunas[i];
      if (!(col.sw > 0)) continue;
      r = Cap.retanguloDaColuna(col, yaw, W, pitch);
      if (!r || !(r.largura > 0) || !(r.altura > 0)) continue;

      desenhar(ctx, fonte, col, r, 0);
      /* ⚠ a fatia que atravessa a emenda tem que ser pintada DUAS vezes: um
         drawImage com x além da largura simplesmente não aparece, e o
         panorama fica com uma fenda exatamente no ponto de partida do giro */
      if (r.x + r.largura > W) desenhar(ctx, fonte, col, r, -W);
      pintadas++;
    }

    return { ok: true, fatias: pintadas, fovVertical: proj.fovVertical };
  };

  function desenhar(ctx, fonte, col, r, deslocX) {
    try {
      ctx.drawImage(fonte, col.sx, 0, col.sw, num(fonte.videoHeight || fonte.naturalHeight || fonte.height, 0),
        r.x + deslocX, r.y, r.largura + 0.5, r.altura);
      /* o +0,5 na largura fecha a costura de meio pixel entre fatias vizinhas:
         sem ele aparece uma grade de linhas finas do fundo, que se lê como
         chuvisco na foto da obra */
    } catch (e) {}
  }

  /* --------------------------------------------------------------------
   * 6.3 Sessão de captura assistida
   * ------------------------------------------------------------------ */

  var S = null;              /* uma sessão por vez: a câmera é uma só */
  var _aoProgresso = null;
  /* ⚠ `S` só nasce DEPOIS que getUserMedia resolve — o que leva de meio a
     dois segundos no celular, tempo de sobra para o usuário tocar de novo no
     botão. Sem esta tranca, o segundo toque abre uma SEGUNDA transmissão de
     câmera; a primeira fica sem dono, ninguém para as trilhas dela, e a luz
     da câmera continua acesa até a página fechar. */
  var _abrindo = false;

  Cap.aoProgresso = function (fn) { _aoProgresso = (typeof fn === "function") ? fn : null; };

  Cap.ativa = function () { return !!(S && S.viva); };

  /* O elemento de video da sessao, para a TELA poder mostrar o que a camera
     esta vendo. Ele nasce fora do campo de visao de proposito (ver `iniciar`:
     no iOS um video com display:none nao toca e o canvas recebe quadro preto),
     e quem quiser exibi-lo so precisa reposiciona-lo — a sessao continua dona
     dele e o desliga em `cancelar`/`finalizar`.
     ⚠ Sem isto a captura assistida seria as cegas: a pessoa gira o celular sem
     ver o que esta fotografando, e so descobre o enquadramento no fim. */
  Cap.video = function () { return (S && S.viva) ? S.video : null; };

  Cap.estado = function () {
    if (!S || !S.viva) {
      return { ativa: false, quadros: 0, yaw: null, cobertura: Cap.cobertura([], Cap.FOV_PADRAO), texto: "" };
    }
    var cov = Cap.cobertura(S.yaws, S.fovH);
    return {
      ativa: true,
      quadros: S.yaws.length,
      yaw: S.yaw,
      rumo: S.rumo,
      temBussola: S.leituras > 0,
      fovH: S.fovH,
      passoMin: S.passoMin,
      largura: S.largura,
      cobertura: cov,
      texto: Cap.textoCobertura(cov),
      aviso: Cap.AVISO_COSTURA
    };
  };

  function avisarProgresso() {
    if (!_aoProgresso) return;
    try { _aoProgresso(Cap.estado()); } catch (e) {}
  }

  /* ⚠ Chame de dentro do manipulador do toque: `pedirPermissao` só funciona
     com gesto do usuário no iOS (ver seção 2). */
  Cap.iniciar = function (opts) {
    var o = opts || {};
    var w = o.janela || global;
    var doc = o.doc || (w && w.document);

    var pode = Cap.podeCapturar(w);
    if (!pode.ok) return Promise.resolve(pode);
    if (!doc || typeof doc.createElement !== "function") {
      return Promise.resolve({ ok: false, codigo: "sem-navegador", motivo: "Sem navegador para abrir a câmera." });
    }
    if ((S && S.viva) || _abrindo) {
      return Promise.resolve({ ok: false, codigo: "ja-ativa", motivo: "Já existe uma captura em andamento." });
    }

    var fovH = num(o.fovH, Cap.FOV_PADRAO);
    var plano = Cap.plano(fovH, num(o.sobreposicao, Cap.SOBREPOSICAO_PADRAO));
    if (!plano.ok) return Promise.resolve(plano);

    var largura = Math.round(num(o.largura, Cap.LARGURA_PADRAO));
    if (largura < Cap.LARGURA_MIN) largura = Cap.LARGURA_MIN;
    if (largura > Cap.LARGURA_MAX) largura = Cap.LARGURA_MAX;
    largura = largura - (largura % 2);

    _abrindo = true;
    function destrancar(r) { _abrindo = false; return r; }

    return Cap.pedirPermissao(w).then(function (perm) {
      if (!perm.ok) return perm;

      return w.navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      }).then(function (stream) {
        var video = doc.createElement("video");
        video.setAttribute("playsinline", "");     /* ⚠ sem isto o iOS abre o vídeo em tela cheia e a página perde os quadros */
        video.setAttribute("muted", "");
        video.muted = true;
        video.autoplay = true;
        /* ⚠ NÃO usar display:none: no iOS um vídeo escondido assim não toca,
           e o canvas recebe quadros pretos sem erro nenhum na tela. */
        video.style.position = "fixed";
        video.style.left = "-10000px";
        video.style.width = "2px";
        video.style.height = "2px";
        video.style.opacity = "0";
        video.srcObject = stream;
        (doc.body || doc.documentElement).appendChild(video);

        var cv = doc.createElement("canvas");
        cv.width = largura;
        cv.height = largura / 2;
        var ctx = cv.getContext("2d");

        S = {
          viva: true, janela: w, doc: doc,
          stream: stream, video: video, canvas: cv, ctx: ctx,
          largura: largura, fovH: fovH,
          passoMin: num(o.passoMin, plano.passoMin),
          usarPitch: !!o.usarPitch,
          automatico: o.automatico !== false,
          yaws: [], yaw: null, rumo: null, rumoRef: null, pitch: 0,
          leituras: 0, ultimoMs: 0, ouvinte: null, eventoBussola: ""
        };

        ligarBussola(S);
        return esperarVideo(video).then(function () {
          avisarProgresso();
          return { ok: true, plano: plano, largura: largura, altura: largura / 2, aviso: Cap.AVISO_COSTURA };
        });
      })["catch"](function (e) {
        return { ok: false, codigo: "camera-negada", motivo: motivoDaCamera(e), saida: Cap.DICA_PANORAMA };
      });
    }).then(destrancar)["catch"](function (e) {
      _abrindo = false;
      return { ok: false, codigo: "falhou", motivo: "Não consegui abrir a captura: " + (txt(e && e.message) || "motivo desconhecido") + ".", saida: Cap.DICA_PANORAMA };
    });
  };

  function motivoDaCamera(e) {
    var n = txt(e && e.name);
    if (n === "NotAllowedError" || n === "SecurityError") {
      return "Permissão de câmera negada. Toque no cadeado ao lado do endereço e libere a câmera para este aplicativo.";
    }
    if (n === "NotFoundError" || n === "OverconstrainedError") {
      return "Não encontrei a câmera traseira deste aparelho.";
    }
    /* ⚠ NotReadableError quase sempre é a câmera ainda presa por uma captura
       anterior que não parou as trilhas (ver `Cap.cancelar`), e a pessoa lê
       isso como "o aplicativo quebrou". */
    if (n === "NotReadableError") {
      return "A câmera está ocupada por outro aplicativo (ou por uma captura anterior que não fechou). Feche os outros aplicativos de câmera e tente de novo.";
    }
    return "Não consegui abrir a câmera: " + (txt(e && e.message) || n || "motivo desconhecido") + ".";
  }

  function esperarVideo(video) {
    return new Promise(function (res) {
      var pronto = false;
      function ok() { if (!pronto) { pronto = true; res(true); } }
      if (video.readyState >= 2) { ok(); return; }
      video.addEventListener("loadeddata", ok);
      video.addEventListener("canplay", ok);
      try {
        var p = video.play();
        if (p && typeof p["catch"] === "function") p["catch"](function () {});
      } catch (e) {}
      setTimeout(ok, 4000);   /* trava sem porta não: depois de 4 s segue e o
                                 primeiro `capturar` dirá se o quadro veio */
    });
  }

  function ligarBussola(s) {
    var w = s.janela;
    /* ⚠ No Android, `deviceorientation` pode vir RELATIVO: alpha começa em 0
       onde a página abriu e vai derivando. Só `deviceorientationabsolute` é
       bússola de verdade. Registrar os dois faria o mesmo quadro ser tratado
       duas vezes, então escolhe-se UM. */
    var nome = ("ondeviceorientationabsolute" in w) ? "deviceorientationabsolute" : "deviceorientation";
    s.eventoBussola = nome;
    s.ouvinte = function (ev) {
      var rumo = Cap.rumoDoSensor(ev);
      if (rumo === null) return;
      s.leituras++;
      s.rumo = rumo;
      if (s.rumoRef === null) s.rumoRef = rumo;    /* a guinada 0 do panorama é onde o giro começou */
      s.yaw = Cap.yawRelativo(rumo, s.rumoRef);
      if (s.usarPitch) {
        var p = Cap.pitchDoSensor(ev);
        if (p !== null) s.pitch = p;
      }
      if (s.automatico) Cap.capturar();
    };
    w.addEventListener(nome, s.ouvinte, true);
  }

  /* Captura o quadro atual, se ele acrescentar alguma coisa. */
  Cap.capturar = function (forcar) {
    if (!S || !S.viva) return { ok: false, codigo: "sem-sessao", motivo: "A captura não está aberta." };
    if (S.leituras === 0 || S.yaw === null) {
      return { ok: false, codigo: "sem-bussola", motivo: "O aparelho ainda não disse para onde está apontando. Gire devagar o celular; se não mudar nada, a bússola não está liberada." };
    }
    /* ⚠ readyState < 2 significa que ainda não há quadro decodificado, e
       drawImage nesse estado pinta PRETO sem erro nenhum — o panorama ganha
       faixas pretas que se leem como buraco no ambiente. */
    if (S.video.readyState < 2) {
      return { ok: false, codigo: "sem-quadro", motivo: "A câmera ainda não entregou imagem." };
    }

    var agoraMs = (new Date()).getTime();
    if (!forcar) {
      if (agoraMs - S.ultimoMs < Cap.INTERVALO_MIN_MS) return { ok: false, codigo: "rapido" };
      if (!Cap.aceitaQuadro(S.yaw, S.yaws, S.passoMin)) return { ok: false, codigo: "repetido" };
    }

    var r = Cap.pintarQuadro(S.ctx, S.video, S.yaw, {
      largura: S.largura, fovH: S.fovH, pitch: S.pitch, fatias: Cap.FATIAS_PADRAO
    });
    if (!r.ok) return r;

    S.yaws.push(S.yaw);
    S.ultimoMs = agoraMs;
    avisarProgresso();
    return { ok: true, yaw: S.yaw, quadros: S.yaws.length };
  };

  Cap.finalizar = function (opts) {
    var o = opts || {};
    if (!S || !S.viva) return { ok: false, codigo: "sem-sessao", motivo: "A captura não está aberta." };
    if (!S.yaws.length) {
      var vazio = { ok: false, codigo: "sem-quadro", motivo: "Nenhum quadro foi capturado — não há panorama para guardar.", saida: Cap.DICA_PANORAMA };
      Cap.cancelar();
      return vazio;
    }

    var cov = Cap.cobertura(S.yaws, S.fovH);
    var W = S.largura, H = S.largura / 2;

    /* fundo por baixo do que já foi pintado: JPEG não tem transparência, e
       sem isto o vazio sairia PRETO (ver COR_VAZIO) */
    try {
      S.ctx.globalCompositeOperation = "destination-over";
      S.ctx.fillStyle = Cap.COR_VAZIO;
      S.ctx.fillRect(0, 0, W, H);
      S.ctx.globalCompositeOperation = "source-over";
    } catch (e) {}

    var uri = "";
    try {
      uri = S.canvas.toDataURL("image/jpeg", num(o.qualidade, Cap.QUALIDADE_JPEG));
    } catch (e) {
      Cap.cancelar();
      return { ok: false, codigo: "sem-imagem", motivo: "Não consegui gerar a imagem do panorama neste aparelho." };
    }

    var quadros = S.yaws.length;
    Cap.cancelar();

    var aviso = Cap.AVISO_COSTURA;
    if (!cov.completo) {
      aviso = "Volta INCOMPLETA: " + Cap.textoCobertura(cov) +
        " O que faltou fica cinza na foto. " + aviso;
    }

    return {
      ok: true, dataURI: uri, largura: W, altura: H,
      tipo: "equirect", equirect: true,
      quadros: quadros, cobertura: cov, completo: cov.completo,
      aviso: aviso
    };
  };

  /* ⚠ Não parar as trilhas deixa a luz da câmera acesa, esquenta o aparelho e
     faz o PRÓXIMO getUserMedia falhar com NotReadableError — que a pessoa lê
     como "o aplicativo quebrou". Todo caminho de saída passa por aqui. */
  Cap.cancelar = function () {
    if (!S) return { ok: true };
    var s = S;
    S = null;
    s.viva = false;
    try { if (s.ouvinte) s.janela.removeEventListener(s.eventoBussola, s.ouvinte, true); } catch (e) {}
    try {
      if (s.stream && typeof s.stream.getTracks === "function") {
        var ts = s.stream.getTracks(), i;
        for (i = 0; i < ts.length; i++) { try { ts[i].stop(); } catch (e2) {} }
      }
    } catch (e) {}
    try {
      if (s.video) {
        s.video.pause();
        s.video.srcObject = null;
        if (s.video.parentNode) s.video.parentNode.removeChild(s.video);
      }
    } catch (e) {}
    avisarProgresso();
    return { ok: true };
  };

  global.Tour360Cap = Cap;
  if (typeof module !== "undefined" && module.exports) module.exports = Cap;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
