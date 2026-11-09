/* =====================================================================
 * portalavanco.js — o Portal do cliente lê a MESMA obra que o engenheiro lê
 *
 * O DEFEITO (obra real, 08/11/2026, conferido no retrato publicado):
 * o engenheiro via "previsto 40,8% × realizado 29,5%" e as etapas 01, 04, 05 e
 * 08 a 100%; o cliente, na mesma obra e na mesma hora, via "0% concluído do
 * total previsto", as 29 etapas em 0% e uma Curva S dizendo que 100% da obra
 * deveria estar pronta em outubro (a linha de base dizia 22,9%).
 *
 * Duas causas, as duas no `_snapshotPortal`:
 *   1) o percentual só olhava digitado à mão → diário com quantidade →
 *      medição. O AVANÇO LANÇADO NO CRONOGRAMA, que é o que o painel lê, não
 *      entrava. Toda obra que acompanha o avanço pelo planejamento (sem
 *      quantidade prevista nos diários e sem boletim emitido) mostrava 0%.
 *   2) as datas e o planejado saíam do `Cronograma.estimar(orc)` — a estimativa
 *      do ORÇAMENTO contada do início da obra. O plano de execução e a linha de
 *      base nunca chegavam ao cliente, por mais que a obra fosse replanejada.
 *
 * ⚠ QUEM DIZ "O AVANÇO VALE" É O PAINEL, NÃO ESTE ARQUIVO. A regra mora em
 *   `kpis.portal` (js/cronoplan.js): `fonte === "cronograma"`. Aqui só se lê.
 *   Uma segunda decisão aqui seria o engenheiro ler "no Portal: 29,5%" e o
 *   cliente ler outra coisa, que é exatamente o defeito acima.
 * ⚠ NADA DE DINHEIRO SAI DAQUI. `valor` do nó só pesa a curva; a saída leva
 *   percentual e data. O retrato do cliente é lido no navegador dele.
 * ⚠ DATA: só a linha de base, que é o que foi combinado e congelado. Plano em
 *   edição não vira promessa ao cliente, e sem base nada muda de data.
 *
 * Motor puro: não lê Store, nem tela, nem relógio. ES5.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(x) { return Array.isArray(x) ? x : []; }
  function num(x) { return (typeof x === "number" && isFinite(x)) ? x : null; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function dia(x) { return /^\d{4}-\d{2}-\d{2}/.test(String(x || "")) ? String(x).slice(0, 10) : ""; }
  function dataUTC(iso) { var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fimDoMes(k) { var p = k.split("-"); return Date.UTC(+p[0], +p[1], 0); }
  var DIA_MS = 86400000;

  /* ---------- a etapa, como o cliente a lê ---------- */
  function linhaEtapa(n) {
    /* ⚠ SÓ A LINHA DE BASE. `n.atual` é o plano recalculado com o avanço: o fim
       dele é a PROJEÇÃO de término, e publicá-la como data da etapa seria ligar
       a previsão pela porta dos fundos, sem a decisão gravada que o PortalSync
       exige. Sem base, fica a data do caminho antigo. */
    var ref = n.base || {};
    var real = n.real || {};
    /* a etapa "sem valor orçado" não tem `realPct` (não pesa na conta), mas o
       avanço dela pode ter sido lançado: é fato, e o cliente pode ver */
    var pct = num(n.realPct);
    if (pct === null && n.avanco) pct = num(n.avanco.pct);
    /* 0 sem lançamento é "ninguém disse nada", não "não começou": escrever 0% e
       "Não iniciado" afirmaria ao contratante o que o sistema não sabe */
    if (pct === 0 && !n.avanco) pct = null;
    return { id: n.id == null ? "" : String(n.id), etapa: String(n.nome || ""),
      inicio: dia(ref.ini), fim: dia(ref.fim), realInicio: dia(real.ini), realFim: dia(real.fim), pct: pct };
  }

  /* ---------- a curva do que foi lançado ----------
     O painel não tem esta série: a `curva.executado` dele vem só dos diários
     (o aviso "curva executada indisponível" é verdade lá). Aqui cada folha
     entrega a parte dela (valor × % lançado) ao longo das datas REAIS
     registradas, na proporção dos dias — a mesma hipótese de distribuição do
     planejado — e a linha termina no mês do corte.
     ⚠ O ÚLTIMO PONTO É O NÚMERO DO CABEÇALHO, não o que a soma der: a linha
     verde terminando em 29,4 embaixo de um "29,5%" é pergunta de cliente sem
     resposta. A série inteira é ESCALADA até ele. Trocar só o último ponto
     faria a curva DESCER no fim quando a soma passa do número (o teste pegou
     [2,3 / 75 / 29,5]), e curva acumulada que desce é erro à vista. */
  function realizadoDoAvanco(nos, eixo, corte, pctFinal) {
    var fimEixo = -1, i;
    var mesCorte = dia(corte).slice(0, 7);
    if (!mesCorte || !eixo.length) return [];
    for (i = 0; i < eixo.length; i++) if (eixo[i] <= mesCorte) fimEixo = i;
    if (fimEixo < 0) return [];
    var folhas = arr(nos).filter(function (n) {
      return n && n.folha && !n.opcionalFora && !n.foraDaBase && !n.sumiuDoAtual && num(n.valor) > 0;
    });
    var total = 0;
    folhas.forEach(function (n) { total += n.valor; });
    if (!(total > 0)) return [];
    var fCorte = dataUTC(dia(corte));
    var saida = [];
    for (i = 0; i <= fimEixo; i++) {
      var limite = Math.min(fimDoMes(eixo[i]), fCorte), soma = 0;
      folhas.forEach(function (n) {
        var p = num(n.realPct);
        if (!(p > 0)) return;
        var real = n.real || {};
        var ini = dia(real.ini), fim = dia(real.fim) || dia(corte);
        /* lançado sem data de início: não dá para dizer quando foi feito. Entra
           inteiro no corte, nunca espalhado por uma data inventada. */
        if (!ini) { if (i === fimEixo) soma += n.valor * p / 100; return; }
        var a = dataUTC(ini), b = dataUTC(fim);
        if (limite < a) return;
        var frac = (b <= a) ? 1 : Math.min(1, (limite - a + DIA_MS) / (b - a + DIA_MS));
        soma += n.valor * (p / 100) * frac;
      });
      saida.push((soma / total) * 100);
    }
    var fim = saida.length ? saida[saida.length - 1] : 0, alvo = num(pctFinal);
    var fator = (alvo !== null && fim > 0) ? alvo / fim : 1;
    saida = saida.map(function (v) { return r1(v * fator); });
    if (saida.length && alvo !== null) saida[saida.length - 1] = alvo;
    return saida;
  }

  /* ---------- diário ou medição no eixo do plano ----------
     `pontos` = [{ mes: "AAAA-MM", pct }]. Vale o último de cada mês; mês sem
     ponto repete o anterior; antes do primeiro, 0. TRUNCADO no último ponto: o
     Portal lê null como zero e a curva despencaria no primeiro mês vazio. */
  function serieNoEixo(eixo, pontos) {
    var porMes = {}, ultimo = "";
    arr(pontos).forEach(function (p) {
      var m = p && String(p.mes || "").slice(0, 7), v = p ? num(p.pct) : null;
      if (!/^\d{4}-\d{2}$/.test(m) || v === null) return;
      porMes[m] = v;
      if (m > ultimo) ultimo = m;
    });
    if (!ultimo) return [];
    var saida = [], atual = 0;
    arr(eixo).forEach(function (m) {
      if (m > ultimo) return;
      if (Object.prototype.hasOwnProperty.call(porMes, m)) atual = porMes[m];
      saida.push(atual);
    });
    return saida;
  }

  /* ---------- o avanço lançado, dia a dia ----------
     Mesma hipótese de `realizadoDoAvanco` (datas reais, proporção dos dias, série
     escalada até o número do cabeçalho), no grão que a Evolução por semana pede.
     Lançado sem data de início entra inteiro no corte. */
  function evolucaoDoAvanco(nos, corte, pctFinal) {
    var fCorte = dia(corte) ? dataUTC(dia(corte)) : null, alvo = num(pctFinal);
    if (fCorte === null) return [];
    var folhas = arr(nos).filter(function (n) {
      return n && n.folha && !n.opcionalFora && !n.foraDaBase && !n.sumiuDoAtual && num(n.valor) > 0;
    });
    var total = 0, inicio = fCorte;
    folhas.forEach(function (n) {
      total += n.valor;
      var i = dia((n.real || {}).ini);
      if (num(n.realPct) > 0 && i && dataUTC(i) < inicio) inicio = dataUTC(i);
    });
    if (!(total > 0)) return [];
    var soma = function (t) {
      var s = 0;
      folhas.forEach(function (n) {
        var p = num(n.realPct);
        if (!(p > 0)) return;
        var real = n.real || {}, ini = dia(real.ini), fim = dia(real.fim) || dia(corte);
        if (!ini) { if (t >= fCorte) s += n.valor * p / 100; return; }
        var a = dataUTC(ini), b = dataUTC(fim);
        if (t < a) return;
        s += n.valor * (p / 100) * ((b <= a) ? 1 : Math.min(1, (t - a + DIA_MS) / (b - a + DIA_MS)));
      });
      return (s / total) * 100;
    };
    var fimSoma = soma(fCorte), fator = (alvo !== null && fimSoma > 0) ? alvo / fimSoma : 1;
    var saida = [], ant = -1;
    for (var t = inicio; t <= fCorte; t += DIA_MS) {
      var v = Math.round(soma(t) * fator * 100) / 100;
      if (t === fCorte && alvo !== null) v = alvo;
      if (v !== ant) saida.push({ d: new Date(t).toISOString().slice(0, 10), acum: v });
      ant = v;
    }
    return saida;
  }

  /* Texto de orçamento que não é serviço e não vai ao cliente: ajuste de preço,
     BDI, qualquer valor em reais escrito na descrição. */
  var ITEM_INTERNO = /\bBDI\b|R\$|ARREDONDAMENTO|DESCONTO|MARGEM|LUCRO|AJUSTE DE PRE/i;

  var PortalAvanco = {
    realizadoDoAvanco: realizadoDoAvanco,
    evolucaoDoAvanco: evolucaoDoAvanco,

    /* ---------- Previsto × Realizado por atividade ----------
       Os diários desta fonte são texto: a tabela vinha toda em "—". Previsto é a
       quantidade do item do orçamento; realizado é essa quantidade × o avanço
       lançado na subetapa ou etapa do item. Etapa sem item sai como uma linha só,
       com o percentual. ⚠ Só quantidade: preço nenhum entra aqui. Sem avanço
       lançado o realizado fica null, nunca 0: ninguém disse que não começou.
       `lido` = saída de doPainel. */
    atividades: function (orc, lido) {
      if (!orc || !lido || !lido.temAvanco) return [];
      var porEtapa = {}, saida = [];
      arr(orc.etapas).forEach(function (e) { if (e && e.id != null) porEtapa[String(e.id)] = e; });
      var nos = lido.pctNos || {};
      arr(lido.etapas).forEach(function (n) {
        var e = porEtapa[n.id];
        if (!e) return;
        /* opcional não contratada volta do painel com linha de base como "fora da
           base", sem a marca de opcional: sem avanço, ela não é serviço desta obra */
        if (e.opcional && !(num(n.pct) > 0)) return;
        var itens = arr(e.itens).filter(function (i) {
          return i && Number(i.quantidade) > 0 && !ITEM_INTERNO.test(String(i.descricao || ""));
        });
        if (!itens.length) {
          saida.push({ chave: "plano|" + n.id, etapaId: n.id, etapa: n.etapa, descricao: "Etapa completa (sem item de quantidade no orçamento)", unidade: "",
            qtdPrevista: null, qtdAcumulada: null, qtdSaldo: null, pctAcumulado: n.pct, realInicio: n.realInicio, realFim: n.realFim });
          return;
        }
        /* como a EAP do cronograma: subetapa só vale se for DESTA etapa, e o item
           solto de etapa com subetapas é do nó "~g", não do agregado da etapa.
           Nó de folha que falta não herda o agregado: fica sem número. */
        var valida = {}, temFolha = !!nos[String(e.id) + "~g"];
        arr(e.subetapas).forEach(function (s) {
          if (s && s.id != null) { valida[String(s.id)] = true; if (nos[String(s.id)]) temFolha = true; }
        });
        itens.forEach(function (i) {
          var sub = i.subEtapaId || i.subetapaId, sid = (sub != null && valida[String(sub)]) ? String(sub) : "";
          var no = (sid ? nos[sid] : nos[String(e.id) + "~g"]) || null;
          var pct = no ? no.pct : (temFolha ? null : n.pct);
          var q = Number(i.quantidade);
          var feito = pct === null ? null : Math.round(q * Math.max(0, Math.min(100, pct))) / 100;
          saida.push({ chave: "plano|" + String(i.id), etapaId: n.id, etapa: n.etapa, descricao: String(i.descricao || "").slice(0, 240), unidade: String(i.unidade || ""),
            qtdPrevista: q, qtdAcumulada: feito, qtdSaldo: feito === null ? null : Math.max(0, Math.round((q - feito) * 100) / 100) + 0, pctAcumulado: pct,
            realInicio: (no && no.realInicio) || n.realInicio, realFim: (no && no.realFim) || n.realFim });
        });
      });
      return saida;
    },
    serieNoEixo: serieNoEixo,

    /* O painel não dá para responder se esta obra tem avanço para mostrar.
       Fora ficam os estados em que a obra nunca teve número por este caminho
       (sem início, sem orçamento, sem etapas): reter ali travaria a publicação
       de diário por causa de um número que nunca foi ao ar. */
    painelNaoServe: function (painel) {
      var p = painel;
      if (!p) return true;
      if (p.estado === "sem-inicio" || p.estado === "sem-obra" || p.estado === "sem-orcamento" || p.estado === "sem-etapas") return false;
      if (p.estado !== "ok" && p.estado !== "sem-diarios") return true;
      var K = p.kpis || {};
      /* sem confronto não existe `realPct` (ex.: calendário inválido na base), e
         boletim que deixou de contar é decisão que o engenheiro ainda deve */
      return !K.evm || K.portalRetido === true;
    },

    /* Lê o painel da obra (saída de CronoPlan.montarPainel). `null` = o painel
       não tem nada que o Portal possa usar, e o retrato segue o caminho antigo.
       temPlano: a obra tem linha de base (datas e planejado).
       temAvanco: o Portal deve usar o avanço lançado (percentual e etapas). */
    doPainel: function (painel) {
      var p = painel;
      if (!p || (p.estado !== "ok" && p.estado !== "sem-diarios")) return null;
      var K = p.kpis || {};
      var temPlano = !!p.base;
      var po = K.portal || {};
      var temAvanco = po.fonte === "cronograma" && num(po.pct) !== null;
      if (!temPlano && !temAvanco) return null;
      var nos = arr(p.nos);
      var etapas = nos.filter(function (n) { return n && n.tipo === "etapa" && !n.opcionalFora && !n.sumiuDoAtual; }).map(linhaEtapa);
      var c = p.curva || {}, eixo = arr(c.eixo), rotulos = arr(c.rotulos);
      var plan = arr(c.base);
      var temCurva = temPlano && eixo.length > 0 && rotulos.length === eixo.length && plan.length === eixo.length;
      var pctNos = {};
      nos.forEach(function (n) {
        if (n && n.tipo !== "etapa" && n.id != null && !n.opcionalFora && !n.sumiuDoAtual) {
          var ln = linhaEtapa(n);
          pctNos[ln.id] = { pct: ln.pct, realInicio: ln.realInicio, realFim: ln.realFim };
        }
      });
      return { temPlano: temPlano, temAvanco: temAvanco, pct: temAvanco ? po.pct : null,
        corte: dia(p.dataCorte), etapas: etapas, pctNos: pctNos,
        diario: temAvanco ? evolucaoDoAvanco(nos, p.dataCorte, po.pct) : [],
        previstoNaData: (K.previstoNaData && num(K.previstoNaData.pct) !== null) ? K.previstoNaData.pct : null,
        curva: temCurva ? { eixo: eixo.slice(), rotulos: rotulos.slice(), planejado: plan.slice() } : null,
        realizado: (temAvanco && temCurva) ? realizadoDoAvanco(nos, eixo, p.dataCorte, po.pct) : [] };
    },

    /* Aplica ao que o retrato já montou. Entra e sai por valor: `e.cronograma`
       é o caminho antigo, `e.idsCronograma` o id da etapa de cada linha dele,
       na mesma ordem, e `e.curvaS` a curva. Sai só o que muda. */
    aplicar: function (lido, e) {
      e = e || {};
      var out = { cronograma: arr(e.cronograma), curvaS: e.curvaS || null };
      if (!lido) return out;
      var idsC = arr(e.idsCronograma), antigaPorId = {};
      arr(e.cronograma).forEach(function (L, i) { if (L && idsC[i]) antigaPorId[String(idsC[i])] = L; });
      if (lido.temAvanco && e.fonte === "cronograma") {
        out.cronograma = lido.etapas.map(function (n) {
          var semNumero = n.pct === null, ant = antigaPorId[n.id] || {};
          /* o id vai junto só nesta fonte: o Portal casa o % da etapa por ele, não
             pelo nome (renomear a etapa, ou dois nomes iguais, trocava o número) */
          var L = { etapaId: n.id, etapa: n.etapa, inicio: n.inicio || ant.inicio || "", fim: n.fim || ant.fim || "",
            pct: semNumero ? 0 : Math.round(Math.max(0, Math.min(100, n.pct))), fonte: "cronograma" };
          if (n.realInicio) L.realInicio = n.realInicio;
          if (n.realFim) L.realFim = n.realFim;
          /* `semApontamento`: o Portal publicado já desenha sem número e sem
             "aguardando"; `rotuloSem` diz o motivo certo na tela nova */
          if (semNumero) { L.semApontamento = true; L.rotuloSem = "sem avanço lançado"; }
          return L;
        });
      } else if (lido.temPlano) {
        /* outra fonte de percentual: o número fica, a DATA passa a ser a da obra */
        var porId = {};
        lido.etapas.forEach(function (n) { porId[n.id] = n; });
        var ids = arr(e.idsCronograma);
        out.cronograma = out.cronograma.map(function (L, i) {
          var n = (L && ids[i]) ? porId[String(ids[i])] : null;
          if (!n) return L;
          var c = {}, k;
          for (k in L) if (Object.prototype.hasOwnProperty.call(L, k)) c[k] = L[k];
          if (n.inicio) c.inicio = n.inicio;
          if (n.fim) c.fim = n.fim;
          return c;
        });
      }
      if (lido.curva) {
        var realizado, fonteCurva = (e.curvaS && e.curvaS.fonte) || "";
        var ateCurva = "";
        if (lido.temAvanco && e.fonte === "cronograma") { realizado = lido.realizado; fonteCurva = "cronograma"; ateCurva = lido.corte; }
        else if (fonteCurva === "diario") {
          realizado = serieNoEixo(lido.curva.eixo, arr(e.seriePeriodos).map(function (x) {
            return { mes: x && x.chave, pct: x && x.pctAcumulado };
          }));
        } else {
          /* medição: `acumuladoPct` da linha (o que o fiscal aprovou) */
          realizado = serieNoEixo(lido.curva.eixo, arr(e.medicoes).slice().sort(function (a, b) {
            return String(a.data || "").localeCompare(String(b.data || ""));
          }).map(function (m) { return { mes: m && m.data, pct: m && m.acumuladoPct }; }));
          fonteCurva = fonteCurva || "medicao";
        }
        out.curvaS = { labels: lido.curva.rotulos, planejado: lido.curva.planejado, realizado: realizado,
          fonte: fonteCurva, eixo: "mes-calendario", situacao: null, desvio: null };
        /* ⚠ o planejado do mês é o do FIM do mês, e o realizado para no corte: em
           07/11, "100 planejado × 29,5 realizado" em nov/26 lido sem a data parece
           70 pontos de atraso, quando o previsto naquele dia era 40,8 */
        if (ateCurva) { out.curvaS.ate = ateCurva; if (lido.previstoNaData !== null) out.curvaS.previstoNaData = lido.previstoNaData; }
      } else if (lido.temAvanco && e.fonte === "cronograma" && out.curvaS) {
        /* sem eixo do plano: a linha de medições (zerada) ao lado do andamento
           seria falsa. Fica o planejado, sem linha de realizado. */
        var cs = {}, kc;
        for (kc in out.curvaS) if (Object.prototype.hasOwnProperty.call(out.curvaS, kc)) cs[kc] = out.curvaS[kc];
        cs.realizado = []; cs.fonte = "cronograma"; cs.situacao = null; cs.desvio = null;
        out.curvaS = cs;
      }
      return out;
    },

    /* A projeção de término sai do ritmo medido nos diários com quantidade. Com
       o avanço lançado no cronograma esse ritmo não existe, e o recado antigo
       ("sem isso não existe percentual") seria falso ao lado do número.
       ⚠ NÃO se publica a data calculada pelo plano: projeção lida como
       compromisso vira discussão contratual, e ligar isso é decisão à parte. */
    previsaoSemRitmo: function () {
      return { ok: false, motivo: "avanco-pelo-cronograma",
        explicacao: "A projeção automática de término usa o ritmo medido nos diários com quantidade, que esta obra ainda não tem. O andamento acima vem do avanço lançado no cronograma pela equipe. O prazo que vale é o do contrato." };
    }
  };

  global.PortalAvanco = PortalAvanco;
  if (typeof module !== "undefined" && module.exports) module.exports = PortalAvanco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
