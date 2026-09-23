/* =====================================================================
 * ganttui.js — O MOTOR do Gantt interativo: zoom, rolagem, janela visível
 * (virtualização), régua de tempo e ARRASTAR barra. Geometria e estado
 * PUROS: não lê o DOM, não grava, não desenha. Roda em Node
 * (tools/test-ganttui.js).
 *
 * POR QUE ISTO É UM MÓDULO À PARTE (12/09/2026)
 * O pedido é "arrastar para editar, dar zoom e rolar para os dois lados".
 * Nada disso é desenho: é conta. Quantos dias andou o ponteiro, qual dia
 * fica embaixo do cursor depois do zoom, quais linhas precisam existir no
 * SVG, e — o que custa dinheiro — O QUE A SOLTURA GRAVA no orçamento.
 * Dentro do cronoexecui.js (1.800 linhas de desenho) essa conta ficaria
 * sem teste, e aqui errar por um dia muda a data que vai impressa na
 * proposta. A tela só orquestra: pega o evento, chama daqui, desenha.
 *
 * ⚠ AS REGRAS QUE ESTE MOTOR NÃO PODE QUEBRAR
 *  1) NUNCA reimplementar feriado nem dia útil. O eixo X já é dia ÚTIL (o
 *     mesmo índice do `Cronograma.estimar`), e a conversão índice → data sai
 *     do calendário do motor (`Cronograma.calendario(r)`), injetado. Uma
 *     segunda régua de dias aqui e a barra desenhada deixaria de casar com a
 *     data da proposta — é exatamente o defeito que a linha "hoje" do Gantt
 *     antigo tinha (contava só fim de semana e ficava 3 dias à frente).
 *  2) NUNCA um NaN sai daqui. Todo número de entrada vem de um evento de
 *     mouse, de um `scrollLeft` ou de um `getBoundingClientRect` — e um
 *     `pxDia` zerado (contêiner ainda sem largura, aba oculta) fazia
 *     `delta = (x - x0)/0 = Infinity`. Infinity vira `addDiasUteis(NaN)`, que
 *     data a etapa no DIA 0 DA OBRA, calado.
 *  3) O que a soltura grava sai daqui como LISTA DE OPERAÇÕES
 *     (`opsDoArrasto`), no formato que o motor já entende. A tela não decide
 *     campo nem mapa: decidir isso em dois lugares é como o "Depende de"
 *     acabou com dois parsers.
 *  4) Toda recusa vem com MOTIVO e PORTA. Trava sem saída faz a pessoa
 *     procurar a saída errada (foi assim que boletim virou "rejeitado" para
 *     se livrar de uma trava).
 *
 * SISTEMA DE COORDENADAS (a confusão que custa uma tarde)
 *   • `x` do ARRASTO é px a partir do DIA 0 do desenho (CONTEÚDO), não da
 *     janela. ⚠ De propósito: arrastar até a borda ROLA o desenho, e com
 *     coordenada de janela o delta pularia junto com a rolagem.
 *     Da janela para o conteúdo: `GanttUI.xConteudo(estado, xNaJanela)`.
 *   • `ancora` do ZOOM é px a partir da BORDA ESQUERDA da janela visível —
 *     é onde o cursor está, e é esse dia que não pode se mexer.
 *   • `dias` são ÍNDICES de dia útil (0 .. estado.dias); `linhas` são
 *     índices de linha (0 .. estado.linhas-1).
 * ===================================================================== */
(function (global) {
  "use strict";

  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  /* módulo irmão resolvido NA CHAMADA (planejador 1A): o motor e a rede
     carregam em outra ordem no index.html; em Node, o require relativo */
  function depG(nome, arq) {
    var g = (typeof global !== "undefined" && global) ? global : null, m = g ? g[nome] : null;
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }
  function ehArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function arr(v) { return ehArr(v) ? v : []; }
  /* ⚠ número que NÃO é número vira o padrão, nunca NaN (regra 2 do cabeçalho).
     `Number(undefined)`, `Number("")` e `Number("12px")` já chegaram aqui. */
  function fin(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function ehData(d) { return !!d && typeof d.getTime === "function" && !isNaN(d.getTime()); }
  function dd(n) { return ("0" + n).slice(-2); }
  /* chave local "AAAA-MM-DD" — ⚠ nunca `toISOString`: em UTC-3 ele volta um
     dia, e um dia a menos aqui é a etapa começando antes do que se arrastou.
     (A mesma regra do `Cronograma._ch`.) */
  function ch(d) { return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  function dmaS(s) { var p = String(s == null ? "" : s).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(s || ""); }
  /* dia absoluto desde a época, pelo calendário LOCAL. ⚠ Não se mede semana
     subtraindo milissegundos: onde há horário de verão a diferença deixa de
     ser múltiplo de 86.400.000 e a semana pula. */
  function nDia(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  /* o rótulo de uma linha no MESMO jeito do desenho: nº EAP abaixo da etapa,
     código na etapa. Um lugar só — o recado da soltura e o da digitação
     nomeiam a linha igual. */
  function nomeDe(n) {
    if (!n) return "";
    var pre = n.numero != null ? n.numero : (n.codigo != null ? n.codigo : "");
    return String((pre === "" ? "" : pre + " ") + (n.nome || "")).trim();
  }
  function diasTxt(n) { return n === 1 ? "1 dia útil" : n + " dias úteis"; }
  function ehFolha(no) { return !!no && (no.tipo === "subetapa" || no.tipo === "soltos"); }
  function ehObj(v) { return !!v && typeof v === "object" && !ehArr(v); }
  /* a linha T (planejador 1A): a tarefa sem preço, marcada pela tela ou pelo `acharNo` */
  function ehExtra(no) { return !!no && no.tipo === "extra"; }
  /* ⚠ apagar NÃO cria mapa. `delete obj(raiz, "tipos")[id]` punha `tipos: {}`
     na raiz do cronograma de ETAPA (onde esse mapa não existe) só para apagar
     uma chave que não estava lá — a forma gravada mudava sem nada ter mudado,
     e o "não mudou nada" da digitação passava a ser "mudou". */
  function tira(o, k, id) {
    var m = o ? o[k] : null;
    if (m && typeof m === "object" && !ehArr(m) && own(m, id)) delete m[id];
  }

  var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  /* NÍVEIS DE ZOOM — px por dia ÚTIL. Os números não são gosto:
       dia (28)       — cabe "28" dentro da barra e o dia tem alvo de clique;
       semana (12)    — uma semana de 5 dias = 60 px, um mês cabe na tela;
       mes (5)        — o ano da obra cabe em ~1.300 px (é a leitura de obra);
       trimestre (2,2)— a obra de 3 anos cabe numa tela de 1366.
     "auto" não está na lista: é calculado (cabe na largura, com piso). */
  var NIVEIS = [
    { id: "dia", px: 28, nome: "Dia", unidade: "dia" },
    { id: "semana", px: 12, nome: "Semana", unidade: "semana" },
    { id: "mes", px: 5, nome: "Mês", unidade: "mes" },
    { id: "trimestre", px: 2.2, nome: "Trimestre", unidade: "trimestre" }
  ];
  /* ⚠ PISO DO "auto": 3 px por dia útil, o mesmo `pxMin` do Gantt de hoje
     (cronoexecui.js). Abaixo dele uma semana vira 15 px e a subetapa de 2
     dias SOME do desenho. Abaixo do piso o desenho fica maior que a janela e
     o contêiner rola — a página nunca rola de lado. */
  var PX_AUTO_MIN = 3;
  var PX_MIN = 0.2, PX_MAX = 400;
  /* folga da virtualização: 2 linhas e 2 dias além da janela, senão a linha
     nasce no exato pixel em que aparece e a rolagem pisca */
  var FOLGA_DIAS = 2, FOLGA_LINHAS = 2;
  // dois rótulos de régua nunca a menos de 34 px (é o mesmo respiro do Gantt de hoje)
  var GAP_ROTULO = 34;
  /* teto de dias úteis para onde uma barra pode ser arrastada. O
     `Cronograma.addDiasUteis` tem guarda de 10 anos; passar dela devolveria
     uma data que o motor não sabe calcular. */
  var DIA_MAX = 3650;

  var TIPOS = ["mover", "inicio", "fim", "ligar"];

  /* motivos de célula que não se edita (DIGITAR, abaixo). Texto de LEITURA:
     vai no `title` da célula — "Nada foi gravado." só entra no recado de
     quem tentou gravar. */
  var MOTIVO_APROVADO = "Orçamento aprovado: esta é a data que foi ao cliente. Crie uma revisão (ou, com a obra ligada, inicie o plano de execução dela).";
  var MOTIVO_FOLHA_PADRAO = "As subetapas só se editam com “Detalhar o prazo pelas subetapas” ligado (aba Cronograma). No modo padrão elas são desenhadas dentro da duração da etapa.";
  var MOTIVO_NAO_CONFERI = "Não consegui conferir se a duração desta etapa é o vão das subetapas (modo executivo) — por segurança ela não se edita aqui. Recarregue a página (Ctrl+F5).";

  function nivelPorId(id) {
    for (var i = 0; i < NIVEIS.length; i++) if (NIVEIS[i].id === id) return NIVEIS[i];
    return null;
  }
  function idxNivel(id) {
    for (var i = 0; i < NIVEIS.length; i++) if (NIVEIS[i].id === id) return i;
    return -1;
  }

  var GanttUI = {
    NIVEIS: NIVEIS,
    TIPOS: TIPOS,
    PX_AUTO_MIN: PX_AUTO_MIN,
    GAP_ROTULO: GAP_ROTULO,
    FOLGA_DIAS: FOLGA_DIAS,
    FOLGA_LINHAS: FOLGA_LINHAS,
    DIA_MAX: DIA_MAX,

    nivel: function (id) { return nivelPorId(String(id == null ? "" : id)); },

    /* px por dia útil de um nível. "auto" (ou qualquer nome desconhecido) =
       cabe na largura, com o piso de 3 px/dia — ver PX_AUTO_MIN. */
    pxDeNivel: function (nivel, dias, largura) {
      var n = nivelPorId(String(nivel == null ? "" : nivel));
      if (n) return n.px;
      var d = Math.max(1, fin(dias, 1)), w = Math.max(1, fin(largura, 900));
      return clamp(Math.max(PX_AUTO_MIN, w / d), PX_MIN, PX_MAX);
    },

    /* ESTADO NORMALIZADO — devolve um objeto NOVO (nunca mexe no do
       chamador). Idempotente: normalizar duas vezes dá o mesmo. `pxDia` é
       DERIVADO do nível (por isso o "auto" acompanha a janela quando ela
       muda de tamanho), e a rolagem é presa aos limites de agora — senão,
       ao encolher a janela, o desenho ficava rolado para fora de si mesmo. */
    estado: function (o) {
      o = o || {};
      var nv = nivelPorId(String(o.nivel == null ? "" : o.nivel)) ? String(o.nivel) : "auto";
      var e = {
        nivel: nv,
        dias: Math.max(1, Math.round(fin(o.dias, 1))),
        linhas: Math.max(0, Math.round(fin(o.linhas, 0))),
        rowH: Math.max(1, fin(o.rowH, 24)),
        largura: Math.max(1, fin(o.largura, 900)),
        altura: Math.max(1, fin(o.altura, 400)),
        labelW: Math.max(0, fin(o.labelW, 300)),
        dpw: clamp(Math.round(fin(o.dpw, 5)), 1, 7),
        cal: o.cal || null,
        idPorLinha: arr(o.idPorLinha),
        arrasto: o.arrasto || null
      };
      /* ⚠ A ESCALA DO "AJUSTAR" NÃO ANDA ENQUANTO SE EDITA (frente cf-grade,
         16/09/2026). Roteiro do defeito (auditoria de tela da 1.2.80, galpão a
         1920, mouse real): o "auto" é largura ÷ dias da obra, e cada edição
         que muda o prazo muda os dias — o rótulo nov/26 foi de x=1714 para
         1651 na 1ª edição e para 1606 na 2ª; a barra do fim da obra andou
         ~100 px sem ninguém tocar nela, pulou para longe do mouse e o segundo
         arrasto errou. `diasAjuste` = os dias da obra QUANDO a edição começou
         (a fiação guarda no estado de TELA): o "auto" segue cabendo na
         largura (a janela que muda de tamanho ainda reajusta), mas para
         aquela obra — e só um comando de zoom (Ajustar, −, +, a escala)
         solta. `escalaMantida` diz à tela que o desenho já não é o "Ajustar"
         da obra de agora (sem isso o seletor afirmaria "Ajustar" mentindo). */
      var dA = Math.round(fin(o.diasAjuste, 0));
      e.diasAjuste = (nv === "auto" && dA >= 1) ? dA : null;
      e.pxDia = this.pxDeNivel(e.nivel, e.diasAjuste || e.dias, e.largura);
      e.escalaMantida = e.diasAjuste != null && Math.abs(e.pxDia - this.pxDeNivel(e.nivel, e.dias, e.largura)) > 1e-9;
      var lim = this.limites(e);
      e.scrollLeft = clamp(fin(o.scrollLeft, 0), 0, lim.maxScrollLeft);
      e.scrollTop = clamp(fin(o.scrollTop, 0), 0, lim.maxScrollTop);
      e.larguraConteudo = e.dias * e.pxDia;
      e.alturaConteudo = e.linhas * e.rowH;
      return e;
    },

    limites: function (e) {
      var px = fin(e && e.pxDia, 1);
      if (!(px > 0)) px = 1;
      return {
        maxScrollLeft: Math.max(0, fin(e && e.dias, 1) * px - fin(e && e.largura, 1)),
        maxScrollTop: Math.max(0, fin(e && e.linhas, 0) * fin(e && e.rowH, 1) - fin(e && e.altura, 1))
      };
    },

    // conversões (conteúdo ⇄ janela ⇄ dia/linha)
    xDoDia: function (e, d) { return fin(d, 0) * fin(e && e.pxDia, 1); },
    diaEmX: function (e, x) { var px = fin(e && e.pxDia, 1); return px > 0 ? fin(x, 0) / px : 0; },
    xConteudo: function (e, xJanela) { return fin(xJanela, 0) + fin(e && e.scrollLeft, 0); },
    yConteudo: function (e, yJanela) { return fin(yJanela, 0) + fin(e && e.scrollTop, 0); },
    linhaEmY: function (e, yConteudo) {
      var h = fin(e && e.rowH, 24), n = fin(e && e.linhas, 0);
      if (!(h > 0) || !(n > 0)) return -1;
      var i = Math.floor(fin(yConteudo, 0) / h);
      return (i < 0 || i >= n) ? -1 : i;
    },

    /* ZOOM com ÂNCORA: o dia que está embaixo do cursor continua embaixo do
       cursor depois do zoom. `dir` = +1 aproxima, −1 afasta, ou o nome de um
       nível ("dia", "semana", "mes", "trimestre", "auto"). `ancora` = px a
       partir da borda esquerda da janela (sem ela, o meio da janela).
       Devolve {nivel, pxDia, scrollLeft, mudou, motivo, dia} — a tela aplica.
       ⚠ No limite NÃO se troca o nível em silêncio: sai `mudou:false` com o
       motivo, porque um botão que não faz nada e não diz nada é lido como
       travamento do app. */
    zoom: function (estado, dir, ancora) {
      var e = this.estado(estado);
      var a = clamp(fin(ancora, e.largura / 2), 0, e.largura);
      var diaAnc = e.pxDia > 0 ? (e.scrollLeft + a) / e.pxDia : 0;
      var alvo = this._nivelAlvo(e, dir);
      var px = this.pxDeNivel(alvo.id, e.dias, e.largura);
      var sl = diaAnc * px - a;
      var lim = this.limites({ dias: e.dias, pxDia: px, largura: e.largura, linhas: e.linhas, rowH: e.rowH, altura: e.altura });
      sl = clamp(fin(sl, 0), 0, lim.maxScrollLeft);
      return { nivel: alvo.id, pxDia: px, scrollLeft: sl, dia: diaAnc,
        mudou: alvo.id !== e.nivel || px !== e.pxDia, motivo: alvo.motivo || "" };
    },

    /* de que nível para qual. Vindo do "auto" (px calculado), o passo cai no
       nível NOMEADO vizinho do px de agora — senão aproximar de um "auto" de
       9 px saltaria para 28 px, três níveis de uma vez. */
    _nivelAlvo: function (e, dir) {
      var d = dir, i, k;
      if (typeof d === "string") {
        var s = d.toLowerCase();
        if (s === "auto") return { id: "auto" };
        if (nivelPorId(s)) return { id: s };
        if (s === "mais" || s === "+" || s === "in") d = 1;
        else if (s === "menos" || s === "-" || s === "out") d = -1;
        else return { id: e.nivel, motivo: "nível de zoom desconhecido: " + dir };
      }
      d = fin(d, 0);
      if (!d) return { id: e.nivel };
      var atual = idxNivel(e.nivel);
      if (atual < 0) {   // veio do "auto": acha o vizinho pelo px de agora
        if (d > 0) {
          // ⚠ de trás para a frente e PARA no primeiro: o vizinho é o MENOR px
          // ainda maior que o de agora. Sem o break, um "auto" de 9 px saltava
          // para 28 (três níveis de uma vez) e a pessoa perdia o lugar na obra.
          for (i = NIVEIS.length - 1; i >= 0; i--) if (NIVEIS[i].px > e.pxDia + 1e-9) { k = i; break; }
          /* ⚠ nenhum nível é maior que o "auto" de agora: a obra é curta e já
             cabe folgada na largura. Fica no "auto" — trocar para "dia" (28 px)
             ali seria AFASTAR com o botão de aproximar. */
          if (k == null) return { id: e.nivel, motivo: "Já está no maior zoom — a obra inteira cabe na largura da tela." };
          return { id: NIVEIS[k].id };
        }
        for (i = 0; i < NIVEIS.length; i++) if (NIVEIS[i].px < e.pxDia - 1e-9) { k = i; break; }
        if (k == null) return { id: e.nivel, motivo: "Já está no menor zoom — não há como afastar mais." };
        return { id: NIVEIS[k].id };
      }
      var novo = atual - (d > 0 ? 1 : -1);
      if (novo < 0) return { id: NIVEIS[0].id, motivo: "Já está no maior zoom (dia: " + NIVEIS[0].px + " px por dia útil)." };
      if (novo > NIVEIS.length - 1) return { id: NIVEIS[NIVEIS.length - 1].id, motivo: "Já está no menor zoom (trimestre) — a obra inteira cabe na tela." };
      return { id: NIVEIS[novo].id };
    },

    // rolagem por delta (roda do mouse, shift+roda, teclado), presa aos limites
    rolar: function (estado, dx, dy) {
      var e = this.estado(estado), lim = this.limites(e);
      var sl = clamp(e.scrollLeft + fin(dx, 0), 0, lim.maxScrollLeft);
      var st = clamp(e.scrollTop + fin(dy, 0), 0, lim.maxScrollTop);
      return { scrollLeft: sl, scrollTop: st, mudou: sl !== e.scrollLeft || st !== e.scrollTop };
    },

    // põe um dia no meio da janela (usado por "ir para hoje" / "ir para a etapa")
    centralizarDia: function (estado, d) {
      var e = this.estado(estado), lim = this.limites(e);
      return { scrollLeft: clamp(fin(d, 0) * e.pxDia - e.largura / 2, 0, lim.maxScrollLeft) };
    },

    /* JANELA VISÍVEL (virtualização). Devolve o intervalo de dias e de linhas
       a desenhar, com FOLGA de 2 de cada lado.
       ⚠ O recorte de DIAS vale para a RÉGUA e para a GRADE. A barra de uma
       linha visível se desenha INTEIRA (o SVG corta o que sobra): recortada
       pelo intervalo de dias, a barra que começa antes da janela sumiria
       justamente quando a pessoa rola até ela.
       Sem linha nenhuma sai {primeiraLinha:0, ultimaLinha:-1} — intervalo
       vazio, e não a linha 0 desenhada sobre nada. */
    janela: function (estado) {
      var e = this.estado(estado);
      var px = e.pxDia > 0 ? e.pxDia : 1;
      var d0 = Math.floor(e.scrollLeft / px) - FOLGA_DIAS;
      var d1 = Math.ceil((e.scrollLeft + e.largura) / px) + FOLGA_DIAS;
      var l0 = Math.floor(e.scrollTop / e.rowH) - FOLGA_LINHAS;
      var l1 = Math.ceil((e.scrollTop + e.altura) / e.rowH) + FOLGA_LINHAS;
      return {
        primeiroDia: clamp(d0, 0, e.dias),
        ultimoDia: clamp(d1, 0, e.dias),
        primeiraLinha: e.linhas ? clamp(l0, 0, e.linhas - 1) : 0,
        ultimaLinha: e.linhas ? clamp(l1, 0, e.linhas - 1) : -1,
        linhas: e.linhas, dias: e.dias, pxDia: px, rowH: e.rowH
      };
    },

    // a unidade da régua num nível ("auto" escolhe pelo px de agora)
    unidadeDe: function (nivel, pxDia) {
      var n = nivelPorId(String(nivel == null ? "" : nivel));
      if (n) return n.unidade;
      var p = fin(pxDia, PX_AUTO_MIN);
      return p >= 18 ? "dia" : (p >= 7 ? "semana" : (p >= 3 ? "mes" : "trimestre"));
    },

    /* RÉGUA DE TEMPO da janela visível. `cal` = `Cronograma.calendario(r)`
       (injetado; sem ele a régua sai vazia, nunca inventada). `unidade`
       força uma unidade — é assim que a tela desenha DUAS faixas (meses em
       cima, semanas embaixo) com uma função só.
       Devolve {unidade, passo, pxUnidade, marcas:[{dia, x, data, rotulo,
       forte, semana}]}, com `x` em px de CONTEÚDO.
       ⚠ O passo é contado no índice ABSOLUTO da unidade (ano×12+mês, semana
       desde a época), nunca a partir da janela: contado da janela, o rótulo
       trocava de lugar a cada pixel de rolagem.
       ⚠ E a cadência do passo é uma ESTIMATIVA (mês tem 18 a 23 dias úteis);
       por isso, depois dela, um segundo corte em px REAIS tira o rótulo que
       ainda assim ficaria a menos de 34 px do anterior. Sem ele, "out/26" e
       "nov/26" se sobrepunham num mês de Carnaval. */
    regua: function (estado, cal, unidade) {
      var e = this.estado(estado), self = this;
      cal = cal || e.cal;
      var uni = unidade ? String(unidade) : this.unidadeDe(e.nivel, e.pxDia);
      var mult = uni === "dia" ? 1 : (uni === "semana" ? e.dpw : (uni === "mes" ? e.dpw * 4.345 : e.dpw * 13.04));
      var pxU = e.pxDia * mult;
      var out = { unidade: uni, passo: Math.max(1, Math.ceil(GAP_ROTULO / (pxU > 0 ? pxU : GAP_ROTULO))), pxUnidade: pxU, marcas: [] };
      if (!cal || typeof cal.dia !== "function") return out;
      var jan = this.janela(e), k, z, ant = null, xRot = -1e9, giros = 0;
      var pxD = e.pxDia > 0 ? e.pxDia : 1;
      if (jan.primeiroDia > 0) {
        var dAnt = cal.dia(jan.primeiroDia - 1);
        if (ehData(dAnt)) ant = this._indiceUnidade(dAnt, uni, jan.primeiroDia - 1);
      }
      for (k = jan.primeiroDia; k <= jan.ultimoDia && giros++ < 4000; k++) {
        var d = cal.dia(k);
        if (!ehData(d)) break;
        var iu = this._indiceUnidade(d, uni, k);
        var inicioDaObra = k === 0;
        if (!inicioDaObra && ant !== null && iu === ant) continue;   // ainda dentro da mesma unidade
        ant = iu;
        // o dia 0 é marca sempre: é o começo da obra, e sem ele a 1ª faixa nasce sem rótulo
        if (!inicioDaObra && iu % out.passo !== 0) continue;
        var x = k * e.pxDia;
        var m = { dia: k, x: x, data: d, forte: self._forteDe(d, uni), semana: Math.floor(k / e.dpw) + 1,
          rotulo: self._rotuloDe(d, uni) };
        if (x - xRot < GAP_ROTULO) m.rotulo = ""; else xRot = x;
        out.marcas.push(m);
      }
      /* ⚠ O RÓTULO FIXO DA BORDA ESQUERDA (a "faixa de período" do MS Project).
         A marca só nasce na VIRADA da unidade, então uma janela inteira DENTRO
         de um mês ficava SEM MÊS E SEM ANO — e é justamente rolando que a
         pessoa perde a referência (o pedido do dono foi "rolar para um lado e
         para o outro"). Medido numa tela de 390 px no zoom "Dia": 37 das 58
         posições de rolagem não tinham nem mês nem ano em lugar nenhum.
         ⚠ Sai SEPARADO das marcas de propósito: quem desenha o põe grudado na
         borda da janela, FORA do SVG que rola. Dentro do SVG ele andaria junto
         com o desenho e sumiria de novo no pixel seguinte.
         E ele CALA quando já há rótulo colado na borda: dois rótulos a menos de
         34 px é a sobreposição que o GAP_ROTULO existe para evitar. */
      var dvI = clamp(Math.floor(e.scrollLeft / pxD), 0, e.dias);
      var dv = cal.dia(dvI);
      if (ehData(dv)) {
        var colado = false;
        for (z = 0; z < out.marcas.length; z++) {
          if (!out.marcas[z].rotulo) continue;
          if (out.marcas[z].x >= e.scrollLeft - 1 && out.marcas[z].x < e.scrollLeft + GAP_ROTULO) { colado = true; break; }
        }
        if (!colado) out.fixa = { dia: dvI, x: e.scrollLeft, data: dv, rotulo: this._rotuloDe(dv, uni),
          forte: this._forteDe(dv, uni), semana: Math.floor(dvI / e.dpw) + 1 };
      }
      return out;
    },

    _indiceUnidade: function (d, uni, k) {
      /* ⚠ no nível DIA a unidade é o dia ÚTIL (o índice k), não o dia de
         calendário: contando pelo calendário, a cadência de 2 em 2 pulava o
         fim de semana torto e a régua saía "01 · 04 · 10 · 14" — números
         irregulares que ninguém lê como escala. */
      if (uni === "dia") return fin(k, nDia(d));
      if (uni === "semana") return Math.floor((nDia(d) + 3) / 7);   // +3: a época é quinta; a semana começa na segunda
      if (uni === "trimestre") return d.getFullYear() * 4 + Math.floor(d.getMonth() / 3);
      return d.getFullYear() * 12 + d.getMonth();
    },
    _rotuloDe: function (d, uni) {
      if (uni === "dia") return dd(d.getDate());
      if (uni === "semana") return dd(d.getDate()) + "/" + dd(d.getMonth() + 1);
      if (uni === "trimestre") return "T" + (Math.floor(d.getMonth() / 3) + 1) + "/" + String(d.getFullYear()).slice(2);
      return MES[d.getMonth()] + "/" + String(d.getFullYear()).slice(2);
    },
    // "forte" = a linha que o olho usa para se achar (começo de semana, de mês, de ano)
    _forteDe: function (d, uni) {
      if (uni === "dia") return d.getDay() === 1 || d.getDate() === 1;
      if (uni === "semana") return d.getDate() <= 7;
      return d.getMonth() === 0;
    },

    /* ------------------------------------------------------------------
       ARRASTAR
       ------------------------------------------------------------------ */

    alvoDoNo: function (no) { return (no && (no.tipo === "subetapa" || no.tipo === "soltos")) ? "folha" : (ehExtra(no) ? "extra" : "etapa"); },

    /* O CONTEXTO da linha, lido do resultado do motor — para a tela não ter
       de decidir o que é resumo nem o que é vão. `detalhe` é o mesmo da
       `CronoExecUI.linhas` ("etapa" | "subetapa" | "servico").
       ⚠ `resumo` casa com o PIXEL: é resumo quem é DESENHADO como resumo
       (papel "resumo" e detalhe diferente de "etapa"), que é a regra do
       cronoexecui.js. No detalhe "etapa" a mesma etapa é barra comum — e aí
       ela se MOVE (a data é dela), mas não se REDIMENSIONA (a duração é o
       vão das subetapas). */
    ctxDoNo: function (r, no, detalhe) {
      var det = String(detalhe || (r && r.exec && r.exec.detalhe) || "etapa");
      var exec = !!(r && r.exec && r.exec.rede === true);
      var out = { exec: exec, detalhe: det, resumo: false, vao: false, escala: no ? no.escala : null, travado: false };
      // a tarefa sem preço (planejador 1A): nunca resumo, nunca vão — nenhum modo a trava
      if (ehExtra(no)) { out.extra = true; return out; }
      var nos = arr(r && r.atividades), id = no && no.id;
      for (var i = 0; i < nos.length; i++) {
        if (nos[i].id !== id) continue;
        if (out.escala == null) out.escala = nos[i].escala;
        if (nos[i].papel === "resumo") { out.resumo = det !== "etapa"; out.vao = exec && !nos[i].marco; }
        break;
      }
      return out;
    },

    /* O QUE ESTA BARRA PERMITE — {mover, inicio, fim, ligar, motivo}.
       Cada `false` tem motivo com a PORTA (regra 4 do cabeçalho). */
    arrastavel: function (no, ctx) {
      ctx = ctx || {};
      var p = { mover: false, inicio: false, fim: false, ligar: false, motivo: "" };
      if (!no || no.id == null) { p.motivo = "linha sem barra para arrastar."; return p; }
      if (ctx.travado) {
        p.motivo = "Orçamento aprovado: esta é a data que foi ao cliente e ela não muda aqui. Crie uma revisão — ou, se a obra existe, replaneje pelo plano de execução dela.";
        return p;
      }
      if (no.tipo === "servico") {
        p.motivo = "O serviço não se arrasta: a barra dele é a fatia da subetapa em que ele está. Mude a duração da subetapa, ou a quantidade do serviço na planilha.";
        return p;
      }
      if (no.inicio == null) { p.motivo = "Este item não tem quantidade — sem barra para arrastar."; return p; }
      var folha = this.alvoDoNo(no) === "folha";
      if (folha && !ctx.exec) {
        p.motivo = "No modo padrão a subetapa é desenhada DENTRO da duração da etapa — arrastá-la não mudaria o prazo. Ligue “Detalhar o prazo pelas subetapas” (aba Parâmetros) para a subetapa mandar na data.";
        return p;
      }
      if (folha && ctx.escala && ctx.escala !== "exata") {
        p.motivo = ctx.escala === "sem-vao"
          ? "As subetapas desta etapa são todas marco: não há vão para arrastar dentro dele."
          : "O desenho desta subetapa está comprimido dentro da duração da etapa — um dia na tela não é um dia da rede. Ajuste a duração da etapa antes de arrastar.";
        return p;
      }
      // ligar é a única coisa que um resumo aceita: o elo é da ETAPA, não do vão
      p.ligar = true;
      /* ⚠ O QUE JÁ ACONTECEU NÃO SE ARRASTA (planejador 2A). A tarefa com
         avanço lançado — concluída ou em andamento — tem data REAL, e data
         real é fato, não plano: arrastar a barra dela reescreveria como
         "planejado" um dia em que a equipe esteve na obra. Quem muda a data
         real é o modo Avançar (as colunas Início real e Fim real), e o recado
         diz isso — trava sem porta empurra a pessoa a procurar a saída errada.
         ⚠ O estado vem do MOTOR (`no.avanco.estado`, §1.8), que já leu e
         validou o registro (`f` preenchido ⇒ concluída, O24): ler o registro
         de avanço aqui seria uma segunda validação, e a barra diria uma coisa
         e o cálculo outra. */
      var av = no.avanco;
      if (av && (av.estado === "concluida" || av.estado === "andamento")) {
        p.motivo = av.estado === "concluida"
          ? "Esta tarefa está CONCLUÍDA (terminou em " + (av.fimReal ? dmaS(av.fimReal) : "data lançada") +
            "): a data dela é fato, não plano. Para corrigir, use o modo Avançar e mude o início ou o fim real."
          : "Esta tarefa JÁ COMEÇOU (em " + (av.iniReal ? dmaS(av.iniReal) : "data lançada") +
            "): a data dela vem do que foi lançado. Para corrigir, use o modo Avançar e mude o início ou o fim real.";
        return p;
      }
      if (ctx.resumo) {
        p.motivo = "A etapa com subetapas é o resumo delas: ela começa com a primeira e termina com a última. Arraste as subetapas — ou desligue “Detalhar o prazo pelas subetapas” para a etapa voltar a ter duração própria.";
        return p;
      }
      if (folha && !arr(no.preds).length) {
        // sem elo não há onde pendurar o deslocamento: a folha nasce colada na etapa
        p.fim = !no.marco;
        p.motivo = "Esta subetapa não depende de nenhuma outra — ela começa junto com a etapa. Escreva o “Depende de” dela (ou arraste uma ligação a partir de outra subetapa) para poder movê-la.";
        return p;
      }
      p.mover = true;
      if (no.marco) { p.motivo = "Marco não tem duração (é um evento, não um serviço) — arraste-o para mudar a data."; return p; }
      if (ctx.vao) { p.motivo = "No modo executivo a duração desta etapa é o vão das subetapas — arraste a borda de uma subetapa, ou desligue “Detalhar o prazo pelas subetapas”."; return p; }
      p.inicio = true; p.fim = true;
      return p;
    },

    /* ABRE o arrasto. `x0` em px de CONTEÚDO (ver o cabeçalho).
       O objeto devolvido é o que a tela guarda em `estado.arrasto`; ele
       carrega o PISO (o dia antes do qual a barra não pode ir) e o motivo
       desse piso, porque na hora da recusa é isso que a pessoa precisa ler. */
    iniciarArrasto: function (no, tipo, x0, ctx) {
      ctx = ctx || {};
      var t = String(tipo == null ? "" : tipo).toLowerCase();
      if (TIPOS.indexOf(t) < 0) return { valido: false, motivo: "tipo de arrasto desconhecido: " + tipo, tipo: t };
      var perm = this.arrastavel(no, ctx);
      if (!perm[t]) return { valido: false, motivo: perm.motivo || "esta barra não se arrasta.", tipo: t, id: no && no.id };
      var folha = this.alvoDoNo(no) === "folha";
      var ini = Math.round(fin(no.inicio, 0)), fim = Math.round(fin(no.fim, ini));
      var piso = 0, pisoPor = "obra";
      if (folha) {
        // a subetapa não começa antes da própria etapa (a rede interna prende em 0)
        piso = ini - Math.round(fin(no.inicioRede, 0));
        pisoPor = "etapa";
      } else if (no.restricao && no.restricao.inicioRede != null) {
        piso = Math.round(fin(no.restricao.inicioRede, 0));
        pisoPor = piso > 0 ? "rede" : "obra";
      } else {
        piso = ini;
        pisoPor = piso > 0 ? "rede" : "obra";
      }
      return { valido: true, tipo: t, id: no.id, alvo: folha ? "folha" : "etapa",
        x0: fin(x0, 0), inicio0: ini, fim0: fim, duracao0: Math.max(0, fim - ini),
        marco: !!no.marco, piso: Math.max(0, piso), pisoPor: pisoPor, etapaId: no.etapaId != null ? no.etapaId : no.id };
    },

    /* MOVE o arrasto em andamento. `x` em px de CONTEÚDO; `y` só é lido no
       tipo "ligar" (a linha embaixo do ponteiro). Sem o 4º argumento usa
       `estado.arrasto`.
       O SNAP é em dia ÚTIL por construção: o eixo X já é o índice de dia útil
       do motor, então `delta` arredondado é um número inteiro de dias de
       obra — feriado e fim de semana ficam com o calendário do motor, que é
       quem transforma o índice em data.
       Devolve SEMPRE números coerentes, mesmo recusando: a barra-fantasma
       para na borda em vez de sumir (`valido:false` + `motivo`). */
    moverArrasto: function (estado, x, y, arrasto) {
      var e = this.estado(estado);
      var a = arrasto || e.arrasto;
      if (!a || !a.valido) return { valido: false, motivo: (a && a.motivo) || "nenhum arrasto em andamento.", deltaDias: 0, mudou: false };
      var px = e.pxDia > 0 ? e.pxDia : 0;
      var delta = px > 0 ? Math.round((fin(x, a.x0) - a.x0) / px) : 0;
      if (!isFinite(delta)) delta = 0;
      var res = { valido: true, motivo: "", tipo: a.tipo, id: a.id, alvo: a.alvo, deltaDias: delta,
        novoInicio: a.inicio0, novaDuracao: a.duracao0, novoFim: a.fim0, dataInicio: null, dataFim: null, mudou: false };

      if (a.tipo === "ligar") {
        res.deltaDias = 0;
        res.linhaAlvo = this.linhaEmY(e, fin(y, -1));
        res.alvoId = (res.linhaAlvo >= 0 && e.idPorLinha.length > res.linhaAlvo) ? e.idPorLinha[res.linhaAlvo] : null;
        if (res.alvoId == null) { res.valido = false; res.motivo = "Solte a ligação em cima de outra barra."; }
        else if (res.alvoId === a.id) { res.valido = false; res.motivo = "Uma barra não depende de si mesma."; }
        return res;
      }

      var ni = a.inicio0, nf = a.fim0;
      if (a.tipo === "mover") { ni = a.inicio0 + delta; nf = ni + a.duracao0; }
      else if (a.tipo === "inicio") { ni = a.inicio0 + delta; nf = a.fim0; }
      else { nf = a.fim0 + delta; ni = a.inicio0; }

      // 1) o piso: nem antes do início da obra, nem antes do que a rede permite
      if (ni < a.piso) {
        ni = a.piso;
        if (a.tipo === "mover") nf = ni + a.duracao0;
        res.valido = false;
        res.motivo = this._motivoPiso(a, e);
      }
      // 2) teto de sanidade (a guarda de 10 anos do addDiasUteis)
      if (ni > DIA_MAX) { ni = DIA_MAX; if (a.tipo === "mover") nf = ni + a.duracao0; res.valido = false; res.motivo = "Mais de 10 anos depois do início da obra — o cronograma não vai até aí."; }
      if (nf > DIA_MAX + 1) { nf = DIA_MAX + 1; res.valido = false; res.motivo = "Mais de 10 anos depois do início da obra — o cronograma não vai até aí."; }
      // 3) duração mínima de 1 dia útil (marco continua com duração zero)
      if (!a.marco && nf - ni < 1) {
        if (a.tipo === "inicio") ni = nf - 1; else nf = ni + 1;
        res.valido = false;
        res.motivo = "Uma etapa dura no mínimo 1 dia útil. Para marcar uma entrega sem duração, use o marco (duração 0 na tabela).";
      }
      if (a.marco) nf = ni;

      res.novoInicio = ni; res.novoFim = nf; res.novaDuracao = Math.max(0, nf - ni);
      res.mudou = ni !== a.inicio0 || res.novaDuracao !== a.duracao0;
      if (e.cal && typeof e.cal.dia === "function") {
        var di = e.cal.dia(ni), df = e.cal.dia(nf);
        res.dataInicio = ehData(di) ? ch(di) : null;
        res.dataFim = ehData(df) ? ch(df) : null;
      }
      return res;
    },

    _motivoPiso: function (a, e) {
      var d = (e.cal && typeof e.cal.dia === "function") ? e.cal.dia(a.piso) : null;
      var quando = ehData(d) ? " (" + dd(d.getDate()) + "/" + dd(d.getMonth() + 1) + "/" + d.getFullYear() + ")" : "";
      if (a.pisoPor === "etapa") return "A subetapa não pode começar antes da etapa" + quando + ". Arraste a etapa inteira, ou mude o “Depende de” dela.";
      if (a.pisoPor === "rede") return "Esta etapa não pode começar antes" + (quando ? " de " + quando.replace(/[()\s]/g, "") : "") +
        ": é o dia em que termina o que ela depende. Mude o “Depende de”, a duração da etapa anterior, ou o paralelismo (aba Parâmetros).";
      return "Nada começa antes do início da obra" + quando + ". Para puxar a obra para trás, mude o Início na aba Parâmetros.";
    },

    /* ------------------------------------------------------------------
       O QUE A SOLTURA GRAVA — lista de operações no formato que o motor já
       entende: {alvo:"etapa"|"folha", id, campo, de, para}.
         "duracao"       → cronograma.duracoes[id]        (folha: sub.duracoes)
         "predecessoras" → cronograma.predecessoras[id]   (folha: sub.predecessoras)
         "lags"          → cronograma.lags[id]            (folha: sub.lags)
         "restricaoData" → cronograma.restricoes[id]      (só etapa)

       ⚠ A DECISÃO (12/09/2026): mover uma barra de ETAPA vira RESTRIÇÃO DE
       DATA ("não iniciar antes de"), não lag na cascata. O porquê inteiro
       está no motor, em `Cronograma._restricoes` — em uma linha: lag não tem
       onde se pendurar na 1ª etapa, e lag ANDA quando o predecessor muda,
       enquanto quem arrastou fixou uma DATA. A restrição é piso na ida do
       CPM: a dependência continua mandando quando empurra para a direita.
       ⚠ E na SUBETAPA é o contrário, de propósito: a rede interna é
       RELATIVA à etapa (a subetapa não tem data própria — ela vive dentro da
       janela da etapa), então mover uma folha vira LAG no elo dela. Escrito
       em TODOS os predecessores resolvidos, para que o `max` da ida dê
       exatamente o dia arrastado, e não o de outro elo que ficou maior.
       ------------------------------------------------------------------ */
    opsDoArrasto: function (r, no, res) {
      var self = this, ops = [];
      if (!r || !no || !res) return ops;
      var alvo = this.alvoDoNo(no);
      if (res.tipo === "ligar") return this._opsLigar(r, no, res, alvo);
      if (res.mudou === false) return ops;

      if ((res.tipo === "fim" || res.tipo === "inicio") && res.novaDuracao !== no.duracao && res.novaDuracao >= 1) {
        ops.push({ alvo: alvo, id: no.id, campo: "duracao", de: no.duracao, para: res.novaDuracao });
      }
      if ((res.tipo === "mover" || res.tipo === "inicio") && res.novoInicio !== no.inicio) {
        if (alvo === "etapa") {
          var piso = (no.restricao && no.restricao.inicioRede != null) ? Math.round(fin(no.restricao.inicioRede, 0)) : Math.round(fin(no.inicio, 0));
          var de = no.restricao ? { tipo: no.restricao.tipo, data: no.restricao.data } : null;
          /* de volta para onde a REDE já põe a etapa: a data fixada SAI. Fixar
             a etapa onde ela já estaria é âncora invisível — e ela voltaria a
             morder quando a etapa de cima mudasse de tamanho.
             ⚠ Sem calendário não se grava NEM se apaga: apagar por falta de
             dado soltaria uma etapa que alguém fixou de propósito. */
          if (res.novoInicio > piso) {
            if (res.dataInicio) ops.push({ alvo: "etapa", id: no.id, campo: "restricaoData", de: de, para: { tipo: "nia", data: res.dataInicio } });
          } else if (de) {
            ops.push({ alvo: "etapa", id: no.id, campo: "restricaoData", de: de, para: null });
          }
        } else {
          this._lagsDaFolha(r, no, res).forEach(function (op) { ops.push(op); });
        }
      }
      return ops;
    },

    /* lag por elo que faz a ida da rede interna dar EXATAMENTE o dia solto.
       `ini` da folha = max sobre os elos de (fim do predecessor + lag) — com
       o mesmo alvo em todos os elos, o max é o alvo. (Elo "II" conta do
       INÍCIO do predecessor: a mesma regra do `_redeInterna`.)
       ⚠ E A CASCATA IMPLÍCITA VIRA EXPLÍCITA junto. Sem isso, o lag ficava
       pendurado numa predecessora que a ORDEM da lista decide: bastava
       alguém inserir uma subetapa acima para o elo virar outro, o lag deixar
       de ser aplicado e a barra voltar sozinha para a cascata — mudança de
       prazo sem ninguém ter pedido. Quem arrastou disse "esta vem 2 dias
       depois DAQUELA". */
    _lagsDaFolha: function (r, no, res) {
      var self = this, preds = arr(no.preds), ops = [];
      if (!preds.length) return ops;
      var base = Math.round(fin(no.inicio, 0)) - Math.round(fin(no.inicioRede, 0));   // início absoluto da etapa
      var rel = Math.round(fin(res.novoInicio, 0)) - base;
      var de = {}, para = {}, temDe = false, faltou = false;
      preds.forEach(function (pid) {
        var p = self.acharNo(r, pid);
        if (!p) { faltou = true; return; }
        var ii = !!(no.predTipo && no.predTipo[pid] === "II");
        var ref = Math.round(fin(ii ? p.inicioRede : p.fimRede, 0));
        para[pid] = rel - ref;
        if (no.predLag && no.predLag[pid] != null) { de[pid] = no.predLag[pid]; temDe = true; }
      });
      if (faltou || !Object.keys(para).length) return ops;
      if (!no.predsExplicito) ops.push({ alvo: "folha", id: no.id, campo: "predecessoras", de: null, para: preds.slice() });
      ops.push({ alvo: "folha", id: no.id, campo: "lags", de: temDe ? de : null, para: para });
      return ops;
    },

    /* LIGAR: `no` é a PREDECESSORA e `res.alvoId` a sucessora. Grava a rede
       da sucessora — e, ao gravar, a cascata implícita dela vira explícita
       (é o que o MS Project faz ao desenhar um elo; sem isso o elo novo
       apagaria em silêncio a dependência da etapa anterior). */
    _opsLigar: function (r, no, res, alvo) {
      var ops = [], suc = this.acharNo(r, res && res.alvoId);
      if (!suc) return ops;
      if (suc.tipo === "servico" || this.alvoDoNo(suc) !== alvo) return ops;
      if (alvo === "folha" && String(suc.etapaId) !== String(no.etapaId)) return ops;
      var atuais = arr(suc.preds);
      if (atuais.indexOf(no.id) > -1) return ops;
      if (this._dependeDe(r, no, suc.id)) return ops;   // ciclo: o elo de volta não se cria
      var base = atuais.slice();
      base.push(no.id);
      return [{ alvo: alvo, id: suc.id, campo: "predecessoras", de: suc.predsExplicito ? atuais.slice() : null, para: base }];
    },

    /* `no` já depende (direta ou indiretamente) de `id`? — a guarda de ciclo.
       ⚠ Ciclo NÃO trava o motor (ele desenha ignorando o elo de volta e
       avisa), mas criar um por arrasto é criar um defeito com o mouse: o
       Gantt passaria a mostrar uma rede que ninguém pediu. */
    _dependeDe: function (r, no, id) {
      var self = this, vistos = {}, giros = 0;
      /* planejador 1A: a etapa também depende das tarefas sem preço que a
         seguram (`porExtras`, fora de `preds` por I3), e a tarefa, das dela */
      function predsDe(n) {
        var l = arr(n && n.preds).slice();
        arr(n && n.porExtras).forEach(function (x) { if (x && x.id != null) l.push(x.id); });
        return l;
      }
      var fila = predsDe(no);
      while (fila.length && giros++ < 5000) {
        var pid = fila.shift();
        if (pid == null || own(vistos, pid)) continue;
        vistos[pid] = true;
        if (pid === id) return true;
        var p = self.acharNo(r, pid);
        if (p) predsDe(p).forEach(function (q) { if (!own(vistos, q)) fila.push(q); });
      }
      return false;
    },

    /* acha um nó pelo id: a árvore EAP primeiro (ela tem folha e serviço),
       depois a lista de etapas (detalhe "etapa", e o PDF por etapa) */
    acharNo: function (r, id) {
      if (!r || id == null) return null;
      var nos = arr(r.atividades), i;
      for (i = 0; i < nos.length; i++) if (nos[i] && nos[i].id === id) return nos[i];
      var et = arr(r.etapas);
      for (i = 0; i < et.length; i++) if (et[i] && et[i].id === id) return et[i];
      // a tarefa sem preço (r.extras): uma cópia rasa com `tipo: "extra"` (a linha T da tela)
      var ex = arr(r.extras);
      for (i = 0; i < ex.length; i++) if (ex[i] && ex[i].id === id) {
        var c = {}, k;
        for (k in ex[i]) if (own(ex[i], k)) c[k] = ex[i][k];
        c.tipo = "extra";
        return c;
      }
      return null;
    },

    /* ------------------------------------------------------------------
       APLICAR as operações no `orc.cronograma` (o mesmo objeto que o
       `App._cronoAlvo().cron` entrega — orçamento OU plano da obra). Mexe no
       objeto e devolve o que mudou; a tela só chama `alvo.salvar()` depois.
       ⚠ Mapa que voltou da sincronização como LISTA ([]) vira objeto antes de
       receber chave: chave posta num array some no JSON do salvar, e a edição
       não chegava ao disco (a mesma régua do `objD` do app.js).
       ⚠ Arrastar (e digitar) é decisão do USUÁRIO: a marca de agente ("ia",
       "exec", "subetapas") e o motivo da IA saem junto, senão a tela
       continuaria rotulando "sugerido pela IA" um número que a pessoa pôs com
       a mão.
       ⚠ A FORMA GRAVADA É A DA 1.2.77, e não muda: a versão anterior do app
       lê estes mesmos mapas (duracoes, marcos, predecessoras, lags, sub.*,
       restricoes). Por isso "marco" é `marcos[id] = true` SEM duração (em
       `duracoes` o 0 já quer dizer "não estimável" e o motor o ignora) e
       "volta à estimativa" é APAGAR as duas chaves — nunca um valor novo que
       a versão anterior não saberia ler.
       ------------------------------------------------------------------ */
    /* ⚠ PLANEJADOR 1A — `opts` = {orc (para saber de que etapa é cada
       subetapa), medirTeto(cron) → teto|null (a recusa dos 60 KB ANTES de
       gravar, O30), inicioFixo (I13: "o mais tarde possível" e LIGAR tarefa
       sem preço a etapa exigem início; `false` recusa, com `out.portaInicio`
       para a tela abrir a porta [Fixar início])}.
       - A edição de nó com sombra ativa vai ao PLANEJADO: a sombra sai antes
         (`Cronograma.prepararEdicao`), e o salvar a refaz.
       - `campo: "rede"` grava a rede DIGITADA (`rede.etapas`/`rede.folhas`,
         forma enxuta, O29) e a assina sobre os mapas de sempre de agora — a
         projeção do salvar escreve a sombra e reassina. `para: null` só tira
         a entrada (quem cabe no legado grava pelos campos de sempre).
       - `restricaoData`: `nia`/`tae` de etapa no mapa de sempre (o `tae` com a
         marca da O22); `dia`/`dta`/`nta`/`nid`/`mtp` e toda restrição de
         SUBETAPA em `rede.datas` (a 1.2.81 diria "formato inválido" ou
         "etapa que não existe mais", G4). Soltar tira as duas.
       - ⚠ GRAVADOR ANTIGO EM NÓ COM REDE: `predecessoras`/`lags`/`tipos`
         apagam a entrada de rede do nó (o mapa de sempre passa a ser a
         verdade) e avisam — senão a `rede` ficaria mentindo. */
    aplicarOps: function (cron, ops, opts) {
      opts = opts || {};
      var out = { mudou: false, aplicadas: 0, erros: [], avisos: [], teto: null };
      if (!cron || typeof cron !== "object" || ehArr(cron)) { out.erros.push("cronograma ausente"); return out; }
      function obj(o, k) { if (!o[k] || typeof o[k] !== "object" || ehArr(o[k])) o[k] = {}; return o[k]; }
      var Cr = depG("Cronograma", "./cronograma.js"), CRd = depG("CronoRede", "./cronorede.js");
      var fotoCru = JSON.stringify(cron);
      var prep = (Cr && typeof Cr.prepararEdicao === "function") ? Cr.prepararEdicao(cron, { orc: opts.orc, folhaDe: opts.folhaDe }) : null;
      var validas = prep ? prep.validas : null;
      var antes = JSON.stringify(cron);
      function tiraRede(nv, id) {
        var R = cron.rede && typeof cron.rede === "object" && !ehArr(cron.rede) ? cron.rede : null, m = R && R[nv];
        if (!m || typeof m !== "object" || ehArr(m) || !own(m, id)) return false;
        delete m[id];
        if (validas && validas[nv]) delete validas[nv][id];
        if (!Object.keys(m).length) delete R[nv];
        if (!Object.keys(R).filter(function (k) { return k !== "v"; }).length) delete cron.rede;
        return true;
      }
      function poeRede(nv, id, valor, dono) {
        var R = obj(cron, "rede");
        R.v = 1;
        obj(R, nv)[id] = valor;
        if (validas) { if (nv === "datas") validas.datas[id] = dono; else validas[nv][id] = true; }
      }
      var TIPOS_E = ["TI", "II", "TT", "IT"], TIPOS_D_ET = ["nia", "tae", "dia", "dta", "nta", "nid", "mtp"];
      var lista = arr(ops);
      var CEx = depG("CronoExtras", "./cronoextras.js");
      /* as tarefas sem preço: a LISTA do disco (lida uma vez; lista torta não
         é regravada por cima — a operação é recusada) */
      var etIds = {}, semEtapas = !(opts.orc && ehArr(opts.orc.etapas)) && !ehArr(opts.etapaIds);
      arr(opts.orc && opts.orc.etapas).forEach(function (e) { if (e && e.id != null) etIds[e.id] = true; });
      arr(opts.etapaIds).forEach(function (eid) { if (eid != null) etIds[eid] = true; });
      /* as subetapas conhecidas (do orçamento e do mapa folha → etapa): a
         recusa diz POR QUE ("se liga a etapa"), não "não existe" */
      var foIds = {};
      arr(opts.orc && opts.orc.etapas).forEach(function (e) { arr(e && e.subetapas).forEach(function (s) { if (s && s.id != null) foIds[s.id] = true; }); });
      if (opts.folhaDe && typeof opts.folhaDe === "object") Object.keys(opts.folhaDe).forEach(function (f) { foIds[f] = true; });
      function listaX() {
        if (!own(cron, "extras")) cron.extras = [];
        return ehArr(cron.extras) ? cron.extras : null;
      }
      function achaX(L, id) { for (var q = 0; q < L.length; q++) if (L[q] && L[q].id === id) return q; return -1; }
      function eloOk(el, proprio, soEtapa) {
        var z = CEx ? CEx.lerElo(el) : null;
        if (!z || z.erro) return { erro: "ligação inválida" };
        if (z.i === proprio) return { erro: "ligação para a própria tarefa" };
        var L = ehArr(cron.extras) ? cron.extras : [];
        /* ⚠ sem o orçamento nem a lista de etapas (o gravador de hoje chama
           `aplicarOps(cron, ops)`), o id que não é tarefa conta como etapa: a
           digitação já conferiu contra o motor antes de montar a operação */
        var ehX = achaX(L, z.i) >= 0, ehEt = own(etIds, z.i) || (semEtapas && !ehX && z.i.indexOf("x_") !== 0);
        // ⚠ §2.10: extra × subetapa é recusado nesta leva
        if (own(foIds, z.i) && !own(etIds, z.i)) return { erro: "tarefa sem preço se liga a etapa, não a subetapa (" + z.i + ")" };
        if (soEtapa && !ehEt) return { erro: ehX ? "a tarefa sem preço só segura ETAPA" : "etapa que não existe (" + z.i + ")" };
        if (!ehEt && !ehX) return { erro: "tarefa ou etapa que não existe (" + z.i + ")" };
        return { el: z };
      }
      /* ⚠ FORMA ENXUTA (O29) sem reconstruir o item: o que outra versão
         acrescentar ao item fica; só os padrões conhecidos saem */
      function enxugar(x) {
        if (own(x, "nia") && !x.nia) delete x.nia;
        if (own(x, "nota") && !x.nota) delete x.nota;
        if (own(x, "proposta") && x.proposta !== true) delete x.proposta;
        if (own(x, "proposta") && x.resp !== "cliente") delete x.proposta;
        ["preds", "sucs"].forEach(function (k) {
          if (!own(x, k)) return;
          if (!ehArr(x[k]) || !x[k].length) { delete x[k]; return; }
          x[k] = x[k].map(function (z) { return CEx.eloDisco(CEx.lerElo(z)); });
        });
        return x;
      }
      /* ⚠ I13 (O14): a tarefa sem preço que SEGURA etapa vira piso de data
         absoluta na sombra; com o início flutuante, a 1.2.81 recalcularia no
         dia seguinte com o piso velho (EXTRAS mediu 15 de 16 etapas fora uma
         semana depois). Só o elo NOVO é recusado: soltar, renomear ou mexer
         no que já existia continua livre (o registro da 1.2.81 sem início
         ainda precisa de edição). */
      var MSG_SEM_INICIO_X = "ligar tarefa sem preço a uma etapa exige o início fixo da obra";
      function semInicioX(novos) {
        if (opts.inicioFixo !== false || !novos) return null;
        out.portaInicio = true;
        return MSG_SEM_INICIO_X;
      }
      function opExtra(op) {
        if (!CEx || !CEx.pronto) return "o módulo das tarefas sem preço não carregou";
        var L = listaX();
        if (!L) return "a lista de tarefas sem preço deste cronograma está ilegível — nada foi gravado";
        var k = achaX(L, op.id), x = k >= 0 ? L[k] : null;
        if (op.campo === "criar") {
          if (k >= 0) return "já existe uma tarefa com o id " + op.id;
          var validos = L.filter(function (z) { return ehObj(z); }).length;
          if (validos >= CEx.TETO) return "este cronograma já tem " + CEx.TETO + " tarefas sem preço — o limite existe porque todos os orçamentos da empresa sincronizam num documento de 1 MB. Agrupe tarefas (ex.: “Aprovações do cliente”) ou exclua as que já passaram";
          var novo = {}, kk, pa = op.para || {};
          for (kk in pa) if (own(pa, kk)) novo[kk] = pa[kk];
          novo.id = op.id;
          if (novo.resp === "cliente" && !own(pa, "proposta")) novo.proposta = true;   // D1: a caixa vem marcada para o contratante
          var outros = {};
          if (opts.orc) arr(opts.orc.etapas).forEach(function (e) { arr(e && e.itens).forEach(function (it) { if (it && it.id) outros[it.id] = true; }); arr(e && e.subetapas).forEach(function (s) { if (s && s.id) outros[s.id] = true; }); });
          var v = CEx.validarItem(novo, { etapas: etIds, outrosIds: outros });
          if (!v.ok) return "tarefa sem preço inválida (" + v.motivo + ")";
          var el2, j2;
          for (j2 = 0; j2 < arr(novo.preds).length; j2++) { el2 = eloOk(novo.preds[j2], novo.id, false); if (el2.erro) return el2.erro; }
          for (j2 = 0; j2 < arr(novo.sucs).length; j2++) { el2 = eloOk(novo.sucs[j2], novo.id, true); if (el2.erro) return el2.erro; }
          var siC = semInicioX(arr(novo.sucs).length > 0);
          if (siC) return siC;
          var gr = CEx.itemDisco(v.item);
          for (kk in novo) if (own(novo, kk) && !own(gr, kk) && ["nome", "dur", "resp", "proposta", "apos", "preds", "sucs", "nia", "nota", "id"].indexOf(kk) < 0) gr[kk] = novo[kk];
          var pos = op.indice != null && isFinite(op.indice) ? Math.max(0, Math.min(L.length, Math.round(op.indice))) : L.length;
          L.splice(pos, 0, gr);
          return null;
        }
        if (!x || !ehObj(x)) return "esta tarefa sem preço não existe mais";
        var cp = JSON.parse(JSON.stringify(x)), msg = null;
        if (op.campo === "excluir") {
          L.splice(k, 1);
          // as outras tarefas que a citavam perdem o elo (as etapas que ela segurava estavam no `sucs` dela)
          L.forEach(function (z) { if (ehObj(z) && ehArr(z.preds)) { z.preds = z.preds.filter(function (e) { return !(e && e.i === op.id); }); enxugar(z); } });
          return null;
        } else if (op.campo === "nome") {
          var nm = String(op.para == null ? "" : op.para).replace(/\s+/g, " ").trim().slice(0, 80);
          if (!nm) return "a tarefa precisa de nome";
          cp.nome = nm;
        } else if (op.campo === "duracao") {
          if (!(typeof op.para === "number" && isFinite(op.para) && Math.floor(op.para) === op.para && op.para >= 0 && op.para <= 999)) return "duração inválida (inteiro de 0 a 999; 0 = marco)";
          cp.dur = op.para;
        } else if (op.campo === "resp") {
          if (CEx.RESP.indexOf(op.para) < 0) return "responsável inválido";
          cp.resp = op.para;
        } else if (op.campo === "proposta") {
          cp.proposta = op.para === true;
        } else if (op.campo === "nia") {
          if (op.para != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(op.para))) return "data inválida";
          if (op.para == null) delete cp.nia; else cp.nia = String(op.para);
        } else if (op.campo === "nota") {
          cp.nota = String(op.para == null ? "" : op.para).slice(0, 120);
        } else if (op.campo === "predecessoras" || op.campo === "sucessoras") {
          var soEt = op.campo === "sucessoras", nova = [], vistosX = {};
          if (!ehArr(op.para)) return "a lista de ligações é obrigatória";
          for (var q = 0; q < op.para.length; q++) {
            var r2 = eloOk(op.para[q], op.id, soEt);
            if (r2.erro) return r2.erro;
            if (own(vistosX, r2.el.i)) return "a mesma ligação duas vezes";
            vistosX[r2.el.i] = true;
            nova.push(r2.el);
          }
          if (soEt) {
            var jaSeg = {};
            arr(x.sucs).forEach(function (z) { if (z && z.i != null) jaSeg[z.i] = true; });
            var siS = semInicioX(nova.some(function (z) { return !own(jaSeg, z.i); }));
            if (siS) return siS;
          }
          cp[soEt ? "sucs" : "preds"] = nova;
        } else if (op.campo === "mover") {
          var mv = op.para || {};
          if (mv.apos != null && !own(etIds, mv.apos)) return "etapa que não existe (" + mv.apos + ")";
          if (mv.apos == null) delete cp.apos; else cp.apos = mv.apos;
          L.splice(k, 1);
          var ix = mv.indice != null && isFinite(mv.indice) ? Math.max(0, Math.min(L.length, Math.round(mv.indice))) : L.length;
          L.splice(ix, 0, enxugar(cp));
          return msg;
        } else return "campo desconhecido: " + op.campo;
        L[k] = enxugar(cp);
        return msg;
      }
      /* o "Depende de" da ETAPA na parte das tarefas sem preço (T1, T2II…):
         reescreve o `sucs` de TODA tarefa que cita esta etapa (O6; a etapa
         nunca recebe id de extra em `predecessoras`) */
      function opPorExtras(op) {
        if (!CEx || !CEx.pronto) return "o módulo das tarefas sem preço não carregou";
        var para = op.para == null ? [] : op.para;
        if (!ehArr(para)) return "a lista de tarefas é obrigatória";
        var L = own(cron, "extras") ? cron.extras : [];
        if (!ehArr(L)) return "a lista de tarefas sem preço deste cronograma está ilegível — nada foi gravado";
        var porX = {}, vistosE = {};
        for (var q = 0; q < para.length; q++) {
          var z = CEx.lerElo(para[q]);
          if (z.erro) return "ligação inválida";
          if (achaX(L, z.i) < 0) return "tarefa sem preço que não existe (" + z.i + ")";
          if (own(vistosE, z.i)) return "a mesma tarefa duas vezes";
          vistosE[z.i] = true;
          porX[z.i] = z;
        }
        var novoElo = false;
        L.forEach(function (x) {
          if (!ehObj(x) || !own(porX, x.id)) return;
          if (!arr(x.sucs).some(function (e) { return e && e.i === op.id; })) novoElo = true;
        });
        var siP = semInicioX(novoElo);
        if (siP) return siP;
        L.forEach(function (x) {
          if (!ehObj(x)) return;
          var antes = ehArr(x.sucs) ? x.sucs : [], depois = antes.filter(function (e) { return !(e && e.i === op.id); });
          if (own(porX, x.id)) depois.push({ i: op.id, t: porX[x.id].t, l: porX[x.id].l });
          if (depois.length || own(x, "sucs")) { x.sucs = depois; enxugar(x); }
        });
        if (!L.length && !own(cron, "extras")) return null;
        return null;
      }

      /* ============ O CALENDÁRIO DA FRENTE (commit CAL) ============
         Três operações, e só três:
           • `campo: "lista"`  → cria, edita ou exclui um calendário nomeado;
           • `campo: "padrao"` → o calendário das linhas sem atribuição;
           • `campo: "de"`     → atribui (ou tira) o calendário de uma linha.
         ⚠ O ROTEADOR DA DURAÇÃO. Enquanto a linha está em calendário próprio,
           a duração DIGITADA mora em `cal.dur` (dias de trabalho da frente) e
           não em `duracoes`/`sub.duracoes` (dias úteis da obra): são unidades
           diferentes, e trocar uma pela outra faria "10 dias" virar 10 dias de
           7×7 sem ninguém pedir. Ao atribuir, o valor que estava no mapa da
           obra vai para `mat` (a régua do O2: `cal.anterior` não existe mais)
           e é devolvido quando a linha volta para "Obra".
         ⚠ O11: atribuir calendário a uma linha que é SUCESSORA de um TT/IT, ou
           que é etapa tocada por elo cruzado, é RECUSADO aqui — ninguém mediu
           essas combinações, e a sombra delas não é exata. */
      function calRaiz() { return obj(cron, "cal"); }
      /* o cronograma executivo (a rede das subetapas) está ligado? */
      function execLigado() { return !!(cron.exec && typeof cron.exec === "object" && !ehArr(cron.exec) && cron.exec.rede === true); }
      /* o calendário EFETIVO da linha, do disco (a mesma herança do motor:
         folha ← etapa, e o padrão no fim) */
      function calDaLinha(id) {
        var C = cron.cal && typeof cron.cal === "object" && !ehArr(cron.cal) ? cron.cal : null;
        if (!C || id == null) return null;
        var deM = (C.de && typeof C.de === "object" && !ehArr(C.de)) ? C.de : {};
        if (own(deM, id)) return deM[id];
        var dono = opts.folhaDe && opts.folhaDe[id];
        if (dono && own(deM, dono)) return deM[dono];
        return (typeof C.padrao === "string" && C.padrao) ? C.padrao : null;
      }
      function calDeAlgumaFolha(etapaId) {
        var C = cron.cal && typeof cron.cal === "object" && !ehArr(cron.cal) ? cron.cal : null;
        if (!C || !opts.folhaDe) return null;
        var deM = (C.de && typeof C.de === "object" && !ehArr(C.de)) ? C.de : {}, achou = null;
        Object.keys(deM).forEach(function (f) { if (!achou && opts.folhaDe[f] === etapaId) achou = deM[f]; });
        return achou;
      }
      function calLista() {
        var C = cron.cal && typeof cron.cal === "object" && !ehArr(cron.cal) ? cron.cal : null;
        if (!C) return [];
        return ehArr(C.lista) ? C.lista : [];
      }
      function achaCal(L, id) { for (var q = 0; q < L.length; q++) if (L[q] && L[q].id === id) return q; return -1; }
      function eloDeTermino(id) {
        /* o nó é sucessor de um TT/IT, ou tem restrição de término? (O11) */
        var R = cron.rede && typeof cron.rede === "object" && !ehArr(cron.rede) ? cron.rede : null;
        if (!R) return null;
        var m = null, achou = null;
        ["etapas", "folhas"].forEach(function (nv) {
          var mm = R[nv];
          if (!mm || typeof mm !== "object" || ehArr(mm) || !own(mm, id)) return;
          m = mm[id];
          arr(m && m.e).forEach(function (el) { if (!achou && el && (el.t === "TT" || el.t === "IT")) achou = el.t; });
        });
        var md = R.datas;
        if (!achou && md && typeof md === "object" && !ehArr(md) && own(md, id) && (md[id].t === "dta" || md[id].t === "nta")) achou = md[id].t;
        return achou;
      }
      function opCal(op) {
        var CCa = depG("CronoCal", "./cronocal.js");
        if (!CCa || !CCa.pronto) return "o módulo dos calendários não carregou";
        var L = calLista();
        if (op.campo === "lista") {
          if (op.para === null) {
            var k0 = achaCal(L, op.id);
            if (k0 < 0) return "calendário que não existe";
            var C0 = calRaiz(), usadoPor = [];
            Object.keys((C0.de && typeof C0.de === "object" && !ehArr(C0.de)) ? C0.de : {}).forEach(function (nid) { if (C0.de[nid] === op.id) usadoPor.push(nid); });
            if (usadoPor.length) return "este calendário está em " + usadoPor.length + " linha(s) — tire-o delas antes de excluir";
            if (C0.padrao === op.id) return "este calendário é o padrão das linhas sem atribuição — troque o padrão antes de excluir";
            L.splice(k0, 1);
            if (!L.length) delete C0.lista; else C0.lista = L;
            if (!Object.keys(C0).filter(function (q) { return q !== "v"; }).length) delete cron.cal;
            return null;
          }
          /* ⚠ só as chaves PRESENTES vão ao validador: passar `exc: undefined`
             o faria cobrar "as exceções precisam ser uma lista" de todo
             calendário que não tem exceção nenhuma */
          var pv = { id: op.id }, kv, pa0 = op.para || {};
          for (kv in pa0) if (own(pa0, kv) && kv !== "id") pv[kv] = pa0[kv];
          var v = CCa.validar(pv);
          if (!v.ok) return v.erros[0].msg;
          var C1 = calRaiz(); C1.v = 1;
          var Lw = ehArr(C1.lista) ? C1.lista : (C1.lista = []);
          var k1 = achaCal(Lw, op.id);
          if (k1 < 0) Lw.push(CCa.itemDisco(v.valor)); else Lw[k1] = CCa.itemDisco(v.valor);
          return null;
        }
        if (op.campo === "padrao") {
          var C2 = calRaiz();
          if (op.para == null) { delete C2.padrao; }
          else { if (achaCal(L, op.para) < 0) return "calendário que não existe (" + op.para + ")"; C2.v = 1; C2.padrao = String(op.para); }
          if (!Object.keys(C2).filter(function (q) { return q !== "v"; }).length) delete cron.cal;
          return null;
        }
        if (op.campo !== "de") return "operação de calendário desconhecida (" + op.campo + ")";
        var alvoId = op.id, C = calRaiz(), deM, durM, agM;
        if (op.para != null && achaCal(L, op.para) < 0) return "calendário que não existe (" + op.para + ")";
        deM = (C.de && typeof C.de === "object" && !ehArr(C.de)) ? C.de : null;
        var jaTem = deM && own(deM, alvoId) ? deM[alvoId] : null;
        if (op.para != null && op.para !== jaTem) {
          /* ⚠ I13 (O14): a frente começa num dia REAL, e com o início
             flutuante a 1.2.81 recalcularia amanhã com a sombra de hoje */
          if (opts.inicioFixo === false) { out.portaInicio = true; return "atribuir calendário a uma linha exige o início fixo da obra"; }
          var tt = eloDeTermino(alvoId);
          if (tt) return "esta linha tem “" + (tt === "TT" ? "termina junto" : tt === "IT" ? "termina quando o outro começa" : "terminar em data") +
            "”, que não vale em calendário próprio: o vão em dias úteis da obra muda com o dia da semana em que a frente começa. Solte a ligação (ou a data) antes de atribuir o calendário";
          if (eloCruzadoToca(alvoId)) return "esta etapa tem ligação com subetapa de outra etapa, que não vale em calendário próprio — solte a ligação antes de atribuir o calendário";
          if (folhaComTermino(alvoId)) return "esta etapa tem subetapa com “termina junto” ou “terminar em data” — em calendário próprio essa conta não é exata; solte a ligação da subetapa antes";
          /* ⚠ RECUSA COM PORTA: ETAPA DETALHADA PELAS SUBETAPAS, MODO EXECUTIVO.
             ROTEIRO DO DEFEITO (revisão adversarial da Onda 2, 21/09/2026): o
             P4 sobrescreve a sombra de duração que o P2 escreveu pelo
             calendário, e o aparelho na 1.2.81 passa a mostrar OUTRA data sem
             código no catálogo (§1.11: "diferença sem código = defeito").
             Medido na obra do galpão, calendário de frente na etapa 1 (3
             subetapas) com `exec.rede` ligado, pelo motor 1.2.81 REAL sobre o
             registro gravado: 1.2.81 = 75 DU (fim 13/11/2026) e esta versão =
             77 DU (fim 17/11/2026), `conferirFrota` = 53 divergências, TODAS
             com `cod: "sem-codigo"` (e1.fim, e1.dataFim, e2.dataInicio, …).
             Dois dias de diferença na entrega conforme o aparelho que imprime
             a proposta.
             ⚠ A PORTA FOI MEDIDA — E A PRIMEIRA QUE SE ESCREVEU AQUI ERA FALSA.
             A recusa dizia "atribua o calendário às subetapas dela", porque o
             mesmo calendário numa SUBETAPA dá 0 divergências. Dá — mas por
             NÃO FAZER NADA: 75 DU com e sem o calendário, e o nó da subetapa
             sai com `calendarioId` e `duracaoFrente` NULOS (o motor só
             publica esses campos em ETAPA). Porta que não abre é pior que
             recusa seca: a pessoa faz o que o recado mandou e o 7×7 fica
             inerte, sem uma linha de aviso.
             A porta que a medição achou é a FRENTE NÃO DETALHADA: mesma obra,
             mesmo calendário, numa etapa sem subetapas — 77 DU e 17/11/2026
             NOS DOIS MOTORES, 0 divergências, `calendarioId` e `duracaoFrente`
             preenchidos (medido em e1, e7 e e9 do galpão). É essa que a
             recusa oferece, e é a que a e2e da 2A exercita.
             PENDÊNCIA declarada (1A/2A): calendário em SUBETAPA é inerte.
             Antes desta recusa o único retorno era um toast mandando avisar o
             suporte, com o dado JÁ GRAVADO.
             ⚠ AQUI é o lugar certo (e não em cada tela): as duas portas da
             Onda 2 — o menu ⋯ da linha e o [Aplicar a] do modal — passam pelo
             `aplicarOps`. Quando o motor parar de sobrescrever a sombra, os
             asserts do bloco 1f de tools/test-crono-compat-1281.js reprovam de
             propósito, e é lá que se tira a exclusão do `comCal`. */
          if (execLigado() && own(etIds, alvoId) && etapaTemFolhas(alvoId))
            return "esta etapa é detalhada pelas subetapas e o cronograma executivo está ligado — em calendário próprio a conta dela deixa de bater com a de um aparelho na versão anterior do app, que mostraria outro prazo sem aviso. " +
              "Ponha o calendário numa frente que não seja detalhada pelas subetapas (ou tire o detalhamento desta), ou desligue o cronograma executivo antes";
        }
        if (op.para == null) {
          if (!deM || !own(deM, alvoId)) return null;
          delete deM[alvoId];
          if (!Object.keys(deM).length) delete C.de;
          // a duração DIGITADA volta para o mapa da obra, se a pessoa a tinha guardado lá
          durM = (C.dur && typeof C.dur === "object" && !ehArr(C.dur)) ? C.dur : null;
          agM = (C.agente && typeof C.agente === "object" && !ehArr(C.agente)) ? C.agente : null;
          if (durM && own(durM, alvoId)) { delete durM[alvoId]; if (!Object.keys(durM).length) delete C.dur; }
          if (agM && own(agM, alvoId)) { delete agM[alvoId]; if (!Object.keys(agM).length) delete C.agente; }
          if (!Object.keys(C).filter(function (q) { return q !== "v"; }).length) delete cron.cal;
          return null;
        }
        C.v = 1;
        obj(C, "de")[alvoId] = String(op.para);
        /* ROTEADOR: a duração digitada que estava na régua da obra vira a
           duração da frente e SAI do mapa da obra (a projeção reescreve a
           sombra no salvar) */
        var ehFolha = own(foIds, alvoId) && !own(etIds, alvoId);
        var mapaDur = ehFolha ? (cron.sub && cron.sub.duracoes) : cron.duracoes;
        var mapaAg = ehFolha ? (cron.sub && cron.sub.agente) : cron.duracoesAgente;
        if (mapaDur && typeof mapaDur === "object" && own(mapaDur, alvoId) && fin(mapaDur[alvoId], 0) > 0) {
          var marca = (mapaAg && typeof mapaAg === "object" && own(mapaAg, alvoId)) ? mapaAg[alvoId] : null;
          /* só a duração do USUÁRIO viaja: a sombra (sem marca, mas com `mat`)
             e a marca "subetapas" são derivadas e a projeção as refaz */
          var mt = cron.mat && typeof cron.mat === "object" && !ehArr(cron.mat) ? cron.mat : null;
          var mm = mt && (ehFolha ? mt.folhas : mt.etapas);
          var eDerivada = !!(mm && typeof mm === "object" && own(mm, alvoId)) || marca === "subetapas";
          if (!eDerivada) {
            obj(C, "dur")[alvoId] = Math.round(fin(mapaDur[alvoId], 0) * 100) / 100;
            obj(C, "agente")[alvoId] = marca || "usuario";
            delete mapaDur[alvoId];
            if (mapaAg && typeof mapaAg === "object" && own(mapaAg, alvoId)) delete mapaAg[alvoId];
          }
        }
        return null;
      }
      function eloCruzadoToca(etapaId) {
        var R = cron.rede && typeof cron.rede === "object" && !ehArr(cron.rede) ? cron.rede : null;
        if (!R || !opts.folhaDe) return false;
        var achou = false;
        ["etapas", "folhas"].forEach(function (nv) {
          var mm = R[nv];
          if (!mm || typeof mm !== "object" || ehArr(mm)) return;
          Object.keys(mm).forEach(function (id) {
            arr(mm[id] && mm[id].e).forEach(function (el) {
              if (!el || typeof el.i !== "string") return;
              var donoEl = opts.folhaDe[el.i], donoNo = nv === "folhas" ? opts.folhaDe[id] : id;
              if (donoEl && donoNo && donoEl !== donoNo && (donoEl === etapaId || donoNo === etapaId)) achou = true;
            });
          });
        });
        return achou;
      }
      /* a etapa é DETALHADA pelas subetapas? (o orçamento e o mapa folha →
         etapa dizem a mesma coisa; os dois entram porque nem todo chamador
         passa os dois) */
      function etapaTemFolhas(etapaId) {
        var achou = false;
        arr(opts.orc && opts.orc.etapas).forEach(function (e) {
          if (!e || e.id !== etapaId) return;
          if (arr(e.subetapas).length) achou = true;
        });
        if (!achou && opts.folhaDe && typeof opts.folhaDe === "object")
          Object.keys(opts.folhaDe).forEach(function (f) { if (opts.folhaDe[f] === etapaId) achou = true; });
        return achou;
      }
      function folhaComTermino(etapaId) {
        var R = cron.rede && typeof cron.rede === "object" && !ehArr(cron.rede) ? cron.rede : null;
        if (!R || !opts.folhaDe) return false;
        var achou = false, mm = R.folhas, md = R.datas;
        if (mm && typeof mm === "object" && !ehArr(mm)) Object.keys(mm).forEach(function (f) {
          if (opts.folhaDe[f] !== etapaId) return;
          arr(mm[f] && mm[f].e).forEach(function (el) { if (el && (el.t === "TT" || el.t === "IT")) achou = true; });
        });
        if (md && typeof md === "object" && !ehArr(md)) Object.keys(md).forEach(function (f) {
          if (opts.folhaDe[f] !== etapaId) return;
          if (md[f] && (md[f].t === "dta" || md[f].t === "nta")) achou = true;
        });
        return achou;
      }

      for (var i = 0; i < lista.length; i++) {
        var op = lista[i];
        if (!op || op.id == null) { out.erros.push("operação sem id"); continue; }
        if (op.alvo === "calendario") {
          var ec = opCal(op);
          if (ec) { out.erros.push(ec + " (" + op.id + ")"); continue; }
          out.aplicadas++;
          continue;
        }
        if (op.alvo === "extra") {
          var ex = opExtra(op);
          if (ex) { out.erros.push(ex + " (" + op.id + ")"); continue; }
          out.aplicadas++;
          continue;
        }
        if (op.alvo === "etapa" && op.campo === "porExtras") {
          var pe = opPorExtras(op);
          if (pe) { out.erros.push(pe + " (" + op.id + ")"); continue; }
          out.aplicadas++;
          continue;
        }
        var folha = op.alvo === "folha";
        /* `raiz` só para LER/APAGAR; `W()` cria o `sub` só quando há o que gravar
           (apagar numa folha de cronograma sem `sub` não inventa `sub: {}`) */
        var raiz = folha ? cron.sub : cron;
        var W = folha ? function () { return obj(cron, "sub"); } : function () { return cron; };
        if (op.campo === "duracao") {
          /* três valores e só três: null = volta à estimativa (apaga), 0 =
             marco, inteiro ≥ 1 = dias úteis. ⚠ `=== null` e `=== 0` ESTRITOS:
             `fin(null, 0)` dá 0, e sem a comparação estrita o "apagar a
             duração" virava marco — a entrega de uma etapa inteira sumindo do
             prazo calada. `undefined` não é nenhum dos três e é recusado. */
          if (op.para === null) {
            tira(raiz, "duracoes", op.id);
            tira(raiz, "marcos", op.id);
          } else if (op.para === 0) {
            obj(W(), "marcos")[op.id] = true;
            tira(raiz, "duracoes", op.id);
          } else {
            var n = Math.round(fin(op.para, 0));
            if (!(n >= 1)) { out.erros.push("duração inválida em " + op.id); continue; }
            obj(W(), "duracoes")[op.id] = n;
            tira(raiz, "marcos", op.id);
          }
          tira(raiz, folha ? "agente" : "duracoesAgente", op.id);
          tira(raiz, "iaMotivos", op.id);
        } else if (op.campo === "predecessoras") {
          if (op.para === null) {
            tira(raiz, "predecessoras", op.id);
            tira(raiz, "lags", op.id);
            tira(raiz, "tipos", op.id);
          } else if (ehArr(op.para)) {
            /* ⚠ I3: id de TAREFA SEM PREÇO nunca vai a `predecessoras`/`lags`
               (a 1.2.81 o leria como "etapa que não existe" e o apagaria na
               primeira digitação; o PDF e o XML imprimiriam "undefined"). A
               ligação mora no `sucs` da tarefa (op `porExtras`). */
            var LX = ehArr(cron.extras) ? cron.extras : [], xRuim = null;
            op.para.forEach(function (pid) { if (!xRuim && (achaX(LX, pid) >= 0 || (typeof pid === "string" && pid.indexOf("x_") === 0 && !own(etIds, pid)))) xRuim = pid; });
            if (xRuim) { out.erros.push("a tarefa sem preço " + xRuim + " não entra na lista de dependências da etapa — ligue-a pela própria tarefa (" + op.id + ")"); continue; }
            obj(W(), "predecessoras")[op.id] = op.para.slice();
          } else { out.erros.push("predecessoras precisa ser lista em " + op.id); continue; }
          if (!op.daRede && tiraRede(folha ? "folhas" : "etapas", op.id)) out.avisos.push({ tipo: "rede-apagada", id: op.id });
        } else if (op.campo === "lags") {
          if (op.para == null || typeof op.para !== "object" || !Object.keys(op.para).length) tira(raiz, "lags", op.id);
          else {
            var c = {}, ks = Object.keys(op.para), j;
            for (j = 0; j < ks.length; j++) c[ks[j]] = Math.round(fin(op.para[ks[j]], 0));
            obj(W(), "lags")[op.id] = c;
          }
          if (!op.daRede && tiraRede(folha ? "folhas" : "etapas", op.id)) out.avisos.push({ tipo: "rede-apagada", id: op.id });
        } else if (op.campo === "tipos") {
          /* "começa junto" (II) só existe entre subetapas: a rede de ETAPA é
             término-início e não lê este mapa — gravar ali seria dado que
             nenhuma versão do app desenha. */
          if (!folha) { out.erros.push("começa junto (II) só existe entre subetapas (" + op.id + ")"); continue; }
          if (op.para == null || typeof op.para !== "object" || !Object.keys(op.para).length) tira(raiz, "tipos", op.id);
          else {
            var tt = {}, kt = Object.keys(op.para), q, ruim = false;
            for (q = 0; q < kt.length; q++) { if (op.para[kt[q]] === "II") tt[kt[q]] = "II"; else ruim = true; }
            if (ruim) { out.erros.push("tipo de elo inválido em " + op.id + " (só existe II)"); continue; }
            obj(W(), "tipos")[op.id] = tt;
          }
          if (!op.daRede && tiraRede("folhas", op.id)) out.avisos.push({ tipo: "rede-apagada", id: op.id });
        } else if (op.campo === "rede") {
          var nvR = folha ? "folhas" : "etapas";
          if (op.para == null) { tiraRede(nvR, op.id); out.aplicadas++; continue; }
          var elos = op.para && ehArr(op.para.elos) ? op.para.elos : null, ruimR = null, vistosR = {};
          if (!elos) ruimR = "rede sem a lista de ligações";
          else elos.forEach(function (el) {
            if (ruimR) return;
            if (!el || typeof el.i !== "string" || !el.i) ruimR = "ligação sem o id";
            else if (TIPOS_E.indexOf(String(el.t || "TI")) < 0) ruimR = "tipo de ligação inválido (" + el.t + ")";
            else if (el.l != null && !(typeof el.l === "number" && isFinite(el.l) && Math.floor(el.l) === el.l && Math.abs(el.l) <= 999)) ruimR = "espera inválida";
            else if (el.i === op.id) ruimR = "ligação para a própria tarefa";
            else if (own(vistosR, el.i)) ruimR = "a mesma ligação duas vezes";
            else vistosR[el.i] = true;
          });
          if (ruimR || !CRd) { out.erros.push((ruimR || "o módulo da rede não carregou") + " em " + op.id); continue; }
          /* ⚠ O11 (o outro lado da recusa do calendário): TT/IT num nó que
             JÁ está em calendário próprio, e elo CRUZADO tocando etapa com
             calendário próprio. Ninguém mediu essas combinações; a sombra
             delas não é exata, porque o vão em dias úteis da obra muda com o
             dia da semana em que a frente começa. */
          var ruimC = null;
          elos.forEach(function (el) {
            if (ruimC) return;
            var t2 = String(el.t || "TI");
            if ((t2 === "TT" || t2 === "IT") && (calDaLinha(op.id) || (!folha && calDeAlgumaFolha(op.id)))) {
              ruimC = "“" + (t2 === "TT" ? "termina junto" : "termina quando o outro começa") + "” não vale em linha de calendário próprio: o vão em dias úteis da obra muda com o dia da semana em que a frente começa. Use “depois de”, ou tire o calendário da linha";
              return;
            }
            var donoEl = opts.folhaDe && opts.folhaDe[el.i], donoNo = folha ? (opts.folhaDe && opts.folhaDe[op.id]) : op.id;
            if (donoEl && donoNo && donoEl !== donoNo && (calDaLinha(donoEl) || calDaLinha(donoNo) || calDeAlgumaFolha(donoEl) || calDeAlgumaFolha(donoNo)))
              ruimC = "ligação com subetapa de outra etapa não vale quando uma das duas etapas tem calendário próprio — a etapa anda em bloco, e o bloco em outro calendário não tem conta exata";
          });
          if (ruimC) { out.erros.push(ruimC + " (" + op.id + ")"); continue; }
          poeRede(nvR, op.id, { e: elos.map(function (el) { return CRd.eloDisco({ i: el.i, t: el.t || "TI", l: el.l == null ? null : el.l }); }) });
        } else if (op.campo === "restricaoData") {
          var tp = op.para ? String(op.para.tipo || "") : null;
          var dono = folha ? (op.etapaId != null ? String(op.etapaId) : null) : op.id;
          if (op.para == null) {
            // Soltar: a entrada do mapa de sempre e a data da rede saem juntas (e a marca `tae`, O22)
            if (!folha) tira(cron, "restricoes", op.id);
            tiraRede("datas", op.id);
            out.aplicadas++;
            continue;
          }
          if (TIPOS_D_ET.indexOf(tp) < 0) { out.erros.push("tipo de restrição inválido em " + op.id); continue; }
          if (tp !== "mtp" && !/^\d{4}-\d{2}-\d{2}$/.test(String(op.para.data || ""))) { out.erros.push("data de restrição inválida em " + op.id); continue; }
          /* ⚠ I13 (O5/O14): "o mais tarde possível" é piso de data absoluta —
             com o início flutuante, a 1.2.81 recalcularia no dia seguinte */
          if (tp === "mtp" && opts.inicioFixo === false) { out.portaInicio = true; out.erros.push("“o mais tarde possível” exige o início fixo da obra (" + op.id + ")"); continue; }
          /* ⚠ O11: restrição de TÉRMINO em etapa com FOLHA em calendário
             próprio é recusada — o vão em dias úteis da obra muda com o dia da
             semana em que a frente começa, e não há conta exata. A restrição
             de término na própria linha de calendário próprio VALE: ela é
             julgada em data real, pelo `recuar` (O27). */
          if ((tp === "dta" || tp === "nta") && !folha && calDeAlgumaFolha(op.id) && !calDaLinha(op.id)) {
            out.erros.push("esta etapa tem subetapa em calendário próprio: “" + (tp === "dta" ? "deve terminar em" : "não terminar antes de") +
              "” não tem conta exata aí. Ponha a data na própria subetapa, ou tire o calendário dela (" + op.id + ")");
            continue;
          }
          if (folha) {
            if (dono == null) { out.erros.push("restrição de subetapa sem a etapa dela (" + op.id + ")"); continue; }
            var vf = { t: tp };
            if (tp !== "mtp") vf.d = String(op.para.data);
            poeRede("datas", op.id, vf, dono);
          } else if (tp === "nia" || tp === "tae") {
            obj(cron, "restricoes")[op.id] = { tipo: tp, data: String(op.para.data) };
            // o "terminar até" digitado NESTA versão ganha a marca (O22): ele entra na folga real
            if (tp === "tae") poeRede("datas", op.id, { t: "tae" }, op.id);
            else tiraRede("datas", op.id);
          } else {
            tira(cron, "restricoes", op.id);
            var ve = { t: tp };
            if (tp !== "mtp") ve.d = String(op.para.data);
            poeRede("datas", op.id, ve, op.id);
          }
        } else { out.erros.push("campo desconhecido: " + op.campo); continue; }
        out.aplicadas++;
      }
      // a lista de tarefas criada só para ler (e que ficou vazia) não vai ao disco
      if (ehArr(cron.extras) && !cron.extras.length && antes.indexOf('"extras"') < 0) delete cron.extras;
      // as entradas da rede que valem são assinadas sobre os mapas FINAIS (o salvar reprojeta e reassina)
      if (Cr && typeof Cr._reassinar === "function" && validas) Cr._reassinar(cron, validas);
      out.mudou = JSON.stringify(cron) !== antes;
      /* ⚠ O TETO ANTES DE GRAVAR (O30): a operação que faria o cronograma
         passar dos 60 KB (e crescer) é desfeita aqui mesmo, com os números e
         as portas para quem chama mostrar. A que diminui nunca é recusada. */
      if (out.mudou && typeof opts.medirTeto === "function") {
        var tt = null;
        try { tt = opts.medirTeto(cron); } catch (eT) { tt = null; }
        if (tt) {
          var velho = JSON.parse(fotoCru), kk;
          for (kk in cron) if (own(cron, kk)) delete cron[kk];
          for (kk in velho) if (own(velho, kk)) cron[kk] = velho[kk];
          out.teto = tt; out.mudou = false; out.aplicadas = 0;
          out.erros.push("o cronograma ficaria com " + Math.round(tt.bytes / 102.4) / 10 + " KB (limite " + Math.round(tt.teto / 102.4) / 10 + " KB) — nada foi gravado");
        }
      }
      return out;
    },

    /* O RECADO da soltura, em texto puro (UI.toast escreve por textContent —
       tag aqui sai literal para o cliente). Um por operação, dizendo o que
       mudou e em que unidade; número a pessoa confere, "pronto" ela não.
       ⚠ O NOME SAI DO `op.id`, NÃO DA BARRA DE ONDE O ARRASTO PARTIU. Roteiro
       do defeito (achado na revisão de 12/09/2026): arrastando o ponto da ponta
       de "01 Serviços preliminares" até "05 Cobertura", quem MUDA é a Cobertura
       (a op é `{id:"et5", campo:"predecessoras"}`) e o dado gravado estava
       certo — mas o único retorno que a pessoa lia era "1 Serviços
       preliminares — passou a depender de 2 item(ns)", que nomeia a barra
       errada E inverte a dependência. O mesmo texto ia para o title do
       [Desfazer]. O `op.id` é o dono certo em TODOS os casos (duração, lag,
       data fixada e predecessoras); `r` resolve o nome, e `no` fica só como
       reserva para quem chama sem o resultado do motor.
       ⚠ Sem conseguir resolver, o recado sai SEM nome — nome errado é pior que
       nome nenhum: ele manda a pessoa conferir a etapa que não mudou.
       ⚠ NA SINTAXE DO CAMPO (14/09/2026). O recado dizia "passou a depender
       de 1 item(ns) · deslocamento em relação à subetapa anterior" — e a
       tabela, logo abaixo, mostrava "2.1+2". A pessoa não tinha como conferir
       uma coisa com a outra. Agora: "Depende de: 2.1+2 (era 2.1)", "duração:
       9 → 12 dias úteis", "marco (duração 0)", "duração: volta à estimativa
       (11 dias úteis)". O texto do "Depende de" sai do formatador do MOTOR
       (`Cronograma.predsTexto`/`predsTextoSub`, os mesmos da tabela),
       resolvido na hora da chamada — um segundo formatador aqui divergiria
       da tabela na primeira manutenção.
    /* ==================================================================
       O AVANÇO LANÇADO — as operações sobre o REGISTRO (commit AVANÇO;
       espec §1.4, O24 e a emenda E-MC2 da §3.9).

       ⚠ ESTE GRAVADOR NÃO TOCA NO CRONOGRAMA. O avanço mora num registro
         próprio (`avanco_<obraId>`), e é só ele que o `_cronoGravarAvanco`
         escreve (O17).
       ================================================================== */

    /* "dd/mm/aaaa" (ou "dd/mm/aa", ou já "AAAA-MM-DD") → "AAAA-MM-DD", ou
       null quando não é data.
       ⚠ A DATA QUE NÃO EXISTE NO CALENDÁRIO (30/02) DEVOLVE null, e não o
         março que o `new Date(2026, 1, 30)` produziria calado: um fim real em
         "30/02" viraria 02/03 e a barra fecharia dois dias depois do que a
         obra disse. */
    lerDataBR: function (s) {
      var v = String(s == null ? "" : s).trim();
      if (!v) return null;
      var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      var br = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v);
      var a, m, d;
      if (iso) { a = +iso[1]; m = +iso[2]; d = +iso[3]; }
      else if (br) { d = +br[1]; m = +br[2]; a = +br[3]; if (br[3].length === 2) a += a < 70 ? 2000 : 1900; }
      else return null;
      var dt = new Date(a, m - 1, d);
      if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
      return a + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2);
    },

    /* A DIGITAÇÃO DA GRADE vira operação de avanço. `campo` ∈ pct | ir | fr |
       rest. Devolve {ops, msg, ok}.
       ⚠ FIM REAL ⇒ 100% (O24), e o recado DIZ ISSO ANTES DE GRAVAR. A grade
         tem uma célula para o % e outra para o fim real: sem esta regra a
         pessoa digitaria o fim e a barra continuaria aberta em 60%, ou
         precisaria digitar o mesmo fato duas vezes. */
    opsDoAvanco: function (no, campo, texto, ctx) {
      ctx = ctx || {};
      var id = no && no.id, v = String(texto == null ? "" : texto).trim();
      if (!id) return { ok: false, msg: "tarefa sem identificação." };
      var ops = [], msg = null;
      function dataOuNulo(s) {
        if (!s) return null;
        var d = GanttUI.lerDataBR ? GanttUI.lerDataBR(s) : null;
        if (d) return d;
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
      }
      if (campo === "pct") {
        if (v === "") return { ok: true, ops: [{ alvo: "avanco", id: id, campo: "p", para: null }] };
        var n = Number(v.replace(/%/g, "").replace(",", "."));
        if (!isFinite(n) || n < 0 || n > 100) return { ok: false, msg: "o % concluído vai de 0 a 100." };
        n = Math.round(n * 10) / 10;
        ops.push({ alvo: "avanco", id: id, campo: "p", para: n });
        if (n === 100) msg = "100% exige o fim real: informe a data em que a tarefa terminou.";
      } else if (campo === "ir" || campo === "fr") {
        var d = dataOuNulo(v);
        if (d === undefined) return { ok: false, msg: "data inválida (use dd/mm/aaaa)." };
        ops.push({ alvo: "avanco", id: id, campo: campo === "ir" ? "i" : "f", para: d });
        if (campo === "fr" && d) {
          /* ⚠ o `p: 100` sai JUNTO, e o recado mostra os dois antes de gravar:
             "marquei também 100%" é informação, "a barra ficou aberta" é
             defeito silencioso */
          ops.push({ alvo: "avanco", id: id, campo: "p", para: 100 });
          msg = "fim real em " + v + " — a tarefa fica como concluída (100%).";
        }
        if (campo === "fr" && !d) msg = "sem fim real, a tarefa volta a “em andamento”.";
      } else if (campo === "rest") {
        if (v === "") ops.push({ alvo: "avanco", id: id, campo: "r", para: null });
        else {
          var nr = Number(v.replace(",", "."));
          if (!isFinite(nr) || nr < 0 || nr > 9999) return { ok: false, msg: "dias que faltam: um número de 0 a 9999." };
          ops.push({ alvo: "avanco", id: id, campo: "r", para: nr });
          msg = "com os dias que faltam informados, o % passa a ser só indicativo: quem manda na data é este número.";
        }
      } else return { ok: false, msg: "campo de avanço desconhecido (" + campo + ")." };
      void ctx;
      return { ok: true, ops: ops, msg: msg };
    },

    /* APLICA as operações no registro de avanço. Devolve
       {mudou, aplicadas, erros, rec (a CÓPIA gravável)}.
       ⚠ A ENTRADA É COPIADA E ALTERADA CAMPO A CAMPO, NUNCA RECONSTRUÍDA
         (E-MC2). Reconstruir com uma lista fixa de campos apagaria o lastro
         `b`, a origem `o` e qualquer campo que uma versão futura acrescente —
         e o apagão só apareceria meses depois, quando alguém procurasse de
         qual boletim veio aquele número.
       ⚠ A EDIÇÃO HUMANA DE `p`/`i`/`f`/`r` TIRA `o:"medicao"` E `b` (E-MC2):
         a partir do momento em que uma pessoa mudou o número, o boletim
         deixou de sustentá-lo, e dizer "medição 01a" ao lado seria um recado
         que mente. `o:"diario"` fica como está — esta revisão não muda a
         regra da origem do diário. */
    aplicarAvanco: function (rec, ops) {
      var out = { mudou: false, aplicadas: 0, erros: [], rec: null };
      if (!rec || typeof rec !== "object" || ehArr(rec)) { out.erros.push("registro de avanço ausente"); return out; }
      if (!ehArr(rec.nos)) { out.erros.push("a lista de tarefas do avanço está ilegível — nada foi gravado"); return out; }
      var c = {}, k;
      for (k in rec) if (own(rec, k)) c[k] = rec[k];
      c.nos = rec.nos.map(function (e) {
        if (!e || typeof e !== "object" || ehArr(e)) return e;
        var q = {}, kk;
        for (kk in e) if (own(e, kk)) q[kk] = e[kk];
        return q;
      });
      var antes = JSON.stringify(c.nos);
      var CAMPOS = { p: 1, i: 1, f: 1, r: 1 };
      function acha(id) { for (var q = 0; q < c.nos.length; q++) if (c.nos[q] && c.nos[q].id === id) return q; return -1; }
      arr(ops).forEach(function (op) {
        if (!op || op.alvo !== "avanco" || op.id == null) { out.erros.push("operação de avanço sem id"); return; }
        var k2 = acha(op.id);
        if (op.campo === "excluir") {
          if (k2 < 0) { out.erros.push("não há avanço lançado em " + op.id); return; }
          c.nos.splice(k2, 1); out.aplicadas++; return;
        }
        if (!own(CAMPOS, op.campo)) { out.erros.push("campo de avanço desconhecido: " + op.campo); return; }
        var e;
        if (k2 < 0) {
          if (op.para == null) { out.aplicadas++; return; }       // apagar o que não existe: nada a fazer
          e = { id: op.id }; c.nos.push(e);
        } else e = c.nos[k2];
        var valorAntes = own(e, op.campo) ? e[op.campo] : undefined;
        if (op.para == null) delete e[op.campo]; else e[op.campo] = op.para;
        var mudouCampo = JSON.stringify(valorAntes === undefined ? null : valorAntes) !== JSON.stringify(op.para == null ? null : op.para);
        if (mudouCampo && e.o === "medicao") { delete e.o; delete e.b; }
        if (mudouCampo) e.em = op.em || e.em;
        out.aplicadas++;
      });
      out.mudou = JSON.stringify(c.nos) !== antes;
      out.rec = c;
      return out;
    },

    /* o resumo "antes → depois" do avanço, para o recado do salvar */
    resumoAvanco: function (ops, nomes) {
      var n = {}, linhas = [];
      arr(ops).forEach(function (op) { if (op && op.id != null) n[op.id] = true; });
      Object.keys(n).forEach(function (id) {
        var campos = arr(ops).filter(function (op) { return op.id === id; }).map(function (op) { return op.campo; });
        linhas.push(((nomes && nomes[id]) || id) + ": " + campos.join(", "));
      });
      return linhas;
    },

    /* `opts` (opcional): {rDepois (o estimar DEPOIS de gravar: dá o número
       da estimativa quando a duração volta a ela), Cronograma (injetado)}. */
    resumoOps: function (ops, no, r, opts) {
      opts = opts || {};
      var self = this, grupos = [], porId = {};
      var Cr = opts.Cronograma || ((typeof Cronograma !== "undefined") ? Cronograma : null);
      /* ⚠ A TAREFA RECÉM-CRIADA SÓ EXISTE NO `rDepois`. `r` é o estimar de
         ANTES da operação: numa op `criar` (tarefa sem preço) ele não tem o
         nó, `nomeDoId` devolvia "" e o recado saía "tarefa sem preço criada
         (10 dias úteis)." — sem o número T e sem o nome que a pessoa acabou
         de digitar. Ela fecha o cartão sem saber QUAL linha nasceu, num
         cronograma que pode ter 30 (medido em 21/09/2026 pela
         e2e-planejador-completo, passo 2: o recado não continha "T1").
         A ordem importa: `r` primeiro, para toda op de EDIÇÃO continuar
         dizendo o nome de antes, byte a byte. */
      function nomeDoId(id) {
        if (no && no.id === id) return nomeDe(no);
        var n = r ? self.acharNo(r, id) : null;
        if (!n && opts.rDepois) n = self.acharNo(opts.rDepois, id);
        return n ? nomeDe(n) : "";
      }
      arr(ops).forEach(function (op) {
        if (!op) return;
        var txt = "", fam = op.alvo !== "extra" && (op.campo === "predecessoras" || op.campo === "lags" || op.campo === "tipos" || op.campo === "rede" || op.campo === "porExtras");
        if (op.alvo === "extra") txt = self._txtExtra(op);
        /* ⚠ O CALENDÁRIO DA FRENTE (planejador 2A) TEM DE DIZER O NOME. Sem
           este ramo o recado do salvar caía no "Cronograma atualizado." — a
           pessoa acabava de escolher "Montagem 4x3" numa linha e o app
           respondia como se nada de especial tivesse acontecido, num gesto que
           MUDA O PRAZO. Medido em 21/09/2026 pela e2e-crono-calendario-gantt. */
        else if (op.alvo === "calendario" && op.campo === "de") txt = self._txtCalendario(op, opts);
        else if (op.campo === "duracao") txt = self._txtDuracao(op, opts.rDepois);
        else if (op.campo === "restricaoData") txt = self._txtRestricao(op);
        if (!txt && !fam) return;
        var k = String(op.id);
        if (!own(porId, k)) { porId[k] = { nome: nomeDoId(op.id), t: [] }; grupos.push(porId[k]); }
        var g = porId[k];
        if (!fam) { g.t.push(txt); return; }
        /* a família do "Depende de" (lista + esperas + II) vira UMA frase: são
           três mapas no disco e um campo só na tela */
        if (!g.pred) { g.pred = { alvo: op.alvo }; g.t.push(g.pred); }
        g.pred[op.campo] = op;
      });
      if (!grupos.length) return "";
      var partes = [];
      for (var i = 0; i < grupos.length; i++) {
        var ts = [];
        for (var j = 0; j < grupos[i].t.length; j++) {
          var x = grupos[i].t[j];
          ts.push(typeof x === "string" ? x : self._txtPreds(x, no, r, Cr));
        }
        partes.push((grupos[i].nome ? grupos[i].nome + " — " : "") + ts.join(" · "));
      }
      return partes.join(" · ") + ".";
    },

    /* o recado de cada operação da tarefa sem preço (texto puro) */
    _txtExtra: function (op) {
      var p = op.para;
      switch (op.campo) {
        case "criar": return "tarefa sem preço criada" + (p && p.dur === 0 ? " (marco)" : (p && p.dur ? " (" + diasTxt(p.dur) + ")" : ""));
        case "excluir": return "tarefa sem preço excluída";
        case "nome": return "nome: " + String(p == null ? "" : p);
        case "duracao": return p === 0 ? "marco (duração 0)" : "duração: " + (op.de != null ? op.de + " → " : "") + diasTxt(p);
        case "resp": return "responsável: " + ({ cliente: "contratante", construtora: "construtora", terceiro: "terceiro" }[p] || p);
        case "proposta": return p ? "aparece na proposta" : "não aparece na proposta";
        case "nia": return p ? "não começa antes de " + dmaS(p) : "sem data mínima";
        case "nota": return "nota atualizada";
        case "predecessoras": return "Depende de: " + (op.paraTxt ? op.paraTxt : (arr(p).length ? arr(p).length + " item(ns)" : "vazio, começa no início da obra")) + (op.de != null && op.de !== op.paraTxt ? " (era " + (op.de === "" ? "vazio" : op.de) + ")" : "");
        case "sucessoras": return "segura " + arr(p).length + " etapa(s)";
        case "mover": return "movida na lista";
        default: return "";
      }
    },

    /* o nome de cada restrição na tela (os do MS Project em português, REDE §a.3) */
    NOMES_RESTRICAO: { nia: "não iniciar antes de", tae: "não terminar depois de", dia: "deve iniciar em", dta: "deve terminar em",
      nta: "não terminar antes de", nid: "não iniciar depois de", mtp: "o mais tarde possível" },
    /* "calendário: Montagem 4x3 (era a régua da obra)". O nome sai do
       `opts.cal` (a lista do cronograma) quando quem chama a passa; sem ela,
       o id — nunca um nome inventado. */
    _txtCalendario: function (op, opts) {
      var lista = arr(opts && opts.cal), nome = "", de = "";
      lista.forEach(function (c) {
        if (!c) return;
        if (op.para != null && String(c.id) === String(op.para)) nome = String(c.nome || c.id);
        if (op.de != null && String(c.id) === String(op.de)) de = String(c.nome || c.id);
      });
      var para = op.para == null ? "a régua da obra" : (nome || String(op.para));
      var antes = op.de == null ? "a régua da obra" : (de || String(op.de));
      return "calendário: " + para + " (era " + antes + ")";
    },
    _txtRestricao: function (op) {
      if (!op.para) return "data fixada removida — volta para onde a rede põe";
      var tp = op.para.tipo, nomeR = this.NOMES_RESTRICAO[tp] || tp;
      if (tp === "nia") return "início fixado em " + dmaS(op.para.data) + " (não iniciar antes de)";
      if (tp === "mtp") return "restrição: o mais tarde possível (usa só a folga livre; nenhuma outra tarefa muda)";
      return "restrição: " + nomeR + " " + dmaS(op.para.data) + (/^(dta|nta|tae)$/.test(tp) ? " (último dia de trabalho)" : "");
    },
    _txtDuracao: function (op, rDepois) {
      var de = (op.de == null || !isFinite(Number(op.de))) ? null : Math.round(Number(op.de));
      if (op.para === 0) return "marco (duração 0" + (de ? "; era " + diasTxt(de) : "") + ")";
      if (op.para === null) {
        var nd = rDepois ? this.acharNo(rDepois, op.id) : null;
        var est = nd ? Number(ehFolha(nd) && nd.duracaoRede != null ? nd.duracaoRede : nd.duracao) : NaN;
        if (nd && nd.marco) est = 0;
        return "duração: volta à estimativa" + (isFinite(est)
          ? " (" + diasTxt(Math.round(est)) + (de != null ? "; era " + de : "") + ")"
          : (de != null ? " (era " + diasTxt(de) + ")" : ""));
      }
      /* ⚠ SEM arredondar aqui: operação com dia fracionário é defeito de quem a
         gerou (o arrasto sem snap anunciava "18 → 21.97"), e é esse número
         torto no recado que a e2e do arrasto usa para pegá-lo */
      var p = fin(op.para, 0);
      return "duração: " + (de != null ? de + " → " : "") + diasTxt(p);
    },

    /* nº que o "Depende de" escreve para cada id: na folha, o nº EAP; na
       etapa, a posição na lista (1, 2, 3…) — é o que a tabela usa. */
    _numsPred: function (r, folha) {
      var m = {}, et = arr(r && r.etapas);
      if (folha) arr(r && r.atividades).forEach(function (x) { if (x && x.numero != null) m[x.id] = x.numero; });
      else if (et.length) et.forEach(function (e, i) { if (e) m[e.id] = i + 1; });
      else arr(r && r.atividades).forEach(function (x) { if (x && x.tipo === "etapa") m[x.id] = x.numero; });
      return m;
    },

    // "vazio" diz o que o vazio QUER DIZER nesta linha: a anterior, ou o início
    _vazioPred: function (r, n, folha) {
      if (!n || !r) return "a anterior";
      var lista = folha ? arr(r.atividades).filter(function (x) { return ehFolha(x) && x.etapaId === n.etapaId; }) : arr(r.etapas);
      var pos = -1;
      for (var i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === n.id) { pos = i; break; }
      if (pos === 0) return folha ? "o início da etapa" : "o início da obra";
      return "a anterior";
    },

    _txtPreds: function (g, no, r, Cr) {
      var P = g.predecessoras, L = g.lags, T = g.tipos, RD = g.rede, PX = g.porExtras, folha = g.alvo === "folha";
      // com as tarefas sem preço, o texto inteiro já veio montado (o `paraTxt` e o `de` da op `porExtras`)
      if (PX && typeof PX.paraTxt === "string") return "Depende de: " + (PX.paraTxt === "" ? "vazio, " + this._vazioPred(r, (no && no.id === PX.id) ? no : (r ? this.acharNo(r, PX.id) : null), folha) : PX.paraTxt) +
        (PX.de != null && PX.de !== PX.paraTxt ? " (era " + (PX.de === "" ? "vazio" : PX.de) + ")" : "");
      if (PX && !P && !RD) return "tarefas sem preço que a seguram: " + arr(PX.para).length;
      // a rede digitada: o texto já veio montado pelo formatador do motor (o `paraTxt` e o `de`)
      if (RD && RD.para) return "Depende de: " + RD.paraTxt + (RD.de != null && RD.de !== RD.paraTxt ? " (era " + (RD.de === "" ? "vazio: " + this._vazioPred(r, (no && no.id === RD.id) ? no : (r ? this.acharNo(r, RD.id) : null), folha) : RD.de) + ")" : "");
      if (!P && !L && !T) return "";
      var id = (P || L || T).id;
      var n = (no && no.id === id) ? no : (r ? this.acharNo(r, id) : null);
      var nums = r ? this._numsPred(r, folha) : null;
      var pode = !!(Cr && nums && typeof Cr.predsTexto === "function" && typeof Cr.predsTextoSub === "function");
      function fmt(x) { return folha ? Cr.predsTextoSub(x, nums) : Cr.predsTexto(x, nums); }
      function mapa(op, reserva) { return op ? ((op.para && typeof op.para === "object" && !ehArr(op.para)) ? op.para : {}) : (reserva || {}); }
      var paraT = null, deT = null;
      if (P && typeof P.paraTxt === "string") paraT = P.paraTxt;
      else if (P && P.para === null) paraT = "";
      else if (pode && (P || n)) paraT = fmt({ preds: P ? arr(P.para) : arr(n && n.preds), predLag: mapa(L, n && n.predLag), predTipo: mapa(T, n && n.predTipo), predsExplicito: true });
      if (P && typeof P.de === "string") deT = P.de;
      else if (pode && n) deT = n.predsExplicito ? fmt(n) : "";
      // sem o formatador do motor não se inventa sintaxe: o recado antigo, que não mente
      if (paraT === null) return P ? "passou a depender de " + (arr(P.para).length ? arr(P.para).length + " item(ns)" : "nada") : "deslocamento em relação à " + (folha ? "subetapa" : "etapa") + " anterior";
      var vz = this._vazioPred(r, n, folha);
      // "Depende de: 1+7 (era vazio: a anterior)" · "Depende de: vazio, a anterior (era 1+7)"
      return "Depende de: " + (paraT === "" ? "vazio, " + vz : paraT) + (deT === null || deT === paraT ? "" : " (era " + (deT === "" ? "vazio: " + vz : deT) + ")");
    },

    /* ------------------------------------------------------------------
       DIGITAR — a duração e o "Depende de" digitados, pela grade do Gantt,
       pela tabela da etapa e pela da subetapa: UM contrato só, aqui.
       ROTEIRO DO DEFEITO (medido na 1.2.77 com teclas reais): o mesmo campo
       tinha dois contratos. A subetapa (`CronoExecUI.editarFolha`) recusava
       o inválido e sempre dava recado; a etapa (handler inline do app.js)
       gravava 1 DIA calado para vazio, negativo ou texto (128 → 1 sem uma
       palavra), truncava "2,5" em 2, aceitava 1000, gravava SÓ o 1 de "1,99"
       (e ainda mostrava toast de erro por cima do dado já gravado) e, de
       "1 + 7", gravava [1] e PERDIA a espera. Os dois ainda arredondavam
       diferente: 2.5 virava 2 num nível e 3 no outro.
       O contrato é o estrito, nos dois níveis:
         Dur.       "" → volta à estimativa · "0" → marco · inteiro 1..999 ·
                    "2,0"/"2.0" → 2 · fração, negativo, > 999, texto → RECUSA
         Depende de espaço em volta de + e - não conta ("1 + 7" = "1+7") ·
                    QUALQUER token inválido recusa TUDO · II só entre
                    subetapas · vazio apaga lista, esperas e II
       ⚠ Recusar é devolver `ops: []` — nada parcial. Quem chama não grava.
       ------------------------------------------------------------------ */

    /* {ok:true} | {ok:false, motivo, porta?}. `motivo` é texto de LEITURA
       (vai no `title` da célula e no recado ao tentar abrir): não diz "nada
       foi gravado", porque passar o mouse não grava nada.
       ctx: {travado, cron, nos (r.atividades do estimar {eap:true}),
             motivoEtapaTravada (função injetada: CronoExecUI.motivoEtapaTravada)}
       `porta`: "revisao" (aprovado) · "subetapa" (+ portaId) · "detalhar"
       (interruptor do modo executivo) · "subetapas" (edite as subetapas). */
    /* os campos que a grade do Gantt abre. `dur` e `pred` são os de sempre; os
       outros são da 2A: `nome` (só na linha T), `cal` (a coluna Calendário) e
       os quatro do modo Avançar. */
    CAMPOS_CEL: { dur: 1, pred: 1, nome: 1, cal: 1, pct: 1, ir: 1, fr: 1, rest: 1 },
    CAMPOS_AV: { pct: 1, ir: 1, fr: 1, rest: 1 },
    celulaEditavel: function (no, campo, ctx) {
      ctx = ctx || {};
      if (!own(this.CAMPOS_CEL, campo)) return { ok: false, motivo: "Campo desconhecido: " + campo + "." };
      if (!no || no.id == null) return { ok: false, motivo: "Esta linha não existe mais neste cronograma." };
      if (ctx.travado) return { ok: false, porta: "revisao", motivo: MOTIVO_APROVADO };
      /* ------ PLANEJADOR 2A: os campos novos ------
         ⚠ O MODO AVANÇAR SÓ EXISTE NO PLANO DE EXECUÇÃO DA OBRA. Lançar
         realizado num orçamento seria escrever o que aconteceu numa proposta
         que ainda vai ao cliente — e o registro de avanço é por OBRA
         (`avanco_<obraId>`, §1.4): sem obra não há onde gravar. A porta é a
         de sempre: iniciar o plano de execução da obra. */
      if (own(this.CAMPOS_AV, campo)) {
        if (!ctx.plano) return { ok: false, porta: "plano",
          motivo: "O avanço é lançado no plano de execução da obra, não no orçamento — ligue a obra a este orçamento e inicie o plano." };
        if (no.tipo === "servico") return { ok: false, porta: "subetapa",
          motivo: "O avanço é lançado na tarefa (etapa, subetapa ou tarefa sem preço), não no serviço — lance na linha de cima." };
        /* ⚠ NO MODO EXECUTIVO QUEM MANDA NA DATA É A FOLHA (§1.4): lançar na
           etapa que tem subetapas escreveria um número que o motor ignora, e a
           pessoa veria 60% na tela e a barra parada. Com subetapa, a etapa só
           se lança pela porta [Resumir] do modal (2B). */
        if (no.tipo === "etapa" && ctx.exec && no.papel === "resumo")
          return { ok: false, porta: "folha",
            motivo: "No modo executivo quem manda na data é a subetapa: lance o avanço nas subetapas da etapa " + (no.numero || "") + ", ou desligue “Detalhar o prazo pelas subetapas”." };
        return { ok: true };
      }
      if (campo === "nome") {
        if (!ehExtra(no)) return { ok: false, porta: "planilha",
          motivo: "O nome da etapa e o da subetapa se editam na planilha do orçamento — aqui só o da tarefa sem preço." };
        return { ok: true };
      }
      if (campo === "cal") {
        if (no.tipo === "servico") return { ok: false, porta: "subetapa",
          motivo: "O calendário é da frente (etapa, subetapa ou tarefa sem preço), não do serviço — escolha na linha de cima." };
        return { ok: true };
      }
      /* ⚠ A LINHA T NÃO É TRAVADA PELO MODO EXECUTIVO (O7): ela é nó de rede,
         não tem subetapa e não tem vão — a trava da etapa com subetapas não
         tem o que dizer sobre ela. Sem esta linha, a trava do vão recusava
         toda célula da T com "não consegui conferir" (o nó não está em
         `ctx.nos`), e a tarefa sem preço nascia só leitura. */
      if (ehExtra(no)) return { ok: true };
      /* (⚠ escrito sem repetir o `if` do arrastavel: o controle negativo da
         tools/test-ganttui.js mira aquela linha pelo texto e exige achá-la 1×) */
      var ehServico = no.tipo === "servico";
      if (ehServico) {
        var pai = this._paiDoServico(no, ctx.nos);
        var ond = !pai ? "subetapa dele" : (pai.tipo === "etapa" ? "etapa " + pai.numero : (pai.tipo === "soltos" ? "linha " + pai.numero + " (" + (pai.nome || "serviços gerais da etapa") + ")" : "subetapa " + pai.numero));
        var de = !pai || pai.tipo !== "etapa" ? "da subetapa" : "da etapa";
        var oQue = campo === "dur" ? "A duração do serviço sai " : "O “Depende de” do serviço é o ";
        /* ⚠ A PORTA PROMETIDA PRECISA EXISTIR (revisão adversarial de
           14/09/2026). Roteiro do defeito: no modo PADRÃO a linha do serviço
           aparece (detalhe "servico"), e a célula dizia "Edite a subetapa
           2.2." — mas no modo padrão a subetapa também não se edita: o clique
           seguinte, na 2.2, respondia "As subetapas só se editam com
           Detalhar… ligado". Dois recados, cada um mandando para uma porta
           fechada (o mesmo valia para o solto: "Edite a linha 5.g"). Por isso
           a porta é conferida pelo PRÓPRIO celulaEditavel antes de ser
           citada; se ela recusa, o recado diz o caminho que abre de verdade.
           (O pai nunca é serviço: esta chamada não se repete.) */
        if (pai) {
          var cp = this.celulaEditavel(pai, campo, ctx);
          if (!cp.ok) {
            var etp = null;
            arr(ctx.nos).forEach(function (x) { if (x && x.tipo === "etapa" && x.id === no.etapaId) etp = x; });
            var ce = (cp.porta === "detalhar" && etp) ? this.celulaEditavel(etp, campo, ctx) : null;
            if (ce && ce.ok)
              return { ok: false, porta: "etapa", portaId: etp.id,
                motivo: oQue + "da " + ond + ", que no modo padrão é desenhada dentro da etapa " + etp.numero + ": edite " +
                  (campo === "dur" ? "a duração" : "o “Depende de”") + " da etapa " + etp.numero + " ou ligue “Detalhar o prazo pelas subetapas”." };
            // a porta está fechada e a etapa também não abre: diz as duas coisas, com a porta de quem recusou
            return { ok: false, porta: cp.porta, portaId: cp.portaId,
              motivo: oQue + "da " + ond + ", que agora também não se edita: " + cp.motivo };
          }
        }
        return { ok: false, porta: "subetapa", portaId: pai ? pai.id : null,
          motivo: oQue + de + "." + " Edite a " + ond + "." };
      }
      var folha = ehFolha(no), rede = !!(ctx.cron && ctx.cron.exec && ctx.cron.exec.rede === true);
      if (folha && !rede) return { ok: false, porta: "detalhar", motivo: MOTIVO_FOLHA_PADRAO };
      if (!folha && campo === "dur" && rede) {
        /* ⚠ SEM a função da trava, NÃO se libera: no modo executivo a etapa
           com subetapas dura o vão delas, e um número digitado ali é
           regravado no próximo salvar (a pessoa veria 10 e o PDF sairia com
           14). Na dúvida, recusa — e diz que não conseguiu conferir. */
        var mt = null;
        /* ⚠ E SEM A ETAPA NOS NÓS, também não. Roteiro (revisão adversarial
           de 14/09/2026): quem chama com `r = Cronograma.estimar(orc)` SEM
           {eap:true} (ou com a árvore que falhou: `atividades: null`) entrega
           nós sem a etapa; a função injetada não a acha e devolve null — o
           "não travada". Medido: com eap recusava "é o vão das subetapas (9
           dias)", sem eap gravava duracoes.e2 = 15 e o recado dizia "9 → 15".
           A trava dependia de quem chama. Todo nó de etapa da árvore traz
           `fonte` (cronograma.js, _arvore): sem ele não há como saber se o vão
           manda, e na dúvida recusa. */
        var noRede = null;
        arr(ctx.nos).forEach(function (x) { if (x && x.tipo === "etapa" && x.id === no.id) noRede = x; });
        if (!noRede || typeof noRede.fonte !== "string" || !noRede.fonte) mt = MOTIVO_NAO_CONFERI;
        else if (typeof ctx.motivoEtapaTravada !== "function") mt = MOTIVO_NAO_CONFERI;
        else { try { mt = ctx.motivoEtapaTravada(ctx.cron, arr(ctx.nos), no.id); } catch (e) { mt = MOTIVO_NAO_CONFERI; } }
        if (mt) return { ok: false, porta: "subetapas", motivo: String(mt).replace(/\s*Nada foi gravado\.?\s*$/, "") };
      }
      return { ok: true };
    },

    _paiDoServico: function (no, nos) {
      var lista = arr(nos), sub = null, soltos = null, etapa = null;
      for (var i = 0; i < lista.length; i++) {
        var x = lista[i];
        if (!x) continue;
        if (no.subEtapaId && x.id === no.subEtapaId && ehFolha(x)) sub = x;
        else if (x.tipo === "soltos" && x.etapaId === no.etapaId) soltos = x;
        else if (x.tipo === "etapa" && x.id === no.etapaId) etapa = x;
      }
      return sub || soltos || etapa;
    },

    /* DURAÇÃO digitada → inteiro 0..999, ou null quando não é duração válida.
       "5", "2,0", "2.0" e "007" valem; "2,5", "-3", "1000" e "abc" não.
       ⚠ "1.000" é MIL (milhar brasileiro), não 1: lido como 1.0, a pessoa
       que digitou mil (por engano ou não) gravaria 1 dia calada — assim cai
       acima de 999 e é recusado com o recado.
       ⚠ "" devolve null aqui também: vazio NÃO é número. É quem chama que
       decide que vazio quer dizer "volta à estimativa". */
    lerDuracao: function (texto) {
      var s = String(texto == null ? "" : texto).trim();
      if (!s) return null;
      if (s.indexOf(",") > -1) {
        if (s.split(",").length > 2) return null;
        s = s.replace(/\./g, "").replace(",", ".");
      } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      if (!/^\d+(\.\d+)?$/.test(s)) return null;
      var n = parseFloat(s);
      if (!isFinite(n) || n !== Math.floor(n) || n < 0 || n > 999) return null;
      return n;
    },

    /* "1 + 7" → "1+7" e "2.1 II" → "2.1II". O parser do motor separa token
       por espaço: sem isto "1 + 7" virava os tokens "1", "+", "7" — na etapa
       gravava [1] e PERDIA a espera, na subetapa recusava uma coisa que a
       pessoa escreveu certo. O "-" sozinho (começa no início) fica intacto. */
    /* ⚠ PLANEJADOR 1A (O23): a digitação aceita o texto que a TELA MOSTRA —
       o rótulo da seta diz "TT+2d" e "IT−1d" (U+2212), e o `d` e o sinal
       tipográfico recusavam o próprio texto copiado da tela. Também "3 TT+2"
       (o tipo separado por espaço, M8 da REDE). */
    normalizarPreds: function (texto) {
      return String(texto == null ? "" : texto).trim()
        .replace(/[\u2212\u2013]/g, "-")
        .replace(/\s*([+\-])\s*(?=\d)/g, "$1")
        .replace(/([+\-]\d+)\s*d(?=$|[\s,;])/gi, "$1")
        .replace(/(\d|g)\s+(ii|tt|it|ti)(?=$|[\s,;+\-])/gi, "$1$2");
    },

    /* O QUE A DIGITAÇÃO GRAVA — {ok, ops, msg, travadoAprovacao?, porta?}.
       Mesmo formato de operação do arrasto, aplicado pelo mesmo `aplicarOps`.
       ctx: {travado, cron (o alvo: orçamento OU plano), ordemEtapas ([ids],
             padrão r.etapas), Cronograma (injetado), CronoExecUI (injetado)}
       `r` = Cronograma.estimar(orc, null, {eap:true}); `no` = o nó da linha.
       `op.de` é o valor que a TELA mostra hoje (duração do nó; o texto do
       "Depende de" pelos formatadores da tabela) — nada de segundo formatador.
       ok com `ops: []` = o que se digitou já é o que está gravado. */
    opsDaDigitacao: function (r, no, campo, texto, ctx) {
      ctx = ctx || {};
      var self = this;
      var Cr = ctx.Cronograma || ((typeof Cronograma !== "undefined") ? Cronograma : null);
      var CX = ctx.CronoExecUI || ((typeof CronoExecUI !== "undefined") ? CronoExecUI : null);
      function recusa(msg, extra) { var o = { ok: false, ops: [], msg: msg }, k; for (k in (extra || {})) if (own(extra, k)) o[k] = extra[k]; return o; }
      if (!Cr || typeof Cr.parsePreds !== "function" || typeof Cr.parsePredsSub !== "function")
        return recusa("O motor do cronograma não carregou nesta tela — nada foi gravado. Recarregue a página (Ctrl+F5).");
      // a LINHA T (tarefa sem preço, planejador 1A): nome, duração e "Depende de" próprios
      /* ⚠ PLANEJADOR 2A — UMA PORTA SÓ PARA A GRADE. A coluna Calendário e
         os quatro campos do modo Avançar entram por aqui, com o mesmo
         contrato {ok, ops, msg} de sempre: a grade (js/ganttgradeui.js) chama
         `opsDaDigitacao` e não precisa saber de qual função veio a operação.
         Com dois pontos de entrada, a trava (`celulaEditavel`) valeria num e
         não no outro — que é exatamente como nasce célula que recusa ao
         digitar e grava pelo teclado. */
      if (campo === "cal") return this.opsDoCalendario(r, no, texto, ctx);
      if (own(this.CAMPOS_AV, campo)) {
        var celA = this.celulaEditavel(no, campo, { travado: ctx.travado, plano: ctx.plano, exec: ctx.exec });
        if (!celA.ok) return recusa(celA.motivo + " Nada foi gravado.", celA.porta ? { porta: celA.porta } : null);
        var av = this.opsDoAvanco(no, campo, texto, ctx);
        if (!av.ok) return recusa(av.msg ? (av.msg.charAt(0).toUpperCase() + av.msg.slice(1) + " Nada foi gravado.") : "Não consegui ler este valor — nada foi gravado.");
        /* ⚠ % SEM INÍCIO REAL NÃO É AVANÇO — É UM NÚMERO QUE O MOTOR IGNORA.
           Pela §1.4, "não iniciada ⇔ sem `i`": uma entrada `{id, p: 60}` sem
           `i` é lida como não iniciada, a leitura a DESCARTA e nada aparece na
           tela. Medido em 21/09/2026 pela e2e-crono-avanco-gantt: 60% gravado
           no registro, `lista: 0` no `CronoAvanco.ler`, `r.avanco` null, a
           barra sem trechos e a pílula sem nascer — com o dado no disco.
           Digitar % na grade leva junto o início REAL, que começa valendo o
           PLANEJADO daquela tarefa, e o recado DIZ isso: quem começou em
           outro dia corrige na coluna ao lado.

           ⚠ A CONDIÇÃO PERGUNTA AO REGISTRO, NÃO AO NÓ DA ÁRVORE — e a
           diferença era o defeito inteiro. Ela era `!(no.avanco &&
           no.avanco.iniReal)`, e `no.avanco.iniReal` vem do
           `Cronograma._avancoDoNo`, que o preenche com a data de início da
           REPROGRAMAÇÃO (`fonteNo.iniD`) — quer dizer, com o PLANEJADO, para
           toda tarefa, tenha ela começado ou não. A guarda achava que já
           havia início real e não disparava. Medido na revisão final
           (22/09/2026, tecla real por Input.dispatchKeyEvent, obra do galpão,
           corte 22/09): digitei 50 na tarefa 1.1, o disco ganhou
           `{"id":"s1a","p":50,"em":"2026-09-22"}` SEM `i`, o
           `CronoAvanco.ler` devolveu `descartadas:[{id:"s1a",motivo:
           "pct-sem-inicio"}]` e a célula continuou em "0,0%". Duas verdades no
           mesmo aparelho, e nada avisando.

           ⚠ SEM PODER CONFERIR, RECUSA. `ctx.avancoAtual(id)` é a fiação para
           o registro `avanco_<obraId>` (App._cronoGravarDigitado) e devolve
           `{corte, no}` — a entrada gravada daquela tarefa (ou null) e a data
           de corte que vale. Sem ela não dá para saber se já existe início
           lançado nem se a data planejada serve de âncora, e escrever por
           cima do que a pessoa informou é pior que não gravar. */
        if (campo === "pct" && av.ops.length && av.ops[0].para != null) {
          var reg = (typeof ctx.avancoAtual === "function") ? ctx.avancoAtual(no.id) : undefined;
          if (!reg || typeof reg !== "object")
            return recusa("Não consegui conferir o que já está lançado de avanço nesta tarefa — nada foi gravado. Recarregue a página (Ctrl+F5).");
          var jaAv = reg.no || {};
          if (!jaAv.i) {
            var dIni = no.dataInicio;
            var iniTxt = (dIni && typeof dIni.getFullYear === "function")
              ? dIni.getFullYear() + "-" + ("0" + (dIni.getMonth() + 1)).slice(-2) + "-" + ("0" + dIni.getDate()).slice(-2) : null;
            /* ⚠ SEM DATA PARA ANCORAR, RECUSA EM VOZ ALTA. Gravar `{id, p}`
               que o próprio leitor descarta é exatamente o defeito medido: o
               número fica no disco e a tela nunca o mostra. */
            if (!iniTxt)
              return recusa("Sem início real o % não é avanço: o motor o descarta e a célula continua em 0,0%. " +
                "Informe o Início real desta tarefa na coluna ao lado e digite o % de novo — nada foi gravado.");
            /* ⚠ INÍCIO PLANEJADO DEPOIS DO CORTE NÃO SERVE DE ÂNCORA — E ERA O
               CASO MEDIDO. A tarefa 1.1 do galpão foi empurrada pela
               reprogramação para começar em 23/09, um dia DEPOIS do corte de
               22/09; escrever esse planejado como início real faria o leitor
               descartar de novo, agora por `inicio-depois-do-corte` — o mesmo
               defeito com outro nome. Quem digita % numa tarefa assim está
               dizendo que ela começou antes do planejado, e só a pessoa sabe
               quando: a porta é a coluna Início real, e o recado a aponta. */
            if (reg.corte && iniTxt > reg.corte)
              return recusa("Esta tarefa está planejada para começar em " + dmaS(iniTxt) + ", DEPOIS da data de corte (" +
                dmaS(reg.corte) + ") — e sem início real o % não é avanço: o motor o descarta e a célula continua em 0,0%. " +
                "Se ela já começou, informe o Início real na coluna ao lado e digite o % de novo. Nada foi gravado.");
            av.ops.push({ alvo: "avanco", id: no.id, campo: "i", para: iniTxt });
            av.msg = (av.msg ? av.msg + " " : "") + "Marquei o início real em " + dmaS(iniTxt) +
              " (a data planejada); se começou em outro dia, corrija na coluna Início real.";
          }
          /* ⚠ FIM REAL GRAVADO COM % MENOR QUE 100: O FIM SAI JUNTO.
             Roteiro do defeito (revisão final, tarefa 1.2 do galpão, vinda do
             diário com 100%): digitei 60, o registro gravou `p:60` ao lado do
             `f:"2026-08-07"`, o leitor levantou `avisos:[{tipo:
             "avanco-fim-sem-100"}]` — um aviso que morre dentro do motor — e
             a célula continuou dizendo "100,0%", porque tarefa com fim real é
             concluída e concluída é 100. É o SIMÉTRICO do que a coluna Fim
             real já faz ao contrário (data → p:100), e o recado diz o que
             aconteceu: número a pessoa confere. */
          if (jaAv.f && Number(av.ops[0].para) < 100) {
            av.ops.push({ alvo: "avanco", id: no.id, campo: "f", para: null });
            av.msg = (av.msg ? av.msg + " " : "") + "Tirei o fim real de " + dmaS(jaAv.f) +
              ": com menos de 100% a tarefa volta a “em andamento”. Se ela terminou, informe 100%.";
          }
        }
        return { ok: true, ops: av.ops, msg: av.msg || "" };
      }
      if (ehExtra(no)) return this._digitarExtra(r, no, campo, texto, ctx, Cr);
      var cel = this.celulaEditavel(no, campo, { travado: ctx.travado, cron: ctx.cron, nos: arr(r && r.atividades),
        motivoEtapaTravada: (CX && typeof CX.motivoEtapaTravada === "function") ? function (c, n, id) { return CX.motivoEtapaTravada(c, n, id); } : null });
      if (!cel.ok) return recusa(cel.motivo + " Nada foi gravado.", ctx.travado ? { travadoAprovacao: true, porta: cel.porta } : (cel.porta ? { porta: cel.porta } : null));

      var folha = ehFolha(no), alvo = folha ? "folha" : "etapa", id = no.id, nome = nomeDe(no);
      var s = String(texto == null ? "" : texto).trim(), ops;
      var raiz = folha ? (ctx.cron && ctx.cron.sub) : ctx.cron;
      function gravado(k) { var m = raiz && raiz[k]; return (m && typeof m === "object" && !ehArr(m) && own(m, id)) ? JSON.parse(JSON.stringify(m[id])) : null; }

      if (campo === "dur") {
        // o número que a tabela mostra hoje (na folha, o da rede; marco = 0)
        var deD = no.marco ? 0 : (folha && no.duracaoRede != null ? no.duracaoRede : (no.duracao != null ? no.duracao : null));
        if (s === "") ops = [{ alvo: alvo, id: id, campo: "duracao", de: deD, para: null }];
        else {
          var n = this.lerDuracao(s);
          if (n === null) return recusa("“" + s + "” não é duração válida para " + nome + " — use dias úteis inteiros de 1 a 999 (0 = marco; vazio = volta à estimativa). Nada foi gravado.");
          ops = [{ alvo: alvo, id: id, campo: "duracao", de: deD, para: n }];
        }
      } else if (ctx.cron && typeof ctx.cron === "object" && !ehArr(ctx.cron) && typeof Cr._parseRede === "function") {
        /* planejador 1A: o "Depende de" com os quatro tipos (O23) — o ensaio
           e o "não muda nada" já saem de lá, com o mapa das subetapas */
        var dr = this._digitarRede(r, no, s, ctx, Cr);
        if (!dr.ok) return recusa(dr.msg, dr.porta ? { porta: dr.porta } : null);
        if (!dr.ops.length) return { ok: true, ops: dr.ops, msg: "" };
        return { ok: true, ops: dr.ops, msg: String(self.resumoOps(dr.ops, no, r, { Cronograma: Cr }) || "").replace(/\.\s*$/, "") + dr.bloco + "." };
      } else {
        var sp = this.normalizarPreds(s), pr, nums = {}, deT = "", fmt;
        if (folha) {
          var irmas = [];
          arr(r && r.atividades).forEach(function (x) {
            if (!x) return;
            if (ehFolha(x) && x.etapaId === no.etapaId) irmas.push({ id: x.id, numero: x.numero });
            if (x.numero != null) nums[x.id] = x.numero;
          });
          pr = Cr.parsePredsSub(sp, irmas, id);
          if (pr.invalidos.length) return recusa("“" + pr.invalidos.join(", ") + "” não é subetapa válida em “Depende de” da subetapa " + nome +
            " — use o nº de outra subetapa da MESMA etapa (" + irmas.filter(function (x) { return x.id !== id; }).map(function (x) { return x.numero; }).join(", ") +
            "); 0 = início da etapa; espera 2.1+3, avanço 2.1-1, começa junto 2.1II. Nada foi gravado.");
          fmt = function (x) { return Cr.predsTextoSub(x, nums); };
        } else {
          var ordem = (ehArr(ctx.ordemEtapas) && ctx.ordemEtapas.length) ? ctx.ordemEtapas : arr(r && r.etapas).map(function (e) { return e && e.id; });
          ordem.forEach(function (eid, i) { nums[eid] = i + 1; });
          pr = Cr.parsePreds(sp, ordem, id);
          if (pr.invalidos.length) {
            var inv = pr.invalidos.join(", ");
            var temII = pr.invalidos.some(function (tk) { return /ii/i.test(tk); });
            var temSub = pr.invalidos.some(function (tk) { return /^\d+\.(\d+|g)/i.test(tk); });
            return recusa(temII
              ? "“" + inv + "” não vale no “Depende de” da etapa " + nome + ": “começa junto” (II) só existe entre subetapas da MESMA etapa. Na etapa, use o nº da linha — 1, espera 1+7, avanço 1-3. Nada foi gravado."
              : "“" + inv + "” não é etapa válida em “Depende de” da etapa " + nome + " — use o nº da linha (1 a " + ordem.length + "), sem apontar para a própria etapa; 0 = começa no início da obra; espera 1+7, avanço 1-3." +
                (temSub ? " (Nº com ponto é de subetapa: o elo entre subetapas se escreve na linha da subetapa.)" : "") + " Nada foi gravado.");
          }
          fmt = function (x) { return Cr.predsTexto(x, nums); };
        }
        deT = no.predsExplicito ? fmt(no) : "";
        if (pr.preds === null) ops = [{ alvo: alvo, id: id, campo: "predecessoras", de: deT, para: null, paraTxt: "" }];
        else {
          var lags = Object.keys(pr.lags).length ? pr.lags : null;
          var tipos = (folha && pr.tipos && Object.keys(pr.tipos).length) ? pr.tipos : null;
          ops = [{ alvo: alvo, id: id, campo: "predecessoras", de: deT, para: pr.preds.slice(),
            paraTxt: fmt({ preds: pr.preds, predLag: pr.lags, predTipo: pr.tipos || {}, predsExplicito: true }) },
            { alvo: alvo, id: id, campo: "lags", de: gravado("lags"), para: lags }];
          if (folha) ops.push({ alvo: alvo, id: id, campo: "tipos", de: gravado("tipos"), para: tipos });
        }
      }

      /* ENSAIO numa cópia: prova que as operações se aplicam SEM ERRO antes de
         a tela gravar (aplicarOps não desfaz no meio) e descobre o "não muda
         nada" — digitar o que já está gravado não pode virar gravação, recado
         e foto de desfazer. */
      if (ctx.cron && typeof ctx.cron === "object" && !ehArr(ctx.cron)) {
        var ensaio = JSON.parse(JSON.stringify(ctx.cron)), ap = this.aplicarOps(ensaio, ops);
        if (ap.erros.length) return recusa("Não consegui montar esta alteração (" + ap.erros.join("; ") + ") — nada foi gravado.");
        if (!ap.mudou) return { ok: true, ops: [], msg: "" };
      }
      return { ok: true, ops: ops, msg: self.resumoOps(ops, no, r, { Cronograma: Cr }) };
    },

    /* O "DEPENDE DE" COM OS QUATRO TIPOS (planejador 1A, O23) — {ok, ops, msg}.
       A mesma sintaxe na grade, na tabela e no cartão; o parse e o formatador
       são os do MOTOR (`Cronograma._parseRede`/`_textoRede`), uma régua só.
       - A rede que CABE no legado (na etapa, só TI entre etapas; na subetapa,
         TI/II entre irmãs) grava pelos mapas de sempre, como hoje, e tira a
         entrada de `rede` do nó se havia (a 1.2.81 lê exatamente isso).
       - O resto (TT, IT, II na etapa, elo para subetapa de outra etapa, "E5")
         vira UMA operação `rede` com a lista digitada.
       - Ciclo é recusado ANTES de gravar, pelo `_dependeDe` (hoje o ciclo
         digitado passava e só o motor avisava).
       - "5" sozinho na subetapa segue recusado, com a dica de hoje mais a
         nova: "para a etapa 5 inteira, escreva E5".
       - "#11" é recusado com o motivo (nº da linha da planilha). */
    _digitarRede: function (r, no, texto, ctx, Cr) {
      var self = this, folha = ehFolha(no), id = no.id, nome = nomeDe(no), cron = ctx.cron;
      var sp = this.normalizarPreds(texto);
      var ordem = (ehArr(ctx.ordemEtapas) && ctx.ordemEtapas.length) ? ctx.ordemEtapas : arr(r && r.etapas).map(function (e) { return e && e.id; });
      var todas = [], nums = {}, etNum = {}, porFolhaEt = {};
      arr(r && r.atividades).forEach(function (x) {
        if (!x) return;
        if (ehFolha(x)) { todas.push({ id: x.id, numero: x.numero, etapaId: x.etapaId }); porFolhaEt[x.id] = x.etapaId; }
        if (x.numero != null) nums[x.id] = x.numero;
      });
      ordem.forEach(function (eid, i) { etNum[eid] = i + 1; if (!folha) nums[eid] = i + 1; });
      var irmas = todas.filter(function (x) { return x.etapaId === no.etapaId; });
      var idsX = arr(r && r.extras).map(function (x) { return x.id; });
      arr(r && r.extras).forEach(function (x) { nums[x.id] = x.numero; });
      var opts3 = { folhas: todas, etapaId: no.etapaId, etapas: ordem, extras: idsX };
      var pr = folha ? Cr.parsePredsSub(sp, irmas, id, opts3) : Cr.parsePreds(sp, ordem, id, opts3);
      function num(eid) { return own(etNum, eid) ? etNum[eid] : "?"; }
      if (pr.invalidos.length) {
        var m0 = pr.motivos[0] || {}, inv = pr.invalidos.join(", ");
        var outras = irmas.filter(function (x) { return x.id !== id; }).map(function (x) { return x.numero; }).join(", ");
        var msg;
        if (m0.motivo === "repetido") msg = "A mesma tarefa aparece duas vezes em “" + sp + "” — entre duas tarefas só existe uma ligação.";
        else if (m0.motivo === "linha") msg = "“" + m0.token + "” é o nº da linha da planilha; aqui use o nº da " + (folha ? "subetapa (" + outras + ")" : "etapa (1 a " + ordem.length + ")") + ".";
        else if (m0.motivo === "tipo") msg = "“" + m0.token + "” não é tipo de ligação: use TI (termina → começa, o padrão), II (começam juntas), TT (terminam juntas) ou IT (começa → termina). Ex.: 11TT+2.";
        else if (m0.motivo === "etapa-sem-e") {
          var n5 = String(m0.token).replace(/\D.*$/, "");
          msg = "“" + m0.token + "” não é subetapa válida em “Depende de” da subetapa " + nome + " — você quis dizer " + no.numero.split(".")[0] + "." + n5 +
            "? Use o nº de outra subetapa (" + outras + "); " + m0.dica + ".";
        } else if (m0.motivo === "propria-etapa") msg = "A subetapa " + nome + " não pode depender da etapa dela: use uma subetapa irmã (" + outras + ").";
        else if (m0.motivo === "folha-da-propria") msg = "A etapa " + nome + " não pode depender de “" + m0.token + "”, que está dentro dela.";
        else if (m0.motivo === "extra-folha") msg = "“" + m0.token + "”: tarefa sem preço se liga a etapa, não a subetapa.";
        else if (folha) msg = "“" + inv + "” não é subetapa válida em “Depende de” da subetapa " + nome + " — use o nº de outra subetapa (" + outras +
          "), de outra etapa (5.1) ou a etapa inteira (E5); 0 = início da etapa; espera 2.1+3, avanço 2.1-1, tipo 2.1II, 2.1TT, 2.1IT.";
        else msg = "“" + inv + "” não é etapa válida em “Depende de” da etapa " + nome + " — use o nº da linha (1 a " + ordem.length +
          "), sem apontar para a própria etapa, ou o nº de uma subetapa de outra etapa (5.2); 0 = começa no início da obra; espera 1+7, avanço 1-3; tipo 1II, 1TT, 1IT.";
        return { ok: false, msg: msg + " Nada foi gravado." };
      }
      // ⚠ o CICLO é recusado antes de gravar (o elo de volta que o motor ignoraria)
      for (var ix = 0; ix < arr(pr.extras).length; ix++) {
        var xn = self.acharNo(r, pr.extras[ix].i);
        if (xn && self._dependeDe(r, xn, id)) return { ok: false, msg: "“" + nums[pr.extras[ix].i] + "” fecharia um círculo: a tarefa " + nums[pr.extras[ix].i] + " já depende da etapa " + num(id) + ". Nada foi gravado." };
      }
      for (var i = 0; i < pr.elos.length; i++) {
        var el = pr.elos[i], alvoEt = own(porFolhaEt, el.i) ? porFolhaEt[el.i] : el.i;
        var meuEt = folha ? no.etapaId : id, circulo = null;
        if (folha && alvoEt === no.etapaId) {
          var irm = self.acharNo(r, el.i);
          if (irm && self._dependeDe(r, irm, id)) circulo = "a subetapa " + (irm.numero || "") + " já depende da " + no.numero;
        } else if (alvoEt !== meuEt) {
          var pe = self.acharNo(r, alvoEt);
          if (pe && self._dependeDe(r, pe, meuEt)) circulo = "a etapa " + num(alvoEt) + " já depende da etapa " + num(meuEt);
        }
        if (circulo) return { ok: false, msg: "“" + Cr._textoRede([el], nums, { etapasNum: folha ? etNum : null }) + "” fecharia um círculo: " + circulo + ". Nada foi gravado." };
      }
      /* o texto de HOJE: a rede digitada quando ela vale (assinatura), senão o legado */
      var CRd = depG("CronoRede", "./cronorede.js"), nv = folha ? "folhas" : "etapas", efet = null;
      var Rn = CRd ? CRd.normalizar(cron.rede) : null;
      if (Rn && own(Rn[nv], id)) efet = CRd.efetiva(cron, Rn, nv, id);
      var fmtLeg = function (x) { return folha ? Cr.predsTextoSub(x, nums) : Cr.predsTexto(x, nums); };
      var fmtRede = function (elos) { return Cr._textoRede(elos, nums, { etapasNum: folha ? etNum : null }); };
      var deT = (efet && efet.fonte === "rede") ? (efet.c ? "" : fmtRede(efet.elos)) : (no.predsExplicito ? fmtLeg(no) : "");
      /* as T que seguram esta etapa hoje (o `porExtras` do motor) e as digitadas agora */
      var xAntes = arr(no.porExtras).map(function (x) { return { i: x.id, t: x.tipo || "TI", l: x.lag || 0 }; });
      if (!folha && xAntes.length) deT = Cr.predsTexto(no, nums, (efet && efet.fonte === "rede" && !efet.c) ? { elos: efet.elos, extras: xAntes } : { extras: xAntes });
      var temEntrada = !!(Rn && own(Rn[nv], id));
      var ops;
      if (pr.preds === null) {
        ops = [{ alvo: folha ? "folha" : "etapa", id: id, campo: "predecessoras", de: deT, para: null, paraTxt: "", daRede: true }];
        if (temEntrada) ops.push({ alvo: folha ? "folha" : "etapa", id: id, campo: "rede", de: deT, para: null });
        /* "T1" sozinho = a cascata continua, e a T1 passa a segurar a etapa
           (EXTRAS §a, extras.md:227). ⚠ Sem esta op, o "T1" digitado sumia
           calado: a lista virava "cascata" e nenhuma tarefa era ligada. */
        if (!folha && (arr(pr.extras).length || xAntes.length)) {
          var txtSoT = Cr.predsTexto({ preds: [], predsExplicito: false }, nums, { extras: arr(pr.extras) });
          ops[0].paraTxt = txtSoT;
          ops.push({ alvo: "etapa", id: id, campo: "porExtras", de: deT, para: arr(pr.extras).map(function (x) { return { i: x.i, t: x.t, l: x.l }; }), paraTxt: txtSoT });
        }
      } else {
        var cabe = pr.elos.every(function (e) {
          var mesmo = folha ? (porFolhaEt[e.i] === no.etapaId) : own(etNum, e.i);
          return mesmo && (e.t === "TI" || (folha && e.t === "II"));
        });
        var paraTxt = fmtRede(pr.elos);
        if (cabe) {
          var raiz = folha ? (cron && cron.sub) : cron;
          var gravado = function (k) { var mm = raiz && raiz[k]; return (mm && typeof mm === "object" && !ehArr(mm) && own(mm, id)) ? JSON.parse(JSON.stringify(mm[id])) : null; };
          ops = [{ alvo: folha ? "folha" : "etapa", id: id, campo: "predecessoras", de: deT, para: pr.preds.slice(), paraTxt: paraTxt, daRede: true },
            { alvo: folha ? "folha" : "etapa", id: id, campo: "lags", de: gravado("lags"), para: Object.keys(pr.lags).length ? pr.lags : null, daRede: true }];
          if (folha) ops.push({ alvo: "folha", id: id, campo: "tipos", de: gravado("tipos"), para: Object.keys(pr.tipos).length ? pr.tipos : null, daRede: true });
          if (temEntrada) ops.push({ alvo: folha ? "folha" : "etapa", id: id, campo: "rede", de: deT, para: null });
        } else {
          ops = [{ alvo: folha ? "folha" : "etapa", id: id, etapaId: no.etapaId, campo: "rede", de: deT, para: { elos: pr.elos }, paraTxt: paraTxt }];
        }
        /* as T: o `sucs` das tarefas sem preço (a etapa nunca recebe o id da
           extra em `predecessoras`, I3). "0,T1" = sem etapa predecessora + T1 */
        if (!folha && (arr(pr.extras).length || xAntes.length)) {
          var txtNovo = Cr.predsTexto({ preds: pr.preds, predLag: pr.lags, predsExplicito: pr.preds !== null }, nums, { elos: pr.elos, extras: arr(pr.extras) });
          ops.forEach(function (o2) { if (o2.paraTxt != null) o2.paraTxt = txtNovo; });
          ops.push({ alvo: "etapa", id: id, campo: "porExtras", de: deT, para: arr(pr.extras).map(function (x) { return { i: x.i, t: x.t, l: x.l }; }), paraTxt: txtNovo });
        }
      }
      /* ENSAIO numa cópia (o contrato de hoje): aplica sem erro? muda algo? */
      var ensaio = JSON.parse(JSON.stringify(cron)), ap = this.aplicarOps(ensaio, ops, { folhaDe: porFolhaEt, etapaIds: ordem, inicioFixo: ctx.inicioFixo });
      if (ap.portaInicio) return { ok: false, porta: "inicio", msg: "Para a tarefa sem preço segurar a etapa " + nome + ", fixe o início da obra: sem ele, a data que ela segura mudaria a cada dia nos aparelhos de versão anterior. Nada foi gravado." };
      if (ap.erros.length) return { ok: false, msg: "Não consegui montar esta alteração (" + ap.erros.join("; ") + ") — nada foi gravado." };
      if (!ap.mudou) return { ok: true, ops: [], bloco: "" };
      var cruz = pr.elos.filter(function (e) { return folha ? porFolhaEt[e.i] !== no.etapaId : !own(etNum, e.i); });
      var bloco = "";
      if (cruz.length && folha) bloco = " · A etapa " + num(no.etapaId) + " anda inteira para a " + no.numero + " cumprir a ligação com outra etapa: a ordem das subetapas dentro dela não muda.";
      return { ok: true, ops: ops, msg: "", bloco: bloco };
    },

    /* A COLUNA CALENDÁRIO DA GRADE (planejador 2A) — {ok, ops, msg}.
       `calId` é o id escolhido no seletor, ou "" para voltar à régua da obra.
       ⚠ TODAS as recusas (TT/IT em calendário próprio, elo cruzado, subetapa
       com término, início flutuante — O11/O14) já moram no `aplicarOps`, e é
       de lá que o recado sai: uma segunda lista de recusas aqui divergiria
       da que grava na primeira manutenção, e a pessoa veria a porta abrir na
       tela e fechar no salvar. Por isso o ENSAIO numa cópia é obrigatório. */
    opsDoCalendario: function (r, no, calId, ctx) {
      ctx = ctx || {};
      var id = no && no.id, nome = nomeDe(no);
      function recusa(msg, extra) { var o = { ok: false, ops: [], msg: msg }, k; for (k in (extra || {})) if (own(extra, k)) o[k] = extra[k]; return o; }
      if (id == null) return recusa("Esta linha não existe mais neste cronograma.");
      var cel = this.celulaEditavel(no, "cal", { travado: ctx.travado });
      if (!cel.ok) return recusa(cel.motivo + " Nada foi gravado.", cel.porta ? { porta: cel.porta } : null);
      var v = String(calId == null ? "" : calId).trim();
      var de = (ctx.cron && ehObj(ctx.cron.cal) && ehObj(ctx.cron.cal.de) && own(ctx.cron.cal.de, id)) ? String(ctx.cron.cal.de[id]) : null;
      var para = v ? v : null;
      if (String(de == null ? "" : de) === String(para == null ? "" : para)) return { ok: true, ops: [], msg: "" };
      var ops = [{ alvo: "calendario", id: id, campo: "de", de: de, para: para }];
      if (ctx.cron && ehObj(ctx.cron)) {
        var ensaio = JSON.parse(JSON.stringify(ctx.cron)), ap = this.aplicarOps(ensaio, ops, { orc: ctx.orc, inicioFixo: ctx.inicioFixo });
        if (ap.portaInicio) return recusa("Para " + nome + " trabalhar num calendário próprio, fixe o início da obra: sem ele, a data em que a frente começa mudaria a cada dia nos aparelhos de versão anterior. Nada foi gravado.", { porta: "inicio" });
        if (ap.erros.length) return recusa(ap.erros[0].charAt(0).toUpperCase() + ap.erros[0].slice(1) + ". Nada foi gravado.");
        /* ⚠ escrito com o `mudou` NOMEADO, e não com o `if (!ap.mudou)` do
           `opsDaDigitacao`: o controle negativo da test-ganttui-digitacao mira
           aquela linha PELO TEXTO e exige achá-la uma vez só — duas cópias
           idênticas desligam o controle sem reprovar nada (memória "controle
           negativo não roda na árvore real"). */
        var mudouCal = ap.mudou === true;
        if (!mudouCal) return { ok: true, ops: [], msg: "" };
      }
      var nm = "";
      if (para && ctx.cron && ehObj(ctx.cron.cal)) arr(ctx.cron.cal.lista).forEach(function (c) { if (c && c.id === para) nm = String(c.nome || para); });
      return { ok: true, ops: ops, msg: nome + " — calendário: " + (para ? (nm || para) : "régua da obra") + (de ? "" : "") + "." };
    },

    /* A LINHA T (planejador 1A, EXTRAS §a) — {ok, ops, msg}. Nome, duração
       (inteiro 0..999; 0 = marco; a tarefa sem preço não tem estimativa, então
       vazio é recusado) e "Depende de" (etapas e outras T; subetapa recusada).
       Nenhum modo trava a linha T; o aprovado trava (porta da revisão). */
    /* ⚠ SUBIR E DESCER A TAREFA SEM PREÇO — A OPERAÇÃO SE MONTA AQUI, E NÃO
       NA TELA. Roteiro do defeito (revisão final, 22/09/2026, medido com
       clique real e lendo o disco a cada passo): a fiação mandava
       `{alvo:"extra", campo:"mover", para: -1|1}`, e o gravador espera
       `para = {apos, indice}`. Com um número no lugar do objeto,
       `mv.apos == null` fazia `delete cp.apos` e `mv.indice == null` fazia
       `ix = L.length` — quer dizer: os DOIS botões arrancavam a âncora da
       tarefa e a jogavam para a última linha. Medido: um clique em "Descer"
       levou a T1 da 2ª linha para depois de 6.0 Acabamentos e apagou o
       `apos` do disco; "Subir" depois disso respondia "Nada mudou no
       cronograma" três vezes seguidas — não havia caminho de volta pela
       tela. Com duas tarefas, "Subir" na do meio a mandou para o FIM, igual
       a "Descer". A direção (`data-dir`) nunca era lida por ninguém.

       O MODELO DA POSIÇÃO: a linha T entra depois do BLOCO da etapa em que
       foi pendurada (`x.apos`, ver `CronoExecUI.intercalarExtras`), e várias
       na mesma etapa ficam na ordem da lista `extras`. Então a posição é o
       par (etapa âncora, posição entre as irmãs), e mover é andar UM passo
       nesse par. Descer na última irmã da etapa E passa para a PRIMEIRA
       posição da etapa seguinte; subir na primeira passa para a ÚLTIMA da
       anterior.

       ⚠ `apos` NUNCA CAI PARA AUSENTE POR OMISSÃO. Campo ausente não quer
       dizer "no começo": o `intercalarExtras` põe as sem âncora DEPOIS de
       tudo (medido — e o comentário do `itemDisco` que dizia "antes da 1ª
       etapa" estava errado). Por isso a última etapa é o fim da linha para o
       Descer, e a tarefa que já está sem âncora sobe para a última etapa.

       Devolve {ok, ops, msg} — o mesmo contrato da digitação.
       `ordemEtapas` = ids das etapas na ordem da tela; `extras` = a lista
       `cron.extras` como está no disco. */
    opsDoExtraMover: function (id, dir, ordemEtapas, extras) {
      var d = Number(dir) < 0 ? -1 : 1;
      var L = arr(extras), ordem = arr(ordemEtapas).filter(function (e) { return e != null; });
      var eu = null, k;
      for (k = 0; k < L.length; k++) if (L[k] && L[k].id === id) eu = L[k];
      if (!eu) return { ok: false, ops: [], msg: "Esta tarefa sem preço não existe mais neste cronograma — nada foi movido." };
      if (!ordem.length) return { ok: false, ops: [], msg: "Este cronograma não tem etapas para pendurar a tarefa — nada foi movido." };
      var ehEtapa = {};
      ordem.forEach(function (e) { ehEtapa[e] = true; });
      /* o slot de cada tarefa: o índice da etapa âncora, ou `ordem.length`
         (sem âncora = depois de tudo). Âncora que aponta para etapa que não
         existe mais conta como sem âncora — é o que a leitura já faz. */
      function slotDe(x) {
        var a = (x && x.apos != null) ? String(x.apos) : "";
        var i = (a && own(ehEtapa, a)) ? ordem.indexOf(a) : -1;
        return i >= 0 ? i : ordem.length;
      }
      var meuSlot = slotDe(eu);
      /* as irmãs do MESMO slot, na ordem da lista `extras` */
      var irmas = [];
      for (k = 0; k < L.length; k++) if (L[k] && slotDe(L[k]) === meuSlot) irmas.push(L[k].id);
      var posIrma = irmas.indexOf(id);
      var novoSlot = meuSlot, novaPos;
      if (d > 0) {
        if (posIrma < irmas.length - 1) novaPos = posIrma + 1;
        else if (meuSlot < ordem.length - 1) { novoSlot = meuSlot + 1; novaPos = 0; }
        else return { ok: true, ops: [], msg: "" };
      } else {
        if (posIrma > 0) novaPos = posIrma - 1;
        else if (meuSlot > 0) { novoSlot = meuSlot - 1; novaPos = -1; }   /* -1 = no fim do grupo de cima */
        else return { ok: true, ops: [], msg: "" };
      }
      var aposNovo = ordem[novoSlot];
      /* o `indice` é a posição na lista `extras` SEM esta tarefa — é assim
         que o gravador aplica (`splice` para tirar, `splice` para pôr) */
      var Lsem = [], iOriginal = 0;
      for (k = 0; k < L.length; k++) {
        if (L[k] && L[k].id === id) { iOriginal = Lsem.length; continue; }
        Lsem.push(L[k]);
      }
      var irmasNovas = [];
      for (k = 0; k < Lsem.length; k++) if (Lsem[k] && slotDe(Lsem[k]) === novoSlot) irmasNovas.push(k);
      var indice;
      if (!irmasNovas.length) indice = Math.min(iOriginal, Lsem.length);
      else if (novaPos < 0 || novaPos >= irmasNovas.length) indice = irmasNovas[irmasNovas.length - 1] + 1;
      else indice = irmasNovas[novaPos];
      return { ok: true, ops: [{ alvo: "extra", id: id, campo: "mover",
        de: { apos: (eu.apos != null ? String(eu.apos) : null), indice: iOriginal },
        para: { apos: aposNovo, indice: indice } }], msg: "" };
    },

    _digitarExtra: function (r, no, campo, texto, ctx, Cr) {
      var self = this, id = no.id, nome = nomeDe(no), s = String(texto == null ? "" : texto).trim(), ops;
      function recusa(msg, extra) { var o = { ok: false, ops: [], msg: msg }, k; for (k in (extra || {})) if (own(extra, k)) o[k] = extra[k]; return o; }
      if (ctx.travado) return recusa(MOTIVO_APROVADO + " Nada foi gravado.", { travadoAprovacao: true, porta: "revisao" });
      var ordem = (ehArr(ctx.ordemEtapas) && ctx.ordemEtapas.length) ? ctx.ordemEtapas : arr(r && r.etapas).map(function (e) { return e && e.id; });
      if (campo === "nome") {
        var nm = s.replace(/\s+/g, " ").slice(0, 80);
        if (!nm) return recusa("A tarefa " + (no.numero || "") + " precisa de nome — nada foi gravado.");
        ops = [{ alvo: "extra", id: id, campo: "nome", de: no.nome, para: nm }];
      } else if (campo === "dur") {
        var n = s === "" ? null : this.lerDuracao(s);
        if (n === null) return recusa("“" + s + "” não é duração válida para " + nome + " — a tarefa sem preço não tem estimativa: use dias úteis inteiros de 1 a 999 (0 = marco). Nada foi gravado.");
        ops = [{ alvo: "extra", id: id, campo: "duracao", de: no.marco ? 0 : no.duracao, para: n }];
      } else if (campo === "pred") {
        var nums = {};
        ordem.forEach(function (eid, i) { nums[eid] = i + 1; });
        arr(r && r.extras).forEach(function (x) { nums[x.id] = x.numero; });
        var todas = [];
        arr(r && r.atividades).forEach(function (x) { if (x && ehFolha(x)) todas.push({ id: x.id, numero: x.numero, etapaId: x.etapaId }); });
        var pr = Cr.parsePredsExtra(this.normalizarPreds(s), id, { folhas: todas, etapas: ordem, extras: arr(r && r.extras).map(function (x) { return x.id; }) });
        if (pr.invalidos.length) {
          var m0 = pr.motivos[0] || {};
          return recusa(m0.motivo === "extra-folha" ? "“" + m0.token + "”: tarefa sem preço se liga a etapa, não a subetapa. Nada foi gravado."
            : (m0.motivo === "repetido" ? "A mesma tarefa aparece duas vezes em “" + s + "” — entre duas tarefas só existe uma ligação. Nada foi gravado."
              : "“" + pr.invalidos.join(", ") + "” não vale no “Depende de” da tarefa " + nome + " — use o nº da etapa (1 a " + ordem.length + ") ou de outra tarefa sem preço (T1…); vazio ou 0 = começa no início da obra; espera 3+5, tipo 3II, 3TT. Nada foi gravado."));
        }
        for (var k = 0; k < pr.extras.length; k++) {
          var alvoN = self.acharNo(r, pr.extras[k].i);
          if (alvoN && self._dependeDe(r, alvoN, id)) return recusa("“" + nums[pr.extras[k].i] + "” fecharia um círculo: " + nums[pr.extras[k].i] + " já depende da tarefa " + (no.numero || "") + ". Nada foi gravado.");
        }
        var deP = Cr._textoRede(arr(no.preds).map(function (p) { return { i: p, t: (no.predTipo && no.predTipo[p]) || "TI", l: (no.predLag && no.predLag[p]) || 0, x: true }; }), nums, { vazioExplicito: false });
        var paraX = pr.extras.map(function (x) { return { i: x.i, t: x.t, l: x.l }; });
        ops = [{ alvo: "extra", id: id, campo: "predecessoras", de: deP, para: paraX,
          paraTxt: Cr._textoRede(paraX.map(function (x) { return { i: x.i, t: x.t, l: x.l, x: true }; }), nums, { vazioExplicito: false }) }];
      } else return recusa("Campo desconhecido: " + campo + ".");
      if (ctx.cron && typeof ctx.cron === "object" && !ehArr(ctx.cron)) {
        var ensaio = JSON.parse(JSON.stringify(ctx.cron)), ap = this.aplicarOps(ensaio, ops, { etapaIds: ordem, inicioFixo: ctx.inicioFixo });
        if (ap.portaInicio) return recusa("Para a tarefa " + (no.numero || "") + " segurar uma etapa, fixe o início da obra: sem ele, a data que ela segura mudaria a cada dia nos aparelhos de versão anterior. Nada foi gravado.", { porta: "inicio" });
        if (ap.erros.length) return recusa("Não consegui montar esta alteração (" + ap.erros.join("; ") + ") — nada foi gravado.");
        if (!ap.mudou) { return { ok: true, ops: [], msg: "" }; }
      }
      return { ok: true, ops: ops, msg: self.resumoOps(ops, no, r, { Cronograma: Cr }) };
    },

    /* O ELO QUE “APERTA” (planejador 2A, O20) — a sucessora começa EXATAMENTE
       onde este elo a deixa começar. É o que decide a seta VERMELHA entre duas
       críticas: entre duas críticas pode haver elo com sobra, e pintá-lo de
       vermelho mentiria o caminho.
       ⚠ DONO ÚNICO de propósito: a mesma conta vivia copiada no `UI._gantt` e
       no `CronoExecUI.gantt`. As duas leem `predDesloc` como deslocamento
       equivalente de TI (O20) — e assim continuam com TT, IT, cruzado e
       tarefa sem preço, porque o motor converte todo tipo em `predDesloc`.
       Com duas cópias da regra, um TT apertado sairia vermelho no PDF e cinza
       na tela (memória “réplica de parser apodrece”).
       `params` = r.params (o paralelismo, para o elo sem `predDesloc`). */
    eloAperta: function (suc, pred, predId, params) {
      if (!suc || !pred || predId == null) return false;
      var off = (suc.predDesloc && suc.predDesloc[predId] != null) ? suc.predDesloc[predId]
        : -Math.floor(((params && params.paralelismo) || 0) * fin(pred.duracao, 0));
      return suc.inicio === Math.max(0, fin(pred.fim, 0) + off);
    },

    /* OS QUATRO PISOS DE DATA QUE MANDAM NA ETAPA (planejador 2A, O11/O29).
       Devolve `null` quando a data não está mandando, ou
       {tipo, data, dataBR, inicioRede, rotulo, motivo, daMaquina}.

       ROTEIRO DO DEFEITO QUE ELA FECHA (medido na 1.2.77, OBRA TESTE):
       arrastar a etapa 4 gravou "não iniciar antes de 12/01/2028" — um campo
       que a tabela não mostra; digitar "Depende de = 1" (a 1 termina em
       28/09/2026) gravou, e a etapa CONTINUOU em 12/01/2028, sem recado
       nenhum. Quem digita acha que o campo não funciona. `rDepois` é o
       estimar DEPOIS de gravar: a data manda quando a tarefa começa
       exatamente nela e a rede a poria antes (`restricao.ativa` do motor). A
       tela junta o recado e a porta.

       ⚠ `nia` é a de sempre (“não iniciar antes de”, o arrasto do Gantt).
       A 2A acrescentou `dia`, `dta` e `nta`: os três também EMPURRAM o início
       (o motor marca `ativa` neles desde a 1A), e a caixa “Datas fixadas no
       Gantt” só mostrava `nia` — a pessoa digitava “deve terminar em”, a
       etapa andava, e nenhuma linha dizia por quê. `nid` e `tae` ficam de
       fora de propósito: são TETOS, avisam e não empurram (O22).

       ⚠ A RESTRIÇÃO ESCRITA PELA MÁQUINA (`origem:"mat"`, a sombra que faz a
       1.2.81 desenhar a mesma data — O2) NÃO É “data fixada”: ninguém a
       fixou. Sem esta guarda, a caixa ofereceria [Soltar a data] para um piso
       que a próxima projeção reescreve — trava com porta falsa (memória
       “porta prometida precisa existir”). Ela entra na camada “restrições” do
       Gantt, com o ⌧, e `daMaquina` diz isso a quem chama.
       `cron` = o cronograma GRAVADO (sem ele não dá para saber a origem, e a
       função devolve a leitura de sempre).

       ⚠ REVISÃO 4 (O29): o MOTIVO do piso da máquina sai do MOTOR —
       `et.porExtras` (tarefa sem preço), `no.avanco.empurradoDias` (avanço),
       `et.calendarioId` (frente própria), `restricao.tipo === "mtp"` (o mais
       tarde possível) —, NUNCA do campo `por` do disco: ele deixou de ser
       gravado (forma enxuta F1), e um `por` vindo de outro aparelho é
       ignorado na leitura. Motivo lido do disco seria motivo velho. */
    _ROT_RESTR: { nia: "não iniciar antes de", dia: "deve iniciar em", dta: "deve terminar em", nta: "não terminar antes de" },
    dataFixadaDomina: function (rDepois, id, cron) {
      if (!rDepois || id == null) return null;
      var et = null, lista = arr(rDepois.etapas);
      for (var i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === id) { et = lista[i]; break; }
      if (!et) et = this.acharNo(rDepois, id);
      var rs = et && et.restricao;
      if (!rs || !own(this._ROT_RESTR, rs.tipo)) return null;
      var ativa = rs.ativa === true;
      if (rs.ativa == null) ativa = rs.indice != null && rs.inicioRede != null && Math.round(fin(et.inicio, -1)) === Math.round(fin(rs.indice, -2)) && fin(rs.indice, 0) > fin(rs.inicioRede, 0);
      if (!ativa) return null;
      var rd = cron && ehObj(cron.restricoes) && ehObj(cron.restricoes[id]) ? cron.restricoes[id] : null;
      var daMaquina = !!rd && rd.origem === "mat";
      return { tipo: String(rs.tipo), data: String(rs.data), dataBR: dmaS(rs.data), inicioRede: rs.inicioRede,
        rotulo: this._ROT_RESTR[rs.tipo], daMaquina: daMaquina, motivo: daMaquina ? this.motivoDoPiso(rDepois, id) : "" };
    },

    /* POR QUE A MÁQUINA ESCREVEU ESTE PISO (planejador 2A, O29) — texto curto
       para o ⌧ e para o recado. Sai do RESULTADO DO MOTOR desta renderização,
       nunca do disco: o `por` foi tirado da forma gravada (F1), e um motivo
       gravado envelhece calado (memória “número na interface envelhece”).
       Ordem: tarefa sem preço → avanço → o mais tarde possível → frente
       própria → rede. "" quando o motor não sabe dizer — e aí a tela diz
       isso, em vez de inventar. */
    motivoDoPiso: function (r, id) {
      var et = null, i, lista = arr(r && r.etapas);
      for (i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === id) { et = lista[i]; break; }
      var no = this.acharNo(r, id);
      var alvo = et || no;
      if (!alvo) return "";
      var px = arr(alvo.porExtras);
      if (px.length) {
        var ns = px.map(function (x) { return String((x && x.numero) || "T"); });
        return ns.length === 1 ? "a tarefa sem preço " + ns[0] + " segura esta etapa" : "as tarefas sem preço " + ns.join(", ") + " seguram esta etapa";
      }
      var av = (no && no.avanco) || (et && et.avanco);
      if (av && fin(av.empurradoDias, 0) > 0) return "o avanço lançado empurrou " + av.empurradoDias + " dia(s) útil(eis)";
      if (av && (av.estado === "andamento" || av.estado === "concluida")) return "o avanço lançado fixou o início real";
      var rs = alvo.restricao;
      if (rs && rs.tipo === "mtp") return "“o mais tarde possível”";
      if (alvo.calendarioId) return "a frente tem calendário próprio";
      return "";
    }
  };

  global.GanttUI = GanttUI;
  if (typeof module !== "undefined" && module.exports) module.exports = GanttUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
