/* =====================================================================
 * cronoextras.js — CronoExtras: as TAREFAS SEM PREÇO (aprovação do cliente,
 * liberação de área, comissionamento): normalização, validação, id, a forma
 * enxuta do disco e o teto de 30 por cronograma.
 *
 * Planejador, fatia 1A (motor), commit EXTRAS. Espec: ESPEC-planejador.md
 * (rev. 4) §1.3, §1.9, §2.3-E3/E4, §2.10; o desenho da frente: EXTRAS §b.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * A tarefa sem preço NÃO é etapa: seis consumidores casam `r.etapas[i]` com
 * `orc.etapas[i]` por índice (proposta, PDF, desembolso, Excel, Portal,
 * CronoDocs), e uma etapa a mais poria R$ 0 na proposta e mudaria a
 * numeração. Por isso ela mora numa LISTA própria (`cronograma.extras`), e o
 * motor a trata como nó de rede à parte, depois de todas as etapas. Este
 * módulo é a régua ÚNICA do que é uma tarefa válida — o motor, o gravador
 * (`GanttUI.aplicarOps`) e a tela leem por aqui, senão cada um aceitaria
 * uma coisa.
 *
 * FORMA NO DISCO (O29, "forma enxuta"): o gravador NUNCA escreve o valor
 * padrão — elo TI sem `t`, espera 0 sem `l`, `nia` nula/`nota` vazia/
 * `proposta` falsa ausentes. A leitura devolve os padrões. Medido na M0:
 * 2,3 KB por plano realista só de padrão escrito.
 *
 * ⚠ ELO COM TAREFA SEM PREÇO NUNCA TEM SOBREPOSIÇÃO AUTOMÁTICA: `l` ausente
 *   = 0 ("fundação só depois da aprovação" não pode começar antes por causa
 *   do paralelismo). É diferente do elo entre etapas (REDE), onde `l`
 *   ausente é a sobreposição.
 * ⚠ ES5 (sem const/let/arrow/template/class/includes/find/Object.assign).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function ehObj(v) { return !!v && typeof v === "object" && !ehLista(v); }
  function intOk(v, a, b) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= a && v <= b; }
  function dataOk(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? "" : s));
    if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  }

  var TIPOS = ["TI", "II", "TT", "IT"];
  var RESP = ["cliente", "construtora", "terceiro"];
  var TETO = 30;

  /* um elo do disco ({i, t?, l?}) → {i, t, l} normalizado, ou {erro} */
  function lerElo(z) {
    if (!ehObj(z) || typeof z.i !== "string" || !z.i) return { erro: "forma" };
    var t = own(z, "t") ? String(z.t).toUpperCase() : "TI";
    if (TIPOS.indexOf(t) < 0) return { erro: "tipo", i: z.i };
    if (own(z, "l") && z.l !== null && !intOk(z.l, -999, 999)) return { erro: "espera", i: z.i };
    return { i: z.i, t: t, l: (own(z, "l") && z.l !== null) ? z.l : 0 };
  }
  /* o elo na forma do disco: TI e espera 0 não vão */
  function eloDisco(el) {
    var o = { i: el.i };
    if (el.t && el.t !== "TI") o.t = el.t;
    if (el.l != null && el.l !== 0) o.l = el.l;
    return o;
  }

  var CronoExtras = {
    pronto: true,
    _dep: dep,
    TETO: TETO,
    TIPOS: TIPOS,
    RESP: RESP,
    lerElo: lerElo,
    eloDisco: eloDisco,

    /* id novo "x_" + 8 [a-z0-9], único contra `usados` ({id: true} ou lista).
       `aleatorio` (opcional) = função de [0, 1) — os testes passam uma
       semeada; o app, `Math.random`. */
    novoId: function (usados, aleatorio) {
      var r = typeof aleatorio === "function" ? aleatorio : Math.random, u = {}, i, id, giros = 0;
      if (ehLista(usados)) usados.forEach(function (k) { u[k] = true; }); else if (ehObj(usados)) u = usados;
      do {
        id = "x_";
        for (i = 0; i < 8; i++) id += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(r() * 36));
      } while (own(u, id) && giros++ < 1000);
      return id;
    },

    /* VALIDA um item do disco. Devolve {ok, item (normalizado, com os
       padrões), motivo?}. `ctx` = {etapas: {id: true}, outrosIds: {id: true}
       (folhas, serviços: o id não pode colidir)}. Elo inválido NÃO derruba o
       item: ele sai em `elosInvalidos`. */
    validarItem: function (x, ctx) {
      ctx = ctx || {};
      if (!ehObj(x)) return { ok: false, motivo: "forma" };
      var id = typeof x.id === "string" ? x.id : "";
      if (!/^x_[a-z0-9]{1,40}$/.test(id)) return { ok: false, motivo: "id", id: id || null };
      if (own(ctx.etapas, id) || own(ctx.outrosIds, id)) return { ok: false, motivo: "id-colide", id: id };
      var nome = typeof x.nome === "string" ? x.nome.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      if (!nome) return { ok: false, motivo: "nome", id: id };
      var dur = x.dur;
      if (!intOk(dur, 0, 999)) return { ok: false, motivo: "duracao", id: id };
      var resp = RESP.indexOf(x.resp) >= 0 ? x.resp : "construtora";
      var it = { id: id, nome: nome, dur: dur, resp: resp, proposta: resp === "cliente" && x.proposta === true,
        apos: typeof x.apos === "string" && x.apos ? x.apos : null, preds: [], sucs: [],
        nia: dataOk(x.nia) ? String(x.nia) : null, nota: typeof x.nota === "string" ? x.nota.slice(0, 120) : "" };
      var ruins = [];
      ["preds", "sucs"].forEach(function (k) {
        if (!own(x, k)) return;
        if (!ehLista(x[k])) { ruins.push({ lado: k, motivo: "forma" }); return; }
        var vistos = {};
        x[k].forEach(function (z) {
          var el = lerElo(z);
          if (el.erro) { ruins.push({ lado: k, motivo: el.erro, elo: el.i || null }); return; }
          if (el.i === id) { ruins.push({ lado: k, motivo: "proprio", elo: el.i }); return; }
          if (own(vistos, el.i)) { ruins.push({ lado: k, motivo: "repetido", elo: el.i }); return; }
          vistos[el.i] = true;
          it[k].push(el);
        });
      });
      return { ok: true, item: it, elosInvalidos: ruins };
    },

    /* NORMALIZA a lista do disco (sempre em CÓPIA). `etapas` = orc.etapas
       (ou lista de ids); `outrosIds` = ids de folhas/serviços (opcional).
       Devolve {lista, porId, numero, invalidos, avisos}:
       - não-lista → lista vazia + aviso `extras-forma` (nunca grava por cima);
       - item torto, id repetido (vale o primeiro), id igual ao de etapa →
         `invalidos`, com o motivo;
       - elo para quem não existe (ou `sucs` que não é etapa) → sai o elo, com
         o aviso `extra-elo-invalido`; a tarefa fica;
       - `apos` de etapa que não existe → null (a linha vai para o fim da
         tela), com aviso;
       - `numero` = "T" + a posição na lista (T1, T2…), como o nº da etapa é
         a posição dela: reordenar renumera, e todo texto sai dos ids (O23);
       - mais de 30 válidas: as primeiras 30 ficam, com o aviso `extras-teto`
         (dado de fora; o gravador recusa a 31ª). */
    normalizar: function (lista, etapas, outrosIds) {
      var out = { lista: [], porId: {}, numero: {}, invalidos: [], avisos: [] };
      if (lista == null) return out;
      if (!ehLista(lista)) { out.avisos.push({ tipo: "extras-forma" }); return out; }
      var et = {};
      (ehLista(etapas) ? etapas : []).forEach(function (e) { var i = ehObj(e) ? e.id : e; if (i != null) et[i] = true; });
      var ctx = { etapas: et, outrosIds: ehObj(outrosIds) ? outrosIds : {} };
      var validos = [];
      lista.forEach(function (x, k) {
        var v = CronoExtras.validarItem(x, ctx);
        if (!v.ok) { out.invalidos.push({ indice: k, id: v.id || null, motivo: v.motivo }); return; }
        if (own(out.porId, v.item.id)) { out.invalidos.push({ indice: k, id: v.item.id, motivo: "repetido" }); return; }
        if (validos.length >= TETO) { out.invalidos.push({ indice: k, id: v.item.id, motivo: "teto" }); return; }
        out.porId[v.item.id] = v.item;
        validos.push({ it: v.item, ruins: v.elosInvalidos });
      });
      if (out.invalidos.some(function (q) { return q.motivo === "teto"; })) out.avisos.push({ tipo: "extras-teto", teto: TETO });
      validos.forEach(function (w, k) {
        var it = w.it;
        out.numero[it.id] = "T" + (k + 1);
        w.ruins.forEach(function (r) { out.avisos.push({ tipo: "extra-elo-invalido", id: it.id, lado: r.lado, elo: r.elo, motivo: r.motivo }); });
        it.preds = it.preds.filter(function (el) {
          if (own(et, el.i) || own(out.porId, el.i)) return true;
          out.avisos.push({ tipo: "extra-elo-invalido", id: it.id, lado: "preds", elo: el.i, motivo: "inexistente" });
          return false;
        });
        it.sucs = it.sucs.filter(function (el) {
          if (own(et, el.i)) return true;
          out.avisos.push({ tipo: "extra-elo-invalido", id: it.id, lado: "sucs", elo: el.i, motivo: own(out.porId, el.i) ? "sucs-so-etapa" : "inexistente" });
          return false;
        });
        if (it.apos != null && !own(et, it.apos)) { out.avisos.push({ tipo: "extra-apos-invalido", id: it.id, apos: it.apos }); it.apos = null; it.aposInvalido = true; }
        out.lista.push(it);
      });
      return out;
    },

    /* o item na FORMA ENXUTA do disco (O29), a partir do normalizado */
    itemDisco: function (it) {
      var o = { id: it.id, nome: it.nome, dur: it.dur, resp: RESP.indexOf(it.resp) >= 0 ? it.resp : "construtora" };
      if (it.proposta === true && it.resp === "cliente") o.proposta = true;
      /* ⚠ AUSENTE = NO FIM DA TELA, NÃO NO COMEÇO. Este comentário dizia
         "antes da 1ª etapa" e estava ERRADO: o `CronoExecUI.intercalarExtras`
         concatena as sem âncora DEPOIS de todas as linhas (medido na revisão
         final de 22/09/2026, com a tarefa indo parar abaixo de 6.0
         Acabamentos). Comentário errado num campo de ordem é o que faz o
         próximo conserto mandar a linha para o lado oposto. */
      if (it.apos != null) o.apos = it.apos;
      if (it.preds && it.preds.length) o.preds = it.preds.map(eloDisco);
      if (it.sucs && it.sucs.length) o.sucs = it.sucs.map(eloDisco);
      if (it.nia) o.nia = it.nia;
      if (it.nota) o.nota = it.nota;
      return o;
    }
  };

  global.CronoExtras = CronoExtras;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoExtras;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
