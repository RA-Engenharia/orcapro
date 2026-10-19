/* =====================================================================
 * hidmanual.js — MANUAL DE EXECUÇÃO E DE USO do hidrossanitário e da climatização
 * (frente "templates + manual", 17/10/2026). Motor PURO, ES5, sem DOM, Node-testável.
 *
 *   HidManual.gerar(resultado, opcoes) → { ok, titulo, html, sistemas, pendencias, fontes, avisos }
 *   HidManual.html(resultado, opcoes)  → só o texto HTML
 *
 *   resultado  o de HidDimensionar.calcular (docs/hidro/CONTRATO.md): o manual olha QUAIS SISTEMAS vieram
 *              (resultado.sistemas.agua_fria, esgoto, agua_quente, pluvial, incendio, tratamento, industrial);
 *              a climatização entra quando opcoes.clima for verdadeiro, ou resultado.clima /
 *              resultado.sistemas.climatizacao existirem. O manual não recalcula nada.
 *   opcoes     obra { nome, endereco, cidade }, documento { numero, revisao, data }, responsavel { nome, crea },
 *              materiais { <sistema>: <id do material do biminst> } (senão o padrão do biminst),
 *              clima (boolean), normas (o módulo HidNormas, senão global).
 *
 * POR QUE ESTE MANUAL É ASSIM (registro formal de engenharia — não afrouxar):
 *  · Cada instrução leva a FONTE (documento e PÁGINA). Manual de fabricante vale para o produto dele e
 *    está marcado "fabricante": não substitui a norma. Quando o acervo não tem a norma nem o manual,
 *    o item sai como "PENDENTE" em vermelho com o motivo — nunca um procedimento de memória.
 *  · Valor numérico de norma não é escrito aqui: os números que aparecem são os que o manual do
 *    FABRICANTE traz (citados com página). Onde dois trechos da mesma fonte divergem (pressão de ensaio da
 *    água fria: Tigre p.45 × p.95), o manual MOSTRA a divergência e deixa a escolha para a NBR vigente.
 *  · Os manuais estão em OneDrive\1-RA ENGENHARIA ESPECIAL\BIBLIOTECA TÉCNICA - CATÁLOGOS\ (campo `arq`).
 *    Páginas conferidas no PDF em 17/10/2026 (a numeração impressa é a mesma do PDF nesses arquivos).
 * Teste: node tools/test-hid-manual.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arquivo); } catch (e) { return null; } }
    return null;
  }
  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* ------------------------------------------------------------------ FONTES */
  var BIB = "BIBLIOTECA TÉCNICA - CATÁLOGOS/";
  var FONTES = {
    tigre:  { doc: "Tigre — Manual Técnico: Instalações Hidráulicas Prediais (2025)", arq: BIB + "Hidrossanitário/Tigre/Tigre - Manual Tecnico 2025.pdf", tipo: "fabricante", url: "https://tigresite.s3.amazonaws.com/2025/08/manual_tigre_2025.pdf" },
    ppr:    { doc: "Amanco Wavin — Ficha Técnica PPR", arq: BIB + "Hidrossanitário/Amanco Wavin/Amanco Wavin - FT PPR.pdf", tipo: "fabricante", url: "https://mediahub.wavin.com/m/74fcd9fb35745739/original/FT-PPR.pdf" },
    cpvc:   { doc: "Amanco Wavin — Ficha Técnica Super CPVC", arq: BIB + "Hidrossanitário/Amanco Wavin/Amanco Wavin - FT Super CPVC.pdf", tipo: "fabricante", url: "https://mediahub.wavin.com/m/7ffe656fe6279228/original/FT-Super-CPVC.pdf" },
    amcx:   { doc: "Amanco Wavin — Manual Técnico Caixas d'água", arq: BIB + "Hidrossanitário/Amanco Wavin/Amanco Wavin - Manual Tecnico Reservatorios.pdf", tipo: "fabricante", url: "https://mediahub.wavin.com/asset/33df8889-12a6-4bb4-95c2-601f3714c923/Manual-Tecnico-Reservatorios.pdf" },
    fxcx:   { doc: "Fortlev — Catálogo Técnico Caixa d'Água", arq: BIB + "Hidrossanitário/Fortlev/Fortlev - Manual Tecnico Caixa dAgua 2020.pdf", tipo: "fabricante" },
    fxcis:  { doc: "Fortlev — Catálogo Técnico Cisterna", arq: BIB + "Hidrossanitário/Fortlev/Fortlev - Manual Tecnico Cisterna 2020.pdf", tipo: "fabricante" },
    fxfossa: { doc: "Fortlev — Catálogo Técnico Fossa Séptica (2024)", arq: BIB + "Tratamento/Fortlev/Fortlev - Manual Tecnico Fossa Septica 2024.pdf", tipo: "fabricante", url: "https://www.fortlev.com.br/wp-content/uploads/2024/08/manual_tecnico_fortlev_fossa-septica.pdf.pdf" },
    midea:  { doc: "Springer Midea — Manual de Instalação, Operação e Manutenção, Hi-Wall Inverter All Easy (09/20)", arq: BIB + "Climatização/Springer Midea/Midea - Manual Instalacao Hi-Wall All Easy Pro 12000.pdf", tipo: "fabricante" },
    elgin:  { doc: "Elgin — Manual de Instalação, Split High Wall HJFC/HJQC", arq: BIB + "Climatização/Elgin/Elgin - Manual Instalacao Split High Wall HJFC HJQC.pdf", tipo: "fabricante", url: "https://content.elgin.com.br/assets/arquivos/portal-apoio-novo/0A97E170674D8468DA7986CAE922C24C.pdf" },
    nbr5626: { doc: "ABNT NBR 5626:2020 — Sistemas prediais de água fria e água quente (2ª ed., 29.06.2020)", arq: "exemplar declarado comprado em 17/10/2026; falta o PDF com a marca de licença (transcrição de conferência em RA Brain)", tipo: "primária" },
    nbr8160: { doc: "ABNT NBR 8160:1999 — Sistemas prediais de esgoto sanitário: projeto e execução", arq: "texto conferido em 17/10/2026; exemplar próprio pendente (cópia não arquivada; transcrição de conferência em RA Brain)", tipo: "primária" },
    nbr13714: { doc: "ABNT NBR 13714:2000 — Sistemas de hidrantes e de mangotinhos para combate a incêndio", arq: "texto conferido em 17/10/2026; exemplar próprio pendente (cópia não arquivada; transcrição de conferência em RA Brain); vigência a conferir no catálogo ABNT", tipo: "primária" },
    it17: { doc: "CBMMG IT 17 — Sistema de Hidrantes e Mangotinhos para Combate a Incêndio, 1ª ed. (Portaria 70/2022, Emenda 21) — prevalece em MG", arq: "dados-fonte/hidro/normas/incendio.json (in.it17.regras_dimensionamento)", tipo: "primária" },
    hidnormas: { doc: "HidNormas — tabelas de norma do OrçaPRO (edição e página vêm da própria tabela)", arq: "js/hidnormasdados.js", tipo: "tabela do sistema" }
  };
  function F() { var o = [], i; for (i = 0; i < arguments.length; i += 2) o.push({ id: arguments[i], pag: arguments[i + 1] }); return o; }
  function Item(t, f, se) { var o = { t: t, f: f }; if (se) o.se = se; return o; }
  function Pend(t, motivo) { return { t: t, pend: motivo }; }

  /* ------------------------------------------------------------ CONTEÚDO
   * Estrutura: MANUAL[sistema] = { nome, montagem[], teste[], limpeza[], manutencao[], uso[] }
   *            MATERIAL[materialId] = { nome, itens[] }  — cuidados de instalação por material. */
  var N26 = "nbr5626", N81 = "nbr8160";

  var MANUAL = {
    agua_fria: {
      nome: "Água fria",
      montagem: [
        Item("Receber e armazenar os tubos com apoio contínuo em toda a extensão (caibros transversais a cada 1,50 m), ventilados e protegidos do sol; pilha de no máximo 1,50 m (tubo de PVC soldável).", F("tigre", "42")),
        Item("Instalação embutida em alvenaria: abrir o rasgo de modo que tubos e conexões fiquem livres de tensões; nunca curvar ou forçar o tubo depois de montado; fechar o rasgo só depois do teste de estanqueidade.", F("tigre", "42")),
        Item("Em concreto: prever as passagens antes da concretagem. A tubulação não se embute em laje maciça ou pré-moldada; quando for inevitável, atravessar perpendicularmente à armadura principal, prevista e compatibilizada com o projeto estrutural.", F("tigre", "42, 86")),
        Item("Tubulação independente da estrutura: folga ao redor do tubo nas travessias, preenchida com material flexível; nas vigas e lajes, passar o tubo dentro de um trecho de maior diâmetro.", F("tigre", "43, 44")),
        Item("Instalação aparente: abraçadeiras ou suportes com material resiliente entre tubo e apoio, sem pontos de tensão, que permitam a dilatação; peso concentrado (registros, válvulas) apoiado e ancorado independentemente do tubo.", F("tigre", "44, 88")),
        Item("Espaçamento máximo entre apoios, tubo soldável na horizontal (fabricante): DN 20 — 0,9 m; 25 — 1,0 m; 32 — 1,1 m; 40 — 1,3 m; 50 — 1,5 m; 60 — 1,7 m; 75 — 1,9 m; 85 — 2,1 m; 110 — 2,5 m. Confirmar com a norma vigente.", F("tigre", "87")),
        Item("Na transposição de portas e janelas, traçado retilíneo: desvio em forma de sifão forma bolsa de ar e prejudica a instalação quando falta abastecimento.", F("tigre", "45, 88")),
        Item("Ligação com bomba: intercalar mangote de borracha ou junta flexível entre a bomba e a tubulação, para absorver a vibração; não deixar a tubulação enterrada muito alinhada em trechos longos (formato de cobra, para absorver dilatação).", F("tigre", "88, 89")),
        Item("Antes de revestir com argamassa ou cerâmica, ou de ocultar em shaft, executar o teste de recebimento (ver adiante).", F("tigre", "95")),
        Item("Pintura de identificação das tubulações conforme a NBR 6493.", F(N26, "7.4.3")),
        Item("Ao fim da obra, registrar a instalação como executada (as built).", F(N26, "7.6"))
      ],
      teste: [
        Item("Condições iniciais: tubulação limpa e cheia de água a 20 °C, sem bolhas de ar; ramais tampados nos pontos de consumo e registros abertos para circular a água e retirar o ar.", F("tigre", "95")),
        Item("Pressurização com bomba manual de teste e manômetro calibrado (aferido anualmente), injetando a água lentamente até a pressão de ensaio. O ar no sistema invalida o teste.", F("tigre", "95, 96")),
        Item("Estabilização: manter a pressão por no mínimo 1 h após estabilizar; sem queda no manômetro e sem vazamento nos pontos de inspeção. Havendo queda, localizar, refazer o trecho, aguardar a cura do adesivo e repetir.", F("tigre", "45, 95, 96", N26, "7.3.1")),
        Item("Registro: identificar o ramal (obra, ambiente, horário), fotografar o manômetro estabilizado, preencher o formulário de teste e arquivar.", F("tigre", "96")),
        Item("Pressão de ensaio das tubulações: a MENOR entre 600 kPa e 1,5 vez a pressão máxima de trabalho (item 7.3.1 da NBR 5626:2020). Isso resolve a divergência do manual Tigre (p.45 diz \"a menor\", p.95 diz \"a maior\"): vale a menor.", F(N26, "7.3.1", "tigre", "45, 95")),
        Item("Peças de utilização: ensaiar à pressão estática prevista por 1 h.", F(N26, "7.3.2")),
        Item("Reservatório: ensaiar cheio até o nível máximo por 72 h, sem vazamento nem extravasamento.", F(N26, "7.3.3"))
      ],
      limpeza: [
        Item("Limpeza do reservatório a cada 6 meses: esvaziar e limpar com pano e água para remover o limo; não usar escovas, objetos abrasivos nem produtos químicos, que deixam a parede áspera; manter filtro de entrada instalado no cavalete.", F("amcx", "30")),
        Item("Local do reservatório ventilado, com no mínimo 60 cm em volta e acesso para inspeção e limpeza; base rígida, plana e nivelada, maior que o fundo; reservatório com as quatro tubulações — entrada, saída, extravasor (ladrão) e limpeza; tampa sempre fechada.", F("fxcx", "5, 7")),
        Item("Cisterna: base de concreto armado de 10 cm, preenchimento em camadas de 25 cm e, depois de compactar, manter cheia de água por 24 h sem uso para estabilizar e verificar vazamentos; abertura de inspeção de no mínimo 90 cm.", F("fxcis", "4, 5")),
        Item("Desinfecção e limpeza do reservatório (Anexo F, informativo), F.3.1: interromper a entrada; bloquear a saída no nível mínimo; esvaziar, inclusive a reserva de incêndio; esfregar sem sabão nem detergente; retirar a água da pré-limpeza sem mandá-la pela rede; reabastecer com a saída bloqueada; dosar cloro livre a 1,0 mg/L; molhar paredes e teto 3 vezes, a cada 30 min; esvaziar, enxaguar, limpar a tampa e coletar amostra de potabilidade.", F(N26, "F.3.1")),
        Item("Desinfecção da distribuição (F.3.2): escoar até a água sair cristalina; cloro livre de no mínimo 1 mg/L; repouso de no mínimo 2 h; escoar e coletar amostra nos pontos mais a jusante.", F(N26, "F.3.2")),
        Item("Desinfecção química da distribuição (F.3.3): cloro de no mínimo 20 mg/L em todo ponto, abrindo do mais próximo ao mais distante; repouso de no mínimo 2 h; escoar e reabastecer; repouso de 12 h; escoar 4 min por ponto; coletar amostra.", F(N26, "F.3.3")),
        Item("Desinfecção térmica (F.3.4): no mínimo 70 °C no ponto mais desfavorável, por 30 min em cada peça, depois coletar amostra. O produto químico segue a NBR 15784; a impermeabilização do reservatório, as NBR 9574 e 9575.", F(N26, "F.3.4"))
      ],
      manutencao: [
        Item("Reservatório, a cada 6 meses: adaptadores firmes e sem vazamento, com a borracha íntegra; torneira de boia fixa e ajustada; regulador de nível ligado e no nível correto; tampa firme, sem trincas.", F("amcx", "30")),
        Item("Pesquisa de vazamento: ramal de entrada — fechar torneiras e ler o hidrômetro, nova leitura após 1 h; instalação alimentada pela caixa — vedar a boia, marcar o nível e conferir após 1 h; reservatório de edifício — marcar o nível com os registros de saída e limpeza fechados e conferir após 2 h; descarga — pó de café na bacia.", F("tigre", "96, 97")),
        Item("Registro de esfera: trocar os anéis de vedação desrosqueando a porca de aperto, e nunca desmontar o registro com a rede cheia de água (a esfera é lançada para fora do corpo).", F("tigre", "97")),
        Item("Reparo localizado em tubo já instalado (furo de prego ou de furadeira): luva de correr, sem desmontar a linha.", F("tigre", "95")),
        Item("Tabela 2 da NBR 5626:2020, periodicidade máxima e profissional — semestral, capacitado: limpeza de reservatórios e da distribuição, estanqueidade (reservatório, distribuição, registros e peças), funcionamento das peças, espaços de tubulação, limpeza de crivos e arejadores, deterioração e oxidação.", F(N26, "8, Tabela 2")),
        Item("Tabela 2 — semestral, qualificado: filtros; válvulas redutoras de pressão (VRP); bombas e pressurizadores. Semestral, habilitado: alívio e segurança à pressão. Semestral, capacitado: simultaneidade das VRP em estação e vasos e tanques de pressão. Anual, qualificado: proteção contra refluxo.", F(N26, "8, Tabela 2")),
        Item("Tabela 2 — temperatura, anual: válvulas termostáticas e limitadores (qualificado); liras e juntas, temperatura das fontes e isolamento (capacitado).", F(N26, "8, Tabela 2")),
        Item("Plano de manutenção do manual: semestral — limpeza do reservatório e da distribuição, estanqueidade, peças, crivos e arejadores, VRP, bombas, filtros; anual — proteção contra refluxo, válvulas termostáticas, limitadores, liras e juntas, isolamento. Registrar cada execução e o profissional (capacitado, qualificado ou habilitado) conforme a Tabela 2.", F(N26, "8, Tabela 2"))
      ],
      uso: [
        Item("Manter o reservatório sempre fechado para preservar a qualidade da água.", F("fxcx", "7")),
        Item("Na limpeza da parede interna da caixa d'água, não usar produtos químicos de limpeza, escovas duras ou abrasivos (a desinfecção com cloro é a do Anexo F, feita à parte).", F("amcx", "30", N26, "F.3.1")),
        Item("Consumo de aparelho maior que o previsto no projeto é responsabilidade do usuário (o memorial declara as vazões de projeto e as máximas nos pontos).", F(N26, "6.7.1.3")),
        Item("Não içar nem empurrar a caixa com água dentro; não apoiar sobre terreno desnivelado, arenoso, base gradeada ou diretamente no solo.", F("fxcx", "4"))
      ]
    },

    agua_quente: {
      nome: "Água quente",
      montagem: [
        Item("Tubulação de água quente isolada termicamente quando embutida, para não transferir calor às áreas vizinhas; sinalizar a rota nas plantas.", F("tigre", "43")),
        Item("Não transpor portas e janelas em forma de sifão: o ar retido prejudica o desempenho quando falta abastecimento.", F("tigre", "45")),
        Item("Dilatação térmica: em trechos aparentes evitar longos trechos retilíneos entre pontos fixos; usar junta de expansão ou liras (U ou S) sempre no plano horizontal, com curvas em vez de joelhos.", F("tigre", "46")),
        Item("Aquecedor, válvulas e dispositivos de proteção: instalar e ensaiar rigorosamente conforme o manual de cada fabricante.", F("tigre", "45"))
      ],
      teste: [
        Item("Estanqueidade com água a no mínimo 80 °C, antes de a tubulação receber isolamento ou ser recoberta; pressão de ensaio a MENOR entre 600 kPa e 1,5 vez a pressão máxima de trabalho, por no mínimo 1 h após estabilizar.", F(N26, "7.3.1", "tigre", "45")),
        Item("Peças de utilização de água quente: pressão estática prevista, por 1 h.", F(N26, "7.3.2"))
      ],
      limpeza: [],
      manutencao: [
        Pend("Plano de manutenção do aquecedor e do reservatório térmico.", "depende do equipamento escolhido; os manuais Rinnai, Komeco, Soletrol e Heliotek estão no acervo, mas o modelo da obra não vem do cálculo — seguir o manual do modelo instalado")
      ],
      uso: [
        Item("Em ambiente sanitário com misturador convencional a água não passa de 70 °C; acima disso exige limitador automático. Ponto de uso corporal que possa passar de 45 °C leva limitador automático para 45 °C. Recomenda-se no máximo 38 °C em ducha higiênica, jardim de infância, clínica e hospital.", F(N26, "6.10.3, 6.10.4.3, 6.10.4.4")),
        Item("A água fria que alimenta aquecedor ou misturador não pode alimentar válvula de descarga (risco de escaldamento); trecho que possa passar de 70 °C é identificado, isolado e protegido; isolamento térmico em toda a extensão da distribuição de água quente.", F(N26, "6.10.4.1, 6.10.2, 6.12.3"))
      ]
    },

    esgoto: {
      nome: "Esgoto sanitário e ventilação",
      montagem: [
        Item("Série normal para ramais e coletores comuns; série reforçada para tubos de queda e subcoletores, que sofrem mais esforço. As duas têm o mesmo diâmetro externo e se encaixam, mas a água de regime não contínuo tem limite de 45 °C na série normal e de 75 °C na reforçada.", F("tigre", "135, 136")),
        Item("Junta elástica: chanfrar a ponta do tubo e aplicar pasta lubrificante no interior da bolsa e na ponta do tubo ou da conexão; nunca aplicar adesivo plástico em junta elástica.", F("tigre", "135, 136, 165")),
        Item("Junta soldável: solução limpadora (preparadora) e adesivo para PVC.", F("tigre", "135, 136")),
        Item("Tubulação embutida: mesmos cuidados da água fria — rasgo sem tensão no tubo, passagem prevista antes da concretagem, fechamento depois do teste.", F("tigre", "42")),
        Item("Ventilação: colunas e ramais de ventilação expulsam os gases e deixam entrar ar, evitando a pressão negativa que suga a água dos sifões; caixas sifonadas, ralos sifonados e sifões formam o fecho hídrico.", F("tigre", "167")),
        Item("Esgoto e águas pluviais são separador absoluto: nenhuma ligação entre os dois sistemas.", F(N81, "4.1.3.1")),
        Item("É proibido ligar ramal de descarga ou de esgoto, por inspeção em joelho ou curva, ao ramal de descarga de bacia sanitária.", F(N81, "4.2.3.5")),
        Item("Pia de cozinha e máquina de lavar louça: tubo de queda especial, com ventilação primária, descarregando em caixa de gordura coletiva; em prédio de vários pavimentos é proibida caixa de gordura individual nos andares.", F(N81, "4.2.4.4, 4.2.6.1")),
        Item("As tubulações aparentes do sistema predial de esgoto sanitário devem ser pintadas conforme a NBR 6493.", F(N81, "seção 6 (Execução)")),
        Pend("Declividades, distâncias máximas de desconector e diâmetros mínimos.", "são os do dimensionamento (HidNormas: es.declividade_minima e demais chaves do esgoto); o manual não os repete para não divergir do cálculo")
      ],
      teste: [
        Item("Todo sistema de esgoto e de ventilação, novo ou alterado, é inspecionado e ensaiado antes de entrar em funcionamento: verificar a fixação e a ausência de material estranho; ensaiar depois da inspeção final e antes de instalar os aparelhos sanitários.", F("tigre", "45", N81, "Anexo G, G.1.1 a G.1.4, p.66")),
        Item("Ensaio com água: tampar todas as aberturas, exceto a mais alta; encher até transbordar; manter cheia por 15 minutos; a pressão estática não deve passar de 6 m.c.a.", F("tigre", "46")),
        Item("Ensaio com ar: tampar todas as entradas e saídas, exceto a de entrada de ar; injetar até 35 kPa (3,5 m.c.a.); manter por 15 minutos sem reintroduzir ar.", F("tigre", "46")),
        /* + checklist do Anexo G (NBR 8160:1999, p.66) montado com os números da tabela es8160.ensaios_recebimento (extraNormas) */
      ],
      limpeza: [],
      manutencao: [
        Item("Caixas de gordura e de inspeção: limpar sem ferramentas de aresta cortante e sem produtos químicos (reagem com o PVC); usar água, sabão neutro, pano, balde e esponja. A frequência da limpeza da caixa de gordura depende da gordura gerada — observar a caixa e ajustar.", F("tigre", "165, 166")),
        Item("Caixa sifonada: retirar a grelha, soltar a porca do antiespuma, lavá-lo em balde com água e reinstalar; no sifão copo, desrosquear o copo e lavar apenas com água, sem produto químico corrosivo.", F("tigre", "166")),
        Item("Reparo de ponto localizado em tubo de esgoto já instalado: abrir só um trecho curto, cortar o trecho danificado e substituir por tubo igual, com duas luvas de correr e pasta lubrificante nos anéis (nunca direto na virola).", F("tigre", "165")),
        Item("Desobstrução (Anexo F): vara ou arame; bomba de borracha; haste flexível a partir de DN 75; martelo pneumático; raspagem a partir de DN 100; método químico somente com cuidado.", F(N81, "Anexo F")),
        Item("Usar equipamento de proteção individual na manutenção; seguir as inspeções periódicas com roteiro e registrar cada serviço na ficha de manutenção.", F(N81, "Anexo F")),
        Pend("Prazo (periodicidade) das inspeções do sistema de esgoto.", "sem prazo na norma (NBR 8160, 4.1.3 e F.4 recomendam inspeção periódica); definir no plano de manutenção (NBR 5674)")
      ],
      uso: [
        Item("O mau cheiro vem de sifão ou ralo sem fecho hídrico ou de ventilação ausente: manter a água nos sifões e as colunas de ventilação desobstruídas.", F("tigre", "167")),
        Item("Não lançar produtos químicos corrosivos na limpeza de sifões e caixas.", F("tigre", "165, 166"))
      ]
    },

    pluvial: {
      nome: "Águas pluviais",
      montagem: [
        Item("Esgoto e águas pluviais são separador absoluto: nenhuma ligação entre os dois sistemas.", F(N81, "4.1.3.1")),
        Item("Tubos e conexões de esgoto série reforçada para os condutores verticais de águas pluviais em obras verticais (o fabricante a declara obrigatória para pluviais).", F("tigre", "136")),
        Item("Condutores aparentes alinhados com prumo; calhas instaladas respeitando o limite de encaixe marcado no corpo (o PVC dilata ao sol); suportes de calha com espaçamento máximo de 60 cm (calhas do fabricante).", F("tigre", "184")),
        Item("Ligação entre condutor vertical e tubulação horizontal com conexão de transição própria, não improvisada.", F("tigre", "185"))
      ],
      teste: [
        Item("Verificar a estanqueidade de todas as juntas das calhas (anel de vedação ausente, torcido, fora de posição ou danificado; encaixe mal executado) e, depois de desobstruir um condutor, conferir com um pouco de água que ela chega à caixa de areia.", F("tigre", "184, 185")),
        Pend("Ensaio de estanqueidade do sistema de águas pluviais segundo a norma.", "o texto da norma de pluviais não consta no acervo")
      ],
      limpeza: [
        Item("Limpar periodicamente o interior das calhas (folhas e sujeira), sem danificar paredes e vedações; verificar a grelha flexível nos bocais; nos condutores aparentes entupidos, desmontar o trecho e lavar; nos embutidos, desentupir com arame ou haste sem danificar o condutor; nas caixas de areia e de inspeção, retirar a sujeira do fundo.", F("tigre", "185"))
      ],
      manutencao: [
        Item("Conferir o espaçamento dos suportes e reapertar os frouxos; conferir o prumo dos condutores aparentes.", F("tigre", "184"))
      ],
      uso: [
        Item("Água de chuva armazenada em cisterna só para fins não potáveis (limpeza de pisos, descarga, irrigação); pontos de consumo identificados como \"água não potável\"; sistema independente do de água potável, sem conexão cruzada; a cisterna não vai sob edificação nem com lençol freático ou tráfego de veículos sem o modelo estrutural.", F("fxcis", "3"))
      ]
    },

    incendio: {
      nome: "Incêndio (hidrantes e chuveiros automáticos)",
      montagem: [
        Item("Antes de instalar, consultar o Corpo de Bombeiros local: instruções técnicas, materiais, métodos e testes obrigatórios variam por estado e por município (informação genérica do fabricante; este manual não afirma que o projeto atende essas regras).", F("tigre", "190, 191")),
        Item("Obter a aprovação do projeto e o auto de vistoria (AVCB/CLCB) depois dos testes e vistorias exigidos.", F("tigre", "191")),
        Item("Lavagem interna da tubulação de hidrantes e mangotinhos antes da aceitação do sistema.", F("nbr13714", "5.10.1"), "hidrantes"),
        Pend("Montagem da tubulação de aço (galvanizado ou preto) para hidrantes e chuveiros: cortes, roscas, soldas, suportes e pintura.", "o acervo não tem manual de montagem do tubo de aço; seguir a norma do tubo e o fabricante")
      ],
      teste: [
        Item("Chuveiros automáticos: ensaio de estanqueidade a 1.380 kPa por 2 h, conforme o item 10.1.2 da NBR 10897 (informado pelo manual do fabricante); observar as legislações locais complementares.", F("tigre", "191"), "chuveiros"),
        Item("Hidrantes e mangotinhos, estanqueidade: pressão igual à MAIOR entre 1,5 vez a pressão máxima de trabalho e 1.500 kPa, por 2 h, sem vazamento. A IT 17 do CBMMG (que prevalece em MG) e a NBR 13714 trazem a mesma regra; vale a mais exigente.", F("it17", "5.18.6 (PDF p.16)", "nbr13714", "Anexo C, C.1.2"), "hidrantes"),
        Item("Hidrantes e mangotinhos, ensaio de funcionamento (aceitação): pressostatos da bomba jockey e da principal, alarmes e partida por gerador; nos 2 pontos mais desfavoráveis, medir com tubo de Pitot, e as pressões nos esguichos e na bomba devem ser iguais ou maiores que as do projeto.", F("nbr13714", "Anexo C, C.1.3 e C.1.3.2"), "hidrantes")
      ],
      limpeza: [],
      manutencao: [
        Item("Chuveiros automáticos (rotina sugerida pelo fabricante): verificação mensal das válvulas de controle; teste hidrostático anual; inspeção visual trimestral dos chuveiros (dano, corrosão, obstrução); limpeza regular de difusores e tubulação.", F("tigre", "204"), "chuveiros"),
        Item("Algumas regulamentações exigem ensaios periódicos obrigatórios, semestrais, anuais ou só na entrega da obra: registrar inspeções e testes para auditoria e renovação do certificado do Corpo de Bombeiros.", F("tigre", "191")),
        Item("Hidrantes e mangotinhos, vistoria: no máximo a cada 3 meses, com o questionário da norma.", F("nbr13714", "Anexo C, C.2"), "hidrantes"),
        Item("Bombas e alarmes: funcionamento quinzenal, por no mínimo 15 min.", F("nbr13714", "Anexo C, nota de C.2.2"), "hidrantes"),
        Item("Plano de manutenção do sistema de hidrantes e mangotinhos com ciclo de no máximo 1 ano.", F("nbr13714", "Anexo C, C.3.1"), "hidrantes"),
        Item("Checklist de vistoria — brigada (C.2.1), relatar: a) número de elementos treinados; b) vigias diurnos; c) vigias noturnos; d) bombeiro(s) profissional(ais); e) data do último exercício; f) número de operários residentes próximos ao risco.", F("nbr13714", "Anexo C, C.2.1"), "hidrantes"),
        Item("Checklist de vistoria — instalação (C.2.2), responder: a) hidrantes e mangotinhos desobstruídos e sinalizados? b) válvulas funcionam? c) engates em condições? d) válvulas de controle seccional abertas? e) válvulas angulares e de abertura rápida fechadas? f) mangueiras acondicionadas e prontas? g) mangueiras e pertences nos abrigos? h) esguichos reguláveis do tipo 1 acoplados? i) abrigos secos e desobstruídos? j) nível da água no máximo? l) cavalete de automatização em condições? m) automatização conforme especificado? Nota: bombas, acessórios e alarmes em funcionamento quinzenalmente, por no mínimo 15 min (os alarmes sonoros podem ser bloqueados depois de ativados).", F("nbr13714", "Anexo C, C.2.2"), "hidrantes"),
        Item("Plano de manutenção (C.3.2), garantir que: a) válvulas angulares e de abertura rápida abram totalmente e, ao fechar, tenham a vedação verificada (corrosão do corpo); b) válvulas seccionais sejam manobradas sem anormalidade nem vazamento (corpo, castelo, juntas); c) mangueiras sejam inspecionadas, mantidas e acondicionadas conforme a NBR 12779; d) esguichos sejam usados e a manobra verificada; e) abrigos íntegros; f) tubulações pintadas, sem dano, incluindo suportes; g) sinalização conforme especificado; h) dispositivos de controle de pressão verificados; i) instrumentos e medidores verificados; j) interligações elétricas inspecionadas e limpas (oxidação); l) gaxetas de motores e bombas verificadas, reguladas ou substituídas, com lubrificação conforme o fabricante; m) quadros de comando e alarme inspecionados.", F("nbr13714", "Anexo C, C.3.2"), "hidrantes"),
        Pend("Periodicidade de manutenção própria da IT 17.", "a IT 17 carregada na base não traz periodicidade de manutenção; vale a da NBR 13714 como conferência, exemplar próprio pendente")
      ],
      uso: [
        Pend("Instruções ao usuário (sinalização, acesso livre aos hidrantes, treinamento de brigada).", "conforme a IT do Corpo de Bombeiros local — fora do acervo")
      ]
    },

    tratamento_fossa: {
      nome: "Tratamento de esgoto — fossa, filtro anaeróbio, sumidouro e vala",
      montagem: [
        Item("Fossa séptica totalmente enterrada, só a tampa para fora; com tráfego de veículos leves, laje de fechamento com tampa de inspeção, definida pelo responsável técnico.", F("fxfossa", "19")),
        Item("O esgoto da cozinha entra na fossa somente depois de passar por pelo menos uma caixa de gordura.", F("fxfossa", "19")),
        Item("Tubo de descarte de lodo sem curva, redução ou mudança de inclinação (pontos de entupimento, pois o lodo é pastoso).", F("fxfossa", "19")),
        Item("Leito de secagem: escavação de 0,8 m de altura (1 m sob tráfego, com laje); aterro com mistura de cimento e terra peneirada no traço 1:10, compactado em camadas de 25 cm.", F("fxfossa", "17")),
        Pend("Sumidouro, vala de infiltração, filtro anaeróbio e ETE: sequência de montagem.", "o manual Fortlev da vala de infiltração está no acervo mas ainda não foi extraído para este manual; norma de projeto e execução fora do acervo")
      ],
      teste: [
        Pend("Teste de estanqueidade das unidades de tratamento.", "o manual da fossa não traz o procedimento; norma fora do acervo")
      ],
      limpeza: [
        Item("Extração do lodo a cada 6 meses (ou com a fossa saturada): abrir o registro de descarga para o leito de secagem, esperar o lodo escuro sair e fechar quando voltar a sair água de cor bege; neutralizar o lodo no leito de secagem conforme o manual; sem leito, usar caminhão limpa-fossa pelo tubo guia.", F("fxfossa", "14, 19")),
        Item("Destino do lodo: se não for usado na agricultura, enviar a aterro; o destino do efluente tratado é definido pelo órgão ambiental municipal ou estadual.", F("fxfossa", "14, 19"))
      ],
      manutencao: [
        Item("Manutenção resume-se à extração do lodo, a cada 6 meses.", F("fxfossa", "14"))
      ],
      uso: [
        Item("Não lançar produtos de limpeza nem desinfetantes diretamente no sistema: prejudicam o processo biológico.", F("fxfossa", "15, 19"))
      ]
    },

    tratamento_ete: {
      nome: "Tratamento de esgoto — ETE (reator UASB e pós-tratamento)",
      montagem: [Pend("Montagem, partida e operação da ETE (preliminar, reator UASB, pós-tratamento, desinfecção).", "o acervo não tem manual de ETE; a fossa séptica Fortlev não se aplica a este tipo de unidade")],
      teste: [Pend("Teste de estanqueidade e de partida da ETE.", "sem fonte no acervo")],
      limpeza: [Pend("Descarte e manejo do lodo da ETE.", "sem fonte no acervo")],
      manutencao: [Pend("Manutenção e monitoramento da ETE.", "sem fonte no acervo")],
      uso: [Pend("Instruções de operação da ETE.", "sem fonte no acervo")]
    },
    tratamento_eta: {
      nome: "Tratamento de água — ETA (floculador, decantador, filtros)",
      montagem: [Pend("Montagem e operação da ETA (mistura rápida, floculação, decantação, filtração, desinfecção).", "o acervo não tem manual de ETA; a fossa séptica Fortlev não se aplica a este tipo de unidade")],
      teste: [Pend("Teste de estanqueidade e de partida da ETA.", "sem fonte no acervo")],
      limpeza: [Pend("Lavagem dos filtros, descarte de lodo e desinfecção.", "sem fonte no acervo")],
      manutencao: [Pend("Manutenção e controle de qualidade da água tratada.", "sem fonte no acervo")],
      uso: [Pend("Instruções de operação da ETA.", "sem fonte no acervo")]
    },
    tratamento_outro: {
      nome: "Tratamento — tipo de unidade não identificado no resultado",
      montagem: [Pend("Montagem das unidades de tratamento.", "o resultado não diz se é fossa, ETE ou ETA; o manual não escolhe por ele")],
      teste: [Pend("Teste das unidades de tratamento.", "tipo de unidade não identificado")],
      limpeza: [], manutencao: [Pend("Manutenção das unidades de tratamento.", "tipo de unidade não identificado")], uso: []
    },
    industrial: {
      nome: "Fluidos industriais",
      montagem: [
        Pend("Montagem de rede de ar comprimido, vapor, condensado, óleo térmico, água gelada ou gás.", "o acervo não tem manual nem norma de montagem de tubulação industrial; seguir as normas do fluido (ASME B31 / ABNT) e o fabricante do tubo e dos acessórios")
      ],
      teste: [Pend("Teste de pressão da rede industrial.", "sem fonte no acervo")],
      limpeza: [],
      manutencao: [Pend("Manutenção periódica da rede industrial.", "sem fonte no acervo")],
      uso: [Pend("Instruções de operação da rede.", "sem fonte no acervo")]
    },

    climatizacao: {
      nome: "Climatização (split, frigorígeno e dreno)",
      montagem: [
        Item("Compatibilizar a capacidade do aparelho com o ambiente antes de instalar, de preferência por cálculo de carga térmica pela NBR 5858 (indicação do fabricante).", F("elgin", "4")),
        Item("Fixar as tubulações de interligação com suportes; isolar cada linha separadamente com borracha tubular (neoprene) e fita de acabamento; o tubo de dreno vai protegido abaixo dos tubos de conexão; usar \"loops\" ou tubo flexível para evitar ruído de vibração.", F("midea", "12, 17, 21")),
        Item("Brasagem com nitrogênio circulando, para impedir cavacos e óxido na tubulação; limpar a tubulação do sistema circulando nitrogênio antes do vácuo; raio de dobra mínimo e espessura de parede conforme o manual do modelo (o modelo citado: 100 mm e 0,80 mm).", F("midea", "17, 21")),
        Item("Dreno por gravidade com declividade contínua e sem sifão logo na saída da evaporadora; o fabricante orienta lançar o dreno na rede pluvial e não na de esgoto — conferir com o projeto de esgoto da obra.", F("midea", "12")),
        Item("Instalação por empresa qualificada, com preenchimento do controle técnico de instalação do fabricante; alimentação elétrica e aterramento dimensionados pela NBR 5410, por profissional qualificado.", F("elgin", "4"))
      ],
      teste: [
        Item("Teste de vazamento com nitrogênio seco e regulador de pressão, antes de abrir as válvulas de serviço; verificar soldas e conexões; jamais usar chama, oxigênio, acetileno ou o fluido refrigerante da condensadora.", F("midea", "5, 21", "elgin", "19")),
        Item("Pressão de teste do modelo — Midea All Easy: máximo 3.792 kPa (550 psig); Elgin HJFC/HJQC: 1,38 MPa (200 psi). Vale a do manual do modelo instalado.", F("midea", "21", "elgin", "19")),
        Item("Vácuo, com as válvulas de serviço fechadas e vacuômetro: faixa de 33,3 a 66,7 Pa; estabilizar no mínimo 20 min; pressão estabilizada perto de 93,3 Pa indica umidade (quebrar o vácuo com nitrogênio e repetir); pressão que continua subindo indica vazamento. Nunca usar o compressor da unidade para fazer vácuo.", F("midea", "21, 22")),
        Item("Carga: acima do comprimento de fábrica, adicionar refrigerante por metro conforme a tabela do modelo, pesando em balança; recolher o fluido só com bomba recolhedora.", F("midea", "23"))
      ],
      limpeza: [],
      manutencao: [
        Item("Plano preventivo sugerido pelo fabricante — mensal: limpar grade e filtros de ar, limpar a parte externa da condensadora, verificar a drenagem, eliminar pontos de condensação no isolamento, conferir corrente elétrica; trimestral: limpar a ventoinha e as bandejas de drenagem, verificar serpentinas e filtros; semestral: testar capacitores, verificar vazamento de refrigerante, medir tensão, corrente, temperaturas de insuflamento e retorno e pressão de sucção; anual: limpar e higienizar evaporador e bandeja, medir isolação elétrica do compressor e do motor, substituir isolamentos danificados. Preencher relatório com cópia ao cliente.", F("elgin", "24")),
        Item("O fabricante exige manutenção preventiva mensal, trimestral, semestral e anual, preferencialmente pelo posto autorizado, sob pena de perda da garantia.", F("elgin", "22")),
        Pend("PMOC — Plano de Manutenção, Operação e Controle (Lei 13.589/2018): alcance, responsável técnico e ART, periodicidades e parâmetros de qualidade do ar interior.", "o texto da lei e o do regulamento técnico não constam no acervo; a lei trata de ambientes climatizados de uso público e coletivo; conferir o enquadramento da obra")
      ],
      uso: [
        Item("Orientar o cliente sobre o uso do aparelho e do controle remoto e sobre a limpeza dos filtros de ar.", F("elgin", "22")),
        Item("Avaliação parcial do rendimento: com o aparelho em velocidade média, o diferencial entre a temperatura de retorno e a de insuflamento deve ficar entre 10 e 15 °C (medir com termômetro de ao menos 4 sensores e tirar a média).", F("elgin", "22"))
      ]
    }
  };

  /* cuidados de instalação POR MATERIAL (ids do js/biminst.js) */
  var MATERIAL = {
    pvc_soldavel: { nome: "PVC soldável (marrom)", itens: [
      Item("Junta soldável com solução preparadora e adesivo plástico próprios; consumo por junta conforme o DN (tabela do fabricante); a partir de DN 60 nas linhas soldável e PBS, usar o adesivo CPVC (vermelho) no lugar do adesivo plástico comum.", F("tigre", "90, 91, 92")),
      Item("Depois de soldar, aguardar a cura do adesivo antes de pressurizar; em caso de vazamento, refazer o trecho e aguardar novo período de cura.", F("tigre", "96")),
      Pend("Tempo mínimo de cura do adesivo antes do teste.", "depende da ficha do adesivo (\"Adesivos\" do fabricante), que não está no acervo")
    ] },
    ppr: { nome: "PPR (polipropileno)", itens: [
      Item("Termofusão: limpar o termofusor com álcool; cortar o tubo perpendicularmente com a tesoura da bitola e eliminar as rebarbas; limpar ponta e bolsa; marcar no tubo a profundidade da bolsa; com o termofusor a 260 °C (leva 5 a 7 min para atingir), introduzir tubo e conexão ao mesmo tempo nos bocais, retirar juntos após o tempo da bitola e encaixar de imediato, dentro do intervalo de acoplamento.", F("ppr", "4, 5")),
      Item("Tempos por DN (aquecimento / intervalo / resfriamento): DN 20 — 5 s / 4 s / 2 min; 25 — 7 s / 4 s / 2 min; 32 — 8 s / 6 s / 4 min; 40 — 12 s / 6 s / 4 min; 50 — 18 s / 6 s / 4 min; 63 — 24 s / 8 s / 6 min; 75 — 30 s / 8 s / 6 min; 90 — 40 s / 8 s / 6 min; 110 — 50 s / 10 s / 8 min. Profundidade da bolsa: 15,0 · 16,5 · 18,5 · 21,0 · 24,0 · 28,0 · 31,5 · 36,0 · 42,0 mm, respectivamente.", F("ppr", "4, 5")),
      Item("A água pode ser liberada logo após a termofusão da última junta do trecho, sem tempo de cura. Circular água para tirar rebarbas e liberar lentamente para eliminar o ar antes do teste de pressão.", F("ppr", "5")),
      Item("Junta roscável: fita veda-rosca no sentido horário; evitar travas químicas, que podem causar fissuras por tensão (stress cracking). Empilhar os tubos até 1,0 m, ao abrigo do sol e da chuva.", F("ppr", "5"))
    ] },
    cpvc: { nome: "CPVC", itens: [
      Item("Junta soldável: cortar o tubo perpendicularmente, remover rebarbas e fazer leve chanfro de aproximadamente 10° a 15°; limpar tubo e bolsa; marcar a profundidade da bolsa; conferir a interferência (a ponta deve ocupar de 1/3 a 2/3 do comprimento de soldagem).", F("cpvc", "4, 5")),
      Item("DN 15 a 54: adesivo CPVC em camada uniforme na ponta do tubo e na bolsa (consumo médio por junta: DN 15 — 2,0 g; 22 — 3,0; 28 — 4,0; 35 — 4,5; 42 — 5,0; 54 — 5,5); encaixar até o fundo, dar 1/4 de volta e pressionar cerca de 30 s; limpar o excesso; deve ficar um cordão de solda completo — interrompido, refazer a junta. Conferir a validade do adesivo.", F("cpvc", "4, 5"))
    ] },
    pvc_esgoto: { nome: "PVC esgoto série normal", itens: [
      Item("Série normal: água de regime não contínuo até 45 °C; juntas elásticas com pasta lubrificante, soldáveis com solução limpadora e adesivo.", F("tigre", "135"))
    ] },
    pvc_serie_r: { nome: "PVC série reforçada (R)", itens: [
      Item("Série reforçada: água de regime não contínuo até 75 °C; juntas elásticas com a ponta chanfrada e pasta lubrificante em ambas as extremidades.", F("tigre", "136"))
    ] },
    cobre_frigorigeno: { nome: "Cobre para refrigeração", itens: [
      Item("Brasagem com nitrogênio; raio de dobra e espessura de parede conforme o manual do modelo; isolar cada linha separadamente (a linha frigorígena é sempre isolada).", F("midea", "17, 21"))
    ] }
  };
  var MATERIAL_SEM_FONTE = "o acervo não tem manual de montagem deste tubo";

  /* sistemas do HidDimensionar → chave do MANUAL */
  var CHAVE = { agua_fria: "agua_fria", agua_quente: "agua_quente", esgoto: "esgoto", pluvial: "pluvial", incendio: "incendio", tratamento: "tratamento", industrial: "industrial" };
  var ORDEM = ["agua_fria", "agua_quente", "esgoto", "pluvial", "incendio", "tratamento", "industrial", "climatizacao"];
  var CHAVE_TRAT = { fossa: "tratamento_fossa", ete: "tratamento_ete", eta: "tratamento_eta", outro: "tratamento_outro" };
  var SEC = [["montagem", "Sequência de montagem"], ["materiais", "Cuidados de instalação por material"], ["teste", "Teste de estanqueidade e de pressão"],
             ["limpeza", "Limpeza e desinfecção"], ["manutencao", "Manutenção periódica"], ["uso", "Uso correto"]];

  /* tipo de unidade de tratamento realmente presente: pelo campo do resultado, senão pelos tipos das unidades (J8) */
  function tipoTratamento(t) {
    var d = txt(t.tipo || t.sistema).toLowerCase();
    if (d === "fossa" || d === "ete" || d === "eta") return d;
    var us = arr(t.unidades).map(function (u) { return txt(u && u.tipo); });
    function tem(x) { return us.indexOf(x) >= 0; }
    if (tem("uasb") || tem("preliminar") || tem("pos_tratamento")) return "ete";
    if (tem("mistura_rapida") || tem("floculador") || tem("decantador") || tem("filtro_rapido")) return "eta";
    if (tem("tanque_septico") || tem("filtro_anaerobio") || tem("sumidouro") || tem("vala")) return "fossa";
    return "outro";
  }

  /* --------------------------------------------------- sistemas presentes */
  function presentes(resultado, opcoes) {
    var r = resultado && typeof resultado === "object" ? resultado : {}, S = r.sistemas && typeof r.sistemas === "object" ? r.sistemas : {}, out = [];
    ORDEM.forEach(function (k) {
      if (k === "climatizacao") { if ((opcoes && opcoes.clima) || r.clima || S.climatizacao) out.push(k); return; }
      if (S[k] && typeof S[k] === "object") out.push(k === "tratamento" ? CHAVE_TRAT[tipoTratamento(S[k])] : k);
    });
    return out;
  }
  /* material de cada sistema: o escolhido pelo projeto (opcoes.materiais), senão o padrão do biminst */
  function materiaisDe(sis, opcoes) {
    var BI = dep("BimInst", "biminst.js"), SS = BI ? BI.SISTEMAS : {}, esc2 = (opcoes && opcoes.materiais) || {}, out = [], v = {};
    var mapa = { agua_fria: ["agua_fria"], agua_quente: ["agua_quente"], esgoto: ["esgoto", "ventilacao"], pluvial: ["pluvial"], incendio: ["incendio"], industrial: ["industrial"], climatizacao: ["frigorigeno", "dreno"] };
    arr(mapa[sis]).forEach(function (s) {
      var m = esc2[s] || (SS[s] && SS[s].material) || null;
      if (m && !v[m]) { v[m] = 1; out.push({ sistema: s, material: m }); }
    });
    return out;
  }

  /* ------------------------------------------------------------ HTML */
  var COR = { azul: "#00406A", falha: "#a3352b", cinza: "#555", areia: "#A89868" };
  function fonteTxt(f) {
    return arr(f).map(function (x) {
      var F2 = FONTES[x.id];
      return esc(F2 ? F2.doc : x.id) + (x.pag ? (/^(nbr|it17)/.test(x.id) ? (/^(seção|anexo|tabela|figura)/i.test(txt(x.pag)) ? ", " : ", item ") : ", p. ") + esc(x.pag) : "");
    }).join("; ");
  }
  function itemHtml(it, cx) {
    if (it.pend) {
      cx.pend.push({ texto: it.t, motivo: it.pend });
      return '<li style="color:' + COR.falha + '"><b>PENDENTE</b> — ' + esc(it.t) + ' <i>(' + esc(it.pend) + ")</i></li>";
    }
    arr(it.f).forEach(function (x) { cx.fontes[x.id] = 1; });
    return "<li>" + esc(it.t) + (arr(it.f).length ? ' <span style="color:' + COR.cinza + ';font-size:.85em">[' + fonteTxt(it.f) + "]</span>" : "") + "</li>";
  }
  function listaHtml(itens0, cx, cond) { var itens = arr(itens0).filter(function (i) { return !i.se || (cond && cond[i.se]); }); return itens.length ? "<ul>" + itens.map(function (i) { return itemHtml(i, cx); }).join("") + "</ul>" : "<p><i>Não se aplica a este sistema.</i></p>"; }

  /* CHECKLIST dos ensaios de recebimento do esgoto — NBR 8160:1999, Anexo G (normativo), p.66: pressão e duração vêm da
     tabela es8160.ensaios_recebimento do HidNormas (nenhum número digitado aqui); o texto só dá a forma de cada ensaio */
  var ENSAIO_ES = {
    agua: function (l, v) { return "☐ Ensaio com água (" + l.item + "), depois da inspeção final e antes de instalar os aparelhos (em alternativa ao ensaio com ar): " + l.procedimento + "; manter por " + v.dur + " min, com " + l.pressao_regra + " " + v.p + " kPa. Critério: " + l.criterio + "."; },
    ar: function (l, v) { return "☐ Ensaio com ar (" + l.item + "), depois da inspeção final e antes de instalar os aparelhos (em alternativa ao ensaio com água): " + l.procedimento + "; " + l.pressao_regra + " " + v.p + " kPa por " + v.dur + " min, sem reposição de ar. Critério: " + l.criterio + "."; },
    fumaca: function (l, v) { return "☐ Ensaio final com fumaça (" + l.item + "), depois de instalados os aparelhos: fechos hídricos cheios — " + l.procedimento + "; " + l.pressao_regra + " " + v.p + " kPa por " + v.dur + " min. Critério: " + l.criterio + "."; }
  };
  function fxBr(v) { return txt(v).replace(".", ","); }
  function ensaiosEsgoto(opcoes) {
    var N = (opcoes && opcoes.normas) || dep("HidNormas", "hidnormas.js"), linhas = [], t = null;
    try { if (N && N.linhas) linhas = arr(N.linhas("es8160.ensaios_recebimento")); if (N && N.tabela) t = N.tabela("es8160.ensaios_recebimento"); } catch (e) { linhas = []; }
    if (!linhas.length) { return [Pend("Ensaios de recebimento do esgoto (NBR 8160, Anexo G).", "a tabela es8160.ensaios_recebimento não carregou do HidNormas")]; }
    var pg = t && t.fonte ? (/p\.\s*\d+/.exec(txt(t.fonte.pagina)) || [""])[0] : "";
    return linhas.filter(function (l) { return ENSAIO_ES[l.ensaio]; }).map(function (l) {
      return Item(ENSAIO_ES[l.ensaio](l, { p: fxBr(l.pressao_kPa), dur: fxBr(l.duracao_min) }), F(N81, "Anexo G, " + l.item + (pg ? ", " + pg : "")));
    });
  }

  /* itens extras vindos do HidNormas (frequência de manutenção do aproveitamento de água de chuva) */
  function extraNormas(sis, opcoes) {
    if (sis !== "pluvial") return [];
    var N = (opcoes && opcoes.normas) || dep("HidNormas", "hidnormas.js"), linhas = [], t = null;
    try { if (N && N.linhas) linhas = arr(N.linhas("ch.frequencia_manutencao")); if (N && N.tabela) t = N.tabela("ch.frequencia_manutencao"); } catch (e) { linhas = []; }
    if (!linhas.length) return [Pend("Frequência de manutenção do sistema de aproveitamento de água de chuva.", "a tabela ch.frequencia_manutencao não carregou do HidNormas")];
    var ref = t ? txt(t.norma) + (t.edicao ? ":" + txt(t.edicao) : "") : "";
    var tipo = t && t.fonte && t.fonte.tipo ? txt(t.fonte.tipo) : "";
    return [Item("Se houver aproveitamento de água de chuva (tabela do HidNormas" + (ref ? ", " + ref : "") + (tipo ? ", fonte " + tipo : "") + "): " +
      linhas.map(function (l) { return txt(l.componente) + " — " + txt(l.frequencia); }).join("; ") + ".", F("hidnormas", "ch.frequencia_manutencao"))];
  }

  function gerar(resultado, opcoes) {
    opcoes = opcoes || {};
    var sis = presentes(resultado, opcoes), cx = { pend: [], fontes: {} }, avisos = [];
    var RS = resultado && resultado.sistemas ? resultado.sistemas : {}, ch = RS.incendio && RS.incendio.chuveiros;
    var cond = { chuveiros: !!(ch && ch.exigido === true), hidrantes: !!(RS.incendio && RS.incendio.hidrantes && RS.incendio.hidrantes.exigido === true) };
    var conforme = !!(resultado && resultado.ok === true);
    if (!sis.length) return { ok: false, titulo: "Manual de execução e uso", html: "", sistemas: [], pendencias: [], fontes: [], avisos: ["sem sistema no resultado: não há manual a gerar"] };
    var obra = opcoes.obra || {}, doc = opcoes.documento || {}, resp = opcoes.responsavel || {};
    function ph(v, rot) { return v ? esc(v) : '<span style="color:' + COR.falha + '">[' + esc(rot) + "]</span>"; }
    var h = '<article style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.45;max-width:900px;margin:0 auto">';
    h += '<h1 style="color:' + COR.azul + ';border-bottom:3px solid ' + COR.areia + '">Manual de execução e de uso — instalações hidrossanitárias e climatização</h1>';
    h += "<p><b>Obra:</b> " + ph(obra.nome, "OBRA") + " · <b>Endereço:</b> " + ph(obra.endereco, "ENDEREÇO") + " · <b>Documento:</b> " + ph(doc.numero, "Nº DO DOCUMENTO") +
         " · <b>Revisão:</b> " + ph(doc.revisao, "REV") + " · <b>Data:</b> " + ph(doc.data, "DATA") + "<br><b>Responsável técnico:</b> " + ph(resp.nome, "RESPONSÁVEL TÉCNICO") + " · <b>CREA/CAU:</b> " + ph(resp.crea, "REGISTRO") + "</p>";
    h += '<p style="font-size:.9em;color:' + COR.cinza + '">Cada instrução cita o documento e a página de onde veio. Instrução de <b>fabricante</b> vale para o produto dele e não substitui a norma; ' +
         'o que o acervo não cobre aparece em vermelho como <b style="color:' + COR.falha + '">PENDENTE</b>, com o motivo. Nenhum valor de norma é digitado neste manual.</p>';
    if (!conforme) h += '<p style="color:' + COR.falha + '"><b>Situação do cálculo: não concluído como "atende"</b> (pendência ou reprovação no resultado). Este manual traz procedimentos de execução e de uso; <b>não afirma conformidade</b> do projeto com norma nem com o Corpo de Bombeiros.</p>';
    if (RS.incendio && !cond.chuveiros) h += "<p><i>Chuveiros automáticos: não exigidos pelo cálculo deste resultado; as instruções de chuveiros foram omitidas.</i></p>";
    h += "<h2>Sistemas deste manual</h2><ul>" + sis.map(function (k) { return "<li>" + esc(MANUAL[k].nome) + "</li>"; }).join("") + "</ul>";
    sis.forEach(function (k, idx) {
      var M = MANUAL[k];
      h += '<section><h2 style="color:' + COR.azul + '">' + (idx + 1) + ". " + esc(M.nome) + "</h2>";
      SEC.forEach(function (s) {
        h += "<h3>" + esc(s[1]) + "</h3>";
        if (s[0] === "materiais") {
          var ms = materiaisDe(k, opcoes), algum = false;
          ms.forEach(function (m) {
            var B = MATERIAL[m.material];
            h += "<p><b>" + esc(B ? B.nome : m.material) + "</b> <span style=\"color:" + COR.cinza + '">(sistema ' + esc(m.sistema) + ")</span></p>";
            if (B) h += listaHtml(B.itens, cx, cond);
            else h += listaHtml([Pend("Montagem do tubo " + m.material + ".", MATERIAL_SEM_FONTE)], cx, cond);
            algum = true;
          });
          if (!algum) h += "<p><i>Sem material definido.</i></p>";
          return;
        }
        var itens = M[s[0]] || [];
        if (s[0] === "manutencao") itens = itens.concat(extraNormas(k, opcoes));
        if (s[0] === "teste" && k === "esgoto") itens = itens.concat(ensaiosEsgoto(opcoes));
        h += listaHtml(itens, cx, cond);
      });
      h += "</section>";
    });
    /* PEÇA COMPLETA (17/10/2026): as peças do modelo com o ícone renderizado e a ficha técnica (js/hidpecas.js) —
       opcoes.pecas = HidPecas.listaMaterial(...), opcoes.icones = { nome: data URL }. Sem lista, a seção não sai. */
    var PCm = dep("HidPecas", "./hidpecas.js");
    if (arr(opcoes && opcoes.pecas).length && PCm && PCm.htmlCatalogo) h += "<h2>Peças especificadas</h2><p>Cada peça com a imagem da própria geometria do modelo, o código do fabricante, a composição SINAPI e a norma do produto (quando o catálogo a imprime).</p>" +
      "<style>.catalogo-man td,.catalogo-man th{border-bottom:1px solid #d6dde4;padding:4px 6px;font-size:.88em;vertical-align:middle}.catalogo-man img.peca-ico{width:56px;height:56px;object-fit:contain}.catalogo-man .pend{color:#9a5b12}</style>" +
      PCm.htmlCatalogo(opcoes.pecas, opcoes.icones, { classe: "catalogo-man", lado: 56 });   // hid:ok lado do ícone em px (apresentação)
    var usadas = Object.keys(cx.fontes);
    h += "<h2>Fontes consultadas</h2><table style=\"border-collapse:collapse;font-size:.9em\"><tr><th style=\"text-align:left;border-bottom:1px solid #999\">Documento</th><th style=\"text-align:left;border-bottom:1px solid #999\">Tipo</th><th style=\"text-align:left;border-bottom:1px solid #999\">Arquivo</th></tr>" +
      usadas.map(function (id) { var f = FONTES[id]; return "<tr><td style=\"padding:2px 8px\">" + esc(f.doc) + "</td><td style=\"padding:2px 8px\">" + esc(f.tipo) + "</td><td style=\"padding:2px 8px\">" + esc(f.arq) + "</td></tr>"; }).join("") + "</table>";
    h += '<h2 style="color:' + COR.falha + '">Pendências (' + cx.pend.length + ")</h2>" + (cx.pend.length ? "<ol>" + cx.pend.map(function (p) { return "<li>" + esc(p.texto) + " <i>(" + esc(p.motivo) + ")</i></li>"; }).join("") + "</ol>" : "<p>Nenhuma.</p>");
    h += "</article>";
    if (/\b(undefined|NaN|null)\b/.test(h.replace(/<[^>]+>/g, " "))) avisos.push("o texto gerado tem valor indefinido: defeito do manual");
    return { ok: true, titulo: "Manual de execução e de uso", html: h, sistemas: sis.slice(), pendencias: cx.pend, fontes: usadas, avisos: avisos };
  }
  function html(resultado, opcoes) { return gerar(resultado, opcoes).html; }

  /* =====================================================================
   * MANUAL COMPLETO (tela "Gerar documentos", 17-18/10/2026). Pedido do Rogério: "a parte que vai gerar o manual
   * para execução, quero que tenha link, que tenha tudo". O js/hiddocumentos.js monta o documento (capa, sumário,
   * links para as pranchas, material com ícone, checklists com assinatura, uso e manutenção, garantia); aqui ficam o
   * CONTEÚDO com fonte e a função partes(), que devolve o mesmo conteúdo do gerar() em estrutura, sem HTML.
   * As páginas abaixo foram conferidas no PDF em 18/10/2026 (texto extraído página a página):
   *   Tigre 2025 p.105 (CPVC sem ferramenta, só adesivo), p.108 (termofusor, 260 °C), p.135-136 (pasta lubrificante,
   *   ponta chanfrada, solução e adesivo), p.157-158 (consumo de adesivo e de pasta), p.165 (limpeza das caixas;
   *   nunca adesivo na junta elástica), p.166-167 (caixa sifonada e ralo articulado; mau cheiro);
   *   Midea All Easy p.7 (ferramentas para a instalação), p.19 (rebarbar e tampar o tubo);
   *   Fortlev fossa p.7 e p.15 (o que não lançar na fossa).
   * ===================================================================== */
  var FERRAMENTAS = {
    agua_fria: [
      Item("Juntas soldáveis: solução limpadora (preparadora) e adesivo para PVC, da mesma linha do tubo.", F("tigre", "135, 136")),
      Item("Quantidade de adesivo e de solução preparadora por bitola: tabela de consumo do fabricante, pela contagem de juntas da obra.", F("tigre", "157"))
    ],
    agua_quente: [
      Item("PPR: termofusor com as matrizes da bitola, aquecido ao ponto de fusão do material (260 °C); ler o manual do termofusor antes de usar.", F("tigre", "108")),
      Item("CPVC: união com o adesivo da linha, sem ferramenta de solda.", F("tigre", "105"))
    ],
    esgoto: [
      Item("Junta elástica: pasta lubrificante no interior da bolsa e na ponta do tubo, com a ponta chanfrada. Junta soldável: solução limpadora e adesivo para PVC.", F("tigre", "135, 136")),
      Item("Quantidade de pasta lubrificante por junta e por diâmetro: tabela de consumo do fabricante.", F("tigre", "158")),
      Item("Nunca aplicar adesivo na junta elástica nem pasta lubrificante direto na virola: o anel se desloca ao entrar a ponta e a junta vaza.", F("tigre", "165"))
    ],
    pluvial: [Pend("Ferramentas e insumos da rede pluvial.", "o acervo não lista ferramentas próprias da rede pluvial; seguir as do material escolhido (seção de cuidados por material)")],
    incendio: [Pend("Ferramentas da rede de incêndio em aço.", "o acervo não tem manual de montagem do tubo de aço")],
    tratamento_fossa: [Pend("Ferramentas da instalação da fossa, do filtro e do sumidouro.", "o manual do fabricante não traz a lista de ferramentas")],
    tratamento_ete: [Pend("Ferramentas da ETE.", "sem fonte no acervo")],
    tratamento_eta: [Pend("Ferramentas da ETA.", "sem fonte no acervo")],
    tratamento_outro: [],
    industrial: [Pend("Ferramentas da rede industrial.", "sem fonte no acervo")],
    climatizacao: [
      Item("Ferramentas indicadas pelo fabricante: bomba de vácuo, conjunto manifold, cortador e curvador de tubos, flangeador, torquímetro, chaves Phillips, de fenda, Allen, de porca (duas) e de bornes, multímetro ou alicate amperímetro, vacuômetro, serra-copo para alvenaria e serra de metal, parafusadeira, furadeira e brocas, régua de nível, fitas isolante, veda-rosca e vinílica, trena, alicates, talhadeira e martelo, óleo refrigerante, maçarico (máquinas grandes), cilindro de refrigerante e cilindro de nitrogênio com regulador.", F("midea", "7")),
      Item("Depois de cortar o tubo de cobre, rebarbar as pontas com a ferramenta própria (rebarba no circuito danifica o compressor) e tampar o tubo flangeado até a ligação.", F("midea", "19"))
    ]
  };
  /* uso e manutenção pelo PROPRIETÁRIO, além do uso/limpeza/manutenção de cada sistema */
  var PROPRIETARIO = {
    esgoto: [
      Item("Caixas de gordura e de inspeção: limpar sem ferramenta de aresta cortante e sem produto químico (reage com o PVC); usar só água, sabão neutro, pano, balde e esponja.", F("tigre", "165")),
      Item("Caixa sifonada: bem instalada, não exige manutenção corretiva; no entupimento, retirar a grelha, a cesta de limpeza e o sifão e limpar à mão. Ralo com saída articulada: retirar a grelha e a cesta pela lingueta e lavar com água.", F("tigre", "166, 167")),
      Item("Mau cheiro: caixas e ralos sifonados e sifões guardam um volume de água (fecho hídrico) que barra os gases; a ventilação do esgoto expulsa os gases e evita o vácuo que esvazia os sifões. Não retirar sifões nem tampar a ventilação.", F("tigre", "167"))
    ],
    tratamento_fossa: [
      Item("Não lançar restos de alimentos na fossa; o esgoto da cozinha passa antes pela caixa de gordura.", F("fxfossa", "7, 15")),
      Item("Não jogar no vaso sanitário material não degradável, como absorventes e embalagens plásticas; evitar lançar produtos de limpeza e desinfetantes, que prejudicam o tratamento; não usar desinfetante, detergente ou desodorizador nos vasos sanitários.", F("fxfossa", "15")),
      Item("Não lançar na fossa nenhum produto químico ou biológico: para o tratamento começar basta o esgoto.", F("fxfossa", "7"))
    ]
  };

  function itemDados(it) {
    if (it.pend) return { texto: it.t, pend: it.pend, fontes: [] };
    return { texto: it.t, fontes: arr(it.f).map(function (x) { var F2 = FONTES[x.id] || {}; return { id: x.id, doc: F2.doc || x.id, pag: x.pag, tipo: F2.tipo || "", url: F2.url || "", ref: fonteTxt([x]) }; }) };
  }
  /* o MESMO conteúdo do gerar(), em estrutura: [{ chave, nome, secoes: [{ id, titulo, itens }], materiais, ferramentas, proprietario }] */
  function partes(resultado, opcoes) {
    opcoes = opcoes || {};
    var sis = presentes(resultado, opcoes), RS = resultado && resultado.sistemas ? resultado.sistemas : {}, ch = RS.incendio && RS.incendio.chuveiros;
    var cond = { chuveiros: !!(ch && ch.exigido === true), hidrantes: !!(RS.incendio && RS.incendio.hidrantes && RS.incendio.hidrantes.exigido === true) };
    function lista(itens0) { return arr(itens0).filter(function (i) { return !i.se || cond[i.se]; }).map(itemDados); }
    var out = sis.map(function (k) {
      var M = MANUAL[k];
      var secoes = SEC.filter(function (s) { return s[0] !== "materiais"; }).map(function (s) {
        var itens = M[s[0]] || [];
        if (s[0] === "manutencao") itens = itens.concat(extraNormas(k, opcoes));
        if (s[0] === "teste" && k === "esgoto") itens = itens.concat(ensaiosEsgoto(opcoes));
        return { id: s[0], titulo: s[1], itens: lista(itens) };
      });
      var mats = materiaisDe(k, opcoes).map(function (m) {
        var B = MATERIAL[m.material];
        return { sistema: m.sistema, material: m.material, nome: B ? B.nome : m.material, itens: B ? lista(B.itens) : [itemDados(Pend("Montagem do tubo " + m.material + ".", MATERIAL_SEM_FONTE))] };
      });
      return { chave: k, nome: M.nome, secoes: secoes, materiais: mats, ferramentas: lista(FERRAMENTAS[k]), proprietario: lista(PROPRIETARIO[k]) };
    });
    return { sistemas: out, cond: cond, conforme: !!(resultado && resultado.ok === true) };
  }

  var HidManual = { VERSAO: 1, gerar: gerar, html: html, partes: partes, presentes: presentes, FONTES: FONTES, MANUAL: MANUAL, MATERIAL: MATERIAL, FERRAMENTAS: FERRAMENTAS, PROPRIETARIO: PROPRIETARIO, ORDEM: ORDEM, SECOES: SEC };
  global.HidManual = HidManual;
  if (typeof module !== "undefined" && module.exports) module.exports = HidManual;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
