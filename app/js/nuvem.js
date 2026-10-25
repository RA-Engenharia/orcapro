/* =====================================================================
 * nuvem.js — Sincronização na nuvem (Firebase Auth e-mail/senha + Firestore).
 * Mantém o localStorage como cache rápido/offline e ESPELHA os dados do
 * usuário na nuvem. Mescla por id (o mais novo vence) — nunca apaga dado.
 * NÃO sincroniza as bases SINAPI/blobs grandes (ficam locais no IndexedDB).
 * Fica desligado enquanto CONFIG.backend.sync !== true.
 * ===================================================================== */
(function (global) {
  "use strict";

  // Entidades pequenas de DADOS DO USUÁRIO que sincronizam:
  var ENTIDADES = [
    "orcamentos", "prefs", "obras", "clientes", "contratos", "medicoes",
    /* o termo aditivo e documento contratual: precisa estar no celular do
       engenheiro e no computador do escritorio como o contrato esta */
    "aditivos",
    "financeiro", "compras", "estoque", "rdo", "colaboradores", "frota",
    "requisicoes", "epi", "faltas", "templates", "documentos", "usuarios",
    // modo nuvem multi-aparelho: a EQUIPE (sub-usuários) e a CONTA (admin mestre)
    // sincronizam pela conta-tenant da licença → cada usuário loga no próprio aparelho.
    "equipe", "conta",
    // peso de bloco do fornecedor do usuário: 1 registro por peça, sem obraId
    // (é catálogo da empresa, não da obra — logo não entra em cascata nenhuma)
    "pesos_bloco",
    // EPI que a empresa cadastrou (não está no catálogo de fábrica): também é
    // catálogo da EMPRESA, sem obraId — e sem estar aqui a exclusão não deixaria
    // lápide, então o item apagado num aparelho ressuscitaria no outro.
    "epi_catalogo",
    // NOTA FISCAL e o que nasce dela. Ficaram de fora desde sempre: a nota
    // importada no computador não aparecia no celular, e o bem comprado
    // tampouco. Com itens e parcelas dentro do registro fiscal, isso deixou
    // de ser detalhe — é o documento que prova a compra.
    "fiscal", "patrimonio", "estoque_mov",
    /* ⚠ O MODELO DE PROPOSTA É DA EMPRESA, e por isso sincroniza: quem
       desenha a proposta é o escritório e quem a gera costuma ser outra
       pessoa, noutro aparelho. Sem estar aqui, o vendedor abriria a lista de
       modelos vazia e cairia no documento genérico sem entender por quê.
       ⚠ E cabe no documento: o registro guarda a REFERÊNCIA da foto (~80
       bytes), nunca os bytes — ver js/proptplui.js. */
    "prop_modelos",
    // medição de produção: nasce do diário no celular do encarregado e é paga
    // no computador do escritório — sem sincronizar, o pagamento não chega lá.
    "producao_med",
    // R$/unidade da produção. Estava dentro de `prefs`, e o merge de prefs é
    // "o local vence campo a campo" — o preço aprovado no escritório nunca
    // chegava ao celular do encarregado, que pagava outro valor sem erro
    // nenhum. Dinheiro tem que passar pelo merge por id, com atualizadoEm.
    "producao_preco",
    /* composições próprias: o ÚNICO dado AUTORAL do cliente que vivia só no
     * aparelho — fora do backup e fora daqui. Um cliente perdeu as dele.
     * Entra como ESPELHO (1 registro por código, id = código normalizado),
     * não como o blob da base: mandar o blob repetiria o mesmo defeito entre
     * aparelhos — o último a gravar apagaria o que o outro criou. Ver
     * js/propriasync.js. */
    "composicoes_proprias",
    // níveis do projeto: TÊM obraId, e por isso entram na cascata da obra
    "bim_niveis",
    /* ⚠ TOUR VIRTUAL 360 — entra porque o fluxo é EXATAMENTE entre aparelhos:
     * quem tira a foto 360 é quem está na obra, com o celular; quem monta o
     * comparativo, mede e publica é o escritório. Sem sincronizar, o recurso
     * não existe na prática.
     *
     * A foto NÃO vem junto: o ponto guarda a referência (~120 bytes) e os
     * bytes vivem no IndexedDB + servidor, pelo trilho do js/fotos.js. Foi
     * base64 dentro do registro que parou a sincronização de um cliente PARA
     * SEMPRE, com o app dizendo "Sincronizado".
     *
     * Ainda assim esta lista É a que mais pode crescer no uso normal: medido,
     * um tour de 15 pontos com 6 comentários cada pesa 31 KB, e o aviso do
     * `salvar` daqui (900 KB) chega por volta do 28º tour — menos de dois anos
     * de visita quinzenal. Por isso `Tour360.peso()` existe e a tela avisa a
     * partir de 400 KB, com o nome da visita mais gorda e o que fazer. */
    "tour360",
    /* ⚠ a federação da obra: de que arquivos ela é feita, com a disciplina, a
     * transparência e a visibilidade que o usuário escolheu para cada um. É
     * trabalho dele, não dado derivado — sem estar aqui não entraria no backup
     * (js/app.js deriva a lista DESTE array) nem deixaria lápide ao excluir, e
     * trocar de máquina apagaria a montagem da obra inteira. É a mesma
     * história das composições próprias, algumas linhas acima.
     * ⚠ O que NÃO sincroniza é a geometria convertida: ela mora no IndexedDB,
     * é derivada do arquivo e pesa centenas de MB. No aparelho novo o registro
     * chega, o cache não, e o produto PEDE o arquivo pelo nome. */
    "bim_modelos",
    /* conjuntos de seleção e busca: é trabalho do coordenador, não dado
     * derivado — "Tubos de água fria do Térreo" leva minutos para montar e é o
     * que o teste de conflito e a tarefa do cronograma passam a apontar. TEM
     * obraId, então entra na cascata da obra. */
    "bim_conjuntos",
    /* pontos de vista: e o que sobrevive de uma reuniao de compatibilizacao.
     * A MINIATURA nao vem junto — ela e blob e mora no IndexedDB; aqui viaja
     * so o endereco dela, e no outro aparelho a vista abre sem a foto em vez
     * de nao abrir. */
    "bim_vistas",
    /* FAMÍLIAS PARAMÉTRICAS da empresa (js/familia.js, js/familiaui.js): é
     * trabalho autoral — a porta com os tipos dela, a bancada com a fórmula do
     * tampo. É da EMPRESA, sem obraId. A família vai como TEXTO (campo `json`)
     * e não como objeto: ela tem listas dentro de listas (tipos, sólidos,
     * contorno) e o Firestore recusa array dentro de array — foi o que deixou
     * bim_vistas sem sincronizar (memória orcapro-nuvem-lista-em-lista). */
    "bim_familias",
    /* o PROJETO ESTRUTURAL lido do PDF (js/estrutpdf.js): locação, armação,
     * cobrimentos e as vistas de cada peça. É o que o mestre de obras abre no
     * celular do canteiro — tem de chegar lá. O PDF em si NÃO viaja (mora no
     * IndexedDB de quem carregou; ~4 MB por projeto): no outro aparelho os
     * números aparecem e a tela pede o arquivo para mostrar os desenhos. */
    "bim_estrut",
    /* a SONDAGEM da obra (boletim SPT, unidades do solo, posição dos furos) e
     * as PRANCHAS do projeto (folhas, carimbo, blocos): o canteiro abre no
     * celular. Os PDFs e os desenhos NÃO viajam — moram no IndexedDB de quem
     * importou o pacote; no outro aparelho a tela diz isso. */
    "bim_sondagens",
    "bim_pranchas",
    /* AS CENAS DO ORÇAPRO CENA (js/bimcenaarm.js, 24/10/2026): a cena de apresentação da obra — hora, estação,
     * materiais editados, câmeras, objetos postos, efeitos. É trabalho do arquiteto, e "salvar a cena NO PROJETO"
     * significa que ela acompanha a obra de um computador para o outro. A cena vai como TEXTO (campo `json`, nunca
     * lista dentro de lista: o Firestore recusa, memória orcapro-nuvem-lista-em-lista), então fica FORA do DOC_V2
     * (como bim_familias): a lista passa de 1 MiB sem problema porque a gravação em partes põe cada REGISTRO inteiro
     * numa parte — por isso o BimCenaArm recusa registro acima de 400 KB. A miniatura da câmera é JPEG pequeno. */
    "bim_cenas",
    /* DOCUMENTOS DA OBRA (js/docobra.js): a FICHA de cada documento — tipo,
     * revisão, SHA-256 do arquivo, quem assinou (lido do próprio PDF) e o
     * histórico — viaja, para o escritório e o canteiro verem o mesmo arquivo
     * técnico. O PDF NÃO viaja: mora no IndexedDB de quem adicionou; no outro
     * aparelho a linha diz "não está neste computador". O histórico tem teto
     * por documento (DocObra.MAX_HIST) por causa do teto de 1 MiB daqui. */
    "obra_docs",
    /* quem assina (certificado ou manuscrita AUTORIZADA, com o registro da
     * autorização): é da EMPRESA, sem obraId. A imagem da manuscrita não viaja. */
    "doc_assinantes",
    /* o PESO ESPECÍFICO que o engenheiro informou para um material que a
     * norma não cobre ("Compensado naval = 6 kN/m³"). É da EMPRESA, não da
     * obra: o mesmo material pesa igual em toda obra — e sem sincronizar, o
     * peso da peça mudaria de um aparelho para o outro, no plano de içamento. */
    "bim_pesos_esp",
    /* o PLANO DE IÇAMENTO da obra (equipamento, posição, içamentos, ficha do
     * operador, documentos conferidos): o encarregado confere no celular do
     * canteiro. Os ANEXOS (laudo, ART, certificados) NÃO viajam — moram no
     * IndexedDB de quem anexou; no outro aparelho a tela diz isso. */
    "bim_icamento",
    /* MATERIAIS DO PROJETO (js/bimmateriaisui.js): os materiais da obra (cor, padrão de corte,
     * aparência de render, código, massa). UM registro PLANO por material, com obraId — nada de
     * lista dentro de lista (BimMateriais.plano confere antes de gravar). */
    "bim_materiais",
    /* compatibilizacao: o TESTE salvo e o RESULTADO com o ciclo de vida.
     * O resultado carrega responsavel, prazo, comentario e historico — e
     * e justamente isso que precisa atravessar aparelhos: o engenheiro
     * marca no computador e o coordenador ve no dele. Sem sincronizar,
     * cada um teria a sua versao de quais conflitos ja foram tratados. */
    "bim_clash_testes",
    "bim_clash_resultados",
    /* o elo entre o item do orcamento e a categoria medida no modelo. E
       cadastro feito a mao — o engenheiro confirma item a item — e sem ele a
       conferencia "o orcado bate com o desenhado?" nasce vazia no aparelho
       novo, com a tela dizendo, tranquila, que nao ha nada ligado. */
    "bim_orc_vinculos",
    /* 4D: as tarefas do cronograma DO ENGENHEIRO (o bim4d.js continua
     * derivando o automatico). Sincroniza porque o apontamento de real vem
     * da obra — medicao, diario — e quem planeja esta no escritorio: sao
     * duas pessoas escrevendo na mesma tarefa, em aparelhos diferentes. */
    "bim_tarefas",
    /* as cores do 4D. Sao da EMPRESA, nao da obra: o relatorio de todas as
     * obras tem de sair com a mesma legenda. */
    "bim_4d_aparencias",
    /* tabela de preços unitários da obra (descrição, unidade, R$/unidade). É o
     * que permite medir obra SEM valor global fechado — obra por administração,
     * série de preços. TEM obraId, então entra na cascata da obra. */
    "atividades",
    /* hora extra de um DIA. Fica de fora da cascata da obra de propósito, pelo
     * mesmo motivo das faltas: é jornada de PESSOA. Apagar uma obra não pode
     * apagar o cartão de ponto de ninguém. */
    "horas_extras",
    /* batida de ponto de um DIA: o horário que a pessoa marcou, transcrito do
     * controle de jornada em papel. Fora da cascata da obra pelo mesmo motivo
     * das faltas e da hora extra — é jornada de PESSOA, e apagar uma obra não
     * pode apagar cartão de ponto de ninguém. Por isso NÃO grava obraId.
     * ⚠ Esta linha não é formalidade. É ela que faz a batida sair do aparelho
     *   onde nasceu: sem ela o dado não sincroniza, NÃO ENTRA NO BACKUP
     *   (App._dumpGestao itera exatamente esta lista) e a exclusão não deixa
     *   lápide — o registro apagado ressuscita no primeiro merge. É o defeito
     *   da v1.1.231 logo abaixo, e aqui o dado é prova trabalhista. */
    "batidas",
    /* ===== v1.1.231 — DOZE ENTIDADES QUE NUNCA SINCRONIZARAM =====
     * Um cliente reportou que fornecedor e cotação cadastrados no computador
     * não apareciam no celular. Ao cruzar TODAS as entidades que o Store grava
     * contra esta lista, não eram duas: eram doze. Elas simplesmente nunca
     * estiveram aqui, então o dado ficava preso no aparelho onde nasceu — sem
     * erro nenhum, que é o que fez isso durar tanto.
     *
     * `erro` (log de falhas) ficou de fora de propósito: é diagnóstico local,
     * não dado do usuário, e sincronizar log só gastaria cota.
     *
     * ⚠ Sobre a cascata da obra, ver `_IMUNES_CASCATA` em js/store.js: folha,
     *   ponto e movimento de frota entraram lá junto com esta mudança. Apagar
     *   uma obra não pode apagar pagamento feito nem cartão de ponto de
     *   ninguém — é o mesmo motivo que já mantinha `faltas` fora da cascata.
     *   ⚠ Esta nota também citava `horas_extras` como protegida, e ela não
     *   estava: `faltas` não grava obraId e por isso o merge nunca a olha;
     *   `horas_extras` grava, e era apagada. Corrigido na v1.2. */
    // cadastros da EMPRESA (sem obraId)
    "fornecedores", "familias", "centrocusto",
    /* ⚠ AS DUAS LISTAS DO AGENTE DE APROPRIAÇÃO (ESPEC-medicao-cc §1.1): a
     * REGRA que manda um lançamento para um centro automaticamente e a
     * DECISÃO que a pessoa tomou sobre um lançamento específico. As duas são
     * trabalho dela, não dado derivado — decidir um a um de novo, no outro
     * aparelho, é refazer o serviço; e a regra que o escritório escreve tem
     * de valer para quem lança no celular da obra, senão os dois aparelhos
     * contam o mesmo gasto em centros diferentes.
     * ⚠ Sem esta linha elas não entrariam no BACKUP (App._dumpGestao deriva a
     *   lista DESTE array) e a exclusão não deixaria lápide: o registro
     *   apagado num aparelho ressuscitaria no primeiro merge — é a mesma
     *   história das doze entidades da v1.1.231, logo acima.
     * Elas TÊM obraId (a regra pode ser "sem obra", que é o centro da
     * empresa), então a cascata da obra as leva: ver `_ENT_DA_OBRA` em
     * js/gestao.js. Nunca em `Store._IMUNES_CASCATA` — as duas regras juntas
     * devolvem o registro órfão no sync seguinte. */
    "cc_regras", "cc_aprop",
    // compras e planejamento (têm obraId → entram na cascata da obra)
    "cotacoes", "lp_tarefas", "tarefas", "bim_edicoes",
    /* ⚠ PLANEJAMENTO DA OBRA (cronograma executivo, js/cronobase.js): as
     * linhas de base congeladas e o plano de execução. Mesmo papel de
     * `lp_tarefas` logo acima — TEM obraId, então entra na cascata da obra
     * (Gestao._ENT_DA_OBRA) e NUNCA em Store._IMUNES_CASCATA.
     * ⚠ Sem esta linha a linha de base congelada no escritório não chega ao
     *   celular da obra, não entra no backup (App._dumpGestao deriva a lista
     *   DESTE array) e a exclusão da obra não deixa lápide que a alcance.
     * ⚠ No disco é LISTA, inclusive o plano (registro único por obra, com id
     *   próprio): objeto aqui vira [] no primeiro merge e o sync grava o
     *   vazio por cima — memória da forma no disco, três vezes paga.
     * ⚠ É a lista que MAIS pesa por registro (uma base cheia chega a ~25 KB):
     *   o js/cronobase.js mede em bytes antes de gravar e resume as versões
     *   antigas para a lista nunca passar de 900 KB. */
    "crono_obra",
    /* ⚠ AS LINHAS DE BASE SELADAS (planejador, fatia 1B; espec §1.5): a cópia
     * imutável de cada versão, com as subetapas, a curva e o detalhe por
     * serviço, e os eventos de aprovação. LISTA, `obraId` em todos (cascata
     * e escopo do sub-usuário, `Gestao._ENT_DA_OBRA`/`ENT_POR_OBRA`), nunca
     * imune. O conflito é decidido pelo `CronoSelo.mergeNuvem`, consultado
     * na hora (`_merge`, MERGE_ESPECIAL): sem cópia do perdedor.
     * ⚠ Sem esta linha o selo não chega ao outro aparelho, não entra no
     *   backup e a exclusão da obra não deixa lápide que o alcance — e a
     *   1.2.81, que não a tem, nunca baixa nem apaga o documento. */
    "crono_selo",
    // folha de diaristas e ponto: DINHEIRO e JORNADA DE PESSOA (imunes à cascata)
    "folha", "fs_lancamentos", "fs_pagamentos", "ponto",
    // movimento de frota: a frota já era imune; o movimento dela também é
    "frota_mov",
    /* ===== MÓDULOS SOB DEMANDA (js/perfis.js) =====
     * Só aparecem para o perfil que os nomeia, mas a entidade sincroniza do
     * mesmo jeito: quem tem o módulo tem dois aparelhos como todo mundo, e
     * entidade fora desta lista fica presa onde nasceu — sem erro nenhum.
     *
     * ⚠ `carp_param` e `remun_param` são um registro só, com os NÚMEROS que
     *   fazem o preço e a folha (corte de metragem, percentual do detalhe,
     *   R$ por m²). Eles poderiam ter ido para `prefs`, e é exatamente o que
     *   não podem: o merge de prefs é `Object.assign({}, nuvem, local)`, o
     *   local vence campo a campo, e foi assim que o preço de produção já
     *   voltou sozinho ao valor velho depois do sync. Dinheiro passa pelo
     *   merge por id, com `atualizadoEm` — como `producao_preco` acima. */
    "carp_param", "carp_madeiras", "carp_mo", "carp_propostas", "carp_parceiros",
    /* MÓDULO MARMORARIA (js/marmprecos.js): a TABELA DE PREÇOS do marmorista (um registro por linha, plano — nunca
       lista dentro de lista) e o registro de cada proposta (um por obra: o número não muda ao gerar de novo).
       Pelo mesmo motivo do carp_param: preço não pode morar em prefs (o local vence campo a campo). */
    "marm_precos", "marm_propostas",
    "remun_param", "remun_apur",
    /* padrao de privacidade do Portal do Cliente (o que a obra herda quando
       ainda nao decidiu). Nao e sob demanda — vale para qualquer empresa —
       e tambem nao pode morar em prefs: e decisao de PRIVACIDADE, e o
       merge de prefs deixa o aparelho local vencer campo a campo. */
    "portal_padrao",
    /* COTAÇÃO PRÓPRIA DE INSUMO (v1.2). O SINAPI publica em branco o que não
     * coletou na UF; o usuário cota com o fornecedor dele e informa o preço.
     * Esse número precifica composição própria, alimenta a contagem de
     * "insumo sem preço" da planilha e aparece no detalhamento — é dinheiro
     * de orçamento, e vivia só no aparelho onde nasceu, fora daqui e fora do
     * backup. Mesma história das `composicoes_proprias` logo acima.
     * ⚠ ELA ERA UM MAPA `código → {preco, em}`, E POR ISSO NÃO BASTAVA PÔR O
     *   NOME AQUI: o `_merge` trata tudo que não é prefs/conta como LISTA, e
     *   `Util.arr({})` é `[]` — provado rodando, o primeiro sync deixava o
     *   cliente com 0 cotações e empurrava `[]` para os outros aparelhos.
     *   O disco passou a guardar LISTA (id = código do insumo) e o formato
     *   antigo é convertido NA LEITURA por `Store.lerParaSync` — ver a nota
     *   de FORMAS em js/store.js. */
    "precosinsumos",
    /* o PERFIL DE IMPLANTACAO da empresa. Morava so em prefs, e o merge de
       prefs deixa o local vencer: o celular do dono desfazia no sync o
       enxugamento feito no computador. Ver js/perfis.js. */
    "perfil_impl",
    /* ⚠ O HISTÓRICO DE ALTERAÇÕES DO CRONOGRAMA (planejador, fatia 1C; espec
       O8, §1.6): "quem mudou a montagem de 5 para 9" só se responde juntando
       escritório e obra — histórico só no aparelho seria recado que mente
       (decisão D22). É LISTA de eventos (`m` em objetos: o Firestore recusa
       lista dentro de lista) e o conflito dela é o `CronoAlt.mergeNuvem`
       (união por id, poda por contagem, sem cópia do perdedor), pela tabela
       MERGE_ESPECIAL do `_merge`. Tem `obraId` (menos o evento de
       orçamento), e por isso entra na cascata e no escopo por obra. */
    "crono_alt",
    // v1.1.126 — lápides das exclusões: sem isso o merge (união por id) ressuscitava
    // no aparelho A o registro que o aparelho B tinha acabado de apagar.
    "_lapides"
  ];
  /* ⚠ QUEM PERDE O CONFLITO DEIXA RESUMO, NUNCA A CÓPIA INTEIRA — e a tabela
   * é FIXA aqui, como a lista de entidades acima.
   *
   * O merge genérico guarda `_conflitoDe.copia` com o registro perdedor
   * inteiro (até 50 KB). Isso é aceitável numa entidade cujos registros são
   * pequenos e cujo documento tem folga; é destrutivo nas quatro abaixo, em
   * que a entidade inteira mora num único documento de 1 MiB:
   *
   *   · `crono_obra` — planos e linhas de base de TODAS as obras. Medido:
   *     três conflitos de planos cheios levaram o documento a 1.033.669 B e
   *     seis o passavam de 1 MiB; o Firestore recusa e o planejamento de
   *     todas as obras para de sincronizar (revisão 3 da Fase 3).
   *   · `cc_aprop` — decisão de apropriação. Medido na ESPEC §1.7: pior caso
   *     875 B; com o resumo de conflito 1.045 B; com a CÓPIA do merge
   *     genérico 1.843 B. Com o teto de 2.000 decisões, o pior caso COM
   *     resumo projeta 870 KB (abaixo do aviso de 900 KB); com cópia passa de
   *     1 MiB e a entidade para de sincronizar EM SILÊNCIO.
   *   · `cc_regras` e `centrocusto` — mesmo documento único, mesma conta.
   *
   * O recado ao usuário NÃO diz "não se perdeu nada": aqui se perdeu, e a
   * pessoa precisa conferir. Resumo de até 60 caracteres — o suficiente para
   * reconhecer o que foi, curto o bastante para caber 2.000 vezes. */
  var SEM_COPIA = { crono_obra: 1, centrocusto: 1, cc_regras: 1, cc_aprop: 1 };
  function _resumoPerdedor(ent, p) {
    var r = "";
    if (!p) return "";
    if (ent === "crono_obra") r = String(p.tipo || "") + " da obra " + String(p.obraId || "");
    else if (ent === "cc_aprop") {
      var destino = String(p.cc || "");
      if (!destino && p.pt && p.pt.length) destino = p.pt.length + " partes";
      if (!destino && p.rs) destino = "resto do boletim";
      r = "decisão para " + (destino || "sem destino") + (p.por ? " — " + String(p.por) : "");
    } else if (ent === "cc_regras") {
      var e = p.entao || {};
      var alvo = String(e.cc || "");
      if (!alvo && e.partes && e.partes.length) alvo = e.partes.length + " partes";
      r = "regra para " + (alvo || String(e.t || "sem destino"));
    } else {
      r = (p.codigo ? String(p.codigo) + " " : "") + String(p.nome || p.id || "") +
        (p.ativo === false ? " (desativado)" : "");
    }
    return r.length > 60 ? r.slice(0, 60) : r;
  }

  var SDK = [
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"
  ];

  function carregarScript(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = url; s.async = true; s.onload = res; s.onerror = function () { rej(new Error("falha ao carregar " + url)); };
      document.head.appendChild(s);
    });
  }
  function vazioDe(ent) { return (ent === "prefs" || ent === "conta") ? {} : []; }

  /* ⚠ NÃO LER O DISCO CRU AQUI DENTRO. As três portas que mesclam
   * (sincronizar, escutar e push) faziam `Store.adapter.ler(...)` direto, e
   * isso pressupõe que o que está no disco JÁ tem a forma que o `_merge`
   * espera. `precosinsumos` provou que não: guardada como MAPA, o merge a
   * lia, `Util.arr` a transformava em `[]` e a gravação do merge APAGAVA as
   * cotações do cliente — e mandava o vazio para os outros aparelhos.
   * `Store.lerParaSync` devolve a forma certa, convertendo o formato antigo
   * em memória (ver FORMAS em js/store.js). O `||` cobre um Store antigo
   * carregado sem a função: aí é o comportamento de sempre. */
  function lerEnt(empresaId, ent) {
    return Store.lerParaSync ? Store.lerParaSync(empresaId, ent)
                             : Store.adapter.ler(empresaId, ent, vazioDe(ent));
  }
  /* ⚠ A FORMA GUARDADA NA NUVEM (js/store.js, nota GUARDAR): os pontos de
   * vista do BIM sobem com o prefixo da chave dito uma vez — inteiros, 74
   * vistas de um pacote da obra passavam do teto de 1 MiB do documento e a
   * lista era recusada a cada sync. O que desce é ABERTO antes do merge: o
   * merge e a conferência "nada mudou" do `escutar` comparam registros, e a
   * mesma vista numa forma de cada lado viraria escrita a cada snapshot.
   * Store antigo sem as funções: passa intacto (o comportamento de sempre). */
  /* ===================================================================
   * ⚠ O DOCUMENTO NOVO SEM LISTA DENTRO DE LISTA (`<entidade>~v2`, 20/10/2026)
   *
   * Roteiro do defeito: o Firestore recusa o documento INTEIRO quando há lista dentro de lista ("Nested arrays are not
   * supported", invalid-argument). O modelo BIM (bim_edicoes — todas as obras da empresa) tem os volumes com
   * `receita.contorno = [[x, y], …]`: a vigia de 20/10 viu centenas de `bim_edicoes:invalid-argument` (~2,9 MB) desde a
   * 1.2.162 e o backup do Rogério tinha 610 dessas listas — o modelo não sincronizava entre aparelhos. Pontos de vista
   * (marcações/medidas `pts`), projeto estrutural (`origem.tamanhos`), sondagem (`area`) e pranchas (bloco de tabela
   * `linhas`) têm o mesmo formato (memória orcapro-nuvem-lista-em-lista, 02/10).
   *
   * Por que DOCUMENTO NOVO e não só desaninhar: o aparelho de versão ANTIGA lê o documento de sempre e leria
   * { "__lista": [...] } onde espera lista — volume sem contorno — e ainda regravaria. Então:
   *  · estas entidades leem, escutam e gravam SÓ `<ent>~v2` (e as partes dele, `<ent>~v2~p~<rev>~<i>`), sempre
   *    desaninhadas (Store.desaninhar) — o aparelho antigo não conhece esse nome e não o toca;
   *  · o documento de sempre NUNCA é apagado nem regravado por este aparelho: fica como o antigo o deixa (e hoje ele já
   *    é recusado nessas entidades, então nada piora para quem não atualizou);
   *  · PRIMEIRA VEZ (o `~v2` ainda não existe): o sincronizar lê o documento antigo (só leitura) e faz o merge de sempre
   *    com o local; o resultado vai para o `~v2`. Antigo ilegível por partes faltando → segue só com o local; erro de
   *    rede → não cria o `~v2` (tenta de novo no próximo sincronizar — criar sem ler deixaria de fora o que só o
   *    documento antigo tem);
   *  · o `push` dessas entidades só grava depois de saber que o `~v2` existe (visto na nuvem ou gravado pelo
   *    sincronizar), para nunca criar o `~v2` sem a união com o documento antigo.
   * Lápides (`_lapides`), marcas, conflitos e `_ultimoEnviado` seguem iguais: muda só o nome do documento.
   * ⚠ bim_icamento NÃO entra: ele já sobe desaninhado no documento de sempre desde o 75bb430 (era só prévia).
   *
   * ⚠ E O REGISTRO MAIOR QUE UMA PARTE VAI EM PEDAÇOS DE TEXTO (só no `~v2`). Medido no backup do Rogério de 20/10
   *   (14:38): bim_edicoes com 12 registros (um por obra), o maior com 1.764 KB e o segundo com 1.106 KB de JSON. A
   *   gravação em partes da 1.2.158 põe cada REGISTRO inteiro numa parte (até TETO_PARTE_SOLO, ~1 MiB): um registro
   *   desses recusa a entidade INTEIRA ("exceeds the maximum allowed size even split in parts") — desaninhar sozinho
   *   não faria o modelo sincronizar. Como o `~v2` é formato novo (ninguém mais o lê), o registro acima de
   *   LIMITE_REG_V2 sobe como N itens { __frag: id, i, n, s: <pedaço do JSON dele> }; ao descer, os
   *   pedaços são juntados ANTES do merge (o merge nunca vê pedaço). Faltou pedaço → falha "partes-incompletas" e nada
   *   é aplicado (a mesma regra das partes). O corte nunca separa um par substituto (o Firestore recusa UTF-16 partido).
   * Prova: tools/test-nuvem-v2.js (CN: sem desaninhar, recusado e o B não recebe; sem os pedaços, o registro de
   *   1,8 MB trava a entidade).
   * =================================================================== */
  var DOC_V2 = { bim_edicoes: 1, bim_vistas: 1, bim_estrut: 1, bim_sondagens: 1, bim_pranchas: 1 };
  var SUFIXO_V2 = "~v2";
  var LIMITE_REG_V2 = 600 * 1024;    // registro acima disto (regra de tamanho do Firestore) vai em pedaços de texto
  var PEDACO_V2 = 200000;            // caracteres por pedaço: no pior caso (3 bytes por caractere) 600 KB, abaixo do TETO_PARTE
  /* cada registro sobe DESANINHADO; o que passa de LIMITE_REG_V2 sobe em pedaços do JSON CRU dele (texto não tem a regra
     da lista dentro de lista, e o cru é bem menor: [12.3,4.5] contra {"__lista":[12.3,4.5]}) */
  /* ⚠ AS CONVERSÕES DO `~v2` MORAM AQUI, E NÃO NO store.js (revisão adversarial da N1, 20/10/2026 —
     tools/test-nuvem-v2-rev.js [R5] e [R8]). Dois defeitos do primeiro desenho, que usava Store.desaninhar/reaninhar:
     (1) VERSÕES MISTURADAS: o sw.js busca cada arquivo na rede e, sem rede, do cache — um nuvem.js novo pode rodar com
         o store.js antigo. Sem o Store.reaninhar, o daNuvem gravava no DISCO o contorno como [{ "__lista": [x, y] }, …]
         (o modelo do aparelho estragado) e o push mandava a lista aninhada (recusada).
     (2) NÃO ERA REVERSÍVEL: um dado legítimo com a chave `__lista` ({ __lista: [1, 2] }) descia como [1, 2], e um
         registro com o campo `__frag` (texto) era tomado por pedaço — a entidade inteira parava em "partes-incompletas".
     Agora, só no `~v2` (formato que ainda ninguém leu): objeto que TEM chave reservada (__lista, __frag, __esc) sobe
     embrulhado em { __esc: { ... } } e desce desembrulhado, sem olhar as chaves de dentro como marca; lista dentro de
     lista continua { __lista: [...] }. O bim_icamento (documento de sempre) segue com as funções do store.js. */
  var RESERVADAS_V2 = { __lista: 1, __frag: 1, __esc: 1 };
  function desaninharV2(v, dentroDeLista) {
    if (Array.isArray(v)) { var a = v.map(function (x) { return desaninharV2(x, true); }); return dentroDeLista ? { __lista: a } : a; }
    if (v && typeof v === "object") {
      var o = {}, esc = false;
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) { if (RESERVADAS_V2[k] === 1) esc = true; o[k] = desaninharV2(v[k], false); }
      return esc ? { __esc: o } : o;
    }
    return v;
  }
  function reaninharV2(v) {
    if (Array.isArray(v)) return v.map(reaninharV2);
    if (v && typeof v === "object") {
      var ks = Object.keys(v), o = {};
      if (ks.length === 1 && ks[0] === "__lista" && Array.isArray(v.__lista)) return v.__lista.map(reaninharV2);
      var src = v;
      if (ks.length === 1 && ks[0] === "__esc" && v.__esc && typeof v.__esc === "object" && !Array.isArray(v.__esc)) { src = v.__esc; ks = Object.keys(src); }
      ks.forEach(function (k) { o[k] = reaninharV2(src[k]); });
      return o;
    }
    return v;
  }
  function fragmentarV2(lista) {
    var out = [], N = global.Nuvem;
    lista.forEach(function (r) {
      var d = desaninharV2(r);
      var t = 0; try { t = N ? N._tamanhoFirestore(d) : 0; } catch (e) { t = 0; }
      if (!(t > LIMITE_REG_V2) || !r || typeof r !== "object" || !r.id) { out.push(d); return; }
      var txt = JSON.stringify(r), pedacos = [], i = 0;
      while (i < txt.length) {
        var f = Math.min(txt.length, i + PEDACO_V2);
        if (f < txt.length) { var c = txt.charCodeAt(f - 1); if (c >= 0xd800 && c < 0xdc00) f--; }   // não parte o par substituto
        pedacos.push(txt.slice(i, f)); i = f;
      }
      pedacos.forEach(function (s, k) { out.push({ __frag: String(r.id), i: k, n: pedacos.length, s: s }); });
    });
    return out;
  }
  /* junta os pedaços e devolve a lista JÁ ABERTA: o registro remontado é o JSON CRU (não passa pelo reaninharV2 — um
     `__lista` legítimo dentro dele viraria lista); o resto passa */
  function juntarV2(ent, lista) {
    if (!Array.isArray(lista)) return reaninharV2(lista);
    var out = [], grupos = {}, ordem = [], lugar = {};
    lista.forEach(function (o) {
      if (o && typeof o === "object" && !Array.isArray(o) && typeof o.__frag === "string") {
        if (!grupos[o.__frag]) { grupos[o.__frag] = []; ordem.push(o.__frag); lugar[o.__frag] = out.length; out.push(null); }
        grupos[o.__frag].push(o);
      } else out.push(reaninharV2(o));
    });
    ordem.forEach(function (id) {
      var g = grupos[id].slice().sort(function (a, b) { return a.i - b.i; }), n = +g[0].n || 0;
      var ok = n > 0 && g.length === n && g.every(function (x, j) { return +x.i === j && +x.n === n && typeof x.s === "string"; });
      var r = null;
      if (ok) { try { r = JSON.parse(g.map(function (x) { return x.s; }).join("")); } catch (e) { r = null; } }
      if (!r || typeof r !== "object" || String(r.id) !== id) {
        var err = new Error("o registro \"" + id + "\" da lista \"" + ent + "\" na nuvem está em pedaços e algum não chegou");
        err.code = "partes-incompletas"; throw err;
      }
      out[lugar[id]] = r;
    });
    return out;
  }
  function paraNuvem(ent, v) {
    var g = (Store.compactar ? Store.compactar(ent, v) : v);
    if (!DOC_V2[ent]) return g;
    return Array.isArray(g) ? fragmentarV2(g) : desaninharV2(g);
  }
  function daNuvem(ent, v) {
    if (DOC_V2[ent]) v = juntarV2(ent, v);
    return (Store.expandir ? Store.expandir(ent, v) : v);
  }

  /* ⚠ CONTEÚDO LOCAL ILEGÍVEL NÃO ENTRA NO MERGE NEM SOBE (js/store.js, nota
   * da quarentena). O `lerEnt` de uma entidade corrompida devolve `[]`, e:
   *  - o `push` mandaria esse `[]` para o documento da nuvem, por cima da
   *    lista boa que os outros aparelhos sincronizam;
   *  - o merge gravaria o resultado por cima do original ilegível (o Store
   *    recusa, mas cada snapshot viraria um recado de gravação recusada).
   * A entidade fica PARADA neste aparelho até a pessoa restaurar o backup ou
   * liberar a lista (a porta do Store); depois disso o sync seguinte traz de
   * volta o que a nuvem tem. Chamar DEPOIS do `lerEnt`: é a leitura que
   * renova a marca. Objeto único com cópia guardada (`bloqueia: false`)
   * passa — ali o merge é justamente a recuperação. */
  function ilegivelLocal(empresaId, ent) {
    try {
      var m = (Store.ilegivel && Store.ilegivel(empresaId, ent)) || null;
      return !!(m && m.bloqueia);
    } catch (e) { return false; }
  }
  /* ⚠ DADO QUE AINDA NÃO CARREGOU DO BANCO DO APARELHO NÃO ENTRA NO MERGE
   * NEM SOBE (js/store.js, nota do IndexedDB, regra 1). A leitura de uma
   * entidade trancada devolve `[]`: o merge gravaria por cima (o Store
   * recusa) e o `push` mandaria o vazio para os outros aparelhos. Vale
   * também quando as LÁPIDES ou as MARCAS do sync estão trancadas: sem
   * elas o merge ressuscitaria o que foi apagado e veria conflito em tudo.
   * A entidade volta a sincronizar sozinha quando o banco carregar. */
  function naoCarregadaLocal(empresaId, ent) {
    try {
      if (!Store.naoCarregada) return false;
      return !!(Store.naoCarregada(empresaId, ent) || Store.naoCarregada(empresaId, "_lapides") || Store.naoCarregada(empresaId, "_syncmarcas"));
    } catch (e) { return true; }   // na dúvida, não mexe
  }

  /* ===================================================================
   * A NUVEM NÃO TOCA EM NAMESPACE DE PRÉVIA
   *
   * ⚠ A prévia de versão de cliente (js/previewcli.js) roda trocando o
   *   `empresaId` em memória para um id com prefixo `prev:`. Quem resolve o
   *   tenant é o app.js, e ele captura `Auth.empresaId()` — ou seja, com a
   *   licença ativa da RA, o sync levaria dado de exemplo para a nuvem.
   *
   * ⚠ E o pior nem seria o lixo: `Store.excluir` grava uma LÁPIDE cujo id é
   *   `entidade:<id do registro>`, SEM empresaId dentro, e `_lapides` é uma
   *   das entidades sincronizadas. Uma exclusão feita na prévia empurraria a
   *   lápide para o documento do tenant REAL — e o merge apagaria lá o
   *   registro de mesmo id. Dado de mentira apagando dado de verdade.
   *
   * Por isso a guarda mora AQUI, nas três portas, e não em quem chama: quem
   * chama esquece, e já são três call sites de sincronização em app.js.
   * ⚠ NÃO usar a marca persistente `orcapro:nuvem:desligada` para isto: ela é
   *   a escolha de LGPD do usuário e deixaria a conta real sem sincronizar
   *   depois que a prévia acabasse, sem nada na tela explicando.
   * =================================================================== */
  function _ehPrevia(empresaId) {
    return typeof empresaId === "string" && empresaId.indexOf("prev:") === 0;
  }

  var Nuvem = {
    // exposta p/ o Store saber o que vale a pena lapidar (só o que sincroniza pode ressuscitar)
    ENTIDADES: ENTIDADES,
    /* a forma que SOBE e a que DESCE (só leitura, para medir: tools/medir-nuvem-envio.js) */
    _paraNuvem: function (ent, v) { return paraNuvem(ent, v); },
    _daNuvem: function (ent, v) { return daNuvem(ent, v); },
    ligado: false, uid: null, db: null, auth: null,
    _un: [], _push: {}, _patched: false, _initP: null,
    _escutando: null,   // empresaId que já tem escuta ativa (ver escutar())

    disponivel: function () {
      return !!(typeof CONFIG !== "undefined" && CONFIG.backend && CONFIG.backend.sync && CONFIG.backend.firebaseConfig);
    },

    _carregarSDK: function () {
      if (global.firebase) return Promise.resolve();
      return SDK.reduce(function (p, url) { return p.then(function () { return carregarScript(url); }); }, Promise.resolve());
    },

    init: function () {
      var self = this;
      if (this._initP) return this._initP;
      if (!this.disponivel()) return Promise.reject(new Error("sync desligado"));
      this._initP = this._carregarSDK().then(function () {
        if (!global.firebase.apps.length) global.firebase.initializeApp(CONFIG.backend.firebaseConfig);
        self.auth = global.firebase.auth();
        self.db = global.firebase.firestore();
        self._ouvirSdk();
        /* ⚠ SEM O CACHE DO SDK NO APARELHO (20/10/2026, 1.2.162 — o "Out of Memory" que voltou na 1.2.161).
           O enablePersistence guardava no IndexedDB do navegador toda gravação ainda não confirmada pelo servidor.
           No aparelho do Rogério a fila chegou a 390 MB (344 cópias do bim_edicoes de ~1 MB, de 15 a 20/10): a cada
           ~10 min de app aberto o SDK lia a fila inteira de uma vez (pilha do Crashpad: onsuccess do IndexedDB dentro
           do firebase-firestore-compat.js) e a página passava de 4 GB. Quem guarda o dado no aparelho é o Store; a
           nuvem só precisa subir o estado ATUAL — o _sincronizarAgora de cada abertura compara e sobe o que faltar.
           Por isso: cache só em memória e, antes de qualquer uso, o clearPersistence apaga a fila velha (falha sem
           dano se outra aba antiga ainda a tem aberta — ela some quando todas fecharem e esta abrir de novo).
           Prova: tools/test-nuvem-fila-oom.js. */
        /* ⚠ SÓ LIMPA SE O BANCO VELHO EXISTE, E COM TETO DE TEMPO (revisão adversarial, 20/10/2026). Uma aba antiga
           congelada (abas em suspensão do navegador) pode segurar o banco, e o clearPersistence ficaria esperando para
           sempre: a nuvem não ligaria nesta sessão, sem aviso. Com indexedDB.databases() (quando o navegador tem) o
           aparelho que já limpou nem chama; e em LIMPAR_MS o init segue de qualquer jeito (a fila velha é apagada na
           próxima abertura). */
        return self._limparCacheVelho().then(function () { return true; });
      });
      return this._initP;
    },

    // Loga na nuvem com o MESMO e-mail/senha do app (cria a conta na 1ª vez).
    entrar: function (email, senha) {
      var self = this;
      email = String(email || "").trim().toLowerCase();
      if (!email || !senha) return Promise.reject(new Error("credenciais vazias"));
      return this.init().then(function () {
        return self.auth.signInWithEmailAndPassword(email, senha).catch(function (e) {
          var code = e && e.code;
          // conta ainda não existe na nuvem → cria. O Firebase novo (proteção de enumeração)
          // devolve "invalid-login-credentials"/"invalid-credential" tanto p/ e-mail inexistente
          // quanto p/ senha errada; então tentamos criar e, se o e-mail já existe, era senha errada.
          if (code === "auth/user-not-found" || code === "auth/invalid-login-credentials" || code === "auth/invalid-credential") {
            return self.auth.createUserWithEmailAndPassword(email, senha).catch(function (e2) {
              if (e2 && e2.code === "auth/email-already-in-use") { var er = new Error("Senha da nuvem diferente da do app."); er.code = "auth/wrong-password"; throw er; }
              throw e2;
            });
          }
          throw e;
        });
      }).then(function (cred) {
        self.uid = cred.user.uid; self.ligado = true;
        self._patch();
        return self.uid;
      });
    },

    // Modo nuvem MULTI-APARELHO: deriva uma conta Firebase ESTÁVEL da própria licença.
    // Todo aparelho com a mesma chave entra na MESMA conta-tenant → dados e usuários
    // compartilhados. A licença é a chave de acesso; o gate por pessoa é o login do usuário.
    _credLicenca: function (chave) {
      var c = String(chave || "").trim();
      var H = (typeof Util !== "undefined" && Util.sha256hex) ? Util.sha256hex : function (x) { return String(x); };
      return { email: "lic_" + H(c).slice(0, 32) + "@orcapro.app", senha: "L1" + H("orcapro-tenant::" + c).slice(0, 40) };
    },
    /* ⚠ A SESSÃO ABERTA É DESTA CHAVE?
     *
     * Depois de um bloqueio, o aparelho fica com `ligado=true` e um
     * `currentUser` apontando para o tenant ERRADO. O boot e o botão
     * "Sincronizar agora" tratavam "já conectado" como "nada a fazer" e
     * pulavam a reautenticação — então o cliente seguia a instrução do
     * próprio aviso ("use uma licença própria neste aparelho"), ativava a
     * licença certa, e continuava bloqueado pelo resto da sessão, sem nada
     * na tela dizendo que faltava fechar e reabrir.
     *
     * A conta é derivada da chave, então basta comparar o e-mail derivado
     * com o do usuário logado: se não bate, a sessão é de outra licença. */
    sessaoConfereComChave: function (chave) {
      try {
        if (!this.auth || !this.auth.currentUser) return false;
        if (!chave) return false;
        return String(this.auth.currentUser.email || "").toLowerCase() === String(this._credLicenca(chave).email || "").toLowerCase();
      } catch (e) { return false; }
    },
    /* Larga a sessão da nuvem SEM marcar desligamento pelo usuário, para a
       próxima tentativa reautenticar pela chave nova. Usado quando a licença
       do aparelho muda. */
    trocouDeLicenca: function () {
      this.bloqueioDeDono = null;
      this._ultimoEnviado = {};
      try { this.sair(false); } catch (e) {}
    },
    entrarPorLicenca: function (chave) {
      if (!chave) return Promise.reject(new Error("sem licença"));
      var cr = this._credLicenca(chave);
      return this.entrar(cr.email, cr.senha);
    },

    /* o NOME do documento da entidade na nuvem: `<ent>~v2` para as do DOC_V2 (ver a nota lá), o de sempre para as outras */
    _nomeDoc: function (ent) { return DOC_V2[ent] ? ent + SUFIXO_V2 : ent; },
    _doc: function (ent) { return this.db.collection("empresas").doc(this.uid).collection("dados").doc(this._nomeDoc(ent)); },
    /* o documento de SEMPRE de uma entidade do DOC_V2: só LEITURA, só na primeira vez (ver `_v2ouAntigo`) */
    _docAntigo: function (ent) { return this.db.collection("empresas").doc(this.uid).collection("dados").doc(ent); },
    DOC_V2: DOC_V2,
    /* ⚠ "O `~v2` DESTA CONTA JÁ EXISTE" — só com isto o `push` grava a entidade do DOC_V2 (ver a nota do DOC_V2). Na
       memória quando o sincronizar CHAMA a gravação da migração; no localStorage (por conta) quando a nuvem MOSTROU o
       documento ou CONFIRMOU a gravação — aí uma sessão que abre sem rede continua subindo o que se edita, como as
       outras entidades. Três trechos depois de "orcapro:" de propósito (o RE_CHAVE_ENT do store.js não a lê como
       entidade de empresa). */
    CHAVE_V2: "orcapro:nuvem:v2:ok",
    _v2Mem: {},
    _v2Pronto: function (ent) {
      var k = String(this.uid || "") + "|" + ent;
      if (this._v2Mem[k]) return true;
      try { var o = JSON.parse(global.localStorage.getItem(this.CHAVE_V2) || "null"); if (o && o[k]) { this._v2Mem[k] = 2; return true; } } catch (e) {}
      return false;
    },
    _v2Ok: function (ent, persistir) {
      var k = String(this.uid || "") + "|" + ent;
      if (this._v2Mem[k] === 2 || (!persistir && this._v2Mem[k])) return;
      this._v2Mem[k] = persistir ? 2 : 1;
      if (!persistir) return;
      try {
        var o = JSON.parse(global.localStorage.getItem(this.CHAVE_V2) || "null");
        if (!o || typeof o !== "object") o = {};
        if (!o[k]) { o[k] = 1; global.localStorage.setItem(this.CHAVE_V2, JSON.stringify(o)); }
      } catch (e) {}
    },
    /* ⚠ a gravação do `~v2` deu certo: as falhas ANTERIORES da entidade (o invalid-argument da lista dentro de lista,
       registrado quando o documento era o antigo) deixam de valer — sem isto o `estado().formatoRecusado` acusaria a
       sessão inteira um defeito que já não existe */
    _limparFalhasDe: function (ent, velhas) {
      var f = this._falhas || [];
      for (var i = f.length - 1; i >= 0; i--) if (f[i] && f[i].entidade === ent && (!velhas || velhas.indexOf(f[i]) >= 0)) f.splice(i, 1);
    },
    /* ⚠ A NUVEM TEM CADA REGISTRO DESTA LISTA, NA MESMA VERSÃO, E NADA A MAIS? (revisão da N1 — test-nuvem-v2-rev [R1]).
       Só para o DOC_V2. Dois aparelhos migrando ao mesmo tempo (a atualização chega a todos juntos): o último a gravar o
       `~v2` fica, sem o que só o outro tinha. O outro não perde nada no aparelho (merge é união), mas o "nada mudou" do
       `_ultimoEnviado` (a carga dele é igual à que ele mandou) o impedia de repor — a nuvem ficava sem o registro até ele
       reabrir o app ou editar, e quem instalasse no meio não recebia. Compara por id + atualizadoEm (barato). */
    _nuvemCobre: function (cloud, merged) {
      if (!Array.isArray(cloud) || !Array.isArray(merged) || cloud.length !== merged.length) return false;
      var m = {}, i;
      for (i = 0; i < cloud.length; i++) { var c = cloud[i]; if (!c || !c.id) return false; m[c.id] = String(c.atualizadoEm || ""); }
      for (i = 0; i < merged.length; i++) { var o = merged[i]; if (!o || !o.id || !Object.prototype.hasOwnProperty.call(m, o.id) || m[o.id] !== String(o.atualizadoEm || "")) return false; }
      return true;
    },
    /* PRIMEIRA VEZ (ver a nota do DOC_V2): o `~v2` não existe → o valor da NUVEM, para o merge, é o documento ANTIGO
       (só leitura). `doAntigo: true` avisa o sincronizar que o `~v2` precisa ser criado mesmo que nada pareça mudar.
       Ilegível por partes faltando → segue só com o local (o antigo fica como está); qualquer outro erro → sobe (a
       entidade falha e o `~v2` não é criado nesta volta). */
    _v2ouAntigo: function (ent, rc) {
      var self = this;
      if (!DOC_V2[ent]) return rc;
      if (rc && rc.existe) { this._v2Ok(ent, true); return rc; }
      return this._docAntigo(ent).get().then(function (s) { return self._valorDoSnap(ent, s, false, true); }).then(function (ra) {
        return { existe: !!(ra && ra.existe), v: ra && ra.v, partes: 0, doAntigo: true };
      }, function (e) {
        if (e && e.code === "partes-incompletas") return { existe: false, partes: 0, doAntigo: true, antigoIlegivel: true };
        throw e;
      });
    },

    /* ⚠ O DOCUMENTO QUE A NUVEM VAI RECUSAR NÃO SAI DO APARELHO (19/10/2026). O Firestore recusa documento acima de
       1 MiB — mas o SDK, antes de o servidor dizer não, serializa a carga, grava no cache local (persistência com
       synchronizeTabs), aplica, recebe a recusa e desfaz. Com quatro listas do Rogério acima do teto (bim_edicoes
       5,1 MB, bim_vistas 3,7 MB, bim_familias 1,7 MB, orcamentos 1,1 MB), cada salvamento repetia isso, a memória da
       página chegava a 4 GB em ~10 min e o Edge derrubava a aba ("Out of Memory"): 16 quedas em 19/10, todas com
       `v8-oom-stack ... firebase-firestore-compat.js` no registro do Edge. Na reprodução com a nuvem LENDO de verdade
       e as gravações interceptadas, a memória ficou em ~100 MB por 14 min.
       Aqui o tamanho é medido pela REGRA DO FIRESTORE (texto = bytes UTF-8 + 1, número 8, booleano/nulo 1, mapa =
       nomes + valores, + 32 do documento) e, CLARAMENTE acima do teto, a escrita é recusada aqui com a MESMA
       mensagem do servidor — o resultado para o dado é idêntico (não subiria de qualquer jeito; o estado() diz
       "lista grande demais"), só que sem o SDK no meio. Na faixa de dúvida (até 4 KB acima) manda como sempre. */
    TETO_DOC: 1048576,
    _tamanhoFirestore: function (x) {
      var self = this;
      function utf8(t) { var n = 0, i, c; for (i = 0; i < t.length; i++) { c = t.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3; } return n; }
      function tam(v) {
        if (v === null) return 1;
        var t = typeof v;
        if (t === "string") return utf8(v) + 1;
        if (t === "number") return 8;
        if (t === "boolean") return 1;
        if (t === "undefined" || t === "function") return 0;
        if (Array.isArray(v)) { var a = 0; for (var i = 0; i < v.length; i++) a += tam(v[i]); return a; }
        if (t === "object") { var m = 0; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k) && v[k] !== undefined) m += utf8(k) + 1 + tam(v[k]); return m; }
        return 8;
      }
      return tam(x) + 32;
    },
    LIMPAR_MS: 4000,
    _limparCacheVelho: function () {
      var self = this, db = this.db;
      if (!db || typeof db.clearPersistence !== "function") return Promise.resolve(false);
      var temBanco = Promise.resolve(true);
      try {
        var idb = global.indexedDB;
        if (idb && typeof idb.databases === "function") {
          temBanco = Promise.resolve(idb.databases()).then(function (l) {
            return (l || []).some(function (d) { return d && /^firestore\//.test(String(d.name || "")); });
          }, function () { return true; });
        }
      } catch (e) { temBanco = Promise.resolve(true); }
      var limpeza = temBanco.then(function (tem) {
        if (!tem) return false;
        try { return Promise.resolve(db.clearPersistence()).then(function () { return true; }, function () { return false; }); }
        catch (e) { return false; }
      });
      var teto = new Promise(function (r) { setTimeout(function () { r(false); }, self.LIMPAR_MS); });
      return Promise.race([limpeza, teto]);
    },
    _setDoc: function (ent, doc) {
      var t = 0;
      try { t = this._tamanhoFirestore(doc); } catch (e) { t = 0; }
      if (t > this.TETO_DOC + 4096) {
        var err = new Error("Document \"" + ent + "\" cannot be written because its size (" + t + " bytes) exceeds the maximum allowed size of " + this.TETO_DOC + " bytes. (conferido no aparelho, sem enviar)");
        err.code = "invalid-argument";
        return Promise.reject(err);
      }
      return this._doc(ent).set(doc);
    },

    /* ⚠ A LISTA GRANDE VAI EM PARTES (19/10/2026, 1.2.158). O teto de 1 MiB é por DOCUMENTO, e a entidade inteira
       morava num documento só: bim_edicoes (5,1 MB), bim_vistas (3,7 MB), bim_familias (1,7 MB) e orcamentos (1,1 MB)
       do Rogério tinham parado de subir — em silêncio para os outros aparelhos (desde a 1.2.157 o aparelho nem tenta;
       antes tentava e o SDK estourava a memória da página). Agora, acima de TETO_UM_DOC, a lista sobe em partes de
       até TETO_PARTE, numa GRAVAÇÃO ATÔMICA (WriteBatch: as partes da revisão nova, o documento principal apontando
       para ela e a remoção das partes da revisão anterior — ou tudo entra, ou nada).
       O documento principal fica { v: [], partes: n, rev, em }: o `v` VAZIO é de propósito para o aparelho de versão
       antiga, que só lê `v` — o _merge é UNIÃO por id (o que a nuvem não tem não é apagado do aparelho; só lápide
       apaga), então ele não perde nada e não apaga nada; só deixa de receber o que está nas partes até atualizar.
       Quem lê (_valorDoSnap) junta as partes da `rev` do principal; parte faltando (o principal mudou no meio) →
       lê de novo uma vez; ainda faltando → falha registrada, nada aplicado (nunca aplica lista pela metade). */
    /* ⚠ REVISÃO ADVERSARIAL (19/10/2026) — cinco furos do primeiro desenho, cada um reproduzido no
       tools/test-nuvem-partes.js [8]–[12] (que reprova sem a correção):
       (a) TETO_UM_DOC era 900 KB: a lista de 900 KB a 1 MiB, que SINCRONIZAVA num documento só, passou a ir em
           partes — e o aparelho de versão antiga, que só lê `v`, deixou de recebê-la (perdia sincronização que
           tinha). Agora só vai em partes o que o servidor RECUSARIA num documento só (1 MiB menos 8 KB de folga para
           o nome do documento, que o _tamanhoFirestore não conta) — para o aparelho antigo, nada que funcionava parou.
       (b) registro sozinho acima de TETO_PARTE travava a lista inteira (lista de 2 MB com uma família de 800 KB
           nunca subia, nem em partes). Agora ele vai SOZINHO numa parte, até TETO_PARTE_SOLO.
       (c) toda gravação de TODA entidade lia o principal antes (a guarda do atalho exigia `db.batch` ausente, e no
           app ele sempre existe): uma leitura de rede por escrita, nas 30 e tantas entidades — a cota é o que já
           derrubou a sincronização de cliente. A leitura só acontece quando a entidade está ou esteve em partes.
       (d) a leitura do principal antes do commit é assíncrona: duas gravações seguidas da MESMA entidade podiam
           chegar ao servidor fora de ordem (a 1ª com leitura lenta commitava DEPOIS da 2ª) e a nuvem ficava com a
           lista VELHA. Agora as gravações de cada entidade entram numa FILA: a próxima só começa depois de a
           anterior CHAMAR o commit (não espera a confirmação do servidor — offline ela só vem com a rede, e a fila
           de escrita do SDK já preserva a ordem do que foi chamado).
       (e) partes órfãs para sempre: o aparelho esquecia a revisão lembrada assim que via o principal num documento
           só (o aparelho antigo grava assim a cada abertura) ou a revisão de outro aparelho (duas gravações juntas).
           Agora ele lembra TODAS as revisões que viu (por conta e entidade, até REVS_MAX) e apaga todas no próximo
           commit da entidade; apagar documento que não existe é inofensivo no Firestore. */
    TETO_UM_DOC: 1048576 - 8 * 1024,
    TETO_PARTE: 700 * 1024,
    TETO_PARTE_SOLO: 1048576 - 16 * 1024,
    /* ⚠ desde 23/10/2026 o TETO_LOTE é o teto da LISTA INTEIRA, não de uma requisição: cada parte sobe sozinha (ver
       `_naFaixa`). Medido (tools/medir-nuvem-envio.js, backup do Rogério): no fio a requisição pesa 1,7–5,4x a carga
       (2,7x em média); a maior passou de 5,5 MiB (orcamentos, lote único) para 2,2 MiB (uma parte). No pior caso, uma
       parte de TETO_PARTE_SOLO com o fator 5,4x = ~5,4 MiB, abaixo dos 10 MiB por requisição do Firestore. */
    TETO_LOTE: 9 * 1024 * 1024,
    REVS_MAX: 8,
    _revNuvem: {},
    _seqSnap: {},
    _filaEsc: {},
    /* ⚠ pelo NOME DO DOCUMENTO (DOC_V2): as revisões lembradas do documento antigo nunca são apagadas no novo nem vice-versa —
       apagar as partes do antigo deixaria o aparelho de versão antiga com o principal apontando para o nada */
    _chaveRev: function (ent) { return String(this.uid || "") + "|" + this._nomeDoc(ent); },
    /* ⚠ AS REVISÕES LEMBRADAS SOBREVIVEM A FECHAR O APP (revisão adversarial 2, 19/10/2026 — test-nuvem-partes
       [16]). Viviam só na memória: o aparelho novo gravava R1 e fechava; o antigo gravava { v } por cima do
       principal; o novo reabria, via o documento só, reenviava R2 — e as partes de R1 (5 MB no bim_edicoes)
       ficavam na nuvem para sempre, porque mais ninguém sabia que existiam. A chave tem três trechos depois de
       "orcapro:" de propósito: o RE_CHAVE_ENT do store.js não a confunde com entidade de empresa. */
    CHAVE_REVS: "orcapro:nuvem:revs:partes",
    _revsCarregadas: false,
    _carregarRevs: function () {
      if (this._revsCarregadas) return;
      this._revsCarregadas = true;
      try {
        var o = JSON.parse(global.localStorage.getItem(this.CHAVE_REVS) || "null");
        if (!o || typeof o !== "object") return;
        for (var k in o) {
          if (!Object.prototype.hasOwnProperty.call(o, k) || !o[k] || typeof o[k] !== "object") continue;
          var m = this._revNuvem[k] || (this._revNuvem[k] = {});
          for (var r in o[k]) if (Object.prototype.hasOwnProperty.call(o[k], r) && !Object.prototype.hasOwnProperty.call(m, r) && +o[k][r] > 0) m[r] = +o[k][r];
        }
      } catch (e) {}
    },
    _guardarRevs: function () {
      try {
        var o = {}, self = this, tem = false;
        Object.keys(this._revNuvem).forEach(function (k) { var m = self._revNuvem[k]; if (m && Object.keys(m).length) { o[k] = m; tem = true; } });
        if (tem) global.localStorage.setItem(this.CHAVE_REVS, JSON.stringify(o));
        else global.localStorage.removeItem(this.CHAVE_REVS);
      } catch (e) {}
    },
    /* as revisões em partes que este aparelho sabe que existem (ou existiram) na nuvem: { rev: n } */
    _revsDe: function (ent) {
      this._carregarRevs();
      var m = this._revNuvem[this._chaveRev(ent)];
      return m && Object.keys(m).length ? m : null;
    },
    _lembrarRev: function (ent, rev, n) {
      this._carregarRevs();
      var k = this._chaveRev(ent), m = this._revNuvem[k] || (this._revNuvem[k] = {});
      if (m[rev] === n) return;   // já lembrada: nem regrava o localStorage (o ouvinte passa aqui a cada snapshot)
      if (!Object.prototype.hasOwnProperty.call(m, rev)) {
        var ks = Object.keys(m);
        if (ks.length >= this.REVS_MAX) delete m[ks[0]];   // teto: a mais antiga sai da lista (no pior caso, órfã)
      }
      m[rev] = n;
      this._guardarRevs();
    },
    _refParte: function (ent, rev, i, antigo) { return this.db.collection("empresas").doc(this.uid).collection("dados").doc((antigo ? ent : this._nomeDoc(ent)) + "~p~" + rev + "~" + i); },
    /* fatia a lista em partes de até TETO_PARTE (pela regra do Firestore); o registro maior que isso vai sozinho
       numa parte (até TETO_PARTE_SOLO); null = algum registro passa até disso (não caberia nem num documento só) */
    _fatiar: function (lista) {
      var self = this, partes = [], atual = [], tam = 0, ok = true;
      lista.forEach(function (o) {
        var t = self._tamanhoFirestore(o);
        if (t > self.TETO_PARTE_SOLO) { ok = false; return; }
        if (atual.length && tam + t > self.TETO_PARTE) { partes.push(atual); atual = []; tam = 0; }
        atual.push(o); tam += t;
      });
      if (!ok) return null;
      if (atual.length || !partes.length) partes.push(atual);
      return partes;
    },
    /* grava a entidade: num documento só (como sempre) ou em partes, atômico — sempre na FILA da entidade (ver (d)).
       Devolve a promessa da confirmação do servidor, como o _setDoc. */
    /* ⚠ E A GRAVAÇÃO EM PARTES ESPERA A CONFIRMAÇÃO DA ANTERIOR, JUNTANDO AS QUE CHEGAM NO MEIO (revisão
       adversarial, 19/10/2026 — test-nuvem-partes [14]). Cada gravação em partes leva a lista INTEIRA (5 MB no
       bim_edicoes), e o SDK guarda cada commit na memória e no banco do aparelho até o servidor confirmar. Offline,
       ou com a subida mais lenta que o ritmo de salvamento, os commits se empilhavam sem limite — é o mesmo
       "Out of Memory" da 1.2.157 voltando por outro caminho. Agora, enquanto uma gravação em partes da entidade não
       foi confirmada, as seguintes viram UMA só, com a lista mais nova (cada uma é a entidade inteira, então só a
       última importa); quem chamou recebe a promessa dessa. Fechou o app com uma esperando: o dado está no aparelho
       e o próximo sincronizar sobe. A gravação num documento só continua sem esperar confirmação (como sempre). */
    /* a porta de gravação: a fila (abaixo) + o que vale para o `~v2` quando o servidor CONFIRMA (ver DOC_V2). O `throw`
       síncrono da fila passa direto (o `catch` do push depende dele). */
    _escreverEnt: function (ent, vN, tam) {
      /* ⚠ só as falhas que JÁ ESTAVAM registradas quando a gravação saiu (revisão da N1 — test-nuvem-v2-rev [R9]): a que
         chega depois (o ouvinte com pedaço faltando, outra gravação recusada) é notícia nova e não pode sumir da tela */
      var self = this, velhas = DOC_V2[ent] ? (this._falhas || []).filter(function (f) { return f && f.entidade === ent; }) : null;
      var p = this._escreverEntFila(ent, vN);
      if (DOC_V2[ent]) Promise.resolve(p).then(function () { self._v2Ok(ent, true); self._limparFalhasDe(ent, velhas); }, function () {});
      this._anotarPendente(ent, p, tam);
      return p;
    },
    /* ⚠ O QUE AINDA NÃO FOI CONFIRMADO, PARA A VIGIA (23/10/2026). `nuvemNoAr` só contava gravações; não dizia o
       tamanho nem há quanto tempo esperavam — e foi esse o número que faltou para separar "o servidor nunca confirma"
       (o que se achava) de "confirma, só que em 2 minutos" (o que a vigia de 21–23/10 mostrava). Por entidade: quantas
       chamadas esperam, desde quando (a mais velha) e o tamanho da última carga (caracteres do JSON). */
    _pend: {},
    _anotarPendente: function (ent, p, tam) {
      /* por CONTA e entidade: a gravação da conta antiga que nunca termina (ver `_naFaixa`) não conta como "no ar" na nova */
      var self = this, k = String(this.uid || "") + "|" + ent;
      var e = this._pend[k] || (this._pend[k] = { n: 0, desde: Date.now(), tam: 0 });
      if (!e.n) e.desde = Date.now();
      e.n++;
      if (typeof tam === "number" && isFinite(tam)) e.tam = tam;
      var fim = function () { var x = self._pend[k]; if (x && --x.n <= 0) delete self._pend[k]; };
      Promise.resolve(p).then(fim, fim);
    },
    /* a entidade tem gravação no ar ou esperando a vez (a fila dela) */
    _temNoAr: function (ent) {
      var f = this._filaEsc[this._chaveRev(ent)];
      var kP = String(this.uid || "") + "|" + ent;
      return !!((f && f.ativos > 0) || (this._pend[kP] && this._pend[kP].n > 0));
    },
    /* o MESMO conteúdo (como o JSON o vê), sem olhar a ordem das chaves dos mapas — a ordem das listas conta */
    _canon: function (v) {
      var self = this;
      if (v === null || typeof v !== "object") { var s = JSON.stringify(v); return s === undefined ? "null" : s; }
      if (typeof v.toJSON === "function") return self._canon(v.toJSON());
      if (Array.isArray(v)) return "[" + v.map(function (x) { return (x === undefined || typeof x === "function") ? "null" : self._canon(x); }).join(",") + "]";
      var ks = Object.keys(v).filter(function (k) { return v[k] !== undefined && typeof v[k] !== "function"; }).sort();
      return "{" + ks.map(function (k) { return JSON.stringify(k) + ":" + self._canon(v[k]); }).join(",") + "}";
    },
    _mesmoConteudo: function (a, b) {
      try {
        if (JSON.stringify(a) === JSON.stringify(b)) return true;
        return this._canon(a) === this._canon(b);
      } catch (e) { return false; }   // na dúvida, sobe
    },
    /* ⚠ A FAIXA DAS GRAVAÇÕES GRANDES (23/10/2026). O canal de escrita do Firestore é UM só e confirma NA ORDEM em
       que as gravações foram chamadas: a pequena chamada depois de uma grande espera a grande inteira subir. Antes,
       a lista grande ia num lote só com TODAS as partes (orcamentos: 4 documentos, 5,5 MiB no fio, medido). Agora
       cada parte é UMA gravação, e as grandes (parte, ou documento só acima de TETO_DIRETO) passam por esta faixa, uma
       de cada vez: a pequena chamada no meio espera no máximo UMA parte (~0,7 MB pela regra do Firestore). */
    TETO_DIRETO: 256 * 1024,
    /* ⚠ AS LÁPIDES NUNCA ENTRAM NA FAIXA enquanto couberem num documento (revisão adversarial, 23/10/2026 —
       tools/test-nuvem-confirma-rev.js [2]). O push manda `_lapides` na FRENTE da lista sem o registro excluído ("senão o
       outro aparelho devolve tudo"), e a ordem só vale se as duas entrarem no canal na ordem em que foram chamadas. Com o
       teto de 3.000 lápides (~95 bytes cada pela regra do Firestore) elas passam dos 256 KB: na faixa, esperavam as
       partes de uma lista grande enquanto a lista pequena sem o registro ia direto — o outro aparelho recebia a lista
       primeiro. */
    _vaiNaFaixa: function (ent, t) { return t > this.TETO_DIRETO && ent !== "_lapides"; },
    /* ⚠ UMA FAIXA POR CONTA (revisão adversarial, 23/10/2026 — tools/test-nuvem-confirma-rev.js [5]). O SDK não confirma
       nem recusa a gravação de um usuário depois que outro entra (a fila de escrita dele fica guardada para quando ele
       voltar): com uma faixa só, a parte da conta antiga presa na cabeça travava para sempre, na sessão, toda lista grande
       da conta nova — ativar outra licença no meio da subida deixava orçamentos e BIM da empresa nova sem subir até
       reabrir o app. */
    _faixas: {},
    _naFaixa: function (fn, conta) {
      var kF = String(conta === undefined ? this.uid : conta);
      var antes = this._faixas[kF] || Promise.resolve();
      var vez = antes.then(function () { return fn(); });
      this._faixas[kF] = vez.then(function () {}, function () {});
      return vez;
    },
    /* para a vigia (js/memvigia.js): pendentes, a maior e a mais velha, e o que o SDK disse por último */
    diag: function () {
      var p = this._pend || {}, n = 0, maior = null, velha = 0, agora = Date.now();
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k) && p[k] && p[k].n > 0) {
        n++;
        if (!maior || p[k].tam > maior.tam) maior = { ent: k.slice(k.indexOf("|") + 1), tam: p[k].tam };
        if (!velha || p[k].desde < velha) velha = p[k].desde;
      }
      return { pendentes: n, maior: maior, idadeS: velha ? Math.round((agora - velha) / 1000) : 0, sdk: (this._sdkMsgs || []).slice(-3) };
    },
    /* ⚠ O QUE O SDK DIZ QUANDO REPETE SOZINHO (23/10/2026): erro passageiro do canal (rede, cota, conexão derrubada) não
       chega à promessa da gravação — o SDK tenta de novo calado e só escreve no console. A vigia precisa do motivo real:
       guarda as 6 últimas mensagens de aviso/erro do Firestore com o código que elas trazem (texto cortado; quem manda
       para o diag passa pelo msgSegura do js/memvigia.js). */
    _sdkMsgs: [],
    _ouvirSdk: function () {
      var self = this, fb = global.firebase;
      if (this._ouvindoSdk || !fb || typeof fb.onLog !== "function") return;
      this._ouvindoSdk = true;
      try {
        fb.onLog(function (r) {
          try {
            if (!r || !/firestore/i.test(String(r.type || ""))) return;
            var txt = String(r.message || "");
            var m = /(resource[-_ ]exhausted|unavailable|deadline[-_ ]exceeded|permission[-_ ]denied|invalid[-_ ]argument|unauthenticated|failed[-_ ]precondition|aborted|internal|maximum backoff|transport errored|could not reach|offline)/i.exec(txt);
            self._sdkMsgs.push({ em: Date.now(), cod: m ? m[1].toLowerCase().replace(/[ _]/g, "-") : String(r.level || "aviso"), msg: txt.slice(0, 120) });
            if (self._sdkMsgs.length > 6) self._sdkMsgs.shift();
          } catch (e) {}
        }, { level: "warn" });
      } catch (e) {}
    },
    _escreverEntFila: function (ent, vN) {
      var self = this, k = this._chaveRev(ent);
      var fila = this._filaEsc[k] || (this._filaEsc[k] = { corrente: Promise.resolve(), espera: null, ativos: 0 });
      if (fila.espera) { fila.espera.vN = vN; fila.espera.juntadas++; return fila.espera.promessa; }
      /* fila parada e entidade que nunca esteve em partes: o caminho de SEMPRE, na hora (sem leitura, sem esperar
         a vez) — inclusive o SDK lançando na hora (lista dentro de lista) cai no `catch` síncrono do push, como antes
         (prova: tools/test-nuvem-push-falha.js, CN do catch vazio) */
      if (!fila.ativos && !this._revsDe(ent)) {
        var t0 = 0; try { t0 = this._tamanhoFirestore({ v: vN, em: 0 }); } catch (e0) { t0 = 0; }
        /* ⚠ o documento só GRANDE (acima de TETO_DIRETO) vai pela fila e pela faixa das grandes (ver `_naFaixa`) */
        if (!(t0 > this.TETO_UM_DOC && Array.isArray(vN)) && !this._vaiNaFaixa(ent, t0)) {
          var p0 = this._setDoc(ent, { v: vN, em: Date.now() });
          /* ⚠ E A PRÓXIMA DA MESMA ENTIDADE ESPERA ESTA SER CONFIRMADA (20/10/2026, 1.2.162). Antes só a gravação em
             partes esperava; a de documento só ia direto, e com o servidor sem confirmar (rede ruim, cota, ouvinte
             caído) cada salvamento do BIM empilhava mais um bim_edicoes inteiro na fila do SDK — sem teto. Agora, no
             máximo uma no ar e uma esperando (a mais nova) por entidade. */
          fila.ativos++;
          var dec0 = function () { fila.ativos--; };
          fila.corrente = Promise.resolve(p0).then(dec0, dec0);
          return p0;
        }
      }
      /* a CONTA em que a gravação foi chamada (ver `_escreverEntVez`, "conta-trocou"); a fila já é por conta (`_chaveRev`) */
      var item = { vN: vN, juntadas: 0, uid: this.uid };
      fila.ativos++;
      var vez = fila.corrente.then(function () {
        if (fila.espera === item) fila.espera = null;
        return self._escreverEntVez(ent, item.vN, item.uid);
      });
      item.promessa = vez.then(function (r) { return r.p; });
      fila.espera = item;
      /* a próxima começa quando esta CHAMOU o commit (documento só) ou quando o servidor CONFIRMOU (em partes) */
      fila.corrente = vez.then(function (r) { return r.esperar; }).then(function () { fila.ativos--; }, function () { fila.ativos--; });
      return item.promessa;
    },
    /* ⚠ A REVISÃO A APAGAR É A QUE ESTÁ NA NUVEM AGORA E TODAS AS QUE ESTE APARELHO JÁ VIU: outro aparelho pode ter
       gravado no meio (o sincronizar dele, o ouvinte atrasado). Por isso lê o principal logo antes (do cache, se
       offline) e apaga a revisão dele E as lembradas. Resolve com { p: promessa do commit } assim que o commit é
       CHAMADO — é o que libera a fila. */
    /* ⚠ A GRAVAÇÃO SÓ VAI PARA A CONTA EM QUE FOI CHAMADA (revisão adversarial, 23/10/2026 — tools/test-nuvem-confirma-rev.js
       [1]). Cada referência (`_doc`, `_refParte`) é montada com o `this.uid` da HORA em que é usada. Com a lista grande
       subindo parte a parte (minutos numa conexão lenta) e a faixa das grandes, ativar outra licença no meio
       (`trocouDeLicenca` + `entrarPorLicenca`) mandava as partes seguintes e o principal da empresa A para
       `empresas/<conta da B>`: o principal da B passava a apontar para uma revisão com partes na conta A (a lista da B
       ficava ilegível) e uma parte da lista da A ficava na conta da B. Agora cada passo confere a conta antes de montar a
       referência (no mesmo tique, sem espera no meio); trocou → recusa "conta-trocou": nada vai para a conta nova, e a
       antiga fica na revisão inteira de antes (as partes já gravadas são de revisão lembrada). Desligar a sincronização
       (`sair`, uid nulo) também para o que ainda não saiu. */
    _escreverEntVez: function (ent, vN, uidChamada) {
      var self = this, em = Date.now(), doc = { v: vN, em: em };
      var conta = uidChamada === undefined ? this.uid : uidChamada;
      var mesmaConta = function () {
        if (self.uid !== conta) {
          var eC = new Error("a conta da nuvem mudou durante a gravação de \"" + ent + "\" — nada foi gravado na conta nova");
          eC.code = "conta-trocou";
          throw eC;
        }
      };
      mesmaConta();
      var t = 0; try { t = this._tamanhoFirestore(doc); } catch (e) { t = 0; }
      var temBatch = !!this.db && typeof this.db.batch === "function";
      var emPartes = t > this.TETO_UM_DOC && Array.isArray(vN) && temBatch;
      /* documento só: o grande espera a vez na faixa das grandes (ver `_naFaixa`); o pequeno vai direto */
      var setDoc = function () { return self._vaiNaFaixa(ent, t) ? self._naFaixa(function () { mesmaConta(); return self._setDoc(ent, doc); }, conta) : self._setDoc(ent, doc); };
      /* (c): entidade que nunca esteve em partes neste aparelho → o caminho de sempre, sem leitura antes */
      if (!emPartes && (!this._revsDe(ent) || !temBatch)) { var pU = setDoc(); return Promise.resolve({ p: pU, esperar: pU }); }
      var lerAtual = this._doc(ent).get().then(function (s0) {
        var d0 = s0 && s0.exists ? (s0.data() || {}) : null;
        return d0 && +d0.partes > 0 && d0.rev ? { rev: d0.rev, n: +d0.partes } : null;
      })["catch"](function () { return null; });
      return lerAtual.then(function (naNuvem) {
        mesmaConta();
        if (naNuvem) self._lembrarRev(ent, naNuvem.rev, naNuvem.n);
        var lembradas = self._revsDe(ent) || {};
        var antigas = Object.keys(lembradas).map(function (r) { return { rev: r, n: +lembradas[r] || 0 }; });
        var apagarAntigas = function (b) { antigas.forEach(function (r) { for (var k = 0; k < r.n; k++) b["delete"](self._refParte(ent, r.rev, k)); }); };
        var esquecer = function () { var m = self._revNuvem[self._chaveRev(ent)]; if (m) antigas.forEach(function (r) { if (m[r.rev] === r.n) delete m[r.rev]; }); self._guardarRevs(); };
        var nApagar = antigas.reduce(function (a, r) { return a + r.n; }, 0);
        if (!emPartes) {
          if (!antigas.length || t > self.TETO_DOC + 4096 || nApagar > 450) { var pS = setDoc(); return { p: pS, esperar: pS }; }
          /* voltou a caber num documento: o principal sem `partes` e as partes antigas apagadas, juntos */
          var pB1 = (self._vaiNaFaixa(ent, t) ? self._naFaixa : function (fn) { return fn(); }).call(self, function () {
            mesmaConta();
            var b1 = self.db.batch(); b1.set(self._doc(ent), doc); apagarAntigas(b1);
            return b1.commit();
          }, conta).then(esquecer);
          return { p: pB1, esperar: pB1 };
        }
        var partes = self._fatiar(vN);
        if (!partes || t > self.TETO_LOTE || partes.length + nApagar > 450) {
          var err = new Error("Document \"" + ent + "\" cannot be written because its size (" + t + " bytes) exceeds the maximum allowed size even split in parts (conferido no aparelho, sem enviar)");
          err.code = "invalid-argument";
          throw err;
        }
        var rev = em.toString(36) + Math.random().toString(36).slice(2, 6), nP = partes.length;
        /* já agora, antes da primeira parte: a gravação seguinte (ou a próxima abertura, se esta parar no meio) tem de
           apagar as partes desta revisão se a substituir */
        self._lembrarRev(ent, rev, nP);
        /* ⚠ UMA PARTE POR GRAVAÇÃO, E O PRINCIPAL SÓ DEPOIS DE TODAS CONFIRMADAS (23/10/2026 — ver `_naFaixa`). Antes era
           um lote atômico com tudo (a lista de 9 MiB do TETO_LOTE iria numa requisição só, ~24 MiB no fio pelo fator
           medido de 2,7x — acima dos 10 MiB por requisição do Firestore). A consistência continua a mesma: quem lê segue
           SÓ o principal, e ele passa a apontar para a revisão nova num lote pequeno no fim (o principal + a remoção das
           partes antigas), depois de cada parte nova ter sido confirmada pelo servidor. Parou no meio (rede, app
           fechado, parte recusada): o principal continua na revisão anterior, inteira; as partes já gravadas da nova são
           de uma revisão LEMBRADA e saem no próximo commit da entidade. Nada é apagado antes de o novo estar inteiro. */
        var subidas = partes.reduce(function (cad, pv, i) {
          return cad.then(function () {
            return self._naFaixa(function () { mesmaConta(); return self._refParte(ent, rev, i).set({ v: pv, i: i, n: nP, rev: rev, em: em }); }, conta);
          });
        }, Promise.resolve());
        var pB = subidas.then(function () {
          mesmaConta();
          var b = self.db.batch();
          b.set(self._doc(ent), { v: [], partes: nP, rev: rev, em: em });
          apagarAntigas(b);
          return b.commit();
        }).then(esquecer);
        return { p: pB, esperar: pB };
      });
    },
    /* o valor da entidade a partir do documento principal: { existe, v, partes }. Em partes, junta as da `rev` dele.
       ⚠ (e): ver o principal num documento só NÃO faz esquecer as revisões lembradas — as partes delas podem ter
       ficado na nuvem (o aparelho antigo grava assim), e só quem lembra apaga. */
    /* `antigo` = o documento de SEMPRE de uma entidade do DOC_V2 (só leitura): não lembra a revisão (só se apaga o que se
       lembra, e o antigo nunca é apagado por este aparelho) e relê o mesmo documento antigo */
    _valorDoSnap: function (ent, snap, jaTentou, antigo) {
      var self = this;
      if (!snap || !snap.exists) return Promise.resolve({ existe: false });
      /* `pend`: o SDK mostra a gravação AINDA NÃO CONFIRMADA deste aparelho por cima do documento (compensação de
         latência) — o que ele devolve não prova o que está no servidor (ver o "não sobe" do `_sincronizarAgora`) */
      var pend = !!(snap.metadata && snap.metadata.hasPendingWrites);
      var d = snap.data() || {}, n = +d.partes || 0;
      if (!(n > 0) || !d.rev) return Promise.resolve({ existe: true, v: d.v, partes: 0, pend: pend });
      if (!antigo) self._lembrarRev(ent, d.rev, n);
      var pedidos = [];
      for (var i = 0; i < n; i++) pedidos.push(this._refParte(ent, d.rev, i, antigo).get());
      return Promise.all(pedidos).then(function (ps) {
        var falta = ps.some(function (p, k) { var x = p && p.exists ? p.data() : null; return !x || x.rev !== d.rev || +x.i !== k || !Array.isArray(x.v); });
        if (falta) {
          if (jaTentou) { var e = new Error("a lista \"" + ent + "\" na nuvem está em partes e alguma não chegou (rev " + d.rev + ")"); e.code = "partes-incompletas"; throw e; }
          return (antigo ? self._docAntigo(ent) : self._doc(ent)).get().then(function (s2) { return self._valorDoSnap(ent, s2, true, antigo); });
        }
        var v = []; ps.forEach(function (p) { v = v.concat(p.data().v); });
        return { existe: true, v: v, partes: n, pend: pend || ps.some(function (p) { return !!(p && p.metadata && p.metadata.hasPendingWrites); }) };
      });
    },
    /* ⚠ O APARELHO ANTIGO APAGA O PONTEIRO (revisão adversarial, 19/10/2026 — test-nuvem-partes [11]). Ele lê `v`
       vazio, une com o que tem (às vezes nada: instalação nova) e grava { v: <o que tem> } POR CIMA do principal em
       partes, a cada abertura. Ninguém perde dado no aparelho (união), mas a NUVEM fica sem a lista: o aparelho novo
       que já tem tudo não reenvia (o "nada mudou" compara com o que ELE mandou) e quem instala de novo recebe só o
       que o antigo tinha. Quem tem a lista que precisa de partes e vê o principal num documento só, reenvia. */
    _nuvemSemMinhasPartes: function (ent, r, listaN, tamJson) {
      if (!r || !r.existe || r.partes || ent === "prefs" || ent === "conta" || !Array.isArray(listaN)) return false;
      /* filtro barato: pela regra do Firestore o tamanho nunca passa de 4x o JSON (o pior caso é número de um dígito numa lista: "0," = 2 caracteres, 8 bytes) */
      if (typeof tamJson === "number" && tamJson < this.TETO_UM_DOC / 4) return false;
      var t = 0; try { t = this._tamanhoFirestore({ v: listaN, em: 0 }); } catch (e) { return false; }
      return t > this.TETO_UM_DOC;
    },

    // Une lista local + nuvem por id; o registro com atualizadoEm mais novo vence.
    // LOTE 3: edição concorrente (2 aparelhos) NÃO é mais sobrescrita calada —
    // o vencedor guarda a cópia perdedora em _conflitoDe (até ~50KB; acima
    // disso, só metadados) e o contador alimenta o aviso pós-sync.
    _conflitosUltimoMerge: 0,
    /* obras cujo planejamento (`crono_obra`) teve conflito no último merge —
       recado próprio, porque ali a versão perdedora NÃO é guardada (ver _merge) */
    _conflitosCrono: [],
    /* registros de centro de custo (`centrocusto`, `cc_regras`, `cc_aprop`)
       com conflito no último merge — mesmo motivo do `_conflitosCrono`: ali a
       versão perdedora também NÃO é guardada (ver SEM_COPIA no _merge), e o
       recado geral diria "não se perdeu nada" sobre dinheiro */
    _conflitosCc: [],

    /* ===== v1.1.232 — MARCAS DA ÚLTIMA SINCRONIZAÇÃO =====
       O merge antigo tratava QUALQUER diferença de atualizadoEm como "editado
       em 2 aparelhos": bastava A trabalhar um dia e B abrir o app para B ver o
       aviso de conflito — em edição normal, vinda de UM aparelho só. Pior: o
       vencedor ganhava uma cópia integral do perdedor (_conflitoDe) que subia
       para a nuvem e, a cada ida-e-volta, aninhava a anterior.
       A marca resolve: guarda, por registro, o atualizadoEm da última versão
       que ESTE aparelho sincronizou. Se um dos lados ainda está na marca, ele
       simplesmente não foi editado desde o último sync — é propagação, não
       conflito. Conflito de verdade é quando OS DOIS saíram da marca.
       "_syncmarcas" fica fora de ENTIDADES de propósito: é estado do aparelho,
       não dado do usuário — não sobe nem entra em backup. */
    _marcasDe: function (empresaId, ent) {
      try { var m = Store.adapter.ler(empresaId, "_syncmarcas", {}); return (m && m[ent]) || {}; } catch (e) { return {}; }
    },
    /* `soIguaisA` (opcional, a lista da NUVEM): marca só o registro que já está IGUAL nos dois lados; o resto mantém a
       marca anterior. ⚠ É o caso do sincronizar ANTES de o servidor confirmar a subida (revisão adversarial,
       20/10/2026, 1.2.162 — tools/test-nuvem-fila-oom.js [6]). Sem o cache do SDK no aparelho, a gravação que não foi
       confirmada some ao fechar o app; se a marca já tivesse avançado para a versão daqui, o próximo merge acharia que
       "só o outro aparelho editou" e a edição daqui — que nunca chegou à nuvem — sumia sem cópia de conflito. */
    _marcarSync: function (empresaId, ent, lista, soIguaisA) {
      if (ent === "prefs" || ent === "conta") return;
      try {
        var m = Store.adapter.ler(empresaId, "_syncmarcas", {}) || {};
        var mm = {};
        if (arguments.length > 3) {
          var ant = (m[ent] && typeof m[ent] === "object") ? m[ent] : {}, naNuvem = {}, temP = Object.prototype.hasOwnProperty;
          Util.arr(soIguaisA).forEach(function (o) { if (o && o.id) naNuvem[o.id] = String(o.atualizadoEm || ""); });
          Util.arr(lista).forEach(function (o) {
            if (!o || !o.id) return;
            var t = String(o.atualizadoEm || "");
            if (temP.call(naNuvem, o.id) && naNuvem[o.id] === t) mm[o.id] = t;
            else if (temP.call(ant, o.id)) mm[o.id] = ant[o.id];
          });
        } else Util.arr(lista).forEach(function (o) { if (o && o.id) mm[o.id] = String(o.atualizadoEm || ""); });
        m[ent] = mm;
        var antes = this._aplicandoDaNuvem;
        this._aplicandoDaNuvem = true; // marca não é dado: nunca dispara push
        try { Store.adapter.gravar(empresaId, "_syncmarcas", m); }
        finally { this._aplicandoDaNuvem = antes; }
      } catch (e) {}
    },

    _merge: function (local, cloud, ent, empresaId) {
      if (ent === "prefs" || ent === "conta") {
        // objeto único (prefs, conta mestre): mescla campo a campo; o mais novo (atualizadoEm) vence
        var l = local || {}, c = cloud || {};
        if (ent === "conta" && c.atualizadoEm && (!l.atualizadoEm || String(c.atualizadoEm) > String(l.atualizadoEm))) return Object.assign({}, l, c);
        var r = Object.assign({}, c, l);
        /* ⚠ O NOME DA PESSOA NAO PODE OBEDECER AO "LOCAL VENCE".
         * `prefs` inteiro se resolve com o local ganhando, e para preferencia
         * de tela isso esta certo. Para o `nomeDono` nao: e o nome que assina
         * as aprovacoes, e cada aparelho ficaria com uma resposta diferente
         * para a MESMA pessoa — o computador assinando um nome e o celular
         * outro, sem nunca convergirem, porque cada um reempurra o proprio
         * valor. E apagar seria impossivel: o aparelho que ainda tem o nome
         * traria de volta no sync seguinte.
         * Por isso ele viaja com `nomeDonoEm` e vence o mais NOVO — mesma
         * regra que a `conta` ja usava, aplicada a um campo so. Ausencia de
         * carimbo dos dois lados mantem o comportamento antigo.
         * ⚠ E `delete` tem de ser respeitado: o lado mais novo pode ser o que
         * NAO tem a chave (o dono apagou o proprio nome). Por isso o teste e
         * na DATA, e a chave e removida quando o vencedor nao a tem. */
        var lEm = String(l.nomeDonoEm || ""), cEm = String(c.nomeDonoEm || "");
        if (cEm && cEm > lEm) {
          if (Object.prototype.hasOwnProperty.call(c, "nomeDono")) r.nomeDono = c.nomeDono;
          else delete r.nomeDono;
          r.nomeDonoEm = c.nomeDonoEm;
        }
        /* ⚠ O "RESPONSÁVEL PELO PLANEJAMENTO E GESTÃO" TAMBÉM VENCE PELO MAIS NOVO
         * (28/09/2026). Ele mora dentro de `responsavelTecnico` e é o padrão das
         * composições próprias e das requisições geradas do orçamento. Com o
         * "local vence" cada aparelho ficava com o seu valor para sempre: o
         * administrador preenchia no computador dele e o engenheiro que gera as
         * requisições nunca recebia. Viaja com `gestaoEm`; só ESTE campo segue a
         * data — o resto de `responsavelTecnico` continua como sempre. Sem carimbo
         * dos dois lados, comportamento antigo. `delete` respeitado como no nome. */
        /* ⚠ "MOSTRAR SÓ O QUE COMPREI" (js/testemoduloui.js, teste de 1 hora por módulo) TAMBÉM VENCE PELO MAIS NOVO,
         * por USUÁRIO: cada um tem { v, em } em testeModulos.soComprados. Com o "local vence" a escolha feita num
         * aparelho nunca chegava ao outro (revisão adversarial R10). `true` (formato antigo) vale como data 0. */
        var lT = l.testeModulos && typeof l.testeModulos === "object" ? l.testeModulos : null, cT = c.testeModulos && typeof c.testeModulos === "object" ? c.testeModulos : null;
        if (lT || cT) {
          var lS = (lT && lT.soComprados && typeof lT.soComprados === "object") ? lT.soComprados : {}, cS = (cT && cT.soComprados && typeof cT.soComprados === "object") ? cT.soComprados : {};
          var emDe = function (x) { return (x && typeof x === "object") ? (Number(x.em) || 0) : 0; }, tmN = {}, kT, sN = {};
          for (kT in (lT || {})) if (Object.prototype.hasOwnProperty.call(lT, kT)) tmN[kT] = lT[kT];
          for (kT in cS) if (Object.prototype.hasOwnProperty.call(cS, kT)) sN[kT] = cS[kT];
          for (kT in lS) if (Object.prototype.hasOwnProperty.call(lS, kT) && (!Object.prototype.hasOwnProperty.call(sN, kT) || emDe(lS[kT]) >= emDe(sN[kT]))) sN[kT] = lS[kT];
          tmN.soComprados = sN;
          r.testeModulos = tmN;
        }
        var lG = String(l.gestaoEm || ""), cG = String(c.gestaoEm || "");
        if (cG && cG > lG) {
          var rtR = (r.responsavelTecnico && typeof r.responsavelTecnico === "object") ? r.responsavelTecnico : {};
          var rtC = (c.responsavelTecnico && typeof c.responsavelTecnico === "object") ? c.responsavelTecnico : {};
          var rtN = {}, kG;
          for (kG in rtR) if (Object.prototype.hasOwnProperty.call(rtR, kG)) rtN[kG] = rtR[kG];
          if (Object.prototype.hasOwnProperty.call(rtC, "gestao")) rtN.gestao = rtC.gestao;
          else delete rtN.gestao;
          r.responsavelTecnico = rtN;
          r.gestaoEm = c.gestaoEm;
        }
        return r;
      }
      var self = this;
      var byId = {};
      /* quem foi excluído (em qualquer aparelho) não volta: a lápide vence o registro
       * mais antigo que ela. A própria lista de lápides não se filtra. */
      var semLapide = (ent === "_lapides" || !empresaId);
      var marcas = empresaId ? this._marcasDe(empresaId, ent) : {};
      var mortos = semLapide ? Object.create(null) : Store.lapidesDe(empresaId, ent);
      /* obra apagada em cascata: o que APONTA para ela morreu junto (1 lápide cobre o lote).
       * Exceto os cadastros da empresa (equipe, patrimônio, frota): a exclusão só os
       * DESVINCULA, e aplicar a cascata neles apagaria no outro aparelho justamente o que
       * o modal promete preservar. Achado do gate de 25/07. */
      var imune = !semLapide && Store.imuneACascata(ent);
      var obrasMortas = semLapide ? Object.create(null) : Store.cascatasDeObra(empresaId);
      /* ⚠ E a cascata do TESTE de compatibilização, pelo mesmo motivo: o teste
         é dono de milhares de resultados, e uma lápide por resultado estourava
         o teto. Só vale para `bim_clash_resultados` — é a única entidade que
         carrega `testeId`. */
      var testesMortos = (semLapide || ent !== "bim_clash_resultados" || !Store.cascatasDeClashTeste)
        ? Object.create(null) : Store.cascatasDeClashTeste(empresaId);
      /* ⚠ A PODA APAGA UM SUBCONJUNTO do teste, e o teste continua vivo —
         então ela precisa da própria consulta. Sem esta linha, o conflito
         podado num aparelho voltava do outro no primeiro sync e a limpeza se
         desfazia sozinha: o coordenador limpava 800 registros, via o número
         cair, e no dia seguinte estava tudo lá de novo — sem erro em lugar
         nenhum. Pior que não ter limpado, porque ele conta com a limpeza
         para sair do teto. */
      var podados = (semLapide || ent !== "bim_clash_resultados" || !Store.cascatasDeClashPoda)
        ? Object.create(null) : Store.cascatasDeClashPoda(empresaId);
      /* ⚠ E A LÁPIDE DE LOTE, QUE VALE PARA QUALQUER ENTIDADE (§1.12-4).
         Sem esta consulta, apagar 1.500 decisões de apropriação de uma vez
         não propaga: o outro aparelho devolve tudo no primeiro sync e a
         limpeza se desfaz sozinha. Uma lápide por registro propagaria, mas
         comeria o teto de `_lapides` e expulsaria as das OUTRAS entidades —
         é a troca que `Store.lapidarLote` evita. O desempate é o mesmo do
         `podados`: quem foi EDITADO depois do lote, noutro aparelho, tem
         razão e volta. */
      var emLote = (semLapide || !Store.cascatasDeLote) ? Object.create(null) : Store.cascatasDeLote(empresaId, ent);
      /* ⚠ O ADITIVO É FILHO DO CONTRATO, NÃO DA OBRA — e por isso a cascata da
       * obra não pode julgá-lo pelo `obraId` que ele carrega.
       *
       * Esse `obraId` é uma CÓPIA feita quando o aditivo nasceu, e o campo Obra
       * do contrato é editável. Contrato que nasce na obra A, recebe o 01º TA
       * aprovado e depois é movido para a obra B deixa o aditivo com
       * `obraId: "A"`. Apagar a obra A grava a lápide de cascata dela, e aqui o
       * merge descartava — em TODOS os aparelhos e de forma definitiva — um
       * termo aditivo APROVADO de um contrato VIVO da obra B. O teto de
       * faturamento de B caía, e os boletins já aprovados que só cabiam por
       * causa dele passavam a exceder o contratado.
       *
       * A pergunta certa é sobre o PAI: se o contrato ainda existe, o aditivo
       * vive. Se o contrato morreu junto com a obra, o aditivo morre com ele —
       * e a exclusão legítima continua propagando pela lápide própria que a
       * cascata passou a gravar (js/gestao.js, `_excluirObra`). */
      var contratosVivos = (!semLapide && ent === "aditivos")
        ? (function () {
            var m = Object.create(null);
            try {
              Util.arr(Store.listar(empresaId, "contratos")).forEach(function (c) { if (c && c.id) m[c.id] = 1; });
            } catch (e) {}
            return m;
          })()
        : Object.create(null);
      var vivo = function (o) {
        var t = mortos[o.id];
        /* ⚠ `>=`, NÃO `>` — E A DIFERENÇA PASSOU A IMPORTAR NA v1.2.
         * `Util.agoraISO()` tem resolução de MILISSEGUNDO. Quando um registro é
         * apagado e regravado na mesma volta do laço — que é o que
         * `_prodSalvarPrecos` faz ao recolher duplicados para o id
         * determinístico —, a lápide e o carimbo do registro saem com a MESMA
         * string, e o `>` estrito conta empate como MORTO. Medido em bancada:
         * 198 de 200 merges apagavam o preço recém-gravado, e 197 de 200
         * apagavam a cotação recém-informada.
         * Antes isso era impossível: um registro recriado ganhava um uid novo e
         * nunca colidia com a própria lápide. Com id derivado da chave natural,
         * colide.
         * O empate agora favorece o REGISTRO, e é a escolha certa: uma exclusão
         * que não pega é visível (a pessoa apaga de novo); um registro que some
         * calado, não. */
        if (t) {
          if (String(o.atualizadoEm || "") < String(t)) return false;
          /* ⚠ O EMPATE NÃO ENCERRA A PERGUNTA QUANDO A MESMA EXCLUSÃO TAMBÉM
             DEIXOU LÁPIDE DE LOTE. Medido em bancada na revisão de publicação
             da 1.2.86, ao fazer a remoção da demonstração gravar AS DUAS
             formas de lápide (a de lote, que a 1.2.86 entende, e as
             individuais, que a 1.2.85 entende): `ObraDemo.remover` apaga no
             MESMO milissegundo em que os registros acabaram de ser gravados —
             então `atualizadoEm` e o `em` da lápide simples saem iguais, o
             `>=` acima devolvia "vivo" e o `return` pulava a consulta do lote
             logo abaixo, que julga por `>` estrito e teria matado.
             Resultado medido: 6 de 90 registros da demonstração SOBREVIVIAM
             ao merge no aparelho que acabou de removê-la — e o de lote, que é
             quem manda na 1.2.86, nunca era ouvido.
             ⚠ NÃO TROQUE ISTO POR UM `return` DIRETO: o `>=` continua valendo
             para quem NÃO está em lote (o registro apagado e regravado na
             mesma volta do laço pelo `_prodSalvarPrecos` — ver o comentário
             acima), e o resto do `vivo()` continua fora do caminho. Só o
             lote, e só quando cobre o MESMO id, tem direito de reverter o
             empate. */
          if (emLote[o.id]) return String(o.atualizadoEm || "") > String(emLote[o.id]);
          /* ⚠ "RECRIADO DEPOIS DE EXCLUIR" NÃO VALE PARA O FILHO DE OBRA APAGADA (revisão adversarial do OrçaPRO Cena,
             24/10/2026 — tools/test-bimcena-nuvem-rev.js [4]). A exclusão da obra grava as DUAS lápides: a da cascata e
             uma por registro (Store.excluirVarios). O registro editado noutro aparelho DEPOIS da exclusão (a "última
             cena" que a tela aberta lá regrava sozinha; o diário salvo offline) é mais novo que a lápide própria, e este
             `return true` o devolvia antes de a cascata ser consultada — órfão, apontando para obra que não existe, em
             todos os aparelhos. A regra da cascata logo abaixo ("filho de verdade: NÃO há ressalva") passa a decidir. */
          if (!(o.obraId && obrasMortas[o.obraId])) return true; // recriado depois de excluir → mantém
        }
        if (o.obraId && obrasMortas[o.obraId]) {
          /* cadastro da empresa (equipe, patrimônio, frota): a obra morreu, ele não. Faz aqui o
           * mesmo que a exclusão faz localmente — solta o vínculo — em vez de deixá-lo apontando
           * para uma obra que não existe. Antes ele era APAGADO, contra o que o modal promete. */
          if (imune) { o.obraId = ""; o.obraNome = ""; return true; }
          /* ⚠ o aditivo é julgado pelo CONTRATO pai, não pelo `obraId` que ele
             copiou ao nascer (ver o índice `contratosVivos` acima). Contrato
             vivo → o aditivo vive, mesmo que a obra do carimbo tenha morrido. */
          if (ent === "aditivos" && o.contratoId && contratosVivos[o.contratoId]) return true;
          /* filho de verdade: NÃO há ressalva. Se houvesse, uma edição feita no outro aparelho
           * depois da exclusão devolveria o registro para sempre — órfão, apontando para uma
           * obra que não existe mais e sem tela que o mostre. */
          return false;
        }
        if (ent === "obras" && obrasMortas[o.id]) return String(o.atualizadoEm || "") > String(obrasMortas[o.id]);
        /* o resultado morre com o teste que o gerou, a menos que ele seja MAIS
           NOVO que a lápide — o mesmo desempate do `obraId` logo acima, que
           deixa passar o registro editado depois da exclusão noutro aparelho. */
        if (o.testeId && testesMortos[o.testeId]) return String(o.atualizadoEm || "") > String(testesMortos[o.testeId]);
        /* mesmo desempate: o registro EDITADO depois da poda noutro aparelho
           volta — quem escreveu responsavel num conflito que aqui era só um
           `resolvido_auto` sem dono tem razão, e a poda aqui não sabia disso. */
        if (podados[o.id]) return String(o.atualizadoEm || "") > String(podados[o.id]);
        /* mesmo desempate, para o lote de qualquer entidade */
        if (emLote[o.id]) return String(o.atualizadoEm || "") > String(emLote[o.id]);
        return true;
      };
      /* ===== MERGE ESPECIAL POR CONSULTA NA HORA (planejador, Onda 0, T9) =====
         Entidade → NOME do módulo global que decide o conflito dela: o merge
         procura `global[nome].mergeNuvem` A CADA CHAMADA — os módulos NUNCA
         registram nada no Nuvem.
         ⚠ POR QUE TABELA FIXA E CONSULTA NA HORA (espec O19, risco R18): este
           arquivo carrega no index.html ~200 linhas DEPOIS do js/cronobase.js e
           dos módulos do planejador, e termina com `global.Nuvem = Nuvem` — um
           objeto NOVO. Um `Nuvem.registrarMerge(...)` feito pelo módulo morreria
           ali (ou lançaria, com o Nuvem ainda inexistente): em Node a suíte
           passaria e no navegador o ramo especial não existiria.
         ⚠ A TABELA MORA DENTRO DO `_merge`, e não no topo do arquivo: as
           suítes da lixeira do balde (tools/test-limpar-balde.js) recortam SÓ
           este método e o executam sozinho — uma referência ao topo virava
           ReferenceError lá. Fora do app (sem `global`), vale o "módulo
           ausente" abaixo.
         ⚠ AS DUAS ENTIDADES NUNCA GUARDAM CÓPIA DO PERDEDOR NEM CONTAM
           CONFLITO: `crono_selo` é imutável (o maior `atualizadoEm` vence, com a
           qualidade no milissegundo) e `crono_alt` é união por id (id igual →
           o mais novo). Uma cópia de 50 KB pendurada num selo de 300 KB
           estouraria o documento de 1 MiB — o mesmo defeito do `crono_obra`
           (ver o ramo abaixo). Com o módulo AUSENTE (cache velho, arquivo que
           não carregou), vale o mais novo, sem cópia — nunca o ramo genérico.
         Entidade fora da tabela: `esp` null, e o merge de sempre, linha a linha. */
      var MERGE_ESPECIAL = { crono_selo: "CronoSelo", crono_alt: "CronoAlt" };
      var esp = null;
      if (Object.prototype.hasOwnProperty.call(MERGE_ESPECIAL, ent)) {
        var modEsp = null;
        try { modEsp = (typeof global !== "undefined" && global) ? (global[MERGE_ESPECIAL[ent]] || null) : null; } catch (eMod) { modEsp = null; }
        var mnEsp = (modEsp && modEsp.mergeNuvem && typeof modEsp.mergeNuvem === "object") ? modEsp.mergeNuvem : null;
        esp = { nome: MERGE_ESPECIAL[ent], vencedor: (mnEsp && typeof mnEsp.vencedor === "function") ? mnEsp.vencedor : null,
          depois: (mnEsp && typeof mnEsp.depois === "function") ? mnEsp.depois : null };
      }
      Util.arr(cloud).forEach(function (o) { if (o && o.id && vivo(o)) byId[o.id] = o; });
      Util.arr(local).forEach(function (o) {
        if (!o || !o.id || !vivo(o)) return;
        var c = byId[o.id];
        if (!c) { byId[o.id] = o; return; }
        var tl = String(o.atualizadoEm || ""), tc = String(c.atualizadoEm || "");
        if (tl === tc) { byId[o.id] = o; return; } // mesma versão: sem conflito
        var venc = tl > tc ? o : c, perd = tl > tc ? c : o;
        /* ⚠ ENTIDADE COM MERGE ESPECIAL: o módulo decide quem vence, e NUNCA
           há cópia do perdedor nem conta de conflito (ver MERGE_ESPECIAL).
           Módulo ausente, ou que devolve algo que não é um dos dois lados, ou
           que lança: vale o mais novo — sem cópia, nunca o ramo genérico. */
        if (esp) {
          var vEsp = null;
          if (esp.vencedor) { try { vEsp = esp.vencedor(o, c); } catch (eV) { vEsp = null; } }
          byId[o.id] = (vEsp === o || vEsp === c) ? vEsp : venc;
          return;
        }
        /* Um dos lados ainda está na marca do último sync? Então SÓ o outro
           editou — propagação normal, o mais novo vence e ponto. O ramo de
           conflito fica reservado para o caso real: os dois saíram da marca. */
        var marca = String(marcas[o.id] || "");
        if (marca && (tl === marca || tc === marca)) { byId[o.id] = venc; return; }
        try {
          if (SEM_COPIA[ent]) {
            /* ⚠ SÓ O RESUMO — ver a tabela SEM_COPIA lá em cima, que traz a
               medição de cada uma das quatro. A cópia do perdedor entrava
               DEPOIS da porta que mantém o documento abaixo de 900 KB, sem
               passar por ela. O recado da tela NÃO diz "não se perdeu nada":
               aqui se perdeu, e a pessoa precisa conferir. */
            venc._conflitoDe = { em: perd.atualizadoEm || "", quando: new Date().toISOString(),
              resumo: _resumoPerdedor(ent, perd) };
            if (ent === "crono_obra") {
              venc._conflitoDe.obraId = String(perd.obraId || "");
              if (!self._conflitosCrono) self._conflitosCrono = [];
              self._conflitosCrono.push(String(perd.obraId || perd.id));
            } else {
              /* centro de custo: é desta lista que sai o recado próprio no
                 fim do sync (ver `nCc` no `_sincronizarAgora`). Ela existe
                 separada do contador geral porque o recado geral promete que
                 "a anterior ficou guardada dentro do registro" — e aqui não
                 ficou. */
              if (!self._conflitosCc) self._conflitosCc = [];
              self._conflitosCc.push(String(perd.obraId || perd.id));
            }
          } else {
            /* cópia SEM o _conflitoDe do perdedor: aninhar a cadeia inteira fazia
               o registro crescer a cada ida-e-volta (provado em Node: 2ª rodada
               já carregava 3 versões dentro de si) */
            var raso = perd;
            if (perd && perd._conflitoDe) { raso = Object.assign({}, perd); delete raso._conflitoDe; }
            var json = JSON.stringify(raso);
            venc._conflitoDe = (json.length <= 51200)
              ? { em: perd.atualizadoEm || "", quando: new Date().toISOString(), copia: raso }
              : { em: perd.atualizadoEm || "", quando: new Date().toISOString(), resumo: String(perd.nome || perd.numero || perd.id) };
          }
          self._conflitosUltimoMerge++;
        } catch (e) {}
        byId[o.id] = venc;
      });
      var listaM = Object.keys(byId).map(function (k) { return byId[k]; });
      /* o passo final do módulo (poda do histórico, descarte do que aponta
         para orçamento com lápide). ⚠ Só aceita LISTA de volta: um `depois`
         com defeito que devolvesse outra coisa gravaria o vazio por cima da
         entidade (memória "a forma no disco decide se sincroniza"). */
      if (esp && esp.depois) {
        try {
          var l2 = esp.depois(listaM, empresaId);
          if (Object.prototype.toString.call(l2) === "[object Array]") listaM = l2;
        } catch (eD) { try { console.warn("[nuvem] " + ent + ": o passo final do merge (" + esp.nome + ") falhou — a lista mesclada foi mantida", eD); } catch (_) {} }
      }
      return listaM;
    },

    // 1ª carga: baixa a nuvem, mescla com o local e grava nos dois (não perde nada).
    /* ============================================================
     * ⚠⚠ O DONO DO TENANT — a trava que faltava, e custou um incidente
     *
     * A conta da nuvem é derivada SÓ da chave de licença (`_credLicenca`), e o
     * `empresaId` local NÃO entra no caminho do Firestore. Consequência: duas
     * empresas com a mesma chave caíam no MESMO documento e o merge misturava
     * tudo — obras, equipe, conta do dono, foto — nos dois sentidos, sem uma
     * linha de aviso. Foi o que aconteceu em 27/08/2026 entre duas empresas
     * reais, depois que um aparelho já licenciado abriu um link `?lic=` de
     * outra licença e trocou de chave em silêncio.
     *
     * A partir daqui o tenant tem DONO gravado. Quem chega primeiro registra a
     * empresa; quem chega depois com outra identidade NÃO sincroniza — para,
     * avisa e deixa os dois lados intactos. Recusar a sincronização é sempre
     * recuperável; misturar as bases de duas empresas não é.
     *
     * ⚠ Não apaga nem move nada: é um portão de leitura antes do merge.
     * ============================================================ */
    DOC_DONO: "_dono",
    /* ⚠⚠ ONDE O NOME DA EMPRESA MORA DE VERDADE.
     *
     * A primeira versão disto lia `prefs.empresa` / `prefs.nomeEmpresa` — e
     * NINGUÉM no app inteiro grava esses dois campos. Esta linha era a única
     * referência a eles no repositório. Consequência: `empresa` saía SEMPRE
     * vazio, os dois ramos de contradição por nome viravam código morto, e a
     * trava toda encolhia para "e-mail de conta mestre contra e-mail" — que a
     * maioria dos clientes solo nem tem. Ou seja: o portão publicado para
     * separar duas empresas não separava quase ninguém.
     *
     * ⚠ E O TESTE NÃO VIA porque a fixture dele inventava `{empresa:'ACME'}`,
     *   um formato que o disco de nenhum cliente tem. Fixture que não imita a
     *   produção mede outra coisa — é a segunda vez no mesmo dia.
     *
     * O nome e o CNPJ vivem em `prefs.responsavelTecnico` (js/empresa.js). O
     * CNPJ é a melhor prova que existe aqui: é único por empresa, o cliente
     * digita uma vez e não muda. Vem primeiro. */
    _idDono: function (empresaId) {
      var nome = "", cnpj = "", email = "";
      try {
        var p = Store.lerPrefs(empresaId) || {};
        var rt = p.responsavelTecnico || {};
        nome = String(rt.nome || "").trim();
        cnpj = String(rt.cnpj || "").replace(/\D/g, "");
      } catch (e) {}
      try {
        if (typeof Auth !== "undefined" && Auth.contaMestre) { var c = Auth.contaMestre(empresaId) || {}; email = String(c.email || "").trim().toLowerCase(); }
      } catch (e2) {}
      return { empresaId: String(empresaId || ""), empresa: nome, cnpj: cnpj, email: email };
    },
    /* Devolve Promise<{ok:true}> ou Promise<{ok:false, dono:…}> — nunca rejeita:
       falha de rede aqui não pode barrar a sincronização de quem está certo. */
    _conferirDono: function (empresaId) {
      var self = this, meu = this._idDono(empresaId);
      /* ⚠ sem `db`/`uid` não há balde para conferir — e o portão NÃO pode ser o
         que derruba a sincronização. Guarda que explode é pior que guarda que
         falta: aqui ela reprovaria quem está certo, com um TypeError. */
      if (!this.db || !this.uid) return Promise.resolve({ ok: true });
      return this.db.collection("empresas").doc(this.uid).collection("dados").doc(this.DOC_DONO).get()
        .then(function (snap) {
          var dono = snap.exists ? (snap.data() || {}).v : null;
          if (!dono || !dono.empresaId) {
            /* tenant novo (ou de antes desta trava): este aparelho o assume */
            return self.db.collection("empresas").doc(self.uid).collection("dados").doc(self.DOC_DONO)
              .set({ v: meu, em: Date.now() }).then(function () { return { ok: true, assumiu: true }; })
              .catch(function () { return { ok: true }; });
          }
          /* ⚠⚠ BLOQUEIA POR PROVA, NUNCA POR FALTA DE PROVA.
           *
           * A primeira versão desta função reprovava quando não achava
           * semelhança — e isso teria derrubado a sincronização de CLIENTE
           * LEGÍTIMO. O `empresaId` nasce local e difere entre aparelhos da
           * mesma empresa; a conta mestre pode nem existir (uso solo); o nome
           * da empresa pode estar em branco. Nesses casos não há contradição
           * nenhuma, só ignorância — e ignorância não pode trancar ninguém
           * fora dos próprios dados. Seriam 38 empresas sem sincronizar por
           * causa de uma trava criada para proteger duas.
           *
           * Então: qualquer indício de que é a MESMA empresa libera; só uma
           * contradição EXPLÍCITA (dois e-mails de dono diferentes, ou dois
           * nomes de empresa diferentes) fecha o portão. É o caso do incidente
           * — lá os dois lados tinham e-mail, e eram outros. */
          function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
          /* ⚠ A ADOÇÃO SÓ VALE PARA O MESMO APARELHO/LINHAGEM.
           *
           * A versão anterior deixava QUALQUER aparelho com identidade gravar
           * por cima de um dono anônimo. Isso invertia o portão: o intruso que
           * cai na chave alheia e tem conta mestre vira DONO registrado, e o
           * cliente legítimo — que ainda não tinha configurado admin — passa a
           * ser BLOQUEADO do próprio balde, lendo na tela que a licença dele
           * "já é usada por" o e-mail do intruso. A vítima levava a punição.
           *
           * Aqui a régua é: o registro só ganha identidade pelo aparelho que
           * JÁ CONSTA como dono (mesmo `empresaId`). Ele não está tomando
           * posse — está completando a própria ficha. */
          if (dono.empresaId && meu.empresaId && dono.empresaId === meu.empresaId) {
            var faltaFicha = (!dono.email && meu.email) || (!dono.empresa && meu.empresa) || (!dono.cnpj && meu.cnpj);
            if (faltaFicha) {
              return self.db.collection("empresas").doc(self.uid).collection("dados").doc(self.DOC_DONO)
                .set({ v: meu, em: Date.now() }).then(function () { return { ok: true, adotou: true }; })
                .catch(function (e) { try { self._registrarFalha(self.DOC_DONO, e); } catch (_) {} return { ok: true }; });
            }
            return { ok: true };
          }
          /* CNPJ primeiro: é único por empresa e o cliente digita uma vez só */
          if (meu.cnpj && dono.cnpj) return norm(meu.cnpj) === norm(dono.cnpj) ? { ok: true } : { ok: false, dono: dono, meu: meu };
          if (meu.email && dono.email) return norm(meu.email) === norm(dono.email) ? { ok: true } : { ok: false, dono: dono, meu: meu };
          if (meu.empresa && dono.empresa) return norm(meu.empresa) === norm(dono.empresa) ? { ok: true } : { ok: false, dono: dono, meu: meu };
          return { ok: true, semProva: true };   // nem a favor nem contra: passa
        })
        .catch(function () { return { ok: true }; });   // sem rede: não bloqueia quem está certo
    },
    /* motivo do último bloqueio, para a tela explicar sem adivinhar */
    bloqueioDeDono: null,

    sincronizar: function (empresaId) {
      if (_ehPrevia(empresaId)) return Promise.resolve(false);   // prévia nunca sobe
      var self = this;
      if (!this.ligado) return Promise.resolve(false);
      return this._conferirDono(empresaId).then(function (v) {
        if (v && v.ok === false) {
          self.bloqueioDeDono = v;
          /* ⚠ FECHA O QUE JÁ ESTÁ ABERTO. Barrar `escutar` só impede abrir
             ouvinte NOVO; os que o boot abriu continuam vivos e seguem
             despejando a base da outra empresa neste aparelho a cada alteração
             lá. Meia porta é porta aberta — e era o próprio defeito que este
             portão veio fechar. */
          try { self._un.forEach(function (u) { try { u(); } catch (_) {} }); self._un = []; self._escutando = null; } catch (eU) {}
          try {
            /* ⚠ NÃO expor dado de terceiro. Antes o aviso mostrava o e-mail do
               administrador da OUTRA empresa na tela deste cliente — e como o
               nome vinha sempre vazio, era SEMPRE o e-mail. Para agir, basta ele
               saber que a chave é de outra empresa. */
            var quem = v.dono.empresa ? ("“" + v.dono.empresa + "”") : "outra empresa";
            if (typeof UI !== "undefined" && UI.toast) {
              UI.toast("Sincronização BLOQUEADA: esta licença já é usada por " + quem
                + ". Nada foi misturado. Use uma licença própria neste aparelho.", "erro");
            }
          } catch (eT) {}
          return false;
        }
        self.bloqueioDeDono = null;
        return self._sincronizarAgora(empresaId);
      });
    },
    /* ⚠ O SINCRONIZAR NÃO ESPERA A CONFIRMAÇÃO DO SERVIDOR PARA SEMPRE (revisão adversarial, 20/10/2026, 1.2.162 —
       tools/test-nuvem-fila-oom.js [5]). O SDK repete sem fim a gravação que o servidor não confirma por erro
       passageiro (cota estourada, rede caindo, envio grande demais para a conexão) — a promessa nunca termina. E o
       boot (js/app.js, _conectarNuvemLicenca) só liga os ouvintes DEPOIS do sincronizar: uma gravação presa — e as
       lápides vão primeiro, então bastava a delas — deixava o aparelho sem ouvinte nenhum a sessão inteira, com a tela
       sem saber (a vigia de 20/10 viu "0 ouvintes"). Passado o teto, o sincronizar segue com a entidade como FALHA
       ("sem-confirmacao"), nunca como sincronizada; a gravação continua na fila do SDK (não se manda outra: a fila da
       entidade junta) e, se o servidor recusar depois, a marca de "já subiu" cai e a falha é registrada. */
    TETO_CONFIRMA_SYNC: 30000,
    /* ⚠ E A CONFIRMAÇÃO QUE CHEGA DEPOIS DO TETO TIRA A FALHA (23/10/2026). A vigia de 21–23/10 (diag/memoria-*.jsonl)
       mostrou, em TODA abertura, ~60 gravações no ar aos 20 s, 20–35 "sem-confirmacao" aos 40 s e a fila zerada
       (nuvemNoAr 0) entre 120 e 190 s — o servidor confirmava todas, só que depois dos 30 s. A falha ficava registrada
       para sempre (nuvemFalhas 20–35 a sessão inteira, crono_alt de 6,5 KB entre elas) e o recado dizia "não subiram".
       Recado que mente. Agora: confirmou depois → a falha desta gravação sai; recusou depois → fica a recusa de
       verdade, com o código do servidor. */
    _esperarConfirmacao: function (ent, pW, ck, tam) {
      var self = this, acabou = false;
      return new Promise(function (resolver, rejeitar) {
        var tm = setTimeout(function () {
          if (acabou) return;
          acabou = true;
          var regP = self._registrarFalha(ent, { code: "sem-confirmacao", message: "o servidor ainda não confirmou a gravação (a subida continua na fila)" }, tam);
          Promise.resolve(pW).then(function () { self._tirarFalha(regP); }, function (e) {
            self._tirarFalha(regP);
            if (self._ultimoEnviado[ck] !== undefined) delete self._ultimoEnviado[ck];
            self._registrarFalha(ent, e, tam);
          });
          resolver("pendente");
        }, self.TETO_CONFIRMA_SYNC);
        Promise.resolve(pW).then(function () {
          if (acabou) return;
          acabou = true; clearTimeout(tm); resolver(true);
        }, function (e) {
          if (acabou) return;
          acabou = true; clearTimeout(tm); rejeitar(e);
        });
      });
    },
    _sincronizarAgora: function (empresaId) {
      var self = this;
      self._conflitosUltimoMerge = 0;
      self._conflitosCrono = [];
      self._conflitosCc = [];
      self._ilegiveisUltimoSync = [];
      self._naoCarregadasUltimoSync = [];
      var falhou = 0, tentadas = 0, pendentes = 0;
      var uma = function (ent) {
        tentadas++;
        /* ⚠ O TAMANHO DA CARGA VIVE AQUI, FORA DO `then` (revisão adversarial
           da Onda 0 do planejador, achado 2). Roteiro do defeito: a T16 ensinou
           o `push` a dizer o tamanho da carga recusada, e o `estado()` passou a
           separar "formato recusado" (lista dentro de lista, carga pequena) de
           "lista grande demais" — mas só com o tamanho em mãos. Este caminho,
           que roda a CADA conexão, registrava a falha sem ele: a mesma recusa
           por lista aninhada (80 bytes) saía como `listaGrandeDemais`, e a
           pessoa ouvia "faça backup e fale com o suporte sobre tamanho".
           `null` = a falha veio antes de a carga existir (a leitura da nuvem),
           e aí o tamanho não vai — não se inventa um.
           Prova: tools/test-nuvem-push-falha.js, bloco [1b] (CN: sem o
           tamanho no catch → reprova). */
        var cargaU = null;
        return self._doc(ent).get().then(function (snap) { return self._valorDoSnap(ent, snap); }).then(function (rc) {
          return self._v2ouAntigo(ent, rc); }).then(function (rc) {   /* ⚠ DOC_V2: o `~v2` ainda não existe → lê o antigo */
          var cloud = rc.existe ? daNuvem(ent, rc.v) : null;
          var local = lerEnt(empresaId, ent);
          /* ⚠ ver `naoCarregadaLocal`: nem merge, nem marca, nem subida */
          if (naoCarregadaLocal(empresaId, ent)) {
            falhou++;
            self._naoCarregadasUltimoSync.push(ent);
            self._registrarFalha(ent, { code: "dado-local-nao-carregado", message: "os dados desta entidade ainda não carregaram do banco do aparelho" });
            return false;
          }
          /* ⚠ ver `ilegivelLocal`: nem merge, nem marca, nem subida */
          if (ilegivelLocal(empresaId, ent)) {
            falhou++;
            self._ilegiveisUltimoSync.push(ent);
            self._registrarFalha(ent, { code: "dado-local-ilegivel", message: "o conteúdo desta entidade neste aparelho não abre (arquivo corrompido)" });
            return false;
          }
          var merged = self._merge(local, cloud, ent, empresaId);
          /* cercado: o gravar está monkey-patched e, sem a cerca, dispararia um
             push por entidade — 27 escritas extras a cada sincronização */
          self._aplicandoDaNuvem = true;
          try { Store.adapter.gravar(empresaId, ent, merged); }
          finally { self._aplicandoDaNuvem = false; }
          /* ⚠ v1.1.235 — A MARCA TAMBÉM NASCE AQUI. Ela só era gravada no
             push deste aparelho; quem apenas RECEBIA (o celular que abre o app
             depois de o escritório trabalhar) nunca tinha marca, a guarda do
             _merge não valia e o falso "editado em 2 aparelhos" continuava
             aparecendo — exatamente o que a v1.1.232 anunciou ter fechado.
             A base comum é o que ficou igual nos DOIS lados, não só o que
             este aparelho subiu. */
          /* ⚠ ...MAS SÓ O QUE JÁ ESTÁ IGUAL NA NUVEM (ver `_marcarSync`): o resto avança quando o servidor confirmar */
          self._marcarSync(empresaId, ent, merged, cloud);
          /* o que SOBE é a forma guardada (ver `paraNuvem`); o tamanho que
             o aviso mede e o "nada mudou" comparam esta mesma carga */
          var subir = paraNuvem(ent, merged);
          var carga = "";
          try { carga = JSON.stringify(subir); } catch (e) { carga = ""; }
          cargaU = carga;
          /* nada mudou dos dois lados? não sobe. Antes subia sempre, e o
             `em: Date.now()` fazia o outro aparelho reagir a uma escrita que
             não trazia dado nenhum — o começo do laço. */
          var ck = empresaId + "|" + ent;
          /* ⚠ ...a não ser que a nuvem esteja num documento só e a lista daqui precise de partes: alguém (o aparelho
             antigo) gravou por cima do principal — ver `_nuvemSemMinhasPartes` */
          /* ⚠ ...nem quando o `~v2` ainda não existe (DOC_V2, `doAntigo`): a carga igual à última enviada não prova que ele foi criado */
          /* ⚠ ...e, no DOC_V2, nem quando a nuvem ficou sem algum registro daqui (outro aparelho gravou por cima — ver `_nuvemCobre`) */
          if (carga && !rc.doAntigo && self._ultimoEnviado[ck] === carga && !self._nuvemSemMinhasPartes(ent, rc, subir, carga.length) &&
              (!DOC_V2[ent] || self._nuvemCobre(cloud, merged))) return true;
          /* ⚠ E A NUVEM EM PARTES JÁ IGUAL AO QUE SUBIRIA: não sobe (revisão adversarial 2, 19/10/2026 —
             test-nuvem-partes [15]). O `_ultimoEnviado` vive só na memória: a cada abertura do app, cada lista grande
             subia INTEIRA de novo (5 MB do bim_edicoes, ~11 MB nas quatro), e cada subida fazia todo aparelho que escuta
             baixar todas as partes outra vez — tráfego e leituras por abertura, sem dado novo nenhum. Só para o
             principal em partes: as entidades de um documento só seguem exatamente como sempre. */
          if (carga && rc.partes > 0) {
            var cargaNuvem = null;
            try { cargaNuvem = JSON.stringify(rc.v); } catch (eC) { cargaNuvem = null; }
            if (cargaNuvem === carga) { self._ultimoEnviado[ck] = carga; return true; }
          }
          /* ⚠ o MESMO aviso de tamanho do push (revisão 3, lente sync): o que
             o merge grava e sobe aqui nunca passava por ele — o documento
             podia crescer por conflito até o teto do Firestore sem nenhum recado.
             Vem ANTES do "não sobe" abaixo: a lista grande que só CHEGOU (igual à nuvem) também avisa. */
          self._avisarTamanho(ent, carga);
          self._ultimoEnviado[ck] = carga;
          /* ⚠ A NUVEM JÁ TEM EXATAMENTE ISTO: NÃO SOBE (23/10/2026) — para TODA entidade, e comparando o CONTEÚDO.
             Roteiro do defeito: o "nada mudou" acima mora só na memória (`_ultimoEnviado`), e a conferência das partes
             compara o texto JSON — e o Firestore devolve os campos de cada mapa na ordem dele, não na do aparelho, então
             ela quase nunca batia. Resultado medido (tools/medir-nuvem-envio.js no backup do Rogério de 23/10 06:20):
             CADA abertura do app regravava as 60 entidades com dado, 23,8 MiB no fio (o JSON do protocolo passa por
             encodeURIComponent: 2,7x a carga), num canal de escrita que confirma NA ORDEM — o crono_alt de 6,5 KB
             esperava atrás de orcamentos/bim_edicoes/bim_vistas/bim_familias (2,2 MB, 1,9, 1,4, 2,0) e passava dos 30 s
             do teto. Agora: a nuvem (o que o SERVIDOR confirmou — nada pendente nela nem na fila desta entidade) aberta é
             igual à lista mesclada, campo a campo e sem olhar a ordem das chaves → não sobe, e a base comum avança
             inteira (é igual dos dois lados). Diferente em qualquer coisa → sobe como sempre.
             ⚠ Nunca no `doAntigo` (o `~v2` ainda precisa nascer) nem quando a nuvem está num documento só e a lista
             precisa de partes (ver `_nuvemSemMinhasPartes`). */
          if (carga && rc.existe && !rc.doAntigo && !rc.pend && !self._temNoAr(ent) &&
              !self._nuvemSemMinhasPartes(ent, rc, subir, carga.length) && self._mesmoConteudo(cloud, merged)) {
            self._marcarSync(empresaId, ent, merged);
            return true;
          }
          var pW = self._escreverEnt(ent, subir, carga.length);
          /* DOC_V2: a gravação do `~v2` foi CHAMADA (já com a união do antigo) — daqui em diante o push pode gravar */
          if (DOC_V2[ent]) self._v2Ok(ent, false);
          Promise.resolve(pW).then(function () { self._marcarSync(empresaId, ent, merged); }, function () {});
          return self._esperarConfirmacao(ent, pW, ck, carga.length).then(function (r) {
            if (r === "pendente") { pendentes++; return false; }
            return true;
          });
        }).catch(function (e) {
          /* NÃO engolir: 32 de 32 entidades reprovadas viravam "sincronizado". */
          falhou++;
          delete self._ultimoEnviado[empresaId + "|" + ent];
          self._registrarFalha(ent, e, cargaU == null ? undefined : cargaU.length);
          return false;
        });
      };
      // as LÁPIDES vêm primeiro: as demais entidades consultam essa lista para não
      // ressuscitar o que já foi excluído em outro aparelho
      return uma("_lapides").then(function () {
        Store.podarLapidesDe(empresaId); // o teto só valia nas exclusões locais
        return Promise.all(ENTIDADES.filter(function (e) { return e !== "_lapides"; }).map(uma));
      }).then(function () {
        /* ⚠ o planejamento da obra tem recado PRÓPRIO: lá a versão perdedora
           não é guardada (ver _merge), e "não se perdeu nada" seria recado que
           mente — a pessoa precisa conferir o plano das obras que vieram aqui */
        var nCrono = (self._conflitosCrono || []).length;
        var nGeral = self._conflitosUltimoMerge - nCrono;
        /* ⚠ O CENTRO DE CUSTO SAI DO RECADO GERAL PELO MESMO MOTIVO DO
           CRONOGRAMA: lá a cópia do perdedor também não é guardada, e dizer
           "não se perdeu nada" sobre uma decisão de apropriação é mentir
           sobre dinheiro — quem lê para de conferir. */
        var nCc = (self._conflitosCc || []).length;
        nGeral -= nCc;
        if (nCc > 0) {
          try {
            if (global.UI && global.UI.toast) global.UI.toast("⚠ " + nCc + " registro(s) de centro de custo foram editados em 2 aparelhos ao mesmo tempo — valeu a versão gravada por último, e a do outro aparelho NÃO foi guardada. Abra Centros de Custo e confira.", "erro");
          } catch (eC) {}
        }
        if (nGeral > 0) {
          try {
            if (global.UI && global.UI.toast) global.UI.toast("⚠ " + nGeral + " registro(s) editados em 2 aparelhos ao mesmo tempo — a versão mais recente venceu e a anterior ficou guardada dentro do registro (não se perdeu nada).", "erro");
          } catch (e) {}
        }
        if (nCrono > 0) {
          var obrasC = {}, qtdObras = 0;
          self._conflitosCrono.forEach(function (x) { if (!obrasC[x]) { obrasC[x] = 1; qtdObras++; } });
          try {
            if (global.UI && global.UI.toast) global.UI.toast("⚠ O cronograma de " + qtdObras + " obra(s) foi editado em 2 aparelhos ao mesmo tempo — valeu a versão gravada por último, e a do outro aparelho NÃO foi guardada (o plano de execução da obra é um registro só). Abra o cronograma dessas obras e confira o plano.", "erro");
          } catch (e2) {}
        }
        /* Devolve FALSO quando tudo falhou. Antes devolvia `true` mesmo com as
           32 entidades reprovadas, e quem chamou anunciava "☁ Sincronizado!"
           sem um único byte ter subido. */
        if (falhou + pendentes >= tentadas && tentadas > 0) return false;
        /* ⚠ AINDA SUBINDO NÃO É "NÃO SUBIU" (23/10/2026): a gravação está no canal e o servidor confirma em seguida
           (ver `_esperarConfirmacao`); o recado de falha é só para a falha de verdade */
        if (pendentes > 0) {
          try {
            if (global.UI && global.UI.toast) global.UI.toast("☁ " + pendentes + " de " + tentadas + " partes ainda estão subindo para a nuvem (a conexão está lenta). O trabalho está salvo neste aparelho; a confirmação chega sozinha.", "ok");
          } catch (eP) {}
        }
        /* ⚠ a parte ilegível NÃO "vai de novo sozinha": sem a pessoa agir, ela
           fica parada para sempre — o recado geral mentiria sobre ela */
        var nIleg = (self._ilegiveisUltimoSync || []).length;
        /* a parte trancada (o banco do aparelho ainda carregando) entra na
           conta do "vai de novo sozinho" — e é verdade: destrancou, sincroniza */
        if (falhou > 0) {
          try {
            if (global.UI && global.UI.toast) {
              if (falhou > nIleg) global.UI.toast("☁ Sincronização parcial: " + (falhou - nIleg) + " de " + tentadas + " partes não subiram" + ((self._naoCarregadasUltimoSync || []).length ? " (" + self._naoCarregadasUltimoSync.length + " ainda carregando do aparelho)" : "") + ". O trabalho está salvo neste aparelho e vai de novo sozinho.", "erro");
              if (nIleg) global.UI.toast("☁ " + nIleg + " parte(s) NÃO sincronizam: " + self._ilegiveisUltimoSync.join(", ") + " — o conteúdo delas neste aparelho está ilegível (arquivo corrompido) e foi guardado à parte. Restaure o backup (💾); depois disso a nuvem volta a sincronizar essa parte.", "erro", 16000);
            }
          } catch (e) {}
        }
        return true;
      });
    },

    // Escuta mudanças vindas de OUTRO aparelho e atualiza o local + re-render.
    escutar: function (empresaId, onChange) {
      if (_ehPrevia(empresaId)) return;                          // nem escuta
      var self = this;
      if (!this.ligado) return;
      /* ⚠ tenant de OUTRA empresa: não escuta. Bloquear só o `sincronizar`
         fecharia meia porta — o ouvinte ao vivo continuaria despejando a base
         alheia aqui a cada alteração lá. */
      if (this.bloqueioDeDono) return;

      /* IDEMPOTENTE — sem isto, cada chamada empilhava um jogo INTEIRO de
       * listeners nos MESMOS documentos, e nada era cancelado. São três os
       * caminhos que chamam: o boot (_conectarNuvemLicenca), o login (entrar) e
       * o botão "Sincronizar agora" (abrirNuvem) — este último sem guarda
       * nenhuma, ou seja, cada clique somava outro jogo.
       *
       * Reproduzido no navegador com 27 entidades: boot 27 → login 54 →
       * 1º clique 81 → 2º clique 108 listeners, ZERO cancelamentos. E o custo
       * não é só memória: cada callback duplicado dispara um _lapides.get() de
       * REDE (linha ~222), então uma sincronização com 4 jogos vira uma rajada
       * de ~104 leituras. É assim que o SDK acaba anunciando
       * "Using maximum backoff delay to prevent overloading the backend" —
       * a partir daí ele só tenta de minuto em minuto, e a sincronização do
       * cliente fica lenta ou para.
       *
       * Reescutar o MESMO tenant é no-op; trocar de tenant cancela o anterior
       * (senão o aparelho continuaria recebendo dados da empresa antiga). */
      if (this._escutando === empresaId && this._un.length) return;
      if (this._un.length) {
        this._un.forEach(function (u) { try { u(); } catch (e) {} });
        this._un = [];
      }
      this._escutando = empresaId;
      /* As lápides precisam estar em dia ANTES de mesclar qualquer entidade — senão o
       * aparelho ainda não sabe o que foi apagado, aceita o registro velho e o reempurra
       * pra nuvem (ressurreição em pingue-pongue). Por isso a escuta de cada entidade
       * baixa as lápides primeiro; e o push manda "_lapides" na frente, sem debounce. */
      /* `_aplicandoDaNuvem` cerca TODA gravação de dado que veio de fora, para
       * o patch do Store não empurrar de volta. Sem esta cerca aqui — e a
       * daquele get de lápides logo abaixo era a pior delas, porque rodava a
       * cada snapshot de cada uma das outras entidades — dois aparelhos ligados
       * entram num laço de escrita que não converge. */
      var deFora = function (ent2, valor) {
        /* ⚠ ver `ilegivelLocal` (a leitura que renovou a marca é do chamador) */
        if (ilegivelLocal(empresaId, ent2) || naoCarregadaLocal(empresaId, ent2)) return;
        self._aplicandoDaNuvem = true;
        try { Store.adapter.gravar(empresaId, ent2, valor); }
        finally { self._aplicandoDaNuvem = false; }
        // v1.1.235 — aplicado da nuvem = nova base comum (ver nota no sincronizar)
        self._marcarSync(empresaId, ent2, valor);
      };
      var comLapides = function (fn) {
        return self._doc("_lapides").get().then(function (s) { return self._valorDoSnap("_lapides", s); }).then(function (rl) {
          if (rl.existe) deFora("_lapides", self._merge(Store.adapter.ler(empresaId, "_lapides", []), rl.v, "_lapides", empresaId));
        }).catch(function () {}).then(fn);
      };
      ENTIDADES.forEach(function (ent) {
        var un = self._doc(ent).onSnapshot(function (snap) {
          if (!snap.exists) return;
          if (snap.metadata && snap.metadata.hasPendingWrites) return; // ignora o eco do próprio write
          if (DOC_V2[ent] && !(snap.metadata && snap.metadata.fromCache)) self._v2Ok(ent, true);   // o `~v2` existe na nuvem
          /* EM PARTES (1.2.158): o valor vem de _valorDoSnap (junta as partes da `rev` do principal). Enquanto junta,
             pode chegar um snapshot mais novo: o mais velho é descartado (nunca aplica por cima do mais novo). */
          var seqS = (self._seqSnap[ent] = (self._seqSnap[ent] || 0) + 1);
          self._valorDoSnap(ent, snap).then(function (rs) {
          if (seqS !== self._seqSnap[ent] || !rs.existe) return;
          var cloud = daNuvem(ent, rs.v);
          var aplicar = function () {
            var local = lerEnt(empresaId, ent);
            if (ilegivelLocal(empresaId, ent)) return;   // ⚠ ver `ilegivelLocal`
            if (naoCarregadaLocal(empresaId, ent)) return;   // ⚠ ver `naoCarregadaLocal`
            var merged = self._merge(local, cloud, ent, empresaId);
            /* nada mudou depois do merge? então não grava e não avisa a tela —
               gravar aqui acionaria o patch e reabriria o caminho do laço */
            var a = "", b = "";
            try { a = JSON.stringify(local); b = JSON.stringify(merged); } catch (e) { a = "x"; b = "y"; }
            /* ⚠ a nuvem num documento só e a lista daqui precisando de partes: o aparelho antigo gravou por cima do
               principal — reenvia (ver `_nuvemSemMinhasPartes`). Não é pingue-pongue: o antigo, ao ver o principal
               em partes, lê `v` vazio, une e não muda nada; só regrava na próxima abertura dele. */
            var repor = function () {
              var vRep = merged; try { vRep = paraNuvem(ent, merged); } catch (eR) {}
              if (self._nuvemSemMinhasPartes(ent, rs, vRep, b.length)) { delete self._ultimoEnviado[empresaId + "|" + ent]; self.push(empresaId, ent); }
            };
            if (a === b) { repor(); return; }
            deFora(ent, merged);
            if (typeof onChange === "function") onChange(ent);
            repor();
          };
          if (ent === "_lapides") aplicar(); else comLapides(aplicar);
          })["catch"](function (eS) { self._registrarFalha(ent, eS); });
        }, function (err) {
          /* handler de erro VAZIO era o que escondia a parada: o SDK encerra o
             listener de vez em permission-denied e em resource-exhausted, e o
             app seguia mostrando "conectado" para sempre. */
          self._registrarFalha(ent, err);
        });
        self._un.push(un);
      });
    },

    /* ---------- ESTADO HONESTO DA SINCRONIZAÇÃO ----------
     * Sem isto o app dizia "☁ Sincronizado!" sem ter feito uma única leitura
     * ou escrita. Agora toda falha fica registrada e a tela tem o que mostrar. */
    _falhas: [],
    _registrarFalha: function (ent, err, tamCarga) {
      /* a gravação da conta ANTERIOR parada na troca (ver `_escreverEntVez`) não é falha da conta que está aberta: só o
         console, senão a tela da empresa nova acusaria "não subiu" sobre o que nem é dela */
      if (err && err.code === "conta-trocou") { try { console.warn("[nuvem] " + ent + ": conta-trocou"); } catch (eW) {} return null; }
      var cod = (err && (err.code || err.message)) || "erro";
      /* guarda também a mensagem: o Firestore diz "invalid-argument" no
         `code` para várias coisas, e só o texto separa documento grande demais
         de campo mal formado — e são duas conversas diferentes com o usuário.
         `tam` (Onda 0 do planejador, T16) = o tamanho da carga que foi
         recusada, quando quem registra o sabe: é o que separa "formato
         recusado" de "lista grande demais" no `estado()`. */
      var reg = { entidade: ent, codigo: String(cod), msg: String((err && err.message) || "") };
      if (typeof tamCarga === "number" && isFinite(tamCarga)) reg.tam = tamCarga;
      this._falhas.push(reg);
      if (this._falhas.length > 40) this._falhas.shift();
      try { console.warn("[nuvem] " + ent + ": " + cod); } catch (e) {}
      return reg;
    },
    /* tira UMA falha registrada (a mesma, por referência) — a "sem-confirmacao" quando a confirmação chega depois */
    _tirarFalha: function (reg) {
      var f = this._falhas || [];
      for (var i = f.length - 1; i >= 0; i--) if (f[i] === reg) { f.splice(i, 1); return true; }
      return false;
    },
    /* Resumo para a tela: quantas falhas e de que tipo. `cota` é o caso que
     * derruba a sincronização do cliente inteiro e precisa de nome próprio. */
    estado: function () {
      var f = this._falhas || [];
      var cota = f.some(function (x) { return /resource-exhausted|RESOURCE_EXHAUSTED|quota/i.test(x.codigo); });
      var permissao = f.some(function (x) { return /permission-denied/i.test(x.codigo); });
      /* ⚠ DOCUMENTO GRANDE DEMAIS TAMBÉM É SINCRONIZAÇÃO PARADA. O Firestore
         recusa documento acima de 1 MiB com `invalid-argument`, e só aquela
         entidade para — mas para de vez, porque o `_ultimoEnviado` é limpo e
         toda tentativa seguinte refalha. Sem estar aqui, `ok` continuava true e
         a tela dizia "Sincronizado" com a lista de conflitos parada no
         aparelho. Mesmo modo de falha do bloqueio, por um caminho novo. */
      /* ⚠ FORMATO RECUSADO NÃO É LISTA GRANDE (planejador, Onda 0, T16). O
         Firestore responde `invalid-argument` também para lista dentro de
         lista (regra O18) — e com a carga BEM abaixo de 900 KB. Contar isso
         como "grande demais" mandava a pessoa fazer backup e falar com o
         suporte sobre tamanho, quando o que parou foi a FORMA de um registro.
         A régua: `invalid-argument` com a carga conhecida e abaixo de 900 KB,
         sem texto de tamanho na mensagem, é formato. Os dois continuam
         derrubando o `ok`. */
      function ehFormato(x) {
        var txt = x.codigo + " " + (x.msg || "");
        return /invalid-argument/i.test(txt) && !/too large|exceeds the maximum|maximum size/i.test(txt) &&
          typeof x.tam === "number" && x.tam < 900 * 1024;
      }
      var formato = f.some(ehFormato);
      var grande = f.some(function (x) { return !ehFormato(x) && /invalid-argument|too large|exceeds the maximum|maximum size/i.test(x.codigo + " " + (x.msg || "")); });
      /* ⚠ O BLOQUEIO TEM DE APARECER AQUI. Ele não passa por `_registrarFalha`,
         então `falhas` continuava 0 e `ok` continuava true — e a tela dizia
         "Conectado, sincronizam sozinhos" com o aparelho sem sincronizar nada.
         É o mesmo modo de falha que "anunciar sucesso só com sucesso" já tinha
         fechado, reaberto por um caminho novo. */
      var bloq = this.bloqueioDeDono || null;
      return {
        ligado: !!this.ligado,
        autenticado: !!(this.auth && this.auth.currentUser),
        escutando: !!(this._un && this._un.length),
        falhas: f.length,
        cotaEstourada: cota,
        semPermissao: permissao,
        listaGrandeDemais: grande,
        formatoRecusado: formato,
        bloqueadoOutraEmpresa: !!bloq,
        /* entidades paradas no último sync por conteúdo local ilegível: quem
           anuncia "Sincronizado!" confere aqui antes */
        dadoLocalIlegivel: (this._ilegiveisUltimoSync || []).slice(),
        /* entidades paradas por ainda não terem carregado do banco do aparelho */
        dadoLocalNaoCarregado: (this._naoCarregadasUltimoSync || []).slice(),
        donoDoBalde: bloq ? (bloq.dono && (bloq.dono.empresa || "")) : "",
        ok: !!this.ligado && !bloq && !!(this._un && this._un.length) && !cota && !permissao && !grande && !formato
      };
    },

    /* Monkey-patch: toda gravação do Store também empurra pra nuvem.
     *
     * ⚠ `_aplicandoDaNuvem` é o que impede o PINGUE-PONGUE INFINITO. O que
     * acontecia com dois aparelhos do mesmo cliente ligados — computador e
     * celular, exatamente o cenário que o app passou a incentivar:
     *
     *   A grava algo → sobe → B recebe o snapshot → B chama gravar(merged) →
     *   este patch empurra de volta → A recebe → A grava → empurra → …
     *
     * e não parava nunca, porque o documento carrega `em: Date.now()` e por
     * isso MUDA a cada volta, mesmo sem nenhum dado novo. No `_lapides`, que
     * subia sem espera nenhuma, isso virava várias escritas por segundo no
     * MESMO documento — muito acima do que o Firestore aceita (≈1/s por
     * documento). O servidor responde RESOURCE_EXHAUSTED, e é literalmente o
     * único caso em que o SDK escreve no console
     * "Using maximum backoff delay to prevent overloading the backend".
     * Daí em diante o cliente para de sincronizar — e a tela continuava
     * dizendo "✅ Conectado".
     *
     * Dado que veio da nuvem não volta para a nuvem. Ponto. */
    _aplicandoDaNuvem: false,

    _patch: function () {
      if (this._patched) return; this._patched = true;
      var self = this, orig = Store.adapter.gravar.bind(Store.adapter);
      Store.adapter.gravar = function (empresaId, entidade, valor) {
        var ok = orig(empresaId, entidade, valor);
        if (ok && self.ligado && !self._aplicandoDaNuvem && ENTIDADES.indexOf(entidade) >= 0) self.push(empresaId, entidade);
        return ok;
      };
    },

    /* Empurra uma entidade pra nuvem (debounce por entidade).
     *
     * SEGUNDA TRAVA, independente da primeira: só escreve se o conteúdo mudou
     * de verdade. Guardamos a última carga enviada por entidade e comparamos —
     * escrita que não muda nada é escrita que só serve para gastar cota e
     * acordar o outro aparelho. Com isto, mesmo que algum caminho novo escape
     * do `_aplicandoDaNuvem`, o laço morre na primeira volta.
     *
     * As LÁPIDES continuam na frente das demais (a exclusão precisa chegar
     * antes da lista sem os registros, senão o outro aparelho devolve tudo
     * achando que só sumiu), mas não mais SEM espera: 150 ms bastam para vir
     * à frente e já respeitam o limite por documento. */
    _ultimoEnviado: {},
    /* uma vez por entidade por sessão: aviso que aparece a cada push vira ruído
       e a pessoa para de ler justamente o que precisa ler */
    _avisouTamanho: {},

    push: function (empresaId, ent) {
      /* ⚠ e não SOBE para tenant de outra empresa: a metade de ida do mesmo
         portao. Sem isto, o bloqueio pararia de trazer e continuaria mandando. */
      if (this.bloqueioDeDono) return;
      if (_ehPrevia(empresaId)) return Promise.resolve(false);   // nem lápide
      var self = this;
      var mandar = function () {
        var chave = empresaId + "|" + ent, carga = "", marcou = false;
        try {
          /* ⚠ DOC_V2: o `~v2` desta conta ainda não foi criado pelo sincronizar (com a união do documento antigo) — o push
             o criaria só com o local. O dado fica neste aparelho; o próximo sincronizar faz a migração e sobe. */
          if (DOC_V2[ent] && !self._v2Pronto(ent)) return;
          var v = lerEnt(empresaId, ent);
          /* ⚠ o `[]` de uma leitura ilegível NÃO sobe: ele substituiria na
             nuvem a lista que os outros aparelhos ainda têm (ver `ilegivelLocal`) */
          if (ilegivelLocal(empresaId, ent)) return;
          /* ⚠ nem o `[]` de uma entidade ainda trancada (ver `naoCarregadaLocal`) */
          if (naoCarregadaLocal(empresaId, ent)) return;
          var vN = paraNuvem(ent, v);                                   // a forma guardada (ver `paraNuvem`)
          try { carga = JSON.stringify(vN); } catch (e) { carga = ""; }
          if (carga && self._ultimoEnviado[chave] === carga) return;   // nada mudou: não escreve
          self._avisarTamanho(ent, carga);
          self._ultimoEnviado[chave] = carga; marcou = true;
          self._escreverEnt(ent, vN, carga.length).then(function () {
            self._marcarSync(empresaId, ent, v); // o que subiu vira a base comum
          }).catch(function (e) {
            /* a escrita falhou: esquece a marca, senão a próxima tentativa
               acharia que já subiu e o dado ficaria só no aparelho */
            delete self._ultimoEnviado[chave];
            self._registrarFalha(ent, e, carga.length);
          });
        } catch (e) {
          /* ⚠ A RECUSA SÍNCRONA É A MESMA FALHA QUE A REJEIÇÃO (planejador,
             Onda 0, T16; crítica 1, achado 1). O SDK do Firestore recusa
             documento com lista dentro de lista LANÇANDO na hora, dentro do
             `set(...)` — antes da promessa existir. Este `catch` era vazio e
             vinha DEPOIS de `_ultimoEnviado[chave] = carga`: o aparelho
             guardava a carga como "já subiu", a próxima tentativa com o MESMO
             conteúdo saía cedo pelo "nada mudou", nenhuma falha era registrada
             e `estado().ok` continuava true — a tela dizia "Sincronizado" com
             a entidade parada neste aparelho para sempre.
             Prova: tools/test-nuvem-push-falha.js (CN: este catch vazio de
             novo → reprova). */
          if (marcou) delete self._ultimoEnviado[chave];
          try { self._registrarFalha(ent, e, carga.length); } catch (eR) {}
        }
      };
      /* ⚠ RECONFERE NA HORA DE MANDAR. A guarda de cima roda no AGENDAMENTO;
         o envio acontece 900 ms depois (150 ms para as lápides). Um bloqueio que
         chega no meio não cancelava o timer, e o que subia era a entidade
         INTEIRA para o documento da outra empresa. Pior com `_lapides`: os ids
         determinísticos (código do insumo, código da composição) COLIDEM entre
         empresas, e uma lápide dessas apaga o registro legítimo do outro lado. */
      var mandarSeLiberado = function () { if (self.bloqueioDeDono) return; mandar(); };
      if (ent === "_lapides") { clearTimeout(this._push[ent]); this._push[ent] = setTimeout(mandarSeLiberado, 150); return; }
      clearTimeout(this._push[ent]);
      this._push[ent] = setTimeout(mandarSeLiberado, 900);
    },

    /* O aviso de "lista perto do teto de 1 MiB" — do push e, desde a revisão 3
       da Fase 3, também do sincronizar (o merge grava e sobe sem passar pelo
       push). UM código para os dois, com a mesma marca "uma vez por versão". */
    _avisarTamanho: function (ent, carga) {
      var self = this;
      try {
          /* ⚠ O DOCUMENTO DO FIRESTORE TEM TETO DE 1 MiB, E A ENTIDADE INTEIRA
           * VAI NUM DOCUMENTO SÓ. Não havia guarda nenhuma de tamanho aqui: ao
           * passar do teto a escrita simplesmente falha, e a partir daí o
           * aparelho para de sincronizar AQUELA entidade — em silêncio, com a
           * tela continuando a mostrar tudo certo localmente.
           * A conta é alcançável antes de o localStorage encher: a ~940 bytes
           * por diário, a lista de RDO passa de 1 MiB por volta de 1.100
           * diários. Avisar a 900 KB dá margem para o cliente pedir socorro
           * ANTES de o dado deixar de subir.
           * Aviso, e não bloqueio: barrar o push aqui seria parar a
           * sincronização por conta própria — exatamente o que se quer evitar. */
          /* ⚠ UMA VEZ POR VERSÃO, NÃO POR SESSÃO. A memória de sessão zera
             todo dia, e o cliente com uma lista grande não tem como resolver
             isso sozinho ("fale com o suporte") — ele veria o mesmo aviso
             vermelho toda manhã, para sempre, até parar de ler os avisos. A
             marca persistente carrega a versão: quando sair uma versão que
             mexa nisso, ele volta a ser avisado uma vez. */
          var marcaTam = "orcapro:nuvem:grande:" + ent;
          /* ⚠ `global.CONFIG` nos TRÊS níveis. A primeira versão desta linha
             misturava `global.CONFIG &&` com `CONFIG.app` nu: onde a global
             não existisse, o guard passava e a linha seguinte estourava
             ReferenceError — derrubando o push inteiro em vez de cair no "?".
             No navegador funcionaria por acaso, porque lá `CONFIG` é global. */
          /* ⚠ E A VERSÃO MORA EM `CONFIG.versao` (js/config.js). Esta linha
             lia `CONFIG.app.versao`, que não existe: dava sempre "?", a marca
             nunca mudava de versão e o aviso saía UMA VEZ NA VIDA do aparelho
             — não "uma vez por versão" como a nota acima promete: a lista
             avisada uma vez continuava crescendo, versão após versão, até
             passar do teto calada. `app.versao` fica como segunda leitura só
             por compatibilidade. */
          var cfg = global.CONFIG || null;
          var verAtual = (cfg && (cfg.versao || (cfg.app && cfg.app.versao))) || "?";
          var jaAvisado = self._avisouTamanho[ent];
          if (!jaAvisado) {
            try { jaAvisado = global.localStorage.getItem(marcaTam) === verAtual; } catch (eL) {}
          }
          /* ⚠ O LIMIAR SEGUE O MESMO CRITÉRIO DA GRAVAÇÃO (21/10/2026). Desde a 1.2.158 a lista acima de 1 MiB
             sobe EM PARTES (_escreverEntVez) quando o SDK tem `db.batch` — o teto real passou a ser o do lote
             (TETO_LOTE). Este aviso ficou nos 900 KB dizendo "PARA de sincronizar": recado que mente. No
             console do Rogério (1.2.168) saiu para orcamentos, bim_vistas, bim_familias e bim_edicoes
             (1,3 a 3,3 MB), que sincronizam em partes. Sem batch (SDK antigo, ou antes de conectar) o teto
             continua sendo o de um documento só, e o aviso de sempre vale. */
          var emPartes = !!(self.db && typeof self.db.batch === "function") && self.TETO_LOTE > 0;
          var limiar = emPartes ? Math.round(self.TETO_LOTE * 0.8) : 900 * 1024;
          if (carga.length > limiar && !jaAvisado) {
            self._avisouTamanho[ent] = 1;
            try { global.localStorage.setItem(marcaTam, verAtual); } catch (eL2) {}
            try {
              if (global.UI && global.UI.toast) global.UI.toast(
                "⚠ A lista \"" + ent + "\" já tem " + Math.round(carga.length / 1024)
                + (emPartes
                  ? " KB e está perto do limite da nuvem (" + Math.round(self.TETO_LOTE / 1048576) + " MB por lista, mesmo dividida em partes)."
                  : " KB e está perto do limite de 1 MB por lista da nuvem.")
                + " Perto disso ela PARA de sincronizar, sem aviso."
                + " Faça backup e fale com o suporte antes que isso aconteça.", "erro");
            } catch (eT) {}
            try { console.warn("[nuvem] entidade grande:", ent, Math.round(carga.length / 1024) + " KB"); } catch (eC) {}
          }
      } catch (e) {}
    },

    /* DESLIGAMENTO PELO USUÁRIO — é a revogação de consentimento da LGPD.
     *
     * `sair()` sozinho só valia até fechar o app: no boot seguinte o
     * _conectarNuvemLicenca reconectava pela chave de licença e a sincronização
     * voltava sem o usuário pedir. A marca abaixo é persistente e o boot a
     * respeita; religar é um clique no mesmo lugar. Não apaga NADA — nem o que
     * está no aparelho, nem o que já subiu (para isso existe o canal do titular). */
    CHAVE_DESLIGADA: "orcapro:nuvem:desligada",
    desligadaPeloUsuario: function () {
      try { return localStorage.getItem(this.CHAVE_DESLIGADA) === "1"; } catch (e) { return false; }
    },
    marcarDesligada: function (v) {
      try {
        if (v) localStorage.setItem(this.CHAVE_DESLIGADA, "1");
        else localStorage.removeItem(this.CHAVE_DESLIGADA);
      } catch (e) {}
    },

    sair: function (permanente) {
      this._un.forEach(function (u) { try { u(); } catch (e) {} });
      this._un = []; this._escutando = null; this.ligado = false; this.uid = null;
      if (permanente) this.marcarDesligada(true);
      if (this.auth) this.auth.signOut().catch(function () {});
    }
  };

  global.Nuvem = Nuvem;
})(window);
