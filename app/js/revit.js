/* OrçaPRO — Exportar p/ Revit (ponte com o plugin RA BIM Tools 2.0)
 * Monta o revit/obra-ativa.json que o plugin pyRevit lê: obra, BDI, etapas
 * do orçamento e cronograma do Agente de Execução (datas por etapa).
 * Lógica pura/testável (Node): montarObraAtiva/isoLocal não tocam DOM.
 * Envio: POST /__revit/exportar no servidor local (static.js grava o arquivo);
 * sem servidor (file:// ou versão antiga) cai no download do .json.
 */
(function (global) {
  "use strict";

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // Date -> "AAAA-MM-DD" no fuso LOCAL (o agente gera Date à meia-noite local;
  // toISOString() em UTC-3 voltaria um dia). String ISO já pronta passa direto.
  function isoLocal(d) {
    if (!d) return "";
    if (typeof d === "string") {
      var s = d.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
    }
    if (typeof d.getFullYear !== "function") return "";
    if (isNaN(d.getTime())) return "";   // Invalid Date -> fora (nunca "NaN-NaN-NaN")
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  var Revit = {
    isoLocal: isoLocal,

    /* Contrato formato 1 (lido por rabim_orcapro.carregar_obra no plugin):
       { formato, obra, orcamento, uf, competencia, bdi (percentual),
         etapas: [nome...], cronograma: [{etapa, inicio, fim}...], geradoEm } */
    montarObraAtiva: function (orc, obra, sim) {
      orc = orc || {};
      var etapas = [], vistos = {};
      (orc.etapas || []).forEach(function (e) {
        var nome = e && e.nome ? String(e.nome).trim() : "";
        if (nome && !vistos[nome]) { vistos[nome] = 1; etapas.push(nome); }
      });
      var cronograma = [];
      ((sim && sim.etapas) || []).forEach(function (e) {
        var ini = isoLocal(e && e.dataInicio), fim = isoLocal(e && e.dataFim);
        var nome = e && e.nome ? String(e.nome).trim() : "";
        if (nome && ini && fim) cronograma.push({ etapa: nome, inicio: ini, fim: fim });
      });
      var bdi = 0;
      if (orc.bdi && isFinite(Number(orc.bdi.percentual))) bdi = Number(orc.bdi.percentual);
      // itens do orçamento (p/ Reconciliar/Curva ABC no plugin do Revit):
      // só itens com código real; quantidades/custos numéricos, total derivado
      var itens = [], valorTotal = 0;
      (orc.etapas || []).forEach(function (e) {
        var nomeEtapa = e && e.nome ? String(e.nome).trim() : "";
        ((e && e.itens) || []).forEach(function (it) {
          if (!it) return;
          var cod = it.codigo ? String(it.codigo).trim() : "";
          if (!cod || cod === "—" || cod === "-") return;
          var qtde = Number(it.quantidade), unit = Number(it.custoUnitario);
          if (!isFinite(qtde)) qtde = 0;
          if (!isFinite(unit)) unit = 0;
          var total = qtde * unit;
          valorTotal += total;
          itens.push({
            etapa: nomeEtapa,
            codigo: cod,
            descricao: String(it.descricao || "").slice(0, 90),
            unidade: String(it.unidade || "").toUpperCase(),
            quantidade: qtde,
            custoUnitario: unit,
            total: total
          });
        });
      });
      return {
        formato: 1,
        obra: (obra && obra.nome) || (orc.obra && orc.obra.nome) || orc.nome || "",
        orcamento: orc.nome || "",
        uf: orc.uf || "",
        competencia: orc.competenciaSinapi || "",
        bdi: bdi,
        etapas: etapas,
        cronograma: cronograma,
        itens: itens,
        valorTotal: valorTotal,
        geradoEm: new Date().toISOString(),
        versaoApp: (typeof CONFIG !== "undefined" && CONFIG.versao) || ""
      };
    },

    /* Avanço FÍSICO da obra p/ o plugin pintar o modelo (formato 1, v1.1.77+).
       Fonte preferida: medições POR ITENS (pctAnterior+pctPeriodo por código,
       ponderado por qtdContratada×precoUnit na etapa). Fallback: Last Planner
       (tarefas por etapa: % feitas). Sem dado -> null (plugin instrui).
       Puro/testável: recebe as listas cruas, não toca em Store. */
    /* =====================================================================
     * ⚠ UMA SÓ REGRA DE AVANÇO, DUAS APRESENTAÇÕES
     *
     * Este arquivo monta o `obra-ativa.json` que o plugin do Revit lê — outro
     * programa, fora do navegador. O FORMATO da saída é contrato e não muda
     * aqui; o que estava errado era o NÚMERO.
     *
     * Dois defeitos, medidos lado a lado com o `bimavanco.js` (o motor que o
     * 4D, a pintura do modelo e o relatório usam):
     *
     * 1. ⚠ BOLETIM REJEITADO ENTRAVA NA CONTA. Numa obra com um boletim
     *    aprovado de 30% e outro REJEITADO de +60%, o engenheiro via 30% no
     *    4D e o projetista via 90% dentro do Revit. Sessenta pontos de
     *    diferença sobre a mesma obra, e o número do Revit é o que o
     *    projetista usa para decidir o que desenhar. O financeiro já
     *    aplicava esta regra desde a v1.1.234 (medição recusada pelo fiscal
     *    não é obra feita); só este caminho não aplicava.
     *
     * 2. ⚠ ITEM SEM CÓDIGO ERA DESCARTADO — e é exatamente assim que o
     *    quantitativo do BIM lança (`codigo: ""`). Resultado: a obra orçada
     *    a partir do modelo, que é o caminho principal do produto,
     *    exportava avanço NENHUM para o Revit e caía calada no fallback do
     *    Last Planner. A chave passa a ser o `itemId` (que todo boletim por
     *    itens carrega); `porCodigo` continua saindo só para quem TEM
     *    código, porque quem lê aquilo indexa por código.
     * =================================================================== */
    montarAvanco: function (medicoes, lpTarefas) {
      function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
      function statusDe(pct) {
        return pct >= 99.5 ? "concluida" : (pct > 0 ? "andamento" : "pendente");
      }
      /* a lista de status que não contam é a do bimavanco — uma só na casa.
         Réplica local só para o caso de este arquivo rodar sem ele. */
      var NAO_CONTA = (global.BimAvanco && global.BimAvanco.NAO_CONTA) ||
        (function () { try { return require("./bimavanco.js").NAO_CONTA; } catch (e) { return { rejeitada: 1 }; } })();

      // 1) medições por itens — acumulado mais alto por (etapa|item)
      var porChave = {}, temMed = false, semCodigo = 0, ignorados = 0;
      (medicoes || []).forEach(function (m) {
        if (!m) return;
        if (NAO_CONTA[String(m.status || "").toLowerCase()]) { ignorados++; return; }
        ((m && m.itens) || []).forEach(function (it) {
          /* ⚠ a chave é o ITEM, não o código: item sem código é item do
             quantitativo do BIM, e sumir com ele é sumir com a obra inteira */
          var kid = it && (it.itemId || it.codigo);
          if (!it || !kid) return;
          temMed = true;
          var etapa = String(it.etapa || "").trim();
          var ch = etapa + "|" + kid;
          var acum = Math.min(100, num(it.pctAnterior) + num(it.pctPeriodo));
          var atual = porChave[ch];
          if (!atual || acum > atual.pctAcum) {
            porChave[ch] = { etapa: etapa, codigo: String(it.codigo || ""),
                             pctAcum: acum,
                             peso: num(it.qtdContratada) * num(it.precoUnit) };
          }
        });
      });
      if (temMed) {
        var porCodigo = [], etapas = {};
        Object.keys(porChave).sort().forEach(function (ch) {
          var x = porChave[ch];
          /* `porCodigo` é indexado por código por quem lê: entrada sem código
             não vai para lá — mas CONTA na etapa, que é o número que aparece */
          if (x.codigo) porCodigo.push({ etapa: x.etapa, codigo: x.codigo, pctAcum: x.pctAcum });
          else semCodigo++;
          var e = etapas[x.etapa] || (etapas[x.etapa] = { soma: 0, peso: 0, n: 0, media: 0 });
          e.soma += x.pctAcum * x.peso; e.peso += x.peso;
          e.media += x.pctAcum; e.n += 1;   // fallback: média simples se peso 0
        });
        var porEtapa = Object.keys(etapas).sort().map(function (nome) {
          var e = etapas[nome];
          var pct = e.peso > 0 ? (e.soma / e.peso) : (e.media / e.n);
          pct = Math.round(pct * 10) / 10;
          return { etapa: nome, pct: pct, status: statusDe(pct) };
        });
        /* campos ADITIVOS: o plugin antigo ignora o que nao conhece, e a tela
           daqui passa a poder dizer o que ficou de fora em vez de calar */
        return { fonte: "medicao", porEtapa: porEtapa, porCodigo: porCodigo,
                 semCodigo: semCodigo, boletinsIgnorados: ignorados };
      }
      // 2) Last Planner — % de tarefas feitas por etapa (título da tarefa)
      var lp = {};
      (lpTarefas || []).forEach(function (t) {
        if (!t || !t.titulo) return;
        var nome = String(t.titulo).trim();
        if (!nome) return;
        var g = lp[nome] || (lp[nome] = { feitas: 0, total: 0 });
        g.total += 1;
        if (t.status === "feito") g.feitas += 1;
      });
      var nomes = Object.keys(lp).sort();
      if (!nomes.length) return null;
      return {
        fonte: "lastplanner",
        porEtapa: nomes.map(function (nome) {
          var g = lp[nome];
          var pct = Math.round(g.feitas / g.total * 1000) / 10;
          return { etapa: nome, pct: pct, status: statusDe(pct) };
        }),
        porCodigo: []
      };
    },

    /* ===== A PONTE DE IA PARA O PLUGIN =====
       O plugin do Revit roda em IronPython, fora do navegador: ele nao tem
       localStorage e portanto NAO TEM COMO SABER a licenca nem o endereco do
       backend de IA. Sem isso o servidor devolve 403 "Ative sua licenca" e o
       botao de orcar fica sem a metade que desempata.

       Quem sabe as duas coisas e ESTA tela. Entao, no mesmo clique de
       "Exportar p/ Revit", mandamos tambem {backend, licenca} para o servidor
       local gravar em <orcapro>/revit/ia.json, que o plugin le.

       ⚠ E BEST-EFFORT DE PROPOSITO: se falhar, o export da obra NAO pode
         falhar junto. O plugin continua funcionando com o que a regra resolve;
         so o desempate por IA fica de fora, e ele diz isso na tela. */
    exportarIA: function (cb) {
      cb = cb || function () {};
      if (typeof fetch !== "function" || location.protocol === "file:") return cb(null, { pulado: true });
      var backend = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "";
      var licenca = (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : "";
      if (!backend || !licenca) return cb(null, { pulado: true, motivo: "sem backend ou sem licença" });
      fetch("/__revit/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato: 1, backend: backend, licenca: licenca })
      }).then(function (r) { return r.json(); })
        .then(function (j) { cb(null, j); })
        .catch(function () { cb(null, { pulado: true }); });
    },

    // POST no servidor local; fallback: download do arquivo p/ salvar na mão.
    exportar: function (payload, cb) {
      cb = cb || function () {};
      var corpo = JSON.stringify(payload);
      try { Revit.exportarIA(); } catch (e) {}   // best-effort: nunca derruba o export
      if (typeof fetch !== "function" || location.protocol === "file:") {
        Revit.baixar(corpo); return cb(null, { download: true });
      }
      fetch("/__revit/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo
      }).then(function (r) { return r.json().then(function (j) { return { st: r.status, j: j }; }); })
        .then(function (res) {
          if (res.st === 200 && res.j && res.j.ok) return cb(null, res.j);
          // servidor antigo (404) ou recusa: entrega por download, sem travar
          Revit.baixar(corpo); cb(null, { download: true, detalhe: (res.j && res.j.erro) || ("HTTP " + res.st) });
        })
        .catch(function () { Revit.baixar(corpo); cb(null, { download: true }); });
    },

    baixar: function (corpo) {
      try {
        var blob = new Blob([corpo], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "obra-ativa.json";
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      } catch (e) { /* ambiente sem DOM (teste) */ }
    }
  };

  global.Revit = Revit;
  if (typeof module !== "undefined" && module.exports) module.exports = Revit;
})(typeof window !== "undefined" ? window : globalThis);
