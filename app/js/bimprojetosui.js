/* =====================================================================
 * bimprojetosui.js — PROJETOS BIM na tela (12/10/2026): a TELA INICIAL do
 * BIM, o projeto aberto (nome e obra na barra de título), salvar, abrir,
 * os recentes e a pergunta ao sair. O motor puro é o js/bimprojetos.js; o
 * arquivo é o .opbim de sempre (js/opformato.js, montado pelo
 * Gestao._opbimMontar e aplicado pelo Gestao._opbimAplicar).
 *
 * ⚠ O DEFEITO QUE ABRIU ESTE ARQUIVO (pedido do Rogério, 12/10/2026: "sempre
 *   que eu abrir o BIM eu não quero que ele já abra com a obra, com alguma
 *   volumetria lá dentro [...] porque está dando um erro aqui"). Reproduzido
 *   na base dele (backup de 11/10, perfil descartável) e num caso montado:
 *   1. a tela do BIM ESCOLHIA SOZINHA a primeira obra com orçamento e reabria
 *      do banco do aparelho TODOS os IFC registrados nela (na base dele: 4
 *      modelos de uma vez, duas revisões do mesmo projeto completo); o que não
 *      estava guardado virava "Falta o arquivo de: …" a cada abertura, e a
 *      reabertura não era presa à obra — o recado da obra A aparecia com a
 *      obra B na tela;
 *   2. pior, e calado: o visualizador vive a sessão inteira. Entrando no BIM
 *      com OUTRA obra no alto (a escolhida sozinha depois de excluir uma obra,
 *      ou a que outra tela pôs ali), a casca recarregava as famílias, o editor
 *      reconstruía a cena e AVISAVA uma edição — com as paredes da obra
 *      anterior — e o Gestao._bimAoEditar carimbava a obra NOVA nelas. A
 *      gravação que vinha logo depois SUBSTITUÍA a modelagem da obra nova pela
 *      da anterior. Medido: obra com 0 e obra com 1 parede acabaram, as duas,
 *      com as 2 paredes da obra visitada antes.
 *   A correção mora em três lugares: o Gestao._bimAoEditar grava na obra DONA
 *   da cena (Gestao._bimCenaObra), não na que está no alto; a montagem
 *   descarrega a cena que é de outra obra antes de qualquer gravação
 *   (`antesDoReplay`); e o BIM abre na tela inicial — nada carrega sozinho,
 *   os IFC guardados abrem SOB PEDIDO.
 *
 * O PROJETO. Tem nome de arquivo ("Projeto <nome> — <obra>") e obra. A obra
 * continua sendo a área de trabalho do BIM (níveis, modelagem, vistas 2D,
 * modelos registrados): o projeto aberto É o que está na área de trabalho da
 * obra dele; salvar fotografa isso num .opbim que vai para
 *   • o sistema: o banco do aparelho (IndexedDB) — reabre rápido, sem rede;
 *   • o computador: Documentos\OrçaPRO\Projetos BIM\<obra>\<nome>.opbim, pelo
 *     servidor local (server/static.js, /__projetos/*); na versão online, que
 *     não tem servidor local, o .opbim é BAIXADO.
 * "Não salvar" ao sair devolve a obra ao que estava na última gravação (ou ao
 * que era antes do projeto novo) — a área de trabalho da obra não fica com
 * meia alteração que o arquivo não tem.
 *
 * ⚠ NADA SE PERDE SEM VOLTA (regra da RA; revisão de 12/10/2026). Novo
 * projeto numa obra — ou abrir um projeto nela — SUBSTITUI a modelagem dela.
 * Quando essa modelagem não está em projeto nenhum, ela vira ANTES o projeto
 * "Modelagem anterior — <obra> — <data hora>" (`guardarAnterior`), pelo mesmo
 * caminho do Salvar; se a cópia falha, nada é substituído.
 * ===================================================================== */
(function (global) {
  "use strict";

  function G() { return global.Gestao || null; }
  function B() { return global.BIM || null; }
  function P() { return global.BimProjetos; }
  function emp() { try { return global.Auth ? global.Auth.empresaId() : ""; } catch (e) { return ""; } }
  function esc(s) { return (global.Util && global.Util.esc) ? global.Util.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function toast(m, t, ms) { try { global.UI.toast(m, t, ms); } catch (e) {} }
  function quando(iso) { try { return iso ? global.Util.fmtData(iso) : "—"; } catch (e) { return String(iso || "—"); } }
  function ico(n, s) { try { return global.Icones ? global.Icones.get(n, s || 16) : ""; } catch (e) { return ""; } }
  function agora() { return new Date().toISOString(); }
  function uid() { try { return global.Util.uid("bpj"); } catch (e) { return "bpj_" + Date.now().toString(36); } }
  function obraNome(id) { try { var o = global.Store.obter(emp(), "obras", id); return (o && (o.nome || o.titulo)) || ""; } catch (e) { return ""; } }
  function obrasVisiveis() {
    try { var g = G(); return ((g && g.ui && g.ui.lista) ? g.ui.lista("obras") : global.Store.listar(emp(), "obras")) || []; } catch (e) { return []; }
  }
  function camposNivel(n) {
    return { id: n.id, obraId: n.obraId == null ? null : n.obraId, nome: n.nome, elevacao: n.elevacao,
             corte: n.corte == null ? null : n.corte, peDireitoDeclarado: n.peDireitoDeclarado == null ? null : n.peDireitoDeclarado };
  }
  function porId(a, b) { var x = String(a.id), y = String(b.id); return x < y ? -1 : (x > y ? 1 : 0); }
  /* o estado das vistas 2D da obra, igual de onde quer que venha (memória ou disco) */
  function d2DaObra(obraId) {
    var e = null, id = String(obraId || "geral");
    try { var B2 = global.Bim2D; if (B2 && B2._cfg && B2._cfg.obraKey === id && B2._est) e = B2._est; } catch (x) {}
    if (!e) { try { e = JSON.parse(global.localStorage.getItem("orcapro:bim:desenho2d:" + id) || "null"); } catch (x2) { e = null; } }
    if (!e || typeof e !== "object") e = {};
    var c = JSON.parse(JSON.stringify(e));
    if (!Array.isArray(c.cortes)) c.cortes = [];
    if (!c.estilos || typeof c.estilos !== "object") c.estilos = {};
    if (!c.plantas || typeof c.plantas !== "object") c.plantas = {};
    return c;
  }

  var BimProjetosUI = {
    _proj: null,          /* o projeto aberto (ver `_abrirEstado`) */
    _inicio: null,        /* a tela inicial (div dentro do palco) */
    _ix: null,            /* o índice deste aparelho, em memória */
    _filaIx: null,
    _srvP: null,          /* o servidor local responde? (só na instalação) */
    _obraModelos: "",     /* a obra escolhida em "Modelos IFC salvos na obra" */

    /* =============================================================== ESTADO */
    aberto: function () { return !!this._proj; },
    atual: function () {
      var p = this._proj;
      return p ? { id: p.id, nome: p.nome, obraId: p.obraId, obraNome: p.obraNome, salvoEm: p.salvoEm || "", sujo: this.sujo() } : null;
    },
    /* o que está na tela do projeto aberto, reduzido a uma assinatura */
    assinaturaAtual: function () {
      var g = G(), b = B(), p = this._proj, ops = [], niv = [], mods = [];
      try { ops = (b && b.editarOps) ? b.editarOps() : []; } catch (e) {}
      try { niv = g._nivLer().map(camposNivel).sort(porId); } catch (e2) {}
      try { mods = ((b && b.modelos) || []).filter(function (m) { return m && !m.sintetico; }).map(function (m) { return String(m.nome); }).sort(); } catch (e3) {}
      return P().assinatura({ ops: ops, niveis: niv, d2: P().podarVazios(d2DaObra(p ? p.obraId : (g && g._bimSel) || "geral")), modelos: mods });
    },
    /* nunca gravado = sujo (o arquivo não existe); senão, mudou desde a gravação? */
    sujo: function () {
      var p = this._proj;
      if (!p) return false;
      if (!p.salvoEm || !p.base) return true;
      try { return this.assinaturaAtual() !== p.base; } catch (e) { return true; }
    },

    /* a área de trabalho de uma obra, como está gravada (para comparar e para
       devolver no "Não salvar") */
    fotoObra: function (obraId) {
      var e = emp(), id = String(obraId || "geral"), ed = null, niv = [];
      try { ed = global.Store.obter(e, "bim_edicoes", id); } catch (x) {}
      try { niv = (global.Store.listar(e, "bim_niveis") || []).filter(function (n) { return n && (n.obraId || "geral") === id; }); } catch (x2) {}
      return JSON.parse(JSON.stringify({ ops: (ed && ed.ops) || [], niveis: niv.map(camposNivel).sort(porId), d2: d2DaObra(id) }));
    },
    /* a MODELAGEM da obra (operações e níveis) — o que se perderia ao substituir
       a área de trabalho, e o que a pergunta cita com números */
    assinaturaObra: function (obraId) { var f = this.fotoObra(obraId); return P().assinatura({ ops: f.ops, niveis: f.niveis }); },
    restaurarObra: function (obraId, foto) {
      if (!foto) return false;
      var e = emp(), id = String(obraId || "geral");
      try { global.Store.salvar(e, "bim_edicoes", { id: id, ops: foto.ops || [] }); } catch (x) {}
      try {
        var atuais = (global.Store.listar(e, "bim_niveis") || []).filter(function (n) { return n && (n.obraId || "geral") === id; }).map(function (n) { return n.id; });
        if (atuais.length && global.Store.excluirVarios) global.Store.excluirVarios(e, "bim_niveis", atuais);
        (foto.niveis || []).forEach(function (n) { global.Store.salvar(e, "bim_niveis", n); });
      } catch (x2) {}
      try { global.localStorage.setItem("orcapro:bim:desenho2d:" + id, JSON.stringify(foto.d2 || {})); } catch (x3) {}
      try { var B2 = global.Bim2D; if (B2 && B2._cfg && B2._cfg.obraKey === id) { B2._est = null; B2._cache = {}; } } catch (x4) {}
      return true;
    },
    /* antes de SUBSTITUIR a modelagem de uma obra: ela está guardada num projeto? */
    conferirObra: function (obraId) {
      var f = this.fotoObra(obraId), ix = this._ix || P().indiceNormal(null);
      var tem = (f.ops || []).length > 0 || (f.niveis || []).length > 0;
      return { tem: tem, salva: !tem || ix.obras[String(obraId)] === P().assinatura({ ops: f.ops, niveis: f.niveis }), nOps: (f.ops || []).length, nNiveis: (f.niveis || []).length };
    },
    /* a pergunta antes de substituir — com o nome da cópia que vai ser feita e
       onde ela fica: o que a pessoa lê aqui é o que vai acontecer */
    _textoSubstituir: function (obraId, conf, oQue, nomeAnt) {
      var t = "A obra “" + (obraNome(obraId) || obraId) + "” já tem modelagem no BIM que não está salva em nenhum projeto: " +
        conf.nOps + " operação(ões) de modelagem e " + conf.nNiveis + " nível(is).\n\n" + oQue + " SUBSTITUI essa modelagem na obra.";
      if (!nomeAnt) return t + " Continuar?";
      return t + " Antes, ela será guardada como o projeto “" + nomeAnt + "”, " + this._ondeFica(obraId) +
        " — e aparece em Projetos recentes, na tela inicial do BIM.\n\nContinuar?";
    },
    /* onde um projeto desta obra fica guardado (para dizer na tela) */
    _ondeFica: function (obraId) {
      var s = this._srvRes, sub = P().nomeArquivo(obraNome(obraId));
      if (s && s.pasta) return "no sistema e no computador, na pasta " + s.pasta + (sub ? (String(s.pasta).indexOf("\\") >= 0 ? "\\" : "/") + sub : "");
      if (s === null) return "no sistema (e baixado como arquivo .opbim, na pasta Downloads)";
      return "no sistema e no computador";
    },
    /* o nome da cópia automática desta obra, agora (livre no índice) */
    nomeAnterior: function (obraId) {
      var id = String(obraId || "geral");
      return P().nomeLivre(this._ix, P().nomeAnterior(obraNome(id) || (id === "geral" ? "" : id), new Date()), id);
    },
    /* ⚠ NADA SE PERDE SEM VOLTA (regra da RA — revisão de 12/10/2026). Antes de
       SUBSTITUIR a modelagem de uma obra que não está em projeto nenhum (Novo
       projeto nela, Gestao._npCriar; abrir um projeto nela, `_aplicarJa`), o que
       está GRAVADO na obra — operações, níveis, vistas 2D e as famílias que as
       operações usam — vira o projeto "Modelagem anterior — <obra> — <data
       hora>" pelo MESMO caminho do Salvar (`_gravarProjeto`): sistema,
       computador e recentes. Vem do que está gravado, não da cena: na tela
       inicial a cena está vazia e a modelagem da obra só existe no disco.
       Devolve { ok, id, nome }; sem `ok`, quem chama NÃO substitui (o recado de
       erro sai daqui, com o motivo). A cópia só vale se os recentes a alcançam:
       no sistema, ou no arquivo da pasta do computador — o download da versão
       online sozinho não conta (ninguém garante que ele chegou). */
    guardarAnterior: function (obraId, nome) {
      var self = this, g = G(), id = String(obraId || "geral"), nObra = obraNome(id) || "";
      var falhou = function (motivo) {
        toast("Não guardei a modelagem que está na obra “" + (nObra || id) + "”: " + motivo + ". Por isso NADA foi substituído — ela continua na obra como estava.", "erro", 12000);
        return { ok: false, motivo: motivo };
      };
      if (!g || !g._opbimMontar || !global.OpFormato || !global.BimBcf) return Promise.resolve(falhou("o formato .opbim não carregou"));
      try { g._bimEdFlush(); } catch (e0) {}
      var foto = this.fotoObra(id), m;
      var p = { id: uid(), nome: String(nome || this.nomeAnterior(id)), obraId: id, obraNome: nObra, criadoEm: agora() };
      try { m = g._opbimMontar({ obraId: id, ops: foto.ops, niveis: foto.niveis, d2: foto.d2 }); }
      catch (e1) { return Promise.resolve(falhou("não consegui montar o arquivo (" + (e1 && e1.message || e1) + ")")); }
      return this._gravarProjeto(p, m, { automatico: true, assinaturaObra: P().assinatura({ ops: foto.ops, niveis: foto.niveis }) }).then(function (r) {
        var sis = r.sistema || {}, pc = r.computador || {};
        if (!r.ok) return falhou(r.montar ? r.motivo : "no sistema, " + (sis.motivo || "falhou") + "; no computador, " + (pc.motivo || (pc.baixado ? "só baixei o arquivo, e o download não dá para conferir" : "falhou")));
        var onde = [];
        if (sis.ok) onde.push("no sistema");
        if (pc.ok && pc.arquivo) onde.push("no computador (" + (pc.caminho || pc.arquivo) + ")");
        if (pc.baixado) onde.push("baixado como .opbim (pasta Downloads)");
        toast("A modelagem que estava na obra “" + (nObra || id) + "” foi guardada como o projeto “" + p.nome + "”, " + onde.join(" e ") + ". Ela está em Projetos recentes.", "ok", 9000);
        try { if (self.inicioVisivel()) self._pintarInicio(); } catch (eP) {}
        return { ok: true, id: p.id, nome: p.nome };
      }, function (e) { return falhou(String(e && e.message || e)); });
    },

    /* ========================================================= ÍNDICE */
    /* ⚠ A LEITURA ESPERA AS GRAVAÇÕES DA FILA. Lida por fora dela, uma leitura
       que começou antes de uma gravação podia terminar DEPOIS e pôr de volta na
       memória o índice antigo — medido na e2e (12/10/2026): depois do "Não
       salvar", o "Abrir projeto do sistema" achou a obra "com modelagem fora de
       projeto" e perguntou se podia substituir o que era o próprio projeto. */
    _lerIndice: function () {
      var self = this;
      /* NA fila, não só depois dela: duas que saíssem do mesmo ponto (uma
         leitura e uma gravação) ainda correriam juntas */
      this._filaIx = (this._filaIx || Promise.resolve()).then(function () { return self._lerIndiceJa(); }, function () { return self._lerIndiceJa(); });
      return this._filaIx;
    },
    _lerIndiceJa: function () {
      var self = this, e = emp();
      if (!global.Idb) { self._ix = P().indiceNormal(self._ix); return Promise.resolve(self._ix); }
      return global.Idb.get(P().chaveIndice(e)).then(function (v) { self._ix = P().indiceNormal(v || self._ix); return self._ix; },
        function () { self._ix = P().indiceNormal(self._ix); return self._ix; });
    },
    /* leitura-alteração-gravação em FILA: duas gravações seguidas (salvar e
       abrir na mesma hora) liam o índice no mesmo estado e uma apagava a outra */
    _mexerIndice: function (fn) {
      var self = this, e = emp();
      this._filaIx = (this._filaIx || Promise.resolve()).then(function () {
        return self._lerIndiceJa().then(function (ix) {
          self._ix = P().indiceNormal(fn(ix) || ix);
          if (!global.Idb) return self._ix;
          return global.Idb.set(P().chaveIndice(e), self._ix).then(function () { return self._ix; }, function () { return self._ix; });
        });
      })["catch"](function () { return self._ix; });
      return this._filaIx;
    },
    _guardarNoSistema: function (id, bytes, info) {
      if (!global.Idb) return Promise.resolve({ ok: false, motivo: "este navegador não tem o banco do aparelho" });
      return global.Idb.pronto().then(function (pronto) {
        if (!pronto) return { ok: false, motivo: "o navegador não deixou guardar neste perfil (janela anônima?)" };
        return global.Idb.set(P().chaveIdb(emp(), id), { bytes: bytes, nome: info.nome, obraId: info.obraId, salvoEm: info.salvoEm || agora() })
          .then(function () { return { ok: true }; }, function () { return { ok: false, motivo: "o banco do aparelho recusou (armazenamento cheio?)" }; });
      }, function () { return { ok: false, motivo: "o banco do aparelho não abriu" }; });
    },
    /* o servidor local (instalação de computador) responde? Na versão online não há */
    _servidor: function () {
      var self = this;
      if (this._srvP) return this._srvP;
      /* ⚠ SÓ PERGUNTA QUANDO O APP VEM DO SERVIDOR DESTA MÁQUINA. Na versão
         online (e no tablet que abre pelo IP do computador, que o servidor
         recusa) a pergunta virava um 404/403 vermelho no console a cada
         abertura do BIM — barulho que já escondeu defeito de verdade aqui
         (ver o /__device no server/static.js). */
      var h = "";
      try { h = String(global.location && global.location.hostname || "").toLowerCase(); } catch (eH) {}
      if (h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]" && h !== "::1") { this._srvRes = null; this._srvP = Promise.resolve(null); return this._srvP; }
      this._srvP = (typeof fetch === "function" ? fetch("/__projetos/status", { cache: "no-store" }) : Promise.reject(new Error("sem fetch")))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return (j && j.ok && j.pasta) ? j : null; })["catch"](function () { return null; })
        .then(function (s) { self._srvRes = s; return s; });   /* guardado: a tela pinta sem esperar */
      return this._srvP;
    },

    /* ================================================ A CENA DO VISUALIZADOR */
    /* tira da cena TUDO o que é da obra anterior — sem gravar nada: o pendente
       sai antes para a obra DONA dele, e o que se apaga da tela não é edição */
    descarregarCena: function () {
      var g = G(), b = B();
      if (!g) return;
      try { g._bimEdFlush(); } catch (e0) {}
      g._bimCenaMuda = true;
      try {
        if (b) {
          try { if (b.editar) b.editar(false); } catch (e1) {}
          ((b.modelos || []).slice()).forEach(function (m) { if (m && m.mid !== "edit") { try { b.removerModelo(m.mid); } catch (e2) {} } });
          try { if (b.editarAplicar) b.editarAplicar([]); } catch (e3) {}
        }
      } finally { g._bimCenaMuda = false; }
      try { clearTimeout(g._bimEdSaveT); } catch (e4) {}
      g._bimEdPend = null;
      g._bimCenaObra = null;
      g._bimElementos = []; g._bimSelecao = null;
      try { g._bimCascaContexto(); } catch (e5) {}
    },
    /* quem começa a trabalhar sem projeto (um comando da fita, um modelo que
       chegou) entra na área de trabalho da obra do alto — a de sempre. ⚠ A
       modelagem guardada nela entra ANTES: a primeira edição numa cena vazia
       gravaria por cima dela. */
    entrarSemProjeto: function () {
      var g = G(), b = B();
      if (!g || g._bimCenaObra != null) return;
      var chave = g._bimSel || "geral", ops = [];
      try { var ed = global.Store.obter(emp(), "bim_edicoes", chave); ops = (ed && ed.ops) || []; } catch (e) {}
      try {
        var vivas = (b && b.editarOps) ? b.editarOps() : [];
        /* ⚠ JUNTA, não troca: quem chega aqui pelo aoMudarCena JÁ desenhou na cena (op que não passou pela fita:
           IA, cálculo, API). Trocar pela modelagem guardada APAGAVA esse trabalho — com a guardada vazia, a
           cena inteira sumia (achado no gate da 1.2.132: 14 e2e do BIM com 0 peças depois de criar). A guardada
           entra primeiro; das vivas, só as que ela ainda não tem (mesmo id = a mesma op). */
        if (b && b.editarAplicar && ops.length && JSON.stringify(vivas) !== JSON.stringify(ops)) {
          /* ⚠ A MESMA OP SEM id (matriz, cópia — 19/10/2026): o "mesmo id" deixava passar TODA op sem id, e ela
             entrava de novo a cada junção. E O DONO VEM ANTES DO editarAplicar: montar a cena avisa o aoMudarCena,
             que chamava esta função de novo com a cena ainda "sem dono" — laço que somava as cópias sem fim
             (a área de teste do Rogério chegou a 11.622 ops, 1.049 vezes o mesmo bloco, e travava ao abrir). */
          var ja = {}; ops.forEach(function (o) { if (o) ja[o.id != null ? "#" + o.id : JSON.stringify(o)] = 1; });
          g._bimCenaObra = chave;
          b.editarAplicar(ops.concat(vivas.filter(function (o) { return !o || !ja[o.id != null ? "#" + o.id : JSON.stringify(o)]; })));
        }
      } catch (e2) {}
      g._bimCenaObra = chave;
    },

    /* ======================================= GANCHOS DO Gestao (montagem) */
    /* chamado na montagem do visualizador, ANTES do replay da obra.
       Devolve true quando o replay de sempre (a área de trabalho da obra do
       alto) deve acontecer. */
    antesDoReplay: function (g) {
      var chave = g._bimSel || "geral";
      if (this._proj) {
        if (String(this._proj.obraId) === String(g._bimSel || "")) return false;   /* a cena é do projeto aberto */
        /* a obra mudou por fora com um projeto aberto (outra tela mexeu no alto):
           a cena é do projeto, não da obra nova — fecha sem gravar por cima */
        this._proj = null;
      }
      var dono = g._bimCenaObra;
      /* ⚠ CENA DE OUTRA OBRA: sai inteira antes de qualquer gravação (ver o
         cabeçalho). Era aqui que a modelagem de uma obra ia parar na outra. */
      if (dono != null && dono !== chave) { this.descarregarCena(); dono = null; }
      if (dono === chave) return true;            /* a mesma obra de antes: confere salvo × vivo, como sempre */
      if (g._bimSel) return true;                 /* obra posta no alto por outra tela: a área de trabalho dela abre, como sempre */
      return false;                               /* a tela inicial: nada carrega */
    },
    /* depois da montagem: a tela inicial (se nada estiver aberto) e o título */
    aoMontar: function (g) {
      this._G = g;
      var self = this, b = B(), vazia = true;
      try { vazia = !((b && b.modelos) || []).length && !((b && b.editarOps) ? b.editarOps() : []).length; } catch (e) {}
      if (!this._proj && vazia) this.mostrarInicio(); else this.esconderInicio();
      this.pintarTitulo();
      if (!this._unloadLigado && global.addEventListener) {
        this._unloadLigado = true;
        /* fechar a aba com projeto alterado: o navegador pergunta (salvar daqui
           não dá — a gravação é assíncrona e a página já está indo embora) */
        global.addEventListener("beforeunload", function (ev) {
          try { if (self._proj && global.App && global.App.view === "bim" && self.sujo()) { ev.preventDefault(); ev.returnValue = ""; return ""; } } catch (e) {}
        });
      }
    },
    /* um modelo entrou ou saiu da cena */
    aoMudarCena: function () {
      var g = G();
      if (this._abrindo || (g && g._bimCenaMuda)) return;
      var b = B(), n = 0;
      try { n = ((b && b.modelos) || []).length; } catch (e) {}
      if (n && !this._proj && this.inicioVisivel()) { this.entrarSemProjeto(); this.esconderInicio(); }
      this._agendarTitulo();
    },
    aoEditar: function () { this._agendarTitulo(); },
    aoTrocarObra: function () { if (this.inicioVisivel()) this._pintarInicio(); this.pintarTitulo(); },
    /* a fita: abrir, salvar e novo passam por aqui; e QUALQUER comando com a
       tela inicial na frente é a pessoa começando a trabalhar sem projeto */
    registrar: function (reg, g) {
      var self = this;
      this._G = g;
      var origSalvar = reg["salvar-modelo"], origOpbim = reg["salvar-opbim"];
      reg["novo-projeto"] = function () { self.novo(); return true; };
      reg["abrir-opbim"] = function () { self.abrirProjeto(); return true; };
      /* com projeto aberto, Salvar é salvar o PROJETO; sem projeto, o de sempre
         (guardar na obra / baixar o .opbim da cena) */
      reg["salvar-modelo"] = function (e) { if (self._proj) { self.salvar(); return true; } return origSalvar ? origSalvar(e) : false; };
      reg["salvar-opbim"] = function (e) { if (self._proj) { self.salvar(); return true; } return origOpbim ? origOpbim(e) : false; };
      /* os que abrem uma janela de arquivo ou um diálogo ficam de fora: a pessoa
         pode desistir, e a tela inicial tem de continuar ali */
      var DIALOGO = { "novo-projeto": 1, "abrir-opbim": 1, "salvar-opbim": 1, "salvar-modelo": 1, "abrir-ifc": 1, "arquivo-obra": 1,
        "importar-outros": 1, "templates": 1, "gerar-volumetria": 1, "exportar-ifc": 1, "exportar-revit": 1, "enviar-sketchup": 1 };
      Object.keys(reg).forEach(function (k) {
        var f = reg[k];
        if (typeof f !== "function" || DIALOGO[k]) return;
        reg[k] = function () { try { self.antesDoComando(k); } catch (eA) {} return f.apply(this, arguments); };
      });
    },
    antesDoComando: function () {
      if (!this.inicioVisivel()) return;
      if (!this._proj) this.entrarSemProjeto();
      this.esconderInicio();
    },
    /* App._navegar: sair do BIM com o projeto alterado pergunta antes */
    antesDeSair: function (destino) {
      var self = this;
      if (!this._proj) return true;
      if (!this.sujo()) { this.fechar({ semInicio: true }); return true; }
      this._perguntarSalvar(this._proj, function (escolha) {
        if (escolha === "cancelar") return;
        var ir = function () { try { if (global.App && global.App._navegar) global.App._navegar(destino); } catch (e) {} };
        if (escolha === "nao") { self.descartar(); self.fechar({ semInicio: true }); ir(); return; }
        self.salvar().then(function (r) { if (r && r.ok) { self.fechar({ semInicio: true }); ir(); } });
      });
      return false;
    },
    _perguntarSalvar: function (p, cb) {
      var corpo = '<p data-bp-pergunta style="margin:0 0 8px;font-size:14.5px">Salvar as alterações em <b>' + esc(p.nome) + "</b>?</p>" +
        '<p class="muted" style="margin:0;font-size:12.5px">' + (p.salvoEm
          ? "Se não salvar, o projeto e a obra “" + esc(p.obraNome) + "” voltam ao que estava na última gravação (" + esc(quando(p.salvoEm)) + ")."
          : "Este projeto ainda não foi salvo nenhuma vez. Se não salvar, ele não vai para os recentes e a obra “" + esc(p.obraNome) + "” volta ao que era antes dele.") + "</p>";
      global.UI.modal("Projeto BIM", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); cb("cancelar"); } },
        { texto: "Não salvar", classe: "", onClick: function () { global.UI.fecharModal(); cb("nao"); } },
        { texto: "Salvar", classe: "primary", onClick: function () { global.UI.fecharModal(); cb("salvar"); } }
      ]);
    },
    /* fecha o projeto aberto perguntando, se precisar, e só então segue */
    _fecharComPergunta: function (seguir, desistiu) {
      var self = this, p = this._proj;
      if (!p) { seguir(); return; }
      if (!this.sujo()) { this.fechar({ semInicio: true }); seguir(); return; }
      this._perguntarSalvar(p, function (escolha) {
        if (escolha === "cancelar") { if (desistiu) desistiu(); return; }
        if (escolha === "nao") { self.descartar(); self.fechar({ semInicio: true }); seguir(); return; }
        self.salvar().then(function (r) {
          if (r && r.ok) { self.fechar({ semInicio: true }); seguir(); } else if (desistiu) desistiu();
        });
      });
    },

    /* ============================================== ABRIR / FECHAR O PROJETO */
    /* o "Não salvar": a obra volta ao que estava na última gravação do projeto
       (ou ao que era antes do projeto novo) */
    descartar: function () {
      var p = this._proj;
      if (!p || !p.salvo) return;
      try { var g = G(); if (g) { clearTimeout(g._bimEdSaveT); g._bimEdPend = null; } } catch (e) {}
      this.restaurarObra(p.obraId, p.salvo);
      if (p.salvoEm) {
        var ass = this.assinaturaObra(p.obraId);
        this._mexerIndice(function (ix) { return P().marcarObra(ix, p.obraId, ass); });
      }
    },
    fechar: function (opts) {
      var g = G();
      this.descarregarCena();
      this._proj = null;
      if (g) {
        /* a obra do alto volta a ser nenhuma — sem trazer a área de trabalho
           "sem obra" para a cena (a tela inicial é vazia) */
        try { g.bimTrocaObra("", { semCena: true }); } catch (e) {}
        g._bimCenaObra = null;
      }
      this.pintarTitulo();
      if (!(opts && opts.semInicio) && global.App && global.App.view === "bim") this.mostrarInicio();
    },
    /* o projeto novo acabou de nascer (Gestao._npCriar) */
    prepararNovo: function (g, obraId) {
      this.descarregarCena();
      if (String(g._bimSel || "") !== String(obraId)) g.bimTrocaObra(obraId, { semCena: true });
      g._bimCenaObra = obraId;
    },
    criado: function (g, info) {
      var self = this;
      this._proj = { id: uid(), nome: info.nome, obraId: info.obraId, obraNome: info.obraNome || obraNome(info.obraId), criadoEm: agora(), salvoEm: "", base: null, salvo: info.foto || null, cotasAutoNovo: true };
      g._bimCenaObra = info.obraId;
      this.esconderInicio();
      this.pintarTitulo();
      this._lerIndice().then(function () { self.pintarTitulo(); });
      return this._proj;
    },
    /* opts.tpl: o template de início já marcado (o cartão da tela inicial, js/bimtplinicio.js) */
    novo: function (opts) {
      var g = G();
      if (!g) return false;
      this._fecharComPergunta(function () { g._novoProjeto(opts); });
      return true;
    },
    /* ============================================ PROJETO EXEMPLO COMPLETO (25/10/2026)
       Pedido do Rogério: "deixe como MODELO PADRÃO de obra, para o usuário ver como modelo e para eu mostrar um exemplo de
       projeto feito no sistema, com tudo mesmo". O exemplo é gerado pelos COMANDOS do sistema (tools/gerar-projeto-modelo.js →
       bim/exemplos/projeto-exemplo-completo.json: as ops do modelo e a auditoria da geração).
       ⚠ Abre numa obra de EXEMPLO própria (id fixo, nome "EXEMPLO — …", sem cliente, sem valor) — NUNCA na obra que está no
       alto: o exemplo não se mistura com obra de cliente. O .opbim é montado aqui com as ops e os níveis do template Universal
       (Térreo + Cobertura) e entra pelo MESMO caminho do "Abrir projeto" (abrirBytes: pergunta antes de fechar o que está
       aberto, guarda a modelagem que já estiver na obra de exemplo). Depois: as pranchas de arquitetura nas abas de folha (a
       Prancha Viva usa as mesmas), a cena de apresentação (fachada e sala) e a divisão A-1 do incêndio. `o.cliente`: abre a
       Prancha Viva por cima. Devolve uma Promise<boolean>. */
    abrirExemplo: function (o) {
      var self = this, g = G();
      o = o || {};
      if (!g || !global.OpFormato || !global.BimBcf || !g._opbimMontar) { toast("O formato .opbim não carregou: não consigo abrir o exemplo.", "erro"); return Promise.resolve(false); }
      if (this._exemploAbrindo) return this._exemploAbrindo;
      toast("Abrindo o projeto exemplo…", "ok", 4000);
      var arquivo = String(o.arquivo || "bim/exemplos/projeto-exemplo-completo.json");
      this._exemploAbrindo = global.fetch(arquivo, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("o arquivo do exemplo não veio (HTTP " + r.status + ")");
        return r.json();
      }).then(function (ex) {
        if (!ex || ex.formato !== "orcapro-projeto-exemplo" || !Array.isArray(ex.ops)) throw new Error("arquivo do exemplo inválido");
        var ob = self._obraExemplo(ex.obra || {});
        if (!ob) throw new Error("não consegui criar a obra de exemplo");
        var niveis = self._niveisExemplo(ob.id), m = g._opbimMontar({ obraId: ob.id, ops: ex.ops, niveis: niveis, d2: null });
        m.proj.nome = String(ex.nome || "Projeto exemplo");
        m.proj.extras = m.proj.extras || {};
        m.proj.extras["projeto-bim.json"] = { formato: 1, id: "projeto-exemplo-completo", nome: m.proj.nome, obraId: ob.id, obraNome: ob.nome, criadoEm: "", salvoEm: "" };
        var bytes = global.OpFormato.projetoParaZip(m.proj, g._opMeta(), global.BimBcf.zipEscrever);
        return self.abrirBytes(bytes, { obraId: ob.id, obraNome: ob.nome, nome: m.proj.nome }).then(function (ok) {
          if (!ok) return false;
          var r = self._depoisDoExemplo(ob.id);
          /* o que o exemplo gera ao abrir (as vistas de corte e as pranchas ligadas) é parte do exemplo como ele abre: a marca
             de "sem alteração" passa a ser esta — senão abrir o exemplo de novo (ou o "Mostrar ao cliente") perguntava "Salvar
             as alterações?" de algo que o usuário não fez (e2e, 25/10/2026) */
          try { if (self._proj && String(self._proj.obraId) === String(ob.id)) { self._proj.base = self.assinaturaAtual(); self._proj.salvo = self.fotoObra(ob.id); if (self.pintarTitulo) self.pintarTitulo(); } } catch (eB) {}
          toast("Projeto exemplo aberto na obra “" + ob.nome + "”: " + (r.folhas ? r.folhas + " pranchas de arquitetura, " : "") + (r.hidro ? r.hidro + " pranchas do hidrossanitário, " : "") + (r.ele ? r.ele + " pranchas da elétrica, " : "") +
            (r.ligadas ? r.ligadas + " folhas ligadas ao 3D (Prancha Viva), " : "") + (r.cena ? "a cena de apresentação, " : "") +
            "o orçamento pelo modelo e os auditores de cada disciplina prontos. Nada disso entra nas suas obras.", "ok", 9000);
          /* gerar as pranchas abre a 1ª folha numa aba: o exemplo abre no 3D, de frente para a casa (a folha fica na barra) */
          try { if (global.BimShell && global.BimShell.abrirDoc) global.BimShell.abrirDoc("3d"); } catch (e3) {}
          try { if (global.BIM && global.BIM.aplicarVista) global.BIM.aplicarVista({ camera: { pos: [24, 13, 36], alvo: [6, 1, 14], up: [0, 1, 0], fov: 45 } }, {}); } catch (eV) {}
          if (o.cliente && global.BimShell) {
            /* ⚠ SEM o módulo Prancha Viva liberado (regra de 24/10/2026: a vitalícia e o plano BIM em dia recebem; o teste do módulo também) o
               exemplo NÃO gera folha ligada ao 3D — antes o "Mostrar ao cliente" abria, calado, numa folha sem ligação com o modelo. Agora diz o
               que falta, por escrito, e fica no visor 3D comum, de frente para a casa (aberto logo acima). */
            var MPv = global.PranchaVivaModulo, gPv = MPv && MPv.guarda ? MPv.guarda("abrir") : { ok: false, motivo: "O módulo Prancha Viva não carregou." };
            if (!gPv.ok) { self._avisoSemPranchaViva(gPv); return true; }
            try { global.BimShell.executar("prancha-viva"); } catch (ePv) {}
            /* para o cliente, abre na primeira folha LIGADA ao 3D (a planta do térreo): as de arquitetura vêm antes na lista
               e são imagem — "sem ligação com o modelo" justamente no que se quer mostrar */
            var PVU = global.PranchaVivaUI, kk = 0, lig = function () {
              var st = PVU && PVU._st;
              if (st && st.folhas && st.folhas.length) {
                var ix = -1; st.folhas.some(function (f, i) { if (f && f.nLig > 0) { ix = i; return true; } return false; });
                if (ix > 0 && st.atual !== ix && PVU.abrirFolha) { try { PVU.abrirFolha(ix); } catch (eF) {} }
                return;
              }
              if (++kk < 60) global.setTimeout(lig, 150);
            };
            global.setTimeout(lig, 150);
          }
          return true;
        });
      }).then(function (ok) { self._exemploAbrindo = null; return ok; }, function (e) {
        self._exemploAbrindo = null;
        toast("Não abri o projeto exemplo: " + (e && e.message || e) + ".", "erro", 9000);
        return false;
      });
      return this._exemploAbrindo;
    },
    /* "Mostrar ao cliente" sem a Prancha Viva liberada: o que falta e o que o cliente vê no lugar (o visor 3D comum, que já está aberto) */
    _avisoSemPranchaViva: function (g) {
      var msg = "Para mostrar o projeto ao cliente com a Prancha Viva (a folha que abre o 3D no ponto tocado), o módulo Prancha Viva precisa estar liberado nesta licença — e ele não está. " +
        "Sem ele, as folhas do exemplo não ficam ligadas ao modelo, por isso não abri nenhuma folha: o exemplo ficou no visor 3D comum, de frente para a casa. " +
        "Quem tem a licença vitalícia ou o plano BIM em dia recebe a Prancha Viva; o teste do módulo também libera.";
      var UI = global.UI, PVU = global.PranchaVivaUI;
      /* os recados de "abrindo…" e "projeto aberto" ainda estão no canto e tampavam o botão do quadro: saem antes (o aviso é o que importa agora) */
      try { var wT = global.document && global.document.getElementById("toasts"); if (wT) while (wT.firstChild) wT.removeChild(wT.firstChild); } catch (eT) {}
      try {
        if (UI && UI.modal) {
          UI.modal("Mostrar ao cliente — falta liberar a Prancha Viva",
            '<div style="font-size:13px;line-height:1.5;max-width:560px"><p style="margin:0 0 8px">' + esc(msg) + '</p><p class="muted" style="margin:0">O que está aberto agora: o projeto exemplo no 3D comum (gire, aproxime, corte e meça normalmente).</p></div>',
            [{ texto: "Entendi", classe: "ghost", onClick: function () { UI.fecharModal(); } },
             { texto: "Como liberar a Prancha Viva", classe: "primary", onClick: function () { UI.fecharModal(); if (PVU && PVU.oferta) { try { PVU.oferta(g); } catch (eO) {} } } }]);
          return true;
        }
      } catch (e) {}
      toast(msg, "aviso", 14000);
      return true;
    },
    /* a obra de EXEMPLO: id fixo, sem cliente — criada na primeira vez, reaproveitada depois (o nome volta ao do exemplo) */
    _obraExemplo: function (d) {
      var id = String(d.id || "exemplo-projeto-completo"), e = emp(), atual = null;
      if (!/^exemplo-/.test(id)) return null;   /* ⚠ nunca grava por cima de uma obra que não é de exemplo */
      try { atual = global.Store.obter(e, "obras", id); } catch (e0) { atual = null; }
      if (!atual) {
        var reg = { id: id, nome: String(d.nome || "EXEMPLO — Projeto completo (OrçaPRO)"), tipo: String(d.tipo || "residencial"), fase: "projeto", status: "planejamento",
                    local: String(d.local || ""), areaTerreno: Number(d.areaTerreno) || 0, areaConstruida: Number(d.areaConstruida) || 0, exemplo: true,
                    obs: "Projeto EXEMPLO do OrçaPRO (todas as disciplinas, feito pelos comandos do sistema). Não é obra de cliente: apague quando quiser." };
        var s = null; try { s = global.Store.salvar(e, "obras", reg); } catch (e1) { s = null; }
        if (!s) return null;
        atual = reg;
      }
      /* o incêndio e a acessibilidade (js/incacsui.js, por aparelho): a casa é residência unifamiliar, divisão A-1 */
      try {
        var k = "raerp:bim:incendio-dados:" + id;
        if (global.localStorage && !global.localStorage.getItem(k) && d.incendio) global.localStorage.setItem(k, JSON.stringify(d.incendio));
      } catch (e2) {}
      return { id: id, nome: String(atual.nome || d.nome || id) };
    },
    /* os níveis do template Universal (Térreo e Cobertura, pé-direito 2,80), com a chave da obra de exemplo */
    _niveisExemplo: function (obraId) {
      var T = global.BimTplInicio, pl = null;
      try { pl = T ? T.plano(T.primeiraDo("universal"), { pavimentos: 1, peDireito: 2.8, largura: 12, comprimento: 25 }) : null; } catch (e) { pl = null; }
      var ns = pl && pl.ok ? pl.niveis : [{ id: "nivel-1", nome: "Térreo", elevacao: 0, corte: 1.2 }, { id: "nivel-cob", nome: "Cobertura", elevacao: 2.8, corte: 1.2, peDireitoDeclarado: 2.8 }];
      return ns.map(function (n) { return { id: obraId + "::" + n.id, nome: n.nome, elevacao: n.elevacao, corte: n.corte != null ? n.corte : null, peDireitoDeclarado: n.peDireitoDeclarado != null ? n.peDireitoDeclarado : null }; });
    },
    /* depois de abrir: as pranchas de arquitetura (abas de folha / Prancha Viva) e a cena de apresentação — o que já existe na
       obra de exemplo fica (gerar de novo substitui as folhas; a cena com o mesmo nome não duplica) */
    _depoisDoExemplo: function (obraId) {
      var out = { folhas: 0, cena: false };
      try {
        var AU = global.ArqPranchasUI;
        if (AU && AU.gerar && AU._int && AU._int.ctxAtual) {
          var ctx = AU._int.ctxAtual(); ctx.pavimentos = [{ nome: "Térreo", cota: 0 }];
          ctx.cortes = { A: 7.0, B: 7.55 };   /* AA pela escada de marinheiro e pelo alçapão, BB pela caixa d'água e pelo closet: o que o projeto tem de mais para mostrar */
          var cj = { situacao: true, existente: false, demolir: false, layout: true, cobertura: true, forro: true, cortes: true, fachadas: true, piso: true, quadros: true, humanizada: true };
          var r = AU.gerar(ctx, { formato: "AUTO", escala: "auto", prefixo: "ARQ", revisao: "R00", conjuntos: cj, municipio: "", cotasInternas: true }, { pdf: false, dxf: false, abas: true });
          if (r && r.ok) out.folhas = (r.folhas || []).length;
        }
      } catch (eA) {}
      /* HIDROSSANITÁRIO e ELÉTRICA nas abas de folha (25/10/2026): as mesmas pranchas dos botões "Gerar pranchas" do hidro e "Pranchas elétricas", no
         padrão RA e com a conferência de sobreposição do motor delas (o total vai em `BimProjetosUI._exemploRel`). O hidro precisa do dimensionamento:
         roda o "Dimensionar" como na tela e tira a pintura de verificação do 3D (o exemplo abre limpo). */
      out.sobreposicao = { hidro: null, ele: null };
      try {
        var HCu = global.HidCalcUI, HPu = global.HidPranchasUI;
        if (HCu && HCu.dimensionar && HPu && HPu.gerar && HPu._int && HPu._int.ctxAtual) {
          /* ⚠ o "Dimensionar" grava a entrada do cálculo no aparelho (orcapro:hid:entrada, de TODAS as obras): o exemplo guarda o que havia e devolve —
             "nada disto entra nas suas obras" */
          var kHid = "orcapro:hid:entrada", lsHid = null, E0 = HCu.estado, antes = { uso: E0.uso, valores: JSON.parse(JSON.stringify(E0.valores || {})), alim: JSON.parse(JSON.stringify(E0.alim || {})) };
          try { lsHid = global.localStorage.getItem(kHid); } catch (eK) {}
          if (HCu.entrada) HCu.entrada();   /* o uso e o programa padrão da tela (residencial unifamiliar, pelos aparelhos do modelo) */
          /* o nível d'água da caixa do projeto (informado, não o mais desfavorável): mínimo 15 cm acima da saída, máximo na altura do extravasor */
          try {
            var stH = global.BIM.editarEstado().estado, cxH = (stH.familias || []).filter(function (f) { return f.famId === "hid-caixa-dagua"; })[0];
            if (cxH && isFinite(+cxH.y)) { E0.alim.nivelAgua = Math.round((+cxH.y + 0.15) * 100) / 100; E0.alim.nivelAguaMax = Math.round((+cxH.y + 0.85) * 100) / 100; }
          } catch (eN) {}
          var Rh = HCu.dimensionar();
          if (Rh) {
            var cxh = HPu._int.ctxAtual(); cxh.pavimentos = [{ nome: "Térreo", cota: 0 }];
            var rh = HPu.gerar(cxh, HPu._int.lerMemoria(cxh.obraKey), { pdf: false, dxf: false, abas: true });
            if (rh && rh.ok) { out.hidro = (rh.folhas || []).length; out.sobreposicao.hidro = rh.verificacao ? (rh.verificacao.sobreposicoes || 0) + (rh.verificacao.rotuloTubo || 0) + (rh.verificacao.rotuloCota || 0) : null; }
            else out.hidroMotivo = (rh && rh.avisos ? rh.avisos.join(" ") : "não gerou");
          }
          try { if (global.BimInstUI) { global.BimInstUI._corVerif = null; } if (global.BIM && global.BIM.editarReconstruir) global.BIM.editarReconstruir(); } catch (eCor) {}
          try {
            E0.uso = antes.uso; E0.valores = antes.valores; E0.alim = antes.alim; E0.resultado = null; E0.opsNoCalculo = null;
            if (lsHid == null) global.localStorage.removeItem(kHid); else global.localStorage.setItem(kHid, lsHid);
          } catch (eR) {}
        }
      } catch (eH) { out.hidroMotivo = String(eH && eH.message || eH); }
      try {
        var ECu = global.EleCircuitosUI;
        if (ECu && ECu.pranchasNasAbas) {
          var re = ECu.pranchasNasAbas();
          if (re && re.ok) { out.ele = re.folhas; out.sobreposicao.ele = re.verificacao ? re.verificacao.sobreposicoes : null; }
          else out.eleMotivo = re && re.motivo || "não gerou";
        }
      } catch (eE) { out.eleMotivo = String(eE && eE.message || eE); }
      try { global.BimProjetosUI._exemploRel = out; } catch (eRel) {}
      try {
        var C = global.BimCena, A = global.BimCenaArm;
        if (C && A && A.salvar) {
          var ja = (A.listar ? A.listar(obraId) : []).filter(function (x) { return x && x.nome === "Apresentação ao cliente"; })[0];
          if (!ja) {
            var est = C.padrao(), r1;
            est.nome = "Apresentação ao cliente"; est.ambiente.hora = "16:30";
            r1 = C.adicionarCamera(est, { nome: "Fachada", camera: { pos: [16, 3.2, 34], alvo: [6, 1.8, 18], fov: 50 } }); est = r1.estado;
            r1 = C.adicionarCamera(est, { nome: "Sala e cozinha", camera: { pos: [2.3, 1.6, 18.4], alvo: [8.6, 1.1, 14.6], fov: 60 } }); est = r1.estado;
            est.camAtiva = est.cameras.length ? est.cameras[0].id : "";
            var rs = A.salvar(obraId, { nome: "Apresentação ao cliente", estado: est, padrao: false });
            out.cena = !!(rs && rs.ok);
          } else out.cena = true;
        }
      } catch (eC) {}
      /* as pranchas LIGADAS ao modelo (plantas, cortes e elevações com a matriz folha → 3D): é o que a Prancha Viva mostra ao
         cliente — as de arquitetura acima vão em imagem e apareciam "sem ligação com o modelo" (revisor, 25/10/2026). Só com o
         módulo liberado: sem ele o gerador abriria a oferta por cima do exemplo */
      try {
        var PVU = global.PranchaVivaUI, MP = global.PranchaVivaModulo, gd = MP && MP.guarda ? MP.guarda("gerar") : null;
        if (PVU && PVU.gerarDoModelo && global.BimFolhaUI && gd && gd.ok) {
          var rv = PVU.gerarDoModelo();
          if (rv && rv.ok) out.ligadas = (rv.criadas || 0) + (rv.atualizadas || 0);
        }
      } catch (eV) {}
      return out;
    },
    /* ÁREA DE TESTE (14/10/2026): o BIM sem obra e sem projeto — a área de trabalho "sem obra" que o editor já
       guarda à parte (Store "bim_edicoes", chave "geral"). Nada do que se modela aqui entra numa obra. Com um
       projeto aberto, pergunta antes se salva (como o Novo projeto). */
    areaTeste: function () {
      var self = this, g = G();
      if (!g) return false;
      this._fecharComPergunta(function () {
        self.descarregarCena();
        try { g.bimTrocaObra("", {}); } catch (e) {}
        self.esconderInicio();
        self.pintarTitulo();
        toast("Área de teste: o BIM sem obra. O que você modelar aqui fica só nesta área — não entra em obra nenhuma. Para guardar de verdade, use Novo projeto (Início).", "ok", 9000);
        self._inicioDaAreaTeste();
      });
      return true;
    },
    /* TEMPLATE DE INÍCIO NA ÁREA DE TESTE (20/10/2026): vazia (sem peça, sem modelo e sem nível), ela pergunta
       com qual template começa — o lembrado como padrão entra sem perguntar — e abre na PLANTA BAIXA, liberada para
       desenhar. Com modelagem, fica como estava (3D). ⚠ Nada aqui monta a cena (ver o laço da 1.2.156). */
    _inicioDaAreaTeste: function () {
      var g = G(), T = global.BimTplInicio, self = this;
      if (!g || !this.emAreaTeste()) return false;
      var vazia = g._tplIniCenaVazia ? g._tplIniCenaVazia() : false, semNivel = true;
      try { semNivel = !g._nivLer().length; } catch (e) {}
      if (!vazia) return false;
      if (!semNivel || !T || !g._tplIniGradeHtml) { try { g._tplIniAbrirPlanta(null); } catch (e2) {} return true; }
      var lembrado = T.padrao();
      if (lembrado) { this._areaTesteComTemplate(lembrado); return true; }
      var sel = T.inicial(), lembrar = false;
      global.UI.modal("Área de teste — começar com qual template?",
        '<p class="muted" style="margin:0 0 10px;font-size:12.5px">A área está vazia. O template cria os níveis, as vistas (planta de cada nível, cortes A e B, elevações e 3D), as penas do padrão RA e a fita da disciplina — e abre na planta baixa, pronta para desenhar.</p>' +
        '<div data-tpl-box="teste">' + g._tplIniGradeHtml(sel, false) + "</div>", [
          { texto: "Sem template (só a planta)", classe: "ghost", onClick: function () { global.UI.fecharModal(); try { g._tplIniAbrirPlanta(null); } catch (e3) {} } },
          { texto: "Começar", classe: "primary", onClick: function () {
            global.UI.fecharModal();
            if (T) T.lembrar(lembrar ? sel : null);
            self._areaTesteComTemplate(sel);
          } }
        ]);
      var box = document.querySelector('#modal-bg [data-tpl-box="teste"]');
      if (box) g._tplIniLigar(box, function (id, lb) { sel = id; lembrar = lb; });
      return true;
    },
    _areaTesteComTemplate: function (id) {
      var g = G(), r = null;
      try { r = g._tplIniAreaTeste(id); } catch (e) { r = { ok: false, avisos: [String(e && e.message || e)] }; }
      var t = global.BimTplInicio ? global.BimTplInicio.obter(id) : null;
      if (r && r.ok) toast("Área de teste com o template " + (t ? t.nomeCompleto : id) + ": níveis, vistas e penas prontos. A planta baixa do Térreo está na frente." + (r.avisos && r.avisos.length ? " (" + r.avisos.join("; ") + ")" : ""), "ok", 8000);
      else toast("Não consegui aplicar o template na área de teste" + (r && r.avisos ? ": " + r.avisos.join("; ") : "") + ".", "erro", 8000);
      this.pintarTitulo();
      return r;
    },
    /* a cena na tela é a área de teste: sem projeto, sem obra no alto e com a área "sem obra" carregada */
    emAreaTeste: function () {
      var g = G();
      return !this._proj && !!g && String(g._bimSel || "") === "" && g._bimCenaObra === "geral";
    },
    /* "Salvar projeto" sem projeto aberto: o que está na obra do alto vira um projeto */
    salvarComo: function () {
      var self = this, g = G();
      if (!g) return;
      if (!g._bimSel) { toast("Para salvar como projeto, escolha a obra no alto da tela — ou comece um Novo projeto.", "aviso", 7000); return; }
      var obra = g._bimSel, nObra = obraNome(obra), padrao = P().nomePadrao("", nObra);
      global.UI.modal("Salvar como projeto",
        '<p class="muted" style="margin:0 0 10px;font-size:12.5px">O que está aberto na obra “' + esc(nObra) + '” vira um projeto: vai para os recentes, para o sistema e para o computador.</p>' +
        '<label style="display:block">Nome do arquivo<input type="text" id="bp-como-nome" value="' + esc(padrao) + '" style="width:100%"></label>', [
          { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
          { texto: "Salvar", classe: "primary", onClick: function () {
            var el = document.getElementById("bp-como-nome"), nome = String((el && el.value) || "").replace(/\s+/g, " ").trim();
            if (!P().nomeArquivo(nome)) { toast("Dê um nome ao arquivo do projeto.", "aviso"); return; }
            var conf = P().conflitoDeNome(self._ix, nome, obra, "");
            if (conf) { toast("Já existe o projeto “" + conf.nome + "” nesta obra — escolha outro nome.", "erro"); return; }
            global.UI.fecharModal();
            try { g._bimEdFlush(); } catch (e) {}
            self.entrarSemProjeto();
            self._proj = { id: uid(), nome: nome, obraId: obra, obraNome: nObra, criadoEm: agora(), salvoEm: "", base: null, salvo: self.fotoObra(obra) };
            self.esconderInicio();
            self.salvar();
          } }
        ]);
    },

    /* ======================================================== SALVAR */
    salvar: function (opts) {
      var self = this, g = G(), p = this._proj;
      opts = opts || {};
      if (!p || !g) return Promise.resolve({ ok: false });
      if (g._bloqueado && g._bloqueado()) return Promise.resolve({ ok: false });
      if (!global.OpFormato || !global.BimBcf) { toast("O formato .opbim não carregou: nada foi salvo.", "erro"); return Promise.resolve({ ok: false }); }
      try { g._bimEdFlush(); } catch (e0) {}
      p.obraNome = obraNome(p.obraId) || p.obraNome;
      var m;
      try { m = g._opbimMontar(); }
      catch (e1) { toast("Não consegui montar o arquivo do projeto: " + (e1 && e1.message || e1) + ". Nada foi salvo.", "erro", 9000); return Promise.resolve({ ok: false }); }
      /* o arquivo é a tela DESTE instante — a marca de "sem alteração" também
         (o que for mexido enquanto a gravação corre fica como alteração) */
      var base = this.assinaturaAtual(), salvo = this.fotoObra(p.obraId), ass = this.assinaturaObra(p.obraId);
      return this._gravarProjeto(p, m, { substituir: !!opts.substituir, assinaturaObra: ass }).then(function (r) {
        var sis = r.sistema || {}, pc = r.computador || {};
        if (!r.ok) {
          toast(r.montar ? r.motivo + ". Nada foi salvo." : "NADA foi salvo do projeto “" + p.nome + "”: no sistema, " + (sis.motivo || "falhou") + "; no computador, " + (pc.motivo || "falhou") + ".", "erro", 12000);
          return { ok: false, sistema: sis, computador: pc };
        }
        p.salvoEm = r.salvoEm; p.base = base; p.salvo = salvo;
        self.pintarTitulo();
        var onde = [];
        if (sis.ok) onde.push("no sistema");
        if (pc.ok && pc.arquivo) onde.push("no computador (" + (pc.caminho || pc.arquivo) + ")");
        var baixou = pc.baixado ? "; baixei o arquivo .opbim (versão online: ele está na pasta Downloads)" : "";
        var falta = [];
        if (!sis.ok) falta.push("no sistema não: " + (sis.motivo || "falhou"));
        if (!pc.ok && !pc.online) falta.push("no computador não: " + (pc.motivo || "falhou"));
        if (!pc.ok && pc.online) falta.push("o download do .opbim não saiu");
        toast("Projeto “" + p.nome + "” salvo " + (onde.join(" e ") || "") + baixou + "." + (falta.length ? " Atenção — " + falta.join("; ") + "." : ""), falta.length ? "aviso" : "ok", falta.length ? 12000 : 6000);
        return { ok: true, sistema: sis, computador: pc };
      })["catch"](function (e) { toast("Não consegui salvar o projeto: " + (e && e.message || e), "erro", 9000); return { ok: false }; });
    },
    /* grava um .opbim no sistema e no computador e o põe no índice (recentes) —
       o caminho ÚNICO do Salvar e da cópia "Modelagem anterior". `opts`:
       `substituir` (o arquivo da pasta pode ser trocado), `assinaturaObra` (a
       marca de "a obra está guardada neste projeto"), `automatico` (a cópia
       automática: nunca pergunta, nunca grava por cima de arquivo da pasta e só
       vale com uma cópia que os recentes alcançam). Devolve
       { ok, sistema, computador, salvoEm } — os recados ficam com quem chama. */
    _gravarProjeto: function (p, m, opts) {
      var self = this, g = G(), quando0 = agora(), zip;
      opts = opts || {};
      try {
        m.proj.nome = p.nome;
        m.proj.extras = m.proj.extras || {};
        /* quem é este projeto: volta no "abrir do computador" de outro aparelho */
        m.proj.extras["projeto-bim.json"] = { formato: 1, id: p.id, nome: p.nome, obraId: p.obraId, obraNome: p.obraNome, criadoEm: p.criadoEm, salvoEm: quando0 };
        zip = global.OpFormato.projetoParaZip(m.proj, g._opMeta(), global.BimBcf.zipEscrever);
      } catch (e1) { return Promise.resolve({ ok: false, montar: true, motivo: "não consegui montar o arquivo do projeto: " + (e1 && e1.message || e1) }); }
      var noSistema = this._guardarNoSistema(p.id, zip, { nome: p.nome, obraId: p.obraId, salvoEm: quando0 });
      var noPc = this._servidor().then(function (srv) {
        if (!srv) {
          /* versão online: sem servidor local, o arquivo vem para Downloads */
          var okD = false; try { okD = !!g._opBaixar(P().nomeArquivo(p.nome) + P().EXT, zip, "application/zip"); } catch (eD) {}
          return { ok: okD, baixado: okD, online: true };
        }
        return self._gravarNoPc(p, zip, !!opts.substituir);
      });
      return Promise.all([noSistema, noPc]).then(function (rs) {
        var sis = rs[0] || {}, pc = rs[1] || {};
        if (pc.conflito) {
          /* ⚠ outro projeto (ou um arquivo posto à mão) tem este nome na pasta;
             a cópia automática não pergunta e não grava por cima */
          if (!opts.automatico && global.confirm("Já existe outro arquivo com este nome na pasta da obra:\n" + (pc.caminho || "") + "\n\nSubstituir pelo projeto “" + p.nome + "”?")) {
            return self._gravarNoPc(p, zip, true).then(function (pc2) { return [sis, pc2]; });
          }
          pc = { ok: false, motivo: opts.automatico ? "já havia outro arquivo com este nome na pasta (" + (pc.caminho || pc.arquivo || "") + ") — não gravei por cima" : "você não quis substituir o arquivo que já estava na pasta" };
        }
        return [sis, pc];
      }).then(function (rs) {
        var sis = rs[0] || {}, pc = rs[1] || {};
        var ok = opts.automatico ? (!!sis.ok || (!!pc.ok && !!pc.arquivo)) : (!!sis.ok || !!pc.ok);
        if (!ok) return { ok: false, sistema: sis, computador: pc };
        /* ⚠ `sistema` SEMPRE com o resultado DESTA gravação: se o banco recusou
           agora, a cópia que está lá é a anterior — dizer "Sistema" faria o
           recente abrir uma versão velha sem ninguém saber (o do computador,
           sem `computadorEm` novo, já aparece como "cópia de <data>") */
        var entrada = { id: p.id, nome: p.nome, obraId: p.obraId, obraNome: p.obraNome, criadoEm: p.criadoEm, salvoEm: quando0, abertoEm: quando0, bytes: zip.length, oculto: false, sistema: !!sis.ok };
        if (pc.ok && pc.arquivo) { entrada.computador = pc.arquivo; entrada.caminho = pc.caminho || ""; entrada.computadorEm = quando0; }
        if (pc.baixado) entrada.baixado = true;
        return self._mexerIndice(function (ix) {
          var i1 = P().registrar(ix, entrada);
          return opts.assinaturaObra ? P().marcarObra(i1, p.obraId, opts.assinaturaObra) : i1;
        }).then(function () { return { ok: true, sistema: sis, computador: pc, salvoEm: quando0 }; });
      });
    },
    _gravarNoPc: function (p, zip, substituir) {
      var q = "obra=" + encodeURIComponent(p.obraNome || "") + "&nome=" + encodeURIComponent(p.nome) + "&id=" + encodeURIComponent(p.id) + (substituir ? "&substituir=1" : "");
      return fetch("/__projetos/salvar?" + q, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: zip })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: null }; }); })
        .then(function (x) {
          if (x.status === 409 && x.j && x.j.codigo === "existe") return { ok: false, conflito: true, caminho: x.j.caminho, arquivo: x.j.arquivo };
          if (x.j && x.j.ok) return { ok: true, arquivo: x.j.arquivo, caminho: x.j.caminho };
          return { ok: false, motivo: (x.j && x.j.erro) || ("o servidor local respondeu " + x.status) };
        })["catch"](function () { return { ok: false, motivo: "o servidor local do OrçaPRO não respondeu" }; });
    },

    /* ========================================================= ABRIR */
    abrirProjeto: function () {
      var self = this;
      global.UI.modal("Abrir projeto",
        '<p class="muted" style="margin:0 0 12px;font-size:12.5px">De onde vem o projeto?</p>' +
        '<div style="display:grid;gap:8px"><button type="button" class="btn" data-bp-de="sistema">' + ico("abrir", 15) + " Do sistema — os projetos guardados neste aparelho</button>" +
        '<button type="button" class="btn" data-bp-de="computador">' + ico("pasta", 15) + " Do computador — um arquivo .opbim</button></div>",
        [{ texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }]);
      var bg = document.getElementById("modal-bg");
      if (bg) bg.addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-bp-de]") : null;
        if (!b) return;
        global.UI.fecharModal();
        if (b.getAttribute("data-bp-de") === "sistema") self.abrirDoSistema(); else self.abrirDoComputador();
      });
    },
    abrirDoSistema: function () {
      var self = this;
      return this._lerIndice().then(function (ix) {
        var l = P().doSistema(ix);
        var corpo = !l.length ? '<p class="muted">Nenhum projeto guardado neste aparelho ainda. Crie um em “Novo projeto” — ao salvar, ele fica aqui.</p>'
          : '<table class="bp-tab" style="width:100%"><tbody>' + l.map(function (x) {
              return '<tr><td><b>' + esc(x.nome) + '</b><div class="muted" style="font-size:11.5px">obra ' + esc(x.obraNome || obraNome(x.obraId) || "—") + " · salvo em " + esc(quando(x.salvoEm)) + (x.oculto ? " · fora da lista de recentes" : "") + "</div></td>" +
                '<td style="text-align:right;white-space:nowrap"><button type="button" class="btn sm primary" data-bp-sis="' + esc(x.id) + '">Abrir</button></td></tr>';
            }).join("") + "</tbody></table>";
        global.UI.modal("Projetos do sistema", corpo, [{ texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }]);
        var bg = document.getElementById("modal-bg");
        if (bg) bg.addEventListener("click", function (e) {
          var b = e.target && e.target.closest ? e.target.closest("[data-bp-sis]") : null;
          if (!b) return;
          global.UI.fecharModal();
          self.abrirRecente(b.getAttribute("data-bp-sis"));
        });
        return l.length;
      });
    },
    abrirDoComputador: function () {
      var self = this;
      return this._servidor().then(function (srv) {
        if (!srv) { self._escolherArquivo(); return 0; }
        return fetch("/__projetos/listar", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
          var l = (j && j.arquivos) || [];
          var corpo = '<p class="muted" style="margin:0 0 10px;font-size:12.5px">Pasta: <b>' + esc((j && j.pasta) || srv.pasta) + "</b></p>" +
            (!l.length ? '<p class="muted">Nenhum .opbim nesta pasta ainda.</p>'
              : '<table class="bp-tab" style="width:100%"><tbody>' + l.map(function (a, i) {
                  return '<tr><td><b>' + esc(a.nome) + '</b><div class="muted" style="font-size:11.5px">' + esc(a.obra ? "pasta da obra " + a.obra : "na raiz da pasta") + " · " + esc(quando(a.em)) + "</div></td>" +
                    '<td style="text-align:right;white-space:nowrap"><button type="button" class="btn sm primary" data-bp-pc="' + i + '">Abrir</button></td></tr>';
                }).join("") + "</tbody></table>");
          global.UI.modal("Projetos do computador", corpo, [
            { texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
            { texto: "Procurar outro arquivo…", classe: "", onClick: function () { global.UI.fecharModal(); self._escolherArquivo(); } }
          ]);
          var bg = document.getElementById("modal-bg");
          if (bg) bg.addEventListener("click", function (e) {
            var b = e.target && e.target.closest ? e.target.closest("[data-bp-pc]") : null;
            if (!b) return;
            var a = l[+b.getAttribute("data-bp-pc")];
            global.UI.fecharModal();
            if (a) self._abrirDoDisco(a);
          });
          return l.length;
        })["catch"](function () { self._escolherArquivo(); return 0; });
      });
    },
    _abrirDoDisco: function (a) {
      var self = this;
      return fetch("/__projetos/ler?arquivo=" + encodeURIComponent(a.arquivo), { cache: "no-store" }).then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error((j && j.erro) || ("erro " + r.status)); }, function () { throw new Error("erro " + r.status); });
        return r.arrayBuffer();
      }).then(function (ab) {
        return self.abrirBytes(new Uint8Array(ab), { computador: a.arquivo, caminho: a.caminho || "", id: a.id || "", arquivoNome: a.nome });
      })["catch"](function (e) { toast("Não abri " + a.nome + ": " + (e && e.message || e), "erro", 9000); return false; });
    },
    _escolherArquivo: function () {
      var self = this, g = G();
      if (!g || !g._opEscolherArquivo) return;
      g._opEscolherArquivo(".opbim,application/zip", function (file) {
        file.arrayBuffer().then(function (ab) { return self.abrirBytes(new Uint8Array(ab), { arquivoNome: String(file.name || "").replace(/\.opbim$/i, "") }); })
          ["catch"](function (e) { toast("Não consegui ler " + file.name + ": " + (e && e.message || e), "erro"); });
      });
    },
    abrirRecente: function (id) {
      var self = this;
      return this._lerIndice().then(function (ix) {
        var e = P().obter(ix, id);
        if (!e) { toast("Este projeto não está mais na lista deste aparelho.", "erro"); return false; }
        return self._bytesDe(e).then(function (bytes) {
          if (!bytes) {
            toast("O arquivo de “" + e.nome + "” não está neste aparelho" + (e.caminho ? " nem em " + e.caminho : "") + ". Abra o .opbim pelo “Abrir projeto do computador”.", "erro", 10000);
            return false;
          }
          return self.abrirBytes(bytes, { id: e.id, nome: e.nome, obraId: e.obraId, obraNome: e.obraNome, sistema: e.sistema, computador: e.computador, caminho: e.caminho });
        });
      });
    },
    _bytesDe: function (e) {
      var self = this;
      var doSistema = (e.sistema && global.Idb) ? global.Idb.get(P().chaveIdb(emp(), e.id)).then(function (v) { return (v && v.bytes) ? new Uint8Array(v.bytes) : null; }, function () { return null; }) : Promise.resolve(null);
      return doSistema.then(function (b) {
        if (b || !e.computador) return b;
        return self._servidor().then(function (srv) {
          if (!srv) return null;
          return fetch("/__projetos/ler?arquivo=" + encodeURIComponent(e.computador), { cache: "no-store" })
            .then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (ab) { return ab ? new Uint8Array(ab) : null; })["catch"](function () { return null; });
        });
      });
    },
    abrirBytes: function (bytes, origem) {
      var self = this, g = G();
      origem = origem || {};
      if (!g || !global.OpFormato || !global.BimBcf) { toast("O formato .opbim não carregou.", "erro"); return Promise.resolve(false); }
      return global.OpFormato.lerProjeto(bytes, global.BimBcf.zipLer, { validarFamilia: global.Familia ? global.Familia.validar : null, inflar: g._opInflar() }).then(function (r) {
        if (!r.ok) { toast("Não abri o projeto: " + r.erros.join("; "), "erro", 9000); return false; }
        var meta = (r.extras && r.extras["projeto-bim.json"]) || {};
        var info = {
          id: String(meta.id || origem.id || "") || uid(),
          nome: String(meta.nome || origem.nome || r.nome || origem.arquivoNome || "Projeto"),
          obraId: String(meta.obraId || origem.obraId || ""), obraNome: String(meta.obraNome || origem.obraNome || ""),
          criadoEm: String(meta.criadoEm || ""), salvoEm: String(meta.salvoEm || "")
        };
        return self._garantirObra(info).then(function (ok) {
          if (!ok) return false;
          return new Promise(function (res) {
            self._fecharComPergunta(function () { self._aplicar(r, info, origem, bytes).then(res, function () { res(false); }); }, function () { res(false); });
          });
        });
      });
    },
    /* a obra do projeto existe nesta conta? Senão, a pessoa escolhe (ou cria) */
    _garantirObra: function (info) {
      var visiveis = obrasVisiveis();
      if (info.obraId && visiveis.some(function (o) { return String(o.id) === info.obraId; })) { info.obraNome = obraNome(info.obraId) || info.obraNome; return Promise.resolve(true); }
      return new Promise(function (res) {
        var titulo = info.obraId ? "O projeto “" + esc(info.nome) + "” é da obra “" + esc(info.obraNome || info.obraId) + "”, que não existe nesta conta." : "Em que obra o projeto “" + esc(info.nome) + "” entra?";
        var opts = visiveis.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.nome || "Obra") + "</option>"; }).join("");
        global.UI.modal("Obra do projeto", '<p style="margin:0 0 10px">' + titulo + "</p>" +
          '<label style="display:block">Obra<select id="bp-obra-esc" style="width:100%"><option value="">— escolha a obra —</option>' + opts + "</select></label>", [
          { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); res(false); } },
          { texto: "Abrir nesta obra", classe: "primary", onClick: function () {
            var s = document.getElementById("bp-obra-esc"), v = s ? s.value : "";
            if (!v) { toast("Escolha a obra.", "aviso"); return; }
            global.UI.fecharModal();
            info.obraOrigem = info.obraId; info.obraId = v; info.obraNome = obraNome(v);
            res(true);
          } }
        ]);
      });
    },
    _obraDosNiveis: function (modelo) {
      var conta = {}, melhor = "", n = 0;
      ((modelo && modelo.niveis) || []).forEach(function (x) { var s = String((x && x.id) || ""), i = s.indexOf("::"); if (i > 0) { var k = s.slice(0, i); conta[k] = (conta[k] || 0) + 1; if (conta[k] > n) { n = conta[k]; melhor = k; } } });
      return melhor;
    },
    _aplicar: function (r, info, origem, bytes) {
      var self = this;
      /* o índice em dia ANTES de conferir a obra: o "Não salvar" de um instante
         atrás pode estar gravando a marca dela na fila */
      return this._lerIndice().then(function () { return self._aplicarJa(r, info, origem, bytes); });
    },
    /* `guardada`: a obra cuja modelagem já virou "Modelagem anterior" nesta abertura */
    _aplicarJa: function (r, info, origem, bytes, guardada) {
      var self = this, g = G();
      var conf = this.conferirObra(info.obraId);
      if (conf.tem && !conf.salva && guardada !== info.obraId) {
        /* ⚠ a modelagem que está na obra vira "Modelagem anterior — …" ANTES de o
           projeto entrar por cima (ver `guardarAnterior`); sem a cópia, nada muda */
        var nomeAnt = this.nomeAnterior(info.obraId);
        if (!global.confirm(this._textoSubstituir(info.obraId, conf, "Abrir o projeto “" + info.nome + "”", nomeAnt))) { this._semNadaAberto(); return Promise.resolve(false); }
        return this.guardarAnterior(info.obraId, nomeAnt).then(function (ga) {
          if (!ga || !ga.ok) { self._semNadaAberto(); return false; }
          return self._aplicarJa(r, info, origem, bytes, info.obraId);
        });
      }
      var de = info.obraOrigem || this._obraDosNiveis(r.modelo);
      if (de && de !== info.obraId) r.modelo = P().rechavear(r.modelo, de, info.obraId);
      this._abrindo = true;
      this.esconderInicio();
      this.descarregarCena();
      try { g.bimTrocaObra(info.obraId, { semCena: true }); } catch (e0) {}
      var pr = null;
      try { pr = g._opbimAplicar(r); } catch (e1) { pr = null; }
      return Promise.resolve(pr).then(function () {
        self._abrindo = false;
        g._bimCenaObra = info.obraId;
        /* PROJETO SEM VOLUMETRIA (20/10/2026): sem peça, sem IFC e sem malha, abre na planta baixa do nível de
           trabalho; com modelo, fica como sempre (o 3D). Só abre a aba da planta — a cena não é tocada. */
        try {
          var md = (r && r.modelo) || {}, semNada = !(md.edicao || []).length && !(r.ifcs || []).length && !(r.malhas || []).length && !(md.malhas || []).length;
          if (semNada && g._tplIniCenaVazia && g._tplIniCenaVazia() && g._tplIniAbrirPlanta) g._tplIniAbrirPlanta(null);
        } catch (eV) {}
        var t = agora();
        self._proj = { id: info.id, nome: info.nome, obraId: info.obraId, obraNome: obraNome(info.obraId) || info.obraNome, criadoEm: info.criadoEm || t,
                       salvoEm: info.salvoEm || t, base: null, salvo: null };
        self._proj.base = self.assinaturaAtual();
        self._proj.salvo = self.fotoObra(info.obraId);
        var p = self._proj, ass = self.assinaturaObra(info.obraId);
        var entrada = { id: p.id, nome: p.nome, obraId: p.obraId, obraNome: p.obraNome, criadoEm: p.criadoEm, salvoEm: p.salvoEm, abertoEm: t, bytes: bytes ? bytes.length : 0, oculto: false };
        if (origem.computador) { entrada.computador = origem.computador; entrada.caminho = origem.caminho || ""; entrada.computadorEm = p.salvoEm; }
        /* veio do computador ou de um arquivo: fica também no sistema, para reabrir rápido */
        var guardar = (origem.sistema || !bytes) ? Promise.resolve({ ok: !!origem.sistema }) : self._guardarNoSistema(p.id, bytes, { nome: p.nome, obraId: p.obraId, salvoEm: p.salvoEm });
        return guardar.then(function (rs) {
          entrada.sistema = !!(rs && rs.ok);
          return self._mexerIndice(function (ix) { return P().marcarObra(P().registrar(ix, entrada), p.obraId, ass); });
        }).then(function () { self.pintarTitulo(); return true; });
      }, function (e) {
        self._abrindo = false;
        toast("Não consegui abrir o projeto: " + (e && e.message || e), "erro", 9000);
        return false;
      });
    },
    /* "Modelos IFC salvos na obra": o que antes abria sozinho, agora SOB PEDIDO */
    abrirModelosDaObra: function (obraId) {
      var self = this, g = G();
      if (!g || !obraId) return Promise.resolve(false);
      return new Promise(function (res) {
        self._fecharComPergunta(function () {
          self.esconderInicio();
          self.descarregarCena();
          g.bimTrocaObra(obraId);               /* a área de trabalho da obra, como sempre: a modelagem guardada nela e a obra no alto */
          var pr = null;
          try { pr = g._bimRestaurar(); } catch (e) { pr = null; }
          Promise.resolve(pr).then(function () { res(true); }, function () { res(true); });
        }, function () { res(false); });
      });
    },
    /* desistiu de abrir (ou a cópia falhou) depois de o projeto anterior fechar:
       a tela não fica vazia sem rumo — a tela inicial volta, se a cena está vazia */
    _semNadaAberto: function () {
      if (this._proj || !(global.App && global.App.view === "bim")) return;
      var b = B(), vazia = true;
      try { vazia = !((b && b.modelos) || []).some(function (m) { return m && !m.sintetico; }) && !((b && b.editarOps) ? b.editarOps() : []).length; } catch (e) {}
      if (vazia) this.mostrarInicio();
    },
    tirarDaLista: function (id) {
      var self = this;
      return this._mexerIndice(function (ix) { return P().ocultar(ix, id); }).then(function () {
        self._pintarInicio();
        toast("Saiu da lista de recentes. O projeto continua no sistema (Abrir projeto do sistema).", "ok");
        return true;
      });
    },
    abrirPasta: function (id) {
      var self = this;
      return this._lerIndice().then(function (ix) {
        var e = P().obter(ix, id);
        if (!e || !e.computador) { toast("Este projeto não tem arquivo na pasta do computador.", "aviso"); return false; }
        return fetch("/__projetos/abrir-pasta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivo: e.computador }) })
          .then(function (r) { return r.json(); }).then(function (j) {
            if (j && j.ok) { toast("Abri a pasta do projeto: " + (j.caminho || e.caminho || e.computador), "ok", 6000); return true; }
            toast("Não abri a pasta: " + ((j && j.erro) || "o servidor local recusou") + ".", "erro", 8000); return false;
          })["catch"](function () { toast("A pasta só abre no OrçaPRO instalado no computador.", "aviso"); return false; });
      });
    },

    /* ==================================================== TELA INICIAL */
    _host: function () {
      var palco = null;
      try { palco = (global.BimShell && global.BimShell.palco) ? global.BimShell.palco() : null; } catch (e) {}
      if (palco && document.body.contains(palco)) return palco;
      var c = document.getElementById("bim-canvas");
      return c ? c.parentNode : null;
    },
    inicioVisivel: function () {
      var el = this._inicio;
      return !!(el && el.style.display !== "none" && document.body.contains(el));
    },
    mostrarInicio: function () {
      var self = this, host = this._host();
      if (!host || (G() && G()._b4Janela3d)) return false;   /* a janela do 3D só mostra o modelo */
      this._css();
      var el = this._inicio;
      if (!el || !host.contains(el)) {
        el = document.createElement("div");
        el.className = "bp-inicio";
        el.setAttribute("data-bp-inicio", "1");
        el.setAttribute("role", "region");
        el.setAttribute("aria-label", "Início do BIM: novo projeto, abrir projeto e projetos recentes");
        host.appendChild(el);
        this._inicio = el;
        this._ligarInicio(el);
      }
      el.style.display = "";
      this._pintarInicio();
      this._lerIndice().then(function () { self._pintarInicio(); });
      this._servidor().then(function () { self._pintarInicio(); });
      return true;
    },
    esconderInicio: function () { if (this._inicio) this._inicio.style.display = "none"; },
    _pintarInicio: function () {
      var el = this._inicio;
      if (!el || el.style.display === "none") return;
      var ix = this._ix || P().indiceNormal(null), rec = P().recentes(ix), b = B(), g = G(), cenaCheia = false;
      try { cenaCheia = !!(((b && b.modelos) || []).length || ((b && b.editarOps) ? b.editarOps() : []).length); } catch (e) {}
      var srv = this._srvRes;
      /* o que está aberto SEM projeto (a obra do alto) pode virar projeto daqui */
      var comoProj = cenaCheia && !this._proj && g && g._bimSel;
      var h = '<div class="bp-cartao">' +
        '<div class="bp-cab"><div class="bp-marca">' + ico("obra", 28) + '</div><div style="flex:1;min-width:0"><h2>OrçaPRO BIM</h2>' +
          '<p>Comece um projeto ou abra um que já existe. Nada abre sozinho: o modelo só entra na tela quando você escolher.</p></div>' +
          (comoProj ? '<button type="button" class="bp-mini" data-bp="salvar-como" title="O que está aberto na obra “' + esc(obraNome(g._bimSel)) + '” vira um projeto (recentes, sistema e computador)">Salvar o que está aberto como projeto</button>' : "") +
          (cenaCheia ? '<button type="button" class="bp-mini" data-bp="voltar">Voltar ao modelo</button>' : "") +
          /* PRANCHA VIVA à vista na tela inicial (23/10/2026): a folha que abre o 3D no ponto tocado */
          (global.PranchaVivaUI && cenaCheia ? '<button type="button" class="bp-mini bp-mini-pri" data-bp="pviva" title="As pranchas do projeto aberto: toque num ponto e o 3D abre ali">' + ico("prancha", 14) + "Prancha Viva</button>" : "") + "</div>" +
        '<div class="bp-acoes">' +
          '<button type="button" class="bp-bt bp-pri" data-bp="novo"><b>' + ico("obra", 16) + "Novo projeto</b><span>Nome do arquivo, obra, níveis, pé-direito e paredes</span></button>" +
          '<button type="button" class="bp-bt" data-bp="abrir-sistema"><b>' + ico("abrir", 16) + "Abrir projeto do sistema</b><span>Os projetos guardados neste aparelho</span></button>" +
          '<button type="button" class="bp-bt" data-bp="abrir-computador"><b>' + ico("pasta", 16) + "Abrir projeto do computador</b><span>Um arquivo .opbim" + (srv && srv.pasta ? " — " + esc(srv.pasta) : "") + "</span></button>" +
          /* ÁREA DE TESTE (14/10/2026, pedido do Rogério): abrir o BIM sem criar obra nem projeto, para experimentar */
          '<button type="button" class="bp-bt" data-bp="teste"><b>' + ico("editar", 16) + "Área de teste</b><span>O BIM vazio, sem obra: experimente as ferramentas — nada entra em obra nenhuma</span></button>" +
        "</div>" +
        /* PROJETO EXEMPLO COMPLETO (25/10/2026): uma casa feita pelos comandos do sistema, com todas as disciplinas — abre numa
           obra de EXEMPLO (nunca na de um cliente); "Mostrar ao cliente" abre direto na Prancha Viva */
        '<section class="bp-sec bp-exemplo" data-bp-exemplo><h3>Projeto exemplo completo</h3><div class="bp-exemplo-linha">' +
          '<button type="button" class="bp-bt bp-ex" data-bp="exemplo" title="Abre o exemplo numa obra de exemplo, separada das suas obras">' +
            "<b>" + ico("obra", 16) + "Casa térrea 3 quartos — todas as disciplinas</b>" +
            "<span>Arquitetura, estrutura em concreto, aço e madeira, hidrossanitário, elétrica, mobiliário, terreno e orçamento 100 % — tudo feito pelos comandos do OrçaPRO. Abre numa obra de exemplo, separada das suas.</span></button>" +
          '<button type="button" class="bp-mini bp-mini-pri" data-bp="exemplo-cliente" title="Abre o exemplo e as pranchas dele na Prancha Viva: toque num ponto da folha e o 3D abre ali">' + ico("prancha", 14) + "Mostrar ao cliente</button>" +
        "</div></section>" +
        /* TEMPLATE DE INÍCIO (20/10/2026): começar do zero já pela disciplina — o cartão abre o Novo projeto com ele marcado */
        (global.BimTplInicio ? '<section class="bp-sec bp-tpls" data-bp-tpls><h3>Começar do zero com um template</h3><div class="bp-tpl-grade">' +
          global.BimTplInicio.grupos().map(function (gr) {
            return '<button type="button" class="bp-tpl" data-bp="tpl" data-id="' + esc(gr.id) + '" title="' + esc(gr.descricao) + '">' + ico(gr.icone, 18) +
              "<b>" + esc(gr.nome) + "</b><span>" + esc(gr.sub) + "</span></button>";
          }).join("") + '</div><p class="bp-sub" style="margin:8px 0 0">Níveis, vistas (plantas, cortes, elevações e 3D), penas e prancha do padrão RA prontos; o projeto abre na planta baixa.</p></section>' : "") +
        '<div class="bp-colunas">' +
          '<section class="bp-sec" data-bp-recentes><h3>Projetos recentes</h3>' + this._htmlRecentes(rec, srv) + "</section>" +
          '<section class="bp-sec" data-bp-modelos><h3>Modelos IFC salvos na obra</h3>' + this._htmlModelos() + "</section>" +
        "</div>" +
        '<p class="bp-rodape">Arraste para cá um projeto .opbim (abre o projeto) ou um modelo .ifc (abre sem projeto).</p>' +
      "</div>";
      el.innerHTML = h;
    },
    _htmlRecentes: function (rec, srv) {
      if (!rec.length) return '<p class="bp-vazio">Nenhum projeto ainda. O que você salvar aparece aqui, com a obra e a data.</p>';
      return '<table class="bp-tab"><tbody>' + rec.map(function (e) {
        var chips = [];
        if (e.sistema) chips.push('<span class="bp-chip" title="Guardado no banco deste aparelho: abre rápido, sem rede">Sistema</span>');
        if (e.computador) {
          var velho = e.computadorEm && e.salvoEm && e.computadorEm !== e.salvoEm;
          chips.push('<span class="bp-chip' + (velho ? " bp-velho" : "") + '" title="' + esc(e.caminho || e.computador) + '">' + (velho ? "Computador (cópia de " + esc(quando(e.computadorEm)) + ")" : "Computador") + "</span>");
        }
        if (e.baixado) chips.push('<span class="bp-chip" title="Versão online: o .opbim foi baixado para a pasta Downloads">Baixado (.opbim)</span>');
        return '<tr data-bp-proj="' + esc(e.id) + '"><td><b class="bp-nome">' + esc(e.nome) + '</b><div class="bp-sub">obra ' + esc(e.obraNome || obraNome(e.obraId) || "—") + "</div></td>" +
          '<td class="bp-quando">' + esc(quando(e.salvoEm)) + "</td>" +
          '<td class="bp-onde">' + (chips.join("") || '<span class="bp-sub">—</span>') + "</td>" +
          '<td class="bp-acoes-linha"><button type="button" class="bp-mini bp-mini-pri" data-bp="abrir-recente" data-id="' + esc(e.id) + '">Abrir</button>' +
            '<button type="button" class="bp-mini" data-bp="tirar" data-id="' + esc(e.id) + '" title="Tira dos recentes; o projeto continua no sistema">Tirar da lista</button>' +
            (srv && e.computador ? '<button type="button" class="bp-mini" data-bp="pasta" data-id="' + esc(e.id) + '" title="' + esc(e.caminho || "") + '">Abrir pasta</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
    },
    _htmlModelos: function () {
      var g = G(), regs = [], porObra = {};
      try { regs = global.Store.listar(emp(), "bim_modelos") || []; } catch (e) {}
      regs.forEach(function (r) { if (r && r.obraId) (porObra[r.obraId] = porObra[r.obraId] || []).push(r); });
      var obras = obrasVisiveis().filter(function (o) { return porObra[o.id]; });
      if (!obras.length) return '<p class="bp-vazio">Nenhuma obra tem modelo IFC guardado. Um IFC aberto dentro de uma obra fica guardado nela e aparece aqui.</p>';
      var sel = this._obraModelos;
      if (!sel || !porObra[sel]) sel = (g && g._bimSel && porObra[g._bimSel]) ? g._bimSel : obras[0].id;
      this._obraModelos = sel;
      return '<label class="bp-lbl">Obra<select data-bp-obra-modelos>' + obras.map(function (o) {
          return '<option value="' + esc(o.id) + '"' + (o.id === sel ? " selected" : "") + ">" + esc(o.nome || "Obra") + " (" + porObra[o.id].length + ")</option>";
        }).join("") + "</select></label>" +
        '<ul class="bp-lista">' + porObra[sel].map(function (r) { return "<li>" + esc(r.nome || "modelo") + (r.disciplina ? ' <span class="bp-sub">· ' + esc(r.disciplina) + "</span>" : "") + "</li>"; }).join("") + "</ul>" +
        '<button type="button" class="bp-mini bp-mini-pri" data-bp="abrir-modelos">Abrir os modelos desta obra</button>' +
        (global.PranchaVivaUI ? '<button type="button" class="bp-mini" data-bp="abrir-pviva" title="Abre os modelos desta obra e as pranchas dela na Prancha Viva: toque num ponto da folha e o 3D abre ali">' + ico("prancha", 14) + "Abrir na Prancha Viva</button>" : "") +
        '<p class="bp-sub" style="margin:6px 0 0">Abre a obra no alto, a modelagem guardada nela e os IFC que este aparelho tem guardados (sem pedir o arquivo).</p>';
    },
    _ligarInicio: function (el) {
      var self = this;
      el.addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("[data-bp]") : null;
        if (!b || !el.contains(b)) return;
        var a = b.getAttribute("data-bp"), id = b.getAttribute("data-id");
        if (a === "novo") self.novo();
        else if (a === "tpl") self.novo({ tpl: global.BimTplInicio ? global.BimTplInicio.primeiraDo(id) : null });
        else if (a === "abrir-sistema") self.abrirDoSistema();
        else if (a === "abrir-computador") self.abrirDoComputador();
        else if (a === "teste") self.areaTeste();
        else if (a === "exemplo") self.abrirExemplo();
        else if (a === "exemplo-cliente") self.abrirExemplo({ cliente: true });
        else if (a === "abrir-recente") self.abrirRecente(id);
        else if (a === "tirar") self.tirarDaLista(id);
        else if (a === "pasta") self.abrirPasta(id);
        else if (a === "abrir-modelos") self.abrirModelosDaObra(self._obraModelos);
        /* PRANCHA VIVA: os modelos da obra entram e a Prancha Viva abre por cima (a trava do módulo é do comando) */
        else if (a === "abrir-pviva") self.abrirModelosDaObra(self._obraModelos).then(function (ok) { if (ok && global.BimShell) { try { global.BimShell.executar("prancha-viva"); } catch (ePv) {} } });
        else if (a === "pviva") { self.esconderInicio(); if (global.BimShell) { try { global.BimShell.executar("prancha-viva"); } catch (ePv2) {} } }
        else if (a === "voltar") self.esconderInicio();
        else if (a === "salvar-como") self.salvarComo();
      });
      el.addEventListener("change", function (e) {
        var s = e.target;
        if (s && s.hasAttribute && s.hasAttribute("data-bp-obra-modelos")) { self._obraModelos = s.value; self._pintarInicio(); }
      });
      /* arrastar um arquivo para a tela inicial */
      el.addEventListener("dragover", function (e) { e.preventDefault(); el.classList.add("bp-arrastando"); });
      el.addEventListener("dragleave", function () { el.classList.remove("bp-arrastando"); });
      el.addEventListener("drop", function (e) {
        e.preventDefault(); el.classList.remove("bp-arrastando");
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        if (/\.opbim$/i.test(f.name)) { f.arrayBuffer().then(function (ab) { self.abrirBytes(new Uint8Array(ab), { arquivoNome: f.name.replace(/\.opbim$/i, "") }); }); return; }
        var b2 = B();
        if (b2 && b2.abrirArquivo) { self.entrarSemProjeto(); self.esconderInicio(); b2.abrirArquivo(f); }
      });
    },

    /* ==================================================== BARRA DE TÍTULO */
    _agendarTitulo: function () {
      var self = this;
      clearTimeout(this._tTit);
      this._tTit = setTimeout(function () { self.pintarTitulo(); }, 250);
    },
    pintarTitulo: function () {
      var raiz = null;
      try { raiz = (global.BimShell && global.BimShell.raiz) ? global.BimShell.raiz() : null; } catch (e) {}
      if (!raiz) return;
      var nome = raiz.querySelector(".rv-titulo-nome");
      if (!nome) return;
      this._css();
      var self = this, tag = nome.querySelector(".bp-titulo"), sel = nome.querySelector("select.rv-obra"), p = this._proj;
      if (!tag) {
        tag = document.createElement("span");
        tag.className = "bp-titulo";
        nome.insertBefore(tag, nome.firstChild);
        tag.addEventListener("click", function (e) {
          var b = e.target && e.target.closest ? e.target.closest("[data-bp-tit]") : null;
          if (!b) return;
          var a = b.getAttribute("data-bp-tit");
          if (a === "fechar") self._fecharComPergunta(function () { self.mostrarInicio(); });
          else if (a === "inicio") self.mostrarInicio();
        });
      }
      if (sel && !sel._bpOuve) { sel._bpOuve = 1; sel.addEventListener("change", function () { setTimeout(function () { self.pintarTitulo(); }, 0); }); }   /* a etiqueta da área de teste sai quando se escolhe uma obra */
      if (!p) {
        if (sel) sel.style.display = "";
        tag.innerHTML = '<button type="button" class="bp-tbt" data-bp-tit="inicio" title="A tela inicial do BIM: novo projeto, abrir projeto, recentes">' + ico("obra", 13) + "<span>Início</span></button>" +
          (this.emAreaTeste() ? '<span class="bp-titulo-obra" data-bp-teste title="O BIM sem obra: o que se modela aqui não entra em obra nenhuma. Para guardar, use Novo projeto.">Área de teste (sem obra)</span>' : "");
        return;
      }
      /* com projeto aberto a obra é a DELE: o seletor sai do caminho */
      if (sel) sel.style.display = "none";
      var sujo = this.sujo();
      tag.innerHTML = '<span class="bp-titulo-nome" data-bp-titulo-nome title="' + esc(p.nome) + '">' + esc(p.nome) + "</span>" +
        '<span class="bp-titulo-obra" data-bp-titulo-obra>obra ' + esc(p.obraNome || obraNome(p.obraId)) + "</span>" +
        (sujo ? '<span class="bp-sujo" data-bp-sujo title="Alterações não salvas">●</span>' : "") +
        '<button type="button" class="bp-tbt" data-bp-tit="fechar" title="Fechar o projeto (pergunta antes, se houver alteração não salva)">×</button>';
    },

    _css: function () {
      if (document.getElementById("bp-css")) return;
      var s = document.createElement("style");
      s.id = "bp-css";
      s.textContent =
        ".bp-inicio{position:absolute;inset:0;z-index:30;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 18px;" +
          "background:var(--rv-tela-2,#f7f9fb);color:var(--rv-painel-tx,#1a1a1a);font-size:13px;box-sizing:border-box}" +
        ".bp-inicio.bp-arrastando{outline:3px dashed var(--rv-foco,#1a6cb5);outline-offset:-12px}" +
        ".bp-cartao{width:min(1000px,100%);background:var(--rv-painel-bg,#f0f0f0);border:1px solid var(--rv-linha,#d4d4d4);border-radius:14px;" +
          "box-shadow:0 10px 30px var(--rv-sombra,rgba(0,0,0,.18));padding:20px 22px;box-sizing:border-box}" +
        ".bp-cab{display:flex;gap:14px;align-items:center;margin-bottom:16px}.bp-cab h2{margin:0;font-size:20px}" +
        ".bp-cab p{margin:3px 0 0;color:var(--rv-tx-fraco,#6a6a6a)}.bp-marca{display:flex;color:var(--rv-foco,#1a6cb5)}" +
        ".bp-acoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:16px}" +
        ".bp-bt{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:12px 14px;border-radius:12px;border:1px solid var(--rv-linha-forte,#b4b4b4);" +
          "background:var(--rv-tela,#fff);color:inherit;cursor:pointer;text-align:left;font:inherit;min-height:44px}" +
        ".bp-bt:hover{background:var(--rv-hover,#d8e6f2)}.bp-bt:focus-visible,.bp-mini:focus-visible,.bp-tbt:focus-visible{outline:2px solid var(--rv-foco,#1a6cb5);outline-offset:2px}" +
        ".bp-bt b{font-size:14px;display:flex;align-items:center;gap:8px}.bp-bt span{font-size:12px;color:var(--rv-tx-fraco,#6a6a6a)}" +
        ".bp-pri{border-color:var(--rv-foco,#1a6cb5);box-shadow:inset 0 0 0 1px var(--rv-foco,#1a6cb5)}" +
        ".bp-colunas{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:14px}@media (max-width:820px){.bp-colunas{grid-template-columns:1fr}}" +
        ".bp-sec{border:1px solid var(--rv-linha,#d4d4d4);border-radius:12px;padding:12px 14px;background:var(--rv-tela,#fff);min-width:0}" +
        ".bp-sec h3{margin:0 0 8px;font-size:14px}.bp-tab{width:100%;border-collapse:collapse}" +
        ".bp-tab td{padding:7px 4px;border-top:1px solid var(--rv-linha,#d4d4d4);vertical-align:top}.bp-tab tr:first-child td{border-top:0}" +
        ".bp-nome{word-break:break-word}.bp-sub{font-size:11.5px;color:var(--rv-tx-fraco,#6a6a6a)}.bp-quando{white-space:nowrap;font-size:12px}" +
        ".bp-chip{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:600;background:var(--rv-ativo,#cce4f7);margin:0 4px 3px 0;white-space:nowrap}" +
        ".bp-chip.bp-velho{background:transparent;border:1px dashed var(--rv-linha-forte,#b4b4b4)}" +
        ".bp-acoes-linha{text-align:right}.bp-acoes-linha .bp-mini{margin:0 0 4px 4px}" +
        ".bp-mini{font:inherit;font-size:12px;padding:4px 10px;min-height:28px;border-radius:8px;border:1px solid var(--rv-linha-forte,#b4b4b4);" +
          "background:var(--rv-painel-bg,#f0f0f0);color:inherit;cursor:pointer;white-space:nowrap}" +
        ".bp-mini:hover{background:var(--rv-hover,#d8e6f2)}.bp-mini-pri{border-color:var(--rv-foco,#1a6cb5);font-weight:700}" +
        ".bp-vazio{color:var(--rv-tx-fraco,#6a6a6a);margin:4px 0}.bp-lbl{display:block;font-size:12px;margin-bottom:6px}" +
        ".bp-lbl select{display:block;width:100%;margin-top:3px}.bp-lista{margin:4px 0 10px;padding-left:18px;max-height:150px;overflow:auto}" +
        ".bp-exemplo{margin-bottom:16px}.bp-exemplo-linha{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}.bp-ex{flex:1;min-width:240px;text-align:left}" +
        ".bp-exemplo-linha .bp-mini{align-self:center}" +
        ".bp-tpls{margin-bottom:16px}.bp-tpl-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}" +
        ".bp-tpl{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:10px 12px;min-height:44px;border-radius:10px;border:1px solid var(--rv-linha-forte,#b4b4b4);" +
          "background:var(--rv-painel-bg,#f0f0f0);color:inherit;font:inherit;text-align:left;cursor:pointer}" +
        ".bp-tpl:hover{background:var(--rv-hover,#d8e6f2)}.bp-tpl:focus-visible{outline:2px solid var(--rv-foco,#1a6cb5);outline-offset:2px}" +
        ".bp-tpl svg{color:var(--rv-foco,#1a6cb5)}.bp-tpl b{font-size:13px}.bp-tpl span{font-size:11.5px;color:var(--rv-tx-fraco,#6a6a6a)}" +
        ".bp-rodape{margin:12px 0 0;font-size:11.5px;color:var(--rv-tx-fraco,#6a6a6a);text-align:center}" +
        ".bp-titulo{display:inline-flex;align-items:center;gap:7px;min-width:0;max-width:62%;flex-shrink:0}" +
        ".bp-titulo-nome{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}" +
        ".bp-titulo-obra{opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}" +
        ".bp-sujo{color:#f59e0b;font-size:11px}" +
        ".bp-tbt{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:4px;border:1px solid rgba(255,255,255,.22);" +
          "background:rgba(255,255,255,.08);color:inherit;font:inherit;font-size:12px;cursor:pointer}.bp-tbt:hover{background:rgba(255,255,255,.18)}" +
        ".bp-tbt svg{width:13px;height:13px}";
      document.head.appendChild(s);
    }
  };

  global.BimProjetosUI = BimProjetosUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimProjetosUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
