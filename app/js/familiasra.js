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
        { nome: "Mao_direita", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Construção", descricao: "Mão: ligado = dobradiça (ou o lado em que a folha corre) à direita. Espelha a folha, a maçaneta, o arco da planta e o giro." }, { nome: "Sinal_mao", tipoDado: "numero", escopo: "instancia", formula: "se(Mao_direita; -1; 1)", grupo: "Construção" },
        { nome: "Area_vao", tipoDado: "area", escopo: "tipo", formula: "(Largura + 2*Batente) * (Altura + Batente)", grupo: "Quantidades" }
      ],
      tipos: [
        { id: "p70", nome: "0,70 × 2,10", valores: { Largura: 0.70 } },
        { id: "p80", nome: "0,80 × 2,10", valores: { Largura: 0.80 } },
        { id: "p90", nome: "0,90 × 2,10", valores: { Largura: 0.90 } },
        { id: "p60", nome: "0,60 × 2,10", valores: { Largura: 0.60 } }   /* lavabo, despensa (esquadrias automáticas, 20/10/2026) — no FIM: a ordem dos tipos antigos não muda */
      ],
      abertura: { largura: "Largura + 2*Batente", altura: "Altura + Batente", peitoril: "0" },
      solidos: [
        { id: "be", nome: "Batente esquerdo", forma: "caixa", x: "-(Largura + Batente)/2", y: "0", z: "0", dx: "Batente", dy: "Altura + Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "bd", nome: "Batente direito", forma: "caixa", x: "(Largura + Batente)/2", y: "0", z: "0", dx: "Batente", dy: "Altura + Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "bs", nome: "Batente superior", forma: "caixa", x: "0", y: "Altura", z: "0", dx: "Largura", dy: "Batente", dz: "Espessura_parede", material: "Material_batente" },
        { id: "fo", nome: "Folha", forma: "caixa", x: "0", y: "0.008", z: "Lado_folha*(Espessura_parede - Espessura_folha)/2", dx: "Largura - 0.006", dy: "Altura - 0.012", dz: "Espessura_folha", material: "Material_folha" },
        { id: "ma", nome: "Maçaneta", forma: "cilindro", eixo: "z", x: "Sinal_mao*(Largura/2 - 0.07)", y: "1.05", z: "Lado_folha*(Espessura_parede/2 + 0.002)", raio: "0.012", altura: "0.06", material: "Metal" }
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
        { nome: "Area_vao", tipoDado: "area", escopo: "tipo", formula: "Largura * Altura", grupo: "Quantidades" },
        { nome: "Abre_para_fora", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Construção", descricao: "Lado: ligado = folha/abertura para fora; desligado = para dentro" }, { nome: "Lado_folha", tipoDado: "numero", escopo: "instancia", formula: "se(Abre_para_fora; 1; -1)", grupo: "Construção" },
        { nome: "Mao_direita", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Construção", descricao: "Mão: ligado = dobradiça (ou o lado em que a folha corre) à direita. Espelha a folha, a maçaneta, o arco da planta e o giro." }, { nome: "Sinal_mao", tipoDado: "numero", escopo: "instancia", formula: "se(Mao_direita; -1; 1)", grupo: "Construção" }
      ],
      tipos: [
        { id: "j1010", nome: "1,00 × 1,00", valores: { Largura: 1.00, Altura: 1.00 } },
        { id: "j1210", nome: "1,20 × 1,00", valores: { Largura: 1.20, Altura: 1.00 } },
        { id: "j1512", nome: "1,50 × 1,20", valores: { Largura: 1.50, Altura: 1.20 } },
        { id: "j6060", nome: "0,60 × 0,60 (banheiro)", valores: { Largura: 0.60, Altura: 0.60 } },
        /* j1510, j1212, j2012: grade comercial da pesquisa de esquadrias (docs/arquitetura/esquadrias, 20/10/2026) — no FIM: a ordem dos tipos antigos não muda */
        { id: "j1510", nome: "1,50 × 1,00", valores: { Largura: 1.50, Altura: 1.00 } },
        { id: "j1212", nome: "1,20 × 1,20", valores: { Largura: 1.20, Altura: 1.20 } },
        { id: "j2012", nome: "2,00 × 1,20", valores: { Largura: 2.00, Altura: 1.20 } }
      ],
      abertura: { largura: "Largura", altura: "Altura", peitoril: "Peitoril" },
      solidos: [
        { id: "mi", nome: "Marco inferior", forma: "caixa", x: "0", y: "Peitoril", z: "0", dx: "Largura", dy: "Marco", dz: "0.08", material: "Material_marco" },
        { id: "ms", nome: "Marco superior", forma: "caixa", x: "0", y: "Peitoril + Altura - Marco", z: "0", dx: "Largura", dy: "Marco", dz: "0.08", material: "Material_marco" },
        { id: "me", nome: "Marco esquerdo", forma: "caixa", x: "-(Largura - Marco)/2", y: "Peitoril", z: "0", dx: "Marco", dy: "Altura", dz: "0.08", material: "Material_marco" },
        { id: "md", nome: "Marco direito", forma: "caixa", x: "(Largura - Marco)/2", y: "Peitoril", z: "0", dx: "Marco", dy: "Altura", dz: "0.08", material: "Material_marco" },
        { id: "v1", nome: "Folha 1 (vidro)", forma: "caixa", x: "-Sinal_mao*(Largura - 2*Marco)/4", y: "Peitoril + Marco", z: "Lado_folha*0.015", dx: "(Largura - 2*Marco)/2 + 0.02", dy: "Altura - 2*Marco", dz: "0.008", material: "Material_vidro" },
        { id: "v2", nome: "Folha 2 (vidro)", forma: "caixa", x: "Sinal_mao*(Largura - 2*Marco)/4", y: "Peitoril + Marco", z: "-Lado_folha*0.015", dx: "(Largura - 2*Marco)/2 + 0.02", dy: "Altura - 2*Marco", dz: "0.008", material: "Material_vidro" },
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
      id: "ra-bacia", oculta: true, substituidaPor: "hid-bacia-caixa-acoplada", nome: "Bacia sanitária com caixa acoplada", categoria: "loucas", hospedagem: "livre",
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
        { id: "esgoto", nome: "Saída de esgoto", sistema: "esgoto", dn: 100, x: "0", y: "0", z: "0", papel: "saida", dir: { x: 0, y: -1, z: 0 }, origemPos: "catalogo", aConferir: "saída pelo piso (família sem opção de saída pela parede)" },
        { id: "af", nome: "Água fria (caixa acoplada)", sistema: "agua_fria", dn: 20, x: "-0.15", y: "0.20", z: "-Comprimento*0.32 - 0.09", papel: "entrada", dir: { x: 0, y: 0, z: -1 }, origemPos: "catalogo", aConferir: "posição típica de catálogo; ajustar na família se a louça for outra" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Bacia sanitária com caixa acoplada" }
    },
    {
      id: "ra-caixa-dagua", oculta: true, substituidaPor: "hid-caixa-dagua", nome: "Caixa d'água cilíndrica", categoria: "equipamento", hospedagem: "livre",
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
        /* AS CINCO TUBULAÇÕES (27/10/2026): alimentação, distribuição, extravasor, limpeza e ventilação (opcional). Os ids antigos (entrada/saida)
           ficam; `porta` é o nome padrão. DN do extravasor/limpeza/ventilação = 0: o dimensionamento define (sem cota de catálogo, a conferir). */
        { id: "saida", nome: "Saída (consumo)", sistema: "agua_fria", dn: 25, x: "Diametro/2", y: "0.08", z: "0", porta: "distribuicao", papel: "saida", dir: { x: 1, y: 0, z: 0 }, origemPos: "catalogo", aConferir: "furo de 8 cm acima do fundo (não puxa sedimento): posição típica, conferir no modelo" },
        { id: "entrada", nome: "Entrada (alimentação)", sistema: "agua_fria", dn: 20, x: "-Diametro/2", y: "Altura - 0.10", z: "0", porta: "alimentacao", papel: "entrada", dir: { x: -1, y: 0, z: 0 }, origemPos: "catalogo", aConferir: "perto do topo, com a boia: posição típica" },
        { id: "extravasor", nome: "Extravasor (acima do nível máximo)", sistema: "agua_fria", dn: 0, x: "0", y: "Altura - 0.05", z: "Diametro/2", porta: "extravasor", papel: "saida", dir: { x: 0, y: 0, z: 1 }, origemPos: "desenho", aConferir: "5 cm abaixo da tampa, acima da alimentação; posição e DN sem cota de catálogo" },
        { id: "limpeza", nome: "Limpeza (no fundo)", sistema: "agua_fria", dn: 0, x: "0", y: "0", z: "-Diametro/2", porta: "limpeza", papel: "saida", dir: { x: 0, y: 0, z: -1 }, origemPos: "desenho", aConferir: "rente ao fundo; posição e DN sem cota de catálogo" },
        { id: "ventilacao", nome: "Ventilação (no topo, opcional)", sistema: "ventilacao", dn: 0, x: "0", y: "Altura", z: "0", porta: "ventilacao", papel: "respiro", dir: { x: 0, y: 1, z: 0 }, opcional: true, origemPos: "desenho", aConferir: "opcional: a tampa da caixa de polietileno já tem respiro" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Caixa d'água de polietileno" }
    },
    /* B5 (08/10/2026): louças com ponto de ligação, para o tubo "chegar" no aparelho */
    {
      id: "ra-lavatorio", oculta: true, substituidaPor: "hid-lavatorio-suspenso", nome: "Lavatório suspenso", categoria: "loucas", hospedagem: "livre", previa: "modelador",
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
        { id: "esgoto", nome: "Esgoto (sifão)", sistema: "esgoto", dn: 40, x: "0", y: "0.50", z: "-Profundidade/2", papel: "saida", dir: { x: 0, y: 0, z: -1 }, origemPos: "catalogo", foraDoCorpo: "o ponto é a saída do SIFÃO, abaixo da cuba (14 cm com a cuba padrão): fica fora da caixa do corpo de propósito", aConferir: "posição típica de catálogo" },
        { id: "af", nome: "Água fria", sistema: "agua_fria", dn: 20, x: "0.10", y: "0.60", z: "-Profundidade/2", papel: "entrada", dir: { x: 0, y: 0, z: -1 }, origemPos: "catalogo", aConferir: "posição típica de catálogo" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Lavatório de louça suspenso" }
    },
    {
      id: "ra-chuveiro", oculta: true, substituidaPor: "hid-chuveiro", nome: "Chuveiro", categoria: "loucas", hospedagem: "livre", previa: "modelador",
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
        { id: "af", nome: "Água (chuveiro)", sistema: "agua_fria", dn: 20, x: "0", y: "Altura_ponto", z: "-0.30", papel: "entrada", dir: { x: 0, y: 0, z: -1 }, origemPos: "catalogo", aConferir: "posição típica de catálogo; só água fria (sem ponto de água quente nesta família)" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Chuveiro" }
    }
  ];

  /* LIBERADO (27/10/2026, OK do Rogério): as famílias com `previa: "modelador"` (143 de 155) aparecem para TODOS os clientes,
     sem ligar a prévia. O campo `previa` continua nas famílias como marca de origem; o que ainda for prévia de verdade
     (outro valor que não "modelador") segue pedindo BimPrevia[previa]() ligada. `todas: true` lista tudo (testes). */
  function visivel(f, todas) {
    if (!f.previa || todas || f.previa === "modelador") return true;
    var BP = global.BimPrevia;
    return !!(BP && typeof BP[f.previa] === "function" && BP[f.previa]());
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
        tipoMadeira("t15x30", 15, 30, TATAJUBA), tipoMadeira("t16x16", 16, 16, TATAJUBA), tipoMadeira("t21x21", 21, 21, TATAJUBA),
        /* seções do madeira_quiosque.json (revisão de 12/10/2026) que o catálogo não tinha: o catálogo CONTÉM as do
           Quiosque (e pode ter mais: t10x12). test-bim-b6 [6] confere que toda seção do Quiosque existe aqui. */
        tipoMadeira("t10x15", 10, 15, TATAJUBA), tipoMadeira("t10x20", 10, 20, TATAJUBA), tipoMadeira("t10x8", 10, 8, TATAJUBA),
        tipoMadeira("t16x20", 16, 20, TATAJUBA), tipoMadeira("t20x16", 20, 16, TATAJUBA),
        tipoMadeira("t10x15p", 10, 15, PINUS), tipoMadeira("t10x5p", 10, 5, PINUS), tipoMadeira("t5x9p", 5, 9, PINUS),
        tipoMadeira("t5x11p", 5, 11, PINUS), tipoMadeira("t5x12p", 5, 12, PINUS)
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
      id: "ra-lavatorio-coluna", oculta: true, substituidaPor: "hid-lavatorio-coluna", previa: "modelador", nome: "Lavatório com coluna", categoria: "loucas", hospedagem: "livre",
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
      id: "ra-tanque", oculta: true, substituidaPor: "hid-tanque-lavar", previa: "modelador", nome: "Tanque de lavar com coluna", categoria: "loucas", hospedagem: "livre",
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
        { nome: "Material_folha", tipoDado: "material", escopo: "tipo", valor: "Vidro", grupo: "Materiais" },
        { nome: "Abre_para_fora", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Construção", descricao: "Lado: ligado = folha/abertura para fora; desligado = para dentro" }, { nome: "Lado_folha", tipoDado: "numero", escopo: "instancia", formula: "se(Abre_para_fora; 1; -1)", grupo: "Construção" },
        { nome: "Mao_direita", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Construção", descricao: "Mão: ligado = dobradiça (ou o lado em que a folha corre) à direita. Espelha a folha, a maçaneta, o arco da planta e o giro." }, { nome: "Sinal_mao", tipoDado: "numero", escopo: "instancia", formula: "se(Mao_direita; -1; 1)", grupo: "Construção" }
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
        { id: "f1", nome: "Folha 1", forma: "caixa", x: "-Sinal_mao*(Largura - 2*Marco)/4", y: "0.01", z: "Lado_folha*Espessura_folha", dx: "(Largura - 2*Marco)/2 + 0.04", dy: "Altura - Marco - 0.02", dz: "Espessura_folha", material: "Material_folha" },
        { id: "f2", nome: "Folha 2", forma: "caixa", x: "Sinal_mao*(Largura - 2*Marco)/4", y: "0.01", z: "-Lado_folha*Espessura_folha", dx: "(Largura - 2*Marco)/2 + 0.04", dy: "Altura - Marco - 0.02", dz: "Espessura_folha", material: "Material_folha" }
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
        { id: "b10060", nome: "1,00 × 0,60", valores: { Largura: 1.00, Altura: 0.60 } },
        /* MAXIM-AR (21/10/2026, esquadrias × Código de Obras): duas folhas, cada uma gira pela borda de CIMA e projeta para fora (Maxim_ar ligado).
           1,00 × 1,00 é medida de catálogo (Esquadrivax e Atlântica, docs/arquitetura/esquadrias); 1,20 e 1,50 de largura seguem a grade da janela de correr
           (alumínio sob medida). Servem à ventilação: a área que abre sai da geometria (js/esqabertura.js), ≈ 55 % do vão contra ≈ 40 % da de correr. No FIM. */
        { id: "m1010", nome: "Maxim-ar 1,00 × 1,00", valores: { Largura: 1.00, Altura: 1.00, Maxim_ar: true } },
        { id: "m1210", nome: "Maxim-ar 1,20 × 1,00", valores: { Largura: 1.20, Altura: 1.00, Maxim_ar: true } },
        { id: "m1510", nome: "Maxim-ar 1,50 × 1,00", valores: { Largura: 1.50, Altura: 1.00, Maxim_ar: true } }
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
        /* registro de gaveta, esfera e pressão: o fluxo passa nos dois sentidos (bidirecional); válvula de retenção e de pé com crivo: SÓ de e → s
           (bidirecional: false). Frente 2, 27/10/2026 — o motor ainda não lê estes campos (frente 1b). */
        { id: "e", nome: "Face 1 (entrada)", sistema: "agua_fria", dn: "DN", x: "-Comprimento/2", y: "0", z: "0", papel: "entrada", dir: { x: -1, y: 0, z: 0 }, bidirecional: !/retencao/.test(id), origemPos: "catalogo", aConferir: /retencao/.test(id) ? "sentido do fluxo: só passa da entrada para a saída; na de pé com crivo a entrada é a ponta do crivo" : "" },
        { id: "s", nome: "Face 2 (saída)", sistema: "agua_fria", dn: "DN", x: "Comprimento/2", y: "0", z: "0", papel: "saida", dir: { x: 1, y: 0, z: 0 }, bidirecional: !/retencao/.test(id), origemPos: "catalogo", aConferir: /retencao/.test(id) ? "sentido do fluxo: só passa da entrada para a saída" : "" }
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
      [{ id: "bronze", nome: "Bronze (horizontal ou vertical)", valores: {} }, { id: "pe_crivo", nome: "De pé com crivo", valores: {} },
       { id: "pvc", nome: "PVC soldável (Amanco Wavin FTC000021: DN25 e DN32)", valores: { Retencao_ficha: 1 } }],
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
      conectores: [{ id: "el", nome: "Eletroduto", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem", z: "-0.03", papel: "entrada", dir: { x: 0, y: 0, z: -1 }, origemPos: "catalogo", aConferir: "eletroduto (fora do escopo hidrossanitário): o tubo chega por dentro da parede" }],
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
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Plástico branco", grupo: "Materiais" },
        /* LIGAÇÃO ELÉTRICA (21/10/2026, contrato docs/eletrica/CONTRATO-ILUMINACAO.md): o que cada MÓDULO comanda e o esquema dele */
        { nome: "Comandos", tipoDado: "texto", escopo: "instancia", valor: "", grupo: "Elétrica", descricao: "Comando de cada módulo, na ordem dos módulos (separados por vírgula). As luminárias com o mesmo Comando acendem juntas." },
        { nome: "Esquemas", tipoDado: "texto", escopo: "instancia", valor: "", grupo: "Elétrica", descricao: "Esquema de cada módulo neste ponto: simples, paralelo (three-way) ou intermediario (four-way)." }
      ],
      tipos: [
        { id: "s1", nome: "Simples, 1 módulo", valores: {} },
        { id: "s2", nome: "Simples, 2 módulos", valores: { Modulos: 2 } },
        { id: "s3", nome: "Simples, 3 módulos", valores: { Modulos: 3 } },
        { id: "p1", nome: "Paralelo (three-way), 1 módulo", valores: { Tipo_interruptor: "paralelo" } },
        { id: "p2", nome: "Paralelo (three-way), 2 módulos", valores: { Tipo_interruptor: "paralelo", Modulos: 2 } },
        { id: "p3", nome: "Paralelo (three-way), 3 módulos", valores: { Tipo_interruptor: "paralelo", Modulos: 3 } },
        { id: "i1", nome: "Intermediário (four-way), 1 módulo", valores: { Tipo_interruptor: "intermediario" } },
        { id: "i2", nome: "Intermediário (four-way), 2 módulos", valores: { Tipo_interruptor: "intermediario", Modulos: 2 } },
        { id: "i3", nome: "Intermediário (four-way), 3 módulos", valores: { Tipo_interruptor: "intermediario", Modulos: 3 } },
        /* módulos de esquemas diferentes na mesma placa (ex.: o geral em paralelo e os spots simples): a SINAPI 06/2026 não tem
           composição única — o quantitativo fica pendente com o motivo */
        { id: "m2", nome: "Misto, 2 módulos", valores: { Tipo_interruptor: "misto", Modulos: 2 } },
        { id: "m3", nome: "Misto, 3 módulos", valores: { Tipo_interruptor: "misto", Modulos: 3 } },
        { id: "b1", nome: "Bipolar, 1 módulo", valores: { Tipo_interruptor: "bipolar" } }
      ],
      solidos: [{ id: "placa", nome: "Placa 4×2", forma: "caixa", x: "0", y: "Altura_montagem - 0.06", z: "0", dx: "0.075", dy: "0.12", dz: "0.01", material: "Material" }],
      conectores: [{ id: "el", nome: "Eletroduto", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem", z: "-0.03", papel: "entrada", dir: { x: 0, y: 0, z: -1 }, origemPos: "catalogo", aConferir: "eletroduto (fora do escopo hidrossanitário): o tubo chega por dentro da parede" }],
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
        { nome: "Circuito", tipoDado: "texto", escopo: "instancia", valor: "", grupo: "Elétrica", descricao: "Circuito ou comando: no render, as luminárias do mesmo circuito ligam e desligam juntas." },
        /* LIGAÇÃO ELÉTRICA (21/10/2026, contrato docs/eletrica/CONTRATO-ILUMINACAO.md) */
        { nome: "Comando", tipoDado: "texto", escopo: "instancia", valor: "", grupo: "Elétrica", descricao: "O comando (grupo de acendimento) desta luminária: as do mesmo Comando acendem juntas no interruptor." },
        { nome: "Circuito_quadro", tipoDado: "texto", escopo: "instancia", valor: "", grupo: "Elétrica", descricao: "O circuito de proteção no quadro (C1, C2…)." }
      ],
      tipos: [
        { id: "pq18e", nome: "Plafon quadrado LED 18 W, de embutir", valores: {} },
        { id: "pq24s", nome: "Plafon quadrado LED 24 W, de sobrepor", valores: { Instalacao: "sobrepor", Potencia_W: "24", Lado: 0.30, Fluxo_lm: 1920 } },
        { id: "pc12s", nome: "Plafon circular LED 12/13 W, de sobrepor", valores: { Modelo: "plafon_circular", Instalacao: "sobrepor", Potencia_W: "12/13", Lado: 0.17, Fluxo_lm: 960 } },
        /* COBERTURA COMPLETA (forro de drywall): o plafon circular de EMBUTIR — a SINAPI 06/2026 só orça o de sobrepor (103782): este tipo sai "orçar à parte" */
        { id: "pc12e", nome: "Plafon circular LED 12/13 W, de embutir", valores: { Modelo: "plafon_circular", Instalacao: "embutir", Potencia_W: "12/13", Lado: 0.17, Fluxo_lm: 960 } },
        { id: "spote", nome: "Spot PAR20, de embutir", valores: { Modelo: "spot_par20", Potencia_W: "-", Lado: 0.10, Fluxo_lm: 500, Temperatura_K: 3000, Tipo_luz: "spot", Angulo_facho: 36 } },
        { id: "p60e", nome: "Painel LED 60 × 60, de embutir", valores: { Modelo: "painel_60x60", Potencia_W: "-", Lado: 0.60, Fluxo_lm: 3200 } }
      ],
      solidos: [{ id: "corpo", nome: "Corpo", forma: "caixa", x: "0", y: "Altura_montagem", z: "0", dx: "Lado", dy: "0.03", dz: "Lado", material: "Material" }],
      conectores: [{ id: "el", nome: "Eletroduto", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem + 0.03", z: "0", papel: "entrada", dir: { x: 0, y: 1, z: 0 }, origemPos: "catalogo", aConferir: "eletroduto (fora do escopo hidrossanitário): o tubo chega por cima" }],
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
      conectores: [{ id: "el", nome: "Eletroduto (entrada)", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem + Altura/2", z: "Profundidade/2", papel: "entrada", dir: { x: 0, y: 1, z: 0 }, origemPos: "catalogo", aConferir: "eletroduto (fora do escopo hidrossanitário): o tubo chega por cima" }],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Quadro de distribuição" }
    }
  );

  /* RETENÇÃO PVC (Lote 1b): o face a face do tipo "pvc" é o A da ficha Amanco Wavin FTC000021 (pág. 4: DN25 = 86,5 mm, DN32 = 96 mm); os outros tipos seguem a fórmula de envelope. */
  LISTA.forEach(function (f) {
    if (f.id !== "ra-valvula-retencao") return;
    f.parametros.push({ nome: "Retencao_ficha", tipoDado: "inteiro", escopo: "tipo", valor: 0, grupo: "Dimensões", descricao: "1 = face a face da ficha Amanco Wavin FTC000021 (DN25 e DN32)" });
    f.parametros.forEach(function (p) { if (p.nome === "Comprimento") p.formula = "se(Retencao_ficha; se(DN > 25; 0.096; 0.0865); 0.025 + DN * 0.0014)"; });
  });
  /* REGISTROS (27/10/2026): `ra-registro-gaveta/esfera/pressao` SAEM DO MENU (fica a hid-registro-* com os tipos do catálogo); o id continua o do motor
     (js/biminst.js ACESSORIOS: o traçado insere sozinho) e o desenho no tubo é o HidGeo.registro. Os sólidos de bloco ficam AQUI de propósito: a exportação
     para o formato de família externo (js/familiarevit.js, tools/test-bim-b6.js) só entende caixa e cilindro — o gerador "registro_tubo" (js/hidlouca.js, ponte para o HidGeo)
     existe e está testado, mas ligá-lo a esta família quebra esse contrato (decisão pendente: ensinar o exportador a levar a malha). */
  (function () {
    LISTA.forEach(function (f) { if (/^ra-registro-(gaveta|esfera|pressao)$/.test(f.id)) f.oculta = true; });
  })();

  /* ARQUITETURA DE PISCINA E PELE DE VIDRO (19/10/2026, js/familiaspiscina.js): piscina de fibra de mercado, casa de máquinas e
     pele de vidro recolhível — o gerador devolve as famílias já no formato (previa "modelador", como as demais desta lista) */
  (function () {
    var FP = global.FamiliasPiscina || null;
    if (!FP && typeof require === "function") { try { FP = require("./familiaspiscina.js"); } catch (eFP) { FP = null; } }
    if (FP && FP.lista) FP.lista().forEach(function (f) { LISTA.push(f); });
  })();


  /* =====================================================================
   * PARTES MÓVEIS (20/10/2026, js/partesmoveis.js) — porta, folha e janela que ABREM no clique do 3D.
   * Cada parte é um conjunto de sólidos com UM movimento, em fórmula (sistema local da família). A geometria
   * não muda com o estado: quantitativo e orçamento são os mesmos aberta ou fechada. O estado (Aberto / Abertura)
   * é de INSTÂNCIA, o mesmo par de parâmetros da pele de vidro retrátil.
   *   GIRO: eixo vertical na borda da folha (a dobradiça), regra da mão direita: em torno de +Y, a folha que parte do
   *   eixo para +X vai para −Z com ângulo positivo. Por isso o sentido é o oposto do lado em que a folha encosta.
   * ===================================================================== */
  (function () {
    var EST = [
      { nome: "Aberto", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Abertura", descricao: "Posição para o 3D: aberto. Não muda o quantitativo." },
      { nome: "Abertura", tipoDado: "numero", escopo: "instancia", valor: 0, grupo: "Abertura", descricao: "Fração aberta de 0 (fechado) a 1 (aberto), quando 'Aberto' está desligado" }
    ];
    var V = function (x, y, z) { return { x: x, y: y, z: z }; };
    var D = {
      "ra-porta-giro": {
        partes: [{ id: "folha", nome: "Folha da porta", tipo: "giro", solidos: ["fo", "ma"], eixo: V("Sinal_mao*(-Largura/2 + 0.003)", "0.008", "Lado_folha*(Espessura_parede - Espessura_folha)/2"), angulo: "90", sentido: "-Lado_folha*Sinal_mao" }]
      },
      "ra-porta-giro-2f": {
        extra: [{ nome: "Abre_para_fora", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Construção" }],
        partes: [
          { id: "folha_e", nome: "Folha esquerda", tipo: "giro", solidos: ["fe"], eixo: V("-Largura/2 + 0.003", "0.008", "0"), angulo: "90", sentido: "se(Abre_para_fora; -1; 1)" },
          { id: "folha_d", nome: "Folha direita", tipo: "giro", solidos: ["fd"], eixo: V("Largura/2 - 0.003", "0.008", "0"), angulo: "90", sentido: "se(Abre_para_fora; 1; -1)" }
        ]
      },
      "ra-porta-correr": {
        partes: [{ id: "folha1", nome: "Folha 1 (corre sobre a folha 2)", tipo: "correr", solidos: ["f1"], vetor: V("Sinal_mao", "0", "0"), curso: "(Largura - 2*Marco)/2 - 0.02" }]
      },
      "ra-janela-correr": {
        partes: [{ id: "folha1", nome: "Folha 1 (corre sobre a folha 2)", tipo: "correr", solidos: ["v1"], vetor: V("Sinal_mao", "0", "0"), curso: "(Largura - 2*Marco)/2 - 0.02" }]
      },
      "ra-janela-basculante": {
        extra: [{ nome: "Abre_para_fora", tipoDado: "simnao", escopo: "instancia", valor: false, grupo: "Construção", descricao: "Lado: ligado = a folha projeta para fora; desligado = para dentro" }, { nome: "Maxim_ar", tipoDado: "simnao", escopo: "tipo", valor: false, grupo: "Construção", descricao: "Ligado: maxim-ar (cada folha gira pela borda de CIMA e projeta para fora); desligado: basculante (gira pelo meio)" }],
        partes: [
          { id: "folha_inf", nome: "Báscula inferior", tipo: "basculante", solidos: ["v1"], eixo: V("0", "Peitoril + Marco + se(Maxim_ar; (Altura - 2*Marco)/2 - 0.005; ((Altura - 2*Marco)/2 - 0.005)/2)", "0"), angulo: "70", sentido: "se(Abre_para_fora; 1; -1)" },
          { id: "folha_sup", nome: "Báscula superior", tipo: "basculante", solidos: ["v2"], eixo: V("0", "Peitoril + Altura/2 + 0.005 + se(Maxim_ar; (Altura - 2*Marco)/2 - 0.005; ((Altura - 2*Marco)/2 - 0.005)/2)", "0"), angulo: "70", sentido: "se(Abre_para_fora; 1; -1)" }
        ]
      }
    };
    LISTA.forEach(function (f) {
      var d = D[f.id]; if (!d) return;
      f.partesMoveis = JSON.parse(JSON.stringify(d.partes));
      f.parametros = f.parametros.concat(JSON.parse(JSON.stringify(d.extra || [])), JSON.parse(JSON.stringify(EST)));
    });
  })();

  /* =====================================================================
   * LOTE 2 — ELÉTRICA E ARQUITETURA IGUAIS AO CATÁLOGO (28/10/2026)
   *
   * Tomada, interruptor, luminária de teto, quadro de distribuição, portas e janelas `ra-*`, pilar e viga deixam de ser caixa:
   * ganham as peças do produto (caixa de embutir, suporte, placa, módulo/tecla, furos; moldura, difusor, driver; porta do quadro,
   * trilho DIN e disjuntores; batente, guarnição, dobradiça, roseta e alavanca; marco, folhas com perfil, trilho e fecho).
   *
   * O QUE NÃO MUDA (projeto de cliente abre igual): id da família, id e valores dos tipos antigos, parâmetros (nome, escopo, padrão),
   * conectores elétricos (x, y, z, DN), abertura/peitoril do vão, quantitativo, ids dos sólidos que as partes móveis e o símbolo da
   * planta leem (fo, ma, fe, fd, f1, f2, v1, v2, mi, ms, me, md, pi, be, bd, bs, caixa) e as dimensões dos vidros (a área que abre).
   * Só ACRESCENTA: parâmetros de tipo (códigos numéricos de modelo, Fonte_cota) e tipos novos. Os sólidos de bloco originais que
   * estão escritos acima ficam SUBSTITUÍDOS por esta lista (a definição final é a daqui).
   *
   * FONTES (a cota que a ficha traz está em `Fonte_cota`, tipo a tipo; o que é prática de modelagem está dito assim):
   *  · caixa de embutir 4″×2″ e 4″×4″: medida nominal em polegadas (101,6 × 50,8 mm; 101,6 × 101,6 mm);
   *  · placa 4×2 = 115 × 73 mm (medida informada pelo Rogério em 28/10/2026 para Tramontina Liz e Pial Plus — o varejo publica 120 × 83;
   *    conferir na ficha do modelo comprado); placa 4×4 = 124 × 118 mm (Pial Plus, placa cega 4×4 branca, Telhanorte 632392);
   *  · quadro de embutir: Schneider Easy9 8 módulos = 208 × 208 × 90 mm e 16 módulos = 335 × 335 × 90 mm (Telhanorte 1456040/1456075);
   *  · luminária de teto: Taschibra Lux (data/iluminacao-catalogo.json, js/familiasluz.js): redondo embutir Ø 220 / 15 mm, redondo sobrepor
   *    Ø 210 / 26 mm, quadrado sobrepor 210 / 25 mm;
   *  · portas e janelas: grade comercial de docs/arquitetura/esquadrias (Sasazaki Alumifort 120×100, 150×100, 150×120; Atlântica Fortiline
   *    100×100; kits de porta 210 × 60–90). Espessura de perfil, de folha e de batente: prática (C), sem ficha — dito em Fonte_cota;
   *  · pilar e viga de concreto e peça serrada de madeira: PRISMA (seção retangular constante) — é a forma real do elemento moldado
   *    em fôrma/serrado; não há "forma de catálogo" a imitar (justificativaForma).
   * ===================================================================== */
  (function () {
    function S(v) { return String(v); }
    function cx(id, nome, x, y, z, dx, dy, dz, mat, vis) { var o = { id: id, nome: nome, forma: "caixa", x: S(x), y: S(y), z: S(z), dx: S(dx), dy: S(dy), dz: S(dz), material: mat }; if (vis) o.visivel = vis; return o; }
    function cl(id, nome, eixo, x, y, z, raio, alt, mat, vis) { var o = { id: id, nome: nome, forma: "cilindro", eixo: eixo, x: S(x), y: S(y), z: S(z), raio: S(raio), altura: S(alt), material: mat }; if (vis) o.visivel = vis; return o; }
    function rv(id, nome, eixo, x, y, z, perfil, mat, seg, fechar, vis) {
      var o = { id: id, nome: nome, forma: "revolucao", eixo: eixo, x: S(x), y: S(y), z: S(z), perfil: perfil.map(function (q) { return [S(q[0]), S(q[1])]; }), segmentos: seg || 20, material: mat };
      if (fechar) o.fechar = "perfil"; if (vis) o.visivel = vis; return o;
    }
    function ex(id, nome, plano, x, y, z, alt, cont, mat, vis, rot) { var o = { id: id, nome: nome, forma: "extrusao", plano: plano, x: S(x), y: S(y), z: S(z), altura: S(alt), contorno: cont.map(function (q) { return [S(q[0]), S(q[1])]; }), material: mat }; if (vis) o.visivel = vis; if (rot) o.rot = S(rot); return o; }
    function P(nome, tipoDado, escopo, valor, grupo, descricao) { var o = { nome: nome, tipoDado: tipoDado, escopo: escopo, valor: valor, grupo: grupo }; if (descricao) o.descricao = descricao; return o; }
    function F(nome, tipoDado, formula, grupo, descricao) { var o = { nome: nome, tipoDado: tipoDado, escopo: "tipo", formula: formula, grupo: grupo }; if (descricao) o.descricao = descricao; return o; }
    function achar(id) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id) return LISTA[i]; return null; }
    function tipo(f, id) { for (var i = 0; i < f.tipos.length; i++) if (f.tipos[i].id === id) return f.tipos[i]; return null; }
    function somar(f, id, v) { var t = tipo(f, id); Object.keys(v).forEach(function (k) { t.valores[k] = v[k]; }); }

    /* ---------------- POSTOS DA PLACA (tomada e interruptor): 1 posto = placa 4×2 em pé; 2–3 postos = 4×2 deitada; 4–6 = 4×4 (2 linhas) ---------------- */
    var PASSO = 0.0305, RLIN = 0.0228, COLS = "piso((Modulos + 1)/2)";
    function linha(k) { return "piso(" + k + "/" + COLS + ")"; }
    function postoX(k) { return "se(Modulos <= 3; (" + k + " - (Modulos - 1)/2)*" + PASSO + "; (" + k + " - " + COLS + "*" + linha(k) + " - (min(" + COLS + "; Modulos - " + COLS + "*" + linha(k) + ") - 1)/2)*" + PASSO + ")"; }
    function postoY(k) { return "se(Modulos <= 3; 0; " + RLIN + "*(1 - 2*" + linha(k) + "))"; }
    var PLACA_PARAMS = [
      F("Placa_L", "comprimento", "se(Modulos <= 1; 0.073; se(Modulos <= 3; 0.115; 0.124))", "Dimensões", "Largura da placa: 4×2 em pé 73 mm, 4×2 deitada 115 mm, 4×4 124 mm"),
      F("Placa_A", "comprimento", "se(Modulos <= 1; 0.115; se(Modulos <= 3; 0.073; 0.118))", "Dimensões", "Altura da placa: 4×2 em pé 115 mm, deitada 73 mm, 4×4 118 mm"),
      F("Caixa_L", "comprimento", "se(Modulos <= 1; 0.0508; 0.1016)", "Dimensões", "Caixa de embutir 4″×2″ (50,8 × 101,6 mm) ou 4″×4″ (101,6 × 101,6 mm)"),
      F("Caixa_A", "comprimento", "se(Modulos <= 1; 0.1016; se(Modulos <= 3; 0.0508; 0.1016))", "Dimensões"),
      P("Fonte_cota", "texto", "tipo", "Placa 4×2 115×73 mm (medida informada pelo Rogério em 28/10/2026 para Tramontina Liz e Pial Plus; o varejo publica 120×83: conferir na ficha do modelo comprado). Caixa 4″×2″ = 101,6×50,8 mm e 4″×4″ = 101,6×101,6 mm (nominal em polegadas). Placa 4×4 124×118 mm (Pial Plus, varejo Telhanorte 632392). Módulo e tecla: prática de modelagem (C), sem ficha.", "Fonte", "De onde vem a cota deste tipo; o que é prática de modelagem está dito"),
      P("Nivel_fonte", "texto", "tipo", "B", "Fonte", "A ficha lida · B varejo/medida informada · C prática de modelagem, a conferir")
    ];
    function parafusosPlaca() {
      var out = [];
      [1, -1].forEach(function (sg, i) {
        out.push(cl("pf" + i, "Parafuso da placa " + (i + 1), "z", "se(Modulos >= 2 e Modulos <= 3; " + sg + "*(Placa_L/2 - 0.011); 0)", "Altura_montagem + se(Modulos >= 2 e Modulos <= 3; 0; " + sg + "*(Placa_A/2 - 0.011))", 0.008, 0.0035, 0.0012, "Metal cromado"));
      });
      return out;
    }
    function corpoPlaca(MAT) {
      return [
        cx("cx", "Caixa de embutir 4×2 / 4×4", 0, "Altura_montagem - Caixa_A/2", -0.0225, "Caixa_L", "Caixa_A", 0.045, "Plástico"),
        cx("sup", "Suporte (garras)", 0, "Altura_montagem - (Placa_A - 0.012)/2", -0.001, "Placa_L - 0.012", "Placa_A - 0.012", 0.002, "Metal"),
        cx("placa", "Espelho (placa)", 0, "Altura_montagem - Placa_A/2", 0.004, "Placa_L", "Placa_A", 0.008, MAT)
      ];
    }

    /* ---------------- TOMADA 2P+T ---------------- */
    (function () {
      var f = achar("ra-tomada");
      f.parametros = f.parametros.concat(PLACA_PARAMS, [P("Pino_mm", "numero", "tipo", 4.0, "Elétrica", "Diâmetro do pino do plugue: 4,0 mm (10 A) ou 4,8 mm (20 A) — NBR 14136, valor a conferir na norma (cópia sem licença)")]);
      f.tipos.push({ id: "t20x2", nome: "2P+T 20 A, 2 módulos", valores: { Corrente_A: 20, Modulos: 2 } },
        { id: "t10x3", nome: "2P+T 10 A, 3 módulos", valores: { Modulos: 3 } },
        { id: "t10x4", nome: "2P+T 10 A, 4 módulos (placa 4×4)", valores: { Modulos: 4 } },
        { id: "t20x6", nome: "2P+T 20 A, 6 módulos (placa 4×4)", valores: { Corrente_A: 20, Modulos: 6 } });
      f.tipos.forEach(function (t) { t.valores.Pino_mm = (t.valores.Corrente_A === 20) ? 4.8 : 4.0; });
      var s = corpoPlaca("Material");
      for (var k = 0; k < 6; k++) {
        var v = k === 0 ? null : "Modulos > " + k, px = postoX(k), py = "Altura_montagem + " + postoY(k);
        s.push(cx("mod" + k, "Módulo da tomada " + (k + 1), px, py + " - 0.0127", 0.0092, 0.0254, 0.0254, 0.0024, "Material", v));
        s.push(cl("aro" + k, "Aro da tomada " + (k + 1), "z", px, py, 0.0104, 0.0105, 0.0014, "Plástico branco", v));
        s.push(cx("fn" + k, "Furo fase/neutro 1 (posto " + (k + 1) + ")", px + " - 0.0095", py + " + 0.0035 - Pino_mm/2000", 0.0121, "Pino_mm/1000", "Pino_mm/1000", 0.0006, "Borracha preta", v));
        s.push(cx("fm" + k, "Furo fase/neutro 2 (posto " + (k + 1) + ")", px + " + 0.0095", py + " + 0.0035 - Pino_mm/2000", 0.0121, "Pino_mm/1000", "Pino_mm/1000", 0.0006, "Borracha preta", v));
        s.push(cx("ft" + k, "Furo terra (posto " + (k + 1) + ")", px, py + " - 0.0075 - Pino_mm/2000", 0.0121, "Pino_mm/1000", "Pino_mm/1000", 0.0006, "Borracha preta", v));
      }
      f.solidos = s.concat(parafusosPlaca());
      f.descricao += " Peças: caixa de embutir 4″×2″/4″×4″, suporte, espelho, parafusos, módulo e furos 2P+T (Ø do pino 4,0 mm a 10 A e 4,8 mm a 20 A).";
    })();

    /* ---------------- INTERRUPTOR ---------------- */
    (function () {
      var f = achar("ra-interruptor");
      f.parametros = f.parametros.concat(PLACA_PARAMS, [P("Esquema", "numero", "tipo", 1, "Elétrica", "Código do esquema para o desenho da tecla: 1 simples · 2 paralelo (1 marca) · 3 intermediário (2 marcas) · 4 misto · 5 bipolar (barra)")]);
      var cod = { simples: 1, paralelo: 2, intermediario: 3, misto: 4, bipolar: 5 };
      f.tipos.forEach(function (t) { t.valores.Esquema = cod[t.valores.Tipo_interruptor || "simples"]; });
      f.tipos.push({ id: "s4", nome: "Simples, 4 módulos (placa 4×4)", valores: { Modulos: 4, Esquema: 1 } },
        { id: "p4", nome: "Paralelo (three-way), 4 módulos (placa 4×4)", valores: { Tipo_interruptor: "paralelo", Modulos: 4, Esquema: 2 } });
      var s = corpoPlaca("Material");
      for (var k = 0; k < 6; k++) {
        var v = k === 0 ? null : "Modulos > " + k, px = postoX(k), py = "Altura_montagem + " + postoY(k);
        s.push(cx("mol" + k, "Moldura do posto " + (k + 1), px, py + " - 0.0232", 0.0088, 0.0254, 0.0465, 0.0015, "Material", v));
        s.push(cx("tec" + k, "Tecla " + (k + 1), px, py + " - 0.0207", 0.012, 0.0215, 0.0415, 0.005, "Material", v));
        s.push(cx("ra" + k, "Ranhura da tecla " + (k + 1), px, py + " - 0.0005", 0.0148, 0.0215, 0.0008, 0.0006, "Cinza escuro", v));
        s.push(cx("ia" + k, "Marca do esquema 1 (posto " + (k + 1) + ")", px, py + " + 0.0085", 0.0148, 0.004, 0.004, 0.0006, "Borracha preta", (k === 0 ? "Esquema = 2 ou Esquema = 3" : "(Esquema = 2 ou Esquema = 3) e Modulos > " + k)));
        s.push(cx("ib" + k, "Marca do esquema 2 (posto " + (k + 1) + ")", px, py + " - 0.0125", 0.0148, 0.004, 0.004, 0.0006, "Borracha preta", "Esquema = 3" + (k === 0 ? "" : " e Modulos > " + k)));
        s.push(cx("bp" + k, "Barra do bipolar (posto " + (k + 1) + ")", px, py + " - 0.0005", 0.0148, 0.0215, 0.002, 0.0006, "Borracha preta", "Esquema = 5" + (k === 0 ? "" : " e Modulos > " + k)));
      }
      f.solidos = s.concat(parafusosPlaca());
      f.descricao += " Peças: caixa de embutir, suporte, espelho, parafusos, moldura e tecla de cada posto, com a marca do esquema (paralelo 1, intermediário 2, bipolar barra).";
    })();

    /* ---------------- LUMINÁRIA DE TETO ---------------- */
    (function () {
      var f = achar("ra-luminaria");
      f.parametros = f.parametros.concat([
        P("Forma_cod", "numero", "tipo", 1, "Dimensões", "Forma: 1 quadrado/painel · 2 redondo · 3 spot PAR20"),
        P("Inst_cod", "numero", "tipo", 1, "Dimensões", "Instalação: 1 embutir · 2 sobrepor"),
        P("Altura_corpo", "comprimento", "tipo", 0.03, "Dimensões", "Espessura da luminária acima do forro: 30 mm é o envelope da família (o conector fica no topo); os tipos de catálogo trazem a altura da ficha"),
        F("Larg_moldura", "comprimento", "se(Lado > 0.4; 0.02; 0.012)", "Dimensões", "Largura da moldura do plafon/painel quadrado"),
        P("Fonte_cota", "texto", "tipo", "Medida de catálogo de uso corrente (SINAPI 06/2026 orça plafon quadrado/circular, spot PAR20 e painel 60×60); espessura de moldura e driver: prática de modelagem (C), sem ficha — conferir o modelo comprado.", "Fonte"),
        P("Nivel_fonte", "texto", "tipo", "C", "Fonte")
      ]);
      somar(f, "pq24s", { Inst_cod: 2 });
      somar(f, "pc12s", { Forma_cod: 2, Inst_cod: 2 });
      somar(f, "pc12e", { Forma_cod: 2 });
      somar(f, "spote", { Forma_cod: 3 });
      var TB = "https://www.taschibra.com.br/pt_BR/produto/teto/";
      f.tipos.push(
        { id: "lux18re", nome: "Plafon redondo LED 18 W, de embutir (Taschibra Lux Ø 220, nicho 205)", valores: { Modelo: "plafon_circular", Instalacao: "embutir", Potencia_W: "18", Lado: 0.22, Altura_corpo: 0.015, Fluxo_lm: 1260, Forma_cod: 2, Inst_cod: 1, Fonte_cota: "Taschibra painel LED 18 W Lux redondo embutir: Ø 220 mm, altura 15 mm, nicho 205 mm, 1260 lm (data/iluminacao-catalogo.json pa-tb-lux18-red-emb) " + TB + "painelplafon-embutir-led/painel-led-18w-lux-redondo-embutir-3000k/18111", Nivel_fonte: "A" } },
        { id: "lux18rs", nome: "Plafon redondo LED 18 W, de sobrepor (Taschibra Lux Ø 210)", valores: { Modelo: "plafon_circular", Instalacao: "sobrepor", Potencia_W: "18", Lado: 0.21, Altura_corpo: 0.026, Fluxo_lm: 1260, Forma_cod: 2, Inst_cod: 2, Fonte_cota: "Taschibra painel LED 18 W Lux redondo sobrepor: Ø 210 mm, altura 26 mm, 1260 lm (data/iluminacao-catalogo.json pl-tb-lux18-red-sob) " + TB + "painelplafon-sobrepor-led/painel-led-18w-lux-redondo-sobrepor-3000k/18129", Nivel_fonte: "A" } },
        { id: "lux18qs", nome: "Plafon quadrado LED 18 W, de sobrepor (Taschibra Lux 210)", valores: { Modelo: "plafon_quadrada", Instalacao: "sobrepor", Potencia_W: "18", Lado: 0.21, Altura_corpo: 0.025, Fluxo_lm: 1260, Forma_cod: 1, Inst_cod: 2, Fonte_cota: "Taschibra painel LED 18 W Lux quadrado sobrepor: 210 mm, altura 25 mm, 1260 lm (data/iluminacao-catalogo.json pl-tb-lux18-qua-sob) " + TB + "painelplafon-sobrepor-led/painel-led-18w-lux-quadrado-sobrepor-3000k/18137", Nivel_fonte: "A" } });
      var Q = "Forma_cod = 1", R = "Forma_cod = 2", SP = "Forma_cod = 3", E = "Inst_cod = 1", O = "Inst_cod = 2";
      var h = "Altura_montagem", W = "Larg_moldura", L = "Lado", U = function (d) { return "Altura_montagem + " + d; };
      f.solidos = [
        /* QUADRADO / PAINEL — EMBUTIR: moldura em aro, difusor, aro interno, caixa do driver, molas e prensa-cabo */
        cx("mo_n", "Moldura (lado -Z)", 0, h, "-(Lado - Larg_moldura)/2", L, 0.006, W, "Alumínio branco", Q + " e " + E),
        cx("mo_s", "Moldura (lado +Z)", 0, h, "(Lado - Larg_moldura)/2", L, 0.006, W, "Alumínio branco", Q + " e " + E),
        cx("mo_e", "Moldura (lado -X)", "-(Lado - Larg_moldura)/2", h, 0, W, 0.006, "Lado - 2*Larg_moldura", "Alumínio branco", Q + " e " + E),
        cx("mo_d", "Moldura (lado +X)", "(Lado - Larg_moldura)/2", h, 0, W, 0.006, "Lado - 2*Larg_moldura", "Alumínio branco", Q + " e " + E),
        cx("di_q", "Difusor", 0, U(0.001), 0, "Lado - 2*Larg_moldura", 0.003, "Lado - 2*Larg_moldura", "Acrílico", Q + " e " + E),
        cx("ai_q", "Aro interno do difusor", 0, U(0.0035), 0, "Lado - 2*Larg_moldura + 0.004", 0.002, "Lado - 2*Larg_moldura + 0.004", "Alumínio branco", Q + " e " + E),
        cx("dr_q", "Caixa do driver", 0, U(0.006), 0, "min(0.12; Lado*0.45)", "max(Altura_corpo - 0.008; 0.004)", "min(0.07; Lado*0.35)", "Metal", Q + " e " + E),
        cx("mola1", "Mola de fixação 1", "-(Lado/2 - Larg_moldura - 0.006)", U(0.006), 0, 0.004, "max(Altura_corpo - 0.016; 0.004)", 0.02, "Metal", Q + " e " + E),
        cx("mola2", "Mola de fixação 2", "(Lado/2 - Larg_moldura - 0.006)", U(0.006), 0, 0.004, "max(Altura_corpo - 0.016; 0.004)", 0.02, "Metal", Q + " e " + E),
        cl("cabo_q", "Prensa-cabo do driver", "y", 0.03, U(0.006), 0, 0.0035, "max(Altura_corpo - 0.006; 0.004)", "Borracha preta", Q + " e " + E),
        /* QUADRADO / PAINEL — SOBREPOR: aro de acabamento, difusor, paredes do corpo, fundo e parafusos */
        cx("ar_q", "Aro de acabamento", 0, h, 0, "Lado", 0.004, "Lado", "Alumínio branco", Q + " e " + O),
        cx("di_qs", "Difusor", 0, U(0.001), 0, "Lado - 0.016", 0.005, "Lado - 0.016", "Acrílico", Q + " e " + O),
        cx("pn_n", "Corpo (parede -Z)", 0, U(0.004), "-(Lado - 0.008)/2", L, "Altura_corpo - 0.004", 0.008, "Alumínio branco", Q + " e " + O),
        cx("pn_s", "Corpo (parede +Z)", 0, U(0.004), "(Lado - 0.008)/2", L, "Altura_corpo - 0.004", 0.008, "Alumínio branco", Q + " e " + O),
        cx("pn_e", "Corpo (parede -X)", "-(Lado - 0.008)/2", U(0.004), 0, 0.008, "Altura_corpo - 0.004", "Lado - 0.016", "Alumínio branco", Q + " e " + O),
        cx("pn_d", "Corpo (parede +X)", "(Lado - 0.008)/2", U(0.004), 0, 0.008, "Altura_corpo - 0.004", "Lado - 0.016", "Alumínio branco", Q + " e " + O),
        cx("fu_q", "Fundo do corpo", 0, U("Altura_corpo - 0.004"), 0, "Lado", 0.004, "Lado", "Alumínio branco", Q + " e " + O),
        cl("pf_q", "Parafuso de fixação", "y", "Lado/2 - 0.018", U("Altura_corpo - 0.004"), "Lado/2 - 0.018", 0.0025, 0.004, "Metal cromado", Q + " e " + O),
        /* REDONDO — EMBUTIR: moldura em disco, difusor, driver, molas, prensa-cabo (só caixa e cilindro: o exportador do Revit não leva revolução) */
        cl("mo_r", "Moldura redonda", "y", 0, U(0.0005), 0, "Lado/2", "max(Altura_corpo - 0.0245; 0.004)", "Alumínio branco", R + " e " + E),
        cl("di_r", "Difusor", "y", 0, h, 0, "Lado/2 - 0.011", 0.004, "Acrílico", R + " e " + E),
        cx("dr_r", "Caixa do driver", 0, U(0.006), 0, 0.07, "max(Altura_corpo - 0.008; 0.004)", 0.05, "Metal", R + " e " + E),
        cx("mola3", "Mola de fixação 1", "-(Lado/2 - 0.016)", U(0.006), 0, 0.004, "max(Altura_corpo - 0.016; 0.004)", 0.02, "Metal", R + " e " + E),
        cx("mola4", "Mola de fixação 2", "(Lado/2 - 0.016)", U(0.006), 0, 0.004, "max(Altura_corpo - 0.016; 0.004)", 0.02, "Metal", R + " e " + E),
        cl("cabo_r", "Prensa-cabo do driver", "y", 0.03, U(0.006), 0.02, 0.0035, "max(Altura_corpo - 0.006; 0.004)", "Borracha preta", R + " e " + E),
        /* REDONDO — SOBREPOR: copo, difusor em disco e parafuso */
        cl("cp_r", "Corpo (copo)", "y", 0, U(0.004), 0, "Lado/2", "Altura_corpo - 0.004", "Alumínio branco", R + " e " + O),
        cl("di_rs", "Difusor", "y", 0, h, 0, "Lado/2 - 0.004", 0.005, "Acrílico", R + " e " + O),
        cl("pf_r", "Parafuso de fixação", "y", "Lado/2 - 0.018", U("Altura_corpo - 0.004"), 0, 0.0025, 0.004, "Metal cromado", R + " e " + O),
        cl("pf_r2", "Parafuso de fixação 2", "y", "-(Lado/2 - 0.018)", U("Altura_corpo - 0.004"), 0, 0.0025, 0.004, "Metal cromado", R + " e " + O),
        cl("fu_r", "Fundo do copo", "y", 0, U("Altura_corpo - 0.004"), 0, "Lado/2", 0.004, "Alumínio branco", R + " e " + O),
        cx("bo_r", "Borne de ligação", 0, U("Altura_corpo - 0.004"), 0, 0.03, 0.004, 0.02, "Metal", R + " e " + O),
        /* SPOT PAR20 DE EMBUTIR: moldura, boca do refletor (cavidade escura), face da lâmpada, tubo do refletor, caixa de ligação */
        cl("mo_sp", "Moldura do spot", "y", 0, U(0.001), 0, "Lado/2", 0.0035, "Alumínio branco", SP),
        cl("re_sp", "Boca do refletor", "y", 0, U(0.0005), 0, "Lado/2 - 0.0165", 0.003, "Borracha preta", SP),
        cl("la_sp", "Face da lâmpada", "y", 0, h, 0, "Lado/2 - 0.0345", 0.003, "Acrílico", SP),
        cl("ref_sp", "Tubo do refletor", "y", 0, U(0.0065), 0, "Lado/2 - 0.0345", 0.0205, "Metal cromado", SP),
        cx("cl_sp", "Caixa de ligação", 0, U(0.027), 0, 0.04, 0.003, 0.03, "Metal", SP)
      ];
      f.descricao += " Peças: moldura, difusor, driver e molas (embutir); aro, corpo e fundo (sobrepor); moldura, refletor e lâmpada (spot).";
    })();

    /* ---------------- QUADRO DE DISTRIBUIÇÃO ---------------- */
    (function () {
      var f = achar("ra-quadro-distribuicao");
      f.parametros = f.parametros.concat([
        P("Embutir_cod", "numero", "tipo", 1, "Dimensões", "1 = de embutir (aba/moldura em volta) · 0 = de sobrepor/QDL"),
        P("Material_porta", "material", "tipo", "Vidro", "Materiais", "Porta transparente/fumê (linha Easy9 brasileira)"),
        F("Cap_fileira", "inteiro", "piso((Largura - 0.05)/0.018)", "Elétrica", "Disjuntores DIN por fileira (módulo de 18 mm, 25 mm de cada lado para o canal)"),
        P("Fonte_cota", "texto", "tipo", "Quadro PVC de embutir 6 disj. 200×250×90 mm: medida usual de catálogo (SINAPI 06/2026), conferir o modelo. Interior: trilho DIN 35 mm e disjuntor de 1 módulo (18 mm): prática de modelagem (C). Schneider Easy9 no varejo: 8 módulos 208×208×90 e 16 módulos 335×335×90 mm (Telhanorte 1456040/1456075).", "Fonte"),
        P("Nivel_fonte", "texto", "tipo", "B", "Fonte")
      ]);
      somar(f, "pvc6", { Embutir_cod: 1, Fonte_cota: "Quadro de PVC de embutir, 6 disjuntores, 200 × 250 × 90 mm: medida usual de catálogo (SINAPI 06/2026 orça o QD de PVC de embutir sem barramento) — conferir o modelo comprado. Trilho DIN 35 mm e disjuntor de 1 módulo (18 mm): prática de modelagem (C).", Nivel_fonte: "B" });
      somar(f, "qdl12", { Embutir_cod: 0, Fonte_cota: "QDL de PVC, 12 disjuntores, 320 × 300 × 90 mm: medida usual de catálogo (SINAPI 06/2026 orça o QDL de PVC) — conferir o modelo comprado. Trilho DIN 35 mm e disjuntor de 1 módulo (18 mm): prática de modelagem (C).", Nivel_fonte: "B" });
      somar(f, "aco24e", { Embutir_cod: 1, Fonte_cota: "Quadro de chapa de aço galvanizado de embutir com barramento, 24 disjuntores, 100 A, 400 × 500 × 120 mm: medida usual de catálogo (SINAPI 06/2026 orça o QD de chapa de aço com barramento trifásico) — conferir o modelo comprado. Trilho DIN e disjuntor de 1 módulo (18 mm): prática de modelagem (C).", Nivel_fonte: "B" });
      f.tipos.push(
        { id: "easy9-8", nome: "Schneider Easy9 de embutir, 8 módulos, porta transparente (208 × 208 × 90)", valores: { Material_quadro: "pvc", Instalacao: "embutir", Disjuntores: 8, Largura: 0.208, Altura: 0.208, Profundidade: 0.09, Embutir_cod: 1, Fonte_cota: "Schneider Easy9 1 fila 8 módulos de embutir: 208 × 208 × 90 mm (varejo Telhanorte 1456040; conferir na ficha Schneider)", Nivel_fonte: "B" } },
        { id: "easy9-16", nome: "Schneider Easy9 de embutir, 16 módulos, porta transparente (335 × 335 × 90)", valores: { Material_quadro: "pvc", Instalacao: "embutir", Disjuntores: 16, Largura: 0.335, Altura: 0.335, Profundidade: 0.09, Embutir_cod: 1, Fonte_cota: "Schneider Easy9 1 fila 16 módulos de embutir: 335 × 335 × 90 mm (varejo Telhanorte 1456075; conferir na ficha Schneider)", Nivel_fonte: "B" } });
      var s = [
        cx("caixa", "Fundo da caixa", 0, "Altura_montagem - Altura/2", 0.002, "Largura", "Altura", 0.004, "Material"),
        cx("lat_e", "Lateral esquerda", "-(Largura - 0.003)/2", "Altura_montagem - Altura/2", "Profundidade/2", 0.003, "Altura", "Profundidade", "Material"),
        cx("lat_d", "Lateral direita", "(Largura - 0.003)/2", "Altura_montagem - Altura/2", "Profundidade/2", 0.003, "Altura", "Profundidade", "Material"),
        cx("topo", "Tampo da caixa", 0, "Altura_montagem + Altura/2 - 0.003", "Profundidade/2", "Largura - 0.006", 0.003, "Profundidade", "Material"),
        cx("base", "Base da caixa", 0, "Altura_montagem - Altura/2", "Profundidade/2", "Largura - 0.006", 0.003, "Profundidade", "Material"),
        cx("ab_n", "Aba de embutir (alto)", 0, "Altura_montagem + Altura/2 - 0.004", "Profundidade - 0.002", "Largura + 0.032", 0.02, 0.004, "Material", "Embutir_cod = 1"),
        cx("ab_s", "Aba de embutir (baixo)", 0, "Altura_montagem - Altura/2 - 0.016", "Profundidade - 0.002", "Largura + 0.032", 0.02, 0.004, "Material", "Embutir_cod = 1"),
        cx("ab_e", "Aba de embutir (esquerda)", "-(Largura + 0.016)/2 - 0.0", "Altura_montagem - Altura/2 - 0.0", "Profundidade - 0.002", 0.016, "Altura", 0.004, "Material", "Embutir_cod = 1"),
        cx("ab_d", "Aba de embutir (direita)", "(Largura + 0.016)/2", "Altura_montagem - Altura/2", "Profundidade - 0.002", 0.016, "Altura", 0.004, "Material", "Embutir_cod = 1"),
        cx("porta", "Porta do quadro", 0, "Altura_montagem - Altura/2 + 0.006", "Profundidade - 0.0015", "Largura - 0.012", "Altura - 0.012", 0.003, "Material_porta"),
        cx("moldp", "Moldura da porta", 0, "Altura_montagem - Altura/2 + 0.002", "Profundidade - 0.0005", "Largura", "Altura", 0.001, "Material", "Embutir_cod = 0"),
        cl("pux", "Fecho da porta", "z", "Largura/2 - 0.02", "Altura_montagem", "Profundidade", 0.007, 0.006, "Metal cromado"),
        cx("dobr", "Dobradiça (esquerda)", "-(Largura - 0.012)/2", "Altura_montagem + Altura/2 - 0.04", "Profundidade", 0.008, 0.02, 0.003, "Metal"),
        cx("dobr2", "Dobradiça (esquerda, baixo)", "-(Largura - 0.012)/2", "Altura_montagem - Altura/2 + 0.02", "Profundidade", 0.008, 0.02, 0.003, "Metal"),
        cx("bar", "Barramento de neutro e terra", 0, "Altura_montagem - Altura/2 + 0.014", 0.017, "Largura - 0.06", 0.014, 0.02, "Aço galvanizado")
      ];
      s.push(cx("trilho0", "Trilho DIN 35 mm (fileira 1)", 0, "Altura_montagem + Altura/2 - 0.03 - 0.0825/2 - 0.0175", 0.0075, "Largura - 0.04", 0.035, 0.007, "Metal"));
      s.push(cx("trilho1", "Trilho DIN 35 mm (fileira 2)", 0, "Altura_montagem + Altura/2 - 0.03 - 0.0825/2 - 0.0175 - 0.115", 0.0075, "Largura - 0.04", 0.035, 0.007, "Metal", "Disjuntores > Cap_fileira"));
      for (var k = 0; k < 24; k++) {
        var lin = "piso(" + k + "/Cap_fileira)", vis = k === 0 ? null : "Disjuntores > " + k;
        var xk = "(" + k + " - Cap_fileira*" + lin + " - (min(Cap_fileira; Disjuntores - Cap_fileira*" + lin + ") - 1)/2)*0.018";
        var yk = "Altura_montagem + Altura/2 - 0.03 - 0.0825 - " + lin + "*0.115";
        s.push(cx("dj" + k, "Disjuntor " + (k + 1) + " (1 módulo DIN, 18 mm)", xk, yk, 0.04, 0.0176, 0.0825, 0.058, "Plástico branco", vis));
        s.push(cx("al" + k, "Alavanca do disjuntor " + (k + 1), xk, yk + " + 0.0322", 0.0715, 0.008, 0.018, 0.009, "Borracha preta", vis));
      }
      f.solidos = s;
      f.descricao += " Peças: fundo, laterais, tampo e base da caixa; aba de embutir; porta com fecho e dobradiças; trilho DIN, disjuntores de 1 módulo (um por posição) e barramento.";
    })();

    /* ---------------- PORTAS ---------------- */
    var FONTE_PORTA = "Kits de porta de madeira: folha 210 × 60/70/80/90 (Dalcomad, Moldufama, Uniportas, Conejo — docs/arquitetura/esquadrias/REGRAS-PORTAS.md, nível B). Espessura da folha (35 mm), do batente (50 mm), guarnição, dobradiça e alavanca: prática de modelagem (C): a NBR 15930 não está na biblioteca. Conferir o kit comprado.";
    var FONTE_JANELA = "Grade comercial de esquadria de alumínio: Sasazaki Alumifort correr 120×100, 150×100, 150×120; Atlântica Fortiline 100×100 (docs/arquitetura/esquadrias/REGRAS-JANELAS.md, nível B). Espessura de perfil (marco, folha, trilho): prática de modelagem (C), sem ficha de perfil — conferir a linha do fabricante.";
    function fonteParams(txt) { return [P("Fonte_cota", "texto", "tipo", txt, "Fonte", "De onde vem a cota deste tipo; o que é prática de modelagem está dito"), P("Nivel_fonte", "texto", "tipo", "B", "Fonte", "A ficha lida · B varejo/kit publicado · C prática de modelagem, a conferir")]; }
    /* guarnição (alizar) nos dois lados da parede: a borda de dentro alinha com a face interna do batente (Largura/2) e cobre o batente (mesma largura: a família cabe no vão) */
    function guarnicoes(Lh, Hh) {
      var out = [];
      [["1", 1], ["2", -1]].forEach(function (l) {
        var zc = "(Espessura_parede/2 + Guarnicao_esp/2)*" + l[1];
        out.push(cx("gi_e" + l[0], "Guarnição esquerda (lado " + l[0] + ")", "-(" + Lh + "/2 + Guarnicao_larg/2)", 0, zc, "Guarnicao_larg", Hh, "Guarnicao_esp", "Material_batente"));
        out.push(cx("gi_d" + l[0], "Guarnição direita (lado " + l[0] + ")", "(" + Lh + "/2 + Guarnicao_larg/2)", 0, zc, "Guarnicao_larg", Hh, "Guarnicao_esp", "Material_batente"));
        out.push(cx("gi_s" + l[0], "Guarnição superior (lado " + l[0] + ")", 0, Hh, zc, Lh + " + 2*Guarnicao_larg", "Guarnicao_larg", "Guarnicao_esp", "Material_batente"));
      });
      return out;
    }
    var GUARN = [F("Guarnicao_larg", "comprimento", "Batente", "Dimensões", "Largura da guarnição (alizar) = a do batente: ela cobre o batente e NÃO passa do vão (contrato de test-bim-b6: a família cabe no vão) — prática (C)"), P("Guarnicao_esp", "comprimento", "tipo", 0.012, "Dimensões", "Espessura da guarnição: 12 mm — prática (C)")];

    /* PORTA DE GIRO */
    (function () {
      var f = achar("ra-porta-giro");
      f.idsLegado = ["bd,be,bs,fo,ma"];
      f.parametros = f.parametros.concat(GUARN, fonteParams(FONTE_PORTA));
      var zf = "Lado_folha*(Espessura_parede - Espessura_folha)/2", xh = "Sinal_mao*(-Largura/2 + 0.003)";
      var s = [
        cx("be", "Batente esquerdo", "-(Largura + Batente)/2", 0, 0, "Batente", "Altura + Batente", "Espessura_parede", "Material_batente"),
        cx("bd", "Batente direito", "(Largura + Batente)/2", 0, 0, "Batente", "Altura + Batente", "Espessura_parede", "Material_batente"),
        cx("bs", "Batente superior", 0, "Altura", 0, "Largura", "Batente", "Espessura_parede", "Material_batente")
      ].concat(guarnicoes("Largura", "Altura"));
      s.push(cx("fo", "Folha", 0, 0.008, zf, "Largura - 0.006", "Altura - 0.012", "Espessura_folha", "Material_folha"));
      [0.15, 1.00, 1.85].forEach(function (yb, i) { s.push(cl("dob" + i, "Dobradiça " + (i + 1), "y", xh, yb, zf, 0.005, 0.09, "Metal cromado")); });
      s.push(cl("mr", "Roseta (fechadura)", "z", "Sinal_mao*(Largura/2 - 0.07)", 1.05, zf + " - (Espessura_folha + 0.016)/2", 0.027, "Espessura_folha + 0.016", "Metal cromado"));
      s.push(cl("ma", "Maçaneta (alavanca, lado 1)", "x", "Sinal_mao*(Largura/2 - 0.07) - 0.055*(1 + Sinal_mao)", 1.05, zf + " + Lado_folha*(Espessura_folha/2 + 0.016)", 0.008, 0.115, "Metal cromado"));
      s.push(cl("mb", "Alavanca (lado 2)", "x", "Sinal_mao*(Largura/2 - 0.07) - 0.055*(1 + Sinal_mao)", 1.05, zf + " - Lado_folha*(Espessura_folha/2 + 0.016)", 0.008, 0.115, "Metal cromado"));
      f.solidos = s;
      f.partesMoveis[0].solidos = ["fo", "ma", "mr", "mb"];
      f.descricao += " Peças: batente, guarnição dos dois lados, folha, 3 dobradiças, roseta e alavanca nas duas faces.";
    })();

    /* PORTA DE GIRO 2 FOLHAS */
    (function () {
      var f = achar("ra-porta-giro-2f");
      f.idsLegado = ["bd,be,bs,fd,fe"];
      f.parametros = f.parametros.concat(GUARN, fonteParams(FONTE_PORTA));
      var s = [
        cx("be", "Batente esquerdo", "-(Largura + Batente)/2", 0, 0, "Batente", "Altura + Batente", "Espessura_parede", "Material_batente"),
        cx("bd", "Batente direito", "(Largura + Batente)/2", 0, 0, "Batente", "Altura + Batente", "Espessura_parede", "Material_batente"),
        cx("bs", "Batente superior", 0, "Altura", 0, "Largura", "Batente", "Espessura_parede", "Material_batente")
      ].concat(guarnicoes("Largura", "Altura"));
      s.push(cx("fe", "Folha esquerda", "-Largura/4", 0.008, 0, "Largura/2 - 0.006", "Altura - 0.012", "Espessura_folha", "Material_folha"));
      s.push(cx("fd", "Folha direita", "Largura/4", 0.008, 0, "Largura/2 - 0.006", "Altura - 0.012", "Espessura_folha", "Material_folha"));
      [0.15, 1.00, 1.85].forEach(function (yb, i) {
        s.push(cl("dobe" + i, "Dobradiça esquerda " + (i + 1), "y", "-Largura/2 + 0.003", yb, 0, 0.005, 0.09, "Metal cromado"));
        s.push(cl("dobd" + i, "Dobradiça direita " + (i + 1), "y", "Largura/2 - 0.003", yb, 0, 0.005, 0.09, "Metal cromado"));
      });
      s.push(cl("mre", "Roseta (folha esquerda)", "z", -0.07, 1.05, "-(Espessura_folha + 0.016)/2", 0.027, "Espessura_folha + 0.016", "Metal cromado"));
      s.push(cl("mrd", "Roseta (folha direita)", "z", 0.07, 1.05, "-(Espessura_folha + 0.016)/2", 0.027, "Espessura_folha + 0.016", "Metal cromado"));
      s.push(cl("mae", "Alavanca (folha esquerda, lado 1)", "x", -0.125, 1.05, "Espessura_folha/2 + 0.016", 0.008, 0.115, "Metal cromado"));
      s.push(cl("mbe", "Alavanca (folha esquerda, lado 2)", "x", -0.125, 1.05, "-(Espessura_folha/2 + 0.016)", 0.008, 0.115, "Metal cromado"));
      s.push(cl("mad", "Alavanca (folha direita, lado 1)", "x", 0.01, 1.05, "Espessura_folha/2 + 0.016", 0.008, 0.115, "Metal cromado"));
      s.push(cl("mbd", "Alavanca (folha direita, lado 2)", "x", 0.01, 1.05, "-(Espessura_folha/2 + 0.016)", 0.008, 0.115, "Metal cromado"));
      f.solidos = s;
      f.partesMoveis[0].solidos = ["fe", "mre", "mae", "mbe"];
      f.partesMoveis[1].solidos = ["fd", "mrd", "mad", "mbd"];
      f.descricao += " Peças: batente, guarnição dos dois lados, duas folhas, 6 dobradiças, roseta e alavanca em cada folha.";
    })();

    /* PORTA DE CORRER 2 FOLHAS (alumínio e vidro) */
    (function () {
      var f = achar("ra-porta-correr");
      f.idsLegado = ["f1,f2,md,me,ms"];
      f.parametros = f.parametros.concat([P("Perfil_folha", "comprimento", "tipo", 0.04, "Dimensões", "Largura do perfil da folha de correr — prática (C)")], fonteParams("Porta de correr 2 folhas em alumínio e vidro: vão 1,60/2,00/2,40 × 2,10 — grade da família (dimensões de obra, sem tabela de fabricante lida). Perfil da folha (40 mm), trilho e puxador: prática de modelagem (C), sem ficha — conferir a linha do fabricante."));
      f.parametros[f.parametros.length - 1].valor = "C";
      var s = [
        cx("me", "Marco esquerdo", "-(Largura - Marco)/2", 0, 0, "Marco", "Altura", "Espessura_parede", "Material_marco"),
        cx("md", "Marco direito", "(Largura - Marco)/2", 0, 0, "Marco", "Altura", "Espessura_parede", "Material_marco"),
        cx("ms", "Marco superior", 0, "Altura - Marco", 0, "Largura - 2*Marco", "Marco", "Espessura_parede", "Material_marco"),
        cx("f1", "Folha 1", "-Sinal_mao*(Largura - 2*Marco)/4", 0.01, "Lado_folha*Espessura_folha", "(Largura - 2*Marco)/2 + 0.04", "Altura - Marco - 0.02", "Espessura_folha", "Material_folha"),
        cx("f2", "Folha 2", "Sinal_mao*(Largura - 2*Marco)/4", 0.01, "-Lado_folha*Espessura_folha", "(Largura - 2*Marco)/2 + 0.04", "Altura - Marco - 0.02", "Espessura_folha", "Material_folha")
      ];
      [["1", "-Sinal_mao*(Largura - 2*Marco)/4", "Lado_folha*Espessura_folha"], ["2", "Sinal_mao*(Largura - 2*Marco)/4", "-Lado_folha*Espessura_folha"]].forEach(function (c) {
        var wf = "(Largura - 2*Marco)/2 + 0.04", hf = "Altura - Marco - 0.02", dz = "Espessura_folha + 0.004";
        s.push(cx("pe" + c[0], "Perfil da folha " + c[0] + " (montante esquerdo)", c[1] + " - (" + wf + " - Perfil_folha)/2", 0.01, c[2], "Perfil_folha", hf, dz, "Material_marco"));
        s.push(cx("pd" + c[0], "Perfil da folha " + c[0] + " (montante direito)", c[1] + " + (" + wf + " - Perfil_folha)/2", 0.01, c[2], "Perfil_folha", hf, dz, "Material_marco"));
        s.push(cx("pi" + c[0], "Perfil da folha " + c[0] + " (travessa inferior)", c[1], 0.01, c[2], wf, "Perfil_folha", dz, "Material_marco"));
        s.push(cx("ps" + c[0], "Perfil da folha " + c[0] + " (travessa superior)", c[1], "0.01 + " + hf + " - Perfil_folha", c[2], wf, "Perfil_folha", dz, "Material_marco"));
        s.push(cx("pu" + c[0], "Concha da folha " + c[0], c[1] + " + Sinal_mao*" + (c[0] === "1" ? "1" : "-1") + "*((" + wf + ")/2 - Perfil_folha - 0.03)", 1.0, c[2] + " + Lado_folha*" + (c[0] === "1" ? "1" : "-1") + "*(Espessura_folha/2 + 0.003)", 0.03, 0.12, 0.006, "Metal cromado"));
      });
      s.push(cx("tr1", "Trilho inferior da folha 1", 0, 0, "Lado_folha*Espessura_folha", "Largura - 2*Marco", 0.012, 0.014, "Material_marco"));
      s.push(cx("tr2", "Trilho inferior da folha 2", 0, 0, "-Lado_folha*Espessura_folha", "Largura - 2*Marco", 0.012, 0.014, "Material_marco"));
      f.solidos = s;
      f.partesMoveis[0].solidos = ["f1", "pe1", "pd1", "pi1", "ps1", "pu1"];
      f.descricao += " Peças: marco, duas folhas de vidro com perfil de alumínio, trilhos inferiores e puxadores.";
    })();

    /* ---------------- JANELAS ---------------- */
    (function () {
      var f = achar("ra-janela-correr");
      f.idsLegado = ["md,me,mi,ms,pi,v1,v2"];
      f.parametros = f.parametros.concat([P("Perfil_folha", "comprimento", "tipo", 0.03, "Dimensões", "Largura do perfil da folha de correr — prática (C)")], fonteParams(FONTE_JANELA));
      var s = [
        cx("mi", "Marco inferior", 0, "Peitoril", 0, "Largura", "Marco", 0.08, "Material_marco"),
        cx("ms", "Marco superior", 0, "Peitoril + Altura - Marco", 0, "Largura", "Marco", 0.08, "Material_marco"),
        cx("me", "Marco esquerdo", "-(Largura - Marco)/2", "Peitoril", 0, "Marco", "Altura", 0.08, "Material_marco"),
        cx("md", "Marco direito", "(Largura - Marco)/2", "Peitoril", 0, "Marco", "Altura", 0.08, "Material_marco"),
        cx("v1", "Folha 1 (vidro)", "-Sinal_mao*(Largura - 2*Marco)/4", "Peitoril + Marco", "Lado_folha*0.015", "(Largura - 2*Marco)/2 + 0.02", "Altura - 2*Marco", 0.008, "Material_vidro"),
        cx("v2", "Folha 2 (vidro)", "Sinal_mao*(Largura - 2*Marco)/4", "Peitoril + Marco", "-Lado_folha*0.015", "(Largura - 2*Marco)/2 + 0.02", "Altura - 2*Marco", 0.008, "Material_vidro"),
        cx("pi", "Pingadeira", 0, "Peitoril - 0.02", "Espessura_parede/2", "Largura + 0.06", 0.02, 0.06, "Granito", "Com_pingadeira")
      ];
      [["1", "-Sinal_mao*(Largura - 2*Marco)/4", "Lado_folha*0.015"], ["2", "Sinal_mao*(Largura - 2*Marco)/4", "-Lado_folha*0.015"]].forEach(function (c) {
        var wf = "(Largura - 2*Marco)/2 + 0.02", hf = "Altura - 2*Marco";
        s.push(cx("fe" + c[0], "Perfil da folha " + c[0] + " (montante esquerdo)", c[1] + " - (" + wf + " - Perfil_folha)/2", "Peitoril + Marco", c[2], "Perfil_folha", hf, 0.02, "Material_marco"));
        s.push(cx("fd" + c[0], "Perfil da folha " + c[0] + " (montante direito)", c[1] + " + (" + wf + " - Perfil_folha)/2", "Peitoril + Marco", c[2], "Perfil_folha", hf, 0.02, "Material_marco"));
        s.push(cx("fi" + c[0], "Perfil da folha " + c[0] + " (travessa inferior)", c[1], "Peitoril + Marco", c[2], wf, "Perfil_folha", 0.02, "Material_marco"));
        s.push(cx("fs" + c[0], "Perfil da folha " + c[0] + " (travessa superior)", c[1], "Peitoril + Altura - Marco - Perfil_folha", c[2], wf, "Perfil_folha", 0.02, "Material_marco"));
      });
      s.push(cx("tr1", "Trilho da folha 1", 0, "Peitoril + Marco", "Lado_folha*0.015", "Largura - 2*Marco", 0.012, 0.01, "Material_marco"));
      s.push(cx("tr2", "Trilho da folha 2", 0, "Peitoril + Marco", "-Lado_folha*0.015", "Largura - 2*Marco", 0.012, 0.01, "Material_marco"));
      s.push(cx("fc", "Fecho concha", 0, "Peitoril + Altura/2", "Lado_folha*0.027", 0.03, 0.06, 0.008, "Metal cromado"));
      f.solidos = s;
      f.partesMoveis[0].solidos = ["v1", "fe1", "fd1", "fi1", "fs1", "fc"];
      f.descricao += " Peças: marco, duas folhas (vidro e perfil), trilhos, fecho e pingadeira.";
    })();
    (function () {
      var f = achar("ra-janela-basculante");
      f.idsLegado = ["md,me,mi,ms,v1,v2"];
      f.parametros = f.parametros.concat([P("Perfil_folha", "comprimento", "tipo", 0.025, "Dimensões", "Largura do perfil da báscula — prática (C)")], fonteParams("Janela basculante / maxim-ar: 0,60×0,60 a 1,00×0,60 (grade da família); maxim-ar 1,00×1,00 Esquadrivax e Atlântica (docs/arquitetura/esquadrias/REGRAS-JANELAS.md, nível B). Espessura de perfil da báscula e do batente: prática de modelagem (C), sem ficha — conferir a linha do fabricante."));
      var s = [
        cx("mi", "Marco inferior", 0, "Peitoril", 0, "Largura", "Marco", 0.06, "Material_marco"),
        cx("ms", "Marco superior", 0, "Peitoril + Altura - Marco", 0, "Largura", "Marco", 0.06, "Material_marco"),
        cx("me", "Marco esquerdo", "-(Largura - Marco)/2", "Peitoril", 0, "Marco", "Altura", 0.06, "Material_marco"),
        cx("md", "Marco direito", "(Largura - Marco)/2", "Peitoril", 0, "Marco", "Altura", 0.06, "Material_marco"),
        cx("v1", "Báscula inferior", 0, "Peitoril + Marco", 0, "Largura - 2*Marco", "(Altura - 2*Marco)/2 - 0.005", 0.006, "Material_vidro"),
        cx("v2", "Báscula superior", 0, "Peitoril + Altura/2 + 0.005", 0, "Largura - 2*Marco", "(Altura - 2*Marco)/2 - 0.005", 0.006, "Material_vidro")
      ];
      [["1", "Peitoril + Marco", "inferior"], ["2", "Peitoril + Altura/2 + 0.005", "superior"]].forEach(function (c) {
        var hf = "(Altura - 2*Marco)/2 - 0.005", wf = "Largura - 2*Marco", y0 = c[1];
        /* a moldura da báscula é EXTRUSÃO de contorno (não entra na conta da área que abre, que só olha as caixas da parte móvel) */
        s.push(ex("be" + c[0], "Moldura da báscula " + c[2] + " (montante esquerdo)", "frente", "-(" + wf + ")/2", y0, -0.01, 0.02, [[0, 0], ["Perfil_folha", 0], ["Perfil_folha", hf], [0, hf]], "Material_marco"));
        s.push(ex("bd" + c[0], "Moldura da báscula " + c[2] + " (montante direito)", "frente", "(" + wf + ")/2 - Perfil_folha", y0, -0.01, 0.02, [[0, 0], ["Perfil_folha", 0], ["Perfil_folha", hf], [0, hf]], "Material_marco"));
        s.push(ex("bi" + c[0], "Moldura da báscula " + c[2] + " (travessa inferior)", "frente", "-(" + wf + ")/2 + Perfil_folha", y0, -0.01, 0.02, [[0, 0], [wf + " - 2*Perfil_folha", 0], [wf + " - 2*Perfil_folha", "Perfil_folha"], [0, "Perfil_folha"]], "Material_marco"));
        s.push(ex("bs" + c[0], "Moldura da báscula " + c[2] + " (travessa superior)", "frente", "-(" + wf + ")/2 + Perfil_folha", y0 + " + " + hf + " - Perfil_folha", -0.01, 0.02, [[0, 0], [wf + " - 2*Perfil_folha", 0], [wf + " - 2*Perfil_folha", "Perfil_folha"], [0, "Perfil_folha"]], "Material_marco"));
      });
      s.push(cx("ba", "Batente de vedação", 0, "Peitoril + Altura/2 - 0.003", 0, "Largura - 2*Marco", 0.006, 0.014, "Material_marco"));
      s.push(cl("fe", "Fecho (trinco)", "z", 0, "Peitoril + Altura/2 + 0.0", 0.012, 0.01, 0.014, "Metal cromado"));
      f.solidos = s;
      f.partesMoveis[0].solidos = ["v1", "be1", "bd1", "bi1", "bs1"];
      f.partesMoveis[1].solidos = ["v2", "be2", "bd2", "bi2", "bs2"];
      f.descricao += " Peças: marco, duas básculas com moldura de perfil, batente de vedação e fecho.";
    })();

    /* ---------------- PILAR E VIGA DE CONCRETO: prisma paramétrico, seção real, chanfro opcional ---------------- */
    var JUST_PRISMA = "Pilar e viga de concreto moldado em fôrma são PRISMAS de seção retangular constante (NBR 6118): essa é a forma real do elemento, não um bloco genérico no lugar de um produto. Não há ficha de fabricante a imitar; a seção é de projeto (parâmetros Base e Altura/Profundidade) e o chanfro das arestas é opcional (Chanfro).";
    (function () {
      var f = achar("ra-pilar-ret");
      f.justificativaForma = JUST_PRISMA;
      f.parametros.push(P("Chanfro", "comprimento", "tipo", 0, "Dimensões", "Chanfro a 45° nas quatro arestas verticais (0 = sem chanfro). Desconta o volume e a fôrma."),
        P("Fonte_cota", "texto", "tipo", "Seção de projeto (NBR 6118:2014, 13.2.3: lado mínimo 19 cm, até 14 cm com coeficiente de majoração). Prisma por natureza: sem ficha de fabricante.", "Fonte"), P("Nivel_fonte", "texto", "tipo", "A", "Fonte"));
      f.parametros.forEach(function (p) {
        if (p.nome === "Volume") p.formula = "(Base * Profundidade - 2 * Chanfro^2) * Altura";
        if (p.nome === "Area_forma") p.formula = "(2 * (Base + Profundidade) - 8 * Chanfro + 4 * Chanfro * raiz(2)) * Altura";
      });
      f.tipos.push({ id: "p2525", nome: "25 × 25", valores: { Base: 0.25, Profundidade: 0.25 } }, { id: "p3030", nome: "30 × 30", valores: { Base: 0.30, Profundidade: 0.30 } },
        { id: "p2020c", nome: "20 × 20, chanfro 2 cm", valores: { Base: 0.20, Profundidade: 0.20, Chanfro: 0.02 } });
      f.solidos = [
        cx("c", "Pilar", 0, 0, 0, "Base", "Altura", "Profundidade", "Material", "Chanfro = 0"),
        ex("cc", "Pilar com chanfro", "planta", 0, 0, 0, "Altura", [["-Base/2 + Chanfro", "-Profundidade/2"], ["Base/2 - Chanfro", "-Profundidade/2"], ["Base/2", "-Profundidade/2 + Chanfro"], ["Base/2", "Profundidade/2 - Chanfro"], ["Base/2 - Chanfro", "Profundidade/2"], ["-Base/2 + Chanfro", "Profundidade/2"], ["-Base/2", "Profundidade/2 - Chanfro"], ["-Base/2", "-Profundidade/2 + Chanfro"]], "Material", "Chanfro > 0")
      ];
    })();
    (function () {
      var f = achar("ra-viga-ret");
      f.justificativaForma = JUST_PRISMA;
      f.parametros.push(P("Chanfro", "comprimento", "tipo", 0, "Dimensões", "Chanfro a 45° nas quatro arestas longitudinais (0 = sem chanfro). Desconta o volume."),
        P("Fonte_cota", "texto", "tipo", "Seção de projeto (NBR 6118:2014, 13.2.2: largura mínima 12 cm). Prisma por natureza: sem ficha de fabricante.", "Fonte"), P("Nivel_fonte", "texto", "tipo", "A", "Fonte"));
      f.parametros.forEach(function (p) { if (p.nome === "Volume") p.formula = "(Base * Altura - 2 * Chanfro^2) * Comprimento"; });
      f.tipos.push({ id: "v1430", nome: "14 × 30", valores: { Base: 0.14, Altura: 0.30 } }, { id: "v1960", nome: "19 × 60", valores: { Base: 0.19, Altura: 0.60 } },
        { id: "v1440c", nome: "14 × 40, chanfro 2 cm", valores: { Base: 0.14, Altura: 0.40, Chanfro: 0.02 } });
      var oct = function (B, A, c) { return [["-(" + B + ")/2 + " + c, 0], ["(" + B + ")/2 - " + c, 0], ["(" + B + ")/2", c], ["(" + B + ")/2", A + " - " + c], ["(" + B + ")/2 - " + c, A], ["-(" + B + ")/2 + " + c, A], ["-(" + B + ")/2", A + " - " + c], ["-(" + B + ")/2", c]]; };
      /* a viga corre em X: a seção (z, y) é uma extrusão "frente" (contorno em x, y; profundidade em z) girada 90° em torno de Y — a profundidade passa a correr em +X */
      f.solidos = [
        cx("c", "Viga", "Comprimento/2", "Topo - Altura", 0, "Comprimento", "Altura", "Base", "Material", "Chanfro = 0"),
        ex("cc", "Viga com chanfro", "frente", 0, "Topo - Altura", 0, "Comprimento", oct("Base", "Altura", "Chanfro"), "Material", "Chanfro > 0", 90)
      ];
    })();
    ["ra-madeira-viga", "ra-madeira-pilar"].forEach(function (id) {
      var f = achar(id);
      f.justificativaForma = "Peça de madeira serrada é um PRISMA de seção retangular (bitola comercial/de projeto, NBR 7190): essa é a forma real da peça; não há forma de catálogo a imitar. A seção é o tipo (Base × Altura).";
    });
  })();

  var FamiliasRA = {
    /* registrar(lista): outros arquivos da biblioteca RA (js/familiasmob.js, js/familiasmobcoz.js, js/familiaspais.js) somam as famílias deles
       a esta lista — assim biblioteca, render, vistas e templates acham tudo por lista()/obter(). Idempotente: o mesmo id substitui. */
    registrar: function (fams) {
      (fams || []).forEach(function (f) {
        if (!f || !f.id) return;
        for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === f.id) { LISTA[i] = f; return; }
        LISTA.push(f);
      });
    },
    /* A CÓPIA da família RA que não nasceu com as partes móveis (a cópia de obra, gravada antes de 20/10/2026) herda as da BASE: a que tem a
       mesma categoria e o MESMO conjunto de sólidos (id). Devolve só { partesMoveis, parametros } da base (clonados) ou null — nunca varre quem não é porta/janela. */
    baseDePartes: function (fam) {
      if (!fam || fam.geometria || (fam.categoria !== "porta" && fam.categoria !== "janela")) return null;
      var ids = (fam.solidos || []).map(function (s) { return String(s.id); }).sort().join(",");
      for (var i = 0; i < LISTA.length; i++) {
        var b = LISTA[i];
        /* a cópia de obra pode ter o MESMO id da biblioteca (a pele de vidro gravada no .opbim): ela herda da família de mesmo id, que tem as partes */
        if (!b.partesMoveis || b.categoria !== fam.categoria || b.hospedagem !== fam.hospedagem) continue;
        /* LOTE 2 (28/10/2026): a família ganhou peças (guarnição, perfil, dobradiça…) e os ids de sólido da versão antiga ficam em `idsLegado`:
           a cópia de obra gravada com o desenho antigo continua herdando as partes (as peças novas que ela não tem saem da lista da parte) */
        var mesma = (b.solidos || []).map(function (s) { return String(s.id); }).sort().join(",") === ids, legado = (b.idsLegado || []).indexOf(ids) >= 0;
        if (mesma || legado) {
          var cp = JSON.parse(JSON.stringify({ partesMoveis: b.partesMoveis, parametros: b.parametros })), meus = {};
          (fam.solidos || []).forEach(function (s) { meus[String(s.id)] = 1; });
          if (!mesma) cp.partesMoveis.forEach(function (pt) { pt.solidos = (pt.solidos || []).filter(function (id) { return meus[String(id)]; }); });
          return cp;
        }
      }
      return null;
    },
    /* `oculta` (família SUBSTITUÍDA por uma do catálogo — js/famhidmigra.js): sai do MENU, mas continua DEFINIDA (alias carregável) para o projeto antigo abrir
       e para a migração avaliar. `lista()` traz TODAS (é a biblioteca-REGISTRO que o visor usa); `listaMenu()` traz só o que o menu mostra. */
    lista: function (todas) { return JSON.parse(JSON.stringify(LISTA.filter(function (f) { return visivel(f, todas); }))); },
    listaMenu: function (todas) { return JSON.parse(JSON.stringify(LISTA.filter(function (f) { return visivel(f, todas) && !f.oculta; }))); },
    obter: function (id, todas) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id && visivel(LISTA[i], todas)) return JSON.parse(JSON.stringify(LISTA[i])); return null; }
  };
  global.FamiliasRA = FamiliasRA;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasRA;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
