/* =====================================================================
 * hidcaderno.js — CADERNO HIDROSSANITÁRIO POR AMBIENTE + o BLOCO DE AMBIENTE das pranchas (Casa 487, R01, 29/10/2026).
 * Motor PURO, ES5, sem DOM. Usa os internos do js/hidpranchas.js (HidPranchas._int).
 *
 *   HidCaderno.gerar(resultado, modelo, opcoes) → { ok, paginas: [{ numero, titulo, svg, tipo }], ambientes, avisos, verificacao }
 *   HidCaderno.exportar(r, "pdf")                 PDF vetorial (js/svgpdf.js)
 *   HidCaderno.ambientesDoModelo(c, pv)           os ambientes (cômodos do modelo) que têm instalação hidráulica
 *   HidCaderno.blocoAmbiente(c, D, A, am, pv, o)  desenha o BLOCO de um ambiente (planta + isométrico + tabelas) no retângulo A da folha D
 *   HidCaderno.folhaAmbientes(c, def)             a folha de pranchas (A1) com 2 blocos de ambiente
 *
 * O BLOCO DE AMBIENTE é a folha da referência da Tânia (HIDRO TANIA Folha 04 — esgoto da lavanderia) refeita com os dados da Casa 487
 * (PADRAO-HIDRO.md §4): planta do ambiente à esquerda, ISOMÉTRICO 30° no centro com o BALÃO DE CÓDIGO (S-1, F-2…) em cada peça, e à direita as
 * tabelas "Tubos" e "Conexões" (quantidade · descrição · código) e as notas. Cores dos tubos = padrão RA hidráulica v1.0.
 * NADA É INVENTADO: tubo, conexão, DN, comprimento e altura vêm da rede (BimInst.rede) e do resultado do cálculo.
 * ===================================================================== */
(function (global) {
  "use strict";
  /* hid:geometria-inicio — módulo de DESENHO (mm de papel, px, proporção de vista, cores): nenhum valor de norma aqui (valor de norma vem só da biblioteca de normas, fora deste módulo) */

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function HP() { return dep("HidPranchas", "./hidpranchas.js"); }
  function I() { var h = HP(); return h && h._int ? h._int : null; }
  function PDFm() { return dep("SvgPdf", "./svgpdf.js"); }
  function BIm() { return dep("BimInst", "./biminst.js"); }
  function GEOa() { return dep("ArqGeo", "./arqgeo.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }

  /* hid:fisica-inicio — geometria de desenho do caderno (mm de papel) e a paleta da casa (08_cores\paleta_casa487_R00.html): nenhum valor de norma */
  var K = {
    cor: { tinta: "#2E4050", offwhite: "#F1EDE4", areia: "#D4C3A0", terracota: "#B5694A", terracotaEsc: "#9C4F36", grafite: "#2b2b2b", cinza: "#7a7a7a", faixa: "#E7E2D6" },
    A3: [420, 297], margem: 10, cabecalho: 15, rodape: 12,
    escalasPlanta: [20, 25, 30, 40, 50, 75, 100], colunaPlanta: 15, colunaPlantaSem: 3,
    /* R05 (Casa 487): a planta do ambiente NÃO leva balão de conexão (como a folha da Tânia: os S-n/F-n ficam no isométrico e nas tabelas); só DN, cotas e setas */
    baloesNaPlanta: false,
    foraDaPlanta: /janela|porta|cortina|lustre|luminaria|coifa|tapete|espelho|(^|-)tv|painel|ripado|carro|piscina|^hid-pisc|^hid-tubo|^hid-conex/i,
    pontosVistaMin: 2,   /* a vista cotada só entra com 2 pontos ou mais do sistema na parede; senão a planta ocupa a coluna */ folgaPlanta: 0.15, folgaAmbMax: 1.1,
    colunas: [0.30, 0.43, 0.27], gapBloco: 4, hTitBloco: 11,
    perspKMax: 70, perspMargem: 4,
    /* HIDRO-3D (29/10/2026): página/bloco por AMBIENTE e GRUPO DE SISTEMA (água | esgoto+ventilação | pluvial | gás), como a folha da Tânia ("ESGOTO - LAVANDERIA"):
       planta de detalhe na 1:25 (ou a primeira escala que couber), vista cotada, isométrico maior e tabelas só do grupo */
    detalhe: { cortaY: 2.4, denMin: 25, colunas: [0.36, 0.38, 0.26], fPlanta: 0.50, fVista: 0.38, perspKMax: 110 },
    linhaTab: 4.6, notaH: 2.1, entreLinhas: 1.35,
    ptAltura: 0.6   /* altura de ponto padrão (m), só como texto de nota quando o ponto não traz y */
  };
  /* hid:fisica-fim */
  var PREFIXO_COD = { agua_fria: "F", agua_quente: "Q", esgoto: "S", ventilacao: "S", pluvial: "P", gas: "G", industrial: "I", incendio: "N" };
  var ORDEM_SIS = ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "gas", "industrial", "incendio"];
  var ROT_SIS = { agua_fria: "Água fria", agua_quente: "Água quente", esgoto: "Esgoto", ventilacao: "Ventilação", pluvial: "Águas pluviais", gas: "Gás GLP", industrial: "Fluido industrial", incendio: "Incêndio" };
  var SIGLA = { agua_fria: "AF", agua_quente: "AQ", esgoto: "ES", ventilacao: "VE", pluvial: "AP", gas: "GAS", industrial: "IND", incendio: "IN" };

  function hoje() { var dt = new Date(); function d2(k) { return ("0" + k).slice(-2); } return d2(dt.getDate()) + "/" + d2(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function dois(k) { return ("0" + k).slice(-2); }
  function br(v, c) { if (v == null || !isFinite(v)) return "-"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }   // hid:ok formatação decimal
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  /* quebra o texto em linhas que cabem em w (mm) na altura h */
  function quebra(II, s, h, w) {
    var pal = txt(s).split(/\s+/), L = [], cur = "";
    pal.forEach(function (p) {
      var t = cur ? cur + " " + p : p;
      if (II.larg(t, h) <= w || !cur) cur = t; else { L.push(cur); cur = p; }
    });
    if (cur) L.push(cur);
    return L;
  }

  /* ------------------------------------------------------------ geometria: recorte de polígono por caixa (Sutherland-Hodgman) */
  function clipPoly(pts, b) {
    var out = pts.slice();
    function passa(entrada, dentro, inter) {
      var res = [];
      for (var i = 0; i < entrada.length; i++) {
        var a = entrada[i], c = entrada[(i + 1) % entrada.length], da = dentro(a), dc = dentro(c);
        if (da) res.push(a);
        if (da !== dc) res.push(inter(a, c));
      }
      return res;
    }
    out = passa(out, function (p) { return p[0] >= b.x0; }, function (a, c) { var t = (b.x0 - a[0]) / (c[0] - a[0]); return [b.x0, a[1] + t * (c[1] - a[1])]; });
    if (out.length) out = passa(out, function (p) { return p[0] <= b.x1; }, function (a, c) { var t = (b.x1 - a[0]) / (c[0] - a[0]); return [b.x1, a[1] + t * (c[1] - a[1])]; });
    if (out.length) out = passa(out, function (p) { return p[1] >= b.z0; }, function (a, c) { var t = (b.z0 - a[1]) / (c[1] - a[1]); return [a[0] + t * (c[0] - a[0]), b.z0]; });
    if (out.length) out = passa(out, function (p) { return p[1] <= b.z1; }, function (a, c) { var t = (b.z1 - a[1]) / (c[1] - a[1]); return [a[0] + t * (c[0] - a[0]), b.z1]; });
    return out;
  }

  /* ------------------------------------------------------------ os AMBIENTES do modelo que têm instalação hidráulica */
  /* recorte de segmento (x, z) na caixa — Liang–Barsky; null se fica todo fora */
  function clipSeg(x0, z0, x1, z1, b) {
    var t0 = 0, t1 = 1, dx = x1 - x0, dz = z1 - z0, P = [-dx, dx, -dz, dz], Q = [x0 - b.x0, b.x1 - x0, z0 - b.z0, b.z1 - z0];
    for (var i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return null; continue; }
      var r = Q[i] / P[i]; if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x0 + t0 * dx, z0 + t0 * dz, x0 + t1 * dx, z0 + t1 * dz];
  }
  function listaCaixa(pts) { var xs = pts.map(function (p) { return p[0]; }), zs = pts.map(function (p) { return p[1]; }); return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) }; }
  function ambientesDoModelo(c, pv) {
    var II = I(), La = II.listasArq(c, pv), G = GEOa(), out = [];
    if (!La) return out;
    var rede = c.rede, b0 = pv.base != null ? pv.base : pv.cota - 0.6, b1 = pv.sup != null ? pv.sup : pv.topo;
    var trPorId = {}; arr(rede.trechos).forEach(function (t) { trPorId[t.id] = t; });
    /* os PONTOS do ambiente: aparelhos (ligações), caixas/ralos e registros — o que põe a instalação "dentro" do cômodo */
    var pts = [], pecasAmb = [], famPorId = {}, estado = c.modelo && c.modelo.estado;
    arr(estado && estado.familias).forEach(function (f) { famPorId[f.id] = f; });
    function ehReserv(id) { var f = famPorId[String(id).split(":")[0]]; return !!(f && /caixa-dagua|reservatorio/.test(txt(f.famId))); }
    /* o ambiente é o cômodo que tem APARELHO (louça, pia, tanque, máquina, hidromassagem…): reservatório, caixa de inspeção e terminal de ventilação não fazem ambiente */
    arr(rede.ligacoes).forEach(function (l) { if (l.tipo === "aparelho" && l.y >= b0 - 0.05 && l.y < b1 && !ehReserv(l.alvo) && !/^bar-/.test(txt(l.alvo))) pts.push({ x: l.x, z: l.z, y: l.y, tipo: l.tipo, id: l.alvo }); });
    arr(rede.pecas).forEach(function (k) { if (k.y >= b0 - 0.05 && k.y < b1 && k.sistema === "esgoto" && /^(ralo|caixa_sifonada)/.test(txt(k.peca))) pecasAmb.push({ x: k.x, z: k.z, y: k.y, tipo: "peca", id: k.id }); });
    La.ambientes.forEach(function (a) {
      var dentro = pts.filter(function (p) { return G.pontoEmPol([p.x, p.z], a.pts); });
      if (!dentro.length) return;
      dentro = dentro.concat(pecasAmb.filter(function (p) { return G.pontoEmPol([p.x, p.z], a.pts); }));
      var bb = listaCaixa(a.pts), px = dentro.map(function (p) { return p.x; }), pz = dentro.map(function (p) { return p.z; });
      var m = K.folgaAmbMax, box = { x0: Math.max(bb.x0 - 0.15, Math.min.apply(null, px) - m), x1: Math.min(bb.x1 + 0.15, Math.max.apply(null, px) + m), z0: Math.max(bb.z0 - 0.15, Math.min.apply(null, pz) - m), z1: Math.min(bb.z1 + 0.15, Math.max.apply(null, pz) + m) };
      out.push({ id: "amb-" + a.id, nome: txt(a.nome).toUpperCase(), x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1, sala: bb, area: a.area, pontos: dentro.length, aparelhos: dentro.map(function (p) { return p.id; }), arq: a });
    });
    /* sem repetir o mesmo nome (dois cômodos "BANHEIRO"): numera */
    var cont = {}; out.forEach(function (a) { cont[a.nome] = (cont[a.nome] || 0) + 1; });
    var seq = {}; out.forEach(function (a) { if (cont[a.nome] > 1) { seq[a.nome] = (seq[a.nome] || 0) + 1; a.nome = a.nome + " " + seq[a.nome]; } });
    return out.sort(function (a, b) { return a.z0 - b.z0 || a.x0 - b.x0; });
  }

  /* R02: opcoes.pontosPendentes = [{ ambiente, nome, x, z, alt (m do piso), motivo }] — pontos de utilização que o modelo traz (pia da gourmet, cuba da
     bancada da cozinha) cuja ligação ainda não foi traçada. O ambiente que já tem página recebe o marcador; o que não tem ganha uma página só de pendência. */
  function semAcento(t) { return txt(t).toUpperCase().normalize ? txt(t).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(t).toUpperCase(); }
  function juntarPendentes(c, pv, ambs, pend) {
    if (!pend.length) return ambs;
    var II = I(), La = II.listasArq(c, pv), G = GEOa();
    pend.forEach(function (q) {
      var am = null; ambs.forEach(function (a) { if (!am && semAcento(a.nome).indexOf(semAcento(q.ambiente)) === 0) am = a; });
      if (!am && La) arr(La.ambientes).forEach(function (a) { if (!am && G.pontoEmPol([q.x, q.z], a.pts)) {
        var bb = listaCaixa(a.pts), m = K.folgaAmbMax;
        am = { id: "amb-" + a.id, nome: txt(a.nome).toUpperCase(), x0: bb.x0 - 0.1, x1: bb.x1 + 0.1, z0: bb.z0 - 0.1, z1: bb.z1 + 0.1, sala: bb, area: a.area, pontos: 0, aparelhos: [], arq: a, semRede: true, pendentes: [] };
        ambs.push(am); } });
      if (am) { (am.pendentes = am.pendentes || []).push(q); } else c.avisos.push("Ponto pendente \"" + q.nome + "\": nenhum ambiente do modelo o contém.");
    });
    return ambs.sort(function (a, b) { return a.z0 - b.z0 || a.x0 - b.x0; });
  }

  /* R04: A QUAL cômodo pertence um ponto (cota/ligação): o polígono que o contém ou o mais perto (até 0,35 m, parede de 14 cm + folga). Sem isto a caixa do ambiente (com folga)
     pegava a bancada do banho vizinho na página da lavanderia e a vista cotada do banheiro saía com a parede da lavanderia. null = nenhum cômodo perto (vale a caixa). */
  function distSeg(px, pz, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t)); return Math.sqrt(Math.pow(px - (a[0] + t * dx), 2) + Math.pow(pz - (a[1] + t * dz), 2));
  }
  function donoDoPonto(La, G, x, z) {
    var best = null, bd = Infinity;
    arr(La && La.ambientes).forEach(function (a) {
      var P = arr(a.pts), d;
      if (P.length < 3) return;
      if (G.pontoEmPol([x, z], P)) d = 0; else { d = Infinity; for (var i = 0; i < P.length; i++) d = Math.min(d, distSeg(x, z, P[i], P[(i + 1) % P.length])); }
      if (d < bd) { bd = d; best = a.id; }
    });
    return bd <= 0.35 ? best : null;
  }
  /* ------------------------------------------------------------ o que o ambiente tem (rede dentro da caixa) */
  /* ------------------------------------------------------------ GRUPOS DE SISTEMA (HIDRO-3D): o ambiente sai uma vez por grupo, só com as PEÇAS MODELADAS do grupo */
  var GRUPOS = [
    { id: "agua", nome: "ÁGUA", sis: ["agua_fria", "agua_quente"] },
    { id: "esgoto", nome: "ESGOTO E VENTILAÇÃO", sis: ["esgoto", "ventilacao"] },
    { id: "pluvial", nome: "ÁGUAS PLUVIAIS", sis: ["pluvial"] },
    { id: "gas", nome: "GÁS", sis: ["gas"] }
  ];
  function grupoPorId(id) { var g = null; GRUPOS.forEach(function (q) { if (q.id === id) g = q; }); return g; }
  /* o contexto com a rede FILTRADA pelo grupo (trechos, conexões, peças, acessórios, ligações): todo o desenho do bloco parte dele, nada é acrescentado */
  function contextoGrupo(c, grupoId) {
    var g = grupoPorId(grupoId); if (!g) return c;
    var r = c.rede, ids = {}, ok = {}; g.sis.forEach(function (x) { ok[x] = 1; });
    var trs = arr(r.trechos).filter(function (t) { return ok[t.sistema]; }); trs.forEach(function (t) { ids[t.id] = 1; });
    var trTodos = {}; arr(r.trechos).forEach(function (t) { trTodos[t.id] = t; });
    var rf = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) rf[k] = r[k];
    rf.trechos = trs;
    rf.conexoes = arr(r.conexoes).filter(function (q) { return ok[q.sistema]; });
    rf.pecas = arr(r.pecas).filter(function (q) { return ok[q.sistema]; });
    rf.acessorios = arr(r.acessorios).filter(function (q) { return ok[q.sistema]; });
    rf.ligacoes = arr(r.ligacoes).filter(function (l) { var t = trTodos[l.trecho]; return t ? !!ok[t.sistema] : (grupoId === "esgoto" && l.tipo === "peca"); });
    var cf = {}; for (var k2 in c) if (Object.prototype.hasOwnProperty.call(c, k2)) cf[k2] = c[k2];
    cf.rede = rf; cf.grupo = g; cf.denMin = K.detalhe.denMin; cf.cortaY = K.detalhe.cortaY;
    return cf;
  }
  /* quais grupos o ambiente tem (pelos trechos modelados dentro dele); ambiente sem rede traçada não se divide */
  function gruposDoAmbiente(c, am, pv) {
    if (am.semRede) return [];
    var d = dadosAmbiente(c, am, pv), out = [];
    GRUPOS.forEach(function (g) { if (d.trs.some(function (t) { return g.sis.indexOf(t.sistema) >= 0; })) out.push(g); });
    return out;
  }

  function dadosAmbiente(c, am, pv) {
    var II = I(), rede = c.rede, B = BIm(), tol = 0.05, b0 = pv.base != null ? pv.base : pv.cota - 0.6, b1 = pv.sup != null ? pv.sup : pv.topo, f = 0.12;
    function dentro(p) { return p.x >= am.x0 - f && p.x <= am.x1 + f && p.z >= am.z0 - f && p.z <= am.z1 + f; }
    var trs = arr(rede.trechos).filter(function (t) {
      if (t.sistema === "incendio") return false;
      if (/^rede-pred-/.test(txt(t.id)) && comprimento3d(t) > 2.5) return false;   /* R03: o coletor predial (trechos longos entre caixas de inspeção) não é do ambiente: atravessava a página da gourmet */
      var m = { x: (t.p1.x + t.p2.x) / 2, z: (t.p1.z + t.p2.z) / 2 }, ym = (t.p1.y + t.p2.y) / 2;
      return dentro(m) && ym >= b0 - tol && ym < b1;
    });
    var cxs = arr(rede.conexoes).filter(function (k) { return dentro(k) && k.y >= b0 - tol && k.y < b1 && k.sistema !== "incendio"; });
    var pecas = arr(rede.pecas).filter(function (k) { return dentro(k) && k.y >= b0 - tol && k.y < b1; });
    var acess = arr(rede.acessorios).filter(function (a) { return a.centro && dentro(a.centro) && a.centro.y >= b0 - tol && a.centro.y < b1; });
    var La0 = II.listasArq(c, pv), G0 = GEOa(), meu = am.arq && am.arq.id;   /* R04: só o que é DESTE cômodo */
    var ligs = arr(rede.ligacoes).filter(function (l) { if (!(dentro(l) && l.y >= b0 - tol && l.y < b1)) return false; var d0 = meu && La0 ? donoDoPonto(La0, G0, l.x, l.z) : null; return d0 == null || d0 === meu; });
    var trPorId = {}; arr(rede.trechos).forEach(function (t) { trPorId[t.id] = t; });
    return { trs: trs, cxs: cxs, pecas: pecas, acess: acess, ligs: ligs, trPorId: trPorId, B: B, II: II };
  }
  function nomeMaterial(B, m) { var x = B && B.MATERIAIS ? B.MATERIAIS[m] : null; return x && x.nome ? x.nome : txt(m).replace(/_/g, " "); }
  function comprimento3d(t) { return Math.sqrt(Math.pow(t.p1.x - t.p2.x, 2) + Math.pow(t.p1.y - t.p2.y, 2) + Math.pow(t.p1.z - t.p2.z, 2)); }

  /* a TABELA de conexões com o CÓDIGO (S-n, F-n…) e a de tubos; o código é o do balão do isométrico */
  function tabelasDe(c, d) {
    var II = d.II, B = d.B, cod = {}, linhasCx = [], contPref = {}, mapaCx = {};
    function codigoDe(chave, sistema) {
      if (cod[chave]) return cod[chave];
      var p = PREFIXO_COD[sistema] || "X"; contPref[p] = (contPref[p] || 0) + 1; cod[chave] = p + "-" + contPref[p]; return cod[chave];
    }
    var grupos = {}, ordem = [];
    function add(chave, sistema, nome, y) { if (!grupos[chave]) { grupos[chave] = { chave: chave, sistema: sistema, nome: nome, qtd: 0, acima: 0, ord: ORDEM_SIS.indexOf(sistema) }; ordem.push(chave); } grupos[chave].qtd++; if (c.yCorte != null && y != null && y > c.yCorte + 0.05) grupos[chave].acima++; }   /* HIDRO-3D: peça modelada acima do recorte do isométrico (prumo de ventilação interrompido) segue na tabela, marcada */
    d.cxs.forEach(function (k) {
      var dn = txt(k.dn) + (k.dn2 ? " x " + k.dn2 : "");
      var nome = txt(k.nome || k.tipo) + " " + nomeMaterial(B, k.material) + " DN " + dn;
      var chave = [k.sistema, k.tipo, k.material, k.dn, k.dn2].join("|");
      add(chave, k.sistema, nome, k.y); mapaCx[k.id] = chave;
    });
    d.pecas.forEach(function (k) {
      var rot = II.rotuloPecaPlanta(c.rede, k.id) || txt(k.peca).replace(/_/g, " ");
      var chave = ["peca", k.sistema, k.peca, k.dn].join("|");
      add(chave, k.sistema, rot + " (" + txt(k.peca).replace(/_/g, " ") + ")", k.y); mapaCx["peca:" + k.id] = chave;
    });
    /* a ordem dos códigos: por sistema (água antes de esgoto), depois a ordem em que aparece */
    ordem.sort(function (a, b) { return grupos[a].ord - grupos[b].ord; });
    ordem.forEach(function (ch) { var g = grupos[ch]; g.codigo = codigoDe(ch, g.sistema); linhasCx.push([String(g.qtd), g.nome + (g.acima ? (g.acima === g.qtd ? " *" : " (" + g.acima + " *)") : ""), g.codigo]); });
    /* registros e acessórios (sigla do próprio registro: RG/RE/RP/VR) */
    var ac = {};
    d.acess.forEach(function (a) { var s = ({ registro_gaveta: "RG", registro_esfera: "RE", registro_pressao: "RP", valvula_retencao: "VR" })[a.acessorio] || "RG", ch = s + "|" + a.dn + "|" + a.material; if (!ac[ch]) ac[ch] = { qtd: 0, nome: txt(a.nome || a.acessorio) + " DN " + a.dn + " " + nomeMaterial(B, a.material), sigla: s }; ac[ch].qtd++; });
    Object.keys(ac).forEach(function (ch) { linhasCx.push([String(ac[ch].qtd), ac[ch].nome, ac[ch].sigla]); });
    /* tubos: sistema + material + DN, comprimento em m */
    var tg = {}, tOrd = [];
    d.trs.forEach(function (t) {
      var ch = [t.sistema, t.material, t.dn].join("|");
      if (!tg[ch]) { tg[ch] = { sistema: t.sistema, material: t.material, dn: t.dn, L: 0, ord: ORDEM_SIS.indexOf(t.sistema) }; tOrd.push(ch); }
      tg[ch].L += comprimento3d(t);
    });
    tOrd.sort(function (a, b) { return tg[a].ord - tg[b].ord || tg[a].dn - tg[b].dn; });
    var linhasTb = tOrd.map(function (ch) { var g = tg[ch]; return [(ROT_SIS[g.sistema] || g.sistema) + " - " + nomeMaterial(B, g.material).replace(/ série normal/i, "").replace(/^PVC /, "PVC "), SIGLA[g.sistema] || "", txt(g.dn), br(g.L, 2)]; });
    return { linhasCx: linhasCx, linhasTb: linhasTb, codigoDe: function (obj, tipo) { var ch = mapaCx[tipo === "peca" ? "peca:" + obj.id : obj.id]; return ch ? grupos[ch].codigo : null; }, grupos: grupos, ordem: ordem };
  }

  /* ------------------------------------------------------------ pedaços do bloco */
  function faixaTitulo(D, x, y, w, h, t, cor, corTxt, hTxt) {
    D.add('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + cor + '" stroke="none"/>');
    D.texto(x + w / 2, y + h / 2, t, hTxt, { al: "C", meio: true, cor: corTxt, peso: 0.14 });
  }
  function tabelaCaderno(c, D, x, y, w, titulo, cab, linhas, colPct, o) {
    var II = I(), hT = 5.2, T = D.E.T;
    faixaTitulo(D, x, y, w, hT, titulo, K.cor.faixa, K.cor.tinta, Math.min(3.0, T.tabelaCab));
    D.ret(x, y, w, hT, "MET-TABELA");
    var cols = colPct.map(function (p, i) { return { w: w * p, t: cab[i], al: (o && o.al && o.al[i]) || "C" }; });
    var r = D.tabela(x, y + hT, cols, linhas.length ? linhas : [cols.map(function () { return ""; })], { fs: o && o.fs || 2.1, fsc: 2.3, hl: o && o.hl || K.linhaTab });
    return hT + r.h;
  }
  function nota(II, D, x, y, w, t, h, cor) {
    var L = quebra(II, t, h, w), yy = y;
    L.forEach(function (l, i) { D.texto(x, yy + h, l, h, { cor: cor }); yy += h * 1.5; });
    return yy - y + h * 0.5;
  }

  /* os pontos do ambiente com a ALTURA (m do piso acabado) de cada ligação */
  function nomePonto(c, id) {
    var II = I(), base = txt(id).split(":")[0], f = null, nm = c.nomeAp(id);
    arr(c.modelo && c.modelo.estado && c.modelo.estado.familias).forEach(function (q) { if (q.id === base) f = q; });
    if (nm && txt(nm) !== txt(id) && txt(nm) !== base) return txt(nm);
    var nf = f ? II.nomeFamilia(f.famId) : ""; if (nf) return nf.toUpperCase();
    return base.toUpperCase();
  }
  function pontosDoAmbiente(c, d, pv) {
    var out = [], vistos = {};
    d.ligs.forEach(function (l) {
      if (l.tipo !== "aparelho") return;
      var t = d.trPorId[l.trecho], sis = t ? t.sistema : "";
      var nm = nomePonto(c, l.famInst || l.alvo), ch = nm + "|" + sis + "|" + Math.round(l.y * 100);
      if (vistos[ch]) return; vistos[ch] = 1;
      out.push({ nome: nm, sistema: sis, alt: l.y - pv.cota, x: l.x, z: l.z, id: l.alvo });
    });
    return out.sort(function (a, b) { return a.nome < b.nome ? -1 : (a.nome > b.nome ? 1 : ORDEM_SIS.indexOf(a.sistema) - ORDEM_SIS.indexOf(b.sistema)); });
  }

  /* ------------------------------------------------------------ PLANTA do ambiente (arquitetura inteira recortada na caixa + tubos + alturas dos pontos) */
  function plantaAmbiente(c, D, R, am, pv, d, pts, chk) {
    var II = I(), a0 = c.avisos;
    var box = { x0: am.x0 - K.folgaPlanta, x1: am.x1 + K.folgaPlanta, z0: am.z0 - K.folgaPlanta, z1: am.z1 + K.folgaPlanta };
    var hT = D.E.T.titulo * 0.76 + D.E.T.escala * 1.3 + 2.6;
    var disp = { w: R.w - 4, h: R.h - hT - 3 }, den = null;
    K.escalasPlanta.forEach(function (e) { if (e < (c.denMin || 0)) return; var s = 1000 / e; if (den == null && (box.x1 - box.x0) * s <= disp.w && (box.z1 - box.z0) * s <= disp.h) den = e; });
    if (den == null) den = K.escalasPlanta[K.escalasPlanta.length - 1];   /* nada coube: a menor escala */
    var s = 1000 / den, wP = (box.x1 - box.x0) * s, hP = (box.z1 - box.z0) * s;
    var ox = R.x + 2 + (disp.w - wP) / 2 - box.x0 * s, oy = R.y + hT + (disp.h - hP) / 2 - box.z0 * s;
    c.AP.tituloVista(D, R.x + 1, R.y, "PLANTA DO AMBIENTE", "ESC 1:" + den + " - alturas em m do piso acabado");
    /* 1) arquitetura de fundo, recortada na caixa do ambiente */
    /* HIDRO-3D: tudo o que é arquitetura/louça fica RECORTADO no retângulo da caixa do ambiente (móvel e louça que passam do recorte invadiam o cabeçalho) */
    var clipId = "cpamb" + (c.__clipN = (c.__clipN || 0) + 1) + "_" + Math.round(R.x * 10) + "_" + Math.round(R.y * 10);
    D.add('<clipPath id="' + clipId + '"><rect x="' + n(box.x0 * s + ox) + '" y="' + n(box.z0 * s + oy) + '" width="' + n((box.x1 - box.x0) * s) + '" height="' + n((box.z1 - box.z0) * s) + '"/></clipPath><g clip-path="url(#' + clipId + ')">');
    var La = II.listasArq(c, pv);
    if (La) {
      var L2 = { paredes: [], pilares: [], vaos: [], moveis: [], ambientes: [] };
      La.paredes.forEach(function (w) { var q = clipPoly(w.pts, box); if (q.length >= 3) { var o = {}; for (var k in w) o[k] = w[k]; o.pts = q; L2.paredes.push(o); } });
      La.pilares.forEach(function (w) { var q = clipPoly(w.pts, box); if (q.length >= 3) { var o = {}; for (var k in w) o[k] = w[k]; o.pts = q; L2.pilares.push(o); } });
      La.vaos.forEach(function (v) { if (v.x >= box.x0 && v.x <= box.x1 && v.z >= box.z0 && v.z <= box.z1) L2.vaos.push(v); });
      La.moveis.forEach(function (m) { if (m.x >= box.x0 && m.x <= box.x1 && m.z >= box.z0 && m.z <= box.z1) L2.moveis.push(m); });
      /* o nome do ambiente está no cabeçalho do bloco: a planta do recorte não leva o rótulo (ele caía em cima do tubo) */
      var fa = II.fundoArquitetura(c, { paredes: L2.paredes, pilares: L2.pilares, vaos: L2.vaos, moveis: L2.moveis, ambientes: L2.ambientes }, s, ox, oy);
      D.add(fa.svg); if (D.caixas) fa.textos.forEach(function (b) { D.caixas.push(b); });
    }
    /* louças e metais hidráulicos pelo contorno real (a silhueta da malha vista de cima), só os do recorte */
    try {
      II.linhasLoucas(c.modelo.estado, c.modelo.avaliarFam, [0, 1, 0], function (fi) { return II.APARELHO_RE.test(txt(fi.famId)) && fi.x >= box.x0 && fi.x <= box.x1 && fi.z >= box.z0 && fi.z <= box.z1 && fi.y >= pv.cota - 0.7 && fi.y < pv.topo; })
        .forEach(function (sg) { var qx = [sg[0][0], sg[1][0]], qz = [sg[0][2], sg[1][2]]; if (qx[0] < box.x0 || qx[0] > box.x1 || qx[1] < box.x0 || qx[1] > box.x1 || qz[0] < box.z0 || qz[0] > box.z1 || qz[1] < box.z0 || qz[1] > box.z1) return; D.linha(sg[0][0] * s + ox, sg[0][2] * s + oy, sg[1][0] * s + ox, sg[1][2] * s + oy, "HID-LOUCA"); });
    } catch (eL) { c.avisos.push("Ambiente " + am.nome + ": louças pelo contorno real falharam (" + (eL && eL.message) + ")."); }
    D.add("</g>");   /* fim do recorte */
    /* R02: pontos de utilização lançados no modelo cuja LIGAÇÃO ainda não foi traçada: círculo vermelho tracejado + nome e altura */
    arr(am.pendentes).forEach(function (q) {
      if (q.x < box.x0 || q.x > box.x1 || q.z < box.z0 || q.z > box.z1) return;
      var px = q.x * s + ox, py = q.z * s + oy;
      D.circ(px, py, 2.2, "HID-PEND"); D.circ(px, py, 0.6, "HID-PEND");
      D.texto(px + 3.2, py + 0.8, q.nome + "  " + (q.alt >= 0 ? "+" : "") + br(q.alt, 2) + " - A LIGAR", 2.1, { cor: "#c00000" });
    });
    function rotularCaixasGordura() {
    /* R04: as CAIXAS DE GORDURA (família) com o nome na planta (dentro do círculo): "CG-01" (simples, NBR 8160 5.1.5.1.3 b) ou CGP (pequena) */
    arr(c.modelo && c.modelo.estado && c.modelo.estado.familias).forEach(function (f) {
      if (!f || f.famId !== "hid-caixa-gordura" || f.x < box.x0 || f.x > box.x1 || f.z < box.z0 || f.z > box.z1) return;
      var ins = f.inst || {}, dia = Number(ins.Diametro) || 0.3, qx = f.x * s + ox, qz = f.z * s + oy, cgs = dia >= 0.4 - 1e-9;
      D.circ(qx, qz, dia / 2 * s, "HID-SIMBOLO");
      var nmCg = String(ins.Nome || "CG").split(" ")[0], wCg = nmCg.length * 1.1, rCg = dia / 2 * s, hCg = 1.1;
      function livreCg(r0) {   /* o retângulo do nome não pode tocar texto nem tubo já desenhados */
        var ok = true;
        arr(D.caixas).forEach(function (cx) { var xs = arr(cx.p).map(function (q) { return q[0]; }), ys = arr(cx.p).map(function (q) { return q[1]; }); if (xs.length && Math.min.apply(null, xs) < r0[2] && Math.max.apply(null, xs) > r0[0] && Math.min.apply(null, ys) < r0[3] && Math.max.apply(null, ys) > r0[1]) ok = false; });
        arr(chk && chk.tubos).forEach(function (sg) {   /* segmento × retângulo (Liang-Barsky), com 0,6 mm de folga */
          var x0 = r0[0] - 0.6, x1 = r0[2] + 0.6, y0 = r0[1] - 0.6, y1 = r0[3] + 0.6, dx = sg[2] - sg[0], dy = sg[3] - sg[1], t0 = 0, t1 = 1, P = [-dx, dx, -dy, dy], Q = [sg[0] - x0, x1 - sg[0], sg[1] - y0, y1 - sg[1]], i, dentro = true;
          for (i = 0; i < 4; i++) { if (P[i] === 0) { if (Q[i] < 0) dentro = false; } else { var tt = Q[i] / P[i]; if (P[i] < 0) { if (tt > t1) dentro = false; else if (tt > t0) t0 = tt; } else { if (tt < t0) dentro = false; else if (tt < t1) t1 = tt; } } }
          if (dentro && t0 <= t1) ok = false;
        });
        return ok;
      }
      var cand = [{ r: [qx - rCg - 1 - wCg, qz - hCg, qx - rCg - 1, qz + hCg], x: qx - rCg - 1, al: "D" }, { r: [qx + rCg + 1, qz - hCg, qx + rCg + 1 + wCg, qz + hCg], x: qx + rCg + 1, al: "E" },
                  { r: [qx - wCg / 2, qz - rCg - 1 - 2 * hCg, qx + wCg / 2, qz - rCg - 1], x: qx, y: qz - rCg - 1 - hCg, al: "C" }, { r: [qx - wCg / 2, qz + rCg + 1, qx + wCg / 2, qz + rCg + 1 + 2 * hCg], x: qx, y: qz + rCg + 1 + hCg, al: "C" }];
      var esc0 = cand.filter(function (q) { return livreCg(q.r); })[0];   /* nome ao lado do círculo, onde couber (a especificação CGS/CGP vai na lista e na nota) */
      if (esc0) D.texto(esc0.x, esc0.y != null ? esc0.y : qz, nmCg, 1.8, { al: esc0.al, meio: true, cor: K.cor.tinta, peso: 0.2 });
      else c.avisos.push("Ambiente " + am.nome + ": o nome " + nmCg + " da caixa de gordura não coube na planta (consta na lista e nas notas).");
    });
    }
    if (am.semRede || !d.trs.length) { rotularCaixasGordura(); return { den: den }; }
    /* 2) tubos no nível médio, todos os sistemas do ambiente numa figura só */
    var cc = {}; for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) cc[k] = c[k];
    cc.pv = pv; cc.n = 0; cc.D = D;
    var redeAmb = {}; for (var kr in c.rede) if (Object.prototype.hasOwnProperty.call(c.rede, kr)) redeAmb[kr] = c.rede[kr];
    redeAmb.pecas = d.pecas; redeAmb.conexoes = d.cxs; cc.rede = redeAmb;   /* só o que está no recorte da planta */
    var polys = [], segs = [], sisAm = {};
    d.trs.forEach(function (t) { sisAm[t.sistema === "ventilacao" ? "esgoto" : t.sistema] = 1; });
    Object.keys(sisAm).forEach(function (sis) {
      var trsS = d.trs.filter(function (t) { return t.sistema === sis || (sis === "esgoto" && t.sistema === "ventilacao"); });
      cc.sis = sis; cc.trs = trsS;
      var f = II.formasDe(cc, trsS); if (f) { polys = polys.concat(f.polys); segs = segs.concat(f.segs); }
    });
    var fm = { polys: polys, segs: segs };
    D.add('<g clip-path="url(#' + clipId + ')">');   /* HIDRO-3D: o tubo que sai do recorte é cortado na caixa do ambiente */
    II.formasPlanta(D, cc, d.trs, s, ox, oy, fm);
    D.add("</g>");
    var bordas = II.bordasTubo(fm, s, ox, oy); bordas.forEach(function (q) { chk.tubos.push(q); });
    /* 3) rótulos: DN, setas, aparelho + ALTURA do ponto */
    var altPor = {};
    d.ligs.forEach(function (l) { if (l.tipo !== "aparelho") return; var t = d.trPorId[l.trecho]; (altPor[l.alvo] = altPor[l.alvo] || []).push({ s: t ? t.sistema : "", alt: l.y - pv.cota }); });
    function textoPonto(l, nm) {
      var al = altPor[l.alvo]; if (!al || !al.length) return nm;
      var partes = []; al.forEach(function (q) { var t = (SIGLA[q.s === "ventilacao" ? "esgoto" : q.s] || "") + " " + (q.alt >= 0 ? "+" : "") + br(q.alt, 2); if (partes.indexOf(t) < 0) partes.push(t); });
      return nm + "  " + partes.join(" · ");
    }
    var prim = II.plantaPrim(c.rede, c.ix, "", d.trs, c.pavs, s, { medio: true, nome: c.nomeAp, colunas: c.colunas, obstaculos: II.obstaculosFormas(fm, s), segExtra: II.bordasTubo(fm, s, 0, 0), deTubo: II.deTubo, textoPonto: textoPonto });
    arr(prim.avisos).forEach(function (m) { a0.push("Ambiente " + am.nome + ": " + m); });
    II.desenhar(D, prim, ox, oy, chk);
    c.prims.push(prim);
    return { den: den, rotularCg: rotularCaixasGordura };   /* o nome da caixa de gordura é desenhado por último (fim do bloco), num lugar livre entre rótulos e tubos */
  }

  /* ------------------------------------------------------------ VISTA COTADA do ambiente (R02): a elevação da parede hidráulica do cômodo,
   * como na referência da Tânia (vista ao lado da planta): parede, louça em meio-tom, tubos na cor do sistema com o DN, pontos com a altura,
   * cota horizontal (cm) entre os pontos e cota VERTICAL (cm) das alturas. Usa o mesmo desenho dos "cortes das paredes hidráulicas" das pranchas. */
  function bboxPrim(d) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function p(x, y) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    arr(d.linhas).forEach(function (l) { if (l.oculto) return; p(l.x1, l.y1); p(l.x2, l.y2); });
    arr(d.simbolos).forEach(function (q) { if (q.box) { p(q.box[0], q.box[1]); p(q.box[2], q.box[3]); } });
    arr(d.textos).forEach(function (q) { if (q.box) { p(q.box[0], q.box[1]); p(q.box[2], q.box[3]); } });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function paredesDoAmbiente(c, am, pv) {
    var II = I(), out = [], m = 0.45;
    try {
      II.paredesHidraulicas(c, pv).forEach(function (ph) {
        var w = ph.w, cx = w.c[0] + w.n[0] * ph.lado * (w.esp / 2 + 0.2), cz = w.c[1] + w.n[1] * ph.lado * (w.esp / 2 + 0.2);
        if (cx < am.x0 - m || cx > am.x1 + m || cz < am.z0 - m || cz > am.z1 + m) return;
        var La1 = II.listasArq(c, pv), G1 = GEOa(), meu1 = am.arq && am.arq.id;
        ph.pv = pv; ph.nPontosTodos = ph.pts.filter(function (l) { return l.tipo === "aparelho"; }).length;
        ph.nPontos = ph.pts.filter(function (l) { if (l.tipo !== "aparelho") return false; var d1 = meu1 && La1 ? donoDoPonto(La1, G1, l.x, l.z) : null; return d1 == null || d1 === meu1; }).length;
        out.push(ph);
      });
      /* R04: a parede com pontos de outro cômodo não vira a vista deste: só entram as paredes com ponto DESTE cômodo (sem nenhuma, vale a regra antiga) */
      if (out.some(function (ph) { return ph.nPontos > 0; })) out = out.filter(function (ph) { return ph.nPontos > 0; });
      else out.forEach(function (ph) { ph.nPontos = ph.nPontosTodos; });
    } catch (e) { c.avisos.push("Ambiente " + am.nome + ": paredes hidráulicas para a vista cotada falharam (" + (e && e.message) + ")."); }
    out.sort(function (a, b) { return (b.nPontos * 6 + b.trs.length + b.w.L * 0.05) - (a.nPontos * 6 + a.trs.length + a.w.L * 0.05); });
    return out.slice(0, 1);   /* UMA parede por ambiente: a de mais pontos (a vista cabe em 1:50 com cota e rótulos limpos) */
  }
  function vistaAmbiente(c, D, R, am, pv, chk, phs, o) {
    o = o || {};
    var II = I(), a0 = c.avisos, n0 = phs.length, hEach = (R.h - 7) / n0, titulo = "VISTA COTADA";
    D.texto(R.x + 1, R.y + 3.2, titulo + (n0 > 1 ? "S" : "") + " - cotas em cm", 2.6, { peso: 0.2, cor: K.cor.tinta });
    var yy = R.y + 6;
    phs.forEach(function (ph, idx) {
      ph.louca = true; ph.cotaV = 15; ph.n = idx + 1;
      var den = null, d = null, bb = null, esc = [20, 25, 30, 40, 50, 75, 100], padL = 17, padR = 4, hRod = 10;
      for (var i = 0; i < esc.length && den == null; i++) {
        var dd = II.desenhoCorte(c, ph, 1000 / esc[i]), b = bboxPrim(dd);
        if (b.x1 - b.x0 + padL + padR <= R.w && b.y1 - b.y0 + hRod + 6 <= hEach) { den = esc[i]; d = dd; bb = b; }
      }
      if (den == null) { den = esc[esc.length - 1]; d = II.desenhoCorte(c, ph, 1000 / den); bb = bboxPrim(d); a0.push("Ambiente " + am.nome + ": a vista cotada não coube nem na 1:" + den + "."); }
      var ox = R.x + padL + (R.w - padL - padR - (bb.x1 - bb.x0)) / 2 - bb.x0, oy = yy + 6 - bb.y0;
      D.texto(R.x + 1, yy + 2.4, "PAREDE " + (idx + 1) + " - " + am.nome + "  (ESC 1:" + den + ")", 2.3, { peso: 0.16, cor: K.cor.grafite });
      II.desenhar(D, d, ox, oy, chk);
      var s0 = 1000 / den;
      /* cota horizontal (entre os pontos ao longo da parede), embaixo do piso */
      var cxs = d.cotaXs.filter(function (xx, i, A) { return i === 0 || xx - A[i - 1] >= 4 || i === A.length - 1; });
      if (cxs.length > 2) {
        var P = cxs.map(function (xx) { return [xx + ox, d.yFundo + oy + 5]; }), vals = [];
        for (var q = 0; q + 1 < cxs.length; q++) vals.push(String(Math.round((cxs[q + 1] - cxs[q]) / s0 * 100)));
        var nSg = D.sg ? D.sg.length : 0; D.cadeia(P, 0, vals, {});
        if (D.sg) for (var q2 = nSg; q2 < D.sg.length; q2++) chk.cotas.push(D.sg[q2]);
      }
      /* cota vertical: do piso acabado até cada altura de ponto (cm) */
      var ys = d.cotaYs.slice().sort(function (p0, q0) { return q0 - p0; });   /* papel: de baixo para cima */
      var ysF = [d.yPiso].concat(ys.filter(function (v, i2, A) { return Math.abs(v - (i2 === 0 ? d.yPiso : A[i2 - 1])) >= 4 && Math.abs(v - d.yPiso) >= 4; }));
      if (ysF.length > 1 && !o.semCotaV) {
        var xv = ox - ph.cotaV, PV = ysF.map(function (v) { return [xv, v + oy]; }), vv = [];
        for (var r = 0; r + 1 < ysF.length; r++) vv.push(String(Math.round((ysF[r] - ysF[r + 1]) / s0 * 100)));
        var nSg2 = D.sg ? D.sg.length : 0; D.cadeia(PV, 0, vv, { desde: PV.map(function () { return false; }) });
        if (D.sg) for (var q3 = nSg2; q3 < D.sg.length; q3++) chk.cotas.push(D.sg[q3]);
      }
      arr(d.avisos).forEach(function (m) { a0.push("Ambiente " + am.nome + " (vista): " + m); });
      c.prims.push(d);
      yy += hEach;
    });
    return { n: n0 };
  }

  /* HIDRO-3D: o isométrico do ambiente (vetorial ou render 3D se c.rasters traz a imagem do ambiente × grupo) com os balões do código da tabela */
  function isoAmbiente(c, D, R2, am, pv, tb, chk, DT) {
    var II = I();
    /* HIDRO-3D: a VISTA SALVA no sistema (js/hidvistaiso.js) do ambiente × grupo: quadrante da câmera, caixa de corte, marcações — a folha só a COLOCA (viewport) */
    var vi = c.grupo && c.vistasIso ? (c.vistasIso[(am.id || am.nomeBase || am.nome) + "|" + c.grupo.id] || null) : null;
    if (vi && vi.hidIso) {
      var cv = {}; for (var kc in c) if (Object.prototype.hasOwnProperty.call(c, kc)) cv[kc] = c[kc];
      cv.cfg = {}; for (var kf in c.cfg) if (Object.prototype.hasOwnProperty.call(c.cfg, kf)) cv.cfg[kf] = c.cfg[kf];
      cv.cfg.perspectiva = { vista: vi.hidIso.quadrante || "SE", ambientes: arr(c.cfg && c.cfg.perspectiva && c.cfg.perspectiva.ambientes) };
      c = cv; am = amDaVista(am, vi);
    }
    var pz = II.perspectivaDe(c, am, pv);
    if (pz) {
      var cp = {}; for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) cp[k] = c[k];
      cp.vistaIso = vi;
      cp.raster = c.grupo && c.rasters ? (c.rasters[(am.id || am.nomeBase || am.nome) + "|" + c.grupo.id] || null) : null; cp.agruparBaloes = !!(c.grupo && (cp.raster || c.agruparBaloes)); cp.D = D; cp.persp = pz; cp.areaPersp = { x: R2.x, y: R2.y + (DT ? 10 : 6), w: R2.w, h: R2.h - (DT ? 10 : 6) }; cp.semLegenda = true; cp.perspKMax = DT ? DT.perspKMax : K.perspKMax; cp.perspMargem = K.perspMargem; cp.chk = chk; cp.titulo = "";
      var vistosDt = {}, nDt = 0;
      cp.destaque = function (obj, tipo) {   /* peça especial com a chamada em caixa (no máx. 4 por ambiente): redução, inspeção, caixa sifonada, ralo, terminal */
        if (nDt >= 4) return null;
        var t = null;
        if (tipo === "cx" && /^(reducao|te_reducao|te_inspecao|uniao|cruzeta)/.test(txt(obj.tipo))) t = txt(obj.nome || obj.tipo) + " " + txt(obj.dn) + (obj.dn2 ? " x " + obj.dn2 : "") + " mm";
        else if (tipo === "peca" && /^(caixa_sifonada|ralo|terminal_ventilacao|caixa_gordura)/.test(txt(obj.peca))) t = (II.rotuloPecaPlanta(c.rede, obj.id) || txt(obj.peca).replace(/_/g, " ")).replace(/^\w/, function (m0) { return m0.toUpperCase(); });
        if (!t || vistosDt[t]) return null;
        vistosDt[t] = 1; nDt++; return t;
      };
      cp.codigoConexao = function (obj) { return obj && obj.peca ? tb.codigoDe(obj, "peca") : tb.codigoDe(obj, "cx"); };
      D.texto(R2.x + 1, R2.y + 3.2, "ISOMÉTRICO 30° - SEM ESCALA (vista " + pz.vista + ")", 2.6, { peso: 0.2, cor: K.cor.tinta });
      II.folhaPerspectiva(cp);
      chk.nBaloes = cp.nBaloes; chk.nBaloesPecas = cp.nBaloesPecas;
      if (cp.vistaRes) { chk.vistaRes = cp.vistaRes; chk.nBaloes = cp.vistaRes.itens.filter(function (q) { return q.tipo === "codigo"; }).length; chk.kUsado = cp.kUsado; }
    } else c.avisos.push("Ambiente " + am.nome + ": sem tubulação para o isométrico.");
  }
  /* o ambiente com a CAIXA DE CORTE da vista (o usuário pode ter ajustado a caixa; sem ajuste é a do ambiente) */
  function amDaVista(am, vi) {
    var cx = vi && vi.hidIso && vi.hidIso.caixa, q = {}; for (var kk in am) if (Object.prototype.hasOwnProperty.call(am, kk)) q[kk] = am[kk];
    if (cx && isFinite(cx.x0) && isFinite(cx.x1) && isFinite(cx.z0) && isFinite(cx.z1) && cx.x1 > cx.x0 && cx.z1 > cx.z0) { q.x0 = cx.x0; q.x1 = cx.x1; q.z0 = cx.z0; q.z1 = cx.z1; }
    return q;
  }
  /* o contexto 3D da vista (grupo filtrado, quadrante da câmera, caixa de corte) — o MESMO que a folha monta em isoAmbiente: o render e a anotação partem dele */
  function pzDaVista(c, am0, pv, vista) {
    var II = I(), grupoId = vista.hidIso.grupo, gr = grupoPorId(grupoId); if (!gr) return null;
    var cg = contextoGrupo(c, grupoId), am = {}; for (var kk in am0) if (Object.prototype.hasOwnProperty.call(am0, kk)) am[kk] = am0[kk];
    am.nomeBase = am0.nome; am.nome = am0.nome + " - " + gr.nome;
    var pz0 = II.perspectivaDe(cg, am, pv); if (!pz0) return null;
    cg.yCorte = pz0.yT;
    var cv = {}; for (var kc in cg) if (Object.prototype.hasOwnProperty.call(cg, kc)) cv[kc] = cg[kc];
    cv.cfg = {}; for (var kf in c.cfg) if (Object.prototype.hasOwnProperty.call(c.cfg, kf)) cv.cfg[kf] = c.cfg[kf];
    cv.cfg.perspectiva = { vista: vista.hidIso.quadrante || "SE", ambientes: arr(c.cfg && c.cfg.perspectiva && c.cfg.perspectiva.ambientes) };
    var am2 = amDaVista(am, vista), pz = II.perspectivaDe(cv, am2, pv);
    return pz ? { cg: cv, am: am2, pz: pz, chave: (am.id || am.nomeBase || am.nome) + "|" + grupoId } : null;
  }
  /* HIDRO-3D: os INSUMOS da vista "Planta do ambiente": a caixa, a arquitetura cortada da planta do sistema (paredes/pilares recortados na caixa), a louça em linha fina
     (a silhueta da malha real vista de cima) e o plano de corte (acima das louças). O que é instalação (tubo, conexão, peça) vem da MESMA malha 3D do isométrico. */
  function insumosPlanta(c, am, pv, vista) {
    var II = I(), hi = vista && vista.hidIso || {}, f = K.folgaPlanta, box = { x0: am.x0 - f, x1: am.x1 + f, z0: am.z0 - f, z1: am.z1 + f };
    var La = II.listasArq(c, pv), paredes = [], pilares = [], loucas = [], aviso = [], K2 = HP().K2;
    if (La) {
      arr(La.paredes).forEach(function (w) { var q = clipPoly(w.pts, box); if (q.length >= 3) paredes.push({ pts: q }); });
      arr(La.pilares).forEach(function (w) { var q = clipPoly(w.pts, box); if (q.length >= 3) pilares.push({ pts: q }); });
    }
    var corte = num(hi.corte, 1.2);   /* m acima do piso acabado: acima das louças (bancada ~0,9; caixa acoplada ~0,85) */
    try {
      II.linhasLoucas(c.modelo.estado, c.modelo.avaliarFam, [0, 1, 0], function (fi) {
        /* R05: além das louças, a silhueta dos MÓVEIS do modelo abaixo do plano de corte (bancada, ilha, armário, máquina) — o contexto do ambiente, como na folha da Tânia */
        var id = txt(fi.famId), ap = II.APARELHO_RE.test(id), mob = !ap && !K.foraDaPlanta.test(id) && fi.y < pv.cota + corte;
        return (ap || mob) && fi.x >= box.x0 && fi.x <= box.x1 && fi.z >= box.z0 && fi.z <= box.z1 && fi.y >= pv.cota - 0.7 && fi.y < pv.topo; })
        .forEach(function (sg) { var q = clipSeg(sg[0][0], sg[0][2], sg[1][0], sg[1][2], box); if (!q) return; loucas.push([[q[0], pv.cota + corte - 0.01, q[1]], [q[2], pv.cota + corte - 0.01, q[3]]]); });   /* R05: recorta na caixa (a bancada corrida passava da caixa e sumia inteira) */
    } catch (e) { aviso.push("louças pelo contorno real falharam (" + (e && e.message) + ")"); }
    return { box: box, paredes: paredes, pilares: pilares, loucas: loucas, cotaPiso: pv.cota, yCorte: pv.cota + corte, arqCor: (K2 && K2.arq && K2.arq.preench) || "#e4e4e4", arqContorno: (K2 && K2.arq && K2.arq.contorno) || "#8c8c8c", corLouca: (K2 && K2.arq && K2.arq.louca) || "#9a9a9a", avisos: aviso };
  }
  /* o contexto 3D da PLANTA (mesmo grupo filtrado do isométrico; o recorte do pz é a caixa do ambiente) */
  function pzDaPlanta(c, am0, pv, vista) {
    var v2 = { nome: vista.nome, hidIso: {} }; for (var k in vista.hidIso) if (Object.prototype.hasOwnProperty.call(vista.hidIso, k)) v2.hidIso[k] = vista.hidIso[k];
    v2.hidIso.quadrante = "SE"; return pzDaVista(c, am0, pv, v2);
  }
  function APx() { return dep("AcoPranchas", "./acopranchas.js"); }

  /* A PLANTA COMO VISTA: o raster é a vista superior das malhas 3D do sistema; por cima, só ANOTAÇÃO ligada à peça (DN e i% dos trechos, setas de fluxo,
     alturas dos pontos, balões de código) — auto-posicionada ou arrastada. Nenhum símbolo de conexão é desenhado pelo gerador. */
  function plantaVista(c, D, R, am, pv, d, tb, chk, vi, RA) {
    var II = I(), a0 = c.avisos, ins = insumosPlanta(c, am, pv, vi), box = ins.box, HVm = global.HidVistaIso || (typeof require === "function" ? require("./hidvistaiso.js") : null);
    var colP = K.baloesNaPlanta ? K.colunaPlanta : K.colunaPlantaSem, hT = D.E.T.titulo * 0.76 + D.E.T.escala * 1.3 + 2.6, disp = { w: R.w - 4 - 2 * colP, h: R.h - hT - 3 }, den = null;   /* as colunas dos balões ficam nas laterais da planta */
    K.escalasPlanta.forEach(function (e) { if (e < (c.denMin || 0)) return; var s0 = 1000 / e; if (den == null && (box.x1 - box.x0) * s0 <= disp.w && (box.z1 - box.z0) * s0 <= disp.h) den = e; });
    if (den == null) den = K.escalasPlanta[K.escalasPlanta.length - 1];
    var s = 1000 / den, wP = (box.x1 - box.x0) * s, hP = (box.z1 - box.z0) * s, ox = R.x + 2 + colP + (disp.w - wP) / 2 - box.x0 * s, oy = R.y + hT + (disp.h - hP) / 2 - box.z0 * s;
    c.AP.tituloVista(D, R.x + 1, R.y, "PLANTA DO AMBIENTE", "ESC 1:" + den + " - plano de corte a " + br(num(vi.hidIso.corte, 1.2), 2) + " m do piso acabado");
    var px0 = box.x0 * s + ox, py0 = box.z0 * s + oy;
    D.add('<rect x="' + n(px0) + '" y="' + n(py0) + '" width="' + n(wP) + '" height="' + n(hP) + '" fill="#ffffff" stroke="none"/>');
    D.add('<image data-im="' + RA.key + '" x="' + n(px0) + '" y="' + n(py0) + '" width="' + n(wP) + '" height="' + n(hP) + '" preserveAspectRatio="none" href="' + RA.href + '"/>');
    var altPor = {};
    d.ligs.forEach(function (l) { if (l.tipo !== "aparelho") return; var t = d.trPorId[l.trecho]; (altPor[l.alvo] = altPor[l.alvo] || []).push({ s: t ? t.sistema : "", alt: l.y - pv.cota }); });
    function textoPonto(l, nm) {
      var al = altPor[l.alvo]; if (!al || !al.length) return nm;
      var partes = []; al.forEach(function (q) { var t = (SIGLA[q.s === "ventilacao" ? "esgoto" : q.s] || "") + " " + (q.alt >= 0 ? "+" : "") + br(q.alt, 2); if (partes.indexOf(t) < 0) partes.push(t); });
      return nm + "  " + partes.join(" · ");
    }
    var redeAmb = {}; for (var kr in c.rede) if (Object.prototype.hasOwnProperty.call(c.rede, kr)) redeAmb[kr] = c.rede[kr];
    redeAmb.pecas = d.pecas; redeAmb.conexoes = d.cxs;
    var prim = II.plantaPrim(redeAmb, c.ix, "", d.trs, c.pavs, s, { medio: true, nome: c.nomeAp, colunas: c.colunas, deTubo: II.deTubo, textoPonto: textoPonto, devolverPend: true });
    arr(prim.avisos).forEach(function (m) { a0.push("Ambiente " + am.nome + ": " + m); });
    var pend = arr(prim.pend).map(function (p) { var q = {}; for (var kk in p) if (Object.prototype.hasOwnProperty.call(p, kk)) q[kk] = p[kk]; q.anchors = arr(p.anchors).map(function (a) { return [a[0] + ox, a[1] + oy]; }); return q; });
    /* setas de fluxo (esgoto/pluvial): ligadas ao trecho, sobre o tubo */
    arr(prim.simbolos).forEach(function (q) { if (q.tipo === "seta" && q.pts) D.cheio(q.pts.map(function (p) { return [p[0] + ox, p[1] + oy]; }), "#000"); });
    /* balões de código (S-n): um por conexão/peça da tabela, agrupados quando iguais e próximos */
    var bal = [];
    arr(d.cxs).forEach(function (cx) { var cod = tb.codigoDe(cx, "cx"); if (cod) bal.push({ cod: cod, p: [cx.x * s + ox, cx.z * s + oy], id: cx.id }); });
    arr(d.pecas).forEach(function (pc) { var cod = tb.codigoDe(pc, "peca"); if (cod) bal.push({ cod: cod, p: [pc.x * s + ox, pc.z * s + oy], id: pc.id }); });
    var raios = [3, 5, 8, 12, 18, 26, 38], cl = [];
    for (var ri = 0; ri < raios.length; ri++) {
      cl = [];
      bal.forEach(function (b) { var hit = null; cl.forEach(function (q) { if (!hit && q.cod === b.cod && Math.hypot(q.p[0] - b.p[0], q.p[1] - b.p[1]) <= raios[ri]) hit = q; }); if (hit) { hit.n++; hit.ids.push(b.id); } else cl.push({ cod: b.cod, p: b.p, n: 1, ids: [b.id] }); });
      if (cl.length <= 14) break;
    }
    if (K.baloesNaPlanta) cl.forEach(function (q) { pend.push({ s: q.n > 1 ? q.cod + " x" + q.n : q.cod, cod: q.cod, n: q.n, ids: q.ids, tipo: "codigo", anchors: [q.p], trecho: q.ids[0] }); });
    /* obstáculos dos rótulos: tubo (com a largura do DE em escala), conexão, peça e parede */
    var seg = [], obst = [];
    arr(d.trs).forEach(function (t) {
      var cq = t.vertical ? [t.p1.x, t.p1.z, t.p2.x, t.p2.z] : clipSeg(t.p1.x, t.p1.z, t.p2.x, t.p2.z, box); if (!cq) return;   /* R05: o tubo conta só DENTRO do recorte da planta (fora dele não aparece no desenho) */
      var hw = Math.max(II.deTubo(t) / 1000 * s / 2, 0.4), a = [cq[0] * s + ox, cq[1] * s + oy], b = [cq[2] * s + ox, cq[3] * s + oy];
      if (t.vertical) obst.push([a[0] - hw, a[1] - hw, a[0] + hw, a[1] + hw]); else { seg.push([a[0], a[1], b[0], b[1], hw]); chk.tubos.push([a[0], a[1], b[0], b[1]]); }
    });
    arr(d.cxs).forEach(function (cx) { var r = Math.max((cx.dn || 50) / 1000 * s * 0.8, 1); obst.push([cx.x * s + ox - r, cx.z * s + oy - r, cx.x * s + ox + r, cx.z * s + oy + r]); });
    arr(d.pecas).forEach(function (pc) { var r = Math.max(0.1 * s, 1.6); obst.push([pc.x * s + ox - r, pc.z * s + oy - r, pc.x * s + ox + r, pc.z * s + oy + r]); });
    var obstParede = [];
    ins.paredes.concat(ins.pilares).forEach(function (w) { var xs = w.pts.map(function (p) { return p[0] * s + ox; }), zs = w.pts.map(function (p) { return p[1] * s + oy; }); obstParede.push([Math.min.apply(null, xs), Math.min.apply(null, zs), Math.max.apply(null, xs), Math.max.apply(null, zs)]); });
    var kV = num(vi.hidIso.k, null), larg = function (t0, h0) { var A = APx(); return A && A.largTexto ? A.largTexto(t0, h0) : txt(t0).length * h0 * 0.6; };
    var rv = HVm.compor(D, vi, { pend: pend, obst: obst, obstParede: obstParede, seg: seg, area: { x: R.x, y: R.y + hT, w: R.w, h: R.h - hT }, bbox: { x0: px0, y0: py0, x1: px0 + wP, y1: py0 + hP }, larg: larg, compacto: true, escala: kV ? s / kV : 1 });
    rv.avisos.forEach(function (m) { a0.push("Vista " + (vi.nome || "planta") + ": " + m); });
    if (c.prims) c.prims.push({ linhas: [], simbolos: [], textos: [], trechos: arr(d.trs).map(function (t) { return t.id; }) });
    return { den: den, vistaRes: rv, k: s };
  }
  /* A PLANTA DO AMBIENTE como vista, na tela: a mesma função da folha, numa folha do tamanho do quadro */
  function vistaPlantaTela(c, am0, pv, vista, o) {
    o = o || {}; var II = I(), AP0 = c.AP, E = c.E, grupoId = vista.hidIso.grupo, gr = grupoPorId(grupoId); if (!gr) return { ok: false, avisos: ["Grupo de sistema desconhecido: " + grupoId] };
    var cg = contextoGrupo(c, grupoId), am = {}; for (var kk in am0) if (Object.prototype.hasOwnProperty.call(am0, kk)) am[kk] = am0[kk];
    am.nomeBase = am0.nome; am.nome = am0.nome + " - " + gr.nome;
    var pz0 = II.perspectivaDe(cg, am, pv); cg.yCorte = pz0 ? pz0.yT : null; cg.avisos = []; cg.prims = [];
    var d = dadosAmbiente(cg, am, pv), tb = tabelasDe(cg, d), W = o.largura || 150, H = o.altura || 120, D = II.marcarCamadas(new AP0.Desenho(E, [])), chk = { tubos: [], cotas: [] };
    var RA = o.rasters && o.rasters[(am.id || am.nomeBase || am.nome) + "|" + grupoId + "|planta"];
    if (!RA) return { ok: false, avisos: ["Sem o render da planta (a vista superior das malhas do modelo): o 3D do BIM precisa estar aberto."] };
    var pl = plantaVista(cg, D, { x: 0, y: 0, w: W, h: H }, am, pv, d, tb, chk, vista, RA);
    return { ok: true, svg: svgPagina(W, H, D, vista.nome || "Planta do ambiente").replace('fill="' + K.cor.offwhite + '"', 'fill="#ffffff"'), W: W, H: H, den: pl.den, res: pl.vistaRes, k: pl.k, avisos: cg.avisos };
  }
  /* A VISTA NA TELA (e o que a folha coloca): o quadro do isométrico — a MESMA função da folha (isoAmbiente), numa folha só do tamanho do quadro.
     Devolve o SVG, as marcações com posição em mm (para arrastar), os órfãos e o k (mm/m) em que a vista foi composta. */
  function vistaIsoTela(c, am0, pv, vista, o) {
    o = o || {}; var II = I(), AP = c.AP, E = c.E, grupoId = vista.hidIso.grupo, gr = grupoPorId(grupoId), DT = K.detalhe;
    if (!gr) return { ok: false, avisos: ["Grupo de sistema desconhecido: " + grupoId] };
    var cg = contextoGrupo(c, grupoId), am = {}; for (var kk in am0) if (Object.prototype.hasOwnProperty.call(am0, kk)) am[kk] = am0[kk];
    am.nomeBase = am0.nome; am.nome = am0.nome + " - " + gr.nome;
    var pz0 = II.perspectivaDe(cg, am, pv); if (!pz0) return { ok: false, avisos: ["Sem tubulação do grupo neste ambiente."] };
    cg.yCorte = pz0.yT; cg.rasters = o.rasters || null; cg.vistasIso = {}; cg.vistasIso[(am.id || am.nomeBase || am.nome) + "|" + grupoId] = vista; cg.agruparBaloes = true;
    var d = dadosAmbiente(cg, am, pv), tb = tabelasDe(cg, d);
    var W = o.largura || 243, H = o.altura || 178, D = II.marcarCamadas(new AP.Desenho(E, [])), chk = { tubos: [], cotas: [] };
    cg.avisos = []; isoAmbiente(cg, D, { x: 0, y: 0, w: W, h: H }, am, pv, tb, chk, DT);
    var svg = svgPagina(W, H, D, vista.nome || "Isométrico do ambiente");
    var res = chk.vistaRes || null;
    return { ok: true, svg: svg, W: W, H: H, res: res, k: chk.kUsado || null, avisos: cg.avisos, pz: pz0, tb: tb, D: D, chk: chk };
  }

  /* ------------------------------------------------------------ BLOCO DE AMBIENTE */
  function blocoAmbiente(c, D, A, am, pv, o) {
    o = o || {};
    /* HIDRO-3D: com o.grupo o bloco usa só a rede modelada do grupo (água | esgoto | pluvial | gás) e o layout de detalhe (planta 1:25, isométrico maior) */
    var gr = o.grupo ? grupoPorId(o.grupo) : null, DT = gr ? K.detalhe : null;
    if (gr) { c = contextoGrupo(c, gr.id); am = (function (a0) { var q = {}; for (var kk in a0) if (Object.prototype.hasOwnProperty.call(a0, kk)) q[kk] = a0[kk]; q.nomeBase = a0.nome; q.nome = a0.nome + " - " + gr.nome; return q; })(am); }
    var II = I(), chk = o.chk || { tubos: [], cotas: [] }, T = D.E.T;
    if (gr) { var pz0 = II.perspectivaDe(c, am, pv); c.yCorte = pz0 ? pz0.yT : null; }
    var d = dadosAmbiente(c, am, pv), tb = tabelasDe(c, d), pontos = pontosDoAmbiente(c, d, pv);
    var hT = K.hTitBloco, gap = K.gapBloco;
    /* cabeçalho do bloco: ambiente + sistemas */
    var sis = []; d.trs.forEach(function (t) { var s = t.sistema === "ventilacao" ? "esgoto" : t.sistema; if (sis.indexOf(s) < 0) sis.push(s); });
    sis.sort(function (a, b) { return ORDEM_SIS.indexOf(a) - ORDEM_SIS.indexOf(b); });
    D.add('<rect x="' + n(A.x) + '" y="' + n(A.y) + '" width="' + n(A.w) + '" height="' + n(hT) + '" fill="' + K.cor.tinta + '" stroke="none"/>');
    D.texto(A.x + 4, A.y + hT / 2, (o.numero ? o.numero + "  " : "") + am.nome, T.titulo * 0.9, { meio: true, cor: "#ffffff", peso: 0.2 });
    D.texto(A.x + A.w - 4, A.y + hT / 2, "HIDROSSANITÁRIO · " + sis.map(function (s) { return (ROT_SIS[s] || s).toUpperCase(); }).join(" · "), 2.4, { meio: true, al: "D", cor: K.cor.areia });
    var body = { x: A.x, y: A.y + hT + gap, w: A.w, h: A.h - hT - gap };
    var cw = (DT ? DT.colunas : K.colunas).map(function (p) { return p * (body.w - 2 * gap); });
    var R1 = { x: body.x, y: body.y, w: cw[0], h: body.h }, R2 = { x: body.x + cw[0] + gap, y: body.y, w: cw[1], h: body.h }, R3 = { x: body.x + cw[0] + cw[1] + 2 * gap, y: body.y, w: cw[2], h: body.h };
    /* coluna 1: planta (60 %) + os pontos com as alturas */
    if (am.semRede) {
      /* R02: ambiente com ponto de utilização lançado mas SEM rede traçada: planta + lista dos pontos a ligar + a pendência por escrito (nada inventado) */
      var Rp = { x: R1.x, y: R1.y, w: R1.w + cw[1] * 0.35, h: R1.h * 0.9 };
      plantaAmbiente(c, D, Rp, am, pv, d, [], chk);
      var xT = R1.x + R1.w + cw[1] * 0.35 + gap, wT = body.x + body.w - xT, yT = R1.y;
      D.texto(xT, yT + 3, "PONTOS DE UTILIZAÇÃO A LIGAR", 3.2, { peso: 0.25, cor: "#c00000" }); yT += 8;
      arr(am.pendentes).forEach(function (q) {
        yT += nota(II, D, xT, yT, wT, q.nome + " - x " + br(q.x, 2) + " m, z " + br(q.z, 2) + " m, altura " + (q.alt >= 0 ? "+" : "") + br(q.alt, 2) + " m do piso acabado.", 2.5, K.cor.grafite) + 1;
        yT += nota(II, D, xT, yT, wT, q.motivo || "Ligação de água fria, esgoto (caixa de gordura) e ventilação ainda não traçada no modelo.", 2.3, "#c00000") + 3;
      });
      D.texto(xT, yT + 3, "NOTAS DE EXECUÇÃO", 2.8, { peso: 0.2, cor: K.cor.tinta }); yT += 8;
      (o.notas || []).forEach(function (t) { yT += nota(II, D, xT, yT, wT, t, K.notaH, K.cor.grafite) + 0.8; });
      c.avisos.push("Ambiente " + am.nome + ": ponto lançado sem rede traçada (pendência de projeto, ver página).");
      return { den: 0, codigos: 0, tubos: 0 };
    }
    var phsV = o.semVista ? [] : paredesDoAmbiente(c, am, pv);
    var fPl = phsV.length ? (DT ? DT.fPlanta : 0.36) : 0.62, fVi = phsV.length ? (DT ? DT.fVista : 0.42) : 0;
    var R1p = { x: R1.x, y: R1.y, w: R1.w, h: R1.h * fPl };
    var pl = plantaAmbiente(c, D, R1p, am, pv, d, pontos, chk);
    var yP = R1.y + R1p.h + 3;
    if (phsV.length) { vistaAmbiente(c, D, { x: R1.x, y: yP, w: R1.w, h: R1.h * fVi }, am, pv, chk, phsV, o); yP += R1.h * fVi + 2; }
    else c.avisos.push("Ambiente " + am.nome + ": sem parede hidráulica com ponto para a vista cotada.");
    D.texto(R1.x + 1, yP + 2.4, "PONTOS E ALTURAS (m do piso acabado)", 2.4, { peso: 0.2, cor: K.cor.tinta }); yP += 5.2;
    var hP = 2.1, maxP = Math.floor((R1.y + R1.h - yP) / (hP * 1.55));
    pontos.slice(0, Math.max(0, maxP)).forEach(function (p, i) {
      var t = (SIGLA[p.sistema === "ventilacao" ? "esgoto" : p.sistema] || "") + "  " + p.nome + "  " + (p.alt >= 0 ? "+" : "") + br(p.alt, 2);
      D.texto(R1.x + 1, yP + hP, t, hP, {}); yP += hP * 1.55;
    });
    if (pontos.length > maxP) c.avisos.push("Ambiente " + am.nome + ": " + (pontos.length - maxP) + " ponto(s) a mais que a lista cabe (ver planta).");
    /* coluna 2: o isométrico 30° com o balão de código */
    isoAmbiente(c, D, R2, am, pv, tb, chk, DT);
    /* coluna 3: tabelas e notas */
    var yy = R3.y;
    yy += tabelaCaderno(c, D, R3.x, yy, R3.w, "TUBOS - " + (am.nomeBase || am.nome), ["Descrição", "Abrev.", "DN (mm)", "Compr. (m)"], d.trs.length ? tb.linhasTb : [], [0.52, 0.12, 0.16, 0.20], { al: ["E", "C", "C", "C"], fs: 1.9 }) + 3;
    yy += tabelaCaderno(c, D, R3.x, yy, R3.w, "CONEXÕES E PEÇAS - " + (am.nomeBase || am.nome), ["Qtd.", "Descrição", "Código"], tb.linhasCx, [0.12, 0.69, 0.19], { al: ["C", "E", "C"] }) + 3;
    /* notas do ambiente (só o que o modelo e o cálculo dizem) */
    var yN = yy, hN = K.notaH, resto = R3.y + R3.h - yN;
    if (resto > 14) {
      D.texto(R3.x + 1, yN + 2.4, "NOTAS DE EXECUÇÃO", 2.4, { peso: 0.2, cor: K.cor.tinta }); yN += 4.4;
      var notas = (o.notas || []).slice();
      notas.forEach(function (t) { if (yN + hN * 1.6 > R3.y + R3.h) return; yN += nota(II, D, R3.x + 1, yN, R3.w - 2, t, hN, K.cor.grafite) + 0.8; });
    }
    if (pl.rotularCg) pl.rotularCg();
    return { den: pl.den, codigos: tb.ordem.length, tubos: d.trs.length };
  }

  /* as notas de execução do ambiente: as NOTAS GERAIS do projeto que valem para qualquer ambiente + o que o ambiente tem */
  function notasDoAmbiente(c, am) {
    var II = I(), out = [];
    arr(am && am.pendentes).forEach(function (q) { if (!am.semRede) out.push("PENDENTE: " + q.nome + " (x " + br(q.x, 2) + " m, z " + br(q.z, 2) + " m, +" + br(q.alt, 2) + " m) - " + (q.motivo || "ligação não traçada no modelo") + "."); });
    out.push("Cotas dos pontos em metros, do piso acabado do pavimento; comprimentos em metros (medidos na rede do modelo).");
    out.push("Os códigos F-n, S-n (balões do isométrico) são os da tabela de conexões; a lista de material do ambiente é a soma dos tubos e peças desenhados.");
    out.push("Esgoto e ventilação conforme a planta de esgoto; conferir caimento e DN nas pranchas HID antes de executar.");
    out.push("* Peça modelada acima do recorte do isométrico (prumo de ventilação interrompido): consta na tabela, não no desenho.");
    out.push("Pontos que o ambiente trouxer em cor vermelha na prancha geral são pendência do projeto: não executar sem a confirmação do responsável técnico.");
    return out;
  }

  /* ------------------------------------------------------------ FOLHA DE PRANCHAS com 2 blocos de ambiente (A1) */
  function folhaAmbientes(c, def) {
    var II = I(), D = c.D, a = c.geo.area, ambs = def.ambientes, pv = def.pv;
    var gap = 6, h1 = (a.h - gap * (ambs.length - 1)) / ambs.length;
    var esc = [];
    ambs.forEach(function (am, i) {
      var A = { x: a.x, y: a.y + i * (h1 + gap), w: a.w, h: h1 };
      var r = blocoAmbiente(c, D, A, am, pv, { numero: def.numeros ? def.numeros[i] : "", chk: c.chk, notas: notasDoAmbiente(c, am), grupo: def.grupos ? def.grupos[i] : null });
      esc.push("1:" + r.den);
    });
    return { escala: "SEM ESCALA / " + esc.join(" ") };
  }

  /* ------------------------------------------------------------ O CADERNO */
  function rodapePag(D, W, H, ctx, tit, pag, tot) {
    D.add('<rect x="0" y="' + n(H - K.rodape) + '" width="' + n(W) + '" height="' + n(K.rodape) + '" fill="' + K.cor.tinta + '" stroke="none"/>');
    D.texto(K.margem, H - K.rodape / 2, "RA ENGENHARIA ESPECIAL LTDA · " + ctx.obra + " · Hidrossanitário " + ctx.rev, 2.6, { meio: true, cor: "#ffffff" });
    D.texto(W / 2, H - K.rodape / 2, tit, 2.8, { meio: true, al: "C", cor: K.cor.areia, peso: 0.18 });
    D.texto(W - K.margem, H - K.rodape / 2, "Página " + pag + " de " + tot, 2.8, { meio: true, al: "D", cor: "#ffffff", peso: 0.18 });
  }
  function svgPagina(W, H, D, tit) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(H) + 'mm" viewBox="0 0 ' + n(W) + " " + n(H) + '" font-family="' + esc(I().FONTE) + '"><title>' + esc(tit) + '</title>' +
      '<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="' + K.cor.offwhite + '"/>' + '<g data-corpo="1">' + D.svg() + "</g></svg>";
  }

  function paginaCapa(c, ctx, E, AP) {
    var W = K.A3[0], H = K.A3[1], D = I().marcarCamadas(new AP.Desenho(E, [])), T = D.E.T;
    D.add('<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="' + K.cor.tinta + '" stroke="none"/>');
    D.add('<rect x="0" y="' + n(H * 0.70) + '" width="' + n(W) + '" height="' + n(H * 0.30) + '" fill="' + K.cor.offwhite + '" stroke="none"/>');
    D.add('<polygon points="0,' + n(H * 0.70) + " " + n(W * 0.34) + "," + n(H * 0.70) + " 0," + n(H * 0.70 + 22) + '" fill="' + K.cor.terracota + '" stroke="none"/>');
    D.texto(K.margem + 6, 40, "RA ENGENHARIA ESPECIAL", 5.5, { cor: K.cor.areia, peso: 0.2 });
    D.texto(K.margem + 6, 110, "CADERNO HIDROSSANITÁRIO", 21, { cor: "#ffffff", peso: 0.5 });
    /* R05: o subtítulo diz só os sistemas que a REDE do modelo tem (pluvial fora da emissão = não aparece) */
    var temS = {}; arr(c.rede && c.rede.trechos).forEach(function (t0) { temS[t0.sistema] = true; });
    var nomesS = [["agua_fria", "água"], ["esgoto", "esgoto"], ["ventilacao", "ventilação"], ["pluvial", "águas pluviais"], ["gas", "gás"]].filter(function (q) { return temS[q[0]] || (q[0] === "agua_fria" && temS.agua_quente); }).map(function (q) { return q[1]; });
    var subS = nomesS.length > 1 ? nomesS.slice(0, -1).join(", ") + " e " + nomesS[nomesS.length - 1] : (nomesS[0] || "água e esgoto");
    D.texto(K.margem + 6, 128, "Instalações de " + subS + " - por ambiente", 6.2, { cor: K.cor.areia, peso: 0.2 });
    D.texto(K.margem + 6, H * 0.70 + 36, ctx.obra.toUpperCase(), 9.5, { cor: K.cor.tinta, peso: 0.35 });
    D.texto(K.margem + 6, H * 0.70 + 48, ctx.local, 4.6, { cor: K.cor.grafite });
    D.texto(K.margem + 6, H * 0.70 + 58, "Proprietário: " + ctx.proprietario, 4.2, { cor: K.cor.grafite });
    D.texto(W - K.margem - 6, H * 0.70 + 36, "Revisão " + ctx.rev, 6, { al: "D", cor: K.cor.terracotaEsc, peso: 0.3 });
    D.texto(W - K.margem - 6, H * 0.70 + 48, ctx.data, 4.6, { al: "D", cor: K.cor.grafite });
    D.texto(W - K.margem - 6, H * 0.70 + 58, ctx.responsavel + (ctx.registro ? " - " + ctx.registro : ""), 3.6, { al: "D", cor: K.cor.grafite });
    if (ctx.status) AP.quebrar(ctx.status, 4.2, W - 2 * K.margem - 12).forEach(function (ln, i) { D.texto(K.margem + 6, H * 0.70 + 76 + i * 6, ln, 4.2, { cor: K.cor.terracotaEsc, peso: 0.3 }); });   /* R04: status da emissão na capa */
    return { D: D, tit: "Capa", W: W, H: H, capa: true };
  }

  function paginaAbertura(c, ctx, E, AP, amb, II, pgAmb) {
    var W = K.A3[0], H = K.A3[1], D = II.marcarCamadas(new AP.Desenho(E, [])), x0 = K.margem, y0 = K.margem, hT = 3.1, hS = 3.4;
    D.texto(x0, y0 + 9, "LEGENDA, SISTEMAS E RESERVATÓRIOS", 8, { cor: K.cor.tinta, peso: 0.32 });
    D.add('<rect x="' + n(x0) + '" y="' + n(y0 + 13) + '" width="70" height="1.2" fill="' + K.cor.terracota + '" stroke="none"/>');
    /* 1) legenda (as mesmas linhas da legenda das pranchas) */
    var itens = II.legendaItens(c.r), y = y0 + 28;
    D.texto(x0, y, "LEGENDA DE SÍMBOLOS", 4, { peso: 0.25, cor: K.cor.tinta }); y += 8;
    itens.forEach(function (it) {
      II.simboloLeg(D, it[0], x0 + 7, y - 0.9);
      var L = quebra(II, it[1], hT, 112);
      L.forEach(function (l, i) { D.texto(x0 + 16, y + i * 4.2, l, hT, {}); });
      y += Math.max(6.4, L.length * 4.2 + 2);
    });
    /* 2) sistemas: números da rede do modelo */
    var xs = x0 + 150, ys = y0 + 28;
    D.texto(xs, ys, "SISTEMAS (rede do modelo)", 4, { peso: 0.25, cor: K.cor.tinta }); ys += 8;
    var por = {};
    arr(c.rede.trechos).forEach(function (t) { var s0 = t.sistema; (por[s0] = por[s0] || { L: 0, n: 0, dn: {} }); por[s0].L += comprimento3d(t); por[s0].n++; por[s0].dn[t.dn] = 1; });
    ORDEM_SIS.concat(Object.keys(por).filter(function (s0) { return ORDEM_SIS.indexOf(s0) < 0; })).forEach(function (s0) {
      if (!por[s0]) return;
      D.linha(xs, ys - 1.2, xs + 10, ys - 1.2, "HID-" + (II.CAMADA_SIS[s0] || "AF") + "-TUBO");
      var dns = Object.keys(por[s0].dn).map(Number).sort(function (a, b) { return a - b; }).join(", ");
      var calc = c.r && c.r.sistemas && c.r.sistemas[s0] && arr(c.r.sistemas[s0].trechos).length;   /* R04: o número do memorial (trechos calculados) + os trechos fora do cálculo (extravasor, limpeza, alimentação e ventilação das caixas d'água) */
      var txtN = calc && calc !== por[s0].n ? (calc + " trecho(s) no cálculo + " + (por[s0].n - calc) + " fora do cálculo (" + (s0 === "agua_fria" ? "extravasor, limpeza, respiro e alimentação das caixas d'água: sem vazão de distribuição" : "sem vazão de projeto") + ")") : por[s0].n + " trecho(s)";
      D.texto(xs + 14, ys, (ROT_SIS[s0] || s0) + ": " + br(por[s0].L, 1) + " m, " + txtN + ", DN " + dns, hS, {}); ys += 6.2;
    });
    /* 3) reservação: o que o cálculo recebeu do modelo (caixas d'água) */
    ys += 6;
    D.texto(xs, ys, "RESERVAÇÃO E ABASTECIMENTO", 4, { peso: 0.25, cor: K.cor.tinta }); ys += 8;
    var rv = arr(c.r && c.r.reservatorios && c.r.reservatorios.modelo);
    if (!rv.length) D.texto(xs, ys, "Sem caixa d'água no modelo.", hS, {});
    rv.forEach(function (q, i) {
      var t = "Caixa " + (i + 1) + " (" + q.id + "): " + (q.volume_L ? q.volume_L + " L" : "volume a informar") + (q.diametro_m ? ", Ø " + br(q.diametro_m, 2) + " m" : "") + (q.ySaida_m != null ? ", saída a " + br(q.ySaida_m, 2) + " m do fundo" : "") + (q.dnEntrada ? ", entrada DN " + q.dnEntrada : "");
      quebra(II, t, hS, 118).forEach(function (l, k) { D.texto(xs, ys + k * 4.4, l, hS, {}); ys += k ? 4.4 : 0; }); ys += 6.2;
    });
    var pop = c.r && c.r.programa && c.r.programa.populacao;
    if (pop && pop.valor) { D.texto(xs, ys, "População de projeto: " + pop.valor + " pessoas (" + txt(arr(pop.passos)[0]).replace(/→.*$/, "").slice(0, 60) + ")", hS, {}); ys += 6.2; }
    /* 4) índice por ambiente */
    var yi = Math.max(y, ys) + 12;
    D.texto(x0, yi, "ÍNDICE POR AMBIENTE", 4.6, { peso: 0.25, cor: K.cor.tinta }); yi += 9;
    amb.forEach(function (a, i) {
      var xx = x0 + (i % 3) * 130, yy = yi + Math.floor(i / 3) * 8;
      D.texto(xx, yy, dois(pgAmb && pgAmb[i] ? pgAmb[i] : i + 3), 4, { cor: K.cor.terracotaEsc, peso: 0.3 });
      D.texto(xx + 11, yy, a.nome, 4, { cor: K.cor.grafite });
    });
    D.texto(x0, H - K.rodape - 12, "Cada página de ambiente traz: planta do ambiente (fundo de arquitetura em meio-tom), alturas dos pontos, isométrico 30° com balões de código, tabelas de tubos e conexões e notas de execução.", 3, { cor: K.cor.cinza });
    return { D: D, tit: "Legenda, sistemas e reservatórios", W: W, H: H };
  }

  function paginaAmbiente(c, ctx, E, AP, am, pv, II, seq, grupo) {
    function ruim(r) { return r.rotuloCota + r.sobreposicoes + r.rotuloTubo; }
    var r1 = paginaAmbiente1(c, ctx, E, AP, am, pv, II, seq, 0, grupo);
    /* R03: se a cota da vista cai sobre um rótulo, refaz a página sem a cadeia vertical e, se preciso, só com a cota horizontal (a conferência de sobreposição manda: zero) */
    if (ruim(r1) > 0) {
      var r2 = paginaAmbiente1(c, ctx, E, AP, am, pv, II, seq, 1, grupo), melhor = ruim(r2) < ruim(r1) ? r2 : r1;
      if (ruim(melhor) > 0) { var r3 = paginaAmbiente1(c, ctx, E, AP, am, pv, II, seq, 2, grupo); if (ruim(r3) < ruim(melhor)) melhor = r3; }
      if (melhor !== r1) c.avisos.push("Ambiente " + am.nome + ": a vista cotada foi simplificada para não colidir com rótulo (nível " + (melhor === r2 ? "1: sem cota vertical" : "2: sem vista") + ").");
      return melhor;
    }
    return r1;
  }
  function paginaAmbiente1(c, ctx, E, AP, am, pv, II, seq, nivel, grupo) {
    var W = K.A3[0], H = K.A3[1], D = II.marcarCamadas(new AP.Desenho(E, [])), chk = { tubos: [], cotas: [] };
    var A = { x: K.margem, y: K.margem, w: W - 2 * K.margem, h: H - 2 * K.margem - K.rodape - 2 };
    var cj = {}; for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) cj[k] = c[k];
    cj.prims = c.prims;
    var r = blocoAmbiente(cj, D, A, am, pv, { numero: dois(seq), chk: chk, notas: notasDoAmbiente(c, am), semCotaV: nivel >= 1, semVista: nivel >= 2, grupo: grupo || null });
    var cx = D.caixas || [], pares = AP.sobreposicoes(cx), cf = II.conferirFolha(cx, chk);
    return { D: D, tit: am.nome + (grupo ? " - " + (grupoPorId(grupo) || {}).nome : ""), W: W, H: H, sobreposicoes: pares.length, pares: pares.slice(0, 5), rotuloTubo: cf.rotuloTubo.length, exTubo: cf.rotuloTubo.slice(0, 4), rotuloCota: cf.rotuloCota.length, info: r, ambiente: am.nome };
  }

  /* ------------------------------------------------------------ PRÉVIA (HIDRO-3D): UMA folha A3 no padrão da Tânia — planta 1:25 + vista cotada à esquerda,
   * isométrico (render do modelo 3D, balões agrupados) à direita, tabelas de tubos e conexões embaixo e o carimbo RA. */
  function carimboRA(D, x, y, w, h, ctx, titulo, escala, folha) {
    var T = D.E.T, c1 = w * 0.30, c3 = w * 0.30, c2 = w - c1 - c3;
    D.add('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="#ffffff" stroke="' + K.cor.tinta + '" stroke-width="0.35"/>');
    D.add('<line x1="' + n(x + c1) + '" y1="' + n(y) + '" x2="' + n(x + c1) + '" y2="' + n(y + h) + '" stroke="' + K.cor.tinta + '" stroke-width="0.25"/>');
    D.add('<line x1="' + n(x + c1 + c2) + '" y1="' + n(y) + '" x2="' + n(x + c1 + c2) + '" y2="' + n(y + h) + '" stroke="' + K.cor.tinta + '" stroke-width="0.25"/>');
    D.add('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(c1) + '" height="' + n(h) + '" fill="' + K.cor.tinta + '" stroke="none"/>');
    D.texto(x + 5, y + 9, "RA ENGENHARIA ESPECIAL LTDA", 4.2, { cor: "#ffffff", peso: 0.3 });
    D.texto(x + 5, y + h - 9, ctx.responsavel + (ctx.registro ? " - " + ctx.registro : ""), 2.2, { cor: "#ffffff" });
    D.texto(x + 5, y + h - 4.5, "Hidrossanitário - " + ctx.rev + " - " + ctx.data, 2.2, { cor: K.cor.areia });
    D.texto(x + c1 + c2 / 2, y + h * 0.42, titulo, 8.6, { al: "C", cor: K.cor.tinta, peso: 0.35 });
    D.texto(x + c1 + c2 / 2, y + h * 0.78, "ESCALA " + escala, 3.2, { al: "C", cor: K.cor.grafite });
    D.texto(x + c1 + c2 + 4, y + 7, "Cliente: " + (ctx.proprietario || "-"), 2.6, { cor: K.cor.grafite });
    D.texto(x + c1 + c2 + 4, y + 13, "Obra: " + ctx.obra, 2.6, { cor: K.cor.grafite });
    D.texto(x + c1 + c2 + 4, y + 19, ctx.local || "", 2.2, { cor: K.cor.cinza });
    D.texto(x + w - 6, y + h - 5, "Folha " + folha, 5.2, { al: "D", cor: K.cor.tinta, peso: 0.3 });
  }
  function paginaPrevia(c, ctx, E, AP, am0, pv, II, grupoId, folhaTxt) {
    var W = K.A3[0], H = K.A3[1], D = II.marcarCamadas(new AP.Desenho(E, [])), chk = { tubos: [], cotas: [] }, gr = grupoPorId(grupoId), DT = K.detalhe;
    var cg = contextoGrupo(c, grupoId), am = {}; for (var kk in am0) if (Object.prototype.hasOwnProperty.call(am0, kk)) am[kk] = am0[kk];
    am.nomeBase = am0.nome; am.nome = am0.nome + " - " + gr.nome;
    var pz0 = II.perspectivaDe(cg, am, pv); cg.yCorte = pz0 ? pz0.yT : null;
    var d = dadosAmbiente(cg, am, pv), tb = tabelasDe(cg, d), pontos = pontosDoAmbiente(cg, d, pv);
    var m = 8, yTab = 190, hCar = 26, yCar = H - m - hCar;
    D.add('<rect x="' + n(m) + '" y="' + n(m) + '" width="' + n(W - 2 * m) + '" height="' + n(H - 2 * m) + '" fill="#ffffff" stroke="' + K.cor.tinta + '" stroke-width="0.5"/>');
    /* esquerda: planta de detalhe 1:25 + vista cotada */
    var phs = paredesDoAmbiente(cg, am, pv).filter(function (ph) { return ph.nPontos >= K.pontosVistaMin; });
    var R1p = { x: m + 3, y: m + 3, w: 150, h: phs.length ? 92 : yTab - m - 6 };
    var viP = c.vistasPlanta && c.rasters ? c.vistasPlanta[(am0.id || am0.nome) + "|" + grupoId] : null, raP = viP && c.rasters ? c.rasters[(am0.id || am0.nome) + "|" + grupoId + "|planta"] : null;
    var pl = viP && raP ? plantaVista(cg, D, R1p, am, pv, d, tb, chk, viP, raP) : plantaAmbiente(cg, D, R1p, am, pv, d, pontos, chk);
    if (pl.vistaRes) chk.vistaPlanta = pl.vistaRes;
    if (phs.length) vistaAmbiente(cg, D, { x: m + 3, y: m + 98, w: 150, h: yTab - m - 100 }, am, pv, chk, phs, {});
    /* direita: o isométrico */
    var R2 = { x: m + 158, y: m + 3, w: W - 2 * m - 161, h: yTab - m - 4 };
    isoAmbiente(cg, D, R2, am, pv, tb, chk, DT);
    /* embaixo: tabelas (tubos à esquerda, conexões à direita) */
    var yy = yTab + 1;
    D.add('<line x1="' + n(m) + '" y1="' + n(yTab - 1) + '" x2="' + n(W - m) + '" y2="' + n(yTab - 1) + '" stroke="' + K.cor.tinta + '" stroke-width="0.3"/>');
    var hTub = tabelaCaderno(cg, D, m + 3, yy, 150, "TUBOS RÍGIDOS - " + am.nomeBase + " (" + gr.nome + ")", ["Descrição", "Abrev.", "DN (mm)", "Compr. (m)"], tb.linhasTb, [0.52, 0.12, 0.16, 0.20], { al: ["E", "C", "C", "C"], fs: 1.9, hl: 3.6 });
    var nc = tb.linhasCx.length, colA = tb.linhasCx.slice(0, Math.ceil(nc / 2)), colB = tb.linhasCx.slice(Math.ceil(nc / 2));
    var wC = (W - 2 * m - 161 - 4) / 2;
    tabelaCaderno(cg, D, R2.x, yy, wC, "CONEXÕES - " + am.nomeBase, ["Qtd.", "Descrição", "Cód."], colA, [0.10, 0.74, 0.16], { al: ["C", "E", "C"], fs: 1.8, hl: 3.6 });
    if (colB.length) tabelaCaderno(cg, D, R2.x + wC + 4, yy, wC, "CONEXÕES - " + am.nomeBase + " (cont.)", ["Qtd.", "Descrição", "Cód."], colB, [0.10, 0.74, 0.16], { al: ["C", "E", "C"], fs: 1.8, hl: 3.6 });
    var yN = yy + hTub + 4;
    D.texto(m + 3, yN + 2.4, "NOTAS", 2.4, { peso: 0.2, cor: K.cor.tinta }); yN += 4.6;
    notasDoAmbiente(c, am0).slice(0, 5).forEach(function (t) { if (yN + 6 < yCar - 2) yN += nota(II, D, m + 3, yN, 148, t, K.notaH, K.cor.grafite) + 0.6; });
    carimboRA(D, m, yCar, W - 2 * m, hCar, ctx, (gr.id === "esgoto" ? "ESGOTO" : gr.nome) + " - " + am.nomeBase, "1:" + (pl.den || 25), folhaTxt || "01 / 01");
    var cx = D.caixas || [], pares = AP.sobreposicoes(cx), cf = II.conferirFolha(cx, chk);
    return { D: D, tit: am.nome, W: W, H: H, sobreposicoes: pares.length, pares: pares.slice(0, 5), rotuloTubo: cf.rotuloTubo.length, exTubo: cf.rotuloTubo.slice(0, 4), rotuloCota: cf.rotuloCota.length, ambiente: am.nome, den: pl.den, tb: tb, nBaloes: chk.nBaloes, nBaloesPecas: chk.nBaloesPecas };
  }
  function previa(resultado, modelo, opcoes) {
    var II = I(); opcoes = opcoes || {};
    if (!II) return { ok: false, paginas: [], avisos: ["HidPranchas não carregou."] };
    var c = II.ctxBase(resultado, modelo, opcoes, "A3"), AP = c.AP, E = c.E, avisos = c.avisos, pv = c.pavs[0];
    c.rasters = opcoes.rasters || null; c.agruparBaloes = true; c.vistasIso = opcoes.vistas || null; c.vistasPlanta = opcoes.vistasPlanta || null;
    var ctx = { obra: txt(opcoes.obra) || "Obra", local: txt(opcoes.local), proprietario: txt(opcoes.proprietario), rev: txt(opcoes.revisao) || "R03", data: txt(opcoes.data) || hoje(), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro) };
    var ambs = ambientesDoModelo(c, pv), alvo = txt(opcoes.ambiente).toUpperCase(), am = null;
    ambs.forEach(function (a) { if (!am && txt(a.nome).toUpperCase() === alvo) am = a; });
    if (!am) return { ok: false, paginas: [], avisos: ["Ambiente não achado: " + alvo + " (" + ambs.map(function (a) { return a.nome; }).join(", ") + ")."] };
    var p = paginaPrevia(c, ctx, E, AP, am, pv, II, opcoes.grupo || "esgoto");
    var svg = svgPagina(p.W, p.H, p.D, "PRÉVIA - " + p.tit + " - " + ctx.rev);
    if (/NaN|undefined/.test(svg.replace(/href="data:[^"]*"/g, ""))) avisos.push("Valor inválido (NaN/undefined) no desenho.");
    if (p.sobreposicoes) avisos.push(p.sobreposicoes + " par(es) de textos sobrepostos (ex.: " + p.pares.slice(0, 3).map(function (q) { return q[0] + " x " + q[1]; }).join("; ") + ").");
    if (p.rotuloTubo) avisos.push(p.rotuloTubo + " rótulo(s) sobre tubo.");
    var imgs = {}; arr(Object.keys(opcoes.rasters || {})).forEach(function (k) { var r = opcoes.rasters[k]; if (r && r.jpeg) imgs[r.key] = { jpeg: r.jpeg, pxW: r.pxW, pxH: r.pxH }; });
    return { ok: true, paginas: [{ numero: "PREVIA-01", titulo: p.tit, tipo: "ambiente", svg: svg }], avisos: avisos, imagensPorChave: imgs, verificacao: { sobreposicoes: p.sobreposicoes, rotuloTubo: p.rotuloTubo, rotuloCota: p.rotuloCota, exTubo: p.exTubo, pares: p.pares }, den: p.den, nBaloes: p.nBaloes, nBaloesPecas: p.nBaloesPecas, rev: ctx.rev };
  }

  function paginaPendencias(c, ctx, E, AP, II, r) {
    var W = K.A3[0], H = K.A3[1], D = II.marcarCamadas(new AP.Desenho(E, [])), x0 = K.margem, y = K.margem + 8;
    D.texto(x0, y, "NOTAS GERAIS, NORMAS E PENDÊNCIAS", 7, { cor: K.cor.tinta, peso: 0.3 }); y += 12;
    var blocos = II.notasDe({ r: r, cfg: c.cfg }), col = 0, yTop = y;
    blocos.forEach(function (b) {
      var itens = arr(b.itens).map(function (it) { return typeof it === "string" ? { t: it } : it; });
      var hh = 7 + itens.length * 6; if (y + Math.min(hh, 40) > H - K.rodape - 8) { col++; y = yTop; }
      var xx = x0 + col * 135;
      D.texto(xx, y, txt(b.titulo), 3.4, { peso: 0.25, cor: /PEND|CONFIRM/i.test(txt(b.titulo)) ? "#c00000" : K.cor.tinta }); y += 6;
      itens.forEach(function (it, i) {
        var L = quebra(II, (i + 1) + "  " + txt(it.t || it.s || it), 2.3, 125);
        L.forEach(function (l, q) { if (y > H - K.rodape - 6) { col++; y = yTop + 6; } D.texto(x0 + col * 135, y, l, 2.3, { cor: it.cor || K.cor.grafite }); y += 3.6; });
        y += 0.8;
      });
      y += 4;
    });
    return { D: D, tit: "Notas gerais, normas e pendências", W: W, H: H };
  }

  function gerar(resultado, modelo, opcoes) {
    var II = I(); opcoes = opcoes || {};
    if (!II) return { ok: false, paginas: [], avisos: ["HidPranchas não carregou (js/hidpranchas.js)."] };
    var c = II.ctxBase(resultado, modelo, opcoes, "A3"), AP = c.AP, E = c.E, avisos = c.avisos, pv = c.pavs[0];
    var ctx = { obra: txt(opcoes.obra) || "Obra", local: txt(opcoes.local), proprietario: txt(opcoes.proprietario), rev: txt(opcoes.revisao) || "R01", data: txt(opcoes.data) || hoje(), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), status: txt(opcoes.statusEmissao) };
    /* R05: com as VISTAS SALVAS do app (render das malhas 3D + balões ligados às peças), cada ambiente × sistema sai como a folha do padrão da Tânia */
    var r3d = !!opcoes.rasters; c.rasters = opcoes.rasters || null; c.agruparBaloes = r3d; c.vistasIso = opcoes.vistas || null; c.vistasPlanta = opcoes.vistasPlanta || null;
    var ambs = ambientesDoModelo(c, pv);
    ambs = juntarPendentes(c, pv, ambs, arr(opcoes.pontosPendentes));
    if (!ambs.length) avisos.push("Nenhum ambiente do modelo com instalação hidráulica: o caderno sai só com a capa e as notas.");
    var pgs = [];
    pgs.push(paginaCapa(c, ctx, E, AP));
    /* HIDRO-3D: uma página por ambiente e GRUPO DE SISTEMA (água, esgoto e ventilação, pluvial, gás); ambiente sem rede traçada = uma página só */
    var fila = [], pgAmb = [];
    ambs.forEach(function (am) {
      var gs = []; try { gs = gruposDoAmbiente(c, am, pv); } catch (eg) { avisos.push("Ambiente " + am.nome + ": grupos de sistema falharam (" + (eg && eg.message) + ")."); }
      pgAmb.push(fila.length + 3);
      if (!gs.length) fila.push({ am: am, g: null }); else gs.forEach(function (g) { fila.push({ am: am, g: g.id }); });
    });
    pgs.push(paginaAbertura(c, ctx, E, AP, ambs, II, pgAmb));
    fila.forEach(function (q, i) { try {
      var chV = (q.am.id || q.am.nome) + "|" + q.g;
      if (r3d && q.g && c.rasters[chV] && c.vistasIso && c.vistasIso[chV]) { var pp = paginaPrevia(c, ctx, E, AP, q.am, pv, II, q.g, dois(i + 1) + " / " + dois(fila.length)); pp.folhaModelo = true; pp.tit = q.am.nome + " - " + (grupoPorId(q.g) || {}).nome; pgs.push(pp); return; }
      if (r3d && q.g) avisos.push("Ambiente " + q.am.nome + " (" + q.g + "): sem vista salva do modelo 3D — página no desenho anterior.");
      pgs.push(paginaAmbiente(c, ctx, E, AP, q.am, pv, II, i + 1, q.g)); } catch (e) { avisos.push("Ambiente " + q.am.nome + ": " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)); } });
    pgs.push(paginaPendencias(c, ctx, E, AP, II, resultado));
    var tot = pgs.length, verif = { sobreposicoes: 0, rotuloTubo: 0, rotuloCota: 0, paginas: [] };
    var paginas = pgs.map(function (p, i) {
      var numero = "CAD-" + dois(i + 1);
      if (!p.capa && !p.folhaModelo) rodapePag(p.D, p.W, p.H, ctx, p.tit.toUpperCase(), i + 1, tot);
      var svg = svgPagina(p.W, p.H, p.D, numero + " - " + p.tit + " - " + ctx.rev);
      if (/NaN|undefined/.test(svg)) avisos.push("Página " + numero + ": valor inválido (NaN/undefined) no desenho.");
      verif.sobreposicoes += p.sobreposicoes || 0; verif.rotuloTubo += p.rotuloTubo || 0; verif.rotuloCota += p.rotuloCota || 0;
      verif.paginas.push({ numero: numero, titulo: p.tit, sobreposicoes: p.sobreposicoes || 0, pares: p.pares || [], rotuloTubo: p.rotuloTubo || 0, exTubo: p.exTubo || [], rotuloCota: p.rotuloCota || 0 });
      if (p.sobreposicoes) avisos.push("Página " + numero + " (" + p.tit + "): " + p.sobreposicoes + " par(es) de textos sobrepostos (ex.: " + (p.pares || []).slice(0, 3).map(function (q) { return q[0] + " x " + q[1]; }).join("; ") + ").");
      if (p.rotuloTubo) avisos.push("Página " + numero + " (" + p.tit + "): " + p.rotuloTubo + " rótulo(s) sobre tubo (ex.: " + (p.exTubo || []).slice(0, 3).map(function (q) { return q[0]; }).join("; ") + ").");
      return { numero: numero, titulo: p.tit, tipo: p.capa ? "capa" : (p.ambiente ? "ambiente" : "geral"), svg: svg };
    });
    var imgs = {}; arr(Object.keys(opcoes.rasters || {})).forEach(function (k) { var rr = opcoes.rasters[k]; if (rr && rr.jpeg) imgs[rr.key] = { jpeg: rr.jpeg, pxW: rr.pxW, pxH: rr.pxH }; });
    return { ok: true, paginas: paginas, ambientes: ambs.map(function (a) { return a.nome; }), avisos: avisos, verificacao: verif, rev: ctx.rev, imagensPorChave: imgs };
  }
  function exportar(r, formato) {
    if (!r || !r.ok) return null;
    if (formato === "svg") return r.paginas.map(function (p) { return { nome: p.numero + " " + p.titulo + ".svg", svg: p.svg }; });
    if (formato === "pdf") { var S = PDFm(); return S ? S.pdf(r.paginas.map(function (p) { return p.svg; }), { titulo: "Caderno hidrossanitário", imagensPorChave: r.imagensPorChave || {} }) : null; }
    return null;
  }

  var HidCaderno = { VERSAO: 1, K: K, gerar: gerar, exportar: exportar, ambientesDoModelo: ambientesDoModelo, blocoAmbiente: blocoAmbiente, previa: previa, vistaIsoTela: vistaIsoTela, vistaPlantaTela: vistaPlantaTela, insumosPlanta: insumosPlanta, pzDaPlanta: pzDaPlanta, pzDaVista: pzDaVista, amDaVista: amDaVista, folhaAmbientes: folhaAmbientes, notasDoAmbiente: notasDoAmbiente, tabelasDe: tabelasDe, dadosAmbiente: dadosAmbiente, GRUPOS: GRUPOS, contextoGrupo: contextoGrupo, gruposDoAmbiente: gruposDoAmbiente };
  global.HidCaderno = HidCaderno;
  if (typeof module !== "undefined" && module.exports) module.exports = HidCaderno;
  /* hid:geometria-fim */
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
