/* =====================================================================
 * cronoavanco.js — CronoAvanco: o AVANÇO LANÇADO por tarefa (%, início e fim
 * reais, data de corte): a leitura do registro `avanco_<obraId>`, o estado de
 * cada entrada, a data de corte padrão, as sugestões dos diários e a porta
 * [Resumir] do teto.
 *
 * Planejador, fatia 1A (motor), commit AVANÇO. Espec: ESPEC-planejador.md
 * (rev. 4) §1.4, §1.8, §1.9, §2.3-E7, §2.4, §2.10, O7, O14, O17, O24, O28,
 * I17 e as emendas E-MC1, E-MC6, E-MC7 e E-MC8 (§3.9); o desenho da frente:
 * avanco.md §b e §c.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * O avanço mora num registro PRÓPRIO da entidade `crono_obra`, nunca dentro
 * do plano. Três motivos, todos medidos:
 *   (a) o merge do `crono_obra` é por registro inteiro e o perdedor vira
 *       resumo (js/nuvem.js:558-571): com o avanço dentro do plano, a rede
 *       que o escritório digitou e o avanço que a obra lançou se apagariam um
 *       ao outro, e o avanço é o dado mais caro de refazer;
 *   (b) "Reiniciar plano" recopia `orc.cronograma` e levaria o avanço junto;
 *   (c) o plano tem teto de 60 KB, e o avanço não pode competir por ele.
 * Este módulo é a régua ÚNICA do que é uma entrada válida, de qual é o estado
 * dela e de quanto o registro pode pesar.
 *
 * ⚠ UMA FUNÇÃO SÓ DECIDE "CONCLUÍDA" (O24, I17): `estadoDe`. Motor, tela,
 *   papel e XML nunca decidem por conta própria — a TAREFA usava "a
 *   concluída" sem definição, e a grade grava o fim real numa célula à parte,
 *   então `{p: 60, f: "10/09"}` aparece com facilidade. Fim real preenchido
 *   ⇒ concluída, com `p` lido como 100.
 * ⚠ A ENTRADA NUNCA É DESCARTADA POR CAUSA DE `o` OU `b` (E-MC1). Origem
 *   desconhecida ou medição sem lastro viram "digitado", com aviso: a data e
 *   o % foram lançados por alguém e valem. Descartar a entrada apagaria o
 *   realizado da obra por causa de um campo de procedência.
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
  function arr(v) { return ehLista(v) ? v : []; }
  function dataOk(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? "" : s).slice(0, 10));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d.getTime();
  }
  function chMs(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function maisDias(ms, n) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
  function numFin(v) { return typeof v === "number" && isFinite(v); }

  var ORIGENS = ["diario", "medicao"];

  /* ⚠ O TETO DO REGISTRO DE AVANÇO: 50 KB (E-MC6).
     A M0 fixou 40 KB medindo o pior registro VÁLIDO sem as entradas da
     medição (300 folhas + 30 tarefas = 33,8 KB) mais 10%, arredondado em
     múltiplos de 5 KB. A entrada vinda da medição tem `o:"medicao"` e o
     lastro `b` (ESPEC-medicao-cc §1.4): 133 B contra 104 B. O mesmo pior
     registro com elas dá 43.213 B, ACIMA dos 40.960 — em 40 KB caberiam só
     305 folhas desse tipo. A mesma regra dá 50 KB.
     ⚠ A alternativa `o: "m"` (45 KB) foi recusada: 6 B por entrada não pagam
       a perda de legibilidade ao lado de `o: "diario"`. */
  var TETO = 50 * 1024;

  var CronoAvanco = {
    pronto: true,
    _dep: dep,
    TETO: TETO,
    ORIGENS: ORIGENS,
    B_MAX: 64,

    /* O ESTADO DE UMA ENTRADA (O24, I17) — a régua ÚNICA.
         concluída    ⇔ `f` preenchido (o `p` é lido como 100);
         iniciada     ⇔ `i` preenchido e `f` vazio (0% com início real também
                        é iniciada: nada feito, o restante começa no corte);
         não iniciada ⇔ sem `i`.
       ⚠ No MS Project, fim real implica 100%. Dado de fora com `f` e `p < 100`
         é CONCLUÍDA, com aviso — a alternativa (ignorar o fim real) deixaria a
         barra aberta numa tarefa que a obra terminou. */
    estadoDe: function (e) {
      if (!ehObj(e)) return null;
      if (dataOk(e.f) != null) return "concluida";
      if (dataOk(e.i) != null) return "iniciada";
      return "nao-iniciada";
    },

    /* VALIDA uma entrada do disco. Devolve {ok, entrada (cópia normalizada),
       motivo?, avisos: []}. `ctx` = {corteMs, iniObraMs, noExiste(id)}.
       ⚠ O `o` e o `b` NUNCA derrubam a entrada (E-MC1). */
    validarEntrada: function (e, ctx) {
      ctx = ctx || {};
      var av = [];
      if (!ehObj(e)) return { ok: false, motivo: "forma", avisos: av };
      var id = typeof e.id === "string" ? e.id : "";
      if (!id) return { ok: false, motivo: "id", avisos: av };
      if (typeof ctx.noExiste === "function" && !ctx.noExiste(id)) return { ok: false, motivo: "no-sumiu", id: id, avisos: av };
      var i = dataOk(e.i), f = dataOk(e.f);
      if (e.i != null && e.i !== "" && i == null) return { ok: false, motivo: "data-i", id: id, avisos: av };
      if (e.f != null && e.f !== "" && f == null) return { ok: false, motivo: "data-f", id: id, avisos: av };
      if (i != null && f != null && f < i) return { ok: false, motivo: "fim-antes", id: id, avisos: av };
      if (i == null && f != null) return { ok: false, motivo: "fim-sem-inicio", id: id, avisos: av };
      var p = null;
      if (e.p != null) {
        if (!numFin(e.p) || e.p < 0 || e.p > 100) return { ok: false, motivo: "pct", id: id, avisos: av };
        p = Math.round(e.p * 10) / 10;
      }
      if (i == null && p > 0) return { ok: false, motivo: "pct-sem-inicio", id: id, avisos: av };
      if (ctx.corteMs != null && i != null && i > ctx.corteMs) return { ok: false, motivo: "inicio-depois-do-corte", id: id, avisos: av };
      var r = null;
      if (e.r != null) {
        if (!numFin(e.r) || e.r < 0 || e.r > 9999) return { ok: false, motivo: "restante", id: id, avisos: av };
        r = e.r;
      }
      var out = { id: id };
      if (i != null) out.i = chMs(i);
      out.f = f != null ? chMs(f) : null;
      if (p != null) out.p = p;
      if (r != null) out.r = r;
      if (dataOk(e.em) != null) out.em = chMs(dataOk(e.em));
      if (e.rs === 1) out.rs = 1;

      /* ---- a ORIGEM e o LASTRO (E-MC1) ---- */
      var b = null;
      if (own(e, "b")) {
        if (typeof e.b === "string" && e.b.length >= 1 && e.b.length <= this.B_MAX) b = e.b;
        else av.push({ tipo: "avanco-lastro-invalido", id: id });
      }
      var o = null;
      if (own(e, "o") && e.o != null && e.o !== "") {
        if (out.rs === 1) {
          // E-MC8: a entrada de resumo NUNCA tem `o` — ele é ignorado na leitura
          av.push({ tipo: "avanco-resumo-com-origem", id: id });
        } else if (ORIGENS.indexOf(String(e.o)) < 0) {
          av.push({ tipo: "avanco-origem-desconhecida", id: id, o: String(e.o).slice(0, 20) });
        } else if (String(e.o) === "medicao" && !b) {
          /* medição sem lastro: lida como DIGITADA. A data e o % continuam
             valendo — quem os lançou foi uma pessoa ou o canal, e descartar
             apagaria o realizado. O que se perde é só a procedência. */
          av.push({ tipo: "avanco-medicao-sem-lastro", id: id });
        } else o = String(e.o);
      }
      if (o) out.o = o;
      if (b) out.b = b;

      /* ---- os dois avisos da O24 ---- */
      var est = this.estadoDe(out);
      if (est === "concluida" && p != null && p < 100) av.push({ tipo: "avanco-fim-sem-100", id: id, p: p, f: out.f });
      if (est === "iniciada" && p === 100) av.push({ tipo: "avanco-100-sem-fim", id: id });
      return { ok: true, entrada: out, estado: est, avisos: av };
    },

    /* LÊ o registro `avanco_<obraId>` (sempre em CÓPIA; nunca escreve).
       `opts` = {corte (sobrepõe o do registro), noExiste(id), mandaNaData(id, entrada)}.
       Devolve {corte, corteMs, porId, lista, avisos, descartadas, bytes}.
       ⚠ `nos` que não é lista → "sem avanço" + aviso, e NUNCA se grava por
         cima: a forma torta pode ser um sync a meio caminho, e regravar
         apagaria o realizado da obra. */
    ler: function (rec, opts) {
      opts = opts || {};
      var self = this, out = { corte: null, corteMs: null, porId: {}, lista: [], avisos: [], descartadas: [] };
      if (!ehObj(rec)) return out;
      var corte = dataOk(opts.corte != null ? opts.corte : rec.corte);
      if (corte == null) { out.avisos.push({ tipo: "avanco-corte", corte: rec.corte == null ? null : String(rec.corte).slice(0, 20) }); return out; }
      out.corte = chMs(corte); out.corteMs = corte;
      if (!ehLista(rec.nos)) {
        if (rec.nos != null) out.avisos.push({ tipo: "avanco-forma" });
        return out;
      }
      var ctx = { corteMs: corte, noExiste: opts.noExiste };
      rec.nos.forEach(function (e, k) {
        var v = self.validarEntrada(e, ctx);
        v.avisos.forEach(function (a) { out.avisos.push(a); });
        if (!v.ok) { out.descartadas.push({ indice: k, id: v.id || null, motivo: v.motivo }); return; }
        if (own(out.porId, v.entrada.id)) { out.descartadas.push({ indice: k, id: v.entrada.id, motivo: "repetida" }); return; }
        /* o nó que NÃO manda na data (folha no modo padrão, etapa com folhas
           no executivo) fica inerte, com aviso: o dado não se perde, e a
           pessoa sabe por que o número dela não apareceu */
        /* ⚠ A ENTRADA VAI JUNTO no segundo argumento: a etapa RESUMIDA (`rs: 1`)
           manda na data no modo executivo, e só a entrada diz que ela é
           resumida — com o id sozinho o gancho recusaria justamente a porta
           [Resumir o avanço das etapas concluídas] (§1.4). */
        if (typeof opts.mandaNaData === "function" && !opts.mandaNaData(v.entrada.id, v.entrada)) {
          out.avisos.push({ tipo: "avanco-nivel-errado", id: v.entrada.id });
          out.descartadas.push({ indice: k, id: v.entrada.id, motivo: "nivel" });
          return;
        }
        out.porId[v.entrada.id] = v.entrada;
        out.lista.push(v.entrada);
      });
      return out;
    },

    /* A DATA DE CORTE PADRÃO (§5.1). Pura: a grade (2A) e o modal (2B) chamam
       esta mesma função — duas contas do mesmo padrão divergem na primeira
       manutenção (achado 16).
       Regra: o último diário publicável de até 7 dias atrás; senão, hoje.
       Nunca no futuro, nunca antes do início da obra. */
    cortePadrao: function (diarios, hoje, obraInicio) {
      var hj = dataOk(hoje) != null ? dataOk(hoje) : (hoje && hoje.getTime ? new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime() : null);
      if (hj == null) hj = (function () { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })();
      var ini = dataOk(obraInicio);
      var limite = maisDias(hj, -7), melhor = null;
      arr(diarios).forEach(function (d) {
        if (!ehObj(d)) return;
        if (d.publicavel === false || d.rascunho === true) return;
        var ms = dataOk(d.data);
        if (ms == null || ms > hj || ms < limite) return;
        if (melhor == null || ms > melhor) melhor = ms;
      });
      var c = melhor != null ? melhor : hj;
      if (c > hj) c = hj;                                   // nunca no futuro
      if (ini != null && c < ini) c = ini;                  // nunca antes do início da obra
      return chMs(c);
    },

    /* AS SUGESTÕES DOS DIÁRIOS (E-MC7). `real` = o que os diários apuraram por
       nó ({id: {p, i, f}}); `rec` = o registro de avanço; `opts.numeroB` =
       {idDoBoletim: "01a"} para o rótulo.
       Devolve [{id, p, i, f, marcada, rotulo, substitui}].
       ⚠ O DIÁRIO SUBSTITUI A MEDIÇÃO (E-MC7): a medição mede o que foi
         APROVADO para pagamento, e o diário mede o que foi FEITO. Quando os
         dois falam do mesmo nó, quem planeja quer o do diário — por isso a
         sugestão vem MARCADA, dizendo qual medição ela substitui.
         A entrada digitada com `b` (alguém anotou o boletim à mão) segue a
         regra do digitado: a sugestão vem DESMARCADA, porque ali a decisão
         foi de uma pessoa. */
    sugestoesDoDiario: function (real, rec, opts) {
      opts = opts || {};
      var self = this, L = self.ler(rec, { corte: opts.corte }), out = [];
      var num = ehObj(opts.numeroB) ? opts.numeroB : {};
      Object.keys(ehObj(real) ? real : {}).forEach(function (id) {
        var d = real[id];
        if (!ehObj(d)) return;
        var atual = L.porId[id] || null, s = { id: id, p: d.p, i: d.i, f: d.f, marcada: !atual, rotulo: null, substitui: null };
        if (atual) {
          if (atual.o === "diario") s.marcada = true;                 // já veio do diário: atualizar é o esperado
          else if (atual.o === "medicao") {
            s.marcada = true;
            s.substitui = atual.b || null;
            s.rotulo = "substitui a medição " + (atual.b && own(num, atual.b) ? num[atual.b] : (atual.b || "sem número"));
          } else s.marcada = false;                                   // digitado (com ou sem `b`): a pessoa decidiu
        }
        out.push(s);
      });
      out.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
      return out;
    },

    /* A PORTA [Resumir o avanço das etapas concluídas] (§1.4).
       Troca as entradas das folhas de uma etapa 100% concluída por UMA entrada
       `rs: 1` da etapa. `opts` = {folhasDe(etapaId) → [ids], ordemB
       ({b: posição}), numeroB}. Devolve {rec (cópia), trocadas, recados}.
       ⚠ O REALIZADO NUNCA É APAGADO POR FALTA DE ESPAÇO: o que sai é o
         detalhe POR SUBETAPA, e as posições delas passam a ser as planejadas
         escaladas na janela real [i, f]. O recado diz isso. */
    resumirConcluidas: function (rec, opts) {
      opts = opts || {};
      var self = this, out = { rec: null, trocadas: [], recados: [] };
      if (!ehObj(rec) || !ehLista(rec.nos)) return out;
      var L = self.ler(rec, {}), porId = L.porId;
      var num = ehObj(opts.numeroB) ? opts.numeroB : {}, ordem = ehObj(opts.ordemB) ? opts.ordemB : null;
      var novo = [], tirar = {};
      arr(opts.etapas).forEach(function (eid) {
        var folhas = typeof opts.folhasDe === "function" ? arr(opts.folhasDe(eid)) : [];
        if (folhas.length < 2) return;
        var todas = true, iMin = null, fMax = null, todasMed = true, cands = [];
        folhas.forEach(function (fid) {
          var e = porId[fid];
          if (!e || self.estadoDe(e) !== "concluida") { todas = false; return; }
          var im = dataOk(e.i), fm = dataOk(e.f);
          if (im != null && (iMin == null || im < iMin)) iMin = im;
          if (fm != null && (fMax == null || fm > fMax)) fMax = fm;
          if (e.o === "medicao" && e.b) cands.push({ b: e.b, f: fm });
          else todasMed = false;
        });
        if (!todas || iMin == null || fMax == null) return;
        var ent = { id: eid, i: chMs(iMin), f: chMs(fMax), p: 100, rs: 1 };
        var emM = null;
        folhas.forEach(function (fid) { var e = porId[fid]; if (e && e.em && (emM == null || e.em > emM)) emM = e.em; });
        if (emM) ent.em = emM;
        /* ---- O LASTRO NO RESUMO (E-MC8) ----
           A `rs` NUNCA tem `o` (ela não veio de lugar nenhum: é um resumo).
           Mas quando TODAS as folhas resumidas vinham da medição, o registro
           guarda UM `b`: sem ele, a etapa perderia qualquer vínculo com os
           boletins que a sustentam. A escolha é determinística — a maior
           ordem pelo mapa que a fiação da medição passa e, sem o mapa, o `b`
           da folha de maior `f`, com empate pelo MENOR `b` (para duas
           máquinas chegarem ao mesmo resultado). */
        if (todasMed && cands.length) {
          var melhor = null;
          cands.forEach(function (c) {
            if (melhor == null) { melhor = c; return; }
            if (ordem && own(ordem, c.b) && own(ordem, melhor.b)) { if (ordem[c.b] > ordem[melhor.b]) melhor = c; return; }
            if (ordem && own(ordem, c.b) && !own(ordem, melhor.b)) { melhor = c; return; }
            if (ordem && !own(ordem, c.b) && own(ordem, melhor.b)) return;
            if (c.f > melhor.f) { melhor = c; return; }
            if (c.f === melhor.f && c.b < melhor.b) melhor = c;
          });
          if (melhor) {
            ent.b = melhor.b;
            out.recados.push({ tipo: "avanco-resumo-lastro", id: eid, b: melhor.b,
              msg: "o lastro por subetapa (" + cands.map(function (c) { return "medição " + (own(num, c.b) ? num[c.b] : c.b); }).join(", ") +
                ") deixa de existir para a etapa " + eid + "; fica o da medição " + (own(num, melhor.b) ? num[melhor.b] : melhor.b) });
          }
        }
        folhas.forEach(function (fid) { tirar[fid] = true; });
        out.trocadas.push({ etapa: eid, folhas: folhas.slice(), entrada: ent });
      });
      if (!out.trocadas.length) return out;
      arr(rec.nos).forEach(function (e) { if (!(ehObj(e) && own(tirar, e.id))) novo.push(e); });
      out.trocadas.forEach(function (q) { novo.push(q.entrada); });
      var c = {}, k;
      for (k in rec) if (own(rec, k)) c[k] = rec[k];
      c.nos = novo;
      out.rec = c;
      return out;
    },

    /* os bytes do registro, na mesma régua do teto (UTF-8 do JSON) */
    bytes: function (rec) {
      var s = JSON.stringify(rec == null ? null : rec);
      if (typeof Buffer !== "undefined" && Buffer.byteLength) return Buffer.byteLength(s, "utf8");
      return unescape(encodeURIComponent(s)).length;   // o mesmo resultado no navegador
    }
  };

  global.CronoAvanco = CronoAvanco;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoAvanco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
