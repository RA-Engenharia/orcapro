/* =====================================================================
 * mor/catalogo-dados/extensoes.js — F3: o que se ACRESCENTA às 13 etapas do orçamento antigo
 *
 * As etapas de js/orcparam.js (migradas em residencial.js, cobertura.js e preliminares.js)
 * não mudam de linha: a paridade com OrcParam é cobrada por tools/test-orcparam.js.
 * Tudo que é novo entra AQUI, por cima, com duas regras:
 *   1. item novo leva `quando:"modo!='legado'"` — só existe no Manual acelerado/Automático
 *      novo, nunca no orçamento paramétrico antigo;
 *   2. item do orçamento antigo que o novo SUBSTITUI (por um que tem código SINAPI, ou por
 *      uma escolha da pessoa) só ganha uma condição extra que, no modo legado e com as
 *      respostas padrão, continua verdadeira — a linha antiga sai idêntica.
 *
 * COMO LER UM ITEM
 *   qtd: null        → a quantidade vem do projeto (pendente): aparece na prévia, nunca com
 *                      número chutado. Vale também para "consumo a confirmar" (sem fonte).
 *   sugestao: true   → a QUANTIDADE vem de taxa/coeficiente de estimativa (ex.: kg de aço por
 *                      m³); o engenheiro decide. Sai marcada `qtdOrigem:"sugerido"`.
 *   implicito: true  → item que o projeto não desenha, mas a obra consome (regra 16.2 da espec.).
 *   porque: "..."    → justificativa escrita (aceita {variável} da obra).
 * ⚠ Verificado no analítico SINAPI (data/sinapi-MG-analitico.json) em 13/11/2026 — para NÃO
 *   contar em dobro o que a composição já traz:
 *   - cerâmica de parede (87265) e de piso (87248/87263) JÁ trazem argamassa colante e rejunte;
 *   - tubo PVC soldável instalado traz lixa; a CONEXÃO instalada (joelho, luva…) traz adesivo,
 *     solução limpadora e lixa; por isso esses 3 só entram para conexão lançada como insumo avulso;
 *   - laje pré-moldada (106056/101964) e fôrma de viga (92448) JÁ trazem o escoramento (pontaletes);
 *     a fôrma de laje maciça (92514) JÁ traz escora telescópica (10749) e viga H20 (40270) no analítico: o 101792 NÃO se soma (revisão F13, 14/11/2026);
 *   - piso industrial (103913) já traz lona, tela, barras de transferência e concreto.
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = global.MorDados = global.MorDados || {};
  var M = "modo!='legado'";

  /* item pendente de projeto: quantidade null, com código quando existe */
  function pend(chave, cod, formula, intencao, quando, extra) {
    var o = { chave: chave, quando: quando || M, qtd: null, formula: formula, intencao: intencao }, k;
    if (cod) o.cod = cod;
    if (extra) for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  D.extensoes = [

    /* ---------------- COBERTURA: o condutor passa a ter código ---------------- */
    { id: "cobertura",
      ajustes: { condutor: { quando: "modo=='legado' && cob.tipo!='laje' && cob.calha" } },
      itens: [
        { chave: "condutorSinapi", cod: "plu100v", quando: M + " && cob.tipo!='laje' && cob.calha", qtd: "4*Hdesc", formula: "4 descidas × (pé-direito × pavimentos + 0,50 m)", intencao: "condutor vertical água pluvial pvc dn 100", implicito: true,
          porque: "o condutor do orçamento antigo não tinha código; a SINAPI tem a composição 89578 (PVC série R DN 100, condutor vertical) e ela passa a valer no lugar dele" }
      ] },

    /* ---------------- INFRAESTRUTURA (FUNDAÇÕES) ---------------- */
    { id: "infra",
      premissas: [
        "Armação de sapata/baldrame por TAXA (50 kg/m³ de sapata e 4Ø10 no baldrame) é SUGESTÃO de estimativa — o projeto estrutural decide.",
        "Bota-fora: o solo escavado que não volta como reaterro vai embora com empolamento (padrão 25 %, confirmar com a sondagem); o transporte só tem número com a distância ao bota-fora."
      ],
      perguntas: [
        { id: "infra.tipo", txt: "Tipo de fundação", op: ["sapata", "estaca", "radier"], rotulos: { sapata: "Sapata + baldrame (rasa)", estaca: "Estaca + bloco de coroamento + baldrame", radier: "Radier (laje sobre o solo)" }, padrao: "sapata" },
        { id: "infra.empolamento", txt: "Empolamento do solo escavado (fração, 0,25 = 25 %)", num: true, padrao: 0.25, min: 0, max: 0.6 },
        { id: "infra.dmt", txt: "Distância até o bota-fora (km) — 0 = a definir", num: true, padrao: 0, min: 0, max: 100 },
        { id: "infra.espRadier", txt: "Espessura do radier (m)", num: true, quando: "infra.tipo=='radier'", padrao: 0.15, min: 0.08, max: 0.5 }
      ],
      vars: [["Vesc", "escB+escS"], ["Vreat", "(escB+escS)-(vB+vS)"], ["Vbota", "max(0,Vesc-Vreat)*(1+infra.empolamento)"]],
      ajustes: {
        escSap: { quando: "infra.tipo=='sapata'" }, lastroSap: { quando: "infra.tipo=='sapata'" }, concSap: { quando: "infra.tipo=='sapata'" },
        arm10f: { quando: "infra.tipo=='sapata'", sugestao: true }, arm5f: { sugestao: true }
      },
      itens: [
        { chave: "lastroBald", cod: "lastroSap", quando: M, qtd: "Lb*0.40", formula: "largura da vala 0,40 m × Lb", intencao: "lastro de concreto magro baldrame", implicito: true,
          porque: "o baldrame não assenta direto no solo: leva lastro de concreto magro de 5 cm em toda a largura da vala" },
        { chave: "formaSap", cod: "formaSap", quando: M + " && infra.tipo=='sapata'", qtd: "nS*4*sap*0.30", formula: "4 faces × lado × 0,30 m de altura × nº de sapatas", intencao: "fôrma de sapata madeira serrada", implicito: true,
          porque: "a sapata de {sap} m tem 0,30 m de altura e precisa de fôrma nas 4 faces (o orçamento antigo só previa a do baldrame)" },
        { chave: "arm10fBald", cod: "arm10f", quando: M + " && infra.tipo!='sapata'", qtd: "Lb*4*0.617*1.10", formula: "baldrame 4Ø10 (0,617 kg/m, +10 % traspasse) × Lb", intencao: "armação de viga baldrame", sugestao: true,
          porque: "sem sapata, a armação de Ø10 do orçamento antigo (que somava sapata e baldrame) vira só a do baldrame" },
        { chave: "botaForaCarga", cod: "cargaSolo", quando: M, qtd: "Vbota", formula: "(escavação − reaterro) × (1 + empolamento)", intencao: "carga manobra e descarga de solo em caminhão basculante", implicito: true,
          porque: "o que foi escavado e não volta como reaterro ({infra.empolamento} de empolamento) tem de ser carregado e levado embora" },
        { chave: "botaForaTransp", cod: "transpSolo", quando: M + " && infra.dmt>0", qtd: "Vbota*infra.dmt", formula: "volume solto de bota-fora × distância (km)", intencao: "transporte com caminhão basculante de solo" },
        pend("botaForaTranspPend", "transpSolo", "volume solto de bota-fora × distância (km): informe a distância ao bota-fora", "transporte com caminhão basculante de solo", M + " && infra.dmt==0"),
        /* estaca */
        pend("estacaBroca", "estaca25", "comprimento total das estacas = nº de estacas × profundidade (projeto de fundações + sondagem)", "estaca broca de concreto", M + " && infra.tipo=='estaca'", { implicito: false }),
        pend("estacaArrasamento", "arrasEstaca", "1 por estaca (nº de estacas do projeto)", "arrasamento de estaca", M + " && infra.tipo=='estaca'"),
        pend("blocoForma", "formaBloco", "área de fôrma dos blocos de coroamento (projeto)", "fôrma de bloco de coroamento", M + " && infra.tipo=='estaca'"),
        pend("blocoArmacao", null, "peso de aço dos blocos de coroamento (projeto estrutural)", "armação de bloco de coroamento", M + " && infra.tipo=='estaca'", { desc: "ARMAÇÃO DE BLOCO DE COROAMENTO COM AÇO CA-50 (BITOLAS DO PROJETO)", un: "kg" }),
        pend("blocoConcreto", "concBloco", "volume dos blocos de coroamento (projeto)", "concretagem de bloco de coroamento", M + " && infra.tipo=='estaca'"),
        /* radier */
        { chave: "radierCompact", cod: "radComp", quando: M + " && infra.tipo=='radier'", qtd: "Ap", formula: "área de projeção Ap", intencao: "compactação mecânica de solo para radier" },
        { chave: "radierLona", cod: "radLona", quando: M + " && infra.tipo=='radier'", qtd: "Ap", formula: "área de projeção Ap", intencao: "camada separadora lona plástica radier", implicito: true,
          porque: "a lona evita que o solo roube água do concreto e separa a laje do lastro" },
        { chave: "radierLastro", cod: "lastroPiso", quando: M + " && infra.tipo=='radier'", qtd: "Ap", formula: "área de projeção Ap", intencao: "lastro de concreto magro sob radier" },
        { chave: "radierTela", cod: "radTela", quando: M + " && infra.tipo=='radier'", qtd: "Ap*2.20", formula: "tela Q-138 (2,20 kg/m², peso nominal do fabricante) × Ap", intencao: "armação de radier com tela soldada Q-138", sugestao: true,
          porque: "a tela Q-138 é SUGESTÃO de armação para radier de edificação leve; o projeto estrutural define a tela" },
        { chave: "radierConcreto", cod: "radConc", quando: M + " && infra.tipo=='radier'", qtd: "Ap*infra.espRadier", formula: "Ap × espessura do radier", intencao: "concretagem de radier fck 30" }
      ] },

    /* ---------------- SUPERESTRUTURA ---------------- */
    { id: "super",
      premissas: [
        "Escoramento: a fôrma de viga (92448) e a laje pré-moldada (106056/101964) da SINAPI JÁ trazem os pontaletes; a fôrma de laje maciça (92514) também traz o escoramento (escora telescópica 10749 no analítico) — o 101792 não se soma.",
        "Armação da laje maciça por taxa (80 kg/m³) é SUGESTÃO de estimativa — o projeto estrutural decide."
      ],
      perguntas: [
        { id: "super.laje", txt: "Tipo de laje", op: ["premoldada", "macica"], rotulos: { premoldada: "Pré-moldada (vigota + enchimento)", macica: "Maciça de concreto armado" }, padrao: "premoldada" },
        { id: "super.espLaje", txt: "Espessura da laje maciça (m)", num: true, quando: "super.laje=='macica'", padrao: 0.12, min: 0.08, max: 0.30 }
      ],
      vars: [["Alm", "se(super.laje=='macica',Ap*(pav-1)+se(forro.tipo=='laje',Ap,0),0)"]],
      ajustes: {
        lajePiso: { quando: "pav>1 && super.laje=='premoldada'" },
        lajeForro: { quando: "forro.tipo=='laje' && super.laje=='premoldada'" },
        concViga: { quando: "modo=='legado'" }
      },
      itens: [
        { chave: "concVigaSinapi", cod: "concViga", quando: M, qtd: "Lv*0.14*0.30", formula: "0,14 × 0,30 × comprimento de viga", intencao: "concretagem de vigas fck 25 bomba",
          porque: "a composição SINAPI 103675 (vigas e lajes, fck 25 MPa, bomba) substitui o item sem código do orçamento antigo" },
        { chave: "lajeMacForma", cod: "formaLajeM", quando: M + " && Alm>0", qtd: "Alm", formula: "área de laje maciça (pavimentos acima do térreo + laje de cobertura)", intencao: "fôrma de laje maciça compensado resinado" },
        { chave: "lajeMacArmacao", cod: "armLaje8", quando: M + " && Alm>0", qtd: "Alm*super.espLaje*80", formula: "taxa de 80 kg/m³ × volume da laje", intencao: "armação de laje aço CA-50", sugestao: true },
        { chave: "lajeMacConcreto", cod: "concViga", quando: M + " && Alm>0", qtd: "Alm*super.espLaje", formula: "área × espessura", intencao: "concretagem de laje maciça fck 25 bomba" }
      ] },

    /* ---------------- ALVENARIA E VEDAÇÃO ---------------- */
    { id: "alvenaria",
      premissas: [
        "Vergas e contravergas: a conta já vem do orçamento antigo (vão + 0,30 m de cada lado). Desconto de vãos: a área de janelas (1/8 da área útil) e as portas (1,89 m² cada externa, 1,47 m² cada interna) saem POR INTEIRO da alvenaria, sem o limite de 2 m² que a SINAPI aplica por vão (a SINAPI não desconta vão menor que 2 m²: aqui a alvenaria fica um pouco MENOR que na regra dela).",
        "Andaime: a parede acima de 1,50 m não se alcança do piso; a montagem do andaime entra com quantidade (fachada) e a locação com o prazo da etapa, que o orçamentista confirma."
      ],
      perguntas: [
        { id: "alv.bloco", txt: "Bloco de vedação", op: ["ceramico9", "ceramico14", "ceramico19", "celular15"], rotulos: { ceramico9: "Cerâmico 9×19×19 (parede de 9 cm)", ceramico14: "Cerâmico 14×19×39 (parede de 14 cm)", ceramico19: "Cerâmico 19×19×39 (parede de 19 cm)", celular15: "Concreto celular 15×30×60" }, padrao: "ceramico9" },
        { id: "alv.drywall", txt: "Divisórias internas em drywall", bool: true, padrao: false }
      ],
      vars: [["AalvExt", "P*(h-0.30)*pav-(Aj+Npe*1.89)"], ["Adry", "max(0,Li*h*pav-Npi*1.47)"], ["Aalv2", "se(alv.drywall,AalvExt,Aalv)"]],
      ajustes: { alvenaria: { quando: "alv.bloco=='ceramico9' && !alv.drywall" } },
      itens: [
        { chave: "alvCer9Ext", cod: "alvenaria", quando: M + " && alv.bloco=='ceramico9' && alv.drywall", qtd: "AalvExt", formula: "só as paredes externas: P × (h − 0,30) × pav − vãos externos", intencao: "alvenaria de vedação bloco cerâmico 9x19x19" },
        { chave: "alvCer14", cod: "alv14", quando: M + " && alv.bloco=='ceramico14'", qtd: "Aalv2", formula: "(P + Li) × (h − 0,30) × pav − vãos (ou só externas, com drywall)", intencao: "alvenaria de vedação bloco cerâmico 14x19x39" },
        { chave: "alvCer19", cod: "alv19", quando: M + " && alv.bloco=='ceramico19'", qtd: "Aalv2", formula: "(P + Li) × (h − 0,30) × pav − vãos (ou só externas, com drywall)", intencao: "alvenaria de vedação bloco cerâmico 19x19x39" },
        { chave: "alvCelular15", cod: "alvCelular15", quando: M + " && alv.bloco=='celular15'", qtd: "Aalv2", formula: "(P + Li) × (h − 0,30) × pav − vãos (ou só externas, com drywall)", intencao: "alvenaria de vedação bloco de concreto celular 15" },
        { chave: "drywallInterno", cod: "dry2f", quando: M + " && alv.drywall", qtd: "Adry", formula: "paredes internas Li × h × pav − portas internas (1,47 m² cada)", intencao: "parede de drywall duas faces simples guias simples" },
        /* (removido na revisão: «tela de ligação alvenaria × pilar» — as composições de alvenaria da SINAPI, ex.: 103328, JÁ trazem o insumo 34557 TELA DE AÇO SOLDADA GALVANIZADA PARA ALVENARIA; lançar à parte contava duas vezes) */
        { chave: "andaimeMontagem", cod: "andaimeMont", quando: M + " && h>1.5", qtd: "P*(h*pav+0.50)", formula: "fachada = perímetro × (pé-direito × pavimentos + 0,50 m)", intencao: "montagem e desmontagem de andaime fachadeiro", implicito: true,
          porque: "andaime porque a parede tem {h} m de pé-direito e o pedreiro alcança até 1,50 m do piso" },
        pend("andaimeLocacao", "andaimeLoc", "painéis de andaime × meses de uso (prazo da etapa de alvenaria): a confirmar", "locação de andaime metálico tubular", M + " && h>1.5", { implicito: true, porque: "o andaime montado é alugado por mês: o prazo da alvenaria decide o consumo" })
      ] },

    /* ---------------- REVESTIMENTOS DE PAREDE ---------------- */
    { id: "revestimento", usa: ["forro.tipo"],
      premissas: ["Cerâmica de parede: a composição SINAPI (87265) JÁ traz argamassa colante AC-I e rejunte — não se lançam à parte."],
      itens: [
        { chave: "chapiscoTeto", cod: "chapTeto", quando: M + " && forro.tipo=='laje'", qtd: "Autil", formula: "área do teto = área útil", intencao: "chapisco no teto laje", implicito: true,
          porque: "teto de laje aparente leva chapisco + massa antes da pintura" },
        { chave: "massaTetoLaje", cod: "massaUnicaTeto", quando: M + " && forro.tipo=='laje'", qtd: "Autil", formula: "área do teto = área útil", intencao: "massa única em teto", implicito: true }
      ] },

    /* ---------------- PISOS ---------------- */
    { id: "pisos",
      premissas: ["Cerâmica e porcelanato de piso: a composição SINAPI JÁ traz argamassa colante e rejunte. Soleira nas portas externas e nos banheiros; rodapé desconta portas e banheiros."],
      ajustesPerguntas: { "piso.tipo": { op: ["ceramica", "porcelanato", "vinilico", "cimentado"], rotulos: { ceramica: "Cerâmica", porcelanato: "Porcelanato", vinilico: "Vinílico em placas", cimentado: "Cimentado liso" } } },
      ajustes: { pisoCer: { quando: "piso.tipo=='ceramica'" }, rodape: { quando: "modo=='legado' || piso.tipo!='porcelanato'" } },
      itens: [
        { chave: "pisoVinilico", cod: "vinilico", quando: M + " && piso.tipo=='vinilico'", qtd: "Autil", formula: "área útil total", intencao: "piso vinílico semi-flexível em placas" },
        { chave: "pisoCimentado", cod: "pisoCimentado", quando: M + " && piso.tipo=='cimentado'", qtd: "Autil", formula: "área útil total", intencao: "piso cimentado liso" },
        { chave: "rodapePorcelanato", cod: "rodapePorc", quando: M + " && piso.tipo=='porcelanato'", qtd: "(P+2*Li)*pav-(Npi*2+Npe)*0.80-banheiros*7.5", formula: "perímetro dos cômodos − portas − banheiros (mesma conta do rodapé cerâmico)", intencao: "rodapé cerâmico 7 cm 60x60" }
      ] },

    /* ---------------- FORRO ---------------- */
    { id: "forro",
      ajustesPerguntas: { "forro.tipo": { op: ["gesso", "laje", "nenhum", "pvc", "drywall", "madeira", "mineral"], rotulos: { gesso: "Forro de gesso", laje: "Laje (forro em laje pré-moldada)", nenhum: "Sem forro", pvc: "Forro de PVC", drywall: "Forro de drywall", madeira: "Forro de madeira (pinus)", mineral: "Forro de fibra mineral (comercial)" } } },
      itens: [
        { chave: "forroPvc", cod: "forroPvc", quando: M + " && forro.tipo=='pvc'", qtd: "Autil", formula: "área útil total", intencao: "forro de réguas de PVC" },
        { chave: "forroDrywall", cod: "forroDry", quando: M + " && forro.tipo=='drywall'", qtd: "Autil", formula: "área útil total", intencao: "forro de drywall" },
        { chave: "forroMadeira", cod: "forroMadeira", quando: M + " && forro.tipo=='madeira'", qtd: "Autil", formula: "área útil total", intencao: "forro de madeira pinus" },
        { chave: "forroMineral", cod: "forroMineral", quando: M + " && forro.tipo=='mineral'", qtd: "Autil", formula: "área útil total", intencao: "forro de fibra mineral" }
      ] },

    /* ---------------- ESQUADRIAS ---------------- */
    { id: "esquadrias",
      premissas: ["Porta interna: kit de madeira (porta + batente + fechadura) padrão popular no padrão popular e padrão médio nos demais. Janela de alumínio e de aço trazem requadro; vidro só na de alumínio."],
      perguntas: [
        { id: "esq.janela", txt: "Janela", op: ["aluminio", "aco", "madeira"], rotulos: { aluminio: "Alumínio de correr (vidro incluso)", aco: "Aço basculante (vidro à parte)", madeira: "Madeira maxim-ar" }, padrao: "aluminio" }
      ],
      ajustes: { janela: { quando: "modo=='legado' || esq.janela=='aluminio'" }, portaInt: { quando: "modo=='legado' || padrao!='popular'" } },
      itens: [
        { chave: "portaIntPopular", cod: "portaPopular70", quando: M + " && padrao=='popular'", qtd: "Npi", formula: "1 porta a cada 14 m² construídos", intencao: "kit porta de madeira padrão popular 70x210" },
        { chave: "janelaAco", cod: "janelaAcoBasc", quando: M + " && esq.janela=='aco'", qtd: "Aj", formula: "1/8 da área útil", intencao: "janela de aço basculante" },
        { chave: "janelaMadeira", cod: "janelaMaxim", quando: M + " && esq.janela=='madeira'", qtd: "Aj", formula: "1/8 da área útil", intencao: "janela de madeira maxim-ar" },
        { chave: "contramarco", cod: "contramarcoAlu", quando: M + " && esq.janela=='aluminio'", qtd: "Nj*4.8", formula: "janelas × perímetro 4,80 m (1,20 × 1,20)", intencao: "contramarco de alumínio", implicito: true,
          porque: "o contramarco é o quadro que fica na alvenaria e recebe a janela de alumínio" }
      ] },

    /* ---------------- PINTURA ---------------- */
    { id: "pintura",
      premissas: ["Massa corrida: 1 demão no padrão normal e 2 no alto (nenhuma no popular); selador antes da massa e da tinta; tinta em 2 demãos (a SINAPI traz as demãos na própria composição)."],
      itens: [
        { chave: "seladorParInt", cod: "selParInt", quando: M, qtd: "Apint", formula: "paredes internas com massa única", intencao: "fundo selador acrílico paredes internas", implicito: true, porque: "o selador uniformiza a absorção da parede antes da massa e da tinta" },
        { chave: "seladorTeto", cod: "selTeto", quando: M + " && padrao!='popular'", qtd: "Ateto", formula: "teto = área útil", intencao: "fundo selador acrílico teto", implicito: true }
      ] },

    /* ---------------- INSTALAÇÕES ELÉTRICAS ---------------- */
    { id: "eletrica",
      perguntas: [{ id: "ele.tue", txt: "Tomadas de uso específico 20 A (ar-condicionado, forno…)", num: true, padrao: 0, min: 0, max: 40 }],
      itens: [
        { chave: "dps", cod: "dps", quando: M + " && padrao!='popular'", qtd: "2*pav", formula: "2 fases × 1 quadro por pavimento", intencao: "dispositivo DPS no quadro de distribuição", sugestao: true,
          porque: "proteção contra surtos no quadro; a exigência depende da NBR 5410 e da análise de risco do projeto elétrico (decisão do engenheiro)" },
        { chave: "tue", cod: "tomada20", quando: M + " && ele.tue>0", qtd: "ele.tue", formula: "uma por equipamento de uso específico", intencao: "tomada 2P+T 20 A" },
        pend("caboChuveiro", "cabo6", "comprimento do circuito de cada chuveiro (3 condutores de 6 mm²) vem do projeto elétrico", "cabo de cobre 6 mm² circuito do chuveiro", M),
        { chave: "rasgoEletroduto", cod: "rasgoEle", quando: M, qtd: "Leletro", formula: "= comprimento de eletroduto (suposto todo embutido em alvenaria)", intencao: "rasgo linear em alvenaria para eletrodutos", sugestao: true, implicito: true,
          porque: "eletroduto embutido em parede exige rasgo; o trecho que vai em laje ou forro não leva — reduza se for o caso" },
        { chave: "chumbamentoEletroduto", cod: "chumbEle", quando: M, qtd: "Leletro", formula: "= comprimento de eletroduto (suposto todo embutido em alvenaria)", intencao: "chumbamento linear em alvenaria para eletrodutos", sugestao: true, implicito: true },
        pend("luvasCurvasEletroduto", "luvaEle", "luvas, curvas e buchas: consumo por metro de eletroduto a confirmar", "luva curva bucha para eletroduto", M, { implicito: true, porque: "as composições SINAPI de eletroduto não trazem as conexões; sem fonte de consumo, ficam pendentes" }),
        pend("fitaIsolante", "fitaIsol", "consumo de fita isolante e terminais por ponto: a confirmar", "fita isolante e terminais", M, { implicito: true })
      ] },

    /* ---------------- INSTALAÇÕES HIDROSSANITÁRIAS (água fria/quente, esgoto, louças e metais) ---------------- */
    { id: "hidro",
      premissas: [
        "Tubo PVC soldável instalado (SINAPI) já traz a lixa; a conexão instalada traz adesivo, solução limpadora e lixa. Por isso adesivo, solução e lixa só entram para conexões lançadas como insumo avulso, pelo consumo da composição SINAPI de joelho (códigos 89404, 89408, 89413, 103980, 103984).",
        "Lavatório padrão normal (86903) vem sem misturador, sifão, válvula e engate: entram à parte, como na composição 86940 (padrão alto)."
      ],
      perguntas: [
        { id: "hid.quente", txt: "Água quente (aquecedor solar)", bool: true, padrao: false },
        { id: "hid.juntas", txt: "Conexões PVC soldável lançadas como insumo avulso (nº) — 0 = nenhuma", num: true, padrao: 0, min: 0, max: 5000 },
        { id: "hid.dnJunta", txt: "DN das conexões avulsas (mm)", op: ["20", "25", "32", "40", "50"], quando: "hid.juntas>0", padrao: "25" }
      ],
      vars: [
        ["kAdes", "se(hid.dnJunta=='20',0.0047,se(hid.dnJunta=='25',0.0071,se(hid.dnJunta=='32',0.0094,se(hid.dnJunta=='40',0.0118,0.0165))))"],
        ["kSol", "se(hid.dnJunta=='20',0.006,se(hid.dnJunta=='25',0.008,se(hid.dnJunta=='32',0.011,se(hid.dnJunta=='40',0.014,0.022))))"],
        ["kLixa", "se(hid.dnJunta=='20',0.026,se(hid.dnJunta=='25',0.0302,se(hid.dnJunta=='32',0.036,se(hid.dnJunta=='40',0.0427,0.051))))"]
      ],
      itens: [
        /* água fria */
        { chave: "registroPressao", cod: "regPressao", quando: M, qtd: "banheiros", formula: "1 registro de pressão do chuveiro por banheiro", intencao: "registro de pressão 3/4 com acabamento" },
        { chave: "torneiraJardim", cod: "torneiraJardim", quando: M + " && tipo!='comercial'", qtd: "1", formula: "1 torneira externa (jardim/lavagem)", intencao: "torneira de jardim", sugestao: true },
        { chave: "rasgoHidraulica", cod: "rasgoHid", quando: M, qtd: "Npa*4", formula: "= comprimento de ramais (pontos × 4 m)", intencao: "rasgo linear em alvenaria para instalações hidráulicas", sugestao: true, implicito: true,
          porque: "ramal embutido em parede exige rasgo e chumbamento" },
        { chave: "chumbamentoHidraulica", cod: "chumbHid", quando: M, qtd: "Npa*4", formula: "= comprimento de ramais (pontos × 4 m)", intencao: "chumbamento linear em alvenaria para instalações hidráulicas", sugestao: true, implicito: true },
        /* PVC soldável: adesivo, solução limpadora e lixa (só conexão avulsa) */
        { chave: "adesivoPvc", cod: "adesivoPVC", quando: M + " && hid.juntas>0", qtd: "hid.juntas*kAdes", formula: "nº de conexões × consumo por conexão (frasco de 850 g) da composição SINAPI de joelho (DN escolhido)", intencao: "adesivo plástico para PVC", implicito: true,
          porque: "cada junta soldada consome adesivo; a composição de conexão instalada já o traz, por isso só entra para conexão avulsa" },
        { chave: "solucaoLimpadora", cod: "solucaoLimp", quando: M + " && hid.juntas>0", qtd: "hid.juntas*kSol", formula: "nº de conexões × consumo por conexão (frasco de 1 L) da composição SINAPI", intencao: "solução preparadora limpadora para PVC", implicito: true },
        { chave: "lixaPvc", cod: "lixaPVC", quando: M + " && hid.juntas>0", qtd: "hid.juntas*kLixa", formula: "nº de conexões × consumo de lixa d'água por conexão da composição SINAPI", intencao: "lixa d'água para PVC", implicito: true },
        pend("juntasPvcAvulsas", "adesivoPVC", "informe quantas conexões PVC soldável serão lançadas como insumo avulso: adesivo, solução limpadora e lixa saem pelo consumo por conexão da SINAPI", "adesivo solução limpadora e lixa para PVC soldável", M + " && hid.juntas==0", { implicito: true, porque: "se as conexões forem lançadas pela composição SINAPI 'instalada', adesivo, solução e lixa JÁ estão nela; ignore este aviso" }),
        /* água quente */
        pend("aquecedorSolar", "solar400", "dimensionamento do aquecimento (nº de pessoas × consumo) vem do projeto", "aquecedor solar com reservatório térmico", M + " && hid.quente"),
        pend("tuboAguaQuente", null, "metros de tubulação de água quente (CPVC ou PPR) do projeto — a base não tem composição de ramal", "tubulação de água quente cpvc ppr ramal", M + " && hid.quente", { desc: "TUBULAÇÃO DE ÁGUA QUENTE EM CPVC OU PPR, RAMAIS (FORNECIMENTO E INSTALAÇÃO)", un: "m" }),
        pend("isolamentoQuente", "isolTubo25", "mesmo comprimento da tubulação de água quente", "isolamento térmico de tubulação de água quente", M + " && hid.quente", { implicito: true, porque: "a tubulação de água quente perde calor sem isolamento" }),
        /* esgoto e ventilação */
        { chave: "raloBox", cod: "ralo", quando: M, qtd: "banheiros", formula: "1 ralo sifonado por box", intencao: "ralo sifonado pvc 100x40", sugestao: true },
        { chave: "colunaVentilacao", cod: "tubo100pr", quando: M, qtd: "h*pav+0.50", formula: "1 coluna de ventilação/queda × (pé-direito × pavimentos + 0,50 m)", intencao: "tubo pvc esgoto dn 100 prumada ventilação", sugestao: true },
        { chave: "terminalVentilacao", cod: "terminal100", quando: M, qtd: "1", formula: "1 terminal por coluna de ventilação", intencao: "terminal de ventilação pvc 100", implicito: true },
        pend("testeEstanqueidade", null, "1 verba por obra: teste de estanqueidade das redes de água e esgoto", "teste de estanqueidade rede hidráulica e esgoto", M, { desc: "TESTE DE ESTANQUEIDADE DAS REDES DE ÁGUA E ESGOTO", un: "vb", implicito: true }),
        /* louças e metais */
        { chave: "assentoSanitario", cod: "assento", quando: M, qtd: "banheiros", formula: "1 por bacia (1 bacia por banheiro)", intencao: "assento sanitário convencional", implicito: true },
        { chave: "misturadorLavatorio", cod: "misturaLav", quando: M + " && padrao=='normal'", qtd: "banheiros", formula: "1 por lavatório", intencao: "aparelho misturador de mesa para lavatório padrão médio", implicito: true },
        { chave: "sifaoLavatorio", cod: "sifaoLav", quando: M + " && padrao=='normal'", qtd: "banheiros", formula: "1 por lavatório", intencao: "sifão tipo garrafa metal cromado", implicito: true },
        { chave: "valvulaLavatorio", cod: "valvLav", quando: M + " && padrao=='normal'", qtd: "banheiros", formula: "1 por lavatório", intencao: "válvula metal cromado para lavatório", implicito: true },
        { chave: "engateLavatorio", cod: "engateInox", quando: M + " && padrao=='normal'", qtd: "banheiros*2", formula: "2 por lavatório (água fria e quente)", intencao: "engate flexível inox 1/2 x 40", implicito: true }
      ] },

    /* ---------------- SERVIÇOS FINAIS ---------------- */
    { id: "finais",
      vars: [["AcerF", "banheiros*7.5*h+se(tipo=='comercial',0,10*1.5)"]],
      ajustes: { limpezaFinal: { quando: "modo=='legado'" } },
      premissas: ["Limpeza final por serviço (piso, revestimento, vidros e louças), com as composições de limpeza da SINAPI; a limpeza genérica do orçamento antigo sai no lugar delas."],
      itens: [
        { chave: "limpezaPiso", cod: "limpPiso", quando: M, qtd: "Autil", formula: "área útil total", intencao: "limpeza de piso cerâmico detergente neutro" },
        { chave: "limpezaRevestimento", cod: "limpPar", quando: M, qtd: "AcerF", formula: "mesma área de cerâmica de parede", intencao: "limpeza de revestimento cerâmico parede" },
        { chave: "limpezaVidros", cod: "limpVidro", quando: M, qtd: "Aj", formula: "área de janelas = 1/8 da área útil", intencao: "limpeza de janela de vidro" },
        { chave: "limpezaLoucas", cod: "limpLouca", quando: M, qtd: "banheiros*2+se(tipo=='comercial',0,2)", formula: "banheiros × (bacia + lavatório) + pia e tanque em residência", intencao: "limpeza de bacia sanitária lavatório louça", sugestao: true },
        pend("retiradaEntulho", "entulhoA", "volume de entulho da obra (m³): informar", "remoção de entulho classe A caçamba", M, { implicito: true, porque: "toda obra gera entulho de alvenaria, argamassa e cerâmica que a caçamba leva" })
      ] }

  ];

  if (typeof module !== "undefined" && module.exports) module.exports = D.extensoes;
})(typeof window !== "undefined" ? window : globalThis);
