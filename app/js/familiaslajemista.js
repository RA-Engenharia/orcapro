/* =====================================================================
 * familiaslajemista.js — FAMÍLIAS PARAMÉTRICAS "LAJE STEEL DECK" (ra-laje-steel-deck) e "LAJE PAINEL WALL" (ra-laje-painel-wall) (14/11/2026)
 *
 * Os TIPOS vêm do catálogo (js/lajesmistadados.js — fabricante, documento, página): quem quiser duplica um tipo e muda os parâmetros (a cópia fica por
 * conta do usuário: a tabela do fabricante deixa de valer — o motor js/lajesmista.js avisa e recusa a leitura da tabela). A geometria é a MESMA do
 * motor puro js/lajesmistageo.js (o teste prova as duas lado a lado).
 *
 * STEEL DECK — sólidos reais: chapa trapezoidal (extrusão do contorno de UMA onda × até NP ondas), concreto (extrusão do contorno entre a chapa e a face
 *   superior da laje) e tela (caixa fina). A largura é um número INTEIRO DE ONDAS (a família não corta a última onda: para largura qualquer use o motor puro).
 *   Comprimento (instância)   ao longo das nervuras (m) — é o VÃO que as tabelas usam
 *   Ondas (instância)         nº de ondas inteiras na largura · Largura = Ondas × Passo (calculada)
 *   Direcao (instância)       1 = nervuras ao longo de X · 2 = ao longo de Z (origem no canto mínimo; y = face inferior da chapa)
 *   H_total · Passo · Vale · Mesa · Base_nerv · H_perfil · T_chapa · Cob_tela · D_fio …  (tipo)  do catálogo (Mesa do Metform é MEDIDA no desenho; Cob_tela do Metform é padrão EDITÁVEL)
 * Capacidade: NP = 24 ondas (≈ 6,6 m a 0,274 m de passo); acima disso Capacidade_ok = 0 e a família avisa (o motor puro não tem esse limite).
 *
 * PAINEL WALL — placa de faces cimentícias + miolo de madeira (3 caixas). Espessura da face = Frac_fibro × Espessura ÷ 2 (a espessura da placa NÃO é publicada:
 *   fração em volume de fibrocimento da Eternit, 14% a 20%, ponto médio 17%: ASSUMIDO e editável). Quantitativo: m².
 *
 * Quantitativo: m² de laje. Código SINAPI: NÃO preenchido (nenhum código foi conferido para este sistema).
 * Teste: node tools/test-lajesmista.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var FR = dep("FamiliasRA", "./familiasra.js"), LM = dep("LajesMista", "./lajesmista.js"), GEO = dep("LajesMistaGeo", "./lajesmistageo.js");
  if (!FR || !FR.registrar || !LM || !GEO) return;
  var NP = 24;
  var r6 = function (v) { return Math.round(v * 1e6) / 1e6; };

  /* ---------------------------------------------------------------- STEEL DECK */
  var solidos = [], i;
  for (i = 1; i <= NP; i++) {
    var x0 = "(" + (i - 1) + ")*Passo", vis = "Ondas >= " + i;
    var cx = function (k) { return x0 + " + " + k; };
    var pa = "Vale + Alma", pm = "Vale + Alma + Mesa";
    solidos.push({ id: "ch" + i, nome: "Chapa — onda " + i, forma: "extrusao", plano: "frente", x: "0", y: "0", z: "se(D_x = 1; Largura; 0)", rot: "se(D_x = 1; 90; 0)", altura: "Comprimento", material: "Material_chapa", visivel: vis,
      contorno: [[x0, "0"], [cx("Vale"), "0"], [cx(pa), "H_perfil"], [cx(pm), "H_perfil"], [cx("Passo"), "0"],
                 [cx("Passo"), "T_chapa"], [cx(pm), "H_perfil + T_chapa"], [cx(pa), "H_perfil + T_chapa"], [cx("Vale"), "T_chapa"], [x0, "T_chapa"]] });
    solidos.push({ id: "co" + i, nome: "Concreto — onda " + i, forma: "extrusao", plano: "frente", x: "0", y: "0", z: "se(D_x = 1; Largura; 0)", rot: "se(D_x = 1; 90; 0)", altura: "Comprimento", material: "Material_concreto", visivel: vis,
      contorno: [[x0, "T_chapa"], [cx("Vale"), "T_chapa"], [cx(pa), "H_perfil + T_chapa"], [cx(pm), "H_perfil + T_chapa"], [cx("Passo"), "T_chapa"], [cx("Passo"), "H_total"], [x0, "H_total"]] });
  }
  solidos.push({ id: "tela", nome: "Tela soldada (representação: 2 camadas de fio)", forma: "caixa", x: "se(D_x = 1; Comprimento/2; Largura/2)", y: "H_total - Cob_tela - 2*D_fio", z: "se(D_x = 1; Largura/2; Comprimento/2)",
    dx: "se(D_x = 1; Comprimento; Largura)", dy: "2*D_fio", dz: "se(D_x = 1; Largura; Comprimento)", material: "Material_aco", visivel: "D_fio > 0" });

  var tiposSD = [];
  LM.series({ tipo: "steel-deck", semUsuario: true }).forEach(function (s) {
    var pf = LM.perfilSteelDeck(s), ass = [];
    if (/MEDIDA/.test(s.geometria.mesaSuperiorOrigem || "")) ass.push("mesa superior " + s.geometria.mesaSuperiorMm + " mm MEDIDA no desenho do catálogo (não é cota impressa)");
    if (/NÃO publicada/.test(s.geometria.coberturaTelaOrigem || "")) ass.push("cobertura da tela de " + s.geometria.coberturaTelaMm + " mm é padrão editável (o catálogo não a publica)");
    LM.alturasCm(s).forEach(function (a) {
      var q = LM.quantitativos(s, { hCm: a.hCm }, { hCm: a.hCm }), ln = s.tabela.tipo === "sobrecarga-por-vao-unica" ? s.tabela.linhas.filter(function (l) { return Math.abs(l.hMm / 10 - a.hCm) < 1e-9; })[0] : null;
      var tl = (ln && ln.tela) || (function () { var t = null; (s.concreto || []).forEach(function (c) { if (c.h === a.hCm && c.tela) t = c.tela; }); return t; })();
      var dFio = tl ? (GEO.fioDeTela(tl.composicao) || 0) : 0;
      var pp = ln ? ln.pesoProprioKnM2 : (function () { var v = 0; (s.concreto || []).forEach(function (c) { if (c.h === a.hCm) v = c.pesoPropriokgM2 * 9.80665 / 1000; }); return r6(v); })();
      tiposSD.push({ id: "sd-" + s.id + "-h" + Math.round(a.hCm * 10), nome: s.fabricante + " " + s.designacao + " · h " + Math.round(a.hCm * 10) + " mm",
        fonte: LM.fonteTxt(s) + (ass.length ? " · ASSUMIDO: " + ass.join("; ") : ""),
        valores: { H_total: a.hCm / 100, Passo: pf.passo, Vale: pf.vale, Mesa: pf.mesa, Base_nerv: pf.base, H_perfil: pf.altura, T_chapa: pf.t, Cob_tela: pf.cobTela, D_fio: dFio,
                   Peso_chapa: s.fisicas.pesoKgM2, Consumo_concreto: q.publicado.consumoConcretoM3M2 || 0, Peso_proprio: pp || 0, Peso_tela: (tl && tl.pesoKgM2) || 0 } });
    });
  });

  var paramsSD = [
    { nome: "Comprimento", tipoDado: "comprimento", escopo: "instancia", valor: 4.0, grupo: "Dimensões", descricao: "Ao longo das nervuras (m): é o vão que as tabelas do fabricante usam" },
    { nome: "Ondas", tipoDado: "inteiro", escopo: "instancia", valor: 10, grupo: "Dimensões", descricao: "Número de ondas inteiras na largura (máx. " + NP + "); Largura = Ondas × Passo" },
    { nome: "Direcao", tipoDado: "inteiro", escopo: "instancia", valor: 1, grupo: "Dimensões", descricao: "1 = nervuras ao longo de X · 2 = ao longo de Z" },
    { nome: "H_total", tipoDado: "comprimento", escopo: "tipo", valor: 0.14, grupo: "Catálogo", descricao: "Altura total da laje (chapa + concreto)" },
    { nome: "Passo", tipoDado: "comprimento", escopo: "tipo", valor: 0.274, grupo: "Catálogo", descricao: "Distância entre ondas (catálogo)" },
    { nome: "Vale", tipoDado: "comprimento", escopo: "tipo", valor: 0.119, grupo: "Catálogo", descricao: "Largura do vale (mesa inferior) entre as nervuras" },
    { nome: "Mesa", tipoDado: "comprimento", escopo: "tipo", valor: 0.113, grupo: "Catálogo", descricao: "Largura da mesa superior da nervura (Metform: medida no desenho)" },
    { nome: "Base_nerv", tipoDado: "comprimento", escopo: "tipo", valor: 0.155, grupo: "Catálogo", descricao: "Largura da base da nervura (pé a pé)" },
    { nome: "H_perfil", tipoDado: "comprimento", escopo: "tipo", valor: 0.075, grupo: "Catálogo", descricao: "Altura da nervura da chapa" },
    { nome: "T_chapa", tipoDado: "comprimento", escopo: "tipo", valor: 0.00095, grupo: "Catálogo", descricao: "Espessura nominal da chapa" },
    { nome: "Cob_tela", tipoDado: "comprimento", escopo: "tipo", valor: 0.02, grupo: "Catálogo", descricao: "Distância da face superior do concreto até a tela (Perfilor: 20 mm; Metform: padrão editável)" },
    { nome: "D_fio", tipoDado: "comprimento", escopo: "tipo", valor: 0.0038, grupo: "Catálogo", descricao: "Diâmetro do fio da tela (0 = sem tela especificada na fonte)" },
    { nome: "Peso_chapa", tipoDado: "numero", escopo: "tipo", valor: 0, grupo: "Catálogo", descricao: "Peso da chapa publicado pelo fabricante (kg/m²)" },
    { nome: "Consumo_concreto", tipoDado: "numero", escopo: "tipo", valor: 0, grupo: "Catálogo", descricao: "Consumo de concreto publicado (m³/m²)" },
    { nome: "Peso_proprio", tipoDado: "numero", escopo: "tipo", valor: 0, grupo: "Catálogo", descricao: "Peso próprio da laje publicado (kN/m²)" },
    { nome: "Peso_tela", tipoDado: "numero", escopo: "tipo", valor: 0, grupo: "Catálogo", descricao: "Peso da tela soldada publicado (kg/m²; 0 = não publicado)" },
    { nome: "Material_chapa", tipoDado: "material", escopo: "tipo", valor: "Aço", grupo: "Materiais" },
    { nome: "Material_concreto", tipoDado: "material", escopo: "tipo", valor: "Concreto", grupo: "Materiais" },
    { nome: "Material_aco", tipoDado: "material", escopo: "tipo", valor: "Aço", grupo: "Materiais" },
    { nome: "Largura", tipoDado: "comprimento", escopo: "instancia", formula: "Ondas*Passo", grupo: "Quantidades", descricao: "Largura da laje = Ondas × Passo" },
    { nome: "Alma", tipoDado: "comprimento", escopo: "instancia", formula: "(Base_nerv - Mesa)/2", grupo: "Quantidades", descricao: "Projeção horizontal de cada alma (almas retas e simétricas: modelagem da RA)" },
    { nome: "D_x", tipoDado: "inteiro", escopo: "instancia", formula: "se(Direcao = 1; 1; 0)", grupo: "Quantidades" },
    { nome: "H_h", tipoDado: "comprimento", escopo: "instancia", formula: "H_total - H_perfil - T_chapa", grupo: "Quantidades", descricao: "Capa de concreto acima da chapa" },
    { nome: "Area", tipoDado: "area", escopo: "instancia", formula: "Comprimento*Largura", grupo: "Quantidades" },
    { nome: "Vol_concreto", tipoDado: "volume", escopo: "instancia", formula: "Comprimento*Ondas*(Passo*H_total - H_perfil*(Alma + Mesa) - T_chapa*Passo)", grupo: "Quantidades", descricao: "Concreto da geometria (confere com o publicado dentro de ~1 mm de altura equivalente)" },
    { nome: "Vol_chapa", tipoDado: "volume", escopo: "instancia", formula: "Comprimento*Ondas*T_chapa*Passo", grupo: "Quantidades", descricao: "Volume da faixa de chapa modelada (não inclui as mossas)" },
    { nome: "Massa_chapa", tipoDado: "numero", escopo: "instancia", formula: "Peso_chapa*Area", grupo: "Quantidades", descricao: "Massa da chapa (kg) pelo peso PUBLICADO" },
    { nome: "Massa_tela", tipoDado: "numero", escopo: "instancia", formula: "Peso_tela*Area", grupo: "Quantidades", descricao: "Massa da tela (kg) pelo peso publicado (0 = não publicado)" },
    { nome: "Concreto_publicado", tipoDado: "volume", escopo: "instancia", formula: "Consumo_concreto*Area", grupo: "Quantidades", descricao: "Concreto pelo consumo PUBLICADO (m³)" },
    { nome: "Capacidade_ok", tipoDado: "inteiro", escopo: "instancia", formula: "se(Ondas <= " + NP + "; 1; 0)", grupo: "Quantidades", descricao: "0 se precisa de mais de " + NP + " ondas (a família só desenha " + NP + ")" }
  ];

  /* ---------------------------------------------------------------- PAINEL WALL */
  var tiposPW = [];
  LM.series({ tipo: "painel-wall", semUsuario: true }).forEach(function (s) {
    var d0 = s.dimensoes[0], op = s.tabela.opcoes, ult = null;
    op.forEach(function (o) { if (o.cargaKgfM2 != null) ult = o; });
    tiposPW.push({ id: "pw-" + s.id, nome: s.fabricante + " " + s.designacao + " (" + d0.larguraMm + " × " + d0.comprimentoMm + " mm)",
      fonte: LM.fonteTxt(s) + " · ASSUMIDO: espessura das placas cimentícias = " + (17) + "% da espessura (fração em volume do fibrocimento da Eternit 14% a 20%; a espessura da placa não é publicada)",
      valores: { Espessura: s.espessuraMm / 1000, Frac_fibro: 0.17, L_painel: d0.larguraMm / 1000, C_painel: d0.comprimentoMm / 1000, Peso_m2: d0.pesoKgM2, Esp_apoio_max: ult.espacamentoMm / 1000, Carga_tabelada: ult.cargaKgfM2 } });
  });
  var paramsPW = [
    { nome: "Comprimento", tipoDado: "comprimento", escopo: "instancia", valor: 2.5, grupo: "Dimensões", descricao: "Ao longo do comprimento do painel (perpendicular aos apoios)" },
    { nome: "Largura", tipoDado: "comprimento", escopo: "instancia", valor: 2.4, grupo: "Dimensões", descricao: "Ao longo dos apoios" },
    { nome: "Espessura", tipoDado: "comprimento", escopo: "tipo", valor: 0.04, grupo: "Catálogo", descricao: "Espessura do painel (catálogo)" },
    { nome: "Frac_fibro", tipoDado: "numero", escopo: "tipo", valor: 0.17, grupo: "Catálogo", descricao: "Fração em volume do fibrocimento (as duas faces): ASSUMIDO (Eternit: 14% a 20%); a espessura da placa não é publicada" },
    { nome: "L_painel", tipoDado: "comprimento", escopo: "tipo", valor: 1.2, grupo: "Catálogo", descricao: "Largura do painel de fábrica" },
    { nome: "C_painel", tipoDado: "comprimento", escopo: "tipo", valor: 2.5, grupo: "Catálogo", descricao: "Comprimento do painel de fábrica (1ª dimensão do catálogo)" },
    { nome: "Peso_m2", tipoDado: "numero", escopo: "tipo", valor: 0, grupo: "Catálogo", descricao: "Peso do painel publicado (kg/m²)" },
    { nome: "Esp_apoio_max", tipoDado: "comprimento", escopo: "tipo", valor: 1.25, grupo: "Catálogo", descricao: "Maior espaçamento entre apoios com carga tabelada (m)" },
    { nome: "Carga_tabelada", tipoDado: "numero", escopo: "tipo", valor: 0, grupo: "Catálogo", descricao: "Carga distribuída publicada nesse espaçamento (kgf/m²; a fonte não diz se inclui o peso próprio)" },
    { nome: "Material_face", tipoDado: "material", escopo: "tipo", valor: "Fibrocimento", grupo: "Materiais" },
    { nome: "Material_miolo", tipoDado: "material", escopo: "tipo", valor: "Madeira", grupo: "Materiais" },
    { nome: "Esp_face", tipoDado: "comprimento", escopo: "instancia", formula: "Frac_fibro*Espessura/2", grupo: "Quantidades", descricao: "Espessura de cada placa cimentícia (assumida)" },
    { nome: "Esp_miolo", tipoDado: "comprimento", escopo: "instancia", formula: "Espessura - 2*Esp_face", grupo: "Quantidades" },
    { nome: "Area", tipoDado: "area", escopo: "instancia", formula: "Comprimento*Largura", grupo: "Quantidades" },
    { nome: "Pecas_painel", tipoDado: "numero", escopo: "instancia", formula: "Area/(L_painel*C_painel)", grupo: "Quantidades", descricao: "Painéis de fábrica por área (sem juntas, cortes e perdas)" },
    { nome: "Massa", tipoDado: "numero", escopo: "instancia", formula: "Peso_m2*Area", grupo: "Quantidades", descricao: "Massa pelo peso PUBLICADO (kg)" }
  ];
  var solidosPW = [
    { id: "fi", nome: "Placa cimentícia inferior", forma: "caixa", x: "Comprimento/2", y: "0", z: "Largura/2", dx: "Comprimento", dy: "Esp_face", dz: "Largura", material: "Material_face" },
    { id: "mi", nome: "Miolo de madeira", forma: "caixa", x: "Comprimento/2", y: "Esp_face", z: "Largura/2", dx: "Comprimento", dy: "Esp_miolo", dz: "Largura", material: "Material_miolo" },
    { id: "fs", nome: "Placa cimentícia superior", forma: "caixa", x: "Comprimento/2", y: "Esp_face + Esp_miolo", z: "Largura/2", dx: "Comprimento", dy: "Esp_face", dz: "Largura", material: "Material_face" }
  ];

  FR.registrar([{
    id: "ra-laje-steel-deck", nome: "Laje steel deck (chapa colaborante + concreto + tela)", categoria: "laje", hospedagem: "livre",
    descricao: "Laje mista com fôrma de aço trapezoidal incorporada (Perfilor Polydeck 59S, Metform MF-50 e MF-75): chapa, concreto e tela como sólidos reais. Os tipos vêm do catálogo dos fabricantes (com a fonte e a página); duplicar um tipo e mudar os parâmetros o marca como parâmetro do usuário (a tabela do fabricante deixa de valer). A verificação normativa é do calculista.",
    justificativaForma: "A laje steel deck é uma chapa dobrada em ondas trapezoidais cheia de concreto até a face superior. A família extruda o contorno real de cada onda (as cotas — passo, vale, base, altura — são do catálogo; a mesa superior do Metform é medida no desenho).",
    parametros: paramsSD, tipos: tiposSD, solidos: solidos,
    quantitativo: { unidade: "m2", quantidade: "Area", codigo: "", fonte: "", descricao: "Laje steel deck (chapa de aço colaborante + concreto + tela) — catálogo de fabricantes" }
  }, {
    id: "ra-laje-painel-wall", nome: "Laje seca de Painel Wall (placas cimentícias + miolo de madeira)", categoria: "laje", hospedagem: "livre",
    descricao: "Laje seca/mezanino de painel sanduíche (miolo de madeira laminada/sarrafeada e placas cimentícias nas faces) apoiada em perfis metálicos ou de madeira (Decorlit e Eternit). Os tipos vêm do catálogo (com a fonte e a página); a espessura das placas das faces é ASSUMIDA (fração de fibrocimento da Eternit) porque nenhum fabricante a publica.",
    justificativaForma: "O Painel Wall é uma placa maciça de três camadas: duas placas cimentícias finas e o miolo de madeira. A família modela as três camadas como caixas contínuas (juntas e cortes de painel: use o motor puro js/lajesmistageo.js).",
    parametros: paramsPW, tipos: tiposPW, solidos: solidosPW,
    quantitativo: { unidade: "m2", quantidade: "Area", codigo: "", fonte: "", descricao: "Laje seca de Painel Wall — catálogo de fabricantes" }
  }]);
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
