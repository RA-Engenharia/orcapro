/* =====================================================================
 * producao.js — PRODUÇÃO INDIVIDUAL: do diário de obra ao pagamento
 *
 * O que este módulo resolve: hoje o RDO registra o efetivo POR FUNÇÃO
 * ("3 pedreiros, 2 serventes") e as atividades com a quantidade executada do
 * dia. Não existe ligação entre a pessoa e o quanto ELA produziu — então quem
 * paga por produção (terceirizado, empreiteiro, quem está na produção) refaz
 * essa conta no caderno, no fim da semana, de memória.
 *
 * Aqui a produção de cada pessoa é lançada NO PRÓPRIO DIÁRIO, no dia em que
 * aconteceu, e depois vira medição — sem redigitar nada.
 *
 * ---------------------------------------------------------------------
 * QUATRO REGRAS QUE NÃO PODEM SAIR DAQUI PARA A TELA
 * ---------------------------------------------------------------------
 *
 * 1) NOME DE TRABALHADOR NÃO VAI PARA O PORTAL DO CLIENTE.
 *    O diário já segue essa regra (rdo.js): o efetivo sobe como total por
 *    função, nunca como lista de pessoas. A produção individual carrega NOME
 *    e vira DINHEIRO — é dado de folha, não de obra.
 *    A defesa de primeira linha é o `paraPortal` do rdo.js, que é uma
 *    ALLOWLIST (campo não listado não sobe). `Producao.limparParaPortal` é a
 *    segunda linha, chamada DE DENTRO do `paraPortal` — ver js/rdo.js.
 *
 * 2) NÃO SE PAGA DUAS VEZES A MESMA PRODUÇÃO.
 *    Cada linha medida guarda a CHAVE da origem (diário + ITEM + pessoa) e a
 *    QUANTIDADE paga naquela origem. `Producao.jaMedido` devolve quanto já
 *    foi pago por origem, e `acumular` mede só o que sobrou.
 *    ⚠ A chave usa o **id do item**, nunca a posição dele na lista: apagar um
 *    serviço do diário deslocava os índices e (a) liberava produção já paga e
 *    (b) marcava produção não paga como paga. Os dois foram reproduzidos.
 *
 * 3) SEM PREÇO NÃO SE INVENTA ZERO.
 *    Quantidade sem preço unitário não vira "R$ 0,00" — vira linha marcada
 *    como PENDENTE. Zero seria uma linha bonita que paga nada, e ninguém
 *    confere o que parece certo.
 *
 * 4) DIÁRIO NÃO APROVADO NÃO PAGA — MAS APARECE.
 *    Produção lançada em diário que ainda é rascunho não entra na medição;
 *    seria pagar por um dia que ainda pode mudar. Ela volta em `pendentes`
 *    para a tela DIZER que existe, em vez de sumir em silêncio.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Producao = {};

  /* -------------------------------------------------------------------
   * LER NÚMERO COMO O BRASILEIRO ESCREVE
   *
   * ⚠ Este parser já foi ingênuo e errava dinheiro em duas direções:
   *   - "2.500" (dois mil e quinhentos, como se escreve aqui e como o campo
   *     "Valor fechado" da Folha aceita) virava 2,5 — pagaria 1/1000;
   *   - "R$ 18,50" colado do WhatsApp virava 0, e a linha ficava "sem preço"
   *     sem explicar por quê.
   * Regra: joga fora tudo que não é dígito/vírgula/ponto/sinal; se tem
   * vírgula, ela é o decimal e os pontos são milhar; se só tem pontos, ponto
   * seguido de exatamente 3 dígitos é MILHAR (convenção BR).
   * ------------------------------------------------------------------- */
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    var s = String(x == null ? "" : x).replace(/[^0-9,.\-]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") > -1) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.indexOf(".") > -1) {
      /* 2.500 e 1.234.567 = milhar; 2.5 e 18.50 = decimal */
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  Producao.num = num;

  /* -------------------------------------------------------------------
   * QUEM PODE RECEBER POR PRODUÇÃO
   *
   * Terceirizado, empreiteiro, PJ e autônomo já são, por natureza do
   * contrato, pagos por serviço entregue. CLT e diarista NÃO entram
   * automaticamente: o CLT tem salário e o diarista tem diária — pagar os
   * dois por produção sem querer viraria pagamento em duplicidade com a
   * folha. Para esses, é preciso marcar no cadastro (`pagaProducao`), que é
   * uma decisão consciente de quem cadastra.
   * ------------------------------------------------------------------- */
  Producao.CONTRATOS_PRODUCAO = ["terceiro", "empreiteiro", "pj", "autonomo"];
  /* quem recebe TAMBÉM por dia: marcar produção nestes é justamente o caso em
     que a mesma semana pode sair paga duas vezes — a tela tem que avisar,
     porque a Lista PIX funde diária e produção numa linha só do favorecido. */
  Producao.CONTRATOS_POR_DIA = ["clt", "diarista"];

  Producao.elegivel = function (colab) {
    var c = colab || {};
    if (c.pagaProducao === true) return true;
    return Producao.CONTRATOS_PRODUCAO.indexOf(String(c.tipoContrato || "")) > -1;
  };

  Producao.elegiveis = function (colaboradores) {
    return (colaboradores || []).filter(function (c) {
      return c && c.status !== "inativo" && Producao.elegivel(c);
    });
  };

  Producao.recebeTambemPorDia = function (colab) {
    var c = colab || {};
    return c.pagaProducao === true &&
      Producao.CONTRATOS_POR_DIA.indexOf(String(c.tipoContrato || "")) > -1;
  };

  Producao.motivoInelegivel = function (colab) {
    var c = colab || {};
    if (Producao.elegivel(c)) return "";
    if (c.tipoContrato === "clt") return "É CLT (tem salário). Para pagar por produção também, marque \"paga por produção\" no cadastro dele.";
    if (c.tipoContrato === "diarista") return "É diarista (recebe por dia na Folha Semanal). Marcar produção aqui pagaria duas vezes pelo mesmo dia — se for mesmo por produção, marque no cadastro.";
    return "O tipo de contrato dele não é de pagamento por produção. Marque \"paga por produção\" no cadastro se for o caso.";
  };

  /* -------------------------------------------------------------------
   * ID ESTÁVEL DO ITEM DE ATIVIDADE
   *
   * ⚠ A chave de origem usava o ÍNDICE do item no diário. Apagar o primeiro
   * serviço fazia o segundo assumir o índice 0 — e aí a produção do segundo
   * passava a "casar" com o pagamento do primeiro: produção não paga saía da
   * lista como se já tivesse sido paga, e produção paga voltava a aparecer.
   * Os dois foram reproduzidos no navegador. Por isso o item ganha id
   * próprio, carimbado no salvar do diário e nunca reciclado.
   * ------------------------------------------------------------------- */
  Producao.idDoItem = function (item, idx) {
    var it = item || {};
    if (it.pid) return String(it.pid);
    /* diário gravado antes desta versão cai no índice, que é o que existe.
       Itens assim não têm produção (o recurso nasce agora), então o caso
       degradado não move dinheiro — mas fica explícito em vez de escondido. */
    return "i" + (idx == null ? 0 : idx);
  };
  /* id que não colide dentro do mesmo diário */
  Producao.novoPid = function (usados) {
    var n = 1, u = usados || {};
    while (u["p" + n]) n++;
    return "p" + n;
  };
  /* carimba pid em todo item que ainda não tem — idempotente, roda no salvar */
  Producao.carimbarPids = function (itens) {
    var usados = {};
    (itens || []).forEach(function (it) { if (it && it.pid) usados[it.pid] = 1; });
    (itens || []).forEach(function (it) {
      if (!it) return;
      if (!it.pid) { it.pid = Producao.novoPid(usados); usados[it.pid] = 1; }
    });
    return itens;
  };

  /* -------------------------------------------------------------------
   * VALIDAR O LANÇAMENTO DENTRO DO DIÁRIO
   *
   * A soma do que as pessoas produziram não pode passar do que a atividade
   * registrou como executado no dia: se passasse, a obra pagaria mais serviço
   * do que existe, e a diferença nunca apareceria — o total da atividade
   * continuaria certo no impresso.
   * ------------------------------------------------------------------- */
  Producao.validarItem = function (item) {
    var it = item || {};
    var prod = it.producao || [];
    var erros = [], avisos = [];
    var soma = 0, vistos = {};

    prod.forEach(function (p, i) {
      var q = num(p && p.qtd);
      if (!p || !p.colaboradorId) { erros.push("Linha " + (i + 1) + ": escolha a pessoa."); return; }
      if (vistos[p.colaboradorId]) {
        erros.push("A mesma pessoa aparece duas vezes (" + (p.nome || p.colaboradorId) + ") — some as quantidades numa linha só.");
      }
      vistos[p.colaboradorId] = 1;
      if (q < 0) erros.push("Quantidade negativa em " + (p.nome || "uma das linhas") + ".");
      soma += q;
    });

    var exec = num(it.qtdExecutada);
    if (prod.length && exec > 0) {
      /* tolerância de 1 centésimo cobre arredondamento de digitação */
      if (soma - exec > 0.01) {
        erros.push("A produção lançada (" + soma + ") passa do executado no dia (" + exec + "). "
          + "Ou o executado está menor do que foi feito, ou alguma quantidade individual está errada.");
      } else if (exec - soma > 0.01) {
        avisos.push("Sobra " + Math.round((exec - soma) * 100) / 100 + " " + (it.unidade || "")
          + " sem dono: foi feito pela equipe mas não está lançado para ninguém. Isso é normal se parte do serviço não é paga por produção.");
      }
    }
    /* ⚠ ERRO, não aviso. Este era o ÚNICO caso que escapava da trava, e é o
       pior de todos: sem quantidade executada não existe teto, então uma
       produção de 9.999 m² era gravada e virava medição sem nada comparar.
       O comentário da própria trava dizia "assinar medição de serviço que não
       foi feito" — era exatamente isto acontecendo. */
    if (prod.length && exec <= 0) {
      erros.push("Este serviço tem produção lançada para pessoas mas está SEM quantidade executada no dia. "
        + "Sem esse número não existe teto — a produção viraria pagamento sem nada com o que comparar. Preencha o \"feito hoje\".");
    }
    return { ok: !erros.length, erros: erros, avisos: avisos, soma: soma, executado: exec };
  };

  /* -------------------------------------------------------------------
   * TIRAR A PRODUÇÃO DO QUE VAI PARA O CLIENTE
   * (regra 1 — nome de pessoa e valor de pagamento não são assunto do cliente)
   * ------------------------------------------------------------------- */
  Producao.limparParaPortal = function (itens) {
    return (itens || []).map(function (it) {
      var copia = {}, k;
      for (k in it) { if (Object.prototype.hasOwnProperty.call(it, k) && k !== "producao") copia[k] = it[k]; }
      return copia;
    });
  };

  /* chave da origem: é ela que impede pagar a mesma produção duas vezes.
     Assinatura: (rdoId, item, idx, colaboradorId) — o índice entra só como
     último recurso para diário antigo, dentro de `idDoItem`. */
  Producao.chave = function (rdoId, item, idx, colaboradorId) {
    return String(rdoId) + "|" + Producao.idDoItem(item, idx) + "|" + String(colaboradorId);
  };

  /* -------------------------------------------------------------------
   * O QUE JÁ FOI PAGO, E QUANTO
   *
   * Devolve `{chaveDeOrigem: quantidadePaga}`. Guardar a QUANTIDADE (e não
   * só "pagou/não pagou") é o que permite medir a correção: se o encarregado
   * conserta o apontamento de 10 para 100 m² depois da medição, os 90 que
   * faltam voltam para a lista em vez de sumirem para sempre.
   *
   * Medição CANCELADA e medição REJEITADA não seguram nada: nos dois casos
   * não houve pagamento, e travar a produção deixaria o serviço sem poder ser
   * pago nunca mais — o trabalhador ficaria sem receber e ninguém veria por quê.
   * ------------------------------------------------------------------- */
  Producao.STATUS_NAO_PAGA = { rejeitada: 1, cancelada: 1 };

  Producao.jaMedido = function (medicoes) {
    var mapa = {};
    (medicoes || []).forEach(function (m) {
      if (!m || m.cancelada) return;
      if (Producao.STATUS_NAO_PAGA[String(m.status || "")]) return;
      (m.linhas || []).forEach(function (l) {
        if (!l) return;
        (l.origens || []).forEach(function (o) {
          if (!o) return;
          /* forma antiga (a chave crua, sem quantidade): trata a origem como
             paga por inteiro — é o mais seguro quando não se sabe quanto foi */
          if (typeof o === "string") { mapa[o] = Infinity; return; }
          if (o.o) mapa[o.o] = (mapa[o.o] === Infinity ? Infinity : (mapa[o.o] || 0) + num(o.q));
        });
        if (l.origem) mapa[l.origem] = Infinity;
      });
    });
    return mapa;
  };

  /* -------------------------------------------------------------------
   * ACUMULAR A PRODUÇÃO DOS DIÁRIOS
   *
   * Devolve uma linha por PESSOA × OBRA × SERVIÇO, somando os dias.
   * ⚠ A OBRA entra na chave. Sem ela, o mesmo pedreiro fazendo alvenaria em
   * duas obras virava UMA linha, e a medição carimbava o custo inteiro numa
   * obra só — o custo da obra B aparecia na obra A, e ia assim para a Folha.
   *
   * `pendentes` traz o que existe mas não pode ser pago ainda (diário não
   * aprovado) e `jaPagos` o que já foi medido antes — os dois VOLTAM, para a
   * tela poder dizer o que ficou de fora. Sumir com dado é como o erro vira
   * invisível.
   * ------------------------------------------------------------------- */
  Producao.ESTADOS_QUE_PAGAM = ["aprovado", "publicado", "publicado_legado", "finalizado_legado"];

  Producao.podePagar = function (rdo) {
    var r = rdo || {};
    var e = String(r.estado || "");
    if (e) return Producao.ESTADOS_QUE_PAGAM.indexOf(e) > -1;
    /* diário antigo, anterior ao fluxo de aprovação: vale o status legado */
    var s = String(r.status || "");
    return s === "finalizado" || s === "publicado";
  };

  Producao.acumular = function (rdos, opcoes) {
    var o = opcoes || {};
    var medidos = o.jaMedido || {};
    var porChave = {}, linhas = [], pendentes = [], jaPagos = [];

    (rdos || []).forEach(function (r) {
      if (!r) return;
      if (o.obraId && r.obraId !== o.obraId) return;
      var d = String(r.data || "");
      if (o.de && d && d < o.de) return;
      if (o.ate && d && d > o.ate) return;

      var pagavel = Producao.podePagar(r);
      (r.atividadesItens || []).forEach(function (it, idx) {
        (it && it.producao ? it.producao : []).forEach(function (p) {
          if (!p || !p.colaboradorId) return;
          var q = num(p.qtd);
          if (q <= 0) return;
          var origem = Producao.chave(r.id, it, idx, p.colaboradorId);
          var base = {
            colaboradorId: p.colaboradorId, nome: p.nome || "",
            servico: it.descricao || "", codigo: it.numero || "", unidade: it.unidade || "",
            etapa: it.etapa || "", obraId: r.obraId || "", data: d, qtd: q, origem: origem,
            /* vínculo com o item do ORÇAMENTO, quando o serviço veio de lá:
               é o que permite puxar o custo de mão de obra sem adivinhar */
            refId: it.refId || "", origemItem: it.origem || "", codigoBase: it.codigo || ""
          };

          /* o que já foi pago naquela origem sai da conta; o RESTO continua
             medível — é assim que a correção do apontamento para MAIS volta a
             aparecer, em vez de sumir para sempre */
          var pago = medidos[origem];
          if (pago === Infinity) { jaPagos.push(base); return; }
          if (pago > 0) {
            var resta = Math.round((q - pago) * 100) / 100;
            if (resta <= 0.01) { jaPagos.push(base); return; }
            base.qtd = resta;
            base.jaPagoAntes = pago;
            q = resta;
          }

          if (!pagavel) { pendentes.push(base); return; }

          /* agrupa por pessoa × OBRA × serviço × unidade */
          var k = p.colaboradorId + "|" + (r.obraId || "") + "|" + (it.numero || it.descricao || "") + "|" + (it.unidade || "");
          if (!porChave[k]) {
            porChave[k] = {
              colaboradorId: p.colaboradorId, nome: p.nome || "",
              servico: it.descricao || "", codigo: it.numero || "", unidade: it.unidade || "",
              etapa: it.etapa || "", obraId: r.obraId || "",
              refId: it.refId || "", origemItem: it.origem || "", codigoBase: it.codigo || "",
              qtd: 0, dias: 0, origens: [], primeiraData: d, ultimaData: d
            };
            linhas.push(porChave[k]);
          }
          var L = porChave[k];
          L.qtd = Math.round((L.qtd + q) * 100) / 100;
          L.dias += 1;
          /* a origem guarda a QUANTIDADE medida nela — é o que permite
             reconhecer depois que só uma parte foi paga */
          L.origens.push({ o: origem, q: q });
          if (d && (!L.primeiraData || d < L.primeiraData)) L.primeiraData = d;
          if (d && (!L.ultimaData || d > L.ultimaData)) L.ultimaData = d;
        });
      });
    });

    linhas.sort(function (a, b) {
      return (a.nome || "").localeCompare(b.nome || "") || (a.servico || "").localeCompare(b.servico || "");
    });
    return { linhas: linhas, pendentes: pendentes, jaPagos: jaPagos };
  };

  /* -------------------------------------------------------------------
   * DAR PREÇO À PRODUÇÃO
   *
   * A CHAVE DO PREÇO — leia antes de mexer.
   *
   * Até a v1.1.151 a chave era `colaboradorId|numeroDoItem`, e isso pagava
   * errado de duas maneiras, as duas reproduzidas com o motor real:
   *
   *  (a) ENTRE OBRAS. O mapa de preços é da EMPRESA, não da obra. O "1.1" da
   *      obra A é alvenaria e o "1.1" da obra B é pintura. Quem puxava o preço
   *      da alvenaria via a linha da PINTURA, em outra obra, já preenchida com
   *      aquele valor — não pendente, entrando no total e no pagamento.
   *
   *  (b) DENTRO DA MESMA OBRA. O número do item é POSICIONAL: a v1.1.116
   *      deixou reordenar o orçamento, e o diário renumera por posição. Inserir
   *      um serviço no começo da etapa faz o preço do serviço antigo
   *      pré-preencher o serviço novo que herdou aquele número.
   *
   * O módulo já tinha aprendido essa lição na chave de ORIGEM ("a chave usa o
   * id do item, nunca a posição dele na lista") — a chave do PREÇO é que tinha
   * ficado de fora. Agora a identidade é: pessoa × OBRA × serviço × unidade,
   * onde "serviço" é o código da base ou o id do item do orçamento, nunca o
   * número. A unidade entra porque um R$/m² não pode cair num item em m³.
   *
   * Queda para "*|..." (preço do serviço valendo para todos) continua, com a
   * MESMA parte estável.
   * Sem preço, a linha volta `pendente: true` e valor null — NUNCA zero.
   * ------------------------------------------------------------------- */
  function un(u) { return String(u == null ? "" : u).trim().toLowerCase(); }

  /* identidade do SERVIÇO, sem a pessoa — é o que entra nas duas chaves */
  Producao.identidadeServico = function (l) {
    var x = l || {};
    if (x.codigoBase) return "b:" + String(x.codigoBase);
    if (x.refId) return "r:" + String(x.obraId || "") + ":" + String(x.refId);
    return "d:" + String(x.obraId || "") + ":" + String(x.servico || x.codigo || "");
  };

  Producao.chavePreco = function (l) {
    var x = l || {};
    return String(x.colaboradorId) + "|" + String(x.obraId || "") + "|" +
      Producao.identidadeServico(x) + "|" + un(x.unidade);
  };

  Producao.precoDe = function (precos, linha) {
    var p = precos || {};
    var k = Producao.chavePreco(linha);
    if (p[k] != null && p[k] !== "") return num(p[k]);
    var g = "*|" + String((linha || {}).obraId || "") + "|" +
      Producao.identidadeServico(linha) + "|" + un((linha || {}).unidade);
    if (p[g] != null && p[g] !== "") return num(p[g]);
    return null;
  };

  /* MIGRAÇÃO DAS CHAVES ANTIGAS
   *
   * As chaves velhas (`colab|1.1`) são AMBÍGUAS por construção: o mesmo "1.1"
   * pode ser dois serviços em duas obras. Reaplicar sem conferir é o próprio
   * defeito. Então só migra o que for provadamente UNÍVOCO — o par
   * (pessoa, número) que, em todos os diários, aponta para uma identidade e
   * uma unidade só. O ambíguo NÃO vira preço: a linha volta a "sem preço", que
   * é a regra 3 do módulo (sem preço nunca é R$ 0,00), e o usuário reconfirma.
   * Devolve também o que ficou de fora, para a tela poder avisar. */
  Producao.migrarPrecos = function (precosAntigos, linhas) {
    var novos = {}, ambiguos = [], vistos = {}, k;
    var porAntiga = {};
    (linhas || []).forEach(function (l) {
      var antiga = String(l.colaboradorId) + "|" + String(l.codigo || l.servico || "");
      if (!porAntiga[antiga]) porAntiga[antiga] = [];
      var nova = Producao.chavePreco(l);
      if (porAntiga[antiga].indexOf(nova) === -1) porAntiga[antiga].push(nova);
    });
    for (k in (precosAntigos || {})) {
      if (!Object.prototype.hasOwnProperty.call(precosAntigos, k)) continue;
      /* chave já no formato novo (3 barras) passa direto */
      if (k.split("|").length >= 4) { novos[k] = precosAntigos[k]; continue; }
      var destinos = porAntiga[k] || [];
      if (destinos.length === 1) { novos[destinos[0]] = precosAntigos[k]; vistos[k] = 1; }
      else ambiguos.push({ chave: k, valor: precosAntigos[k], destinos: destinos.length });
    }
    return { precos: novos, ambiguos: ambiguos };
  };

  Producao.medir = function (linhas, precos) {
    var out = [], total = 0, semPreco = 0;
    (linhas || []).forEach(function (l) {
      var pu = Producao.precoDe(precos, l);
      var linha = {
        colaboradorId: l.colaboradorId, nome: l.nome, servico: l.servico, codigo: l.codigo,
        unidade: l.unidade, qtd: l.qtd, dias: l.dias, obraId: l.obraId,
        refId: l.refId || "", codigoBase: l.codigoBase || "",
        origens: (l.origens || []).slice(),
        precoUnit: pu, valor: null, pendente: false
      };
      if (pu == null) { linha.pendente = true; semPreco++; }
      else {
        linha.valor = Math.round(l.qtd * pu * 100) / 100;
        /* arredonda a cada soma, como planilha: sem isso o total diverge um
           centavo da soma das linhas e quem confere com calculadora pega */
        total = Math.round((total + linha.valor) * 100) / 100;
      }
      out.push(linha);
    });
    return { linhas: out, total: total, semPreco: semPreco };
  };

  /* Totais por PESSOA × OBRA. O pagamento sai por pessoa, mas o custo tem que
     ficar na obra certa — juntar obras aqui jogava o custo inteiro numa só. */
  Producao.porPessoa = function (linhasMedidas) {
    var m = {}, out = [];
    (linhasMedidas || []).forEach(function (l) {
      var k = l.colaboradorId + "|" + (l.obraId || "");
      if (!m[k]) {
        m[k] = { colaboradorId: l.colaboradorId, nome: l.nome, obraId: l.obraId || "", itens: [], total: 0, pendentes: 0 };
        out.push(m[k]);
      }
      var P = m[k];
      P.itens.push(l);
      if (l.pendente) P.pendentes++;
      else P.total = Math.round((P.total + (l.valor || 0)) * 100) / 100;
    });
    return out;
  };


  /* -------------------------------------------------------------------
   * PUXAR O PREÇO DO ORÇAMENTO — a mão de obra que já está orçada
   *
   * O orçamento guarda, por item, `custoMO` = quanto de MÃO DE OBRA custa
   * UMA unidade daquele serviço (o SINAPI separa MO / material / equipamento,
   * e `js/analitico.js` reparticiona quando a base não separa).
   *
   * ⚠ ISSO NÃO É "O PREÇO DO TERCEIRO" — e a tela precisa dizer isso.
   * O custo de MO do SINAPI é o que o serviço custaria pela SUA folha: salário
   * mais encargos sociais, no regime que o orçamento escolheu (desonerado ou
   * não). Quem contrata por produção paga outra coisa: o terceiro embute os
   * encargos DELE, ferramenta, deslocamento e lucro. Os dois números vivem no
   * mesmo lugar da planilha, mas não são a mesma conta.
   *
   * Então o que esta função devolve é uma REFERÊNCIA — o teto do que aquele
   * serviço já custa no seu orçamento — para quem negocia ter em que se apoiar.
   * Quem decide o preço é o usuário; por isso nada é gravado sem ele confirmar.
   *
   * NÃO CONVERTE UNIDADE. Se o diário mediu em m² e o item está em m³, a
   * função recusa e diz por quê: converter caladamente é como um item some do
   * orçamento sem erro nenhum (foi o que a Parede-Cebola já ensinou).
   * ------------------------------------------------------------------- */
  Producao.REGIME_ROTULO = { desonerado: "encargos desonerados", nao_desonerado: "encargos não desonerados" };

  /* acha o item do orçamento que corresponde à linha da produção.
     Ordem: id do item (exato) → código da base.

     ⚠ NÃO existe terceiro critério "pelo número do item". Ele existiu e era
     duas vezes errado: (1) item de orçamento NÃO guarda `numero` — o número
     nasce em Orcamento.calcular() e vive na linha calculada, então o critério
     estava morto e só parecia vivo porque a fixture do teste escrevia o campo
     à mão; (2) mesmo que existisse, o diário e o orçamento numeram cada um por
     conta própria, então casar por número seria pagar por COINCIDÊNCIA de
     numeração — pior do que não casar, porque paga o serviço errado calado. */
  Producao.itemDoOrcamento = function (linha, orc) {
    if (!linha || !orc || !orc.etapas) return null;
    var achado = null, porCodigo = null;
    var refId = String(linha.refId || "");
    var cod = String(linha.codigoBase || "");
    orc.etapas.forEach(function (et) {
      (et.itens || []).forEach(function (it) {
        if (!it) return;
        if (refId && it.id === refId) achado = it;
        if (!porCodigo && cod && String(it.codigo || "") === cod) porCodigo = it;
      });
    });
    return achado || porCodigo || null;
  };

  /* O REGIME DE ENCARGOS É LIDO, NÃO ASSUMIDO.
     Orçamento que não nasceu do assistente (importador, BIM, obra demo) tem
     `desonerado:false` E `config.encargos.tipo:"desonerado"` ao mesmo tempo —
     ler só o config faz a tela dizer "desonerado" num orçamento onerado. A
     regra de desempate é a mesma que Orcamento.garantirConfig aplica: o
     booleano `desonerado`, quando existe, MANDA. */
  Producao.regimeDoOrcamento = function (orc) {
    var o = orc || {};
    if (typeof o.desonerado === "boolean") return o.desonerado ? "desonerado" : "nao_desonerado";
    return (o.config && o.config.encargos && o.config.encargos.tipo) || "desonerado";
  };

  Producao.precoDoOrcamento = function (linha, orc, unidadeChave, moDoItem) {
    var cmp = typeof unidadeChave === "function" ? unidadeChave : function (u) {
      return String(u == null ? "" : u).trim().toLowerCase();
    };
    if (!orc) return { ok: false, motivo: "Esta obra não está vinculada a nenhum orçamento. Vincule em Obras › editar." };
    var it = Producao.itemDoOrcamento(linha, orc);
    if (!it) return { ok: false, motivo: "Não achei este serviço no orçamento da obra (nem pelo item, nem pelo código)." };

    var uLinha = cmp(linha && linha.unidade), uItem = cmp(it.unidade);
    if (uLinha && uItem && uLinha !== uItem) {
      return { ok: false, item: it,
        motivo: "O diário mediu em \"" + (linha.unidade || "") + "\" e o item do orçamento está em \"" +
          (it.unidade || "") + "\". Não converto unidade sozinho — confira qual das duas está certa." };
    }

    /* DE ONDE SAI A MÃO DE OBRA — e por que não pode ser só o `it.custoMO`.
     *
     * `it.custoMO` é um retrato tirado no momento em que o item entrou no
     * orçamento. Ele falha em dois casos, os dois medidos no pacote real:
     *
     *  (a) SINAPI. A base SINTÉTICA (a que o addItem copia) NÃO traz a
     *      separação MO/MAT/EQ: 0 de 12.815 itens de MG têm custoMO. Ou seja,
     *      para o banco principal do produto o retrato nasce zerado e a
     *      sugestão nunca apareceria. Quem tem a separação é a base ANALÍTICA,
     *      que o app já carrega para o detalhamento da composição.
     *
     *  (b) PREÇO EDITADO. Se o usuário negocia e troca o custo unitário para
     *      R$ 25,00, o custoMO continua o da base (R$ 31,20) — e a tela
     *      sugeriria pagar de mão de obra MAIS do que o item inteiro custa.
     *
     * Nos dois casos a saída honesta é a mesma: aplicar a PROPORÇÃO de mão de
     * obra da composição sobre o custo unitário que o item tem HOJE. Isso não
     * inventa número — a proporção é da base, o custo é do orçamento. Quem
     * fornece essa proporção é o `moDoItem` que a tela injeta (Analitico.quebra);
     * sem ele, sobra o retrato, e se o retrato não fecha com o custo unitário
     * atual a função RECUSA em vez de sugerir errado. */
    var cu = num(it.custoUnitario);
    var mo = 0, fonteMO = "orçamento";
    var somaRetrato = num(it.custoMO) + num(it.custoMAT) + num(it.custoEQ);
    var retratoBate = num(it.custoMO) > 0 && cu > 0 && Math.abs(somaRetrato - cu) <= Math.max(0.02, cu * 0.02);

    if (retratoBate) { mo = num(it.custoMO); fonteMO = "separação do próprio orçamento"; }
    else if (typeof moDoItem === "function") {
      var r = moDoItem(it);
      if (r && num(r.valor) > 0) { mo = num(r.valor); fonteMO = r.fonte || "composição da base"; }
    }
    /* último recurso: o retrato, mas só se ele couber dentro do custo unitário */
    if (!(mo > 0) && num(it.custoMO) > 0 && (!(cu > 0) || num(it.custoMO) <= cu)) {
      mo = num(it.custoMO); fonteMO = "separação do próprio orçamento";
    }

    if (!(mo > 0)) {
      if (!(cu > 0)) return { ok: false, item: it, motivo: "Este item está sem custo no orçamento." };
      /* o retrato existe mas NÃO CABE no custo unitário: é o caso do preço
         editado à mão. Dizer só "não consigo separar" esconderia a causa. */
      if (num(it.custoMO) > cu) {
        return { ok: false, item: it,
          motivo: "A mão de obra guardada neste item (R$ " + num(it.custoMO) + ") é maior que o custo unitário atual (R$ " + cu +
            ") — o custo foi editado à mão e a separação de mão de obra ficou a da base. Confira o item antes de usar este número." };
      }
      return { ok: false, item: it,
        motivo: "Não consigo separar a mão de obra deste item. O orçamento guarda só o custo total (R$ " + cu +
          ") e a composição da base não está carregada para abrir a parte de mão de obra. Informe o preço à mão." };
    }

    var regime = Producao.regimeDoOrcamento(orc);
    return {
      ok: true, item: it, valor: Math.round(mo * 100) / 100,
      unidade: it.unidade || linha.unidade || "",
      regime: regime, regimeRotulo: Producao.REGIME_ROTULO[regime] || regime,
      fonte: it.baseFonte || it.origem || "orçamento", fonteMO: fonteMO,
      codigo: it.codigo || "", descricao: it.descricao || "",
      /* o texto que a tela mostra — a ressalva anda junto com o número */
      explicacao: "Mão de obra deste serviço no seu orçamento (" + (it.baseFonte || it.origem || "base") + ", " + fonteMO +
        ", " + (Producao.REGIME_ROTULO[regime] || regime) + "). " +
        "É o que ele custaria pela sua folha; quem trabalha por produção cobra os encargos e o lucro dele por fora."
    };
  };

  /* sugere preço para VÁRIAS linhas de uma vez — devolve o que deu e o que não
     deu, com motivo, porque sumir com as que falharam esconde o problema */
  Producao.sugerirPrecos = function (linhas, orcPorObra, unidadeChave, moDoItem) {
    var ok = [], falhas = [];
    (linhas || []).forEach(function (l) {
      var r = Producao.precoDoOrcamento(l, (orcPorObra || {})[l.obraId || ""], unidadeChave, moDoItem);
      if (r.ok) ok.push({ linha: l, preco: r });
      else falhas.push({ linha: l, motivo: r.motivo });
    });
    return { ok: ok, falhas: falhas };
  };

  global.Producao = Producao;
  if (typeof module !== "undefined" && module.exports) module.exports = Producao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
