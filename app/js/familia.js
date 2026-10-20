/* =====================================================================
 * familia.js — FAMÍLIA PARAMÉTRICA do OrçaPRO (motor puro, Node-testável)
 *
 * A família paramétrica (o equivalente do .rfa de terceiros), criada DENTRO do OrçaPRO e
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
    parede: "Parede", laje: "Laje", piso: "Piso",
    /* P12: instalações (acessório de tubo e dispositivos com conector) — nomes das categorias em PT-BR (convenção de mercado) */
    /* MOBILIÁRIO E PAISAGISMO (js/familiasmob.js, familiasmobcoz.js, familiaspais.js) */
    cozinha: "Cozinha", banho: "Banho", lazer: "Lazer e área gourmet", paisagismo: "Paisagismo",
    acessorio_tubo: "Acessórios do tubo", dispositivo_eletrico: "Dispositivos elétricos", luminaria: "Luminárias", equipamento_eletrico: "Equipamento elétrico",
    /* FAMIMPORT (js/familiamalha.js): as conexões das famílias importadas de .rfa */
    conexao_tubo: "Conexões de tubo", conexao_duto: "Conexões de duto", conexao_eletroduto: "Conexões do conduite"
  };
  var FORMAS = { caixa: "Caixa", cilindro: "Cilindro", extrusao: "Extrusão de contorno", revolucao: "Revolução de perfil", gerada: "Forma gerada (louça/equipamento RA)" };
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
      if (s.forma === "revolucao") {
        /* REVOLUÇÃO: perfil [[raio, altura]…] em FÓRMULA, girado em volta do eixo (y por padrão); sem nome de parâmetro inexistente */
        var rotS = "sólido \"" + (s.nome || i + 1) + "\"";
        if (arr(s.perfil).length < 2) erros.push(rotS + ": o perfil da revolução precisa de 2 pontos ou mais");
        arr(s.perfil).forEach(function (q, iq) {
          [0, 1].forEach(function (c) {
            if (!q || q[c] == null || q[c] === "") { erros.push(rotS + ": ponto " + (iq + 1) + " do perfil incompleto"); return; }
            try { Object.keys(refs(analisar(String(q[c])))).forEach(function (r) { if (!nomes[r]) erros.push(rotS + ", perfil: usa \"" + r + "\", que não existe"); }); }
            catch (e) { erros.push(rotS + ", perfil: " + e.message); }
          });
        });
        if (s.segmentos != null && !(s.segmentos >= SEG_MIN && s.segmentos <= SEG_MAX)) erros.push(rotS + ": segmentos da revolução entre " + SEG_MIN + " e " + SEG_MAX);
      }
      if (s.forma === "gerada") {
        /* GERADA (js/hidlouca.js): o gerador de malha pelo nome + os parâmetros dele em FÓRMULA */
        var rotG = "sólido \"" + (s.nome || i + 1) + "\"";
        if (!txt(s.gerador)) erros.push(rotG + ": falta o nome do gerador da forma");
        else { var GL = geradorLouca(); if (GL && !GL.existe(s.gerador)) erros.push(rotG + ": gerador \"" + s.gerador + "\" desconhecido"); }
        Object.keys(s.p || {}).forEach(function (kp) {
          try { Object.keys(refs(analisar(String(s.p[kp])))).forEach(function (r) { if (!nomes[r]) erros.push(rotG + ", " + kp + ": usa \"" + r + "\", que não existe"); }); }
          catch (e) { erros.push(rotG + ", " + kp + ": " + e.message); }
        });
      }
      if (s.forma === "extrusao" && arr(s.contorno).length < 3) erros.push("sólido \"" + (s.nome || i + 1) + "\": o contorno precisa de 3 pontos ou mais");
    });
    /* FAMIMPORT: a família importada (malha) traz o vão POR TIPO (tipo.vao), não em fórmula */
    if (fam.hospedagem === "parede" && fam.geometria !== "malha" && !(fam.abertura && fam.abertura.largura && fam.abertura.altura)) erros.push("família hospedada em parede precisa dizer a largura e a altura do vão");
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
    if (s.forma === "revolucao") return base.concat(["ex", "ez"]);
    if (s.forma === "gerada") return base;
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

  /* ------------------------------------------------------ REVOLUÇÃO
   * Perfil [[raio, altura]…] (fórmulas) girado 360° em volta do eixo (y por padrão; "x" ou "z"
   * deitam o sólido). ex/ez estiram a seção (oval: bacia, lavatório). O perfil que começa ou termina
   * longe do eixo é FECHADO NO EIXO (tampa plana); `fechar: "perfil"` fecha o perfil sobre si mesmo
   * (anel oco: assento, aro, grade). A malha sai INDEXADA, com os vértices repetidos em cada trecho do
   * perfil: a aresta do perfil fica viva e o giro fica liso (`suave`: o 3D não "achata" as faces).
   * Vira forma "malha" para o 3D, o IFC e o quantitativo (o mesmo caminho da família importada). */
  var SEG_MIN = 8, SEG_MAX = 48, SEG_PAD = 24;
  function malhaRevolucao(s, f, erros) {
    var rotulo = "sólido \"" + (s.nome || s.id) + "\"";
    var pts = arr(s.perfil).map(function (q) { return [f(q[0], 0), f(q[1], 0)]; });
    var seg = s.segmentos != null ? Math.round(s.segmentos) : SEG_PAD, ex = f(s.ex, 1), ez = f(s.ez, 1), eps = 1e-9;
    if (!(ex > 0) || !(ez > 0)) { erros.push(rotulo + ": escala da revolução ≤ 0"); return null; }
    var ni = -1; pts.forEach(function (q, iq) { if (ni < 0 && !(q[0] >= 0)) ni = iq; });
    if (ni >= 0) { erros.push(rotulo + ": o ponto " + (ni + 1) + " do perfil está do lado NEGATIVO do eixo (raio " + pts[ni][0] + "); o raio é a distância ao eixo e não pode ser negativo"); return null; }
    var ig = -1; pts.forEach(function (q, iq) { if (ig < 0 && iq > 0 && Math.abs(q[0] - pts[iq - 1][0]) <= eps && Math.abs(q[1] - pts[iq - 1][1]) <= eps) ig = iq; });
    if (ig >= 0) { erros.push(rotulo + ": os pontos " + ig + " e " + (ig + 1) + " do perfil são iguais (segmento sem comprimento); apague um deles"); return null; }
    if (s.fechar === "perfil") pts.push([pts[0][0], pts[0][1]]);
    else {
      if (pts[0][0] > eps) pts.unshift([0, pts[0][1]]);
      if (pts[pts.length - 1][0] > eps) pts.push([0, pts[pts.length - 1][1]]);
    }
    /* auto-interseção do perfil (com o fechamento já posto): dois trechos que não são vizinhos não podem se tocar */
    var nseg = pts.length - 1, fechado = s.fechar === "perfil";
    function ori(p1, p2, p3) { var o = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]); return Math.abs(o) <= eps ? 0 : (o > 0 ? 1 : -1); }
    function noSeg(p1, p2, p3) { return Math.min(p1[0], p2[0]) - eps <= p3[0] && p3[0] <= Math.max(p1[0], p2[0]) + eps && Math.min(p1[1], p2[1]) - eps <= p3[1] && p3[1] <= Math.max(p1[1], p2[1]) + eps; }
    function cruza(a1, a2, b1, b2) {
      var o1 = ori(a1, a2, b1), o2 = ori(a1, a2, b2), o3 = ori(b1, b2, a1), o4 = ori(b1, b2, a2);
      if (o1 !== o2 && o3 !== o4) return true;
      return (o1 === 0 && noSeg(a1, a2, b1)) || (o2 === 0 && noSeg(a1, a2, b2)) || (o3 === 0 && noSeg(b1, b2, a1)) || (o4 === 0 && noSeg(b1, b2, a2));
    }
    for (var i1 = 0; i1 < nseg; i1++) for (var i2 = i1 + 2; i2 < nseg; i2++) {
      if (fechado && i1 === 0 && i2 === nseg - 1) continue;     /* o último trecho encosta no primeiro */
      if (cruza(pts[i1], pts[i1 + 1], pts[i2], pts[i2 + 1])) { erros.push(rotulo + ": o perfil se cruza (trecho " + (i1 + 1) + " com o trecho " + (i2 + 1) + "); o sólido sairia com volume errado"); return null; }
    }
    var eixo = s.eixo === "x" || s.eixo === "z" ? s.eixo : "y", v = [], fc = [], k, j;
    function ponto(r, h, ang) {
      var a = r * Math.cos(ang) * ex, b = r * Math.sin(ang) * ez;
      if (eixo === "x") return [h, a, b];
      if (eixo === "z") return [a, b, h];
      return [a, h, b];
    }
    function ring(q) { for (var jj = 0; jj < seg; jj++) { var pp = ponto(q[0], q[1], 2 * Math.PI * jj / seg); v.push(pp[0], pp[1], pp[2]); } }
    for (k = 0; k + 1 < pts.length; k++) {
      var rA = pts[k][0], rB = pts[k + 1][0];
      if (rA <= eps && rB <= eps) continue;
      var A = v.length / 3, B = A + seg;
      ring(pts[k]); ring(pts[k + 1]);
      for (j = 0; j < seg; j++) {
        var j2 = (j + 1) % seg, a0 = A + j, a1 = A + j2, b0 = B + j, b1 = B + j2;
        if (rA > eps && rB > eps) fc.push(a0, b0, b1, a0, b1, a1);
        else if (rA <= eps) fc.push(a0, b0, b1);
        else fc.push(a0, b0, a1);
      }
    }
    /* descarta triângulo de área zero (vértices coincidentes no eixo) */
    var bom = [];
    for (k = 0; k + 2 < fc.length; k += 3) {
      var i0 = fc[k] * 3, i1 = fc[k + 1] * 3, i2 = fc[k + 2] * 3;
      var ux = v[i1] - v[i0], uy = v[i1 + 1] - v[i0 + 1], uz = v[i1 + 2] - v[i0 + 2], wx = v[i2] - v[i0], wy = v[i2 + 1] - v[i0 + 1], wz = v[i2 + 2] - v[i0 + 2];
      var cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      if (cx * cx + cy * cy + cz * cz > 1e-24) bom.push(fc[k], fc[k + 1], fc[k + 2]);
    }
    fc = bom;
    if (!fc.length) { erros.push(rotulo + ": o perfil não gera superfície"); return null; }
    /* orientação para fora: o volume com sinal tem de dar positivo (teorema da divergência) */
    var vv = 0, q, i0, i1, i2;
    for (q = 0; q + 2 < fc.length; q += 3) {
      i0 = fc[q] * 3; i1 = fc[q + 1] * 3; i2 = fc[q + 2] * 3;
      vv += v[i0] * (v[i1 + 1] * v[i2 + 2] - v[i1 + 2] * v[i2 + 1]) - v[i0 + 1] * (v[i1] * v[i2 + 2] - v[i1 + 2] * v[i2]) + v[i0 + 2] * (v[i1] * v[i2 + 1] - v[i1 + 1] * v[i2]);
    }
    vv = vv / 6;
    if (vv < 0) { for (k = 0; k + 2 < fc.length; k += 3) { var tmp = fc[k + 1]; fc[k + 1] = fc[k + 2]; fc[k + 2] = tmp; } vv = -vv; }
    var rot = f(s.rot, 0) * Math.PI / 180;
    if (rot) { var c = Math.cos(rot), sn = Math.sin(rot); for (k = 0; k + 2 < v.length; k += 3) { var vx = v[k], vz = v[k + 2]; v[k] = vx * c + vz * sn; v[k + 2] = -vx * sn + vz * c; } }
    for (k = 0; k < v.length; k++) v[k] = Math.round(v[k] * 1e6) / 1e6;
    return { forma: "malha", origemForma: "revolucao", suave: true, x: f(s.x, 0), y: f(s.y, 0), z: f(s.z, 0), rot: 0, v: v, f: fc, volume: vv };
  }
  /* ------------------------------------------------------ FORMA GERADA
   * (QUALIDADE VISUAL 3, 17/10/2026) A louça/o equipamento com geometria real: o js/hidlouca.js gera as
   * PARTES (bacia, assento, tampa, torneira, sifão…) a partir dos parâmetros do sólido (fórmulas). Aqui as
   * partes se juntam POR MATERIAL (uma malha — uma chamada de desenho — por material) e levam os níveis de
   * detalhe (lod: [nível 1, nível 2]) que o 3D troca pela distância. Parte "acessório" (metais, sifão) vai
   * em malha própria, marcada, para a conferência da envolvente olhar só o corpo. Sem o gerador carregado
   * (o grupo do hidro não baixou), a forma vira a CAIXA da envolvente `s.env` — nunca some calada. */
  function geradorLouca() {
    if (Familia.geradorForcado !== undefined) return Familia.geradorForcado;   /* gancho de teste: null = "o grupo do hidro não carregou" */
    if (global.HidLouca) return global.HidLouca;
    if (typeof require === "function") { try { return require("./hidlouca.js"); } catch (e) { return null; } }
    return null;
  }
  function malhasGeradas(s, f, mat, erros) {
    var rotulo = "sólido \"" + (s.nome || s.id) + "\"", G = geradorLouca(), P = {}, base = { x: f(s.x, 0), y: f(s.y, 0), z: f(s.z, 0) };
    Object.keys(s.p || {}).forEach(function (k) { P[k] = f(s.p[k], 0); });
    if (!G) {
      var e = s.env || null;
      if (!e) { erros.push(rotulo + ": o gerador de forma (js/hidlouca.js) não carregou"); return []; }
      return [{ id: s.id, nome: s.nome || "", forma: "caixa", x: base.x + f(e.x, 0), y: base.y + f(e.y, 0), z: base.z + f(e.z, 0), rot: 0, dx: f(e.dx, 0.1), dy: f(e.dy, 0.1), dz: f(e.dz, 0.1), material: mat(s.material), cor: "" }];
    }
    var niveis = [], n;
    for (n = 0; n < (G.NIVEIS || 1); n++) {
      var r = G.gerar(s.gerador, P, { nivel: n });
      if (!r.ok) { erros.push(rotulo + ": " + r.erros.join("; ")); return []; }
      niveis.push(r.partes);
    }
    var rot = f(s.rot, 0) * Math.PI / 180, c = Math.cos(rot), sn = Math.sin(rot);
    function grupos(partes) {
      var gs = {}, ordem = [];
      partes.forEach(function (p) {
        var m = p.material === "@" ? mat(s.material) : p.material, k = m + (p.acessorio ? "|acessorio" : "");
        if (!gs[k]) { gs[k] = { material: m, acessorio: !!p.acessorio, v: [], f: [], volume: 0, partes: [] }; ordem.push(k); }
        var g = gs[k], i0 = g.v.length / 3, q;
        for (q = 0; q + 2 < p.v.length; q += 3) {
          var x = p.v[q], z = p.v[q + 2];
          g.v.push(rot ? Math.round((x * c + z * sn) * 1e6) / 1e6 : x, p.v[q + 1], rot ? Math.round((-x * sn + z * c) * 1e6) / 1e6 : z);
        }
        for (q = 0; q < p.f.length; q++) g.f.push(p.f[q] + i0);
        g.volume += p.volume; g.partes.push(p.id);
        return g;
      });
      return { gs: gs, ordem: ordem };
    }
    var g0 = grupos(niveis[0]), gl = niveis.slice(1).map(grupos);
    return g0.ordem.map(function (k) {
      var g = g0.gs[k], o = { id: s.id + ":" + k, nome: (s.nome || "") + (g.acessorio ? " — acessórios" : ""), forma: "malha", origemForma: "gerada", gerador: s.gerador, suave: true,
        x: base.x, y: base.y, z: base.z, rot: 0, v: g.v, f: g.f, volume: g.volume, material: g.material, cor: "", partes: g.partes };
      if (g.acessorio) o.acessorio = true;
      o.lod = gl.map(function (x) { var h = x.gs[k]; return h ? { v: h.v, f: h.f } : { v: [], f: [] }; });
      return o;
    });
  }

  /* triângulos que o 3D desenha para o resultado de avaliar() (caixa 12; cilindro 28 lados; malha pelos índices) */
  function triangulos(av) {
    var n = 0;
    arr(av && av.solidos).forEach(function (s) {
      if (s.forma === "caixa") n += 12;
      else if (s.forma === "cilindro") n += 28 * 4;
      else if (s.forma === "malha") n += s.f.length / 3;
      else { var m = arr(s.contorno).length; n += Math.max(0, 2 * (m - 2)) + 2 * m; }
    });
    return n;
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
      else if (s.forma === "revolucao") { var rv = malhaRevolucao(s, f, erros); if (!rv) return; rv.id = s.id; rv.nome = s.nome || ""; rv.material = mat(s.material); rv.cor = s.cor || ""; solidos.push(rv); return; }
      else if (s.forma === "gerada") { malhasGeradas(s, f, mat, erros).forEach(function (mg) { solidos.push(mg); }); return; }
      else { o.altura = f(s.altura, 0.1); o.contorno = arr(s.contorno).map(function (q) { return [f(q[0], 0), f(q[1], 0)]; }); o.plano = s.plano === "frente" ? "frente" : "planta"; }
      ["dx", "dy", "dz", "raio", "altura"].forEach(function (c) { if (o[c] != null && o[c] <= 0) erros.push("sólido \"" + (s.nome || s.id) + "\": " + c + " ficou ≤ 0 (" + o[c] + ")"); });
      solidos.push(o);
    });
    /* B5 (instalações, js/biminst.js): pontos de LIGAÇÃO do aparelho — sistema,
       DN e a posição LOCAL (fórmula, como os sólidos). O tubo que chega nele
       está ligado; família sem `conectores` continua igual. */
    var conectores = arr(fam.conectores).filter(function (k) { return k && k.sistema; }).map(function (k, i) {
      return { id: txt(k.id) || ("c" + (i + 1)), nome: txt(k.nome), sistema: txt(k.sistema), dn: f(k.dn, 0), x: f(k.x, 0), y: f(k.y, 0), z: f(k.z, 0) };
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
    var saida = { ok: !erros.length, erros: erros, tipo: { id: tipo.id, nome: tipo.nome }, valores: valores, solidos: solidos, abertura: abertura, quantitativo: qtd, servicos: servicos, caixa: caixaDe(solidos), conectores: conectores };
    /* P12: a família MEP diz ao js/biminst.js que peça SINAPI ela é ({peca}); sem `mep`, nada muda */
    if (fam.mep && typeof fam.mep === "object" && fam.mep.peca) saida.mep = { peca: txt(fam.mep.peca) };
    /* FAMIMPORT: família importada (js/familiamalha.js) — a geometria, o vão, os conectores e a luz vêm da malha do TIPO */
    if (fam.geometria === "malha") {
      var FM = global.FamiliaMalha || (typeof require === "function" ? (function () { try { return require("./familiamalha.js"); } catch (eR) { return null; } })() : null);
      if (FM) FM.completar(fam, tipo, inst, saida); else { saida.ok = false; saida.erros.push("o leitor de família importada (js/familiamalha.js) não carregou"); }
    }
    /* MARCENARIA (js/marcenaria.js): o módulo em chapa / a estrutura de madeira — os sólidos são as PEÇAS do corte */
    if (fam.geometria === "marcenaria") {
      var MC = global.Marcenaria || (typeof require === "function" ? (function () { try { return require("./marcenaria.js"); } catch (eR) { return null; } })() : null);
      if (MC) MC.completar(fam, tipo, inst, saida); else { saida.ok = false; saida.erros.push("o motor de marcenaria (js/marcenaria.js) não carregou"); }
    }
    /* MOBILIÁRIO E PAISAGISMO (js/familiasmob.js): a malha sai do gerador da família (js/mobgeo.js), por material */
    if (fam.geometria === "mob") {
      var FMb = global.FamiliasMob || (typeof require === "function" ? (function () { try { return require("./familiasmob.js"); } catch (eR) { return null; } })() : null);
      if (FMb) FMb.completar(fam, tipo, inst, saida); else { saida.ok = false; saida.erros.push("o gerador de mobiliário (js/familiasmob.js) não carregou"); }
    }
    return saida;
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
      } else if (s.forma === "malha") {
        for (var im = 0; im + 2 < s.v.length; im += 3) p(s.x + s.v[im], s.y + s.v[im + 1], s.z + s.v[im + 2]);
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
    camposDoSolido: camposDoSolido, nomeValido: nomeValido, triangulos: triangulos
  };
  global.Familia = Familia;
  if (typeof module !== "undefined" && module.exports) module.exports = Familia;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
