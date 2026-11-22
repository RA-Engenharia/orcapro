/* =====================================================================
 * madt3tucalc.js — T3TU (ETAPA 2): o MESMO cálculo do madt3lcalc.js (modelo 3D de barras no solver acoanalise, 2ª ordem, imperfeição geométrica, K_br,1 medido, F1d, modelos (a)/(b) do
 * espigão, MadDim.barra2022, ELS, laço de crescimento da seção — as funções do madt3calc.js são as MESMAS) generalizado de "duas asas (L)" para N ASAS: a barra A e até 2 pernas (B, C),
 * sobre os membros do madt3tumembros.js (L, T e U). O que muda em relação ao L:
 *   · geometria: TM.geometriaMembros (águas "A#" da geometria, cumeeira da barra e de cada perna, um rincão por canto côncavo, espigões internos onde houver);
 *   · VENTO POR LISTA DE ASAS: a Tabela 5 (duas águas) é calculada por asa (barra a × b e cada perna c_j × w_j, quadro girado X' = Z, Y' = X); a água que pertence a uma asa só usa a asa; a água
 *     COMUM (ponta da barra encostada numa perna) leva a ENVOLTÓRIA (barra só onde z ≤ b; perna sempre), como a água oeste do L; o retângulo circunscrito (a × c máx.) serve só às paredes e ao q;
 *   · K_br,1, F1d e família de contraventamento por asa (A, B, C); montante central da tesoura de extremidade por asa;
 *   · PENDÊNCIA AO RT em cada canto côncavo (sobrepressão local na reentrância do rincão; sombreamento entre as asas) — res.pendenciasRT e dentro da PREMISSA DE VENTO.
 * Os avisos mantêm o prefixo "T3L:" para a classificação de premissas do madengsaidas.js (PREMISSAS: /^T3L?: .../) continuar valendo sem alterar arquivo compartilhado.
 * Para o L, o resultado é IGUAL ao do madt3lcalc.js (tools/test-mad-eng-tu.js [etapa 2]). Convenção do solver: x = X, y = vertical, z = Z da planta.
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var TM = req("MadT3TUMembros", "madt3tumembros.js"), TL = req("MadT3L", "madt3l.js"), C3 = req("MadT3Calc", "madt3calc.js"), U = TL._util, D = U.D, ext = U.ext, hyp = U.hyp, r2 = U.r2, br = U.br, copia = U.copia, norm = U.norm;
  var perfilFn = C3.perfilFn, modulos = C3.modulos, durClasse = C3.durClasse, modeloSemFalha = C3.modeloSemFalha, diagNo = C3.diagNo, slipDiag = C3.slipDiag, slipTerca = C3.slipTerca, pressaoParede = C3.pressaoParede, vigaEspigao = C3.vigaEspigao, torcaoFR = C3.torcaoFR, excent = C3.excent, maxGap = C3.maxGap, kbrMin = null;
  var AGUA_CALHA_KNM = 10 * 0.0075,      /* carga VARIÁVEL de água retida na calha do rincão: γw·A, γw = 10 kN/m³ e seção molhada A = 0,0075 m² (calha em V de 0,30 m de boca com lâmina de 50 mm: 0,30 × 0,05 / 2) — PREMISSA declarada, a confirmar pelo RT */
    CALHA_KNM = 7850 * 9.80665 / 1000 * 0.00065 * 0.70, TL_LIM = ext({}, C3.T3_LIM, { RC: { hMax: 0.48, bMax: 0.24 }, CB: { hMax: 0.48, bMax: 0.24 } });
  var DIR_NORMAL = function (sl, sn, cs) { return sl === "F" ? [0, cs, -sn] : sl === "B" ? [0, cs, sn] : sl === "W" ? [-sn, cs, 0] : [sn, cs, 0]; };
  function keyDe(proj) { return JSON.stringify(proj, function (k, v) { return (k.charAt(0) === "_" && k !== "") ? undefined : v; }); }
  function kbrMinF(Eef, I2, L1, m) { return 2 * (1 + Math.cos(Math.PI / m)) * Math.PI * Math.PI * Eef * 1e3 * I2 / Math.pow(L1, 3); }

  function lPadrao(proj) {
    var Dm = D(), q = {}; Object.keys(proj).forEach(function (k) { if (k.charAt(0) !== "_") q[k] = proj[k]; });
    q.classe = q.classe || "mlc:GL24h"; q.umidade = q.umidade || 2; q.limVao = q.limVao || 300; q.limBalanco = q.limBalanco || 150; q.pesoMLC = q.pesoMLC != null ? q.pesoMLC : 5.0;
    q.cargas = ext({ outros: 0 }, q.cargas || {}); q.passo = ext({ largura: 0.02, altura: 0.04 }, q.passo || {}); q.limites = ext({}, TL_LIM, q.limites || {});
    var cl = Dm.MM.classe2022(q.classe); if (cl.incompleta) throw new Error("madmateriais: classe " + q.classe + " incompleta — " + cl.incompleta);
    q.params = TM.parametros(q.params); return q;
  }
  /** VENTO: a NBR 6123:2023 não traz coeficientes de telhado de 4 águas nem em L (só uma e duas águas, Tabelas 5 e 6). PREMISSA (revisão 20/11/2026): a Tabela 5 (duas águas) é calculada POR ASA, cada uma
   *  com a SUA cumeeira e o SEU h/b: asa A (a × b, cumeeira em z = b/2) e asa B (c × bb, cumeeira em x = bb/2; o quadro da asa B é o da A girado: X' = Z, Y' = X). O retângulo circunscrito (a × c) fica SÓ para
   *  as paredes e o q (a cumeeira dele, em z = c/2, não existe no telhado: era o erro CONTRA a segurança). A pressão numa água é a da asa a que ela pertence; na água oeste (comum às duas asas) é a ENVOLTÓRIA
   *  (maior |p|) das duas asas. Os beirais internos Q (z = b) e I (x = bb) são beirais REAIS da asa que os contém: faixa de borda da Tabela 5 e +0,8·q por baixo a barlavento. A confirmar pelo RT. */
  var MAPA_B = { 0: 90, 90: 0, 180: 270, 270: 180 };          /* direção do vento no quadro GLOBAL → no quadro de uma PERNA (X' = Z, Y' = X) */
  var FACES_B = { frente: "esquerda", esquerda: "frente", fundo: "direita", direita: "fundo" };      /* face do quadro da perna → face global (parede x0' = global y0, etc.) */
  function pernaDe(p, asa) { var r = null; p.legs.forEach(function (L) { if (L.asa === asa) r = L; }); return r; }
  function lVento(q, G, avisos) {
    var Dm = D(), p = G.p, I = G.info, th = Math.atan(p.incl) * 180 / Math.PI, h0 = I.Hp - p.baseZ, cmax = I.cmax, rot = p.a < cmax - 1e-9;
    /* retângulo circunscrito (a × c máx.): SÓ paredes e q. Com a < c a Tabela 5 (a ≥ b) não aceita o retângulo a × c: calcula-se o transposto e os casos voltam ao quadro global */
    var der = rot ? { a: cmax, b: p.a, h: h0, hCumeeira: I.hA - p.baseZ, inclinacaoGraus: th, cobertura: "duas-aguas" } : { a: p.a, b: cmax, h: h0, hCumeeira: I.hA - p.baseZ, inclinacaoGraus: th, cobertura: "duas-aguas" };
    var geo = ext({ nervuras: "retangulares" }, (q.vento && q.vento.geometria) || {}, der), ent = ext({}, q.vento, { geometria: geo }), key = JSON.stringify(ent) + "|" + p.a + "|" + p.b + "|" + JSON.stringify(p.legs.map(function (L) { return [L.x0, L.w, L.c]; })) + "|" + (p.anel ? "anel" : "-");
    if (q._vento && q._ventoKey === key) return q._vento;
    if (!ent.faces) { ent.faces = {}; ["frente", "fundo", "esquerda", "direita"].forEach(function (k) { ent.faces[k] = { fechada: true, vedacao: "misto" }; }); avisos.push("T3L: faces do vento não informadas — adotadas as 4 fechadas (vedação mista, permeável)."); }
    var facesGlobais = ent.faces;
    if (rot) { var fr = {}; Object.keys(FACES_B).forEach(function (k) { fr[k] = facesGlobais[FACES_B[k]]; }); ent = ext({}, ent, { faces: fr }); }
    var r = Dm.VE.calcular(ent, { todasDirecoes: true, obliquos: true });
    if (!r.ok) throw new Error("vento: " + JSON.stringify(r.erros));
    if (rot) {
      var remapCaso = function (c) {
        c.direcao = MAPA_B[c.direcao]; if (c.barlavento) c.barlavento = c.barlavento.map(function (d) { return MAPA_B[d]; });
        if (c.pressao && c.pressao.paredes) { var np = {}; Object.keys(c.pressao.paredes).forEach(function (k) { np[FACES_B[k] || k] = c.pressao.paredes[k]; }); c.pressao.paredes = np; }
        if (c.id) c.id = c.id.replace(/^V(-?\d+)/, function (m0, d0) { return "V" + MAPA_B[Number(d0)]; }); return c;
      };
      r.casos = r.casos.map(remapCaso); if (r.cpi) r.cpi.forEach(function (c) { c.direcao = MAPA_B[c.direcao]; });
      avisos.push("T3L: a < c — vento do retângulo circunscrito calculado no quadro transposto (c × a) e devolvido ao quadro global.");
    }
    function asa(a, b, hCum, faces) {
      var g = ext({ nervuras: "retangulares" }, (q.vento && q.vento.geometria) || {}, { a: a, b: b, h: h0, hCumeeira: hCum - p.baseZ, inclinacaoGraus: th, cobertura: "duas-aguas" }), e = ext({}, ent, { geometria: g, faces: faces });
      var ra = Dm.VE.calcular(e, { todasDirecoes: true, obliquos: false, aberturaDominantePropria: true /* AUDITORIA A1: idem o caminho com oblíquos (DCPI) */ }); if (!ra.ok) throw new Error("vento (asa " + br(a) + " × " + br(b) + "): " + JSON.stringify(ra.erros)); return ra;
    }
    var fB = {}; Object.keys(FACES_B).forEach(function (k) { fB[k] = facesGlobais[FACES_B[k]]; });
    r.alas = { A: asa(p.a, p.b, I.hA, facesGlobais) }; p.legs.forEach(function (L, j) { r.alas[L.asa] = asa(L.c, L.w, I.pernas[j].hB, fB); });
    /* PÁTIO: a barra SUL (asa D) é a barra N girada 180° em planta (X' = a − X, Z' = c − Z): vento e faces giram junto (frente ↔ fundo, esquerda ↔ direita) */
    if (p.anel) r.alas.D = asa(p.a, p.b, I.hA, { frente: facesGlobais.fundo, fundo: facesGlobais.frente, esquerda: facesGlobais.direita, direita: facesGlobais.esquerda });
    var txtAsas = "asa A " + br(p.a) + " × " + br(p.b) + " m" + p.legs.map(function (L) { return "; asa " + L.asa + " " + br(L.c) + " × " + br(L.w) + " m"; }).join("") + (p.anel ? "; asa D (barra sul) " + br(p.a) + " × " + br(p.b) + " m, a barra norte girada 180°" : ""), pend = I.reflexos.map(function (rf) { return "canto côncavo (" + br(rf[0]) + "; " + br(rf[1]) + ")"; }).join(", ");
    avisos.push("T3L: PREMISSA DE VENTO — a NBR 6123:2023 NÃO traz coeficientes para telhado de 4 águas nem em " + p.planta + " (só uma e duas águas, Tabelas 5 e 6). Adotado o campo de pressões da Tabela 5 (duas águas) POR ASA, com a cumeeira e o h/b de cada uma (" + txtAsas + "), aplicado normal a cada água; na água comum a duas asas vale a envoltória (maior |p|); os beirais internos são beirais reais, com +0,8·q por baixo a barlavento. " + r.casos.length + " casos (4 direções × cpi); vento OBLÍQUO não montado; sombreamento entre as asas e a reentrância do rincão não considerados — PENDÊNCIA AO RT em cada " + pend + ": sobrepressão local na reentrância (acúmulo) fora da Tabela 5. A confirmar pelo RT (ou por ensaio em túnel de vento) antes de emitir para execução.");
    r.pendenciasRT = I.reflexos.map(function (rf) { return { canto: rf.slice(), texto: (p.anel ? "Canto do pátio (" : "Canto côncavo (") + br(rf[0]) + "; " + br(rf[1]) + "): sobrepressão local na reentrância do rincão e sombreamento entre as asas não cobertos pela Tabela 5 — confirmar pelo RT (ou túnel de vento)." }; });
    if (p.anel) { r.pendenciasRT.push({ canto: null, texto: "Pátio: anel/pátio NÃO verificado pelo RT — vento no pátio (as paredes voltadas ao pátio recebem a pressão das faces externas de mesma orientação; recirculação e sucção do pátio fora da Tabela 5) a confirmar pelo RT ou túnel de vento." }); r.pendenciasRT.push({ canto: null, texto: "Pátio: drenagem da calha do pátio a dimensionar (vazão, declividade, condutores e extravasor) — a calha do pátio recebe a água das águas internas do anel e dos 4 rincões." }); }
    q._vento = r; q._ventoKey = key; return r;
  }
  /** água (registro de G.info.aguas) de uma face de membro: terças/frechais levam o aguaId; as faces da cumeeira também (aguaId da face) */
  function aguaDeFace(m, F, I) { var id = F.aguaId || m.aguaId; if (!id) return null; var r = null; I.aguas.forEach(function (w) { if (w.id === id) r = w; }); return r; }
  /** pressão líquida (kN/m², negativa = sucção) no ponto (X, Z) de uma água, para o caso global `cv`: Tabela 5 da(s) asa(s) da água; água COMUM a duas asas: envoltória (a barra só vale onde Z ≤ b) */
  function pressaoCobertura(VT, G, cv, agua, X, Z) {
    var D2 = D().D2, alas = VT.alas, p = G.p; if (!alas) throw new Error("madt3tucalc: vento sem as asas (rodar lVento)");
    function achar(R, dir) { var best = null; R.casos.forEach(function (k) { if (k.obliquo || k.direcao !== dir) return; if ((cv.cpi == null) !== (k.cpi == null)) return; var dd = cv.cpi == null ? 0 : Math.abs(k.cpi - cv.cpi); if (!best || dd < best.dd) best = { dd: dd, c: k }; }); return best && best.c; }
    var asas = agua ? agua.asas : ["A"].concat(p.legs.map(function (L) { return L.asa; })), compart = !agua || agua.compartilhada, vals = [];
    asas.forEach(function (as) {
      if (as === "D") { if (compart && Z < p.c - p.b - 1e-9) return; var cD = achar(alas.D, (cv.direcao + 180) % 360); if (cD) vals.push(D2._pressaoTeto({ x0: 0, x1: p.a, y0: 0, y1: p.b }, cD, p.a - X, p.c - Z)); return; }
      if (as === "A") { if (compart && Z > p.b + 1e-9) return; var cA = achar(alas.A, cv.direcao); if (cA) vals.push(D2._pressaoTeto({ x0: 0, x1: p.a, y0: 0, y1: p.b }, cA, X, Z)); }
      else { var L = pernaDe(p, as); /* perna SOLTA (T): fora da projeção dela (L.xl <= X <= L.xr) o ponto só recebe o vento da barra; perna encostada (L/U) segue a envoltória do L */ if (asas.indexOf("A") >= 0 && !L.flushL && !L.flushR && (X < L.xl - 1e-9 || X > L.xr + 1e-9)) return; var cB = achar(alas[as], MAPA_B[cv.direcao]); if (cB) vals.push(D2._pressaoTeto({ x0: 0, x1: L.c, y0: 0, y1: L.w }, cB, Z, X - L.xl)); }
    });
    if (!vals.length) return 0;
    return vals.reduce(function (u, v) { return Math.abs(u) >= Math.abs(v) ? u : v; });
  }
  /* ---------- CASOS DE CARGA ---------- */
  function lCasos(q, M, VT, QCOB, g2s) {
    var Dm = D(), VE = Dm.VE, D2 = Dm.D2, G = M.G, p = G.p, I = G.info, a = p.a, b = I.cmax, PAREDE = { x0: 0, x1: a, y0: 0, y1: b }, cs = M.cs, sn = M.sn, C = [], DG = q.diagnostico || {};
    var rb = M.barras.filter(function (x) { return x.mem.faces; }), pil = M.barras.filter(function (x) { return x.grupo === "P" || x.grupo === "PO"; }), g2 = [], qq = [];
    rb.forEach(function (x) { var ws = 0; x.mem.faces.forEach(function (f) { ws += f.ws; }); g2.push({ tipo: "barra", barra: x.id, q: [0, -g2s * ws, 0] }); qq.push({ tipo: "barra", barra: x.id, q: [0, -QCOB.q * ws / I.sc, 0] }); });
    C.push({ id: "G1", tipo: "G", categoria: "G-insitu", nome: "peso próprio MLC", cargas: [{ tipo: "pesoProprio" }] });
    M.barras.forEach(function (x) { if (x.grupo === "RC") g2.push({ tipo: "barra", barra: x.id, q: [0, -CALHA_KNM, 0] }); });      /* peso da calha do rincão (chapa 0,65 mm × desenvolvimento 0,70 m; adoção declarada) */
    C.push({ id: "G2", tipo: "G", categoria: "G-insitu", nome: "telha + ripas + calha", cargas: g2 });
    M.barras.forEach(function (x) { if (x.grupo === "RC") qq.push({ tipo: "barra", barra: x.id, q: [0, -AGUA_CALHA_KNM, 0] }); });      /* água na calha do rincão (variável, γw·A) */
    C.push({ id: "Q", tipo: "Q", categoria: "Q-cobertura", nome: "sobrecarga de cobertura + água na calha do rincão", cargas: qq });
    var nodo = {}; M.nos.forEach(function (n) { nodo[n.id] = n; });
    function teto(cv, ov) {        /* ov = { sl, cpe }: água cujo cpe é SUBSTITUÍDO dentro da planta (caso extra da cabeceira a barlavento, T3-REFERENCIA §3) */
      var cg = [];
      rb.forEach(function (x) {
        var A = nodo[x.i], B = nodo[x.j], m = x.mem, s, NS = 3;
        for (s = 0; s < NS; s++) {
          var t0 = s / NS, t1 = (s + 1) / NS, tm = (t0 + t1) / 2, X = A.x + (B.x - A.x) * tm + p.origem.x, Y = A.z + (B.z - A.z) * tm + p.origem.y, fx = [0, 0, 0];
          m.faces.forEach(function (F) {
            var wp = F.ws / I.sc, pp = 0, sh = (m.g === "CM" && (F.sl === "F" || F.sl === "B")) ? (F.sl === "F" ? -0.01 : 0.01) : 0, shx = (m.g === "CM" && (F.sl === "E" || F.sl === "W")) ? (F.sl === "W" ? -0.01 : 0.01) : 0, ofs = (F.sl === "F" || F.sl === "B") ? [[0, -wp / 2 + 0.01], [0, 0], [0, wp / 2 - 0.01]] : [[-wp / 2 + 0.01, 0], [0, 0], [wp / 2 - 0.01, 0]];
            ofs.forEach(function (o) { var Xo = X + o[0] + shx, Yo = Y + o[1] + sh; pp += (ov && F.sl === ov.sl && (function (w0) { return w0 ? !!w0.cabeceira : (ov.sl === "W" && m.g === "FR" && Math.abs(m.p0[0]) < 1e-6 && Math.abs(m.p1[0]) < 1e-6); })(aguaDeFace(m, F, I)) && Xo >= 0 && Xo <= a && Yo >= 0 && Yo <= b) ? (ov.cpe - cv.cpi) * cv.q : pressaoCobertura(VT, G, cv, aguaDeFace(m, F, I), Xo, Yo); }); pp /= 3;
            var nrm = DIR_NORMAL(F.sl, sn, cs); fx[0] += -pp * nrm[0] * F.ws; fx[1] += -pp * nrm[1] * F.ws; fx[2] += -pp * nrm[2] * F.ws;
          });
          cg.push({ tipo: "barra", barra: x.id, q: fx, a: t0, b: t1 });
        }
      });
      return cg;
    }
    function paredes(cv) {
      var cg = [];
      pil.forEach(function (x) { x.mem.partes.forEach(function (pt) { var pr = pressaoParede(cv, pt[0], pt[1]) * pt[2], v = pt[0] === "esquerda" ? [0, 0, pr] : pt[0] === "direita" ? [0, 0, -pr] : pt[0] === "frente" ? [pr, 0, 0] : [-pr, 0, 0]; cg.push({ tipo: "barra", barra: x.id, q: v }); }); });
      return cg;
    }
    VT.casos.forEach(function (cv, n) {
      var eh0 = (/cpi0/.test(cv.id) || (!!cv.obliquo && !DG.semObliquoExc));
      C.push({ id: "W" + n, tipo: "W", direcao: cv.direcao, nome: cv.nome || cv.id, cargas: teto(cv).concat(paredes(cv)), q: cv.q, cpi0: eh0 });
    });
    /* ADICIONADO à envolvente (não substitui): vento paralelo à cumeeira (0° e 180°) com cpe = +0,2 na água de cabeceira a barlavento (a 4 águas a cabeceira barlavento pode ficar sob PRESSÃO; a Tabela 5 de 2 águas só dá sucção ali). Só com cpi < 0 (cpi = −0,3: pressão líquida (0,2 + 0,3)·q, o mais adverso para a gravidade). PREMISSA DECLARADA, a confirmar pelo RT. */
    VT.casos.forEach(function (cv, n) { if ((cv.direcao === 0 || cv.direcao === 180) && cv.cpi < 0) C.push({ id: "W" + n + "g", tipo: "W", direcao: cv.direcao, nome: (cv.nome || cv.id) + " + cpe +0,2 na água de cabeceira a barlavento", cargas: teto(cv, { sl: cv.direcao === 0 ? "W" : "E", cpe: 0.2 }).concat(paredes(cv)), q: cv.q, cpi0: false, extra: true }); });
    var dominante = function (dcp, sg) {
      var qd = sg * dcp.p, cd = [];
      rb.forEach(function (x) {
        var m = x.mem, A = nodo[x.i], B = nodo[x.j]; if (m.d != null && m.d < -1e-6) return;            /* linha do beiral (fora da planta): sem pressão interna */
        var xm = (A.x + B.x) / 2 + p.origem.x, zm = (A.z + B.z) / 2 + p.origem.y; if (xm < -0.01 || xm > a + 0.01 || zm < -0.01 || zm > b + 0.01) return;
        m.faces.forEach(function (F) { var nrm = DIR_NORMAL(F.sl, sn, cs); cd.push({ tipo: "barra", barra: x.id, q: [qd * nrm[0] * F.wsIn, qd * nrm[1] * F.wsIn, qd * nrm[2] * F.wsIn] }); });
      });
      pil.forEach(function (x) { x.mem.partes.forEach(function (pt) { var v = pt[0] === "esquerda" ? [0, 0, -qd * pt[2]] : pt[0] === "direita" ? [0, 0, qd * pt[2]] : pt[0] === "frente" ? [-qd * pt[2], 0, 0] : [qd * pt[2], 0, 0]; cd.push({ tipo: "barra", barra: x.id, q: v }); }); });
      return cd;
    };
    var dcp = VE.casoAberturaDominante(VT.q); C.push({ id: "DCPI", tipo: "E", nome: dcp.nome, cargas: dominante(dcp, 1) });
    var dcs = DG.semDominanteSuccao ? null : VE.casoAberturaDominanteSuccao(VT, VT.q); if (dcs) C.push({ id: "DCPIS", tipo: "E", nome: dcs.nome, cargas: dominante(dcs, -1), dcpi: dcs.cpi });
    return C;
  }

  /* ---------- RODAR ---------- */
  function lRodar(proj, sec) {
    var Dm = D(), AN = Dm.AN, CA = Dm.CA, MM = Dm.MM, MD = Dm.MD, ML = Dm.ML, VE = Dm.VE, key = keyDe(proj), q = proj._pad3;
    if (!q || proj._pad3Key !== key) { q = proj._pad3 = lPadrao(proj); proj._pad3Key = key; }
    q._krEf = proj._krBase != null ? proj._krBase : q.krBase;
    sec = copia(sec); if (!sec.RC) sec.RC = { b: 0.12, h: 0.30 }; if (!sec.CB) sec.CB = { b: 0.10, h: 0.24 }; if (!sec.LB) sec.LB = { b: 0.10, h: 0.10 }; if (!sec.DX) sec.DX = { b: 0.08, h: 0.12 }; if (!q.params.vedacaoRigida && !sec.DP) sec.DP = { b: 0.12, h: 0.12 };
    var G = TM.geometriaMembros(q.params), p = G.p, I = G.info, M = C3.montar(q, G, sec), perfil = perfilFn(q), CL = q.classe, mod0 = modulos(MM.classe2022(q.classe)), avisos = [];
    var QCOB = CA.sobrecargaCobertura(p.incl * 100, { empocamentoVerificado: !!q.empocamentoVerificado }), g2s = p.telha.peso + q.cargas.outros;
    if (!QCOB.ok) throw new Error("sobrecarga de cobertura: " + QCOB.motivo); (QCOB.avisos || []).forEach(function (t) { avisos.push(t); });
    var VT = lVento(q, G, avisos), CS = lCasos(q, M, VT, QCOB, g2s), porB = {}; M.barras.forEach(function (b) { porB[b.id] = b; });
    var cargasTot = {}; CS.forEach(function (c) { var t = [0, 0, 0]; c.cargas.forEach(function (k) { var b = k.tipo === "barra" ? porB[k.barra] : null; if (!b || !k.q) return; var fr = (k.b == null ? 1 : k.b) - (k.a == null ? 0 : k.a); for (var z = 0; z < 3; z++) t[z] += k.q[z] * b.L * fr; }); cargasTot[c.id] = t; });
    var normais = CS.filter(function (c) { return c.tipo !== "E"; });
    var combs = CA.combinacoes(normais.map(function (c) { return { id: c.id, tipo: c.tipo, categoria: c.categoria, direcao: c.direcao, nome: c.nome }; }), { nocional: true, segundaOrdem: true, nocionalDirecoes: [[1, 0, 0], [0, 0, 1]] });
    var elu = combs.filter(function (c) { return c.tipo === "ELU"; });
    CS.filter(function (c) { return c.tipo === "W" && c.cpi0; }).forEach(function (c) { CS.filter(function (d) { return d.tipo === "E"; }).forEach(function (dc) { var f = { G1: 1, G2: 1 }; f[c.id] = 1; f[dc.id] = 1; elu.push({ id: "EXC_" + c.id + "_" + dc.id, nome: "excepcional: " + c.nome + " + " + dc.nome, tipo: "ELU", fatores: f, segundaOrdem: true }); }); });
    var modelo = { nos: M.nos, barras: M.barras, apoios: M.apoios, casos: CS.map(function (c) { return { id: c.id, cargas: c.cargas }; }) };
    var r = AN.analisar(modelo, { combinacoes: elu, estacoes: 3, comPCG: true });
    if (!r.ok) throw new Error("análise: " + (r.motivo || JSON.stringify(r.avisos)) + diagNo(M, r.motivo));
    q._slip = null; q._slipT = null; var slipInfo = null;
    if (!q._semSlip && (sec.DX || sec.DP)) {
      var fRig = { DX: 0, DP: 0 }, KREF0 = perfil("curta").kmod;
      elu.forEach(function (cb0) { var rc0 = r.combinacoes[cb0.id]; if (!rc0) return; var FK0 = KREF0 / perfil(durClasse(cb0)).kmod; M.barras.forEach(function (b0) { if (b0.grupo !== "DX" && b0.grupo !== "DP") return; var es0 = rc0.barras[b0.id] && rc0.barras[b0.id].estacoes; if (es0) es0.forEach(function (e0) { fRig[b0.grupo] = Math.max(fRig[b0.grupo], Math.max(0, e0.N) * FK0); }); }); });
      slipInfo = slipDiag(q, sec, fRig, perfil, M.barras); q._slip = slipInfo;
      M = C3.montar(q, G, sec); modelo = { nos: M.nos, barras: M.barras, apoios: M.apoios, casos: modelo.casos };
      r = AN.analisar(modelo, { combinacoes: elu, estacoes: 3, comPCG: true });
    }
    if (!r.ok) throw new Error("análise: " + (r.motivo || JSON.stringify(r.avisos)) + diagNo(M, r.motivo));
    /* MODELO (b) (revisão do espigão como arco com tirante): estribo da terça no espigão com deslizamento (slipTerca). Dimensiona-se pela ENVOLVENTE dos dois modelos: (a) terça com rigidez axial cheia e (b) estribo deslizante. O (b) dá MENOS momento no espigão que o (a) (a terça com estribo frouxo puxa menos o espigão; pirâmide, G2: (a) 1,47 e (b) 1,39 kN·m — T3-REFERENCIA §4c); a envolvente fica com o (a) no momento e protege as ligações. Além disso, o momento de projeto do espigão não é menor que o da viga bi-apoiada canto–ápice com as forças VERTICAIS reais das terças (vigaEspigao). */
    var slipTinfo = null, Mb = null, rb = null, modeloB = null;
    (function () {
      var fT = 0, vT = 0, KREFT = perfil("curta").kmod;
      elu.forEach(function (cb0) { var rc0 = r.combinacoes[cb0.id]; if (!rc0) return; var FK0 = KREFT / perfil(durClasse(cb0)).kmod; M.barras.forEach(function (b0) { if (b0.grupo !== "T") return; var es0 = rc0.barras[b0.id] && rc0.barras[b0.id].estacoes; if (es0) es0.forEach(function (e0) { fT = Math.max(fT, Math.abs(e0.N) * FK0); vT = Math.max(vT, hyp(e0.Vy, e0.Vz) * FK0); }); }); });
      slipTinfo = slipTerca(q, sec, fT, vT, perfil); q._slipT = slipTinfo;
      Mb = C3.montar(q, G, sec, false, "b"); modeloB = { nos: Mb.nos, barras: Mb.barras, apoios: Mb.apoios, casos: modelo.casos };
      rb = AN.analisar(modeloB, { combinacoes: elu, estacoes: 3, comPCG: true });
      if (!rb.ok) throw new Error("análise (modelo b, estribo da terça com deslizamento): " + (rb.motivo || JSON.stringify(rb.avisos)) + diagNo(Mb, rb.motivo));
    })();
    /* K_br,1 (6.6.2): medido × exigido */
    var Mf = C3.montar(q, G, sec, true), fam = lFamilias(Mf, G), Kb = lKMedido(Mf, fam), EefRef = MD.perfilEResist(CL, perfil("curta")).f.Eef;
    var CTV = { E0ef: EefRef, nos: { BS: fam.BS.length, BI: fam.BI.length }, asa: {} }, gapB = function (dl) { var g = 0, q2; for (q2 = 1; q2 < dl.length; q2++) g = Math.max(g, dl[q2] - dl[q2 - 1]); return g; }, ASAS = ["A"].concat(p.legs.map(function (L) { return L.asa; }));
    ASAS.forEach(function (asa) {
      var lg = pernaDe(p, asa), nHa = asa === "A" ? I.nH : lg.nHB, gz = gapB(asa === "A" ? I.dlA : lg.dl), o = CTV.asa[asa] = { BS: { m: nHa, L1: gz * I.sc, Kbr: Kb[asa].BS }, BI: { m: 2 * nHa, L1: gz, Kbr: Kb[asa].BI } };
      ["BS", "BI"].forEach(function (g) { var c = o[g], sg = sec[g]; c.I2 = sg.h * Math.pow(sg.b, 3) / 12; c.Kmin = kbrMinF(EefRef, c.I2, c.L1, c.m); c.ok = c.Kbr >= c.Kmin; c.L0z = c.L1; c.razao = c.Kmin / c.Kbr; });
    });
    ["BS", "BI"].forEach(function (g) { var pior = null; ASAS.forEach(function (asa) { var c = CTV.asa[asa][g]; if (!pior || c.razao > pior.razao) pior = c; }); CTV[g] = pior; });
    CTV.razao = Math.max(CTV.BS.razao, CTV.BI.razao); CTV.ok = ASAS.every(function (asa) { return CTV.asa[asa].BS.ok && CTV.asa[asa].BI.ok; }); CTV.slip = slipInfo; CTV.semSlip = !slipInfo;
    if (!CTV.ok) avisos.push("C3: a rigidez K_br,1 do contraventamento (NBR 7190-1:2022, 6.6.2) NÃO atende (" + ASAS.map(function (asa) { var c = CTV.asa[asa]; return "asa " + asa + ": BS " + Math.round(c.BS.Kbr) + " × " + Math.round(c.BS.Kmin) + ", BI " + Math.round(c.BI.Kbr) + " × " + Math.round(c.BI.Kmin); }).join("; ") + " kN/m) — o comprimento de flambagem fora do plano NÃO está provado; aumentar as diagonais/pinos.");
    modeloSemFalha(r.avisos);
    var KREF = perfil("curta").kmod, FK = 1, res = { grupos: {}, esbeltez: {}, reacoes: {}, esf: {}, combinacoes: elu.length, kmodRef: KREF, kmod1Ref: perfil("curta").kmod1, kmod2Ref: perfil("curta").kmod2, avisos: avisos, tracoes: { parede: 0, vert: 0, fita: 0 }, cinta: { N: 0, NEq: 0, fim: { N: 0, NEq: 0, S: 0, SEq: 0 } }, porModelo: { a: {}, b: {} }, pontaMI: { N: 0, NEq: 0, S: 0, SEq: 0, PD: 0, PDEq: 0, R: 0, REq: 0 }, espigao: { heel: { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 }, apice: { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 } }, meia: { N: 0, V: 0, NEq: 0, VEq: 0 }, rincao: { cintaC: { N: 0, NEq: 0, S: 0, SEq: 0 }, heel: { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 }, apice: { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 } }, espigao6: { heel: { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 }, apice: { N: 0, S: 0, H: 0, V: 0, NEq: 0, SEq: 0, HEq: 0, VEq: 0 } } };
    var tag = "a";
    function regEsb(gp, v) { if (!v || !v.esbelto) return; var lam = v.lambda, lx = Array.isArray(lam) ? lam[0] : lam, ly = Array.isArray(lam) ? lam[1] : lam, mx = Math.max(lx || 0, ly || 0), a1 = res.esbeltez[gp]; if (!a1 || mx > a1.lambdaMax) res.esbeltez[gp] = { esbelto: true, eixo: (ly || 0) >= (lx || 0) ? "b" : "h", lambdaMax: mx }; }
    function regG(gp, eta, onde, comb, gov) { if (!res.grupos[gp] || eta > res.grupos[gp].eta) res.grupos[gp] = { eta: eta, onde: onde, comb: comb, governa: gov }; var pm = res.porModelo[tag]; if (pm && (!pm[gp] || eta > pm[gp].eta)) pm[gp] = { eta: eta, onde: onde, comb: comb, governa: gov }; }
    var Lcol = {}, topoTravado = !!(CTV.ok && sec.DP);
    res.creditoTopo = { aplicado: topoTravado, motivo: topoTravado ? "K_br,1 do contraventamento da cobertura e das paredes VERIFICADO em todas as asas (pior caso: banzo superior " + Math.round(CTV.BS.Kbr) + " × " + Math.round(CTV.BS.Kmin) + " kN/m; banzo inferior " + Math.round(CTV.BI.Kbr) + " × " + Math.round(CTV.BI.Kmin) + " kN/m): topo do pilar travado lateralmente, L0 pelo modelo engastado-apoiado" : "K_br,1 NÃO atende ou paredes sem diagonais (vedação rígida informada): SEM crédito de topo travado — pilar em balanço com mola de base" };
    avisos.push("T3L: " + res.creditoTopo.motivo + ".");
    function betas(b) {
      var P = sec[b.grupo], Cb = (q._krEf !== null && typeof q._krEf === "object") ? (q._krEf[b.grupo] != null ? q._krEf[b.grupo] : 1e9) : (q._krEf != null ? q._krEf : 1e9), EIh = mod0.E * P.b * Math.pow(P.h, 3) / 12, EIb = mod0.E * P.h * Math.pow(P.b, 3) / 12, kk = b.grupo + "|" + b.mem.id;
      if (!Lcol[kk]) { var Lb = Math.abs(b.mem.p1[2] - b.mem.p0[2]), KtMin = (Math.PI / 3) * Math.tan(Math.PI / 3) / Lb, fb = topoTravado ? function (C, EI) { return MD.betaEngastadoApoiado({ C: C, EI: EI, L: Lb }).beta; } : function (C, EI) { return MD.betaFlambagemMola({ C: C, EI: EI, L: Lb }).beta; };
        Lcol[kk] = [fb(Math.max(Cb, KtMin * EIh), EIh), fb(Math.max(Cb, KtMin * EIb), EIb), Lb]; }
      return Lcol[kk];
    }
    var nd0 = {}, nBanzo = {}, f90Perp = { BS: 0, BI: 0 }; M.nos.forEach(function (n) { nd0[n.id] = n; });
    var gb = { BS: "BS", MS: "BS", BI: "BI", MI: "BI" };
    M.barras.forEach(function (b) { if (!gb[b.grupo]) return; var A = nd0[b.i], B = nd0[b.j], Lx = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2) + Math.pow(B.z - A.z, 2)) || 1; [b.i, b.j].forEach(function (n) { if (!nBanzo[n]) nBanzo[n] = { g: gb[b.grupo], t: [(B.x - A.x) / Lx, (B.y - A.y) / Lx, (B.z - A.z) / Lx] }; }); });
    var nEluDiag = {}, ESF_G = { BS: 1, BI: 1, PD: 1, DG: 1, MS: 1, MI: 1, MP: 1, MG: 1, T: 1, CM: 1, E: 1, RC: 1, CB: 1, DX: 1, DP: 1, LB: 1, FR: 1 }, travB = p.cobertura.travBaixo, mgap = {};
    G.membros.forEach(function (m) { mgap[m.id] = maxGap(m); });
    var Lhip = {}; G.membros.forEach(function (m) { if (m.g === "E" || m.g === "RC") { var c = m.canto, ap = m.p1; Lhip[m.id] = c ? Math.sqrt(Math.pow(ap[0] - c[0], 2) + Math.pow(ap[1] - c[1], 2) + Math.pow(ap[2] - I.Hp, 2)) : norm(m.p0, m.p1); } });
    function vetorExtremo(b, e, rc) { var ex = b.ax, ey = b.vy, ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]], F = [0, 1, 2].map(function (k) { return e.N * ex[k] + e.Vy * ey[k] + e.Vz * ez[k]; }); return { N: Math.abs(e.N), S: hyp(e.Vy, e.Vz), H: hyp(F[0], F[2]), V: Math.abs(F[1]) }; }
    [{ M: M, r: r, tag: "a" }, { M: Mb, r: rb, tag: "b" }].forEach(function (pass) {      /* ENVOLVENTE dos dois modelos: os acumuladores abaixo guardam sempre o máximo */
    var Mx = pass.M, rx = pass.r; tag = pass.tag;
    elu.forEach(function (cb) {
      var rc = rx.combinacoes[cb.id]; if (!rc) return; var car = durClasse(cb), pf = perfil(car), fnd = {}, cmb = { mi: 0, miS: 0, pd: 0 }; FK = KREF / pf.kmod;
      var kEsp = {};      /* viga bi-apoiada canto–ápice com as verticais reais das terças: o Mz de projeto do espigão é o MAIOR entre o do modelo (a ou b) e o da viga */
      G.membros.forEach(function (m) { if (m.g !== "E" && m.g !== "RC") return; var vg = vigaEspigao(Mx, rc, m.canto ? m : ext({}, m, { canto: [m.p0[0], m.p0[1]] }), p), mz = 0; Mx.barras.forEach(function (bb) { if (bb.m === m.id && rc.barras[bb.id]) rc.barras[bb.id].estacoes.forEach(function (e) { mz = Math.max(mz, Math.abs(e.Mz)); }); });
        kEsp[m.id] = { k: mz > 1e-9 && vg.M > mz ? vg.M / mz : 1, M: vg.M, Mmod: mz, Ra: vg.Ra, Rc: vg.Rc }; var ev = res.espigaoViga || (res.espigaoViga = { M: 0, Mmodelo: 0, k: 1, Ra: 0, Rc: 0, comb: null }); if (vg.M > ev.M) { ev.M = vg.M; ev.Mmodelo = mz; ev.comb = cb.id; } ev.k = Math.max(ev.k, kEsp[m.id].k); ev.Ra = Math.max(ev.Ra, vg.Ra); ev.Rc = Math.max(ev.Rc, vg.Rc); });
      Mx.barras.forEach(function (b) {
        var es = rc.barras[b.id] && rc.barras[b.id].estacoes; if (!es) return; var g = b.grupo;
        if (ESF_G[g]) { var ac = res.esf[g] || (res.esf[g] = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }); es.forEach(function (e) { var nt = Math.max(0, e.N), nc = Math.max(0, -e.N), vv = hyp(e.Vy, e.Vz); ac.Nt = Math.max(ac.Nt, nt); ac.Nc = Math.max(ac.Nc, nc); ac.V = Math.max(ac.V, vv); ac.NtEq = Math.max(ac.NtEq, nt * FK); ac.NcEq = Math.max(ac.NcEq, nc * FK); ac.VEq = Math.max(ac.VEq, vv * FK); }); }
        if (g === "PD" || g === "DG" || g === "MP" || g === "MG") [[b.i, es[0].N, b.j], [b.j, es[es.length - 1].N, b.i]].forEach(function (q9) { if (!nBanzo[q9[0]]) return; var a9 = nd0[q9[0]], o9 = nd0[q9[2]], L9 = Math.sqrt(Math.pow(o9.x - a9.x, 2) + Math.pow(o9.y - a9.y, 2) + Math.pow(o9.z - a9.z, 2)) || 1, f9 = fnd[q9[0]] || (fnd[q9[0]] = [0, 0, 0]); f9[0] += q9[1] * (o9.x - a9.x) / L9; f9[1] += q9[1] * (o9.y - a9.y) / L9; f9[2] += q9[1] * (o9.z - a9.z) / L9; });
        if (g === "DX" || g === "DP") es.forEach(function (e0) { nEluDiag[b.id] = Math.max(nEluDiag[b.id] || 0, Math.max(0, e0.N)); });
        if (g === "E" || g === "RC") { var accE = b.mem.g === "RC" ? res.rincao : (b.mem.canto ? res.espigao : res.espigao6);      /* esforços nas pontas do espigão/rincão: heel = ponta do canto (1ª estação do trecho sobre o canto), apice = última estação */
          var ultimo = /#(\d+)$/.exec(b.id), mem = b.mem; if (b.j && b.i) { /* ponta do apice: barra cujo j é o nó do apice */ }
          var apN = null; M.nos.forEach(function (n) { if (Math.abs(n.x + p.origem.x - mem.p1[0]) < 1e-3 && Math.abs(n.z + p.origem.y - mem.p1[1]) < 1e-3 && Math.abs(n.y - mem.p1[2]) < 1e-3) apN = n.id; });
          var cN = null; if (mem.tip) M.nos.forEach(function (n) { if (Math.abs(n.x + p.origem.x - mem.canto[0]) < 1e-3 && Math.abs(n.z + p.origem.y - mem.canto[1]) < 1e-3 && Math.abs(n.y - I.Hp) < 1e-3) cN = n.id; }); else if (!mem.canto) { M.nos.forEach(function (n) { if (Math.abs(n.x + p.origem.x - mem.p0[0]) < 1e-3 && Math.abs(n.z + p.origem.y - mem.p0[1]) < 1e-3 && Math.abs(n.y - mem.p0[2]) < 1e-3) cN = n.id; }); } else cN = null;
          if (b.j === apN) { var vE = vetorExtremo(b, es[es.length - 1], rc), ap = accE.apice; ap.N = Math.max(ap.N, vE.N); ap.S = Math.max(ap.S, vE.S); ap.SEq = Math.max(ap.SEq, vE.S * FK); ap.H = Math.max(ap.H, vE.H); ap.V = Math.max(ap.V, vE.V); ap.NEq = Math.max(ap.NEq, vE.N * FK); ap.HEq = Math.max(ap.HEq, vE.H * FK); ap.VEq = Math.max(ap.VEq, vE.V * FK); }
          if (cN && b.i === cN) { var vH = vetorExtremo(b, es[0], rc), hp = accE.heel; hp.N = Math.max(hp.N, vH.N); hp.S = Math.max(hp.S, vH.S); hp.SEq = Math.max(hp.SEq, vH.S * FK); hp.H = Math.max(hp.H, vH.H); hp.V = Math.max(hp.V, vH.V); hp.NEq = Math.max(hp.NEq, vH.N * FK); hp.HEq = Math.max(hp.HEq, vH.H * FK); hp.VEq = Math.max(hp.VEq, vH.V * FK); }
          var kv = kEsp[b.mem.id], cosH = 1 / Math.sqrt(1 + I.incl * I.incl / 2);      /* reações verticais da viga canto–ápice também valem para as ligações (cortante ⊥ ao eixo = R·cos α) */
          if (kv && b.j === apN) { var apv = accE.apice; apv.S = Math.max(apv.S, kv.Ra * cosH); apv.SEq = Math.max(apv.SEq, kv.Ra * cosH * FK); apv.V = Math.max(apv.V, kv.Ra); apv.VEq = Math.max(apv.VEq, kv.Ra * FK); }
          if (kv && cN && b.i === cN) { var hpv = accE.heel; hpv.S = Math.max(hpv.S, kv.Rc * cosH); hpv.SEq = Math.max(hpv.SEq, kv.Rc * cosH * FK); hpv.V = Math.max(hpv.V, kv.Rc); hpv.VEq = Math.max(hpv.VEq, kv.Rc * FK); }
        }
        if (g === "MS") { var vM = vetorExtremo(b, es[es.length - 1], rc); if (/#\d+$/.test(b.id) && b.mem.p1 && nd0[b.j] && Math.abs(nd0[b.j].y - b.mem.p1[2]) < 1e-3 && Math.abs(nd0[b.j].x + p.origem.x - b.mem.p1[0]) < 1e-3) { res.meia.N = Math.max(res.meia.N, vM.N); res.meia.V = Math.max(res.meia.V, hyp(vM.H, vM.V)); res.meia.NEq = Math.max(res.meia.NEq, vM.N * FK); res.meia.VEq = Math.max(res.meia.VEq, hyp(vM.H, vM.V) * FK); } }
        if (g === "FR") es.forEach(function (e) { if (e.N > res.cinta.N) { res.cinta.N = e.N; res.cinta.NEq = e.N * FK; } });
        if (g === "FR") [[b.i, es[0], b.mem.p0], [b.j, es[es.length - 1], b.mem.p1]].forEach(function (w) {      /* força de EXTREMIDADE do frechal NO CANTO (ponta do membro): é o que a cinta transmite */
          var nn = nd0[w[0]]; if (!nn || Math.abs(nn.x + p.origem.x - w[2][0]) > 1e-3 || Math.abs(nn.z + p.origem.y - w[2][1]) > 1e-3 || Math.abs(nn.y - w[2][2]) > 1e-3) return;
          var vF = vetorExtremo(b, w[1], rc), Nt = Math.max(0, w[1].N), cf = res.cinta.fim; if (I.reflexos.some(function (rf) { return Math.abs(nn.x + p.origem.x - rf[0]) < 1e-3 && Math.abs(nn.z + p.origem.y - rf[1]) < 1e-3; })) { var cC = res.rincao.cintaC, Nc2 = Math.max(0, -w[1].N); cC.N = Math.max(cC.N, Nc2); cC.NEq = Math.max(cC.NEq, Nc2 * FK); cC.S = Math.max(cC.S, vF.S); cC.SEq = Math.max(cC.SEq, vF.S * FK); return; }      /* canto CÔNCAVO: a compressão do anel passa pela sela do rincão; não entra na cinta dos cantos convexos */
          cf.N = Math.max(cf.N, Nt); cf.NEq = Math.max(cf.NEq, Nt * FK); cf.S = Math.max(cf.S, vF.S); cf.SEq = Math.max(cf.SEq, vF.S * FK); });
        if (g === "MI") { var nMI = nd0[b.j]; if (nMI && b.mem.p1 && Math.abs(nMI.x + p.origem.x - b.mem.p1[0]) < 1e-3 && Math.abs(nMI.z + p.origem.y - b.mem.p1[1]) < 1e-3 && Math.abs(nMI.y - b.mem.p1[2]) < 1e-3) { var eMI = es[es.length - 1], vMI = vetorExtremo(b, eMI, rc); cmb.mi = Math.max(cmb.mi, Math.abs(eMI.N)); cmb.miS = Math.max(cmb.miS, vMI.S); } }
        if (g === "PD" && b.mem.tes != null && ((b.mem.asa === "A" && (b.mem.tes === 0 || b.mem.tes === I.xs.length - 1) && (Math.abs(b.mem.p0[1] - p.b / 2) < 1e-3 || (p.anel && Math.abs(b.mem.p0[1] - (p.c - p.b / 2)) < 1e-3))) || (b.mem.asa !== "A" && (function (lg) { return b.mem.tes === lg.zs.length - 1 && Math.abs(b.mem.p0[0] - lg.xc) < 1e-3; })(pernaDe(p, b.mem.asa))))) cmb.pd = Math.max(cmb.pd, Math.abs(es[0].N));      /* montante central da tesoura de extremidade (mesmo nó do BI) */
        if (g === "LB") { es.forEach(function (e) { var sL = sec.LB, vL = MD.barra2022(MD.deAnalise(e, { b: sL.b, h: sL.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pf })); regG("LB", vL.eta, b.id + "@" + e.x.toFixed(2), cb.id + " " + car, vL.governa); regEsb("LB", vL); }); return; }
        if (g === "DV") return;
        es.forEach(function (e) {
          var v = null, s = sec[g];
          if (g === "P" || g === "PO") { var bt = betas(b); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: bt[0] * bt[2], L0z: bt[1] * bt[2], L1: 0.01, classe: CL, perfil: pf })); }
          else if (g === "T" || g === "CM" || g === "FR") { var vao = mgap[b.mem.id]; v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: vao, L0z: vao, L1: MD.L1PorBorda(e.Mz, { cima: 0.5, baixo: travB || Math.min(vao, 2) }), classe: CL, perfil: pf })); }
          else if (g === "CB") { var Lc = norm(b.mem.p0, b.mem.p1); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Lc, L0z: Lc, L1: MD.L1PorBorda(e.Mz, { cima: Math.max(I.lp, mgap[b.mem.id]), baixo: Lc }), classe: CL, perfil: pf })); }
          else if (g === "E" || g === "RC") { var Lh = Lhip[b.mem.id], Ln = I.dz * Math.sqrt(2) * Math.sqrt(1 + I.incl * I.incl / 2), kk = kEsp[b.mem.id] ? kEsp[b.mem.id].k : 1; if (kk > 1) e = ext({}, e, { Mz: e.Mz * kk }); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Lh, L0z: Lh, L1: MD.L1PorBorda(e.Mz, { cima: Ln, baixo: Lh }), classe: CL, perfil: pf })); }
          else if (g === "BS") { var cA = CTV.asa[b.mem.asa || "A"].BS; v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Math.max(I.lp, mgap[b.mem.id]), L0z: cA.L0z, L1: cA.L0z, classe: CL, perfil: pf })); }
          else if (g === "BI") { var cI = CTV.asa[b.mem.asa || "A"].BI; v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Math.max(I.dz, mgap[b.mem.id]), L0z: cI.L0z, L1: cI.L0z, classe: CL, perfil: pf })); }
          else if (g === "MS") { var lpM = Math.max(I.lp, mgap[b.mem.id]); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: lpM, L0z: lpM, L1: lpM, classe: CL, perfil: pf })); }
          else if (g === "MI") { var LmI = norm(b.mem.p0, b.mem.p1); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Math.max(I.dz, mgap[b.mem.id]), L0z: LmI, L1: LmI, classe: CL, perfil: pf })); }
          else if (g === "PD" || g === "DG" || g === "MP" || g === "MG" || g === "DX" || g === "DP") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pf })); }
          if (v) { regG(g, v.eta, b.id + "@" + e.x.toFixed(2), cb.id + " " + car, v.governa); regEsb(g, v);
            if (g === "E" && v.lambda) { var cE = res.compressaoE || null, lmE = Math.max(v.lambda[0] || 0, v.lambda[1] || 0); if (!cE || lmE > cE.lambdaMax) res.compressaoE = { barra: b.id, L0y: Lhip[b.mem.id], L0z: Lhip[b.mem.id], lambda: v.lambda.slice(), lambdaMax: lmE, limite: 140, eta: v.eta }; }
            if ((g === "DG" || g === "MG") && v.lambda) { var cpr = res["compressao" + g] || null, lm = Math.max(v.lambda[0] || 0, v.lambda[1] || 0); if (!cpr || lm > cpr.lambdaMax) res["compressao" + g] = { barra: b.id, L0y: b.L, L0z: b.L, lambda: v.lambda.slice(), lambdaMax: lm, limite: 40 * Math.sqrt(12), eta: v.eta }; } }
        });
      });
      Object.keys(fnd).forEach(function (n9) { var nb = nBanzo[n9], f9 = fnd[n9], d9 = f9[0] * nb.t[0] + f9[1] * nb.t[1] + f9[2] * nb.t[2], pr = Math.sqrt(Math.pow(f9[0] - d9 * nb.t[0], 2) + Math.pow(f9[1] - d9 * nb.t[1], 2) + Math.pow(f9[2] - d9 * nb.t[2], 2)) * FK; if (pr > f90Perp[nb.g]) f90Perp[nb.g] = pr; });
      if (cmb.mi > 0) { var pmi = res.pontaMI, Rr = hyp(cmb.mi, cmb.pd); pmi.N = Math.max(pmi.N, cmb.mi); pmi.NEq = Math.max(pmi.NEq, cmb.mi * FK); pmi.S = Math.max(pmi.S, cmb.miS); pmi.SEq = Math.max(pmi.SEq, cmb.miS * FK); pmi.PD = Math.max(pmi.PD, cmb.pd); pmi.PDEq = Math.max(pmi.PDEq, cmb.pd * FK); pmi.R = Math.max(pmi.R, Rr); pmi.REq = Math.max(pmi.REq, Rr * FK); }
      Mx.apoios.forEach(function (ap) {
        var R = rc.reacoes[ap.no]; if (!R) return;
        var o = res.reacoes[ap.no] || (res.reacoes[ap.no] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, Mmax: 0, NminEq: 1e9, HmaxEq: 0, grupo: ap.grupo, mem: ap.mem });
        o.Nmax = Math.max(o.Nmax, R[1]); o.Nmin = Math.min(o.Nmin, R[1]); o.Hmax = Math.max(o.Hmax, hyp(R[0], R[2])); o.Mmax = Math.max(o.Mmax, hyp(R[3], R[5])); o.NminEq = Math.min(o.NminEq, R[1] * (R[1] < 0 ? FK : 1)); o.HmaxEq = Math.max(o.HmaxEq, hyp(R[0], R[2]) * FK);
      });
    });
    });
    tag = "env";      /* o que vem depois (F1d, apoio) não é de um modelo só */
    res.excent = excent(sec);
    res.torcaoFR = torcaoFR(sec, res.espigao, res.cinta, MD.perfilEResist(CL, perfil("curta")).f.fvd, Math.PI / 4, res.excent);      /* referência do detalhe alternativo: dlt = e_v do arranjo novo (dFR + evE), β = 45° passado */ res.detalheSela = (q.params && q.params.detalheSela) === "torcao" ? "torcao" : "chapa";
    if (res.detalheSela === "torcao" && !res.torcaoFR.ok) res.esbeltez.FR = { esbelto: true, eixo: "b", lambdaMax: 0, torcao: true };      /* alternativa: a torção cresce o b primeiro (τT ∝ 1/b², o h se cancela) */
    /* compressão ⊥ às fibras no apoio do frechal sob o banzo inferior / pilar (6.3.3) */
    (function () {
      var cl = MM.classe2022(CL), kmL = perfil("longa").kmod, Rp = 0; function fc90(aCm) { var an = ML.alfaN(aCm); return Math.min(cl.fc90k * kmL / 1.4 * an, 0.25 * cl.fc0k * kmL / 1.4 * an); }
      Object.keys(res.reacoes).forEach(function (k) { Rp = Math.max(Rp, res.reacoes[k].Nmax); });
      res.apoioEta = { FR: Math.max(Rp > 0 ? 1.03 * Rp / (sec.BI.b * sec.FR.b) / 1000 / fc90(sec.BI.b * 100) : 0, Rp > 0 ? 1.03 * Rp / (sec.FR.b * sec.P.b) / 1000 / fc90(sec.P.b * 100) : 0) };
      if (res.apoioEta.FR > 1 + 1e-9) res.esbeltez.FR = { esbelto: true, eixo: "b", lambdaMax: 0, apoio: true };
    })();
    /* F1d = Nd/150 (6.6.4, Figura 6): caso próprio em todos os nós homólogos do banzo comprimido */
    (function () {
      var pfF = perfil("curta"), F1 = { BS: (res.esf.BS ? res.esf.BS.Nc : 0) / 150, BI: (res.esf.BI ? res.esf.BI.Nc : 0) / 150 }, cgF = [], nT = I.xs.length * (p.anel ? 2 : 1) + I.zsTotal;
      var FVd = function (n, f) { return fam.asaDe[n] !== "A" ? [0, 0, f, 0, 0, 0] : [f, 0, 0, 0, 0, 0]; }; fam.BS.forEach(function (n) { cgF.push({ tipo: "no", no: n, F: FVd(n, F1.BS) }); }); fam.BI.forEach(function (n) { cgF.push({ tipo: "no", no: n, F: FVd(n, F1.BI) }); });
      var rF = AN.analisar({ nos: Mf.nos, barras: Mf.barras, apoios: Mf.apoios, casos: [{ id: "F1D", cargas: cgF }] }, { combinacoes: [{ id: "F1D", fatores: { F1D: 1 } }], estacoes: 3, comPCG: false });
      if (!rF.ok) throw new Error("análise (F1d do contraventamento): " + (rF.motivo || JSON.stringify(rF.avisos))); modeloSemFalha(rF.avisos);
      var mxF = { T: 0, LBc: 0, LBt: 0 }, cF = rF.combinacoes.F1D;
      Mf.barras.forEach(function (b) {
        var es = cF.barras[b.id] && cF.barras[b.id].estacoes; if (!es) return; var g = b.grupo;
        if (g === "DX" || g === "DV" || g === "DP") es.forEach(function (e) { var kk = g === "DX" ? "DXn" : (g === "DP" ? "DPn" : "DVn"), gs = g === "DP" ? "DP" : "DX", sD = sec[gs], eT = ext({}, e, { N: Math.abs(e.N) + (nEluDiag[b.id] || 0) }); mxF[kk] = Math.max(mxF[kk] || 0, eT.N); var v = MD.barra2022(MD.deAnalise(eT, { b: sD.b, h: sD.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pfF })); regG(gs, v.eta, b.id + "@" + e.x.toFixed(2), "F1d", v.governa); regEsb(gs, v); });
        else if (g === "T" || g === "CM") es.forEach(function (e) { mxF.T = Math.max(mxF.T, Math.abs(e.N)); });
        else if (g === "LB") es.forEach(function (e) { var s = sec.LB; mxF.LBc = Math.max(mxF.LBc, Math.max(0, -e.N)); mxF.LBt = Math.max(mxF.LBt, Math.max(0, e.N)); var v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pfF })); regG("LB", v.eta, b.id + "@" + e.x.toFixed(2), "F1d", v.governa); regEsb("LB", v); });
      });
      if (sec.LB && (mxF.LBc > 0 || mxF.LBt > 0 || res.esf.LB)) { var aL = res.esf.LB || (res.esf.LB = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }); aL.Nt = Math.max(aL.Nt, mxF.LBt); aL.Nc = Math.max(aL.Nc, mxF.LBc); aL.NtEq = Math.max(aL.NtEq, mxF.LBt); aL.NcEq = Math.max(aL.NcEq, mxF.LBc); }
      if (sec.DX) { var aD = res.esf.DX || (res.esf.DX = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }), nD = Math.max(mxF.DXn || 0, mxF.DVn || 0); aD.Nt = Math.max(aD.Nt, nD); aD.Nc = Math.max(aD.Nc, nD); aD.NtEq = Math.max(aD.NtEq, nD); aD.NcEq = Math.max(aD.NcEq, nD); }
      if (sec.DP) { var aP = res.esf.DP || (res.esf.DP = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }), nP = mxF.DPn || 0; aP.Nt = Math.max(aP.Nt, nP); aP.Nc = Math.max(aP.Nc, nP); aP.NtEq = Math.max(aP.NtEq, nP); aP.NcEq = Math.max(aP.NcEq, nP); }
      if (res.esf.T) { var sT = sec.T, vT = MD.barra2022(MD.deAnalise({ N: -(res.esf.T.Nc + mxF.T), My: 0, Mz: 0, Vy: 0, Vz: 0, T: 0 }, { b: sT.b, h: sT.h, L0y: 2, L0z: 2, L1: 0.01, classe: CL, perfil: pfF })); regG("T", vT.eta, "T (axial + F1d)", "F1d", vT.governa); }
      res.f90Perp = f90Perp; CTV.F1d = F1; CTV.nTes = nT; CTV.Fd = { BS: 2 / 3 * nT * F1.BS, BI: 2 / 3 * nT * F1.BI }; CTV.maxN = mxF; CTV.sec = { BS: sec.BS, BI: sec.BI, LB: sec.LB }; res.contrav = CTV;
    })();
    /* ELS: flecha final (φ, ψ2) por vão entre apoios; balanço (ponta do espigão) com L/limBalanco */
    var PHI = perfil("permanente").phi, psi2 = CA.PSI["Q-cobertura"].psi2, psi1W = CA.PSI.W.psi1;
    var els = [{ id: "g", fatores: { G1: 1, G2: 1 } }, { id: "q", fatores: { Q: 1 } }].concat(CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { var f = {}; f[c.id] = 1; return { id: "w" + c.id, fatores: f }; }));
    var re = null, fm = {}, flech = {}, topo = 0;
    [M, Mb].forEach(function (MX) {      /* ELS pela envolvente dos dois modelos (o modelo b é mais flexível no espigão) */
    re = AN.analisar({ nos: MX.nos, barras: MX.barras, apoios: MX.apoios, casos: modelo.casos }, { combinacoes: els, estacoes: 3, comPCG: true }); modeloSemFalha(re.avisos);
    var nodo = {}; M.nos.forEach(function (n) { nodo[n.id] = n; });
    var Dd = function (cb, id) { return re.combinacoes[cb].desloc[id] || [0, 0, 0]; };
    function dfin(id) { var g = Dd("g", id), qd = Dd("q", id); return [0, 1, 2].map(function (k) { return g[k] * (1 + PHI) + qd[k] * (1 + psi2 * PHI); }); }
    function reg(chave, grp, valor, lim, extra) { var e = valor / lim; if (!fm[chave] || e > fm[chave].eta) fm[chave] = ext({ mm: Math.round(valor * 1e5) / 100, limite_mm: Math.round(lim * 1e5) / 100, eta: e, grupo: grp }, extra || {}); flech[grp] = Math.max(flech[grp] || 0, e); }
    var porMem = {}; MX.barras.forEach(function (b) { (porMem[b.m] = porMem[b.m] || []).push(b); });
    function nosDe(bs) { var ids = [], vistos = {}; bs.forEach(function (b) { [b.i, b.j].forEach(function (n) { if (!vistos[n]) { vistos[n] = 1; ids.push(n); } }); }); return ids; }
    G.membros.forEach(function (m) {
      if (m.tracao || ["P", "PO", "PD", "DG", "MP", "MG", "DX", "DV", "DP", "LB"].indexOf(m.g) >= 0) return;
      var bs = porMem[m.id] || []; if (!bs.length) return; var ids = nosDe(bs), L = norm(m.p0, m.p1), t = function (n) { var N = nodo[n], P = [N.x + p.origem.x, N.z + p.origem.y, N.y]; return ((P[0] - m.p0[0]) * (m.p1[0] - m.p0[0]) + (P[1] - m.p0[1]) * (m.p1[1] - m.p0[1]) + (P[2] - m.p0[2]) * (m.p1[2] - m.p0[2])) / (L * L); };
      var sup = (m.g === "E" || m.g === "RC") ? [m.tip ? [m.canto[0], m.canto[1], I.Hp] : m.p0, m.p1] : (m.g === "CB" ? [m.pe, m.p1] : [m.p0].concat(m.nos || []).concat([m.p1]));
      if (m.g === "BS" || m.g === "MS") sup = (m.nos || []).concat([m.p1]).filter(function (P) { return P[2] >= I.Hp - 1e-6; }); else if (m.g === "E") { /* canto → ponta */ }
      var tS = sup.map(function (P) { return ((P[0] - m.p0[0]) * (m.p1[0] - m.p0[0]) + (P[1] - m.p0[1]) * (m.p1[1] - m.p0[1]) + (P[2] - m.p0[2]) * (m.p1[2] - m.p0[2])) / (L * L); }).sort(function (u, v) { return u - v; });
      if (m.g === "T" || m.g === "CM" || m.g === "FR" || m.g === "BI" || m.g === "MI") tS = [0].concat(tS.filter(function (x) { return x > 1e-6 && x < 1 - 1e-6; })).concat([1]);
      var byT = ids.map(function (n) { return { n: n, t: t(n) }; }).sort(function (u, v) { return u.t - v.t; }), k2;
      function ach(tt) { var bst = null; byT.forEach(function (o) { if (Math.abs(o.t - tt) < 1e-4) bst = o; }); return bst; }
      for (k2 = 0; k2 + 1 < tS.length; k2++) {
        var A0 = ach(tS[k2]), B0 = ach(tS[k2 + 1]); if (!A0 || !B0) continue; var dA = dfin(A0.n), dB = dfin(B0.n), vao = (tS[k2 + 1] - tS[k2]) * L;
        byT.forEach(function (o) { if (o.t <= tS[k2] + 1e-4 || o.t >= tS[k2 + 1] - 1e-4) return; var f = (o.t - tS[k2]) / (tS[k2 + 1] - tS[k2]), dn = dfin(o.n), dd = [0, 1, 2].map(function (k3) { return dn[k3] - (dA[k3] + (dB[k3] - dA[k3]) * f); }); reg("vao" + m.g, m.g, Math.sqrt(dd[0] * dd[0] + dd[1] * dd[1] + dd[2] * dd[2]), vao / q.limVao, { onde: m.id }); });
      }
      if ((m.g === "E" || m.g === "RC") && m.tip) { var tI = tS[0], bal = ach(0), cn = ach(tI); if (bal && cn) { var d1 = dfin(bal.n), d2 = dfin(cn.n); reg("balancoE", "E", Math.sqrt(Math.pow(d1[0] - d2[0], 2) + Math.pow(d1[1] - d2[1], 2) + Math.pow(d1[2] - d2[2], 2)), tI * L / q.limBalanco); } }
    });
    MX.barras.forEach(function (b) { if (b.grupo !== "P" && b.grupo !== "PO") return; var top = b.j, H = Math.abs(b.mem.p1[2] - b.mem.p0[2]); CS.filter(function (c) { return c.tipo === "W"; }).forEach(function (c) { var d = Dd("w" + c.id, top); topo = Math.max(topo, psi1W * hyp(d[0], d[2]) / (H / 300)); }); });
    });
    flech.P = Math.max(flech.P || 0, topo); fm.topoPilarVentoFreq_H300 = { eta: topo, grupo: "P" };
    res.flechasMm = fm; res.flechas = flech; res.phi = PHI; res.QCOB = QCOB; res.G2 = g2s; res.vento = { v0: VT.v0, q: VT.q, vk: VT.vk, cpiMax: Math.max.apply(null, VT.casos.map(function (c) { return c.cpi; })) }; res.casosVento = VT.casos.map(function (c) { return c.id; });
    res.secoes = copia(sec); res.modelo = M; res.slipT = slipTinfo; Object.defineProperty(res, "modeloB", { value: Mb, enumerable: false }); res.geometria = { info: { nH: I.nH, dz: I.dz, lp: I.lp, xs: I.xs, pernas: I.pernas.map(function (L) { return { asa: L.asa, nHB: L.nHB, zs: L.zs, w: L.w, c: L.c }; }) }, tipologia: "T3TU", planta: p.planta };
    res.excepcionais = elu.filter(function (c) { return /^EXC_/.test(c.id); }).map(function (c) { return c.id; });
    Object.defineProperty(res, "_casos", { value: CS, enumerable: false }); Object.defineProperty(res, "_analise", { value: r, enumerable: false }); Object.defineProperty(res, "_elu", { value: elu, enumerable: false });
    res.cargasTotais = cargasTot; res.tipologia = "T3TU"; res.planta = p.planta; res.pendenciasRT = VT.pendenciasRT;
    /* STATUS: PRELIMINAR em tudo que o L marca (peça que reprova, K_br,1 que não atende, pino das diagonais que não cabe) e sempre que houver canto côncavo com pendência ao RT em aberto no vento (informativo: a premissa já vai no memorial). Quem emite (madengsaidas.preliminar) usa os mesmos avisos. */
    (function () {
      var mot = [], gp = Object.keys(res.grupos).filter(function (g) { return res.grupos[g].eta > 1 + 1e-9; });
      if (gp.length) mot.push("peças que reprovam: " + gp.join(", "));
      Object.keys(res.flechas || {}).forEach(function (g) { if (res.flechas[g] > 1 + 1e-9) mot.push("flecha acima do limite em " + g); });
      if (!CTV.ok) mot.push("K_br,1 do contraventamento não atende em alguma asa (razão " + CTV.razao.toFixed(2) + ")");
      if (CTV.slip) ["DX", "DP"].forEach(function (g) { if (CTV.slip[g] && CTV.slip[g].cabe === false) mot.push("pinos das diagonais " + g + " não cabem"); });
      res.preliminarTU = { preliminar: mot.length > 0, motivos: mot, pendenciasRT: VT.pendenciasRT.length };
    })(); res.rincaoCalhaKNm = CALHA_KNM; res.rincaoAguaKNm = AGUA_CALHA_KNM; res.ventoGeometria = VT.geometria; res.avisosAnalise = r.avisos;
    res.avisos.push("T3L: não modelados (declarado): torção por excentricidade do vento (6.6), vento oblíquo, sombreamento entre as asas, caibros/ripas secundários, tesoura de rincão/“falsa tesoura” (o rincão é modelado como viga inclinada apoiada no canto côncavo e no vértice V); travamento inferior das terças adotado " + (travB ? travB + " m" : "= vão (a favor)") + "; espigão com L0 fora do plano = comprimento total do canto à cumeeira (sem crédito das terças).");
    res.avisos.push("T3L: espigão, ligação espigão × cumeeira e tesoura de extremidade dimensionados pela ENVOLVENTE de 2 modelos — (a) terça com rigidez axial cheia (espigão como arco com tirante) e (b) estribo da terça no espigão com deslizamento dos pinos (" + slipTinfo.n + " pinos Ø" + Math.round(slipTinfo.d * 1000) + " por ponta, Ku = " + Math.round(slipTinfo.Ku) + " kN/m por pino, NBR 7190-1:2022, 7.1.12): η do espigão (a) " + (res.porModelo.a.E ? res.porModelo.a.E.eta.toFixed(3) : "-") + " × (b) " + (res.porModelo.b.E ? res.porModelo.b.E.eta.toFixed(3) : "-") + ".");
    res.avisos.push("T3L: momento de projeto do espigão = MAIOR entre a envolvente dos modelos (a)/(b) e a viga bi-apoiada canto–ápice com as forças VERTICAIS reais das terças (Mz da viga " + (res.espigaoViga ? res.espigaoViga.M.toFixed(2) : "-") + " kN·m na combinação " + (res.espigaoViga ? res.espigaoViga.comb : "-") + "; do modelo " + (res.espigaoViga ? res.espigaoViga.Mmodelo.toFixed(2) : "-") + " kN·m). EXIGÊNCIA DE PROJETO: terça BIAPOIADA entre as tesouras/meias-tesouras (rotação liberada em cada tesoura no modelo); a emenda passante transmite só a força AXIAL (tirante do arco do espigão); não é emenda rígida. A telha apoia nas terças; caibros sobre o espigão não estão no modelo.");
    res.avisos.push("T3L: vento — ADICIONADOS à envolvente (sem substituir) os casos de vento paralelo à cumeeira com cpe = +0,2 na água de cabeceira a barlavento (" + CS.filter(function (c) { return c.extra; }).map(function (c) { return c.id; }).join(", ") + "); premissa a confirmar pelo RT.");
    return res;
  }

  function lFamilias(M, G) {
    var p = G.p, I = G.info, X0 = p.origem.x, Y0 = p.origem.y, mapa = {}, out = { BS: [], BI: [], linhas: [], asaDe: {} };
    M.nos.forEach(function (n) { mapa[Math.round(n.x * 1e4) + "," + Math.round(n.y * 1e4) + "," + Math.round(n.z * 1e4)] = n.id; });
    function id(X, Zp, Hv) { return mapa[Math.round((X - X0) * 1e4) + "," + Math.round(Hv * 1e4) + "," + Math.round((Zp - Y0) * 1e4)]; }
    function linha(asa, k, fn) { var L1 = { g: "BS", asa: asa, k: k, nos: [] }, L2 = { g: "BI", asa: asa, k: k, nos: [] }; fn(function (a1, b1) { if (a1) { out.BS.push(a1); L1.nos.push(a1); out.asaDe[a1] = asa; } if (b1) { out.BI.push(b1); L2.nos.push(b1); out.asaDe[b1] = asa; } }); out.linhas.push(L1, L2); }
    var k;
    for (k = 1; k < 2 * I.nH; k++) (function (z) { linha("A", k, function (put) { I.xs.forEach(function (x) { put(id(x, z, I.yT(z)), id(x, z, I.Hp)); }); }); })(k * I.dz);
    if (p.anel) for (k = 1; k < 2 * I.nH; k++) (function (z) { linha("A", 100 + k, function (put) { I.xs.forEach(function (x) { put(id(x, p.c - z, I.yT(z)), id(x, p.c - z, I.Hp)); }); }); })(k * I.dz);
    I.pernas.forEach(function (L) { var nHB = L.nHB; for (k = 1; k < 2 * nHB; k++) (function (s) { linha(L.asa, k, function (put) { L.zs.forEach(function (z) { put(id(L.xl + s, z, I.yTs(s, L.w)), id(L.xl + s, z, I.Hp)); }); }); })(k <= nHB ? L.dl[k] : L.w - L.dl[2 * nHB - k]); });
    return out;
  }
  function lKMedido(M, fam) {
    var AN = D().AN, casos = [], comb = [];
    fam.linhas.forEach(function (L, k) { var Fv = L.asa !== "A" ? [0, 0, 1, 0, 0, 0] : [1, 0, 0, 0, 0, 0]; casos.push({ id: "K" + k, cargas: L.nos.map(function (n) { return { tipo: "no", no: n, F: Fv }; }) }); var f = {}; f["K" + k] = 1; comb.push({ id: "K" + k, fatores: f }); });
    var r = AN.analisar({ nos: M.nos, barras: M.barras, apoios: M.apoios, casos: casos }, { combinacoes: comb, estacoes: 3, comPCG: false });
    if (!r.ok) throw new Error("análise (rigidez do contraventamento): " + (r.motivo || JSON.stringify(r.avisos)));
    var o = { A: { BS: 1e12, BI: 1e12 }, linhas: [] };
    fam.linhas.forEach(function (L, k) { var d = r.combinacoes["K" + k].desloc, u = 0, ix = L.asa !== "A" ? 2 : 0; L.nos.forEach(function (n) { u = Math.max(u, Math.abs((d[n] || [0, 0, 0])[ix])); }); var K = u > 1e-12 ? 1 / u : 1e12; if (!o[L.asa]) o[L.asa] = { BS: 1e12, BI: 1e12 }; o[L.asa][L.g] = Math.min(o[L.asa][L.g], K); o.linhas.push({ g: L.g, asa: L.asa, k: L.k, K: K }); });
    return o;
  }


  function lDimensionar(proj, partida, opcoes) {
    opcoes = opcoes || {}; var sec = copia(partida), hist = [], it, r, pior, falha, mexeu, q;
    if (!sec.LB) sec.LB = { b: 0.10, h: 0.10 }; if (!sec.DX) sec.DX = { b: 0.08, h: 0.12 }; if (!proj.params.vedacaoRigida && !sec.DP) sec.DP = { b: 0.12, h: 0.12 };
    for (it = 0; it < (opcoes.maxIter || 30); it++) {
      try { r = lRodar(proj, sec); } catch (ex) {
        if (!/instável|mecanismo/.test(String(ex.message)) || it >= 12) throw ex;
        var gr = false; Object.keys(sec).forEach(function (k) { if (C3.crescer(proj._pad3 || lPadrao(proj), sec, k)) gr = true; }); if (!gr) throw ex; hist.push({ it: it, sec: copia(sec), instavel: String(ex.message).slice(0, 120) }); continue;
      }
      q = proj._pad3; pior = C3.pior(r, sec); hist.push({ it: it, sec: copia(sec), pior: pior }); if (opcoes.aoIterar) opcoes.aoIterar(it, sec, pior);
      falha = Object.keys(pior).filter(function (k) { return pior[k] > 1 && sec[k]; });
      if (!falha.length) return { secoes: sec, resultado: r, historico: hist, semSolucao: false, pior: pior };
      mexeu = false; falha.sort(function (u, v) { return pior[v] - pior[u]; }).forEach(function (k) { if (C3.crescer(q, sec, k, r)) mexeu = true; });
      if (!mexeu) return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior };
    }
    return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior, motivo: "limite de iterações" };
  }
  function lBase(proj, r, sec) { return C3.base(proj, r, sec); }

  var MadT3TUCalc = { AGUA_CALHA_KNM: AGUA_CALHA_KNM, CALHA_KNM: CALHA_KNM, pressaoCobertura: pressaoCobertura, aguaDeFace: aguaDeFace, padrao: lPadrao, vento: lVento, casos: lCasos, rodar: lRodar, dimensionar: lDimensionar, familias: lFamilias, kMedido: lKMedido, base: lBase, T3L_LIM: TL_LIM, CALHA_KNM: CALHA_KNM };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3TUCalc;
  else global.MadT3TUCalc = MadT3TUCalc;
})(typeof window !== "undefined" ? window : this);
