/* =====================================================================
 * baseexigida.js — A BASE DE PREÇO CERTA, INSTALADA E ESCOLHIDA SOZINHA (leva L, 10/11/2026)
 *
 * Pedido do Rogério (10/11/2026): «toda vez que estiver gerando um processo e precisar de um banco de dados / fonte para o
 * orçamento, o sistema automaticamente já marca e usa no orçamento. Eu não tenho que ir lá instalar, senão dá erro porque não
 * instalei. Tem que estar lá já.»
 *
 * DUAS METADES (padrão da casa: motor puro + fiação fina)
 *   resolver(ctx)          PURO. UF, município, regulamento, recurso federal, tipo do objeto, data-base e regime
 *                          → lista ORDENADA de {base, catId, uf, competencia, regime, motivo}.
 *   situacao(lista, inst)  PURO. Para cada base: já instalada | ausente | de assinatura (precisa importar).
 *   garantir(lista, opts)  Instala SÓ o que falta, pelo caminho que já existe (opts.instalar), com faixa de progresso.
 *                          Idempotente; sem internet não inventa base: devolve a mensagem e `tentarDeNovo`.
 *   instaladorPadrao()     A FIAÇÃO com App/Bases/Sinapi (VPS `/bases/`, histórico e espelho; o pacote do app como queda).
 *   marcar(orc, lista)     Grava no orçamento a base exigida (a MESMA que precifica), sem a pessoa abrir Tabelas.
 *
 * ⚠ REGRAS QUE NÃO CEDEM
 *   a) NUNCA INVENTA BASE NEM PREÇO. Sem rede, a base fica «ausente» e quem chama recebe o recado; nada é «simulado».
 *   b) BASE DE ASSINATURA (FDE, EMOP…) NÃO É PAGA NEM BAIXADA POR AQUI: a RA não a distribui. Ausente → estado
 *      «precisa-importar» com a ação «Importar meu arquivo» (Tabelas). Nunca devolve preço.
 *   c) COMPETÊNCIA EXATA PRIMEIRO. Se a pedida não existe em fonte nenhuma e `permitirAtual`, instala a atual e DIZ
 *      («usando X, a planilha pede Y») — nunca em silêncio.
 * ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  function s(v) { return String(v === null || v === undefined ? "" : v).replace(/^\s+|\s+$/g, ""); }
  function up(v) { return s(v).toUpperCase(); }
  function norm(v) {
    return s(v).toLowerCase().replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i").replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c").replace(/\s+/g, " ");
  }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  /* «06/2026», «2026-06», «2026-06-01» → «2026-06»; outra coisa → «» */
  function comp(v) {
    var t = s(v), m = /^(\d{4})-(\d{2})/.exec(t) || null;
    if (m) return m[1] + "-" + m[2];
    m = /^(\d{1,2})\s*[\/\-]\s*(\d{4})$/.exec(t);
    if (m) return m[2] + "-" + (m[1].length < 2 ? "0" : "") + m[1];
    return "";
  }
  function regimeDe(v) {
    var t = norm(v);
    if (!t) return "";
    if (/nao\s*desoner|^oner/.test(t)) return "onerado";
    if (/desoner/.test(t)) return "desonerado";
    return "";
  }
  function fmtComp(c) { var m = /^(\d{4})-(\d{2})$/.exec(c || ""); return m ? m[2] + "/" + m[1] : ""; }

  /* tipos do objeto que pedem tabela de INFRAESTRUTURA (a base do tipo vem da biblioteca CPLPRO quando carregada) */
  var INFRA_URBANA = { pavimentacao: 1, drenagem: 1 };
  function baseDoTipo(tipo, ctx) {
    if (ctx && ctx.baseDoTipo) return up(ctx.baseDoTipo);
    var R = global.CplproRegras;
    if (!R && typeof require === "function") { try { R = require("./cplproregras.js"); } catch (e) { R = null; } }
    return R && R.TIPOS_OBJETO && R.TIPOS_OBJETO[tipo] ? up(R.TIPOS_OBJETO[tipo].base) : "SINAPI";
  }

  function item(catId, base, uf, competencia, regime, motivo, extra) {
    var o = { base: base, catId: catId, uf: up(uf), competencia: comp(competencia), regime: regime || "", motivo: motivo };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }
  function sinapi(uf, c, regime, motivo, extra) {
    return item(regime === "desonerado" ? "SINAPI_DES" : "SINAPI", "SINAPI", uf, c, regime || "onerado", motivo, extra);
  }

  /* ------------------------------------------------------------------ *
   * RESOLVER
   * ctx: { uf, municipio, regulamentoId, recursoFederal, tipoObjeto, competencia, regime, baseDoTipo, extras }
   *   extras: bases que o edital/usuário já exigem [{catId|base, uf, competencia, regime}] — entram no fim, sem repetir.
   * ------------------------------------------------------------------ */
  function resolver(ctx) {
    var c = ctx || {}, uf = up(c.uf), mun = norm(c.municipio), cp = comp(c.competencia), rg = regimeDe(c.regime) || "onerado";
    var federal = c.recursoFederal === true;
    var reg = s(c.regulamentoId);
    /* a capital paulista tem decreto próprio — mas com recurso da União valem as regras federais (Decreto 62.100/2022, art. 28, §2º) */
    if (!reg && mun === "sao paulo" && uf === "SP") reg = "sp-capital-62100";
    if (federal) reg = "federal-14133";
    var tipo = s(c.tipoObjeto), baseTipo = baseDoTipo(tipo, c);
    var out = [];
    if (reg === "sp-capital-62100") {
      var infra = !!INFRA_URBANA[tipo];
      out.push(item(infra ? "SIURB_INFRA" : "SIURB", infra ? "SIURB Infraestrutura Urbana" : "SIURB Edificações", "SP", cp, rg,
        "Decreto Municipal 62.100/2022, art. 28: a Tabela de Custos Unitários da SIURB vem primeiro na capital paulista.", { regulamento: reg }));
      out.push(sinapi("SP", cp, rg, "Complemento do que a SIURB não tem (mesma ordem do regulamento: outros sistemas oficiais depois da SIURB).", { complemento: true, regulamento: reg }));
    } else if (baseTipo === "SICRO") {
      out.push(item("SICRO", "SICRO", uf, cp, "", "Objeto de infraestrutura de transportes: SICRO (DNIT) primeiro (Lei 14.133, art. 23, §2º, I).", { regulamento: reg || "federal-14133" }));
      out.push(sinapi(uf, cp, rg, "Complemento do que o SICRO não tem (SINAPI, mesmo artigo).", { complemento: true, regulamento: reg || "federal-14133" }));
    } else {
      out.push(sinapi(uf, cp, rg, federal ? "Recurso federal: SINAPI (Lei 14.133, art. 23, §2º, I; IN SEGES/ME 91/2022)." : "Edificação sem decreto próprio no sistema: SINAPI do estado da obra (Lei 14.133, art. 23, §2º, I).", { regulamento: reg || "federal-14133" }));
    }
    arr(c.extras).forEach(function (e) {
      var id = up(e && (e.catId || e.base || e.fonte));
      if (!id) return;
      if (out.some(function (x) { return x.catId === id && (x.uf === up(e.uf) || !e.uf) && (!comp(e.competencia) || x.competencia === comp(e.competencia)); })) return;
      out.push(item(id, e.nome || id, e.uf, e.competencia, regimeDe(e.regime), e.motivo || "Exigida pelo edital."));
    });
    out.forEach(function (x, i) { x.ordem = i + 1; });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * SITUAÇÃO — o que já está instalado (lista = Bases.lista())
   * ------------------------------------------------------------------ */
  function assinaturaDe(catId, cat) {
    var C = cat || global.BasesCat;
    return !!(C && C.assinatura && C.assinatura(catId));
  }
  function estadoDe(it, instaladas, cat) {
    var inst = arr(instaladas).filter(function (b) { return b && up(b.fonte) === it.catId && b.ativa !== false; })[0] || null;
    if (inst) {
      var ufOk = !it.uf || !inst.uf || up(inst.uf) === it.uf || up(inst.uf) === "BR";
      var compOk = !it.competencia || comp(inst.competencia) === it.competencia;
      var rgInst = inst.desonerado === true ? "desonerado" : (inst.desonerado === false ? "onerado" : "");
      var rgOk = !it.regime || it.catId === "SICRO" || !rgInst || rgInst === it.regime;
      if (ufOk && compOk && rgOk) return { estado: "instalada", instalada: inst };
    }
    if (assinaturaDe(it.catId, cat)) return { estado: "assinatura", instalada: inst };
    return { estado: "ausente", instalada: inst };
  }
  function situacao(lista, instaladas, cat) {
    return arr(lista).map(function (it) { var e = estadoDe(it, instaladas, cat); return { item: it, estado: e.estado, instalada: e.instalada }; });
  }

  function rotulo(it) {
    return it.base + (it.catId === "SINAPI_DES" ? " desonerada" : "") + " (" + (it.uf || "—") + (it.competencia ? ", " + fmtComp(it.competencia) : "") + ")";
  }
  function pareceSemRede(err) {
    var m = s(err && err.message ? err.message : err);
    if (err && err.semRede === true) return true;
    try { if (typeof navigator !== "undefined" && navigator.onLine === false) return true; } catch (e) {}
    return /failed to fetch|networkerror|network error|load failed|tempo esgotado|sem conex|precisa de internet|offline|sem rede|HTTP 5\d\d|HTTP 404|n[aã]o foi encontrada|n[aã]o tem essa base/i.test(m);
  }

  /* ------------------------------------------------------------------ *
   * GARANTIR — instala SÓ o que falta
   * opts: { instaladas: fn()|array (relida a cada base), instalar: fn(item)→Promise, onProgresso: fn(msg,k,n), catalogo,
   *         permitirAtual }
   * → Promise { ok, itens:[{item, estado: ja|instalada|precisa-importar|falhou, motivo, aviso, acao}], falhou, precisaImportar,
   *             semRede, tentarDeNovo, avisos }
   * ------------------------------------------------------------------ */
  var VOANDO = {};   // instalações em andamento (duas chamadas seguidas esperam a mesma)
  function chaveDe(it) { return [it.catId, it.uf, it.competencia, it.regime].join("|"); }

  function garantir(lista, opts) {
    var o = opts || {}, itens = arr(lista), res = { ok: true, itens: [], falhou: [], precisaImportar: [], semRede: false, tentarDeNovo: false, avisos: [] };
    var inst = function () { return typeof o.instaladas === "function" ? o.instaladas() : arr(o.instaladas); };
    /* `confere(item)` troca a régua: a licitação já tem a sua (LicitacaoAuto.situacaoAuto, que conhece regime e variante) */
    var estado = function (it) {
      if (typeof o.confere === "function") return { estado: o.confere(it) ? "instalada" : (assinaturaDe(it.catId, o.catalogo) ? "assinatura" : "ausente") };
      return estadoDe(it, inst(), o.catalogo);
    };
    var falta = itens.filter(function (it) { return estado(it).estado !== "instalada"; }).length;
    var k = 0, seq = Promise.resolve();
    itens.forEach(function (it) {
      seq = seq.then(function () {
        var e = estado(it);
        if (e.estado === "instalada") { res.itens.push({ item: it, estado: "ja" }); return; }
        if (e.estado === "assinatura") {
          var r0 = { item: it, estado: "precisa-importar", acao: "Importar meu arquivo", motivo: it.base + " é fonte por assinatura: a RA não a distribui. Contrate no site do órgão e importe o arquivo da sua empresa em Tabelas." };
          res.itens.push(r0); res.precisaImportar.push(r0); res.ok = false; return;
        }
        if (typeof o.instalar !== "function") {
          var rn = { item: it, estado: "falhou", motivo: "Não há como instalar " + rotulo(it) + " neste ambiente." };
          res.itens.push(rn); res.falhou.push(rn); res.ok = false; return;
        }
        k++;
        var msg = "Carregando a base " + it.base + " (" + (it.uf || "—") + (it.competencia ? ", " + fmtComp(it.competencia) : "") + ")…";
        if (typeof o.onProgresso === "function") { try { o.onProgresso(msg, k, falta); } catch (eP) {} }
        var ch = chaveDe(it);
        var p = VOANDO[ch] || (VOANDO[ch] = Promise.resolve().then(function () { return o.instalar(it); }));
        return p.then(function (r) {
          delete VOANDO[ch];
          /* instalou DE VERDADE? relê o que está instalado — «ok» do instalador sem a base lá não vale */
          var conf = estado(it), confInst = typeof o.confere === "function" ? null : estadoDe(it, inst(), o.catalogo).instalada;
          if (conf.estado === "instalada" || (r && r.fallback === true && confInst)) {
            var rr = { item: it, estado: "instalada", aviso: (r && r.aviso) || "" };
            if (rr.aviso) res.avisos.push(rr.aviso);
            res.itens.push(rr); return;
          }
          var rf = { item: it, estado: "falhou", motivo: rotulo(it) + " foi instalada, mas não confere com o pedido (UF, mês ou regime). Nada foi marcado no orçamento." };
          res.itens.push(rf); res.falhou.push(rf); res.ok = false;
        }, function (err) {
          delete VOANDO[ch];
          var sr = pareceSemRede(err), detalhe = s(err && err.message ? err.message : err);
          var rf2 = { item: it, estado: "falhou", semRede: sr, tentarDeNovo: true,
            motivo: sr ? "Não consegui carregar " + rotulo(it) + " agora: sem conexão com o servidor da RA. Confira a internet e tente de novo — nenhuma base foi inventada." + (detalhe ? " (" + detalhe + ")" : "")
              : "Não consegui carregar " + rotulo(it) + ": " + detalhe + "." };
          res.itens.push(rf2); res.falhou.push(rf2); res.ok = false;
          if (sr) res.semRede = true;
          res.tentarDeNovo = true;
        });
      });
    });
    return seq.then(function () { return res; });
  }

  /* ------------------------------------------------------------------ *
   * MARCAR no orçamento a base exigida (a mesma que precifica)
   * ------------------------------------------------------------------ */
  function marcar(orc, lista) {
    if (!orc) return 0;
    var n = 0;
    arr(lista).forEach(function (it) {
      var catId = it.catId;   /* mesmo formato de Licitacao.declararBaseUsada */
      if (it.catId === "SINAPI" || it.catId === "SINAPI_DES") {
        if (it.uf) orc.uf = it.uf;
        if (it.competencia) orc.competenciaSinapi = it.competencia;
        if (it.catId === "SINAPI") { n++; return; }
      }
      orc.config = (orc.config && typeof orc.config === "object") ? orc.config : {};
      var l = arr(orc.config.bases).length ? orc.config.bases : (orc.config.bases = []);
      var reg = l.filter(function (b) { return b && up(b.fonte) === catId; })[0];
      if (!reg) { reg = { fonte: catId }; l.push(reg); }
      reg.uf = it.uf || reg.uf || ""; reg.competencia = it.competencia || reg.competencia || "";
      n++;
    });
    orc.baseExigida = arr(lista).map(function (it) { return { catId: it.catId, uf: it.uf, competencia: it.competencia, regime: it.regime, motivo: it.motivo }; });
    return n;
  }

  /* a lista com o que está DE FATO instalado (UF e mês reais, inclusive quando a atual substituiu o mês pedido): é isto que o orçamento marca */
  function usadas(lista, instaladas) {
    var out = [];
    arr(lista).forEach(function (it) {
      var b = arr(instaladas).filter(function (x) { return x && up(x.fonte) === it.catId && x.ativa !== false; })[0] || null;
      if (!b) return;
      /* UF errada NUNCA serve: preço de outro estado não é «competência diferente», é outra tabela */
      if (it.uf && b.uf && up(b.uf) !== "BR" && up(b.uf) !== it.uf) return;
      var rgB = b.desonerado === true ? "desonerado" : (b.desonerado === false ? "onerado" : "");
      if (it.regime && it.catId !== "SICRO" && rgB && rgB !== it.regime) return;
      var x = {}; for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k)) x[k] = it[k];
      x.competencia = comp(b.competencia) || it.competencia;
      if (b.uf && up(b.uf) !== "BR") x.uf = up(b.uf);
      x.divergeDoPedido = !!(it.competencia && comp(b.competencia) && comp(b.competencia) !== it.competencia);
      out.push(x);
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * FIAÇÃO — o instalador que usa o que o app JÁ tem (nenhum caminho novo de rede)
   *   SINAPI (pacote do app → servidor → espelho): App.trocarBaseSinapi
   *   SINAPI desonerada, SICRO, SETOP, SUDECAP, ORSE: Bases.garantirCompetencia (disco → servidor → espelho)
   *   demais (SIURB…): Bases.instalar (servidor ao vivo, arquivo do pacote como queda)
   * ⚠ Instalar base grava na EMPRESA INTEIRA: respeita o mesmo aval de App._podeBases().
   * ------------------------------------------------------------------ */
  function instaladorPadrao(op) {
    var exata = !!(op && op.exata);   // licitação: o mês do edital ou nada (nunca outra competência, nem com aviso)
    return function (it) {
      var A = global.App, B = global.Bases, C = global.BasesCat;
      if (it.catId === "SINAPI") {
        if (!A || !A.trocarBaseSinapi) return Promise.reject(new Error("a troca de base SINAPI não está disponível"));
        var tentar = function (compPedida) {
          return new Promise(function (ok, no) {
            A.trocarBaseSinapi(it.uf, compPedida, function (certo) { certo ? ok() : no(new Error("não foi encontrada" + (compPedida ? " (" + fmtComp(compPedida) + ")" : ""))); });
          });
        };
        return tentar(it.competencia).then(function () { return { ok: true }; }, function (err) {
          if (exata || !it.competencia || !(err && /n[aã]o foi encontrada/.test(err.message))) throw err;
          /* mês pedido não existe em fonte nenhuma: usa o atual e DIZ (nunca em silêncio) */
          return tentar("").then(function () {
            var gl = global.Sinapi || {};
            return { ok: true, fallback: true, aviso: "Usando SINAPI " + up(it.uf) + " de " + (fmtComp(comp(gl.competencia)) || "competência não declarada") + " — a planilha pede " + fmtComp(it.competencia) + "." };
          });
        });
      }
      if (!B || !C) return Promise.reject(new Error("o gerenciador de bases não está disponível"));
      if (A && A._podeBases && !A._podeBases()) return Promise.reject(new Error("seu perfil não instala tabela de preço — peça ao administrador da conta"));
      if (C.temHistorico && C.temHistorico(it.catId) && it.competencia) {
        return B.garantirCompetencia(it.catId, { uf: it.uf, competencia: it.competencia, regime: it.regime }, { permitirAtual: !exata, pesoMb: 3 });
      }
      var sel = { uf: it.uf || undefined };
      var ent = C.get ? C.get(it.catId) : null;
      var eixoR = ent && arr(ent.eixos).filter(function (x) { return x && x.id === "regime"; })[0];
      if (eixoR && it.regime) sel.regime = it.regime === "onerado" ? "onerada" : "desonerada";
      return B.instalar(it.catId, sel, { pesoMb: ent && ent.pesoMb });
    };
  }

  var BaseExigida = {
    resolver: resolver, situacao: situacao, garantir: garantir, marcar: marcar, usadas: usadas, instaladorPadrao: instaladorPadrao,
    rotulo: rotulo, fmtComp: fmtComp, comp: comp, regimeDe: regimeDe, pareceSemRede: pareceSemRede
  };
  global.BaseExigida = BaseExigida;
  if (typeof module !== "undefined" && module.exports) module.exports = BaseExigida;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
