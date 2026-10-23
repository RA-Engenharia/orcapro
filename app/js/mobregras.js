/* =====================================================================
 * mobregras.js — REGRAS DO "MOBILIAR AMBIENTE" (um clique por ambiente, 21/10/2026). Puro, ES5, Node-testável.
 *
 * Três coisas, todas lidas da pesquisa de 20/10/2026 (docs/arquitetura/interiores/PADROES-AMBIENTES.md e
 * dados/regras-layout.json — o app lê a cópia gerada em js/mobregrasdados.js):
 *   1. classificar(nome, info) → o TIPO CANÔNICO do ambiente para o mobiliário (PADROES §1). Independente do
 *      classificador das esquadrias (js/esqregras.js) e do da hidráulica: o mobiliário precisa distinguir casal × solteiro
 *      × infantil × suíte, estar × jantar × integrado, e o comercial leve.
 *   2. CRITERIOS — cada número que o motor usa, com o id da regra e o NÍVEL da fonte:
 *        N norma/regulamento · L literatura técnica estrangeira (NKBA) · S fonte secundária lida (imprensa, varejo)
 *        D derivado por conta de valores com fonte · P prática de projeto sem fonte primária · ? sem fonte — conferir
 *      A regra que a pesquisa marcou "sem fonte — conferir" (valor null no JSON) só entra aqui com o valor provisório do
 *      PADROES e o nível "?", que a tela mostra. Nunca um número sem dizer de onde veio.
 *   3. PROGRAMAS — o conjunto obrigatório/opcional de cada tipo (PADROES §3 e §4), para a tela e para o teste.
 *
 * ⚠ "Lav" sozinho decide pela área (≤ 3,5 m² = lavabo, PADROES 1.3 [P]) e AVISA; dormitório sem palavra-chave decide
 *   pela menor dimensão (≥ 2,60 m = casal, [D]) e AVISA; nome não reconhecido NÃO lança (o sistema nunca inventa programa).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var D = dep("MobRegrasDados", "./mobregrasdados.js");
  var POR_ID = {};
  ((D && D.regras) || []).forEach(function (r) { POR_ID[r.id] = r; });

  /* ---------------------------------------------------------------- nível da fonte */
  var NIVEIS = { N: "norma ou regulamento", L: "literatura técnica estrangeira (NKBA, não é norma brasileira)", S: "fonte secundária lida (imprensa, varejo, blog técnico)",
    D: "derivado por conta de valores com fonte", P: "prática de projeto — sem fonte primária (padrão do sistema, ajustável)", "?": "SEM FONTE — conferir (valor provisório)" };
  function nivelDe(r) {
    if (!r) return "?";
    if (/sem fonte/i.test(r.status) || r.valor == null && !r.titulo) return "?";
    if (r.tipo === "norma") return "N";
    if (r.tipo === "literatura") return "L";
    return "S";
  }
  function regra(id) { return POR_ID[id] || null; }
  /* cite(id): o que a tela e o item do motor mostram — id + fonte + nível (e a ressalva da cópia não licenciada) */
  function cite(id) {
    var r = POR_ID[id], c = CRIT_RA[id];
    if (c) return { id: id, nivel: c.nivel, fonte: c.fonte, texto: c.texto, url: "" };
    if (!r) return { id: id, nivel: "?", fonte: "regra não encontrada em regras-layout.json", texto: "", url: "" };
    var nv = nivelDe(r), f = r.titulo ? r.titulo + (r.citado && r.citado !== r.titulo ? " — " + r.citado : "") : "sem fonte — conferir";
    if (/nao licenciada|não licenciada/i.test(r.status)) f += " (cópia não licenciada: só o valor; validar na norma)";
    else if (/secundaria|secundária/i.test(r.status)) f += " (fonte secundária)";
    return { id: id, nivel: nv, fonte: f, texto: r.regra, url: r.url || "" };
  }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }

  /* ---------------------------------------------------------------- critérios do sistema SEM id na pesquisa (D / P / ?)
     Cada um diz de onde saiu. Os de nível "?" e "P" aparecem marcados na tela do resultado. */
  var CRIT_RA = {
    "ra-folga-encosto": { valor: 0.10, nivel: "P", texto: "Folga de 0,10 m além da largura da peça na parede de referência", fonte: "PADROES-AMBIENTES §2 passo 2 — prática de projeto, sem fonte primária" },
    "ra-janela-faixa": { valor: 0.60, nivel: "P", texto: "Peça mais alta que o peitoril não fica a menos de 0,60 m da janela (nem encosta na folha aberta)", fonte: "PADROES-AMBIENTES §2 passo 1 — prática de projeto, sem fonte primária" },
    "ra-tv-centro": { valor: 1.10, nivel: "D", texto: "Centro da TV a 1,10 m do piso (cai nas duas faixas lidas)", fonte: "PADROES-AMBIENTES 3.1 — derivado de sala-tv-centro-casaeletro (1,00–1,10) e sala-tv-centro-1200" },
    "ra-tv-ideal": { valor: 1.8, nivel: "D", texto: "Distância ideal sofá–TV = diagonal × 1,8 (meio da faixa 1,2–2,5)", fonte: "PADROES-AMBIENTES 3.1 — derivado de sala-tv-multiplicador-diagonal" },
    "ra-sofa-mesa": { valor: 0.40, nivel: "D", texto: "Mesa de centro a 0,40 m da frente do sofá (dentro da faixa 0,30–0,45)", fonte: "derivado de sala-sofa-mesa-centro" },
    "ra-roupeiro-giro": { valor: 0.90, nivel: "D", texto: "Guarda-roupa de portas de GIRO pede 0,90 m livres à frente (de correr: 0,60)", fonte: "PADROES-AMBIENTES 3.8 [D] — a folha aberta mais a circulação de dorm-circulacao-minima" },
    "ra-closet-corredor": { valor: 0.90, nivel: "D", texto: "Corredor interno do closet ≥ 0,90 m", fonte: "PADROES-AMBIENTES 3.10 [D] — mesma faixa de acess-9050-corredor-4m" },
    "ra-lavanderia-frente": { valor: 0.90, nivel: "?", texto: "Máquina de carga frontal: 0,90 m livres à frente", fonte: "PADROES-AMBIENTES 3.7 — SEM FONTE, conferir no manual da máquina" },
    "ra-home-office-recuo": { valor: 1.00, nivel: "?", texto: "Recuo da cadeira de trabalho ≈ 1,00 m à frente da mesa", fonte: "home-office-mesa-profundidade-recuo — SEM FONTE na pesquisa (PADROES 3.13), conferir" },
    "ra-hall-aparador": { valor: 0.35, nivel: "D", texto: "Aparador de hall com profundidade ≤ 0,35 m (sobra 0,90 m de passagem num hall de 1,25 m)", fonte: "PADROES-AMBIENTES 3.14 [D] — de acess-9050-corredor-4m" },
    "ra-dorm-casal-dimensao": { valor: 2.60, nivel: "D", texto: "Dormitório sem palavra-chave: casal se a menor dimensão ≥ 2,60 m", fonte: "PADROES-AMBIENTES 1.3 [D] — cama de casal 1,38 + 2 × 0,60 de circulação (dorm-circulacao-minima)" },
    "ra-lav-area": { valor: 3.5, nivel: "P", texto: "\"Lav\" sozinho: até 3,5 m² é lavabo, acima é lavanderia", fonte: "PADROES-AMBIENTES 1.3 — prática, ajustável" },
    "ra-loja-corredor": { valor: 1.20, nivel: "?", texto: "Corredor de clientes da loja ≥ 1,20 m", fonte: "loja-corredor-clientes — SEM FONTE na pesquisa (faixa 1,20–1,50 do PADROES 4.5), conferir" },
    "ra-recepcao-atras": { valor: 0.90, nivel: "P", texto: "Espaço de 0,90 m atrás do balcão para a cadeira do atendente", fonte: "PADROES-AMBIENTES 4.2 — prática de projeto, sem fonte primária" },
    "ra-pia-cuba": { valor: 0, nivel: "?", texto: "A cuba e o tampo de pedra não são lançados aqui (Bancadas/Marmoraria): a posição da pia é um PONTO na base", fonte: "escopo do motor — conferir na bancada" }
  };

  /* ---------------------------------------------------------------- CRITÉRIOS (o número + a regra) */
  function val(id, campo, padrao) {
    var r = POR_ID[id]; if (!r) return padrao;
    var v = r.valor; if (v == null) return padrao;
    if (campo == null) return typeof v === "number" ? v : padrao;
    var x = v[campo]; return x == null ? padrao : x;
  }
  /* ⚠ o padrão (3º argumento) só vale se o JSON não trouxer o campo — o teste confere que todos vieram do JSON */
  var CRITERIOS = {
    faixaPorta: { valor: val("acess-9050-corredor-4m", null, 0.9), regra: "acess-9050-corredor-4m", rotulo: "faixa livre na frente da porta (arco + passagem)" },
    circPrincipal: { valor: val("acess-9050-corredor-4m", null, 0.9), regra: "acess-9050-corredor-4m", rotulo: "circulação principal" },
    circDorm: { valor: val("dorm-circulacao-minima", null, 0.6), regra: "dorm-circulacao-minima", rotulo: "circulação entre a cama e outra peça ou parede" },
    vaoLateralCasal: { valor: val("dorm-vao-lateral-frente", "min", 0.7), regra: "dorm-vao-lateral-frente", rotulo: "vão nas laterais e no pé da cama de casal (preferível)" },
    giro: { valor: val("acess-9050-giro-dormitorio", "giro_diametro", 1.5), regra: "acess-9050-giro-dormitorio", rotulo: "área de giro Ø (projeto acessível)" },
    giroGeral: { valor: val("acess-9050-rot360", null, 1.5), regra: "acess-9050-rot360", rotulo: "rotação de 360° (projeto acessível)" },
    faixaAcessivel: { valor: val("acess-9050-giro-dormitorio", "faixa_livre", 0.9), regra: "acess-9050-giro-dormitorio", rotulo: "faixa livre (projeto acessível)" },
    tvMin: { valor: val("sala-tv-multiplicador-diagonal", "min", 1.2), regra: "sala-tv-multiplicador-diagonal", rotulo: "distância sofá–TV mínima (× diagonal)" },
    tvMax: { valor: val("sala-tv-multiplicador-diagonal", "max", 2.5), regra: "sala-tv-multiplicador-diagonal", rotulo: "distância sofá–TV máxima (× diagonal)" },
    tvIdeal: { valor: CRIT_RA["ra-tv-ideal"].valor, regra: "ra-tv-ideal", rotulo: "distância sofá–TV ideal (× diagonal)" },
    tvCentro: { valor: CRIT_RA["ra-tv-centro"].valor, regra: "ra-tv-centro", rotulo: "centro da TV do piso" },
    sofaMesa: { valor: CRIT_RA["ra-sofa-mesa"].valor, regra: "ra-sofa-mesa", rotulo: "sofá → mesa de centro" },
    sofaMesaMin: { valor: val("sala-sofa-mesa-centro", "min", 0.3), regra: "sala-sofa-mesa-centro", rotulo: "sofá → mesa de centro (mínimo)" },
    sofaMesaMax: { valor: val("sala-sofa-mesa-centro", "max", 0.45), regra: "sala-sofa-mesa-centro", rotulo: "sofá → mesa de centro (máximo)" },
    mesaTv: { valor: val("sala-mesa-centro-tv", "min", 0.6), regra: "sala-mesa-centro-tv", rotulo: "mesa de centro → móvel da TV" },
    mesaSofaProp: { valor: val("sala-mesa-centro-altura", "comprimento_sobre_sofa", 0.667), regra: "sala-mesa-centro-altura", rotulo: "comprimento da mesa de centro ÷ sofá" },
    jantarParede: { valor: val("jantar-mesa-parede", null, 0.9), regra: "jantar-mesa-parede", rotulo: "mesa de jantar a parede, buffet ou aparador" },
    jantarPessoa: { valor: val("jantar-largura-por-pessoa", null, 0.6), regra: "jantar-largura-por-pessoa", rotulo: "largura de mesa por pessoa" },
    cozCorredor: { valor: val("coz-nkba-corredor-1cozinheiro", null, 1.067), regra: "coz-nkba-corredor-1cozinheiro", rotulo: "corredor de trabalho da cozinha" },
    cozPassagem: { valor: val("coz-nkba-passagem", null, 0.914), regra: "coz-nkba-passagem", rotulo: "passagem na cozinha" },
    cozTriMin: { valor: val("coz-nkba-triangulo-lado", "min", 1.2), regra: "coz-nkba-triangulo-lado", rotulo: "lado do triângulo pia–fogão–geladeira (mínimo)" },
    cozTriMax: { valor: val("coz-nkba-triangulo-lado", "max", 2.7), regra: "coz-nkba-triangulo-lado", rotulo: "lado do triângulo (máximo)" },
    cozTriSoma: { valor: val("coz-nkba-triangulo-soma", null, 7.9), regra: "coz-nkba-triangulo-soma", rotulo: "soma do triângulo (máximo)" },
    cozPiaApoio1: { valor: val("coz-nkba-pia-apoio", "lado1", 0.61), regra: "coz-nkba-pia-apoio", rotulo: "apoio ao lado da pia (lado maior)" },
    cozPiaApoio2: { valor: val("coz-nkba-pia-apoio", "lado2", 0.457), regra: "coz-nkba-pia-apoio", rotulo: "apoio ao lado da pia (lado menor)" },
    cozCooktopApoio: { valor: val("coz-nkba-cooktop-apoio", "lado2", 0.381), regra: "coz-nkba-cooktop-apoio", rotulo: "apoio ao lado do fogão" },
    cozGelApoio: { valor: val("coz-nkba-geladeira-apoio", null, 0.381), regra: "coz-nkba-geladeira-apoio", rotulo: "apoio ao lado da geladeira" },
    cozBancada: { valor: val("coz-br-bancada-altura", "media", 0.9), regra: "coz-br-bancada-altura", rotulo: "altura da bancada" },
    cozCoifa: { valor: (val("coz-br-bancada-ilha-circulacao", "coifa_acima_fogao", [0.75, 0.9]) || [0.75])[0], regra: "coz-br-bancada-ilha-circulacao", rotulo: "coifa acima do fogão" },
    cozVaoAereo: { valor: val("coz-br-vao-bancada-aereo", "max", 0.6), regra: "coz-br-vao-bancada-aereo", rotulo: "vão bancada → armário aéreo" },
    homeRecuo: { valor: CRIT_RA["ra-home-office-recuo"].valor, regra: "ra-home-office-recuo", rotulo: "recuo da cadeira de trabalho" },
    escMesaLargura: { valor: val("esc-nbr13966-mesa-largura-prof", "largura_min", 0.8), regra: "esc-nbr13966-mesa-largura-prof", rotulo: "largura mínima da mesa de trabalho" },
    lavFrente: { valor: CRIT_RA["ra-lavanderia-frente"].valor, regra: "ra-lavanderia-frente", rotulo: "frente da máquina de lavar" },
    roupeiroGiro: { valor: CRIT_RA["ra-roupeiro-giro"].valor, regra: "ra-roupeiro-giro", rotulo: "frente do guarda-roupa de giro" },
    closetCorredor: { valor: CRIT_RA["ra-closet-corredor"].valor, regra: "ra-closet-corredor", rotulo: "corredor do closet" },
    folgaEncosto: { valor: CRIT_RA["ra-folga-encosto"].valor, regra: "ra-folga-encosto", rotulo: "folga na parede de referência" },
    janelaFaixa: { valor: CRIT_RA["ra-janela-faixa"].valor, regra: "ra-janela-faixa", rotulo: "peça alta longe da janela" },
    recepcaoCorredor: { valor: val("cons-rdc50-corredor", "geral", 1.2), regra: "cons-rdc50-corredor", rotulo: "corredor em frente ao balcão" },
    recepcaoAtras: { valor: CRIT_RA["ra-recepcao-atras"].valor, regra: "ra-recepcao-atras", rotulo: "espaço do atendente atrás do balcão" },
    lojaCorredor: { valor: CRIT_RA["ra-loja-corredor"].valor, regra: "ra-loja-corredor", rotulo: "corredor de clientes" },
    consultorioArea: { valor: val("cons-rdc50-consultorio-indiferenciado", "area_m2", 7.5), regra: "cons-rdc50-consultorio-indiferenciado", rotulo: "área mínima do consultório (m²)" },
    consultorioLado: { valor: val("cons-rdc50-consultorio-indiferenciado", "lado_min_m", 2.2), regra: "cons-rdc50-consultorio-indiferenciado", rotulo: "lado mínimo do consultório" },
    hallAparador: { valor: CRIT_RA["ra-hall-aparador"].valor, regra: "ra-hall-aparador", rotulo: "profundidade do aparador de hall" },
    dormCasalDim: { valor: CRIT_RA["ra-dorm-casal-dimensao"].valor, regra: "ra-dorm-casal-dimensao", rotulo: "menor dimensão para casal" },
    lavArea: { valor: CRIT_RA["ra-lav-area"].valor, regra: "ra-lav-area", rotulo: "\"Lav\": área de lavabo" }
  };
  /* o critério com nível e fonte, pronto para a tela/item */
  function criterio(k) { var c = CRITERIOS[k]; if (!c) return null; var ci = cite(c.regra); return { chave: k, valor: c.valor, rotulo: c.rotulo, regra: c.regra, nivel: ci.nivel, fonte: ci.fonte }; }
  /* texto de decisão: "circulação 0,60 m — dorm-circulacao-minima [S] (Correio Braziliense…)" */
  function porque(k, extra) {
    var c = criterio(k); if (!c) return { regra: k, nivel: "?", texto: extra || k, fonte: "" };
    return { regra: c.regra, nivel: c.nivel, texto: (extra || c.rotulo + " " + f2(c.valor) + (/× diagonal|÷ sofá|\(m²\)/.test(c.rotulo) ? "" : " m")), fonte: c.fonte };
  }

  /* ---------------------------------------------------------------- CLASSIFICADOR (PADROES §1) */
  var ACENTO = { "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "ê": "e", "è": "e", "í": "i", "ì": "i", "î": "i", "ó": "o", "ô": "o", "õ": "o", "ò": "o", "ú": "u", "ü": "u", "ù": "u", "ç": "c", "ñ": "n" };
  var PARA = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, o: 1, com: 1, para: 1, no: 1, na: 1 };
  /* minúsculas, sem acento, pontuação vira espaço; tira as palavras de ligação e os números/ordinais (o número só diferencia a instância) */
  function normalizar(s) {
    var t = String(s == null ? "" : s).toLowerCase().replace(/[áàâãäéêèíìîóôõòúüùçñ]/g, function (c) { return ACENTO[c] || c; });
    t = t.replace(/[º°ª]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    var tk = t.split(" ").filter(function (w) { return w && !PARA[w] && !/^\d+[a-z]?$/.test(w) && !/^(i|ii|iii|iv|v|vi)$/.test(w); });
    /* letra solta FINAL ("Quarto A") sai; "a s" (área de serviço) fica — é testado antes como frase */
    while (tk.length > 1 && tk[tk.length - 1].length === 1 && !(tk[tk.length - 2] === "a" && tk[tk.length - 1] === "s")) tk.pop();
    return tk.join(" ");
  }
  /* ordem de prioridade: o primeiro grupo que casa vence ("Banho suíte" é banheiro; "Sala de reunião" não é sala de estar) */
  var GRUPOS = [
    ["lavabo", ["lavabo", "lavab", "toalete", "toilette", "wc social", "banheiro visitas", "banheiro social visitas"]],
    ["banheiro", ["banheiro", "banho", "bwc", "wc", "sanitario", "bh", "bnh", "ducha"]],
    ["closet", ["closet", "vestiario", "guarda roupa"]],
    ["cozinha-americana", ["cozinha americana", "cozinha integrada", "cozinha aberta", "cozinha sala", "cozinha estar"]],
    ["area-gourmet", ["gourmet", "churrasqueira", "churrasq", "espaco gourmet", "edicula", "area lazer", "varanda", "sacada", "terraco"]],
    ["despensa", ["despensa", "deposito", "dispensa"]],
    ["cozinha", ["cozinha", "coz", "cz", "copa"]],
    ["lavanderia", ["lavanderia", "area servico", "a s", "as", "servico", "tanque"]],
    ["home-office", ["home office", "escritorio residencial", "estudo", "biblioteca", "sala estudos", "atelie"]],
    ["escritorio", ["escritorio", "sala comercial", "sala adm", "administracao"]],
    ["recepcao", ["recepcao", "lobby", "espera", "sala espera"]],
    ["sala-reuniao", ["reuniao", "sala reunioes", "sala conferencia", "conferencia"]],
    ["consultorio", ["consultorio", "sala atendimento", "sala exames"]],
    ["loja", ["loja", "showroom", "sala vendas", "balcao"]],
    ["suite", ["suite", "master"]],
    ["dormitorio-infantil", ["infantil", "kids", "bebe", "crianca", "filho", "filha", "berco"]],
    ["dormitorio-solteiro", ["solteiro", "hospedes", "hospede", "visita", "visitas", "quarto empregada", "dependencia"]],
    ["dormitorio-casal", ["dormitorio", "dorm", "quarto", "qto", "qt", "casal"]],
    ["sala-estar-jantar", ["living", "sala estar jantar", "estar jantar", "sala integrada", "estar e jantar"]],
    ["sala-jantar", ["jantar", "sala jantar"]],
    ["sala-estar", ["sala", "estar", "sala tv", "tv", "estar intimo", "home theater", "lounge"]],
    ["hall", ["hall", "entrada", "foyer", "vestibulo", "antessala"]],
    ["circulacao", ["circulacao", "corredor", "escada", "passagem"]],
    ["garagem", ["garagem", "abrigo", "vaga"]]
  ];
  var PRE = [["quarto servico", "dormitorio-solteiro"], ["dormitorio servico", "dormitorio-solteiro"], ["quarto empregada", "dormitorio-solteiro"], ["dependencia empregada", "dormitorio-solteiro"]];
  var NOMES = { lavabo: "Lavabo", banheiro: "Banheiro", closet: "Closet", "cozinha-americana": "Cozinha americana", "area-gourmet": "Área gourmet / varanda", despensa: "Despensa", cozinha: "Cozinha",
    lavanderia: "Lavanderia / área de serviço", "home-office": "Home office", escritorio: "Escritório", recepcao: "Recepção", "sala-reuniao": "Sala de reunião", consultorio: "Consultório", loja: "Loja",
    suite: "Suíte", "dormitorio-infantil": "Dormitório infantil", "dormitorio-solteiro": "Dormitório de solteiro", "dormitorio-casal": "Dormitório de casal", "sala-estar-jantar": "Estar/jantar integrado",
    "sala-jantar": "Sala de jantar", "sala-estar": "Sala de estar", hall: "Hall de entrada", circulacao: "Circulação", garagem: "Garagem" };
  /* distância de edição ≤ 1 (erro de digitação leve: "lavanderai", "banehiro") */
  function dist1(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, dif = 0;
    while (i < la && j < lb) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      if (++dif > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else if (i + 1 < la && a.charAt(i) === b.charAt(j + 1) && a.charAt(i + 1) === b.charAt(j)) { i += 2; j += 2; } else { i++; j++; }
    }
    return dif + (la - i) + (lb - j) <= 1;
  }
  function casa(n, chave) {
    if (chave.indexOf(" ") >= 0) return (" " + n + " ").indexOf(" " + chave + " ") >= 0;
    var tk = n.split(" ");
    for (var i = 0; i < tk.length; i++) { if (tk[i] === chave) return "exato"; }
    if (chave.length >= 5) for (var j = 0; j < tk.length; j++) if (tk[j].length >= 5 && dist1(tk[j], chave)) return "digitacao";
    return false;
  }
  /* classificar(nome, { area, menorDim, usuario }) → { id, nome, casou, por, aviso } */
  function classificar(nome, info) {
    info = info || {};
    if (info.usuario && NOMES[info.usuario]) return { id: info.usuario, nome: NOMES[info.usuario], casou: true, por: "usuario" };
    var n = normalizar(nome);
    if (!n) return { id: "", nome: "", casou: false, por: "nome", aviso: "ambiente sem nome" };
    /* "Lav" sozinho: lavabo × lavanderia pela área (PADROES 1.3) */
    if (n === "lav" || n === "lav social") {
      var lim = CRITERIOS.lavArea.valor;
      if (info.area == null) return { id: "", nome: "", casou: false, por: "nome", aviso: "\"" + nome + "\": lavabo ou lavanderia? Escolha o tipo." };
      var ehLavabo = info.area <= lim + 1e-9;
      return { id: ehLavabo ? "lavabo" : "lavanderia", nome: NOMES[ehLavabo ? "lavabo" : "lavanderia"], casou: true, por: "area", regra: "ra-lav-area",
        aviso: "\"" + nome + "\": decidi pela área (" + f2(info.area) + " m² " + (ehLavabo ? "≤" : ">") + " " + f2(lim) + " m², ra-lav-area [P]) — troque o tipo se não for." };
    }
    /* frases que vencem a ordem: "Quarto de serviço" é quarto (o "serviço" da lavanderia vem antes na lista) */
    for (var q = 0; q < PRE.length; q++) if (casa(n, PRE[q][0])) return { id: PRE[q][1], nome: NOMES[PRE[q][1]], casou: true, por: "nome", chave: PRE[q][0] };
    for (var g = 0; g < GRUPOS.length; g++) {
      var ks = GRUPOS[g][1];
      for (var k = 0; k < ks.length; k++) {
        var m = casa(n, ks[k]);
        if (!m) continue;
        var id = GRUPOS[g][0], out = { id: id, nome: NOMES[id], casou: true, por: m === "digitacao" ? "digitacao" : "nome", chave: ks[k] };
        if (m === "digitacao") out.aviso = "\"" + nome + "\": li \"" + ks[k] + "\" (erro de digitação?)";
        /* dormitório sem palavra-chave ("Dorm 2", "Quarto"): casal pela menor dimensão (PADROES 1.3 [D]) */
        if (id === "dormitorio-casal" && ks[k] !== "casal" && info.menorDim != null) {
          var lm = CRITERIOS.dormCasalDim.valor;
          if (info.menorDim < lm - 1e-9) { out.id = "dormitorio-solteiro"; out.nome = NOMES[out.id]; }
          out.por = "dimensao"; out.regra = "ra-dorm-casal-dimensao";
          out.aviso = "\"" + nome + "\": " + (out.id === "dormitorio-casal" ? "casal" : "solteiro") + " pela menor dimensão (" + f2(info.menorDim) + " m " + (out.id === "dormitorio-casal" ? "≥" : "<") + " " + f2(lm) + " m, ra-dorm-casal-dimensao [D]) — troque o tipo se não for.";
        }
        return out;
      }
    }
    return { id: "", nome: "", casou: false, por: "nome", aviso: "\"" + nome + "\": nome sem tipo conhecido — não lancei nada (escolha o tipo do ambiente)." };
  }

  /* ---------------------------------------------------------------- PROGRAMAS (PADROES §3 e §4) — para a tela e o teste.
     `obrig` falta = alerta ao usuário; `opc` cai calado SÓ se o usuário desligou, senão cai com o motivo. */
  var PROGRAMAS = {
    "dormitorio-casal": { fonte: "PADROES-AMBIENTES 3.8", obrig: ["cama", "criado-mudo ×2", "guarda-roupa"], opc: ["cômoda", "tapete"] },
    suite: { fonte: "PADROES-AMBIENTES 3.8", obrig: ["cama", "criado-mudo ×2", "guarda-roupa"], opc: ["cômoda", "poltrona", "tapete"] },
    "dormitorio-solteiro": { fonte: "PADROES-AMBIENTES 3.9", obrig: ["cama de solteiro", "criado-mudo", "guarda-roupa"], opc: ["escrivaninha + cadeira", "tapete"] },
    "dormitorio-infantil": { fonte: "PADROES-AMBIENTES 3.9", obrig: ["cama de solteiro", "criado-mudo", "guarda-roupa"], opc: ["escrivaninha + cadeira", "estante", "tapete"] },
    "sala-estar": { fonte: "PADROES-AMBIENTES 3.1", obrig: ["rack/painel", "TV", "sofá", "mesa de centro"], opc: ["poltrona", "tapete", "aparador"] },
    "sala-jantar": { fonte: "PADROES-AMBIENTES 3.2", obrig: ["mesa de jantar", "cadeiras (× lugares)"], opc: ["buffet/aparador"] },
    "sala-estar-jantar": { fonte: "PADROES-AMBIENTES 3.3", obrig: ["estar (3.1)", "jantar (3.2)"], opc: ["os opcionais de 3.1 e 3.2"] },
    cozinha: { fonte: "PADROES-AMBIENTES 3.4", obrig: ["geladeira", "fogão/cooktop", "armário base planejado (bancada)", "coifa"], opc: ["armário aéreo planejado"] },
    "cozinha-americana": { fonte: "PADROES-AMBIENTES 3.5", obrig: ["o da cozinha (3.4)"], opc: ["armário aéreo planejado"] },
    lavanderia: { fonte: "PADROES-AMBIENTES 3.7", obrig: ["tanque com gabinete", "lava e seca"], opc: [] },
    "home-office": { fonte: "PADROES-AMBIENTES 3.13", obrig: ["escrivaninha", "cadeira giratória"], opc: ["estante"] },
    escritorio: { fonte: "PADROES-AMBIENTES 4.1", obrig: ["mesa de trabalho", "cadeira giratória", "gaveteiro", "armário baixo"], opc: ["cadeira de visitante ×2"] },
    "sala-reuniao": { fonte: "PADROES-AMBIENTES 4.3", obrig: ["mesa de reunião", "cadeiras (× lugares)"], opc: ["armário baixo"] },
    recepcao: { fonte: "PADROES-AMBIENTES 4.2", obrig: ["balcão", "cadeira do atendente", "longarina"], opc: [] },
    consultorio: { fonte: "PADROES-AMBIENTES 4.4", obrig: ["mesa", "cadeira giratória", "cadeira de visitante ×2", "maca"], opc: [] },
    loja: { fonte: "PADROES-AMBIENTES 4.5", obrig: ["balcão (caixa)", "vitrine"], opc: ["vitrine (2ª)"] },
    hall: { fonte: "PADROES-AMBIENTES 3.14", obrig: [], opc: ["aparador estreito", "cabideiro/banco"] },
    closet: { fonte: "PADROES-AMBIENTES 3.10", obrig: ["armário planejado (roupeiro aberto)"], opc: ["2ª fileira (paralela)"] },
    "area-gourmet": { fonte: "PADROES-AMBIENTES 3.6", obrig: ["churrasqueira", "mesa de varanda", "cadeiras ×4"], opc: ["espreguiçadeira"] },
    banheiro: { fonte: "PADROES-AMBIENTES 3.11", obrig: [], opc: [], nada: "louças, box e bancada são lançados pelo Hidrossanitário (Lançar pelo ambiente)" },
    lavabo: { fonte: "PADROES-AMBIENTES 3.12", obrig: [], opc: [], nada: "louças e bancada são lançadas pelo Hidrossanitário" },
    circulacao: { fonte: "PADROES-AMBIENTES 3.14", obrig: [], opc: [], nada: "circulação fica livre (acess-9050-corredor-4m)" },
    despensa: { fonte: "—", obrig: [], opc: [], nada: "despensa: prateleiras e torre planejada são de projeto de marcenaria (não lançado)" },
    garagem: { fonte: "—", obrig: [], opc: [], nada: "garagem não tem mobiliário no programa" }
  };

  var MobRegras = { classificar: classificar, normalizar: normalizar, regra: regra, cite: cite, criterio: criterio, porque: porque, CRITERIOS: CRITERIOS, CRIT_RA: CRIT_RA,
    PROGRAMAS: PROGRAMAS, NOMES: NOMES, NIVEIS: NIVEIS, nivelDe: nivelDe, dist1: dist1, f2: f2,
    ids: function () { return Object.keys(POR_ID); } };
  global.MobRegras = MobRegras;
  if (typeof module !== "undefined" && module.exports) module.exports = MobRegras;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
