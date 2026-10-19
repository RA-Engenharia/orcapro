/* =====================================================================
 * hidkit.js — PROJETO INTELIGENTE: o KIT de cada aparelho (frente 17/10/2026).
 * Motor PURO, ES5, Node-testável. A tela (js/hidkitui.js) só orquestra.
 *
 * Pedido do Rogério: "Quando ele posicionar o vaso, se é vaso com válvula, já vai
 * ser parametrizado inteligente: já coloca a conexão que entra na parede, que desce
 * lá de cima da laje, dentro da parede, com a válvula, com o tubo, deixa até lá em
 * cima: a prumada já fica pronta."
 *
 *   HidKit.gerar({ estado, avaliarFam, famInst, parametros? })
 *     → { ok, tipo, famInst, ops[], avisos[], pendencias[], decisoes[], fontes[], materiais[], assinatura }
 *   HidKit.reconciliar({ estado, avaliarFam, ops })      ← associativo (mover / apagar / editar à mão)
 *     → [{ acao: "gerar"|"atualizar"|"remover", famInst, ops[], manual: bool, motivo }]
 *   HidKit.aparelhosForcados(ops) → { famInst: aparelho }   (a válvula e a torneira são o PONTO do aparelho)
 *   HidKit.paraCalculo(estado, ops) → estado sem a descida da válvula (trecho de DESCARGA, não rede pressurizada)
 *
 * COMO O KIT É GUARDADO: ops comuns do editor (familia, trecho, acessorio, peca, instancia) com três marcas que o
 * BimEdit.sanear preserva (ele filtra, não reescreve a op): `kit` = id do aparelho, `kitParte` = papel da peça,
 * `kitAss` = assinatura da pose do aparelho quando o kit nasceu. Mexeu no aparelho → a assinatura não bate →
 * o reconciliar refaz o kit; apagou o aparelho → remove o kit; mexeu numa peça do kit À MÃO → o reconciliar
 * devolve manual = true e a tela PERGUNTA antes de sobrescrever (pedido: "a edição manual não é sobrescrita sem perguntar").
 *
 * ⚠ NENHUM número de norma ou de altura aqui (tools/test-hid-sem-numero-magico.js): alturas vêm de
 *   js/hidkitdados.js (dados-fonte/hidro/kits, Tigre p.40 conferida com o Deca) ou do conector da própria família;
 *   DN e UHC do HidNormas. Os números com "hid:ok" são geometria de desenho (folgas, toco embutido), os mesmos do
 *   HidRota.GEO e trocáveis em `parametros`.
 * ⚠ Faltou altura/DN com fonte → pendência com a chave; a peça que dependia dela NÃO nasce com número inventado.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function DADOS() { return dep("HidKitDados", "./hidkitdados.js"); }
  function HF() { return dep("HidFamilias", "./hidfamilias.js"); }
  function CAT() { return dep("HidCatalogo", "./hidcatalogo.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var CASAS = 10000;   // hid:ok o biminst grava 4 casas (0,1 mm)
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var EPS = 1e-6;      // hid:ok tolerância numérica
  var CM = 100;        /* cm por m */

  /* ⚠ GEOMETRIA DE DESENHO (não é norma): o que não vier em parametros sai do HidRota.GEO (mesmos números do
     traçado, um lugar só) — e o que for assumido entra nas decisões, para o memorial dizer. */
  var GEO_KIT = {
    folgaValvula: 0.08,    // hid:ok vão entre o fim do tubo que chega na válvula e o começo da descida dela (corpo da válvula)
    lateralChuveiro: 0.10, // hid:ok perna lateral da espera do chuveiro (o ramal desce ao lado do tubo que sobe ao chuveiro)
    margemTopo: 0.03,      // hid:ok o tubo de espera para abaixo da laje/forro (não fura sem projeto)
    afastRaloParede: 0.15, // hid:ok ralo do box nunca encostado na parede (porta-grelha + rodapé)
    raioRaloExistente: 0.60 // hid:ok ralo/caixa que o usuário já pôs a até 60 cm do ponto do ralo do box = o ralo do box (a área de um box)
  };
  /* as peças de esgoto que fazem o papel do ralo do box (o usuário pode ter posto qualquer uma delas à mão) */
  var RALOS_BOX = { ralo_seco: 1, ralo_sifonado: 1, caixa_sifonada: 1 };
  function geo(par, k) {
    if (par && par[k] != null && isFinite(Number(par[k]))) return Number(par[k]);
    var G = (HR() && HR().GEO) || {};
    if (G[k] != null) return G[k];
    return GEO_KIT[k];
  }

  /* ------------------------------------------------------------ DADOS */
  function kits() { var D = DADOS(); return (D && D.kits) || {}; }
  function decisaoTxt(id) { var D = DADOS(); return D && D.decisoes ? D.decisoes[id] || "" : ""; }
  var TIPO_DA_FAM = null, ANCORAS = null;
  /* o kit da família; a ÂNCORA (máquina de lavar) é uma família de outro tipo escolhida pelo nome do produto
     (a torneira "Tanque/Máquina" posta pelo usuário é o ponto da máquina) */
  function tipoDaFamilia(famId, tipoId) {
    if (!TIPO_DA_FAM) { TIPO_DA_FAM = {}; ANCORAS = []; var K = kits(); Object.keys(K).forEach(function (k) { arr(K[k].familias).forEach(function (f) { TIPO_DA_FAM[f] = k; }); if (K[k].ancora) ANCORAS.push({ kit: k, familia: K[k].ancora.familia, re: new RegExp(K[k].ancora.tipoNome, "i") }); }); }
    if (TIPO_DA_FAM[famId]) return TIPO_DA_FAM[famId];
    if (tipoId != null) for (var i = 0; i < ANCORAS.length; i++) if (ANCORAS[i].familia === famId) { var t = tipoFam(famId, null, tipoId); if (t && ANCORAS[i].re.test(txt(t.nome))) return ANCORAS[i].kit; }
    return null;
  }
  /* altura do ponto (m acima do piso acabado) pela sigla da tabela da Tigre — com a fonte; sem a linha, pendência */
  function altura(sigla) {
    var D = DADOS(), A = D && D.alturas;
    if (!A || !A.fonte || !A.fonte.doc) return { ok: false, chave: "altura." + sigla, motivo: "tabela de alturas dos pontos não carregada (js/hidkitdados.js)" };
    var cols = arr(A.colunas), iS = cols.indexOf("sigla"), iH = cols.indexOf("altura_cm"), iP = cols.indexOf("ponto"), iD = cols.indexOf("descricao_fonte");
    var l = arr(A.dados).filter(function (x) { return x[iS] === sigla; })[0];
    if (!l || !(num(l[iH], NaN) > 0)) return { ok: false, chave: "altura." + sigla, motivo: "a tabela de alturas (" + A.fonte.doc + ") não tem a sigla " + sigla };
    var conf = arr(A.conferencias).filter(function (c) { return c.sigla === sigla; });
    return { ok: true, valor: num(l[iH], 0) / CM, ponto: l[iP], descricao: l[iD], fonte: { doc: A.fonte.doc, pagina: A.fonte.pagina, tabela: A.fonte.tabela, tipo: A.fonte.tipo },
             conferencias: conf.map(function (c) { return c.com + (c.concorda ? " — concorda" : " — difere (" + c.valor_cm + " cm)"); }) };
  }

  /* ALTURA PADRÃO DE INSTALAÇÃO (colocação, 19/10/2026): a cota da ORIGEM da família acima do piso acabado, quando ela entra
     no modelo. Os números ficam em dados-fonte/hidro/kits/alturas-instalacao.json (sigla da tabela da Tigre, altura de catálogo
     ou referência de mercado, sempre com a fonte). Devolve { ok, valor (m), piso, origem, fonte, texto }; { ok:false, motivo }
     quando a família é sem padrão (de teto, de boia…) e { ok:false, semFicha:true } quando ela não está na tabela. */
  function alturaInstalacao(famId, nomeTipo) {
    var D = DADOS(), I = D && D.instalacao, F = I && I.familias ? I.familias[famId] : null;
    if (!F) return { ok: false, semFicha: true, motivo: "família " + txt(famId) + " sem altura padrão de instalação" };
    if (F.piso) return { ok: true, valor: 0, piso: true, origem: "piso", texto: txt(F.piso), fonte: null };
    var rs = arr(F.regras), r = null, i;
    for (i = 0; i < rs.length && !r; i++) { if (!rs[i].tipo || new RegExp(rs[i].tipo, "i").test(txt(nomeTipo))) r = rs[i]; }
    if (!r) return { ok: false, semFicha: true, motivo: "o produto " + txt(nomeTipo) + " não tem regra de altura padrão (" + txt(famId) + ")" };
    if (r.sem_padrao) return { ok: false, motivo: r.sem_padrao };
    if (r.sigla) {
      var a = altura(r.sigla);
      return a.ok ? { ok: true, valor: a.valor, piso: false, origem: txt(F.origem), sigla: r.sigla, fonte: a.fonte, texto: a.descricao + " — " + a.fonte.doc.split(",")[0] + ", p." + a.fonte.pagina } : { ok: false, motivo: a.motivo };
    }
    var f = r.bancada ? ((I.bancadas || {})[r.bancada] || {}).fonte : r.fonte, h = r.bancada ? ((I.bancadas || {})[r.bancada] || {}).altura_cm : r.altura_cm;
    if (!(h > 0) || !f) return { ok: false, motivo: "regra de altura sem número ou sem fonte (" + txt(famId) + ")" };
    return { ok: true, valor: h / CM, piso: false, origem: txt(F.origem), fonte: f, texto: f.doc.split(":")[0] + (f.tipo === "referencia_de_mercado" ? " (referência de mercado)" : "") };
  }

  /* a linha da Tabela 3 da NBR 8160 (es.aparelhos) do aparelho: o mictório depende do TIPO DE DESCARGA da instância
     (válvula, caixa, automática, calha; padrão declarado = válvula); os demais usam o próprio nome */
  function aparelhoEsDe(tipo, inst) {
    if (tipo !== "mictorio") return null;
    var HEk = dep("HidES", "./hides.js"), md = HEk && HEk.mictorioDe ? HEk.mictorioDe(inst || {}) : null;
    return md ? md.aparelho : null;
  }

  /* --------------------------------------------------- GEOMETRIA DO APARELHO */
  function famDe(estado, id) { return arr(estado && estado.familias).filter(function (f) { return String(f.id) === String(id); })[0] || null; }
  function avaliar(avaliarFam, fi) { try { return typeof avaliarFam === "function" ? avaliarFam(fi.famId, fi.tipoId, fi.inst) : null; } catch (e) { return null; } }
  function conectores(avaliarFam, fi, pose) {
    var av = avaliar(avaliarFam, fi); if (!av) return [];
    var p = pose || fi;
    return BI().conectoresDe(av, { id: fi.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY }).map(function (k) { k.cid = String(k.id).split(":").slice(1).join(":"); return k; });
  }
  function porCid(cs, cid) { return cs.filter(function (k) { return k.cid === cid; })[0] || null; }
  function porSis(cs, s) { return cs.filter(function (k) { return k.sistema === s; })[0] || null; }
  /* do local da família para o mundo (o mesmo giro do biminst/three) */
  function mundo(p, lx, ly, lz) { var c = Math.cos(num(p.rotY, 0)), s = Math.sin(num(p.rotY, 0)); return { x: r4(num(p.x, 0) + lx * c + lz * s), y: r4(num(p.y, 0) + ly), z: r4(num(p.z, 0) - lx * s + lz * c) }; }
  /* a normal que ENTRA na parede, na pose (o Z local sai da parede) */
  function normalParede(p) { var c = Math.cos(num(p.rotY, 0)), s = Math.sin(num(p.rotY, 0)); return { x: r4(-s), z: r4(-c) }; }
  function tangente(n) { return { x: -n.z, z: n.x }; }
  function eixo(pt, n, e, y) { return { x: r4(pt.x + n.x * e), y: r4(y == null ? pt.y : y), z: r4(pt.z + n.z * e) }; }

  /* --------------------------------------------------- PISO / TETO
   * piso = a base do aparelho de piso (caixa y0 ≈ 0 na origem); senão a base da parede onde ele encosta; senão o
   * ambiente do BIM que o contém; senão a base do aparelho de piso mais perto. Sem nada: pendência. */
  function paredes(estado) {
    return arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede"; }).map(function (c) {
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, alt = num(c.altura, 0);
      return { id: c.id, c: c, p1: { x: c.cx - h * cs, z: c.cz + h * sn }, p2: { x: c.cx + h * cs, z: c.cz - h * sn }, esp: num(c.espessura, 0), base: c.cy - alt / 2, topo: c.cy + alt / 2 };
    });
  }
  function distSeg(p, a, b) { var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); var qx = a.x + dx * t, qz = a.z + dz * t; return Math.sqrt((p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz)); }
  /* a parede em que o ponto encosta (face a ≤ meia espessura + tolerância), na faixa de cota dela */
  function paredeDe(estado, p, y) {
    var tol = geo(null, "tolFace"), melhor = null, dm = Infinity;
    /* ⚠ PRÉDIO (etapa 3): a parede do pavimento de baixo termina na cota em que a de cima começa — com a mesma planta as
       duas "encostavam" no ponto. A cota decide: vale a parede que CONTÉM y no intervalo [base, topo); a tolerância só
       desempata quando nenhuma contém */
    var fora0 = 2;   // hid:ok 0 = contém, 1 = só pela tolerância
    paredes(estado).forEach(function (w) {
      var d = distSeg(p, w.p1, w.p2) - w.esp / 2; if (!(Math.abs(d) <= tol + EPS)) return;
      if (y != null && !(y >= w.base - tol && y <= w.topo + tol)) return;
      var fora = y == null || (y >= w.base - EPS && y < w.topo - EPS) ? 0 : 1;
      if (fora < fora0 || (fora === fora0 && Math.abs(d) < dm)) { fora0 = fora; dm = Math.abs(d); melhor = w; }
    });
    return melhor;
  }
  function dentroPoli(p, pts) { var dentro = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) dentro = !dentro; } return dentro; }
  function ambienteDe(estado, p) { return arr(estado && estado.ambientes).filter(function (a) { return a && a.calc && arr(a.calc.contorno).length >= 3 && dentroPoli(p, a.calc.contorno); })[0] || null; }   // hid:ok polígono tem 3+ vértices
  /* aparelho DE PISO = o corpo começa exatamente na origem (bacia, lavatório de coluna, tanque); o chuveiro e a torneira
     têm o corpo abaixo da origem (haste, canopla) e não servem de piso */
  var TOL_PISO = 0.001;   // hid:ok 1 mm
  /* ⚠ a peça que a colocação SOBE (mictório, torneira, válvula…) tem a origem acima do piso: não marca o piso */
  function aoPiso(av, f) {
    if (f) { var h = alturaInstalacao(f.famId, nomeDoTipo(f)); if (h.ok && !h.piso) return false; }
    return !!(av && av.caixa && isFinite(av.caixa.y0) && Math.abs(av.caixa.y0) <= TOL_PISO);
  }
  function nomeDoTipo(f) { var t = tipoFam(f.famId, null, f.tipoId); return t ? t.nome : ""; }
  function d2(a, b) { var dx = num(a.x, 0) - num(b.x, 0), dz = num(a.z, 0) - num(b.z, 0); return Math.sqrt(dx * dx + dz * dz); }
  function pisoDe(estado, avaliarFam, fi, ponto) {
    var av = avaliar(avaliarFam, fi);
    if (aoPiso(av, fi)) return { ok: true, y: r4(num(fi.y, 0)), origem: "base do próprio aparelho (de piso)" };
    var amb = ambienteDe(estado, fi);
    if (amb && isFinite(num(amb.calc.base, NaN))) return { ok: true, y: r4(num(amb.calc.base, 0)), origem: "base do ambiente " + (amb.nome || amb.id) };
    var w = ponto ? paredeDe(estado, ponto, num(fi.y, null)) : null;   /* a cota do aparelho escolhe o pavimento (prédio) */
    if (w) return { ok: true, y: r4(w.base), origem: "base da parede " + w.id };
    var yF = num(fi.y, 0), viz = arr(estado && estado.familias).filter(function (f) { var yv = num(f.y, 0); return f.id !== fi.id && aoPiso(avaliar(avaliarFam, f), f) && yv <= yF + EPS && yF - yv < geo(null, "peDireito"); })
      .sort(function (a, b) { return d2(a, fi) - d2(b, fi); })[0];
    if (viz && d2(viz, fi) <= geo(null, "raioAmbiente")) return { ok: true, y: r4(num(viz.y, 0)), origem: "base do aparelho de piso " + viz.id + " (mesmo ambiente)" };
    return { ok: false, motivo: "não achei o piso do aparelho " + fi.id + " (sem parede, ambiente ou louça de piso perto)" };
  }
  GEO_KIT.raioAmbiente = 4.0;   // hid:ok raio para achar o piso por um aparelho vizinho (m)
  /* teto do ponto de espera: o fundo da laje logo acima; sem laje, o topo da parede; sem nada, o pé-direito do traçado */
  function tetoDe(estado, p, piso) {
    var lajes = arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "laje"; }), melhor = null;
    lajes.forEach(function (c) {
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, hw = num(c.espessura, 0) / 2, xs = [], zs = [];
      [[-h, -hw], [h, -hw], [h, hw], [-h, hw]].forEach(function (q) { xs.push(c.cx + q[0] * cs + q[1] * sn); zs.push(c.cz - q[0] * sn + q[1] * cs); });
      var fundo = c.cy - num(c.altura, 0) / 2;
      if (p.x >= Math.min.apply(null, xs) - EPS && p.x <= Math.max.apply(null, xs) + EPS && p.z >= Math.min.apply(null, zs) - EPS && p.z <= Math.max.apply(null, zs) + EPS &&
          fundo > piso + geo(null, "peDireito") / 2 && (!melhor || fundo < melhor.y)) melhor = { y: fundo, origem: "fundo da laje " + c.id };
    });
    if (melhor) return melhor;
    var w = paredeDe(estado, p, piso + geo(null, "peDireito") / 2);   /* a parede DESTE pavimento (prédio) */
    if (w && w.topo > piso + EPS) return { y: w.topo, origem: "topo da parede " + w.id };
    return { y: piso + geo(null, "peDireito"), origem: "pé-direito assumido de " + f2(geo(null, "peDireito")) + " m (sem laje nem parede no modelo — informe o do projeto)", assumido: true };
  }

  /* --------------------------------------------------- NORMA (DN) */
  function dnEsgoto(ctx, aparelho, conector, pend) {
    var c = ctx.consulta("es.aparelhos", { aparelho: aparelho }, "dn_min", "kit: " + aparelho);
    if (c.ok) return { dn: num(c.valor, 0), fonte: c.fonte };
    if (conector && conector.dn > 0) return { dn: conector.dn, fonte: { doc: "conector da família (catálogo)" } };
    pend.push({ chave: "es.aparelhos[" + aparelho + "].dn_min", motivo: "DN do ramal de descarga de " + aparelho + " sem tabela nem DN no conector", elementos: [] });
    return null;
  }
  /* DN do sub-ramal de água: tabela da norma (af.aparelhos.dn_min / af.aparelhos); sem ela, o DN do conector; sem nada,
     o padrão do material COM pendência (o dimensionamento acerta) */
  function dnAgua(ctx, aparelho, conector, pend) {
    var c = ctx.consulta("af.aparelhos.dn_min", { aparelho: aparelho }, "dn_min", "kit: " + aparelho);
    if (!c.ok) c = ctx.consulta("af.aparelhos", { aparelho: aparelho }, "dn_min", "kit: " + aparelho);
    if (c.ok) return num(c.valor, 0);
    if (conector && conector.dn > 0) return conector.dn;
    pend.push({ chave: "af.aparelhos.dn_min[" + aparelho + "]", motivo: "DN do sub-ramal de " + aparelho + " sem tabela nem DN no ponto: usado o padrão do PVC soldável — rode o dimensionamento", elementos: [] });
    return BI().MATERIAIS.pvc_soldavel.dn;
  }
  /* DN do tubo soldável que recebe a bitola da válvula (rosca do catálogo → DE soldável pela tabela da NBR 5648 do biminst) */
  function deDaBitola(bitola) {
    var R = (BI().BITOLA_REF || {}).pvc_soldavel || {}, ach = null;
    Object.keys(R).forEach(function (de) { if (R[de] === bitola) ach = num(de, null); });
    return ach;
  }
  function bitolaDoTipo(tipo) {
    var C = CAT(), v = (tipo && tipo.valores) || {};
    var it = C && C.porCodigo && v.Fabricante && v.Codigo ? C.porCodigo(v.Fabricante, v.Codigo) : null;
    if (it && it.dados && it.dados.bitola_pol) return { bitola: String(it.dados.bitola_pol), fonte: v.Fabricante + " " + v.Codigo + (it.pagina ? " (p." + it.pagina + ")" : "") };
    var m = /\((\d+(?:\s\d\/\d)?|\d\/\d)\s*pol\)/i.exec(txt(tipo && tipo.nome));
    return m ? { bitola: m[1], fonte: "nome do produto no catálogo (" + txt(tipo.nome) + ")" } : null;
  }
  function tipoFam(famId, regex, tipoId) {
    var f = HF() && HF().porId ? HF().porId(famId) : null; if (!f) return null;
    if (tipoId != null) return arr(f.tipos).filter(function (x) { return x.id === tipoId; })[0] || null;
    var t = regex ? arr(f.tipos).filter(function (x) { return regex.test(txt(x.nome)); })[0] : null;
    return t || arr(f.tipos)[0] || null;
  }

  /* --------------------------------------------------- OPS (com as marcas do kit) */
  function Construtor(fi, tipo, ass) {
    var ops = [], pref = "k" + fi.id + "-";
    function marca(o, parte) { o.kit = String(fi.id); o.kitParte = parte; o.kitAss = ass; o.kitTipo = tipo; return o; }
    return {
      ops: ops, pref: pref,
      trecho: function (suf, sis, mat, dn, p1, p2, parte, extra) {
        var o = { op: "trecho", id: pref + suf, sistema: sis, material: mat, dn: dn, p1: { x: r4(p1.x), y: r4(p1.y), z: r4(p1.z) }, p2: { x: r4(p2.x), y: r4(p2.y), z: r4(p2.z) } };
        Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
        ops.push(marca(o, parte)); return o;
      },
      familia: function (suf, famId, tipoId, p, rotY, parte) { var o = { op: "familia", id: pref + suf, famId: famId, tipoId: tipoId, x: r4(p.x), y: r4(p.y), z: r4(p.z), rotY: r4(num(rotY, 0)), inst: {} }; ops.push(marca(o, parte)); return o; },
      acessorio: function (suf, famId, tipoId, trecho, p, parte) { var o = { op: "acessorio", id: pref + suf, famId: famId, tipoId: tipoId, trecho: trecho.id, novoId: trecho.id + "b", x: r4(p.x), y: r4(p.y), z: r4(p.z), comprimento: BI().ACESSORIO_PADRAO }; ops.push(marca(o, parte)); return o; },
      peca: function (suf, peca, p, parte) { var o = { op: "peca", id: pref + suf, peca: peca, sistema: "esgoto", x: r4(p.x), y: r4(p.y), z: r4(p.z) }; ops.push(marca(o, parte)); return o; },
      instancia: function (y, parte) { var o = { op: "instancia", id: fi.id, y: r4(y) }; ops.push(marca(o, parte)); return o; }
    };
  }
  /* assinatura da pose: o que, mudando, refaz o kit */
  function assinatura(fi, y) { return [fi.famId, fi.tipoId, r4(num(fi.x, 0)), r4(y != null ? y : num(fi.y, 0)), r4(num(fi.z, 0)), r4(num(fi.rotY, 0))].join("|"); }

  /* ESPERA DE ÁGUA: toco do ponto (face) ao eixo embutido e o tubo embutido subindo/descendo até a cota do ramal.
     É PROVISÓRIA (kitParte "espera"): o "Ligar ambiente" a troca pelo traçado completo do ambiente. */
  function esperaAgua(K, suf, ponto, n, e, yRamal, dn) {
    if (!n) return null;
    var A = eixo(ponto, n, e);
    K.trecho(suf + "-t", "agua_fria", "pvc_soldavel", dn, ponto, A, "espera");
    if (Math.abs(yRamal - ponto.y) > geo(null, "margemNo")) return K.trecho(suf + "-v", "agua_fria", "pvc_soldavel", dn, A, eixo(ponto, n, e, yRamal), "espera", { continua: "p2" });
    return null;
  }
  /* ESPERA DE ESGOTO: saída de piso desce até o ramal sob o piso; saída de parede vai ao eixo embutido e desce. Provisória. */
  function esperaEsgoto(K, suf, ponto, n, e, piso, dn) {
    var yFim = r4(piso - geo(null, "alturaEnchimento") / 2), mat = "pvc_esgoto";
    if (n) {
      /* o toco de parede já sai com a declividade mínima do DN (biminst + HidNormas): nada nasce com aviso de inclinação */
      var A = eixo(ponto, n, e), i = BI().declMinDn("esgoto", dn) / 100, yA = Math.floor((ponto.y - i * e) * CASAS - EPS) / CASAS;
      K.trecho(suf + "-t", "esgoto", mat, dn, ponto, { x: A.x, y: yA, z: A.z }, "espera");
      return K.trecho(suf + "-v", "esgoto", mat, dn, { x: A.x, y: yA, z: A.z }, eixo(ponto, n, e, yFim), "espera", { continua: "p2" });
    }
    return K.trecho(suf + "-v", "esgoto", mat, dn, ponto, { x: ponto.x, y: yFim, z: ponto.z }, "espera", { continua: "p2" });
  }

  /* ======================================================= GERAR O KIT */
  function gerar(e) {
    e = e || {};
    var estado = e.estado || {}, avaliarFam = e.avaliarFam, par = e.parametros || {}, fi = famDe(estado, e.famInst);
    var out = { ok: false, tipo: null, famInst: e.famInst, ops: [], avisos: [], pendencias: [], decisoes: [], fontes: [], materiais: [], assinatura: null };
    function pend(chave, motivo, acao) { out.pendencias.push({ chave: chave, motivo: motivo, texto: motivo, elementos: [String(e.famInst)], acao: acao || null }); }
    function aviso(t, acao) { out.avisos.push({ texto: t, elementos: [String(e.famInst)], acao: acao || null }); }
    function decide(id, extra) { out.decisoes.push({ id: id, texto: decisaoTxt(id) + (extra ? " " + extra : "") }); }
    function fonteAlt(a) { if (a && a.ok && !out.fontes.some(function (f) { return f.doc === a.fonte.doc; })) out.fontes.push(a.fonte); }
    if (!fi) { pend("kit.aparelho", "aparelho " + e.famInst + " não está no modelo"); return out; }
    var tipo = e.tipo || tipoDaFamilia(fi.famId, fi.tipoId), K0 = kits()[tipo];
    out.tipo = tipo;
    if (!K0) { pend("kit.tipo", "a família " + fi.famId + " não tem kit (não é aparelho sanitário conhecido)"); return out; }
    if (K0.semFicha) { pend(K0.semFicha, "sem ficha/família para o kit de " + K0.nome); return out; }
    var ctx = NN().contexto(), cs = conectores(avaliarFam, fi);
    var e0 = geo(par, "embutir");
    /* ponto de parede de referência: a normal que ENTRA na parede (do conector, ou da pose) */
    var refPt = cs.filter(function (k) { return k.parede; })[0] || null;
    var n = refPt ? { x: refPt.parede.x, z: refPt.parede.z } : normalParede(fi);
    function emb(k) { return e0 + Math.max(0, num(k && k.parede && k.parede.d, 0)); }
    var P = pisoDe(estado, avaliarFam, fi, refPt);
    if (!P.ok) { pend("kit.piso", P.motivo, { tipo: "parametro", campo: "piso" }); return out; }
    var piso = P.y, yRamalAlt = altura("RG");
    if (!yRamalAlt.ok) pend(yRamalAlt.chave, yRamalAlt.motivo);
    var yRamal = yRamalAlt.ok ? r4(piso + yRamalAlt.valor) : null;
    var poseY = num(fi.y, 0), K;

    /* ---------------- CHUVEIRO: a altura do ponto é a do kit (move o aparelho para lá) */
    /* ⚠ ao REFAZER o kit (o aparelho mudou) a altura que está no modelo manda: se o usuário mudou a cota do chuveiro à mão,
       o kit acompanha — não devolve o chuveiro para a altura da tabela (edição manual não se sobrescreve) */
    if (K0.agua && (K0.agua.tipo === "chuveiro" || K0.agua.tipo === "ancora") && e.manterAltura) { var aCH = altura(K0.agua.altura); fonteAlt(aCH); }
    else if (K0.agua && (K0.agua.tipo === "chuveiro" || K0.agua.tipo === "ancora")) {
      var aCH = altura(K0.agua.altura); fonteAlt(aCH);
      if (!aCH.ok) { pend(aCH.chave, aCH.motivo); return out; }
      var cf = porCid(cs, K0.agua.conector || "af") || porSis(cs, "agua_fria");
      if (!cf) { pend("kit.conector", fi.id + " não tem ponto de água fria"); return out; }
      /* o conector na pose final: y do aparelho tal que o PONTO fique em piso + CH */
      var dyCon = cf.y - poseY;
      poseY = r4(piso + aCH.valor - dyCon);
    }
    out.assinatura = assinatura(fi, poseY);
    K = Construtor(fi, tipo, out.assinatura);
    if (Math.abs(poseY - num(fi.y, 0)) > EPS) { K.instancia(poseY, "altura"); cs = conectores(avaliarFam, fi, { x: fi.x, y: poseY, z: fi.z, rotY: fi.rotY }); }
    var esg = porCid(cs, (K0.esgoto || {}).conector || "esgoto") || porSis(cs, "esgoto");

    /* ---------------- ÁGUA */
    var A0 = K0.agua || {};
    if (A0.tipo === "valvula") {
      /* BACIA COM VÁLVULA: válvula na parede (VD), ramal EXCLUSIVO subindo embutido até a laje/forro (espera do barrilete),
         registro de gaveta (RG) nesse ramal e a DESCIDA da saída da válvula até o tubo de ligação da bacia (BS) */
      var ponto = porCid(cs, "af") || porSis(cs, "agua_fria"), aVD = altura(A0.altura), aRG = altura(A0.registro), aBS = altura("BS");
      [aVD, aRG, aBS].forEach(fonteAlt);
      if (!ponto) pend("kit.conector", "a bacia " + fi.id + " não tem o ponto do tubo de ligação");
      else if (!aVD.ok) pend(aVD.chave, aVD.motivo);
      else {
        var tv = tipoFam(A0.familia, null);
        if (!tv) pend("kit.familia." + A0.familia, "família da válvula de descarga (" + A0.familia + ") não carregada");
        else {
          var bit = bitolaDoTipo(tv), de = bit ? deDaBitola(bit.bitola) : null;
          if (!de) { pend("kit.valvula.bitola", "bitola da válvula " + txt(tv.nome) + " sem correspondência com o PVC soldável (NBR 5648) — informe o DN"); de = null; }
          var nV = ponto.parede ? { x: ponto.parede.x, z: ponto.parede.z } : n, eV = emb(ponto), yv = r4(piso + aVD.valor);
          var faceV = { x: ponto.x, y: yv, z: ponto.z };
          var vop = K.familia("vd", A0.familia, tv.id, faceV, fi.rotY, "valvula");
          var T = tetoDe(estado, faceV, piso), yTop = r4(T.y - geo(par, "margemTopo"));
          if (T.assumido) aviso("ponto de espera da válvula no " + T.origem, { tipo: "parametro", campo: "peDireito" });
          if (de) {
            var Av = eixo(faceV, nV, eV);
            K.trecho("vd-toco", "agua_fria", "pvc_soldavel", de, Av, faceV, "valvula");
            var sobe = K.trecho("vd-ramal", "agua_fria", "pvc_soldavel", de, { x: Av.x, y: yTop, z: Av.z }, Av, "valvula", { continua: "p1" });
            if (aRG.ok && piso + aRG.valor > yv + geo(par, "margemNo") && piso + aRG.valor < yTop - geo(par, "margemNo")) K.acessorio("vd-rg", "ra-registro-gaveta", "acabamento", sobe, { x: Av.x, y: r4(piso + aRG.valor), z: Av.z }, "valvula");
            else if (aRG.ok) aviso("registro de gaveta da válvula não coube entre a válvula (" + f2(yv) + " m) e a espera (" + f2(yTop) + " m): ponha à mão");
            /* descida (DESCARGA, depois da válvula) até o ponto do tubo de ligação da bacia */
            var yDesc = r4(yv - geo(par, "folgaValvula")), Ab = eixo(ponto, nV, eV);
            if (yDesc > ponto.y + geo(par, "margemNo")) {
              K.trecho("vd-desc", "agua_fria", "pvc_soldavel", de, { x: Ab.x, y: yDesc, z: Ab.z }, Ab, "descida", { continua: "p1" });
              K.trecho("vd-desct", "agua_fria", "pvc_soldavel", de, Ab, { x: ponto.x, y: ponto.y, z: ponto.z }, "descida");
            }
            out.materiais.push({ item: "Válvula de descarga " + txt(tv.nome), fonte: bit ? bit.fonte : "" });
            out.materiais.push({ item: "Tubo PVC soldável DE " + de + " (bitola " + bit.bitola + "): ramal exclusivo e descida da válvula", fonte: "NBR 5648 (DE × referência, biminst)" });
          }
          decide("kit.valvula.ponto", "Válvula " + txt(tv.nome) + " a " + f2(aVD.valor) + " m (" + aVD.fonte.doc.split(",")[0] + ", p." + aVD.fonte.pagina + (aVD.conferencias.length ? "; " + aVD.conferencias.join("; ") : "") + ").");
          decide("kit.valvula.ramal_exclusivo", "Espera em " + f2(yTop) + " m (" + T.origem + ").");
          if (aRG.ok) decide("kit.valvula.registro", "Registro a " + f2(aRG.valor) + " m.");
          decide("kit.valvula.descida", "Ponto da bacia a " + f2(ponto.y - piso) + " m (conector da família)" + (aBS.ok ? "; Tigre BS = " + f2(aBS.valor) + " m" : "") + ".");
          out.pontoAgua = { famInst: vop.id, aparelho: "bacia_valvula" };
        }
      }
    } else if (A0.tipo === "ponto") {
      var pa = porCid(cs, A0.conector || "af") || porSis(cs, "agua_fria");
      if (!pa) pend("kit.conector", fi.id + " sem ponto de água fria na família");
      else if (yRamal != null) {
        var dnA = dnAgua(ctx, tipo, pa, out.pendencias);
        esperaAgua(K, "af", pa, pa.parede ? { x: pa.parede.x, z: pa.parede.z } : n, emb(pa), yRamal, dnA);
        decide("kit.ponto.familia", "Água a " + f2(pa.y - piso) + " m do piso (conector da família)" + (A0.engate ? "; engate flexível da caixa acoplada (acessório da louça)" : "") + ".");
        if (A0.engate) out.materiais.push({ item: "Engate flexível (ligação da caixa acoplada ao ponto)", fonte: "acessório da bacia" });
      }
    } else if (A0.tipo === "chuveiro") {
      /* CHUVEIRO: ponto em CH; tubo embutido descendo até o registro de pressão (RP); a espera sai pela lateral,
         abaixo do registro (o ramal desce até ela ao lado do tubo que sobe) */
      var pc = porCid(cs, A0.conector || "af") || porSis(cs, "agua_fria"), aRP = altura(A0.registro); fonteAlt(aRP);
      if (!aRP.ok) pend(aRP.chave, aRP.motivo);
      else if (pc) {
        var nC = pc.parede ? { x: pc.parede.x, z: pc.parede.z } : n, eC = emb(pc), Ac = eixo(pc, nC, eC), yRP = r4(piso + aRP.valor);
        var Lacc = BI().ACESSORIO_PADRAO, yBase = r4(yRP - Lacc / 2 - geo(par, "margemNo"));
        var tg = tangente(nC), outros = arr(e.vizinhos);
        if (outros.length) { var cx = 0, cz = 0; outros.forEach(function (v) { cx += v.x; cz += v.z; }); cx /= outros.length; cz /= outros.length; if ((cx - Ac.x) * tg.x + (cz - Ac.z) * tg.z < 0) tg = { x: -tg.x, z: -tg.z }; }
        var dnC = dnAgua(ctx, "chuveiro", pc, out.pendencias);
        K.trecho("ch-toco", "agua_fria", "pvc_soldavel", dnC, Ac, pc, "chuveiro");
        var desce = K.trecho("ch-sobe", "agua_fria", "pvc_soldavel", dnC, { x: Ac.x, y: yBase, z: Ac.z }, Ac, "chuveiro");
        K.acessorio("ch-rp", "ra-registro-pressao", "acabamento", desce, { x: Ac.x, y: yRP, z: Ac.z }, "chuveiro");
        var Lt = geo(par, "lateralChuveiro"), E = { x: r4(Ac.x + tg.x * Lt), y: yBase, z: r4(Ac.z + tg.z * Lt) };
        K.trecho("ch-espera", "agua_fria", "pvc_soldavel", dnC, { x: Ac.x, y: yBase, z: Ac.z }, E, "chuveiro", { continua: "p2" });
        out.esperaChuveiro = E;
        decide("kit.chuveiro.altura", "Ponto a " + f2(aCH.valor) + " m (" + aCH.fonte.doc.split(",")[0] + ", p." + aCH.fonte.pagina + ").");
        decide("kit.chuveiro.registro", "Registro de pressão a " + f2(aRP.valor) + " m; espera lateral a " + f2(Lt) + " m.");
        out.materiais.push({ item: "Registro de pressão com acabamento (chuveiro)", fonte: "kit" });
      }
    } else if (A0.tipo === "ancora") {
      /* MÁQUINA: a torneira de tanque/máquina posta pelo usuário é o ponto — já levada à altura MLR acima */
      var pm = porSis(cs, "agua_fria");
      if (pm && yRamal != null) esperaAgua(K, "mq-af", pm, pm.parede ? { x: pm.parede.x, z: pm.parede.z } : n, emb(pm), yRamal, dnAgua(ctx, tipo, pm, out.pendencias));
      out.pontoAgua = { famInst: fi.id, aparelho: tipo };
      decide("kit.torneira.altura", "Ponto da máquina a " + f2(aCH.valor) + " m (" + aCH.fonte.doc.split(",")[0] + ", p." + aCH.fonte.pagina + ").");
    } else if (A0.tipo === "torneira") {
      /* PIA / TANQUE / MÁQUINA: torneira de parede na altura da tabela, sobre o eixo do aparelho */
      var aT = altura(A0.altura); fonteAlt(aT);
      if (!aT.ok) pend(aT.chave, aT.motivo);
      else {
        var rx = tipo === "pia_cozinha" ? /Cozinha de Parede/i : /Tanque|M[áa]quina|Jardim/i, tt = tipoFam(A0.familia, rx);
        if (!tt) pend("kit.familia." + A0.familia, "família de torneira (" + A0.familia + ") não carregada");
        else {
          var base = esg && esg.parede ? esg : null, nT = base ? { x: base.parede.x, z: base.parede.z } : n;
          /* a face da parede atrás do aparelho, sobre o eixo dele (o ponto de esgoto de parede marca a face) */
          var face = base ? { x: base.x, z: base.z } : (function () { var av = avaliar(avaliarFam, fi), z0 = av && av.caixa ? av.caixa.z0 : 0; return mundo(fi, 0, 0, z0); })();
          var pt = { x: r4(face.x), y: r4(piso + aT.valor), z: r4(face.z) };
          var top = K.familia("tn", A0.familia, tt.id, pt, fi.rotY, "torneira");
          if (yRamal != null) {
            var csT = conectores(avaliarFam, { id: top.id, famId: top.famId, tipoId: top.tipoId, inst: {}, x: pt.x, y: pt.y, z: pt.z, rotY: top.rotY }), pT = porSis(csT, "agua_fria") || pt;
            esperaAgua(K, "tn-af", { x: pT.x, y: pT.y, z: pT.z }, nT, e0, yRamal, dnAgua(ctx, tipo, pT, out.pendencias));
          }
          out.pontoAgua = { famInst: top.id, aparelho: tipo };
          decide("kit.torneira.altura", "Torneira " + txt(tt.nome) + " a " + f2(aT.valor) + " m (" + aT.fonte.doc.split(",")[0] + ", p." + aT.fonte.pagina + ").");
        }
      }
    }

    /* ---------------- ESGOTO */
    var E0 = K0.esgoto || {};
    if (E0.tipo === "saida_piso" || E0.tipo === "saida_parede") {
      if (!esg) pend("kit.conector", fi.id + " sem ponto de esgoto na família");
      else {
        var aparelhoNorma = tipo === "bacia_valvula" ? "bacia_valvula" : (tipo === "bacia_caixa_acoplada" ? "bacia_caixa_acoplada" : tipo);
        /* mictório: a linha da Tabela 3 da NBR 8160 sai do TIPO DE DESCARGA (propriedade da instância; padrão declarado no HidES) */
        if (tipo === "mictorio") {
          var HEk = dep("HidES", "./hides.js"), mdK = HEk && HEk.mictorioDe ? HEk.mictorioDe(fi.inst) : null;
          if (mdK) { aparelhoNorma = mdK.aparelho; decide("kit.mictorio.descarga", mdK.texto + "."); }
          else pend("mictorio.tipo_descarga", "mictório: informe o tipo de descarga (válvula, caixa ou automática) — a NBR 8160 dá UHC e DN diferentes");
        }
        var d = dnEsgoto(ctx, aparelhoNorma, esg, out.pendencias);
        if (d) {
          esperaEsgoto(K, "es", esg, esg.parede ? { x: esg.parede.x, z: esg.parede.z } : null, emb(esg), piso, d.dn);
          if (tipo === "bacia_valvula" || tipo === "bacia_caixa_acoplada") decide("kit.esgoto.bacia", "DN " + d.dn + " (" + (d.fonte && d.fonte.norma ? d.fonte.norma : (d.fonte && d.fonte.doc) || "") + ").");
          else if (E0.destino === "caixa_gordura") decide("kit.esgoto.caixa_gordura");
          else if (E0.destino === "caixa_sifonada") decide("kit.esgoto.caixa_sifonada", "Ramal de descarga DN " + d.dn + ".");
        }
      }
    } else if (E0.tipo === "ralo_box" || E0.tipo === "ralo_piso") {
      /* ralo seco no box, sob o crivo (projeção do braço da família) — afastado da parede */
      var av2 = avaliar(avaliarFam, fi), cx2 = E0.tipo === "ralo_box" && av2 ? av2.caixa : null, prof = cx2 ? Math.max(num(cx2.z1, 0), geo(par, "afastRaloParede")) - (num(cx2.x1, 0) - num(cx2.x0, 0)) / 2 : geo(par, "afastRaloParede");
      prof = Math.max(prof, geo(par, "afastRaloParede"));
      var pr = mundo(fi, 0, 0, prof); pr.y = piso;
      /* NÍVEL AUTOMÁTICO (js/hidnivel.js): a grelha no piso ACABADO no ponto (box rebaixado, contrapiso + revestimento) */
      var HNk = dep("HidNivel", "./hidnivel.js"); if (HNk) pr.y = HNk.em(estado, pr, piso, par).y;
      /* REAPROVEITA (18/10/2026, "Traçar automaticamente"): o ralo ou a caixa sifonada que o usuário JÁ pôs no box faz o papel
         do ralo — o kit não põe outro por cima. Só peça do usuário: não a deste kit (prefixo) nem a gerada por outro kit,
         ambiente ou rede (e.gerados) — senão, ao refazer, o kit "aproveitava" a própria peça velha que está saindo. */
      var gerados = e.gerados || {}, jaTem = arr(estado.instalacoes && estado.instalacoes.pecas).filter(function (k) {
        return k && k.sistema === "esgoto" && RALOS_BOX[k.peca] && String(k.id).indexOf(K.pref) !== 0 && !gerados[String(k.id)] &&
          d2(k, pr) <= geo(par, "raioRaloExistente") && Math.abs(num(k.y, 0) - pr.y) <= geo(par, "margemNo") * 2;
      }).sort(function (a, b) { return d2(a, pr) - d2(b, pr); })[0];
      /* a caixa/o ralo posto como FAMÍLIA (do OrçaPRO ou da biblioteca do escritório) também vale (HidAmbiente.tipoDisp) */
      var HAk = dep("HidAmbiente", "./hidambiente.js");
      if (!jaTem && HAk && HAk.dispositivosFamilia) jaTem = HAk.dispositivosFamilia(estado).filter(function (q) {
        return RALOS_BOX[q.tipo] && !gerados[q.id] && d2(q.f, pr) <= geo(par, "raioRaloExistente") && Math.abs(num(q.f.y, 0) - pr.y) <= geo(par, "margemNo") * 2;
      }).map(function (q) { return { id: q.id, peca: q.tipo, x: num(q.f.x, 0), y: num(q.f.y, 0), z: num(q.f.z, 0) }; }).sort(function (a, b) { return d2(a, pr) - d2(b, pr); })[0];
      if (jaTem) { out.raloExistente = String(jaTem.id); decide("kit.ralo.existente", "Aproveita " + ((BI().PECAS[jaTem.peca] || {}).nome || jaTem.peca).toLowerCase() + " " + jaTem.id + " já colocado (a " + f2(d2(jaTem, pr)) + " m do ponto do ralo): nenhum ralo novo."); }
      else {
        K.peca("ralo", E0.peca || "ralo_seco", pr, "ralo");
        if (E0.tipo === "ralo_box") decide("kit.chuveiro.ralo", "Ralo a " + f2(prof) + " m da parede.");
        else decide("kit.maquina.esgoto");
      }
      if (E0.pendente) pend(E0.pendente, "altura da espera do esgoto de " + K0.nome + ": sem fonte no acervo — o ralo do piso recebe a descarga (confira com o manual da máquina)");
    }
    arr(K0.pendencias).forEach(function (pp) { pend(pp, pp === "mictorio.tipo_descarga" ? "mictório: informe o tipo de descarga (válvula, caixa ou automática) — a NBR 8160 dá UHC e DN diferentes" : pp); });
    ctx.pendencias().forEach(function (p) { pend(p.chave, p.motivo); });
    ctx.normas().forEach(function (f) { out.fontes.push(f); });
    out.ops = K.ops;
    out.ok = !!K.ops.length;
    out.piso = piso; out.pisoOrigem = P.origem;
    return out;
  }

  /* =========================================== ASSOCIATIVO: o que mudou desde o kit */
  function achatar(ops) { var o = []; arr(ops).forEach(function (x) { if (x && x.op === "lote") arr(x.ops).forEach(function (y) { if (y && y.op !== "lote") o.push(y); }); else if (x) o.push(x); }); return o; }
  /* os kits gravados: { famInst: { ids:{}, ass, tipo, criados:[ids], posicao } } — o kit mais RECENTE de cada aparelho manda
     (um "atualizar" apaga o anterior e grava outro com a mesma marca) */
  function kitsDoModelo(ops) {
    var lista = achatar(ops), kits = {}, apagados = {};
    lista.forEach(function (o, i) {
      /* ⚠ o "apagar" do próprio kit (ao refazer) leva a marca kit, sem assinatura: não é peça do kit (antes zerava o registro) */
      if (o.op === "apagar") { if (o.id != null) apagados[o.id] = i; return; }
      if (o.kit == null || !o.kitParte) return;
      var k = kits[o.kit] || (kits[o.kit] = { famInst: String(o.kit), ids: {}, ordem: [], ass: o.kitAss, tipo: o.kitTipo, ultimo: i });
      if (o.kitAss !== k.ass) { k.ids = {}; k.ordem = []; k.ass = o.kitAss; }
      k.ultimo = i;
      if (o.op !== "instancia") { k.ids[o.id] = { op: o.op, parte: o.kitParte, i: i }; k.ordem.push(o.id); if (o.op === "acessorio" && o.novoId != null) k.ids[o.novoId] = { op: "trecho", parte: o.kitParte, i: i, novo: true }; }
    });
    /* o que o usuário mexeu À MÃO depois do kit (op sem marca de kit/ambiente tocando uma peça do kit) */
    Object.keys(kits).forEach(function (f) {
      var k = kits[f]; k.vivos = k.ordem.filter(function (id) { return !(apagados[id] > k.ids[id].i); });
      k.manual = lista.some(function (o, i) {
        if (i <= k.ultimo || o.kit != null || o.amb != null) return false;
        var alvo = o.id != null && k.ids[o.id] ? o.id : (o.trecho != null && k.ids[o.trecho] ? o.trecho : null);
        return alvo != null && ["instAlterar", "mover", "apagar", "acessorio", "instancia"].indexOf(o.op) >= 0;
      });
      /* acessórios do usuário vivos num tubo deste kit (removidos ao refazer, antes do tubo) */
      k.acUsuario = [];
      lista.forEach(function (o, i) {
        if (o.op !== "acessorio" || o.kit != null || o.amb != null || o.id == null || o.trecho == null) return;
        if (!k.ids[o.trecho] || k.ids[o.trecho].op !== "trecho" || apagados[o.id] > i || apagados[o.trecho] > i) return;
        k.acUsuario.push(o.id);
      });
    });
    return kits;
  }
  /* as ops que tiram o kit: acessórios primeiro (devolvem o tubo inteiro), depois tubos, peças e famílias */
  function opsRemover(k) {
    /* JUNÇÃO 18/10/2026: o `.filter` estava DEPOIS do "// hid:ok" (virou comentário) — a metade nova do tubo dividido
       pelo acessório do kit entrava na lista de apagar; o apagar do acessório já a emenda de volta */
    var ordem = { acessorio: 0, trecho: 1, peca: 2, familia: 3 }, ids = k.vivos.filter(function (id) { return !k.ids[id].novo; });   // hid:ok ordem de remoção (acessório devolve o tubo inteiro)
    /* o acessório que o USUÁRIO inseriu num tubo do kit sai primeiro (emenda o tubo); sem isto a metade e o registro
       ficavam soltos depois de refazer o kit (COLOCAÇÃO × PROJETO INTELIGENTE) */
    var doUsuario = arr(k.acUsuario).map(function (id) { return { op: "apagar", id: id, kit: k.famInst, kitParte: "remover" }; });
    return doUsuario.concat(ids.sort(function (a, b) { return ordem[k.ids[a].op] - ordem[k.ids[b].op]; }).map(function (id) { return { op: "apagar", id: id, kit: k.famInst, kitParte: "remover" }; }));
  }
  function reconciliar(e) {
    e = e || {};
    var estado = e.estado || {}, ks = kitsDoModelo(e.ops), out = [], porId = {}, gerados = {};
    arr(estado.familias).forEach(function (f) { porId[String(f.id)] = f; });
    /* as peças que o projeto inteligente gerou (kit, ambiente, rede, prédio): o kit não as "aproveita" como ralo do usuário */
    achatar(e.ops).forEach(function (o) { if (o && o.id != null && (o.kit != null || (o.amb != null && o.ambParte !== "reaproveitada") || o.rede != null || o.predio != null)) gerados[String(o.id)] = 1; });
    Object.keys(ks).forEach(function (f) {
      var k = ks[f], fi = porId[f];
      if (!k.vivos.length) return;
      if (!fi) { out.push({ acao: "remover", famInst: f, ops: opsRemover(k), manual: k.manual, motivo: "o aparelho " + f + " foi apagado" }); return; }
      var assAgora = assinatura(fi), mesmaPose = k.ass === assAgora;
      if (mesmaPose) return;
      var g = gerar({ estado: estado, avaliarFam: e.avaliarFam, famInst: f, parametros: e.parametros, vizinhos: e.vizinhos ? e.vizinhos(f) : null, manterAltura: true, gerados: gerados });
      /* o kit novo pode mover o aparelho (chuveiro na altura CH): se a pose ATUAL já é a pose que o kit pede, nada mudou */
      if (g.assinatura === k.ass) return;
      out.push({ acao: "atualizar", famInst: f, ops: opsRemover(k).concat(g.ops), manual: k.manual, motivo: "o aparelho " + f + " mudou (posição, giro ou tipo)", kit: g });
    });
    if (e.novos) arr(e.novos).forEach(function (f) {
      if (ks[f] && ks[f].vivos.length) return;
      var fi = porId[f]; if (!fi || !tipoDaFamilia(fi.famId, fi.tipoId)) return;
      var g = gerar({ estado: estado, avaliarFam: e.avaliarFam, famInst: f, parametros: e.parametros, vizinhos: e.vizinhos ? e.vizinhos(f) : null, gerados: gerados });
      if (g.ops.length) out.push({ acao: "gerar", famInst: f, ops: g.ops, manual: false, motivo: "aparelho novo", kit: g });
    });
    return out;
  }

  /* ============================================ CÁLCULO: o que o dimensionamento lê do kit
     A válvula e a torneira da pia/tanque são o PONTO DE UTILIZAÇÃO do aparelho (a pressão mínima da peça é na
     entrada dela); a descida da válvula é DESCARGA (depois da válvula), não rede pressurizada. */
  function aparelhosForcados(ops) {
    var o = {}, K = kits();
    achatar(ops).forEach(function (x) {
      if (x.op === "instancia" && x.kit != null && K[x.kitTipo] && K[x.kitTipo].ancora) { o[x.kit] = x.kitTipo; return; }
      if (x.op !== "familia" || x.kit == null) return;
      if (x.kitParte === "valvula") o[x.id] = "bacia_valvula";
      else if (x.kitParte === "torneira" && K[x.kitTipo]) o[x.id] = x.kitTipo;
    });
    return o;
  }
  /* o ramal exclusivo e a descida da válvula ficam na BITOLA DA VÁLVULA (catálogo): o cálculo verifica e não reduz
     (reduzir para DE 40 deixava a válvula de 1 1/2" ligada num tubo menor que a rosca dela) */
  function travados(ops) { var o = []; achatar(ops).forEach(function (x) { if (x.kit != null && x.op === "trecho" && (x.kitParte === "valvula" || x.kitParte === "descida")) { o.push(x.id); o.push(x.id + "b"); } }); return o; }
  function idsDescida(ops) { var s = {}; achatar(ops).forEach(function (x) { if (x.kit != null && x.kitParte === "descida" && x.op === "trecho") s[x.id] = 1; }); return s; }
  function paraCalculo(estado, ops) {
    var fora = idsDescida(ops); if (!Object.keys(fora).length || !estado || !estado.instalacoes) return estado;
    var e2 = {}; Object.keys(estado).forEach(function (k) { e2[k] = estado[k]; });
    var inst = {}; Object.keys(estado.instalacoes).forEach(function (k) { inst[k] = estado.instalacoes[k]; });
    inst.trechos = arr(estado.instalacoes.trechos).filter(function (t) { return !fora[t.id]; });
    e2.instalacoes = inst;
    return e2;
  }
  /* as decisões automáticas que o memorial descreve (kits vivos + ambientes ligados) */
  function decisoesDoModelo(estado, avaliarFam, ops) {
    var ks = kitsDoModelo(ops), out = [];
    Object.keys(ks).forEach(function (f) {
      if (!ks[f].vivos.length || !famDe(estado, f)) return;
      var g = gerar({ estado: estado, avaliarFam: avaliarFam, famInst: f });
      out.push({ famInst: f, tipo: g.tipo, nome: (kits()[g.tipo] || {}).nome || g.tipo, decisoes: g.decisoes, pendencias: g.pendencias, fontes: g.fontes });
    });
    return out;
  }

  var HidKit = {
    VERSAO: 1, GEO_KIT: GEO_KIT,
    kits: kits, tipoDaFamilia: tipoDaFamilia, altura: altura, alturaInstalacao: alturaInstalacao, aparelhoEsDe: aparelhoEsDe, gerar: gerar, reconciliar: reconciliar, kitsDoModelo: kitsDoModelo, achatar: achatar,
    aparelhosForcados: aparelhosForcados, paraCalculo: paraCalculo, travados: travados, decisoesDoModelo: decisoesDoModelo, assinatura: assinatura,
    _int: { pisoDe: pisoDe, tetoDe: tetoDe, paredeDe: paredeDe, paredes: paredes, conectores: conectores, deDaBitola: deDaBitola, bitolaDoTipo: bitolaDoTipo, ambienteDe: ambienteDe, geo: geo }
  };
  global.HidKit = HidKit;
  if (typeof module !== "undefined" && module.exports) module.exports = HidKit;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
