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
            etapa: it.etapa || "", obraId: r.obraId || "", data: d, qtd: q, origem: origem
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
   * `precos` é um mapa "colaboradorId|codigoOuServico" -> R$/unidade, com
   * queda para "*|codigoOuServico" (preço do serviço, valendo para todos).
   * Sem preço, a linha volta `pendente: true` e valor null — NUNCA zero.
   * ------------------------------------------------------------------- */
  Producao.precoDe = function (precos, colaboradorId, codigo) {
    var p = precos || {};
    var chaveP = String(colaboradorId) + "|" + String(codigo);
    if (p[chaveP] != null && p[chaveP] !== "") return num(p[chaveP]);
    var chaveG = "*|" + String(codigo);
    if (p[chaveG] != null && p[chaveG] !== "") return num(p[chaveG]);
    return null;
  };

  Producao.medir = function (linhas, precos) {
    var out = [], total = 0, semPreco = 0;
    (linhas || []).forEach(function (l) {
      var cod = l.codigo || l.servico || "";
      var pu = Producao.precoDe(precos, l.colaboradorId, cod);
      var linha = {
        colaboradorId: l.colaboradorId, nome: l.nome, servico: l.servico, codigo: l.codigo,
        unidade: l.unidade, qtd: l.qtd, dias: l.dias, obraId: l.obraId,
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


  global.Producao = Producao;
  if (typeof module !== "undefined" && module.exports) module.exports = Producao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
