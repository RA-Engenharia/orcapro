/* =====================================================================
 * hidpiscinafam.js — FAMÍLIAS da PISCINA (.opfam, js/familia.js): equipamentos da casa de máquinas e dispositivos do
 * tanque com a VOLUMETRIA e a COR do produto comprado (regra do Rogério: tudo o que é modelado tem de parecer o produto).
 * Frente PISCINA, 18/10/2026 (rodada 2: forma pelas vistas cotadas e cor pelas fotos dos catálogos). ES5, sem DOM.
 *
 * COMO A MEDIDA E A COR ENTRAM: cada família tem parâmetros de INSTÂNCIA com as cotas do produto e o MATERIAL de cada
 * parte (Mat_*). HidPiscinaFam.doProduto(famId, "Fabricante Código") lê dados-fonte/hidro/piscina/volumetria-piscina.json
 * (via js/hidpiscinadados.js, gerado): a cota do desenho dimensional (mm → m) e a cor lida da foto, com a página. O
 * lançamento (js/hidpiscinarede.js) põe isso na instância. Sem o produto na tabela, fica a proporção de desenho e
 * A_conferir.
 * ⚠ Os números dentro das fórmulas (entre aspas) são PROPORÇÃO DE DESENHO sobre a cota do catálogo (onde fica o pote do
 *   pré-filtro, a espessura da aleta…) — não são valor de norma nem de manual. Os padrões de reserva fora de aspas
 *   ficam no bloco hid:geometria (tools/test-hid-sem-numero-magico.js).
 * Convenção (familia.js): origem no PISO/FUNDO, X ao longo, Y para cima, Z para a frente. Dispositivo de parede:
 * Z aponta para DENTRO da piscina (a face da parede é z = 0; o corpo fica atrás, em z < 0, e o conector no fim dele).
 * Caixa: x,z = centro, y = base. Cilindro em y: x,z = centro, y = base; em x/z: x (ou z) = início, o resto = eixo.
 * Revolução: perfil [[raio, posição no eixo]]; eixo x/z deita o sólido (x,y,z = a base no eixo).
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function dep(nome, caminho) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(caminho); } catch (e) {} }
    return null;
  }
  function DADOS() { return dep("HidPiscinaDados", "./hidpiscinadados.js") || {}; }
  var PSET = "RA_Piscina";
  function P(nome, tipoDado, escopo, valor, grupo, descricao, formula) { var p = { nome: nome, tipoDado: tipoDado, escopo: escopo, valor: valor, grupo: grupo, descricao: descricao }; if (formula) p.formula = formula; return p; }
  var GEO = "Dimensões", PRD = "Produto", MAT = "Materiais";
  function M(nome, valor, desc) { return P(nome, "material", "instancia", valor, MAT, desc + " (cor da foto do catálogo)"); }
  function prodParams() {
    return [P("Produto", "texto", "instancia", "", PRD, "Fabricante e modelo (do catálogo)"), P("Fonte", "texto", "instancia", "", PRD, "Documento e página do catálogo"),
            P("Fonte_forma", "texto", "instancia", "", PRD, "Página da vista cotada e da foto usadas na forma e na cor"),
            P("A_conferir", "simnao", "instancia", false, PRD, "Alguma cota é proporção de desenho (o catálogo não a imprime)")];
  }
  function fam(id, nome, cat, sistemas, params, sol, con, qtd, desc) {
    return { id: id, nome: nome, categoria: cat, hospedagem: "livre", pset: PSET, origem: "HidPiscina", sistemas: sistemas,
             descricao: (desc || nome) + " [Gerada por HidPiscinaFam — não editar à mão.]", parametros: prodParams().concat(params),
             tipos: [{ id: "t-padrao", nome: "Padrão", valores: {} }], solidos: sol, conectores: con,
             quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: qtd || nome } };
  }
  /* sólidos de apoio (expressões em texto) */
  function rev(id, nome, eixo, x, y, z, perfil, mat, seg, extra) {
    var o = { id: id, nome: nome, forma: "revolucao", eixo: eixo, x: x, y: y, z: z, perfil: perfil, material: mat, segmentos: seg || SEG.liso };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function cil(id, nome, eixo, x, y, z, raio, altura, mat, extra) {
    var o = { id: id, nome: nome, forma: "cilindro", eixo: eixo, x: x, y: y, z: z, raio: raio, altura: altura, material: mat };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function cx(id, nome, x, y, z, dx, dy, dz, mat, extra) {
    var o = { id: id, nome: nome, forma: "caixa", x: x, y: y, z: z, dx: dx, dy: dy, dz: dz, material: mat };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  /* tubo deitado em x com a ponta em xa e comprimento L (L pode ser negativo: vai para −x) */
  function tuboX(id, nome, xa, L, y, z, r, mat, extra) { return cil(id, nome, "x", "min(" + xa + "; " + xa + " + (" + L + "))", y, z, r, "abs(" + L + ")", mat, extra); }

  /* hid:geometria-inicio — padrões de RESERVA das famílias (sem o produto na tabela de volumetria) e nº de aletas desenháveis */
  var RES = {
    filtro: { Diametro: 0.43, Altura: 0.855, Altura_bocas: 0.63, DN: 50 },
    bomba: { Comprimento: 0.56, Largura: 0.24, Altura: 0.30, Altura_eixo: 0.17, Comprimento_motor: 0.25, Recalque_x: 0.28, DN: 50 },
    casa: { Comprimento: 1.6, Largura: 1.2, Altura: 1.5, Espessura: 0.12, Alcapao: 0.8 },
    disp: { Flange: 0.12, Corpo: 0.20, Corpo_produto: 0.05, Saliencia: 0.012, DN: 50 },
    skimmer: { Largura: 0.30, Profundidade: 0.45, Altura: 0.55, Boca: 0.15, Tampa: 0.20, DN: 50 },
    ralo: { Grelha: 0.22, Altura_total: 0.15, Altura_corpo: 0.12, DN: 50 },
    quadro: [0.40, 0.15, 0.50], bombaCalor: [0.95, 0.40, 0.65], coletor: [3.0, 0.5, 0.03], emergencia: [0.12, 0.10, 1.20], acionador: [0.06, 0.06, 0.03],
    flangeAsp: 0.14, flangeSuccHidro: 0.20, flangeHidro: 0.11, flangeRef: 0.17, corpoRef: 0.12,
    /* PROJETO EM UM CLIQUE (frente C, 19/10/2026): caixa receptora do descarte, poço de drenagem da casa de máquinas e ponto
       de reposição — medidas de DESENHO (o lançamento põe a separação livre da norma na instância) */
    caixaDescarte: { Largura: 0.50, Profundidade: 0.40, Altura: 0.40, Livre: 0.35, Afast: 0.075, DN: 50, DN_saida: 100 },
    poco: { Lado: 0.30, Profundidade: 0.35, Saida: 0.40, DN: 32 },
    reposicao: { Altura: 0.25, Alcance: 0.50, DN: 25 }
  };
  var ALETAS_MAX = 16;
  var SEG = { liso: 24, grande: 32, aleta: 8, cesto: 16 };   /* segmentos das revoluções (malha) */
  /* hid:geometria-fim */

  /* ---------------- FILTRO DE AREIA: tanque, faixa, pé, VÁLVULA SELETORA no topo com manômetro e visor, 3 bocas com união, dreno */
  function filtro() {
    var ps = [
      P("Diametro", "comprimento", "instancia", RES.filtro.Diametro, GEO, "Diâmetro do tanque (catálogo: Ø)"),
      P("Altura", "comprimento", "instancia", RES.filtro.Altura, GEO, "Altura total com a manopla (catálogo: D)"),
      P("Altura_bocas", "comprimento", "instancia", RES.filtro.Altura_bocas, GEO, "Altura das bocas da válvula seletora (catálogo: A)"),
      P("DN", "numero", "instancia", RES.filtro.DN, "Hidráulica", "DN das conexões (mm, PVC soldável)"),
      M("Mat_tanque", "Plástico", "Tanque"), M("Mat_faixa", "Plástico", "Faixa"), M("Mat_valvula", "Plástico", "Válvula seletora, pé e dreno"),
      M("Mat_uniao", "Plástico", "Uniões das bocas"), M("Mat_visor", "Acrílico transparente", "Visor de retrolavagem")
    ];
    var R = "(Diametro / 2)", hp = "(Altura * 0.035)", yT = "(Altura_bocas - DN / 1000 * 0.6)", Ht = "(" + yT + " - " + hp + ")";
    var rv = "(DN / 1000 * 1.5)", Lb = "(DN / 1000 * 1.6)", rt = "(DN / 2000 + 0.004)", ru = "(DN / 2000 + 0.012)", Lu = "(DN / 1000 * 0.6)";
    function y(f) { return hp + " + " + Ht + " * " + f; }
    var sol = [
      rev("pe", "Pé", "y", "0", "0", "0", [[R + " * 0.55", "0"], [R + " * 0.55", hp]], "Mat_valvula", SEG.liso),
      rev("tanque", "Tanque", "y", "0", "0", "0", [[R + " * 0.5", hp], [R + " * 0.8", y("0.06")], [R + " * 0.97", y("0.22")], [R, y("0.42")], [R + " * 0.97", y("0.6")],
        [R + " * 0.84", y("0.78")], [R + " * 0.6", y("0.92")], [rv + " * 1.15", yT]], "Mat_tanque", SEG.grande),
      rev("faixa", "Faixa com a marca", "y", "0", "0", "0", [[R + " * 0.99", y("0.3")], [R + " * 1.008", y("0.3")], [R + " * 1.008", y("0.4")], [R + " * 0.99", y("0.4")]], "Mat_faixa", SEG.grande, { fechar: "perfil" }),
      rev("valvula", "Válvula seletora", "y", "0", "0", "0", [[rv, yT + " - 0.01"], [rv, "Altura_bocas + " + rv + " * 0.6"], [rv + " * 0.85", "Altura_bocas + " + rv + " * 0.9"], [rv + " * 0.45", "Altura_bocas + " + rv]], "Mat_valvula", SEG.liso),
      cil("haste", "Haste da manopla", "y", "0", "Altura_bocas + " + rv + " * 0.9", "0", rv + " * 0.2", "max(Altura - 0.03 - Altura_bocas - " + rv + " * 0.9; 0.01)", "Mat_valvula"),
      cx("manopla", "Manopla", rv + " * 0.6", "Altura - 0.03", "0", rv + " * 1.8", "0.03", rv + " * 0.35", "Mat_valvula"),
      cil("manometro", "Manômetro", "z", "0", "Altura_bocas + " + rv + " * 0.3", "-" + rv + " - 0.035", "0.025", "0.04", "Branco"),
      tuboX("b-entrada", "Boca (da bomba)", "-" + rv + " * 0.9", "-(" + Lb + " + " + rv + " * 0.1)", "Altura_bocas", "0", rt, "Mat_valvula"),
      tuboX("u-entrada", "União (entrada)", "-" + rv + " - " + Lb, Lu, "Altura_bocas", "0", ru, "Mat_uniao"),
      tuboX("b-saida", "Boca (retorno)", rv + " * 0.9", Lb + " + " + rv + " * 0.1", "Altura_bocas", "0", rt, "Mat_valvula"),
      tuboX("u-saida", "União (saída)", rv + " + " + Lb, "-" + Lu, "Altura_bocas", "0", ru, "Mat_uniao"),
      cil("b-descarte", "Boca (descarte)", "z", "0", "Altura_bocas", rv + " * 0.9", rt, Lb + " + " + rv + " * 0.1", "Mat_valvula"),
      cil("u-descarte", "União (descarte)", "z", "0", "Altura_bocas", rv + " + " + Lb + " - " + Lu, ru, Lu, "Mat_uniao"),
      cil("visor", "Visor de retrolavagem", "y", "0", "Altura_bocas + " + rt, rv + " + " + Lb + " * 0.35", rt + " * 0.9", "0.03", "Mat_visor"),
      cil("dreno", "Dreno (bujão)", "z", "0", y("0.1"), R + " * 0.78", "0.016", "0.035", "Mat_valvula")
    ];
    var con = [
      { id: "entrada", nome: "Entrada (da bomba)", sistema: "pisc_retorno", dn: "DN", x: "-" + rv + " - " + Lb, y: "Altura_bocas", z: "0" },
      { id: "saida", nome: "Saída (retorno à piscina)", sistema: "pisc_retorno", dn: "DN", x: rv + " + " + Lb, y: "Altura_bocas", z: "0" },
      { id: "descarte", nome: "Descarte (lavagem/dreno)", sistema: "pisc_dreno", dn: "DN", x: "0", y: "Altura_bocas", z: rv + " + " + Lb }
    ];
    return fam("hid-pisc-filtro", "Filtro de areia para piscina", "equipamento", ["pisc_retorno", "pisc_dreno"], ps, sol, con, "Filtro de areia para piscina com válvula seletora",
      "Filtro de areia: tanque com pé, válvula seletora multivias no topo com manômetro, visor de retrolavagem e 3 bocas com união; forma e cor pelo catálogo do fabricante.");
  }

  /* ---------------- MOTOBOMBA: com PRÉ-FILTRO (pote, tampa com visor) ou sem (hidro: sucção axial); voluta, flange, motor com
     tampa do ventilador e ALETAS (quando a foto mostra), pés, uniões soldáveis. Origem no piso; a sucção na ponta −X. */
  function bomba(id, nome, sisRec, preFiltro) {
    var sisS = sisRec === "pisc_retorno" ? "pisc_succao" : sisRec;
    var ps = [
      P("Comprimento", "comprimento", "instancia", RES.bomba.Comprimento, GEO, "Comprimento total com as uniões (catálogo)"),
      P("Largura", "comprimento", "instancia", RES.bomba.Largura, GEO, "Largura (catálogo)"),
      P("Altura", "comprimento", "instancia", RES.bomba.Altura, GEO, "Altura total com a união do recalque (catálogo)"),
      P("Altura_eixo", "comprimento", "instancia", RES.bomba.Altura_eixo, GEO, "Altura do eixo da sucção (catálogo)"),
      P("Comprimento_motor", "comprimento", "instancia", RES.bomba.Comprimento_motor, GEO, "Comprimento do motor (catálogo)"),
      P("Recalque_x", "comprimento", "instancia", RES.bomba.Recalque_x, GEO, "Do eixo do recalque à ponta da sucção (catálogo)"),
      P("DN_succao", "numero", "instancia", RES.bomba.DN, "Hidráulica", "DN da sucção (mm)"),
      P("DN_recalque", "numero", "instancia", RES.bomba.DN, "Hidráulica", "DN do recalque (mm)"),
      P("Potencia_cv", "numero", "instancia", 0, "Elétrica", "Potência (cv, catálogo)"),
      P("Pre_filtro", "simnao", "instancia", !!preFiltro, GEO, "Tem pré-filtro (pote com cesto e tampa transparente)"),
      P("Aletas", "inteiro", "instancia", 0, GEO, "Aletas de refrigeração do motor (0 = carcaça lisa, como na foto)"),
      P("Caixa_ligacao", "simnao", "instancia", !preFiltro, GEO, "Caixa de ligação em cima do motor (foto)"),
      M("Mat_corpo", "Plástico", "Carcaça, voluta e pote"), M("Mat_motor", "Plástico", "Motor"), M("Mat_tampa", "Plástico", "Aro da tampa do pré-filtro"),
      M("Mat_visor", "Acrílico transparente", "Tampa transparente do pré-filtro"), M("Mat_uniao", "Branco", "Uniões soldáveis")
    ];
    var xs = "(-Comprimento / 2)", xe = "(Comprimento / 2)", Lu = "(DN_succao / 1000 * 0.9)", Lur = "(DN_recalque / 1000 * 0.9)";
    var Rp = "(min(Largura * 0.46; Comprimento * 0.15))", xp = "(" + xs + " + " + Lu + " + DN_succao / 1000 * 0.4 + " + Rp + ")";
    var xf = "(" + xe + " - Comprimento_motor)", Rm = "(min(Largura * 0.4; Altura_eixo * 0.8))", Rv = "(min(Largura * 0.48; Altura_eixo * 0.92))";
    var xv = "(se(Pre_filtro; " + xp + "; " + xs + " + " + Lu + " + 0.02))", xr = "(" + xs + " + Recalque_x)";
    var ha = "(" + Rm + " * 0.12)", xm = "(" + xf + " + 0.01)", Lm = "(Comprimento_motor * 0.88 - 0.01)";
    var sol = [
      cx("pe-motor", "Pé do motor", "(" + xf + " + " + xe + ") / 2", "0", "0", "Comprimento_motor * 0.5", "Altura_eixo - " + Rm + " * 0.95", "Largura * 0.7", "Mat_motor"),
      cx("base-corpo", "Base da carcaça", "(" + xv + " + " + xf + ") / 2", "0", "0", xf + " - " + xv, "Altura_eixo", "Largura * 0.72", "Mat_corpo"),
      cil("voluta", "Voluta", "x", xv, "Altura_eixo", "0", Rv, xf + " - " + xv, "Mat_corpo"),
      rev("pote", "Pré-filtro (pote)", "y", xp, "0", "0", [[Rp + " * 0.92", "0.01"], [Rp, "Altura * 0.1"], [Rp, "Altura * 0.74"]], "Mat_corpo", SEG.liso, { visivel: "Pre_filtro" }),
      rev("aro", "Aro da tampa", "y", xp, "0", "0", [[Rp + " * 0.8", "Altura * 0.74"], [Rp + " * 1.1", "Altura * 0.74"], [Rp + " * 1.1", "Altura * 0.84"], [Rp + " * 0.8", "Altura * 0.84"]], "Mat_tampa", SEG.liso, { fechar: "perfil", visivel: "Pre_filtro" }),
      rev("visor", "Tampa transparente (visor)", "y", xp, "0", "0", [[Rp + " * 0.8", "Altura * 0.79"], [Rp + " * 0.8", "Altura * 0.835"]], "Mat_visor", SEG.liso, { visivel: "Pre_filtro" }),
      rev("cesto", "Cesto do pré-filtro", "y", xp, "0", "0", [[Rp + " * 0.6", "Altura * 0.74"], [Rp + " * 0.7", "Altura * 0.74"], [Rp + " * 0.7", "Altura * 0.785"], [Rp + " * 0.6", "Altura * 0.785"]], "Branco", SEG.cesto, { fechar: "perfil", visivel: "Pre_filtro" }),
      tuboX("b-succao", "Bocal de sucção", xs + " + " + Lu, "se(Pre_filtro; " + xp + " - " + Rp + " * 0.8; " + xv + " + 0.01) - (" + xs + " + " + Lu + ")", "Altura_eixo", "0", "DN_succao / 2000 + 0.006", "Mat_corpo"),
      tuboX("u-succao", "União da sucção", xs, Lu, "Altura_eixo", "0", "DN_succao / 2000 + 0.014", "Mat_uniao"),
      cil("b-recalque", "Bocal de recalque", "y", xr, "Altura_eixo", "0", "DN_recalque / 2000 + 0.006", "Altura - " + Lur + " - Altura_eixo", "Mat_corpo"),
      cil("u-recalque", "União do recalque", "y", xr, "Altura - " + Lur, "0", "DN_recalque / 2000 + 0.014", Lur, "Mat_uniao"),
      cil("flange", "Flange (intermediária)", "x", xf + " - 0.01", "Altura_eixo", "0", "min(Largura * 0.5; Altura_eixo * 0.98)", "0.02", "Mat_corpo"),
      cil("motor", "Motor", "x", xm, "Altura_eixo", "0", Rm, Lm, "Mat_motor"),
      rev("ventilador", "Tampa do ventilador", "x", xm + " + " + Lm, "Altura_eixo", "0", [[Rm + " * 0.96", "0"], [Rm + " * 0.82", "Comprimento_motor * 0.12 - 0.002"]], "Mat_motor", SEG.liso),
      cx("caixa-ligacao", "Caixa de ligação", xm + " + " + Lm + " * 0.45", "Altura_eixo + " + Rm + " * 0.85", "0", Lm + " * 0.3", Rm + " * 0.4", "Largura * 0.32", "Mat_motor", { visivel: "Caixa_ligacao" })
    ];
    for (var k = 0; k < ALETAS_MAX; k++) {
      var an = "(2 * pi() * " + k + " / max(Aletas; 1))", rr = "(" + Rm + " + " + ha + " / 2)";
      sol.push(rev("aleta" + k, "Aleta do motor", "x", xm + " + " + Lm + " * 0.06", "Altura_eixo + " + rr + " * cos(" + an + ")", rr + " * sen(" + an + ")",
        [[ha + " / 2", "0"], [ha + " / 2", Lm + " * 0.88"]], "Mat_motor", SEG.aleta, { visivel: "Aletas > " + k + " e cos(" + an + ") > -0.6" }));
    }
    var con = [
      { id: "succao", nome: preFiltro ? "Sucção (pré-filtro)" : "Sucção", sistema: sisS, dn: "DN_succao", x: xs, y: "Altura_eixo", z: "0" },
      { id: "recalque", nome: "Recalque", sistema: sisRec, dn: "DN_recalque", x: xr, y: "Altura", z: "0" }
    ];
    return fam(id, nome, "equipamento", [sisS, sisRec], ps, sol, con, nome,
      nome + " — carcaça" + (preFiltro ? ", pré-filtro com tampa transparente" : "") + ", voluta, motor e uniões; forma e cor pelo catálogo do fabricante.");
  }

  /* ---------------- CASA DE MÁQUINAS (caixa de concreto: piso, paredes, laje com alçapão e tampa, escada, ralo) */
  function casa() {
    var ps = [
      P("Comprimento", "comprimento", "instancia", RES.casa.Comprimento, GEO, "Comprimento interno (pelos equipamentos)"),
      P("Largura", "comprimento", "instancia", RES.casa.Largura, GEO, "Largura interna"),
      P("Altura", "comprimento", "instancia", RES.casa.Altura, GEO, "Pé-direito interno"),
      P("Espessura", "comprimento", "tipo", RES.casa.Espessura, "Estrutura (reserva)", "Parede/laje — GEOMETRIA DE RESERVA (o cálculo estrutural define)"),
      P("Alcapao", "comprimento", "instancia", RES.casa.Alcapao, GEO, "Lado do alçapão de acesso"),
      P("Mostrar_tampa", "simnao", "instancia", true, GEO, "Mostra a laje de cobertura (desligue para ver os equipamentos no 3D)")
    ];
    var Ce = "Comprimento + 2 * Espessura", Le = "Largura + 2 * Espessura";
    var sol = [
      cx("piso", "Piso", "0", "-Espessura", "0", Ce, "Espessura", Le, "Concreto"),
      cx("p1", "Parede", "-(Comprimento + Espessura) / 2", "0", "0", "Espessura", "Altura", Le, "Concreto"),
      cx("p2", "Parede", "(Comprimento + Espessura) / 2", "0", "0", "Espessura", "Altura", Le, "Concreto"),
      cx("p3", "Parede", "0", "0", "-(Largura + Espessura) / 2", "Comprimento", "Altura", "Espessura", "Concreto"),
      cx("p4", "Parede", "0", "0", "(Largura + Espessura) / 2", "Comprimento", "Altura", "Espessura", "Concreto"),
      cx("laje", "Laje (fora do alçapão)", "Alcapao / 2", "Altura", "0", Ce + " - Alcapao", "Espessura", Le, "Concreto", { visivel: "Mostrar_tampa" }),
      cx("laje2", "Laje (ao lado do alçapão)", "-(" + Ce + ") / 2 + Alcapao / 2", "Altura", "Alcapao / 2", "Alcapao", "Espessura", Le + " - Alcapao", "Concreto", { visivel: "Mostrar_tampa" }),
      cx("tampa", "Tampa do alçapão", "-(" + Ce + ") / 2 + Alcapao / 2", "Altura + Espessura", "-(" + Le + ") / 2 + Alcapao / 2", "Alcapao * 0.96", "0.02", "Alcapao * 0.96", "Alumínio", { visivel: "Mostrar_tampa" }),
      cx("puxador", "Puxador da tampa", "-(" + Ce + ") / 2 + Alcapao / 2", "Altura + Espessura + 0.02", "-(" + Le + ") / 2 + Alcapao * 0.85", "Alcapao * 0.25", "0.02", "0.02", "Alumínio", { visivel: "Mostrar_tampa" }),
      cil("ralo", "Ralo do piso (drenagem)", "y", "Comprimento / 2 - 0.15", "0", "Largura / 2 - 0.15", "0.05", "0.01", "Metal"),
      cx("esc1", "Escada (degrau)", "-Comprimento / 2 + Alcapao / 2", "Altura * 0.33", "-Largura / 2 + 0.06", "Alcapao * 0.5", "0.03", "0.03", "Metal"),
      cx("esc2", "Escada (degrau)", "-Comprimento / 2 + Alcapao / 2", "Altura * 0.66", "-Largura / 2 + 0.06", "Alcapao * 0.5", "0.03", "0.03", "Metal")
    ];
    var f = fam("hid-pisc-casa-maquinas", "Casa de máquinas da piscina", "generico", [], ps, sol, [], "Casa de máquinas da piscina (concreto)", "Casa de máquinas enterrada/semienterrada: piso com ralo, paredes, laje com alçapão, tampa e escada; o tamanho vem dos equipamentos com o espaço de manutenção.");
    f.servicos = [
      { id: "escavacao", descricao: "Escavação da casa de máquinas", unidade: "m3", quantidade: "(" + Ce + ") * (" + Le + ") * (Altura + 2 * Espessura)" },
      { id: "concreto", descricao: "Concreto do casco", unidade: "m3", quantidade: "(" + Ce + ") * (" + Le + ") * (Altura + 2 * Espessura) - Comprimento * Largura * Altura - Alcapao * Alcapao * Espessura" }
    ];
    return f;
  }

  /* ---------------- DISPOSITIVOS de parede: ESPELHO na face (aro), MIOLO (bico direcional, tampa com fenda, grelha ou lente),
     corpo do produto atrás da face e o tubo até a ligação no fim do corpo (atravessa a parede) */
  function dispositivo(id, nome, sistema, ex) {
    ex = ex || {};
    var ps = [
      P("Flange", "comprimento", "instancia", ex.flange || RES.disp.Flange, GEO, "Diâmetro do espelho (catálogo)"),
      P("Corpo", "comprimento", "instancia", ex.corpo || RES.disp.Corpo, GEO, "Da face da parede à ligação (espessura da parede + encaixe)"),
      P("Corpo_produto", "comprimento", "instancia", RES.disp.Corpo_produto, GEO, "Corpo do produto atrás do espelho (catálogo)"),
      P("Saliencia", "comprimento", "instancia", ex.saliencia || RES.disp.Saliencia, GEO, "Quanto o espelho sai da parede (catálogo)"),
      P("DN", "numero", "instancia", ex.dn || RES.disp.DN, "Hidráulica", "DN da ligação (mm)"),
      M("Mat_espelho", ex.matEspelho || "Plástico", "Espelho/aro"), M("Mat_miolo", ex.matMiolo || "Plástico", "Miolo (bico, tampa, grelha ou lente)")
    ];
    var Rf = "(Flange / 2)";
    var sol = [
      rev("espelho", "Espelho", "z", "0", "0", "0", [[Rf, "0"], [Rf + " * 0.96", "Saliencia * 0.6"], [Rf + " * 0.8", "Saliencia"], [Rf + " * 0.6", "Saliencia"]], "Mat_espelho", SEG.grande),
      cil("corpo", "Corpo do produto", "z", "0", "0", "-Corpo_produto", Rf + " * 0.75", "Corpo_produto", "Mat_espelho"),
      cil("tubo", "Encaixe no tubo", "z", "0", "0", "-Corpo", "DN / 2000 + 0.004", "max(Corpo - Corpo_produto; 0.01)", "PVC")
    ];
    if (ex.bico) sol.push(rev("bico", "Bico direcional", "z", "0", "0", "Saliencia * 0.5", [[Rf + " * 0.45", "0"], [Rf + " * 0.42", "Saliencia * 0.9"], [Rf + " * 0.2", "Saliencia * 1.3"]], "Mat_miolo", SEG.liso));
    if (ex.tampa) {
      sol.push(cil("tampa", "Tampa (fechamento automático)", "z", "0", "0", "Saliencia * 0.5", Rf + " * 0.6", "Saliencia * 0.6", "Mat_miolo"));
      sol.push(cx("fenda", "Fenda da tampa", "0", "-" + Rf + " * 0.06", "Saliencia * 1.1", Rf + " * 1.1", Rf + " * 0.12", "0.004", "Mat_espelho"));
    }
    if (ex.grade) {
      sol.push(cil("grade", "Grelha antiaprisionamento", "z", "0", "0", "Saliencia * 0.5", Rf + " * 0.62", "Saliencia * 0.6", "Mat_miolo"));
      for (var g = -2; g <= 2; g++) sol.push(cx("barra" + (g + 2), "Barra da grelha", "0", "(" + g + ") * " + Rf + " * 0.2 - 0.003", "Saliencia * 1.1", Rf + " * 1.1", "0.006", "0.004", "Mat_espelho"));
    }
    if (ex.luz) sol.push(rev("lente", "Lente", "z", "0", "0", "Saliencia * 0.6", [[Rf + " * 0.62", "0"], [Rf + " * 0.5", "Saliencia * 0.5"], [Rf + " * 0.2", "Saliencia * 0.7"]], "Mat_miolo", SEG.liso));
    var con = sistema ? [{ id: "ligacao", nome: "Ligação", sistema: sistema, dn: "DN", x: "0", y: "0", z: "-Corpo" }] : [];
    return fam(id, nome, ex.cat || "equipamento", sistema ? [sistema] : [], ps, sol, con, nome, (ex.desc || nome) + " Forma e cor pelo catálogo do fabricante.");
  }
  /* COADEIRA (skimmer): corpo atrás da parede com a BOCA retangular na linha d'água (moldura e portinhola), torre redonda
     até o deck com a TAMPA, e as saídas embaixo. Origem = centro da boca na face da parede. */
  function skimmer() {
    var ps = [
      P("Largura", "comprimento", "instancia", RES.skimmer.Largura, GEO, "Largura do corpo (catálogo)"),
      P("Profundidade", "comprimento", "instancia", RES.skimmer.Profundidade, GEO, "Profundidade do corpo (catálogo)"),
      P("Altura", "comprimento", "instancia", RES.skimmer.Altura, GEO, "Altura do corpo até o deck (catálogo)"),
      P("Boca", "comprimento", "instancia", RES.skimmer.Boca, GEO, "Altura da boca (proporção de desenho se o catálogo não imprime)"),
      P("Tampa", "comprimento", "instancia", RES.skimmer.Tampa, GEO, "Diâmetro da tampa (catálogo)"),
      P("DN", "numero", "instancia", RES.skimmer.DN, "Hidráulica", "DN da ligação (mm)"),
      M("Mat_corpo", "Plástico", "Corpo")
    ];
    var zc = "(-Profundidade / 2 - 0.02)", zt = "(-Profundidade + Tampa / 2 + 0.01)";
    var sol = [
      cx("corpo", "Corpo", "0", "-Altura + Boca", zc + " + 0.03", "Largura * 0.85", "Altura - Boca * 0.3", "Profundidade - 0.06", "Mat_corpo"),
      cx("moldura-sup", "Moldura da boca", "0", "Boca / 2", "-0.01", "Largura", "Boca * 0.15", "0.03", "Mat_corpo"),
      cx("moldura-inf", "Moldura da boca", "0", "-Boca / 2 - Boca * 0.15", "-0.01", "Largura", "Boca * 0.15", "0.03", "Mat_corpo"),
      cx("moldura-e", "Moldura da boca", "-Largura / 2 + Largura * 0.06", "-Boca / 2", "-0.01", "Largura * 0.12", "Boca", "0.03", "Mat_corpo"),
      cx("moldura-d", "Moldura da boca", "Largura / 2 - Largura * 0.06", "-Boca / 2", "-0.01", "Largura * 0.12", "Boca", "0.03", "Mat_corpo"),
      cx("portinhola", "Portinhola flutuante", "0", "-Boca / 2", "-0.04", "Largura * 0.74", "Boca * 0.8", "0.006", "Mat_corpo"),
      cil("torre", "Torre da tampa", "y", "0", "-Boca * 0.2", zt, "Tampa / 2 + 0.01", "Boca * 1.2", "Mat_corpo"),
      cil("tampa", "Tampa no deck", "y", "0", "Boca", zt, "Tampa / 2", "0.012", "Mat_corpo"),
      cil("saida", "Saída de sucção", "y", "0", "-Altura + Boca - 0.1", zc, "DN / 2000", "0.1", "PVC"),
      cil("saida2", "Saída do esgoto/nível", "y", "Largura * 0.25", "-Altura + Boca - 0.06", zc, "0.012", "0.06", "PVC")
    ];
    var con = [{ id: "ligacao", nome: "Saída (sucção)", sistema: "pisc_succao", dn: "DN", x: "0", y: "-Altura + Boca - 0.1", z: zc }];
    return fam("hid-pisc-skimmer", "Coadeira (skimmer)", "equipamento", ["pisc_succao"], ps, sol, con, "Coadeira (skimmer) com barragem flutuante e cesto", "Coadeira de superfície: boca na linha d'água com portinhola flutuante, torre com tampa no deck, saída de sucção embaixo; forma e cor pelo catálogo do fabricante.");
  }
  /* RALO DE FUNDO com grelha antiaprisionamento abaulada, corpo sob o piso e saída lateral. Origem = centro no piso do tanque. */
  function ralo() {
    var ps = [
      P("Grelha", "comprimento", "instancia", RES.ralo.Grelha, GEO, "Diâmetro da grelha (catálogo)"),
      P("Altura_total", "comprimento", "instancia", RES.ralo.Altura_total, GEO, "Altura total (catálogo)"),
      P("Altura_corpo", "comprimento", "instancia", RES.ralo.Altura_corpo, GEO, "Corpo sob a grelha (catálogo)"),
      P("DN", "numero", "instancia", RES.ralo.DN, "Hidráulica", "DN da saída (mm)"),
      M("Mat_grelha", "Plástico", "Grelha"), M("Mat_corpo", "Plástico", "Corpo e conexão")
    ];
    var Rg = "(Grelha / 2)", hg = "(Altura_total - Altura_corpo)", Rc = "(Grelha * 0.32)";
    var sol = [
      rev("grelha", "Grelha antiaprisionamento", "y", "0", "0", "0", [[Rg, "0"], [Rg + " * 0.92", hg + " * 0.25"], [Rg + " * 0.5", hg + " * 0.8"], [Rg + " * 0.15", hg]], "Mat_grelha", SEG.grande),
      cil("corpo", "Corpo", "y", "0", "-Altura_corpo", "0", Rc, "Altura_corpo", "Mat_corpo"),
      cil("saida", "Saída lateral", "x", Rc, "-Altura_corpo + DN / 2000 + 0.01", "0", "DN / 2000 + 0.004", "0.08", "Mat_corpo")
    ];
    for (var k = 0; k < 4; k++) sol.push(cx("raio" + k, "Nervura da grelha", "0", hg + " * 0.3", "0", k % 2 ? "0.006" : Rg + " * 1.6", "0.006", k % 2 ? Rg + " * 1.6" : "0.006", "Mat_grelha", { rot: String(k * 45) }));   // hid:ok desenho: 4 nervuras a 45°; 7 sulcos da placa
    var con = [{ id: "ligacao", nome: "Saída (sucção)", sistema: "pisc_succao", dn: "DN", x: Rc + " + 0.08", y: "-Altura_corpo + DN / 2000 + 0.01", z: "0" }];
    return fam("hid-pisc-ralo", "Ralo de fundo antiaprisionamento", "equipamento", ["pisc_succao"], ps, sol, con, "Ralo de fundo com grelha antiaprisionamento", "Ralo de fundo (dreno) com grelha antiaprisionamento abaulada; corpo e saída lateral sob o piso do tanque; forma e cor pelo catálogo do fabricante.");
  }
  /* REGISTRO DE ESFERA de PVC soldável com volante (SINAPI 94489/94490): corpo esférico, bolsas, volante */
  function registro() {
    var ps = [P("DN", "numero", "instancia", RES.disp.DN, "Hidráulica", "DN (mm)"), P("Sistema", "texto", "instancia", "pisc_succao", "Hidráulica", "Sistema da linha")];
    var d = "(DN / 1000)";
    var sol = [
      rev("corpo", "Corpo (esfera)", "x", "-" + d + " * 0.75", "0", "0", [[d + " * 0.55", "0"], [d + " * 0.75", d + " * 0.35"], [d + " * 0.75", d + " * 1.15"], [d + " * 0.55", d + " * 1.5"]], "PVC", SEG.liso),
      cil("bolsa-a", "Bolsa", "x", "-" + d + " * 1.35", "0", "0", d + " * 0.62", d + " * 0.62", "PVC"),
      cil("bolsa-b", "Bolsa", "x", d + " * 0.73", "0", "0", d + " * 0.62", d + " * 0.62", "PVC"),
      cil("haste", "Haste", "y", "0", d + " * 0.7", "0", d + " * 0.15", d + " * 0.25", "PVC"),
      cil("volante", "Volante", "y", "0", d + " * 0.95", "0", d + " * 0.85", d + " * 0.22", "PVC")
    ];
    return fam("hid-pisc-registro", "Registro de esfera (piscina)", "acessorio_tubo", ["pisc_succao", "pisc_retorno", "pisc_hidro", "pisc_aquec", "pisc_dreno", "pisc_reposicao"], ps, sol, [], "Registro de esfera de PVC soldável", "Registro de esfera de PVC soldável com volante (um por linha no barrilete): regra da RA — registro de PVC em tubo plástico.");
  }
  /* tê de DERIVAÇÃO do aquecimento (com registro de esfera de PVC na saída lateral) */
  function derivacao() {
    var ps = [P("DN", "numero", "instancia", RES.disp.DN, "Hidráulica", "DN (mm)")];
    var d = "(DN / 1000)";
    var sol = [
      cil("corpo", "Tê", "x", "-" + d + " * 1.2", "0", "0", "DN / 2000 + 0.006", d + " * 2.4", "PVC"),
      cil("ramal", "Saída lateral", "z", "0", "0", "0", "DN / 2000 + 0.006", d + " * 1.2", "PVC"),
      rev("registro", "Registro de esfera", "z", "0", "0", d + " * 0.35", [[d + " * 0.5", "0"], [d + " * 0.65", d + " * 0.25"], [d + " * 0.65", d + " * 0.55"], [d + " * 0.5", d + " * 0.75"]], "PVC", SEG.liso),
      cil("volante", "Volante", "y", "0", d + " * 0.6", d + " * 0.7", d + " * 0.7", d + " * 0.2", "PVC")
    ];
    var con = [
      { id: "a", nome: "Retorno (montante)", sistema: "pisc_retorno", dn: "DN", x: "-" + d + " * 1.2", y: "0", z: "0" },
      { id: "b", nome: "Retorno (jusante)", sistema: "pisc_retorno", dn: "DN", x: d + " * 1.2", y: "0", z: "0" },
      { id: "c", nome: "Aquecimento", sistema: "pisc_aquec", dn: "DN", x: "0", y: "0", z: d + " * 1.2" }
    ];
    return fam("hid-pisc-derivacao", "Derivação do aquecimento (tê com registro)", "acessorio_tubo", ["pisc_retorno", "pisc_aquec"], ps, sol, con, "Tê de PVC soldável com registro de esfera (derivação do aquecimento)", "Derivação do retorno para o aquecedor: tê com registro de esfera de PVC na saída lateral; o by-pass fica entre a derivação de ida e a de volta.");
  }
  function caixaSimples(id, nome, cat, sis, dimPad, extraSol, con, desc, mat) {
    var ps = [P("Largura", "comprimento", "instancia", dimPad[0], GEO, "Largura (catálogo)"), P("Profundidade", "comprimento", "instancia", dimPad[1], GEO, "Profundidade (catálogo)"),
              P("Altura", "comprimento", "instancia", dimPad[2], GEO, "Altura (catálogo)"), P("DN", "numero", "instancia", RES.disp.DN, "Hidráulica", "DN das ligações (mm)"), M("Mat_corpo", mat || "Metal pintado", "Corpo")];
    var sol = [cx("corpo", "Corpo", "0", "0", "0", "Largura", "Altura", "Profundidade", "Mat_corpo")].concat(extraSol || []);
    return fam(id, nome, cat, sis, ps, sol, con || [], nome, desc || nome);
  }
  /* PLACA COLETORA solar de piscina: placa de tubos (sulcos) entre o coletor de cima e o de baixo (Ø das ligações) */
  function coletor() {
    var f = caixaSimples("hid-pisc-coletor", "Coletor solar de piscina", "equipamento", ["pisc_aquec"], RES.coletor, [], [], "Placa coletora de piscina (polipropileno), em série/paralelo no telhado.", "Plástico");
    f.solidos = [
      cx("placa", "Placa de tubos", "0", "0", "0", "Largura - DN / 1000 * 2.4", "Altura * 0.6", "Profundidade", "Mat_corpo"),
      cil("coletor-a", "Coletor (cabeceira)", "z", "-Largura / 2 + DN / 2000 + 0.004", "Altura * 0.5", "-Profundidade / 2 - DN / 1000", "DN / 2000 + 0.004", "Profundidade + DN / 500", "Mat_corpo"),
      cil("coletor-b", "Coletor (cabeceira)", "z", "Largura / 2 - DN / 2000 - 0.004", "Altura * 0.5", "-Profundidade / 2 - DN / 1000", "DN / 2000 + 0.004", "Profundidade + DN / 500", "Mat_corpo")
    ];
    for (var k = 1; k <= 7; k++) f.solidos.push(cx("sulco" + k, "Sulco", "0", "Altura * 0.6", "-Profundidade / 2 + Profundidade * " + (k / 8), "Largura - DN / 1000 * 2.6", "Altura * 0.08", "Profundidade * 0.025", "Mat_corpo"));   // hid:ok desenho: 4 nervuras a 45°; 7 sulcos da placa
    f.conectores = [{ id: "entrada", nome: "Entrada", sistema: "pisc_aquec", dn: "DN", x: "-Largura / 2", y: "Altura / 2", z: "0" }, { id: "saida", nome: "Saída", sistema: "pisc_aquec", dn: "DN", x: "Largura / 2", y: "Altura / 2", z: "0" }];
    return f;
  }

  /* CAIXA RECEPTORA DO DESCARTE com DESCARGA LIVRE (NBR 10339 5.4.4.14 a: separação vertical livre entre o tubo de descarte
     e o nível de transbordamento do esgotamento): origem = centro do TOPO da caixa (y = 0 = transbordamento, no terreno);
     as chegadas (descarte do filtro e recalque do poço de drenagem) terminam ABERTAS a "Livre" acima do topo, sobre a grelha;
     a saída sai por baixo, para a rede pluvial ou de esgoto (uma família por destino: o conector tem o sistema fixo).
     ⚠ Os números dentro das fórmulas são espessura de parede e folgas de DESENHO, não norma. */
  function caixaDescarte(sisSaida, sufixo, nomeDest) {
    var R = RES.caixaDescarte;
    var ps = [P("Largura", "comprimento", "instancia", R.Largura, GEO, "Largura interna da caixa"), P("Profundidade", "comprimento", "instancia", R.Profundidade, GEO, "Profundidade (em planta)"),
              P("Altura", "comprimento", "instancia", R.Altura, GEO, "Altura da caixa (do topo ao fundo)"),
              P("Livre", "comprimento", "instancia", R.Livre, GEO, "Separação livre: da boca das chegadas ao topo da caixa (nível de transbordamento)"),
              P("Afast_chegada", "comprimento", "instancia", R.Afast, GEO, "Meia distância entre as duas chegadas"),
              P("DN", "numero", "instancia", R.DN, "Hidráulica", "DN das chegadas (mm)"), P("DN_saida", "numero", "instancia", R.DN_saida, "Hidráulica", "DN da saída (mm)"), M("Mat_corpo", "Concreto", "Caixa")];
    var sol = [
      cx("fundo", "Fundo da caixa", "0", "-Altura - 0.05", "0", "Largura + 0.1", "0.05", "Profundidade + 0.1", "Mat_corpo"),
      cx("pa", "Parede", "-(Largura + 0.05) / 2", "-Altura", "0", "0.05", "Altura", "Profundidade + 0.1", "Mat_corpo"),
      cx("pb", "Parede", "(Largura + 0.05) / 2", "-Altura", "0", "0.05", "Altura", "Profundidade + 0.1", "Mat_corpo"),
      cx("pc", "Parede", "0", "-Altura", "-(Profundidade + 0.05) / 2", "Largura", "Altura", "0.05", "Mat_corpo"),
      cx("pd", "Parede", "0", "-Altura", "(Profundidade + 0.05) / 2", "Largura", "Altura", "0.05", "Mat_corpo"),
      cx("grelha", "Grelha (recebe a descarga livre)", "0", "-0.02", "0", "Largura", "0.02", "Profundidade", "Metal"),
      cil("bica-a", "Boca da chegada do descarte (aberta)", "y", "Afast_chegada", "Livre", "0", "DN / 2000 + 0.006", "0.04", "PVC"),
      cil("bica-b", "Boca da chegada da drenagem (aberta)", "y", "-Afast_chegada", "Livre", "0", "DN / 2000 + 0.006", "0.04", "PVC")
    ];
    var con = [
      { id: "chegada", nome: "Chegada do descarte do filtro (descarga livre)", sistema: "pisc_dreno", dn: "DN", x: "Afast_chegada", y: "Livre", z: "0" },
      { id: "chegada_dreno", nome: "Chegada da drenagem da casa de máquinas (descarga livre)", sistema: "pisc_dreno", dn: "DN", x: "-Afast_chegada", y: "Livre", z: "0" },
      { id: "saida", nome: "Saída para a rede " + nomeDest, sistema: sisSaida, dn: "DN_saida", x: "0", y: "-Altura + DN_saida / 2000 + 0.05", z: "Profundidade / 2" }
    ];
    return fam("hid-pisc-caixa-descarte" + sufixo, "Caixa receptora do descarte da piscina (descarga livre, rede " + nomeDest + ")", "equipamento", ["pisc_dreno", sisSaida], ps, sol, con,
      "Caixa receptora de alvenaria/concreto com grelha (descarte do filtro e drenagem da casa de máquinas)",
      "Caixa receptora do descarte do filtro (lavagem e esvaziamento) e da drenagem da casa de máquinas: as chegadas terminam ABERTAS acima do topo (descarga livre, NBR 10339 5.4.4.14 a) e a saída vai à rede " + nomeDest + ".");
  }
  /* POÇO DE DRENAGEM da casa de máquinas (NBR 10339 5.2.2: proteção contra inundação e dreno quando abaixo do solo): grelha
     no piso, poço embaixo com bomba submersível de drenagem (boia) e o recalque com válvula de retenção. Origem = centro da
     grelha no PISO (y = 0). */
  function pocoDrenagem() {
    var R = RES.poco;
    var ps = [P("Lado", "comprimento", "instancia", R.Lado, GEO, "Lado do poço (grelha)"), P("Profundidade", "comprimento", "instancia", R.Profundidade, GEO, "Profundidade do poço abaixo do piso"),
              P("Saida", "comprimento", "instancia", R.Saida, GEO, "Altura da saída do recalque acima do piso"), P("DN", "numero", "instancia", R.DN, "Hidráulica", "DN do recalque (mm)"),
              M("Mat_corpo", "Concreto", "Poço")];
    var sol = [
      cx("poco", "Poço de drenagem", "0", "-Profundidade", "0", "Lado + 0.08", "Profundidade", "Lado + 0.08", "Mat_corpo"),
      cx("grelha", "Grelha do piso", "0", "-0.01", "0", "Lado", "0.012", "Lado", "Metal"),
      cil("bomba", "Bomba submersível de drenagem (com boia)", "y", "0", "-Profundidade + 0.01", "0", "Lado * 0.3", "Profundidade * 0.7", "Equipamento preto"),
      cil("recalque", "Recalque da bomba de drenagem", "y", "0", "-Profundidade * 0.3", "0", "DN / 2000 + 0.003", "Saida + Profundidade * 0.3", "PVC"),
      cil("retencao", "Válvula de retenção", "y", "0", "Saida * 0.45", "0", "DN / 2000 + 0.012", "DN / 1000 * 2", "PVC")
    ];
    var con = [{ id: "recalque", nome: "Recalque da drenagem", sistema: "pisc_dreno", dn: "DN", x: "0", y: "Saida", z: "0" }];
    return fam("hid-pisc-poco-drenagem", "Poço de drenagem da casa de máquinas (bomba submersível)", "equipamento", ["pisc_dreno"], ps, sol, con,
      "Poço de drenagem com grelha, bomba submersível com boia e válvula de retenção",
      "Drenagem do piso da casa de máquinas: grelha, poço com bomba submersível automática (boia) e recalque com válvula de retenção até a caixa receptora (descarga livre).");
  }
  /* PONTO DE REPOSIÇÃO de água potável (bica com registro) na borda: a água da rede cai LIVRE no tanque, com a boca acima
     do nível de transbordamento (NBR 10818 4.2.2). Origem = base no deck (y = 0); Z aponta para DENTRO da piscina. */
  function reposicao() {
    var R = RES.reposicao;
    var ps = [P("Altura", "comprimento", "instancia", R.Altura, GEO, "Altura da boca acima do deck (a separação livre da norma + folga)"),
              P("Alcance", "comprimento", "instancia", R.Alcance, GEO, "Da base à boca (passa sobre a borda)"), P("DN", "numero", "instancia", R.DN, "Hidráulica", "DN da ligação (mm)"),
              M("Mat_corpo", "Inox", "Bica")];
    var r = "(DN / 2000 + 0.004)";
    var sol = [
      cil("coluna", "Coluna da bica", "y", "0", "0", "0", r, "Altura + 0.06", "Mat_corpo"),
      cil("braco", "Braço da bica", "z", "0", "Altura + 0.06", "0", r, "Alcance", "Mat_corpo"),
      cil("boca", "Boca (descarga livre)", "y", "0", "Altura", "Alcance", r, "0.06", "Mat_corpo"),
      cil("registro", "Registro de esfera", "y", "0", "0.08", "0", r + " * 1.8", "DN / 1000 * 2", "Mat_corpo"),
      cil("volante", "Volante", "x", "0", "0.08 + DN / 1000", "0", "DN / 1000 * 0.6", "DN / 1000 * 1.5", "Mat_corpo")
    ];
    var con = [{ id: "entrada", nome: "Entrada da água potável", sistema: "pisc_reposicao", dn: "DN", x: "0", y: "0", z: "0" }];
    return fam("hid-pisc-reposicao", "Ponto de reposição de água (bica de descarga livre)", "equipamento", ["pisc_reposicao"], ps, sol, con,
      "Bica de reposição com registro (descarga livre acima da borda)",
      "Reposição de água potável da piscina: bica na borda com registro, a boca acima do nível de transbordamento (separação livre — NBR 10818 4.2.2), sem ligação direta da rede potável com a água do tanque.");
  }

  var CACHE = null;
  function todas() {
    if (CACHE) return CACHE;
    CACHE = [
      filtro(),
      bomba("hid-pisc-bomba", "Motobomba autoescorvante com pré-filtro", "pisc_retorno", true),
      bomba("hid-pisc-bomba-hidro", "Motobomba da hidromassagem", "pisc_hidro", false),
      bomba("hid-pisc-bomba-aquec", "Motobomba do aquecimento solar", "pisc_aquec", true),
      casa(), skimmer(), ralo(), registro(), derivacao(),
      caixaDescarte("pluvial", "", "pluvial"), caixaDescarte("esgoto", "-esgoto", "de esgoto"), pocoDrenagem(), reposicao(),
      dispositivo("hid-pisc-retorno", "Dispositivo de retorno", "pisc_retorno", { bico: true, desc: "Bocal de retorno com bico direcional (regula a vazão)." }),
      dispositivo("hid-pisc-aspiracao", "Dispositivo de aspiração", "pisc_succao", { tampa: true, flange: RES.flangeAsp, desc: "Dispositivo de aspiração com tampa de fechamento automático (NBR 10339 5.4.4.12.3 d)." }),
      dispositivo("hid-pisc-succao-hidro", "Sucção de parede da hidro (grelha antiaprisionamento)", "pisc_hidro", { flange: RES.flangeSuccHidro, grade: true, desc: "Sucção de parede da hidromassagem com grelha antiaprisionamento (em par, interligada)." }),
      dispositivo("hid-pisc-hidro", "Bocal de hidromassagem", "pisc_hidro", { bico: true, flange: RES.flangeHidro, desc: "Bocal de hidromassagem (água + ar)." }),
      dispositivo("hid-pisc-refletor", "Refletor subaquático (LED)", null, { luz: true, flange: RES.flangeRef, corpo: RES.corpoRef, cat: "luminaria", matEspelho: "Inox", matMiolo: "Acrílico transparente",
                   desc: "Refletor subaquático em nicho; alimentação em extrabaixa tensão pelo quadro de comando (NBR 5410)." }),
      caixaSimples("hid-pisc-quadro", "Quadro de comando da piscina", "equipamento_eletrico", [], RES.quadro, [cx("porta", "Porta", "0", "Altura * 0.05", "Profundidade / 2", "Largura * 0.9", "Altura * 0.9", "0.005", "Plástico"),
        cx("puxador", "Fecho", "Largura * 0.35", "Altura * 0.45", "Profundidade / 2 + 0.005", "0.015", "Altura * 0.1", "0.012", "Equipamento preto")], [],
        "Quadro de comando (contator, relé, timer, disjuntores, DR) da filtração, hidro, iluminação e aquecimento — sem produto de catálogo: caixa de reserva."),
      caixaSimples("hid-pisc-bomba-calor", "Bomba de calor para piscina", "equipamento", ["pisc_aquec"], RES.bombaCalor,
        [cil("grade", "Ventilador", "z", "0", "Altura * 0.5", "Profundidade / 2", "Altura * 0.33", "0.01", "Equipamento preto")],
        [{ id: "entrada", nome: "Entrada", sistema: "pisc_aquec", dn: "DN", x: "-Largura / 2", y: "Altura * 0.2", z: "0" }, { id: "saida", nome: "Saída", sistema: "pisc_aquec", dn: "DN", x: "-Largura / 2", y: "Altura * 0.35", z: "0" }],
        "Bomba de calor (aquecimento) na derivação do retorno, com by-pass e registros.", "Branco"),
      coletor(),
      caixaSimples("hid-pisc-emergencia", "Botão de parada de emergência", "dispositivo_eletrico", [], RES.emergencia, [cil("botao", "Botão", "z", "0", "Altura - 0.08", "Profundidade / 2", "0.03", "0.02", "Vermelho")], [], "Botão de parada de emergência do sistema de circulação (NBR 10339 5.4.4.13), em pedestal, a ≥ 2 m da borda.", "Inox"),
      caixaSimples("hid-pisc-acionador", "Acionador pneumático da hidro", "dispositivo_eletrico", [], RES.acionador, [], [], "Botão pneumático na borda que liga a bomba da hidromassagem (sem eletricidade junto à água).", "Inox")
    ];
    CACHE.forEach(anotarPortas);
    return CACHE;
  }
  /* PORTAS (papel/dir — frente 2, 27/10/2026): quem entra e quem sai de cada peça da piscina, e para onde o tubo sai da peça (vetor unitário local,
     convenção do js/familia.js: Y cima, Z para fora da parede). O dispositivo da piscina é visto pelo lado da TUBULAÇÃO: retorno/hidro/reposição
     recebem a água (entrada); skimmer, ralo e aspiração a levam à bomba (saída). O catálogo cota só o corpo; a direção do tubo é a do desenho
     (aConferir). O motor ainda não lê papel/dir (frente 1b); o auditor tools/hid-auditar-portas.js cobra. */
  var DIRS = { esq: [-1, 0, 0], dir: [1, 0, 0], cima: [0, 1, 0], piso: [0, -1, 0], frente: [0, 0, 1], parede: [0, 0, -1] };
  var PORTAS = {
    "hid-pisc-filtro": { entrada: ["entrada", "esq"], saida: ["saida", "dir"], descarte: ["saida", "frente"] },
    "hid-pisc-bomba": { succao: ["succao", "esq"], recalque: ["recalque", "cima"] },
    "hid-pisc-bomba-hidro": { succao: ["succao", "esq"], recalque: ["recalque", "cima"] },
    "hid-pisc-bomba-aquec": { succao: ["succao", "esq"], recalque: ["recalque", "cima"] },
    "hid-pisc-skimmer": { ligacao: ["saida", "piso"] }, "hid-pisc-ralo": { ligacao: ["saida", "dir"] },
    "hid-pisc-derivacao": { a: ["entrada", "esq"], b: ["saida", "dir"], c: ["saida", "frente"] },
    "hid-pisc-caixa-descarte": { chegada: ["entrada", "cima"], chegada_dreno: ["entrada", "cima"], saida: ["saida", "frente"] },
    "hid-pisc-caixa-descarte-esgoto": { chegada: ["entrada", "cima"], chegada_dreno: ["entrada", "cima"], saida: ["saida", "frente"] },
    "hid-pisc-poco-drenagem": { recalque: ["recalque", "cima"] }, "hid-pisc-reposicao": { entrada: ["entrada", "parede"] },
    "hid-pisc-retorno": { ligacao: ["entrada", "parede"] }, "hid-pisc-hidro": { ligacao: ["entrada", "parede"] },
    "hid-pisc-aspiracao": { ligacao: ["saida", "parede"] }, "hid-pisc-succao-hidro": { ligacao: ["saida", "parede"] },
    "hid-pisc-bomba-calor": { entrada: ["entrada", "esq"], saida: ["saida", "esq"] }, "hid-pisc-coletor": { entrada: ["entrada", "esq"], saida: ["saida", "dir"] }
  };
  function anotarPortas(f) {
    var t = PORTAS[f.id] || {};
    arr(f.conectores).forEach(function (c) {
      var r = t[c.id]; if (!r) return;
      var a = DIRS[r[1]]; c.papel = r[0]; c.dir = { x: a[0], y: a[1], z: a[2] }; c.origemPos = "desenho";
      c.aConferir = "o catálogo cota só o corpo: posição e direção do bocal são as do desenho";
    });
  }
  function porId(id) { var t = todas(); for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i]; return null; }

  /* ================================================ PRODUTO → instância (cota e cor do volumetria-piscina.json)
     produtoTxt = "Fabricante Código" (o mesmo texto que o lançamento grava em "Produto"). Devolve { inst, fonte, completo } ou null. */
  var MAPA = {
    "hid-pisc-filtro": { diametro: "Diametro", altura_total: "Altura", altura_bocas: "Altura_bocas" },
    "hid-pisc-bomba": { largura: "Largura", altura_eixo: "Altura_eixo", altura_total: "Altura", motor: "Comprimento_motor", recalque_ate_succao: "Recalque_x", comprimento: "Comprimento" },
    "hid-pisc-skimmer": { profundidade: "Profundidade", largura: "Largura", altura: "Altura", tampa: "Tampa" },
    "hid-pisc-ralo": { grelha: "Grelha", altura_total: "Altura_total", corpo: "Altura_corpo" },
    "hid-pisc-disp": { espelho: "Flange", corpo: "Corpo_produto", comprimento: "Corpo_produto", saliencia: "Saliencia" },
    "hid-pisc-coletor": { comprimento: "Largura", largura: "Profundidade", espessura: "Altura" }   /* Largura = entre os coletores (o comprimento da placa), Profundidade = a largura dela */
  };
  var CORES_PARTE = {
    "hid-pisc-filtro": { tanque: "Mat_tanque", faixa: "Mat_faixa", valvula: "Mat_valvula", uniao: "Mat_uniao", visor: "Mat_visor" },
    "hid-pisc-bomba": { corpo: "Mat_corpo", motor: "Mat_motor", tampa: "Mat_tampa", visor: "Mat_visor", uniao: "Mat_uniao" },
    "hid-pisc-skimmer": { corpo: "Mat_corpo" }, "hid-pisc-ralo": { grelha: "Mat_grelha", corpo: "Mat_corpo" },
    "hid-pisc-disp": { espelho: "Mat_espelho", miolo: "Mat_miolo", aro: "Mat_espelho", lente: "Mat_miolo" }, "hid-pisc-coletor": { placa: "Mat_corpo" }
  };
  function grupo(famId) { return /^hid-pisc-bomba/.test(famId) ? "hid-pisc-bomba" : /^hid-pisc-(retorno|aspiracao|hidro|refletor|succao-hidro)$/.test(famId) ? "hid-pisc-disp" : famId; }
  function doProduto(famId, produtoTxt) {
    var V = DADOS().volumetria || {}, cores = V.cores || {}, alvo = String(produtoTxt || "").trim(), g = grupo(famId);
    if (!alvo) return null;
    var achou = null;
    arr(V.modelos).forEach(function (m) {
      if (achou || !m.familias.some(function (f) { return f === famId || grupo(f) === g && g === "hid-pisc-bomba"; })) return;   /* a ficha da motobomba vale para a bomba do filtro e a do aquecimento */
      Object.keys(m.cotas_mm || {}).forEach(function (cod) { if (!achou && (m.fabricante + " " + cod) === alvo) achou = { m: m, cotas: m.cotas_mm[cod], cod: cod }; });
    });
    if (!achou) return null;
    var inst = {}, mp = MAPA[g] || {}, cp = CORES_PARTE[g] || {}, m = achou.m, c = achou.cotas;
    Object.keys(c).forEach(function (k) { if (mp[k] && isFinite(Number(c[k]))) inst[mp[k]] = Math.round(Number(c[k])) / 1000; });
    /* bomba: o comprimento total = motor + corpo quando a ficha dá as duas partes (Dancor: E + F) */
    if (g === "hid-pisc-bomba" && c.motor && c.corpo && !c.comprimento) inst.Comprimento = Math.round(Number(c.motor) + Number(c.corpo)) / 1000;
    if (g === "hid-pisc-bomba") {
      if (m.estilo) inst.Pre_filtro = m.estilo === "prefiltro";
      if (m.aletas != null) inst.Aletas = Math.max(0, Math.min(ALETAS_MAX, Math.round(m.aletas)));
      inst.Caixa_ligacao = m.estilo === "sem_prefiltro";
    }
    Object.keys(m.cores || {}).forEach(function (parte) { var cor = cores[m.cores[parte]]; if (cp[parte] && cor && cor.material) inst[cp[parte]] = cor.material; });
    /* o que a ficha NÃO imprime fica na proporção de desenho: a instância diz quais */
    var falta = [];
    if (g === "hid-pisc-bomba") ["Largura", "Altura_eixo", "Comprimento_motor", "Recalque_x"].forEach(function (k) { if (inst[k] == null) falta.push(k); });
    inst.Fonte_forma = m.fonte + (m.legenda ? " — " + m.legenda : "") + (m.aletasFonte ? " — aletas: " + m.aletasFonte : "");
    return { inst: inst, fonte: m.fonte, estilo: m.estilo, completo: !falta.length, falta: falta, modelo: m.id };
  }
  /* proporções de desenho para a bomba quando a ficha só dá comprimento e altura (Nautilus NBF, Sodramar BH) */
  function completarBomba(inst) {
    var o = {}; Object.keys(inst || {}).forEach(function (k) { o[k] = inst[k]; });
    var C = num(o.Comprimento, RES.bomba.Comprimento), H = num(o.Altura, RES.bomba.Altura);
    /* hid:geometria-inicio — proporções lidas dos desenhos dimensionais (PF-17: C/D = 171/295; E/(E+F) ≈ 0,4; G/(E+F) ≈ 0,52; A/D ≈ 0,68) */
    if (o.Largura == null) o.Largura = Math.round(H * 0.68 * 1000) / 1000;
    if (o.Altura_eixo == null) o.Altura_eixo = Math.round(H * (o.Pre_filtro === false ? 0.42 : 0.58) * 1000) / 1000;
    if (o.Comprimento_motor == null) o.Comprimento_motor = Math.round(C * (o.Pre_filtro === false ? 0.5 : 0.4) * 1000) / 1000;
    if (o.Recalque_x == null) o.Recalque_x = Math.round(C * (o.Pre_filtro === false ? 0.22 : 0.52) * 1000) / 1000;
    /* hid:geometria-fim */
    return o;
  }

  var HidPiscinaFam = { VERSAO: 2, PSET: PSET, todas: todas, porId: porId, doProduto: doProduto, completarBomba: completarBomba, ALETAS_MAX: ALETAS_MAX,
                        ids: function () { return todas().map(function (f) { return f.id; }); } };
  global.HidPiscinaFam = HidPiscinaFam;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPiscinaFam;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
