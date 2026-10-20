/* =====================================================================
 * familiaspiscina.js — FAMÍLIAS DA ARQUITETURA DE PISCINA E DE PELE DE VIDRO (19/10/2026)
 *
 *   ra-piscina-fibra            casco de fibra com borda, degraus, banco, jatos e água; tipos = modelos de catálogo
 *   ra-casa-maquinas-piscina    abrigo enterrado/semienterrado dimensionado pelo filtro e pelas bombas do catálogo
 *   ra-vidro-retratil           pele de vidro recolhível (folhas de vidro temperado), HOSPEDADA numa abertura de parede
 *   ra-vidro-retratil-livre     a mesma pele de vidro, LIVRE entre dois pilares (a hospedagem é uma por família)
 *
 * Escrito no formato de js/familia.js (paramétrico, geometria por fórmula), na mesma linha de js/familiasra.js.
 * Motor puro (ES5, sem DOM). O js/familiasra.js lê FamiliasPiscina.lista() e põe as famílias na biblioteca.
 *
 * ⚠ REGRAS DESTE ARQUIVO (cada uma existe por um defeito que ela impede)
 *  1. Medida de catálogo tem FONTE escrita (fabricante, página, data da consulta). O que o catálogo NÃO dá
 *     fica com valor de projeto marcado "premissa RA" na descrição do parâmetro e no parâmetro "Conferir" do
 *     tipo: valor de reserva nunca pode parecer cota de fabricante.
 *  2. NUNCA código SINAPI inventado: o código fica em branco e o serviço diz "orçar à parte". Candidatos
 *     parecidos que existem na base ficam só como lembrete na descrição da família (não vinculados).
 *  3. Convenção de coordenadas (js/familia.js): X ao longo, Y para cima, Z para fora; caixa (x, y, z) = centro da
 *     BASE. Piscina e casa de máquinas: origem no centro, no NÍVEL DO PISO ACABADO (y = 0), o corpo desce (y < 0).
 *     Pele de vidro: origem no meio do vão, no piso, no eixo da parede/trilho.
 *  4. Volume de água sem a ficha do fabricante é ESTIMATIVA (fator de forma): o parâmetro Volume_fabricante_L
 *     (litros da ficha) vence a estimativa quando preenchido.
 *
 * FONTES (consultadas em 19/10/2026; tabela completa em piscina_mercado.md da pasta do executivo da obra)
 *  [S]  Splash Piscinas — https://www.splashpiscinas.com/piscinas/{cancun,bonaire,tradicional}  (medidas "aproximadas")
 *  [T]  Tibum Piscinas — https://www.tibumpiscinas.com.br/  (modelos Parati e Taiti)
 *  [J]  JCN Piscinas — https://www.jcnpiscinas.com.br/piscinasfibra/piscina-3-50-metros-florenza-fibra
 *  [F]  Fibralagos, Manual de Instalação — https://fibralagos.com.br/noticia/manual-de-instalacao
 *       (cava ~20 cm maior que a peça por lado; base de concreto 5 a 10 cm; farofa areia:cimento 7:1 sem socar)
 *  [SO] Sodramar, Catálogo Técnico Filtros e Bombas, REV007 de 04/08/2026 — filtros FM p. 08-09, bombas BMCP p. 21,
 *       bomba de hidromassagem BHPC p. 34-35
 *  [AC] Acristalia, Ficha Técnica Cortina de Cristal Série Basic Pro (ver. 02.2023) p. 7-8: folha até 700 x 2000 mm,
 *       vidro 6/8/10 mm, zona de armazenagem D = 28 x N + 17,5 mm
 *  [ZA] Zamia SeeGlass ONE — https://www.zamia.pt/product/24/cortinas_de_vidro: painel até 800 mm, altura 2500 mm (8 mm)
 *       e 3000 mm (10 mm), perfil inferior padrão ou embutido, painéis empilhados de um lado
 *  [WK] Wiknaplast — https://www.wiknaplast.com/produtos/cortinas-de-vidro/: painel até 700 mm, altura 3000 mm, 8 ou 10 mm, até 20 painéis
 *
 * ORÇAMENTO: nenhuma destas composições é achada na base SINAPI do sistema com equivalência verificada. Candidatos
 * próximos que existem na base (NÃO vinculados — conferir a equivalência antes de usar): escavação manual de vala 93358;
 * reaterro manual de valas com placa vibratória 104737; lastro de concreto magro em pisos 96620; instalação de vidro
 * temperado e = 8 mm / 10 mm em perfil U 102180 / 102181 (não é pele de vidro retrátil). Pele de vidro retrátil,
 * casco de piscina de fibra e casa de máquinas: "orçar à parte".
 * ===================================================================== */
(function (global) {
  "use strict";

  var G_DIM = "Dimensões", G_PRD = "Produto", G_INST = "Instalação", G_QTD = "Quantidades", G_MAT = "Materiais", G_CONF = "Conferir";
  function P(nome, tipoDado, escopo, valor, grupo, descricao) { return { nome: nome, tipoDado: tipoDado, escopo: escopo, valor: valor, grupo: grupo, descricao: descricao || "" }; }
  function F(nome, tipoDado, formula, grupo, descricao) { return { nome: nome, tipoDado: tipoDado, escopo: "instancia", formula: formula, grupo: grupo, descricao: descricao || "" }; }
  function cx(id, nome, x, y, z, dx, dy, dz, material, extra) {
    var o = { id: id, nome: nome, forma: "caixa", x: x, y: y, z: z, dx: dx, dy: dy, dz: dz, material: material };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function cil(id, nome, eixo, x, y, z, raio, altura, material, extra) {
    var o = { id: id, nome: nome, forma: "cilindro", eixo: eixo, x: x, y: y, z: z, raio: raio, altura: altura, material: material };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function S(id, descricao, unidade, quantidade) { return { id: id, descricao: descricao + " — orçar à parte (sem composição SINAPI vinculada)", unidade: unidade, quantidade: quantidade, codigo: "" }; }

  /* ===================================================================== PISCINA DE FIBRA */
  var MAX_DEGRAUS = 4, MAX_JATOS = 6;
  var AVISO_PREMISSA = "Premissa RA (não vem do catálogo): ";

  /* Os modelos: dimensões EXTERNAS do casco (C x L x prof.) como o fabricante publica ("medidas aproximadas").
     banco/degraus/hidro = o que a fonte diz; o que a fonte não diz entra como false/valor de desenho e vai em "Conferir". */
  var MODELOS = [
    { id: "splash-cancun-3", nome: "Splash Cancún 3 m (3,00 x 1,80 x 0,80) — banco com hidromassagem", fab: "Splash", modelo: "Cancún 3 m", C: 3.00, L: 1.80, P: 0.80,
      banco: true, degraus: true, hidro: "de série (banco com hidromassagem)", jatos: 4, fonte: "https://www.splashpiscinas.com/piscinas/cancun (19/10/2026)",
      conferir: "Nº de jatos não informado pelo fabricante (4 = premissa RA); volume em litros não informado; folga de escavação do fabricante não publicada; degraus/banco em desenho esquemático." },
    { id: "splash-cancun-4", nome: "Splash Cancún 4 m (4,00 x 2,00 x 1,20) — banco com hidromassagem", fab: "Splash", modelo: "Cancún 4 m", C: 4.00, L: 2.00, P: 1.20,
      banco: true, degraus: true, hidro: "de série (banco com hidromassagem)", jatos: 4, fonte: "https://www.splashpiscinas.com/piscinas/cancun (19/10/2026)",
      conferir: "Nº de jatos não informado (4 = premissa RA); volume não informado; folga do fabricante não publicada." },
    { id: "splash-bonaire-3", nome: "Splash Bonaire 3 m (3,00 x 2,00 x 0,90) — sem banco", fab: "Splash", modelo: "Bonaire 3 m", C: 3.00, L: 2.00, P: 0.90,
      banco: false, degraus: true, hidro: "não nesta medida (a linha tem banco com hidromassagem; o 3 m é \"sem banco\")", jatos: 0, fonte: "https://www.splashpiscinas.com/piscinas/bonaire (19/10/2026)",
      conferir: "Hidromassagem não informada para o 3 m; escada em desenho esquemático; volume não informado." },
    { id: "splash-tradicional-350-100", nome: "Splash Tradicional 3,50 x 1,80 x 1,00", fab: "Splash", modelo: "Tradicional 3,50 (prof. 1,00)", C: 3.50, L: 1.80, P: 1.00,
      banco: false, degraus: true, hidro: "opcional (kit de hidromassagem para piscina de fibra — confirmar com o fabricante)", jatos: 0, fonte: "https://www.splashpiscinas.com/piscinas/tradicional (19/10/2026)",
      conferir: "Banco, degraus e hidromassagem não informados na página (degraus em desenho esquemático); volume não informado." },
    { id: "splash-tradicional-350-140", nome: "Splash Tradicional 3,50 x 1,80 x 1,40 (lançamento)", fab: "Splash", modelo: "Tradicional 3,50 (prof. 1,40)", C: 3.50, L: 1.80, P: 1.40,
      banco: false, degraus: true, hidro: "opcional (kit de hidromassagem — confirmar com o fabricante)", jatos: 0, fonte: "https://www.splashpiscinas.com/piscinas/tradicional (19/10/2026)",
      conferir: "Banco, degraus e hidromassagem não informados (degraus em desenho esquemático); volume não informado." },
    { id: "tibum-parati", nome: "Tibum Parati 3,45 x 2,45 x 0,90", fab: "Tibum", modelo: "Parati", C: 3.45, L: 2.45, P: 0.90,
      banco: false, degraus: true, hidro: "não informado", jatos: 0, fonte: "https://www.tibumpiscinas.com.br/ (19/10/2026)",
      conferir: "Escada informada; banco, hidromassagem, litros e preço não informados." },
    { id: "tibum-taiti", nome: "Tibum Taiti 3,80 x 2,38 x 1,10 — banco para hidromassagem", fab: "Tibum", modelo: "Taiti", C: 3.80, L: 2.38, P: 1.10,
      banco: true, degraus: true, hidro: "banco para hidromassagem (nº de jatos não informado)", jatos: 4, fonte: "https://www.tibumpiscinas.com.br/ (19/10/2026)",
      conferir: "Nº de jatos não informado (4 = premissa RA); litros e preço não informados; formato oval no catálogo — aqui retangular equivalente." },
    { id: "jcn-florenza-350", nome: "Florenza 3,50 x 2,00 x 0,80 (revenda JCN)", fab: "JCN (revenda)", modelo: "Florenza 3,50", C: 3.50, L: 2.00, P: 0.80,
      banco: false, degraus: true, hidro: "\"opção de adicionar mais bicos\"", jatos: 0, fonte: "https://www.jcnpiscinas.com.br/piscinasfibra/piscina-3-50-metros-florenza-fibra (19/10/2026)",
      conferir: "Fabricante do casco não informado pela revenda; banco/escada/litros não informados." }
  ];

  function famPiscina() {
    var params = [
      P("Fabricante", "texto", "tipo", "", G_PRD, "Fabricante do modelo (catálogo público)"),
      P("Modelo_catalogo", "texto", "tipo", "", G_PRD, "Nome do modelo no catálogo"),
      P("Fonte", "texto", "tipo", "", G_PRD, "Endereço e data da consulta"),
      P("Conferir", "texto", "tipo", "", G_CONF, "O que a fonte NÃO traz ou é premissa do desenho — conferir com o fabricante antes de usar em projeto executivo"),
      P("Hidromassagem", "texto", "tipo", "não informado", G_PRD, "Hidromassagem: de série, opcional (kit) ou não informado"),
      P("Volume_fabricante_L", "numero", "tipo", 0, G_PRD, "Litros da ficha do fabricante (0 = não informado → estimativa pelo fator de forma)"),
      P("Comprimento", "comprimento", "tipo", 3.00, G_DIM, "Comprimento externo do casco (medida de catálogo)"),
      P("Largura", "comprimento", "tipo", 1.80, G_DIM, "Largura externa do casco (medida de catálogo)"),
      P("Profundidade", "comprimento", "tipo", 0.80, G_DIM, "Profundidade total do casco (medida de catálogo; o catálogo não diz se há fundo inclinado)"),
      P("Banco", "simnao", "tipo", true, G_DIM, "Tem banco na extremidade do comprimento"),
      P("Degraus", "simnao", "tipo", true, G_DIM, "Tem escada interna de degraus"),
      P("N_degraus", "inteiro", "tipo", 3, G_DIM, AVISO_PREMISSA + "nº de degraus (1 a " + MAX_DEGRAUS + ")"),
      P("N_jatos", "inteiro", "instancia", 0, G_DIM, "Jatos de hidromassagem visíveis no banco (0 a " + MAX_JATOS + "). Nº do fabricante não é publicado: o valor dos tipos com hidro de série é premissa RA"),
      P("Espessura_casco", "comprimento", "tipo", 0.02, G_DIM, AVISO_PREMISSA + "espessura de DESENHO do casco; a do fabricante não é publicada e não vale para cálculo"),
      P("Borda_larg", "comprimento", "tipo", 0.10, G_DIM, AVISO_PREMISSA + "largura da bordinha/capa além da parede do casco"),
      P("Borda_esp", "comprimento", "tipo", 0.04, G_DIM, AVISO_PREMISSA + "espessura da bordinha/capa"),
      P("Banco_prof", "comprimento", "tipo", 0.45, G_DIM, AVISO_PREMISSA + "extensão do banco ao longo do comprimento"),
      P("Esc_larg", "comprimento", "tipo", 0.60, G_DIM, AVISO_PREMISSA + "largura da faixa da escada interna"),
      P("Prof_degrau", "comprimento", "tipo", 0.30, G_DIM, AVISO_PREMISSA + "piso (profundidade) de cada degrau"),
      P("Fator_forma", "numero", "tipo", 0.70, G_QTD, AVISO_PREMISSA + "relação entre o volume de água e a caixa externa C x L x P (a ficha do fabricante, quando vier, substitui). Referência de ordem de grandeza: modelos de outro fabricante com litros publicados dão 0,77 e 0,92"),
      P("Nivel_agua_abaixo", "comprimento", "instancia", 0.10, G_DIM, AVISO_PREMISSA + "distância da superfície da água até o topo da borda"),
      P("Com_agua", "simnao", "instancia", true, G_DIM, "Desenhar a superfície/volume da água (translúcido)"),
      P("Mostrar_calcada", "simnao", "instancia", false, G_DIM, "Desenhar a calçada em volta (por padrão o deck é modelado à parte)"),
      P("Folga_escavacao", "comprimento", "instancia", 0.20, G_INST, "Folga da cava por lado — Fibralagos, Manual de Instalação: ~20 cm além das paredes. O manual do modelo escolhido manda"),
      P("Talude", "numero", "instancia", 0, G_INST, "Inclinação da parede da cava (H por V). 0 = parede vertical; o solo define (sondagem)"),
      P("Lastro_esp", "comprimento", "instancia", 0.10, G_INST, "Base/lastro sob o casco — Fibralagos: concreto liso e nivelado de 5 a 10 cm (Bramarfi: areia 5 a 7 cm)"),
      P("Calcada_larg", "comprimento", "instancia", 0.60, G_INST, AVISO_PREMISSA + "largura da calçada/deck em volta da borda"),
      P("Disp_C", "comprimento", "instancia", 0, G_INST, "Comprimento livre do terreno para a cava (0 = não conferir)"),
      P("Disp_L", "comprimento", "instancia", 0, G_INST, "Largura livre do terreno para a cava (0 = não conferir)"),
      P("Material_casco", "material", "tipo", "Fibra azul", G_MAT, "Cor do casco"),
      P("Material_borda", "material", "tipo", "Borda da piscina", G_MAT, "Bordinha/capa"),
      P("Material_agua", "material", "tipo", "Água da piscina", G_MAT, "Água"),
      /* ---------------------------------------------------------- derivados */
      F("Larg_interna", "comprimento", "Largura - 2*Espessura_casco", G_DIM, "Largura interna"),
      F("Comp_interno", "comprimento", "Comprimento - 2*Espessura_casco", G_DIM, "Comprimento interno"),
      F("Banco_alt", "comprimento", "min(0.45; Profundidade*0.55)", G_DIM, "Profundidade do assento do banco abaixo do topo (proporção de desenho)"),
      F("Alt_degrau", "comprimento", "min(0.30; Profundidade*0.85/max(1; N_degraus))", G_DIM, "Altura de cada degrau (proporção de desenho)"),
      F("Banco_len_z", "comprimento", "Larg_interna - se(Degraus; Esc_larg; 0)", G_DIM, "Extensão do banco na largura (o resto é a faixa da escada)"),
      F("Banco_cen_z", "comprimento", "Larg_interna/2 - Banco_len_z/2", G_DIM, "Centro do banco na largura"),
      F("Jato_passo", "comprimento", "min(0.30; Banco_len_z/(max(N_jatos; 1) + 1))", G_DIM, "Espaçamento entre jatos"),
      F("Jato_y", "comprimento", "0 - Banco_alt + 0.28", G_DIM, "Altura dos jatos (acima do assento, abaixo da água)"),
      F("Cabe_na_area", "simnao", "(Disp_C <= 0 ou Comprimento + 2*Folga_escavacao <= Disp_C + 0.001) e (Disp_L <= 0 ou Largura + 2*Folga_escavacao <= Disp_L + 0.001)", G_INST, "A cava (casco + folga) cabe na área livre informada"),
      F("Vao_cava_C", "comprimento", "Comprimento + 2*Folga_escavacao", G_QTD, "Comprimento da cava no fundo"),
      F("Vao_cava_L", "comprimento", "Largura + 2*Folga_escavacao", G_QTD, "Largura da cava no fundo"),
      F("Prof_escavacao", "comprimento", "Profundidade + Lastro_esp", G_QTD, "Profundidade da cava (casco + lastro)"),
      F("Area_base_cava", "area", "Vao_cava_C*Vao_cava_L", G_QTD, "Área do fundo da cava"),
      F("Area_topo_cava", "area", "(Vao_cava_C + 2*Talude*Prof_escavacao)*(Vao_cava_L + 2*Talude*Prof_escavacao)", G_QTD, "Área da boca da cava (com talude)"),
      F("Vol_escavacao", "volume", "Prof_escavacao/3*(Area_base_cava + Area_topo_cava + raiz(Area_base_cava*Area_topo_cava))", G_QTD, "Volume escavado (tronco de pirâmide; sem talude = prisma)"),
      F("Vol_lastro", "volume", "Area_base_cava*Lastro_esp", G_QTD, "Lastro/berço sob o casco"),
      F("Vol_casco_externo", "volume", "Comprimento*Largura*Profundidade", G_QTD, "Volume externo do casco (caixa C x L x P)"),
      F("Vol_reaterro", "volume", "max(0; Vol_escavacao - Vol_lastro - Vol_casco_externo)", G_QTD, "Reaterro entre o casco e a cava (farofa areia:cimento 7:1 — Fibralagos)"),
      F("Area_calcada", "area", "(Comprimento + 2*(Borda_larg + Calcada_larg))*(Largura + 2*(Borda_larg + Calcada_larg)) - (Comprimento + 2*Borda_larg)*(Largura + 2*Borda_larg)", G_QTD, "Calçada em volta da borda (m²)"),
      F("Volume_agua_L", "numero", "se(Volume_fabricante_L > 0; Volume_fabricante_L; Comprimento*Largura*Profundidade*Fator_forma*1000)", G_QTD, "Litros: ficha do fabricante, ou ESTIMATIVA pelo fator de forma"),
      F("Volume_agua_m3", "volume", "Volume_agua_L/1000", G_QTD, "Volume de água em m³")
    ];
    var sol = [];
    /* casco */
    sol.push(cx("fundo", "Fundo do casco", "0", "0 - Profundidade", "0", "Comprimento", "Espessura_casco", "Largura", "Material_casco"));
    sol.push(cx("p-z-", "Parede lateral (−Z)", "0", "0 - Profundidade", "0 - (Largura - Espessura_casco)/2", "Comprimento", "Profundidade - Borda_esp", "Espessura_casco", "Material_casco"));
    sol.push(cx("p-z+", "Parede lateral (+Z)", "0", "0 - Profundidade", "(Largura - Espessura_casco)/2", "Comprimento", "Profundidade - Borda_esp", "Espessura_casco", "Material_casco"));
    sol.push(cx("p-x-", "Parede de topo (−X)", "0 - (Comprimento - Espessura_casco)/2", "0 - Profundidade", "0", "Espessura_casco", "Profundidade - Borda_esp", "Larg_interna", "Material_casco"));
    sol.push(cx("p-x+", "Parede de topo (+X)", "(Comprimento - Espessura_casco)/2", "0 - Profundidade", "0", "Espessura_casco", "Profundidade - Borda_esp", "Larg_interna", "Material_casco"));
    /* bordinha / capa: moldura de 4 peças em volta da boca */
    sol.push(cx("bo-z-", "Borda (−Z)", "0", "0 - Borda_esp", "0 - (Largura/2 + (Borda_larg - Espessura_casco)/2)", "Comprimento + 2*Borda_larg", "Borda_esp", "Borda_larg + Espessura_casco", "Material_borda"));
    sol.push(cx("bo-z+", "Borda (+Z)", "0", "0 - Borda_esp", "Largura/2 + (Borda_larg - Espessura_casco)/2", "Comprimento + 2*Borda_larg", "Borda_esp", "Borda_larg + Espessura_casco", "Material_borda"));
    sol.push(cx("bo-x-", "Borda (−X)", "0 - (Comprimento/2 + (Borda_larg - Espessura_casco)/2)", "0 - Borda_esp", "0", "Borda_larg + Espessura_casco", "Borda_esp", "Larg_interna", "Material_borda"));
    sol.push(cx("bo-x+", "Borda (+X)", "Comprimento/2 + (Borda_larg - Espessura_casco)/2", "0 - Borda_esp", "0", "Borda_larg + Espessura_casco", "Borda_esp", "Larg_interna", "Material_borda"));
    /* banco na extremidade −X */
    sol.push(cx("banco", "Banco", "0 - Comp_interno/2 + Banco_prof/2", "0 - Profundidade + Espessura_casco", "Banco_cen_z", "Banco_prof", "Profundidade - Espessura_casco - Banco_alt", "Banco_len_z", "Material_casco", { visivel: "Banco" }));
    /* degraus: faixa da escada no lado −Z da extremidade −X, descendo em direção a +X */
    var k;
    for (k = 1; k <= MAX_DEGRAUS; k++) {
      sol.push(cx("degrau" + k, "Degrau " + k, "0 - Comp_interno/2 + (" + k + " - 0.5)*Prof_degrau", "0 - Profundidade + Espessura_casco", "0 - Larg_interna/2 + Esc_larg/2",
        "Prof_degrau", "Profundidade - Espessura_casco - " + k + "*Alt_degrau", "Esc_larg", "Material_casco", { visivel: "Degraus e N_degraus >= " + k }));
    }
    /* jatos de hidromassagem na parede da extremidade −X, acima do assento */
    for (k = 1; k <= MAX_JATOS; k++) {
      sol.push(cil("jato" + k, "Jato " + k, "x", "0 - Comp_interno/2", "Jato_y", "Banco_cen_z + (" + k + " - 1 - (N_jatos - 1)/2)*Jato_passo", "0.03", "0.02", "Metal cromado", { visivel: "N_jatos >= " + k }));
    }
    /* água: translúcida, do fundo até o nível */
    sol.push(cx("agua", "Água", "0", "0 - Profundidade + Espessura_casco", "0", "Comp_interno", "Profundidade - Espessura_casco - Nivel_agua_abaixo", "Larg_interna", "Material_agua", { visivel: "Com_agua" }));
    /* calçada (opcional) */
    sol.push(cx("cal-z-", "Calçada (−Z)", "0", "0 - 0.04", "0 - (Largura/2 + Borda_larg + Calcada_larg/2)", "Comprimento + 2*(Borda_larg + Calcada_larg)", "0.04", "Calcada_larg", "Concreto", { visivel: "Mostrar_calcada" }));
    sol.push(cx("cal-z+", "Calçada (+Z)", "0", "0 - 0.04", "Largura/2 + Borda_larg + Calcada_larg/2", "Comprimento + 2*(Borda_larg + Calcada_larg)", "0.04", "Calcada_larg", "Concreto", { visivel: "Mostrar_calcada" }));
    sol.push(cx("cal-x-", "Calçada (−X)", "0 - (Comprimento/2 + Borda_larg + Calcada_larg/2)", "0 - 0.04", "0", "Calcada_larg", "0.04", "Largura + 2*Borda_larg", "Concreto", { visivel: "Mostrar_calcada" }));
    sol.push(cx("cal-x+", "Calçada (+X)", "Comprimento/2 + Borda_larg + Calcada_larg/2", "0 - 0.04", "0", "Calcada_larg", "0.04", "Largura + 2*Borda_larg", "Concreto", { visivel: "Mostrar_calcada" }));

    return {
      id: "ra-piscina-fibra", nome: "Piscina de fibra (casco de mercado)", categoria: "generico", hospedagem: "livre", previa: "modelador",
      descricao: "Piscina de fibra residencial com os modelos de catálogo como TIPOS (dimensões externas com fonte). Casco com bordinha, banco, degraus, jatos de hidromassagem e água. " +
        "Origem no centro, no nível do piso acabado; o casco desce. Quantitativo: escavação (folga e talude), lastro, reaterro, calçada e volume de água. " +
        "Hidráulica da piscina é outra frente. Candidatos de orçamento na base (NÃO vinculados): escavação manual de vala 93358, reaterro manual 104737, lastro de concreto magro 96620 — o casco e a hidromassagem são \"orçar à parte\".",
      parametros: params,
      tipos: MODELOS.map(function (m) {
        return { id: m.id, nome: m.nome, valores: {
          Fabricante: m.fab, Modelo_catalogo: m.modelo, Fonte: m.fonte, Conferir: m.conferir, Hidromassagem: m.hidro,
          Comprimento: m.C, Largura: m.L, Profundidade: m.P, Banco: m.banco, Degraus: m.degraus, N_jatos: m.jatos } };
      }),
      solidos: sol,
      servicos: [
        S("escavacao", "Escavação da cava da piscina (com folga e talude)", "m3", "Vol_escavacao"),
        S("lastro", "Lastro/berço sob o casco da piscina", "m3", "Vol_lastro"),
        S("reaterro", "Reaterro entre casco e cava (areia:cimento 7:1)", "m3", "Vol_reaterro"),
        S("calcada", "Calçada/borda em volta da piscina", "m2", "Area_calcada"),
        S("agua", "Volume de água (primeiro enchimento)", "m3", "Volume_agua_m3")
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Casco de piscina de fibra (fornecimento e instalação — orçar à parte)" }
    };
  }

  /* ===================================================================== CASA DE MÁQUINAS */
  /* Equipamentos da Sodramar (Catálogo Técnico Filtros e Bombas, REV007 de 04/08/2026):
     filtro FM 30: A=770, B=325 mm (p. 09, leitura da tabela dimensional: A = altura, B = diâmetro; 3,5 m³/h; bomba 1/4 cv);
     filtro FM 36: A=820, B=380 mm (5,0 m³/h; bomba 1/3 cv);
     bomba BMCP 25/33/50: 240 x 140 x 180 mm (p. 21, desenho único das três; leitura do desenho);
     bomba de hidromassagem BHPC 50/75/100: A=358, B=150, C=185 mm (p. 35). */
  var CONJUNTOS = [
    { id: "fm30", nome: "Filtro FM 30 + bomba BMCP 25 (+ hidromassagem BHPC 50)", filtro: "FM 30", fD: 0.325, fH: 0.77, bA: 0.24, bB: 0.14, bC: 0.18, vazao: 3.5, cv: "1/4",
      conferir: "Diâmetro/altura do filtro e envelope da bomba lidos das tabelas/desenhos do catálogo (sem legenda em texto): conferir no desenho da página. BHPC: potência 1/2 cv (BHPC 50)." },
    { id: "fm36", nome: "Filtro FM 36 + bomba BMCP 33 (+ hidromassagem BHPC 75)", filtro: "FM 36", fD: 0.380, fH: 0.82, bA: 0.24, bB: 0.14, bC: 0.18, vazao: 5.0, cv: "1/3",
      conferir: "Idem: tabela dimensional FM 36 (A=820, B=380 mm) e desenho único da BMCP; BHPC 75 = 3/4 cv." }
  ];

  function famCasaMaquinas() {
    var params = [
      P("Filtro", "texto", "tipo", "FM 30", G_PRD, "Filtro de areia (Sodramar, Catálogo Técnico Filtros e Bombas REV007 de 04/08/2026, p. 08-09)"),
      P("Vazao_filtro_m3h", "numero", "tipo", 3.5, G_PRD, "Vazão de filtragem do filtro (catálogo)"),
      P("Bomba_cv", "texto", "tipo", "1/4", G_PRD, "Bomba de filtração correspondente (catálogo)"),
      P("Conferir", "texto", "tipo", "", G_CONF, "O que é leitura de desenho/premissa — conferir"),
      P("Filtro_D", "comprimento", "tipo", 0.325, G_DIM, "Diâmetro do filtro (tabela dimensional, coluna B)"),
      P("Filtro_H", "comprimento", "tipo", 0.77, G_DIM, "Altura do filtro com a válvula (tabela dimensional, coluna A)"),
      P("Bomba_A", "comprimento", "tipo", 0.24, G_DIM, "Bomba de filtração BMCP: comprimento (p. 21, desenho)"),
      P("Bomba_B", "comprimento", "tipo", 0.14, G_DIM, "Bomba de filtração: largura"),
      P("Bomba_C", "comprimento", "tipo", 0.18, G_DIM, "Bomba de filtração: altura"),
      P("Com_hidro", "simnao", "instancia", true, G_DIM, "Tem bomba de hidromassagem na casa de máquinas"),
      P("Hidro_A", "comprimento", "tipo", 0.358, G_DIM, "Bomba de hidromassagem BHPC: comprimento (p. 35, A)"),
      P("Hidro_B", "comprimento", "tipo", 0.15, G_DIM, "BHPC: largura (B)"),
      P("Hidro_C", "comprimento", "tipo", 0.185, G_DIM, "BHPC: altura (C)"),
      P("Folga_servico", "comprimento", "instancia", 0.15, G_DIM, AVISO_PREMISSA + "espaço livre entre equipamentos e paredes para manutenção"),
      P("Folga_topo", "comprimento", "instancia", 0.20, G_DIM, AVISO_PREMISSA + "folga acima do filtro (retrolavagem e válvula)"),
      P("Esp_parede", "comprimento", "instancia", 0.14, G_DIM, AVISO_PREMISSA + "parede de alvenaria de bloco 14 cm (reboco por dentro e por fora não incluído)"),
      P("Esp_fundo", "comprimento", "instancia", 0.10, G_DIM, AVISO_PREMISSA + "laje de fundo"),
      P("Esp_tampa", "comprimento", "instancia", 0.08, G_DIM, AVISO_PREMISSA + "tampa de concreto removível"),
      P("Acima_do_piso", "comprimento", "instancia", 0, G_DIM, "Quanto a tampa fica ACIMA do piso (0 = totalmente enterrada; > 0 = semienterrada)"),
      P("Tampa_aberta", "simnao", "instancia", false, G_DIM, "Tampa retirada: mostra os equipamentos"),
      P("Folga_escavacao", "comprimento", "instancia", 0.30, G_INST, AVISO_PREMISSA + "folga de escavação por lado para executar a alvenaria"),
      P("Material_parede", "material", "tipo", "Concreto", G_MAT, "Parede"),
      P("Material_tampa", "material", "tipo", "Aço", G_MAT, "Tampa"),
      F("N_itens", "inteiro", "2 + se(Com_hidro; 1; 0)", G_DIM, "Itens em fila: filtro, bomba e (opcional) bomba de hidromassagem"),
      F("Interno_C", "comprimento", "Filtro_D + Bomba_A + se(Com_hidro; Hidro_A; 0) + (N_itens + 1)*Folga_servico", G_DIM, "Comprimento interno"),
      F("Interno_L", "comprimento", "max(Filtro_D; Bomba_B; se(Com_hidro; Hidro_B; 0)) + 2*Folga_servico", G_DIM, "Largura interna"),
      F("Interno_H", "comprimento", "Filtro_H + Folga_topo", G_DIM, "Altura interna livre"),
      F("Ext_C", "comprimento", "Interno_C + 2*Esp_parede", G_DIM, "Comprimento externo"),
      F("Ext_L", "comprimento", "Interno_L + 2*Esp_parede", G_DIM, "Largura externa"),
      F("Ext_H", "comprimento", "Interno_H + Esp_fundo + Esp_tampa", G_DIM, "Altura externa total"),
      F("Y_fundo", "comprimento", "Acima_do_piso - Ext_H", G_DIM, "Cota da face de baixo (a tampa fica em Acima_do_piso)"),
      F("Vol_escavacao", "volume", "(Ext_C + 2*Folga_escavacao)*(Ext_L + 2*Folga_escavacao)*max(0; Ext_H - Acima_do_piso)", G_QTD, "Escavação (prisma; sem talude)"),
      F("Area_alvenaria", "area", "2*(Interno_C + Interno_L + 2*Esp_parede)*Interno_H", G_QTD, "Alvenaria (face média x altura interna)"),
      F("Vol_concreto", "volume", "Ext_C*Ext_L*(Esp_fundo + Esp_tampa)", G_QTD, "Laje de fundo + tampa")
    ];
    var sol = [];
    sol.push(cx("fundo", "Laje de fundo", "0", "Y_fundo", "0", "Ext_C", "Esp_fundo", "Ext_L", "Material_parede"));
    sol.push(cx("p-z-", "Parede (−Z)", "0", "Y_fundo + Esp_fundo", "0 - (Ext_L - Esp_parede)/2", "Ext_C", "Interno_H", "Esp_parede", "Material_parede"));
    sol.push(cx("p-z+", "Parede (+Z)", "0", "Y_fundo + Esp_fundo", "(Ext_L - Esp_parede)/2", "Ext_C", "Interno_H", "Esp_parede", "Material_parede"));
    sol.push(cx("p-x-", "Parede (−X)", "0 - (Ext_C - Esp_parede)/2", "Y_fundo + Esp_fundo", "0", "Esp_parede", "Interno_H", "Interno_L", "Material_parede"));
    sol.push(cx("p-x+", "Parede (+X)", "(Ext_C - Esp_parede)/2", "Y_fundo + Esp_fundo", "0", "Esp_parede", "Interno_H", "Interno_L", "Material_parede"));
    sol.push(cx("tampa", "Tampa", "0", "Acima_do_piso - Esp_tampa", "0", "Ext_C", "Esp_tampa", "Ext_L", "Material_tampa", { visivel: "nao(Tampa_aberta)" }));
    /* equipamentos (aparecem com a tampa retirada), em fila ao longo de X: filtro, bomba, hidromassagem */
    var base = "Y_fundo + Esp_fundo";
    var xFiltro = "0 - Interno_C/2 + Folga_servico + Filtro_D/2";
    var xBomba = "0 - Interno_C/2 + 2*Folga_servico + Filtro_D + Bomba_A/2";
    var xHidro = "0 - Interno_C/2 + 3*Folga_servico + Filtro_D + Bomba_A + Hidro_A/2";
    sol.push(cil("filtro", "Filtro de areia " + "(catálogo)", "y", xFiltro, base, "0", "Filtro_D/2", "Filtro_H", "Equipamento azul", { visivel: "Tampa_aberta" }));
    sol.push(cx("bomba", "Motobomba de filtração", xBomba, base, "0", "Bomba_A", "Bomba_C", "Bomba_B", "Equipamento preto", { visivel: "Tampa_aberta" }));
    sol.push(cx("bomba-hidro", "Motobomba de hidromassagem", xHidro, base, "0", "Hidro_A", "Hidro_C", "Hidro_B", "Equipamento preto", { visivel: "Tampa_aberta e Com_hidro" }));
    return {
      id: "ra-casa-maquinas-piscina", nome: "Casa de máquinas da piscina (enterrada/semienterrada)", categoria: "generico", hospedagem: "livre", previa: "modelador",
      descricao: "Abrigo de alvenaria/concreto com tampa, dimensionado pelo filtro e pelas bombas do catálogo Sodramar (REV007 de 04/08/2026): " +
        "interno = equipamentos em fila + folga de serviço. Só volume e arquitetura; tubulação e hidráulica são outra frente. Origem no centro, no piso; desce. " +
        "Folgas e espessuras são premissa RA (parâmetros). Orçamento: orçar à parte.",
      parametros: params,
      tipos: CONJUNTOS.map(function (c) {
        return { id: c.id, nome: c.nome, valores: { Filtro: c.filtro, Vazao_filtro_m3h: c.vazao, Bomba_cv: c.cv, Conferir: c.conferir, Filtro_D: c.fD, Filtro_H: c.fH,
          Bomba_A: c.bA, Bomba_B: c.bB, Bomba_C: c.bC } };
      }),
      solidos: sol,
      servicos: [
        S("escavacao", "Escavação da casa de máquinas", "m3", "Vol_escavacao"),
        S("alvenaria", "Alvenaria das paredes da casa de máquinas", "m2", "Area_alvenaria"),
        S("concreto", "Laje de fundo e tampa da casa de máquinas", "m3", "Vol_concreto"),
        S("filtro", "Filtro de areia (catálogo)", "un", "1"),
        S("bomba", "Motobomba de filtração (catálogo)", "un", "1"),
        S("bomba_hidro", "Motobomba de hidromassagem (catálogo)", "un", "se(Com_hidro; 1; 0)")
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Casa de máquinas da piscina (orçar à parte)" }
    };
  }

  /* ===================================================================== PELE DE VIDRO RECOLHÍVEL */
  var MAX_FOLHAS = 20;   /* [WK] até 20 painéis; o desenho tem esta quantidade de folhas disponíveis */
  /* tipos: sistemas de catálogo. altura/largura máximas por folha vêm do fabricante; passo de empilhamento só tem fonte na Acristalia [AC] */
  var SISTEMAS = [
    { id: "zamia-8", nome: "Vidro 8 mm — folha até 800 mm, altura até 2,50 m (SeeGlass ONE, Zamia)", esp: 0.008, larg: 0.80, hMax8: 2.5, hMax10: 3.0, nMax: 0,
      conferir: "Altura máx. 2500 mm (8 mm) / 3000 mm (10 mm) e painel até 800 mm: Zamia. Seção dos perfis e passo de empilhamento: o site não traz — usado o da Acristalia (28 mm) como premissa." },
    { id: "zamia-10", nome: "Vidro 10 mm — folha até 800 mm, altura até 3,00 m (SeeGlass ONE, Zamia)", esp: 0.010, larg: 0.80, hMax8: 2.5, hMax10: 3.0, nMax: 0,
      conferir: "Idem Zamia 8 mm." },
    { id: "wikna-10", nome: "Vidro 10 mm — folha até 700 mm, altura até 3,00 m, até 20 folhas (Wiknaplast)", esp: 0.010, larg: 0.70, hMax8: 3.0, hMax10: 3.0, nMax: 20,
      conferir: "Painel até 700 mm, altura até 3000 mm, 8 ou 10 mm, até 20 painéis: Wiknaplast. Perfis e passo de empilhamento: não informados — premissa Acristalia." },
    { id: "acristalia-8", nome: "Vidro 8 mm — folha até 700 mm, altura até 2,00 m (Basic Pro, Acristalia)", esp: 0.008, larg: 0.70, hMax8: 2.0, hMax10: 2.0, nMax: 0,
      conferir: "Folha até 700 x 2000 mm, peso máx. 35 kg/folha, zona de armazenagem D = 28 x N + 17,5 mm (ficha p. 7). Seções dos trilhos: desenho p. 8 sem legenda — premissa RA." }
  ];

  function famVidro(id, nome, hospedada) {
    var params = [
      P("Sistema", "texto", "tipo", "", G_PRD, "Sistema de envidraçamento de catálogo"),
      P("Conferir", "texto", "tipo", "", G_CONF, "O que o catálogo não traz ou é premissa — conferir"),
      P("Vao", "comprimento", "instancia", 3.00, G_DIM, "Largura do vão entre apoios (a pele de vidro fecha o vão inteiro)"),
      P("Altura", "comprimento", "instancia", 2.50, G_DIM, "Altura do piso até a face de baixo da viga/trilho superior"),
      P("Espessura_vidro", "comprimento", "tipo", 0.008, G_DIM, "Espessura do vidro temperado (8 ou 10 mm)"),
      P("Larg_max_folha", "comprimento", "tipo", 0.80, G_DIM, "Largura máxima de folha do sistema (catálogo do fabricante)"),
      P("Altura_max_8", "comprimento", "tipo", 2.5, G_DIM, "Altura máxima com vidro de 8 mm (catálogo)"),
      P("Altura_max_10", "comprimento", "tipo", 3.0, G_DIM, "Altura máxima com vidro de 10 mm (catálogo)"),
      P("N_folhas_max", "inteiro", "tipo", 0, G_DIM, "Nº máximo de folhas do sistema (0 = sem limite informado)"),
      P("Passo_pilha", "comprimento", "tipo", 0.028, G_DIM, "Passo entre folhas empilhadas — Acristalia Basic Pro: zona de armazenagem D = 28 x N + 17,5 mm (única fonte; premissa nos demais sistemas)"),
      P("Const_pilha", "comprimento", "tipo", 0.0175, G_DIM, "Constante da zona de armazenagem (17,5 mm — Acristalia)"),
      P("Embutido", "simnao", "tipo", true, G_DIM, "Trilho inferior embutido no piso (vão térreo livre)"),
      P("Trilho_inf_alt", "comprimento", "tipo", 0.035, G_DIM, "Altura do trilho inferior (Acristalia p. 8, leitura do desenho sem legenda: a conferir)"),
      P("Trilho_sup_alt", "comprimento", "tipo", 0.0505, G_DIM, "Altura do trilho superior (Acristalia p. 8, leitura do desenho: a conferir)"),
      P("Trilho_larg", "comprimento", "tipo", 0.05, G_DIM, AVISO_PREMISSA + "largura (profundidade) dos trilhos"),
      P("Junta", "comprimento", "tipo", 0.005, G_DIM, AVISO_PREMISSA + "junta/escova entre folhas fechadas"),
      P("Folga_inf", "comprimento", "tipo", 0.012, G_DIM, AVISO_PREMISSA + "folga entre o fundo do vidro e o trilho"),
      P("Encaixe_sup", "comprimento", "tipo", 0.02, G_DIM, AVISO_PREMISSA + "quanto o vidro entra no trilho superior"),
      P("Perfil_folha_alt", "comprimento", "tipo", 0.03, G_DIM, AVISO_PREMISSA + "altura dos perfis de topo e de base da folha"),
      P("Folga_lateral", "comprimento", "tipo", 0.02, G_DIM, AVISO_PREMISSA + "folga entre o apoio e a pilha de folhas recolhidas"),
      P("Pilha_a_direita", "simnao", "instancia", true, G_DIM, "Lado do empilhamento: verdadeiro = +X (direita de quem olha de dentro), falso = −X"),
      P("Pilha_para_fora", "simnao", "instancia", true, G_DIM, "A pilha de folhas recolhidas fica do lado +Z (fora) ou −Z (dentro)"),
      P("Aberto", "simnao", "instancia", false, G_DIM, "Posição para o 3D: aberto (todas as folhas empilhadas)"),
      P("Abertura", "numero", "instancia", 0, G_DIM, "Fração aberta de 0 (fechado) a 1 (aberto), quando 'Aberto' está desligado"),
      P("Cor_perfil", "material", "instancia", "Alumínio", G_MAT, "Cor do perfil: Alumínio, Alumínio branco, Alumínio preto ou Alumínio bronze"),
      P("Material_vidro", "material", "tipo", "Vidro temperado", G_MAT, "Vidro"),
      P("Simbolo_planta", "simnao", "instancia", true, G_DIM, "Desenha na planta a posição FECHADA (traço) e a seta do empilhamento"),
      F("N_folhas", "inteiro", "max(1; teto(Vao/Larg_max_folha - 0.0001))", G_DIM, "Nº de folhas = vão / largura máxima de folha, arredondado para cima"),
      F("Folha_larg", "comprimento", "(Vao - (N_folhas - 1)*Junta)/N_folhas", G_DIM, "Largura de cada folha"),
      F("Folha_alt", "comprimento", "Altura - Trilho_sup_alt + Encaixe_sup - Folga_inf", G_DIM, "Altura do vidro"),
      F("Altura_ok", "simnao", "Altura <= se(Espessura_vidro >= 0.0095; Altura_max_10; Altura_max_8) + 0.0001", G_DIM, "A altura respeita o limite do sistema para a espessura do vidro"),
      F("Folhas_ok", "simnao", "N_folhas <= " + MAX_FOLHAS + " e (N_folhas_max <= 0 ou N_folhas <= N_folhas_max)", G_DIM, "O nº de folhas respeita o limite do sistema"),
      F("Zona_pilha", "comprimento", "Passo_pilha*N_folhas + Const_pilha", G_DIM, "Comprimento ocupado pela pilha de folhas recolhidas (a vão livre = Vao − isto)"),
      F("Vao_livre_aberto", "comprimento", "Vao - Zona_pilha - Folga_lateral", G_DIM, "Vão livre com tudo aberto"),
      F("Sinal_lado", "inteiro", "se(Pilha_a_direita; 1; -1)", G_DIM, "+1 = pilha em +X"),
      F("Sinal_fora", "inteiro", "se(Pilha_para_fora; 1; -1)", G_DIM, "+1 = pilha em +Z"),
      F("Fracao", "numero", "se(Aberto; 1; min(1; max(0; Abertura)))", G_DIM, "Fração aberta efetiva"),
      F("Giro", "angulo", "90*Fracao", G_DIM, "Giro das folhas em planta (0 fechada, 90 recolhida perpendicular ao trilho)"),
      F("Area_vidro", "area", "N_folhas*Folha_larg*Folha_alt", G_QTD, "Área de vidro (m²)"),
      F("Trilho_inf_m", "comprimento", "Vao", G_QTD, "Trilho inferior (m)"),
      F("Trilho_sup_m", "comprimento", "Vao", G_QTD, "Trilho superior (m)")
    ];
    if (hospedada) params.push(P("Espessura_parede", "comprimento", "instancia", 0.15, "Hospedeiro", "Vem da parede onde a pele de vidro é colocada"));
    var sol = [];
    var yTrilhoInf = "se(Embutido; 0 - Trilho_inf_alt; 0)";
    sol.push(cx("tri", "Trilho inferior", "0", yTrilhoInf, "0", "Vao", "Trilho_inf_alt", "Trilho_larg", "Cor_perfil"));
    sol.push(cx("trs", "Trilho superior", "0", "Altura - Trilho_sup_alt", "0", "Vao", "Trilho_sup_alt", "Trilho_larg", "Cor_perfil"));
    var i;
    for (i = 1; i <= MAX_FOLHAS; i++) {
      var vis = { visivel: "N_folhas >= " + i };
      /* pivô = a borda da folha do lado da pilha; fechado: (i−1) folhas já passaram; aberto: empilha com o passo do sistema.
         O centro gira em volta do pivô: x = pivô − Sinal·(w/2)·cos, z = Sinal_fora·(w/2)·sen; giro do sólido = θ·Sinal_fora·Sinal_lado. */
      var piv = "((1 - Fracao)*Sinal_lado*(Vao/2 - (" + i + " - 1)*(Folha_larg + Junta)) + Fracao*Sinal_lado*(Vao/2 - Folga_lateral - (" + i + " - 1)*Passo_pilha))";
      var xc = piv + " - Sinal_lado*(Folha_larg/2)*cos(Giro)";
      var zc = "Sinal_fora*(Folha_larg/2)*sen(Giro)";
      var rot = "Giro*Sinal_fora*Sinal_lado";
      sol.push(cx("f" + i, "Folha " + i + " (vidro)", xc, "Folga_inf + Perfil_folha_alt", zc, "Folha_larg", "Folha_alt - 2*Perfil_folha_alt", "Espessura_vidro", "Material_vidro", { rot: rot, visivel: vis.visivel }));
      sol.push(cx("fb" + i, "Folha " + i + " — perfil de base", xc, "Folga_inf", zc, "Folha_larg", "Perfil_folha_alt", "Espessura_vidro + 0.012", "Cor_perfil", { rot: rot, visivel: vis.visivel }));
      sol.push(cx("ft" + i, "Folha " + i + " — perfil de topo", xc, "Folga_inf + Folha_alt - Perfil_folha_alt", zc, "Folha_larg", "Perfil_folha_alt", "Espessura_vidro + 0.012", "Cor_perfil", { rot: rot, visivel: vis.visivel }));
    }
    /* símbolo de planta: o traço da posição FECHADA (aparece quando já abriu) e a seta do empilhamento */
    sol.push(cx("sp-fechada", "Posição fechada (símbolo de planta)", "0", "0.002", "0", "Vao", "0.002", "0.004", "Cinza claro", { visivel: "Simbolo_planta e Fracao > 0.01" }));
    sol.push(cx("sp-pilha", "Onde a pilha recolhida fica (símbolo de planta)", "Sinal_lado*(Vao/2 - Folga_lateral - Zona_pilha/2 + Passo_pilha/2)", "0.002", "Sinal_fora*(Folha_larg/2)", "Zona_pilha", "0.002", "Folha_larg", "Cinza claro", { visivel: "Simbolo_planta e Fracao < 0.99" }));
    sol.push({ id: "sp-seta", nome: "Seta do empilhamento (símbolo de planta)", forma: "extrusao", plano: "planta", x: "0", y: "0.004", z: "Sinal_fora*(Folha_larg + 0.25)",
      altura: "0.002", contorno: [["Sinal_lado*(Vao/2 - 0.55)", "0 - 0.05"], ["Sinal_lado*(Vao/2 - 0.55)", "0.05"], ["Sinal_lado*(Vao/2 - 0.20)", "0"]], material: "Cinza escuro", visivel: "Simbolo_planta" });
    return {
      id: id, nome: nome, categoria: "janela", hospedagem: hospedada ? "parede" : "livre", previa: "modelador",
      descricao: "Pele de vidro recolhível (folhas de vidro temperado de " + "8 ou 10 mm) que correm num trilho inferior embutido no piso e num trilho superior fixo na viga, e se recolhem EMPILHADAS de um lado (perpendiculares ao trilho), " +
        "abrindo o vão inteiro. Nº de folhas = vão / largura máxima de folha do sistema (catálogo). " + (hospedada ? "HOSPEDADA: abre o vão na parede." : "LIVRE: entre dois pilares/apoios (sem vão de parede).") +
        " Origem no meio do vão, no piso, no eixo do trilho. Seções de trilho e passo de empilhamento: ver 'Conferir' do tipo. Orçamento: orçar à parte (não é vidro em perfil U).",
      parametros: params,
      tipos: SISTEMAS.map(function (s) {
        return { id: s.id, nome: s.nome, valores: { Sistema: s.nome, Conferir: s.conferir, Espessura_vidro: s.esp, Larg_max_folha: s.larg, Altura_max_8: s.hMax8, Altura_max_10: s.hMax10, N_folhas_max: s.nMax } };
      }),
      abertura: hospedada ? { largura: "Vao", altura: "Altura", peitoril: "0" } : undefined,
      solidos: sol,
      servicos: [
        S("vidro", "Vidro temperado das folhas", "m2", "Area_vidro"),
        S("trilho_inf", "Trilho inferior embutido", "m", "Trilho_inf_m"),
        S("trilho_sup", "Trilho superior", "m", "Trilho_sup_m"),
        S("folhas", "Folhas (perfis, roldanas e ferragens do sistema)", "un", "N_folhas")
      ],
      quantitativo: { unidade: "m2", quantidade: "Area_vidro", codigo: "", fonte: "", descricao: "Pele de vidro recolhível (orçar à parte)" }
    };
  }

  function montar() {
    var l = [famPiscina(), famCasaMaquinas(), famVidro("ra-vidro-retratil", "Pele de vidro recolhível (em abertura de parede)", true),
             famVidro("ra-vidro-retratil-livre", "Pele de vidro recolhível (livre entre pilares)", false)];
    l.forEach(function (f) { if (f.abertura === undefined) delete f.abertura; });
    return l;
  }
  var CACHE = null;
  var FamiliasPiscina = {
    MODELOS: MODELOS, CONJUNTOS: CONJUNTOS, SISTEMAS: SISTEMAS, MAX_FOLHAS: MAX_FOLHAS,
    lista: function () { if (!CACHE) CACHE = montar(); return JSON.parse(JSON.stringify(CACHE)); },
    obter: function (id) { var l = this.lista(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  };
  global.FamiliasPiscina = FamiliasPiscina;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasPiscina;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
