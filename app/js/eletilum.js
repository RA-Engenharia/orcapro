/* =====================================================================
 * eletilum.js — LIGAÇÃO ELÉTRICA AUTOMÁTICA DA ILUMINAÇÃO (motor PURO, ES5, Node-testável)
 *
 * Pedido do Rogério (21/10/2026): "quando a gente puxar uma luminária para um ambiente, ele já vai entender que
 * aquela luminária precisa de um ponto para ligar, o eletroduto que vai na parede, ou pelo forro, ou pela laje…
 * vai ter a opção de selecionar para onde vai. Essa lâmpada vai ligar em quais pontos: no interruptor perto da
 * porta… 'eu quero dois pontos, um próximo de cada porta', 'um próximo da janela'… Uma vez que a gente colocar a
 * iluminação, ele já vai estar certinho."
 *
 *   EletIlum.ligar({ ops | estado, avaliarFam, luminaria? | ambiente?, config? })
 *     → { ok, ambiente, ops (o LOTE: apaga a ligação anterior do ambiente e põe a nova), registro, comandos[], pontos[],
 *         esquema[], fiacao{}, avisos[], pendencias[], decisoes[], normas[] }
 *   EletIlum.interpretar(texto)            → { pontos: [specs], lados?, quantos?, entendido[], avisos[] }
 *   EletIlum.comandos(estado, avaliarFam)  → a lista de comandos que o render lê (contrato)
 *   EletIlum.cabos(estado)                 → metros de cabo por seção (o quantitativo do biminst soma)
 *   EletIlum.auditar(estado, avaliarFam, ops?) → problemas com o que é, Corrigir (ops) e Mostrar no 3D (ids, ponto)
 *
 * O QUE NASCE (as peças são as do biminst, editáveis e apagáveis):
 *   · PONTO DE LUZ: caixa octogonal na laje; no ambiente com forro, sobre o forro (a luminária desce até a face do forro);
 *     arandela (ponto na parede): caixa 4×2 no ponto dela;
 *   · INTERRUPTORES (família ra-interruptor) pela REGRA do ambiente: padrão = 1 na porta de ENTRADA, do lado da maçaneta,
 *     fora do arco da folha; "cada porta" (2 = paralelo, 3+ = paralelo nas pontas e intermediário no meio), "janela",
 *     "cabeceira da cama" (de um ou dos dois lados) ou pontos clicados; vários COMANDOS no mesmo ambiente (geral, spots,
 *     sanca…) dividem a mesma placa (1 módulo por comando);
 *   · ELETRODUTO: entre os pontos de luz (ortogonal, nos eixos do ambiente), do ponto de luz até cada interruptor (desce
 *     embutido na parede) e a ALIMENTAÇÃO até o quadro (família ra-quadro-distribuicao), até o ponto de luz de outro
 *     ambiente do mesmo circuito, ou — sem quadro — uma ESPERA na porta de entrada ("continua" até o quadro);
 *   · CAMINHO: automático (forro se houver, senão laje), forro, laje, parede (os trechos deitados correm dentro das
 *     paredes, acima das portas) ou piso (a alimentação desce do 1º interruptor e corre no contrapiso);
 *   · FIAÇÃO LÓGICA por trecho: fase, neutro, retorno (e os retornos do paralelo/intermediário) e terra, na seção da
 *     pesquisa; o eletroduto pelo número de condutores (regra provisória da pesquisa, marcada).
 *   · Desvia de viga/pilar quando uma das duas rotas ortogonais passa livre; senão AVISA o conflito (o auditor mostra).
 *
 * Tudo vai num LOTE (um Ctrl+Z desfaz). As ops levam `lig` (o registro do ambiente) e `ligParte`: religar troca só o
 * que é dele; a luminária nunca é apagada (só Comando, Circuito, Circuito_quadro e Altura_montagem são acertados).
 * Contrato com o render: docs/eletrica/CONTRATO-ILUMINACAO.md. Números de norma: js/eletilumdados.js (com a etiqueta
 * da pesquisa); os de DESENHO (afastamentos de traçado) ficam em GEO, trocáveis em config.geo.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function FR() { return dep("FamiliasRA", "./familiasra.js"); }
  function SP() { return dep("SimboloPorta", "./simboloporta.js"); }
  function DD() { return dep("EletIlumDados", "./eletilumdados.js"); }
  function TB() { return dep("EleTabelas", "./eletabelas.js"); }
  function ECI() { return dep("EleCircuitos", "./elecircuitos.js"); }
  function TRC() { return dep("EleTracado", "./eletracado.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function semAcento(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s); }
  function slug(s) { return semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "geral"; }
  var EPS = 1e-6;

  /* ⚠ GEOMETRIA DE DESENHO (não é norma) — trocável em config.geo */
  var GEO = {
    placa: 0.075,          // largura da placa 4×2 (a da família ra-interruptor)
    fundoCaixa: 0.03,      // o ponto do eletroduto atrás da placa (conector da família, z = −0,03)
    lajeTubo: 0.015,       // eixo do eletroduto acima do fundo da laje (dentro do concreto)
    forroTubo: 0.02,       // eixo do eletroduto acima da face de cima do forro
    paredeFolga: 0.10,     // pela parede: o trecho deitado corre esta folga acima do topo do vão mais alto do ambiente
    tetoFolga: 0.10,       // … e no máximo até esta folga abaixo do teto
    pisoTubo: 0.03,        // pelo piso: eixo no contrapiso, abaixo do piso acabado
    esperaFora: 0.30,      // a espera da alimentação passa a porta de entrada e fica esta distância do lado de fora
    afastCama: 0.20,       // da lateral da cama à placa do interruptor de cabeceira
    cantoMin: 0.02,        // folga da placa ao canto da parede
    mesmoPonto: 0.10,      // pontos a menos que isso viram a mesma caixa
    peDireito: 2.80,       // pé-direito assumido sem laje, forro nem ambiente com altura (PENDÊNCIA quando usado)
    tolColisao: 0.005
  };
  function geo(c, k) { return c && c.geo && isFinite(Number(c.geo[k])) ? Number(c.geo[k]) : GEO[k]; }
  function V(k) { var D = DD(); return D && D.valores ? D.valores[k] : null; }

  /* ------------------------------------------------------------- 2D */
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function dentro(p, pts) { var c = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) c = !c; } return c; }
  function area(pts) { var s = 0; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x + pts[i].x) * (pts[j].z - pts[i].z); return Math.abs(s) / 2; }
  function centro(pts) { var x = 0, z = 0; pts.forEach(function (p) { x += p.x; z += p.z; }); return { x: x / pts.length, z: z / pts.length }; }
  function soma(p, u, s) { return { x: p.x + u.x * s, z: p.z + u.z * s }; }
  function proj(p, a, b) { var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0; var tc = Math.max(0, Math.min(1, t)), q = { x: a.x + dx * tc, z: a.z + dz * tc }; return { t: t, tc: tc, q: q, d: d2(p, q), s: tc * Math.sqrt(L2) }; }

  /* ===================================================== O AMBIENTE LIDO */
  function famDef(famId) { var R = FR(); try { return R && R.obter ? R.obter(famId, true) : null; } catch (e) { return null; } }
  function avaliar(aval, f) { try { return typeof aval === "function" ? aval(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { return null; } }
  function categoria(f, av) {
    var F = famDef(f.famId), c = F && F.categoria ? txt(F.categoria) : "", id = txt(f.famId).toLowerCase();
    if (av && av.mep && av.mep.peca) return "mep:" + av.mep.peca;
    if (c) return c;
    if (/porta|portao/.test(id)) return "porta";
    if (/janela|vidro-fixo|basculante/.test(id)) return "janela";
    return "generico";
  }
  function ambientes(estado) { return arr(estado && estado.ambientes).filter(function (a) { return a && a.calc && arr(a.calc.contorno).length >= 3; }); }
  function ambienteEm(estado, p, y) {
    return ambientes(estado).filter(function (a) { var b = num(a.calc.base, 0); return (y == null || (y >= b - 0.5 && y <= b + num(a.calc.altura, 3) + 0.5)) && dentro(p, a.calc.contorno); })[0] || null;
  }
  /* o que a reforma DEMOLE não recebe interruptor nem conta como parede/vão (fase "demolida" marcada) */
  function demolido(o) { return !!(o && o.faseDemolida && o.faseDemolida !== "Nenhum"); }
  function paredes(estado) {
    return arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede" && !demolido(c); }).map(function (c) {
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, alt = num(c.altura, 0);
      return { id: c.id, p1: { x: c.cx - h * cs, z: c.cz + h * sn }, p2: { x: c.cx + h * cs, z: c.cz - h * sn }, esp: num(c.espessura, 0), base: c.cy - alt / 2, topo: c.cy + alt / 2 };
    });
  }
  /* o teto do ambiente: o fundo da laje logo acima; sem laje, a altura do ambiente; sem nada, assumido (pendência) */
  function tetoDe(estado, amb, base, c) {
    var C = centro(amb.calc.contorno), melhor = null;
    arr(estado && estado.caixas).forEach(function (cx) {
      if (!cx || cx.tipo !== "laje") return;
      var fundo = num(cx.cy, 0) - num(cx.altura, 0) / 2, pts = arr(cx.contorno);
      if (pts.length < 3) {
        var cs = Math.cos(num(cx.rotY, 0)), sn = Math.sin(num(cx.rotY, 0)), h = num(cx.comprimento, 0) / 2, w = num(cx.espessura, 0) / 2;
        pts = [[-h, -w], [h, -w], [h, w], [-h, w]].map(function (q) { return { x: cx.cx + q[0] * cs + q[1] * sn, z: cx.cz - q[0] * sn + q[1] * cs }; });
      }
      if (dentro(C, pts) && fundo > base + 1.0 && (!melhor || fundo < melhor.y)) melhor = { y: r4(fundo), origem: "fundo da laje " + cx.id, laje: cx.id };
    });
    if (melhor) return melhor;
    var tp = num(amb.calc.topo, NaN);
    if (tp > base + 1.0) return { y: r4(tp), origem: "altura do ambiente (sem laje no modelo)" };
    return { y: r4(base + geo(c, "peDireito")), origem: "pé-direito assumido de " + f2(geo(c, "peDireito")) + " m (sem laje nem altura no ambiente — informe o do projeto)", assumido: true };
  }
  function forroDe(estado, amb) {
    var f = arr(estado && estado.forros).filter(function (x) { return x && x.ok !== false && x.ambienteId === amb.id && isFinite(Number(x.cota)); })[0];
    return f ? { id: f.id, cota: r4(Number(f.cota)), esp: num(f.espessura, 0.0125) } : null;
  }
  /* as arestas (faces de parede) do ambiente, com a normal que ENTRA no ambiente e a parede atrás */
  function arestas(amb, W) {
    var P = amb.calc.contorno, out = [];
    for (var i = 0; i < P.length; i++) {
      var a = { x: P[i].x, z: P[i].z }, b = { x: P[(i + 1) % P.length].x, z: P[(i + 1) % P.length].z }, L = d2(a, b);
      if (L < 0.05) continue;
      var u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L }, n = { x: -u.z, z: u.x }, m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if (!dentro(soma(m, n, 0.05), P)) n = { x: u.z, z: -u.x };
      /* a parede: a linha de eixo a meia espessura do lado de FORA, paralela */
      var par = null;
      W.forEach(function (w) {
        if (par) return;
        var pr = proj(soma(m, n, -w.esp / 2), w.p1, w.p2), wl = d2(w.p1, w.p2);
        if (!(wl > 0)) return;
        var wu = { x: (w.p2.x - w.p1.x) / wl, z: (w.p2.z - w.p1.z) / wl };
        if (pr.d <= 0.03 && Math.abs(wu.x * u.z - wu.z * u.x) < 0.05 && pr.t > -0.01 && pr.t < 1.01) par = w;
      });
      out.push({ i: i, a: a, b: b, L: L, u: u, n: n, parede: par });
    }
    return out;
  }
  /* portas e janelas na borda do ambiente: centro, eixo, lado do ambiente, mão (maçaneta), para que lado abre */
  function vaos(estado, aval, amb) {
    var P = amb.calc.contorno, porId = {}, out = [];
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.id != null) porId[c.id] = c; });
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || !f.host || f.x == null || demolido(f)) return;
      var av = avaliar(aval, f), cat = categoria(f, av);
      if (cat !== "porta" && cat !== "janela") return;
      var par = porId[f.host.id], esp = num(par && par.espessura, num(f.inst && f.inst.Espessura_parede, 0.15));
      var th = num(f.rotY, num(par && par.rotY, 0)), ux = { x: Math.cos(th), z: -Math.sin(th) }, nz = { x: Math.sin(th), z: Math.cos(th) }, D = { x: num(f.x, 0), z: num(f.z, 0) };
      var lado = dentro(soma(D, nz, esp / 2 + 0.15), P) ? 1 : (dentro(soma(D, nz, -esp / 2 - 0.15), P) ? -1 : 0);
      if (!lado) return;
      var nR = { x: nz.x * lado, z: nz.z * lado }, val = (av && av.valores) || {};
      var W = av && av.abertura && av.abertura.largura > 0 ? av.abertura.largura : num(val.Largura, cat === "porta" ? 0.8 : 1.2);
      var pd = null; try { pd = SP() && SP().daFamilia ? SP().daFamilia(famDef(f.famId) || { id: f.famId }, av, f.inst || {}) : null; } catch (e) { pd = null; }
      var dob = pd ? pd.dobradica : ((f.inst && (f.inst.Mao_direita === true || f.inst.Mao_direita === "true")) ? "fim" : "ini");
      var abre = pd ? pd.abre : ((f.inst && (f.inst.Abre_para_fora === true || f.inst.Abre_para_fora === "true")) ? 1 : -1);
      var outro = ambienteEm(estado, soma(D, nR, -(esp / 2 + 0.3)), num(f.y, 0) + 1);
      out.push({ id: String(f.id), tipo: cat, famId: f.famId, D: D, ux: ux, nR: nR, esp: esp, W: W, batente: num(val.Batente, num(val.Marco, 0.05)), peitoril: num(av && av.abertura && av.abertura.peitoril, 0),
        topo: num(f.y, 0) + num(av && av.abertura && av.abertura.peitoril, 0) + num(av && av.abertura && av.abertura.altura, cat === "porta" ? 2.1 : 1.0),
        dob: dob, abre: abre, abreParaDentro: abre === lado, correr: !!(pd && pd.tipo === "correr") || /correr/.test(txt(f.famId)), outro: outro ? { id: outro.id, nome: txt(outro.nome) } : null, parede: f.host.id });
    });
    return out;
  }
  /* PASSAGEM ABERTA (lado do ambiente sem parede, ≥ 0,60 m — a circulação aberta para a sala): conta como um vão sem folha,
     para a entrada e para o interruptor "ao lado da porta" (ele vai para a parede vizinha da abertura) */
  function passagens(estado, amb, ars) {
    return ars.filter(function (e) { return !e.parede && e.L >= 0.6; }).map(function (e) {
      var D = { x: (e.a.x + e.b.x) / 2, z: (e.a.z + e.b.z) / 2 }, outro = ambienteEm(estado, soma(D, e.n, -0.3), num(amb.calc.base, 0) + 1);
      return { id: "passagem-" + e.i, tipo: "porta", passagem: true, D: D, ux: e.u, nR: e.n, esp: 0, W: e.L, batente: 0, peitoril: 0, topo: num(amb.calc.base, 0) + 2.1,
        dob: "ini", abre: -1, abreParaDentro: false, correr: true, outro: outro && outro.id !== amb.id ? { id: outro.id, nome: txt(outro.nome) } : null, parede: null };
    });
  }
  /* ESCOLHA DA PORTA DE ENTRADA (decisão RA, regra fixa): a que dá para a circulação/sala; ambiente de apoio (banho,
     closet) entra pelo quarto; cômodo social entra de fora; empate = a porta mais larga */
  var RX = { circ: /circula|corredor|hall|escada|passagem/, social: /estar|sala|living|jantar|varanda|gourmet|copa/, quarto: /quarto|suite|dormit/,
             apoio: /banh|wc|lavabo|closet|despensa|deposito|lavanderia|servico/, cozinha: /cozinha/ };
  function classe(nome) { var n = semAcento(nome).toLowerCase(); for (var k in RX) if (RX[k].test(n)) return k; return "outro"; }
  function notaEntrada(v, cAmb) {
    var o = v.outro ? classe(v.outro.nome) : "fora", n = 0;
    if (o === "circ") n = 4; else if (o === "social") n = 3; else if (o === "fora") n = (cAmb === "social" || cAmb === "cozinha" || cAmb === "circ") ? 3 : 1;
    else if (o === "quarto") n = (cAmb === "apoio") ? 3 : 2; else if (o === "cozinha") n = 2; else if (o === "apoio") n = 1; else n = 2;
    if (v.correr && !v.passagem && o === "fora") n -= 0.5;   /* a porta de vidro de correr para o jardim raramente é a entrada */
    if (v.passagem) n += (o === "fora" ? -2 : 0.5);   /* a passagem aberta para a sala/circulação é a entrada natural */
    return n;
  }
  function entradas(portas, amb) {
    var c = classe(amb.nome);
    return portas.slice().sort(function (a, b) { return (notaEntrada(b, c) - notaEntrada(a, c)) || (b.W - a.W) || (a.id < b.id ? -1 : 1); });
  }
  function entradaDe(portas, amb) { return entradas(portas, amb)[0] || null; }

  /* ============================================== PONTOS DE INTERRUPTOR */
  /* acha a face de parede do ambiente sob o ponto F e confere se a placa cabe ali (longe do canto e fora de outro vão) */
  function naFace(ctx, F, c) {
    var best = null;
    ctx.arestas.forEach(function (e) { var pr = proj(F, e.a, e.b); if (!best || pr.d < best.pr.d) best = { e: e, pr: pr }; });
    if (!best) return { ok: false, motivo: "o ambiente não tem paredes" };
    var e = best.e, s = best.pr.s, folga = geo(c, "placa") / 2 + geo(c, "cantoMin");
    if (best.pr.d > 0.08) return { ok: false, motivo: "o ponto não está numa parede do ambiente" };
    if (!e.parede) return { ok: false, motivo: "não há parede neste lado do ambiente" };
    if (s < folga || s > e.L - folga) return { ok: false, motivo: "não cabe: fica no canto da parede" };
    var q = best.pr.q, choca = ctx.vaos.filter(function (v) { var dd = (q.x - v.D.x) * v.ux.x + (q.z - v.D.z) * v.ux.z, dn = Math.abs((q.x - v.D.x) * v.nR.x + (q.z - v.D.z) * v.nR.z); return dn < v.esp + 0.05 && Math.abs(dd) < v.W / 2 + v.batente + geo(c, "placa") / 2; })[0];
    if (choca) return { ok: false, motivo: "cai no vão " + (choca.tipo === "porta" ? "da porta " : "da janela ") + choca.id };
    return { ok: true, x: r4(q.x), z: r4(q.z), n: e.n, aresta: e.i, parede: e.parede.id };
  }
  /* o interruptor ao lado do vão: do lado da maçaneta (lado = 1) ou do outro (lado = −1) */
  function pontoVao(ctx, v, lado, c) {
    var hs = v.dob === "fim" ? -1 : 1, s = hs * lado, dB = num((V("distBatente") || {}).valor, 0.10);
    var off = v.W / 2 + v.batente + dB + geo(c, "placa") / 2;
    var F = soma(soma(v.D, v.ux, s * off), v.nR, v.esp / 2), p = naFace(ctx, F, c);
    if (p.ok) return p;
    /* o vão encosta no CANTO: o interruptor vira para a parede vizinha, logo depois do canto (a mesma folga do batente) */
    var Fv = soma(soma(v.D, v.ux, s * (v.W / 2 + v.batente)), v.nR, v.esp / 2), cant = null;
    ctx.arestas.forEach(function (e) { [e.a, e.b].forEach(function (q) { var dq = (q.x - Fv.x) * v.ux.x * s + (q.z - Fv.z) * v.ux.z * s; if (dq > -0.02 && dq < dB + geo(c, "placa") + 0.05 && Math.abs((q.x - Fv.x) * v.nR.x + (q.z - Fv.z) * v.nR.z) < 0.05 && (!cant || dq < cant.d)) cant = { q: q, d: dq }; }); });
    if (!cant) return p;
    var viz = ctx.arestas.filter(function (e) { var ta = d2(e.a, cant.q) < 1e-3, tb = d2(e.b, cant.q) < 1e-3; return (ta || tb) && Math.abs(e.u.x * v.ux.x + e.u.z * v.ux.z) < 0.5; })[0];
    if (!viz) return p;
    var dir = d2(viz.a, cant.q) < 1e-3 ? viz.u : { x: -viz.u.x, z: -viz.u.z }, q2 = naFace(ctx, soma(cant.q, dir, dB + geo(c, "placa") / 2 + geo(c, "cantoMin")), c);
    if (q2.ok) { q2.virouCanto = true; return q2; }
    return p;
  }
  function pontoPorta(ctx, v, c, out) {
    var p = pontoVao(ctx, v, 1, c);
    if (p.ok) { p.ladoMacaneta = true; return p; }
    var q = pontoVao(ctx, v, -1, c);
    if (q.ok) {
      q.ladoMacaneta = false;
      out.avisos.push("porta " + v.id + ": do lado da maçaneta " + p.motivo + "; o interruptor foi para o lado da dobradiça" + (v.abreParaDentro && !v.correr ? " — fica ATRÁS da folha aberta, confira" : ""));
      return q;
    }
    out.pendencias.push({ chave: "interruptor.porta", motivo: "porta " + v.id + ": nenhum dos dois lados recebe o interruptor (" + p.motivo + "; " + q.motivo + ") — clique o ponto", ids: [v.id] });
    return null;
  }
  function camas(estado, aval, amb) {
    return arr(estado && estado.familias).filter(function (f) { return f && !f.host && /cama/.test(semAcento(f.famId + " " + (f.comentarios || "")).toLowerCase()) && !/sofa/.test(txt(f.famId)) && dentro({ x: num(f.x, 0), z: num(f.z, 0) }, amb.calc.contorno); })
      .map(function (f) { var av = avaliar(aval, f); return { f: f, cx: av && av.caixa ? av.caixa : { x0: -0.7, x1: 0.7, z0: 0, z1: 2 } }; });
  }
  function pontosCabeceira(ctx, cama, lados, c, out) {
    var f = cama.f, th = num(f.rotY, 0), lx = { x: Math.cos(th), z: -Math.sin(th) }, lz = { x: Math.sin(th), z: Math.cos(th) }, O = { x: num(f.x, 0), z: num(f.z, 0) };
    var xm = (cama.cx.x0 + cama.cx.x1) / 2, hw = (cama.cx.x1 - cama.cx.x0) / 2;
    var ends = [cama.cx.z0, cama.cx.z1].map(function (zz) { var P = soma(soma(O, lx, xm), lz, zz), dm = Infinity; ctx.arestas.forEach(function (e) { if (e.parede) dm = Math.min(dm, proj(P, e.a, e.b).d); }); return { P: P, d: dm }; });
    var H = ends[0].d <= ends[1].d ? ends[0] : ends[1];
    var cands = [1, -1].map(function (s) { var F = soma(H.P, lx, s * (hw + geo(c, "afastCama") + geo(c, "placa") / 2)); return naFace(ctx, F, c); }).filter(function (p) { return p.ok; });
    if (!cands.length) { out.pendencias.push({ chave: "interruptor.cabeceira", motivo: "cama " + f.id + ": a cabeceira não encosta numa parede livre dos dois lados — clique o ponto", ids: [f.id] }); return []; }
    if (lados < 2) { cands.sort(function (a, b) { return d2(b, ctx.c) - d2(a, ctx.c); }); return [cands[cands.length - 1]]; }
    return cands;
  }

  /* ============================================ A REGRA EM TEXTO LIVRE
   * Regras fixas (sem IA): "um próximo de cada porta", "dois pontos, um em cada porta", "um próximo da janela",
   * "na cabeceira da cama", "dos dois lados da cama", "só na entrada". O que não casa: o padrão (entrada), com aviso. */
  var NUMS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 };
  function interpretar(texto) {
    var t = " " + semAcento(texto).toLowerCase().replace(/[.,;:!?]/g, " ").replace(/\s+/g, " ") + " ", out = { pontos: [], entendido: [], avisos: [] };
    var cada = /(cada|todas as|nas duas|nas tres|em todas as) portas?|portas? (de|da) cada|um (proximo|perto|junto) (a|de|da) cada|(proximo|perto|junto) (a|de|da)s? (duas|tres|todas)/.test(t) || (/cada/.test(t) && /porta/.test(t));
    if (cada) { out.pontos.push({ tipo: "todas_portas" }); out.entendido.push("um interruptor em cada porta"); }
    var jan = /janela/.test(t), cab = /cabeceira|cama/.test(t), so = /\b(so|somente|apenas)\b/.test(t);
    var ent = /entrada|porta principal|na porta\b|da porta\b|perto da porta|junto da porta/.test(t) && !cada;
    if (ent || (!cada && !(so && (jan || cab)))) {
      if (ent || jan || cab) { out.pontos.unshift({ tipo: "entrada" }); out.entendido.unshift("um na porta de entrada"); }
    }
    if (jan) { out.pontos.push({ tipo: "janela" }); out.entendido.push("um perto da janela"); }
    if (cab) { var l2 = /dois lados|ambos os lados|cada lado|duas? (lados|cabeceiras)|lados da cama/.test(t); out.pontos.push({ tipo: "cabeceira", lados: l2 ? 2 : 1 }); out.entendido.push(l2 ? "um de cada lado da cabeceira" : "um na cabeceira da cama"); }
    var m = /\b(\d+|um|uma|dois|duas|tres|quatro|cinco) (pontos|interruptores|lugares)\b/.exec(t);
    if (m) out.quantos = NUMS[m[1]] || num(m[1], null);
    if (!out.pontos.length) { out.pontos.push({ tipo: "entrada" }); out.avisos.push("não reconheci a regra em \"" + txt(texto).slice(0, 80) + "\": usei o padrão (um interruptor na porta de entrada)"); out.entendido.push("padrão: um na porta de entrada"); }
    return out;
  }
  function rotVao(v) { return v.passagem ? "passagem" + (v.outro ? " para " + v.outro.nome : "") : (v.tipo === "porta" ? "porta " : "janela ") + v.id; }
  function rotuloRegra(p) { return { entrada: "porta de entrada", todas_portas: "cada porta", porta: "porta", janela: "janela", cabeceira: "cabeceira da cama", ponto: "ponto clicado" }[p.tipo] || p.tipo; }

  /* a lista de pontos (na ordem do encadeamento: a entrada primeiro, depois o mais perto) para um conjunto de specs */
  function resolverPontos(ctx, specs, c, out) {
    var pts = [];
    function add(p, rot, ref) { if (!p || !p.ok) return; if (pts.some(function (q) { return d2(q, p) < geo(c, "mesmoPonto"); })) return; p.rotulo = rot; p.ref = ref || null; pts.push(p); }
    var portas = ctx.vaos.filter(function (v) { return v.tipo === "porta"; }), jans = ctx.vaos.filter(function (v) { return v.tipo === "janela"; });
    arr(specs).forEach(function (s) {
      if (s.tipo === "entrada") {
        if (!ctx.entrada) { out.pendencias.push({ chave: "interruptor.entrada", motivo: "o ambiente " + ctx.nome + " não tem porta no modelo: clique o ponto do interruptor", ids: [] }); return; }
        /* a entrada que não recebe o interruptor (vão no canto dos dois lados): a próxima porta da ordem de entrada, com aviso */
        var ordem = ctx.entradas, achou = null, out2 = { avisos: [], pendencias: [] };
        for (var ie = 0; ie < ordem.length && !achou; ie++) { var pp = pontoPorta(ctx, ordem[ie], c, ie ? out2 : out); if (pp) achou = { p: pp, v: ordem[ie] }; }
        if (achou) { if (achou.v !== ctx.entrada) { out.avisos.push("a porta de entrada " + ctx.entrada.id + " não recebe o interruptor: ficou na " + rotVao(achou.v)); out.pendencias = out.pendencias.filter(function (q) { return q.chave !== "interruptor.porta"; }); } add(achou.p, achou.v === ctx.entrada ? "porta de entrada (" + rotVao(achou.v) + ")" : rotVao(achou.v), achou.v.id); }
      }
      else if (s.tipo === "todas_portas") { if (!portas.length) out.pendencias.push({ chave: "interruptor.portas", motivo: "o ambiente " + ctx.nome + " não tem porta no modelo", ids: [] }); portas.slice().sort(function (a, b) { return a === ctx.entrada ? -1 : (b === ctx.entrada ? 1 : 0); }).forEach(function (v) { add(pontoPorta(ctx, v, c, out), rotVao(v) + (v.passagem ? "" : (v.outro ? " (para " + v.outro.nome + ")" : " (para fora)")), v.id); }); }
      else if (s.tipo === "porta") { var v0 = portas.filter(function (v) { return v.id === txt(s.ref); })[0]; if (v0) add(pontoPorta(ctx, v0, c, out), "porta " + v0.id, v0.id); }
      else if (s.tipo === "janela") {
        if (!jans.length) { out.avisos.push("o ambiente " + ctx.nome + " não tem janela: o ponto da janela ficou de fora"); return; }
        var j = jans.slice().sort(function (a, b) { return b.W - a.W; })[0], ref = pts[0] || ctx.c;
        var cs = [pontoVao(ctx, j, 1, c), pontoVao(ctx, j, -1, c)].filter(function (p) { return p.ok; }).sort(function (a, b) { return d2(a, ref) - d2(b, ref); });
        if (cs.length) add(cs[0], "janela " + j.id, j.id); else out.pendencias.push({ chave: "interruptor.janela", motivo: "janela " + j.id + ": não há parede livre ao lado dela para o interruptor", ids: [j.id] });
      } else if (s.tipo === "cabeceira") {
        var cm = camas(ctx.estado, ctx.aval, ctx.amb);
        if (!cm.length) { out.avisos.push("o ambiente " + ctx.nome + " não tem cama no modelo: o ponto da cabeceira ficou de fora"); return; }
        pontosCabeceira(ctx, cm[0], num(s.lados, 1), c, out).forEach(function (p, k) { add(p, "cabeceira da cama" + (num(s.lados, 1) > 1 ? (k ? " (lado 2)" : " (lado 1)") : ""), cm[0].f.id); });
      } else if (s.tipo === "ponto") {
        var p = naFace(ctx, { x: num(s.x, 0), z: num(s.z, 0) }, c);
        if (p.ok) add(p, "ponto clicado"); else out.pendencias.push({ chave: "interruptor.ponto", motivo: "ponto clicado (" + f2(num(s.x, 0)) + "; " + f2(num(s.z, 0)) + "): " + p.motivo, ids: [] });
      } else if (s.tipo === "existentes") {
        /* FONTE ÚNICA (integração n23, 23/10/2026): os interruptores que o ambiente JÁ TEM (o "Lançar pontos elétricos" ou à mão)
           são os pontos — a ligação liga neles e não põe outro ao lado. Antes nasciam dois na mesma porta e os dois eram orçados. */
        var ex = arr(ctx.existentes).slice();
        if (ctx.entrada) ex.sort(function (a, b) { return d2(a, ctx.entrada.D) - d2(b, ctx.entrada.D); });
        ex.forEach(function (e) { add({ ok: true, x: e.x, z: e.z, n: e.n, aresta: null, parede: null, adota: e.id, ladoMacaneta: true }, "interruptor existente " + e.id, null); });
      }
    });
    /* encadeamento: o 1º fica; os outros pelo vizinho mais perto */
    if (pts.length > 2) { var ord = [pts.shift()]; while (pts.length) { var u = ord[ord.length - 1]; pts.sort(function (a, b) { return d2(a, u) - d2(b, u); }); ord.push(pts.shift()); } pts = ord; }
    return pts;
  }

  /* ============================================ COMANDOS E LUMINÁRIAS */
  function grupoPadrao(f, av) {
    var v = (av && av.valores) || {}, s = semAcento(txt(f.famId) + " " + txt(v.Modelo) + " " + txt(v.Tipo_luz) + " " + txt(f.tipoId)).toLowerCase();
    if (/sanca|fita/.test(s)) return "Sanca";
    if (/ventilador/.test(s)) return "Ventilador";
    if (/arandela/.test(s)) return "Arandela";
    if (/pendente|lustre/.test(s)) return "Pendente";
    if (/spot/.test(s)) return "Spots";
    return "Geral";
  }
  function luminariasDe(estado, aval, amb, base, teto) {
    var out = [];
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || f.host) return;
      var av = avaliar(aval, f); if (!av || !av.mep || av.mep.peca !== "luminaria") return;
      if (!dentro({ x: num(f.x, 0), z: num(f.z, 0) }, amb.calc.contorno)) return;
      if (num(f.y, 0) < base - 0.5 || num(f.y, 0) > teto) return;
      var B = BI(), cs = B && B.conectoresDe ? B.conectoresDe(av, f) : [], k = cs.filter(function (q) { return q.sistema === "eletrica"; })[0];
      out.push({ f: f, av: av, con: k || null });
    });
    return out.sort(function (a, b) { return a.f.id < b.f.id ? -1 : 1; });
  }
  function quadrosDe(estado, aval, base) {
    var out = [];
    arr(estado && estado.familias).forEach(function (f) {
      var av = avaliar(aval, f); if (!av || !av.mep || av.mep.peca !== "quadro") return;
      if (Math.abs(num(f.y, 0) - base) > 1.5) return;
      var B = BI(), cs = B && B.conectoresDe ? B.conectoresDe(av, f) : [], k = cs.filter(function (q) { return q.sistema === "eletrica"; })[0];
      if (k) out.push({ f: f, con: k });
    });
    return out;
  }
  function cargaMinima(a) { var M = V("cargaMinima") || { ateM2: 6, vaBase: 100, passoM2: 4, vaPasso: 60 }; return a <= M.ateM2 ? M.vaBase : M.vaBase + M.vaPasso * Math.floor((a - M.ateM2) / M.passoM2 + 1e-9); }
  /* ⚠ UMA régua de DN para a instalação inteira (integração n23, 23/10/2026): com o js/eletabelas.js carregado (o app sempre
     carrega), o DN é o da ficha do fabricante pelo número de condutores e pela seção (a mesma do projeto dos circuitos —
     EleTabelas.dnMinimo); só sem ela fica a regra provisória da pesquisa. Antes eram duas réguas: o circuito subia o DN do
     eletroduto e o "religar" da iluminação o baixava de volta. */
  function dnPara(n, secao) {
    var T = TB();
    if (T && T.dnMinimo) { var d = T.dnMinimo(n, secao != null ? secao : 1.5); return d == null ? 32 : d; }
    var R = (V("dnPorCondutores") || { regra: [[3, 20], [6, 25], [99, 32]] }).regra; for (var i = 0; i < R.length; i++) if (n <= R[i][0]) return R[i][1]; return R[R.length - 1][1];
  }
  /* o PROJETO dos circuitos gravado no quadro (js/elecircuitos.js): quando existe, ele é o dono do circuito de cada ponto e do cabo */
  function projetoCircuitos(estado, aval) { var C = ECI(); if (!C || !C.quadroDe) return null; try { var q = C.quadroDe(estado, aval); return q && q.projeto ? q.projeto : null; } catch (e) { return null; } }
  /* as COMPONENTES da rede de eletrodutos que já existe (sem as peças desta ligação): quem já está ligado a quem por eletroduto */
  function componentes(estado, ehMeu, quadroF, pontos) {
    var T = TRC(); if (!T || !T.grafo) return null;
    var e2 = { instalacoes: { trechos: arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return !ehMeu(t.id); }), pecas: arr(estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return !ehMeu(k.id); }) } };
    var G = T.grafo(e2, quadroF, arr(pontos)), pai = {};
    function f(x) { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; }
    G.nos.forEach(function (nd) { pai[nd.k] = nd.k; });
    Object.keys(G.adj).forEach(function (a) { G.adj[a].forEach(function (e) { var ra = f(Number(a)), rb = f(e.b); if (ra !== rb) pai[rb] = ra; }); });
    return { deCaixa: function (id) { var k = G.noDeCaixa[id]; return k == null ? null : f(k); }, dePonto: function (id) { var k = G.noDePonto[id]; return k == null ? null : f(k); }, qd: G.noQD == null ? null : f(G.noQD) };
  }
  function materialPara(apl) { return apl === "laje" || apl === "piso" ? "elet_corrugado_ref" : "elet_corrugado"; }

  /* ================================================ COLISÃO (viga/pilar) */
  function obstaculos(estado) {
    var out = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c) return;
      if (c.tipo === "viga" || c.tipo === "pilar") out.push({ id: c.id, tipo: c.tipo, c: { x: num(c.cx, 0), y: num(c.cy, 0), z: num(c.cz, 0) }, r: num(c.rotY, 0), h: [num(c.comprimento, 0.2) / 2, num(c.altura, 0.3) / 2, num(c.espessura, 0.2) / 2] });
      else if (c.tipo === "metal" && c.metal && c.metal.o && c.metal.ex && isFinite(Number(c.metal.L))) {
        var m = c.metal, pf = m.perfil || {}, pad = Math.max(num(pf.d, 0.1), num(pf.bf, 0.1)) / 2, a = m.o, b = { x: m.o.x + m.ex.x * m.L, y: m.o.y + m.ex.y * m.L, z: m.o.z + m.ex.z * m.L };
        out.push({ id: c.id, tipo: /pilar|coluna/i.test(txt(m.papel)) ? "pilar" : "viga", c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, r: 0,
          h: [Math.abs(a.x - b.x) / 2 + pad, Math.abs(a.y - b.y) / 2 + pad, Math.abs(a.z - b.z) / 2 + pad] });
      }
    });
    return out;
  }
  function cortaCaixa(p, q, o, tol) {
    var cs = Math.cos(o.r), sn = Math.sin(o.r);
    function loc(a) { var dx = a.x - o.c.x, dz = a.z - o.c.z; return [dx * cs - dz * sn, a.y - o.c.y, dx * sn + dz * cs]; }
    var A = loc(p), B = loc(q), t0 = 0, t1 = 1;
    for (var k = 0; k < 3; k++) {
      var h = o.h[k] - tol, d = B[k] - A[k];
      if (Math.abs(d) < 1e-12) { if (A[k] < -h || A[k] > h) return false; continue; }
      var ta = (-h - A[k]) / d, tb = (h - A[k]) / d; if (ta > tb) { var tt = ta; ta = tb; tb = tt; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
    }
    return true;
  }
  function colide(ctx, p, q, c) { return ctx.obst.filter(function (o) { return cortaCaixa(p, q, o, geo(c, "tolColisao")); }); }

  /* ================================================ ROTAS ORTOGONAIS */
  function quadro(ctx) {
    var e = ctx.arestas.slice().sort(function (a, b) { return b.L - a.L; })[0];
    return e ? [e.u, e.n] : [{ x: 1, z: 0 }, { x: 0, z: 1 }];
  }
  /* A → B na cota y, com 0 ou 1 canto nos eixos do ambiente; a 1ª das duas rotas sem viga/pilar. `ultimo` (normal da parede de
     chegada) faz a rota CHEGAR perpendicular à parede (o canto do lado do ambiente) */
  function rotaOrto(ctx, A, B, y, c, ultimo) {
    var eixos = ultimo ? [{ x: -ultimo.z, z: ultimo.x }, ultimo] : ctx.eixos, cands = [];
    eixos.forEach(function (e) {
      var s = (B.x - A.x) * e.x + (B.z - A.z) * e.z, K = { x: A.x + e.x * s, z: A.z + e.z * s };
      cands.push(d2(K, A) < 0.01 || d2(K, B) < 0.01 ? [A, B] : [A, K, B]);
    });
    var pts3 = function (L) { return L.map(function (p) { return { x: r4(p.x), y: r4(y), z: r4(p.z) }; }); };
    var melhor = null;
    for (var i = 0; i < cands.length; i++) {
      var L = pts3(cands[i]), hits = [], sob = 0;
      for (var k = 1; k < L.length; k++) { colide(ctx, L[k - 1], L[k], c).forEach(function (o) { if (hits.indexOf(o) < 0) hits.push(o); }); sob += sobrepoe(ctx, L[k - 1], L[k]); }
      var nota = hits.length * 10 + sob;
      if (!melhor || nota < melhor.nota) melhor = { pts: L, conflito: hits.length ? hits : null, nota: nota, sobreposto: sob };
    }
    return melhor;
  }
  /* o trecho novo CORRE POR CIMA de um que já foi traçado (dois eletrodutos no mesmo eixo) ou passa pela ponta dele (uma derivação
     sem caixa): a rota que evita isso vence */
  function sobrepoe(ctx, p, q) {
    var n = 0, L = Math.sqrt(Math.pow(q.x - p.x, 2) + Math.pow(q.z - p.z, 2)); if (L < 0.01 || Math.abs(p.y - q.y) > 0.01) return 0;
    var u = { x: (q.x - p.x) / L, z: (q.z - p.z) / L };
    arr(ctx.feitos).forEach(function (t) {
      if (!t.alheio) [t.p1, t.p2].forEach(function (e) { if (Math.abs(e.y - p.y) > 0.02) return; var pr = proj(e, p, q); if (pr.d < 0.01 && pr.t > 0.01 && pr.t < 0.99) n++; });
      if (Math.abs(t.p1.y - p.y) > 0.01 || Math.abs(t.p2.y - p.y) > 0.01) return;
      var a = (t.p1.x - p.x) * u.x + (t.p1.z - p.z) * u.z, b = (t.p2.x - p.x) * u.x + (t.p2.z - p.z) * u.z;
      var da = Math.abs((t.p1.x - p.x) * u.z - (t.p1.z - p.z) * u.x), db = Math.abs((t.p2.x - p.x) * u.z - (t.p2.z - p.z) * u.x);
      if (da < 0.02 && db < 0.02 && Math.min(L, Math.max(a, b)) - Math.max(0, Math.min(a, b)) > 0.02) n++;
    });
    return n;
  }

  /* ===================================================== LIGAR UM AMBIENTE */
  function achatar(ops) { var o = []; arr(ops).forEach(function (x) { if (x && x.op === "lote") arr(x.ops).forEach(function (y) { o.push(y); }); else if (x) o.push(x); }); return o; }
  function registroDe(estado, id) { return arr(estado && estado.instalacoes && estado.instalacoes.ligacoes).filter(function (r) { return r.id === id; })[0] || null; }

  function ligar(o) {
    o = o || {};
    var out = { ok: false, ambiente: null, ops: [], registro: null, comandos: [], pontos: [], esquema: [], fiacao: { porTrecho: {}, totais: {} }, avisos: [], pendencias: [], decisoes: [], normas: [] };
    var B = BI(); if (!B) { out.pendencias.push({ chave: "motor", motivo: "o motor de instalações (js/biminst.js) não carregou" }); return out; }
    var ops0 = achatar(o.ops), estado = o.estado || (BE() ? BE().aplicar(ops0) : null), aval = o.avaliarFam;
    if (!estado) { out.pendencias.push({ chave: "estado", motivo: "sem o estado do modelo" }); return out; }
    /* o ambiente: o que contém a luminária, ou o pedido */
    var amb = null;
    if (o.ambiente) amb = ambientes(estado).filter(function (a) { return a.id === o.ambiente; })[0] || null;
    if (!amb && o.luminaria != null) {
      var fl = arr(estado.familias).filter(function (f) { return f.id === o.luminaria; })[0];
      if (fl) amb = ambienteEm(estado, { x: num(fl.x, 0), z: num(fl.z, 0) }, num(fl.y, 0) + 1);
      if (fl && !amb) { out.pendencias.push({ chave: "ambiente", motivo: "a luminária " + o.luminaria + " não está dentro de um ambiente do modelo: crie o ambiente (Ambiente › clique na sala) para a ligação saber as paredes e as portas", ids: [o.luminaria] }); return out; }
    }
    if (!amb) { out.pendencias.push({ chave: "ambiente", motivo: "ambiente não encontrado" }); return out; }
    var ligId = "lig-" + amb.id, reg0 = registroDe(estado, ligId) || {}, cfg = o.config || {};
    var caminho = cfg.caminho || reg0.caminho || "auto";
    var regra = cfg.regra || (cfg.texto ? interpretar(cfg.texto) : null) || reg0.regra || { pontos: [{ tipo: "entrada" }] };
    if (regra.avisos) regra.avisos.forEach(function (a) { out.avisos.push(a); });
    var base = num(amb.calc.base, 0), teto = tetoDe(estado, amb, base, cfg), forro = forroDe(estado, amb);
    if (teto.assumido) out.pendencias.push({ chave: "teto", motivo: "teto do ambiente " + amb.nome + ": " + teto.origem, ids: [amb.id] });
    var W = paredes(estado);
    var ctx = { feitos: [], estado: estado, aval: aval, amb: amb, nome: txt(amb.nome) || amb.id, c: centro(amb.calc.contorno), base: base, teto: teto, forro: forro, arestas: arestas(amb, W), obst: obstaculos(estado) };
    ctx.vaos = vaos(estado, aval, amb).concat(passagens(estado, amb, ctx.arestas)); ctx.eixos = quadro(ctx);
    ctx.entradas = entradas(ctx.vaos.filter(function (v) { return v.tipo === "porta"; }), amb); ctx.entrada = ctx.entradas[0] || null;
    /* ⚠ FONTE ÚNICA (integração n23, 23/10/2026) — o que é DESTA ligação (some no religar) e o que já existe (é ADOTADO, nunca
       duplicado). "Desta ligação" = op marcada com `lig` OU id com o prefixo lig-<amb>- no estado: o estado do BimEdit não guarda a
       marca `lig` (o normPeca/normTrecho a descarta), e quem chama só com o estado (o "Circuitos e quadro" religando a espera)
       deixava o eletroduto velho no modelo, em dobro. */
    var ehMeu = function (id) { return txt(id).indexOf(ligId + "-") === 0; };
    var trAnt = {}; arr(estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { if (t && ehMeu(t.id)) trAnt[t.id] = t; });
    /* o eletroduto que já existe (de outra sala ou do projeto dos circuitos) entra na conta do "corre por cima": entre as duas rotas
       ortogonais, vence a que não passa dentro de outro tubo */
    /* (o do projeto dos circuitos vai marcado `alheio`: a ponta dele no meio de um tubo nosso é o tê que ELE fez — não conta como
       derivação sem caixa; senão o religar fugia do próprio caminho e abria buraco no tronco que passa por dentro dele) */
    arr(estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { if (t && t.sistema === "eletrica" && !ehMeu(t.id) && t.p1 && t.p2) ctx.feitos.push({ p1: t.p1, p2: t.p2, alheio: !/^lig-/.test(txt(t.id)) }); });
    var caixasEx = arr(estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return k && /^caixa_/.test(txt(k.peca)) && !ehMeu(k.id) && !demolido(k); });
    var cxUsada = {};
    function caixaPerto(x, z, y, dh, dy, pecas) {
      var best = null;
      caixasEx.forEach(function (k) {
        if (cxUsada[k.id] || (pecas && pecas.indexOf(k.peca) < 0)) return;
        var dd = d2({ x: num(k.x, 0), z: num(k.z, 0) }, { x: x, z: z }), dv = Math.abs(num(k.y, 0) - y);
        if (dd <= dh + 1e-9 && dv <= dy + 1e-9 && (!best || dd + dv < best.d)) best = { k: k, d: dd + dv };
      });
      return best ? best.k : null;
    }
    ctx.existentes = [];
    arr(estado.familias).forEach(function (f) {
      if (!f || ehMeu(f.id) || demolido(f) || f.host) return;
      var av = avaliar(aval, f); if (!av || !av.mep || av.mep.peca !== "interruptor") return;
      var th = num(f.rotY, 0), n = { x: Math.sin(th), z: Math.cos(th) }, P0 = { x: num(f.x, 0), z: num(f.z, 0) };
      if (!dentro(soma(P0, n, 0.05), amb.calc.contorno) || Math.abs(num(f.y, 0) - base) > 0.5) return;
      var hm = num(f.inst && f.inst.Altura_montagem, num(av.valores && av.valores.Altura_montagem, 1.0));
      var k = caixaPerto(P0.x - n.x * 0.03, P0.z - n.z * 0.03, num(f.y, 0) + hm, 0.10, 0.12, ["caixa_4x2", "caixa_4x4"]);
      if (k) cxUsada[k.id] = 1;
      ctx.existentes.push({ id: String(f.id), f: f, x: P0.x, z: P0.z, n: n, h: hm, caixa: k, auto: /^elei-/.test(String(f.id)) });
    });
    /* sem regra escolhida (nem nesta chamada nem no registro) e o ambiente já com interruptor: a regra é "os que existem" */
    var regraExistentes = !cfg.regra && !cfg.texto && !reg0.regra && ctx.existentes.length > 0;
    if (regraExistentes) regra = { pontos: [{ tipo: "existentes" }] };
    var adotados = {};
    /* o ponto da regra que cai junto de um interruptor que já existe (≤ 0,60 m, mesma face) É aquele interruptor */
    function adotar(pts) {
      var usados = {};
      pts.forEach(function (p) { if (p.adota) usados[p.adota] = 1; });
      pts.forEach(function (p) {
        if (p.adota) { adotados[p.adota] = 1; return; }
        var best = null;
        ctx.existentes.forEach(function (e) {
          if (usados[e.id] || (p.n && e.n && p.n.x * e.n.x + p.n.z * e.n.z < 0.7)) return;
          var dd = d2(p, e); if (dd <= 0.60 + 1e-9 && (!best || dd < best.d)) best = { e: e, d: dd };
        });
        if (best) { usados[best.e.id] = 1; adotados[best.e.id] = 1; p.adota = best.e.id; p.x = best.e.x; p.z = best.e.z; p.n = best.e.n; }
      });
      return pts;
    }
    out.ambiente = { id: amb.id, nome: ctx.nome, base: base, teto: teto, forro: forro, entrada: ctx.entrada ? ctx.entrada.id : null };
    if (ctx.entrada) out.decisoes.push("Entrada do " + ctx.nome + ": " + rotVao(ctx.entrada) + (ctx.entrada.passagem ? "" : (ctx.entrada.outro ? " (dá para " + ctx.entrada.outro.nome + ")" : " (dá para fora)")) + ".");

    /* --- o caminho */
    var modoTeto = caminho === "parede" ? "parede" : (caminho === "laje" ? "laje" : (forro ? "forro" : "laje"));
    if (caminho === "forro" && !forro) { modoTeto = "laje"; out.avisos.push("o ambiente " + ctx.nome + " não tem forro: o eletroduto foi pela laje"); }
    var modoAlim = caminho === "piso" ? "piso" : (caminho === "parede" ? "parede" : modoTeto);
    var aplTeto = modoTeto === "forro" ? "forro" : "laje";
    var yRun = r4(modoTeto === "forro" ? forro.cota + forro.esp + geo(cfg, "forroTubo") : teto.y + geo(cfg, "lajeTubo"));
    if (modoTeto === "parede") yRun = r4((forro ? forro.cota + forro.esp + geo(cfg, "forroTubo") : teto.y + geo(cfg, "lajeTubo")));
    var vTopo = ctx.vaos.reduce(function (m, v) { return Math.max(m, v.topo); }, base + 2.1);
    var yParede = r4(Math.min(vTopo + geo(cfg, "paredeFolga"), (forro ? forro.cota : teto.y) - geo(cfg, "tetoFolga")));
    if (modoTeto === "parede" && yParede <= vTopo) out.avisos.push("pela parede: não há altura livre entre o topo dos vãos (" + f2(vTopo - base) + " m) e o teto — o eletroduto cruza a verga, confira");
    var yPiso = r4(base - geo(cfg, "pisoTubo"));
    out.decisoes.push("Caminho do eletroduto: " + { forro: "sobre o forro", laje: "embutido na laje", parede: "dentro das paredes, acima das portas (" + f2(yParede - base) + " m)" }[modoTeto] +
      (modoAlim !== modoTeto ? "; alimentação " + (modoAlim === "piso" ? "pelo piso (contrapiso)" : modoAlim) : "") + (caminho === "auto" ? " (automático: " + (forro ? "o ambiente tem forro" : "sem forro, pela laje") + ")" : "") + ".");

    /* --- as luminárias e os comandos */
    var lums = luminariasDe(estado, aval, amb, base, teto.y + 0.5);
    if (!lums.length) { out.pendencias.push({ chave: "luminarias", motivo: "o ambiente " + ctx.nome + " não tem luminária", ids: [amb.id] }); return out; }
    var nomesCmd = {}; arr(reg0.comandos).forEach(function (k) { nomesCmd[k.id] = k.nome; });
    var cfgCmd = {}; arr(cfg.comandos).forEach(function (k) { var id = "cmd-" + amb.id + "-" + slug(k.nome); nomesCmd[id] = txt(k.nome); arr(k.luminarias).forEach(function (l) { cfgCmd[l] = id; }); if (k.pontos) cfgCmd["@" + id] = k.pontos; });
    var cmds = {}, ordemCmd = [];
    lums.forEach(function (L) {
      var ic = txt(L.f.inst && L.f.inst.Comando), id = cfgCmd[L.f.id] || (ic.indexOf("cmd-" + amb.id + "-") === 0 ? ic : null), nome = null;
      if (!id) { nome = grupoPadrao(L.f, L.av); id = "cmd-" + amb.id + "-" + slug(nome); }
      if (!cmds[id]) { cmds[id] = { id: id, nome: nomesCmd[id] || nome || id.replace("cmd-" + amb.id + "-", "").replace(/^./, function (x) { return x.toUpperCase(); }), luminarias: [], pontosSpec: cfgCmd["@" + id] || null }; ordemCmd.push(id); }
      cmds[id].luminarias.push(L);
    });
    ordemCmd.sort(function (a, b) { return (/-geral$/.test(b) ? 1 : 0) - (/-geral$/.test(a) ? 1 : 0) || (a < b ? -1 : 1); });

    /* --- carga e circuito */
    var cargaW = lums.reduce(function (s, L) { return s + num(String((L.av.valores || {}).Potencia_W == null ? "" : L.av.valores.Potencia_W).split("/")[0], 0); }, 0);
    var areaA = num(amb.calc.area, area(amb.calc.contorno)), cMin = cargaMinima(areaA), carga = Math.max(cargaW, cMin);
    out.decisoes.push("Carga de iluminação do " + ctx.nome + ": " + Math.round(carga) + " VA (" + (carga === cMin ? "a mínima da NBR 5410 9.5.2.1.2 para " + f2(areaA) + " m²" : "a potência das luminárias, " + Math.round(cargaW) + " W ≈ VA") + ").");
    var outros = arr(estado.instalacoes && estado.instalacoes.ligacoes).filter(function (r) { return r.id !== ligId; });
    var porCirc = {}; outros.forEach(function (r) { if (r.circuito) porCirc[r.circuito] = (porCirc[r.circuito] || 0) + num(r.cargaVA, 0); });
    var lim = num((V("limiteCircuito") || {}).va, 1270);
    /* ⚠ O CIRCUITO DE PROTEÇÃO tem UM dono (integração n23): com o projeto dos circuitos gravado no quadro (js/elecircuitos.js,
       NBR 5410 dimensionada), o circuito das luminárias é o DO PROJETO — a ligação só copia. Sem projeto, a ligação propõe um
       provisório (até 1.270 VA) e o registro diz que é provisório: o "Circuitos e quadro" NÃO o trata como escolha do usuário. */
    var proj = projetoCircuitos(estado, aval), circProj = null;
    if (proj) arr(proj.circuitos).forEach(function (c0) { if (!circProj && arr(c0.pontos).some(function (pid) { return lums.some(function (L) { return String(L.f.id) === String(pid); }); })) circProj = c0.id; });
    if (!circProj && cfg.circuito) circProj = txt(cfg.circuito);   /* o "Circuitos e quadro" religando: o circuito já decidido por ele */
    var qdE = null; if (proj) { try { qdE = ECI().quadroDe(estado, aval); } catch (eQ) { qdE = null; } }
    /* com o projeto, o eletroduto que o "Circuitos e quadro" (ou a mão) já passou entre duas caixas desta sala NÃO é traçado de
       novo: a ligação só traça o que falta (o cabo desses trechos é do projeto) */
    var redeEx = proj ? componentes(estado, ehMeu, qdE ? { id: qdE.id, p: qdE.p, raio: qdE.raio, u: qdE.u, dir: qdE.dir, largura: qdE.largura, altura: qdE.altura } : null, lums.map(function (L) { var c0 = L.con || { x: num(L.f.x, 0), y: num(L.f.y, 0) + num((L.av.valores || {}).Altura_montagem, 2.6), z: num(L.f.z, 0) }; return { id: "L:" + L.f.id, no: [c0.x, c0.y, c0.z] }; })) : null;

    /* --- pontos de interruptor */
    var pontosSala = adotar(resolverPontos(ctx, regra.pontos, cfg, out));
    if (regra.quantos && regra.quantos !== pontosSala.length) out.avisos.push("a regra pede " + regra.quantos + " ponto(s) e saíram " + pontosSala.length + " (" + pontosSala.map(function (p) { return p.rotulo; }).join(", ") + ")");
    var caixasInt = [];   /* {pt, mods:[{cmd, esquema}]} */
    function caixaDo(p) { for (var i = 0; i < caixasInt.length; i++) if (d2(caixasInt[i].pt, p) < geo(cfg, "mesmoPonto")) return caixasInt[i]; var cx = { pt: p, mods: [] }; caixasInt.push(cx); return cx; }
    var maxMod = 3;
    ordemCmd.forEach(function (id) {
      var K = cmds[id], pts = K.pontosSpec ? adotar(resolverPontos(ctx, K.pontosSpec, cfg, out)) : pontosSala, n = pts.length;
      K.esquema = n <= 1 ? "simples" : (n === 2 ? "paralelo" : "intermediario");
      K.pontos = [];
      pts.forEach(function (p, i) {
        var esq = n === 1 ? "simples" : (i === 0 || i === n - 1 ? "paralelo" : "intermediario"), cx = caixaDo(p);
        if (cx.mods.length >= maxMod) { out.pendencias.push({ chave: "interruptor.modulos", motivo: "mais de " + maxMod + " comandos no ponto " + p.rotulo + ": o comando " + K.nome + " ficou sem interruptor ali — divida em dois pontos", ids: [] }); return; }
        cx.mods.push({ cmd: id, esquema: esq, ordem: i, n: n }); K.pontos.push({ caixa: cx, ordem: i, esquema: esq });
      });
    });
    if (!caixasInt.length) out.pendencias.push({ chave: "interruptor", motivo: "o ambiente " + ctx.nome + " ficou sem interruptor (" + (pontosSala.length ? "" : "nenhum ponto da regra coube") + "): clique o ponto", ids: [amb.id] });

    /* ---------------------------------------------------- AS PEÇAS */
    var opsN = [], nT = 0, P = "lig-" + amb.id;
    function marca(op, parte) { op.lig = ligId; op.ligParte = parte; opsN.push(op); return op; }
    var arestasN = [];   /* {a, b, trechos:[ids], tipo} */
    var nos = {};        /* id → {x, y, z} */
    /* ⚠ com o projeto dos circuitos: o pedaço que correria DENTRO de um eletroduto que já existe (de outra sala ou do projeto) não é
       traçado — o fio passa pelo que existe e o cabo é do projeto (revisão adversarial n23: a luminária posta depois dos circuitos
       ganhava tubo por cima do tronco) */
    var alheios = proj ? ctx.feitos.slice() : [];
    function recortarLig(a, b) {
      var L0 = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2) + Math.pow(b.z - a.z, 2)); if (!alheios.length || L0 < 0.01) return [[a, b]];
      var u = { x: (b.x - a.x) / L0, y: (b.y - a.y) / L0, z: (b.z - a.z) / L0 }, tiras = [];
      alheios.forEach(function (s) {
        var w = { x: s.p2.x - s.p1.x, y: s.p2.y - s.p1.y, z: s.p2.z - s.p1.z }, Lw = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z); if (Lw < 0.01) return;
        if (Math.abs(Math.abs((u.x * w.x + u.y * w.y + u.z * w.z) / Lw) - 1) > 1e-3) return;
        function pj(p) { var q = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z }, t = q.x * u.x + q.y * u.y + q.z * u.z; return { t: t, d: Math.sqrt(Math.pow(q.x - u.x * t, 2) + Math.pow(q.y - u.y * t, 2) + Math.pow(q.z - u.z * t, 2)) }; }
        var p0 = pj(s.p1), p1 = pj(s.p2); if (p0.d > 0.03 || p1.d > 0.03) return;
        var lo = Math.max(0, Math.min(p0.t, p1.t)), hi = Math.min(L0, Math.max(p0.t, p1.t)); if (hi - lo > 0.02) tiras.push([lo, hi]);
      });
      if (!tiras.length) return [[a, b]];
      tiras.sort(function (x, y) { return x[0] - y[0]; });
      var out2 = [], cur = 0;
      function Pp(t) { return { x: r4(a.x + u.x * t), y: r4(a.y + u.y * t), z: r4(a.z + u.z * t) }; }
      tiras.forEach(function (ti) { if (ti[0] - cur > 0.005) out2.push([cur ? Pp(cur) : a, Pp(ti[0])]); cur = Math.max(cur, ti[1]); });
      if (L0 - cur > 0.005) out2.push([cur ? Pp(cur) : a, b]);
      return out2;
    }
    function trechos(pts, apl, aresta, extra) {
      for (var k = 1; k < pts.length; k++) {
        if (Math.sqrt(Math.pow(pts[k].x - pts[k - 1].x, 2) + Math.pow(pts[k].y - pts[k - 1].y, 2) + Math.pow(pts[k].z - pts[k - 1].z, 2)) < 0.006) continue;
        var ap = typeof apl === "function" ? apl(pts[k - 1], pts[k]) : apl, pedacos = recortarLig(pts[k - 1], pts[k]);
        pedacos.forEach(function (pq, ip) {
          var id = P + "-el-" + (++nT);
          var op = marca({ op: "trecho", id: id, sistema: "eletrica", material: materialPara(ap), dn: 20, p1: pq[0], p2: pq[1], aplicacao: ap }, "eletroduto");
          ctx.feitos.push(op);
          if (extra && k === pts.length - 1 && ip === pedacos.length - 1 && extra.continua) op.continua = "p2";
          aresta.trechos.push(op);
        });
      }
    }
    function vertOuDeitado(apH) { return function (a, b) { return Math.abs(a.y - b.y) > 0.05 && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01 ? "parede" : apH; }; }
    function conflito(r, oque) { if (r && r.conflito) out.avisos.push("eletroduto " + oque + " cruza " + r.conflito.map(function (q) { return q.tipo + " " + q.id; }).join(", ") + " (nenhuma das rotas ortogonais passa livre) — mude o caminho ou desvie à mão"); }

    /* luminárias: caixa no ponto, Altura_montagem pelo forro/laje */
    var amarradaEm = null;
    lums.forEach(function (L, k) {
      var v = L.av.valores || {}, hm = num(v.Altura_montagem, 2.6), id = P + "-cx-l" + (k + 1);
      var con = L.con || { x: num(L.f.x, 0), y: num(L.f.y, 0) + hm, z: num(L.f.z, 0) }, off = con.y - (num(L.f.y, 0) + hm);
      var naParede = con.y < (forro ? forro.cota : teto.y) - 0.30;
      var inst = { Comando: null, Circuito: null, Circuito_quadro: null };
      L.no = "L" + (k + 1);
      /* a caixa que o ponto JÁ tem (a do "Lançar pontos elétricos" ou posta à mão) é a caixa da ligação: acertada no lugar, nunca
         uma segunda ao lado (op sem `lig`: o religar e o "tirar a ligação" não a apagam — ela é do ponto, não da ligação) */
      function poeCaixa(op, parte, pecas, yRef) {
        var ad = caixaPerto(op.x, op.z, yRef, 0.10, 0.35, pecas);
        if (!ad) { marca(op, parte); return op.id; }
        cxUsada[ad.id] = 1;
        /* ⚠ a caixa em que JÁ chega eletroduto que não é desta ligação (o do "Circuitos e quadro" ou o posto à mão) fica onde está —
           só o tipo e a aplicação mudam (revisão adversarial n23, 23/10/2026). Roteiro do defeito: na C487, ordem pontos → circuitos →
           ligação, a ligação subia a caixa do ponto de luz 3 cm para "sobre o forro"; os eletrodutos dos circuitos ficavam abaixo
           dela, a caixa solta, e o auditor acusava "luminária sem ponto de luz — ela não acende" */
        var amarrada = arr(estado.instalacoes && estado.instalacoes.trechos).some(function (t) { return t && t.sistema === "eletrica" && !ehMeu(t.id) && t.p1 && t.p2 && [t.p1, t.p2].some(function (p) { return Math.sqrt(Math.pow(num(p.x, 0) - num(ad.x, 0), 2) + Math.pow(num(p.y, 0) - num(ad.y, 0), 2) + Math.pow(num(p.z, 0) - num(ad.z, 0), 2)) <= 0.12; }); });
        if (amarrada) { op.x = r4(num(ad.x, 0)); op.y = r4(num(ad.y, 0)); op.z = r4(num(ad.z, 0)); if (op.alturaPiso != null && ad.alturaPiso != null) op.alturaPiso = r4(num(ad.alturaPiso, op.alturaPiso)); amarradaEm = ad; }
        var mudou =Math.abs(num(ad.x, 0) - op.x) > 0.002 || Math.abs(num(ad.y, 0) - op.y) > 0.002 || Math.abs(num(ad.z, 0) - op.z) > 0.002 || ad.peca !== op.peca ||
          (op.aplicacao && op.peca === "caixa_octogonal" && txt(ad.aplicacao) !== op.aplicacao) || (op.alturaPiso != null && Math.abs(num(ad.alturaPiso, -9) - op.alturaPiso) > 0.002);
        if (mudou) { var o2 = copia(op); o2.id = ad.id; o2.material = ad.material || op.material; o2.ligAdota = ligId; opsN.push(o2); }
        out.adotadas = (out.adotadas || []).concat([ad.id]);
        return ad.id;
      }
      if (naParede) {
        /* ARANDELA: o ponto na parede — caixa 4×2 alta no conector */
        var idA = poeCaixa({ op: "peca", id: id, peca: "caixa_4x2", sistema: "eletrica", material: "pvc", x: r4(con.x), y: r4(con.y), z: r4(con.z), rotY: r4(num(L.f.rotY, 0)), alturaPiso: r4(con.y - base) }, "ponto_luz", ["caixa_4x2", "caixa_4x4"], con.y);
        nos[L.no] = { x: con.x, y: con.y, z: con.z, parede: true, caixa: idA, lum: L.f.id };
      } else {
        var embutir = /embutir/.test(semAcento(v.Instalacao).toLowerCase()) || /spot/.test(txt(v.Modelo));
        var hNovo = forro ? (embutir ? forro.cota - base : forro.cota - base - off) : teto.y - base - off;
        if (isFinite(hNovo) && hNovo > 1.5 && Math.abs(hNovo - hm) > 0.001) inst.Altura_montagem = r4(hNovo);
        var cy = num(L.f.y, 0) + (inst.Altura_montagem != null ? inst.Altura_montagem : hm) + off, yCx = Math.abs(cy - yRun) <= 0.04 ? r4((cy + yRun) / 2) : yRun;
        amarradaEm = null;
        var idO = poeCaixa({ op: "peca", id: id, peca: "caixa_octogonal", sistema: "eletrica", material: "pvc", x: r4(con.x), y: yCx, z: r4(con.z), aplicacao: forro && Math.abs(yCx - yRun) < 0.05 && modoTeto !== "laje" ? "forro" : "laje" }, "ponto_luz", ["caixa_octogonal"], yCx);
        nos[L.no] = { x: con.x, y: yRun, z: con.z, caixa: idO, lum: L.f.id };
        /* a caixa amarrada (ficou onde os eletrodutos dos circuitos chegam): a luminária é que acerta a altura para o conector
           cair NELA (sem a descida — a caixa já está no conector) */
        if (amarradaEm) {
          /* (só quando o conector cai FORA da caixa — meia altura dela, 2 cm; dentro, nada muda e o religar fica idempotente) */
          var hA = Math.abs(cy - num(amarradaEm.y, cy)) <= 0.015 ? (inst.Altura_montagem != null ? inst.Altura_montagem : hm) : r4(num(amarradaEm.y, cy) - off - num(L.f.y, 0));
          if (isFinite(hA) && hA > 1.5) { if (Math.abs(hA - hm) > 0.001) inst.Altura_montagem = hA; else delete inst.Altura_montagem; }
        } else if (yCx === yRun && Math.abs(cy - yRun) > 0.04) { var aD = { a: L.no, b: L.no, trechos: [], tipo: "descida" }; trechos([{ x: r4(con.x), y: yRun, z: r4(con.z) }, { x: r4(con.x), y: r4(cy), z: r4(con.z) }], "forro", aD); }
      }
      L.inst = inst;
    });

    /* as duas caixas já estão ligadas por eletroduto que existe (só com o projeto dos circuitos — ver redeEx) */
    /* as componentes de um nó: a da caixa dele e a do ponto de luz (a ponta a ≤ 12 cm do conector da luminária — a arandela que o projeto
       dos circuitos ligou sem caixa da ligação) */
    function compsDe(N) { if (!redeEx || !N) return []; var o2 = []; if (N.caixa != null) { var c0 = redeEx.deCaixa(N.caixa); if (c0 != null) o2.push(c0); } if (N.lum != null) { var c1 = redeEx.dePonto("L:" + N.lum); if (c1 != null) o2.push(c1); } return o2; }
    function jaLigadas(a, b) { var A2 = compsDe(a), B2 = compsDe(b); return A2.some(function (x) { return B2.indexOf(x) >= 0; }); }
    /* árvore entre os pontos de luz (Prim, distância ortogonal) */
    function man(a, b) { return Math.abs((b.x - a.x) * ctx.eixos[0].x + (b.z - a.z) * ctx.eixos[0].z) + Math.abs((b.x - a.x) * ctx.eixos[1].x + (b.z - a.z) * ctx.eixos[1].z); }
    var dentroArv = [lums[0].no], fora = lums.slice(1).map(function (L) { return L.no; });
    while (fora.length) {
      var best = null;
      dentroArv.forEach(function (a) { fora.forEach(function (b) { var dd = jaLigadas(nos[a], nos[b]) ? 0 : man(nos[a], nos[b]);   /* já ligadas por eletroduto que existe: custo 0 (sem laço — revisão adversarial n23) */ if (!best || dd < best.d) best = { a: a, b: b, d: dd }; }); });
      var ar = { a: best.a, b: best.b, trechos: [], tipo: "luz" }, A = nos[best.a], Bn = nos[best.b];
      if (jaLigadas(A, Bn)) ar.existente = true;
      else if (A.parede || Bn.parede) {
        /* arandela: sobe na parede até o teto e segue */
        var pA = A.parede ? [{ x: A.x, y: A.y + 0.05, z: A.z }, { x: A.x, y: yRun, z: A.z }] : [{ x: A.x, y: yRun, z: A.z }];
        var pB = Bn.parede ? [{ x: Bn.x, y: yRun, z: Bn.z }, { x: Bn.x, y: Bn.y + 0.05, z: Bn.z }] : [{ x: Bn.x, y: yRun, z: Bn.z }];
        var rr = rotaOrto(ctx, pA[pA.length - 1], pB[0], yRun, cfg); conflito(rr, "entre os pontos de luz");
        trechos(pA.slice(0, -1).concat(rr.pts).concat(pB.slice(1)).map(function (p) { return { x: r4(p.x), y: r4(p.y), z: r4(p.z) }; }), vertOuDeitado(aplTeto), ar);
      } else { var r0 = rotaOrto(ctx, A, Bn, yRun, cfg); conflito(r0, "entre os pontos de luz"); trechos(r0.pts, aplTeto, ar); }
      arestasN.push(ar); dentroArv.push(best.b); fora.splice(fora.indexOf(best.b), 1);
    }

    /* ⚠ o hub na PAREDE (arandela): o tubo sobe da caixa dela até o teto antes de seguir (revisão adversarial n23: faltava a subida —
       o tubo vertical sumia do orçamento, a rede ficava solta e o projeto dos circuitos traçava outro por cima) */
    function sobeHub(N) { return N && N.parede && N.y < yRun - 0.05 ? [{ x: r4(N.x), y: r4(N.y + 0.05), z: r4(N.z) }] : []; }
    /* interruptores: família + caixa 4×2 + descida; do ponto de luz-cubo (o mais perto dos interruptores) até cada um */
    var hInt = num((V("alturaInterruptor") || {}).valor, 1.00);
    var cgI = caixasInt.length ? { x: caixasInt.reduce(function (s, q) { return s + q.pt.x; }, 0) / caixasInt.length, z: caixasInt.reduce(function (s, q) { return s + q.pt.z; }, 0) / caixasInt.length } : ctx.c;
    var hub = lums.map(function (L) { return L.no; }).sort(function (a, b) { return man(nos[a], cgI) - man(nos[b], cgI); })[0];
    var famInt = [];
    caixasInt.forEach(function (cx, k) {
      var p = cx.pt, n = p.n, th = Math.atan2(n.x, n.z), ids = cx.mods.map(function (m) { return m.cmd; }), esq = cx.mods.map(function (m) { return m.esquema; });
      var todos = esq.every(function (e) { return e === esq[0]; }), nm = cx.mods.length;
      var tipoId = (todos ? { simples: "s", paralelo: "p", intermediario: "i" }[esq[0]] : "m") + nm;
      if (tipoId === "m1") tipoId = "s1";
      var fid = P + "-int-" + (k + 1), C = soma(p, n, -geo(cfg, "fundoCaixa")), pecaS = nm > num((V("modulosCaixa4x2") || {}).valor, 3) ? "caixa_4x4" : "caixa_4x2", idS = P + "-cx-s" + (k + 1), hS = hInt;
      var ex = p.adota ? ctx.existentes.filter(function (e) { return e.id === p.adota; })[0] : null;
      if (ex) {
        /* o interruptor que JÁ existe: só o tipo (módulos/esquema) e o contrato (Comandos, Esquemas) — posição e altura dele ficam */
        fid = ex.id; hS = ex.h;
        var I0 = ex.f.inst || {};
        if (txt(ex.f.tipoId) !== tipoId || txt(I0.Comandos) !== ids.join(",") || txt(I0.Esquemas) !== esq.join(",")) opsN.push({ op: "instancia", id: fid, tipoId: tipoId, inst: { Comandos: ids.join(","), Esquemas: esq.join(",") }, lig: ligId, ligParte: "interruptor-adotado" });
        if (ex.caixa) {
          idS = ex.caixa.id; C = { x: num(ex.caixa.x, 0), z: num(ex.caixa.z, 0) };
          if (ex.caixa.peca !== pecaS && pecaS === "caixa_4x4") opsN.push({ op: "peca", id: idS, peca: pecaS, sistema: "eletrica", material: ex.caixa.material || "pvc", x: r4(C.x), y: r4(num(ex.caixa.y, base + hS)), z: r4(C.z), rotY: r4(num(ex.caixa.rotY, th)), alturaPiso: r4(num(ex.caixa.alturaPiso, hS)), ligAdota: ligId });
          out.adotadas = (out.adotadas || []).concat([idS]);
        } else marca({ op: "peca", id: idS, peca: pecaS, sistema: "eletrica", material: "pvc", x: r4(C.x), y: r4(base + hS), z: r4(C.z), rotY: r4(th), alturaPiso: r4(hS) }, "caixa_interruptor");
        out.adotadas = (out.adotadas || []).concat([fid]);
      } else {
        marca({ op: "familia", id: fid, famId: "ra-interruptor", tipoId: tipoId, x: r4(p.x), y: r4(base), z: r4(p.z), rotY: r4(th), inst: { Altura_montagem: r4(hInt), Comandos: ids.join(","), Esquemas: esq.join(",") } }, "interruptor");
        marca({ op: "peca", id: idS, peca: pecaS, sistema: "eletrica", material: "pvc", x: r4(C.x), y: r4(base + hInt), z: r4(C.z), rotY: r4(th), alturaPiso: r4(hInt) }, "caixa_interruptor");
      }
      cx.no = "S" + (k + 1); cx.fid = fid; cx.C = C; cx.tipoId = tipoId; cx.caixaId = idS;
      nos[cx.no] = { x: C.x, y: base + hS, z: C.z, parede: true, n: n, caixa: idS };
      famInt.push({ id: fid, ponto: p.rotulo, tipoId: tipoId, comandos: ids, esquemas: esq, adotado: !!ex });
      var ar = { a: hub, b: cx.no, trechos: [], tipo: "interruptor" }, H = nos[hub], topo = { x: r4(C.x), y: yRun, z: r4(C.z) };
      /* com o projeto: a caixa do interruptor já chega a algum ponto de luz da sala por eletroduto que existe → não traça outro */
      if (redeEx && lums.some(function (L) { return jaLigadas(nos[L.no], nos[cx.no]); })) ar.existente = true;
      else if (modoTeto === "parede") {
        var cam = caminhoParede(ctx, { x: H.x, z: H.z }, { x: C.x, z: C.z }, cfg);
        var pts = sobeHub(H).concat([{ x: H.x, y: yRun, z: H.z }, { x: cam[0].x, y: yRun, z: cam[0].z }, { x: cam[0].x, y: yParede, z: cam[0].z }]).concat(cam.slice(1).map(function (q) { return { x: q.x, y: yParede, z: q.z }; })).concat([{ x: C.x, y: r4(base + hS + 0.05), z: C.z }]);
        trechos(pts.map(function (q) { return { x: r4(q.x), y: r4(q.y), z: r4(q.z) }; }), function (a, b) { return Math.abs(a.y - b.y) > 0.05 ? "parede" : (a.y === yRun && b.y === yRun ? aplTeto : "parede"); }, ar);
      } else {
        var r1 = rotaOrto(ctx, H, topo, yRun, cfg, n); conflito(r1, "até o interruptor " + p.rotulo);
        var desce = [topo, { x: r4(C.x), y: r4(base + hS + 0.05), z: r4(C.z) }];
        colide(ctx, desce[0], desce[1], cfg).forEach(function (q) { out.avisos.push("a descida do interruptor " + p.rotulo + " cruza " + q.tipo + " " + q.id + " — mude o ponto"); });
        trechos(sobeHub(H).concat(r1.pts).concat(desce.slice(1)), vertOuDeitado(aplTeto), ar);
      }
      arestasN.push(ar);
    });
    /* a regra escolhida não usa um interruptor que o "Lançar pontos elétricos" tinha posto: ele sai (com a caixa), senão ficavam
       dois na porta e os dois no orçamento; o posto à mão não é tocado (aviso) */
    if (!regraExistentes) ctx.existentes.forEach(function (e) {
      if (adotados[e.id]) return;
      if (e.auto) {
        opsN.push({ op: "apagar", id: e.id, lig: ligId, ligParte: "substituido" });
        if (e.caixa) opsN.push({ op: "apagar", id: e.caixa.id, lig: ligId, ligParte: "substituido" });
        out.avisos.push("o interruptor " + e.id + " (do \"Lançar pontos elétricos\") não entra na regra escolhida: saiu, com a caixa");
      } else out.avisos.push("o interruptor " + e.id + " (posto à mão) ficou fora da regra escolhida e sem comando: apague-o, ou religue com a regra \"os que existem\"");
    });

    /* alimentação: quadro, outro ambiente do mesmo circuito (com folga de carga) ou espera na porta de entrada */
    var fontes = [], circuito = null;
    quadrosDe(estado, aval, base).forEach(function (q) { fontes.push({ tipo: "quadro", id: q.f.id, p: { x: q.con.x, y: q.con.y, z: q.con.z } }); });
    if (modoAlim !== "piso") outros.forEach(function (r) { if (r.entrada && Math.abs(num(r.entrada.y, 0) - yRun) < 1.0 && r.circuito && (circProj ? r.circuito === circProj : (porCirc[r.circuito] || 0) + carga <= lim)) fontes.push({ tipo: "ligacao", id: r.id, circuito: r.circuito, nome: r.nomeAmb, p: r.entrada }); });
    var entradaNo = modoAlim === "piso" && caixasInt.length ? caixasInt[0].no : null, fonte = null;
    fontes.forEach(function (F) { var de = entradaNo ? nos[entradaNo] : lums.map(function (L) { return nos[L.no]; }).sort(function (a, b) { return d2(a, F.p) - d2(b, F.p); })[0]; var dd = d2(de, F.p); if (!fonte || dd < fonte.d - 1e-6 || (Math.abs(dd - fonte.d) < 1e-6 && F.tipo === "ligacao")) fonte = { F: F, d: dd, de: de }; });
    if (!entradaNo) entradaNo = fonte ? lums.map(function (L) { return L.no; }).sort(function (a, b) { return d2(nos[a], fonte.F.p) - d2(nos[b], fonte.F.p); })[0] : (ctx.entrada ? lums.map(function (L) { return L.no; }).sort(function (a, b) { return d2(nos[a], ctx.entrada.D) - d2(nos[b], ctx.entrada.D); })[0] : lums[0].no);
    var E = nos[entradaNo], arA = { a: entradaNo, b: "SRC", trechos: [], tipo: "alimentacao" };
    if (fonte && fonte.F.tipo === "ligacao") circuito = fonte.F.circuito;
    else { var livres = Object.keys(porCirc).filter(function (k) { return porCirc[k] + carga <= lim; }).sort(); circuito = livres[0] || ("C" + (Object.keys(porCirc).reduce(function (m, k) { return Math.max(m, num(k.replace(/\D/g, ""), 0)); }, 0) + 1)); }
    if (circProj) circuito = circProj;
    var alim = { tipo: fonte ? fonte.F.tipo : "espera", alvo: fonte ? fonte.F.id : null };
    /* com o projeto: a sala já chega ao quadro por eletroduto que existe (o tronco do "Circuitos e quadro") → sem alimentação nova */
    var jaNoQuadro = !!(redeEx && redeEx.qd != null && lums.some(function (L) { return compsDe(nos[L.no]).indexOf(redeEx.qd) >= 0; }));
    /* ⚠ config.alimentacao = "projeto": quem chama (o "Circuitos e quadro") traça o TRONCO do quadro às salas, com a capacidade de
       circuitos por eletroduto dele — a ligação fica só dentro da sala. Sem isso a corrente de espera/encadeamento da ligação virava
       o tronco de tomadas e aparelhos também (medido na casa de teste: o ar-condicionado a 22 m do quadro em vez de 10 m) */
    var porProjeto = cfg.alimentacao === "projeto" || (!cfg.alimentacao && !!proj && !!(reg0.alimentacao && reg0.alimentacao.tipo === "projeto"));   /* uma vez do projeto, o religar não volta a puxar alimentação */
    if (jaNoQuadro || porProjeto) {
      alim = { tipo: jaNoQuadro ? "existente" : "projeto", alvo: qdE ? qdE.id : null }; arA.existente = true;
      out.decisoes.push(jaNoQuadro ? "Alimentação: a sala já chega ao quadro pelo eletroduto do projeto dos circuitos (circuito " + circuito + ") — nada novo traçado." :
        "Alimentação: o tronco do quadro até esta sala é do projeto dos circuitos (Instalações › Circuitos e quadro, circuito " + circuito + ").");
    } else if (modoAlim === "piso") {
      var Tp = fonte && fonte.F.tipo === "quadro" ? fonte.F.p : (ctx.entrada ? soma(soma(ctx.entrada.D, ctx.entrada.nR, -(ctx.entrada.esp / 2 + geo(cfg, "esperaFora"))), ctx.entrada.ux, 0) : null);
      if (!Tp) out.pendencias.push({ chave: "alimentacao", motivo: "sem quadro e sem porta de entrada: não há para onde levar a alimentação pelo piso", ids: [amb.id] });
      else {
        var rp = rotaOrto(ctx, { x: E.x, z: E.z }, { x: Tp.x, z: Tp.z }, yPiso, cfg);
        var ptsP = [{ x: r4(E.x), y: r4(E.y - 0.05), z: r4(E.z) }].concat(rp.pts);
        if (fonte) ptsP.push({ x: r4(Tp.x), y: r4(Tp.y), z: r4(Tp.z) });
        trechos(ptsP, function (a, b) { return Math.abs(a.y - b.y) > 0.05 ? "parede" : "piso"; }, arA, { continua: !fonte });
      }
    } else if (fonte) {
      var T = fonte.F.p, Ttopo = { x: r4(T.x), y: yRun, z: r4(T.z) }, ra = rotaOrto(ctx, E, Ttopo, yRun, cfg); conflito(ra, "da alimentação");
      var ptsA = modoAlim === "parede" ? null : sobeHub(E).concat(ra.pts);
      if (modoAlim === "parede") { var cam2 = caminhoParede(ctx, { x: E.x, z: E.z }, { x: T.x, z: T.z }, cfg); ptsA = [{ x: E.x, y: yRun, z: E.z }, { x: cam2[0].x, y: yRun, z: cam2[0].z }, { x: cam2[0].x, y: yParede, z: cam2[0].z }].concat(cam2.slice(1).map(function (q) { return { x: q.x, y: yParede, z: q.z }; })).concat([{ x: T.x, y: yParede, z: T.z }]).map(function (q) { return { x: r4(q.x), y: r4(q.y), z: r4(q.z) }; }); }
      if (Math.abs(T.y - ptsA[ptsA.length - 1].y) > 0.01) ptsA.push({ x: r4(T.x), y: r4(T.y), z: r4(T.z) });
      trechos(ptsA, function (a, b) { return Math.abs(a.y - b.y) > 0.05 && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01 ? (fonte.F.tipo === "ligacao" ? aplTeto : "parede") : (a.y === yRun ? aplTeto : "parede"); }, arA);
      out.decisoes.push(fonte.F.tipo === "quadro" ? "Alimentação: do quadro " + fonte.F.id + " (circuito " + circuito + ")." : "Alimentação: do ponto de luz do " + fonte.F.nome + " (mesmo circuito " + circuito + ", a carga somada cabe em " + lim + " VA).");
    } else if (ctx.entrada) {
      var Pf = soma(ctx.entrada.D, ctx.entrada.nR, -(ctx.entrada.esp / 2 + geo(cfg, "esperaFora"))), re = rotaOrto(ctx, E, Pf, yRun, cfg); conflito(re, "da espera");
      trechos(sobeHub(E).concat(re.pts), vertOuDeitado(aplTeto), arA, { continua: true });
      out.decisoes.push("Sem quadro no modelo: a alimentação do circuito " + circuito + " ficou em ESPERA logo depois da porta de entrada (" + ctx.entrada.id + "), \"continua\" até o quadro. Ponha o quadro e religue para ela ir até ele.");
    } else out.pendencias.push({ chave: "alimentacao", motivo: "sem quadro no modelo e sem porta de entrada: a alimentação do " + ctx.nome + " ficou sem destino — ponha o quadro de distribuição", ids: [amb.id] });
    arestasN.push(arA);

    /* ---------------------------------------------------- FIAÇÃO LÓGICA
     * árvore: SRC → entrada → pontos de luz → (cubo) → interruptores. Demandas: fase da fonte ao cubo; neutro e terra da fonte a
     * cada ponto de luz; o retorno de cada comando do cubo às luminárias dele; e, no ramo cubo → interruptor, os condutores do
     * esquema (simples: fase + retorno; paralelo 1º: fase + 2 retornos de paralelo; paralelo último: 2 retornos + retorno;
     * intermediário: 4 retornos de paralelo). Um condutor por função por trecho. */
    var viz = {}; arestasN.forEach(function (a, i) { if (a.a === a.b) return; (viz[a.a] = viz[a.a] || []).push({ to: a.b, i: i }); (viz[a.b] = viz[a.b] || []).push({ to: a.a, i: i }); });
    var pai = { SRC: null }, fila = ["SRC"], paiAr = {};
    while (fila.length) { var u = fila.shift(); arr(viz[u]).forEach(function (w) { if (pai[w.to] === undefined) { pai[w.to] = u; paiAr[w.to] = w.i; fila.push(w.to); } }); }
    function caminhoAr(a, b) { var A0 = [], x = a; while (x != null) { A0.push(x); x = pai[x]; } var Bs = [], y = b; while (y != null && A0.indexOf(y) < 0) { Bs.push(y); y = pai[y]; } var lca = y, res = []; x = a; while (x !== lca && x != null) { res.push(paiAr[x]); x = pai[x]; } Bs.forEach(function (n2) { res.push(paiAr[n2]); }); return res; }
    var cond = arestasN.map(function () { return []; });
    function poe(a, b, rot) { if (pai[a] === undefined || pai[b] === undefined) return; caminhoAr(a, b).forEach(function (i) { if (i != null && cond[i].indexOf(rot) < 0) cond[i].push(rot); }); }
    if (caixasInt.length) poe("SRC", hub, "F");
    lums.forEach(function (L) { poe("SRC", L.no, "N"); poe("SRC", L.no, "T"); });
    ordemCmd.forEach(function (id, ci) { var K = cmds[id]; K.rot = "R" + (ci + 1); K.luminarias.forEach(function (L) { poe(hub, L.no, K.rot); }); });
    caixasInt.forEach(function (cx) {
      var i = -1; arestasN.forEach(function (a, k) { if (a.tipo === "interruptor" && a.b === cx.no) i = k; }); if (i < 0) return;
      var precisaF = false;
      cx.mods.forEach(function (m) {
        var K = cmds[m.cmd], j = m.ordem;
        if (m.esquema === "simples") { precisaF = true; cond[i].push(K.rot); }
        else if (m.esquema === "paralelo" && j === 0) { precisaF = true; cond[i].push(K.rot + "a" + (j + 1), K.rot + "b" + (j + 1)); }
        else if (m.esquema === "paralelo") { cond[i].push(K.rot + "a" + j, K.rot + "b" + j, K.rot); }
        else { cond[i].push(K.rot + "a" + j, K.rot + "b" + j, K.rot + "a" + (j + 1), K.rot + "b" + (j + 1)); }
      });
      if (precisaF) cond[i].unshift("F");
    });
    var secao = num((V("secaoIluminacao") || {}).valor, 1.5), fiacao = {}, tot = { fase: 0, neutro: 0, retorno: 0, terra: 0 };
    function funcao(r) { return r === "F" ? "fase" : (r === "N" ? "neutro" : (r === "T" ? "terra" : "retorno")); }
    arestasN.forEach(function (a, i) {
      var c0 = cond[i].slice(); if (a.tipo === "descida") c0 = (function () { var l = lums.filter(function (L) { return L.no === a.a; })[0], K = l ? cmds[ordemCmd.filter(function (id) { return cmds[id].luminarias.indexOf(l) >= 0; })[0]] : null; return ["N", "T"].concat(K ? [K.rot] : []); })();
      var nc = c0.length, dn = dnPara(nc, secao);
      /* um ramo é UM eletroduto contínuo: se passa pela laje ou pelo piso, é o reforçado do começo ao fim (o que desce da laje para
         a parede é o mesmo tubo — sem "transição de material" no canto) */
      var ref = a.trechos.some(function (op) { return op.aplicacao === "laje" || op.aplicacao === "piso"; });
      a.trechos.forEach(function (op) {
        /* o DN que o projeto dos circuitos subiu (outros circuitos no mesmo eletroduto) fica: o mesmo trecho (mesmo id, mesmas
           pontas) não volta para o DN só da iluminação no religar */
        var t0 = trAnt[op.id], dnE = t0 && Math.abs(t0.p1.x - op.p1.x) + Math.abs(t0.p1.y - op.p1.y) + Math.abs(t0.p1.z - op.p1.z) + Math.abs(t0.p2.x - op.p2.x) + Math.abs(t0.p2.y - op.p2.y) + Math.abs(t0.p2.z - op.p2.z) < 0.003 ? num(t0.dn, 0) : 0;
        op.dn = Math.max(dn, dnE); op.material = ref ? "elet_corrugado_ref" : "elet_corrugado"; var L = Math.sqrt(Math.pow(op.p2.x - op.p1.x, 2) + Math.pow(op.p2.y - op.p1.y, 2) + Math.pow(op.p2.z - op.p1.z, 2));
        var pf = {}; c0.forEach(function (r) { var fz = funcao(r); pf[fz] = (pf[fz] || 0) + 1; tot[fz] += L; });
        fiacao[op.id] = { secao: secao, condutores: c0, porFuncao: pf, n: nc };
      });
    });
    Object.keys(tot).forEach(function (k) { tot[k] = r4(tot[k]); });
    out.fiacao = { porTrecho: fiacao, totais: tot, secao: secao, metrosCabo: r4(tot.fase + tot.neutro + tot.retorno + tot.terra) };

    /* luminárias: Comando, Circuito (legado = Comando), Circuito_quadro, altura */
    lums.forEach(function (L) {
      var id = ordemCmd.filter(function (k) { return cmds[k].luminarias.indexOf(L) >= 0; })[0], ins = { Comando: id, Circuito: id, Circuito_quadro: circuito };
      if (L.inst.Altura_montagem != null) ins.Altura_montagem = L.inst.Altura_montagem;
      var I0 = L.f.inst || {};
      /* sem projeto, o circuito que o USUÁRIO pôs fica (revisão adversarial n23): o `Circuito` antigo que não é comando ("C7" posto à
         mão antes da ligação) passa para o Circuito_quadro; o Circuito_quadro que não é o provisório anterior da ligação não é trocado */
      if (!circProj) {
        var cq0 = txt(I0.Circuito_quadro), cl0 = txt(I0.Circuito);
        if (cq0 && cq0 !== txt(reg0.circuito)) ins.Circuito_quadro = cq0;
        else if (!cq0 && cl0 && !/^cmd-/.test(cl0) && cl0 !== txt(I0.Comando)) ins.Circuito_quadro = cl0;
      }
      var muda = Object.keys(ins).some(function (k) { return I0[k] !== ins[k]; });
      if (muda) opsN.unshift({ op: "instancia", id: L.f.id, inst: ins, lig: ligId, ligParte: "luminaria" });
    });

    /* ---------------------------------------------------- O REGISTRO */
    var comandosReg = ordemCmd.map(function (id) { var K = cmds[id]; return { id: id, nome: K.nome, esquema: K.esquema, interruptores: K.pontos.map(function (q) { return q.caixa.fid; }).filter(Boolean), retorno: K.rot }; });
    var reg = { op: "ligEletrica", id: ligId, amb: amb.id, nomeAmb: ctx.nome, caminho: caminho, regra: { pontos: copia(regra.pontos) }, comandos: comandosReg, circuito: circuito, circuitoOrigem: circProj ? "projeto" : "provisorio", cargaVA: Math.round(carga),
      alimentacao: alim, entrada: { x: r4(E.x), y: r4(E.y), z: r4(E.z), no: entradaNo }, secao: secao, fiacao: {}, versao: 1 };
    if (regra.texto || cfg.texto) reg.regra.texto = txt(regra.texto || cfg.texto).slice(0, 200);
    Object.keys(fiacao).forEach(function (k) { reg.fiacao[k] = { n: fiacao[k].n, c: fiacao[k].condutores.join(" ") }; });
    out.registro = reg;

    /* o LOTE: apaga as peças da ligação anterior (que ainda existem) e põe as novas */
    var vivos = {};
    arr(estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { vivos[t.id] = 1; });
    arr(estado.instalacoes && estado.instalacoes.pecas).forEach(function (t) { vivos[t.id] = 1; });
    arr(estado.familias).forEach(function (t) { vivos[t.id] = 1; });
    var apagar = [], visto = {};
    ops0.forEach(function (x) { if (x && x.lig === ligId && x.id != null && (x.op === "trecho" || x.op === "peca" || x.op === "familia") && vivos[x.id] && !visto[x.id]) { visto[x.id] = 1; apagar.push({ op: "apagar", id: x.id, lig: ligId, ligParte: "religar" }); } });
    /* o que é desta ligação pelo PREFIXO do id (quem chamou só com o estado não tem as ops marcadas) */
    Object.keys(vivos).forEach(function (id) { if (ehMeu(id) && !visto[id]) { visto[id] = 1; apagar.push({ op: "apagar", id: id, lig: ligId, ligParte: "religar" }); } });
    out.ops = apagar.concat(opsN).concat([reg]);
    out.ok = true;

    /* o que a tela mostra: comandos, pontos, esquema em palavras */
    out.comandos = comandosReg.map(function (k) { var K = cmds[k.id]; return { id: k.id, nome: k.nome, esquema: k.esquema, luminarias: K.luminarias.map(function (L) { return L.f.id; }), interruptores: k.interruptores, retorno: K.rot }; });
    out.pontos = caixasInt.map(function (cx) { return { id: cx.fid, rotulo: cx.pt.rotulo, x: cx.pt.x, z: cx.pt.z, tipoId: cx.tipoId, ladoMacaneta: cx.pt.ladoMacaneta !== false, modulos: cx.mods.map(function (m) { return { comando: m.cmd, nome: cmds[m.cmd].nome, esquema: m.esquema }; }) }; });
    out.interruptores = famInt;
    var NOME_ESQ = { simples: "simples (1 interruptor)", paralelo: "paralelo / three-way (2 interruptores)", intermediario: "paralelo + intermediário / four-way (" };
    out.comandos.forEach(function (k) {
      var np = cmds[k.id].pontos.length;
      out.esquema.push(k.nome + " — " + (k.esquema === "intermediario" ? NOME_ESQ.intermediario + np + " interruptores)" : NOME_ESQ[k.esquema]) + ": " + k.luminarias.length + " luminária(s); comandada de " +
        cmds[k.id].pontos.map(function (q) { return q.caixa.pt.rotulo + " [" + q.esquema + "]"; }).join(" ↔ ") + ". " + textoEsquema(k.esquema, np));
    });
    out.esquema.push("Circuito " + circuito + " (iluminação, " + String(secao).replace(".", ",") + " mm²): fase, neutro e terra da " + (alim.tipo === "quadro" ? "saída do quadro" : (alim.tipo === "ligacao" ? "caixa do ponto de luz vizinho" : "espera")) + " até a caixa de entrada; neutro e terra seguem a cada ponto de luz.");
    /* os números usados e a etiqueta da pesquisa (o que é "sem-fonte-conferir" aparece na tela) */
    ["alturaInterruptor", "distBatente", "secaoIluminacao", "dnPorCondutores", "cargaMinima", "limiteCircuito"].forEach(function (k) { var v = V(k); if (v) out.normas.push({ id: k, valor: v.valor != null ? v.valor : (v.va || null), tipo: v.tipo, item: v.item, fonte: v.fonte }); });
    out.normas.filter(function (n) { return n.tipo === "sem-fonte-conferir"; }).forEach(function (n) { out.pendencias.push({ chave: "norma." + n.id, motivo: "valor sem fonte normativa conferida: " + n.item + " — conferir no exemplar licenciado da NBR 5410 antes de memorial assinado", conferir: true }); });
    return out;
  }
  function textoEsquema(esq, n) {
    if (esq === "simples") return "Fase no interruptor; o retorno volta à luminária.";
    if (esq === "paralelo") return "Fase no comum do 1º interruptor; 2 retornos de paralelo entre os dois; o comum do 2º devolve o retorno à luminária.";
    return "Fase no comum do 1º paralelo; os " + (n - 2) + " intermediário(s) cruzam os 2 retornos de paralelo; o comum do último paralelo devolve o retorno à luminária.";
  }
  /* pela parede: do ponto mais perto na face de parede até o alvo, contornando o ambiente pelas faces (cantos) */
  function caminhoParede(ctx, A, Bp, c) {
    var P = ctx.amb.calc.contorno.map(function (q) { return { x: q.x, z: q.z }; }), n = P.length;
    function noPerim(p) { var best = null, acc = 0; for (var i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n], pr = proj(p, a, b); if (!best || pr.d < best.d) best = { d: pr.d, i: i, s: acc + pr.s, q: pr.q }; acc += d2(a, b); } best.tot = acc; return best; }
    var pa = noPerim(A), pb = noPerim(Bp), tot = pa.tot, cum = [0]; for (var i = 1; i < n; i++) cum.push(cum[i - 1] + d2(P[i - 1], P[i]));
    var fw = ((pb.s - pa.s) % tot + tot) % tot, out = [pa.q], g, idx, dd;
    if (fw <= tot / 2) { for (g = 1; g <= n; g++) { idx = (pa.i + g) % n; dd = ((cum[idx] - pa.s) % tot + tot) % tot; if (dd >= fw - 1e-9) break; out.push(P[idx]); } }
    else { var bw = tot - fw; for (g = 0; g < n; g++) { idx = ((pa.i - g) % n + n) % n; dd = ((pa.s - cum[idx]) % tot + tot) % tot; if (dd >= bw - 1e-9) break; out.push(P[idx]); } }
    out.push(pb.q);
    /* empurra cada ponto para DENTRO da parede (fundo da caixa), para o tubo correr embutido */
    var f = geo(c, "fundoCaixa");
    return out.map(function (q) { var d = { x: 0, z: 0 }; ctx.arestas.forEach(function (e) { if (proj(q, e.a, e.b).d < 0.01) { d.x -= e.n.x * f; d.z -= e.n.z * f; } }); return { x: r4(q.x + d.x), z: r4(q.z + d.z) }; });
  }

  /* ============================================ O QUE O RENDER LÊ (contrato) */
  function comandos(estado, aval) {
    var regs = arr(estado && estado.instalacoes && estado.instalacoes.ligacoes), porId = {}, lista = [];
    function cmd(id) { if (!porId[id]) { porId[id] = { id: id, nome: id, ambiente: null, esquema: null, luminarias: [], interruptores: [] }; lista.push(porId[id]); } return porId[id]; }
    regs.forEach(function (r) { arr(r.comandos).forEach(function (k) { var c = cmd(k.id); c.nome = k.nome || k.id; c.ambiente = r.amb; c.esquema = k.esquema; }); });
    arr(estado && estado.familias).forEach(function (f) {
      var I = f.inst || {}, av = null, peca = null;
      if (I.Comando || I.Circuito) { av = avaliar(aval, f); peca = av && av.mep ? av.mep.peca : (/lumin/.test(txt(f.famId)) ? "luminaria" : null); }
      if ((peca === "luminaria") && (I.Comando || I.Circuito)) cmd(txt(I.Comando || I.Circuito)).luminarias.push(f.id);
      if (I.Comandos) txt(I.Comandos).split(",").forEach(function (k, m) { k = k.trim(); if (k) cmd(k).interruptores.push({ id: f.id, modulo: m }); });
    });
    return lista;
  }
  /* metros de cabo por seção, dos trechos que ainda existem (o comprimento é o de AGORA: mover o trecho muda o fio) */
  function cabos(estado) {
    var regs = arr(estado && estado.instalacoes && estado.instalacoes.ligacoes), tr = {}, g = {};
    arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { tr[t.id] = t; });
    regs.forEach(function (r) {
      Object.keys(r.fiacao || {}).forEach(function (id) {
        var t = tr[id], f = r.fiacao[id]; if (!t || !f) return;
        var s = String(num(r.secao, 1.5)), L = num(t.comprimento, 0), k = g[s] || (g[s] = { secao: num(s, 1.5), material: "cobre_450_750", metros: 0, porFuncao: { fase: 0, neutro: 0, retorno: 0, terra: 0 }, trechos: [], ligacoes: [] });
        txt(f.c).split(" ").forEach(function (c) { if (!c) return; var fz = c === "F" ? "fase" : (c === "N" ? "neutro" : (c === "T" ? "terra" : "retorno")); g[s].porFuncao[fz] = r4(g[s].porFuncao[fz] + L); });
        k.metros = r4(k.metros + L * num(f.n, 0)); k.trechos.push(id); if (k.ligacoes.indexOf(r.id) < 0) k.ligacoes.push(r.id);
      });
    });
    return Object.keys(g).sort().map(function (k) { return g[k]; });
  }

  /* "Tirar a ligação" do ambiente: as ops (apaga o que é dela e devolve o interruptor do lançador que ela tirou) */
  function desligar(estado, ops, ambId) {
    var lig = "lig-" + ambId, vivos = {}, out = [], visto = {};
    arr(estado.instalacoes && estado.instalacoes.trechos).concat(arr(estado.instalacoes && estado.instalacoes.pecas)).concat(arr(estado.familias)).forEach(function (t) { vivos[t.id] = 1; });
    achatar(ops).forEach(function (x) { if (x && x.lig === lig && x.id != null && (x.op === "trecho" || x.op === "peca" || x.op === "familia") && vivos[x.id] && !visto[x.id]) { visto[x.id] = 1; out.push({ op: "apagar", id: x.id }); } });
    Object.keys(vivos).forEach(function (id) { if (id.indexOf(lig + "-") === 0 && !visto[id]) { visto[id] = 1; out.push({ op: "apagar", id: id }); } });
    /* ⚠ o interruptor do "Lançar pontos elétricos" que ESTA ligação tirou (ligParte "substituido", com a caixa dele) VOLTA (revisão
       adversarial n23, 23/10/2026): antes "tirar a ligação" deixava o ambiente sem interruptor nenhum — e sem ele no orçamento */
    var hist = achatar(ops), volta = {};
    hist.forEach(function (x, i) {
      if (!x || x.op !== "apagar" || x.lig !== lig || x.ligParte !== "substituido" || x.id == null || vivos[x.id] || volta[x.id]) return;
      var cri = null, j;
      for (j = i - 1; j >= 0 && !cri; j--) { var y = hist[j]; if (y && String(y.id) === String(x.id) && (y.op === "familia" || y.op === "peca") && !y.lig) cri = { op: copia(y), j: j }; }
      if (!cri) return;
      for (j = cri.j + 1; j < i; j++) { var z = hist[j]; if (z && z.op === "instancia" && String(z.id) === String(x.id) && !z.lig) { if (z.tipoId != null) cri.op.tipoId = z.tipoId; cri.op.inst = cri.op.inst || {}; Object.keys(z.inst || {}).forEach(function (k) { cri.op.inst[k] = z.inst[k]; }); } }
      delete cri.op.ligAdota; volta[x.id] = 1; out.push(cri.op);
    });
    out.push({ op: "apagar", id: lig });
    return { id: "desligar", texto: "Tirar a ligação elétrica do ambiente (interruptores, caixas e eletrodutos dela)", ops: out };
  }

  /* ===================================================== AUDITOR
   * Cada problema: o que é (texto), gravidade, Corrigir (soluções com ops, um Ctrl+Z) e Mostrar no 3D (ids + ponto). */
  function auditar(estado, aval, ops) {
    var itens = [], B = BI();
    var R = B && B.rede ? B.rede(estado, aval) : null;
    function add(tipo, grav, texto, ids, p, sols) { itens.push({ id: tipo + ":" + ids.join(","), tipo: tipo, gravidade: grav, texto: texto, ids: ids, ponto: p ? { x: r4(p.x), y: r4(p.y), z: r4(p.z) } : null, solucoes: sols || [] }); }
    function religar(ambId, config) { var r = ligar({ ops: ops, estado: estado, avaliarFam: aval, ambiente: ambId, config: config }); return r.ok ? { id: "religar", texto: "Refazer a ligação do ambiente" + (config && config.caminho ? " (" + config.caminho + ")" : ""), ops: r.ops } : null; }
    var regs = arr(estado && estado.instalacoes && estado.instalacoes.ligacoes), cmdList = comandos(estado, aval);
    var usados = {}; if (R) R.ligacoes.forEach(function (l) { if (l.famInst != null) usados[l.famInst] = 1; });
    /* 1) luminária sem ponto de luz (sem caixa/eletroduto chegando) */
    arr(estado && estado.familias).forEach(function (f) {
      var av = avaliar(aval, f); if (!av || !av.mep) return;
      var th0 = num(f.rotY, 0), pIn = av.mep.peca === "luminaria" ? { x: num(f.x, 0), z: num(f.z, 0) } : { x: num(f.x, 0) + Math.sin(th0) * 0.05, z: num(f.z, 0) + Math.cos(th0) * 0.05 };   /* o interruptor fica NA face: 5 cm para dentro */
      var amb = ambienteEm(estado, pIn, num(f.y, 0) + 1);
      if (av.mep.peca === "luminaria") {
        if (!usados[f.id]) add("luminaria_sem_ponto", "erro", "Luminária " + f.id + " sem ponto de luz: nenhuma caixa nem eletroduto chega nela — ela não acende.", [f.id], { x: f.x, y: num(f.y, 0) + 2.5, z: f.z }, amb ? [religar(amb.id)].filter(Boolean) : []);
        else if (!txt(f.inst && (f.inst.Comando || f.inst.Circuito))) add("luminaria_sem_comando", "aviso", "Luminária " + f.id + " sem comando: nenhum interruptor a acende.", [f.id], { x: f.x, y: num(f.y, 0) + 2.5, z: f.z }, amb ? [religar(amb.id)].filter(Boolean) : []);
      }
      /* 2) interruptor atrás da porta: do lado da dobradiça, dentro do arco da folha que abre para o ambiente */
      if (av.mep.peca === "interruptor" && amb) {
        var vs = vaos(estado, aval, amb).filter(function (v) { return v.tipo === "porta" && !v.correr && v.abreParaDentro; }), P0 = { x: num(f.x, 0), z: num(f.z, 0) };
        vs.forEach(function (v) {
          var dd = (P0.x - v.D.x) * v.ux.x + (P0.z - v.D.z) * v.ux.z, dn = (P0.x - v.D.x) * v.nR.x + (P0.z - v.D.z) * v.nR.z, hs = v.dob === "fim" ? -1 : 1;
          if (dn > v.esp / 2 + 0.02 || dn < 0) return;
          if (dd * hs < 0 && Math.abs(dd) > v.W / 2 && Math.abs(dd) < v.W / 2 + v.W + 0.05) {
            var sols = [], rg = regs.filter(function (r) { return r.amb === amb.id; })[0];
            if (rg) { var s0 = religar(amb.id); if (s0) { s0.texto = "Refazer a ligação (o interruptor volta para o lado da maçaneta)"; sols.push(s0); } }
            var ctx0 = { arestas: arestas(amb, paredes(estado)), vaos: vaos(estado, aval, amb) }, q = pontoVao(ctx0, v, 1, null);
            if (q.ok) sols.push({ id: "mover", texto: "Mover o interruptor para o lado da maçaneta", ops: [{ op: "mover", id: f.id, cx: q.x, cz: q.z }, { op: "instancia", id: f.id, rotY: r4(Math.atan2(q.n.x, q.n.z)) }] });
            add("interruptor_atras_porta", "erro", "Interruptor " + f.id + " atrás da porta " + v.id + ": fica do lado da dobradiça, coberto pela folha aberta.", [f.id, v.id], { x: P0.x, y: num(f.y, 0) + 1.2, z: P0.z }, sols);
          }
        });
      }
    });
    /* 3) comando sem luminária / sem interruptor */
    cmdList.forEach(function (k) {
      var rg = regs.filter(function (r) { return r.amb === k.ambiente; })[0];
      if (!k.luminarias.length && k.interruptores.length) add("comando_sem_luminaria", "aviso", "Comando \"" + k.nome + "\" sem luminária: o interruptor " + k.interruptores.map(function (q) { return q.id; }).join(", ") + " não acende nada.", k.interruptores.map(function (q) { return q.id; }), null, rg ? [religar(rg.amb), desligar(estado, ops, rg.amb)].filter(Boolean) : []);
      if (k.luminarias.length && !k.interruptores.length) {
        /* o ambiente SEM porta (nem passagem): religar não resolve — a solução é lançar a porta ou clicar o ponto (revisão n23) */
        var ambK = k.ambiente ? ambientes(estado).filter(function (a) { return a.id === k.ambiente; })[0] : null, semPorta = false;
        if (ambK) { var arK = arestas(ambK, paredes(estado)); semPorta = !vaos(estado, aval, ambK).concat(passagens(estado, ambK, arK)).some(function (v) { return v.tipo === "porta"; }); }
        var solK = rg && !semPorta ? [religar(rg.amb)].filter(Boolean) : [];
        if (semPorta) solK.push({ id: "nota-sem-porta", texto: "O ambiente não tem porta no modelo: lance as portas (Portas e janelas automáticas) e religue, ou clique o ponto do interruptor em Instalações › Ligação da iluminação." });
        add("comando_sem_interruptor", "erro", "Comando \"" + k.nome + "\" sem interruptor: " + k.luminarias.length + " luminária(s) sem onde acender" + (semPorta ? " (o ambiente não tem porta no modelo)" : "") + ".", k.luminarias, null, solK);
      }
    });
    /* 4) eletroduto cruzando viga/pilar */
    var obs = obstaculos(estado);
    if (obs.length) arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      if (t.sistema !== "eletrica") return;
      obs.forEach(function (o) {
        if (!cortaCaixa(t.p1, t.p2, o, GEO.tolColisao)) return;
        var rg = regs.filter(function (r) { return r.fiacao && r.fiacao[t.id]; })[0], sols = [];
        if (rg) { ["forro", "parede"].forEach(function (cm) { if (rg.caminho !== cm) { var s = religar(rg.amb, { caminho: cm }); if (s) sols.push(s); } }); var s1 = religar(rg.amb); if (s1) sols.unshift(s1); }
        add("eletroduto_cruza_" + o.tipo, "erro", "Eletroduto " + t.id + " cruza " + (o.tipo === "pilar" ? "o pilar " : "a viga ") + o.id + ": furo em peça estrutural — desvie ou passe por outro caminho.", [t.id, o.id], { x: (t.p1.x + t.p2.x) / 2, y: (t.p1.y + t.p2.y) / 2, z: (t.p1.z + t.p2.z) / 2 }, sols);
      });
    });
    return { itens: itens, total: itens.length, erros: itens.filter(function (i) { return i.gravidade === "erro"; }).length };
  }

  var EletIlum = { VERSAO: 1, GEO: GEO, ligar: ligar, desligar: desligar, interpretar: interpretar, comandos: comandos, cabos: cabos, auditar: auditar, rotuloRegra: rotuloRegra, textoEsquema: textoEsquema,
    _int: { contexto: null, vaos: vaos, arestas: arestas, entradaDe: entradaDe, tetoDe: tetoDe, forroDe: forroDe, obstaculos: obstaculos, cortaCaixa: cortaCaixa, cargaMinima: cargaMinima, dnPara: dnPara, classe: classe, caminhoParede: caminhoParede } };
  global.EletIlum = EletIlum;
  if (typeof module !== "undefined" && module.exports) module.exports = EletIlum;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
