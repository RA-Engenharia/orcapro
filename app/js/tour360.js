/* =====================================================================
 * tour360.js — TOUR VIRTUAL DA OBRA: o motor.
 *
 * ⚠ ESTE ARQUIVO É ESPELHADO EM `loja/tour360.js`, byte a byte. EDITE AQUI.
 *   O Portal do Cliente é uma página do VPS que não enxerga a pasta js/ do
 *   app, e o cliente MEDE dentro da foto lá — logo a mesma conta precisa
 *   rodar nos dois lados. Duas cópias divergindo significa o engenheiro
 *   medindo 3,10 m e o cliente 3,40 m no mesmo vão, que é pior que os dois
 *   errarem igual. Por isso a cópia é literal e conferida:
 *       node tools/espelhar-tour360.js       (gera a cópia)
 *       node tools/test-tour360-espelho.js   (reprova se divergirem)
 *   O app não pode simplesmente carregar do VPS: ele roda offline, na obra,
 *   que é o lugar com a pior internet do mundo.
 *
 * O que é: o engenheiro vai à obra, tira uma foto 360 em cada ponto fixo
 * (uma "estação"), e volta com um passeio navegável. Na visita seguinte
 * tira a foto DO MESMO PONTO — e aí nasce a única coisa que o cliente
 * remoto realmente quer: "o que mudou desde o mês passado, olhando do
 * mesmo lugar".
 *
 * ---------------------------------------------------------------------
 * POR QUE O COMPARATIVO EXIGE PONTO COM IDENTIDADE
 * ---------------------------------------------------------------------
 * Comparar duas fotos "parecidas" é a armadilha óbvia, e ela já custou caro
 * nesta casa noutro módulo: casar por semelhança (nome, data, aparência)
 * erra sozinho e ninguém percebe. Aqui a ligação é por CARIMBO: cada estação
 * tem um `pid` que ATRAVESSA os tours. O tour de setembro nasce de
 * `Tour360.basearEm(tourDeAgosto, "2026-09-15")`, que copia os pontos com os
 * MESMOS pids e sem as fotos. Sem isso, `parear` devolve dois conjuntos de
 * órfãos — e é isso mesmo que ele tem que devolver, em vez de inventar um
 * casamento plausível.
 *
 * ---------------------------------------------------------------------
 * A MEDIÇÃO, E POR QUE ELA TEM PORTA
 * ---------------------------------------------------------------------
 * Numa foto equiretangular NIVELADA, tirada a uma altura `h` conhecida, todo
 * ponto do CHÃO tem distância determinada só pelo ângulo de depressão:
 *
 *        d = h / tan(|pitch|)
 *
 * É exato — e é péssimo perto do horizonte: em pitch −1° meio grau de erro no
 * dedo do usuário move a medida em dezenas de metros. Por isso `medirChao`
 * RECUSA abaixo de `PITCH_MIN_MEDIDA` e, quando aceita, devolve
 * `erroEstimadoPct` medido por perturbação real (recalcula com ±MIRA_GRAUS e
 * olha quanto mexeu), no mesmo espírito de `ImgPlanta.calibrar`.
 *
 * ⚠ A recusa SEMPRE vem com saída: quem não sabe a altura da câmera calibra
 *   por uma distância conhecida (`alturaPorReferencia`); quem mirou perto do
 *   horizonte é mandado marcar onde o objeto ENCOSTA no chão. Trava sem porta
 *   faz o usuário inventar um número pior do que o que a trava evitou.
 *
 * Motor PURO: sem DOM, sem three.js, sem Store, sem fetch. Roda no gate em
 * Node (tools/test-tour360.js). Quem desenha é js/tour360view.js (esfera
 * WebGL) e quem faz a tela é js/tour360ui.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Tour360 = {};

  /* ---------- Constantes de domínio ---------- */

  /* ⚠ ESTE CARIMBO NAO TEM LEITOR, E NAO E ELE QUE PROTEGE A FROTA.
     MEDIDO em 08/09/2026, grep no repositorio inteiro: `VERSAO_DADOS` aparece
     QUATRO vezes - a definicao aqui, a escrita em `Tour360.novo` (`versao:`) e
     as duas copias em loja/tour360.js. NINGUEM pergunta por ele antes de
     desenhar um numero.

     E subi-lo nao teria impedido o defeito de 08/09/2026 (a area gravada em
     `p.medidas[]` que o motor da 1.2.56 relia como distancia e devolvia
     "0,00 m +-0%"): quem precisava recusar era o codigo JA INSTALADO nas 38
     maquinas, e ele nao le este campo - nem passara a ler.

     E ele nao descreve o FORMATO do conteudo: e escrito uma unica vez, em
     `Tour360.novo`, no nascimento da visita, e nunca mais atualizado. Uma
     visita criada na 1.2.55 que ganhe uma area hoje continua carimbada
     `versao: 1` carregando `p.areas[]`. Usa-lo como porteiro de formato
     recusaria conteudo que o app entende e aceitaria conteudo que ele nao
     entende - recado que mente e pior que recado nenhum.

     O que protege de verdade entre versoes esta logo abaixo, em
     `Tour360.medidasDoPonto`: o que a versao velha nao sabe ler mora onde ela
     nao olha. Enquanto ninguem escrever o PAR (carimbar em TODA gravacao +
     um leitor que recuse o desconhecido), este numero fica em 1 de proposito:
     mante-lo parado e honesto; subi-lo sozinho seria fingir protecao. */
  Tour360.VERSAO_DADOS = 1;

  /* Altura do olho de quem segura o celular. 1,60 m é o padrão do corpo
     humano segurando o aparelho na frente do rosto; quem usa tripé ou bastão
     ajusta no ponto. É o número que transforma ângulo em metro — se estiver
     errado, TODA medida daquele ponto erra na mesma proporção, e é por isso
     que a tela mostra a altura junto da medida em vez de escondê-la. */
  Tour360.ALTURA_CAM_PADRAO = 1.60;

  /* ⚠ Abaixo de 3° de depressão a conta explode: d = h/tan(θ) com h=1,60 dá
     30,5 m em 3°, 45,8 m em 2° e 91,7 m em 1°. Meio grau de erro no toque (um
     dedo cobre mais que isso numa tela de celular) vira 15 m de diferença. Não
     é conservadorismo: é o ponto onde a medida deixa de significar algo. */
  Tour360.PITCH_MIN_MEDIDA = 3;

  /* Precisão realista do toque, em graus, usada para estimar o erro por
     perturbação. Num panorama de 4096 px de largura, 1 px ≈ 0,088°; o dedo
     erra bem mais que 1 px, e o horizonte da foto raramente está perfeito. */
  Tour360.MIRA_GRAUS = 0.5;

  /* Acima disso a medida entra na tela com aviso, não com silêncio. Continua
     saindo: recusar aqui deixaria o usuário sem NENHUM número onde ele
     consegue, sim, tirar uma ordem de grandeza.

     ⚠ 10% não é número redondo escolhido no olho — é onde a conta vira. Com
     h=1,60 m, medindo entre dois pontos do chão a 90° de rumo, o erro MEDIDO
     (tools/test-tour360.js, bloco 4) é:
         45°→2,6% · 30°→2,9% · 20°→3,7% · 10°→6,3% · 8°→7,7% ·
          6°→10,1% ·  5°→12,1% ·  4°→15,3% · 3,5°→17,7% · 3,1°→20,3%
     O corte de 10% cai em 6,0° de depressão, ou ~15,2 m de distância — que é
     exatamente onde medir por panorama deixa de servir para conferir projeto.
     Estava em 15% e deixava passar calada uma medida de 25,86 m com ±2,9 m.
     ⚠ Os números SUBIRAM em relação à primeira versão desta tabela (45° era
     1,8%) porque a perturbação passou a mexer também nos dois RUMOS, e não só
     nos dois pitches: o dedo erra nos dois eixos, e numa medida entre pontos
     quase alinhados é o rumo que domina. O ± antigo era otimista. */
  Tour360.ERRO_AVISO_PCT = 10;

  Tour360.MAX_PONTOS = 40;          // um tour maior que isso ninguém navega
  Tour360.MAX_HOTSPOTS = 30;        // por ponto
  Tour360.MAX_MEDIDAS = 40;         // por ponto

  /* ⚠ O TETO DA NUVEM É POR LISTA, NÃO POR REGISTRO — e é aqui que este
     módulo tem chance real de repetir o defeito que já parou a sincronização
     de um cliente (ver o cabeçalho de js/fotos.js). O Firestore guarda a
     entidade INTEIRA num documento de 1 MiB, e o js/nuvem.js avisa a 900 KB.
     Medido (tools/test-tour360.js, bloco 12), com a foto entrando como
     REFERÊNCIA de ~120 bytes:
         8 pontos ×  3 comentários →  12 KB por tour → ~74 tours até o aviso
        15 pontos ×  6 comentários →  31 KB por tour → ~28 tours até o aviso
        40 pontos × 60 comentários → 522 KB por tour → 1 tour e a lista morre
     Uma obra de dois anos com visita quinzenal são 48 tours. Ou seja: isto
     estoura no uso normal, não no extremo. Por isso `peso()` existe e a tela
     avisa CEDO, com porta — em vez de o cliente descobrir pelo silêncio. */
  Tour360.PESO_AVISO = 400 * 1024;
  Tour360.PESO_PERIGO = 700 * 1024;

  /* Uma foto equiretangular tem 2:1. Aceito 3% de folga porque celular corta
     a costura em 5952x2976 (=2,0) mas também em 4096x2048 e 5760x2880. Fora
     disso é foto comum — que continua servindo para o registro, só não gira. */
  Tour360.TOL_PROPORCAO = 0.03;

  Tour360.TIPOS_HOTSPOT = ["comentario", "atencao", "pendencia", "aprovado"];
  Tour360.ESTADOS = ["rascunho", "publicado"];

  /* ---------- utilitários locais (não exportados) ---------- */

  var RAD = Math.PI / 180;
  var GRAU = 180 / Math.PI;

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r3(n) { return Math.round(n * 1000) / 1000; }
  function r1(n) { return Math.round(n * 10) / 10; }

  /* ⚠ NÚMERO QUE VAI PARA GENTE LER SAI EM pt-BR, COM VÍRGULA.
     `r1`/`r2`/`r3` devolvem NÚMERO, e número concatenado com texto vira string
     com PONTO: o recado dizia "com a câmera a 1.6 m" enquanto o painel, na
     mesma tela, escrevia "Altura da câmera 1,60 m". Visto na foto da tela em
     08/09/2026. Numa tela de medida isso passa por desleixo; num documento que
     fiscal e perito leem como prova, passa por erro.
     ⚠ ESTE MOTOR É PURO e roda em Node no gate, sem `Util` — por isso a troca
     é feita aqui, com uma linha, em vez de chamar o formatador da casa.
     E só vale para TEXTO: os campos numéricos que a tela e o Portal consomem
     (`metros`, `erroEstimadoPct`) continuam saindo como NÚMERO, porque quem
     desenha é quem formata. */
  function br(n) { return String(n).replace(".", ","); }

  /* ⚠ Data LOCAL, nunca toISOString().slice(0,10): das 21h à meia-noite em
     Brasília o ISO já está em amanhã, e a visita de hoje nasceria datada de
     amanhã no documento que o cliente lê. Mesmo padrão do resto da casa. */
  function hojeLocal(agora) {
    var d = agora || new Date();
    var m = d.getMonth() + 1, dia = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dia < 10 ? "0" : "") + dia;
  }
  Tour360.hojeLocal = hojeLocal;

  function uid(pref) {
    return pref + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
  }

  /* =====================================================================
   * 1. GEOMETRIA EQUIRETANGULAR
   *
   * Convenção, fixada aqui e obedecida pelo viewer e pelo portal:
   *   yaw   −180..180, cresce para a DIREITA, 0 = frente da foto (centro
   *         horizontal da imagem);
   *   pitch −90..90, POSITIVO para cima (0 = linha do horizonte, no centro
   *         vertical da imagem).
   * A imagem tem o pixel (0,0) no canto superior esquerdo — daí o pitch
   * inverter o sinal de y.
   * ================================================================== */

  Tour360.normalizarYaw = function (g) {
    var y = num(g, 0) % 360;
    if (y > 180) y -= 360;
    if (y <= -180) y += 360;
    /* −180 e 180 são o mesmo lugar; fixo em 180 para o valor não oscilar de
       sinal entre dois cliques idênticos e a diferença não dar 360. */
    return y === -180 ? 180 : y;
  };

  /* Menor diferença angular de a até b, com sinal (−180..180]. Sem isto,
     dois pontos a 350° e 10° ficariam a "340° de distância" e a lei dos
     cossenos devolveria o triângulo errado — cos(340°) e cos(20°) são iguais
     por sorte, mas a interpolação do vídeo daria a volta pelo lado longo. */
  Tour360.difYaw = function (a, b) {
    var d = (num(b, 0) - num(a, 0)) % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  };

  Tour360.pixelParaAngulo = function (px, py, w, h) {
    var W = num(w, 0), H = num(h, 0);
    if (W <= 0 || H <= 0) return { ok: false, motivo: "Imagem sem dimensão." };
    return {
      ok: true,
      yaw: Tour360.normalizarYaw((num(px, 0) / W) * 360 - 180),
      pitch: Math.max(-90, Math.min(90, 90 - (num(py, 0) / H) * 180))
    };
  };

  Tour360.anguloParaPixel = function (yaw, pitch, w, h) {
    var W = num(w, 0), H = num(h, 0);
    if (W <= 0 || H <= 0) return { ok: false, motivo: "Imagem sem dimensão." };
    var y = Tour360.normalizarYaw(yaw);
    var p = Math.max(-90, Math.min(90, num(pitch, 0)));
    return {
      ok: true,
      x: ((y + 180) / 360) * W,
      y: ((90 - p) / 180) * H
    };
  };

  /* Vetor unitário na convenção da CENA (Y para cima, câmera olhando para −Z,
     +X à direita da tela).

     ⚠ O SINAL DE X SEGUE A IMAGEM, e isto foi MEDIDO, não escolhido. `yaw`
     cresce para a direita do panorama (é o que `anguloParaPixel` faz: yaw
     maior → pixel maior → mais à direita). Como +X é o lado direito da tela,
     yaw +90° tem de dar +X. Escrito com `-sin`, o viewer 3D girava para o
     lado contrário do que a foto mostra: o clique voltava com o sinal
     trocado, e o comentário fixado numa parede no app aparecia na parede
     oposta no Portal do cliente — que desenha a foto plana pela conta deste
     mesmo motor. Cada lado era coerente consigo; só não entre si.
     Provado em tools/e2e-tour360.js com uma foto de faixas de cor
     conhecidas. */
  Tour360.direcao = function (yaw, pitch) {
    var a = Tour360.normalizarYaw(yaw) * RAD;
    var b = Math.max(-90, Math.min(90, num(pitch, 0))) * RAD;
    var cb = Math.cos(b);
    return { x: Math.sin(a) * cb, y: Math.sin(b), z: -Math.cos(a) * cb };
  };

  Tour360.ehEquiretangular = function (w, h, tol) {
    var W = num(w, 0), H = num(h, 0);
    if (W <= 0 || H <= 0) return false;
    var t = tol === undefined ? Tour360.TOL_PROPORCAO : num(tol, Tour360.TOL_PROPORCAO);
    return Math.abs(W / H - 2) <= 2 * t;
  };

  /* A foto sai torta: quem gira o celular não fica no eixo.

     `horizonte` é a correção de nivelamento, em graus, e o sinal segue a
     SUBTRAÇÃO que está logo abaixo: positivo = a linha do horizonte aparece
     ACIMA do centro da foto, e a correção então DESCE todos os ângulos na
     mesma medida. (O comentário anterior dizia o contrário — "abaixo do
     centro, tudo sobe" — e comentário invertido num arquivo de geometria é
     pior que comentário nenhum: quem for calibrar uma foto torta digita o
     sinal errado com confiança, e a medida sai plausível.)

     `nortear` gira a origem do yaw para o mesmo rumo em todas as visitas — é
     o que faz a cortina do comparativo abrir na mesma parede em agosto e em
     setembro. */
  Tour360.corrigir = function (ang, ponto) {
    var p = ponto || {};
    return {
      yaw: Tour360.normalizarYaw(num(ang && ang.yaw, 0) - num(p.nortear, 0)),
      pitch: Math.max(-90, Math.min(90, num(ang && ang.pitch, 0) - num(p.horizonte, 0)))
    };
  };

  /* =====================================================================
   * 2. MEDIÇÃO
   * ================================================================== */

  /* Distância horizontal da câmera até um ponto do CHÃO. Núcleo de tudo. */
  Tour360.distanciaNoChao = function (pitchGraus, alturaCam) {
    var h = num(alturaCam, 0);
    var p = num(pitchGraus, 0);
    if (h <= 0) {
      return { ok: false, motivo: "Informe a altura da câmera neste ponto (ou calibre por uma distância conhecida).", codigo: "sem-altura" };
    }
    if (p >= 0) {
      /* Acima do horizonte não existe chão: a visada nunca encontra o plano.
         A porta: marcar o ponto onde o objeto ENCOSTA no piso. */
      return { ok: false, motivo: "Este ponto está acima da linha do horizonte — marque onde o objeto encosta no chão.", codigo: "acima-horizonte" };
    }
    if (Math.abs(p) < Tour360.PITCH_MIN_MEDIDA) {
      return {
        ok: false,
        codigo: "perto-horizonte",
        motivo: "Ponto perto demais da linha do horizonte (" + br(r1(Math.abs(p))) + "°): a distância fica indefinida. Marque um ponto mais próximo dos seus pés ou meça a partir de uma estação mais perto."
      };
    }
    return { ok: true, metros: h / Math.tan(Math.abs(p) * RAD) };
  };

  /* Erro por PERTURBAÇÃO: recalculo com o ângulo mexido de ±MIRA_GRAUS e
     vejo quanto o resultado andou. Vale mais que fórmula fechada porque
     atravessa qualquer conta (inclusive a lei dos cossenos abaixo) sem eu
     precisar derivar nada à mão — e derivar à mão foi onde eu erraria. */
  function erroPct(valor, calcular, angulos) {
    if (!(valor > 0)) return 0;
    var d = Tour360.MIRA_GRAUS, pior = 0, i, j, comb;
    /* ⚠ TODOS OS CANTOS, NÃO SÓ QUATRO. A versão anterior tratava no máximo
       dois ângulos e, na medida entre dois pontos do chão, perturbava só os
       dois PITCHES — o yaw dos dois cliques ficava fixo. Só que o dedo erra
       nos dois eixos, e é o yaw que abre o ângulo do triângulo: numa medida
       de dois pontos quase alinhados, o erro real vinha justamente de lá. O ±
       saía menor do que é, e é ele que decide se o app diz "confira o
       nivelamento" ou "não use em documento".
       2^n cantos: com 4 ângulos são 16 avaliações de uma conta trigonométrica
       — barato, e sem depender de a função ser monótona. */
    var sinais = [[]];
    for (j = 0; j < angulos.length; j++) {
      var nova = [];
      for (i = 0; i < sinais.length; i++) {
        nova.push(sinais[i].concat([1]));
        nova.push(sinais[i].concat([-1]));
      }
      sinais = nova;
    }
    for (i = 0; i < sinais.length; i++) {
      comb = [];
      for (j = 0; j < angulos.length; j++) comb.push(angulos[j] + sinais[i][j] * d);
      var v = calcular(comb);
      if (v == null || !isFinite(v) || v <= 0) continue;
      var e = Math.abs(v - valor) / valor;
      if (e > pior) pior = e;
    }
    return Math.round(pior * 1000) / 10;
  }

  function notaErro(pct) {
    if (pct > Tour360.ERRO_AVISO_PCT) {
      return "Medida aproximada (±" + br(r1(pct)) + "%): os pontos estão perto do horizonte ou a foto pode não estar nivelada. Serve para ordem de grandeza, não para conferir dimensão de projeto.";
    }
    return "Estimativa a partir da altura da câmera (±" + br(r1(pct)) + "%). Confira o nivelamento da foto antes de usar em documento.";
  }

  /* Distância entre dois pontos do CHÃO. Lei dos cossenos entre as duas
     distâncias e o ângulo horizontal que as separa. */
  Tour360.medirChao = function (a, b, alturaCam) {
    var h = num(alturaCam, 0);
    var pa = num(a && a.pitch, 0), pb = num(b && b.pitch, 0);
    var ya = num(a && a.yaw, 0), yb = num(b && b.yaw, 0);

    var da = Tour360.distanciaNoChao(pa, h);
    if (!da.ok) return da;
    var db = Tour360.distanciaNoChao(pb, h);
    if (!db.ok) return db;

    var dyaw = Tour360.difYaw(ya, yb);

    /* ⚠ o dyaw entra pelos ARGUMENTOS, não pelo fecho: é isso que deixa a
       perturbação mexer também nos dois rumos, e o rumo é quem abre o ângulo
       do triângulo. Com ele preso, o ± ignorava o erro de mira lateral. */
    function calc(ps) {
      var A = h / Math.tan(Math.abs(ps[0]) * RAD);
      var B = h / Math.tan(Math.abs(ps[1]) * RAD);
      var dy = Tour360.difYaw(ps[2], ps[3]);
      var v = A * A + B * B - 2 * A * B * Math.cos(dy * RAD);
      return v > 0 ? Math.sqrt(v) : 0;
    }
    var m = calc([pa, pb, ya, yb]);
    var pct = erroPct(m, calc, [pa, pb, ya, yb]);

    return {
      ok: true,
      metros: r3(m),
      distanciaA: r2(da.metros),
      distanciaB: r2(db.metros),
      anguloEntre: r1(Math.abs(dyaw)),
      alturaCam: h,
      erroEstimadoPct: pct,
      aproximada: pct > Tour360.ERRO_AVISO_PCT,
      nota: notaErro(pct)
    };
  };

  /* Altura de algo apoiado no chão: a base dá a distância, e a distância
     transforma o ângulo do topo em metros. Vale para pé-direito, altura de
     alvenaria levantada, vão de esquadria. */
  Tour360.medirAltura = function (base, topo, alturaCam) {
    var h = num(alturaCam, 0);
    var pb = num(base && base.pitch, 0);
    var pt = num(topo && topo.pitch, 0);

    var d = Tour360.distanciaNoChao(pb, h);
    if (!d.ok) {
      /* mesma recusa, outra porta: aqui o ponto de baixo é que precisa estar
         no chão, e dizer isso é o que evita o usuário marcar o meio da parede */
      if (d.codigo === "acima-horizonte") {
        return { ok: false, codigo: d.codigo, motivo: "O primeiro ponto tem que ser onde a peça ENCOSTA no chão — ele é quem dá a distância." };
      }
      return d;
    }
    if (pt < pb) {
      return { ok: false, codigo: "topo-abaixo", motivo: "O segundo ponto está mais baixo que o primeiro. Marque primeiro a base (no chão) e depois o topo." };
    }

    function calc(ps) {
      var D = h / Math.tan(Math.abs(ps[0]) * RAD);
      return h + D * Math.tan(ps[1] * RAD);
    }
    var m = calc([pb, pt]);
    var pct = erroPct(m, calc, [pb, pt]);

    return {
      ok: true,
      metros: r3(m),
      distancia: r2(d.metros),
      alturaCam: h,
      erroEstimadoPct: pct,
      aproximada: pct > Tour360.ERRO_AVISO_PCT,
      nota: notaErro(pct)
    };
  };

  /* ÁREA E PERÍMETRO DE UM PEDAÇO DE CHÃO. A pergunta que a obra faz é
     "quanto de contrapiso tem essa sala", e ela vira linha de orçamento e de
     boletim. Medindo dois pontos por vez a pessoa soma de cabeça — e é aí que
     nasce o número errado.

     Cada vértice é um clique no piso: o pitch dá a distância (d = h/tan|θ|) e
     o yaw dá o rumo, então o ponto vira coordenada no plano do chão. A área
     sai pela fórmula do agrimensor (shoelace) e o perímetro pela soma dos
     lados.

     ⚠ ÁREA ELEVA O ERRO AO QUADRADO, e é isso que separa este número de uma
     medida de fita. Um lado com ±10% vira uma área com cerca de ±21%: o
     `erroEstimadoPct` daqui é medido na ÁREA, por perturbação de todos os
     ângulos, e não copiado do erro linear. Quem lança quantidade contratual a
     partir daqui precisa ver esse número do lado do metro quadrado. */
  Tour360.medirArea = function (cliques, alturaCam) {
    var h = num(alturaCam, 0);
    var pts = cliques || [];
    if (pts.length < 3) {
      return { ok: false, codigo: "poucos-pontos", motivo: "Marque pelo menos três cantos do piso para fechar uma área." };
    }
    if (pts.length > 24) {
      return { ok: false, codigo: "muitos-pontos", motivo: "Área com mais de 24 cantos — meça por partes, fica mais confiável e mais fácil de conferir." };
    }

    var i, d;
    /* toda recusa de vértice é a recusa do motor, com a porta dela: o usuário
       precisa saber QUAL canto está no horizonte, não que "a área falhou" */
    for (i = 0; i < pts.length; i++) {
      d = Tour360.distanciaNoChao(num(pts[i] && pts[i].pitch, 0), h);
      if (!d.ok) return { ok: false, codigo: d.codigo, vertice: i + 1, motivo: "Canto " + (i + 1) + ": " + d.motivo };
    }

    function calc(ang) {
      /* ang = [pitch1..pitchN, yaw1..yawN] — a perturbação mexe nos dois eixos */
      var n = pts.length, xs = [], ys = [], k;
      for (k = 0; k < n; k++) {
        var dk = h / Math.tan(Math.abs(ang[k]) * RAD);
        var yk = ang[n + k] * RAD;
        xs.push(dk * Math.sin(yk));
        ys.push(dk * Math.cos(yk));
      }
      var s = 0;
      for (k = 0; k < n; k++) {
        var j = (k + 1) % n;
        s += xs[k] * ys[j] - xs[j] * ys[k];
      }
      return Math.abs(s) / 2;
    }

    var angulos = [], yaws = [];
    for (i = 0; i < pts.length; i++) angulos.push(num(pts[i].pitch, 0));
    for (i = 0; i < pts.length; i++) yaws.push(num(pts[i].yaw, 0));
    var todos = angulos.concat(yaws);

    var area = calc(todos);
    if (!(area > 0)) {
      return { ok: false, codigo: "area-nula", motivo: "Os cantos marcados não fecham uma área — eles estão em linha reta." };
    }

    /* perímetro e lados, com a mesma conta de `medirChao` para cada aresta */
    var lados = [], perim = 0;
    for (i = 0; i < pts.length; i++) {
      var b = pts[(i + 1) % pts.length];
      var m = Tour360.medirChao(pts[i], b, h);
      if (!m.ok) return m;
      lados.push(m.metros);
      perim += m.metros;
    }

    /* ⚠ 2^n cantos ficaria proibitivo com 24 vértices (16 milhões). Aqui a
       perturbação é por DIREÇÃO: todos para fora e todos para dentro, que é o
       pior caso real de uma área (o polígono inteiro incha ou encolhe). */
    var d0 = Tour360.MIRA_GRAUS, pior = 0;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
      var pert = [], k;
      for (k = 0; k < pts.length; k++) pert.push(angulos[k] + s[0] * d0);
      for (k = 0; k < pts.length; k++) pert.push(yaws[k] + s[1] * d0);
      var v = calc(pert);
      if (v > 0 && isFinite(v)) {
        var e = Math.abs(v - area) / area;
        if (e > pior) pior = e;
      }
    });
    var pct = Math.round(pior * 1000) / 10;

    return {
      ok: true,
      area: r2(area),
      perimetro: r2(perim),
      lados: lados,
      cantos: pts.length,
      alturaCam: h,
      erroEstimadoPct: pct,
      aproximada: pct > Tour360.ERRO_AVISO_PCT,
      nota: pct > Tour360.ERRO_AVISO_PCT
        ? "Área aproximada (±" + br(r1(pct)) + "%). Área acumula o erro dos dois eixos, então ela é sempre menos confiável que uma distância — serve para ordem de grandeza e para conferir quantidade, não para fechar contrato."
        : "Estimativa a partir da altura da câmera (±" + br(r1(pct)) + "%). Área acumula mais erro que distância: confira um lado com trena antes de usar em medição."
    };
  };

  /* CALIBRAÇÃO: o usuário não sabe a que altura estava o celular, mas sabe
     que aquele vão tem 3,00 m. Como toda distância é proporcional a `h`, a
     razão entre a medida real e a medida com h=1 devolve o h verdadeiro —
     analítico, sem iteração. É a porta da recusa "sem-altura". */
  Tour360.alturaPorReferencia = function (a, b, metrosReais) {
    var alvo = num(metrosReais, 0);
    if (alvo <= 0) return { ok: false, motivo: "Informe a distância real, em metros." };

    var pa = num(a && a.pitch, 0), pb = num(b && b.pitch, 0);
    if (pa >= 0 || pb >= 0) {
      return { ok: false, codigo: "acima-horizonte", motivo: "Os dois pontos da referência têm que estar no chão, abaixo da linha do horizonte." };
    }
    if (Math.abs(pa) < Tour360.PITCH_MIN_MEDIDA || Math.abs(pb) < Tour360.PITCH_MIN_MEDIDA) {
      return { ok: false, codigo: "perto-horizonte", motivo: "Use uma referência mais perto de você: pontos rentes ao horizonte não calibram nada." };
    }

    var unit = Tour360.medirChao(a, b, 1);       // a mesma conta com h = 1 m
    if (!unit.ok) return unit;
    if (!(unit.metros > 0)) return { ok: false, motivo: "Os dois pontos estão no mesmo lugar." };

    var h = alvo / unit.metros;
    return {
      ok: true,
      alturaCam: r3(h),
      erroEstimadoPct: unit.erroEstimadoPct,
      nota: "Altura da câmera calculada a partir de " + br(r2(alvo)) + " m conhecidos (±" + br(r1(unit.erroEstimadoPct)) + "%). Vale só para as fotos tiradas nesta mesma altura."
    };
  };

  /* =====================================================================
   * A GUARDA DO CINZA — onde a foto acaba, a medida acaba
   *
   * DEPOIS DO ENCAIXE a geometria está certa: `yaw = px/W*360-180` é verdade.
   * Mas fora da faixa fotografada não existe obra nenhuma, e
   * `distanciaNoChao` devolve um número perfeitamente calculado sobre NADA.
   * Sem esta guarda o encaixe trocaria uma mentira (esticar a faixa sobre a
   * esfera) por outra (medir no vazio) — e a segunda é pior, porque vem com
   * o ± pequeno e com cara de conferida.
   *
   * ⚠ RECEBE O ÂNGULO BRUTO, ANTES DE `Tour360.corrigir`. A faixa é um
   *   retângulo no espaço da IMAGEM, e `corrigir` já subtraiu `nortear` e
   *   `horizonte`. Passar o corrigido por engano faz a guarda recusar clique
   *   válido (e liberar inválido) exatamente nas estações com `nortear ≠ 0`,
   *   que são as do comparativo entre visitas — o erro mais fácil de cometer
   *   e o mais difícil de ver. Tem assert próprio, com `nortear: 90`.
   *
   * ⚠ AUSÊNCIA SÓ PERMITE. Ponto sem os campos de cobertura é toda a base já
   *   gravada nas 38 instalações; recusar por ausência trancaria a medição de
   *   todo mundo numa atualização. Pelo mesmo motivo, foto comum ANTIGA
   *   continua como está: só recusa a que este código carimbou, porque dessa
   *   a gente sabe.
   *
   * Devolve `null` quando pode medir, ou a recusa com código, motivo e SAÍDA.
   * ================================================================== */
  Tour360.podeMedirAqui = function (ang, ponto) {
    var p = ponto || {};
    var cH = num(p.panoCobH, 0), cV = num(p.panoCobV, 0);
    var fonte = txt(p.panoFonte);
    if (!(cH > 0) && !(cV > 0) && !fonte) return null;      /* não sei: permite */

    var alt = num(p.alturaCam, 0) || Tour360.ALTURA_CAM_PADRAO;

    /* ⚠ ABERTURA INFORMADA NÃO MEDE. Ela empilha três coisas que ninguém
       consegue conferir depois: um giro que a pessoa chutou, uma projeção
       que o app supôs cilíndrica e um nivelamento que ele supôs. Girar,
       navegar e apontar continuam — só o metro sai. */
    if (fonte === "declarada") {
      return {
        ok: false, codigo: "cobertura-declarada",
        motivo: "Nesta estação a abertura do panorama (" + br(r1(cH)) + "°) foi informada por você, não lida do arquivo — este aparelho não gravou a etiqueta de 360 nesta foto. Por isso ela gira, entra no comparativo e no relatório e aceita apontamento; o que ela não faz é medir, porque o número dependeria de um giro que ninguém consegue conferir depois.",
        saida: "Refaça a foto em Foto esférica (Photo Sphere / 360) — esse modo grava a geometria dentro do arquivo e libera a medição — ou meça esta parede a partir de uma estação que já tenha foto esférica."
      };
    }
    if (fonte === "plana") {
      return {
        ok: false, codigo: "sem-cobertura",
        motivo: "Esta estação é uma foto comum: ela registra o ponto, mas não tem a informação de quantos graus cobre, então não dá para transformar um clique em metros.",
        saida: "Para medir, a estação precisa de uma foto em Foto esférica (Photo Sphere / 360), pelo botão Usar foto do celular."
      };
    }

    var cp = num(p.panoCentroPitch, 0);
    var y = Tour360.normalizarYaw(num(ang && ang.yaw, 0));
    var pi = num(ang && ang.pitch, 0);
    var foraH = (cH > 0 && cH < 360) && Math.abs(Tour360.difYaw(0, y)) > cH / 2;
    var foraV = (cV > 0 && cV < 180) && (pi > cp + cV / 2 || pi < cp - cV / 2);
    if (!foraH && !foraV) return null;

    /* ⚠ O RAIO CEGO SAI DA ALTURA DESTA ESTAÇÃO, nunca de 1,60 fixo: com a
       câmera a 1,20 m o chão começa a 2,86 m e a 1,75 m começa a 4,17 m. Um
       número fixo aqui faria o recado mentir para quem usa bastão. */
    var borda = cp - cV / 2;                       /* pitch da borda de baixo */
    var raioTxt;
    if (cV <= 0 || cV >= 180) raioTxt = "";
    else if (borda >= -0.5) raioTxt = " Nesta estação a foto não alcança o chão em ponto nenhum: a borda de baixo está na linha do horizonte.";
    else raioTxt = " Nesta estação, com a câmera a " + br(r2(alt)) + " m, o chão só aparece a partir de " + br(r2(alt / Math.tan(Math.abs(borda) * RAD))) + " m dos seus pés.";

    return {
      ok: false, codigo: "fora-da-foto",
      motivo: "Este ponto está fora do que a foto mostra. Este panorama cobre " + br(r1(cH)) + "° na horizontal e " + br(r1(cV)) + "° na vertical — o cinza em volta não foi fotografado, e medir ali devolveria um número calculado sobre nada." + raioTxt,
      saida: "Marque um ponto dentro da parte colorida. Para medir mais perto, refaça a estação em Foto esférica (Photo Sphere / 360), que fecha a esfera inteira e traz o chão até os seus pés."
    };
  };

  /* Executa uma medida já GRAVADA (o registro guarda os cliques, não o
     resultado — assim uma altura de câmera corrigida depois conserta o
     histórico todo em vez de deixar número velho mentindo na tela). */
  Tour360.recalcular = function (medida, ponto) {
    var m = medida || {};
    /* ⚠ A ALTURA DA ESTAÇÃO MANDA, e a gravada na medida é só socorro.
       A altura é propriedade da FOTO, não da medida: se a pessoa mediu com
       1,60 e depois percebe que o bastão estava em 1,75, TODAS as medidas
       daquele ponto estavam erradas na mesma proporção e têm de ser refeitas.
       Com a precedência invertida, corrigir a altura não mexia em nada do que
       já estava gravado — e dois comentários deste arquivo prometiam o
       contrário. `m.alturaCam` fica para a medida órfã, cujo ponto sumiu. */
    var h = num(ponto && ponto.alturaCam, 0) || num(m.alturaCam, 0) || Tour360.ALTURA_CAM_PADRAO;
    /* ⚠ A ÁREA GUARDA OS CANTOS, e não o m² — mesma regra das outras: o
       registro guarda os CLIQUES, e o número é recalculado. Corrigir a altura
       da estação conserta o histórico inteiro em vez de deixar número velho
       mentindo na tela. Enquanto `recalcular` não conhecia o tipo "area", uma
       medida de área gravada era relida como distância entre dois pontos que
       não existiam, e a lista mostrava a recusa no lugar do metro quadrado —
       por isso a área só podia virar comentário. */
    /* ⚠ É AQUI QUE A MEDIDA JÁ GRAVADA PARA DE MENTIR. `recalcular` é quem a
       tela e o `paraPortal` chamam para exibir; sem a guarda neste ponto, uma
       estação reclassificada continuaria mostrando o número velho ao cliente,
       calculado com uma geometria que o app já sabe estar errada. Recusando
       aqui, `paraPortal` publica `metros: null` e o Portal simplesmente não
       desenha aquele marcador (loja/portal.html: `if(md.metros==null) continue`)
       — sumir é melhor que um número falso num documento de fiscalização.
       ⚠ E os cliques vão BRUTOS, antes de `corrigir` — ver o ⚠ de
       `podeMedirAqui`. */
    var barra = null, iG, csG;
    if (typeof Tour360.podeMedirAqui === "function") {
      csG = (m.tipo === "area") ? (m.cantos || []) : [m.a, m.b];
      for (iG = 0; iG < csG.length; iG++) {
        if (!csG[iG]) continue;
        barra = Tour360.podeMedirAqui(csG[iG], ponto);
        if (barra) return barra;
      }
    }
    if (m.tipo === "area") {
      var cantos = [], i, cs = m.cantos || [];
      for (i = 0; i < cs.length; i++) cantos.push(Tour360.corrigir(cs[i], ponto));
      return Tour360.medirArea(cantos, h);
    }
    var a = Tour360.corrigir(m.a, ponto), b = Tour360.corrigir(m.b, ponto);
    if (m.tipo === "altura") return Tour360.medirAltura(a, b, h);
    return Tour360.medirChao(a, b, h);
  };

  /* =====================================================================
   * 3. O REGISTRO
   * ================================================================== */

  Tour360.novo = function (obraId, data, opts) {
    var o = opts || {};
    return {
      obraId: txt(obraId),
      obraNome: txt(o.obraNome),
      titulo: txt(o.titulo) || "Visita " + (txt(data) || hojeLocal()),
      data: txt(data) || hojeLocal(),
      estado: "rascunho",
      versao: Tour360.VERSAO_DADOS,
      autorId: txt(o.autorId),
      autor: txt(o.autor),
      baseadoEm: txt(o.baseadoEm),
      comparaCom: txt(o.comparaCom),
      /* a planta baixa do minimapa: uma por visita, referência de foto como
         qualquer imagem desta casa. Fica no TOUR e não na obra porque o
         pavimento fotografado muda de uma visita para outra — e a estação
         posicionada numa planta antiga apontaria para a sala errada. */
      planta: o.planta || null,
      /* quanto o "para cima" da planta esta girado em relacao ao rumo em
         que as fotos foram tiradas. 0 = planta desenhada no mesmo rumo, que
         e o caso de quem posiciona os pinos olhando o desenho. So e usado
         para a seta cujo rumo SAI da planta (ver setasDe). */
      plantaNorte: num(o.plantaNorte, 0),
      pontos: [],
      historico: []
    };
  };

  /* ⚠ QUANTOS GRAUS A FOTO DESTA ESTAÇÃO COBRE — e por que o padrão é ZERO.
     `panoCobH`/`panoCobV` em graus, `panoCentroPitch` a inclinação do centro
     da faixa, `panoFonte` de onde o número veio ("gpano" = lido do arquivo,
     "declarada" = informado por quem tirou, "costura" = montado aqui dentro,
     "nativa"/"plana" = os casos de sempre).

     ZERO SIGNIFICA "NÃO SEI", E NÃO SEI SÓ PERMITE. Toda estação já gravada
     nas 38 instalações chega aqui sem estes campos; devolver recusa por
     ausência trancaria a medição de todo mundo de uma vez. O erro simétrico
     — um `panoCobH || 360` copiado do padrão de `tipo` — seria pior ainda:
     faria uma faixa sem cobertura lida ser tratada como esfera inteira, que
     é exatamente o defeito que este trabalho existe para fechar. */
  Tour360.novoPonto = function (nome, opts) {
    var o = opts || {};
    return {
      pid: txt(o.pid) || uid("p"),
      nome: txt(nome) || "Ponto",
      nivel: txt(o.nivel),
      foto: null,
      tipo: txt(o.tipo) || "equirect",
      alturaCam: num(o.alturaCam, Tour360.ALTURA_CAM_PADRAO),
      nortear: num(o.nortear, 0),
      horizonte: num(o.horizonte, 0),
      ancora: o.ancora || null,
      planta: o.planta || null,
      vizinhos: [],
      hotspots: [],
      medidas: [],
      /* ⚠ A AREA MORA NUMA LISTA PROPRIA - ver `Tour360.medidasDoPonto`. */
      areas: [],
      capturadoEm: txt(o.capturadoEm),
      /* "exif" = data informada pelo aparelho; "anexo" = quando o arquivo
         chegou aqui; vazio = ponto antigo, nao se sabe. A procedencia viaja
         junto com a data porque uma prova sem origem nao e prova. */
      capturadoFonte: txt(o.capturadoFonte),
      /* a geometria da foto desta estação — ver o ⚠ acima do `novoPonto` */
      panoFonte: txt(o.panoFonte),
      panoCobH: num(o.panoCobH, 0),
      panoCobV: num(o.panoCobV, 0),
      panoCentroPitch: num(o.panoCentroPitch, 0)
    };
  };

  Tour360.pontoDe = function (tour, pid) {
    var ps = (tour && tour.pontos) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].pid === pid) return ps[i];
    return null;
  };

  /* =====================================================================
   * ⚠ DUAS LISTAS NO REGISTRO, UMA SO NA TELA - E O PORQUE E A FROTA
   *
   * O REGISTRO DA VISITA SINCRONIZA PELA NUVEM (js/nuvem.js, entidade
   * "tour360"), e a nuvem nao pergunta a versao de ninguem: o que a 1.2.57
   * grava desce, no mesmo dia, no aparelho que ainda roda 1.2.56.
   *
   * O ROTEIRO DO DEFEITO (medido em 08/09/2026). A area passou a ser gravada
   * em `p.medidas[]` como `{tipo:"area", cantos:[...]}` - SEM `a` e SEM `b`.
   * O `Tour360.recalcular` da 1.2.56, que esta instalado em 38 maquinas, nao
   * conhece `tipo:"area"`:
   *
   *     var a = Tour360.corrigir(m.a, ponto), b = Tour360.corrigir(m.b, ponto);
   *     if (m.tipo === "altura") return Tour360.medirAltura(a, b, h);
   *     return Tour360.medirChao(a, b, h);       // <- a area caia aqui
   *
   * `corrigir(undefined, ponto)` devolve `{yaw: -nortear, pitch: -horizonte}`
   * para as DUAS pontas - o mesmo ponto duas vezes. Com a foto inclinada
   * (`horizonte >= PITCH_MIN_MEDIDA`, que e o caso comum), `medirChao` nao
   * recusa: ele mede a distancia de um ponto ate ele mesmo e devolve
   * `{ok:true, metros:0, erroEstimadoPct:0}`. MEDIDO: 21 de 36 combinacoes de
   * (horizonte, alturaCam) devolvem numero. E "0,00 m +-0%" e um numero com
   * cara de conferido: o `paraPortal` da 1.2.56 publica esse zero, e ele
   * aparece na tela do contratante como se fosse medida de verdade.
   *
   * NAO HA COMO FAZER O CODIGO JA INSTALADO RECUSAR DE DENTRO DE `medidas`.
   * MEDIDO tambem: gravar `a`/`b` fora do chao (`pitch: 90`) faz a 1.2.56
   * recusar em 193 de 201 valores de `horizonte` - mas ela volta a medir a
   * partir de `horizonte >= 93`, e o campo de horizonte da tela e texto livre,
   * sem teto. Alem disso a area continuaria aparecendo la como uma LINHA de
   * medida recusada e continuaria ocupando vaga no teto de MAX_MEDIDAS.
   *
   * POR ISSO A AREA MUDOU DE ENDERECO. Ela mora em `p.areas[]`, uma lista que
   * a 1.2.56 nunca abre: la ela nao vira "0,00 m", nao viaja no retrato que
   * aquele aparelho publica, e nao conta no teto dele. O cliente que ainda
   * nao atualizou simplesmente NAO VE a area - que e melhor que ver um numero
   * que mente. Quem ja esta na 1.2.57 ve tudo, porque tudo passa por aqui.
   *
   * ⚠ ESTA FUNCAO E O UNICO LUGAR QUE JUNTA AS DUAS. Todo consumidor (lista da
   *   tela, contagem da estacao, teto, relatorio, `paraPortal`, `resumo`) le
   *   daqui - ler `p.medidas` direto e como o defeito volta, so que ao
   *   contrario: a area sumindo da tela de quem TEM a versao nova.
   *   A ORDEM importa: medidas primeiro, areas depois. E ela que casa com as
   *   chaves de recorte do relatorio (`Rel.chaveRecorte(pid, "m", i)`).
   * ================================================================== */
  Tour360.medidasDoPonto = function (ponto) {
    var p = ponto || {};
    /* ⚠ `Array.isArray`, e nao `|| []`: o codigo que esta funcao substituiu na
       tela passava por `Util.arr`, que COAGE o que nao e lista. Um registro
       estragado (medidas virou objeto num merge malfeito) faria `.concat`
       estourar e derrubar a tela inteira da visita - e a regra desta casa e
       isolar o corrompido, nunca travar a UI por causa dele. */
    var ms = Array.isArray(p.medidas) ? p.medidas : [];
    var as = Array.isArray(p.areas) ? p.areas : [];
    return ms.concat(as);
  };

  /* ⚠ A AREA QUE JA FOI GRAVADA NO LUGAR ERRADO - e o formato antigo existiu
     de verdade: o codigo que gravava area dentro de `p.medidas[]` esteve no
     master por um dia, e o registro dele pode ter subido para a nuvem.
     Enquanto ele estiver ali, o aparelho na 1.2.56 mostra "0,00 m".

     Move, nao copia, e e IDEMPOTENTE: rodar duas vezes nao duplica nada.
     Devolve QUANTAS mudaram de lista, para quem chamar poder registrar.

     ⚠ NAO GRAVA NADA, e isso e doutrina desta casa (js/store.js): migracao
     converte NA LEITURA, em memoria, e a forma nova so encosta no disco
     quando algo grava por outro motivo - regravar em massa carimba
     `atualizadoEm` novo em conteudo velho, a migracao vence o merge da nuvem
     e passa por cima do que o outro aparelho tinha de mais recente (foi assim
     que a migracao de fotos apagou diario editado, v1.1.236). Aqui quem grava
     e o `salvarTour` da tela, no unico funil de gravacao da visita: qualquer
     edicao cura o registro, e a cura sobe para os outros aparelhos. */
  Tour360.migrarAreas = function (tour) {
    var ps = (tour && tour.pontos) || [], mudou = 0, i, k, ms, fica, p;
    for (i = 0; i < ps.length; i++) {
      p = ps[i];
      if (!p) continue;
      ms = p.medidas || [];
      fica = [];
      for (k = 0; k < ms.length; k++) {
        if (ms[k] && ms[k].tipo === "area") {
          p.areas = p.areas || [];
          p.areas.push(ms[k]);
          mudou++;
        } else {
          fica.push(ms[k]);
        }
      }
      if (fica.length !== ms.length) p.medidas = fica;
    }
    return mudou;
  };

  Tour360.cabePonto = function (tour) {
    var n = ((tour && tour.pontos) || []).length;
    return { cabe: n < Tour360.MAX_PONTOS, restam: Math.max(0, Tour360.MAX_PONTOS - n) };
  };

  /* Estado do documento. `temPortal` começa FALSO de propósito, como no RDO:
     quem afirma que o cliente está vendo é quem sabe que existe Portal. */
  /* ⚠ DUAS PERGUNTAS DIFERENTES, E CONFUNDI-LAS JA CUSTOU CARO AQUI.

     `estadoDe` responde "o que ESCREVER NA TELA", e por isso o `temPortal`
     comeca falso: quem afirma que o cliente esta vendo e quem sabe que existe
     Portal. Para uma visita publicada numa obra sem Portal ele devolve
     "pronto" — que e a palavra certa para a pessoa ler.

     `estaPublicado` responde "o gestor MANDOU publicar isto?", que e decisao
     de maquina e nao tem meio-termo.

     Eu mesmo usei `estadoDe(t) !== "publicado"` como guarda em
     `Gestao._republicarTourSeNoAr`, e como ela nunca recebia o segundo
     argumento a resposta era sempre "pronto": a republicacao automatica NUNCA
     disparava. O efeito era o defeito que eu tinha acabado de consertar na
     rodada anterior — a foto que termina de subir DEPOIS da publicacao nao
     alcancava o cliente, calada. Achado por um revisor que espionou a funcao
     no navegador e viu a lista de chamadas vazia.
     Regra: rotulo e `estadoDe`; decisao e `estaPublicado`. */
  Tour360.estaPublicado = function (t) {
    return txt(t && t.estado) === "publicado";
  };

  Tour360.estadoDe = function (t, temPortal) {
    var e = txt(t && t.estado);
    if (e === "publicado") return temPortal ? "publicado" : "pronto";
    return e || "rascunho";
  };

  Tour360.validar = function (tour) {
    var t = tour || {}, erros = [], avisos = [];
    if (!txt(t.obraId)) erros.push("O tour precisa estar ligado a uma obra.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txt(t.data))) erros.push("Data da visita inválida.");
    var ps = t.pontos || [];
    if (!ps.length) erros.push("Um tour sem ponto nenhum não é um tour.");
    if (ps.length > Tour360.MAX_PONTOS) erros.push("Máximo de " + Tour360.MAX_PONTOS + " pontos por tour.");

    var vistos = {}, semFoto = 0, planas = 0, declaradas = 0, i, p;
    for (i = 0; i < ps.length; i++) {
      p = ps[i];
      if (!txt(p.pid)) { erros.push("Ponto sem identificador — o comparativo entre visitas depende dele."); continue; }
      if (vistos[p.pid]) erros.push("Dois pontos com o mesmo identificador (" + p.pid + "): o comparativo casaria a foto errada.");
      vistos[p.pid] = true;
      if (!p.foto) semFoto++;
      if (p.tipo !== "equirect") planas++;
      if (txt(p.panoFonte) === "declarada") declaradas++;
      if (num(p.alturaCam, 0) <= 0) avisos.push("O ponto \"" + txt(p.nome) + "\" está sem altura de câmera — nele não dá para medir.");
      if ((p.hotspots || []).length > Tour360.MAX_HOTSPOTS) erros.push("Ponto \"" + txt(p.nome) + "\" com comentários demais (máximo " + Tour360.MAX_HOTSPOTS + ").");
      /* ⚠ O TETO E DA ESTACAO, NAO DE UMA DAS DUAS LISTAS. `medidas` e `areas`
         sao dois arrays por causa da frota (ver `medidasDoPonto`), mas para
         quem usa - e para a nuvem - sao "as medidas deste ponto": contar so um
         deles deixaria uma estacao chegar a 80 registros sem ninguem avisar, e
         este teto existe por causa do documento de 1 MiB do Firestore. */
      if (Tour360.medidasDoPonto(p).length > Tour360.MAX_MEDIDAS) erros.push("Ponto \"" + txt(p.nome) + "\" com medidas demais (máximo " + Tour360.MAX_MEDIDAS + ").");
    }
    if (semFoto) avisos.push(semFoto + " ponto(s) ainda sem foto.");
    if (planas) avisos.push(planas + " ponto(s) com foto comum (não gira em 360, e não dá para medir por ângulo).");
    /* ⚠ AVISO, NÃO ERRO. A estação de abertura informada gira, aparece no
       comparativo e no relatório — ela só não mede. Transformar isso em erro
       IMPEDIRIA o gestor de republicar um tour que já está no ar, e trava sem
       porta empurra a pessoa a contornar (marcar a foto como comum só para se
       livrar do bloqueio). Quem decide o que vai ao cliente é ele. */
    if (declaradas) avisos.push(declaradas + " estação(ões) com a abertura do panorama informada à mão: elas giram e aparecem no relatório, mas não medem por ângulo.");

    return { ok: erros.length === 0, erros: erros, avisos: avisos };
  };

  /* ⚠ PUBLICAR AO CONTRATANTE É ATO DE GESTOR, a mesma régua do diário
     (`RDO.podeAcao("publicar")`). O que sai daqui vai para a tela de quem
     paga a obra: fotos do canteiro, apontamentos e medidas. Enquanto a única
     guarda era ter o módulo, o encarregado que registra a visita — o mesmo
     que o admin restringiu a uma obra — publicava direto ao cliente, sem
     ninguém do escritório ver antes. Papel e nomeação seguem o padrão da
     casa: quem não é "usuario" é gestor, e o admin pode nomear um
     sub-usuário aprovador. */
  Tour360.podePublicarPapel = function (usuario) {
    var u = usuario || {};
    /* ⚠ `!== "usuario"`, exatamente como `RDO.podeAcao` (js/rdo.js:629), e não
       uma lista de papéis permitidos: conta antiga não tem `papel` gravado, e
       ela é a do DONO. Exigir o papel presente trancaria a publicação de quem
       instalou o sistema — o mesmo tropeço que já deixou uma base inteira em
       somente-leitura por causa de autoria desconhecida. */
    var gestor = (u.papel !== "usuario");
    return gestor || u.aprovador === true;
  };

  /* Publicar é decisão humana e precisa de conteúdo: tour sem ponto com foto
     no Portal é uma tela vazia com o nome da empresa em cima. */
  Tour360.podePublicar = function (tour) {
    var v = Tour360.validar(tour);
    if (!v.ok) return { ok: false, motivo: v.erros[0] };
    var comFoto = 0, ps = (tour && tour.pontos) || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].foto) comFoto++;
    if (!comFoto) return { ok: false, motivo: "Nenhum ponto tem foto ainda — não há o que o cliente ver." };
    return { ok: true, pontosComFoto: comFoto };
  };

  /* Quantas fotos ainda não subiram. O Portal recebe REFERÊNCIA; foto que
     ainda está na fila do aparelho não chega ao cliente, e publicar sem
     contar isso faz o cliente abrir o tour e achar que ninguém fotografou. */
  /* ⚠ Conta a foto EMBUTIDA junto com a que está na fila, e isso é de
     propósito: as duas têm o mesmo destino no Portal — não chegam. A foto
     `d` (base64, aparelho sem IndexedDB) é barrada em `paraPortal` porque um
     panorama embutido estoura o retrato. Contar só a da fila diria "está
     tudo publicado" para uma estação que o cliente não vê. */
  Tour360.fotosPendentes = function (tour) {
    var ps = (tour && tour.pontos) || [], n = 0;
    for (var i = 0; i < ps.length; i++) {
      var f = ps[i].foto;
      if (f && !f.remoto) n++;
    }
    return n;
  };

  /* Quanto a lista inteira pesa na nuvem, e QUEM está pesando. Devolver o
     tour mais gordo é o que transforma o aviso em ação: "a lista está em
     640 KB, e a visita de 12/03 sozinha responde por 380 KB" tem saída;
     "você está perto do limite" não tem. */
  Tour360.peso = function (tours) {
    var lista = tours || [], porTour = [], total = 0, i;
    for (i = 0; i < lista.length; i++) {
      var b = 0;
      try { b = JSON.stringify(lista[i]).length; } catch (e) { b = 0; }
      total += b;
      porTour.push({ id: txt(lista[i].id), titulo: txt(lista[i].titulo), data: txt(lista[i].data), bytes: b });
    }
    porTour.sort(function (a, b) { return b.bytes - a.bytes; });

    var estado = "ok";
    if (total >= Tour360.PESO_PERIGO) estado = "perigo";
    else if (total >= Tour360.PESO_AVISO) estado = "aviso";

    var aviso = "";
    if (estado !== "ok") {
      var maior = porTour[0];
      aviso = "Os tours desta empresa já ocupam " + Math.round(total / 1024) + " KB na nuvem"
        + (estado === "perigo" ? " e estão perto do limite de 1 MB, onde a sincronização PARA sem avisar." : ".")
        + (maior ? " A maior é \"" + (maior.titulo || maior.data) + "\", com " + Math.round(maior.bytes / 1024) + " KB." : "")
        + " Para reduzir: apague as visitas antigas que já viraram relatório, ou tire os comentários que já foram resolvidos — as fotos não contam aqui, elas ficam fora do registro.";
    }
    return {
      bytes: total, kb: Math.round(total / 1024), estado: estado,
      aviso: aviso, tours: lista.length, maiores: porTour.slice(0, 5)
    };
  };

  /* =====================================================================
   * 4. O COMPARATIVO ENTRE MOMENTOS
   * ================================================================== */

  /* A visita nova nasce da anterior: mesmos pontos, mesmos pids, mesma altura
     de câmera e mesmo norte — e SEM as fotos, sem as medidas e sem os
     comentários, que são do dia em que foram feitos. É esta função que faz o
     comparativo existir; criar o tour do zero devolve pontos órfãos. */
  Tour360.basearEm = function (anterior, novaData, opts) {
    var a = anterior || {}, o = opts || {};
    var t = Tour360.novo(a.obraId, novaData || hojeLocal(), {
      obraNome: a.obraNome,
      titulo: o.titulo || ("Visita " + (novaData || hojeLocal())),
      autorId: o.autorId, autor: o.autor,
      baseadoEm: txt(a.id),
      comparaCom: txt(a.id),
      /* ⚠ a planta VAI JUNTO, e as posições das estações também (abaixo): sem
         isso o engenheiro remarcaria os 12 pinos a cada visita, e na terceira
         ele desiste do minimapa. É o mesmo princípio do `pid`. */
      planta: a.planta || null,
      plantaNorte: num(a.plantaNorte, 0)
    });
    var ps = a.pontos || [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      t.pontos.push({
        pid: p.pid,                       /* ⚠ o MESMO pid: é o carimbo */
        nome: txt(p.nome),
        nivel: txt(p.nivel),
        foto: null,
        tipo: txt(p.tipo) || "equirect",
        alturaCam: num(p.alturaCam, Tour360.ALTURA_CAM_PADRAO),
        nortear: num(p.nortear, 0),
        horizonte: num(p.horizonte, 0),
        ancora: p.ancora || null,
        planta: p.planta || null,
        /* ⚠ A COBERTURA NÃO ATRAVESSA A VISITA, e isso é decisão: ela descreve
           a FOTO, não a estação. `alturaCam`, `nortear` e `horizonte` são do
           lugar e por isso são copiados; `panoCobH`/`panoCobV` são do arquivo
           que foi tirado naquele dia, e a visita nova nasce sem foto. Copiar
           faria a foto de setembro herdar a abertura da de agosto — e medir
           com a geometria de outro arquivo, plausível e errado. */
        panoFonte: "", panoCobH: 0, panoCobV: 0, panoCentroPitch: 0,
        vizinhos: (p.vizinhos || []).slice(),
        hotspots: [],
        medidas: [],
        areas: [],
        capturadoEm: ""
      });
    }
    /* ⚠ OS COMENTÁRIOS DO DIA CONTINUAM ZERADOS (acima) — "cobrar o azulejista"
       é do dia em que foi dito. Mas a PENDÊNCIA atravessa: a fissura de agosto
       reaparece em setembro, no mesmo ponto da foto, pedindo veredito. Sem
       isso o módulo é um álbum bonito, e a lista de apontamentos continua no
       caderno do engenheiro. */
    Tour360.carregarPendencias(a, t);
    return t;
  };

  /* Casa dois tours PELO pid. Devolve os órfãos em vez de forçar par: dois
     pontos "parecidos" em fotos de meses diferentes é exatamente o tipo de
     casamento por semelhança que já produziu comparação errada nesta base. */
  Tour360.parear = function (tourA, tourB) {
    var A = (tourA && tourA.pontos) || [], B = (tourB && tourB.pontos) || [];
    var mapa = {}, i, pares = [], soA = [], soB = [], usados = {};
    for (i = 0; i < B.length; i++) mapa[B[i].pid] = B[i];
    for (i = 0; i < A.length; i++) {
      var b = mapa[A[i].pid];
      if (b) { pares.push({ pid: A[i].pid, nome: txt(A[i].nome) || txt(b.nome), a: A[i], b: b }); usados[A[i].pid] = true; }
      else soA.push(A[i]);
    }
    for (i = 0; i < B.length; i++) if (!usados[B[i].pid]) soB.push(B[i]);
    return {
      pares: pares, soA: soA, soB: soB,
      comparaveis: pares.length,
      aviso: pares.length ? "" : "Nenhum ponto em comum: estas duas visitas não foram feitas dos mesmos lugares. Para comparar, crie a próxima visita a partir desta (botão \"Repetir visita\")."
    };
  };

  /* =====================================================================
   * 3b. A PENDÊNCIA QUE ATRAVESSA A VISITA
   *
   * É o que separa álbum de foto redonda de ferramenta de gestão. A fissura
   * marcada em agosto tem de REAPARECER em setembro, no mesmo ponto da foto,
   * pedindo veredito: resolvida, ainda aberta, ou piorou. Sem isso ela vive no
   * caderno do engenheiro e no grupo do WhatsApp, que é onde ela morre.
   *
   * ⚠ COMENTÁRIO E PENDÊNCIA SÃO COISAS DIFERENTES, e essa distinção é o
   *   coração daqui. "Cobrar o azulejista" é do dia — `basearEm` zera, e está
   *   certo. "Fissura no pilar P4" é um FATO DA OBRA que não some porque o mês
   *   virou: essa atravessa, com `origemHid` ligando todas as aparições à
   *   primeira. Só `atencao` e `pendencia` viram pendência; os outros dois
   *   tipos continuam sendo recado do dia.
   *
   * ⚠ E A LIGAÇÃO É POR CARIMBO, como o `pid` da estação: a cópia da visita
   *   nova aponta para o `hid` da ORIGINAL. Casar por texto parecido ("fissura
   *   no pilar" vs "trinca no P4") é o erro que esta casa não comete.
   * ================================================================== */

  Tour360.STATUS_PENDENCIA = ["aberta", "resolvida", "persiste"];
  Tour360.TIPOS_PENDENCIA = ["atencao", "pendencia"];

  Tour360.ehPendencia = function (h) {
    return !!h && Tour360.TIPOS_PENDENCIA.indexOf(txt(h.tipo)) > -1;
  };

  /* O status de quem nunca foi julgado é "aberta" — e por omissão, não por
     gravação: registro antigo não tem o campo, e tratá-lo como resolvido
     apagaria a pendência da lista sem ninguém decidir nada. */
  Tour360.statusDe = function (h) {
    var s = txt(h && h.status);
    return Tour360.STATUS_PENDENCIA.indexOf(s) > -1 ? s : "aberta";
  };

  Tour360.pendenciaAberta = function (h) {
    if (!Tour360.ehPendencia(h)) return false;
    return Tour360.statusDe(h) !== "resolvida";
  };

  /* Todas as pendências vivas da visita, com a estação de cada uma. */
  Tour360.pendenciasDe = function (tour, opts) {
    var o = opts || {};
    var ps = (tour && tour.pontos) || [], fora = [], i, k;
    for (i = 0; i < ps.length; i++) {
      var hs = ps[i].hotspots || [];
      for (k = 0; k < hs.length; k++) {
        if (!Tour360.ehPendencia(hs[k])) continue;
        var st = Tour360.statusDe(hs[k]);
        if (o.soAbertas && st === "resolvida") continue;
        fora.push({
          hid: txt(hs[k].hid),
          origemHid: txt(hs[k].origemHid) || txt(hs[k].hid),
          pid: txt(ps[i].pid),
          estacao: txt(ps[i].nome),
          nivel: txt(ps[i].nivel),
          tipo: txt(hs[k].tipo),
          texto: txt(hs[k].texto),
          status: st,
          responsavel: txt(hs[k].responsavel),
          prazo: txt(hs[k].prazo),
          yaw: num(hs[k].yaw, 0),
          pitch: num(hs[k].pitch, 0),
          desdeData: txt(hs[k].origemData) || txt(tour && tour.data),
          resolvidoEm: txt(hs[k].resolvidoEm)
        });
      }
    }
    return fora;
  };

  /* Traz para a visita nova as pendências que continuam abertas. Cada uma
     nasce como uma cópia LIGADA à original (`origemHid`) e volta ao estado
     "aberta": é a pergunta do mês, não a resposta do mês passado.
     ⚠ Só entra pendência cuja estação existe na visita nova — pendência sem
     lugar na foto não tem onde ser marcada, e uma lista de itens que ninguém
     consegue apontar é uma lista que ninguém usa. */
  /* ⚠ QUAL MARCADOR A CORREÇÃO DE NORTE PODE MOVER — E POR QUÊ.
     O `yaw`/`pitch` de um marcador é PIXEL DA FOTO em que ele foi apontado: o
     visualizador desenha o BRUTO (ver o cabeçalho de js/tour360view.js). Daí
     saem duas regras OPOSTAS, e confundi-las estraga de um jeito que parece
     conferido — o texto certo, o dedo na parede errada:

     · marcador apontado NESTA foto — mexer no `nortear` é CALIBRAR o norte. A
       foto não mudou; mover o marcador o tiraria de cima da fissura. NÃO anda.
     · marcador vindo de OUTRA FOTO (herdado da visita anterior, ou da foto que
       acabou de ser substituída) — o ângulo dele é pixel da foto ANTIGA. Quando
       a estação é refotografada, o panorama novo começa de outro lado e o
       engenheiro corrige o `nortear`: é NESSE instante que o herdado precisa
       andar, senão a fissura de agosto aponta para outra parede em setembro.

     Por isso quem veio de outra foto carrega `frameNorte`/`frameHor` — o
     referencial em que o número dele foi escrito. SÓ quem tem esse carimbo
     anda; depois de andar (e só quando já existe foto para ancorar) o carimbo
     sai, porque o marcador passou a ser desta foto.

     ⚠ A MEDIDA NÃO ENTRA AQUI, e é de propósito: `recalcular` guarda os
     cliques BRUTOS e aplica `corrigir` na hora de ler, justamente para que
     nivelar uma foto torta conserte o histórico inteiro. Mover os cliques
     desfaria essa correção. */
  Tour360.marcarFrame = function (ponto) {
    var hs = (ponto && ponto.hotspots) || [], n = 0, i;
    for (i = 0; i < hs.length; i++) {
      if (hs[i].frameNorte !== undefined && hs[i].frameNorte !== null) continue;
      hs[i].frameNorte = num(ponto.nortear, 0);
      hs[i].frameHor = num(ponto.horizonte, 0);
      n++;
    }
    return n;
  };

  Tour360.renortear = function (ponto, nortearNovo, horizonteNovo) {
    if (!ponto) return { ok: false, motivo: "Estação não encontrada.", movidos: 0 };
    var nN = num(nortearNovo, 0);
    var hN = Math.max(-90, Math.min(90, num(horizonteNovo, 0)));
    var temFoto = !!ponto.foto;
    var hs = ponto.hotspots || [], movidos = 0, i;
    for (i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (h.frameNorte === undefined || h.frameNorte === null) continue;
      var fN = num(h.frameNorte, 0), fH = num(h.frameHor, 0);
      if (fN !== nN || fH !== hN) {
        /* tira o referencial VELHO e repõe o NOVO: o rumo em relação ao norte
           é o que se conserva entre duas fotos da mesma estação */
        h.yaw = Tour360.normalizarYaw(num(h.yaw, 0) - fN + nN);
        h.pitch = Math.max(-90, Math.min(90, num(h.pitch, 0) - fH + hN));
        movidos++;
      }
      if (temFoto) {
        /* reconciliado com a foto que está aqui: daqui para frente ele é desta
           foto, e uma calibração de norte não pode mais arrastá-lo */
        delete h.frameNorte;
        delete h.frameHor;
      } else {
        /* sem foto ainda: o número continua sendo de outro lugar, e o carimbo
           tem de sobreviver até a foto nova chegar */
        h.frameNorte = nN;
        h.frameHor = hN;
      }
    }
    ponto.nortear = nN;
    ponto.horizonte = hN;
    return { ok: true, movidos: movidos, nortear: nN, horizonte: hN, ancorado: temFoto };
  };

  Tour360.carregarPendencias = function (anterior, novo) {
    var abertas = Tour360.pendenciasDe(anterior, { soAbertas: true });
    var n = 0, i;
    for (i = 0; i < abertas.length; i++) {
      var p = abertas[i];
      var alvo = Tour360.pontoDe(novo, p.pid);
      if (!alvo) continue;
      /* ⚠ O ÂNGULO ATRAVESSA NO REFERENCIAL COMUM, NUNCA CRU — e o carimbo
         `frameNorte`/`frameHor` abaixo é a outra metade do mesmo conserto.
         `yaw`/`pitch` do hotspot são BRUTOS da foto em que ele nasceu. A conta
         daqui só resolve o caso em que a estação de destino JÁ tem outro
         `nortear` na hora da cópia — e dentro de `basearEm` ela nunca tem,
         porque `basearEm` acabou de copiar o `nortear` da origem. Ou seja:
         sozinha, esta linha é a identidade, e a revisão de 08/09/2026 mostrou
         isso medindo. O renorteamento de verdade acontece DEPOIS, quando a
         foto nova chega e o engenheiro corrige o norte dela; quem faz a
         cópia andar naquele instante é `Tour360.renortear`, e o que diz a ele
         que este marcador veio de outra foto é o carimbo. */
      var orig = Tour360.pontoDe(anterior, p.pid) || {};
      var corr = Tour360.corrigir({ yaw: p.yaw, pitch: p.pitch }, orig);
      var yawNovo = Tour360.normalizarYaw(corr.yaw + num(alvo.nortear, 0));
      var pitchNovo = Math.max(-90, Math.min(90, corr.pitch + num(alvo.horizonte, 0)));
      alvo.hotspots = alvo.hotspots || [];
      alvo.hotspots.push({
        hid: uid("h"),
        origemHid: p.origemHid,          /* ⚠ o carimbo que liga as aparições */
        origemData: p.desdeData,
        tipo: p.tipo,
        texto: p.texto,
        status: "aberta",
        responsavel: p.responsavel,
        prazo: p.prazo,
        yaw: yawNovo,
        pitch: pitchNovo,
        autor: "",
        em: "",
        paraCliente: false,              /* quem publica decide de novo */
        /* o referencial em que o número acima está escrito — ver `renortear` */
        frameNorte: num(alvo.nortear, 0),
        frameHor: num(alvo.horizonte, 0)
      });
      n++;
    }
    return { ok: true, carregadas: n, semEstacao: abertas.length - n };
  };

  /* Ordena as visitas de uma obra com DESEMPATE DECLARADO.
     ⚠ DUAS VISITAS NO MESMO DIA É CASO REAL — manhã e tarde, ou uma visita de
     correção depois de o cliente reclamar (o diário registra o mesmo caso, e é
     por isso que ele liga por carimbo). Ordenando só por `data`, o empate
     devolve 0, o `sort` preserva a ordem de ENTRADA, e a ordem de entrada é a
     que o Store devolveu: qual das duas conta como "a de hoje" passava a
     depender da ordem de gravação, e o Painel podia cobrar a lista da visita
     da manhã depois de a da tarde resolver tudo. Agora desempata por
     `criadoEm` e, faltando ele, por `id` — sempre o mesmo resultado. */
  function ordenarVisitas(tours, crescente) {
    var s = crescente ? 1 : -1;
    return (tours || []).slice().sort(function (a, b) {
      var d = txt(a && a.data).localeCompare(txt(b && b.data));
      if (d) return d * s;
      var c = txt(a && a.criadoEm).localeCompare(txt(b && b.criadoEm));
      if (c) return c * s;
      return txt(a && a.id).localeCompare(txt(b && b.id)) * s;
    });
  }

  /* Uma passada só por TODAS as visitas, indexando as aparições por `origemHid`.
     ⚠ ANTES CADA PENDÊNCIA REMONTAVA O HISTÓRICO SOZINHA, e cada remontagem
     reordenava a lista e revarria todas as visitas: o custo era
     O(visitas × pendências abertas × estações × comentários) por obra — pago em
     TODA renderização do Painel, que é a tela onde a pessoa cai a cada volta.
     Recebe a lista já ordenada do mais VELHO para o mais novo: as aparições
     saem em ordem cronológica, e é disso que "desde março" depende. */
  function indexarPendencias(listaCrescente) {
    var idx = {}, i, k;
    for (i = 0; i < listaCrescente.length; i++) {
      var pend = Tour360.pendenciasDe(listaCrescente[i]);
      for (k = 0; k < pend.length; k++) {
        var oh = pend[k].origemHid;
        if (!idx[oh]) idx[oh] = [];
        idx[oh].push({
          tourId: txt(listaCrescente[i].id),
          data: txt(listaCrescente[i].data),
          estacao: pend[k].estacao,
          status: pend[k].status,
          texto: pend[k].texto,
          hid: pend[k].hid
        });
      }
    }
    return idx;
  }

  function montarHistorico(origemHid, linha) {
    linha = linha || [];
    /* ⚠ ARRASTAR É ATRAVESSAR O TEMPO, NÃO CONTAR REGISTRO. Duas visitas no
       MESMO DIA (manhã e tarde, ou uma de correção) davam `visitas: 2` e a
       pendência nascia pintada de "se arrastando por mais de uma visita" —
       visto na foto da tela em 08/09/2026, com a fissura marcada de manhã
       aparecendo de tarde como se viesse do mês passado. Número que mente num
       painel de cobrança é pior que painel sem número: ele gasta a atenção de
       quem confia nele. `visitas` continua contando as aparições (é o que a
       linha do tempo mostra); quem decide a cor é `datas`. */
    var datas = 0, vista = "", i;
    for (i = 0; i < linha.length; i++) {
      if (linha[i].data !== vista) { datas++; vista = linha[i].data; }
    }
    return {
      origemHid: origemHid,
      aparicoes: linha,
      visitas: linha.length,
      datas: datas,
      desde: linha.length ? linha[0].data : "",
      situacao: linha.length ? linha[linha.length - 1].status : "",
      /* ⚠ "há 4 visitas" é o número que faz o gestor agir; "aberta" sozinho
         não diz se é de ontem ou do começo da obra */
      arrastando: datas > 1 && linha[linha.length - 1].status !== "resolvida"
    };
  }

  /* A vida de uma pendência ao longo das visitas: quando apareceu, o que foi
     dito em cada uma, quando foi resolvida. É o que sustenta a conversa
     "isso está assim desde março". */
  Tour360.historicoPendencia = function (tours, origemHid) {
    var idx = indexarPendencias(ordenarVisitas(tours, true));
    return montarHistorico(origemHid, idx[origemHid] || []);
  };

  /* O histórico de TODAS as pendências da obra de uma vez, indexado por
     `origemHid`. Existe para a tela que precisa do número de visitas de vários
     itens: chamar `historicoPendencia` numa por uma refaz a varredura inteira
     a cada item — e o cartão de pendências faz isso para cada linha, em toda
     renderização. */
  Tour360.historicoTodas = function (tours) {
    var idx = indexarPendencias(ordenarVisitas(tours, true));
    var fora = {}, oh;
    for (oh in idx) {
      if (!Object.prototype.hasOwnProperty.call(idx, oh)) continue;
      fora[oh] = montarHistorico(oh, idx[oh]);
    }
    return fora;
  };

  /* O apanhado que a tela e o painel de atenção mostram. */
  Tour360.resumoPendencias = function (tours, hojeISO) {
    var lista = ordenarVisitas(tours, false);        // a mais nova primeiro
    if (!lista.length) {
      return { abertas: 0, vencidas: 0, arrastando: 0, itens: [], deixadas: [], mesmaData: 0 };
    }

    /* só a visita MAIS RECENTE conta como "hoje": as anteriores são história, e
       somá-las contaria a mesma fissura cinco vezes */
    var atual = lista[0];
    var atualId = txt(atual.id);
    var idx = indexarPendencias(ordenarVisitas(lista, true));
    var pend = Tour360.pendenciasDe(atual, { soAbertas: true });
    var hoje = txt(hojeISO) || hojeLocal();
    var vencidas = 0, arrastando = 0, i, itens = [];
    for (i = 0; i < pend.length; i++) {
      var h = montarHistorico(pend[i].origemHid, idx[pend[i].origemHid]);
      var venceu = !!pend[i].prazo && pend[i].prazo < hoje;
      if (venceu) vencidas++;
      if (h.datas > 1) arrastando++;
      itens.push({
        hid: pend[i].hid, origemHid: pend[i].origemHid,
        estacao: pend[i].estacao, texto: pend[i].texto,
        status: pend[i].status, responsavel: pend[i].responsavel,
        prazo: pend[i].prazo, vencida: venceu,
        visitas: h.visitas, datas: h.datas, desde: h.desde
      });
    }

    /* ⚠ A PENDÊNCIA QUE NÃO ENTROU NA VISITA NOVA SUMIA DA COBRANÇA EM SILÊNCIO.
       Três caminhos normais fazem isso, e nenhum deles é erro de quem usa: criar
       a visita por "+ Nova visita" em vez de "Repetir visita" (nasce sem as
       pendências), apagar a estação onde a fissura estava (o carregamento pula
       quem não tem lugar na foto), e apagar o próprio apontamento herdado. Como
       o resumo só olhava a visita mais recente, o Painel passava a dizer
       "nenhuma pendência" — e a fissura continuava na parede. Uma lista que
       esvazia sozinha é pior que lista nenhuma: ela dá sossego.
       `deixadas` são as pendências cuja ÚLTIMA aparição está numa visita
       ANTERIOR e não foi resolvida lá. Elas saem SEPARADAS de `itens` de
       propósito: "aberta hoje" e "ficou para trás em 12/03" pedem ações
       diferentes, e misturá-las inflaria a conta de quem está em dia. */
    var deixadas = [], oh;
    for (oh in idx) {
      if (!Object.prototype.hasOwnProperty.call(idx, oh)) continue;
      var ap = idx[oh], ult = ap[ap.length - 1];
      if (!ult || ult.status === "resolvida") continue;
      if (atualId && ult.tourId === atualId) continue;   // está sendo cobrada
      deixadas.push({
        origemHid: oh, estacao: ult.estacao, texto: ult.texto,
        status: ult.status, desde: ap[0].data,
        ultimaData: ult.data, ultimaTourId: ult.tourId, visitas: ap.length
      });
    }
    deixadas.sort(function (a, b) { return txt(a.ultimaData).localeCompare(txt(b.ultimaData)); });

    /* quantas visitas dividem a data da atual — a tela usa para dizer QUAL
       delas está na lista em vez de escolher em silêncio */
    var mesmaData = 0;
    for (i = 0; i < lista.length; i++) if (txt(lista[i].data) === txt(atual.data)) mesmaData++;

    return {
      abertas: pend.length, vencidas: vencidas, arrastando: arrastando,
      itens: itens, deixadas: deixadas,
      tourId: atualId, data: txt(atual.data),
      titulo: txt(atual.titulo), mesmaData: mesmaData
    };
  };

  /* =====================================================================
   * 4b. ANDAR PELA OBRA — as setas entre estações
   *
   * É o que separa "álbum de fotos redondas" de TOUR: a pessoa toca na seta
   * que está no chão do corredor e cai na estação seguinte, olhando para o
   * mesmo lado. Sem isso, trocar de ponto é voltar a uma lista e procurar o
   * nome que o engenheiro deu à sala — e é aí que o cliente fecha a aba.
   *
   * ⚠ O CAMPO `vizinhos` JÁ EXISTIA e nunca foi lido por tela nenhuma: ele
   *   nascia em `novoPonto`, era copiado por `basearEm` e ATRAVESSAVA a
   *   allowlist até o Portal do cliente, sem servir a ninguém. Era o "motor
   *   sem fiação" que o CLAUDE.md descreve, publicado.
   *
   * FORMATO: `[{pid, yaw}]` — o yaw é a direção, NA FOTO, em que a passagem
   * aparece. O formato antigo (`["p2","p3"]`, só o pid) continua sendo lido:
   * registro de cliente não se abandona, e sem yaw a seta cai no rumo
   * calculado pela planta, ou some. Migração por leitura, nunca por script.
   * ================================================================== */

  Tour360.vizinhosDe = function (ponto) {
    var v = (ponto && ponto.vizinhos) || [], fora = [], i, x;
    for (i = 0; i < v.length; i++) {
      x = v[i];
      if (!x) continue;
      if (typeof x === "string") { fora.push({ pid: x, yaw: null }); continue; }   /* formato antigo */
      if (x.pid) fora.push({ pid: txt(x.pid), yaw: (x.yaw === null || x.yaw === undefined) ? null : Tour360.normalizarYaw(x.yaw) });
    }
    return fora;
  };

  /* A ligação é SEMPRE nos dois sentidos. Corredor que só anda para um lado é
     beco: a pessoa entra na sala e não acha como voltar — e a saída dela vira
     recarregar a página. O yaw de volta é o oposto, e é só um palpite decente
     até alguém corrigir na tela ou a planta responder melhor. */
  Tour360.ligarVizinhos = function (a, b, yawDeAparaB) {
    if (!a || !b || a.pid === b.pid) return { ok: false, motivo: "Ligue duas estações diferentes." };
    var ida = Tour360.vizinhosDe(a), volta = Tour360.vizinhosDe(b), i;
    var y = (yawDeAparaB === null || yawDeAparaB === undefined) ? null : Tour360.normalizarYaw(yawDeAparaB);

    for (i = 0; i < ida.length; i++) if (ida[i].pid === b.pid) ida.splice(i--, 1);
    for (i = 0; i < volta.length; i++) if (volta[i].pid === a.pid) volta.splice(i--, 1);
    ida.push({ pid: b.pid, yaw: y });
    volta.push({ pid: a.pid, yaw: y === null ? null : Tour360.normalizarYaw(y + 180) });

    a.vizinhos = ida;
    b.vizinhos = volta;
    return { ok: true, ligacoes: ida.length };
  };

  Tour360.desligarVizinhos = function (a, b) {
    if (!a || !b) return { ok: false };
    function tira(p, alvo) {
      var l = Tour360.vizinhosDe(p), i;
      for (i = 0; i < l.length; i++) if (l[i].pid === alvo) l.splice(i--, 1);
      p.vizinhos = l;
    }
    tira(a, b.pid); tira(b, a.pid);
    return { ok: true };
  };

  /* As setas prontas para desenhar. `yaw` é onde ela fica na foto; quando a
     ligação não tem yaw gravado mas as duas estações estão posicionadas na
     planta, o rumo sai da geometria — que é melhor que um palpite e é o que
     faz o minimapa pagar por si.
     ⚠ Vizinho SEM FOTO não vira seta: clicar levaria a um palco preto. Ele
     sai na lista como `semFoto` para a tela do engenheiro poder avisar. */
  Tour360.setasDe = function (tour, ponto, opts) {
    var o = opts || {};
    var lista = Tour360.vizinhosDe(ponto), fora = [], i;
    for (i = 0; i < lista.length; i++) {
      var alvo = Tour360.pontoDe(tour, lista[i].pid);
      if (!alvo) continue;                       /* estação apagada: a ligação morre calada */
      /* ⚠ OS DOIS RUMOS VÊM DE REFERENCIAIS DIFERENTES, E MISTURÁ-LOS GIRA A
         SETA PARA A PAREDE ERRADA:

         · o rumo FIXADO é um yaw BRUTO da foto — a pessoa girou o panorama até
           a passagem aparecer e mandou gravar, e o que se grava é `pose()`.
           Para virar rumo corrigido ele precisa perder o `nortear` da estação;

         · o rumo da PLANTA é um azimute do DESENHO (o "para cima" da imagem),
           que não tem relação nenhuma com o quanto aquela foto foi norteada.
           Subtrair o `nortear` dele era uma correção a mais: a seta saía
           girada pelo tanto que a estação tivesse sido norteada, e só voltava
           ao lugar quando alguém fixasse o rumo na foto.
           A relação que ele precisa é OUTRA — entre o norte da planta e o
           rumo combinado das fotos — e mora em `tour.plantaNorte` (0 quando a
           planta está desenhada no mesmo rumo em que as fotos foram tiradas,
           que é o caso comum de quem posiciona os pinos olhando a planta).

         Achado por dois revisores independentes, cada um do seu lado da
         fiação, antes de isto chegar a uma obra. `origem` sai junto para a
         tela poder dizer de onde veio o rumo — e para quem for depurar não
         precisar adivinhar. */
      var yaw = lista[i].yaw, origem = "fixado";
      if (yaw === null) {
        yaw = Tour360.rumoPelaPlanta(ponto, alvo);
        origem = yaw === null ? "nenhum" : "planta";
      }
      if (yaw === null && o.exigirRumo) continue;
      var corrigido = null;
      if (yaw !== null) {
        corrigido = (origem === "planta")
          ? Tour360.normalizarYaw(yaw + num((tour && tour.plantaNorte) || 0, 0))
          : Tour360.normalizarYaw(yaw - num(ponto.nortear, 0));
      }
      fora.push({
        pid: alvo.pid,
        nome: txt(alvo.nome),
        nivel: txt(alvo.nivel),
        yaw: corrigido,
        origem: origem,
        distancia: Tour360.distanciaPelaPlanta(ponto, alvo),
        semFoto: !alvo.foto
      });
    }
    return fora;
  };

  /* Rumo de A para B pela posição na planta. `planta` é {x,y} em fração da
     imagem (0..1), com y crescendo para BAIXO como todo pixel — por isso o
     seno leva o sinal invertido. Devolve null quando falta posição: sem os
     dois pontos marcados não há rumo, e inventar um coloca a seta na parede
     errada, que é pior que não ter seta. */
  Tour360.rumoPelaPlanta = function (a, b) {
    if (!a || !b || !a.planta || !b.planta) return null;
    var dx = num(b.planta.x, 0) - num(a.planta.x, 0);
    var dy = num(b.planta.y, 0) - num(a.planta.y, 0);
    if (!dx && !dy) return null;
    return Tour360.normalizarYaw(Math.atan2(dx, -dy) * GRAU);
  };

  /* Distância aproximada entre duas estações, em FRAÇÃO da planta. Só serve
     para ordenar ("a mais perto primeiro"); vira metro se a planta tiver
     escala, e por isso não é chamada de metro em lugar nenhum. */
  Tour360.distanciaPelaPlanta = function (a, b) {
    if (!a || !b || !a.planta || !b.planta) return null;
    var dx = num(b.planta.x, 0) - num(a.planta.x, 0);
    var dy = num(b.planta.y, 0) - num(a.planta.y, 0);
    return r3(Math.sqrt(dx * dx + dy * dy));
  };

  /* Só faz sentido comparar par com foto dos DOIS lados. */
  Tour360.paresComFoto = function (par) {
    var ps = (par && par.pares) || [], fora = [];
    for (var i = 0; i < ps.length; i++) if (!ps[i].a.foto || !ps[i].b.foto) fora.push(ps[i]);
    return { prontos: ps.length - fora.length, semFoto: fora };
  };

  /* =====================================================================
   * 5. PROJETADO × EXECUTADO (a ponte com o BIM)
   *
   * Uma estação ANCORADA guarda onde ela fica dentro do modelo: a posição na
   * cena (a mesma que BIM.cameraAtual() devolve) e de quanto o norte da foto
   * está girado em relação ao eixo da cena. Com isso o viewer pede ao BIM a
   * MESMA vista e sobrepõe as duas imagens.
   * ================================================================== */

  Tour360.vistaDoPonto = function (ponto, yaw, pitch, opts) {
    var p = ponto || {}, o = opts || {};
    var a = p.ancora;
    if (!a || !a.pos || a.pos.length !== 3) {
      return { ok: false, codigo: "sem-ancora", motivo: "Este ponto ainda não foi ancorado no modelo 3D. Abra o BIM, leve a câmera até onde a foto foi tirada e use \"Ancorar esta estação onde o BIM está agora\"." };
    }
    /* o yaw da foto e o da cena não têm a mesma origem; `a.yaw` é o
       casamento medido no momento da ancoragem */
    var ang = Tour360.normalizarYaw(num(yaw, 0) + num(a.yaw, 0));
    var d = Tour360.direcao(ang, num(pitch, 0));
    var dist = num(o.distancia, 10);
    var pos = [num(a.pos[0], 0), num(a.pos[1], 0), num(a.pos[2], 0)];
    return {
      ok: true,
      camera: {
        pos: pos,
        alvo: [pos[0] + d.x * dist, pos[1] + d.y * dist, pos[2] + d.z * dist],
        up: [0, 1, 0],
        fov: num(o.fov, 0) || num(a.fov, 0) || 75
      }
    };
  };

  /* O RETRATO DO PROJETO. Sobrepor o modelo BIM à foto exigiria o viewer 3D
     do BIM e a esfera do tour VIVOS AO MESMO TEMPO — dois contextos WebGL, que
     é justamente o que derruba os dois ("Too many active WebGL contexts").
     A saída: no momento da ancoragem, guarda-se uma IMAGEM do modelo naquela
     pose. Ela é só um retrato, então só vale enquanto a câmera do tour estiver
     olhando de onde ele foi tirado — daí `poseProxima`.

     ⚠ E o overlay TEM de sumir quando a pessoa gira. Um render do projeto
     encostado numa parede que não é a dele parece divergência de execução:
     o engenheiro vê "pilar fora do lugar" onde só houve giro de câmera, e
     isso vira apontamento em obra. Sumir e explicar é mais barato. */
  Tour360.poseProxima = function (a, b, tolGraus) {
    var tol = num(tolGraus, 0) > 0 ? num(tolGraus, 3) : 3;
    if (!a || !b) return { ok: false, motivo: "Sem vista de referência." };
    var dy = Math.abs(Tour360.difYaw(num(a.yaw, 0), num(b.yaw, 0)));
    var dp = Math.abs(num(a.pitch, 0) - num(b.pitch, 0));
    var dfov = Math.abs(num(a.fov, 0) - num(b.fov, 0));
    /* ⚠ O ZOOM TAMBÉM CONTA. O retrato do projeto foi tirado com um campo de
       visão; sobrepô-lo com outro desalinha tudo pelas bordas, e a pessoa lê
       isso como parede fora de esquadro. `dfov` era calculado e jogado fora. */
    var perto = dy <= tol && dp <= tol && (num(a.fov, 0) === 0 || num(b.fov, 0) === 0 || dfov <= tol * 3);
    return {
      ok: perto,
      difYaw: r1(dy), difPitch: r1(dp), difFov: r1(dfov),
      motivo: perto ? "" : "O retrato do projeto foi tirado de outro rumo (" + br(r1(dy)) + "° de diferença). Volte à vista do projeto para comparar — sobrepor de outro ângulo mostra divergência que não existe."
    };
  };

  Tour360.ancorar = function (cam, yawFoto) {
    var c = cam || {};
    if (!c.pos || c.pos.length !== 3) return { ok: false, motivo: "O viewer 3D não devolveu a posição da câmera." };
    /* o usuário aponta, no panorama, a MESMA direção que está vendo no
       modelo; a diferença entre os dois yaws é o casamento */
    var yawCena = 0;
    if (c.alvo && c.alvo.length === 3) {
      var dx = num(c.alvo[0], 0) - num(c.pos[0], 0);
      var dz = num(c.alvo[2], 0) - num(c.pos[2], 0);
      /* inverso EXATO de Tour360.direcao: x = sin(yaw)·cos(pitch),
         z = −cos(yaw)·cos(pitch). Se os dois discordarem no sinal, a âncora
         nasce espelhada e o BIM abre olhando para a parede de trás. */
      yawCena = Math.atan2(dx, -dz) * GRAU;
    }
    return {
      ok: true,
      ancora: {
        pos: [num(c.pos[0], 0), num(c.pos[1], 0), num(c.pos[2], 0)],
        yaw: Tour360.normalizarYaw(yawCena - num(yawFoto, 0)),
        fov: num(c.fov, 0) || 75,
        em: ""
      }
    };
  };

  /* =====================================================================
   * 6. O VÍDEO
   *
   * `quadros` sai no formato que BimVideo.gravar consome (uma DATA por
   * quadro, que é o que a faixa desenha) e `poses` anda em paralelo, na mesma
   * ordem, com a câmera de cada quadro. Assim o gravador testado da casa é
   * reusado inteiro em vez de eu escrever um segundo.
   * ================================================================== */

  Tour360.planoVideo = function (tour, opts) {
    var o = opts || {};
    var ps = ((tour && tour.pontos) || []).filter(function (p) { return !!p.foto; });
    if (!ps.length) return { ok: false, motivo: "Nenhum ponto com foto — não há o que filmar.", quadros: [], poses: [] };

    var fps = Math.max(1, Math.min(60, Math.round(num(o.fps, 12))));
    var giro = Math.max(1, Math.min(60, num(o.segundosPorPonto, 4)));
    var pausa = Math.max(0, Math.min(10, num(o.pausaFinal, 1)));
    var voltas = Math.max(0.25, Math.min(3, num(o.voltas, 1)));
    var pitch = Math.max(-45, Math.min(45, num(o.pitch, -5)));
    var data = txt(tour && tour.data) || hojeLocal();

    var quadros = [], poses = [], i, k;
    var nPorPonto = Math.max(2, Math.round(fps * giro));

    for (i = 0; i < ps.length; i++) {
      /* ⚠ VARRER 360° NUMA FAIXA FILMA O CINZA. Uma estação de 200° passava
         44% do filme mostrando o que ninguém fotografou — com a data e o nome
         da obra carimbados por cima, num arquivo que parece pronto e que o
         engenheiro manda ao cliente sem rever quadro a quadro. Varre o que a
         foto tem: começa numa borda e termina na outra.
         ⚠ E o pitch entra na faixa: a câmera do filme olha 5° abaixo do
         horizonte por padrão, e numa cinta de 45° isso ainda cabe — mas numa
         de 8° não cabe, e o clamp existe para o filme não começar no vazio. */
      var cH = num(ps[i].panoCobH, 0), cV = num(ps[i].panoCobV, 0);
      var parcialH = (cH > 0 && cH < 360);
      var arco = parcialH ? cH : 360 * voltas;
      var y0 = parcialH ? -cH / 2 : num(o.yawInicial, -180);
      var pitchQ = pitch;
      if (cV > 0 && cV < 180) {
        var cp = num(ps[i].panoCentroPitch, 0);
        var margem = Math.max(0, cV / 2 - 3);
        pitchQ = Math.max(cp - margem, Math.min(cp + margem, pitch));
      }
      for (k = 0; k < nPorPonto; k++) {
        var frac = k / nPorPonto;
        quadros.push(data);
        poses.push({
          pid: ps[i].pid,
          nome: txt(ps[i].nome),
          yaw: Tour360.normalizarYaw(y0 + frac * arco),
          pitch: pitchQ
        });
      }
    }
    for (k = 0; k < Math.round(fps * pausa); k++) {
      quadros.push(quadros[quadros.length - 1]);
      poses.push(poses[poses.length - 1]);
    }

    return {
      ok: true,
      quadros: quadros,
      poses: poses,
      fps: fps,
      pontos: ps.length,
      duracaoSeg: Math.round((quadros.length / fps) * 10) / 10
    };
  };

  /* Vídeo do comparativo: o mesmo ponto, antes e depois, com a data de cada
     trecho na faixa — é a faixa que conta a história, e por isso ela vem da
     data de cada tour em vez de um texto fixo. */
  Tour360.planoComparativo = function (tourA, tourB, opts) {
    var o = opts || {};
    var par = Tour360.parear(tourA, tourB);
    var prontos = [];
    for (var i = 0; i < par.pares.length; i++) {
      if (par.pares[i].a.foto && par.pares[i].b.foto) prontos.push(par.pares[i]);
    }
    if (!prontos.length) return { ok: false, motivo: par.aviso || "Nenhum ponto com foto nas duas visitas.", quadros: [], poses: [] };

    var fps = Math.max(1, Math.min(60, Math.round(num(o.fps, 12))));
    var seg = Math.max(1, Math.min(30, num(o.segundosPorLado, 2.5)));
    var pitch = Math.max(-45, Math.min(45, num(o.pitch, -5)));
    var yaw = num(o.yaw, 0);
    var dataA = txt(tourA && tourA.data), dataB = txt(tourB && tourB.data);
    var n = Math.max(2, Math.round(fps * seg));

    var quadros = [], poses = [], j, k;
    for (j = 0; j < prontos.length; j++) {
      for (k = 0; k < n; k++) {
        quadros.push(dataA);
        poses.push({ pid: prontos[j].pid, nome: txt(prontos[j].nome), lado: "a", yaw: yaw, pitch: pitch, cortina: 1 });
      }
      for (k = 0; k < n; k++) {
        /* ⚠ A CORTINA VAI DE 1 A 0, NESTA ORDEM. `cortina` é a fração da tela
           ocupada pelo ANTES, medida da esquerda (é assim que o viewer
           desenha: esfera A em [0, w·cortina)). Então o trecho começa
           mostrando o ANTES inteiro e o DEPOIS entra varrendo por cima, que é
           como o olho percebe a diferença.
           Escrito ao contrário (0 → 1), cada estação começava mostrando o
           depois e terminava no antes: o vídeo contava a obra ANDANDO PARA
           TRÁS. O cabeçalho do viewer também documentava o inverso do que ele
           mesmo renderizava — o defeito estava em dois arquivos e em nenhum
           teste, porque nada afirmava o sentido. */
        quadros.push(dataB);
        poses.push({ pid: prontos[j].pid, nome: txt(prontos[j].nome), lado: "b", yaw: yaw, pitch: pitch, cortina: 1 - (k / (n - 1)) });
      }
    }
    return { ok: true, quadros: quadros, poses: poses, fps: fps, pontos: prontos.length, duracaoSeg: Math.round((quadros.length / fps) * 10) / 10 };
  };

  /* =====================================================================
   * 7. RELATÓRIO FOTOGRÁFICO
   * ================================================================== */

  Tour360.paginasRelatorio = function (tour, opts) {
    var o = opts || {};
    var ps = ((tour && tour.pontos) || []);
    var pgs = [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (o.soComFoto && !p.foto) continue;
      var hs = (p.hotspots || []).filter(function (h) {
        return !o.soAtencao || h.tipo === "atencao" || h.tipo === "pendencia";
      });
      pgs.push({
        pid: p.pid,
        nome: txt(p.nome),
        nivel: txt(p.nivel),
        foto: p.foto || null,
        tipo: txt(p.tipo) || "equirect",
        capturadoEm: txt(p.capturadoEm),
        comentarios: hs.map(function (h) {
          return { tipo: txt(h.tipo), texto: txt(h.texto), autor: txt(h.autor), em: txt(h.em), yaw: num(h.yaw, 0), pitch: num(h.pitch, 0) };
        }),
        /* ⚠ AS DUAS LISTAS, pelo funil unico (`medidasDoPonto`): a area saiu de
           `p.medidas[]` por causa da frota, e ler `p.medidas` direto aqui faria
           o relatorio calar a area de quem ja esta na versao nova. */
        medidas: Tour360.medidasDoPonto(p).map(function (m) {
          var r = Tour360.recalcular(m, p);
          var d = { tipo: txt(m.tipo), metros: r.ok ? (r.metros === undefined ? null : r.metros) : null, erroEstimadoPct: r.ok ? r.erroEstimadoPct : null, rotulo: txt(m.rotulo), problema: r.ok ? "" : txt(r.motivo) };
          /* ⚠ A AREA LEVA OS TRES NUMEROS DELA. Este formato nasceu quando toda
             medida era distancia entre dois pontos, e `metros` sai `undefined`
             para uma area: sem estes campos o documento afirmava "nao pode ser
             recalculada" sobre um m2 que o motor calculou certinho (ver
             `Rel.medidaDaPagina`, que existe por causa desse defeito). */
          if (txt(m.tipo) === "area") {
            d.area = r.ok ? (r.area === undefined ? null : r.area) : null;
            d.perimetro = r.ok ? (r.perimetro === undefined ? null : r.perimetro) : null;
            d.cantos = r.ok ? num(r.cantos, (m.cantos || []).length) : (m.cantos || []).length;
          }
          return d;
        })
      });
    }
    return pgs;
  };

  /* Resumo honesto para a capa: conta o que existe, e conta o que FALTA. */
  Tour360.resumo = function (tour) {
    var ps = ((tour && tour.pontos) || []);
    var comFoto = 0, coment = 0, atencao = 0, medidas = 0, i;
    for (i = 0; i < ps.length; i++) {
      if (ps[i].foto) comFoto++;
      var hs = ps[i].hotspots || [];
      coment += hs.length;
      for (var k = 0; k < hs.length; k++) if (hs[k].tipo === "atencao" || hs[k].tipo === "pendencia") atencao++;
      /* as DUAS listas: a area conta como medida para quem le o resumo - ela
         foi tirada com o mesmo trabalho e vale o mesmo no documento */
      medidas += Tour360.medidasDoPonto(ps[i]).length;
    }
    return {
      pontos: ps.length, comFoto: comFoto, semFoto: ps.length - comFoto,
      comentarios: coment, pontosDeAtencao: atencao, medidas: medidas,
      fotosPendentes: Tour360.fotosPendentes(tour)
    };
  };

  /* =====================================================================
   * 8. O QUE VAI PARA O CLIENTE
   *
   * Allowlist campo a campo, objeto NOVO. Nunca clone do registro: o dia em
   * que alguém acrescentar um campo interno ao ponto, ele viajaria junto sem
   * ninguém decidir nada.
   * ================================================================== */

  Tour360.paraPortal = function (tour, opts) {
    var o = opts || {};
    var t = tour || {};
    if (Tour360.estadoDe(t) === "rascunho") return null;   // só o publicado sai

    var fotoRef = typeof o.fotoDoPortal === "function" ? o.fotoDoPortal : function (f) { return f || null; };
    var ps = t.pontos || [], pontos = [], i;

    for (i = 0; i < ps.length; i++) {
      var p = ps[i];
      var f = fotoRef(p.foto);
      if (!f) continue;                    /* foto que não subiu não vira ponto vazio no Portal */
      /* ⚠ PANORAMA NUNCA VAI EMBUTIDO. `RDO.fotoDoPortal` devolve `{d: base64}`
         quando a foto não subiu mas está no registro — regra pensada para foto
         de diário, que tem 1024 px. Um equiretangular tem 4096 px e passa de
         1 MB em base64; três deles estouram os 8 MiB do retrato e o
         `_caberSnapshot` começa a CORTAR as fotos dos diários antigos para
         caber. O tour derrubaria conteúdo que não é dele. Aqui a estação
         espera a foto subir — e quem publica é avisado por `fotosPendentes`. */
      if (f.d && !f.i) continue;
      pontos.push({
        pid: txt(p.pid),
        nome: txt(p.nome),
        nivel: txt(p.nivel),
        foto: f,
        tipo: txt(p.tipo) || "equirect",
        /* a altura da câmera VAI: é ela que deixa o cliente medir. Não é
           dado sensível — é parâmetro de câmera, como o fov de uma foto. */
        alturaCam: num(p.alturaCam, 0),
        nortear: num(p.nortear, 0),
        horizonte: num(p.horizonte, 0),
        vizinhos: (p.vizinhos || []).slice(),
        /* ⚠ a POSIÇÃO na planta sai (é o pino do minimapa do cliente), a
           planta em si sai uma vez só, no nível do tour. Sem a posição, o
           cliente recebe um mapa sem pinos — pior que mapa nenhum. */
        planta: p.planta || null,
        capturadoEm: txt(p.capturadoEm),
        capturadoFonte: txt(p.capturadoFonte),
        /* a geometria da foto: é ela que deixa o Portal dizer o que é cinza e
           recusar medida fora da faixa, em vez de o cliente medir no vazio */
        panoFonte: txt(p.panoFonte),
        panoCobH: num(p.panoCobH, 0),
        panoCobV: num(p.panoCobV, 0),
        panoCentroPitch: num(p.panoCentroPitch, 0),
        comentarios: (p.hotspots || []).filter(function (h) { return h && h.paraCliente; }).map(function (h) {
          /* ⚠ TRES CAMPOS DA PENDENCIA, TRES DECISOES DIFERENTES:
             · `status` VAI. "Existe" e "ja foi resolvida" sao noticias
               diferentes para quem paga a obra, e esconder o desfecho faz o
               cliente cobrar de novo o que ja foi feito.
             · `prazo` NAO VAI. E compromisso interno; na tela de quem paga ele
               vira promessa contratual, e uma data que o escritorio nunca
               assinou passa a ser cobravel — inclusive quando a obra atrasa
               por causa do proprio cliente.
             · `responsavel` NAO VAI. E nome de pessoa, e duas empresas ja
               decidiram por escrito que o cliente delas nao ve nome de
               ninguem (ver js/portalpriv.js). */
          return { tipo: txt(h.tipo), texto: txt(h.texto), em: txt(h.em),
                   status: Tour360.ehPendencia(h) ? Tour360.statusDe(h) : "",
                   yaw: num(h.yaw, 0), pitch: num(h.pitch, 0) };
        }),
        /* ⚠ O RETRATO NAO MUDOU DE FORMA, e isso e decisao: area e distancia
           saem na MESMA lista `medidas`, porque o Portal (loja/portal.html) ja
           desenha as duas por ali e a allowlist `PORTAL_MEDIDA` ja carrega
           `cantos`, `area` e `perimetro`. A separacao em duas listas e do
           REGISTRO, para o aparelho na 1.2.56 nao tropecar nela - o retrato e
           lido por uma pagina so, servida pelo VPS, sempre atual. */
        medidas: Tour360.medidasDoPonto(p).filter(function (m) { return m && m.paraCliente; }).map(function (m) {
          var r = Tour360.recalcular(m, p);
          return {
            tipo: txt(m.tipo), rotulo: txt(m.rotulo),
            a: { yaw: num(m.a && m.a.yaw, 0), pitch: num(m.a && m.a.pitch, 0) },
            b: { yaw: num(m.b && m.b.yaw, 0), pitch: num(m.b && m.b.pitch, 0) },
            cantos: (m.cantos || []).map(function (c) { return { yaw: num(c && c.yaw, 0), pitch: num(c && c.pitch, 0) }; }),
            metros: r.ok ? (r.metros === undefined ? null : r.metros) : null,
            area: r.ok ? (r.area === undefined ? null : r.area) : null,
            perimetro: r.ok ? (r.perimetro === undefined ? null : r.perimetro) : null,
            erroEstimadoPct: r.ok ? r.erroEstimadoPct : null
          };
        })
      });
    }
    if (!pontos.length) return null;

    return {
      id: txt(t.id),
      titulo: txt(t.titulo),
      data: txt(t.data),
      publicadoEm: txt(t.publicadoEm),
      comparaCom: txt(t.comparaCom),
      planta: (function () {
        var f = t.planta && t.planta.foto ? fotoRef(t.planta.foto) : null;
        if (!f || (f.d && !f.i)) return null;      /* mesma regra da foto 360 */
        return { foto: f, nome: txt(t.planta.nome) };
      })(),
      pontos: pontos
    };
  };

  /* ⚠ O cadeado do gate: varre o bloco publicado e devolve todo campo que
     não está na lista do que foi DECIDIDO mandar. Campo novo no ponto nasce
     reprovado até alguém escrever aqui que ele pode sair da máquina. */
  Tour360.PORTAL_TOUR = ["id", "titulo", "data", "publicadoEm", "comparaCom", "planta", "pontos"];
  /* ⚠ OS QUATRO CAMPOS DE PANORAMA SÃO PARÂMETRO DE CÂMERA, e saem pela mesma
     régua já escrita para `alturaCam`: quantos graus a foto cobre não é dado de
     ninguém, é propriedade do arquivo que o cliente está olhando — e sem eles a
     tela dele não consegue nem escrever "o cinza não foi fotografado" nem
     recusar uma medida no vazio. São ESCALARES de propósito: `Tour360.auditar`
     não desce no interior de objeto novo, então um `cobertura: {...}` abriria
     buraco no cadeado em vez de passar por ele. */
  Tour360.PORTAL_PONTO = ["pid", "nome", "nivel", "foto", "tipo", "alturaCam", "nortear", "horizonte", "vizinhos", "planta", "capturadoEm", "capturadoFonte", "comentarios", "medidas", "panoFonte", "panoCobH", "panoCobV", "panoCentroPitch"];
  /* ⚠ E AS LISTAS DOS NÍVEIS DE BAIXO. Sem elas o cadeado só olhava `tour.*` e
     `ponto.*`: um campo acrescentado DENTRO de um comentário (o autor, o
     telefone de quem reclamou) ou dentro de uma medida passava limpo, e é
     justamente aí que mora o texto escrito por gente. O ponto mais fundo do
     retrato é o que menos parece perigoso. */
  Tour360.PORTAL_COMENTARIO = ["tipo", "texto", "em", "status", "yaw", "pitch"];
  /* ⚠ `cantos`, `area` e `perimetro` entram porque a medida de ÁREA precisa
   chegar inteira ao cliente: sem os cantos ele recebe um número que não
   consegue conferir na foto, e número que não dá para conferir é pior que
   número nenhum. `a` e `b` continuam para as medidas de dois pontos. */
Tour360.PORTAL_MEDIDA = ["tipo", "rotulo", "a", "b", "cantos", "metros", "area", "perimetro", "erroEstimadoPct"];
  Tour360.PORTAL_FOTO = ["i", "t", "leg", "d"];   /* o formato de RDO.fotoDoPortal */

  Tour360.auditar = function (bloco) {
    var achados = [], k, i;
    if (!bloco) return achados;

    function varrer(obj, permitidos, rotulo) {
      if (!obj) return;
      for (var c in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, c)) continue;
        if (permitidos.indexOf(c) === -1) achados.push(rotulo + "." + c);
      }
    }
    function varrerLista(lista, permitidos, rotulo) {
      var l = lista || [];
      for (var z = 0; z < l.length; z++) varrer(l[z], permitidos, rotulo);
    }

    varrer(bloco, Tour360.PORTAL_TOUR, "tour");
    var ps = bloco.pontos || [];
    for (i = 0; i < ps.length; i++) {
      varrer(ps[i], Tour360.PORTAL_PONTO, "ponto");
      varrerLista(ps[i] && ps[i].comentarios, Tour360.PORTAL_COMENTARIO, "comentario");
      varrerLista(ps[i] && ps[i].medidas, Tour360.PORTAL_MEDIDA, "medida");
      if (ps[i] && ps[i].foto && typeof ps[i].foto === "object") varrer(ps[i].foto, Tour360.PORTAL_FOTO, "foto");
    }
    return achados;
  };

  global.Tour360 = Tour360;
  if (typeof module !== "undefined" && module.exports) module.exports = Tour360;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
