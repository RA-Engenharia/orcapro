/* =====================================================================
 * eleaparelhos.js — "O APARELHO PEDE O PRÓPRIO PONTO" (Elétrica v2, lote L3, 06/11/2026). Motor PURO, ES5, Node-testável.
 *
 * Geladeira, lavadora, torre quente, cooktop, chuveiro elétrico, split e condensadora não tinham conector elétrico nem parâmetro de
 * potência, e a potência morava fixa em js/eleregras.js. A tabela agora é dados-fonte/eletrica/aparelhos.json (→ js/eleaparelhosdados.js,
 * gerador tools/gerar-eleaparelhos.js), com a fonte e o NÍVEL de cada número.
 *
 *   EleAparelhos.paraFamilia(defOuInstancia[, avaliarFam]) → [requisito]  (lista: a torre quente dá o forno e o micro-ondas)
 *       requisito = { id, chave, rotulo, potW, tensaoV, fp, ligacao: "tomada"|"direta", tipoPonto: "TUE"|"LD"|"TETO", tipoTomadaId: "t10"|"t20"|null,
 *                     correnteTomada_A, corrente_A, exclusivo, dr, altura_m, posicao, circuito, fontes, confirmar, noVolume, semParede, delegado }
 *       Casa por ID de família, por mep.peca ou por nome EXATO (casar.nomes) — nunca por semelhança solta.
 *   EleAparelhos.aumentar(listaDeFamilias) → nova lista com o conector elétrico (se a família não tem) e os parâmetros Potencia_W, Tensao_V,
 *       Tipo_ponto, SEM editar familiasmobcoz.js / hidfamilias.js / climfamilias.js (o js/bim.js chama em famDefinir).
 *   EleAparelhos.pontoPara(instancia, { estado, avaliarFam, criterios }) → { ok, ops, itens[], avisos[], pendencias[] }
 *       o ponto (tomada ra-tomada do tipo certo, ou só a caixa 4×2 de ligação direta) na parede mais perto do aparelho, na altura da
 *       tabela, com Circuito sugerido "TUE-<aparelho>" e a marca Lig = "apar-<instId>". IDEMPOTENTE: id "elee-<aparelho>" (o MESMO que o
 *       "Lançar pontos elétricos" usa — os dois motores se reconhecem): rodar de novo = nenhuma op; aparelho movido = o ponto vai junto.
 *   EleAparelhos.orfaos(estado, avaliarFam) → pontos de aparelho que não existe mais (+ ops para apagar) — "apagar o aparelho oferece apagar o ponto".
 *   EleAparelhos.aoColocar(opFam, ops, famAval) → lote (aparelho + ponto: UM Ctrl+Z) ou null — gancho do js/bim.js ao colocar a família.
 * Teste: node tools/test-ele-aparelhos.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function DADOS() { return dep("EleAparelhosDados", "./eleaparelhosdados.js") || { aparelhos: [], limites: {}, niveis: {} }; }
  function RG() { return dep("EleRegras", "./eleregras.js"); }
  function EAU() { return dep("EleAuto", "./eleauto.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function dist(a, b) { var x = a[0] - b[0], z = a[1] - b[1]; return Math.sqrt(x * x + z * z); }
  function sim(v) { return v === true || v === "true" || v === 1 || v === "1" || v === "sim"; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* ---------------------------------------------------------------- preferências (só desta pessoa) */
  var CHAVE = "orcapro:eleaparelhos:cfg";
  var cfg = { auto: true, mobiliario: true };
  function carregar() { try { var c = JSON.parse(global.localStorage.getItem(CHAVE) || "null"); if (c && typeof c === "object") { if (typeof c.auto === "boolean") cfg.auto = c.auto; if (typeof c.mobiliario === "boolean") cfg.mobiliario = c.mobiliario; } } catch (e) {} }
  function salvar() { try { global.localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch (e) {} }
  function ligado() { return !!cfg.auto; }
  function definir(k, v) { if (k === "auto" || k === "mobiliario") { cfg[k] = !!v; salvar(); } return cfg[k]; }

  /* ---------------------------------------------------------------- a tabela */
  function condicao(c, v) {
    var x = v[c.param];
    if (x === undefined) { return c.op === "!="; }   /* sem o parâmetro: "!= false" vale (micro-ondas de fábrica), "== true" não */
    if (c.op === "==") return typeof c.valor === "boolean" ? sim(x) === c.valor : x === c.valor;
    if (c.op === "!=") return typeof c.valor === "boolean" ? sim(x) !== c.valor : x !== c.valor;
    if (c.op === ">=") return num(x, 0) >= c.valor;
    return false;
  }
  function casa(ap, famId, peca, nome, v, semCondicao) {
    var c = ap.casar || {}, ok = false;
    if (arr(c.fam).indexOf(String(famId || "")) >= 0) ok = true;
    else if (c.peca && peca && c.peca === peca) ok = true;
    else if (arr(c.nomes).length && nome && c.nomes.indexOf(String(nome).toLowerCase()) >= 0) ok = true;
    if (!ok) return false;
    return semCondicao || arr(c.quando).every(function (q) { return condicao(q, v); });
  }
  /* o requisito elétrico de um aparelho: tomada 10/20 A ou ligação direta, pela corrente (limites da tabela) */
  function requisitoDe(ap, btu, lim) {
    var R = RG(), potW = ap.potW, pAr = null;
    if (potW === "btu") { pAr = R && R.potenciaAr ? R.potenciaAr(btu) : null; potW = pAr ? pAr.W : null; }
    var V = ap.tensaoV, fp = ap.fp, I = potW > 0 && V > 0 ? potW / (V * (fp > 0 ? fp : 1)) : null;
    var lig = ap.forcaDireta ? "direta" : (I == null ? "tomada" : I <= lim.correnteT10.valor + 1e-9 ? "tomada" : I <= lim.correnteT20.valor + 1e-9 ? "tomada" : "direta");
    var tipoTom = lig === "direta" ? null : (I == null ? "t20" : I <= lim.correnteT10.valor + 1e-9 ? "t10" : "t20");
    var tipoPonto = ap.tipoPonto === "TETO" ? "TETO" : (lig === "direta" ? "LD" : "TUE");
    var excl = I == null || lig === "direta" || I > lim.correnteExclusivo.valor + 1e-9;
    return {
      id: ap.id, chave: null, sufixo: ap.sufixo || "", rotulo: ap.rotulo, potW: potW, pAr: pAr, tensaoV: V, fp: fp, ligacao: lig, tipoPonto: tipoPonto, tipoTomadaId: tipoTom,
      correnteTomada_A: tipoTom === "t10" ? 10 : tipoTom === "t20" ? 20 : null, corrente_A: I == null ? null : Math.round(I * 100) / 100, exclusivo: excl,
      dr: !!ap.dr, altura_m: ap.altura_m, posicao: copia(ap.posicao), circuito: ap.circuito, confirmar: ap.confirmar || null, noVolume: !!ap.noVolume, semParede: !!ap.semParede, delegado: ap.delegado || null,
      fontes: { potencia: { texto: ap.potWFonte, nivel: ap.potWNivel }, altura: { texto: ap.alturaFonte, nivel: ap.alturaNivel }, posicao: ap.posicao ? { texto: ap.posicao.fonte, nivel: ap.posicao.nivel } : null,
                limites: { t10: lim.correnteT10, t20: lim.correnteT20, exclusivo: lim.correnteExclusivo, distMax: lim.distMax } }
    };
  }
  /* d = { famId, tipoId, inst } (instância/op) ou { id, mep, nome, parametros } (definição da família). 2º argumento opcional: a avaliação (valores da instância). */
  function paraFamilia(d, avaliarFam, opcoes) {
    d = d || {};
    var D = DADOS(), famId = d.famId || d.id, peca = d.mep && d.mep.peca ? d.mep.peca : null, v = {}, i;
    arr(d.parametros).forEach(function (p) { if (p && p.nome) v[p.nome] = p.valor; });
    if (d.famId && typeof avaliarFam === "function") { try { var av = avaliarFam(d.famId, d.tipoId, d.inst || {}); if (av && av.valores) Object.keys(av.valores).forEach(function (k) { v[k] = av.valores[k]; }); if (av && av.mep && av.mep.peca) peca = av.mep.peca; } catch (e) {} }
    Object.keys(d.inst || {}).forEach(function (k) { v[k] = d.inst[k]; });
    var btu = num(v.Capacidade_BTUh, 0), out = [];
    for (i = 0; i < D.aparelhos.length; i++) {
      var ap = D.aparelhos[i];
      if (!casa(ap, famId, peca, d.nome, v, opcoes && opcoes.semCondicao)) continue;
      /* C2 (revisão 07/11/2026): a placa informada (Potencia_W / Tensao_V > 0 e diferente da tabela) manda sobre a tabela */
      /* a família com mais de um aparelho (torre quente) tem um Potencia_W só: o valor da avaliação vale quando há um aparelho só; o gravado na instância vale para o principal (sem sufixo) */
      var nCasa = D.aparelhos.filter(function (r) { return casa(r, famId, peca, d.nome, v, opcoes && opcoes.semCondicao); }).length, prim = !ap.sufixo;
      var w0 = nCasa === 1 ? num(v.Potencia_W, 0) : (prim ? num(d.inst && d.inst.Potencia_W, 0) : 0), t0 = nCasa === 1 ? num(v.Tensao_V, 0) : (prim ? num(d.inst && d.inst.Tensao_V, 0) : 0), ap2 = ap, placa = false;
      if ((w0 > 0 && w0 !== ap.potW) || (t0 > 0 && t0 !== ap.tensaoV)) { ap2 = copia(ap); if (w0 > 0 && w0 !== ap.potW) ap2.potW = w0; if (t0 > 0 && t0 !== ap.tensaoV) ap2.tensaoV = t0; placa = true; }
      var q = requisitoDe(ap2, btu, D.limites); q.placa = placa; q.quando = copia(ap.casar.quando || []); q.chave = (d.id && d.famId ? String(d.id) : "") + (ap.sufixo ? "-" + ap.sufixo : "");
      out.push(q);
    }
    return out;
  }

  /* ---------------------------------------------------------------- AUMENTAR as famílias (em tempo de carga) */
  function rotuloTipo(q) { return q.tipoPonto === "LD" ? "LD (ligação direta)" : q.tipoPonto === "TETO" ? "Ponto no teto" : "TUE " + q.correnteTomada_A + " A"; }
  function aumentar(lista) {
    return arr(lista).map(function (def) {
      if (!def || !def.id) return def;
      var reqs = paraFamilia({ id: def.id, mep: def.mep, nome: def.nome, parametros: def.parametros }, null, { semCondicao: true }).filter(function (q) { return !q.delegado; });
      if (!reqs.length) return def;
      var f = copia(def), q = reqs[0], tem = {};
      f.parametros = arr(f.parametros); f.conectores = arr(f.conectores);
      /* B5 (revisão 07/11/2026): o Tipo_ponto de cada TIPO do catálogo diz o mesmo que o motor (cooktop de 7.000 W, torneira de 5.500 W e forno de 4.500 W em 220 V passam do limite da tomada: LD, não "TUE") */
      var linha = DADOS().aparelhos.filter(function (r) { return r.id === q.id; })[0];
      if (linha) arr(f.tipos).forEach(function (tp) {
        var vv = tp && (tp.valores || tp.v), w = num(vv && vv.Potencia_W, 0), tv = num(vv && vv.Tensao_V, 0);
        if (!vv || !(w > 0 && tv > 0) || !/^TUE/i.test(String(vv.Tipo_ponto || ""))) return;
        var l2 = copia(linha); l2.potW = w; l2.tensaoV = tv;
        if (requisitoDe(l2, 0, DADOS().limites).tipoPonto === "LD") vv.Tipo_ponto = "LD";
      });
      f.parametros.forEach(function (p) { tem[p.nome] = 1; });
      function par(nome, tipoDado, valor, descricao) { if (!tem[nome]) f.parametros.push({ nome: nome, tipoDado: tipoDado, escopo: "instancia", valor: valor, grupo: "Elétrica", descricao: descricao }); }
      par("Potencia_W", "numero", q.potW || 0, "Potência típica (W) — " + (q.fontes.potencia.texto || "") + " [nível " + q.fontes.potencia.nivel + "]; a placa do aparelho manda");
      par("Tensao_V", "numero", q.tensaoV, "Tensão (V)");
      par("Tipo_ponto", "texto", rotuloTipo(q), "Ponto que o aparelho pede (TUE 10/20 A ou ligação direta)");
      if (!f.conectores.some(function (c) { return c && c.sistema === "eletrica"; })) {
        var y = q.posicao && (q.posicao.ref === "atras" || q.posicao.ref === "sob_bancada") && q.altura_m != null ? String(q.altura_m) : "0";
        /* o conector só existe quando a CONDIÇÃO do aparelho vale (chuveiro com Eletrico, bancada com Com_cooktop): `visivel` do familia.js */
        var vis = arr(q.quando).filter(function (c) { return c.op === "==" && c.valor === true && tem[c.param]; }).map(function (c) { return c.param; })[0];
        f.conectores.push({ id: "el", visivel: vis || undefined, nome: "Alimentação elétrica (" + rotuloTipo(q) + ")", sistema: "eletrica", dn: 25, x: String(q.posicao ? q.posicao.lateral_m || 0 : 0), y: y, z: "0", papel: "entrada", dir: { x: 0, y: 0, z: -1 }, origemPos: "catalogo",
          aConferir: "ponto de ligação elétrica do aparelho (eleaparelhos.js, 06/11/2026): posição de projeto, a conferir no manual do modelo" });
      }
      return f;
    });
  }

  /* ---------------------------------------------------------------- O PONTO */
  function ponteiros(L, id) { return L.pontos.filter(function (p) { return p.id === id; }).concat(L.caixas.filter(function (c) { return c.id === id; })); }
  function pontoPara(inst, ctx) {
    ctx = ctx || {};
    var R = RG(), EA = EAU(), out = { ok: true, ops: [], itens: [], avisos: [], pendencias: [] };
    if (!R || !EA || !ctx.estado) return { ok: false, motivo: "sem o estado do modelo", ops: [], itens: [], avisos: [], pendencias: [] };
    var C = R.criterios(ctx.criterios), D = DADOS(), L = EA.leitura(ctx.estado, ctx.avaliarFam), dMax = num(D.limites.distMax && D.limites.distMax.valor, C.distTue.valor);
    var instId = String(inst.id);
    var f = arr(ctx.estado.familias).filter(function (x) { return x && String(x.id) === instId; })[0] || inst;
    var reqs = paraFamilia({ id: instId, famId: f.famId, tipoId: f.tipoId, inst: f.inst || inst.inst }, ctx.avaliarFam);
    var igual = arr(ctx.estado.familias).filter(function (x) { return x && x.famId === f.famId; }).length;   /* duas geladeiras: o circuito leva o id */
    if (!reqs.length) return { ok: true, ops: [], itens: [], avisos: [], pendencias: [], semRegra: true };
    reqs.forEach(function (q) {
      if (q.delegado) { out.avisos.push(q.rotulo + ": o ponto vem da Ligação da iluminação (" + q.delegado + "): ponto de luz no teto + interruptor."); return; }
      var ap = L.aparelhos.filter(function (a) { return a.chave === q.chave; })[0];
      if (!ap) { out.pendencias.push({ aparelho: instId, texto: q.rotulo + " (" + instId + "): fora de um ambiente delimitado — lance o ambiente e religue, ou lance o ponto à mão." }); return; }
      var a = L.ambientes.filter(function (x) { return x.id === ap.amb; })[0];
      if (!a) { out.pendencias.push({ aparelho: instId, texto: q.rotulo + " (" + instId + "): fora de um ambiente delimitado — lance o ambiente e religue." }); return; }
      if (q.semParede) { out.pendencias.push({ aparelho: instId, texto: q.rotulo + " (" + instId + ") fica no meio do ambiente — o ponto vem pelo piso: lance à mão." }); return; }
      var pref = "elee-" + q.chave, h = q.altura_m, Q = { tom: { ligacao: q.ligacao, tipoId: q.tipoTomadaId } };
      var vivo = ponteiros(L, pref), perto = vivo.filter(function (x) { return dist(x.p, ap.p) <= dMax + 1e-6; })[0];
      /* já existe e serve: nada a fazer (inclui o ponto posto à mão perto do aparelho que serve a ele) */
      if (perto) { out.itens.push({ aparelho: instId, existente: perto.id, acao: "ja-existe" }); return; }
      var manual = L.pontos.concat(L.caixas).filter(function (x) { return !x.auto && x.pav === ap.pav && dist(x.p, ap.p) <= dMax + 1e-6 && EA.serveTue(Q, x); })[0];
      if (manual) { out.itens.push({ aparelho: instId, existente: manual.id, acao: "ja-existe" }); return; }
      var cands = EA.candidatos(L, ctx.estado, ctx.avaliarFam, a, C).map(function (c) { c.pav = a.pav; return c; })
        .filter(function (c) { return dist(c.P, ap.p) <= dMax + 1e-6; }).sort(function (x, y) { return dist(x.P, ap.p) - dist(y.P, ap.p); });
      var esc = null, motivo = null;
      for (var i = 0; i < cands.length && !esc; i++) { var mv = EA.verificar(L, C, cands[i], h, { exceto: instId, semBox: q.noVolume }); if (!mv) esc = cands[i]; else if (!motivo) motivo = mv; }
      if (!esc) { out.pendencias.push({ aparelho: instId, texto: "\"" + a.nome + "\": não achei parede livre a ≤ " + f2(dMax) + " m de " + q.rotulo + " (" + instId + ")" + (motivo ? " — " + motivo : "") + ". Lance o ponto à mão." }); return; }
      /* o ponto velho que ficou longe (aparelho movido): sai, o novo entra com o MESMO id */
      vivo.forEach(function (x) { out.ops.push({ op: "apagar", id: x.id }); });
      if (ponteiros(L, pref + "-cx").length) out.ops.push({ op: "apagar", id: pref + "-cx" });
      var P = esc.P, dir = esc.dir, pt = [P[0] + dir[0] * 0.005, P[1] + dir[1] * 0.005], cx = [P[0] - dir[0] * 0.025, P[1] - dir[1] * 0.025], base = a.base;
      var origem = "aparelho " + q.rotulo.toLowerCase(), circ = igual > 1 ? q.circuito + "-" + instId : q.circuito;
      if (q.ligacao !== "direta") out.ops.push({ op: "familia", id: pref, famId: "ra-tomada", tipoId: q.tipoTomadaId, x: r4(pt[0]), y: r4(base), z: r4(pt[1]), rotY: esc.rotY, inst: { Altura_montagem: r4(h), Circuito: circ, Origem: origem, Lig: "apar-" + instId }, lig: "apar-" + instId });
      out.ops.push({ op: "peca", id: q.ligacao === "direta" ? pref : pref + "-cx", peca: "caixa_4x2", sistema: "eletrica", material: "pvc", x: r4(cx[0]), y: r4(base + h), z: r4(cx[1]), rotY: esc.rotY, alturaPiso: r4(h), lig: "apar-" + instId, circuito: circ, origem: origem, comentarios: "Origem: " + origem + "; Circuito: " + circ });
      var aviso = "ponto criado: " + (q.ligacao === "direta" ? "ligação direta (caixa 4×2)" : "TUE " + q.correnteTomada_A + " A") + " a " + f2(h) + " m";
      out.itens.push({ aparelho: instId, id: pref, acao: vivo.length ? "movido" : "criado", tipo: q.tipoPonto, tomada: q.tipoTomadaId, altura: r4(h), circuito: circ, origem: origem, exclusivo: q.exclusivo, dr: q.dr, potW: q.potW, tensaoV: q.tensaoV, corrente_A: q.corrente_A, aviso: aviso, ambiente: a.id });
      if (q.exclusivo) out.itens[out.itens.length - 1].exclusivoMotivo = q.corrente_A != null && q.ligacao !== "direta" ? "I = " + f2(q.corrente_A) + " A > " + D.limites.correnteExclusivo.valor + " A (NBR 5410 9.5.3.1)" : "ligação direta / potência pela placa";
      if (q.confirmar) out.pendencias.push({ aparelho: instId, texto: q.confirmar + " (" + pref + ")." });
      if (!(q.potW > 0)) out.pendencias.push({ aparelho: instId, texto: q.rotulo + " (" + instId + ") sem potência conhecida — informe a da placa." });
    });
    return out;
  }

  /* ---------------------------------------------------------------- órfãos: o ponto ficou, o aparelho foi apagado */
  function orfaos(estado, avaliarFam) {
    var EA = EAU(), L = EA.leitura(estado, avaliarFam), D = DADOS(), sufixos = D.aparelhos.map(function (a) { return a.sufixo; }).filter(Boolean);
    var existe = {}; arr(estado && estado.familias).forEach(function (f) { if (f && f.id != null) existe[String(f.id)] = 1; });
    var vistos = {}, out = [];
    L.pontos.concat(L.caixas).forEach(function (x) {
      var m = /^elee-(.+?)(-cx)?$/.exec(String(x.id)); if (!m) return;
      var chave = m[1], base = chave;
      sufixos.forEach(function (s) { if (chave.slice(-s.length - 1) === "-" + s) base = chave.slice(0, -s.length - 1); });
      if (existe[chave] || existe[base] || vistos[m[1]]) return;
      vistos[m[1]] = 1;
      var ids = ["elee-" + chave, "elee-" + chave + "-cx"].filter(function (i) { return ponteiros(L, i).length; });
      out.push({ aparelho: base, id: "elee-" + chave, ids: ids, ops: ids.map(function (i) { return { op: "apagar", id: i }; }), texto: "O aparelho " + base + " não existe mais: apagar o ponto " + ids.join(" e ") + "?" });
    });
    return out;
  }

  /* ---------------------------------------------------------------- gancho da colocação (js/bim.js) */
  var ultimo = null;
  function aoColocar(opFam, ops, famAval) {
    ultimo = null;
    if (!cfg.auto || !opFam || !opFam.famId) return null;
    var reqs = paraFamilia({ id: opFam.id, famId: opFam.famId, tipoId: opFam.tipoId, inst: opFam.inst }, famAval).filter(function (q) { return !q.delegado; });
    if (!reqs.length) return null;
    var BE = dep("BimEdit", "./bimedit.js"); if (!BE) return null;
    var estado = BE.aplicar(copia(arr(ops)).concat([copia(opFam)]));
    var r = pontoPara(opFam, { estado: estado, avaliarFam: famAval });
    ultimo = r;
    if (!r.ok || !r.ops.length) return null;
    var msg = r.itens.filter(function (i) { return i.aviso; }).map(function (i) { return i.aviso; }).join("; ");
    return { op: "lote", id: "apar-" + Date.now().toString(36), origem: "aparelho", pedido: "Aparelho com o ponto elétrico (" + msg + ")", ops: [opFam].concat(r.ops) };
  }
  /* MOVER O APARELHO LEVA O PONTO (revisão A3, 07/11/2026): o gancho do editOp do js/bim.js passa a op (ou o lote) que acabou de entrar; se ela move um aparelho que pede ponto,
     devolve o MESMO lote com o ponto novo (apagar o velho + criar o novo no mesmo id) — um Ctrl+Z desfaz tudo. null = nada a fazer. */
  function aoMover(op, opsAtuais, famAval) {
    if (!cfg.auto || !op) return null;
    var lista = op.op === "lote" ? arr(op.ops) : [op], movidos = [];
    lista.forEach(function (o) { if (o && o.op === "mover" && o.id != null && movidos.indexOf(String(o.id)) < 0) movidos.push(String(o.id)); });
    if (!movidos.length) return null;
    var BE = dep("BimEdit", "./bimedit.js"); if (!BE) return null;
    var base = copia(arr(opsAtuais)), estado;
    try { estado = BE.aplicar(base.concat([copia(op)])); } catch (e) { return null; }
    var extra = [];
    movidos.forEach(function (id) {
      var f = arr(estado.familias).filter(function (x) { return x && String(x.id) === id; })[0];
      if (!f || !paraFamilia({ id: id, famId: f.famId, tipoId: f.tipoId, inst: f.inst }, famAval).filter(function (q) { return !q.delegado; }).length) return;
      var r = pontoPara({ id: id, inst: f.inst }, { estado: estado, avaliarFam: famAval });
      if (r && r.ok) r.ops.forEach(function (o) { extra.push(o); });
    });
    if (!extra.length) return null;
    var novo = op.op === "lote" ? copia(op) : { op: "lote", id: "aparmv-" + Date.now().toString(36), origem: "aparelho", pedido: "Aparelho movido: o ponto elétrico vai junto", ops: [copia(op)] };
    novo.ops = novo.ops.concat(extra);
    return BE.sanear([novo])[0] || null;
  }
  /* APAGAR O APARELHO OFERECE APAGAR O PONTO (L6): quais pontos (Lig = apar-<id> / elee-<id>) ficariam órfãos com as ops de apagar? Devolve
     { ops (apagar dos pontos), texto ("Apagar também o ponto (TUE 20 A)?"), itens[] } ou null. Só conta os órfãos NOVOS (os que já eram órfãos
     antes seguem como estavam: quem apaga outra coisa não é perguntado sobre eles). O bim.js pergunta (confirm) e junta as ops no MESMO lote. */
  function aoApagar(opsAtuais, opsApagar, famAval) {
    var BE = dep("BimEdit", "./bimedit.js"); if (!BE || !arr(opsApagar).length) return null;
    var antes = {}, ativos = copia(arr(opsAtuais)), est1, est2;
    try {
      est1 = BE.aplicar(ativos); orfaos(est1, famAval).forEach(function (o) { antes[o.id] = 1; });
      est2 = BE.aplicar(copia(arr(opsAtuais)).concat(copia(opsApagar)));
    } catch (e) { return null; }
    var novos = orfaos(est2, famAval).filter(function (o) { return !antes[o.id]; });
    if (!novos.length) return null;
    var itens = novos.map(function (o) {
      var tom = arr(est1.familias).filter(function (f) { return f && o.ids.indexOf(String(f.id)) >= 0 && f.famId === "ra-tomada"; })[0], m = tom && /^t(\d+)$/.exec(String(tom.tipoId || ""));
      return { aparelho: o.aparelho, ids: o.ids, descricao: m ? "TUE " + m[1] + " A" : (tom ? "tomada" : "ligação direta") };
    });
    var ops = []; novos.forEach(function (o) { o.ops.forEach(function (x) { ops.push(x); }); });
    return { ops: ops, itens: itens, texto: "Apagar também o ponto (" + itens.map(function (i) { return i.descricao; }).join(", ") + ")?" };
  }
  function rotuloColocar() {
    var r = ultimo; if (!r) return "";
    var m = r.itens.filter(function (i) { return i.aviso; }).map(function (i) { return i.aviso; });
    if (m.length) return " — " + m.join("; ") + " (Ctrl+Z desfaz tudo)";
    return r.pendencias.length ? " — sem ponto: " + r.pendencias[0].texto : "";
  }

  carregar();
  var EleAparelhos = { paraFamilia: paraFamilia, aumentar: aumentar, pontoPara: pontoPara, orfaos: orfaos, aoApagar: aoApagar, aoMover: aoMover, aoColocar: aoColocar, rotuloColocar: rotuloColocar, ligado: ligado, definir: definir, cfg: cfg, dados: DADOS };
  global.EleAparelhos = EleAparelhos;
  if (typeof module !== "undefined" && module.exports) module.exports = EleAparelhos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
