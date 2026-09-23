/* =====================================================================
 * cronoalt.js — CronoAlt: o HISTÓRICO DE ALTERAÇÕES do cronograma
 * (entidade `crono_alt`; fatia 1C do planejador, "uso"): diff, evento,
 * sessão, poda, lacunas e o merge da nuvem (`mergeNuvem`, consultado NA
 * HORA pelo js/nuvem.js). Motor PURO: sem DOM, sem Store, sem relógio.
 *
 * Espec: ESPEC-planejador.md (rev. 4), O8, O18, O19, §1.6, §1.10-2, §3.3
 * (1C); desenho uso.md §1.5, §2.2 e §3.3.
 *
 * ⚠ O NOME É `crono_alt`/`CronoAlt`, NUNCA "hist": `crono-hist`,
 *   `_cronoHistAbrir`, `_cronoHistEstado` e `_cronoHistBase` já são do
 *   HISTOGRAMA (js/app.js). A frente USO desenhou com o nome em colisão
 *   (espec §0.1-5, O8).
 * ⚠ `m` É LISTA DE OBJETOS, nunca lista de listas (O18): a entidade sobe como
 *   `set({v: lista})` e o Firestore recusa lista aninhada — o `push` antigo
 *   engolia o erro e dizia "Sincronizado".
 * ⚠ TETOS POR CONTAGEM, NUNCA POR SOMA DE BYTES (USO §3.3). A poda "mantém o
 *   evento se couber no alvo (60) e na empresa (800)", do mais novo para o
 *   mais velho, é o guloso de uma matróide laminar: podar(podar(X) ∪
 *   podar(Y)) = podar(X ∪ Y), e o evento podado num aparelho não ressuscita
 *   pelo outro. Uma soma de bytes não tem essa propriedade (a suíte prova com
 *   sorteio). O limite de bytes é POR EVENTO (700 B), garantido pelo corte.
 * ⚠ NUNCA VALOR EM R$ (o histórico aparece para quem não vê dinheiro): a
 *   mudança de custo por equipe-dia vira "custo da equipe alterado", sem
 *   números.
 * ⚠ A SOMBRA DA PROJEÇÃO NÃO É ALTERAÇÃO DE NINGUÉM (espec §1.6): entradas
 *   com `origem:"mat"`, duração com `mat.*[id]` intacta, marcas
 *   "subetapas" e `mat` inteiro contam como "auto", fora da lista.
 * ⚠ TAREFA SEM PREÇO POR ID (O23): o nº T muda quando a lista é reordenada.
 *   `m[].id` é o id estável e `m[].n` o nº daquele momento; o `r` sempre traz
 *   o nome, e a tela resolve o nº de hoje pelo id ("T3, hoje T2").
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

  /* a entidade que este módulo guarda (lista; espec §1.6). O nome nasce aqui na
     Onda 0 porque o funil do sub-usuário e a cascata da obra já a listam. */
  var ENTIDADE = "crono_alt";
  var FMT = 1;
  var TETO_EVENTO = 700, POR_ALVO = 60, TOTAL = 800, SESSAO_MS = 10 * 60 * 1000;

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function arr(v) { return ehLista(v) ? v : []; }
  function ehObj(v) { return !!v && typeof v === "object" && !ehLista(v); }
  function obj(v) { return ehObj(v) ? v : {}; }
  function str(v) { return v == null ? "" : String(v); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function pad3(n) { return n < 10 ? "00" + n : (n < 100 ? "0" + n : String(n)); }
  function corta(s, n) { s = str(s); return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s; }

  /* bytes UTF-8 de um texto (a régua do Firestore e da M0) */
  function bytesUtf8(s) {
    s = str(s);
    var n = 0, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  /* FNV-1a 32 bits, 8 hex, sobre os bytes UTF-8. ⚠ Só se compara com outro
     hash DESTE módulo (ha/h do histórico): a assinatura da rede é outra
     régua (CronoRede.assinatura, da 1A). */
  function hash(s) {
    s = str(s);
    var h = 0x811c9dc5, i, c, bs = [];
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) bs.push(c);
      else if (c < 0x800) bs.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var cp = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
        bs.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else bs.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    for (i = 0; i < bs.length; i++) { h ^= bs[i]; h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    var x = h.toString(16);
    while (x.length < 8) x = "0" + x;
    return x;
  }
  function canon(x) {
    var P = dep("CronoPilha", "./cronopilha.js");
    if (P && typeof P.canon === "function") return P.canon(x);
    return JSON.stringify(x);
  }

  /* chaves de dinheiro nos parâmetros: a mudança entra SEM valores */
  var RE_DINHEIRO = /custo|valor|preco|preço|bdi/i;
  /* o que a pessoa lê em "Por onde" */
  var ORIGENS = {
    grade: "Grade do Gantt", tecla: "Grade do Gantt", duplo: "Cartão do Gantt", cartao: "Cartão do Gantt", tabela: "Tabela",
    arrasto: "Arrasto no Gantt", soltar: "Soltar a data", recalcular: "Recalcular", limpar: "Limpar edições",
    exec: "Modo executivo", parametros: "Parâmetros", execucao: "Aba Execução", equipes: "Equipes da subetapa",
    sequencia: "Sequência construtiva", ia: "Editar com IA", "ia-desfazer": "Desfazer da IA", desfazer: "Desfazer",
    refazer: "Refazer", medicao: "Medição aprovada", avanco: "Avanço lançado", tela: "Aba Cronograma"
  };
  var ABREV = { grade: "g", tecla: "g", duplo: "c", cartao: "c", tabela: "t", arrasto: "a", soltar: "s", recalcular: "r", limpar: "l",
    exec: "x", parametros: "p", execucao: "e", equipes: "q", sequencia: "q", ia: "i", "ia-desfazer": "i", desfazer: "d", refazer: "d",
    medicao: "m", avanco: "v", tela: "o" };
  /* o que cada campo diz no recado */
  var CAMPOS = {
    dur: "duração", marco: "marco", pred: "depende de", data: "data fixada", eq: "equipes", "modo executivo": "modo executivo",
    extra: "tarefa sem preço", "extra:nome": "nome", "extra:dur": "duração", "extra:resp": "responsável", "extra:preds": "depende de",
    "extra:sucs": "sucessoras", "extra:ordem": "posição", "extra:proposta": "mostrar na proposta", "extra:nia": "não iniciar antes de",
    "extra:nota": "nota", cal: "calendário", "cal:lista": "calendários", "cal:dur": "duração da frente", rede: "ligação",
    avanco: "avanço", "avanco:corte": "data de corte", "param:custo": "custo da equipe alterado", "param:equipes": "equipes da obra",
    "param:diasUteisSemana": "dias úteis por semana", "param:paralelismo": "paralelismo", "param:dataInicio": "início",
    "param:descontarFeriados": "descontar feriados", "param:feriadosExtras": "feriados locais", "param:opcionaisNoPrazo": "opcionais no prazo"
  };

  function dataBR(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(s)); return m ? m[3] + "/" + m[2] + "/" + m[1] : str(s); }
  var TIPO_REST = { nia: "não iniciar antes de", tae: "terminar até", dia: "deve iniciar em", dta: "deve terminar em", nta: "não terminar antes de",
    nid: "não iniciar depois de", mtp: "o mais tarde possível" };
  function txtRestricao(x) {
    if (!ehObj(x)) return "";
    var t = str(x.tipo || x.t), d = x.data || x.d;
    return (TIPO_REST[t] || t) + (d ? " " + dataBR(d) : "");
  }
  var DETALHE = " (só o detalhe mudou)";
  function txtValor(v) {
    if (v == null) return "";
    if (typeof v === "boolean") return v ? "sim" : "não";
    if (ehLista(v)) return v.map(function (x) { return ehObj(x) ? str(x.data || x.id || "") : str(x); }).join(", ");
    if (ehObj(v)) return corta(canon(v), 40);
    return str(v);
  }

  /* A ÁRVORE DE NÚMEROS E NOMES que o recado usa: do resultado do motor
     (etapa = posição; folha = nº EAP; tarefa sem preço = "T<n>"). Sem `r`,
     a etapa sai pela ordem de `etapas` (o orçamento) e o resto pelo id. */
  function mapas(ctx) {
    ctx = ctx || {};
    var num = {}, nome = {};
    arr(ctx.etapas).forEach(function (e, i) { if (e && e.id != null) { num[str(e.id)] = String(i + 1); nome[str(e.id)] = str(e.nome); } });
    var r = ctx.r;
    if (r) {
      arr(r.etapas).forEach(function (e, i) { if (e && e.id != null) { num[str(e.id)] = String(i + 1); nome[str(e.id)] = str(e.nome); } });
      arr(r.atividades).forEach(function (n) {
        if (!n || n.id == null || n.tipo === "etapa") return;
        if (n.numero != null) num[str(n.id)] = str(n.numero);
        nome[str(n.id)] = str(n.nome);
      });
      arr(r.extras).forEach(function (x, i) { if (x && x.id != null) { num[str(x.id)] = x.numero != null ? str(x.numero) : "T" + (i + 1); nome[str(x.id)] = str(x.nome); } });
    }
    return { num: num, nome: nome };
  }
  function predTxt(ids, lags, tipos, mp) {
    return arr(ids).map(function (p) {
      var k = str(p), l = lags && own(lags, k) ? Number(lags[k]) : null, t = tipos && own(tipos, k) ? str(tipos[k]) : "";
      return (mp.num[k] || k) + (t && t !== "TI" ? t : "") + (l != null && isFinite(l) && l !== 0 ? (l > 0 ? "+" : "") + l : "");
    }).join(",");
  }
  function elosTxt(e, mp) {
    return arr(e).map(function (x) {
      if (!ehObj(x)) return "";
      var l = x.l != null ? Number(x.l) : null;
      return (mp.num[str(x.i)] || str(x.i)) + (x.t && x.t !== "TI" ? str(x.t) : "") + (l != null && isFinite(l) && l !== 0 ? (l > 0 ? "+" : "") + l : "");
    }).join(",");
  }

  var CronoAlt = {
    pronto: true,
    ENTIDADE: ENTIDADE,
    FMT: FMT,
    TETO_EVENTO: TETO_EVENTO,
    POR_ALVO: POR_ALVO,
    TOTAL: TOTAL,
    SESSAO_MS: SESSAO_MS,
    ORIGENS: ORIGENS,
    hash: hash,
    bytes: function (ev) { return bytesUtf8(JSON.stringify(ev)); },

    /* o id: "h" + AAMMDDhhmmssSSS (UTC) da CRIAÇÃO + 4 caracteres. É a chave
       de ORDEM da poda, imutável (a sessão regravada mantém o id). */
    novoId: function (agoraIso, aleatorio) {
      var d = new Date(str(agoraIso) || 0);
      if (isNaN(d.getTime())) d = new Date(0);
      var s = String(d.getUTCFullYear()).slice(2) + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
        pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + pad3(d.getUTCMilliseconds());
      var sufixo = str(aleatorio);
      if (!/^[a-z0-9]{4}$/.test(sufixo)) {
        var cs = "abcdefghijklmnopqrstuvwxyz0123456789", k;
        sufixo = "";
        for (k = 0; k < 4; k++) sufixo += cs.charAt(Math.floor(Math.random() * cs.length));
      }
      return "h" + s + sufixo;
    },
    /* a hora de criação que o id carrega (a lacuna diz "entre A e B") */
    criadoDe: function (id) {
      var m = /^h(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})/.exec(str(id));
      if (!m) return null;
      return "20" + m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + m[6] + "." + m[7] + "Z";
    },
    /* o alvo do evento: "p:<obraId>" | "o:<orcId>" */
    alvoDe: function (ev) {
      if (!ehObj(ev)) return "";
      return ev.t === "p" ? "p:" + str(ev.obraId) : "o:" + str(ev.orcId);
    },
    /* evento legível? (o torto é ignorado na leitura e podado na próxima
       gravação — §1.9) */
    valido: function (ev) {
      return ehObj(ev) && ev.fmt === FMT && typeof ev.id === "string" && /^h\d{15}/.test(ev.id) &&
        (ev.t === "p" ? !!str(ev.obraId) : (ev.t === "o" && !!str(ev.orcId))) &&
        typeof ev.atualizadoEm === "string" && (ev.m == null || ehLista(ev.m));
    },

    /* ================================================================
       O DIFF de duas FOTOS (texto canon ou objeto `{c, a}`).
       ctx = {r (o resultado do motor com a árvore — números e nomes),
       etapas (as do orçamento, na ordem)}.
       Devolve {m: [{id, n, c, de, pa}], auto: n, avanco: bool}.
       ================================================================ */
    diff: function (antes, depois, ctx) {
      function ler(f) {
        if (typeof f === "string") { try { f = JSON.parse(f); } catch (e) { f = null; } }
        return ehObj(f) ? f : {};
      }
      var A = ler(antes), D = ler(depois), cA = obj(A.c), cD = obj(D.c), mp = mapas(ctx), out = [], auto = 0;
      function add(id, c, de, pa) {
        var k = str(id);
        out.push({ id: k, n: mp.num[k] || "", c: c, de: str(de), pa: str(pa) });
      }
      function chaves(a, b) {
        var ks = {}, k;
        for (k in obj(a)) if (own(a, k)) ks[k] = 1;
        for (k in obj(b)) if (own(b, k)) ks[k] = 1;
        return Object.keys(ks).sort();
      }
      var matA = obj(cA.mat), matD = obj(cD.mat);
      /* a duração é SOMBRA quando `mat` guarda o valor escrito (`s`) e o
         disco ainda o tem, sem marca (espec §1.3, "intacta") */
      function sombraDur(c, mat, mapa, id) {
        var e = obj(obj(mat)[mapa])[id];
        if (!ehObj(e)) return false;
        var sub = mapa === "folhas", dur = sub ? obj(obj(c.sub).duracoes) : obj(c.duracoes), marc = sub ? obj(obj(c.sub).marcos) : obj(c.marcos);
        var ag = sub ? obj(obj(c.sub).agente) : obj(c.duracoesAgente);
        if (own(ag, id)) return false;
        return e.s === "m" ? marc[id] === true : dur[id] === e.s;
      }
      /* ---- etapas: duração, marco, depende de, datas fixadas ---- */
      var dA = obj(cA.duracoes), dD = obj(cD.duracoes), agA = obj(cA.duracoesAgente), agD = obj(cD.duracoesAgente);
      chaves(dA, dD).forEach(function (k) {
        if (dA[k] === dD[k]) return;
        if (agD[k] === "subetapas" || agA[k] === "subetapas") { auto++; return; }
        if (sombraDur(cA, matA, "etapas", k) || sombraDur(cD, matD, "etapas", k)) { auto++; return; }
        add(k, "dur", own(dA, k) ? dA[k] : "estimativa", own(dD, k) ? dD[k] : "estimativa");
      });
      var mA = obj(cA.marcos), mD = obj(cD.marcos);
      chaves(mA, mD).forEach(function (k) {
        if (!!mA[k] === !!mD[k]) return;
        if (sombraDur(cA, matA, "etapas", k) || sombraDur(cD, matD, "etapas", k)) { auto++; return; }
        add(k, "marco", mA[k] ? "sim" : "não", mD[k] ? "sim" : "não");
      });
      var pA = obj(cA.predecessoras), pD = obj(cD.predecessoras), lA = obj(cA.lags), lD = obj(cD.lags);
      /* ⚠ nó com entrada em `rede`: os mapas legados são SOMBRA (a rede
         digitada, comparada abaixo pelo texto, é a verdade) */
      var redeEt = {}, redeFo = {};
      [obj(obj(cA.rede).etapas), obj(obj(cD.rede).etapas)].forEach(function (x) { for (var q in x) if (own(x, q)) redeEt[q] = 1; });
      [obj(obj(cA.rede).folhas), obj(obj(cD.rede).folhas)].forEach(function (x) { for (var q in x) if (own(x, q)) redeFo[q] = 1; });
      chaves(pA, pD).concat(chaves(lA, lD)).forEach(function (k, i, todas) {
        if (todas.indexOf(k) !== i) return;
        if (own(redeEt, k)) { if (canon([pA[k], lA[k]]) !== canon([pD[k], lD[k]])) auto++; return; }
        var ta = own(pA, k) ? predTxt(pA[k], lA[k], null, mp) : "", td = own(pD, k) ? predTxt(pD[k], lD[k], null, mp) : "";
        if (ta === td) return;
        add(k, "pred", own(pA, k) ? (ta || "início da obra") : "a anterior", own(pD, k) ? (td || "início da obra") : "a anterior");
      });
      var rA = obj(cA.restricoes), rD = obj(cD.restricoes);
      chaves(rA, rD).forEach(function (k) {
        var a = ehObj(rA[k]) ? rA[k] : null, b = ehObj(rD[k]) ? rD[k] : null;
        var aU = a && a.origem !== "mat" ? a : null, bU = b && b.origem !== "mat" ? b : null;
        if ((a && !aU) || (b && !bU)) { if (canon(a) !== canon(b)) auto++; if (!aU && !bU) return; }
        var ta = aU ? txtRestricao(aU) : "", tb = bU ? txtRestricao(bU) : "";
        if (ta === tb) return;
        add(k, "data", ta || "nenhuma", tb || "nenhuma");
      });
      /* ---- subetapas ---- */
      var sA = obj(cA.sub), sD = obj(cD.sub);
      var sdA = obj(sA.duracoes), sdD = obj(sD.duracoes), sgA = obj(sA.agente), sgD = obj(sD.agente);
      chaves(sdA, sdD).forEach(function (k) {
        if (sdA[k] === sdD[k]) return;
        if (sombraDur(cA, matA, "folhas", k) || sombraDur(cD, matD, "folhas", k)) { auto++; return; }
        void sgA; void sgD;
        add(k, "dur", own(sdA, k) ? sdA[k] : "estimativa", own(sdD, k) ? sdD[k] : "estimativa");
      });
      var smA = obj(sA.marcos), smD = obj(sD.marcos);
      chaves(smA, smD).forEach(function (k) {
        if (!!smA[k] === !!smD[k]) return;
        if (sombraDur(cA, matA, "folhas", k) || sombraDur(cD, matD, "folhas", k)) { auto++; return; }
        add(k, "marco", smA[k] ? "sim" : "não", smD[k] ? "sim" : "não");
      });
      var spA = obj(sA.predecessoras), spD = obj(sD.predecessoras), slA = obj(sA.lags), slD = obj(sD.lags), stA = obj(sA.tipos), stD = obj(sD.tipos);
      chaves(spA, spD).concat(chaves(slA, slD), chaves(stA, stD)).forEach(function (k, i, todas) {
        if (todas.indexOf(k) !== i) return;
        if (own(redeFo, k)) { if (canon([spA[k], slA[k], stA[k]]) !== canon([spD[k], slD[k], stD[k]])) auto++; return; }
        var ta = own(spA, k) ? predTxt(spA[k], slA[k], stA[k], mp) : "", td = own(spD, k) ? predTxt(spD[k], slD[k], stD[k], mp) : "";
        if (ta === td) return;
        add(k, "pred", own(spA, k) ? (ta || "início da etapa") : "a anterior", own(spD, k) ? (td || "início da etapa") : "a anterior");
      });
      var seA = obj(sA.equipes), seD = obj(sD.equipes);
      chaves(seA, seD).forEach(function (k) {
        if (seA[k] === seD[k]) return;
        add(k, "eq", own(seA, k) ? seA[k] : "as da obra", own(seD, k) ? seD[k] : "as da obra");
      });
      /* ---- parâmetros e modo executivo ---- */
      var paA = obj(cA.params), paD = obj(cD.params);
      chaves(paA, paD).forEach(function (k) {
        if (canon(paA[k]) === canon(paD[k])) return;
        if (RE_DINHEIRO.test(k)) { add("", "param:custo", "", ""); return; }
        /* ⚠ mudou por dentro sem mudar o texto (o [Recalcular] reescreve os
           NOMES dos feriados e mantém as datas): "A → A" parece mudança
           nenhuma, e o evento diz o que mudou de fato */
        var tA = txtValor(paA[k]), tD = txtValor(paD[k]);
        if (tA === tD) tD += DETALHE;
        add("", "param:" + k, tA, tD);
      });
      var exA = obj(cA.exec), exD = obj(cD.exec);
      if (!!exA.rede !== !!exD.rede) add("", "modo executivo", exA.rede ? "ligado" : "desligado", exD.rede ? "ligado" : "desligado");
      chaves(exA, exD).forEach(function (k) {
        if (k === "rede" || k === "anterior" || canon(exA[k]) === canon(exD[k])) { if (k === "anterior" && canon(exA[k]) !== canon(exD[k])) auto++; return; }
        add("", "exec:" + k, txtValor(exA[k]), txtValor(exD[k]));
      });
      /* ---- tarefas sem preço, POR ID (O23) ---- */
      var xA = {}, xD = {}, oA = [], oD = [];
      arr(cA.extras).forEach(function (x, i) { if (ehObj(x) && x.id != null) { xA[str(x.id)] = { x: x, n: "T" + (i + 1) }; oA.push(str(x.id)); } });
      arr(cD.extras).forEach(function (x, i) { if (ehObj(x) && x.id != null) { xD[str(x.id)] = { x: x, n: "T" + (i + 1) }; oD.push(str(x.id)); } });
      function addX(id, n, c, de, pa) { out.push({ id: id, n: n, c: c, de: str(de), pa: str(pa) }); if (!mp.nome[id]) mp.nome[id] = str((xD[id] || xA[id]).x.nome); }
      chaves(xA, xD).forEach(function (k) {
        var a = xA[k], b = xD[k];
        if (!a) { addX(k, b.n, "extra", "", "criada"); return; }
        if (!b) { addX(k, a.n, "extra", "", "excluída"); return; }
        var ax = a.x, bx = b.x;
        if (str(ax.nome) !== str(bx.nome)) addX(k, b.n, "extra:nome", corta(ax.nome, 40), corta(bx.nome, 40));
        if (canon(ax.dur) !== canon(bx.dur)) addX(k, b.n, "extra:dur", txtValor(ax.dur), txtValor(bx.dur));
        if (str(ax.resp) !== str(bx.resp)) addX(k, b.n, "extra:resp", ax.resp, bx.resp);
        if (canon(ax.preds || []) !== canon(bx.preds || [])) addX(k, b.n, "extra:preds", elosTxt(ax.preds, mp) || "início da obra", elosTxt(bx.preds, mp) || "início da obra");
        if (canon(ax.sucs || []) !== canon(bx.sucs || [])) addX(k, b.n, "extra:sucs", elosTxt(ax.sucs, mp) || "nenhuma", elosTxt(bx.sucs, mp) || "nenhuma");
        if (!!ax.proposta !== !!bx.proposta) addX(k, b.n, "extra:proposta", ax.proposta ? "sim" : "não", bx.proposta ? "sim" : "não");
        if (canon(ax.nia || null) !== canon(bx.nia || null)) addX(k, b.n, "extra:nia", ax.nia ? dataBR(ax.nia) : "sem", bx.nia ? dataBR(bx.nia) : "sem");
        if (str(ax.nota) !== str(bx.nota)) addX(k, b.n, "extra:nota", "", "alterada");
      });
      /* reordenada: só a posição relativa das que ficaram */
      var ficamA = oA.filter(function (k) { return own(xD, k); }), ficamD = oD.filter(function (k) { return own(xA, k); });
      if (ficamA.join("|") !== ficamD.join("|")) {
        ficamD.forEach(function (k, i) { if (ficamA[i] !== k) addX(k, xD[k].n, "extra:ordem", xA[k].n, xD[k].n); });
      }
      /* ---- calendários (por id) ---- */
      var calA = obj(cA.cal), calD = obj(cD.cal);
      var cdA = obj(calA.de), cdD = obj(calD.de);
      chaves(cdA, cdD).forEach(function (k) {
        if (cdA[k] === cdD[k]) return;
        add(k, "cal", own(cdA, k) ? str(cdA[k]) : "da obra", own(cdD, k) ? str(cdD[k]) : "da obra");
      });
      var cuA = obj(calA.dur), cuD = obj(calD.dur);
      chaves(cuA, cuD).forEach(function (k) { if (cuA[k] !== cuD[k]) add(k, "cal:dur", own(cuA, k) ? cuA[k] : "estimativa", own(cuD, k) ? cuD[k] : "estimativa"); });
      var clA = {}, clD = {};
      arr(calA.lista).forEach(function (x) { if (ehObj(x) && x.id != null) clA[str(x.id)] = x; });
      arr(calD.lista).forEach(function (x) { if (ehObj(x) && x.id != null) clD[str(x.id)] = x; });
      chaves(clA, clD).forEach(function (k) {
        if (canon(clA[k]) === canon(clD[k])) return;
        add(k, "cal:lista", clA[k] ? corta(clA[k].nome, 30) : "", clD[k] ? corta(clD[k].nome, 30) : "excluído");
      });
      /* ---- rede digitada (pelo texto, sem as assinaturas) ---- */
      var rdA = obj(cA.rede), rdD = obj(cD.rede);
      ["etapas", "folhas"].forEach(function (mapa) {
        var a = obj(rdA[mapa]), b = obj(rdD[mapa]);
        chaves(a, b).forEach(function (k) {
          var ta = ehObj(a[k]) ? (a[k].c ? "cascata" : elosTxt(a[k].e, mp)) : "", tb = ehObj(b[k]) ? (b[k].c ? "cascata" : elosTxt(b[k].e, mp)) : "";
          if (ta === tb) { if (canon(a[k]) !== canon(b[k])) auto++; return; }
          add(k, "rede", ta || "padrão", tb || "padrão");
        });
      });
      var rtA = obj(rdA.datas), rtB = obj(rdD.datas);
      chaves(rtA, rtB).forEach(function (k) {
        var ta = ehObj(rtA[k]) ? txtRestricao(rtA[k]) : "", tb = ehObj(rtB[k]) ? txtRestricao(rtB[k]) : "";
        if (ta === tb) { if (canon(rtA[k]) !== canon(rtB[k])) auto++; return; }
        add(k, "data", ta || "nenhuma", tb || "nenhuma");
      });
      if (canon(cA.mat || null) !== canon(cD.mat || null)) auto++;
      /* ---- o avanço (parte `a` da foto; o gancho sem tela da medição) ---- */
      var avA = ehObj(A.a) ? A.a : null, avD = ehObj(D.a) ? D.a : null, temAv = canon(avA) !== canon(avD);
      if (temAv) {
        var naA = {}, naD = {};
        arr(avA && avA.nos).forEach(function (x) { if (ehObj(x) && x.id != null) naA[str(x.id)] = x; });
        arr(avD && avD.nos).forEach(function (x) { if (ehObj(x) && x.id != null) naD[str(x.id)] = x; });
        /* ⚠ expressão, e não `function` dentro do `if`: declaração de função em
           bloco é erro de sintaxe no modo estrito do ES5 (WebView antigo) */
        var avTxt = function (x) {
          if (!x) return "sem avanço";
          var p = x.f ? 100 : Number(x.p);
          return (isFinite(p) ? String(Math.round(p * 10) / 10).replace(".", ",") + "%" : "") + (x.f ? " (fim " + dataBR(x.f) + ")" : (x.i ? " (início " + dataBR(x.i) + ")" : ""));
        };
        chaves(naA, naD).forEach(function (k) {
          var ta = avTxt(naA[k]), tb = avTxt(naD[k]);
          if (ta === tb) { if (canon(naA[k]) !== canon(naD[k])) auto++; return; }
          add(k, "avanco", ta, tb);
        });
        if (str(avA && avA.corte) !== str(avD && avD.corte)) add("", "avanco:corte", avA && avA.corte ? dataBR(avA.corte) : "", avD && avD.corte ? dataBR(avD.corte) : "");
      }
      var chavesOutras = {};
      ["iaMotivos", "iaProv", "iaEdicao"].forEach(function (k) { chavesOutras[k] = 1; });
      Object.keys(chavesOutras).forEach(function (k) { if (canon(cA[k] || null) !== canon(cD[k] || null)) auto++; });
      if (canon(obj(sA).iaMotivos || null) !== canon(obj(sD).iaMotivos || null)) auto++;
      return { m: out, auto: auto, avanco: temAv, nomes: mp.nome };
    },

    /* A FOTO SEM A SOMBRA: o que uma PESSOA mudou. ⚠ É sobre ela que se
       calculam `ha`/`h` (as lacunas): com o hash da foto inteira, editar a
       planilha no modo executivo (o persistir regrava o vão das etapas com a
       marca "subetapas") ou salvar um plano que a projeção da 1A rematerializa
       acusaria "alteração sem registro" a cada vez — recado que mente.
       Sai: `mat`, `exec.anterior`, a duração com marca "subetapas", a duração
       com `mat.*[id]` intacta, a restrição com `origem:"mat"`, os mapas de
       rede legados (predecessoras/lags/tipos) de nó que tem entrada em `rede`
       (lá a rede digitada é a verdade), os textos e a origem da IA. */
    visivel: function (foto) {
      var f = foto;
      if (typeof f === "string") { try { f = JSON.parse(f); } catch (e) { f = null; } }
      if (!ehObj(f)) return null;
      var c = ehObj(f.c) ? JSON.parse(JSON.stringify(f.c)) : null, mat = c ? obj(c.mat) : {};
      if (c) {
        var ag = obj(c.duracoesAgente), du = obj(c.duracoes), sub = obj(c.sub), rede = obj(c.rede);
        var sag = obj(sub.agente), sdu = obj(sub.duracoes), k;
        for (k in ag) if (own(ag, k) && ag[k] === "subetapas") { delete ag[k]; delete du[k]; }
        [["etapas", du, obj(c.marcos), ag], ["folhas", sdu, obj(sub.marcos), sag]].forEach(function (t) {
          var mm = obj(mat[t[0]]), id;
          for (id in mm) if (own(mm, id) && ehObj(mm[id]) && !own(t[3], id)) {
            if (mm[id].s === "m" ? t[2][id] === true : t[1][id] === mm[id].s) { delete t[1][id]; delete t[2][id]; }
          }
        });
        var rs = obj(c.restricoes);
        for (k in rs) if (own(rs, k) && ehObj(rs[k]) && rs[k].origem === "mat") delete rs[k];
        var re = obj(rede.etapas), rf = obj(rede.folhas);
        for (k in re) if (own(re, k)) { delete obj(c.predecessoras)[k]; delete obj(c.lags)[k]; }
        for (k in rf) if (own(rf, k)) { delete obj(sub.predecessoras)[k]; delete obj(sub.lags)[k]; delete obj(sub.tipos)[k]; }
        if (ehObj(rede.etapas) || ehObj(rede.folhas) || ehObj(rede.datas)) {
          ["etapas", "folhas", "datas"].forEach(function (m) { var x = obj(rede[m]), id; for (id in x) if (own(x, id) && ehObj(x[id])) delete x[id].s; });
        }
        delete c.mat; delete c.iaMotivos; delete c.iaProv; delete c.iaEdicao;
        if (ehObj(c.exec)) delete c.exec.anterior;
        if (ehObj(c.sub)) { delete c.sub.iaMotivos; delete c.sub.iaProv; delete c.sub.agente; }
        delete c.duracoesAgente;
      }
      return { c: c, a: ehObj(f.a) ? f.a : null };
    },
    hashVisivel: function (foto) { return hash(canon(this.visivel(foto))); },

    /* o texto de UMA mudança (a coluna "O que mudou"), texto puro */
    textoMudanca: function (x, nomes, nHoje) {
      if (!ehObj(x)) return "";
      var c = str(x.c), rot = CAMPOS[c] || (c.indexOf("param:") === 0 ? "parâmetro " + c.slice(6) : (c.indexOf("exec:") === 0 ? "modo executivo (" + c.slice(5) + ")" : c));
      var nome = nomes && x.id && nomes[x.id] ? corta(nomes[x.id], 40) : "";
      var quem = (x.n ? x.n + (nHoje ? ", " + nHoje : "") + " " : "") + nome;
      if (c === "param:custo") return "custo da equipe alterado";
      if (c === "extra") return (quem ? quem.trim() + " — " : "") + "tarefa sem preço " + str(x.pa);
      var t = (quem.trim() ? quem.trim() + " — " : "") + rot;
      if (x.de !== "" || x.pa !== "") t += ": " + (x.de === "" ? "—" : x.de) + " → " + (x.pa === "" ? "—" : x.pa);
      if (c === "dur" || c === "extra:dur" || c === "cal:dur") t += " dias úteis";
      return t;
    },
    /* o resumo do evento quando o gravador não mandou o dele */
    resumir: function (m, nomes, x) {
      var l = arr(m);
      if (!l.length) return x ? x + " alteração(ões) do cronograma" : "Alteração do cronograma";
      var extra = l.length - 1 + (Number(x) || 0);
      /* ⚠ A MANCHETE É A MUDANÇA QUE A PESSOA FEZ, não a que o formulário
         materializou. Roteiro do defeito (e2e-crono-desfazer, 17/09/2026):
         o [Recalcular] com o paralelismo trocado grava junto o custo por
         equipe do formulário (que o plano não tinha) e reescreve os nomes
         dos feriados; a manchete saía "custo da equipe alterado (+2)", e o ↶
         prometia desfazer uma mudança de custo que ninguém fez. Ordem: linha
         do cronograma, parâmetro com valor visível, detalhe, custo. */
      var peso = function (y) {
        if (str(y.id)) return 0;
        if (y.c === "param:custo") return 3;
        if (str(y.pa).slice(-DETALHE.length) === DETALHE) return 2;
        return 1;
      };
      var melhor = l[0];
      l.forEach(function (y) { if (peso(y) < peso(melhor)) melhor = y; });
      return this.textoMudanca(melhor, nomes) + (extra > 0 ? " (+" + extra + ")" : "");
    },

    /* O EVENTO, ≤ 700 B. ctx = {id, t, obraId, orcId, agora, por, pid, o,
       r, m, x, pz, ha, h, ver}. ⚠ O corte: primeiro as mudanças de `m` que
       não cabem vão para a contagem `x`; depois o texto `r`; depois o nome.
       Nunca recusa: o histórico falha antes do cronograma e nunca o barra. */
    evento: function (ctx) {
      ctx = ctx || {};
      var ev = { id: str(ctx.id) || this.novoId(ctx.agora), fmt: FMT, t: ctx.t === "p" ? "p" : "o" };
      if (ev.t === "p") ev.obraId = str(ctx.obraId);
      if (ctx.orcId != null && str(ctx.orcId)) ev.orcId = str(ctx.orcId);
      ev.atualizadoEm = str(ctx.agora);
      ev.por = corta(ctx.por, 60);
      ev.pid = corta(ctx.pid || "admin", 40);
      ev.o = str(ctx.o || "tela");
      ev.r = corta(ctx.r || "", 160);
      var abrev = ABREV[ev.o] || "o";
      ev.m = arr(ctx.m).map(function (x) {
        var y = { id: corta(x.id, 40), n: corta(x.n, 12), c: corta(x.c, 30), de: corta(x.de, 60), pa: corta(x.pa, 60) };
        y.o = str(x.o || abrev);
        return y;
      });
      ev.x = Math.max(0, Number(ctx.x) || 0);
      if (ehLista(ctx.pz) && ctx.pz.length === 3) ev.pz = [ctx.pz[0] == null ? null : Number(ctx.pz[0]), ctx.pz[1] == null ? null : Number(ctx.pz[1]), ctx.pz[2] == null ? null : str(ctx.pz[2])];
      else ev.pz = [null, null, null];
      ev.ha = str(ctx.ha);
      ev.h = str(ctx.h);
      ev.ver = str(ctx.ver);
      var guarda = 0;
      while (this.bytes(ev) > TETO_EVENTO && ev.m.length && guarda++ < 50) { ev.m.pop(); ev.x++; }
      var tetoR = ev.r.length;
      while (this.bytes(ev) > TETO_EVENTO && tetoR > 20 && guarda++ < 400) { tetoR -= 10; ev.r = corta(ev.r, tetoR); }
      if (this.bytes(ev) > TETO_EVENTO) ev.por = corta(ev.por, 24);
      if (this.bytes(ev) > TETO_EVENTO) ev.r = corta(ev.r, 12);
      return ev;
    },

    /* A SESSÃO: a mesma pessoa, no mesmo alvo, com menos de 10 minutos desde
       a última gravação e SEM lacuna entre as duas (o `ha` do novo é o `h`
       da sessão) vira UMA linha. Devolve o evento da sessão (mesmo id), ou
       null quando não junta. */
    juntar: function (sessao, novo, ctx) {
      if (!this.valido(sessao) || !this.valido(novo)) return null;
      if (this.alvoDe(sessao) !== this.alvoDe(novo)) return null;
      if (str(sessao.pid) !== str(novo.pid) || str(sessao.por) !== str(novo.por)) return null;
      if (str(sessao.h) !== str(novo.ha)) return null;
      var tS = new Date(sessao.atualizadoEm).getTime(), tN = new Date(novo.atualizadoEm).getTime();
      if (!(tN >= tS) || tN - tS >= SESSAO_MS) return null;
      /* as mudanças do mesmo nó e campo viram uma só (o "de" da primeira e o
         "para" da última); a que voltou ao valor de antes some */
      var m = [], idx = {};
      arr(sessao.m).concat(arr(novo.m)).forEach(function (x) {
        var k = str(x.id) + "|" + str(x.c);
        if (own(idx, k)) { m[idx[k]].pa = x.pa; m[idx[k]].n = x.n || m[idx[k]].n; return; }
        idx[k] = m.length; m.push({ id: x.id, n: x.n, c: x.c, de: x.de, pa: x.pa, o: x.o });
      });
      m = m.filter(function (x) { return x.c === "extra" || x.c === "param:custo" || x.de !== x.pa; });
      var xTot = (Number(sessao.x) || 0) + (Number(novo.x) || 0);
      var nomes = (ctx && ctx.nomes) || null;
      var pz0 = ehLista(sessao.pz) ? sessao.pz[0] : null, pzN = ehLista(novo.pz) ? novo.pz : [null, null, null];
      return this.evento({ id: sessao.id, t: sessao.t, obraId: sessao.obraId, orcId: sessao.orcId || novo.orcId, agora: novo.atualizadoEm,
        por: sessao.por, pid: sessao.pid, o: sessao.o === novo.o ? sessao.o : sessao.o, r: (ctx && ctx.r) || this.resumir(m, nomes, xTot),
        m: m, x: xTot, pz: [pz0, pzN[1], pzN[2]], ha: sessao.ha, h: novo.h, ver: novo.ver });
    },

    /* A PODA DETERMINÍSTICA: do mais novo para o mais velho (id DESC), fica
       o evento que cabe no alvo (60) e na empresa (800). Eventos tortos saem.
       Devolve a lista em id DESC, sem campos fora do formato. */
    podar: function (lista, opts) {
      opts = opts || {};
      var porAlvo = Number(opts.porAlvo) > 0 ? Number(opts.porAlvo) : POR_ALVO, total = Number(opts.total) > 0 ? Number(opts.total) : TOTAL;
      var self = this, porId = {};
      arr(lista).forEach(function (ev) {
        if (!self.valido(ev)) return;
        var cur = porId[ev.id];
        porId[ev.id] = cur ? self.vencedor(cur, ev) : ev;
      });
      var ids = Object.keys(porId).sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); });
      var cont = {}, n = 0, out = [];
      for (var i = 0; i < ids.length; i++) {
        var ev = porId[ids[i]], al = self.alvoDe(ev);
        if (n >= total) break;
        if ((cont[al] || 0) >= porAlvo) continue;
        cont[al] = (cont[al] || 0) + 1; n++;
        out.push(self.limpo(ev));
      }
      return out;
    },
    /* só os campos do formato (o funil do Store acrescenta `criadoEm`) */
    limpo: function (ev) {
      var o = {}, CAMPOS_EV = ["id", "fmt", "t", "obraId", "orcId", "atualizadoEm", "por", "pid", "o", "r", "m", "x", "pz", "ha", "h", "ver"];
      CAMPOS_EV.forEach(function (k) { if (own(ev, k)) o[k] = ev[k]; });
      return o;
    },
    /* id igual: o mais novo; empate de carimbo → o maior texto canônico
       (determinístico nos dois aparelhos, sem cópia do perdedor) */
    vencedor: function (a, b) {
      var ta = str(a && a.atualizadoEm), tb = str(b && b.atualizadoEm);
      if (ta !== tb) return ta > tb ? a : b;
      return canon(a) >= canon(b) ? a : b;
    },

    /* AS LACUNAS de um alvo: entre dois eventos seguidos cujo `ha` não é o
       `h` do anterior, e depois do último quando o hash do disco não é o
       dele. `eventos` em qualquer ordem. Devolve [{depoisDe: id|null,
       antesDe: id|null, de: iso, ate: iso|null}]. */
    lacunas: function (eventos, hashAtual) {
      var self = this, l = arr(eventos).filter(function (e) { return self.valido(e); })
        .sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
      var out = [];
      for (var i = 1; i < l.length; i++) {
        if (str(l[i].ha) && str(l[i - 1].h) && str(l[i].ha) !== str(l[i - 1].h)) {
          out.push({ depoisDe: l[i - 1].id, antesDe: l[i].id, de: l[i - 1].atualizadoEm, ate: this.criadoDe(l[i].id) || l[i].atualizadoEm });
        }
      }
      if (l.length && hashAtual != null && str(hashAtual) && str(l[l.length - 1].h) !== str(hashAtual)) {
        out.push({ depoisDe: l[l.length - 1].id, antesDe: null, de: l[l.length - 1].atualizadoEm, ate: null });
      }
      return out;
    },

    /* O MERGE DA NUVEM (O19): o js/nuvem.js consulta `global.CronoAlt.
       mergeNuvem` A CADA CHAMADA, por uma tabela fixa dentro dele — este
       módulo nunca registra nada no Nuvem (ele carrega 200 linhas antes e
       termina com um objeto novo). `vencedor` decide id igual (sem cópia do
       perdedor, sem contar conflito); `depois` descarta o evento de
       orçamento com lápide e termina com a poda. */
    mergeNuvem: {
      vencedor: function (a, b) { return CronoAlt.vencedor(a, b); },
      depois: function (lista, empresaId) {
        var lap = {}, S = (typeof global !== "undefined" && global) ? global.Store : null;
        try { if (S && typeof S.lapidesDe === "function" && empresaId) lap = S.lapidesDe(empresaId, "orcamentos") || {}; } catch (e) { lap = {}; }
        var l = arr(lista).filter(function (ev) { return !(ehObj(ev) && ev.t === "o" && own(lap, str(ev.orcId))); });
        return CronoAlt.podar(l);
      }
    },

    /* os eventos de UM alvo, do mais novo para o mais velho */
    doAlvo: function (lista, alvo) {
      var self = this;
      return arr(lista).filter(function (e) { return self.valido(e) && self.alvoDe(e) === alvo; })
        .sort(function (a, b) { return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0); });
    },

    /* o nº de HOJE de uma tarefa sem preço, pelo id (a forma T21 de
       r.extras): {n: "T2"} | {excluida: true} | null (não é tarefa sem preço
       ou não há como saber) */
    numeroHoje: function (r, id) {
      var l = arr(r && r.extras);
      if (!/^x_/.test(str(id))) return null;
      for (var i = 0; i < l.length; i++) if (l[i] && str(l[i].id) === str(id)) return { n: l[i].numero != null ? str(l[i].numero) : "T" + (i + 1) };
      return r && ehLista(r.extras) ? { excluida: true } : null;
    },

    _dep: dep,
    _bytesUtf8: bytesUtf8
  };

  global.CronoAlt = CronoAlt;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoAlt;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
