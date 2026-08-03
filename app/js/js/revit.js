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
    montarAvanco: function (medicoes, lpTarefas) {
      function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
      function statusDe(pct) {
        return pct >= 99.5 ? "concluida" : (pct > 0 ? "andamento" : "pendente");
      }
      // 1) medições por itens — acumulado mais alto por (etapa|código)
      var porChave = {}, temMed = false;
      (medicoes || []).forEach(function (m) {
        ((m && m.itens) || []).forEach(function (it) {
          if (!it || !it.codigo) return;
          temMed = true;
          var etapa = String(it.etapa || "").trim();
          var ch = etapa + "|" + it.codigo;
          var acum = Math.min(100, num(it.pctAnterior) + num(it.pctPeriodo));
          var atual = porChave[ch];
          if (!atual || acum > atual.pctAcum) {
            porChave[ch] = { etapa: etapa, codigo: String(it.codigo),
                             pctAcum: acum,
                             peso: num(it.qtdContratada) * num(it.precoUnit) };
          }
        });
      });
      if (temMed) {
        var porCodigo = [], etapas = {};
        Object.keys(porChave).sort().forEach(function (ch) {
          var x = porChave[ch];
          porCodigo.push({ etapa: x.etapa, codigo: x.codigo, pctAcum: x.pctAcum });
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
        return { fonte: "medicao", porEtapa: porEtapa, porCodigo: porCodigo };
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

    // POST no servidor local; fallback: download do arquivo p/ salvar na mão.
    exportar: function (payload, cb) {
      cb = cb || function () {};
      var corpo = JSON.stringify(payload);
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
