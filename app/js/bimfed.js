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
    resolver: resolver
  };

  global.BimFed = BimFed;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFed;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
