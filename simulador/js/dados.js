/* ============================================================
   OrçaPRO — Simulador de Obras 3D : BASE DE DADOS
   Base de dados de lotes, funções, ferramentas, insumos,
   projetos, etapas e cenários de obra. Tudo em pt-BR.
   ============================================================ */
(function (global) {
  'use strict';

  // ---- Lotes padrão do Brasil --------------------------------
  // área em m², frente x fundo em metros, preço em R$
  const LOTES = [
    { id: 'l125', nome: 'Lote Popular 5×25',     frente: 5,  fundo: 25, area: 125,  preco: 45000,   tipo: 'residencial', desc: 'Lote estreito de bairro popular. Ideal para casa térrea geminada.' },
    { id: 'l180', nome: 'Lote 6×30',             frente: 6,  fundo: 30, area: 180,  preco: 68000,   tipo: 'residencial', desc: 'Frente reduzida, bom fundo. Casa térrea ou sobrado.' },
    { id: 'l200', nome: 'Lote 10×20',            frente: 10, fundo: 20, area: 200,  preco: 95000,   tipo: 'residencial', desc: 'Lote urbano clássico. Padrão de loteamento.' },
    { id: 'l250', nome: 'Lote 10×25',            frente: 10, fundo: 25, area: 250,  preco: 128000,  tipo: 'residencial', desc: 'Confortável para sobrado de médio padrão.' },
    { id: 'l300', nome: 'Lote de Esquina 12×25', frente: 12, fundo: 25, area: 300,  preco: 175000,  tipo: 'residencial', desc: 'Esquina valorizada. Permite recuos generosos.' },
    { id: 'l360', nome: 'Lote 12×30',            frente: 12, fundo: 30, area: 360,  preco: 220000,  tipo: 'residencial', desc: 'Padrão urbano nobre. Casa de alto padrão com piscina.' },
    { id: 'l450', nome: 'Lote 15×30',            frente: 15, fundo: 30, area: 450,  preco: 320000,  tipo: 'predial',     desc: 'Terreno amplo para edifício de poucos pavimentos.' },
    { id: 'l600', nome: 'Terreno 20×30',         frente: 20, fundo: 30, area: 600,  preco: 480000,  tipo: 'predial',     desc: 'Base para edifício residencial/comercial.' },
    { id: 'l1000', nome: 'Terreno Industrial 20×50', frente: 20, fundo: 50, area: 1000, preco: 650000, tipo: 'industrial', desc: 'Lote industrial para galpão logístico.' },
    { id: 'l1800', nome: 'Gleba Industrial 30×60', frente: 30, fundo: 60, area: 1800, preco: 1100000, tipo: 'industrial', desc: 'Grande área para complexo industrial.' }
  ];

  // ---- Funções / Mão de obra ---------------------------------
  // diaria = custo por dia trabalhado (R$)
  const FUNCOES = [
    { id: 'eng',   nome: 'Engenheiro Civil',        emoji: '👷‍♂️', diaria: 650, desc: 'Responsável técnico (ART). Obrigatório a partir da estrutura.', setor: 'tecnico' },
    { id: 'mestre',nome: 'Mestre de Obras',         emoji: '🧑‍🏭', diaria: 360, desc: 'Comanda a execução no campo. Aumenta a produtividade.', setor: 'tecnico' },
    { id: 'pedreiro', nome: 'Pedreiro',             emoji: '🧱', diaria: 230, desc: 'Assenta blocos, faz alvenaria, reboco e contrapiso.', setor: 'execucao' },
    { id: 'ajudante', nome: 'Servente / Ajudante',  emoji: '🦺', diaria: 130, desc: 'Transporta materiais e dá apoio geral à execução no canteiro.', setor: 'execucao' },
    { id: 'carpinteiro', nome: 'Carpinteiro',       emoji: '🪚', diaria: 240, desc: 'Monta fôrmas de madeira e o telhado.', setor: 'execucao' },
    { id: 'armador', nome: 'Armador (Ferreiro)',    emoji: '🔩', diaria: 240, desc: 'Corta e dobra o aço das armaduras.', setor: 'execucao' },
    { id: 'eletricista', nome: 'Eletricista',       emoji: '⚡', diaria: 260, desc: 'Executa o projeto elétrico e telecom.', setor: 'instalacoes' },
    { id: 'encanador', nome: 'Encanador (Bombeiro Hidráulico)', emoji: '🚰', diaria: 250, desc: 'Executa hidráulica, esgoto e águas pluviais.', setor: 'instalacoes' },
    { id: 'pintor', nome: 'Pintor',                 emoji: '🎨', diaria: 220, desc: 'Massa corrida, selador e pintura final.', setor: 'acabamento' },
    { id: 'azulejista', nome: 'Azulejista',         emoji: '🧰', diaria: 250, desc: 'Assenta pisos, porcelanatos e revestimentos.', setor: 'acabamento' },
    { id: 'gesseiro', nome: 'Gesseiro',             emoji: '🪟', diaria: 240, desc: 'Forros, sancas e drywall.', setor: 'acabamento' },
    { id: 'operador', nome: 'Operador de Máquinas', emoji: '🚜', diaria: 300, desc: 'Opera grua, munck, retroescavadeira.', setor: 'execucao' },
    { id: 'almoxarife', nome: 'Almoxarife',         emoji: '📦', diaria: 170, desc: 'Controla o estoque do canteiro. Reduz perdas.', setor: 'apoio' },
    { id: 'vigia', nome: 'Vigia',                   emoji: '🛡️', diaria: 150, desc: 'Segurança do canteiro. Evita furtos de material.', setor: 'apoio' }
  ];

  // ---- Insumos / Materiais -----------------------------------
  // unidade + preço unitário (R$)
  const INSUMOS = [
    { id: 'cimento', nome: 'Cimento CP-II',  emoji: '🟫', un: 'saco 50kg', preco: 38 },
    { id: 'areia',   nome: 'Areia média',    emoji: '🟨', un: 'm³',        preco: 110 },
    { id: 'brita',   nome: 'Brita 1',        emoji: '⬜', un: 'm³',        preco: 130 },
    { id: 'aco',     nome: 'Aço CA-50',      emoji: '🔗', un: 'kg',        preco: 9 },
    { id: 'bloco',   nome: 'Bloco cerâmico', emoji: '🧱', un: 'milheiro',  preco: 1200 },
    { id: 'concreto',nome: 'Concreto usinado', emoji: '🌫️', un: 'm³',      preco: 480 },
    { id: 'cal',     nome: 'Cal hidratada',  emoji: '⚪', un: 'saco 20kg', preco: 24 },
    { id: 'madeira', nome: 'Madeira p/ fôrma', emoji: '🪵', un: 'm²',      preco: 65 },
    { id: 'telha',   nome: 'Telha cerâmica', emoji: '🟧', un: 'milheiro',  preco: 2300 },
    { id: 'tubo',    nome: 'Tubos e conexões PVC', emoji: '🩵', un: 'kit', preco: 90 },
    { id: 'fio',     nome: 'Fios e cabos',   emoji: '🟥', un: 'rolo 100m', preco: 280 },
    { id: 'reboco',  nome: 'Argamassa reboco', emoji: '🪣', un: 'saco',    preco: 22 },
    { id: 'ceramica',nome: 'Porcelanato/Cerâmica', emoji: '◻️', un: 'm²',  preco: 75 },
    { id: 'tinta',   nome: 'Tinta acrílica', emoji: '🎨', un: 'lata 18L',  preco: 320 },
    { id: 'esquadria', nome: 'Portas e janelas', emoji: '🚪', un: 'conjunto', preco: 6500 },
    { id: 'gesso',   nome: 'Gesso / Drywall', emoji: '⬜', un: 'm²',       preco: 55 }
  ];

  // ---- Ferramentas e Equipamentos ----------------------------
  // modo: 'comprar' | 'alugar' | 'ambos'
  // precoCompra (R$), precoAluguel (R$/dia)
  const FERRAMENTAS = [
    { id: 'kit_manual', nome: 'Kit manual (martelo, trena, nível, colher)', emoji: '🔨', modo: 'comprar', precoCompra: 800, desc: 'Ferramentas básicas indispensáveis.' },
    { id: 'carrinho', nome: 'Carrinho de mão',        emoji: '🛒', modo: 'comprar', precoCompra: 350, desc: 'Transporte de massa, areia e entulho.' },
    { id: 'furadeira', nome: 'Furadeira / Parafusadeira', emoji: '🪛', modo: 'comprar', precoCompra: 650, desc: 'Furos e fixações.' },
    { id: 'betoneira', nome: 'Betoneira 400L',        emoji: '🌀', modo: 'ambos', precoCompra: 4200, precoAluguel: 120, desc: 'Produz concreto e argamassa no canteiro.' },
    { id: 'serra_circ', nome: 'Serra circular',       emoji: '🪚', modo: 'ambos', precoCompra: 1100, precoAluguel: 70, desc: 'Corte de madeira para fôrmas e telhado.' },
    { id: 'serra_marmore', nome: 'Serra mármore',     emoji: '💎', modo: 'ambos', precoCompra: 900, precoAluguel: 60, desc: 'Corte de porcelanato e pedras.' },
    { id: 'esmeril', nome: 'Esmerilhadeira (Makita)', emoji: '⚙️', modo: 'comprar', precoCompra: 600, desc: 'Corte e desbaste de metais.' },
    { id: 'rompedor', nome: 'Martelete / Rompedor',   emoji: '🛠️', modo: 'ambos', precoCompra: 2800, precoAluguel: 150, desc: 'Demolição e abertura de rasgos.' },
    { id: 'vibrador', nome: 'Vibrador de concreto',   emoji: '📳', modo: 'ambos', precoCompra: 1900, precoAluguel: 90, desc: 'Adensa o concreto, evita brocas.' },
    { id: 'placa_vibra', nome: 'Compactador (placa vibratória)', emoji: '🔲', modo: 'alugar', precoAluguel: 110, desc: 'Compacta o solo da fundação.' },
    { id: 'gerador', nome: 'Gerador de energia',      emoji: '🔌', modo: 'ambos', precoCompra: 3500, precoAluguel: 130, desc: 'Energia onde a rede ainda não chegou.' },
    { id: 'andaime', nome: 'Andaime tubular (módulos)', emoji: '🪜', modo: 'alugar', precoAluguel: 45, desc: 'Acesso seguro em altura para alvenaria e fachada.' },
    { id: 'escora', nome: 'Escoramento / Escoras',    emoji: '📏', modo: 'alugar', precoAluguel: 35, desc: 'Sustenta fôrmas de laje até a cura.' },
    { id: 'plataforma', nome: 'Plataforma elevatória', emoji: '🛗', modo: 'alugar', precoAluguel: 480, desc: 'Acesso em altura para fachadas de prédios.' },
    { id: 'munck', nome: 'Caminhão Munck',            emoji: '🚛', modo: 'alugar', precoAluguel: 900, desc: 'Içamento de cargas médias.' },
    { id: 'guindaste', nome: 'Guindaste',             emoji: '🏗️', modo: 'alugar', precoAluguel: 2200, desc: 'Içamento pesado em obras prediais.' },
    { id: 'grua', nome: 'Grua de obra',               emoji: '🗼', modo: 'alugar', precoAluguel: 3500, desc: 'Indispensável em prédios e indústrias.' },
    { id: 'cacamba', nome: 'Caçamba de entulho',      emoji: '🗑️', modo: 'alugar', precoAluguel: 250, desc: 'Remoção de resíduos da obra.' },
    { id: 'bomba', nome: 'Bomba de concreto',         emoji: '⛽', modo: 'alugar', precoAluguel: 1400, desc: 'Bombeia concreto para lajes altas.' }
  ];

  // ---- Estruturas do Canteiro de Obra ------------------------
  const CANTEIRO = [
    { id: 'tapume',   nome: 'Tapume / Cercamento', emoji: '🚧', preco: 4500, desc: 'Fecha o terreno e protege o canteiro.' },
    { id: 'barracao', nome: 'Barracão / Almoxarifado', emoji: '🏚️', preco: 6000, desc: 'Guarda ferramentas e materiais sensíveis.' },
    { id: 'vivencia', nome: 'Área de vivência (refeitório/vestiário)', emoji: '🏠', preco: 5500, desc: 'Conforto e segurança da equipe (NR-18).' },
    { id: 'banheiro', nome: 'Banheiro químico/instalações', emoji: '🚻', preco: 2000, desc: 'Instalações sanitárias da obra.' },
    { id: 'baia',     nome: 'Baias de agregados (areia/brita)', emoji: '🟫', preco: 1500, desc: 'Organiza o estoque de areia e brita.' },
    { id: 'escritorio', nome: 'Escritório de obra', emoji: '🏢', preco: 4000, desc: 'Base da engenharia e leitura de projetos.' },
    { id: 'caixa_dagua', nome: "Reservatório / Caixa d'água", emoji: '💧', preco: 1800, desc: 'Abastece a obra com água.' }
  ];

  // ---- Projetos técnicos -------------------------------------
  const PROJETOS = [
    { id: 'arq',   nome: 'Projeto Arquitetônico',   emoji: '📐', custo: 8000, desc: 'Define plantas, cortes e fachadas.' },
    { id: 'estr',  nome: 'Projeto Estrutural',      emoji: '🏛️', custo: 9000, desc: 'Dimensiona pilares, vigas e lajes.' },
    { id: 'fund',  nome: 'Projeto de Fundação',     emoji: '🪨', custo: 6000, desc: 'Sapatas, estacas e baldrame conforme o solo.' },
    { id: 'hidro', nome: 'Projeto Hidrossanitário', emoji: '🚿', custo: 5000, desc: 'Água fria, esgoto e águas pluviais.' },
    { id: 'eletr', nome: 'Projeto Elétrico',        emoji: '💡', custo: 5000, desc: 'Quadros, circuitos e pontos.' },
    { id: 'incendio', nome: 'Projeto de Incêndio (PPCI)', emoji: '🧯', custo: 7000, desc: 'Exigido em prédios e indústrias.' },
    { id: 'interior', nome: 'Projeto de Interiores', emoji: '🛋️', custo: 6500, desc: 'Marcenaria, iluminação e acabamentos.' }
  ];

  // ---- Etapas da obra (cronograma) ---------------------------
  // Cada etapa exige: funções (ids), ferramentas (ids), insumos {id:qtd},
  // projetos (ids) e tem dias-base e estágio visual 3D.
  // dependeDe: ids de etapas que precisam estar concluídas.
  const ETAPAS = [
    { id: 'preliminar', nome: 'Serviços preliminares', emoji: '🚩', dias: 4,
      funcoes: ['ajudante'], ferramentas: ['kit_manual'], insumos: {}, projetos: ['arq'],
      canteiroReq: ['tapume', 'barracao'],
      dependeDe: [], estagio: 'canteiro',
      desc: 'Limpeza do terreno, marcação e ligações provisórias. Exige tapume e barracão.' },
    { id: 'fundacao', nome: 'Locação e Fundação', emoji: '🪨', dias: 10,
      funcoes: ['pedreiro','ajudante','armador'], ferramentas: ['betoneira','placa_vibra','carrinho'],
      insumos: { cimento: 40, areia: 8, brita: 8, aco: 600, madeira: 30 }, projetos: ['fund','estr'],
      dependeDe: ['preliminar'], estagio: 'fundacao',
      desc: 'Escavação, fôrmas, armação e concretagem das sapatas e baldrame.' },
    { id: 'estrutura', nome: 'Estrutura (pilares e vigas)', emoji: '🏛️', dias: 14,
      funcoes: ['eng','pedreiro','armador','carpinteiro'], ferramentas: ['betoneira','vibrador','escora','serra_circ'],
      insumos: { cimento: 60, areia: 10, brita: 12, aco: 1200, madeira: 60, concreto: 6 }, projetos: ['estr'],
      dependeDe: ['fundacao'], estagio: 'estrutura',
      desc: 'Concretagem dos pilares e vigas que sustentam a edificação.' },
    { id: 'alvenaria1', nome: 'Alvenaria — 1ª fiada', emoji: '🧱', dias: 5,
      funcoes: ['pedreiro','ajudante'], ferramentas: ['kit_manual','carrinho'],
      insumos: { bloco: 2, cimento: 15, areia: 4, cal: 6 }, projetos: ['arq'],
      dependeDe: ['estrutura'], estagio: 'alvenaria1',
      desc: 'A fiada de marcação que define toda a geometria das paredes.' },
    { id: 'alvenaria2', nome: 'Alvenaria — elevação', emoji: '🧱', dias: 12,
      funcoes: ['pedreiro','ajudante'], ferramentas: ['kit_manual','carrinho','andaime'],
      insumos: { bloco: 6, cimento: 30, areia: 8, cal: 12 }, projetos: ['arq'],
      dependeDe: ['alvenaria1'], estagio: 'alvenaria2',
      desc: 'Subida das paredes até a altura do respaldo.' },
    { id: 'laje', nome: 'Laje', emoji: '🟫', dias: 9,
      funcoes: ['eng','pedreiro','armador','carpinteiro'], ferramentas: ['escora','vibrador','betoneira','bomba'],
      insumos: { concreto: 14, aco: 900, madeira: 50, cimento: 20 }, projetos: ['estr'],
      dependeDe: ['alvenaria2'], estagio: 'laje',
      desc: 'Montagem das fôrmas, armação e concretagem da laje.' },
    { id: 'cobertura', nome: 'Cobertura / Telhado', emoji: '🏠', dias: 8,
      funcoes: ['carpinteiro','pedreiro','ajudante'], ferramentas: ['serra_circ','andaime'],
      insumos: { madeira: 40, telha: 1.5 }, projetos: ['arq','estr'],
      dependeDe: ['laje'], estagio: 'cobertura',
      desc: 'Estrutura de madeira e telhamento.' },
    { id: 'hidraulica', nome: 'Instalações hidráulicas', emoji: '🚰', dias: 7,
      funcoes: ['encanador','ajudante'], ferramentas: ['rompedor','furadeira'],
      insumos: { tubo: 30 }, projetos: ['hidro'],
      dependeDe: ['alvenaria2'], estagio: 'instalacoes',
      desc: 'Tubulações de água fria, esgoto e pluvial embutidas.' },
    { id: 'eletrica', nome: 'Instalações elétricas', emoji: '⚡', dias: 7,
      funcoes: ['eletricista','ajudante'], ferramentas: ['rompedor','furadeira'],
      insumos: { fio: 12, tubo: 10 }, projetos: ['eletr'],
      dependeDe: ['alvenaria2'], estagio: 'instalacoes',
      desc: 'Eletrodutos, fiação, quadros e pontos.' },
    { id: 'reboco', nome: 'Reboco / Emboço', emoji: '🪣', dias: 11,
      funcoes: ['pedreiro','ajudante'], ferramentas: ['andaime','carrinho'],
      insumos: { reboco: 80, cimento: 25, areia: 10, cal: 10 }, projetos: ['arq'],
      dependeDe: ['cobertura','hidraulica','eletrica'], estagio: 'reboco',
      desc: 'Regularização interna e externa das paredes.' },
    { id: 'revestimento', nome: 'Contrapiso e Revestimentos', emoji: '◻️', dias: 10,
      funcoes: ['azulejista','ajudante'], ferramentas: ['serra_marmore'],
      insumos: { ceramica: 120, cimento: 20, areia: 6 }, projetos: ['arq','interior'],
      dependeDe: ['reboco'], estagio: 'revestimento',
      desc: 'Pisos, porcelanatos e revestimentos de áreas molhadas.' },
    { id: 'esquadrias', nome: 'Esquadrias (portas/janelas)', emoji: '🚪', dias: 5,
      funcoes: ['carpinteiro','ajudante'], ferramentas: ['furadeira','kit_manual'],
      insumos: { esquadria: 1 }, projetos: ['arq'],
      dependeDe: ['revestimento'], estagio: 'esquadrias',
      desc: 'Instalação de portas, janelas e vidros.' },
    { id: 'forro', nome: 'Forros e Gesso', emoji: '⬜', dias: 6,
      funcoes: ['gesseiro','ajudante'], ferramentas: ['furadeira'],
      insumos: { gesso: 90 }, projetos: ['interior'],
      dependeDe: ['esquadrias'], estagio: 'acabamento',
      desc: 'Forros, sancas e drywall.' },
    { id: 'pintura', nome: 'Pintura', emoji: '🎨', dias: 9,
      funcoes: ['pintor','ajudante'], ferramentas: ['andaime'],
      insumos: { tinta: 18 }, projetos: ['arq','interior'],
      dependeDe: ['forro'], estagio: 'pintura',
      desc: 'Massa, selador e duas demãos de tinta.' },
    { id: 'entrega', nome: 'Limpeza e Entrega', emoji: '✅', dias: 4,
      funcoes: ['ajudante','eng'], ferramentas: ['kit_manual'], insumos: {}, projetos: ['arq'],
      dependeDe: ['pintura'], estagio: 'entrega',
      desc: 'Limpeza fina, vistoria e entrega das chaves.' }
  ];

  // ---- Cenários de obra --------------------------------------
  // Cada cenário usa um conjunto de etapas (padrão = todas), com
  // multiplicadores de escala (insumos/dias/custo) e exigências.
  const NIVEIS = [
    {
      id: 1, nome: 'Casa Térrea Popular', tipo: 'residencial',
      icone: '🏠', pavimentos: 1, escala: 0.9,
      orcamento: 420000, prazo: 110,
      loteMin: 125, loteMax: 250,
      projetosObrig: ['arq','estr','fund','hidro','eletr'],
      etapas: ['preliminar','fundacao','estrutura','alvenaria1','alvenaria2','laje','cobertura','hidraulica','eletrica','reboco','revestimento','esquadrias','pintura','entrega'],
      desc: 'Casa térrea de 2 quartos — cenário inicial para treinar a gestão de prazo e orçamento.'
    },
    {
      id: 2, nome: 'Sobrado de Médio Padrão', tipo: 'residencial',
      icone: '🏡', pavimentos: 2, escala: 1.1,
      orcamento: 760000, prazo: 150,
      loteMin: 180, loteMax: 360,
      projetosObrig: ['arq','estr','fund','hidro','eletr','interior'],
      etapas: ['preliminar','fundacao','estrutura','alvenaria1','alvenaria2','laje','cobertura','hidraulica','eletrica','reboco','revestimento','esquadrias','forro','pintura','entrega'],
      desc: 'Dois pavimentos exigem laje e mais estrutura. Cuidado com o cronograma.'
    },
    {
      id: 3, nome: 'Casa de Alto Padrão', tipo: 'residencial',
      icone: '🏘️', pavimentos: 2, escala: 1.4,
      orcamento: 1500000, prazo: 200,
      loteMin: 300, loteMax: 600,
      projetosObrig: ['arq','estr','fund','hidro','eletr','interior'],
      etapas: ['preliminar','fundacao','estrutura','alvenaria1','alvenaria2','laje','cobertura','hidraulica','eletrica','reboco','revestimento','esquadrias','forro','pintura','entrega'],
      desc: 'Acabamentos sofisticados e mais área. Projeto de interiores é decisivo.'
    },
    {
      id: 4, nome: 'Edifício Residencial', tipo: 'predial',
      icone: '🏢', pavimentos: 4, escala: 1.8,
      orcamento: 3200000, prazo: 320,
      loteMin: 450, loteMax: 1000,
      projetosObrig: ['arq','estr','fund','hidro','eletr','incendio'],
      etapas: ['preliminar','fundacao','estrutura','alvenaria1','alvenaria2','laje','cobertura','hidraulica','eletrica','reboco','revestimento','esquadrias','forro','pintura','entrega'],
      desc: 'Quatro pavimentos. Agora a grua e o PPCI entram em cena.'
    },
    {
      id: 5, nome: 'Edifício Comercial', tipo: 'predial',
      icone: '🏬', pavimentos: 6, escala: 2.4,
      orcamento: 6500000, prazo: 420,
      loteMin: 450, loteMax: 1000,
      projetosObrig: ['arq','estr','fund','hidro','eletr','incendio','interior'],
      etapas: ['preliminar','fundacao','estrutura','alvenaria1','alvenaria2','laje','cobertura','hidraulica','eletrica','reboco','revestimento','esquadrias','forro','pintura','entrega'],
      desc: 'Seis pavimentos comerciais. Logística de canteiro no limite.'
    },
    {
      id: 6, nome: 'Galpão Industrial', tipo: 'industrial',
      icone: '🏭', pavimentos: 1, escala: 3.0,
      orcamento: 4800000, prazo: 260,
      loteMin: 1000, loteMax: 1800,
      projetosObrig: ['arq','estr','fund','hidro','eletr','incendio'],
      etapas: ['preliminar','fundacao','estrutura','cobertura','hidraulica','eletrica','revestimento','pintura','entrega'],
      desc: 'Estrutura metálica de grande vão. Munck e guindaste são essenciais.'
    },
    {
      id: 7, nome: 'Complexo Industrial', tipo: 'industrial',
      icone: '🏗️', pavimentos: 1, escala: 4.0,
      orcamento: 12000000, prazo: 400,
      loteMin: 1800, loteMax: 1800,
      projetosObrig: ['arq','estr','fund','hidro','eletr','incendio'],
      etapas: ['preliminar','fundacao','estrutura','cobertura','hidraulica','eletrica','revestimento','pintura','entrega'],
      desc: 'Complexo industrial completo — cenário avançado, gestão no limite do prazo.'
    }
  ];

  // ---- Segurança do trabalho (NR-18) -------------------------
  // seg = pontos de segurança que o item agrega (soma dá até ~100)
  const SEGURANCA = [
    { id: 'epi',        nome: 'Kit de EPI da equipe', emoji: '🦺', preco: 2200, seg: 30, desc: 'Capacete, luvas, botas e óculos para todos. Base da NR-18.' },
    { id: 'guarda',     nome: 'Guarda-corpo e rodapé', emoji: '🚧', preco: 2600, seg: 18, desc: 'Proteção de periferia e vãos contra quedas.' },
    { id: 'tela',       nome: 'Tela de proteção de fachada', emoji: '🕸️', preco: 3200, seg: 14, desc: 'Contém quedas de materiais em altura.' },
    { id: 'cinto',      nome: 'Cinto/trava-quedas', emoji: '🪢', preco: 1800, seg: 12, desc: 'Obrigatório em trabalho em altura.' },
    { id: 'treinamento',nome: 'Treinamento e DDS', emoji: '📋', preco: 2000, seg: 14, desc: 'Diálogo diário de segurança e capacitação.' },
    { id: 'incendio_eq',nome: 'Extintores e sinalização', emoji: '🧯', preco: 1200, seg: 8, desc: 'Prevenção e combate a incêndio no canteiro.' },
    { id: 'placas',     nome: 'Placas e cones', emoji: '⚠️', preco: 700, seg: 4, desc: 'Sinalização de segurança do canteiro.' }
  ];

  // ---- Eventos / imprevistos ---------------------------------
  // tipo: 'ruim' | 'bom'. efeito: {dias, custo, dinheiro}
  const EVENTOS = [
    { id: 'rocha', tipo: 'ruim', emoji: '🪨', nome: 'Rocha na fundação', chance: 1,
      desc: 'Encontraram rocha durante a escavação. Precisou de rompedor e mais tempo.',
      dias: 5, custo: 12000, so: ['fundacao'] },
    { id: 'fornecedor', tipo: 'ruim', emoji: '🚚', nome: 'Atraso do fornecedor', chance: 1,
      desc: 'A entrega de material atrasou e a obra ficou parada.', dias: 4, custo: 0 },
    { id: 'greve', tipo: 'ruim', emoji: '✊', nome: 'Paralisação', chance: 0.7,
      desc: 'A equipe parou por um dia reivindicando melhorias.', dias: 3, custo: 0 },
    { id: 'retrabalho', tipo: 'ruim', emoji: '🔁', nome: 'Retrabalho', chance: 1,
      desc: 'Um serviço saiu fora do projeto e precisou refazer.', dias: 3, custo: 8000 },
    { id: 'furto', tipo: 'ruim', emoji: '🥷', nome: 'Furto de material', chance: 1,
      desc: 'Sumiram materiais do canteiro durante a noite.', dias: 0, custo: 9000, evitaCom: 'vigia' },
    { id: 'vistoria', tipo: 'ruim', emoji: '🛂', nome: 'Vistoria da prefeitura', chance: 0.8,
      desc: 'Fiscal apareceu para vistoriar o canteiro.', dias: 1, custo: 0, fiscal: true },
    { id: 'produtividade', tipo: 'bom', emoji: '⚡', nome: 'Equipe rendeu!', chance: 1,
      desc: 'A equipe engrenou e adiantou o serviço.', dias: -3, custo: 0 },
    { id: 'clima_bom', tipo: 'bom', emoji: '☀️', nome: 'Tempo firme', chance: 1,
      desc: 'Sequência de dias secos acelerou a obra.', dias: -2, custo: 0 },
    { id: 'bonus', tipo: 'bom', emoji: '🎁', nome: 'Bônus do cliente', chance: 0.8,
      desc: 'O cliente gostou do andamento e liberou um bônus.', dias: 0, dinheiro: 15000 }
  ];

  // etapas que envolvem concreto (exigem cura antes da próxima)
  const CONCRETO = ['fundacao', 'estrutura', 'laje'];
  // etapas a céu aberto (sofrem com a chuva)
  const OUTDOOR = ['preliminar', 'fundacao', 'estrutura', 'alvenaria1', 'alvenaria2', 'laje', 'cobertura', 'reboco', 'pintura'];

  // clima e BDI por nível (economia realista)
  const CLIMAS = {
    seco:     { nome: 'Seco',     emoji: '☀️', chuva: 0.12 },
    ameno:    { nome: 'Ameno',    emoji: '⛅', chuva: 0.25 },
    chuvoso:  { nome: 'Chuvoso',  emoji: '🌧️', chuva: 0.42 }
  };
  var climasPorNivel = { 1: 'seco', 2: 'ameno', 3: 'ameno', 4: 'chuvoso', 5: 'chuvoso', 6: 'ameno', 7: 'chuvoso' };
  NIVEIS.forEach(function (n) {
    n.clima = climasPorNivel[n.id] || 'ameno';
    n.bdi = n.tipo === 'industrial' ? 0.2789 : (n.tipo === 'predial' ? 0.2612 : 0.2497); // faixas TCU/DNIT
  });

  var IMPOSTO = 0.0865;   // ISS + PIS/COFINS aprox. sobre a medição
  var CURA_BASE = 4;      // dias-base de cura do concreto

  function byId(arr, id) { return arr.find(function (x) { return x.id === id; }); }

  global.DADOS = {
    LOTES: LOTES,
    FUNCOES: FUNCOES,
    INSUMOS: INSUMOS,
    FERRAMENTAS: FERRAMENTAS,
    CANTEIRO: CANTEIRO,
    PROJETOS: PROJETOS,
    ETAPAS: ETAPAS,
    NIVEIS: NIVEIS,
    SEGURANCA: SEGURANCA,
    EVENTOS: EVENTOS,
    CLIMAS: CLIMAS,
    CONCRETO: CONCRETO,
    OUTDOOR: OUTDOOR,
    IMPOSTO: IMPOSTO,
    CURA_BASE: CURA_BASE,
    lote: function (id) { return byId(LOTES, id); },
    funcao: function (id) { return byId(FUNCOES, id); },
    insumo: function (id) { return byId(INSUMOS, id); },
    ferramenta: function (id) { return byId(FERRAMENTAS, id); },
    canteiro: function (id) { return byId(CANTEIRO, id); },
    projeto: function (id) { return byId(PROJETOS, id); },
    etapa: function (id) { return byId(ETAPAS, id); },
    seguranca: function (id) { return byId(SEGURANCA, id); },
    evento: function (id) { return byId(EVENTOS, id); },
    nivel: function (id) { return NIVEIS.find(function (n) { return n.id === id; }); }
  };
})(window);
