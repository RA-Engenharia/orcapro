/* =====================================================================
 * analiticobases.js — ANALÍTICO DAS BASES ESTADUAIS (IOPES, SICRO, SEINFRA,
 * ORSE, SETOP, SUDECAP, AGETOP/GOINFRA): composição → insumos, MO/MAT/EQ.
 *
 * ⚠ POR QUE UM MÓDULO À PARTE E NÃO O `Analitico`.
 *   O `Analitico` (js/analitico.js) é UM arquivo por vez — o da SINAPI da UF
 *   ativa — e carrega a trava de regime, a troca de UF e o aviso de outra
 *   competência que a SINAPI precisa. As bases estaduais são outra coisa: um
 *   orçamento mistura IOPES com SINAPI na mesma planilha, e cada base tem o
 *   SEU arquivo. Enfiar as duas no mesmo singleton faria um clique num item
 *   do IOPES descarregar o analítico da SINAPI (e vice-versa). Aqui há um
 *   cache por ARQUIVO, e a SINAPI não é tocada.
 *
 * ⚠ DEFEITO QUE ISTO FECHA (16/10/2026, cliente do ES): "não consigo abrir as
 *   composições analíticas do IOPES, só da SINAPI". As bases estaduais
 *   entravam só com o preço final (LACUNAS.md nº 26): sem desdobramento, sem
 *   MO/MAT/EQ e sem "Criar minha versão".
 *
 * O ARQUIVO (docs/ANALITICO-BASES-CONTRATO.md): o mesmo nome do sintético
 * da base com `-analitico.json` no lugar de `-current.json`
 * (data/iopes-ES-current.json → data/iopes-ES-analitico.json), no pacote e
 * no servidor (/analitico/). Gerado pelos robôs tools/analitico-<base>.js,
 * que conferem cada composição contra o preço do sintético.
 *
 * Lógica de nome/índice/conferência é pura e testável em Node
 * (tools/test-analitico-bases.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* bases que têm analítico próprio por aqui. SINAPI/SINAPI_DES ficam com o
     `Analitico`; PROPRIA traz os insumos dentro do próprio item. */
  var FORA = { SINAPI: 1, SINAPI_DES: 1, PROPRIA: 1, PROPRIO: 1, OUTRA: 1 };

  /* Base cujo órgão NÃO publica o detalhamento em arquivo aberto: o app diz
     isso de cara, em vez de tentar a rede e culpar a internet. Conferido em
     16/10/2026 (docs/ANALITICO-BASES-FONTES.md). */
  var SEM_PUBLICACAO = {
    SETOP: "A SETOP-MG só disponibiliza o detalhamento das composições de 2024 em diante dentro do SICOR, com login do órgão; a tabela pública de 2023 tem o analítico apenas em PDF. Por isso o OrçaPRO ainda não traz o desdobramento da SETOP."
  };

  function up(s) { return String(s == null ? "" : s).toUpperCase().trim(); }

  /* "05/2026", "2026-05", "2026-5" → "2026-05" (vazio se não reconhece) */
  function normComp(c) {
    var s = String(c || "").trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})/.exec(s))) return m[1] + "-" + ("0" + m[2]).slice(-2);
    if ((m = /^(\d{1,2})\/(\d{4})$/.exec(s))) return m[2] + "-" + ("0" + m[1]).slice(-2);
    return "";
  }

  /* tolerância do contrato: max(R$ 0,02; 0,5% do custo unitário) */
  function tolerancia(cu) { return Math.max(0.02, Math.abs(Number(cu) || 0) * 0.005); }

  /* Razões MO/MAT/EQ (0..1) de uma composição DESCENDO nas sub-composições
     (puro). Sub-composição publicada como "serviço" (IOPES, SICRO: atividade
     auxiliar) não é material: a demolição manual do IOPES 010201 é feita de
     duas subs e saía 100% material. Memo + guarda de ciclo. */
  function razoesRec(porCodigo, cod, memo, trilha) {
    cod = String(cod);
    if (memo[cod]) return memo[cod];
    var c = porCodigo[cod];
    if (!c) return null;
    if (trilha[cod]) return null;
    trilha[cod] = 1;
    var mo = 0, mat = 0, eq = 0;
    var ins = Array.isArray(c.insumos) ? c.insumos : [];
    for (var i = 0; i < ins.length; i++) {
      var it = ins[i], ct = Number(it.custoTotal) || 0;
      if (ct <= 0) continue;
      var rz = (String(it.tipo).toUpperCase() === "COMPOSICAO") ? razoesRec(porCodigo, it.codigo, memo, trilha) : null;
      if (rz) { mo += ct * rz.mo; mat += ct * rz.mat; eq += ct * rz.eq; }
      else if (it.categoria === "MO") mo += ct;
      else if (it.categoria === "EQ") eq += ct;
      else mat += ct;
    }
    delete trilha[cod];
    var t = mo + mat + eq;
    var r = t > 0 ? { mo: mo / t, mat: mat / t, eq: eq / t } : null;
    if (r) memo[cod] = r;
    return r;
  }

  var AnaliticoBases = {
    _cache: {},      // nome do arquivo → { promise, pacote, porCodigo, nome }

    normComp: normComp,
    razoesRec: function (porCodigo, cod) { return razoesRec(porCodigo, cod, {}, {}); },

    /* A base tem analítico por este módulo? (não diz se o arquivo existe —
       isso só se sabe ao carregar; o modal explica quando não vem) */
    suporta: function (fonte) {
      var f = up(fonte);
      if (!f || FORA[f]) return false;
      if (typeof BasesCat !== "undefined" && BasesCat.get) {
        var e = BasesCat.get(f);
        return !!(e && e.entrega);
      }
      return true;
    },

    /* nome do analítico a partir do arquivo do sintético */
    /* texto do motivo quando o órgão não publica (null = publica) */
    semPublicacao: function (fonte) { return SEM_PUBLICACAO[up(fonte)] || null; },

    nomeAnalitico: function (arquivoSintetico) {
      var s = String(arquivoSintetico || "").replace(/\\/g, "/");
      var nome = s.split("/").pop();
      if (!nome || !/\.json$/i.test(nome)) return "";
      if (/-analitico\.json$/i.test(nome)) return nome;
      if (/-current\.json$/i.test(nome)) return nome.replace(/-current\.json$/i, "-analitico.json");
      return nome.replace(/\.json$/i, "-analitico.json");
    },

    /* a base INSTALADA (com sel/catId) — a que precifica o orçamento */
    baseInstalada: function (fonte) {
      var f = up(fonte);
      if (typeof Bases === "undefined" || !Bases.extras) return null;
      return Bases.extras().filter(function (b) { return b.fonte === f; })[0] || null;
    },

    /* Lista de URLs, em ordem: pacote local antes da rede; .gz é tentado
       primeiro dentro de cada uma (ver _pegarUma). */
    urlsDe: function (fonte, opts) {
      opts = opts || {};
      var f = up(fonte), b = opts.base || this.baseInstalada(f);
      var r = null;
      try {
        if (typeof BasesCat !== "undefined" && BasesCat.resolver) {
          var ctx = null;
          try { if (typeof Atualizacao !== "undefined" && Atualizacao._ultimoStatus) ctx = { servidor: Atualizacao._ultimoStatus }; } catch (eC) {}
          r = BasesCat.resolver((b && b.catId) || f, (b && b.sel) || null, ctx);
        }
      } catch (eR) { r = null; }
      var nomes = [];
      function juntar(n) { if (n && nomes.indexOf(n) < 0) nomes.push(n); }
      if (r) { juntar(this.nomeAnalitico(r.arquivo)); juntar(this.nomeAnalitico(r.vps)); }
      if (opts.arquivo) juntar(this.nomeAnalitico(opts.arquivo));
      var srv = opts.servidor !== undefined ? opts.servidor
        : ((typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : "");
      var out = [];
      nomes.forEach(function (n) { out.push("data/" + n); });
      if (srv) nomes.forEach(function (n) { out.push(srv + "/analitico/" + n); });
      return { nomes: nomes, alts: out, remap: (r && r.remap) || null };
    },

    /* índice por código (puro) */
    indexar: function (pacote) {
      var dados = (pacote && Array.isArray(pacote.dados)) ? pacote.dados : [];
      var idx = {};
      for (var i = 0; i < dados.length; i++) {
        var it = dados[i];
        if (it && it.codigo != null) idx[String(it.codigo)] = it;
      }
      return idx;
    },

    _pegarUma: function (url) {
      var temDS = (typeof DecompressionStream !== "undefined") && (typeof Response !== "undefined");
      var puro = function () { return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); };
      if (!temDS || /\.gz$/.test(url)) return puro();
      return fetch(url + ".gz").then(function (r) {
        if (!r.ok || !r.body) throw new Error("sem .gz");
        return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).json();
      }).catch(puro);
    },

    /* Carrega (uma vez por arquivo) o analítico da base. Resolve com a
       entrada do cache; rejeita com `semArquivo` quando nenhuma fonte tem. */
    carregar: function (fonte, opts) {
      var self = this;
      var u = this.urlsDe(fonte, opts);
      if (!u.alts.length) {
        var e0 = new Error("sem arquivo de analítico para " + up(fonte)); e0.semArquivo = true;
        return Promise.reject(e0);
      }
      var chave = u.nomes[0];
      var c = this._cache[chave];
      if (c && c.pacote) return Promise.resolve(c);
      if (c && c.promise) return c.promise;
      var pegar = (opts && opts.pegar) || function (url) { return self._pegarUma(url); };
      /* ⚠ A COMPETÊNCIA ESCOLHE O ARQUIVO, NÃO SÓ A ORDEM.
       *   O pacote leva o analítico do mês em que a versão saiu; o servidor
       *   regenera toda semana junto com o sintético, e a base instalada
       *   acompanha o servidor (Atualizacao._varrerExtras). Aceitar o primeiro
       *   arquivo que respondesse abriria o detalhamento de MAIO com o preço de
       *   JULHO, para sempre. Então: o primeiro arquivo do MESMO mês da base
       *   instalada vence; sem nenhum do mesmo mês, fica o primeiro válido (e a
       *   tela avisa a diferença). Arquivo de outra base é pulado. */
      var baseInst = (opts && opts.base) || this.baseInstalada(fonte);
      var compBase = baseInst ? String(baseInst.competencia || "") : "";
      function mesmoMes(j) {
        if (!compBase) return true;
        var a = normComp(j.mes), b = normComp(compBase);
        return (a && b) ? a === b : String(j.mes || "") === compBase;
      }
      function valido(j) {
        if (!j || !Array.isArray(j.dados)) return "arquivo de analítico inválido";
        if (j.tabela && up(j.tabela) !== up(fonte) && !(up(fonte) === "AGETOP" && /GOINFRA|AGETOP/.test(up(j.tabela)))) {
          return "analítico de outra base: pedi " + up(fonte) + " e veio " + up(j.tabela);
        }
        return "";
      }
      var reserva = null, ultimoErro = null;
      function tentar(i) {
        if (i >= u.alts.length) {
          if (reserva) return Promise.resolve(reserva);
          return Promise.reject(ultimoErro || new Error("sem analítico"));
        }
        return Promise.resolve().then(function () { return pegar(u.alts[i]); }).then(function (j) {
          var erro = valido(j);
          if (erro) { ultimoErro = new Error(erro); return tentar(i + 1); }
          if (mesmoMes(j)) return j;
          if (!reserva) reserva = j;
          return tentar(i + 1);
        }, function (e) { ultimoErro = e; return tentar(i + 1); });
      }
      var ent = { nome: chave, remap: u.remap, pacote: null, porCodigo: {}, promise: null };
      ent.promise = tentar(0).then(function (j) {
        ent.pacote = j; ent.porCodigo = self.indexar(j); ent.promise = null;
        return ent;
      }).catch(function (e) {
        delete self._cache[chave];
        if (!e.semArquivo) { var e2 = new Error(e.message || String(e)); e2.semArquivo = true; e2.causa = e; throw e2; }
        throw e;
      });
      this._cache[chave] = ent;
      return ent.promise;
    },

    /* Composição pronta para mostrar: o preço de CABEÇALHO é o da base
       instalada (o que o orçamento usa, já com a região/regime escolhidos), e
       os insumos com preço por região são remapeados. Devolve null se a base
       não detalha esse código. Puro sobre (ent, itemDaBase). */
    montar: function (ent, codigo, itemDaBase) {
      if (!ent || !ent.porCodigo) return null;
      var a = ent.porCodigo[String(codigo)];
      if (!a) return null;
      var remap = ent.remap;
      var ins = (Array.isArray(a.insumos) ? a.insumos : []).map(function (it) {
        var o = {}; for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k)) o[k] = it[k];
        if (remap && it.precos && it.precos[remap] != null) {
          o.custoUnitario = Number(it.precos[remap]) || 0;
          o.custoTotal = Math.round((Number(o.coeficiente) || 0) * o.custoUnitario * 10000) / 10000;
        }
        return o;
      });
      var soma = 0, mo = 0, mat = 0, eq = 0;
      if (!ent.memo) ent.memo = {};
      ins.forEach(function (it) {
        var ct = Number(it.custoTotal) || 0;
        soma += ct;
        var rz = (String(it.tipo).toUpperCase() === "COMPOSICAO") ? razoesRec(ent.porCodigo, it.codigo, ent.memo, {}) : null;
        if (rz) {
          /* a sub mostra a categoria que ela REALMENTE é (a predominante) */
          it.categoria = (rz.mo >= rz.mat && rz.mo >= rz.eq) ? "MO" : (rz.eq > rz.mat ? "EQ" : "MAT");
          mo += ct * rz.mo; mat += ct * rz.mat; eq += ct * rz.eq;
        }
        else if (it.categoria === "MO") mo += ct; else if (it.categoria === "EQ") eq += ct; else mat += ct;
      });
      /* "Com BDI oficial" (GOINFRA): os insumos são custo direto, então o
         detalhamento compara e reparte sobre o CUSTO DIRETO, e diz o preço com
         BDI que o orçamento usa (js/bases.js guarda custoDireto na troca) */
      var cDir = itemDaBase && Number(itemDaBase.custoDireto) > 0 ? Number(itemDaBase.custoDireto) : 0;
      var oficial = cDir || (itemDaBase && Number(itemDaBase.custoUnitario) > 0 ? Number(itemDaBase.custoUnitario) : (Number(a.custoUnitario) || 0));
      var notaBdi = cDir ? "Custo direto da composição. No orçamento este item usa o preço com BDI oficial do órgão: R$ " +
        (Number(itemDaBase.custoUnitario) || 0).toFixed(2).replace(".", ",") + "." : "";
      /* a repartição MO/MAT/EQ vale sobre o preço OFICIAL (o que o orçamento
         usa): as razões vêm dos insumos, a escala vem do sintético */
      var t = mo + mat + eq;
      var dif = Math.round((soma - oficial) * 100) / 100;
      return {
        codigo: a.codigo, descricao: a.descricao || (itemDaBase && itemDaBase.descricao) || "",
        unidade: a.unidade || (itemDaBase && itemDaBase.unidade) || "", grupo: a.grupo || "",
        custoUnitario: oficial,
        custoMO: t > 0 ? Math.round(oficial * mo / t * 100) / 100 : (Number(a.custoMO) || 0),
        custoMAT: t > 0 ? Math.round(oficial * mat / t * 100) / 100 : (Number(a.custoMAT) || 0),
        custoEQ: t > 0 ? Math.round(oficial * eq / t * 100) / 100 : (Number(a.custoEQ) || 0),
        insumos: ins,
        somaInsumos: Math.round(soma * 100) / 100,
        diferenca: dif,
        confere: Math.abs(dif) <= tolerancia(oficial),
        obs: [notaBdi, a.obs || ""].filter(Boolean).join(" "),
        producaoEquipe: a.producaoEquipe, unidadeProducao: a.unidadeProducao
      };
    },

    /* Analítico já carregado (síncrono) — null se não carregou ou não tem */
    obter: function (fonte, codigo) {
      var u = this.urlsDe(fonte);
      var ent = u.nomes.length ? this._cache[u.nomes[0]] : null;
      if (!ent || !ent.pacote) return null;
      /* a região (SETOP) pode ter mudado desde a carga: vale a de AGORA */
      if (ent.remap !== u.remap) { ent.remap = u.remap; ent.idxInsumos = null; }
      var item = (typeof Bases !== "undefined" && Bases.obter) ? Bases.obter(up(fonte), String(codigo)) : null;
      return this.montar(ent, codigo, item);
    },

    /* metadados do arquivo carregado (competência, UF, regime, fonte) */
    meta: function (fonte) {
      var u = this.urlsDe(fonte);
      var ent = u.nomes.length ? this._cache[u.nomes[0]] : null;
      if (!ent || !ent.pacote) return null;
      var j = ent.pacote;
      /* `mes` casa com a base instalada; `rotuloComp` é o mês REAL do
         detalhamento. Diferem no SUDECAP: o sintético se rotula 2026-04 mas o
         preço das composições é da tabela de construção 01/2026 — é dela o
         detalhamento (revisor, 16/10/2026: a tela dizia "2026-04"). */
      var compC = normComp(j.competenciaComposicoes) || "";
      return { tabela: j.tabela || up(fonte), mes: normComp(j.mes) || String(j.mes || ""), uf: j.uf || "", desonerado: (j.desonerado === true || j.desonerado === false) ? j.desonerado : null,
        rotuloComp: compC || normComp(j.mes) || String(j.mes || ""),
        compDiverge: !!(compC && compC !== normComp(j.mes)),
        fonte: j.fonte || "", fonteUrl: j.fonteUrl || "", conferencia: j.conferencia || null, arquivo: ent.nome };
    },

    /* A competência do detalhamento é a mesma da base que precifica?
       (puro) → { mesmo, mesAnalitico, mesBase } */
    conferirCompetencia: function (metaAna, baseInst) {
      var ma = normComp(metaAna && metaAna.mes), mb = normComp(baseInst && baseInst.competencia);
      return { mesmo: !ma || !mb || ma === mb, mesAnalitico: ma, mesBase: mb };
    },

    /* Regime declarado pelos dois lados diverge? (puro) */
    regimeDiverge: function (metaAna, baseInst) {
      var ra = metaAna ? metaAna.desonerado : null, rb = baseInst ? baseInst.desonerado : null;
      return (ra === true || ra === false) && (rb === true || rb === false) && ra !== rb;
    },

    /* Razões MO/MAT/EQ (0..1) — para o item que entrou sem repartição */
    razoes: function (fonte, codigo) {
      var a = this.obter(fonte, codigo);
      if (!a) return null;
      var t = (a.custoMO || 0) + (a.custoMAT || 0) + (a.custoEQ || 0);
      if (t <= 0) return null;
      return { mo: a.custoMO / t, mat: a.custoMAT / t, eq: a.custoEQ / t };
    },

    /* Insumo REAL do analítico da base (nunca sub-composição): quem cria a
       versão própria a partir do IOPES precisa do preço do insumo, e o
       sintético do órgão às vezes só lista as composições. */
    insumo: function (fonte, codigo) {
      var u = this.urlsDe(fonte);
      var ent = u.nomes.length ? this._cache[u.nomes[0]] : null;
      if (!ent || !ent.pacote) return null;
      if (!ent.idxInsumos) {
        var idx = {};
        Object.keys(ent.porCodigo).forEach(function (cod) {
          var ins = ent.porCodigo[cod].insumos;
          if (!Array.isArray(ins)) return;
          for (var i = 0; i < ins.length; i++) {
            var it = ins[i];
            if (!it || it.codigo == null || String(it.tipo).toUpperCase() === "COMPOSICAO") continue;
            var c = String(it.codigo), at = idx[c];
            if (!at || (!(Number(at.custoUnitario) > 0) && Number(it.custoUnitario) > 0)) idx[c] = it;
          }
        });
        ent.idxInsumos = idx;
      }
      var x = ent.idxInsumos[String(codigo)];
      if (!x) return null;
      var preco = (ent.remap && x.precos && x.precos[ent.remap] != null) ? Number(x.precos[ent.remap]) : Number(x.custoUnitario);
      return { codigo: String(x.codigo), descricao: x.descricao || "", unidade: x.unidade || "",
        custoUnitario: preco || 0, categoria: x.categoria || "", tipoItem: "insumo", fonte: up(fonte) };
    },

    _limparCache: function () { this._cache = {}; }
  };

  if (global) global.AnaliticoBases = AnaliticoBases;
  if (typeof module !== "undefined" && module.exports) module.exports = AnaliticoBases;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
