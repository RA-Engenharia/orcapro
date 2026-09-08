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
          + '<button class="btn sm" data-gacao="t360-foto" data-pid="' + esc(p.pid) + '">' + (temFoto ? "Trocar foto" : "Tirar/escolher foto") + "</button> "
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

    html += '<div class="flex mt t360-rodape">'
      + '<button class="btn primary" data-gacao="t360-add-ponto"' + (cabe.cabe ? "" : " disabled") + ">+ Adicionar estação</button>"
      + '<span class="muted" style="align-self:center;margin-left:12px">'
      + (cabe.cabe ? "Cabem mais " + cabe.restam + " estação(ões) nesta visita." : "Esta visita chegou ao limite de estações — um tour maior que isso ninguém navega.")
      + "</span>"
      + '<span style="flex:1"></span>'
      + '<button class="btn danger" data-gacao="t360-excluir-tour">Excluir esta visita</button>'
      + "</div>";

    /* ⚠ O input de arquivo NÃO leva `data-gacao`: o dispatcher escuta clique e
       a tela re-renderizaria com o seletor de arquivo aberto. Ele é ligado por
       `registrarWire`, depois de o DOM existir. */
    html += '<input type="file" id="t360-foto-in" accept="image/*" capture="environment" style="display:none">';
    return html;
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
      ["comentar", "Comentar"],
      ["comparar", "Comparar"],
      ["projetado", "Projetado × Executado"]
    ];
    html += '<div class="flex mb t360-barra" style="gap:6px;flex-wrap:wrap">' + modos.map(function (m) {
      return '<button class="btn sm ' + (m[0] === G._t360Modo ? "primary" : "") + '" data-gacao="t360-modo" data-modo="' + m[0] + '">' + esc(m[1]) + "</button>";
    }).join("") + "</div>";

    /* ⚠ O PALCO PRECISA DE ALTURA PRÓPRIA. Um host com `height:auto` mede 0 e
       o `redimensionar` do viewer desiste (`if (!w || !alt) return`) — o
       canvas fica de 0 px e a tela sai preta, sem erro nenhum. O resto do
       visual mora em css/tour360.css, na classe. */
    html += '<div id="t360-host" class="t360-host t360-palco" style="height:min(70vh,620px);position:relative;overflow:hidden"></div>';

    html += '<div class="t360-painel mt">';
    if (G._t360Modo === "medir") html += _painelMedir(t, p);
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

  function pedirFoto() {
    var el = document.getElementById("t360-foto-in");
    if (!el) { UI.toast("Não achei o seletor de foto nesta tela.", "erro"); return; }
    el.value = "";
    el.click();
  }

  /* ⚠ PONTO ÚNICO DE CHEGADA DA IMAGEM, venha ela do módulo de captura ou do
     seletor de arquivo. Dois caminhos até `Fotos.guardar` seria o começo de
     duas réguas de compressão — e a régua errada aqui é a que devolve a obra
     ilegível ao dar zoom. */
  function _receberFoto(dataURI) {
    if (!dataURI) { UI.toast("Não consegui ler a imagem.", "erro"); return; }
    var t = tourAberto();
    var p = t ? motor().pontoDe(t, G._t360FotoPid) : null;
    if (!p) { UI.toast("Escolha antes em qual estação a foto entra.", "erro"); return; }
    _guardarFoto(t, p, dataURI);
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
        cb(res.dataURI);
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

  function _guardarFoto(t, p, dataURI) {
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
        alvo.capturadoEm = Util.agoraISO();
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

    if (typeof Fotos === "undefined" || !Fotos.dataURI) {
      _mostrarMotivo(document.getElementById("t360-host"), "O módulo de fotos não carregou (falta js/fotos.js) — não há como buscar a imagem desta estação.");
      return;
    }

    if (G._t360Carregado === chave || G._t360Carregando === chave) return;
    G._t360Carregando = chave;

    function pronto(ok) {
      G._t360Carregando = "";
      if (ok) G._t360Carregado = chave;
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
    V.marcadores(lista);
  }

  /* ===================================================================
   * O CLIQUE NA FOTO
   * =================================================================== */
  function _clique(ang) {
    if (!ang) return;
    if (G._t360Modo === "medir") return _cliqueMedir(ang);
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

    "t360-foto": function (ds) {
      G._t360FotoPid = ds.pid || "";
      pedirFoto();
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
      App.render();
    },

    "t360-fechar-visualizador": function () {
      /* larga o contexto WebGL ANTES de a tela trocar: quem sai do
         visualizador e entra no BIM leva dois contextos vivos junto */
      _largarPalco();
      G._t360Pid = ""; G._t360ParPid = "";
      G._t360Cliques = []; G._t360Medida = null;
      App.render();
    },

    "t360-ponto-sel": function (ds) {
      G._t360Pid = (ds && ds.value) ? String(ds.value) : G._t360Pid;
      G._t360Cliques = []; G._t360Medida = null; G._t360ParPid = "";
      App.render();
    },

    "t360-modo": function (ds) {
      G._t360Modo = ds.modo || "girar";
      G._t360Cliques = []; G._t360Medida = null;
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
    /* 1) o input de arquivo do editor */
    var inpF = document.getElementById("t360-foto-in");
    if (inpF) {
      inpF.onchange = function () {
        var f = (inpF.files || [])[0];
        inpF.value = "";
        if (!f) return;
        lerArquivo(f, _receberFoto);
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
