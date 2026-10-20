/* =====================================================================
 * partesmoveis.js — PARTE MÓVEL de uma peça (porta, folha, gaveta) — motor puro
 *
 * Pedido do engenheiro (20/10/2026): "todas as portas implementadas dentro do sistema: quando eu
 * clicar nela no 3D, ela abre — para a gente conseguir andar dentro do ambiente sem atravessar
 * porta. Armários também: o que for gaveta vem para frente, o que for porta de armário abre."
 *
 * O QUE É. Uma peça (família do js/familia.js, qualquer geometria) declara PARTES MÓVEIS. Cada parte
 * é um conjunto de sólidos/malhas que anda junto, com UM movimento:
 *   · ROTAÇÃO  (giro, basculante, pivotante): eixo = ponto + direção, no sistema LOCAL da peça
 *              (metros, Y para cima), e o ângulo de abertura (graus, 0 a 180) com o SENTIDO (+1/−1);
 *   · TRANSLAÇÃO (correr, gaveta): vetor (direção) e curso (metros).
 * Estado = fração t ∈ [0, 1] (0 fechada, 1 aberta). A geometria da peça NÃO muda com o estado:
 * quantitativo, volume e orçamento são os mesmos aberta ou fechada. Quem desenha aplica a POSE.
 *
 * CONVENÇÃO DO GIRO: regra da mão direita em torno de `eixoDir` (unitário). Em torno de +Y, um ponto
 * em +X anda para −Z (x' = x·cos θ, z' = −x·sen θ). O sinal do ângulo escolhe o lado em que a folha abre.
 *
 * FORMATO AVALIADO (o que `Familia.avaliar` devolve em `partesMoveis` e o gerador de malha também):
 *   { id, nome, tipo, movimento: "rotacao"|"translacao", solidos: [ids],
 *     eixoPonto: [x,y,z], eixoDir: [dx,dy,dz] (unitário), angulo (graus COM sinal), anguloMax (|ângulo|),
 *     vetor: [vx,vy,vz] (já vezes o curso), curso }
 *
 * Sem DOM. ES5, IIFE, Node-testável (tools/test-c487-portas.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  var RAD = Math.PI / 180;
  /* o tipo → o movimento, o nome em português e o eixo padrão da rotação */
  var TIPOS = {
    giro:        { mov: "rotacao",    nome: "Porta de giro",        dir: [0, 1, 0] },
    pivotante:   { mov: "rotacao",    nome: "Porta pivotante",      dir: [0, 1, 0] },
    basculante:  { mov: "rotacao",    nome: "Folha basculante",     dir: [1, 0, 0] },
    correr:      { mov: "translacao", nome: "Folha de correr",      dir: null },
    gaveta:      { mov: "translacao", nome: "Gaveta",               dir: null },
    /* COMPOSTO: gira em torno do eixo E desliza o vetor, juntos (a folha da pele de vidro recolhível: gira 90° e vai até a pilha) */
    recolher:    { mov: "composto",   nome: "Folha que recolhe",    dir: [0, 1, 0] }
  };
  var TOL_EIXO = 0.03;   /* m: folga da caixa da peça para o ponto do eixo (a dobradiça fica na borda) */

  function num(v, d) { var n = +v; return isFinite(n) && v !== null && v !== "" && typeof v !== "boolean" ? n : d; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function vet3(v, pad) {
    if (!Array.isArray(v) || v.length !== 3) return pad || null;
    var a = [num(v[0], NaN), num(v[1], NaN), num(v[2], NaN)];
    return (isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2])) ? a : (pad || null);
  }
  function unit(v) {
    var n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return n > 1e-9 ? [v[0] / n, v[1] / n, v[2] / n] : null;
  }

  /* ---------------------------------------------------------------
   * normalizar — uma definição NUMÉRICA vira a parte avaliada
   *   def = { id, nome?, tipo, solidos?, eixo: [x,y,z], dir?: [x,y,z], angulo?, sentido?, vetor?: [x,y,z], curso? }
   * Devolve { ok, parte, erros }. Nunca lança.
   * ------------------------------------------------------------- */
  function normalizar(def) {
    var erros = [], d = def || {}, id = String(d.id == null ? "" : d.id), T = TIPOS[d.tipo];
    if (!id) erros.push("parte móvel sem id");
    if (!T) { erros.push("parte \"" + id + "\": tipo \"" + String(d.tipo) + "\" desconhecido (" + Object.keys(TIPOS).join(", ") + ")"); return { ok: false, parte: null, erros: erros }; }
    var p = { id: id, nome: String(d.nome || T.nome), tipo: d.tipo, movimento: T.mov, solidos: arr(d.solidos).map(String) };
    if (d.grupo) p.grupo = String(d.grupo);   /* partes do mesmo grupo (da mesma peça) abrem e fecham juntas: o clique em uma folha da pele de vidro move a pele inteira */
    if (d.geoEstado) p.geoEstado = true;   /* a geometria da peça JÁ acompanha o estado (Aberto/Abertura): o 3D anima a partir dela, desfazendo a pose do estado salvo */
    if (T.mov === "rotacao" || T.mov === "composto") {
      var pt = vet3(d.eixo), dir = unit(vet3(d.dir, T.dir ? T.dir.slice() : null) || [0, 1, 0]);
      var ang = num(d.angulo, NaN), sg = num(d.sentido, 1) < 0 ? -1 : 1;
      if (!pt) erros.push("parte \"" + id + "\": falta o ponto do eixo");
      if (!dir) erros.push("parte \"" + id + "\": a direção do eixo é nula");
      if (!isFinite(ang)) erros.push("parte \"" + id + "\": falta o ângulo de abertura");
      else if (ang < 0 || ang > 180) erros.push("parte \"" + id + "\": ângulo de abertura " + r6(ang) + "° fora de 0 a 180");
      if (erros.length) return { ok: false, parte: null, erros: erros };
      p.eixoPonto = pt; p.eixoDir = dir; p.anguloMax = ang; p.angulo = ang * sg;
      if (T.mov === "composto") {
        var vv = unit(vet3(d.vetor) || [0, 0, 0]), cc = num(d.curso, NaN);
        if (!vv) erros.push("parte \"" + id + "\": o vetor do movimento é nulo");
        if (!(cc > 0)) erros.push("parte \"" + id + "\": curso ausente ou ≤ 0");
        if (erros.length) return { ok: false, parte: null, erros: erros };
        p.curso = cc; p.vetor = [r6(vv[0] * cc), r6(vv[1] * cc), r6(vv[2] * cc)];
      }
    } else {
      var v = unit(vet3(d.vetor) || [0, 0, 0]), cu = num(d.curso, NaN);
      if (!v) erros.push("parte \"" + id + "\": o vetor do movimento é nulo");
      if (!isFinite(cu)) erros.push("parte \"" + id + "\": falta o curso");
      else if (!(cu > 0)) erros.push("parte \"" + id + "\": curso ≤ 0 (" + r6(cu) + ")");
      if (erros.length) return { ok: false, parte: null, erros: erros };
      p.curso = cu; p.vetor = [r6(v[0] * cu), r6(v[1] * cu), r6(v[2] * cu)];
    }
    /* ESCALONAMENTO: a parte só se move na janela [ini, fim] da fração (0 ≤ ini < fim ≤ 1); fora dela fica parada */
    if (d.janela != null) {
      var j0 = num(d.janela[0], NaN), j1 = num(d.janela[1], NaN);
      if (!(j0 >= 0 && j1 <= 1 && j0 < j1)) return { ok: false, parte: null, erros: ["parte \"" + id + "\": janela de tempo inválida (0 ≤ início < fim ≤ 1)"] };
      p.janela = [j0, j1];
    }
    return { ok: true, parte: p, erros: [] };
  }

  /* a parte avaliada cabe na peça? O ponto do eixo tem de estar DENTRO da caixa da peça (com folga TOL_EIXO).
     ⚠ Por que existe: eixo digitado fora da peça (sinal errado, origem trocada) faz a folha "voar" em órbita
     larga — a porta gira em torno de um ponto no meio da sala. caixa = { x0,y0,z0,x1,y1,z1 } local. */
  function checar(partes, caixa) {
    var erros = [];
    arr(partes).forEach(function (p) {
      if (!p) return;
      if (p.movimento === "rotacao" || p.movimento === "composto") {
        if (p.movimento === "composto" && !(p.curso > 0)) erros.push("parte \"" + p.id + "\": curso ≤ 0");
        if (p.anguloMax < 0 || p.anguloMax > 180) erros.push("parte \"" + p.id + "\": ângulo de abertura fora de 0 a 180");
        if (caixa && p.eixoPonto) {
          var e = p.eixoPonto;
          if (e[0] < caixa.x0 - TOL_EIXO || e[0] > caixa.x1 + TOL_EIXO || e[1] < caixa.y0 - TOL_EIXO || e[1] > caixa.y1 + TOL_EIXO || e[2] < caixa.z0 - TOL_EIXO || e[2] > caixa.z1 + TOL_EIXO)
            erros.push("parte \"" + p.id + "\": o eixo (" + e.map(r6).join("; ") + ") está fora da caixa da peça");
        }
      } else if (p.movimento === "translacao") {
        if (!(p.curso > 0)) erros.push("parte \"" + p.id + "\": curso ≤ 0");
      } else erros.push("parte \"" + p.id + "\": movimento desconhecido");
    });
    return { ok: !erros.length, erros: erros };
  }

  /* ---------------------------------------------------------------
   * pose — a matriz 4×4 (coluna-maior, como o three) da parte em t ∈ [0, 1], no sistema LOCAL da peça
   * ------------------------------------------------------------- */
  function ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  /* opc.sinc: ignora a janela de escalonamento (a pose "de verdade" do estado salvo, em que as folhas andam juntas) */
  function pose(p, t, opc) {
    var k = Math.max(0, Math.min(1, +t || 0)), m = ident();
    if (p && p.janela && !(opc && opc.sinc)) k = Math.max(0, Math.min(1, (k - p.janela[0]) / (p.janela[1] - p.janela[0])));
    if (!p || k === 0) return m;
    if (p.movimento === "translacao") { m[12] = p.vetor[0] * k; m[13] = p.vetor[1] * k; m[14] = p.vetor[2] * k; return m; }
    if (p.movimento !== "rotacao" && p.movimento !== "composto") return m;
    var a = p.eixoDir, o = p.eixoPonto, th = p.angulo * RAD * k, c = Math.cos(th), s = Math.sin(th), C = 1 - c, x = a[0], y = a[1], z = a[2];
    var r00 = c + x * x * C, r01 = x * y * C - z * s, r02 = x * z * C + y * s;
    var r10 = y * x * C + z * s, r11 = c + y * y * C, r12 = y * z * C - x * s;
    var r20 = z * x * C - y * s, r21 = z * y * C + x * s, r22 = c + z * z * C;
    m[0] = r00; m[1] = r10; m[2] = r20; m[4] = r01; m[5] = r11; m[6] = r21; m[8] = r02; m[9] = r12; m[10] = r22;
    m[12] = o[0] - (r00 * o[0] + r01 * o[1] + r02 * o[2]);
    m[13] = o[1] - (r10 * o[0] + r11 * o[1] + r12 * o[2]);
    m[14] = o[2] - (r20 * o[0] + r21 * o[1] + r22 * o[2]);
    if (p.movimento === "composto") { m[12] += p.vetor[0] * k; m[13] += p.vetor[1] * k; m[14] += p.vetor[2] * k; }   /* gira em torno do eixo e, junto, desliza */
    return m;
  }
  function aplicar(m, v) {
    return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  }
  function mult(a, b) {   /* a × b, coluna-maior */
    var o = new Array(16), i, j, k;
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { var s = 0; for (k = 0; k < 4; k++) s += a[k * 4 + i] * b[j * 4 + k]; o[j * 4 + i] = s; }
    return o;
  }
  /* a matriz da instância (como o js/bim.js a monta): translação (x,y,z) ∘ giro em Y (rotY, radianos) */
  function matrizInstancia(inst) {
    var c = Math.cos(+inst.rotY || 0), s = Math.sin(+inst.rotY || 0);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, +inst.x || 0, +inst.y || 0, +inst.z || 0, 1];
  }
  function inversaRigida(m) {   /* [R|t]⁻¹ = [Rᵀ|−Rᵀt] — só vale para giro + translação */
    var o = ident();
    o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10];
    o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
    return o;
  }
  /* a pose no MUNDO: M · P(t) · M⁻¹ — a malha da instância já está em M, então `poseMundo × matrizDaMalha` a move */
  function poseMundo(p, t, inst, opc) {
    var M = matrizInstancia(inst);
    return mult(M, mult(pose(p, t, opc), inversaRigida(M)));
  }

  /* ---------------------------------------------------------------
   * fracaoDe — o estado salvo na INSTÂNCIA. Reaproveita o jeito da pele de vidro retrátil
   * (js/familiaspiscina.js): "Aberto" (sim/não) manda; senão "Abertura" (0 a 1).
   * `valores` = os valores finais da família; `inst` = os da instância (pode ter o nome sem o parâmetro declarado).
   * ------------------------------------------------------------- */
  function chaveDe(o, nome) {
    if (!o) return undefined;
    if (Object.prototype.hasOwnProperty.call(o, nome)) return o[nome];
    var k = nome.toLowerCase(), ks = Object.keys(o);
    for (var i = 0; i < ks.length; i++) if (ks[i].toLowerCase() === k) return o[ks[i]];
    return undefined;
  }
  function simnao(v) { return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "sim" || String(v).toLowerCase() === "true"; }
  function fracaoDe(valores, inst) {
    var ab = chaveDe(inst, "Aberto"); if (ab === undefined) ab = chaveDe(valores, "Aberto");
    if (simnao(ab)) return 1;
    var fr = chaveDe(inst, "Abertura"); if (fr === undefined) fr = chaveDe(valores, "Abertura");
    var n = num(fr, 0); return Math.max(0, Math.min(1, n));
  }

  /* os parâmetros de INSTÂNCIA que toda peça com parte móvel carrega (os da pele de vidro: o mesmo nome e o mesmo sentido) */
  function parametrosEstado() {
    return [
      { nome: "Aberto", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Abertura", descricao: "Posição para o 3D: aberto (todas as partes móveis). Não muda o quantitativo." },
      { nome: "Abertura", tipoDado: "numero", escopo: "instancia", valor: 0, grupo: "Abertura", descricao: "Fração aberta de 0 (fechado) a 1 (aberto), quando 'Aberto' está desligado" }
    ];
  }

  var PartesMoveis = {
    TIPOS: TIPOS, TOL_EIXO: TOL_EIXO, normalizar: normalizar, checar: checar, pose: pose, aplicar: aplicar, mult: mult,
    matrizInstancia: matrizInstancia, inversaRigida: inversaRigida, poseMundo: poseMundo, fracaoDe: fracaoDe, parametrosEstado: parametrosEstado
  };
  global.PartesMoveis = PartesMoveis;
  if (typeof module !== "undefined" && module.exports) module.exports = PartesMoveis;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
