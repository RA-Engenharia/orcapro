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
 * ⚠ DEZ COISAS QUE NÃO PODEM SER "SIMPLIFICADAS"
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
 *
 * 8. O ANTES-E-DEPOIS OLHA PARA A MESMA PAREDE. O comparativo em papel
 *    (PARTE 1C) recorta as duas visitas no MESMO rumo corrigido — e o rumo
 *    corrigido só vira pixel depois de somar o `nortear` DE CADA LADO. Sem
 *    isso, duas visitas em que o fotógrafo começou o giro de lados diferentes
 *    saem lado a lado mostrando paredes OPOSTAS, e o cliente lê "mudança"
 *    onde não houve nenhuma. É o mesmo defeito que a PARTE 2 já documenta no
 *    vídeo, agora no material impresso.
 *    E a ordem ANTES → DEPOIS sai da DATA, não da ordem dos argumentos:
 *    invertida, o documento conta a obra andando para trás — a alvenaria
 *    "demolida", o reboco "arrancado".
 *
 * 9. PENDÊNCIA QUE SE ARRASTA TEM DE SALTAR AOS OLHOS. "Aberta" sozinho não
 *    diz se é de ontem ou do começo da obra; quem lê trata as vinte linhas
 *    como iguais e nada acontece. A PARTE 1D ordena pelo que atrasa, carimba
 *    "ARRASTA-SE HÁ N VISITAS · DESDE dd/mm" e destaca a linha — é isso que
 *    faz a reunião de obra ter assunto.
 *    ⚠ E o número de visitas SÓ APARECE quando o histórico foi consultado.
 *      Sem a lista das visitas anteriores, o documento DIZ que não consultou
 *      em vez de escrever "1 visita" — que seria mentira confortável,
 *      exatamente sobre a pendência mais velha da obra.
 *
 * 10. ÁREA NÃO É DISTÂNCIA, E O PAPEL PRECISA MOSTRAR OS TRÊS NÚMEROS.
 *    m², perímetro e a faixa de erro. Área eleva o erro ao quadrado (um lado
 *    com ±10% vira uma área com ~±21%), e é dela que sai quantidade de
 *    contrapiso, de pintura e de forro — linha de orçamento e de boletim. E o
 *    recorte sai com o POLÍGONO desenhado: sem ele, ninguém confere se o
 *    número se refere à sala inteira ou a um pedaço.
 *    ⚠ Quem mede uma sala está DENTRO dela: os cantos costumam abrir mais de
 *      180°, e nenhuma vista única os enquadra. Nesse caso o documento
 *      DECLARA e mostra o panorama inteiro com o polígono por cima, em vez de
 *      cortar dois cantos fora e deixar a figura mentindo.
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
  /* O limite de erro é sempre o do motor, nunca escrito à mão aqui: documento
     e tela discordando na fronteira é o pior tipo de divergência, porque só
     aparece num valor. */
  function limiteErro() { return M() ? num(M().ERRO_AVISO_PCT, 10) : 10; }

  /* ⚠ O REGISTRO TEM DUAS LISTAS DE MEDIDA, E O DOCUMENTO LE AS DUAS.
     `p.medidas[]` guarda distancia e altura; `p.areas[]` guarda area. A
     separacao existe por causa da frota - o motor da 1.2.56, ainda instalado,
     le uma area de dentro de `medidas` como distancia entre dois pontos que nao
     existem e devolve "0,00 m +-0%" (o roteiro inteiro esta em
     `Tour360.medidasDoPonto`, js/tour360.js).
     A REGRA MORA NO MOTOR, NUNCA COPIADA AQUI: um segundo `concat` neste
     arquivo seria a replica que apodrece - o dia em que a ordem das duas listas
     mudar, o recorte enquadrado passa a apontar para a medida errada, porque as
     chaves do recorte sao POSICIONAIS (`Rel.chaveRecorte(pid, "m", i)`).
     Sem motor nao ha relatorio nenhum (ver a primeira linha de `Rel.html`), e
     por isso devolver lista vazia aqui e honesto. */
  function medidasCruas(ponto) { return M() ? M().medidasDoPonto(ponto) : []; }

  /* ÁREA — item 10 do cabeçalho. Três números, não um: m², perímetro e a
     faixa. E o perímetro sai junto de propósito: é ele que a pessoa consegue
     conferir com trena (um lado por vez), e é por ele que se descobre que a
     área está errada antes de virar quantidade de contrapiso. */
  Rel.textoArea = function (medida) {
    var m = medida || {};
    var rotulo = txt(m.rotulo);
    var cantos = num(m.cantos, 0);

    if (txt(m.problema) || m.area == null) {
      return {
        tipo: "Área", rotulo: rotulo, valor: "—", perimetro: "", cantos: cantos,
        precisao: "", aproximada: false, area: null,
        problema: txt(m.problema) || "Esta área não pôde ser recalculada com os dados atuais deste ponto."
      };
    }

    var a = num(m.area, 0);
    var pct = num(m.erroEstimadoPct, 0);
    var ap = pct > limiteErro();
    var meia = a * pct / 100;

    return {
      tipo: "Área",
      rotulo: rotulo,
      area: a,
      cantos: cantos,
      valor: (ap ? "~ " : "") + numBR(a, 2) + " m²",
      perimetro: m.perimetro == null ? "" : (numBR(num(m.perimetro, 0), 2) + " m"),
      /* ⚠ A FAIXA DA ÁREA É MAIS LARGA QUE A DE UMA DISTÂNCIA, e é isso que o
         papel precisa mostrar: o erro entra nos dois eixos e sai ao quadrado.
         Escrever só "18,40 m²" faz virar quantidade contratual. */
      precisao: ap
        ? ("entre " + numBR(a - meia, 2) + " m² e " + numBR(a + meia, 2) + " m² (±" + numBR(pct, 1) + "%)")
        : ("±" + numBR(pct, 1) + "%"),
      aproximada: ap,
      problema: ""
    };
  };

  Rel.textoMedida = function (medida) {
    var m = medida || {};
    if (txt(m.tipo) === "area") return Rel.textoArea(m);
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
    var ap = pct > limiteErro();
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

  /* A medida da página, ENRIQUECIDA — e o motivo de ela existir.
   *
   * `Tour360.paginasRelatorio` devolve `{tipo, metros, erroEstimadoPct,
   * rotulo, problema}`: um formato que nasceu quando toda medida era uma
   * distância entre DOIS pontos. A área não cabe ali — ela tem m², perímetro
   * e uma contagem de cantos, e `metros` sai `undefined`.
   *
   * ⚠ O ROTEIRO DO DEFEITO. Sem esta função, uma área gravada chegava ao
   *   relatório com `metros == null` e saía na tabela como "—" e a frase
   *   "não pôde ser recalculada" — ou seja: a pessoa marcou os cantos da
   *   sala, o motor calculou 18,40 m² certinho, e o documento afirmava que a
   *   medida tinha falhado. Afirmação errada sobre um número que vira
   *   quantidade de contrapiso.
   *
   * Por isso a área é recalculada AQUI, do registro cru (`medidasCruas(ponto)[i]`
   * — as duas listas do ponto, ver o ⚠ de `medidasCruas`),
   * com `Tour360.recalcular` — que já conhece o tipo "area" e já aplica a
   * altura da estação. Se um dia `paginasRelatorio` passar a devolver `area`,
   * este caminho sai de cena sozinho (o `if` abaixo), sem migração nenhuma. */
  Rel.medidaDaPagina = function (pg, ponto, i) {
    var daPg = ((pg && pg.medidas) || [])[i] || null;
    var crua = medidasCruas(ponto)[i] || null;
    var tipo = txt(crua && crua.tipo) || txt(daPg && daPg.tipo);

    if (tipo !== "area") return daPg || { tipo: tipo, metros: null, rotulo: "", problema: "" };
    if (daPg && daPg.area != null) return daPg;      /* o motor já entrega pronto */

    var rotulo = txt(crua && crua.rotulo) || txt(daPg && daPg.rotulo);
    var quantos = ((crua && crua.cantos) || []).length;
    if (!M() || !crua) {
      return {
        tipo: "area", rotulo: rotulo, area: null, perimetro: null, cantos: quantos,
        problema: txt(daPg && daPg.problema) || "Esta área não pôde ser recalculada nesta página."
      };
    }
    var r = M().recalcular(crua, ponto);
    return {
      tipo: "area",
      rotulo: rotulo,
      area: r.ok ? r.area : null,
      perimetro: r.ok ? r.perimetro : null,
      erroEstimadoPct: r.ok ? r.erroEstimadoPct : null,
      cantos: r.ok ? num(r.cantos, quantos) : quantos,
      problema: r.ok ? "" : txt(r.motivo)
    };
  };

  /* Todas as medidas de uma estação já enriquecidas, na ordem do registro. */
  Rel.medidasDaPagina = function (pg, ponto) {
    var n = ((pg && pg.medidas) || []).length;
    var crus = medidasCruas(ponto).length;
    if (crus > n) n = crus;
    var fora = [], i;
    for (i = 0; i < n; i++) fora.push(Rel.medidaDaPagina(pg, ponto, i));
    return fora;
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

  /* O panorama inteiro, para quando o polígono da área não cabe em vista
     nenhuma (item 10 do cabeçalho). 2:1 porque é a proporção da própria
     equiretangular: qualquer outra esticaria a foto e entortaria o polígono
     junto — e o documento estaria mostrando uma sala com o formato errado. */
  Rel.PANORAMA_LARGURA = 900;
  Rel.PANORAMA_ALTURA = 450;

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

  /* O enquadramento de um POLÍGONO (a área). Mesma ideia do de dois pontos,
     com N cantos — e a mesma honestidade: quando não cabe, `coube` volta
     false para o documento poder dizer isso.

     ⚠ O CENTRO SAI POR DIFERENÇA, NUNCA POR MÉDIA DE YAW. Média de ângulo é
       errada na emenda: cantos em −170° e +170° têm média 0° — o lado
       exatamente OPOSTO ao que se quer ver. Aqui tudo é medido em relação ao
       primeiro canto, com `difYaw`, e o centro volta somado a ele.

     ⚠ E QUEM MEDE UMA SALA ESTÁ DENTRO DELA: é comum os cantos abrirem mais
       de 180°, e aí nenhuma vista única enquadra. `coube:false` é o caso
       NORMAL da área, não a exceção — ver o item 10 do cabeçalho. */
  Rel.enquadramentoPoligono = function (cantos, opts) {
    var o = opts || {};
    var cs = cantos || [];
    if (cs.length < 2) {
      return Rel.enquadramento(cs[0] || { yaw: 0, pitch: 0 }, null, o);
    }
    var larg = num(o.largura, Rel.RECORTE_LARGURA);
    var alt = num(o.altura, Rel.RECORTE_ALTURA);
    var prop = (larg > 0 && alt > 0) ? (alt / larg) : 0.667;

    var ref = num(cs[0].yaw, 0);
    var dMin = 0, dMax = 0, pMin = num(cs[0].pitch, 0), pMax = pMin, i, d, p;
    for (i = 1; i < cs.length; i++) {
      d = M() ? M().difYaw(ref, num(cs[i].yaw, 0)) : (num(cs[i].yaw, 0) - ref);
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
      p = num(cs[i].pitch, 0);
      if (p < pMin) pMin = p;
      if (p > pMax) pMax = p;
    }
    var yaw = M() ? M().normalizarYaw(ref + (dMin + dMax) / 2) : (ref + (dMin + dMax) / 2);
    var pitch = (pMin + pMax) / 2;

    /* 1,25 de folga: menos que a da medida de dois pontos porque o polígono
       já ocupa o miolo do quadro; muito mais que isso desperdiça pixel justo
       onde o canto precisa ser reconhecível. */
    var precisaH = (dMax - dMin) * 1.25;
    var precisaV = (pMax - pMin) * 1.25;
    var porV = prop > 0 ? (precisaV / prop) : precisaV;
    var querido = Math.max(num(o.fov, Rel.RECORTE_FOV), precisaH, porV);
    return {
      yaw: yaw, pitch: pitch,
      fov: limitar(querido, 20, Rel.RECORTE_FOV_MAX),
      coube: querido <= Rel.RECORTE_FOV_MAX,
      precisava: Math.round(querido)
    };
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

    /* ÁREA: o pedido vem com o polígono, e o enquadramento é outro. */
    var poli = (o.poligono && o.poligono.length >= 3) ? o.poligono : null;
    var enq, panorama = false;
    if (poli) {
      enq = Rel.enquadramentoPoligono(poli, { fov: o.fov, largura: W, altura: Himg });
      if (!enq.coube) {
        /* ⚠ NÃO COUBE = PANORAMA INTEIRO, E O DOCUMENTO DECLARA (item 10).
           A alternativa seria recortar assim mesmo: sairia um polígono com
           dois cantos fora do quadro, com cara de figura completa, e o m² ao
           lado passaria a se referir a uma sala que a imagem não mostra.
           Com fov de 360° a janela cobre a equiretangular inteira e nenhum
           canto fica de fora — a mesma conta, sem exceção nova. */
        panorama = true;
        W = Math.round(num(o.larguraPano, Rel.PANORAMA_LARGURA));
        Himg = Math.round(num(o.alturaPano, Rel.PANORAMA_ALTURA));
        enq = { yaw: 0, pitch: 0, fov: 360, coube: false, precisava: enq.precisava };
      }
    } else {
      enq = Rel.enquadramento({ yaw: o.yaw, pitch: o.pitch }, o.b || null, { fov: o.fov, largura: W, altura: Himg });
    }
    var H = Himg + faixa;

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
    var pa = null, pb = null;

    if (poli) {
      desenharPoligono(g, j, W, Himg, poli, cor, txt(o.valor));
    } else if (o.semMarca) {
      /* ⚠ SEM MARCA QUANDO NÃO HÁ O QUE MARCAR. O recorte do antes-e-depois
         (PARTE 1C) é enquadrado por RUMO — muitas vezes só o norte da
         estação, sem apontamento nenhum. Um anel no meio da foto ali marca o
         nada e é lido como "olhe aqui": quem recebe procura o problema que o
         círculo indica e não encontra, e passa a desconfiar de todos os
         outros círculos do documento, inclusive os que apontam trinca. */
      pa = null;
    } else {
    pa = noRecorte(j, W, Himg, o.yaw, o.pitch);
    pb = o.b ? noRecorte(j, W, Himg, o.b.yaw, o.b.pitch) : null;

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
    }

    Rel.carimbar(g, W, H, faixa, {
      obra: o.obra,
      linha2: o.linha2 || (txt(o.estacao) + (txt(o.data) ? " · " + txt(o.data) : "")),
      rotulo: o.rotulo
    });

    var uri = "";
    try { uri = cv.toDataURL("image/jpeg", Rel.RECORTE_QUALIDADE); } catch (e) { uri = ""; }
    if (!uri) return { ok: false, codigo: "exportar", motivo: "Não consegui exportar o recorte." };
    return {
      ok: true, dataURI: uri, fov: Math.round(enq.fov), coube: enq.coube,
      /* `panorama` é o que o documento lê para DIZER que aquela figura é a
         foto inteira, e não um recorte: legenda errada aqui faz o leitor
         achar que a sala tem o formato da equiretangular esticada. */
      panorama: panorama, largura: W, altura: H
    };
  };

  /* O polígono da área desenhado sobre a foto.
   *
   * ⚠ LADO COM UMA PONTA FORA DA VISTA NÃO É DESENHADO. Ligar um canto
   *   visível a um canto que está atrás do fotógrafo produz uma reta que
   *   atravessa a imagem por onde a sala não passa — e quem lê mede aquela
   *   linha com a régua da tela. Sem as duas pontas à vista, o lado some e o
   *   documento fica com a figura incompleta, que é o que ela é. (Com o
   *   panorama inteiro isso não acontece: lá todos os cantos entram.) */
  function desenharPoligono(g, j, W, H, cantos, cor, valor) {
    var pts = [], i, p, dentro = 0;
    for (i = 0; i < cantos.length; i++) {
      p = noRecorte(j, W, H, num(cantos[i] && cantos[i].yaw, 0), num(cantos[i] && cantos[i].pitch, 0));
      if (p) dentro++;
      pts.push(p);
    }
    if (!dentro) return;

    var todos = dentro === pts.length;
    if (todos) {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      /* preenchimento translúcido: o piso continua visível por baixo, e é o
         piso que a pessoa confere para saber se o polígono é a sala mesmo */
      g.globalAlpha = 0.16;
      g.fillStyle = cor;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 5; g.strokeStyle = "rgba(0,0,0,.55)"; g.stroke();
      g.lineWidth = 2.4; g.strokeStyle = cor; g.stroke();
    } else {
      for (i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if (!a || !b) continue;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        g.lineWidth = 5; g.strokeStyle = "rgba(0,0,0,.55)"; g.stroke();
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        g.lineWidth = 2.4; g.strokeStyle = cor; g.stroke();
      }
    }

    var sx = 0, sy = 0;
    for (i = 0; i < pts.length; i++) {
      if (!pts[i]) continue;
      anel(g, pts[i].x, pts[i].y, 5, cor);
      sx += pts[i].x; sy += pts[i].y;
    }
    if (txt(valor)) {
      /* o rótulo vai no meio dos cantos VISÍVEIS, preso à imagem: solto na
         borda ele sai cortado na impressão */
      etiqueta(g, limitar(sx / dentro, 70, W - 70), limitar(sy / dentro, 16, H - 16), txt(valor), cor);
    }
  }

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
  function agora() { return (global.Date && global.Date.now) ? global.Date.now() : new Date().getTime(); }

  /* O LAÇO ÚNICO DOS RECORTES — e por que ele é único.
   *
   * Três documentos precisam recortar foto (o fotográfico, o de pendências e
   * o comparativo), e o laço é o lugar onde moram as três regras que não
   * podem cair: uma imagem decodificada por vez (item 4 do cabeçalho: 40
   * panoramas de uma vez passam de 1 GB e o navegador mata a aba), o teto de
   * recortes por documento e o prazo. Uma cópia deste laço em cada documento
   * seria a "réplica que apodrece": a primeira correção entra num, e os
   * outros dois continuam derrubando a aba do cliente.
   *
   * `grupos` = [{ dataURI, pedidos:[{chave, opts}] }] — já filtrado por quem
   * chama (foto que existe, foto que é 360). Sempre resolve.
   */
  function montarRecortes(grupos, opts) {
    var o = opts || {};
    /* `marcas` guarda o que cada figura É (recorte enquadrado ou panorama
       inteiro). Sem isso a legenda teria de adivinhar, e legenda que adivinha
       vira afirmação errada sobre uma imagem — a foto inteira descrita como
       "recorte de 60°" faz o leitor achar que a sala tem o formato da
       equiretangular esticada. */
    var saida = { recortes: {}, marcas: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 };
    if (!M()) return Promise.resolve(saida);
    if (!global.document || typeof global.document.createElement !== "function") return Promise.resolve(saida);

    var gs = grupos || [];
    var limite = Math.max(0, Math.round(num(o.maxRecortes, Rel.MAX_RECORTES)));
    var prazo = agora() + num(o.prazoMs, Rel.PRAZO_RECORTES_MS);
    var i = 0;

    function proximo() {
      if (i >= gs.length) return Promise.resolve(saida);
      var g = gs[i++];
      if (!g || !g.dataURI || !g.pedidos || !g.pedidos.length) return proximo();

      if (agora() > prazo) { saida.estourouPrazo = true; saida.pulados += g.pedidos.length; return proximo(); }

      return carregarImagem(g.dataURI).then(function (img) {
        if (!img) { saida.pulados += g.pedidos.length; return null; }
        for (var k = 0; k < g.pedidos.length; k++) {
          if (saida.feitos >= limite) { saida.cortadoPeloTeto++; continue; }
          var r = Rel.recorte(img, g.pedidos[k].opts);
          if (r && r.ok) {
            saida.recortes[g.pedidos[k].chave] = r.dataURI;
            saida.marcas[g.pedidos[k].chave] = { panorama: !!r.panorama, coube: r.coube !== false, fov: num(r.fov, 0) };
            saida.feitos++;
          } else {
            saida.pulados++;
          }
        }
        /* ⚠ soltar a referência aqui é o que impede a soma dos panoramas
           ficar viva até o fim do laço */
        img = null;
        return null;
      })["catch"](function () { saida.pulados += g.pedidos.length; return null; }).then(proximo);
    }

    return proximo()["catch"](function () { return saida; });
  }

  Rel.recortesDoTour = function (tour, fotos, opts) {
    var o = opts || {};
    if (!M()) return Promise.resolve({ recortes: {}, marcas: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 });

    var t = tour || {};
    var mapaFotos = fotos || {};
    var pgs = M().paginasRelatorio(t, { soComFoto: !!o.soComFoto, soAtencao: !!o.soAtencao });
    var grupos = [], i;
    for (i = 0; i < pgs.length; i++) {
      var pg = pgs[i];
      var dataURI = Object.prototype.hasOwnProperty.call(mapaFotos, pg.pid) ? mapaFotos[pg.pid] : "";
      /* ⚠ SÓ 360 RECORTA POR ÂNGULO: numa foto comum o yaw do apontamento não
         quer dizer pixel nenhum (ver a recusa "nao-equirect" em Rel.recorte). */
      if (!dataURI || txt(pg.tipo) !== "equirect") continue;
      var pedidos = Rel.apontamentosDe(t, pg, o);
      if (!pedidos.length) continue;
      grupos.push({ dataURI: dataURI, pedidos: pedidos });
    }
    return montarRecortes(grupos, o);
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
    /* ⚠ AS DUAS LISTAS, na MESMA ordem de `medidasDaPagina` - e aqui a ordem
       nao e estetica: a chave do recorte e posicional
       (`Rel.chaveRecorte(pid, "m", i)`), entao ler `ponto.medidas` sozinho
       faria o poligono da area nunca ser recortado e, pior, as chaves da
       tabela e as do desenho apontarem para linhas diferentes. */
    var ms = medidasCruas(ponto);
    for (i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (!m) continue;
      var d = Rel.textoMedida(Rel.medidaDaPagina(pg, ponto, i));

      /* ÁREA — o pedido leva o POLÍGONO, não duas pontas (item 10 do
         cabeçalho). Sem a figura desenhada, o m² ao lado da foto é um número
         sem contorno: ninguém confere se ele é a sala inteira ou um pedaço. */
      if (txt(m.tipo) === "area") {
        var cantos = m.cantos || [];
        if (cantos.length < 3) continue;
        lista.push({
          chave: Rel.chaveRecorte(pg.pid, "m", i),
          opts: {
            poligono: cantos,
            cor: d.aproximada ? "#f59e0b" : "#22c55e",
            valor: d.valor,
            obra: obra, linha2: linha2,
            rotulo: "Área" + (txt(m.rotulo) ? " — " + txt(m.rotulo) : "")
          }
        });
        continue;
      }

      if (!m.a || !m.b) continue;
      lista.push({
        chave: Rel.chaveRecorte(pg.pid, "m", i),
        opts: {
          yaw: num(m.a.yaw, 0), pitch: num(m.a.pitch, 0),
          b: { yaw: num(m.b.yaw, 0), pitch: num(m.b.pitch, 0) },
          cor: d.aproximada ? "#f59e0b" : "#22c55e",
          valor: d.valor,
          obra: obra, linha2: linha2,
          rotulo: d.tipo + (txt(m.rotulo) ? " — " + txt(m.rotulo) : "")
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

  function blocoMedidas(pg, ponto, recortes, marcas) {
    /* ⚠ A LISTA VEM ENRIQUECIDA, não direto de `pg.medidas`: é onde a ÁREA
       ganha m² e perímetro. Ver `Rel.medidaDaPagina` e o roteiro do defeito
       que ela conserta (área saindo como "não pôde ser recalculada"). */
    var lista = Rel.medidasDaPagina(pg, ponto);
    if (!lista.length) return "";
    var pid = txt(pg && pg.pid);
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
      var celula = esc(d.valor);
      /* o perímetro e a contagem de cantos vão JUNTO do m² (item 10): é pelo
         perímetro que se confere a área com trena, um lado por vez */
      if (d.tipo === "Área" && (d.perimetro || d.cantos)) {
        celula += '<div style="font-weight:400;font-size:9.5px;color:#475569;margin-top:1px">'
          + (d.perimetro ? "perímetro " + esc(d.perimetro) : "")
          + ((d.perimetro && d.cantos) ? " · " : "")
          + (d.cantos ? esc(d.cantos + (d.cantos === 1 ? " canto" : " cantos")) : "")
          + "</div>";
      }
      h += '<tr style="background:' + fundo + '">'
        + '<td style="border:1px solid #bbb;padding:4px 6px"><b>' + esc(d.tipo) + "</b>" + (d.rotulo ? " — " + esc(d.rotulo) : "") + "</td>"
        + '<td style="border:1px solid #bbb;padding:4px 6px;text-align:center;font-weight:700' + (d.aproximada ? ";color:#7c2d12" : "") + '">' + celula + "</td>"
        + '<td style="border:1px solid #bbb;padding:4px 6px;font-size:10px;color:#475569">' + esc(d.problema || d.precisao) + "</td>"
        + "</tr>";
      var chv = Rel.chaveRecorte(pid, "m", i);
      var uri = pegar(recortes || {}, chv);
      if (uri) {
        var marca = (marcas && Object.prototype.hasOwnProperty.call(marcas, chv)) ? marcas[chv] : null;
        comRecorte.push({
          uri: uri,
          rotulo: esc(d.tipo) + (d.rotulo ? " — " + esc(d.rotulo) : "") + ": " + esc(d.valor)
            /* ⚠ a legenda DIZ quando a figura é o panorama inteiro: quem mede
               uma sala está dentro dela, e aí nenhuma vista única enquadra os
               cantos. Chamar a foto inteira de "recorte" faria o leitor achar
               que a sala tem o formato esticado da equiretangular. */
            + (marca && marca.panorama ? " (panorama inteiro — os cantos não cabem numa vista só)" : "")
        });
      }
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

  function paginaHTML(pg, fotos, dataVisita, ultima, recortes, ponto, marcas) {
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
      + blocoMedidas(pg, ponto, recortes, marcas);
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

    /* ⚠ O QUE ANDA VEM ANTES DAS FOTOS. O relatório fotográfico contava o DIA
       e nunca o que atravessa: a fissura marcada em agosto reaparecia em
       setembro como mais um comentário no meio de trinta páginas, e ninguém
       via que ela era a mesma. Esta tabela é a lista do que continua aberto,
       ordenada pelo que atrasa — e ela vem no ALTO porque é o que a reunião
       de obra lê primeiro. Ver a PARTE 1D. */
    h += Rel.tabelaPendencias(t, o);

    if (!pgs.length) {
      return h + caixaAviso("<b>Não há nada para mostrar neste relatório.</b> "
        + (o.soComFoto ? "Nenhum ponto deste tour tem foto." : "Este tour ainda não tem ponto nenhum."));
    }

    /* A nota das medidas só entra quando existe medida aproximada: aviso que
       aparece sempre vira moldura e a pessoa para de ler. */
    var temAprox = false, temArea = false;
    for (i = 0; i < pgs.length; i++) {
      var ms = Rel.medidasDaPagina(pgs[i], M().pontoDe(t, pgs[i].pid));
      for (var k = 0; k < ms.length; k++) {
        var dk = Rel.textoMedida(ms[k]);
        if (dk.aproximada) temAprox = true;
        if (dk.tipo === "Área") temArea = true;
      }
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
    var temRodape = temAprox || temNotaData || temRecorte || temArea;

    h += '<div style="border-top:1px solid #ddd;margin:12px 0 0"></div>';
    for (i = 0; i < pgs.length; i++) {
      h += paginaHTML(pgs[i], fotos, t.data, i === pgs.length - 1 && !temRodape, recortes, M().pontoDe(t, pgs[i].pid), o.marcasRecorte || {});
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

    /* ⚠ A ÁREA GANHA NOTA PRÓPRIA, e não é enfeite: é dela que sai quantidade
       de contrapiso, de pintura e de forro — linha de orçamento e de boletim.
       O erro dela não é o erro de uma distância: entra nos dois eixos e sai
       ao quadrado (um lado com ±10% vira uma área com cerca de ±21%). Sem
       esta linha, quem lê aplica à área a mesma confiança que aplica a uma
       distância, e a diferença aparece no fechamento da medição. */
    if (temArea) {
      h += '<div style="page-break-inside:avoid;margin-top:8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;padding:8px 10px;font-size:10.5px;color:#334155">'
        + "<b>Sobre as áreas (m²)</b><br>"
        + "A área sai dos cantos marcados no piso dentro da foto 360 e da altura em que a câmera estava — não de trena e não de projeto. "
        + "Ela acumula o erro dos DOIS eixos, então é sempre menos confiável que uma distância: um lado com ±10% vira uma área com cerca de ±21%. "
        + "O perímetro sai ao lado do m² justamente para isso — confira um lado com trena antes de usar o número em medição ou em contrato."
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
        /* o que cada figura É (recorte enquadrado ou panorama inteiro): a
           legenda do documento sai daqui, nunca de suposição */
        marcasRecorte: rc.marcas || {},
        soComFoto: !!o.soComFoto,
        soAtencao: !!o.soAtencao,
        obraNome: o.obraNome,
        local: o.local,
        autor: o.autor,
        /* o histórico das visitas, quando a tela souber passar: é o que
           permite dizer "há 4 visitas" em vez de "aberta" (PARTE 1D) */
        tours: o.tours,
        hoje: o.hoje
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
   * PARTE 1C — O ANTES-E-DEPOIS EM PAPEL
   *
   * O DEFEITO QUE ISTO CONSERTA. A comparação entre duas visitas só existia
   * DENTRO da tela: a cortina que o engenheiro arrasta com o dedo. O material
   * que sai para a reunião, para o cliente e para o processo — o PDF — não
   * tinha nada disso. A obra andava, o tour registrava, e o documento
   * continuava mostrando um dia isolado. Quem recebe não tem o aplicativo
   * aberto na frente: tem uma folha na mão.
   *
   * ⚠ AS DUAS FOTOS OLHAM PARA A MESMA PAREDE — item 8 do cabeçalho. O rumo é
   *   escolhido UMA vez, no espaço CORRIGIDO (já descontado o `nortear` de
   *   cada estação), e só então vira pixel em cada lado somando o `nortear`
   *   daquele lado. É o inverso exato de `Tour360.corrigir`.
   *   O roteiro do defeito: em agosto o fotógrafo começou o giro virado para
   *   a fachada, em setembro virado para o fundo. Sem a correção, a página
   *   "antes e depois" mostra duas paredes DIFERENTES, lado a lado, com as
   *   datas embaixo — e o cliente lê como mudança o que é só o fotógrafo
   *   tendo começado de outro lado. É o mesmo defeito que a PARTE 2 já
   *   documenta na cortina do vídeo.
   *
   * ⚠ E A ORDEM É A DATA, NÃO A ORDEM DOS ARGUMENTOS. Chamar
   *   `abrirComparativo(setembro, agosto)` faria o documento rotular setembro
   *   como "ANTES": a alvenaria apareceria demolida, o reboco arrancado, a
   *   obra andando para trás. Quem chama passa duas visitas; quem decide qual
   *   é o antes é o calendário.
   *
   * ⚠ ESTAÇÃO QUE SÓ EXISTE DE UM LADO SAI DECLARADA. Sumir com ela deixaria
   *   o documento aparentemente completo e faltando justamente o ponto novo
   *   (ou o ponto que deixou de ser fotografado) — que é onde a conversa
   *   costuma estar.
   * ================================================================== */

  Rel.chaveComparativo = function (pid, lado) { return "cmp:" + txt(lado) + "|" + txt(pid); };

  /* Quem é o antes e quem é o depois: decide a DATA. */
  Rel.ordenarVisitas = function (tourA, tourB) {
    var a = tourA || {}, b = tourB || {};
    var da = txt(a.data), db = txt(b.data);
    if (da && db && db < da) return { antes: b, depois: a, trocou: true };
    return { antes: a, depois: b, trocou: false };
  };

  /* O inverso de `Tour360.corrigir`: rumo corrigido -> ângulo BRUTO daquela
     foto, que é o único que quer dizer pixel dentro dela. */
  Rel.brutoDoLado = function (dir, ponto) {
    var p = ponto || {};
    var y = num(dir && dir.yaw, 0) + num(p.nortear, 0);
    return {
      yaw: M() ? M().normalizarYaw(y) : y,
      pitch: limitar(num(dir && dir.pitch, 0) + num(p.horizonte, 0), -90, 90)
    };
  };

  /* Escolhe o apontamento que vale a pena enquadrar numa estação: pendência
     aberta primeiro (é o que a reunião discute), depois qualquer apontamento.
     Devolve null quando não há nenhum — e aí o rumo é o norte da estação.
   *
   * ⚠ SÓ APONTAMENTO NATIVO DESTA FOTO DECIDE RUMO, e este é o roteiro do
   *   defeito. `Tour360.carregarPendencias` copia o `yaw` da pendência que
   *   atravessa a visita EXATAMENTE como ele estava — e o yaw é o ângulo
   *   BRUTO da foto ANTIGA. Enquanto as duas visitas têm o mesmo `nortear`
   *   (o caso normal, porque `basearEm` copia), tudo bate. Mas quando o
   *   fotógrafo começa o giro de outro lado e alguém corrige o norte da
   *   estação nova, o ângulo copiado passa a apontar para outra parede — e
   *   enquadrar o comparativo por ele mandaria as DUAS fotos para o lugar
   *   errado, com o texto da fissura embaixo. Apontamento nativo é o que tem
   *   `origemHid` vazio ou igual ao próprio `hid`: esse foi marcado clicando
   *   NESTA foto, e o ângulo dele é desta foto.
   *   (A cópia do ângulo bruto entre visitas é do motor, js/tour360.js, e
   *   está anotada nas pendências desta entrega — aqui só não se depende
   *   dela.) */
  function nativo(h) {
    var o = txt(h && h.origemHid);
    return !o || o === txt(h && h.hid);
  }

  function apontamentoDeInteresse(ponto) {
    var hs = (ponto && ponto.hotspots) || [], i;
    if (!M()) return null;
    for (i = 0; i < hs.length; i++) {
      if (nativo(hs[i]) && M().ehPendencia(hs[i]) && M().statusDe(hs[i]) !== "resolvida") return hs[i];
    }
    for (i = 0; i < hs.length; i++) if (nativo(hs[i]) && M().ehPendencia(hs[i])) return hs[i];
    for (i = 0; i < hs.length; i++) if (nativo(hs[i])) return hs[i];
    return null;
  }

  /* O rumo COMUM do par, no espaço corrigido. */
  Rel.direcaoDoPar = function (par, opts) {
    var o = opts || {}, p = par || {};
    if (o.yaw !== undefined && o.yaw !== null) {
      return {
        yaw: num(o.yaw, 0), pitch: num(o.pitch, 0), origem: "escolhida",
        rotulo: "rumo escolhido para este comparativo"
      };
    }
    /* o apontamento do DEPOIS manda: é o estado de agora que se quer olhar,
       e é do agora que sai a conversa da reunião */
    var alvo = apontamentoDeInteresse(p.b), lado = p.b;
    if (!alvo) { alvo = apontamentoDeInteresse(p.a); lado = p.a; }
    if (alvo && M()) {
      var c = M().corrigir({ yaw: num(alvo.yaw, 0), pitch: num(alvo.pitch, 0) }, lado);
      var t = txt(alvo.texto);
      return {
        yaw: c.yaw, pitch: c.pitch, origem: "apontamento",
        texto: t,
        rotulo: "na direção do apontamento" + (t ? ': "' + (t.length > 60 ? t.slice(0, 60) + "…" : t) + '"' : "")
      };
    }
    return {
      yaw: 0, pitch: 0, origem: "norte",
      rotulo: "olhando para o mesmo rumo nas duas visitas (norte da estação)"
    };
  };

  /* O que o documento vai mostrar, já casado por CARIMBO (o pid) e já com o
     rumo de cada lado resolvido. Puro: o gate exercita sem canvas nenhum. */
  Rel.paresComparativo = function (tourA, tourB, opts) {
    var o = opts || {};
    if (!M()) return { ok: false, motivo: "O motor do tour não carregou nesta página.", itens: [], soA: [], soB: [] };

    var ord = Rel.ordenarVisitas(tourA, tourB);
    var par = M().parear(ord.antes, ord.depois);
    var itens = [], i;
    for (i = 0; i < par.pares.length; i++) {
      var pr = par.pares[i];
      var dir = Rel.direcaoDoPar(pr, o);
      itens.push({
        pid: txt(pr.pid),
        nome: txt(pr.nome) || "Ponto",
        nivel: txt(pr.a.nivel) || txt(pr.b.nivel),
        direcao: dir,
        a: {
          ponto: pr.a, bruto: Rel.brutoDoLado(dir, pr.a),
          temFoto: !!pr.a.foto, eh360: (txt(pr.a.tipo) || "equirect") === "equirect"
        },
        b: {
          ponto: pr.b, bruto: Rel.brutoDoLado(dir, pr.b),
          temFoto: !!pr.b.foto, eh360: (txt(pr.b.tipo) || "equirect") === "equirect"
        }
      });
    }
    return {
      ok: true,
      antes: ord.antes, depois: ord.depois, trocou: ord.trocou,
      itens: itens, soA: par.soA, soB: par.soB,
      comparaveis: itens.length,
      aviso: txt(par.aviso)
    };
  };

  function grupoDoLado(item, lado, tour, fotos, obraNome) {
    var l = item[lado === "antes" ? "a" : "b"];
    var dataURI = pegar(fotos || {}, item.pid);
    if (!dataURI || !l.eh360) return null;       /* foto comum sai inteira, sem recorte */
    var quando = Rel.legendaData({ capturadoEm: txt(l.ponto.capturadoEm) }, l.ponto, tour && tour.data);
    return {
      dataURI: dataURI,
      pedidos: [{
        chave: Rel.chaveComparativo(item.pid, lado),
        opts: {
          yaw: l.bruto.yaw, pitch: l.bruto.pitch,
          /* ⚠ o anel só aparece quando há apontamento de verdade: ver
             `semMarca` em Rel.recorte */
          semMarca: item.direcao.origem !== "apontamento",
          cor: "#38bdf8",
          obra: txt(obraNome) || txt(tour && tour.obraNome),
          linha2: txt(item.nome) + (quando ? " · " + quando : ""),
          rotulo: lado === "antes" ? "ANTES" : "DEPOIS"
        }
      }]
    };
  }

  /* Os recortes dos dois lados, uma foto decodificada por vez (item 4). */
  Rel.recortesComparativo = function (cmp, fotosAntes, fotosDepois, opts) {
    var o = opts || {};
    if (!cmp || !cmp.itens) return Promise.resolve({ recortes: {}, marcas: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 });
    var grupos = [], i, g;
    for (i = 0; i < cmp.itens.length; i++) {
      g = grupoDoLado(cmp.itens[i], "antes", cmp.antes, fotosAntes, o.obraNome);
      if (g) grupos.push(g);
      g = grupoDoLado(cmp.itens[i], "depois", cmp.depois, fotosDepois, o.obraNome);
      if (g) grupos.push(g);
    }
    return montarRecortes(grupos, o);
  };

  function figuraLado(item, lado, tour, fotos, recortes, marcas) {
    var l = item[lado === "antes" ? "a" : "b"];
    var chave = Rel.chaveComparativo(item.pid, lado);
    var uri = pegar(recortes || {}, chave);
    var quando = Rel.legendaData({ capturadoEm: txt(l.ponto.capturadoEm) }, l.ponto, tour && tour.data);
    var titulo = (lado === "antes" ? "ANTES" : "DEPOIS") + " · " + esc(dataBR(txt(tour && tour.data)));
    var legenda = quando ? esc(quando) : "";
    var corpo;

    if (uri) {
      corpo = '<img src="' + esc(uri) + '" alt="" style="width:100%;border:1px solid #cbd5e1;border-radius:4px;display:block;background:#0b1a2b">';
    } else {
      var pano = pegar(fotos || {}, item.pid);
      if (pano) {
        /* ⚠ SEM RECORTE, A FOTO INTEIRA — E DIZENDO O QUE ELA É. Deixar o
           lado vazio faria a página parecer que a estação não foi
           fotografada naquela visita, que é a afirmação errada mais cara
           deste documento. */
        corpo = '<img src="' + esc(pano) + '" alt="" style="width:100%;max-height:230px;object-fit:contain;border:1px solid #cbd5e1;border-radius:4px;display:block;background:#0b1a2b">';
        legenda += (legenda ? " · " : "")
          + (l.eh360
            ? "foto inteira (não consegui recortar esta aqui)"
            : "foto comum, não é 360 — sai inteira e não dá para apontar por rumo");
      } else if (l.temFoto) {
        corpo = caixaAviso("<b>A foto desta estação nesta visita não entrou no documento.</b> "
          + "O arquivo não está neste aparelho e ainda não chegou à nuvem. Abra o tour com internet e gere de novo.");
        legenda = "";
      } else {
        corpo = caixaAviso("<b>Esta estação não foi fotografada nesta visita.</b> "
          + "Ela existe no tour — é o que permite comparar com as outras visitas —, mas não há imagem deste dia.");
        legenda = "";
      }
    }

    return '<figure style="margin:0;width:48%;flex:none">'
      + '<figcaption style="font-size:10px;font-weight:800;letter-spacing:.5px;color:' + ACCENT + ';padding-bottom:3px">' + titulo + "</figcaption>"
      + corpo
      + (legenda ? '<figcaption style="font-size:9px;color:#64748b;padding-top:2px">' + legenda + "</figcaption>" : "")
      + "</figure>";
  }

  /* A linha de pendências daquela estação, no comparativo: o que continua
     aberto ali e o que foi resolvido entre as duas visitas. */
  function linhaPendenciasDaEstacao(cmp, pid) {
    if (!M()) return "";
    var pend = M().pendenciasDe(cmp.depois), i, abertas = 0, resolvidas = 0, textos = [];
    for (i = 0; i < pend.length; i++) {
      if (pend[i].pid !== pid) continue;
      if (pend[i].status === "resolvida") { resolvidas++; continue; }
      abertas++;
      if (textos.length < 3) textos.push(txt(pend[i].texto) || "(sem texto)");
    }
    if (!abertas && !resolvidas) return "";
    var h = '<div style="margin-top:6px;font-size:10px;color:#334155;border-top:1px dashed #cbd5e1;padding-top:5px">';
    if (abertas) {
      h += '<b style="color:#7f1d1d">' + abertas + " pendência(s) em aberto aqui:</b> " + esc(textos.join(" · "));
    }
    if (resolvidas) {
      h += (abertas ? "<br>" : "") + '<b style="color:#14532d">' + resolvidas + " marcada(s) como resolvida(s) nesta visita.</b>";
    }
    return h + "</div>";
  }

  /* O miolo do documento comparativo. SÍNCRONO, pelo mesmo motivo de
     `Rel.html`: quem chama já resolveu fotos e recortes.
     opts: { fotosAntes, fotosDepois, recortes, marcas, obraNome, local, autor } */
  Rel.htmlComparativo = function (tourA, tourB, opts) {
    var o = opts || {};
    if (!M()) {
      return '<p style="font-size:12px;color:#7f1d1d">O motor do tour (js/tour360.js) não carregou nesta página — sem ele não há comparativo.</p>';
    }
    var cmp = Rel.paresComparativo(tourA, tourB, o);
    var fa = o.fotosAntes || {}, fb = o.fotosDepois || {};
    var rec = o.recortes || {}, mar = o.marcas || {};

    var h = '<table style="width:100%;font-size:11.5px;margin-bottom:10px">'
      + "<tr><td><b>Obra:</b> " + esc(txt(o.obraNome) || txt(cmp.depois && cmp.depois.obraNome) || "—") + "</td>"
      + "<td><b>Antes:</b> " + esc(dataBR(cmp.antes && cmp.antes.data)) + "</td></tr>"
      + "<tr><td><b>Responsável:</b> " + esc(txt(o.autor) || txt(cmp.depois && cmp.depois.autor) || "—") + "</td>"
      + "<td><b>Depois:</b> " + esc(dataBR(cmp.depois && cmp.depois.data)) + "</td></tr>"
      + (txt(o.local) ? '<tr><td colspan="2"><b>Local:</b> ' + esc(o.local) + "</td></tr>" : "")
      + "</table>";

    var dias = Rel.diasEntre(cmp.antes && cmp.antes.data, cmp.depois && cmp.depois.data);
    h += '<div style="margin-bottom:10px">'
      + chip(cmp.comparaveis, cmp.comparaveis === 1 ? "estação comparada" : "estações comparadas")
      + (dias !== null ? chip(dias, dias === 1 ? "dia entre as visitas" : "dias entre as visitas") : "")
      + (cmp.soA.length ? chip(cmp.soA.length, "só na visita anterior") : "")
      + (cmp.soB.length ? chip(cmp.soB.length, "só nesta visita") : "")
      + "</div>";

    if (!cmp.itens.length) {
      /* ⚠ TRAVA COM PORTA: o motor já devolve a saída ("Repetir visita"), e é
         ela que precisa chegar ao papel — recusa seca faz a pessoa concluir
         que o recurso não funciona. */
      return h + caixaAviso("<b>Estas duas visitas não têm nenhuma estação em comum.</b> "
        + esc(cmp.aviso || "Para comparar, a visita nova precisa nascer da anterior, pelo botão \"Repetir visita\" — é isso que mantém o mesmo ponto de foto."));
    }

    var i;
    for (i = 0; i < cmp.itens.length; i++) {
      var it = cmp.itens[i];
      var ultima = (i === cmp.itens.length - 1) && !cmp.soA.length && !cmp.soB.length;
      /* ⚠ o bloco tem fundo branco próprio: na tela o documento é lido dentro
         do overlay escuro do `App._abrirPrint`, e a linha que diz PARA ONDE as
         duas fotos estão olhando sairia cinza sobre azul-escuro — some. No
         papel, branco sobre branco não muda nada. */
      h += '<div class="t360-estacao" style="page-break-inside:avoid' + (ultima ? "" : ";page-break-after:always")
        + ';background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;margin-bottom:10px">'
        + '<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid ' + ACCENT + ';padding-bottom:4px;margin-bottom:8px">'
        + '<b style="font-size:13px;color:' + ACCENT + '">' + esc(it.nome) + "</b>"
        + '<span style="font-size:10px;color:#64748b;text-align:right;max-width:56%">' + (txt(it.nivel) ? esc(it.nivel) + " · " : "")
        + esc(it.direcao.rotulo) + "</span></div>"
        + '<div style="display:flex;gap:10px;align-items:flex-start">'
        + figuraLado(it, "antes", cmp.antes, fa, rec, mar)
        + figuraLado(it, "depois", cmp.depois, fb, rec, mar)
        + "</div>"
        + linhaPendenciasDaEstacao(cmp, it.pid)
        + "</div>";
    }

    /* ⚠ O QUE NÃO CASOU SAI DECLARADO, com o motivo. */
    if (cmp.soA.length || cmp.soB.length) {
      h += '<div style="page-break-inside:avoid;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px">'
        + '<div style="font-weight:800;font-size:11px;letter-spacing:.4px;margin:0 0 5px;color:' + ACCENT + '">ESTAÇÕES QUE NÃO ENTRARAM NA COMPARAÇÃO</div>';
      if (cmp.soB.length) {
        h += caixaAviso("<b>" + cmp.soB.length + " estação(ões) existem só na visita de "
          + esc(dataBR(cmp.depois && cmp.depois.data)) + ":</b> " + esc(nomesDe(cmp.soB))
          + ". São pontos novos — não há foto anterior do mesmo lugar para pôr ao lado.");
      }
      if (cmp.soA.length) {
        h += caixaAviso("<b>" + cmp.soA.length + " estação(ões) existem só na visita de "
          + esc(dataBR(cmp.antes && cmp.antes.data)) + ":</b> " + esc(nomesDe(cmp.soA))
          + ". Elas não foram refeitas nesta visita — para a comparação continuar, a visita nova precisa nascer da anterior.");
      }
      h += "</div>";
    }

    h += '<div style="page-break-inside:avoid;margin-top:12px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;padding:8px 10px;font-size:10.5px;color:#334155">'
      + "<b>Como ler estas duas fotos</b><br>"
      + "As duas saem da mesma estação e do MESMO rumo — o giro é corrigido pelo norte de cada visita, para que a foto da esquerda e a da direita mostrem a mesma parede "
      + "mesmo quando quem fotografou começou o giro de lados diferentes. Cada uma é um pedaço da foto 360 daquele dia, e nada foi acrescentado a elas. "
      + "Por saírem de uma imagem 360, linhas retas ainda curvam um pouco. A foto 360 inteira de cada estação está no relatório fotográfico da visita."
      + "</div>";

    return h;
  };

  function nomesDe(pontos) {
    var ns = [], i;
    for (i = 0; i < (pontos || []).length; i++) ns.push(txt(pontos[i].nome) || "Ponto");
    return ns.join(", ");
  }

  /* Resolve as fotos só das estações pedidas — e não do tour inteiro. Um tour
     de 40 estações com 3 pendências não pode baixar 40 panoramas da nuvem
     para montar 3 recortes. */
  Rel.resolverFotosDe = function (tour, pids) {
    if (!M()) return Promise.resolve({ fotos: {}, faltando: 0, total: 0 });
    var lista = pids || [], alvos = [], i, p;
    for (i = 0; i < lista.length; i++) {
      p = M() ? M().pontoDe(tour, lista[i]) : null;
      if (p) alvos.push(p);
    }
    return Promise.all(alvos.map(function (pt) {
      return resolverUm(pt.foto).then(function (d) {
        return { pid: txt(pt.pid), d: d || "", temRef: !!pt.foto };
      });
    })).then(function (res) {
      var mapa = {}, faltando = 0, k;
      for (k = 0; k < res.length; k++) {
        if (res[k].d) mapa[res[k].pid] = res[k].d;
        else if (res[k].temRef) faltando++;
      }
      return { fotos: mapa, faltando: faltando, total: res.length };
    });
  };

  /* Abre o antes-e-depois pronto para imprimir.
     Resolve { ok, estacoes, soA, soB, recortes, faltando } ou { ok:false, motivo }. */
  Rel.abrirComparativo = function (tourA, tourB, opts) {
    var o = opts || {};
    if (!M()) return Promise.resolve({ ok: false, motivo: "O motor do tour não carregou nesta página." });
    if (!tourA || !tourB) {
      return Promise.resolve({ ok: false, motivo: "Escolha as DUAS visitas que devem ser comparadas." });
    }
    if (txt(tourA.id) && txt(tourA.id) === txt(tourB.id)) {
      return Promise.resolve({ ok: false, motivo: "As duas visitas escolhidas são a mesma — escolha uma visita anterior para comparar." });
    }

    var cmp = Rel.paresComparativo(tourA, tourB, o);
    if (!cmp.itens.length) {
      return Promise.resolve({
        ok: false,
        motivo: cmp.aviso || "Estas duas visitas não têm nenhuma estação em comum. Crie a próxima visita a partir desta (\"Repetir visita\") para que os pontos de foto se repitam."
      });
    }

    if (global.UI && typeof global.UI.toast === "function") {
      try { global.UI.toast("Montando o antes e depois…", "ok"); } catch (e) {}
    }

    var pids = [], i;
    for (i = 0; i < cmp.itens.length; i++) pids.push(cmp.itens[i].pid);

    return Promise.all([
      Rel.resolverFotosDe(cmp.antes, pids),
      Rel.resolverFotosDe(cmp.depois, pids)
    ]).then(function (r) {
      /* ⚠ OS RECORTES NÃO PODEM SEGURAR O DOCUMENTO (mesma regra de
         `Rel.abrir`): prazo próprio, e no pior caso o documento sai com as
         fotos inteiras e a legenda dizendo o que elas são. */
      return Rel.recortesComparativo(cmp, r[0].fotos, r[1].fotos, o)["catch"](function () {
        return { recortes: {}, marcas: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 };
      }).then(function (rc) { return { a: r[0], b: r[1], rc: rc }; });
    }).then(function (par) {
      var corpo = Rel.htmlComparativo(tourA, tourB, {
        fotosAntes: par.a.fotos, fotosDepois: par.b.fotos,
        recortes: par.rc.recortes, marcas: par.rc.marcas,
        obraNome: o.obraNome, local: o.local, autor: o.autor,
        yaw: o.yaw, pitch: o.pitch
      });
      var titulo = "Tour 360 — antes e depois — " + dataBR(cmp.antes && cmp.antes.data) + " a " + dataBR(cmp.depois && cmp.depois.data);
      var cabec = "TOUR VIRTUAL DA OBRA · ANTES E DEPOIS";

      var G = global.Gestao;
      if (G && typeof G._docShell === "function" && typeof G._abrirDoc === "function") {
        G._abrirDoc(titulo, G._docShell(cabec, ACCENT, corpo, "tour360cmp"));
      } else if (global.App && typeof global.App._abrirPrint === "function") {
        global.App._abrirPrint(titulo, corpo);
      } else {
        return { ok: false, motivo: "Não há como abrir o documento nesta tela." };
      }
      return {
        ok: true,
        estacoes: cmp.itens.length,
        soA: cmp.soA.length, soB: cmp.soB.length,
        trocou: cmp.trocou,
        dataAntes: txt(cmp.antes && cmp.antes.data),
        dataDepois: txt(cmp.depois && cmp.depois.data),
        recortes: par.rc.feitos,
        faltando: par.a.faltando + par.b.faltando,
        recortesNoPrazo: !par.rc.estourouPrazo
      };
    });
  };

  /* =====================================================================
   * PARTE 1D — O RELATÓRIO DE PENDÊNCIAS
   *
   * É o documento que vai para a reunião de obra e para a notificação do
   * empreiteiro. O relatório fotográfico conta o DIA; este conta o que ANDA —
   * e o que não anda.
   *
   * ⚠ PENDÊNCIA QUE SE ARRASTA TEM DE SALTAR AOS OLHOS (item 9 do
   *   cabeçalho). "Aberta" sozinho não diz se é de ontem ou do começo da
   *   obra: numa lista de vinte linhas iguais, a fissura de março e o
   *   entulho de anteontem têm o mesmo peso visual, e a reunião trata as duas
   *   do mesmo jeito — ou seja, não trata nenhuma. Aqui a ordem é pelo que
   *   atrasa, e o arrasto vira tarja.
   *
   * ⚠ E O NÚMERO DE VISITAS SÓ APARECE SE O HISTÓRICO FOI CONSULTADO. Sem a
   *   lista das visitas anteriores (`opts.tours`), o documento DIZ que não
   *   consultou. Escrever "1 visita" seria mentira confortável — e cairia
   *   justamente em cima da pendência mais velha da obra, que é a que
   *   interessa. Recado que mente é pior que recado nenhum.
   *
   * ⚠ O "DESDE" NÃO DEPENDE DO HISTÓRICO: ele sai do CARIMBO. `origemData` é
   *   gravado por `Tour360.carregarPendencias` quando a pendência atravessa a
   *   visita, e é dado de primeira mão — não é dedução por semelhança de
   *   texto, que é o casamento que esta casa não faz.
   * ================================================================== */

  Rel.chavePendencia = function (pid, hid, i) {
    /* prefixada, como as outras chaves: um hid chamado "constructor" cairia
       no protótipo do objeto e devolveria uma função no lugar de uma imagem */
    return "pd:" + txt(pid) + "|" + (txt(hid) || ("n" + i));
  };

  function diaUTC(iso) {
    var s = txt(iso);
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
    return Date.UTC(+s.slice(0, 4), (+s.slice(5, 7)) - 1, +s.slice(8, 10));
  }

  /* Dias entre duas datas ISO. Null quando alguma não é data — e null vira
     "não sei" no documento, nunca zero. */
  Rel.diasEntre = function (a, b) {
    var x = diaUTC(a), y = diaUTC(b);
    if (x === null || y === null) return null;
    return Math.round((y - x) / 86400000);
  };

  /* ⚠ HOJE É LOCAL, NUNCA `toISOString()`. No Brasil, das 21h em diante o UTC
     já é o dia seguinte: um prazo que vence hoje apareceria vencido à noite —
     e a notificação do empreiteiro sairia cobrando atraso que não existe. */
  function hojeISO() {
    var d = new Date();
    function dd(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate());
  }

  /* As pendências da visita, enriquecidas e ORDENADAS pelo que atrasa.
     opts: { tours, hoje, incluirResolvidas } */
  Rel.itensPendencia = function (tour, opts) {
    var o = opts || {};
    if (!M()) return [];
    var pend = M().pendenciasDe(tour, { soAbertas: !o.incluirResolvidas });
    var tours = (o.tours && o.tours.length) ? o.tours : null;
    var hoje = txt(o.hoje) || hojeISO();
    var dataVisita = txt(tour && tour.data);
    var fora = [], i;

    for (i = 0; i < pend.length; i++) {
      var p = pend[i];
      var hist = tours ? M().historicoPendencia(tours, p.origemHid) : null;
      var desde = txt(p.desdeData) || dataVisita;
      var venceu = !!txt(p.prazo) && txt(p.prazo) < hoje && p.status !== "resolvida";
      /* ⚠ SEM HISTÓRICO, O CARIMBO AINDA SABE. `origemData` diferente da data
         da visita quer dizer que esta pendência veio de uma visita anterior —
         isso é fato gravado, não dedução. O que NÃO dá para saber sem a lista
         é POR QUANTAS visitas ela passou; esse número fica nulo. */
      var arrastando = hist ? !!hist.arrastando : (!!desde && !!dataVisita && desde < dataVisita);
      fora.push({
        chave: Rel.chavePendencia(p.pid, p.hid, i),
        hid: p.hid, origemHid: p.origemHid, pid: p.pid,
        estacao: p.estacao, nivel: p.nivel,
        tipo: p.tipo, texto: p.texto, status: p.status,
        responsavel: p.responsavel, prazo: p.prazo,
        yaw: p.yaw, pitch: p.pitch,
        desde: desde,
        resolvidoEm: p.resolvidoEm,
        vencida: venceu,
        diasVencida: venceu ? Rel.diasEntre(p.prazo, hoje) : null,
        diasAberta: Rel.diasEntre(desde, dataVisita || hoje),
        arrastando: arrastando,
        /* ⚠ UM SINAL SÓ PARA "NÃO SEI": `visitas` nulo. Um segundo campo
           dizendo a mesma coisa (um `historicoConsultado` ao lado) é dois
           lugares para divergir — e o dia em que divergissem, o documento
           escreveria "1 visita" para a pendência mais velha da obra. Quem
           consome isto (a tela, o papel) testa `visitas == null`. */
        visitas: hist ? hist.visitas : null
      });
    }

    /* ordem: primeiro o que atrasa, depois o que se arrasta, depois o que
       piorou; empate resolve pelo mais antigo */
    fora.sort(function (a, b) {
      var pa = (a.vencida ? 4 : 0) + (a.arrastando ? 2 : 0) + (a.status === "persiste" ? 1 : 0);
      var pb = (b.vencida ? 4 : 0) + (b.arrastando ? 2 : 0) + (b.status === "persiste" ? 1 : 0);
      if (pa !== pb) return pb - pa;
      var da = txt(a.desde), db = txt(b.desde);
      if (da !== db) return da < db ? -1 : 1;
      return txt(a.estacao).localeCompare(txt(b.estacao));
    });
    return fora;
  };

  var STATUS_ROT = {
    aberta: { rotulo: "EM ABERTO", cor: "#7c2d12", fundo: "#fffbeb" },
    persiste: { rotulo: "PIOROU / PERSISTE", cor: "#7f1d1d", fundo: "#fef2f2" },
    resolvida: { rotulo: "RESOLVIDA", cor: "#14532d", fundo: "#f0fdf4" }
  };

  function statusRot(s) {
    var k = txt(s);
    return Object.prototype.hasOwnProperty.call(STATUS_ROT, k) ? STATUS_ROT[k] : STATUS_ROT.aberta;
  }

  /* A tarja do arrasto — o que faz a linha saltar aos olhos no papel. */
  function tarjaArrasto(it) {
    if (!it.arrastando) return "";
    var quanto = it.visitas != null
      ? ("HÁ " + it.visitas + " VISITA" + (it.visitas === 1 ? "" : "S"))
      : "DESDE VISITA ANTERIOR";
    return '<span style="display:inline-block;background:#7f1d1d;color:#fff;font-size:8.5px;font-weight:800;letter-spacing:.6px;border-radius:3px;padding:2px 6px;margin-right:5px">'
      + "ARRASTA-SE " + quanto + (txt(it.desde) ? " · DESDE " + esc(dataBR(it.desde)) : "") + "</span>";
  }

  function tarjaVencida(it) {
    if (!it.vencida) return "";
    var d = it.diasVencida;
    return '<span style="display:inline-block;background:#dc2626;color:#fff;font-size:8.5px;font-weight:800;letter-spacing:.6px;border-radius:3px;padding:2px 6px;margin-right:5px">'
      + "PRAZO VENCIDO" + (d != null ? " HÁ " + d + (d === 1 ? " DIA" : " DIAS") : "") + "</span>";
  }

  /* Um resumo em números que não pode mentir: o que não foi consultado é dito
     como não consultado. */
  Rel.resumoDosItens = function (itens) {
    var i, r = { total: 0, abertas: 0, vencidas: 0, arrastando: 0, resolvidas: 0, semResponsavel: 0, semPrazo: 0, semHistorico: 0 };
    for (i = 0; i < (itens || []).length; i++) {
      var it = itens[i];
      r.total++;
      if (it.status === "resolvida") r.resolvidas++; else r.abertas++;
      if (it.vencida) r.vencidas++;
      if (it.arrastando) r.arrastando++;
      if (!txt(it.responsavel)) r.semResponsavel++;
      if (!txt(it.prazo)) r.semPrazo++;
      if (it.visitas == null) r.semHistorico++;   /* o único sinal de "não sei" */
    }
    return r;
  };

  /* A TABELA que entra no relatório fotográfico (sem imagem: as fotos já
     estão ao lado de cada apontamento, nas páginas das estações). */
  Rel.tabelaPendencias = function (tour, opts) {
    var o = opts || {};
    if (!M()) return "";
    var itens = Rel.itensPendencia(tour, o);
    if (!itens.length) return "";
    var r = Rel.resumoDosItens(itens);

    /* ⚠ FUNDO BRANCO EXPLÍCITO, e não é enfeite: antes de virar PDF o
       documento é lido NA TELA, dentro do overlay escuro do `App._abrirPrint`.
       Bloco sem fundo próprio deixa o texto cinza de 10 px ilegível ali — e a
       nota que explica o que fazer com a pendência sem responsável é
       justamente uma dessas linhas. No papel o branco não muda nada. */
    var h = '<div style="page-break-inside:avoid;background:#fff;border:1px solid ' + (r.vencidas || r.arrastando ? "#dc2626" : "#cbd5e1")
      + ';border-radius:6px;padding:8px 10px;margin-bottom:10px">'
      + '<div style="font-weight:800;font-size:11px;letter-spacing:.4px;color:' + ACCENT + ';margin-bottom:5px">'
      + "O QUE CONTINUA EM ABERTO (" + itens.length + ")</div>";

    if (r.arrastando || r.vencidas) {
      h += '<div style="font-size:10.5px;color:#7f1d1d;margin-bottom:6px">'
        + (r.arrastando ? "<b>" + r.arrastando + "</b> vem(vêm) de visita anterior. " : "")
        + (r.vencidas ? "<b>" + r.vencidas + "</b> com prazo vencido. " : "")
        + "</div>";
    }

    h += '<table style="width:100%;border-collapse:collapse;font-size:10.5px">'
      + '<thead><tr style="background:' + ACCENT + ';color:#fff">'
      + '<th style="border:1px solid #bbb;padding:3px 5px;text-align:left">O que está pendente</th>'
      + '<th style="border:1px solid #bbb;padding:3px 5px;width:20%">Onde</th>'
      + '<th style="border:1px solid #bbb;padding:3px 5px;width:14%">Desde</th>'
      + '<th style="border:1px solid #bbb;padding:3px 5px;width:16%">Responsável</th>'
      + '<th style="border:1px solid #bbb;padding:3px 5px;width:14%">Prazo</th>'
      + "</tr></thead><tbody>";

    var i;
    for (i = 0; i < itens.length; i++) {
      var it = itens[i];
      var st = statusRot(it.status);
      h += '<tr style="background:' + (it.vencida ? "#fef2f2" : (it.arrastando ? "#fffbeb" : "#fff")) + '">'
        + '<td style="border:1px solid #bbb;padding:3px 5px">'
        + tarjaVencida(it) + tarjaArrasto(it)
        + esc(txt(it.texto) || "(sem texto)") + "</td>"
        + '<td style="border:1px solid #bbb;padding:3px 5px">' + esc(txt(it.estacao) || "—")
        + (txt(it.nivel) ? '<div style="font-size:9px;color:#64748b">' + esc(it.nivel) + "</div>" : "") + "</td>"
        + '<td style="border:1px solid #bbb;padding:3px 5px;text-align:center">' + esc(dataBR(it.desde) || "—") + "</td>"
        + '<td style="border:1px solid #bbb;padding:3px 5px">' + (txt(it.responsavel) ? esc(it.responsavel) : '<span style="color:#94a3b8">sem responsável</span>') + "</td>"
        + '<td style="border:1px solid #bbb;padding:3px 5px;text-align:center' + (it.vencida ? ";color:#b91c1c;font-weight:700" : "") + '">'
        + (txt(it.prazo) ? esc(dataBR(it.prazo)) : '<span style="color:#94a3b8">sem prazo</span>') + "</td>"
        + "</tr>";
    }
    h += "</tbody></table>";

    /* ⚠ TRAVA COM PORTA: apontar o buraco sem dizer onde se resolve empurra a
       pessoa a ignorar o aviso. */
    if (r.semResponsavel || r.semPrazo) {
      h += '<div style="font-size:9.5px;color:#64748b;margin-top:5px">'
        + (r.semResponsavel ? r.semResponsavel + " sem responsável. " : "")
        + (r.semPrazo ? r.semPrazo + " sem prazo. " : "")
        + "Abra o apontamento na estação, dentro do tour, para definir quem faz e até quando — é o que faz esta lista virar cobrança."
        + "</div>";
    }
    if (r.semHistorico) {
      h += '<div style="font-size:9.5px;color:#64748b;margin-top:3px">'
        + "Não consultei as visitas anteriores desta obra ao montar este documento: por isso não digo há quantas visitas cada item se arrasta. "
        + "O \"desde\" acima é a data em que o apontamento foi feito pela primeira vez, e essa é gravada junto com ele."
        + "</div>";
    }
    return h + "</div>";
  };

  /* Os recortes das pendências, uma foto por vez. */
  Rel.recortesPendencias = function (tour, itens, fotos, opts) {
    var o = opts || {};
    if (!M()) return Promise.resolve({ recortes: {}, marcas: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 });
    var t = tour || {}, mapa = fotos || {};
    var porPid = {}, ordem = [], i;
    var obra = txt(o.obraNome) || txt(t.obraNome);

    for (i = 0; i < (itens || []).length; i++) {
      var it = itens[i];
      var ponto = M().pontoDe(t, it.pid);
      var dataURI = pegar(mapa, it.pid);
      if (!ponto || !dataURI) continue;
      if ((txt(ponto.tipo) || "equirect") !== "equirect") continue;
      var k = "#" + it.pid;
      if (!Object.prototype.hasOwnProperty.call(porPid, k)) {
        porPid[k] = { dataURI: dataURI, pedidos: [] };
        ordem.push(k);
      }
      var tp = tipoDe(it.tipo);
      var quando = Rel.legendaData({ capturadoEm: txt(ponto.capturadoEm) }, ponto, t.data);
      porPid[k].pedidos.push({
        chave: it.chave,
        opts: {
          yaw: num(it.yaw, 0), pitch: num(it.pitch, 0),
          cor: tp.borda, obra: obra,
          linha2: txt(it.estacao) + (quando ? " · " + quando : ""),
          rotulo: tp.rotulo
        }
      });
    }

    var grupos = [];
    for (i = 0; i < ordem.length; i++) grupos.push(porPid[ordem[i]]);
    return montarRecortes(grupos, o);
  };

  /* O documento próprio: um bloco por pendência, com o recorte enquadrado.
     opts: { itens, fotos, recortes, obraNome, local, autor, tours, hoje } */
  Rel.htmlPendencias = function (tour, opts) {
    var o = opts || {};
    if (!M()) {
      return '<p style="font-size:12px;color:#7f1d1d">O motor do tour (js/tour360.js) não carregou nesta página — sem ele não há relatório de pendências.</p>';
    }
    var t = tour || {};
    var itens = o.itens || Rel.itensPendencia(t, o);
    var rec = o.recortes || {};
    var r = Rel.resumoDosItens(itens);

    var h = '<table style="width:100%;font-size:11.5px;margin-bottom:10px">'
      + "<tr><td><b>Obra:</b> " + esc(txt(o.obraNome) || txt(t.obraNome) || "—") + "</td>"
      + "<td><b>Visita:</b> " + esc(dataBR(t.data)) + "</td></tr>"
      + "<tr><td><b>Tour:</b> " + esc(txt(t.titulo) || "—") + "</td>"
      + "<td><b>Responsável pela vistoria:</b> " + esc(txt(o.autor) || txt(t.autor) || "—") + "</td></tr>"
      + (txt(o.local) ? '<tr><td colspan="2"><b>Local:</b> ' + esc(o.local) + "</td></tr>" : "")
      + "</table>";

    h += '<div style="margin-bottom:10px">'
      + chip(r.abertas, r.abertas === 1 ? "pendência em aberto" : "pendências em aberto")
      + (r.vencidas ? chip(r.vencidas, "com prazo vencido") : "")
      + (r.arrastando ? chip(r.arrastando, "vindas de visita anterior") : "")
      + (r.resolvidas ? chip(r.resolvidas, "resolvidas") : "")
      + "</div>";

    if (!itens.length) {
      return h + caixaAviso("<b>Esta visita não tem nenhuma pendência em aberto.</b> "
        + "Um apontamento vira pendência quando o tipo dele é \"atenção\" ou \"pendência\" — os outros tipos são recado do dia e não atravessam a visita.");
    }

    /* ⚠ O ARRASTO NO ALTO, ANTES DA LISTA. Quem lê uma folha lê o primeiro
       bloco; se o item de março estiver na página 3, ele não é lido. */
    if (r.arrastando || r.vencidas) {
      h += '<div style="border:2px solid #dc2626;border-radius:6px;background:#fef2f2;padding:8px 10px;margin-bottom:10px;page-break-inside:avoid">'
        + '<div style="font-weight:800;font-size:11.5px;color:#7f1d1d;letter-spacing:.3px">O QUE NÃO ANDOU</div>'
        + '<div style="font-size:11px;color:#7f1d1d;margin-top:3px">'
        + (r.arrastando ? "<b>" + r.arrastando + "</b> pendência(s) já estavam abertas em visita anterior e continuam abertas. " : "")
        + (r.vencidas ? "<b>" + r.vencidas + "</b> passaram do prazo combinado. " : "")
        + "Elas estão no alto da lista abaixo, com a tarja vermelha."
        + "</div></div>";
    }

    var i;
    for (i = 0; i < itens.length; i++) {
      var it = itens[i];
      var tp = tipoDe(it.tipo);
      var st = statusRot(it.status);
      var uri = pegar(rec, it.chave);

      var miolo = '<div style="margin-bottom:3px">' + tarjaVencida(it) + tarjaArrasto(it)
        + '<span style="font-size:9px;font-weight:800;letter-spacing:.5px;color:' + tp.cor + '">' + tp.rotulo + "</span>"
        + '<span style="font-size:9px;font-weight:800;letter-spacing:.5px;color:' + st.cor + ';margin-left:6px">· ' + st.rotulo + "</span>"
        + "</div>"
        + '<div style="font-size:12px;color:#111;font-weight:600">' + esc(txt(it.texto) || "(sem texto)") + "</div>"
        + '<table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:5px">'
        + "<tr><td style=\"padding:1px 0;color:#64748b;width:34%\">Onde</td><td style=\"padding:1px 0\"><b>" + esc(txt(it.estacao) || "—") + "</b>"
        + (txt(it.nivel) ? " · " + esc(it.nivel) : "") + "</td></tr>"
        + "<tr><td style=\"padding:1px 0;color:#64748b\">Apontada em</td><td style=\"padding:1px 0\">" + esc(dataBR(it.desde) || "—")
        + (it.diasAberta != null && it.diasAberta > 0 ? " (" + it.diasAberta + (it.diasAberta === 1 ? " dia" : " dias") + ")" : "") + "</td></tr>"
        + "<tr><td style=\"padding:1px 0;color:#64748b\">Aparições</td><td style=\"padding:1px 0\">"
        /* ⚠ item 9: sem histórico consultado, o documento DIZ isso — e o
           sinal é o mesmo que a tarja lê, `visitas == null` */
        + (it.visitas != null
          ? (it.visitas + (it.visitas === 1 ? " visita" : " visitas"))
          : "<span style=\"color:#94a3b8\">visitas anteriores não consultadas</span>")
        + "</td></tr>"
        + "<tr><td style=\"padding:1px 0;color:#64748b\">Responsável</td><td style=\"padding:1px 0\">"
        + (txt(it.responsavel) ? esc(it.responsavel) : "<span style=\"color:#94a3b8\">não definido</span>") + "</td></tr>"
        + "<tr><td style=\"padding:1px 0;color:#64748b\">Prazo</td><td style=\"padding:1px 0" + (it.vencida ? ";color:#b91c1c;font-weight:700" : "") + "\">"
        + (txt(it.prazo) ? esc(dataBR(it.prazo)) : "<span style=\"color:#94a3b8\">não definido</span>") + "</td></tr>"
        + '<tr><td style="padding:1px 0;color:#64748b">Onde olhar na foto</td><td style="padding:1px 0">giro '
        + numBR(it.yaw, 0) + "°, inclinação " + numBR(it.pitch, 0) + "°</td></tr>"
        + "</table>";

      h += '<div style="border:1px solid ' + (it.vencida ? "#dc2626" : tp.borda) + ';border-left-width:5px;border-radius:5px;background:'
        + (it.vencida ? "#fef2f2" : tp.fundo) + ';padding:7px 10px;margin-bottom:8px;page-break-inside:avoid">'
        + linhaApontamento(uri, miolo)
        + "</div>";
    }

    if (r.semResponsavel || r.semPrazo) {
      h += caixaAviso("<b>" + (r.semResponsavel ? r.semResponsavel + " pendência(s) sem responsável" : "")
        + (r.semResponsavel && r.semPrazo ? " e " : "")
        + (r.semPrazo ? r.semPrazo + " sem prazo" : "") + ".</b> "
        + "Sem os dois, esta lista informa mas não cobra. Abra o apontamento na estação, dentro do tour, para definir quem faz e até quando.");
    }

    if (r.semHistorico) {
      h += '<div style="page-break-inside:avoid;margin-top:8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;padding:8px 10px;font-size:10.5px;color:#334155">'
        + "<b>Sobre o tempo de cada pendência</b><br>"
        + "As visitas anteriores desta obra não foram consultadas na montagem deste documento, então ele não diz por quantas visitas cada item já passou. "
        + "A data em \"Apontada em\" é gravada junto com o apontamento na primeira vez em que ele foi feito e atravessa as visitas com ele — essa é confiável."
        + "</div>";
    }

    /* Assinatura: este documento é entregue em mão ao empreiteiro, e a via
       assinada é o que sustenta a cobrança depois. */
    h += '<div style="page-break-inside:avoid;display:flex;justify-content:space-between;margin-top:34px;gap:26px">'
      + '<div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px">Responsável pela vistoria</div>'
      + '<div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px">Recebido por (data e assinatura)</div>'
      + "</div>";

    return h;
  };

  /* Abre o relatório de pendências.
     Resolve { ok, itens, abertas, vencidas, arrastando, recortes, faltando }
     ou { ok:false, motivo }. */
  Rel.abrirPendencias = function (tour, opts) {
    var o = opts || {};
    if (!M()) return Promise.resolve({ ok: false, motivo: "O motor do tour não carregou nesta página." });
    var t = tour || {};
    var itens = Rel.itensPendencia(t, o);
    if (!itens.length) {
      /* ⚠ A RECUSA TEM PORTA: diz o que fazer para um apontamento virar
         pendência, senão a pessoa conclui que o recurso está quebrado. */
      return Promise.resolve({
        ok: false,
        motivo: "Esta visita não tem nenhuma pendência em aberto. Um apontamento só vira pendência quando o tipo dele é \"atenção\" ou \"pendência\" — os outros são recado do dia."
      });
    }

    if (global.UI && typeof global.UI.toast === "function") {
      try { global.UI.toast("Montando o relatório de pendências…", "ok"); } catch (e) {}
    }

    var pids = [], vistos = {}, i;
    for (i = 0; i < itens.length; i++) {
      if (Object.prototype.hasOwnProperty.call(vistos, "#" + itens[i].pid)) continue;
      vistos["#" + itens[i].pid] = true;
      pids.push(itens[i].pid);
    }

    return Rel.resolverFotosDe(t, pids).then(function (r) {
      return Rel.recortesPendencias(t, itens, r.fotos, o)["catch"](function () {
        return { recortes: {}, marcas: {}, feitos: 0, pulados: 0, estourouPrazo: false, cortadoPeloTeto: 0 };
      }).then(function (rc) { return { r: r, rc: rc }; });
    }).then(function (par) {
      var corpo = Rel.htmlPendencias(t, {
        itens: itens,
        fotos: par.r.fotos,
        recortes: par.rc.recortes,
        obraNome: o.obraNome, local: o.local, autor: o.autor,
        tours: o.tours, hoje: o.hoje
      });
      var titulo = "Tour 360 — pendências — " + (txt(t.titulo) || dataBR(t.data));
      var cabec = "TOUR VIRTUAL DA OBRA · PENDÊNCIAS EM ABERTO";

      var G = global.Gestao;
      if (G && typeof G._docShell === "function" && typeof G._abrirDoc === "function") {
        G._abrirDoc(titulo, G._docShell(cabec, "#7f1d1d", corpo, "tour360pend"));
      } else if (global.App && typeof global.App._abrirPrint === "function") {
        global.App._abrirPrint(titulo, corpo);
      } else {
        return { ok: false, motivo: "Não há como abrir o documento nesta tela." };
      }

      var res = Rel.resumoDosItens(itens);
      return {
        ok: true,
        itens: itens.length,
        abertas: res.abertas, vencidas: res.vencidas, arrastando: res.arrastando,
        semResponsavel: res.semResponsavel, semPrazo: res.semPrazo,
        historicoConsultado: !res.semHistorico,
        recortes: par.rc.feitos,
        faltando: par.r.faltando,
        recortesNoPrazo: !par.rc.estourouPrazo
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

    /* ⚠ COMPARATIVO EXIGE O VISUALIZADOR QUE FAZ CORTINA. Sem
       `abrirComparativo`, o laço de desenho lá embaixo caía para `vw.abrir(dA)`
       — ou seja: metade dos quadros mostrava a foto do ANTES enquanto a faixa
       escrevia a data do DEPOIS. O vídeo saía inteiro, bonito, e afirmando
       que a obra estava em setembro como estava em agosto. Recusar aqui, com
       a saída, é a diferença entre um recado e um documento falso. */
    if (o.comparativo && typeof vw.abrirComparativo !== "function") {
      return Promise.reject(new Error("Este visualizador não sabe mostrar as duas visitas lado a lado — sem isso o vídeo comparativo sairia com a foto de uma visita e a data da outra. Atualize o aplicativo, ou grave o vídeo simples desta visita."));
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

      /* ⚠ NO COMPARATIVO, UM LADO SÓ NÃO É COMPARATIVO. Com as fotos do
         "antes" no aparelho e as do "depois" só na nuvem, o laço pularia
         todos os quadros do depois: sairia um arquivo curto, sem erro
         nenhum, que o engenheiro mandaria para o cliente como "antes e
         depois". A recusa vem antes de gravar, e diz o que fazer. */
      if (tourB) {
        var pares = 0;
        for (i = 0; i < r.pids.length; i++) {
          if (pegar(mapa, chaveFoto("a", r.pids[i])) && pegar(mapa, chaveFoto("b", r.pids[i]))) pares++;
        }
        if (!pares) {
          throw new Error("Nenhuma estação tem as fotos das DUAS visitas neste aparelho — o comparativo sairia com metade dos quadros em branco. Abra as duas visitas com internet para que as fotos desçam e tente de novo.");
        }
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
            if (tourB) {
              /* ⚠ FALTOU UM LADO, A ESTAÇÃO INTEIRA CAI — e não vira a foto
                 do outro lado. Cair para `vw.abrir(dA)` aqui poria a foto do
                 ANTES debaixo da data do DEPOIS na faixa do vídeo: mentir com
                 imagem, que é o pior defeito possível num material que vai
                 para o cliente. Quadro pulado encurta o vídeo, é contado em
                 `quadrosPerdidos` e a tela diz isso. */
              if (dA && dB) pr = vw.abrirComparativo(dA, dB, pontoNaTela);
              else pr = Promise.resolve({ ok: false });
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

  /* =====================================================================
   * PARTE 2A — O VÍDEO COMPARATIVO
   *
   * O DEFEITO QUE ISTO CONSERTA: motor sem fiação, o que o CLAUDE.md desta
   * casa descreve como o defeito que passa no gate e não existe no navegador.
   * `Tour360.planoComparativo` estava escrito, testado e documentado; o
   * `Rel.gravar` já aceitava `{comparativo: <outro tour>}`; o viewer já sabia
   * abrir as duas esferas com cortina. E NINGUÉM CHAMAVA com o comparativo —
   * o caminho inteiro existia sem uma porta de entrada. Esta é a porta.
   *
   * ⚠ E ELA JÁ NASCE COM AS DUAS GUARDAS QUE FALTAVAM (ver `Rel.gravar`):
   *   visualizador sem `abrirComparativo` recusa antes de gravar, e estação
   *   sem as duas fotos não cai para o lado que existe. As duas evitam o
   *   mesmo desfecho: um arquivo que sai bonito, é mandado ao cliente, e
   *   mostra a foto de uma visita com a data da outra.
   * ================================================================== */

  /* Antes de oferecer o botão: dá para gravar o comparativo aqui, entre estas
     duas visitas? Devolve também `pontos` e `duracaoSeg` do plano, para a
     tela poder dizer o tamanho antes de a pessoa esperar. */
  Rel.podeGravarComparativo = function (tourA, tourB, viewer) {
    if (!M()) return { ok: false, motivo: "O motor do tour (js/tour360.js) não carregou nesta página." };
    if (!tourA || !tourB) return { ok: false, motivo: "Escolha a visita anterior com a qual esta deve ser comparada." };
    if (txt(tourA.id) && txt(tourA.id) === txt(tourB.id)) {
      return { ok: false, motivo: "As duas visitas escolhidas são a mesma — escolha uma visita anterior." };
    }
    var vw = viewer || V();
    var base = Rel.podeGravar(vw);
    if (!base.ok) return base;
    if (!vw || typeof vw.abrirComparativo !== "function") {
      return { ok: false, motivo: "Este visualizador não sabe mostrar as duas visitas lado a lado. Atualize o aplicativo, ou grave o vídeo simples desta visita." };
    }

    var ord = Rel.ordenarVisitas(tourA, tourB);
    var plano = M().planoComparativo(ord.antes, ord.depois, {});
    if (!plano.ok) return { ok: false, motivo: plano.motivo };

    return {
      ok: true,
      formato: base.formato, ext: base.ext, universal: base.universal, aviso: base.aviso,
      pontos: plano.pontos, duracaoSeg: plano.duracaoSeg,
      dataAntes: txt(ord.antes.data), dataDepois: txt(ord.depois.data),
      trocou: ord.trocou
    };
  };

  /* Grava o vídeo antes-e-depois: cada estação abre mostrando o ANTES e o
     DEPOIS entra varrendo por cima, com a data de cada trecho na faixa.
     A ordem das visitas sai da DATA, não da ordem dos argumentos — ver o
     item 8 do cabeçalho. Mesmo retorno de `Rel.gravar`, com as duas datas. */
  Rel.gravarComparativo = function (tourA, tourB, viewer, opts) {
    if (!M()) return Promise.reject(new Error("O motor do tour não carregou nesta página."));
    if (!tourA || !tourB) return Promise.reject(new Error("Escolha as DUAS visitas que devem entrar no vídeo comparativo."));
    if (txt(tourA.id) && txt(tourA.id) === txt(tourB.id)) {
      return Promise.reject(new Error("As duas visitas escolhidas são a mesma — escolha uma visita anterior para comparar."));
    }

    var ord = Rel.ordenarVisitas(tourA, tourB);
    /* cópia rasa: mexer no objeto de quem chamou faria a próxima gravação
       simples sair comparativa sem ninguém ter pedido */
    var o = {}, k, src = opts || {};
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) o[k] = src[k];
    o.comparativo = ord.depois;

    return Rel.gravar(ord.antes, viewer, o).then(function (res) {
      res.comparativo = true;
      res.dataAntes = txt(ord.antes.data);
      res.dataDepois = txt(ord.depois.data);
      res.trocou = ord.trocou;
      return res;
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
