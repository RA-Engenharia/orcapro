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
      e.pxDia = this.pxDeNivel(e.nivel, e.dias, e.largura);
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

    alvoDoNo: function (no) { return (no && (no.tipo === "subetapa" || no.tipo === "soltos")) ? "folha" : "etapa"; },

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
      var self = this, vistos = {}, fila = arr(no && no.preds).slice(), giros = 0;
      while (fila.length && giros++ < 5000) {
        var pid = fila.shift();
        if (pid == null || own(vistos, pid)) continue;
        vistos[pid] = true;
        if (pid === id) return true;
        var p = self.acharNo(r, pid);
        if (p) arr(p.preds).forEach(function (q) { if (!own(vistos, q)) fila.push(q); });
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
    aplicarOps: function (cron, ops) {
      var out = { mudou: false, aplicadas: 0, erros: [] };
      if (!cron || typeof cron !== "object" || ehArr(cron)) { out.erros.push("cronograma ausente"); return out; }
      function obj(o, k) { if (!o[k] || typeof o[k] !== "object" || ehArr(o[k])) o[k] = {}; return o[k]; }
      var antes = JSON.stringify(cron);
      var lista = arr(ops);
      for (var i = 0; i < lista.length; i++) {
        var op = lista[i];
        if (!op || op.id == null) { out.erros.push("operação sem id"); continue; }
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
            obj(W(), "predecessoras")[op.id] = op.para.slice();
          } else { out.erros.push("predecessoras precisa ser lista em " + op.id); continue; }
        } else if (op.campo === "lags") {
          if (op.para == null || typeof op.para !== "object" || !Object.keys(op.para).length) tira(raiz, "lags", op.id);
          else {
            var c = {}, ks = Object.keys(op.para), j;
            for (j = 0; j < ks.length; j++) c[ks[j]] = Math.round(fin(op.para[ks[j]], 0));
            obj(W(), "lags")[op.id] = c;
          }
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
        } else if (op.campo === "restricaoData") {
          if (folha) { out.erros.push("restrição de data é da etapa, não da subetapa (" + op.id + ")"); continue; }
          if (op.para == null) tira(cron, "restricoes", op.id);
          else if (op.para.tipo !== "nia" && op.para.tipo !== "tae") { out.erros.push("tipo de restrição inválido em " + op.id); continue; }
          else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(op.para.data || ""))) { out.erros.push("data de restrição inválida em " + op.id); continue; }
          else obj(cron, "restricoes")[op.id] = { tipo: op.para.tipo, data: String(op.para.data) };
        } else { out.erros.push("campo desconhecido: " + op.campo); continue; }
        out.aplicadas++;
      }
      out.mudou = JSON.stringify(cron) !== antes;
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
       `opts` (opcional): {rDepois (o estimar DEPOIS de gravar: dá o número
       da estimativa quando a duração volta a ela), Cronograma (injetado)}. */
    resumoOps: function (ops, no, r, opts) {
      opts = opts || {};
      var self = this, grupos = [], porId = {};
      var Cr = opts.Cronograma || ((typeof Cronograma !== "undefined") ? Cronograma : null);
      function nomeDoId(id) {
        if (no && no.id === id) return nomeDe(no);
        var n = r ? self.acharNo(r, id) : null;
        return n ? nomeDe(n) : "";
      }
      arr(ops).forEach(function (op) {
        if (!op) return;
        var txt = "", fam = op.campo === "predecessoras" || op.campo === "lags" || op.campo === "tipos";
        if (op.campo === "duracao") txt = self._txtDuracao(op, opts.rDepois);
        else if (op.campo === "restricaoData") txt = op.para ? "início fixado em " + dmaS(op.para.data) + " (não iniciar antes de)" : "data fixada removida — a etapa volta para onde a rede a põe";
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
      var P = g.predecessoras, L = g.lags, T = g.tipos, folha = g.alvo === "folha";
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
    celulaEditavel: function (no, campo, ctx) {
      ctx = ctx || {};
      if (campo !== "dur" && campo !== "pred") return { ok: false, motivo: "Campo desconhecido: " + campo + "." };
      if (!no || no.id == null) return { ok: false, motivo: "Esta linha não existe mais neste cronograma." };
      if (ctx.travado) return { ok: false, porta: "revisao", motivo: MOTIVO_APROVADO };
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
    normalizarPreds: function (texto) {
      return String(texto == null ? "" : texto).trim()
        .replace(/\s*([+\-])\s*(?=\d)/g, "$1")
        .replace(/(\d|g)\s+(ii)(?=$|[\s,;+\-])/gi, "$1$2");
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

    /* A DATA FIXADA MANDA? — {data, dataBR, inicioRede} ou null.
       ROTEIRO DO DEFEITO (medido na 1.2.77, OBRA TESTE): arrastar a etapa 4
       gravou "não iniciar antes de 12/01/2028" (um campo que a tabela não
       mostra); digitar "Depende de = 1" (a 1 termina em 28/09/2026) gravou —
       e a etapa CONTINUOU em 12/01/2028, sem recado nenhum. Quem digita acha
       que o campo não funciona. `rDepois` é o estimar DEPOIS de gravar: manda
       a data quando a etapa começa exatamente nela e a rede a poria antes
       (`restricao.ativa` do motor). A tela junta o recado e a porta. */
    dataFixadaDomina: function (rDepois, id) {
      if (!rDepois || id == null) return null;
      var et = null, lista = arr(rDepois.etapas);
      for (var i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === id) { et = lista[i]; break; }
      if (!et) et = this.acharNo(rDepois, id);
      var rs = et && et.restricao;
      if (!rs || rs.tipo !== "nia") return null;
      var ativa = rs.ativa === true;
      if (rs.ativa == null) ativa = rs.indice != null && rs.inicioRede != null && Math.round(fin(et.inicio, -1)) === Math.round(fin(rs.indice, -2)) && fin(rs.indice, 0) > fin(rs.inicioRede, 0);
      return ativa ? { data: String(rs.data), dataBR: dmaS(rs.data), inicioRede: rs.inicioRede } : null;
    }
  };

  global.GanttUI = GanttUI;
  if (typeof module !== "undefined" && module.exports) module.exports = GanttUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
