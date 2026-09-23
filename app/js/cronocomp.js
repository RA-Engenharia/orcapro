/* =====================================================================
 * cronocomp.js — CronoComp: a COMPARAÇÃO entre linhas de base (A × B ×
 * realizado), por etapa, subetapa ou serviço.
 *
 * Planejador, fatia 1B (bases). Espec: ESPEC-planejador.md (rev. 4), §3.3
 * (1B), O15, D9, D17, D18; desenho BASES §c4 e §c5.
 *
 * Motor PURO: não lê o Store, não toca em DOM. A tela (CronoExecUI.basesPainel)
 * só desenha o que sai daqui; a fiação (App._cronoBasesDados) monta a entrada.
 *
 * ⚠ AS REGRAS QUE NÃO CEDEM
 *  1) NUNCA CASAR POR NOME, número ou descrição: nó e serviço se ligam SÓ
 *     pelo id. Roteiro do defeito que isso impede: a etapa "Fundação" é
 *     renomeada para "Fundações e contenções" entre a v1 e a v2; casando por
 *     nome, ela viraria "só na v1" + "só na v2" e o atraso dela sumiria da
 *     tabela do pleito. Com id, é a mesma linha, com o nome de hoje.
 *  2) UMA CONVENÇÃO DE TÉRMINO (O15, D9): o ÚLTIMO DIA TRABALHADO — a do MS
 *     Project do contratante (js/msproject.js). O `dataFim` do motor é
 *     exclusivo (o dia em que a etapa deixa de ocupar a equipe); para pleito
 *     em dias corridos a diferença entre as duas muda o Δ (sexta × segunda:
 *     3 dias pelo último dia, 1 pelo exclusivo). O rodapé diz qual vale.
 *  3) Δ EM DIAS ÚTEIS NO CALENDÁRIO DA A (declarado no rodapé): com 5 × 6
 *     dias por semana ou feriados diferentes não existe "o" dia útil — uma
 *     data da B num dia sem obra na A conta como o dia útil anterior.
 *  4) SEM SOMA DE ATRASOS. "Atraso total" somando tarefa é número sem
 *     sentido (tarefas paralelas contam duas vezes): os totais são término,
 *     prazo, contagens e o maior atraso no caminho crítico da A.
 *  5) REAL EM ANDAMENTO NUNCA SE CHAMA "REAL": sem fim, a data que aparece
 *     é a do plano atual, rotulada "previsto pelo plano atual".
 *  6) COBERTURA CONTRATUAL SEM VEREDITO (D18): a unidade do prazo dos
 *     aditivos (corridos ou úteis) não está no cadastro. Mostra o prazo dos
 *     aditivos aprovados com "confira a unidade do contrato" — nunca
 *     "coberta" ou "não coberta".
 *  7) Nada daqui é gravado (campo derivado sincronizado diverge entre
 *     versões): Δ e situação são recalculados a cada leitura.
 *
 * ⚠ ES5 (sem const/let/arrow/template/class/includes/find/Object.assign).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* módulo irmão resolvido NA HORA da chamada (em Node, pelo require relativo) */
  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }
  function Pl() { return dep("CronoPlan", "./cronoplan.js"); }
  function Cr() { return dep("Cronograma", "./cronograma.js"); }

  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function ehObj(v) { return !!v && typeof v === "object" && !ehLista(v); }
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return v == null ? "" : String(v); }
  function arr(v) { return ehLista(v) ? v : []; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function ch(d) { return (d && typeof d.getTime === "function" && !isNaN(d.getTime())) ? d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) : null; }
  function dataLocal(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(s));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? d : null;
  }
  /* dias CORRIDOS de a até b ("AAAA-MM-DD"); null sem um dos dois */
  function dc(a, b) {
    var da = dataLocal(a), db = dataLocal(b);
    if (!da || !db) return null;
    return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
  }
  function br(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(s)); return m ? m[3] + "/" + m[2] + "/" + m[1] : str(s); }
  /* texto sem acento e em minúsculas — a busca acha "fundacao" em "Fundação" */
  function norm(s) {
    return str(s).toLowerCase().replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i")
      .replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c").replace(/\s+/g, " ").trim();
  }
  function falha(msg) { return { ok: false, erro: msg }; }

  var TERMINOS = { ultimoDia: 1, exclusivo: 1 };
  var DETALHES = { etapa: 1, folha: 1, servico: 1 };
  var FILTROS = { tudo: 1, mudou: 1, critico: 1, atrasadas: 1 };

  /* ================================================================
     UM LADO — {rot, cab, cal, porId, ordem, temServ, soEtapas, fimTotal}
     `x` = {tipo:"base", base (registro COMPLETO — a lista completada pelo
     CronoSelo), selo (o `CronoSelo.abrir` do selo desta base, ou null), rot}
     | {tipo:"plano", r (Cronograma.estimar com {eap:true}), rot}.
     ================================================================ */
  function lado(x) {
    if (!ehObj(x)) return { erro: "lado da comparação ausente." };
    var L = { tipo: x.tipo, rot: str(x.rot), porId: {}, ordem: [], temServ: false, soEtapas: false, cab: null, cal: null, id: "" };
    if (x.tipo === "plano") {
      var r = x.r, C = Cr();
      if (!r || !ehLista(r.atividades)) return { erro: "o plano atual não tem a árvore EAP — calcule com {eap: true}." };
      L.cal = C ? C.calendario(r) : null;
      if (!L.cal) return { erro: "o plano atual não tem data de início — sem ela não há data para comparar." };
      L.id = "plano";
      L.cab = { tipo: "plano", totalDias: r.totalDias, dataInicio: ch(r.dataInicio), orcamentoId: str(x.orcamentoId) };
      arr(r.atividades).forEach(function (n) {
        if (!n || n.id == null || n.inicio == null || n.fim == null) return;
        var t = n.tipo === "etapa" ? "etapa" : (n.tipo === "servico" ? "servico" : (n.tipo === "subetapa" || n.tipo === "soltos" ? "folha" : null));
        if (!t) return;
        if (t === "servico" && n.semBase) return;
        var id = str(n.id);
        L.porId[id] = { id: id, tipo: t, num: str(n.numero), nome: str(n.nome), e: str(n.etapaId), folha: t === "servico" ? str(n.paiId) : (t === "folha" ? id : ""),
          i: n.inicio, f: n.fim, crit: !!n.critico, marco: !!n.marco };
        L.ordem.push(id);
      });
      L.temServ = true;
      return L;
    }
    if (x.tipo !== "base" || !ehObj(x.base)) return { erro: "lado da comparação sem a linha de base." };
    var b = x.base, P = Pl();
    if (b.arquivada || !ehLista(b.nos) || !b.nos.length) return { erro: "a linha de base v" + str(b.versao) + " foi arquivada e não guarda as etapas neste aparelho — o selo dela não chegou ou está ilegível." };
    L.cal = P && P.calendarioDaBase ? P.calendarioDaBase(b) : null;
    if (!L.cal) return { erro: "a linha de base v" + str(b.versao) + " não tem calendário legível." };
    L.id = str(b.id);
    L.cab = { tipo: "base", id: str(b.id), versao: b.versao, totalDias: b.totalDias, dataInicio: b.cal ? str(b.cal.dataInicio) : "",
      orcamentoId: str(b.orcamentoId), criadaEm: str(b.criadaEm), opcionaisFora: arr(b.opcionaisFora).slice() };
    var critSelo = {}, sa = x.selo && !x.selo.erro ? x.selo : null;
    if (sa) arr(sa.nos).forEach(function (n) { if (n.c) critSelo[str(n.id)] = true; });
    var numDe = {};
    arr(b.nos).forEach(function (n) {
      if (!n || n.id == null) return;
      var id = str(n.id);
      numDe[id] = str(n.n);
      L.porId[id] = { id: id, tipo: n.t === "e" ? "etapa" : "folha", num: str(n.n), nome: str(n.nm), e: str(n.e), folha: n.t === "e" ? "" : id,
        i: Number(n.i), f: Number(n.f), crit: !!critSelo[id], marco: Number(n.f) === Number(n.i) };
      L.ordem.push(id);
    });
    L.soEtapas = !L.ordem.some(function (id) { return L.porId[id].tipo === "folha"; });
    if (sa && ehLista(sa.serv)) {
      L.temServ = true;
      sa.serv.forEach(function (s) {
        var id = str(s.id);
        if (own(L.porId, id)) return;
        L.porId[id] = { id: id, tipo: "servico", num: "", nome: "", e: str(s.etapa), folha: str(s.folha), folhaNum: numDe[str(s.folha)] || "",
          i: Number(s.i), f: Number(s.f), crit: false, marco: Number(s.f) === Number(s.i), q: s.q, u: s.u };
        L.ordem.push(id);
      });
    }
    return L;
  }

  /* datas de um nó no calendário do lado, na convenção pedida */
  function datas(L, x, termino) {
    var ini = L.cal.dia(Math.max(0, x.i)), fimK;
    if (x.f > x.i) fimK = termino === "exclusivo" ? x.f : x.f - 1;
    else fimK = x.i;
    var fim = L.cal.dia(Math.max(0, fimK));
    return { ini: ch(ini), fim: ch(fim), du: x.f - x.i, crit: !!x.crit, marco: x.f <= x.i };
  }
  /* índice de dia útil de uma data no calendário do lado: o maior k com
     dia(k) ≤ data (−1 antes do início). ⚠ É a semântica do `indiceDe` do
     CronoPlan: a data num dia sem obra conta como o dia útil anterior. */
  function idx(L, iso, teto) {
    var d = dataLocal(iso);
    if (!d) return null;
    return L.cal.indice(d.getTime(), Math.max(0, teto || 0) + 4000);
  }
  function totalDe(L, termino) {
    var t = Number(L.cab.totalDias) || 0;
    return datas(L, { i: 0, f: t, crit: false }, termino);
  }
  function mesmoLado(a, b) {
    if (!ehObj(a) || !ehObj(b) || a.tipo !== b.tipo) return false;
    if (a.tipo === "plano") return true;
    return !!(a.base && b.base && str(a.base.id) === str(b.base.id));
  }

  /* ================================================================
     A ORDEM DAS LINHAS — a do plano atual; o id que só existe numa base
     entra logo depois do último irmão da MESMA etapa já posto, depois pela
     ordem da base. ⚠ Nunca por nome.
     ================================================================ */
  function ordemDasLinhas(planoAtual, A, B, det) {
    function vale(L, id) { var n = L.porId[id]; return !!n && (det === "servico" || (det === "folha" ? n.tipo !== "servico" : n.tipo === "etapa")); }
    var out = [], posto = {};
    function por(id) { if (!own(posto, id) && (vale(A, id) || vale(B, id))) { posto[id] = true; out.push(id); } }
    if (planoAtual) arr(planoAtual.ordem).forEach(por);
    [A, B].forEach(function (L) {
      L.ordem.forEach(function (id) {
        if (own(posto, id) || !vale(L, id)) return;
        var e = L.porId[id].e, k = -1, j;
        for (j = out.length - 1; j >= 0; j--) {
          var o = A.porId[out[j]] || B.porId[out[j]] || (planoAtual && planoAtual.porId[out[j]]);
          if (o && (o.e === e || out[j] === e)) { k = j; break; }
        }
        posto[id] = true;
        if (k < 0) out.push(id); else out.splice(k + 1, 0, id);
      });
    });
    return out;
  }

  /* ================================================================
     O REALIZADO de um nó. `real` = {id: {ini, fim, pct}} (a fiação monta
     do painel previsto × realizado — a mesma apuração, nunca uma segunda).
     Sem fim e com o nó no plano atual → "em andamento", com o último dia
     do plano atual ROTULADO (regra 5).
     ================================================================ */
  function realDe(id, real, plano, termino) {
    var x = ehObj(real) && own(real, id) ? real[id] : null;
    if (!x || !(x.ini || x.fim)) return null;
    var o = { ini: str(x.ini) || null, fim: str(x.fim) || null, pct: x.pct == null ? null : Number(x.pct) };
    if (!o.fim) {
      o.estado = "andamento";
      var p = plano && plano.porId[id];
      if (p) { o.fimProj = datas(plano, p, termino).fim; o.rotulo = "previsto pelo plano atual"; }
    } else o.estado = "concluido";
    return o;
  }

  function comparar(e) {
    e = e || {};
    var termino = own(TERMINOS, e.termino) ? e.termino : "ultimoDia";
    var det = own(DETALHES, e.detalhe) ? e.detalhe : "folha";
    var filtro = own(FILTROS, e.filtro) ? e.filtro : "tudo";
    if (!e.A || !e.B) return falha("escolha as duas linhas de base da comparação.");
    if (mesmoLado(e.A, e.B)) return falha("escolha duas linhas de base diferentes.");
    if (!Pl() || !Cr()) return falha("motores do cronograma não carregados (cronograma.js / cronoplan.js).");
    var A = lado(e.A), B = lado(e.B);
    if (A.erro) return falha(A.erro);
    if (B.erro) return falha(B.erro);
    var PA = null;
    if (e.planoAtual) { PA = lado({ tipo: "plano", r: e.planoAtual }); if (PA.erro) PA = null; }
    var avisos = [];
    function aviso(cod, msg) { avisos.push({ tipo: cod, msg: msg }); }
    if (det !== "etapa") {
      [A, B].forEach(function (L) { if (L.soEtapas) aviso("so-etapas", "a " + L.rot + " guarda só as etapas (selo de uma versão antiga, já resumida) — nas subetapas e nos serviços ela não aparece."); });
    }
    var semServ = [];
    if (det === "servico") {
      [A, B].forEach(function (L) {
        if (!L.temServ) { semServ.push(L); aviso("sem-servico", "a " + L.rot + " não guarda o detalhe por serviço — a comparação por serviço mostra só as subetapas dela."); }
      });
    }
    if (A.cab.orcamentoId && B.cab.orcamentoId && A.cab.orcamentoId !== B.cab.orcamentoId) {
      aviso("outro-orcamento", "as duas versões foram congeladas sobre orçamentos diferentes — só o que tem o mesmo id é comparado.");
    }
    var calIgual = (function () {
      var ca = e.A.base ? e.A.base.cal : null, cb = e.B.base ? e.B.base.cal : null;
      if (!ca || !cb) return false;
      return Number(ca.diasUteisSemana || 5) === Number(cb.diasUteisSemana || 5) && JSON.stringify(arr(ca.feriados)) === JSON.stringify(arr(cb.feriados));
    })();
    var ordem = ordemDasLinhas(PA, A, B, det);
    var foraA = {};
    arr(A.cab.opcionaisFora).forEach(function (id) { foraA[str(id)] = true; });
    var foraB = {};
    arr(B.cab.opcionaisFora).forEach(function (id) { foraB[str(id)] = true; });
    var teto = Math.max(Number(A.cab.totalDias) || 0, Number(B.cab.totalDias) || 0) * 4 + 400;
    var linhas = ordem.map(function (id) {
      var a = A.porId[id] || null, b = B.porId[id] || null, at = PA ? PA.porId[id] : null, ref = at || b || a;
      if (a && det !== "servico" && a.tipo === "servico") a = null;
      if (b && det !== "servico" && b.tipo === "servico") b = null;
      var l = { id: id, tipo: ref.tipo, numero: at ? at.num : (ref.num || ""), nome: at ? at.nome : (ref.nome || ""), e: ref.e,
        A: a ? datas(A, a, termino) : null, B: b ? datas(B, b, termino) : null, R: realDe(id, e.real, PA, termino),
        presenca: a && b ? "ambas" : (a ? "so-A" : "so-B") };
      if (!l.nome && ref.tipo === "servico") l.nome = "serviço que não está mais no orçamento";
      if (ref.tipo === "servico") {
        /* ⚠ serviço num lado SEM o detalhe: não é "saiu" nem "entrou" — é
           "esta versão não guarda serviço" */
        if (!a && A.temServ === false) l.semServico = "A";
        if (!b && B.temServ === false) l.semServico = l.semServico ? "AB" : "B";
        if (l.semServico) l.presenca = "sem-servico";
      }
      if (a && b) {
        l.dIniDC = dc(l.A.ini, l.B.ini); l.dFimDC = dc(l.A.fim, l.B.fim);
        var kb = idx(A, l.B.fim, teto), ka = idx(A, l.A.fim, teto);
        l.dFimDU = (kb == null || ka == null) ? null : kb - ka;
        l.dDurDU = (b.f - b.i) - (a.f - a.i);
        l.mudou = l.dIniDC !== 0 || l.dFimDC !== 0 || l.dDurDU !== 0;
        if (a.e !== b.e) { l.mudouDeEtapa = true; l.mudou = true; }
        if (ref.tipo === "servico" && a.folha !== b.folha) {
          l.mudouDeFolha = [a.folhaNum || (A.porId[a.folha] ? A.porId[a.folha].num : ""), b.folhaNum || (B.porId[b.folha] ? B.porId[b.folha].num : "")];
          l.mudou = true;
        }
      } else if (l.presenca !== "sem-servico") l.mudou = true;
      if (l.presenca === "so-B" && own(foraA, l.e)) l.opcional = "so-B";
      if (l.presenca === "so-A" && own(foraB, l.e)) l.opcional = "so-A";
      if (l.R && a) {
        var fimR = l.R.fim || l.R.fimProj || null;
        l.dRealA = fimR ? dc(l.A.fim, fimR) : null;
        l.atrasada = l.dRealA != null && l.dRealA > 0;
      } else if (a && e.dataCorte && !(l.R && l.R.fim)) {
        /* sem fim real e com o término da A antes da data de corte: atrasada */
        l.atrasada = str(e.dataCorte) > l.A.fim;
      }
      return l;
    });
    /* ---- TOTAIS (antes do filtro: o resumo é da comparação inteira) ---- */
    var tA = totalDe(A, termino), tB = totalDe(B, termino);
    var T = {
      A: { ini: tA.ini, fim: tA.fim, du: Number(A.cab.totalDias) || 0 },
      B: { ini: tB.ini, fim: tB.fim, du: Number(B.cab.totalDias) || 0 },
      difTermino: { dc: dc(tA.fim, tB.fim), du: (function () { var k1 = idx(A, tB.fim, teto), k0 = idx(A, tA.fim, teto); return (k1 == null || k0 == null) ? null : k1 - k0; })() },
      difPrazo: (Number(B.cab.totalDias) || 0) - (Number(A.cab.totalDias) || 0),
      mudaram: 0, terminamDepois: 0, terminamAntes: 0, soA: 0, soB: 0, total: linhas.length, semServico: 0,
      critico: { n: 0, maiorAtraso: null },
      real: null, cobertura: null
    };
    linhas.forEach(function (l) {
      if (l.presenca === "so-A") T.soA++;
      else if (l.presenca === "so-B") T.soB++;
      else if (l.presenca === "sem-servico") T.semServico++;
      else {
        if (l.dIniDC !== 0 || l.dFimDC !== 0 || l.dDurDU !== 0 || l.mudouDeEtapa || l.mudouDeFolha) T.mudaram++;
        if (l.dFimDC > 0) T.terminamDepois++;
        if (l.dFimDC < 0) T.terminamAntes++;
      }
      if (l.A && l.A.crit) {
        T.critico.n++;
        if (l.dFimDU != null && (!T.critico.maiorAtraso || l.dFimDU > T.critico.maiorAtraso.du)) T.critico.maiorAtraso = { du: l.dFimDU, id: l.id, numero: l.numero, nome: l.nome };
      }
    });
    /* o realizado da obra: início = o 1º real; término = o real quando tudo
       terminou, senão o do plano atual, ROTULADO (regra 5) */
    var rIni = null, rFimTodos = null, faltou = false, algum = false;
    linhas.forEach(function (l) {
      if (l.tipo !== "etapa") return;
      if (!l.R) { faltou = true; return; }
      algum = true;
      if (l.R.ini && (!rIni || l.R.ini < rIni)) rIni = l.R.ini;
      if (!l.R.fim) faltou = true; else if (!rFimTodos || l.R.fim > rFimTodos) rFimTodos = l.R.fim;
    });
    if (algum) {
      T.real = { ini: rIni, fim: faltou ? null : rFimTodos };
      if (faltou && PA) {
        var tp = totalDe(PA, termino);
        T.real.fimProj = tp.fim; T.real.rotulo = "projeção do plano atual — a obra não terminou";
      }
      var fimRef = T.real.fim || T.real.fimProj || null;
      T.difRealA = fimRef ? dc(tA.fim, fimRef) : null;
    } else if (!ehObj(e.real) || !Object.keys(e.real).length) {
      aviso("sem-diarios", "nenhum diário publicado — a coluna Real sai vazia.");
    }
    /* ---- COBERTURA CONTRATUAL (D17, D18): o prazo dos aditivos, sem veredito ---- */
    if (ehObj(e.aditivos)) {
      var ad = e.aditivos;
      T.cobertura = { prazoDiasAprovado: Number(ad.prazoDiasAprovado) || 0, prazoDiasPendente: Number(ad.prazoDiasPendente) || 0,
        nAprovados: Number(ad.nAprovados) || 0, nPendentes: Number(ad.nPendentes) || 0, difTerminoDC: T.difTermino.dc,
        texto: (Number(ad.nAprovados) || 0)
          ? "Aditivos de prazo aprovados: +" + (Number(ad.prazoDiasAprovado) || 0) + " dia(s) em " + ad.nAprovados + " termo(s). A B termina " + Math.abs(T.difTermino.dc || 0) + " dia(s) corrido(s) " + ((T.difTermino.dc || 0) >= 0 ? "depois" : "antes") + " da A. Confira a unidade do prazo no contrato (corridos ou úteis) — o cadastro não diz, e por isso esta tela não afirma se o aditivo cobre a diferença."
          : "Nenhum aditivo de prazo aprovado nos contratos desta obra." + ((Number(ad.nPendentes) || 0) ? " Há " + ad.nPendentes + " aguardando aprovação (+" + (Number(ad.prazoDiasPendente) || 0) + " dia(s)) — não contam." : "") };
    }
    /* ---- FILTRO e BUSCA (só a lista; os totais já saíram) ---- */
    var q = norm(e.busca);
    var vis = linhas.filter(function (l) {
      if (filtro === "mudou" && !l.mudou) return false;
      if (filtro === "critico" && !(l.A && l.A.crit)) return false;
      if (filtro === "atrasadas" && !l.atrasada) return false;
      if (q && norm(l.numero + " " + l.nome).indexOf(q) < 0) return false;
      return true;
    });
    var rodape = [
      "Término = último dia trabalhado (a convenção do MS Project); o motor guarda o dia seguinte, e a data aqui é a de antes dele.",
      "Δ em dias corridos = diferença de datas. Δ em dias úteis contado no calendário da " + A.rot + (calIgual ? "." : " (as duas versões têm calendários diferentes: uma data num dia sem obra na " + A.rot + " conta como o dia útil anterior).")
    ];
    return {
      ok: true, detalhe: det, termino: termino, filtro: filtro,
      cab: { A: A.cab, B: B.cab, rotA: A.rot, rotB: B.rot, temServA: A.temServ, temServB: B.temServ },
      linhas: vis, omitidas: linhas.length - vis.length, totais: T, avisos: avisos, rodape: rodape
    };
  }

  /* o Gantt comparativo lê as JANELAS em data: {id: {ini, fim}} de cada lado */
  function janelas(comp) {
    var a = {}, b = {};
    if (!comp || !comp.ok) return { A: a, B: b };
    arr(comp.linhas).forEach(function (l) {
      if (l.A) a[l.id] = { ini: l.A.ini, fim: l.A.fim, marco: l.A.marco };
      if (l.B) b[l.id] = { ini: l.B.ini, fim: l.B.fim, marco: l.B.marco };
    });
    return { A: a, B: b };
  }

  var CronoComp = {
    pronto: true,
    TERMINO_PADRAO: "ultimoDia",
    comparar: comparar,
    lado: lado,
    ordemDasLinhas: ordemDasLinhas,
    datas: datas,
    realDe: realDe,
    janelas: janelas,
    diasCorridos: dc,
    _norm: norm,
    _br: br,
    _dep: dep
  };

  global.CronoComp = CronoComp;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoComp;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
