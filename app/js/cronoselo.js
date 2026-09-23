/* =====================================================================
 * cronoselo.js — CronoSelo: o SELO da linha de base (entidade `crono_selo`):
 * formato colunar, contratual determinística, eventos de aprovação, a porta
 * do espaço, o encerramento de obra concluída e o merge da nuvem
 * (`mergeNuvem`, que o js/nuvem.js consulta NA HORA).
 *
 * Planejador, fatia 1B (bases). Espec: ESPEC-planejador.md (rev. 4), §1.5,
 * §1.10, §3.3 (1B), D15, D16, D20; desenho BASES §b2, §c1, §d.
 *
 * O QUE É O SELO
 *   A cópia SELADA e imutável de cada versão da linha de base. O cabeçalho
 *   continua em `crono_obra` no formato da 1.2.81 (é o que ela lê); o selo
 *   mora numa entidade que a 1.2.81 não conhece (não baixa, não sobe, não
 *   resume, não arquiva) e guarda as etapas, as folhas com nome, o caminho
 *   crítico, a curva e — quando cabe — o detalhe POR SERVIÇO. É dele que a
 *   versão nova lê a base que um aparelho antigo resumiu ou arquivou para
 *   caber na nuvem (`completar`), e é nele que moram a verdade de
 *   `contratual` e da aprovação.
 *
 * ⚠ AS REGRAS QUE NÃO CEDEM
 *  1) IMUTÁVEL. Selo e evento nunca se regravam. As duas exceções, ambas com
 *     `atualizadoEm = agora`: a redução pela porta do espaço (`serv: null`) e
 *     a porta "Encerrar planejamento de obra concluída" (D16).
 *  2) `atualizadoEm` DETERMINÍSTICO: o segundo de `criadaEm` mais o
 *     milissegundo de QUALIDADE — .900 congelamento com serviço, .500 selo
 *     tardio completo, .100 tardio só com etapas, .050 congelamento sem
 *     serviço por falta de espaço. ⚠ Roteiro do defeito que isso impede: N1
 *     sela completo; um aparelho 1.2.81 resume o cabeçalho; N2, que ainda não
 *     recebeu o selo de N1, sela tardio só com etapas, com o MESMO id. Com o
 *     mesmo carimbo, o merge dá "mesma versão" e cada aparelho fica com o seu
 *     para sempre — N2 com o pobre, sem erro. Com a qualidade no
 *     milissegundo, o de maior qualidade vence em todos.
 *  3) NENHUMA LISTA DENTRO DE LISTA (espec O18). A entidade sobe como
 *     `{v: lista}`, e o Firestore recusa lista aninhada — e o push de antes
 *     da T16 dizia "Sincronizado" sem ter subido nada. Por isso a `curva` é
 *     COLUNAR (texto), como `nos` e `serv`. Todo gravador passa pela régua
 *     única `Util.semListaAninhada` antes de devolver o que gravar.
 *  4) NUNCA casar por nome: nó e serviço se ligam só por id.
 *  5) Nada do APARELHO entra no selo tardio (nem agora, nem usuário, nem
 *     Math.random): dois aparelhos que selam a mesma base antiga produzem o
 *     MESMO registro, e o merge não conta conflito.
 *
 * Motor PURO: não lê nem grava o Store, não toca em DOM. Quem grava é o App
 * (`Store.salvarVarios(eid, "crono_selo", r.gravar, true)` — `manterCarimbo`,
 * senão o carimbo determinístico some).
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
  function Ut() { return dep("Util", "./util.js"); }

  var ENTIDADE = "crono_selo";
  /* ⚠ TETOS (espec §1.5, medidos na M0): 300 KB por selo — acima disso o
     selo sai sem `serv`, com o motivo; 900 KB na entidade, o mesmo aviso do
     `push` da nuvem antes do 1 MiB do Firestore. 2.000 serviços = 90,9 KB
     cheio e 19,1 KB sem `serv`: cabem 9 selos cheios ou 47 sem `serv`. */
  var TETO_SELO = 300 * 1024;
  var TETO_ENTIDADE = 900 * 1024;
  var Q = { congelamento: 900, tardioCompleto: 500, tardioEtapas: 100, semEspaco: 50 };
  var SEP = "|";
  var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var ACOES = { "aprovar": 1, "anular-aprovacao": 1, "marcar-contratual": 1, "trocar-contratual": 1 };

  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function ehObj(v) { return !!v && typeof v === "object" && !ehLista(v); }
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return v == null ? "" : String(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function cmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function kb(b) { return String(Math.round(b / 102.4) / 10).replace(".", ","); }
  function pad(n, k) { var s = String(n); while (s.length < k) s = "0" + s; return s; }
  function br(iso) { var s = str(iso); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : s; }
  function falha(msg, extra) {
    var r = { ok: false, erro: msg }, k;
    for (k in (extra || {})) if (own(extra, k)) r[k] = extra[k];
    return r;
  }
  /* bytes UTF-8 na régua ÚNICA do planejamento (CronoPlan.bytes). ⚠ Sem ela
     não há conta honesta: devolve null, e quem mede recusa. */
  function bytes(x) { var P = Pl(); return P ? P.bytes(x === undefined ? null : x) : null; }
  function iso(agora) {
    var d = agora == null ? new Date() : (typeof agora === "number" || typeof agora === "string" ? new Date(agora) : agora);
    return (d && typeof d.getTime === "function" && !isNaN(d.getTime())) ? d.toISOString() : new Date().toISOString();
  }
  function isoValido(s) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str(s)); }
  function dataValida(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s));
    if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  }

  /* ⚠ O CARIMBO DETERMINÍSTICO: dois aparelhos → a mesma string. `q` é a
     qualidade (Q). `criadaEm` inválido → null (sem carimbo não há selo). */
  function carimbo(criadaEm, q) {
    if (!isoValido(criadaEm)) return null;
    return str(criadaEm).slice(0, 19) + "." + pad(Math.max(0, Math.min(999, Math.round(Number(q) || 0))), 3) + "Z";
  }
  function qualidade(selo) {
    var m = /\.(\d{3})Z$/.exec(str(selo && selo.atualizadoEm));
    return m ? Number(m[1]) : 0;
  }

  /* ---- colunas de texto (O18) ----
     ⚠ O SEPARADOR SE ESCAPA: nome de etapa pode ter "|" (e "\"). Sem o
     escape, "Pintura | fachada" viraria duas colunas, a contagem não
     fecharia e o selo inteiro seria ilegível. */
  function esc(s) { return str(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\p"); }
  function juntar(l) { var o = [], i; for (i = 0; i < l.length; i++) o.push(esc(l[i])); return o.join(SEP); }
  function partir(s) {
    s = str(s);
    var out = [], cur = "", i, c;
    if (s === "") return [];
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      if (c === "\\" && i + 1 < s.length) {
        var n = s.charAt(i + 1);
        cur += n === "p" ? "|" : n;
        i++;
      } else if (c === SEP) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  /* uma coluna de UM elemento vazio ("") é indistinguível de nenhum: quem lê
     confere pelo tamanho de `ids`, que nunca tem id vazio */
  function partirN(s, n) { var l = partir(s); if (n === 1 && l.length === 0) l = [""]; return l; }
  function nums36(l) { var o = [], i; for (i = 0; i < l.length; i++) o.push(Math.round(l[i]).toString(36)); return o.join(","); }
  function numsDec(l) { var o = [], i; for (i = 0; i < l.length; i++) o.push(String(l[i])); return o.join(","); }
  function lerNums(s, base) {
    s = str(s);
    if (s === "") return [];
    var p = s.split(","), o = [], i, v;
    for (i = 0; i < p.length; i++) {
      v = base === 36 ? parseInt(p[i], 36) : Number(p[i]);
      if (p[i] === "" || !isFinite(v)) return null;
      o.push(v);
    }
    return o;
  }
  function centavos(v) { var x = Number(v); return isFinite(x) ? Math.round(x * 100) : 0; }

  /* JSON CANÔNICO (chaves em ordem) — a base do código de conferência. Uma
     ordem de chave diferente entre aparelhos não pode mudar o código. */
  function canon(v) {
    if (v === undefined) return "null";
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (ehLista(v)) { var a = [], i; for (i = 0; i < v.length; i++) a.push(canon(v[i])); return "[" + a.join(",") + "]"; }
    var ks = Object.keys(v).sort(), o = [], j;
    for (j = 0; j < ks.length; j++) if (v[ks[j]] !== undefined) o.push(JSON.stringify(ks[j]) + ":" + canon(v[ks[j]]));
    return "{" + o.join(",") + "}";
  }
  function sha(s) { var U = Ut(); return (U && typeof U.sha256hex === "function") ? U.sha256hex(s) : null; }
  function semAninhada(x) { var U = Ut(); return (U && typeof U.semListaAninhada === "function") ? U.semListaAninhada(x) : null; }

  /* os campos do cabeçalho que o código de conferência cobre */
  var CAB = ["id", "tipo", "fmt", "origem", "obraId", "baseId", "versao", "orcamentoId", "orcNumero", "motivo", "por", "criadaEm",
    "cal", "totalDias", "dataFim", "valor", "opcionaisIncluidos", "opcionaisFora", "extras"];
  function hashDe(selo) {
    var c = {}, i;
    for (i = 0; i < CAB.length; i++) if (own(selo, CAB[i])) c[CAB[i]] = selo[CAB[i]];
    return sha(canon({ cab: c, nos: selo.nos, curva: selo.curva }));
  }

  /* ================================================================
     FORMA COLUNAR — `nos`, `curva`, `serv`
     ================================================================ */
  function nosColunas(nos, criticos) {
    var ids = [], t = "", e = [], n = [], nm = [], i0 = [], d = [], v = [], c = "", pos = {}, k, x;
    for (k = 0; k < nos.length; k++) pos[str(nos[k].id)] = k;
    for (k = 0; k < nos.length; k++) {
      x = nos[k];
      ids.push(str(x.id));
      t += x.t === "e" ? "e" : "f";
      e.push(own(pos, str(x.e)) ? pos[str(x.e)] : k);
      n.push(str(x.n)); nm.push(str(x.nm));
      i0.push(Number(x.i) || 0); d.push((Number(x.f) || 0) - (Number(x.i) || 0));
      v.push(centavos(x.v));
      c += (criticos && criticos[str(x.id)]) ? "1" : "0";
    }
    return { ids: juntar(ids), t: t, e: nums36(e), n: juntar(n), nm: juntar(nm), i: nums36(i0), d: nums36(d), v: numsDec(v), c: c };
  }
  function curvaColunas(curva) {
    var k = [], v = [], p = [], i, x;
    for (i = 0; i < curva.length; i++) {
      x = curva[i] || {};
      k.push(str(x.chave)); v.push(centavos(x.valor)); p.push(Math.round((Number(x.acumPct) || 0) * 100));
    }
    return { k: juntar(k), v: numsDec(v), p: numsDec(p) };
  }
  function prefixoComum(l) {
    if (!l.length) return "";
    var p = l[0], i;
    for (i = 1; i < l.length && p; i++) while (l[i].indexOf(p) !== 0) p = p.slice(0, -1);
    return p.slice(0, 12);
  }

  /* ---- leitura ---- */
  function lerNos(nos) {
    if (!ehObj(nos)) return { erro: "sem as etapas" };
    var ids = partir(nos.ids), N = ids.length;
    if (!N) return { erro: "sem nenhum nó" };
    var t = str(nos.t), e = lerNums(nos.e, 36), n = partirN(nos.n, N), nm = partirN(nos.nm, N);
    var ii = lerNums(nos.i, 36), dd = lerNums(nos.d, 36), vv = lerNums(nos.v, 10), c = str(nos.c);
    /* ⚠ COLUNAS DE TAMANHOS DIFERENTES = ILEGÍVEL, nunca meia leitura calada
       (casar o nome da etapa 7 com a janela da etapa 8 é pior que não mostrar) */
    if (t.length !== N || !e || e.length !== N || n.length !== N || nm.length !== N || !ii || ii.length !== N ||
      !dd || dd.length !== N || !vv || vv.length !== N || (c !== "" && c.length !== N)) {
      return { erro: "as colunas das etapas têm tamanhos diferentes (" + N + " ids)" };
    }
    var out = [], k;
    for (k = 0; k < N; k++) {
      if (e[k] < 0 || e[k] >= N) return { erro: "a coluna de etapa aponta para fora da lista" };
      out.push({ id: ids[k], t: t.charAt(k) === "e" ? "e" : "f", e: ids[e[k]], n: n[k], nm: nm[k], i: ii[k], f: ii[k] + dd[k], v: vv[k] / 100, c: c.charAt(k) === "1" });
    }
    return { nos: out };
  }
  function lerCurva(curva) {
    var out = [], i;
    if (curva == null) return { curva: [] };
    /* ⚠ `curva` em lista de listas é a forma que NUNCA subiu (desenho da
       revisão 1): lida para não perder o que um teste antigo gravou, e
       `novoSelo` recusa gravá-la */
    if (ehLista(curva)) {
      for (i = 0; i < curva.length; i++) {
        var x = curva[i];
        if (!ehLista(x) || x.length < 3) return { erro: "curva em forma desconhecida" };
        out.push(mesDe(str(x[0]), Number(x[1]) / 100, Number(x[2]) / 100));
        if (!out[out.length - 1]) return { erro: "mês da curva inválido" };
      }
      return { curva: out };
    }
    if (!ehObj(curva)) return { erro: "curva em forma desconhecida" };
    var k = partir(curva.k), v = lerNums(curva.v, 10), p = lerNums(curva.p, 10);
    if (!v || !p || v.length !== k.length || p.length !== k.length) return { erro: "as colunas da curva têm tamanhos diferentes" };
    for (i = 0; i < k.length; i++) {
      var m = mesDe(k[i], v[i] / 100, p[i] / 100);
      if (!m) return { erro: "mês da curva inválido (" + k[i] + ")" };
      out.push(m);
    }
    return { curva: out };
  }
  /* o mês da curva no formato de `Cronograma.periodos().lista`, que é o que
     o confronto e a curva S leem — com o MESMO rótulo que o motor escreve */
  function mesDe(chave, valor, acum) {
    var m = /^(\d{4})-(\d{2})$/.exec(chave);
    if (!m || !isFinite(valor) || !isFinite(acum)) return null;
    var mes = +m[2] - 1;
    if (mes < 0 || mes > 11) return null;
    return { ano: +m[1], mes: mes, rotulo: MES[mes] + "/" + m[1].slice(2), chave: chave, valor: valor, acumPct: acum };
  }
  function lerServ(serv, nos) {
    if (serv == null) return { serv: null };
    if (!ehObj(serv)) return { erro: "detalhe por serviço em forma desconhecida" };
    var ids = partir(serv.ids), N = ids.length, pre = str(serv.pre);
    var p = lerNums(serv.p, 36), ii = lerNums(serv.i, 36), dd = lerNums(serv.d, 36), vv = lerNums(serv.v, 10), qq = lerNums(serv.q, 10);
    var u = partirN(serv.u, N);
    if (!p || !ii || !dd || !vv || !qq || p.length !== N || ii.length !== N || dd.length !== N || vv.length !== N || qq.length !== N || u.length !== N) {
      return { erro: "as colunas dos serviços têm tamanhos diferentes (" + N + " ids)" };
    }
    var out = [], k;
    for (k = 0; k < N; k++) {
      var f = nos[p[k]];
      if (!f) return { erro: "um serviço aponta para uma subetapa que o selo não tem" };
      var ini = f.i + ii[k];
      out.push({ id: pre + ids[k], folha: f.id, etapa: f.e, i: ini, f: ini + dd[k], v: vv[k] / 100, q: qq[k], u: u[k] });
    }
    return { serv: out };
  }

  /* ================================================================
     OS ESTADOS (contratual, aprovação) — lidos dos selos e dos eventos
     ================================================================ */
  function selosDa(listaSelo, obraId) {
    var o = str(obraId), out = [], i;
    if (!ehLista(listaSelo)) return out;
    for (i = 0; i < listaSelo.length; i++) { var x = listaSelo[i]; if (ehObj(x) && x.tipo === "selo" && str(x.obraId) === o) out.push(x); }
    return out;
  }
  function eventosDa(listaSelo, obraId) {
    var o = str(obraId), out = [], i;
    if (!ehLista(listaSelo)) return out;
    for (i = 0; i < listaSelo.length; i++) {
      var x = listaSelo[i];
      if (ehObj(x) && x.tipo === "evento" && own(ACOES, x.acao) && (obraId == null || str(x.obraId) === o)) out.push(x);
    }
    /* ⚠ ORDEM DETERMINÍSTICA: criadoEm, depois id — dois aparelhos aplicam os
       eventos na mesma ordem e chegam à mesma contratual */
    out.sort(function (a, b) { return cmp(str(a.criadoEm), str(b.criadoEm)) || cmp(str(a.id), str(b.id)); });
    return out;
  }
  function seloDe(listaSelo, baseId) {
    var i, id = "selo_" + str(baseId);
    if (!ehLista(listaSelo)) return null;
    for (i = 0; i < listaSelo.length; i++) { var x = listaSelo[i]; if (ehObj(x) && x.tipo === "selo" && (x.id === id || str(x.baseId) === str(baseId))) return x; }
    return null;
  }
  /* os dados de ordem de uma versão: do selo (a verdade) ou do cabeçalho */
  function infoBase(listaCrono, listaSelo, baseId) {
    var s = seloDe(listaSelo, baseId), i;
    if (s) return { baseId: str(baseId), versao: Number(s.versao), criadaEm: str(s.criadaEm), obraId: str(s.obraId), selo: s };
    if (ehLista(listaCrono)) for (i = 0; i < listaCrono.length; i++) {
      var b = listaCrono[i];
      if (ehObj(b) && b.tipo === "base" && str(b.id) === str(baseId)) return { baseId: str(baseId), versao: Number(b.versao), criadaEm: str(b.criadaEm), obraId: str(b.obraId), base: b };
    }
    return null;
  }

  /* {obraId: baseId da ativa} de todas as obras da lista CRUA, pela régua do
     CronoBase (maior versão; empate por data e id). Sem o CronoBase: {} —
     e aí `novoSelo` protege só o que o chamador disse. */
  function ativasDe(listaCrono) {
    var CB = dep("CronoBase", "./cronobase.js"), out = {}, vistos = {}, i;
    if (!CB || !ehLista(listaCrono)) return out;
    for (i = 0; i < listaCrono.length; i++) {
      var b = listaCrono[i], ob = ehObj(b) && b.tipo === "base" ? str(b.obraId) : "";
      if (!ob || own(vistos, ob)) continue;
      vistos[ob] = 1;
      var a = CB.ativa(listaCrono, ob);
      if (a) out[ob] = str(a.id);
    }
    return out;
  }

  /* ⚠ A CONTRATUAL É DETERMINÍSTICA (crítica 1, achado 12). Dois aparelhos
     que congelaram a v1 ao mesmo tempo marcam DUAS contratuais ("gêmeas");
     sem desempate, cada aparelho mostraria uma no pleito. A regra:
       1. as MARCAS, na ordem do tempo (depois o id): o selo com
          `contratual: true` e o cabeçalho marcado (uma v1 congelada pela
          versão nova antes de o selo chegar) acrescentam; `marcar-contratual`
          só vale sem contratual; `trocar-contratual` deixa SÓ a `para`;
       2. das que sobram, vale a de MENOR versão, depois a mais antiga,
          depois o menor id (o desempate de `CronoBase.bases`, D15).
     O perdedor aparece como "(gêmea — não vale como contratual)".
     ⚠ POR QUE A TROCA ZERA TUDO, E NÃO SÓ A `de`. Roteiro: as gêmeas v1a e
     v1b; o administrador vê a v1a (a que vale) e a troca pela v2. Tirando
     só a `de`, sobrariam v1b e v2 — e o desempate por versão devolveria a
     v1b, a gêmea que ele nem via: a troca "não pegava", calada. Pela ordem
     do tempo, uma marca POSTERIOR à troca (outro aparelho, fora da tela que
     só oferece a caixa sem contratual) ainda entra — e todo aparelho aplica
     a mesma sequência. */
  function contratual(listaCrono, listaSelo, obraId) {
    var o = str(obraId), C = {}, i, marcas = [];
    selosDa(listaSelo, o).forEach(function (s) { if (s.contratual === true) marcas.push({ t: str(s.criadaEm), id: str(s.id), tipo: "marca", base: str(s.baseId) }); });
    if (ehLista(listaCrono)) for (i = 0; i < listaCrono.length; i++) {
      var b = listaCrono[i];
      if (ehObj(b) && b.tipo === "base" && str(b.obraId) === o && b.contratual === true) marcas.push({ t: str(b.criadaEm), id: "selo_" + str(b.id), tipo: "marca", base: str(b.id) });
    }
    eventosDa(listaSelo, o).forEach(function (ev) {
      if (ev.acao === "marcar-contratual" || ev.acao === "trocar-contratual") marcas.push({ t: str(ev.criadoEm), id: str(ev.id), tipo: ev.acao, ev: ev });
    });
    marcas.sort(function (a, b) { return cmp(a.t, b.t) || cmp(a.id, b.id); });
    var trocas = [];
    marcas.forEach(function (m) {
      if (m.tipo === "marca") { if (m.base) C[m.base] = true; return; }
      var ev = m.ev;
      if (m.tipo === "marcar-contratual") {
        if (!Object.keys(C).length && str(ev.baseId)) C[str(ev.baseId)] = true;
        return;
      }
      if (!str(ev.para)) return;
      var saiu = Object.keys(C);
      C = {}; C[str(ev.para)] = true;
      trocas.push({ id: ev.id, de: str(ev.de), para: str(ev.para), motivo: str(ev.motivo), por: str(ev.registradoPor), em: str(ev.registradoEm || ev.criadoEm), sairam: saiu });
    });
    var cand = [];
    Object.keys(C).forEach(function (id) { var inf = infoBase(listaCrono, listaSelo, id); if (inf && inf.obraId === o) cand.push(inf); });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return ((a.versao || 0) - (b.versao || 0)) || cmp(a.criadaEm, b.criadaEm) || cmp(a.baseId, b.baseId); });
    var v = cand[0];
    return { baseId: v.baseId, versao: v.versao, criadaEm: v.criadaEm, selo: v.selo || null,
      gemeas: cand.slice(1).map(function (x) { return x.baseId; }), trocas: trocas };
  }

  /* {baseId: true} das contratuais de TODAS as obras — a que vale E as
     gêmeas dela (uma gêmea também é a promessa do contrato; resumi-la
     porque "não vale" apagaria a única cópia se a troca a devolver). É o
     que a porta do espaço do `crono_obra` consulta (CronoBase.abrirEspaco). */
  function contratuaisDe(listaCrono, listaSelo) {
    var obras = {}, out = {}, i;
    function marca(ob) { if (ob) obras[ob] = 1; }
    if (ehLista(listaCrono)) for (i = 0; i < listaCrono.length; i++) { var b = listaCrono[i]; if (ehObj(b) && b.tipo === "base") marca(str(b.obraId)); }
    if (ehLista(listaSelo)) for (i = 0; i < listaSelo.length; i++) { var s = listaSelo[i]; if (ehObj(s)) marca(str(s.obraId)); }
    Object.keys(obras).forEach(function (ob) {
      var c = contratual(listaCrono, listaSelo, ob);
      if (!c) return;
      out[c.baseId] = true;
      c.gemeas.forEach(function (g) { out[g] = true; });
    });
    return out;
  }
  /* {obraId: encerradoEm} das obras cujo planejamento foi ENCERRADO pela
     porta D16 (algum selo dela tem `encerradoEm`): o pacote de conferência
     foi exportado, e a porta do espaço do `crono_obra` pode então resumir as
     versões antigas dela, a contratual inclusive (o detalhe das subetapas
     continua no selo). */
  function encerradasDe(listaSelo) {
    var out = {}, i;
    if (!ehLista(listaSelo)) return out;
    for (i = 0; i < listaSelo.length; i++) {
      var s = listaSelo[i];
      if (ehObj(s) && s.tipo === "selo" && str(s.encerradoEm) && str(s.obraId)) {
        var ob = str(s.obraId);
        if (!own(out, ob) || str(s.encerradoEm) > out[ob]) out[ob] = str(s.encerradoEm);
      }
    }
    return out;
  }
  /* o selo desta base está legível e guarda as subetapas? ("com folhas") —
     só assim o cabeçalho pode ser resumido: o detalhe continua no selo */
  function guardaFolhas(listaSelo, baseId) {
    var s = seloDe(listaSelo, baseId);
    if (!s) return false;
    var ab = abrir(s);
    return !ab.erro && ab.temFolhas;
  }
  function guardaEtapas(listaSelo, baseId) {
    var s = seloDe(listaSelo, baseId);
    if (!s) return false;
    var ab = abrir(s);
    return !ab.erro && ab.nos.length > 0;
  }

  /* a aprovação de uma versão: a do congelamento (no selo, id = o do selo) e
     os eventos `aprovar`; um `anular-aprovacao` mata a que ele nomeia.
     ⚠ `cab` (opcional) = o CABEÇALHO da base. Sem o selo neste aparelho (ele
     ainda não chegou pela nuvem, ou o módulo não selou e o selo tardio sai na
     próxima abertura), a aprovação do congelamento só existe na CÓPIA do
     cabeçalho. Roteiro do defeito (e2e linhas-de-base, controle negativo do
     selo): a v2 aprovada pelo contratante aparecia "INTERNA (sem aprovação)"
     — recado que mente. A cópia vale só para MOSTRAR (origem "cabecalho");
     anular exige o selo (quem grava chama sem `cab`), e o selo, quando
     existe, é sempre a fonte. */
  function aprovacoes(listaSelo, baseId, cab) {
    var s = seloDe(listaSelo, baseId), vivas = [], anuladas = [], mortos = {}, evs = [], i;
    var doCab = !s && ehObj(cab) && str(cab.id) === str(baseId);
    var obra = s ? s.obraId : (doCab ? cab.obraId : null);
    var todos = obra == null ? [] : eventosDa(listaSelo, obra);
    for (i = 0; i < todos.length; i++) if (str(todos[i].baseId) === str(baseId)) evs.push(todos[i]);
    evs.forEach(function (ev) { if (ev.acao === "anular-aprovacao" && str(ev.anula)) mortos[str(ev.anula)] = ev; });
    if (doCab && ehObj(cab.aprovacao) && cab.aprovacao.tipo === "contratante") {
      var ac = { id: "selo_" + str(baseId), origem: "cabecalho", aprovacao: cab.aprovacao, em: str(cab.aprovacao.em), registradoPor: str(cab.por), registradoEm: str(cab.criadaEm) };
      if (own(mortos, ac.id)) { ac.anulada = mortos[ac.id]; anuladas.push(ac); } else vivas.push(ac);
    }
    if (s && ehObj(s.aprovacao) && s.aprovacao.tipo === "contratante") {
      var a0 = { id: s.id, origem: "congelamento", aprovacao: s.aprovacao, em: str(s.aprovacao.em), registradoPor: str(s.por), registradoEm: str(s.criadaEm) };
      if (own(mortos, s.id)) { a0.anulada = mortos[s.id]; anuladas.push(a0); } else vivas.push(a0);
    }
    evs.forEach(function (ev) {
      if (ev.acao !== "aprovar" || !ehObj(ev.aprovacao)) return;
      var a = { id: ev.id, origem: "evento", aprovacao: ev.aprovacao, em: str(ev.aprovacao.em), registradoPor: str(ev.registradoPor), registradoEm: str(ev.registradoEm || ev.criadoEm) };
      if (own(mortos, ev.id)) { a.anulada = mortos[ev.id]; anuladas.push(a); } else vivas.push(a);
    });
    vivas.sort(function (a, b) { return cmp(a.registradoEm, b.registradoEm) || cmp(a.id, b.id); });
    return { vivas: vivas, anuladas: anuladas, eventos: evs };
  }
  /* "contratual" | "aprovada" | "interna" | "anulada" (+ a última aprovação
     viva e o registro da anulação). `opts.contratualId` = a base que
     `contratual()` escolheu (quem chama já a tem); `opts.cabecalho` = o
     cabeçalho da base (ver o ⚠ de `aprovacoes`). */
  function estado(listaSelo, baseId, opts) {
    opts = opts || {};
    var ap = aprovacoes(listaSelo, baseId, opts.cabecalho), s = seloDe(listaSelo, baseId);
    var ult = ap.vivas.length ? ap.vivas[ap.vivas.length - 1] : null;
    var e = ult ? "aprovada" : (ap.anuladas.length ? "anulada" : "interna");
    var ehC = opts.contratualId != null && str(opts.contratualId) === str(baseId);
    return { estado: ehC ? "contratual" : e, aprovacaoEstado: e, contratual: ehC, aprovacao: ult, anuladas: ap.anuladas, eventos: ap.eventos,
      selo: s ? { completo: !!s.serv, soEtapas: s.soEtapas === 1, semServico: str(s.semServico), origem: str(s.origem), hash: str(s.hash), qualidade: qualidade(s) } : null };
  }

  /* ================================================================
     SELAR
     ================================================================ */
  function selar(base, r, V, meta) {
    meta = meta || {};
    if (!ehObj(base) || base.tipo !== "base") return { erro: "o selo precisa do registro da linha de base." };
    if (base.resumida || base.arquivada) return { erro: "a versão resumida não se sela no congelamento — sela-se a completa." };
    if (!ehLista(base.nos) || !base.nos.length) return { erro: "linha de base sem etapas — não há o que selar." };
    if (!ehLista(base.curva)) return { erro: "linha de base sem curva — não há o que selar." };
    var cria = carimbo(base.criadaEm, Q.congelamento);
    if (!cria) return { erro: "a linha de base não tem a data de congelamento — o selo precisa dela para ter o mesmo carimbo em todo aparelho." };
    if (!r || !ehLista(r.atividades)) return { erro: "o selo precisa da árvore do cronograma que foi congelada (Cronograma.estimar com eap)." };
    var porId = {}, i, n;
    for (i = 0; i < r.atividades.length; i++) { n = r.atividades[i]; if (n && n.id != null) porId[str(n.id)] = n; }
    /* ⚠ PROVA DE QUE `r` É A ÁRVORE CONGELADA: todo nó da base existe nela
       com a MESMA janela. Um `r` de outra âncora ou de outro plano selaria
       os serviços em dias que a base não tem. */
    var crit = {};
    for (i = 0; i < base.nos.length; i++) {
      var b = base.nos[i], a = porId[str(b.id)];
      if (!a || a.inicio !== b.i || a.fim !== b.f) return { erro: "o cronograma usado para selar não é o que foi congelado (o nó " + str(b.n) + " não confere) — nada foi gravado." };
      if (a.critico) crit[str(b.id)] = true;
      if (!(isFinite(Number(b.i)) && Number(b.i) % 1 === 0 && isFinite(Number(b.f)) && Number(b.f) % 1 === 0)) return { erro: "janela de nó que não é número inteiro de dias (" + str(b.n) + ")." };
    }
    var selo = {
      id: "selo_" + str(base.id), tipo: "selo", fmt: 1, origem: "congelamento",
      obraId: str(base.obraId), baseId: str(base.id), versao: base.versao,
      orcamentoId: str(base.orcamentoId), orcNumero: str(base.orcNumero),
      motivo: str(base.motivo), por: str(base.por), criadaEm: str(base.criadaEm),
      contratual: meta.contratual === true,
      aprovacao: ehObj(meta.aprovacao) ? clone(meta.aprovacao) : null,
      cal: clone(base.cal), totalDias: base.totalDias, dataFim: str(base.dataFim), valor: base.valor,
      opcionaisIncluidos: ehLista(base.opcionaisIncluidos) ? base.opcionaisIncluidos.slice() : [],
      opcionaisFora: ehLista(base.opcionaisFora) ? base.opcionaisFora.slice() : [],
      nos: nosColunas(base.nos, crit),
      curva: curvaColunas(base.curva)
    };
    if (ehLista(base.extras) && base.extras.length) selo.extras = clone(base.extras);
    /* SERVIÇOS: a MESMA partição do confronto (js/cronoplan.js,
       `confrontoPorNo`): o serviço vai para a folha em que está (paiId) e,
       sem ela na base, para a etapa. Serviço sem quantidade (semBase) ou sem
       janela fica fora — o previsto × realizado também o deixa fora. */
    var posF = {}, nosB = base.nos, P = (V && V.porId && typeof V.porId === "object") ? V.porId : (ehObj(V) ? V : {});
    for (i = 0; i < nosB.length; i++) posF[str(nosB[i].id)] = i;
    var sIds = [], sP = [], sI = [], sD = [], sV = [], sQ = [], sU = [];
    for (i = 0; i < r.atividades.length; i++) {
      n = r.atividades[i];
      if (!n || n.tipo !== "servico" || n.semBase || n.inicio == null || n.fim == null) continue;
      var alvo = own(posF, str(n.paiId)) ? str(n.paiId) : (own(posF, str(n.etapaId)) ? str(n.etapaId) : null);
      if (alvo === null) continue;
      var fb = nosB[posF[alvo]];
      sIds.push(str(n.id)); sP.push(posF[alvo]); sI.push(n.inicio - fb.i); sD.push(n.fim - n.inicio);
      sV.push(centavos(own(P, n.id) ? P[n.id] : 0));
      var q = Number(n.quantidade);
      sQ.push(isFinite(q) ? q : 0); sU.push(str(n.unidade));
    }
    var pre = prefixoComum(sIds), curtos = [];
    for (i = 0; i < sIds.length; i++) curtos.push(sIds[i].slice(pre.length));
    selo.serv = { pre: pre, ids: juntar(curtos), p: nums36(sP), i: nums36(sI), d: nums36(sD), v: numsDec(sV), q: numsDec(sQ), u: juntar(sU) };
    if (!sIds.length) { selo.serv = null; selo.semServico = "nenhum serviço com quantidade na linha de base"; }
    selo.hash = hashDe(selo);
    selo.hashServ = selo.serv ? sha(canon(selo.serv)) : null;
    if (!selo.hash) return { erro: "o código de conferência não pôde ser calculado (js/util.js não carregado) — nada foi gravado." };
    selo.criadoEm = cria; selo.atualizadoEm = cria;
    var bt = bytes(selo);
    if (bt == null) return { erro: "motor do planejamento (js/cronoplan.js) não carregado — nada foi gravado." };
    if (bt > TETO_SELO && selo.serv) {
      selo.serv = null;
      /* o código dos serviços descreveria um detalhe que nunca foi guardado */
      selo.hashServ = null;
      selo.semServico = "obra grande demais para o detalhe por serviço (" + kb(bt) + " KB; o limite é " + kb(TETO_SELO) + " KB por versão)";
    }
    if (semAninhada(selo) !== true) return { erro: "erro de programação: o selo tem lista dentro de lista, e a nuvem o recusaria — nada foi gravado." };
    return selo;
  }

  /* SELO TARDIO — a base congelada por uma versão que não selava.
     null quando: é selada (o selo vem pela nuvem: NUNCA selar de novo),
     arquivada, sem nós, ou sem data de congelamento. Resumida → só etapas
     (.100); completa → nós e curva (.500). `serv` sempre null. */
  function tardio(cab) {
    if (!ehObj(cab) || cab.tipo !== "base" || cab.selado || cab.arquivada) return null;
    if (!ehLista(cab.nos) || !cab.nos.length) return null;
    if (!(typeof cab.versao === "number" && cab.versao >= 1)) return null;
    var so = !!cab.resumida || !ehLista(cab.curva);
    var cria = carimbo(cab.criadaEm, so ? Q.tardioEtapas : Q.tardioCompleto);
    if (!cria) return null;
    var nos = [], i;
    for (i = 0; i < cab.nos.length; i++) {
      var x = cab.nos[i];
      if (!ehObj(x) || x.id == null) return null;
      if (so && x.t === "f") continue;
      if (!(isFinite(Number(x.i)) && isFinite(Number(x.f)))) return null;
      nos.push(x);
    }
    if (!nos.length) return null;
    var selo = {
      id: "selo_" + str(cab.id), tipo: "selo", fmt: 1, origem: "tardio",
      obraId: str(cab.obraId), baseId: str(cab.id), versao: cab.versao,
      orcamentoId: str(cab.orcamentoId), orcNumero: str(cab.orcNumero),
      motivo: str(cab.motivo), por: str(cab.por), criadaEm: str(cab.criadaEm),
      contratual: cab.contratual === true,
      aprovacao: ehObj(cab.aprovacao) ? clone(cab.aprovacao) : null,
      cal: clone(cab.cal), totalDias: cab.totalDias, dataFim: str(cab.dataFim), valor: cab.valor,
      opcionaisIncluidos: ehLista(cab.opcionaisIncluidos) ? cab.opcionaisIncluidos.slice() : [],
      opcionaisFora: ehLista(cab.opcionaisFora) ? cab.opcionaisFora.slice() : [],
      nos: nosColunas(nos, null),
      curva: so ? { k: "", v: "", p: "" } : curvaColunas(cab.curva)
    };
    if (so) selo.soEtapas = 1;
    if (ehLista(cab.extras) && cab.extras.length && !so) selo.extras = clone(cab.extras);
    selo.serv = null;
    selo.semServico = "congelada numa versão do OrçaPRO que não guardava o detalhe por serviço" + (so ? " (e já estava resumida: ficam só as etapas)" : "");
    selo.hash = hashDe(selo);
    selo.hashServ = null;
    if (!selo.hash) return null;
    selo.criadoEm = cria; selo.atualizadoEm = cria;
    if (semAninhada(selo) !== true) return null;
    return selo;
  }

  /* os selos tardios que ESTE aparelho deve gravar: um por cabeçalho sem selo
     (e o tardio melhor que um tardio pobre que chegou antes — o conteúdo é
     determinístico, então todos os aparelhos gravam o mesmo) */
  function pendentes(listaCrono, listaSelo) {
    var out = [], i;
    if (!ehLista(listaCrono)) return out;
    for (i = 0; i < listaCrono.length; i++) {
      var t = tardio(listaCrono[i]);
      if (!t) continue;
      var ja = seloDe(listaSelo, t.baseId);
      if (!ja) { out.push(t); continue; }
      if (ja.origem === "tardio" && qualidade(ja) < qualidade(t)) out.push(t);
    }
    return out;
  }

  /* ================================================================
     ABRIR e COMPLETAR (só leitura)
     ================================================================ */
  function abrir(selo) {
    if (!ehObj(selo) || selo.tipo !== "selo") return { erro: "o registro não é um selo de linha de base." };
    var tit = "o selo da linha de base v" + str(selo.versao) + " está ilegível: ";
    var ln = lerNos(selo.nos);
    if (ln.erro) return { erro: tit + ln.erro + " — os números não são mostrados pela metade." };
    var lc = lerCurva(selo.curva);
    if (lc.erro) return { erro: tit + lc.erro + "." };
    var ls = lerServ(selo.serv, ln.nos);
    if (ls.erro) return { erro: tit + ls.erro + "." };
    var cab = {}, k;
    for (k in selo) if (own(selo, k) && k !== "nos" && k !== "curva" && k !== "serv") cab[k] = selo[k];
    var temF = false, i;
    for (i = 0; i < ln.nos.length; i++) if (ln.nos[i].t === "f") { temF = true; break; }
    return { cab: cab, nos: ln.nos, serv: ls.serv, curva: lc.curva, extras: ehLista(selo.extras) ? selo.extras : [],
      temFolhas: temF, soEtapas: selo.soEtapas === 1 };
  }
  /* o registro de base (formato do congelarBase) que o selo aberto guarda */
  function comoBase(ab) {
    var nos = [], i;
    for (i = 0; i < ab.nos.length; i++) {
      var x = ab.nos[i];
      nos.push({ id: x.id, t: x.t, e: x.e, n: x.n, nm: x.nm, i: x.i, f: x.f, v: x.v });
    }
    return nos;
  }
  /* ⚠ SÓ LEITURA: cópia RASA da lista em que cada base cujo cabeçalho foi
     resumido ou arquivado (por um aparelho antigo, pela porta do espaço ou
     pela obra grande) e cujo selo tem as folhas vira a base completa, com
     `_doSelo: true`. Quem GRAVA usa a lista CRUA — gravar a completada poria
     o detalhe de volta em `crono_obra` e estouraria o documento da nuvem
     (App._cronoObraCtx devolve as duas, com nomes diferentes). */
  function completar(listaCrono, listaSelo) {
    if (!ehLista(listaCrono)) return listaCrono;
    var out = listaCrono.slice(), i;
    if (!ehLista(listaSelo) || !listaSelo.length) return out;
    for (i = 0; i < out.length; i++) {
      var b = out[i];
      if (!ehObj(b) || b.tipo !== "base") continue;
      if (!(b.resumida || b.arquivada || b.detalheNoSelo)) continue;
      var s = seloDe(listaSelo, b.id);
      if (!s) continue;
      var ab = abrir(s);
      if (ab.erro || !ab.temFolhas) continue;
      var c = {}, k;
      for (k in b) if (own(b, k)) c[k] = b[k];
      c.nos = comoBase(ab);
      c.curva = ab.curva;
      /* o calendário do selo tem os feriados; o do arquivado, não */
      if (ehObj(s.cal)) c.cal = clone(s.cal);
      if (ab.extras.length && !ehLista(c.extras)) c.extras = clone(ab.extras);
      c.resumida = false; c.arquivada = false; c._doSelo = true;
      delete c.folhasResumidas; delete c.mesesResumidos; delete c.etapasArquivadas;
      out[i] = c;
    }
    return out;
  }

  /* ================================================================
     GRAVAR: selo novo (com a porta do espaço), evento, encerrar
     ================================================================ */
  function ocupacao(listaSelo, opts) {
    opts = opts || {};
    var l = ehLista(listaSelo) ? listaSelo : [];
    var o = { bytes: bytes(l), teto: TETO_ENTIDADE, registros: l.length, selos: 0, comServico: 0, semServico: 0, soEtapas: 0, eventos: 0,
      bytesComServico: 0, bytesSemServico: 0, bytesEventos: 0, outros: 0, bytesOutros: 0, porObra: {} };
    var i;
    for (i = 0; i < l.length; i++) {
      var x = l[i], b = bytes(x) || 0;
      var ob = ehObj(x) ? str(x.obraId) : "";
      if (!own(o.porObra, ob)) o.porObra[ob] = { bytes: 0, selos: 0, comServico: 0, eventos: 0 };
      var po = o.porObra[ob];
      po.bytes += b;
      if (ehObj(x) && x.tipo === "selo") {
        o.selos++; po.selos++;
        if (x.serv) { o.comServico++; po.comServico++; o.bytesComServico += b; } else { o.semServico++; o.bytesSemServico += b; if (x.soEtapas === 1) o.soEtapas++; }
      } else if (ehObj(x) && x.tipo === "evento") { o.eventos++; po.eventos++; o.bytesEventos += b; }
      else { o.outros++; o.bytesOutros += b; }
    }
    o.livre = o.bytes == null ? null : Math.max(0, TETO_ENTIDADE - o.bytes);
    if (opts.nomes) {
      o.maiores = Object.keys(o.porObra).map(function (k) { return { obraId: k, nome: str(opts.nomes[k] || k), bytes: o.porObra[k].bytes, selos: o.porObra[k].selos }; })
        .sort(function (a, b) { return (b.bytes - a.bytes) || cmp(a.obraId, b.obraId); }).slice(0, 3);
    }
    return o;
  }
  function textoOcupacao(oc) {
    return oc.comServico + " versão(ões) com detalhe por serviço (" + kb(oc.bytesComServico) + " KB), " +
      oc.semServico + " só com etapas e subetapas (" + kb(oc.bytesSemServico) + " KB) e " +
      oc.eventos + " registro(s) de aprovação (" + kb(oc.bytesEventos) + " KB)" +
      (oc.outros ? ", mais " + oc.outros + " registro(s) que esta versão do app não conhece (" + kb(oc.bytesOutros) + " KB)" : "") +
      (oc.maiores && oc.maiores.length ? ". Obras que mais ocupam: " + oc.maiores.map(function (m) { return m.nome + " (" + kb(m.bytes) + " KB)"; }).join(", ") : "");
  }

  /* `ctx` = {ativas: {obraId: baseId}, contratuais: {obraId: baseId},
     agora, listaCrono, nomes: {obraId: nome}}.
     Devolve {ok, lista, gravar, reduzidos, semServico, bytes, teto, msg} ou
     {ok:false, erro, codigo}. A lista de quem chamou fica intacta. */
  function novoSelo(listaSelo, selo, ctx) {
    ctx = ctx || {};
    if (listaSelo == null) listaSelo = [];
    if (!ehLista(listaSelo)) return falha("as linhas de base seladas (" + ENTIDADE + ") não chegaram em forma de lista — nada foi gravado, porque gravar por cima apagaria o que elas têm. Faça um backup e avise o suporte da RA.", { codigo: "nao-lista" });
    if (!ehObj(selo) || selo.tipo !== "selo" || !str(selo.id) || !str(selo.obraId)) return falha("o registro não é um selo de linha de base — nada foi gravado.");
    if (selo.erro) return falha(str(selo.erro));
    if (bytes(selo) == null) return falha("motor do planejamento (js/cronoplan.js) não carregado — nada foi gravado.");
    if (ehLista(selo.curva)) return falha("erro de programação: a curva do selo em lista de listas não sobe para a nuvem — nada foi gravado.", { codigo: "forma" });
    if (semAninhada(selo) !== true) return falha("erro de programação: o selo tem lista dentro de lista, e a nuvem o recusaria — nada foi gravado.", { codigo: "forma" });
    var i;
    for (i = 0; i < listaSelo.length; i++) if (ehObj(listaSelo[i]) && listaSelo[i].id === selo.id) return falha("esta linha de base já está selada (" + selo.id + ") — o selo não se regrava. Nada foi gravado.", { codigo: "existe" });
    var ag = iso(ctx.agora), novo = clone(selo);
    if (bytes(novo) > TETO_SELO && novo.serv) {
      novo.serv = null;
      novo.hashServ = null;
      novo.semServico = "obra grande demais para o detalhe por serviço (" + kb(bytes(selo)) + " KB)";
    }
    var trab = listaSelo.slice(), tam = [], soma = 0;
    for (i = 0; i < trab.length; i++) { tam[i] = bytes(trab[i] === undefined ? null : trab[i]); soma += tam[i]; }
    function total(bNovo) { return 2 + soma + bNovo + trab.length; }
    var bN = bytes(novo), reduzidos = [], mudou = {};
    if (total(bN) > TETO_ENTIDADE) {
      /* A PORTA (D16), nesta ordem: o detalhe por serviço das INTERNAS
         antigas; depois o das APROVADAS antigas. ⚠ Nunca a contratual (de
         nenhum jeito que ela seja marcada), nunca a ativa de obra nenhuma,
         nunca o novo. Dentro de cada grupo, a congelada há mais tempo.
         ⚠ As ativas vêm do chamador ou, sem elas, da lista CRUA do
         `crono_obra` pela régua do CronoBase (uma só): sem nenhuma das duas,
         a ativa de outra obra perderia o detalhe que o IDP dela usa. */
      var protegido = {}, ob, ativas = ehObj(ctx.ativas) ? ctx.ativas : ativasDe(ctx.listaCrono);
      for (ob in ativas) if (own(ativas, ob)) protegido[str(ativas[ob])] = true;
      for (ob in (ctx.contratuais || {})) if (own(ctx.contratuais, ob)) protegido[str(ctx.contratuais[ob])] = true;
      var cand = [];
      for (i = 0; i < trab.length; i++) {
        var x = trab[i];
        if (!ehObj(x) || x.tipo !== "selo" || !x.serv || x.contratual === true || own(protegido, str(x.baseId))) continue;
        var cc = contratual(ctx.listaCrono, trab, x.obraId);
        if (cc && (cc.baseId === str(x.baseId) || cc.gemeas.indexOf(str(x.baseId)) > -1)) continue;
        var est = estado(trab, x.baseId, {});
        cand.push({ i: i, aprovada: est.aprovacaoEstado === "aprovada" ? 1 : 0, criadaEm: str(x.criadaEm), id: str(x.id) });
      }
      cand.sort(function (a, b) { return (a.aprovada - b.aprovada) || cmp(a.criadaEm, b.criadaEm) || cmp(a.id, b.id); });
      for (var c = 0; c < cand.length && total(bN) > TETO_ENTIDADE; c++) {
        var k = cand[c].i, velho = trab[k], nv = clone(velho);
        nv.serv = null;
        nv.semServico = "reduzido para caber no limite da nuvem em " + br(ag.slice(0, 10)) + " (ficam as etapas, as subetapas e a curva)";
        /* ⚠ carimbo NOVO: a redução tem de vencer o merge nos outros aparelhos
           (que ainda têm a versão cheia), como o resumo do cronobase.js */
        nv.atualizadoEm = ag;
        soma += (tam[k] = bytes(nv)) - bytes(velho);
        trab[k] = nv; mudou[k] = true; reduzidos.push(nv.id);
      }
    }
    var semServ = false;
    if (total(bN) > TETO_ENTIDADE && novo.serv) {
      /* ⚠ SEM CANDIDATO (crítica 1, achado 7): a linha de base NUNCA deixa de
         congelar por causa do detalhe opcional. O selo novo vai sem `serv`, com
         a qualidade .050 (perde para qualquer selo completo da mesma base que
         outro aparelho tenha conseguido gravar) */
      var livre = Math.max(0, TETO_ENTIDADE - (2 + soma + trab.length));
      novo.serv = null;
      novo.hashServ = null;
      novo.semServico = "sem espaço para o detalhe por serviço (" + kb(livre) + " KB livres)";
      var cr = carimbo(novo.criadaEm, Q.semEspaco);
      if (cr) { novo.criadoEm = cr; novo.atualizadoEm = cr; }
      bN = bytes(novo);
      semServ = true;
    }
    if (total(bN) > TETO_ENTIDADE) {
      var semNovo = trab.slice();
      var oc = ocupacao(semNovo, { nomes: ctx.nomes });
      return falha("as linhas de base seladas desta empresa passariam de " + kb(total(bN)) + " KB (limite " + kb(TETO_ENTIDADE) +
        " KB, antes do teto de 1 MiB da nuvem) — mesmo sem o detalhe por serviço. Nada foi gravado. Ocupam o espaço: " + textoOcupacao(oc) +
        ". A contratual e a ativa de cada obra não são reduzidas. Para liberar, encerre o planejamento de uma obra concluída (sub-aba Linhas de base → Encerrar planejamento) ou avise o suporte da RA com estes números.",
        { codigo: "sem-espaco", bytes: total(bN), teto: TETO_ENTIDADE, ocupacao: oc });
    }
    var gravar = [];
    for (i = 0; i < trab.length; i++) if (mudou[i]) gravar.push(trab[i]);
    trab.push(novo); gravar.push(novo);
    var msg = null;
    if (reduzidos.length) msg = "Para caber no limite da nuvem, " + reduzidos.length + " linha(s) de base antiga(s) deixaram de guardar o detalhe por serviço. Ficam as etapas, as subetapas e a curva; a contratual e a ativa de cada obra continuam completas.";
    if (semServ) msg = (msg ? msg + " " : "") + "Esta versão foi selada sem o detalhe por serviço: " + novo.semServico + ". A comparação por serviço dela mostra só as subetapas.";
    return { ok: true, lista: trab, gravar: gravar, selo: novo, reduzidos: reduzidos, semServico: semServ, bytes: bytes(trab), teto: TETO_ENTIDADE, msg: msg };
  }

  /* A APROVAÇÃO DO CONTRATANTE, numa régua só (o diálogo de congelar e o
     evento `aprovar`): quem (nome e cargo) e quando (data válida, NÃO futura)
     obrigatórios; documento opcional; aditivo só por carimbo (`aditivoId`,
     escolhido entre os dos contratos da obra — nunca por semelhança).
     `hoje` = "AAAA-MM-DD" (ausente = hoje). → {aprovacao} | {erro}. */
  function validarAprovacao(a, hoje) {
    a = ehObj(a) ? a : {};
    var por = str(a.por).replace(/\s+/g, " ").trim(), em = str(a.em).trim();
    var h = /^\d{4}-\d{2}-\d{2}$/.test(str(hoje)) ? str(hoje) : iso(null).slice(0, 10);
    if (!por) return { erro: "informe quem aprovou (nome e cargo) — nada foi gravado." };
    if (!dataValida(em)) return { erro: "informe a data da aprovação (dd/mm/aaaa) — nada foi gravado." };
    if (em > h) return { erro: "a data da aprovação (" + br(em) + ") está no futuro — nada foi gravado." };
    return { aprovacao: { tipo: "contratante", por: por.slice(0, 80), em: em, documento: str(a.documento).replace(/\s+/g, " ").trim().slice(0, 120), aditivoId: a.aditivoId ? str(a.aditivoId) : null } };
  }

  /* ctx = {agora, admin, listaCrono, sufixo, confirmacao} */
  function novoEvento(listaSelo, ev, ctx) {
    ctx = ctx || {};
    if (listaSelo == null) listaSelo = [];
    if (!ehLista(listaSelo)) return falha("as linhas de base seladas (" + ENTIDADE + ") não chegaram em forma de lista — nada foi gravado.", { codigo: "nao-lista" });
    if (!ehObj(ev) || !own(ACOES, ev.acao)) return falha("ação de linha de base desconhecida — nada foi gravado.");
    var ag = iso(ctx.agora), ob = str(ev.obraId), bid = str(ev.baseId);
    if (!ob) return falha("o registro precisa da obra — nada foi gravado.");
    var inf = bid ? infoBase(ctx.listaCrono, listaSelo, bid) : null;
    if (ev.acao !== "trocar-contratual" && (!inf || inf.obraId !== ob)) return falha("a linha de base " + (bid || "?") + " não existe nesta obra — nada foi gravado.");
    var rec = { tipo: "evento", acao: ev.acao, obraId: ob, baseId: bid, versao: inf ? inf.versao : null, motivo: str(ev.motivo).replace(/\s+/g, " ").trim().slice(0, 300),
      registradoPor: str(ev.registradoPor).slice(0, 60), registradoEm: ag };
    var cAtual = contratual(ctx.listaCrono, listaSelo, ob);
    if (ev.acao === "aprovar") {
      var va = validarAprovacao(ev.aprovacao, ctx.hoje || ag.slice(0, 10));
      if (va.erro) return falha(va.erro);
      rec.aprovacao = va.aprovacao;
    } else if (ev.acao === "anular-aprovacao") {
      if (!ctx.admin) return falha("só o administrador da conta anula uma aprovação — nada foi gravado.", { codigo: "admin" });
      if (!rec.motivo) return falha("informe o motivo da anulação — ele fica no histórico. Nada foi gravado.");
      var ap = aprovacoes(listaSelo, bid), alvo = null;
      ap.vivas.forEach(function (x) { if (x.id === str(ev.anula)) alvo = x; });
      if (!alvo) return falha("essa aprovação não existe mais (ou já foi anulada) — nada foi gravado.");
      rec.anula = alvo.id;
    } else if (ev.acao === "marcar-contratual") {
      if (!ctx.admin) return falha("só o administrador da conta marca a linha de base contratual — nada foi gravado.", { codigo: "admin" });
      if (cAtual) return falha("esta obra já tem linha de base contratual (v" + cAtual.versao + ") — para mudar, use Trocar a contratual. Nada foi gravado.", { codigo: "ja-contratual" });
    } else if (ev.acao === "trocar-contratual") {
      if (!ctx.admin) return falha("só o administrador da conta troca a linha de base contratual — nada foi gravado.", { codigo: "admin" });
      if (str(ctx.confirmacao).trim().toUpperCase() !== "TROCAR") return falha("digite TROCAR para confirmar — nada foi gravado.", { codigo: "confirmacao" });
      if (!rec.motivo) return falha("informe o motivo da troca — ele fica no histórico e no impresso. Nada foi gravado.");
      if (!cAtual) return falha("esta obra ainda não tem linha de base contratual — marque uma (não é troca). Nada foi gravado.");
      var para = str(ev.para), infP = infoBase(ctx.listaCrono, listaSelo, para);
      if (!infP || infP.obraId !== ob) return falha("a linha de base escolhida não existe nesta obra — nada foi gravado.");
      if (para === cAtual.baseId) return falha("essa já é a linha de base contratual — nada foi gravado.");
      rec.de = cAtual.baseId; rec.para = para; rec.baseId = para; rec.versao = infP.versao;
      bid = para;
    }
    var suf = ctx.sufixo != null ? str(ctx.sufixo) : (ag.replace(/\D/g, "").slice(2, 17) + Math.random().toString(36).slice(2, 6));
    rec.id = "ev_" + bid + "_" + suf;
    rec.criadoEm = ag; rec.atualizadoEm = ag;
    for (var i = 0; i < listaSelo.length; i++) if (ehObj(listaSelo[i]) && listaSelo[i].id === rec.id) return falha("já existe um registro com este id — nada foi gravado.");
    if (semAninhada(rec) !== true) return falha("erro de programação: lista dentro de lista no registro — nada foi gravado.");
    var bl = bytes(listaSelo.concat([rec]));
    if (bl == null) return falha("motor do planejamento (js/cronoplan.js) não carregado — nada foi gravado.");
    if (bl > TETO_ENTIDADE) return falha("as linhas de base seladas desta empresa passariam de " + kb(bl) + " KB (limite " + kb(TETO_ENTIDADE) + " KB). Nada foi gravado. Encerre o planejamento de uma obra concluída para liberar espaço.", { codigo: "sem-espaco", bytes: bl });
    return { ok: true, evento: rec, lista: listaSelo.concat([rec]), gravar: [rec], bytes: bl };
  }

  /* ⚠ A PORTA D16 — "Encerrar planejamento de obra concluída". Reduz TODOS
     os selos da obra a `serv: null`, a contratual inclusive (é a única porta
     que a toca, e só com PDF + pacote + "ENCERRAR" digitado na tela).
     Ficam `nos`, `curva` e `hash`: o comparativo por subetapa e o código de
     conferência continuam. Carimbo novo, para a redução propagar. */
  function encerrarObra(listaSelo, obraId, agora) {
    if (!ehLista(listaSelo)) return falha("as linhas de base seladas não chegaram em forma de lista — nada foi gravado.", { codigo: "nao-lista" });
    var ag = iso(agora), ob = str(obraId), out = listaSelo.slice(), gravar = [], antes = bytes(listaSelo), i;
    if (antes == null) return falha("motor do planejamento (js/cronoplan.js) não carregado — nada foi gravado.");
    for (i = 0; i < out.length; i++) {
      var x = out[i];
      if (!ehObj(x) || x.tipo !== "selo" || str(x.obraId) !== ob || !x.serv) continue;
      var nv = clone(x);
      nv.serv = null;
      nv.semServico = "planejamento da obra encerrado em " + br(ag.slice(0, 10)) + "; o detalhe está no pacote exportado nesse dia";
      nv.encerradoEm = ag;
      nv.atualizadoEm = ag;
      out[i] = nv; gravar.push(nv);
    }
    var depois = bytes(out);
    return { ok: true, lista: out, gravar: gravar, n: gravar.length, bytesAntes: antes, bytes: depois, liberados: antes - depois };
  }

  /* ⚠ A VARREDURA DE ÓRFÃOS (crítica 1, achado 10; risco R12): selo e
     evento de obra que não existe neste aparelho — excluída num aparelho
     1.2.81 (que não os leva) ou que ainda não chegou pela sincronização.
     NUNCA apaga: devolve a lista, e a tela oferece PDF + pacote + [Apagar]. */
  function orfaos(listaSelo, obrasIds) {
    var vivas = {}, out = [], i;
    (ehLista(obrasIds) ? obrasIds : []).forEach(function (id) { vivas[str(id)] = true; });
    if (!ehLista(listaSelo)) return out;
    for (i = 0; i < listaSelo.length; i++) {
      var x = listaSelo[i];
      if (!ehObj(x) || !str(x.obraId) || own(vivas, str(x.obraId))) continue;
      if (x.tipo !== "selo" && x.tipo !== "evento") continue;
      out.push(x);
    }
    return out;
  }

  /* o PACOTE de conferência de uma obra: os selos, os eventos e os
     cabeçalhos, com o código de conferência de cada versão (JSON canônico).
     É o que a pessoa guarda antes de encerrar ou apagar. */
  function pacote(listaCrono, listaSelo, obraId, meta) {
    meta = meta || {};
    var ob = str(obraId), selos = [], eventos = [], cabs = [], i;
    (ehLista(listaSelo) ? listaSelo : []).forEach(function (x) {
      if (!ehObj(x) || str(x.obraId) !== ob) return;
      if (x.tipo === "selo") selos.push(x); else if (x.tipo === "evento") eventos.push(x);
    });
    if (ehLista(listaCrono)) for (i = 0; i < listaCrono.length; i++) { var b = listaCrono[i]; if (ehObj(b) && b.tipo === "base" && str(b.obraId) === ob) cabs.push(b); }
    selos.sort(function (a, b) { return ((a.versao || 0) - (b.versao || 0)) || cmp(str(a.id), str(b.id)); });
    var conf = selos.map(function (s) { return { versao: s.versao, baseId: s.baseId, codigo: str(s.hash), codigoServicos: s.hashServ ? str(s.hashServ) : null, confere: hashDe(s) === s.hash }; });
    return { formato: "orcapro-linhas-de-base", fmt: 1, obraId: ob, obraNome: str(meta.obraNome), geradoEm: iso(meta.agora), geradoPor: str(meta.por),
      conferencia: conf, selos: selos, eventos: eventos, cabecalhos: cabs };
  }

  /* ⚠ O MERGE DA NUVEM, CONSULTADO NA HORA pelo js/nuvem.js (espec O19): o
     módulo NUNCA registra nada no Nuvem (que carrega 200 linhas depois e é
     recriado no fim do arquivo). O selo é imutável: vence o maior
     `atualizadoEm` (a qualidade vai no milissegundo), SEM cópia do perdedor
     e sem contar conflito — "conflito" aqui é sempre a mesma versão com
     qualidade diferente, e uma cópia de até 50 KB estouraria o documento. */
  var mergeNuvem = {
    vencedor: function (local, nuvem) {
      var tl = str(local && local.atualizadoEm), tc = str(nuvem && nuvem.atualizadoEm);
      if (tl === tc) return local;
      return tl > tc ? local : nuvem;
    },
    /* nada a podar no selo: a lista mesclada volta como está (e sempre LISTA) */
    depois: function (lista) { return ehLista(lista) ? lista : []; }
  };

  var CronoSelo = {
    pronto: true,
    ENTIDADE: ENTIDADE,
    TETO_SELO: TETO_SELO,
    TETO_ENTIDADE: TETO_ENTIDADE,
    QUALIDADE: Q,
    carimbo: carimbo,
    qualidade: qualidade,
    canon: canon,
    hashDe: hashDe,
    selar: selar,
    tardio: tardio,
    pendentes: pendentes,
    abrir: abrir,
    completar: completar,
    seloDe: seloDe,
    contratual: contratual,
    contratuaisDe: contratuaisDe,
    encerradasDe: encerradasDe,
    ativasDe: ativasDe,
    guardaFolhas: guardaFolhas,
    guardaEtapas: guardaEtapas,
    aprovacoes: aprovacoes,
    estado: estado,
    novoSelo: novoSelo,
    novoEvento: novoEvento,
    validarAprovacao: validarAprovacao,
    encerrarObra: encerrarObra,
    orfaos: orfaos,
    pacote: pacote,
    ocupacao: ocupacao,
    textoOcupacao: textoOcupacao,
    mergeNuvem: mergeNuvem,
    _colunas: { juntar: juntar, partir: partir },
    _dep: dep
  };

  global.CronoSelo = CronoSelo;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoSelo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
