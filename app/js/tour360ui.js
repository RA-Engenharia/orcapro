/* =====================================================================
 * tour360ui.js — A TELA do Tour Virtual 360.
 *
 * O motor da conta é js/tour360.js (puro, roda no gate em Node) e a esfera
 * é js/tour360view.js (WebGL). Aqui só há tela: listar visitas, montar o
 * editor de estações, dar palco ao visualizador e traduzir clique em
 * chamada de motor. Nenhuma conta de geometria mora neste arquivo — se a
 * tela calculasse "só para mostrar", nasceria um segundo número, e o
 * segundo número é sempre o que aparece na hora errada.
 *
 * ⚠ ESTE ARQUIVO NÃO MORA NO gestao.js DE PROPÓSITO, como carpintariaui.js
 *   e remunvarui.js. O engate são três coisas que o gestao.js expõe:
 *   `Gestao.ui` (helpers de tela), `Gestao.registrarAcoes` (o dispatcher de
 *   `data-gacao`, já com RBAC de graça) e `Gestao.registrarWire` (a fiação
 *   pós-render). Por isso o <script> vem DEPOIS do js/gestao.js.
 *
 * ---------------------------------------------------------------------
 * QUATRO ARMADILHAS QUE ESTA TELA EVITA
 * ---------------------------------------------------------------------
 *
 * 1) DOIS CONTEXTOS WEBGL VIVOS DERRUBAM OS DOIS. O viewer BIM monta o
 *    contexto dele dentro do próprio `Gestao.afterRender`. Se o tour só
 *    largasse o palco no quadro seguinte, o BIM subiria com o nosso ainda
 *    vivo. Por isso o gancho de saída entra ANTES do afterRender da casa
 *    (ver `G.afterRender` no fim do arquivo) — síncrono, antes de o próximo
 *    módulo montar o dele.
 *
 * 2) RECUSA DE MEDIDA SEM PORTA É PIOR QUE MEDIDA ERRADA. Quando o motor
 *    devolve `{ok:false}`, a tela mostra o `motivo` INTEIRO — ele já ensina
 *    a saída — e, no caso `sem-altura`, oferece o botão de calibrar por
 *    distância conhecida. Sem isso o usuário inventa um número pior do que
 *    o que a trava evitou.
 *
 * 3) A MEDIDA GRAVADA GUARDA OS CLIQUES BRUTOS, NUNCA OS CORRIGIDOS.
 *    `Tour360.recalcular` aplica `corrigir()` na leitura. Gravar o ângulo já
 *    corrigido faria a correção entrar DUAS vezes, e o histórico inteiro
 *    passaria a mentir no dia em que alguém acertasse o nivelamento da foto.
 *
 * 4) FOTO 360 NÃO É FOTO DE DIÁRIO. `Fotos.guardar` reduz para 1600 px por
 *    padrão — num equiretangular isso vira 800 px de altura, e a obra fica
 *    ilegível ao dar zoom. Aqui vai `larguraMax: 4096`, que é o teto seguro
 *    de textura na maioria dos celulares. Ver `_guardarFoto`.
 *
 * 5) UM SELETOR DE FOTO SÓ, COM `capture`, DEIXA O PANORAMA INALCANÇÁVEL.
 *    `capture="environment"` abre a câmera direto e, em vários Androids,
 *    TIRA A GALERIA DA JOGADA (está documentado no cabeçalho do
 *    js/tour360cap.js). Enquanto este era o único seletor da tela, a foto
 *    tirada no modo Panorama do celular não tinha por onde entrar — e o
 *    módulo de captura ainda mandava, num toast, "toque em Importar
 *    panorama aqui", apontando para um botão que não existia. Agora são
 *    dois caminhos lado a lado: "Tirar foto" (com `capture`) e "Importar
 *    panorama" (`Tour360Cap.abrirSeletor({captura:false})`). Os dois caem
 *    no mesmo `_receberFoto` — dois seletores, uma régua de compressão só.
 *
 * 6) A NAVEGAÇÃO É DO MOTOR; AQUI SÓ HÁ FIAÇÃO. As setas saem de
 *    `Tour360.setasDe`, a ligação de `Tour360.ligarVizinhos`, o rumo pela
 *    planta de `Tour360.rumoPelaPlanta`. Esta tela não soma nem subtrai
 *    ângulo nenhum: se ela "ajeitasse" o yaw para desenhar, nasceria um
 *    segundo número — e o segundo número aparece sempre na hora errada
 *    (aqui seria a seta na parede errada, no app OU no Portal do cliente).
 *
 * 7) O PINO DA PLANTA É FRAÇÃO (0..1), NUNCA PIXEL. A mesma planta é
 *    desenhada em três tamanhos diferentes — o cartão do editor, o minimapa
 *    dentro do palco e a tela do cliente no Portal. Gravado em pixel, o pino
 *    andaria em dois desses três lugares, e ninguém saberia qual é o certo.
 *    Gravado em fração, o `left:%`/`top:%` do CSS acerta em todos.
 *
 * ⚠ 8) O VIEWER É ESCRITO EM PARALELO A ESTA TELA. Toda função nova dele
 *    (`setas`, `aoSeta`, `telaCheia`, `girarPara`, `teclado`) é chamada
 *    atrás de `typeof`: um TypeError aqui não derruba só a seta — ele
 *    estoura dentro do wire e o palco inteiro fica preto e mudo.
 * ===================================================================== */
(function (global) {
  "use strict";

  if (typeof global.Gestao === "undefined") return;   // sem Gestão não há tela

  var G = global.Gestao;
  var K = G.ui;
  var ENT = "tour360";

  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function esc(s) { return Util.esc(s == null ? "" : String(s)); }
  function n2(v) { return (v == null || v === "") ? "—" : Util.fmtNum(v, 2); }
  function n1(v) { return (v == null || v === "") ? "—" : Util.fmtNum(v, 1); }

  /* O motor e a esfera podem simplesmente não ter carregado (arquivo fora do
     index.html, pacote incompleto). Perguntar sempre, em vez de guardar a
     referência no topo: tela branca o usuário lê como "sistema quebrado". */
  function motor() { return global.Tour360; }
  function vista() { return global.Tour360View; }

  /* ---------------------------------------------------------------------
   * ESTADO DA TELA — mora em G, como nos outros módulos em arquivo próprio,
   * para sobreviver ao re-render (que é innerHTML novo a cada ação).
   * ------------------------------------------------------------------- */
  G._t360Tour = "";          // id da visita aberta (vazio = lista)
  G._t360Pid = "";           // pid da estação aberta no visualizador
  G._t360Modo = "girar";     // girar | medir | comentar | comparar | projetado
  G._t360TipoMedida = "chao";
  G._t360Cliques = [];       // pontas da medida em curso
  G._t360Medida = null;      // último retorno do motor, para desenhar
  G._t360Comparar = "";      // id do outro tour escolhido
  G._t360ParPid = "";        // pid aberto no comparativo
  G._t360Cortina = 0.5;
  G._t360Opacidade = 0.5;    // quanto do projeto aparece por cima da foto
  G._t360FotoPid = "";       // de qual estação é a foto que está sendo escolhida
  G._t360AreaCliques = [];   // cantos do piso da área em curso
  G._t360Area = null;        // último retorno de Tour360.medirArea (parcial ou fechada)
  G._t360AreaFechada = false;
  G._t360PosPid = "";        // estação escolhida para posicionar na planta
  G._t360Mini = true;        // minimapa aberto dentro do palco
  /* rumo a restaurar depois de trocar de estação. É o que faz a seta parecer
     ANDAR: quem passa pela porta continua olhando para o mesmo lado, em vez
     de ser jogado no norte da foto nova. */
  G._t360Rumo = null;
  G._t360RenderAoSair = false;   // trocou de estação em tela cheia: re-render ao sair
  /* chave do que está DENTRO da esfera agora. Sem ela, cada re-render (e todo
     clique re-renderiza) recarregaria a foto e jogaria a câmera de volta ao
     norte — a pessoa perderia o enquadramento a cada comentário. */
  G._t360Carregado = "";
  G._t360Carregando = "";

  /* ---------------------------------------------------------------------
   * LEITURA DOS REGISTROS
   * ------------------------------------------------------------------- */

  /* ⚠ FILTRO DE OBRA APLICADO DUAS VEZES, DE PROPÓSITO. `K.lista` só poda as
     entidades declaradas em ENT_POR_OBRA (js/gestao.js), e "tour360" ainda
     não está lá. Enquanto não estiver, o sub-usuário restrito a uma obra
     enxergaria a visita de todas as outras — inclusive as fotos. `podeObra`
     é a mesma régua do funil, então o dia em que a entidade entrar na lista
     este filtro vira redundância inofensiva, nunca contradição. */
  function listaTours() {
    return Util.arr(K.lista(ENT)).filter(function (t) {
      if (!t) return false;
      if (typeof Auth === "undefined" || !Auth.podeObra) return true;
      return Auth.podeObra(t.obraId);
    });
  }

  function tourAberto() {
    if (!G._t360Tour) return null;
    var t = Store.obter(eid(), ENT, G._t360Tour);
    if (!t) return null;
    if (typeof Auth !== "undefined" && Auth.podeObra && !Auth.podeObra(t.obraId)) return null;
    return t;
  }

  function pontoAberto(t) {
    if (!t || !G._t360Pid || !motor()) return null;
    return motor().pontoDe(t, G._t360Pid);
  }

  function obraDe(t) {
    if (!t || !t.obraId) return null;
    return Store.obter(eid(), "obras", t.obraId);
  }

  function nomeObra(t) {
    var o = obraDe(t);
    return o ? (o.nome || t.obraId) : (t && t.obraNome) || "—";
  }

  /* ⚠ CARIMBAR O REMOTO ANTES DE GRAVAR. A foto sobe por uma fila; o retorno
     do id remoto é guardado por `Fotos.lembrarRemoto` num mapa à parte. Quem
     salva o registro sem carimbar deixa a referência só com o id LOCAL — que
     existe apenas no aparelho que fotografou —, e o outro computador (e o
     Portal) nunca acham a imagem, sem erro nenhum na tela.
     ⚠ E NUNCA reatribuir `Fotos.aoSubir`: esse gancho já é de
     `Gestao._ligarRetornoDeFoto`, e sobrescrevê-lo quebra em silêncio o
     retorno das fotos do diário. */
  function salvarTour(t, semRepublicar) {
    try {
      if (typeof Fotos !== "undefined" && Fotos.carimbarRemotos) {
        var refs = [];
        /* ⚠ SÃO DUAS IMAGENS POR ESTAÇÃO. A foto 360 e o retrato do projeto (o
           render do BIM guardado para o comparativo projetado × executado). A
           segunda é fácil de esquecer porque não parece foto — e sem o carimbo
           ela nunca aprende o endereço no servidor: fica só neste aparelho,
           invisível no computador do escritório, e a cascata de exclusão da
           obra não consegue apagá-la do servidor depois. */
        Util.arr(t.pontos).forEach(function (p) {
          if (!p) return;
          if (p.foto) refs.push(p.foto);
          if (p.projecao && p.projecao.foto) refs.push(p.projecao.foto);
        });
        /* ⚠ E A PLANTA BAIXA, que não está dentro de ponto nenhum. Sem o
           carimbo, a imagem da planta fica só neste aparelho: o computador do
           escritório abre a visita sem minimapa, e `Tour360.paraPortal`
           descarta a planta (ela cai na regra "foto que não subiu não sai"),
           então o cliente recebe um tour com pinos que não existem. */
        if (t.planta && t.planta.foto) refs.push(t.planta.foto);
        Fotos.carimbarRemotos(refs);
      }
    } catch (e) {}
    var gravado = Store.salvar(eid(), ENT, t);
    /* ⚠ `Store.salvar` DEVOLVE null QUANDO NÃO CONSEGUE GRAVAR (cota do
       localStorage estourada é o caso comum, e uma base de obra chega lá). O
       retorno era ignorado em todos os caminhos daqui, e logo depois vinha um
       "Foto anexada" / "Comentário salvo" — o app afirmando que guardou o que
       ele acabou de perder. A pessoa fecha a tela confiando no recado.
       O aviso mora AQUI, no ponto único de gravação, e diz o que fazer. */
    if (!gravado) {
      UI.toast("NÃO consegui gravar esta visita — o armazenamento do navegador está cheio. Faça um backup em Configurações e apague visitas antigas antes de tentar de novo. O que você acabou de fazer NÃO foi salvo.", "erro");
      return null;
    }
    /* ⚠ MEXER NUMA VISITA QUE JÁ ESTÁ NO AR É MEXER NO QUE O CLIENTE VÊ.
       O Portal é um RETRATO enviado ao servidor: apagar aqui um comentário
       publicado por engano — ou uma medida errada, ou uma estação inteira —
       não tira NADA de lá enquanto a obra não for reenviada. O engenheiro vê
       o item sumir da tela dele e conclui que resolveu; o cliente continua
       lendo o apontamento apagado, por tempo indeterminado.
       Fica AQUI, e não em cada handler, porque este é o único caminho por
       onde a visita é gravada: espalhar a chamada é garantir que o próximo
       handler novo esqueça. `_republicarPortal` serializa por obra, então
       várias exclusões seguidas viram um envio e um reenvio com o estado
       final. Quem publica (o handler `t360-publicar`) passa `true` porque
       republica com retorno próprio, para poder falar com o usuário. */
    if (gravado && !semRepublicar && G._republicarTourSeNoAr) {
      try { G._republicarTourSeNoAr(t); } catch (e2) {}
    }
    return gravado;
  }

  function quemSou() {
    var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
    return {
      autorId: String(u._usuarioId || ""),
      autor: (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : ""
    };
  }

  /* ---------------------------------------------------------------------
   * CAIXAS DE TEXTO REUSADAS
   * ------------------------------------------------------------------- */
  function caixaAviso(titulo, corpoHtml) {
    return '<div class="card mb t360-aviso" style="border-left:4px solid var(--ambar,#b45309)">'
      + "<b>" + esc(titulo) + "</b>" + (corpoHtml ? "<div>" + corpoHtml + "</div>" : "") + "</div>";
  }
  function caixaErro(titulo, corpoHtml) {
    return '<div class="card mb t360-erro" style="border-left:4px solid #dc2626">'
      + "<b>" + esc(titulo) + "</b>" + (corpoHtml ? "<div>" + corpoHtml + "</div>" : "") + "</div>";
  }
  function lista_ul(itens) {
    if (!itens || !itens.length) return "";
    return '<ul style="margin:8px 0 0 18px">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }

  /* ===================================================================
   * A TELA
   * =================================================================== */
  G.renderTour360 = function () {
    /* RBAC em FUNÇÃO, primeira linha: esconder o item do menu nunca protegeu
       nada, porque a view chega por deep-link e por busca. */
    if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("tour360")) return G._semPermissao("tour360");
    if (!motor()) return G._moduloNaoCarregado("Tour Virtual 360", "js/tour360.js");

    var t = tourAberto();
    if (t && G._t360Pid) return _visualizador(t);
    if (t) return _editor(t);
    /* o id ficou apontando para uma visita apagada em outro aparelho: volta à
       lista em vez de insistir numa tela que não existe mais */
    if (G._t360Tour) { G._t360Tour = ""; G._t360Pid = ""; }
    return _lista();
  };

  /* ===================================================================
   * 1. LISTA DE VISITAS
   * =================================================================== */
  function _lista() {
    var M = motor();
    var ts = listaTours().slice().sort(function (a, b) {
      return String(b.data || "").localeCompare(String(a.data || ""));
    });

    var html = G._head(K.svg("galeria") + "Tour Virtual 360", "t360-nova", "Nova visita");
    html += '<p class="muted t360-legenda" style="margin:-4px 0 14px">'
      + "Cada visita é um conjunto de <b>estações</b> — pontos fixos da obra onde a foto 360 é tirada. "
      + "A comparação entre dois meses só existe quando a visita nova nasce da anterior, pelo botão "
      + "<b>Repetir visita</b>: é o que faz a estação de setembro ser a MESMA de agosto.</p>";

    if (!ts.length) return html + K.vazioBox("Nenhuma visita 360 registrada", "t360-nova", "Registrar a primeira visita");

    /* ⚠ O AVISO DE ESPAÇO NA NUVEM PRECISA APARECER, E CEDO.
       A entidade inteira vai num documento de 1 MiB e o js/nuvem.js avisa só
       a 900 KB — perto demais do fim: passado o teto, a sincronização daquele
       cliente PARA, em silêncio, com o app dizendo "Sincronizado". Medido, uma
       visita de 15 estações com 6 comentários pesa 31 KB, e uma obra de dois
       anos com visita quinzenal chega lá sem nada de anormal.
       O motor devolve o texto pronto, com o nome da visita mais gorda — sem
       isso o aviso não teria ação, só susto. E o comentário do js/nuvem.js
       afirma, em letra de fôrma, que esta tela avisa: enquanto a chamada não
       existisse, a afirmação era falsa. */
    var w = M.peso ? M.peso(listaTours()) : null;
    if (w && w.estado !== "ok") {
      html += caixaAviso(w.estado === "perigo" ? "A sincronização está prestes a parar" : "Espaço na nuvem",
        "<p>" + esc(w.aviso) + "</p>");
    }

    html += '<table class="tbl t360-tabela"><thead><tr><th>Data</th><th>Visita</th><th>Obra</th>'
      + '<th class="num">Estações</th><th class="num">Com foto</th><th>Situação</th><th></th></tr></thead><tbody>';

    ts.forEach(function (t) {
      var r = M.resumo(t);
      var ob = obraDe(t);
      /* ⚠ `temPortal` é do MOTOR e não é enfeite: ele separa "publicado"
         (o cliente vê) de "pronto" (falta a obra ter Portal). Quem afirma que
         o cliente está vendo é quem sabe que existe Portal — por isso a
         resposta vem do cadastro da obra, não de um `true` cravado. */
      var est = M.estadoDe(t, !!(ob && ob.portalUser));
      var rotEstado = est === "publicado" ? "Publicada para o cliente"
        : est === "pronto" ? "Pronta (obra sem Portal)" : "Rascunho";

      html += '<tr class="t360-linha"><td><b>' + esc(Util.fmtDia(t.data) || t.data) + "</b></td>"
        /* ⚠ o título é TEXTO, não botão: `data-gacao` só em <button> e <select>.
           Em qualquer outro elemento o dispatcher vira armadilha — ele escuta
           clique, e um clique acidental numa célula re-renderiza a tela. */
        + "<td>" + esc(t.titulo || "—") + "</td>"
        + "<td>" + esc(nomeObra(t)) + "</td>"
        + '<td class="num">' + r.pontos + "</td>"
        + '<td class="num">' + r.comFoto + (r.semFoto ? ' <span class="muted">(' + r.semFoto + " sem)</span>" : "") + "</td>"
        + "<td>" + esc(rotEstado) + (r.fotosPendentes ? ' <span class="muted">· ' + r.fotosPendentes + " foto(s) por subir</span>" : "") + "</td>"
        + '<td class="t360-acoes" style="white-space:nowrap">'
        + '<button class="btn sm" data-gacao="t360-abrir" data-id="' + esc(t.id) + '">Abrir</button> '
        /* ⚠ ESTE BOTÃO É O QUE FAZ O COMPARATIVO EXISTIR. Criar a visita nova
           pelo "+ Nova visita" gera pontos com pid novo, e `Tour360.parear`
           devolve dois conjuntos de órfãos — corretamente, porque casar por
           semelhança é o defeito que esta casa não repete. O texto do botão
           precisa dizer isso; quem não souber vai criar do zero. */
        + '<button class="btn sm" data-gacao="t360-repetir" data-id="' + esc(t.id) + '" '
        + 'title="Cria a próxima visita com os mesmos pontos desta, para comparar mês a mês">Repetir visita</button> '
        + '<button class="btn sm primary" data-gacao="t360-publicar" data-id="' + esc(t.id) + '">Publicar</button>'
        + "</td></tr>";
    });

    return html + "</tbody></table>";
  }

  /* ===================================================================
   * 2. EDITOR DE UMA VISITA
   * =================================================================== */
  function _editor(t) {
    var M = motor();
    var val = M.validar(t);
    var cabe = M.cabePonto(t);
    var r = M.resumo(t);

    /* ⚠ O RELATÓRIO E O VÍDEO PRECISAM DE BOTÃO AQUI. js/tour360rel.js nasceu
       pronto e testado e ficou uma revisão inteira sem nenhuma chamada — quer
       dizer, existia no gate e não existia no navegador. É o defeito que o
       CLAUDE.md deste repositório chama de "motor sem fiação", e ele não se
       manifesta como erro: manifesta-se como recurso que ninguém acha. */
    var temRel = (typeof global.Tour360Rel !== "undefined");
    var extra = '<span class="muted" style="margin-right:12px;align-self:center">'
      + esc(nomeObra(t)) + " · " + esc(Util.fmtDia(t.data) || t.data) + "</span>"
      + (temRel
          ? '<button class="btn sm" data-gacao="t360-relatorio" data-id="' + esc(t.id) + '">Relatório fotográfico</button> '
            + '<button class="btn sm" data-gacao="t360-video" data-id="' + esc(t.id) + '">Gerar vídeo</button> '
          : "")
      + '<button class="btn sm" data-gacao="t360-voltar">Voltar à lista</button> ';

    var html = G._head(K.svg("galeria") + esc(t.titulo || "Visita"), null, null, extra);

    html += '<div class="card mb t360-resumo"><div class="flex" style="gap:22px;flex-wrap:wrap">'
      + '<span><b>' + r.pontos + "</b> estação(ões)</span>"
      + '<span><b>' + r.comFoto + "</b> com foto</span>"
      + '<span><b>' + r.comentarios + "</b> comentário(s)</span>"
      + '<span><b>' + r.pontosDeAtencao + "</b> ponto(s) de atenção</span>"
      + '<span><b>' + r.medidas + "</b> medida(s)</span>"
      + (r.fotosPendentes ? '<span class="muted">' + r.fotosPendentes + " foto(s) ainda subindo</span>" : "")
      + "</div>"
      + (t.baseadoEm ? '<p class="muted" style="margin:10px 0 0">Esta visita nasceu de outra: as estações têm o mesmo identificador, então o comparativo funciona.</p>' : "")
      + "</div>";

    if (val.erros.length) html += caixaErro("Antes de publicar", lista_ul(val.erros));
    /* ⚠ CAIXA DIFERENTE, DE PROPÓSITO: erro trava, aviso não. Ponto sem foto
       precisa APARECER — sumir calado é pior que travar. */
    if (val.avisos.length) html += caixaAviso("Para você saber", lista_ul(val.avisos));

    var ps = Util.arr(t.pontos);
    if (!ps.length) {
      html += K.vazioBox("Esta visita ainda não tem estação nenhuma", "t360-add-ponto", "Adicionar a primeira estação");
    } else {
      html += '<table class="tbl t360-pontos"><thead><tr><th></th><th>Estação</th><th>Nível</th>'
        + '<th class="num">Altura da câmera</th><th class="num">Comentários</th><th class="num">Medidas</th><th></th></tr></thead><tbody>';
      ps.forEach(function (p) {
        var temFoto = !!p.foto;
        html += '<tr class="t360-ponto">'
          /* a miniatura é preenchida depois do DOM existir: `Fotos.dataURI` é
             assíncrono e `Fotos.url` NÃO serve em <img src> (o servidor exige
             o header x-licenca e a imagem não carrega) */
          + '<td><span class="t360-thumb" data-t360foto="' + esc(p.pid) + '">'
          + (temFoto ? "" : '<span class="muted t360-sem-foto">sem foto</span>') + "</span></td>"
          + "<td><b>" + esc(p.nome) + "</b>"
          + (p.tipo !== "equirect" ? ' <span class="muted">(foto comum — não gira em 360)</span>' : "")
          + "</td>"
          + "<td>" + esc(p.nivel || "—") + "</td>"
          + '<td class="num">' + n2(p.alturaCam) + " m</td>"
          + '<td class="num">' + Util.arr(p.hotspots).length + "</td>"
          + '<td class="num">' + Util.arr(p.medidas).length + "</td>"
          + '<td class="t360-acoes" style="white-space:nowrap">'
          + (temFoto ? '<button class="btn sm primary" data-gacao="t360-ver" data-pid="' + esc(p.pid) + '">Abrir 360</button> ' : "")
          /* ⚠ SÃO DOIS BOTÕES DE PROPÓSITO — ver a armadilha 5 do cabeçalho.
             "Tirar foto" leva `capture` e abre a câmera; "Importar panorama"
             NÃO leva, e é o único caminho até a galeria em vários Androids —
             que é justamente onde mora a foto tirada no modo Panorama. */
          + '<button class="btn sm" data-gacao="t360-foto" data-pid="' + esc(p.pid) + '" '
          + 'title="Abre a câmera do aparelho">' + (temFoto ? "Trocar: tirar foto" : "Tirar foto") + "</button> "
          + '<button class="btn sm" data-gacao="t360-importar" data-pid="' + esc(p.pid) + '" '
          + 'title="Abre a galeria: é por aqui que entra a foto tirada no modo Panorama do celular">Importar panorama</button> '
          /* ⚠ o botao de girar no app so nasce quando o aparelho e o endereco
             permitem: no celular, pela rede da obra (http), getUserMedia nao
             existe. Botao que aparece e falha depois e pior que botao ausente. */
          + (podeGirar() ? '<button class="btn sm" data-gacao="t360-capturar-girando" data-pid="' + esc(p.pid) + '">Capturar girando</button> ' : "")
          + '<button class="btn sm" data-gacao="t360-editar-ponto" data-pid="' + esc(p.pid) + '">Editar</button> '
          + '<button class="btn sm danger" data-gacao="t360-excluir-ponto" data-pid="' + esc(p.pid) + '">Excluir</button>'
          + "</td></tr>";
      });
      html += "</tbody></table>";
    }

    html += _cartaoPlanta(t);

    html += '<div class="flex mt t360-rodape">'
      + '<button class="btn primary" data-gacao="t360-add-ponto"' + (cabe.cabe ? "" : " disabled") + ">+ Adicionar estação</button>"
      + '<span class="muted" style="align-self:center;margin-left:12px">'
      + (cabe.cabe ? "Cabem mais " + cabe.restam + " estação(ões) nesta visita." : "Esta visita chegou ao limite de estações — um tour maior que isso ninguém navega.")
      + "</span>"
      + '<span style="flex:1"></span>'
      + '<button class="btn danger" data-gacao="t360-excluir-tour">Excluir esta visita</button>'
      + "</div>";

    /* ⚠ Os inputs de arquivo NÃO levam `data-gacao`: o dispatcher escuta clique
       e a tela re-renderizaria com o seletor de arquivo aberto. Eles são
       ligados por `registrarWire`, depois de o DOM existir.
       ⚠ E SÃO TRÊS, com atributos diferentes de propósito: o primeiro leva
       `capture="environment"` (abre a câmera), o segundo NÃO leva (é o único
       que enxerga a galeria em vários Androids, onde mora o panorama), e o
       terceiro é a planta baixa, que não é foto de obra nenhuma. Trocar o
       atributo de um input só, na hora do clique, não é confiável: o
       navegador já resolveu o comportamento do seletor quando ele nasceu.
       Estes são a REDE: o caminho normal é `Tour360Cap.abrirSeletor`. */
    html += '<input type="file" id="t360-foto-in" accept="image/*" capture="environment" style="display:none">'
      + '<input type="file" id="t360-foto-imp" accept="image/*" style="display:none">'
      + '<input type="file" id="t360-planta-in" accept="image/*" style="display:none">';
    return html;
  }

  /* ---------- o cartão da planta baixa (minimapa e posicionamento) ----------
   *
   * A planta mora no TOUR (`t.planta = {foto, nome}`) e a posição de cada
   * estação mora no PONTO (`p.planta = {x, y}`, em FRAÇÃO da imagem). O motor
   * herda os dois em `basearEm`, então quem posicionou os 12 pinos uma vez não
   * remarca nada na visita seguinte — é o mesmo princípio do `pid`.
   *
   * ⚠ FRAÇÃO, NUNCA PIXEL: ver a armadilha 7 do cabeçalho. */
  function _cartaoPlanta(t) {
    var ps = Util.arr(t.pontos);
    var comPino = ps.filter(function (x) { return x && x.planta; });

    var html = '<div class="card mb t360-planta"><b>Planta baixa desta visita</b>';

    if (!t.planta || !t.planta.foto) {
      html += '<p class="muted" style="margin:6px 0 10px">Com uma planta anexada, o visualizador ganha um <b>minimapa</b> no canto — um pino por estação, e o pino leva para lá. '
        + "O cliente vê o mesmo mapa no Portal. E quando ninguém fixou o rumo de uma seta na foto, ele sai da posição das duas estações na planta.</p>"
        + '<button class="btn" data-gacao="t360-planta-anexar">Anexar imagem da planta</button> '
        + (temPlantaBIM() ? '<button class="btn" data-gacao="t360-planta-bim">Usar a planta baixa do BIM</button> ' : "")
        + '<span class="muted">Serve qualquer imagem: a prancha exportada como PNG, uma foto do papel, ou o corte do modelo. '
        + "PDF não entra direto — exporte como imagem antes.</span>";
      return html + "</div>";
    }

    html += '<p class="muted" style="margin:6px 0 10px">Escolha a estação abaixo e <b>clique na planta</b> no lugar onde ela fica. '
      + comPino.length + " de " + ps.length + " estação(ões) posicionada(s).</p>";

    html += '<div class="row">' + K.campo("Estação a posicionar",
      '<select id="t360-pos-sel" data-gacao="t360-posicionar-sel">'
      + '<option value="">— escolha a estação —</option>'
      + ps.map(function (x) {
        return '<option value="' + esc(x.pid) + '"' + (x.pid === G._t360PosPid ? " selected" : "") + ">"
          + esc(x.nome) + (x.planta ? " (já posicionada)" : "") + "</option>";
      }).join("") + "</select>") + "</div>";

    /* ⚠ os pinos daqui são MARCADORES, não botões: `pointer-events:none`. Com
       eles clicáveis, tentar reposicionar uma estação em cima da outra
       acertava o pino e o clique nunca chegava à planta — e a pessoa concluía
       que "não dá para mover". */
    html += '<div id="t360-planta-quadro" style="position:relative;display:inline-block;max-width:100%;line-height:0;cursor:crosshair">'
      + '<img id="t360-planta-img" alt="Planta baixa da visita" style="display:block;max-width:100%;height:auto;border-radius:8px;border:1px solid var(--linha,#e2e8f0)">'
      + _pinosHtml(ps, G._t360PosPid) + "</div>";

    html += '<div class="flex mt" style="gap:8px;flex-wrap:wrap">'
      + '<button class="btn sm" data-gacao="t360-planta-anexar">Trocar a imagem</button> '
      + (temPlantaBIM() ? '<button class="btn sm" data-gacao="t360-planta-bim">Trocar pela planta do BIM</button> ' : "")
      + '<button class="btn sm danger" data-gacao="t360-planta-remover">Remover a planta</button>'
      + "</div>";

    if (comPino.length) {
      html += '<table class="tbl mt t360-pinos"><thead><tr><th>#</th><th>Estação</th><th class="num">Posição na planta</th><th></th></tr></thead><tbody>';
      comPino.forEach(function (x, i) {
        html += "<tr><td>" + (i + 1) + "</td><td>" + esc(x.nome) + "</td>"
          /* a posição sai em % da imagem porque é isso que está gravado —
             mostrar "metro" aqui seria inventar uma escala que a planta não
             tem, e alguém acabaria orçando por ela */
          + '<td class="num">' + pct(x.planta.x) + "% × " + pct(x.planta.y) + "%</td>"
          + '<td><button class="btn sm" data-gacao="t360-tirar-pino" data-pid="' + esc(x.pid) + '">Tirar o pino</button></td></tr>';
      });
      html += "</tbody></table>";
    }

    return html + "</div>";
  }

  /* Os pinos por cima da planta, em porcentagem da imagem. `destaque` é o pid
     que fica em outra cor (a estação escolhida no editor, ou a estação aberta
     no minimapa). */
  function _pinosHtml(pontos, destaque) {
    var out = "", k = 0;
    Util.arr(pontos).forEach(function (x) {
      if (!x || !x.planta) return;
      k++;
      var ehEle = (x.pid === destaque);
      out += '<span title="' + esc(x.nome || "") + (x.foto ? "" : " (sem foto)") + '" style="position:absolute;'
        + "left:" + pct(x.planta.x) + "%;top:" + pct(x.planta.y) + "%;transform:translate(-50%,-50%);pointer-events:none;"
        + "min-width:22px;height:22px;border-radius:999px;text-align:center;"
        + "background:" + (ehEle ? "var(--verde,#15803d)" : "var(--aco,#2e6f9e)") + ";color:#fff;"
        + "font:700 11px/22px var(--fonte,system-ui,sans-serif);"
        /* dois anéis, claro e escuro: a planta pode ser branca (prancha) ou
           escura (render), e um anel só some em metade dos casos */
        + 'box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(0,0,0,.45)">' + k + "</span>";
    });
    return out;
  }

  function pct(v) { return Math.round(Util.num(v) * 1000) / 10; }

  /* O botão da planta do BIM só nasce quando o BIM foi montado nesta sessão —
     `cameraAtual()` é o mesmo sinal que a âncora usa. Botão que aparece e
     falha depois é pior que botão ausente. */
  function temPlantaBIM() {
    var B = global.BIM;
    if (!B || typeof B.plantaBaixa !== "function" || typeof B.cameraAtual !== "function") return false;
    try { return !!B.cameraAtual(); } catch (e) { return false; }
  }

  /* ===================================================================
   * 3. VISUALIZADOR
   * =================================================================== */
  function _visualizador(t) {
    var M = motor();
    var p = pontoAberto(t);
    if (!p) { G._t360Pid = ""; return _editor(t); }

    /* ⚠ O VÍDEO SÓ PODE SER PEDIDO DAQUI, e por isso o botão vive aqui.
       A gravação copia quadro a quadro o canvas do visualizador; sem o palco
       montado não há quadro nenhum e o arquivo sairia preto. Enquanto os dois
       botões existiam SÓ na lista de estações — onde o palco está sempre
       desmontado — clicar em "Gerar vídeo" batia direto na guarda e devolvia
       "abra uma estação antes": o recurso existia e era inalcançável.
       O relatório fotográfico não tem essa dependência, mas fica ao lado
       porque é aqui que a pessoa está olhando a visita. */
    var temRel2 = (typeof global.Tour360Rel !== "undefined");
    var extra = '<span class="muted" style="margin-right:12px;align-self:center">'
      + esc(t.titulo || "Visita") + " · " + esc(Util.fmtDia(t.data) || t.data) + "</span>"
      + (temRel2
          ? '<button class="btn sm" data-gacao="t360-relatorio" data-id="' + esc(t.id) + '">Relatório fotográfico</button> '
            + '<button class="btn sm" data-gacao="t360-video" data-id="' + esc(t.id) + '">Gerar vídeo</button> '
          : "")
      + '<button class="btn sm" data-gacao="t360-fechar-visualizador">Voltar às estações</button> ';

    var html = G._head(K.svg("galeria") + esc(p.nome || "Estação"), null, null, extra);

    /* trocar de estação sem sair do visualizador: só entram as que têm foto,
       porque abrir uma esfera vazia é palco preto e mudo */
    var comFoto = Util.arr(t.pontos).filter(function (x) { return !!x.foto; });
    if (comFoto.length > 1) {
      html += '<div class="row t360-navponto">' + K.campo("Estação",
        '<select id="t360-ponto-sel" data-gacao="t360-ponto-sel">'
        + comFoto.map(function (x) {
          return '<option value="' + esc(x.pid) + '"' + (x.pid === p.pid ? " selected" : "") + ">" + esc(x.nome) + "</option>";
        }).join("") + "</select>") + "</div>";
    }

    /* barra de ferramentas */
    var modos = [
      ["girar", "Girar"],
      ["medir", "Medir"],
      ["area", "Medir área"],
      ["comentar", "Comentar"],
      ["comparar", "Comparar"],
      ["projetado", "Projetado × Executado"]
    ];
    html += '<div class="flex mb t360-barra" style="gap:6px;flex-wrap:wrap">' + modos.map(function (m) {
      return '<button class="btn sm ' + (m[0] === G._t360Modo ? "primary" : "") + '" data-gacao="t360-modo" data-modo="' + m[0] + '">' + esc(m[1]) + "</button>";
    }).join("")
      + '<span class="t360-barra-sep"></span>'
      /* ⚠ TELA CHEIA É O BÁSICO QUE FAZ O PRODUTO PARECER FÁCIL: numa foto 360
         dentro de um retângulo de 620 px, girar não convence ninguém. O botão
         chama `Tour360View.telaCheia`; enquanto o viewer não publicar essa
         função, a própria tela põe o palco em tela cheia (ver a ação). */
      + '<button class="btn sm" data-gacao="t360-telacheia" '
      + 'title="Tela cheia. Com o palco em foco, as setas do teclado giram e + / − aproximam.">Tela cheia</button> '
      + ((t.planta && t.planta.foto)
          ? '<button class="btn sm" data-gacao="t360-minimapa">' + (G._t360Mini ? "Esconder o minimapa" : "Mostrar o minimapa") + "</button>"
          : "")
      + "</div>";

    /* ⚠ O PALCO PRECISA DE ALTURA PRÓPRIA. Um host com `height:auto` mede 0 e
       o `redimensionar` do viewer desiste (`if (!w || !alt) return`) — o
       canvas fica de 0 px e a tela sai preta, sem erro nenhum. O resto do
       visual mora em css/tour360.css, na classe. */
    html += '<div id="t360-host" class="t360-host t360-palco" style="height:min(70vh,620px);position:relative;overflow:hidden"></div>';

    html += '<div class="t360-painel mt">';
    if (G._t360Modo === "medir") html += _painelMedir(t, p);
    else if (G._t360Modo === "area") html += _painelArea(t, p);
    else if (G._t360Modo === "comentar") html += _painelComentar(t, p);
    else if (G._t360Modo === "comparar") html += _painelComparar(t, p);
    else if (G._t360Modo === "projetado") html += _painelProjetado(t, p);
    else html += _painelGirar(t, p);
    html += "</div>";

    return html;
  }

  /* ---------- painel: girar (o padrão) ---------- */
  function _painelGirar(t, p) {
    var html = '<div class="card"><p class="muted" style="margin:0 0 8px">'
      + "Arraste para girar, use a roda (ou dois dedos) para aproximar. "
      + "Altura da câmera nesta estação: <b>" + n2(p.alturaCam) + " m</b> — é ela que transforma ângulo em metro, "
      + "e por isso ela aparece junto de toda medida em vez de ficar escondida.</p>";
    html += _listaComentarios(p) + _listaMedidas(p);
    return html + "</div>" + _painelPassagens(t, p);
  }

  /* ---------- painel: as passagens (as setas entre estações) ----------
   *
   * ⚠ ESTE É O EDITOR QUE FALTAVA. O campo `vizinhos` existia no registro
   *   desde o começo, era copiado de visita em visita por `basearEm` e
   *   atravessava a allowlist até o Portal do cliente — sem uma única tela
   *   que o escrevesse. Motor publicado sem fiação: o cliente recebia um
   *   "tour" em que a única forma de trocar de estação era achar o nome que o
   *   engenheiro deu à sala numa lista.
   *
   * O rumo da seta se define girando a foto até a passagem aparecer no centro
   * e clicando em "Fixar a seta aqui": o yaw vem de `Tour360View.pose()` e vai
   * cru para `Tour360.ligarVizinhos`, que grava a volta como o oposto. Nenhuma
   * conta de ângulo mora nesta tela — ver a armadilha 6 do cabeçalho. */
  function _painelPassagens(t, p) {
    var M = motor();
    var setas = (M && M.setasDe) ? M.setasDe(t, p) : [];
    var ligado = {}, i;
    for (i = 0; i < setas.length; i++) ligado[setas[i].pid] = true;

    var outros = Util.arr(t.pontos).filter(function (x) { return x && x.pid !== p.pid; });

    var html = '<div class="card mt t360-passagens"><b>Daqui se vai para:</b>';
    if (!outros.length) {
      return html + '<p class="muted" style="margin:6px 0 0">Esta visita só tem esta estação — não há para onde andar. '
        + "Volte às estações e acrescente a próxima.</p></div>";
    }

    html += '<p class="muted" style="margin:6px 0 10px">A seta na foto é o que transforma um álbum de fotos redondas em passeio. '
      + "A ligação vale nos <b>dois sentidos</b>: lá também nasce a seta de volta.</p>";

    if (!setas.length) {
      html += '<p class="muted">Nenhuma passagem ligada ainda.</p>';
    } else {
      /* o rumo GRAVADO é diferente do rumo VINDO DA PLANTA, e a diferença
         importa: o da planta muda sozinho quando alguém arrasta o pino, o
         gravado não. Dizer de onde ele veio é o que evita "eu não mexi nisso". */
      var vz = M.vizinhosDe ? M.vizinhosDe(p) : [];
      var temRumo = {};
      for (i = 0; i < vz.length; i++) if (vz[i].yaw !== null && vz[i].yaw !== undefined) temRumo[vz[i].pid] = true;

      /* ⚠ NÃO chame esta tabela de `t360-setas`: esse nome é da CAMADA de
         setas que o viewer cria dentro do palco (js/tour360view.js), e ele já
         escreve `.t360-setas{z-index:1}` na folha dele. Duas coisas com o
         mesmo nome de classe é a regra de um pegando o outro no dia em que
         alguém acrescentar `position:absolute` lá — e aí esta tabela some da
         tela sem ninguém entender por quê. */
      html += '<table class="tbl t360-tab-passagens"><thead><tr><th>Estação</th><th>Rumo da seta</th><th></th></tr></thead><tbody>';
      setas.forEach(function (s) {
        var semRumo = (s.yaw === null || s.yaw === undefined);
        html += "<tr><td><b>" + esc(s.nome) + "</b>"
          + (s.nivel ? ' <span class="muted">· ' + esc(s.nivel) + "</span>" : "")
          /* ⚠ vizinho sem foto NÃO vira seta no 360 (clicar levaria a um palco
             preto). Ele continua aqui, dito por extenso, senão o engenheiro
             liga a passagem e jura que o produto não a desenhou. */
          + (s.semFoto ? ' <span style="color:var(--ambar,#b45309)">sem foto — a seta só aparece no 360 quando esta estação tiver uma</span>' : "")
          + "</td><td>"
          + (semRumo
              ? '<span class="muted">sem rumo — gire até a passagem ficar no centro e clique em "Fixar a seta aqui"</span>'
              : n1(s.yaw) + "°" + (temRumo[s.pid] ? "" : ' <span class="muted">(veio da posição na planta)</span>'))
          + '</td><td style="white-space:nowrap">'
          + '<button class="btn sm" data-gacao="t360-fixar-seta" data-pid="' + esc(s.pid) + '" '
          + 'title="Grava, como rumo desta seta, a direção que você está vendo agora">Fixar a seta aqui</button> '
          + (s.semFoto ? "" : '<button class="btn sm primary" data-gacao="t360-ir-ponto" data-pid="' + esc(s.pid) + '">Ir</button> ')
          + '<button class="btn sm danger" data-gacao="t360-desligar" data-pid="' + esc(s.pid) + '">Desligar</button>'
          + "</td></tr>";
      });
      html += "</tbody></table>";
    }

    var livres = outros.filter(function (x) { return !ligado[x.pid]; });
    if (livres.length) {
      /* ⚠ o <select> aqui NÃO leva `data-gacao`: com ele, o clique para abrir
         a lista já dispararia a ação e a tela re-renderizaria com o dropdown
         aberto. Quem lê o valor é o botão, no clique. */
      html += '<div class="flex mt" style="gap:8px;align-items:center;flex-wrap:wrap">'
        + '<select id="t360-ligar-sel">' + livres.map(function (x) {
          return '<option value="' + esc(x.pid) + '">' + esc(x.nome) + (x.foto ? "" : " (sem foto)") + "</option>";
        }).join("") + "</select>"
        + '<button class="btn" data-gacao="t360-ligar">Ligar a esta estação</button>'
        + '<span class="muted">A seta nasce <b>sem rumo</b>: fixe-a depois, olhando para a passagem.</span></div>';
    }

    if (!t.planta || !t.planta.foto) {
      html += '<p class="muted" style="margin:10px 0 0">Esta visita não tem <b>planta baixa</b>: sem ela não há minimapa, '
        + 'e a seta sem rumo fixado não tem de onde sair. Anexe uma em "Voltar às estações".</p>';
    }
    return html + "</div>";
  }

  function _listaComentarios(p) {
    var hs = Util.arr(p.hotspots);
    if (!hs.length) return '<p class="muted">Nenhum comentário nesta estação.</p>';
    var html = '<table class="tbl t360-coments"><thead><tr><th>#</th><th>Tipo</th><th>Comentário</th><th>Autor</th><th>Portal</th><th></th></tr></thead><tbody>';
    hs.forEach(function (h, i) {
      html += '<tr data-t360coment="' + esc(h.hid) + '"><td>' + (i + 1) + "</td>"
        + '<td><span class="t360-chip t360-chip-' + esc(h.tipo || "comentario") + '">' + esc(rotuloTipo(h.tipo)) + "</span></td>"
        + "<td>" + esc(h.texto || "—") + "</td>"
        + "<td>" + esc(h.autor || "—") + "</td>"
        + "<td>" + (h.paraCliente ? "sim" : "não") + "</td>"
        + '<td><button class="btn sm danger" data-gacao="t360-excluir-coment" data-hid="' + esc(h.hid) + '">Excluir</button></td></tr>';
    });
    return html + "</tbody></table>";
  }

  function _listaMedidas(p) {
    var M = motor();
    var ms = Util.arr(p.medidas);
    if (!ms.length) return "";
    var html = '<table class="tbl t360-medidas mt"><thead><tr><th>Tipo</th><th>Rótulo</th><th class="num">Medida</th><th>Confiança</th><th>Portal</th><th></th></tr></thead><tbody>';
    ms.forEach(function (m) {
      /* ⚠ RECALCULA NA LEITURA, sempre. O registro guarda os cliques, não o
         resultado: quem corrigir a altura da câmera depois conserta o
         histórico inteiro em vez de deixar número velho mentindo na tela. */
      var r = M.recalcular(m, p);
      html += "<tr><td>" + (m.tipo === "altura" ? "Altura" : "Distância no chão") + "</td>"
        + "<td>" + esc(m.rotulo || "—") + "</td>"
        + '<td class="num">' + (r.ok ? "<b>" + n2(r.metros) + " m</b>" : '<span class="muted">—</span>') + "</td>"
        + "<td>" + (r.ok ? (r.aproximada ? "aproximada (±" + n1(r.erroEstimadoPct) + "%)" : "±" + n1(r.erroEstimadoPct) + "%") : esc(r.motivo)) + "</td>"
        + "<td>" + (m.paraCliente ? "sim" : "não") + "</td>"
        + '<td><button class="btn sm danger" data-gacao="t360-excluir-medida" data-mid="' + esc(m.mid) + '">Excluir</button></td></tr>';
    });
    return html + "</tbody></table>";
  }

  function rotuloTipo(x) {
    if (x === "atencao") return "Atenção";
    if (x === "pendencia") return "Pendência";
    if (x === "aprovado") return "Aprovado";
    return "Comentário";
  }

  /* ---------- painel: medir ---------- */
  function _painelMedir(t, p) {
    var cl = G._t360Cliques;
    var res = G._t360Medida;

    var html = '<div class="card"><div class="row">'
      + K.campo("O que medir", '<select id="t360-tipo-medida" data-gacao="t360-tipo-medida">'
        + '<option value="chao"' + (G._t360TipoMedida === "chao" ? " selected" : "") + ">Distância no chão (dois pontos no piso)</option>"
        + '<option value="altura"' + (G._t360TipoMedida === "altura" ? " selected" : "") + ">Altura (primeiro a base no chão, depois o topo)</option>"
        + "</select>")
      + K.campo("Altura da câmera", '<div style="padding-top:9px"><b>' + n2(p.alturaCam) + " m</b></div>")
      + K.campo("Cliques", '<div style="padding-top:9px">' + cl.length + " de 2</div>")
      + "</div>";

    html += '<p class="muted" style="margin:0 0 10px">'
      + (G._t360TipoMedida === "altura"
        ? "Marque primeiro onde a peça <b>encosta no chão</b> — é a base que dá a distância — e depois o topo."
        : "Marque os dois pontos <b>no piso</b>. Ponto perto da linha do horizonte não mede: meio grau de erro no dedo vira dezenas de metros.")
      + "</p>";

    if (res && res.ok === false) {
      /* ⚠ O MOTIVO SAI INTEIRO. Ele já ensina a saída (marcar onde encosta no
         chão, aproximar-se, calibrar) — resumir aqui devolveria ao usuário um
         "não deu" sem porta, e trava sem porta faz gente inventar número. */
      html += caixaErro("Não dá para medir assim", "<p>" + esc(res.motivo) + "</p>"
        + (res.codigo === "sem-altura"
          ? '<button class="btn primary" data-gacao="t360-calibrar">Calibrar por uma distância conhecida</button>'
            + '<span class="muted" style="margin-left:10px">Use os dois pontos que você acabou de marcar sobre algo cuja medida você sabe.</span>'
          : ""));
    } else if (res && res.ok) {
      var corpo = "<p style=\"font-size:20px;margin:6px 0\"><b>" + n2(res.metros) + " m</b>"
        + (res.aproximada ? ' <span class="muted">(aproximada)</span>' : "") + "</p>"
        /* ⚠ O NÚMERO NUNCA SAI SOZINHO quando é aproximado. `nota` diz o
           tamanho do erro e para que a medida serve — sem ela, ordem de
           grandeza vira cota de projeto na cabeça de quem lê. */
        + '<p class="muted">' + esc(res.nota) + "</p>"
        + '<div class="row">' + K.campo("Rótulo (opcional)", K.inp("t360-med-rotulo", ""))
        + K.campo("Mostrar para o cliente", '<label style="display:inline-flex;align-items:center;gap:6px;padding-top:9px"><input type="checkbox" id="t360-med-cli"> no Portal</label>')
        + "</div>"
        + '<div class="flex"><button class="btn primary" data-gacao="t360-salvar-medida">Guardar esta medida</button> '
        + '<button class="btn" data-gacao="t360-limpar-medida">Medir outra</button></div>';
      if (res.aproximada) html += caixaAviso("Medida aproximada", corpo);
      else html += '<div class="card mb t360-medida" style="border-left:4px solid var(--verde)">' + corpo + "</div>";
    }

    if (cl.length && !res) {
      html += '<div class="flex"><button class="btn" data-gacao="t360-limpar-medida">Recomeçar a medida</button></div>';
    }

    return html + _listaMedidas(p) + "</div>";
  }

  /* ---------- painel: medir ÁREA ----------
   *
   * A pergunta da obra é "quanto de contrapiso tem essa sala", e ela vira
   * linha de orçamento e de boletim. Medindo dois pontos por vez a pessoa soma
   * de cabeça — e é aí que nasce o número errado.
   *
   * ⚠ A ÁREA NÃO É GRAVADA COMO MEDIDA, e isso é decisão, não esquecimento.
   *   `Tour360.recalcular` só conhece "chao" e "altura": uma medida gravada
   *   com tipo "area" seria relida como distância entre dois pontos que não
   *   existem, e a lista de medidas mostraria a recusa do motor no lugar do
   *   metro quadrado — número que mente, que é pior que número nenhum. E
   *   `Tour360.PORTAL_MEDIDA` não tem campo de área, então ela também não
   *   chegaria ao cliente. A porta é guardar o resultado como COMENTÁRIO
   *   fixado no primeiro canto: ele atravessa para o Portal se a pessoa
   *   marcar, e o texto carrega o ± junto do número. */
  function _painelArea(t, p) {
    var cl = G._t360AreaCliques;
    var res = G._t360Area;

    var html = '<div class="card"><div class="row">'
      + K.campo("Altura da câmera", '<div style="padding-top:9px"><b>' + n2(p.alturaCam) + " m</b></div>")
      + K.campo("Cantos marcados", '<div style="padding-top:9px">' + cl.length + " <span class=\"muted\">(de 3 a 24)</span></div>")
      + "</div>";

    html += '<p class="muted" style="margin:0 0 10px">Clique nos <b>cantos do piso</b>, em volta da área, na ordem em que eles aparecem — '
      + "como quem contorna a sala com o dedo. A cada canto novo a área parcial aparece aqui. "
      + "Canto perto da linha do horizonte não mede: meio grau de erro no dedo vira dezenas de metros.</p>";

    if (res && res.ok === false) {
      /* ⚠ A RECUSA DIZ QUAL CANTO. O motor devolve `vertice` justamente para
         a pessoa saber onde ela errou — "não foi possível medir" faz remarcar
         os quatro cantos às cegas, e na terceira tentativa ela desiste e chuta
         a área. E a porta está do lado: apagar só o último canto. */
      html += caixaErro(res.vertice ? "O canto " + res.vertice + " não serve" : "Não dá para fechar a área assim",
        "<p>" + esc(res.motivo) + "</p>"
        + '<button class="btn" data-gacao="t360-area-desfazer">Apagar o último canto</button> '
        + '<button class="btn" data-gacao="t360-area-limpar">Recomeçar a área</button>');
    } else if (res && res.ok) {
      var corpo = '<p style="font-size:20px;margin:6px 0"><b>' + n2(res.area) + " m²</b> "
        /* ⚠ O ± SAI COLADO NO NÚMERO, como nas outras medidas: área eleva o
           erro ao quadrado (um lado com ±10% vira área com ~±21%), e quem
           lança quantidade contratual daqui precisa ver isso na mesma linha. */
        + '<span class="muted">(±' + n1(res.erroEstimadoPct) + "%)</span>"
        + (res.aproximada ? ' <span class="muted">— aproximada</span>' : "") + "</p>"
        + '<p class="muted">Perímetro <b>' + n2(res.perimetro) + " m</b> · " + res.cantos + " cantos · altura da câmera " + n2(res.alturaCam) + " m</p>"
        + '<p class="muted">' + esc(res.nota) + "</p>";

      if (G._t360AreaFechada) {
        corpo += '<div class="row">' + K.campo("Rótulo (o que é esta área)", K.inp("t360-area-rotulo", "", "Ex.: contrapiso da sala 2"))
          + K.campo("Mostrar para o cliente", '<label style="display:inline-flex;align-items:center;gap:6px;padding-top:9px"><input type="checkbox" id="t360-area-cli"> no Portal</label>')
          + "</div>"
          + '<div class="flex"><button class="btn primary" data-gacao="t360-area-comentar">Guardar como comentário nesta estação</button> '
          + '<button class="btn" data-gacao="t360-area-limpar">Medir outra área</button></div>'
          + '<p class="muted" style="margin:8px 0 0">A área não entra na lista de medidas: o registro de medida só sabe guardar distância e altura, '
          + "e um número relido errado ali seria pior que não guardar. Como comentário ele fica fixado no primeiro canto, com o ± junto.</p>";
      } else {
        corpo += '<div class="flex"><button class="btn primary" data-gacao="t360-area-fechar">Fechar área</button> '
          + '<button class="btn" data-gacao="t360-area-desfazer">Apagar o último canto</button> '
          + '<button class="btn" data-gacao="t360-area-limpar">Recomeçar</button></div>'
          + '<p class="muted" style="margin:8px 0 0">Parcial: o polígono fecha do último canto de volta ao primeiro. Continue clicando para acrescentar cantos.</p>';
      }

      if (res.aproximada) html += caixaAviso("Área aproximada", corpo);
      else html += '<div class="card mb t360-medida" style="border-left:4px solid var(--verde)">' + corpo + "</div>";
    } else if (cl.length) {
      html += '<div class="flex"><span class="muted" style="align-self:center;margin-right:10px">Faltam ' + (3 - cl.length) + " canto(s) para fechar a menor área possível.</span>"
        + '<button class="btn" data-gacao="t360-area-desfazer">Apagar o último canto</button> '
        + '<button class="btn" data-gacao="t360-area-limpar">Recomeçar</button></div>';
    }

    return html + "</div>";
  }

  /* ---------- painel: comentar ---------- */
  function _painelComentar(t, p) {
    return '<div class="card"><p class="muted" style="margin:0 0 10px">'
      + "Clique na foto onde está o assunto. Cada clique abre a caixa do comentário — "
      + "e é você quem decide, ali, se ele vai para o Portal do Cliente.</p>"
      + _listaComentarios(p) + "</div>";
  }

  /* ---------- painel: comparar ---------- */
  function _painelComparar(t, p) {
    var M = motor();
    var outros = listaTours().filter(function (x) {
      return x && x.id !== t.id && String(x.obraId) === String(t.obraId);
    }).sort(function (a, b) { return String(b.data || "").localeCompare(String(a.data || "")); });

    var html = '<div class="card">';
    if (!outros.length) {
      return html + '<p class="muted">Esta obra só tem esta visita. Para comparar, volte à lista e use '
        + "<b>Repetir visita</b> — a próxima nasce com as mesmas estações.</p></div>";
    }

    html += '<div class="row">' + K.campo("Comparar com",
      '<select id="t360-comparar-sel" data-gacao="t360-comparar-tour">'
      + '<option value="">— escolha a outra visita —</option>'
      + outros.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.id === G._t360Comparar ? " selected" : "") + ">"
          + esc((Util.fmtDia(x.data) || x.data) + " · " + (x.titulo || "")) + "</option>";
      }).join("") + "</select>") + "</div>";

    var outro = G._t360Comparar ? Store.obter(eid(), ENT, G._t360Comparar) : null;
    if (!outro) return html + '<p class="muted">Escolha a visita a comparar.</p></div>';

    var par = M.parear(t, outro);
    if (!par.comparaveis) {
      /* ⚠ O AVISO É O DO MOTOR, palavra por palavra. Ele explica que as duas
         visitas não foram feitas dos mesmos lugares e diz o caminho ("Repetir
         visita"). Reescrever aqui produziria uma segunda explicação, e uma
         delas envelheceria errada. */
      return html + caixaAviso("Nada a comparar", "<p>" + esc(par.aviso) + "</p>") + "</div>";
    }

    var pf = M.paresComFoto(par);
    html += '<p class="muted">' + par.comparaveis + " estação(ões) em comum · <b>" + pf.prontos + "</b> com foto dos dois lados.</p>";
    if (pf.semFoto.length) {
      html += caixaAviso(pf.semFoto.length + " estação(ões) sem foto de um dos lados",
        lista_ul(pf.semFoto.map(function (x) { return x.nome || x.pid; })));
    }

    html += '<table class="tbl t360-pares"><thead><tr><th>Estação</th><th>Alinhamento</th><th></th></tr></thead><tbody>';
    par.pares.forEach(function (x) {
      var pronto = !!(x.a.foto && x.b.foto);
      /* ⚠ NORTE DIFERENTE = CORTINA COMPARANDO PAREDES OPOSTAS. `nortear` é o
         que faz as duas visitas abrirem olhando para o mesmo lugar; quando a
         visita nova nasce de `basearEm` ele vem copiado e bate. Quando não
         bate, alguém criou a estação à mão — e o cliente veria "mudança" onde
         não houve nenhuma. Avisar é obrigatório; esconder seria pior. */
      var mesmoNorte = Util.num(x.a.nortear) === Util.num(x.b.nortear);
      html += "<tr><td><b>" + esc(x.nome) + "</b></td>"
        + "<td>" + (mesmoNorte ? '<span class="muted">mesmo norte</span>' : '<span style="color:var(--ambar,#b45309)">norte diferente entre as duas fotos — a cortina pode abrir em paredes distintas</span>') + "</td>"
        + "<td>" + (pronto
          ? '<button class="btn sm primary" data-gacao="t360-comparar-par" data-pid="' + esc(x.pid) + '">Ver lado a lado</button>'
          : '<span class="muted">falta foto</span>') + "</td></tr>";
    });
    html += "</tbody></table>";

    if (G._t360ParPid) {
      html += '<div class="flex mt t360-cortina" style="gap:10px;align-items:center">'
        + '<span class="muted">' + esc(Util.fmtDia(antesDepois(t, outro).antes.data) || "") + "</span>"
        /* ⚠ o range NÃO leva `data-gacao`: ele é arrastado, não clicado, e o
           dispatcher re-renderizaria a tela a cada pixel. Ligado no wire. */
        + '<input type="range" id="t360-cortina" min="0" max="100" step="1" value="' + Math.round(G._t360Cortina * 100) + '" style="flex:1">'
        + '<span class="muted">' + esc(Util.fmtDia(antesDepois(t, outro).depois.data) || "") + "</span>"
        + '<button class="btn sm" data-gacao="t360-fechar-comparativo">Sair do comparativo</button></div>';
    }

    return html + "</div>";
  }

  /* Quem é "antes" e quem é "depois" sai da DATA, nunca da ordem em que a
     pessoa escolheu no select — senão a cortina conta a história ao contrário. */
  function antesDepois(t, outro) {
    var a = String(t.data || ""), b = String(outro.data || "");
    return (b <= a) ? { antes: outro, depois: t } : { antes: t, depois: outro };
  }

  /* ---------- painel: projetado × executado ---------- */
  function _painelProjetado(t, p) {
    var M = motor();
    var v = M.vistaDoPonto(p, 0, 0);
    var html = '<div class="card">';

    if (!v.ok) {
      html += caixaAviso("Estação ainda não ancorada no modelo", "<p>" + esc(v.motivo) + "</p>");
      html += '<button class="btn primary" data-gacao="t360-ancorar">Ancorar esta estação onde o BIM está agora</button>'
        + '<span class="muted" style="margin-left:10px">Leve a câmera do BIM até o lugar em que a foto foi tirada, apontando para o mesmo rumo, e volte aqui.</span>';
      return html + "</div>";
    }

    html += '<p class="muted" style="margin:0 0 10px">Esta estação está ancorada no modelo. '
      + "O botão abaixo leva o BIM ao mesmo ponto e ao mesmo rumo que você está vendo na foto.</p>"
      + '<button class="btn primary" data-gacao="t360-vista-bim">Levar o BIM a esta vista</button> '
      + '<button class="btn" data-gacao="t360-ancorar">Reancorar pela câmera atual do BIM</button>';

    /* ⚠ A SOBREPOSIÇÃO NÃO USA O VIEWER DO BIM AO VIVO. Os dois renderizadores
       acesos ao mesmo tempo são dois contextos WebGL, e é isso que derruba os
       dois ("Too many active WebGL contexts"). O que se sobrepõe aqui é um
       RETRATO do modelo, tirado uma vez, na pose da âncora, e guardado pelo
       trilho normal de fotos. Barato, e some quando a pessoa gira — ver
       `Tour360.poseProxima`. */
    if (!p.projecao || !p.projecao.foto) {
      html += '<div class="mt"><p class="muted" style="margin:0 0 8px">Para ver o <b>projeto por cima da foto</b>, é preciso um retrato do modelo tirado deste mesmo ponto.</p>'
        + '<button class="btn" data-gacao="t360-retratar-bim">Tirar o retrato do projeto (usa o BIM aberto)</button>'
        + '<span class="muted" style="margin-left:10px">Abra o módulo BIM com o modelo desta obra carregado e volte aqui.</span></div>';
    } else {
      html += '<div class="mt t360-sobrepor">'
        + '<label>Projeto por cima da foto '
        + '<input type="range" id="t360-op" min="0" max="100" value="' + Math.round((G._t360Opacidade == null ? 0.5 : G._t360Opacidade) * 100) + '"></label> '
        + '<button class="btn sm" data-gacao="t360-vista-projeto">Voltar à vista do projeto</button> '
        + '<button class="btn sm" data-gacao="t360-retratar-bim">Tirar outro retrato</button>'
        + '<div class="muted" style="margin-top:6px">Retrato tirado em ' + esc(Util.fmtDia(p.projecao.em) || p.projecao.em || "—")
        + '. Ele vale só deste rumo: ao girar a foto, a sobreposição some para não mostrar diferença que não existe.</div>'
        + '<div id="t360-op-aviso" class="muted" style="margin-top:4px"></div></div>';
    }
    return html + "</div>";
  }

  /* ===================================================================
   * FOTOS
   * =================================================================== */

  /* ⚠ ESTE É O CAMINHO QUE FUNCIONA EM QUALQUER LUGAR, e por isso é o padrão.
     `<input type="file" capture="environment">` abre a câmera traseira no
     celular e o seletor no computador — e, principalmente, deixa a pessoa
     escolher o MODO PANORAMA do aplicativo de câmera do aparelho, que costura
     melhor do que qualquer coisa que dê para fazer aqui dentro.
     A captura assistida (girar dentro do app) exige contexto seguro: o
     servidor local do OrçaPRO é http puro, então no celular, pela rede da
     obra, `getUserMedia` simplesmente não existe. Ela entra por outro botão,
     que só aparece quando `Tour360Cap.podeCapturar()` deixa.

     ⚠ NÃO chame `Tour360Cap.capturar(fn)` aqui. Esse nome EXISTE no módulo de
     captura, mas é outra coisa: ele dispara UM quadro de uma sessão de giro
     já aberta e devolve {ok:false, codigo:"sem-sessao"} quando não há sessão.
     Como o `typeof` dava "function", a tela entrava nesse ramo, o retorno era
     ignorado e o botão de foto não fazia NADA — sem erro, sem console. */
  /* Uma pergunta so, num lugar so: o modulo existe E o aparelho deixa? */
  function podeGirar() {
    var Cap = global.Tour360Cap;
    if (!Cap || !Cap.podeCapturar) return false;
    try { return !!Cap.podeCapturar().ok; } catch (e) { return false; }
  }

  /* ⚠ DOIS CAMINHOS, E A "DUPLICAÇÃO" É O CONSERTO — ver a armadilha 5 do
     cabeçalho e o cabeçalho do js/tour360cap.js. `capture="environment"` abre
     a câmera direto e, em vários Androids, ESCONDE A GALERIA: a foto que a
     pessoa acabou de tirar no modo Panorama fica inalcançável justamente por
     causa do atributo que deveria ajudar. Enquanto o único seletor da tela
     tinha o atributo, o toast do módulo de captura mandava "toque em Importar
     panorama aqui" — apontando para um botão que não existia.
     `Tour360Cap.abrirSeletor({captura:false})` existe exatamente para isto. */
  function pedirFoto(comCaptura) {
    var Cap = global.Tour360Cap;
    if (Cap && typeof Cap.abrirSeletor === "function") {
      var r = Cap.abrirSeletor({ captura: !!comCaptura }, function (arq) {
        if (!arq) return;             /* cancelou o seletor: não há o que dizer */
        lerArquivo(arq, _receberFoto);
      });
      if (r && r.ok) return;
      /* o módulo recusou (tela sem navegador de verdade): cai na rede abaixo,
         que é o <input> da própria tela */
    }
    var el = document.getElementById(comCaptura ? "t360-foto-in" : "t360-foto-imp");
    if (!el) { UI.toast("Não achei o seletor de foto nesta tela.", "erro"); return; }
    el.value = "";
    el.click();
  }

  /* ⚠ A PLANTA NÃO PASSA PELO `lerArquivo` DAS FOTOS DO TOUR. Aquele caminho
     CLASSIFICA a imagem como panorama e devolve, para tudo que não é 2:1,
     "esta é uma foto comum: aparece, mas não gira em 360 e não permite medir
     por ângulo". Uma planta baixa NUNCA é 2:1 — o aviso sairia sempre,
     dizendo à pessoa que ela escolheu o arquivo errado quando ela acertou. */
  function lerImagemSimples(file, cb) {
    if (!file || !/^image\//.test(file.type || "")) {
      UI.toast("Escolha um arquivo de imagem (PNG ou JPG). PDF não entra direto: exporte a prancha como imagem antes.", "erro");
      cb(null); return;
    }
    var fr = new FileReader();
    fr.onload = function () { cb(fr.result); };
    fr.onerror = function () { UI.toast("Não consegui ler este arquivo.", "erro"); cb(null); };
    fr.readAsDataURL(file);
  }

  /* Guarda a imagem da planta pelo mesmo trilho de qualquer foto desta casa. */
  function _guardarPlanta(t, dataURI, nome) {
    if (typeof Fotos === "undefined" || !Fotos.guardar) {
      UI.toast("O módulo de fotos não carregou — não dá para anexar a planta agora.", "erro");
      return;
    }
    var titulo = String(nome || "").replace(/\.[A-Za-z0-9]{2,5}$/, "") || "Planta baixa";
    /* 2048 px basta para ler uma planta no minimapa e no Portal; 4096 é teto
       de textura de panorama, e aqui não há textura nenhuma. */
    Fotos.guardar(dataURI, titulo, { larguraMax: 2048, qualidade: 0.9 }).then(function (ref) {
      /* ⚠ MESMA GUARDA DA FOTO 360, PELO MESMO MOTIVO: sem IndexedDB a
         referência volta com os BYTES dentro (`semIDB`), e gravada assim no
         registro ela estoura o documento de 1 MiB do Firestore — a
         sincronização daquela empresa para, com o app dizendo "Sincronizado". */
      if (ref && (ref.semIDB || (ref.d && !ref.id))) {
        try { if (Fotos.apagar) Fotos.apagar([ref]); } catch (e) {}
        UI.toast("Este navegador não está guardando imagens fora do registro (IndexedDB indisponível), e a planta é grande demais para entrar no cadastro — ela travaria a sincronização desta empresa. Abra o OrçaPRO pelo aplicativo instalado, ou saia da janela anônima, e anexe de novo.", "erro");
        return;
      }
      var atual = Store.obter(eid(), ENT, t.id) || t;
      var antiga = atual.planta && atual.planta.foto;
      atual.planta = { foto: ref, nome: titulo };
      if (!salvarTour(atual)) return;
      /* a planta substituída sai do aparelho e do servidor: sem isto ela vira
         lixo que come a cota da licença e que ninguém acha depois */
      if (antiga) { try { if (Fotos.apagar) Fotos.apagar([antiga]); } catch (e) {} }
      _plantaRef = ""; _plantaSrc = "";
      UI.toast("Planta anexada. Agora escolha a estação e clique na planta para pôr o pino.", "ok");
      App.render();
    })["catch"](function (e) {
      UI.toast("Não consegui guardar a planta: " + ((e && e.message) || e), "erro");
    });
  }

  /* ⚠ PONTO ÚNICO DE CHEGADA DA IMAGEM, venha ela do módulo de captura ou do
     seletor de arquivo. Dois caminhos até `Fotos.guardar` seria o começo de
     duas réguas de compressão — e a régua errada aqui é a que devolve a obra
     ilegível ao dar zoom. */
  function _receberFoto(dataURI, leitura) {
    if (!dataURI) { UI.toast("Não consegui ler a imagem.", "erro"); return; }
    var t = tourAberto();
    var p = t ? motor().pontoDe(t, G._t360FotoPid) : null;
    if (!p) { UI.toast("Escolha antes em qual estação a foto entra.", "erro"); return; }
    _guardarFoto(t, p, dataURI, leitura);
  }

  /* ⚠ QUEM RECUSA UM ARQUIVO PRECISA DIZER O QUE HOUVE. js/tour360cap.js já
     sabe distinguir os casos que aparecem de verdade num celular de obra —
     HEIC do iPhone (que o Chrome do Windows não decodifica e chega com
     `type` vazio), arquivo de 40 MB, arquivo que não é imagem — e devolve um
     motivo com a saída junto. A leitura crua daqui embaixo tratava todos como
     um `cb(null)` mudo, e o usuário via só "Não consegui ler a imagem": ele
     tenta de novo com o mesmo arquivo, três vezes, e desiste do recurso.
     O módulo é opcional de propósito (guarda por `typeof`): se ele não tiver
     carregado, a leitura simples ainda funciona. */
  function lerArquivo(file, cb) {
    var Cap = global.Tour360Cap;
    if (Cap && typeof Cap.lerArquivo === "function") {
      Cap.lerArquivo(file).then(function (res) {
        if (!res || !res.ok) {
          UI.toast((res && res.motivo) || "Não consegui ler esta imagem.", "erro");
          cb(null);
          return;
        }
        if (res.aviso) UI.toast(res.aviso, "erro");
        /* ⚠ A LEITURA INTEIRA VAI JUNTO, e não só o data URI: é dela que sai
           a data em que a foto foi TIRADA (EXIF). Jogar o resto fora era o
           que fazia a estação nascer com a data do ANEXO. */
        cb(res.dataURI, res);
      })["catch"](function () { cb(null); });
      return;
    }
    if (!file || !/^image\//.test(file.type || "")) { cb(null); return; }
    var fr = new FileReader();
    fr.onload = function () { cb(fr.result); };
    fr.onerror = function () { cb(null); };
    fr.readAsDataURL(file);
  }

  /* Mede a foto ORIGINAL antes de guardar. A proporção decide se a estação
     gira em 360 ou é foto comum — e o motor avisa o usuário nos dois casos.
     Medir depois, pelo `w/h` que a referência devolve, daria 0×0 quando a
     redução falha, e a estação boa seria marcada como "foto comum". */
  function medirImagem(dataURI, cb) {
    try {
      var img = new global.Image();
      img.onload = function () { cb(img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0); };
      img.onerror = function () { cb(0, 0); };
      img.src = dataURI;
    } catch (e) { cb(0, 0); }
  }

  function _guardarFoto(t, p, dataURI, leitura) {
    if (typeof Fotos === "undefined" || !Fotos.guardar) {
      UI.toast("O módulo de fotos não carregou — não dá para anexar agora.", "erro");
      return;
    }
    var M = motor();
    medirImagem(dataURI, function (w, h) {
      var equi = M.ehEquiretangular(w, h);
      /* ⚠ larguraMax 4096 É PROPOSITAL. O padrão de `Fotos.reduzir` é 1600 px,
         que num equiretangular (2:1) vira 800 px de altura: ao dar zoom numa
         parede, a obra fica ilegível — e o tour existe justamente para dar
         zoom. 4096 é o teto seguro de textura na maioria dos celulares
         (acima disso o WebGL recusa a textura e a esfera abre preta). */
      Fotos.guardar(dataURI, p.nome || "Estação 360", { larguraMax: 4096, qualidade: 0.86 }).then(function (ref) {
        /* ⚠ SEM IndexedDB, `Fotos.guardar` DEVOLVE OS BYTES DENTRO DA REFERÊNCIA
           (`{d: dataURI, semIDB: true}`) — é o socorro pensado para a foto de
           diário, que tem 1024 px. Um panorama tem 4096 px e passa de 1 MB em
           base64: gravado assim dentro do registro, ele repete EXATAMENTE o
           defeito que o cabeçalho do js/fotos.js documenta — a entidade
           inteira estoura o documento de 1 MiB do Firestore e a sincronização
           daquele cliente PARA PARA SEMPRE, com o app dizendo "Sincronizado".
           Aqui a recusa vem antes de gravar, e com porta: dizer o que fazer é
           o que impede a pessoa de tentar a mesma foto cinco vezes. */
        if (ref && (ref.semIDB || (ref.d && !ref.id))) {
          try { if (Fotos.apagar) Fotos.apagar([ref]); } catch (e) {}
          UI.toast("Este navegador não está guardando imagens fora do registro (IndexedDB indisponível), e um panorama é grande demais para entrar no cadastro — ele travaria a sincronização desta empresa. Abra o OrçaPRO pelo aplicativo instalado, ou saia da janela anônima, e anexe de novo.", "erro");
          return;
        }
        var atual = Store.obter(eid(), ENT, t.id) || t;
        var alvo = M.pontoDe(atual, p.pid);
        if (!alvo) { UI.toast("Esta estação não existe mais.", "erro"); return; }
        var antiga = alvo.foto;
        alvo.foto = ref;
        alvo.tipo = equi ? "equirect" : "plana";
        /* ⚠ A DATA DA FOTO ERA A DO ANEXO, E ELA VAI PARA UM DOCUMENTO QUE
           FISCAL E PERITO LEEM COMO PROVA. Foto tirada na segunda e anexada na
           quinta saía datada de quinta. Agora vale, nesta ordem: a data do
           aparelho (EXIF DateTimeOriginal), e só então o momento do anexo —
           com `capturadoFonte` dizendo qual das duas é, porque uma é informada
           pelo aparelho e a outra é só quando o arquivo chegou aqui.
           ⚠ E a hora do anexo sai LOCAL, não `Util.agoraISO()`: aquele é
           `toISOString()`, ou seja UTC, e foto anexada às 22h em Brasília
           nascia carimbada com o dia SEGUINTE. */
        var dOrig = leitura && leitura.dataOriginal;
        var agoraLocal = (global.Tour360Cap && Tour360Cap.agoraLocal)
          ? Tour360Cap.agoraLocal() : Util.agoraISO();
        alvo.capturadoEm = dOrig || agoraLocal;
        alvo.capturadoFonte = dOrig ? "exif" : "anexo";
        salvarTour(atual);
        /* a foto substituída sai do aparelho e do servidor: sem isto ela vira
           lixo que come a cota de 2 GB da licença e que ninguém acha depois,
           porque não pertence mais a estação nenhuma */
        if (antiga) { try { if (Fotos.apagar) Fotos.apagar([antiga]); } catch (e) {} }
        G._t360Carregado = "";
        if (!equi) {
          UI.toast("Foto anexada, mas ela não tem proporção 2:1 — não gira em 360 e não dá para medir por ângulo.", "erro");
        } else {
          UI.toast("Foto anexada (" + w + "x" + h + ").", "ok");
        }
        App.render();
      });
    });
  }

  /* ===================================================================
   * O PALCO 3D
   * =================================================================== */

  function _mostrarMotivo(host, motivo) {
    if (!host) return;
    var d = document.createElement("div");
    d.className = "t360-host-erro";
    d.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:#dbe7f3;font-size:14px;line-height:1.5";
    /* textContent, nunca innerHTML: o motivo vem de mensagem de erro do
       navegador (o `e.message` do import do three.js entra nela) */
    d.textContent = motivo || "Não consegui abrir o visualizador 360 aqui.";
    host.appendChild(d);
  }

  function _largarPalco() {
    var V = vista();
    /* ⚠ o teclado sai ANTES da guarda do `montado()`: ele é ouvinte de
       `document`, não do palco. Preso depois de a esfera morrer, a seta do
       teclado continuaria tentando girar uma cena que não existe — e, pior,
       roubaria a seta de quem está navegando outra tela do app. */
    _tecladoDaTela(false);
    if (!V || !V.montado || !V.montado()) return;
    try { V.desmontar(); } catch (e) {}
    G._t360Carregado = "";
    G._t360Carregando = "";
  }
  G._t360LargarPalco = _largarPalco;

  var _saidaPedida = false;
  /* ⚠ REDE DE SEGURANÇA para a saída que NÃO passa pelo `afterRender` da
     Gestão — ir para Orçamentos, ou cair para a tela de login. O host some do
     documento quando o `main` é re-renderizado; a partir daí o contexto WebGL
     ficaria vivo à toa no aparelho do cliente.
     ⚠ E O DESMONTE SAI POR setTimeout, NUNCA DENTRO DO QUADRO: o `loop()` do
     viewer faz `S.raf = requestAnimationFrame(loop)` DEPOIS de desenhar, e
     desmontar zera o `S` — a linha seguinte estouraria com TypeError no meio
     do rAF, onde ninguém vê o erro.
     Entre a troca de `innerHTML` e o `montar` do wire não roda quadro nenhum
     (as duas coisas acontecem na MESMA tarefa), então isto nunca derruba o
     palco durante uma re-renderização da própria tela. */
  function _vigiarPalco() {
    var host = document.getElementById("t360-host");
    if (host && document.body && document.body.contains(host)) return;
    if (_saidaPedida) return;
    _saidaPedida = true;
    global.setTimeout(function () { _saidaPedida = false; _largarPalco(); }, 0);
  }

  function _montarPalco() {
    var host = document.getElementById("t360-host");
    if (!host) return;                       // não estamos no visualizador
    var V = vista();
    if (!V) { _mostrarMotivo(host, "O visualizador 360 não carregou (falta js/tour360view.js no index.html)."); return; }

    var t = tourAberto(), p = pontoAberto(t);
    if (!t || !p) return;

    var eraNovo = !(V.montado && V.montado());
    V.montar(host).then(function (r) {
      /* ⚠ `montar` DEVOLVE PROMESSA E PODE DEVOLVER {ok:false, motivo}:
         navegador sem módulos ES, aparelho sem aceleração 3D, three.js que
         não baixou na primeira visita offline. O motivo tem que ir para a
         tela — host preto e mudo o usuário lê como "o sistema quebrou". */
      if (!r || !r.ok) { _mostrarMotivo(host, r && r.motivo); return; }
      if (eraNovo && V.aoQuadro) {
        V.aoQuadro(_vigiarPalco);
        /* ⚠ a sobreposição do projeto é repintada A CADA QUADRO, e não uma vez
           só: ela tem de sumir no instante em que a pessoa gira para fora da
           pose em que o retrato foi tirado. Pintada uma vez, o render do
           projeto ficaria encostado numa parede que não é a dele — e isso o
           engenheiro lê como divergência de execução. */
        V.aoQuadro(_pintarSobreposicao);
      }
      V.aoClicar(_clique);
      /* ⚠ tocar no marcador tem de FAZER alguma coisa: ele e um botao com
         alvo de 44px e estado de foco, e botao que nao responde a pessoa le
         como travamento — ela toca tres vezes e desiste do recurso. */
      if (V.aoMarcador) V.aoMarcador(_abrirMarcador);
      /* ⚠ O CLIQUE DA SETA. Sem ele o viewer desenha a passagem e nada
         acontece ao tocá-la — que é exatamente a promessa de interface que
         não cumpre nada descrita no `aoMarcador`. `typeof` porque o viewer é
         escrito em paralelo (armadilha 8 do cabeçalho). */
      if (typeof V.aoSeta === "function") V.aoSeta(_aoSeta);
      /* ⚠ TECLADO: quem publicar primeiro manda. Se o viewer expõe o dele, a
         tela não põe o seu por cima — dois ouvintes girariam a foto em dobro
         a cada tecla, e o defeito se lê como "a seta está acelerada". */
      if (typeof V.teclado === "function") { try { V.teclado(true); } catch (e) {} }
      else if (typeof V.ligarTeclado === "function") { try { V.ligarTeclado(true); } catch (e2) {} }
      else _tecladoDaTela(true);
      _ligarSaidaDaTelaCheia();
      _sincronizar(t, p);
    })["catch"](function (e) {
      _mostrarMotivo(host, "Falha ao abrir o visualizador 360: " + ((e && e.message) || e));
    });
  }

  /* Põe na esfera o que a tela está pedindo — e só quando MUDA. */
  function _sincronizar(t, p) {
    var V = vista(), M = motor();
    var comparando = (G._t360Modo === "comparar" && G._t360ParPid);
    var chave = t.id + "|" + p.pid + "|" + (comparando ? "cmp:" + G._t360Comparar + ":" + G._t360ParPid : "un");

    _marcadores(p);
    _setas(t, p);

    if (typeof Fotos === "undefined" || !Fotos.dataURI) {
      _mostrarMotivo(document.getElementById("t360-host"), "O módulo de fotos não carregou (falta js/fotos.js) — não há como buscar a imagem desta estação.");
      return;
    }

    if (G._t360Carregado === chave || G._t360Carregando === chave) {
      /* nada a carregar: a esfera já é esta. O rumo guardado não tem mais
         para onde ir — mantê-lo pendente giraria a próxima estação com o
         enquadramento de uma troca que já aconteceu. */
      G._t360Rumo = null;
      return;
    }
    G._t360Carregando = chave;

    function pronto(ok) {
      G._t360Carregando = "";
      if (ok) { G._t360Carregado = chave; _aplicarRumo(); }
    }

    if (comparando) {
      var outro = Store.obter(eid(), ENT, G._t360Comparar);
      if (!outro) { pronto(false); return; }
      var par = M.parear(t, outro);
      var alvo = null;
      par.pares.forEach(function (x) { if (x.pid === G._t360ParPid) alvo = x; });
      if (!alvo || !alvo.a.foto || !alvo.b.foto) { pronto(false); return; }
      var ord = antesDepois(t, outro);
      /* o "antes" é o da data mais velha, e ele é quem entra na esfera A —
         a cortina do viewer abre a esquerda com a A */
      var pA = (ord.antes === t) ? alvo.a : alvo.b;
      var pB = (ord.antes === t) ? alvo.b : alvo.a;
      Promise.all([Fotos.dataURI(pA.foto), Fotos.dataURI(pB.foto)]).then(function (ds) {
        if (!ds[0] || !ds[1]) {
          _mostrarMotivo(document.getElementById("t360-host"), "Uma das fotos ainda não está neste aparelho. Se ela foi tirada em outro celular, espere a sincronização.");
          pronto(false); return;
        }
        /* o `ponto` que orienta a cena é o desta visita: é dele o `nortear`
           que a tela conferiu na tabela de pares */
        return V.abrirComparativo(ds[0], ds[1], alvo.a).then(function (r) {
          if (!r || !r.ok) { _mostrarMotivo(document.getElementById("t360-host"), r && r.motivo); pronto(false); return; }
          V.cortina(G._t360Cortina);
          pronto(true);
        });
      })["catch"](function () { pronto(false); });
      return;
    }

    if (!p.foto) {
      _mostrarMotivo(document.getElementById("t360-host"), "Esta estação ainda não tem foto. Volte às estações e use \"Tirar/escolher foto\".");
      pronto(false); return;
    }

    /* ⚠ `Fotos.dataURI`, NUNCA `Fotos.url` num <img src> ou numa textura: o
       servidor exige o header x-licenca e a imagem simplesmente não carrega,
       sem erro visível. */
    Fotos.dataURI(p.foto).then(function (d) {
      if (!d) {
        _mostrarMotivo(document.getElementById("t360-host"), "A foto desta estação não está neste aparelho e não consegui baixá-la agora.");
        pronto(false); return;
      }
      return V.abrir(d, p).then(function (r) {
        if (!r || !r.ok) { _mostrarMotivo(document.getElementById("t360-host"), r && r.motivo); pronto(false); return; }
        if (!r.equirect) UI.toast("Esta foto não tem proporção 2:1 — ela não gira em 360 e não dá para medir por ângulo.", "erro");
        pronto(true);
      });
    })["catch"](function () { pronto(false); });
  }

  /* ===================================================================
   * ANDAR PELA OBRA — setas, rumo, tela cheia e teclado
   *
   * Tudo aqui é fiação: quem calcula é `Tour360.setasDe` e quem desenha é o
   * viewer. Esta tela não converte ângulo (armadilha 6 do cabeçalho).
   * =================================================================== */

  /* Entrega as setas ao viewer. Fica ao lado de `_marcadores` e é chamada no
     mesmo lugar: a cada sincronização, porque ligar uma passagem, fixar um
     rumo ou anexar a foto do vizinho muda o que tem de aparecer. */
  function _setas(t, p) {
    var V = vista(), M = motor();
    if (!V || !M || !M.setasDe) return [];
    var lista = M.setasDe(t, p) || [];
    /* ⚠ A LISTA VAI INTEIRA, SEM PODA. O viewer é quem decide o que fazer com
       cada caso, e ele decide melhor do que esta tela decidiria:
       · `yaw` nulo (sem rumo gravado e sem posição na planta) ele descarta —
         não há lugar honesto para pôr a seta, e chutar o centro da foto
         mandaria a pessoa andar para dentro da parede;
       · `semFoto` ele DESENHA apagada, com "(sem foto)" escrito na pastilha e
         o clique bloqueado. Filtrar aqui apagaria esse recado: o engenheiro
         ligaria a passagem, não veria seta nenhuma e concluiria que a ligação
         não pegou — quando o que falta é a foto da estação de destino. */
    if (typeof V.setas === "function") {
      try { V.setas(lista); } catch (e) {}
    }
    return lista;
  }

  /* O viewer devolve o pid (ou um objeto com ele, conforme o que publicar). */
  function _aoSeta(x) {
    var pid = (x && x.pid) ? x.pid : x;
    if (!pid) return;
    _irParaPonto(String(pid));
  }

  /* ⚠ QUEM SABE SE ESTÁ EM TELA CHEIA É O VIEWER, e não o `document`. Ele tem
     DUAS implementações: a real (`requestFullscreen`) e a falsa
     (`position:fixed` cobrindo a viewport), que existe porque o Safari do
     iPhone não põe <div> em tela cheia. Na falsa, `document.fullscreenElement`
     é nulo — perguntar só ao documento diria "não está" com o palco ocupando
     a tela inteira, e a troca de estação re-renderizaria por baixo. */
  function _emTelaCheia() {
    var V = vista();
    if (V && typeof V.emTelaCheia === "function") {
      try { if (V.emTelaCheia()) return true; } catch (e) {}
    }
    var d = global.document;
    if (!d) return false;
    var el = d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement || null;
    if (!el) return false;
    var host = d.getElementById("t360-host");
    if (!host) return false;
    return el === host || (host.contains && host.contains(el)) || (el.contains && el.contains(host));
  }

  /* Troca de estação SEM sair da tela cheia e mantendo o rumo. */
  function _irParaPonto(pid) {
    var M = motor();
    var t = tourAberto();
    if (!t || !pid || !M) return;
    var alvo = M.pontoDe(t, pid);
    if (!alvo) { UI.toast("Esta estação não existe mais nesta visita.", "erro"); return; }
    if (!alvo.foto) {
      /* recusa com porta: diz o que fazer, e onde */
      UI.toast("A estação \"" + (alvo.nome || "") + "\" ainda não tem foto — o 360 dela abriria preto. Volte às estações e use \"Tirar foto\" ou \"Importar panorama\".", "erro");
      return;
    }

    var V = vista();
    /* ⚠ MANTER O RUMO É O QUE FAZ ISTO PARECER ANDAR, e não trocar de slide.
       E o rumo que atravessa duas estações é o CORRIGIDO, nunca o bruto: o
       bruto é o ângulo daquela foto, e duas estações fotografadas com o
       celular apontado para lados diferentes têm `nortear` diferente. Levando
       o bruto, a estação seguinte abriria virada do tamanho exato dessa
       diferença — e é ela que o `nortear` existe para anular.
       O par certo está escrito no cabeçalho do viewer: ler `poseCorrigida()`
       ANTES e chamar `girarParaCorrigido(...)` DEPOIS. Nenhuma conta mora
       aqui; o par bruto continua sendo a rede para um viewer que ainda não
       publique o corrigido. */
    var pc = (V && typeof V.poseCorrigida === "function") ? V.poseCorrigida() : null;
    if (pc && pc.corrigido && typeof V.girarParaCorrigido === "function") {
      G._t360Rumo = { yaw: Util.num(pc.corrigido.yaw), corrigido: true };
    } else if (V && typeof V.pose === "function") {
      G._t360Rumo = { yaw: Util.num(V.pose().yaw), corrigido: false };
    } else {
      G._t360Rumo = null;
    }

    G._t360Pid = String(pid);
    G._t360Cliques = []; G._t360Medida = null;
    G._t360AreaCliques = []; G._t360Area = null; G._t360AreaFechada = false;
    G._t360ParPid = "";

    /* ⚠ EM TELA CHEIA, `App.render()` TIRA O HOST DO DOCUMENTO — e o navegador
       encerra a tela cheia junto. Quem estava andando pela obra é cuspido de
       volta para a tela do escritório a cada seta, que é o oposto do recurso.
       Então aqui a troca acontece DENTRO do palco, e o re-render fica para o
       momento em que a pessoa sair (ver `_ligarSaidaDaTelaCheia`). */
    if (_emTelaCheia()) {
      var novo = M.pontoDe(t, G._t360Pid);
      if (!novo) return;
      _sincronizar(t, novo);
      _montarMinimapa();
      G._t360RenderAoSair = true;
      return;
    }
    App.render();
  }
  G._t360IrParaPonto = _irParaPonto;

  /* ⚠ SÓ DEPOIS DE `abrir` RESOLVER. `Tour360View.abrir` repõe a pose no norte
     da estação (`aplicarGiroDoPonto`): girar antes disso é escrever num
     valor que a carga da foto vai sobrescrever, e o efeito na tela é a seta
     "não funcionar de vez em quando" — o pior tipo de defeito, porque some
     quando alguém vai olhar. Por isso a chamada mora no `pronto(true)` do
     `_sincronizar`. */
  function _aplicarRumo() {
    var V = vista();
    var r = G._t360Rumo;
    G._t360Rumo = null;
    if (!r || !V) return;
    if (r.corrigido && typeof V.girarParaCorrigido === "function") {
      try { V.girarParaCorrigido(r.yaw); } catch (e) {}
      return;
    }
    if (typeof V.girarPara === "function") { try { V.girarPara(r.yaw); } catch (e2) {} return; }
    /* rede para um viewer sem giro animado: pôr a câmera no rumo guardado,
       sem mexer no resto da pose */
    if (typeof V.olharPara === "function") {
      var p = (typeof V.pose === "function") ? V.pose() : { pitch: 0, fov: undefined };
      try { V.olharPara(r.yaw, p.pitch, p.fov); } catch (e3) {}
    }
  }

  /* ⚠ SAIR DA TELA CHEIA PRECISA RE-RENDERIZAR quando a estação mudou lá
     dentro: o painel de baixo continuaria mostrando os comentários e as
     medidas da estação em que a pessoa ENTROU — foto de uma sala, lista de
     outra. É o tipo de divergência que ninguém percebe até assinar embaixo. */
  /* ⚠ A PORTA DA TELA CHEIA, e ela é obrigatória porque a trava é nossa.
     Dentro da tela cheia a barra do visualizador some da vista: na de verdade
     o host É a tela inteira; na falsa (`position:fixed`, z-index 9999) ele
     cobre a página. Ou seja, o botão que abriu não serve para fechar.
     O viewer trata o Esc — mas Esc é TECLA, e a tela cheia falsa existe
     justamente para o Safari do iPhone, onde não há teclado nenhum. Sem este
     botão, a saída no aparelho em que a falsa mais aparece seria recarregar a
     página, perdendo a medida em curso e o comentário não salvo. */
  function _botaoTelaCheia() {
    var doc = global.document;
    if (!doc) return;
    var velho = doc.getElementById("t360-sair-tc");
    if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var host = doc.getElementById("t360-host");
    if (!host || !_emTelaCheia()) return;
    var b = doc.createElement("button");
    b.type = "button";
    b.id = "t360-sair-tc";
    b.className = "btn sm";
    /* o mesmo `data-gacao` do botão da barra: `telaCheia()` sem argumento
       ALTERNA, então um handler só serve para entrar e para sair */
    b.setAttribute("data-gacao", "t360-telacheia");
    b.textContent = "Sair da tela cheia";
    b.style.cssText = "position:absolute;right:10px;top:10px;z-index:5";
    host.appendChild(b);
  }

  function _aoSairDaTelaCheia() {
    _botaoTelaCheia();
    if (_emTelaCheia()) return;
    if (!G._t360RenderAoSair) return;
    G._t360RenderAoSair = false;
    try { if (typeof App !== "undefined" && App.render) App.render(); } catch (e) {}
  }

  function _ligarSaidaDaTelaCheia() {
    var V = vista();
    /* ⚠ O AVISO TEM DE VIR DO VIEWER quando ele o publica: na tela cheia
       FALSA (position:fixed, a saída do iPhone) o navegador não dispara
       `fullscreenchange` nenhum — só o viewer sabe que entrou e que saiu.
       `aoTelaCheia` é estado do mount, então registrar a cada montagem é o
       certo, e é idempotente. */
    if (V && typeof V.aoTelaCheia === "function") {
      try {
        /* `_aoSairDaTelaCheia` também repõe (ou tira) o botão de sair, então
           ele é chamado nos DOIS sentidos: entrar sem o botão é a trava. */
        V.aoTelaCheia(function () { _aoSairDaTelaCheia(); });
      } catch (e) {}
    }
    /* e o do documento continua, uma vez só, para a tela cheia real aberta
       por fora (a tecla F11, ou o Esc que o viewer não viu) */
    if (G._t360FsLigada || !global.document) return;
    G._t360FsLigada = true;
    var d = global.document;
    function aoTrocar() {
      var V2 = vista();
      /* o palco mudou de tamanho nos dois sentidos (entrando e saindo), e
         medir cedo demais devolve a altura antiga — o viewer já reagenda */
      if (V2 && V2.redimensionar) { global.setTimeout(function () { try { V2.redimensionar(); } catch (e) {} }, 60); }
      _aoSairDaTelaCheia();
    }
    d.addEventListener("fullscreenchange", aoTrocar);
    d.addEventListener("webkitfullscreenchange", aoTrocar);
  }

  /* ---------- teclado: a rede, enquanto o viewer não publica o dele ----------
   *
   * Girar com o dedo funciona no celular; no computador, quem está com o
   * mouse na mesa espera a seta do teclado. É o "básico do visualizador" que
   * faz o produto parecer fácil. */
  var _tecladoLigado = false;

  function _aoTeclar(ev) {
    var V = vista();
    if (!V || !V.montado || !V.montado() || !V.pose || !V.olharPara) return;
    /* ⚠ NUNCA SEQUESTRAR A TECLA DE QUEM ESTÁ DIGITANDO. Com o modal do
       comentário aberto, a seta andaria a foto em vez de mover o cursor
       dentro do texto — e a pessoa perde o que escreveu tentando corrigir
       uma palavra. */
    var a = global.document && global.document.activeElement;
    var tag = (a && a.tagName) ? String(a.tagName).toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select" || (a && a.isContentEditable)) return;
    if (global.document && global.document.getElementById("modal-bg")) return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;

    var k = ev.key || "";
    var p = V.pose();
    /* o passo acompanha o zoom: com o campo de visão fechado, o mesmo passo
       jogaria a imagem para fora da tela a cada toque */
    var passo = Math.max(1.5, Util.num(p.fov, 75) / 12);
    var mexeu = true;
    if (k === "ArrowLeft") V.olharPara(p.yaw - passo, p.pitch, p.fov);
    else if (k === "ArrowRight") V.olharPara(p.yaw + passo, p.pitch, p.fov);
    else if (k === "ArrowUp") V.olharPara(p.yaw, p.pitch + passo, p.fov);
    else if (k === "ArrowDown") V.olharPara(p.yaw, p.pitch - passo, p.fov);
    else if ((k === "+" || k === "=") && V.zoom) V.zoom(-4);
    else if ((k === "-" || k === "_") && V.zoom) V.zoom(4);
    else mexeu = false;
    if (mexeu && ev.preventDefault) ev.preventDefault();
  }

  function _tecladoDaTela(ligar) {
    if (!global.document) return;
    if (ligar && !_tecladoLigado) {
      global.document.addEventListener("keydown", _aoTeclar);
      _tecladoLigado = true;
      return;
    }
    if (!ligar && _tecladoLigado) {
      global.document.removeEventListener("keydown", _aoTeclar);
      _tecladoLigado = false;
    }
  }

  /* ===================================================================
   * O MINIMAPA — a planta baixa dentro do palco
   *
   * Ele é DESTA TELA, não do viewer: é HTML por cima do canvas, dentro do
   * mesmo host. Fica acima da camada de marcadores (z-index 2) e da
   * sobreposição do projeto (3), senão o pino nasce atrás da foto e não
   * recebe clique nenhum.
   * =================================================================== */
  var _plantaSrc = "", _plantaRef = "";

  function refFoto(f) { return f ? String(f.id || f.remoto || "") : ""; }

  /* A imagem da planta vem por `Fotos.dataURI` — nunca por `Fotos.url` num
     <img src>: o servidor exige o header x-licenca e a imagem simplesmente
     não carrega, sem erro visível. O cache evita rebaixar a imagem a cada
     re-render (e todo clique re-renderiza). */
  function _pedirPlanta(t, aoPronto) {
    var f = t && t.planta && t.planta.foto;
    if (!f) { aoPronto(""); return; }
    if (_plantaRef === refFoto(f) && _plantaSrc) { aoPronto(_plantaSrc); return; }
    if (typeof Fotos === "undefined" || !Fotos.dataURI) { aoPronto(""); return; }
    Fotos.dataURI(f).then(function (d) {
      if (!d) { aoPronto(""); return; }
      _plantaRef = refFoto(f); _plantaSrc = d;
      aoPronto(d);
    })["catch"](function () { aoPronto(""); });
  }

  function _montarMinimapa() {
    var doc = global.document;
    if (!doc) return;
    var velho = doc.getElementById("t360-mini");
    if (velho && velho.parentNode) velho.parentNode.removeChild(velho);

    var host = doc.getElementById("t360-host");
    if (!host) return;
    var t = tourAberto(), p = pontoAberto(t);
    if (!t || !p || !t.planta || !t.planta.foto) return;

    if (!G._t360Mini) {
      /* ⚠ ESCONDER NÃO PODE SER SÓ DE IDA. O botão "Esconder" mora DENTRO do
         mapa, e o de mostrar mora na barra do visualizador — que fica fora da
         vista em tela cheia. Sem este botãozinho, quem escondeu o mapa lá
         dentro só o traz de volta saindo da tela cheia, e a pessoa conclui
         que perdeu o minimapa. */
      if (!_emTelaCheia()) return;
      var vb = doc.createElement("button");
      vb.type = "button";
      vb.id = "t360-mini";            /* mesmo id: a limpeza lá em cima o alcança */
      vb.className = "btn sm";
      vb.setAttribute("data-gacao", "t360-minimapa");
      vb.textContent = "Mapa";
      vb.style.cssText = "position:absolute;right:10px;bottom:10px;z-index:4";
      host.appendChild(vb);
      return;
    }

    _pedirPlanta(t, function (src) {
      var host2 = doc.getElementById("t360-host");
      /* entre o pedido e a resposta a pessoa pode ter saído da tela, trocado
         de estação ou escondido o mapa: sem estas três guardas, o minimapa
         reaparece sozinho por cima de outra coisa */
      if (!host2 || !G._t360Mini || doc.getElementById("t360-mini")) return;
      var tAgora = tourAberto(), pAgora = pontoAberto(tAgora);
      if (!tAgora || !pAgora) return;

      var cx = doc.createElement("div");
      cx.id = "t360-mini";
      cx.style.cssText = "position:absolute;right:10px;bottom:10px;z-index:4;width:min(46%,260px);"
        + "background:rgba(9,20,33,.78);border-radius:10px;padding:6px;box-shadow:0 4px 16px rgba(0,0,0,.4)";

      var topo = doc.createElement("div");
      topo.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px";
      var nm = doc.createElement("span");
      nm.style.cssText = "flex:1;color:#e8f0f8;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      nm.textContent = tAgora.planta.nome || "Planta baixa";
      var bt = doc.createElement("button");
      bt.type = "button";
      bt.className = "btn sm";
      bt.setAttribute("data-gacao", "t360-minimapa");
      bt.textContent = "Esconder";
      topo.appendChild(nm); topo.appendChild(bt);
      cx.appendChild(topo);

      /* ⚠ MAPA QUE NÃO ABRE TEM DE DIZER POR QUÊ. A imagem da planta é uma
         referência de foto: no computador do escritório ela pode ainda não ter
         chegado. Sumindo em silêncio, o botão da barra continuaria oferecendo
         "Esconder o minimapa" sem mapa nenhum na tela — e a pessoa concluiria
         que o recurso não funciona, quando o que falta é a sincronização. */
      if (!src) {
        var semImg = doc.createElement("div");
        semImg.style.cssText = "color:#e8f0f8;font-size:11px;line-height:1.35";
        semImg.textContent = "A imagem desta planta ainda não está neste aparelho. Se ela foi anexada em outro computador, espere a sincronização terminar.";
        cx.appendChild(semImg);
        host2.appendChild(cx);
        return;
      }

      var quadro = doc.createElement("div");
      quadro.style.cssText = "position:relative;line-height:0";
      var img = doc.createElement("img");
      img.src = src;
      img.alt = "Planta baixa da visita";
      img.style.cssText = "display:block;width:100%;height:auto;border-radius:6px";
      quadro.appendChild(img);

      var ps = Util.arr(tAgora.pontos), i, n = 0;
      for (i = 0; i < ps.length; i++) {
        if (!ps[i] || !ps[i].planta) continue;
        n++;
        quadro.appendChild(_pinoDoMapa(doc, ps[i], n, ps[i].pid === pAgora.pid));
      }
      cx.appendChild(quadro);

      if (!n) {
        /* mapa sem pino é pior que mapa nenhum: ele parece quebrado. Aqui ele
           diz o que falta e onde se faz. */
        var av = doc.createElement("div");
        av.style.cssText = "color:#e8f0f8;font-size:11px;margin-top:5px;line-height:1.35";
        av.textContent = "Nenhuma estação posicionada nesta planta. Volte às estações para pôr os pinos.";
        cx.appendChild(av);
      }
      host2.appendChild(cx);
    });
  }

  /* ⚠ O PINO É POSICIONADO EM PORCENTAGEM porque o que está gravado é FRAÇÃO
     da imagem. O minimapa tem 260 px e o cartão do editor tem a largura da
     tela: em pixel, o mesmo pino cairia em dois lugares diferentes. */
  function _pinoDoMapa(doc, ponto, ordem, ehAtual) {
    var b = doc.createElement("button");
    b.type = "button";
    b.className = "t360-mini-pino";
    b.setAttribute("data-gacao", "t360-ir-ponto");
    b.setAttribute("data-pid", ponto.pid);
    if (ehAtual) b.setAttribute("aria-current", "true");
    b.title = (ponto.nome || "") + (ponto.foto ? "" : " (sem foto)") + (ehAtual ? " — você está aqui" : "");
    b.textContent = String(ordem);
    b.style.cssText = "position:absolute;left:" + pct(ponto.planta.x) + "%;top:" + pct(ponto.planta.y) + "%;"
      + "transform:translate(-50%,-50%);min-width:" + (ehAtual ? "26px" : "22px") + ";height:" + (ehAtual ? "26px" : "22px") + ";"
      + "padding:0;border:0;border-radius:999px;cursor:pointer;text-align:center;"
      + "background:" + (ehAtual ? "var(--verde,#15803d)" : (ponto.foto ? "var(--aco,#2e6f9e)" : "#6b7280")) + ";color:#fff;"
      + "font:700 " + (ehAtual ? "12px/26px" : "11px/22px") + " var(--fonte,system-ui,sans-serif);"
      + "box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(0,0,0,.45)";
    return b;
  }

  /* Marcadores: o viewer desenha `texto` DENTRO do botão e `rotulo` no title.
     Por isso o texto é só o número da ordem — o comentário inteiro num botão
     de 24 px viraria um parágrafo flutuando na foto. */
  /* Mostra o que o marcador guarda. Sem tela nova: o comentario ja esta
     escrito na lista abaixo do palco, entao levar o olho ate la (e destacar)
     resolve sem inventar um segundo lugar para a mesma informacao. */
  function _abrirMarcador(id) {
    var t = tourAberto(), p = pontoAberto(t);
    if (!p) return;
    var hs = Util.arr(p.hotspots), alvo = null, i;
    for (i = 0; i < hs.length; i++) if ((hs[i].hid || ("h" + i)) === id) { alvo = hs[i]; break; }
    if (!alvo) return;
    var el = document.querySelector('[data-t360coment="' + alvo.hid + '"]');
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ block: "center" });
      el.style.transition = "background .25s";
      el.style.background = "var(--surface-2, rgba(46,111,158,.14))";
      global.setTimeout(function () { try { el.style.background = ""; } catch (e) {} }, 1600);
      return;
    }
    UI.toast((alvo.tipo === "atencao" || alvo.tipo === "pendencia" ? "Ponto de atenção: " : "") + (alvo.texto || "(sem texto)"), "ok");
  }

  function _marcadores(p) {
    var V = vista();
    if (!V || !V.marcadores) return;
    var lista = [];
    Util.arr(p.hotspots).forEach(function (h, i) {
      lista.push({
        id: h.hid || ("h" + i),
        yaw: Util.num(h.yaw), pitch: Util.num(h.pitch),
        tipo: h.tipo || "comentario",
        texto: String(i + 1),
        rotulo: rotuloTipo(h.tipo) + ": " + (h.texto || "")
      });
    });
    /* as pontas da medida em curso entram como marcador também: sem elas o
       usuário clica o primeiro ponto e não vê nada acontecer */
    G._t360Cliques.forEach(function (c, i) {
      lista.push({ id: "med" + i, yaw: c.yaw, pitch: c.pitch, tipo: "medida", texto: String(i + 1), rotulo: "Ponta da medida" });
    });
    /* os cantos da área em curso, pelo mesmo motivo: sem eles a pessoa clica
       o terceiro canto e não sabe mais quais já marcou — e remarca em cima */
    G._t360AreaCliques.forEach(function (c, i) {
      lista.push({ id: "area" + i, yaw: c.yaw, pitch: c.pitch, tipo: "medida", texto: String(i + 1), rotulo: "Canto " + (i + 1) + " da área" });
    });
    V.marcadores(lista);
  }

  /* ===================================================================
   * O CLIQUE NA FOTO
   * =================================================================== */
  function _clique(ang) {
    if (!ang) return;
    if (G._t360Modo === "medir") return _cliqueMedir(ang);
    if (G._t360Modo === "area") return _cliqueArea(ang);
    if (G._t360Modo === "comentar") return _cliqueComentar(ang);
    /* girar/comparar/projetado: o clique não marca nada, de propósito —
       marcar sem o usuário pedir enche a foto de pontas fantasmas */
  }

  function _cliqueMedir(ang) {
    if (G._t360Medida && G._t360Medida.ok) return;   // já há resultado na tela
    /* ⚠ GUARDA O BRUTO E O CORRIGIDO. O bruto é o pixel da foto (é ele que
       vai para o registro, porque `Tour360.recalcular` aplica `corrigir()` na
       leitura); o corrigido é o nivelado, que é o que entra na conta AGORA.
       Gravar o corrigido faria a correção entrar duas vezes. */
    G._t360Cliques.push({
      yaw: Util.num(ang.yaw), pitch: Util.num(ang.pitch),
      corr: { yaw: Util.num(ang.corrigido && ang.corrigido.yaw), pitch: Util.num(ang.corrigido && ang.corrigido.pitch) }
    });
    if (G._t360Cliques.length >= 2) _calcularMedida();
    App.render();
  }

  function _calcularMedida() {
    var M = motor();
    var t = tourAberto(), p = pontoAberto(t);
    if (!p) return;
    var a = G._t360Cliques[0].corr, b = G._t360Cliques[1].corr;
    G._t360Medida = (G._t360TipoMedida === "altura")
      ? M.medirAltura(a, b, Util.num(p.alturaCam))
      : M.medirChao(a, b, Util.num(p.alturaCam));
  }

  /* ---------- os cantos da área ----------
     Guarda o BRUTO e o CORRIGIDO pela mesma razão de `_cliqueMedir`: o bruto é
     o pixel da foto (é ele que desenha o marcador na tela) e o corrigido é o
     nivelado, que é o que entra na conta. */
  function _cliqueArea(ang) {
    var M = motor();
    var t = tourAberto(), p = pontoAberto(t);
    if (!p || !M) return;
    if (G._t360AreaFechada) return;      /* já fechou: recomeçar é botão */
    if (G._t360AreaCliques.length >= 24) {
      UI.toast("Vinte e quatro cantos é o limite — meça por partes: fica mais confiável e mais fácil de conferir.", "erro");
      return;
    }
    G._t360AreaCliques.push({
      yaw: Util.num(ang.yaw), pitch: Util.num(ang.pitch),
      corr: { yaw: Util.num(ang.corrigido && ang.corrigido.yaw), pitch: Util.num(ang.corrigido && ang.corrigido.pitch) }
    });
    _calcularArea();
    App.render();
  }

  function _zerarArea() {
    G._t360AreaCliques = []; G._t360Area = null; G._t360AreaFechada = false;
  }

  function _calcularArea() {
    var M = motor();
    var t = tourAberto(), p = pontoAberto(t);
    if (!p || !M || !M.medirArea) return;
    var cl = G._t360AreaCliques;
    if (cl.length < 3) { G._t360Area = null; return; }
    var pts = [], i;
    for (i = 0; i < cl.length; i++) pts.push(cl[i].corr);
    G._t360Area = M.medirArea(pts, Util.num(p.alturaCam));
  }

  function _cliqueComentar(ang) {
    var t = tourAberto(), p = pontoAberto(t);
    if (!p) return;
    var M = motor();
    if (Util.arr(p.hotspots).length >= M.MAX_HOTSPOTS) {
      UI.toast("Esta estação já tem " + M.MAX_HOTSPOTS + " comentários — o limite do módulo.", "erro");
      return;
    }
    var yaw = Util.num(ang.yaw), pitch = Util.num(ang.pitch);
    var corpo = '<div class="row">'
      + K.campo("Tipo", '<select id="t360-h-tipo">'
        + '<option value="comentario">Comentário</option>'
        + '<option value="atencao">Atenção</option>'
        + '<option value="pendencia">Pendência</option>'
        + '<option value="aprovado">Aprovado</option></select>')
      + "</div>"
      + '<div class="field"><label>O que você viu aqui</label>'
      + '<textarea id="t360-h-texto" rows="4" style="width:100%"></textarea></div>'
      /* ⚠ A CAIXA DO PORTAL NASCE DESMARCADA. `Tour360.paraPortal` só leva o
         comentário com `paraCliente`; o padrão inverso mandaria ao cliente a
         anotação interna do engenheiro sem ninguém decidir nada. */
      + '<label style="display:inline-flex;align-items:center;gap:6px">'
      + '<input type="checkbox" id="t360-h-cli"> Mostrar para o cliente no Portal</label>';

    UI.modal("Comentar nesta posição da foto", corpo, [
      { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Guardar comentário", classe: "primary", onClick: function () {
        var texto = K.v("t360-h-texto");
        if (!texto) { UI.toast("Escreva o comentário antes de guardar.", "erro"); return; }
        var atual = Store.obter(eid(), ENT, t.id);
        var alvo = atual ? M.pontoDe(atual, p.pid) : null;
        if (!alvo) { UI.toast("Esta estação não existe mais.", "erro"); UI.fecharModal(); return; }
        var eu = quemSou();
        var cli = document.getElementById("t360-h-cli");
        alvo.hotspots = Util.arr(alvo.hotspots);
        alvo.hotspots.push({
          hid: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          tipo: K.v("t360-h-tipo") || "comentario",
          texto: texto,
          autor: eu.autor,
          em: Util.agoraISO(),
          yaw: yaw, pitch: pitch,
          paraCliente: !!(cli && cli.checked)
        });
        salvarTour(atual);
        UI.fecharModal();
        UI.toast("Comentário guardado.", "ok");
        App.render();
      } }
    ]);
  }

  /* ===================================================================
   * AÇÕES
   * =================================================================== */
  G.registrarAcoes("tour360", {

    /* ---------- lista ---------- */
    "t360-nova": function () {
      var M = motor();
      var obras = K.lista("obras");
      var hoje = M.hojeLocal();
      var corpo = '<div class="row">'
        + K.campo("Obra *", '<select id="t360-nv-obra">' + K.optsRec(obras, "nome", "", "— escolha a obra —") + "</select>")
        + K.campo("Data da visita *", K.inp("t360-nv-data", hoje, "", "date"))
        + "</div>"
        + '<div class="row">' + K.campo("Título", K.inp("t360-nv-titulo", "", "Visita " + hoje)) + "</div>"
        + '<p class="muted">Visita criada do zero nasce com estações NOVAS. Para comparar com um mês anterior, '
        + 'volte à lista e use <b>Repetir visita</b> na visita antiga — é o que mantém o mesmo ponto entre as duas.</p>';
      UI.modal("Nova visita 360", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar visita", classe: "primary", onClick: function () {
          var obraId = K.v("t360-nv-obra");
          var data = K.v("t360-nv-data");
          if (!obraId) { UI.toast("Escolha a obra: toda visita pertence a uma obra.", "erro"); return; }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { UI.toast("Informe a data da visita.", "erro"); return; }
          var ob = Store.obter(eid(), "obras", obraId);
          var eu = quemSou();
          var t = M.novo(obraId, data, {
            obraNome: ob ? ob.nome : "",
            titulo: K.v("t360-nv-titulo"),
            autorId: eu.autorId, autor: eu.autor
          });
          var salvo = salvarTour(t);
          if (!salvo) { UI.toast("Não consegui gravar a visita.", "erro"); return; }
          G._t360Tour = salvo.id; G._t360Pid = "";
          UI.fecharModal();
          App.render();
        } }
      ]);
    },

    "t360-abrir": function (ds) {
      G._t360Tour = ds.id || ""; G._t360Pid = ""; G._t360Modo = "girar";
      G._t360Cliques = []; G._t360Medida = null; G._t360ParPid = ""; G._t360Comparar = "";
      _zerarArea();
      G._t360PosPid = "";
      App.render();
    },

    "t360-repetir": function (ds) {
      var M = motor();
      var anterior = Store.obter(eid(), ENT, ds.id);
      if (!anterior) return;
      var hoje = M.hojeLocal();
      var corpo = '<div class="row">'
        + K.campo("Data da nova visita *", K.inp("t360-rp-data", hoje, "", "date"))
        + K.campo("Título", K.inp("t360-rp-titulo", "Visita " + hoje))
        + "</div>"
        + "<p>A visita nova nasce com as <b>mesmas " + Util.arr(anterior.pontos).length + " estação(ões)</b> desta, "
        + "com o mesmo identificador de ponto, a mesma altura de câmera e o mesmo norte — e <b>sem</b> as fotos, "
        + "os comentários e as medidas, que são do dia em que foram feitos.</p>"
        + '<p class="muted">É esse identificador que faz o comparativo existir. Sem ele, as duas visitas são dois '
        + "conjuntos de pontos que ninguém consegue casar.</p>";
      UI.modal("Repetir esta visita", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar a próxima visita", classe: "primary", onClick: function () {
          var data = K.v("t360-rp-data");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { UI.toast("Informe a data da nova visita.", "erro"); return; }
          var eu = quemSou();
          var nova = M.basearEm(anterior, data, { titulo: K.v("t360-rp-titulo"), autorId: eu.autorId, autor: eu.autor });
          /* `basearEm` copia `baseadoEm`/`comparaCom` do id da anterior — e o
             registro antigo pode não ter id gravado ainda; garantimos aqui */
          nova.baseadoEm = anterior.id; nova.comparaCom = anterior.id;
          var salvo = salvarTour(nova);
          if (!salvo) { UI.toast("Não consegui gravar a visita.", "erro"); return; }
          G._t360Tour = salvo.id; G._t360Pid = "";
          UI.fecharModal();
          UI.toast("Visita criada com " + Util.arr(nova.pontos).length + " estação(ões) da anterior.", "ok");
          App.render();
        } }
      ]);
    },

    "t360-publicar": function (ds) {
      var M = motor();
      var t = Store.obter(eid(), ENT, ds.id);
      if (!t) return;
      /* ⚠ a guarda de PAPEL vem antes da de conteúdo: o encarregado não
         publica direto ao contratante, mesma régua do diário. E a recusa tem
         porta — ela diz a quem pedir. */
      var euPub = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      if (M.podePublicarPapel && !M.podePublicarPapel(euPub)) {
        UI.toast("Publicar a visita para o cliente é do gestor. Avise quem responde pela obra — a visita já está pronta e salva aqui.", "erro");
        return;
      }
      var chk = M.podePublicar(t);
      if (!chk.ok) { UI.toast(chk.motivo, "erro"); return; }
      var pend = M.fotosPendentes(t);
      var ob = obraDe(t);
      var corpo = "<p><b>" + chk.pontosComFoto + " estação(ões) com foto</b> ficam disponíveis para o cliente.</p>"
        /* ⚠ FOTO QUE NÃO SUBIU NÃO CHEGA AO CLIENTE. O Portal recebe a
           REFERÊNCIA; foto ainda na fila do aparelho não tem endereço no
           servidor. Publicar sem contar isso faz o cliente abrir o tour e
           achar que ninguém fotografou. */
        + (pend ? '<div class="card" style="border-left:4px solid #dc2626;margin:8px 0"><b>'
          + pend + " foto(s) ainda não subiram</b> e não vão aparecer para o cliente. "
          + "Espere a sincronização terminar antes de avisá-lo.</div>" : "")
        /* ⚠ OBRA QUE JÁ PUBLICOU TEM A LISTA DE RELATÓRIOS CONGELADA NELA.
           `_snapshotPortal` só usa o padrão da empresa quando `portalRelatorios`
           NÃO existe; se a obra foi publicada antes deste módulo existir, a
           lista gravada não tem "tour360" — e o bloco não é embarcado. O app
           diria "Visita no ar para o cliente" e o cliente não veria seção
           nenhuma, sem nada explicando. Melhor dizer aqui, com o caminho. */
        + (ob && Object.prototype.toString.call(ob.portalRelatorios) === "[object Array]"
             && ob.portalRelatorios.indexOf("tour360") < 0
          ? '<div class="card" style="border-left:4px solid #b45309;margin:8px 0"><b>O tour ainda não está liberado no Portal desta obra.</b> '
            + "Ela foi publicada antes deste recurso existir, e a lista de relatórios dela ficou gravada sem ele. "
            + "Abra o cadastro da obra, marque <b>Tour virtual 360</b> na lista do Portal e publique de novo — "
            + "senão o cliente não verá a seção.</div>"
          : "")
        + (ob && ob.portalUser
          ? '<p class="muted">Esta obra tem Portal do Cliente configurado.</p>'
          : '<p class="muted">Esta obra <b>não tem Portal do Cliente</b> configurado, então a visita fica marcada como pronta e só é vista aqui dentro. O Portal se liga no cadastro da obra.</p>');
      UI.modal("Publicar a visita de " + esc(Util.fmtDia(t.data) || t.data), corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Publicar", classe: "primary", onClick: function () {
          t.estado = "publicado";
          t.publicadoEm = Util.agoraISO();
          salvarTour(t, true);   /* republica logo abaixo, com retorno para o usuário */
          UI.fecharModal();
          /* ⚠ GRAVAR NÃO É PUBLICAR. O Portal do Cliente é um RETRATO enviado
             ao servidor; marcar `publicado` aqui e parar por aqui deixa o dado
             salvo nesta máquina e o cliente vendo a semana passada — sem
             ninguém entender por quê. É o mesmo buraco que o "Despublicar" já
             teve. `_republicarPortal` serializa por obra e atinge o acesso
             principal MAIS os extras (sócio, fiscal, banco). */
          if (ob && ob.portalUser && G._republicarPortal) {
            UI.toast("Publicando no Portal do cliente…", "ok");
            G._republicarPortal(ob, function (res) {
              if (res && res.ok) UI.toast("Visita no ar para o cliente.", "ok");
              else if (res && res.semPortal) UI.toast("Visita marcada como publicada (esta obra não tem Portal).", "ok");
              else UI.toast("A visita foi marcada como publicada, mas o envio ao Portal falhou: " + ((res && res.erro) || "sem detalhe") + ". Tente republicar pela tela da obra.", "erro");
              App.render();
            });
            return;
          }
          UI.toast("Visita publicada.", "ok");
          App.render();
        } }
      ]);
    },

    /* ---------- relatório fotográfico e vídeo ----------
     * A conta e a montagem moram em js/tour360rel.js; aqui só entra o clique
     * e sai a mensagem. */
    "t360-relatorio": function (ds) {
      var Rel = global.Tour360Rel;
      if (!Rel) { UI.toast("O módulo de relatório não carregou (falta js/tour360rel.js).", "erro"); return; }
      var t = Store.obter(eid(), ENT, ds.id) || tourAberto();
      if (!t) return;
      var ob = obraDe(t);
      if (UI.loading) UI.loading("Montando o relatório fotográfico…");
      Rel.abrir(t, {
        obraNome: nomeObra(t),
        local: (ob && ob.local) || "",
        autor: (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : ""
      }).then(function (res) {
        if (UI.loadingFim) UI.loadingFim();
        if (!res || !res.ok) { UI.toast((res && res.motivo) || "Não consegui montar o relatório.", "erro"); return; }
        /* ⚠ o documento SAI, mas dizendo o que faltou. Relatório que omite em
           silêncio a foto que não carregou é pior que relatório nenhum: quem
           lê conclui que aquela estação não foi fotografada. */
        if (res.faltando) UI.toast(res.faltando + " foto(s) não estão neste aparelho e saíram como aviso no documento.", "erro");
        else if (res.pendentes) UI.toast(res.pendentes + " foto(s) ainda não subiram — o documento avisa isso.", "erro");
      })["catch"](function (e) {
        if (UI.loadingFim) UI.loadingFim();
        UI.toast("Falhou ao montar o relatório: " + (e && e.message ? e.message : e), "erro");
      });
    },

    "t360-video": function (ds) {
      var Rel = global.Tour360Rel;
      if (!Rel) { UI.toast("O módulo de vídeo não carregou (falta js/tour360rel.js).", "erro"); return; }
      var V = vista();
      /* ⚠ O VÍDEO É GRAVADO DA ESFERA QUE ESTÁ NA TELA: sem visualizador
         montado não há quadro nenhum, e o arquivo sairia preto. A porta é
         dizer o que fazer, não recusar seco. */
      if (!V || !V.montado || !V.montado()) {
        UI.toast("Abra uma estação no visualizador (botão \"Ver em 360\") antes de gerar o vídeo — ele é gravado do que está na tela.", "erro");
        return;
      }
      var pg = Rel.podeGravar ? Rel.podeGravar() : { ok: true };
      if (!pg.ok) { UI.toast(pg.motivo, "erro"); return; }
      var t = Store.obter(eid(), ENT, ds.id) || tourAberto();
      if (!t) return;

      UI.modal("Gerar vídeo do tour", "<p>O visualizador vai girar sozinho em cada estação e gravar o percurso. "
        + "Não mexa na tela durante a gravação.</p><p class=\"muted\">Formato: " + esc(pg.formato || "WebM") + ".</p>"
        /* ⚠ O AVISO DO FORMATO PRECISA VIR ANTES DA GRAVAÇÃO. O vídeo do tour
           é o material que vai para o grupo da obra, e em WebM ele não abre
           no iPhone: metade dos clientes recebe um arquivo morto. O motor já
           sabe disso e devolve o aviso — deixá-lo no retorno e não na tela
           é o mesmo que não saber. */
        + (pg.aviso ? '<div class="card" style="border-left:4px solid #b45309;margin:8px 0">' + esc(pg.aviso) + "</div>" : "")
        + '<p id="t360-vprog" class="muted"></p>', [
        { texto: "Cancelar", classe: "ghost", onClick: function () { try { Rel.cancelar(); } catch (e) {} UI.fecharModal(); } },
        { texto: "Gravar", classe: "primary", onClick: function () {
          var prog = document.getElementById("t360-vprog");
          Rel.gravar(t, null, {
            aoAndar: function (i, n) { if (prog) prog.textContent = "Quadro " + i + " de " + n + "…"; }
          }).then(function (res) {
            UI.fecharModal();
            var b = Rel.baixar(res);
            if (!b || !b.ok) { UI.toast((b && b.motivo) || "Gravei, mas não consegui salvar o arquivo.", "erro"); return; }
            /* quadro perdido é troca de textura que não chegou a tempo: dizer
               isso é o que impede alguém de mandar ao cliente um vídeo com
               estação faltando achando que está inteiro */
            /* e o aviso também DEPOIS, porque quem clicou em Gravar pode não
               ter lido o modal — e é na hora de mandar o arquivo que a
               pessoa precisa saber que ele não abre no iPhone */
            if (res.avisoFormato) UI.toast(res.avisoFormato, "erro");
            if (res.quadrosPerdidos) UI.toast("Vídeo salvo, mas " + res.quadrosPerdidos + " quadro(s) não entraram.", "erro");
            else UI.toast("Vídeo salvo: " + res.nome + " (" + res.duracaoSeg + "s).", "ok");
          })["catch"](function (e) {
            UI.fecharModal();
            UI.toast("A gravação falhou: " + (e && e.message ? e.message : e), "erro");
          });
        } }
      ]);
    },

    /* ---------- editor ---------- */
    "t360-voltar": function () {
      G._t360Tour = ""; G._t360Pid = ""; G._t360Comparar = ""; G._t360ParPid = "";
      App.render();
    },

    "t360-add-ponto": function () {
      var M = motor();
      var t = tourAberto();
      if (!t) return;
      var cabe = M.cabePonto(t);
      if (!cabe.cabe) { UI.toast("Esta visita já tem o máximo de " + M.MAX_PONTOS + " estações.", "erro"); return; }
      _formPonto(t, null);
    },

    "t360-editar-ponto": function (ds) {
      var t = tourAberto();
      if (!t) return;
      _formPonto(t, motor().pontoDe(t, ds.pid));
    },

    "t360-excluir-ponto": function (ds) {
      var t = tourAberto();
      if (!t) return;
      var p = motor().pontoDe(t, ds.pid);
      if (!p) return;
      var quantos = Util.arr(p.hotspots).length + Util.arr(p.medidas).length;
      /* ⚠ O QUE VAI JUNTO ENTRA NA PERGUNTA. Apagar a estação leva os
         comentários e as medidas dela — e, na visita seguinte que nasceu
         desta, o par deixa de existir: o comparativo daquele ponto some. */
      if (!window.confirm("Excluir a estação \"" + (p.nome || "") + "\"?\n\n"
        + (quantos ? quantos + " comentário(s)/medida(s) vão junto.\n" : "")
        + "As visitas futuras que nascerem desta deixam de ter este ponto para comparar.")) return;
      t.pontos = Util.arr(t.pontos).filter(function (x) { return x.pid !== p.pid; });
      salvarTour(t);
      /* ⚠ as DUAS imagens da estacao: a foto 360 e o retrato do projeto.
         Deixar a segunda para tras a torna lixo invisivel no servidor, e ela
         pesa: come a cota de 2 GB da licenca sem pertencer a nada. */
      var refsP = [];
      if (p.foto) refsP.push(p.foto);
      if (p.projecao && p.projecao.foto) refsP.push(p.projecao.foto);
      if (refsP.length) { try { if (typeof Fotos !== "undefined" && Fotos.apagar) Fotos.apagar(refsP); } catch (e) {} }
      if (G._t360Pid === p.pid) G._t360Pid = "";
      UI.toast("Estação excluída.", "ok");
      App.render();
    },

    /* ⚠ OS DOIS CAMINHOS DA FOTO. "t360-foto" abre a CÂMERA (com `capture`);
       "t360-importar" abre a GALERIA (sem `capture`) — e é o único que
       alcança a foto tirada no modo Panorama em vários Androids. Os dois
       caem no mesmo `_receberFoto`: um caminho de imagem só, uma régua de
       compressão só. Ver a armadilha 5 do cabeçalho. */
    "t360-foto": function (ds) {
      G._t360FotoPid = ds.pid || "";
      pedirFoto(true);
    },

    "t360-importar": function (ds) {
      G._t360FotoPid = ds.pid || "";
      pedirFoto(false);
    },

    /* ⚠ CAPTURA GIRANDO DENTRO DO APP. Existe porque nem todo celular tem
       modo Panorama, e porque quem tem esquece de usar. Mas ela SÓ funciona em
       contexto seguro (https ou o app instalado): o servidor local do OrçaPRO
       é http puro, então no celular, pela rede da obra, `getUserMedia` não
       existe — e é por isso que o caminho principal continua sendo o arquivo.
       O botão só aparece quando `podeCapturar()` deixa; a recusa dele já vem
       com a saída escrita (`DICA_PANORAMA`). */
    "t360-capturar-girando": function (ds) {
      var Cap = global.Tour360Cap;
      if (!Cap) { UI.toast("O módulo de captura não carregou.", "erro"); return; }
      G._t360FotoPid = ds.pid || G._t360FotoPid || "";
      var pode = Cap.podeCapturar();
      if (!pode.ok) { UI.toast(pode.motivo + (pode.saida ? " " + pode.saida : ""), "erro"); return; }

      UI.modal("Capturar girando", ""
        + '<div id="t360-cap-palco" style="position:relative;background:#0b1a2b;border-radius:10px;overflow:hidden;min-height:220px"></div>'
        + '<p id="t360-cap-txt" class="muted" style="margin:10px 0 4px">Preparando a câmera…</p>'
        + '<div style="height:8px;background:var(--linha,#e2e8f0);border-radius:99px;overflow:hidden">'
        + '<div id="t360-cap-barra" style="height:100%;width:0;background:var(--verde,#15803d);transition:width .2s"></div></div>'
        + '<p class="muted" style="margin-top:10px;font-size:12.5px">' + esc(Cap.AVISO_COSTURA) + "</p>", [
        { texto: "Cancelar", classe: "ghost", onClick: function () { try { Cap.cancelar(); } catch (e) {} UI.fecharModal(); } },
        { texto: "Terminar e usar", classe: "primary", onClick: function () {
          var r = Cap.finalizar();
          UI.fecharModal();
          if (!r || !r.ok) { UI.toast((r && r.motivo) || "Nenhum quadro foi capturado.", "erro"); return; }
          if (r.aviso) UI.toast(r.aviso, "erro");
          if (!r.completo) UI.toast("A volta não fechou (" + Math.round((r.cobertura && r.cobertura.fracao || 0) * 100) + "% do giro). A foto entra assim mesmo, com o pedaço que faltou em preto.", "erro");
          _receberFoto(r.dataURI);
        } }
      ]);

      /* ⚠ o pedido de permissão de orientação (iOS 13+) TEM de sair de dentro
         do gesto — por isso `iniciar` é chamado aqui, no clique, e não depois
         de qualquer espera. */
      Cap.aoProgresso(function (est) {
        var txt = document.getElementById("t360-cap-txt");
        var barra = document.getElementById("t360-cap-barra");
        if (txt) txt.textContent = est.texto || "";
        if (barra) barra.style.width = Math.round((est.cobertura && est.cobertura.fracao || 0) * 100) + "%";
      });
      Cap.iniciar({ janela: global, doc: document }).then(function (r) {
        if (!r || !r.ok) {
          UI.fecharModal();
          UI.toast((r && r.motivo) || "Não consegui abrir a câmera.", "erro");
          return;
        }
        /* mostra o que a câmera está vendo: sem preview a pessoa gira às
           cegas e só descobre o enquadramento quando termina */
        var palco = document.getElementById("t360-cap-palco");
        var v = Cap.video && Cap.video();
        if (palco && v) {
          v.style.cssText = "position:relative;left:0;width:100%;height:auto;opacity:1;display:block";
          palco.appendChild(v);
        }
        var txt2 = document.getElementById("t360-cap-txt");
        if (txt2) txt2.textContent = "Gire devagar no lugar, sem andar. Os quadros são tirados sozinhos.";
      })["catch"](function (e) {
        UI.fecharModal();
        UI.toast("Falha ao abrir a câmera: " + ((e && e.message) || e), "erro");
      });
    },

    "t360-excluir-tour": function () {
      var t = tourAberto();
      if (!t) return;
      var r = motor().resumo(t);
      if (!window.confirm("Excluir a visita \"" + (t.titulo || "") + "\"?\n\n"
        + r.pontos + " estação(ões) e " + r.comFoto + " foto(s) vão junto. Não pode ser desfeito.")) return;
      var refs = [];
      Util.arr(t.pontos).forEach(function (p) {
        if (!p) return;
        if (p.foto) refs.push(p.foto);
        if (p.projecao && p.projecao.foto) refs.push(p.projecao.foto);   /* o retrato do projeto tambem */
      });
      /* ⚠ e a planta baixa, que não pertence a ponto nenhum: esquecida aqui,
         ela fica no servidor sem dono, comendo a cota da licença, e nenhuma
         tela consegue achá-la depois para apagar */
      if (t.planta && t.planta.foto) refs.push(t.planta.foto);
      Store.excluir(eid(), ENT, t.id);
      if (refs.length) { try { if (typeof Fotos !== "undefined" && Fotos.apagar) Fotos.apagar(refs); } catch (e) {} }
      G._t360Tour = ""; G._t360Pid = "";
      UI.toast("Visita excluída.", "ok");
      App.render();
    },

    /* ---------- visualizador ---------- */
    "t360-ver": function (ds) {
      G._t360Pid = ds.pid || "";
      G._t360Modo = "girar";
      G._t360Cliques = []; G._t360Medida = null; G._t360ParPid = "";
      _zerarArea();
      App.render();
    },

    /* trocar de estação pela SETA na foto ou pelo PINO do minimapa: mantém o
       rumo e, em tela cheia, não sai dela */
    "t360-ir-ponto": function (ds) {
      _irParaPonto(ds && ds.pid);
    },

    "t360-telacheia": function () {
      var V = vista();
      var host = document.getElementById("t360-host");
      /* ⚠ quando o viewer publicar `telaCheia`, é dele a decisão: ele sabe
         qual elemento leva o canvas, a camada de marcadores e a sobreposição
         juntos. A tela só chama. */
      if (V && typeof V.telaCheia === "function") {
        /* ⚠ `telaCheia` DEVOLVE PROMESSA: o navegador só responde ao pedido
           depois, e o viewer ainda tenta a tela cheia falsa quando a real é
           negada. Ler o retorno como objeto síncrono faria a tela julgar o
           resultado antes de ele existir — e o `ok:false` de verdade (palco
           não montado) passaria calado. Sem argumento ele ALTERNA, que é o
           que o mesmo botão precisa fazer para trazer a pessoa de volta. */
        var pr = null;
        try { pr = V.telaCheia(); } catch (e) { pr = null; }
        if (pr && typeof pr.then === "function") {
          pr.then(function (r) {
            if (r && r.ok === false) { UI.toast(r.motivo || "Não consegui abrir a tela cheia.", "erro"); return; }
            /* a porta entra junto com a trava, no mesmo passo — e `aoTelaCheia`
               já teria posto, mas só quando o viewer publica esse aviso */
            _botaoTelaCheia();
          });
        }
        return;
      }
      /* porta enquanto ele não publica: o próprio palco vai a tela cheia. É o
         mesmo elemento que já contém tudo (canvas, marcadores, minimapa). */
      if (!host) { UI.toast("Abra uma estação antes: a tela cheia é do visualizador.", "erro"); return; }
      var pedir = host.requestFullscreen || host.webkitRequestFullscreen || host.msRequestFullscreen;
      if (!pedir) {
        /* recado honesto: no iPhone o Safari não põe <div> em tela cheia, e
           dizer "não foi possível" sem dizer o que fazer não ajuda ninguém */
        UI.toast("Este navegador não abre a tela cheia por botão (é o caso do Safari no iPhone). Gire o aparelho para deitado: o palco ocupa a tela toda.", "erro");
        return;
      }
      try {
        var pr = pedir.call(host);
        if (pr && pr.then) pr.then(function () { _botaoTelaCheia(); });
        if (pr && pr["catch"]) pr["catch"](function (e) {
          UI.toast("Não consegui abrir em tela cheia: " + ((e && e.message) || e), "erro");
        });
      } catch (e2) {
        UI.toast("Não consegui abrir em tela cheia: " + ((e2 && e2.message) || e2), "erro");
      }
    },

    "t360-minimapa": function () {
      G._t360Mini = !G._t360Mini;
      /* ⚠ sem re-render aqui o rótulo do botão da barra continuaria dizendo
         "Esconder" com o mapa escondido — recado que mente. Em tela cheia o
         botão da barra nem está à vista, então basta refazer o mapa. */
      if (_emTelaCheia()) { _montarMinimapa(); return; }
      App.render();
    },

    "t360-fechar-visualizador": function () {
      /* larga o contexto WebGL ANTES de a tela trocar: quem sai do
         visualizador e entra no BIM leva dois contextos vivos junto */
      _largarPalco();
      G._t360Pid = ""; G._t360ParPid = "";
      G._t360Cliques = []; G._t360Medida = null;
      _zerarArea();
      App.render();
    },

    "t360-ponto-sel": function (ds) {
      /* ⚠ o clique no <select> chega aqui ANTES do change, com `value`
         indefinido; sem esta saída o re-render fecharia o dropdown na cara
         de quem acabou de abri-lo. */
      if (!ds || ds.value === undefined) return;
      G._t360Pid = ds.value ? String(ds.value) : G._t360Pid;
      G._t360Cliques = []; G._t360Medida = null; G._t360ParPid = "";
      _zerarArea();
      App.render();
    },

    "t360-modo": function (ds) {
      G._t360Modo = ds.modo || "girar";
      G._t360Cliques = []; G._t360Medida = null;
      _zerarArea();
      if (G._t360Modo !== "comparar") G._t360ParPid = "";
      App.render();
    },

    /* ---------- medir ---------- */
    "t360-tipo-medida": function (ds) {
      G._t360TipoMedida = (ds && ds.value === "altura") ? "altura" : "chao";
      G._t360Cliques = []; G._t360Medida = null;
      App.render();
    },

    "t360-limpar-medida": function () {
      G._t360Cliques = []; G._t360Medida = null;
      App.render();
    },

    "t360-salvar-medida": function () {
      var M = motor();
      var t = tourAberto(), p = pontoAberto(t);
      var res = G._t360Medida;
      if (!p || !res || !res.ok || G._t360Cliques.length < 2) return;
      if (Util.arr(p.medidas).length >= M.MAX_MEDIDAS) {
        UI.toast("Esta estação já tem " + M.MAX_MEDIDAS + " medidas — o limite do módulo.", "erro"); return;
      }
      var atual = Store.obter(eid(), ENT, t.id);
      var alvo = atual ? M.pontoDe(atual, p.pid) : null;
      if (!alvo) { UI.toast("Esta estação não existe mais.", "erro"); return; }
      var cli = document.getElementById("t360-med-cli");
      alvo.medidas = Util.arr(alvo.medidas);
      /* ⚠ GRAVA OS CLIQUES BRUTOS E A ALTURA USADA, nunca o resultado.
         `Tour360.recalcular` refaz a conta na leitura aplicando `corrigir()`;
         guardar o número congelado deixaria medida velha mentindo na tela
         depois de alguém acertar o nivelamento ou a altura da câmera. */
      alvo.medidas.push({
        mid: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        tipo: G._t360TipoMedida === "altura" ? "altura" : "chao",
        a: { yaw: G._t360Cliques[0].yaw, pitch: G._t360Cliques[0].pitch },
        b: { yaw: G._t360Cliques[1].yaw, pitch: G._t360Cliques[1].pitch },
        alturaCam: Util.num(alvo.alturaCam),
        rotulo: K.v("t360-med-rotulo"),
        autor: quemSou().autor,
        em: Util.agoraISO(),
        paraCliente: !!(cli && cli.checked)
      });
      salvarTour(atual);
      G._t360Cliques = []; G._t360Medida = null;
      UI.toast("Medida guardada.", "ok");
      App.render();
    },

    /* ⚠ A PORTA DA RECUSA "sem-altura". Quem não sabe a que altura o celular
       estava sabe, quase sempre, que aquele vão tem 3,00 m. `alturaPorReferencia`
       devolve a altura da câmera a partir disso — sem ela, o usuário digitaria
       um palpite e toda medida daquela estação erraria na mesma proporção. */
    "t360-calibrar": function () {
      var M = motor();
      var t = tourAberto(), p = pontoAberto(t);
      if (!p || G._t360Cliques.length < 2) {
        UI.toast("Marque antes os dois pontos de algo cuja distância você conhece.", "erro"); return;
      }
      var corpo = '<p>Os dois pontos que você marcou estão sobre algo de medida conhecida. Diga quanto ele mede de verdade.</p>'
        + '<div class="row">' + K.campo("Distância real, em metros *", K.inp("t360-cal-m", "")) + "</div>"
        + '<p class="muted">A altura calculada vale só para as fotos tiradas nesta mesma altura.</p>';
      UI.modal("Calibrar pela distância conhecida", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Calcular a altura da câmera", classe: "primary", onClick: function () {
          var metros = Util.num(K.v("t360-cal-m"));
          var r = M.alturaPorReferencia(G._t360Cliques[0].corr, G._t360Cliques[1].corr, metros);
          if (!r.ok) { UI.toast(r.motivo, "erro"); return; }
          var atual = Store.obter(eid(), ENT, t.id);
          var alvo = atual ? M.pontoDe(atual, p.pid) : null;
          if (!alvo) { UI.toast("Esta estação não existe mais.", "erro"); UI.fecharModal(); return; }
          alvo.alturaCam = r.alturaCam;
          salvarTour(atual);
          G._t360Medida = null;
          UI.fecharModal();
          UI.toast(r.nota, "ok");
          App.render();
        } }
      ]);
    },

    "t360-excluir-medida": function (ds) {
      var t = tourAberto(), p = pontoAberto(t);
      if (!p) return;
      var atual = Store.obter(eid(), ENT, t.id);
      var alvo = atual ? motor().pontoDe(atual, p.pid) : null;
      if (!alvo) return;
      alvo.medidas = Util.arr(alvo.medidas).filter(function (m) { return m.mid !== ds.mid; });
      salvarTour(atual);
      App.render();
    },

    "t360-excluir-coment": function (ds) {
      var t = tourAberto(), p = pontoAberto(t);
      if (!p) return;
      var atual = Store.obter(eid(), ENT, t.id);
      var alvo = atual ? motor().pontoDe(atual, p.pid) : null;
      if (!alvo) return;
      alvo.hotspots = Util.arr(alvo.hotspots).filter(function (h) { return h.hid !== ds.hid; });
      salvarTour(atual);
      App.render();
    },

    /* ---------- medir área ---------- */
    "t360-area-fechar": function () {
      var cl = G._t360AreaCliques;
      if (cl.length < 3) { UI.toast("Marque pelo menos três cantos do piso para fechar uma área.", "erro"); return; }
      _calcularArea();
      /* ⚠ só fecha quando o motor ACEITOU. Fechar sobre uma recusa deixaria a
         tela com o formulário de guardar por cima de um erro — e alguém
         guardaria o comentário com "undefined m²" dentro. */
      G._t360AreaFechada = !!(G._t360Area && G._t360Area.ok);
      App.render();
    },

    /* a porta da recusa por vértice: o motor diz QUAL canto está ruim, e
       apagar só ele é o que evita remarcar a sala inteira */
    "t360-area-desfazer": function () {
      G._t360AreaCliques = Util.arr(G._t360AreaCliques).slice(0, -1);
      G._t360AreaFechada = false;
      _calcularArea();
      App.render();
    },

    "t360-area-limpar": function () {
      _zerarArea();
      App.render();
    },

    /* ⚠ A ÁREA VIRA COMENTÁRIO, NÃO MEDIDA — o porquê está no cabeçalho do
       `_painelArea`: o registro de medida só sabe reler distância e altura. */
    "t360-area-comentar": function () {
      var M = motor();
      var t = tourAberto(), p = pontoAberto(t);
      var res = G._t360Area;
      if (!p || !res || !res.ok || !G._t360AreaCliques.length) return;
      if (Util.arr(p.hotspots).length >= M.MAX_HOTSPOTS) {
        UI.toast("Esta estação já tem " + M.MAX_HOTSPOTS + " comentários — o limite do módulo. Apague um antes.", "erro");
        return;
      }
      var atual = Store.obter(eid(), ENT, t.id);
      var alvo = atual ? M.pontoDe(atual, p.pid) : null;
      if (!alvo) { UI.toast("Esta estação não existe mais.", "erro"); return; }
      var rot = K.v("t360-area-rotulo");
      var cli = document.getElementById("t360-area-cli");
      var canto = G._t360AreaCliques[0];
      alvo.hotspots = Util.arr(alvo.hotspots);
      alvo.hotspots.push({
        hid: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        tipo: "comentario",
        /* o ± vai DENTRO do texto: o comentário viaja para o Portal e para o
           relatório sem o painel que explicava a margem */
        texto: (rot ? rot + ": " : "Área medida na foto: ")
          + n2(res.area) + " m² (±" + n1(res.erroEstimadoPct) + "%) · perímetro " + n2(res.perimetro) + " m · "
          + res.cantos + " cantos · altura da câmera " + n2(res.alturaCam) + " m",
        autor: quemSou().autor,
        em: Util.agoraISO(),
        yaw: Util.num(canto.yaw), pitch: Util.num(canto.pitch),
        paraCliente: !!(cli && cli.checked)
      });
      salvarTour(atual);
      _zerarArea();
      UI.toast("Área guardada como comentário no primeiro canto.", "ok");
      App.render();
    },

    /* ---------- passagens (as setas) ---------- */
    "t360-ligar": function () {
      var M = motor();
      var t = tourAberto(), p = pontoAberto(t);
      if (!p) return;
      var outro = K.v("t360-ligar-sel");
      if (!outro) { UI.toast("Escolha a estação para onde esta passagem leva.", "erro"); return; }
      var atual = Store.obter(eid(), ENT, t.id);
      var a = atual ? M.pontoDe(atual, p.pid) : null;
      var b = atual ? M.pontoDe(atual, outro) : null;
      if (!a || !b) { UI.toast("Uma das estações não existe mais.", "erro"); return; }
      /* ⚠ SEM RUMO DE PROPÓSITO. O rumo é a direção em que a passagem aparece
         NA FOTO, e ninguém sabe isso na hora de ligar: gravar o que a câmera
         está vendo agora poria a seta na parede errada com ar de certeza. A
         porta é o botão "Fixar a seta aqui", com a passagem no centro. */
      var r = M.ligarVizinhos(a, b, null);
      if (!r.ok) { UI.toast(r.motivo || "Não consegui ligar estas duas estações.", "erro"); return; }
      salvarTour(atual);
      UI.toast("Ligadas nos dois sentidos. Agora gire até ver a passagem e clique em \"Fixar a seta aqui\".", "ok");
      App.render();
    },

    "t360-desligar": function (ds) {
      var M = motor();
      var t = tourAberto(), p = pontoAberto(t);
      if (!p || !ds || !ds.pid) return;
      var atual = Store.obter(eid(), ENT, t.id);
      var a = atual ? M.pontoDe(atual, p.pid) : null;
      var b = atual ? M.pontoDe(atual, ds.pid) : null;
      if (!a || !b) return;
      M.desligarVizinhos(a, b);
      salvarTour(atual);
      UI.toast("Passagem desligada — nos dois sentidos.", "ok");
      App.render();
    },

    /* ⚠ O RUMO VEM DE `Tour360View.pose()`, CRU. A pessoa gira até a passagem
       ficar no centro e clica: é a única forma de acertar o rumo sem pedir que
       ela digite graus. O motor grava a volta como o oposto — palpite decente
       até alguém fixar a seta de lá também. */
    "t360-fixar-seta": function (ds) {
      var M = motor();
      var V = vista();
      var t = tourAberto(), p = pontoAberto(t);
      if (!p || !ds || !ds.pid) return;
      if (!V || !V.montado || !V.montado() || !V.pose) {
        UI.toast("O visualizador não está aberto — o rumo da seta é a direção que você está vendo na foto.", "erro");
        return;
      }
      var pose = V.pose();
      var atual = Store.obter(eid(), ENT, t.id);
      var a = atual ? M.pontoDe(atual, p.pid) : null;
      var b = atual ? M.pontoDe(atual, ds.pid) : null;
      if (!a || !b) { UI.toast("Uma das estações não existe mais.", "erro"); return; }
      var r = M.ligarVizinhos(a, b, pose.yaw);
      if (!r.ok) { UI.toast(r.motivo || "Não consegui fixar a seta.", "erro"); return; }
      salvarTour(atual);
      UI.toast("Seta fixada nesta direção. Na estação de lá, a de volta nasceu no rumo oposto — confira e ajuste por lá.", "ok");
      App.render();
    },

    /* ---------- planta baixa e minimapa ---------- */
    "t360-planta-anexar": function () {
      var t = tourAberto();
      if (!t) return;
      var Cap = global.Tour360Cap;
      /* sem `capture`: planta se escolhe no arquivo, nunca na câmera */
      if (Cap && typeof Cap.abrirSeletor === "function") {
        var r = Cap.abrirSeletor({ captura: false }, function (arq) {
          if (!arq) return;
          lerImagemSimples(arq, function (d) { if (d) _guardarPlanta(t, d, arq.name || ""); });
        });
        if (r && r.ok) return;
      }
      var el = document.getElementById("t360-planta-in");
      if (!el) { UI.toast("Não achei o seletor de imagem nesta tela.", "erro"); return; }
      el.value = "";
      el.click();
    },

    /* ⚠ A PLANTA DO BIM É UMA IMAGEM COMO OUTRA QUALQUER daqui para a frente:
       ela entra pelo mesmo `Fotos.guardar`. Guardar o `url` do BIM dentro do
       registro repetiria o defeito do panorama embutido — dataURL de PNG
       dentro da entidade estoura o documento de 1 MiB da nuvem. */
    "t360-planta-bim": function () {
      var t = tourAberto();
      if (!t) return;
      var B = global.BIM;
      if (!B || typeof B.plantaBaixa !== "function") {
        UI.toast("O visualizador BIM não está disponível nesta instalação.", "erro"); return;
      }
      var r = null;
      try { r = B.plantaBaixa(); } catch (e) { r = null; }
      if (!r || !r.url) {
        UI.toast("O BIM não devolveu planta agora. Abra o módulo BIM, carregue o modelo desta obra, ligue a ferramenta Planta e escolha a altura do corte — depois volte aqui.", "erro");
        return;
      }
      _guardarPlanta(t, r.url, "Planta do modelo" + (r.escala ? " 1:" + r.escala : ""));
    },

    "t360-planta-remover": function () {
      var t = tourAberto();
      if (!t || !t.planta || !t.planta.foto) return;
      if (!window.confirm("Remover a planta baixa desta visita?\n\n"
        + "O minimapa some do visualizador e do Portal do cliente.\n"
        + "Os pinos das estações continuam gravados: anexando outra imagem COM O MESMO ENQUADRAMENTO, eles voltam ao lugar. "
        + "Com outro enquadramento, é preciso reposicionar.")) return;
      var atual = Store.obter(eid(), ENT, t.id) || t;
      var antiga = atual.planta && atual.planta.foto;
      atual.planta = null;
      if (!salvarTour(atual)) return;
      if (antiga) { try { if (typeof Fotos !== "undefined" && Fotos.apagar) Fotos.apagar([antiga]); } catch (e) {} }
      _plantaRef = ""; _plantaSrc = "";
      UI.toast("Planta removida.", "ok");
      App.render();
    },

    "t360-posicionar-sel": function (ds) {
      if (!ds || ds.value === undefined) return;   /* o clique chega antes do change */
      G._t360PosPid = ds.value ? String(ds.value) : "";
      App.render();
    },

    "t360-tirar-pino": function (ds) {
      var M = motor();
      var t = tourAberto();
      if (!t || !ds || !ds.pid) return;
      var atual = Store.obter(eid(), ENT, t.id);
      var alvo = atual ? M.pontoDe(atual, ds.pid) : null;
      if (!alvo) return;
      alvo.planta = null;
      salvarTour(atual);
      /* ⚠ dito por extenso porque a consequência não é óbvia: sem posição na
         planta, a seta que não tem rumo gravado deixa de ter de onde sair. */
      UI.toast("Pino retirado. As setas desta estação que não tinham rumo fixado deixam de aparecer.", "ok");
      App.render();
    },

    /* ---------- comparar ---------- */
    "t360-comparar-tour": function (ds) {
      G._t360Comparar = (ds && ds.value) ? String(ds.value) : "";
      G._t360ParPid = "";
      App.render();
    },

    "t360-comparar-par": function (ds) {
      G._t360ParPid = ds.pid || "";
      App.render();
    },

    "t360-fechar-comparativo": function () {
      G._t360ParPid = "";
      App.render();
    },

    /* ---------- projetado × executado ---------- */
    "t360-ancorar": function () {
      var M = motor();
      var t = tourAberto(), p = pontoAberto(t);
      if (!p) return;
      if (typeof global.BIM === "undefined" || !global.BIM.cameraAtual) {
        UI.toast("O visualizador BIM não está disponível nesta instalação.", "erro"); return;
      }
      var cam = global.BIM.cameraAtual();
      if (!cam) {
        /* mensagem com saída: o BIM só devolve câmera depois de ter sido
           montado uma vez na sessão */
        UI.toast("Abra o BIM, carregue o modelo da obra e leve a câmera até onde a foto foi tirada. Depois volte aqui.", "erro");
        return;
      }
      var V = vista();
      var pose = (V && V.pose) ? V.pose() : { yaw: 0 };
      var r = M.ancorar(cam, pose.yaw);
      if (!r.ok) { UI.toast(r.motivo, "erro"); return; }
      var atual = Store.obter(eid(), ENT, t.id);
      var alvo = atual ? M.pontoDe(atual, p.pid) : null;
      if (!alvo) return;
      r.ancora.em = Util.agoraISO();
      alvo.ancora = r.ancora;
      salvarTour(atual);
      UI.toast("Estação ancorada no modelo, apontando para o rumo que você está vendo na foto.", "ok");
      App.render();
    },

    "t360-vista-bim": function () {
      var M = motor();
      var t = tourAberto(), p = pontoAberto(t);
      if (!p) return;
      var V = vista();
      var pose = (V && V.pose) ? V.pose() : { yaw: 0, pitch: 0, fov: 75 };
      var v = M.vistaDoPonto(p, pose.yaw, pose.pitch, { fov: pose.fov });
      if (!v.ok) { UI.toast(v.motivo, "erro"); return; }
      if (typeof global.BIM === "undefined" || !global.BIM.aplicarVista) {
        UI.toast("O visualizador BIM não está disponível nesta instalação.", "erro"); return;
      }
      var r = global.BIM.aplicarVista({ camera: v.camera });
      if (!r || !r.ok) {
        UI.toast("O BIM ainda não está montado nesta sessão: abra o módulo BIM e carregue o modelo da obra, depois repita.", "erro");
        return;
      }
      /* larga o palco ANTES de navegar: o BIM monta o contexto dele no
         afterRender da view nova, e dois contextos vivos derrubam os dois */
      _largarPalco();
      if (typeof App !== "undefined" && App.irPara) App.irPara("bim");
    },

    /* Tira o retrato do modelo na pose da âncora e guarda como foto. É ele
       que a sobreposição usa depois, sem precisar do BIM aceso. */
    "t360-retratar-bim": function () {
      var M = motor();
      var t = tourAberto(), p = pontoAberto(t);
      if (!p) return;
      var B = global.BIM;
      if (!B || !B.aplicarVista || !B.desenharQuadro) {
        UI.toast("O visualizador BIM não está disponível nesta instalação.", "erro"); return;
      }
      var V = vista();
      var pose = (V && V.pose) ? V.pose() : { yaw: 0, pitch: 0, fov: 75 };
      var v = M.vistaDoPonto(p, pose.yaw, pose.pitch, { fov: pose.fov });
      if (!v.ok) { UI.toast(v.motivo, "erro"); return; }
      var r = B.aplicarVista({ camera: v.camera });
      if (!r || !r.ok) {
        UI.toast("O BIM ainda não está montado nesta sessão: abra o módulo BIM, carregue o modelo da obra e repita.", "erro");
        return;
      }
      /* ⚠ `desenharQuadro` faz um render SÍNCRONO e devolve o canvas. `BIM.foto()`
         faria o mesmo E baixaria um PNG na máquina do usuário como efeito
         colateral — arquivo que ninguém pediu, a cada retrato. */
      var cv = null;
      try { cv = B.desenharQuadro(); } catch (e) {}
      if (!cv || !cv.toDataURL) { UI.toast("Não consegui capturar a imagem do modelo.", "erro"); return; }
      var png = cv.toDataURL("image/png");
      if (typeof Fotos === "undefined" || !Fotos.guardar) { UI.toast("O módulo de fotos não carregou.", "erro"); return; }
      Fotos.guardar(png, "Projeto — " + (p.nome || "estação"), { larguraMax: 2048, qualidade: 0.9 }).then(function (ref) {
        var atual = Store.obter(eid(), ENT, t.id) || t;
        var alvo = M.pontoDe(atual, p.pid);
        if (!alvo) return;
        var antiga = alvo.projecao && alvo.projecao.foto;
        alvo.projecao = { foto: ref, yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov, em: Util.agoraISO() };
        if (!salvarTour(atual)) return;
        if (antiga) { try { if (Fotos.apagar) Fotos.apagar([antiga]); } catch (e) {} }
        UI.toast("Retrato do projeto guardado.", "ok");
        App.render();
      });
    },

    "t360-vista-projeto": function () {
      var t = tourAberto(), p = pontoAberto(t);
      var V = vista();
      if (!p || !p.projecao || !V || !V.olharPara) return;
      V.olharPara(p.projecao.yaw, p.projecao.pitch, p.projecao.fov);
      _pintarSobreposicao();
    }
  });

  /* ---------- a sobreposição do projeto ----------
     Desenha o retrato do modelo por cima da foto, com a opacidade escolhida,
     e SÓ enquanto a câmera estiver na pose em que ele foi tirado. */
  var _imgProjeto = null, _imgProjetoPid = "";

  function _pintarSobreposicao() {
    var V = vista();
    if (!V || !V.montado || !V.montado() || !V.sobrepor) return;
    var t = tourAberto(), p = pontoAberto(t);
    var aviso = document.getElementById("t360-op-aviso");
    if (!p || !p.projecao || !p.projecao.foto || G._t360Modo !== "projetado") { V.sobrepor(null); return; }
    if (!_imgProjeto || _imgProjetoPid !== p.pid) { V.sobrepor(null); return; }

    var M = motor();
    var pose = V.pose();
    var chk = M.poseProxima(pose, p.projecao, 4);
    if (!chk.ok) {
      V.sobrepor(null);
      if (aviso) aviso.textContent = chk.motivo;
      return;
    }
    if (aviso) aviso.textContent = "";
    V.sobrepor(_imgProjeto, G._t360Opacidade == null ? 0.5 : G._t360Opacidade);
  }
  G._t360PintarSobreposicao = _pintarSobreposicao;

  /* ---------- formulário da estação ---------- */
  function _formPonto(t, p) {
    var M = motor();
    var ehNovo = !p;
    var base = p || M.novoPonto("Ponto " + (Util.arr(t.pontos).length + 1), {});
    var corpo = '<div class="row">'
      + K.campo("Nome da estação *", K.inp("t360-p-nome", base.nome))
      + K.campo("Nível / pavimento", K.inp("t360-p-nivel", base.nivel))
      + "</div>"
      + '<div class="row">'
      + K.campo("Altura da câmera (m) *", K.inp("t360-p-alt", base.alturaCam))
      + K.campo("Correção de norte (°)", K.inp("t360-p-norte", base.nortear))
      + K.campo("Correção de horizonte (°)", K.inp("t360-p-hor", base.horizonte))
      + "</div>"
      + '<p class="muted">A <b>altura da câmera</b> é o que transforma ângulo em metro: se ela estiver errada, toda '
      + "medida desta estação erra na mesma proporção. 1,60 m é o padrão de quem segura o celular na frente do rosto; "
      + "com tripé ou bastão, meça.</p>"
      + '<p class="muted">A <b>correção de norte</b> gira a origem da foto para o mesmo rumo em todas as visitas — '
      + "é ela que faz a cortina do comparativo abrir na mesma parede em agosto e em setembro. A <b>correção de "
      + "horizonte</b> nivela a foto tirada torta.</p>";

    UI.modal(ehNovo ? "Nova estação" : "Editar estação", corpo, [
      { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Salvar", classe: "primary", onClick: function () {
        var nome = K.v("t360-p-nome");
        if (!nome) { UI.toast("Dê um nome à estação — é por ele que você a acha no tour.", "erro"); return; }
        var alt = Util.num(K.v("t360-p-alt"));
        if (!(alt > 0)) { UI.toast("Informe a altura da câmera: sem ela não dá para medir nada nesta estação.", "erro"); return; }
        var atual = Store.obter(eid(), ENT, t.id) || t;
        var alvo = ehNovo ? M.novoPonto(nome, {}) : M.pontoDe(atual, base.pid);
        if (!alvo) { UI.toast("Esta estação não existe mais.", "erro"); UI.fecharModal(); return; }
        alvo.nome = nome;
        alvo.nivel = K.v("t360-p-nivel");
        alvo.alturaCam = alt;
        alvo.nortear = Util.num(K.v("t360-p-norte"));
        alvo.horizonte = Util.num(K.v("t360-p-hor"));
        if (ehNovo) {
          atual.pontos = Util.arr(atual.pontos);
          atual.pontos.push(alvo);
        }
        salvarTour(atual);
        /* o nivelamento mudou: a esfera precisa reabrir com o novo giro */
        G._t360Carregado = "";
        UI.fecharModal();
        App.render();
      } }
    ]);
  }

  /* ===================================================================
   * FIAÇÃO PÓS-RENDER
   *
   * ⚠ Tudo que é campo de DIGITAR ou de ARRASTAR se liga aqui, nunca por
   *   `data-gacao`: o dispatcher escuta clique, a tela re-renderiza e o campo
   *   some debaixo do dedo. `data-gacao` só em <button> e <select>.
   * =================================================================== */
  G.registrarWire("tour360", function () {
    /* 1) os inputs de arquivo do editor — a rede de `Tour360Cap.abrirSeletor`.
       São dois para a foto (com e sem `capture`) porque o navegador resolve o
       comportamento do seletor quando o elemento NASCE: trocar o atributo na
       hora do clique não é confiável, e o que se perde nessa aposta é
       justamente a galeria — onde mora o panorama. */
    ["t360-foto-in", "t360-foto-imp"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.onchange = function () {
        var f = (el.files || [])[0];
        el.value = "";
        if (!f) return;
        lerArquivo(f, _receberFoto);
      };
    });

    /* 1b) o input da planta baixa — leitura simples, sem a classificação de
       panorama (ver `lerImagemSimples`) */
    var inpP = document.getElementById("t360-planta-in");
    if (inpP) {
      inpP.onchange = function () {
        var f = (inpP.files || [])[0];
        inpP.value = "";
        if (!f) return;
        var t0 = tourAberto();
        if (!t0) return;
        lerImagemSimples(f, function (d) { if (d) _guardarPlanta(t0, d, f.name || ""); });
      };
    }

    /* 1c) A PLANTA DO EDITOR: a imagem e o clique que põe o pino.
       ⚠ O clique NÃO pode virar `data-gacao` (o dispatcher escuta clique em
       botão, e aqui o alvo é uma imagem) e a posição TEM de ser gravada em
       FRAÇÃO do quadro: a mesma planta é desenhada com larguras diferentes no
       editor, no minimapa e no Portal — em pixel, o pino andaria em dois
       desses três lugares. */
    var quadro = document.getElementById("t360-planta-quadro");
    if (quadro) {
      var imgPl = document.getElementById("t360-planta-img");
      var tPl = tourAberto();
      if (imgPl && tPl) {
        _pedirPlanta(tPl, function (src) {
          var alvoImg = document.getElementById("t360-planta-img");
          var q2 = document.getElementById("t360-planta-quadro");
          if (!alvoImg || !q2) return;
          if (src) { alvoImg.src = src; return; }
          /* ⚠ SEM A IMAGEM, O QUADRO VIRA UMA MENTIRA: os pinos ficariam
             flutuando sobre o nada, com o cursor de mira convidando a clicar —
             e cada clique gravaria uma posição medida num quadro vazio. Aqui
             ele diz o que houve e para de aceitar clique. */
          q2.style.cursor = "default";
          q2.innerHTML = "";
          var d = document.createElement("div");
          d.className = "muted";
          d.style.cssText = "line-height:1.45;padding:10px 2px";
          d.textContent = "A imagem desta planta não está neste aparelho. Se ela foi anexada em outro computador, espere a sincronização; se não vier, anexe a imagem de novo por aqui.";
          q2.appendChild(d);
        });
      }
      quadro.onclick = function (ev) {
        /* ⚠ sem imagem carregada não há de onde medir a fração: o quadro
           mede a área do TEXTO de aviso, e o pino sairia num lugar que não
           corresponde a nada da planta */
        var im = document.getElementById("t360-planta-img");
        if (!im || !im.getAttribute("src")) {
          UI.toast("A imagem da planta não está neste aparelho — sem ela não dá para marcar posição nenhuma.", "erro");
          return;
        }
        var r = this.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var fx = (ev.clientX - r.left) / r.width;
        var fy = (ev.clientY - r.top) / r.height;
        if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
        if (!G._t360PosPid) {
          UI.toast("Escolha antes, na lista acima, qual estação você está posicionando.", "erro");
          return;
        }
        var t2 = tourAberto();
        if (!t2) return;
        var atual = Store.obter(eid(), ENT, t2.id) || t2;
        var alvo = motor().pontoDe(atual, G._t360PosPid);
        if (!alvo) { UI.toast("Esta estação não existe mais.", "erro"); return; }
        alvo.planta = { x: Math.round(fx * 1000) / 1000, y: Math.round(fy * 1000) / 1000 };
        if (!salvarTour(atual)) return;
        UI.toast("\"" + (alvo.nome || "") + "\" posicionada na planta.", "ok");
        App.render();
      };
    }

    /* 2) as miniaturas do editor — `Fotos.dataURI` é assíncrono */
    var thumbs = document.querySelectorAll("[data-t360foto]");
    if (thumbs && thumbs.length) {
      var t = tourAberto();
      if (t && typeof Fotos !== "undefined" && Fotos.dataURI) {
        Array.prototype.forEach.call(thumbs, function (el) {
          var p = motor().pontoDe(t, el.getAttribute("data-t360foto"));
          if (!p || !p.foto) return;
          Fotos.dataURI(p.foto).then(function (d) {
            if (!d || !el.parentNode) return;
            var img = document.createElement("img");
            img.src = d;
            img.alt = "";
            img.style.cssText = "width:96px;height:48px;object-fit:cover;border-radius:6px;display:block";
            el.innerHTML = "";
            el.appendChild(img);
          });
        });
      }
    }

    /* 3) a cortina do comparativo — arrastar não pode re-renderizar */
    var cort = document.getElementById("t360-cortina");
    if (cort) {
      cort.oninput = function () {
        var f = Util.num(this.value) / 100;
        G._t360Cortina = f;
        var V = vista();
        if (V && V.cortina) V.cortina(f);
      };
    }

    /* 3b) a sobreposição do projeto: opacidade e carga do retrato */
    var op = document.getElementById("t360-op");
    if (op) {
      op.oninput = function () {
        G._t360Opacidade = Util.num(this.value) / 100;
        _pintarSobreposicao();
      };
    }
    (function () {
      var t2 = tourAberto(), p2 = pontoAberto(t2);
      if (!p2 || !p2.projecao || !p2.projecao.foto) { _imgProjeto = null; _imgProjetoPid = ""; return; }
      if (_imgProjetoPid === p2.pid && _imgProjeto) return;   // já está em mãos
      if (typeof Fotos === "undefined" || !Fotos.dataURI) return;
      Fotos.dataURI(p2.projecao.foto).then(function (d) {
        if (!d) return;
        var im = new Image();
        im.onload = function () { _imgProjeto = im; _imgProjetoPid = p2.pid; _pintarSobreposicao(); };
        im.src = d;
      });
    })();

    /* 4) o palco 3D */
    _montarPalco();

    /* 5) o minimapa por cima do palco. Vem DEPOIS de `_montarPalco` porque o
       viewer, ao re-hospedar a cena, pendura o canvas e as camadas dele no
       host — e o mapa tem de ficar por cima de todos eles. */
    _montarMinimapa();
    /* e o botão de sair da tela cheia, se a tela foi redesenhada com ela
       ligada (o host é recriado a cada render: o botão vai junto) */
    _botaoTelaCheia();
  });

  /* ⚠ SAIR DA TELA TEM QUE LARGAR O CONTEXTO WEBGL, E TEM QUE SER SÍNCRONO.
   *
   * O viewer BIM monta o contexto dele DENTRO do `afterRender` da casa
   * (`_bimWire`). Se o tour só largasse o palco no quadro seguinte, o BIM
   * subiria com o nosso ainda vivo — e "Too many active WebGL contexts"
   * derruba os dois, com a tela do BIM em preto e nenhum erro visível.
   * Por isso o gancho entra ANTES: quando a view pedida não é a nossa, o tour
   * larga o palco e só então a casa monta o que for.
   *
   * `desmontar()` é idempotente (`if (!S) return`), então chamar em toda
   * troca de view não custa nada. A cadeia PRESERVA o afterRender original —
   * substituí-lo apagaria a fiação de todos os outros módulos. */
  if (!G._t360SaidaLigada) {
    G._t360SaidaLigada = true;
    var afterRenderDaCasa = G.afterRender;
    G.afterRender = function (view) {
      if (view !== "tour360") { try { _largarPalco(); } catch (e) {} }
      if (typeof afterRenderDaCasa === "function") return afterRenderDaCasa.apply(this, arguments);
    };
  }

})(typeof window !== "undefined" ? window : this);
