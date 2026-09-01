/* =====================================================================
 * bimfed.js — A FEDERAÇÃO DA OBRA, SALVA (o NWF do OrçaPRO)
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * Hoje a obra não sabe de que arquivos ela é feita. O engenheiro abre
 * estrutura, arquitetura e hidráulica, ajusta disciplina e transparência de
 * cada um, fecha a aba — e na volta não há nada. Tem de achar os três arquivos
 * de novo, na pasta, e refazer os ajustes. É o trabalho que o Navisworks
 * guarda no NWF, e o produto simplesmente perdia.
 *
 * `bim_modelos` passa a ser a lista de arquivos da obra, com o que o usuário
 * escolheu para cada um. Com o cache do B1 (js/bimcache.js), reabrir a obra
 * remonta tudo sem pedir arquivo nenhum.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ E ELE FECHA O BURACO QUE O B0 DEIXOU DECLARADO
 *
 * O B0 ancora todo vínculo salvo em `modeloId`, derivado de obra + nome do
 * arquivo. Estava escrito lá, em letra de fôrma, que renomear o arquivo
 * orfanava os vínculos daquele modelo — a tarefa 4D e o item de orçamento
 * continuavam gravados, apontando para um lugar que ninguém mais abre.
 *
 * Com a federação salva, o `modeloId` deixa de ser derivado toda vez: ele é
 * cunhado UMA vez, quando o arquivo entra na obra, e fica no registro. Depois
 * disso o casamento é por CONTEÚDO primeiro (`arquivoId`) — então renomear um
 * arquivo idêntico reencontra o mesmo modelo — e por nome só como segunda
 * tentativa, que é o caso da versão nova com o mesmo nome.
 *
 * ⚠ O QUE CONTINUA SEM SOLUÇÃO, E POR QUÊ. Renomear E mudar o conteúdo ao
 * mesmo tempo não tem como ser adivinhado: não sobrou nada em comum. Aqui isso
 * volta como `novo`, e quem chama TEM de perguntar em vez de escolher — casar
 * por semelhança de nome moveria os vínculos de um modelo para outro, que é
 * pior do que perdê-los, porque ninguém percebe.
 *
 * ⚠ POR QUE PURO
 * Decide identidade de dado gravado. `js/bim.js` não entra no gate; isto entra.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ENTIDADE = "bim_modelos";

  function txt(s) { return String(s == null ? "" : s).trim(); }
  function num(x) { var n = +x; return isFinite(n) ? n : 0; }
  function bool(v, padrao) { return v === undefined || v === null ? !!padrao : !!v; }

  /* o mesmo normalizador do B0: os dois TÊM de concordar, senão o modeloId
     cunhado aqui não seria o que o viewer deriva quando não há registro */
  function normalizarNome(nome) {
    if (global.BimId && global.BimId.normalizarNome) return global.BimId.normalizarNome(nome);
    var s = txt(nome);
    var barra = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
    if (barra >= 0) s = s.slice(barra + 1);
    s = s.replace(/\.ifc$/i, "");
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function modeloIdDerivado(obraId, nome) {
    if (global.BimId && global.BimId.modeloId) return global.BimId.modeloId(obraId, nome);
    var a = normalizarNome(nome);
    if (!a) return "";
    return (txt(obraId) || "sem_obra") + "/" + a;
  }

  /* ---------------------------------------------------------------
   * cunhar — a âncora de um modelo NOVO, quando o nome já está tomado
   *
   * ⚠ Sem isto, a guarda de `casar`/`resolver` seria inútil: elas recusam
   * casar por nome quando a vaga está ocupada por outro arquivo, mas o caminho
   * "novo" cunharia o MESMO id derivado do nome — e a colisão que a guarda
   * acabou de evitar voltaria pela porta dos fundos.
   *
   * O desempate leva um pedaço do `arquivoId`, então é determinístico: o mesmo
   * arquivo, na mesma obra, dá sempre a mesma âncora — que é a promessa do B0.
   * ------------------------------------------------------------- */
  function cunhar(obraId, nome, arquivoId, tomadas) {
    var base = modeloIdDerivado(obraId, nome);
    if (!base) return "";
    var t = tomadas || {};
    if (!t[base]) return base;
    var a = txt(arquivoId);
    if (!a) return base;                    /* sem conteúdo não há desempate honesto */
    return base + "~" + a.slice(0, 8);
  }

  /* ---------------------------------------------------------------
   * registro — a forma do que vai para o Store
   *
   * ⚠ `id` É o `modeloId`. Uma identidade só: se fossem dois números, algum
   * código acabaria usando o errado como âncora — e âncora errada é vínculo
   * apontando para a peça de outro arquivo.
   *
   * ⚠ CAMPOS GUARDADOS QUE AINDA NÃO SÃO APLICADOS: `offset`, `rotZ`, `escala`
   * e `unidade` nascem neutros e ficam no registro para o B9 (federação com
   * transformação, D7) não precisar migrar o schema depois. Eles NÃO têm
   * interface: ninguém consegue ajustá-los e ver nada acontecer. Um campo que
   * o usuário mexe e o produto ignora é mentira; um campo neutro, sem controle
   * na tela e declarado aqui, é só espaço reservado.
   * ------------------------------------------------------------- */
  function registro(d) {
    d = d || {};
    var obraId = txt(d.obraId);
    var nome = txt(d.nome);
    var mid = txt(d.modeloId) || modeloIdDerivado(obraId, nome);
    if (!mid || !nome) return null;
    var ant = d.anterior || null;
    return {
      id: mid,
      modeloId: mid,
      obraId: obraId,
      /* conteúdo da versão que está valendo agora */
      arquivoId: txt(d.arquivoId),
      /* ⚠ a versão anterior fica: é o que permite ao B0 recusar migrar um
         vínculo quando o arquivo mudou, em vez de migrar para a peça errada */
      arquivoIdAnterior: ant ? txt(ant.arquivoId) : txt(d.arquivoIdAnterior),
      nome: nome,
      /* escolhas do usuário NAQUELA obra — é por isso que elas moram aqui e
         não no cache, que é do arquivo e pode estar em duas obras */
      disciplina: txt(d.disciplina),
      alpha: (d.alpha === undefined || d.alpha === null) ? (ant ? num(ant.alpha) || 1 : 1) : num(d.alpha),
      visivel: bool(d.visivel, ant ? ant.visivel !== false : true),
      /* reservado para o B9/D7 — sem controle na tela (ver cabeçalho) */
      offset: (Array.isArray(d.offset) && d.offset.length === 3) ? d.offset.map(num) : [0, 0, 0],
      rotZ: num(d.rotZ),
      escala: num(d.escala) || 1,
      unidade: txt(d.unidade),
      versao: ant ? (num(ant.versao) || 1) + (txt(d.arquivoId) && txt(d.arquivoId) !== txt(ant.arquivoId) ? 1 : 0) : 1,
      importadoEm: (ant && txt(ant.importadoEm)) || txt(d.em),
      atualizadoEmArquivo: txt(d.em)
    };
  }

  /* as vagas ja ocupadas na obra, com o conteudo de cada uma */
  function tomadasDe(regs, obraId) {
    var out = {};
    daObra(regs, obraId).forEach(function (r) { out[txt(r.modeloId)] = txt(r.arquivoId) || 1; });
    return out;
  }

  function daObra(regs, obraId) {
    var o = txt(obraId);
    return (regs || []).filter(function (r) { return r && txt(r.obraId) === o; });
  }

  /* ---------------------------------------------------------------
   * casar — este arquivo é qual modelo desta obra?
   *
   * A ordem importa e é deliberada:
   *   1. CONTEÚDO. Mesmo `arquivoId` = é literalmente o mesmo arquivo, mesmo
   *      que tenha outro nome. É isto que faz renomear parar de orfanar.
   *   2. NOME. Mesmo nome normalizado = mesma vaga da federação, conteúdo
   *      novo. É o caso mais comum de todos: a versão nova do projetista.
   *   3. NENHUM. Devolve `novo` — e quem chama pergunta. Não existe terceira
   *      pista honesta.
   *
   * ⚠ E QUANDO DUAS VAGAS CASAM, NÃO ESCOLHE. Dois registros com o mesmo
   * conteúdo na mesma obra (o mesmo arquivo importado duas vezes com nomes
   * diferentes) é ambiguidade real. Escolher uma delas moveria os vínculos da
   * outra em silêncio.
   * ------------------------------------------------------------- */
  function casar(regs, alvo) {
    alvo = alvo || {};
    var obraId = txt(alvo.obraId);
    var arquivoId = txt(alvo.arquivoId);
    var lista = daObra(regs, obraId);

    if (arquivoId) {
      var porConteudo = lista.filter(function (r) { return txt(r.arquivoId) === arquivoId; });
      if (porConteudo.length > 1) return { como: "ambiguo", reg: null, candidatos: porConteudo, motivo: "este arquivo já está na obra em mais de um modelo" };
      if (porConteudo.length === 1) return { como: "conteudo", reg: porConteudo[0], candidatos: [] };
    }

    var alvoMid = modeloIdDerivado(obraId, alvo.nome);
    if (alvoMid) {
      var porNome = lista.filter(function (r) { return txt(r.modeloId) === alvoMid; });
      if (porNome.length > 1) return { como: "ambiguo", reg: null, candidatos: porNome, motivo: "há mais de um modelo com este nome na obra" };
      if (porNome.length === 1) {
        /* ⚠ a mesma guarda de `resolver`: se a vaga está sendo usada AGORA por
           um arquivo de outro conteúdo, casar por nome roubaria a âncora dele.
           "ESTRUTURA.ifc" é o nome que o projetista entrega em toda obra, e
           abrir o do Bloco A e o do Bloco B junto é rotina. */
        var ocupada = alvo.abertos ? txt(alvo.abertos[alvoMid]) : "";
        if (!(ocupada && arquivoId && ocupada !== arquivoId)) {
          return { como: "nome", reg: porNome[0], candidatos: [] };
        }
      }
    }
    return { como: "novo", reg: null, candidatos: [] };
  }

  /* ---------------------------------------------------------------
   * aoAbrir — o registro que deve ser gravado quando um arquivo é aberto
   *
   * Junta `casar` com `registro`: mantém a vaga quando casou, cunha uma nova
   * quando não casou, e diz o que aconteceu para a tela poder contar.
   * ------------------------------------------------------------- */
  function aoAbrir(regs, alvo) {
    var c = casar(regs, alvo);
    if (c.como === "ambiguo") {
      return { ok: false, como: c.como, motivo: c.motivo, candidatos: c.candidatos, reg: null };
    }
    var ant = c.reg;
    var reg = registro({
      obraId: alvo.obraId,
      /* ⚠ a vaga MANDA no modeloId. Casou por conteúdo com um arquivo que
         mudou de nome? O modeloId continua o da vaga — é exatamente isso que
         segura os vínculos no lugar. */
      modeloId: ant ? txt(ant.modeloId) : cunhar(alvo.obraId, alvo.nome, alvo.arquivoId, tomadasDe(regs, alvo.obraId)),
      nome: txt(alvo.nome),
      arquivoId: txt(alvo.arquivoId),
      /* ⚠ A ESCOLHA DO USUÁRIO MANDA SOBRE A DETECÇÃO AUTOMÁTICA. `alvo.disciplina`
         vem do viewer, e lá ela NUNCA chega vazia: `detectarDisciplina` sempre
         devolve alguma coisa, no pior caso pelo desempate por contagem de tipos.
         Com a ordem invertida, um "MODELO-GERAL.ifc" que o engenheiro corrigiu
         à mão para hidráulica voltava a ser arquitetura em toda reabertura —
         e o produto desfazia o ajuste dele sem dizer nada. Trocar de disciplina
         de propósito tem caminho próprio, o seletor do painel. */
      disciplina: ant ? txt(ant.disciplina) : txt(alvo.disciplina),
      alpha: ant ? ant.alpha : alvo.alpha,
      visivel: ant ? ant.visivel : alvo.visivel,
      offset: ant ? ant.offset : alvo.offset,
      rotZ: ant ? ant.rotZ : alvo.rotZ,
      escala: ant ? ant.escala : alvo.escala,
      unidade: ant ? ant.unidade : alvo.unidade,
      anterior: ant,
      em: txt(alvo.em)
    });
    if (!reg) return { ok: false, como: "invalido", motivo: "arquivo sem nome utilizável", candidatos: [], reg: null };
    /* renomeou: o registro passa a mostrar o nome novo, mas a âncora não mexe */
    var renomeou = !!(ant && normalizarNome(ant.nome) !== normalizarNome(alvo.nome));
    var versaoNova = !!(ant && txt(ant.arquivoId) && txt(ant.arquivoId) !== txt(alvo.arquivoId));
    return {
      ok: true, como: c.como, reg: reg, candidatos: [],
      renomeou: renomeou, versaoNova: versaoNova,
      /* o que o B0 precisa para decidir se pode migrar um vínculo antigo */
      arquivoIdSalvo: ant ? txt(ant.arquivoId) : ""
    };
  }

  /* =====================================================================
   * O QUE MUDOU ENTRE DUAS VERSÕES DO MESMO ARQUIVO
   *
   * POR QUE ISTO É O CORAÇÃO DA FEDERAÇÃO. O projetista manda a versão nova
   * da hidráulica na sexta. O coordenador abre, e hoje o produto diz apenas
   * "Versão 3" — o que é verdade e não serve para nada. Ele então roda a
   * compatibilização de novo e relê trezentos conflitos para descobrir que
   * mudaram doze tubos.
   *
   * A pergunta que ele tem é outra, e é sempre a mesma: O QUE MUDOU. Com a
   * chave estável do B0, ela é respondível — e a resposta reorganiza a
   * reunião inteira, porque o assunto passa a ser as doze peças.
   *
   * ─────────────────────────────────────────────────────────────────────
   * ⚠ A TOLERÂNCIA NÃO É FRESCURA, E ELA TEM UM PISO
   *
   * Reexportar um IFC mexe nos números na casa do micrômetro: o exportador
   * arredonda, e a malha é serializada em float32 no cache — que já custou
   * uma cena 3,9 µm fora do lugar aqui. Comparar com igualdade exata
   * apontaria O MODELO INTEIRO como movido, e um relatório que diz "5.000
   * peças moveram" é lido como "o sistema não sabe" e nunca mais é aberto.
   *
   * 1 mm é bem acima do ruído de float32 num modelo de obra (que trabalha em
   * dezenas de metros) e bem abaixo do que alguém move de propósito.
   *
   * ⚠ E "MOVEU" É DIFERENTE DE "MUDOU DE TAMANHO". Um tubo que anda 20 cm e
   *   um tubo que ficou 20 cm mais longo são conversas diferentes com o
   *   projetista: um é interferência, o outro é quantitativo. Somar os dois
   *   em "alterados" esconde justamente a distinção que ele precisa.
   * ===================================================================== */
  var TOLERANCIA_M = 0.001;   /* 1 mm */

  function centroDe(aabb) {
    if (!aabb || !aabb.min || !aabb.max) return null;
    return [
      (num(aabb.min[0]) + num(aabb.max[0])) / 2,
      (num(aabb.min[1]) + num(aabb.max[1])) / 2,
      (num(aabb.min[2]) + num(aabb.max[2])) / 2
    ];
  }
  function tamanhoDe(aabb) {
    if (!aabb || !aabb.min || !aabb.max) return null;
    return [
      Math.abs(num(aabb.max[0]) - num(aabb.min[0])),
      Math.abs(num(aabb.max[1]) - num(aabb.min[1])),
      Math.abs(num(aabb.max[2]) - num(aabb.min[2]))
    ];
  }
  function distancia(a, b) {
    if (!a || !b) return 0;
    var dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function maiorDelta(a, b) {
    if (!a || !b) return 0;
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }

  /* A FOTOGRAFIA de uma versão: só o necessário para comparar com a próxima.
     ⚠ Guardar o elemento inteiro seria guardar o modelo duas vezes. */
  function fotografar(elementos) {
    var out = [];
    (elementos || []).forEach(function (e) {
      if (!e) return;
      var k = txt(e.chave);
      if (!k) return;                       /* sem chave estável não há o que comparar */
      out.push({
        chave: k,
        nome: txt(e.nome) || txt(e.tipo),
        tipo: txt(e.tipo),
        centro: centroDe(e.aabb),
        tamanho: tamanhoDe(e.aabb)
      });
    });
    return out;
  }

  function comparar(antes, depois, opts) {
    var o = opts || {};
    var tol = o.tolerancia === undefined ? TOLERANCIA_M : num(o.tolerancia);
    var A = {}, nA = 0, semChaveA = 0, semChaveD = 0;

    (antes || []).forEach(function (e) {
      if (!e) return;
      var k = txt(e.chave);
      if (!k) { semChaveA++; return; }
      A[k] = e; nA++;
    });

    var entraram = [], moveram = [], redimensionaram = [], iguais = 0, vistos = {};
    (depois || []).forEach(function (e) {
      if (!e) return;
      var k = txt(e.chave);
      if (!k) { semChaveD++; return; }
      vistos[k] = 1;
      var a = A[k];
      if (!a) { entraram.push({ chave: k, nome: txt(e.nome) || txt(e.tipo), tipo: txt(e.tipo) }); return; }

      var cA = a.centro || centroDe(a.aabb), cD = e.centro || centroDe(e.aabb);
      var tA = a.tamanho || tamanhoDe(a.aabb), tD = e.tamanho || tamanhoDe(e.aabb);
      var dMov = (cA && cD) ? distancia(cA, cD) : 0;
      var dTam = (tA && tD) ? maiorDelta(tA, tD) : 0;

      /* ⚠ as duas perguntas são independentes: uma peça pode ter andado E
         mudado de tamanho, e cair nas duas listas é o certo — o coordenador
         precisa das duas informações sobre ela. */
      var mexeu = false;
      if (dMov > tol) { moveram.push({ chave: k, nome: txt(e.nome) || txt(e.tipo), tipo: txt(e.tipo), distancia: Math.round(dMov * 1000) / 1000 }); mexeu = true; }
      if (dTam > tol) { redimensionaram.push({ chave: k, nome: txt(e.nome) || txt(e.tipo), tipo: txt(e.tipo), delta: Math.round(dTam * 1000) / 1000 }); mexeu = true; }
      if (!mexeu) iguais++;
    });

    var sairam = [];
    Object.keys(A).forEach(function (k) {
      if (!vistos[k]) sairam.push({ chave: k, nome: txt(A[k].nome) || txt(A[k].tipo), tipo: txt(A[k].tipo) });
    });

    /* ordena o que mais andou primeiro: é por onde o coordenador começa */
    moveram.sort(function (x, y) { return y.distancia - x.distancia; });
    redimensionaram.sort(function (x, y) { return y.delta - x.delta; });

    var mudou = entraram.length + sairam.length + moveram.length + redimensionaram.length;
    return {
      entraram: entraram,
      sairam: sairam,
      moveram: moveram,
      redimensionaram: redimensionaram,
      iguais: iguais,
      totalAntes: nA,
      totalDepois: nA - sairam.length + entraram.length,
      mudou: mudou,
      tolerancia: tol,
      /* ⚠ peça sem chave estável não entra em conta nenhuma, e a tela TEM de
         dizer: um IFC sem GlobalId publicado daria "nada mudou" com o modelo
         inteiro trocado, e essa é a pior resposta possível. */
      semChave: { antes: semChaveA, depois: semChaveD },
      confiavel: semChaveA === 0 && semChaveD === 0
    };
  }


  /* =====================================================================
   * impacto — O QUE AS PEÇAS QUE SAÍRAM ESTAVAM CARREGANDO
   *
   * A comparação diz "Peças removidas (14)" e encerra o assunto. Mas o que o
   * coordenador precisa saber não é quantas saíram: é que TRÊS delas eram as
   * peças que o cliente comentou na reunião passada, que UMA era o alvo de
   * uma tarefa do cronograma, e que o conjunto "Fachada norte" — que a equipe
   * levou duas horas montando à mão — ficou com metade.
   *
   * Sem isto, esse trabalho aponta para o vazio em silêncio, e só é
   * descoberto quando alguém abre a vista e não entende por que está vazia.
   *
   * ─────────────────────────────────────────────────────────────────────
   * ⚠ "SUMIU" NÃO É "FOI DEMOLIDA". Esta é a linha mais importante do
   *   arquivo. O GlobalId é reemitido quando o projetista troca a
   *   configuração do exportador, recria o elemento, ou exporta de outro
   *   programa. A peça continua no prédio, com identidade nova.
   *
   *   Por isso a frase NUNCA diz que a peça foi removida da obra: diz que
   *   ela "não existe mais com a mesma identidade nesta versão". A ação que
   *   isso recomenda é CONFERIR, não apagar — e a diferença entre as duas é
   *   o trabalho de coordenação de uma equipe inteira.
   *
   * ⚠ E QUANDO O ARQUIVO INTEIRO TROCA DE IDENTIDADE, a resposta certa não é
   *   "você perdeu tudo". É "este IFC saiu com identidades novas". Um modelo
   *   de 4.000 peças reexportado com outro exportador produz 4.000 saídas e
   *   4.000 entradas; anunciar isso como "4.000 peças removidas" e listar a
   *   obra inteira como perdida é a resposta mais assustadora e mais errada
   *   que este produto poderia dar. `reidentificacao` separa os dois casos.
   *
   * ⚠ CONJUNTO POR BUSCA NÃO PERDE NADA — ele reavalia a regra contra o
   *   modelo aberto. Só o estático (lista congelada) perde. Contá-los juntos
   *   inventaria um problema que não existe, e o número apareceria em toda
   *   revisão, ensinando o usuário a ignorar o aviso.
   *
   * ⚠ CONFLITO COM PEÇA SUMIDA NÃO É CONFLITO RESOLVIDO. Pode ter sido
   *   resolvido, pode ter sido reexportado. Dizer "resolvido" fecharia, com
   *   base em suposição, um item que talvez ainda esteja lá — e conflito é
   *   exatamente o que ninguém pode fechar por suposição. A frase pede para
   *   rodar o teste de novo nesta versão.
   *
   * ⚠ ESCONDER NÃO É ISOLAR. Uma vista que ocultava 200 peças e perdeu 5
   *   mostra exatamente o mesmo de antes: as 5 já não apareciam. Uma vista
   *   que ISOLAVA 5 e perdeu 2 mudou de assunto. Só a segunda entra na
   *   conta; a primeira é ruído que ensinaria a ignorar o resto.
   *
   * ⚠ E NADA É APAGADO AQUI. Este motor lê e relata. Quem decide se o
   *   conjunto morto some é o usuário — apagar por conta própria o trabalho
   *   de alguém, com base numa identidade que pode ter só mudado de número,
   *   é o pior desfecho possível desta função.
   * ===================================================================== */

  /* acima disto, a diferença não é obra: é o arquivo inteiro reemitido */
  var REIDENT_FRACAO = 0.9;

  function _chavesDe(lista) {
    var out = {}, n = 0;
    (lista || []).forEach(function (x) {
      var k = txt(x && x.chave !== undefined ? x.chave : x).trim();
      if (k && !out[k]) { out[k] = 1; n++; }
    });
    return { set: out, n: n };
  }

  /* quais das chaves de `lista` estão entre as que saíram */
  function _perdeu(lista, foi) {
    var achadas = [];
    (lista || []).forEach(function (x) {
      var k = txt(x).trim();
      if (k && foi[k] && achadas.indexOf(k) < 0) achadas.push(k);
    });
    return achadas;
  }

  function impacto(c, acervo) {
    var a = acervo || {};
    var vazio = {
      total: 0, itens: [], orfaos: 0, atencao: 0,
      porTipo: { conjunto: 0, tarefa: 0, vista: 0, conflito: 0 },
      ignorados: { conjuntosPorBusca: 0, vistasSoOcultavam: 0 },
      reidentificacao: false, confiavel: !c || c.confiavel !== false, nSairam: 0
    };
    if (!c || !c.sairam || !c.sairam.length) return vazio;

    var f = _chavesDe(c.sairam);
    var foi = f.set;

    /* ⚠ o arquivo trocou de identidade inteiro? então nada disto é perda de
       peça, e listar item por item seria listar a obra toda */
    var reident = !!(num(c.totalAntes) > 0 && f.n >= num(c.totalAntes) * REIDENT_FRACAO
                     && (c.entraram || []).length >= f.n * REIDENT_FRACAO);

    var itens = [], ign = { conjuntosPorBusca: 0, vistasSoOcultavam: 0 };
    var conjMortos = {};   /* id -> nome, para as tarefas que dependem deles */

    (a.conjuntos || []).forEach(function (cj) {
      if (!cj) return;
      /* o de busca reavalia a regra: ele não tem o que perder */
      if (txt(cj.tipo) !== "estatico") { ign.conjuntosPorBusca++; return; }
      var de = (cj.chaves || []).length;
      var perd = _perdeu(cj.chaves, foi);
      if (!perd.length) return;
      var orfao = de > 0 && perd.length >= de;
      if (orfao) conjMortos[txt(cj.id)] = txt(cj.nome);
      itens.push({
        tipo: "conjunto", id: txt(cj.id), nome: txt(cj.nome),
        perdidas: perd, de: de, orfao: orfao, atencao: false,
        nota: orfao
          ? "Nenhuma das peças deste conjunto existe nesta versão."
          : "Continua valendo com " + (de - perd.length) + " de " + de + " peça(s)."
      });
    });

    (a.tarefas || []).forEach(function (tf) {
      if (!tf || !tf.alvo) return;
      var tipo = txt(tf.alvo.tipo);
      if (tipo === "elementos") {
        var de = (tf.alvo.chaves || []).length;
        var perd = _perdeu(tf.alvo.chaves, foi);
        if (!perd.length) return;
        var orfao = de > 0 && perd.length >= de;
        itens.push({
          tipo: "tarefa", id: txt(tf.id), nome: txt(tf.nome),
          perdidas: perd, de: de, orfao: orfao, atencao: false,
          nota: orfao
            ? "A tarefa ficou sem nenhuma peça: não pinta nada no 4D e não entra no avanço por peça."
            : "Ainda aponta para " + (de - perd.length) + " de " + de + " peça(s)."
        });
        return;
      }
      /* ⚠ a tarefa que aponta para um CONJUNTO não é contada de novo pelas
         peças — seria o mesmo prejuízo somado duas vezes. Ela só entra
         quando o conjunto morreu, porque aí ela morreu junto. */
      if (tipo === "conjunto" && conjMortos[txt(tf.alvo.ref)]) {
        itens.push({
          tipo: "tarefa", id: txt(tf.id), nome: txt(tf.nome),
          perdidas: [], de: 0, orfao: true, atencao: false,
          nota: "Aponta para o conjunto \u201C" + conjMortos[txt(tf.alvo.ref)] + "\u201D, que ficou sem peças."
        });
      }
    });

    (a.vistas || []).forEach(function (v) {
      if (!v) return;
      var vis = v.visibilidade || {};
      var iso = _perdeu(vis.isolados, foi);
      var ap = _perdeu((v.aparencias || []).map(function (x) { return x && x.chave; }), foi);
      var oc = _perdeu(vis.ocultos, foi);
      if (!iso.length && !ap.length) {
        /* ⚠ perdeu só peça que já estava escondida: a vista mostra o mesmo */
        if (oc.length) ign.vistasSoOcultavam++;
        return;
      }
      var deIso = (vis.isolados || []).length;
      var orfao = deIso > 0 && iso.length >= deIso;
      var abertos = (v.comentarios || []).filter(function (x) { return txt(x && x.status) !== "resolvido"; }).length;
      var perd = iso.slice();
      ap.forEach(function (k) { if (perd.indexOf(k) < 0) perd.push(k); });
      itens.push({
        tipo: "vista", id: txt(v.id), nome: txt(v.nome),
        perdidas: perd, de: deIso || perd.length, orfao: orfao,
        /* ⚠ alguém FEZ UMA PERGUNTA sobre uma peça que não responde mais.
           É a perda mais cara da lista, e é a que some mais fácil. */
        atencao: abertos > 0,
        comentariosAbertos: abertos,
        nota: (orfao ? "A vista isolava só peças que não existem nesta versão: ela abre vazia. "
                     : "A vista perde " + perd.length + " peça(s) do que mostrava. ")
              + (abertos ? (abertos + " comentário(s) em aberto apontam para esta vista.") : "")
      });
    });

    (a.conflitos || []).forEach(function (r) {
      if (!r) return;
      var perd = _perdeu([r.chaveA, r.chaveB], foi);
      if (!perd.length) return;
      var fechado = txt(r.status) === "resolvido" || txt(r.status) === "aprovado";
      itens.push({
        tipo: "conflito", id: txt(r.id), nome: txt(r.nome) || txt(r.par) || "Conflito",
        perdidas: perd, de: 2, orfao: perd.length >= 2,
        /* conflito ainda aberto cujas peças mudaram de identidade: é o que
           tem de ser reconferido antes da próxima reunião */
        atencao: !fechado,
        nota: "Uma das peças deste conflito não existe com a mesma identidade nesta versão. "
              + "Isso NÃO quer dizer que o conflito acabou — rode o teste de novo nesta versão para saber."
      });
    });

    /* ⚠ a ordem é a do prejuízo, não a do banco: primeiro o que morreu
       inteiro, depois o que alguém está esperando resposta, depois o
       tamanho da perda. Uma lista em ordem de id faz o coordenador ler as
       trinta linhas para achar a que importa — e ele lê as três primeiras. */
    itens.sort(function (x, y) {
      if (x.orfao !== y.orfao) return x.orfao ? -1 : 1;
      if (x.atencao !== y.atencao) return x.atencao ? -1 : 1;
      if (y.perdidas.length !== x.perdidas.length) return y.perdidas.length - x.perdidas.length;
      return txt(x.nome) < txt(y.nome) ? -1 : 1;
    });

    var porTipo = { conjunto: 0, tarefa: 0, vista: 0, conflito: 0 };
    itens.forEach(function (i) { porTipo[i.tipo] = (porTipo[i.tipo] || 0) + 1; });

    return {
      total: itens.length,
      itens: itens,
      orfaos: itens.filter(function (i) { return i.orfao; }).length,
      atencao: itens.filter(function (i) { return i.atencao; }).length,
      porTipo: porTipo,
      ignorados: ign,
      reidentificacao: reident,
      confiavel: c.confiavel !== false,
      nSairam: f.n
    };
  }

  function fraseImpacto(imp) {
    if (!imp) return "";
    if (imp.reidentificacao) {
      return "Este arquivo saiu do exportador com identidades novas: praticamente todas as "
        + imp.nSairam + " peças foram trocadas por outras tantas. Não é demolição — é reexportação. "
        + "Conjuntos, tarefas e vistas montados na versão anterior não vão reencontrar as peças; "
        + "peça ao projetista para exportar mantendo o GlobalId.";
    }
    if (!imp.total) {
      return imp.nSairam
        ? "Nenhum conjunto, tarefa, vista ou conflito desta obra apontava para as peças que saíram."
        : "Nenhuma peça saiu nesta versão.";
    }
    var p = [];
    if (imp.porTipo.conjunto) p.push(imp.porTipo.conjunto + " conjunto(s)");
    if (imp.porTipo.tarefa) p.push(imp.porTipo.tarefa + " tarefa(s) do 4D");
    if (imp.porTipo.vista) p.push(imp.porTipo.vista + " ponto(s) de vista");
    if (imp.porTipo.conflito) p.push(imp.porTipo.conflito + " conflito(s)");
    return p.join(" · ") + " apontam para peça que não existe mais com a mesma identidade"
      + (imp.orfaos ? " — " + imp.orfaos + " ficou(aram) sem nenhuma peça" : "")
      + ". Nada foi apagado: confira antes de mexer, porque o projetista pode ter só reexportado.";
  }

  function fraseComparacao(c) {
    if (!c) return "";
    if (!c.confiavel) {
      return "Não dá para comparar com segurança: " + (c.semChave.antes + c.semChave.depois) +
        " peça(s) sem identidade estável no IFC. O que aparecer aqui é parcial.";
    }
    if (!c.mudou) return "Nada mudou entre as duas versões — as " + c.iguais + " peças estão onde estavam.";
    var p = [];
    if (c.entraram.length) p.push(c.entraram.length + " nova(s)");
    if (c.sairam.length) p.push(c.sairam.length + " removida(s)");
    if (c.moveram.length) p.push(c.moveram.length + " moveu(ram)");
    if (c.redimensionaram.length) p.push(c.redimensionaram.length + " mudou(aram) de tamanho");
    return p.join(" · ") + " — de " + c.totalAntes + " peça(s).";
  }

  /* ---------------------------------------------------------------
   * reconciliar — o que a obra consegue reabrir sozinha
   *
   * ⚠ O QUE FALTA SAI COM NOME. "Não consegui restaurar 1 modelo" manda o
   * usuário procurar no escuro; "falta Hidraulica.ifc" ele resolve em dez
   * segundos. Sem o nome, o recurso vira uma reclamação.
   * ------------------------------------------------------------- */
  function reconciliar(regs, arquivosEmCache, obraId) {
    var tem = {};
    var lista = arquivosEmCache || [];
    for (var i = 0; i < lista.length; i++) tem[txt(lista[i])] = 1;

    var abrir = [], faltando = [], semArquivo = [];
    var meus = daObra(regs, obraId);
    for (var j = 0; j < meus.length; j++) {
      var r = meus[j];
      var a = txt(r.arquivoId);
      if (!a) { semArquivo.push({ modeloId: r.modeloId, nome: r.nome }); continue; }
      if (tem[a]) abrir.push(r);
      else faltando.push({ modeloId: r.modeloId, nome: r.nome, arquivoId: a, disciplina: r.disciplina });
    }
    /* a ordem de abertura é a mesma sempre: sem isso o `mid` de sessão mudaria
       de ordem entre reaberturas e o que ainda depende dele ficaria instável */
    abrir.sort(function (x, y) { return txt(x.modeloId) < txt(y.modeloId) ? -1 : 1; });
    faltando.sort(function (x, y) { return txt(x.nome) < txt(y.nome) ? -1 : 1; });
    return { abrir: abrir, faltando: faltando, semArquivo: semArquivo, total: meus.length };
  }

  /* estado da obra que o viewer aplica no modelo restaurado */
  function paraViewer(reg) {
    if (!reg) return null;
    return {
      modeloId: txt(reg.modeloId), nome: txt(reg.nome), arquivoId: txt(reg.arquivoId),
      disciplina: txt(reg.disciplina), alpha: num(reg.alpha) || 1, visivel: reg.visivel !== false
    };
  }

  /* mapa que o viewer usa para saber, sem tocar no Store, qual é a vaga de um
     arquivo — é o que mantém a fronteira "viewer não chama Store" de pé */
  function mapaParaViewer(regs, obraId) {
    var meus = daObra(regs, obraId);
    var porArquivo = {}, porNome = {}, conteudoDaVaga = {};
    for (var i = 0; i < meus.length; i++) {
      var r = meus[i];
      if (txt(r.arquivoId)) porArquivo[txt(r.arquivoId)] = txt(r.modeloId);
      porNome[normalizarNome(r.nome)] = txt(r.modeloId);
      /* de que conteúdo é a vaga: sem isso não dá para saber se casar por nome
         estaria roubando a vaga de um modelo que já está aberto */
      conteudoDaVaga[txt(r.modeloId)] = txt(r.arquivoId);
    }
    return { obraId: txt(obraId), porArquivo: porArquivo, porNome: porNome, conteudoDaVaga: conteudoDaVaga };
  }

  /* ---------------------------------------------------------------
   * resolver — "qual é o modeloId deste arquivo?"
   *
   * Conteúdo primeiro, nome depois, derivado como último recurso.
   *
   * ⚠ E O NOME NÃO VALE QUANDO A VAGA JÁ ESTÁ OCUPADA POR OUTRO ARQUIVO
   * ABERTO. "ESTRUTURA.ifc" é o nome que o projetista entrega em toda obra, e
   * abrir o do Bloco A e o do Bloco B na mesma obra é rotina. Sem esta guarda,
   * o segundo herdava a âncora do primeiro: os dois modelos passavam a ter o
   * MESMO `modeloId`, e daí em diante remover um apagava o registro do outro,
   * e ajustar a transparência de um gravava no do outro. Dois prédios
   * diferentes com a mesma identidade é pior que nenhuma identidade.
   *
   * `abertos` é `{ modeloId: arquivoId }` do que está na cena agora — o viewer
   * sabe disso sem tocar no Store.
   * ------------------------------------------------------------- */
  function resolver(mapa, nome, arquivoId, abertos) {
    var m = mapa || {};
    var a = txt(arquivoId);
    if (a && m.porArquivo && m.porArquivo[a]) return m.porArquivo[a];
    var nn = normalizarNome(nome);
    var vaga = nn && m.porNome ? m.porNome[nn] : "";
    if (vaga) {
      var ocupadaPor = abertos ? txt(abertos[vaga]) : "";
      /* a vaga está em uso por um arquivo de OUTRO conteúdo: não é este modelo */
      if (!(ocupadaPor && a && ocupadaPor !== a)) return vaga;
    }
    /* o mesmo desempate de `cunhar`: se a vaga derivada existe e e de outro
       conteudo, este arquivo tem ancora propria — e a conta tem de bater com a
       que `aoAbrir` vai gravar, senao o viewer carimba uma coisa e o disco
       guarda outra */
    return cunhar(m.obraId, nome, arquivoId, m.conteudoDaVaga || {});
  }

  var BimFed = {
    ENTIDADE: ENTIDADE,
    normalizarNome: normalizarNome,
    modeloIdDerivado: modeloIdDerivado,
    registro: registro,
    daObra: daObra,
    cunhar: cunhar,
    casar: casar,
    aoAbrir: aoAbrir,
    reconciliar: reconciliar,
    paraViewer: paraViewer,
    mapaParaViewer: mapaParaViewer,
    resolver: resolver,
    /* o que mudou entre duas versões do mesmo arquivo */
    fotografar: fotografar,
    comparar: comparar,
    fraseComparacao: fraseComparacao,
    /* o que as pecas que sairam estavam carregando */
    impacto: impacto,
    fraseImpacto: fraseImpacto,
    REIDENT_FRACAO: REIDENT_FRACAO,
    TOLERANCIA_M: TOLERANCIA_M
  };

  global.BimFed = BimFed;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFed;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
