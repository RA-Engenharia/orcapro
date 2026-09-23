/* =====================================================================
 * cronopilha.js — CronoPilha: a PILHA do desfazer/refazer em vários níveis
 * do cronograma (fatia 1C do planejador, "uso"). Motor PURO: sem DOM, sem
 * Store, sem relógio próprio (a hora vem de quem chama).
 *
 * Espec: ESPEC-planejador.md (rev. 4), §1.7, §2.9, §3.3 (1C) e o desenho
 * uso.md §3.2.
 *
 * O QUE A PILHA GUARDA: as FOTOS do alvo (`alvo.foto()`, o `canon` de
 * `{c: cronograma, a: avanço | null}`), uma por estado, e o rótulo de cada
 * passagem. `estados[cursor]` é o que está gravado agora (segundo esta
 * janela); `rotulos[k]` descreve a passagem k → k+1.
 *
 * ⚠ ESTADO DE TELA, NUNCA DO ORÇAMENTO. A pilha mora em `App._cronoPilha`,
 *   por alvo ("orc:<id>" | "plano:<obraId>"), e morre com a janela. Gravada
 *   no orçamento, cada clique mudaria o `atualizadoEm`, subiria a lista
 *   inteira de orçamentos à nuvem e esbarraria na trava do aprovado.
 * ⚠ A CHAVE É O ALVO, NUNCA `orcAtual.id` (achado 12.1 do desenho USO): o
 *   desfazer de um nível guardava a foto do PLANO em `_cronoDesf[orc.id]`, e
 *   só a conferência "depois" impedia aplicar a foto do orçamento sobre o
 *   plano (os dois têm o mesmo id de orçamento).
 * ⚠ NUNCA DESFAZ POR CIMA DO QUE MUDOU POR FORA. Antes de desfazer, quem
 *   chama tira a foto de AGORA (no plano, o `_cronoAlvo` relê o disco): se
 *   ela não é a do cursor, outra janela, a nuvem, um backup, a planilha ou
 *   um aparelho 1.2.81 gravou depois — desfazer apagaria aquela gravação.
 *   A pilha recusa e é zerada (regra 1 da USO §3.2). A marca `invalidada`
 *   ({motivo, em}) acrescenta o motivo e a hora ao recado (regra 2; E-MC3:
 *   o avanço gravado sem tela pela aprovação do boletim).
 * ⚠ ES5 (sem const/let/arrow/template/class/includes/find/Object.assign):
 *   o produto roda em WebView de instalador antigo.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* módulo irmão resolvido NA HORA da chamada (em Node, pelo require relativo) */
  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }

  /* JSON com as chaves em ORDEM (recursivo). ⚠ A ordem de inserção muda entre
     aparelhos, depois de um `JSON.parse` e depois de um desfazer que troca o
     conteúdo do objeto: comparar `JSON.stringify` puro acusaria mudança onde
     não houve. Mesmo tratamento do `JSON.stringify` para o resto (data vira
     texto pelo `toJSON`, `undefined` em objeto some, em lista vira null).
     ⚠ RÉGUA ÚNICA (espec I11): a foto do alvo, a pilha e o histórico usam esta. */
  function ordenar(v) {
    if (v && typeof v === "object" && typeof v.toJSON === "function") v = v.toJSON();
    if (Object.prototype.toString.call(v) === "[object Array]") {
      var a = [], i;
      for (i = 0; i < v.length; i++) a.push(ordenar(v[i]));
      return a;
    }
    if (v && typeof v === "object") {
      var ks = Object.keys(v).sort(), o = {}, j;
      for (j = 0; j < ks.length; j++) o[ks[j]] = ordenar(v[ks[j]]);
      return o;
    }
    return v;
  }
  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }

  /* 50 níveis por alvo, por janela (decisão k6 / §5.1): 51 estados. */
  var NIVEIS = 50;
  /* ⚠ E 16 MiB de texto por pilha: um plano de 60 KB (o teto) ocupa ~51 ×
     120 KB ≈ 6 MB no pior caso; o teto só existe para um cronograma fora da
     régua não segurar a memória da aba. O mais antigo sai primeiro. */
  var TETO_TEXTO = 16 * 1024 * 1024;

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  var CronoPilha = {
    pronto: true,
    NIVEIS: NIVEIS,
    TETO_TEXTO: TETO_TEXTO,

    /* a foto canônica: o texto que se compara e se guarda */
    canon: function (x) {
      var s = JSON.stringify(ordenar(x));
      return s === undefined ? "null" : s;
    },

    nova: function () { return { estados: [], rotulos: [], cursor: 0, invalidada: null }; },

    /* conserta uma pilha torta (estado de tela vindo de versão anterior da
       janela, ou mexido à mão no console) sem lançar */
    normalizar: function (p) {
      if (!p || typeof p !== "object" || ehLista(p)) return this.nova();
      if (!ehLista(p.estados)) p.estados = [];
      if (!ehLista(p.rotulos)) p.rotulos = [];
      var c = Number(p.cursor);
      if (!isFinite(c) || c < 0) c = 0;
      if (p.estados.length && c > p.estados.length - 1) c = p.estados.length - 1;
      if (!p.estados.length) c = 0;
      p.cursor = Math.floor(c);
      while (p.rotulos.length < Math.max(0, p.estados.length - 1)) p.rotulos.push("Alteração do cronograma");
      if (p.invalidada && typeof p.invalidada !== "object") p.invalidada = { motivo: String(p.invalidada), em: null };
      if (p.invalidada === undefined) p.invalidada = null;
      return p;
    },

    /* o tamanho em caracteres do que a pilha segura (a régua do teto) */
    bytes: function (p) {
      var n = 0, i;
      if (!p) return 0;
      for (i = 0; i < p.estados.length; i++) n += String(p.estados[i] == null ? "" : p.estados[i]).length;
      for (i = 0; i < p.rotulos.length; i++) n += String(p.rotulos[i] == null ? "" : p.rotulos[i]).length;
      return n;
    },

    /* UMA GRAVAÇÃO QUE MUDOU O ALVO entra na pilha. `antes`/`depois` são as
       fotos de antes e de depois dessa gravação.
       ⚠ Se o estado do cursor não é o `antes`, algo mudou por fora desde a
       última gravação desta janela: a pilha RECOMEÇA aqui (desfazer por cima
       daquilo apagaria o que veio de fora).
       ⚠ Editar depois de desfazer mata o refazer (é o que todo editor faz).
       `opts.niveis` limita (a chave `pilha` desligada deixa 1 nível: §6.2). */
    empilhar: function (p, antes, depois, rot, opts) {
      p = this.normalizar(p);
      opts = opts || {};
      if (antes == null || depois == null || antes === depois) return p;
      if (!p.estados.length || p.estados[p.cursor] !== antes) { p.estados = [antes]; p.rotulos = []; p.cursor = 0; }
      p.estados.length = p.cursor + 1;
      p.rotulos.length = p.cursor;
      p.estados.push(depois);
      p.rotulos.push(String(rot || "Alteração do cronograma"));
      p.cursor++;
      var niv = Number(opts.niveis) >= 1 ? Math.floor(Number(opts.niveis)) : NIVEIS;
      var teto = Number(opts.tetoTexto) > 0 ? Number(opts.tetoTexto) : TETO_TEXTO;
      while (p.estados.length > niv + 1 || (p.estados.length > 2 && this.bytes(p) > teto)) {
        p.estados.shift(); p.rotulos.shift(); p.cursor--;
      }
      p.invalidada = null;
      return p;
    },

    /* ⚠ AS DUAS CONFERÊNCIAS QUE NÃO CEDEM: a foto de agora tem de ser a do
       cursor, e a pilha não pode estar marcada como invalidada */
    podeDesfazer: function (p, atual) {
      return !!p && !p.invalidada && p.cursor > 0 && p.estados[p.cursor] === atual;
    },
    podeRefazer: function (p, atual) {
      return !!p && !p.invalidada && p.cursor < p.estados.length - 1 && p.estados[p.cursor] === atual;
    },

    /* por que NÃO dá: null (dá), "vazia" (nada nesta direção), "invalidada"
       (marca com motivo e hora) ou "mudou" (a foto de agora não é a do cursor) */
    impedimento: function (p, atual, sentido) {
      if (!p) return "vazia";
      if (p.invalidada) return "invalidada";
      var tem = sentido === "refazer" ? p.cursor < p.estados.length - 1 : p.cursor > 0;
      if (!tem) return "vazia";
      if (p.estados[p.cursor] !== atual) return "mudou";
      return null;
    },

    /* a foto que o desfazer/refazer restaura e o rótulo da passagem */
    alvo: function (p, sentido) {
      if (!p) return null;
      var k = sentido === "refazer" ? p.cursor + 1 : p.cursor - 1;
      return (k >= 0 && k < p.estados.length) ? p.estados[k] : null;
    },
    rotulo: function (p, sentido) {
      if (!p) return "";
      var k = sentido === "refazer" ? p.cursor : p.cursor - 1;
      return (k >= 0 && k < p.rotulos.length) ? String(p.rotulos[k] || "") : "";
    },
    /* depois que o salvar GRAVOU: o cursor anda e o estado dele vira o que
       FICOU. ⚠ O persistir pode materializar (modo executivo, sombra da 1A):
       guardar a foto pedida, e não a que ficou, faria o próximo refazer ser
       recusado à toa (risco 7 do desenho USO). */
    confirmar: function (p, sentido, ficou) {
      if (!p) return p;
      if (sentido === "refazer") { if (p.cursor < p.estados.length - 1) p.cursor++; }
      else if (p.cursor > 0) p.cursor--;
      if (ficou != null) p.estados[p.cursor] = ficou;
      return p;
    },

    /* marca de fora (regra 2 da USO §3.2; E-MC3): `em` é o ISO de quem marcou */
    invalidar: function (p, motivo, em) {
      if (!p) return p;
      p.invalidada = { motivo: String(motivo || "fora"), em: em == null ? null : String(em) };
      return p;
    },
    zerar: function (p) {
      if (!p || typeof p !== "object") return this.nova();
      p.estados = []; p.rotulos = []; p.cursor = 0; p.invalidada = null;
      return p;
    },
    contagem: function (p) {
      if (!p) return { desfazer: 0, refazer: 0 };
      return { desfazer: p.cursor, refazer: Math.max(0, p.estados.length - 1 - p.cursor) };
    },

    /* "14:32" de um ISO, na hora LOCAL de quem lê (null → "") */
    hora: function (iso) {
      if (!iso) return "";
      var d = new Date(String(iso));
      if (isNaN(d.getTime())) return "";
      return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    },

    /* O RECADO DA RECUSA (USO §1.4 e §3.2). Quem chama ZERA a pilha depois:
       o que ela guardava deixou de descrever o cronograma que está gravado.
       ⚠ Diz o que aconteceu e a porta que existe (o Histórico e a grade),
       nunca "tente de novo" — de novo daria a mesma recusa. */
    recadoRecusa: function (p, atual, sentido) {
      var imp = this.impedimento(p, atual, sentido), verbo = sentido === "refazer" ? "refazer" : "desfazer";
      if (!imp) return "";
      if (imp === "vazia") {
        return sentido === "refazer"
          ? "Nada para refazer nesta janela."
          : "Nada para desfazer nesta janela. O desfazer vale até fechar ou recarregar; o que foi feito antes está no Histórico.";
      }
      var inv = p.invalidada || {}, h = this.hora(inv.em);
      if (imp === "invalidada" && inv.motivo === "avanco-sem-tela") {
        /* ⚠ E-MC3 (revisão 4): o canal da medição gravou o avanço desta obra
           sem tela (aprovação do boletim). Desfazer por cima restauraria a
           foto de antes e apagaria o que o boletim lançou. */
        return "Não dá para " + verbo + ": o avanço desta obra foi gravado por outro caminho" + (h ? " às " + h : "") +
          " (aprovação de medição) — " + verbo + " agora apagaria aquela gravação. O que mudou está no Histórico; ajuste pela grade.";
      }
      if (imp === "invalidada" && inv.motivo === "aprovado") {
        return "O orçamento foi aprovado" + (h ? " às " + h : "") + ": o desfazer das alterações da proposta acabou nesta janela. Para mudar o prazo, crie uma revisão (ou, com a obra ligada, replaneje pelo plano de execução).";
      }
      if (imp === "invalidada") {
        return "Não dá para " + verbo + ": o cronograma foi gravado em outra janela (ou em outro aparelho)" + (h ? " às " + h : "") +
          " — " + verbo + " agora apagaria aquela gravação. O que mudou está no Histórico; ajuste pela grade.";
      }
      /* "mudou" sem marca: a foto de agora não é a do cursor, e esta janela não
         sabe por quê — o recado não afirma a causa (recado que mente) */
      return "Não dá para " + verbo + ": o cronograma mudou depois da última alteração desta janela (em outra janela, em outro aparelho ou por outro caminho) — " +
        verbo + " agora apagaria essa mudança. O que mudou está no Histórico; ajuste pela grade.";
    },

    /* o título dos botões ↶ ↷ (USO §1.4), em TEXTO PURO */
    tituloBotao: function (p, atual, sentido) {
      var c = this.contagem(p), imp = this.impedimento(p, atual, sentido);
      if (sentido === "refazer") {
        if (imp) return imp === "vazia" ? "Nada para refazer nesta janela." : this.recadoRecusa(p, atual, "refazer");
        return "Refazer: " + this.rotulo(p, "refazer") + " (Ctrl+Y ou Ctrl+Shift+Z). " + c.refazer + " alteraç" + (c.refazer === 1 ? "ão" : "ões") + " para refazer nesta janela.";
      }
      if (imp) return imp === "vazia" ? this.recadoRecusa(p, atual, "desfazer") : this.recadoRecusa(p, atual, "desfazer");
      return "Desfazer: " + this.rotulo(p, "desfazer") + " (Ctrl+Z). " + c.desfazer + " alteraç" + (c.desfazer === 1 ? "ão" : "ões") +
        " para desfazer nesta janela (até " + NIVEIS + ").";
    },

    _dep: dep
  };

  global.CronoPilha = CronoPilha;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoPilha;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
