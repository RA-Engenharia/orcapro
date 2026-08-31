/* =====================================================================
 * bimset.js — CONJUNTOS DE SELEÇÃO E BUSCA (o B3; Sets + Find Items)
 *
 * O QUE ESTE ARQUIVO RESOLVE (D10)
 * Hoje, para dizer ao produto "estes tubos aqui", o coordenador tem de clicar
 * peça por peça — e o que ele montou morre quando a aba fecha. Clash, 4D, 5D e
 * cor por regra todos dependem de alguém apontar com o dedo.
 *
 * Um conjunto é uma resposta durável a "quais peças". Depois dele, o teste de
 * conflito, a tarefa do cronograma e a cor da vista passam a apontar para
 * "Tubos de água fria do Térreo" em vez de para uma seleção que ninguém
 * consegue repetir.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ DOIS TIPOS, E A DIFERENÇA É A QUE IMPORTA
 *
 *   estatico — lista congelada de chaves. É "estas peças, estas mesmas".
 *   busca    — uma REGRA, reavaliada a cada abertura. É "o que casar com isto".
 *
 * O de busca é o que sobrevive a modelo novo: o projetista manda a segunda
 * versão, chegam trinta tubos novos, e "Tubos de água fria do Térreo" já os
 * inclui. O estático não — e não deve incluir mesmo, porque quem o criou
 * escolheu peças, não um critério.
 *
 * ⚠ E A REGRA É DADO, NUNCA CÓDIGO. JSON serializável, sem `eval`, sem
 * `Function`. Ela vai para o Store, sincroniza para a nuvem e volta no outro
 * aparelho: regra que fosse código seria execução de texto vindo da rede.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ O CONJUNTO GUARDA CHAVE (B0), NÃO `uid`
 *
 * `uid` é `mid:expressID` — o `mid` é a ordem de abertura naquela sessão e o
 * `expressID` é o número da linha no IFC. Um conjunto estático guardado em
 * `uid` estaria quebrado antes de o engenheiro fechar o programa. A chave do
 * B0 (`modeloId::globalId`) é o que sobrevive à reexportação, e é ela que
 * entra aqui.
 *
 * ⚠ POR QUE PURO
 * Decide QUAIS peças entram num teste de conflito e numa tarefa de cronograma.
 * `js/bim.js` e `js/gestao.js` não entram no gate; isto entra.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------
   * NORMALIZAÇÃO DE TEXTO — a canônica do app, não uma nova
   *
   * `Util.normalizar` (js/util.js) foi escrita para busca e é o que o produto
   * já usa. A especificação do B3 diz, em letra de fôrma, para reaproveitá-la e
   * NÃO escrever outra — e esta base já pagou caro por réplica de helper: 33
   * cópias de `Util.parseNum` espalhadas, com dois erros opostos, os dois
   * mexendo em dinheiro.
   *
   * A cópia abaixo existe só para o caso de o `js/util.js` não ter carregado, e
   * `tools/test-bimset.js` roda as duas lado a lado numa bateria de casos: se
   * divergirem, o gate reprova. Réplica sem prova de paridade é como a outra
   * família de defeito começou.
   * ------------------------------------------------------------- */
  function normalizar(s) {
    var U = global.Util;
    if (U && typeof U.normalizar === "function") return U.normalizar(s);
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function txt(s) { return String(s == null ? "" : s); }
  function num(x) { var n = +x; return isFinite(n) ? n : null; }

  /* ---------------------------------------------------------------
   * OS CAMPOS QUE UMA REGRA PODE AVALIAR
   *
   * ⚠ ESTA LISTA É FECHADA, E ISSO É DELIBERADO. Aceitar qualquer nome de
   * campo faria a regra parecer funcionar e devolver vazio — o "falso vazio",
   * que é pior que um erro, porque o usuário conclui que a obra não tem aquilo.
   * Campo fora da lista é RECUSADO na validação, com o motivo escrito.
   * ------------------------------------------------------------- */
  var CAMPOS = [
    { chave: "tipo",        rotulo: "Tipo IFC",            tipo: "texto" },
    { chave: "nome",        rotulo: "Nome",                tipo: "texto" },
    { chave: "nomeIfc",     rotulo: "Nome no Revit",       tipo: "texto" },
    { chave: "familia",     rotulo: "Família/tipo",        tipo: "texto" },
    /* ⚠ o NOME legivel ("Água fria"), nao a chave interna ("agua_fria"): uma
       regra escrita como "sistema contém água fria" nunca casaria com a chave,
       e o usuario veria zero sem entender por que */
    { chave: "sistemaNome", rotulo: "Sistema",             tipo: "texto" },
    { chave: "sistemaIfc",  rotulo: "Sistema (IFC)",       tipo: "texto" },
    { chave: "pavimento",   rotulo: "Pavimento",           tipo: "texto" },
    { chave: "disciplina",  rotulo: "Disciplina",          tipo: "texto" },
    { chave: "etapa",       rotulo: "Etapa",               tipo: "texto" },
    { chave: "codOrc",      rotulo: "Código do orçamento", tipo: "texto" },
    { chave: "fase",        rotulo: "Fase",                tipo: "texto" },
    { chave: "tag",         rotulo: "Tag",                 tipo: "texto" },
    { chave: "arquivo",     rotulo: "Arquivo",             tipo: "texto" },
    { chave: "globalId",    rotulo: "GlobalId",            tipo: "texto" },
    { chave: "qto.area",        rotulo: "Área (m²)",        tipo: "numero" },
    { chave: "qto.volume",      rotulo: "Volume (m³)",      tipo: "numero" },
    { chave: "qto.comprimento", rotulo: "Comprimento (m)",  tipo: "numero" },
    { chave: "qto.contagem",    rotulo: "Contagem",         tipo: "numero" }
  ];
  var CAMPO_POR_CHAVE = {};
  for (var ci = 0; ci < CAMPOS.length; ci++) CAMPO_POR_CHAVE[CAMPOS[ci].chave] = CAMPOS[ci];

  var OPERADORES = [
    { chave: "e",          rotulo: "é",              valor: true,  tipos: ["texto", "numero"] },
    { chave: "diferente",  rotulo: "não é",          valor: true,  tipos: ["texto", "numero"] },
    { chave: "contem",     rotulo: "contém",         valor: true,  tipos: ["texto"] },
    { chave: "comeca",     rotulo: "começa com",     valor: true,  tipos: ["texto"] },
    { chave: "regex",      rotulo: "casa com",       valor: true,  tipos: ["texto"] },
    { chave: ">=",         rotulo: "maior ou igual", valor: true,  tipos: ["numero"] },
    { chave: "<=",         rotulo: "menor ou igual", valor: true,  tipos: ["numero"] },
    { chave: "entre",      rotulo: "entre",          valor: true,  tipos: ["numero"] },
    { chave: "definido",   rotulo: "está preenchido", valor: false, tipos: ["texto", "numero"] },
    { chave: "indefinido", rotulo: "está vazio",     valor: false, tipos: ["texto", "numero"] }
  ];
  var OP_POR_CHAVE = {};
  for (var oi = 0; oi < OPERADORES.length; oi++) OP_POR_CHAVE[OPERADORES[oi].chave] = OPERADORES[oi];

  /* comprimento máximo de uma expressão: o `regex` roda contra nomes curtos,
     mas padrão gigante escrito à mão só serve para travar a aba de quem
     escreveu */
  var MAX_REGEX = 200;

  /* ---------------------------------------------------------------
   * leitura do campo — e a assimetria que ela precisa apagar
   *
   * ⚠ O MESMO "AUSENTE" CHEGA DE DUAS FORMAS. No caminho do IFC, campo sem
   * valor é `null`; no modelo restaurado do cache, o mesmo campo é string
   * vazia (o registro é planificado ao gravar). Sem uniformizar, a regra
   * "está vazio" acertaria o modelo recém-aberto e erraria o restaurado — e o
   * usuário veria contagens diferentes para a mesma obra em dois dias.
   * ------------------------------------------------------------- */
  function ler(el, campo) {
    if (!el) return null;
    var i = campo.indexOf(".");
    var v;
    if (i < 0) v = el[campo];
    else {
      var raiz = el[campo.slice(0, i)];
      v = raiz ? raiz[campo.slice(i + 1)] : undefined;
    }
    if (v === undefined || v === null) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    return v;
  }

  function comparaTexto(v, alvo, modo) {
    var a = normalizar(v), b = normalizar(alvo);
    if (modo === "e") return a === b;
    if (modo === "contem") return b === "" ? true : a.indexOf(b) >= 0;
    if (modo === "comeca") return b === "" ? true : a.indexOf(b) === 0;
    return false;
  }

  function casaCondicao(el, cond) {
    var campo = txt(cond && cond.campo), oper = txt(cond && cond.oper);
    var v = ler(el, campo);

    if (oper === "definido") return v !== null;
    if (oper === "indefinido") return v === null;
    if (v === null) return false;          /* sem valor não casa nenhum teste */

    switch (oper) {
      case "e":         return comparaTexto(v, cond.valor, "e") || (num(v) !== null && num(v) === num(cond.valor));
      case "diferente": return !(comparaTexto(v, cond.valor, "e") || (num(v) !== null && num(v) === num(cond.valor)));
      case "contem":    return comparaTexto(v, cond.valor, "contem");
      case "comeca":    return comparaTexto(v, cond.valor, "comeca");
      case "regex":
        try { return new RegExp(txt(cond.valor), "i").test(normalizar(v)); }
        catch (e) { return false; }        /* padrão ruim não derruba a busca */
      case ">=":  { var a1 = num(v), b1 = num(cond.valor); return a1 !== null && b1 !== null && a1 >= b1; }
      case "<=":  { var a2 = num(v), b2 = num(cond.valor); return a2 !== null && b2 !== null && a2 <= b2; }
      case "entre": {
        var a3 = num(v);
        var lo = num(Array.isArray(cond.valor) ? cond.valor[0] : null);
        var hi = num(Array.isArray(cond.valor) ? cond.valor[1] : null);
        if (a3 === null || lo === null || hi === null) return false;
        if (lo > hi) { var t = lo; lo = hi; hi = t; }   /* ordem invertida é engano de digitação, não critério */
        return a3 >= lo && a3 <= hi;
      }
      default: return false;
    }
  }

  /* ---------------------------------------------------------------
   * validar — recusa com MOTIVO, em português
   *
   * ⚠ REGRA QUE NÃO CASA NADA E REGRA INVÁLIDA PARECEM A MESMA COISA NA TELA:
   * as duas mostram zero. A diferença é que a primeira é uma resposta sobre a
   * obra e a segunda é um erro de quem escreveu. Sem a recusa explícita, o
   * coordenador conclui que a obra não tem tubo de água fria.
   * ------------------------------------------------------------- */
  function validar(regra) {
    var erros = [];
    if (!regra || typeof regra !== "object") return { ok: false, erros: ["A regra está vazia."] };
    var op = txt(regra.op || "e");
    if (op !== "e" && op !== "ou") erros.push('A junção deve ser "e" ou "ou" — recebi "' + op + '".');

    var conds = (regra.cond || []).concat(regra.naoDe || []);
    if (!conds.length) erros.push("A regra não tem nenhuma condição.");

    for (var i = 0; i < conds.length; i++) {
      var c = conds[i] || {}, campo = txt(c.campo), oper = txt(c.oper);
      var onde = "condição " + (i + 1);

      /* ⚠ O CASO `pset:` — a especificação previa, e o dado NÃO EXISTE.
         Nenhum dos quatro caminhos de carga põe propriedade no elemento: a
         lista completa é lida sob demanda, varrendo o arquivo inteiro a cada
         clique, e o modelo restaurado do cache nem a tem. Aceitar aqui daria
         uma regra que sempre devolve zero — e o usuário culparia o projetista
         por não ter preenchido. Recusar dizendo por quê é a resposta honesta. */
      if (campo.indexOf("pset:") === 0) {
        erros.push(onde + ': propriedade de pset ("' + campo + '") ainda não pode ser usada em regra — ela não fica guardada no elemento, é lida do arquivo a cada clique.');
        continue;
      }
      if (!campo) { erros.push(onde + ": falta o campo."); continue; }
      var meta = CAMPO_POR_CHAVE[campo];
      if (!meta) { erros.push(onde + ': não conheço o campo "' + campo + '".'); continue; }

      var mo = OP_POR_CHAVE[oper];
      if (!oper) { erros.push(onde + ": falta o operador."); continue; }
      if (!mo) { erros.push(onde + ': não conheço a comparação "' + oper + '".'); continue; }
      if (mo.tipos.indexOf(meta.tipo) < 0) {
        erros.push(onde + ': "' + mo.rotulo + '" não vale para ' + (meta.tipo === "numero" ? "número" : "texto") + ' (campo "' + meta.rotulo + '").');
        continue;
      }
      if (mo.valor) {
        if (oper === "entre") {
          if (!Array.isArray(c.valor) || num(c.valor[0]) === null || num(c.valor[1]) === null) {
            erros.push(onde + ': "entre" precisa de dois números.');
          }
        } else if (c.valor === undefined || c.valor === null || txt(c.valor).trim() === "") {
          erros.push(onde + ": falta o valor da comparação.");
        } else if (meta.tipo === "numero" && num(c.valor) === null) {
          erros.push(onde + ': "' + txt(c.valor) + '" não é um número.');
        } else if (oper === "regex") {
          var pad = txt(c.valor);
          if (pad.length > MAX_REGEX) erros.push(onde + ": a expressão é longa demais (limite de " + MAX_REGEX + " caracteres).");
          else { try { new RegExp(pad, "i"); } catch (e) { erros.push(onde + ": a expressão não é válida — " + e.message); } }
        }
      }
    }
    return { ok: erros.length === 0, erros: erros };
  }

  /* ---------------------------------------------------------------
   * avaliar — devolve as CHAVES (B0) que casam
   *
   * ⚠ Elemento sem chave durável fica de FORA, e isso é declarado no retorno.
   * Um conjunto montado sobre chave instável (IFC sem GlobalId) pareceria
   * funcionar hoje e sumiria na próxima abertura; melhor não entrar e a tela
   * poder dizer quantos ficaram de fora e por quê.
   * ------------------------------------------------------------- */
  function avaliar(elementos, regra) {
    var v = validar(regra);
    if (!v.ok) return { ok: false, erros: v.erros, chaves: [], instaveis: 0, casaram: 0 };
    var op = txt(regra.op || "e");
    var conds = regra.cond || [], nao = regra.naoDe || [];
    var chaves = [], vistos = {}, instaveis = 0, casaram = 0;

    for (var i = 0; i < (elementos || []).length; i++) {
      var el = elementos[i];
      if (!el) continue;
      var bate;
      if (!conds.length) bate = true;
      else if (op === "ou") {
        bate = false;
        for (var a = 0; a < conds.length; a++) if (casaCondicao(el, conds[a])) { bate = true; break; }
      } else {
        bate = true;
        for (var b = 0; b < conds.length; b++) if (!casaCondicao(el, conds[b])) { bate = false; break; }
      }
      if (bate) for (var n = 0; n < nao.length; n++) if (casaCondicao(el, nao[n])) { bate = false; break; }
      if (!bate) continue;

      casaram++;
      var ch = txt(el.chave);
      if (!ch || el.chaveInstavel) { instaveis++; continue; }
      if (vistos[ch]) continue;
      vistos[ch] = 1; chaves.push(ch);
    }
    return { ok: true, erros: [], chaves: chaves, casaram: casaram, instaveis: instaveis };
  }

  /* ---------------------------------------------------------------
   * descrever — a frase que a interface mostra
   *
   * O usuário precisa reconhecer o conjunto sem abrir o editor de regra. E a
   * frase é a mesma que vai para o relatório de conflito e para a tarefa do
   * cronograma, então ela tem de ser legível por quem não montou.
   * ------------------------------------------------------------- */
  function _valorLegivel(c) {
    if (c.oper === "entre" && Array.isArray(c.valor)) return c.valor[0] + " e " + c.valor[1];
    return txt(c.valor);
  }
  function _fraseCond(c) {
    var meta = CAMPO_POR_CHAVE[txt(c.campo)], mo = OP_POR_CHAVE[txt(c.oper)];
    var rotC = meta ? meta.rotulo : txt(c.campo);
    var rotO = mo ? mo.rotulo : txt(c.oper);
    if (!mo || !mo.valor) return rotC + " " + rotO;
    return rotC + " " + rotO + " “" + _valorLegivel(c) + "”";
  }
  function descrever(regra) {
    if (!regra || typeof regra !== "object") return "(regra vazia)";
    var conds = regra.cond || [], nao = regra.naoDe || [];
    if (!conds.length && !nao.length) return "(regra sem condição)";
    var lig = txt(regra.op || "e") === "ou" ? " ou " : " e ";
    var partes = [];
    for (var i = 0; i < conds.length; i++) partes.push(_fraseCond(conds[i]));
    var frase = partes.join(lig);
    if (nao.length) {
      var fora = [];
      for (var j = 0; j < nao.length; j++) fora.push(_fraseCond(nao[j]));
      frase = (frase ? frase + ", " : "") + "menos " + fora.join(" e ");
    }
    return frase;
  }

  /* ---------------------------------------------------------------
   * o registro de `bim_conjuntos`
   * ------------------------------------------------------------- */
  function conjunto(d) {
    d = d || {};
    var tipo = txt(d.tipo) === "estatico" ? "estatico" : "busca";
    var nome = txt(d.nome).trim();
    if (!nome) return null;
    var chaves = [];
    if (tipo === "estatico") {
      var vistos = {};
      var lista = Array.isArray(d.chaves) ? d.chaves : [];
      for (var i = 0; i < lista.length; i++) {
        var c = txt(lista[i]).trim();
        if (c && !vistos[c]) { vistos[c] = 1; chaves.push(c); }
      }
    }
    return {
      id: txt(d.id) || "",
      obraId: txt(d.obraId),
      nome: nome,
      tipo: tipo,
      /* a regra só existe no conjunto de busca; guardar uma no estático faria
         parecer que ele reavalia, e ele não reavalia de propósito */
      regra: tipo === "busca" ? (d.regra || null) : null,
      chaves: chaves,
      cor: /^#[0-9a-fA-F]{6}$/.test(txt(d.cor)) ? txt(d.cor).toLowerCase() : "",
      criadoEm: txt(d.criadoEm),
      atualizadoEmRegra: txt(d.em)
    };
  }

  /* ---------------------------------------------------------------
   * resolver — de conjunto para chaves, com o que sumiu declarado
   *
   * ⚠ O CONJUNTO ESTÁTICO PRECISA DIZER QUANTOS SUMIRAM. Ele guarda peças, e
   * a versão nova do modelo pode não ter mais algumas. Devolver só as que
   * restaram faria a contagem encolher em silêncio — e "12 tubos" virar "9"
   * sem ninguém saber que três deixaram de existir.
   * ------------------------------------------------------------- */
  function resolver(conj, elementos) {
    if (!conj) return { ok: false, erros: ["conjunto inexistente"], chaves: [], faltando: 0, casaram: 0 };
    if (conj.tipo === "busca") {
      var r = avaliar(elementos, conj.regra);
      r.faltando = 0;
      return r;
    }
    var tem = {};
    for (var i = 0; i < (elementos || []).length; i++) {
      var el = elementos[i];
      if (el && el.chave) tem[el.chave] = 1;
    }
    var vivas = [], faltando = 0;
    for (var k = 0; k < (conj.chaves || []).length; k++) {
      if (tem[conj.chaves[k]]) vivas.push(conj.chaves[k]); else faltando++;
    }
    return { ok: true, erros: [], chaves: vivas, casaram: vivas.length, instaveis: 0, faltando: faltando };
  }

  /* ---------------------------------------------------------------
   * perfil — cor por regra (o Appearance Profiler)
   *
   * Lista ORDENADA de { regra, cor }: a PRIMEIRA que casar pinta. Ordem é
   * critério, não detalhe — "tudo que é tubo" antes de "tubo de água fria"
   * pintaria os dois de igual e a segunda regra nunca teria efeito. A
   * interface mostra a ordem e deixa mover.
   * ------------------------------------------------------------- */
  function perfil(faixas, elementos) {
    var cores = {}, usos = [];
    var lista = faixas || [];
    for (var f = 0; f < lista.length; f++) usos.push(0);
    for (var i = 0; i < (elementos || []).length; i++) {
      var el = elementos[i];
      if (!el || !el.chave) continue;
      for (var j = 0; j < lista.length; j++) {
        var fa = lista[j];
        if (!fa || !fa.cor) continue;
        var v = validar(fa.regra);
        if (!v.ok) continue;
        var bateJ = false;
        var r = avaliar([el], fa.regra);
        bateJ = r.ok && r.casaram > 0;
        if (bateJ) { cores[el.chave] = fa.cor; usos[j]++; break; }   /* a primeira que casa pinta */
      }
    }
    return { cores: cores, usos: usos };
  }

  var BimSet = {
    CAMPOS: CAMPOS,
    OPERADORES: OPERADORES,
    MAX_REGEX: MAX_REGEX,
    normalizar: normalizar,
    ler: ler,
    validar: validar,
    avaliar: avaliar,
    descrever: descrever,
    conjunto: conjunto,
    resolver: resolver,
    perfil: perfil
  };

  global.BimSet = BimSet;
  if (typeof module !== "undefined" && module.exports) module.exports = BimSet;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
