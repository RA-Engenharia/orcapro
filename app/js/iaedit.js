/* =====================================================================
 * iaedit.js — A IA QUE EDITA O ORÇAMENTO (motor puro, universo fechado)
 *
 * O padrão da casa (espec v2, I9): a IA PROPÕE → este motor VALIDA num
 * universo fechado → a tela mostra o diff com checkbox → a PESSOA aplica →
 * desfazer de 1 nível. Nunca preço, código, custo, BDI, coeficiente, dado do
 * cliente nem número novo em texto. Quantidade = FORMA + MEDIDAS, e quem
 * calcula é Orcamento.calcularMemoria — nunca um número pronto do modelo.
 *
 * API (global.IAEdit, também module.exports):
 *   contexto(orc, alvo, pedido, opts) → o que vai ao servidor (enxuto) e o
 *       RETRATO (snapshot) que fica NO CLIENTE, guardado por reqId.
 *   validar(orc, ops, snapshot, opts) → aceitas (com o `de` tirado do
 *       retrato), recusadas (com motivo), efeito antes → depois, avisos.
 *   efeito(orc, aceitasMarcadas, opts) → totalProposta (o obrigatório),
 *       totalOpcional, totalComOpcionais (o que a proposta clássica imprime),
 *       prazo e término, antes → depois.
 *   aplicar(orc, aceitasMarcadas, carimbo, opts) → escreve pelos mutadores
 *       do Orcamento e pelos mapas do cronograma/comercial; guarda o desfazer.
 *       ⚠ com opts.cronAlvo (plano da obra) exige opts.destinoDesfazer — sem
 *       ele devolve {erro} e não escreve nada (o aprovado não é tocado nem
 *       em memória). O desfazer tem a mesma regra.
 *   desfazer(orc, opts) / limparDesfazer(orc) / fechoDesmarcar(aceitas, idx)
 *   deCronogramaAntigo(resposta, pedidoCapturado) → a resposta da rota velha
 *       /ia/cronograma vira ops definir_duracao e passa pelo MESMO validar.
 *
 * ⚠ POR QUE O `de` NÃO VEM DA IA (crítica ia-seguranca, item 2). Ao repetir
 *   um texto longo o modelo normaliza espaços, acentos e quebras de linha: toda
 *   op de texto seria recusada como "ficou velho" sem ter ficado, e ecoar o
 *   texto dobraria o custo da resposta. O `de` sai do RETRATO que o próprio
 *   cliente tirou ao montar o contexto; "ficou velho" = valor atual ≠ retrato.
 *
 * ⚠ POR QUE UM CATÁLOGO TÃO CURTO. Ficaram de fora (e são recusados com o
 *   motivo, nunca descartados calados): remover_item e marcar_opcional (um
 *   clique na planilha; pela IA, um mexe no total da proposta com diff que
 *   mente e o outro exige reinserir o MESMO item), adicionar_servico (código
 *   e preço vêm da base), alterar_pagina_modelo (entidade da empresa, links
 *   de contato que vão ao cliente), definir_parametro (data de início vinda
 *   de um modelo que não sabe o dia de hoje) e condições de pagamento, prazo
 *   e validade (dinheiro e promessa).
 *
 * ⚠ OS TETOS (TETOS abaixo) SÃO PENDÊNCIA DO ROGÉRIO: os números são valores
 *   iniciais CONSERVADORES, escritos como constantes nomeadas para serem
 *   trocados num lugar só.
 * ===================================================================== */
(function (global) {
  "use strict";

  var own = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  var J = function (x) { return JSON.stringify(x); };
  function copia(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v == null ? "" : String(v).trim(); }
  function O() { return global.Orcamento; }
  function C() { return global.Cronograma; }
  function P() { return global.Proposta; }
  function num(v) {
    var U = global.Util;
    if (U && U.num) return U.num(v);
    var n = Number(v); return isFinite(n) ? n : 0;
  }
  function norm(s) {
    s = String(s == null ? "" : s).toLowerCase();
    try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return s.replace(/\s+/g, " ").trim();
  }
  function agora() { try { return global.Util.agoraISO(); } catch (e) { return new Date().toISOString(); } }
  function fmtN(v, c) {
    try { return global.Util.fmtNum(v, c == null ? 2 : c); } catch (e) { return String(v); }
  }
  function un(u) {
    try { return global.Util.unidadeExibir(u); } catch (e) { return String(u == null ? "" : u); }
  }
  function kb(bytes) { return Math.ceil(bytes / 1024); }
  /* tamanho em BYTES UTF-8 (o teto do servidor é em bytes; acento vale 2) */
  function bytesUtf8(s) {
    try { return unescape(encodeURIComponent(String(s))).length; } catch (e) { return String(s).length * 3; }
  }
  /* ⚠ O QUE ENGANA A CONTAGEM (revisão 4A) — a MESMA régua de
     server/ia-editar.js (o roteiro inteiro está lá). O modelo escreveu
     "３０%" (largura cheia), "𝟑𝟎" (dígito matemático), "trint" + um "a"
     cirílico, e "5" + espaço de largura zero + "5" (na tela, 55): `\d` só vê
     0-9 e a lista de palavras compara letra a letra — os quatro foram
     aceitos, marcados, gravados e impressos na proposta. Por isso: o
     invisível sai do texto GRAVADO (limparTexto); os números se contam no
     texto em NFKC (paraContar); e caractere fora do alfabeto de uma proposta
     em português, que não estava no texto atual nem no pedido, recusa a op
     (problemaDeTexto). Sem String.prototype.normalize (WebView antiga) a
     régua do alfabeto continua segurando largura cheia e dígito matemático. */
  var RE_INVISIVEL = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;
  var RE_FORA_ALFABETO = /[^\t\n\x20-\x7e\u00a0-\u00ff\u2010-\u2015\u2018-\u201f\u2022\u2026\u2030\u2032\u2033\u2044\u20ac\u2122\u2190-\u2193\u2212\u2248\u2264\u2265]/g;
  /* "<" seguido de letra, "/", "!" ou "?" é marcação; "h < 3 m" não é */
  var RE_MARCACAO = /<\s*[A-Za-z\/!?]/;
  function semMarcacao(s) { return String(s).replace(/</g, "\u2039").replace(/>/g, "\u203a"); }
  /* o texto em que se CONTAM números: sem invisível, sem o expoente de
     unidade (m², cm³ é unidade, não número) e em NFKC */
  function paraContar(s) {
    s = String(s == null ? "" : s).replace(RE_INVISIVEL, "").replace(/([A-Za-z\u00c0-\u00ff])[\u00b2\u00b3\u00b9]/g, "$1");
    try { s = s.normalize("NFKC"); } catch (e) {}
    return s;
  }
  function hex4(ch) { var h = ch.charCodeAt(0).toString(16).toUpperCase(); while (h.length < 4) h = "0" + h; return "U+" + h; }
  /* os caracteres fora do alfabeto do texto novo que NÃO estão nas fontes
     (texto atual, pedido) — por unidade UTF-16, dos dois lados */
  function foraDoAlfabeto(t, fontes) {
    var ok = {}, fora = [], i;
    arr(fontes).forEach(function (f) { f = String(f == null ? "" : f); for (var j = 0; j < f.length; j++) ok[f.charAt(j)] = 1; });
    var achados = String(t == null ? "" : t).match(RE_FORA_ALFABETO) || [];
    for (i = 0; i < achados.length; i++) { var h = hex4(achados[i]); if (!own(ok, achados[i]) && fora.indexOf(h) < 0) fora.push(h); }
    return fora;
  }
  /* texto que vai ao cliente (nome, texto da proposta, memória): marcação e
     caractere de fora recusam a op. ⚠ A tela escapa tudo (Util.esc); isto
     é a segunda camada — cada consumidor de e.nome passa a ter um escritor
     remoto. */
  function problemaDeTexto(para, de, pedido) {
    if (RE_MARCACAO.test(para)) return "traz marcação HTML (<…>) — não entra em texto que vai ao cliente";
    var fa = foraDoAlfabeto(para, [de, pedido]);
    if (fa.length) return "caractere fora do alfabeto (" + fa.slice(0, 3).join(", ") + ") — letra de outro alfabeto ou dígito que imita número não entra; peça de novo";
    return "";
  }

  /* texto de UMA linha (nomes) ou de várias (textos da proposta, memória):
     sem caractere de controle, sem invisível, sem CRLF, sem espaço nas pontas */
  function limparTexto(s, multi) {
    s = String(s == null ? "" : s).replace(RE_INVISIVEL, "").replace(/\r\n?/g, "\n");
    s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    if (!multi) s = s.replace(/\s+/g, " ");
    else s = s.replace(/[ \t]+\n/g, "\n");
    return s.trim();
  }
  function cortar(s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  /* ================= TETOS — ⚠ PENDÊNCIA DO ROGÉRIO =================
     Valores iniciais conservadores. O de contexto saiu da medição num backup
     real (crítica ia-seguranca, item 8): ~150 caracteres por serviço no
     formato enxuto → ~160 serviços por pedido, ~6 mil tokens de entrada. */
  /* ⚠ contexto, pedido, corpo e ops são os MESMOS números do servidor
     (server/ia-editar.js, LIMITES_PADRAO): cliente com teto maior que o do
     servidor mandaria o pedido para voltar 413 depois de a pessoa esperar. */
  var TETOS = {
    contextoCaracteres: 20000,  // JSON do contexto (o servidor mede o mesmo); acima: "escolha as etapas"
    corpoBytes: 64 * 1024,      // corpo inteiro em bytes UTF-8 (teto do servidor)
    pedidoCaracteres: 1500,     // o texto que a pessoa escreve
    opsPorResposta: 30,         // o que passar disso é recusado com motivo (não some)
    memoriaContexto: 1500,      // memória maior que isto NÃO vai (o servidor corta em 1.500: a IA reescreveria um texto mutilado)
    textoContexto: 6000,        // idem para os textos da proposta (o servidor corta em 6.000)
    desfazerBytes: 20000,       // orc.iaEdicao; acima: aplica sem o botão Desfazer e DIZ
    historico: 10,              // entradas em orc.iaHistorico
    pedidoHistorico: 300,       // caracteres do pedido guardados no desfazer/histórico
    descricaoContexto: 100,     // descrição do serviço no contexto
    nome: 120,                  // nome de etapa/subetapa
    texto: 4000,                // texto da proposta
    memoria: 3000,              // memória de cálculo
    motivo: 200,                // justificativa da IA (vai ao diff e ao iaMotivos)
    diasMin: 1, diasMax: 999,   // definir_duracao
    equipesMin: 1, equipesMax: 50,
    lagMax: 120,                // |espera| em dias úteis num elo de dependência
    predsMax: 20,               // predecessoras numa op
    /* ⚠ alterar_quantidade (revisão 4A): medida acima de medidaMax é
       overflow, não obra (= server/ia-editar.js MEDIDA_MAX); quantidade que a
       conta da IA leva acima de quantidadeMax é recusada — além de dinheiro,
       ela congelava a aba (1e8 m² = 10 s no Cronograma.estimar do efeito; 1e18
       não terminou em 5 min); e mudança maior que fatorQuantidade vezes a
       atual (para mais ou para menos) vem DESMARCADA. */
    medidaMax: 100000,
    quantidadeMax: 1000000,
    fatorQuantidade: 3
  };

  var AVISO_PRIVACIDADE = "O pedido e os textos selecionados vão ao provedor de IA. Custos, BDI e dados do cliente não vão.";
  var PEDIDO_REFINAR = "Refine a duração de cada etapa pelo porte dos serviços. Não mexa no que eu defini.";

  var CAMPOS_TEXTO = ["apresentacao", "incluso", "excluso", "garantia", "premissas", "metodologia", "respContratada", "respContratante"];
  var ROTULO_CAMPO = {
    apresentacao: "Apresentação", incluso: "Está incluso", excluso: "Não está incluso", garantia: "Garantia",
    premissas: "Premissas", metodologia: "Metodologia",
    respContratada: "Responsabilidades da contratada", respContratante: "Responsabilidades do contratante"
  };
  /* ⚠ termos de dinheiro e de prazo: o próprio prompt da casa proíbe a IA de
     escrevê-los (orcapro-ia.js SYS_MODELO_PROPOSTA). Recusa com o motivo. */
  var CAMPOS_TEXTO_FORA = {
    condicoesPagamento: "condições de pagamento são dinheiro — ficam com você, no modal Dados",
    prazoExecucao: "prazo de execução é promessa ao cliente — fica com você (o cronograma dá o número)",
    validadeProposta: "validade da proposta fica com você, no modal Dados",
    validadeDias: "validade da proposta fica com você, no modal Dados",
    linkPlanilha: "o link da planilha fica com você, no modal Dados"
  };

  var CATALOGO = [
    { op: "alterar_quantidade", grupo: "planilha", campos: ["itemId", "forma", "dados", "motivo"],
      regra: "a quantidade sai da FORMA e das MEDIDAS (lista de formas); nunca um número pronto" },
    { op: "criar_etapa", grupo: "planilha", campos: ["ref", "nome", "motivo"],
      regra: "ref = \"novo:1\", \"novo:2\"… declarado ANTES de ser usado por outra mudança" },
    { op: "renomear_etapa", grupo: "planilha", campos: ["etapaId", "para", "motivo"] },
    { op: "criar_subetapa", grupo: "planilha", campos: ["ref", "etapaId", "nome", "motivo"],
      regra: "etapaId pode ser o ref de uma etapa criada antes nesta resposta" },
    { op: "renomear_subetapa", grupo: "planilha", campos: ["subEtapaId", "para", "motivo"] },
    { op: "mover_item_para_subetapa", grupo: "planilha", campos: ["itemId", "subEtapaId", "motivo"],
      regra: "só dentro da MESMA etapa; subEtapaId pode ser o ref de uma subetapa criada antes" },
    { op: "definir_duracao", grupo: "cronograma", campos: ["alvoId", "dias", "motivo"],
      regra: "dias inteiro de 1 a 999; subetapa só no cronograma executivo" },
    { op: "definir_dependencia", grupo: "cronograma", campos: ["alvoId", "preds", "lags", "tipos", "motivo"],
      regra: "preds = lista de ids ([] = sem dependência); subetapa só depende de subetapa da MESMA etapa; tipos {predId:\"II\"} só entre subetapas" },
    { op: "marcar_marco", grupo: "cronograma", campos: ["alvoId", "motivo"] },
    { op: "definir_equipes", grupo: "cronograma", campos: ["folhaId", "n", "motivo"], regra: "n inteiro de 1 a 50" },
    { op: "alterar_texto", grupo: "documentos", campos: ["campo", "para", "motivo"],
      regra: "campo ∈ " + CAMPOS_TEXTO.join(", ") + "; nenhum número, %, R$ ou data que não esteja no texto atual ou no pedido; use [preencher: …] no que faltar" },
    { op: "alterar_memoria_calculo", grupo: "documentos", campos: ["itemId", "para", "motivo"],
      regra: "só a redação; nenhum número que não esteja na memória atual ou no pedido" }
  ];
  var CAT = {};
  CATALOGO.forEach(function (c) { CAT[c.op] = c; });

  var FORA = {
    remover_item: "remover serviço fica com você, na planilha — fora desta entrega da IA",
    marcar_opcional: "marcar etapa como opcional muda o total da proposta — fica com você, na planilha",
    adicionar_servico: "serviço novo entra pela busca da base (código e preço vêm da base) — fora desta entrega da IA",
    alterar_pagina_modelo: "modelo de proposta se edita no módulo Modelos de Proposta — fora desta entrega da IA",
    definir_parametro: "início, dias por semana, feriados e paralelismo ficam com você, na aba Parâmetros",
    mover_etapa: "reordenar etapas muda as datas da obra — fica com você, na planilha",
    trocar_por_candidato: "trocar a composição é pela busca da base — fora desta entrega da IA",
    alterar_descricao: "a descrição do serviço vem da base — fora desta entrega da IA",
    alterar_texto_comercial: "use alterar_texto (condições de pagamento, prazo e validade ficam com você)"
  };

  /* ⚠ CHAVE PROIBIDA DERRUBA A OP INTEIRA. Uma op que traz `custoUnitario`
     junto com um nome não tem a parte boa aproveitada: quem escreveu a chave
     proibida já saiu do universo fechado, e aproveitar "o resto" é confiar
     numa resposta que mostrou não obedecer. `quantidade`/`qtd` também: a
     quantidade sai da forma + medidas, nunca de um número pronto.
     ⚠ SEM ACENTO, SEM CAIXA E POR PREFIXO (revisão 4A): a lista antiga casava
     só a grafia exata, e {"Codigo": ...}, {"código": ...}, {"codigoSinapi": ...}
     e {"Quantidade": 5} passavam. É a MESMA régua de server/ia-editar.js
     (PROIBIDAS_*): mudou uma, muda a outra. As chaves de `lags` e `tipos` são
     IDS de nó, não nomes de campo — não entram. O recado leva o nome
     normalizado ([a-z0-9]), nunca o texto cru do modelo. */
  var PROIBIDAS_PREFIXO = ["custo", "preco", "bdi", "cliente", "codigo", "competencia", "coeficiente", "encargo", "valor", "quantidade", "qtd", "total", "parcela"];
  var PROIBIDAS_EXATAS = { basefonte: 1, origem: 1, desonerado: 1, modocusto: 1, ajustes: 1, estadoaprovacao: 1, historicoaprovacao: 1, fechamento: 1, uf: 1 };
  function nomeChave(k) { return norm(k).replace(/[^a-z0-9]/g, ""); }
  function ehProibida(k) {
    var n = nomeChave(k);
    if (own(PROIBIDAS_EXATAS, n)) return true;
    for (var i = 0; i < PROIBIDAS_PREFIXO.length; i++) if (n.indexOf(PROIBIDAS_PREFIXO[i]) === 0) return true;
    return false;
  }
  function chaveProibida(o, prof, mapaDeIds) {
    if (!o || typeof o !== "object" || (prof || 0) > 5) return "";
    var ks = Object.keys(o);
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (!mapaDeIds && ehProibida(k)) return nomeChave(k) || "?";
      var sub = chaveProibida(o[k], (prof || 0) + 1, !(prof || 0) && (k === "lags" || k === "tipos"));
      if (sub) return sub;
    }
    return "";
  }

  /* NÚMERO LITERAL: número JSON finito, ou texto "12" / "2,5". Conta ("5*4"),
     "+3" e o ambíguo "1.500" (mil e quinhentos? um e meio?) não entram —
     medido em 14/08: o modelo devolveu {"area": 5 * 4 * 2}. */
  function numLiteral(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "string") {
      var s = v.trim();
      if (/^-?\d+$/.test(s)) return parseInt(s, 10);
      if (/^-?\d+,\d+$/.test(s)) return parseFloat(s.replace(",", "."));
    }
    return null;
  }
  function inteiroNaFaixa(v, min, max) { return v !== null && Math.floor(v) === v && v >= min && v <= max; }

  /* ⚠ NÚMERO NOVO EM TEXTO (crítica ia-seguranca, item 4). "Entrada de 30%",
     "90 dias", "garantia de 10 anos" inventados passariam pelo auditor da
     proposta, que só procura custo e palavra proibida. Regra: todo número
     (com % / R$ / data inclusos — são números), e todo número por extenso de
     "dois" para cima, no texto novo tem de estar no texto ATUAL ou,
     LITERALMENTE, no pedido da pessoa. "um"/"uma" não entram: são artigo;
     "meio"/"meia" também não (meio-fio, meia-cana).
     ⚠ NÚMERO DENTRO DE [preencher: …] TAMBÉM CONTA (revisão 4A). Antes o
     marcador era isento: "[preencher: entrada de 30% e saldo em 90 dias]" foi
     aceito, marcado, e a proposta imprimiu "entrada de 30% e saldo em 90 dias"
     — o marcador é para a PESSOA completar; número que a IA põe nele é número
     que a IA inventou. O servidor já contava; agora as duas camadas são a
     mesma régua. */
  var VALOR_PALAVRA = {
    dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
    treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
    vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
    cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400,
    quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700,
    setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900, mil: 1000,
    milhao: 1000000, milhoes: 1000000, bilhao: 1000000000, bilhoes: 1000000000, dezena: 10, dezenas: 10,
    duzia: 12, duzias: 12, centena: 100, centenas: 100, dobro: 2, triplo: 3, metade: 0.5
  };
  var PALAVRAS_NUM = VALOR_PALAVRA;
  function tokensNumero(s) {
    var t = paraContar(s), out = {};
    t.replace(/\d+(?:[.,:\/\-]\d+)*/g, function (m) { out[m] = 1; return m; });
    norm(t).replace(/[a-z]+/g, function (w) { if (own(PALAVRAS_NUM, w)) out["#" + w] = 1; return w; });
    return out;
  }
  function numerosNovos(para, de, pedido) {
    var p = tokensNumero(para), a = tokensNumero(de), b = tokensNumero(pedido), novos = [];
    Object.keys(p).forEach(function (k) { if (!own(a, k) && !own(b, k)) novos.push(k.charAt(0) === "#" ? k.slice(1) : k); });
    return novos;
  }

  /* ⚠ DE ONDE A MEDIDA PODE VIR (revisão 4A — a mesma régua de
     server/ia-editar.js, VALIDA.dados). O validar só conferia "número literal
     ≥ 0": com o pedido "revise a alvenaria" a medida 9999 × 9999 foi aceita
     JÁ MARCADA (100 m² → 99.980.001 m²), e com a quantidade atual (100) nos
     três campos o item virou 1.000.000 m². Agora:
     - a fonte é o PEDIDO. Não a descrição (vem de planilha de terceiros: é o
       vetor da injeção — "BLOCO 14X19X39 CM" virou {39, 19, 14}), não a
       quantidade atual (refazer a conta com ela não precisa de IA), não a
       memória (a IA nem a recebe no alvo planilha);
     - MULTICONJUNTO: cada número escrito cobre UMA medida;
     - livres: 0, 1 e o padrão do PRÓPRIO campo (a inclinação 30 do telhado
       não vira área 30);
     - cm→m e mm→m do número escrito (5 cm escrito, 0,05 na conta), tentados
       só depois de todos os casamentos exatos.
     Leitura BR do número escrito, como no servidor: "1.500,00" = 1500,
     "3.000" = 3000, "2,5" = 2.5, "10.5" = 10.5; "12/03" = as partes. */
  function canonN(v) { return String(Math.round(Number(v) * 1e6) / 1e6); }
  function valoresBR(t) {
    if (/^\d+$/.test(t)) return [canonN(t)];
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return [canonN(t.replace(/\./g, "").replace(",", "."))];
    if (/^\d+,\d+$/.test(t)) return [canonN(t.replace(",", "."))];
    if (/^\d+\.\d+$/.test(t)) return [canonN(t)];
    return t.split(/[.,:\/\-]/).filter(function (x) { return x; }).map(canonN);
  }
  function saldoNumeros(texto) {
    var t = paraContar(texto), c = {};
    function soma(v) { c[v] = (own(c, v) ? c[v] : 0) + 1; }
    (t.match(/\d+(?:[.,:\/\-]\d+)*/g) || []).forEach(function (m) { valoresBR(m).forEach(soma); });
    (norm(t).match(/[a-z]+/g) || []).forEach(function (w) { if (own(VALOR_PALAVRA, w)) soma(canonN(VALOR_PALAVRA[w])); });
    return c;
  }
  /* devolve as medidas ("campo = valor") que nenhuma fonte cobre (vazio = ok) */
  function medidasSemOrigem(dados, F, fontes) {
    var saldo = {}, pad = {}, pend = [], falta = [];
    arr(fontes).forEach(function (f) { var s = saldoNumeros(f); for (var k in s) if (own(s, k)) saldo[k] = (own(saldo, k) ? saldo[k] : 0) + s[k]; });
    arr(F && F.campos).forEach(function (c) { if (c && c.padrao != null) pad[c.id] = c.padrao; });
    function tira(v) { if (own(saldo, v) && saldo[v] > 0) { saldo[v]--; return true; } return false; }
    Object.keys(dados).forEach(function (k) {
      var x = dados[k];
      if (x === 0 || x === 1 || (own(pad, k) && canonN(pad[k]) === canonN(x))) return;
      if (!tira(canonN(x))) pend.push(k);
    });
    pend.forEach(function (k) { var x = dados[k]; if (!tira(canonN(x * 100)) && !tira(canonN(x * 1000))) falta.push(k + " = " + String(x).replace(".", ",")); });
    return falta;
  }
  function motivoLimpo(m) { return semMarcacao(cortar(String(m == null ? "" : m).replace(RE_INVISIVEL, ""), TETOS.motivo)); }

  function validarNome(nome, de, pedido) {
    if (!nome) return "nome vazio";
    if (nome.length > TETOS.nome) return "nome longo demais (" + nome.length + " caracteres; o teto é " + TETOS.nome + ")";
    var pt = problemaDeTexto(nome, de, pedido);
    if (pt) return pt;
    var nv = numerosNovos(nome, de, pedido);
    if (nv.length) return "número novo que você não escreveu (" + nv.slice(0, 4).join(", ") + ") — número só entra se estiver no nome atual ou no seu pedido";
    return "";
  }

  /* ================= LOCALIZAR NO ORÇAMENTO ================= */
  function acharEtapa(orc, id) {
    var es = arr(orc && orc.etapas);
    for (var i = 0; i < es.length; i++) if (es[i] && es[i].id === id) return { etapa: es[i], ei: i };
    return null;
  }
  function acharItem(orc, itemId) {
    var es = arr(orc && orc.etapas);
    for (var i = 0; i < es.length; i++) {
      var its = arr(es[i] && es[i].itens);
      for (var j = 0; j < its.length; j++) if (its[j] && its[j].id === itemId) return { etapa: es[i], it: its[j], ei: i, ii: j };
    }
    return null;
  }
  function acharSub(orc, subId) {
    var es = arr(orc && orc.etapas);
    for (var i = 0; i < es.length; i++) {
      var ss = arr(es[i] && es[i].subetapas);
      for (var j = 0; j < ss.length; j++) if (ss[j] && ss[j].id === subId) return { etapa: es[i], sub: ss[j], ei: i };
    }
    return null;
  }
  /* o subEtapaId COMO A PLANILHA O VÊ: órfão (subetapa apagada) conta como solto */
  function subDoItem(loc) {
    var sid = loc && loc.it && loc.it.subEtapaId ? String(loc.it.subEtapaId) : "";
    if (!sid) return "";
    return arr(loc.etapa.subetapas).some(function (s) { return s && s.id === sid; }) ? sid : "";
  }
  /* mapa para LER sem criar / mapa para ESCREVER (cria se faltar) */
  function ler(o, k) { return (o && o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) ? o[k] : {}; }
  function mapa(o, k) { if (!o[k] || typeof o[k] !== "object" || Array.isArray(o[k])) o[k] = {}; return o[k]; }
  /* foto de UMA chave para o desfazer: {} = não existia; {v} = existia com v.
     (undefined não sobrevive ao JSON do disco — por isso a presença é a chave) */
  function foto(o, k) { return own(o, k) ? { v: copia(o[k]) } : {}; }
  function volta(o, k, f) { if (f && own(f, "v")) o[k] = copia(f.v); else delete o[k]; }
  function ordenar(o) {
    var r = {};
    if (!o || typeof o !== "object") return r;
    Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; });
    return r;
  }
  function execRede(cron) { return !!(cron && cron.exec && cron.exec.rede === true); }
  /* o orçamento visto com OUTRO cronograma (o plano da obra, Fase 3): cópia
     rasa, o orçamento de verdade não é tocado */
  function vista(orc, cron) {
    if (!cron || (orc && orc.cronograma === cron)) return orc;
    var v = {};
    for (var k in orc) if (own(orc, k)) v[k] = orc[k];
    v.cronograma = cron;
    return v;
  }
  /* nível de um id do cronograma pelo DADO (sem montar árvore): etapa, ou
     folha (subetapa / grupo de soltos "etapaId~g") */
  function nivelDe(orc, id) {
    if (acharEtapa(orc, id)) return "etapa";
    if (acharSub(orc, id)) return "folha";
    if (/~g$/.test(id) && acharEtapa(orc, id.slice(0, -2))) return "folha";
    return null;
  }

  function depAtual(m, id) {
    var pc = ler(m, "predecessoras"), lc = ler(m, "lags"), tc = ler(m, "tipos"), t = {};
    var preds = own(pc, id) && Array.isArray(pc[id]) ? pc[id].slice() : null;
    var tf = own(tc, id) ? tc[id] : null;
    if (tf && typeof tf === "object") Object.keys(tf).forEach(function (k) { if (String(tf[k]).toUpperCase() === "II") t[k] = "II"; });
    return { preds: preds, lags: ordenar(own(lc, id) ? lc[id] : null), tipos: ordenar(t) };
  }
  function sigDep(d) {
    if (!d) return "";
    return J({ p: d.preds === null || d.preds === undefined ? null : d.preds.slice().sort(), l: ordenar(d.lags), t: ordenar(d.tipos) });
  }

  /* O VALOR ATUAL de um ponto endereçável — é o que entra no retrato (o `de`)
     e o que se compara para dizer "ficou velho". Chaves:
       q:item  {q, p (pendente), m (memória)}   m:item  memória
       si:item subetapa do item ("" = solto)    en:etapa  sn:sub  nomes
       t:campo texto da proposta como o documento o mostra HOJE
       d:id {v (digitada ou null), ag (agente ou null)}  p:id dependência
       mk:id marco (bool)   eq:folha equipes (ou null) */
  function _valor(orc, cron, chave) {
    var i = chave.indexOf(":"), tipo = chave.slice(0, i), id = chave.slice(i + 1), x;
    if (tipo === "q") { x = acharItem(orc, id); return x ? { q: num(x.it.quantidade), p: !!x.it.qtdPendente, m: String(x.it.memoriaCalculo || "") } : undefined; }
    if (tipo === "m") { x = acharItem(orc, id); return x ? String(x.it.memoriaCalculo || "") : undefined; }
    if (tipo === "si") { x = acharItem(orc, id); return x ? subDoItem(x) : undefined; }
    if (tipo === "en") { x = acharEtapa(orc, id); return x ? String(x.etapa.nome || "") : undefined; }
    if (tipo === "sn") { x = acharSub(orc, id); return x ? String(x.sub.nome || "") : undefined; }
    if (tipo === "t") return O().textoComercial(orc, id);
    var nv = nivelDe(orc, id);
    if (!nv) return undefined;
    var c = cron || {}, m = nv === "etapa" ? c : ler(c, "sub");
    if (tipo === "d") {
      var d = ler(m, "duracoes"), ag = ler(m, nv === "etapa" ? "duracoesAgente" : "agente");
      return { v: own(d, id) && num(d[id]) > 0 ? num(d[id]) : null, ag: own(ag, id) && ag[id] ? String(ag[id]) : null };
    }
    if (tipo === "p") return depAtual(m, id);
    if (tipo === "mk") { var mk = ler(m, "marcos"); return own(mk, id) && mk[id] === true; }
    if (tipo === "eq") { var eq = ler(ler(c, "sub"), "equipes"); return own(eq, id) && num(eq[id]) >= 1 ? num(eq[id]) : null; }
    return undefined;
  }

  /* A árvore (Cronograma.eap) sobre uma CÓPIA — `Orcamento.calcular` migra
     `config` do objeto que recebe, e o contexto/validar não escrevem no
     orçamento de ninguém. `comDatas` = com duração de cada nó (estimar). */
  function arvore(o, comDatas) {
    var base = copia(o), calc = null, nos = [], porId = {}, numero = {}, r = null;
    try { calc = O().calcular(base); } catch (e) { calc = null; }
    if (comDatas && C() && C().estimar) {
      try { r = C().estimar(copia(o), null, { eap: true, calc: calc }); nos = arr(r.atividades); } catch (e2) { r = null; nos = []; }
    }
    if (!nos.length && C() && C().eap) { try { nos = C().eap(base, calc) || []; } catch (e3) { nos = []; } }
    nos.forEach(function (n) { if (!own(porId, n.id)) porId[n.id] = n; numero[n.id] = n.numero; });
    arr(o && o.etapas).forEach(function (e, ei) { if (e) numero[e.id] = String(ei + 1); });
    return { nos: nos, porId: porId, num: numero, calc: calc, r: r };
  }
  function nivelNo(info, id) {
    var n = info.porId[id];
    if (!n) return null;
    if (n.tipo === "etapa") return "etapa";
    if (n.tipo === "subetapa" || n.tipo === "soltos") return "folha";
    return null;
  }
  function servicosComBase(info, id) {
    var alvo = info.porId[id], k = 0;
    if (!alvo) return 0;
    info.nos.forEach(function (n) {
      if (n.tipo !== "servico" || n.semBase) return;
      if (alvo.tipo === "etapa" ? n.etapaId === id : n.paiId === id) k++;
    });
    return k;
  }
  function nomeNo(info, id) { var n = info.porId[id]; return n ? String(n.nome || "") : ""; }

  /* ================= ESCREVER (uma op) =================
     O MESMO código escreve no clone do validar, no clone do efeito e no
     orçamento de verdade do aplicar — o que o diff mostrou é o que acontece.
     Cada escrita registra o INVERSO antes de mexer (`X.registrar`).

     ⚠ TABELA DE INVERSOS (crítica ia-seguranca, item 6) — o desfazer só age
     onde o valor ATUAL ainda é o que a IA pôs:
       alterar_quantidade → restaurarQuantidade(antes)   se qtd e memória = as da IA
       criar_etapa        → removerEtapa                 se nome igual, sem itens, sem subetapa
       criar_subetapa     → removerSubEtapa              se nome igual e sem itens nela
       renomear_*         → renomear(antes)              se o nome ainda é o da IA
       mover_item_...     → moverItemParaSub(de) + ordem se o item ainda está na subetapa da IA
       alterar_texto      → comercial[campo] = antes     se o texto ainda é o da IA
       alterar_memoria_*  → definirMemoriaTexto(antes)   se a memória ainda é a da IA
       definir_duracao    → duração/agente/motivo antes  se ainda é a da IA com a marca "ia"
       definir_dependencia→ preds/lags/tipos/prov antes  se a assinatura ainda é a da IA
       marcar_marco       → marca antes                  se ainda é marco
       definir_equipes    → equipes/prov antes           se ainda são as da IA
     O que não volta é LISTADO com o motivo — nunca revertido por cima de quem
     mexeu depois. */
  function falha(m) { return { ok: false, erro: m }; }
  function resolver(X, id) { return isRef(id) ? (own(X.refs, id) ? X.refs[id] : null) : id; }
  function isRef(id) { return /^novo:\d{1,3}$/.test(String(id == null ? "" : id)); }

  function contarCiclos(orc, cron) {
    var out = { etapas: 0, folhas: {} };
    try {
      var v = copia(vista(orc, cron)), calc = null;
      try { calc = O().calcular(copia(v)); } catch (e0) { calc = null; }
      var r = C().estimar(v, null, { eap: true, calc: calc });
      arr(r.etapas).forEach(function (e) { if (e.cicloDep) out.etapas++; });
      arr(r.exec && r.exec.avisos).forEach(function (a) { if (a && a.tipo === "ciclo") out.folhas[a.etapaId] = arr(a.folhas).length; });
    } catch (e) { out.erro = String((e && e.message) || e); }
    return out;
  }

  function _executar(orc, cron, op, X) {
    var Orc = O(), loc, ls, id, nv, m2, rede = execRede(cron);
    function reg(inv) { if (X.registrar) X.registrar(inv); }
    switch (op.op) {
      case "alterar_quantidade":
        loc = acharItem(orc, op.itemId);
        if (!loc) return falha("o serviço não existe mais no orçamento");
        var rc = Orc.calcularMemoria(op.forma, op.dados);
        if (!rc || !rc.ok) return falha((rc && rc.erro) || "a conta não fechou");
        if (!(rc.qtd > 0)) return falha("a conta deu zero — quantidade zero não entra");
        if (loc.it.unidade && rc.unidade && !Orc.unidadeCompativel(loc.it.unidade, rc.unidade)) {
          return falha("a conta dá " + un(rc.unidade) + " e o serviço é em " + un(loc.it.unidade) + " — unidade incompatível");
        }
        reg({ t: "qtd", etapaId: loc.etapa.id, itemId: loc.it.id,
          antes: { q: num(loc.it.quantidade), p: !!loc.it.qtdPendente, m: own(loc.it, "memoriaCalculo") ? String(loc.it.memoriaCalculo) : null },
          para: { q: rc.qtd, m: String(rc.texto || "") } });
        var ap = Orc.aplicarMemoriaQuantidade(orc, loc.etapa.id, loc.it.id, rc);
        return ap && ap.ok ? { ok: true } : falha((ap && ap.erro) || "não consegui subir a quantidade");

      case "criar_etapa":
        /* ⚠ OS CÓDIGOS DE ANTES (revisão 4A): addEtapa renumera todas as
           etapas para 1.0, 2.0… e o desfazer dizia "tudo revertido" com o
           código importado ("01", "09") trocado no sintético da proposta. Só a
           PRIMEIRA etapa criada guarda (é a última a ser desfeita), e só se os
           códigos não são já a sequência que o removerEtapa refaz sozinho. */
        var cods = null;
        if (!X.codigosFeitos) {
          X.codigosFeitos = true;
          var lcods = arr(orc.etapas).map(function (e) { return { id: e.id, codigo: e.codigo }; });
          if (!lcods.every(function (x, i) { return String(x.codigo) === String(i + 1) + ".0"; })) cods = lcods;
        }
        Orc.addEtapa(orc, op.nome);
        var nova = orc.etapas[orc.etapas.length - 1];
        X.refs[op.ref] = nova.id;
        /* criação: o "antes" é não existir — o registro vem logo depois do
           mutador porque o id só existe depois dele (nada roda entre os dois) */
        var invE = { t: "criarEtapa", etapaId: nova.id, nome: nova.nome };
        if (cods) invE.codigos = cods;
        reg(invE);
        return { ok: true, id: nova.id };

      case "criar_subetapa":
        id = resolver(X, op.etapaId);
        if (!id || !acharEtapa(orc, id)) return falha("a etapa da subetapa não existe");
        var s = Orc.addSubEtapa(orc, id, op.nome, false);   // ⚠ false: não arrasta os serviços soltos
        if (!s) return falha("não consegui criar a subetapa");
        X.refs[op.ref] = s.id;
        reg({ t: "criarSub", etapaId: id, subId: s.id, nome: s.nome });
        return { ok: true, id: s.id };

      case "renomear_etapa":
        loc = acharEtapa(orc, op.etapaId);
        if (!loc) return falha("a etapa não existe mais");
        reg({ t: "nomeEtapa", etapaId: op.etapaId, antes: String(loc.etapa.nome || ""), para: op.para });
        Orc.renomearEtapa(orc, op.etapaId, op.para);
        return loc.etapa.nome === op.para ? { ok: true } : falha("não consegui renomear a etapa");

      case "renomear_subetapa":
        ls = acharSub(orc, op.subEtapaId);
        if (!ls) return falha("a subetapa não existe mais");
        reg({ t: "nomeSub", etapaId: ls.etapa.id, subId: op.subEtapaId, antes: String(ls.sub.nome || ""), para: op.para });
        Orc.renomearSubEtapa(orc, ls.etapa.id, op.subEtapaId, op.para);
        return ls.sub.nome === op.para ? { ok: true } : falha("não consegui renomear a subetapa");

      case "mover_item_para_subetapa":
        loc = acharItem(orc, op.itemId);
        if (!loc) return falha("o serviço não existe mais no orçamento");
        id = resolver(X, op.subEtapaId);
        ls = id ? acharSub(orc, id) : null;
        if (!ls) return falha("a subetapa de destino não existe");
        if (ls.etapa.id !== loc.etapa.id) return falha("só dentro da mesma etapa — a subetapa é de outra etapa");
        /* a ORDEM da etapa antes do primeiro mover: é o que devolve cada
           serviço à posição dele no desfazer (a _meta do Excel casa por ordem) */
        if (!own(X.ordemFeita, loc.etapa.id)) {
          X.ordemFeita[loc.etapa.id] = true;
          var subs = {};
          arr(loc.etapa.itens).forEach(function (it) { if (it.subEtapaId) subs[it.id] = String(it.subEtapaId); });
          reg({ t: "ordem", etapaId: loc.etapa.id, ids: arr(loc.etapa.itens).map(function (it) { return it.id; }), subs: subs });
        }
        reg({ t: "mover", etapaId: loc.etapa.id, itemId: loc.it.id, de: subDoItem(loc), para: id });
        Orc.moverItemParaSub(orc, loc.etapa.id, loc.it.id, id);
        return String(loc.it.subEtapaId || "") === id ? { ok: true } : falha("não consegui mover o serviço");

      case "definir_duracao":
        id = op.alvoId; nv = nivelDe(orc, id);
        if (!nv) return falha("a etapa/subetapa não existe mais");
        if (nv === "folha" && !rede) return falha("subetapa só tem duração própria no cronograma executivo");
        m2 = nv === "etapa" ? cron : mapa(cron, "sub");
        var d = mapa(m2, "duracoes"), ag = mapa(m2, nv === "etapa" ? "duracoesAgente" : "agente"), mot = mapa(m2, "iaMotivos");
        reg({ t: "dur", nivel: nv, id: id, antes: { v: foto(d, id), ag: foto(ag, id), m: foto(mot, id) }, para: op.dias });
        d[id] = op.dias; ag[id] = "ia";
        if (op.motivo) mot[id] = op.motivo; else delete mot[id];
        return { ok: true };

      case "definir_dependencia":
        id = op.alvoId; nv = nivelDe(orc, id);
        if (!nv) return falha("a etapa/subetapa não existe mais");
        if (nv === "folha" && !rede) return falha("dependência entre subetapas só vale no cronograma executivo");
        m2 = nv === "etapa" ? cron : mapa(cron, "sub");
        var pc = mapa(m2, "predecessoras"), lc = mapa(m2, "lags"), pv = mapa(m2, "iaProv");
        var tc = nv === "folha" ? mapa(m2, "tipos") : null;
        /* ciclo pelo MOTOR: conta quem sai com `cicloDep` antes e depois. Um
           ciclo que já existia não derruba a op; um NOVO derruba. */
        if (!X.cic) X.cic = contarCiclos(orc, cron);
        var antesC = X.cic, etId = nv === "etapa" ? id : (acharSub(orc, id) ? acharSub(orc, id).etapa.id : id.slice(0, -2));
        var inv = { t: "dep", nivel: nv, id: id, antes: { p: foto(pc, id), l: foto(lc, id), t: tc ? foto(tc, id) : {}, prov: foto(pv, "p:" + id) },
          para: sigDep({ preds: op.preds, lags: op.lags, tipos: op.tipos }) };
        reg(inv);
        pc[id] = op.preds.slice();
        if (Object.keys(op.lags || {}).length) lc[id] = copia(op.lags); else delete lc[id];
        if (tc) { if (Object.keys(op.tipos || {}).length) tc[id] = copia(op.tipos); else delete tc[id]; }
        pv["p:" + id] = { v: inv.para, m: op.motivo || "" };
        var depois = contarCiclos(orc, cron);
        var novoCiclo = nv === "etapa" ? depois.etapas > antesC.etapas : (depois.folhas[etId] || 0) > (antesC.folhas[etId] || 0);
        if (novoCiclo) {
          volta(pc, id, inv.antes.p); volta(lc, id, inv.antes.l); if (tc) volta(tc, id, inv.antes.t); volta(pv, "p:" + id, inv.antes.prov);
          return falha("cria dependência circular — o cronograma desenharia ignorando um elo");
        }
        X.cic = depois;
        return { ok: true };

      case "marcar_marco":
        id = op.alvoId; nv = nivelDe(orc, id);
        if (!nv) return falha("a etapa/subetapa não existe mais");
        if (nv === "folha" && !rede) return falha("marco de subetapa só vale no cronograma executivo");
        m2 = nv === "etapa" ? cron : mapa(cron, "sub");
        var mk = mapa(m2, "marcos");
        reg({ t: "marco", nivel: nv, id: id, antes: foto(mk, id) });
        mk[id] = true;
        return { ok: true };

      case "definir_equipes":
        id = op.folhaId;
        if (nivelDe(orc, id) !== "folha") return falha("equipes são por subetapa");
        if (!rede) return falha("equipes por subetapa só valem no cronograma executivo");
        var sb = mapa(cron, "sub"), eq = mapa(sb, "equipes"), pv2 = mapa(sb, "iaProv");
        reg({ t: "eq", id: id, antes: { v: foto(eq, id), prov: foto(pv2, "eq:" + id) }, para: op.n });
        eq[id] = op.n; pv2["eq:" + id] = { v: op.n, m: op.motivo || "" };
        return { ok: true };

      case "alterar_texto":
        var c = Orc.garantirComercial(orc);
        reg({ t: "texto", campo: op.campo, antes: foto(c, op.campo), para: op.para });
        c[op.campo] = op.para;
        return { ok: true };

      case "alterar_memoria_calculo":
        loc = acharItem(orc, op.itemId);
        if (!loc) return falha("o serviço não existe mais no orçamento");
        if (!String(loc.it.memoriaCalculo || "").trim()) return falha("o serviço não tem memória de cálculo");
        reg({ t: "mem", etapaId: loc.etapa.id, itemId: loc.it.id, antes: foto(loc.it, "memoriaCalculo"), para: op.para });
        var dm = Orc.definirMemoriaTexto(orc, loc.etapa.id, loc.it.id, op.para);
        return dm && dm.ok ? { ok: true } : falha("não consegui gravar a memória");
    }
    return falha("operação desconhecida");
  }

  /* ================= VALIDAR (uma op) ================= */
  var ROTULO_ALVO = { planilha: "a planilha", cronograma: "o cronograma", documentos: "os textos da proposta" };
  var ROTULO_FONTE = { usuario: "você", ia: "IA", exec: "produtividade SINAPI", subetapas: "subetapas", estimado: "estimado", marco: "marco", semBase: "sem serviço" };

  function textoDep(d, info, nv) {
    if (!d || d.preds === null || d.preds === undefined) return "a anterior (padrão)";
    if (!d.preds.length) return "nenhuma (começa no início " + (nv === "folha" ? "da etapa" : "da obra") + ")";
    return d.preds.map(function (p) {
      var t = info.num[p] || cortar(nomeNo(info, p), 20) || "?";
      if (d.tipos && d.tipos[p] === "II") t += "II";
      if (d.lags && own(d.lags, p)) { var l = num(d.lags[p]); t += (l >= 0 ? "+" : "") + l; }
      return t;
    }).join(", ");
  }

  function _validarUma(work, op, idx, X) {
    var S = X.S, info = X.info, pedido = X.pedido;
    function recusa(m) { return { recusa: m }; }
    if (!op || typeof op !== "object" || Array.isArray(op)) return recusa("mudança em formato inválido");
    var nome = String(op.op == null ? "" : op.op);
    if (own(FORA, nome)) return recusa(FORA[nome]);
    var cat = own(CAT, nome) ? CAT[nome] : null;
    if (!cat) return recusa("operação fora do catálogo desta entrega (" + cortar(nome, 40) + ")");
    if (cat.grupo !== S.alvo) return recusa("fora do que foi pedido — o pedido era sobre " + (ROTULO_ALVO[S.alvo] || S.alvo));
    if (nome === "alterar_memoria_calculo" && !S.memoria) return recusa("a memória de cálculo não foi enviada neste pedido");
    var kp = chaveProibida(op, 0);
    if (kp) return recusa("a mudança traz o campo \"" + cortar(kp, 40) + "\" — a IA não mexe em preço, custo, código, BDI, quantidade digitada nem dados do cliente; recusada inteira");
    var motivo = motivoLimpo(op.motivo);
    var A = { idx: idx, op: null, rotulo: "", grupo: cat.grupo, chave: null, de: null, para: null, deTexto: "", paraTexto: "",
      marcadaPorPadrao: true, motivo: motivo, dependeDe: [] };
    var declara = null;
    /* presença no retrato (o `de` e a prova de que a IA RECEBEU aquilo),
       duas ops no mesmo ponto, e "ficou velho" contra o orçamento ORIGINAL */
    function conferir(chave) {
      if (!own(S.v, chave)) return "fora do contexto enviado à IA — ela citou algo que não recebeu";
      if (own(X.usadas, chave)) return "a resposta mexe duas vezes no mesmo ponto — ficou só a primeira";
      if (J(_valor(X.orc, X.cron0, chave)) !== J(S.v[chave])) return "mudou depois do pedido (alguém editou enquanto a IA respondia) — peça de novo";
      return "";
    }
    var id, loc, ls, c, de, para, nv, no, rede = execRede(X.cron0), ref, e1;
    switch (nome) {
      case "alterar_quantidade":
        id = str(op.itemId);
        if (!own(S.ids.itens, id)) return recusa("serviço fora do contexto enviado à IA");
        loc = acharItem(work, id);
        if (!loc) return recusa("o serviço não existe mais no orçamento");
        var FM = O().FORMAS_MEMORIA || {}, forma = str(op.forma);
        if (!own(FM, forma)) return recusa("forma de cálculo fora da lista (" + cortar(forma, 30) + ")");
        if (!op.dados || typeof op.dados !== "object" || Array.isArray(op.dados)) return recusa("veio sem as medidas (dados)");
        var campos = arr(FM[forma].campos).map(function (x) { return x.id; }), dados = {}, ign = [];
        for (var k in op.dados) {
          if (!own(op.dados, k)) continue;
          if (campos.indexOf(k) < 0) { ign.push(k); continue; }
          var v = numLiteral(op.dados[k]);
          if (v === null) return recusa("a medida \"" + cortar(k, 30) + "\" não veio como número literal — conta ou texto não entram");
          if (v < 0) return recusa("a medida \"" + cortar(k, 30) + "\" veio negativa");
          /* ⚠ teto por medida ANTES da conta: 1e200 × 1e200 dava Infinity, que
             passava em "> 0" e era gravado como quantidade 0 (revisão 4A) */
          if (!(v <= TETOS.medidaMax)) return recusa("a medida \"" + cortar(k, 30) + "\" veio grande demais (" + String(v) + "; o teto é " + fmtN(TETOS.medidaMax, 0) + ") — confira");
          dados[k] = v;
        }
        var semOrigem = medidasSemOrigem(dados, FM[forma], [pedido]);
        if (semOrigem.length) return recusa("número novo que você não escreveu (" + semOrigem.slice(0, 3).join("; ") + ") — cada medida tem de estar escrita no seu pedido, e um número escrito vale para UMA medida");
        c = conferir("q:" + id); if (c) return recusa(c);
        var rc = O().calcularMemoria(forma, dados);
        if (!rc || !rc.ok) return recusa((rc && rc.erro) || "a conta não fechou");
        if (!isFinite(rc.qtd)) return recusa("a conta saiu da escala — confira as medidas");
        de = S.v["q:" + id];
        if (!de.p && num(de.q) === rc.qtd && de.m === String(rc.texto || "")) return recusa("já está assim — nada a mudar");
        /* ⚠ teto ABSOLUTO antes do efeito: o efeito roda o Cronograma.estimar
           com a quantidade nova, e ele é síncrono — 1e8 m² levou 10 s e 1e18
           não terminou em 5 min (a aba congela no diff). Quantidade desse porte
           se digita à mão; a IA pode baixar uma que já é grande. */
        if (rc.qtd > TETOS.quantidadeMax && rc.qtd > num(de.q)) {
          return recusa("a conta dá " + fmtN(rc.qtd) + " " + un(loc.it.unidade) + " — acima de " + fmtN(TETOS.quantidadeMax, 0) + " a IA não sobe quantidade; se for isso mesmo, digite à mão, conferido");
        }
        A.op = { op: nome, itemId: id, forma: forma, dados: dados, motivo: motivo };
        A.chave = "q:" + id; A.de = de; A.para = { q: rc.qtd, m: String(rc.texto || "") };
        A.rotulo = "Quantidade · " + (info.num[id] || "") + " " + cortar(loc.it.descricao, 60);
        A.deTexto = de.p ? "pendente (sem quantidade)" : fmtN(de.q) + " " + un(loc.it.unidade);
        A.paraTexto = fmtN(rc.qtd) + " " + un(loc.it.unidade) + " — " + FM[forma].rotulo;
        A.memoria = String(rc.texto || "");
        if (ign.length) A.nota = "medida(s) que não são desta forma foram ignoradas: " + ign.slice(0, 5).join(", ");
        /* ⚠ MUDANÇA GRANDE VEM DESMARCADA (revisão 4A): quantidade vira
           dinheiro na proposta e na medição. Serviço que estava pendente (a
           primeira quantidade dele) e mudança maior que fatorQuantidade vezes a
           atual, para mais ou para menos, a pessoa marca olhando as medidas. */
        var qA = num(de.q);
        if (de.p || !(qA > 0)) {
          A.marcadaPorPadrao = false;
          A.motivoDesmarcada = "o serviço estava sem quantidade — confira as medidas antes de marcar";
        } else if (rc.qtd > qA * TETOS.fatorQuantidade || rc.qtd * TETOS.fatorQuantidade < qA) {
          var sobe = rc.qtd >= qA;
          A.marcadaPorPadrao = false;
          A.motivoDesmarcada = "a IA muda a quantidade de " + fmtN(qA) + " para " + fmtN(rc.qtd) + " " + un(loc.it.unidade) +
            " (" + (sobe ? "×" : "÷") + fmtN(sobe ? rc.qtd / qA : qA / rc.qtd, 1) + ") — confira as medidas antes de marcar";
        }
        break;

      case "criar_etapa":
      case "criar_subetapa":
        ref = str(op.ref);
        if (!isRef(ref)) return recusa("ref inválido — use \"novo:1\", \"novo:2\"…");
        if (own(X.refMeta, ref)) return recusa("o ref " + ref + " foi declarado duas vezes");
        var nm = limparTexto(op.nome, false);
        e1 = validarNome(nm, "", pedido); if (e1) return recusa(e1);
        if (nome === "criar_etapa") {
          A.op = { op: nome, ref: ref, nome: nm, motivo: motivo };
          A.rotulo = "Nova etapa · " + cortar(nm, 60);
          declara = { ref: ref, tipo: "etapa", nome: nm };
        } else {
          var eRef = str(op.etapaId), eW, eRot;
          if (isRef(eRef)) {
            if (!own(X.refMeta, eRef) || X.refMeta[eRef].tipo !== "etapa") return recusa("a etapa " + eRef + " não foi criada ANTES nesta resposta");
            eW = X.refs[eRef]; A.dependeDe.push(X.refMeta[eRef].idx); eRot = "a nova etapa " + cortar(X.refMeta[eRef].nome, 40);
          } else {
            if (!own(S.ids.etapas, eRef)) return recusa("etapa fora do contexto enviado à IA");
            if (!acharEtapa(work, eRef)) return recusa("a etapa não existe mais");
            eW = eRef; eRot = "a etapa " + (info.num[eRef] || "") + " " + cortar(nomeDaEtapa(X.orc, eRef), 40);
          }
          A.op = { op: nome, ref: ref, etapaId: eRef, nome: nm, motivo: motivo };
          A.rotulo = "Nova subetapa em " + eRot + " · " + cortar(nm, 50);
          declara = { ref: ref, tipo: "subetapa", nome: nm, etapaW: eW };
        }
        A.para = nm; A.deTexto = "—"; A.paraTexto = nm;
        break;

      case "renomear_etapa":
      case "renomear_subetapa":
        var ehEt = nome === "renomear_etapa";
        id = str(ehEt ? op.etapaId : op.subEtapaId);
        if (isRef(id)) return recusa("renomear vale só para o que já existe");
        if (!own(ehEt ? S.ids.etapas : S.ids.subs, id)) return recusa((ehEt ? "etapa" : "subetapa") + " fora do contexto enviado à IA");
        if (ehEt ? !acharEtapa(work, id) : !acharSub(work, id)) return recusa("a " + (ehEt ? "etapa" : "subetapa") + " não existe mais");
        c = conferir((ehEt ? "en:" : "sn:") + id); if (c) return recusa(c);
        de = S.v[(ehEt ? "en:" : "sn:") + id]; para = limparTexto(op.para, false);
        e1 = validarNome(para, de, pedido); if (e1) return recusa(e1);
        if (para === de) return recusa("já está assim — nada a mudar");
        A.op = ehEt ? { op: nome, etapaId: id, para: para, motivo: motivo } : { op: nome, subEtapaId: id, para: para, motivo: motivo };
        A.chave = (ehEt ? "en:" : "sn:") + id; A.de = de; A.para = para; A.deTexto = de; A.paraTexto = para;
        A.rotulo = (ehEt ? "Nome da etapa " : "Nome da subetapa ") + (info.num[id] || "");
        if (ehEt && X.opts.obraComDiario) A.nota = "o Portal do cliente ainda casa esta etapa pelo nome antigo até a próxima publicação";
        break;

      case "mover_item_para_subetapa":
        id = str(op.itemId);
        if (!own(S.ids.itens, id)) return recusa("serviço fora do contexto enviado à IA");
        loc = acharItem(work, id);
        if (!loc) return recusa("o serviço não existe mais no orçamento");
        var sRef = str(op.subEtapaId), sW, sRot;
        if (isRef(sRef)) {
          if (!own(X.refMeta, sRef) || X.refMeta[sRef].tipo !== "subetapa") return recusa("a subetapa " + sRef + " não foi criada ANTES nesta resposta");
          sW = X.refs[sRef]; A.dependeDe.push(X.refMeta[sRef].idx); sRot = "a nova subetapa " + cortar(X.refMeta[sRef].nome, 40);
        } else {
          if (!own(S.ids.subs, sRef)) return recusa("subetapa fora do contexto enviado à IA");
          sW = sRef; sRot = cortar(nomeDaSub(X.orc, sRef), 40);
        }
        ls = acharSub(work, sW);
        if (!ls) return recusa("a subetapa de destino não existe");
        if (ls.etapa.id !== loc.etapa.id) return recusa("só dentro da mesma etapa — o serviço é da etapa " + (info.num[loc.etapa.id] || "") + " e a subetapa é de outra");
        c = conferir("si:" + id); if (c) return recusa(c);
        de = S.v["si:" + id];
        if (!isRef(sRef) && de === sRef) return recusa("o serviço já está nessa subetapa");
        A.op = { op: nome, itemId: id, subEtapaId: sRef, motivo: motivo };
        A.chave = "si:" + id; A.de = de; A.para = sRef;
        A.rotulo = "Mover " + (info.num[id] || "") + " " + cortar(loc.it.descricao, 50);
        A.deTexto = de ? "em " + cortar(nomeDaSub(X.orc, de), 40) : "solto na etapa";
        A.paraTexto = "para " + sRot;
        break;

      case "definir_duracao":
      case "definir_dependencia":
      case "marcar_marco":
      case "definir_equipes":
        id = str(nome === "definir_equipes" ? op.folhaId : op.alvoId);
        if (!own(S.ids.etapas, id) && !own(S.ids.folhas, id)) return recusa("fora do contexto enviado à IA");
        nv = nivelNo(info, id); no = info.porId[id];
        if (!nv) return recusa("não existe no cronograma (subetapa sem serviços não tem prazo próprio)");
        if (nome === "definir_equipes" && nv !== "folha") return recusa("equipes são por subetapa (a da obra fica nos Parâmetros)");
        if (nv === "folha" && !rede) return recusa("subetapa só se edita no cronograma executivo — ligue \"Detalhar o prazo pelas subetapas\" e peça de novo");
        var rotNo = (info.num[id] || "") + " " + cortar(no.nome, 50);
        if (nome === "definir_duracao") {
          var dias = numLiteral(op.dias);
          if (dias === null) return recusa("dias não veio como número literal");
          if (!inteiroNaFaixa(dias, TETOS.diasMin, TETOS.diasMax)) return recusa("dias fora da faixa (inteiro de " + TETOS.diasMin + " a " + TETOS.diasMax + ")");
          if (nv === "etapa" && rede && no.papel === "resumo") return recusa("no cronograma executivo a duração desta etapa vem das subetapas — peça a mudança nas subetapas");
          if (S.v["mk:" + id] === true) return recusa("é marco (duração zero) — tire a marca antes de dar duração");
          c = conferir("d:" + id); if (c) return recusa(c);
          de = S.v["d:" + id];
          if (de.v === dias && de.ag === "ia") return recusa("já está assim — nada a mudar");
          /* ⚠ A IA NÃO PASSA POR CIMA DE DECISÃO HUMANA: duração sem marca de
             agente é a que a pessoa digitou (a edição manual apaga a marca). */
          if (de.v != null && !de.ag) { A.marcadaPorPadrao = false; A.motivoDesmarcada = "você definiu " + de.v + " dia(s) — a IA não passa por cima sem você marcar"; }
          else if (de.v != null && de.ag === "exec") { A.marcadaPorPadrao = false; A.motivoDesmarcada = "a duração veio da produtividade SINAPI (aba Execução): " + de.v + " dia(s)"; }
          var ef = (nv === "folha" && no.duracaoRede != null) ? no.duracaoRede : no.duracao;
          /* ⚠ PROPOSTA IGUAL À ESTIMATIVA NÃO É MUDANÇA (revisão 4B). Sem duração
             gravada, o prazo desta etapa é ESTIMADO e acompanha as quantidades.
             "Aplicar" 9 d onde a estimativa já dá 9 d não muda o prazo — só grava
             9 FIXO com a marca "ia", e a duração deixa de seguir a planilha sem
             ninguém ver. Vinha MARCADA no diff da rota antiga (a IA velha devolve
             todas as etapas): medido na foto, "Hoje: 9 d (estimado) → Proposto:
             9 d", e depois de aplicar duracoesAgente.etC === "ia". */
          if (de.v == null && ef != null && Number(ef) === dias) return recusa("já está assim — a estimativa já dá " + dias + " dia(s); gravar igual só fixaria a duração, que hoje acompanha as quantidades");
          A.op = { op: nome, alvoId: id, dias: dias, motivo: motivo };
          A.chave = "d:" + id; A.de = de; A.para = dias;
          A.rotulo = "Duração · " + rotNo;
          A.deTexto = de.v != null ? de.v + " d (" + (ROTULO_FONTE[de.ag || "usuario"] || de.ag) + ")" : (ef != null ? ef + " d (estimado)" : "estimado");
          A.paraTexto = dias + " d";
        } else if (nome === "definir_dependencia") {
          if (!Array.isArray(op.preds)) return recusa("preds tem de ser uma lista de ids ([] = sem dependência)");
          if (op.preds.length > TETOS.predsMax) return recusa("dependências demais numa mudança só");
          var preds = [], vistos = {};
          for (var pi = 0; pi < op.preds.length; pi++) {
            var p = str(op.preds[pi]);
            if (own(vistos, p)) continue;
            vistos[p] = true;
            if (p === id) return recusa("dependência de si mesma");
            var np = info.porId[p];
            if (nv === "etapa") {
              if (!own(S.ids.etapas, p) || !np || np.tipo !== "etapa") return recusa("predecessora fora do contexto ou que não é etapa (" + cortar(p, 30) + ")");
            } else if (!own(S.ids.folhas, p) || !np || nivelNo(info, p) !== "folha" || np.etapaId !== no.etapaId) {
              return recusa("subetapa só depende de subetapa da MESMA etapa (" + cortar(p, 30) + ")");
            }
            preds.push(p);
          }
          var lags = {}, tipos = {};
          if (op.lags != null) {
            if (typeof op.lags !== "object" || Array.isArray(op.lags)) return recusa("lags em formato inválido");
            for (var lk in op.lags) {
              if (!own(op.lags, lk)) continue;
              if (preds.indexOf(lk) < 0) return recusa("espera (lag) para quem não é predecessora");
              var lv = numLiteral(op.lags[lk]);
              if (lv === null) return recusa("espera (lag) não veio como número literal");
              if (!inteiroNaFaixa(lv, -TETOS.lagMax, TETOS.lagMax)) return recusa("espera fora da faixa (inteiro de −" + TETOS.lagMax + " a " + TETOS.lagMax + " dias)");
              lags[lk] = lv;
            }
          }
          if (op.tipos != null) {
            if (typeof op.tipos !== "object" || Array.isArray(op.tipos)) return recusa("tipos em formato inválido");
            for (var tk in op.tipos) {
              if (!own(op.tipos, tk)) continue;
              if (preds.indexOf(tk) < 0) return recusa("tipo de elo para quem não é predecessora");
              var tv = String(op.tipos[tk] == null ? "" : op.tipos[tk]).toUpperCase();
              if (tv !== "II" && tv !== "TI") return recusa("tipo de elo desconhecido (só \"TI\" ou \"II\")");
              if (tv === "II") { if (nv === "etapa") return recusa("início-início (II) só entre subetapas"); tipos[tk] = "II"; }
            }
          }
          c = conferir("p:" + id); if (c) return recusa(c);
          de = S.v["p:" + id];
          para = { preds: preds, lags: ordenar(lags), tipos: ordenar(tipos) };
          if (sigDep(de) === sigDep(para)) return recusa("já está assim — nada a mudar");
          if (de.preds !== null) {
            var mProv = nv === "etapa" ? ler(X.cron0, "iaProv") : ler(ler(X.cron0, "sub"), "iaProv");
            var prov = own(mProv, "p:" + id) ? mProv["p:" + id] : null;
            if (!prov || prov.v !== sigDep(de)) { A.marcadaPorPadrao = false; A.motivoDesmarcada = "você definiu o \"Depende de\" (" + textoDep(de, info, nv) + ") — a IA não passa por cima sem você marcar"; }
          }
          A.op = { op: nome, alvoId: id, preds: preds, lags: para.lags, tipos: nv === "folha" ? para.tipos : {}, motivo: motivo };
          A.chave = "p:" + id; A.de = de; A.para = para;
          A.rotulo = "Depende de · " + rotNo;
          A.deTexto = textoDep(de, info, nv); A.paraTexto = textoDep(para, info, nv);
        } else if (nome === "marcar_marco") {
          if (nv === "etapa" && rede && no.papel === "resumo") return recusa("no cronograma executivo a etapa com subetapas não vira marco — a duração dela vem das subetapas");
          c = conferir("mk:" + id); if (c) return recusa(c);
          if (S.v["mk:" + id] === true) return recusa("já é marco");
          var nServ = servicosComBase(info, id);
          if (nServ > 0) { A.marcadaPorPadrao = false; A.motivoDesmarcada = (nv === "etapa" ? "a etapa" : "a subetapa") + " tem " + nServ + " serviço(s) — virar marco zera a duração dela"; }
          A.op = { op: nome, alvoId: id, motivo: motivo };
          A.chave = "mk:" + id; A.de = false; A.para = true;
          A.rotulo = "Marco · " + rotNo; A.deTexto = "não"; A.paraTexto = "sim (duração zero)";
        } else {
          var n = numLiteral(op.n);
          if (n === null) return recusa("equipes não veio como número literal");
          if (!inteiroNaFaixa(n, TETOS.equipesMin, TETOS.equipesMax)) return recusa("equipes fora da faixa (inteiro de " + TETOS.equipesMin + " a " + TETOS.equipesMax + ")");
          c = conferir("eq:" + id); if (c) return recusa(c);
          de = S.v["eq:" + id];
          if (de === n) return recusa("já está assim — nada a mudar");
          if (de != null) {
            var pvE = ler(ler(X.cron0, "sub"), "iaProv"), provE = own(pvE, "eq:" + id) ? pvE["eq:" + id] : null;
            if (!provE || provE.v !== de) { A.marcadaPorPadrao = false; A.motivoDesmarcada = "você definiu " + de + " equipe(s) — a IA não passa por cima sem você marcar"; }
          }
          if (S.v["d:" + id] && S.v["d:" + id].v != null) A.nota = "a duração digitada desta subetapa manda — mudar equipes não muda o prazo dela";
          A.op = { op: nome, folhaId: id, n: n, motivo: motivo };
          A.chave = "eq:" + id; A.de = de; A.para = n;
          A.rotulo = "Equipes · " + rotNo; A.deTexto = de != null ? de + " (você/IA)" : "da obra"; A.paraTexto = String(n);
        }
        break;

      case "alterar_texto":
        var campo = str(op.campo);
        if (own(CAMPOS_TEXTO_FORA, campo)) return recusa(CAMPOS_TEXTO_FORA[campo]);
        if (CAMPOS_TEXTO.indexOf(campo) < 0) return recusa("campo de texto fora da lista (" + cortar(campo, 30) + ")");
        c = conferir("t:" + campo); if (c) return recusa(c);
        para = limparTexto(op.para, true); de = S.v["t:" + campo];
        if (!para) return recusa("texto vazio — para voltar ao padrão, apague o campo à mão");
        if (para.length > TETOS.texto) return recusa("texto longo demais (" + para.length + " caracteres; o teto é " + TETOS.texto + ")");
        var ptT = problemaDeTexto(para, de, pedido);
        if (ptT) return recusa(ptT);
        var nvT = numerosNovos(para, de, pedido);
        if (nvT.length) return recusa("número novo que você não escreveu (" + nvT.slice(0, 4).join(", ") + ") — números, %, R$ e datas só entram se estiverem no texto atual ou no seu pedido");
        if (para === de) return recusa("já está assim — nada a mudar");
        A.op = { op: nome, campo: campo, para: para, motivo: motivo };
        A.chave = "t:" + campo; A.de = de; A.para = para; A.deTexto = de; A.paraTexto = para;
        A.rotulo = "Texto da proposta · " + ROTULO_CAMPO[campo];
        if (/\[preencher:/i.test(para)) A.nota = "tem marcador [preencher: …] — complete antes de enviar a proposta";
        break;

      case "alterar_memoria_calculo":
        id = str(op.itemId);
        if (!own(S.ids.itens, id)) return recusa("serviço fora do contexto enviado à IA");
        loc = acharItem(work, id);
        if (!loc) return recusa("o serviço não existe mais no orçamento");
        c = conferir("m:" + id); if (c) return recusa(c);
        de = S.v["m:" + id];
        /* ⚠ memória nasce da CONTA (forma + medidas, alterar_quantidade), não
           de texto livre: sem memória, não há o que reescrever */
        if (!String(de).trim()) return recusa("o serviço não tem memória de cálculo — a memória nasce da conta (forma e medidas), não de texto livre");
        para = limparTexto(op.para, true);
        if (!para) return recusa("memória vazia");
        if (para.length > TETOS.memoria) return recusa("memória longa demais (" + para.length + " caracteres; o teto é " + TETOS.memoria + ")");
        var ptM = problemaDeTexto(para, de, pedido);
        if (ptM) return recusa(ptM);
        var nvM = numerosNovos(para, de, pedido);
        if (nvM.length) return recusa("número novo que você não escreveu (" + nvM.slice(0, 4).join(", ") + ") — a memória só pode mudar a redação; a conta muda por alterar_quantidade");
        if (para === de) return recusa("já está assim — nada a mudar");
        A.op = { op: nome, itemId: id, para: para, motivo: motivo };
        A.chave = "m:" + id; A.de = de; A.para = para; A.deTexto = de; A.paraTexto = para;
        A.rotulo = "Memória de cálculo · " + (info.num[id] || "") + " " + cortar(loc.it.descricao, 50);
        break;
    }
    /* escreve no CLONE: é aqui que ciclo, destino inexistente e unidade
       reprovam, pelo mesmo código que o aplicar vai rodar */
    var rx;
    try { rx = _executar(work, work.cronograma, A.op, X.exec); } catch (eX) { rx = falha("falhou ao simular: " + String((eX && eX.message) || eX)); }
    if (!rx.ok) return recusa(rx.erro);
    if (A.chave) X.usadas[A.chave] = true;
    if (declara) X.refMeta[declara.ref] = { idx: idx, tipo: declara.tipo, nome: declara.nome };
    return { aceita: A };
  }
  function nomeDaEtapa(orc, id) { var x = acharEtapa(orc, id); return x ? String(x.etapa.nome || "") : ""; }
  function nomeDaSub(orc, id) { var x = acharSub(orc, id); return x ? String(x.sub.nome || "") : ""; }
  function resumoOp(op) {
    if (!op || typeof op !== "object") return { op: "" };
    var o = { op: cortar(op.op, 40) };
    ["itemId", "etapaId", "subEtapaId", "alvoId", "folhaId", "campo", "ref"].forEach(function (k) { if (op[k] != null) o[k] = cortar(op[k], 60); });
    return o;
  }

  /* ================= FECHO DAS DEPENDÊNCIAS (novo:n) =================
     Desmarcar a criação desmarca quem depende dela (a subetapa nova, o
     serviço movido para ela) — senão o filho iria para um pai que não existe. */
  function fechoDesmarcar(aceitas, marcadosIdx) {
    var marc = {}, porIdx = {}, mudou = true, fora = [];
    arr(marcadosIdx).forEach(function (i) { marc[i] = true; });
    arr(aceitas).forEach(function (a) { porIdx[a.idx] = a; });
    while (mudou) {
      mudou = false;
      Object.keys(marc).forEach(function (k) {
        var a = porIdx[k];
        if (!a) { delete marc[k]; mudou = true; return; }
        if (arr(a.dependeDe).some(function (p) { return !marc[p]; })) { delete marc[k]; fora.push(Number(k)); mudou = true; }
      });
    }
    return { marcados: Object.keys(marc).map(Number).sort(function (a, b) { return a - b; }), desmarcadosPorPai: fora };
  }
  function fechoLista(aceitas) {
    var lista = arr(aceitas), f = fechoDesmarcar(lista, lista.map(function (a) { return a.idx; })), ok = {};
    f.marcados.forEach(function (i) { ok[i] = true; });
    return {
      aplicar: lista.filter(function (a) { return ok[a.idx]; }).sort(function (a, b) { return a.idx - b.idx; }),
      removidas: lista.filter(function (a) { return !ok[a.idx]; })
    };
  }

  function refsDaOp(op) {
    var r = [];
    if (op && op.op === "criar_subetapa" && isRef(op.etapaId)) r.push(op.etapaId);
    if (op && op.op === "mover_item_para_subetapa" && isRef(op.subEtapaId)) r.push(op.subEtapaId);
    return r;
  }

  /* aplica a lista em ORDEM (quem cria vem antes de quem usa) */
  function aplicarLista(orc, cron, lista, cfg) {
    var X = { refs: {}, ordemFeita: {}, cic: null, registrar: null, rotulo: "" };
    var n = 0, nao = [];
    X.registrar = function (inv) { if (cfg.ed) { inv.r = X.rotulo; cfg.ed.inversos.push(inv); } };
    lista.forEach(function (a) {
      var op = a.op, rot = cortar(a.rotulo, 90);
      function pula(m) { nao.push({ idx: a.idx, rotulo: rot, motivo: m }); }
      if (!op) return pula("mudança sem conteúdo");
      if (cfg.travado && a.grupo !== "cronograma") return pula("orçamento aprovado — a planilha e os textos só mudam numa revisão");
      if (cfg.travado && a.grupo === "cronograma" && !cfg.cronAlvo) return pula("orçamento aprovado — o cronograma dele só muda no plano da obra ou numa revisão");
      var faltam = refsDaOp(op).filter(function (r) { return !own(X.refs, r); });
      if (faltam.length) return pula("depende de " + faltam.join(", ") + ", que não foi aplicada");
      if (cfg.conferirDe && a.chave) {
        var atual = _valor(orc, cron, a.chave);
        if (J(atual) !== J(a.de)) return pula("mudou depois do pedido (alguém editou enquanto você conferia) — peça de novo");
      }
      X.rotulo = rot;
      var k0 = cfg.ed ? cfg.ed.inversos.length : 0, r;
      try { r = _executar(orc, cron, op, X); } catch (e) { r = falha("falhou: " + String((e && e.message) || e)); }
      if (!r.ok) { if (cfg.ed) cfg.ed.inversos.length = k0; return pula(r.erro); }
      n++;
    });
    return { n: n, naoAplicadas: nao, refs: X.refs };
  }

  function medir(o) {
    var m = { totalProposta: null, totalOpcional: null, totalComOpcionais: null, prazoDiasUteis: null, termino: null };
    try {
      var a = copia(o);
      /* ⚠ OS TRÊS TOTAIS (revisão 4A). O total DA PROPOSTA é o obrigatório,
         mas a etapa opcional sai num bloco de adicionais com subtotal próprio,
         e a proposta CLÁSSICA imprime "VALOR TOTAL DA PROPOSTA" com as
         opcionais (Orcamento.totais().precoVenda). Mudar a grama do
         paisagismo opcional mostrava R$ X → R$ X no diff enquanto a proposta
         clássica subia 42%. A tela mostra os três e destaca o que muda. */
      if (P() && P().blocosParaModelo) {
        var b = P().blocosParaModelo(a);
        m.totalProposta = b.total;
        m.totalOpcional = b.totalOpcional;
        m.totalComOpcionais = b.totalComOpcionais;
      } else {
        var tt = O().totais(a);
        m.totalProposta = tt.precoObrigatorio != null ? tt.precoObrigatorio : tt.precoVenda;
        m.totalOpcional = num(tt.precoOpcional);
        m.totalComOpcionais = tt.precoVenda;
      }
    } catch (e) { m.totalProposta = null; }
    try {
      var r = C().estimar(copia(o));
      m.prazoDiasUteis = r.totalDias;
      m.termino = C()._ch ? C()._ch(r.dataFim) : null;
    } catch (e2) { m.prazoDiasUteis = null; }
    return m;
  }

  /* ================= REVERTER (um inverso) ================= */
  function nao(m) { return { ok: false, motivo: m }; }
  /* ⚠ O QUE A PESSOA PÔS NO CRONOGRAMA DO NÓ QUE A IA CRIOU (revisão 4A). O
     desfazer apagava a etapa nova junto com os 7 dias digitados nela (prazo
     de 15 voltou a 9, e ficou uma duração órfã no mapa) e deixava pendurado
     o "Depende de" de outra etapa apontando para ela — dizendo "tudo
     revertido". A IA não escreve no cronograma de um nó que ela mesma criou
     (novo:n só vale em etapaId/subEtapaId), então qualquer dado ali é de
     gente — fora a conta da Execução ("exec") e o vão das subetapas. */
  function dadoDoCronograma(m, id, nivel) {
    var d = ler(m, "duracoes"), ag = ler(m, nivel === "etapa" ? "duracoesAgente" : "agente"), pc = ler(m, "predecessoras");
    if (own(d, id) && ag[id] !== "exec" && ag[id] !== "subetapas") return "duração";
    if (ler(m, "marcos")[id] === true) return "marco";
    if (own(pc, id) || own(ler(m, "lags"), id) || own(ler(m, "tipos"), id)) return "\"Depende de\"";
    if (nivel === "folha" && own(ler(m, "equipes"), id)) return "equipes";
    for (var k in pc) {
      if (own(pc, k) && Array.isArray(pc[k]) && pc[k].indexOf(id) >= 0) return (nivel === "etapa" ? "etapa" : "subetapa") + " que depende dela";
    }
    return "";
  }
  /* extra = {ordemMudou} (calculado pelo desfazer ANTES de reverter nada) */
  function _reverter(orc, cron, inv, extra) {
    var Orc = O(), loc, ls, m2, x;
    extra = extra || {};
    switch (inv.t) {
      case "qtd":
        loc = acharItem(orc, inv.itemId);
        if (!loc) return nao("o serviço foi removido depois");
        var atualQ = { q: num(loc.it.quantidade), p: !!loc.it.qtdPendente, m: String(loc.it.memoriaCalculo || "") };
        if (atualQ.q === num(inv.antes.q) && atualQ.p === !!inv.antes.p && atualQ.m === String(inv.antes.m || "")) return { ok: true, silencioso: true };
        if (atualQ.q !== num(inv.para.q) || atualQ.m !== String(inv.para.m || "")) return nao("a quantidade foi mudada depois (agora " + fmtN(atualQ.q) + ")");
        x = Orc.restaurarQuantidade(orc, loc.etapa.id, loc.it.id, inv.antes);
        return x && x.ok ? { ok: true } : nao("não consegui voltar a quantidade");
      case "criarEtapa":
        loc = acharEtapa(orc, inv.etapaId);
        if (!loc) return { ok: true, silencioso: true };
        if (String(loc.etapa.nome || "") !== String(inv.nome || "")) return nao("a etapa criada foi renomeada depois");
        if (arr(loc.etapa.itens).length) return nao("a etapa criada tem " + arr(loc.etapa.itens).length + " serviço(s) agora");
        if (arr(loc.etapa.subetapas).length) return nao("a etapa criada tem subetapa(s) agora");
        var humE = dadoDoCronograma(cron, inv.etapaId, "etapa");
        if (humE) return nao("a etapa criada tem " + humE + " no cronograma, definido depois — apague a etapa à mão se quiser");
        Orc.removerEtapa(orc, inv.etapaId);
        if (inv.codigos) {
          var rcod = Orc.restaurarCodigosEtapas(orc, inv.codigos);
          if (!rcod || !rcod.ok) return nao("a etapa criada foi removida, mas os códigos das outras etapas ficaram renumerados (1.0, 2.0…) — a lista de etapas mudou depois");
        }
        return { ok: true };
      case "criarSub":
        ls = acharSub(orc, inv.subId);
        if (!ls) return { ok: true, silencioso: true };
        if (String(ls.sub.nome || "") !== String(inv.nome || "")) return nao("a subetapa criada foi renomeada depois");
        var dentro = arr(ls.etapa.itens).filter(function (it) { return it.subEtapaId === inv.subId; }).length;
        if (dentro) return nao("a subetapa criada tem " + dentro + " serviço(s) agora");
        var humS = dadoDoCronograma(ler(cron, "sub"), inv.subId, "folha");
        if (humS) return nao("a subetapa criada tem " + humS + " no cronograma, definido depois — apague a subetapa à mão se quiser");
        Orc.removerSubEtapa(orc, ls.etapa.id, inv.subId);
        return { ok: true };
      case "nomeEtapa":
      case "nomeSub":
        var ehEt = inv.t === "nomeEtapa";
        if (ehEt) { loc = acharEtapa(orc, inv.etapaId); if (!loc) return nao("a etapa foi removida depois"); x = loc.etapa; }
        else { ls = acharSub(orc, inv.subId); if (!ls) return nao("a subetapa foi removida depois"); x = ls.sub; }
        if (String(x.nome || "") === String(inv.antes)) return { ok: true, silencioso: true };
        if (String(x.nome || "") !== String(inv.para)) return nao("o nome foi mudado depois (agora \"" + cortar(x.nome, 40) + "\")");
        if (ehEt) Orc.renomearEtapa(orc, inv.etapaId, inv.antes); else Orc.renomearSubEtapa(orc, ls.etapa.id, inv.subId, inv.antes);
        return String(x.nome || "") === String(inv.antes) ? { ok: true } : nao("não consegui voltar o nome");
      case "mover":
        loc = acharItem(orc, inv.itemId);
        if (!loc) return nao("o serviço foi removido depois");
        var atualS = subDoItem(loc);
        if (atualS === inv.de) return { ok: true, silencioso: true };
        if (atualS !== inv.para) return nao("o serviço foi movido de novo depois");
        if (inv.de && !acharSub(orc, inv.de)) return nao("a subetapa de origem não existe mais");
        Orc.moverItemParaSub(orc, loc.etapa.id, loc.it.id, inv.de);
        return subDoItem(loc) === inv.de ? { ok: true } : nao("não consegui devolver o serviço");
      case "ordem":
        loc = acharEtapa(orc, inv.etapaId);
        if (!loc) return { ok: true, silencioso: true };
        var its = arr(loc.etapa.itens), iguais = its.length === arr(inv.ids).length;
        if (iguais && its.map(function (it) { return it.id; }).join("|") === arr(inv.ids).join("|")) return { ok: true, silencioso: true };
        /* ⚠ A PESSOA REORDENOU DEPOIS (revisão 4A): a IA moveu i5 para s2, a
           pessoa trocou i2 e i3 de lugar (que a IA nem tocou), e o desfazer
           devolvia a ordem de ANTES da IA por cima — a troca sumia calada, com
           "tudo revertido". O aplicar grava a ordem que a IA DEIXOU (depois);
           se a de agora é outra, o serviço volta para a subetapa de origem
           (os "mover") mas a ordem fica como a pessoa deixou. */
        if (extra.ordemMudou) return nao("a ordem dos serviços da etapa foi mudada depois — ficou como você deixou");
        var subsOk = iguais && its.every(function (it) { return String(it.subEtapaId || "") === String(own(inv.subs, it.id) ? inv.subs[it.id] : ""); });
        if (!subsOk) return nao("a ordem dos serviços da etapa não foi restaurada (a etapa mudou depois)");
        x = Orc.reordenarItens(orc, inv.etapaId, inv.ids);
        if (!x || !x.ok) return nao("a ordem dos serviços da etapa não foi restaurada (" + ((x && x.erro) || "") + ")");
        /* ⚠ etapa que já estava FORA da ordem padrão (serviço solto no meio
           das subetapas, dado antigo): o reordenarItens normaliza e desfaz a
           ordem que acabou de pôr. Diz, em vez de "ok" calado. */
        if (arr(loc.etapa.itens).map(function (it) { return it.id; }).join("|") !== arr(inv.ids).join("|")) {
          return nao("a etapa estava fora da ordem padrão (serviço solto entre as subetapas) — a posição dos serviços não voltou exatamente; confira a ordem");
        }
        return { ok: true, silencioso: true };
      case "texto":
        var c = (orc.comercial && typeof orc.comercial === "object") ? orc.comercial : null;
        var atualT = c && own(c, inv.campo) ? c[inv.campo] : undefined;
        if (own(inv.antes, "v") ? atualT === inv.antes.v : atualT === undefined) return { ok: true, silencioso: true };
        if (String(atualT == null ? "" : atualT) !== String(inv.para)) return nao("o texto foi editado depois");
        volta(c, inv.campo, inv.antes);
        return { ok: true };
      case "mem":
        loc = acharItem(orc, inv.itemId);
        if (!loc) return nao("o serviço foi removido depois");
        var atualM = String(loc.it.memoriaCalculo || "");
        if (atualM === String(own(inv.antes, "v") ? inv.antes.v : "")) return { ok: true, silencioso: true };
        if (atualM !== String(inv.para)) return nao("a memória foi editada depois");
        Orc.definirMemoriaTexto(orc, loc.etapa.id, loc.it.id, own(inv.antes, "v") ? inv.antes.v : "");
        return { ok: true };
      case "dur":
        m2 = inv.nivel === "etapa" ? cron : ler(cron, "sub");
        var d = ler(m2, "duracoes"), ag = ler(m2, inv.nivel === "etapa" ? "duracoesAgente" : "agente");
        if (!(num(d[inv.id]) === num(inv.para) && ag[inv.id] === "ia")) {
          var eraAntes = own(inv.antes.v, "v") ? (own(d, inv.id) && J(d[inv.id]) === J(inv.antes.v.v)) : !own(d, inv.id);
          return eraAntes ? { ok: true, silencioso: true } : nao("a duração foi mudada depois");
        }
        var mw = inv.nivel === "etapa" ? cron : mapa(cron, "sub");
        volta(mapa(mw, "duracoes"), inv.id, inv.antes.v);
        volta(mapa(mw, inv.nivel === "etapa" ? "duracoesAgente" : "agente"), inv.id, inv.antes.ag);
        volta(mapa(mw, "iaMotivos"), inv.id, inv.antes.m);
        return { ok: true };
      case "dep":
        m2 = inv.nivel === "etapa" ? cron : ler(cron, "sub");
        if (sigDep(depAtual(m2, inv.id)) !== inv.para) return nao("o \"Depende de\" foi mudado depois");
        var mwd = inv.nivel === "etapa" ? cron : mapa(cron, "sub");
        volta(mapa(mwd, "predecessoras"), inv.id, inv.antes.p);
        volta(mapa(mwd, "lags"), inv.id, inv.antes.l);
        if (inv.nivel === "folha") volta(mapa(mwd, "tipos"), inv.id, inv.antes.t);
        volta(mapa(mwd, "iaProv"), "p:" + inv.id, inv.antes.prov);
        return { ok: true };
      case "marco":
        m2 = inv.nivel === "etapa" ? cron : ler(cron, "sub");
        var mk = ler(m2, "marcos");
        if (mk[inv.id] !== true) return { ok: true, silencioso: true };
        volta(mapa(inv.nivel === "etapa" ? cron : mapa(cron, "sub"), "marcos"), inv.id, inv.antes);
        return { ok: true };
      case "eq":
        var eq = ler(ler(cron, "sub"), "equipes");
        if (num(eq[inv.id]) !== num(inv.para)) {
          var eraE = own(inv.antes.v, "v") ? (own(eq, inv.id) && J(eq[inv.id]) === J(inv.antes.v.v)) : !own(eq, inv.id);
          return eraE ? { ok: true, silencioso: true } : nao("as equipes foram mudadas depois");
        }
        var sb = mapa(cron, "sub");
        volta(mapa(sb, "equipes"), inv.id, inv.antes.v);
        volta(mapa(sb, "iaProv"), "eq:" + inv.id, inv.antes.prov);
        return { ok: true };
    }
    return nao("mudança que este app não sabe desfazer");
  }
  var GRUPO_INV = { qtd: "planilha", criarEtapa: "planilha", criarSub: "planilha", nomeEtapa: "planilha", nomeSub: "planilha",
    mover: "planilha", ordem: "planilha", texto: "documentos", mem: "documentos",
    dur: "cronograma", dep: "cronograma", marco: "cronograma", eq: "cronograma" };

  function empilharHistorico(destino, entrada) {
    /* ⚠ NÃO É AUDITORIA. Mora dentro do documento do orçamento, e o merge da
       nuvem é por documento inteiro (o atualizadoEm mais novo vence): uma
       edição em outro aparelho some com este histórico junto. Serve para a
       pessoa lembrar o que pediu — não para provar nada a ninguém. */
    destino.iaHistorico = arr(destino.iaHistorico).concat([entrada]).slice(-TETOS.historico);
  }

  /* ================= PRÉ-FILTRO: as etapas que o pedido cita ================= */
  var GENERICAS = {};
  ("servico servicos etapa etapas subetapa subetapas todos todas prazo prazos duracao duracoes quantidade quantidades " +
   "alterar altere mudar mude trocar troque colocar coloque ajustar ajuste semana semanas texto textos proposta " +
   "planilha cronograma depois antes dentro junto sobre entre geral gerais itens renomear renomeie memoria calculo " +
   "execucao executar fazer favor criar crie separar separe dividir divida mover coloca deixar deixe nomes aumentar " +
   "diminuir reduzir incluir inclua cada outra outro outras outros").split(" ").forEach(function (w) { GENERICAS[w] = 1; });
  function raiz(w) { return w.length > 5 && w.charAt(w.length - 1) === "s" ? w.slice(0, -1) : w; }
  function palavras(s) {
    return norm(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 5 && !own(GENERICAS, w); }).map(raiz);
  }
  function _etapasCitadas(orc, pedido) {
    var t = norm(pedido), es = arr(orc && orc.etapas), hit = {};
    function marca(i) { if (i >= 0 && i < es.length) hit[i] = true; }
    t.replace(/\betapas?\s+((?:\d+\s*(?:,|e|a|ate)?\s*)+)/g, function (m, g) {
      g = g.replace(/(\d+)\s*(?:a|ate)\s*(\d+)/g, function (mm, x, y) {
        var a = parseInt(x, 10), b = parseInt(y, 10);
        if (b >= a && b - a <= 200) for (var k = a; k <= b; k++) marca(k - 1);
        return " ";
      });
      g.replace(/\d+/g, function (d) { marca(parseInt(d, 10) - 1); return d; });
      return m;
    });
    t.replace(/(^|[^\d.,])(\d+)\.(\d+|g)(?![\d,])/g, function (m, pre, a) { marca(parseInt(a, 10) - 1); return m; });
    var pw = {};
    palavras(pedido).forEach(function (w) { pw[w] = true; });
    es.forEach(function (e, i) {
      if (hit[i] || !e) return;
      var nm = norm(e.nome);
      if (nm.length >= 4 && t.indexOf(nm) >= 0) { hit[i] = true; return; }
      var textos = [e.nome];
      arr(e.subetapas).forEach(function (s) { if (s) textos.push(s.nome); });
      arr(e.itens).forEach(function (it) { if (it) textos.push(it.descricao); });
      for (var k = 0; k < textos.length; k++) {
        if (palavras(textos[k]).some(function (w) { return own(pw, w); })) { hit[i] = true; return; }
      }
    });
    var ids = [];
    es.forEach(function (e, i) { if (hit[i] && e) ids.push(e.id); });
    return ids.length ? ids : null;
  }

  var IAEdit = {
    TETOS: TETOS,
    CATALOGO: CATALOGO,
    CAMPOS_TEXTO: CAMPOS_TEXTO,
    ROTULO_CAMPO: ROTULO_CAMPO,
    FORA: FORA,
    AVISO_PRIVACIDADE: AVISO_PRIVACIDADE,
    PEDIDO_REFINAR: PEDIDO_REFINAR,

    /* ================= CONTEXTO =================
       alvo ∈ "planilha" | "cronograma" | "documentos" ("memoria" = documentos
       com as memórias de cálculo). opts = {etapaIds?, reqId?, cronAlvo?
       (plano da obra), memoria?}.
       ⚠ NUNCA sai daqui: custo, preço, BDI, código, cliente (nome, doc,
       contato). A IA não pode mexer neles, então não precisa vê-los — e o
       provedor é externo (crítica ia-seguranca, itens 8 e 17). */
    contexto: function (orc, alvo, pedido, opts) {
      opts = opts || {};
      var memoria = !!opts.memoria;
      if (alvo === "memoria") { alvo = "documentos"; memoria = true; }
      if (!own(ROTULO_ALVO, alvo)) return { ok: false, erro: "alvo desconhecido (" + cortar(alvo, 30) + ")" };
      if (!orc || !Array.isArray(orc.etapas)) return { ok: false, erro: "orçamento inválido" };
      var ped = limparTexto(pedido, true);
      if (!ped) return { ok: false, erro: "escreva o que você quer mudar" };
      if (ped.length > TETOS.pedidoCaracteres) return { ok: false, erro: "pedido longo demais (" + ped.length + " caracteres; o teto é " + TETOS.pedidoCaracteres + ") — divida em pedidos menores" };
      var cron = opts.cronAlvo || orc.cronograma || {};
      var base = vista(orc, opts.cronAlvo || null);
      var info = arvore(base, alvo === "cronograma");
      var filtro = null, porque = "todas";
      if (Array.isArray(opts.etapaIds) && opts.etapaIds.length) { filtro = opts.etapaIds.slice(); porque = "escolhidas"; }
      else { filtro = _etapasCitadas(orc, ped); if (filtro) porque = "citadas no pedido"; }
      var dentro = {};
      arr(filtro).forEach(function (id) { dentro[id] = true; });
      function inclui(id) { return !filtro || own(dentro, id); }
      var S = { v: {}, ids: { etapas: {}, subs: {}, itens: {}, folhas: {} }, alvo: alvo, memoria: memoria, pedido: ped,
        orcId: orc.id || null, atualizadoEm: orc.atualizadoEm || null, reqId: opts.reqId || null, cronAlvo: !!opts.cronAlvo };
      function guarda(chave) { S.v[chave] = _valor(orc, cron, chave); }
      var ctx = {}, formas = null;
      /* ⚠ O FORMATO É O DO SERVIDOR (server/ia-editar.js, limparContexto): ele
         reconstrói o contexto por lista BRANCA de nomes — campo com outro
         nome não chega ao modelo, calado. Os nomes abaixo são os dele. */
      if (alvo === "planilha") {
        ctx.etapas = arr(orc.etapas).map(function (e, ei) {
          S.ids.etapas[e.id] = 1; guarda("en:" + e.id);
          var ent = { id: e.id, num: String(ei + 1), nome: cortar(e.nome, TETOS.nome) };
          /* etapa fora do pré-filtro vai só com o cabeçalho: a IA sabe que ela
             existe (pode renomear, não recria), sem gastar contexto com serviço */
          if (!inclui(e.id)) return ent;
          var subs = arr(e.subetapas).filter(function (s) { return s && s.id != null; });
          if (subs.length) ent.subetapas = subs.map(function (s) {
            S.ids.subs[s.id] = 1; guarda("sn:" + s.id);
            return { id: s.id, num: info.num[s.id] || "", nome: cortar(s.nome, TETOS.nome) };
          });
          ent.itens = arr(e.itens).filter(function (it) { return it && it.id != null; }).map(function (it) {
            S.ids.itens[it.id] = 1; guarda("q:" + it.id); guarda("si:" + it.id);
            var o = { id: it.id, num: info.num[it.id] || "", descricao: cortar(it.descricao, TETOS.descricaoContexto), unidade: String(it.unidade || ""), quantidade: num(it.quantidade) };
            var sid = subDoItem({ etapa: e, it: it });
            if (sid) o.subEtapaId = sid;
            return o;
          });
          return ent;
        });
        var FM = O().FORMAS_MEMORIA || {};
        formas = Object.keys(FM).map(function (f) {
          return { forma: f, unidade: FM[f].unidade, campos: arr(FM[f].campos).map(function (x) { return x.padrao != null ? { id: x.id, padrao: x.padrao } : { id: x.id }; }) };
        });
      } else if (alvo === "cronograma") {
        /* a REDE, sem itens: lista plana de nós. Fora do modo executivo as
           subetapas não vão — toda op nelas seria recusada (a coluna delas é só
           leitura), então mandá-las só gastaria contexto e dinheiro. */
        var rede = execRede(cron);
        ctx.rede = [];
        info.nos.forEach(function (n) {
          var ehFolha = n.tipo === "subetapa" || n.tipo === "soltos";
          if (n.tipo !== "etapa" && !(ehFolha && rede && inclui(n.etapaId))) return;
          (ehFolha ? S.ids.folhas : S.ids.etapas)[n.id] = 1;
          (ehFolha ? ["d:", "p:", "mk:", "eq:"] : ["d:", "p:", "mk:"]).forEach(function (k) { guarda(k + n.id); });
          var no = { id: n.id, num: n.numero, nome: cortar(n.nome, TETOS.nome), tipo: ehFolha ? "folha" : "etapa" };
          if (ehFolha) no.etapaId = n.etapaId;
          var dur = ehFolha && n.duracaoRede != null ? n.duracaoRede : n.duracao;
          if (dur != null) no.duracao = dur;
          no.preds = arr(n.preds).slice();
          if (n.marco) no.marco = true;
          var agN = S.v["d:" + n.id] && S.v["d:" + n.id].ag;
          if (agN === "ia" || agN === "exec") no.agente = agN;
          if (ehFolha && n.equipes != null) no.equipes = n.equipes;
          ctx.rede.push(no);
        });
      } else {
        ctx.textos = {};
        CAMPOS_TEXTO.forEach(function (c) {
          /* o servidor corta texto maior que isto: a IA reescreveria um texto
             mutilado e a pessoa aplicaria sem ver o rabo que sumiu */
          if (O().textoComercial(orc, c).length > TETOS.textoContexto) return;
          guarda("t:" + c); ctx.textos[c] = S.v["t:" + c];
        });
        if (memoria) {
          ctx.etapas = [];
          arr(orc.etapas).forEach(function (e, ei) {
            if (!inclui(e.id)) return;
            var its = arr(e.itens).filter(function (it) {
              var mm = String((it && it.memoriaCalculo) || "");
              return it && it.id != null && mm.trim() && mm.length <= TETOS.memoriaContexto;
            });
            if (!its.length) return;
            ctx.etapas.push({ id: e.id, num: String(ei + 1), nome: cortar(e.nome, TETOS.nome), itens: its.map(function (it) {
              S.ids.itens[it.id] = 1; guarda("m:" + it.id);
              return { id: it.id, num: info.num[it.id] || "", descricao: cortar(it.descricao, TETOS.descricaoContexto),
                unidade: String(it.unidade || ""), quantidade: num(it.quantidade), memoria: String(it.memoriaCalculo) };
            }) });
          });
        }
      }
      var catalogo = CATALOGO.filter(function (c) {
        return c.grupo === alvo && (c.op !== "alterar_memoria_calculo" || memoria);
      }).map(function (c) { return { op: c.op, campos: c.campos.slice(), regra: c.regra || "" }; });
      /* o CORPO do POST /ia/editar: catálogo como lista de nomes, formas em lista */
      var corpo = { pedido: ped, alvo: alvo, catalogo: catalogo.map(function (c) { return c.op; }), contexto: ctx };
      if (formas) corpo.formas = formas;
      if (typeof opts.reqId === "string" && /^[\w.:\-]{1,64}$/.test(opts.reqId)) corpo.reqId = opts.reqId;
      var tamanho = J(ctx).length, bytes = bytesUtf8(J(corpo));
      if (tamanho > TETOS.contextoCaracteres || bytes > TETOS.corpoBytes) {
        return { ok: false, erro: "pedido grande demais — escolha as etapas (o contexto tem " + tamanho + " caracteres; o teto é " + TETOS.contextoCaracteres + ")",
          tamanho: tamanho, bytes: bytes, teto: TETOS.contextoCaracteres, filtro: { etapaIds: filtro, porque: porque } };
      }
      return { ok: true, alvo: alvo, corpo: corpo, contexto: ctx, snapshot: S, catalogo: catalogo, formas: formas,
        tamanho: tamanho, bytes: bytes, filtro: { etapaIds: filtro, porque: porque }, aviso: AVISO_PRIVACIDADE };
    },

    /* ================= VALIDAR =================
       ops = a resposta da IA; snapshot = o retrato que o contexto devolveu
       (guardado pelo cliente para aquele reqId); opts = {cronAlvo?,
       obraComDiario?}. Não escreve no orçamento (tudo acontece num clone). */
    validar: function (orc, ops, snapshot, opts) {
      opts = opts || {};
      var res = { aceitas: [], recusadas: [], efeito: null, avisos: [], dependencias: {}, travado: false };
      var lista = Array.isArray(ops) ? ops : [];
      function recusarTodas(m) {
        lista.forEach(function (op, idx) { res.recusadas.push({ idx: idx, op: resumoOp(op), motivo: m }); });
        return res;
      }
      if (!orc || !Array.isArray(orc.etapas)) { res.erro = "orçamento inválido"; return recusarTodas("orçamento inválido"); }
      var S = snapshot;
      if (!S || typeof S !== "object" || !S.v || !S.ids) return recusarTodas("sem o retrato do pedido — a resposta não tem com o que ser comparada; peça de novo");
      if (S.orcId && orc.id && S.orcId !== orc.id) return recusarTodas("a resposta é de outro orçamento");
      if (!!S.cronAlvo !== !!opts.cronAlvo) return recusarTodas("o pedido foi feito sobre " + (S.cronAlvo ? "o plano da obra" : "o orçamento") + " e a resposta chegou para o outro — peça de novo");
      var cron0 = opts.cronAlvo || orc.cronograma || {};
      var work = copia(orc);
      work.cronograma = copia(opts.cronAlvo || orc.cronograma || {});
      var X = { S: S, orc: orc, cron0: cron0, opts: opts, pedido: String(S.pedido || ""), usadas: {}, refs: {}, refMeta: {},
        info: arvore(vista(orc, opts.cronAlvo || null), S.alvo === "cronograma") };
      X.exec = { refs: X.refs, ordemFeita: {}, cic: null, registrar: null };
      lista.forEach(function (op, idx) {
        if (idx >= TETOS.opsPorResposta) { res.recusadas.push({ idx: idx, op: resumoOp(op), motivo: "a resposta passou de " + TETOS.opsPorResposta + " mudanças — peça menos coisa por vez" }); return; }
        var v;
        try { v = _validarUma(work, op, idx, X); } catch (e) { v = { recusa: "não consegui conferir esta mudança (" + String((e && e.message) || e) + ")" }; }
        if (v.recusa) { res.recusadas.push({ idx: idx, op: resumoOp(op), motivo: v.recusa }); return; }
        res.aceitas.push(v.aceita);
        if (v.aceita.dependeDe.length) res.dependencias[idx] = v.aceita.dependeDe.slice();
      });
      res.travado = !!(O().travadoPorAprovacao && O().travadoPorAprovacao(orc));
      if (res.travado && !opts.cronAlvo) res.avisos.push("Orçamento aprovado: nada disto grava nele — use [Criar revisão e aplicar nela].");
      if (opts.cronAlvo) res.avisos.push("As mudanças vão para o PLANO DE EXECUÇÃO da obra — a proposta aprovada não muda.");
      if (res.aceitas.some(function (a) { return a.op.op === "mover_item_para_subetapa"; })) {
        res.avisos.push("Mover serviço para subetapa renumera a planilha (ex.: 2.3 passa a 2.1.1) — confira documentos já enviados com a numeração antiga.");
      }
      res.efeito = this.efeito(orc, res.aceitas.filter(function (a) { return a.marcadaPorPadrao; }), opts);
      return res;
    },

    /* antes → depois do conjunto MARCADO (a tela chama de novo a cada
       checkbox): total da proposta (o obrigatório — o que o cliente lê),
       prazo em dias úteis e término; e o tamanho que o desfazer teria. */
    efeito: function (orc, aceitas, opts) {
      opts = opts || {};
      var antes = medir(vista(orc, opts.cronAlvo || null));
      var dep = copia(orc);
      dep.cronograma = copia(opts.cronAlvo || orc.cronograma || {});
      var F = fechoLista(aceitas), ed = { inversos: [] };
      var r = aplicarLista(dep, dep.cronograma, F.aplicar, { ed: ed, conferirDe: false, travado: false, cronAlvo: !!opts.cronAlvo });
      return { antes: antes, depois: medir(dep), n: r.n, naoAplicadas: r.naoAplicadas, desfazerBytes: J(ed).length + 400,
        tetoDesfazer: TETOS.desfazerBytes };
    },

    /* ================= APLICAR =================
       aceitas = as MARCADAS (objetos devolvidos pelo validar); carimbo =
       {em, por, pedido, alvo}; opts = {cronAlvo? (plano da obra),
       destinoDesfazer? (onde guardar iaEdicao/iaHistorico quando não é o
       orçamento — o registro do plano)}. */
    aplicar: function (orc, aceitas, carimbo, opts) {
      opts = opts || {}; carimbo = carimbo || {};
      var res = { n: 0, naoAplicadas: [], iaEdicao: null, semDesfazer: null, ids: {}, bytes: 0 };
      if (!orc || !Array.isArray(orc.etapas)) { res.erro = "orçamento inválido"; return res; }
      /* ⚠ PLANO DA OBRA SEM O REGISTRO DO PLANO (revisão 4A): o destino do
         desfazer caía no próprio orçamento, e o APROVADO ganhava iaEdicao e
         iaHistorico (com o e-mail de quem pediu) em memória — qualquer um dos
         gravadores fora do persistir levaria isso ao disco e à nuvem. O
         aprovado não é tocado nem em memória. */
      if (opts.cronAlvo && !opts.destinoDesfazer) {
        res.erro = "a edição no plano da obra precisa do registro do plano para guardar o desfazer — nada foi aplicado";
        return res;
      }
      var travado = !!(O().travadoPorAprovacao && O().travadoPorAprovacao(orc));
      var F = fechoLista(aceitas);
      F.removidas.forEach(function (a) { res.naoAplicadas.push({ idx: a.idx, rotulo: cortar(a.rotulo, 90), motivo: "ficou de fora junto com a criação de que depende (desmarcada)" }); });
      /* aprovado e sem o plano: NADA grava — sai antes de pôr o retrato do
         desfazer no orçamento (a trava do aplicarLista abaixo é a 2ª camada) */
      if (travado && !opts.cronAlvo) {
        F.aplicar.forEach(function (a) {
          res.naoAplicadas.push({ idx: a.idx, rotulo: cortar(a.rotulo, 90), motivo: a.grupo === "cronograma" ?
            "orçamento aprovado — o cronograma dele só muda no plano da obra ou numa revisão" : "orçamento aprovado — a planilha e os textos só mudam numa revisão" });
        });
        return res;
      }
      var cron = opts.cronAlvo || null;
      if (!cron) {
        if (F.aplicar.some(function (a) { return a.grupo === "cronograma"; }) && (!orc.cronograma || typeof orc.cronograma !== "object")) orc.cronograma = {};
        cron = orc.cronograma || {};
      }
      var destino = opts.destinoDesfazer || orc, anterior = destino.iaEdicao;
      var ed = { v: 1, em: carimbo.em || agora(), por: cortar(carimbo.por, 120), pedido: cortar(carimbo.pedido, TETOS.pedidoHistorico),
        alvo: String(carimbo.alvo || ""), destino: opts.cronAlvo ? "plano" : "orcamento", inversos: [] };
      /* ⚠ O RETRATO DO DESFAZER ENTRA ANTES DA PRIMEIRA ESCRITA, e cada
         inverso é empilhado antes da escrita que ele desfaz: se algo quebrar no
         meio, o que já foi escrito tem como voltar. */
      destino.iaEdicao = ed;
      var r = aplicarLista(orc, cron, F.aplicar, { ed: ed, conferirDe: true, travado: travado, cronAlvo: !!opts.cronAlvo });
      /* a ORDEM que a IA deixou em cada etapa em que moveu serviço: o desfazer
         compara com a de agora antes de devolver a de antes (ver "ordem") */
      ed.inversos.forEach(function (inv) {
        if (inv.t !== "ordem") return;
        var le = acharEtapa(orc, inv.etapaId);
        inv.depois = le ? arr(le.etapa.itens).map(function (it) { return it.id; }) : null;
      });
      res.n = r.n; res.naoAplicadas = res.naoAplicadas.concat(r.naoAplicadas); res.ids = r.refs;
      res.bytes = J(ed).length;
      if (!r.n) {
        /* nada foi escrito: o desfazer de ANTES (se havia) continua valendo */
        if (anterior) destino.iaEdicao = anterior; else delete destino.iaEdicao;
        return res;
      }
      if (res.bytes > TETOS.desfazerBytes) {
        delete destino.iaEdicao;
        res.semDesfazer = "esta edição passa do teto do desfazer (" + kb(res.bytes) + " KB; o teto é " + kb(TETOS.desfazerBytes) + " KB) — foi aplicada SEM o botão Desfazer.";
      } else res.iaEdicao = ed;
      empilharHistorico(destino, { em: ed.em, por: ed.por, pedido: ed.pedido, alvo: ed.alvo, acao: "aplicar", n: r.n,
        naoAplicadas: res.naoAplicadas.length, desfazer: !res.semDesfazer });
      return res;
    },

    /* ================= DESFAZER (1 nível) =================
       Pelos inversos, do último para o primeiro. O que o usuário mexeu depois
       NÃO é revertido: vai em naoRevertidas com o motivo. Depois de desfazer
       não sobra nada a desfazer (o retrato é apagado). */
    desfazer: function (orc, opts) {
      opts = opts || {};
      var res = { revertidas: 0, naoRevertidas: [] };
      /* ⚠ o mesmo do aplicar: desfazer no plano sem o registro do plano leria
         (e apagaria) o desfazer do orçamento no lugar do dele */
      if (opts.cronAlvo && !opts.destinoDesfazer) { res.erro = "o desfazer do plano da obra precisa do registro do plano — nada foi desfeito"; return res; }
      var destino = opts.destinoDesfazer || orc, ed = destino && destino.iaEdicao;
      if (!ed || !Array.isArray(ed.inversos)) { res.erro = "não há edição da IA para desfazer"; return res; }
      if (ed.destino === "plano" && !opts.cronAlvo) { res.erro = "esta edição foi no plano de execução da obra — abra o cronograma da obra para desfazer"; return res; }
      if (ed.destino !== "plano" && O().travadoPorAprovacao && O().travadoPorAprovacao(orc)) {
        res.erro = "o orçamento foi aprovado depois da edição da IA — o aprovado não se desfaz; crie uma revisão";
        return res;
      }
      var cron = opts.cronAlvo || orc.cronograma || {};
      /* a ordem de cada etapa é comparada com a que a IA deixou ANTES de
         reverter qualquer "mover" (que mexe na ordem) */
      var ordemMudou = {};
      ed.inversos.forEach(function (inv, k) {
        if (inv.t !== "ordem" || !Array.isArray(inv.depois)) return;
        var le = acharEtapa(orc, inv.etapaId);
        if (le && arr(le.etapa.itens).map(function (it) { return it.id; }).join("|") !== inv.depois.join("|")) ordemMudou[k] = true;
      });
      for (var i = ed.inversos.length - 1; i >= 0; i--) {
        var inv = ed.inversos[i], r;
        if (ed.destino === "plano" && GRUPO_INV[inv.t] !== "cronograma") { res.naoRevertidas.push({ rotulo: inv.r || "", motivo: "fora do plano da obra" }); continue; }
        try { r = _reverter(orc, cron, inv, { ordemMudou: !!ordemMudou[i] }); } catch (e) { r = nao("falhou: " + String((e && e.message) || e)); }
        if (r.ok) { if (!r.silencioso) res.revertidas++; }
        else res.naoRevertidas.push({ rotulo: inv.r || "", motivo: r.motivo });
      }
      delete destino.iaEdicao;
      empilharHistorico(destino, { em: agora(), por: cortar(opts.por, 120), pedido: ed.pedido, alvo: ed.alvo, acao: "desfazer",
        n: res.revertidas, naoRevertidas: res.naoRevertidas.length });
      return res;
    },

    /* o persistir que NÃO é da IA chama isto (e a mudança de aprovação e a
       geração de proposta): desfazer que atravessa edição humana, aparelho e
       semanas vira um clique que reverte coisa que ninguém lembra. */
    limparDesfazer: function (orc) {
      if (orc && orc.iaEdicao) { delete orc.iaEdicao; return true; }
      return false;
    },

    fechoDesmarcar: fechoDesmarcar,

    /* ================= A ROTA ANTIGA /ia/cronograma =================
       Resposta {etapas:[{i, dias, motivo}]} casada por ÍNDICE na lista
       capturada NO PEDIDO (pedidoCapturado.etapaIds, na ordem enviada). Vira
       ops definir_duracao para passar pelo MESMO validar e pelo MESMO diff —
       duas portas com validadores diferentes foi o que a crítica apontou.
       `i` fora da faixa ou repetido é descartado (repetido: as duas vezes —
       não há como saber qual das duas é a certa). A faixa de dias, a marca
       do usuário e a etapa com subetapas no modo executivo ficam com o validar. */
    deCronogramaAntigo: function (resposta, pedidoCapturado) {
      var pc = pedidoCapturado || {}, ids = arr(pc.etapaIds), itens = arr(resposta && resposta.etapas);
      var out = { ops: [], descartadas: [], snapshot: pc.snapshot || null };
      if (resposta && resposta.ok === false) { out.erro = String(resposta.error || resposta.erro || "a IA não respondeu"); return out; }
      var cont = {};
      itens.forEach(function (x) { if (x && typeof x.i === "number") cont[x.i] = (cont[x.i] || 0) + 1; });
      itens.forEach(function (x, k) {
        var i = x ? x.i : undefined;
        if (typeof i !== "number" || !isFinite(i) || Math.floor(i) !== i || i < 0 || i >= ids.length) {
          out.descartadas.push({ posicao: k, motivo: "índice fora da lista de etapas enviada" }); return;
        }
        if (cont[i] > 1) { out.descartadas.push({ posicao: k, motivo: "a etapa " + (i + 1) + " veio repetida na resposta — as duas foram descartadas" }); return; }
        out.ops.push({ op: "definir_duracao", alvoId: ids[i], dias: x.dias, motivo: cortar(x.motivo, TETOS.motivo) });
      });
      return out;
    },

    /* expostos para a suíte e para o servidor refazer a mesma régua */
    numerosNovos: numerosNovos,
    chaveProibida: function (op) { return chaveProibida(op, 0); },
    numLiteral: numLiteral,
    _etapasCitadas: _etapasCitadas,
    _valor: _valor
  };

  global.IAEdit = IAEdit;
  if (typeof module !== "undefined" && module.exports) module.exports = IAEdit;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
