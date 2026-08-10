/* =====================================================================
 * rdotexto.js — DO RECADO SOLTO AO DIÁRIO
 *
 * O mestre escreve no WhatsApp do jeito que ele fala:
 *   "hoje na vila verde concretamos a laje do bloco B, 8 pedreiros e
 *    2 ajudantes, parou 1 hora por causa da chuva"
 * Aqui isso vira campo de diário.
 *
 * POR QUE DETERMINÍSTICO, E NÃO IA:
 *  - roda de graça e sem chave, então funciona no dia em que a API cair,
 *    o cartão vencer ou o servidor da IA ficar lento;
 *  - é conferível: cada número extraído tem uma regra que dá para ler;
 *  - o resultado entra como RASCUNHO de qualquer jeito, então errar aqui
 *    custa uma correção na tela, não um documento contratual errado.
 * Quando houver IA no caminho, ela ENTRA NA FRENTE disto e este arquivo
 * continua sendo a rede embaixo.
 *
 * A REGRA QUE MANDA: no que não deu para entender, NÃO INVENTA. Campo
 * vazio vira pendência na tela; número chutado vira efetivo errado, que
 * vira medição errada, que vira dinheiro errado.
 * ===================================================================== */
(function (global) {
  "use strict";

  function texto(s) { return String(s == null ? "" : s).trim(); }
  function normal(s) {
    return texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  /* Número por extenso: o mestre escreve "oito pedreiros", não "8". */
  var EXTENSO = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
    sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
    quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
    dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50
  };
  function numDe(s) {
    var t = normal(s);
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    return EXTENSO[t] !== undefined ? EXTENSO[t] : null;
  }

  /* Quem é MÃO DE OBRA DIRETA (produz na obra) e quem é indireta (apoio e
     gestão). A divisão importa: ela alimenta o efetivo do diário, que é o
     que o cliente confere no Portal. */
  var DIRETO = ["pedreiro", "servente", "ajudante", "carpinteiro", "armador", "pintor",
    "eletricista", "encanador", "bombeiro", "azulejista", "gesseiro", "soldador",
    "operador", "motorista", "meio oficial", "oficial", "marceneiro", "vidraceiro",
    "impermeabilizador", "calceteiro", "ferreiro", "montador"];
  var INDIRETO = ["engenheiro", "arquiteto", "mestre", "encarregado", "tecnico",
    "estagiario", "apontador", "almoxarife", "vigia", "porteiro", "tst",
    "seguranca", "administrativo", "auxiliar administrativo"];

  /* ⚠ AS VARIANTES PRECISAM SER ÚNICAS.
     `plural("engenheiro")` devolvia ["engenheiro","engenheiros","engenheiro",
     "engenheiro"] — as duas últimas regras não mudam nada numa palavra que
     não termina em "ao" nem em "l". Como a trava de "uma vez por função"
     estava por VARIANTE, o mesmo engenheiro era contado três vezes: o
     efetivo triplicava sozinho e ninguém veria de onde veio. */
  function plural(p) {
    var v = [p, p + "s", p.replace(/ao$/, "oes"), p.replace(/l$/, "is")];
    return v.filter(function (x, i) { return v.indexOf(x) === i; });
  }

  /* Conta gente por função. Aceita "8 pedreiros", "oito pedreiros",
     "pedreiros: 8" e "pedreiro 8". */
  function contarEfetivo(t) {
    var n = normal(t), direto = 0, indireto = 0, achou = [];
    function varrer(lista, somar) {
      lista.forEach(function (base) {
        /* UMA vez por FUNÇÃO, não por variante de escrita: "5 pedreiros
           começaram ... os pedreiros terminaram" é o mesmo pessoal. */
        var qtd = null;
        plural(base).some(function (p) {
          var re = new RegExp("(?:(\\d+|[a-z]+)\\s+" + p + "\\b)|(?:\\b" + p + "\\s*:?\\s*(\\d+))", "g");
          var m;
          while ((m = re.exec(n)) !== null) {
            var q = numDe(m[1] || m[2]);
            if (q === null || q <= 0 || q > 500) continue;
            qtd = q; return true;
          }
          return false;
        });
        if (qtd !== null) { somar(qtd); achou.push({ funcao: base, qtd: qtd }); }
      });
    }
    varrer(DIRETO, function (q) { direto += q; });
    varrer(INDIRETO, function (q) { indireto += q; });
    return { direto: direto, indireto: indireto, detalhe: achou };
  }

  /* Clima. Só marca o que está ESCRITO — "condição do tempo" em branco é
     honesto; inventar "Ensolarado" porque não falaram de chuva não é. */
  var CLIMAS = [
    { re: /\b(chuva|chuvoso|chuvendo|chovendo|choveu|temporal|tempestade)\b/, valor: "Chuvoso" },
    { re: /\b(garoa|garoando|chuvisco|nublado com chuva)\b/, valor: "Garoa" },
    { re: /\b(nublado|encoberto|fechado|cinzento)\b/, valor: "Nublado" },
    { re: /\b(sol|ensolarado|limpo|firme|bom tempo|tempo bom)\b/, valor: "Ensolarado" }
  ];
  function acharClima(t) {
    var n = normal(t);
    for (var i = 0; i < CLIMAS.length; i++) if (CLIMAS[i].re.test(n)) return CLIMAS[i].valor;
    return "";
  }

  /* Impedimento é a frase inteira, não a palavra: "parou 1 hora por causa
     da chuva" só serve para o cliente se vier com o motivo junto. */
  var GATILHOS = /\b(parou|paramos|parada|paralisad|atrasou|atraso|impediu|impedimento|nao (?:deu|foi possivel|teve)|faltou|falta de|sem (?:material|energia|agua|equipamento)|quebrou|aguardando|esperando)\b/;
  function acharImpedimentos(t) {
    var frases = texto(t).split(/[.;\n]+|,(?=\s*(?:mas|porem|so que)\b)/i);
    var achadas = frases.filter(function (f) { return GATILHOS.test(normal(f)); })
      .map(function (f) { return texto(f).replace(/^[,\s]+/, ""); })
      .filter(function (f) { return f.length > 3; });
    return achadas.join(". ");
  }

  /* A obra: "na obra X", "na X", "obra do X". Devolve só o TERMO — quem
     decide se existe obra com esse nome é o entradardo.js, que tem a lista
     e recusa ambiguidade. */
  function acharObraNome(t) {
    var n = texto(t);
    var pats = [
      /\bna\s+obra\s+(?:d[oa]\s+)?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s]{2,40}?)(?=[,.;]|\s+(?:concret|fizemo|fiz|hoje|come[cç]|termin|estamos|a\s+equipe|o\s+pessoal)|$)/i,
      /\bobra\s+(?:d[oa]\s+)?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s]{2,40}?)(?=[,.;]|$)/i,
      /\bn[oa]\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,30}?)\s+(?:concret|fizemo|fiz|come[cç]|termin)/i
    ];
    for (var i = 0; i < pats.length; i++) {
      var m = n.match(pats[i]);
      if (m && m[1]) {
        var v = texto(m[1]).replace(/\s+(hoje|ontem|a\s+equipe|o\s+pessoal)$/i, "");
        if (v.length >= 3) return v;
      }
    }
    return "";
  }

  /* Data. "hoje"/"ontem" precisam de uma referência vinda de fora — sem
     ela o resultado dependeria do relógio de quem roda, e o mesmo recado
     viraria dias diferentes conforme onde fosse processado. */
  function acharData(t, hoje) {
    var n = normal(t), ref = /^\d{4}-\d{2}-\d{2}$/.test(texto(hoje)) ? texto(hoje) : "";
    var m = n.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (m) {
      var dd = parseInt(m[1], 10), mm = parseInt(m[2], 10);
      var aa = m[3] ? parseInt(m[3], 10) : (ref ? parseInt(ref.slice(0, 4), 10) : 0);
      if (aa && aa < 100) aa += 2000;
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && aa) {
        return aa + "-" + ("0" + mm).slice(-2) + "-" + ("0" + dd).slice(-2);
      }
    }
    if (!ref) return "";
    if (/\bontem\b/.test(n)) {
      var d = new Date(ref + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    return ref;   // "hoje", ou nada dito
  }

  /* O serviço do dia: o recado inteiro, menos o que já virou outro campo.
     Deixo o texto do jeito que veio — reescrever a fala do mestre é onde
     a informação se perde. */
  var SAUDACAO = /^(bom dia|boa tarde|boa noite|ola|oi|opa|e ai|obrigad\w*|valeu|ok|blz|beleza)[\s,!.]*/i;
  function acharAtividades(t, imped) {
    /* ⚠ O "!" TAMBÉM TERMINA FRASE.
       Sem ele, "Bom dia! hoje na obra X concretamos a laje" era UMA frase só,
       que começava com saudação — e o filtro jogava fora o serviço do dia
       inteiro junto com o "bom dia". O diário chegava sem o que foi feito. */
    var frases = texto(t).split(/[.;\n!?]+/).map(function (f) { return texto(f); }).filter(Boolean);
    var fora = normal(imped);
    var uteis = frases.map(function (f) {
      /* tira a saudação da FRENTE, em vez de descartar a frase */
      return texto(String(f).replace(SAUDACAO, ""));
    }).filter(function (f) {
      if (!f) return false;
      return !(fora && fora.indexOf(normal(f)) > -1);
    });
    return uteis.join(". ");
  }

  /* --------------------------------------------------------------------
   * A porta de entrada. Devolve o mesmo formato que o n8n depositaria na
   * caixa — assim o resto do caminho (entradardo.js) não sabe nem precisa
   * saber se quem estruturou foi isto ou uma IA.
   * ------------------------------------------------------------------ */
  function interpretar(msg, opc) {
    var t = texto(msg), o = opc || {};
    if (!t) return { data: "", obraNome: "", efetivoDireto: 0, efetivoIndireto: 0,
      atividades: "", impedimentos: "", condicao: "", confianca: 0 };

    var ef = contarEfetivo(t);
    var imped = acharImpedimentos(t);
    var r = {
      data: acharData(t, o.hoje),
      obraNome: acharObraNome(t),
      efetivoDireto: ef.direto,
      efetivoIndireto: ef.indireto,
      atividades: acharAtividades(t, imped),
      impedimentos: imped,
      condicao: acharClima(t),
      efetivoDetalhe: ef.detalhe
    };
    /* Confiança = quantos dos 3 campos que fazem um diário valer alguma
       coisa foram encontrados. Vai junto para a tela poder ordenar o que
       precisa de conferência primeiro. */
    var pontos = (r.obraNome ? 1 : 0) + ((r.efetivoDireto || r.efetivoIndireto) ? 1 : 0) + (r.atividades ? 1 : 0);
    r.confianca = pontos / 3;
    return r;
  }

  /* =====================================================================
   * ISTO AQUI É UM DIÁRIO, OU É OUTRO ASSUNTO?
   *
   * ⚠ POR QUE PRECISOU EXISTIR (09/08/2026): a `confianca` acima era
   * calculada e NINGUÉM decidia com ela. Medi o que acontecia com recado que
   * não é diário — "me manda o comprovante do pagamento", "não vou hoje,
   * filha doente", "kkkk pois é" — e TODOS viravam rascunho de diário, com o
   * texto inteiro caindo no campo de atividades. Quem manda recado no grupo
   * da obra manda de tudo; sem esta porta, a caixa do cliente vira lixo e ele
   * para de olhar — que é o mesmo que o recurso não existir.
   *
   * ⚠ E A PORTA ERRA PARA O LADO DE PERGUNTAR, NUNCA O DE DESCARTAR.
   * Recusar em silêncio é o pecado que este projeto inteiro persegue: quem
   * gravou o dia de trabalho acha que registrou. Quando não parece diário, o
   * robô devolve uma frase dizendo o que faltou — a pessoa reenvia e pronto.
   *
   * O que conta como sinal de obra, e o porquê de serem TRÊS:
   *   - efetivo: alguém contou gente. Ninguém escreve "5 pedreiros" por acaso.
   *   - obra reconhecida: o nome bateu com uma obra cadastrada.
   *   - vocabulário de canteiro: "concretamos a laje", "chapisco", "escavação".
   * Um só já basta. Exigir dois recusaria o diário curto e legítimo
   * ("hoje só limpeza no terreno"), e diário curto é o mais comum de todos.
   * ===================================================================== */
  var VOCAB = new RegExp("\\b(" + [
    "obra", "canteiro", "servico", "servicos", "laje", "lage", "viga", "pilar", "pilares",
    "alvenaria", "bloco", "blocos", "tijolo", "reboco", "chapisco", "emboco", "massa",
    "concret\\w*", "concretagem", "forma", "formas", "armacao", "ferragem", "escora",
    "fundacao", "sapata", "baldrame", "radier", "estaca", "brocas?",
    "escavacao", "aterro", "terraplanagem", "compactacao", "nivelamento",
    "telhado", "telha", "cobertura", "calha", "forro", "gesso", "drywall",
    "piso", "contrapiso", "revestimento", "azulejo", "porcelanato", "rejunte",
    "pintura", "pintar", "massa corrida", "selador", "textura",
    "hidraulic\\w*", "eletric\\w*", "eletrica", "tubulacao", "conduite", "fiacao",
    "esquadria", "janela", "porta", "portas", "vidro", "impermeabiliz\\w*",
    "demolicao", "demolir", "limpeza", "entulho", "carga", "descarga",
    "muro", "calcada", "meio.?fio", "drenagem", "esgoto", "caixa d.?agua",
    "betoneira", "andaime", "guincho", "retroescavadeira", "caminhao",
    "medicao", "topografia", "locacao", "gabarito", "prumo", "esquadro"
  ].join("|") + ")\\b");

  function pareceDiario(r) {
    r = r || {};
    var temEfetivo = (Number(r.efetivoDireto) || 0) + (Number(r.efetivoIndireto) || 0) > 0;
    var temObra = !!texto(r.obraNome);
    var corpo = texto(r.atividades) + " " + texto(r.impedimentos);
    var temVocab = VOCAB.test(normal(corpo));

    /* ⚠ PERGUNTA NÃO É RELATO, mesmo falando de obra. "Você prefere bloco de
       14 ou de 19 nessa parede?" tem vocabulário de canteiro e virava diário.
       Só vale quando o recado INTEIRO é a pergunta e não há gente contada nem
       obra dita — um diário de verdade que termine perguntando algo
       ("Concretamos a laje. Viu a foto?") continua passando, porque tem
       efetivo, obra ou mais de uma frase de conteúdo. */
    var soUmaFrase = texto(corpo).split(/[.;\n!?]+/).filter(function (f) { return texto(f).length > 3; }).length <= 1;
    /* ⚠ NÃO DÁ PARA OLHAR O "?": `acharAtividades` separa as frases por
       `[.;\n!?]+` e a interrogação some no caminho. Escrevi essa checagem
       primeiro e ela era código morto com cara de regra — pior que não ter
       regra nenhuma, porque parece coberto. O que sobra, e funciona, é a
       palavra que abre a frase. */
    var ehPergunta = /^(voce|vc|sera|qual|quais|quando|quanto|quantos|como|onde|porque|por que|pode|poderia|consegue|tem como)\b/.test(normal(corpo));
    if (temVocab && !temEfetivo && !temObra && ehPergunta && soUmaFrase) {
      return {
        ok: false, motivo: "e-pergunta",
        aviso: "Isso me pareceu uma pergunta, não o diário do dia, então não registrei. " +
               "Se for o diário, me manda quantas pessoas trabalharam e o que foi feito.",
        sinais: { efetivo: false, obra: false, vocabulario: true, pergunta: true }
      };
    }

    if (temEfetivo || temObra || temVocab) {
      return { ok: true, sinais: { efetivo: temEfetivo, obra: temObra, vocabulario: temVocab } };
    }
    return {
      ok: false,
      motivo: texto(r.atividades) ? "sem-sinal-de-obra" : "sem-conteudo",
      /* a frase é o produto desta função: quem chama é um robô, e a decisão
         de recusar só serve se vier com o que fazer em seguida */
      aviso: texto(r.atividades)
        ? "Não entendi isso como diário de obra, então não registrei nada. " +
          "Se for o diário, me manda de novo dizendo quantas pessoas trabalharam e o que foi feito. " +
          "Se for outro assunto, fale direto com o responsável — eu só anoto diário."
        : "Não veio nada que eu consiga registrar. Me diga a obra, quantas pessoas trabalharam e o que foi feito.",
      sinais: { efetivo: false, obra: false, vocabulario: false }
    };
  }

  var RDOTexto = {
    interpretar: interpretar, pareceDiario: pareceDiario, contarEfetivo: contarEfetivo, acharClima: acharClima,
    acharImpedimentos: acharImpedimentos, acharObraNome: acharObraNome,
    acharData: acharData, numDe: numDe
  };
  global.RDOTexto = RDOTexto;
  if (typeof module !== "undefined" && module.exports) module.exports = RDOTexto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
