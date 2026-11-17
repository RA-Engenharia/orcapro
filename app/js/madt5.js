/* =====================================================================
 * madt5.js — T5: PERGOLADO em madeira engenharada (MLC): pilares + vigas principais + vigas secundárias (caibros) + ripado opcional,
 * LIVRE (dois alinhamentos de pilares) ou ENCOSTADO numa parede/viga existente (um lado apoiado na parede, ligação declarada),
 * com cobertura leve (policarbonato / vidro / telha leve) ou só sombreamento. Motor PURO, ES5, sem DOM, Node-testável. Arquivo NOVO.
 * Decisões, fontes e conta à mão: docs/madeira/T5-REFERENCIA.md.
 *
 * CONVENÇÃO (a mesma da T2/T3): ponto = [X, Z da planta, altura]; no solver x = X, y = vertical, z = Z.
 *   · X = direção dos CAIBROS (vão `vao` entre os eixos dos dois alinhamentos de pilares; a inclinação da cobertura corre em X, lado ALTO em X = 0);
 *   · Z = direção das VIGAS PRINCIPAIS (comprimento `comp` entre os pilares extremos).
 * Peças: P (pilar), VP (viga principal, sobre os pilares, em Z, com balanço nas pontas), VS (caibro: viga secundária em X, sobre as VP, com balanço nos dois lados),
 *   MF (mão-francesa: MZ no plano Z–Y pilar→VP; MX no plano X–Y pilar→caibro), RP (ripa em Z sobre os caibros; verificada à parte, fora do pórtico 3D).
 * ESTABILIDADE LATERAL (decisão): mão-francesa nas duas direções com base ROTULADA (chapa + chumbadores), ver T5-REFERENCIA.md §3.
 * ENCOSTADO: o alinhamento de pilares do lado da parede e a VP desse lado NÃO existem; os caibros nascem na parede (estribo + chumbadores).
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  function rd(x, n) { return Number(x.toFixed(n)); }
  function r2(x) { return Math.round(x * 1000) / 1000; }
  function norm(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }
  function ext(a) { for (var i = 1; i < arguments.length; i++) for (var k in arguments[i]) if (Object.prototype.hasOwnProperty.call(arguments[i], k)) a[k] = arguments[i][k]; return a; }
  function mescla(base, o) { var r = {}, k; for (k in base) r[k] = (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) ? mescla(base[k], (o || {})[k]) : ((o || {})[k] != null ? o[k] : base[k]); for (k in (o || {})) if (!(k in r)) r[k] = o[k]; return r; }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }
  function linspace(a, b, n) { var o = [], i; if (n === 1) return [a]; for (i = 0; i < n; i++) o.push(a + (b - a) * i / (n - 1)); return o; }
  function br(x, n) { return (n == null ? Number(x).toFixed(2) : Number(x).toFixed(n)).replace(".", ","); }
  function D() { return { MT: req("MadTipologias", "madtipologias.js") }; }

  var MLC = "MLC GL24h (EN 14080) — pinus/eucalipto, cola PUR/MUF classe de serviço 3", INOX = "aço inox AISI 316 (A4)", GALV = "aço ASTM A36 galvanizado a fogo (NBR 6323)";
  var FOLGA = 0.010;       /* folga construtiva mínima (m): a mão-francesa NÃO encosta no pilar nem na viga; a carga passa só por chapa + pinos */

  /* pesos de cobertura leve: valores de CATÁLOGO/ADOTADOS (não são de norma) — o usuário informa o do fabricante */
  var COBERTURAS = {
    nenhuma: { rotulo: "sem cobertura (só sombreamento)", peso: 0, fonte: "—" },
    policarbonato: { rotulo: "policarbonato alveolar 10 mm com perfis", peso: 0.06, fonte: "ADOTADO (catálogo típico ≈ 1,7 kg/m² da placa + perfis de alumínio) — informar o do fabricante" },
    vidro: { rotulo: "vidro laminado 8 mm com perfis", peso: 0.25, fonte: "NBR 6120:2019, Tab. 1 (vidro plano 26 kN/m³ × 8 mm = 0,21 kN/m²) + perfis ADOTADOS" },
    "telha-leve": { rotulo: "telha leve (termoacústica / metálica)", peso: 0.10, fonte: "ADOTADO (catálogo típico) — informar o do fabricante" }
  };
  var T5_PADRAO = {
    vao: 3.6, comp: 6.0, peDireito: 2.8, baseZ: 0, balCaibro: 0.5, balViga: 0.5, sPilarMax: 3.0, sCaibro: 0.60, mfD: 0.70, estab: "mf", plantas: 0, origem: { x: 0, y: 0 }, nome: "Pergolado",
    ripado: { ativo: false, s: 0.12, b: 0.03, h: 0.05 },
    cobertura: { tipo: "nenhuma", peso: null, incl: 0.10 },
    encostado: { ativo: false, lado: "alto", ligacao: "estribo-chumbador" },
    obstrucao: null, coberturaPresaEm: "caibros", diafragma: false      /* obstrucao: "sim" | "nao" | null (não informada = PENDÊNCIA); a cobertura é presa nos CAIBROS (padrão declarado) ou nas ripas */
  };
  function t5Parametros(p) {
    var q = mescla(T5_PADRAO, p || {});
    if (!COBERTURAS[q.cobertura.tipo]) throw new Error("madt5: cobertura.tipo deve ser nenhuma, policarbonato, vidro ou telha-leve");
    q.comCob = q.cobertura.tipo !== "nenhuma";
    q.cobPeso = q.comCob ? (q.cobertura.peso != null && q.cobertura.peso !== "" ? Number(q.cobertura.peso) : COBERTURAS[q.cobertura.tipo].peso) : 0;
    if (!(q.cobPeso >= 0)) throw new Error("madt5: peso da cobertura inválido");
    q.incl = q.comCob ? Number(q.cobertura.incl) : 0;
    if (q.comCob && !(q.incl >= 0.05)) throw new Error("madt5: a cobertura leve exige inclinação mínima de 5 % (escoamento da água; NBR 6120:2019, 6.4 recomenda ≥ 2 %, e placas de policarbonato/vidro pedem ≥ 5 %)");
    if (q.incl > 0.7) throw new Error("madt5: inclinação acima de 70 % (Tabela 17 da NBR 6123 vale até tg θ = 0,7)");
    if (!(q.vao >= 1.5 && q.vao <= 6.5)) throw new Error("madt5: vão entre alinhamentos de pilares fora de 1,5 a 6,5 m");
    if (!(q.comp >= 1.5)) throw new Error("madt5: comprimento mínimo de 1,5 m");
    if (!(q.peDireito >= 2.2)) throw new Error("madt5: pé-direito (alto) mínimo de 2,2 m");
    if (!(q.balCaibro >= 0 && q.balCaibro <= 1.5)) throw new Error("madt5: balanço do caibro fora de 0 a 1,5 m");
    if (!(q.balViga >= 0 && q.balViga <= 1.5)) throw new Error("madt5: balanço da viga principal fora de 0 a 1,5 m");
    if (!(q.sCaibro >= 0.3 && q.sCaibro <= 1.2)) throw new Error("madt5: espaçamento dos caibros fora de 0,3 a 1,2 m");
    if (!(q.sPilarMax >= 1.5 && q.sPilarMax <= 5)) throw new Error("madt5: espaçamento máximo dos pilares fora de 1,5 a 5 m");
    if (q.ripado.ativo && !(q.ripado.s >= 0.04 && q.ripado.s <= 0.6)) throw new Error("madt5: espaçamento das ripas fora de 4 a 60 cm");
    if (q.estab !== "mf") throw new Error("madt5: estab deve ser \"mf\" (mão-francesa, base rotulada) — a base engastada não foi implementada (T5-REFERENCIA.md §3)");
    if (q.encostado.ativo && q.encostado.lado !== "alto" && q.encostado.lado !== "baixo") throw new Error("madt5: encostado.lado deve ser \"alto\" (parede em X = 0) ou \"baixo\" (parede em X = vão)");
    if (q.obstrucao != null && q.obstrucao !== "sim" && q.obstrucao !== "nao") throw new Error("madt5: obstrucao deve ser \"sim\", \"nao\" ou nula (não informada)");
    if (q.coberturaPresaEm !== "caibros" && q.coberturaPresaEm !== "ripas") throw new Error("madt5: coberturaPresaEm deve ser \"caibros\" ou \"ripas\"");
    q.hBaixo = q.peDireito - q.incl * q.vao;
    if (q.hBaixo < 2.0) throw new Error("madt5: o lado baixo ficaria a " + br(q.hBaixo) + " m do piso (mínimo 2,0 m): reduzir a inclinação/vão ou subir o pé-direito");
    q._t5 = true; return q;
  }

  /** orientação da altura h da seção (vetor unitário em [X, Z, altura]): barra inclinada → h no plano vertical que contém o eixo (invariante da T3: nenhuma barra deitada) */
  function upDe(m) {
    var d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), Lh = hyp(d[0], d[1]);
    if (m.up) return m.up;
    if (Lh < 0.02 * L) return m.plano === "z" ? [0, 1, 0] : [1, 0, 0];
    if (Math.abs(d[2]) < 0.02 * L) return [0, 0, 1];
    var al = Lh / L, be = d[2] / L, hx = d[0] / Lh, hz = d[1] / Lh;
    return [-be * hx, -be * hz, al];
  }

  /** GEOMETRIA: membros ({ id, g, p0, p1, nos, ... }, pontos [X, Z, altura]) e info */
  function t5Geometria(pp) {
    var p = pp && pp._t5 ? pp : t5Parametros(pp), V = p.vao, C = p.comp, M = [], n = 0, k, j, i = p.incl, sc = Math.sqrt(1 + i * i);
    var enc = p.encostado.ativo, ladoEnc = enc ? p.encostado.lado : null, d = p.mfD;
    var yX = function (x) { return p.peDireito + p.baseZ - i * x; };                    /* cota do eixo da viga/caibro na posição X (lado alto em X = 0) */
    var z0 = -p.balViga, zN = C + p.balViga;
    var nzP = Math.max(1, Math.ceil(C / p.sPilarMax - 1e-9)), zP = linspace(0, C, nzP + 1);
    var linhas = []; if (!(enc && ladoEnc === "alto")) linhas.push(0); if (!(enc && ladoEnc === "baixo")) linhas.push(V);
    var xa = (enc && ladoEnc === "alto") ? 0 : -p.balCaibro, xb = (enc && ladoEnc === "baixo") ? V : V + p.balCaibro;
    /* caibros: espaçamento ≤ sCaibro entre z0 e zN, mais os eixos dos pilares (a mão-francesa do plano X–Y chega num caibro) */
    var nC = Math.max(1, Math.ceil((zN - z0) / p.sCaibro - 1e-9)), zC = linspace(z0, zN, nC + 1);
    zP.forEach(function (z) { if (!zC.some(function (w) { return Math.abs(w - z) < 0.04; })) zC.push(z); else { var ix = 0; zC.forEach(function (w, q2) { if (Math.abs(w - z) < Math.abs(zC[ix] - z)) ix = q2; }); if (ix > 0 && ix < zC.length - 1) zC[ix] = z; } });
    zC.sort(function (a, b) { return a - b; });
    function add(o) { o.p0 = o.p0.map(function (v) { return rd(v, 4); }); o.p1 = o.p1.map(function (v) { return rd(v, 4); }); if (o.nos) o.nos = o.nos.map(function (P) { return P.map(function (v) { return rd(v, 4); }); }); M.push(o); return o; }
    var P3 = function (x, z, y) { return [x, z, y]; };
    var temMFX = !enc;     /* encostado: a parede trava a direção X; sem parede, a mão-francesa X liga o pilar ao caibro que passa pelo eixo do pilar */
    /* nós das vigas principais: caibros, pilares e as pontas das mãos-francesas Z */
    var zMF = []; zP.forEach(function (z) { [-1, 1].forEach(function (s) { var zz = z + s * d; if (zz >= z0 - 1e-9 && zz <= zN + 1e-9) zMF.push(zz); }); });
    /* pilares */
    var hP = {};
    linhas.forEach(function (x, ix) {
      zP.forEach(function (z, kz) {
        var top = yX(x), nos = [P3(x, z, top - d)];
        add({ id: "P" + (++n), g: "P", p0: P3(x, z, p.baseZ), p1: P3(x, z, top), nos: nos, linha: x, kz: kz, pinJ: true });
        hP["P" + n] = top;
      });
    });
    /* vigas principais */
    linhas.forEach(function (x, ix) {
      var nos = []; zC.concat(zP).concat(zMF).forEach(function (z) { if (z > z0 + 1e-6 && z < zN - 1e-6 && !nos.some(function (w) { return Math.abs(w[1] - z) < 1e-4; })) nos.push(P3(x, z, yX(x))); });
      nos.sort(function (a, b) { return a[1] - b[1]; });
      add({ id: "VP" + (ix + 1), g: "VP", plano: "z", p0: P3(x, z0, yX(x)), p1: P3(x, zN, yX(x)), nos: nos, linha: x });
    });
    /* caibros (vigas secundárias): X de xa a xb, com nós nas VP, nas pontas da mão-francesa X e no meio de cada vão */
    zC.forEach(function (z, kc) {
      var nos = [], xs = [0, V, V / 2];
      var pilarAqui = zP.some(function (w) { return Math.abs(w - z) < 1e-6; });
      if (temMFX && pilarAqui) linhas.forEach(function (x) { [-1, 1].forEach(function (s) { var xx = x + s * d; if (xx >= xa - 1e-9 && xx <= xb + 1e-9) xs.push(xx); }); });
      xs.sort(function (a, b) { return a - b; });
      xs.forEach(function (x) { if (x > xa + 1e-6 && x < xb - 1e-6 && !nos.some(function (w) { return Math.abs(w[0] - x) < 1e-4; })) nos.push(P3(x, z, yX(x))); });
      add({ id: "VS" + (kc + 1), g: "VS", plano: "x", p0: P3(xa, z, yX(xa)), p1: P3(xb, z, yX(xb)), nos: nos, z: z, kc: kc, pilarAqui: pilarAqui, parede: enc ? (ladoEnc === "alto" ? "p0" : "p1") : null });
    });
    /* mãos-francesas (barras birrotuladas): MZ (plano Z–Y) do pilar à VP; MX (plano X–Y) do pilar ao caibro */
    var nmz = 0, nmx = 0;
    linhas.forEach(function (x) {
      zP.forEach(function (z) {
        var yp = yX(x) - d;
        [-1, 1].forEach(function (s) {
          var zz = z + s * d; if (zz < z0 - 1e-9 || zz > zN + 1e-9) return;
          add({ id: "MZ" + (++nmz), g: "MF", sub: "MZ", plano: "z", p0: P3(x, z, yp), p1: P3(x, zz, yX(x)), pinI: true, pinJ: true, linha: x, zP: z, pilarEm: [x, z, yp], vigaEm: [x, zz, yX(x)], hospede: "VP" });
        });
        if (temMFX) [-1, 1].forEach(function (s) {
          var xx = x + s * d; if (xx < xa - 1e-9 || xx > xb + 1e-9) return;
          add({ id: "MX" + (++nmx), g: "MF", sub: "MX", plano: "x", p0: P3(x, z, yp), p1: P3(xx, z, yX(xx)), pinI: true, pinJ: true, linha: x, zP: z, pilarEm: [x, z, yp], vigaEm: [xx, z, yX(xx)], hospede: "VS" });
        });
      });
    });
    /* ripado (fora do pórtico 3D: verificado à parte, sua carga entra nos caibros) */
    var rip = null;
    if (p.ripado.ativo) {
      var nR = Math.floor((xb - xa) / p.ripado.s + 1e-9) + 1, xr = []; for (k = 0; k < nR; k++) xr.push(xa + k * p.ripado.s);
      rip = { n: nR, xs: xr, z0: z0, zN: zN, L: zN - z0, b: p.ripado.b, h: p.ripado.h, s: p.ripado.s };
    }
    var area = (xb - xa) * (zN - z0) * sc;     /* área da cobertura (inclinada) */
    return { p: p, membros: M, info: { vao: V, comp: C, incl: i, sc: sc, Hh: yX(0), Hl: yX(V), yX: yX, z0: z0, zN: zN, xa: xa, xb: xb, zP: zP, zC: zC, linhas: linhas, mfD: d, encostado: enc, obstrucao: enc || p.obstrucao === "sim", ladoEnc: ladoEnc, ripa: rip, areaCob: area, areaPlanta: (xb - xa) * (zN - z0), temMFX: temMFX, nCaibros: zC.length, nPilares: linhas.length * zP.length } };
  }

  /* ---------------------------------------------------------------- FONTE (lista de peças) */
  function Lista() {
    var pecas = [];
    return { pecas: pecas, add: function (k) {
      if (k.qtd == null) k.qtd = 1; if (!k.unidade) k.unidade = "peça";
      if (k.p0 && k.p1) { var L = norm(k.p0, k.p1); k.comprimento_m = rd(L, 3); var s = k.secao; if (s) { var A = s.tipo === "ret" ? s.b * s.h : (s.area_media || 0); k.volume_m3 = rd(A * L * k.qtd, 4); } }
      k.p0 = k.p0 ? k.p0.map(function (v) { return rd(v, 4); }) : null; k.p1 = k.p1 ? k.p1.map(function (v) { return rd(v, 4); }) : null; if (k.secao === undefined) k.secao = null; pecas.push(k); return k;
    } };
  }
  function cm(x) { return rd(x * 100, 0); }
  var NOMES = { P: ["Pergolado — pilares", "Pilar"], VP: ["Pergolado — vigas principais", "Viga principal (sobre os pilares, com balanço)"], VS: ["Pergolado — caibros", "Viga secundária (caibro) sobre as vigas principais"],
    MF: ["Pergolado — mãos-francesas", "Mão-francesa (pilar → viga), pontas aparadas: folga ≥ 10 mm, carga só por chapa + pinos"] };
  var LINEAR = { VP: 1, VS: 1 };
  /** FONTE: marcas com quantidade; a mão-francesa sai APARADA (apar.membros). A ripa entra com a quantidade e o comprimento. */
  function t5Fonte(p, sec, ext2, apar) {
    ext2 = ext2 || {}; var G = t5Geometria(p), lista = Lista(), M = apar ? apar.membros : G.membros, I = G.info, marcas = {}, ordem = [], cont = {};
    var nomeClasse = String(ext2.classe || "mlc:GL24h").split(":")[1] || "GL24h";
    function put(k) { ["material", "especificacao", "descricao"].forEach(function (c) { if (typeof k[c] === "string") k[c] = k[c].replace(/GL24h/g, nomeClasse); }); return lista.add(k); }
    M.forEach(function (m) {
      if (!NOMES[m.g]) return;
      var s = sec[m.g] || {}, L = norm(m.p0, m.p1), linear = !!LINEAR[m.g], key = [m.g, rd(L, 3), linear ? m.id : "", JSON.stringify(s)].join("|");
      if (!marcas[key]) { marcas[key] = { m: m, qtd: 0, sec: s }; ordem.push(key); }
      marcas[key].qtd++;
    });
    ordem.forEach(function (key) {
      var r = marcas[key], m = r.m, nm = NOMES[m.g], s = r.sec, linear = !!LINEAR[m.g];
      cont[m.g] = (cont[m.g] || 0) + 1;
      var k = { id: linear ? m.id : m.g + cont[m.g], marca: m.g, grupo: nm[0], descricao: nm[1], material: MLC, especificacao: "MLC GL24h " + cm(s.b) + "×" + cm(s.h) + " cm", secao: { tipo: "ret", b: s.b, h: s.h }, p0: m.p0, p1: m.p1, up: upDe(m), qtd: r.qtd };
      if (m.bisel) { k.bisel = m.bisel; k.especificacao += "; pontas cortadas perpendiculares (folga ≥ 10 mm do pilar e da viga)"; }
      put(k);
    });
    if (I.ripa && sec.RP) put({ id: "RP", marca: "RP", grupo: "Pergolado — ripado", descricao: "Ripa sobre os caibros (verificada à parte)", material: MLC.replace("GL24h", "GL24h"), especificacao: "MLC GL24h " + cm(sec.RP.b) + "×" + cm(sec.RP.h) + " cm", secao: { tipo: "ret", b: sec.RP.b, h: sec.RP.h }, p0: [I.xa, I.z0, I.yX(I.xa) + (sec.VS ? sec.VS.h / 2 + sec.RP.h / 2 : 0)], p1: [I.xa, I.zN, I.yX(I.xa) + (sec.VS ? sec.VS.h / 2 + sec.RP.h / 2 : 0)], up: [0, 0, 1], qtd: I.ripa.n });
    var nPil = M.filter(function (m) { return m.g === "P"; }).length, nMF = M.filter(function (m) { return m.g === "MF"; }).length, nVS = M.filter(function (m) { return m.g === "VS"; }).length;
    if (nPil) put({ id: "LIG-BASE", grupo: "Ligações — bases", descricao: "Base rotulada do pilar: chapa interna de aço + pinos inox no pilar, placa de base e chumbadores (grupos dimensionados pela NBR 7190-1 e NBR 8800)", material: GALV, especificacao: "placa + chapa t = 8 mm + pinos inox, por base", secao: null, qtd: nPil });
    if (nPil) put({ id: "LIG-CABECA", grupo: "Ligações — cabeça do pilar", descricao: "Cabeça do pilar × viga principal: UMA chapa interna de aço por nó + pinos inox no pilar e na viga", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por nó", secao: null, qtd: nPil });
    if (nMF) put({ id: "LIG-MF", grupo: "Ligações — mãos-francesas", descricao: "Pontas das mãos-francesas: chapa interna + pinos inox (nó do pilar: uma chapa em cruz por nó; nó da viga/caibro)", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por ponta", secao: null, qtd: nMF * 2 });
    if (nVS) put({ id: "LIG-VS", grupo: "Ligações — caibros", descricao: I.encostado ? "Caibro × viga principal (parafusos de rosca total a 45°) e caibro × parede (estribo + chumbadores)" : "Caibro × viga principal (parafusos de rosca total a 45°)", material: INOX, especificacao: "parafusos de rosca total inox", secao: null, qtd: nVS * (I.linhas.length + (I.encostado ? 1 : 0)) });
    return { pecas: lista.pecas, membros: M, info: I };
  }
  function volumePorMaterial(pecas) { return D().MT.volumePorMaterial(pecas); }

  var MadT5 = { PADRAO: T5_PADRAO, COBERTURAS: COBERTURAS, parametros: t5Parametros, geometria: t5Geometria, fonte: t5Fonte, upDe: upDe, FOLGA: FOLGA, volumePorMaterial: volumePorMaterial,
    _util: { linspace: linspace, norm: norm, rd: rd, copia: copia, ext: ext, mescla: mescla, hyp: hyp, r2: r2, br: br, req: req } };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT5;
  else global.MadT5 = MadT5;
})(typeof window !== "undefined" ? window : this);
