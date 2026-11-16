/* =====================================================================
 * concprops.js — AS PROPRIEDADES FÍSICAS DA PEÇA DE CONCRETO (viga, pilar, laje, sapata/baldrame)
 * 16/11/2026 · frente "props físicas". Motor PURO, ES5, Node-testável: tools/test-conc-props-fisicas.js.
 *
 * O PEDIDO (Rogério, prints da paleta Propriedades de uma "Viga por perfil 14 × 25 cm", material "Concreto armado"):
 * "Peso" vazio, "Peso exato" vazio, "Área de pintura" vazia; no bloco Peso: "sem peso — por quê: sem material no IFC",
 * "Material —", "Peso específico [Informar]". Os parâmetros STEEL_ELEM_* do registro (js/bimparam.js) eram só do aço, e o
 * elemento `edit:<id>` do modelador nasce sem `materiais` (a lista de material do IFC), então o js/bimpeso.js não sabia que a
 * viga é de concreto. Aqui mora o que o APP sabe da peça: material, γ, volume, peso, áreas e aço.
 *
 *   ConcProps.reconhecer(caixa, { nomeMaterial })  → { papel, simples, rotulo } | null   (null = não é concreto)
 *   ConcProps.gamaDe(caixa, rec, { tipoValores, usuario }) → { kNm3, origem, ref }
 *   ConcProps.fisica(x)   x = o contexto do registro (BimParam): { el, m, sec, tipo, concAco, gamaUsuario, concTaxa }
 *   ConcProps.acoPorPeca(pacote, ConcDetalhe) → { porId: { id: { kg, posicoes, ... } }, totalKg } — do ÚLTIMO Calcular
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ DE ONDE VEM CADA NÚMERO (nada aqui é inventado)
 *
 * PESO ESPECÍFICO γ (kN/m³) — ABNT NBR 6120:2019, Tabela 1 (continuação, p. 15 do PDF), item "3 Argamassas e concretos":
 *   concreto armado = 25 · concreto simples = 24 (valores "para o estado endurecido"). Lido no texto da cópia licenciada
 *   da biblioteca da RA (BIBLIOTECA TÉCNICA - NORMAS\_ÍNDICE\texto\ABNT NBR 6120-2019.txt) e é o mesmo número que o motor de
 *   cálculo já usa (js/concdadoscalc.js: pesoConcretoArmado 25 e pesoConcretoSimples 24, status "norma-lida").
 *   Ordem de quem manda (a mesma do js/bimpeso.js): γ INFORMADO PARA A PEÇA > γ do TIPO > γ informado para o MATERIAL
 *   (painel "Peso das peças") > a norma. A norma só entra quando ninguém informou.
 *   ⚠ O 25 da NBR 6120 já embute a armadura MÉDIA do concreto armado; o 24 é o concreto sem armadura.
 *
 * VOLUME — o da geometria real da peça (BimEdit.medidasDe com `exato`): já desconta o que a união de geometria cortou
 *   ("corta e14 0,0467 m³"). "Peso" = seção do tipo × comprimento × γ (a leitura nominal, como a do catálogo do aço);
 *   "Peso exato" = volume real × γ. Sem corte, os dois são iguais.
 *
 * ÁREA DE PINTURA / ACABAMENTO (concreto) — definição ADOTADA e documentada:
 *   = a superfície EXPOSTA da peça, que é a mesma que a fôrma moldou: viga = 2 laterais + fundo (o topo fica sob a laje ou o
 *   contrapiso); pilar = todas as laterais (perímetro da seção × comprimento); laje = o fundo (o forro); baldrame = como viga.
 *   ⚠ NÃO desconta a face de contato com a laje/pilar quando há união de geometria: a união de geometria desconta o VOLUME
 *   (js/bimarq.js descontarUnioes), não a área das faces da viga — fazer isso pede o recorte face a face da viga, hoje só
 *   existente para a parede. Por isso a área é "a maior": para pintura é o lado seguro. A tela diz isso e conta quantas uniões a
 *   peça tem. PENDÊNCIA declarada no relatório da frente.
 *
 * AÇO DA PEÇA (kg):
 *   · COM Calcular em dia (ConcUI.calcular → ConcCalcular + ConcDetalhe, assinatura do modelo igual à de agora): o aço REAL
 *     daquela peça = soma das posições detalhadas (líquido, sem a perda); taxa real = aço ÷ volume da peça.
 *   · SEM Calcular (nunca rodou, o modelo mudou depois, ou a peça ficou sem detalhamento): ESTIMATIVA pela taxa de
 *     100 kg/m³ (js/concdados.js taxaAcoKgM3 — Jablonski 2013, o MAIOR das médias), marcada como estimativa em letra clara.
 *   · Sapata/bloco: a taxa de aço da PRÓPRIA fundação (BimFundacao); a fundação não passa pelo Calcular.
 *   ⚠ Não troca nem lê a taxa do SERVIÇO de armação do orçamento: este arquivo não escreve em orçamento nenhum.
 *
 * PESO TOTAL (concreto + aço) = volume × γ do concreto SIMPLES (24 — a norma) + aço (real ou estimado). Não é "Peso" + aço:
 *   o 25 do concreto armado já inclui armadura média, somar o aço de novo contaria a armadura duas vezes.
 * ===================================================================== */
(function (global) {
  "use strict";

  var G = 9.80665;   /* m/s² (CGPM 1901 / ISO 80000-3) — a mesma do js/bimpeso.js: kN → kg */
  var REF_NORMA = "ABNT NBR 6120:2019, Tab. 1 (p. 15 do PDF), item 3 Argamassas e concretos — estado endurecido";
  var G_ARMADO = 25, G_SIMPLES = 24, TAXA_PADRAO = 100;
  var GAMA_MIN = 1, GAMA_MAX = 100;   /* trava de sanidade do γ informado (kN/m³): o aço é 77,8, o chumbo 113 */

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* sem o módulo */ } } return null; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function norm(s) { s = String(s == null ? "" : s).toLowerCase(); return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }

  /* os valores da norma, do motor de cálculo (com a fonte) e, sem ele, as constantes acima */
  function cv(k, d) { var X = dep("ConcDadosCalc", "./concdadoscalc.js"); try { return X && typeof X.v === "function" ? num(X.v(k, d), d) : d; } catch (e) { return d; } }
  function gArmado() { return cv("pesoConcretoArmado", G_ARMADO); }
  function gSimples() { return cv("pesoConcretoSimples", G_SIMPLES); }
  function taxaPadrao() {
    var D = dep("ConcDados", "./concdados.js"), c = D && D.criterios && D.criterios.taxaAcoKgM3;
    return c && fin(c.valor) && c.valor > 0 ? c.valor : TAXA_PADRAO;
  }
  function perdaAco() { var X = dep("ConcDadosCalc", "./concdadoscalc.js"); try { return X && typeof X.v === "function" ? num(X.v("acoPerdaFracao", 0.10), 0.10) : 0.10; } catch (e) { return 0.10; } }

  /* ---------------------------------------------------------------- reconhecer */
  /* a peça é de concreto? viga/pilar sem perfil de catálogo e com material "concreto" (o padrão do app), laje e fundação.
     "Concreto simples": o flag `concretoSimples` da peça ou o NOME do material (do projeto ou do IFC) — "concreto simples", "concreto
     magro", "concreto não armado" — pelo mesmo critério de nome do js/bimpeso.js. Madeira e aço: null. */
  function nomeSimples(nome) {
    var n = norm(nome);
    return /(^|[^a-z])concreto (simples|magro|nao armado)/.test(n) || /plain concrete|lean concrete/.test(n);
  }
  function reconhecer(c, opc) {
    if (!c || typeof c !== "object") return null;
    var t = c.tipo;
    if (t === "viga" || t === "pilar") {
      if ((c.material || "concreto") !== "concreto") return null;
      if (c.perfil && c.perfil.cat) return null;                   /* perfil de catálogo (W, C, L, HSS) = aço */
    } else if (t !== "laje" && t !== "fundacao") return null;
    var simples = c.concretoSimples === true || nomeSimples(opc && opc.nomeMaterial);
    return { papel: t, simples: simples, rotulo: simples ? "Concreto simples" : "Concreto armado" };
  }

  /* ---------------------------------------------------------------- γ */
  function gamaValido(v) { var n = num(v, null); return n != null && n >= GAMA_MIN && n <= GAMA_MAX ? n : null; }
  /* a peça (el.params.pesoEsp) > o tipo (tipo.valores.pesoEsp) > o informado para o material (painel Peso das peças) > a norma */
  function gamaDe(c, rec, o) {
    o = o || {};
    var p = gamaValido(c && c.params && c.params.pesoEsp);
    if (p != null) return { kNm3: p, origem: "peça", ref: "informado para esta peça" };
    var t = gamaValido(o.tipoValores && o.tipoValores.pesoEsp);
    if (t != null) return { kNm3: t, origem: "tipo", ref: "informado no tipo da peça" };
    var u = o.usuario && gamaValido(o.usuario.kNm3);
    if (u != null) return { kNm3: u, origem: "material", ref: (o.usuario.ref ? String(o.usuario.ref) : "informado para o material \"" + rec.rotulo + "\" (painel Peso das peças)") };
    return { kNm3: rec.simples ? gSimples() : gArmado(), origem: "norma", ref: REF_NORMA + (rec.simples ? " — concreto simples" : " — concreto armado") };
  }

  /* ---------------------------------------------------------------- conta */
  function kgDe(kN) { return kN * 1000 / G; }
  function volumeNominal(c, x, vol) {
    /* seção do tipo × comprimento (viga/pilar); laje e fundação não têm "seção do catálogo": o nominal é o volume real */
    if ((c.tipo === "viga" || c.tipo === "pilar") && x.sec && x.sec.ok && fin(x.sec.area) && x.m && fin(x.m.comprimento) && x.m.comprimento > 0) return x.sec.area * x.m.comprimento;
    return vol;
  }
  function textoUnioes(c) {
    var l = arr(c && c.uniaoGeo).filter(function (u) { return u && num(u.volume, 0) > 1e-9; });
    return l.length ? " Peça unida a " + l.length + " peça(s) (" + l.map(function (u) { return String(u.com); }).join(", ") + "): a união desconta o volume, não a face — área a maior." : "";
  }
  var BASE_PINTURA = {
    viga: "2 laterais + fundo (o topo fica sob a laje ou o contrapiso)",
    pilar: "todas as laterais (perímetro da seção × comprimento)",
    laje: "o fundo (o forro); o topo leva contrapiso ou impermeabilização",
    fundacao: "as laterais moldadas (enterradas: não se pinta; vale para a fôrma)"
  };

  /* o aço: real (Calcular em dia) ou estimativa — SEMPRE diz qual */
  function acoDe(c, rec, vol, x) {
    var m = x.m || {};
    if (rec.simples) return { kg: 0, taxa: 0, calculado: false, estimado: false, texto: "concreto simples: sem armadura" };
    if (c.tipo === "fundacao") {
      var kgF = fin(m.aco) ? m.aco : null, txF = num(c.taxaAco, null);
      if (kgF != null && vol > 0) return { kg: kgF, taxa: kgF / vol, calculado: false, estimado: true, texto: "estimativa pela taxa de aço da fundação (" + fmt(txF != null ? txF : kgF / vol, 1) + " kg/m³) — a fundação não passa pelo Calcular" };
    }
    var ca = x.concAco;
    if (ca && fin(ca.kg) && ca.kg >= 0 && vol > 0) {
      return { kg: ca.kg, taxa: ca.kg / vol, calculado: true, estimado: false,
        texto: "calculado (Calcular + detalhamento " + (ca.rotulo ? ca.rotulo + ", " : "") + fmt(ca.posicoes || 0, 0) + " posições, líquido, sem a perda de " + fmt(perdaAco() * 100, 0) + " %)" };
    }
    var tx = fin(x.concTaxa) && x.concTaxa > 0 ? x.concTaxa : taxaPadrao(), nota = ca && ca.motivo ? " — " + ca.motivo : "";
    if (c.tipo === "fundacao") return { kg: vol * tx, taxa: tx, calculado: false, estimado: true,
      texto: "Aço estimado pela taxa " + fmt(tx, 0) + " kg/m³ (estimativa — a fundação não passa pelo Calcular; informe a taxa de aço da fundação)" };
    return { kg: vol * tx, taxa: tx, calculado: false, estimado: true,
      texto: "Aço estimado pela taxa " + fmt(tx, 0) + " kg/m³ (estimativa — calcule a estrutura)" + nota };
  }
  function fmt(v, casas) { return (+v).toFixed(casas == null ? 2 : casas).replace(".", ","); }

  /* ---------------------------------------------------------------- fisica */
  function fisica(x) {
    if (!x || !x.el) return null;
    var c = x.el, rec = reconhecer(c, { nomeMaterial: x.materialNome });
    if (!rec) return null;
    var m = x.m || {}, vol = fin(m.volume) ? m.volume : null;
    var usuario = x.gamaUsuario;
    if (usuario === undefined && typeof x.pesoUsuarioDe === "function") { try { usuario = x.pesoUsuarioDe(rec.rotulo); } catch (e) { usuario = null; } }   /* o γ informado para o MATERIAL (painel Peso das peças) */
    var g = gamaDe(c, rec, { tipoValores: x.tipo && x.tipo.valores, usuario: usuario });
    var f = { papel: rec.papel, simples: rec.simples, material: rec.rotulo, gama: g, volume: vol, volumeNominal: null,
      pesoKN: null, pesoKg: null, pesoT: null, pesoNominalKg: null, pesoNominalKN: null,
      areaForma: fin(m.areaForma) ? m.areaForma : null, areaPintura: null, basePintura: null, aco: null, totalKg: null, totalKN: null };
    if (vol == null) return f;
    var vN = volumeNominal(c, x, vol);
    f.volumeNominal = vN;
    f.pesoKN = vol * g.kNm3; f.pesoKg = kgDe(f.pesoKN); f.pesoT = f.pesoKg / 1000;
    f.pesoNominalKN = vN * g.kNm3; f.pesoNominalKg = kgDe(f.pesoNominalKN);
    if (c.tipo !== "fundacao") { f.areaPintura = f.areaForma; f.basePintura = "Superfície exposta = " + BASE_PINTURA[c.tipo] + "." + textoUnioes(c); }
    f.aco = acoDe(c, rec, vol, x);
    /* concreto SEM armadura (24) + aço: o 25 do armado já traz a armadura média — somar de novo contaria duas vezes */
    f.totalKN = vol * (rec.simples ? g.kNm3 : gSimples()) + f.aco.kg * G / 1000;
    f.totalKg = kgDe(vol * (rec.simples ? g.kNm3 : gSimples())) + f.aco.kg;
    return f;
  }

  /* ---------------------------------------------------------------- aço real por peça (do último Calcular) */
  /* pacote = ConcMemorial.pacoteDe(resultadoDoCalcular) → { an, dv, dp, lajes }. O detalhamento (ConcDetalhe.detalharDeAnalise) é o mesmo
     que o memorial e a tabela de aço usam — um só número de aço no sistema. Devolve o aço por ID DA PEÇA do modelo. */
  function acoPorPeca(pac, DT) {
    DT = DT || dep("ConcDetalhe", "./concdetalhe.js");
    if (!pac || !pac.an || !DT || typeof DT.detalharDeAnalise !== "function") return null;
    var lj = arr(pac.lajes).map(function (L) { return { res: L.res, g: L.lm && DT.gDeLajeModelo ? DT.gDeLajeModelo(pac.an, L.lm) : null }; }).filter(function (q) { return q.g; });
    var det = null;
    try { det = DT.detalharDeAnalise(pac.an, pac.dv, pac.dp, lj, { caa: pac.projeto && pac.projeto.caa }); } catch (e) { det = null; }
    if (!det || !det.ok) return null;
    var porId = {}, total = 0;
    function soma(id, r) {
      var kg = 0, n = 0; arr(r && r.posicoes).forEach(function (p) { if (fin(p.kg)) { kg += p.kg; n++; } });
      var k = String(id), o = porId[k] || (porId[k] = { kg: 0, posicoes: 0 });
      o.kg += kg; o.posicoes += n; total += kg;
    }
    var vigaDoTramo = {};
    arr(pac.dv && pac.dv.vigas).forEach(function (v) { arr(v.tramos).forEach(function (t) { vigaDoTramo[String(t.id)] = String(v.id); }); });
    arr(det.vigas).forEach(function (r) { soma(vigaDoTramo[String(r.id)] != null ? vigaDoTramo[String(r.id)] : r.id, r); });
    arr(det.pilares).forEach(function (r) { soma(r.id, r); });
    arr(det.lajes).forEach(function (r) { soma(r.id, r); });
    return { porId: porId, totalKg: total, ok: true };
  }

  var ConcProps = {
    G: G, REF_NORMA: REF_NORMA, G_ARMADO: G_ARMADO, G_SIMPLES: G_SIMPLES, TAXA_PADRAO: TAXA_PADRAO, GAMA_MIN: GAMA_MIN, GAMA_MAX: GAMA_MAX,
    reconhecer: reconhecer, gamaDe: gamaDe, gamaValido: gamaValido, fisica: fisica, acoPorPeca: acoPorPeca, nomeSimples: nomeSimples
  };
  global.ConcProps = ConcProps;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcProps;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
