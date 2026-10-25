/* =====================================================================
 * iluminacaosugerir.js — "SUGERIR ILUMINAÇÃO" por ambiente (frente I2 da
 * maquete viva, 21/10/2026). Motor puro (Node-testável), sem DOM.
 *
 * Pedido do Rogério: a Casa 487 abriu sem nenhuma luminária — à noite nada
 * acende. O comando EXPLÍCITO "Sugerir iluminação" põe famílias do catálogo
 * (js/familiasluz.js) em cada ambiente pela iluminância exigida para o uso.
 * Nada muda no projeto sem o clique em Aplicar; tudo fica editável e apagável.
 *
 * A NORMA (fonte, edição e o que falta) — biblioteca de normas da RA:
 *  · ABNT NBR 15575-1:2013 (Edificações habitacionais — Desempenho, Parte 1),
 *    13.3.1 Tabela 13.3 (mínimo, M) e Anexo E, Tabela E.4 (intermediário I e
 *    superior S); plano horizontal a 0,80 m do piso (Anexo B.3), cálculo pela
 *    NBR 5382 com toda a iluminação do ambiente ligada. Texto lido em
 *    BIBLIOTECA TÉCNICA - NORMAS\_ÍNDICE\texto\ABNT NBR 15575-1-2013.txt.
 *    ⚠ A Parte 1 tem edição posterior (vitrine ABNT: 2025) que NÃO está na
 *    biblioteca: os valores são da 2013 até a nova ser lida.
 *    ⚠ Corredor: a Tabela 13.3 (texto extraído) agrupa o corredor no "75*"
 *    e a Tabela E.4 dá M = 100; usamos a E.4 (o maior dos dois).
 *  · Ambiente de TRABALHO (escritório, home office): ABNT NBR ISO/CIE 8995-1
 *    — NÃO está na biblioteca: o alvo fica PENDENTE (o usuário informa).
 *  · Área externa (varanda, piscina, jardim) e o que a Tabela 13.3 não lista
 *    (closet, depósito): PENDENTE, com o "Corrigir" de usar um uso da tabela.
 *
 * O MÉTODO DOS LÚMENS (E = N·Φ·FU·FM / A), com o FATOR DE UTILIZAÇÃO
 * CALCULADO (não tirado de tabela de fabricante, que não temos):
 *  1. o fluxo DIRETO no plano de 0,80 m: a soma ponto a ponto da luz de cada
 *     luminária do arranjo, numa grade de 0,15 m dentro do contorno (as mesmas
 *     grandezas do motor: painel L = Φ/πA, spot I = Φ/Ω, lâmpada I = Φ/4π);
 *  2. as INTER-REFLEXÕES: radiosidade de 3 superfícies (teto, paredes acima do
 *     plano, plano de trabalho) com fatores de forma exatos de retângulos
 *     paralelos (Incropera, Tabela 13.2) no retângulo de mesma área e
 *     perímetro; refletâncias = albedo dos acabamentos do próprio modelo
 *     (biblioteca de materiais do render, data/materiais-render-ra.json);
 *  3. FU = fluxo que chega ao plano / fluxo das lâmpadas; E médio = Φplano/A;
 *     E no centro = direta no centro + a parcela refletida (uniforme).
 *  FM (fator de manutenção) padrão = 1,00: a verificação da NBR 15575-1 é
 *  no protótipo (instalação nova, Anexo B.2/B.3) e o render mostra a obra
 *  nova. Sem fonte para outro valor na biblioteca; editável.
 * ES5, IIFE.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function semAcento(s) { return txt(s).toLowerCase().normalize ? txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s).toLowerCase(); }

  var FONTE = "ABNT NBR 15575-1:2013, 13.3.1 (Tabela 13.3) e Anexo E (Tabela E.4); plano a 0,80 m (Anexo B.3)";
  var AVISO_EDICAO = "Valores do texto de 2013 da biblioteca; a Parte 1 tem edição posterior ainda não lida — conferir.";
  /* usos da Tabela E.4 (M = mínimo obrigatório da 13.3.1) */
  var USOS = {
    sala: { nome: "Sala de estar", M: 100, I: 150, S: 200, K: 3000 },
    dormitorio: { nome: "Dormitório", M: 100, I: 150, S: 200, K: 3000 },
    banheiro: { nome: "Banheiro", M: 100, I: 150, S: 200, K: 4000 },
    servico: { nome: "Área de serviço", M: 100, I: 150, S: 200, K: 4000 },
    cozinha: { nome: "Copa/cozinha", M: 200, I: 300, S: 400, K: 4000 },
    circulacao: { nome: "Corredor ou escada interna", M: 100, I: 150, S: 200, K: 3000, obs: "A Tabela 13.3 (texto extraído) traz 75 lux; a E.4, M = 100: usado o maior." },
    garagem: { nome: "Garagem interna e coberta", M: 100, I: 150, S: 200, K: 4000 }
  };
  var PENDENTES = {
    trabalho: "Ambiente de trabalho: o nível vem da ABNT NBR ISO/CIE 8995-1, que não está na biblioteca de normas — informe o lux.",
    externo: "Área externa: a NBR 15575-1 (Tabela 13.3) não traz nível para varanda, piscina ou jardim — informe o lux.",
    outro: "A NBR 15575-1 (Tabela 13.3) não lista este ambiente — escolha o uso equivalente ou informe o lux."
  };
  /* o uso pelo nome do ambiente */
  function usoDe(nome) {
    var n = semAcento(nome);
    if (/escritorio|home ?office|estudo|trabalho/.test(n)) return { pend: "trabalho" };
    if (/varanda|terraco|sacada|piscina|jardim|quintal|deck|externa|patio|solario|pergolado/.test(n)) return { pend: "externo" };
    if (/gourmet|churrasq/.test(n)) return { pend: "externo" };
    if (/cozinha|copa/.test(n)) return { uso: "cozinha" };
    if (/servico|lavanderia/.test(n)) return { uso: "servico" };
    if (/banh|lavabo|\bwc\b|sanitario|toalete/.test(n)) return { uso: "banheiro" };
    if (/dormit|quarto|suite/.test(n)) return { uso: "dormitorio" };
    if (/sala|estar|jantar|living|tv/.test(n)) return { uso: "sala" };
    if (/corredor|circula|hall|escada|passagem/.test(n)) return { uso: "circulacao" };
    if (/garagem/.test(n)) return { uso: "garagem" };
    return { pend: "outro" };
  }

  /* ------------------------------------------------ GEOMETRIA DO CONTORNO */
  function pts(c) { return arr(c).map(function (p) { return [num(p.x != null ? p.x : p[0], 0), num(p.z != null ? p.z : p[1], 0)]; }); }
  function area(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  function perimetro(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; }
  function dentro(P, x, z) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
  function dentroComFuros(P, F, x, z) { if (!dentro(P, x, z)) return false; for (var i = 0; i < F.length; i++) if (F[i].length > 2 && dentro(F[i], x, z)) return false; return true; }
  function distBorda(P, x, z) {
    var m = Infinity;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
      m = Math.min(m, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
    return m;
  }
  /* o eixo do ambiente: a direção do lado mais comprido (cômodo girado em planta) */
  function eixo(P) {
    var best = 0, ang = 0;
    for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } }
    return ang;
  }

  /* ------------------------------------------------ FATORES DE FORMA (retângulos paralelos iguais a × b, distância c) */
  function fParalelos(a, b, c) {
    if (!(c > 1e-9)) return 1;
    var X = a / c, Y = b / c, X2 = X * X, Y2 = Y * Y;
    var t = 0.5 * Math.log((1 + X2) * (1 + Y2) / (1 + X2 + Y2)) + X * Math.sqrt(1 + Y2) * Math.atan(X / Math.sqrt(1 + Y2)) + Y * Math.sqrt(1 + X2) * Math.atan(Y / Math.sqrt(1 + X2)) - X * Math.atan(X) - Y * Math.atan(Y);
    return Math.max(0, Math.min(1, 2 / (Math.PI * X * Y) * t));
  }
  /* o retângulo de mesma área e perímetro (o cômodo redondo/irregular vira o quadrado de mesma área) */
  function retEquivalente(A, P) {
    var s = P / 2, d = s * s - 4 * A;
    if (d <= 0) { var q = Math.sqrt(A); return [q, q]; }
    var a = (s + Math.sqrt(d)) / 2; return [a, A / a];
  }
  /* radiosidade de 3 superfícies: 0 teto, 1 paredes (acima do plano), 2 plano de trabalho. Φ0 = fluxo direto que chega em cada uma.
     Φi = Φ0i + Σj ρj Φj Fji → resolve (I − Mᵀ)Φ = Φ0, M[j][i] = ρj Fji. */
  function radiosidade(A, Aw, Fcf, rho, F0) {
    var Fcw = 1 - Fcf, Ffc = Fcf, Ffw = 1 - Fcf, Fwc = Aw > 0 ? A * Fcw / Aw : 0, Fwf = Aw > 0 ? A * Ffw / Aw : 0, Fww = Math.max(0, 1 - Fwc - Fwf);
    var F = [[0, Fcw, Fcf], [Fwc, Fww, Fwf], [Ffc, Ffw, 0]];
    var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j, k;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) M[i][j] = (i === j ? 1 : 0) - rho[j] * F[j][i];
    var b = F0.slice();
    for (k = 0; k < 3; k++) {   /* Gauss com pivô */
      var p = k; for (i = k + 1; i < 3; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      var t = M[k]; M[k] = M[p]; M[p] = t; var tb = b[k]; b[k] = b[p]; b[p] = tb;
      for (i = k + 1; i < 3; i++) { var f = M[i][k] / M[k][k]; for (j = k; j < 3; j++) M[i][j] -= f * M[k][j]; b[i] -= f * b[k]; }
    }
    var x = [0, 0, 0];
    for (i = 2; i >= 0; i--) { var s = b[i]; for (j = i + 1; j < 3; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return { teto: x[0], paredes: x[1], plano: x[2], F: F };
  }

  /* ------------------------------------------------ A LUZ DIRETA de um emissor num ponto do plano (superfície virada para cima)
     (as grandezas do js/rendermat.js; cosseno do emissor como na placa, js/bimluzluminarias.js) */
  function eDireta(l, x, y, z) {
    var dx = l.posicao[0] - x, dy = l.posicao[1] - y, dz = l.posicao[2] - z;
    if (l.tipo === "pendente") dy -= 0.05;   /* os motores descem a lâmpada 5 cm */
    var d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1e-6, cs = dy / d;
    if (cs <= 0) return 0;
    if (l.tipo === "painel") {
      var ax = l.rotX == null ? -Math.PI / 2 : l.rotX, A = l.largura * l.profundidade * (l.circular ? Math.PI / 4 : 1);
      /* normal de emissão: −(u × v); para baixo quando rotX = −90° */
      var cl = ax === -Math.PI / 2 || Math.abs(ax + Math.PI / 2) < 1e-6 ? dy / d : emissaoCos(l, dx, dy, dz, d);
      return cl > 0 ? l.intensidade * A * cl * cs / Math.max(d2, 1e-8) : 0;
    }
    if (l.tipo === "spot") {
      var dv = l.dir || [0, -1, 0], ct = -(dx * dv[0] + dy * dv[1] + dz * dv[2]) / d, a = Math.cos(l.angulo / 2 * Math.PI / 180), b = Math.cos(l.angulo / 2 * Math.PI / 180 * 0.7);
      var tt = Math.max(0, Math.min(1, (ct - a) / Math.max(1e-6, b - a))), sm = tt * tt * (3 - 2 * tt);
      return l.intensidade * sm * cs / Math.max(d2, 1e-6);
    }
    return l.intensidade * cs / Math.max(d2, 0.01);
  }
  function emissaoCos(l, dx, dy, dz, d) {
    var ax = l.rotX, ry = l.rotY || 0;
    /* direção de emissão = R·(0,0,−1) com R = Ry(ry)·Rx(ax) */
    var ex = -Math.cos(ax) * Math.sin(ry), ey = Math.sin(ax), ez = -Math.cos(ax) * Math.cos(ry);
    return -(dx * ex + dy * ey + dz * ez) / d;
  }
  /* fluxo para BAIXO e para CIMA de um emissor (painel/spot: tudo para onde aponta; lâmpada: metade/metade) */
  function partes(l) {
    var phi = num(l.fluxo, 0);
    if (l.tipo === "pendente") return { baixo: phi / 2, cima: phi / 2 };
    if (l.tipo === "painel" && l.rotX != null && Math.sin(l.rotX) > 0.5) return { baixo: 0, cima: phi };
    if (l.tipo === "painel" && l.rotX != null && Math.abs(Math.sin(l.rotX)) <= 0.5) return { baixo: phi / 2, cima: phi / 2 };
    return { baixo: phi, cima: 0 };
  }

  /* ------------------------------------------------ O CÁLCULO DE UM ARRANJO */
  /* sala = { contorno:[[x,z]], furos, base, topo }, luzes = as luzes do motor (mundo), rho = { teto, paredes, piso }, fm */
  function calcular(sala, luzes, rho, fm) {
    var P = sala.contorno, F = sala.furos || [], A = area(P), Pm = perimetro(P), base = sala.base, H = sala.topo - sala.base, hp = 0.80, c = Math.max(0.05, H - hp);
    var yp = base + hp, passo = Math.max(0.1, Math.min(0.25, Math.sqrt(A) / 30));
    var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity]; P.forEach(function (q) { mn[0] = Math.min(mn[0], q[0]); mn[1] = Math.min(mn[1], q[1]); mx[0] = Math.max(mx[0], q[0]); mx[1] = Math.max(mx[1], q[1]); });
    var soma = 0, nPts = 0, emin = Infinity;
    for (var x = mn[0] + passo / 2; x < mx[0]; x += passo) for (var z = mn[1] + passo / 2; z < mx[1]; z += passo) {
      if (!dentroComFuros(P, F, x, z)) continue;
      var e = 0; for (var i = 0; i < luzes.length; i++) e += eDireta(luzes[i], x, yp, z);
      soma += e; nPts++; if (e < emin) emin = e;
    }
    var dA = nPts ? A / nPts : 0, phiDir = soma * dA;
    var baixo = 0, cima = 0, total = 0; luzes.forEach(function (l) { var p = partes(l); baixo += p.baixo; cima += p.cima; total += num(l.fluxo, 0); });
    phiDir = Math.min(phiDir, baixo);
    var ab = retEquivalente(A, Pm), Fcf = fParalelos(ab[0], ab[1], c), Aw = Pm * c;
    var r = radiosidade(A, Aw, Fcf, [rho.teto, rho.paredes, rho.piso], [cima, Math.max(0, baixo - phiDir), phiDir]);
    var phiPlano = r.plano, refl = Math.max(0, phiPlano - phiDir);
    /* no centro (centroide do contorno): a direta + a refletida uniforme */
    var cx = 0, cz = 0; P.forEach(function (q) { cx += q[0]; cz += q[1]; }); cx /= P.length; cz /= P.length;
    var ec = 0; luzes.forEach(function (l) { ec += eDireta(l, cx, yp, cz); });
    var f = num(fm, 1);
    return { area: A, perimetro: Pm, peDireito: H, Emed: f * phiPlano / Math.max(A, 1e-6), Ecentro: f * (ec + refl / Math.max(A, 1e-6)), Emin: f * (isFinite(emin) ? emin + refl / Math.max(A, 1e-6) : 0),
             FU: total > 0 ? phiPlano / total : 0, fluxoTotal: total, direto: phiDir, Fcf: Fcf, pontos: nPts };
  }

  /* ------------------------------------------------ O ARRANJO: n luminárias numa grade no eixo do cômodo, dentro do contorno */
  function arranjo(sala, n) {
    var P = sala.contorno, F = sala.furos || [], ang = eixo(P), ca = Math.cos(ang), sa = Math.sin(ang);
    var loc = P.map(function (q) { return [q[0] * ca + q[1] * sa, -q[0] * sa + q[1] * ca]; });   /* no sistema do eixo */
    var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity]; loc.forEach(function (q) { mn[0] = Math.min(mn[0], q[0]); mn[1] = Math.min(mn[1], q[1]); mx[0] = Math.max(mx[0], q[0]); mx[1] = Math.max(mx[1], q[1]); });
    var L = mx[0] - mn[0], W = mx[1] - mn[1], melhor = null;
    /* tenta grades nx × ny com nx·ny ≥ n, proporção do cômodo; fica a que põe n pontos DENTRO com a maior folga das paredes */
    for (var nx = 1; nx <= n; nx++) {
      var ny = Math.max(1, Math.round(n / nx)); if (nx * ny < n) ny = Math.ceil(n / nx);
      var dx = L / nx, dy = W / ny, cand = [];
      for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
        var u = mn[0] + (i + 0.5) * dx, v = mn[1] + (j + 0.5) * dy, x = u * ca - v * sa, z = u * sa + v * ca;
        if (dentroComFuros(P, F, x, z) && distBorda(P, x, z) > 0.2) cand.push({ x: x, z: z, folga: distBorda(P, x, z) });
      }
      if (cand.length < n) continue;
      cand.sort(function (a, b) { return b.folga - a.folga; });
      var esc = cand.slice(0, n), nota = Math.abs(Math.log((dx / Math.max(dy, 1e-6)))) + (cand.length - n) * 0.3;
      if (!melhor || nota < melhor.nota) melhor = { nota: nota, pontos: esc.map(function (p) { return { x: p.x, z: p.z }; }), rotY: -ang };
    }
    if (!melhor && n === 1) {   /* cômodo estreito/torto: o ponto mais longe das paredes */
      var bx = null; for (var x2 = Math.min.apply(null, P.map(function (q) { return q[0]; })); x2 < Math.max.apply(null, P.map(function (q) { return q[0]; })); x2 += 0.1) for (var z2 = Math.min.apply(null, P.map(function (q) { return q[1]; })); z2 < Math.max.apply(null, P.map(function (q) { return q[1]; })); z2 += 0.1) { if (!dentroComFuros(P, F, x2, z2)) continue; var d = distBorda(P, x2, z2); if (!bx || d > bx.d) bx = { x: x2, z: z2, d: d }; }
      if (bx) melhor = { pontos: [{ x: bx.x, z: bx.z }], rotY: -ang };
    }
    return melhor;
  }

  /* ------------------------------------------------ A SUGESTÃO DE UM AMBIENTE
     amb = { id, nome, contorno, furos, base, topo, forro, piso } (contorno em [x,z] ou {x,z}; mundo do BIM)
     op = { nivel: "M"|"I"|"S", lux (força o alvo), uso (força o uso), familia/tipo (força), rho {teto,paredes,piso}, fm,
            avaliar(famId, tipoId, inst) → valores, luzesDe(valores, inst) → luzes (FamiliasLuz.luzes), maxN } */
  function sugerirAmbiente(amb, op) {
    op = op || {};
    var sala = { contorno: pts(amb.contorno), furos: arr(amb.furos).map(pts), base: num(amb.base, 0), topo: num(amb.topo, 2.8) };
    var out = { ambId: txt(amb.id), nome: txt(amb.nome), avisos: [] };
    if (sala.contorno.length < 3 || !(sala.topo > sala.base + 0.5)) { out.pendente = "Ambiente sem contorno ou pé-direito: não dá para calcular."; return out; }
    var u = op.uso ? (USOS[op.uso] ? { uso: op.uso } : { pend: "outro" }) : usoDe(amb.nome), nivel = op.nivel || "I";
    out.uso = u.uso || null;
    if (u.uso) { var U = USOS[u.uso]; out.usoNome = U.nome; out.alvo = { lux: U[nivel], nivel: nivel, fonte: FONTE, aviso: AVISO_EDICAO + (U.obs ? " " + U.obs : "") }; }
    if (op.lux > 0) out.alvo = { lux: +op.lux, nivel: "informado", fonte: "informado pelo usuário" };
    if (!out.alvo) { out.pendente = PENDENTES[u.pend || "outro"]; out.motivo = u.pend || "outro"; return out; }
    /* a luminária: forro de gesso/drywall/PVC/madeira → embutir; laje → sobrepor. Temperatura: 4000 K em cozinha, serviço, banheiro e garagem */
    var embutir = /gesso|drywall|forro|pvc|madeira|lambri|acartonado/i.test(txt(amb.forro)) && !/laje/i.test(txt(amb.forro));
    var K = (USOS[out.uso] || {}).K || 3000;
    var famId = op.familia || "ra-ilum-plafon", tipoId = op.tipo || (embutir ? "tb-red-emb-" : "tb-red-sob-") + K;
    out.familia = famId; out.tipo = tipoId; out.instalacao = embutir ? "embutir (forro)" : "sobrepor (laje)";
    var rho = op.rho || { teto: 0.7, paredes: 0.5, piso: 0.3 };
    out.refletancias = rho; out.fm = num(op.fm, 1);
    var H = sala.topo - sala.base;
    var maxN = op.maxN || 40, res = null, n0 = Math.max(1, op.n || 1);
    for (var n = n0; n <= (op.n || maxN); n++) {
      var arj = arranjo(sala, n); if (!arj) continue;
      var luzes = [];
      arj.pontos.forEach(function (p, i) {
        var inst = { Altura_montagem: H };
        var v = op.avaliar(famId, tipoId, inst);
        var r = op.luzesDe(v, { x: p.x, y: sala.base, z: p.z, rotY: arj.rotY }, { id: "s" + i, nome: "s" + i });
        if (r.pendente) out.pendenteLuz = r.pendente;
        r.luzes.forEach(function (l) { luzes.push(l); });
      });
      if (!luzes.length) { out.pendente = "A luminária escolhida não tem fluxo no catálogo: " + (out.pendenteLuz || "") ; return out; }
      var c = calcular(sala, luzes, rho, out.fm);
      res = { n: n, arranjo: arj, calc: c, luzes: luzes };
      if (c.Emed >= out.alvo.lux) break;
    }
    if (!res) { out.pendente = "Não coube nenhuma luminária no contorno (cômodo estreito demais)."; return out; }
    var v0 = op.avaliar(famId, tipoId, { Altura_montagem: H });
    out.base = sala.base; out.n = res.n; out.pontos = res.arranjo.pontos; out.rotY = res.arranjo.rotY; out.alturaMontagem = H;
    out.Emed = res.calc.Emed; out.Ecentro = res.calc.Ecentro; out.Emin = res.calc.Emin; out.FU = res.calc.FU; out.area = res.calc.area;
    out.fluxo = res.calc.fluxoTotal; out.W = res.n * num(v0.Potencia_W, 0); out.Wm2 = out.W / Math.max(res.calc.area, 1e-6);
    out.atende = res.calc.Emed >= out.alvo.lux;
    if (!out.atende) out.avisos.push("Com " + res.n + " luminárias o nível médio fica em " + Math.round(res.calc.Emed) + " lux (alvo " + out.alvo.lux + "): troque por uma de mais fluxo.");
    if (H > 4) out.avisos.push("Pé-direito de " + H.toFixed(2).replace(".", ",") + " m: confira pendente ou spot no lugar do plafon.");
    out.comando = "cmd-" + txt(amb.id) + "-geral";
    return out;
  }

  /* as ops do BIM para aplicar uma lista de sugestões (ids estáveis por ambiente: aplicar de novo SUBSTITUI) */
  var PREFIXO = "ilum-sug-";
  function idsDe(estado, ambId) { return arr(estado && estado.familias).filter(function (f) { return String(f.id).indexOf(PREFIXO + ambId + "-") === 0; }).map(function (f) { return f.id; }); }
  function ops(estado, sugestoes) {
    var out = [];
    arr(sugestoes).forEach(function (s) {
      if (!s || !s.pontos || !s.n) return;
      idsDe(estado, s.ambId).forEach(function (id) { out.push({ op: "apagar", id: id }); });
      s.pontos.forEach(function (p, i) {
        out.push({ op: "familia", id: PREFIXO + s.ambId + "-" + (i + 1), famId: s.familia, tipoId: s.tipo, x: Math.round(p.x * 1e4) / 1e4, y: Math.round(num(s.base, 0) * 1e4) / 1e4, z: Math.round(p.z * 1e4) / 1e4,
          rotY: Math.round(num(s.rotY, 0) * 1e6) / 1e6, inst: { Altura_montagem: Math.round(s.alturaMontagem * 1e4) / 1e4, Comando: s.comando, Circuito: s.comando } });
      });
    });
    return out;
  }
  function opsApagar(estado, ambIds) {
    var out = [];
    arr(estado && estado.familias).forEach(function (f) {
      var id = String(f.id); if (id.indexOf(PREFIXO) !== 0) return;
      if (ambIds && !ambIds.some(function (a) { return id.indexOf(PREFIXO + a + "-") === 0; })) return;
      out.push({ op: "apagar", id: f.id });
    });
    return out;
  }

  var IluminacaoSugerir = {
    FONTE: FONTE, AVISO_EDICAO: AVISO_EDICAO, USOS: USOS, PENDENTES: PENDENTES, PREFIXO: PREFIXO,
    usoDe: usoDe, sugerirAmbiente: sugerirAmbiente, calcular: calcular, arranjo: arranjo, ops: ops, opsApagar: opsApagar,
    fParalelos: fParalelos, radiosidade: radiosidade, retEquivalente: retEquivalente, eDireta: eDireta, area: area
  };
  global.IluminacaoSugerir = IluminacaoSugerir;
  if (typeof module !== "undefined" && module.exports) module.exports = IluminacaoSugerir;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
