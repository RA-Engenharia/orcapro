/* =====================================================================
 * mor/catalogo.js — O CATÁLOGO PARAMÉTRICO do Motor de Orçamento por Regras
 *
 * Catálogo é DADO (js/mor/catalogo-dados/*.js), este arquivo só o reúne,
 * normaliza e confere. Formato (ESPEC-MOTOR-ORCAMENTO.md §2):
 *
 *   etapa = { id, etapa:"NOME", ordem, premissas:[texto | {quando, texto}],
 *             geometria:"cobertura"?   (grandezas derivadas de geometria.js),
 *             usa:[idsDePerguntasDeOutraEtapa],
 *             vars:[[nome, expressão], ...]   (em ordem; cada uma enxerga as anteriores),
 *             perguntas:[ pergunta ], itens:[ item ] }
 *   pergunta = { id, txt, op:[...] | num:true | bool:true, quando?,
 *                padrao | padraoExpr | padraoDe+mapa, rotulos?, min?, max? }
 *   item = { chave, quando?, qtd:"expressão" | null,
 *            cod:"chave na tabela de códigos" | codigos:["código",...],
 *            desc?, un? (obrigatórios sem código), formula:"texto da conta",
 *            intencao:"texto de busca (fallback do casador)" }
 *
 * ⚠ `qtd: null` = a quantidade depende de projeto: o item aparece como PENDENTE,
 *   nunca com número. Item sem `codigos` também é pendente (só descrição).
 * ⚠ Toda expressão (`quando`, `qtd`, `vars`, `padraoExpr`) passa pelo avaliador
 *   seguro (js/mor/regras.js); `validar()` abre todas, e tools/test-mor-catalogo.js
 *   reprova o catálogo se uma só estiver quebrada ou se um código sumir da base.
 * Os dados são lidos de `global.MorDados` (navegador: os <script> das etapas vêm
 * ANTES do primeiro uso) ou, em Node, carregados por require.
 * ===================================================================== */
(function (global) {
  "use strict";

  var R = global.MorRegras || (typeof require === "function" ? require("./regras.js") : null);
  var _pronto = null;

  function semAcento(s) {
    var t = String(s == null ? "" : s);
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return t.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").toUpperCase();
  }

  function dados() {
    var D = global.MorDados;
    if ((!D || !D.etapas || !D.codigos || !D.tipologias) && typeof require === "function") {
      ["codigos", "codigos-f3", "preliminares", "cobertura", "residencial", "extensoes", "etapas-estrutura", "etapas-acabamento", "etapas-instalacoes", "etapas-tipologias", "tipologias"].forEach(function (n) {
        try { require("./catalogo-dados/" + n + ".js"); } catch (e) { /* o teste acusa */ }
      });
      D = global.MorDados;
    }
    return D || {};
  }

  /* Perguntas da OBRA (valem para o orçamento inteiro; guardadas em orc.mor.params).
     Os nomes são os do orçamento paramétrico antigo (OrcParam.normalizar). */
  var PERGUNTAS_OBRA = [
    { id: "area", txt: "Área construída (m²)", num: true, obrigatoria: true, min: 1, max: 20000 },
    { id: "pavimentos", txt: "Pavimentos", num: true, padrao: 1, min: 1, max: 4 },
    { id: "peDireito", txt: "Pé-direito (m)", num: true, padrao: 2.8, min: 2.3, max: 6 },
    { id: "padrao", txt: "Padrão de acabamento", op: ["popular", "normal", "alto"], rotulos: { popular: "Popular", normal: "Normal", alto: "Alto" }, padrao: "normal" },
    { id: "banheiros", txt: "Banheiros (vazio = estimar)", num: true, opcional: true, min: 1, max: 6 },
    { id: "quartos", txt: "Quartos (vazio = estimar)", num: true, opcional: true, min: 0, max: 6 },
    { id: "perimetro", txt: "Perímetro externo (m) (vazio = estimar)", num: true, opcional: true, min: 1, max: 2000 }
  ];

  /* Extensões (F3): o que se ACRESCENTA a uma etapa que já existe (a do orçamento antigo)
     sem mexer no arquivo dela, para a paridade com OrcParam continuar intacta:
       { id, perguntas?, vars?, premissas?, usa?, itens?,
         ajustes?:{ chaveDoItem:{ campo:valor } },          (ex.: quando, sugestao)
         ajustesPerguntas?:{ idDaPergunta:{ campo:valor } } }
     Item novo que não existe no orçamento antigo leva `quando:"modo!='legado'"`. */
  var _errosExt = [];
  function mesclar(e, x) {
    var m = {}, k;
    for (k in e) if (Object.prototype.hasOwnProperty.call(e, k)) m[k] = e[k];
    m.perguntas = (e.perguntas || []).map(function (q) { var c = {}, z; for (z in q) if (Object.prototype.hasOwnProperty.call(q, z)) c[z] = q[z]; return c; });
    m.itens = (e.itens || []).map(function (it) { var c = {}, z; for (z in it) if (Object.prototype.hasOwnProperty.call(it, z)) c[z] = it[z]; return c; });
    m.vars = (e.vars || []).slice(); m.premissas = (e.premissas || []).slice(); m.usa = (e.usa || []).slice();
    (x.perguntas || []).forEach(function (q) { m.perguntas.push(q); });
    (x.vars || []).forEach(function (v) { m.vars.push(v); });
    (x.premissas || []).forEach(function (p) { m.premissas.push(p); });
    (x.usa || []).forEach(function (u) { if (m.usa.indexOf(u) < 0) m.usa.push(u); });
    var aj = x.ajustes || {}, ch;
    for (ch in aj) if (Object.prototype.hasOwnProperty.call(aj, ch)) {
      var alvo = null; m.itens.forEach(function (it) { if (it.chave === ch) alvo = it; });
      if (!alvo) { _errosExt.push("extensão de «" + e.id + "»: o item «" + ch + "» não existe"); continue; }
      for (var f in aj[ch]) if (Object.prototype.hasOwnProperty.call(aj[ch], f)) alvo[f] = aj[ch][f];
    }
    var ap = x.ajustesPerguntas || {}, pid;
    for (pid in ap) if (Object.prototype.hasOwnProperty.call(ap, pid)) {
      var qa = null; m.perguntas.forEach(function (q) { if (q.id === pid) qa = q; });
      if (!qa) { _errosExt.push("extensão de «" + e.id + "»: a pergunta «" + pid + "» não existe"); continue; }
      for (var g in ap[pid]) if (Object.prototype.hasOwnProperty.call(ap[pid], g)) qa[g] = ap[pid][g];
    }
    (x.itens || []).forEach(function (it) { m.itens.push(it); });
    return m;
  }

  function normalizarEtapa(e) {
    var T = dados().codigos.TUDO;
    var out = {
      id: e.id, etapa: e.etapa, ordem: e.ordem, novo: !!e.novo, geometria: e.geometria || "", usa: (e.usa || []).slice(),
      premissas: (e.premissas || []).map(function (p) { return typeof p === "string" ? { texto: p } : { quando: p.quando || "", texto: p.texto }; }),
      vars: (e.vars || []).map(function (v) { return [v[0], v[1]]; }),
      perguntas: (e.perguntas || []).map(function (q) { var c = {}; for (var k in q) if (Object.prototype.hasOwnProperty.call(q, k)) c[k] = q[k]; return c; }),
      itens: (e.itens || []).map(function (it) {
        var c = {}, k;
        for (k in it) if (Object.prototype.hasOwnProperty.call(it, k)) c[k] = it[k];
        var codigos = it.codigos ? it.codigos.slice() : (it.cod && T[it.cod] ? [T[it.cod][0]] : []);
        c.codigos = codigos;
        if (it.cod && T[it.cod]) { c.desc = it.desc || T[it.cod][1]; c.un = it.un || T[it.cod][2]; }
        c.qtd = it.qtd === undefined ? null : it.qtd;
        c.quando = it.quando || "";
        c.intencao = it.intencao || String(c.desc || "").toLowerCase();
        c.pendente = !codigos.length;
        return c;
      })
    };
    return out;
  }

  function montar() {
    if (_pronto) return _pronto;
    var D = dados();
    var ext = {}; _errosExt = [];
    (D.extensoes || []).forEach(function (x) { (ext[x.id] = ext[x.id] || []).push(x); });
    var etapas = (D.etapas || []).map(function (e) {
      var m = e;
      (ext[e.id] || []).forEach(function (x) { m = mesclar(m, x); });
      return normalizarEtapa(m);
    }).sort(function (a, b) { return a.ordem - b.ordem; });
    (D.extensoes || []).forEach(function (x) { if (!(D.etapas || []).some(function (e) { return e.id === x.id; })) _errosExt.push("extensão para a etapa «" + x.id + "», que não existe"); });
    var porId = {}, porNome = {}, perguntas = {}, ordemPerg = [];
    etapas.forEach(function (e) {
      porId[e.id] = e; porNome[semAcento(e.etapa)] = e;
      e.perguntas.forEach(function (q) { perguntas[q.id] = q; ordemPerg.push(q.id); });
    });
    _pronto = { etapas: etapas, porId: porId, porNome: porNome, perguntas: perguntas, ordemPerg: ordemPerg, tipologias: (D.tipologias || []).slice() };
    return _pronto;
  }

  var MorCatalogo = {
    PERGUNTAS_OBRA: PERGUNTAS_OBRA,
    semAcento: semAcento,
    /* descarta o cache (teste que altera dado em memória) */
    _reiniciar: function () { _pronto = null; },

    etapas: function () { return montar().etapas.slice(); },
    etapa: function (id) { return montar().porId[id] || null; },
    /* etapa do catálogo pelo NOME que está no orçamento (sem acento, caixa alta) */
    etapaPorNome: function (nome) { return montar().porNome[semAcento(nome)] || null; },
    pergunta: function (id) { return montar().perguntas[id] || null; },
    /* ids das perguntas, na ordem em que os padrões podem depender uns dos outros */
    ordemPerguntas: function () { return montar().ordemPerg.slice(); },
    tipologias: function () { return montar().tipologias.map(function (t) { return t; }); },
    tipologia: function (id) { var l = montar().tipologias; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; },
    codigos: function () { return dados().codigos.TUDO; },

    /* Confere o catálogo inteiro SEM base de preço: toda expressão abre, chave única
       por etapa, item sem código tem descrição e unidade, código existe na tabela,
       pergunta tem tipo. Devolve { ok, erros:[texto] } — o teste exige ok. */
    validar: function () {
      var c = montar(), erros = _errosExt.slice(), T = dados().codigos.TUDO;
      function expr(onde, s) {
        if (s === "" || s == null) return;
        var v = R.validar(s);
        if (!v.ok) erros.push(onde + ": " + v.erro);
      }
      c.etapas.forEach(function (e) {
        var vistos = {};
        e.premissas.forEach(function (p, i) { if (p.quando) expr(e.id + ".premissas[" + i + "].quando", p.quando); });
        e.vars.forEach(function (v) { expr(e.id + ".vars." + v[0], v[1]); });
        e.perguntas.forEach(function (q) {
          var tipo = (q.op ? 1 : 0) + (q.num ? 1 : 0) + (q.bool ? 1 : 0);
          if (tipo !== 1) erros.push(e.id + "." + q.id + ": a pergunta precisa de exatamente um tipo (op, num ou bool)");
          expr(e.id + "." + q.id + ".quando", q.quando);
          expr(e.id + "." + q.id + ".padraoExpr", q.padraoExpr);
          if (q.padraoDe && !q.mapa) erros.push(e.id + "." + q.id + ": padraoDe exige mapa");
          if (!(q.padrao !== undefined || q.padraoExpr || q.padraoDe)) erros.push(e.id + "." + q.id + ": a pergunta não tem padrão");
        });
        e.itens.forEach(function (it) {
          var onde = e.id + "." + it.chave;
          if (!it.chave) erros.push(e.id + ": item sem chave");
          if (vistos[it.chave]) erros.push(onde + ": chave repetida"); vistos[it.chave] = 1;
          expr(onde + ".quando", it.quando);
          if (it.qtd !== null) expr(onde + ".qtd", it.qtd);
          if (it.cod && !T[it.cod]) erros.push(onde + ": cod «" + it.cod + "» não está na tabela de códigos");
          if (!it.desc) erros.push(onde + ": sem descrição");
          if (!it.un) erros.push(onde + ": sem unidade");
          if (!it.formula) erros.push(onde + ": sem a conta escrita (formula)");
        });
      });
      c.tipologias.forEach(function (t) {
        if (t.etapas[0] !== "SERVIÇOS PRELIMINARES") erros.push("tipologia " + t.id + ": a primeira etapa deve ser SERVIÇOS PRELIMINARES");
        if (t.base !== "residencial" && t.base !== "comercial") erros.push("tipologia " + t.id + ": base inválida");
      });
      return { ok: !erros.length, erros: erros };
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MorCatalogo;
  global.MorCatalogo = MorCatalogo;
})(typeof window !== "undefined" ? window : globalThis);
