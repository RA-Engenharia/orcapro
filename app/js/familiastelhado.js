/* =====================================================================
 * familiastelhado.js — TELHADO SANDUICHE PARAMETRICO (familia nativa do BIM)
 *
 * Pedido do Rogerio (03/11/2026): um telhado completo parametrico que o usuario
 * dimensiona (Comprimento x Largura x Caimento) e ja nasce com TODO o conjunto:
 *   TELHA sanduiche (madeira oculta + EPS + chapa) -> ESTRUTURA de apoio (tercas)
 *   + TRAVAMENTO em X -> FORRO liso embaixo. RUFO no perimetro + CALHA no lado da
 *   queda. SEM tubo de queda.
 * Ordem vertical (de baixo p/ cima): FORRO -> ESTRUTURA (sobre o forro) -> TELHA.
 *
 * COMO FUNCIONA. Familia de `solidos` por formula (js/familia.js), placa inclinada
 * via plano "frente" com a instancia em rotY=90 (q0 = profundidade/queda, q1 = cota,
 * altura = largura). Mesma mecanica da telha nativa. Aparece na biblioteca via
 * js/familiaui.js (FamiliasTelhado.lista()).
 *
 * Materiais: nomes que CASAM com os termos do RenderMat (ver comentario no MAT
 * abaixo) — nome sem termo cai no padrao reboco_pintado_fosco, nao em verde.
 * ES5, IIFE, sem DOM. Node-testavel.
 * ===================================================================== */
(function (global) {
  "use strict";
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function P(n, td, es, v, g, d) { return { nome: n, tipoDado: td, escopo: es, valor: v, grupo: g, descricao: d }; }
  function F(n, td, f, g, d) { return { nome: n, tipoDado: td, formula: f, grupo: g, descricao: d }; }
  /* Nomes casam com termos do RenderMat (js/rendermat.js + data/materiais-render-ra.json),
   * que resolve por TERMO mais longo primeiro — não por nome exato. Conferido:
   *   "Telha metálica"->telha_metalica (cinza #d7dfe2, não telha de barro); "Plástico branco"->
   *   plastico_branco (branco, cara do EPS na borda); "Gesso"->gesso (forro liso branco);
   *   "Madeira"->madeira_natural; "Aço"->aco_pintado (travamento); "Galvanizado"->aco_galvanizado
   *   (rufo/calha, chapa clara). Nome sem termo cairia no padrão reboco_pintado_fosco (pintura). */
  var MAT = { madeira: "Madeira", chapa: "Telha metálica", eps: "Plástico branco", forro: "Gesso", aco: "Aço", metal: "Galvanizado" };

  function famTelhadoParam() {
    var COMPmax = 60, PASSO_T = 1.0;
    var e_cha = 0.012, h_est = 0.20, b_est = 0.08;
    var params = [
      P("Comprimento", "comprimento", "instancia", 6.0, "Telhado (ajuste aqui)", "PROFUNDIDADE do telhado (sentido da queda)"),
      P("Largura", "comprimento", "instancia", 5.0, "Telhado (ajuste aqui)", "LARGURA do telhado"),
      P("Caimento", "comprimento", "instancia", 0.08, "Telhado (ajuste aqui)", "CAIMENTO: queda por metro (0,08 = 8%)"),
      P("Base", "comprimento", "instancia", 3.0, "Telhado (ajuste aqui)", "COTA da beira baixa (onde fica a calha)"),
      P("Beiral", "comprimento", "instancia", 0.30, "Telhado (ajuste aqui)", "Avanço do beiral no perímetro"),
      P("e_mad", "comprimento", "tipo", 0.010, "Camadas da telha", "Forro de madeira oculto (acabamento de baixo da telha)"),
      P("e_nuc", "comprimento", "tipo", 0.030, "Camadas da telha", "Núcleo isolante EPS"),
      P("e_forro", "comprimento", "tipo", 0.015, "Forro", "Espessura do forro liso de baixo"),
      F("Area", "area", "Largura * Comprimento", "Quantitativo", "Área projetada (m²)")
    ];
    function band(loExpr, hiExpr) {
      function cz(q0, off) { return "Base + Caimento*(" + q0 + ") + (" + off + ")"; }
      return [
        ["-Beiral", cz("-Beiral", loExpr)],
        ["Comprimento + Beiral", cz("Comprimento + Beiral", loExpr)],
        ["Comprimento + Beiral", cz("Comprimento + Beiral", hiExpr)],
        ["-Beiral", cz("-Beiral", hiExpr)]
      ];
    }
    var zW = "-Beiral", altW = "Largura + 2*Beiral", sol = [];
    sol.push({ id: "forro", nome: "Forro liso", forma: "extrusao", plano: "frente", x: "0", y: "0", z: zW, altura: altW, contorno: band("0", "e_forro"), material: MAT.forro });
    var z_estrut = "e_forro", z_telha = "e_forro + " + h_est;
    sol.push({ id: "tel_mad", nome: "Telha: forro madeira (oculto)", forma: "extrusao", plano: "frente", x: "0", y: "0", z: zW, altura: altW, contorno: band(z_telha, z_telha + " + e_mad"), material: MAT.madeira, visivel: "e_mad > 0" });
    sol.push({ id: "tel_eps", nome: "Telha: núcleo EPS", forma: "extrusao", plano: "frente", x: "0", y: "0", z: zW, altura: altW, contorno: band(z_telha + " + e_mad", z_telha + " + e_mad + e_nuc"), material: MAT.eps, visivel: "e_nuc > 0" });
    sol.push({ id: "tel_cha", nome: "Telha: chapa", forma: "extrusao", plano: "frente", x: "0", y: "0", z: zW, altura: altW, contorno: band(z_telha + " + e_mad + e_nuc", z_telha + " + e_mad + e_nuc + " + e_cha), material: MAT.chapa });
    var nT = Math.ceil(COMPmax / PASSO_T) + 1;
    for (var i = 0; i < nT; i++) {
      var q = r6(i * PASSO_T), vis = r6(q) + " <= Comprimento + 0.001";
      var cc = [
        [String(q), "Base + Caimento*(" + q + ") + " + z_estrut],
        [String(r6(q + b_est)), "Base + Caimento*(" + q + ") + " + z_estrut],
        [String(r6(q + b_est)), "Base + Caimento*(" + q + ") + " + z_estrut + " + " + h_est],
        [String(q), "Base + Caimento*(" + q + ") + " + z_estrut + " + " + h_est]
      ];
      sol.push({ id: "terca" + i, nome: "Terça (estrutura)", forma: "extrusao", plano: "frente", x: "0", y: "0", z: "0", altura: "Largura", contorno: cc, material: MAT.madeira, visivel: vis });
    }
    function diagonal(id, a0, a1, z0off, z1off) {
      var w = 0.05;
      return { id: id, nome: "Travamento (X)", forma: "extrusao", plano: "frente", x: "0", y: "0", z: "0.02", altura: "Largura - 0.04",
        contorno: [
          [String(a0), "Base + Caimento*(" + a0 + ") + " + z0off],
          [String(r6(a0 + w)), "Base + Caimento*(" + a0 + ") + " + z0off],
          [String(r6(a1 + w)), "Base + Caimento*(" + a1 + ") + " + z1off],
          [String(a1), "Base + Caimento*(" + a1 + ") + " + z1off]
        ], material: MAT.aco, visivel: "Comprimento > 1.2" };
    }
    sol.push(diagonal("travX1", 0.0, 1.0, z_estrut, z_estrut + " + " + h_est));
    sol.push(diagonal("travX2", 1.0, 0.0, z_estrut, z_estrut + " + " + h_est));
    var ztopo = z_telha + " + e_mad + e_nuc + " + e_cha;
    sol.push({ id: "rufo_baixo", nome: "Rufo (beira baixa)", forma: "extrusao", plano: "frente", x: "0", y: "0", z: zW, altura: altW,
      contorno: [["-Beiral", "Base + Caimento*(-Beiral) + " + ztopo], ["-Beiral + 0.12", "Base + Caimento*(-Beiral) + " + ztopo],
                 ["-Beiral + 0.12", "Base + Caimento*(-Beiral) + " + ztopo + " + 0.04"], ["-Beiral", "Base + Caimento*(-Beiral) + " + ztopo + " + 0.04"]], material: MAT.metal });
    sol.push({ id: "rufo_alto", nome: "Rufo (beira alta)", forma: "extrusao", plano: "frente", x: "0", y: "0", z: zW, altura: altW,
      contorno: [["Comprimento + Beiral - 0.12", "Base + Caimento*(Comprimento + Beiral) + " + ztopo], ["Comprimento + Beiral", "Base + Caimento*(Comprimento + Beiral) + " + ztopo],
                 ["Comprimento + Beiral", "Base + Caimento*(Comprimento + Beiral) + " + ztopo + " + 0.04"], ["Comprimento + Beiral - 0.12", "Base + Caimento*(Comprimento + Beiral) + " + ztopo + " + 0.04"]], material: MAT.metal });
    var zcalha = "Base + Caimento*(-Beiral) + " + z_telha + " - 0.02";
    sol.push({ id: "calha", nome: "Calha (lado da queda)", forma: "extrusao", plano: "frente", x: "0", y: "0", z: zW, altura: altW,
      contorno: [
        ["-Beiral - 0.12", zcalha], ["-Beiral", zcalha], ["-Beiral", zcalha + " + 0.12"], ["-Beiral - 0.02", zcalha + " + 0.12"],
        ["-Beiral - 0.02", zcalha + " + 0.02"], ["-Beiral - 0.10", zcalha + " + 0.02"], ["-Beiral - 0.10", zcalha + " + 0.12"], ["-Beiral - 0.12", zcalha + " + 0.12"]
      ], material: MAT.metal });

    return {
      id: "ra-telhado-parametrico", nome: "Telhado sanduíche paramétrico", categoria: "generico", hospedagem: "livre", previa: "modelador",
      descricao: "Telhado sanduíche COMPLETO e paramétrico: telha (madeira oculta+EPS+chapa) sobre estrutura de terças + travamento em X, forro liso embaixo, rufos no perímetro e calha no lado da queda (sem tubo de queda). Ajuste Comprimento, Largura, Caimento, Base e Beiral nas Propriedades.",
      parametros: params,
      tipos: [
        { id: "tp40", nome: "TP40 EPS30", valores: { e_mad: 0.010, e_nuc: 0.030, e_forro: 0.015 } },
        { id: "tp50", nome: "Termoacústica EPS50", valores: { e_mad: 0.010, e_nuc: 0.050, e_forro: 0.015 } },
        { id: "simples", nome: "Chapa simples (sem núcleo)", valores: { e_mad: 0, e_nuc: 0, e_forro: 0.015 } }
      ],
      solidos: sol,
      quantitativo: { unidade: "m2", quantidade: "Area", codigo: "", fonte: "", descricao: "Telhado sanduíche" }
    };
  }

  var LISTA = null;
  var FamiliasTelhado = {
    lista: function () { if (!LISTA) LISTA = [famTelhadoParam()]; return LISTA.map(function (f) { return JSON.parse(JSON.stringify(f)); }); }
  };
  global.FamiliasTelhado = FamiliasTelhado;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasTelhado;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
