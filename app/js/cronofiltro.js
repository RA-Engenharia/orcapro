/* =====================================================================
 * cronofiltro.js — CronoFiltro: a BUSCA e o FILTRO do Gantt da aba
 * Cronograma (fatia 1C do planejador, "uso"). Motor PURO: sem DOM, sem
 * Store; o "hoje" vem de quem chama.
 *
 * Espec: ESPEC-planejador.md (rev. 4), §1.7 e §3.3 (1C); desenho uso.md
 * §1.2, §1.3 e §3.1.
 *
 * ⚠ ESTADO DE TELA, NUNCA DO ORÇAMENTO. Busca e filtro moram em
 *   `App._cronoBusca`/`App._cronoFiltro`, por alvo, e valem só nesta janela
 *   até recarregar: filtro esquecido que volta sozinho no dia seguinte
 *   esconde tarefa (USO §1.3).
 * ⚠ FILTRO E BUSCA NUNCA ENTRAM NO MOTOR (espec I4): nenhuma data depende
 *   deles. Eles só escolhem QUAIS LINHAS a tela mostra — e a lista de linhas
 *   é UMA só (`CronoExecUI.linhas` com `manter`), usada pelo Gantt, pela
 *   tabela e pela fiação do arrasto. Filtrar em um só dos três faria a
 *   pessoa arrastar uma barra e ver outra se mexer.
 * ⚠ MARCO É `n.marco === true`, NUNCA "duração 0". No galpão da
 *   demonstração as 14 etapas opcionais fora do prazo têm 0 dia e NÃO são
 *   marco (medido; a auditoria A4 já as viu desenhadas como marco).
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
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function arr(v) { return ehLista(v) ? v : []; }
  /* ⚠ sem `instanceof`: a data pode vir de OUTRO realm (a janela destacada,
     o vm das suítes), e ali `instanceof Date` responde false — o período
     cairia calado no relógio de agora */
  function ehData(d) { return Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime()); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dia(d) { return ehData(d) ? d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) : null; }
  function dmBR(s) { return s ? s.slice(8, 10) + "/" + s.slice(5, 7) : ""; }

  /* sem acento, minúsculo. ⚠ `String.prototype.normalize` não existe em
     todo WebView de instalador antigo: a tabela cobre o português. */
  var TABELA = { "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "è": "e", "ê": "e", "ë": "e", "í": "i", "ì": "i", "î": "i", "ï": "i",
    "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o", "ú": "u", "ù": "u", "û": "u", "ü": "u", "ç": "c", "ñ": "n" };
  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    if (typeof s.normalize === "function") {
      try { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) { /* segue pela tabela */ }
    }
    return s.replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, function (c) { return TABELA[c] || c; });
  }

  /* O Nº DA LINHA que a tela escreve: a folha e o serviço trazem `numero` da
     árvore; a etapa, a posição (1, 2, …) — a mesma régua do "Depende de" */
  function numeroDe(l) {
    if (!l) return "";
    if (l.tipo === "extra") {
      var nx = l.no || l.x;
      return l.numero != null ? String(l.numero) : (nx && nx.numero != null ? String(nx.numero) : "");
    }
    if (l.no && l.no.numero != null) return String(l.no.numero);
    if (l.et && l.i != null) return String(l.i + 1);
    return "";
  }
  function noDe(l) { return l ? (l.no || l.et || l.x || null) : null; }
  function idDe(l) { var n = noDe(l); return n ? String(n.id) : ""; }

  /* as tarefas sem preço na forma da fixture T21 (`r.extras[]`: id, numero,
     nome, …). A 1A produz; enquanto não produzir, a lista é vazia. */
  function extrasDe(r) {
    var out = {};
    arr(r && r.extras).forEach(function (x, i) {
      if (x && x.id != null) out[String(x.id)] = { x: x, numero: x.numero != null ? String(x.numero) : "T" + (i + 1) };
    });
    return out;
  }

  /* um TOKEN casa com a linha? Número ("7", "7.2", "7.") = o nº da EAP
     inteiro ou o começo dele ("7" acha 7, 7.1, 7.2… e NÃO 17 nem 70), ou um
     código com 4+ dígitos. ⚠ Número sozinho não procura no NOME: "3" acharia
     "(3 diarias)" em qualquer linha. "T2" = a tarefa sem preço nº 2. */
  var RE_NUM = /^\d+(\.\d+)*\.?$/, RE_T = /^t\d+$/;
  function casaToken(tk, num, nome, cod) {
    if (RE_NUM.test(tk)) {
      var t = tk.replace(/\.$/, "");
      if (num && (num === t || num.indexOf(t + ".") === 0)) return true;
      return t.length >= 4 && cod.indexOf(t) >= 0;
    }
    if (RE_T.test(tk) && num && norm(num) === tk) return true;
    return nome.indexOf(tk) >= 0 || cod.indexOf(tk) >= 0;
  }
  function casa(toks, num, n) {
    var nome = norm(n && n.nome), cod = norm(n && n.codigo);
    for (var i = 0; i < toks.length; i++) if (!casaToken(toks[i], num, nome, cod)) return false;
    return true;
  }

  var CronoFiltro = {
    pronto: true,
    norm: norm,

    /* a JANELA do período (hoje LOCAL): segunda desta semana até o domingo
       (esta semana) ou até o domingo da semana seguinte (2 semanas).
       Devolve {ini, fim} em "AAAA-MM-DD" e o rótulo "(14/09 a 20/09)". */
    janela: function (hoje, periodo) {
      var h = ehData(hoje) ? hoje : new Date();
      var seg = new Date(h.getFullYear(), h.getMonth(), h.getDate());
      var dw = seg.getDay(); // 0 = domingo
      seg.setDate(seg.getDate() - (dw === 0 ? 6 : dw - 1));
      var fim = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + (periodo === "2semanas" ? 13 : 6));
      var a = dia(seg), b = dia(fim);
      return { ini: a, fim: b, rotulo: dmBR(a) + " a " + dmBR(b) };
    },

    /* BUSCA sobre as linhas (a mesma lista que a tela desenha, SEM o filtro).
       r = o resultado do motor; L = CronoExecUI.linhas(r, {detalhe, abertas})
       com todas as etapas abertas (a busca acha o que está numa etapa
       recolhida e a fiação a abre ao ir até o achado); o.detalhe.
       Devolve {texto, ids: [ids das linhas, na ordem da tela], emServico:
       {folhaId: [serviços]}, servicos: n (serviços achados fora das linhas),
       abaixo: {subetapa: n, servico: n} (achados abaixo do detalhe Etapa),
       total}. ⚠ O serviço que casa, no detalhe Subetapa, SOBE para a
       subetapa que o contém (USO §1.2-5), e só conta à parte quando a
       subetapa não casa por si. */
    buscar: function (r, texto, L, o) {
      o = o || {};
      var toks = norm(texto).split(/\s+/).filter(function (x) { return !!x; });
      var out = { texto: String(texto == null ? "" : texto), ids: [], emServico: {}, numeros: {}, subiram: {}, servicos: 0, abaixo: { subetapa: 0, servico: 0 }, total: 0 };
      if (!toks.length) return out;
      var det = o.detalhe === "servico" ? "servico" : (o.detalhe === "etapa" ? "etapa" : "subetapa");
      var linhas = arr(L), vistos = {}, i, naLista = {};
      for (i = 0; i < linhas.length; i++) naLista[idDe(linhas[i])] = true;
      for (i = 0; i < linhas.length; i++) {
        var l = linhas[i], n = noDe(l);
        if (!n) continue;
        if (casa(toks, numeroDe(l), n)) { var id = idDe(l); if (!vistos[id]) { vistos[id] = true; out.ids.push(id); } }
      }
      /* o que está ABAIXO das linhas (serviço no detalhe Subetapa; subetapa e
         serviço no detalhe Etapa) */
      if (det !== "servico") {
        var porFolha = {};
        arr(r && r.atividades).forEach(function (n) {
          if (!n || n.tipo === "etapa") return;
          var ehServ = n.tipo === "servico";
          if (det === "subetapa" && !ehServ) return;
          if (naLista[String(n.id)]) return;
          if (!casa(toks, String(n.numero == null ? "" : n.numero), n)) return;
          if (det === "etapa") { out.abaixo[ehServ ? "servico" : "subetapa"]++; return; }
          var pai = String(n.paiId || "");
          if (!pai || !naLista[pai]) return;
          if (!own(porFolha, pai)) porFolha[pai] = [];
          porFolha[pai].push(String(n.id));
        });
        /* a folha entra na ordem da tela; conta à parte só quem subiu */
        var ordem = [];
        for (i = 0; i < linhas.length; i++) {
          var idL = idDe(linhas[i]);
          if (own(porFolha, idL)) {
            out.emServico[idL] = porFolha[idL];
            out.numeros[idL] = numeroDe(linhas[i]);
            if (!vistos[idL]) { vistos[idL] = true; out.servicos += porFolha[idL].length; out.subiram[idL] = true; }
          }
          if (vistos[idL]) ordem.push(idL);
        }
        out.ids = ordem;
      }
      out.total = out.ids.length;
      return out;
    },

    /* o recado da busca (texto puro) e a porta que existe, ou "" */
    recadoBusca: function (b, detalhe) {
      if (!b || !b.texto || !norm(b.texto).replace(/\s+/g, "")) return { texto: "", porta: null };
      if (!b.total) {
        if (detalhe === "etapa" && (b.abaixo.servico || b.abaixo.subetapa)) {
          var partes = [];
          if (b.abaixo.subetapa) partes.push(b.abaixo.subetapa + " subetapa" + (b.abaixo.subetapa === 1 ? "" : "s"));
          if (b.abaixo.servico) partes.push(b.abaixo.servico + " serviço" + (b.abaixo.servico === 1 ? "" : "s"));
          var porta = b.abaixo.subetapa ? "subetapa" : "servico";
          return { texto: "Nada no detalhe Etapa; " + partes.join(" e ") + (b.abaixo.subetapa + b.abaixo.servico === 1 ? " tem" : " têm") + " esse texto.", porta: porta };
        }
        return { texto: "Nada encontrado no cronograma para “" + String(b.texto).trim() + "”.", porta: null };
      }
      if (b.servicos && detalhe !== "servico") {
        /* só as subetapas que subiram por causa de um serviço (as que casam
           pelo nome não entram no recado) */
        var pais = [];
        Object.keys(b.emServico).forEach(function (k) { if (b.subiram && b.subiram[k]) pais.push(b.numeros && b.numeros[k] ? b.numeros[k] : k); });
        return { texto: b.servicos + (b.servicos === 1 ? " achado é serviço" : " achados são serviços") + " dentro de " + pais.join(" e ") +
          " — no detalhe Subetapa " + (b.servicos === 1 ? "ele aparece" : "eles aparecem") + " na subetapa.", porta: "servico" };
      }
      return { texto: "", porta: null };
    },

    /* OS ACHADOS QUE A NAVEGAÇÃO VISITA (Enter, F3, ‹ ›): com o filtro ligado,
       só os que estão NA TELA (`manter`); os de fora são contados.
       ⚠ Roteiro do defeito (e2e-crono-busca, galpão, 17/09/2026): com
       "Caminho crítico" ligado e "munck" na busca, o Enter ia à 7.3 — fora do
       filtro — e abria o modal "Linha fora do filtro" a cada tecla; a busca
       virava uma fila de avisos. Quem quer ver os de fora limpa o filtro (o
       contador diz quantos são). */
    navegaveis: function (b, manter) {
      var ids = arr(b && b.ids);
      if (!manter || typeof manter !== "object") return { ids: ids.slice(), fora: 0 };
      var dentro = ids.filter(function (id) { return own(manter, String(id)); });
      return { ids: dentro, fora: ids.length - dentro.length };
    },
    /* o contador da barra ("2 de 4", "0 de 0 · 3 fora do filtro"); "" sem texto */
    textoContador: function (texto, idx, nav) {
      if (!String(texto == null ? "" : texto).trim()) return "";
      var tot = nav ? arr(nav.ids).length : 0, i = Math.max(0, Math.floor(Number(idx) || 0));
      var s = tot ? (Math.min(i, tot - 1) + 1) + " de " + tot : "0 de 0";
      if (nav && nav.fora > 0) s += " · " + nav.fora + " fora do filtro";
      return s;
    },

    /* O FILTRO. spec = {critico, atrasadas, naoConcluidas, periodo
       ("tudo"|"semana"|"2semanas"), marcos, fixadas, categorias: [], extras
       (null|"so"|"esconder"), soAchados, fixos: {id: true}}.
       ctx = {L (as linhas da tela sem o filtro), detalhe, hoje (Date),
       situacao ({id: "atrasada"|…} ou null), real ({id: pct} ou null),
       restricoes (o mapa do cronograma, ou null), busca (o de `buscar`, ou
       null)}.
       Devolve {ativo, manter, contexto, fora, visiveis, total, contagem,
       indisponivel, rotulos, janela}.
       ⚠ Critério que precisa de dado ausente (sem obra ligada não há
       atraso) SAI do filtro e vai para `indisponivel` com o motivo — nunca
       filtra "zero linhas" calado. */
    resolver: function (r, spec, ctx) {
      spec = spec || {}; ctx = ctx || {};
      var L = arr(ctx.L), self = this, i;
      var X = extrasDe(r);
      var temExtras = Object.keys(X).length > 0;
      var etapasFora = {};
      arr(r && r.etapas).forEach(function (e) { if (e && e.foraDoPrazo) etapasFora[String(e.id)] = true; });
      function opcFora(n) {
        if (!n) return false;
        if (n.foraDoPrazo === true || n.foraDoTotal === true) return true;
        var eid = n.etapaId != null ? n.etapaId : n.id;
        return own(etapasFora, String(eid));
      }
      function ehExtra(l) { return !!l && (l.tipo === "extra" || own(X, idDe(l))); }
      var jan = (spec.periodo === "semana" || spec.periodo === "2semanas") ? this.janela(ctx.hoje, spec.periodo) : null;
      var achados = {};
      if (ctx.busca) arr(ctx.busca.ids).forEach(function (id) { achados[id] = true; });
      var indisponivel = {}, rotulos = [], crit = [];
      var CRIT = {
        critico: { rot: "caminho crítico", f: function (l, n) { return n.critico === true; } },
        atrasadas: { rot: "atrasadas no previsto × realizado", precisa: "situacao",
          motivo: "Precisa de obra ligada a este orçamento, com diários: sem realizado não há atraso para medir.",
          f: function (l, n) { return /^atrasada/.test(String(ctx.situacao[String(n.id)] || "")); } },
        naoConcluidas: { rot: "não concluídas", precisa: "real",
          motivo: "Precisa de obra ligada a este orçamento, com diários: sem realizado não dá para saber o que já foi concluído.",
          f: function (l, n) { var k = String(n.id); return own(ctx.real, k) && ctx.real[k] != null && Number(ctx.real[k]) < 100; } },
        marcos: { rot: "marcos", f: function (l, n) { return n.marco === true && !opcFora(n); } },
        fixadas: { rot: "com data fixada no Gantt",
          f: function (l, n) { return l.tipo === "etapa" && !!ctx.restricoes && own(ctx.restricoes, String(n.id)); } },
        periodo: { rot: jan ? (spec.periodo === "semana" ? "esta semana (" + jan.rotulo + ")" : "próximas 2 semanas (" + jan.rotulo + ")") : "",
          f: function (l, n) { var a = dia(n.dataInicio), b = dia(n.dataFim); return !!a && !!b && a <= jan.fim && b >= jan.ini; } },
        categorias: { rot: "categoria", f: function (l, n) { return arr(spec.categorias).indexOf(String(n.categoria == null ? "" : n.categoria)) >= 0; } },
        extras: { rot: spec.extras === "so" ? "só tarefas sem preço" : "sem as tarefas sem preço",
          f: function (l) { return spec.extras === "so" ? ehExtra(l) : !ehExtra(l); } },
        soAchados: { rot: "só os achados da busca", f: function (l) { return own(achados, idDe(l)); } }
      };
      function ligado(k) {
        if (k === "periodo") return !!jan;
        if (k === "categorias") return arr(spec.categorias).length > 0;
        if (k === "extras") return (spec.extras === "so" || spec.extras === "esconder") && temExtras;
        if (k === "soAchados") return !!spec.soAchados && !!ctx.busca && !!String(ctx.busca.texto || "").trim();
        return spec[k] === true;
      }
      var ORDEM = ["critico", "atrasadas", "naoConcluidas", "periodo", "marcos", "fixadas", "categorias", "extras", "soAchados"];
      ORDEM.forEach(function (k) {
        var c = CRIT[k];
        if (c.precisa && !ctx[c.precisa]) { indisponivel[k] = c.motivo; if (ligado(k)) rotulos.push({ k: k, rot: c.rot, indisponivel: true }); return; }
        if (!ligado(k)) return;
        crit.push({ k: k, f: c.f });
        rotulos.push({ k: k, rot: c.rot });
      });
      /* o que cada opção deixaria sozinha (o painel mostra ao lado) */
      var contagem = {};
      ["critico", "atrasadas", "naoConcluidas", "marcos", "fixadas"].forEach(function (k) {
        var c = CRIT[k];
        if (c.precisa && !ctx[c.precisa]) { contagem[k] = null; return; }
        var nk = 0;
        for (var j = 0; j < L.length; j++) { var nj = noDe(L[j]); if (nj && c.f(L[j], nj)) nk++; }
        contagem[k] = nk;
      });
      ["semana", "2semanas"].forEach(function (pp) {
        var jj = self.janela(ctx.hoje, pp), nk = 0;
        for (var j = 0; j < L.length; j++) {
          var nj = noDe(L[j]); if (!nj) continue;
          var a = dia(nj.dataInicio), b = dia(nj.dataFim);
          if (a && b && a <= jj.fim && b >= jj.ini) nk++;
        }
        contagem["periodo:" + pp] = nk;
      });
      contagem.extras = 0;
      for (i = 0; i < L.length; i++) if (ehExtra(L[i])) contagem.extras++;
      if (contagem.marcos === 0 && !indisponivel.marcos) indisponivel.marcos = "nenhum neste cronograma";
      if (contagem.fixadas === 0 && !indisponivel.fixadas) indisponivel.fixadas = "nenhuma";
      if (!temExtras) indisponivel.extras = "nenhuma tarefa sem preço neste cronograma";
      var out = { ativo: crit.length > 0, manter: null, contexto: {}, fora: {}, visiveis: L.length, total: L.length,
        contagem: contagem, indisponivel: indisponivel, rotulos: rotulos, janela: jan, passam: 0 };
      if (!crit.length) return out;
      var fixos = (spec.fixos && typeof spec.fixos === "object") ? spec.fixos : {};
      var passa = {}, manter = {}, contexto = {}, fora = {};
      for (i = 0; i < L.length; i++) {
        var l = L[i], n = noDe(l); if (!n) continue;
        var id = idDe(l), ok = true;
        for (var c2 = 0; c2 < crit.length && ok; c2++) ok = !!crit[c2].f(l, n);
        passa[id] = ok;
        if (!ok && own(fixos, id) && fixos[id]) fora[id] = true;
      }
      /* a mãe (e a folha do serviço) vem junto, em cinza, para situar; ela
         continua editável, mas não conta como achada */
      var etapaDe = {}, folhaDe = {}, curEt = null, curFl = null;
      for (i = 0; i < L.length; i++) {
        var li = L[i], ni = noDe(li); if (!ni) continue;
        var idi = idDe(li);
        if (li.tipo === "etapa") { curEt = idi; curFl = null; }
        else if (li.tipo === "folha") { etapaDe[idi] = curEt; curFl = idi; }
        else if (li.tipo === "servico") { etapaDe[idi] = curEt; folhaDe[idi] = curFl; }
        else if (li.tipo === "extra") etapaDe[idi] = null;
      }
      for (i = 0; i < L.length; i++) {
        var lk = L[i], idk = idDe(lk);
        if (!idk || !(passa[idk] || fora[idk])) continue;
        manter[idk] = true;
        out.passam += passa[idk] ? 1 : 0;
        var mae = etapaDe[idk], fl = folhaDe[idk];
        if (lk.tipo !== "etapa" && mae) { manter[mae] = true; if (!passa[mae]) contexto[mae] = true; }
        if (lk.tipo === "servico" && fl) { manter[fl] = true; if (!passa[fl]) contexto[fl] = true; }
      }
      var vis = 0;
      for (i = 0; i < L.length; i++) if (manter[idDe(L[i])]) vis++;
      out.manter = manter; out.contexto = contexto; out.fora = fora; out.visiveis = vis;
      return out;
    },

    /* o texto da faixa âmbar (USO §1.3), texto puro, sem dado do cliente */
    textoFaixa: function (res, extra) {
      if (!res || !res.ativo) return "";
      var rots = arr(res.rotulos).filter(function (x) { return !x.indisponivel; }).map(function (x) { return x.rot; });
      var t = "Filtro ligado: " + rots.join(" · ") + " — mostrando " + res.visiveis + " de " + res.total + " linha" + (res.total === 1 ? "" : "s");
      if (Object.keys(res.contexto || {}).length) t += " (as linhas em cinza aparecem só para situar)";
      t += ".";
      if (Object.keys(res.fora || {}).length) t += " " + Object.keys(res.fora).length + " linha(s) editada(s) saíram do filtro e continuam na tela até você reaplicar.";
      if (extra) t += " " + extra;
      return t;
    },

    /* a chave do memo do desenho: muda quando o CONJUNTO de linhas muda */
    chave: function (spec, busca) {
      spec = spec || {};
      return [spec.critico ? 1 : 0, spec.atrasadas ? 1 : 0, spec.naoConcluidas ? 1 : 0, spec.periodo || "tudo", spec.marcos ? 1 : 0, spec.fixadas ? 1 : 0,
        arr(spec.categorias).join(","), spec.extras || "", spec.soAchados ? "a:" + (busca && busca.texto || "") : "", Object.keys(spec.fixos || {}).sort().join(",")].join("|");
    },

    _dep: dep
  };

  global.CronoFiltro = CronoFiltro;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoFiltro;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
