/* =====================================================================
 * icarliberacao.js — LIBERAÇÃO DO IÇAMENTO COM RESPONSABILIDADE (ESPEC-ICAMENTO-CENARIO.md §K e §II.11).
 * Motor PURO (ES5, testável em Node). A tela (gestao.js) decide QUEM pode (Auth.podeAprovar) e grava a lista no plano.
 *
 * Regras:
 *  - DENTRO das condições (o plano diz LIBERADO, nada pendente): um registro "dentro" com quem e quando.
 *  - FORA das condições (suspender, bloqueio, documento pendente, içamento crítico): exige NOME, FUNÇÃO, MOTIVO com o mínimo
 *    de caracteres (premissa) e a confirmação digitada "LIBERO"; o registro sai marcado "fora" com os motivos do sistema.
 *  - ANULAR: novo registro "anula" apontando o anterior, com motivo — nada se apaga.
 *  - IMUTÁVEL e ENCADEADO: cada registro guarda o hash (SHA-256) do anterior e o seu; mexer em qualquer um quebra a cadeia
 *    dali em diante e `verificar` diz onde.
 * ⚠ A função de hash é recebida (opts.sha256): no navegador, Util.sha256hex; no teste, a do Node. Sem ela, NÃO grava (um
 *   registro sem hash seria uma liberação que não se consegue provar).
 * ⚠ O hash cobre o registro em forma CANÔNICA (chaves em ordem): a mesma liberação dá o mesmo hash em qualquer aparelho.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MIN_MOTIVO = 20;          // premissa: motivo de liberação fora das condições com pelo menos 20 caracteres
  var CONFIRMA = "LIBERO";
  var ZERO = "0000000000000000000000000000000000000000000000000000000000000000";

  function txt(v) { return String(v == null ? "" : v).trim(); }
  /* JSON canônico: chaves em ordem alfabética, sem espaços — o hash não pode depender da ordem de criação do objeto */
  function canonico(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return "[" + v.map(canonico).join(",") + "]";
    return "{" + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ":" + canonico(v[k]); }).join(",") + "}";
  }
  function semHash(r) { var o = {}; for (var k in r) if (k !== "hash") o[k] = r[k]; return o; }

  /* o que o registro precisa, conforme o tipo; devolve a lista de faltas (vazia = pode gravar) */
  function validar(d, cond) {
    var f = [];
    d = d || {}; cond = cond || {};
    var q = d.quem || {};
    if (!txt(q.nome)) f.push("nome de quem libera");
    if (d.tipo === "dentro") {
      if (cond.status !== "LIBERADO") f.push("o plano não está liberado (" + (cond.status || "sem status") + ") — use a liberação fora das condições");
    } else if (d.tipo === "fora") {
      if (!txt(q.funcao)) f.push("função de quem libera");
      if (txt(d.motivo).length < MIN_MOTIVO) f.push("motivo com pelo menos " + MIN_MOTIVO + " caracteres");
      if (txt(d.confirmacao).toUpperCase() !== CONFIRMA) f.push("a confirmação digitada \"" + CONFIRMA + "\"");
    } else if (d.tipo === "anula") {
      if (!txt(d.anula)) f.push("qual registro está sendo anulado");
      if (txt(d.motivo).length < MIN_MOTIVO) f.push("motivo da anulação com pelo menos " + MIN_MOTIVO + " caracteres");
    } else f.push("tipo de registro (dentro, fora ou anula)");
    return f;
  }

  /* lista = a do plano (só cresce); d = { tipo, icamentoId, planoId, obraId, quem: {nome, funcao, usuario, aparelho}, motivo,
     confirmacao, anula, clima, anemometro_ms, foto, assinatura }; cond = { status, motivosSistema, versaoPlano };
     opts = { agora (ISO), sha256 (fn), id } → { ok, registro, faltas } */
  function registrar(lista, d, cond, opts) {
    opts = opts || {}; cond = cond || {};
    if (typeof opts.sha256 !== "function") return { ok: false, faltas: ["sem a função de hash — a liberação não seria verificável"] };
    var faltas = validar(d, cond);
    if (d && d.tipo === "anula" && !faltas.length && !(lista || []).some(function (x) { return x.id === d.anula; })) faltas.push("o registro a anular não existe na lista");
    if (faltas.length) return { ok: false, faltas: faltas };
    var ant = (lista || [])[(lista || []).length - 1];
    var q = d.quem || {};
    var r = {
      id: opts.id || ("lib_" + (opts.agora || "").replace(/[^0-9]/g, "") + "_" + ((lista || []).length + 1)),
      tipo: d.tipo, icamentoId: d.icamentoId || null, planoId: d.planoId || null, obraId: d.obraId || null,
      quem: { nome: txt(q.nome), funcao: txt(q.funcao), usuario: txt(q.usuario), aparelho: txt(q.aparelho) },
      em: opts.agora || null, motivo: txt(d.motivo), status: cond.status || null, motivosSistema: (cond.motivosSistema || []).slice(),
      anula: d.tipo === "anula" ? txt(d.anula) : null, clima: d.clima || null, anemometro_ms: d.anemometro_ms == null ? null : +d.anemometro_ms,
      versaoPlano: cond.versaoPlano == null ? null : cond.versaoPlano, foto: d.foto || null, assinatura: d.assinatura || null,
      hashAnterior: ant ? ant.hash : ZERO
    };
    r.hash = opts.sha256(canonico(r));
    return { ok: true, registro: r, faltas: [] };
  }

  /* refaz a cadeia: o primeiro registro que não bate (hash próprio OU elo com o anterior) */
  function verificar(lista, sha256) {
    var o = { ok: true, n: (lista || []).length, quebradoEm: null, motivo: "" };
    if (typeof sha256 !== "function") return { ok: false, n: o.n, quebradoEm: null, motivo: "sem a função de hash" };
    var anterior = ZERO;
    for (var i = 0; i < (lista || []).length; i++) {
      var r = lista[i];
      if (r.hashAnterior !== anterior) { o.ok = false; o.quebradoEm = i; o.motivo = "elo com o registro anterior quebrado"; return o; }
      if (sha256(canonico(semHash(r))) !== r.hash) { o.ok = false; o.quebradoEm = i; o.motivo = "conteúdo alterado depois de gravado"; return o; }
      anterior = r.hash;
    }
    return o;
  }

  /* a liberação que VALE para um içamento: o último "dentro"/"fora" que não foi anulado */
  function vigente(lista, icamentoId) {
    var anulados = {};
    (lista || []).forEach(function (r) { if (r.tipo === "anula" && r.anula) anulados[r.anula] = r; });
    var v = null;
    (lista || []).forEach(function (r) { if ((r.tipo === "dentro" || r.tipo === "fora") && r.icamentoId === icamentoId && !anulados[r.id]) v = r; });
    return v;
  }

  var IcarLiberacao = { MIN_MOTIVO: MIN_MOTIVO, CONFIRMA: CONFIRMA, ZERO: ZERO, canonico: canonico, validar: validar, registrar: registrar, verificar: verificar, vigente: vigente };
  global.IcarLiberacao = IcarLiberacao;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarLiberacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
