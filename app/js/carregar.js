/* =====================================================================
 * carregar.js — CARREGAMENTO SOB DEMANDA dos grupos de scripts.
 *
 * POR QUE ISTO EXISTE (10/10/2026). O app abria baixando TUDO: 339 arquivos,
 * 8,0 MB transferidos e 25 MB de script descompactado no primeiro acesso, ~12 s
 * num celular 4G — e mais de um terço disso era o BIM/modelador (motores,
 * fitas, famílias, içamento, three.js, web-ifc), que a maioria abre raramente
 * e quem só orça nunca abre. Medido com o celular simulado (4G 9 Mbps, 150 ms,
 * CPU 4×) na 1.2.130.
 *
 * COMO FUNCIONA. No index.html, os <script> de um grupo ficam DENTRO de
 *   <template data-grupo="bim"> … </template>
 * Script dentro de <template> é inerte: o navegador não baixa nem executa. O
 * texto continua no index.html, na MESMA posição e na MESMA ordem — quem lê o
 * index (testes, sw.js, pacote) acha cada arquivo onde sempre esteve.
 * `Carregar.grupo("bim")` lê esses blocos em ordem, injeta os scripts
 * clássicos com `async = false` (baixam em paralelo e EXECUTAM na ordem em que
 * entraram — a ordem do index.html) e, depois deles, os módulos ES (js/bim.js),
 * que no index.html sempre rodaram depois de todos os clássicos. Devolve uma
 * Promise; a segunda chamada devolve a mesma (a segunda entrada é instantânea).
 *
 * ⚠ O GRUPO INTEIRO CARREGA ANTES DA TELA. Os módulos do BIM se registram no
 *   load (fita, disciplinas, ganchos) e o js/gestao.js monta a tela do BIM
 *   contando com todos eles — por isso a tela do BIM só é desenhada depois do
 *   `grupo()` resolver (Gestao.render / afterRender perguntam `faltaPara`).
 *   Carregar arquivo a arquivo conforme o uso trocaria a ordem do index.html,
 *   que é contrato.
 *
 * ⚠ ARQUIVO QUE FALHOU NÃO TRAVA O RESTO, IGUAL AO <script> DO INDEX: um 404
 *   no meio do grupo não impede os outros de rodar; o grupo fica marcado com
 *   erro e a tela diz QUAL arquivo faltou, com [Tentar de novo]. A nova
 *   tentativa injeta só o que ainda não carregou — reinjetar o que já rodou
 *   registraria a fita duas vezes.
 *
 * Na PUBLICAÇÃO (tools/construir-pacotes-js.js) o index.html é o mesmo, mas o
 * núcleo concatenado declara `Carregar.pacotes`, e o grupo vem do pacote dele
 * (js/pacotes/bim.js) no lugar dos 140 arquivos.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* tela -> grupo que ela precisa. Só o BIM hoje; tela nova com grupo próprio
     entra aqui e no index.html (um <template data-grupo="..."> com os scripts). */
  var TELAS = { bim: "bim" };
  var NOMES = { bim: "o BIM" };

  var estado = {};        // grupo -> { promessa, pronto, erro, total, feitos, ms }
  var carregados = {};    // src -> true (já rodou: nunca reinjetar)
  var falhouModulo = {};  // src -> nº de tentativas que falharam (módulo ES)

  function doc() { return global.document; }

  /* Os scripts do grupo, na ordem do documento: [{src, modulo}].
     ⚠ NA PUBLICAÇÃO o fim do js/pacotes/nucleo-2.js declara `Carregar.pacotes`
     ({ bim: [{src:"js/pacotes/bim.js?v=…"}, {src:"js/bim-pacote.js?v=…", modulo:true}] }):
     o grupo vem do pacote concatenado, e o <template> (que é o mesmo index.html
     do desenvolvimento, arquivo a arquivo) fica só como referência. */
  function itens(nome) {
    var d = doc(), out = [];
    var pac = Carregar.pacotes && Carregar.pacotes[nome];
    if (pac && pac.length) return pac.map(function (x) { return { src: String(x.src), modulo: !!x.modulo }; });
    if (!d || !d.querySelectorAll) return out;
    var ts = d.querySelectorAll('template[data-grupo="' + nome + '"]');
    for (var i = 0; i < ts.length; i++) {
      var raiz = ts[i].content || ts[i];
      var ss = raiz.querySelectorAll ? raiz.querySelectorAll("script[src]") : [];
      for (var j = 0; j < ss.length; j++) {
        out.push({ src: ss[j].getAttribute("src"), modulo: String(ss[j].getAttribute("type") || "").toLowerCase() === "module" });
      }
    }
    return out;
  }

  function injetar(item) {
    return new Promise(function (ok, falha) {
      var d = doc(), s = d.createElement("script");
      if (item.modulo) s.type = "module";
      /* ⚠ async = false: sem isto o navegador executa cada injetado assim que
         chega, fora de ordem — e um motor que roda antes do arquivo de que
         depende quebra no load, de um jeito que muda a cada abertura */
      else s.async = false;
      s.onload = function () { carregados[item.src] = true; ok(item.src); };
      s.onerror = function () { if (item.modulo) falhouModulo[item.src] = (falhouModulo[item.src] || 0) + 1; falha(new Error(item.src)); };
      /* ⚠ MÓDULO QUE FALHOU NÃO SE PEDE DE NOVO PELO MESMO ENDEREÇO: o
         navegador guarda a falha no mapa de módulos da página e responde a
         mesma falha para sempre, sem ir à rede (medido: [Tentar de novo] com a
         rede de volta continuava "Faltou baixar: js/bim.js"). Endereço novo =
         busca nova; o import relativo de dentro dele continua valendo. */
      var n = item.modulo ? (falhouModulo[item.src] || 0) : 0;
      s.src = n ? item.src + (item.src.indexOf("?") > -1 ? "&" : "?") + "tentativa=" + n : item.src;
      (d.head || d.body || d.documentElement).appendChild(s);
    });
  }

  /* módulo ES: pede antes (modulepreload) para o three.js e o web-ifc
     baixarem junto com os clássicos, e não só depois deles */
  function preCarregarModulo(src) {
    try {
      var d = doc(), l = d.createElement("link");
      l.rel = "modulepreload"; l.href = src;
      (d.head || d.documentElement).appendChild(l);
    } catch (e) {}
  }

  function avisarProgresso(nome) {
    var st = estado[nome], d = doc();
    if (!st || !d || !d.getElementById) return;
    var el = d.getElementById("carregar-prog-" + nome);
    if (el) { el.max = st.total || 1; el.value = st.feitos || 0; }
  }

  var Carregar = {
    TELAS: TELAS,
    /* preenchido pelo pacote da publicação (ver `itens`); vazio no desenvolvimento */
    pacotes: null,

    /* o index.html tem blocos deste grupo? (sem bloco = nada a esperar: tudo
       já veio no carregamento normal da página) */
    temGrupo: function (nome) { return itens(nome).length > 0; },

    /* o grupo já rodou por inteiro — o que a tela pergunta antes de se desenhar */
    pronto: function (nome) {
      if (estado[nome] && estado[nome].pronto) return true;
      return !this.temGrupo(nome);
    },

    /* a tela `view` ainda não pode ser desenhada: o grupo dela falta */
    faltaPara: function (view) {
      var g = TELAS[String(view || "")];
      return !!g && !this.pronto(g);
    },

    /* Carrega o grupo. Promise que resolve com { ms, arquivos } — a mesma
       promessa para quem pedir de novo enquanto carrega ou depois. */
    grupo: function (nome) {
      var st = estado[nome];
      if (st && st.promessa && !st.erro) return st.promessa;
      var lista = itens(nome);
      st = estado[nome] = { promessa: null, pronto: false, erro: null, total: lista.length, feitos: 0, ms: 0 };
      if (!lista.length) { st.pronto = true; st.promessa = Promise.resolve({ ms: 0, arquivos: 0 }); return st.promessa; }
      var t0 = Date.now();
      var classicos = lista.filter(function (x) { return !x.modulo; });
      var modulos = lista.filter(function (x) { return x.modulo; });
      st.feitos = lista.filter(function (x) { return carregados[x.src]; }).length;
      modulos.forEach(function (m) { if (!carregados[m.src]) preCarregarModulo(m.src); });
      var falhas = [];
      /* ⚠ NUNCA ANTES DO NÚCLEO TERMINAR. Pedido durante o parse (o carregar.js
         é dos primeiros do núcleo), um script injetado pode rodar ANTES dos
         <script> do núcleo que ainda faltam — e o BIM sempre rodou depois de
         todos eles. Então, com o documento ainda "loading", a injeção espera o
         DOMContentLoaded. */
      var d0 = doc();
      var aposNucleo = (d0 && d0.readyState === "loading" && d0.addEventListener)
        ? new Promise(function (ok) { d0.addEventListener("DOMContentLoaded", function () { ok(); }); })
        : Promise.resolve();
      function um(item) {
        if (carregados[item.src]) return Promise.resolve();
        return injetar(item).then(function () { st.feitos++; avisarProgresso(nome); },
          function (e) { falhas.push(e.message); });
      }
      /* todos os clássicos de uma vez (ordem garantida pelo async=false); os
         módulos só depois que o último clássico rodou */
      st.promessa = aposNucleo
        .then(function () { return Promise.all(classicos.map(um)); })
        .then(function () { return Promise.all(modulos.map(um)); })
        .then(function () {
          st.ms = Date.now() - t0;
          if (falhas.length) {
            st.erro = falhas;
            throw new Error("Não carregou: " + falhas.join(", "));
          }
          st.pronto = true;
          return { ms: st.ms, arquivos: lista.length };
        });
      return st.promessa;
    },

    /* estado para diagnóstico (Painel de saúde, e2e) */
    info: function (nome) {
      var st = estado[nome] || {};
      return { pronto: this.pronto(nome), total: st.total || itens(nome).length, feitos: st.feitos || 0, ms: st.ms || 0, erro: st.erro ? st.erro.slice() : null };
    },

    /* A tela de espera: devolve o HTML e dispara o carregamento. Quando o grupo
       chega, redesenha SE a pessoa ainda estiver na mesma tela (quem já foi para
       outro módulo não é puxado de volta). */
    telaEsperando: function (view) {
      var nome = TELAS[view], self = this, st = estado[nome];
      var falhou = st && st.erro;
      if (!falhou && !(st && st.agendado)) {
        if (!st) { this.grupo(nome); st = estado[nome]; }
        st.agendado = true;
        st.promessa.then(function () {
          st.agendado = false;
          self._redesenhar(view);
        }, function () {
          st.agendado = false;
          self._redesenhar(view);
        });
      }
      var rotulo = NOMES[nome] || nome;
      if (falhou) {
        return '<div class="card carregar-grupo" data-carregar-view="' + esc(view) + '" role="alert" style="max-width:560px;margin:40px auto;text-align:center;padding:28px">'
          + '<p style="font-size:15px;margin:0 0 6px"><b>Não foi possível abrir ' + esc(rotulo) + '.</b></p>'
          + '<p class="muted" style="margin:0 0 4px">Faltou baixar: <code>' + esc(st.erro.join(", ")) + '</code>.</p>'
          + '<p class="muted" style="margin:0 0 16px">Confira a conexão (ou se o OrçaPRO está aberto no computador) e tente de novo.</p>'
          + '<button class="btn primary" type="button" data-carregar-repetir="' + esc(view) + '">Tentar de novo</button> '
          + '<button class="btn ghost" type="button" data-view="dashboard">Ir para o Painel</button></div>';
      }
      var feitos = (st && st.feitos) || 0, total = (st && st.total) || 1;
      return '<div class="card carregar-grupo" data-carregar-view="' + esc(view) + '" role="status" aria-live="polite" style="max-width:420px;margin:40px auto;text-align:center;padding:28px">'
        + '<p style="font-size:15px;margin:0 0 10px"><b>Abrindo ' + esc(rotulo) + '…</b></p>'
        + '<progress id="carregar-prog-' + esc(nome) + '" max="' + total + '" value="' + feitos + '" style="width:100%"></progress>'
        + '<p class="muted" style="margin:10px 0 0;font-size:12.5px">Na primeira vez da sessão o módulo é baixado; depois abre na hora.</p></div>';
    },

    /* ⚠ QUEM DECIDE É A TELA, NÃO O App.view: na licença só do Modela a casa
       é o BIM sem que o App.view seja gravado (o render deriva "bim" de um
       App.view vazio) — perguntar `App.view === "bim"` deixava a pessoa na
       tela de espera para sempre (medido na e2e-modela-so-bim). A espera
       ainda na tela = a pessoa ainda está aqui; saiu dela = não puxa de volta. */
    _redesenhar: function (view) {
      var App = global.App, d = doc();
      try {
        var naTela = d && d.querySelector && d.querySelector('[data-carregar-view="' + view + '"]');
        if (App && naTela && App.tela !== "login" && App.render) App.render();
      } catch (e) { try { console.error("[carregar] redesenho de " + view + ":", e); } catch (e2) {} }
    },

    /* [Tentar de novo] da tela de erro */
    repetir: function (view) {
      var nome = TELAS[view];
      if (estado[nome]) { estado[nome].erro = null; estado[nome].promessa = null; estado[nome].agendado = false; }
      this.grupo(nome);
      this._redesenhar(view);
    },

    /* Para quem abre algo do grupo FORA da tela (visor do link, placa da obra):
       uma faixa de espera por cima de tudo, que some quando o grupo chega. */
    comEspera: function (nome, texto) {
      var d = doc(), ov = null;
      if (!this.pronto(nome) && d && d.body) {
        ov = d.createElement("div");
        ov.id = "carregar-espera";
        ov.setAttribute("role", "status");
        ov.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;"
          + "background:#0b1a2b;color:#dbe8f5;font-family:Inter,system-ui,sans-serif;font-size:15px;padding:24px;text-align:center";
        ov.textContent = texto || "Carregando…";
        d.body.appendChild(ov);
      }
      return this.grupo(nome).then(function (r) {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        return r;
      }, function (e) {
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        throw e;
      });
    },

    _ligarCliques: function () {
      var d = doc(), self = this;
      if (!d || !d.addEventListener || this._ligado) return;
      this._ligado = true;
      d.addEventListener("click", function (ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-carregar-repetir]") : null;
        if (t) { ev.preventDefault(); self.repetir(t.getAttribute("data-carregar-repetir")); }
      });
    },

    /* só para os testes de Node */
    _zerar: function () { estado = {}; carregados = {}; falhouModulo = {}; }
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  Carregar._ligarCliques();
  global.Carregar = Carregar;
  if (typeof module !== "undefined" && module.exports) module.exports = Carregar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
