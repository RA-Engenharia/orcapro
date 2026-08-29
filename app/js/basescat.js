/* =====================================================================
 * basescat.js — CATÁLOGO DE BANCOS DE PREÇO (o mapa do mercado)
 *
 * POR QUE ISTO EXISTE (v1.1.203).
 * O Passo 3 do assistente de orçamento só enxergava o que JÁ estava
 * instalado (`Bases.lista()`), então num navegador recém-aberto ele mostrava
 * SINAPI e mais nada — os outros sete bancos que VÊM NO PACOTE ficavam
 * invisíveis até alguém descobrir a tela 🗂 Tabelas. A tela do concorrente
 * mostra o mapa inteiro do mercado agrupado por região; a nossa mostrava um
 * item.
 *
 * ⚠ O CAMINHO ÓBVIO É UMA ARMADILHA. Montar a tabela iterando `Bases.META`
 * (js/bases.js:19) publicaria NOVE bancos fantasma — SBC, EMOP, CPOS, FDE,
 * SEDOP, CEHOP, DEINFRA, DER e CDHU têm rótulo bonito lá dentro e ZERO byte
 * de dado em data/. Rótulo não é fonte. Por isso este catálogo é dirigido
 * por ARQUIVO QUE EXISTE, e o status de cada linha é DERIVADO de fatos
 * conferíveis (`avaliar()`), nunca escrito à mão numa string.
 *
 * ⚠ DUAS PERGUNTAS DIFERENTES QUE VIRAVAM UMA MENTIRA SÓ. "Atualiza
 * sozinho" era falso: SICRO, IOPES, ORSE e GOINFRA se atualizam sozinhos
 * NO SERVIDOR DA RA (cron semanal), mas no computador do cliente nada baixa
 * sozinho além da SINAPI. São dois campos separados de propósito —
 * `coletaServidor` e `atualizacaoCliente` — e nenhuma linha fora da SINAPI
 * pode dizer "sozinho" enquanto o app não tiver esse caminho.
 *
 * ⚠ VERSÃO NEM SEMPRE É DATA. A SEINFRA-CE publica "028.1" (número de
 * tabela, não competência) e é exatamente o "028" que aparece na coluna
 * Versão do concorrente. `cmpVersao` devolve **null** = "não sei comparar",
 * e nenhum caminho de atualização pode concluir "tem versão nova" a partir
 * de null. A comparação `String(srv) <= String(local)` que existe hoje em
 * app.js:690 conclui besteira nesse caso.
 *
 * Lógica pura, sem DOM e sem fetch — roda no Node e é conferida pelo gate
 * contra os arquivos reais de data/ (tools/test-basescat.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* Ordem dos grupos na tela — a mesma do mercado (e a do concorrente),
     com a base autoral por último porque ela não é de órgão nenhum. */
  var REGIOES = [
    { id: "nacional", titulo: "Bases Nacionais" },
    { id: "sudeste", titulo: "Bases do Sudeste" },
    { id: "nordeste", titulo: "Bases do Nordeste" },
    { id: "centro-oeste", titulo: "Bases do Centro-oeste" },
    { id: "norte", titulo: "Bases do Norte" },
    { id: "sul", titulo: "Bases do Sul" },
    { id: "autoral", titulo: "Sua base" }
  ];

  /* GRAUS DE ENTREGA — como o dado CHEGA. Derivado, nunca declarado.
     1 AUSENTE  não temos fonte nenhuma (o cliente pode importar a planilha)
     2 PACOTE   vem no app, em data/ — não se atualiza sozinho em lugar nenhum
     3 SERVIDOR o servidor da RA coleta e publica; o app busca de lá quando há rede */
  var AUSENTE = 1, PACOTE = 2, SERVIDOR = 3;

  /* Arquivos de data/ que NÃO são base e nunca podem virar linha da tabela.
     sinapi-sample.json são 30 itens de demonstração que se apresentam como
     SINAPI (sobrescreveria o índice bom); sudecap-BH-2026-01.json é a versão
     anterior e não tem tipoItem em nenhum dos 2.025 itens.

     ⚠ ORÇAMENTO DE CLIENTE NÃO É BASE — e a guarda é por PADRÃO, não por nome.
     Em 12/08/2026 um orçamento de cliente real, com dado pessoal, morava em
     data/ e precisou ser barrado aqui. O arquivo saiu do repositório (foi para
     Documents\RA_Engenharia\Backups), mas a guarda continua fazendo falta:
     numa recuperação alguém pode devolver o arquivo para data/, e ele não pode
     virar linha de catálogo.

     ⚠ SÓ QUE A GUARDA ERA O NOME DO ARQUIVO, E O NOME DO ARQUIVO ERA O NOME DA
     PESSOA. Este arquivo viaja inteiro para os 38 pacotes e para uma URL
     pública — nome de cliente não mora em js/. O padrão abaixo não expõe
     ninguém e ainda protege MAIS: pega qualquer orçamento devolvido a data/,
     não só aquele um. */
  var NUNCA = ["data/sinapi-sample.json", "data/sudecap-BH-2026-01.json"];
  var NUNCA_PADRAO = [/^data\/orcamento[-_]/i];

  /* a pergunta que os consumidores fazem: "posso listar este arquivo?" */
  function ehProibido(caminho) {
    var p = String(caminho == null ? "" : caminho).trim();
    if (!p) return false;
    var i;
    for (i = 0; i < NUNCA.length; i++) if (NUNCA[i] === p) return true;
    for (i = 0; i < NUNCA_PADRAO.length; i++) if (NUNCA_PADRAO[i].test(p)) return true;
    return false;
  }

  /* ------------------------------------------------------------------
   * O CATÁLOGO.
   *
   * Cada entrada declara só FATO SOBRE A FONTE. Nada de status, nada de
   * "ativo", nada de "atualiza sozinho" — isso tudo sai de avaliar().
   *
   *   id            sigla usada como `fonte` no Bases.registrar
   *   nome          como aparece na coluna Base
   *   orgao         nome por extenso (vai no tooltip e no documento)
   *   regiao        id de REGIOES
   *   uf            sigla do estado ("BR" quando é nacional)
   *   localRotulo   o que a coluna Local mostra quando não há eixo
   *   entrega.local caminho em data/ (ou função quando depende de eixo)
   *   entrega.vps   nome do arquivo servido em /bases/<nome> (só quem o VPS serve)
   *   chaveStatus   chave que /api/bases-status usa para este banco
   *   coleta        "cron" | "manual" | "" — como o dado é produzido na RA
   *   versaoPacote  a competência que vem NO PACOTE (nunca a instalada)
   *   itens         contagem MEDIDA no arquivo do pacote (o gate confere)
   *   eixos         variantes reais (região, regime, preço) com o padrão que
   *                 já vale no código de hoje
   *   nota          verdade incômoda que a linha precisa dizer
   * ------------------------------------------------------------------ */
  var CATALOGO = [
    {
      id: "SINAPI", nome: "SINAPI", orgao: "Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil — CAIXA/IBGE",
      regiao: "nacional", uf: "BR", localRotulo: "Todos os estados",
      entrega: { local: "data/sinapi-<UF>-<COMP>.json", manifesto: "data/estados.json" },
      chaveStatus: "sinapi", coleta: "manual",
      versaoPacote: "2026-06", itens: 324702, pesoMb: 3.13,
      /* o eixo de LOCAL da SINAPI não é declarado aqui: sai de estados.json
         em runtime, porque o pacote do cliente varia (empacotar-cliente.ps1
         aceita -Estados SEDE, TODOS ou uma lista) — cravar 27 no código faria
         a tela prometer estado que não veio no ZIP daquele cliente */
      eixos: [{ id: "uf", rotulo: "Local", de: "estados", padrao: "" }],
      principal: true,
      /* ⚠ SEM eixo de regime porque só distribuímos UM regime, não porque o
         rótulo esteja errado — isso foi corrigido na v1.1.204: os 324.702
         itens agora declaram desonerado:false, que é o que as abas CSD/ISD
         dizem de si mesmas ("ENCARGOS SOCIAIS SEM DESONERAÇÃO"). O gerador já
         produz o desonerado (--regime desonerada, abas CCD/ICD); ligar o eixo
         aqui depende de decidir como entregar mais ~88 MB ao cliente. */
      nota: "Vem no app o regime NÃO DESONERADO (abas CSD/ISD da CAIXA). O desonerado (CCD/ICD) o gerador já sabe produzir, mas ainda não é distribuído."
    },
    {
      /* ⚠ POR QUE A DESONERADA E UMA LINHA SEPARADA, e nao um eixo de regime
         na linha do SINAPI: trocar o regime pelo eixo exigiria ensinar o
         `trocarBaseSinapi` a montar outro nome de arquivo — e ele e o caminho
         de BOOT do app, onde errar nao deixa a tela feia, deixa o app sem
         abrir. Como base do multi-base, ela entra pelo mesmo `Bases.instalar`
         que SETOP e ORSE usam, com zero risco no boot, e o filtro de regime da
         busca passa a ter os dois lados de verdade: Onerada devolve a SINAPI
         principal, Desonerada devolve esta.
         ⚠ E NAO VEM NO PACOTE — seriam +79 MB no ZIP do cliente. Fica so no
         servidor; o app baixa 3 MB da UF que a pessoa escolher. Por isso
         `entrega` tem `vps` e NAO tem `local`. */
      id: "SINAPI_DES", nome: "SINAPI desonerada", orgao: "SINAPI — encargos sociais COM desoneração (abas CCD/ICD da Referência da CAIXA)",
      regiao: "nacional", uf: "BR", localRotulo: "",
      entrega: { vps: "sinapi-<UF>-2026-06-desonerada.json" },
      chaveStatus: "sinapi", coleta: "manual",
      versaoPacote: "2026-06", itens: 324702, pesoMb: 3.12,
      /* as UFs saem do servidor, como no SICRO. Sem resposta, nao ha opcao —
         e a linha, sem `local`, nem se oferece para instalar. */
      eixos: [{ id: "uf", rotulo: "Local", de: "sinapiDesUfs", padrao: "MG", opcoes: [] }],
      nota: "O par desonerado da SINAPI. Em Minas, 7.740 dos 12.815 preços diferem do regime não desonerado (−2,4% em média). Baixa do servidor: 3 MB do estado escolhido."
    },
    {
      id: "SICRO", nome: "SICRO", orgao: "Sistema de Custos Referenciais de Obras — DNIT",
      regiao: "nacional", uf: "BR", localRotulo: "",
      entrega: { local: "data/sicro-<UF>-current.json", vps: "sicro-<UF>-current.json" },
      chaveStatus: "sicro", coleta: "cron",
      versaoPacote: "2026-04", itens: 6618, pesoMb: 1.44,
      /* as UFs coletadas saem do servidor em runtime (ctx.sicroUfs). Sem
         resposta do servidor, vale o que veio no pacote — hoje só o ES.
         Desenhar 27 opções antes de coletar 27 seria criar 26 opções mortas. */
      eixos: [{ id: "uf", rotulo: "Local", de: "sicroUfs", padrao: "ES", opcoes: [{ v: "ES", r: "Espírito Santo" }] }],
      nota: "Publicação trimestral do DNIT (jan/abr/jul/out)."
    },
    /* ---------------- Sudeste ---------------- */
    {
      id: "SETOP", nome: "SETOP", orgao: "Secretaria de Estado de Transportes e Obras Públicas de Minas Gerais",
      regiao: "sudeste", uf: "MG", localRotulo: "Minas Gerais",
      entrega: { local: { desonerada: "data/setop-MG-current.json", onerada: "data/setop-MG-onerada-current.json" } },
      coleta: "manual", versaoPacote: "2023-08", itens: 3977, pesoMb: 1.37,
      /* as 6 chaves são as do precos{} REAL do arquivo, sem acento e
         abreviadas: é a chave crua que Bases.carregarInclusa usa para
         escolher o preço. Rótulo bonito na tela, chave crua no lookup —
         mandar o rótulo faria o preço voltar como o do padrão, em silêncio. */
      eixos: [
        {
          id: "regiao", rotulo: "Local", padrao: "Triangulo", opcoes: [
            { v: "Triangulo", r: "MG · Triângulo/Alto Paranaíba" },
            { v: "Central", r: "MG · Central" },
            { v: "Norte", r: "MG · Norte" },
            { v: "Sul", r: "MG · Sul" },
            { v: "Leste", r: "MG · Leste" },
            { v: "Jequitinhonha", r: "MG · Jequitinhonha/Mucuri" }
          ]
        },
        /* padrão 'desonerada' espelha App.carregarSetop (app.js:2175), que
           escolhe o arquivo sem sufixo quando o select vem vazio */
        { id: "regime", rotulo: "Regime", padrao: "desonerada", tipo: "arquivo", opcoes: [{ v: "desonerada", r: "Desonerada" }, { v: "onerada", r: "Onerada" }] }
      ],
      nota: "Congelada em 08/2023: de 2024 em diante o portal de MG passou a exigir login no SICOR e o coletor não tem credencial."
    },
    {
      id: "SUDECAP", nome: "SUDECAP", orgao: "Superintendência de Desenvolvimento da Capital — Prefeitura de Belo Horizonte",
      regiao: "sudeste", uf: "MG", localRotulo: "Belo Horizonte (MG)",
      /* ⚠ o pacote grava uf:"BH", que é MUNICÍPIO. Aqui a UF é MG de
         propósito: qualquer agrupamento por estado feito sobre pacote.uf
         jogaria a SUDECAP para fora do mapa do Brasil. */
      entrega: { local: "data/sudecap-BH-current.json" },
      coleta: "manual", versaoPacote: "2026-04", itens: 3590, pesoMb: 0.63,
      eixos: [],
      nota: "Competência híbrida declarada pelo próprio órgão: construção 01/26 com insumos 04/26."
    },
    {
      id: "IOPES", nome: "IOPES", orgao: "Instituto de Obras Públicas do Espírito Santo — DER-ES",
      regiao: "sudeste", uf: "ES", localRotulo: "Espírito Santo",
      entrega: { local: "data/iopes-ES-current.json", vps: "iopes-ES-current.json" },
      chaveStatus: "iopes", coleta: "cron", versaoPacote: "2026-05", itens: 1363, pesoMb: 0.37, eixos: []
    },
    /* ---------------- Nordeste ---------------- */
    {
      id: "ORSE", nome: "ORSE", orgao: "Orçamento de Obras de Sergipe — CEHOP",
      regiao: "nordeste", uf: "SE", localRotulo: "Sergipe",
      entrega: { local: "data/orse-SE-current.json", vps: "orse-SE-current.json" },
      chaveStatus: "orse", coleta: "cron", versaoPacote: "2026-05", itens: 16944, pesoMb: 4.0, eixos: []
    },
    {
      id: "SEINFRA", nome: "SEINFRA", orgao: "Secretaria da Infraestrutura do Estado do Ceará",
      regiao: "nordeste", uf: "CE", localRotulo: "Ceará",
      entrega: { local: "data/seinfra-CE-current.json" },
      coleta: "manual", versaoPacote: "028.1", itens: 15389, pesoMb: 2.58, eixos: [],
      nota: "A SEINFRA numera tabela em vez de datar competência — \"028.1\" é o número oficial, não uma data."
    },
    /* ---------------- Centro-oeste ---------------- */
    {
      id: "AGETOP", nome: "AGETOP Rodoviária", orgao: "Agência Goiana de Infraestrutura e Transportes — GOINFRA",
      regiao: "centro-oeste", uf: "GO", localRotulo: "Goiás",
      entrega: {
        local: { onerada: "data/goinfra-GO-onerada-current.json", desonerada: "data/goinfra-GO-current.json" },
        vps: { onerada: "goinfra-GO-onerada-current.json", desonerada: "goinfra-GO-current.json" },
        rotaVps: "/goinfra/"
      },
      chaveStatus: "goinfra", coleta: "cron", versaoPacote: "2025-12", itens: 566, pesoMb: 0.14,
      eixos: [
        /* ⚠ padrão 'onerada' — é o que App.carregarGoinfra usa hoje
           (app.js:2189: "padrão: SEM desoneração (o que o cliente usa)").
           Inverter aqui mudaria o preço por omissão, sem ninguém pedir. */
        { id: "regime", rotulo: "Regime", padrao: "onerada", tipo: "arquivo", opcoes: [{ v: "onerada", r: "Onerada" }, { v: "desonerada", r: "Desonerada" }] },
        { id: "preco", rotulo: "Preço", padrao: "direto", opcoes: [{ v: "direto", r: "Custo direto" }, { v: "comBDI", r: "Com BDI oficial" }] }
      ],
      nota: "Só a tabela rodoviária (terraplenagem, pavimentação e OAE). No detalhamento, os coeficientes são da EQUIPE POR HORA e o preço é por unidade de serviço — a soma dos insumos não fecha com o preço porque falta o divisor: a produção horária da equipe, que ainda não é coletada."
    },
    /* ---------------- autoral ---------------- */
    {
      id: "PROPRIA", nome: "Suas composições", orgao: "Base autoral da sua empresa",
      regiao: "autoral", uf: "BR", localRotulo: "Vale em qualquer estado",
      entrega: { autoral: true }, coleta: "", versaoPacote: "", itens: 0, eixos: [],
      nota: "Nasce vazia e cresce com o que você cria. Não vem de órgão nenhum e nunca é desativada pela troca de estado."
    }
  ];

  /* ------------------------------------------------------------------
   * OS QUE O MERCADO TEM E NÓS AINDA NÃO DISTRIBUÍMOS.
   *
   * Ficam numa lista SEPARADA, e não no catálogo, por uma razão de
   * segurança e não de organização: entrada sem `entrega` nenhuma não pode
   * ganhar checkbox, não pode ganhar `data-base` e não tem por onde vazar
   * para a denylist de um orçamento nem para a capa de um laudo. Estar em
   * outro array torna isso estrutural em vez de depender de um `if`.
   *
   * A tela mostra estes atrás de um toggle, com o caminho honesto: importar
   * a planilha oficial do órgão em 🗂 Tabelas.
   * ------------------------------------------------------------------ */
  var AUSENTES = [
    { id: "SBC", nome: "SBC", orgao: "Sistema Brasileiro de Custos", regiao: "nacional", uf: "BR" },
    { id: "SIURB", nome: "SIURB", orgao: "Secretaria de Infraestrutura Urbana e Obras — São Paulo", regiao: "sudeste", uf: "SP" },
    { id: "SIURB_INFRA", nome: "SIURB Infra", orgao: "SIURB — tabela de infraestrutura", regiao: "sudeste", uf: "SP" },
    { id: "FDE", nome: "FDE", orgao: "Fundação para o Desenvolvimento da Educação — SP", regiao: "sudeste", uf: "SP" },
    { id: "CPOS", nome: "CPOS", orgao: "Companhia Paulista de Obras e Serviços", regiao: "sudeste", uf: "SP" },
    { id: "EMOP", nome: "EMOP", orgao: "Empresa de Obras Públicas do Estado do Rio de Janeiro", regiao: "sudeste", uf: "RJ" },
    { id: "SCO", nome: "SCO", orgao: "Sistema de Custos de Obras — Rio de Janeiro", regiao: "sudeste", uf: "RJ" },
    { id: "CAEMA", nome: "CAEMA", orgao: "Companhia de Saneamento Ambiental do Maranhão", regiao: "nordeste", uf: "MA" },
    { id: "EMBASA", nome: "EMBASA", orgao: "Empresa Baiana de Águas e Saneamento", regiao: "nordeste", uf: "BA" },
    { id: "CAERN", nome: "CAERN", orgao: "Companhia de Águas e Esgotos do Rio Grande do Norte", regiao: "nordeste", uf: "RN" },
    { id: "COMPESA", nome: "COMPESA", orgao: "Companhia Pernambucana de Saneamento", regiao: "nordeste", uf: "PE" },
    { id: "AGESUL", nome: "AGESUL", orgao: "Agência Estadual de Gestão de Empreendimentos — Mato Grosso do Sul", regiao: "centro-oeste", uf: "MS" },
    { id: "AGETOP_CIVIL", nome: "AGETOP Civil", orgao: "GOINFRA — tabela de edificações", regiao: "centro-oeste", uf: "GO" },
    { id: "SEDOP", nome: "SEDOP", orgao: "Secretaria de Estado de Desenvolvimento Urbano e Obras Públicas — Pará", regiao: "norte", uf: "PA" },
    { id: "DERPR", nome: "DER-PR", orgao: "Departamento de Estradas de Rodagem do Paraná", regiao: "sul", uf: "PR" }
  ];

  function up(s) { return String(s == null ? "" : s).trim().toUpperCase(); }

  var BasesCat = {
    REGIOES: REGIOES,
    CATALOGO: CATALOGO,
    AUSENTES: AUSENTES,
    NUNCA: NUNCA,
    NUNCA_PADRAO: NUNCA_PADRAO,
    ehProibido: ehProibido,
    AUSENTE: AUSENTE, PACOTE: PACOTE, SERVIDOR: SERVIDOR,

    get: function (id) {
      var k = up(id);
      for (var i = 0; i < CATALOGO.length; i++) { if (CATALOGO[i].id === k) return CATALOGO[i]; }
      return null;
    },
    ausente: function (id) {
      var k = up(id);
      for (var i = 0; i < AUSENTES.length; i++) { if (AUSENTES[i].id === k) return AUSENTES[i]; }
      return null;
    },

    /* ----------------------------------------------------------------
     * VERSÃO: formatar e comparar.
     *
     * Formatar é fácil e mesmo assim tem armadilha: "2026-06" e "06/2026"
     * são a MESMA competência (o sintético da SINAPI usa uma forma, o
     * analítico usa a outra, no mesmo pacote) e "028.1" não é data nenhuma.
     * O que não for AAAA-MM nem MM/AAAA sai CRU — inventar barra em "028.1"
     * viraria "028/1", que não existe.
     * ---------------------------------------------------------------- */
    fmtVersao: function (v) {
      var s = String(v == null ? "" : v).trim();
      if (!s) return "";
      var iso = s.match(/^(\d{4})-(\d{2})$/);
      if (iso) return iso[2] + "/" + iso[1];
      if (/^\d{2}\/\d{4}$/.test(s)) return s;
      return s;
    },
    /* forma canônica AAAA-MM para comparar; "" quando não é data */
    _iso: function (v) {
      var s = String(v == null ? "" : v).trim();
      if (/^\d{4}-\d{2}$/.test(s)) return s;
      var br = s.match(/^(\d{2})\/(\d{4})$/);
      return br ? (br[2] + "-" + br[1]) : "";
    },
    /* ⚠ IDADE DA BASE, EM MESES — a peça que faltava no documento.
     *
     * O orçamento já declarava a base e a competência ("SETOP 08/2023"), mas
     * cabia ao leitor fazer a conta e perceber que aquele preço tem quase três
     * anos. Quem instala a base, orça e entrega ao cliente está assinando preço
     * velho sem saber, e a ressalva vivia só na tela de tabelas — não no papel.
     *
     * Devolve null quando não dá para saber (versão fora do padrão de data).
     * ⚠ null é o valor importante: documento nenhum pode afirmar idade que não
     *   conseguiu calcular. Melhor calar do que carimbar "0 meses" num dado que
     *   não é data. */
    idadeMeses: function (versao, hojeISO) {
      var iso = this._iso(versao);
      if (!iso) return null;
      var h = String(hojeISO || "").match(/^(\d{4})-(\d{2})/);
      if (!h) {
        var d = new Date();
        h = [null, String(d.getFullYear()), ("0" + (d.getMonth() + 1)).slice(-2)];
      }
      var av = Number(iso.slice(0, 4)), mv = Number(iso.slice(5, 7));
      var ah = Number(h[1]), mh = Number(h[2]);
      if (!av || !mv || !ah || !mh) return null;
      var m = (ah - av) * 12 + (mh - mv);
      return m < 0 ? 0 : m;                 // versão futura: trata como atual
    },
    /* Idade em texto de gente: "3 meses", "1 ano e 2 meses". */
    idadeTexto: function (versao, hojeISO) {
      var m = this.idadeMeses(versao, hojeISO);
      if (m == null) return "";
      if (m < 1) return "deste mês";
      if (m < 12) return m + (m === 1 ? " mês" : " meses");
      var anos = Math.floor(m / 12), resto = m % 12;
      var t = anos + (anos === 1 ? " ano" : " anos");
      return resto ? t + " e " + resto + (resto === 1 ? " mês" : " meses") : t;
    },

    /* 1 = a mais nova · 0 = iguais · -1 = a mais velha · null = NÃO SEI.
       null é o valor mais importante daqui: nenhum caminho de atualização
       pode concluir "tem versão nova" sem saber comparar. */
    cmpVersao: function (a, b) {
      var ia = this._iso(a), ib = this._iso(b);
      if (!ia || !ib) {
        var sa = String(a == null ? "" : a).trim(), sb = String(b == null ? "" : b).trim();
        if (sa && sb && sa === sb) return 0; // "028.1" vs "028.1" é comparável
        return null;
      }
      return ia === ib ? 0 : (ia > ib ? 1 : -1);
    },

    /* ----------------------------------------------------------------
     * SELEÇÃO DOS EIXOS (Local / Regime / Preço).
     * O padrão de cada eixo espelha o default do handler que ele substitui
     * (SETOP → app.js:2175, GOINFRA → app.js:2189-2190). "Dois defaults para
     * o mesmo dado" é o defeito que se está eliminando; divergir aqui só
     * trocaria de lugar o problema — e mudaria preço por omissão.
     * ---------------------------------------------------------------- */
    selPadrao: function (id, ctx) {
      var e = this.get(id); if (!e) return null;
      var sel = {}, self = this;
      (e.eixos || []).forEach(function (ex) {
        var ops = self.opcoesDoEixo(e, ex, ctx);
        var pad = ex.padrao || (ops.length ? ops[0].v : "");
        // padrão que não existe entre as opções reais não pode vencer
        var achou = false;
        for (var i = 0; i < ops.length; i++) { if (ops[i].v === pad) achou = true; }
        sel[ex.id] = achou ? pad : (ops.length ? ops[0].v : "");
      });
      return sel;
    },

    /* Opções REAIS de um eixo. Quando o eixo declara `de`, elas vêm do
       contexto (o que o servidor/manifesto informou de verdade); sem
       contexto, vale o que veio no pacote. Nunca o que se imagina. */
    opcoesDoEixo: function (entrada, eixo, ctx) {
      ctx = ctx || {};
      if (eixo.de && ctx[eixo.de] && ctx[eixo.de].length) {
        return ctx[eixo.de].map(function (o) {
          return (o && o.v) ? o : { v: String(o), r: String(o) };
        });
      }
      return (eixo.opcoes || []).slice();
    },

    /* ----------------------------------------------------------------
     * RESOLVER: seleção → arquivo que se vai abrir.
     * Só eixo com tipo:"arquivo" muda o ARQUIVO (regime do SETOP e da
     * GOINFRA). Região e preço são remapeamento DENTRO do mesmo arquivo
     * (o argumento `regiao` de Bases.carregarInclusa, bases.js:159) —
     * confundir os dois faz baixar o arquivo certo e ler a coluna errada.
     * ---------------------------------------------------------------- */
    resolver: function (id, sel, ctx) {
      var e = this.get(id); if (!e || !e.entrega) return null;
      sel = sel || this.selPadrao(id, ctx) || {};
      var loc = e.entrega.local, vps = e.entrega.vps;
      if (loc && typeof loc === "object") {
        var chave = "";
        (e.eixos || []).forEach(function (ex) { if (ex.tipo === "arquivo") chave = sel[ex.id] || ex.padrao; });
        loc = loc[chave] || null;
        if (vps && typeof vps === "object") vps = vps[chave] || null;
      }
      /* troca o <UF> em quem tem eixo de UF — no caminho local E no do servidor.
         A SINAPI desonerada so tem o do servidor (nao vem no pacote). */
      var eixoUf = (e.eixos || []).filter(function (x) { return x.id === "uf" && x.de !== "estados"; })[0];
      if (eixoUf) {
        var uf = up(sel.uf || eixoUf.padrao || "");
        if (uf) {
          if (loc) loc = String(loc).replace("<UF>", uf);
          if (vps) vps = String(vps).replace("<UF>", uf);
        }
      }
      // o remapeamento de preço dentro do arquivo (região do SETOP, direto/
      // comBDI da GOINFRA): é o 3º argumento de Bases.carregarInclusa
      var remap = "";
      (e.eixos || []).forEach(function (ex) {
        if (ex.tipo === "arquivo" || ex.de) return;
        if (sel[ex.id]) remap = sel[ex.id];
      });
      /* `arquivo` pode ser null numa entrada que so existe no servidor — quem
         instala tem de saber que, para ela, nao ha queda para o pacote. */
      return { arquivo: loc || null, vps: vps || null, soServidor: !loc && !!vps, rotaVps: e.entrega.rotaVps || "/bases/", remap: remap || null };
    },

    /* ----------------------------------------------------------------
     * AVALIAR — o coração da honestidade.
     *
     * Recebe FATOS e devolve o que a linha pode dizer. Nada aqui é lido de
     * um campo "status" escrito à mão, porque campo escrito à mão envelhece
     * calado: alguém roda um coletor, esquece de mudar a string, e a tela
     * passa a mentir sem que nenhum teste perceba.
     *
     * ctx = {
     *   instaladas: { FONTE: {competencia, uf, total} }  ← Bases.lista()
     *   servidor:   { chave: {competencia, publicadoEm} } ← /api/bases-status
     *   estados:    [{uf, competencia}]                   ← data/estados.json
     *   sicroUfs:   [{v,r}]                               ← UFs coletadas
     * }
     * ---------------------------------------------------------------- */
    avaliar: function (entrada, ctx) {
      ctx = ctx || {};
      var e = (typeof entrada === "string") ? this.get(entrada) : entrada;
      if (!e) return { grau: AUSENTE, podeUsar: false, rotulo: "Sem fonte conectada", coletaServidor: "", atualizacaoCliente: "", versao: "", versaoOrigem: "", temNova: false, versaoServidor: "" };

      var temLocal = !!(e.entrega && (e.entrega.local || e.entrega.autoral));
      var temVps = !!(e.entrega && e.entrega.vps);
      var grau = temVps ? SERVIDOR : (temLocal ? PACOTE : AUSENTE);

      var inst = (ctx.instaladas && ctx.instaladas[e.id]) || null;
      /* ⚠ A VERSÃO EXIBIDA É A DA BASE INSTALADA, não a do catálogo.
         O catálogo só sabe o que veio no pacote; se o cliente já atualizou o
         ORSE para 07/2026, mostrar a competência cravada aqui seria uma
         REGRESSÃO — o Passo 3 de hoje mostra a competência real. */
      var versao = (inst && inst.competencia) ? inst.competencia : (e.versaoPacote || "");
      /* a base AUTORAL não "vem no pacote": ela nasce vazia no computador do
         cliente. Rotulá-la como as outras seria dizer que o app trouxe
         composições que ninguém escreveu ainda. */
      var autoral = !!(e.entrega && e.entrega.autoral);
      var versaoOrigem = (inst && inst.competencia) ? "instalada" : ((temLocal && !autoral) ? "pacote" : "");

      var srv = (e.chaveStatus && ctx.servidor && ctx.servidor[e.chaveStatus]) || null;
      var versaoServidor = (srv && srv.competencia) ? String(srv.competencia) : "";
      // só afirma "tem versão nova" quando SABE comparar (cmpVersao === 1)
      var temNova = !!(versaoServidor && this.cmpVersao(versaoServidor, versao) === 1);

      /* Os dois campos que substituem o "atualiza sozinho" mentiroso. */
      var coletaServidor = e.coleta === "cron"
        ? "Coletor semanal no servidor da RA"
        : (grau === AUSENTE ? "" : (e.entrega && e.entrega.autoral ? "" : "Publicada à mão pela RA"));
      /* No app do cliente, hoje, SÓ a SINAPI se atualiza sozinha
         (Atualizacao.checarAuto, atualizacao.js:118). Os extras dependem do
         botão em 🗂 Tabelas. Enquanto for assim, nenhuma outra linha pode
         dizer "sozinho". */
      var atualizacaoCliente = grau === AUSENTE ? ""
        : (e.entrega && e.entrega.autoral ? "Sua base — só muda quando você mexe"
          : (e.id === "SINAPI" ? "O app avisa e baixa sozinho"
            : (grau === SERVIDOR ? "Você atualiza em 🗂 Tabelas (o servidor já tem a nova)" : "Você atualiza em 🗂 Tabelas")));

      var rotulo = grau === AUSENTE ? "Sem fonte conectada"
        : (inst ? "Instalada" : (grau === SERVIDOR ? "Pronta — baixa do servidor" : "Pronta — vem no app"));

      return {
        grau: grau,
        podeUsar: grau !== AUSENTE,
        instalada: !!inst,
        itensInstalados: inst ? (inst.total || 0) : 0,
        rotulo: rotulo,
        coletaServidor: coletaServidor,
        atualizacaoCliente: atualizacaoCliente,
        versao: versao,
        versaoOrigem: versaoOrigem,
        versaoServidor: versaoServidor,
        temNova: temNova,
        nota: e.nota || ""
      };
    },

    /* Linhas agrupadas por região, na ordem de REGIOES — o que a tela desenha.
       `incluirAusentes` traz os 15 do mercado que ainda não distribuímos, e
       eles vêm marcados com ausente:true para a UI não conseguir dar
       checkbox por engano. */
    porRegiao: function (ctx, incluirAusentes) {
      var self = this, out = [];
      REGIOES.forEach(function (reg) {
        var linhas = [];
        CATALOGO.forEach(function (e) {
          if (e.regiao !== reg.id) return;
          linhas.push({ entrada: e, ausente: false, av: self.avaliar(e, ctx) });
        });
        if (incluirAusentes) {
          AUSENTES.forEach(function (a) {
            if (a.regiao !== reg.id) return;
            linhas.push({ entrada: a, ausente: true, av: self.avaliar(null, ctx) });
          });
        }
        if (linhas.length) out.push({ regiao: reg, linhas: linhas });
      });
      return out;
    }
  };

  global.BasesCat = BasesCat;
  if (typeof module !== "undefined" && module.exports) module.exports = BasesCat;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
