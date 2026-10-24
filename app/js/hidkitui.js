/* =====================================================================
 * hidkitui.js — PROJETO INTELIGENTE na tela (fiação FINA do js/hidkit.js e do js/hidambiente.js).
 *
 * O que faz (pedido do Rogério, 17/10/2026):
 *  · posicionar o aparelho → o KIT nasce sozinho (válvula com a prumada até a laje, registro, esperas, ralo do box);
 *  · o 2º aparelho do mesmo cômodo → o AMBIENTE se liga sozinho (caixa sifonada, ventilação, ramal DN 100);
 *  · mover o aparelho → o kit e as ligações se refazem; apagar → o kit sai; Ctrl+Z desfaz tudo de uma vez (um lote);
 *  · peça do kit editada À MÃO → pergunta antes de sobrescrever.
 *
 * Gancho: o js/biminstui.js chama HidKitUI.aoReconstruir(st, famAval) a cada replay do editor. O trabalho roda FORA do
 * replay (setTimeout): gravar op dentro do rebuild reentraria no editor.
 * ⚠ DESFAZER: depois de um Ctrl+Z o kit e o aparelho podem ficar desencontrados de propósito (o usuário voltou o kit);
 *   o estado desencontrado vira "aceito" e só um NOVO movimento do aparelho refaz o kit — senão o kit voltava sozinho
 *   e o Ctrl+Z nunca desfazia.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(n) { return global[n] || null; }
  function B() { return global.BIM || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function num0(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  var LS = "orcapro:hidkit:auto", LSB = "orcapro:hidkit:baldrame";
  function lsLer(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsGravar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var U = {
    VERSAO: 1, MAX_AVISOS: 8,   // hid:ok quantos avisos o painel mostra (o resto fica no resultado)
    ligado: (function () { try { return localStorage.getItem(LS) !== "0"; } catch (e) { return true; } })(),
    _vistos: null, _len: null, _ignorar: {}, _agendado: false, _ocupado: false, ultimo: null, perguntar: null,
    /* VIGA BALDRAME: "por_baixo" (padrão) ou "atravessar"; sem viga no modelo, o parâmetro { altura, largura, topo } (m) */
    modoBaldrame: lsLer(LSB, "por_baixo") === "atravessar" ? "atravessar" : "por_baixo",
    baldrameParam: (function () { try { return JSON.parse(lsLer(LSB + ":param", "null")); } catch (e) { return null; } })(),
    pisoAcabado: (function () { var v = parseFloat(lsLer(LSB + ":pisoAcabado", "")); return isFinite(v) ? v : null; })(),
    alturaVent: (function () { var v = parseFloat(lsLer(LSB + ":alturaVent", "")); return isFinite(v) && v > 0 ? v : null; })(),   /* VENTILAÇÃO: altura de saída do terminal acima do piso (m); vazio = o padrão do motor (+3,50) */   /* NÍVEL AUTOMÁTICO: o piso acabado padrão do projeto (m) */
    /* PENDÊNCIAS FINAIS (18/10/2026): o TIPO da caixa de inspeção da linha da rede — padrão a caixa de 0,60 m de alvenaria;
       pré-moldada de concreto; ou o dispositivo de PVC Ø 300 (a 8160 não o aceita na rede enterrada: fica a pendência) — e a tampa */
    tipoCaixa: (function () { var v = lsLer(LSB + ":tipoCaixa", "alvenaria"); return v === "premoldado" || v === "pvc300" ? v : "alvenaria"; })(),
    tampaCaixa: lsLer(LSB + ":tampaCaixa", "concreto") === "ferro" ? "ferro" : "concreto",
    parametros: function () { var p = { baldrameModo: U.modoBaldrame, tipoCaixa: U.tipoCaixa, tampa: U.tampaCaixa }; if (U.baldrameParam) p.baldrame = U.baldrameParam; if (U.pisoAcabado != null) p.pisoAcabado = U.pisoAcabado; if (U.alturaVent != null) p.alturaSaidaVentilacao = U.alturaVent; if (U.redeAutomatica === false) p.redeAutomatica = false; return p; },
    definirCaixa: function (campo, valor) {
      if (campo === "tipo" && (valor === "alvenaria" || valor === "premoldado" || valor === "pvc300")) { U.tipoCaixa = valor; lsGravar(LSB + ":tipoCaixa", valor); }
      else if (campo === "tampa" && (valor === "concreto" || valor === "ferro")) { U.tampaCaixa = valor; lsGravar(LSB + ":tampaCaixa", valor); }
      else return null;
      var c = U._ctx(); if (!c) { U._redesenhar(); return null; }
      if (!arr(c.estado.hidRedes).length) { U._redesenhar(); return { ok: true, semRede: true }; }
      return U.refazerRede();   /* as caixas da rede saem de novo com o tipo/tampa novos (um lote, Ctrl+Z desfaz) */
    },
    /* refaz TODAS as linhas da rede no estado dado (os ambientes que mudaram entram nelas) — devolve as ops */
    _redes: function (cOps, est, avaliarFam, opsAcum) {
      var HR = dep("HidRede"), BE = dep("BimEdit"); if (!HR || !BE || !arr(est.hidRedes).length) return { ops: [], resultados: [] };
      var novas = [], res = [], todos = cOps.concat([{ op: "lote", id: "previa", ops: opsAcum.slice() }]), e2 = est;
      arr(est.hidRedes).forEach(function (r) {
        var R = HR.gerar({ estado: e2, avaliarFam: avaliarFam, ops: todos, rede: r.id, parametros: U.parametros() });
        res.push(R);
        /* o resumo da rede (decisões e pendências) vai na 1ª peça nova do lote — o memorial lê (HidKitUI.decisoes) */
        var o1 = R.ops.filter(function (o) { return o.op !== "apagar" && o.op !== "desanotar"; })[0];
        if (o1) o1.redeInfo = { id: r.id, baldrame: r.baldrame || "por_baixo", decisoes: R.decisoes, pendencias: R.pendencias.map(function (p) { return { chave: p.chave, motivo: p.motivo }; }), caixas: R.caixas.length, interferencias: R.interferencias.length };
        if (R.ops.length) { R.ops.forEach(function (o) { novas.push(o); }); todos = cOps.concat([{ op: "lote", id: "previa", ops: opsAcum.concat(novas) }]); e2 = BE.aplicar(todos); }
      });
      return { ops: novas, resultados: res };
    },
    /* confirmação (a e2e troca por uma função; na tela é o confirm do navegador) */
    _confirmar: function (txt) { if (typeof U.perguntar === "function") return !!U.perguntar(txt); try { return global.confirm ? global.confirm(txt) : false; } catch (e) { return false; } },
    /* ⚠ no ciclo do replay usa o estado que o replay acabou de montar (st): o BIM.editarEstado() recalcula o quantitativo
       inteiro a cada chamada — numa obra grande isso pesava em todo clique */
    _ctx: function (st) {
      var b = B(); if (!b || !b.editarOps) return null;
      var estado = st || null;
      if (!estado) { if (!b.editarEstado) return null; var est = b.editarEstado(); if (!est || !est.estado) return null; estado = est.estado; }
      return { b: b, estado: estado, ops: b.editarOps(), avaliarFam: function (f, t, i) { return b.familiaAvaliar(f, t, i); } };
    },
    _vizinhos: function (estado) {
      var K = dep("HidKit");
      return function (f) {
        var fi = arr(estado.familias).filter(function (x) { return String(x.id) === String(f); })[0]; if (!fi || !K) return [];
        return arr(estado.familias).filter(function (x) { return x.id !== fi.id && K.tipoDaFamilia(x.famId, x.tipoId) && d2(x, fi) <= K.GEO_KIT.raioAmbiente; }).map(function (x) { return { x: x.x, z: x.z }; });
      };
    },
    aoReconstruir: function (st) {
      U._st = st || null;
      if (U._agendado || U._ocupado) return;
      U._agendado = true;
      setTimeout(function () { U._agendado = false; var s0 = U._st; U._st = null; try { U.processar(s0); } catch (e) { try { console.warn("HidKitUI", e); } catch (e2) {} }
        /* o CADEADO do Alinhar (js/bimalinharinst.js): a referência andou → a peça travada acompanha */
        try { var AIc = global.BimAlinharInst; if (AIc && AIc.conferir && !U._ocupado) { var c2 = U._ctx(); if (c2) AIc.conferir(c2.estado); } } catch (eAI) {} }, 0);
    },
    /* o ciclo: o que entrou, mudou ou saiu desde a última vez */
    processar: function (st) {
      var K = dep("HidKit"), c = U._ctx(st); if (!K || !c) return null;
      var fams = arr(c.estado.familias), len = c.ops.length, ids = fams.map(function (f) { return String(f.id); });
      U._ligarNivel();
      if (U._vistos == null) { U._vistos = ids; U._len = len; U._nivelBase(c.estado); return null; }   /* abriu o projeto: o que já está lá não ganha kit sozinho (nem religa pelo nível) */
      if (len < U._len) {
        /* ⚠ UM Ctrl+Z desfaz a AÇÃO inteira: se o que saiu foi o lote AUTOMÁTICO do kit (posicionar, mover, apagar o aparelho),
           sai junto a op da pessoa que o disparou — senão "apagar o chuveiro" precisava de dois Ctrl+Z e o primeiro deixava o
           kit órfão no modelo. Os lotes dos BOTÕES (Ligar ambiente, Gerar kits) não encadeiam. */
        if (U._lote && U._lote.encadear && U._len === U._lote.len && len === U._lote.len - 1 && c.b.desfazer) {
          U._lote = null; U._ocupado = true;
          try { c.b.desfazer(); } finally { U._ocupado = false; }
          var c3 = U._ctx(); if (c3) { c = c3; fams = arr(c.estado.familias); len = c.ops.length; ids = fams.map(function (f) { return String(f.id); }); }
        }
        U._lote = null;
        /* Ctrl+Z: o desencontro que ficou é o que o usuário quis — aceita a pose atual */
        K.reconciliar({ estado: c.estado, avaliarFam: c.avaliarFam, ops: c.ops }).forEach(function (a) { var fi = fams.filter(function (f) { return String(f.id) === a.famInst; })[0]; U._ignorar[a.famInst] = fi ? K.assinatura(fi) : "apagado"; });
        U._len = len; U._vistos = ids; return null;
      }
      /* ⚠ a lista de ops SALTOU mais de uma (replay: abriu outra obra, importou, sincronizou): o que veio já estava
         pronto — vira a nova base, sem gerar kit (cada ação da pessoa grava UMA op; o lote do kit é uma op) */
      if (len > U._len + 1) { U._len = len; U._vistos = ids; return null; }
      U._len = len;
      var novos = ids.filter(function (id) { return U._vistos.indexOf(id) < 0; });
      U._vistos = ids;
      if (!U.ligado) return null;
      var acoes = K.reconciliar({ estado: c.estado, avaliarFam: c.avaliarFam, ops: c.ops, novos: novos, vizinhos: U._vizinhos(c.estado) }).filter(function (a) {
        if (a.acao === "gerar") return true;
        var fi = fams.filter(function (f) { return String(f.id) === a.famInst; })[0], ass = fi ? K.assinatura(fi) : "apagado";
        if (U._ignorar[a.famInst] === ass) return false;
        if (a.manual && !U._confirmar("O kit hidráulico de " + a.famInst + " foi editado à mão e " + a.motivo.replace(/^o aparelho \S+ /, "o aparelho ") + ".\n\nRefazer o kit (a edição manual é substituída)?")) { U._ignorar[a.famInst] = ass; return false; }
        delete U._ignorar[a.famInst];
        return true;
      });
      if (!acoes.length) return U._nivelMudou(c);
      return U._aplicarAcoes(c, acoes, true);
    },
    /* NÍVEL AUTOMÁTICO (js/hidnivel.js): a fonte do IFC (o raio vertical da tela) e o piso acabado padrão do projeto */
    _ligarNivel: function () {
      var HN = dep("HidNivel"), b = B(); if (!HN) return;
      if (!HN._fonteIfc && b && b.pisoIfcEm) HN.fonteIfc(function (x, z, yTopo) { return b.pisoIfcEm(x, z, yTopo); });
      HN.parametros = U.parametros();
    },
    _nivelVisto: {},
    _nivelBase: function (est) { arr(est && est.nivelAjustes).forEach(function (a) { U._nivelVisto[a.id] = a.para; }); },
    /* uma peça GERADA (caixa sifonada/ralo do ambiente ou do kit, caixa de inspeção da rede) mudou de nível (o piso mudou, o
       terreno mudou): religa o ambiente dela / refaz a rede, UMA vez por nível novo (encadeado com a ação da pessoa) */
    _nivelMudou: function (c) {
      var K = dep("HidKit"), A = dep("HidAmbiente"), BE = dep("BimEdit"); if (!K || !A || !BE) return null;
      var aj = arr(c.estado.nivelAjustes).filter(function (a) { return a.gerado && U._nivelVisto[a.id] !== a.para; });
      if (!aj.length) return null;
      aj.forEach(function (a) { U._nivelVisto[a.id] = a.para; });
      var lista = K.achatar(c.ops), opDe = {}; lista.forEach(function (o) { if (o && o.id != null) opDe[String(o.id)] = o; });
      var sementes = [], temRede = false;
      aj.forEach(function (a) {
        var o = opDe[String(a.id)] || {};
        if (o.rede != null) { temRede = true; return; }
        if (o.kit != null) { sementes.push(String(o.kit)); return; }
        if (o.amb != null) { var inf = lista.filter(function (x) { return x.amb === o.amb && x.ambInfo; }).pop(); if (inf && arr(inf.ambInfo.aparelhos).length) sementes.push(String(inf.ambInfo.aparelhos[0])); }
      });
      var ops = [], todos = c.ops, est2 = c.estado, feitos = {}, res = [];
      sementes.forEach(function (seed) {
        var M = A.membros(est2, c.avaliarFam, todos, seed, null); if (!M || feitos[M.id]) return; feitos[M.id] = 1;
        if (!lista.some(function (o) { return o.amb === M.id; })) return;
        var R = A.ligar({ estado: est2, avaliarFam: c.avaliarFam, ops: todos, famInst: seed, parametros: U.parametros() });
        if (R.ops.length) { U._marcar(R); R.ops.forEach(function (o) { ops.push(o); }); todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops }]); est2 = BE.aplicar(todos); }
        res.push(R);
      });
      if (res.length || temRede) { var RR = U._redes(c.ops, est2, c.avaliarFam, ops); RR.ops.forEach(function (o) { ops.push(o); }); }
      if (!ops.length) return null;
      U._ocupado = true; var ok = false;
      try { ok = c.b.editarLote({ op: "lote", id: "hidnivel-" + String(new Date().getTime()), origem: "hidkit", ops: JSON.parse(JSON.stringify(ops)) }); } finally { U._ocupado = false; }
      var c2 = U._ctx(); if (ok && c2) { U._len = c2.ops.length; U._vistos = arr(c2.estado.familias).map(function (f) { return String(f.id); }); U._lote = { len: U._len, encadear: true }; U._nivelBase(c2.estado); }
      status(ok ? "Nível automático: o piso mudou sob " + aj.map(function (a) { return a.id; }).join(", ") + " — ligações refeitas na cota nova." : "O editor recusou o religar do nível.");
      U._redesenhar();
      return ok;
    },
    /* grava o lote: os kits + a ligação dos ambientes tocados (um Ctrl+Z desfaz tudo) */
    _aplicarAcoes: function (c, acoes, encadear) {
      var K = dep("HidKit"), A = dep("HidAmbiente"), BE = dep("BimEdit"), ops = [], resumo = { kits: [], removidos: [], ambientes: [] };
      acoes.forEach(function (a) { a.ops.forEach(function (o) { ops.push(o); }); (a.acao === "remover" ? resumo.removidos : resumo.kits).push({ famInst: a.famInst, acao: a.acao, kit: a.kit || null }); });
      /* ambientes: o do aparelho novo/mexido (2+ aparelhos ou já ligado) e o que perdeu um aparelho */
      var todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops }]), est2 = BE ? BE.aplicar(todos) : null, feitos = {};
      if (A && est2) acoes.forEach(function (a) {
        var seed = a.famInst;
        if (a.acao === "remover") {
          var amb = K.achatar(c.ops).filter(function (o) { return o.amb != null && o.ambInfo && arr(o.ambInfo.aparelhos).indexOf(a.famInst) >= 0; }).pop();
          var resta = amb ? arr(amb.ambInfo.aparelhos).filter(function (x) { return x !== a.famInst && arr(est2.familias).some(function (f) { return String(f.id) === x; }); }) : [];
          if (!resta.length) return;
          seed = resta[0];
        }
        var M = A.membros(est2, c.avaliarFam, todos, seed, null); if (!M || feitos[M.id]) return;
        var jaLigado = K.achatar(c.ops).some(function (o) { return o.amb === M.id; });
        if (M.fams.length < 2 && !jaLigado) return;
        if (U._ambManual(c.ops, M.id) && !U._confirmar("As ligações do ambiente " + M.id + " foram editadas à mão.\n\nRefazer as ligações (a edição manual é substituída)?")) return;
        var R = A.ligar({ estado: est2, avaliarFam: c.avaliarFam, ops: todos, famInst: seed, parametros: U.parametros() });
        feitos[M.id] = 1;
        if (R.ops.length) { U._marcar(R); R.ops.forEach(function (o) { ops.push(o); }); todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops }]); est2 = BE.aplicar(todos); }
        resumo.ambientes.push(R);
      });
      /* a LINHA DA REDE refaz junto: o ambiente que mudou entra nela no mesmo lote */
      if (est2 && resumo.ambientes.length) { var RR = U._redes(c.ops, est2, c.avaliarFam, ops); RR.ops.forEach(function (o) { ops.push(o); }); resumo.redes = RR.resultados; }
      if (!ops.length) return null;
      U._ocupado = true;
      var ok = false;
      try { ok = c.b.editarLote({ op: "lote", id: "hidkit-" + String(new Date().getTime()), origem: "hidkit", ops: JSON.parse(JSON.stringify(ops)) }); } finally { U._ocupado = false; }
      if (ok) { var c2 = U._ctx(); if (c2) { U._len = c2.ops.length; U._vistos = arr(c2.estado.familias).map(function (f) { return String(f.id); }); U._lote = { len: U._len, encadear: !!encadear }; } }
      U.ultimo = { ok: ok, resumo: resumo, quando: new Date().getTime() };
      var nK = resumo.kits.length, amb = resumo.ambientes[0];
      status(ok ? (nK ? "Kit hidráulico: " + resumo.kits.map(function (k) { return k.famInst + " (" + ((k.kit && dep("HidKit").kits()[k.kit.tipo]) || {}).nome + ")"; }).join(", ") + "." : "") + (resumo.removidos.length ? " Kit removido: " + resumo.removidos.map(function (k) { return k.famInst; }).join(", ") + "." : "") +
        (amb ? " Ambiente ligado: " + (amb.caixaSifonada ? "caixa sifonada, " : "") + (amb.ventilacao ? "ventilação DN " + amb.ventilacao.dn + ", " : "") + (amb.rota ? amb.rota.nome.toLowerCase() : "sem traçado") + (amb.pendencias.length ? " — " + amb.pendencias.length + " pendência(s)" : "") + "." : "") + " Ctrl+Z desfaz." : "O editor recusou o kit hidráulico.");
      U._redesenhar();
      return U.ultimo;
    },
    /* as decisões e pendências do ambiente vão na 1ª op do lote dele (o sanear guarda o campo da op): o memorial lê */
    _marcar: function (R) {
      var o = R.ops.filter(function (x) { return x.op !== "apagar"; })[0]; if (!o) return;
      o.ambInfo = { id: R.ambiente.id, aparelhos: R.ambiente.aparelhos, terreo: R.ambiente.terreo, decisoes: R.decisoes, pendencias: R.pendencias.map(function (p) { return { chave: p.chave, motivo: p.motivo }; }),
                    caixaSifonada: R.caixaSifonada, ventilacao: R.ventilacao ? { dn: R.ventilacao.dn, topo: R.ventilacao.topo, desconectores: R.ventilacao.desconectores, ramais: R.ventilacao.ramais } : null, rota: R.rota ? { nome: R.rota.nome, comprimento: R.rota.comprimento } : null };
    },
    _ambManual: function (ops, ambId) {
      var K = dep("HidKit"), lista = K.achatar(ops), ids = {}, ultimo = -1;
      lista.forEach(function (o, i) { if (o.amb === ambId && o.op !== "apagar" && o.id != null) { ids[o.id] = 1; ultimo = i; } });
      return lista.some(function (o, i) { return i > ultimo && o.kit == null && o.amb == null && ((o.id != null && ids[o.id]) || (o.trecho != null && ids[o.trecho])) && ["instAlterar", "mover", "apagar", "acessorio"].indexOf(o.op) >= 0; });
    },
    _redesenhar: function () { try { var H = dep("HidCalcUI"); if (H && H.redesenhar) H.redesenhar(); } catch (e) {} },

    /* ---------------- ações dos botões */
    /* Ligar ambiente: o aparelho selecionado no 3D (ou o último que entrou) */
    ligarAgora: function (famInst) {
      var A = dep("HidAmbiente"), K = dep("HidKit"), c = U._ctx(); if (!A || !K || !c) return null;
      var seed = famInst;
      if (!seed && c.b.selecao) { var sel = arr(c.b.selecao().uids).map(function (u) { return String(u).replace(/^edit:/, ""); }); seed = sel.filter(function (id) { return arr(c.estado.familias).some(function (f) { return String(f.id) === id && K.tipoDaFamilia(f.famId, f.tipoId); }); })[0]; }
      if (!seed) { var ap = arr(c.estado.familias).filter(function (f) { return K.tipoDaFamilia(f.famId, f.tipoId); }); seed = ap.length ? String(ap[ap.length - 1].id) : null; }
      if (!seed) { U.ultimo = { ok: false, erro: "Nenhum aparelho sanitário no modelo: coloque a bacia, o lavatório e o chuveiro." }; U._redesenhar(); return U.ultimo; }
      var M = A.membros(c.estado, c.avaliarFam, c.ops, seed, null);
      if (M && U._ambManual(c.ops, M.id) && !U._confirmar("As ligações do ambiente " + M.id + " foram editadas à mão.\n\nRefazer as ligações (a edição manual é substituída)?")) return null;
      var R = A.ligar({ estado: c.estado, avaliarFam: c.avaliarFam, ops: c.ops, famInst: seed, parametros: U.parametros() });
      if (!R.ops.length) { U.ultimo = { ok: false, resumo: { kits: [], removidos: [], ambientes: [R] } }; U._redesenhar(); return U.ultimo; }
      U._marcar(R);
      var opsL = R.ops.slice(), BEl = dep("BimEdit"), RRl = BEl ? U._redes(c.ops, BEl.aplicar(c.ops.concat([{ op: "lote", id: "previa", ops: opsL }])), c.avaliarFam, opsL) : { ops: [], resultados: [] };
      RRl.ops.forEach(function (o) { opsL.push(o); });
      U._ocupado = true; var ok = false;
      try { ok = c.b.editarLote({ op: "lote", id: "hidamb-" + String(new Date().getTime()), origem: "hidkit", ops: JSON.parse(JSON.stringify(opsL)) }); } finally { U._ocupado = false; }
      var c2 = U._ctx(); if (c2) { U._len = c2.ops.length; U._vistos = arr(c2.estado.familias).map(function (f) { return String(f.id); }); U._lote = { len: U._len, encadear: false }; }
      U.ultimo = { ok: ok, resumo: { kits: [], removidos: [], ambientes: [R], redes: RRl.resultados }, quando: new Date().getTime() };
      status(ok ? "Ambiente ligado (" + R.ambiente.aparelhos.length + " aparelhos)" + (R.pendencias.length ? " — " + R.pendencias.length + " pendência(s)" : "") + ". Ctrl+Z desfaz." : "O editor recusou a ligação do ambiente.");
      U._redesenhar();
      return U.ultimo;
    },
    /* kits dos aparelhos que já estavam no modelo (projeto aberto antes do kit automático) */
    gerarKits: function () {
      var K = dep("HidKit"), c = U._ctx(); if (!K || !c) return null;
      var ks = K.kitsDoModelo(c.ops), novos = arr(c.estado.familias).filter(function (f) { return K.tipoDaFamilia(f.famId, f.tipoId) && !(ks[f.id] && ks[f.id].vivos.length); }).map(function (f) { return String(f.id); });
      var acoes = K.reconciliar({ estado: c.estado, avaliarFam: c.avaliarFam, ops: c.ops, novos: novos, vizinhos: U._vizinhos(c.estado) }).filter(function (a) { return a.acao === "gerar"; });
      if (!acoes.length) { U.ultimo = { ok: true, resumo: { kits: [], removidos: [], ambientes: [] }, nada: true }; U._redesenhar(); return U.ultimo; }
      return U._aplicarAcoes(c, acoes);
    },
    /* grava um lote dos botões (não encadeia o Ctrl+Z com a op anterior) */
    _gravar: function (c, ops, prefixo) {
      if (!ops.length) return false;
      U._ocupado = true; var ok = false;
      try { ok = c.b.editarLote({ op: "lote", id: prefixo + "-" + String(new Date().getTime()), origem: "hidkit", ops: JSON.parse(JSON.stringify(ops)) }); } finally { U._ocupado = false; }
      var c2 = U._ctx(); if (c2) { U._len = c2.ops.length; U._vistos = arr(c2.estado.familias).map(function (f) { return String(f.id); }); U._lote = { len: U._len, encadear: false }; }
      return ok;
    },
    /* religa os ambientes já ligados + refaz as redes (mudou o modo do baldrame, mudou a linha) — um lote */
    _religarTudo: function (c, opsIni) {
      var A = dep("HidAmbiente"), K = dep("HidKit"), BE = dep("BimEdit"), ops = opsIni.slice(), ambs = [], vistos = {}, res = [];
      var lista = K.achatar(c.ops.concat(ops));
      lista.forEach(function (o) { if (o.ambInfo && !vistos[o.ambInfo.id]) { vistos[o.ambInfo.id] = 1; ambs.push(o.ambInfo); } });
      var todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops }]), est = BE.aplicar(todos);
      ambs.forEach(function (ai) {
        var seed = arr(ai.aparelhos).filter(function (x) { return arr(est.familias).some(function (f) { return String(f.id) === x; }); })[0]; if (!seed) return;
        var R = A.ligar({ estado: est, avaliarFam: c.avaliarFam, ops: todos, famInst: seed, parametros: U.parametros() });
        if (R.ops.length) { U._marcar(R); R.ops.forEach(function (o) { ops.push(o); }); todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops }]); est = BE.aplicar(todos); }
        res.push(R);
      });
      var RR = U._redes(c.ops, est, c.avaliarFam, ops); RR.ops.forEach(function (o) { ops.push(o); });
      return { ops: ops, ambientes: res, redes: RR.resultados };
    },
    /* LINHA DA REDE: os pontos dados (de montante para a saída) — ou o traço de esgoto selecionado no 3D/planta */
    criarRede: function (pontos, opcoes) {
      var c = U._ctx(); if (!c || !arr(pontos).length) return null;
      opcoes = opcoes || {};
      var id = opcoes.id || ("rede" + (arr(c.estado.hidRedes).length + 1)), op = { op: "hidRede", id: id, pontos: pontos.map(function (p) { return { x: Math.round(p.x * 10000) / 10000, z: Math.round(p.z * 10000) / 10000 }; }), baldrame: U.modoBaldrame };   // hid:ok arredondamento de 4 casas (0,1 mm)
      var ops = arr(opcoes.antes).concat([op]), r = U._religarTudo(c, ops);
      var ok = U._gravar(c, r.ops, "hidrede");
      U.ultimo = { ok: ok, resumo: { kits: [], removidos: [], ambientes: r.ambientes, redes: r.redes }, quando: new Date().getTime() };
      var Rr = r.redes.filter(function (x) { return x.ok; })[0];
      status(ok ? "Linha da rede: " + (Rr ? Rr.caixas.length + " caixa(s) de inspeção, " + Rr.ramais.length + " ramal(is), coletor DN " + ((Rr.coletor[0] || {}).dn || "-") + (Rr.interferencias.length ? ", " + Rr.interferencias.length + " furo(s) em viga" : "") : "sem esperas") + ". Ctrl+Z desfaz." : "O editor recusou a linha da rede.");
      U._redesenhar();
      return U.ultimo;
    },
    usarSelecaoComoLinha: function () {
      var c = U._ctx(); if (!c || !c.b.selecao) return null;
      var sel = arr(c.b.selecao().uids).map(function (u) { return String(u).replace(/^edit:/, ""); });
      /* o traço DESENHADO (sem marca de kit/ambiente/rede); clicar num pedaço leva a polilinha inteira que encosta nele
         (no 3D o clique seleciona UMA peça de instalação) */
      var TOL0 = (global.BimInst || {}).TOL || 0.02, gerado = {};   // hid:ok mesma tolerância de encontro do js/biminst.js (TOL)
      dep("HidKit").achatar(c.ops).forEach(function (o) { if (o && o.id != null && (o.kit != null || o.amb != null || o.rede != null)) gerado[o.id] = 1; });
      var livres = arr(c.estado.instalacoes && c.estado.instalacoes.trechos).filter(function (t) { return t.sistema === "esgoto" && !gerado[t.id]; });
      var trs = livres.filter(function (t) { return sel.indexOf(String(t.id)) >= 0; }), cresceu = trs.length > 0;
      while (cresceu) {
        cresceu = false;
        livres.forEach(function (u) { if (trs.indexOf(u) < 0 && trs.some(function (t) { return d2(u.p1, t.p1) <= TOL0 || d2(u.p1, t.p2) <= TOL0 || d2(u.p2, t.p1) <= TOL0 || d2(u.p2, t.p2) <= TOL0; })) { trs.push(u); cresceu = true; } });
      }
      if (!trs.length) { U.ultimo = { ok: false, erro: "Selecione o traço de esgoto que marca o eixo da rede (desenhe com a ferramenta Tubo, no sentido da saída)." }; U._redesenhar(); return U.ultimo; }
      /* encadeia pelos encontros, no sentido do traço (p1 -> p2 = para a saída) */
      var TOL = (global.BimInst || {}).TOL || 0.02, usado = {}, ini = trs.filter(function (t) { return !trs.some(function (u) { return u !== t && d2(u.p2, t.p1) <= TOL; }); })[0] || trs[0], pts = [{ x: ini.p1.x, z: ini.p1.z }], at = ini;   // hid:ok tolerância de nó do biminst (reserva)
      while (at && !usado[at.id]) { usado[at.id] = 1; pts.push({ x: at.p2.x, z: at.p2.z }); var fim = at.p2; at = trs.filter(function (u) { return !usado[u.id] && d2(u.p1, fim) <= TOL; })[0]; }
      return U.criarRede(pts, { antes: trs.map(function (t) { return { op: "apagar", id: t.id }; }) });
    },
    /* REPLICAR UNIDADE (etapa 3, js/hidpredio.js): os aparelhos do piso mais baixo → os pavimentos com paredes acima; com a
       PAREDE DIVISÓRIA selecionada, espelha a vizinha pelo eixo dela. Prumadas no shaft, kits, ligações e a rede — um lote */
    replicarUnidade: function (opcoes) {
      opcoes = opcoes || {};
      var c = U._ctx(), K = dep("HidKit"), HP = dep("HidPredio"), BE = dep("BimEdit"); if (!c || !K || !HP || !BE) return null;
      var est = c.estado, sel = c.b.selecao ? arr(c.b.selecao().uids).map(function (x) { return String(x).replace(/^edit:/, ""); }) : [];
      var parede = arr(est.caixas).filter(function (x) { return x && x.tipo === "parede" && sel.indexOf(String(x.id)) >= 0; })[0], eixo = opcoes.eixo || null;
      if (!eixo && parede) { var cs = Math.cos(parede.rotY || 0), sn = Math.sin(parede.rotY || 0), h = (parede.comprimento || 0) / 2; eixo = { p1: { x: parede.cx - h * cs, z: parede.cz + h * sn }, p2: { x: parede.cx + h * cs, z: parede.cz - h * sn } }; }
      /* a unidade: aparelhos sanitários (sem as peças de kit nem as cópias) do piso mais baixo; com eixo, os do lado com mais aparelhos */
      var fora = {}; K.achatar(c.ops).forEach(function (o) { if (o && o.op === "familia" && (o.kit != null || o.predio != null)) fora[String(o.id)] = 1; });
      var fams = arr(est.familias).filter(function (f) { return !fora[String(f.id)] && K.tipoDaFamilia(f.famId, f.tipoId); });
      var pisos = fams.map(function (f) { var P = K._int.pisoDe(est, c.avaliarFam, f, null); return P.ok ? P.y : null; });
      var yMin = null; pisos.forEach(function (y) { if (y != null && (yMin == null || y < yMin)) yMin = y; });
      var unidade = fams.filter(function (f, i) { return pisos[i] != null && Math.abs(pisos[i] - yMin) <= HP.GEO_PREDIO.tolNivel; });
      if (eixo && unidade.length) {
        var lado = function (f) { return (eixo.p2.x - eixo.p1.x) * (f.z - eixo.p1.z) - (eixo.p2.z - eixo.p1.z) * (f.x - eixo.p1.x) > 0 ? 1 : -1; };
        var soma = 0; unidade.forEach(function (f) { soma += lado(f); }); var sg = soma >= 0 ? 1 : -1;
        unidade = unidade.filter(function (f) { return lado(f) === sg; });
      }
      if (!unidade.length) { U.ultimo = { ok: false, erro: "Coloque os aparelhos da unidade (o apartamento) no pavimento mais baixo antes de replicar." }; U._redesenhar(); return U.ultimo; }
      status("Replicando a unidade (" + unidade.length + " aparelho(s))" + (eixo ? " com espelho" : "") + "…");
      var R = HP.replicar({ estado: est, avaliarFam: c.avaliarFam, ops: c.ops, unidade: unidade.map(function (f) { return String(f.id); }), eixo: eixo, parametros: U.parametros(), id: opcoes.id || "predio1" });
      if (!R.ok) { U.ultimo = { ok: false, erro: "Replicar unidade: " + (R.pendencias.map(function (p) { return p.motivo; }).join(" · ") || "nada a replicar"), resumo: { kits: [], removidos: [], ambientes: [], predio: R } }; U._redesenhar(); return U.ultimo; }
      var o1 = R.ops.filter(function (o) { return o.op !== "apagar" && o.op !== "desanotar"; })[0];
      if (o1) o1.predioInfo = { id: R.id, decisoes: R.decisoes, pendencias: R.pendencias.map(function (p) { return { chave: p.chave, motivo: p.motivo }; }), unidades: R.unidades.length, prumadas: R.prumadas.length };
      var ops = R.ops.slice(), est2 = BE.aplicar(c.ops.concat([{ op: "lote", id: "previa", ops: ops }]));
      var RR = U._redes(c.ops, est2, c.avaliarFam, ops); RR.ops.forEach(function (o) { ops.push(o); });
      var ok = U._gravar(c, ops, "hidpredio");
      U.ultimo = { ok: ok, resumo: { kits: [], removidos: [], ambientes: [], redes: RR.resultados, predio: R }, quando: new Date().getTime() };
      status(ok ? "Unidade replicada: " + (R.unidades.length - 1) + " unidade(s) nova(s), " + R.prumadas.length + " shaft(s) com tubo de queda, coluna de ventilação e coluna de água fria. Ctrl+Z desfaz." : "O editor recusou a replicação.");
      U._redesenhar();
      return U.ultimo;
    },
    refazerRede: function () { var c = U._ctx(); if (!c) return null; var r = U._religarTudo(c, []), ok = U._gravar(c, r.ops, "hidrede"); U.ultimo = { ok: ok, resumo: { kits: [], removidos: [], ambientes: r.ambientes, redes: r.redes } }; U._redesenhar(); return U.ultimo; },
    definirBaldrame: function (modo) {
      if (modo !== "por_baixo" && modo !== "atravessar") return null;
      U.modoBaldrame = modo; lsGravar(LSB, modo);
      var c = U._ctx(); if (!c) return null;
      var ops = arr(c.estado.hidRedes).map(function (r) { var o = { op: "hidRede", id: r.id, pontos: r.pontos, baldrame: modo }; if (r.cotaTerreno != null) o.cotaTerreno = r.cotaTerreno; return o; });
      var r = U._religarTudo(c, ops), ok = U._gravar(c, r.ops, "hidbald");
      U.ultimo = { ok: ok, resumo: { kits: [], removidos: [], ambientes: r.ambientes, redes: r.redes } };
      status("Viga baldrame: " + (modo === "por_baixo" ? "o tubo passa por baixo (padrão)" : "o tubo atravessa com tubo-camisa; furos marcados para o estrutural") + ".");
      U._redesenhar();
      return U.ultimo;
    },
    /* campos do bloco (o parâmetro do baldrame sem modelo estrutural) */
    campo: function (n, v) {
      if (n === "kit:piso:acabado") { var xa = parseFloat(String(v).replace(",", ".")); U.pisoAcabado = isFinite(xa) ? xa : null; lsGravar(LSB + ":pisoAcabado", U.pisoAcabado == null ? "" : String(U.pisoAcabado)); var HNc = dep("HidNivel"); if (HNc) HNc.parametros = U.parametros(); return true; }
      if (n === "kit:vent:altura") { var xv = parseFloat(String(v).replace(",", ".")); U.alturaVent = isFinite(xv) && xv > 0 ? xv : null; lsGravar(LSB + ":alturaVent", U.alturaVent == null ? "" : String(U.alturaVent)); return true; }
      var m = /^kit:bald:(altura|largura|topo)$/.exec(n); if (!m) return false;
      var p = U.baldrameParam || {}, x = parseFloat(String(v).replace(",", "."));
      if (isFinite(x)) p[m[1]] = x; else delete p[m[1]];
      U.baldrameParam = Object.keys(p).length ? p : null; lsGravar(LSB + ":param", JSON.stringify(U.baldrameParam));
      return true;
    },
    alternar: function (on) { U.ligado = !!on; try { localStorage.setItem(LS, on ? "1" : "0"); } catch (e) {} U._redesenhar(); },

    /* =========================================================================================================
     * TRAÇAR AUTOMATICAMENTE (18/10/2026). Pergunta do Rogério: "Já coloquei no ambiente a caixa sifonada, o vaso, o
     * lavatório e o chuveiro. Como faço para ele gerar os traços e colocar as tubulações automaticamente?"
     * Um botão (Instalações, aba Modificar | Aparelhos, botão direito no ambiente, atalho TA) faz o caminho inteiro:
     *  (a) o kit de cada aparelho que ainda não tem (quem modelou à mão, com o kit automático desligado);
     *  (b) REAPROVEITA o que o usuário já pôs: a caixa sifonada do cômodo (HidAmbiente) e o ralo/caixa do box (HidKit);
     *  (c) liga cada ambiente (caixa sifonada, ventilação, ramal DN 100, água pela parede) — mesmo com UM aparelho só;
     *  (d) com linha da rede, liga a ela; sem linha, deixa a espera e avisa.
     * Antes de gravar: PRÉVIA translúcida + resumo (tubos, conexões, DN, avisos), Tab alterna a opção do traçado,
     * Aplicar grava UM lote (um Ctrl+Z desfaz tudo). O motor é o mesmo do kit e do "Ligar ambiente" — nada novo de cálculo.
     * ========================================================================================================= */
    _aparelhosDe: function (c) {
      var K = dep("HidKit"), parte = {};
      K.achatar(c.ops).forEach(function (o) { if (o && o.op === "familia" && (o.kit != null || o.predio != null)) parte[String(o.id)] = 1; });
      return arr(c.estado.familias).filter(function (f) { return !parte[String(f.id)] && K.tipoDaFamilia(f.famId, f.tipoId); });
    },
    _nomeAp: function (f) { var K = dep("HidKit"), t = f ? K.tipoDaFamilia(f.famId, f.tipoId) : null, k = t ? (K.kits()[t] || {}) : {}; return (k.nome ? String(k.nome).toLowerCase() : "aparelho") + " " + (f ? f.id : ""); },
    /* o que traçar: ambiente(s) selecionado(s) → os aparelhos dentro; aparelho(s) selecionado(s) → eles (e o cômodo de
       cada um); peça de esgoto (a caixa sifonada) selecionada → o cômodo dela; nada → todos (a tela pergunta antes) */
    escopo: function (c, uids) {
      var K = dep("HidKit"), est = c.estado, aps = U._aparelhosDe(c), ids = arr(uids).map(function (u) { return String(u).replace(/^edit:/, ""); });
      var out = { tipo: "todos", aparelhos: [], ambientes: [], erro: null };
      if (!aps.length) { out.erro = "Nenhum aparelho sanitário no modelo: coloque a bacia, o lavatório e o chuveiro (Instalações › Aparelho) e clique de novo."; return out; }
      if (!ids.length) { out.aparelhos = aps.map(function (f) { return String(f.id); }); return out; }
      var ambs = arr(est.ambientes).filter(function (a) { return a && ids.indexOf(String(a.id)) >= 0; });
      var sel = aps.filter(function (f) { return ids.indexOf(String(f.id)) >= 0; });
      /* a peça de esgoto selecionada (caixa sifonada, ralo) → os aparelhos do cômodo dela (o ambiente do BIM, ou os vizinhos) */
      arr(est.instalacoes && est.instalacoes.pecas).forEach(function (k) {
        if (ids.indexOf(String(k.id)) < 0 || k.sistema !== "esgoto") return;
        var a = K._int.ambienteDe(est, k);
        if (a) { if (ambs.indexOf(a) < 0) ambs.push(a); }
        else aps.forEach(function (f) { if (sel.indexOf(f) < 0 && d2(f, k) <= K.GEO_KIT.raioAmbiente) sel.push(f); });
      });
      if (ambs.length) {
        out.tipo = "ambiente"; out.ambientes = ambs.map(function (a) { return String(a.id); });
        aps.forEach(function (f) { var a = K._int.ambienteDe(est, f); if (a && ambs.indexOf(a) >= 0 && sel.indexOf(f) < 0) sel.push(f); });
        if (!sel.length) { out.erro = "O ambiente selecionado não tem aparelho sanitário: coloque a bacia, o lavatório e o chuveiro dentro dele."; return out; }
      } else if (sel.length) out.tipo = "aparelhos";
      else { out.erro = "A seleção não tem aparelho sanitário nem ambiente: clique no ambiente (ou nos aparelhos) e use Traçar automaticamente — ou limpe a seleção (Esc) para traçar todos."; return out; }
      out.aparelhos = sel.map(function (f) { return String(f.id); });
      return out;
    },
    /* o PLANO (puro sobre o editor: nada é gravado) — { ok, ops, resumo, avisos[], pendencias[], opcoes, indice, escopo } */
    planejar: function (opcoes) {
      opcoes = opcoes || {};
      var K = dep("HidKit"), A = dep("HidAmbiente"), BE = dep("BimEdit"), BIi = dep("BimInst"), c = U._ctx();
      if (!K || !A || !BE || !BIi || !c) return { ok: false, erro: "Os motores do projeto inteligente não carregaram (HidKit, HidAmbiente, BimEdit)." };
      var uids = opcoes.uids != null ? opcoes.uids : (c.b.selecao ? arr(c.b.selecao().uids) : []);
      var esc0 = U.escopo(c, uids), pisc = U._piscinas(c, uids);
      /* PISCINA NO MESMO CLIQUE (frente C, 19/10/2026 — pedido do Rogério: "a piscina também tem que gerar o projeto num
         clique"): a piscina do modelo (a op hidPiscina, ou o volume "Piscina" ainda não reconhecido) entra no plano. Só com
         piscina, o "Nenhum aparelho sanitário" não barra mais: o plano é o da piscina */
      if (esc0.erro && !pisc.length) return { ok: false, erro: esc0.erro, escopo: esc0 };
      if (esc0.erro) esc0 = { tipo: "piscina", aparelhos: [], ambientes: [], erro: null };
      var est = c.estado, porId = {}; arr(est.familias).forEach(function (f) { porId[String(f.id)] = f; });
      var par = U.parametros(); if (opcoes.opcaoRota != null) par.opcaoRota = opcoes.opcaoRota;
      var avisos = [], pendencias = [], ops = [];
      /* FRENTE H8 (21/10/2026): o BARRILETE anterior (js/hidbarrilete.js) sai no começo do lote — os ambientes e o aquecedor são
         traçados sem ele (a coluna dele não vira "coluna de água fria" do ambiente) e no fim (e3) ele é refeito: Traçar de novo = o mesmo */
      var HBR = dep("HidBarrilete"); if (!HBR && typeof require === "function") { try { HBR = require("./hidbarrilete.js"); } catch (eRb) { HBR = null; } }   /* Node (testes): o motor pelo require */
      if (HBR) HBR.anteriores(K.achatar(c.ops)).forEach(function (idB) { ops.push({ op: "apagar", id: idB }); });
      /* o aparelho fora de um ambiente (o modelo TEM ambientes): liga pelos vizinhos à vista, mas avisa */
      if (arr(est.ambientes).some(function (a) { return a && a.calc && arr(a.calc.contorno).length >= 3; }))   // hid:ok polígono tem 3+ vértices
        esc0.aparelhos.forEach(function (id) { var f = porId[id]; if (f && !K._int.ambienteDe(est, f)) avisos.push({ texto: "O " + U._nomeAp(f) + " está fora de um ambiente: liguei com os aparelhos vizinhos à vista. Desenhe o ambiente (Arquitetura › Ambiente) para garantir o cômodo.", elementos: [id] }); });
      /* o aparelho posto DUAS vezes no mesmo lugar (o print do Rogério, 18/10/2026: duas bacias sobrepostas) — sai do traçado e o
         cartão oferece "Remover a duplicada"; sem isto o tubo da bacia que fica atravessava a cópia e o ambiente saía SEM traçado */
      var dups = A.duplicados ? A.duplicados(U._aparelhosDe(c)) : [], dupDe = {};
      dups.forEach(function (d) { dupDe[d.id] = d; });
      if (dups.length) esc0.aparelhos = esc0.aparelhos.filter(function (id) { return !dupDe[id]; });
      dups.forEach(function (d) { avisos.push({ texto: "Aparelho duplicado: o " + U._nomeAp(porId[d.id]) + " está em cima do " + d.de + " (posto duas vezes). Ficou fora do traçado.", elementos: [d.id, d.de], acao: { tipo: "remover", id: d.id, texto: "Remover a duplicada (" + d.id + ")" } }); });
      /* (a) os kits que faltam */
      var ks = K.kitsDoModelo(c.ops), semKit = esc0.aparelhos.filter(function (id) { return !(ks[id] && ks[id].vivos.length); });
      var acoes = semKit.length ? K.reconciliar({ estado: est, avaliarFam: c.avaliarFam, ops: c.ops, novos: semKit, vizinhos: U._vizinhos(est), parametros: par }).filter(function (a) { return a.acao === "gerar" && semKit.indexOf(a.famInst) >= 0; }) : [];
      var kits = [], reaproveitadas = [];
      acoes.forEach(function (a) {
        a.ops.forEach(function (o) { ops.push(o); });
        kits.push({ famInst: a.famInst, acao: "gerar", kit: a.kit || null });
        if (a.kit && a.kit.raloExistente) reaproveitadas.push({ id: a.kit.raloExistente, papel: "ralo do box de " + a.famInst });
        arr(a.kit && a.kit.pendencias).forEach(function (p) { pendencias.push({ texto: p.motivo || p.texto, elementos: [a.famInst] }); });
      });
      semKit.forEach(function (id) { if (!acoes.some(function (a) { return a.famInst === id; })) avisos.push({ texto: "O " + U._nomeAp(porId[id]) + " ficou sem kit (sem ponto de ligação reconhecido na família).", elementos: [id] }); });
      /* (b)(c) cada cômodo uma vez, na ordem dos aparelhos */
      var todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]), est2 = BE.aplicar(todos), feitos = {}, ambs = [], nOp = 1, iOp = 0;
      /* (b0) A REDE EXTERNA pelo padrão (docs/hidro/PADRAO-IMPLANTACAO-ESGOTO.md — correção do Rogério, 18/10/2026: "caixas de
         passagem, de inspeção, tudo é feito do lado de fora"): sem linha da rede e sem caixa de inspeção do usuário, o eixo do
         coletor sai pelo recuo, paralelo às paredes externas, até a frente — e a rede liga caixa a caixa (js/hidrede.js) */
      var HIm = dep("HidImplantacao"), rAuto = HIm && HIm.redeProposta && esc0.aparelhos.length ? HIm.redeProposta(est2, esc0.aparelhos.map(function (id) { return porId[id]; }).filter(Boolean), { raio: ((BIi.PECAS || {}).caixa_inspecao || {}).r || 0, parametros: par, baldrame: U.modoBaldrame }) : null;
      if (rAuto && rAuto.op) {
        ops.push(rAuto.op); todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]); est2 = BE.aplicar(todos);
        avisos.push({ texto: "Rede externa proposta: " + rAuto.motivo + ". As caixas de inspeção ficam na área externa e a rede liga caixa a caixa até a saída.", elementos: [rAuto.op.id] });
        arr(rAuto.linha && rAuto.linha.pendencias).forEach(function (p) { pendencias.push({ texto: p.motivo, elementos: [rAuto.op.id] }); });
      }
      esc0.aparelhos.forEach(function (seed) {
        var M = A.membros(est2, c.avaliarFam, todos, seed, null); if (!M || feitos[M.id]) return; feitos[M.id] = 1;
        if (opcoes.perguntarManual !== false && U._ambManual(c.ops, M.id) && !U._confirmar("As ligações do ambiente " + M.id + " foram editadas à mão.\n\nRefazer as ligações (a edição manual é substituída)?")) { avisos.push({ texto: "Ambiente " + M.id + ": mantive as ligações editadas à mão.", elementos: [seed] }); return; }
        var R = A.ligar({ estado: est2, avaliarFam: c.avaliarFam, ops: todos, famInst: seed, parametros: par });
        ambs.push(R);
        if (R.rota) { nOp = Math.max(nOp, R.rota.opcoes || 1); iOp = Math.max(iOp, R.rota.indice || 0); }
        if (R.caixaSifonada && R.caixaSifonada.existente) reaproveitadas.push({ id: R.caixaSifonada.id, papel: "caixa sifonada do ambiente " + R.ambiente.id });
        R.pendencias.forEach(function (p) { pendencias.push({ texto: U._textoPend(p), elementos: arr(p.elementos) }); });
        if (R.ops.length) { U._marcar(R); R.ops.forEach(function (o) { ops.push(o); }); todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]); est2 = BE.aplicar(todos); }
      });
      /* (c2) o esgoto foi na caixa de inspeção do usuário: a linha "rede-auto" que o Traçar propôs antes (e já não serve) sai no mesmo lote */
      var velhas = ambs.some(function (R) { return R.caixaInspecaoUsuario; }) ? arr(est2.hidRedes).filter(function (r) { return /^rede-auto/.test(String(r.id)); }) : [];
      if (velhas.length) {
        velhas.forEach(function (r) { ops.push({ op: "apagar", id: r.id }); });
        /* ⚠ (frente A, 19/10/2026) o RAMAL da rede proposta que ia da espera do ambiente até a caixa que agora recebe o ambiente
           direto (rede-auto-r1, -r1v…) ficava no modelo: tubo duplicado ao lado do novo, com a ponta da espera SOLTA (o novo ramal
           já não passa nela). Sai no mesmo lote — a saída da caixa para a rua (-saida) e as caixas ficam */
        var tiraR = {}, cisU = {}; ambs.forEach(function (R) { if (R.caixaInspecaoUsuario) cisU[String(R.caixaInspecaoUsuario)] = 1; });
        var pcsU = arr(est2.instalacoes && est2.instalacoes.pecas).filter(function (k) { return cisU[String(k.id)]; }), capCI = num0(((BIi.PECAS || {}).caixa_inspecao || {}).captura) || 0.3;   // hid:ok captura de reserva da caixa de inspeção (m)
        arr(est2.instalacoes && est2.instalacoes.trechos).forEach(function (t) {
          if (t.sistema !== "esgoto" || !/^rede-auto.*-r\d+[a-z]?$/.test(String(t.id))) return;
          if (pcsU.some(function (k) { return Math.hypot(t.p2.x - k.x, t.p2.z - k.z) <= capCI; })) { ops.push({ op: "apagar", id: t.id }); tiraR[String(t.id)] = 1; }
        });
        /* ⚠ (revisão adversarial, 20/10/2026) e a DESCIDA na espera desse ramal (o id dele + "v", js/hidrede.js — baldrame por baixo ou a
           caixa funda): ficava no modelo, órfã, com as duas pontas soltas, e o cartão do Traçar não dizia Pronto */
        arr(est2.instalacoes && est2.instalacoes.trechos).forEach(function (t) { var idT = String(t.id); if (t.sistema === "esgoto" && !tiraR[idT] && /v$/.test(idT) && tiraR[idT.slice(0, -1)]) ops.push({ op: "apagar", id: idT }); });
        todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]); est2 = BE.aplicar(todos);
        avisos.push({ texto: "O esgoto foi para a caixa de inspeção que você pôs: tirei a linha da rede proposta antes (" + velhas.map(function (r) { return r.id; }).join(", ") + ").", elementos: velhas.map(function (r) { return r.id; }) });
      }
      /* (d) a linha da rede: com ela, o ambiente entra no coletor (mesmo lote); sem ela, a espera fica e o aviso diz o que fazer */
      var redes = [], espera = ambs.some(function (R) { return R.decisoes.some(function (d) { return d.id === "amb.espera_esgoto"; }); });
      if (arr(est2.hidRedes).length && ambs.some(function (R) { return R.ops.length; })) { var RR = U._redes(c.ops, est2, c.avaliarFam, ops); RR.ops.forEach(function (o) { ops.push(o); }); redes = RR.resultados; }
      else if (espera) avisos.push({ texto: "Sem linha da rede: o esgoto ficou em ESPERA fora da obra. Desenhe a linha da rede para levar até a caixa de inspeção (Tubo de esgoto no sentido da saída → \"Usar o traço selecionado como linha da rede\").", elementos: [], acao: "rede" });
      /* (e) FRENTE B (19/10/2026, D-04): a espera de água de um kit ANTIGO (antes de 19/10) estava desenhada contra a água — a ponta
         aberta em p2. No mesmo lote ela é redesenhada no sentido do fluxo (p1 = ponta aberta), com as marcas do kit (não refaz o kit
         nem perde o que a pessoa ajustou nele). Trecho já dividido por acessório fica como está. */
      if (ops.length) {
        var ultOp = {}, comAc = {};
        K.achatar(c.ops.concat(ops)).forEach(function (o) { if (!o || o.id == null) return; ultOp[o.id] = o; if (o.op === "acessorio" && o.trecho != null) comAc[o.trecho] = 1; });
        Object.keys(ultOp).forEach(function (id) {
          var o = ultOp[id];
          if (o.op !== "trecho" || o.sistema !== "agua_fria" || o.kit == null || esc0.aparelhos.indexOf(String(o.kit)) < 0 || o.continua !== "p2" || comAc[id]) return;
          if (o.kitParte !== "chuveiro" && o.kitParte !== "espera") return;
          var n = JSON.parse(JSON.stringify(o)), q = n.p1; n.p1 = n.p2; n.p2 = q; n.continua = "p1"; ops.push(n);
        });
      }
      /* (e2) FRENTE H5 (21/10/2026): a ÁGUA QUENTE (js/hidaqtraco.js) — com aquecedor no modelo, a alimentação de água fria dele
         (com registro), a saída até a distribuição no entreforro e a descida embutida até cada ponto de água quente do escopo (com
         registro, volante para dentro do cômodo). O traçado anterior do mesmo aquecedor sai no mesmo lote (Traçar de novo = o mesmo) */
      var HAQ = dep("HidAQTraco"); if (!HAQ && typeof require === "function") { try { HAQ = require("./hidaqtraco.js"); } catch (eRq) { HAQ = null; } }   /* Node (testes): o motor pelo require */
      if (HAQ) {
        try {
          var velhasAQ = HAQ.anteriores(K.achatar(c.ops));
          velhasAQ.forEach(function (id) { ops.push({ op: "apagar", id: id }); });
          var estAQ = BE.aplicar(c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]));
          var RAQ = HAQ.tracar({ estado: estAQ, avaliarFam: c.avaliarFam, ops: c.ops.concat(ops), escopo: esc0.aparelhos, parametros: par });
          /* FRENTE H6: as DECISÕES da água quente (coluna central, válvula do boiler, conferência hidráulica, diâmetro da chaminé) vão na
             1ª peça do lote, como a do ambiente/prédio — o memorial lê (HidKitUI.decisoes); antes elas se perdiam aqui */
          var idsAq = []; RAQ.ops.forEach(function (o) { if (o.aq != null && idsAq.indexOf(String(o.aq)) < 0) idsAq.push(String(o.aq)); });
          if (RAQ.ops.length && arr(RAQ.decisoes).length) RAQ.ops[0].aqInfo = { id: "aq:" + idsAq.join(","), aquecedores: idsAq, decisoes: RAQ.decisoes, pendencias: RAQ.pendencias.map(function (p) { return { chave: p.chave, motivo: p.texto }; }) };
          RAQ.ops.forEach(function (o) { ops.push(o); });
          RAQ.pendencias.forEach(function (p) { pendencias.push(p); });
          RAQ.avisos.forEach(function (a) { avisos.push(a); });
          if (RAQ.ligados) avisos.push({ texto: "Água quente: " + RAQ.ligados + " ponto(s) ligado(s) ao aquecedor (alimentação de água fria com registro, distribuição no entreforro, descida embutida com registro em cada ponto).", elementos: [] });
        } catch (eAQ0) { pendencias.push({ chave: "ta.agua_quente", texto: "Água quente: o traçado falhou (" + (eAQ0 && eAQ0.message ? eAQ0.message : eAQ0) + "); trace à mão", elementos: [] }); }
      }
      /* (e3) FRENTE H8 (21/10/2026): o BARRILETE a partir da caixa d'água (js/hidbarrilete.js) — pedido do Rogério: "colocar uma caixa
         d'água próximo de algum ambiente, ele monta o barrilete e desce as tubulações para cada ambiente". As esperas de água fria
         que os ambientes, o aquecedor e o prédio deixaram passam a ser LIGADAS (saída com registro, ventilação, barrilete, colunas
         com registro, extravasor, limpeza, boia); a pressão é conferida (NBR 5626, o mesmo cálculo do dimensionamento) e, sem caixa
         no modelo, a oferta de pôr uma (Corrigir) */
      if (HBR) {
        try {
          var todosB = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]);
          var RB = HBR.montar({ estado: BE.aplicar(todosB), avaliarFam: c.avaliarFam, ops: todosB, parametros: par, pressao: true, oferta: true, programa: U._programa() });
          RB.ops.forEach(function (o) { ops.push(o); });
          RB.pendencias.forEach(function (p) { pendencias.push(p); });
          RB.avisos.forEach(function (a) { avisos.push(a); });
          /* o respiro do boiler modelado aqui fecha a pendência da H6 (ta.boiler_respiro) daquele aquecedor */
          if (RB.respiros.length) pendencias = pendencias.filter(function (p) { return !(p.chave === "ta.boiler_respiro" && arr(p.elementos).some(function (x) { return RB.respiros.indexOf(String(x)) >= 0; })); });
          if (RB.ligadas) avisos.push({ texto: "Barrilete: " + RB.ligadas + " espera(s) de água fria ligada(s) à caixa d'água " + RB.caixas.filter(function (x) { return x.ligadas; }).map(function (x) { return x.id; }).join(", ") + " (saída com registro, ventilação, colunas com registro, extravasor, limpeza e boia). " + arr(RB.decisoes).map(function (d) { return d.texto; }).join(" "), elementos: RB.caixas.map(function (x) { return x.id; }) });
        } catch (eB) { pendencias.push({ chave: "ta.barrilete", texto: "Barrilete: o traçado falhou (" + (eB && eB.message ? eB.message : eB) + "); ligue à mão", elementos: [] }); }
      }
      /* (f) a PISCINA: o lançamento completo do js/hidpiscinarede.js (casa de máquinas, dispositivos, sucção, retorno, descarte
         na caixa receptora, drenagem da casa, reposição com descarga livre) no MESMO lote — depois da casa, para a vala
         desviar dos tubos já traçados */
      var piscinas = U._lancarPiscinas(c, pisc, ops, avisos, pendencias);
      if (!ops.length) return { ok: false, erro: ambs.length && pendencias.length ? "Não consegui traçar: " + pendencias.map(function (p) { return p.texto; }).slice(0, 3).join(" · ") : "Nada a traçar: os aparelhos selecionados já estão ligados.", escopo: esc0, pendencias: pendencias, avisos: avisos };   // hid:ok até 3 motivos na mensagem
      var resumo = U._resumo(c, ops);
      /* ⚠ 0 tubo = NADA foi ligado (ao vivo, 18/10/2026: o cartão dizia "Tudo ligado" com 0 tubo): a prévia não abre como
         sucesso — diz o que não ligou e por quê (as estratégias descartadas e as pendências) */
      if (!resumo.tubos) {
        var porque = pendencias.map(function (p) { return p.texto; }).concat(ambs.reduce(function (l, R) { return l.concat(arr(R.descartadas).map(function (d) { return d.nome + ": " + d.motivo; })); }, []));
        return { ok: false, erro: "Nenhum tubo foi traçado: " + (porque.slice(0, 3).join(" · ") || "nenhuma estratégia de traçado fechou") + ". Confira o que está no caminho (louça, peça, parede) e trace de novo.", escopo: esc0, pendencias: pendencias, avisos: avisos };   // hid:ok até 3 motivos
      }
      resumo.kits = kits.length; resumo.ambientes = ambs.filter(function (R) { return R.ops.length; }).length; resumo.reaproveitadas = reaproveitadas;
      resumo.caixasNovas = ambs.filter(function (R) { return R.caixaSifonada && !R.caixaSifonada.existente; }).map(function (R) { return R.caixaSifonada.id; });
      resumo.pontasNovas.forEach(function (t) { avisos.push({ texto: "Ponta solta: " + t, elementos: [] }); });
      /* CRITÉRIO DE PROJETISTA (js/hidcriterios.js): o auditor sobre a prévia — só o que é do lote novo (escopo) */
      var HCr = global.HidCriterios, crit = null;
      if (HCr) { try { crit = HCr.auditar(HCr.doEstado(BE.aplicar(c.ops.concat([{ op: "lote", id: "previa", ops: ops }])), c.avaliarFam, { escopo: resumo.ids })); } catch (eC) { crit = null; } }
      ambs.forEach(function (R) { arr(R.avisos).forEach(function (a) { if (!/SINAPI|adaptadores|orce à parte|DUPLICADO/i.test(a.texto)) avisos.push({ texto: "Ambiente " + R.ambiente.id + ": " + a.texto, elementos: arr(a.elementos) }); }); });
      resumo.piscinas = piscinas.length;
      /* ⚠ REVISÃO H4 (21/10/2026): ÁGUA QUENTE — a REDE DE SEGURANÇA depois do traçado da H5 (e2): o ponto de AQ que ficou sem tubo. Com o aquecedor no modelo, os
         pontos de AQ das 2 cubas da bancada (e de qualquer aparelho) ficavam SEM TUBO sem pendência nenhuma — e o auditor, que só
         olhava a AQ quando já havia tubo de AQ, dava verde. Agora: fonte de AQ no modelo (equipamento com saída de água quente) +
         ponto de AQ do escopo sem tubo depois do lote = pendência com os pontos, para a pessoa traçar à mão */
      var HFm = dep("HidFamilias"), temFonteAQ = !!HFm && arr(est.familias).some(function (f) { var F = HFm.porId(f.famId); return !!F && F.categoria === "equipamento" && arr(F.sistemas).indexOf("agua_quente") >= 0; });
      if (temFonteAQ) {
        try {
          var noEsc = {}; esc0.aparelhos.forEach(function (id) { noEsc[String(id)] = 1; });
          var semAQ = arr(BIi.rede(BE.aplicar(c.ops.concat([{ op: "lote", id: "previa-aq", ops: ops }])), c.avaliarFam).conectoresLivres).filter(function (k) { return k.sistema === "agua_quente" && noEsc[String(k.famInst)]; });
          var elsAQ = []; semAQ.forEach(function (k) { if (elsAQ.indexOf(String(k.famInst)) < 0) elsAQ.push(String(k.famInst)); });
          if (semAQ.length && !pendencias.some(function (p) { return p.chave === "ta.agua_quente"; })) pendencias.push({ chave: "ta.agua_quente", texto: "Água quente: " + semAQ.length + " ponto(s) de água quente ficaram sem tubo até o aquecedor (" + semAQ.map(function (k) { return k.famInst + ":" + k.id; }).join(", ") + "); trace à mão", elementos: elsAQ });
        } catch (eAQ) { pendencias.push({ chave: "ta.agua_quente", texto: "Água quente: não consegui conferir os pontos de água quente (" + (eAQ && eAQ.message ? eAQ.message : eAQ) + "); confira à mão", elementos: [] }); }
      }
      return { ok: true, ops: ops, resumo: resumo, avisos: avisos, pendencias: pendencias, criterios: crit, opcoes: nOp, indice: Math.min(iOp, nOp - 1), escopo: esc0, ambientes: ambs, redes: redes, kits: kits, piscinas: piscinas, opsNaProposta: c.ops.length };
    },
    /* as piscinas do escopo: sem seleção, todas (as já reconhecidas e os volumes "Piscina" ainda sem op — a op nasce no lote);
       com seleção, só a selecionada (a op, a casa de máquinas dela ou o volume) */
    _piscinas: function (c, uids) {
      var HP = dep("HidPiscina"), HPR = dep("HidPiscinaRede"), est = c.estado, out = []; if (!HP || !HPR) return out;
      var ids = arr(uids).map(function (u) { return String(u).replace(/^edit:/, ""); }), todos = !ids.length;
      var UI = dep("HidPiscinaUI"), par = UI && UI.params ? JSON.parse(JSON.stringify(UI.params)) : null;
      arr(est.hidPiscinas).forEach(function (p) {
        if (todos || ids.indexOf(String(p.id)) >= 0 || ids.indexOf(String(p.id) + "-cm") >= 0 || (p.ref && ids.indexOf(String(p.ref.id)) >= 0)) out.push({ id: String(p.id), op: par ? { op: "hidPiscina", id: p.id, params: par } : null, nova: false });
      });
      var rec = null; try { rec = HP.reconhecer(est, { elementosIfc: UI && UI._elementosIfc ? UI._elementosIfc() : [] }); } catch (e) { rec = null; }
      var n = arr(est.hidPiscinas).length;
      arr(rec && rec.candidatos).forEach(function (cd) {
        if (!cd || !cd.ref || !(todos || ids.indexOf(String(cd.ref.id)) >= 0)) return;
        /* ⚠ revisor 19/10/2026: só o VOLUME com nome de piscina (confiança alta) entra sozinho no clique — recorte, IFC e
           parede/laje com "piscina" no nome (ex.: "Parede da piscina") pedem a confirmação no bloco Piscina; senão o TA da casa
           lançava uma piscina na planta de uma parede */
        if (cd.origem !== "volume" || cd.confianca !== "alta") return;
        if (arr(est.hidPiscinas).some(function (p) { return p.ref && String(p.ref.id) === String(cd.ref.id); })) return;
        var pid = "pisc" + (++n);
        out.push({ id: pid, op: { op: "hidPiscina", id: pid, nome: cd.nome || "Piscina", ref: cd.ref, params: par || {} }, nova: true });
      });
      return out;
    },
    /* lança cada piscina sobre o plano (puro: devolve o que entra no lote) */
    _lancarPiscinas: function (c, pisc, ops, avisos, pendencias) {
      var HPR = dep("HidPiscinaRede"), BE = dep("BimEdit"), out = []; if (!HPR || !BE) return out;
      pisc.forEach(function (p) {
        var antes = p.op ? [p.op] : [], todosP = c.ops.concat([{ op: "lote", id: "previa", ops: ops.concat(antes) }]), R = null;
        try { R = HPR.gerar({ estado: BE.aplicar(todosP), avaliarFam: c.avaliarFam, ops: todosP, piscina: p.id }); } catch (e) { R = { ok: false, pendencias: [{ motivo: "erro no lançamento: " + (e && e.message ? e.message : e) }] }; }
        if (!R || !R.ok) { pendencias.push({ texto: "Piscina " + p.id + ": " + ((arr(R && R.pendencias)[0] || {}).motivo || "não foi possível lançar"), elementos: [p.id] }); return; }
        antes.forEach(function (o) { ops.push(o); });
        R.ops.forEach(function (o) { ops.push(o); });
        var o1 = R.ops.filter(function (o) { return o.op === "familia" && /-cm$/.test(o.id); })[0];
        if (o1) o1.piscInfo = { id: p.id, cm: { x: o1.x, z: o1.z }, status: R.dim && R.dim.status, avisos: R.avisos.length, pendencias: R.pendencias.length };
        arr(R.avisos).forEach(function (a) { avisos.push({ texto: "Piscina " + p.id + ": " + a.texto, elementos: [p.id + "-cm"] }); });
        arr(R.pendencias).forEach(function (q) { pendencias.push({ texto: "Piscina " + p.id + ": " + (q.motivo || q.texto), elementos: [p.id] }); });
        out.push({ id: p.id, nova: p.nova, rede: R, cm: o1 ? { x: o1.x, z: o1.z } : null });
      });
      return out;
    },
    /* a pendência do motor em palavra de obra (o que falta e onde mexer) */
    _textoPend: function (p) {
      var m = String(p.motivo || p.texto || "");
      if (p.chave === "amb.agua") return "Não há parede para embutir a água atrás dos pontos: desenhe a parede (ou ponha a coluna de água fria) e trace de novo.";
      if (p.chave === "amb.piso") return "Não achei o piso do aparelho: " + m;
      if (p.chave === "amb.tubo_queda") return "Ambiente fora do térreo sem tubo de queda perto: ponha o tubo de queda no shaft (ou use Replicar unidade).";
      return m;
    },
    /* o resumo do que o lote põe no modelo: tubos (m), conexões, DN por sistema, pontas soltas novas */
    _resumo: function (c, ops) {
      var BE = dep("BimEdit"), BIi = dep("BimInst"), fim = BE.aplicar(c.ops.concat([{ op: "lote", id: "previa", ops: ops }])), ids = {};
      ops.forEach(function (o) { if (o && o.id != null && o.op !== "apagar" && o.op !== "desanotar") { ids[String(o.id)] = 1; if (o.novoId != null) ids[String(o.novoId)] = 1; } });
      var trs = arr(fim.instalacoes && fim.instalacoes.trechos).filter(function (t) { return ids[String(t.id)]; }), dns = {}, metros = 0;
      trs.forEach(function (t) { metros += num0(t.comprimento); var l = dns[t.sistema] || (dns[t.sistema] = []); if (l.indexOf(t.dn) < 0) l.push(t.dn); });
      Object.keys(dns).forEach(function (k) { dns[k].sort(function (a, b) { return a - b; }); });
      var nC = 0, pontas = [];
      try { nC = Math.max(0, arr(BIi.rede(fim, c.avaliarFam).conexoes).length - arr(BIi.rede(c.estado, c.avaliarFam).conexoes).length); } catch (e) {}
      try {
        var antes = {}; BIi.verificar(c.estado, c.avaliarFam).itens.forEach(function (i) { if (i.tipo === "ponta") antes[i.texto] = (antes[i.texto] || 0) + 1; });
        BIi.verificar(fim, c.avaliarFam).itens.forEach(function (i) { if (i.tipo !== "ponta") return; if (antes[i.texto]) { antes[i.texto]--; return; } pontas.push(i.texto); });
      } catch (e2) {}
      /* NENHUMA PEÇA DESCONECTADA (frente A, 19/10/2026): as pontas soltas novas pelo verificador de conectividade (a "continua"
         que não é espera permitida também é solta) — o cartão só diz "Pronto" com zero, e cada uma tem Mostrar no 3D */
      var soltas = [];
      try {
        if (BIi.conectividade) {
          var jaAntes = {}; BIi.conectividade(c.estado, c.avaliarFam).soltas.forEach(function (q) { jaAntes[q.trecho + "|" + (q.ponta || "") + "|" + q.x + "|" + q.z] = 1; });
          BIi.conectividade(fim, c.avaliarFam).soltas.forEach(function (q) { if (!jaAntes[q.trecho + "|" + (q.ponta || "") + "|" + q.x + "|" + q.z]) soltas.push(q); });
        }
      } catch (e3) { soltas = []; }
      var pecas = arr(fim.instalacoes && fim.instalacoes.pecas).filter(function (k) { return ids[String(k.id)]; }).map(function (k) { return k.peca; });
      return { tubos: trs.length, metros: Math.round(metros * 100) / 100, conexoes: nC, dns: dns, pecas: pecas, pontasNovas: pontas, soltas: soltas, ids: Object.keys(ids) };   // hid:ok arredondamento a cm
    },
    /* FRENTE H8: o programa de necessidades da tela de cálculo (uso, dormitórios, população) — o volume da caixa proposta */
    _programa: function () { var HC = dep("HidCalcUI"); try { return HC && HC.programa ? HC.programa() : null; } catch (e) { return null; } },
    /* FRENTE H8 (21/10/2026): "MONTAR BARRILETE" — só o barrilete da caixa selecionada (ou de todas), com a mesma prévia e o mesmo
       cartão do Traçar (Enter aplica, um Ctrl+Z desfaz). O Traçar automaticamente já monta o barrilete junto; este é para quem pôs
       a caixa depois de traçar os ambientes */
    ID_BAR: "montar-barrilete", ID_CTX_BAR: "ctx-montar-barrilete",
    _caixaSel: function (c, uids) {
      var HBR = dep("HidBarrilete"); if (!HBR || !c) return null;
      var ids = arr(uids).map(function (u) { return String(u).replace(/^edit:/, ""); }), cxs = HBR.caixas(c.estado, c.avaliarFam).filter(function (x) { return ids.indexOf(x.id) >= 0; });
      return cxs.length ? cxs[0].id : null;
    },
    planejarBarrilete: function (opcoes) {
      opcoes = opcoes || {};
      var K = dep("HidKit"), BE = dep("BimEdit"), HBR = dep("HidBarrilete"), c = U._ctx();
      if (!HBR && typeof require === "function") { try { HBR = require("./hidbarrilete.js"); } catch (eR) { HBR = null; } }
      if (!K || !BE || !HBR || !c) return { ok: false, erro: "O motor do barrilete não carregou (js/hidbarrilete.js)." };
      var uids = opcoes.uids != null ? opcoes.uids : (c.b.selecao ? arr(c.b.selecao().uids) : []);
      var cxId = opcoes.caixa != null ? String(opcoes.caixa) : U._caixaSel(c, uids);
      var ops = HBR.anteriores(K.achatar(c.ops), cxId).map(function (idB) { return { op: "apagar", id: idB }; });
      var todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]);
      var RB = HBR.montar({ estado: BE.aplicar(todos), avaliarFam: c.avaliarFam, ops: todos, parametros: U.parametros(), caixa: cxId, pressao: true, oferta: true, programa: U._programa() });
      RB.ops.forEach(function (o) { ops.push(o); });
      var esc0 = { tipo: "barrilete", aparelhos: [], ambientes: [], erro: null };
      /* N23: nada traçado, mas com o que fazer (a caixa baixa demais: as bases de apoio com o Corrigir) — o cartão abre com as opções,
         em vez de só o erro (a caixa recém-posta no chão diz "eleve sobre a base de madeira ou metálica" e o Corrigir faz) */
      var comAcao = RB.pendencias.concat(RB.avisos).filter(function (p) { return p && p.acao && p.acao.tipo === "ops"; });
      if (!RB.ops.length && !comAcao.length) return { ok: false, erro: (RB.pendencias.concat(RB.avisos)[0] || {}).texto || "Nada a montar: nenhuma caixa d'água e nenhuma espera de água fria no modelo.", escopo: esc0, pendencias: RB.pendencias, avisos: RB.avisos };
      var resumo = U._resumo(c, ops);
      resumo.kits = 0; resumo.ambientes = 0; resumo.reaproveitadas = []; resumo.caixasNovas = []; resumo.piscinas = 0;
      var avisos = RB.avisos.slice(); if (RB.ligadas) avisos.unshift({ texto: arr(RB.decisoes).map(function (d) { return d.texto; }).join(" "), elementos: RB.caixas.map(function (x) { return x.id; }) });
      return { ok: true, ops: ops, resumo: resumo, avisos: avisos, pendencias: RB.pendencias.slice(), criterios: null, opcoes: 1, indice: 0, escopo: esc0, ambientes: [], redes: [], kits: [], piscinas: [], barrilete: RB, opsNaProposta: c.ops.length };
    },
    /* N23 (23/10/2026) — pedido do Rogério: "colocou a caixa → conecta sozinha: barrilete, colunas, registros, extravasor, limpeza,
       boia". A caixa recém-posta abre a PRÉVIA do barrilete dela (o mesmo cartão: Enter aplica, Esc cancela, um Ctrl+Z desfaz); sem
       espera de água fria no modelo e com aparelhos, a prévia é o Traçar automaticamente inteiro (os ambientes + o barrilete). Outra
       prévia aberta não é atropelada. Devolve o que fez (para o teste) */
    RESERVATORIO: /^(ra-caixa-dagua|hid-caixa-dagua|hid-reservatorio-tanque)$/,
    aoColocarFamilia: function (d) {
      if (!d || !U.RESERVATORIO.test(String(d.famId)) || U._plano) return null;
      var c = U._ctx(); if (!c) return null;
      var P = U.planejarBarrilete({ caixa: String(d.id) });
      if (P && P.ok) { U._plano = P; U._planoUids = []; U._previa(P.ops); U._cardMostrar(P); status("Caixa d'água posta: a prévia do barrilete (" + P.resumo.tubos + " tubo(s)). Enter aplica, Esc cancela."); return "barrilete"; }
      if (U._aparelhosDe(c).length) { var T = U.tracarAuto({ todos: true }); return T && T.ok ? "tracar" : "nada"; }
      status("Caixa d'água posta. Ponha os aparelhos (ou trace os ambientes) e ela liga sozinha no Traçar automaticamente.");
      return "nada";
    },
    montarBarrilete: function (opcoes) {
      var c = U._ctx(); if (!c) { status("Abra o BIM para montar o barrilete."); return null; }
      status("Montar barrilete: calculando…");
      var P = U.planejarBarrilete(opcoes || {});
      U._plano = P; U._planoUids = [];
      if (!P.ok) { U.ultimo = { ok: false, erro: P.erro }; U._previa(null); U._cardMostrar(P); U._redesenhar(); status(P.erro); return P; }
      U._previa(P.ops); U._cardMostrar(P);
      status("Prévia do barrilete: " + P.resumo.tubos + " tubo(s), " + P.resumo.conexoes + " conexão(ões). Enter aplica, Esc cancela.");
      return P;
    },
    /* ---------------- a tela da prévia: card flutuante + prévia translúcida no 3D/planta; Tab alterna; Enter aplica; Esc cancela */
    tracarAuto: function (opcoes) {
      opcoes = opcoes || {};
      var c = U._ctx(); if (!c) { status("Abra o BIM para traçar."); return null; }
      var uids = opcoes.uids != null ? opcoes.uids : (c.b.selecao ? arr(c.b.selecao().uids) : []);
      if (!arr(uids).length && !opcoes.todos) {
        var nAp = U._aparelhosDe(c).length;
        if (nAp && !U._confirmar("Nada selecionado.\n\nTraçar TODOS os ambientes com aparelhos (" + nAp + " aparelho(s))?\n\n(Para um cômodo só: clique no ambiente ou nos aparelhos e use Traçar automaticamente de novo.)")) { status("Traçar automaticamente: cancelado."); return null; }
      }
      status("Traçar automaticamente: calculando o traçado…");
      var P = U.planejar({ uids: uids, opcaoRota: opcoes.opcaoRota });
      U._plano = P; U._planoUids = uids;
      if (!P.ok) { U.ultimo = { ok: false, erro: P.erro }; U._previa(null); U._cardMostrar(P); U._redesenhar(); status(P.erro); return P; }
      U._previa(P.ops);
      U._cardMostrar(P);
      status("Prévia do traçado: " + P.resumo.tubos + " tubo(s), " + P.resumo.conexoes + " conexão(ões)" + (P.opcoes > 1 ? " — Tab alterna a opção (" + (P.indice + 1) + " de " + P.opcoes + ")" : "") + ". Enter aplica, Esc cancela.");
      return P;
    },
    alternarOpcao: function () {
      var P = U._plano; if (!P || !P.ok || P.opcoes < 2) return false;   // hid:ok só alterna com 2+ opções
      var prox = (P.indice + 1) % P.opcoes;
      status("Traçar automaticamente: opção " + (prox + 1) + " de " + P.opcoes + "…");
      var N = U.planejar({ uids: U._planoUids, opcaoRota: prox, perguntarManual: false });
      if (!N.ok) { status(N.erro); return false; }
      N.indice = prox; U._plano = N; U._previa(N.ops); U._cardMostrar(N);
      return true;
    },
    aplicarTracado: function () {
      var P = U._plano, c = U._ctx(); if (!P || !P.ok || !c) return null;
      /* CRITÉRIO DE PROJETISTA: com PROIBIDO na prévia (o aparelho colado na janela, a ventilação sem saída…) o sistema não aplica
         calado — explica e pergunta; aplicar assim é decisão do RT */
      var Qd = P.criterios && P.criterios.contagem ? P.criterios.contagem.dura : 0;
      if (Qd && !U._confirmar("A prévia tem " + Qd + " PROIBIDO(s) de projetista:\n\n" + P.criterios.apontamentos.filter(function (a) { return a.gravidade === "dura"; }).slice(0, 4).map(function (a) { return "• " + a.titulo + ": " + a.texto; }).join("\n") +   // hid:ok até 4 itens no texto da pergunta
        "\n\nCorrija o modelo (mova o aparelho, a janela/porta ou use outra opção com Tab) e trace de novo.\n\nAplicar mesmo assim? (decisão do RT)")) { status("Traçado NÃO aplicado: há " + Qd + " proibido(s) de projetista na prévia."); return null; }
      if (c.ops.length !== P.opsNaProposta) { U.cancelarTracado(); status("O modelo mudou depois da prévia: clique Traçar automaticamente de novo."); return null; }
      U._previa(null); U._cardFechar();
      var ok = U._gravar(c, P.ops, "hidtracar");
      U._plano = null;
      U.ultimo = { ok: ok, resumo: { kits: P.kits, removidos: [], ambientes: P.ambientes, redes: P.redes }, quando: new Date().getTime(), tracado: P.resumo, criterios: P.criterios || null };
      /* a PISCINA no mesmo clique: o bloco Piscina passa a mostrar este lançamento (sem relançar: a casa de máquinas fica
         "aceita" onde o plano pôs) e o documento único (memorial + lista de material + pranchas) abre junto */
      if (ok && arr(P.piscinas).length) { try { var PU = dep("HidPiscinaUI"); if (PU && PU.aposTracar) PU.aposTracar(P.piscinas); } catch (eP) {} }
      /* CRITÉRIO DE PROJETISTA depois do traçado: o painel Instalações já traz a lista do modelo inteiro (Mostrar no 3D / Corrigir) */
      try { var BUi = global.BimInstUI, c3 = U._ctx(); if (ok && BUi && BUi.criterios && c3) BUi._crit = BUi.criterios(c3.estado, c3.avaliarFam); } catch (eCr) {}
      status(ok ? "Traçado aplicado: " + P.resumo.tubos + " tubo(s) (" + String(P.resumo.metros).replace(".", ",") + " m), " + P.resumo.conexoes + " conexão(ões), " + P.resumo.kits + " kit(s), " + P.resumo.ambientes + " ambiente(s)" + (P.resumo.pontasNovas.length ? " — " + P.resumo.pontasNovas.length + " ponta(s) solta(s)" : ", nenhuma ponta solta") + ". Ctrl+Z desfaz tudo." : "O editor recusou o traçado.");
      U._redesenhar();
      return U.ultimo;
    },
    /* Corrigir: tira o aparelho duplicado (e o kit dele, se tiver) num lote e refaz a prévia */
    removerDuplicado: function (id) {
      var K = dep("HidKit"), BE = dep("BimEdit"), c = U._ctx(); if (!c || !id || !K || !BE) return false;
      var ops = [{ op: "apagar", id: String(id) }], est2 = BE.aplicar(c.ops.concat(ops));
      K.reconciliar({ estado: est2, avaliarFam: c.avaliarFam, ops: c.ops }).forEach(function (a) { if (a.acao === "remover" && a.famInst === String(id)) a.ops.forEach(function (o) { ops.push(o); }); });
      U._previa(null);
      var ok = U._gravar(c, ops, "hiddup");
      status(ok ? "Aparelho duplicado " + id + " removido (Ctrl+Z desfaz). Refazendo a prévia…" : "O editor recusou remover " + id + ".");
      if (ok) { var uids = arr(U._planoUids).filter(function (u) { return String(u).replace(/^edit:/, "") !== String(id); }); U.tracarAuto({ uids: uids, todos: true }); }
      return ok;
    },
    /* Mostrar no 3D o apontamento da prévia (os tubos ainda não gravados aparecem na prévia translúcida; o obstáculo é selecionado) */
    critMostrar: function (i) {
      var P = U._plano, a = P && P.criterios && P.criterios.apontamentos[i], b = global.BIM; if (!a) return false;
      var uids = (a.obstaculo ? [a.obstaculo] : []).concat(a.ids).map(function (id) { return "edit:" + id; });
      try { if (b && b.selecionar) b.selecionar(uids); } catch (e1) {}
      try { if (b && b.enquadrarUids) b.enquadrarUids(uids); } catch (e2) {}
      status(a.titulo + ": " + a.texto);
      return true;
    },
    /* Mostrar no 3D a ponta solta da prévia (componente de problema, js/problemacard.js, quando carregado) */
    soltaMostrar: function (i) {
      var P = U._plano, q = P && P.resumo && arr(P.resumo.soltas)[i], b = global.BIM, PC = global.ProblemaCard; if (!q) return false;
      var feito = false;
      try { if (PC && PC.mostrarNo3D) { PC.mostrarNo3D([q.trecho]); feito = true; } } catch (e0) {}
      if (!feito) { var uids = ["edit:" + q.trecho]; try { if (b && b.selecionar) b.selecionar(uids); } catch (e1) {} try { if (b && b.enquadrarUids) b.enquadrarUids(uids); } catch (e2) {} }
      status("Ponta solta: " + q.trecho + (q.continua ? " (marcada como espera, mas não é espera permitida)" : ""));
      return true;
    },
    /* FRENTE H6: Mostrar no 3D os elementos de uma pendência/aviso do cartão (o aquecedor, o ambiente, a janela do terminal) */
    avisoMostrar: function (i) {
      var x = arr(U._avisosCard)[i], b = global.BIM; if (!x) return false;
      var uids = arr(x.o.elementos).map(function (id) { return "edit:" + id; });
      try { if (b && b.selecionar) b.selecionar(uids); } catch (e1) {}
      try { if (b && b.enquadrarUids) b.enquadrarUids(uids); } catch (e2) {}
      status(x.o.texto);
      return true;
    },
    /* FRENTE H6: Corrigir de uma pendência/aviso — "ops": grava o lote da correção (um Ctrl+Z desfaz) e refaz a prévia; "dn": aumenta o
       DN dos trechos da PRÓPRIA prévia (ainda não gravados) e redesenha */
    avisoCorrigir: function (i) {
      var x = arr(U._avisosCard)[i], P = U._plano, c = U._ctx(); if (!x || !x.o.acao || !P || !P.ok || !c) return false;
      var ac = x.o.acao;
      if (ac.tipo === "dn") {
        var n = 0; arr(ac.mudancas).forEach(function (m) { P.ops.forEach(function (o) { if (o && o.op === "trecho" && String(o.id) === String(m.id) && Number(o.dn) < Number(m.para)) { o.dn = m.para; n++; } }); });
        P.pendencias = P.pendencias.filter(function (q) { return q !== x.o; }); P.avisos = P.avisos.filter(function (q) { return q !== x.o; });
        U._previa(P.ops); U._cardMostrar(P);
        status(n ? "Corrigido na prévia: " + ac.texto + ". Enter aplica." : "Nada a mudar: os trechos já têm o DN.");
        return n > 0;
      }
      if (ac.tipo !== "ops" || !arr(ac.ops).length) return false;
      U._previa(null);
      var ok = U._gravar(c, ac.ops, "hidgas");
      status(ok ? "Corrigido: " + ac.texto + " (Ctrl+Z desfaz). Refazendo a prévia…" : "O editor recusou a correção (" + ac.texto + ").");
      if (ok) U.tracarAuto({ uids: U._planoUids || [], todos: true });
      return ok;
    },
    cancelarTracado: function () { U._previa(null); U._cardFechar(); U._plano = null; return true; },
    _previa: function (ops) { var b = B(); try { if (b && b.editarPreviaInst) b.editarPreviaInst(ops && ops.length ? ops : null); } catch (e) {} U._previaPlanta(ops); },
    /* a PRÉVIA nas PLANTAS abertas (o 3D tem a dele, no js/bim.js): os tubos e as peças do lote, translúcidos, por cima do desenho */
    _previaPlanta: function (ops) {
      var d = global.document, P2 = global.Bim2D, IC = global.BimInstCon, BIi = dep("BimInst"); if (!d || !P2 || !IC || !IC.noDesenho) return;
      [].slice.call(d.querySelectorAll("g[data-hidtr-previa]")).forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); });
      if (!ops || !ops.length) return;
      var ids = []; try { ids = P2.plantasAbertas() || []; } catch (e) { ids = []; }
      ids.forEach(function (vid) {
        var svg = d.querySelector('.bim-tela[data-vista="' + vid + '"] .d2-vista-tela svg'), def = null; try { def = P2.def(vid); } catch (e) {}
        if (!svg || !def) return;
        var NS = "http://www.w3.org/2000/svg", g = d.createElementNS(NS, "g"), n = 0;
        g.setAttribute("data-hidtr-previa", "1"); g.setAttribute("style", "pointer-events:none"); g.setAttribute("opacity", "0.75");
        function no(p) { try { return IC.noDesenho(def, p); } catch (e) { return null; } }
        function el(tag, at) { var e = d.createElementNS(NS, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); g.appendChild(e); n++; }
        ops.forEach(function (o) {
          if (!o) return;
          if (o.op === "trecho" && o.p1 && o.p2) {
            var a = no(o.p1), b = no(o.p2), w = Math.max(num0(o.dn) / 1000, 0.025);   // hid:ok DN em mm → m; traço mínimo de 2,5 cm para aparecer
            if (!a || !b) return;
            if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < w / 2) el("circle", { cx: a.x, cy: a.y, r: w / 2 + 0.01, fill: "#38bdf8", stroke: "#0b5d80", "stroke-width": 0.01 });   // hid:ok contorno do tubo vertical (m)
            else el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#38bdf8", "stroke-width": w, "stroke-linecap": "round" });
          } else if ((o.op === "peca" || o.op === "familia") && isFinite(num0(o.x))) {
            var q = no({ x: o.x, y: num0(o.y), z: o.z }), r = o.op === "peca" ? num0(((BIi && BIi.PECAS[o.peca]) || {}).r) || 0.05 : 0.08;   // hid:ok marca da família proposta (8 cm)
            if (q) el("circle", { cx: q.x, cy: q.y, r: r, fill: "rgba(56,189,248,.35)", stroke: "#0b5d80", "stroke-width": 0.015 });   // hid:ok contorno da marca (m)
          }
        });
        if (n) svg.appendChild(g);
      });
    },
    _cardHtml: function (P) {
      var NOMES = { esgoto: "Esgoto", agua_fria: "Água fria", agua_quente: "Água quente", ventilacao: "Ventilação", pluvial: "Pluvial" };
      var h = '<div class="hidtr-cab"><b>Traçar automaticamente</b><button type="button" data-hid-tr="cancelar" title="Cancelar (Esc)" aria-label="Fechar">×</button></div>';
      if (!P.ok) return h + '<p class="hidtr-erro" data-hid-tr-erro>' + esc(P.erro) + '</p><div class="hidtr-bt"><button type="button" class="btn sm" data-hid-tr="cancelar">Fechar</button></div>';
      var R = P.resumo;
      h += '<p data-hid-tr-resumo><b>' + R.tubos + "</b> tubo(s) · " + String(R.metros).replace(".", ",") + " m · <b>" + R.conexoes + "</b> conexão(ões)" + (R.kits ? " · " + R.kits + " kit(s)" : "") + " · " + R.ambientes + " ambiente(s)</p>";
      h += '<ul class="hidtr-dn">' + Object.keys(R.dns).map(function (k) { return "<li>" + esc(NOMES[k] || k) + ": DN " + R.dns[k].join(", ") + "</li>"; }).join("") + "</ul>";
      if (R.reaproveitadas.length) h += '<p class="hidtr-ok" data-hid-tr-reaproveita>Aproveitado do que você já pôs: ' + R.reaproveitadas.map(function (x) { return esc(x.id) + " (" + esc(x.papel) + ")"; }).join("; ") + ".</p>";
      if (R.caixasNovas.length) h += '<p class="muted">Caixa sifonada nova: ' + esc(R.caixasNovas.join(", ")) + ".</p>";
      /* "Pronto" SÓ com zero pontas soltas (verificador de conectividade); senão a lista de onde estão, com Mostrar no 3D */
      var nS = Math.max(R.pontasNovas.length, arr(R.soltas).length);
      h += '<p class="' + (nS ? "hidtr-erro" : "hidtr-ok") + '" data-hid-tr-pontas="' + nS + '">' + (nS ? nS + " ponta(s) solta(s) — o traçado NÃO está pronto:" : "Pronto: nenhuma ponta solta.") + "</p>";
      if (arr(R.soltas).length) h += '<ul class="hidtr-soltas" data-hid-tr-soltas>' + R.soltas.slice(0, U.MAX_AVISOS * 2).map(function (q, i) { return '<li class="hid-pend">' + esc(q.trecho + " (" + (NOMES[q.sistema] || q.sistema || "") + ") em " + [q.x, q.y, q.z].map(function (v) { return String(Math.round(num0(v) * 100) / 100).replace(".", ","); }).join("; ") + (q.continua ? " — marcada como espera, mas não é espera permitida" : "")) + ' <button type="button" class="btn sm ghost" data-hid-tr="solta-ver" data-n="' + i + '">Mostrar no 3D</button></li>'; }).join("") + "</ul>";   // hid:ok arredondamento a cm
      /* a nota do critério de projetista e os apontamentos (proibido primeiro), com Mostrar */
      if (P.criterios) {
        var Q = P.criterios, rotG = { dura: "PROIBIDO", alerta: "Alerta", sugestao: "Sugestão" };
        h += '<p data-hid-tr-crit="' + Q.nota + '" class="' + (Q.contagem.dura ? "hidtr-erro" : (Q.apontamentos.length ? "" : "hidtr-ok")) + '">Qualidade do traçado: <b>' + Q.nota + "/100</b> (" + esc(Q.conceito) + ")" + (Q.apontamentos.length ? " — " + Q.apontamentos.length + " apontamento(s) de projetista:" : " — nada que um projetista estranharia.") + "</p>";
        if (Q.apontamentos.length) h += '<ul class="hidtr-crit">' + Q.apontamentos.slice(0, U.MAX_AVISOS * 2).map(function (a, i) {
          return '<li class="' + (a.gravidade === "dura" ? "hid-pend" : "") + '" title="' + esc(a.porque + " Fonte: " + a.fonte) + '"><b>' + rotG[a.gravidade] + " · " + esc(a.titulo) + ":</b> " + esc(a.texto) + ' <button type="button" class="btn sm ghost" data-hid-tr="crit-ver" data-n="' + i + '">Mostrar</button></li>';
        }).join("") + "</ul>";
      }
      /* FRENTE H6: o achado com CORRIGIR (as ops da NBR 13103 — trocar o tipo, a altura, lançar a tomada; o aumento de DN da água quente)
         e com MOSTRAR (os elementos no 3D) — o padrão da casa: o que é + Corrigir + Mostrar no 3D */
      U._avisosCard = P.pendencias.map(function (p) { return { o: p, k: "pend" }; }).concat(P.avisos.map(function (a) { return { o: a, k: "aviso" }; }));
      var av = U._avisosCard.map(function (x, i) { return { t: x.o.texto, k: x.k, acao: x.o.acao || null, i: i, els: arr(x.o.elementos) }; });
      function botoes(a) { return (a.acao && (a.acao.tipo === "ops" || a.acao.tipo === "dn") ? ' <button type="button" class="btn sm" data-hid-tr="av-corrigir" data-n="' + a.i + '" title="' + esc(a.acao.texto || "") + '">Corrigir</button>' : "") + (a.els.length ? ' <button type="button" class="btn sm ghost" data-hid-tr="av-ver" data-n="' + a.i + '">Mostrar no 3D</button>' : ""); }
      /* o que tem CORRIGIR (o aparelho duplicado) vem antes e aberto, com o botão */
      av.filter(function (a) { return a.acao && a.acao.tipo === "remover"; }).forEach(function (a) { h += '<p class="hidtr-erro" data-hid-tr-dup="' + esc(a.acao.id) + '">' + esc(a.t) + ' <button type="button" class="btn sm" data-hid-tr="remover" data-id="' + esc(a.acao.id) + '">Corrigir: ' + esc(a.acao.texto) + "</button></p>"; });
      av = av.filter(function (a) { return !(a.acao && a.acao.tipo === "remover"); });
      /* o que tem Corrigir vem primeiro (a lista corta no fim) */
      av.sort(function (a, b) { return (b.acao ? 1 : 0) - (a.acao ? 1 : 0) || a.i - b.i; });
      if (av.length) h += '<details' + (av.length <= U.MAX_AVISOS / 2 || av.some(function (a) { return a.acao; }) ? " open" : "") + ' data-hid-tr-avisos><summary>Avisos (' + av.length + ")</summary><ul>" + av.slice(0, U.MAX_AVISOS * 2).map(function (a) { return '<li class="' + (a.k === "pend" ? "hid-pend" : "") + '" data-hid-tr-aviso="' + a.i + '">' + esc(a.t) + botoes(a) + "</li>"; }).join("") + "</ul></details>";
      if (P.opcoes > 1) h += '<p class="muted" data-hid-tr-opcao>Opção ' + (P.indice + 1) + " de " + P.opcoes + ' — <button type="button" class="btn sm ghost" data-hid-tr="opcao">Tab: outra opção</button></p>';
      var nDura = P.criterios && P.criterios.contagem ? P.criterios.contagem.dura : 0;
      h += '<div class="hidtr-bt"><button type="button" class="btn sm primary" data-hid-tr="aplicar"' + (nDura ? ' data-hid-tr-dura="' + nDura + '" title="Há proibido(s) de projetista: aplicar pede confirmação (decisão do RT)">Aplicar com proibido (RT)' : ">Aplicar (Enter)") + '</button><button type="button" class="btn sm" data-hid-tr="cancelar">Cancelar (Esc)</button></div>';
      return h;
    },
    _cardMostrar: function (P) {
      var d = global.document; if (!d || !d.body) return;
      var el = d.getElementById("hid-tracar");
      if (!el) {
        el = d.createElement("div"); el.id = "hid-tracar"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Traçar automaticamente — prévia");
        el.style.cssText = "position:fixed;right:16px;top:120px;z-index:100000;width:min(360px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:var(--rv-painel-bg,var(--card,#fff));color:var(--rv-painel-tx,var(--texto,#1a1a1a));border:1px solid var(--rv-linha-forte,#b4b4b4);border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.22);padding:10px 12px;font-size:12.5px";
        el.addEventListener("click", function (ev) {
          var b = ev.target && ev.target.closest ? ev.target.closest("[data-hid-tr]") : null; if (!b) return;
          var a = b.getAttribute("data-hid-tr");
          if (a === "aplicar") U.aplicarTracado(); else if (a === "opcao") U.alternarOpcao(); else if (a === "remover") U.removerDuplicado(b.getAttribute("data-id"));
          else if (a === "crit-ver") U.critMostrar(Number(b.getAttribute("data-n")));
          else if (a === "solta-ver") U.soltaMostrar(Number(b.getAttribute("data-n")));
          else if (a === "av-ver") U.avisoMostrar(Number(b.getAttribute("data-n"))); else if (a === "av-corrigir") U.avisoCorrigir(Number(b.getAttribute("data-n"))); else U.cancelarTracado();
        });
        d.body.appendChild(el);
        if (!d.getElementById("hid-tracar-css")) {
          var st = d.createElement("style"); st.id = "hid-tracar-css";
          st.textContent = "#hid-tracar .hidtr-cab{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px}#hid-tracar .hidtr-cab button{background:transparent;border:0;font-size:18px;line-height:1;cursor:pointer;color:inherit;min-width:28px;min-height:28px}" +
            "#hid-tracar p{margin:4px 0}#hid-tracar ul{margin:2px 0 4px;padding-left:18px}#hid-tracar .hidtr-ok{color:var(--ok,#1f7a3a)}#hid-tracar .hidtr-erro{color:var(--erro,#b42318);font-weight:600}" +
            "#hid-tracar .hidtr-bt{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}#hid-tracar .hid-pend{color:var(--erro,#b42318)}";
          d.head.appendChild(st);
        }
      }
      el.innerHTML = U._cardHtml(P);
      el.style.display = "block";
      U._teclasTracado(true);
      /* a planta se redesenha sozinha (trocar de vista, zoom, a op de outra frente): enquanto o cartão está aberto, a prévia
         volta para a planta que ficou sem ela */
      if (!U._tPrevPlanta && global.setInterval) U._tPrevPlanta = global.setInterval(function () {
        var dd = global.document, P2 = global.Bim2D; if (!U._plano || !U._plano.ok || !dd || !P2) return;
        var falta = false; try { (P2.plantasAbertas() || []).forEach(function (vid) { var sv = dd.querySelector('.bim-tela[data-vista="' + vid + '"] .d2-vista-tela svg'); if (sv && !sv.querySelector("g[data-hidtr-previa]")) falta = true; }); } catch (e) {}
        if (falta) U._previaPlanta(U._plano.ops);
      }, U.REPINTAR_MS);
    },
    REPINTAR_MS: 600,   // hid:ok de quanto em quanto a prévia confere a planta (ms)
    _cardFechar: function () { var d = global.document, el = d && d.getElementById("hid-tracar"); if (el) el.style.display = "none"; U._teclasTracado(false); if (U._tPrevPlanta) { global.clearInterval(U._tPrevPlanta); U._tPrevPlanta = null; } },
    _teclasTracado: function (on) {
      var d = global.document; if (!d || !global.addEventListener) return;
      if (!U._kTr) U._kTr = function (e) {
        var el = d.getElementById("hid-tracar"); if (!el || el.style.display === "none") return;
        var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "")) return;
        var k = e.key;
        if (k !== "Tab" && k !== "Enter" && k !== "Escape") return;
        e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (k === "Tab") U.alternarOpcao(); else if (k === "Enter") { if (U._plano && U._plano.ok) U.aplicarTracado(); else U.cancelarTracado(); } else U.cancelarTracado();
      };
      if (on && !U._kTrOn) { global.addEventListener("keydown", U._kTr, true); U._kTrOn = true; }
      if (!on && U._kTrOn) { global.removeEventListener("keydown", U._kTr, true); U._kTrOn = false; }
    },
    /* ---------------- a fita: Instalações › Projeto inteligente; aba Modificar | Aparelhos; atalho TA (js/biminstui.js registrarP12 chama) */
    ID_CMD: "tracar-auto", ID_CTX: "ctx-tracar-auto", ATALHO: "TA",
    registrar: function (reg, R) {
      R = R || global.BimRibbon; if (!R || !reg) return false;
      var cmd = { id: U.ID_CMD, rotulo: "Traçar\nautomaticamente", icone: "link", grande: true, dica: "Gera os tubos sozinho: o kit de cada aparelho que ainda não tem, a caixa sifonada (aproveita a que você pôs), a ventilação, o ramal DN 100 e a água pela parede; com a linha da rede, liga nela. Selecione o ambiente ou os aparelhos (nada selecionado = todos). Mostra a prévia antes de aplicar; Tab alterna a opção; um Ctrl+Z desfaz (atalho TA)." };
      var cmdBar = { id: U.ID_BAR, rotulo: "Montar\nbarrilete", icone: "link", dica: "Com a caixa d'água no modelo: a saída com registro e a ventilação, o barrilete no ático descendo até cada espera de água fria, a coluna com registro, o extravasor, a limpeza e a boia; confere a pressão (NBR 5626). Selecione a caixa (nada = todas). O Traçar automaticamente já faz isto junto." };
      try { R.acrescentar("instalacoes", "Instalações", "Projeto inteligente", [cmd, cmdBar]); } catch (e) {}
      reg[U.ID_CMD] = function () { U.tracarAuto(); return true; };
      reg[U.ID_BAR] = function () { U.montarBarrilete(); return true; };
      /* N23: CAIXA D'ÁGUA EM UM CLIQUE — pôs a caixa, o barrilete aparece na prévia (Enter aplica) */
      if (!U._ouveCaixa && global.addEventListener) { U._ouveCaixa = true; global.addEventListener("bim:familia-colocada", function (ev) { U.aoColocarFamilia(ev && ev.detail); }); }
      /* a fita por DISCIPLINA (js/bimdisciplinas.js): o comando é da hidráulica — sem declarar, a aba Instalações aparecia na
         disciplina civil (e2e-bim-disciplinas [b], achado na bateria das pendências finais, 18/10/2026) */
      try { var BD = global.BimDisciplinas; if (BD && BD.declarar) BD.declarar([U.ID_CMD, U.ID_CTX, U.ID_BAR, U.ID_CTX_BAR], "hidraulica"); } catch (eD) {}
      /* o atalho de duas letras: fora (BimFita) e dentro do modo de edição (BimPrecisao.ATALHOS_CMD) */
      try { var F = global.BimFita; if (F && F.ATALHOS_FX && !F.ATALHOS_FX[U.ATALHO]) F.ATALHOS_FX[U.ATALHO] = U.ID_CMD; } catch (eF) {}
      try { if (global.BimAlinharInst && global.BimAlinharInst.atalhoAL) global.BimAlinharInst.atalhoAL(); } catch (eAL) {}   /* AL fora do modo de edição */
      try { var Pr = global.BimPrecisao; if (Pr) { Pr.ATALHOS_CMD = Pr.ATALHOS_CMD || {}; if (!Pr.ATALHOS_CMD[U.ATALHO] && !(Pr.ATALHOS && Pr.ATALHOS[U.ATALHO])) Pr.ATALHOS_CMD[U.ATALHO] = U.ID_CMD; } } catch (eP) {}
      /* a aba contextual: com aparelho sanitário, peça de esgoto ou ambiente selecionado, o painel "Projeto inteligente".
         ⚠ Embrulha o BimFita.aplicarContexto (uma vez) em vez de mexer nele: o js/bimfita.js é de outra frente. O botão é um
         ATALHO "ctx-…" com alias (a regra da fita: nada de comando em dois lugares; o _ehCtx reconhece o painel pelo prefixo) */
      /* a ação do atalho da aba contextual vai DIRETO no BimCmd: o registrar dele recusa id que não está na fita agora (o
         painel contextual só existe com seleção) */
      try { var Cm = global.BimCmd; if (Cm && Cm._acoes) { Cm._acoes[U.ID_CTX] = function () { U.tracarAuto(); return true; }; Cm._acoes[U.ID_CTX_BAR] = function () { U.montarBarrilete(); return true; }; } } catch (eCm) {}
      try {
        var F2 = global.BimFita;
        if (F2 && F2.aplicarContexto && !F2._hidTracarEmbrulho) {
          var orig = F2.aplicarContexto, cmdCtx = { id: U.ID_CTX, rotulo: cmd.rotulo, icone: cmd.icone, grande: true, alias: U.ID_CMD, dica: cmd.dica };
          var cmdCtxBar = { id: U.ID_CTX_BAR, rotulo: cmdBar.rotulo, icone: cmdBar.icone, grande: true, alias: U.ID_BAR, dica: cmdBar.dica };
          F2._hidTracarEmbrulho = true;
          F2.aplicarContexto = function (cat) {
            var r = orig.apply(this, arguments);
            try {
              var p = cat ? U._ctxExtra(this._selecao ? this._selecao() : []) : null, Rb = global.BimRibbon, m = p && Rb && Rb.aba ? Rb.aba("modificar") : null;
              if (m) { m.paineis.push({ nome: p.nome, comandos: [p.ids[0] === U.ID_BAR ? cmdCtxBar : cmdCtx] }); if (cat.k === "geral") m.rotulo = "Modificar | " + p.rot; }
            } catch (eC) {}
            return r;
          };
        }
      } catch (eC2) {}
      return true;
    },
    /* ALINHAR / MOVER uma peça de um ambiente TRAÇADO (js/bimalinharinst.js): em vez de arrastar os tubos (que giram e saem a
       45°), o projeto inteligente REFAZ: o kit do aparelho mexido e o traçado dos ambientes que a peça toca — num lote só.
       `mov(estado)` devolve as ops do movimento; null = a peça não é de ambiente traçado (o arraste de sempre resolve). */
    religarDepois: function (id, mov) {
      var K = dep("HidKit"), A = dep("HidAmbiente"), BE = dep("BimEdit"), c = U._ctx(); if (!K || !A || !BE || !c || id == null) return null;
      id = String(id);
      var lista = K.achatar(c.ops), ambs = {}, est0 = c.estado;
      var fam = arr(est0.familias).filter(function (f) { return String(f.id) === id; })[0] || null;
      var pc = arr(est0.instalacoes && est0.instalacoes.pecas).filter(function (k) { return String(k.id) === id; })[0] || null;
      if (!fam && !pc) return null;
      /* os ambientes: o do aparelho (ambInfo) ou os que têm tubo chegando na peça */
      var gerados = {}; lista.forEach(function (o) { if (o.amb != null && o.id != null) gerados[String(o.id)] = o.amb; });
      lista.forEach(function (o) { if (o.ambInfo && fam && arr(o.ambInfo.aparelhos).indexOf(id) >= 0) ambs[o.ambInfo.id] = o.ambInfo; });
      if (pc) {
        var cap = ((dep("BimInst") || {}).PECAS || {})[pc.peca] || {}, rC = num0(cap.captura) + num0(cap.r);
        arr(est0.instalacoes.trechos).forEach(function (t) { var a0 = gerados[String(t.id)]; if (a0 && (d2(t.p1, pc) <= rC || d2(t.p2, pc) <= rC)) { var inf = lista.filter(function (o) { return o.ambInfo && o.ambInfo.id === a0; }).pop(); if (inf) ambs[a0] = inf.ambInfo; } });
      }
      var temKit = fam && K.kitsDoModelo(c.ops)[id] && K.kitsDoModelo(c.ops)[id].vivos.length;
      if (!Object.keys(ambs).length && !temKit) return null;
      var ops = arr(mov(est0)); if (!ops.length) return null;
      /* a caixa GERADA pelo traçado que o usuário alinhou passa a ser dele (o religar a apagaria e poria no "melhor ponto") */
      if (pc && gerados[id]) {
        var est1p = BE.aplicar(c.ops.concat([{ op: "lote", id: "previa", ops: ops }])), nv = arr(est1p.instalacoes.pecas).filter(function (k) { return String(k.id) === id; })[0];
        if (nv) { var o2 = { op: "peca", id: id, peca: nv.peca, sistema: nv.sistema, dn: nv.dn, x: nv.x, y: nv.y, z: nv.z, amb: gerados[id], ambParte: "reaproveitada" }; ops = ops.concat([{ op: "apagar", id: id, amb: gerados[id], ambParte: "reaproveitada" }, o2]); }
      }
      var todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]), est2 = BE.aplicar(todos);
      if (temKit) K.reconciliar({ estado: est2, avaliarFam: c.avaliarFam, ops: todos, vizinhos: U._vizinhos(est2), parametros: U.parametros() }).forEach(function (a) {
        if (a.famInst !== id || a.acao !== "atualizar") return;
        a.ops.forEach(function (o) { ops.push(o); }); todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]); est2 = BE.aplicar(todos);
      });
      var falhou = false;
      Object.keys(ambs).forEach(function (aid) {
        var seed = arr(ambs[aid].aparelhos).filter(function (x) { return arr(est2.familias).some(function (f) { return String(f.id) === x; }); })[0]; if (!seed || falhou) return;
        var R = A.ligar({ estado: est2, avaliarFam: c.avaliarFam, ops: todos, famInst: seed, parametros: U.parametros() });
        /* ⚠ o traçado NÃO fecha com a peça no lugar novo (a caixa encostada na parede, sem saída): não refaz — o religar já teria
           tirado o traçado velho e o ambiente ficaria sem tubo. Volta null e quem chamou usa o arraste (os tubos acompanham) */
        if (!R.ok || !R.rota) { falhou = true; return; }
        if (R.ops.length) { U._marcar(R); R.ops.forEach(function (o) { ops.push(o); }); todos = c.ops.concat([{ op: "lote", id: "previa", ops: ops.slice() }]); est2 = BE.aplicar(todos); }
      });
      if (falhou) return null;
      if (arr(est2.hidRedes).length) { var RR = U._redes(c.ops, est2, c.avaliarFam, ops); RR.ops.forEach(function (o) { ops.push(o); }); }
      return ops;
    },
    /* o grupo hidro carrega SOB DEMANDA, depois da casca do BIM ter registrado a fita (js/gestao.js _bimCascaAcoes): sem
       isto o comando e o atalho TA não existiam ("sem comando" na e2e). Registra na hora em que o arquivo chega. */
    _registrarTarde: function () {
      try {
        var R = global.BimRibbon, Cm = global.BimCmd; if (!R || !Cm || !R.aba || !R.aba("instalacoes") || R.comando(U.ID_CMD)) return false;
        var reg = {}; U.registrar(reg, R); Cm.registrar(reg);
        var Sh = global.BimShell; if (Sh && Sh.pintarFita && Sh._raiz) Sh.pintarFita();
        return true;
      } catch (e) { return false; }
    },
    /* BimFita.aplicarContexto pergunta: o painel extra da seleção (null = nada); rot = o nome da aba contextual */
    _ctxExtra: function (uids) {
      var c = U._ctx(); if (!c || !arr(uids).length) return null;
      if (U._caixaSel(c, uids)) return { nome: "Projeto inteligente", ids: [U.ID_BAR], rot: "Reservatório" };   /* FRENTE H8: a caixa d'água selecionada */
      var e = U.escopo(c, uids); if (e.erro) return null;
      return { nome: "Projeto inteligente", ids: [U.ID_CMD], rot: e.tipo === "ambiente" ? "Ambientes" : "Aparelhos" };
    },
    /* o botão direito no ambiente (ou num aparelho) — js/gestao.js _nivAquiLigarMenu */
    itensMenu: function (o) {
      o = o || {};
      var c = U._ctx(); if (!c) return [];
      var cxM = o.uid ? U._caixaSel(c, [String(o.uid)]) : null;   /* FRENTE H8: botão direito na caixa d'água */
      if (cxM) return [{ id: "hid-montar-barrilete", rotulo: "Montar barrilete", fn: function () { U.montarBarrilete({ caixa: cxM }); } }];
      if (!U._aparelhosDe(c).length) return [];
      var K = dep("HidKit"), uid = o.uid ? String(o.uid) : null, alvo = null;
      if (uid) { var e1 = U.escopo(c, [uid]); if (!e1.erro) alvo = [uid]; }
      var p = o.ponto ? { x: o.ponto[0], z: o.ponto[1] } : null;
      if (!alvo && !p && o.ev && c.b.precisao) { try { var api = c.b.precisao(), q = api && api.planoPonto ? api.planoPonto(o.ev.clientX, o.ev.clientY) : null; if (q) p = { x: q.x, z: q.z }; } catch (eP) {} }
      if (!alvo && p) { var a = K._int.ambienteDe(c.estado, p); if (a && !U.escopo(c, ["edit:" + a.id]).erro) alvo = ["edit:" + a.id]; }
      if (!alvo) return [];
      return [{ id: "hid-tracar-auto", rotulo: "Traçar automaticamente (TA)", fn: function () { U.tracarAuto({ uids: alvo }); } }];
    },
    /* o botão grande no topo do painel Instalações (js/hidcalcui.js) */
    htmlTopo: function () {
      return '<div data-hid="kit-tracar-topo" style="margin:8px 0;padding:8px 10px;border:1px solid rgba(56,189,248,.55);border-radius:10px;background:rgba(56,189,248,.08)">' +
        '<button class="btn primary" data-hid="kit-tracar" style="width:100%;min-height:36px;font-weight:600" title="Atalho TA">Traçar automaticamente</button>' +
        '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Colocou a caixa sifonada, o vaso, o lavatório e o chuveiro? Clique no ambiente (ou nos aparelhos) e aqui: os kits, a caixa sifonada (a sua é aproveitada), a ventilação, o ramal DN 100 e a água pela parede. Você vê a prévia antes; Tab alterna a opção; um Ctrl+Z desfaz.</p></div>';
    },

    /* ---------------- o bloco no painel Instalações (js/hidcalcui.js) */
    html: function () {
      var u = U.ultimo, h = '<div data-hid="kit" style="margin-top:12px;border-top:1px solid rgba(127,127,127,.25);padding-top:8px"><b>Projeto inteligente</b>';
      h += '<p class="muted" style="font-size:11.5px;margin:2px 0 6px">Posicione o aparelho e o kit nasce junto (válvula com a prumada até a laje, registro, pontos e esperas pelas alturas da Tigre e do catálogo da louça). Com o 2º aparelho do cômodo, o ambiente se liga sozinho: caixa sifonada, ventilação pela NBR 8160 e ramal DN 100.</p>';
      h += '<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" data-hid="kit-auto"' + (U.ligado ? " checked" : "") + "> Kit automático ao posicionar e ligar o ambiente</label>";
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><button class="btn sm" data-hid="kit-ligar" title="Liga o cômodo do aparelho selecionado (ou do último colocado)">Ligar ambiente</button>' +
           '<button class="btn sm ghost" data-hid="kit-gerar" title="Gera o kit dos aparelhos que já estavam no modelo">Gerar kits dos aparelhos</button></div>';
      /* LINHA DA REDE + viga baldrame */
      var bp = U.baldrameParam || {}, fmtB = function (v) { return v == null ? "" : String(v).replace(".", ","); };
      h += '<div data-hid="kit-rede" style="margin:8px 0 4px;font-size:12px"><b>Linha da rede</b> <span class="muted">— desenhe o eixo do coletor com o Tubo de esgoto (no sentido da saída), selecione e use como linha: cada ambiente se liga a ela e o coletor segue com inclinação até as caixas de inspeção (mudança de direção, junção, distância máxima e saída — NBR 8160).</span>' +
           '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><button class="btn sm" data-hid="kit-rede-sel">Usar o traço selecionado como linha da rede</button><button class="btn sm ghost" data-hid="kit-rede-refazer">Refazer a rede</button></div>' +
           '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">Viga baldrame: <button class="btn sm' + (U.modoBaldrame === "por_baixo" ? "" : " ghost") + '" data-hid="kit-bald-por_baixo" aria-pressed="' + (U.modoBaldrame === "por_baixo") + '">Passar por baixo (padrão)</button>' +
           '<button class="btn sm' + (U.modoBaldrame === "atravessar" ? "" : " ghost") + '" data-hid="kit-bald-atravessar" aria-pressed="' + (U.modoBaldrame === "atravessar") + '">Atravessar com tubo-camisa</button></div>' +
           '<div data-hid="kit-caixa" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px">Caixa de inspeção: ' +
             [["alvenaria", "Alvenaria 0,60 m (padrão)"], ["premoldado", "Pré-moldada 0,60 m"], ["pvc300", "Dispositivo PVC Ø 300"]].map(function (t) { return '<button class="btn sm' + (U.tipoCaixa === t[0] ? "" : " ghost") + '" data-hid="kit-cx-tipo-' + t[0] + '" aria-pressed="' + (U.tipoCaixa === t[0]) + '"' + (t[0] === "pvc300" ? ' title="A NBR 8160 não aceita o dispositivo de PVC na rede enterrada (pede caixa de 0,60 m ou PV): a pendência fica, com o Corrigir"' : "") + ">" + esc(t[1]) + "</button>"; }).join("") +
             (U.tipoCaixa === "pvc300" ? "" : ' · tampa: ' + [["concreto", "Concreto"], ["ferro", "Ferro fundido"]].map(function (t) { return '<button class="btn sm' + (U.tampaCaixa === t[0] ? "" : " ghost") + '" data-hid="kit-cx-tampa-' + t[0] + '" aria-pressed="' + (U.tampaCaixa === t[0]) + '">' + esc(t[1]) + "</button>"; }).join("")) + "</div>" +
           '<div class="muted" style="margin-top:4px">Sem viga no modelo estrutural, a viga sob as paredes do térreo (m): altura <input data-hid-campo="kit:bald:altura" size="4" value="' + esc(fmtB(bp.altura)) + '"> largura <input data-hid-campo="kit:bald:largura" size="4" value="' + esc(fmtB(bp.largura)) + '"> topo em relação ao piso <input data-hid-campo="kit:bald:topo" size="4" value="' + esc(fmtB(bp.topo)) + '"></div></div>';
      /* NÍVEL AUTOMÁTICO (js/hidnivel.js) */
      h += '<div data-hid="kit-nivel" style="margin:8px 0 4px;font-size:12px"><b>Nível automático</b> <span class="muted">— a tampa/grelha de caixas e ralos fica no piso acabado do ponto: piso/contrapiso modelado, laje do IFC importado, terreno ou calçada; sem nada disso, o nível + o piso acabado padrão:</span> <input data-hid-campo="kit:piso:acabado" size="4" value="' + esc(U.pisoAcabado == null ? "" : String(U.pisoAcabado).replace(".", ",")) + '"> m</div>';
      /* VENTILAÇÃO: a altura de saída (onde vai o terminal) */
      var hvPad = (dep("HidAmbiente") && dep("HidAmbiente").GEO_AMB.alturaSaidaVentilacao) || "";
      h += '<div data-hid="kit-vent" style="margin:8px 0 4px;font-size:12px"><b>Ventilação</b> <span class="muted">— DN pela NBR 8160 (Tabela 8 e Tabela 2), tomada no ramal da caixa sifonada, subida embutida no eixo da parede e terminal na altura de saída acima do piso (o prolongamento acima da cobertura fica para o RT):</span> <input data-hid-campo="kit:vent:altura" size="4" placeholder="' + esc(String(hvPad).replace(".", ",")) + '" value="' + esc(U.alturaVent == null ? "" : String(U.alturaVent).replace(".", ",")) + '"> m</div>';
      /* PAVIMENTO-TIPO (etapa 3) */
      h += '<div data-hid="kit-predio-bloco" style="margin:8px 0 4px;font-size:12px"><b>Pavimento-tipo</b> <span class="muted">— copia a unidade do pavimento mais baixo para os pavimentos que têm as paredes acima; com a parede DIVISÓRIA selecionada, espelha a unidade vizinha. Tubo de queda, coluna de ventilação e coluna de água fria alinhados no shaft; cada unidade se liga sozinha; no térreo o tubo de queda desce até a rede.</span>' +
           '<div style="margin:6px 0"><button class="btn sm" data-hid="kit-predio">Replicar unidade (pavimento-tipo)</button></div></div>';
      if (u) {
        if (u.erro) h += '<p class="muted" style="font-size:12px" data-hid="kit-msg">' + esc(u.erro) + "</p>";
        else if (u.nada) h += '<p class="muted" style="font-size:12px" data-hid="kit-msg">Todos os aparelhos já têm kit.</p>';
        else {
          var R = arr(u.resumo && u.resumo.ambientes)[0];
          h += '<div data-hid="kit-resultado" style="font-size:12px">';
          arr(u.resumo && u.resumo.kits).forEach(function (k) { var g = k.kit; if (!g) return; h += "<details><summary>Kit de " + esc(k.famInst) + " — " + esc(((dep("HidKit").kits()[g.tipo]) || {}).nome || g.tipo) + (g.pendencias.length ? ' <span class="hid-pend">' + g.pendencias.length + " pendência(s)</span>" : "") + "</summary><ul>" + g.decisoes.map(function (d) { return "<li>" + esc(d.texto) + "</li>"; }).join("") + g.pendencias.map(function (p) { return '<li class="hid-pend">pendente: ' + esc(p.motivo) + "</li>"; }).join("") + "</ul></details>"; });
          var Rp = u.resumo && u.resumo.predio;
          if (Rp && Rp.ok) {
            h += '<details open data-hid="kit-predio-res"><summary>Prédio - ' + Rp.unidades.length + " unidade(s), " + Rp.prumadas.length + " shaft(s)" + (Rp.pendencias.length ? ' <span class="hid-pend">' + Rp.pendencias.length + " pendência(s)</span>" : "") + "</summary><ul>" +
              Rp.decisoes.map(function (d) { return "<li>" + esc(d.texto) + "</li>"; }).join("") + Rp.pendencias.slice(0, U.MAX_AVISOS).map(function (p) { return '<li class="hid-pend">pendente: ' + esc(p.motivo) + "</li>"; }).join("") + "</ul></details>";
          }
          arr(u.resumo && u.resumo.redes).forEach(function (Rr) {
            h += '<details open data-hid="kit-rede-res"><summary>Rede - ' + Rr.caixas.length + " caixa(s) de inspeção, " + Rr.ramais.length + " ramal(is)" + (Rr.interferencias.length ? ', <span class="hid-pend">' + Rr.interferencias.length + " furo(s) em viga</span>" : "") + (Rr.pendencias.length ? ' <span class="hid-pend">' + Rr.pendencias.length + " pendência(s)</span>" : "") + "</summary><ul>" +
              Rr.decisoes.map(function (d) { return "<li>" + esc(d.texto) + "</li>"; }).join("") + Rr.pendencias.map(function (p) { return '<li class="hid-pend">pendente: ' + esc(p.motivo) + "</li>"; }).join("") + Rr.avisos.slice(0, U.MAX_AVISOS).map(function (a) { return '<li class="muted">aviso: ' + esc(a.texto) + "</li>"; }).join("") + "</ul></details>";
          });
          if (R) {
            h += '<details open data-hid="kit-ambiente"><summary>Ambiente ' + esc(R.ambiente ? R.ambiente.id : "") + (R.rota ? " — " + esc(R.rota.nome) : "") + (R.pendencias.length ? ' <span class="hid-pend">' + R.pendencias.length + " pendência(s)</span>" : "") + "</summary><ul>" +
              R.decisoes.map(function (d) { return "<li>" + esc(d.texto) + "</li>"; }).join("") + R.pendencias.map(function (p) { return '<li class="hid-pend">pendente: ' + esc(p.motivo) + "</li>"; }).join("") +
              R.avisos.slice(0, U.MAX_AVISOS).map(function (a) { return '<li class="muted">aviso: ' + esc(a.texto) + "</li>"; }).join("") + "</ul></details>";
          }
          h += "</div>";
        }
      }
      return h + "</div>";
    },
    clique: function (a, el) {
      if (a === "kit-rede-sel") { U.usarSelecaoComoLinha(); return true; }
      if (a === "kit-predio") { U.replicarUnidade(); return true; }
      if (a === "kit-rede-refazer") { U.refazerRede(); return true; }
      if (a === "kit-bald-por_baixo" || a === "kit-bald-atravessar") { U.definirBaldrame(a.slice(9)); return true; }   // hid:ok tamanho do prefixo "kit-bald-"
      var mCx = /^kit-cx-(tipo|tampa)-(\w+)$/.exec(a); if (mCx) { U.definirCaixa(mCx[1], mCx[2]); return true; }
      if (a === "kit-tracar") { U.tracarAuto(); return true; }
      if (a === "kit-ligar") { U.ligarAgora(null); return true; }
      if (a === "kit-gerar") { U.gerarKits(); return true; }
      if (a === "kit-auto") { U.alternar(!!(el && el.checked)); return true; }
      return false;
    },
    /* as decisões automáticas que o memorial descreve (kits + ambientes ligados) */
    decisoes: function (estado, avaliarFam, ops) {
      var K = dep("HidKit"); if (!K) return [];
      var out = K.decisoesDoModelo(estado, avaliarFam, ops).map(function (k) { return { elemento: "Kit de " + k.famInst + " — " + k.nome, decisoes: k.decisoes, pendencias: k.pendencias }; });
      var vistos = {};
      var lista = K.achatar(ops), apag = {}; lista.forEach(function (o, i) { if (o.op === "apagar" && o.id != null) apag[o.id] = i; });
      /* FRENTE H8: o barrilete vivo (js/hidbarrilete.js) e os prédios cujas colunas ele ligou (a pendência predio.barrilete fecha) */
      var predLig = {}, barVistos = {};
      lista.forEach(function (o, i) { if (o.barInfo && !(apag[o.id] > i)) arr(o.barInfo.predios).forEach(function (pid) { predLig[pid] = 1; }); });
      lista.slice().reverse().forEach(function (o, ri) { var i = lista.length - 1 - ri; if (o.barInfo && !barVistos[o.barInfo.id] && !(apag[o.id] > i)) { barVistos[o.barInfo.id] = 1; out.push({ elemento: "Barrilete da caixa d'água " + o.barInfo.caixa + " (" + o.barInfo.colunas + " coluna(s))", decisoes: arr(o.barInfo.decisoes), pendencias: arr(o.barInfo.pendencias) }); } });
      lista.slice().reverse().forEach(function (o, ri) { var i = lista.length - 1 - ri; if (o.ambInfo && !vistos[o.ambInfo.id] && !(apag[o.id] > i)) { vistos[o.ambInfo.id] = 1; out.push({ elemento: "Ambiente " + o.ambInfo.id + " (" + arr(o.ambInfo.aparelhos).join(", ") + ")", decisoes: arr(o.ambInfo.decisoes), pendencias: arr(o.ambInfo.pendencias) }); }
        if (o.predioInfo && !vistos["predio:" + o.predioInfo.id] && !(apag[o.id] > i)) { vistos["predio:" + o.predioInfo.id] = 1; out.push({ elemento: "Prédio " + o.predioInfo.id + " (pavimento-tipo: " + o.predioInfo.unidades + " unidade(s), " + o.predioInfo.prumadas + " shaft(s))", decisoes: arr(o.predioInfo.decisoes), pendencias: arr(o.predioInfo.pendencias).filter(function (p) { return !(p.chave === "predio.barrilete" && predLig[o.predioInfo.id]); }) }); }
        if (o.aqInfo && !vistos[o.aqInfo.id] && !(apag[o.id] > i)) { vistos[o.aqInfo.id] = 1; out.push({ elemento: "Água quente (" + arr(o.aqInfo.aquecedores).join(", ") + ")", decisoes: arr(o.aqInfo.decisoes), pendencias: arr(o.aqInfo.pendencias) }); }
        if (o.redeInfo && !vistos["rede:" + o.redeInfo.id] && !(apag[o.id] > i) && arr(estado && estado.hidRedes).some(function (r) { return r.id === o.redeInfo.id; })) { vistos["rede:" + o.redeInfo.id] = 1; out.push({ elemento: "Rede " + o.redeInfo.id + " (linha do coletor, " + o.redeInfo.caixas + " caixa(s) de inspeção)", decisoes: arr(o.redeInfo.decisoes), pendencias: arr(o.redeInfo.pendencias) }); } });
      return out;
    }
  };
  global.HidKitUI = U;
  if (global.document && global.setTimeout) global.setTimeout(function () { U._registrarTarde(); }, 0);   /* TRAÇAR AUTOMATICAMENTE: a fita já montada */
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
