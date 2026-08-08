/* =====================================================================
 * ordem.js — ORDEM DE APRESENTAÇÃO DE PESSOAS. Motor puro, Node-testável.
 *
 * POR QUE EXISTE: o cliente pediu que na folha os funcionários saíssem em
 * ordem alfabética e, ao lançar, agrupados por HIERARQUIA de função —
 * mestre, pedreiro, ajudante, limpeza, eletricista, pintor. E pediu que
 * essa organização valesse para todo módulo que precise dela.
 *
 * A ordem estava espalhada: cada tela ordenava do seu jeito (ou não
 * ordenava), então o mesmo time aparecia numa sequência na folha, noutra
 * no ponto e numa terceira no EPI. Quem confere papel com papel perde a
 * linha. Aqui existe UMA regra, e as telas chamam esta.
 *
 * DUAS COISAS QUE NÃO PODEM CAIR:
 *
 * 1) A ORDEM É ESTÁVEL. Mesma lista, mesma saída, sempre — inclusive entre
 *    aparelhos e reimpressões. Documento assinado que muda de ordem quando
 *    é reimpresso não confere com o que foi assinado.
 *
 * 2) NINGUÉM SOME. Função desconhecida, em branco ou escrita torto não
 *    pode fazer a pessoa desaparecer da lista: vai para o fim, em ordem
 *    alfabética, mas vai.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* Hierarquia PADRÃO do canteiro. A sequência do meio (pedreiro → ajudante
     → limpeza → eletricista → pintor) é a que o cliente ditou; o resto
     completa com as funções que o sistema já reconhecia.
     ⚠ É só o padrão: a empresa pode reordenar em ⚙ Parâmetros, e é por isso
     que toda função aqui recebe a ordem de FORA (ver `rank`). */
  var PADRAO = [
    /* corpo técnico primeiro — quem responde pela obra.
       ⚠ Isto entrou depois de a lista real da empresa mostrar uma
       ENGENHEIRA CIVIL caindo em "sem função" e indo para o fim da página. */
    "Engenheiro", "Arquiteto", "Técnico de segurança", "Estagiário",
    "Mestre de obras", "Encarregado", "Apontador", "Almoxarife",
    "Pedreiro", "Ajudante", "Servente",
    "Limpeza", "Eletricista", "Encanador", "Pintor", "Carpinteiro",
    "Ferreiro", "Armador", "Serralheiro", "Soldador", "Gesseiro", "Azulejista",
    "Operador", "Motorista", "Vigia", "Administrativo"
  ];

  /* Normaliza para comparar: sem acento, sem caixa, sem espaço sobrando.
     "Eletricista", "ELÉTRICA " e "eletricista" têm que cair no mesmo lugar. */
  function norm(s) {
    return String(s == null ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().replace(/\s+/g, " ").trim();
  }

  /* Apelidos que aparecem no cadastro e significam a mesma função. Sem isto,
     "SERVENTE" e "AJUDANTE" iriam para o fim como desconhecidas. */
  var APELIDOS = {
    /* chaves em PEDAÇO, não palavra inteira: o cadastro traz "Engenheira
       civil", "Eng. Carla", "Arquiteta". Casar só o masculino exato deixaria
       metade do corpo técnico fora da hierarquia. */
    "ENGENHEIR": "Engenheiro", "ENG.": "Engenheiro", "ENG CIVIL": "Engenheiro",
    "ARQUITET": "Arquiteto",
    "TECNICO DE SEGURANCA": "Técnico de segurança", "TEC SEGURANCA": "Técnico de segurança", "TST": "Técnico de segurança",
    "ESTAGIARI": "Estagiário",
    "APONTADOR": "Apontador", "SOLDADOR": "Soldador",
    "MESTRE": "Mestre de obras", "MESTRE DE OBRA": "Mestre de obras", "MESTRE DE OBRAS": "Mestre de obras",
    "ENCARREGADO": "Encarregado", "ENCARREGADA": "Encarregado",
    "PEDREIRO": "Pedreiro", "PEDREIRA": "Pedreiro",
    "AJUDANTE": "Ajudante", "AUXILIAR": "Ajudante", "AJUDANTE GERAL": "Ajudante",
    "SERVENTE": "Servente",
    "LIMPEZA": "Limpeza", "FAXINA": "Limpeza", "SERVICOS GERAIS": "Limpeza",
    "ELETRICISTA": "Eletricista", "ELETRICA": "Eletricista",
    "ENCANADOR": "Encanador", "BOMBEIRO HIDRAULICO": "Encanador", "HIDRAULICA": "Encanador",
    "PINTOR": "Pintor", "PINTURA": "Pintor",
    "CARPINTEIRO": "Carpinteiro", "CARPINTARIA": "Carpinteiro",
    "FERREIRO": "Ferreiro", "ARMADOR": "Armador",
    "SERRALHEIRO": "Serralheiro", "GESSEIRO": "Gesseiro",
    "AZULEJISTA": "Azulejista", "OPERADOR": "Operador",
    "MOTORISTA": "Motorista", "ALMOXARIFE": "Almoxarife",
    "VIGIA": "Vigia", "PORTEIRO": "Vigia",
    "ADMINISTRATIVO": "Administrativo", "ADM": "Administrativo"
  };

  /* Nome canônico da função. Casa por apelido exato e, se não achar, por
     CONTIDO — o cadastro real traz "PEDREIRO/ACABAMENTO", "Ajudante 2". */
  function canonica(funcao) {
    var f = norm(funcao);
    if (!f) return "";
    if (APELIDOS[f]) return APELIDOS[f];
    var chaves = Object.keys(APELIDOS), achou = "", tam = 0;
    for (var i = 0; i < chaves.length; i++) {
      /* o mais LONGO vence: "MESTRE DE OBRAS" antes de "MESTRE", senão
         "ajudante geral" cairia em "ajudante" por acaso de ordem */
      if (f.indexOf(chaves[i]) !== -1 && chaves[i].length > tam) { achou = APELIDOS[chaves[i]]; tam = chaves[i].length; }
    }
    return achou;
  }

  /* Posição da função na hierarquia. Desconhecida ou em branco vai para o
     fim (não some — só fica depois de quem tem função reconhecida). */
  function rank(funcao, ordem) {
    var lista = (ordem && ordem.length) ? ordem : PADRAO;
    var c = canonica(funcao);
    if (!c) return lista.length + 1;
    for (var i = 0; i < lista.length; i++) if (norm(lista[i]) === norm(c)) return i;
    return lista.length + 1;
  }

  /* Comparação de nomes em português: sem acento, sem caixa, e "Ana Paula"
     antes de "Anabela". `numeric` para "Bloco 2" não vir depois de "Bloco 10". */
  function cmpNome(a, b) {
    return String(a == null ? "" : a).localeCompare(String(b == null ? "" : b), "pt-BR", { sensitivity: "base", numeric: true });
  }

  /* Ordena pessoas. `modo`:
   *   "nome"       → só alfabética;
   *   "hierarquia" → função primeiro (na ordem da empresa), nome dentro dela.
   * `campos` diz onde estão o nome e a função (a folha usa `nome`/`funcao`,
   * outras telas podem diferir).
   * NÃO altera o array recebido — devolve outro. Ordenar no lugar já
   * embaralhou lista que outra tela estava usando. */
  function pessoas(arr, opcoes) {
    var o = opcoes || {};
    var modo = o.modo || "hierarquia";
    var cn = o.campoNome || "nome", cf = o.campoFuncao || "funcao";
    var ordem = o.ordem;
    var copia = (arr || []).slice();
    copia.sort(function (a, b) {
      if (modo === "hierarquia") {
        var ra = rank(a && a[cf], ordem), rb = rank(b && b[cf], ordem);
        if (ra !== rb) return ra - rb;
      }
      var n = cmpNome(a && a[cn], b && b[cn]);
      if (n !== 0) return n;
      /* Desempate final pelo id: dois homônimos sem id estável fariam a
         lista trocar de ordem entre reimpressões do mesmo documento. */
      return cmpNome(a && a.id, b && b.id);
    });
    return copia;
  }

  /* Agrupa por função na ordem da hierarquia — para tela que quer subtítulo
     por categoria em vez de uma lista corrida. */
  function porFuncao(arr, opcoes) {
    var o = opcoes || {}, cf = o.campoFuncao || "funcao";
    var ordenadas = pessoas(arr, o), grupos = [], indice = {};
    ordenadas.forEach(function (p) {
      var c = canonica(p && p[cf]) || "Sem função definida";
      if (!indice[c]) { indice[c] = { funcao: c, itens: [] }; grupos.push(indice[c]); }
      indice[c].itens.push(p);
    });
    return grupos;
  }

  var Ordem = {
    PADRAO: PADRAO, norm: norm, canonica: canonica, rank: rank,
    cmpNome: cmpNome, pessoas: pessoas, porFuncao: porFuncao
  };

  global.Ordem = Ordem;
  if (typeof module !== "undefined" && module.exports) module.exports = Ordem;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
