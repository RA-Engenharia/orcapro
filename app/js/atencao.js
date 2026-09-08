/* =====================================================================
 * atencao.js — O QUE PRECISA DE VOCÊ HOJE
 *
 * O que o sistema JÁ SABE e não aparecia em lugar nenhum:
 *
 *   1) obra que passou do término contratual — e a multa que isso expõe;
 *   2) EPI vencido ou vencendo;
 *   3) estoque abaixo do mínimo que o próprio usuário definiu;
 *   4) diário aprovado que nunca foi publicado para o cliente;
 *   5) licença prestes a vencer, que hoje só avisa depois de vencida;
 *   6) o tour 360 que registra o dia e não cobra o que ficou aberto —
 *      pendência arrastando de uma visita para a outra, prazo vencido,
 *      foto que nunca subiu e visita fotografada que ninguém publicou.
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

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js). Este módulo é puro — o
     gate o roda em Node, onde `Util` não existe — então a regra vem copiada.
     ⚠ E CÓPIA APODRECE CALADA: as duas versões curtas que existiam neste
     projeto erram em direções OPOSTAS, e as duas já moveram dinheiro:
     `replace(/\./g,"")` lê "1234.56" como 123456 (×100); tratar o ponto só
     quando há vírgula lê "1.850.000" como 1,85 (÷1.000.000).
     A paridade com o `Util.parseNum` real é cobrada em tools/test-numbr.js. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, "");
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else { var iP = s.lastIndexOf("."); s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1); }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function texto(s) { return String(s == null ? "" : s).trim(); }
  function dias(a, b) {
    var da = new Date(texto(a) + "T12:00:00Z"), db = new Date(texto(b) + "T12:00:00Z");
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
    return Math.round((db - da) / 86400000);
  }

  /* `d`: { obras, contratos, medicoes, estoque, epi, rdo, licenca, tours,
            toursPeso, hoje }
     `d.tours`: as visitas do Tour Virtual 360, já recortadas pelo escopo de
        obra de quem está olhando. Só é lido quando o motor `Tour360` existe.
     `opc.diasEpi`: antecedência do aviso de EPI (padrão 60, igual à tela de EPI)
     `opc.diasLicenca`: antecedência do aviso de licença (padrão 15)
     `opc.diasTourRascunho`: dias que uma visita 360 fotografada pode ficar em
        rascunho antes de virar cobrança (padrão 7)
     `opc.tour360`: o motor do tour injetado. Existe para o teste medir esta
        regra sem depender de global; a tela não passa nada e cai no `Tour360`
        que o navegador já carregou. */
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

    /* ---- 6) O TOUR VIRTUAL 360: O QUE ANDA, E O QUE NÃO ANDOU ----
     *
     * ⚠ O MÓDULO REGISTRAVA O DIA E NÃO COBRAVA O QUE ANDA. A fissura
     *   marcada em agosto reaparece em setembro DENTRO do tour — o motor já
     *   faz isso, por carimbo (`origemHid`) e não por texto parecido. Só que
     *   em lugar nenhum do app ela chamava alguém: quem não abre a aba não
     *   descobre que existe pendência arrastando há quatro visitas, nem que a
     *   foto que o cliente deveria estar vendo nunca saiu do celular. O
     *   Painel é onde a gestão olha todo dia — é aqui que a cobrança nasce.
     *
     * ⚠ NENHUMA CONTA NOVA MORA AQUI. Quem calcula é `js/tour360.js`, o
     *   MESMO arquivo que roda no Portal do cliente. Reescrever a regra neste
     *   arquivo seria a réplica que apodrece calada — o defeito do
     *   `Util.parseNum` copiado em 33 módulos, com dois erros em direções
     *   opostas, os dois movendo dinheiro. Aqui só se lê o que o motor diz.
     *
     * O motor pode não existir: usuário sem o módulo, ou este arquivo rodando
     * puro em Node no gate. Sem ele nenhum achado de tour nasce, e o painel de
     * quem não tem o módulo continua exatamente igual ao que era. */
    var T360 = o.tour360 || (typeof Tour360 !== "undefined" ? Tour360 : null);
    var tours = d.tours || [];
    if (T360 && tours.length) {
      /* ⚠ O RESUMO É POR OBRA, NUNCA DA LISTA INTEIRA.
         `resumoPendencias` toma a visita MAIS RECENTE da lista que recebe e só
         ela conta como "hoje" — de propósito, senão a mesma fissura seria
         contada uma vez em cada visita antiga e o painel viraria eco. Só que,
         passando os tours de TODAS as obras de uma vez, essa "visita mais
         recente" é a de UMA obra só: as pendências de todas as outras somem do
         painel em silêncio — e somem justamente na empresa com várias obras,
         que é a que mais precisa delas. Por isso agrupo antes de perguntar. */
      var porObraT = {}, ordemT = [], ti, ki, oidT;
      for (ti = 0; ti < tours.length; ti++) {
        oidT = texto(tours[ti] && tours[ti].obraId);
        if (!porObraT[oidT]) { porObraT[oidT] = []; ordemT.push(oidT); }
        porObraT[oidT].push(tours[ti]);
      }

      var arrast = [], vencT = [], deixT = [];
      for (ti = 0; ti < ordemT.length; ti++) {
        var resT = null;
        try { resT = T360.resumoPendencias(porObraT[ordemT[ti]], hoje); } catch (e1T) { resT = null; }
        var itensT = (resT && resT.itens) || [];
        for (ki = 0; ki < itensT.length; ki++) {
          var itT = itensT[ki];
          var rotT = (nome[ordemT[ti]] ? nome[ordemT[ti]] + " · " : "")
            + (texto(itT.estacao) || "estação") + " · " + (texto(itT.texto) || "sem descrição");
          /* ⚠ `datas > 1`, NÃO `visitas > 1`: o motor conta as aparições em
             `visitas` e os DIAS distintos em `datas`. Duas visitas no mesmo
             dia — manhã e tarde — são duas aparições e nenhum dia virado, e
             cobrar isso como "se arrasta" gasta a atenção de quem confia no
             painel. Atravessar é o mês virar com a fissura ainda lá. */
          if (num(itT.datas) > 1) {
            arrast.push({ obraId: ordemT[ti], rot: rotT, visitas: num(itT.visitas),
              desde: texto(itT.desde), tourId: texto(resT && resT.tourId) });
          }
          if (itT.vencida) {
            vencT.push({ obraId: ordemT[ti], rot: rotT, prazo: texto(itT.prazo),
              resp: texto(itT.responsavel), tourId: texto(resT && resT.tourId) });
          }
        }
        var dxT = (resT && resT.deixadas) || [];
        for (ki = 0; ki < dxT.length; ki++) {
          deixT.push({
            obraId: ordemT[ti],
            rot: (nome[ordemT[ti]] ? nome[ordemT[ti]] + " · " : "")
              + (texto(dxT[ki].estacao) || "estação") + " · " + (texto(dxT[ki].texto) || "sem descrição"),
            ultimaData: texto(dxT[ki].ultimaData),
            tourId: texto(dxT[ki].ultimaTourId)
          });
        }
      }

      /* ⚠ A PENDÊNCIA QUE FICOU PARA TRÁS. `resumoPendencias` só cobra a visita
         MAIS RECENTE — e está certo, senão a mesma fissura seria contada cinco
         vezes. O buraco era o outro lado: quando a visita nova nasce por
         "+ Nova visita" (sem herdar), ou a estação é apagada, ou o apontamento
         herdado é excluído, a pendência desaparece da cobrança SEM NINGUÉM
         DIZER NADA — e o Painel passa a dizer "nenhuma pendência" com a
         fissura ainda na parede. Lista que esvazia sozinha dá sossego, que é
         o pior serviço que este painel pode prestar. */
      if (deixT.length) {
        deixT.sort(function (a, b) { return texto(a.ultimaData).localeCompare(texto(b.ultimaData)); });
        achados.push({
          tipo: "tour-pendencia-deixada", gravidade: 3, modulo: "tour360",
          titulo: deixT.length + " pendência(s) do tour 360 ficaram para trás",
          detalhe: deixT.slice(0, 3).map(function (x) {
            return x.rot + " (última vez em " + texto(x.ultimaData) + ")";
          }).join(" · ") + (deixT.length > 3 ? " · +" + (deixT.length - 3) : ""),
          porque: "Elas continuavam abertas na última visita em que apareceram, e a visita seguinte não as trouxe — ou nasceu do zero, ou a estação foi apagada, ou o apontamento foi excluído. Sem este aviso, sumiriam da cobrança sem ninguém decidir nada.",
          /* ⚠ O DESTINO É A VISITA ANTIGA, e não a lista do módulo: é nela que
             a pendência ainda existe e pode ser marcada como resolvida. Sem
             `acaoGestao` o botão cai no `data-view` e larga a pessoa
             procurando de novo qual era — exatamente o que o comentário do
             botão em js/gestao.js manda não fazer. */
          valor: 0, view: "tour360",
          acaoGestao: "abrir-tour360", acaoId: (deixT[0] && deixT[0].tourId) || "",
          acao: "Abra a visita antiga, confira se o problema foi resolvido e marque; se não foi, crie a visita nova pelo botão Repetir visita, para ela vir junto."
        });
      }

      if (arrast.length) {
        arrast.sort(function (a, b) { return b.visitas - a.visitas; });
        achados.push({
          tipo: "tour-pendencia-arrastando", gravidade: 3, modulo: "tour360",
          titulo: arrast.length + " pendência(s) do tour 360 aberta(s) há mais de uma visita",
          detalhe: arrast.slice(0, 3).map(function (x) {
            return x.rot + " (" + x.visitas + " visitas" + (x.desde ? ", desde " + x.desde : "") + ")";
          }).join(" · ") + (arrast.length > 3 ? " · +" + (arrast.length - 3) : ""),
          porque: "Foi marcada numa visita, reapareceu na seguinte e continua aberta. É defeito que o cliente vai achar na entrega — com a data em que você mesmo viu primeiro.",
          valor: 0, obraId: arrast[0].obraId, view: "tour360",
          acaoGestao: "abrir-tour360", acaoId: arrast[0].tourId,
          acao: "Abra a visita, dê o veredito de cada uma (resolvida ou persiste) e ponha responsável e prazo."
        });
      }

      if (vencT.length) {
        achados.push({
          tipo: "tour-prazo-vencido", gravidade: 3, modulo: "tour360",
          titulo: vencT.length + " pendência(s) do tour 360 com prazo vencido",
          detalhe: vencT.slice(0, 3).map(function (x) {
            return x.rot + (x.prazo ? " (venceu em " + x.prazo + ")" : "") + (x.resp ? " · " + x.resp : "");
          }).join(" · ") + (vencT.length > 3 ? " · +" + (vencT.length - 3) : ""),
          porque: "O prazo foi combinado com alguém e passou. Prazo que vence sem ninguém dizer nada ensina que prazo, aqui, não vale.",
          valor: 0, obraId: vencT[0].obraId, view: "tour360",
          acaoGestao: "abrir-tour360", acaoId: vencT[0].tourId,
          acao: "Cobre quem ficou responsável, ou repactue o prazo dentro da própria pendência."
        });
      }

      /* ---- foto de visita PUBLICADA que nunca subiu ----
         ⚠ SÓ A VISITA PUBLICADA ENTRA. Em rascunho, foto na fila é o estado
         normal de quem acabou de fotografar; cobrar isso seria alarme que
         nasce em toda visita e que, de tanto aparecer, ninguém lê. Publicada,
         a estação simplesmente NÃO EXISTE no Portal (`paraPortal` descarta a
         foto sem endereço no servidor) e o cliente gira o tour, encontra
         buraco e conclui que ninguém fotografou aquele canto. */
      var fotoP = [], fotoN = 0, fotoNoAr = false;
      for (ti = 0; ti < tours.length; ti++) {
        var tv = tours[ti];
        if (texto(tv && tv.estado) !== "publicado") continue;
        var np = 0;
        try { np = num(T360.fotosPendentes(tv)); } catch (e2T) { np = 0; }
        if (np <= 0) continue;
        fotoN += np;
        if (comPortal[texto(tv.obraId)]) fotoNoAr = true;
        fotoP.push({ obraId: texto(tv.obraId), tourId: texto(tv.id), n: np,
          rot: texto(tv.titulo) || texto(tv.data) || "visita" });
      }
      if (fotoP.length) {
        achados.push({
          tipo: "tour-foto-nao-subiu", gravidade: fotoNoAr ? 3 : 2, modulo: "tour360",
          titulo: fotoN + " foto(s) de visita 360 publicada que nunca subiram",
          detalhe: fotoP.slice(0, 3).map(function (x) {
            return (nome[x.obraId] ? nome[x.obraId] + " · " : "") + x.rot + " (" + x.n + ")";
          }).join(" · ") + (fotoP.length > 3 ? " · +" + (fotoP.length - 3) : ""),
          porque: fotoNoAr
            ? "A visita está no ar e essas estações não existem para quem abre o Portal: o cliente gira a foto, encontra o buraco e conclui que ninguém fotografou."
            : "A visita foi dada por publicada e essas fotos só existem no aparelho que as tirou. Nenhum outro computador as vê, e um celular perdido leva o registro junto.",
          valor: 0, obraId: fotoP[0].obraId, view: "tour360",
          acaoGestao: "abrir-tour360", acaoId: fotoP[0].tourId,
          acao: "Abra o app com internet e deixe a fila de fotos terminar — quando a última subir, a visita se republica sozinha."
        });
      }

      /* ---- visita fotografada e nunca publicada ----
         O gêmeo do "diário aprovado e não publicado": alguém foi à obra, subiu
         no andaime e fotografou. Parado em rascunho, esse trabalho não vira
         nada — nem para o cliente, nem como comparativo da próxima visita.
         ⚠ SEM FOTO NÃO ENTRA. Uma visita recém-criada por "Repetir visita",
         com as estações copiadas e nenhuma foto, é exatamente o passo normal
         de quem vai fotografar amanhã. */
      var diasRasc = typeof o.diasTourRascunho === "number" ? o.diasTourRascunho : 7;
      var parados = [];
      if (hoje) for (ti = 0; ti < tours.length; ti++) {
        var tr = tours[ti];
        if (!tr || texto(tr.estado) === "publicado") continue;
        var resR = null;
        try { resR = T360.resumo(tr); } catch (e3T) { resR = null; }
        if (!resR || !resR.comFoto) continue;
        var idade = dias(texto(tr.data), hoje);
        if (idade == null || idade <= diasRasc) continue;
        parados.push({ obraId: texto(tr.obraId), tourId: texto(tr.id), dias: idade,
          fotos: resR.comFoto, rot: texto(tr.titulo) || texto(tr.data) || "visita" });
      }
      if (parados.length) {
        parados.sort(function (a, b) { return b.dias - a.dias; });
        achados.push({
          tipo: "tour-rascunho-parado", gravidade: 2, modulo: "tour360",
          titulo: parados.length + " visita(s) 360 fotografada(s) e nunca publicada(s)",
          detalhe: parados.slice(0, 3).map(function (x) {
            return (nome[x.obraId] ? nome[x.obraId] + " · " : "") + x.rot
              + " (" + x.fotos + " foto(s), há " + x.dias + " dias)";
          }).join(" · ") + (parados.length > 3 ? " · +" + (parados.length - 3) : ""),
          porque: "Alguém foi à obra e fotografou. Enquanto fica em rascunho, o trabalho não chega ao cliente e não serve de comparativo para a visita seguinte.",
          valor: 0, obraId: parados[0].obraId, view: "tour360",
          acaoGestao: "abrir-tour360", acaoId: parados[0].tourId,
          acao: "Confira as estações e publique — ou registre por que essa visita ficou de fora."
        });
      }

    }

    /* ---- O TETO DA NUVEM, FORA DO `if (tours.length)` ----
       ⚠ ESTE ALARME NÃO PERTENCE À LISTA DA TELA, e ficar dentro daquele `if`
       era a metade do defeito que faltava fechar: com o Painel filtrado numa
       obra que ainda não tem visita, `tours` chega vazio, o bloco inteiro não
       roda, e o alarme sumia — justamente quando o gestor filtra para
       investigar. O teto de 1 MB é da ENTIDADE da empresa, que vai num único
       documento do Firestore, e não tem nada a ver com a obra em foco.
       Achado pelo próprio teste novo (tools/test-atencao-tour.js), não por
       leitura: o conserto anterior trocou o cano e esqueceu a porta. */
    if (T360) {
      /* ---- o teto da nuvem ----
         ⚠ O TEXTO VEM PRONTO DO MOTOR, e é para vir mesmo: ele nomeia a visita
         mais gorda, que é o que transforma susto em ação. "Você está perto do
         limite" não tem saída; "a visita de 12/03 responde por 380 KB" tem. */
      /* ⚠ O PESO NÃO SAI DE `d.tours`, E ISSO NÃO É DESCUIDO.
         `d.tours` chega recortado — pelo escopo do sub-usuário e pelo filtro de
         obra do Painel — e está certo assim para COBRAR pendência. O teto de
         1 MB é outra pergunta: ele é da entidade inteira da empresa, que vai
         num único documento. Com a lista recortada, o alarme sumia justamente
         quando o gestor filtrava por obra para investigar, e o texto seguia
         dizendo "desta empresa" com um número que não era o dela. Quem monta a
         tela entrega a lista crua em `d.toursPeso` (js/gestao.js), e diz em
         `parcial` quando nem ela é a empresa toda. */
      var fonteP = d.toursPeso;
      var listaP = (fonteP && fonteP.lista) || (fonteP && fonteP.length ? fonteP : null);
      var parcialP = !!(fonteP && fonteP.parcial);
      /* ⚠ SEM `toursPeso`, VOLTA PARA `tours` — MAS DECLARANDO QUE É PARTE.
         Calar o alarme porque quem chamou esqueceu de um campo trocaria um
         número impreciso por silêncio, e o silêncio aqui é a sincronização
         parando sem aviso. Contar como se fosse a empresa toda seria mentir. */
      if (!listaP) { listaP = tours; parcialP = true; }
      var pesoT = null;
      if (listaP && listaP.length) { try { pesoT = T360.peso(listaP); } catch (e4T) { pesoT = null; } }
      if (pesoT && pesoT.estado !== "ok") {
        achados.push({
          tipo: "tour-nuvem-cheia", gravidade: pesoT.estado === "perigo" ? 3 : 2, modulo: "tour360",
          titulo: pesoT.estado === "perigo"
            ? "A sincronização dos tours 360 está perto de parar"
            : "Os tours 360 já ocupam " + num(pesoT.kb) + " KB na nuvem",
          detalhe: texto(pesoT.aviso)
            + (parcialP ? " — e esta conta é só das obras que a sua conta enxerga; o limite é da empresa inteira, então o total real é maior." : ""),
          porque: "A lista inteira vai num único documento de 1 MB. Passado o teto, a sincronização daquela empresa para — em silêncio, com o app continuando a dizer que está sincronizado.",
          valor: 0, view: "tour360",
          acao: "Apague as visitas antigas que já viraram relatório fotográfico, ou os comentários que já foram resolvidos."
        });
      }
    }

    /* ---- 6) VÍNCULO DE COMPRA APONTANDO PARA NOTA QUE NÃO RESPONDE ----
     * ⚠ O RECADO NÃO PODE AFIRMAR A CAUSA. O estado nasce de quatro portas
     * (versão anterior desfazendo o vínculo, nota excluída, nota que deixou
     * de citar o pedido, parcela apagada no Financeiro) e o app não tem como
     * saber por qual delas passou. Ele diz o que MEDIU — qual nota, e o que
     * há de errado com ela — e o que vai fazer. Culpar "a versão antiga" é
     * um palpite com cara de diagnóstico.
     * ⚠ E OS NÚMEROS CHEGAM PRONTOS DE QUEM CHAMA (`valorTexto`), como o
     * `expiraTexto` da licença: este motor é puro, o gate o roda em Node sem
     * `Util`, e imprimir o número cru num card de dinheiro já pôs "Validade
     * até 1788217835" na cara do cliente. */
    var _vc = d.vinculosCompra || {};
    var _diagTxt = function (m) {
      if (!m) return "";
      var qual = "a nota " + (m.numero || m.id);
      if (m.diag === "sumiu") return qual + " não existe mais";
      if (m.diag === "nao-cita") return qual + " não lista mais este pedido";
      return qual + " não tem lançamento no Financeiro";
    };
    var _linhaVc = function (x) {
      return (x.numero || x.compraId) + (x.fornecedor ? " · " + x.fornecedor : "")
        + " · " + _diagTxt(x.mortas && x.mortas[0]);
    };
    var _resumoVc = function (arr) {
      return arr.slice(0, 3).map(_linhaVc).join(" · ") + (arr.length > 3 ? " · +" + (arr.length - 3) : "");
    };
    if ((_vc.itens || []).length) {
      achados.push({
        tipo: "compra-sem-despesa", gravidade: 3, modulo: "financeiro",
        titulo: _vc.itens.length + " compra(s) recebida(s) sem despesa no Financeiro",
        detalhe: _resumoVc(_vc.itens),
        porque: "A despesa desses pedidos foi apagada quando a nota foi vinculada — é assim que o vínculo evita a despesa em dobro. A nota que devia ter tomado o lugar dela não está mais lançada, então este custo não está em obra nenhuma. Guardei a cópia da despesa original.",
        valor: _vc.itens.reduce(function (a, x) { return a + num(x.valor); }, 0),
        obraId: _vc.itens[0].obraId, view: "financeiro",
        acao: "Devolver a despesa ao Financeiro — o vínculo com a nota é desfeito junto.",
        gacao: "vinculo-morto"
      });
    }
    if ((_vc.semCopia || []).length) {
      /* ⚠ ACHADO SEPARADO, e não uma linha triste no de cima: aqui não há o
         que devolver, então prometer devolução seria promessa que o app não
         cumpre. E `valor` fica ZERO de propósito — pôr `pc.valor` no lugar do
         valor da despesa é inventar dinheiro num card que soma dinheiro; o
         valor do pedido vai no detalhe, nomeado como o que é. */
      achados.push({
        tipo: "compra-sem-despesa-sem-copia", gravidade: 3, modulo: "compras",
        titulo: _vc.semCopia.length + " compra(s) sem despesa e sem cópia para devolver",
        detalhe: _vc.semCopia.map(function (x) {
          return (x.numero || x.compraId) + " · pedido de " + texto(x.valorPedidoTexto)
            + " · " + _diagTxt(x.mortas && x.mortas[0]);
        }).slice(0, 3).join(" · ") + (_vc.semCopia.length > 3 ? " · +" + (_vc.semCopia.length - 3) : ""),
        porque: "O pedido está marcado como faturado por uma nota que não responde, e não guardei cópia da despesa que foi apagada. Não sei quanto devolver, e não vou chutar.",
        valor: 0, obraId: _vc.semCopia[0].obraId, view: "financeiro",
        acao: "Solto o vínculo para o pedido voltar às listas. A despesa, confira no Financeiro e lance à mão se faltar.",
        gacao: "vinculo-morto"
      });
    }
    if ((_vc.presos || []).length) {
      achados.push({
        tipo: "compra-presa-a-nota-morta", gravidade: 2, modulo: "compras",
        titulo: _vc.presos.length + " pedido(s) preso(s) a uma nota que não existe mais",
        detalhe: _resumoVc(_vc.presos),
        porque: "A despesa deles está no Financeiro — o dinheiro está certo. O que trava é o vínculo: enquanto o pedido constar faturado por essa nota, ele não aparece na lista para receber a nota certa quando ela chegar.",
        valor: 0, obraId: _vc.presos[0].obraId, view: "compras",
        acao: "Soltar o vínculo para o pedido voltar a poder receber nota.",
        gacao: "vinculo-morto"
      });
    }
    if ((_vc.revisar || []).length) {
      /* ⚠ O ACHADO QUE ADMITE NÃO SABER. Estes pedidos têm despesa viva E
         ainda guardam a cópia do que a nota levou. Ou a cópia falta de
         verdade (entrega parcial: a viagem 2 lançou depois), ou ela já voltou
         por uma versão anterior. O app não tem como decidir, e decidir errado
         é ou dinheiro apagado ou dinheiro em dobro. Então ele conta o caso,
         diz o valor da cópia, solta o vínculo e arquiva a cópia sem devolvê-la. */
      achados.push({
        tipo: "compra-copia-em-duvida", gravidade: 3, modulo: "financeiro",
        titulo: _vc.revisar.length + " pedido(s) com uma cópia de despesa que eu não sei se já voltou",
        detalhe: _vc.revisar.map(function (x) {
          return (x.numero || x.compraId) + " · cópia de " + texto(x.copiaTexto)
            + " · " + _diagTxt(x.mortas && x.mortas[0]);
        }).slice(0, 3).join(" · ") + (_vc.revisar.length > 3 ? " · +" + (_vc.revisar.length - 3) : ""),
        porque: "Esses pedidos têm despesa viva no Financeiro E ainda guardam a cópia da despesa que a nota tinha substituído. Ou essa cópia faz falta (entrega parcelada, em que só parte voltou), ou ela já foi devolvida por outro aparelho. Devolver por conta própria seria lançar em dobro; apagar seria destruir a única prova.",
        valor: 0, obraId: _vc.revisar[0].obraId, view: "financeiro",
        acao: "Confira a despesa do pedido no Financeiro. Posso soltar o vínculo e guardar a cópia sem devolvê-la.",
        gacao: "vinculo-morto"
      });
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
