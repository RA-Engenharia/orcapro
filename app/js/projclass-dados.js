/* =====================================================================
 * projclass-dados.js — REGRAS EM DADOS do classificador de camadas e blocos (js/projclass.js).
 * Cada regra: { re (expressão sobre o nome SEM acento e em minúsculas), alvo: "camada"|"bloco"|"ambos",
 *   classe, sub?, regra (o «Por quê?» escrito) }. A PRIMEIRA que casa vence — a ordem importa:
 *   o específico (vaso, lavatório) vem antes do genérico (banheiro, louça).
 * Classes que vão ao orçamento: parede, porta, janela, louca, metal, eletrica, hidraulica, ambiente-rotulo.
 * Classes que NÃO vão: mobiliario, anotacao, cota, hachura, vegetacao, carimbo, nivel, titulo, ignorar.
 * Nada de nome de cliente aqui: só convenções de desenho (padrões de mercado de nomes de camada).
 * ===================================================================== */
(function (global) {
  "use strict";
  var R = [
    /* ---------- blocos de louças e metais (nome do bloco) ---------- */
    { re: /\b(vaso|bacia|sanitario|sanitaro|vso|wc)\b|vaso ?pne|bacia ?pne/, alvo: "bloco", classe: "louca", sub: "bacia", regra: "nome do bloco indica bacia sanitária" },
    { re: /mictorio|mict\b|urinol/, alvo: "bloco", classe: "louca", sub: "mictorio", regra: "nome do bloco indica mictório" },
    { re: /lavatorio|lavat\b|lav\b|cuba ?san|cuba ?(de ?)?(sobrepor|apoio|embutir) ?lav|lavabo/, alvo: "bloco", classe: "louca", sub: "lavatorio", regra: "nome do bloco indica lavatório/cuba sanitária" },
    { re: /chuveiro|ducha|chu\d/, alvo: "bloco", classe: "louca", sub: "chuveiro", regra: "nome do bloco indica chuveiro" },
    { re: /tanque/, alvo: "bloco", classe: "louca", sub: "tanque", regra: "nome do bloco indica tanque" },
    { re: /\bpia\b|cuba ?(inox|coz)|cozn?.*cuba|cuba\b/, alvo: "bloco", classe: "louca", sub: "pia", regra: "nome do bloco indica pia/cuba de cozinha" },
    { re: /bebedouro|bebedor/, alvo: "bloco", classe: "louca", sub: "bebedouro", regra: "nome do bloco indica bebedouro" },
    { re: /bide/, alvo: "bloco", classe: "louca", sub: "bide", regra: "nome do bloco indica bidê" },
    { re: /torneira|misturador|\btorn\b/, alvo: "bloco", classe: "metal", sub: "torneira", regra: "nome do bloco indica torneira (metal)" },
    { re: /barras?( ?de)?( ?apoio)?\b|barra ?\d/, alvo: "bloco", classe: "metal", sub: "barra-apoio", regra: "nome do bloco indica barra de apoio (acessibilidade)" },
    { re: /registro|reg ?(gaveta|pressao)/, alvo: "bloco", classe: "hidraulica", sub: "registro", regra: "nome do bloco indica registro" },
    { re: /\bralo\b|caixa ?sifonada|cx ?sif/, alvo: "bloco", classe: "hidraulica", sub: "ralo", regra: "nome do bloco indica ralo/caixa sifonada" },
    /* ---------- portas e janelas por bloco ---------- */
    { re: /porta|\bprt|door|\bp\d{1,2}\b/, alvo: "bloco", classe: "porta", regra: "nome do bloco indica porta" },
    { re: /janela|\bjan\b|\bjan\d|window|\bj\d{1,2}\b|basculante|maxim.?ar/, alvo: "bloco", classe: "janela", regra: "nome do bloco indica janela" },
    /* ---------- elétrica por bloco ---------- */
    { re: /tomada|\btug\b|\btue\b|outlet/, alvo: "bloco", classe: "eletrica", sub: "tomada", regra: "nome do bloco indica tomada" },
    { re: /interrup|switch/, alvo: "bloco", classe: "eletrica", sub: "interruptor", regra: "nome do bloco indica interruptor" },
    { re: /lumin|lampada|plafon|spot|arandela/, alvo: "bloco", classe: "eletrica", sub: "luminaria", regra: "nome do bloco indica luminária" },
    { re: /quadro|\bqd\b|\bqgbt\b|\bqdc\b/, alvo: "bloco", classe: "eletrica", sub: "quadro", regra: "nome do bloco indica quadro elétrico" },
    { re: /\bar ?cond|split|\bbtu|evapor|condensad/, alvo: "bloco", classe: "eletrica", sub: "ar-condicionado", regra: "nome do bloco indica ar-condicionado" },
    /* ---------- o que não é orçado por bloco ---------- */
    { re: /giro|area ?de ?(giro|manobra)|\bmr\b|modulo ?de ?referencia/, alvo: "bloco", classe: "anotacao", regra: "área de giro/módulo de referência (acessibilidade) — só desenho" },
    { re: /arv|arbol|arvore|planta ?orn|vegeta|grama|palmeira|arbusto/, alvo: "bloco", classe: "vegetacao", regra: "vegetação" },
    { re: /\bnorte|\bnort\d|seta|corte ?\d|rotl|nivl|nivel|titl|titulo|carimbo|selo/, alvo: "bloco", classe: "anotacao", regra: "símbolo de desenho (norte, corte, nível, título)" },
    { re: /cadeira|mesa|sofa|cama|armario|estante|poltrona|banco|carro|moto|veiculo|pessoa|figura|geladeira|fogao|microondas|maquina/, alvo: "bloco", classe: "mobiliario", regra: "mobiliário/equipamento solto (não é obra)" },

    /* ---------- camadas ---------- */
    /* camada nomeada por PENA/espessura («Vs-0.40», «T-0.30», «V-0.20»): o nome não diz o elemento — sem classe pelo
       nome, de propósito, para a GEOMETRIA decidir (pares paralelos 9–40 cm = parede deduzida). Ordem: antes de tudo. */
    { re: /^(vs?|t|v|p|l)[-_ ]?\d+(?:[.,]\d+)?$/, alvo: "camada", classe: "", regra: "camada por pena: a geometria decide" },
    { re: /^a-alvn|alvenaria|\balv\b|\bparede|\bwall|a-wall|^par\b|^paredes?$/, alvo: "camada", classe: "parede", regra: "nome da camada indica alvenaria/parede" },
    { re: /^es-|esquadri|\bporta|\bprts?\b|door|a-door/, alvo: "camada", classe: "porta", regra: "nome da camada indica porta/esquadria" },
    { re: /janela|\bjan\b|window|a-glaz/, alvo: "camada", classe: "janela", regra: "nome da camada indica janela" },
    { re: /^tx-ambt|ambiente|\bamb\b|room|a-area-iden|nome.?amb/, alvo: "camada", classe: "ambiente-rotulo", regra: "nome da camada indica rótulo de ambiente" },
    { re: /^ly-banh|banh|louca|sanit|a-flor-fixt|plumb.?fixt/, alvo: "camada", classe: "louca", regra: "nome da camada indica louças/metais" },
    { re: /^el-|eletr|tomada|interrup|lumin|ilumin|e-lite|e-powr|\bele\b/, alvo: "camada", classe: "eletrica", regra: "nome da camada indica elétrica" },
    { re: /^hid|^hc-?af|agua ?fria|\baf\b|\baq\b|agua ?quente|esgot|\besg\b|pluvi|\bplu\b|p-sanr|p-domw/, alvo: "camada", classe: "hidraulica", regra: "nome da camada indica hidráulica" },
    { re: /^hc-|hach|^ps-hach|hatch|a-patt/, alvo: "camada", classe: "hachura", regra: "nome da camada indica hachura" },
    { re: /mobl|mobil|furn|a-furn|^ly-cozn|^ly-mobl/, alvo: "camada", classe: "mobiliario", regra: "nome da camada indica mobiliário (fora do orçamento)" },
    { re: /cota|dims?\b|^tx-dims|dimen|a-anno-dims/, alvo: "camada", classe: "cota", regra: "nome da camada indica cotas" },
    { re: /vegt|arvr|vegeta|paisag|jardim/, alvo: "camada", classe: "vegetacao", regra: "nome da camada indica vegetação/paisagismo" },
    { re: /layout|prancha|carimbo|selo|moldura|viewport|vport|defpoints|titl|^x-/, alvo: "camada", classe: "carimbo", regra: "nome da camada indica moldura/carimbo/layout" },
    { re: /^tx-|texto|^t-cort|^text/, alvo: "camada", classe: "anotacao", regra: "nome da camada indica texto/anotação" },
    { re: /pilar|\bviga|estrut|^s-col|^s-beam/, alvo: "camada", classe: "estrutura", regra: "nome da camada indica estrutura" }
  ];

  /* atributos de bloco que dizem o que o bloco é (blocos dinâmicos *U… não têm nome útil) */
  var ATRIB = [
    { re: /^ambiente$|^nome( ?do)? ?ambiente$|^room/, classe: "ambiente-rotulo", regra: "bloco com atributo AMBIENTE (rótulo de ambiente)" },
    { re: /^titulo$|^title$/, classe: "titulo", regra: "bloco com atributo TÍTULO (título de vista)" },
    { re: /^btu/, classe: "eletrica", sub: "ar-condicionado", regra: "bloco com atributo BTU (ar-condicionado)" },
    { re: /^elevacao$|^osso$|^acabado$|^nivel$/, classe: "nivel", regra: "bloco com atributo de NÍVEL" },
    { re: /^porta|textidnt$/, classe: "anotacao", regra: "etiqueta de esquadria (identificação, não a peça)" }
  ];

  /* faixas de tamanho (m) para conferir louça pelo tamanho do bloco quando a sub não veio do nome */
  var TAMANHO_LOUCA = [
    /* só a bacia tem forma inconfundível pelo tamanho; lavatório e chuveiro se confundem com ralo, cuba e símbolo */
    { sub: "bacia", min: [0.33, 0.50], max: [0.50, 0.80] }
  ];

  /* classes que entram no orçamento */
  var ORCAVEL = { parede: 1, porta: 1, janela: 1, louca: 1, metal: 1, eletrica: 1, hidraulica: 1, "ambiente-rotulo": 1 };

  var D = { regras: R, atributos: ATRIB, tamanhoLouca: TAMANHO_LOUCA, orcavel: ORCAVEL, versao: 1 };
  global.ProjClassDados = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
