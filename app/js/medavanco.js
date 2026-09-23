/* =====================================================================
 * medavanco.js — MedAvanco: A MEDIÇÃO APROVADA COMO ORIGEM DO AVANÇO
 * LANÇADO por tarefa (ESPEC-medicao-cc §3; emenda E-MC0, que é a O28 da
 * ESPEC-planejador).
 *
 * POR QUE ESTE MÓDULO EXISTE
 * O avanço por tarefa do cronograma só sabia de duas coisas: o que alguém
 * digitou e o que os diários apuraram. Só que há obra em que o diário não
 * cobre tudo — "projetos, mobilização, licenças ficam perdidos" — e o
 * número que existe de verdade, item a item, está no BOLETIM DE MEDIÇÃO
 * aprovado. Este módulo transforma esse boletim numa SUGESTÃO de avanço
 * por nó da EAP, com a procedência escrita (`o:"medicao"` + lastro `b`).
 *
 * ⚠ ELE NÃO TOCA DINHEIRO, NÃO ESCREVE BOLETIM E NÃO GRAVA NADA.
 *   É motor puro: sem DOM, sem Store, sem Util. Tudo chega por parâmetro,
 *   inclusive as réguas dos outros módulos (`ehAprovado`, `modoDe`,
 *   `realizadoPorNo`, `chaveServico`, `eap`). O caminho que GRAVA é o
 *   `App._cronoGravarAvanco` da 1A, e só ele (O17: nunca o plano).
 *
 * ⚠ SOMA DE `pctPeriodo`, NUNCA `pctAnterior + pctPeriodo` (MC11).
 *   O `pctAnterior` é congelado na emissão do boletim: ele descreve o que o
 *   boletim ANTERIOR dizia naquele dia, não o que a obra acumulou. Somar os
 *   dois conta o mesmo serviço duas vezes — e a tarefa aparece concluída no
 *   cronograma com metade do serviço no chão. A mesma régua já está no
 *   `js/bimavanco.js` (`porItem[id] = min(100, soma de pctPeriodo)`); esta é
 *   a segunda leitora, e é por isso que ela mora AQUI, sozinha.
 *
 * ⚠ NUNCA CASAR POR DESCRIÇÃO, CÓDIGO OU NOME DE ETAPA (skill `dinheiro`,
 *   regra 1). O vínculo item → nó é `itemId` e mais nada. Item do boletim
 *   que não existe no orçamento do plano vira `fora`, com o recado dizendo o
 *   número do boletim — nunca some calado e nunca cai no nó vizinho.
 *
 * ⚠ ES5 (sem const/let/arrow/template/class/includes/find/Object.assign/
 *   Object.values/padStart): o produto roda em WebView de instalador antigo,
 *   e já quebrou por isso.
 *
 * DONO: fatia `mc-5C` MEDAVANCO da ESPEC-medicao-cc (§8.3).
 * ⚠ ESTE ARQUIVO FOI ESCRITO PELA `mc-6B` porque a `mc-5C` NUNCA EXISTIU: a
 *   Onda 5 foi integrada no `claude/planejador` sem ela (medido com
 *   `git ls-tree -r` em todos os branches `claude/mc-*` e `claude/pl-*`:
 *   zero ocorrências de "medavanco"). A `mc-6B` inteira consome este módulo
 *   — sem ele a fatia não tem como existir. A forma segue a §1.14 da espec
 *   palavra por palavra, para a `mc-5C` (se voltar) poder substituí-lo sem
 *   mexer em uma linha da fiação.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* módulo irmão resolvido NA HORA da chamada (em Node, pelo require
     relativo) — o mesmo padrão do cronoavanco.js e do custoetapa.js */
  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function ehObj(v) { return !!v && typeof v === "object" && !ehLista(v); }
  function arr(v) { return ehLista(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? "" : v).replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  function iso10(v) {
    var s = txt(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }
  function pct1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function copiaEntrada(e) {
    var c = {}, k;
    for (k in e) if (own(e, k)) c[k] = e[k];
    return c;
  }

  /* ⚠ O QUE UMA SUGESTÃO ESCREVE NA ENTRADA — UMA REGRA SÓ, COM DOIS DONOS:
     o `aplicar` (que grava) e a linha 5 das `sugestoes` (que decide se HÁ o
     que gravar). Roteiro do defeito (revisão adversarial da mc-7A,
     22/09/2026): a linha 5 emitia `recalcular` para TODA entrada
     `o:"medicao"`, mesmo com número, datas e lastro iguais. O `aplicar`
     descartava por idempotência (nada gravado — certo), mas a faixa contava a
     sugestão como pendente: logo depois do toast "Avanço lançado em 1
     tarefa(s) (4.3), pela medição C1", o Cronograma mostrava "medição C1
     aprovada sem lançar", e nenhuma porta a limpava — [Puxar das medições]
     gravava e a faixa continuava, sair e voltar também. E o recado do
     [Puxar] listava "2 tarefa(s) (4.1, 4.2, 4.3)": três nomes para duas
     mudanças. Duas contas da mesma pergunta ("isto muda a entrada?")
     divergem na primeira manutenção; por isso as duas pontas chamam esta.
     Devolve `false` quando a entrada NÃO PODE ser gravada — e aí `alvo` fica
     como estava. */
  function gravarNaEntrada(alvo, s, corte, semOrigem) {
    var p = (s && s.pMed != null) ? pct1(s.pMed) : null;
    if (p == null) return false;
    /* garantia `i ≤ f ≤ corte` (§3.5): fora disso a entrada NÃO entra —
       uma data impossível faz o motor do planejador DESCARTAR a entrada
       inteira na leitura seguinte, e o realizado da tarefa some */
    var i = iso10(s.i), f = iso10(s.f);
    if (!i || i > corte) return false;
    if (f && (f < i || f > corte)) f = null;
    alvo.p = f ? 100 : p;
    alvo.i = i;
    alvo.f = f || null;
    alvo.em = corte;
    if (semOrigem) { delete alvo.o; delete alvo.b; }   // entrada DIGITADA (K36)
    else {
      alvo.o = "medicao";
      /* ⚠ `o:"medicao"` SEM `b` vale como digitado no motor (E-MC1), com o
         aviso `avanco-medicao-sem-lastro`: sem lastro não há [Rever], e a
         procedência some. Então a entrada só nasce com a origem quando tem
         o boletim. */
      if (s.b) alvo.b = txt(s.b);
      else delete alvo.o;
    }
    return true;
  }
  /* o retrato que decide "mudou?": número, datas, origem e lastro — o que a
     tela mostra e o motor lê. `em` fica de fora de propósito: ele é a data
     de corte do lançamento, e regravar só para trocá-la mandaria à nuvem um
     `atualizadoEm` novo sem número novo (o merge do `crono_obra` é por
     registro inteiro: isso é perder a edição de outro aparelho por nada). */
  function retrato(e) {
    return { p: e.p == null ? null : e.p, i: e.i || null, f: e.f || null, o: e.o || null, b: e.b || null };
  }
  function mesmoRetrato(a, b) {
    return a.p === b.p && a.i === b.i && a.f === b.f && a.o === b.o && a.b === b.b;
  }

  /* o item está fechado quando o acumulado chega aqui. Não é 100 cravado
     porque o acumulado é soma de percentuais com uma casa: três parcelas de
     33,3 fecham 99,9 e a tarefa ficaria eternamente em aberto. */
  var FECHA = 99.95;
  /* diferença mínima para chamar de divergência (as duas pontas vêm de
     `pct1`, com uma casa): abaixo disso é ruído de arredondamento */
  var EPS_PP = 0.5;

  var MedAvanco = {
    pronto: true,
    _dep: dep,
    FECHA: FECHA,
    EPS_PP: EPS_PP,

    /* A DATA DO BOLETIM (§3.3): o fim do período medido; sem ele, a data do
       boletim. ⚠ É ela que decide o corte e a ordem — nunca o `atualizadoEm`,
       que muda quando alguém só reabre e fecha o boletim. */
    dataRef: function (m) {
      if (!ehObj(m)) return "";
      return iso10(m.periodoFim) || iso10(m.data) || "";
    },

    /* A ORDEM DETERMINÍSTICA (§3.3): (dataRef, numero, id). Devolve a chave
       de comparação — a mesma em todo aparelho, que é o que faz duas máquinas
       escolherem o MESMO boletim como lastro.
       ⚠ O `numero` entra com os dígitos preenchidos à esquerda, senão "10a"
         viria antes de "2a" na comparação de texto e o lastro trocaria de
         boletim entre aparelhos que gravaram na ordem inversa. */
    ordem: function (m) {
      if (!ehObj(m)) return "￿|￿|￿";
      var n = txt(m.numero);
      var pad = n.replace(/\d+/g, function (d) { return ("0000000000" + d).slice(-10); });
      return this.dataRef(m) + "|" + pad + "|" + txt(m.id);
    },

    /* OS BOLETINS QUE CONTAM (§3.2).
       `reguas` = {ehAprovado(status), modoDe(m)} — RECEBIDAS, nunca copiadas:
       `Gestao._ehAprovado` e `Gestao._medModo` são as réguas da casa, e uma
       segunda cópia aqui divergiria na primeira manutenção (memória "réplica
       de parser apodrece").
       `familia` = {orcamentoId: true} da família de revisões do orçamento do
       plano (`CronoPlan.familiaIds`, MC8) — a revisão irmã e a anterior
       contam; orçamento de fora da família, não.
       ⚠ `lancarAvanco !== false` (três estados, §1.3): `false` é decisão da
         pessoa ("este boletim não entra no avanço" — adiantamento, marco
         contratual, material não instalado); AUSENTE é boletim legado e CONTA
         como sugestão. Ler `=== true` deixaria todo boletim anterior a esta
         versão fora da conta, calado. */
    contam: function (meds, reguas, obraId, familia) {
      var self = this, R = reguas || {}, ob = txt(obraId), out = [];
      var fam = ehObj(familia) ? familia : null;
      arr(meds).forEach(function (m) {
        if (!ehObj(m) || m.id == null) return;
        if (txt(m.obraId) !== ob) return;
        if (typeof R.ehAprovado !== "function" || !R.ehAprovado(m.status)) return;
        if (typeof R.modoDe !== "function" || R.modoDe(m) !== "orcamento") return;   // só "por itens"
        if (m.lancarAvanco === false) return;
        if (fam && !own(fam, txt(m.orcamentoId))) return;
        out.push(m);
      });
      out.sort(function (a, b) { var ka = self.ordem(a), kb = self.ordem(b); return ka < kb ? -1 : (ka > kb ? 1 : 0); });
      return out;
    },

    /* OS DOIS MAPAS DOS BOLETINS (§1.14, EM-3/EM-4).
       `ordemB` = {medId: posição} pela `ordem` da §3.3 (0 = o mais antigo);
       `numeroB` = {medId: numero} para o rótulo "medição NNa".
       ⚠ TODOS OS BOLETINS DA OBRA, na lista CRUA: qualquer status, qualquer
         modo, inclusive rejeitado, reaberto e por valor. É de propósito —
         estes mapas existem para NOMEAR um boletim cujo id já está gravado no
         avanço (`b`), e um boletim reaberto continua tendo nome. Filtrar por
         "conta" aqui faria a faixa "a medição 01a foi reaberta" sair escrita
         "a medição demo-galpao-med-01 foi reaberta".
       ⚠ Um mapa só, montado UMA vez por abertura, passado aos três leitores
         (`resumirConcluidas`, `confrontoPorNo`, `sugestoesDoDiario`): dois
         mapas com a mesma regra dariam duas respostas na primeira
         manutenção. */
    mapasB: function (meds, obraId) {
      var self = this, ob = txt(obraId), lista = [];
      arr(meds).forEach(function (m) {
        if (!ehObj(m) || m.id == null) return;
        if (txt(m.obraId) !== ob) return;
        lista.push(m);
      });
      lista.sort(function (a, b) { var ka = self.ordem(a), kb = self.ordem(b); return ka < kb ? -1 : (ka > kb ? 1 : 0); });
      var ordemB = {}, numeroB = {}, i;
      for (i = 0; i < lista.length; i++) {
        ordemB[txt(lista[i].id)] = i;
        if (lista[i].numero != null && lista[i].numero !== "") numeroB[txt(lista[i].id)] = txt(lista[i].numero);
      }
      return { ordemB: ordemB, numeroB: numeroB };
    },

    /* QUANTO DE CADA ITEM JÁ FOI MEDIDO E APROVADO (§3.3) — o dono único
       desta pergunta.
       `meds` já filtrada pelo `contam` e ORDENADA. `opts.corte` corta por
       `dataRef`. Devolve {acum, primeiro, ultimo, fechouEm, fora}:
         acum[itemId]     = min(100, Σ pctPeriodo)
         primeiro[itemId] = dataRef do 1º boletim que mediu o item
         ultimo[itemId]   = {b, dataRef} do boletim de MAIOR ordem que o mediu
         fechouEm[itemId] = dataRef do boletim em que o acumulado passou de 99,95
         fora             = [{itemId, boletim, numero, motivo}]
       ⚠ `itemExiste` é injetada: sem ela o acumulado somaria item de um
         orçamento que o plano não conhece, e o percentual do nó sairia
         inflado sem ninguém ver de onde. */
    acumuladoPorItem: function (meds, opts) {
      opts = opts || {};
      var corte = iso10(opts.corte), existe = typeof opts.itemExiste === "function" ? opts.itemExiste : null;
      var self = this, acum = {}, primeiro = {}, ultimo = {}, fechouEm = {}, fora = [], foraVis = {};
      arr(meds).forEach(function (m) {
        var dr = self.dataRef(m);
        if (corte && dr && dr > corte) return;          // depois do corte: não entra (§3.6)
        arr(m.itens).forEach(function (it) {
          if (!ehObj(it)) return;
          var id = txt(it.itemId);
          if (!id) return;
          if (existe && !existe(id)) {
            var k = id + "|" + txt(m.id);
            if (!own(foraVis, k)) {
              foraVis[k] = 1;
              fora.push({ itemId: id, boletim: txt(m.id), numero: txt(m.numero), motivo: "fora-do-orcamento" });
            }
            return;
          }
          var p = num(it.pctPeriodo);
          if (!(p > 0)) return;
          var antes = own(acum, id) ? acum[id] : 0;
          var depois = Math.min(100, pct1(antes + p));
          acum[id] = depois;
          if (!own(primeiro, id)) primeiro[id] = dr;
          /* a lista chega ORDENADA pela `ordem`: o último que escreve é o de
             maior ordem, que é exatamente o lastro que a §3.3 pede */
          ultimo[id] = { b: txt(m.id), dataRef: dr };
          if (antes < FECHA && depois >= FECHA) fechouEm[id] = dr;
        });
      });
      return { acum: acum, primeiro: primeiro, ultimo: ultimo, fechouEm: fechouEm, fora: fora };
    },

    /* AS LINHAS SINTÉTICAS no formato do `Fisico.porServico` (§3.4-2), para o
       `CronoPlan.realizadoPorNo` pesar o item pelo MESMO valor que o previsto
       × realizado usa (MC9: perguntas diferentes, nó igual).
       ⚠ A CHAVE SAI DO `Avanco.chaveServico` RECEBIDO, e a unidade e a
         quantidade saem do NÓ DO ORÇAMENTO (não do boletim): é assim que o
         `realizadoPorNo` reconhece a linha pelo `porChave`. Montar a chave
         com a unidade escrita no boletim ("m2" contra "m²") faria a linha
         cair em `naoApropriadas` e o nó ficar em 0% — calado. */
    linhasSinteticas: function (nosServico, ac, opts) {
      opts = opts || {};
      var chaveServico = opts.chaveServico;
      if (typeof chaveServico !== "function" || !ehObj(ac) || !ehObj(ac.acum)) return [];
      var out = [];
      arr(nosServico).forEach(function (n) {
        if (!ehObj(n) || n.itemId == null || n.itemId === "") return;
        var id = txt(n.itemId);
        if (!own(ac.acum, id)) return;
        var p = ac.acum[id];
        if (!(p > 0)) return;
        var q = num(n.quantidade);
        if (!(q > 0)) return;
        var u = (ac.ultimo && ac.ultimo[id]) || { dataRef: "" };
        out.push({ chave: chaveServico({ origem: "orcamento", refId: id, unidade: n.unidade }),
          refId: id, origem: "orcamento", unidade: txt(n.unidade), numero: txt(n.numero), descricao: txt(n.nome),
          previsto: q, lancamentos: [{ data: u.dataRef, qtd: r2(q * p / 100) }] });
      });
      return out;
    },

    /* O QUE AS MEDIÇÕES DIZEM POR NÓ (§3.4 e §3.5; forma da §1.14).
       opts = {corte, obraId, familia, ehAprovado, modoDe, valores, calc,
               opcionaisIncluidos, ordemB,
               realD (o realizado dos DIÁRIOS, do mesmo `realizadoPorNo`),
               iniObra (o início da obra, ISO) e iniPlan ({noId: ISO}, o
                 início PLANEJADO de cada nó no `Cronograma.semAvanco`) — as
                 duas primeiras parcelas do `i` da §3.5,
               CronoPlan, Cronograma, Avanco (injetáveis)}
       Devolve {ok, porNo, fora, avisos, real, acumulado, boletins}. */
    porNo: function (meds, orc, opts) {
      opts = opts || {};
      var self = this, avisos = [], fora = [];
      var CP = opts.CronoPlan || dep("CronoPlan", "./cronoplan.js");
      var Cr = opts.Cronograma || dep("Cronograma", "./cronograma.js");
      var Av = opts.Avanco || dep("Avanco", "./avancoservico.js");
      if (!CP || typeof CP.realizadoPorNo !== "function" || !Cr || typeof Cr.eap !== "function" || !Av || typeof Av.chaveServico !== "function") {
        return { ok: false, porNo: {}, fora: [], avisos: [{ tipo: "medavanco-sem-modulo",
          msg: "os módulos do cronograma não carregaram — a medição não entra no avanço." }] };
      }
      if (!ehObj(orc) || !arr(orc.etapas).length) {
        return { ok: false, porNo: {}, fora: [], avisos: [{ tipo: "medavanco-sem-orcamento",
          msg: "o plano da obra não tem orçamento com etapas — a medição não entra no avanço." }] };
      }
      var corte = iso10(opts.corte);
      var contando = this.contam(meds, { ehAprovado: opts.ehAprovado, modoDe: opts.modoDe }, opts.obraId, opts.familia);
      var nos = [];
      try { nos = Cr.eap(orc, opts.calc || null) || []; } catch (eE) { nos = []; }
      var servicos = [], porItem = {};
      arr(nos).forEach(function (n) {
        if (!n || n.tipo !== "servico") return;
        servicos.push(n);
        if (n.itemId != null && n.itemId !== "") porItem[txt(n.itemId)] = n;
      });
      var ac = this.acumuladoPorItem(contando, { corte: corte, itemExiste: function (id) { return own(porItem, id); } });
      ac.fora.forEach(function (f) {
        fora.push(f);
        avisos.push({ tipo: "medavanco-item-fora", msg: "o item " + f.itemId + " do boletim " + (f.numero || f.boletim) +
          " não existe mais no orçamento do plano: não entra no avanço." });
      });
      var linhas = this.linhasSinteticas(servicos, ac, { chaveServico: Av.chaveServico });
      var real = CP.realizadoPorNo(orc, linhas, { valores: opts.valores, dataCorte: corte,
        opcionaisIncluidos: opts.opcionaisIncluidos, calc: opts.calc || null });
      if (!real || real.erro) {
        return { ok: false, porNo: {}, fora: fora, avisos: avisos.concat([{ tipo: "medavanco-sem-realizado",
          msg: (real && real.erro) || "não consegui apurar o que as medições dizem por tarefa." }]) };
      }
      /* OS ITENS DE CADA NÓ. A régua do PERCENTUAL é a do `realizadoPorNo`
         (MC9); o `b`, o `i` e o `f` saem dos boletins que mediram os itens
         DAQUELE nó, e para isso o item precisa subir por toda a linha de pais
         (o mesmo nó é folha no modo executivo e etapa no padrão). */
      var itensDe = {};
      arr(real.ordem).forEach(function (id) { itensDe[id] = { lista: [], vistos: {} }; });
      arr(real.ordem).forEach(function (sid) {
        var s = real.porNo[sid];
        if (!s || s.tipo !== "servico" || s.itemId == null || s.itemId === "") return;
        var it = txt(s.itemId), no = sid, g = 0;
        while (no && own(itensDe, no) && g++ < 60) {
          if (!own(itensDe[no].vistos, it)) { itensDe[no].vistos[it] = 1; itensDe[no].lista.push(it); }
          no = real.porNo[no] ? real.porNo[no].paiId : null;
        }
      });
      var realD = ehObj(opts.realD) ? opts.realD : null;
      var out = {};
      arr(real.ordem).forEach(function (id) {
        var no = real.porNo[id];
        if (!no) return;
        var itens = (itensDe[id] || { lista: [] }).lista, medidos = [], i;
        for (i = 0; i < itens.length; i++) if (own(ac.acum, itens[i]) && ac.acum[itens[i]] > 0) medidos.push(itens[i]);
        if (!medidos.length) return;          // nenhum item deste nó foi medido: o nó não é assunto da medição
        /* o lastro do nó = o boletim de MAIOR ordem entre os que mediram
           qualquer item dele (§3.5 linha 5) */
        var melhor = null;
        for (i = 0; i < medidos.length; i++) {
          var u = ac.ultimo[medidos[i]];
          if (!u) continue;
          if (melhor == null || self._maisNovo(u.b, melhor.b, opts.ordemB)) melhor = u;
        }
        /* DATAS (§3.5): `f` só quando TODOS os itens do nó fecharam — um item
           a 40% não conclui a tarefa, e item do nó que nenhum boletim mediu
           também não.
           `i` = max(obra.inicio, min(início PLANEJADO do nó, dataRef do 1º
           boletim que mediu o nó)).
           ⚠ AS TRÊS PARCELAS, E NÃO SÓ A TERCEIRA (achado médio da revisão da
             Onda 6, 22/09/2026). Roteiro do defeito: com o `i` sendo só o
             `dataRef` do primeiro boletim, a barra de realizado nascia COLADA
             NO FIM do período medido — a 3.1 do galpão, planejada em dois
             dias, saía com `i = f = 31/07`. O boletim mede um PERÍODO; numa
             obra em que o primeiro boletim fecha um trimestre, a barra de
             realizado nasceria no fim do trimestre. E, sem o piso do início
             da obra, um boletim legado com `periodoFim` anterior ao início
             escreve data antes do início (a `validarEntrada` da 1A confere
             `i > corte`, nunca `i < início da obra`).
           ⚠ NUNCA INVENTAR DATA: sem o plano (`iniPlan`) ou sem o início da
             obra (`iniObra`), cada parcela que falta simplesmente não entra —
             o resultado é o comportamento anterior, nunca uma data deduzida. */
        var pIni = null;
        for (i = 0; i < medidos.length; i++) {
          var d = ac.primeiro[medidos[i]];
          if (d && (pIni == null || d < pIni)) pIni = d;
        }
        var iPlan = (ehObj(opts.iniPlan) && own(opts.iniPlan, id)) ? iso10(opts.iniPlan[id]) : "";
        if (iPlan && pIni && iPlan < pIni) pIni = iPlan;
        var iObra = iso10(opts.iniObra);
        if (iObra && pIni && pIni < iObra) pIni = iObra;
        var todosFecharam = medidos.length === itens.length, fMax = null;
        for (i = 0; todosFecharam && i < medidos.length; i++) {
          if (!(ac.acum[medidos[i]] >= FECHA)) { todosFecharam = false; break; }
          var df = ac.fechouEm[medidos[i]];
          if (df && (fMax == null || df > fMax)) fMax = df;
        }
        out[id] = { p: no.pct == null ? null : pct1(no.pct), i: pIni, f: (todosFecharam && fMax) ? fMax : null,
          b: melhor ? melhor.b : null,
          bNumero: (melhor && ehObj(opts.numeroB) && own(opts.numeroB, melhor.b)) ? opts.numeroB[melhor.b] : null,
          itens: itens.length, itensMedidos: medidos.length,
          semDiario: self.semDiario(realD, id) };
      });
      return { ok: true, porNo: out, fora: fora, avisos: avisos, real: real, acumulado: ac, boletins: contando };
    },

    /* desempate entre dois lastros, pela `ordemB` quando ela existe. Sem o
       mapa, o maior id — determinístico, mesmo que arbitrário. */
    _maisNovo: function (b, ref, ordemB) {
      if (ehObj(ordemB) && own(ordemB, b) && own(ordemB, ref)) return ordemB[b] > ordemB[ref];
      return txt(b) > txt(ref);
    },

    /* "TAREFA SEM DIÁRIO" (§3.4-4): no realizado DOS DIÁRIOS até o corte,
       nenhum serviço do nó tem `ligado === true`.
       ⚠ `ligado`, e não `pct > 0`: um serviço lançado com quantidade zero (ou
         só refeito) tem `ligado: true` e 0% — o diário FALOU daquela tarefa,
         e a medição não manda em tarefa de que o diário já fala.
       ⚠ TRÊS RESPOSTAS, e a terceira é `null` = "NÃO CONSEGUI PERGUNTAR"
         (achado médio da revisão da Onda 6, 22/09/2026). O fail-closed sempre
         esteve certo — a medição não completa tarefa sobre a qual não
         conseguiu perguntar —, mas ele devolvia `false`, e `false` quer dizer
         "o diário TEM o nó". Roteiro do defeito: `App._medccDados` devolve
         `realD = null` em qualquer falha de leitura dos diários (e o
         `realizadoPorNo` também pode devolver `{erro}`); com isso a linha 4
         da precedência lia "o diário passou a ter o nó" e a faixa escrevia
         "📓 3.1 passou a ter lançamento nos diários", oferecendo [Usar o
         diário] — que respondia "Os diários ainda não apuram esta tarefa". O
         app afirmava um fato na faixa e o desmentia no clique seguinte.
         Recado que mente é pior que recado nenhum. */
    semDiario: function (realD, noId) {
      if (!ehObj(realD) || !ehObj(realD.porNo)) return null;
      var no = realD.porNo[noId];
      if (!no) return null;
      if (no.tipo === "servico") return no.ligado !== true;
      var ordem = arr(realD.ordem), i, achouFilho = false;
      for (i = 0; i < ordem.length; i++) {
        var s = realD.porNo[ordem[i]];
        if (!s || s.tipo !== "servico") continue;
        var pai = s.paiId, g = 0, dentro = false;
        while (pai && g++ < 60) {
          if (pai === noId) { dentro = true; break; }
          pai = realD.porNo[pai] ? realD.porNo[pai].paiId : null;
        }
        if (!dentro) continue;
        achouFilho = true;
        if (s.ligado === true) return false;
      }
      return achouFilho;
    },

    /* AS SUGESTÕES, UMA POR NÓ, PELA PRECEDÊNCIA DA §3.5.
       `rec` = registro de avanço; `medP` = saída do `porNo`; `realD` = o
       realizado dos diários. `opts` = {modo ("aprovar"|"puxar"), gatilho
       (medId), nosDoGatilho ({noId:true}), marcadas ({noId:true}), nomes
       ({noId:{numero,nome}}), numeroB, contam ({medId:true} os que ainda
       contam), paiDe ({noId: paiId}), CronoAvanco}.
       ⚠ A ORDEM DAS LINHAS É A DA TABELA DA ESPEC, e a primeira que casa
         decide. Trocar duas de lugar muda o que o canal faz com a tarefa —
         por isso elas estão numeradas aqui como lá. */
    sugestoes: function (rec, medP, realD, opts) {
      opts = opts || {};
      var A = opts.CronoAvanco || dep("CronoAvanco", "./cronoavanco.js");
      var out = [], nomes = ehObj(opts.nomes) ? opts.nomes : {}, num = ehObj(opts.numeroB) ? opts.numeroB : {};
      var conta = ehObj(opts.contam) ? opts.contam : null;
      var aprovar = opts.modo === "aprovar", gat = txt(opts.gatilho);
      var marcadas = ehObj(opts.marcadas) ? opts.marcadas : null;
      var L = (A && typeof A.ler === "function") ? A.ler(rec, {}) : { porId: {}, lista: [] };
      var porId = L.porId || {};
      /* as entradas CRUAS do registro, por id: é sobre elas que o `aplicar`
         grava, e é com elas que a linha 5 compara (não com a cópia de
         leitura do `CronoAvanco.ler`, que pode normalizar campo) */
      var cruPorId = {}, corteRec = iso10(rec && rec.corte);
      arr(rec && rec.nos).forEach(function (e) { if (ehObj(e) && e.id != null) cruPorId[txt(e.id)] = e; });
      /* as etapas com entrada `rs:1` (resumida): TODAS as folhas delas estão
         cobertas (linha 1). O mapa é montado uma vez. */
      var resumidas = {};
      arr(L.lista).forEach(function (e) { if (e && e.rs === 1) resumidas[e.id] = 1; });
      var paiDe = ehObj(opts.paiDe) ? opts.paiDe : {};
      function cobertaPorRs(id) {
        if (own(resumidas, id)) return true;
        var p = paiDe[id], g = 0;
        while (p && g++ < 60) { if (own(resumidas, p)) return true; p = paiDe[p]; }
        return false;
      }
      var mp = (medP && ehObj(medP.porNo)) ? medP.porNo : {};
      var ids = [], k;
      for (k in mp) if (own(mp, k)) ids.push(k);
      ids.sort();
      ids.forEach(function (id) {
        var m = mp[id];
        if (!m || m.p == null) return;
        var at = own(porId, id) ? porId[id] : null;
        var nm = nomes[id] || {};
        var s = { id: id, numero: txt(nm.numero), nome: txt(nm.nome) || id, acao: null, pMed: m.p,
          pDiario: null, pAvanco: at ? (at.f ? 100 : (at.p == null ? 0 : at.p)) : null,
          origemAvanco: at ? (at.o || "digitado") : null, i: m.i, f: m.f, b: m.b,
          bNumero: m.b && own(num, m.b) ? num[m.b] : null, marcada: false, motivo: null };
        if (realD && ehObj(realD.porNo) && realD.porNo[id] && realD.porNo[id].pct != null) s.pDiario = pct1(realD.porNo[id].pct);

        /* 1) a etapa do nó tem entrada `rs:1` (resumida): o lastro por
              subetapa deixou de existir, e recriar as folhas encheria de novo
              o registro que a porta [Resumir] acabou de esvaziar (E-MC8) */
        if (cobertaPorRs(id)) { s.acao = "coberta-rs"; out.push(s); return; }
        /* 2) lápide ("tirar e não sugerir de novo"): a pessoa já decidiu */
        if (at && (at.p === 0 || at.p == null) && !at.i && !at.o && !at.b) { s.acao = "lapide"; out.push(s); return; }
        /* 3) entrada da medição cujo `b` NÃO CONTA MAIS (reaberto, rejeitado,
              excluído, `lancarAvanco:false`). ⚠ NUNCA recalcula nem apaga: o
              número pode estar certo e a obra feita, e o boletim pode ter sido
              recusado por preço. Quem decide é a pessoa, no [Rever]
              (crítica D10). */
        if (at && at.o === "medicao" && at.b && conta && !own(conta, at.b)) { s.acao = "sem-lastro"; out.push(s); return; }
        /* 4) a medição tinha o nó e o DIÁRIO passou a ter: o canal para. O
              diário mede o que foi FEITO; a medição, o que foi aprovado para
              pagamento. Quem planeja quer o do diário (E-MC7).
              ⚠ `=== false`, e não `!m.semDiario`: `null` é "não consegui
                perguntar aos diários" (ver `semDiario`), e cair aqui fazia a
                faixa afirmar um lançamento de diário que ninguém conseguiu
                ler — e oferecer [Usar o diário], que então recusava. */
        if (at && at.o === "medicao" && m.semDiario === null) { s.acao = "diario-ilegivel"; out.push(s); return; }
        if (at && at.o === "medicao" && m.semDiario === false) { s.acao = "diario-chegou"; out.push(s); return; }
        /* 5) entrada da medição: recalcula para o que as medições dizem hoje */
        if (at && at.o === "medicao") {
          /* ⚠ 5a) …MAS SÓ QUANDO ISSO MUDA A ENTRADA. Gravar a sugestão numa
             CÓPIA da entrada crua, pela MESMA função do `aplicar`, e comparar:
             igual = `igual`, que não é pendência, não vai à faixa "aprovada
             sem lançar", não conta em "N tarefa(s) nas medições" e não entra
             no recado. Ver o roteiro do defeito em `gravarNaEntrada`. */
          var cru = own(cruPorId, id) ? cruPorId[id] : null;
          if (cru && corteRec) {
            var sim = copiaEntrada(cru);
            if (gravarNaEntrada(sim, s, corteRec, false) && mesmoRetrato(retrato(cru), retrato(sim))) {
              s.acao = "igual"; out.push(s); return;
            }
          }
          s.acao = "recalcular";
          s.marcada = marcadas ? !!marcadas[id] : true;
          if (s.pAvanco != null && s.pMed < s.pAvanco) s.motivo = "baixa";
          out.push(s); return;
        }
        /* 6) entrada digitada (com ou sem `b`) ou do diário: NADA se muda. A
              medição só avisa quando sabe MAIS que o lançado — e desmarcada,
              que é o que "a decisão foi de uma pessoa" significa. */
        if (at) {
          if (s.pAvanco != null && s.pMed > s.pAvanco + EPS_PP) {
            s.acao = "conflito"; s.marcada = marcadas ? !!marcadas[id] : false; out.push(s);
          }
          return;
        }
        /* 7) sem entrada, mas o diário tem o nó: conflito, desmarcado.
              ⚠ E `null` (não consegui perguntar) NÃO cria: a linha 8 exige
                `=== true`. É o mesmo fail-closed de sempre, agora com o
                recado certo em vez de "o diário tem o nó". */
        if (m.semDiario !== true) {
          if (m.semDiario === null) { s.acao = "diario-ilegivel"; out.push(s); return; }
          if (s.pDiario != null && s.pMed > s.pDiario + EPS_PP) {
            s.acao = "conflito"; s.marcada = marcadas ? !!marcadas[id] : false; out.push(s);
          }
          return;
        }
        /* 8) sem entrada e sem diário: é aqui que a medição COMPLETA */
        s.acao = "criar";
        s.marcada = marcadas ? !!marcadas[id] : true;
        out.push(s);
      });
      /* NA APROVAÇÃO (canal automático) só as linhas 5 e 8 gravam, e SÓ NOS
         NÓS QUE O BOLETIM DO GATILHO MEDIU (crítica D10): aprovar a 02a não
         pode mexer na tarefa que só a 01a — reaberta — sustentava. */
      if (aprovar) {
        var doGatilho = ehObj(opts.nosDoGatilho) ? opts.nosDoGatilho : null;
        out.forEach(function (s) {
          if (s.acao !== "criar" && s.acao !== "recalcular") { s.marcada = false; return; }
          if (gat && doGatilho && !own(doGatilho, s.id)) { s.marcada = false; s.motivo = s.motivo || "fora-do-gatilho"; return; }
          /* ⚠ NA APROVAÇÃO UMA BAIXA NUNCA ACONTECE (§3.5, "sem regressão
             calada"): o número que a obra já tinha não cai porque alguém
             aprovou outro boletim. Ela vira sugestão na faixa. */
          if (s.motivo === "baixa") s.marcada = false;
        });
      }
      return out;
    },

    /* O LASTRO QUE PERDEU O BOLETIM (§3.5 linha 3 e §1.14) — o que alimenta a
       faixa "N tarefas têm avanço lançado pela medição 01a, que foi reaberta
       em dd/mm. [Rever]".
       ⚠ A `rs:1` NUNCA APARECE AQUI, mesmo com `b` (R3-6/E-MC8): [Tirar do
         avanço] nela apagaria o realizado da ETAPA INTEIRA, e o lastro por
         subetapa que ela resumia já não existe para ser revisto. */
    lastro: function (rec, meds, reguas, opts) {
      opts = opts || {};
      var A = opts.CronoAvanco || dep("CronoAvanco", "./cronoavanco.js");
      var L = (A && typeof A.ler === "function") ? A.ler(rec, {}) : { lista: [] };
      var porMed = {}, out = [];
      arr(meds).forEach(function (m) { if (ehObj(m) && m.id != null) porMed[txt(m.id)] = m; });
      var R = reguas || {};
      arr(L.lista).forEach(function (e) {
        if (!e || e.rs === 1 || !e.b || e.o !== "medicao") return;
        var m = own(porMed, e.b) ? porMed[e.b] : null;
        var sit = null;
        if (!m) sit = "excluida";
        else if (m.status === "rejeitada") sit = "rejeitada";
        else if (typeof R.ehAprovado === "function" && !R.ehAprovado(m.status)) sit = "reaberta";
        else if (m.lancarAvanco === false) sit = "fora-da-conta";
        if (!sit) return;
        out.push({ id: e.id, b: e.b, bNumero: (ehObj(opts.numeroB) && own(opts.numeroB, e.b)) ? opts.numeroB[e.b] : null, situacao: sit });
      });
      out.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
      return out;
    },

    /* APLICA as sugestões MARCADAS sobre uma CÓPIA do registro.
       Devolve {rec, mudou, resumo: {criadas, recalculadas, baixadas}}.
       ⚠ A ENTRADA EXISTENTE É ALTERADA CAMPO A CAMPO (E-MC2), nunca
         reconstruída: reconstruir com campos fixos apagaria todo campo que
         esta versão não conhece — e o registro viaja pela nuvem entre
         versões diferentes.
       ⚠ `em = rec.corte`, nunca o `dataRef` do boletim (crítica F10): `em` é
         "a data de corte em que a entrada foi lançada" (§1.4 do planejador).
         Com o `dataRef`, a entrada nasceria marcada "não atualizada" no mesmo
         instante em que foi criada.
       ⚠ IDEMPOTENTE: entrada igual → não conta como mudança, e sem mudança
         nada vai ao disco. Sem isto, o canal gravaria o registro a cada
         aprovação e a frota veria um `atualizadoEm` novo sem um número novo —
         com o merge por registro inteiro do `crono_obra`, isso é perder a
         edição de outro aparelho por nada. */
    aplicar: function (rec, sugs, opts) {
      opts = opts || {};
      /* ⚠ `semOrigem` É A CONTINGÊNCIA K36 (§11.3), e quem a LÊ é a fiação —
         motor puro não lê CONFIG nem localStorage. Com ela, o canal grava
         entradas DIGITADAS (sem `o` e sem `b`) e SÓ CRIA: é o que se faz se
         uma versão sem as emendas E-MC1/E-MC2 chegar à frota, porque lá um
         aparelho que não sabe ler `o:"medicao"` descartaria a entrada inteira
         e o realizado da obra sumiria. Até 22/09/2026 a chave existia no
         CONFIG, aparecia no cartão "Compatibilidade" como desligada e não era
         lida por ninguém: o suporte desligava, a tela confirmava, e o risco
         continuava acontecendo. */
      var semOrigem = !!opts.semOrigem;
      /* `resumo.ids` = os nós que ESTA aplicação criou ou mudou, na ordem. É
         deles que o recado tira os nomes: a sugestão marcada que o `aplicar`
         pulou (sem início, início depois do corte, recálculo com a origem
         desligada) não foi lançada, e citá-la no "Avanço lançado em…" era
         dizer três nomes para duas mudanças. */
      var out = { rec: null, mudou: false, resumo: { criadas: 0, recalculadas: 0, baixadas: [], ids: [] } };
      if (!ehObj(rec)) return out;
      var corte = iso10(rec.corte);
      if (!corte) return out;
      var c = {}, k;
      for (k in rec) if (own(rec, k)) c[k] = rec[k];
      var nos = [], porId = {};
      arr(rec.nos).forEach(function (e) {
        if (!ehObj(e)) { nos.push(e); return; }
        var cp = copiaEntrada(e);
        porId[txt(cp.id)] = nos.length;
        nos.push(cp);
      });
      arr(sugs).forEach(function (s) {
        if (!s || !s.marcada) return;
        if (s.acao !== "criar" && s.acao !== "recalcular" && s.acao !== "conflito") return;
        if (semOrigem && s.acao !== "criar") return;       // §11.3: "só criar"
        var id = txt(s.id);
        if (!id) return;
        var idx = own(porId, id) ? porId[id] : -1;
        var alvo = idx > -1 ? nos[idx] : { id: id };
        var antes = idx > -1 ? retrato(alvo) : null;
        /* a regra do que se grava mora em `gravarNaEntrada` (a linha 5 das
           `sugestoes` usa a MESMA): `false` = a entrada não pode entrar, e o
           `alvo` ficou intocado */
        if (!gravarNaEntrada(alvo, s, corte, semOrigem)) return;
        if (idx < 0) { porId[id] = nos.length; nos.push(alvo); out.resumo.criadas++; out.resumo.ids.push(id); }
        else {
          if (mesmoRetrato(antes, retrato(alvo))) return;
          out.resumo.recalculadas++;
          out.resumo.ids.push(id);
          if (antes && antes.p != null && alvo.p < antes.p) {
            /* ⚠ O NÚMERO E O NOME DA TAREFA VÃO JUNTO: quem lê o recado da
               baixa precisa de "3.1", não de "s3a" — e a fiação não tem por
               onde buscá-los depois, porque a sugestão já foi consumida. */
            out.resumo.baixadas.push({ id: id, de: antes.p, para: alvo.p, motivo: s.motivo || "recalculo",
              numero: txt(s.numero), nome: txt(s.nome), bNumero: s.bNumero || null });
          }
        }
        out.mudou = true;
      });
      if (!out.mudou) return out;
      c.nos = nos;
      out.rec = c;
      return out;
    }
  };

  global.MedAvanco = MedAvanco;
  if (typeof module !== "undefined" && module.exports) module.exports = MedAvanco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
