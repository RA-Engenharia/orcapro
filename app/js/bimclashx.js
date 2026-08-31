/* =====================================================================
 * bimclashx.js — CICLO DE VIDA da compatibilização (motor PURO, Node-testável).
 *
 * O `js/bimclash.js` continua sendo o DETECTOR: dá a lista de interferências
 * de uma rodada. Este arquivo cuida do que acontece ENTRE as rodadas — que é
 * onde o recurso deixa de ser demonstração e vira ferramenta.
 *
 * O problema real: o coordenador roda a compatibilização na segunda, manda o
 * relatório, recebe o modelo corrigido na sexta e roda de novo. Se cada rodada
 * for uma lista nova, ele perde tudo o que escreveu — responsável, prazo,
 * "esse aqui o projetista disse que é assim mesmo" — e recomeça a leitura dos
 * 300 conflitos do zero. Foi por isso que a maioria das equipes abandonou a
 * compatibilização depois da terceira reunião: não é a detecção que cansa, é
 * a releitura.
 *
 * A peça que resolve isso é a CHAVE ESTÁVEL (5.3): o conflito é identificado
 * pelo PAR DE PEÇAS, não pela posição na lista nem por um id sorteado. Ela só
 * é possível por causa do B0 — sem identidade durável de elemento, o mesmo
 * conflito muda de nome a cada reexportação do IFC e nada é herdado.
 *
 * TRÊS REGRAS QUE NÃO SE NEGOCIAM AQUI:
 *  1. Conflito que SUMIU não é apagado. Vira `resolvido_auto` com data. "Sumiu"
 *     é informação: ou alguém corrigiu, ou alguém APAGOU a peça — e o
 *     coordenador precisa saber qual dos dois. Apagar o registro esconde o
 *     segundo caso, que é o perigoso.
 *  2. Conflito que VOLTOU é marcado `reincidente`. Ele já tinha sido resolvido
 *     e reapareceu: alguém desfez a correção, e isso é a coisa mais importante
 *     da rodada. Sem a marca ele se mistura com os novos.
 *  3. `ignorado` exige MOTIVO. É o único status que faz um conflito sumir do
 *     radar por decisão humana; sem motivo escrito, ninguém na obra sabe se
 *     aquilo foi analisado ou se foi só alguém limpando a tela.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------------
   * Modos de teste (5.2)
   * ------------------------------------------------------------------- */
  var MODOS = {
    rigido: {
      rotulo: "Rígido",
      dica: "Interpenetração real entre as peças, com folga de tolerância. É o modo do dia a dia."
    },
    rigido_conservador: {
      rotulo: "Rígido conservador",
      dica: "Sem tolerância nenhuma: encostar já conta como conflito. Use quando o encaixe é justo e 5 mm importam."
    },
    folga: {
      rotulo: "Folga (clearance)",
      dica: "Peças que não se tocam mas passam perto demais. O tubo a 4 cm da viga não intersecta nada — e ainda assim não cabe a mão do montador nem o isolamento."
    },
    duplicados: {
      rotulo: "Duplicados",
      dica: "A mesma peça modelada duas vezes. Acontece toda vez que dois projetistas modelam a mesma coisa, e infla o quantitativo sem ninguém perceber."
    }
  };

  /* ---------------------------------------------------------------------
   * Ciclo de vida (5.4)
   *
   * `resolvido_auto` é do MOTOR: só ele põe e só ele tira. Deixar a tela
   * escrever esse status permitiria marcar como "resolvido pelo sistema" um
   * conflito que continua no modelo — mentira registrada com data.
   * ------------------------------------------------------------------- */
  var STATUS = {
    novo:           { rotulo: "Novo",              cor: "#2563eb", aberto: true,  soMotor: false },
    ativo:          { rotulo: "Em análise",        cor: "#f59e0b", aberto: true,  soMotor: false },
    revisado:       { rotulo: "Revisado",          cor: "#8b5cf6", aberto: true,  soMotor: false },
    aprovado:       { rotulo: "Aprovado",          cor: "#0ea5e9", aberto: true,  soMotor: false },
    resolvido:      { rotulo: "Resolvido",         cor: "#16a34a", aberto: false, soMotor: false },
    resolvido_auto: { rotulo: "Sumiu do modelo",   cor: "#16a34a", aberto: false, soMotor: true  },
    ignorado:       { rotulo: "Ignorado",          cor: "#94a3b8", aberto: false, soMotor: false }
  };
  var STATUS_MOTIVO_OBRIGATORIO = { ignorado: 1 };

  var TIPOS_LADO = { conjunto: 1, disciplina: 1, arquivo: 1, todos: 1 };
  var AGRUPAR = { elemento: 1, pavimento: 1, nenhum: 1 };

  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d || 0); }

  /* ---------------------------------------------------------------------
   * Hash curto, 64 bits em duas pistas FNV-1a independentes.
   *
   * ⚠ POR QUE NÃO 32 BITS. A chave é o que carrega o status. Numa obra com
   * 10 mil conflitos, 32 bits dão ~1% de chance de dois conflitos diferentes
   * caírem na mesma chave — e a colisão não aparece como erro: ela aparece
   * como um conflito herdando o "aprovado" de outro. Um conflito real some da
   * lista por parecer já resolvido. Com 64 bits isso deixa de ser um risco a
   * considerar.
   *
   * Duas pistas com offset e primo diferentes; concatenar o MESMO hash duas
   * vezes não acrescenta bit nenhum.
   * ------------------------------------------------------------------- */
  function hash64(s) {
    s = txt(s);
    var h1 = 0x811c9dc5, h2 = 0x01000193, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (h2 ^ c) >>> 0; h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
      h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    }
    var a = ("0000000" + h1.toString(16)).slice(-8);
    var b = ("0000000" + h2.toString(16)).slice(-8);
    return a + b;
  }

  /* ---------------------------------------------------------------------
   * 5.3 — a chave estável do conflito.
   *
   * `[chaveA, chaveB].sort()` deixa a chave INDEPENDENTE DA ORDEM: se o
   * coordenador inverter os lados do teste ("Hidráulica × Estrutura" em vez de
   * "Estrutura × Hidráulica"), o relatório se reorganiza mas nenhum status se
   * perde. Sem o sort, inverter os lados zeraria o histórico inteiro da obra.
   *
   * O MODO entra na chave de propósito: o mesmo par de peças detectado no modo
   * rígido e no modo folga são dois problemas diferentes — um é "atravessa", o
   * outro é "passa perto". Herdar o "aprovado" de um para o outro esconderia
   * o segundo.
   * ------------------------------------------------------------------- */
  function chave(a, b, modo) {
    var ka = txt(a && a.chaveA != null ? a.chaveA : a);
    var kb = txt(a && a.chaveA != null ? a.chaveB : b);
    var md = txt(a && a.chaveA != null ? (b || a.modo) : modo) || "rigido";
    if (!ka || !kb) return "";
    return hash64([ka, kb].sort().join("|") + "@" + md);
  }

  /* id do registro = teste + chave. A chave sozinha se repetiria entre testes
     (o mesmo par pode cair em dois testes salvos), e dois registros com o
     mesmo id no Store fariam um sobrescrever o outro na sincronização. */
  function idRegistro(testeId, ch) { return txt(testeId) + ":" + txt(ch); }

  /* ---------------------------------------------------------------------
   * 5.1 — o teste salvo
   * ------------------------------------------------------------------- */
  function lado(spec) {
    spec = spec || {};
    var tipo = txt(spec.tipo).toLowerCase();
    if (!TIPOS_LADO[tipo]) tipo = "todos";
    return { tipo: tipo, ref: txt(spec.ref) };
  }

  function teste(t) {
    t = t || {};
    var modo = txt(t.modo).toLowerCase();
    if (!MODOS[modo]) modo = "rigido";
    var ag = txt(t.agrupar).toLowerCase();
    if (!AGRUPAR[ag]) ag = "elemento";
    var r = t.regras || {};
    return {
      id: txt(t.id) || "",
      obraId: txt(t.obraId),
      nome: txt(t.nome) || "Teste sem nome",
      a: lado(t.a), b: lado(t.b),
      modo: modo,
      /* tolerância: abaixo disso, encostar não é conflito. No conservador ela
         é ZERO por definição do modo — deixar o usuário informar 5 mm num modo
         que existe justamente para não ter folga seria contradição silenciosa. */
      tolerancia: modo === "rigido_conservador" ? 0 : Math.max(0, num(t.tolerancia, 0.005)),
      folga: Math.max(0, num(t.folga, 0.30)),
      regras: {
        mesmoArquivo: !!r.mesmoArquivo,
        mesmoGrupo: !!r.mesmoGrupo,
        ignorarAprovados: r.ignorarAprovados !== false,
        ignorarFase: (r.ignorarFase || ["existente"]).map(function (f) { return txt(f).toLowerCase(); })
      },
      agrupar: ag,
      ultimaExecucao: t.ultimaExecucao || null,
      ativo: t.ativo !== false
    };
  }

  function validarTeste(t) {
    var e = [];
    t = t || {};
    if (!txt(t.nome).trim()) e.push("Dê um nome ao teste — é como ele aparece no relatório que o projetista recebe.");
    if (!txt(t.obraId)) e.push("O teste precisa estar ligado a uma obra.");
    var md = txt(t.modo).toLowerCase();
    if (md && !MODOS[md]) e.push('Modo desconhecido: "' + txt(t.modo) + '". Use ' + Object.keys(MODOS).join(", ") + ".");
    ["a", "b"].forEach(function (k) {
      var l = t[k] || {};
      var tp = txt(l.tipo).toLowerCase();
      if (tp && !TIPOS_LADO[tp]) e.push('Lado ' + k.toUpperCase() + ': tipo "' + txt(l.tipo) + '" não existe.');
      if (tp && tp !== "todos" && !txt(l.ref)) e.push("Lado " + k.toUpperCase() + ': escolha qual ' + tp + ".");
    });
    if (md === "folga" && num(t.folga, 0.30) <= 0) e.push("No modo folga, a folga tem de ser maior que zero — senão ele vira o modo rígido com outro nome.");
    var ag = txt(t.agrupar).toLowerCase();
    if (ag && !AGRUPAR[ag]) e.push('Agrupamento "' + txt(t.agrupar) + '" não existe.');
    return { ok: e.length === 0, erros: e };
  }

  /* ---------------------------------------------------------------------
   * Resolver um lado do teste em CHAVES do B0.
   *
   * O conjunto (B3) é resolvido pelo BimSet. Ele é injetável por `ctx.resolverConjunto`
   * para o teste não depender de ordem de carregamento — e porque um dia o
   * conjunto pode vir de outro lugar.
   * ------------------------------------------------------------------- */
  function chaveDe(el) {
    if (!el) return "";
    if (el.chave) return txt(el.chave);
    if (global.BimId && global.BimId.doElemento) { try { return txt(global.BimId.doElemento(el)); } catch (e) {} }
    return "";
  }

  function disciplinaDe(el) {
    if (!el) return "Outros";
    if (global.BIMClash && global.BIMClash.disciplinaDe) {
      try { return global.BIMClash.disciplinaDe(el.cat || el.tipo); } catch (e) {}
    }
    return txt(el.disciplina) || "Outros";
  }

  function arquivoDe(el) {
    if (!el) return "";
    if (el.arquivoId != null) return txt(el.arquivoId);
    var k = chaveDe(el);
    var i = k.indexOf("::");
    if (i > -1) return k.slice(0, i);
    return el.mid != null ? txt(el.mid) : "";
  }

  function resolverLado(spec, elementos, ctx) {
    ctx = ctx || {};
    var l = lado(spec), fora = {}, n = 0, avisos = [];
    (elementos || []).forEach(function (el) {
      var k = chaveDe(el); if (!k) return;
      var dentro = false;
      if (l.tipo === "todos") dentro = true;
      else if (l.tipo === "disciplina") dentro = disciplinaDe(el) === l.ref || txt(el.disciplina) === l.ref;
      else if (l.tipo === "arquivo") dentro = arquivoDe(el) === l.ref;
      if (dentro) { fora[k] = 1; n++; }
    });
    if (l.tipo === "conjunto") {
      fora = {}; n = 0;
      var chaves = null;
      if (typeof ctx.resolverConjunto === "function") chaves = ctx.resolverConjunto(l.ref);
      else if (global.BimSet && global.BimSet.resolver && ctx.conjuntos) {
        var cj = null;
        (ctx.conjuntos || []).forEach(function (c) { if (txt(c.id) === l.ref) cj = c; });
        if (cj) { try { var r = global.BimSet.resolver(cj, elementos || []); chaves = r && r.chaves; } catch (e) {} }
      }
      if (!chaves) avisos.push('O conjunto "' + l.ref + '" não foi encontrado — o lado ficou vazio, e um lado vazio não gera conflito nenhum.');
      /* ⚠ O CASO MUDO, E ELE E O PIOR. O conjunto EXISTE, mas a regra dele
         deixou de casar — o projetista republicou o IFC com o pavimento
         renomeado, por exemplo. Aí `chaves` volta [] e não null, o aviso
         acima não dispara, e o lado fica vazio SEM UMA LINHA na tela. A
         reconciliação então fecha a obra inteira como "sumiu do modelo". */
      else if (!chaves.length) avisos.push('O conjunto "' + l.ref + '" existe, mas não casou nenhuma peça do modelo aberto — a regra dele pode ter deixado de valer depois da última republicação do IFC.');
      (chaves || []).forEach(function (k) { if (!fora[k]) { fora[k] = 1; n++; } });
    }
    return { chaves: fora, total: n, avisos: avisos, spec: l };
  }

  /* ---------------------------------------------------------------------
   * Filtrar os brutos do detector: só o que está ENTRE os dois lados e passa
   * pelas regras (5.1).
   * ------------------------------------------------------------------- */
  function filtrar(brutos, t, elementos, ctx) {
    t = teste(t);
    var A = resolverLado(t.a, elementos, ctx), B = resolverLado(t.b, elementos, ctx);
    var porChave = {};
    (elementos || []).forEach(function (el) { var k = chaveDe(el); if (k) porChave[k] = el; });

    /* ⚠ COM UM ARQUIVO SÓ, A REGRA DO "MESMO ARQUIVO" CEGA O TESTE INTEIRO.
       Ela existe para o modelo FEDERADO, onde peça com peça do mesmo IFC é
       problema do projetista dele. Mas num IFC único combinado — que é o caso
       mais comum, e o que a tela pede quando diz "Carregue um modelo .IFC" —
       TODO par é do mesmo arquivo, e o teste devolve zero: um selo verde
       "Nenhum conflito" sobre pares que ninguém avaliou. É o mesmo falso
       "sem conflito" contra o qual o detector já se protege (ver a nota de
       js/bimclash.js sobre disciplina em modelo único). Se só há um arquivo
       na cena, a regra não separa nada e fica de fora — dizendo isso na
       contagem, para a tela não afirmar um descarte que não houve. */
    var arqs = {}, nArqs = 0;
    (elementos || []).forEach(function (el) { var a = arquivoDe(el); if (a && !arqs[a]) { arqs[a] = 1; nArqs++; } });
    var umArquivoSo = nArqs < 2;

    var out = [], descartados = { fora: 0, mesmoArquivo: 0, fase: 0, mesmoGrupo: 0 };
    (brutos || []).forEach(function (c) {
      var ka = txt(c.chaveA), kb = txt(c.chaveB);
      if (!ka || !kb || ka === kb) { descartados.fora++; return; }
      /* o par tem de ATRAVESSAR os lados; os dois nos dois lados não é conflito
         entre A e B, é conflito dentro do mesmo lado. */
      var straddle = (A.chaves[ka] && B.chaves[kb]) || (A.chaves[kb] && B.chaves[ka]);
      if (!straddle) { descartados.fora++; return; }
      var ea = porChave[ka], eb = porChave[kb];
      /* ⚠ O MODO DUPLICADOS E ISENTO DESTA REGRA, e sem a isencao ele nunca
         achava nada dentro de um modelo so — que e o caso mais comum: dois
         projetistas modelam a mesma viga no MESMO arquivo. A regra existe
         para o modo rigido, onde peca com peca do mesmo IFC e problema do
         projetista dele; no modo duplicados o mesmo arquivo E o alvo. E o
         criterio por GlobalId ja se protege sozinho (ver acharDuplicados:
         mesmo arquivo com o mesmo GlobalId e o proprio elemento). */
      if (t.modo !== "duplicados" && !t.regras.mesmoArquivo && !umArquivoSo && ea && eb && arquivoDe(ea) && arquivoDe(ea) === arquivoDe(eb)) { descartados.mesmoArquivo++; return; }
      if (t.regras.ignorarFase.length) {
        var fa = txt(ea && ea.fase).toLowerCase(), fb = txt(eb && eb.fase).toLowerCase();
        if (t.regras.ignorarFase.indexOf(fa) > -1 || t.regras.ignorarFase.indexOf(fb) > -1) { descartados.fase++; return; }
      }
      if (!t.regras.mesmoGrupo && ea && eb && ea.grupo != null && ea.grupo === eb.grupo) { descartados.mesmoGrupo++; return; }
      out.push(c);
    });
    return { brutos: out, descartados: descartados, ladoA: A, ladoB: B, umArquivoSo: umArquivoSo, avisos: A.avisos.concat(B.avisos) };
  }

  /* ---------------------------------------------------------------------
   * 5.3 + 5.4 — reconciliação.
   *
   * É aqui que a segunda rodada deixa de ser um recomeço.
   * ------------------------------------------------------------------- */
  function reconciliar(t, brutos, anteriores, opts) {
    opts = opts || {};
    t = teste(t);
    var quando = opts.quando || null;   /* injetado: o motor é puro e não lê relógio */
    var autor = txt(opts.autor);

    /* ⚠ NÃO MEDIU NÃO É AUSÊNCIA. Com um dos lados sem nenhuma peça — conjunto
       apagado, ou regra que deixou de casar — o filtro reprova TODOS os pares
       e o laço de ausência lá embaixo fecharia a obra inteira como "sumiu do
       modelo", com data e a nota dizendo que foi corrigido. Nada foi medido, e
       essa afirmação sai no relatório, na planilha e no BCF do projetista.
       O motor recusa a rodada em vez de aceitar o vazio como resposta — é o
       mesmo princípio do `soMotor` do resolvido_auto: só se marca "sumiu" o
       que foi efetivamente procurado. */
    if (opts.naoMedido) {
      var iguais = {};
      (anteriores || []).forEach(function (r) { if (r && r.id) iguais[r.id] = 1; });
      return {
        registros: (anteriores || []).slice(), naoMedido: true,
        novos: 0, mantidos: 0, migrados: 0, resolvidosAuto: 0,
        sumiramSemConfirmar: 0, reincidentes: 0, intocados: iguais,
        resumo: resumo(anteriores || [])
      };
    }

    /* ⚠ TROCAR O MODO DE UM TESTE NÃO PODE FECHAR A OBRA. O modo entra na
       chave de propósito (atravessar ≠ passar perto), mas o coordenador que
       edita um teste de "rígido" para "folga" está falando DAS MESMAS PEÇAS.
       Sem esta separação, nenhuma chave antiga batia: tudo virava
       `resolvido_auto` e reaparecia como `novo`, sem responsável, sem prazo,
       sem comentário — a lista dobrava de tamanho e o trabalho sumia.
       Os anteriores de OUTRO modo entram num índice pelo PAR DE PEÇAS, e o
       registro é MIGRADO: herda tudo e recebe a chave e o id do modo novo. */
    var antes = {}, porPar = {}, migrados = 0, aproveitados = {};
    (anteriores || []).forEach(function (r) {
      if (!r || !r.chave) return;
      if (!txt(r.modo) || txt(r.modo) === t.modo) { antes[r.chave] = r; return; }
      var pk = [txt(r.chaveA), txt(r.chaveB)].sort().join("|");
      if (!porPar[pk]) porPar[pk] = r;
    });

    var vistos = {}, registros = [], novos = 0, mantidos = 0, reincidentes = 0;

    (brutos || []).forEach(function (c) {
      var ch = chave(txt(c.chaveA), txt(c.chaveB), t.modo);
      if (!ch || vistos[ch]) return;          /* o detector pode devolver o par duas vezes */
      vistos[ch] = 1;
      var ant = antes[ch], veioDeOutroModo = false;
      if (!ant) {
        var pk2 = [txt(c.chaveA), txt(c.chaveB)].sort().join("|");
        if (porPar[pk2] && !aproveitados[porPar[pk2].id]) {
          ant = porPar[pk2];
          aproveitados[ant.id] = 1;
          veioDeOutroModo = true;
          migrados++;
        }
      }
      var base = {
        id: idRegistro(t.id, ch),
        obraId: t.obraId, testeId: t.id, chave: ch,
        chaveA: txt(c.chaveA), chaveB: txt(c.chaveB),
        discA: txt(c.discA), discB: txt(c.discB), par: txt(c.par),
        modo: t.modo,
        penetracao: num(c.penetracao, 0),
        distancia: c.distancia == null ? null : num(c.distancia, 0),
        severidade: txt(c.severidade) || "leve",
        centro: (c.centro || []).slice(0, 3).map(function (x) { return num(x, 0); }),
        geo: txt(c.geo) || ""
      };
      if (!ant) {
        novos++;
        registros.push(Object.assign({}, base, {
          status: "novo", responsavel: "", prazo: "", motivo: "",
          comentarios: [], vistaId: "", reincidente: false,
          criadoEm: quando, vistoEm: quando,
          historico: [{ em: quando, quem: autor, de: "", para: "novo", nota: "detectado" }]
        }));
        return;
      }
      if (!veioDeOutroModo) mantidos++;
      /* ⚠ AQUI ESTÁ O RECURSO. Tudo o que a pessoa escreveu sobrevive; só a
         geometria é atualizada, porque essa mudou de verdade.
         `base` vem depois de `ant` de propósito: ele carrega a chave, o id e
         o modo NOVOS, que é o que faz a migração funcionar. */
      var novo = Object.assign({}, ant, base, { vistoEm: quando });
      novo.comentarios = (ant.comentarios || []).slice();
      novo.historico = (ant.historico || []).slice();
      if (veioDeOutroModo) {
        novo.historico.push({ em: quando, quem: "", de: txt(ant.status), para: txt(ant.status),
          nota: "o teste passou do modo " + ((MODOS[txt(ant.modo)] || {}).rotulo || txt(ant.modo)) +
                " para " + ((MODOS[t.modo] || {}).rotulo || t.modo) +
                " — é o mesmo par de peças, e o histórico veio junto" });
      }
      if (ant.status === "resolvido_auto") {
        /* voltou. Não é "novo" — já teve dono, prazo e discussão; virar novo
           jogaria isso fora. E não pode ficar resolvido: ele está no modelo. */
        novo.status = "ativo";
        novo.reincidente = true;
        reincidentes++;
        novo.historico.push({ em: quando, quem: "", de: "resolvido_auto", para: "ativo", nota: "voltou a aparecer no modelo" });
      }
      registros.push(novo);
    });

    /* 3.1 — o que sumiu NÃO some daqui */
    var resolvidosAuto = 0, semConfirmar = 0, intocados = {}, porTroca = 0;
    (anteriores || []).forEach(function (r) {
      if (!r || !r.chave || vistos[r.chave]) return;
      /* já foi migrado para o modo novo: não é ausência, é o mesmo conflito
         com outra chave. Contá-lo aqui o faria virar `resolvido_auto` E
         reaparecer migrado — o mesmo par duas vezes na lista. */
      if (aproveitados[r.id]) return;
      var novo = Object.assign({}, r);
      if (r.status !== "resolvido_auto" && r.status !== "ignorado") {
        novo.status = "resolvido_auto";
        novo.resolvidoAutoEm = quando;
        novo.historico = (r.historico || []).slice();
        /* ⚠ SUMIR NÃO QUER DIZER O MESMO NOS DOIS CASOS, e a nota precisa
           dizer qual foi. Um conflito CONFIRMADO pela geometria que some foi
           corrigido (ou a peça foi apagada). Um que nunca chegou a ser
           confirmado — o refino não o alcançou dentro do orçamento de tempo —
           pode ter sumido só porque desta vez a verificação chegou nele e
           mediu folga de sobra. Chamar os dois de "corrigido" faz o
           coordenador dar por resolvido o que nunca foi problema, e pior:
           faz a máquina mais lenta gerar "correções" que ninguém fez. */
        /* ⚠ MODO DIFERENTE NÃO É "SUMIU DO MODELO". Quando o teste troca de
           modo, os conflitos do modo antigo que não existem no novo não foram
           CORRIGIDOS — a pergunta é que mudou. Um par que passava a 20 cm era
           conflito de folga e não é conflito rígido; a peça está onde sempre
           esteve. Dizer "corrigido, ou a peça foi apagada" transforma uma
           mudança de critério em conserto que ninguém fez — e o conflito que
           alguém tinha APROVADO passa a ler como resolvido.
           Medido no modelo real: trocar de folga para rígido fechava 489
           conflitos com essa nota. */
        var deOutroModo = !!txt(r.modo) && txt(r.modo) !== t.modo;
        var eraSuspeita = !deOutroModo && txt(r.geo) === "nao-verificavel";
        novo.sumiuSemConfirmar = eraSuspeita;
        novo.fechadoPorTroca = deOutroModo;
        novo.historico.push({ em: quando, quem: "", de: txt(r.status), para: "resolvido_auto",
          nota: deOutroModo
            ? ("saiu da lista porque o teste passou para o modo " + ((MODOS[t.modo] || {}).rotulo || t.modo) +
               " — ele era conflito de " + ((MODOS[txt(r.modo)] || {}).rotulo || txt(r.modo)) +
               " e a peça continua onde estava; nada foi corrigido")
            : eraSuspeita
              ? "não apareceu nesta rodada — mas ele nunca tinha sido confirmado pela geometria, então pode ser só a verificação que alcançou desta vez"
              : "não apareceu nesta rodada — corrigido, ou a peça foi apagada" });
        if (deOutroModo) porTroca++; else resolvidosAuto++;
        if (eraSuspeita) semConfirmar++;
      } else {
        /* ⚠ SAIU DAQUI BYTE A BYTE IGUAL — E ISSO PRECISA SER DITO A QUEM
           GRAVA. Regravar um registro que a rodada não tocou renova o carimbo
           `atualizadoEm`, e o merge da nuvem decide por ele: esta máquina
           passaria a VENCER a edição que outro aparelho fez no mesmo conflito
           enquanto isto rodava. O coordenador escreveria o responsável no
           celular e ele sumiria porque alguém apertou "Rodar" no computador. */
        intocados[novo.id] = 1;
      }
      registros.push(novo);
    });

    return {
      registros: registros,
      novos: novos, mantidos: mantidos, migrados: migrados,
      resolvidosAuto: resolvidosAuto, sumiramSemConfirmar: semConfirmar,
      fechadosPorTroca: porTroca,
      reincidentes: reincidentes, intocados: intocados,
      resumo: resumo(registros)
    };
  }

  /* ---------------------------------------------------------------------
   * Mudança de status pela mão do usuário (5.4)
   * ------------------------------------------------------------------- */
  function mudarStatus(reg, novoStatus, opts) {
    opts = opts || {};
    var st = txt(novoStatus);
    if (!STATUS[st]) return { ok: false, erro: 'Status "' + st + '" não existe.' };
    if (STATUS[st].soMotor) return { ok: false, erro: '"' + STATUS[st].rotulo + '" é do sistema, não se marca à mão — ele diz que o conflito não apareceu na última rodada. Marcar isso à mão registraria como resolvido um conflito que continua no modelo.' };
    var motivo = txt(opts.motivo).trim();
    if (STATUS_MOTIVO_OBRIGATORIO[st] && !motivo) {
      return { ok: false, erro: "Para ignorar um conflito é obrigatório escrever o motivo. Sem ele, daqui a três meses ninguém sabe se isso foi analisado ou só tirado da tela." };
    }
    var antes = txt(reg && reg.status);
    var novo = Object.assign({}, reg || {});
    novo.status = st;
    if (motivo) novo.motivo = motivo;
    if (opts.responsavel != null) novo.responsavel = txt(opts.responsavel);
    if (opts.prazo != null) novo.prazo = txt(opts.prazo);
    novo.historico = ((reg && reg.historico) || []).slice();
    novo.historico.push({ em: opts.quando || null, quem: txt(opts.autor), de: antes, para: st, nota: motivo });
    return { ok: true, registro: novo };
  }

  function comentar(reg, texto, opts) {
    opts = opts || {};
    var tx = txt(texto).trim();
    if (!tx) return { ok: false, erro: "Comentário vazio." };
    var novo = Object.assign({}, reg || {});
    novo.comentarios = ((reg && reg.comentarios) || []).slice();
    novo.comentarios.push({ em: opts.quando || null, quem: txt(opts.autor), texto: tx });
    return { ok: true, registro: novo };
  }

  /* ---------------------------------------------------------------------
   * 5.5 — agrupamento.
   *
   * ⚠ CADA CONFLITO EM UM GRUPO SÓ. Um conflito tem DUAS peças; agrupar "por
   * elemento" sem escolher uma delas põe o mesmo conflito em dois grupos, e o
   * coordenador conta 80 problemas onde há 40. O critério é o LADO A do teste:
   * é o lado que ele escolheu como assunto ("Estrutura × Hidráulica" agrupa
   * pelas peças de estrutura). Inverter A e B no teste reorganiza o relatório
   * sem perder status nenhum — a chave é independente da ordem de propósito.
   * ------------------------------------------------------------------- */
  function agrupar(registros, modo, elementos, ladoA) {
    modo = txt(modo).toLowerCase();
    if (!AGRUPAR[modo]) modo = "elemento";
    var porChave = {};
    (elementos || []).forEach(function (el) { var k = chaveDe(el); if (k) porChave[k] = el; });
    var setA = (ladoA && ladoA.chaves) || null;

    function ancora(r) {
      /* a peça do lado A; sem lado A resolvido, a menor chave — determinístico,
         que é o que importa para o mesmo conflito cair sempre no mesmo grupo. */
      if (setA) {
        if (setA[r.chaveA]) return r.chaveA;
        if (setA[r.chaveB]) return r.chaveB;
      }
      return r.chaveA < r.chaveB ? r.chaveA : r.chaveB;
    }

    if (modo === "nenhum") {
      return [{ id: "todos", rotulo: "Todos os conflitos", itens: (registros || []).slice() }];
    }
    var mapa = {}, ordem = [];
    (registros || []).forEach(function (r) {
      var k = ancora(r), el = porChave[k], gid, rot;
      if (modo === "pavimento") {
        rot = txt(el && (el.pavimento || el.nivel)) || "Sem pavimento";
        gid = "pav:" + rot;
      } else {
        gid = "el:" + k;
        rot = txt(el && (el.nome || el.tipo)) || k;
      }
      if (!mapa[gid]) { mapa[gid] = { id: gid, rotulo: rot, chave: modo === "elemento" ? k : "", itens: [] }; ordem.push(gid); }
      mapa[gid].itens.push(r);
    });
    var grupos = ordem.map(function (g) { return mapa[g]; });
    grupos.sort(function (p, q) { return q.itens.length - p.itens.length || (p.rotulo < q.rotulo ? -1 : 1); });
    return grupos;
  }

  /* ---------------------------------------------------------------------
   * Resumo para a tela e para o relatório
   * ------------------------------------------------------------------- */
  function resumo(registros) {
    var porStatus = {}, porSeveridade = { grave: 0, media: 0, leve: 0 }, porPar = {};
    var abertos = 0, fechados = 0, reincidentes = 0;
    Object.keys(STATUS).forEach(function (s) { porStatus[s] = 0; });
    (registros || []).forEach(function (r) {
      var s = txt(r.status) || "novo";
      porStatus[s] = (porStatus[s] || 0) + 1;
      if (STATUS[s] && STATUS[s].aberto) abertos++; else fechados++;
      if (r.reincidente) reincidentes++;
      var sv = txt(r.severidade) || "leve";
      porSeveridade[sv] = (porSeveridade[sv] || 0) + 1;
      if (r.par) porPar[r.par] = (porPar[r.par] || 0) + 1;
    });
    return { total: (registros || []).length, abertos: abertos, fechados: fechados, reincidentes: reincidentes, porStatus: porStatus, porSeveridade: porSeveridade, porPar: porPar };
  }

  /* Frase que o coordenador lê depois de rodar de novo. É o "pronto quando"
     do bloco: "12 resolvidos, 3 novos, 41 ainda ativos". */
  function frase(rec) {
    if (!rec) return "";
    var p = [];
    if (rec.naoMedido) return "nada foi medido nesta rodada — um dos lados do teste ficou vazio";
    if (rec.novos) p.push(rec.novos + " novo" + (rec.novos > 1 ? "s" : ""));
    if (rec.migrados) p.push(rec.migrados + (rec.migrados > 1 ? " migrados" : " migrado") + " do modo anterior");
    if (rec.fechadosPorTroca) p.push(rec.fechadosPorTroca + (rec.fechadosPorTroca > 1 ? " saíram" : " saiu") + " por troca de modo (nada foi corrigido)");
    /* ⚠ o plural de "sumiu" nao e "sumiuram". Colar sufixo no singular deu
       "97 sumiuram do modelo" na tela do modelo real — a frase que o
       coordenador le em toda rodada. Verbo irregular quer as duas formas
       escritas por extenso. */
    if (rec.resolvidosAuto) {
      var conf = rec.resolvidosAuto - (rec.sumiramSemConfirmar || 0);
      if (conf > 0) p.push(conf + (conf > 1 ? " sumiram" : " sumiu") + " do modelo");
      if (rec.sumiramSemConfirmar) p.push(rec.sumiramSemConfirmar + (rec.sumiramSemConfirmar > 1 ? " saíram" : " saiu") + " sem nunca ter sido confirmado");
    }
    if (rec.reincidentes) p.push(rec.reincidentes + (rec.reincidentes > 1 ? " voltaram" : " voltou"));
    var ab = rec.resumo ? rec.resumo.abertos : 0;
    p.push(ab + " em aberto");
    return p.join(" · ");
  }

  /* ---------------------------------------------------------------------
   * 5.2 — modo DUPLICADOS.
   *
   * Não é geometria de interferência: é identidade. Duas formas de duplicata:
   *  (a) o MESMO GlobalId em arquivos diferentes — o projetista exportou a
   *      mesma peça em dois modelos do federado;
   *  (b) caixa e tipo praticamente iguais em posições praticamente iguais —
   *      dois projetistas modelaram a mesma coisa sem saber.
   *
   * Isso não trava a obra como um conflito trava, mas infla o quantitativo:
   * o levantamento cobra duas vezes a mesma viga.
   * ------------------------------------------------------------------- */
  function acharDuplicados(elementos, opts) {
    opts = opts || {};
    var tol = num(opts.tolerancia, 0.01);       /* 1 cm */
    var porGlobal = {}, porGeom = {}, achados = [];

    function gidDe(el) {
      var k = chaveDe(el), i = k.indexOf("::");
      return i > -1 ? k.slice(i + 2) : "";
    }
    function q(x) { return Math.round(num(x, 0) / tol); }

    (elementos || []).forEach(function (el) {
      var k = chaveDe(el); if (!k) return;
      var g = gidDe(el);
      if (g) {
        if (!porGlobal[g]) porGlobal[g] = [];
        porGlobal[g].push(el);
      }
      var bb = el.aabb;
      if (bb && bb.min && bb.max) {
        var kk = [txt(el.tipo), q(bb.min[0]), q(bb.min[1]), q(bb.min[2]), q(bb.max[0]), q(bb.max[1]), q(bb.max[2])].join("|");
        if (!porGeom[kk]) porGeom[kk] = [];
        porGeom[kk].push(el);
      }
    });

    function emitir(lista, motivo) {
      for (var i = 0; i < lista.length; i++) for (var j = i + 1; j < lista.length; j++) {
        var ea = lista[i], eb = lista[j];
        var ka = chaveDe(ea), kb = chaveDe(eb);
        if (!ka || !kb || ka === kb) continue;
        /* mesmo arquivo com o mesmo GlobalId é o próprio elemento, não duplicata */
        if (motivo === "globalid" && arquivoDe(ea) === arquivoDe(eb)) continue;
        achados.push({
          chaveA: ka, chaveB: kb,
          discA: disciplinaDe(ea), discB: disciplinaDe(eb),
          par: [disciplinaDe(ea), disciplinaDe(eb)].sort().join(" × "),
          penetracao: 0, distancia: 0, severidade: "media",
          centro: ea.aabb ? [(num(ea.aabb.min[0]) + num(ea.aabb.max[0])) / 2, (num(ea.aabb.min[1]) + num(ea.aabb.max[1])) / 2, (num(ea.aabb.min[2]) + num(ea.aabb.max[2])) / 2] : [0, 0, 0],
          motivo: motivo, geo: "duplicado"
        });
      }
    }
    Object.keys(porGlobal).forEach(function (g) { if (porGlobal[g].length > 1) emitir(porGlobal[g], "globalid"); });
    Object.keys(porGeom).forEach(function (g) { if (porGeom[g].length > 1) emitir(porGeom[g], "geometria"); });

    /* o mesmo par pode cair nos dois critérios */
    var visto = {}, unicos = [];
    achados.forEach(function (c) {
      var k = [c.chaveA, c.chaveB].sort().join("|");
      if (visto[k]) return;
      visto[k] = 1; unicos.push(c);
    });
    return unicos;
  }

  var BimClashX = {
    MODOS: MODOS,
    STATUS: STATUS,
    TIPOS_LADO: TIPOS_LADO,
    AGRUPAR: AGRUPAR,
    hash64: hash64,
    chave: chave,
    idRegistro: idRegistro,
    lado: lado,
    teste: teste,
    validarTeste: validarTeste,
    resolverLado: resolverLado,
    filtrar: filtrar,
    reconciliar: reconciliar,
    mudarStatus: mudarStatus,
    comentar: comentar,
    agrupar: agrupar,
    resumo: resumo,
    frase: frase,
    acharDuplicados: acharDuplicados
  };

  global.BimClashX = BimClashX;
  if (typeof module !== "undefined" && module.exports) module.exports = BimClashX;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
