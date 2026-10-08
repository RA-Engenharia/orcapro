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
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Caixa d'água de polietileno" }
    }
  ];

  var FamiliasRA = {
    lista: function () { return JSON.parse(JSON.stringify(LISTA)); },
    obter: function (id) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id) return JSON.parse(JSON.stringify(LISTA[i])); return null; }
  };
  global.FamiliasRA = FamiliasRA;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasRA;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
