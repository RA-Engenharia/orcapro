/* =====================================================================
 * cronocal.js — CronoCal: os CALENDÁRIOS das frentes (turnos, sábado meio
 * período, exceções): capacidade por dia, consumo, o primeiro dia de
 * trabalho, o recuo a partir de um término e a régua de desenho.
 *
 * Planejador, fatia 1A (motor), commit CAL. Espec: ESPEC-planejador.md
 * (rev. 4) §1.3, §1.9, §2.3-E5/E6, §2.4, §2.8, O11, O14, O27, I15, I16; o
 * desenho da frente: calendario.md §b e §c.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * A obra tem UMA régua (5, 6 ou 7 dias por semana, com feriados): é ela que
 * o motor de sempre usa, e é ela que a 1.2.81 lê da sombra. Uma FRENTE pode
 * trabalhar noutro ritmo (montagem 7×7, civil com sábado até 12h, parada de
 * planta). Este módulo é a régua ÚNICA dessa segunda contagem: quantas
 * "horas de dia cheio" cada frente tem num dia, quantos dias corridos ela
 * gasta para cumprir N dias de trabalho, e em que dia real ela começa.
 *
 * ⚠ A RÉGUA DA OBRA NUNCA MUDA. O calendário da frente devolve DATAS REAIS;
 *   quem converte data real em índice da obra é o `phi` do motor
 *   (`Cronograma._regua`), e é essa conversão que faz a 1.2.81, lendo a
 *   sombra, cair no mesmo lugar. Espera e sobreposição são SEMPRE contadas em
 *   dias úteis da obra (decisão técnica da §5.1: medido 85 × 80 DU).
 * ⚠ SEM TETO NA CONVERSÃO (I15): a guarda do consumo é de 10 anos, e ela
 *   PARA com aviso — nunca trava a aba. `cal.indice(ms, totalDias)` prende no
 *   fim do plano e o resultado depende de quanto a tabela já cresceu; por
 *   isso o motor usa `phi` com o limite grande, nunca o índice por piso.
 * ⚠ LEITURA SEMPRE EM CÓPIA: `contexto`/`validar` nunca escrevem no
 *   cronograma (nada grava ao abrir, I6). Forma torta vira aviso, nunca
 *   exceção.
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
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function ehObj(v) { return !!v && typeof v === "object" && !ehLista(v); }
  function numOk(v, a, b) { return typeof v === "number" && isFinite(v) && v >= a && v <= b; }
  function chDia(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function msDeData(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? "" : s));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d.getTime();
  }
  function meiaNoite(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function maisDias(ms, n) { var d = new Date(ms); d.setDate(d.getDate() + n); return meiaNoite(d.getTime()); }

  /* guarda de 10 anos, a mesma de `addDiasUteis` (js/cronograma.js:203-216):
     um calendário torto que nenhuma validação pegou não pode travar a aba */
  var GIRO_MAX = 3660;

  /* Os cinco modelos do botão "Novo calendário". `h[0..6]` = horas de
     domingo a sábado, na ordem de `Date.getDay()`. */
  var MODELOS = [
    { id: "m_7x7", nome: "Montagem 7x7", h: [8, 8, 8, 8, 8, 8, 8], turnos: 1, fer: "obra" },
    { id: "m_sab", nome: "Sábado até 12h", h: [0, 8, 8, 8, 8, 8, 4], turnos: 1, fer: "obra" },
    { id: "m_5x8", nome: "Seg a sex, 8h", h: [0, 8, 8, 8, 8, 8, 0], turnos: 1, fer: "obra" },
    { id: "m_2t", nome: "Dois turnos (seg a sex)", h: [0, 8, 8, 8, 8, 8, 0], turnos: 2, fer: "obra" },
    { id: "m_par", nome: "Parada de planta (24h, feriado trabalha)", h: [12, 12, 12, 12, 12, 12, 12], turnos: 2, fer: "trabalha" }
  ];

  var CronoCal = {
    pronto: true,
    _dep: dep,
    MODELOS: MODELOS,
    GIRO_MAX: GIRO_MAX,

    /* VALIDA um calendário do disco (ou do formulário). Devolve
       {ok, valor (normalizado), erros: [{campo, msg}]}.
       ⚠ Calendário sem NENHUM dia de trabalho é inválido: com ele a linha
         consumiria para sempre. A leitura o descarta e a linha volta para a
         régua da obra, com o aviso `calendario-invalido` (§1.9). */
    validar: function (c) {
      var e = [], i;
      if (!ehObj(c)) return { ok: false, valor: null, erros: [{ campo: "forma", msg: "Calendário em formato inválido." }] };
      var id = typeof c.id === "string" ? c.id : "";
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) e.push({ campo: "id", msg: "Identificador do calendário inválido." });
      var nome = typeof c.nome === "string" ? c.nome.replace(/\s+/g, " ").trim().slice(0, 60) : "";
      if (!nome) e.push({ campo: "nome", msg: "O calendário precisa de nome." });
      var h = [], somaH = 0;
      if (!ehLista(c.h) || c.h.length !== 7) e.push({ campo: "h", msg: "As horas por dia da semana precisam ser sete números (domingo a sábado)." });
      else {
        for (i = 0; i < 7; i++) {
          if (!numOk(c.h[i], 0, 24)) { e.push({ campo: "h", msg: "Horas do dia " + i + " fora de 0 a 24." }); h.push(0); continue; }
          h.push(c.h[i]); somaH += c.h[i];
        }
        if (somaH <= 0) e.push({ campo: "h", msg: "Este calendário não trabalha nenhum dia da semana — a frente nunca terminaria." });
      }
      var turnos = numOk(c.turnos, 1, 3) && Math.floor(c.turnos) === c.turnos ? c.turnos : 1;
      if (own(c, "turnos") && turnos !== c.turnos) e.push({ campo: "turnos", msg: "Turnos precisa ser 1, 2 ou 3." });
      var fer = c.fer === "trabalha" ? "trabalha" : "obra";
      var exc = [];
      if (own(c, "exc")) {
        if (!ehLista(c.exc)) e.push({ campo: "exc", msg: "As exceções precisam ser uma lista." });
        else c.exc.forEach(function (x, k) {
          if (!ehObj(x)) { e.push({ campo: "exc", msg: "Exceção " + (k + 1) + " em formato inválido." }); return; }
          var de = msDeData(x.de), ate = own(x, "ate") && x.ate ? msDeData(x.ate) : de;
          if (de == null || ate == null) { e.push({ campo: "exc", msg: "Exceção " + (k + 1) + " com data inválida." }); return; }
          if (ate < de) { e.push({ campo: "exc", msg: "Exceção " + (k + 1) + ": o fim é antes do começo." }); return; }
          if (!numOk(x.h, 0, 24)) { e.push({ campo: "exc", msg: "Exceção " + (k + 1) + ": horas fora de 0 a 24." }); return; }
          exc.push({ de: chDia(de), ate: chDia(ate), h: x.h, m: typeof x.m === "string" ? x.m.slice(0, 60) : "" });
        });
      }
      if (e.length) return { ok: false, valor: null, erros: e };
      var v = { id: id, nome: nome, h: h, turnos: turnos, fer: fer };
      if (exc.length) v.exc = exc;
      return { ok: true, valor: v, erros: [] };
    },

    /* O DIA CHEIO da frente: o maior `h` da semana (e das exceções que
       trabalham mais). É o divisor da capacidade: num calendário de 8h, o
       sábado de 4h vale meio dia de trabalho (decisão D11). */
    diaCheio: function (c) {
      var m = 0, i;
      for (i = 0; i < 7; i++) if (c.h[i] > m) m = c.h[i];
      return m > 0 ? m : 1;
    },

    /* A CAPACIDADE de um dia real, em "dias cheios da frente" (0 a 1+).
       `feriado(ms)` = função que diz se o dia é feriado da obra.
       ⚠ A exceção MANDA sobre o dia da semana e sobre o feriado: é ela que
         permite "a planta para no Natal" e "o fim de semana da parada
         trabalha". Exceção com mais horas que o dia cheio é limitada a 1:
         senão um dia valeria por dois na conta do consumo, e o desenho e a
         sombra discordariam. */
    capacidade: function (ctxCal, ms) {
      var c = ctxCal.cal, d = new Date(ms), i, x, dia = chDia(ms);
      if (c.exc) for (i = 0; i < c.exc.length; i++) {
        x = c.exc[i];
        if (dia >= x.de && dia <= x.ate) return Math.min(1, x.h / ctxCal.cheio);
      }
      if (c.fer === "obra" && ctxCal.feriado(ms)) return 0;
      return Math.min(1, c.h[d.getDay()] / ctxCal.cheio);
    },

    /* trabalha? (sombreamento por linha, histograma, programação semanal) */
    trabalha: function (ctxCal, ms) { return this.capacidade(ctxCal, meiaNoite(ms)) > 0; },

    /* O PRIMEIRO DIA DE TRABALHO >= `ms`. Sem nenhum em 10 anos, devolve
       null e o chamador avisa (nunca trava). */
    primeiroDia: function (ctxCal, ms) {
      var d = meiaNoite(ms), giros = 0;
      while (this.capacidade(ctxCal, d) <= 0) {
        if (giros++ >= GIRO_MAX) return null;
        d = maisDias(d, 1);
      }
      return d;
    },

    /* CONSUMIR: a partir de `ms`, o ÚLTIMO DIA TRABALHADO para cumprir `dur`
       dias de trabalho da frente. `dur <= 0` devolve o próprio primeiro dia
       (o marco cai no dia do evento).
       ⚠ A tolerância de 1e-9 existe por causa do dia curto: 0,5 + 0,5 em
         ponto flutuante pode dar 0,9999999999999999 e pedir um dia a mais. */
    consumir: function (ctxCal, ms, dur) {
      var p = this.primeiroDia(ctxCal, ms);
      if (p == null) return null;
      if (!(dur > 0)) return p;
      var acum = 0, d = p, ult = p, giros = 0, cap;
      while (acum < dur - 1e-9) {
        cap = this.capacidade(ctxCal, d);
        if (cap > 0) { acum += cap; ult = d; }
        if (acum >= dur - 1e-9) break;
        if (giros++ >= GIRO_MAX + Math.ceil(dur) * 3) return null;
        d = maisDias(d, 1);
      }
      return ult;
    },

    /* AVANÇAR: o dia em que a frente RETOMA depois de ter feito `feito` dias
       de trabalho a partir de `ms`. `feito == 0` → o próprio `ms` (a tarefa
       iniciada com 0% retoma onde parou). */
    avancar: function (ctxCal, ms, feito) {
      if (!(feito > 0)) return meiaNoite(ms);
      var u = this.consumir(ctxCal, ms, feito);
      return u == null ? null : maisDias(u, 1);
    },

    /* RECUAR (O27): o PRIMEIRO dia de uma tarefa de `dur` dias de trabalho
       que termina no último dia trabalhado <= `u`.
       ⚠ É o que torna "deve terminar em" exato numa frente 7×7: pela régua da
         obra o resultado erra o dia da semana em que a frente começa
         (medido: 04/11..13/11 contra 02/11..11/11). */
    recuar: function (ctxCal, u, dur) {
      var d = meiaNoite(u), giros = 0;
      while (this.capacidade(ctxCal, d) <= 0) {           // o último dia TRABALHADO <= u
        if (giros++ >= GIRO_MAX) return null;
        d = maisDias(d, -1);
      }
      if (!(dur > 0)) return d;
      var acum = 0, pri = d, cap;
      giros = 0;
      while (acum < dur - 1e-9) {
        cap = this.capacidade(ctxCal, d);
        if (cap > 0) { acum += cap; pri = d; }
        if (acum >= dur - 1e-9) break;
        if (giros++ >= GIRO_MAX + Math.ceil(dur) * 3) return null;
        d = maisDias(d, -1);
      }
      return pri;
    },

    /* Quantos dias de TRABALHO da frente cabem entre duas datas reais
       (inclusive). O arrasto usa para virar largura de barra em duração. */
    diasDaFrente: function (ctxCal, msDe, msAte) {
      var d = meiaNoite(msDe), fim = meiaNoite(msAte), acum = 0, giros = 0;
      while (d <= fim) {
        acum += this.capacidade(ctxCal, d);
        if (giros++ >= GIRO_MAX) break;
        d = maisDias(d, 1);
      }
      return acum;
    },

    /* O CONTEXTO da leitura (§2.3-E5). `cal` = `cronograma.cal` do disco;
       `feriado` = função (ms → bool) da obra; `nos` = {id: true} dos nós que
       existem (etapa, folha, grupo de soltos, tarefa sem preço) — a
       atribuição a quem não existe mais sai, com aviso.
       Devolve {lista, porId, de, dur, agente, padrao, usados, avisos, ctxDe}
       ou `null` quando não há NENHUMA atribuição válida (I2: sem dado, o
       código de hoje).
       ⚠ CÓPIA: nunca escreve em `cal`. */
    contexto: function (cal, feriado, nos) {
      if (!ehObj(cal)) return null;
      var self = this, out = { lista: [], porId: {}, de: {}, dur: {}, agente: {}, padrao: null, usados: [], avisos: [], ctxDe: {} };
      var fer = typeof feriado === "function" ? feriado : function () { return false; };
      var temNos = ehObj(nos);
      arr(cal.lista).forEach(function (c, k) {
        var v = self.validar(c);
        if (!v.ok) {
          out.avisos.push({ tipo: "calendario-invalido", indice: k, id: (ehObj(c) && typeof c.id === "string") ? c.id : null,
            nome: (ehObj(c) && typeof c.nome === "string") ? c.nome : null, erros: v.erros.map(function (q) { return q.msg; }) });
          return;
        }
        if (own(out.porId, v.valor.id)) { out.avisos.push({ tipo: "calendario-repetido", id: v.valor.id }); return; }
        out.porId[v.valor.id] = v.valor;
        out.lista.push(v.valor);
      });
      if (!out.lista.length) return out.avisos.length ? out : null;
      /* o contexto de consumo de cada calendário: o dia cheio e o feriado da
         obra resolvidos uma vez (o consumo roda por dia, num laço) */
      out.lista.forEach(function (c) {
        out.ctxDe[c.id] = { cal: c, cheio: self.diaCheio(c), feriado: fer };
      });
      if (typeof cal.padrao === "string" && own(out.porId, cal.padrao)) out.padrao = cal.padrao;
      else if (cal.padrao != null && cal.padrao !== "") out.avisos.push({ tipo: "calendario-padrao-invalido", id: cal.padrao });
      var deM = ehObj(cal.de) ? cal.de : {}, usados = {};
      Object.keys(deM).forEach(function (id) {
        var cid = deM[id];
        if (typeof cid !== "string" || !own(out.porId, cid)) { out.avisos.push({ tipo: "calendario-atribuicao-invalida", id: id, cal: cid == null ? null : String(cid) }); return; }
        if (temNos && !own(nos, id)) { out.avisos.push({ tipo: "calendario-no-sumiu", id: id, cal: cid }); return; }
        out.de[id] = cid; usados[cid] = true;
      });
      if (out.padrao) usados[out.padrao] = true;
      out.usados = Object.keys(usados);
      var durM = ehObj(cal.dur) ? cal.dur : {}, agM = ehObj(cal.agente) ? cal.agente : {};
      Object.keys(durM).forEach(function (id) {
        var v = durM[id];
        if (numOk(v, 0.01, 9999)) out.dur[id] = Math.round(v * 100) / 100;
        else out.avisos.push({ tipo: "calendario-duracao-invalida", id: id });
      });
      Object.keys(agM).forEach(function (id) { if (typeof agM[id] === "string") out.agente[id] = agM[id]; });
      if (!out.usados.length) return out.avisos.length ? out : null;
      return out;
    },

    /* o calendário EFETIVO de um nó: a atribuição dele, a herança
       (folha ← etapa; grupo de soltos ← etapa) ou o padrão. `null` = a régua
       da obra. */
    calDe: function (cc, id, donoId) {
      if (!cc) return null;
      if (own(cc.de, id)) return cc.de[id];
      if (donoId != null && own(cc.de, donoId)) return cc.de[donoId];
      return cc.padrao || null;
    },

    /* A RÉGUA DE DESENHO (`r.eixo`): a UNIÃO dos dias da obra com os dias em
       que algum calendário usado trabalha, entre duas datas reais. Devolve
       {total, dias: [ms], indiceDe: {chave: k}, porSemana, mascara} — o eixo
       do Gantt e do papel. Sem calendário usado, devolve null e a tela fica
       com a régua da obra (`Cronograma.calendario`, que NÃO muda). */
    eixo: function (cc, diaObra, msIni, msFim) {
      if (!cc || !cc.usados.length) return null;
      var self = this, dias = [], indiceDe = {}, mascara = [], d = meiaNoite(msIni), fim = meiaNoite(msFim), giros = 0;
      while (d <= fim) {
        var eObra = typeof diaObra === "function" ? !!diaObra(d) : false, eFrente = false, i;
        for (i = 0; i < cc.usados.length && !eFrente; i++) if (self.capacidade(cc.ctxDe[cc.usados[i]], d) > 0) eFrente = true;
        if (eObra || eFrente) { indiceDe[chDia(d)] = dias.length; dias.push(d); mascara.push(eObra ? (eFrente ? 3 : 1) : 2); }
        if (giros++ >= GIRO_MAX * 2) break;
        d = maisDias(d, 1);
      }
      return { total: dias.length, dias: dias, indiceDe: indiceDe, mascara: mascara,
        porSemana: dias.length ? Math.round((dias.length / Math.max(1, (fim - meiaNoite(msIni)) / 86400000 + 1)) * 7 * 10) / 10 : 0 };
    },

    /* o que vai ao disco (a forma enxuta da lista; a régua é a `validar`) */
    itemDisco: function (c) {
      var o = { id: c.id, nome: c.nome, h: c.h.slice(), turnos: c.turnos, fer: c.fer };
      if (c.exc && c.exc.length) o.exc = c.exc.map(function (x) {
        var q = { de: x.de };
        if (x.ate && x.ate !== x.de) q.ate = x.ate;
        q.h = x.h;
        if (x.m) q.m = x.m;
        return q;
      });
      return o;
    }
  };

  function arr(v) { return ehLista(v) ? v : []; }

  global.CronoCal = CronoCal;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoCal;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
