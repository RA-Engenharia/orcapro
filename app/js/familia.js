/* =====================================================================
 * familia.js — FAMÍLIA PARAMÉTRICA do OrçaPRO (motor puro, Node-testável)
 *
 * O equivalente da família do Revit (.rfa), criado DENTRO do OrçaPRO e
 * gravado como `.opfam` (js/opformato.js). Pedido do Rogério, 07/10/2026:
 * "cria os parâmetros para a gente conseguir criar a família aí dentro,
 * parametrizado". Ver PLANO-BIM-FAMILIAS-FORMATOS.md.
 *
 * FAMÍLIA = {
 *   id, nome, categoria, descricao, hospedagem: 'livre' | 'parede',
 *   parametros: [{ nome, tipoDado, escopo:'tipo'|'instancia', valor, formula, grupo, descricao }],
 *   tipos:      [{ id, nome, valores: { <param>: valor } }],
 *   solidos:    [{ id, nome, forma, ...medidas em FÓRMULA, material, visivel }],
 *   abertura:   { largura, altura, peitoril }      (fórmulas; só hospedada)
 *   quantitativo: { unidade, quantidade (fórmula), codigo, fonte, descricao }
 * }
 * SISTEMA LOCAL da família (metros): origem no ponto de inserção, no PISO do
 * nível; X = ao longo da parede (largura), Y = para cima, Z = para fora da
 * parede (profundidade). Hospedada: a origem é o meio do vão, no eixo da parede.
 *
 * FÓRMULA (avaliador próprio — NUNCA eval): números com vírgula ou ponto,
 * + − * / ^, ( ), < > <= >= = <>, e/ou/nao, e as funções se(c; a; b), min,
 * max, arred(x; casas), raiz, abs, teto, piso, sen/cos/tan (graus), pi().
 * Argumentos separados por ";" (como no Excel em português). Os outros
 * parâmetros entram pelo NOME. Ciclo (A usa B, B usa A) é recusado.
 * ===================================================================== */
(function (global) {
  "use strict";

  var TIPOS_DADO = {
    comprimento: "Comprimento (m)", area: "Área (m²)", volume: "Volume (m³)", angulo: "Ângulo (graus)",
    numero: "Número", inteiro: "Inteiro", simnao: "Sim/não", texto: "Texto", material: "Material"
  };
  var CATEGORIAS = {
    porta: "Porta", janela: "Janela", pilar: "Pilar", viga: "Viga", mobiliario: "Mobiliário",
    equipamento: "Equipamento", loucas: "Louças e metais", estrutural: "Estrutural", generico: "Genérico",
    /* F1 (orçamento pelo modelo): as famílias orçáveis de alvenaria, laje e piso */
    parede: "Parede", laje: "Laje", piso: "Piso"
  };
  var FORMAS = { caixa: "Caixa", cilindro: "Cilindro", extrusao: "Extrusão de contorno" };
  var UNIDADES_QTO = { un: "unidade", m: "metro", m2: "m²", m3: "m³", kg: "kg" };

  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function nomeValido(n) { return /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*$/.test(txt(n)); }
  function chave(n) { return txt(n).toLowerCase(); }

  /* ------------------------------------------------------------ FÓRMULA */
  var FUNCOES = {
    se: { n: 3 }, min: { n: -1 }, max: { n: -1 }, arred: { n: -1 }, raiz: { n: 1 }, abs: { n: 1 },
    teto: { n: 1 }, piso: { n: 1 }, sen: { n: 1 }, cos: { n: 1 }, tan: { n: 1 }, pi: { n: 0 }
  };
  function tokens(s) {
    var out = [], i = 0, t = txt(s);
    while (i < t.length) {
      var c = t.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || ((c === "," || c === ".") && /[0-9]/.test(t.charAt(i + 1)))) {
        var j = i, viuSep = false;
        while (j < t.length && (/[0-9]/.test(t.charAt(j)) || (!viuSep && (t.charAt(j) === "," || t.charAt(j) === ".") && /[0-9]/.test(t.charAt(j + 1))))) {
          if (t.charAt(j) === "," || t.charAt(j) === ".") viuSep = true; j++;
        }
        out.push({ t: "num", v: parseFloat(t.slice(i, j).replace(",", ".")) }); i = j; continue;
      }
      if (/[A-Za-zÀ-ÿ_]/.test(c)) {
        var k = i; while (k < t.length && /[A-Za-zÀ-ÿ0-9_]/.test(t.charAt(k))) k++;
        out.push({ t: "id", v: t.slice(i, k) }); i = k; continue;
      }
      var dois = t.substr(i, 2);
      if (dois === "<=" || dois === ">=" || dois === "<>") { out.push({ t: "op", v: dois }); i += 2; continue; }
      if ("+-*/^()<>=;".indexOf(c) >= 0) { out.push({ t: c === "(" || c === ")" || c === ";" ? c : "op", v: c }); i++; continue; }
      throw new Error("caractere inválido \"" + c + "\" na fórmula");
    }
    return out;
  }
  /* descida recursiva: ou → e → comparação → soma → produto → potência → unário → primário */
  function analisar(s) {
    var tk = tokens(s), p = 0;
    if (!tk.length) throw new Error("fórmula vazia");
    function ver() { return tk[p]; }
    function comer(tipo, v) { var x = tk[p]; if (!x || x.t !== tipo || (v != null && chave(x.v) !== v)) throw new Error("esperava " + (v || tipo) + (x ? " e veio \"" + x.v + "\"" : " no fim")); p++; return x; }
    function ou() { var a = e(); while (ver() && ver().t === "id" && chave(ver().v) === "ou") { p++; a = { k: "ou", a: a, b: e() }; } return a; }
    function e() { var a = cmp(); while (ver() && ver().t === "id" && chave(ver().v) === "e") { p++; a = { k: "e", a: a, b: cmp() }; } return a; }
    function cmp() {
      var a = soma(), x = ver();
      if (x && x.t === "op" && ["<", ">", "<=", ">=", "=", "<>"].indexOf(x.v) >= 0) { p++; return { k: "cmp", op: x.v, a: a, b: soma() }; }
      return a;
    }
    function soma() { var a = prod(); while (ver() && ver().t === "op" && (ver().v === "+" || ver().v === "-")) { var o = tk[p++].v; a = { k: "bin", op: o, a: a, b: prod() }; } return a; }
    function prod() { var a = pot(); while (ver() && ver().t === "op" && (ver().v === "*" || ver().v === "/")) { var o = tk[p++].v; a = { k: "bin", op: o, a: a, b: pot() }; } return a; }
    function pot() { var a = un(); if (ver() && ver().t === "op" && ver().v === "^") { p++; return { k: "bin", op: "^", a: a, b: pot() }; } return a; }
    function un() {
      var x = ver();
      if (x && x.t === "op" && x.v === "-") { p++; return { k: "neg", a: un() }; }
      if (x && x.t === "op" && x.v === "+") { p++; return un(); }
      if (x && x.t === "id" && chave(x.v) === "nao") { p++; return { k: "nao", a: un() }; }
      return prim();
    }
    function prim() {
      var x = ver(); if (!x) throw new Error("fórmula incompleta");
      if (x.t === "num") { p++; return { k: "num", v: x.v }; }
      if (x.t === "(") { p++; var d = ou(); comer(")"); return d; }
      if (x.t === "id") {
        p++;
        var nm = chave(x.v);
        if (nm === "sim" || nm === "verdadeiro") return { k: "num", v: 1 };
        if (nm === "nao" || nm === "falso") return { k: "num", v: 0 };
        if (ver() && ver().t === "(") {
          if (!FUNCOES[nm]) throw new Error("função desconhecida \"" + x.v + "\"");
          p++; var args = [];
          if (!(ver() && ver().t === ")")) { args.push(ou()); while (ver() && ver().t === ";") { p++; args.push(ou()); } }
          comer(")");
          var f = FUNCOES[nm];
          if (f.n >= 0 && args.length !== f.n) throw new Error(x.v + "() precisa de " + f.n + " argumento(s); veio " + args.length);
          if (f.n < 0 && !args.length) throw new Error(x.v + "() precisa de argumento");
          return { k: "fn", f: nm, args: args };
        }
        return { k: "ref", nome: x.v };
      }
      throw new Error("não esperava \"" + x.v + "\"");
    }
    var r = ou();
    if (p < tk.length) throw new Error("sobrou \"" + tk[p].v + "\" no fim da fórmula");
    return r;
  }
  function refs(ast, out) {
    out = out || {};
    if (!ast) return out;
    if (ast.k === "ref") out[chave(ast.nome)] = ast.nome;
    ["a", "b"].forEach(function (k) { if (ast[k]) refs(ast[k], out); });
    arr(ast.args).forEach(function (x) { refs(x, out); });
    return out;
  }
  function calc(ast, env) {
    switch (ast.k) {
      case "num": return ast.v;
      case "ref": {
        var k = chave(ast.nome);
        if (!Object.prototype.hasOwnProperty.call(env, k)) throw new Error("parâmetro \"" + ast.nome + "\" não existe");
        var v = env[k]; if (typeof v === "boolean") return v ? 1 : 0;
        if (typeof v !== "number") throw new Error("\"" + ast.nome + "\" não é número");
        return v;
      }
      case "neg": return -calc(ast.a, env);
      case "nao": return calc(ast.a, env) ? 0 : 1;
      case "e": return (calc(ast.a, env) && calc(ast.b, env)) ? 1 : 0;
      case "ou": return (calc(ast.a, env) || calc(ast.b, env)) ? 1 : 0;
      case "cmp": {
        var a = calc(ast.a, env), b = calc(ast.b, env), eps = 1e-9;
        switch (ast.op) { case "<": return a < b - eps ? 1 : 0; case ">": return a > b + eps ? 1 : 0; case "<=": return a <= b + eps ? 1 : 0;
          case ">=": return a >= b - eps ? 1 : 0; case "=": return Math.abs(a - b) <= eps ? 1 : 0; default: return Math.abs(a - b) > eps ? 1 : 0; }
      }
      case "bin": {
        var x = calc(ast.a, env), y = calc(ast.b, env);
        if (ast.op === "+") return x + y; if (ast.op === "-") return x - y; if (ast.op === "*") return x * y;
        if (ast.op === "/") { if (y === 0) throw new Error("divisão por zero"); return x / y; }
        return Math.pow(x, y);
      }
      case "fn": {
        if (ast.f === "se") return calc(ast.args[0], env) ? calc(ast.args[1], env) : calc(ast.args[2], env);
        var v2 = ast.args.map(function (q) { return calc(q, env); });
        switch (ast.f) {
          case "min": return Math.min.apply(null, v2); case "max": return Math.max.apply(null, v2);
          case "arred": { var c = v2.length > 1 ? Math.round(v2[1]) : 0, m = Math.pow(10, c); return Math.round(v2[0] * m) / m; }
          case "raiz": if (v2[0] < 0) throw new Error("raiz de número negativo"); return Math.sqrt(v2[0]);
          case "abs": return Math.abs(v2[0]); case "teto": return Math.ceil(v2[0]); case "piso": return Math.floor(v2[0]);
          case "sen": return Math.sin(v2[0] * Math.PI / 180); case "cos": return Math.cos(v2[0] * Math.PI / 180); case "tan": return Math.tan(v2[0] * Math.PI / 180);
          case "pi": return Math.PI;
        }
      }
    }
    throw new Error("expressão inválida");
  }
  /* avalia uma fórmula solta contra um ambiente {nome: valor} — p/ tela e testes */
  function formula(s, env) {
    var e2 = {}; Object.keys(env || {}).forEach(function (k) { e2[chave(k)] = env[k]; });
    var v = calc(analisar(s), e2);
    if (!isFinite(v)) throw new Error("o resultado não é um número finito");
    return v;
  }

  /* ---------------------------------------------------------- VALIDAÇÃO */
  function validar(fam) {
    var erros = [], avisos = [];
    if (!fam || typeof fam !== "object") return { ok: false, erros: ["família vazia"], avisos: [] };
    if (!txt(fam.nome).trim()) erros.push("a família precisa de nome");
    if (fam.categoria && !CATEGORIAS[fam.categoria]) avisos.push("categoria \"" + fam.categoria + "\" desconhecida — tratada como genérico");
    var nomes = {};
    arr(fam.parametros).forEach(function (p, i) {
      if (!nomeValido(p.nome)) erros.push("parâmetro " + (i + 1) + ": nome \"" + txt(p.nome) + "\" inválido (letras, números e _; sem espaço)");
      else if (nomes[chave(p.nome)]) erros.push("parâmetro \"" + p.nome + "\" repetido");
      else if (FUNCOES[chave(p.nome)] || ["e", "ou", "nao", "sim", "verdadeiro", "falso"].indexOf(chave(p.nome)) >= 0) erros.push("\"" + p.nome + "\" é palavra reservada da fórmula");
      nomes[chave(p.nome)] = p;
      if (p.tipoDado && !TIPOS_DADO[p.tipoDado]) erros.push("parâmetro \"" + p.nome + "\": tipo de dado \"" + p.tipoDado + "\" desconhecido");
      if (p.escopo && p.escopo !== "tipo" && p.escopo !== "instancia") erros.push("parâmetro \"" + p.nome + "\": escopo deve ser tipo ou instância");
      if (p.formula) { try { analisar(p.formula); } catch (e) { erros.push("fórmula de \"" + p.nome + "\": " + e.message); } }
    });
    var ordem = ordemCalculo(fam);
    if (ordem.ciclo) erros.push("as fórmulas dependem umas das outras em círculo: " + ordem.ciclo.join(" → "));
    arr(fam.parametros).forEach(function (p) {
      if (!p.formula) return;
      try { Object.keys(refs(analisar(p.formula))).forEach(function (r) { if (!nomes[r]) erros.push("fórmula de \"" + p.nome + "\" usa \"" + r + "\", que não existe"); }); } catch (e) {}
    });
    var ids = {};
    arr(fam.tipos).forEach(function (t) {
      if (!txt(t.nome).trim()) erros.push("um tipo está sem nome");
      if (ids[t.id]) erros.push("tipo \"" + t.nome + "\" com id repetido"); ids[t.id] = 1;
      Object.keys(t.valores || {}).forEach(function (k) {
        var p = nomes[chave(k)];
        if (!p) erros.push("tipo \"" + t.nome + "\" dá valor a \"" + k + "\", que não existe");
        else if (p.formula) avisos.push("tipo \"" + t.nome + "\": \"" + k + "\" tem fórmula — o valor do tipo é ignorado");
      });
    });
    if (!arr(fam.tipos).length) avisos.push("a família não tem tipo — será criado o tipo \"Padrão\"");
    arr(fam.solidos).forEach(function (s, i) {
      if (!FORMAS[s.forma]) { erros.push("sólido " + (i + 1) + ": forma \"" + txt(s.forma) + "\" desconhecida"); return; }
      camposDoSolido(s).forEach(function (c) {
        if (s[c] == null || s[c] === "") return;
        try { Object.keys(refs(analisar(String(s[c])))).forEach(function (r) { if (!nomes[r]) erros.push("sólido \"" + (s.nome || i + 1) + "\", " + c + ": usa \"" + r + "\", que não existe"); }); }
        catch (e) { erros.push("sólido \"" + (s.nome || i + 1) + "\", " + c + ": " + e.message); }
      });
      if (s.forma === "extrusao" && arr(s.contorno).length < 3) erros.push("sólido \"" + (s.nome || i + 1) + "\": o contorno precisa de 3 pontos ou mais");
    });
    if (fam.hospedagem === "parede" && !(fam.abertura && fam.abertura.largura && fam.abertura.altura)) erros.push("família hospedada em parede precisa dizer a largura e a altura do vão");
    /* ORÇAMENTO (F1, 07/10/2026): o tipo pode ter o próprio código (sobrepõe o
       da família) e a família pode ter SERVIÇOS a mais além do quantitativo
       (ex.: a fôrma do pilar além do concreto). Código é texto; preço NUNCA. */
    var q0 = fam.quantitativo || {};
    /* AVISO, não erro: família de outro usuário com "M2" ou "m²" não pode ser
       recusada na importação — o orçamento compara a unidade por chave */
    if (q0.unidade && !UNIDADES_QTO[q0.unidade]) avisos.push("quantitativo: unidade \"" + q0.unidade + "\" fora da lista (" + Object.keys(UNIDADES_QTO).join(", ") + ")");
    var sids = {};
    arr(fam.servicos).forEach(function (s, i) {
      var rot = "serviço " + (s && s.id ? "\"" + s.id + "\"" : (i + 1));
      if (!s || !nomeValido(s.id)) { erros.push(rot + ": id inválido (letras, números e _)"); return; }
      if (sids[chave(s.id)]) erros.push(rot + " repetido"); sids[chave(s.id)] = 1;
      if (!UNIDADES_QTO[s.unidade]) erros.push(rot + ": unidade \"" + txt(s.unidade) + "\" desconhecida");
      if (s.quantidade == null || s.quantidade === "") erros.push(rot + ": falta a fórmula da quantidade");
      else { try { Object.keys(refs(analisar(String(s.quantidade)))).forEach(function (r) { if (!nomes[r]) erros.push(rot + ": usa \"" + r + "\", que não existe"); }); } catch (e) { erros.push(rot + ": " + e.message); } }
    });
    arr(fam.tipos).forEach(function (t) {
      if (t.codigo != null && typeof t.codigo !== "string" && typeof t.codigo !== "number") erros.push("tipo \"" + t.nome + "\": código precisa ser texto");
      Object.keys(t.codigos || {}).forEach(function (k) { if (!sids[chave(k)]) avisos.push("tipo \"" + t.nome + "\" dá código ao serviço \"" + k + "\", que não existe"); });
    });
    return { ok: !erros.length, erros: erros, avisos: avisos };
  }
  function camposDoSolido(s) {
    var base = ["x", "y", "z", "rot", "visivel"];
    if (s.forma === "caixa") return base.concat(["dx", "dy", "dz"]);
    if (s.forma === "cilindro") return base.concat(["raio", "altura"]);
    return base.concat(["altura"]);
  }
  /* ordem topológica dos parâmetros com fórmula; { ordem:[nomes], ciclo:[...]|null } */
  function ordemCalculo(fam) {
    var ps = {}, deps = {};
    arr(fam.parametros).forEach(function (p) { ps[chave(p.nome)] = p; });
    Object.keys(ps).forEach(function (k) {
      var p = ps[k]; deps[k] = [];
      if (p.formula) { try { deps[k] = Object.keys(refs(analisar(p.formula))).filter(function (r) { return ps[r]; }); } catch (e) { deps[k] = []; } }
    });
    var ordem = [], marca = {}, pilha = [], ciclo = null;
    function visita(k) {
      if (ciclo) return;
      if (marca[k] === 2) return;
      if (marca[k] === 1) { var i = pilha.indexOf(k); ciclo = pilha.slice(i).concat([k]).map(function (x) { return ps[x].nome; }); return; }
      marca[k] = 1; pilha.push(k);
      deps[k].forEach(visita);
      pilha.pop(); marca[k] = 2; ordem.push(k);
    }
    Object.keys(ps).forEach(visita);
    return { ordem: ordem, ciclo: ciclo };
  }

  /* --------------------------------------------------------- AVALIAÇÃO
   * valores finais = padrão do parâmetro → valor do TIPO → valor da INSTÂNCIA
   * (instância só vale para parâmetro de instância) → fórmula (sempre ganha).
   * Devolve a geometria resolvida (números), o vão e a quantidade. */
  function tipoDe(fam, tipoId) {
    var ts = arr(fam.tipos);
    for (var i = 0; i < ts.length; i++) if (ts[i].id === tipoId) return ts[i];
    return ts[0] || { id: "padrao", nome: "Padrão", valores: {} };
  }
  function converter(p, v) {
    if (p.tipoDado === "texto" || p.tipoDado === "material") return v == null ? "" : String(v);
    if (p.tipoDado === "simnao") return v === true || v === 1 || v === "1" || chave(v) === "sim" || chave(v) === "true";
    var n = typeof v === "number" ? v : parseFloat(txt(v).replace(",", "."));
    if (!isFinite(n)) n = 0;
    return p.tipoDado === "inteiro" ? Math.round(n) : n;
  }
  function avaliar(fam, tipoId, instancia) {
    var v = validar(fam);
    if (!v.ok) return { ok: false, erros: v.erros };
    var tipo = tipoDe(fam, tipoId), inst = instancia || {}, env = {}, valores = {}, erros = [];
    var ps = {}; arr(fam.parametros).forEach(function (p) { ps[chave(p.nome)] = p; });
    Object.keys(ps).forEach(function (k) {
      var p = ps[k], val = p.valor;
      var tv = lerChave(tipo.valores, p.nome); if (tv !== undefined) val = tv;
      if (p.escopo === "instancia") { var iv = lerChave(inst, p.nome); if (iv !== undefined) val = iv; }
      env[k] = converter(p, val);
    });
    ordemCalculo(fam).ordem.forEach(function (k) {
      var p = ps[k]; if (!p.formula) return;
      try { var r = calc(analisar(p.formula), env); if (!isFinite(r)) throw new Error("resultado não finito"); env[k] = p.tipoDado === "simnao" ? !!r : (p.tipoDado === "inteiro" ? Math.round(r) : r); }
      catch (e) { erros.push("\"" + p.nome + "\": " + e.message); }
    });
    Object.keys(ps).forEach(function (k) { valores[ps[k].nome] = env[k]; });
    function f(expr, pad) {
      if (expr == null || expr === "") return pad;
      if (typeof expr === "number") return expr;
      try { var r2 = calc(analisar(String(expr)), env); return isFinite(r2) ? r2 : pad; } catch (e) { erros.push(e.message + " (\"" + expr + "\")"); return pad; }
    }
    function mat(m) {
      if (m == null || m === "") return "";
      var p = ps[chave(m)]; return p ? String(env[chave(m)]) : String(m);
    }
    var solidos = [];
    arr(fam.solidos).forEach(function (s) {
      if (!f(s.visivel, 1)) return;
      var o = { id: s.id, nome: s.nome || "", forma: s.forma, x: f(s.x, 0), y: f(s.y, 0), z: f(s.z, 0), rot: f(s.rot, 0), material: mat(s.material), cor: s.cor || "" };
      if (s.forma === "caixa") { o.dx = f(s.dx, 0.1); o.dy = f(s.dy, 0.1); o.dz = f(s.dz, 0.1); }
      else if (s.forma === "cilindro") { o.raio = f(s.raio, 0.05); o.altura = f(s.altura, 1); o.eixo = s.eixo === "x" || s.eixo === "z" ? s.eixo : "y"; }
      else { o.altura = f(s.altura, 0.1); o.contorno = arr(s.contorno).map(function (q) { return [f(q[0], 0), f(q[1], 0)]; }); o.plano = s.plano === "frente" ? "frente" : "planta"; }
      ["dx", "dy", "dz", "raio", "altura"].forEach(function (c) { if (o[c] != null && o[c] <= 0) erros.push("sólido \"" + (s.nome || s.id) + "\": " + c + " ficou ≤ 0 (" + o[c] + ")"); });
      solidos.push(o);
    });
    var abertura = null;
    if (fam.hospedagem === "parede" && fam.abertura) {
      abertura = { largura: f(fam.abertura.largura, 0.8), altura: f(fam.abertura.altura, 2.1), peitoril: f(fam.abertura.peitoril, 0) };
      if (!(abertura.largura > 0) || !(abertura.altura > 0)) erros.push("o vão ficou sem tamanho");
    }
    var q = fam.quantitativo || {};
    /* código do TIPO vence o da família: "Alvenaria 9 cm" e "Alvenaria 14 cm"
       são tipos da mesma família, cada um com a sua composição */
    var codTipo = txt(tipo.codigo).trim(), codFam = txt(q.codigo).trim();
    var qtd = { unidade: q.unidade || "un", quantidade: f(q.quantidade, 1), codigo: codTipo || codFam, codigoOrigem: codTipo ? "tipo" : (codFam ? "familia" : ""),
                fonte: txt(tipo.fonte).trim() || txt(q.fonte), descricao: txt(q.descricao) || fam.nome };
    var servicos = arr(fam.servicos).map(function (s) {
      var ct = tipo.codigos ? txt(lerChave(tipo.codigos, s.id)).trim() : "", cf = txt(s.codigo).trim();
      return { id: s.id, descricao: txt(s.descricao) || s.id, unidade: s.unidade, quantidade: f(s.quantidade, 0), codigo: ct || cf, codigoOrigem: ct ? "tipo" : (cf ? "familia" : "") };
    });
    return { ok: !erros.length, erros: erros, tipo: { id: tipo.id, nome: tipo.nome }, valores: valores, solidos: solidos, abertura: abertura, quantitativo: qtd, servicos: servicos, caixa: caixaDe(solidos) };
  }
  function lerChave(o, nome) {
    if (!o) return undefined;
    if (Object.prototype.hasOwnProperty.call(o, nome)) return o[nome];
    var k = chave(nome), ks = Object.keys(o);
    for (var i = 0; i < ks.length; i++) if (chave(ks[i]) === k) return o[ks[i]];
    return undefined;
  }
  /* caixa envolvente local (sem rotação de sólido: aproximação para encaixe/seleção) */
  function caixaDe(sol) {
    var b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    function p(x, y, z) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z; }
    sol.forEach(function (s) {
      if (s.forma === "caixa") { p(s.x - s.dx / 2, s.y, s.z - s.dz / 2); p(s.x + s.dx / 2, s.y + s.dy, s.z + s.dz / 2); }
      else if (s.forma === "cilindro") {
        if (s.eixo === "y") { p(s.x - s.raio, s.y, s.z - s.raio); p(s.x + s.raio, s.y + s.altura, s.z + s.raio); }
        else if (s.eixo === "x") { p(s.x, s.y - s.raio, s.z - s.raio); p(s.x + s.altura, s.y + s.raio, s.z + s.raio); }
        else { p(s.x - s.raio, s.y - s.raio, s.z); p(s.x + s.raio, s.y + s.raio, s.z + s.altura); }
      } else {
        s.contorno.forEach(function (q) {
          if (s.plano === "frente") { p(s.x + q[0], s.y + q[1], s.z); p(s.x + q[0], s.y + q[1], s.z + s.altura); }
          else { p(s.x + q[0], s.y, s.z + q[1]); p(s.x + q[0], s.y + s.altura, s.z + q[1]); }
        });
      }
    });
    return b.x0 === Infinity ? null : b;
  }

  /* ------------------------------------------------------ CRIAR / EDITAR */
  function nova(nome, categoria) {
    return {
      id: "fam-" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      nome: nome || "Família nova", categoria: CATEGORIAS[categoria] ? categoria : "generico", descricao: "", hospedagem: "livre",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 0.6, grupo: "Dimensões" },
        { nome: "Profundidade", tipoDado: "comprimento", escopo: "tipo", valor: 0.6, grupo: "Dimensões" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 0.9, grupo: "Dimensões" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Concreto", grupo: "Materiais" }
      ],
      tipos: [{ id: "t1", nome: "Padrão", valores: {} }],
      solidos: [{ id: "s1", nome: "Corpo", forma: "caixa", x: "0", y: "0", z: "0", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "" }
    };
  }
  function clonar(f) { return JSON.parse(JSON.stringify(f)); }

  var Familia = {
    TIPOS_DADO: TIPOS_DADO, CATEGORIAS: CATEGORIAS, FORMAS: FORMAS, UNIDADES_QTO: UNIDADES_QTO,
    formula: formula, analisar: analisar, referencias: function (s) { return Object.keys(refs(analisar(s))); },
    validar: validar, ordemCalculo: ordemCalculo, avaliar: avaliar, nova: nova, clonar: clonar,
    camposDoSolido: camposDoSolido, nomeValido: nomeValido
  };
  global.Familia = Familia;
  if (typeof module !== "undefined" && module.exports) module.exports = Familia;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
