/* =====================================================================
 * cronorede.js — CronoRede: a REDE digitada do cronograma: tipos de ligação
 * TI/II/TT/IT, espera, elo entre subetapas de etapas diferentes e as
 * restrições de data novas; a assinatura (FNV-1a) que reconhece a sombra
 * escrita para a versão anterior.
 *
 * Planejador, fatia 1A (motor). Espec: ESPEC-planejador.md (rev. 4), §1.3,
 * §2.3-E4, §2.8, O22, O23, O26.
 *
 * O QUE MORA AQUI (e por que num arquivo à parte)
 *   `cronograma.rede` guarda a rede que a PESSOA digitou: `etapas[id]` e
 *   `folhas[id]` com `e: [{i, t?, l?}]` (ou `c: 1`, a cascata), e
 *   `datas[id]` com `{t, d?}`. A 1.2.81 não lê nada disso: ela lê a SOMBRA
 *   que a projeção escreve nos mapas de sempre (`predecessoras`, `lags`,
 *   `sub.tipos`, `restricoes`). O `s` de cada entrada é a ASSINATURA desses
 *   mapas depois da projeção. Um aparelho antigo que edite o "Depende de"
 *   troca os mapas e deixa `rede` intacta — a assinatura deixa de bater, e
 *   vale o que ele gravou (o legado), com o aviso `rede-substituida`.
 *
 * ⚠ UMA RÉGUA SÓ PARA A ASSINATURA (I11). `hash`/`assinar` servem à rede, a
 *   `mat.restricoes[].s`, a `mat.etapas[].s` quando é objeto, e à comparação
 *   interna do `iaedit`. A EXCEÇÃO (O31): o valor GRAVADO em `iaProv[k].v`
 *   continua no formato da 1.2.81 (o JSON do `sigDep`) — com o hash ali, as
 *   duas versões leriam a ligação que a IA da outra definiu como "você
 *   definiu".
 * ⚠ LEITURA SEMPRE EM CÓPIA: `normalizar` nunca escreve no cronograma
 *   (nada grava ao abrir, I6). Forma torta vira aviso, nunca exceção.
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
  function mapa(o, k) { var m = ehObj(o) ? o[k] : null; return ehObj(m) ? m : null; }

  var TIPOS_ELO = ["TI", "II", "TT", "IT"];
  /* os tipos de data por nível (§1.3, `rede.datas[id].t`):
     - etapa: os NOVOS (dia, dta, nta, nid, mtp) e a MARCA `tae` sem data (O22);
       `nia`/`tae` de etapa com data moram em `restricoes`, na forma da 1.2.81;
     - folha: todos — restrição de subetapa só existe aqui (a 1.2.81 diria
       "aponta para uma etapa que não existe mais", medido pela REDE, G4). */
  var TIPOS_DATA = { etapa: ["dia", "dta", "nta", "nid", "mtp", "tae"], folha: ["nia", "tae", "dia", "dta", "nta", "nid", "mtp"] };
  var DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* JSON canônico: chaves em ordem, `undefined` vira null. A ordem de
     inserção das chaves muda entre aparelhos e depois de um desfazer; sem a
     ordem, a mesma sombra teria duas assinaturas. */
  function canon(x) {
    if (x === undefined) return "null";
    if (ehLista(x)) { var a = [], i; for (i = 0; i < x.length; i++) a.push(canon(x[i])); return "[" + a.join(",") + "]"; }
    if (x && typeof x === "object") {
      var ks = Object.keys(x).sort(), o = [], k;
      for (k = 0; k < ks.length; k++) if (x[ks[k]] !== undefined) o.push(JSON.stringify(ks[k]) + ":" + canon(x[ks[k]]));
      return "{" + o.join(",") + "}";
    }
    return JSON.stringify(x);
  }
  /* FNV-1a 32 bits sobre os bytes UTF-8, 8 hex (§1.3). ⚠ `unescape(
     encodeURIComponent(s))` dá os bytes UTF-8 como string binária em ES5 — o
     texto com acento ("Fundação") tem outra assinatura que o mesmo texto sem
     acento, e é para ter. */
  function hash(s) {
    var h = 0x811c9dc5, i, b = unescape(encodeURIComponent(String(s)));
    for (i = 0; i < b.length; i++) {
      h ^= b.charCodeAt(i);
      // multiplicação por 16777619 em 32 bits, sem Math.imul (WebView antigo)
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("0000000" + (h >>> 0).toString(16)).slice(-8);
  }
  function assinar(x) { return hash(canon(x === undefined ? null : x)); }

  /* A ASSINATURA DOS MAPAS DE SEMPRE de um nó, depois da projeção (§1.3):
       etapa: {p: predecessoras[id] ?? null, l: lags[id] ?? null}
       folha: o mesmo em `sub`, mais t: sub.tipos[id] ?? null
       data:  restricoes[etapaId] ?? null
     ⚠ Lê o que ESTÁ no disco, inclusive mapa que voltou como lista (aí vale
     null: é o que a 1.2.81 também leria). */
  function valorNo(m, id) { return m && own(m, id) ? m[id] : null; }
  function assinatura(cron, nivel, id) {
    if (nivel === "datas") return assinar(valorNo(mapa(cron, "restricoes"), id));
    var base = nivel === "folhas" ? mapa(cron, "sub") : cron;
    var o = { p: valorNo(mapa(base, "predecessoras"), id), l: valorNo(mapa(base, "lags"), id) };
    if (nivel === "folhas") o.t = valorNo(mapa(base, "tipos"), id);
    return assinar(o);
  }

  function intOk(v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v && Math.abs(v) <= 9999; }
  /* um elo na forma do disco → {i, t, l} normalizado, ou {erro} */
  function lerElo(z) {
    if (!ehObj(z) || typeof z.i !== "string" || !z.i) return { erro: "forma" };
    var t = own(z, "t") ? String(z.t).toUpperCase() : "TI";
    if (TIPOS_ELO.indexOf(t) < 0) return { erro: "tipo", i: z.i };
    if (own(z, "l") && z.l !== null && !intOk(z.l)) return { erro: "espera", i: z.i };
    return { i: z.i, t: t, l: (own(z, "l") && z.l !== null) ? z.l : null };
  }

  /* NORMALIZAR (§1.9) — a rede do disco em CÓPIA, com os avisos. Devolve
     null sem rede nenhuma; senão {v, etapas, folhas, datas, avisos}. Cada
     entrada guardada leva `s` (a assinatura gravada) e, nas de elos,
     `e` (lista de {i, t, l}) ou `c: true`. Entrada torta sai com aviso e
     fica de fora (vale o legado naquele nó). */
  function normalizar(rede) {
    if (!ehObj(rede)) return null;
    var out = { v: rede.v, etapas: {}, folhas: {}, datas: {}, avisos: [] };
    function aviso(cod, nivel, id, extra) { var a = { tipo: cod, nivel: nivel, id: id }, k; for (k in (extra || {})) if (own(extra, k)) a[k] = extra[k]; out.avisos.push(a); }
    ["etapas", "folhas"].forEach(function (nv) {
      var m = mapa(rede, nv);
      if (!m) return;
      Object.keys(m).forEach(function (id) {
        var x = m[id];
        if (!ehObj(x)) { aviso("rede-forma", nv, id); return; }
        var ent = { s: typeof x.s === "string" ? x.s : null };
        if (x.c === 1 || x.c === true) ent.c = true;
        else if (!ehLista(x.e)) { aviso("rede-forma", nv, id); return; }
        else {
          ent.e = [];
          for (var j = 0; j < x.e.length; j++) {
            var el = lerElo(x.e[j]);
            if (el.erro) { aviso(el.erro === "tipo" ? "rede-tipo" : "rede-forma", nv, id, { elo: el.i || null }); continue; }
            ent.e.push(el);
          }
        }
        out[nv][id] = ent;
      });
    });
    var md = mapa(rede, "datas");
    if (md) Object.keys(md).forEach(function (id) {
      var x = md[id];
      if (!ehObj(x) || typeof x.t !== "string") { aviso("rede-forma", "datas", id); return; }
      var t = x.t.toLowerCase();
      if (TIPOS_DATA.folha.indexOf(t) < 0) { aviso("rede-tipo", "datas", id, { t: x.t }); return; }
      var d = own(x, "d") ? x.d : null;
      if (d != null && (typeof d !== "string" || !DATA_RE.test(d))) { aviso("rede-forma", "datas", id); return; }
      out.datas[id] = { t: t, d: d, s: typeof x.s === "string" ? x.s : null };
    });
    return out;
  }

  /* A REDE EFETIVA de um nó (§1.3, REDE §c.2): a digitada quando a
     assinatura bate; o legado quando não há entrada ou ela não bate.
     `R` = `normalizar(cron.rede)` (quem chama normaliza uma vez). */
  function efetiva(cron, R, nivel, id) {
    var e = R && R[nivel] && own(R[nivel], id) ? R[nivel][id] : null;
    if (!e) return { fonte: "legado" };
    var agora = assinatura(cron, nivel, id);
    if (e.s !== agora) return { fonte: "legado", substituida: { de: e.e || null, c: !!e.c } };
    return e.c ? { fonte: "rede", c: true } : { fonte: "rede", elos: e.e };
  }

  /* A MARCA `tae` DE ETAPA (O22): `rede.datas[id] = {t: "tae", s}` sem data.
     Vale só quando a assinatura bate E existe o "terminar até" que ela marca
     — na entrada de `restricoes` ou, coberto pela sombra, em
     `mat.restricoes[id].u`. Sem marca válida, o `tae` segue a regra da
     1.2.81: só o aviso, sem mexer na folga. */
  function marcaTae(cron, R, etapaId) {
    var d = R && own(R.datas, etapaId) ? R.datas[etapaId] : null;
    if (!d || d.t !== "tae" || d.d) return false;
    if (d.s !== assinatura(cron, "datas", etapaId)) return false;
    var r = valorNo(mapa(cron, "restricoes"), etapaId);
    if (ehObj(r) && r.origem !== "mat" && String(r.tipo).toLowerCase() === "tae") return true;
    var mt = mapa(cron, "mat"), mr = mt ? mapa(mt, "restricoes") : null, u = mr && own(mr, etapaId) && ehObj(mr[etapaId]) ? mr[etapaId].u : null;
    return ehObj(u) && String(u.tipo).toLowerCase() === "tae";
  }

  /* AS ARESTAS CRUZADAS (O26, D7 "a etapa anda em bloco"): só a aresta
     Ep→Ef e os dados do elo; o VALOR sai na ida, pela posição real da
     subetapa predecessora (Cronograma, E8).
     `efet(nivel, id)` = a função de rede efetiva de quem chama;
     `folhaDe` = {folhaId: etapaId} de TODAS as folhas; `ehEtapa(id)`.
     Três formas:
       folha f (de Ef) → folha pf de OUTRA etapa Ep   {Ep, Ef, pf, f}
       folha f (de Ef) → ETAPA Ep inteira ("E5")        {Ep, Ef, pf: null, f}
       etapa Ef        → folha pf de outra etapa Ep     {Ep, Ef, pf, f: null}  */
  function arestasCruzadas(folhaDe, ehEtapa, efet, idsFolhas, idsEtapas) {
    var out = [];
    (idsFolhas || []).forEach(function (f) {
      var ef = efet("folhas", f);
      if (!ef || ef.fonte !== "rede" || !ef.elos) return;
      var Ef = folhaDe[f];
      ef.elos.forEach(function (el) {
        if (own(folhaDe, el.i) && folhaDe[el.i] !== Ef) out.push({ Ep: folhaDe[el.i], Ef: Ef, pf: el.i, f: f, t: el.t, l: el.l });
        else if (ehEtapa(el.i) && el.i !== Ef) out.push({ Ep: el.i, Ef: Ef, pf: null, f: f, t: el.t, l: el.l });
      });
    });
    (idsEtapas || []).forEach(function (e) {
      var ee = efet("etapas", e);
      if (!ee || ee.fonte !== "rede" || !ee.elos) return;
      ee.elos.forEach(function (el) {
        if (own(folhaDe, el.i) && folhaDe[el.i] !== e) out.push({ Ep: folhaDe[el.i], Ef: e, pf: el.i, f: null, t: el.t, l: el.l });
      });
    });
    return out;
  }

  /* cabe inteira no legado? (§1.3: "o gravador apaga a entrada de elos quando
     a rede digitada cabe inteira no legado e não há âncora") — só TI, II
     entre folhas da mesma etapa, sem elo cruzado; espera explícita é legado
     (o `lags` de sempre). */
  function cabeNoLegado(nivel, elos, mesmoNivel) {
    for (var i = 0; i < (elos || []).length; i++) {
      var el = elos[i];
      if (!mesmoNivel(el.i)) return false;
      if (el.t === "TI") continue;
      if (el.t === "II" && nivel === "folhas") continue;
      return false;
    }
    return true;
  }

  /* o elo na FORMA ENXUTA do disco (O29): TI sem `t`; espera ausente sem `l` */
  function eloDisco(el) {
    var o = { i: el.i };
    if (el.t && el.t !== "TI") o.t = el.t;
    if (el.l != null) o.l = el.l;
    return o;
  }

  var CronoRede = {
    pronto: true,
    _dep: dep,
    TIPOS_ELO: TIPOS_ELO,
    TIPOS_DATA: TIPOS_DATA,
    canon: canon,
    hash: hash,
    assinar: assinar,
    assinatura: assinatura,
    normalizar: normalizar,
    efetiva: efetiva,
    marcaTae: marcaTae,
    arestasCruzadas: arestasCruzadas,
    cabeNoLegado: cabeNoLegado,
    eloDisco: eloDisco,
    lerElo: lerElo
  };

  global.CronoRede = CronoRede;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoRede;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
