/* =====================================================================
 * portalpriv.js — O QUE O CLIENTE FINAL **NÃO** VÊ NO PORTAL
 *
 * ---------------------------------------------------------------------
 * POR QUE EXISTE
 * ---------------------------------------------------------------------
 * Duas empresas já decidiram, por escrito, que o cliente delas não pode ver
 * a metragem produzida nem o nome de quem produziu. O sistema mandava as
 * duas coisas assim mesmo:
 *
 *   · a metragem, em `rdos[].servicos[].qtdExecutada` (e no acumulado, no
 *     saldo e no previsto), além das `unidades` das séries do avanço físico;
 *   · dois nomes próprios, `responsavel` e `autor`, desenhados no Portal
 *     como "Responsável" e "Registrado por".
 *
 * `RDO.paraPortal` já é uma allowlist rigorosa e `Producao.limparParaPortal`
 * já tira o nome de quem RECEBE por produção — mas nenhuma das duas cobria
 * estes campos, porque eles são legítimos por padrão. O que faltava era o
 * cliente poder DESLIGÁ-LOS.
 *
 * ---------------------------------------------------------------------
 * TRÊS REGRAS
 * ---------------------------------------------------------------------
 * 1) O INTERRUPTOR MANDA NO DADO, NÃO NO BOTÃO. Campo desligado não é
 *    EMBARCADO no retrato publicado. Mandar o número e apenas não desenhá-lo
 *    deixa a metragem legível no JSON para qualquer um com o link — foi
 *    assim que medições e diários vazaram até a v1.1.233.
 *
 * 2) PERCENTUAL NÃO É METRAGEM, E FICA. O cliente decidiu não ver "quantos
 *    m²"; ele continua querendo ver "quanto andou". Esconder o percentual
 *    junto transformaria o Portal numa tela sem informação — e não foi isso
 *    que ninguém pediu.
 *
 * 3) A ÁREA DA OBRA FICA. `areaConstruida` é o tamanho contratado: está no
 *    contrato que o cliente assinou e ele já sabe. A decisão foi sobre a
 *    metragem PRODUZIDA, que é o que revela a produtividade da equipe.
 *
 * ⚠ `auditar` existe para o teste, e é o cadeado que impede o vazamento de
 *   voltar: ele varre o retrato inteiro e devolve todo campo de quantidade
 *   ou de nome que sobreviveu. Campo novo com nome de quantidade nasce
 *   reprovado até alguém decidir o que fazer com ele.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PortalPriv = {};

  /* Os campos de QUANTIDADE que o portal recebe hoje. A lista é por NOME de
     campo, de propósito: assim um `qtdPendente` inventado amanhã já cai aqui
     sem ninguém precisar lembrar.
     ⚠ `qtd` NÃO entra nesta lista, e é decisão. O nome é genérico demais: ele
       também é a quantidade de EQUIPAMENTO no diário ("2 retroescavadeiras"),
       que não é metragem de ninguém e que o cliente pode ver. As quantidades
       de `qtd` que realmente são metragem moram nas listas `unidades` e
       `etapas` das séries do avanço físico, e são tratadas à parte — ver
       `aplicar` e `auditar`. */
  var CAMPOS_QTD = [
    "qtdPrevista", "qtdExecutada", "qtdAnterior", "qtdAcumulada", "qtdSaldo"
  ];
  /* ⚠ SÃO TRÊS NOMES PRÓPRIOS, NÃO DOIS. `aprovadoPor` é o terceiro, e ele
     passou batido na primeira leitura: `RDO.paraPortal` o envia (js/rdo.js) e
     o Portal desenha "Aprovado por: <nome>" (loja/portal.html). Achado numa
     revisão adversarial — é o tipo de campo que se acrescenta ao diário sem
     ninguém lembrar que existe uma tela do CLIENTE lendo o mesmo objeto. */
  var CAMPOS_NOME = ["responsavel", "autor", "aprovadoPor"];

  PortalPriv.CAMPOS_QTD = CAMPOS_QTD;
  PortalPriv.CAMPOS_NOME = CAMPOS_NOME;

  PortalPriv.OPCOES = [
    { id: "semMetragem", campo: "portalSemMetragem",
      nome: "Esconder a metragem produzida",
      desc: "O cliente continua vendo o andamento em percentual, as fotos e o texto do diário — mas não os m² executados, o acumulado nem o saldo. Use quando a metragem revela a produtividade da equipe." },
    { id: "semNomes", campo: "portalSemNomes",
      nome: "Esconder nomes de pessoas",
      desc: "Tira do diário publicado o responsável e quem registrou. O nome de quem recebe por produção já nunca vai ao Portal." }
  ];

  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function arr(x) { return Array.isArray(x) ? x : []; }

  /* Varre qualquer estrutura e apaga os campos citados. Objeto e array,
     fundo a fundo — o pacote do avanço físico tem quantidade em três níveis
     (etapas, séries por dia/semana/mês) e enumerar caminho por caminho seria
     esquecer um. */
  function limpar(no, campos, valorVazio) {
    if (no == null || typeof no !== "object") return no;
    if (Array.isArray(no)) { no.forEach(function (x) { limpar(x, campos, valorVazio); }); return no; }
    Object.keys(no).forEach(function (k) {
      if (campos.indexOf(k) > -1) { no[k] = valorVazio; return; }
      limpar(no[k], campos, valorVazio);
    });
    return no;
  }

  /* ===================================================================
   * APLICAR — devolve uma CÓPIA limpa. Nunca altera o original: o retrato
   * publicado é derivado, e o dado interno da empresa continua inteiro.
   * =================================================================== */
  PortalPriv.aplicar = function (snapshot, opcoes) {
    var o = opcoes || {};
    if (!snapshot || (!o.semMetragem && !o.semNomes)) return snapshot;
    var s = clone(snapshot);

    if (o.semMetragem) {
      /* as quantidades viram null, não somem: o Portal antigo lê estes campos
         e `undefined` em cadeia de propriedade quebra a tela dele, enquanto
         null ele já trata como "não informado". */
      limpar(s.rdos, CAMPOS_QTD, null);
      limpar(s.fisico, CAMPOS_QTD, null);
      /* as listas de unidade e de etapa das séries existem SÓ para carregar
         quantidade — esvaziá-las é mais honesto que deixar uma lista de
         objetos com `qtd: null` */
      if (s.fisico) {
        arr(s.fisico.etapas).forEach(function (e) { if (e) e.unidades = []; });
        ["serieDia", "serieSemana", "serieMes"].forEach(function (k) {
          var serie = s.fisico[k];
          if (!serie) return;
          arr(serie.periodos).forEach(function (p) { if (p) { p.unidades = []; p.etapas = []; } });
        });
      }
      s.metragemOculta = true;   // o Portal usa para dizer "—" em vez de "0"
    }

    if (o.semNomes) {
      limpar(s.rdos, CAMPOS_NOME, "");
      s.nomesOcultos = true;
    }
    return s;
  };

  /* Lê a configuração gravada na obra, com um padrão da EMPRESA para a obra
     que ainda não decidiu.
     ⚠ "Nunca decidiu" e "decidiu que não" são coisas diferentes, e a
       diferença importa aqui: a republicação automática não passa pela tela
       de publicar, então uma obra criada depois da implantação sairia com a
       metragem exposta se o padrão da empresa não existisse. Assim que
       alguém publica pela tela, a escolha fica gravada NA OBRA e o padrão
       deixa de valer para ela. */
  PortalPriv.daObra = function (obra, padraoEmpresa) {
    var o = obra || {}, d = padraoEmpresa || {};
    function decidiu(valor, padrao) { return valor === undefined ? padrao === true : valor === true; }
    return {
      semMetragem: decidiu(o.portalSemMetragem, d.portalSemMetragem),
      semNomes: decidiu(o.portalSemNomes, d.portalSemNomes)
    };
  };

  /* ===================================================================
   * AUDITAR — o cadeado do teste
   *
   * Devolve todo campo de quantidade ou de nome que ficou com valor no
   * retrato, com o caminho até ele. Lista vazia = nada vazou.
   * =================================================================== */
  PortalPriv.auditar = function (snapshot, opcoes) {
    var o = opcoes || {};
    var procurar = [];
    if (o.semMetragem !== false) procurar = procurar.concat(CAMPOS_QTD);
    if (o.semNomes !== false) procurar = procurar.concat(CAMPOS_NOME);
    var achados = [];
    /* as listas de quantidade das séries do avanço físico: o nome do campo
       lá dentro é `qtd`, genérico demais para a varredura por nome (ver a
       nota em CAMPOS_QTD), então a checagem é pelo caminho */
    if (o.semMetragem !== false && snapshot && snapshot.fisico) {
      var f = snapshot.fisico;
      arr(f.etapas).forEach(function (e, i) {
        if (e && arr(e.unidades).length) achados.push({ caminho: "snapshot.fisico.etapas[" + i + "].unidades", valor: e.unidades });
      });
      ["serieDia", "serieSemana", "serieMes"].forEach(function (k) {
        if (!f[k]) return;
        arr(f[k].periodos).forEach(function (p, i) {
          if (p && arr(p.unidades).length) achados.push({ caminho: "snapshot.fisico." + k + ".periodos[" + i + "].unidades", valor: p.unidades });
          if (p && arr(p.etapas).length) achados.push({ caminho: "snapshot.fisico." + k + ".periodos[" + i + "].etapas", valor: p.etapas });
        });
      });
    }
    (function anda(no, caminho) {
      if (no == null || typeof no !== "object") return;
      if (Array.isArray(no)) { no.forEach(function (x, i) { anda(x, caminho + "[" + i + "]"); }); return; }
      Object.keys(no).forEach(function (k) {
        var v = no[k];
        if (procurar.indexOf(k) > -1) {
          if (v !== null && v !== "" && v !== undefined) achados.push({ caminho: caminho + "." + k, valor: v });
          return;
        }
        anda(v, caminho + "." + k);
      });
    })(snapshot, "snapshot");
    return achados;
  };

  global.PortalPriv = PortalPriv;
  if (typeof module !== "undefined" && module.exports) module.exports = PortalPriv;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
