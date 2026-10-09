/* =====================================================================
 * familiasra.js — BIBLIOTECA RA de famílias paramétricas (07/10/2026)
 *
 * As primeiras famílias do OrçaPRO, escritas no formato de js/familia.js —
 * as mesmas que o usuário cria no Editor de família. Servem de ponto de
 * partida (duplicar e mudar) e de prova de que o formato aguenta porta e
 * janela HOSPEDADAS (abrem o vão), pilar e viga com quantitativo em m³,
 * mobiliário, louça e equipamento.
 *
 * ⚠ CÓDIGO DE ORÇAMENTO EM BRANCO DE PROPÓSITO. Regra da casa: nunca inventar
 *   código SINAPI. O quantitativo sai (unidade + quantidade); o código, quem
 *   preenche é o usuário, na família ou no orçamento.
 * Convenção local (js/familia.js): origem no PISO; X ao longo da parede, Y
 * para cima, Z para fora. Caixa: (x, y, z) = centro da BASE.
 * ===================================================================== */
(function (global) {
  "use strict";

  var LISTA = [
    {
      id: "ra-porta-giro", nome: "Porta de giro (madeira)", categoria: "porta", hospedagem: "parede",
      descricao: "Porta de uma folha, de giro, com batente e guarnição. Abre o vão na parede.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 0.80, grupo: "Dimensões", descricao: "Largura livre da folha" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 2.10, grupo: "Dimensões" },
        { nome: "Espessura_folha", tipoDado: "comprimento", escopo: "tipo", valor: 0.035, grupo: "Dimensões" },
        { nome: "Batente", tipoDado: "comprimento", escopo: "tipo", valor: 0.05, grupo: "Dimensões", descricao: "Largura da peça do batente" },
        { nome: "Espessura_parede", tipoDado: "comprimento", escopo: "instancia", valor: 0.15, grupo: "Hospedeiro", descricao: "Vem da parede onde a porta é colocada" },
        { nome: "Abre_para_fora", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Construção" },
        { nome: "Material_folha", tipoDado: "material", escopo: "tipo", valor: "Madeira", grupo: "Materiais" },
        { nome: "Material_batente", tipoDado: "material", escopo: "tipo", valor: "Madeira", grupo: "Materiais" },
        { nome: "Lado_folha", tipoDado: "numero", escopo: "instancia", formula: "se(Abre_para_fora; 1; -1)", grupo: "Construção" },
        { nome: "Area_vao", tipoDado: "area", escopo: "tipo", formula: "(Largura + 2*Batente) * (Altura + Batente)", grupo: "Quantidades" }
      ],
      tipos: [
        { id: "p70", nome: "0,70 × 2,10", valores: { Largura: 0.70 } },
        { id: "p80", nome: "0,80 × 2,10", valores: { Largura: 0.80 } },
        { id: "p90", nome: "0,90 × 2,10", valores: { Largura: 0.90 } }
      ],
      abertura: { largura: "Largura + 2*Batente", altura: "Altura + Batente", peitoril: "0" },
      solidos: [
        { id: "be", nome: "Batente esquerdo", forma: "caixa", x: "-(Largura + Batente)/2", y: "0", z: "0", dx: "Batente", dy: "Altura + Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "bd", nome: "Batente direito", forma: "caixa", x: "(Largura + Batente)/2", y: "0", z: "0", dx: "Batente", dy: "Altura + Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "bs", nome: "Batente superior", forma: "caixa", x: "0", y: "Altura", z: "0", dx: "Largura", dy: "Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "fo", nome: "Folha", forma: "caixa", x: "0", y: "0.008", z: "Lado_folha*(Espessura_parede - Espessura_folha)/2", dx: "Largura - 0.006", dy: "Altura - 0.012", dz: "Espessura_folha", material: "Material_folha" },
        { id: "ma", nome: "Maçaneta", forma: "cilindro", eixo: "z", x: "Largura/2 - 0.07", y: "1.05", z: "Lado_folha*(Espessura_parede/2 + 0.002)", raio: "0.012", altura: "0.06", material: "Metal" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Porta de madeira de giro" }
    },
    {
      id: "ra-janela-correr", nome: "Janela de correr 2 folhas", categoria: "janela", hospedagem: "parede",
      descricao: "Janela de correr de duas folhas com marco e peitoril (pingadeira). Abre o vão na parede.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 1.20, grupo: "Dimensões" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 1.00, grupo: "Dimensões" },
        { nome: "Peitoril", tipoDado: "comprimento", escopo: "instancia", valor: 1.10, grupo: "Dimensões", descricao: "Altura do piso até a base do vão" },
        { nome: "Marco", tipoDado: "comprimento", escopo: "tipo", valor: 0.045, grupo: "Dimensões" },
        { nome: "Espessura_parede", tipoDado: "comprimento", escopo: "instancia", valor: 0.15, grupo: "Hospedeiro" },
        { nome: "Com_pingadeira", tipoDado: "simnao", escopo: "tipo", valor: true, grupo: "Construção" },
        { nome: "Material_marco", tipoDado: "material", escopo: "tipo", valor: "Alumínio", grupo: "Materiais" },
        { nome: "Material_vidro", tipoDado: "material", escopo: "tipo", valor: "Vidro", grupo: "Materiais" },
        { nome: "Area_vao", tipoDado: "area", escopo: "tipo", formula: "Largura * Altura", grupo: "Quantidades" }
      ],
      tipos: [
        { id: "j1010", nome: "1,00 × 1,00", valores: { Largura: 1.00, Altura: 1.00 } },
        { id: "j1210", nome: "1,20 × 1,00", valores: { Largura: 1.20, Altura: 1.00 } },
        { id: "j1512", nome: "1,50 × 1,20", valores: { Largura: 1.50, Altura: 1.20 } },
        { id: "j6060", nome: "0,60 × 0,60 (banheiro)", valores: { Largura: 0.60, Altura: 0.60 } }
      ],
      abertura: { largura: "Largura", altura: "Altura", peitoril: "Peitoril" },
      solidos: [
        { id: "mi", nome: "Marco inferior", forma: "caixa", x: "0", y: "Peitoril", z: "0", dx: "Largura", dy: "Marco", dz: "0.08", material: "Material_marco" },
        { id: "ms", nome: "Marco superior", forma: "caixa", x: "0", y: "Peitoril + Altura - Marco", z: "0", dx: "Largura", dy: "Marco", dz: "0.08", material: "Material_marco" },
        { id: "me", nome: "Marco esquerdo", forma: "caixa", x: "-(Largura - Marco)/2", y: "Peitoril", z: "0", dx: "Marco", dy: "Altura", dz: "0.08", material: "Material_marco" },
        { id: "md", nome: "Marco direito", forma: "caixa", x: "(Largura - Marco)/2", y: "Peitoril", z: "0", dx: "Marco", dy: "Altura", dz: "0.08", material: "Material_marco" },
        { id: "v1", nome: "Folha 1 (vidro)", forma: "caixa", x: "-(Largura - 2*Marco)/4", y: "Peitoril + Marco", z: "-0.015", dx: "(Largura - 2*Marco)/2 + 0.02", dy: "Altura - 2*Marco", dz: "0.008", material: "Material_vidro" },
        { id: "v2", nome: "Folha 2 (vidro)", forma: "caixa", x: "(Largura - 2*Marco)/4", y: "Peitoril + Marco", z: "0.015", dx: "(Largura - 2*Marco)/2 + 0.02", dy: "Altura - 2*Marco", dz: "0.008", material: "Material_vidro" },
        { id: "pi", nome: "Pingadeira", forma: "caixa", x: "0", y: "Peitoril - 0.02", z: "Espessura_parede/2", dx: "Largura + 0.06", dy: "0.02", dz: "0.06", material: "Granito", visivel: "Com_pingadeira" }
      ],
      quantitativo: { unidade: "m2", quantidade: "Largura * Altura", codigo: "", fonte: "", descricao: "Janela de correr em alumínio com vidro" }
    },
    {
      id: "ra-pilar-ret", nome: "Pilar retangular de concreto", categoria: "pilar", hospedagem: "livre",
      descricao: "Pilar de seção retangular. Quantitativo em m³ de concreto e m² de forma.",
      parametros: [
        { nome: "Base", tipoDado: "comprimento", escopo: "tipo", valor: 0.20, grupo: "Dimensões", descricao: "Lado ao longo de X" },
        { nome: "Profundidade", tipoDado: "comprimento", escopo: "tipo", valor: 0.30, grupo: "Dimensões", descricao: "Lado ao longo de Z" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "instancia", valor: 2.80, grupo: "Dimensões" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Concreto", grupo: "Materiais" },
        { nome: "Volume", tipoDado: "volume", escopo: "instancia", formula: "Base * Profundidade * Altura", grupo: "Quantidades" },
        { nome: "Area_forma", tipoDado: "area", escopo: "instancia", formula: "2 * (Base + Profundidade) * Altura", grupo: "Quantidades" }
      ],
      tipos: [
        { id: "p1430", nome: "14 × 30", valores: { Base: 0.14, Profundidade: 0.30 } },
        { id: "p2020", nome: "20 × 20", valores: { Base: 0.20, Profundidade: 0.20 } },
        { id: "p2040", nome: "20 × 40", valores: { Base: 0.20, Profundidade: 0.40 } }
      ],
      solidos: [{ id: "c", nome: "Pilar", forma: "caixa", x: "0", y: "0", z: "0", dx: "Base", dy: "Altura", dz: "Profundidade", material: "Material" }],
      quantitativo: { unidade: "m3", quantidade: "Volume", codigo: "", fonte: "", descricao: "Concreto do pilar" }
    },
    {
      id: "ra-viga-ret", nome: "Viga retangular de concreto", categoria: "viga", hospedagem: "livre",
      descricao: "Viga ao longo de X a partir do ponto de inserção, com o topo na elevação dada.",
      parametros: [
        { nome: "Comprimento", tipoDado: "comprimento", escopo: "instancia", valor: 3.00, grupo: "Dimensões" },
        { nome: "Base", tipoDado: "comprimento", escopo: "tipo", valor: 0.14, grupo: "Dimensões" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 0.40, grupo: "Dimensões" },
        { nome: "Topo", tipoDado: "comprimento", escopo: "instancia", valor: 2.80, grupo: "Restrições", descricao: "Elevação do topo da viga a partir do piso" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Concreto", grupo: "Materiais" },
        { nome: "Volume", tipoDado: "volume", escopo: "instancia", formula: "Base * Altura * Comprimento", grupo: "Quantidades" }
      ],
      tipos: [
        { id: "v1440", nome: "14 × 40", valores: { Base: 0.14, Altura: 0.40 } },
        { id: "v1950", nome: "19 × 50", valores: { Base: 0.19, Altura: 0.50 } }
      ],
      solidos: [{ id: "c", nome: "Viga", forma: "caixa", x: "Comprimento/2", y: "Topo - Altura", z: "0", dx: "Comprimento", dy: "Altura", dz: "Base", material: "Material" }],
      quantitativo: { unidade: "m3", quantidade: "Volume", codigo: "", fonte: "", descricao: "Concreto da viga" }
    },
    {
      id: "ra-bancada", nome: "Bancada de cozinha com cuba", categoria: "mobiliario", hospedagem: "livre",
      descricao: "Gabinete com tampo de granito e cuba opcional.",
      parametros: [
        { nome: "Comprimento", tipoDado: "comprimento", escopo: "tipo", valor: 1.80, grupo: "Dimensões" },
        { nome: "Profundidade", tipoDado: "comprimento", escopo: "tipo", valor: 0.60, grupo: "Dimensões" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 0.90, grupo: "Dimensões" },
        { nome: "Tampo", tipoDado: "comprimento", escopo: "tipo", valor: 0.03, grupo: "Dimensões", descricao: "Espessura do tampo" },
        { nome: "Com_cuba", tipoDado: "simnao", escopo: "instancia", valor: true, grupo: "Construção" },
        { nome: "Material_tampo", tipoDado: "material", escopo: "tipo", valor: "Granito", grupo: "Materiais" },
        { nome: "Material_gabinete", tipoDado: "material", escopo: "tipo", valor: "MDF branco", grupo: "Materiais" }
      ],
      tipos: [
        { id: "b120", nome: "1,20 m", valores: { Comprimento: 1.20 } },
        { id: "b180", nome: "1,80 m", valores: { Comprimento: 1.80 } },
        { id: "b240", nome: "2,40 m", valores: { Comprimento: 2.40 } }
      ],
      solidos: [
        { id: "g", nome: "Gabinete", forma: "caixa", x: "0", y: "0.10", z: "0.02", dx: "Comprimento - 0.02", dy: "Altura - Tampo - 0.10", dz: "Profundidade - 0.06", material: "Material_gabinete" },
        { id: "t", nome: "Tampo", forma: "caixa", x: "0", y: "Altura - Tampo", z: "0", dx: "Comprimento", dy: "Tampo", dz: "Profundidade", material: "Material_tampo" },
        { id: "c", nome: "Cuba", forma: "caixa", x: "Comprimento/4", y: "Altura - 0.18", z: "0.03", dx: "0.50", dy: "0.17", dz: "0.36", material: "Inox", visivel: "Com_cuba" }
      ],
      quantitativo: { unidade: "m", quantidade: "Comprimento", codigo: "", fonte: "", descricao: "Bancada de granito com gabinete" }
    },
    {
      id: "ra-bacia", nome: "Bacia sanitária com caixa acoplada", categoria: "loucas", hospedagem: "livre",
      descricao: "Louça simplificada em volumes (base, assento, caixa acoplada). Encostar o fundo (Z negativo) na parede.",
      parametros: [
        { nome: "Altura_assento", tipoDado: "comprimento", escopo: "tipo", valor: 0.40, grupo: "Dimensões" },
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 0.38, grupo: "Dimensões" },
        { nome: "Comprimento", tipoDado: "comprimento", escopo: "tipo", valor: 0.65, grupo: "Dimensões" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Louça branca", grupo: "Materiais" }
      ],
      tipos: [
        { id: "conv", nome: "Convencional", valores: {} },
        { id: "inf", nome: "Infantil", valores: { Altura_assento: 0.30, Largura: 0.32, Comprimento: 0.55 } }
      ],
      solidos: [
        { id: "pe", nome: "Pé", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "Comprimento*0.15", raio: "Largura*0.35", altura: "Altura_assento - 0.04", material: "Material" },
        { id: "as", nome: "Assento", forma: "caixa", x: "0", y: "Altura_assento - 0.05", z: "Comprimento*0.12", dx: "Largura", dy: "0.05", dz: "Comprimento*0.70", material: "Material" },
        { id: "cx", nome: "Caixa acoplada", forma: "caixa", x: "0", y: "Altura_assento - 0.05", z: "-Comprimento*0.32", dx: "Largura*0.95", dy: "0.40", dz: "0.18", material: "Material" }
      ],
      /* pontos de ligação (B5, js/biminst.js): a saída de esgoto no PISO, no eixo
         da louça, e a água fria da caixa acoplada na parede do fundo. Posição
         típica de catálogo — ajuste na família se a louça for outra. */
      conectores: [
        { id: "esgoto", nome: "Saída de esgoto", sistema: "esgoto", dn: 100, x: "0", y: "0", z: "0" },
        { id: "af", nome: "Água fria (caixa acoplada)", sistema: "agua_fria", dn: 20, x: "-0.15", y: "0.20", z: "-Comprimento*0.32 - 0.09" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Bacia sanitária com caixa acoplada" }
    },
    {
      id: "ra-caixa-dagua", nome: "Caixa d'água cilíndrica", categoria: "equipamento", hospedagem: "livre",
      descricao: "Reservatório de polietileno, com tampa. A capacidade é parâmetro do tipo.",
      parametros: [
        { nome: "Capacidade_L", tipoDado: "inteiro", escopo: "tipo", valor: 1000, grupo: "Dados" },
        { nome: "Diametro", tipoDado: "comprimento", escopo: "tipo", valor: 1.40, grupo: "Dimensões" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 0.88, grupo: "Dimensões" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Polietileno azul", grupo: "Materiais" },
        { nome: "Peso_cheia_kg", tipoDado: "numero", escopo: "tipo", formula: "Capacidade_L * 1.0 + 30", grupo: "Dados", descricao: "Água (1 kg/L) + reservatório (aprox.)" }
      ],
      tipos: [
        { id: "c500", nome: "500 L", valores: { Capacidade_L: 500, Diametro: 1.22, Altura: 0.58 } },
        { id: "c1000", nome: "1.000 L", valores: { Capacidade_L: 1000, Diametro: 1.40, Altura: 0.88 } },
        { id: "c2000", nome: "2.000 L", valores: { Capacidade_L: 2000, Diametro: 1.75, Altura: 1.10 } }
      ],
      solidos: [
        { id: "co", nome: "Corpo", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "0", raio: "Diametro/2", altura: "Altura", material: "Material" },
        { id: "ta", nome: "Tampa", forma: "cilindro", eixo: "y", x: "0", y: "Altura", z: "0", raio: "Diametro/2 + 0.02", altura: "0.06", material: "Material" }
      ],
      /* B5: a SAÍDA de consumo perto do fundo e a ENTRADA (boia) perto do topo */
      conectores: [
        { id: "saida", nome: "Saída (consumo)", sistema: "agua_fria", dn: 25, x: "Diametro/2", y: "0.08", z: "0" },
        { id: "entrada", nome: "Entrada (alimentação)", sistema: "agua_fria", dn: 20, x: "-Diametro/2", y: "Altura - 0.10", z: "0" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Caixa d'água de polietileno" }
    },
    /* B5 (08/10/2026): louças com ponto de ligação, para o tubo "chegar" no aparelho */
    {
      id: "ra-lavatorio", nome: "Lavatório suspenso", categoria: "loucas", hospedagem: "livre", previa: "modelador",
      descricao: "Lavatório de louça suspenso. O fundo (Z negativo) encosta na parede; esgoto e água fria saem da parede.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 0.45, grupo: "Dimensões" },
        { nome: "Profundidade", tipoDado: "comprimento", escopo: "tipo", valor: 0.35, grupo: "Dimensões" },
        { nome: "Altura_borda", tipoDado: "comprimento", escopo: "instancia", valor: 0.80, grupo: "Dimensões", descricao: "Do piso até a borda da louça" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Louça branca", grupo: "Materiais" }
      ],
      tipos: [
        { id: "l4535", nome: "45 × 35", valores: {} },
        { id: "l4030", nome: "40 × 30", valores: { Largura: 0.40, Profundidade: 0.30 } }
      ],
      solidos: [
        { id: "cu", nome: "Cuba", forma: "caixa", x: "0", y: "Altura_borda - 0.16", z: "0", dx: "Largura", dy: "0.16", dz: "Profundidade", material: "Material" }
      ],
      conectores: [
        { id: "esgoto", nome: "Esgoto (sifão)", sistema: "esgoto", dn: 40, x: "0", y: "0.50", z: "-Profundidade/2" },
        { id: "af", nome: "Água fria", sistema: "agua_fria", dn: 20, x: "0.10", y: "0.60", z: "-Profundidade/2" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Lavatório de louça suspenso" }
    },
    {
      id: "ra-chuveiro", nome: "Chuveiro", categoria: "loucas", hospedagem: "livre", previa: "modelador",
      descricao: "Chuveiro de parede. O ponto de água fica na parede (Z negativo), na altura do braço.",
      parametros: [
        { nome: "Altura_ponto", tipoDado: "comprimento", escopo: "instancia", valor: 2.10, grupo: "Dimensões", descricao: "Do piso até o ponto de água" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Metal", grupo: "Materiais" }
      ],
      tipos: [{ id: "ch", nome: "Padrão", valores: {} }],
      solidos: [
        { id: "br", nome: "Braço", forma: "cilindro", eixo: "z", x: "0", y: "Altura_ponto", z: "-0.30", raio: "0.012", altura: "0.30", material: "Material" },
        { id: "cb", nome: "Crivo", forma: "cilindro", eixo: "y", x: "0", y: "Altura_ponto - 0.10", z: "0", raio: "0.08", altura: "0.06", material: "Material" }
      ],
      conectores: [
        { id: "af", nome: "Água (chuveiro)", sistema: "agua_fria", dn: 20, x: "0", y: "Altura_ponto", z: "-0.30" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Chuveiro" }
    }
  ];

  /* família com `previa: "modelador"` só aparece com a prévia do modelador
     ligada (js/bimprevia.js) — recurso novo do B5 não muda a biblioteca de
     quem não ligou a prévia. `todas: true` lista tudo (testes). */
  function visivel(f, todas) {
    if (!f.previa || todas) return true;
    var BP = global.BimPrevia;
    return !!(BP && BP.modelador && f.previa === "modelador" && BP.modelador());
  }
  /* =====================================================================
   * BIBLIOTECA RA AMPLIADA (B6, 08/10/2026 — PLANO-BIM-MODELADOR.md)
   * Madeira serrada, BombUp, louças e esquadrias. As medidas de cada
   * uma têm FONTE escrita na descrição; o que é "medida usual de catálogo"
   * está dito assim (conferir o modelo comprado). Código de orçamento em
   * branco pela mesma regra de cima. tools/test-bim-b6.js cobra: todas
   * válidas, todo tipo avaliável, nenhum código/preço, e as seções de
   * madeira IGUAIS às do madeira_quiosque.json (lista abaixo).
   * ===================================================================== */
  /* seções reais (b × h, cm) e espécie das peças da estrutura de madeira da
     obra-piloto da RA — o madeira_quiosque.json da pasta de madeira da obra
     (secao_cm, especie, massa_especifica), lidas em 08/10/2026. O nome da obra
     não entra aqui: este arquivo vai para todos os clientes (test-cliente-nao-vaza) */
  var TATAJUBA = { Especie: "Tatajuba (Bagassa guianensis)", Massa_especifica: 1000 };
  var PINUS = { Especie: "Pinus elliottii tratado em autoclave (CCA)", Massa_especifica: 600 };
  function tipoMadeira(id, b, h, esp) {
    var v = { Base: b / 100, Altura: h / 100 }; Object.keys(esp).forEach(function (k) { v[k] = esp[k]; });
    return { id: id, nome: String(b).replace(".", ",") + " × " + String(h).replace(".", ",") + " cm (" + (esp === PINUS ? "Pinus CCA" : "Tatajuba") + ")", valores: v };
  }
  var PARAM_MADEIRA = [
    { nome: "Base", tipoDado: "comprimento", escopo: "tipo", valor: 0.07, grupo: "Seção", descricao: "Largura b da seção" },
    { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 0.20, grupo: "Seção", descricao: "Altura h da seção (a peça trabalha em pé)" },
    { nome: "Especie", tipoDado: "texto", escopo: "tipo", valor: TATAJUBA.Especie, grupo: "Material" },
    { nome: "Massa_especifica", tipoDado: "numero", escopo: "tipo", valor: 1000, grupo: "Material",
      descricao: "kg/m³ — NBR 6120:2019 Tab. 1: tatajuba 10 kN/m³; Pinus como coníferas C30, 6 kN/m³ (o Pinus não é listado: maior da classe)" },
    { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Madeira", grupo: "Material" },
    { nome: "Cota_base", tipoDado: "comprimento", escopo: "instancia", valor: 0, grupo: "Restrições", descricao: "Cota da face de baixo em relação ao nível" }
  ];
  function paramMadeira(extra) { return JSON.parse(JSON.stringify(PARAM_MADEIRA)).concat(extra); }

  LISTA.push(
    {
      id: "ra-madeira-viga", previa: "modelador", nome: "Peça serrada horizontal (madeira)", categoria: "viga", hospedagem: "livre",
      descricao: "Viga, barrote ou caibro de madeira serrada, ao longo de X a partir do ponto de inserção. Os tipos são seções reais de uma estrutura de madeira executada pela RA (Tatajuba e Pinus CCA). Peso = volume × massa específica.",
      parametros: paramMadeira([
        { nome: "Comprimento", tipoDado: "comprimento", escopo: "instancia", valor: 3.00, grupo: "Dimensões" },
        { nome: "Volume", tipoDado: "volume", escopo: "instancia", formula: "Base * Altura * Comprimento", grupo: "Quantidades" },
        { nome: "Peso_kg", tipoDado: "numero", escopo: "instancia", formula: "Volume * Massa_especifica", grupo: "Quantidades" }
      ]),
      tipos: [
        tipoMadeira("t5x10", 5, 10, PINUS), tipoMadeira("t5x15", 5, 15, PINUS),
        tipoMadeira("t5x16", 5, 16, TATAJUBA), tipoMadeira("t5x20", 5, 20, TATAJUBA), tipoMadeira("t7x20", 7, 20, TATAJUBA),
        tipoMadeira("t8x16", 8, 16, TATAJUBA), tipoMadeira("t10x12", 10, 12, TATAJUBA), tipoMadeira("t10x16", 10, 16, TATAJUBA),
        tipoMadeira("t12x16", 12, 16, TATAJUBA), tipoMadeira("t12x30", 12, 30, TATAJUBA), tipoMadeira("t15x16", 15, 16, TATAJUBA),
        tipoMadeira("t15x30", 15, 30, TATAJUBA), tipoMadeira("t16x16", 16, 16, TATAJUBA), tipoMadeira("t21x21", 21, 21, TATAJUBA)
      ],
      solidos: [{ id: "c", nome: "Peça", forma: "caixa", x: "Comprimento/2", y: "Cota_base", z: "0", dx: "Comprimento", dy: "Altura", dz: "Base", material: "Material" }],
      quantitativo: { unidade: "m3", quantidade: "Volume", codigo: "", fonte: "", descricao: "Peça de madeira serrada (viga, barrote ou caibro)" }
    },
    {
      id: "ra-madeira-pilar", previa: "modelador", nome: "Pilar de madeira serrada", categoria: "pilar", hospedagem: "livre",
      descricao: "Pilar de madeira serrada, em pé a partir do ponto de inserção. Seções reais de pilares de uma estrutura de madeira executada pela RA. Peso = volume × massa específica.",
      parametros: paramMadeira([
        { nome: "Comprimento", tipoDado: "comprimento", escopo: "instancia", valor: 3.00, grupo: "Dimensões", descricao: "Altura do pilar" },
        { nome: "Volume", tipoDado: "volume", escopo: "instancia", formula: "Base * Altura * Comprimento", grupo: "Quantidades" },
        { nome: "Peso_kg", tipoDado: "numero", escopo: "instancia", formula: "Volume * Massa_especifica", grupo: "Quantidades" }
      ]),
      tipos: [tipoMadeira("p5x5", 5, 5, PINUS), tipoMadeira("p5x10", 5, 10, PINUS), tipoMadeira("p5x12", 5, 12, PINUS), tipoMadeira("p7x7", 7, 7, TATAJUBA)],
      solidos: [{ id: "c", nome: "Pilar", forma: "caixa", x: "0", y: "Cota_base", z: "0", dx: "Base", dy: "Comprimento", dz: "Altura", material: "Material" }],
      quantitativo: { unidade: "m3", quantidade: "Volume", codigo: "", fonte: "", descricao: "Pilar de madeira serrada" }
    },
    {
      /* envelope externo da fonte RA da família — bombup230.json (06/10/2026);
         tools/test-bim-b6.js compara a caixa desta família com a da fonte trazida por js/familiarevit.js (a mesma fonte) */
      id: "ra-bombup230", previa: "modelador", nome: "Estação elevatória de esgoto BombUp 230", categoria: "equipamento", hospedagem: "livre",
      descricao: "Águas Claras Engenharia, 2,0 HP trituradora, reservatório de 325 L. Envelope externo da fonte RA da família (bombup230.json, 06/10/2026): corpo Ø700, 980 mm de altura, entrada DN 100 a 816 mm, saída Ø50 a 715 mm e ventilação Ø50 a 826 mm do fundo. As peças internas (bomba, registro, retenção, boia) ficam no .rfa. Sem preço.",
      parametros: [
        { nome: "Diametro_corpo", tipoDado: "comprimento", escopo: "tipo", valor: 0.70, grupo: "Dimensões" },
        { nome: "Altura_corpo", tipoDado: "comprimento", escopo: "tipo", valor: 0.705, grupo: "Dimensões", descricao: "Até o início do ombro" },
        { nome: "Cota_gargalo", tipoDado: "comprimento", escopo: "tipo", valor: 0.885, grupo: "Dimensões" },
        { nome: "Diametro_gargalo", tipoDado: "comprimento", escopo: "tipo", valor: 0.40, grupo: "Dimensões" },
        { nome: "Altura_total", tipoDado: "comprimento", escopo: "tipo", valor: 0.98, grupo: "Dimensões", descricao: "Com as nervuras da tampa (fabricante)" },
        { nome: "Cota_entrada", tipoDado: "comprimento", escopo: "tipo", valor: 0.816, grupo: "Conexões", descricao: "Eixo da entrada DN 100 (leitura das fotos)" },
        { nome: "Cota_saida", tipoDado: "comprimento", escopo: "tipo", valor: 0.715, grupo: "Conexões", descricao: "Eixo da saída de recalque Ø50 (leitura das fotos)" },
        { nome: "Cota_ventilacao", tipoDado: "comprimento", escopo: "tipo", valor: 0.826, grupo: "Conexões" },
        { nome: "Volume_L", tipoDado: "inteiro", escopo: "tipo", valor: 325, grupo: "Dados" },
        { nome: "Peso_vazio_kg", tipoDado: "numero", escopo: "tipo", valor: 40, grupo: "Dados" },
        { nome: "Peso_operacao_kg", tipoDado: "numero", escopo: "tipo", formula: "Peso_vazio_kg + Volume_L * 1", grupo: "Dados", descricao: "Reservatório cheio: efluente a 1,0 kg/L (estimativa da fonte)" },
        { nome: "Potencia_HP", tipoDado: "numero", escopo: "tipo", valor: 2.0, grupo: "Dados" },
        { nome: "Tensao", tipoDado: "texto", escopo: "tipo", valor: "Monofásica 220 V", grupo: "Dados" },
        { nome: "Material_corpo", tipoDado: "material", escopo: "tipo", valor: "Polietileno verde", grupo: "Materiais" },
        { nome: "Material_tampa", tipoDado: "material", escopo: "tipo", valor: "Polietileno amarelo", grupo: "Materiais" },
        { nome: "Material_tubo", tipoDado: "material", escopo: "tipo", valor: "PVC esgoto", grupo: "Materiais" }
      ],
      tipos: [
        { id: "mono220", nome: "2,0 HP - Monofásica 220 V", valores: { Tensao: "Monofásica 220 V" } },
        { id: "tri220", nome: "2,0 HP - Trifásica 220 V", valores: { Tensao: "Trifásica 220 V" } },
        { id: "tri380", nome: "2,0 HP - Trifásica 380 V", valores: { Tensao: "Trifásica 380 V" } }
      ],
      solidos: [
        { id: "corpo", nome: "Reservatório", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "0", raio: "Diametro_corpo/2", altura: "Altura_corpo", material: "Material_corpo" },
        { id: "ombro", nome: "Ombro (aproximado)", forma: "cilindro", eixo: "y", x: "0", y: "Altura_corpo", z: "0", raio: "(Diametro_corpo + Diametro_gargalo)/4", altura: "Cota_gargalo - Altura_corpo", material: "Material_corpo" },
        { id: "gargalo", nome: "Gargalo", forma: "cilindro", eixo: "y", x: "0", y: "Cota_gargalo", z: "0", raio: "Diametro_gargalo/2", altura: "0.02", material: "Material_corpo" },
        { id: "tampa", nome: "Tampa", forma: "cilindro", eixo: "y", x: "0", y: "Cota_gargalo + 0.005", z: "0", raio: "Diametro_gargalo/2 + 0.005", altura: "Altura_total - Cota_gargalo - 0.005", material: "Material_tampa" },
        { id: "re", nome: "Ressalto da entrada", forma: "caixa", x: "-0.279", y: "0.64", z: "0", dx: "0.158", dy: "0.253", dz: "0.2", material: "Material_corpo" },
        { id: "rs", nome: "Ressalto da saída", forma: "caixa", x: "0.279", y: "0.64", z: "0", dx: "0.158", dy: "0.253", dz: "0.2", material: "Material_corpo" },
        { id: "rn", nome: "Ressalto lateral", forma: "caixa", x: "0", y: "0.76", z: "-0.277", dx: "0.15", dy: "0.133", dz: "0.154", material: "Material_corpo" },
        { id: "rl", nome: "Ressalto lateral (ventilação)", forma: "caixa", x: "0", y: "0.76", z: "0.277", dx: "0.15", dy: "0.133", dz: "0.154", material: "Material_corpo" },
        { id: "ent", nome: "Entrada DN 100", forma: "cilindro", eixo: "x", x: "-0.472", y: "Cota_entrada", z: "0", raio: "0.0508", altura: "0.172", material: "Material_tubo" },
        { id: "sai", nome: "Saída de recalque Ø50", forma: "cilindro", eixo: "x", x: "0.366", y: "Cota_saida", z: "0", raio: "0.036", altura: "0.029", material: "Material_tubo" },
        { id: "ven", nome: "Ventilação Ø50", forma: "cilindro", eixo: "z", x: "0", y: "Cota_ventilacao", z: "0.362", raio: "0.036", altura: "0.028", material: "Material_tubo" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Estação elevatória de esgoto BombUp 230 (Águas Claras), 2,0 HP" }
    },
    {
      id: "ra-lavatorio-coluna", previa: "modelador", nome: "Lavatório com coluna", categoria: "loucas", hospedagem: "livre",
      descricao: "Louça simplificada (cuba e coluna). Medidas usuais de catálogo — conferir o modelo comprado. Encostar o fundo (Z negativo) na parede.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 0.50, grupo: "Dimensões" },
        { nome: "Profundidade", tipoDado: "comprimento", escopo: "tipo", valor: 0.40, grupo: "Dimensões" },
        { nome: "Altura_borda", tipoDado: "comprimento", escopo: "instancia", valor: 0.80, grupo: "Dimensões", descricao: "Do piso à borda da cuba" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Louça branca", grupo: "Materiais" }
      ],
      tipos: [
        { id: "l4535", nome: "Pequeno 45 × 35", valores: { Largura: 0.45, Profundidade: 0.35 } },
        { id: "l5040", nome: "Médio 50 × 40", valores: { Largura: 0.50, Profundidade: 0.40 } },
        { id: "l6048", nome: "Grande 60 × 48", valores: { Largura: 0.60, Profundidade: 0.48 } }
      ],
      solidos: [
        { id: "cu", nome: "Cuba", forma: "caixa", x: "0", y: "Altura_borda - 0.18", z: "0", dx: "Largura", dy: "0.18", dz: "Profundidade", material: "Material" },
        { id: "co", nome: "Coluna", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "-Profundidade*0.15", raio: "0.09", altura: "Altura_borda - 0.18", material: "Material" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Lavatório de louça com coluna" }
    },
    {
      id: "ra-tanque", previa: "modelador", nome: "Tanque de lavar com coluna", categoria: "loucas", hospedagem: "livre",
      descricao: "Tanque simplificado (cuba e coluna). Medidas usuais de catálogo — conferir o modelo comprado. Encostar o fundo (Z negativo) na parede.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 0.60, grupo: "Dimensões" },
        { nome: "Profundidade", tipoDado: "comprimento", escopo: "tipo", valor: 0.52, grupo: "Dimensões" },
        { nome: "Altura_borda", tipoDado: "comprimento", escopo: "instancia", valor: 0.85, grupo: "Dimensões" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Louça branca", grupo: "Materiais" }
      ],
      tipos: [{ id: "t6052", nome: "60 × 52", valores: {} }],
      solidos: [
        { id: "cu", nome: "Cuba", forma: "caixa", x: "0", y: "Altura_borda - 0.30", z: "0", dx: "Largura", dy: "0.30", dz: "Profundidade", material: "Material" },
        { id: "co", nome: "Coluna", forma: "caixa", x: "0", y: "0", z: "-Profundidade*0.1", dx: "0.30", dy: "Altura_borda - 0.30", dz: "0.30", material: "Material" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Tanque de louça com coluna" }
    },
    {
      id: "ra-porta-correr", previa: "modelador", nome: "Porta de correr 2 folhas", categoria: "porta", hospedagem: "parede",
      descricao: "Porta de correr de duas folhas com marco. Abre o vão na parede.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 1.60, grupo: "Dimensões", descricao: "Largura do vão" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 2.10, grupo: "Dimensões" },
        { nome: "Marco", tipoDado: "comprimento", escopo: "tipo", valor: 0.05, grupo: "Dimensões" },
        { nome: "Espessura_folha", tipoDado: "comprimento", escopo: "tipo", valor: 0.035, grupo: "Dimensões" },
        { nome: "Espessura_parede", tipoDado: "comprimento", escopo: "instancia", valor: 0.15, grupo: "Hospedeiro" },
        { nome: "Material_marco", tipoDado: "material", escopo: "tipo", valor: "Alumínio", grupo: "Materiais" },
        { nome: "Material_folha", tipoDado: "material", escopo: "tipo", valor: "Vidro", grupo: "Materiais" }
      ],
      tipos: [
        { id: "c160", nome: "1,60 × 2,10", valores: { Largura: 1.60 } },
        { id: "c200", nome: "2,00 × 2,10", valores: { Largura: 2.00 } },
        { id: "c240", nome: "2,40 × 2,10", valores: { Largura: 2.40 } }
      ],
      abertura: { largura: "Largura", altura: "Altura", peitoril: "0" },
      solidos: [
        { id: "me", nome: "Marco esquerdo", forma: "caixa", x: "-(Largura - Marco)/2", y: "0", z: "0", dx: "Marco", dy: "Altura", dz: "Espessura_parede", material: "Material_marco" },
        { id: "md", nome: "Marco direito", forma: "caixa", x: "(Largura - Marco)/2", y: "0", z: "0", dx: "Marco", dy: "Altura", dz: "Espessura_parede", material: "Material_marco" },
        { id: "ms", nome: "Marco superior", forma: "caixa", x: "0", y: "Altura - Marco", z: "0", dx: "Largura - 2*Marco", dy: "Marco", dz: "Espessura_parede", material: "Material_marco" },
        { id: "f1", nome: "Folha 1", forma: "caixa", x: "-(Largura - 2*Marco)/4", y: "0.01", z: "-Espessura_folha", dx: "(Largura - 2*Marco)/2 + 0.04", dy: "Altura - Marco - 0.02", dz: "Espessura_folha", material: "Material_folha" },
        { id: "f2", nome: "Folha 2", forma: "caixa", x: "(Largura - 2*Marco)/4", y: "0.01", z: "Espessura_folha", dx: "(Largura - 2*Marco)/2 + 0.04", dy: "Altura - Marco - 0.02", dz: "Espessura_folha", material: "Material_folha" }
      ],
      quantitativo: { unidade: "m2", quantidade: "Largura * Altura", codigo: "", fonte: "", descricao: "Porta de correr de duas folhas" }
    },
    {
      id: "ra-porta-giro-2f", previa: "modelador", nome: "Porta de giro 2 folhas", categoria: "porta", hospedagem: "parede",
      descricao: "Porta de duas folhas de giro, com batente. Abre o vão na parede.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 1.40, grupo: "Dimensões", descricao: "Largura livre das duas folhas" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 2.10, grupo: "Dimensões" },
        { nome: "Espessura_folha", tipoDado: "comprimento", escopo: "tipo", valor: 0.035, grupo: "Dimensões" },
        { nome: "Batente", tipoDado: "comprimento", escopo: "tipo", valor: 0.05, grupo: "Dimensões" },
        { nome: "Espessura_parede", tipoDado: "comprimento", escopo: "instancia", valor: 0.15, grupo: "Hospedeiro" },
        { nome: "Material_folha", tipoDado: "material", escopo: "tipo", valor: "Madeira", grupo: "Materiais" },
        { nome: "Material_batente", tipoDado: "material", escopo: "tipo", valor: "Madeira", grupo: "Materiais" }
      ],
      tipos: [
        { id: "d120", nome: "1,20 × 2,10", valores: { Largura: 1.20 } },
        { id: "d140", nome: "1,40 × 2,10", valores: { Largura: 1.40 } },
        { id: "d160", nome: "1,60 × 2,10", valores: { Largura: 1.60 } }
      ],
      abertura: { largura: "Largura + 2*Batente", altura: "Altura + Batente", peitoril: "0" },
      solidos: [
        { id: "be", nome: "Batente esquerdo", forma: "caixa", x: "-(Largura + Batente)/2", y: "0", z: "0", dx: "Batente", dy: "Altura + Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "bd", nome: "Batente direito", forma: "caixa", x: "(Largura + Batente)/2", y: "0", z: "0", dx: "Batente", dy: "Altura + Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "bs", nome: "Batente superior", forma: "caixa", x: "0", y: "Altura", z: "0", dx: "Largura", dy: "Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "fe", nome: "Folha esquerda", forma: "caixa", x: "-Largura/4", y: "0.008", z: "0", dx: "Largura/2 - 0.006", dy: "Altura - 0.012", dz: "Espessura_folha", material: "Material_folha" },
        { id: "fd", nome: "Folha direita", forma: "caixa", x: "Largura/4", y: "0.008", z: "0", dx: "Largura/2 - 0.006", dy: "Altura - 0.012", dz: "Espessura_folha", material: "Material_folha" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Porta de madeira de giro, duas folhas" }
    },
    {
      id: "ra-janela-basculante", previa: "modelador", nome: "Janela basculante", categoria: "janela", hospedagem: "parede",
      descricao: "Basculante com marco e duas bandeiras de vidro (banheiro, área de serviço). Abre o vão na parede.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 0.60, grupo: "Dimensões" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 0.60, grupo: "Dimensões" },
        { nome: "Peitoril", tipoDado: "comprimento", escopo: "instancia", valor: 1.50, grupo: "Dimensões", descricao: "Altura do piso até a base do vão" },
        { nome: "Marco", tipoDado: "comprimento", escopo: "tipo", valor: 0.04, grupo: "Dimensões" },
        { nome: "Espessura_parede", tipoDado: "comprimento", escopo: "instancia", valor: 0.15, grupo: "Hospedeiro" },
        { nome: "Material_marco", tipoDado: "material", escopo: "tipo", valor: "Alumínio", grupo: "Materiais" },
        { nome: "Material_vidro", tipoDado: "material", escopo: "tipo", valor: "Vidro", grupo: "Materiais" }
      ],
      tipos: [
        { id: "b6060", nome: "0,60 × 0,60", valores: { Largura: 0.60, Altura: 0.60 } },
        { id: "b8060", nome: "0,80 × 0,60", valores: { Largura: 0.80, Altura: 0.60 } },
        { id: "b10060", nome: "1,00 × 0,60", valores: { Largura: 1.00, Altura: 0.60 } }
      ],
      abertura: { largura: "Largura", altura: "Altura", peitoril: "Peitoril" },
      solidos: [
        { id: "mi", nome: "Marco inferior", forma: "caixa", x: "0", y: "Peitoril", z: "0", dx: "Largura", dy: "Marco", dz: "0.06", material: "Material_marco" },
        { id: "ms", nome: "Marco superior", forma: "caixa", x: "0", y: "Peitoril + Altura - Marco", z: "0", dx: "Largura", dy: "Marco", dz: "0.06", material: "Material_marco" },
        { id: "me", nome: "Marco esquerdo", forma: "caixa", x: "-(Largura - Marco)/2", y: "Peitoril", z: "0", dx: "Marco", dy: "Altura", dz: "0.06", material: "Material_marco" },
        { id: "md", nome: "Marco direito", forma: "caixa", x: "(Largura - Marco)/2", y: "Peitoril", z: "0", dx: "Marco", dy: "Altura", dz: "0.06", material: "Material_marco" },
        { id: "v1", nome: "Báscula inferior", forma: "caixa", x: "0", y: "Peitoril + Marco", z: "0", dx: "Largura - 2*Marco", dy: "(Altura - 2*Marco)/2 - 0.005", dz: "0.006", material: "Material_vidro" },
        { id: "v2", nome: "Báscula superior", forma: "caixa", x: "0", y: "Peitoril + Altura/2 + 0.005", z: "0", dx: "Largura - 2*Marco", dy: "(Altura - 2*Marco)/2 - 0.005", dz: "0.006", material: "Material_vidro" }
      ],
      quantitativo: { unidade: "m2", quantidade: "Largura * Altura", codigo: "", fonte: "", descricao: "Janela basculante em alumínio com vidro" }
    }
  );

  /* =====================================================================
   * P12 — FAMÍLIAS MEP (09/10/2026, plano do BIM, §4 P12)
   * Acessórios de tubo (registros e válvula de retenção) e dispositivos
   * elétricos (tomada, interruptor, luminária, quadro), com CONECTOR — o
   * ponto de ligação, como a bacia da B5. Só com a prévia do modelador.
   *
   * ACESSÓRIO DE TUBO: origem no EIXO do tubo, X ao longo do tubo; os dois
   * conectores nas faces (±Comprimento/2). A tela mede o face a face nos
   * conectores avaliados e manda na op `acessorio` (js/biminst.js), que
   * divide o trecho. O DN é de instância (vem do tubo). Comprimento =
   * ENVELOPE de modelagem (medida usual de catálogo, 25 mm + 1,4 × DN —
   * 60 mm no DN 25) — conferir o modelo comprado.
   * DISPOSITIVO: origem no PISO (convenção da biblioteca), X ao longo da
   * parede, Z para fora; o conector é o ponto em que o ELETRODUTO chega.
   * `mep.peca` diz ao js/biminst.js como tirar o item SINAPI dos parâmetros
   * (Corrente_A, Modulos, Placa, Altura_montagem, Tipo_interruptor, Modelo,
   * Instalacao, Potencia_W, Material_quadro, Disjuntores, Corrente). Os
   * valores dos tipos são os da tabela SINAPI 06/2026 (descrições oficiais).
   * Código de orçamento em BRANCO, pela regra de cima: o código vem do MAPA.
   * ===================================================================== */
  function acessorioTubo(id, nome, peca, descricao, tipos, corpo) {
    return {
      id: id, previa: "modelador", nome: nome, categoria: "acessorio_tubo", hospedagem: "livre", mep: { peca: peca },
      descricao: descricao + " Origem no eixo do tubo, X ao longo dele; colocado num tubo, DIVIDE o trecho. Envelope de modelagem (25 mm + 1,4 × DN: 60 mm no DN 25) — medida usual de catálogo, conferir o modelo comprado.",
      parametros: [
        { nome: "DN", tipoDado: "numero", escopo: "instancia", valor: 25, grupo: "Conexões", descricao: "DN do tubo em mm (vem do tubo em que ele entra)" },
        { nome: "Comprimento", tipoDado: "comprimento", escopo: "tipo", formula: "0.025 + DN * 0.0014", grupo: "Dimensões", descricao: "Face a face (envelope)" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Metal", grupo: "Materiais" }
      ],
      tipos: tipos,
      solidos: [
        { id: "corpo", nome: "Corpo", forma: "cilindro", eixo: "x", x: "-Comprimento/2", y: "0", z: "0", raio: "DN/1000*0.85", altura: "Comprimento", material: "Material" }
      ].concat(corpo || []),
      conectores: [
        { id: "e", nome: "Face 1", sistema: "agua_fria", dn: "DN", x: "-Comprimento/2", y: "0", z: "0" },
        { id: "s", nome: "Face 2", sistema: "agua_fria", dn: "DN", x: "Comprimento/2", y: "0", z: "0" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: nome }
    };
  }
  var HASTE = [
    { id: "castelo", nome: "Castelo", forma: "cilindro", eixo: "y", x: "0", y: "DN/1000*0.6", z: "0", raio: "DN/1000*0.4", altura: "DN/1000*1.4", material: "Material" },
    { id: "volante", nome: "Volante", forma: "cilindro", eixo: "y", x: "0", y: "DN/1000*2", z: "0", raio: "DN/1000*1.1", altura: "0.012", material: "Material" }
  ];
  LISTA.push(
    acessorioTubo("ra-registro-gaveta", "Registro de gaveta", "registro_gaveta", "Registro de gaveta de latão, roscável (SINAPI: bruto ou com acabamento e canopla cromados).",
      [{ id: "bruto", nome: "Bruto", valores: {} }, { id: "acabamento", nome: "Com acabamento e canopla cromados", valores: {} }], HASTE),
    acessorioTubo("ra-registro-esfera", "Registro de esfera", "registro_esfera", "Registro de esfera de PVC (SINAPI: soldável com volante; roscável com volante ou borboleta).",
      [{ id: "soldavel", nome: "PVC soldável, com volante", valores: {} }, { id: "roscavel", nome: "PVC roscável, com volante", valores: {} }, { id: "borboleta", nome: "PVC roscável, com borboleta", valores: {} }],
      [{ id: "alavanca", nome: "Volante", forma: "caixa", x: "0", y: "DN/1000*0.8", z: "0", dx: "DN/1000*2.4", dy: "0.012", dz: "DN/1000*0.5", material: "Material" }]),
    acessorioTubo("ra-registro-pressao", "Registro de pressão", "registro_pressao", "Registro de pressão (chuveiro, ducha). SINAPI: PVC soldável ou roscável, volante simples; latão bruto ou com acabamento.",
      [{ id: "soldavel", nome: "PVC soldável, volante simples", valores: {} }, { id: "roscavel", nome: "PVC roscável, volante simples", valores: {} }, { id: "bruto", nome: "Latão bruto", valores: {} }, { id: "acabamento", nome: "Latão com acabamento e canopla", valores: {} }], HASTE),
    acessorioTubo("ra-valvula-retencao", "Válvula de retenção", "valvula_retencao", "Válvula de retenção de bronze, roscável (SINAPI: horizontal ou vertical — sai pela direção do tubo — e de pé com crivo).",
      [{ id: "bronze", nome: "Bronze (horizontal ou vertical)", valores: {} }, { id: "pe_crivo", nome: "De pé com crivo", valores: {} }],
      [{ id: "tampa", nome: "Tampa", forma: "cilindro", eixo: "y", x: "0", y: "DN/1000*0.6", z: "0", raio: "DN/1000*0.55", altura: "DN/1000*0.5", material: "Material" }]),
    {
      id: "ra-tomada", previa: "modelador", nome: "Tomada 2P+T", categoria: "dispositivo_eletrico", hospedagem: "livre", mep: { peca: "tomada" },
      descricao: "Tomada de embutir 2P+T (NBR 14136) com suporte e placa 4×2. A SINAPI separa baixa (0,30 m), média (1,30 m) e alta (2,00 m): vale a mais próxima da Altura de montagem. O eletroduto chega no ponto atrás da caixa.",
      parametros: [
        { nome: "Corrente_A", tipoDado: "inteiro", escopo: "tipo", valor: 10, grupo: "Elétrica", descricao: "10 ou 20 A" },
        { nome: "Modulos", tipoDado: "inteiro", escopo: "tipo", valor: 1, grupo: "Elétrica" },
        { nome: "Placa", tipoDado: "simnao", escopo: "tipo", valor: true, grupo: "Elétrica", descricao: "Incluindo suporte e placa" },
        { nome: "Altura_montagem", tipoDado: "comprimento", escopo: "instancia", valor: 0.30, grupo: "Restrições", descricao: "Do piso ao centro da caixa" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Plástico branco", grupo: "Materiais" }
      ],
      tipos: [
        { id: "t10", nome: "2P+T 10 A, 1 módulo", valores: {} },
        { id: "t20", nome: "2P+T 20 A, 1 módulo", valores: { Corrente_A: 20 } },
        { id: "t10x2", nome: "2P+T 10 A, 2 módulos", valores: { Modulos: 2 } }
      ],
      solidos: [{ id: "placa", nome: "Placa 4×2", forma: "caixa", x: "0", y: "Altura_montagem - 0.06", z: "0", dx: "0.075", dy: "0.12", dz: "0.01", material: "Material" }],
      conectores: [{ id: "el", nome: "Eletroduto", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem", z: "-0.03" }],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Tomada 2P+T de embutir" }
    },
    {
      id: "ra-interruptor", previa: "modelador", nome: "Interruptor", categoria: "dispositivo_eletrico", hospedagem: "livre", mep: { peca: "interruptor" },
      descricao: "Interruptor de embutir 10 A / 250 V com suporte e placa 4×2 (simples, paralelo, intermediário ou bipolar; 1 a 3 módulos). O eletroduto chega no ponto atrás da caixa.",
      parametros: [
        { nome: "Tipo_interruptor", tipoDado: "texto", escopo: "tipo", valor: "simples", grupo: "Elétrica", descricao: "simples, paralelo, intermediario ou bipolar" },
        { nome: "Modulos", tipoDado: "inteiro", escopo: "tipo", valor: 1, grupo: "Elétrica" },
        { nome: "Placa", tipoDado: "simnao", escopo: "tipo", valor: true, grupo: "Elétrica", descricao: "Incluindo suporte e placa" },
        { nome: "Altura_montagem", tipoDado: "comprimento", escopo: "instancia", valor: 1.30, grupo: "Restrições", descricao: "Do piso ao centro da caixa" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Plástico branco", grupo: "Materiais" }
      ],
      tipos: [
        { id: "s1", nome: "Simples, 1 módulo", valores: {} },
        { id: "s2", nome: "Simples, 2 módulos", valores: { Modulos: 2 } },
        { id: "p1", nome: "Paralelo (three-way), 1 módulo", valores: { Tipo_interruptor: "paralelo" } },
        { id: "i1", nome: "Intermediário (four-way), 1 módulo", valores: { Tipo_interruptor: "intermediario" } },
        { id: "b1", nome: "Bipolar, 1 módulo", valores: { Tipo_interruptor: "bipolar" } }
      ],
      solidos: [{ id: "placa", nome: "Placa 4×2", forma: "caixa", x: "0", y: "Altura_montagem - 0.06", z: "0", dx: "0.075", dy: "0.12", dz: "0.01", material: "Material" }],
      conectores: [{ id: "el", nome: "Eletroduto", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem", z: "-0.03" }],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Interruptor de embutir" }
    },
    {
      id: "ra-luminaria", previa: "modelador", nome: "Luminária de teto", categoria: "luminaria", hospedagem: "livre", mep: { peca: "luminaria" },
      descricao: "Luminária de teto (plafon LED, spot PAR20 ou painel 60×60) nos tipos que a SINAPI 06/2026 orça. A face de baixo fica na Altura de montagem (o forro ou a laje); o eletroduto chega por cima.",
      parametros: [
        { nome: "Modelo", tipoDado: "texto", escopo: "tipo", valor: "plafon_quadrada", grupo: "Elétrica", descricao: "plafon_quadrada, plafon_circular, spot_par20 ou painel_60x60" },
        { nome: "Instalacao", tipoDado: "texto", escopo: "tipo", valor: "embutir", grupo: "Elétrica", descricao: "embutir ou sobrepor" },
        { nome: "Potencia_W", tipoDado: "texto", escopo: "tipo", valor: "18", grupo: "Elétrica", descricao: "12, 18, 24 (plafon quadrado); 12/13 (circular); - (spot e painel)" },
        { nome: "Lado", tipoDado: "comprimento", escopo: "tipo", valor: 0.22, grupo: "Dimensões" },
        { nome: "Altura_montagem", tipoDado: "comprimento", escopo: "instancia", valor: 2.60, grupo: "Restrições", descricao: "Do piso à face de baixo (forro ou laje)" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Plástico branco", grupo: "Materiais" },
        /* RENDER (09/10/2026, js/rendermat.js luzDaLuminaria): a luminária vira fonte de luz no render físico.
           Os padrões são da RA, a conferir na ficha do produto comprado: fluxo = potência × 80 lm/W (eficácia
           usual de luminária LED residencial); 4000 K (branco neutro) em plafon e painel, 3000 K (branco quente)
           no spot. O spot PAR20 e o painel 60 × 60 não têm potência na SINAPI: o fluxo é o usual de catálogo. */
        { nome: "Fluxo_lm", tipoDado: "numero", escopo: "tipo", valor: 1440, grupo: "Fotometria", descricao: "Fluxo luminoso em lúmens. Padrão RA = potência × 80 lm/W; a ficha do produto comprado manda." },
        { nome: "Temperatura_K", tipoDado: "numero", escopo: "tipo", valor: 4000, grupo: "Fotometria", descricao: "Temperatura de cor em kelvin: 2700–3000 branco quente, 4000 neutro, 5000–6500 frio. A ficha do produto manda." },
        { nome: "Tipo_luz", tipoDado: "texto", escopo: "tipo", valor: "painel", grupo: "Fotometria", descricao: "Como a luz sai, para o render: painel (pela face de baixo), spot (em facho) ou pendente (para todos os lados)." },
        { nome: "Angulo_facho", tipoDado: "angulo", escopo: "tipo", valor: 120, grupo: "Fotometria", descricao: "Abertura do facho em graus (spot PAR20 usual: 36°)." },
        { nome: "Circuito", tipoDado: "texto", escopo: "instancia", valor: "", grupo: "Elétrica", descricao: "Circuito ou comando: no render, as luminárias do mesmo circuito ligam e desligam juntas." }
      ],
      tipos: [
        { id: "pq18e", nome: "Plafon quadrado LED 18 W, de embutir", valores: {} },
        { id: "pq24s", nome: "Plafon quadrado LED 24 W, de sobrepor", valores: { Instalacao: "sobrepor", Potencia_W: "24", Lado: 0.30, Fluxo_lm: 1920 } },
        { id: "pc12s", nome: "Plafon circular LED 12/13 W, de sobrepor", valores: { Modelo: "plafon_circular", Instalacao: "sobrepor", Potencia_W: "12/13", Lado: 0.17, Fluxo_lm: 960 } },
        { id: "spote", nome: "Spot PAR20, de embutir", valores: { Modelo: "spot_par20", Potencia_W: "-", Lado: 0.10, Fluxo_lm: 500, Temperatura_K: 3000, Tipo_luz: "spot", Angulo_facho: 36 } },
        { id: "p60e", nome: "Painel LED 60 × 60, de embutir", valores: { Modelo: "painel_60x60", Potencia_W: "-", Lado: 0.60, Fluxo_lm: 3200 } }
      ],
      solidos: [{ id: "corpo", nome: "Corpo", forma: "caixa", x: "0", y: "Altura_montagem", z: "0", dx: "Lado", dy: "0.03", dz: "Lado", material: "Material" }],
      conectores: [{ id: "el", nome: "Eletroduto", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem + 0.03", z: "0" }],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Luminária de teto" }
    },
    {
      id: "ra-quadro-distribuicao", previa: "modelador", nome: "Quadro de distribuição", categoria: "equipamento_eletrico", hospedagem: "livre", mep: { peca: "quadro" },
      descricao: "Quadro de distribuição (QDL/QDC) nos tipos que a SINAPI 06/2026 orça: PVC de embutir sem barramento, QDL de PVC, chapa de aço com barramento trifásico. Medidas de caixa usuais de catálogo — conferir o modelo comprado. O eletroduto chega por cima.",
      parametros: [
        { nome: "Material_quadro", tipoDado: "texto", escopo: "tipo", valor: "pvc", grupo: "Elétrica", descricao: "pvc (de embutir, sem barramento), pvc_qdl ou aco" },
        { nome: "Instalacao", tipoDado: "texto", escopo: "tipo", valor: "embutir", grupo: "Elétrica", descricao: "embutir, sobrepor ou qdl" },
        { nome: "Disjuntores", tipoDado: "inteiro", escopo: "tipo", valor: 6, grupo: "Elétrica" },
        { nome: "Corrente", tipoDado: "texto", escopo: "tipo", valor: "", grupo: "Elétrica", descricao: "Barramento (aço): 100A, 150A, 225A" },
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 0.20, grupo: "Dimensões" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 0.25, grupo: "Dimensões" },
        { nome: "Profundidade", tipoDado: "comprimento", escopo: "tipo", valor: 0.09, grupo: "Dimensões" },
        { nome: "Altura_montagem", tipoDado: "comprimento", escopo: "instancia", valor: 1.50, grupo: "Restrições", descricao: "Do piso ao centro do quadro" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Plástico branco", grupo: "Materiais" }
      ],
      tipos: [
        { id: "pvc6", nome: "PVC de embutir, 6 disjuntores", valores: {} },
        { id: "qdl12", nome: "QDL de PVC, 12 disjuntores", valores: { Material_quadro: "pvc_qdl", Instalacao: "qdl", Disjuntores: 12, Largura: 0.32, Altura: 0.30 } },
        { id: "aco24e", nome: "Aço galvanizado de embutir, 24 disjuntores, 100 A", valores: { Material_quadro: "aco", Disjuntores: 24, Corrente: "100A", Largura: 0.40, Altura: 0.50, Profundidade: 0.12, Material: "Aço galvanizado" } }
      ],
      solidos: [{ id: "caixa", nome: "Caixa", forma: "caixa", x: "0", y: "Altura_montagem - Altura/2", z: "Profundidade/2", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }],
      conectores: [{ id: "el", nome: "Eletroduto (entrada)", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem + Altura/2", z: "Profundidade/2" }],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Quadro de distribuição" }
    }
  );

  var FamiliasRA = {
    lista: function (todas) { return JSON.parse(JSON.stringify(LISTA.filter(function (f) { return visivel(f, todas); }))); },
    obter: function (id, todas) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id && visivel(LISTA[i], todas)) return JSON.parse(JSON.stringify(LISTA[i])); return null; }
  };
  global.FamiliasRA = FamiliasRA;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasRA;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
