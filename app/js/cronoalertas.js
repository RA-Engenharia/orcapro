/* =====================================================================
 * cronoalertas.js — CronoAlertas: os ALERTAS do cronograma das obras no
 * sino (fatia 1C do planejador, "uso"). Motor PURO: sem DOM, sem Store,
 * sem relógio (o "hoje" vem de quem chama).
 *
 * Espec: ESPEC-planejador.md (rev. 4), §3.3 (1C), §4 (linha "Sino") e D23;
 * desenho uso.md §1.6 e §3.4.
 *
 * ⚠ A MESMA MONTAGEM DO CHIP DA FAIXA, DA SUB-ABA P×R E DA FICHA DA OBRA
 *   (`App._cronoPainelDados`). Uma segunda régua de atraso faria o sino dizer
 *   uma coisa e a tela da obra outra — medido: o sino dizia "tudo em dia"
 *   com o galpão 2 dias úteis depois da base e 5 nós atrasados.
 * ⚠ A "PROJEÇÃO PELO RITMO" NÃO ENTRA: é outra régua e contradiz o término
 *   da base na mesma tela (auditoria: "25 dias antes" × "2 d.u. depois").
 * ⚠ MARCO É `n.marco === true` (nunca "duração 0": as 14 etapas opcionais
 *   do galpão têm 0 dia e dariam 14 alertas falsos).
 * ⚠ NENHUM TEXTO LEVA R$. O alerta aparece para quem não vê dinheiro.
 * ⚠ UMA UNIDADE POR OBRA E POR TIPO no badge: uma obra atrasada não vira 40
 *   itens no sino (a pessoa para de ler o sino inteiro).
 * ⚠ ES5 (sem const/let/arrow/template/class/includes/find/Object.assign).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* módulo irmão resolvido NA HORA da chamada (em Node, pelo require relativo) */
  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  /* ⚠ sem `instanceof`: a data pode vir de OUTRO realm (a janela destacada,
     o vm das suítes), e ali `instanceof Date` responde false — o período
     cairia calado no relógio de agora */
  function ehData(d) { return Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime()); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) {
    if (ehData(d)) return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d == null ? "" : d));
    return m ? m[0] : null;
  }
  function br(s) { return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : ""; }
  function dm(s) { return s ? s.slice(8, 10) + "/" + s.slice(5, 7) : ""; }
  function utc(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function difDias(a, b) { return Math.round((utc(b) - utc(a)) / 86400000); }
  function somar(s, n) {
    var d = new Date(utc(s) + n * 86400000);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  function pct(v) {
    var x = Math.round(Number(v) * 10) / 10;
    return (String(x).replace(".", ",")) + "%";
  }
  function du(n) { return n + " dia" + (n === 1 ? "" : "s") + " út" + (n === 1 ? "il" : "eis"); }
  function corta(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  var TIPOS = {
    "crono-base": { rotulo: "Cronograma: término depois da linha de base", prioridade: 1, ordem: 0, pre: "cb" },
    "crono-critica": { rotulo: "Cronograma: tarefas críticas atrasadas", prioridade: 1, ordem: 1, pre: "cc" },
    "crono-marco": { rotulo: "Cronograma: marcos e datas de término", prioridade: 2, ordem: 2, pre: "cm" },
    "crono-folga": { rotulo: "Cronograma: folga consumida", prioridade: 2, ordem: 3, pre: "cf" },
    "crono-falha": { rotulo: "Cronograma: não conferido", prioridade: 2, ordem: 4, pre: "cx" }
  };
  /* a regra de "voltar antes do prazo": piorou 2 dias úteis desde que foi
     dispensado (decisão k4 / D23) */
  var PIORA_VOLTA = 2, DIAS_DISPENSA = 7;

  var CronoAlertas = {
    pronto: true,
    TIPOS: TIPOS,
    DIAS_DISPENSA: DIAS_DISPENSA,

    /* OS ALERTAS DE UMA OBRA. entrada = {obra, painel (o de
       App._cronoPainelDados), r (o estimar com a árvore, `comGantt:true`),
       hoje: "AAAA-MM-DD"}. Devolve a lista de itens (nunca lança).
       ⚠ Painel que não fechou (estado fora de ok/sem-diarios) vira UM item
       "não consegui conferir" — nunca silêncio: o sino calado lê-se como "tudo
       em dia". */
    daObra: function (entrada) {
      var e = entrada || {}, obra = e.obra || {}, p = e.painel, r = e.r, hoje = iso(e.hoje);
      var nomeObra = String(obra.nome || "sem nome"), oid = String(obra.id == null ? "" : obra.id), out = [];
      function item(tipo, chaveResto, nivel, titulo, detalhe, noId, etapaId) {
        var T = TIPOS[tipo];
        out.push({ tipo: tipo, chave: T.pre + "|" + oid + "|" + chaveResto, nivel: Math.max(0, Math.round(Number(nivel) || 0)),
          prioridade: T.prioridade, titulo: titulo, detalhe: detalhe, obraId: oid, obraNome: nomeObra,
          noId: noId == null ? null : String(noId), etapaId: etapaId == null ? null : String(etapaId) });
      }
      if (!p || !hoje || (p.estado !== "ok" && p.estado !== "sem-diarios")) {
        item("crono-falha", "painel", 0, "Não consegui conferir o cronograma da obra " + nomeObra + " — abra a obra para ver o motivo.",
          p && p.erro ? corta(p.erro, 140) : "", null, null);
        return out;
      }
      var porId = {};
      arr(r && r.atividades).forEach(function (n) { if (n && n.id != null) porId[String(n.id)] = n; });
      var etapasFora = {};
      arr(r && r.etapas).forEach(function (et) { if (et && et.foraDoPrazo) etapasFora[String(et.id)] = true; });
      var corte = iso(p.dataCorte), txCorte = corte ? " em " + dm(corte) + (p.fonteCorte === "ultimoDiario" ? " (último diário)" : "") : "";
      var numPorId = {};
      arr(p.nos).forEach(function (n) { if (n && n.id != null) numPorId[String(n.id)] = n.numero; });
      /* 1) atrasadas: críticas e as que consumiram a folga */
      arr(p.nos).forEach(function (n) {
        if (!n || !n.folha) return;
        var sit = String(n.situacao || "");
        if (!/^atrasada/.test(sit)) return;
        var x = porId[String(n.id)];
        if (!x) return;
        var dur = Math.max(0, Number(x.duracao) || 0);
        var prev = Number(n.previstoPct) || 0, real = Number(n.realPct) || 0;
        /* ⚠ "(previsto − executado) × duração" é APROXIMAÇÃO, e o texto diz
           "estimado" (risco 10 do desenho USO) */
        var atraso = sit === "atrasada (não iniciada)" ? Math.ceil(prev / 100 * dur) : Math.ceil((prev - real) / 100 * dur);
        var rot = String((n.numero ? n.numero + " " : "") + corta(n.nome || x.nome || "", 60));
        var pr = "previsto " + pct(prev) + " × executado " + pct(real) + txCorte;
        if (x.critico === true) {
          item("crono-critica", n.id, atraso, rot + " — atrasada no caminho crítico",
            "Obra " + nomeObra + " · " + pr + " · sem folga: atrasa a entrega", n.id, n.etapaId);
        } else {
          var folga = Math.max(0, Number(x.folga) || 0);
          if (folga > 0 && atraso >= folga) {
            item("crono-folga", n.id, atraso - folga, rot + " — consumiu a folga",
              "Obra " + nomeObra + " · folga de " + du(folga) + "; atraso estimado de " + du(atraso) + " (" + pr + ")", n.id, n.etapaId);
          }
        }
      });
      /* 2) marcos vencendo (7 dias) ou vencidos, sem conclusão */
      var ate7 = somar(hoje, 7), realPorId = {};
      arr(p.nos).forEach(function (n) { if (n && n.id != null) realPorId[String(n.id)] = n.realPct; });
      arr(r && r.atividades).forEach(function (x) {
        if (!x || x.marco !== true) return;
        var eid = x.etapaId != null ? String(x.etapaId) : String(x.id);
        if (x.foraDoPrazo === true || own(etapasFora, eid)) return;
        var d = iso(x.dataInicio); if (!d) return;
        var rp = own(realPorId, String(x.id)) ? Number(realPorId[String(x.id)]) : null;
        if (rp != null && rp >= 100) return;
        var rot = "Marco " + String((x.numero ? x.numero + " " : "") + corta(x.nome || "", 60));
        if (d < hoje) {
          var nd = difDias(d, hoje);
          item("crono-marco", x.id, nd, rot + " venceu há " + nd + " dia" + (nd === 1 ? "" : "s") + " (" + dm(d) + ") e não está concluído",
            "Obra " + nomeObra, x.id, x.etapaId);
        } else if (d <= ate7) {
          var nv = difDias(hoje, d);
          item("crono-marco", x.id, 0, rot + (nv === 0 ? " vence hoje" : " vence em " + nv + " dia" + (nv === 1 ? "" : "s")) + " (" + dm(d) + ") e não está concluído",
            "Obra " + nomeObra, x.id, x.etapaId);
        }
      });
      /* 3) "terminar até" que a rede não cumpre (o motor já avisa em
         r.restricoes.avisos — o recado dele, com a obra) */
      arr(r && r.restricoes && r.restricoes.avisos).forEach(function (a, i) {
        if (!a || !a.msg) return;
        var alvo = a.id != null ? String(a.id) : (a.etapaId != null ? String(a.etapaId) : "r" + i);
        item("crono-marco", "tae|" + alvo, 1, corta(String(a.msg), 160), "Obra " + nomeObra, a.id != null ? a.id : null, a.etapaId != null ? a.etapaId : a.id);
      });
      /* 4) término depois da linha de base (a MESMA conta do chip) */
      var desv = p.kpis ? Number(p.kpis.desvioTerminoDias) : NaN;
      if (p.base && isFinite(desv) && desv > 0) {
        var v = p.base.versao != null ? "v" + p.base.versao : "";
        var fimPlano = iso(r && r.dataFim), fimBase = iso(p.base.dataFim);
        item("crono-base", v || "base", desv, "Obra " + nomeObra + " — o plano termina " + du(desv) + " depois da linha de base " + v,
          (fimPlano ? (p.plano ? "plano de execução " : "cronograma ") + br(fimPlano) : "") + (fimBase ? " × linha de base " + v + " " + br(fimBase) : "") +
          (corte ? " · corte " + dm(corte) : ""), null, null);
      }
      /* ordem estável: a pior primeiro dentro do tipo */
      out.sort(function (a, b) {
        return (TIPOS[a.tipo].ordem - TIPOS[b.tipo].ordem) || (b.nivel - a.nivel) || (a.chave < b.chave ? -1 : (a.chave > b.chave ? 1 : 0));
      });
      return out;
    },

    /* vale o "dispensado"? `disp` = {chave: {ate: "AAAA-MM-DD", nivel}} */
    dispensado: function (it, disp, hoje) {
      var d = disp && own(disp, it.chave) ? disp[it.chave] : null;
      if (!d || !d.ate) return false;
      if (String(d.ate) < String(iso(hoje) || "")) return false;
      if (Number(it.nivel) >= (Number(d.nivel) || 0) + PIORA_VOLTA) return false;
      return true;
    },
    /* a marca que o botão [Dispensar por 7 dias] grava (quem grava é a fiação,
       no localStorage do aparelho) */
    marcaDispensa: function (it, hoje) {
      return { ate: somar(iso(hoje), DIAS_DISPENSA), nivel: Math.max(0, Number(it && it.nivel) || 0) };
    },
    /* só as marcas ainda úteis (as vencidas saem, para a chave local não
       crescer para sempre) */
    podarDispensas: function (disp, hoje) {
      var out = {}, h = iso(hoje) || "";
      Object.keys(disp || {}).forEach(function (k) { var d = disp[k]; if (d && d.ate && String(d.ate) >= h) out[k] = { ate: String(d.ate), nivel: Number(d.nivel) || 0 }; });
      return out;
    },

    /* OS GRUPOS DO SINO. Uma unidade por obra e por tipo: com um item só, o
       item; com vários, uma linha "Obra X: N tarefas críticas atrasadas (7.2
       e mais N−1)" que leva à pior. Devolve {grupos: [{tipo, rotulo,
       prioridade, itens}], unidades, dispensados}. Cada item leva `acao`
       ({tipo: "crono-no", obraId, noId, etapaId}) e `chave`. */
    agrupar: function (itens, disp, hoje) {
      var porTipo = {}, ndisp = 0, self = this;
      arr(itens).forEach(function (it) {
        if (!it || !own(TIPOS, it.tipo)) return;
        if (self.dispensado(it, disp, hoje)) { ndisp++; return; }
        var g = porTipo[it.tipo] = porTipo[it.tipo] || { ordemObras: [], porObra: {} };
        if (!own(g.porObra, it.obraId)) { g.porObra[it.obraId] = []; g.ordemObras.push(it.obraId); }
        g.porObra[it.obraId].push(it);
      });
      var grupos = [], unidades = 0;
      Object.keys(porTipo).sort(function (a, b) { return TIPOS[a].ordem - TIPOS[b].ordem; }).forEach(function (tp) {
        var g = porTipo[tp], T = TIPOS[tp], its = [];
        g.ordemObras.forEach(function (oid) {
          var l = g.porObra[oid], p = l[0];
          unidades++;
          var acao = { tipo: "crono-no", obraId: p.obraId, noId: p.noId, etapaId: p.etapaId };
          if (l.length === 1) { its.push({ id: p.chave, chave: p.chave, titulo: p.titulo, detalhe: p.detalhe, prioridade: T.prioridade, nivel: p.nivel, acao: acao, n: 1 }); return; }
          var nomes = { "crono-critica": "tarefas críticas atrasadas", "crono-folga": "tarefas que consumiram a folga", "crono-marco": "marcos ou datas de término em risco" };
          var num = /^(\S+)/.exec(String(p.titulo || "")), rot = num ? num[1] : "";
          its.push({ id: p.chave, chave: p.chave, titulo: "Obra " + p.obraNome + ": " + l.length + " " + (nomes[tp] || "alertas") + (rot ? " (" + rot + " e mais " + (l.length - 1) + ")" : ""),
            detalhe: p.titulo + (p.detalhe ? " · " + p.detalhe : ""), prioridade: T.prioridade, nivel: p.nivel, acao: acao, n: l.length,
            chaves: l.map(function (x) { return x.chave; }), niveis: l.map(function (x) { return x.nivel; }) });
        });
        grupos.push({ tipo: tp, rotulo: T.rotulo, prioridade: T.prioridade, itens: its });
      });
      return { grupos: grupos, unidades: unidades, dispensados: ndisp };
    },

    /* os textos do rodapé e do "zen" (USO §1.6) */
    textos: function (estado) {
      var s = estado || {};
      var h = s.em ? (function () { var d = new Date(s.em); return isNaN(d.getTime()) ? "" : pad2(d.getHours()) + ":" + pad2(d.getMinutes()); })() : "";
      var rodape = "";
      if (s.conferindo) rodape = "Cronogramas: conferindo " + (s.conferidas || 0) + " de " + (s.total || 0) + " obra" + (s.total === 1 ? "" : "s") + "…";
      else if (s.pronto) rodape = s.total ? "Cronogramas conferidos às " + h + " (corte: último diário de cada obra; previsto × realizado dos diários)." : "Nenhuma obra em andamento com cronograma para conferir.";
      var zen = s.pronto ? "Nenhuma pendência: medições, tarefas, restrições e cronogramas em dia."
        : "Nenhuma pendência em medições, tarefas e restrições — cronogramas ainda sendo conferidos.";
      return { rodape: rodape, zen: zen };
    },

    _dep: dep
  };

  global.CronoAlertas = CronoAlertas;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoAlertas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
