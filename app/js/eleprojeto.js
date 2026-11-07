/* =====================================================================
 * eleprojeto.js — "PROJETO ELÉTRICO COMPLETO" NUM CLIQUE (Elétrica v2, lote L6, 07/11/2026). Motor PURO, ES5, Node-testável.
 *
 * Costura os motores que já existem, na ordem, sobre o MESMO modelo e devolve UM lote só (um Ctrl+Z desfaz tudo):
 *   (a) EleAuto.gerar         pontos de luz, TUG, TUE (com o mobiliário e os aparelhos do modelo) e interruptores junto às portas;
 *   (b) EletIlum.ligar        a ligação da iluminação de cada ambiente que tem luminária (interruptor, eletroduto, fiação lógica);
 *   (c) EleCircuitos.lancar   divide os circuitos, posiciona o quadro (família ele-quadro), traça os eletrodutos (tracar: true) e dimensiona;
 *   (d) o projeto fica GRAVADO no quadro (Projeto_eletrico), e a família monta disjuntores, DR e DPS (EleFamilias.montarQuadro);
 *   (e) EleAuditor + EleCircAuditor conferem o resultado;
 *   (f) o relatório curto: pontos por tipo, circuitos, quadro, demanda, padrão de entrada, pendências.
 *
 *   EleProjeto.gerar({ ops | estado, avaliarFam, criterios, ambientes?, loteId? })
 *     → { ok, motivo?, lote (UM lote; null se nada a mudar), ops, passos[{id, rotulo, ops, mudou}], relatorio, avisos[], pendencias[] }
 *   EleProjeto.relatorio(estado, avaliarFam, criterios) → o relatório do que está no modelo (sem mudar nada)
 *
 * IDEMPOTENTE: depois de cada passo o estado é refeito com as ops (BimEdit.aplicar) e o passo só entra no lote se mudou o estado
 * (comparado por conteúdo): rodar de novo = lote nulo. Os motores já usam ids estáveis (elee-, elel-, lig-<amb>-, elec-, eleq-);
 * este arquivo só garante, por cima, que ninguém duplica. Convergência: o passo (c) roda até não haver mais mudança (no máx. 3 vezes).
 * NÃO escreve em nada que o usuário fez à mão: os motores já respeitam (ponto movido, circuito trocado no ponto, eletroduto manual).
 * Teste: node tools/test-ele-projeto.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function EA() { return dep("EleAuto", "./eleauto.js"); }
  function EI() { return dep("EletIlum", "./eletilum.js"); }
  function EC() { return dep("EleCircuitos", "./elecircuitos.js"); }
  function EAU() { return dep("EleAuditor", "./eleauditor.js"); }
  function ECA() { return dep("EleCircAuditor", "./elecircauditor.js"); }
  function EF() { return dep("EleFamilias", "./elefamilias.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }

  function achatar(ops) { var o = []; arr(ops).forEach(function (x) { if (x && x.op === "lote") arr(x.ops).forEach(function (y) { if (y) o.push(y); }); else if (x) o.push(x); }); return o; }
  /* "o estado mudou?" — pelo conteúdo do que as ops produzem (não pelo número de ops: o religar da iluminação devolve ops que refazem o igual) */
  function assinatura(st) { try { return JSON.stringify([st.familias, st.instalacoes, st.caixas, st.ambientes && st.ambientes.length]); } catch (e) { return String(Math.random()); } }

  /* ----------------------------------------------------------------- o relatório do que está no modelo */
  function relatorio(estado, avaliarFam, criterios) {
    var C = EC(), A = C && estado ? C.analisar({ estado: estado, avaliarFam: avaliarFam, criterios: criterios }) : null, R = { ok: false };
    if (!A) return R;
    if (!A.ok) { R.motivo = A.motivo; R.pendencias = arr(A.pendencias).map(function (p) { return p.texto; }); return R; }
    var porTipo = { luz: 0, interruptor: 0, tug: 0, tue: 0, ld: 0 }, porAmb = {};
    arr(A.pontos).forEach(function (p) {
      var k = p.kind === "ld" || p.kind === "direta" ? "ld" : p.kind; porTipo[k] = (porTipo[k] || 0) + 1;
      var a = porAmb[p.amb] = porAmb[p.amb] || { id: p.amb, nome: p.ambNome, luz: 0, interruptor: 0, tug: 0, tue: 0, ld: 0 };
      a[k] = (a[k] || 0) + 1;
    });
    var qd = A.quadro, mq = null, F = EF(), proj = A.projeto;
    if (F && F.montarQuadro && proj) {
      try {
        var qdf = qd && qd.f ? qd.f : null, avq = null; try { avq = qdf && typeof avaliarFam === "function" ? avaliarFam(qdf.famId, qdf.tipoId, qdf.inst) : null; } catch (e0) { avq = null; }
        var vq = (avq && avq.valores) || {}, capQ = Math.max(1, Math.round(num(vq.Disjuntores, qd && qd.espacos ? qd.espacos : 12)));
        var m = F.montarQuadro(JSON.stringify(proj), { capacidade: capQ, fileiras: Math.max(1, Math.round(num(vq.Fileiras, 1))), capFileira: Math.max(1, Math.round(num(vq.Modulos_fileira, capQ))), disjuntores: capQ });
        mq = { itens: arr(m.itens).length, porTipo: {}, disjuntores: 0, dr: 0, dps: 0, geral: 0, avisos: arr(m.avisos).slice() };
        arr(m.itens).forEach(function (it) { var t = String(it.tipo || ""); mq.porTipo[t] = (mq.porTipo[t] || 0) + 1; });
        mq.disjuntores = mq.porTipo.disj || 0; mq.dr = mq.porTipo.dr || 0; mq.dps = mq.porTipo.dps || 0; mq.geral = mq.porTipo.geral || 0;
      } catch (e) { mq = null; }
    }
    var dm = A.demanda || {}, en = dm.entrada || null;
    R = { ok: true, pontosPorTipo: porTipo, porAmbiente: Object.keys(porAmb).map(function (k) { return porAmb[k]; }), totalPontos: arr(A.pontos).length,
      circuitos: { total: A.circuitos.length, luz: A.circuitos.filter(function (c) { return c.tipo === "luz"; }).length, tug: A.circuitos.filter(function (c) { return c.tipo === "tug"; }).length, tue: A.circuitos.filter(function (c) { return c.tipo === "tue"; }).length, dr: arr(A.drs).length },
      quadro: qd ? { id: qd.id, espacos: qd.espacos || (A.quadroModelo && A.quadroModelo.espacos) || null, modulos: A.modulos, modelo: A.quadroModelo || null, montado: mq } : null,
      dps: A.dps ? { exigido: !!A.dps.exigido, quantidade: A.dps.quantidade || 0 } : null,
      demanda: { instalada_kW: dm.cargaInstalada_kW, demanda_kVA: dm.demanda_kVA, tipo: dm.tipo || null },
      entrada: en ? { faixa: en.faixa, disjuntor_A: en.disjuntor_A } : null,
      geral: A.geral ? { In: A.geral.In, polos: A.geral.polos } : null, alimentador: A.alimentador ? { secao: A.alimentador.secao, comprimento: A.alimentador.comprimento, provisorio: !!A.alimentador.provisorio } : null,
      eletrodutosMetros: 0, pendencias: arr(A.pendencias).map(function (p) { return p.texto; }), avisos: arr(A.avisos).slice() };
    var tr = estado.instalacoes && arr(estado.instalacoes.trechos) || [];
    tr.forEach(function (t) { if (t && t.sistema === "eletrica" && t.p1 && t.p2) R.eletrodutosMetros += Math.sqrt(Math.pow(t.p1.x - t.p2.x, 2) + Math.pow(t.p1.y - t.p2.y, 2) + Math.pow(t.p1.z - t.p2.z, 2)); });
    R.eletrodutosMetros = Math.round(R.eletrodutosMetros * 10) / 10;
    return R;
  }

  /* ----------------------------------------------------------------- o clique */
  function gerar(o) {
    o = o || {};
    var out = { ok: false, motivo: "", lote: null, ops: [], passos: [], relatorio: null, auditoria: null, avisos: [], pendencias: [] };
    var E = BE(), Au = EA(), Ci = EC(), aval = o.avaliarFam;
    if (!E || !Au || !Ci) { out.motivo = "os motores da elétrica não carregaram (eleauto, elecircuitos)."; return out; }
    var base = achatar(o.ops);
    if (!base.length && o.estado) { out.motivo = "passe as ops do modelo (ops), não só o estado: o lote único precisa refazer o estado a cada passo."; return out; }
    var acc = [], estado = E.aplicar(copia(base)), sig = assinatura(estado);
    if (!arr(estado.ambientes).length) { out.motivo = "O modelo não tem ambiente: crie os ambientes (Ambiente › clique na sala) e as paredes antes do projeto elétrico."; return out; }
    function refaz() { return E.aplicar(copia(base.concat(acc))); }
    /* um passo: devolve true se o estado mudou de fato */
    function passo(id, rotulo, ops) {
      ops = achatar(ops); var antes = acc.length;
      acc = acc.concat(copia(ops));
      var st = refaz(), s2 = assinatura(st), mudou = s2 !== sig;
      if (!mudou) acc.length = antes; else { estado = st; sig = s2; }
      out.passos.push({ id: id, rotulo: rotulo, ops: mudou ? ops.length : 0, mudou: mudou });
      return mudou;
    }
    /* (a) pontos */
    var ga = Au.gerar({ estado: estado, avaliarFam: aval, ambientes: o.ambientes || null, criterios: o.criterios, loteId: "ep" });
    if (!ga.ok) { out.motivo = ga.motivo || "o lançamento dos pontos não rodou."; return out; }
    arr(ga.avisos).forEach(function (a) { out.avisos.push(a); }); arr(ga.pendencias).forEach(function (p) {
      var t = p.texto || String(p);
      if (/rode Instalações › Circuitos e quadro/.test(t)) return;   /* o aviso do "Lançar pontos" ("rode os circuitos") não vale aqui: este clique já os roda */
      out.pendencias.push(t);
    });
    passo("pontos", "Pontos elétricos (luz, TUG, TUE, interruptores)", ga.ops || (ga.lote ? ga.lote.ops : []));
    /* (b) ligação da iluminação, ambiente por ambiente (só onde há luminária) */
    var Il = EI();
    if (Il && Il.ligar) {
      arr(estado.ambientes).forEach(function (a) {
        if (!a || !a.calc || arr(a.calc.contorno).length < 3) return;
        if (!arr(estado.familias).some(function (f) { return f && /^ra-luminaria$|^ra-ilum-/.test(String(f.famId)); })) return;
        /* ambiente que JÁ tem a ligação gravada (registro lig-<amb>) fica como está: religar aqui desfaria a alimentação que os circuitos
           acertaram e a 2ª rodada não seria nula; quem quer refazer usa o painel "Ligação da iluminação" */
        if (arr(estado.instalacoes && estado.instalacoes.ligacoes).some(function (r) { return r && (r.amb === a.id || r.id === "lig-" + a.id); })) return;
        var r = null; try { r = Il.ligar({ estado: estado, avaliarFam: aval, ambiente: a.id }); } catch (e) { r = null; }
        if (!r || !r.ok) { if (r && arr(r.pendencias).length) { var q0 = r.pendencias[0]; if (q0 && !/^(ambiente|luminarias)$/.test(String(q0.chave || ""))) out.pendencias.push("Ligação da iluminação de \"" + (a.nome || a.id) + "\": " + (q0.motivo || q0)); } return; }
        passo("ilum-" + a.id, "Ligação da iluminação: " + (a.nome || a.id), r.ops);
        arr(r.pendencias).forEach(function (q) { if (q && /^(interruptor|luminarias|teto)/.test(String(q.chave || ""))) out.pendencias.push("Ligação da iluminação de \"" + (a.nome || a.id) + "\": " + q.motivo); });
      });
    }
    /* (c)+(d) circuitos, quadro, eletrodutos e o projeto gravado no quadro — até convergir */
    var rl = null, voltas = 0, motivoC = "";
    for (var v = 0; v < 3; v++) {
      rl = Ci.lancar({ estado: estado, avaliarFam: aval, criterios: o.criterios, loteId: "ep" + v, tracar: true });
      voltas++;
      if (!rl.ok) { motivoC = rl.motivo || "os circuitos não rodaram."; break; }
      arr(rl.avisos).forEach(function (a) { if (out.avisos.indexOf(a) < 0) out.avisos.push(a); });
      if (!rl.lote || !passo("circuitos" + v, "Circuitos, quadro e eletrodutos" + (v ? " (acerto " + v + ")" : ""), rl.ops)) break;
    }
    if (motivoC && !out.passos.some(function (p) { return /^circuitos/.test(p.id) && p.mudou; })) { out.motivo = motivoC; out.relatorio = { ok: false, motivo: motivoC, pendencias: out.pendencias.slice() }; return out; }
    if (motivoC) out.pendencias.push(motivoC);
    out.ops = acc.slice();
    out.lote = acc.length ? { op: "lote", id: "eleproj-" + (o.loteId || Date.now().toString(36)), origem: "eletrica-projeto", pedido: "Projeto elétrico completo", ops: acc.slice() } : null;
    /* (e) auditoria sobre o estado final */
    var Ad = EAU(), Ac = ECA(), aud = { pontos: [], circuitos: [] };
    try { if (Ad) aud.pontos = Ad.auditar({ estado: estado, avaliarFam: aval, criterios: o.criterios }).problemas; } catch (e1) { aud.pontos = []; }
    try { if (Ac) aud.circuitos = Ac.auditar({ estado: estado, avaliarFam: aval, criterios: o.criterios }).problemas; } catch (e2) { aud.circuitos = []; }
    function cont(L, g) { return L.filter(function (p) { return g === "erro" ? p.gravidade === "erro" : p.gravidade !== "erro"; }).length; }
    out.auditoria = { pontos: { erros: cont(aud.pontos, "erro"), avisos: cont(aud.pontos, "aviso") }, circuitos: { erros: cont(aud.circuitos, "erro"), avisos: cont(aud.circuitos, "aviso") },
      problemas: aud.pontos.concat(aud.circuitos).map(function (p) { return { codigo: p.codigo, gravidade: p.gravidade, titulo: p.titulo }; }) };
    /* (f) o relatório */
    var rep = relatorio(estado, aval, o.criterios);
    rep.auditoria = out.auditoria; rep.passos = out.passos.slice(); rep.voltas = voltas;
    out.relatorio = rep; out.estadoFinal = estado;
    arr(rep.pendencias).forEach(function (t) { if (out.pendencias.indexOf(t) < 0) out.pendencias.push(t); });
    out.ok = true;
    return out;
  }

  var EleProjeto = { gerar: gerar, relatorio: relatorio, achatar: achatar };
  global.EleProjeto = EleProjeto;
  if (typeof module !== "undefined" && module.exports) module.exports = EleProjeto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
