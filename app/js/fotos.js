/* =====================================================================
 * fotos.js — as fotos do diário fora do registro
 *
 * A foto do RDO era gravada em base64 DENTRO do registro. Duas quebras, as
 * duas silenciosas: o Firestore guarda a entidade "rdo" inteira num único
 * documento de 1 MiB (uma foto real mede ~139 KB, então com 8 fotos a
 * sincronização daquele cliente parava PARA SEMPRE, com o app dizendo
 * "Sincronizado"); e ao publicar o Portal o app cortava as fotos dos diários
 * antigos até o envio caber — o cliente abria o Portal e a foto não estava lá.
 *
 * Agora o registro guarda só a REFERÊNCIA:
 *     { id, leg, bytes, remoto }        ~80 bytes em vez de ~139 KB
 *
 * Os bytes vivem em dois lugares, de propósito:
 *   • IndexedDB, aqui no aparelho — é o que faz a foto aparecer na hora e
 *     continuar aparecendo sem sinal, que é a situação normal de uma obra;
 *   • no servidor, para os OUTROS aparelhos verem.
 *
 * A obra é o lugar com pior internet do mundo. Então nada aqui depende de
 * estar online: a foto é aceita, guardada e mostrada offline, e a subida fica
 * numa fila que anda sozinha quando a rede volta.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Fotos = {};

  var PREF = "orcapro:foto:";          // chave no IndexedDB
  var FILA = "orcapro:fotos:fila";     // ids esperando subir (localStorage: sobrevive a fechar o app)
  var LARGURA_MAX = 1600;              // px — acima disso é peso sem ganho no diário
  var QUALIDADE = 0.72;                // JPEG

  /* ⚠ O endereço do servidor mora na RAIZ do CONFIG (js/config.js:26), NÃO
   * dentro de CONFIG.backend — que só tem modo/sync/firebaseConfig. Eu li do
   * lugar errado, srv() devolvia "" sempre, e NENHUMA foto subia: a fila cortava
   * em silêncio, sem erro na tela, e a foto ficava só no aparelho que a tirou.
   * Os outros seis módulos do app já liam daqui; o meu era o único fora do
   * padrão. Mesmo formato de js/licenca.js:40. */
  function srv() {
    try {
      return (typeof CONFIG !== "undefined" && CONFIG.licencaServer)
        ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
    } catch (e) { return ""; }
  }
  function chave() {
    try { return (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : ""; } catch (e) { return ""; }
  }
  function novoId() {
    /* id LOCAL, só para casar a referência com os bytes no aparelho enquanto a
       foto não subiu. O id que vale lá fora é o que o servidor devolve. */
    return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function lerFila() {
    try { return JSON.parse(localStorage.getItem(FILA) || "[]") || []; } catch (e) { return []; }
  }
  function gravarFila(f) {
    try { localStorage.setItem(FILA, JSON.stringify(f.slice(0, 500))); } catch (e) {}
  }

  /* ---------------------------------------------------------------
   * REDUZIR ANTES DE GUARDAR
   * Foto de celular hoje sai com 3 a 12 MB. Guardar isso multiplicado por 20
   * por diário enche o aparelho do cliente e o nosso disco sem nenhum ganho:
   * o diário é lido na tela e impresso em A4. 1600 px já é mais do que o
   * impresso usa.
   * --------------------------------------------------------------- */
  Fotos.reduzir = function (dataURI, cb, opts) {
    try {
      /* ⚠ O DIÁRIO E A PROPOSTA QUEREM COISAS DIFERENTES. 1600 px e 0,72 são
         a régua da foto de OBRA, que é prova e vai para a tela. A capa de uma
         proposta impressa em A4 a 1600 px sai com ~135 dpi, e a diferença
         aparece no papel que o cliente segura. Quem precisa de mais pede; o
         padrão continua o do diário, para nenhum caminho existente mudar de
         peso sem querer. */
      var lMax = (opts && opts.larguraMax > 0) ? opts.larguraMax : LARGURA_MAX;
      var qual = (opts && opts.qualidade > 0) ? opts.qualidade : QUALIDADE;

      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          /* ⚠ NÃO RECOMPRIMIR O QUE JÁ ESTÁ PRONTO. A tela do diário já reduz a
           * foto antes de chamar aqui (gestao.js `_comprimirFoto`), então este
           * passo repetia a compressão JPEG em cima de JPEG: perda de qualidade
           * de graça, na imagem que serve de PROVA, e sem ganho de tamanho —
           * recomprimir um JPEG já comprimido costuma até aumentá-lo.
           * Se já cabe na largura e já é JPEG, devolve como veio. */
          if (w <= lMax && /^data:image\/jpe?g[;,]/i.test(String(dataURI))) {
            cb(dataURI, w, h); return;
          }
          if (w > lMax) { h = Math.round(h * (lMax / w)); w = lMax; }
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          cb(c.toDataURL("image/jpeg", qual), w, h);
        } catch (e) { cb(dataURI, 0, 0); }   // falhou reduzir: guarda como veio
      };
      img.onerror = function () { cb(dataURI, 0, 0); };
      img.src = dataURI;
    } catch (e) { cb(dataURI, 0, 0); }
  };

  function bytesDe(dataURI) {
    var i = String(dataURI || "").indexOf(",");
    if (i < 0) return 0;
    return Math.round((dataURI.length - i - 1) * 0.75);
  }

  /* ---------------------------------------------------------------
   * GUARDAR — devolve a referência que vai para o registro do diário
   * --------------------------------------------------------------- */
  Fotos.guardar = function (dataURI, legenda, opts) {
    return new Promise(function (res) {
      Fotos.reduzir(dataURI, function (reduzida, w, h) {
        var ref = { id: novoId(), leg: String(legenda || ""), bytes: bytesDe(reduzida), remoto: "", w: w, h: h };
        var guardarLocal = (typeof Idb !== "undefined" && Idb.disponivel())
          ? Idb.set(PREF + ref.id, reduzida)
          : Promise.reject(new Error("sem IndexedDB"));

        guardarLocal.then(function () {
          var f = lerFila(); f.push(ref.id); gravarFila(f);
          Fotos.andarFila();          // tenta subir já; se não der, fica na fila
          res(ref);
        }).catch(function () {
          /* Sem IndexedDB (navegador antigo, janela anônima): cai para o modo
             velho, com a foto DENTRO do registro. O encarregado não perde a
             foto que acabou de tirar, mas o diário volta a pesar ~139 KB por
             foto em vez dos 82 bytes da referência — e é esse peso que estoura
             o limite de 1 MiB por documento e trava a sincronização.
             ⚠ O comentário que estava aqui afirmava que "o aviso de tamanho
             aparece na tela". Não aparecia: o único aviso do app é o de
             localStorage no boot, que é outra coisa. Agora avisa de verdade —
             uma vez por sessão, senão sairia a cada foto anexada. */
          if (!Fotos._avisouSemIDB) {
            Fotos._avisouSemIDB = true;
            try {
              if (global.UI && UI.toast) {
                UI.toast("Este navegador não consegue guardar as fotos separadamente (janela anônima?). Elas vão para dentro do diário, pesam muito mais e podem travar a sincronização. Prefira uma janela normal.", "erro");
              }
            } catch (e) {}
          }
          res({ id: "", leg: String(legenda || ""), bytes: bytesDe(reduzida), remoto: "", d: reduzida, semIDB: true });
        });
      }, opts);
    });
  };

  /* Mostrar: local primeiro (instantâneo e funciona sem sinal), servidor
     depois. "d" é o formato velho, ainda existente nos diários antigos. */
  Fotos.dataURI = function (ref) {
    if (!ref) return Promise.resolve("");
    if (ref.d) return Promise.resolve(ref.d);
    if (!ref.id && !ref.remoto) return Promise.resolve("");
    var local = (ref.id && typeof Idb !== "undefined" && Idb.disponivel())
      ? Idb.get(PREF + ref.id) : Promise.resolve(null);
    return local.then(function (v) {
      if (v) return v;
      if (!ref.remoto || !ref.tenant) return "";
      return Fotos.baixar(ref);
    }).catch(function () { return ref.remoto ? Fotos.baixar(ref) : ""; });
  };

  /* Endereço da foto SEM credencial nenhuma.
   *
   * ⚠ NÃO sai chave de licença aqui. Antes esta função concatenava
   * "?licenca=" + chave() — e a chave é a credencial que abre a conta inteira.
   * URL de imagem vaza por três caminhos que ninguém controla: histórico do
   * navegador, log de acesso do servidor e cabeçalho Referer. Isso passou
   * despercebido no gate porque, com o bug do srv(), a URL nunca chegava a ser
   * construída — o achado foi julgado "não reproduz" por causa de OUTRO bug.
   * Consertado o srv(), o vazamento passou a ser real.
   *
   * O servidor aceita a licença por header (server/vps/fotos-srv.js:123, que lê
   * x-licenca ANTES da query), então quem baixa manda no header. Consequência
   * do contrato: este endereço NÃO serve para <img src>, que não manda header —
   * para pôr foto na tela ou no impresso use Fotos.dataURI(ref). */
  Fotos.url = function (ref) {
    if (!ref || !ref.remoto || !ref.tenant) return "";
    return srv() + "/api/foto/" + encodeURIComponent(ref.tenant) + "/" + encodeURIComponent(ref.remoto);
  };

  Fotos.baixar = function (ref) {
    var u = Fotos.url(ref);
    if (!u) return Promise.resolve("");
    return fetch(u, { headers: { "x-licenca": chave() } }).then(function (r) {
      if (!r.ok) return "";
      return r.blob().then(function (b) {
        return new Promise(function (res) {
          var fr = new FileReader();
          fr.onload = function () {
            /* guarda no aparelho: da próxima vez abre sem rede */
            try { if (typeof Idb !== "undefined" && Idb.disponivel() && ref.id) Idb.set(PREF + ref.id, fr.result); } catch (e) {}
            res(fr.result);
          };
          fr.onerror = function () { res(""); };
          fr.readAsDataURL(b);
        });
      });
    }).catch(function () { return ""; });
  };

  /* ---------------------------------------------------------------
   * FILA DE SUBIDA — anda sozinha
   * Uma foto por vez, de propósito: o celular na obra costuma estar em 3G
   * ruim, e disparar 20 envios juntos faz todos falharem por tempo esgotado.
   * --------------------------------------------------------------- */
  Fotos._subindo = false;

  /* ---------------------------------------------------------------
   * TRAVA ENTRE ABAS
   * `_subindo` é variável de módulo: vale por ABA. A fila mora no localStorage
   * e os bytes no IndexedDB — os dois por ORIGEM —, então duas abas do app
   * pegam o MESMO id, sobem a mesma foto duas vezes (duas cópias comendo a cota
   * do cliente) e a segunda ainda devolve à fila um id que a primeira já tinha
   * tirado, ressuscitando um envio concluído. O produto já assume multi-aba
   * (js/autoupdate.js:125 trata "outra aba já está aplicando").
   * Sem BroadcastChannel nem navigator.locks aqui, a trava é uma chave com dono
   * e validade — expira sozinha se a aba morrer no meio do envio.
   * --------------------------------------------------------------- */
  var TRAVA = "orcapro:fotos:trava";
  var TRAVA_MS = 90000;                 // teto de vida da trava
  /* ⚠ teto GENEROSO de propósito, e menor que a trava. Abortar cedo demais não
   * cancela o que o servidor já gravou: ele grava, nós devolvemos o id à fila e
   * a próxima tentativa sobe uma SEGUNDA cópia, comendo a cota do cliente. Com
   * foto de obra em 3G, 30 s estourava com frequência. */
  var ENVIO_MS = 60000;                 // teto do fetch (menor que a trava)
  var EU = Math.random().toString(36).slice(2) + Date.now().toString(36);

  function pegarTrava() {
    try {
      var t = JSON.parse(localStorage.getItem(TRAVA) || "null");
      if (t && t.ate > Date.now() && t.dono !== EU) return false;   // outra aba, ainda válida
      localStorage.setItem(TRAVA, JSON.stringify({ dono: EU, ate: Date.now() + TRAVA_MS }));
      /* relê: se duas abas escreveram no mesmo instante, vale quem ficou
         gravado — sem esta conferência as duas concluiriam que ganharam */
      var c = JSON.parse(localStorage.getItem(TRAVA) || "null");
      return !!(c && c.dono === EU);
    } catch (e) { return true; }        // sem localStorage não há multi-aba a coordenar
  }
  function largarTrava() {
    try {
      var t = JSON.parse(localStorage.getItem(TRAVA) || "null");
      if (!t || t.dono === EU) localStorage.removeItem(TRAVA);
    } catch (e) {}
  }

  Fotos.andarFila = function (aoTerminar) {
    var self = this;
    if (this._subindo) return;
    var fila = lerFila();
    /* Devolve SEMPRE quantas continuam esperando — nunca 0 "porque não tentei".
     * Errei isso na primeira versão: quem chamasse via fila zerada e concluiria
     * que tudo tinha subido, quando na verdade nem houve tentativa. É o mesmo
     * tipo de mentira do "☁ Sincronizado!" que acabei de tirar da nuvem. */
    if (!fila.length) { if (aoTerminar) aoTerminar(0); return; }
    if (!chave() || !srv()) { if (aoTerminar) aoTerminar(fila.length); return; }   // sem licença não sobe
    if (global.navigator && global.navigator.onLine === false) { if (aoTerminar) aoTerminar(fila.length); return; }

    if (!pegarTrava()) { if (aoTerminar) aoTerminar(fila.length); return; }   // outra aba está subindo

    this._subindo = true;
    var id = fila[0];
    var encerrado = false;
    var relogio = null;
    var terminar = function (removerDaFila) {
      if (encerrado) return;            // o timeout e a resposta podem chegar juntos
      encerrado = true;
      if (relogio) { clearTimeout(relogio); relogio = null; }
      var f = lerFila();
      if (removerDaFila) { var i = f.indexOf(id); if (i > -1) f.splice(i, 1); gravarFila(f); }
      else {
        /* falha temporária: manda o id para o FIM da fila. Deixando-o na
           cabeça, uma foto que falha sempre (arquivo corrompido, um id que o
           servidor recusa) bloqueia todas as outras para sempre — a fila anda
           uma por vez e nunca chega na segunda. */
        var j = f.indexOf(id);
        if (j > -1 && f.length > 1) { f.splice(j, 1); f.push(id); gravarFila(f); }
      }
      self._subindo = false;
      largarTrava();
      /* ⚠ FALHA TAMBÉM REAGENDA. Só o caminho de SUCESSO chamava a próxima
       * rodada: uma falha temporária (o normal em 3G de obra) congelava a fila
       * pelo resto da sessão — ela só voltaria a andar no evento "online" ou no
       * próximo boot, e o usuário não via nada. Recuo crescente, com teto de
       * tentativas para não gastar a bateria insistindo no que não vai. */
      if (!f.length) { self._falhas = 0; if (aoTerminar) aoTerminar(0); return; }
      if (removerDaFila) { self._falhas = 0; setTimeout(function () { self.andarFila(aoTerminar); }, 120); return; }
      self._falhas = (self._falhas || 0) + 1;
      if (self._falhas <= 6) setTimeout(function () { self.andarFila(aoTerminar); }, Math.min(60000, 5000 * self._falhas));
      else if (aoTerminar) aoTerminar(f.length);   // desiste desta sessão; volta no "online" ou no boot
    };

    var pega = (typeof Idb !== "undefined" && Idb.disponivel()) ? Idb.get(PREF + id) : Promise.resolve(null);
    pega.then(function (dataURI) {
      if (!dataURI) { terminar(true); return; }   // sumiu do aparelho: não adianta insistir

      /* ⚠ TETO DE TEMPO. Sem isto o fetch fica pendurado enquanto a pilha de
       * rede do SO aguentar — e `_subindo` só volta a false quando a promessa
       * assenta. Um socket preso em 3G ruim (o cenário normal da obra) matava
       * TODO reingresso na fila: o listener de "online" e o disparo do boot
       * batiam no `if (this._subindo) return` e voltavam calados. A fila
       * parava de andar pelo resto da sessão, sem uma linha na tela. */
      var opc = {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-licenca": chave() },
        body: JSON.stringify({ foto: dataURI })
      };
      var ctrl = null;
      try { if (typeof AbortController !== "undefined") { ctrl = new AbortController(); opc.signal = ctrl.signal; } } catch (e) {}
      relogio = setTimeout(function () {
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        terminar(false);                // volta para a fila e libera a trava
      }, ENVIO_MS);

      return fetch(srv() + "/api/foto", opc)
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j, status: r.status }; }); })
        .then(function (r) {
          if (r.ok && r.j && r.j.id) {
            /* ⚠ GUARDAR O PAR ANTES DE AVISAR. A subida começa no instante em
             * que a foto é anexada — com o formulário do diário AINDA ABERTO e
             * o registro ainda fora do Store. Quem só avisasse o `aoSubir`
             * varreria os diários já gravados, não acharia nada, e o id remoto
             * seria perdido para sempre: os bytes no servidor, o registro sem
             * saber onde, e o outro aparelho sem nunca ver a foto — exatamente
             * o problema que este módulo veio resolver.
             * O mapa persiste; quem salvar o diário depois carimba a referência. */
            Fotos.lembrarRemoto(id, r.j.id, r.j.tenant);
            try { if (typeof Fotos.aoSubir === "function") Fotos.aoSubir(id, r.j.id, r.j.tenant); } catch (e) {}
            terminar(true);
          } else if (r.status === 507 || r.status === 403 || r.status === 401) {
            /* espaço esgotado ou licença recusada: insistir não resolve e só
               gasta a bateria do aparelho. Sai da fila e o usuário é avisado. */
            try { if (global.UI && UI.toast) UI.toast("☁ " + ((r.j && r.j.erro) || "Não consegui enviar a foto."), "erro"); } catch (e) {}
            terminar(true);
          } else {
            terminar(false);   // falha temporária: fica na fila para a próxima
          }
        });
    }).catch(function () { terminar(false); });
  };

  /* Religa a fila quando a internet volta — é o momento em que a obra
     costuma "aparecer" de novo, ao sair do canteiro. */
  Fotos.iniciar = function () {
    if (this._iniciado) return;
    this._iniciado = true;
    try {
      if (global.addEventListener) {
        global.addEventListener("online", function () { Fotos.andarFila(); });
      }
    } catch (e) {}
    setTimeout(function () { Fotos.andarFila(); }, 4000);   // e no boot, sem atrapalhar a abertura
    /* ⚠ A MIGRAÇÃO NÃO TINHA CHAMADOR.
     * `migrarRdos` e `pesoDoRegistro` estavam escritas, exportadas e mortas —
     * e elas são justamente o que este módulo veio fazer: tirar o base64 de
     * dentro do registro do cliente cujo documento passou de 1 MiB e cuja
     * sincronização morreu em silêncio, com o app dizendo "Sincronizado".
     * Escrever a função e não chamá-la é pior do que não escrever: fica a
     * impressão de que o problema foi resolvido.
     * Roda depois da fila, uma vez por sessão, e só se houver o que migrar. */
    setTimeout(function () { Fotos.migrarAuto(); }, 12000);
  };

  /* Converte os diários que ainda têm foto embutida. Não recebe o Store por
   * parâmetro porque quem chama é o boot do app (js/app.js, sem argumentos);
   * então descobrimos aqui, com cuidado, e saímos calados se o app não estiver
   * pronto — migração é sempre melhor tarde do que errada. */
  Fotos.migrarAuto = function (aoTerminar) {
    if (this._migrou) { if (aoTerminar) aoTerminar(null); return; }
    var temStore = (typeof Store !== "undefined" && Store.listar && Store.salvar);
    var temAuth = (typeof Auth !== "undefined" && Auth.empresaId);
    if (!temStore || !temAuth) { if (aoTerminar) aoTerminar(null); return; }
    if (typeof Idb === "undefined" || !Idb.disponivel()) { if (aoTerminar) aoTerminar(null); return; }
    this._migrou = true;
    var emp;
    try { emp = Auth.empresaId(); } catch (e) { if (aoTerminar) aoTerminar(null); return; }
    if (!emp) { if (aoTerminar) aoTerminar(null); return; }
    var rdos;
    try { rdos = Store.listar(emp, "rdo") || []; } catch (e) { if (aoTerminar) aoTerminar(null); return; }
    var peso = Fotos.pesoDoRegistro(rdos);
    if (!peso.bytesEmbutidos) { if (aoTerminar) aoTerminar({ diarios: 0, fotos: 0 }); return; }
    /* ⚠ v1.1.236 — GRAVA SÓ O CAMPO QUE A MIGRAÇÃO PRODUZIU.
       A cadeia é sequencial (uma decodificação de imagem + um Idb.set por
       FOTO): com algumas centenas de fotos ela leva minutos, e o `rdos` acima
       é um RETRATO tirado no segundo 12 do boot. Se nesse meio-tempo o usuário
       abrir um daqueles diários e corrigir o efetivo, as atividades e a
       produção do dia, ao alcançá-lo a migração gravava o objeto ANTIGO por
       cima — as correções sumiam sem erro nenhum. E como Store.salvar carimba
       `atualizadoEm` novo, a versão obsoleta virava a mais recente, vencia o
       merge e propagava a perda para o celular do encarregado.
       Relendo o registro na hora de gravar, só `fotos` (o que esta rotina de
       fato mudou) atravessa; o resto é o que estiver salvo agora. */
    var gravar = function (r) {
      try {
        var atual = (r && r.id && Store.obter) ? Store.obter(emp, "rdo", r.id) : null;
        if (atual) { atual.fotos = r.fotos; r = atual; }
        Store.salvar(emp, "rdo", r);
      } catch (e) {}
    };
    Fotos.migrarRdos(rdos, gravar).then(function (res) {
      /* 2ª fase: empurra a fila e só então tira o base64 das que o servidor
         confirmou. Sem isto a 1ª fase seria uma troca de peso por perda — e
         `enxugarMigrados` seria mais uma regra escrita que ninguém chama. */
      return new Promise(function (pronto) {
        Fotos.andarFila(function () { pronto(); });
        setTimeout(pronto, 45000);          // não prende o boot se a rede estiver ruim
      }).then(function () {
        var atuais;
        try { atuais = Store.listar(emp, "rdo") || []; } catch (e) { atuais = []; }
        var enx = Fotos.enxugarMigrados(atuais, gravar);
        try {
          if (global.UI && UI.toast) {
            if (enx.fotos) UI.toast("✓ " + enx.fotos + " foto(s) de diário saíram de dentro do registro — a sincronização volta a caber.", "ok");
            else if (res && res.fotos) UI.toast(res.fotos + " foto(s) de diário estão a caminho da nuvem. Elas continuam guardadas no registro até chegarem — deixe o app aberto com internet.", "ok");
          }
        } catch (e) {}
        if (aoTerminar) aoTerminar({ diarios: res && res.diarios, fotos: res && res.fotos, enxugadas: enx.fotos });
      });
    }).catch(function () { if (aoTerminar) aoTerminar(null); });
  };

  Fotos.pendentes = function () { return lerFila().length; };

  /* ---------------------------------------------------------------
   * SEGUNDA FASE DA MIGRAÇÃO — tirar o base64 de quem JÁ subiu
   *
   * A primeira fase guarda os bytes no aparelho e enfileira, mas mantém o `d`
   * no registro: enquanto a foto não estiver no servidor, aquele base64 é a
   * única cópia que viaja na sincronização. Esta fase roda depois e remove o
   * `d` só das que ganharam endereço remoto — que é quando o peso pode cair
   * sem que ninguém perca nada. Quem não subiu continua pesada e segura, e
   * volta a ser tentada no próximo boot ou quando a internet voltar.
   * --------------------------------------------------------------- */
  Fotos.enxugarMigrados = function (rdos, aoGravar) {
    var n = 0, diarios = 0;
    (rdos || []).forEach(function (r) {
      if (!r || !r.fotos) return;
      var mudou = false;
      var m = lerMapa();
      r.fotos.forEach(function (f) {
        if (!f || !f.d || !f.id) return;
        if (!f.remoto) {                       // ainda não sabe o endereço? tenta o mapa
          var v = m[f.id];
          if (v && v.remoto) { f.remoto = v.remoto; f.tenant = v.tenant; }
        }
        if (f.remoto && f.tenant) { delete f.d; delete f.migrando; mudou = true; n++; }
      });
      if (mudou) { diarios++; if (typeof aoGravar === "function") aoGravar(r); }
    });
    return { diarios: diarios, fotos: n };
  };

  /* ---------------------------------------------------------------
   * MAPA idLocal → {remoto, tenant}
   * A fila é apagada assim que a foto sobe, e era a única memória desse par.
   * Sem este mapa, foto que sobe enquanto o diário está sendo digitado perde
   * o endereço remoto e vira foto que só existe num aparelho.
   * --------------------------------------------------------------- */
  var MAPA = "orcapro:fotos:remotos";
  function lerMapa() {
    try { return JSON.parse(localStorage.getItem(MAPA) || "{}") || {}; } catch (e) { return {}; }
  }
  Fotos.lembrarRemoto = function (idLocal, remoto, tenant) {
    try {
      var m = lerMapa();
      m[idLocal] = { remoto: remoto, tenant: tenant, em: Date.now() };
      /* poda: 400 pares bastam para qualquer sessão real, e sem teto o
         localStorage do cliente cresceria para sempre */
      var ks = Object.keys(m);
      if (ks.length > 400) {
        ks.sort(function (a, b) { return (m[a].em || 0) - (m[b].em || 0); });
        ks.slice(0, ks.length - 400).forEach(function (k) { delete m[k]; });
      }
      localStorage.setItem(MAPA, JSON.stringify(m));
    } catch (e) {}
  };
  /* Carimba as referências que já subiram. Quem salva o diário chama isto
     ANTES de gravar — é o que fecha o ciclo para o diário novo. */
  Fotos.carimbarRemotos = function (refs) {
    var m = lerMapa(), n = 0;
    (refs || []).forEach(function (r) {
      if (!r || !r.id || r.remoto) return;
      var v = m[r.id];
      if (v && v.remoto) { r.remoto = v.remoto; r.tenant = v.tenant; n++; }
    });
    return n;
  };

  Fotos.apagar = function (refs) {
    var lista = [].concat(refs || []);
    var remotos = [];
    lista.forEach(function (r) {
      if (!r) return;
      if (r.id) { try { if (typeof Idb !== "undefined" && Idb.disponivel()) Idb.del(PREF + r.id); } catch (e) {} }
      if (r.remoto) remotos.push(r.remoto);
      var f = lerFila(); var i = f.indexOf(r.id); if (i > -1) { f.splice(i, 1); gravarFila(f); }
    });
    if (!remotos.length || !chave() || !srv()) return Promise.resolve(0);
    return fetch(srv() + "/api/foto/apagar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-licenca": chave() },
      body: JSON.stringify({ ids: remotos })
    }).then(function (r) { return r.json(); }).then(function (j) { return (j && j.apagadas) || 0; })
      .catch(function () { return 0; });
  };

  /* ---------------------------------------------------------------
   * MIGRAÇÃO dos diários que já existem
   *
   * Quem já usa o sistema tem fotos em base64 dentro do registro — e é
   * justamente esse cliente que está com a sincronização travada. Converter é
   * o que destrava. Feito aos poucos e sem apagar nada: a foto só sai do
   * registro DEPOIS de estar guardada no aparelho.
   * --------------------------------------------------------------- */
  Fotos.migrarRdos = function (rdos, aoGravar) {
    var lista = (rdos || []).filter(function (r) {
      return r && (r.fotos || []).some(function (f) { return f && f.d; });
    });
    if (!lista.length) return Promise.resolve({ diarios: 0, fotos: 0 });

    var nF = 0;
    var umDiario = function (r) {
      var antigas = (r.fotos || []).filter(function (f) { return f && f.d; });
      var seq = Promise.resolve();
      var novas = (r.fotos || []).map(function (f) { return f; });
      antigas.forEach(function (f) {
        seq = seq.then(function () {
          return Fotos.guardar(f.d, f.leg || "").then(function (ref) {
            var i = novas.indexOf(f);
            if (i < 0 || ref.semIDB) return;
            /* ⚠ O BASE64 FICA ATÉ A FOTO ESTAR NO SERVIDOR.
             * Trocar a foto embutida pela referência na hora tirava os bytes do
             * registro SINCRONIZADO e os deixava só no IndexedDB deste
             * navegador. Se a subida nunca acontecesse — sem licença, sem
             * internet, servidor fora — a foto passava a existir num único
             * aparelho, e bastava limpar os dados do navegador para sumir de
             * vez. Os outros aparelhos veriam uma referência para bytes que não
             * existem em lugar nenhum. A migração existe para destravar a
             * sincronização, não para trocar peso por perda: o `d` só sai
             * depois que o servidor confirmou (Fotos.enxugarMigrados). */
            novas[i] = { id: ref.id, leg: ref.leg, bytes: ref.bytes, remoto: "", w: ref.w, h: ref.h, d: f.d, migrando: true };
            nF++;
          });
        });
      });
      return seq.then(function () {
        r.fotos = novas;
        if (typeof aoGravar === "function") aoGravar(r);
      });
    };

    var cadeia = Promise.resolve();
    lista.forEach(function (r) { cadeia = cadeia.then(function () { return umDiario(r); }); });
    return cadeia.then(function () { return { diarios: lista.length, fotos: nF }; });
  };

  /* Quanto o registro pesaria hoje — usado pela tela para avisar ANTES de o
     documento estourar, em vez de deixar a sincronização morrer calada. */
  Fotos.pesoDoRegistro = function (rdos) {
    var b = 0;
    (rdos || []).forEach(function (r) {
      (r.fotos || []).forEach(function (f) { if (f && f.d) b += f.d.length; });
    });
    return { bytesEmbutidos: b, perigoso: b > 700 * 1024 };   // 700 KB do teto de 1 MiB
  };

  if (typeof window !== "undefined") window.Fotos = Fotos;
  if (typeof module !== "undefined" && module.exports) module.exports = Fotos;
})(typeof window !== "undefined" ? window : globalThis);
