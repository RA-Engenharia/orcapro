/* =====================================================================
 * famhidmigra.js — MIGRAÇÃO VERSIONADA das famílias do Hidrossanitário (27/10/2026, Lote 1 "famílias iguais ao catálogo").
 * Motor PURO, ES5, Node-testável. Global: FamHidMigra. Tabela: js/famhidmigradados.js (GERADO de
 * dados-fonte/hidro/familias/migracao-familias.json).
 *
 * O QUE FAZ
 *   Projeto salvo de cliente guarda a modelagem como LISTA DE OPERAÇÕES (BimEdit). Uma instância de família é a op
 *   { op:"familia", id, famId, tipoId, x, y, z, rotY, inst } (+ ops "instancia"/"mover" que a ajustam). Quando uma família
 *   antiga (bloco genérico `ra-*`) é substituída pela do catálogo do fabricante, o id velho NÃO pode simplesmente sumir:
 *   esta migração reescreve as ops ao ABRIR o projeto — mesmo id da instância, família e tipo equivalentes do catálogo,
 *   mesma posição/giro (a posição é ajustada para o ponto-âncora de ligação do tubo ficar onde estava).
 *
 * REGRAS (cada uma existe por um defeito que ela impede)
 *  1. IDEMPOTENTE: depois de migrar, nenhuma op tem id antigo; abrir de novo não encontra nada e devolve a MESMA lista
 *     (mesma referência). Sem isto cada abertura reescreveria o projeto.
 *  2. NUNCA DESTRÓI: a lista de entrada não é alterada (a saída é cópia); a família antiga continua DEFINIDA (alias carregável
 *     — ver a biblioteca, `oculta`), então o que a migração recusar continua abrindo e desenhando como antes.
 *  3. NA DÚVIDA, ADIA (nunca adivinha): família destino não carregada, âncora sem conector, instância hospedada em parede,
 *     família trocada no histórico, tipo da obra editado (ajustarTipo), deslocamento acima do limite → a instância fica
 *     como está e o motivo vai para `adiadas` e para o log. Roda de novo na próxima abertura.
 *  4. LIGAÇÃO DE TUBO: o tubo liga ao aparelho pela POSIÇÃO do conector (tolerância 2 cm, js/biminst.js TOL), não por id.
 *     Por isso o ponto-âncora do destino é posto exatamente onde o do antigo estava (translação x/y/z); os OUTROS conectores
 *     que caírem a mais de 2 cm vão listados em `residuos` (centímetros) — a ligação deles precisa de conferência.
 *  5. LOG: cada troca devolve um registro { id, de, para, tipoDe, tipoPara, ancora, deslocamento, residuos, ... } e a op
 *     migrada carrega `migradoDe` + `migracaoV` (a trilha fica no próprio projeto).
 * ===================================================================== */
(function (global) {
  "use strict";

  var VERSAO = 1;
  var CHAVE_LOG = "orcapro:famhidmigra:log";
  var TETO_LOG = 200;

  function dados() {
    if (global.FamHidMigraDados) return global.FamHidMigraDados;
    if (typeof require === "function") { try { return require("./famhidmigradados.js"); } catch (e) { return null; } }
    return null;
  }
  function tabela() { var d = dados(); return d && d.alias ? d.alias : {}; }
  function limites() { var d = dados(); return d && d.limites ? d.limites : { deslocamentoHorizontalMax_m: 0.6, deslocamentoVerticalMax_m: 0.1, toleranciaLigacao_m: 0.02 }; }
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function arr(a) { return Array.isArray(a) ? a : []; }

  function ehAlias(id) { return tem(tabela(), String(id)); }
  function canonico(id) { var r = tem(tabela(), String(id)) ? tabela()[String(id)] : null; return r ? r.para : String(id); }
  function aliasDe(id) { var r = [], t = tabela(); Object.keys(t).forEach(function (k) { if (t[k].para === id) r.push(k); }); return r; }

  /* mesmo giro do viewer e de BimInst.conectoresDe: x' = x·cosθ + z·sinθ ; z' = −x·sinθ + z·cosθ */
  function mundo(e, k) {
    var c = Math.cos(e.rotY), s = Math.sin(e.rotY);
    return { x: e.x + num(k.x, 0) * c + num(k.z, 0) * s, y: e.y + num(k.y, 0), z: e.z - num(k.x, 0) * s + num(k.z, 0) * c };
  }
  function dist3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  function conectorPorId(av, id) {
    var l = arr(av && av.conectores), i;
    for (i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(id)) return l[i];
    return null;
  }

  /* as ops na ordem em que o replay as lê (os lotes abertos), com a referência para reescrever */
  function referencias(ops) {
    var out = [];
    arr(ops).forEach(function (o, i) {
      if (o && o.op === "lote" && Array.isArray(o.ops)) o.ops.forEach(function (x, j) { if (x && x.op !== "lote") out.push({ op: x, lista: o.ops, i: j }); });
      else out.push({ op: o, lista: ops, i: i });
    });
    return out;
  }
  /* todo texto/valor-id que a op menciona (ids, novos, membros, inst...): para saber QUEM uma copia, matriz ou grupo toca */
  function mencoes(o, acc) {
    if (o == null) return acc;
    if (typeof o === "string" || typeof o === "number") { acc[String(o)] = 1; return acc; }
    if (Array.isArray(o)) { o.forEach(function (x) { mencoes(x, acc); }); return acc; }
    if (typeof o === "object") Object.keys(o).forEach(function (k) { if (k !== "T" && k !== "op") mencoes(o[k], acc); });
    return acc;
  }
  /* MAPA DO QUE ADIA POR CONSTRUCAO (revisor adversarial, 27/10/2026): copia (transformar com copia), matriz, ESPELHAR e grupo P10 - as pecas que eles tocam
     (origem E destino) ficam com a familia antiga. Mover e girar simples valem: a posicao final vem do replay. */
  function tocadasPorTransformacao(refs) {
    var tocadas = {};
    refs.forEach(function (r) {
      var o = r.op; if (!o) return;
      if (o.op === "matriz" || o.op === "grupo" || (o.op === "transformar" && (o.copia || (o.T && o.T.tipo === "espelhar")))) mencoes(o, tocadas);
    });
    return tocadas;
  }
  /* o replay da instancia, so o que importa para migrar: familia e as ops que a escrevem */
  function simular(refs) {
    var est = {}, bloqueios = {}, outras = {};
    refs.forEach(function (r) {
      var o = r.op, e;
      if (!o) return;
      if (o.op === "familia" && o.id != null && o.famId) {
        est[o.id] = { id: o.id, famId: String(o.famId), refs: [r], opsX: [r], opsY: o.y != null ? [r] : [], trocaFam: false };
      } else if (o.op === "instancia" && est[o.id]) {
        e = est[o.id]; e.refs.push(r);
        if (o.famId != null && String(o.famId) !== e.famId) e.trocaFam = true;   /* famId igual ao da instancia: so reescreve */
        if (o.y != null) e.opsY.push(r);
        if (o.x != null || o.z != null) e.opsX.push(r);
      } else if (o.op === "mover" && est[o.id]) {
        e = est[o.id]; e.refs.push(r); e.opsX.push(r);
      } else if (o.op === "apagar" && est[o.id]) {
        delete est[o.id];
      } else if (o.op === "ajustarTipo" && Array.isArray(o.ids)) {
        o.ids.forEach(function (id) { bloqueios[id] = "tipo da obra editado (ajustarTipo): os valores editados são da família antiga"; });
      } else if (o.op !== "orcar" && o.op !== "marcar" && o.op !== "familia" && o.op !== "criar") {
        var m = mencoes(o, {}); Object.keys(m).forEach(function (k) { outras[k] = 1; });   /* qualquer outra op que cite o id pode mexer na posicao */
      }
    });
    return { est: est, bloqueios: bloqueios, outras: outras };
  }

  function paramsDeInstancia(def) {
    var m = {};
    arr(def && def.parametros).forEach(function (p) { if (p && p.escopo === "instancia") m[p.nome] = 1; });
    return m;
  }
  function distPtSeg(p, a, b) {
    var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, L2 = ux * ux + uy * uy + uz * uz, t = L2 > 0 ? ((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return dist3(p, { x: a.x + ux * t, y: a.y + uy * t, z: a.z + uz * t });
  }

  /* migra as ops. ctx = { avaliar(famId, tipoId, inst), familia(famId), aplicar(ops) -> estado final do replay (BimEdit.aplicar), tolConector }.
     UM replay por chamada (nao um por instancia). Devolve { ops, mudou, trocas:[...], adiadas:[...] }; `ops` e a MESMA referencia quando nada mudou. */
  function migrarOps(ops, ctx) {
    var T = tabela(), L = limites(), res = { ops: ops, mudou: false, trocas: [], adiadas: [], versao: VERSAO };
    if (!Array.isArray(ops) || !ops.length) return res;
    var refs = referencias(ops), temAlias = false, i;
    for (i = 0; i < refs.length; i++) { var q = refs[i].op; if (q && q.op === "familia" && q.famId != null && tem(T, String(q.famId))) { temAlias = true; break; } }
    if (!temAlias) return res;   /* caminho rapido: projeto sem familia antiga */
    ctx = ctx || {};
    /* sem o BimInst nao ha como saber a tolerancia de ligacao do motor: ADIA TUDO (nada de adivinhar 3 cm) */
    var tolMotor = typeof ctx.tolConector === "number" ? ctx.tolConector : (global.BimInst && typeof global.BimInst.TOL_CONECTOR === "number" ? global.BimInst.TOL_CONECTOR : null), tolC = tolMotor;
    var sim = simular(refs), tocadas = tocadasPorTransformacao(refs), saida = copia(ops), refsS = referencias(saida), porOp = {};
    refs.forEach(function (r, k) { porOp[k] = refsS[k]; });
    var idxRef = function (r) { return refs.indexOf(r); };

    /* O ESTADO FINAL, UMA VEZ: posicoes, giro, tipo e parametros de TODAS as instancias, e onde ha tubo */
    var estado = null, aplicar = typeof ctx.aplicar === "function" ? ctx.aplicar : (global.BimEdit && typeof global.BimEdit.aplicar === "function" ? function (o) { return global.BimEdit.aplicar(o); } : null);
    if (aplicar) { try { estado = aplicar(ops); } catch (eA) { estado = null; } }
    var finais = {}, segs = [];
    if (estado) {
      arr(estado.familias).forEach(function (f) { if (f && f.id != null) finais[String(f.id)] = f; });
      var ins = estado.instalacoes || {};
      arr(ins.trechos).forEach(function (t) { if (t && t.p1 && t.p2) segs.push([t.p1, t.p2]); });
      arr(ins.acessorios).forEach(function (a2) { if (a2 && a2.a && a2.b) segs.push([a2.a, a2.b]); });
    }
    function ligadoA(P0) { for (var k = 0; k < segs.length; k++) if (distPtSeg(P0, segs[k][0], segs[k][1]) <= tolC) return true; return false; }
    /* sem o replay nao ha como saber a posicao final: cada instancia antiga vira "adiada" (a lista de instancias vem das ops) */
    var idsAlias = estado ? Object.keys(finais) : Object.keys(sim.est);

    idsAlias.forEach(function (id) {
      var fin = estado ? finais[id] : { famId: sim.est[id].famId }, regra = tem(T, String(fin.famId)) ? T[fin.famId] : null;
      if (!regra) return;
      var e = sim.est[id];
      function adiar(motivo) { res.adiadas.push({ id: id, de: fin.famId, para: regra.para, motivo: motivo }); }
      if (tocadas[id]) return adiar("a peça foi tocada por cópia, matriz, espelho ou grupo: migração manual (fica com a família antiga)");
      if (!e) return adiar("a instância não nasce de uma op de família (cópia, colagem ou grupo): fica com a família antiga");
      if (e.trocaFam) return adiar("a família foi trocada no histórico de operações (TROCAR POR…): migração manual");
      if (tolMotor == null) return adiar("sem o BimInst neste contexto (não sei a tolerância de ligação do motor): nada migra");
      if (!estado) return adiar("sem o replay do projeto neste contexto (não sei a posição final nem onde há tubo)");
      if (fin.host) return adiar("instância hospedada em parede: fora do escopo desta migração");
      if (sim.bloqueios[id] != null) return adiar(sim.bloqueios[id]);
      if (typeof ctx.avaliar !== "function") return adiar("sem o avaliador de famílias neste contexto");

      var tipoAntigo = fin.tipoId && tem(regra.tipos, fin.tipoId) ? fin.tipoId : ((fin.tipoId === "" || fin.tipoId == null) ? regra.tipoPadrao : null);
      if (tipoAntigo == null) return adiar("tipo \"" + fin.tipoId + "\" não está no mapa de tipos da família " + fin.famId);
      var tipoNovo = regra.tipos[tipoAntigo];
      var defNova = typeof ctx.familia === "function" ? ctx.familia(regra.para) : null;
      var chavesValidas = paramsDeInstancia(defNova), instNova = {}, descartadas = [], instAnt = fin.inst || {};
      Object.keys(instAnt).forEach(function (k) { if (tem(chavesValidas, k)) instNova[k] = instAnt[k]; else descartadas.push(k); });

      var avAnt = ctx.avaliar(fin.famId, tipoAntigo, instAnt), avNov = ctx.avaliar(regra.para, tipoNovo, instNova);
      if (!avAnt || avAnt.ok === false) return adiar("a família antiga " + fin.famId + " não avalia neste contexto");
      if (!avNov || avNov.ok === false) return adiar("a família nova " + regra.para + " (tipo " + tipoNovo + ") não está carregada ou não avalia");

      /* A familia nova NAO pode ter conector que a antiga nao tinha (outra funcao: ex. o chuveiro so de agua fria ganharia o ponto de agua quente) */
      var extras = arr(avNov.conectores).filter(function (kn) { return !conectorPorId(avAnt, kn.id) && !kn.opcional; }).map(function (kn) { return String(kn.id); });
      if (extras.length) return adiar("a família nova tem conector que a antiga não tinha (" + extras.join(", ") + "): é outra função; fica com a família antiga");

      var antes = { id: id, x: num(fin.x, 0), y: num(fin.y, 0), z: num(fin.z, 0), rotY: num(fin.rotY, 0) }, novo = { x: antes.x, y: antes.y, z: antes.z, rotY: antes.rotY };
      var c = Math.cos(antes.rotY), s = Math.sin(antes.rotY), avisos = [];
      if (regra.ancora !== "origem") {
        var ko = conectorPorId(avAnt, regra.ancora), kn2 = conectorPorId(avNov, regra.ancora);
        if (!ko || !kn2) return adiar("âncora \"" + regra.ancora + "\" ausente em " + (!ko ? fin.famId : regra.para));
        var P = mundo(antes, ko);
        novo.x = r4(P.x - (num(kn2.x, 0) * c + num(kn2.z, 0) * s));
        novo.y = regra.alinhar === "xz" ? antes.y : r4(P.y - num(kn2.y, 0));
        novo.z = r4(P.z - (-num(kn2.x, 0) * s + num(kn2.z, 0) * c));
      }
      var dx = r4(novo.x - antes.x), dy = r4(novo.y - antes.y), dz = r4(novo.z - antes.z);
      if (Math.sqrt(dx * dx + dz * dz) > L.deslocamentoHorizontalMax_m) return adiar("deslocamento horizontal de " + r4(Math.sqrt(dx * dx + dz * dz)) + " m acima do limite de " + L.deslocamentoHorizontalMax_m + " m");
      var limV = typeof regra.deslocamentoVerticalMax_m === "number" ? regra.deslocamentoVerticalMax_m : L.deslocamentoVerticalMax_m;
      if (Math.abs(dy) > limV) return adiar("deslocamento vertical de " + dy + " m acima do limite de " + limV + " m");
      /* o deslocamento e gravado na ultima op de posicao; se OUTRA op (girar, esticar...) cita a peca, ele nao se reaplica com seguranca */
      if ((dx || dy || dz) && sim.outras[id]) return adiar("a posição da peça também é alterada por outra operação (girar, esticar…): o deslocamento do ponto de ligação não se reaplica com segurança");

      /* residuos: os outros conectores, antes x depois (m) */
      var residuos = [], semEquivalente = [];
      arr(avAnt.conectores).forEach(function (ka) {
        var kb = conectorPorId(avNov, ka.id);
        if (!kb) { semEquivalente.push(String(ka.id)); return; }
        var d = dist3(mundo(antes, ka), mundo(novo, kb));
        if (d > L.toleranciaLigacao_m + 1e-9) residuos.push({ conector: String(ka.id), cm: Math.round(d * 1000) / 10 });
      });
      /* REGRA DO 1 cm: conector LIGADO a tubo (a ate TOL_CONECTOR do eixo do tubo, como o motor liga) que ficaria a mais de 1 cm, ou que some -> ADIA */
      var presos = [];
      arr(avAnt.conectores).forEach(function (ka) {
        var sumiu = semEquivalente.indexOf(String(ka.id)) >= 0, rs = residuos.filter(function (r2) { return r2.conector === String(ka.id); })[0];
        if ((sumiu || rs) && ligadoA(mundo(antes, ka))) presos.push(String(ka.id) + (sumiu ? " (some na família nova)" : " (" + rs.cm + " cm)"));
      });
      if (presos.length) return adiar("conector ligado a tubo ficaria a mais de " + Math.round(L.toleranciaLigacao_m * 100) + " cm: " + presos.join(", ") + " (a instância fica com a família antiga)");

      /* reescreve as ops da instancia (na COPIA) */
      function mapTipo(t) { if (t === "" || t == null) return tipoNovo; return tem(regra.tipos, t) ? regra.tipos[t] : tipoNovo; }
      function mapInst(inst) { var o = {}; Object.keys(inst || {}).forEach(function (k) { if (tem(chavesValidas, k)) o[k] = inst[k]; }); return o; }
      e.refs.forEach(function (r) {
        var o = porOp[idxRef(r)].op;
        if (o.op === "familia") { o.famId = regra.para; o.migradoDe = fin.famId; o.migracaoV = VERSAO; }
        if (o.op === "instancia" && o.famId != null) o.famId = regra.para;   /* instancia com o id ANTIGO (sem trocar de familia): vai para o destino */
        if (o.op === "familia" || o.tipoId != null) o.tipoId = mapTipo(o.tipoId);
        if (o.inst) o.inst = mapInst(o.inst);
      });
      /* o deslocamento vai em TODAS as ops de posicao absoluta (a familia e cada mover), nao so na ultima: o que o desfazer/refazer ou um corte da lista deixar vale igual */
      if (dx || dz) e.opsX.forEach(function (rx) {
        var ox = porOp[idxRef(rx)].op;
        if (ox.op === "mover") { if (ox.cx != null || ox.cz != null) { ox.cx = r4(num(ox.cx, antes.x) + dx); ox.cz = r4(num(ox.cz, antes.z) + dz); } }
        else if (ox.op === "familia") { ox.x = r4(num(ox.x, 0) + dx); ox.z = r4(num(ox.z, 0) + dz); }
        else { if (ox.x != null) ox.x = r4(num(ox.x, 0) + dx); if (ox.z != null) ox.z = r4(num(ox.z, 0) + dz); }
      });
      if (dy) { var ultY = e.opsY.length ? porOp[idxRef(e.opsY[e.opsY.length - 1])].op : porOp[idxRef(e.refs[0])].op; ultY.y = novo.y; }
      if (descartadas.length) avisos.push("parâmetros de instância sem equivalente na família nova (descartados): " + descartadas.join(", "));
      if (semEquivalente.length) avisos.push("conector(es) da família antiga sem equivalente na nova: " + semEquivalente.join(", ") + " (soltos: o ponto de ligação deixa de existir)");
      res.trocas.push({ id: id, de: fin.famId, para: regra.para, tipoDe: tipoAntigo, tipoPara: tipoNovo, ancora: regra.ancora,
                        deslocamento: { dx: dx, dy: dy, dz: dz }, residuos: residuos, semEquivalente: semEquivalente, instDescartada: descartadas, avisos: avisos, versao: VERSAO });
    });
    if (res.trocas.length) { res.ops = saida; res.mudou = true; }
    return res;
  }

  /* guarda o log (aparelho local, ultimas TETO_LOG linhas). `obra` entra na linha e na CHAVE anti-repeticao: a mesma troca/adiada da mesma obra nao e
     regravada a cada abertura (a chave e conferida contra o que JA esta guardado, nao so contra a sessao). Devolve so as linhas NOVAS. */
  function chaveLinha(l) { return [l.obra || "", l.tipo, l.id, l.de, l.para, l.tipoPara || "", l.motivo || ""].join("|"); }
  function registrar(r, quando, obra) {
    var linhas = [], q = quando || new Date().toISOString();
    arr(r && r.trocas).forEach(function (t) { linhas.push({ quando: q, obra: obra || "", tipo: "troca", id: t.id, de: t.de, para: t.para, tipoDe: t.tipoDe, tipoPara: t.tipoPara, deslocamento: t.deslocamento, residuos: t.residuos, descartados: t.instDescartada, avisos: t.avisos }); });
    arr(r && r.adiadas).forEach(function (a) { linhas.push({ quando: q, obra: obra || "", tipo: "adiada", id: a.id, de: a.de, para: a.para, motivo: a.motivo }); });
    if (!linhas.length) return linhas;
    var ant = [], novas = [];
    try { if (global.localStorage) { ant = JSON.parse(global.localStorage.getItem(CHAVE_LOG) || "[]"); if (!Array.isArray(ant)) ant = []; } } catch (e1) { ant = []; }
    var vistas = {}; ant.forEach(function (l) { vistas[chaveLinha(l)] = 1; });
    linhas.forEach(function (l) { var k = chaveLinha(l); if (!vistas[k]) { vistas[k] = 1; novas.push(l); } });
    if (!novas.length) return novas;
    try { if (global.localStorage) global.localStorage.setItem(CHAVE_LOG, JSON.stringify(ant.concat(novas).slice(-TETO_LOG))); } catch (e2) { /* sem armazenamento: o log fica so no retorno */ }
    try { if (global.console && global.console.info) global.console.info("[famhidmigra] " + novas.length + " linha(s) nova(s) no log", novas); } catch (e3) { /* sem console */ }
    return novas;
  }
  function lerLog() { try { return JSON.parse((global.localStorage && global.localStorage.getItem(CHAVE_LOG)) || "[]"); } catch (e) { return []; } }
  /* o resumo para o usuario ao abrir: "N pecas atualizadas para o catalogo; M mantidas (motivo)" + os parametros descartados */
  function resumo(r) {
    var tr = arr(r && r.trocas), ad = arr(r && r.adiadas), t = [], descart = [], motivos = {};
    if (!tr.length && !ad.length) return "";
    t.push(tr.length + (tr.length === 1 ? " peça atualizada" : " peças atualizadas") + " para o catálogo; " + ad.length + (ad.length === 1 ? " mantida" : " mantidas") + " como estavam");
    tr.forEach(function (x) { arr(x.instDescartada).forEach(function (k) { if (descart.indexOf(k) < 0) descart.push(k); }); });
    ad.forEach(function (x) { var m = String(x.motivo || "").split(":")[0].slice(0, 70); motivos[m] = (motivos[m] || 0) + 1; });
    if (ad.length) t.push("mantidas por: " + Object.keys(motivos).map(function (m) { return m + " (" + motivos[m] + ")"; }).join("; "));
    if (descart.length) t.push("parâmetros descartados: " + descart.join(", "));
    t.push("detalhe no log");
    return t.join(". ") + ".";
  }
  /* as familias DESTINO da tabela: o visor as registra mesmo com a previa do hidro desligada (peca ja migrada nao pode sumir) */
  function alvos() { var t = tabela(), o = {}; Object.keys(t).forEach(function (k) { o[t[k].para] = 1; }); return Object.keys(o); }
  /* SO o projeto que JA tem familia de destino (ja migrada) liga o registro do hidro: quem so tem a familia ANTIGA nao baixa o grupo (~3,7 MB) nem ganha funcao paga */
  function usaDestino(ops) {
    var al = alvos(), achou = false;
    referencias(ops).forEach(function (r) { var o = r.op; if (o && (o.op === "familia" || o.op === "instancia") && o.famId != null && al.indexOf(String(o.famId)) >= 0) achou = true; });
    return achou;
  }

  var FamHidMigra = {
    VERSAO: VERSAO, CHAVE_LOG: CHAVE_LOG,
    ehAlias: ehAlias, canonico: canonico, aliasDe: aliasDe, tabela: tabela, limites: limites,
    migrarOps: migrarOps, registrar: registrar, lerLog: lerLog, resumo: resumo, alvos: alvos, usaDestino: usaDestino, precisaHidro: false
  };
  global.FamHidMigra = FamHidMigra;
  if (typeof module !== "undefined" && module.exports) module.exports = FamHidMigra;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
