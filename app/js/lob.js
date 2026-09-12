/* =====================================================================
 * lob.js — LINHA DE BALANÇO (Line of Balance) da parte REPETITIVA da obra
 *
 * O QUE É. O Gantt responde QUANDO; a linha de balanço responde em que
 * RITMO e onde as equipes se atropelam. Eixo Y = LOCAL (pavimento, casa,
 * trecho), eixo X = tempo, uma linha por serviço. Linha mais inclinada =
 * equipe mais rápida; duas linhas que se cruzam = a ordem das equipes se
 * inverte entre dois locais — e, quando as janelas coincidem no MESMO
 * local, são dois times no mesmo lugar no mesmo dia.
 *
 * POR QUE ESTE ARQUIVO EXISTE ASSIM (11/09/2026)
 * O OrçaPRO NÃO TEM CADASTRO DE LOCAIS. A EAP é etapa › subetapa › serviço,
 * e não há campo de pavimento, torre ou trecho em lugar nenhum (medido:
 * `Cronograma.eap` não emite nenhum, e nenhum dos 22 orçamentos reais dos
 * backups tem esse dado). Criar o campo atravessa orçamento, cronograma,
 * RDO e medição — é decisão de modelo de dados, não cabe aqui.
 * O caminho honesto que sobra é UM só: descobrir a repetição no PRÓPRIO
 * NOME das etapas/subetapas/serviços. E aí vem a regra que manda em tudo
 * neste arquivo:
 *
 *   ⚠ NUNCA INVENTAR LOCAL. Se o nome não disser, o local não existe.
 *     Nada é interpolado, nada é completado: um serviço que não aparece num
 *     local vira LACUNA declarada, nunca um ponto estimado na reta.
 *
 * O ROTEIRO DO DEFEITO QUE ESTA DOUTRINA IMPEDE (medido nos backups reais)
 * Uma varredura ingênua por /pavimento|bloco|módulo/ acha 13 "locais" nos
 * 192 nomes de serviço reais — e os 13 são falsos:
 *   "PRÉDIO COM ATÉ 4 PAVIMENTOS"          → 4 é QUANTIDADE, não local
 *   "TOMADA MÉDIA DE EMBUTIR (1 MÓDULO)"   → 1 é QUANTIDADE, não local
 *   "ARMAÇÃO DE BLOCO E SAPATA..."         → "BLOCO E" é conjunção, não "Bloco E"
 *   "CONCRETAGEM DE BLOCO DE COROAMENTO"   → "BLOCO DE" não é ordinal
 *   "ESTACA BROCA DE CONCRETO"             → "BROCA" não é ordinal
 * Um LOB montado sobre isso desenharia obra repetitiva onde não há, e o
 * engenheiro levaria para a reunião um gráfico que não existe. Por isso as
 * quatro travas abaixo, cada uma com o caso real que a motivou:
 *
 *   T1 SÉRIE     Local só existe em SÉRIE: ≥ `MIN_LOCAIS` (3) ordinais
 *                DISTINTOS sob o mesmo texto. Um "1 MÓDULO" repetido em 40
 *                tomadas é um ordinal só — não é série.
 *   T2 ORDEM     "<palavra> <ordinal>" ("Pavimento 1", "Torre A") vale.
 *                "<ordinal> <palavra>" só vale COM marca de ordinal
 *                ("1º Pavimento"). Sem a marca é quantidade — foi o que
 *                matou "ATÉ 4 PAVIMENTOS" e "(1 MÓDULO)".
 *   T3 PLURAL    "pavimentos"/"blocos" nunca é local (é contagem).
 *   T4 SEPARADOR Ordinal em LETRA ou ROMANO exige fim do nome ou separador
 *                depois ("Torre A", "Torre A - Fundação"). Foi o que matou
 *                "BLOCO E SAPATA": "E" seguido de mais palavras é texto.
 *   T5 TETO      Romano vai até 100: "MIX" vale 1009 e "MMM" vale 3000 em
 *                romano canônico. Obra com 3.000 torres não existe; sigla
 *                de três letras existe aos montes.
 *
 * ⚠ CADA TRAVA ESTÁ MEDIDA, não suposta. Derrubando uma trava por vez em
 * js/lob.js e recontando os 484 nomes reais dos backups (o controle
 * negativo de tools/test-lob.js, executado):
 *   sem T3 → 11 dos 484 nomes viram "local"
 *   sem T2 →  4 (todos "(1 MÓDULO)" de tomada e interruptor)
 *   sem T4 →  1 ("BLOCO E SAPATA")
 *   com as travas de pé → 0
 * Trava que ninguém provou derrubar é trava que talvez não exista.
 *
 * O VOCABULÁRIO É FECHADO e três palavras estão FORA de propósito:
 *   "piso"      — é serviço (revestimento), não andar;
 *   "cobertura" — é serviço (telhado) e aparece assim nos dados reais;
 *   "fase"/"etapa" — é tempo, não lugar; LOB de fase não existe.
 * Palavra nova só entra com nome real que a justifique (a mesma régua do
 * dicionário de sinônimos: vocabulário da base ≠ vocabulário da obra).
 *
 * MOTOR PURO: sem DOM, sem Store, sem Cronograma. Roda em Node.
 *   LOB.locaisDe(orc|resultado|nós, opc) → que locais existem, com que
 *        confiança, e O QUE NÃO CASOU (nunca só "não achei").
 *   LOB.montar(r, plano, opc)            → retas, ritmo, cruzamentos,
 *        sobreposições e folgas entre equipes, a partir das DATAS que o
 *        `Cronograma.estimar(orc, null, {eap:true})` já calculou.
 *   LOB.de(orc, r, opc)                  → os dois em sequência.
 * Sem repetição detectável devolve {temLob:false, motivo} — a tela NÃO
 * desenha gráfico vazio (tela vazia com "cadastre locais" em obra que não é
 * repetitiva vira ruído, e ruído a pessoa aprende a ignorar).
 *
 * ⚠ NENHUM NÚMERO DE PRODUTIVIDADE NASCE AQUI. Ritmo e folga são DERIVADOS
 * das datas do motor do cronograma. Este arquivo não estima duração, não
 * converte quantidade em dias e não sabe o que é equipe-dia.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  // chave própria: um id "constructor"/"toString" não pode achar o protótipo
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function txt(v) { return String(v == null ? "" : v); }
  // a chave de nó carrega id de subetapa vindo do orçamento: escapar para que
  // um id com "|" não colida com a chave de outro nó (id é uuid hoje, mas o
  // importador de pacote aceita o que vier de fora)
  function esc(v) { return txt(v).replace(/[\\|]/g, function (c) { return "\\" + c; }); }

  /* Dobra acentos SEM MUDAR O COMPRIMENTO — cada caractere vira exatamente
     um caractere. É condição para o resto: os índices do casamento na string
     dobrada são usados para recortar o rótulo do local (e o tronco do
     serviço) da string ORIGINAL, que é a que a pessoa lê. `normalize("NFD")`
     também preserva o comprimento depois de tirar as marcas, mas é ES6 e
     este arquivo roda em WebView de instalador antigo. */
  var COM = "áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ";
  var SEM = "aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN";
  function fold(s) {
    s = txt(s);
    var out = "", i, j;
    for (i = 0; i < s.length; i++) {
      j = COM.indexOf(s.charAt(i));
      out += j > -1 ? SEM.charAt(j) : s.charAt(i);
    }
    return out.toLowerCase();
  }
  var RE_SEP_BORDA = /^[\s:;,.\-–—\/|()\[\]]+|[\s:;,.\-–—\/|()\[\]]+$/g;
  function limpa(s) {
    return txt(s).replace(RE_SEP_BORDA, "")
      .replace(/\s*[-–—]\s*[-–—]\s*/g, " - ")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(RE_SEP_BORDA, "");
  }
  function arred(v, n) {
    if (v == null || !isFinite(v)) return null;
    var f = Math.pow(10, n || 0);
    return Math.round(v * f) / f;
  }
  function dma(d) {
    if (!d || typeof d.getTime !== "function" || isNaN(d.getTime())) return "";
    var dd = d.getDate(), mm = d.getMonth() + 1;
    return (dd < 10 ? "0" : "") + dd + "/" + (mm < 10 ? "0" : "") + mm + "/" + d.getFullYear();
  }
  function plural(n, um, muitos) { return n + " " + (n === 1 ? um : muitos); }

  /* ---------------------------------------------------------------- ordinais
     Três famílias, e a família é da SÉRIE INTEIRA, não do item: "Torre A" e
     "Torre 2" na mesma obra são dois eixos diferentes, não um só. O item que
     não é da família eleita sai em `foraDoPadrao` com o motivo — item que
     some calado é pior que item recusado. */
  var ROM_V = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  var ROM_T = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  function paraRomano(n) {
    var s = "", i;
    if (!(n > 0) || n > 3999) return "";
    for (i = 0; i < ROM_T.length; i++) while (n >= ROM_T[i][0]) { s += ROM_T[i][1]; n -= ROM_T[i][0]; }
    return s;
  }
  /* romano canônico, e só ele: "iiii" e "vx" existem em texto solto e não são
     numeral — aceitar formas tortas abriria a porta para qualquer sigla de
     três letras virar local ("MMM", "CDI"). */
  function valorRomano(s) {
    if (!/^[ivxlcdm]{1,7}$/.test(s)) return 0;
    var tot = 0, maior = 0, i, v;
    for (i = s.length - 1; i >= 0; i--) {
      v = ROM_V[s.charAt(i)];
      if (v < maior) tot -= v; else { tot += v; maior = v; }
    }
    return (tot > 0 && paraRomano(tot) === s) ? tot : 0;
  }
  /* ⚠ ROMANO VAI ATÉ 100, e o motivo é medido, não estético: "MIX" vale 1009
     em romano canônico, "DIX" vale 509, "MMM" vale 3000 — e todos passariam
     como local, porque a forma É canônica. Obra com mais de cem torres
     numeradas em romano não existe; sigla de três letras existe aos montes.
     O teto de 100 troca um falso positivo certo por um falso negativo que
     ninguém vai encontrar. Número árabe não tem esse teto (lote 250 é
     comum). Achado rodando a suíte: "Bloco MMM" entrava como local. */
  function familiasDe(ord) {
    var f = [], vr;
    if (/^[0-9]{1,3}$/.test(ord)) f.push("numero");
    vr = valorRomano(ord);
    if (vr > 0 && vr <= 100) f.push("romano");
    if (/^[a-z]$/.test(ord)) f.push("letra");
    return f;
  }
  function valorNa(ord, fam) {
    if (fam === "numero") return parseInt(ord, 10);
    if (fam === "romano") return valorRomano(ord);
    if (fam === "letra") return ord.charCodeAt(0) - 96;
    return 0;
  }
  var NOME_FAM = { numero: "número", romano: "algarismo romano", letra: "letra" };

  /* ------------------------------------------------------- vocabulário fechado
     Ver o cabeçalho: "piso", "cobertura", "fase" e "etapa" estão FORA de
     propósito (são serviço ou tempo, não lugar). A ordem importa: alternativa
     mais longa primeiro, senão "pav" casaria dentro de "pavimento". */
  var PALAVRAS = ["pavimento", "pav", "subsolo", "andar", "nivel", "casa", "torre", "bloco",
    "lote", "quadra", "trecho", "apartamento", "apto", "unidade", "modulo", "galpao",
    "ala", "setor", "estaca", "eixo", "vao", "km", "loja", "sala", "quarto", "suite",
    "banheiro", "predio", "edificio"];
  /* unidades que podem vir DEPOIS do número: "Trecho 50 M" é medida, não o
     local nº 50. Fora da lista de propósito: "a", "v", "t", "g", "l" — letra
     solta ambígua demais para vetar um local por causa dela. */
  var RE_UNIDADE = /^\s*(m|m2|m3|mm|cm|km|kg|mpa|kpa|un|und|pol|kw|kva|cv|min|hh|h)(?![a-z0-9])/;
  var ALT = PALAVRAS.join("|");
  /* T2/T3 embutidas: `(?![a-z])` depois da palavra mata o plural ("pavimentos")
     e a palavra maior ("pavto"); o ordinal é `[0-9]{1,3}`, romano ou UMA letra
     — "bloco de" não casa porque "de" não é nenhum dos três. */
  var RE_POS = new RegExp("(^|[^a-z0-9])(" + ALT + ")(?![a-z])[\\s:.\\-\\u2013\\u2014]*([0-9]{1,3}|[ivxlcdm]{1,7}|[a-z])(?![a-z0-9])", "g");
  /* forma invertida: SÓ com marca de ordinal (º, °, ª). Sem a marca é
     quantidade — "ATÉ 4 PAVIMENTOS", "(1 MÓDULO)". */
  var RE_PRE = new RegExp("(^|[^a-z0-9])([0-9]{1,3})\\s*[\\u00ba\\u00b0\\u00aa]\\s*(" + ALT + ")(?![a-z])", "g");
  // T4: letra/romano exige fim do nome ou separador depois
  var RE_DEPOIS_OK = /^\s*([\-–—\/:;,()\[\]]|$)/;

  var LOB = {
    VERSAO: 1,
    PALAVRAS: PALAVRAS,
    /* ⚠ 3, e o porquê: com DOIS locais a "linha" de balanço é uma reta entre
       dois pontos — não mostra ritmo, não mostra cruzamento e qualquer par de
       nomes parecidos vira obra repetitiva. Três ordinais distintos sob o
       mesmo texto é padrão; dois é coincidência. Ajustável em `opc.minLocais`
       para quem quiser ver o caso limite, nunca por baixo dos panos. */
    MIN_LOCAIS: 3,
    ROTULO_HEURISTICA: "locais deduzidos dos NOMES — o OrçaPRO não tem cadastro de locais",

    /* --------------------------------------------------------------- tokens
       Acha os candidatos a local em UM nome. Devolve os aceitos e também os
       VETADOS com o motivo: é o que permite a tela dizer "achei 'Bloco E' e
       recusei porque vem seguido de mais palavras" em vez de calar. */
    _tokens: function (nome) {
      var orig = txt(nome), f = fold(orig), achados = [], vetados = [], m, ini, fim, ord, depois;
      /* ⚠ o recorte do rótulo sai da string ORIGINAL pelos índices da dobrada.
         Só é válido porque `fold` preserva o comprimento (ver o comentário
         dela). Se um dia deixar de preservar, o rótulo sai torto — a guarda
         abaixo devolve o nome inteiro em vez de um pedaço errado. */
      var alinhado = f.length === orig.length;
      function trecho(a, b) { return alinhado ? orig.slice(a, b) : f.slice(a, b); }

      RE_POS.lastIndex = 0;
      while ((m = RE_POS.exec(f)) !== null) {
        ini = m.index + m[1].length;
        fim = ini + (m[0].length - m[1].length);
        ord = m[3];
        depois = f.slice(fim);
        if (/^[0-9]+$/.test(ord)) {
          // dimensão/fração: "Bloco 14x19x39" já morre no `(?![a-z0-9])`, mas
          // "Trecho 1,5" e "Lote 3/4" passariam — número partido não é local
          if (/^\s*[\/,.]\s*[0-9]/.test(depois)) { vetados.push({ trecho: trecho(ini, fim), motivo: "parece medida ou fração, não um local" }); continue; }
          if (RE_UNIDADE.test(depois)) { vetados.push({ trecho: trecho(ini, fim), motivo: "seguido de unidade — é medida, não local" }); continue; }
        } else if (!RE_DEPOIS_OK.test(depois)) {
          // T4 — o roteiro do "ARMAÇÃO DE BLOCO E SAPATA"
          vetados.push({ trecho: trecho(ini, fim), motivo: "letra seguida de mais palavras — é texto, não um local" });
          continue;
        }
        if (!familiasDe(ord).length) { vetados.push({ trecho: trecho(ini, fim), motivo: "\"" + ord + "\" não é número, romano nem letra" }); continue; }
        achados.push({ palavra: m[2], ordinal: ord, ini: ini, fim: fim, rotulo: limpa(trecho(ini, fim)) });
      }

      RE_PRE.lastIndex = 0;
      while ((m = RE_PRE.exec(f)) !== null) {
        ini = m.index + m[1].length;
        fim = ini + (m[0].length - m[1].length);
        achados.push({ palavra: m[3], ordinal: m[2], ini: ini, fim: fim, rotulo: limpa(trecho(ini, fim)) });
      }
      achados.sort(function (a, b) { return a.ini - b.ini; });
      return { achados: achados, vetados: vetados };
    },

    /* ------------------------------------------------------------------ nós
       Normaliza as três entradas possíveis para a MESMA lista de nós com a
       MESMA chave, para que o plano feito sobre o orçamento case com o
       resultado do cronograma sem replicar a regra de id do `Cronograma.eap`
       (id de item pode ser nulo lá; aqui a chave é sempre por ÍNDICE, que os
       dois lados têm). */
    _nos: function (alvo) {
      var lista = [], fonte = "";
      function chaveEt(i) { return "E" + i; }
      function chaveSub(i, sid) { return "E" + i + "|S" + esc(sid); }
      function chaveServ(i, j) { return "E" + i + "|I" + j; }

      var nos = null;
      if (Array.isArray(alvo)) nos = alvo;
      else if (alvo && Array.isArray(alvo.atividades)) nos = alvo.atividades;

      if (nos) {
        fonte = "atividades";
        nos.forEach(function (n) {
          if (!n || n.tipo === "soltos") return; // nó sintético do agrupador: não tem nome de obra
          var i = n.etapaIdx;
          if (!(i >= 0)) return;
          if (n.tipo === "etapa") lista.push({ chave: chaveEt(i), tipo: "etapa", nome: txt(n.nome), paiChave: null, no: n });
          else if (n.tipo === "subetapa") lista.push({ chave: chaveSub(i, n.subEtapaId), tipo: "subetapa", nome: txt(n.nome), paiChave: chaveEt(i), no: n });
          else if (n.tipo === "servico") lista.push({ chave: chaveServ(i, n.itemIdx), tipo: "servico", nome: txt(n.nome),
            paiChave: n.subEtapaId ? chaveSub(i, n.subEtapaId) : chaveEt(i), no: n });
        });
        return { lista: lista, fonte: fonte };
      }

      fonte = "orcamento";
      arr(alvo && alvo.etapas).forEach(function (e, i) {
        if (!e) return;
        lista.push({ chave: chaveEt(i), tipo: "etapa", nome: txt(e.nome), paiChave: null, no: null });
        var valido = {};
        arr(e.subetapas).forEach(function (s) {
          if (!s || s.id == null) return;
          valido[s.id] = true;
          lista.push({ chave: chaveSub(i, s.id), tipo: "subetapa", nome: txt(s.nome), paiChave: chaveEt(i), no: null });
        });
        arr(e.itens).forEach(function (it, j) {
          if (!it) return;
          // a MESMA regra do `eap`: subetapa que não existe mais devolve o item
          // ao colo da etapa (senão o serviço ficaria órfão de pai e sem irmãos)
          var sid = (it.subEtapaId && own(valido, it.subEtapaId)) ? it.subEtapaId : "";
          lista.push({ chave: chaveServ(i, j), tipo: "servico", nome: txt(it.descricao),
            paiChave: sid ? chaveSub(i, sid) : chaveEt(i), no: null });
        });
      });
      return { lista: lista, fonte: fonte };
    },

    /* ------------------------------------------------------------ locaisDe
       Descobre a repetição por local nos NOMES. Devolve o PLANO que o
       `montar` consome: quais são os locais, na ordem, e qual nó é o ponto de
       cada serviço em cada local.
       Sem repetição, devolve `temLocais:false` com um motivo que diz o que
       falta e como resolver — aviso genérico a pessoa lê como formalidade. */
    locaisDe: function (alvo, opc) {
      var self = this;
      opc = opc || {};
      var min = (opc.minLocais > 0) ? Math.floor(opc.minLocais) : this.MIN_LOCAIS;
      var N = this._nos(alvo), lista = N.lista;
      if (!lista.length) {
        return { temLocais: false, minLocais: min, locais: [], servicos: [], foraDoPadrao: [], alternativas: [],
          motivo: "Não há etapas neste orçamento — sem EAP não há nome onde procurar local." };
      }

      var porChave = {}, filhos = {}, tok = {};
      lista.forEach(function (n) {
        porChave[n.chave] = n;
        if (n.paiChave) { if (!own(filhos, n.paiChave)) filhos[n.paiChave] = []; filhos[n.paiChave].push(n); }
        tok[n.chave] = self._tokens(n.nome);
      });

      var EIXOS = ["subetapa", "etapa", "servico"];
      var cands = [], quase = [];
      EIXOS.forEach(function (eixo) {
        if (opc.eixo && opc.eixo !== eixo) return;
        var doEixo = lista.filter(function (n) { return n.tipo === eixo; });
        /* ⚠ NÃO cortar o eixo por ter menos nós que o mínimo. Cortava, e o
           orçamento com "Pavimento 1"/"Pavimento 2" caía no motivo genérico
           ("nenhum nome traz um local numerado") — que é FALSO: os dois nomes
           trazem. A pessoa lia "o app não entendeu" quando a verdade era "são
           dois, preciso de três". Recado que mente é pior que recado nenhum. */
        if (!doEixo.length) return;
        var pals = {};
        doEixo.forEach(function (n) { tok[n.chave].achados.forEach(function (a) { pals[a.palavra] = true; }); });
        Object.keys(pals).forEach(function (p) {
          if (opc.palavra && fold(opc.palavra) !== p) return;
          var c = self._avaliar(eixo, doEixo, p, min, tok, filhos, porChave, opc);
          if (c && c.ok) cands.push(c);
          else if (c) quase.push(c);
        });
      });

      if (!cands.length) return this._semLocais(lista, tok, quase, min, opc);

      // melhor candidato: confiança, depois nº de locais, depois a ordem dos
      // eixos (subetapa é o eixo natural da LBS em orçamento brasileiro)
      cands.sort(function (a, b) {
        if (b.confianca !== a.confianca) return b.confianca - a.confianca;
        if (b.locais.length !== a.locais.length) return b.locais.length - a.locais.length;
        return EIXOS.indexOf(a.eixo) - EIXOS.indexOf(b.eixo);
      });
      var v = cands[0];
      v.alternativas = cands.slice(1).map(function (c) {
        return { eixo: c.eixo, palavra: c.palavra, modo: c.modo, granularidade: c.granularidade,
          locais: c.locais.length, servicos: c.servicos.length, confianca: c.confianca, nivel: c.nivel };
      });
      delete v.ok;
      return v;
    },

    /* Avalia UM par (eixo, palavra). Devolve o candidato com `ok:true` quando
       passa na trava da SÉRIE, ou com `ok:false` + `motivo` quando chegou
       perto — o "chegou perto" é o que a tela mostra para a pessoa entender
       por que a linha de balanço não apareceu. */
    _avaliar: function (eixo, doEixo, palavra, min, tok, filhos, porChave, opc) {
      var comTok = [], fora = [], i;
      doEixo.forEach(function (n) {
        var achados = tok[n.chave].achados.filter(function (a) { return a.palavra === palavra; });
        if (achados.length === 1) comTok.push({ no: n, a: achados[0] });
        else if (achados.length > 1) fora.push({ chave: n.chave, nome: n.nome, motivo: "mais de um \"" + palavra + "\" no nome — não dá para saber qual é o local" });
      });
      if (comTok.length < min) {
        return { ok: false, eixo: eixo, palavra: palavra, achou: comTok.length,
          motivo: "\"" + palavra + "\" aparece em " + plural(comTok.length, "nome", "nomes") + " deste nível — abaixo do mínimo de " + min + " locais." };
      }

      // FAMÍLIA da série (a maioria manda; empate: número > romano > letra)
      var cont = { numero: 0, romano: 0, letra: 0 };
      comTok.forEach(function (x) { familiasDe(x.a.ordinal).forEach(function (f) { cont[f]++; }); });
      var fam = ["numero", "romano", "letra"].reduce(function (m, f) { return cont[f] > cont[m] ? f : m; }, "numero");
      if (!cont[fam]) return { ok: false, eixo: eixo, palavra: palavra, motivo: "nenhum ordinal reconhecível depois de \"" + palavra + "\"." };
      var bons = [];
      comTok.forEach(function (x) {
        if (familiasDe(x.a.ordinal).indexOf(fam) > -1) { x.valor = valorNa(x.a.ordinal, fam); bons.push(x); }
        else fora.push({ chave: x.no.chave, nome: x.no.nome, motivo: "\"" + x.a.rotulo + "\" não é " + NOME_FAM[fam] + " — a série deste orçamento é em " + NOME_FAM[fam] });
      });

      /* TRONCO: o nome sem o pedaço do local. Tronco vazio = o nó É o local
         ("Pavimento 3" e nada mais) — é a LBS clássica, modo "no". Tronco
         cheio = o local está no nome do serviço ("Alvenaria - Casa 03"),
         modo "sufixo". */
      var stems = {}, ordemStem = [];
      bons.forEach(function (x) {
        var cru = limpa(x.no.nome.slice(0, x.a.ini) + x.no.nome.slice(x.a.fim));
        var k = fold(cru).replace(/\s{2,}/g, " ");
        if (!own(stems, k)) { stems[k] = { chave: k, nome: cru, itens: [], valores: {} }; ordemStem.push(k); }
        stems[k].itens.push(x);
        stems[k].valores[x.valor] = true;
      });
      function nDist(s) { return Object.keys(s.valores).length; }
      var puro = own(stems, "") ? stems[""] : null;
      var modo = (puro && nDist(puro) >= min) ? "no" : "sufixo";

      var repetidos = [], maior = 0;
      ordemStem.forEach(function (k) {
        var s = stems[k], d = nDist(s);
        if (d > maior) maior = d;
        if (modo === "no") { if (k === "") repetidos.push(s); return; }
        if (d >= 2 && k !== "") repetidos.push(s);
        else if (k !== "") fora.push({ chave: s.itens[0].no.chave, nome: s.itens[0].no.nome, motivo: "\"" + s.nome + "\" aparece em um único local — sem repetição não entra na linha de balanço" });
      });
      if (modo === "sufixo" && maior < min) {
        return { ok: false, eixo: eixo, palavra: palavra,
          motivo: "\"" + palavra + "\" aparece em " + plural(bons.length, "nome", "nomes") + ", mas nenhum serviço se repete em " + min + " locais (o maior repete em " + maior + ")." };
      }
      if (!repetidos.length) return { ok: false, eixo: eixo, palavra: palavra, motivo: "\"" + palavra + "\" não formou série repetida." };

      // LOCAIS: união dos ordinais dos troncos repetidos, na ordem do ordinal
      var locMap = {}, vals = [];
      repetidos.forEach(function (s) {
        s.itens.forEach(function (x) {
          if (!own(locMap, x.valor)) { locMap[x.valor] = { valor: x.valor, rotulo: x.a.rotulo, variantes: {} }; vals.push(x.valor); }
          locMap[x.valor].variantes[x.a.rotulo] = true;
        });
      });
      vals.sort(function (a, b) { return a - b; });
      if (vals.length < min) {
        return { ok: false, eixo: eixo, palavra: palavra,
          motivo: "\"" + palavra + "\" formou " + plural(vals.length, "local", "locais") + " — abaixo do mínimo de " + min + "." };
      }
      var locais = vals.map(function (v, idx) {
        var L = locMap[v], vr = Object.keys(L.variantes);
        return { idx: idx, valor: v, rotulo: L.rotulo, ordinal: String(v), variantes: vr.length > 1 ? vr : null };
      });
      var idxDe = {};
      vals.forEach(function (v, idx) { idxDe[v] = idx; });

      // SERVIÇOS (as linhas do gráfico) + o ponto de cada um em cada local
      var servicos = [], semRepeticao = 0, granularidade = eixo;
      if (modo === "sufixo") {
        repetidos.forEach(function (s, si) {
          var pontos = {}, dup = 0;
          s.itens.forEach(function (x) {
            var li = idxDe[x.valor];
            if (own(pontos, li)) { dup++; fora.push({ chave: x.no.chave, nome: x.no.nome, motivo: "segundo \"" + x.a.rotulo + "\" para o mesmo serviço — só o primeiro entra" }); return; }
            pontos[li] = x.no.chave;
          });
          if (Object.keys(pontos).length < 2) { semRepeticao++; return; }
          servicos.push({ chave: "s" + si, nome: s.nome || "(sem nome)", pontosChave: pontos });
        });
      } else {
        /* modo "no": o nó É o local. Quem vira LINHA?
           - se os locais estão sob PAIS DIFERENTES ("Alvenaria > Pav 1..12",
             "Reboco > Pav 1..12"), a linha é o PAI — uma linha por trade, que
             é a leitura clássica da LOB;
           - se estão todos sob UM pai, a linha é o FILHO (os serviços dentro
             de cada local). Forçável por `opc.granularidade`. */
        var paisSet = {}, nPais = 0;
        puro.itens.forEach(function (x) { if (x.no.paiChave && !own(paisSet, x.no.paiChave)) { paisSet[x.no.paiChave] = true; nPais++; } });
        var temFilho = false;
        puro.itens.forEach(function (x) { if (own(filhos, x.no.chave) && filhos[x.no.chave].length) temFilho = true; });
        var gran = opc.granularidade === "pai" ? "pai" : (opc.granularidade === "filho" ? "filho" : (nPais >= 2 ? "pai" : "filho"));
        if (gran === "filho" && !temFilho) gran = "pai";
        if (gran === "pai" && !nPais) gran = "filho";

        if (gran === "pai") {
          granularidade = "pai";
          var porPai = {}, ordemPai = [];
          puro.itens.forEach(function (x) {
            var pk = x.no.paiChave || "";
            if (!own(porPai, pk)) { porPai[pk] = { chave: pk, nome: (porChave[pk] && porChave[pk].nome) || "(sem etapa)", pontos: {} }; ordemPai.push(pk); }
            var li = idxDe[x.valor];
            if (own(porPai[pk].pontos, li)) { fora.push({ chave: x.no.chave, nome: x.no.nome, motivo: "segundo \"" + x.a.rotulo + "\" na mesma etapa — só o primeiro entra" }); return; }
            porPai[pk].pontos[li] = x.no.chave;
          });
          ordemPai.forEach(function (pk) {
            var P = porPai[pk];
            if (Object.keys(P.pontos).length < 2) { semRepeticao++; return; }
            servicos.push({ chave: "p" + pk, nome: P.nome, pontosChave: P.pontos });
          });
        } else {
          granularidade = "filho";
          var porNome = {}, ordemNome = [];
          puro.itens.forEach(function (x) {
            var li = idxDe[x.valor];
            (filhos[x.no.chave] || []).forEach(function (fn) {
              var k = fold(limpa(fn.nome));
              if (!k) return;
              if (!own(porNome, k)) { porNome[k] = { chave: k, nome: limpa(fn.nome), pontos: {} }; ordemNome.push(k); }
              if (own(porNome[k].pontos, li)) return; // dois serviços de mesmo nome no mesmo local: o primeiro manda
              porNome[k].pontos[li] = fn.chave;
            });
          });
          ordemNome.forEach(function (k) {
            var S = porNome[k];
            if (Object.keys(S.pontos).length < 2) { semRepeticao++; return; }
            servicos.push({ chave: "f" + k, nome: S.nome, pontosChave: S.pontos });
          });
        }
      }
      if (!servicos.length) {
        return { ok: false, eixo: eixo, palavra: palavra,
          motivo: "\"" + palavra + "\" formou " + plural(locais.length, "local", "locais") + ", mas nenhum serviço aparece em dois locais — uma linha precisa de dois pontos." };
      }

      /* ------------------------------------------------- confiança (heurística)
         ⚠ É ESTIMATIVA, e sai rotulada como tal. Quatro parcelas, cada uma
         em [0;1], todas devolvidas em `parcelas` para a tela poder dizer POR
         QUE a confiança é essa — confiança que não se explica a pessoa não
         usa (ou pior: usa achando que é medida). */
      var grupos = {}, noGrupo = 0, comLocalNoGrupo = 0;
      comTok.forEach(function (x) { grupos[x.no.paiChave || ""] = true; });
      doEixo.forEach(function (n) { if (own(grupos, n.paiChave || "")) noGrupo++; });
      bons.forEach(function (x) { if (own(grupos, x.no.paiChave || "")) comLocalNoGrupo++; });
      var fCob = noGrupo > 0 ? Math.min(1, comLocalNoGrupo / noGrupo) : 0;
      var fSer = locais.length / (vals[vals.length - 1] - vals[0] + 1);
      var somaRep = 0;
      servicos.forEach(function (s) { somaRep += Object.keys(s.pontosChave).length / locais.length; });
      var fRep = servicos.length ? somaRep / servicos.length : 0;
      var fQtd = Math.min(1, locais.length / 6);
      var conf = arred(0.30 * fCob + 0.30 * fSer + 0.25 * fRep + 0.15 * fQtd, 3);

      return {
        ok: true, temLocais: true,
        eixo: eixo, modo: modo, granularidade: granularidade, palavra: palavra, familia: fam,
        minLocais: min, locais: locais, servicos: servicos,
        confianca: conf, nivel: conf >= 0.75 ? "alta" : (conf >= 0.5 ? "media" : "baixa"),
        heuristica: true, rotulo: LOB.ROTULO_HEURISTICA,
        parcelas: { cobertura: arred(fCob, 3), serie: arred(fSer, 3), repeticao: arred(fRep, 3), quantidade: arred(fQtd, 3) },
        cobertura: { comLocal: bons.length, noEixo: doEixo.length, noGrupo: noGrupo, comLocalNoGrupo: comLocalNoGrupo },
        semRepeticao: semRepeticao,
        foraDoPadrao: fora,
        alternativas: [],
        motivo: ""
      };
    },

    /* Sem série nenhuma: o motivo tem de CONTAR o que foi visto. "Não achei"
       manda a pessoa procurar defeito no app; "achei Pavimento em 2 nomes,
       preciso de 3" manda ela renomear — e é verdade. */
    _semLocais: function (lista, tok, quase, min, opc) {
      var vet = [], nVet = 0, porTipo = { etapa: 0, subetapa: 0, servico: 0 };
      lista.forEach(function (n) {
        if (own(porTipo, n.tipo)) porTipo[n.tipo]++;
        tok[n.chave].vetados.forEach(function (v) { nVet++; if (vet.length < 12) vet.push({ chave: n.chave, nome: n.nome, trecho: v.trecho, motivo: v.motivo }); });
      });
      quase.sort(function (a, b) { return (b.achou || 0) - (a.achou || 0); });
      var motivo;
      if (quase.length && quase[0].motivo) {
        motivo = "Não há repetição por local suficiente: " + quase[0].motivo +
          " A linha de balanço precisa de pelo menos " + min + " locais com o mesmo serviço (ex.: \"Pavimento 1\", \"Pavimento 2\", \"Pavimento 3\").";
      } else {
        motivo = "Nenhum local nos nomes: entre " + plural(porTipo.subetapa, "subetapa", "subetapas") + " e " +
          plural(porTipo.servico, "serviço", "serviços") + " deste orçamento, nenhum nome traz um local numerado." +
          " A linha de balanço só existe em obra repetitiva — para usá-la, nomeie o que repete com o local" +
          " (ex.: \"Pavimento 1\", \"Casa 03\", \"Torre A\").";
      }
      return { temLocais: false, minLocais: min, eixo: null, modo: null, palavra: null,
        locais: [], servicos: [], foraDoPadrao: [], alternativas: [],
        quase: quase.map(function (q) { return { eixo: q.eixo, palavra: q.palavra, motivo: q.motivo }; }),
        vetados: vet, vetadosTotal: nVet,
        confianca: 0, nivel: "nenhuma", heuristica: true, rotulo: LOB.ROTULO_HEURISTICA,
        motivo: motivo };
    },

    /* -------------------------------------------------------------- montar
       `r`     = `Cronograma.estimar(orc, null, {eap:true})` — as DATAS vêm
                 todas de lá; este arquivo não calcula duração nenhuma.
       `plano` = o retorno de `locaisDe`.
       `opc.dia(k)` = opcional, índice de dia útil → Date (ex.:
                 `Cronograma.calendario(r).dia`). Sem ela, a data de um ponto
                 interpolado fica NULA em vez de inventada. */
    montar: function (r, plano, opc) {
      var self = this;
      opc = opc || {};
      if (!r || !Array.isArray(r.atividades)) {
        return { temLob: false, servicos: [], locais: [], cruzamentos: [], sobreposicoes: [], folgas: [], avisos: [],
          motivo: "O cronograma foi calculado sem a árvore de subetapas — chame Cronograma.estimar(orc, null, {eap:true}). Sem ela não há data por subetapa nem por serviço, e a linha de balanço não tem pontos." };
      }
      if (!plano || !plano.temLocais) {
        return { temLob: false, servicos: [], locais: [], cruzamentos: [], sobreposicoes: [], folgas: [], avisos: [],
          motivo: (plano && plano.motivo) || "Sem locais detectados — chame LOB.locaisDe primeiro." };
      }

      var N = this._nos(r), porChave = {};
      N.lista.forEach(function (n) { porChave[n.chave] = n.no; });
      // dia útil → data, usando as datas que o motor já pôs nos nós; é exato
      // onde existe e NULO onde não existe (ver o ⚠ do cabeçalho)
      var calNo = {};
      N.lista.forEach(function (n) {
        var o = n.no;
        if (!o) return;
        if (o.inicio != null && o.dataInicio && !own(calNo, o.inicio)) calNo[o.inicio] = o.dataInicio;
        if (o.fim != null && o.dataFim && !own(calNo, o.fim)) calNo[o.fim] = o.dataFim;
      });
      function diaData(k) {
        if (k == null || !isFinite(k)) return null;
        if (typeof opc.dia === "function") { try { return opc.dia(k) || null; } catch (e) { return null; } }
        return own(calNo, k) ? calNo[k] : null;
      }

      var locais = plano.locais, avisos = [], servicos = [], semData = 0;
      plano.servicos.forEach(function (S) {
        var pontos = [], lacunas = [];
        locais.forEach(function (L) {
          if (!own(S.pontosChave, L.idx)) { lacunas.push({ idx: L.idx, rotulo: L.rotulo, motivo: "o serviço não existe neste local" }); return; }
          var no = porChave[S.pontosChave[L.idx]];
          if (!no) { lacunas.push({ idx: L.idx, rotulo: L.rotulo, motivo: "o nó não está no cronograma calculado" }); return; }
          /* ⚠ serviço sem quantidade sai do motor com inicio/fim NULOS
             (`_distribuir`). Ele NÃO vira ponto: uma reta traçada por cima de
             um buraco seria exatamente o "local inventado" que este arquivo
             existe para impedir. Vira lacuna declarada. */
          if (no.inicio == null || no.fim == null) {
            semData++;
            lacunas.push({ idx: L.idx, rotulo: L.rotulo, motivo: "sem data no cronograma (serviço sem quantidade ou sem base)" });
            return;
          }
          pontos.push({ idx: L.idx, local: L.rotulo, inicio: no.inicio, fim: no.fim, dias: no.fim - no.inicio,
            dataInicio: no.dataInicio || null, dataFim: no.dataFim || null,
            de: dma(no.dataInicio), ate: dma(no.dataFim),
            noId: no.id, numero: no.numero, nome: no.nome, cor: no.cor || null, critico: !!no.critico });
        });
        pontos.sort(function (a, b) { return a.idx - b.idx; });
        var rt = self._reta(pontos), simples = self._ritmoSimples(pontos);
        var ini = null, fim = null;
        pontos.forEach(function (p) {
          if (ini == null || p.inicio < ini) ini = p.inicio;
          if (fim == null || p.fim > fim) fim = p.fim;
        });
        servicos.push({
          chave: S.chave, nome: S.nome, cor: (pontos[0] && pontos[0].cor) || null,
          pontos: pontos, lacunas: lacunas,
          inicio: ini, fim: fim, dias: (ini != null && fim != null) ? fim - ini : null,
          dataInicio: diaData(ini), dataFim: diaData(fim),
          reta: rt, ritmo: rt ? arred(rt.a, 4) : null,
          ritmoSimples: simples != null ? arred(simples, 4) : null,
          diasPorLocal: (rt && rt.a > 0) ? arred(1 / rt.a, 2) : null,
          r2: rt && rt.r2 != null ? arred(rt.r2, 3) : null,
          r2Motivo: (rt && rt.r2 == null) ? (rt.r2Motivo || "") : "",
          semRitmo: !rt,
          // quantos locais do plano esta linha realmente cobre — é o que
          // separa "ritmo medido" de "reta por cima de buraco"
          locaisDoPlano: locais.length, pontosComData: pontos.length,
          cobertura: locais.length ? arred(pontos.length / locais.length, 3) : 0,
          parcial: pontos.length < locais.length,
          ritmoTexto: self._ritmoTexto(rt, pontos, locais.length)
        });
      });

      if (!servicos.length) {
        return { temLob: false, servicos: [], locais: locais, cruzamentos: [], sobreposicoes: [], folgas: [], avisos: avisos,
          motivo: "Os locais existem, mas nenhum serviço deles tem data no cronograma — nada a desenhar." };
      }
      if (semData) avisos.push({ tipo: "sem-data", n: semData,
        msg: plural(semData, "ponto ficou", "pontos ficaram") + " de fora: o serviço não tem data no cronograma (sem quantidade ou sem base). A linha é traçada só pelos pontos que existem — nada é interpolado." });
      if (servicos.length === 1) avisos.push({ tipo: "uma-linha",
        msg: "Só um serviço repete por local: a linha de balanço mostra uma linha só, e sem duas linhas não há cruzamento de equipe a mostrar." });

      // ordem de plano: quem começa antes. É a ordem em que as equipes entram
      // na obra, e é sobre ela que a folga entre equipes faz sentido.
      var ordem = servicos.slice().sort(function (a, b) {
        if (a.inicio !== b.inicio) return (a.inicio == null ? 1e9 : a.inicio) - (b.inicio == null ? 1e9 : b.inicio);
        return a.nome < b.nome ? -1 : (a.nome > b.nome ? 1 : 0);
      });
      var max = opc.maxLinhas > 0 ? opc.maxLinhas : 500;
      var cr = this._cruzamentos(servicos, locais, diaData, max);
      var sb = this._sobreposicoes(servicos, locais, diaData, max);
      var fg = this._folgas(ordem, locais, diaData);

      var janela = { dias: r.totalDias != null ? r.totalDias : null,
        de: r.dataInicio || null, ate: r.dataFim || null,
        deTexto: dma(r.dataInicio), ateTexto: dma(r.dataFim) };
      var apertadas = fg.filter(function (f) { return f.folgaMinima != null && f.folgaMinima < 0; }).length;
      /* ⚠ O RESUMO NÃO PODE DIZER O NÚMERO DA LISTA CORTADA. Medido num prédio
         de 12 pavimentos com 60 serviços: a lista para em 500 (`maxLinhas`) e
         o resumo dizia "500 sobreposições de local" quando eram 708 — errado
         por 208, com cara de exato, e `avisos` voltava VAZIO. O objeto já
         sabia (`sobreposicoesTruncado: true`); quem lia a frase, não. */
      function conta(lista, truncado, s1, s2) {
        return truncado ? ("as primeiras " + lista.length + " " + s2 + " (há mais)") : plural(lista.length, s1, s2);
      }
      var resumo = plural(locais.length, "local", "locais") + " (" + plano.palavra + "), " +
        plural(servicos.length, "serviço", "serviços") + " repetido" + (servicos.length === 1 ? "" : "s") + ", " +
        conta(cr.lista, cr.truncado, "cruzamento", "cruzamentos") + " e " +
        conta(sb.lista, sb.truncado, "sobreposição de local", "sobreposições de local") + ".";
      if (cr.truncado) avisos.push({ tipo: "truncado", o: "cruzamentos", n: cr.lista.length, max: max,
        msg: "Parei de listar em " + cr.lista.length + " cruzamentos — há mais. Os números desta tela contam só os listados; aumente opc.maxLinhas para ver todos." });
      if (sb.truncado) avisos.push({ tipo: "truncado", o: "sobreposicoes", n: sb.lista.length, max: max,
        msg: "Parei de listar em " + sb.lista.length + " sobreposições de local — há mais. Os números desta tela contam só as listadas; aumente opc.maxLinhas para ver todas." });

      /* ⚠ A CONFIANÇA DO PLANO NÃO SABE DOS BURACOS. Ela é calculada sobre os
         NOMES (o `locaisDe` nem viu o cronograma) e o `montar` a copiava
         inteira — então uma obra em que metade dos pontos não tem data saía
         com confiança 1 e nível "alta" ao lado de um gráfico furado.
         Confiança que não se explica não se usa: aqui ela é REBAIXADA pela
         fração de pontos que viraram ponto com data, e as duas parcelas vão
         separadas para a tela poder dizer de onde veio cada uma. */
      var ptsPlano = 0, ptsComData = 0;
      servicos.forEach(function (s) { ptsPlano += locais.length; ptsComData += s.pontos.length; });
      var cobPontos = ptsPlano > 0 ? arred(ptsComData / ptsPlano, 3) : 0;
      var confBruta = plano.confianca, conf = arred(confBruta * cobPontos, 3);
      var nivel = conf >= 0.75 ? "alta" : (conf >= 0.5 ? "media" : "baixa");
      if (cobPontos < 1) avisos.push({ tipo: "confianca", msg: "Confiança rebaixada de " + confBruta + " para " + conf
        + ": " + ptsComData + " de " + ptsPlano + " pontos do gráfico têm data no cronograma. O resto é lacuna declarada — nada foi interpolado." });

      return {
        temLob: true, motivo: "",
        eixo: plano.eixo, modo: plano.modo, granularidade: plano.granularidade, palavra: plano.palavra,
        confianca: conf, confiancaDoPlano: confBruta, coberturaPontos: cobPontos,
        pontosDoPlano: ptsPlano, pontosComData: ptsComData,
        nivel: nivel, heuristica: true, rotulo: plano.rotulo,
        locais: locais, servicos: servicos, ordem: ordem.map(function (s) { return s.chave; }),
        cruzamentos: cr.lista, cruzamentosTruncado: cr.truncado,
        sobreposicoes: sb.lista, sobreposicoesTruncado: sb.truncado,
        folgas: fg, equipesApertadas: apertadas,
        janela: janela, avisos: avisos, resumo: resumo,
        foraDoPadrao: plano.foraDoPadrao || []
      };
    },

    // atalho de fiação: descobre e monta numa chamada só
    de: function (orc, r, opc) {
      var plano = this.locaisDe(orc, opc);
      var m = this.montar(r, plano, opc);
      m.plano = plano;
      return m;
    },

    /* --------------------------------------------------------------- retas
       Mínimos quadrados de localIdx (y) sobre o dia de início (x): a
       inclinação É o ritmo em LOCAIS POR DIA ÚTIL. O R² sai junto de
       propósito — é ele que diz se aquilo é ritmo mesmo ou é ruído com
       cara de reta, e ritmo sem R² a pessoa lê como promessa.

       ⚠ COM 2 PONTOS NÃO HÁ R² A DAR, E ELE SAÍA 1. A reta passa EXATA por
       dois pontos por construção: o ajuste perfeito não é prova de ritmo, é
       aritmética. E era justamente a linha com menos dado que saía com o
       selo máximo de qualidade — medido numa obra de 6 pavimentos em que o
       reboco só existe no 1º e no 6º: alvenaria com 6 de 6 pontos dava
       R² 0,987 e o reboco com 2 de 6 dava R² 1. É a mesma doutrina do
       MIN_LOCAIS = 3 deste arquivo, aplicada ao ajuste: com dois, a "linha"
       de balanço é uma reta entre dois pontos. `a` e `b` continuam saindo
       (a inclinação entre dois pontos é o que é); o que não sai é o SELO. */
    R2_MIN_PONTOS: 3,
    R2_MOTIVO_2: "dois pontos: a reta passa exata por eles, o R² não mede nada",
    _reta: function (pontos) {
      var n = pontos.length;
      if (n < 2) return null;
      var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, i, x, y;
      for (i = 0; i < n; i++) {
        x = pontos[i].inicio; y = pontos[i].idx;
        sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
      }
      var den = n * sxx - sx * sx;
      // todos os locais começam no mesmo dia: não há ritmo a medir (e dividir
      // por zero aqui devolveria Infinity com cara de "muito rápido")
      if (!(Math.abs(den) > 1e-9)) return null;
      var a = (n * sxy - sx * sy) / den, b = (sy - a * sx) / n;
      var denR = den * (n * syy - sy * sy);
      var out = { a: a, b: b, r2: denR > 1e-9 ? (n * sxy - sx * sy) * (n * sxy - sx * sy) / denR : null, n: n };
      if (n < this.R2_MIN_PONTOS) { out.r2 = null; out.r2Motivo = this.R2_MOTIVO_2; }
      return out;
    },
    // ritmo do primeiro ao último local, sem ajuste — o número que o
    // engenheiro confere na mão ("do 1º ao 12º andar foram 66 dias")
    _ritmoSimples: function (pontos) {
      if (pontos.length < 2) return null;
      var a = pontos[0], b = pontos[pontos.length - 1], dx = b.inicio - a.inicio;
      if (!(Math.abs(dx) > 1e-9)) return null;
      return (b.idx - a.idx) / dx;
    },
    /* ⚠ A FRASE DIZ SOBRE QUANTOS LOCAIS O RITMO FOI MEDIDO. Sem isso, o
       serviço com 2 pontos de 6 locais tinha a MESMA frase do serviço com 6
       de 6 — e a frase é o que vai para a tela. "Um local a cada 8 dias
       úteis" lido ao lado de um gráfico com quatro buracos é promessa, não
       medida. `nLocais` é o total do plano; quando ele não vier (chamada
       isolada), a frase volta a ser a curta, sem inventar denominador. */
    _ritmoTexto: function (rt, pontos, nLocais) {
      if (!rt) return pontos.length < 2 ? "um ponto só — sem ritmo" : "todos os locais começam no mesmo dia — sem ritmo";
      if (!(rt.a > 0)) return "a ordem dos locais não avança no tempo — confira a sequência";
      var d = arred(1 / rt.a, 1);
      var s = "um local a cada " + d + (d === 1 ? " dia útil" : " dias úteis");
      if (nLocais > 0 && pontos.length < nLocais) {
        var a = pontos[0], b = pontos[pontos.length - 1];
        s += ", medido entre " + txt(a.local) + " e " + txt(b.local) + " — " + (nLocais - pontos.length)
          + " dos " + nLocais + " locais não têm data (nada foi interpolado)";
      }
      return s;
    },

    /* ---------------------------------------------------------- cruzamentos
       Duas linhas se cruzam quando a ORDEM das equipes se inverte entre dois
       locais: B começa depois de A no local i e antes de A no local i+1.
       ⚠ É medido nos PONTOS REAIS, nunca nas retas ajustadas — a reta é um
       resumo, e um cruzamento que só existe no resumo é cruzamento que não
       existe na obra. A data do cruzamento fica NULA quando cai entre dois
       dias úteis que nenhum nó ocupa: os dois locais-âncora vão junto com as
       datas de verdade, que é o que se leva para a reunião. */
    _cruzamentos: function (servicos, locais, diaData, max) {
      var lista = [], truncado = false, i, j;
      for (i = 0; i < servicos.length && !truncado; i++) {
        for (j = i + 1; j < servicos.length && !truncado; j++) {
          var A = servicos[i], B = servicos[j], comuns = this._comuns(A, B), k;
          /* ⚠ o sinal ZERO não fecha nem abre cruzamento: ele é empate. Guardar
             o último sinal NÃO-ZERO é o que faz um platô no meio da série
             (dois locais começando no mesmo dia) parar de esconder a inversão
             que vem depois dele — e é o que impede "começaram juntos e um
             puxou na frente" de ser contado como troca de ordem, porque aí
             nunca houve um sinal anterior a inverter. */
          var ant = null, antIdx = -1;
          for (k = 0; k < comuns.length; k++) {
            var pc = comuns[k], d = pc.b.inicio - pc.a.inicio;
            if (d === 0) continue;
            var sinal = d > 0 ? 1 : -1;
            if (ant === null || sinal === ant) { ant = sinal; antIdx = k; continue; }
            var p1 = comuns[antIdx], p2 = pc;
            var d1 = p1.b.inicio - p1.a.inicio, d2 = d;
            ant = sinal; antIdx = k;
            var t = d1 / (d1 - d2);
            var dia = Math.round(p1.a.inicio + t * (p2.a.inicio - p1.a.inicio));
            lista.push({
              a: A.chave, b: B.chave, aNome: A.nome, bNome: B.nome,
              entre: [p1.idx, p2.idx], locais: [p1.rotulo, p2.rotulo],
              diaAprox: dia, dataAprox: diaData(dia), dataAproxTexto: dma(diaData(dia)),
              ancoras: [{ local: p1.rotulo, a: p1.a.de, b: p1.b.de }, { local: p2.rotulo, a: p2.a.de, b: p2.b.de }],
              msg: "\"" + A.nome + "\" e \"" + B.nome + "\" trocam de ordem entre " + p1.rotulo + " e " + p2.rotulo + " — as equipes se atropelam nesse trecho."
            });
            if (lista.length >= max) { truncado = true; break; }
          }
        }
      }
      return { lista: lista, truncado: truncado };
    },

    /* ------------------------------------------------------- sobreposições
       Dois serviços ocupando o MESMO local ao mesmo tempo. Não é sentença:
       elétrica e hidráulica no mesmo pavimento pode ser de propósito. Por
       isso sai como fato medido (quantos dias, onde, quando) e o julgamento
       fica com quem conhece a obra — recado que decide no lugar da pessoa é
       recado que ela desliga. */
    _sobreposicoes: function (servicos, locais, diaData, max) {
      var lista = [], truncado = false, i, j;
      for (i = 0; i < servicos.length && !truncado; i++) {
        for (j = i + 1; j < servicos.length && !truncado; j++) {
          var A = servicos[i], B = servicos[j], comuns = this._comuns(A, B), k;
          for (k = 0; k < comuns.length; k++) {
            var c = comuns[k];
            var de = Math.max(c.a.inicio, c.b.inicio), ate = Math.min(c.a.fim, c.b.fim);
            // fim é exclusivo: encostar (fimA === iniB) não é sobrepor
            if (!(ate > de)) continue;
            lista.push({
              a: A.chave, b: B.chave, aNome: A.nome, bNome: B.nome,
              idx: c.idx, local: c.rotulo, dias: ate - de,
              de: diaData(de), ate: diaData(ate), deTexto: dma(diaData(de)), ateTexto: dma(diaData(ate)),
              msg: "\"" + A.nome + "\" e \"" + B.nome + "\" dividem " + c.rotulo + " por " + plural(ate - de, "dia útil", "dias úteis") + "."
            });
            if (lista.length >= max) { truncado = true; break; }
          }
        }
      }
      return { lista: lista, truncado: truncado };
    },

    /* --------------------------------------------------------------- folgas
       Folga entre equipes CONSECUTIVAS (na ordem em que entram na obra): em
       cada local, quantos dias úteis a equipe seguinte espera depois que a
       anterior sai. Negativa = as duas no mesmo local. É o número que vira
       pulmão — e é MEDIDO, não sugerido: este arquivo não propõe pulmão
       nenhum, porque propor exigiria produtividade que ele não tem. */
    _folgas: function (ordem, locais, diaData) {
      var out = [], i;
      for (i = 0; i + 1 < ordem.length; i++) {
        var A = ordem[i], B = ordem[i + 1], comuns = this._comuns(A, B);
        if (!comuns.length) {
          out.push({ a: A.chave, b: B.chave, aNome: A.nome, bNome: B.nome, folgaMinima: null, porLocal: [],
            msg: "\"" + A.nome + "\" e \"" + B.nome + "\" não dividem nenhum local — não há folga entre eles a medir." });
          continue;
        }
        var porLocal = comuns.map(function (c) { return { idx: c.idx, local: c.rotulo, folga: c.b.inicio - c.a.fim }; });
        var pior = porLocal[0];
        porLocal.forEach(function (p) { if (p.folga < pior.folga) pior = p; });
        out.push({
          a: A.chave, b: B.chave, aNome: A.nome, bNome: B.nome,
          folgaMinima: pior.folga, idx: pior.idx, local: pior.local, negativa: pior.folga < 0,
          porLocal: porLocal,
          msg: pior.folga < 0
            ? "\"" + B.nome + "\" entra em " + pior.local + " " + plural(-pior.folga, "dia útil", "dias úteis") + " antes de \"" + A.nome + "\" sair."
            : "menor espera entre \"" + A.nome + "\" e \"" + B.nome + "\": " + plural(pior.folga, "dia útil", "dias úteis") + " em " + pior.local + "."
        });
      }
      return out;
    },

    // locais onde OS DOIS serviços têm ponto, na ordem dos locais
    _comuns: function (A, B) {
      var mb = {}, out = [];
      B.pontos.forEach(function (p) { mb[p.idx] = p; });
      A.pontos.forEach(function (p) { if (own(mb, p.idx)) out.push({ idx: p.idx, rotulo: p.local, a: p, b: mb[p.idx] }); });
      out.sort(function (x, y) { return x.idx - y.idx; });
      return out;
    }
  };

  global.LOB = LOB;
  if (typeof module !== "undefined" && module.exports) module.exports = LOB;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
