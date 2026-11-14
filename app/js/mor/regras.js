/* =====================================================================
 * mor/regras.js — AVALIADOR DE FÓRMULAS SEGURO do Motor de Orçamento por Regras
 *
 * O catálogo do MOR é DADO (js/mor/catalogo-dados/*.js): cada item diz "quando"
 * entra e "qtd" quanto vale, em texto. Este arquivo é o único que transforma
 * esse texto em número — e faz isso SEM `eval`, SEM `new Function`: um parser
 * próprio (descida recursiva) que só conhece o que está escrito abaixo.
 * ⚠ Por que não eval: o catálogo vem de arquivo, de memória da empresa e, nas
 *   próximas fases, de documento do cliente. Texto de fora nunca pode virar
 *   código executável. O que o parser não reconhece é ERRO, nunca "tenta".
 *
 * GRAMÁTICA (do que liga menos ao que liga mais)
 *   ou        a || b
 *   e         a && b
 *   igual     a == b   a != b            (estrito: 1 == "1" é falso)
 *   relação   <  <=  >  >=
 *   soma      +  -
 *   produto   *  /  %
 *   unário    !  -  +
 *   átomo     número | 'texto' | "texto" | true | false | variável | f(a, b) | (expr)
 * Variáveis: nomes com ponto são permitidos (`cob.tipo`) e buscados PELO NOME
 * INTEIRO no contexto. Funções liberadas: sqrt max min ceil floor round abs cos atan
 * e se(condição, então, senão).
 *
 * ⚠ ERRO CLARO, NUNCA NÚMERO MUDO: variável que não existe no contexto,
 *   divisão por zero, função fora da lista e resultado que não é número finito
 *   viram exceção `MorRegrasErro` com a posição. Um item com fórmula quebrada é
 *   mostrado como "fórmula inválida" — não entra com quantidade 0 nem NaN.
 * Motor puro, ES5, Node-testável: tools/test-mor-regras.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  var FUNCOES = {
    sqrt: { n: 1, f: Math.sqrt }, abs: { n: 1, f: Math.abs },
    ceil: { n: 1, f: Math.ceil }, floor: { n: 1, f: Math.floor },
    round: { n: 1, f: Math.round }, cos: { n: 1, f: Math.cos }, atan: { n: 1, f: Math.atan },
    max: { n: -1, f: Math.max }, min: { n: -1, f: Math.min },
    /* se(condição, então, senão): só avalia o ramo escolhido (o outro pode nem existir no contexto) */
    se: { n: 3, f: null }
  };

  function MorRegrasErro(msg, expr, pos) {
    var e = new Error(msg + (expr != null ? "  [expressão: " + expr + (pos != null && pos >= 0 ? " — posição " + pos : "") + "]" : ""));
    e.name = "MorRegrasErro"; e.posicao = pos == null ? -1 : pos; e.expressao = expr;
    return e;
  }

  /* ---------------- léxico ---------------- */
  function tokenizar(src) {
    var t = [], i = 0, n = src.length, c, m;
    while (i < n) {
      c = src.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src.charAt(i + 1)))) {
        m = /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
        t.push({ k: "num", v: parseFloat(m[0]), p: i }); i += m[0].length; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        m = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i));
        t.push({ k: "id", v: m[0], p: i }); i += m[0].length; continue;
      }
      if (c === "'" || c === '"') {
        var j = i + 1, s = "";
        while (j < n && src.charAt(j) !== c) s += src.charAt(j++);
        if (j >= n) throw MorRegrasErro("Texto sem aspas de fechamento", src, i);
        t.push({ k: "str", v: s, p: i }); i = j + 1; continue;
      }
      var d = src.substr(i, 2);
      if (d === "&&" || d === "||" || d === "==" || d === "!=" || d === "<=" || d === ">=") { t.push({ k: "op", v: d, p: i }); i += 2; continue; }
      if ("+-*/%<>!(),".indexOf(c) > -1) { t.push({ k: "op", v: c, p: i }); i++; continue; }
      if (c === "=") throw MorRegrasErro("Use == para comparar (o = sozinho não é aceito)", src, i);
      if (c === "&" || c === "|") throw MorRegrasErro("Use && ou || (símbolo único não é aceito)", src, i);
      throw MorRegrasErro("Caractere não permitido «" + c + "»", src, i);
    }
    t.push({ k: "fim", v: "", p: n });
    return t;
  }

  /* ---------------- sintaxe → árvore ---------------- */
  function parse(src) {
    var tk = tokenizar(src), i = 0, vars = [];
    function ver() { return tk[i]; }
    function op(v) { return tk[i].k === "op" && tk[i].v === v; }
    function come(v) {
      if (!op(v)) throw MorRegrasErro("Esperava «" + v + "» e achei «" + (tk[i].v === "" ? "fim da expressão" : tk[i].v) + "»", src, tk[i].p);
      i++;
    }
    function ou() { var a = e(); while (op("||")) { i++; a = { t: "||", a: a, b: e() }; } return a; }
    function e() { var a = igual(); while (op("&&")) { i++; a = { t: "&&", a: a, b: igual() }; } return a; }
    function igual() { var a = rel(); while (op("==") || op("!=")) { var o = tk[i++].v; a = { t: o, a: a, b: rel() }; } return a; }
    function rel() { var a = soma(); while (op("<") || op("<=") || op(">") || op(">=")) { var p = tk[i].p, o = tk[i++].v; a = { t: o, a: a, b: soma(), p: p }; } return a; }
    function soma() { var a = prod(); while (op("+") || op("-")) { var p = tk[i].p, o = tk[i++].v; a = { t: o, a: a, b: prod(), p: p }; } return a; }
    function prod() { var a = un(); while (op("*") || op("/") || op("%")) { var p = tk[i].p, o = tk[i++].v; a = { t: o, a: a, b: un(), p: p }; } return a; }
    function un() {
      var p = tk[i].p;
      if (op("!")) { i++; return { t: "!", a: un() }; }
      if (op("-")) { i++; return { t: "neg", a: un(), p: p }; }
      if (op("+")) { i++; return { t: "pos", a: un(), p: p }; }
      return atomo();
    }
    function atomo() {
      var k = ver();
      if (k.k === "num") { i++; return { t: "lit", v: k.v }; }
      if (k.k === "str") { i++; return { t: "lit", v: k.v }; }
      if (k.k === "id") {
        i++;
        if (k.v === "true") return { t: "lit", v: true };
        if (k.v === "false") return { t: "lit", v: false };
        if (op("(")) {
          if (!Object.prototype.hasOwnProperty.call(FUNCOES, k.v)) throw MorRegrasErro("Função «" + k.v + "» não existe (permitidas: " + Object.keys(FUNCOES).join(", ") + ")", src, k.p);
          i++;
          var args = [];
          if (!op(")")) { args.push(ou()); while (op(",")) { i++; args.push(ou()); } }
          come(")");
          var f = FUNCOES[k.v];
          if (f.n >= 0 && args.length !== f.n) throw MorRegrasErro("Função «" + k.v + "» pede " + f.n + " argumento(s) e recebeu " + args.length, src, k.p);
          if (f.n < 0 && !args.length) throw MorRegrasErro("Função «" + k.v + "» pede ao menos 1 argumento", src, k.p);
          return { t: "fn", n: k.v, args: args, p: k.p };
        }
        if (vars.indexOf(k.v) < 0) vars.push(k.v);
        return { t: "var", n: k.v, p: k.p };
      }
      if (op("(")) { i++; var x = ou(); come(")"); return x; }
      throw MorRegrasErro(k.k === "fim" ? "Expressão incompleta" : "Não esperava «" + k.v + "»", src, k.p);
    }
    if (tk.length === 1) throw MorRegrasErro("Expressão vazia", src, 0);
    var raiz = ou();
    if (ver().k !== "fim") throw MorRegrasErro("Sobrou «" + ver().v + "» depois do fim da expressão", src, ver().p);
    return { raiz: raiz, vars: vars };
  }

  /* ---------------- avaliação ---------------- */
  function num(v, src, pos, rotulo) {
    if (typeof v !== "number") throw MorRegrasErro("«" + rotulo + "» exige número, mas recebeu " + (typeof v === "boolean" ? "verdadeiro/falso" : "texto"), src, pos);
    return v;
  }
  function ev(n, ctx, src) {
    var a, b;
    switch (n.t) {
      case "lit": return n.v;
      case "var":
        if (!ctx || !Object.prototype.hasOwnProperty.call(ctx, n.n) || ctx[n.n] === undefined || ctx[n.n] === null) throw MorRegrasErro("Variável «" + n.n + "» não está definida (responda a pergunta ou informe o parâmetro)", src, n.p);
        return ctx[n.n];
      case "!": return !ev(n.a, ctx, src);
      case "neg": return -num(ev(n.a, ctx, src), src, n.p, "-");
      case "pos": return num(ev(n.a, ctx, src), src, n.p, "+");
      case "||": return !!ev(n.a, ctx, src) || !!ev(n.b, ctx, src);
      case "&&": return !!ev(n.a, ctx, src) && !!ev(n.b, ctx, src);
      case "==": return ev(n.a, ctx, src) === ev(n.b, ctx, src);
      case "!=": return ev(n.a, ctx, src) !== ev(n.b, ctx, src);
      case "fn":
        if (n.n === "se") return ev(n.args[0], ctx, src) ? ev(n.args[1], ctx, src) : ev(n.args[2], ctx, src);
        var xs = n.args.map(function (x) { return num(ev(x, ctx, src), src, n.p, n.n + "()"); });
        return FUNCOES[n.n].f.apply(null, xs);
    }
    a = ev(n.a, ctx, src); b = ev(n.b, ctx, src);
    if (n.t === "+" && (typeof a === "string" || typeof b === "string")) throw MorRegrasErro("Não some texto com número; use só números em contas", src, n.p);
    a = num(a, src, n.p, n.t); b = num(b, src, n.p, n.t);
    switch (n.t) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": if (b === 0) throw MorRegrasErro("Divisão por zero", src, n.p); return a / b;
      case "%": if (b === 0) throw MorRegrasErro("Divisão por zero", src, n.p); return a % b;
      case "<": return a < b;
      case "<=": return a <= b;
      case ">": return a > b;
      case ">=": return a >= b;
    }
    throw MorRegrasErro("Operador desconhecido «" + n.t + "»", src, n.p);
  }

  var CACHE = {}, NCACHE = 0;
  function compilar(expr) {
    var src = String(expr == null ? "" : expr);
    if (Object.prototype.hasOwnProperty.call(CACHE, src)) return CACHE[src];
    var p = parse(src);
    var c = {
      fonte: src, variaveis: p.vars,
      avaliar: function (ctx) {
        var v = ev(p.raiz, ctx || {}, src);
        if (typeof v === "number" && !isFinite(v)) throw MorRegrasErro("O resultado não é um número válido", src, -1);
        return v;
      }
    };
    if (NCACHE > 4000) { CACHE = {}; NCACHE = 0; }   /* teto: catálogo real tem centenas, não milhares */
    CACHE[src] = c; NCACHE++;
    return c;
  }

  var MorRegras = {
    MorRegrasErro: MorRegrasErro,
    FUNCOES: Object.keys(FUNCOES),
    compilar: compilar,
    /* avalia ou lança MorRegrasErro */
    avaliar: function (expr, ctx) { return compilar(expr).avaliar(ctx); },
    /* nunca lança: { ok, valor, erro } — para a tela e para o relatório de pendências */
    tentar: function (expr, ctx) {
      try { return { ok: true, valor: compilar(expr).avaliar(ctx), erro: "" }; }
      catch (e) { return { ok: false, valor: null, erro: String((e && e.message) || e) }; }
    },
    /* só a sintaxe: { ok, erro, variaveis } */
    validar: function (expr) {
      try { var c = compilar(expr); return { ok: true, erro: "", variaveis: c.variaveis.slice() }; }
      catch (e) { return { ok: false, erro: String((e && e.message) || e), variaveis: [] }; }
    },
    variaveis: function (expr) { return compilar(expr).variaveis.slice(); }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MorRegras;
  global.MorRegras = MorRegras;
})(typeof window !== "undefined" ? window : globalThis);
