/* =====================================================================
 * atencao.js — O QUE PRECISA DE VOCÊ HOJE
 *
 * Quatro coisas que o sistema JÁ SABE e que não apareciam em lugar nenhum:
 *
 *   1) obra que passou do término contratual — e a multa que isso expõe;
 *   2) EPI vencido ou vencendo;
 *   3) estoque abaixo do mínimo que o próprio usuário definiu;
 *   4) diário aprovado que nunca foi publicado para o cliente.
 *
 * ⚠ CADA ACHADO CARREGA O MÓDULO QUE ELE EXIGE.
 * Isto não é enfeite: o painel já vazava margem por obra para quem só tinha
 * acesso ao Diário. Aqui o achado diz de que módulo ele é, e quem monta a
 * tela filtra. Um encarregado vê o EPI vencido — que é problema dele — e não
 * vê a multa do contrato.
 *
 * ⚠ E NADA AQUI É PREVISÃO.
 * Dias de atraso é subtração entre duas datas que existem. A multa é o
 * percentual que o usuário digitou no contrato, aplicado ao valor dele —
 * declarado como EXPOSIÇÃO, não como cobrança devida: quem decide se a multa
 * incide é o contrato e a conversa, não o software.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? 0 : v).replace(/\./g, "").replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  function texto(s) { return String(s == null ? "" : s).trim(); }
  function dias(a, b) {
    var da = new Date(texto(a) + "T12:00:00Z"), db = new Date(texto(b) + "T12:00:00Z");
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
    return Math.round((db - da) / 86400000);
  }

  /* `d`: { obras, contratos, medicoes, estoque, epi, rdo, licenca, hoje }
     `opc.diasEpi`: antecedência do aviso de EPI (padrão 60, igual à tela de EPI)
     `opc.diasLicenca`: antecedência do aviso de licença (padrão 15) */
  function achar(d, opc) {
    d = d || {}; var o = opc || {};
    var hoje = texto(d.hoje);
    var diasEpi = typeof o.diasEpi === "number" ? o.diasEpi : 60;
    var diasLic = typeof o.diasLicenca === "number" ? o.diasLicenca : 15;
    var obras = d.obras || [], contratos = d.contratos || [];
    var nome = {};
    obras.forEach(function (ob) { if (ob && ob.id) nome[ob.id] = ob.nome || ""; });
    var achados = [];

    /* ---- 1) OBRA ALÉM DO TÉRMINO CONTRATUAL ----
       `multaAtraso` é gravado no formulário do contrato e, até aqui, NUNCA
       era lido por nenhuma linha do app — campo morto. */
    if (hoje) obras.forEach(function (ob) {
      if (!ob || texto(ob.status) !== "andamento") return;
      var fim = texto(ob.termino);
      if (!fim || fim >= hoje) return;
      var atraso = dias(fim, hoje);
      if (atraso == null || atraso <= 0) return;
      var c = contratos.filter(function (x) { return x && x.obraId === ob.id; })[0] || {};
      var pct = num(c.multaAtraso), valorC = num(c.valor) || num(ob.valor);
      /* a multa costuma ser por DIA de atraso, mas o campo não diz o regime.
         Mostro a exposição de UM percentual sobre o contrato e digo que é
         estimativa — inventar "× dias" seria multiplicar um chute. */
      var exposicao = pct > 0 && valorC > 0 ? valorC * pct / 100 : 0;
      /* ⚠ A exposição é VALOR DE CONTRATO disfarçado: mostrar "R$ 500.000" e
         dizer ao lado "multa de 2%" entrega o contrato numa divisão. O alerta é
         do módulo "obras", então chegava a quem tem só Obras.
         O atraso continua aparecendo — é informação de obra e quem toca a obra
         precisa dela. Some só o NÚMERO.
         ⚠ E o texto não pode virar mentira: zerar `exposicao` sozinho fazia o
         "porque" dizer "sem multa cadastrada" havendo multa. Por isso a
         condição do texto é `temMulta`, não o valor. */
      var _podeValor = !(typeof Auth !== "undefined" && Auth.podeModulo
        && !Auth.podeModulo("contratos") && !Auth.podeModulo("financeiro"));
      var temMulta = exposicao > 0;
      if (!_podeValor) exposicao = 0;
      achados.push({
        tipo: "obra-atrasada", gravidade: 3, modulo: "obras",
        titulo: "Obra passou do término contratual",
        detalhe: (ob.nome || "obra") + " · terminava em " + fim + " · " + atraso + " dia(s) atrás",
        porque: temMulta
          ? (_podeValor
              ? "O contrato prevê multa de " + pct.toString().replace(".", ",") + "% — exposição estimada nesse percentual."
              : "O contrato prevê multa por atraso. O valor exposto fica com quem tem acesso a Contratos.")
          : "Sem multa cadastrada no contrato, mas o prazo combinado já venceu.",
        valor: exposicao, obraId: ob.id, view: "obras",
        acao: exposicao > 0
          ? "Confirme o prazo real com o cliente ou registre o aditivo de prazo."
          : "Atualize o término da obra, ou registre o aditivo de prazo."
      });
    });

    /* ---- 2) EPI VENCIDO OU VENCENDO ----
       A mesma régua da tela de EPI (60 dias). Agrupado: dez EPIs vencendo
       viram UMA linha, senão o card vira uma lista que ninguém lê. */
    if (hoje) {
      var venc = [], vencidos = 0;
      (d.epi || []).forEach(function (e) {
        ((e && e.itens) || []).forEach(function (it) {
          var v = texto(it && it.validade);
          if (!v) return;
          var faltam = dias(hoje, v);
          if (faltam == null || faltam > diasEpi) return;
          if (faltam < 0) vencidos++;
          venc.push({ nome: texto(it.descricao || it.nome), faltam: faltam, obraId: e.obraId });
        });
      });
      if (venc.length) {
        venc.sort(function (a, b) { return a.faltam - b.faltam; });
        achados.push({
          tipo: "epi-vencendo", gravidade: vencidos ? 3 : 2, modulo: "epi",
          titulo: vencidos
            ? vencidos + " EPI vencido(s) em uso"
            : venc.length + " EPI vencendo em até " + diasEpi + " dias",
          detalhe: venc.slice(0, 3).map(function (x) {
            return (x.nome || "EPI") + (x.faltam < 0 ? " (venceu há " + (-x.faltam) + "d)" : " (" + x.faltam + "d)");
          }).join(" · ") + (venc.length > 3 ? " · +" + (venc.length - 3) : ""),
          porque: vencidos
            ? "EPI vencido em uso é autuação na hora, e responsabilidade sua no acidente."
            : "Trocar antes de vencer custa menos que parar a obra depois.",
          valor: 0, view: "epi",
          acao: "Abra EPI e programe a troca."
        });
      }
    }

    /* ---- 3) ESTOQUE ABAIXO DO MÍNIMO ---- */
    var baixo = (d.estoque || []).filter(function (i) {
      return i && num(i.estoqueMin) > 0 && num(i.saldo) < num(i.estoqueMin);
    });
    if (baixo.length) {
      achados.push({
        tipo: "estoque-baixo", gravidade: 1, modulo: "estoque",
        titulo: baixo.length + " item(ns) abaixo do estoque mínimo",
        detalhe: baixo.slice(0, 3).map(function (i) {
          return texto(i.descricao || i.nome) + " (" + num(i.saldo) + "/" + num(i.estoqueMin) + ")";
        }).join(" · ") + (baixo.length > 3 ? " · +" + (baixo.length - 3) : ""),
        porque: "O mínimo foi você que definiu — abaixo dele, a obra para esperando material.",
        valor: 0, view: "estoque",
        acao: "Abra Estoque e gere a requisição."
      });
    }

    /* ---- 4) DIÁRIO APROVADO E NÃO PUBLICADO ----
       Só conta em obra que TEM Portal: sem portal não há o que publicar, e
       cobrar isso seria alarme que nunca se resolve. */
    var comPortal = {};
    obras.forEach(function (ob) { if (ob && ob.portalUser) comPortal[ob.id] = 1; });
    var naoPub = (d.rdo || []).filter(function (r) {
      return r && comPortal[r.obraId] && texto(r.estado) === "aprovado";
    });
    if (naoPub.length) {
      achados.push({
        tipo: "rdo-nao-publicado", gravidade: 2, modulo: "rdo",
        titulo: naoPub.length + " diário(s) aprovado(s) e não publicado(s)",
        detalhe: naoPub.slice(0, 3).map(function (r) {
          return (texto(r.data) || "—") + (nome[r.obraId] ? " · " + nome[r.obraId] : "");
        }).join(" · ") + (naoPub.length > 3 ? " · +" + (naoPub.length - 3) : ""),
        porque: "O trabalho foi feito e conferido, e o cliente não está vendo. É valor entregue que não vira percepção.",
        valor: 0, view: "rdo",
        acao: "Abra o Diário e publique no Portal do Cliente."
      });
    }

    /* ---- 5) A LICENÇA ESTÁ PARA VENCER ----
     * ⚠ POR QUE ISTO PRECISOU EXISTIR. O sistema não avisava NINGUÉM de
     *   vencimento: nem o cliente, nem quem vende. O vencimento só aparecia
     *   DEPOIS de acontecido, na hora em que a pessoa tenta salvar e ouve
     *   "Sua licença venceu". E o pior é o formato da falha — o app continua
     *   abrindo e mostrando tudo, então parece funcionando até o lançamento
     *   do dia não entrar.
     *
     * ⚠ E O PLANO NÃO RENOVA SOZINHO. É período fechado, cobrança avulsa. Sem
     *   um aviso com antecedência, o caminho normal é o cliente descobrir
     *   trabalhando.
     *
     * ⚠ SÓ PARA QUEM PODE RESOLVER. `d.licenca` só é passado quando quem está
     *   olhando é o dono da conta — ver js/gestao.js. Encarregado vendo
     *   "sua licença vence" é ruído que ele não tem como tratar, e é conversa
     *   comercial que não é dele.
     *
     * O aviso avisa ANTES (padrão: 15 dias) e sobe de gravidade conforme
     * aperta. Depois de vencida ele continua, porque aí é o mais urgente que
     * existe na tela. */
    var lic = d.licenca;
    if (lic && (lic.expirada || typeof lic.diasRestantes === "number")) {
      var restam = lic.expirada ? -1 : num(lic.diasRestantes);
      var mostrar = lic.expirada || restam <= diasLic;
      if (mostrar) {
        var grave = lic.expirada || restam <= 3 ? 3 : (restam <= 7 ? 2 : 1);
        achados.push({
          tipo: "licenca-vencendo", gravidade: grave,
          /* sem módulo: não é assunto de módulo nenhum, e a tela precisa
             mostrá-lo de qualquer forma */
          modulo: "",
          titulo: lic.expirada
            ? "Sua licença venceu"
            : (restam <= 0 ? "Sua licença vence hoje"
              : "Sua licença vence em " + restam + " dia" + (restam === 1 ? "" : "s")),
          /* ⚠ `expiraTexto` vem PRONTO de quem chama. `Licenca.status().expira`
             é timestamp em milissegundos, e cortar os 10 primeiros dígitos
             imprimia "Validade até 1788217835" na cara do cliente — apareceu
             assim na primeira vez que a tela rodou. Formatar data é trabalho de
             quem tem o `Util`; este motor é puro e não o tem. */
          detalhe: texto(lic.expiraTexto) ? "Validade até " + texto(lic.expiraTexto) : "Plano por período fechado",
          porque: lic.expirada
            ? "O sistema continua abrindo, mas parou de salvar e exportar — o trabalho do dia não entra."
            : "Ele não renova sozinho. Vencendo, o sistema continua abrindo mas para de salvar e exportar.",
          valor: 0, view: "", acao: lic.expirada
            ? "Renove para voltar a salvar."
            : "Renovar antes não custa dias: o período novo soma ao que ainda resta.",
          /* o botão desta linha abre a tela de licença, não um módulo */
          acaoBotao: "licenca"
        });
      }
    }

    achados.sort(function (a, b) {
      if (b.gravidade !== a.gravidade) return b.gravidade - a.gravidade;
      return (b.valor || 0) - (a.valor || 0);
    });
    return { total: achados.length, itens: achados };
  }

  /* Dinheiro RETIDO nas medições aprovadas. Não é alerta: é informação —
     dinheiro dele que fica parado até alguém lembrar de cobrar. Por isso sai
     como número, e não como linha de "precisa da sua atenção".
     ⚠ `m.retencao` é PERCENTUAL, não valor. O formulário da medição pede
     "Retenção (%)" com padrão 5 (js/gestao.js:2719) e o líquido sai de
     `valor × (1 − retencao/100)` (js/gestao.js:15959). É a mesma convenção do
     contrato, que guarda `retencao` em % e `retVal` em dinheiro.
     Esta função SOMAVA OS PERCENTUAIS, e quem exibe formata com fmtMoeda
     (js/gestao.js:851): três medições a 5% viravam "Retenção presa: R$ 15,00"
     no Painel — um número que não é dinheiro nenhum, com cara de dinheiro.
     O teste não pegou porque ele mesmo passava `retencao: 5000`, como se
     fosse valor: teste que repete a premissa errada do código não é teste. */
  /* ⚠ RETENÇÃO JÁ LIBERADA SAI DA CONTA. Sem isto o KPI "Retenção presa" só
   * cresce: o dono devolve a retenção no fim da obra e o Painel continua
   * dizendo que ela está lá. Número que nunca desce é número que ninguém olha.
   * `retencaoLiberadaEm` é gravado na medição quando a retenção é devolvida
   * (ver a aba Retenção em Medições). */
  function retencaoPresa(medicoes) {
    return (medicoes || []).reduce(function (s, m) {
      if (!m) return s;
      if (m.retencaoLiberadaEm) return s;
      var st = texto(m.status);
      if (st !== "aprovado" && st !== "aprovada" && st !== "paga") return s;
      return s + (num(m.valor) * num(m.retencao) / 100);
    }, 0);
  }
  /* Só a retenção de medição PAGA pode ser devolvida: antes do pagamento o
   * cliente não reteve nada — o valor inteiro ainda é a receber. A tela mostra
   * as duas parcelas separadas para o número do Painel continuar batendo. */
  function retencaoLiberavel(medicoes) {
    return (medicoes || []).reduce(function (s, m) {
      if (!m || m.retencaoLiberadaEm) return s;
      if (texto(m.status) !== "paga") return s;
      return s + (num(m.valor) * num(m.retencao) / 100);
    }, 0);
  }

  var Atencao = { achar: achar, retencaoPresa: retencaoPresa, retencaoLiberavel: retencaoLiberavel };
  global.Atencao = Atencao;
  if (typeof module !== "undefined" && module.exports) module.exports = Atencao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
