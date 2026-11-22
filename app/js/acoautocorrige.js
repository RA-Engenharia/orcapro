/* =====================================================================
 * acoautocorrige.js — AUTOCORREÇÃO DO CÁLCULO DA ESTRUTURA METÁLICA (motor PURO, ES5, sem DOM, Node-testável). 21/11/2026.
 *
 * Pedido do Rogério (21/11/2026): "o módulo de cálculo da estrutura metálica deve ser capaz de solucionar os problemas que
 * encontrar através de automação e corrigir de uma vez; aí somem todos os erros".
 * Antes: o otimizador (AcoDimLivre.calcular com otimizar) só trocava o perfil da BARRA; os nós de tubo (js/metalnostubo.js), os
 * nós com chapa (js/metalchapano.js), o mecanismo (js/acoresolverlivre.js só PROPUNHA) e as ligações (js/metalligdim.js) eram
 * verificados DEPOIS e não voltavam ao laço. O modelo de motor é o js/hidautocorrige.js (HidAutoCorrigir.rodar).
 *
 *   AcoAutoCorrigir.rodar(io, opc) → { convergiu, voltas, aplicadas[], pendencias[], resultado, entrada, relatorio[], tempoMs }
 *
 *   io = {
 *     entrada                 a entrada do cálculo (a da tela: caixas, apoios, ligações, cargas…) — o motor trabalha numa CÓPIA;
 *     calcular(ent[, fim])    → o resultado do AcoDimLivre.calcular(ent). Com 2 parâmetros é ASSÍNCRONO (Worker): chama fim(r);
 *     ligacoes?(r, ent)       → { entrada, texto } | null — põe no modelo (na cópia) o que o js/metalligdim.js dimensionou
 *                               (placas, chumbadores, parafusos, enrijecedores): na tela, o pórtico da biblioteca refeito com
 *                               r.ligDim.modelo; sem ele as ligações desatualizadas viram pendência;
 *     resolver?(ent, sols)    → o AcoResolverLivre.resolver (padrão: o do motor, na página);
 *     progresso?(p)           p = { volta, de, etapa, texto };
 *     cancelado?()            → true para parar (o que já foi calculado volta, nada é aplicado pela tela)
 *   }
 *   opc = { voltas?: 5, otimizar?: true, aoFim?(res) (o caminho assíncrono) }
 *
 * EM CADA VOLTA (até `voltas`; a MESMA correção duas vezes = não converge, para):
 *   1. calcula com o otimizador (a barra que não passa já sai trocada pelo mais leve da família que atende);
 *   2. classifica o que ainda reprova:
 *      · barra ............ o otimizador resolveu (as trocas dele entram na cópia); sem perfil maior na família → pendência;
 *      · nó de tubo ....... o banzo (ou a barra da alma) sobe DENTRO DA FAMÍLIA para o mais leve que faz o nó passar —
 *                           MetalNosTubo.precisa refaz a verificação do nó com cada candidato (parede ≥ 2,5 mm e b/t ≤ 35,
 *                           a mesma regra do otimizador; β e os limites de validade pelo próprio verificador);
 *      · nó com chapa ..... a chapa de nó (a folga da 2L) sobe para a espessura seguinte (6,35 → 8 → 9,53 mm), em todas as 2L
 *                           com a mesma folga (a chapa não muda de espessura no meio da treliça);
 *      · mecanismo ........ a solução mais leve do AcoResolverLivre (testada: o cálculo inteiro numa cópia) é APLICADA;
 *      · ligação/placa .... io.ligacoes (o dimensionamento do js/metalligdim.js vai para o modelo);
 *      · ligação que não cabe (reprovada na peça) ... a peça sobe para o vizinho mais pesado da família (a regra do joelho do
 *                           js/acodimensionar.js: a mesa/aba que não cabe pede perfil maior);
 *   3. aplica tudo num LOTE na cópia e volta ao 1. A peça que subiu pelo NÓ entra em entrada.fixos: o otimizador não a desce.
 * REGRAS: toda correção é RECALCULADA (a volta seguinte é o teste); a que PIORA (mais falhas, mais "não verificado", ou mais peso
 * sem ganhar aprovação) é desfeita e proibida; o que não tem correção automática sai em PENDÊNCIA em palavras simples, no
 * formato do js/problemacard.js (o que é, a peça para "Mostrar no 3D", o que fazer) — nada some calado, nada vira "ok" sem cálculo.
 * ⚠ Nenhum número de norma aqui: a resistência do nó, da chapa e da ligação vem dos motores; as espessuras de chapa são as do
 *   catálogo (js/perfisaco.js, AM-2L).
 * Teste: node tools/test-aco-autocorrige.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function DL() { return dep("AcoDimLivre", "./acodimlivre.js"); }
  function NT() { return dep("MetalNosTubo", "./metalnostubo.js"); }
  function RS() { return dep("AcoResolverLivre", "./acoresolverlivre.js"); }
  function Cri() { return dep("MetalCriar", "./metalcriar.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  var VOLTAS = 5;   // aco:ok máximo de voltas (pedido: N = 5)
  var seqId = 0, NOVO_ID = null;   /* o id das peças novas: io.novoId (o do editor) quando vem */
  var FOLGAS_2L = ["6,35", "8", "9,53"];   // aco:ok as folgas (chapa de nó) que o catálogo AM-2L tem (js/perfisaco.js)
  /* metalAjustar (js/metalpeca.js GEOM_AJUSTAR): o que a troca de perfil refaz; o resto da caixa é IDENTIDADE e fica */
  var GEOM = { tipo: 1, ifc: 1, b2: 1, metal: 1, cx: 1, cy: 1, cz: 1, comprimento: 1, altura: 1, espessura: 1, rotY: 1, volume: 1, massa: 1, area: 1, medidas: 1 };

  /* ================================================================ A PEÇA COM OUTRO PERFIL (na cópia, como o metalAjustar) */
  function trocarCaixa(c, para) {
    var MC = Cri(); if (!MC || !c) return { erro: "motor das peças (js/metalcriar.js) não carregou" };
    if ((c.tipo === "pilar" || c.tipo === "viga") && !c.metal) {
      var C0 = Cat(), pf = C0 && C0.paraPerfil ? C0.paraPerfil(para) : null; if (!pf) return { erro: para + " sem perfil no catálogo" };
      var n0 = copia(c); n0.perfil = pf; n0.material = "aco"; return { caixa: n0 };
    }
    var cat = MC.perfilCat(para); if (!cat) return { erro: para + " não é desenhável no 3D" };
    var e = MC.editar(c, { cat: cat }); if (!e || e.erro || !e.caixa) return { erro: (e && e.erro) || "troca recusada" };
    var nv = copia(e.caixa);
    Object.keys(c).forEach(function (k) { if (!GEOM[k] && !(k in nv)) nv[k] = copia(c[k]); });
    ["lig", "soldadaEm", "solda", "nome", "calc"].forEach(function (k) { if (c.metal && c.metal[k] != null && nv.metal[k] == null) nv.metal[k] = copia(c.metal[k]); });
    nv.id = c.id;
    return { caixa: nv };
  }
  function perfilDe(c) { var m = c && c.metal; return m && m.perfil ? txt(m.perfil.cat || m.perfil.nome || "") : txt(c && c.perfil || ""); }
  /* a chave da peça que sobrevive ao pórtico refeito (ids novos): papel + nome + linha (mm) */
  function chave(c) {
    var MC = Cri(), li = null; try { li = MC && MC.linhaAtual ? MC.linhaAtual(c) : null; } catch (e) { li = null; }
    var r3 = function (p) { return p ? p.map(function (v) { return Math.round(v * 1000); }).join(",") : ""; };
    return [txt(c && c.metal && c.metal.papel), txt(c && (c.metal && c.metal.nome || c.nome)), li ? r3(li.a) + ";" + r3(li.b) : txt(c && c.id)].join("|");
  }
  /* aplica { trocas: [{ peca, para }], novas: [{ a, b, cat }], estado } na entrada (cópia) */
  function aplicar(ent, lote) {
    var e = copia(ent), erros = [], cx = arr(e.caixas), por = {};
    cx.forEach(function (c, i) { if (c) por[String(c.id)] = i; });
    arr(lote.trocas).forEach(function (t) {
      var i = por[String(t.peca)]; if (i == null) { erros.push("peça " + t.peca + " não está no modelo"); return; }
      var x = trocarCaixa(cx[i], t.para); if (x.erro) { erros.push(t.peca + ": " + x.erro); return; }
      cx[i] = x.caixa;
    });
    if (arr(lote.novas).length || lote.estado) {
      var R0 = RS(), sol = { id: lote.solId || "auto", novas: lote.novas, estado: lote.estado };
      var ap = R0 ? R0.aplicarNaEntrada({ caixas: cx, ids: e.ids, apoios: e.apoios, ligacoes: e.ligacoes }, sol) : { erro: "resolver não carregou" };
      if (ap.erro && !ap.entrada) erros.push(ap.erro);
      if (ap.entrada) {
        /* as peças NOVAS (o X completado) ganham id do editor — o "resolver-1" do Resolver colidiria com o de uma correção anterior */
        var antes = {}; cx.forEach(function (c) { if (c) antes[String(c.id)] = true; });
        var ren = {}; ap.entrada.caixas.forEach(function (c) { if (c && !antes[String(c.id)]) { var nid = String(NOVO_ID()); ren[String(c.id)] = nid; c.id = nid; } });
        cx = ap.entrada.caixas; e.ids = Array.isArray(ap.entrada.ids) ? ap.entrada.ids.map(function (id) { return ren[String(id)] || id; }) : ap.entrada.ids; e.apoios = ap.entrada.apoios; e.ligacoes = ap.entrada.ligacoes;
      }
    }
    e.caixas = cx;
    e.fixos = arr(e.fixos).concat(arr(lote.fixos).map(String)).filter(function (x, k, a) { return a.indexOf(x) === k; });
    return { entrada: e, erros: erros };
  }

  /* ================================================================ COMPARAR (nunca aplicar o que piora) */
  function nota(r) {
    if (!r || r.ok !== true) return { ok: false, falhas: Infinity, nv: Infinity, peso: Infinity, aprovado: false };
    return { ok: true, falhas: num(r.falhas, 0), nv: arr(r.naoVerificados).length, peso: num(r.peso, 0), aprovado: !!r.aprovado };
  }
  /* o novo é PIOR que o velho? */
  function piora(rn, rv) {
    var n = nota(rn), v = nota(rv);
    if (!v.ok) return !n.ok && false;   /* do que não fechava, qualquer coisa que feche é ganho; não fechar de novo não é "piora" */
    if (!n.ok) return true;
    if (n.falhas > v.falhas) return true;
    if (n.falhas < v.falhas) return false;
    if (n.nv > v.nv) return true;
    if (n.nv < v.nv) return false;
    if (n.aprovado && !v.aprovado) return false;
    return n.peso > v.peso + 0.5 && !n.aprovado;   // aco:ok 0,5 kg de tolerância numérica do peso
  }

  /* ================================================================ OS ACHADOS → AS CORREÇÕES */
  function mapaPecas(r) {
    var m = {}, porId = {};
    arr(r && r.modelo && r.modelo.pecas).forEach(function (p) { m[String(p.id)] = p; });
    arr(r && r.modelo && r.modelo.membros).forEach(function (mb) { porId[String(mb.id)] = mb; });
    return { pecas: m, membros: porId };
  }
  function familiaAcima(nome, filtro) {
    var D = DL(), C = Cat(), x0 = C && C.obter(nome); if (!D || !D.familia || !x0) return [];
    return D.familia(nome).map(function (n) { return C.obter(n); }).filter(function (x) { return x && x.nome !== x0.nome && num(x.massa, 0) > num(x0.massa, 0) && (!filtro || filtro(x)); })
      .sort(function (a, b) { return num(a.massa, 0) - num(b.massa, 0); }).map(function (x) { return x.nome; });
  }
  /* a regra do otimizador para tubo de nó soldado (js/acodimlivre.js tuboNoOk): parede ≥ 2,5 mm e b/t ≤ 35 (circular ≤ 50) */
  function tuboNoOk(x) { if (!x || !/^tubo/.test(x.forma)) return true; var t = num(x.t, 0), b = Math.max(num(x.h, 0), num(x.b, 0), num(x.d, 0)); return t >= 2.5 - 1e-9 && b / t <= (x.forma === "tubo-circ" ? 50 : 35) + 1e-9; }   // aco:ok EN 1993-1-8 7.1.1 / Tabela 7.8 (a mesma do acodimlivre)
  /* candidatos do nó de tubo: primeiro a PAREDE (mesmo h × b, t maior), depois o resto da família pelo peso; até 40 (aco:ok teto de tentativas) */
  function candTubo(nome) {
    var C = Cat(), x0 = C && C.obter(nome), l = familiaAcima(nome, tuboNoOk); if (!x0) return l.slice(0, 40);
    var mesma = l.filter(function (n) { var x = C.obter(n); return x && Math.abs(num(x.h, 0) - num(x0.h, 0)) < 1e-6 && Math.abs(num(x.b, 0) - num(x0.b, 0)) < 1e-6 && Math.abs(num(x.d, 0) - num(x0.d, 0)) < 1e-6; });
    return mesma.concat(l.filter(function (n) { return mesma.indexOf(n) < 0; })).slice(0, 40);
  }
  function sig(o) { return o.tipo + ":" + o.peca + "→" + o.para; }

  function diamDe(id) {   /* "M20" → 20; 7/8" ou 1.1/8" (polegada) → mm */
    var x = txt(id).replace(/"/g, "").trim(), m = /^M(\d+)/.exec(x), v = 0, ok = false; if (m) return +m[1];
    x.split(/[ .]/).forEach(function (q) { var fr = /^(\d+)\/(\d+)$/.exec(q); if (fr) { v += +fr[1] / +fr[2]; ok = true; } else if (/^\d+$/.test(q)) { v += +q; ok = true; } });
    return ok ? v * 25.4 : 0;   // aco:ok polegada = 25,4 mm
  }
  /* as placas de base do MODELO menores que as que o cálculo pede (r.ligDim.modelo.placas) */
  function placasFinas(r, ent) {
    var out = [], P = r && r.ligDim && r.ligDim.modelo && r.ligDim.modelo.placas; if (!P) return out;
    var vistos = {};
    arr(ent && ent.caixas).forEach(function (c) {
      var s = c && c.ligInfo && c.ligInfo.ligDim; if (!s || s.tipo !== "placa" || vistos[s.chave]) return;
      var q = P[s.chave]; if (!q) return; vistos[s.chave] = true;
      var falta = num(s.t, 0) < num(q.t, 0) - 1e-9 || num(s.nChumb, 0) < num(q.nChumb, 0) || num(s.ancoragem, 0) < num(q.ancoragem, 0) - 1e-9 || diamDe(s.parafuso) < diamDe(q.parafuso) - 1e-6;
      if (falta) out.push({ peca: String(c.id), chave: s.chave, texto: "placa " + br(num(s.t, 0) * 1000, 1) + " mm no modelo, o cálculo pede " + br(num(q.t, 0) * 1000, 1) + " mm, " + q.nChumb + " × " + q.parafuso });
    });
    return out;
  }
  /* o pórtico REFEITO (ids novos): as trocas de perfil que a autocorreção já fez voltam pela chave da peça (papel + nome + linha) */
  function reaplicar(nova, velha) {
    var e = copia(nova), V = {}, fixV = {}, fix = [];
    arr(velha && velha.fixos).forEach(function (id) { fixV[String(id)] = true; });
    arr(velha && velha.caixas).forEach(function (c) { if (c && c.tipo === "metal" && c.metal && c.metal.kind === "perfil") V[chave(c)] = c; });
    e.caixas = arr(e.caixas).map(function (c) {
      var o = c && V[chave(c)]; if (!o) return c;
      if (fixV[String(o.id)]) fix.push(String(c.id));
      var pv = perfilDe(o); if (!pv || pv === perfilDe(c)) return c;
      var x = trocarCaixa(c, pv); return x.erro ? c : x.caixa;
    });
    e.fixos = fix; if (velha && velha.otimizar != null) e.otimizar = velha.otimizar;
    return e;
  }
  /* o que fazer com o resultado r → { lote: { trocas, novas, estado, fixos, ligacoes }, itens: [{ tipo, texto, sig }], pend: [] } */
  function classificar(r, ent, proib, io) {
    var L = { trocas: [], novas: [], estado: null, fixos: [], ligacoes: false }, itens = [], porPeca = {};
    function trocar(tipo, peca, de, para, texto, fixo) {
      var o = { tipo: tipo, peca: String(peca), de: de, para: para };
      if (proib[sig(o)] || porPeca[o.peca]) return false;
      porPeca[o.peca] = true; L.trocas.push({ peca: o.peca, para: para }); if (fixo) L.fixos.push(o.peca);
      itens.push({ tipo: tipo, texto: texto, peca: o.peca, de: de, para: para, sig: sig(o) }); return true;
    }
    /* MECANISMO (a análise não fecha) */
    if (!r || r.ok !== true) {
      var pr = arr(r && r.problemas)[0], R0 = RS();
      var sols = pr ? arr(pr.solucoes).filter(function (s) { return R0 && R0.TESTAVEIS[s.id] && !proib["mecanismo:" + s.id]; }) : [];
      if (pr && sols.length) {
        var e0 = copia(ent); e0.otimizar = false;
        var z = io.resolver ? io.resolver(e0, sols) : R0.resolver(e0, sols, { limiteMs: 60000 });   // aco:ok 60 s para testar as soluções
        var s = z && z.proposta ? sols.filter(function (q) { return q.id === z.proposta; })[0] : null;
        if (s) {
          if (arr(s.novas).length) L.novas = copia(s.novas);
          var est = R0.estadoDe(s); if (est) L.estado = est;
          arr(s.trocas).forEach(function (t) { L.trocas.push({ peca: String(t.peca), para: t.para }); });
          L.solId = s.id;
          itens.push({ tipo: "mecanismo", texto: "Mecanismo: " + String(s.texto).split(" — ")[0] + " (testada: a análise fecha" + (z.porque ? "; " + String(z.porque).split(".")[0] : "") + ")", sig: "mecanismo:" + s.id, pecas: arr(pr.pecas) });
        }
      }
      return { lote: L, itens: itens };
    }
    var MP = mapaPecas(r), C = Cat();
    /* X INCOMPLETO: a análise fecha, mas há barra redonda em diagonal SEM a do outro sentido (comprimida ela sai do modelo e reprova)
       — as soluções locais do Resolver (completar o X, trocar por cantoneira/tubo), testadas, e a mais leve é aplicada */
    var R1 = RS();
    if (!r.aprovado && R1 && R1.diagonaisSemPar && !proib["x-incompleto"]) {
      var semPar = []; try { semPar = R1.diagonaisSemPar(r.modelo); } catch (eS) { semPar = []; }
      if (semPar.length) {
        var sm = R1.solucoesMecanismo(r.modelo, "").solucoes.filter(function (s) { return R1.LOCAIS[s.id] && !proib["mecanismo:" + s.id]; });
        var e1 = copia(ent); e1.otimizar = false;
        var z1 = sm.length ? (io.resolver ? io.resolver(e1, sm) : R1.resolver(e1, sm, { limiteMs: 60000 })) : null;   // aco:ok 60 s para testar as soluções
        var s1 = z1 && z1.proposta ? sm.filter(function (q) { return q.id === z1.proposta; })[0] : null;
        if (s1) {
          if (arr(s1.novas).length) L.novas = copia(s1.novas);
          arr(s1.trocas).forEach(function (t) { L.trocas.push({ peca: String(t.peca), para: t.para }); porPeca[String(t.peca)] = true; });
          L.solId = s1.id;
          itens.push({ tipo: "mecanismo", texto: "X incompleto (" + semPar.length + " diagonal(is) de barra redonda sem par): " + String(s1.texto).split(" — ")[0].split(". ")[0], sig: "mecanismo:" + s1.id, pecas: semPar.map(function (d) { return d.peca; }) });
        }
      }
    }
    /* BARRA: as trocas do otimizador (r.pecas de → para) entram na cópia — é o próprio resultado, não precisa de teste */
    var barras = [];
    Object.keys(r.pecas || {}).forEach(function (id) { var t = r.pecas[id]; if (t && t.mudou && t.para) barras.push({ peca: String(id), para: t.para, de: t.de, membro: t.membro }); });
    /* NÓ DE TUBO: o banzo/a alma sobe na família até o nó passar (refeito pelo verificador do nó com cada candidato) */
    var N0 = NT();
    if (r.nosTubo && (r.nosTubo.reprovados || r.nosTubo.naoVerificados) && N0 && N0.precisa) {
      var pq = N0.precisa(r, { candidatos: candTubo, proibido: function (peca, para) { return !!proib[sig({ tipo: "no-tubo", peca: peca, para: para })]; } });
      arr(pq.trocas).forEach(function (t) { trocar("no-tubo", t.peca, t.de, t.para, "Nó de tubo " + t.nos.slice(0, 3).join(", ") + (t.nos.length > 3 ? "…" : "") + ": " + (t.papel === "alma" ? "barra da alma " : "banzo ") + t.de + " → " + t.para + " (" + t.motivo + ")", true); });
    }
    /* PONTA DE TUBO SOLDADA NO U (js/metaltubou.js, ramo claude/metal-tubo-u — GANCHO OPCIONAL: só roda se o MetalTuboU existir).
       A troca de parede muda a BARRA: entra como correção de nó/ponta (fica fixa; a volta seguinte é o teste; o que piorar é desfeito).
       Formato esperado de cada troca: { peca, de?, para, motivo? } (de MetalTuboU.trocasDeParede(res)). */
    var TU = dep("MetalTuboU", "./metaltubou.js");
    if (TU && typeof TU.trocasDeParede === "function") {
      var vtu = null, ttu = [];
      try {
        vtu = (r.nosTubo && r.nosTubo.tuboU) || r.tuboU || (typeof TU.verificar === "function" ? TU.verificar(r) : r);
        /* 22/11/2026 (junção): trocasDeParede devolve { membro: perfil } — vira [{ peca, para, motivo }] pela peça do membro */
        var mtu = TU.trocasDeParede(vtu) || {}, jaTU = {};
        ttu = Array.isArray(mtu) ? mtu : Object.keys(mtu).map(function (mid) {
          var mb = MP.membros[String(mid)], pc = mb ? String(mb.peca) : null, tr = vtu && vtu.trocas && vtu.trocas[mid];
          if (!pc || jaTU[pc]) return null; jaTU[pc] = true;
          return { peca: pc, para: mtu[mid], motivo: tr ? (tr.obrigatoria ? "reprovada na ponta; só passa trocando a parede" : "parede maior pesa menos que as chapas (+" + tr.dPesoBarra + " kg)") : "" };
        });
      } catch (eTU) { ttu = []; }
      ttu.forEach(function (t) {
        if (!t || t.peca == null || !t.para) return;
        var p0 = MP.pecas[String(t.peca)], de = t.de || (p0 ? p0.cat : "");
        if (!C || !C.obter(t.para) || de === t.para || proib[sig({ tipo: "tubo-u", peca: String(t.peca), para: t.para })]) return;
        trocar("tubo-u", t.peca, de, t.para, "Ponta de tubo soldada no U: " + de + " → " + t.para + (t.motivo ? " (" + txt(t.motivo).slice(0, 90) + ")" : ""), true);
      });
      /* 22/11/2026: a ALMA DO U da coluna é o lado fino (filete mínimo maior que a alma, ou a alma não resiste): o U sobe na mesma
         família do catálogo (MetalTuboU.trocasDeU — o mais leve em que todas as pontas reprovadas passam), fica fixo e recalcula;
         o que piorar é desfeito como as outras correções. Membros do mesmo U (uma peça) → o maior pedido. */
      try {
        var mu = typeof TU.trocasDeU === "function" ? TU.trocasDeU(vtu) : {}, porPcU = {};
        Object.keys(mu).forEach(function (mid) {
          var mb = MP.membros[String(mid)], pc = mb ? String(mb.peca) : null; if (!pc) return;
          var q = C && C.obter(mu[mid]), j = porPcU[pc]; if (!q) return;
          if (!j || num(q.A, 0) > num(j.q.A, 0)) porPcU[pc] = { q: q, tr: vtu.trocasU[mid] };
        });
        Object.keys(porPcU).forEach(function (pc) {
          var p0 = MP.pecas[pc], de = p0 ? p0.cat : "", para = porPcU[pc].q.nome, tr = porPcU[pc].tr;
          if (de === para || proib[sig({ tipo: "u-coluna", peca: pc, para: para })]) return;
          trocar("u-coluna", pc, de, para, "U da coluna recebendo tubos: " + de + " → " + para + " (" + txt(tr && tr.motivo).slice(0, 110) + ")", true);
        });
      } catch (eU) { }
    }
    /* NÓ COM CHAPA: a folga da 2L (chapa de nó) sobe uma espessura em todas as 2L com a mesma folga */
    if (r.nosChapa && r.nosChapa.reprovados && C) {
      var folgas = {};
      arr(r.nosChapa.nos).filter(function (o) { return !o.ok; }).forEach(function (o) { arr(o.barras).forEach(function (b) { var m = /ch ([\d,]+)$/.exec(txt(b.perfil)); if (m) folgas[m[1]] = true; }); });
      Object.keys(folgas).forEach(function (f) {
        var k = FOLGAS_2L.indexOf(f), nova = k >= 0 ? FOLGAS_2L[k + 1] : null; if (!nova) return;
        arr(ent.caixas).forEach(function (c) {
          var nm = perfilDe(c), m = /^(2L .* ch )([\d,]+)$/.exec(nm); if (!m || m[2] !== f) return;
          var para = m[1] + nova; if (!C.obter(para)) return;
          trocar("no-chapa", c.id, nm, para, "Nó com chapa: chapa de nó " + f + " → " + nova + " mm (" + r.nosChapa.reprovados + " nó(s) reprovado(s); " + txt(r.nosChapa.pior && r.nosChapa.pior.governante).slice(0, 80) + ")", true);
        });
      });
    }
    /* BARRA FIXA que reprova: a peça subida pelo NÓ (entrada.fixos) o otimizador não mexe — se ela reprova como barra, sobe aqui
       para o vizinho mais pesado da família (o nó só melhora com o perfil maior: é refeito na volta seguinte) */
    var fx = {}; arr(ent.fixos).forEach(function (id) { fx[String(id)] = true; });
    var ruinsB = {}; Object.keys(r.membros || {}).forEach(function (mid) { var v = r.membros[mid]; if (v && v.ok === false) ruinsB[mid] = v; });
    arr(r.servico).forEach(function (sv) { if (sv && sv.razao > 1 && !ruinsB[sv.membro]) ruinsB[sv.membro] = { governante: "deslocamento", razao: sv.razao }; });
    Object.keys(ruinsB).forEach(function (mid) {
      var v = ruinsB[mid];
      var mb = MP.membros[String(mid)], peca = mb ? String(mb.peca) : null; if (!peca || !fx[peca]) return;
      var p0 = MP.pecas[peca], de = p0 ? p0.cat : null; if (!de) return;
      /* 22/11/2026: sobe DIRETO para o primeiro da família com a rigidez (deslocamento: Ix) ou o módulo (resistência: Wx) na proporção
         da razão — um vizinho por volta esgotava as 5 voltas (tubo do Gabriel: terças de borda com flecha de vento local 1,43). A volta
         seguinte é o teste (análise completa); o que piorar é desfeito como sempre. */
      var lista = familiaAcima(de, tuboNoOk).filter(function (n) { return !proib[sig({ tipo: "barra-fixa", peca: peca, para: n })]; }); if (!lista.length) return;
      var C2 = Cat(), x0 = C2 && C2.obter(de), rz = num(v.razao, 1), desl = /desloc|flecha|ELS/i.test(txt(v.governante));
      var cand = (x0 && rz > 1 ? lista.filter(function (n) { var x = C2.obter(n); return x && (desl ? num(x.Ix, 0) >= num(x0.Ix, 0) * rz / 0.95 : num(x.Wx, 0) >= num(x0.Wx, 0) * rz / 0.95); })[0] : null) || lista[0];
      trocar("barra-fixa", peca, de, cand, "Barra " + mid + " (subida pelo nó) reprova como barra (" + txt(v.governante) + " " + br(v.razao, 2) + "): " + de + " → " + cand, true);
    });
    /* LIGAÇÃO QUE NÃO CABE / REPROVADA NA PEÇA: a peça sobe para o vizinho mais pesado da família */
    if (r.ligDim && r.ligDim.reprovados) {
      arr(r.ligDim.ligacoes).filter(function (l) { return !l.ok && l.tipo !== "almaU"; }).forEach(function (l) {
        var mb = l.membro != null ? MP.membros[String(l.membro)] : null, peca = l.peca != null ? String(l.peca) : (mb ? String(mb.peca) : null); if (!peca) return;
        var p0 = MP.pecas[peca], de = p0 ? p0.cat : null; if (!de) return;
        var cand = familiaAcima(de).filter(function (n) { return !proib[sig({ tipo: "ligacao", peca: peca, para: n })]; })[0]; if (!cand) return;
        trocar("ligacao", peca, de, cand, txt(l.nome) + ": a ligação não passa na peça (" + txt(l.governante).slice(0, 90) + ") — perfil " + de + " → " + cand, true);
      });
    }
    /* LIGAÇÕES DO MODELO desatualizadas (placa, chumbador, clip) → o dimensionamento vai para o modelo */
    var desat = arr(r.ligacoesDesatualizadas).length, temaD = arr(r.naoVerificados).some(function (x) { return /Ligações desatualizadas|Ligações da tipologia/.test(x.tema); });
    /* a PLACA DE BASE desenhada (assinatura c.ligInfo.ligDim do js/metalporticosacab.js) menor que a que este cálculo pede: o cálculo
       aprova pelo dimensionamento dele, mas o MODELO (lista de material, pranchas) fica com a placa fina — vai para o modelo também */
    var finas = placasFinas(r, ent);
    if ((desat || temaD || finas.length) && r.ligDim && r.ligDim.modelo && io.ligacoes && !proib["ligacoes:" + desat + ":" + finas.length]) {
      L.ligacoes = true;
      itens.push({ tipo: "ligacoes", texto: "Ligações: parafusos, placas de base e chumbadores dimensionados (NBR 8800) postos no modelo" + (desat ? " (" + desat + " desatualizada(s))" : "") + (finas.length ? " — " + finas.length + " placa(s) de base no modelo abaixo do calculado (" + finas[0].texto + ")" : ""), sig: "ligacoes:" + desat + ":" + finas.length, pecas: finas.map(function (f) { return f.peca; }) });
    }
    return { lote: L, itens: itens, barras: barras };
  }

  /* ================================================================ PENDÊNCIAS EM PALAVRAS SIMPLES (cartão do js/problemacard.js) */
  var SIMPLES = [
    [/rodas|ponte rolante|rolamento|fadiga/i, "Falta a carga das rodas da ponte rolante", "As reações das rodas (máxima, mínima, transversal e longitudinal) vêm do fabricante da ponte. Sem elas a viga de rolamento, os consoles e a fadiga não são verificados. Peça ao fabricante e informe na tipologia."],
    [/vibra/i, "Vibração do piso do mezanino não verificada", "O cálculo não confere a vibração do piso (NBR 8800, Anexo L). Confira à parte ou aumente a rigidez das vigas do piso antes de emitir."],
    [/shed|telhado m[uú]ltiplo|MÚLTIPLO|geminad/i, "Vento do telhado em shed fora da NBR 6123 do sistema", "O telhado múltiplo (shed/geminado) pede as Tabelas 7 e 8 da NBR 6123, que não estão no motor. O vento dessa cobertura precisa ser verificado à parte."],
    [/cone de arrancamento|fretagem|pedestal/i, "Cone de arrancamento dos chumbadores: é projeto de fundação", "O bloco/pedestal, o cone de arrancamento do concreto e a armadura de fretagem são do projeto de fundação, com as reações do memorial. A NBR 8800 não trata isso."],
    [/m[ií]sula/i, "Mísula cônica não verificada", "O cálculo usa a mísula em degraus (a menor altura de cada trecho). A mísula cônica precisa de verificação à parte."],
    [/perfil U \(chapa de nó\)|soldadas no U/i, "Tubos soldados no U da coluna sem verificação da solda", "As pontas de tubo soldadas no U da coluna treliçada não têm verificação automática da chapa de nó e da solda. Use o sistema em cantoneira (verificado) ou dimensione esse nó à parte."],
    [/sobreposto|λov|sobreposi/i, "Nó de tubo com sobreposição fora da faixa de validade", "As barras da alma se sobrepõem pouco no banzo (fora de 25 a 100 %). Mude a geometria da treliça (afastar as barras ou aumentar a sobreposição) — trocar o perfil não resolve."],
    [/esbeltez equivalente|5\.3\.4\.4/i, "Esbeltez equivalente da cantoneira simples à parte", "A cantoneira ligada por uma aba tem uma conta complementar (NBR 8800, 5.3.4.4) que sai à parte e não aprova sozinha."],
    [/alma do U simples|excentricidade/i, "Nó da alma na alma do U simples", "A excentricidade entre os eixos e a solda das barras da alma no U simples não é verificada pelo motor."],
    [/cpe m[eé]dio/i, "Vento local nas terças de borda", "As terças/travessas nas faixas de borda ficaram sem o cpe médio da NBR 6123. Desenhe as terças de borda pela tipologia ou confira à parte."],
    [/vento/i, "Vento não verificado", "Falta o vento da NBR 6123 (local da obra ou fechamento das faces). Complete os dados do vento no passo 1."],
    [/fck/i, "Falta o fck da fundação", "A placa de base engastada precisa do fck do concreto da fundação. Informe no passo 1."]
  ];
  function simples(tema, motivo, extra) {
    var t = txt(tema) + " " + txt(motivo);
    for (var i = 0; i < SIMPLES.length; i++) if (SIMPLES[i][0].test(t)) return { titulo: SIMPLES[i][1], texto: SIMPLES[i][2] + (extra ? " " + extra : "") };
    return { titulo: txt(tema) || "Pendência do cálculo", texto: txt(motivo).slice(0, 400) };
  }
  function pecasDeMembros(r, ids) { var MP = mapaPecas(r), o = []; arr(ids).forEach(function (id) { var m = MP.membros[String(id)]; var p = m ? String(m.peca) : null; if (p && o.indexOf(p) < 0) o.push(p); }); return o; }
  function pendencias(r, logPend) {
    var out = [], vistos = {};
    function add(p) { var k = p.titulo; if (vistos[k]) return; vistos[k] = true; p.tipo = p.tipo || "autocorrigir"; p.gravidade = p.gravidade || "aviso"; p.solucoes = p.solucoes || [{ id: "sem-acao", texto: "sem correção automática: " + (p.oque || "resolva como diz o texto e calcule de novo") }]; out.push(p); }
    if (!r || r.ok !== true) {
      var pr = arr(r && r.problemas)[0] || {};
      add({ gravidade: "erro", titulo: pr.mecanismo ? "A estrutura vira mecanismo e nenhuma solução automática fecha a análise" : "O cálculo não fechou", texto: txt(pr.texto || (r && r.motivo)).slice(0, 500), pecas: arr(pr.pecas), no: pr.no, oque: "trave o plano indicado (contraventamento) ou ligue as peças soltas" });
      return out;
    }
    arr(r.naoVerificados).forEach(function (x) {
      var s = simples(x.tema, x.motivo), pc = [];
      if (/tubo/i.test(x.tema) && r.nosTubo) pc = pecasDeMembros(r, arr(r.nosTubo.nos).filter(function (o) { return !o.ok; }).map(function (o) { return o.banzo; }));
      add({ titulo: s.titulo, texto: s.texto, tema: x.tema, pecas: pc });
    });
    arr(r.ligDim && r.ligDim.pendencias).forEach(function (t) { var s = simples("", t); add({ titulo: s.titulo, texto: s.texto }); });
    var fal = Object.keys(r.membros || {}).filter(function (id) { return r.membros[id] && r.membros[id].ok === false; });
    var desl = arr(r.servico).filter(function (sv) { return sv && sv.razao > 1; });
    if (desl.length) add({ gravidade: "erro", titulo: desl.length + " deslocamento(s) acima do limite", texto: "Flecha/deslocamento passa do limite em " + desl.slice(0, 5).map(function (sv) { return sv.membro + " (" + br(sv.razao, 2) + ")"; }).join("; ") + ". A autocorreção não chegou a um perfil da família que passe dentro das voltas: aumente a rigidez (perfil maior ou de outra família, contraventamento ou apoio) e calcule de novo.", pecas: pecasDeMembros(r, desl.map(function (sv) { return sv.membro; })) });
    /* 22/11/2026: TODA falha contada no r.falhas vira cartão — antes a estabilidade global, o λcr < 1, a escada que trava e o nó de
       tubo reprovado "fora da validade" somavam falha sem cartão nenhum (o tubo do Gabriel terminava com 4 falhas e 3 cartões que
       não eram delas). Fontes do js/acodimlivre.js: barras, deslocamentos, estabilidade global, λcr, escada, nós e ligações. */
    var conta = fal.length + desl.length, avR = arr(r.avisos);
    var eg = r.estabilidadeGlobal;
    if (eg && eg.ok === false) { conta++; add({ gravidade: "erro", titulo: eg.classe === "instavel" ? "Estabilidade global reprovada (2ª ordem não converge)" : "Estrutura de grande deslocabilidade", texto: txt(eg.texto).slice(0, 400) || "A estabilidade global não atende.", oque: "aumente a rigidez lateral: pilares maiores, bases engastadas, ligações rígidas ou contraventamento" }); }
    var lcr = avR.filter(function (a) { return /^REPROVA: λcr/.test(a); })[0];
    if (lcr) { conta++; add({ gravidade: "erro", titulo: "Carga acima da crítica de flambagem global (λcr < 1)", texto: lcr.slice(0, 400), oque: "contravente, engaste as bases ou aumente os perfis" }); }
    if (r.escadaTrava && r.escadaTrava.texto) { conta++; add({ gravidade: "erro", titulo: "A escada está travando a estrutura", texto: txt(r.escadaTrava.texto).slice(0, 400), oque: "desenhe o contraventamento que trava o plano sem contar com a escada" }); }
    if (r.nosTubo && r.nosTubo.reprovados) { conta += r.nosTubo.reprovados; var nb = arr(r.nosTubo.nos).filter(function (o) { return !o.ok && arr(o.bloqueante).length; }); if (nb.length) add({ gravidade: "erro", titulo: nb.length + " nó(s) de tubo reprovado(s) fora da validade da fórmula", texto: "O nó não tem fórmula na NBR 16239 com a geometria de agora (" + nb.slice(0, 3).map(function (o) { return o.no + " (" + txt(o.banzoPerfil) + "): " + txt(arr(o.bloqueante)[0]); }).join("; ") + ") — trocar o perfil não resolve.", pecas: pecasDeMembros(r, nb.map(function (o) { return o.banzo; })), oque: "mude a geometria do nó (afastar ou sobrepor as barras) ou use o sistema em cantoneira" }); }
    /* 22/11/2026 (junção com o js/metaltubou.js): as pontas de tubo no U reprovadas somam em r.nosTubo.reprovados — cartão próprio */
    var tuR = r.nosTubo && r.nosTubo.tuboU;
    if (tuR && tuR.reprovados) {
      var pr = arr(tuR.pontas).filter(function (p) { return p.ok === false && !p.naoVerificado; }), gv = {};
      pr.forEach(function (p) { var k = txt(p.governante); gv[k] = (gv[k] || 0) + 1; });
      var sU = arr(tuR.semTrocaU), sUtx = sU.length ? " U da coluna: " + sU.slice(0, 2).map(function (q) { return q.perfil + " — " + q.motivo; }).join("; ") + "." : "";
      add({ gravidade: "erro", titulo: tuR.reprovados + " ponta(s) de tubo soldada(s) no U da coluna que não passa(m)", texto: "Nenhuma correção (solda maior, enrijecedores, chapa com parafusos, parede maior do tubo ou U maior da coluna) resolve: " + Object.keys(gv).slice(0, 3).map(function (k) { return gv[k] + "× " + k; }).join("; ") + (pr[0] ? " (ex.: " + pr[0].perfil + " no " + pr[0].UPerfil + ", nó " + pr[0].no + ")" : "") + "." + sUtx, pecas: pecasDeMembros(r, pr.map(function (p) { return p.U; }).concat(pr.map(function (p) { return p.barra; }))), oque: "aumente a espessura do U da coluna ou use o sistema em cantoneira" });
    }
    if (r.nosChapa && r.nosChapa.reprovados) conta += r.nosChapa.reprovados;
    if (r.ligDim && r.ligDim.reprovados) conta += r.ligDim.reprovados;
    if (num(r.falhas, 0) > conta) add({ gravidade: "erro", titulo: (r.falhas - conta) + " verificação(ões) não atende(m) sem classificação", texto: "O cálculo conta " + r.falhas + " falha(s) e a autocorreção explicou " + conta + ". As que sobram: " + (avR.filter(function (a) { return /REPROVA|não atende/i.test(a); }).slice(0, 3).join(" | ").slice(0, 400) || "veja os avisos do memorial") + "." });
    if (fal.length) add({ gravidade: "erro", titulo: fal.length + " barra(s) sem perfil que passe na família", texto: "Nenhum perfil maior da mesma família resolve: " + fal.slice(0, 6).map(function (id) { return id + " (" + txt(r.membros[id].governante) + " " + br(r.membros[id].razao, 2) + ")"; }).join("; ") + ". Troque a família do perfil (ex.: tubo maior, W) ou mude a geometria.", pecas: pecasDeMembros(r, fal), oque: "escolha outra família de perfil nas Propriedades" });
    if (r.nosTubo && r.nosTubo.reprovados) { var nr = arr(r.nosTubo.nos).filter(function (o) { return !o.ok && !arr(o.bloqueante).length; }); if (nr.length) add({ gravidade: "erro", titulo: nr.length + " nó(s) de tubo sem perfil da família que passe", texto: "Nenhum tubo maior da família faz o nó passar (" + nr.slice(0, 3).map(function (o) { return o.no + ": " + txt(o.governante) + " " + br(o.razao, 2); }).join("; ") + "). Use um banzo de outra série/largura ou o sistema em cantoneira.", pecas: pecasDeMembros(r, nr.map(function (o) { return o.banzo; })) }); }
    if (r.nosChapa && r.nosChapa.reprovados) add({ gravidade: "erro", titulo: r.nosChapa.reprovados + " nó(s) com chapa reprovado(s) mesmo com a chapa mais grossa", texto: txt(r.nosChapa.resumo).slice(0, 300), pecas: [] });
    if (r.ligDim && r.ligDim.reprovados) add({ gravidade: "erro", titulo: r.ligDim.reprovados + " ligação(ões) que não passa(m)", texto: arr(r.ligDim.ligacoes).filter(function (l) { return !l.ok; }).slice(0, 4).map(function (l) { return l.nome + ": " + l.governante; }).join("; "), pecas: arr(r.ligDim.ligacoes).filter(function (l) { return !l.ok && l.peca != null; }).map(function (l) { return String(l.peca); }) });
    arr(logPend).forEach(function (p) { add(p); });
    return out;
  }

  /* ================================================================ O LAÇO */
  function rodar(io, opc) {
    io = io || {}; opc = opc || {};
    var N = Math.max(1, Math.min(10, num(opc.voltas, VOLTAS))), t0 = Date.now(), assinc = typeof io.calcular === "function" && io.calcular.length >= 2;
    NOVO_ID = typeof io.novoId === "function" ? io.novoId : function () { return "auto-" + Date.now().toString(36) + "-" + (++seqId); };
    var ent = copia(io.entrada || {}); if (opc.otimizar !== false) ent.otimizar = true; ent.fixos = arr(ent.fixos).slice();
    var res = { ok: true, convergiu: false, voltas: 0, aplicadas: [], pendencias: [], resultado: null, entrada: null, relatorio: [], tempoMs: 0, cancelado: false, tempos: [] };
    var melhor = null, ultimoLote = null, vistas = {}, proib = {}, extra = [], fimFeito = false, saida = null;
    function prog(etapa, texto) { if (io.progresso) try { io.progresso({ volta: res.voltas, de: N, etapa: etapa, texto: texto || etapa }); } catch (e) {} }
    function log(t) { res.relatorio.push(t); }
    function calc(e, k0) {
      var tc = Date.now(), k = function (r) { res.tempos.push({ volta: res.voltas, calculoMs: Date.now() - tc, rodadas: r && r.tempos ? r.tempos.rodadas : null, rodadasMs: r && r.tempos ? r.tempos.rodadasMs : null }); k0(r); };
      prog("calculo", "Volta " + res.voltas + " de " + N + ": calculando (barras, nós, ligações)");
      if (assinc) { io.calcular(e, k); return; }
      var r; try { r = io.calcular(e); } catch (eC) { r = { ok: false, motivo: "erro no cálculo: " + (eC && eC.message) }; }
      k(r);
    }
    function terminar() {
      if (fimFeito) return; fimFeito = true;
      var R = melhor ? melhor.r : null;
      res.resultado = R; res.entrada = melhor ? melhor.ent : ent;
      res.convergiu = !!(R && R.ok && R.aprovado);
      res.pendencias = res.convergiu ? [] : pendencias(R, extra);
      res.tempoMs = Date.now() - t0;
      log(res.convergiu ? "Aprovado em " + res.voltas + " volta(s), " + res.aplicadas.length + " correção(ões) aplicada(s)." : "Parou em " + res.voltas + " volta(s): " + res.pendencias.length + " pendência(s) sem correção automática.");
      prog("fim", res.convergiu ? "Aprovado" : "Pendências");
      saida = res;
      if (opc.aoFim) try { opc.aoFim(res); } catch (e) {}
    }
    /* 22/11/2026: a volta depois de um lote SÓ DE LIGAÇÕES (placa, parafuso, chumbador — fora do modelo de barras) não refaz o
       otimizador: as barras já são as que ele escolheu na volta anterior (as trocas dele entraram no mesmo lote). É UMA rodada de
       conferência (a análise completa, nada estimado); se alguma barra reprovar nela, o otimizador volta na mesma volta. */
    var soLig = false, conferindo = false;
    function volta() {
      if (io.cancelado && io.cancelado()) { res.cancelado = true; log("Cancelado na volta " + res.voltas + "."); return terminar(); }
      res.voltas++;
      if (soLig && ent.otimizar) { soLig = false; conferindo = true; var ec = copia(ent); ec.otimizar = false; calc(ec, depois); return; }
      soLig = false; conferindo = false;
      calc(ent, depois);
    }
    function depois(r) {
      if (io.cancelado && io.cancelado()) { res.cancelado = true; log("Cancelado na volta " + res.voltas + "."); return terminar(); }
      if (conferindo) {
        conferindo = false;
        var barraRuim = r && r.ok && (Object.keys(r.membros || {}).some(function (id) { return r.membros[id] && r.membros[id].ok === false; }) || arr(r.servico).some(function (sv) { return sv && sv.razao > 1; }) || (r.estabilidadeGlobal && r.estabilidadeGlobal.ok === false));
        if (!r || !r.ok || barraRuim) { log("Volta " + res.voltas + ": a conferência sem o otimizador reprovou barra — recalcula com o otimizador."); calc(ent, depois); return; }
        log("Volta " + res.voltas + ": só as ligações mudaram — conferência numa rodada, sem refazer o otimizador.");
      }
      /* o lote da volta anterior PIOROU? desfaz e proíbe */
      if (melhor && ultimoLote && piora(r, melhor.r)) {
        var nb = nota(melhor.r), nn = nota(r);
        log("Volta " + res.voltas + ": o lote anterior piorou (" + (nn.ok ? nn.falhas + " falha(s), " + nn.nv + " não verificado(s), " + br(nn.peso, 0) + " kg" : "a análise não fecha") + " contra " + nb.falhas + " falha(s), " + nb.nv + " não verificado(s), " + br(nb.peso, 0) + " kg) — desfeito.");
        ultimoLote.itens.forEach(function (it) { proib[it.sig] = true; });
        res.aplicadas = res.aplicadas.filter(function (a) { return a.lote !== ultimoLote.n; });
        ent = copia(melhor.ent); r = melhor.r; ultimoLote = null;
      } else {
        melhor = { r: r, ent: ent };
        if (ultimoLote) log("Volta " + res.voltas + ": recalculado — " + (r && r.ok ? (r.aprovado ? "APROVADO" : num(r.falhas, 0) + " falha(s), " + arr(r.naoVerificados).length + " não verificado(s)") + ", " + br(num(r.peso, 0), 0) + " kg" : "a análise não fecha"));
        else log("Volta " + res.voltas + ": " + (r && r.ok ? (r.aprovado ? "APROVADO" : num(r.falhas, 0) + " falha(s), " + arr(r.naoVerificados).length + " não verificado(s)") + ", " + br(num(r.peso, 0), 0) + " kg" : "a análise não fecha — " + txt(r && r.motivo).slice(0, 120)));
        ultimoLote = null;
      }
      if (r && r.ok && r.aprovado && !(r.ligDim && io.ligacoes && placasFinas(r, ent).length && !proib["ligacoes:0:" + placasFinas(r, ent).length])) {
        /* as trocas do otimizador vão para a cópia (o modelo que a tela grava é o que foi aprovado) */
        var bz = classificar(r, ent, proib, io).barras || [];
        if (bz.length) { var ab = aplicar(ent, { trocas: bz }); ent = ab.entrada; melhor.ent = ent; res.aplicadas.push({ tipo: "barra", lote: 0, texto: bz.length + " barra(s) com o perfil mais leve que passa (otimizador)", n: bz.length }); }
        return terminar();
      }
      if (res.voltas >= N) { log("Limite de " + N + " voltas."); return terminar(); }
      prog("classificar", "Volta " + res.voltas + " de " + N + ": escolhendo as correções");
      var cl = classificar(r, ent, proib, io);
      var bz2 = cl.barras || [];
      /* as barras do otimizador entram sempre (é o resultado de agora); as outras correções formam o LOTE a testar */
      var trocaB = bz2.filter(function (b) { return !cl.lote.trocas.some(function (t) { return t.peca === b.peca; }); });
      if (!cl.itens.length && trocaB.length && r && r.ok && num(r.falhas, 0) > 0 && !vistas["so-otimizador:" + res.voltas]) {
        /* só o otimizador mudou algo e ainda há falha: as trocas dele entram e calcula de novo (o peso próprio mudou) */
        vistas["so-otimizador:" + res.voltas] = true;
        var aO = aplicar(ent, { trocas: trocaB }); ent = aO.entrada; ultimoLote = { n: res.aplicadas.length + 1, itens: [] };
        res.aplicadas.push({ tipo: "barra", lote: ultimoLote.n, volta: res.voltas, texto: trocaB.length + " barra(s) com o perfil mais leve que passa (otimizador)", n: trocaB.length });
        log("Volta " + res.voltas + ": só as trocas do otimizador (" + trocaB.length + ") — recalcula com elas.");
        if (assinc) setTimeout(volta, 0); else volta(); return;
      }
      if (!cl.itens.length) {
        if (trocaB.length) { var a0 = aplicar(ent, { trocas: trocaB }); ent = a0.entrada; melhor.ent = ent; }
        log("Volta " + res.voltas + ": nada mais com correção automática.");
        return terminar();
      }
      var assin = cl.itens.map(function (i) { return i.sig; }).sort().join(" ");
      if (vistas[assin]) { log("Volta " + res.voltas + ": a mesma correção de novo (" + cl.itens[0].texto.slice(0, 80) + ") — não converge, para."); return terminar(); }
      vistas[assin] = true;
      var lote = { trocas: trocaB.map(function (b) { return { peca: b.peca, para: b.para }; }).concat(cl.lote.trocas), novas: cl.lote.novas, estado: cl.lote.estado, solId: cl.lote.solId, fixos: cl.lote.fixos };
      var ap = aplicar(ent, lote), e2 = ap.entrada;
      if (ap.erros.length) log("Volta " + res.voltas + ": não aplicado — " + ap.erros.slice(0, 3).join("; "));
      if (cl.lote.ligacoes) {
        prog("ligacoes", "Volta " + res.voltas + " de " + N + ": pondo as ligações dimensionadas no modelo");
        var lg = null, tl = Date.now(); try { lg = io.ligacoes(r, e2); } catch (eL) { lg = null; log("Ligações: " + (eL && eL.message)); }
        if (res.tempos.length) res.tempos[res.tempos.length - 1].ligacoesMs = Date.now() - tl;
        if (lg && lg.entrada) e2 = lg.entrada; else { cl.itens = cl.itens.filter(function (i) { return i.tipo !== "ligacoes"; }); extra.push({ titulo: "Ligações do modelo sem atualização automática", texto: "O dimensionamento das ligações (parafusos, placas, chumbadores) não pôde ir para o modelo: use \"Atualizar parafusos, placas e chumbadores no modelo\"." }); }
      }
      soLig = cl.itens.length > 0 && cl.itens.every(function (i) { return i.tipo === "ligacoes"; }) && !arr(cl.lote.novas).length && !cl.lote.estado && !cl.lote.trocas.length;
      var nL = res.aplicadas.length + 1;
      ultimoLote = { n: nL, itens: cl.itens };
      cl.itens.forEach(function (it) { res.aplicadas.push({ tipo: it.tipo, lote: nL, volta: res.voltas, texto: it.texto, peca: it.peca, de: it.de, para: it.para, pecas: it.pecas }); });
      if (trocaB.length) res.aplicadas.push({ tipo: "barra", lote: nL, volta: res.voltas, texto: trocaB.length + " barra(s) com o perfil mais leve que passa (otimizador)", n: trocaB.length });
      log("Volta " + res.voltas + ": lote com " + cl.itens.length + " correção(ões)" + (trocaB.length ? " + " + trocaB.length + " troca(s) do otimizador" : "") + " — " + cl.itens.slice(0, 4).map(function (i) { return i.texto; }).join(" | ").slice(0, 400));
      ent = e2;
      if (assinc) setTimeout(volta, 0); else volta();
    }
    volta();
    return assinc ? null : saida;
  }

  /* o lote do EDITOR (um Ctrl+Z) com o que a autocorreção mudou: caixas de antes × caixas da entrada final */
  function loteModelo(antes, depois, novoId) {
    var A = {}, D = {}, ops = [];
    arr(antes).forEach(function (c) { if (c) A[String(c.id)] = c; });
    arr(depois).forEach(function (c) { if (c) D[String(c.id)] = c; });
    Object.keys(A).forEach(function (id) { if (!D[id]) ops.push({ op: "apagar", id: id }); });
    Object.keys(D).forEach(function (id) {
      if (!A[id]) { ops.push({ op: "criar", id: id, caixa: D[id] }); return; }
      if (JSON.stringify(A[id]) === JSON.stringify(D[id])) return;
      if (D[id].tipo === "metal") ops.push({ op: "metalAjustar", id: id, caixa: D[id] });
      else if (D[id].perfil !== A[id].perfil) ops.push({ op: "ajustar", id: id, campos: { perfil: D[id].perfil, material: D[id].material || "aco" } });
    });
    if (!ops.length) return null;
    return { op: "lote", id: String(typeof novoId === "function" ? novoId() : "auto-" + Date.now()), origem: "metal-calc-autocorrigir", pedido: "Calcular e corrigir", ops: ops };
  }

  var AcoAutoCorrigir = { rodar: rodar, classificar: classificar, pendencias: pendencias, piora: piora, aplicar: aplicar, trocarCaixa: trocarCaixa, chave: chave, loteModelo: loteModelo, reaplicar: reaplicar, placasFinas: placasFinas, simples: simples, VOLTAS: VOLTAS, FOLGAS_2L: FOLGAS_2L };
  global.AcoAutoCorrigir = AcoAutoCorrigir;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoAutoCorrigir;
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : (typeof global !== "undefined" ? global : this)));
