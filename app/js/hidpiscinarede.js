/* =====================================================================
 * hidpiscinarede.js — PISCINA: LANÇAMENTO AUTOMÁTICO (motor PURO, ES5, Node-testável). Frente PISCINA, 18/10/2026.
 *
 *   HidPiscinaRede.gerar({ estado, avaliarFam, ops, piscina (id da op hidPiscina), parametros })
 *     → { ok, ops (o LOTE: tira o que esta piscina gerou antes e põe casa de máquinas, equipamentos, dispositivos e
 *         tubos), geometria, dim (HidPiscina.dimensionar com os comprimentos REAIS), casa, dispositivos[], linhas[],
 *         avisos[] (com Corrigir), pendencias[], decisoes[], verificacoes[] }
 *   HidPiscinaRede.melhorCasa(geo, estado, avaliarFam, parametros) → o lugar da casa de máquinas (o "Corrigir" usa).
 *
 * COMO MONTA (a ordem importa):
 *  1. a geometria do tanque (HidPiscina.daOp: o volume do modelo manda) e um 1º dimensionamento (quantidades e DN);
 *  2. a CASA DE MÁQUINAS: tamanho pelos equipamentos (filtro, bomba, bomba da hidro, quadro, barrilete) com a medida do
 *     catálogo; lugar = o da op (o usuário arrastou) ou o MELHOR (fora do tanque e da obra, de frente para a piscina,
 *     mais perto dela e da casa); nível = AFOGADA (a bomba abaixo do nível da água) quando o parâmetro deixa;
 *  3. os DISPOSITIVOS: coadeiras e aspiração no lado da casa de máquinas (ou a favor do vento: o vento empurra a sujeira
 *     para a parede de JUSANTE e a coadeira fica nela), retornos no lado OPOSTO (a água atravessa o tanque), 2 ralos de
 *     fundo no ponto mais fundo a ≥ 1,5 m, bocais de hidro no trecho escolhido (padrão: a parede da ponta rasa) com a
 *     sucção da hidro em par, refletores, botão de emergência a ≥ 2 m da borda e o acionador pneumático;
 *  4. os TUBOS: cada dispositivo sai pela parede até a vala (fora do tanque), e da vala à casa de máquinas o caminho é
 *     o A* ortogonal do js/hidrota.js (HidRota._int.aEstrela) numa grade de 10 cm, desviando do tanque, da casa de
 *     máquinas, das vigas/pilares/famílias do modelo e dos tubos já traçados (linhas lado a lado); retornos e bocais
 *     em linha com derivação (tê) em cada um; dentro da casa: barrilete com um registro por linha, bomba, filtro, saída
 *     do retorno, descarte; aquecimento solar até o telhado (ou a bomba de calor ao lado da casa) em derivação;
 *  5. a conferência com os comprimentos e conexões REAIS: a altura manométrica, a bomba na curva e o NPSH/autoescorva
 *     com a cota real da bomba. Não atende → AVISO com Corrigir (voltar a casa ao melhor lugar, afogar a bomba, trocar).
 * ⚠ Nenhum número de norma aqui: vêm do HidPiscina/HidNormas. Os "hid:ok" são GEOMETRIA/critério de desenho, declarados e
 *   trocáveis em parametros.geo (afastamentos, folgas, passo da grade, recobrimento da vala).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function HP() { return dep("HidPiscina", "./hidpiscina.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function HPF() { return dep("HidPiscinaFam", "./hidpiscinafam.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  (function () { var R = dep("BimInstPiscina", "./biminstpiscina.js"); if (R && R.registrar) R.registrar(); })();
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var EPS = 1e-6;   // hid:ok
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function add(p, v, k) { return { x: p.x + v.x * k, z: p.z + v.z * k }; }

  /* ⚠ GEOMETRIA / CRITÉRIO DE DESENHO (não é norma nem manual) — trocável em parametros.geo, declarado no memorial */
  var GEO = {
    paredePiscina: 0.20,     // hid:ok espessura da parede do tanque (o estrutural define)
    afastTubo: 0.20,         // hid:ok do lado de fora da parede do tanque ao eixo da vala (parede + isto = 4 passos da grade)
    recobrimento: 0.40,      // hid:ok do deck ao eixo do tubo enterrado (mínimo; a vala desce abaixo da saída da coadeira)
    abaixoCoadeira: 0.10,    // hid:ok a vala fica abaixo da saída da coadeira (sucção sem ponto alto)
    camadaRetorno: 0.12,     // hid:ok retorno/hidro/aquecimento numa camada acima da sucção (nunca se cruzam na mesma cota)
    passo: 0.10,             // hid:ok grade da vala (tubos lado a lado a 10 cm)
    margemGrade: 2.5,        // hid:ok a grade cobre o tanque + a casa + esta margem
    afastCasa: 1.0,          // hid:ok do lado de fora do tanque à parede da casa de máquinas (melhor lugar)
    espacoEquip: 0.30,       // hid:ok entre equipamentos na casa de máquinas
    margemCasa: 0.30,        // hid:ok dos equipamentos às paredes da casa
    faixaBarrilete: 0.45,    // hid:ok faixa do barrilete junto à parede da frente (registros)
    circulacao: 0.60,        // hid:ok circulação na casa (residencial privativa; as outras usam o acesso da norma)
    folgaTopo: 0.40,         // hid:ok do topo do equipamento mais alto à laje
    afogamento: 0.30,        // hid:ok o eixo da bomba fica este tanto ABAIXO do nível da água (afogada)
    espCasa: 0.12,           // hid:ok parede/laje da casa (= padrão da família)
    passoSlot: 0.15,         // hid:ok entre as entradas de tubo na parede da casa
    recuoRalo: 0.80,         // hid:ok do ralo de fundo à parede da ponta funda
    folgaRalos: 0.10,        // hid:ok os ralos ficam a distância mínima da norma + esta folga
    profHidro: 0.40,         // hid:ok bocal de hidro abaixo do nível da água (a conferir com o fabricante)
    profSuccaoHidro: 0.60,   // hid:ok sucção da hidro abaixo do nível da água
    profRefletor: 0.50,      // hid:ok refletor abaixo do nível da água (a conferir com o fabricante)
    espacoHidro: 0.40,       // hid:ok espaço mínimo entre bocais de hidro na parede
    espacoDisp: 0.50,        // hid:ok entre dispositivos na mesma parede
    bordaAcionador: 0.30,    // hid:ok acionador pneumático a esta distância da borda
 trechoDerivacao: 0.45,  // hid:ok trecho do retorno que recebe as duas derivações do aquecimento
    custoLaje: 3,            // hid:ok peso de passar sob a obra (a vala prefere o jardim)
    custoCurva: 0.3,         // hid:ok peso de cada curva (menos joelhos)
    custoCruzar: 6,          // hid:ok peso de cruzar um tubo de outra camada
    maxEstados: 400000       // hid:ok teto da busca A*
  };
  function geo(par, k) { var g = par && par.geo; return g && g[k] != null && isFinite(Number(g[k])) ? Number(g[k]) : GEO[k]; }

  /* ================================================ RETÂNGULO GIRADO */
  function ret(cx, cz, ux, uz, hl, hw) { return { cx: cx, cz: cz, ux: ux, uz: uz, hl: hl, hw: hw }; }
  function dentroRet(o, x, z, inf) { var dx = x - o.cx, dz = z - o.cz, u = dx * o.ux + dz * o.uz, v = -dx * o.uz + dz * o.ux; return Math.abs(u) <= o.hl + inf + EPS && Math.abs(v) <= o.hw + inf + EPS; }
  /* distância de um ponto ao polígono (borda) */
  function distSeg(p, a, b) { var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); return d2(p, { x: a.x + dx * t, z: a.z + dz * t }); }
  function distPoligono(P, p) { var m = Infinity; for (var i = 0; i < P.length; i++) m = Math.min(m, distSeg(p, P[i], P[(i + 1) % P.length])); return m; }

  /* ================================================ CATÁLOGO → instância da família */
  function cat(tipo) { return HP().catalogo(tipo); }
  /* bitola de rosca da conexão do produto → DE do PVC soldável: a MESMA conversão do motor (HidPiscina.deConexao, pela BimInst.BITOLA_REF) */
  function deDaConexao(pol) { return HP().deConexao(pol); }
  function mm(v) { return v == null || !isFinite(Number(v)) ? null : Number(v) / 1000; }
  function prodTxt(it) { return it ? it.fabricante + " " + it.codigo : ""; }

  /* ================================================ CASA DE MÁQUINAS: tamanho e equipamentos (frame local) */
  /* hid:geometria-inicio — tolerância de posição (m) */
  var TOL_POS = 0.005;
  /* hid:geometria-fim */
  /* as verificações do que foi LANÇADO: número e profundidade dos dispositivos, sucção segura, drenos, separações, acessórios */
  function verificarLancado(out, c) {
    var H = HP(), N = NN(), ctx = c.ctx, D = c.D || {}, P = function (ch, k, uso) { return H._int.param(ctx, ch, k, uso); };
    function v(id, nome, valor, limite, unidade, ok, fonte, obs) { out.verificacoes.push({ id: id, nome: nome, valor: valor, limite: limite, unidade: unidade || "", ok: ok, status: ok === true ? "atende" : (ok === false ? "nao_atende" : "pendente"), fonte: fonte || "", obs: obs || "" }); }
    var tipos = function (t) { return c.disps.filter(function (d) { return d.tipo === t; }); };
    var ret = tipos("retorno"), co = tipos("coadeira"), asp = tipos("aspiracao");
    if (D.retornos != null) v("pisc.retornos.numero", "Bocais de retorno lançados", ret.length, "≥ " + D.retornos + " (1 a cada 50 m² ou 50 m³, o maior; mínimo 2)", "un", ret.length >= D.retornos, H.fonteTxt("pisc.bocal_retorno"));
    var pMin = P("pisc.bocal_retorno", "profundidade_min_abaixo_na_m", "retornos");
    if (ret.length && pMin != null) {
      var rasos = ret.filter(function (d) { return c.yA - d.y < pMin - TOL_POS; }), fundo = c.g.profRasa;
      var cabe = fundo == null || fundo > pMin + TOL_POS;
      v("pisc.retornos.profundidade", "Retornos abaixo do nível da água", f2(Math.min.apply(null, ret.map(function (d) { return c.yA - d.y; }))), "≥ " + f2(pMin), "m", rasos.length ? (cabe ? false : null) : true, H.fonteTxt("pisc.bocal_retorno"), cabe ? "" : "o tanque não tem altura para os 0,30 m em toda parte (a norma admite: 'quando a altura permitir')");
    }
    if (D.coadeiras != null) v("pisc.coadeiras.numero", "Coadeiras lançadas", co.length, "≥ " + D.coadeiras + " (1 a cada 25 m² ou 50 m² pela tipologia)", "un", co.length >= D.coadeiras, H.fonteTxt("pisc.coadeira") + "; " + H.fonteTxt("pisc.tipologia_coluna"));
    var aMin = P("pisc.bocal_aspiracao", "profundidade_min_m", "aspiração"), aMax = P("pisc.bocal_aspiracao", "profundidade_max_m", "aspiração");
    if (asp.length && aMin != null && aMax != null) {
      var fora = asp.filter(function (d) { var pz = c.yA - d.y; return pz < aMin - TOL_POS || pz > aMax + TOL_POS; });
      v("pisc.aspiracao.profundidade", "Dispositivos de aspiração abaixo do nível da água", asp.map(function (d) { return f2(c.yA - d.y); }).join("; "), f2(aMin) + " a " + f2(aMax), "m", !fora.length, H.fonteTxt("pisc.bocal_aspiracao"));
    }
    /* SUCÇÃO SEGURA: uma das opções a) a d) de 5.4.4.8.2 */
    var dmin = P("pisc.succao_seguranca", "distancia_drenos_min_m", "ralos de fundo"), su = D.succao || "dois_drenos", okS = null, txt = "";
    var dR = c.ralos.length === 2 ? Math.sqrt(Math.pow(c.ralos[0].x - c.ralos[1].x, 2) + Math.pow(c.ralos[0].z - c.ralos[1].z, 2)) : null;
    if (su === "dois_drenos") { okS = c.ralos.length >= 2 && dR != null && dR >= dmin - TOL_POS; txt = "opção a): " + c.ralos.length + " drenos com grelha antiaprisionamento, interligados por tê no meio"; }
    else if (su === "coadeiras") { var cmin = P("pisc.succao_seguranca", "coadeiras_min_so_coadeira", "sucção só por coadeira"); okS = !c.ralos.length && co.length >= cmin; txt = "opção b): só coadeiras (" + co.length + ", mínimo " + cmin + ")"; }
    else if (su === "grelha_nao_bloqueavel") { okS = null; txt = "opção d): 1 dreno com grelha NÃO bloqueável ≥ " + f2(P("pisc.succao_seguranca", "grelha_nao_bloqueavel_lado1_m", "grelha")) + " × " + f2(P("pisc.succao_seguranca", "grelha_nao_bloqueavel_lado2_m", "grelha")) + " m — conferir o produto"; }
    else { okS = null; txt = "opção c): 1 dreno com tanque intermediário de sucção indireta — projetar o tanque"; }
    v("pisc.succao_segura", "Sucção segura (antiaprisionamento)", txt, "uma das opções a) a d)", "", okS, H.fonteTxt("pisc.succao_seguranca"));
    if (su === "dois_drenos" && dmin != null) v("pisc.drenos.distancia", "Distância entre os drenos de fundo (centro a centro)", dR != null ? f2(dR) : "—", "≥ " + f2(dmin), "m", dR != null ? dR >= dmin - TOL_POS : false, H.fonteTxt("pisc.succao_seguranca"));
    /* SEPARAÇÕES VERTICAIS: o descarte no esgoto e o abastecimento potável descarregam LIVRES acima do transbordamento */
    var sE = P("pisc.esgoto_separacao", "minimo_m", "descarte"), fE = P("pisc.esgoto_separacao", "fator_diametro", "descarte");
    if (sE != null && fE != null) v("pisc.separacao.esgoto", "Descarte do filtro: separação livre até o transbordamento da caixa receptora", "na obra", "≥ " + f2(Math.max(sE, fE * c.deR / 1000)) + " (máx(" + fE + " × D; " + f2(sE) + "))", "m", null, H.fonteTxt("pisc.esgoto_separacao"), "a caixa receptora não está no modelo: conferir na execução (pendência pisc.descarte.destino)");
    var sA = P("pisc.abastecimento_separacao", "minimo_m", "abastecimento"), fA = P("pisc.abastecimento_separacao", "fator_diametro", "abastecimento");
    if (sA != null && fA != null) v("pisc.separacao.abastecimento", "Abastecimento pela rede potável: separação livre até o transbordamento", "na obra", "≥ máx(" + fA + " × D; " + f2(sA) + ")", "m", null, H.fonteTxt("pisc.abastecimento_separacao"), "o ponto de reposição de água não é lançado pelo OrçaPRO: executar com a descarga livre");
    /* ACESSÓRIOS por tipologia: medidor de vazão, visor de lavagem, bomba reserva */
    var ex = c.dim.exigencias || {};
    v("pisc.medidor_vazao", "Medidor de vazão no retorno", ex.medidorVazao ? "exigido" : "não exigido", ex.medidorVazao ? "instalar" : "—", "", ex.medidorVazao ? null : true, H.fonteTxt("pisc.acessorios_obrigatorios") + "; " + H.fonteTxt("pisc.tipologia_coluna"), ex.medidorVazao ? "lançar o medidor no retorno, depois do filtro" : "a NOTA de 5.4.4.15 dispensa nas residenciais privativas e coletivas");
    v("pisc.visor_lavagem", "Visor de lavagem na tubulação de esgoto do filtro", "visor na saída de descarte", "exigido", "", true, H.fonteTxt("pisc.acessorios_obrigatorios"), "a família do filtro tem o visor na boca de descarte");
    v("pisc.bomba_reserva", "Bomba reserva", ex.bombaReserva ? "exigida" : "não exigida", ex.bombaReserva ? "instalar" : "—", "", ex.bombaReserva ? null : true, H.fonteTxt("pisc.tipologia_coluna"), ex.bombaReserva ? "lançar a bomba reserva em paralelo, com registros" : "5.4.4.6.2 d) NOTA 1: não se aplica às residenciais privativas e coletivas");
  }
  /* aviso com Corrigir para cada verificação NÃO ATENDE que não é da posição da casa (essas têm bloco próprio) */
  function avisarNaoAtende(out, dim, par) {
    out.verificacoes.filter(function (x) { return x.status === "nao_atende" && !/^pisc\.(npsh|autoescorva|bomba)/.test(x.id); }).forEach(function (x) {
      var acs = [];
      if (x.id === "pisc.temp" && dim.aquecimento && dim.aquecimento.faixa) acs.push({ tipo: "param", campo: "aquecimento.temperatura", valor: r4((dim.aquecimento.faixa[0] + dim.aquecimento.faixa[1]) / 2), texto: "Usar o meio da faixa da norma (" + f2((dim.aquecimento.faixa[0] + dim.aquecimento.faixa[1]) / 2) + " °C)" });
      if ((x.id === "pisc.succao_segura" || x.id === "pisc.drenos.distancia") && (par.succao || "dois_drenos") === "dois_drenos") acs.push({ tipo: "param", campo: "succao", valor: "coadeiras", texto: "Sucção só pela superfície (opção b: no mínimo 2 coadeiras)" });
      if (x.id === "pisc.succao_segura" && par.succao === "coadeiras") acs.push({ tipo: "param", campo: "succao", valor: "dois_drenos", texto: "Dois drenos de fundo interligados (opção a)" });
      out.avisos.push({ texto: x.nome + " = " + x.valor + " (limite " + x.limite + (x.unidade ? " " + x.unidade : "") + ") — NÃO ATENDE (" + x.fonte + ").", acao: acs[0] || null, acoes: acs });
    });
  }
  /* conector de uma família de equipamento na instância (frame da peça, antes de girar): a PEÇA manda — o lançamento não
     repete a fórmula da família (antes "45 % da altura", "87,5 %"… e a volumetria nova desalinhava o tubo) */
  function conDaFamilia(aval, famId, inst, id) {
    var a = null; try { a = aval ? aval(famId, "t-padrao", inst) : null; } catch (eA) { a = null; }
    var c = a && a.ok !== false ? arr(a.conectores).filter(function (q) { return q.id === id; })[0] : null;
    return c ? { x: r4(num(c.x, 0)), y: r4(num(c.y, 0)), z: r4(num(c.z, 0)) } : null;
  }
  /* instância do equipamento: a do produto (cota e cor) + o que o lançamento decide (DN, potência, texto do produto) */
  function instEq(base, extra) { var o = copia(base || {}); Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); Object.keys(o).forEach(function (k) { if (o[k] == null) delete o[k]; }); return o; }
  /* bomba do AQUECIMENTO: escolhida DEPOIS do traçado (a perda real) — a casa já foi montada com a forma de reserva; do produto
     entram a cor e o estilo (pré-filtro, aletas), a forma fica a de reserva (os bocais não mudam de lugar) e a instância diz isso */
  function instBooster(B3, bA, dn) {
    var o = instEq(B3.inst, { DN_succao: dn, DN_recalque: dn, Potencia_cv: bA ? num(bA.norm.potencia_cv, 0) : 0, Produto: bA ? prodTxt(bA) : "a definir", Fonte: bA ? bA.fonte : "", A_conferir: true });
    var v = bA && HPF() ? HPF().doProduto("hid-pisc-bomba-aquec", prodTxt(bA)) : null;
    if (v) Object.keys(v.inst).forEach(function (k) { if (/^(Mat_|Aletas$|Caixa_ligacao$|Fonte_forma$)/.test(k)) o[k] = v.inst[k]; });
    return o;
  }
  /* instância do produto: a cota e a cor do volumetria-piscina.json (HidPiscinaFam.doProduto) por cima do que o catálogo deu */
  function instProduto(famId, produto, base) {
    var o = copia(base || {}), F = HPF(), v = F && produto ? F.doProduto(famId, produto) : null;
    if (v) { Object.keys(v.inst).forEach(function (k) { o[k] = v.inst[k]; }); if (v.completo) delete o.A_conferir; else o.A_conferir = true; }
    if (/^hid-pisc-bomba/.test(famId) && F) o = F.completarBomba(o);
    return { inst: o, achou: !!v, falta: v ? v.falta : null };
  }
  function montarCasa(dim, par, g, aval) {
    var eq = dim.equipamentos || {}, fil = eq.filtro, bom = eq.bomba, bh = eq.bombaHidro, conf = [];
    function padraoFam(famId) { var f0 = HPF() && HPF().porId(famId), pv = {}; arr(f0 && f0.parametros).forEach(function (p) { pv[p.nome] = p.valor; }); return pv; }
    function dimBomba(b, famId) {
      var n = b && b.norm || {}, base = { Comprimento: mm(n.comprimento_mm) || mm(n.largura_mm && n.profundidade_mm ? Math.max(n.largura_mm, n.profundidade_mm) : null), Largura: mm(n.largura_mm), Altura: mm(n.altura_mm) };
      Object.keys(base).forEach(function (k) { if (!base[k]) delete base[k]; });
      var ip = instProduto(famId, b ? prodTxt(b) : "", base), i = ip.inst, pv = padraoFam(famId);
      var o = { C: num(i.Comprimento, num(pv.Comprimento, 0)), L: num(i.Largura, num(pv.Largura, 0)), H: num(i.Altura, num(pv.Altura, 0)), inst: i, famId: famId };
      if (!ip.achou && (!base.Comprimento || !base.Largura || !base.Altura)) { conf.push("medidas da " + (b ? prodTxt(b) : "motobomba") + " (o catálogo não imprime C×L×A): padrão da família"); o.reserva = true; i.A_conferir = true; }
      else if (ip.falta && ip.falta.length) conf.push("forma da " + prodTxt(b) + ": " + ip.falta.join(", ") + " pela proporção do desenho (a ficha não imprime)");
      o.cs = conDaFamilia(aval, famId, i, "succao") || { x: -o.C / 2, y: o.H / 2, z: 0 };
      o.cr = conDaFamilia(aval, famId, i, "recalque") || { x: 0, y: o.H, z: 0 };
      return o;
    }
    var Fb = {}; if (fil && fil.norm && mm(fil.norm.diametro_mm)) Fb.Diametro = mm(fil.norm.diametro_mm); if (fil && fil.norm && mm(fil.norm.altura_mm)) Fb.Altura = mm(fil.norm.altura_mm);
    var ipF = instProduto("hid-pisc-filtro", fil ? fil.fabricante + " " + fil.codigo : "", Fb), FI = ipF.inst, pvF = padraoFam("hid-pisc-filtro");
    var F = { D: num(FI.Diametro, num(pvF.Diametro, 0)), H: num(FI.Altura, num(pvF.Altura, 0)), inst: FI };
    if (!ipF.achou && (!Fb.Diametro || !Fb.Altura)) { conf.push("medidas do filtro: padrão da família"); F.reserva = true; FI.A_conferir = true; }
    F.ce = conDaFamilia(aval, "hid-pisc-filtro", FI, "entrada") || { x: -F.D / 2, y: F.H * 0.8, z: 0 };   // hid:ok só sem a família carregada
    F.cs = conDaFamilia(aval, "hid-pisc-filtro", FI, "saida") || { x: F.D / 2, y: F.ce.y, z: 0 };
    F.cd = conDaFamilia(aval, "hid-pisc-filtro", FI, "descarte") || { x: 0, y: F.ce.y, z: F.D / 2 };
    var B1 = dimBomba(bom, "hid-pisc-bomba"), B2 = bh || (par.hidro && par.hidro.ativo && num(par.hidro.bocais, 0) > 0) ? dimBomba(bh, "hid-pisc-bomba-hidro") : null;
    /* aquecimento SOLAR: bomba exclusiva do circuito (o fabricante recomenda) — entra na fila depois da coluna do retorno */
    var B3 = par.aquecimento && par.aquecimento.tipo === "solar" ? dimBomba(null, "hid-pisc-bomba-aquec") : null;
    var esp = geo(par, "espacoEquip"), mg = geo(par, "margemCasa"), fb = geo(par, "faixaBarrilete");
    var nEnt = 0;   /* entradas de sucção no barrilete (para o comprimento da faixa) */
    ["coadeiras", "aspiracoes"].forEach(function (k) { nEnt += num(dim.dispositivos[k], 0); });
    if (num(dim.dispositivos.ralosFundo, 0) > 0) nEnt += 1;
    var faixaX = Math.max(nEnt, 1) * geo(par, "passoSlot") + mg;
    /* ao longo de X: [barrilete] [bomba] [filtro] [saída do retorno] [bomba da hidro] */
    var x = -0;   /* acumulador a partir do canto −X interno */
    var xs = {}; x = mg + faixaX;
    xs.bomba = x + B1.C / 2; x += B1.C + esp;
    xs.filtro = x + F.D / 2; x += F.D + esp;
    /* com aquecimento, o trecho filtro → coluna do retorno leva as duas derivações (ida e volta) e o by-pass entre elas */
    var aqT = par.aquecimento && (par.aquecimento.tipo === "solar" || par.aquecimento.tipo === "bomba_calor");
    if (aqT) x += geo(par, "trechoDerivacao");
    xs.retorno = x; x += esp;
    if (B3) { xs.aquec = x + B3.C / 2; x += B3.C + esp; }
    if (B2) { xs.hidro = x + B2.C / 2; x += B2.C + esp; }
    var C = x + mg - esp, prof = Math.max(B1.L, F.D, B2 ? B2.L : 0, B3 ? B3.L : 0);
    var Lw = fb + prof + geo(par, "circulacao");
    var acesso = dim.casaMaquinas && dim.casaMaquinas.acessoMin;
    var alc = Math.max(acesso || 0, geo(par, "circulacao") + mg);
    if (C < alc + mg) C = alc + mg;
    var hEq = Math.max(B1.H, F.H, B2 ? B2.H : 0, B3 ? B3.H : 0) + geo(par, "folgaTopo");
    var pd = dim.casaMaquinas && dim.casaMaquinas.peDireitoRec ? Math.max(hEq, dim.casaMaquinas.peDireitoRec) : hEq;
    /* origem do frame local = centro do piso interno; −Z = parede da FRENTE (de frente para a piscina) */
    var x0 = -C / 2, zF = -Lw / 2, zEq = zF + fb + prof / 2;
    return { C: r4(C), L: r4(Lw), H: r4(pd), alcapao: r4(alc), F: F, B1: B1, B2: B2, B3: B3, conferir: conf, nEnt: nEnt, prof: prof,
             x: { bomba: x0 + xs.bomba, filtro: x0 + xs.filtro, retorno: x0 + xs.retorno, hidro: B2 ? x0 + xs.hidro : null, aquec: B3 ? x0 + xs.aquec : null, slot0: x0 + mg, slotFim: x0 + mg + faixaX },
             zFrente: zF, zEq: zEq, zFundo: Lw / 2 };
  }
  /* local (frame da casa) → mundo */
  function paraMundo(cm, lx, lz) { var c = Math.cos(cm.rotY), s = Math.sin(cm.rotY); return { x: r4(cm.x + lx * c + lz * s), z: r4(cm.z - lx * s + lz * c) }; }
  function paraLocal(cm, x, z) { var c = Math.cos(cm.rotY), s = Math.sin(cm.rotY), dx = x - cm.x, dz = z - cm.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; }
  /* a casa de frente para o tanque: o +Z local aponta para FORA do tanque (a parede −Z encara a piscina) */
  function orientar(g, p) {
    var melhor = null;
    g.lados.forEach(function (l) { var d = distSeg(p, l.a, l.b); if (!melhor || d < melhor.d) melhor = { d: d, l: l }; });
    var n = melhor ? melhor.l.n : { x: 0, z: 1 };
    return Math.atan2(n.x, n.z);
  }
  function obstaculos(estado, avaliarFam) {
    var H = HR(); if (!H) return { lista: [], lajes: [] };
    var o = H.obstaculosDoBim(estado, avaliarFam), P = H._int.parametros({});
    return H._int.normObstaculos(o, P);
  }
  /* o MELHOR lugar: de frente para cada lado do tanque (¼, ½, ¾), fora de obra e de obstáculo; menor (distância ao tanque + 0,3 × à casa) */
  function melhorCasa(g, estado, avaliarFam, par, casa) {
    var obs = obstaculos(estado, avaliarFam), out = [], paredes = arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede"; });
    var meia = casa.L / 2 + geo(par, "espCasa"), afast = geo(par, "paredePiscina") + geo(par, "afastCasa") + meia;
    var FRACS = [0.5, 0.25, 0.75];   // hid:ok posições candidatas ao longo de cada lado
    g.lados.forEach(function (l) {
      FRACS.forEach(function (fr) {
        var p0 = { x: l.a.x + (l.b.x - l.a.x) * fr, z: l.a.z + (l.b.z - l.a.z) * fr }, c = add(p0, l.n, afast), rot = Math.atan2(l.n.x, l.n.z);
        var R = ret(c.x, c.z, Math.cos(rot), -Math.sin(rot), casa.C / 2 + geo(par, "espCasa"), meia);
        var bate = obs.lista.some(function (b) { return b.tipo !== "familia" ? Math.abs(b.cx - c.x) < b.hl + R.hl + R.hw && Math.abs(b.cz - c.z) < b.hl + R.hl + R.hw && dentroRet(b, c.x, c.z, R.hl) : false; });
        var ex = Math.abs(R.ux) * R.hl + Math.abs(R.uz) * R.hw, ez = Math.abs(R.uz) * R.hl + Math.abs(R.ux) * R.hw;   /* caixa envolvente da casa girada */
        var sobLaje = obs.lajes.some(function (L) { return c.x + ex > L.x0 && c.x - ex < L.x1 && c.z + ez > L.z0 && c.z - ez < L.z1; });
        var noTanque = HP().dentro(g.contorno, c);
        if (bate || sobLaje || noTanque) return;
        var dCasa = paredes.length ? Math.min.apply(null, paredes.map(function (w) { return d2(c, { x: w.cx, z: w.cz }); })) : 0;
        var PESO_CASA = 0.3;   // hid:ok peso da distância à casa (a casa de máquinas fica entre a piscina e a obra)
        out.push({ x: r4(c.x), z: r4(c.z), rotY: r4(rot), lado: l.i, fr: fr, custo: d2(c, g.centroide) + PESO_CASA * dCasa });
      });
    });
    out.sort(function (a, b) { return a.custo - b.custo; });
    return out[0] || null;
  }

  /* ================================================ GRADE + A* (a vala) */
  function Vala(g, cm, casa, obs, par, extras) {
    var H = HR(), I = H._int, pss = geo(par, "passo"), mgG = geo(par, "margemGrade");
    var xs0 = [], zs0 = [];
    g.contorno.forEach(function (p) { xs0.push(p.x); zs0.push(p.z); });
    [paraMundo(cm, -casa.C / 2 - 1, -casa.L / 2 - 1), paraMundo(cm, casa.C / 2 + 1, casa.L / 2 + 1), paraMundo(cm, -casa.C / 2 - 1, casa.L / 2 + 1), paraMundo(cm, casa.C / 2 + 1, -casa.L / 2 - 1)].forEach(function (p) { xs0.push(p.x); zs0.push(p.z); });
    arr(extras).forEach(function (p) { xs0.push(p.x); zs0.push(p.z); });
    this.chaves = [];
    this.min = { x: Math.min.apply(null, xs0) - mgG, z: Math.min.apply(null, zs0) - mgG };
    this.max = { x: Math.max.apply(null, xs0) + mgG, z: Math.max.apply(null, zs0) + mgG };
    this.I = I; this.pss = pss; this.cm = cm; this.casa = casa; this.g = g; this.obs = obs; this.par = par;
    this.ocup = {};   /* "x|z" → camada que ocupou */
    this.reserva = {};   /* pontos de partida/chegada de TODAS as linhas: só a linha dona passa por eles */
    this.bloq = {};      /* tocos que saem da casa de máquinas sem passar pelo A* (descarte, aquecimento): ninguém cruza */
    this.infTanque = geo(par, "paredePiscina") + geo(par, "afastTubo") - pss / 2;
    var ce = casa.C / 2 + geo(par, "espCasa"), cl = casa.L / 2 + geo(par, "espCasa");
    this.retCasa = ret(cm.x, cm.z, Math.cos(cm.rotY), -Math.sin(cm.rotY), ce, cl);
  }
  Vala.prototype.montar = function (chaves) {
    var I = this.I, o = this.cm;
    this.xs = I.eixo(this.min.x, this.max.x, this.pss, chaves.map(function (p) { return p.x; }), o.x);
    this.zs = I.eixo(this.min.z, this.max.z, this.pss, chaves.map(function (p) { return p.z; }), o.z);
    this.G = new I.Grade(this.xs, this.zs);
  };
  Vala.prototype.chave = function (p) { return r4(p.x) + "|" + r4(p.z); };
  /* bloqueia os nós da grade a menos de um passo do segmento a-b (toco reto que sai da casa) */
  Vala.prototype.bloquear = function (a, b) {
    var G = this.G, self = this, x0 = Math.min(a.x, b.x) - this.pss, x1 = Math.max(a.x, b.x) + this.pss, z0 = Math.min(a.z, b.z) - this.pss, z1 = Math.max(a.z, b.z) + this.pss;
    this.xs.forEach(function (x) { if (x < x0 || x > x1) return; self.zs.forEach(function (z) { if (z < z0 || z > z1) return; if (distSeg({ x: x, z: z }, a, b) < self.pss - EPS) self.bloq[self.chave({ x: x, z: z })] = 1; }); });
  };
  Vala.prototype.livreBase = function (p, y, liberar) {
    if (liberar && liberar[this.chave(p)]) return true;
    var g = this.g;
    if (HP().dentro(g.contorno, p) || distPoligono(g.contorno, p) < this.infTanque) return false;
    if (dentroRet(this.retCasa, p.x, p.z, -EPS)) return false;
    var ob = this.obs.lista;
    for (var i = 0; i < ob.length; i++) { var b = ob[i]; if (b.y1 < y - EPS || b.y0 > y + EPS) continue; if (dentroRet(b, p.x, p.z, 0)) return false; }
    return true;
  };
  Vala.prototype.rota = function (a, b, y, camada, liberar) {
    var self = this, G = this.G, ini = G.idx(a.x, a.z), fim = G.idx(b.x, b.z);
    if (ini < 0 || fim < 0) return null;
    var alvos = {}; alvos[fim] = 1;
    var lajes = this.obs.lajes || [], cLaje = geo(this.par, "custoLaje"), cCruz = geo(this.par, "custoCruzar");
    var memo = {};
    function livre(k) {
      if (memo[k] != null) return memo[k];
      var p = G.pt(k), ch = self.chave(p), oc = self.ocup[ch], lib = liberar && liberar[ch];
      var ok = (lib || (self.reserva[ch] !== camada && !self.bloq[ch])) && (oc == null || oc !== camada || lib) && self.livreBase(p, y, liberar);
      memo[k] = ok; return ok;
    }
    function aresta(ka, kb) {
      var pa = G.pt(ka), pb = G.pt(kb), L = d2(pa, pb), c = L;
      var m = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 };
      if (lajes.some(function (l) { return m.x >= l.x0 && m.x <= l.x1 && m.z >= l.z0 && m.z <= l.z1; })) c *= cLaje;
      var oc = self.ocup[self.chave(pb)]; if (oc != null && oc !== camada) c += cCruz * L;
      return { c: c };
    }
    var r = this.I.aEstrela(G, ini, { livre: livre, aresta: aresta, alvos: alvos, curva: geo(this.par, "custoCurva"), max: geo(this.par, "maxEstados") });
    if (!r) return null;
    var pts = r.nos.map(function (k) { return G.pt(k); });
    /* tira os pontos colineares (o caminho vira poucos trechos retos) */
    var s = [pts[0]];
    for (var i = 1; i < pts.length - 1; i++) { var p0 = s[s.length - 1], p1 = pts[i], p2 = pts[i + 1]; var cr = (p1.x - p0.x) * (p2.z - p1.z) - (p1.z - p0.z) * (p2.x - p1.x); if (Math.abs(cr) > EPS) s.push(p1); }
    s.push(pts[pts.length - 1]);
    pts.forEach(function (p) { self.ocup[self.chave(p)] = camada; });
    return s;
  };

  /* ================================================ GERAR */
  function vivas(ops) {
    var lista = BE() && BE().achatar ? BE().achatar(ops) : arr(ops), apag = {};
    lista.forEach(function (o, i) { if (o && o.op === "apagar" && o.id != null) apag[o.id] = i; });
    return lista.filter(function (o, i) { return o && o.op !== "apagar" && !(o.id != null && apag[o.id] > i); });
  }
  function gerar(e) {
    e = e || {};
    var ops0 = arr(e.ops), par0 = e.parametros || {};
    var out = { ok: false, ops: [], dispositivos: [], linhas: [], avisos: [], pendencias: [], decisoes: [], verificacoes: [], casa: null, geometria: null, dim: null };
    function pend(chave, motivo, acao) { out.pendencias.push({ chave: chave, motivo: motivo, acao: acao || null }); }
    function aviso(t, acao) { out.avisos.push({ texto: t, acao: acao || null }); }
    function decide(id, t) { out.decisoes.push({ id: id, texto: t }); }
    var est0 = e.estado || {}, op = arr(est0.hidPiscinas).filter(function (p) { return String(p.id) === String(e.piscina); })[0];
    if (!op) { pend("pisc.op", "a piscina " + e.piscina + " não está no modelo"); return out; }
    var pid = String(op.id);
    /* 1) tira o que esta piscina pôs antes */
    var ordem = { anotar: 0, trecho: 1, familia: 2 }, lim = [];
    vivas(ops0).forEach(function (o) { if (o.pisc === pid && o.id != null && ordem[o.op] != null) lim.push(o); });
    lim.sort(function (a, b) { return ordem[a.op] - ordem[b.op]; });
    var limpar = lim.map(function (o) { return { op: o.op === "anotar" ? "desanotar" : "apagar", id: o.id, pisc: pid, piscParte: "limpar" }; });
    var ops = ops0.concat(limpar), estado = BE().aplicar(ops);
    var opE = arr(estado.hidPiscinas).filter(function (p) { return String(p.id) === pid; })[0] || op;
    var g = HP().daOp(opE, estado, e.opcoes || {});
    out.geometria = g;
    if (!g.ok) { arr(g.erros).forEach(function (t) { pend("pisc.geometria", t); }); return out; }
    var par = copia(opE.params || {}); Object.keys(par0).forEach(function (k) { par[k] = par0[k]; });
    /* ⚠ GRADE ÚNICA ancorada no 1º vértice do tanque: dispositivos, pés das subidas, casa de máquinas e entradas caem nas
       linhas dela — senão uma linha-chave a 5 cm de uma linha da grade fazia o A* dar um "dente" (curva de 62°, cruzeta) */
    var O = g.contorno[0], PS = geo(par, "passo");
    function sn(v, o) { return r4(o + Math.round((v - o) / PS) * PS); }
    function snapPt(q) { return { x: sn(q.x, O.x), z: sn(q.z, O.z) }; }
    var dim0 = HP().dimensionar(g, par);
    if (!dim0.ok) { out.dim = dim0; dim0.pendencias.forEach(function (p) { pend(p.chave, p.motivo); }); return out; }
    var obs = obstaculos(estado, e.avaliarFam), novas = [];
    function marca(o, parte) { o.pisc = pid; o.piscParte = parte; novas.push(o); return o; }
    /* conector de um dispositivo já posto (família + instância + posição) em coordenadas do mundo */
    function conDisp(d, id) {
      var c = conDaFamilia(e.avaliarFam, d.famId, d.inst, id); if (!c) return null;
      var cs = Math.cos(num(d.rotY, 0)), sn0 = Math.sin(num(d.rotY, 0));
      return { x: r4(d.x + c.x * cs + c.z * sn0), y: r4(d.y + c.y), z: r4(d.z - c.x * sn0 + c.z * cs), local: c };
    }

    /* 2) CASA DE MÁQUINAS */
    var casa = montarCasa(dim0, par, g, e.avaliarFam), cm;
    if (opE.cm && isFinite(num(opE.cm.x, NaN))) {
      cm = { x: num(opE.cm.x, 0), z: num(opE.cm.z, 0) }; cm.rotY = orientar(g, cm); cm.origem = "usuario";
      decide("pisc.cm.lugar", "Casa de máquinas onde o projetista pôs (" + f2(cm.x) + "; " + f2(cm.z) + "), de frente para o lado mais próximo do tanque.");
    } else {
      var mc = melhorCasa(g, estado, e.avaliarFam, par, casa);
      if (!mc) { pend("pisc.cm.lugar", "não achei lugar livre para a casa de máquinas em volta do tanque (obra ou obstáculo em todos os lados): arraste-a para o lugar", { tipo: "moverCM" }); return out; }
      cm = { x: mc.x, z: mc.z, rotY: mc.rotY, origem: "melhor" };
      decide("pisc.cm.lugar", "Casa de máquinas no MELHOR lugar: de frente para o lado " + (mc.lado + 1) + " do tanque, " + f2(geo(par, "afastCasa")) + " m afastada da parede, fora da obra e dos obstáculos, o mais perto da piscina e da casa (critério do projetista). Arraste para mudar: os tubos se refazem.");
    }
    var nivel = par.cmNivel === "superficie" ? "superficie" : "afogada";
    var yPiso;
    var eixoB = casa.B1.cs.y;   /* o eixo da sucção da bomba: o conector da família (a cota da ficha) */
    if (nivel === "afogada") {
      var yAfog = g.yAgua - geo(par, "afogamento") - eixoB, yTeto = g.yBorda - geo(par, "espCasa") - casa.H;
      yPiso = Math.min(yAfog, yTeto);
      decide("pisc.cm.nivel", "Casa de máquinas ENTERRADA, com a laje no nível do deck: o eixo da bomba fica " + f2(g.yAgua - (yPiso + eixoB)) + " m ABAIXO do nível da água (bomba afogada: escorva garantida e NPSH folgado). Fica abaixo do solo: protegida contra inundação e com ralo de drenagem (NBR 10339 5.2.2).");
    } else {
      /* na superfície: o piso da casa no terreno dela (o projetista informa; sem isso, no nível do deck) */
      yPiso = num(par.cmCota, g.yBorda);
      decide("pisc.cm.nivel", "Casa de máquinas na SUPERFÍCIE (a pedido): a bomba fica " + f2(yPiso + eixoB - g.yAgua) + " m ACIMA do nível da água — a autoescorva do fabricante é conferida.");
    }
    yPiso = r4(yPiso);
    var cmS = snapPt(cm); cm.x = cmS.x; cm.z = cmS.z;
    cm.yPiso = yPiso; out.casa = { x: cm.x, z: cm.z, rotY: r4(cm.rotY), yPiso: yPiso, nivel: nivel, C: casa.C, L: casa.L, H: casa.H, alcapao: casa.alcapao, origem: cm.origem, conferir: casa.conferir };
    if (casa.conferir.length) casa.conferir.forEach(function (t) { aviso("Casa de máquinas: " + t + " — confira na ficha do fabricante."); });
    var cmId = pid + "-cm";
    marca({ op: "familia", id: cmId, famId: "hid-pisc-casa-maquinas", tipoId: "t-padrao", x: cm.x, y: yPiso, z: cm.z, rotY: r4(cm.rotY), inst: { Comprimento: casa.C, Largura: casa.L, Altura: casa.H, Alcapao: casa.alcapao, Mostrar_tampa: par.mostrarTampa !== false } }, "casa");

    /* 3) DISPOSITIVOS */
    var yA = g.yAgua, lados = g.lados, ep = geo(par, "paredePiscina");
    /* lado das coadeiras: a favor do vento (dado do usuário) ou o lado de frente para a casa de máquinas */
    var ladoCm = lados.slice().sort(function (a, b) { return distSeg(cm, a.a, a.b) - distSeg(cm, b.a, b.b); })[0];
    var ladoCo = ladoCm;
    if (par.vento != null && isFinite(Number(par.vento))) {
      var ang = Number(par.vento) * Math.PI / 180, vdir = { x: -Math.sin(ang), z: Math.cos(ang) };   /* vento DE θ (graus a partir do +Z, horário): sopra para −(sen θ, −cos θ) */   // hid:ok graus → radianos
      ladoCo = lados.slice().sort(function (a, b) { return -(a.n.x * vdir.x + a.n.z * vdir.z) * a.L + (b.n.x * vdir.x + b.n.z * vdir.z) * b.L; })[0];
      decide("pisc.coadeira.vento", "Coadeiras na parede de JUSANTE do vento predominante (vem de " + Number(par.vento) + "°): a sujeira da superfície vai para elas (NBR 10339 5.4.4.11 c).");
    } else decide("pisc.coadeira.lado", "Sem dado de vento: coadeiras e aspiração na parede de frente para a casa de máquinas (linhas de sucção curtas); retornos na parede OPOSTA — a água atravessa o tanque (5.4.4.8.1 a–c). Informe o vento predominante para pôr as coadeiras a jusante.");
    function oposto(l) { return lados.slice().sort(function (a, b) { return (a.n.x * l.n.x + a.n.z * l.n.z) - (b.n.x * l.n.x + b.n.z * l.n.z) || b.L - a.L; })[0]; }
    var ladoRet = oposto(ladoCo);
    var ocupLado = {};   /* lado → [s ocupados] (para não pôr dois dispositivos no mesmo lugar) */
    /* n posições LIVRES na parede, entre as frações inicio e fim: candidatas a cada meio espaço, longe (≥ esp) do que já está na
       parede, espalhadas por igual entre as livres. Devolve MENOS que n quando não cabe (quem chama põe o resto noutra parede).
       ⚠ antes era "desliza meio espaço até sair de cima": com a parede cheia (retornos + hidro na mesma ponta) dois bocais
       ficavam a 10 cm um do outro e a linha da hidro não tinha por onde passar */
    function slotsNoLado(l, n, inicio, fim, espP) {
      var esp = num(espP, geo(par, "espacoDisp")), a = num(inicio, 0) * l.L + esp / 2, b = num(fim, 1) * l.L - esp / 2, oc = ocupLado[l.i] || (ocupLado[l.i] = []), cands = [];
      if (!(n > 0)) return [];
      for (var t = a; t <= b + EPS; t += esp / 2) if (!oc.some(function (q) { return Math.abs(q - t) < esp - EPS; })) cands.push(t);
      /* tira as candidatas coladas umas nas outras (o passo é meio espaço): gulosa, da esquerda para a direita */
      var livres = []; cands.forEach(function (t) { if (!livres.length || t - livres[livres.length - 1] >= esp - EPS) livres.push(t); });
      var m = livres.length, esc = [];
      if (m <= n) esc = livres.slice();
      else for (var k = 0; k < n; k++) esc.push(livres[Math.min(m - 1, Math.round((k + 0.5) * m / n - 0.5))]);   // hid:ok meio do intervalo
      esc.forEach(function (t) { oc.push(t); });
      return esc;
    }
    function rotDisp(l) { return Math.atan2(-l.n.x, -l.n.z); }   /* +Z local = para DENTRO do tanque */
    var disps = [], famInst = {};
    function dispositivo(tipo, famId, l, s, y, sistema, inst, extra) {
      var p = { x: l.a.x + l.dir.x * s, z: l.a.z + l.dir.z * s };
      if (Math.abs(l.dir.x) > 1 - EPS) { p.x = sn(p.x, O.x); s = (p.x - l.a.x) / l.dir.x; } else if (Math.abs(l.dir.z) > 1 - EPS) { p.z = sn(p.z, O.z); s = (p.z - l.a.z) / l.dir.z; }
      var id = pid + "-" + tipo + (disps.filter(function (d) { return d.tipo === tipo; }).length + 1);
      var ip = instProduto(famId, inst && inst.Produto, {}), ins = copia(inst || {});
      /* a forma e a cor do produto (espelho, corpo, material) vencem o padrão; o que o lançamento decide (Corpo até a ligação, DN) fica */
      if (ip.achou) { Object.keys(ip.inst).forEach(function (k) { if (k !== "Corpo" && k !== "DN") ins[k] = ip.inst[k]; }); if (!ip.inst.A_conferir) delete ins.A_conferir; }
      var d = { id: id, tipo: tipo, famId: famId, lado: l.i, s: r4(s), x: r4(p.x), y: r4(y), z: r4(p.z), rotY: r4(rotDisp(l)), sistema: sistema, n: l.n, inst: ins };
      Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
      disps.push(d); return d;
    }
    var D = dim0.dispositivos, itRet = cat("retorno")[0], itAsp = cat("aspiracao")[0], itSk = cat("skimmer")[0], itRalo = cat("ralo_fundo")[0], itHid = cat("hidro_bocal")[0], itRef = cat("refletor")[0];
    function instDisp(it, corpoMin) {
      var n = it && it.norm || {}, o = { Produto: prodTxt(it), Fonte: it ? HP().fonteItem(it) : "", Corpo: r4(Math.max(corpoMin || 0, ep + 0.05)) };   // hid:ok o corpo atravessa a parede + 5 cm de rosca
      var fl = mm(n.flange_mm || n.diametro_mm); if (fl) o.Flange = fl; else o.A_conferir = true;
      var de = deDaConexao(n.conexao_pol); if (de) o.DN = de;
      return o;
    }
    /* faixas de profundidade dos dispositivos: norma (e fabricante, se houver) */
    var N = NN(), ctxF = N.contexto();
    function faixa(chaveNorma, pmin, pmax, chaveFab) {
      var a = HP()._int.param(ctxF, chaveNorma, pmin, "profundidade dos dispositivos"), b = pmax ? HP()._int.param(ctxF, chaveNorma, pmax, "profundidade dos dispositivos") : null;
      return { min: a, max: b };
    }
    var fRet = faixa("pisc.bocal_retorno", "profundidade_min_abaixo_na_m", null), fAsp = faixa("pisc.bocal_aspiracao", "profundidade_min_m", "profundidade_max_m");
    var fabRet = N.linhas("pisc.fab.altura_dispositivos", { dispositivo: "retorno" })[0], fabAsp = N.linhas("pisc.fab.altura_dispositivos", { dispositivo: "aspiracao" })[0];
    var pRet = fabRet ? (num(fabRet.min_m, 0) + num(fabRet.max_m, 0)) / 2 : (fRet.min != null ? fRet.min + geo(par, "afastTubo") / 3 : null);   // hid:ok sem a faixa do fabricante: 5 cm abaixo do mínimo da norma
    var pAsp = fAsp.min != null && fAsp.max != null ? (fAsp.min + fAsp.max) / 2 : (fabAsp ? (num(fabAsp.min_m, 0) + num(fabAsp.max_m, 0)) / 2 : null);
    if (pRet == null) pend("pisc.bocal_retorno", "sem a profundidade mínima do retorno: retornos não lançados");
    /* coadeiras */
    slotsNoLado(ladoCo, num(D.coadeiras, 0), 0.1, 0.9).forEach(function (s) {   // hid:ok faixa útil da parede (10 % a 90 %)
      var n = itSk && itSk.norm || {}, inst = { Produto: prodTxt(itSk), Fonte: itSk ? HP().fonteItem(itSk) : "" };
      ["Largura:largura_mm", "Profundidade:profundidade_mm", "Altura:altura_mm", "Boca:boca_mm"].forEach(function (kv) { var a = kv.split(":"), v = mm(n[a[1]]); if (v) inst[a[0]] = v; else inst.A_conferir = true; });
      var de = deDaConexao(n.conexao_pol); if (de) inst.DN = de;
      dispositivo("coadeira", "hid-pisc-skimmer", ladoCo, s, yA, "pisc_succao", inst);
    });
    /* aspirações (no lado das coadeiras, nos espaços livres) */
    slotsNoLado(ladoCo, num(D.aspiracoes, 0), 0.2, 0.8).forEach(function (s) { if (pAsp != null) dispositivo("aspiracao", "hid-pisc-aspiracao", ladoCo, s, yA - pAsp, "pisc_succao", instDisp(itAsp)); });   // hid:ok faixa útil
    /* retornos na parede oposta */
    if (pRet != null) slotsNoLado(ladoRet, num(D.retornos, 0), 0, 1).forEach(function (s) { dispositivo("retorno", "hid-pisc-retorno", ladoRet, s, yA - pRet, "pisc_retorno", instDisp(itRet)); });
    if (pRet != null) decide("pisc.retorno.altura", "Retornos a " + f2(pRet) + " m abaixo do nível da água (NBR 10339: ≥ " + f2(fRet.min) + " m" + (fabRet ? "; fabricante: " + f2(fabRet.min_m) + " a " + f2(fabRet.max_m) + " m — meio da faixa" : "") + "); aspiração a " + (pAsp != null ? f2(pAsp) : "—") + " m (faixa da norma: " + f2(fAsp.min) + " a " + f2(fAsp.max) + " m — meio da faixa).");
    /* ralos de fundo: no ponto mais fundo, a ≥ distância mínima, transversais ao eixo (ou ao longo, se não couber) */
    var ralos = [];
    if (num(D.ralosFundo, 0) >= 1) {
      var E = g.eixo, dmin = num(D.distanciaRalos, 0) + geo(par, "folgaRalos");
      var sF = g.fundoInvertido ? E.s0 + geo(par, "recuoRalo") : E.s1 - geo(par, "recuoRalo"), tm = (E.t0 + E.t1) / 2;
      var pts;
      if (num(D.ralosFundo, 0) >= 2) {
        if (E.largura - 2 * geo(par, "recuoRalo") >= dmin) pts = [{ s: sF, t: tm - dmin / 2 }, { s: sF, t: tm + dmin / 2 }];
        else { var sF2 = g.fundoInvertido ? sF + dmin : sF - dmin; pts = [{ s: sF, t: tm }, { s: sF2, t: tm }]; }
      } else pts = [{ s: sF, t: tm }];
      pts.forEach(function (q) {
        var p = snapPt({ x: q.s * E.u.x + q.t * E.v.x, z: q.s * E.u.z + q.t * E.v.z }), yF = yA - g.prof(p), n = itRalo && itRalo.norm || {};
        var inst = { Produto: prodTxt(itRalo), Fonte: itRalo ? HP().fonteItem(itRalo) : "" }, gr = mm(n.grelha_mm || n.diametro_mm); if (gr) inst.Grelha = gr; else inst.A_conferir = true;
        var de = deDaConexao(n.conexao_pol); if (de) inst.DN = de;
        var ipR = instProduto("hid-pisc-ralo", inst.Produto, {}); if (ipR.achou) { Object.keys(ipR.inst).forEach(function (k) { if (k !== "DN") inst[k] = ipR.inst[k]; }); delete inst.A_conferir; }
        var d = { id: pid + "-ralo" + (ralos.length + 1), tipo: "ralo", famId: "hid-pisc-ralo", x: r4(p.x), y: r4(yF), z: r4(p.z), rotY: 0, sistema: "pisc_succao", inst: inst };
        ralos.push(d); disps.push(d);
      });
      if (ralos.length === 2) decide("pisc.ralos", "Ralos de fundo no ponto mais fundo, " + f2(d2(ralos[0], ralos[1])) + " m de centro a centro (mínimo " + f2(num(D.distanciaRalos, 0)) + " m), interligados por um tê no MEIO (ramos iguais = equilibrados hidraulicamente, NBR 10339 5.4.4.8.2 a).");
    }
    /* HIDRO: bocais no trecho escolhido (padrão: a parede da ponta rasa) + 2 sucções de parede interligadas */
    var hid = par.hidro || {}, bocaisH = [], succH = [];
    if (hid.ativo && num(hid.bocais, 0) > 0) {
      var nb = Math.round(num(hid.bocais, 0)), ladoH;
      if (hid.lado != null && lados[Number(hid.lado)]) ladoH = lados[Number(hid.lado)];
      else {
        var pR = g.pontoRaso; ladoH = lados.slice().sort(function (a, b) { return distSeg(pR, a.a, a.b) - distSeg(pR, b.a, b.b); })[0];
      }
      /* a SUCÇÃO da hidro primeiro (o par a ≥ 1,5 m, no meio da parede), depois os bocais nos espaços livres */
      var dminH = num(D.distanciaRalos, 0) + geo(par, "folgaRalos"), prSH = Math.min(geo(par, "profSuccaoHidro"), g.prof(ladoH.meio) - 0.15);   // hid:ok 15 cm acima do fundo
      var sMeio = ladoH.L / 2, ocH = ocupLado[ladoH.i] || (ocupLado[ladoH.i] = []);
      [sMeio - dminH / 2, sMeio + dminH / 2].forEach(function (s0) { var s1 = Math.max(0.1, Math.min(ladoH.L - 0.1, s0)); ocH.push(s1); succH.push(dispositivo("succao_hidro", "hid-pisc-succao-hidro", ladoH, s1, yA - prSH, "pisc_hidro", instDisp(null))); });   // hid:ok 10 cm da quina
      var lista = slotsNoLado(ladoH, nb, num(hid.inicio, 0.05), num(hid.fim, 0.95), geo(par, "espacoHidro")), resto = nb - lista.length, naParede = lista.length;   // hid:ok faixa útil
      lista.forEach(function (s0) { bocaisH.push(dispositivo("hidro", "hid-pisc-hidro", ladoH, s0, yA - geo(par, "profHidro"), "pisc_hidro", instDisp(itHid))); });
      if (resto > 0) {
        /* não coube: as paredes vizinhas, junto da mesma ponta */
        var viz = lados.filter(function (l) { return l !== ladoH; }).sort(function (a, b) { return distSeg(ladoH.meio, a.a, a.b) - distSeg(ladoH.meio, b.a, b.b); }).slice(0, 2);
        viz.forEach(function (l, i) { var k = Math.ceil(resto / (viz.length - i)); var pertoDe = d2(l.a, ladoH.meio) < d2(l.b, ladoH.meio); var sl = slotsNoLado(l, k, pertoDe ? 0.02 : 0.55, pertoDe ? 0.45 : 0.98, geo(par, "espacoHidro")); resto -= sl.length; sl.forEach(function (s0) { bocaisH.push(dispositivo("hidro", "hid-pisc-hidro", l, s0, yA - geo(par, "profHidro"), "pisc_hidro", instDisp(itHid))); }); });   // hid:ok trecho junto à ponta
        if (resto > 0) pend("pisc.hidro.espaco", resto + " bocal(is) de hidro não couberam nas paredes da ponta escolhida com o espaçamento mínimo: escolha outro trecho (parâmetro hidro.lado) ou menos bocais");
      }
      decide("pisc.hidro.lugar", nb + " bocais de hidro na parede " + (ladoH.i + 1) + " (ponta " + (hid.lado != null ? "escolhida" : "rasa") + ")" + (bocaisH.length > naParede ? " e nas vizinhas" : "") + ", a " + f2(geo(par, "profHidro")) + " m abaixo do nível da água (a conferir com o fabricante do bocal); sucção da hidro por 2 grelhas de parede antiaprisionamento interligadas a " + f2(dminH) + " m (mesma regra de segurança da sucção).");
      if (!itHid || !itHid.norm || itHid.norm.profundidade_m == null) pend("pisc.fab.hidro_altura", "altura de instalação do bocal de hidromassagem não publicada: adotado " + f2(geo(par, "profHidro")) + " m abaixo do nível da água (critério do projetista) — confira com o fabricante");
    }
    /* refletores */
    var ilu = par.iluminacao || {}, nRef = ilu.ativo ? Math.max(1, Math.round(num(ilu.n, Math.ceil(g.area / 20)))) : 0;   // hid:ok sem n informado: 1 a cada 20 m² (critério do projetista, declarado)
    if (nRef) {
      slotsNoLado(ladoCm, nRef, 0.15, 0.85).forEach(function (s) { var it = itRef, inst = instDisp(it, 0.12); dispositivo("refletor", "hid-pisc-refletor", ladoCm, s, yA - geo(par, "profRefletor"), null, inst); });   // hid:ok faixa útil; corpo do nicho
      decide("pisc.refletores", nRef + " refletor(es) LED na parede de frente para a casa de máquinas (a luz vai para longe de quem olha da casa), a " + f2(geo(par, "profRefletor")) + " m abaixo do nível da água" + (ilu.n == null ? " — quantidade pelo critério 1 a cada 20 m² (informe a do luminotécnico)" : "") + "; alimentação em extrabaixa tensão pelo quadro (NBR 5410, projeto elétrico).");
    }

    /* 4) EQUIPAMENTOS NA CASA (frame local → mundo) e os pontos de ligação */
    var yBs = r4(yPiso + eixoB), yR = r4(yPiso + casa.F.ce.y);   /* bocas da seletora: o conector da família (cota A da ficha) */
    var eqB = dim0.equipamentos.bomba, eqF = dim0.equipamentos.filtro, eqH = dim0.equipamentos.bombaHidro;
    var pB = paraMundo(cm, casa.x.bomba, casa.zEq), pF = paraMundo(cm, casa.x.filtro, casa.zEq), rotX = r4(cm.rotY);
    var deS = (dim0.linhas.succaoGeral || {}).dn || 50, deR = (dim0.linhas.recalque || {}).dn || 50;   // hid:ok reserva sem cálculo (não chega aqui: dim0.ok)
    marca({ op: "familia", id: pid + "-bomba", famId: "hid-pisc-bomba", tipoId: "t-padrao", x: pB.x, y: yPiso, z: pB.z, rotY: rotX, inst: instEq(casa.B1.inst, { DN_succao: deS, DN_recalque: deR, Potencia_cv: eqB ? num(eqB.norm.potencia_cv, 0) : 0, Produto: eqB ? prodTxt(eqB) : "", Fonte: eqB ? eqB.fonte : "" }) }, "equipamento");
    marca({ op: "familia", id: pid + "-filtro", famId: "hid-pisc-filtro", tipoId: "t-padrao", x: pF.x, y: yPiso, z: pF.z, rotY: rotX, inst: instEq(casa.F.inst, { DN: deR, Produto: eqF ? eqF.fabricante + " " + eqF.codigo : "", Fonte: eqF ? eqF.fonte : "" }) }, "equipamento");
    var pQ = paraMundo(cm, casa.x.filtro, casa.zFundo - 0.08);   // hid:ok quadro encostado na parede do fundo
    marca({ op: "familia", id: pid + "-quadro", famId: "hid-pisc-quadro", tipoId: "t-padrao", x: pQ.x, y: r4(yPiso + 1.0), z: pQ.z, rotY: r4(cm.rotY + Math.PI), inst: {} }, "equipamento");   // hid:ok altura do quadro (1,0 m do piso)
    if (casa.B2) { var pBH = paraMundo(cm, casa.x.hidro, casa.zEq); marca({ op: "familia", id: pid + "-bomba-hidro", famId: "hid-pisc-bomba-hidro", tipoId: "t-padrao", x: pBH.x, y: yPiso, z: pBH.z, rotY: rotX, inst: instEq(casa.B2.inst, { Potencia_cv: eqH ? num(eqH.norm.potencia_cv, 0) : 0, Produto: eqH ? prodTxt(eqH) : "a definir (hidro sem dimensionamento)", Fonte: eqH ? eqH.fonte : "", A_conferir: !eqH || !!casa.B2.inst.A_conferir }) }, "equipamento"); }
    /* dispositivos no modelo */
    disps.forEach(function (d) { famInst[d.id] = d; marca({ op: "familia", id: d.id, famId: d.famId, tipoId: "t-padrao", x: d.x, y: d.y, z: d.z, rotY: d.rotY, inst: d.inst }, "dispositivo"); });
    /* botão de emergência a ≥ 2 m da borda, no caminho da casa; acionador da hidro na borda */
    var dEm = dim0.decisoes.some(function (x) { return x.id === "pisc.emergencia"; }) ? HP()._int.param(ctxF, "pisc.emergencia", "distancia_min_borda_m", "emergência") : null;
    if (dEm != null) {
      var pEm = add({ x: ladoCm.meio.x, z: ladoCm.meio.z }, ladoCm.n, dEm + 0.3), dReal = distPoligono(g.contorno, pEm);   // hid:ok 30 cm além do mínimo
      if (dentroRet({ cx: cm.x, cz: cm.z, ux: Math.cos(cm.rotY), uz: -Math.sin(cm.rotY), hl: casa.C / 2 + 0.4, hw: casa.L / 2 + 0.4 }, pEm.x, pEm.z, 0)) pEm = add(pEm, ladoCm.dir, casa.C / 2 + 0.8);   // hid:ok desvia da casa
      dReal = distPoligono(g.contorno, pEm);
      marca({ op: "familia", id: pid + "-emergencia", famId: "hid-pisc-emergencia", tipoId: "t-padrao", x: r4(pEm.x), y: g.yBorda, z: r4(pEm.z), rotY: r4(Math.atan2(-ladoCm.n.x, -ladoCm.n.z)), inst: {} }, "dispositivo");
      out.verificacoes.push({ id: "pisc.emergencia.dist", nome: "Botão de emergência — distância à borda", valor: f2(dReal), limite: "≥ " + f2(dEm), unidade: "m", ok: dReal >= dEm - EPS, status: dReal >= dEm - EPS ? "atende" : "nao_atende", fonte: HP().fonteTxt("pisc.emergencia") });
    }
    if (bocaisH.length) { var lh = lados[bocaisH[0].lado], pAc = add(add(lh.a, lh.dir, lh.L / 2), lh.n, geo(par, "bordaAcionador")); marca({ op: "familia", id: pid + "-acionador", famId: "hid-pisc-acionador", tipoId: "t-padrao", x: r4(pAc.x), y: g.yBorda, z: r4(pAc.z), rotY: 0, inst: {} }, "dispositivo"); }

    /* 5) TUBOS */
    var skOut = 0;   /* a vala fica abaixo da saída mais baixa das coadeiras */
    disps.filter(function (d) { return d.tipo === "coadeira"; }).forEach(function (d) { var A = num(d.inst.Altura, 0.55), Bc = num(d.inst.Boca, 0.15); skOut = Math.min(skOut, -A + Bc - 0.1); });   // hid:ok padrões da família
    var yS = r4(Math.min(g.yBorda - geo(par, "recobrimento"), yA + skOut - geo(par, "abaixoCoadeira"))), yRv = r4(yS + geo(par, "camadaRetorno")), yHd = r4(yRv + geo(par, "camadaRetorno")), yAq = r4(yHd + geo(par, "camadaRetorno"));
    /* ⚠ CAMADAS: sucção (S), retorno (R), hidro (H) e aquecimento (A) em cotas próprias — duas linhas da MESMA camada nunca se
       cruzam (o A* desvia), e de camadas diferentes podem se cruzar sem bater (12 cm na vertical). Com a hidro na camada do
       retorno, a linha do retorno fechava a passagem até a parede da hidro e a hidro ficava sem caminho (casa a leste). */
    decide("pisc.vala", "Tubos enterrados em vala em volta do tanque: sucção a " + f2(g.yBorda - yS) + " m abaixo do deck (abaixo da saída das coadeiras: sucção sem ponto alto); retorno, hidro e aquecimento em camadas " + f2(geo(par, "camadaRetorno")) + " m acima uma da outra (camadas diferentes nunca se cruzam na mesma cota; a linha que encontra a passagem fechada desce uma camada e cruza por baixo). Traçado ortogonal (A* do HidRota) desviando do tanque, da casa de máquinas, de vigas/pilares e dos outros tubos.");
    var tubos = [], nT = 0, alias = {}, MIN_T = 0.03;   // hid:ok trecho mais curto que isto (acima da tolerância de nó de 2 cm do biminst) vira o mesmo nó
    function kp(p) { return r4(p.x) + "|" + r4(p.y) + "|" + r4(p.z); }
    function ali(p) { var q = alias[kp(p)]; return q ? { x: q.x, y: q.y, z: q.z } : p; }
    function tubo(sis, dn, a, b, papel, linha, continua) {
      a = ali(a); b = ali(b);
      var Lab = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
      if (Lab < MIN_T) { alias[kp(b)] = { x: a.x, y: a.y, z: a.z }; return null; }
      /* aplicação "reservação (barrilete)": a composição SINAPI de tubo de PVC soldável que existe em todos os DN da piscina
         (40 a 75) — a de "ramal" não tem DN 50+; vala, escavação e reaterro vão à parte no quantitativo da piscina */
      var t = marca({ op: "trecho", id: pid + "-t" + (++nT), sistema: sis, material: "pvc_soldavel", dn: dn, aplicacao: "reservacao", p1: { x: r4(a.x), y: r4(a.y), z: r4(a.z) }, p2: { x: r4(b.x), y: r4(b.y), z: r4(b.z) } }, "tubo");
      t.piscLinha = linha; if (continua) t.continua = continua; tubos.push({ id: t.id, linha: linha, papel: papel, sis: sis, dn: dn, a: t.p1, b: t.p2, L: Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)) });
      return t;
    }
    function poli(sis, dn, pts, papel, linha) { for (var i = 1; i < pts.length; i++) tubo(sis, dn, pts[i - 1], pts[i], papel, linha); }
    /* o ponto do dispositivo: o conector (fim do corpo, atrás da face) e o pé da subida na vala */
    function saidaDisp(d) {
      /* a ligação do dispositivo = o conector da família na posição e no giro dele (a peça manda) */
      var cw = conDisp(d, "ligacao");
      if (cw) return { con: { x: cw.x, y: cw.y, z: cw.z }, pe: add(d, d.n, ep + geo(par, "afastTubo")) };
      var c2 = add(d, d.n, num(d.inst.Corpo, ep));
      return { con: { x: c2.x, y: d.y, z: c2.z }, pe: add(d, d.n, ep + geo(par, "afastTubo")) };
    }
    /* slots na parede da frente da casa (x local) */
    var slots = { succao: [], retorno: [], hidroS: [], hidroR: [], aquec: [] };
    var zFw = casa.zFrente - geo(par, "espCasa") - geo(par, "passo");   /* um passo fora da parede da frente */
    function slotMundo(xl) { return snapPt(paraMundo(cm, xl, zFw)); }
    function xlDe(xl) { return paraLocal(cm, slotMundo(xl).x, slotMundo(xl).z).x; }   /* o x local da entrada já na grade */
    function slotInterno(xl) { return paraMundo(cm, xlDe(xl), casa.zFrente + 0.05); }   // hid:ok 5 cm dentro da parede
    var linhasS = [];
    /* coadeiras e aspirações: uma linha cada */
    disps.filter(function (d) { return d.tipo === "coadeira" || d.tipo === "aspiracao"; }).forEach(function (d) { var sd = saidaDisp(d); linhasS.push({ id: d.id, nome: (d.tipo === "coadeira" ? "Coadeira " : "Aspiração ") + d.id.split("-").pop(), disp: [d], pe: sd.pe, sub: [{ de: sd.con, ate: { x: sd.pe.x, y: sd.con.y, z: sd.pe.z } }], dn: d.tipo === "coadeira" ? (dim0.linhas.coadeira || {}).dn : (dim0.linhas.aspiracao || {}).dn, papel: d.tipo }); });
    /* ralos: tê no meio, linha até a parede mais próxima por baixo do piso */
    if (ralos.length) {
      var dnF = (dim0.linhas.fundo || {}).dn || deS, m, sub = [];
      var cons = ralos.map(function (r) { var cl = conDaFamilia(e.avaliarFam, "hid-pisc-ralo", r.inst, "ligacao") || { x: num(r.inst.Grelha, 0) / 2, y: 0 }; return { r: r, y: r4(r.y + cl.y), off: cl.x }; });   /* a saída do ralo: o conector da família */
      if (cons.length === 2) {
        m = { x: (cons[0].r.x + cons[1].r.x) / 2, z: (cons[0].r.z + cons[1].r.z) / 2 };
        var yM = Math.min(cons[0].y, cons[1].y);
        cons.forEach(function (c) { var u = { x: (m.x - c.r.x) / (d2(m, c.r) || 1), z: (m.z - c.r.z) / (d2(m, c.r) || 1) }; c.r.rotY = r4(Math.atan2(-u.z, u.x)); var cx = add(c.r, u, c.off); sub.push({ de: { x: cx.x, y: c.y, z: cx.z }, ate: { x: m.x, y: yM, z: m.z } }); });   // hid:ok saída da família (42 % da grelha + 8 cm)
        m.y = yM;
      } else { var c0 = cons[0]; m = { x: c0.r.x, y: c0.y, z: c0.r.z }; }
      /* do tê à parede mais próxima (perpendicular), por baixo do fundo */
      var lp = lados.slice().sort(function (a, b) { return distSeg(m, a.a, a.b) - distSeg(m, b.a, b.b); })[0], dl = distSeg(m, lp.a, lp.b), pe = add(m, lp.n, dl + ep + geo(par, "afastTubo"));
      sub.push({ de: { x: m.x, y: m.y, z: m.z }, ate: { x: pe.x, y: m.y, z: pe.z } });
      /* a família girada aponta a saída para o tê: reescreve a rotação nas ops */
      ralos.forEach(function (r) { novas.forEach(function (o) { if (o.id === r.id) o.rotY = r.rotY; }); });
      linhasS.push({ id: pid + "-fundo", nome: "Ralos de fundo", disp: ralos, pe: pe, sub: sub, dn: dnF, papel: "fundo" });
    }
    /* hidro: sucção (par) e bocais */
    var linhasH = [];
    if (succH.length === 2) {
      var s0 = saidaDisp(succH[0]), s1 = saidaDisp(succH[1]), mH = { x: (s0.pe.x + s1.pe.x) / 2, z: (s0.pe.z + s1.pe.z) / 2 };
      linhasH.push({ id: pid + "-hidroS", nome: "Sucção da hidro", disp: succH, pe: mH, sub: [{ de: s0.con, ate: { x: s0.pe.x, y: s0.con.y, z: s0.pe.z } }, { de: s1.con, ate: { x: s1.pe.x, y: s1.con.y, z: s1.pe.z } }], par: [s0.pe, s1.pe], dn: (dim0.linhas.hidroSuccao || {}).dn, papel: "hidroS" });
    }
    /* ordem das entradas na parede da casa (sem cruzar): pela posição x local do pé */
    linhasS.sort(function (a, b) { return paraLocal(cm, a.pe.x, a.pe.z).x - paraLocal(cm, b.pe.x, b.pe.z).x; });
    var dx = geo(par, "passoSlot");
    linhasS.forEach(function (L, i) { L.slotX = casa.x.slot0 + dx * (i + 0.5); });   // hid:ok meio do intervalo
    linhasH.forEach(function (L) { L.slotX = casa.x.hidro != null ? casa.x.hidro - casa.B2.C / 2 - dx : casa.x.retorno + dx; });
    var xRet = casa.x.retorno, xHR = casa.x.hidro != null ? casa.x.hidro + casa.B2.C / 2 + dx : null;
    /* a grade (chaves = pés, slots, pontos de ligação) */
    var chaves = [], camadaDe = [];
    function ch(p, cam) { chaves.push(p); camadaDe.push(cam); }
    linhasS.concat(linhasH).forEach(function (L) { ch(L.pe, "S"); ch(slotMundo(L.slotX), "S"); arr(L.par).forEach(function (p) { ch(p, "S"); }); });
    var retDisp = disps.filter(function (d) { return d.tipo === "retorno"; }), hidDisp = disps.filter(function (d) { return d.tipo === "hidro"; });
    retDisp.forEach(function (d) { ch(saidaDisp(d).pe, "R"); });
    hidDisp.forEach(function (d) { ch(saidaDisp(d).pe, "H"); });
    ch(slotMundo(xRet), "R"); if (xHR != null) ch(slotMundo(xHR), "H");
    var aqP = par.aquecimento || {}, planoA = aqP.tipo === "solar" || aqP.tipo === "bomba_calor" ? planoAquec(cm, casa, g, estado, par, dim0, snapPt) : null;
    if (planoA) [planoA.fora, planoA.off, planoA.pRiser, planoA.pR2].forEach(function (p) { if (p) ch(p, "A"); });
    var V = new Vala(g, cm, casa, obs, par, chaves); V.montar(chaves);
    chaves.forEach(function (p, i) { V.reserva[V.chave(p)] = camadaDe[i]; });
    /* os tocos que atravessam a parede do FUNDO da casa (descarte e aquecimento) — o A* das outras linhas não passa por eles */
    var zIn = casa.zFundo, zOut = casa.zFundo + geo(par, "espCasa") + 0.7;   // hid:ok até 10 cm além da ponta do toco (60 cm)
    var xsToco = [casa.x.filtro].concat(planoA ? [paraLocal(cm, planoA.fora.x, planoA.fora.z).x, paraLocal(cm, planoA.off.x, planoA.off.z).x] : []);
    xsToco.forEach(function (xl) { V.bloquear(paraMundo(cm, xl, zIn), paraMundo(cm, xl, zOut)); });
    var falhas = [];
    function rotear(a, b, y, camada, nome) {
      var lib = {}; lib[V.chave(a)] = 1; lib[V.chave(b)] = 1;
      var r = V.rota(a, b, y, camada, lib);
      if (r) return r.map(function (p) { return { x: p.x, y: y, z: p.z }; });
      /* ⚠ a MESMA camada fechou a passagem (as linhas que já chegaram à casa formam um "pente"): a linha desce uma camada
         (12 cm abaixo), cruza por baixo das outras e sobe de novo nas pontas — sem bater em ninguém */
      var y2 = r4(y - geo(par, "camadaRetorno")), r2 = V.rota(a, b, y2, camada + "2", lib);
      if (r2) { var pts2 = r2.map(function (p) { return { x: p.x, y: y2, z: p.z }; }); return [{ x: a.x, y: y, z: a.z }].concat(pts2, [{ x: b.x, y: y, z: b.z }]); }
      falhas.push(nome); out.falhasRota = (out.falhasRota || []).concat([{ nome: nome, a: a, b: b, camada: camada }]);
      return [a, { x: b.x, z: a.z }, b].map(function (p) { return { x: p.x, y: y, z: p.z }; });
    }
    /* SUCÇÃO: dispositivo → pé (pela parede) → vala → slot → dentro da casa: desce ao barrilete, registro, coletor → bomba */
    var xMaxSlot = null, colS = [];
    function linhaSuccao(L, sis, yCam, camada, xDestino) {
      var dn = L.dn || deS;
      L.sub.forEach(function (sb) { tubo(sis, dn, sb.de, sb.ate, "sucção", L.id); });
      /* sobe/desce do fim do toco ao nível da vala */
      var pe = L.par ? null : { x: L.pe.x, y: yCam, z: L.pe.z };
      if (L.par) {
        /* par interligado: cada toco sobe à vala, liga um no outro, e o meio vai para a casa */
        L.sub.forEach(function (sb) { tubo(sis, dn, sb.ate, { x: sb.ate.x, y: yCam, z: sb.ate.z }, "sucção", L.id); });
        var a = { x: L.par[0].x, y: yCam, z: L.par[0].z }, b = { x: L.par[1].x, y: yCam, z: L.par[1].z }, mm2 = { x: L.pe.x, y: yCam, z: L.pe.z };
        poli(sis, dn, rotear(L.par[0], L.pe, yCam, camada, L.nome + " (interligação)"), "sucção", L.id); poli(sis, dn, rotear(L.par[1], L.pe, yCam, camada, L.nome + " (interligação)"), "sucção", L.id);
        pe = mm2; void a; void b;
      } else { var ult = L.sub[L.sub.length - 1].ate; tubo(sis, dn, ult, pe, "sucção", L.id); }
      var sl = slotMundo(L.slotX), cam = rotear(L.pe, sl, yCam, camada, L.nome);
      poli(sis, dn, cam, "sucção", L.id);
      /* atravessa a parede da frente e desce ao barrilete */
      var si = slotInterno(L.slotX), bar = paraMundo(cm, xlDe(L.slotX), casa.zEq);
      tubo(sis, dn, { x: sl.x, y: yCam, z: sl.z }, { x: si.x, y: yCam, z: si.z }, "sucção", L.id);
      tubo(sis, dn, { x: si.x, y: yCam, z: si.z }, { x: si.x, y: yBs, z: si.z }, "sucção", L.id);
      var mR = { x: (si.x + bar.x) / 2, z: (si.z + bar.z) / 2 };
      tubo(sis, dn, { x: si.x, y: yBs, z: si.z }, { x: bar.x, y: yBs, z: bar.z }, "sucção", L.id);
      marca({ op: "familia", id: L.id + "-reg", famId: "hid-pisc-registro", tipoId: "t-padrao", x: r4(mR.x), y: yBs, z: r4(mR.z), rotY: r4(cm.rotY + Math.PI / 2), inst: { DN: dn, Sistema: sis } }, "registro");
      return { bar: { x: bar.x, y: yBs, z: bar.z }, xl: xlDe(L.slotX), dn: dn };
    }
    linhasS.forEach(function (L) { colS.push(linhaSuccao(L, "pisc_succao", yS, "S", null)); });
    /* coletor do barrilete → bomba (ao longo de X local, na linha do eixo do equipamento) */
    var suc = paraMundo(cm, casa.x.bomba + casa.B1.cs.x, casa.zEq);
    if (colS.length) {
      colS.sort(function (a, b) { return a.xl - b.xl; });
      for (var ci = 0; ci < colS.length; ci++) { var nx = ci + 1 < colS.length ? colS[ci + 1].bar : { x: suc.x, y: yBs, z: suc.z }; tubo("pisc_succao", deS, colS[ci].bar, nx, "barrilete", pid + "-barrilete"); }
    }
    /* bomba → filtro (o bocal de recalque sobe; a entrada da seletora fica na altura yR) */
    var rec = paraMundo(cm, casa.x.bomba + casa.B1.cr.x, casa.zEq), ent = paraMundo(cm, casa.x.filtro + casa.F.ce.x, casa.zEq);   /* bocais: conectores das famílias */
    var yRec = r4(yPiso + casa.B1.cr.y);
    tubo("pisc_retorno", deR, { x: rec.x, y: yRec, z: rec.z }, { x: rec.x, y: yR, z: rec.z }, "recalque", pid + "-recalque");
    tubo("pisc_retorno", deR, { x: rec.x, y: yR, z: rec.z }, { x: ent.x, y: yR, z: ent.z }, "recalque", pid + "-recalque");
    /* filtro → saída do retorno (sobe à camada do retorno e sai pela frente) */
    var sai = paraMundo(cm, casa.x.filtro + casa.F.cs.x, casa.zEq), xr = paraMundo(cm, xlDe(xRet), casa.zEq), slR = slotMundo(xRet), siR = slotInterno(xRet);
    var aq = par.aquecimento || {}, comAq = aq.tipo === "solar" || aq.tipo === "bomba_calor";
    if (comAq && planoA) {
      /* DERIVAÇÃO do aquecimento no trecho filtro → coluna do retorno: tê de ida (T1), registro do by-pass, tê de volta (T2) */
      var yT = yR, hD = deR / 1000 * 1.2, ga = function (xl, dzl) { var q = paraMundo(cm, xl, casa.zEq + (dzl || 0)); return { x: q.x, y: yT, z: q.z }; };   // hid:ok meia-largura do tê (família hid-pisc-derivacao)
      [["T1", planoA.xT1, "ida"], ["T2", planoA.xT2, "volta"]].forEach(function (q) { var c0 = paraMundo(cm, q[1], casa.zEq); marca({ op: "familia", id: pid + "-deriv-" + q[2], famId: "hid-pisc-derivacao", tipoId: "t-padrao", x: c0.x, y: yT, z: c0.z, rotY: r4(cm.rotY), inst: { DN: deR } }, "registro"); });
      tubo("pisc_retorno", deR, { x: sai.x, y: yR, z: sai.z }, ga(planoA.xT1 - hD), "retorno", pid + "-retorno");
      tubo("pisc_retorno", deR, ga(planoA.xT1 + hD), ga(planoA.xT2 - hD), "retorno", pid + "-retorno");
      tubo("pisc_retorno", deR, ga(planoA.xT2 + hD), { x: xr.x, y: yR, z: xr.z }, "retorno", pid + "-retorno");
      var mBp = paraMundo(cm, (planoA.xT1 + planoA.xT2) / 2, casa.zEq);
      marca({ op: "familia", id: pid + "-reg-bypass", famId: "hid-pisc-registro", tipoId: "t-padrao", x: mBp.x, y: yT, z: mBp.z, rotY: r4(cm.rotY), inst: { DN: deR, Sistema: "pisc_retorno" } }, "registro");
      planoA.T1 = ga(planoA.xT1, hD); planoA.T2 = ga(planoA.xT2, hD);
    } else tubo("pisc_retorno", deR, { x: sai.x, y: yR, z: sai.z }, { x: xr.x, y: yR, z: xr.z }, "retorno", pid + "-retorno");
    tubo("pisc_retorno", deR, { x: xr.x, y: yR, z: xr.z }, { x: xr.x, y: yRv, z: xr.z }, "retorno", pid + "-retorno");
    tubo("pisc_retorno", deR, { x: xr.x, y: yRv, z: xr.z }, { x: siR.x, y: yRv, z: siR.z }, "retorno", pid + "-retorno");
    tubo("pisc_retorno", deR, { x: siR.x, y: yRv, z: siR.z }, { x: slR.x, y: yRv, z: slR.z }, "retorno", pid + "-retorno");
    /* retornos em linha: casa → 1º → 2º … (tê em cada pé), o ramal entra pela parede */
    var dnRam = (dim0.linhas.retornoRamal || {}).dn || deR;
    function cadeia(lista, sis, dnPrin, dnRamal, inicio, yCam, camada, nome, idLinha) {
      if (!lista.length) return;
      lista = lista.slice().sort(function (a, b) { return d2(saidaDisp(a).pe, inicio) - d2(saidaDisp(b).pe, inicio); });
      /* ordena ao longo do caminho: do mais perto da casa, sempre ao vizinho mais próximo */
      var ordem2 = [lista.shift()]; while (lista.length) { var u = saidaDisp(ordem2[ordem2.length - 1]).pe; lista.sort(function (a, b) { return d2(saidaDisp(a).pe, u) - d2(saidaDisp(b).pe, u); }); ordem2.push(lista.shift()); }
      var prev = inicio, PSc = geo(par, "passo");
      ordem2.forEach(function (d, i) {
        var sd = saidaDisp(d), prox = ordem2[i + 1] ? saidaDisp(ordem2[i + 1]).pe : null;
        /* ⚠ TÊ DE VERDADE: com um próximo, a linha chega ao pé ALINHADA com a perna seguinte (o tê fica com a passagem reta e a
           derivação descendo); sem isto o A* chegava de lado e o nó virava "três trechos sem dois alinhados" */
        var alvo = sd.pe;
        if (prox) {
          var dx = prox.x - sd.pe.x, dz = prox.z - sd.pe.z, ux = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 1 : -1) : 0, uz = ux ? 0 : (dz > 0 ? 1 : -1);
          var antes = { x: r4(sd.pe.x - ux * PSc), z: r4(sd.pe.z - uz * PSc) };
          if (V.livreBase(antes, yCam, null)) { poli(sis, dnPrin, rotear(prev, antes, yCam, camada, nome + " → " + d.id), "distribuição", idLinha); tubo(sis, dnPrin, { x: antes.x, y: yCam, z: antes.z }, { x: sd.pe.x, y: yCam, z: sd.pe.z }, "distribuição", idLinha); alvo = null; }
        }
        if (alvo) poli(sis, dnPrin, rotear(prev, sd.pe, yCam, camada, nome + " → " + d.id), "distribuição", idLinha);
        /* derivação: desce/sobe do pé até a cota do dispositivo e entra pela parede */
        tubo(sis, dnRamal, { x: sd.pe.x, y: yCam, z: sd.pe.z }, { x: sd.pe.x, y: sd.con.y, z: sd.pe.z }, "ramal", idLinha);
        tubo(sis, dnRamal, { x: sd.pe.x, y: sd.con.y, z: sd.pe.z }, sd.con, "ramal", idLinha);
        prev = sd.pe;
      });
    }
    cadeia(retDisp, "pisc_retorno", deR, dnRam, slR, yRv, "R", "Retorno", pid + "-retorno");
    /* HIDRO: sucção em par → bomba da hidro → linha dos bocais */
    if (linhasH.length && casa.B2) {
      var LH = linhasH[0], dS2 = LH.dn || deS, cH = linhaSuccao(LH, "pisc_hidro", yS, "S", null);
      var sucH = paraMundo(cm, casa.x.hidro + casa.B2.cs.x, casa.zEq), yS2 = r4(yPiso + casa.B2.cs.y);
      if (Math.abs(yS2 - yBs) < 0.005) tubo("pisc_hidro", dS2, cH.bar, { x: sucH.x, y: yBs, z: sucH.z }, "barrilete", pid + "-hidroS");   // hid:ok 5 mm
      else {
        /* o eixo da bomba da hidro não é o da bomba do filtro (outra ficha): muda de nível antes de entrar na sucção axial */
        var jg = paraMundo(cm, casa.x.hidro + casa.B2.cs.x - geo(par, "passo"), casa.zEq);
        tubo("pisc_hidro", dS2, cH.bar, { x: jg.x, y: yBs, z: jg.z }, "barrilete", pid + "-hidroS");
        tubo("pisc_hidro", dS2, { x: jg.x, y: yBs, z: jg.z }, { x: jg.x, y: yS2, z: jg.z }, "barrilete", pid + "-hidroS");
        tubo("pisc_hidro", dS2, { x: jg.x, y: yS2, z: jg.z }, { x: sucH.x, y: yS2, z: sucH.z }, "barrilete", pid + "-hidroS");
      }
      var recH = paraMundo(cm, casa.x.hidro + casa.B2.cr.x, casa.zEq), xh = paraMundo(cm, xlDe(xHR), casa.zEq), slH = slotMundo(xHR), siH = slotInterno(xHR), dRH = (dim0.linhas.hidroRecalque || {}).dn || deR;
      var yRecH = r4(yPiso + casa.B2.cr.y);
      tubo("pisc_hidro", dRH, { x: recH.x, y: yRecH, z: recH.z }, { x: recH.x, y: yRecH + 0.1, z: recH.z }, "recalque", pid + "-hidroR");   // hid:ok sobe 10 cm do bocal
      tubo("pisc_hidro", dRH, { x: recH.x, y: yRecH + 0.1, z: recH.z }, { x: xh.x, y: yRecH + 0.1, z: xh.z }, "recalque", pid + "-hidroR");   // hid:ok idem
      tubo("pisc_hidro", dRH, { x: xh.x, y: yRecH + 0.1, z: xh.z }, { x: xh.x, y: yHd, z: xh.z }, "recalque", pid + "-hidroR");   // hid:ok idem
      tubo("pisc_hidro", dRH, { x: xh.x, y: yHd, z: xh.z }, { x: siH.x, y: yHd, z: siH.z }, "recalque", pid + "-hidroR");
      tubo("pisc_hidro", dRH, { x: siH.x, y: yHd, z: siH.z }, { x: slH.x, y: yHd, z: slH.z }, "recalque", pid + "-hidroR");
      cadeia(hidDisp, "pisc_hidro", dRH, (dim0.linhas.hidroRamal || {}).dn || dRH, slH, yHd, "H", "Hidromassagem", pid + "-hidroR");
    }
    /* DESCARTE: seletora → atravessa a parede do fundo → espera fora (pendência do destino) */
    var desc = paraMundo(cm, casa.x.filtro + casa.F.cd.x, casa.zEq + casa.F.cd.z), dFundo = paraMundo(cm, casa.x.filtro, casa.zFundo + geo(par, "espCasa") + 0.5);   // hid:ok 0,5 m fora da parede do fundo
    tubo("pisc_dreno", deR, { x: desc.x, y: yR, z: desc.z }, { x: dFundo.x, y: yR, z: dFundo.z }, "descarte", pid + "-descarte", "p2");
    var sep = dim0.dreno && dim0.dreno.separacao_m;
    pend("pisc.descarte.destino", "descarte do filtro (lavagem e esvaziamento): ligar a espera na rede pluvial ou de esgoto conforme a prefeitura, com descarga LIVRE de no mínimo " + f2(sep) + " m acima do nível de transbordamento da caixa receptora (NBR 10339 5.4.4.14 a) e visor de lavagem no tubo (5.4.4.16)", { tipo: "destino", sistema: "pisc_dreno" });
    pend("pisc.casa.drenagem", "ralo do piso da casa de máquinas (enterrada): ligar ao pluvial por gravidade ou bomba de drenagem (NBR 10339 5.2.2 b)");
    /* AQUECIMENTO: derivação com by-pass no retorno (o fabricante do filtro pede o aquecedor FORA da linha do filtro) */
    var aqInfo = null;
    if (comAq) aqInfo = executarAquec(planoA, cm, g, par, xr, yR, yAq, tubo, poli, rotear, marca, decide, pend, pid, casa, yPiso);

    /* 6) CONFERÊNCIA com os comprimentos e as conexões REAIS */
    var porLinha = {};
    tubos.forEach(function (t) { (porLinha[t.linha] = porLinha[t.linha] || []).push(t); });
    function pecasDe(lista) {
      /* joelho = vértice onde a direção muda; tê = nó com 3 tubos; registro = 1 por linha de sucção */
      var nos = {}, j = 0, teL = 0, teD = 0;
      lista.forEach(function (t) { [t.a, t.b].forEach(function (p, i) { var k = r4(p.x) + "|" + r4(p.y) + "|" + r4(p.z), o = i ? t.a : t.b, L = t.L || 1; (nos[k] = nos[k] || []).push({ x: (o.x - p.x) / L, y: (o.y - p.y) / L, z: (o.z - p.z) / L }); }); });
      Object.keys(nos).forEach(function (k) {
        var v = nos[k], n = v.length;
        if (n === 2) { var dt = v[0].x * v[1].x + v[0].y * v[1].y + v[0].z * v[1].z; if (dt > -1 + 1e-3) j++; }   // hid:ok alinhados (−1) = só emenda, não joelho
        else if (n >= 3) {   // hid:ok três trechos = tê
          /* tê: com dois ramos alinhados o fluxo da linha passa DIRETO (o ramal sai de lado); sem, é saída de lado */
          var alinh = false; for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) if (v[a].x * v[b].x + v[a].y * v[b].y + v[a].z * v[b].z < -1 + 1e-3) alinh = true;   // hid:ok idem
          if (alinh) teD++; else teL++;
        }
      });
      return { joelho_90: j, te90_passagem_direta: teD, te90_saida_lado: teL, registro_gaveta_aberto: 1 };
    }
    var linhasReais = [];
    var Qp = dim0.vazao.Q_m3h;
    Object.keys(porLinha).forEach(function (k) {
      var ls = porLinha[k], L = 0; ls.forEach(function (t) { L += t.L; });
      var sis = ls[0].sis, cj = sis === "pisc_succao" || (sis === "pisc_hidro" && /hidroS/.test(k)) ? "succao" : "recalque", papel = ls[0].papel;
      var q = sis === "pisc_hidro" ? (dim0.hidro && dim0.hidro.Q_m3h) : (k === pid + "-barrilete" ? Qp : (/coadeira/.test(k) ? Qp * 0.8 : Qp));   // hid:ok fração da coadeira (a mesma do dimensionamento)
      var dn = ls.reduce(function (m, t) { return Math.max(m, t.dn); }, 0);
      if (sis === "pisc_aquec") q = dim0.aquecimento && dim0.aquecimento.solar ? dim0.aquecimento.solar.Q_m3h : null;
      if (sis === "pisc_dreno") q = dim0.dreno ? dim0.dreno.Q_m3h : null;
      out.linhas.push({ id: k, sistema: sis, conjunto: cj, Q: r4(q || 0), dn: dn, L: r4(L), trechos: ls.length, pecas: pecasDe(ls) });
      if (sis !== "pisc_hidro" && sis !== "pisc_aquec" && sis !== "pisc_dreno") linhasReais.push({ papel: k, conjunto: cj, Q: q || Qp, dn: dn, L: L, pecas: pecasDe(ls) });
    });
    var par2 = copia(par); par2.linhasReais = linhasReais; par2.yBomba = yBs;
    par2.linhasHidro = out.linhas.filter(function (l) { return l.sistema === "pisc_hidro"; }).map(function (l) { return { papel: l.id, conjunto: l.conjunto, Q: l.Q, dn: l.dn, L: l.L, pecas: l.pecas }; });
    /* a BOMBA DO AQUECIMENTO SOLAR: na curva, com o desnível até as placas e as perdas do circuito traçado (ida + volta) */
    if (aqInfo && aqInfo.bomba) {
      var Qs = dim0.aquecimento && dim0.aquecimento.solar && dim0.aquecimento.solar.Q_m3h, ctxA = NN().contexto(), hfA = 0, detA = [];
      if (Qs) {
        tubos.filter(function (t) { return t.sis === "pisc_aquec"; }).reduce(function (acc, t) { (acc[t.linha] = acc[t.linha] || []).push(t); return acc; }, (function () { var o = {}; return o; })());
        [pid + "-aquecIda", pid + "-aquecVolta"].forEach(function (k) {
          var ls = tubos.filter(function (t) { return t.linha === k; }); if (!ls.length) return;
          var L = 0; ls.forEach(function (t) { L += t.L; });
          var pr = HP().perdaLinha(ctxA, Qs, ls[0].dn, L, pecasDe(ls), null, "circuito solar");
          if (pr.ok) { hfA += pr.hf; detA.push({ papel: k, Q: Qs, dn: ls[0].dn, L: pr.L, Leq: pr.Leq, v: pr.v, hf: pr.hf }); }
        });
        var estA = { estatica: num(aqInfo.hEstatico, 0), K: hfA / (Qs * Qs), amt: r4(num(aqInfo.hEstatico, 0) + hfA), detalhe: detA };
        var bA = HP().escolherBomba(ctxA, Qs, estA, null, null, { tipos: ["motobomba"], bomba: par.bombaAquec }, "bomba do aquecimento");
        aqInfo.estimativa = estA; aqInfo.escolha = bA;
        var pA = aqInfo.bomba.x, B3 = aqInfo.bomba.B3;
        marca({ op: "familia", id: pid + "-bomba-aquec", famId: "hid-pisc-bomba-aquec", tipoId: "t-padrao", x: pA.x, y: yPiso, z: pA.z, rotY: r4(cm.rotY), inst: instBooster(B3, bA, planoA.dn) }, "equipamento");
        if (bA && bA.op) out.verificacoes.push({ id: "pisc.aquec.bomba", nome: "Bomba do aquecimento solar (" + bA.codigo + "): vazão de operação ≥ vazão do circuito", valor: f2(bA.op.Q), limite: "≥ " + f2(Qs), unidade: "m³/h", ok: bA.op.Q >= Qs - EPS, status: bA.op.Q >= Qs - EPS ? "atende" : "nao_atende", fonte: bA.fonte + "; desnível " + f2(estA.estatica) + " m + perdas " + f2(hfA) + " mca" });
        else pend("pisc.aquec.bomba", "nenhuma motobomba do catálogo vence o circuito solar (" + f2(Qs) + " m³/h a " + f2(estA.amt) + " mca): escolha com o fabricante");
      }
    }
    /* a CAMADA do barrilete: o caminho da sucção é o pior ramo + o barrilete (em série) */
    var dim = HP().dimensionar(g, par2);
    out.dim = dim;
    dim.decisoes.forEach(function (x) { out.decisoes.push(x); });
    dim.pendencias.forEach(function (x) { if (!out.pendencias.some(function (p) { return p.chave === x.chave; })) out.pendencias.push(x); });
    dim.verificacoes.forEach(function (x) { out.verificacoes.push(x); });
    if (falhas.length) aviso("Traçado sem caminho livre para: " + falhas.join(", ") + " — ficou em L direto (pode cruzar obstáculo). Arraste a casa de máquinas para um lugar mais aberto.", { tipo: "moverCM", sugestao: melhorCasa(g, estado, e.avaliarFam, par, casa) });
    /* NÃO ATENDE com a casa onde está → Corrigir */
    var ruim = dim.verificacoes.filter(function (v) { return v.status === "nao_atende" && /^pisc\.(npsh|autoescorva|bomba)/.test(v.id); });
    if (ruim.length) {
      var mc2 = melhorCasa(g, estado, e.avaliarFam, par, casa);
      ruim.forEach(function (v) {
        var acs = [];
        if (mc2 && cm.origem === "usuario") acs.push({ tipo: "moverCM", x: mc2.x, z: mc2.z, texto: "Voltar a casa de máquinas para o melhor lugar" });
        if (nivel === "superficie") acs.push({ tipo: "param", campo: "cmNivel", valor: "afogada", texto: "Enterrar a casa (bomba afogada)" });
        aviso("Com a casa de máquinas nesta posição: " + v.nome + " = " + v.valor + " (limite " + v.limite + " " + v.unidade + ") — NÃO ATENDE.", acs[0] || null);
        out.avisos[out.avisos.length - 1].acoes = acs;
      });
    }
    if (!dim.equipamentos.bomba) {
      var mc3 = cm.origem === "usuario" ? melhorCasa(g, estado, e.avaliarFam, par, casa) : null, acs3 = [];
      if (nivel === "superficie") acs3.push({ tipo: "param", campo: "cmNivel", valor: "afogada", texto: "Enterrar a casa (bomba afogada)" });
      if (mc3) acs3.push({ tipo: "moverCM", x: mc3.x, z: mc3.z, texto: "Voltar a casa de máquinas para o melhor lugar" });
      aviso("Com a casa de máquinas nesta posição nenhuma motobomba do catálogo atende: " + f2(Qp) + " m³/h a " + f2(dim.estimativa && dim.estimativa.amt) + " mca" + (nivel === "superficie" ? ", com a bomba " + f2(yBs - g.yAgua) + " m ACIMA do nível da água (autoescorva do fabricante)" : "") + " — NÃO ATENDE.", acs3[0] || null);
      out.avisos[out.avisos.length - 1].acoes = acs3;
    }
    /* ---- VERIFICAÇÕES DO QUE FOI LANÇADO (NBR 10339 / NBR 10818), cada uma com aviso e Corrigir quando NÃO ATENDE ---- */
    verificarLancado(out, { disps: disps, ralos: ralos, D: dim0.dispositivos, dim: dim, yA: yA, g: g, deR: deR, ctx: ctxF });
    avisarNaoAtende(out, dim, par);
    out.dispositivos = disps.map(function (d) { return { id: d.id, tipo: d.tipo, x: d.x, y: d.y, z: d.z, lado: d.lado }; });
    out.vala = { ySuccao: yS, yRetorno: yRv, yHidro: yHd, yAquecimento: yAq };
    out.aquecimento = aqInfo;
    out.cm = cm;
    out.ops = limpar.concat(novas);
    out.ok = true;
    return out;
  }

  /* AQUECIMENTO — 1ª fase (antes da grade): ONDE ficam a bomba de calor ou as placas, e os pontos de ida/volta.
     Derivação do retorno com by-pass e registros (o fabricante do filtro pede o aquecedor FORA da linha do filtro). */
  function planoAquec(cm, casa, g, estado, par, dim, snapPt) {
    var aq = par.aquecimento || {}, A = dim.aquecimento || {}, dn = (dim.linhas.solar || dim.linhas.recalque || {}).dn || 50;   // hid:ok reserva
    var P = { tipo: aq.tipo, dn: dn, A: A };
    /* os tês da derivação no trecho filtro → coluna do retorno (a ⅓ e ⅔ dele); ida e volta saem pela parede do FUNDO */
    var xSai = casa.x.filtro + casa.F.cs.x, xr = casa.x.retorno;   /* boca de saída da seletora: o conector da família */
    var hD = dn / 1000 * 1.2;   // hid:ok meia-largura do tê da família hid-pisc-derivacao
    P.xT1 = xSai + hD + 0.05; P.xT2 = Math.max(P.xT1 + 2 * hD + 0.12, xr - hD - 0.05);   // hid:ok folgas de 5 cm e by-pass de 12 cm
    var zF2 = casa.zFundo + geo(par, "espCasa") + 0.6;   // hid:ok 60 cm fora da parede do fundo
    P.fora = snapPt(paraMundo(cm, P.xT1, zF2)); P.xT1 = paraLocal(cm, P.fora.x, P.fora.z).x;
    if (P.xT1 - hD - xSai < 0.05) { P.fora = snapPt(paraMundo(cm, P.xT1 + geo(par, "passo"), zF2)); P.xT1 = paraLocal(cm, P.fora.x, P.fora.z).x; }   // hid:ok o trecho até o tê tem de existir (> 3 cm)
    if (P.xT2 - P.xT1 < 2 * hD + 0.1) P.xT2 = P.xT1 + 2 * hD + 0.15;   // hid:ok by-pass entre os tês
    P.off = snapPt(paraMundo(cm, P.xT2, zF2)); P.xT2 = paraLocal(cm, P.off.x, P.off.z).x;
    if (aq.tipo === "bomba_calor") {
      var bc = A.bombaCalor, n = bc && bc.norm || {};
      P.bc = bc; P.W = mm(n.largura_mm) || 0.95; P.Pr = mm(n.profundidade_mm) || 0.40; P.H = mm(n.altura_mm) || 0.65;   // hid:ok padrão da família
      P.pBC = paraMundo(cm, casa.x.retorno, casa.zFundo + geo(par, "espCasa") + 0.6 + P.Pr / 2 + 0.3);   // hid:ok afastada 30 cm
      return P;
    }
    var nPl = A.solar && A.solar.nPlacas, pl = A.solar && A.solar.placa, nn = pl && pl.norm || {};
    P.nPl = nPl; P.pl = pl;
    if (casa.B3) {
      /* a ida passa pela BOMBA DO AQUECIMENTO: sai pelo fundo em cima do bocal de recalque dela */
      var xRecA = casa.x.aquec + casa.B3.cr.x;   /* bocal de recalque: o conector da família */
      P.fora = snapPt(paraMundo(cm, xRecA, zF2)); P.xRecA = paraLocal(cm, P.fora.x, P.fora.z).x; P.xA = P.xRecA - casa.B3.cr.x;
    }
    P.Lp = mm(nn.comprimento_mm) || mm(nn.largura_mm) || 3.0; P.Wp = mm(nn.largura_mm && nn.comprimento_mm ? Math.min(nn.largura_mm, nn.comprimento_mm) : null) || 0.5;   // hid:ok padrão da família (3,0 × 0,5 m)
    P.Hp = 0.03; P.instPl = {};   // hid:ok espessura de reserva da placa
    var vPl = pl && HPF() ? HPF().doProduto("hid-pisc-coletor", prodTxt(pl)) : null;
    if (vPl) { P.instPl = vPl.inst; P.Lp = num(vPl.inst.Largura, P.Lp); P.Wp = num(vPl.inst.Profundidade, P.Wp); P.Hp = num(vPl.inst.Altura, P.Hp); }   /* a placa do catálogo: comprimento entre os coletores, largura e espessura */
    var lajes = arr(estado.caixas).filter(function (c) { return c && c.tipo === "laje"; }).map(function (c) { return { c: c, topo: c.cy + num(c.altura, 0) / 2 }; });
    var alvo = null;
    lajes.forEach(function (l) { var d = d2({ x: l.c.cx, z: l.c.cz }, cm); if (!alvo || l.topo > alvo.topo + 0.5 || (Math.abs(l.topo - alvo.topo) <= 0.5 && d < alvo.d)) alvo = { l: l.c, topo: l.topo, d: d }; });   // hid:ok lajes a menos de 0,5 m de altura = o mesmo telhado
    if (!(alvo && alvo.topo > g.yBorda + 1)) return P;   // hid:ok telhado = laje acima do térreo (1 m)
    var c = alvo.l, cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), hc = num(c.comprimento, 0) / 2, hw = num(c.espessura, 0) / 2;
    var cantos = [[-hc, -hw], [hc, -hw], [hc, hw], [-hc, hw]].map(function (q) { return { x: c.cx + q[0] * cs + q[1] * sn, z: c.cz - q[0] * sn + q[1] * cs, q: q }; });
    cantos.sort(function (a, b) { return d2(a, cm) - d2(b, cm); });
    var k0 = cantos[0], sx = k0.q[0] < 0 ? 1 : -1, sz = k0.q[1] < 0 ? 1 : -1;
    P.laje = c; P.yTop = r4(alvo.topo); P.calco = 0.05;   // hid:ok placas sobre calços de 5 cm
    P.dirX = { x: cs * sx, z: -sn * sx }; P.dirZ = { x: sn * sz, z: cs * sz };
    P.cabe = Math.max(1, Math.floor((2 * hc - 0.4) / P.Wp));   // hid:ok 20 cm de cada borda
    P.placas = Math.max(1, num(nPl, 1));
    P.pIni = add(add(k0, P.dirX, 0.2 + P.Wp / 2), P.dirZ, 0.2 + P.Lp / 2);   // hid:ok 20 cm da borda
    /* a subida pela face da obra, fora da laje, no canto mais perto da casa de máquinas (ida e volta a 15 cm) */
    var fora2 = add(add(k0, P.dirX, -(geo(par, "passo") * 3)), P.dirZ, -(geo(par, "passo") * 3));   // hid:ok 3 passos fora da obra
    P.pRiser = snapPt(fora2); P.pR2 = snapPt(add(fora2, P.dirX, -(geo(par, "passo") * 2)));   // hid:ok volta 2 passos ao lado da ida
    return P;
  }
  /* 2ª fase: as famílias e os tubos */
  function executarAquec(P, cm, g, par, xr, yR, yRv, tubo, poli, rotear, marca, decide, pend, pid, casa, yPiso) {
    var dn = P.dn, out = { tipo: P.tipo };
    var pIda = P.T1, pVol = P.T2;
    if (P.tipo === "bomba_calor") {
      marca({ op: "familia", id: pid + "-bomba-calor", famId: "hid-pisc-bomba-calor", tipoId: "t-padrao", x: P.pBC.x, y: g.yBorda, z: P.pBC.z, rotY: r4(cm.rotY), inst: { Largura: P.W, Profundidade: P.Pr, Altura: P.H, DN: dn, Produto: P.bc ? P.bc.fabricante + " " + P.bc.codigo : "", Fonte: P.bc ? P.bc.fonte : "", A_conferir: !P.bc } }, "equipamento");
      tubo("pisc_aquec", dn, pIda, { x: P.fora.x, y: pIda.y, z: P.fora.z }, "aquecimento", pid + "-aquecIda", "p2");
      tubo("pisc_aquec", dn, pVol, { x: P.off.x, y: pVol.y, z: P.off.z }, "aquecimento", pid + "-aquecVolta", "p2");
      decide("pisc.aquec.bc", "Bomba de calor ao lado da casa de máquinas (ao ar livre), em DERIVAÇÃO do retorno com by-pass e registros: o fabricante do filtro pede o aquecedor fora da linha do filtro (manual Sodramar FM, PDF p.19).");
      pend("pisc.aquec.bc.ligacao", "ligar as esperas de ida e volta à bomba de calor conforme a posição dos bocais do modelo escolhido (o catálogo não dá a cota dos bocais)");
      return out;
    }
    if (!P.nPl) pend("pisc.solar.placas", "número de placas coletoras não calculado (sem a regra do fabricante): lançada 1 placa de referência");
    if (casa && casa.B3 && P.xA != null) {
      /* ida: tê → para trás da fila de equipamentos → sobe 15 cm → ao longo até a bomba do aquecimento → desce ao eixo → entra
         na sucção; recalque (topo) → sobe → sai pelo fundo na vertical do bocal */
      var B3 = casa.B3, zB = casa.zEq + casa.prof / 2 + 0.12, yI = r4(yR + 0.15), yI2 = r4(yI + 0.15), yAx = r4(yPiso + B3.cs.y), yTopB = r4(yPiso + B3.cr.y);   // hid:ok folgas de desenho; eixo e bocais: conectores da família
      var lx = function (xl, zl, y) { var q = paraMundo(cm, xl, zl); return { x: q.x, y: y, z: q.z }; };
      var xT1 = paraLocal(cm, pIda.x, pIda.z).x, xS = P.xA + B3.cs.x - 0.12;   // hid:ok 12 cm antes do bocal de sucção
      var pts = [pIda, lx(xT1, zB, yR), lx(xT1, zB, yI), lx(xS, zB, yI), lx(xS, casa.zEq, yI), lx(xS, casa.zEq, yAx), lx(P.xA + B3.cs.x, casa.zEq, yAx)];
      poli("pisc_aquec", dn, pts, "aquecimento", pid + "-aquecIda");
      poli("pisc_aquec", dn, [lx(P.xRecA, casa.zEq, yTopB), lx(P.xRecA, casa.zEq, yI2), { x: P.fora.x, y: yI2, z: P.fora.z }, { x: P.fora.x, y: yRv, z: P.fora.z }], "aquecimento", pid + "-aquecIda");
      out.bomba = { x: lx(P.xA, casa.zEq, yPiso), B3: B3 };
    } else {
      tubo("pisc_aquec", dn, pIda, { x: P.fora.x, y: pIda.y, z: P.fora.z }, "aquecimento", pid + "-aquecIda");
      tubo("pisc_aquec", dn, { x: P.fora.x, y: pIda.y, z: P.fora.z }, { x: P.fora.x, y: yRv, z: P.fora.z }, "aquecimento", pid + "-aquecIda", P.laje ? null : "p2");
    }
    tubo("pisc_aquec", dn, pVol, { x: P.off.x, y: pVol.y, z: P.off.z }, "aquecimento", pid + "-aquecVolta");
    tubo("pisc_aquec", dn, { x: P.off.x, y: pVol.y, z: P.off.z }, { x: P.off.x, y: yRv, z: P.off.z }, "aquecimento", pid + "-aquecVolta", P.laje ? null : "p2");
    if (!P.laje) {
      pend("pisc.solar.telhado", "sem laje/telhado acima do térreo no modelo: as placas coletoras ficam a posicionar no projeto de cobertura (esperas de ida e volta fora da casa de máquinas)");
      out.esperas = true;
      return out;
    }
    var n = Math.min(P.placas, P.cabe);
    if (P.placas > P.cabe) pend("pisc.solar.area", P.placas + " placas não cabem numa fila sobre a laje " + P.laje.id + " (cabem " + P.cabe + "): o resto fica para o projeto de cobertura");
    var rotPl = r4(Math.atan2(-P.dirX.z, P.dirX.x));
    for (var i = 0; i < n; i++) {
      var p = add(P.pIni, P.dirX, i * P.Wp);
      marca({ op: "familia", id: pid + "-coletor" + (i + 1), famId: "hid-pisc-coletor", tipoId: "t-padrao", x: r4(p.x), y: r4(P.yTop + P.calco), z: r4(p.z), rotY: r4(rotPl + Math.PI / 2), inst: instEq(P.instPl, { Largura: r4(P.Lp), Profundidade: r4(P.Wp), Altura: r4(P.Hp), DN: dn, Produto: P.pl ? P.pl.fabricante + " " + P.pl.codigo : "", Fonte: P.pl ? P.pl.fonte : "", A_conferir: !P.pl }) }, "equipamento");
    }
    /* as placas em PARALELO: coletor (header) de ida ligando as entradas, de volta ligando as saídas; a placa fica sobre calços
       (5 cm) e o eixo do header na altura dos bocais dela */
    var w = { x: P.dirX.z, z: -P.dirX.x }, yH = r4(P.yTop + P.calco + P.Hp / 2);   /* bocal a meia altura da placa (conector da família) */
    var ents = [], sais = [], hE = [], hS = [], OFF = geo(par, "passo") * 1.5;   // hid:ok header 15 cm além da ponta das placas
    for (var j = 0; j < n; j++) { var pj = add(P.pIni, P.dirX, j * P.Wp); ents.push(add(pj, w, -P.Lp / 2)); sais.push(add(pj, w, P.Lp / 2)); hE.push(add(pj, w, -P.Lp / 2 - OFF)); hS.push(add(pj, w, P.Lp / 2 + OFF)); }
    function ate(R0, alvo, y) { var dv = (alvo.x - R0.x) * P.dirZ.x + (alvo.z - R0.z) * P.dirZ.z, q = add(R0, P.dirZ, dv); return [{ x: R0.x, y: y, z: R0.z }, { x: q.x, y: y, z: q.z }, { x: alvo.x, y: y, z: alvo.z }]; }
    poli("pisc_aquec", dn, rotear(P.fora, P.pRiser, yRv, "A", "Aquecimento (ida)"), "aquecimento", pid + "-aquecIda");
    tubo("pisc_aquec", dn, { x: P.pRiser.x, y: yRv, z: P.pRiser.z }, { x: P.pRiser.x, y: yH, z: P.pRiser.z }, "aquecimento", pid + "-aquecIda");
    /* header (coletor) de ida 15 cm além das entradas; um toco do header até a entrada de cada placa (o tê fica no header) */
    poli("pisc_aquec", dn, ate(P.pRiser, hE[0], yH), "aquecimento", pid + "-aquecIda");
    for (var a1 = 1; a1 < n; a1++) tubo("pisc_aquec", dn, { x: hE[a1 - 1].x, y: yH, z: hE[a1 - 1].z }, { x: hE[a1].x, y: yH, z: hE[a1].z }, "aquecimento", pid + "-aquecIda");
    for (var b1 = 0; b1 < n; b1++) tubo("pisc_aquec", dn, { x: hE[b1].x, y: yH, z: hE[b1].z }, { x: ents[b1].x, y: yH, z: ents[b1].z }, "aquecimento", pid + "-aquecIda");
    poli("pisc_aquec", dn, rotear(P.off, P.pR2, yRv, "A", "Aquecimento (volta)"), "aquecimento", pid + "-aquecVolta");
    tubo("pisc_aquec", dn, { x: P.pR2.x, y: yRv, z: P.pR2.z }, { x: P.pR2.x, y: yH, z: P.pR2.z }, "aquecimento", pid + "-aquecVolta");
    poli("pisc_aquec", dn, ate(P.pR2, hS[0], yH), "aquecimento", pid + "-aquecVolta");
    for (var a2 = 1; a2 < n; a2++) tubo("pisc_aquec", dn, { x: hS[a2 - 1].x, y: yH, z: hS[a2 - 1].z }, { x: hS[a2].x, y: yH, z: hS[a2].z }, "aquecimento", pid + "-aquecVolta");
    for (var b2 = 0; b2 < n; b2++) tubo("pisc_aquec", dn, { x: hS[b2].x, y: yH, z: hS[b2].z }, { x: sais[b2].x, y: yH, z: sais[b2].z }, "aquecimento", pid + "-aquecVolta");
    var yV = yH;
    out.placas = n; out.laje = P.laje.id; out.hEstatico = r4(yV - g.yAgua);
    decide("pisc.aquec.solar", n + " placa(s) coletora(s) sobre a laje " + P.laje.id + " (canto mais perto da casa de máquinas), em derivação do retorno com by-pass e registros; ida e volta pela vala e subida pela face da obra. Desnível até as placas: " + f2(out.hEstatico) + " m (somado à altura manométrica de quem bombeia o circuito solar).");
    return out;
  }

  var HidPiscinaRede = { VERSAO: 1, GEO: GEO, gerar: gerar, melhorCasa: melhorCasa, montarCasa: montarCasa, _int: { paraMundo: paraMundo, paraLocal: paraLocal, orientar: orientar, distPoligono: distPoligono, Vala: Vala, vivas: vivas } };
  global.HidPiscinaRede = HidPiscinaRede;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPiscinaRede;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
