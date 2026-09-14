/* =====================================================================
 * paineis.js — O TAMANHO DOS PAINÉIS DA TELA (Gantt, histograma,
 * macrofluxo, índice da Planilha): faixa, encaixe em linha, teto pela
 * janela e a preferência de cada pessoa. Motor PURO: não lê o DOM, não
 * grava no Store, roda em Node (tools/test-paineis.js).
 *
 * POR QUE ESTE ARQUIVO EXISTE (espec crono-janelas, fatia F3, 14/09/2026)
 * O dono pediu para redimensionar os painéis com o mouse. A medição
 * (REDIMENSIONAR.md) achou três defeitos que um divisor "ingênuo" traria,
 * e é deles que este motor é o dono:
 *  1) MEIA LINHA CORTADA. O corpo do Gantt tem linhas de 24 px e uma calha
 *     de 14 px para a barra de rolagem. Uma altura qualquer (ex.: 700) deixa
 *     a última linha pela metade — a pessoa não sabe se aquela etapa existe.
 *     Por isso a altura só anda em `k×24 + 14`.
 *  2) PREFERÊNCIA MAIOR QUE A TELA. Gravada num monitor de 1920 e aberta num
 *     notebook de 1366, uma altura de 900 px nasceria maior que a janela. Por
 *     isso o valor gravado é CRU e é preso na hora de USAR, contra a janela
 *     de agora — nunca na hora de gravar.
 *  3) MEDIDA ZERADA. Aba oculta mede 0 px; um motor que devolve 0 ou NaN faz
 *     o "Ajustar" cair no piso de 3 px/dia e a obra nasce com a escala de uma
 *     obra de 10 anos. Aqui qualquer entrada inválida vira `null` = "use o
 *     padrão", e o padrão é a fórmula da 1.2.77 (quem chama decide).
 *
 * ⚠ ESTADO DE TELA, NUNCA DADO DE ORÇAMENTO. A preferência mora numa chave
 *   própria do localStorage (como `orcapro:plCompacta`): não entra no Store,
 *   nas `prefs` (que estão em Nuvem.ENTIDADES e viajam), no backup nem na
 *   nuvem. Gravada no orçamento, mudaria o `atualizadoEm` a cada arrasto,
 *   sincronizaria à toa e esbarraria na trava do aprovado; nas `prefs`, a
 *   altura do monitor grande do escritório cairia no notebook da obra.
 * ⚠ POR PESSOA: o hash é de empresa + e-mail (djb2, sem e-mail em claro na
 *   chave). Duas pessoas no mesmo computador não herdam o tamanho uma da
 *   outra.
 * ⚠ SEM A FIAÇÃO DA ALÇA (js/paineisui.js, fatia F7) NENHUMA PREFERÊNCIA
 *   VALE (ver `opcoesGantt`): tamanho que ninguém consegue desfazer é trava
 *   sem porta. Apagar as alças devolve a tela da 1.2.77.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE = "orcapro:tela:paineis:v1";
  // os nomes que existem; qualquer outro é recusado (a chave é entrada de disco)
  var NUMERICOS = { gxAltura: 1, gxNomes: 1, hxAltura: 1, fxAltura: 1, idxLargura: 1 };

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function ehObj(v) { return !!v && typeof v === "object" && Object.prototype.toString.call(v) !== "[object Array]"; }
  /* número de tamanho: número finito > 0, ou texto só de dígitos ("300").
     ⚠ "12px", "", 0, NaN, undefined → null. `Number("12px")` é NaN, mas
     `parseFloat("12px")` é 12 — por isso NADA de parseFloat aqui: um valor
     com unidade vindo de outra versão não é o valor que se pensa que é. */
  function tam(v) {
    var x;
    if (typeof v === "number") x = v;
    else if (typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v)) x = Number(v);
    else return null;
    return (isFinite(x) && x > 0) ? x : null;
  }
  // medida de contexto: número finito > 0, senão null (0 de aba oculta = sem medida)
  function med(v) { var x = Number(v); return (v !== null && v !== "" && isFinite(x) && x > 0) ? x : null; }
  function nn(v, padrao) { var x = Number(v); return (v !== null && v !== "" && v !== undefined && isFinite(x) && x >= 0) ? x : padrao; }
  function prende(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\x22/g, "&quot;").replace(/\x27/g, "&#39;");
  }

  var Paineis = {
    CHAVE: CHAVE,
    ROWH: 24,
    BARRA: 14,
    CABECALHO: 38,
    /* ⚠ 120 é o piso que o `ganttProEstado` já aplicava (≈4 linhas). Aqui ele
       sai ENCAIXADO na grade de linha: 14 + 5×24 = 134. Um piso de 120 cru
       deixaria 106 px para as linhas = 4,4 linhas, a quinta cortada ao meio —
       o defeito 1 do cabeçalho reaparecendo no mínimo. */
    GX_MIN: 120,
    GX_TETO: 4000,
    NOMES_MIN: 96,
    NOMES_TETO: 600,
    NOMES_FRACAO: 0.55,
    NOMES_LARGURA_MIN: 560,
    HX: [100, 420],
    FX: [160, 4000],
    IDX: [180, 420],
    PASSO_PX: 4,

    /* "u" + djb2 em hexadecimal de `empresaId|email` (e-mail em minúsculas e
       sem espaço nas pontas: "Rogerio@x" e "rogerio@x " são a mesma pessoa). */
    hashUsuario: function (empresaId, email) {
      var s = String(empresaId == null ? "" : empresaId) + "|" + String(email == null ? "" : email).replace(/^\s+|\s+$/g, "").toLowerCase();
      var h = 5381, i;
      for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return "u" + (h >>> 0).toString(16);
    },

    // o registro inteiro no disco (ou null quando não existe / não é desta versão)
    _lerTudo: function (storage) {
      var raw = null, j = null;
      try { raw = storage && typeof storage.getItem === "function" ? storage.getItem(CHAVE) : null; } catch (e) { return { erro: true }; }
      if (raw == null || raw === "") return null;
      try { j = JSON.parse(raw); } catch (e2) { return { corrompido: true }; }
      if (!ehObj(j)) return { corrompido: true };
      if (j.v !== 1) return { outraVersao: true };
      if (!ehObj(j.u)) return { corrompido: true };
      return { dado: j };
    },

    /* A preferência de UMA pessoa, já limpa: só os nomes conhecidos, só com
       forma válida. Nunca lança (storage que lança, JSON quebrado → {}). */
    ler: function (storage, hash) {
      var out = {};
      if (typeof hash !== "string" || !/^u[0-9a-f]{1,8}$/.test(hash)) return out;
      var t = this._lerTudo(storage);
      if (!t || !t.dado || !own(t.dado.u, hash) || !ehObj(t.dado.u[hash])) return out;
      var p = t.dado.u[hash], k;
      for (k in NUMERICOS) {
        if (own(NUMERICOS, k) && own(p, k)) { var n = tam(p[k]); if (n !== null) out[k] = n; }
      }
      if (own(p, "gxColunas") && typeof p.gxColunas === "boolean") out.gxColunas = p.gxColunas;
      return out;
    },

    /* Grava (ou apaga, com `null`) UM tamanho de UMA pessoa. Devolve se gravou.
       ⚠ Não reescreve registro de OUTRA versão (`v` ≠ 1): uma versão mais
       nova do app pode ter mudado a forma, e a antiga passaria a apagar o que
       a nova gravou toda vez que alguém arrastasse uma alça. */
    gravar: function (storage, hash, nome, valor) {
      if (typeof hash !== "string" || !/^u[0-9a-f]{1,8}$/.test(hash)) return false;
      var ehCol = nome === "gxColunas";
      if (!ehCol && !own(NUMERICOS, nome)) return false;
      var v = null;
      if (valor !== null) {
        if (ehCol) { if (typeof valor !== "boolean") return false; v = valor; }
        else { v = tam(valor); if (v === null) return false; }
      }
      var t = this._lerTudo(storage);
      if (t && (t.erro || t.outraVersao)) return false;
      var j = (t && t.dado) ? t.dado : { v: 1, u: {} };
      var p = (own(j.u, hash) && ehObj(j.u[hash])) ? j.u[hash] : {};
      if (v === null) delete p[nome]; else p[nome] = v;
      var vazio = true, k;
      for (k in p) { if (own(p, k)) { vazio = false; break; } }
      if (vazio) delete j.u[hash]; else j.u[hash] = p;
      var nada = true;
      for (k in j.u) { if (own(j.u, k)) { nada = false; break; } }
      try {
        /* ⚠ "duplo clique volta ao padrão" APAGA a chave quando não sobra
           ninguém: a tela volta a ser a da 1.2.77 também no disco. */
        if (nada) storage.removeItem(CHAVE);
        else storage.setItem(CHAVE, JSON.stringify(j));
        return true;
      } catch (e) { return false; }
    },

    /* A FAIXA de um painel no contexto de agora: {min, max}, ou null quando
       não há o que redimensionar (ex.: a obra inteira já cabe no padrão). */
    faixa: function (nome, ctx) {
      ctx = ctx || {};
      if (nome === "gxAltura") {
        var rowH = med(ctx.rowH) || this.ROWH, barra = nn(ctx.barra, this.BARRA), cab = nn(ctx.cabecalho, this.CABECALHO);
        var min = barra + Math.ceil((this.GX_MIN - barra) / rowH) * rowH;
        var max = barra + Math.floor((this.GX_TETO - barra) / rowH) * rowH;
        var linhas = med(ctx.linhas);
        if (linhas !== null) {
          var maxL = Math.round(linhas) * rowH + barra;
          /* ⚠ obra que cabe inteira abaixo do mínimo: não há altura para
             escolher, e esticar só pintaria vazio embaixo da última linha */
          if (maxL < min) return null;
          max = Math.min(max, maxL);
        }
        var jan = med(ctx.janelaAltura);
        if (jan !== null) {
          // ⚠ FLOOR, não round: o teto da janela tem de caber, não "quase caber"
          var maxJ = barra + Math.floor((jan - cab - barra) / rowH) * rowH;
          max = Math.min(max, maxJ);
        }
        // janela menor que o mínimo: o mínimo vence (a página rola; o Gantt não some)
        return { min: min, max: Math.max(min, max) };
      }
      if (nome === "gxNomes") {
        var w = med(ctx.larguraWidget);
        // sem medida, ou widget estreito: a regra por proporção manda (ganttProLabelW)
        if (w === null || w < this.NOMES_LARGURA_MIN) return null;
        var mx = Math.min(this.NOMES_TETO, Math.round(this.NOMES_FRACAO * w) - nn(ctx.gradeW, 0));
        return { min: this.NOMES_MIN, max: Math.max(this.NOMES_MIN, mx) };
      }
      if (nome === "hxAltura") return { min: this.HX[0], max: this.HX[1] };
      if (nome === "fxAltura") {
        var nat = med(ctx.natural);
        return { min: this.FX[0], max: nat === null ? this.FX[1] : Math.max(this.FX[0], Math.min(this.FX[1], Math.round(nat))) };
      }
      if (nome === "idxLargura") return { min: this.IDX[0], max: this.IDX[1] };
      return null;
    },

    /* O VALOR USÁVEL de uma preferência, preso à faixa de agora. `null` = use
       o padrão. Nunca NaN. */
    limitar: function (nome, valor, ctx) {
      var v = tam(valor);
      if (v === null) return null;
      var f = this.faixa(nome, ctx);
      if (!f) return null;
      if (nome === "gxAltura") {
        var rowH = med(ctx && ctx.rowH) || this.ROWH, barra = nn(ctx && ctx.barra, this.BARRA);
        // ⚠ "nunca meia linha": encaixa no k mais próximo ANTES de prender
        v = barra + Math.round((v - barra) / rowH) * rowH;
      } else {
        v = Math.round(v);
      }
      return prende(v, f.min, f.max);
    },

    /* TECLADO na alça: setas andam uma LINHA (altura do Gantt) ou 4 px;
       Home/End vão ao mínimo e ao máximo. Enter devolve `null` (= padrão: a
       fiação apaga a preferência). Tecla sem papel devolve o valor atual
       preso à faixa. */
    passoTeclado: function (nome, tecla, valor, ctx) {
      if (tecla === "Enter") return null;
      var f = this.faixa(nome, ctx);
      var atual = tam(valor);
      if (!f) return atual;
      var passo = nome === "gxAltura" ? (med(ctx && ctx.rowH) || this.ROWH) : this.PASSO_PX;
      var base = atual !== null ? atual : f.min, novo = base;
      if (tecla === "ArrowDown" || tecla === "ArrowRight") novo = base + passo;
      else if (tecla === "ArrowUp" || tecla === "ArrowLeft") novo = base - passo;
      else if (tecla === "Home") novo = f.min;
      else if (tecla === "End") novo = f.max;
      var r = this.limitar(nome, Math.max(1, novo), ctx);
      return r === null ? atual : r;
    },

    /* O HTML da alça (a F7 liga os eventos por delegação em [data-pn-alca]).
       ⚠ `role="separator"` com aria-value*: sem isso a alça é um <div> mudo
       para quem navega por teclado ou leitor de tela. Nome fora da lista → "". */
    alcaHtml: function (nome, orient, rotulo, valor, min, max) {
      if (!own(NUMERICOS, nome)) return "";
      var o = (orient === "vertical" || orient === "v") ? "vertical" : "horizontal";
      function a(nm, v) { var x = Number(v); return (v !== null && v !== "" && v !== undefined && isFinite(x)) ? ' ' + nm + '="' + Math.round(x) + '"' : ""; }
      return '<div class="pn-alca pn-alca-' + (o === "vertical" ? "v" : "h") + '" role="separator" tabindex="0" aria-orientation="' + o + '"' +
        a("aria-valuenow", valor) + a("aria-valuemin", min) + a("aria-valuemax", max) +
        ' aria-label="' + esc(rotulo) + '" data-pn-alca="' + esc(nome) + '" title="' +
        esc("Arraste para mudar: " + String(rotulo == null ? "" : rotulo) + " · duplo clique volta ao padrão") + '"></div>';
    },

    /* MODO "PREENCHER" (janela destacada): a altura do corpo é a janela menos o
       que está acima do corpo e a legenda embaixo — encaixada em linha e presa
       ao tamanho natural da obra. `null` = sem medida (use o padrão). */
    alturaPreencher: function (ctx) {
      ctx = ctx || {};
      var jan = med(ctx.janelaAltura);
      if (jan === null) return null;
      var rowH = med(ctx.rowH) || this.ROWH, barra = nn(ctx.barra, this.BARRA);
      var disp = jan - nn(ctx.topoCorpo, 0) - nn(ctx.legenda, 0);
      var min = barra + Math.ceil((this.GX_MIN - barra) / rowH) * rowH;
      var r = barra + Math.floor((disp - barra) / rowH) * rowH;
      var linhas = med(ctx.linhas);
      if (linhas !== null) {
        var maxL = Math.round(linhas) * rowH + barra;
        if (maxL < min) return null;
        r = Math.min(r, maxL);
      }
      return Math.max(min, r);
    },

    /* O QUE O DESENHO DO GANTT RECEBE, decidido num lugar só — o `ui.js`
       (1ª pintura, pura) e o `app.js` (remedição) chamam ESTA função. Duas
       contas de "quais preferências valem" = a 1ª pintura com uma largura de
       nome e a repintura com outra, e o histograma alinhado com a errada.
       amb: {alcas (typeof PaineisUI), grade (typeof GanttGradeUI), janela
             (App._janela), janelaAltura, janelaLargura}
       ⚠ Os tamanhos só valem COM a fiação das alças (amb.alcas): sem ela
         ninguém consegue voltar ao padrão, e uma chave esquecida no disco
         deixaria a tela presa num tamanho sem porta. */
    opcoesGantt: function (prefs, amb) {
      prefs = ehObj(prefs) ? prefs : {};
      amb = amb || {};
      var alcas = amb.alcas === true, jan = ehObj(amb.janela) ? amb.janela : null;
      var larg = med(amb.janelaLargura);
      return {
        alcas: alcas,
        // ⚠ a alça de NOMES some abaixo de 820 px (celular); a de altura fica
        alcaNomes: alcas && (larg === null || larg >= 820),
        colunas: amb.grade === true && prefs.gxColunas !== false,
        modo: jan ? "preencher" : "px",
        painel: (jan && typeof jan.painel === "string") ? jan.painel : "",
        janelaAltura: med(amb.janelaAltura),
        labelPref: alcas ? tam(prefs.gxNomes) : null,
        alturaPref: alcas ? tam(prefs.gxAltura) : null,
        hxAltura: alcas ? tam(prefs.hxAltura) : null,
        fxAltura: alcas ? tam(prefs.fxAltura) : null
      };
    }
  };

  global.Paineis = Paineis;
  if (typeof module !== "undefined" && module.exports) module.exports = Paineis;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
