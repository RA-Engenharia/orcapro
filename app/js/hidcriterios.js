/* =====================================================================
 * hidcriterios.js — CRITÉRIO DE PROJETISTA em todo o traçado (18/10/2026).
 * Motor PURO, ES5, Node-testável. Documento: docs/hidro/CRITERIOS-DE-PROJETISTA.md.
 *
 * Pedido do Rogério: "Nenhum engenheiro ou projetista pode olhar e falar 'que bosta é essa'. Ele vai analisar a
 * parede, a janela; não vai subir um tubo na janela." Vale para TODO o traçado — água fria, quente, esgoto,
 * ventilação, pluvial, dreno e frigorígeno —, automático ou desenhado à mão.
 *
 *   HidCriterios.auditar(entrada) → { apontamentos[], nota, conceito, contagem, custo, custoMotor }
 *   HidCriterios.doEstado(estado, avaliarFam, extra) → a entrada do auditor a partir do modelo do BIM
 *   HidCriterios.caixasAbertura(abertura, par) → as ZONAS de uma porta/janela (vão, verga, contraverga) — as mesmas
 *       que o HidRota usa como PROIBIDO na busca (motor e auditor nunca discordam do que é "passar na janela")
 *
 * Cada apontamento: { id, regra, gravidade: "dura"|"alerta"|"sugestao", titulo, texto, porque, fonte, ids[],
 *   obstaculo, ponto{x,y,z}, corrigir{tipo, ids, aparelhos?, texto} }.
 *   dura     = PROIBIDO: o motor descarta a estratégia que a tem; no desenho à mão, vermelho.
 *   alerta   = permitido com custo (penalidade no motor) e aviso; decisão que o projetista conferiria.
 *   sugestao = leitura/economia; custo pequeno.
 *
 * ⚠ NENHUM valor de norma escrito aqui (tools/test-hid-sem-numero-magico.js): as distâncias da NBR 8160 (inspeção,
 *   terminal de ventilação) e da NBR 15526 (gás) vêm do HidNormas, com a fonte; os números deste arquivo são
 *   CRITÉRIO DE PROJETO declarado (hid:ok), todos trocáveis em entrada.parametros e listados no documento.
 *   O bloco do furo em viga (NBR 6118 13.2.5.1) é texto de norma sem tabela no HidNormas: fica num bloco
 *   hid:fisica com a fonte, e o apontamento diz "conferir com o estrutural".
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  var INF = 1e9, EPS = 1e-6;   // hid:ok infinito numérico e tolerância de ponto flutuante
  var CASAS = 10000;           // hid:ok arredondamento a 4 casas (0,1 mm)
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function fcm(v) { return String(Math.round(v * 100)); }

  /* ⚠ CRITÉRIO DE PROJETO (não é norma) — cada um com o porquê no docs/hidro/CRITERIOS-DE-PROJETISTA.md §2.
     Trocáveis em entrada.parametros (mesmo nome). */
  var GEO = {
    folgaVao: 0.10,            // hid:ok do tubo até a borda do vão (batente/contramarco, chumbamento, requadro)
    transpasseVerga: 0.20,     // hid:ok verga/contraverga além do vão, de cada lado (prática; ver o documento)
    alturaVerga: 0.10,         // hid:ok altura da verga acima do vão
    alturaContraverga: 0.10,   // hid:ok altura da contraverga abaixo do peitoril
    alturaSoleira: 0.30,       // hid:ok faixa do piso sob a soleira da porta (enchimento)
    folgaEstrutura: 0.03,      // hid:ok do tubo até pilar (contornar, nunca encostar)
    cobrimentoParede: 0.015,   // hid:ok argamassa sobre o tubo embutido, de cada lado
    afastamento: 0.10,         // hid:ok água × esgoto/ventilação/elétrica, livre entre geratrizes (o mesmo do HidRota)
    distParede: 0.60,          // hid:ok tubo "no meio do cômodo": mais longe que isto de qualquer parede
    compMinLeitura: 1.0,       // hid:ok trecho curto (≤ 1 m) não conta como "atravessa o cômodo"
    desvioMax: 0.60,           // hid:ok um "dente" (sai e volta) de até 60 cm é desvio a conferir
    chanfroMax: 0.30,          // hid:ok perna diagonal até 30 cm = desvio de 45° de um canto (não é diagonal solta)
    faixaCruzamento: 0.60,     // hid:ok água × esgoto que se cruzam na MESMA faixa (enchimento, vala, parede, forro): até 60 cm livres entre eles; mais longe (outro andar, teto × piso) não é o cruzamento da regra
    diagonalMax: 1.0,          // hid:ok desvio de 45° do esgoto até 1 m é leitura normal
    tolAngulo: 0.035,          // hid:ok ~2° de tolerância para "paralelo à parede"
    registroMin: 0.30,         // hid:ok registro acessível: no mínimo 30 cm acima do piso
    registroMax: 2.20,         // hid:ok registro acessível: no máximo 2,20 m acima do piso (sem escada)
    alturaForro: 2.00,         // hid:ok acima disto, no cômodo, é a zona do forro/teto
    faceAmbiente: 0.15,        // hid:ok além da face da parede, onde se procura o cômodo vizinho
    tolNo: 0.01,               // hid:ok duas pontas a menos de 1 cm são o mesmo nó
    inclHoriz: 0.15,           // hid:ok |Δy|/L abaixo disto = trecho "horizontal" (o esgoto tem declividade)
    vertMax: 0.05,             // hid:ok planta/|Δy| abaixo disto = trecho vertical
    embutidoMin: 0.10,         // hid:ok trecho dentro da parede por mais que isto (além da espessura) = embutido
    sobeDesceMin: 0.10,        // hid:ok subida/descida de mais de 10 cm conta como ponto alto
    barra: 6.0                 // hid:ok barra comercial (m): emenda em reta mais longa que isto é a luva da barra
  };
  /* a nota: quanto cada gravidade tira de 100; com qualquer DURA a nota não passa do teto */
  var TOL_FOLGA = 0.002;   // hid:ok 2 mm de arredondamento nas folgas (o motor aceita o limite com 1 mm de sobra)
  var GEO_DN_RUIDO = 75;   // hid:ok DN a partir do qual o esgoto embutido é ramal de bacia/tubo de queda (ruído forte)
  var NOTA = { dura: 20, alerta: 5, sugestao: 2, tetoComDura: 40 };   // hid:ok pesos da nota (não é norma)
  var CONCEITO = [[90, "Ótimo"], [75, "Bom"], [50, "Regular"], [0, "Ruim"]];   // hid:ok faixas da nota

  /* hid:fisica-inicio — ABNT NBR 6118:2014, 13.2.5.1 (furos que atravessam vigas na direção da largura): dispensa
     verificação o furo em zona de tração, a ≥ 2h da face do apoio, com dimensão ≤ 12 cm e ≤ h/3, e distância entre
     furos ≥ 2h no mesmo tramo. Valores do texto da norma; exemplar não licenciado na biblioteca da RA — conferir. */
  var NBR6118_FURO = { distApoio_h: 2, dimMax_m: 0.12, fracaoAltura: 1 / 3 };
  /* hid:fisica-fim */

  /* ---------------------------------------------------------------- REGRAS
     custo = metros equivalentes somados ao custo da opção no HidRota (motor: false = o HidRota já conta). */
  var R = {};
  function regra(id, o) { o.id = id; R[id] = o; }
  /* FRENTE H6 (21/10/2026): o APARELHO A GÁS pela ABNT NBR 13103:2020 (js/hidgas.js) — local, potência, volume e ventilação, exaustão,
     posição, registros e os pontos de gás/força. É conferência do APARELHO, não do traçado: vai à lista com Mostrar/Corrigir, mas NÃO
     entra na nota do traçado nem na contagem de proibidos que trava o Aplicar do Traçar (a contagem própria é contagem.gas) */
  regra("gas13103", { gravidade: "alerta", custo: 0, motor: false, titulo: "Aparelho a gás (NBR 13103)",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Local proibido, volume e ventilação permanente do ambiente, exaustão (cobertura, trechos, terminal na fachada), posição do aquecedor, registros e os pontos de gás e de força — os valores da ABNT NBR 13103:2020, com o item em cada achado.",
    fonte: "ABNT NBR 13103:2020 — valores com o item (exemplar não licenciado à RA; texto conferido; a vigente é a 2024 = 2020 + Emenda 1, não lida — conferir)", corrigir: "Conforme o achado: trocar o tipo, ajustar a altura, lançar a tomada — ou mudar o aparelho de lugar" });
  regra("caixa.laje", { gravidade: "dura", custo: 0, motor: false, titulo: "Corpo da caixa/ralo dentro da laje",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "O corpo da caixa sifonada (ou do ralo) desce até a cota da tubulação e o prolongador enche até o piso; com o rebaixo raso o fundo do corpo entra na laje estrutural — na obra não cabe sem quebrar a laje.",
    fonte: "critério de projeto (prioridade de 21/10/2026: corpo na cota da tubulação, prolongador até o piso)", corrigir: "Aumentar o rebaixo da laje (estrutural) ou subir o ramal; com caixa de saída mais baixa no corpo, trocar a caixa" });
  regra("abertura.vao", { gravidade: "dura", custo: 0, titulo: "Tubo no vão de porta ou janela",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "O vão é da esquadria: tubo ali impede o batente/contramarco, fica à vista ou é cortado na instalação da esquadria. O tubo embutido passa ACIMA da verga, ABAIXO do peitoril/contraverga ou contorna o vão pela parede ao lado, com folga.",
    fonte: "critério de projeto (o vão é da esquadria; folga lateral declarada em docs/hidro/CRITERIOS-DE-PROJETISTA.md)", corrigir: "Refazer o trecho contornando o vão" });
  regra("abertura.verga", { gravidade: "dura", custo: 0, titulo: "Tubo cortando verga ou contraverga",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Verga e contraverga distribuem a carga sobre o vão e seguram a fissura do canto; rasgar para passar tubo derruba a função delas.",
    fonte: "critério de projeto; a ABNT NBR 8545:1984 (execução de alvenaria) trata de vergas e contravergas além do vão — os 20 cm de cada lado e 10 cm de altura usados aqui são a medida usual de projeto, item e valor a conferir no exemplar", corrigir: "Refazer o trecho fora da verga/contraverga" });
  regra("abertura.soleira", { gravidade: "alerta", custo: 1.0, motor: false, titulo: "Tubo sob a soleira da porta",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "A soleira é o ponto fraco da impermeabilização do ambiente molhado; tubo ali vira caminho de umidade e não tem acesso.",
    fonte: "critério de projeto (a soleira é ponto crítico da impermeabilização do ambiente molhado)", corrigir: "Refazer o trecho sem passar sob a porta" });
  regra("estrutura.pilar", { gravidade: "dura", custo: 0, titulo: "Tubo atravessando pilar",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Canalização embutida em pilar não é permitida; o tubo contorna o pilar.",
    fonte: "ABNT NBR 6118:2014, 13.2.6 (canalizações embutidas em pilares não são permitidas) — conferir no exemplar", corrigir: "Refazer o trecho contornando o pilar" });
  regra("estrutura.viga", { gravidade: "dura", custo: 0, titulo: "Furo em viga",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Furo em viga é decisão do estrutural; o traçado contorna (por baixo, no forro) ou passa por furo previsto.",
    fonte: "ABNT NBR 6118:2014, 13.2.5.1 (furos em vigas) — conferir no exemplar", corrigir: "Refazer o trecho por baixo da viga (ou pedir o furo ao estrutural)" });
  regra("estrutura.vigaZona", { gravidade: "alerta", custo: 2.0, motor: false, titulo: "Furo em viga liberado (dentro da zona da NBR 6118)",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "O furo foi liberado e cai na zona que dispensa verificação (≥ 2h do apoio, ≤ 12 cm e ≤ h/3); o estrutural ainda confirma a zona de tração e as armaduras.",
    fonte: "ABNT NBR 6118:2014, 13.2.5.1 — conferir no exemplar", corrigir: "Levar ao estrutural (aval do furo)" });
  regra("estrutura.laje", { gravidade: "alerta", custo: 0, motor: false, titulo: "Furo na laje",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Passagem pela laje só por shaft ou furo previsto (passante/camisa) na fôrma; furo depois de concretada corta armadura.",
    fonte: "ABNT NBR 6118:2014, 13.2.5 (aberturas em lajes) — conferir no exemplar; critério de projeto: passante previsto", corrigir: "Prever o passante/shaft com o estrutural" });
  regra("parede.fina", { gravidade: "alerta", custo: 2.0, titulo: "Parede fina para o tubo",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "A parede não cobre o tubo com argamassa dos dois lados: trinca, aparece ou exige rasgo que atravessa a parede.",
    fonte: "critério de projeto (DE do tubo + cobrimento de cada lado)", corrigir: "Refazer por outra parede (ou prever shaft/enchimento)" });
  regra("parede.drywall", { gravidade: "alerta", custo: 1.0, titulo: "Tubo em parede de drywall",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Drywall não é rasgado: o tubo corre entre os montantes, com fixação e furo de passagem previsto no montante (kit do fabricante).",
    fonte: "critério de projeto (sistema drywall: instalações entre montantes)", corrigir: "Conferir a fixação entre montantes" });
  regra("parede.divisa", { gravidade: "alerta", custo: 3.0, titulo: "Tubo na parede de divisa",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Parede de divisa é limite do lote: manutenção depende do vizinho e vazamento passa para o outro lado.",
    fonte: "critério de projeto", corrigir: "Refazer o trecho por uma parede interna" });
  regra("parede.esgotoPermanencia", { gravidade: "alerta", custo: 2.0, titulo: "Esgoto embutido em parede de dormitório/sala",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "O ruído da descarga atravessa a parede para o ambiente de permanência prolongada; prefira a parede hidráulica (a do próprio banheiro) ou shaft com isolamento.",
    fonte: "critério de projeto (conforto acústico; ABNT NBR 15575 trata do desempenho acústico — sem valor aplicado aqui)", corrigir: "Refazer pela parede hidráulica" });
  regra("forro.esgotoSobreSeco", { gravidade: "alerta", custo: 2.0, titulo: "Esgoto no forro de ambiente seco",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Esgoto sob a laje, no forro de sala/quarto: ruído e risco de vazamento no teto de quem não tem área molhada; prefira o rebaixo do próprio banheiro ou forro removível com aviso.",
    fonte: "critério de projeto", corrigir: "Refazer pelo piso/rebaixo do ambiente molhado" });
  regra("economia.zigueZague", { gravidade: "sugestao", custo: 1.0, titulo: "Desvio desnecessário (zigue-zague)",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "O tubo sai da linha e volta sem nada no caminho: duas a quatro conexões a mais, perda de carga e leitura ruim.",
    fonte: "critério de projeto (menor comprimento e menor número de conexões)", corrigir: "Refazer o trecho em linha reta" });
  regra("economia.luva", { gravidade: "sugestao", custo: 0.5, titulo: "Emenda desnecessária",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Dois trechos alinhados, do mesmo diâmetro, emendados no meio sem derivação: uma luva a mais à toa.",
    fonte: "critério de projeto", corrigir: "Juntar os dois trechos" });
  regra("economia.sobeDesce", { gravidade: "alerta", custo: 1.5, titulo: "Sobe e desce no ramal de água",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Ponto alto no meio do ramal junta ar (bolsa de ar), faz ruído e golpe; suba e desça só onde precisa.",
    fonte: "critério de projeto (ponto alto sem saída de ar)", corrigir: "Refazer o trecho sem o ponto alto" });
  regra("leitura.diagonal", { gravidade: "sugestao", custo: 1.0, titulo: "Tubo em diagonal",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Tubo de água, ventilação ou elétrica corre paralelo às paredes: diagonal não se embute, não se acha na obra e não se lê na prancha.",
    fonte: "critério de projeto", corrigir: "Refazer paralelo às paredes" });
  regra("leitura.atravessaComodo", { gravidade: "sugestao", custo: 1.5, titulo: "Tubo cruzando o cômodo pelo meio",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Corre junto às paredes: no meio do cômodo o tubo fica sob o piso ou no forro onde ninguém espera, sem acesso e no caminho de outras instalações.",
    fonte: "critério de projeto", corrigir: "Refazer junto às paredes" });
  /* FRENTE H1 (20/10/2026, R-C7/R-A14 do docs/hidro/PADROES-PROJETO-RA.md): no cruzamento a geratriz inferior da água fica ACIMA da
     superior do esgoto, com a folga da tabela (af2020.cruzamento_esgoto — NBR 5626:2020 6.5.3.2). Era alerta comparando os EIXOS (um
     DN 20 "acima" do eixo de um DN 100 passava por dentro dele); agora é PROIBIDO pelas geratrizes: o motor descarta a estratégia
     (desvio = outra estratégia) e, sem nenhuma, o descarte diz por quê. O enterrado (fora da edificação) pede o desnível usual. */
  regra("interferencia.aguaSobEsgoto", { gravidade: "dura", custo: 0, titulo: "Água passando por baixo do esgoto",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "No cruzamento a água fica ACIMA do esgoto — a geratriz inferior da água acima da superior do esgoto: um vazamento de esgoto não escorre sobre o tubo de água potável (proteção sanitária).",
    fonte: "ABNT NBR 5626:2020, 6.5.3.2 (pelo HidNormas, af2020.cruzamento_esgoto); dentro da edificação, prática de projetista", corrigir: "Refazer com a água acima do esgoto (pela parede ou pelo forro)" });
  regra("interferencia.cruzamentoEnterrado", { gravidade: "alerta", custo: 1.0, titulo: "Cruzamento enterrado com pouco desnível",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Fora da edificação, enterrados, a água passa acima do esgoto com o desnível usual dos memoriais: o solo em volta de um vazamento de esgoto não chega ao tubo de água.",
    fonte: "memorial de projeto (fonte secundária, pelo HidNormas: af2020.cruzamento_esgoto)", corrigir: "Refazer o cruzamento com o desnível (água mais rasa ou esgoto mais fundo)" });
  regra("interferencia.afastamento", { gravidade: "alerta", custo: 1.0, motor: false, titulo: "Tubos colados",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Água e esgoto/ventilação/elétrica precisam de espaço livre entre si para montagem, isolamento e manutenção.",
    fonte: "critério de projeto (afastamento livre entre geratrizes)", corrigir: "Refazer com o afastamento" });
  regra("interferencia.gas", { gravidade: "dura", custo: 0, titulo: "Gás sem o afastamento da NBR 15526",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Tubulação de gás tem afastamento mínimo de elétrica, água e esgoto (paralelo e cruzamento).",
    fonte: "ABNT NBR 15526 (Tabela 1 — afastamentos), pelo HidNormas", corrigir: "Refazer com o afastamento da norma" });
  regra("interferencia.louca", { gravidade: "dura", custo: 0, motor: false, titulo: "Tubo atravessando louça/equipamento",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "O tubo não passa por dentro de bacia, lavatório, tanque, box ou equipamento: chega no ponto da peça pela parede ou pelo piso.",
    fonte: "critério de projeto (volume da família)", corrigir: "Refazer o trecho fora do volume da peça" });
  regra("registro.atrasPorta", { gravidade: "alerta", custo: 2.0, titulo: "Registro atrás da porta",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Com a porta aberta o registro some atrás da folha: na emergência ninguém acha nem alcança.",
    fonte: "critério de projeto (registro na posição de uso)", corrigir: "Refazer com o registro fora do giro da porta" });
  regra("registro.inacessivel", { gravidade: "alerta", custo: 2.0, titulo: "Registro fora de alcance",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Registro no piso, no enchimento ou acima do forro não se opera sem quebrar ou subir em escada.",
    fonte: "critério de projeto (registro acessível, na altura de uso)", corrigir: "Refazer com o registro na parede, na altura de uso" });
  regra("manutencao.inspecao", { gravidade: "alerta", custo: 2.0, titulo: "Esgoto longe de inspeção",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Trecho de esgoto sem dispositivo de inspeção dentro da distância da norma não se desentope sem quebrar.",
    fonte: "ABNT NBR 8160:1999, 4.2.6.2 (distâncias de inspeção), pelo HidNormas", corrigir: "Prever caixa de inspeção ou tê de inspeção" });
  regra("implantacao.caixaDentro", { gravidade: "alerta", custo: 3.0, titulo: "Caixa de inspeção/gordura dentro de ambiente",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "Caixa de inspeção e de gordura ficam fora da edificação: abrir dentro de casa traz odor e sujeira e exige quebrar piso.",
    fonte: "docs/hidro/PADRAO-IMPLANTACAO-ESGOTO.md (padrão de implantação das caixas) e critério de projeto", corrigir: "Refazer com a caixa fora da edificação" });
  regra("ventilacao.terminalJanela", { gravidade: "alerta", custo: 2.0, titulo: "Terminal de ventilação perto de janela",   // hid:ok custo da regra em metros equivalentes (critério de projeto)
    porque: "A saída do tubo ventilador perto de janela devolve o gás do esgoto para dentro de casa.",
    fonte: "ABNT NBR 8160:1999, 4.3.5/4.3.6 (terminal do tubo ventilador), pelo HidNormas", corrigir: "Subir o terminal acima da verga ou afastar da janela" });

  /* -------------------------------------------------------------- AMBIENTES
     o uso pelo NOME (o que a pessoa escreveu no ambiente): molhado primeiro ("Banho suíte" é molhado) */
  function semAcento(s) { return txt(s).toLowerCase().replace(/[áàâã]/g, "a").replace(/[éê]/g, "e").replace(/[í]/g, "i").replace(/[óôõ]/g, "o").replace(/[ú]/g, "u").replace(/ç/g, "c"); }
  function classificarAmbiente(nome) {
    var s = semAcento(nome);
    if (/banh|\bwc\b|lavabo|sanit|cozinha|copa|servico|lavander|churrasq|gourmet|vestiario|ducha|\ba\.? ?s\.?\b/.test(s)) return "molhado";
    if (/dorm|quarto|suite|\bsala\b|estar|jantar|escrit|estudo|\bhome\b|living|\btv\b|biblio/.test(s)) return "permanencia";
    return "outro";
  }

  /* --------------------------------------------------------------- GEOMETRIA */
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function d3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  function caixaSeg(p1, p2, largura, y0, y1) {
    if (!p1 || !p2) return null;
    var a = { x: num(p1.x, NaN), z: num(p1.z, NaN) }, b = { x: num(p2.x, NaN), z: num(p2.z, NaN) };
    if (!isFinite(a.x) || !isFinite(a.z) || !isFinite(b.x) || !isFinite(b.z)) return null;
    var L = d2(a, b); if (!(L > EPS)) return null;
    return { cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, ux: (b.x - a.x) / L, uz: (b.z - a.z) / L, hl: L / 2, hw: Math.max(num(largura, 0), 0) / 2, y0: y0, y1: y1, p1: a, p2: b };
  }
  function caixaCentro(x, z, comp, larg, rotY, y0, y1) { var c = Math.cos(num(rotY, 0)), s = Math.sin(num(rotY, 0)); return { cx: x, cz: z, ux: c, uz: -s, hl: comp / 2, hw: larg / 2, y0: y0, y1: y1 }; }
  function local(o, x, z) { var dx = x - o.cx, dz = z - o.cz; return { u: dx * o.ux + dz * o.uz, v: -dx * o.uz + dz * o.ux }; }
  function mundo(o, u, v) { return { x: o.cx + u * o.ux - v * o.uz, z: o.cz + u * o.uz + v * o.ux }; }
  /* recorte 3D do segmento p-q na caixa orientada (inflada inf em planta, infY em cota) → {t0, t1} ou null */
  function recorte(o, p, q, inf, infY) {
    var a = local(o, p.x, p.z), b = local(o, q.x, q.z), du = b.u - a.u, dv = b.v - a.v, dy = q.y - p.y;
    var H = o.hl + inf, W = o.hw + inf, Y0 = o.y0 - infY, Y1 = o.y1 + infY, t0 = 0, t1 = 1;
    function clip(pp, qq) {
      if (Math.abs(pp) < EPS) return qq >= -EPS;
      var r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    }
    if (!clip(-du, a.u + H) || !clip(du, H - a.u) || !clip(-dv, a.v + W) || !clip(dv, W - a.v) || !clip(-dy, p.y - Y0) || !clip(dy, Y1 - p.y)) return null;
    return t1 - t0 > EPS ? { t0: t0, t1: t1 } : null;
  }
  function ptEm(p, q, t) { return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t }; }
  function ptSeg2(p, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > EPS ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t)); var c = { x: a.x + dx * t, z: a.z + dz * t };
    return { d: d2(p, c), t: t };
  }
  /* cruzamento em planta de dois segmentos (interior): {t, s} ou null */
  function cruzaPlanta(a, b, c, d) {
    var rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
    if (Math.abs(den) < EPS) return null;
    var t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, s = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
    return t > EPS && t < 1 - EPS && s > EPS && s < 1 - EPS ? { t: t, s: s } : null;
  }
  /* menor distância entre dois segmentos 3D */
  function segSeg3(p1, q1, p2, q2) {
    var d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z }, dd = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z }, r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
    var a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z, e = dd.x * dd.x + dd.y * dd.y + dd.z * dd.z, f = dd.x * r.x + dd.y * r.y + dd.z * r.z, s, t;
    if (a <= EPS && e <= EPS) return d3(p1, p2);
    if (a <= EPS) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
    else {
      var c = d1.x * r.x + d1.y * r.y + d1.z * r.z;
      if (e <= EPS) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else {
        var b = d1.x * dd.x + d1.y * dd.y + d1.z * dd.z, den = a * e - b * b;
        s = den > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
      }
    }
    return d3(ptEm(p1, q1, s), ptEm(p2, q2, t));
  }
  function dentroPoli(p, pts) {
    var dentro = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) dentro = !dentro;
    }
    return dentro;
  }
  function distPoli(p, pts) { var m = INF; for (var i = 0; i < pts.length; i++) m = Math.min(m, ptSeg2(p, pts[i], pts[(i + 1) % pts.length]).d); return m; }

  /* ---------------------------------------------------------- PARÂMETROS */
  function geo(par) {
    var p = {}; par = par || {};
    Object.keys(GEO).forEach(function (k) { p[k] = num(par[k], GEO[k]); });
    p.atravessarViga = !!par.atravessarViga;
    p.vigasLiberadas = arr(par.vigasLiberadas).map(String);
    return p;
  }

  /* ---------------------------------------------- ZONAS DE PORTA E JANELA
     abertura = { id, tipo:"porta"|"janela", p1, p2 (o vão em planta), espessura, y0 (base do vão), y1 (topo do vão) }
     → [{ parte: "vao"|"verga"|"contraverga", caixa }]. A mesma função serve o HidRota (busca) e o auditor. */
  function caixasAbertura(a, par) {
    var G = geo(par), porta = txt(a && a.tipo) !== "janela", out = [];
    var base = caixaSeg(a && a.p1, a && a.p2, num(a && a.espessura, 0), num(a && a.y0, 0), num(a && a.y1, INF));
    if (!base || !(base.hw > 0)) return out;
    function c(dl, y0, y1, parte) { var o = { cx: base.cx, cz: base.cz, ux: base.ux, uz: base.uz, hl: base.hl + dl, hw: base.hw, y0: y0, y1: y1 }; out.push({ parte: parte, caixa: o }); }
    c(G.folgaVao, base.y0, base.y1, "vao");
    if (base.y1 < INF / 2) c(G.transpasseVerga, base.y1, base.y1 + G.alturaVerga, "verga");
    if (!porta) c(G.transpasseVerga, base.y0 - G.alturaContraverga, base.y0, "contraverga");
    return out;
  }

  /* ------------------------------------------------------------- NORMAS */
  function normas() {
    var N = NN(), ctx = N ? N.contexto() : null, cache = {};
    function valor(chave, filtro, col, uso) {
      var k = chave + JSON.stringify(filtro) + col; if (k in cache) return cache[k];
      var c = ctx ? ctx.consulta(chave, filtro, col, uso) : { ok: false };
      return (cache[k] = c.ok ? num(c.valor, null) : null);
    }
    function fonte(chave) {
      var f = N && N.fonte ? N.fonte(chave) : null; if (!f) return null;
      return [f.doc || f.norma, f.tabela, f.pagina].filter(Boolean).join(" — ");
    }
    function linhas(chave, uso) { return ctx ? ctx.linhas(chave, null, uso) : null; }
    return { valor: valor, fonte: fonte, linhas: linhas, pendencias: function () { return ctx ? ctx.pendencias() : []; } };
  }

  /* ---------------------------------------------------------- NORMALIZAÇÃO */
  var AGUA = { agua_fria: 1, agua_quente: 1 }, ESG = { esgoto: 1, ventilacao: 1, pluvial: 1, dreno: 1 }, LIQ = { esgoto: 1, pluvial: 1, dreno: 1 };
  var ORTO = { agua_fria: 1, agua_quente: 1, ventilacao: 1, eletrica: 1, frigorigeno: 1, incendio: 1, industrial: 1, bandeja: 1 };
  function ehGas(t) { return t.sistema === "industrial" && /g[aá]s|glp|\bgn\b|natural/i.test(txt(t.fluido)); }
  function deTubo(t) {
    var Gm = dep("BimInstGeo", "./biminstgeo.js");
    try { var c = Gm && Gm.cotasTubo ? Gm.cotasTubo(t.material, t.dn) : null; if (c && c.de > 0) return c.de / 1000; } catch (e) {}
    return num(t.dn, 0) / 1000;
  }
  function normTrechos(lista, G) {
    return arr(lista).map(function (t) {
      if (!t || !t.p1 || !t.p2) return null;
      var p1 = { x: num(t.p1.x, NaN), y: num(t.p1.y, NaN), z: num(t.p1.z, NaN) }, p2 = { x: num(t.p2.x, NaN), y: num(t.p2.y, NaN), z: num(t.p2.z, NaN) };
      if (![p1.x, p1.y, p1.z, p2.x, p2.y, p2.z].every(isFinite)) return null;
      var Lh = d2(p1, p2), dy = p2.y - p1.y, L = Math.sqrt(Lh * Lh + dy * dy); if (!(L > EPS)) return null;
      var o = { id: String(t.id), sistema: txt(t.sistema), dn: num(t.dn, 0), material: t.material, fluido: t.fluido, p1: p1, p2: p2, L: L, Lh: Lh, dy: dy };
      o.de = deTubo(o); o.r = o.de / 2;
      o.vert = Lh <= G.vertMax * Math.abs(dy) + EPS;
      o.horiz = !o.vert && Math.abs(dy) <= G.inclHoriz * Lh + EPS;
      o.dir = Lh > EPS ? { x: (p2.x - p1.x) / Lh, z: (p2.z - p1.z) / Lh } : null;
      o.ap = t.ap != null ? String(t.ap) : null;
      o.passantes = arr(t.passantes);   /* N23: os passantes que o traçado lançou (laje + ponto) */
      return o;
    }).filter(Boolean);
  }
  function normParedes(o, G) {
    return arr(o.paredes).map(function (w) {
      var base = num(w.base, 0), cx = caixaSeg(w.p1, w.p2, num(w.espessura, 0), base, base + num(w.altura, INF)); if (!cx) return null;
      cx.id = w.id; cx.espessura = num(w.espessura, 0); cx.base = base;
      var tp = w.tipoParede, nuc = tp && arr(tp.camadas).filter(function (k) { return k && k.face === "nucleo"; })[0];
      cx.drywall = !!w.drywall || /drywall|gesso acartonado|steel ?frame/i.test(txt(tp && tp.rotulo) + " " + txt(nuc && (nuc.material + " " + nuc.rotulo)));
      cx.divisa = !!w.divisa;
      return cx;
    }).filter(Boolean);
  }

  /* ================================================================ AUDITAR */
  /* ---------------------------------------------------------------- TRAVESSIA DE LAJE (N23, 24/10/2026)
     onde um tubo NÃO deitado atravessa uma laje de verdade (placa mais grossa que o revestimento): a mesma conta do alerta
     "Furo na laje" e do lançamento do passante — os dois nunca discordam de onde o tubo fura a laje. T = normTrechos(...) */
  function travessiasLaje(T, lajes, G) {
    var out = [];
    arr(lajes).forEach(function (l) {
      var x0 = Math.min(num(l.x0, INF), num(l.x1, INF)), x1 = Math.max(num(l.x0, -INF), num(l.x1, -INF)), z0 = Math.min(num(l.z0, INF), num(l.z1, INF)), z1 = Math.max(num(l.z0, -INF), num(l.z1, -INF));
      var tp = num(l.topo, NaN), e = num(l.espessura, 0); if (!isFinite(tp) || !(e > G.cobrimentoParede * 4)) return;   // hid:ok placa de até 6 cm = revestimento, não laje
      var fundo = tp - e;
      arr(T).forEach(function (t) {
        if (t.horiz) return;
        var ylo = Math.min(t.p1.y, t.p2.y), yhi = Math.max(t.p1.y, t.p2.y); if (!(ylo < fundo + EPS && yhi > tp - EPS)) return;
        var s = (tp - t.p1.y) / (t.dy || 1), P = ptEm(t.p1, t.p2, Math.max(0, Math.min(1, s)));
        if (!(P.x >= x0 - EPS && P.x <= x1 + EPS && P.z >= z0 - EPS && P.z <= z1 + EPS)) return;
        out.push({ t: t, laje: l, P: P });
      });
    });
    return out;
  }
  /* o passante lançado vale para ESTA laje e ESTE ponto (até o raio do tubo + a folga de montagem da camisa) */
  function temPassante(t, l, P) {
    var tolP = Math.max(num(t.r, 0), 0) + GEO.tolNo;
    return arr(t.passantes).some(function (q) { return q && String(q.laje) === String(l.id) && Math.abs(num(q.x, INF) - P.x) <= tolP && Math.abs(num(q.z, INF) - P.z) <= tolP; });
  }
  /* LANÇA o passante em cada travessia de laje dos tubos de um lote (as ops de trecho, inclusive dentro de "lote") — muta as ops:
     op.passantes = [{ laje, x, y, z }] (substitui, idempotente). As lajes vêm do estado (HidRota.obstaculosDoBim). O eletroduto
     embutido na laje não é "passante" (vai na laje): fica de fora. → o número de passantes lançados e os trechos */
  function lancarPassantes(ops, estado, avaliarFam) {
    var H = HR(), O = H && H.obstaculosDoBim ? H.obstaculosDoBim(estado, avaliarFam) : { lajes: [] }, lista = [], n = 0, ids = [];
    (function rec(L) { arr(L).forEach(function (o) { if (!o) return; if (o.op === "lote") rec(o.ops); else if (o.op === "trecho" && !/^(eletrica|bandeja|dados)$/.test(txt(o.sistema))) lista.push(o); }); })(ops);
    lista.forEach(function (o) {
      var T = normTrechos([o], GEO); if (!T.length) return;
      var tv = travessiasLaje(T, O.lajes, GEO);
      if (!tv.length) { if (o.passantes) delete o.passantes; return; }
      o.passantes = tv.map(function (x) { return { laje: String(x.laje.id), x: r4(x.P.x), y: r4(x.P.y), z: r4(x.P.z) }; });
      n += tv.length; ids.push(String(o.id));
    });
    return { n: n, trechos: ids };
  }
  function auditar(E) {
    E = E || {};
    var G = geo(E.parametros), O = E.obstaculos || {}, N = normas(), out = [], vistos = {};
    var T = normTrechos(E.trechos, G), porId = {}; T.forEach(function (t) { porId[t.id] = t; });
    var escopo = E.escopo ? {} : null; arr(E.escopo).forEach(function (id) { escopo[String(id)] = 1; });
    var paredes = normParedes(O, G);
    var aberturas = arr(O.aberturas).map(function (a) { return { a: a, zonas: caixasAbertura(a, G) }; });
    var ambientes = arr(E.ambientes || O.ambientes).map(function (a) {
      var cont = arr(a && (a.contorno || (a.calc && a.calc.contorno))).filter(function (q) { return q && isFinite(num(q.x, NaN)) && isFinite(num(q.z, NaN)); });
      if (cont.length < 3) return null;   // hid:ok polígono tem 3+ vértices
      var base = num(a.base, num(a.calc && a.calc.base, 0));
      return { id: String(a.id), nome: txt(a.nome) || String(a.id), uso: a.uso || classificarAmbiente(a.nome), contorno: cont, base: base, topo: num(a.topo, num(a.calc && a.calc.topo, base + INF)) };
    }).filter(Boolean);
    /* divisas: as paredes sobre a linha do lote (eixo a menos de meia espessura + 5 cm de uma aresta) */
    arr(O.divisas).forEach(function (dv) {
      var c = arr(dv && dv.contorno); if (c.length < 2) return;
      paredes.forEach(function (w) { for (var i = 0; i < c.length; i++) { var a = c[i], b = c[(i + 1) % c.length]; if (ptSeg2(w.p1, a, b).d <= w.hw + G.tolNo * 5 && ptSeg2(w.p2, a, b).d <= w.hw + G.tolNo * 5) w.divisa = true; } });   // hid:ok 5 cm
    });
    var aparelhos = arr(E.aparelhos);
    var pontosDe = {}; aparelhos.forEach(function (a) { pontosDe[String(a.id)] = arr(a.pontos); });
    /* ⚠ o toco e a descida/subida de um aparelho (vertical ou curto, encostado no ponto dele) são "do aparelho": água e esgoto
       do mesmo lavatório ficam a 10 cm porque a LOUÇA manda — no modelo do BIM o trecho não traz o aparelho, deduz-se aqui */
    T.forEach(function (t) {
      if (t.ap || !(t.vert || t.L <= G.desvioMax)) return;
      aparelhos.forEach(function (a) { if (!t.ap && arr(a.pontos).some(function (q) { var Q = { x: num(q.x, 0), y: num(q.y, 0), z: num(q.z, 0) }; return d3(Q, t.p1) <= G.tolNo * 3 || d3(Q, t.p2) <= G.tolNo * 3; })) t.ap = String(a.id); });   // hid:ok 3 cm
    });

    function noEscopo(ids) { if (!escopo) return true; for (var i = 0; i < ids.length; i++) if (escopo[ids[i]]) return true; return false; }
    function add(rid, ids, ponto, texto, extra) {
      ids = arr(ids).filter(function (x) { return x != null; }).map(String);
      if (!noEscopo(ids)) return null;
      var k = rid + "|" + ids.join(",") + "|" + (extra && extra.obstaculo != null ? extra.obstaculo : "");
      if (vistos[k]) return null; vistos[k] = 1;
      var Rg = R[rid], a = { id: rid + "#" + (out.length + 1), regra: rid, gravidade: (extra && extra.gravidade) || Rg.gravidade, titulo: Rg.titulo, texto: texto, porque: Rg.porque,
        fonte: (extra && extra.fonte) || Rg.fonte, ids: ids, obstaculo: extra && extra.obstaculo != null ? String(extra.obstaculo) : null,
        ponto: ponto ? { x: r4(ponto.x), y: ponto.y == null ? null : r4(ponto.y), z: r4(ponto.z) } : null,
        corrigir: (extra && extra.corrigir) || { tipo: "refazer", ids: ids.slice(), texto: Rg.corrigir } };
      out.push(a); return a;
    }
    function quem(t) { return (({ agua_fria: "água fria", agua_quente: "água quente", esgoto: "esgoto", ventilacao: "ventilação", pluvial: "pluvial", dreno: "dreno", frigorigeno: "frigorígeno", eletrica: "eletroduto", incendio: "incêndio", industrial: "linha industrial", bandeja: "eletrocalha", ar: "duto" })[t.sistema] || t.sistema) + " " + t.id + (t.dn ? " (DN " + t.dn + ")" : ""); }
    function ambienteEm(p, y) {
      var m = null;
      ambientes.forEach(function (a) { if (dentroPoli(p, a.contorno) && (y == null || (y >= a.base - G.alturaSoleira - EPS && y <= a.topo + EPS)) && (!m || a.base > m.base)) m = a; });
      return m;
    }

    /* ---------- ABERTURAS (todo sistema que corre na parede/no ar; o que corre no piso abaixo da porta é a soleira) */
    T.forEach(function (t) {
      aberturas.forEach(function (A) {
        var a = A.a, porta = txt(a.tipo) !== "janela", nome = (porta ? "porta " : "janela ") + (a.id != null ? a.id : "");
        var achou = false;
        A.zonas.forEach(function (z) {
          if (achou) return;
          var rc = recorte(z.caixa, t.p1, t.p2, t.r, t.r); if (!rc) return;
          achou = true;
          var P = ptEm(t.p1, t.p2, (rc.t0 + rc.t1) / 2), como = t.vert ? "sobe/desce" : (t.horiz ? "corre" : "passa");
          if (z.parte === "vao") add("abertura.vao", [t.id], P, "O tubo de " + quem(t) + " " + como + " no vão da " + nome + " (cota " + f2(P.y) + " m; vão de " + f2(z.caixa.y0) + " a " + f2(z.caixa.y1) + " m, folga lateral " + fcm(G.folgaVao) + " cm).", { obstaculo: a.id });
          else add("abertura.verga", [t.id], P, "O tubo de " + quem(t) + " corta a " + z.parte + " da " + nome + " (cota " + f2(P.y) + " m): passe " + (z.parte === "verga" ? "acima de " + f2(z.caixa.y1) : "abaixo de " + f2(z.caixa.y0)) + " m ou a mais de " + fcm(G.transpasseVerga) + " cm do vão.", { obstaculo: a.id });
        });
        if (!achou && porta) {
          var bs = caixaSeg(a.p1, a.p2, num(a.espessura, 0), num(a.y0, 0) - G.alturaSoleira, num(a.y0, 0));
          var rs = bs ? recorte(bs, t.p1, t.p2, t.r, 0) : null;
          if (rs) add("abertura.soleira", [t.id], ptEm(t.p1, t.p2, (rs.t0 + rs.t1) / 2), "O tubo de " + quem(t) + " passa sob a soleira da " + nome + ".", { obstaculo: a.id });
        }
      });
    });

    /* ---------- ESTRUTURA */
    arr(O.pilares).forEach(function (c) {
      var x = num(c.x, NaN), z = num(c.z, NaN), lx = num(c.largura, 0), lz = num(c.profundidade, lx); if (!isFinite(x) || !isFinite(z) || !(lx > 0)) return;
      var b0 = num(c.base, -INF), cx = caixaCentro(x, z, lx, lz, c.rotY, b0, b0 + num(c.altura, INF));
      T.forEach(function (t) { var rc = recorte(cx, t.p1, t.p2, t.r + G.folgaEstrutura, 0); if (rc) add("estrutura.pilar", [t.id], ptEm(t.p1, t.p2, (rc.t0 + rc.t1) / 2), "O tubo de " + quem(t) + " atravessa o pilar " + c.id + " (ou passa a menos de " + fcm(G.folgaEstrutura) + " cm dele).", { obstaculo: c.id }); });
    });
    arr(O.vigas).forEach(function (v) {
      var topo = num(v.topo, 0), h = num(v.altura, 0), cx = caixaSeg(v.p1, v.p2, num(v.largura, 0), topo - h, topo); if (!cx) return;
      var liberada = G.atravessarViga || !!v.liberada || G.vigasLiberadas.indexOf(String(v.id)) >= 0;
      T.forEach(function (t) {
        var rc = recorte(cx, t.p1, t.p2, t.r, 0); if (!rc) return;
        var P = ptEm(t.p1, t.p2, (rc.t0 + rc.t1) / 2);
        if (t.vert) { add("estrutura.viga", [t.id], P, "O tubo de " + quem(t) + " atravessa a viga " + v.id + " na vertical (furo de cima a baixo na viga não se faz).", { obstaculo: v.id }); return; }
        /* furo horizontal: a direção atravessa a largura? a distância ao apoio e o tamanho (13.2.5.1) */
        var cosA = t.dir ? Math.abs(t.dir.x * cx.ux + t.dir.z * cx.uz) : 1, u = local(cx, P.x, P.z).u, dApoio = cx.hl - Math.abs(u);
        /* o furo oblíquo é mais comprido no eixo da viga: DE / seno do ângulo entre o tubo e a viga */
        var senA = Math.sqrt(Math.max(0, 1 - cosA * cosA)), dimFuro = t.de / Math.max(senA, EPS);
        var dimMax = Math.min(NBR6118_FURO.dimMax_m, h * NBR6118_FURO.fracaoAltura), naZona = dApoio >= NBR6118_FURO.distApoio_h * h - EPS && dimFuro <= dimMax + EPS;
        var desc = "furo de " + fcm(dimFuro) + " cm a " + f2(dApoio) + " m do apoio (viga h = " + fcm(h) + " cm; zona: ≥ " + f2(NBR6118_FURO.distApoio_h * h) + " m e ≤ " + fcm(dimMax) + " cm)";
        if (liberada && naZona) add("estrutura.vigaZona", [t.id], P, "O tubo de " + quem(t) + " atravessa a viga " + v.id + " pelo furo liberado: " + desc + ".", { obstaculo: v.id, corrigir: { tipo: "rt", ids: [t.id], texto: R["estrutura.vigaZona"].corrigir } });
        else add("estrutura.viga", [t.id], P, "O tubo de " + quem(t) + " fura a viga " + v.id + (liberada ? " FORA da zona que a NBR 6118 dispensa: " + desc : " (" + desc + ")") + ".", { obstaculo: v.id });
      });
    });
    travessiasLaje(T, O.lajes, G).forEach(function (tv) {
      var t = tv.t, l = tv.laje, P = tv.P, passantes = arr(l.passantes).concat(arr(O.shafts));
      if (passantes.some(function (q) { return P.x >= Math.min(q.x0, q.x1) - EPS && P.x <= Math.max(q.x0, q.x1) + EPS && P.z >= Math.min(q.z0, q.z1) - EPS && P.z <= Math.max(q.z0, q.z1) + EPS; })) return;
      /* N23: o PASSANTE que o traçado lançou nesta laje, neste ponto (o tubo que mudou de lugar depois perde o passante: volta o alerta) */
      if (temPassante(t, l, P)) return;
      add("estrutura.laje", [t.id], P, "O tubo de " + quem(t) + " atravessa a laje " + l.id + " em (" + f2(P.x) + "; " + f2(P.z) + "): preveja o passante na fôrma ou o shaft.", { obstaculo: l.id, corrigir: { tipo: "rt", ids: [t.id], texto: R["estrutura.laje"].corrigir } });
    });

    /* ---------- PAREDES: o trecho EMBUTIDO (corre dentro dela) */
    T.forEach(function (t) {
      paredes.forEach(function (w) {
        var rc = recorte(w, t.p1, t.p2, -Math.min(t.r, w.hw / 2), 0); if (!rc) return;
        var Ldentro = (rc.t1 - rc.t0) * t.L, embutido = t.vert ? Ldentro > G.embutidoMin : Ldentro > w.espessura + G.embutidoMin;
        if (!embutido) return;
        var P = ptEm(t.p1, t.p2, (rc.t0 + rc.t1) / 2);
        if (w.espessura + EPS < t.de + 2 * G.cobrimentoParede) add("parede.fina", [t.id], P, "A parede " + w.id + " tem " + fcm(w.espessura) + " cm e o tubo de " + quem(t) + " pede " + fcm(t.de + 2 * G.cobrimentoParede) + " cm (DE " + Math.round(t.de * 1000) + " mm + " + Math.round(G.cobrimentoParede * 1000) + " mm de cada lado).", { obstaculo: w.id });
        if (w.drywall) add("parede.drywall", [t.id], P, "O tubo de " + quem(t) + " está na parede de drywall " + w.id + ": entre montantes, com fixação.", { obstaculo: w.id, corrigir: { tipo: "rt", ids: [t.id], texto: R["parede.drywall"].corrigir } });
        if (w.divisa) add("parede.divisa", [t.id], P, "O tubo de " + quem(t) + " está embutido na parede de divisa " + w.id + ".", { obstaculo: w.id });
        if (t.sistema === "esgoto" || t.sistema === "ventilacao") {
          [1, -1].forEach(function (lado) {
            var q = mundo(w, local(w, P.x, P.z).u, lado * (w.hw + G.faceAmbiente)), A = ambienteEm(q, P.y);
            /* a descida curta de lavatório/pia (DN pequeno) incomoda menos que o ramal da bacia e o tubo de queda: sugestão */
            var forte = t.dn >= GEO_DN_RUIDO || Ldentro > G.compMinLeitura;
            if (A && A.uso === "permanencia") add("parede.esgotoPermanencia", [t.id], P, "O tubo de " + quem(t) + " está embutido na parede " + w.id + ", que dá para " + A.nome + " (ambiente de permanência prolongada" + (forte ? "" : "; descida curta de DN pequeno") + ").", { obstaculo: w.id, gravidade: forte ? "alerta" : "sugestao" });
          });
        }
      });
    });

    /* ---------- FORRO: esgoto horizontal na zona do teto de ambiente seco (sob a laje de cima) */
    T.forEach(function (t) {
      if (t.sistema !== "esgoto" || !t.horiz) return;
      var P = ptEm(t.p1, t.p2, 1 / 2), cand = ambientes.filter(function (a) { return dentroPoli(P, a.contorno) && P.y > a.base + G.alturaForro && P.y <= a.topo + EPS; });
      var lajeAcima = arr(O.lajes).some(function (l) { var tp = num(l.topo, NaN), e = num(l.espessura, 0); return isFinite(tp) && P.x >= Math.min(l.x0, l.x1) - EPS && P.x <= Math.max(l.x0, l.x1) + EPS && P.z >= Math.min(l.z0, l.z1) - EPS && P.z <= Math.max(l.z0, l.z1) + EPS && tp - e >= P.y - EPS && tp - e <= P.y + G.alturaSoleira * 2; });   // hid:ok laje até 60 cm acima
      cand.forEach(function (a) { if (a.uso !== "molhado" && (lajeAcima || !arr(O.lajes).length)) add("forro.esgotoSobreSeco", [t.id], P, "O esgoto " + t.id + " corre no forro de " + a.nome + " (cota " + f2(P.y) + " m, " + f2(P.y - a.base) + " m acima do piso dele).", { obstaculo: a.id }); });
    });

    /* ---------- LOUÇA/EQUIPAMENTO: tubo por dentro do volume da família (o ponto da própria peça vale) */
    var Bi = BI();
    /* ⚠ METAIS DENTRO DO ENVELOPE (20/10/2026, e2e-hid-tracar): o envelope da pia/do tanque inclui a torneira, que é OUTRA família
       (kit) com o ponto de água na face da parede. O tubo que chega embutido nesse ponto "atravessava a pia" (nota 40, PROIBIDO)
       — o motor já tira esse envelope da busca (js/hidambiente.js, semVolume) e libera o ponto da torneira. Aqui vale o mesmo: o
       ponto de ligação de um aparelho que está DENTRO do volume (ou na face dele) conta como ponto desse volume — só a ponta que
       chega nele recua o raio; o resto do tubo continua conferido (um tubo que entra no corpo da pia continua PROIBIDO). */
    var todosPts = []; aparelhos.forEach(function (a) { arr(a.pontos).forEach(function (q) { todosPts.push({ x: num(q.x, 0), y: num(q.y, 0), z: num(q.z, 0) }); }); });
    function pontoNoVolume(v, q, tol) { var o = { cx: num(v.cx, 0), cz: num(v.cz, 0), ux: num(v.ux, 1), uz: num(v.uz, 0) }, l = local(o, q.x, q.z); return Math.abs(l.u) <= num(v.hl, 0) + tol && Math.abs(l.v) <= num(v.hw, 0) + tol && q.y >= num(v.y0, -INF) - tol && q.y <= num(v.y1, INF) + tol; }
    /* ⚠ ACESSÓRIO DE LINHA (categoria "acessorio_tubo": a válvula de descarga embutida, 20/10/2026): o tubo do mesmo sistema
       que termina DENTRO do corpo dele é a ligação em linha (a entrada por cima, a saída por baixo), não travessia — o kit da
       válvula dava 4 PROIBIDO em todo banheiro. Tubo de outro sistema, ou que passa direto sem terminar nele, continua PROIBIDO. */
    var HF = dep("HidFamilias", "./hidfamilias.js"), Hr = HR();
    function deLinha(v) { var f = HF && HF.porId ? HF.porId(v.famId) : null; return !!(f && f.categoria === "acessorio_tubo"); }
    function sistemasDe(id) { var o = {}; arr(pontosDe[String(id)]).forEach(function (q) { if (q && q.sistema) o[q.sistema] = 1; }); return o; }
    if (Bi && Bi.tuboEmVolume) arr(O.familias).forEach(function (v) {
      var proprios = arr(pontosDe[String(v.id)]), pts = proprios.concat(todosPts.filter(function (q) { return pontoNoVolume(v, q, G.tolNo); }));
      var linha = deLinha(v), sisV = linha ? sistemasDe(v.id) : null;
      T.forEach(function (t) {
        /* a LIGAÇÃO DO PRÓPRIO APARELHO (a descida atrás da coluna do lavatório, o toco curto): a regra do motor (HidRota) */
        if (Hr && Hr.ligacaoDoProprioAparelho && proprios.length) { var lig = false; try { lig = Hr.ligacaoDoProprioAparelho(v, t, proprios, t.r, G.tolNo / 5); } catch (eL) {} if (lig) return; }   // hid:ok casca de 2 mm
        if (linha && sisV[t.sistema] && (pontoNoVolume(v, t.p1, G.tolNo) || pontoNoVolume(v, t.p2, G.tolNo))) return;
        var sim = false; try { sim = Bi.tuboEmVolume(v, t.p1, t.p2, t.r, pts, G.tolNo / 5); } catch (e) {} if (sim) add("interferencia.louca", [t.id], ptEm(t.p1, t.p2, 1 / 2), "O tubo de " + quem(t) + " passa por dentro de " + (v.famId || "família") + " " + v.id + ".", { obstaculo: v.id }); });   // hid:ok casca de 2 mm
    });

    /* ---------- INTERFERÊNCIAS entre sistemas */
    var gasTab = null, czTab = null;
    /* o cruzamento água × esgoto (FRENTE H1): a folga entre geratrizes e o desnível do enterrado, cada um com a fonte da linha */
    function cruzTab() {
      if (czTab) return czTab;
      czTab = { folga: null, enterrado: null, fonteFolga: null, fonteEnterrado: null };
      function fo(l) { var f = l && l.fonte; return f ? [f.doc, f.tabela, f.pagina].filter(Boolean).join(" — ") : null; }
      arr(N.linhas("af2020.cruzamento_esgoto", "critérios: água acima do esgoto no cruzamento")).forEach(function (l) {
        if (l.parametro === "folga_geratrizes_min_m") { czTab.folga = num(l.valor, null); czTab.fonteFolga = fo(l); }
        if (l.parametro === "desnivel_enterrado_m") { czTab.enterrado = num(l.valor, null); czTab.fonteEnterrado = fo(l); }
      });
      return czTab;
    }
    /* uma laje (o volume dela) entre as cotas yLo e yHi no ponto P */
    function lajeEntre(P, yLo, yHi) {
      return arr(O.lajes).some(function (l) { var tp = num(l.topo, NaN), es = num(l.espessura, 0); return isFinite(tp) && es > EPS && P.x >= Math.min(l.x0, l.x1) - EPS && P.x <= Math.max(l.x0, l.x1) + EPS && P.z >= Math.min(l.z0, l.z1) - EPS && P.z <= Math.max(l.z0, l.z1) + EPS && tp - es >= yLo - EPS && tp <= yHi + EPS; });
    }
    /* enterrado = abaixo do piso e fora de todo ambiente (o terreno em volta da obra); sem ambientes, não se sabe: não confere */
    function enterrado(p, y) { return ambientes.length > 0 && !ambienteEm(p, null) && E.piso != null && y < num(E.piso, INF) - EPS; }
    for (var i = 0; i < T.length; i++) for (var j = i + 1; j < T.length; j++) {
      var a = T[i], b = T[j]; if (a.sistema === b.sistema && !(ehGas(a) !== ehGas(b))) continue;
      if (a.ap && a.ap === b.ap) continue;   /* as descidas do MESMO aparelho ficam onde a louça manda */
      var w = AGUA[a.sistema] ? a : (AGUA[b.sistema] ? b : null), e = w === a ? b : a;
      var dd = segSeg3(a.p1, a.p2, b.p1, b.p2) - a.r - b.r;
      /* gás: afastamento da NBR 15526 pelo HidNormas (paralelo e cruzamento) */
      if (ehGas(a) || ehGas(b)) {
        var gs = ehGas(a) ? a : b, ou = gs === a ? b : a;
        var el = ou.sistema === "eletrica" || ou.sistema === "bandeja" ? "eletrica_eletroduto_nao_metalico" : (AGUA[ou.sistema] ? "agua" : (ESG[ou.sistema] ? "esgoto_pluvial" : (ehGas(ou) ? "gas" : null)));
        if (el) {
          if (!gasTab) { gasTab = {}; arr(N.linhas("gas.15526.afastamentos", "critérios: afastamento do gás")).forEach(function (l) { gasTab[l.elemento] = l; }); }
          var lg = gasTab[el], cruz = gs.horiz && ou.horiz && cruzaPlanta(gs.p1, gs.p2, ou.p1, ou.p2), lim = lg ? num(cruz ? lg.cruzamento_mm : lg.paralelo_mm, null) : null;
          if (lim != null && dd < lim / 1000 - EPS) add("interferencia.gas", [gs.id, ou.id], ptEm(gs.p1, gs.p2, 1 / 2), "Gás " + gs.id + " a " + Math.round(Math.max(0, dd) * 1000) + " mm de " + quem(ou) + " (mínimo " + lim + " mm, " + (cruz ? "cruzamento" : "paralelo") + ").", { fonte: N.fonte("gas.15526.afastamentos") || R["interferencia.gas"].fonte });
        }
        continue;
      }
      if (!w || !(ESG[e.sistema] || e.sistema === "eletrica" || e.sistema === "bandeja")) continue;
      /* água por baixo do esgoto no cruzamento em planta */
      /* (só o que leva LÍQUIDO servido: a ventilação não pinga esgoto na água) */
      if (LIQ[e.sistema] && w.horiz && e.horiz) {
        var cz = cruzaPlanta(w.p1, w.p2, e.p1, e.p2);
        if (cz) {
          var yw = w.p1.y + w.dy * cz.t, ye = e.p1.y + e.dy * cz.s, Pc = { x: w.p1.x + (w.p2.x - w.p1.x) * cz.t, y: yw, z: w.p1.z + (w.p2.z - w.p1.z) * cz.t };
          var CZ = cruzTab(), folgaG = (yw - w.r) - (ye + e.r);   /* geratriz inferior externa da água − superior externa do esgoto */
          /* sem a tabela: a regra antiga (eixo da água abaixo do eixo do esgoto), sem número */
          var baixo = CZ.folga != null ? folgaG < CZ.folga - EPS : yw < ye - EPS;
          /* só o cruzamento na MESMA faixa: a água muito abaixo (outro andar, o piso sob o forro) ou com uma laje entre os dois não é
             o cruzamento da regra (o vazamento não chega nela) */
          if (baixo && ((ye - e.r) - (yw + w.r) > G.faixaCruzamento + EPS || lajeEntre(Pc, yw + w.r, ye - e.r))) baixo = false;
          if (baixo) add("interferencia.aguaSobEsgoto", [w.id, e.id], Pc, "No cruzamento, a " + quem(w) + " (eixo a " + f2(yw) + " m, geratriz inferior a " + f2(yw - w.r) + " m) não passa acima do " + quem(e) + " (eixo a " + f2(ye) + " m, geratriz superior a " + f2(ye + e.r) + " m)" + (CZ.folga != null ? "" : " — folga da tabela af2020.cruzamento_esgoto pendente: conferido pelos eixos") + ".", { fonte: CZ.fonteFolga || R["interferencia.aguaSobEsgoto"].fonte });
          else if (CZ.enterrado != null && enterrado(Pc, Math.max(yw, ye)) && folgaG < CZ.enterrado - EPS) add("interferencia.cruzamentoEnterrado", [w.id, e.id], Pc, "Cruzamento enterrado fora da edificação: a " + quem(w) + " passa só " + fcm(Math.max(0, folgaG)) + " cm acima do " + quem(e) + " (desnível usual " + fcm(CZ.enterrado) + " cm).", { fonte: CZ.fonteEnterrado || R["interferencia.cruzamentoEnterrado"].fonte });
        }
      }
      if (dd < G.afastamento - TOL_FOLGA) add("interferencia.afastamento", [w.id, e.id], ptEm(w.p1, w.p2, 1 / 2), "A " + quem(w) + " está a " + fcm(Math.max(0, dd)) + " cm do " + quem(e) + " (mínimo livre " + fcm(G.afastamento) + " cm).");
    }

    /* ---------- LEITURA: diagonal e cômodo cruzado pelo meio */
    var angs = paredes.map(function (wl) { return Math.atan2(wl.uz, wl.ux); });
    function paralelo(t, modulo) {
      if (!angs.length) return true;
      var a = Math.atan2(t.dir.z, t.dir.x);
      return angs.some(function (b) { var d = Math.abs(((a - b) % modulo + modulo) % modulo); return d < G.tolAngulo || modulo - d < G.tolAngulo; });
    }
    T.forEach(function (t) {
      if (!t.horiz || !t.dir || t.Lh <= G.chanfroMax) return;
      var ortoOk = paralelo(t, Math.PI / 2);
      if (!ortoOk && (ORTO[t.sistema] || !paralelo(t, Math.PI / 4) || t.Lh > G.diagonalMax))   // hid:ok 45° = π/4 (geometria)
        add("leitura.diagonal", [t.id], ptEm(t.p1, t.p2, 1 / 2), "O tubo de " + quem(t) + " corre em diagonal por " + f2(t.Lh) + " m (fora da direção das paredes).");
      if (t.Lh > G.compMinLeitura && ambientes.length) {
        var M = ptEm(t.p1, t.p2, 1 / 2), A = ambienteEm(M, null);
        if (A && A.uso !== "molhado") {
          var dm = distPoli(M, A.contorno);
          paredes.forEach(function (wl) { var p = local(wl, M.x, M.z), du = Math.max(0, Math.abs(p.u) - wl.hl), dv = Math.max(0, Math.abs(p.v) - wl.hw); dm = Math.min(dm, Math.sqrt(du * du + dv * dv)); });
          if (dm > G.distParede) add("leitura.atravessaComodo", [t.id], M, "O tubo de " + quem(t) + " cruza " + A.nome + " a " + f2(dm) + " m da parede mais perto.", { obstaculo: A.id });
        }
      }
    });

    /* ---------- REDE: nós, cadeias (luva, zigue-zague, sobe e desce) */
    var nos = {}, chaveNo = function (p) { return Math.round(p.x / G.tolNo) + "," + Math.round(p.y / G.tolNo) + "," + Math.round(p.z / G.tolNo); };
    function no(p) { var k = chaveNo(p); return nos[k] || (nos[k] = { k: k, p: p, t: [] }); }
    T.forEach(function (t) { t.n1 = no(t.p1); t.n2 = no(t.p2); t.n1.t.push(t); t.n2.t.push(t); });
    var marcados = [];   /* pontos de conexão com o resto (acessório, peça, ponto de aparelho): não são "meio de reta" */
    arr(E.acessorios).forEach(function (q) { var c = q.centro || q; if (c && isFinite(num(c.x, NaN))) marcados.push({ x: num(c.x, 0), y: num(c.y, 0), z: num(c.z, 0) }); });
    arr(E.pecas).forEach(function (q) { if (q && isFinite(num(q.x, NaN))) marcados.push({ x: num(q.x, 0), y: num(q.y, 0), z: num(q.z, 0) }); });
    aparelhos.forEach(function (a) { arr(a.pontos).forEach(function (q) { marcados.push({ x: num(q.x, 0), y: num(q.y, 0), z: num(q.z, 0) }); }); });
    function marcado(p) { return marcados.some(function (q) { return d3(p, q) <= G.tolNo * 3; }); }   // hid:ok 3 cm
    Object.keys(nos).forEach(function (k) {
      var n = nos[k]; if (n.t.length !== 2) return;
      var a = n.t[0], b = n.t[1]; if (a.sistema !== b.sistema || a.dn !== b.dn || a.material !== b.material || marcado(n.p)) return;
      var ua = { x: (a.p2.x - a.p1.x) / a.L, y: a.dy / a.L, z: (a.p2.z - a.p1.z) / a.L }, ub = { x: (b.p2.x - b.p1.x) / b.L, y: b.dy / b.L, z: (b.p2.z - b.p1.z) / b.L };
      if (Math.abs(ua.x * ub.x + ua.y * ub.y + ua.z * ub.z) < 1 - EPS * 1000) return;   // hid:ok colinear (cos > 0,999)
      if (a.L + b.L > G.barra + EPS) return;   /* a luva da barra é emenda de verdade */
      add("economia.luva", [a.id, b.id], n.p, "Os trechos " + a.id + " e " + b.id + " (" + quem(a).replace(/ .*$/, "") + ", DN " + a.dn + ") estão alinhados e emendados sem derivação.", { corrigir: { tipo: "juntar", ids: [a.id, b.id], texto: R["economia.luva"].corrigir } });
    });
    /* cadeias: caminhos por nós de grau 2 do mesmo sistema */
    var usado = {}, cadeias = [];
    T.forEach(function (t0) {
      if (usado[t0.id]) return;
      function grau2(n, s) { return n.t.length === 2 && n.t[0].sistema === s && n.t[1].sistema === s; }
      /* anda para trás até a ponta da cadeia */
      var t = t0, n = t.n1, guarda = 0;
      while (grau2(n, t.sistema) && guarda++ < T.length) { var o = n.t[0] === t ? n.t[1] : n.t[0]; if (o === t0) break; n = o.n1 === n ? o.n2 : o.n1; t = o; }
      var cad = { sistema: t0.sistema, pts: [n.p], ts: [] }, cur = t, ini = n; guarda = 0;
      while (cur && !usado[cur.id] && guarda++ <= T.length) {
        usado[cur.id] = 1; cad.ts.push(cur);
        var fim = cur.n1 === ini ? cur.n2 : cur.n1; cad.pts.push(fim.p);
        if (!grau2(fim, cur.sistema)) break;
        var prox = fim.t[0] === cur ? fim.t[1] : fim.t[0]; ini = fim; cur = prox;
      }
      if (cad.ts.length) cadeias.push(cad);
    });
    /* obstáculos que justificam um desvio (em planta, na cota do trecho) */
    var duros = [];
    aberturas.forEach(function (A) { A.zonas.forEach(function (z) { duros.push(z.caixa); }); });
    arr(O.pilares).forEach(function (c) { var lx = num(c.largura, 0); if (lx > 0) duros.push(caixaCentro(num(c.x, 0), num(c.z, 0), lx, num(c.profundidade, lx), c.rotY, num(c.base, -INF), num(c.base, 0) + num(c.altura, INF))); });
    arr(O.vigas).forEach(function (v) { var cx = caixaSeg(v.p1, v.p2, num(v.largura, 0), num(v.topo, 0) - num(v.altura, 0), num(v.topo, 0)); if (cx) duros.push(cx); });
    arr(O.familias).forEach(function (v) { if (isFinite(num(v.cx, NaN))) duros.push({ cx: v.cx, cz: v.cz, ux: v.ux, uz: v.uz, hl: v.hl, hw: v.hw, y0: num(v.y0, -INF), y1: num(v.y1, INF) }); });
    arr(E.pecas).forEach(function (q) { var rr = num(q.r, 0); if (rr > 0) duros.push({ cx: num(q.x, 0), cz: num(q.z, 0), ux: 1, uz: 0, hl: rr, hw: rr, y0: num(q.y, 0) - INF, y1: num(q.y, 0) }); });
    function livre(p, q, rr, ignorar, proprios) {
      if (duros.some(function (o) { return recorte(o, p, q, rr, 0); })) return false;
      /* um tubo de OUTRO sistema no caminho também justifica o desvio (a descida do lavatório no meio da reta) */
      if (T.some(function (o) { return o.sistema !== proprios.sistema && segSeg3(p, q, o.p1, o.p2) < rr + o.r + G.folgaEstrutura; })) return false;
      /* a reta não pode sair da parede onde o desvio corria nem furar parede que o desvio não furava */
      return !paredes.some(function (wl) { return ignorar.indexOf(wl) < 0 && recorte(wl, p, q, 0, 0); });
    }
    cadeias.forEach(function (cad) {
      var pts = cad.pts, ts = cad.ts, s = cad.sistema;
      /* sobe e desce (água): subida, depois descida, no meio da cadeia */
      if (AGUA[s]) {
        for (var k = 0; k < ts.length; k++) {
          var up = ts[k]; if (!up.vert) continue;
          var sobe = (pts[k + 1].y - pts[k].y) > G.sobeDesceMin; if (!sobe) continue;
          for (var m = k + 1; m < ts.length; m++) {
            var dn = ts[m]; if (!dn.vert) { if (!dn.horiz) break; continue; }
            if ((pts[m].y - pts[m + 1].y) > G.sobeDesceMin) {
              var baixo = Math.max(pts[k].y, pts[m + 1].y), a0 = { x: pts[k + 1].x, y: baixo, z: pts[k + 1].z }, a1 = { x: pts[m].x, y: baixo, z: pts[m].z };
              var paredesDela = paredes.filter(function (wl) { return ts.slice(k, m + 1).some(function (tt) { return recorte(wl, tt.p1, tt.p2, 0, 0); }); });
              if (livre(a0, a1, up.r, paredesDela, up)) add("economia.sobeDesce", ts.slice(k, m + 1).map(function (tt) { return tt.id; }), pts[m], "O ramal de água sobe " + f2(pts[k + 1].y - pts[k].y) + " m e desce de novo (" + ts.slice(k, m + 1).map(function (tt) { return tt.id; }).join(", ") + "), sem obstáculo que obrigue.");
            }
            break;
          }
        }
      }
      /* zigue-zague em planta: tira os chanfros (desvio de 45° de um canto) e procura o "dente" */
      var H = [];
      for (var q = 0; q < ts.length; q++) if (ts[q].horiz) H.push({ a: pts[q], b: pts[q + 1], t: ts[q] }); else H.push(null);
      var segs = [];
      H.forEach(function (h) { if (!h) { segs.push(null); return; } segs.push(h); });
      /* corridas horizontais contíguas */
      var corr = [], atual = [];
      segs.forEach(function (h) { if (h) atual.push(h); else { if (atual.length) corr.push(atual); atual = []; } });
      if (atual.length) corr.push(atual);
      corr.forEach(function (c) {
        /* tira o chanfro: perna diagonal curta entre duas pernas perpendiculares vira o canto */
        var P = [c[0].a]; c.forEach(function (h) { P.push(h.b); });
        var Q = P.slice(), mud = true, g2 = 0;
        while (mud && g2++ < P.length) {
          mud = false;
          for (var x = 1; x + 2 < Q.length; x++) {
            var A0 = Q[x - 1], A1 = Q[x], B1 = Q[x + 1], B2 = Q[x + 2], L1 = d2(A1, B1);
            if (L1 > G.chanfroMax) continue;
            var u1 = { x: A1.x - A0.x, z: A1.z - A0.z }, u2 = { x: B2.x - B1.x, z: B2.z - B1.z }, l1 = Math.sqrt(u1.x * u1.x + u1.z * u1.z), l2 = Math.sqrt(u2.x * u2.x + u2.z * u2.z);
            if (!(l1 > EPS) || !(l2 > EPS) || Math.abs(u1.x * u2.x + u1.z * u2.z) / (l1 * l2) > G.tolAngulo) continue;
            var den = u1.x * u2.z - u1.z * u2.x, tt2 = ((B1.x - A1.x) * u2.z - (B1.z - A1.z) * u2.x) / den;
            var C = { x: A1.x + u1.x * tt2, y: (A1.y + B1.y) / 2, z: A1.z + u1.z * tt2 };
            Q.splice(x, 2, C); mud = true; break;
          }
        }
        /* o dente: pernas 0 e 2 na mesma direção, 1 lateral curta, e a volta (3) do outro lado — ou "escada" */
        for (var y = 0; y + 3 < Q.length; y++) {   // hid:ok índices do padrão de 5 pontos (geometria)
          var p0 = Q[y], p1 = Q[y + 1], p2 = Q[y + 2], p3 = Q[y + 3];   // hid:ok índices
          var v0 = { x: p1.x - p0.x, z: p1.z - p0.z }, v1 = { x: p2.x - p1.x, z: p2.z - p1.z }, v2 = { x: p3.x - p2.x, z: p3.z - p2.z };
          var n0 = Math.sqrt(v0.x * v0.x + v0.z * v0.z), n1 = Math.sqrt(v1.x * v1.x + v1.z * v1.z), n2 = Math.sqrt(v2.x * v2.x + v2.z * v2.z);
          if (!(n0 > EPS && n1 > EPS && n2 > EPS) || n1 > G.desvioMax) continue;
          var c02 = (v0.x * v2.x + v0.z * v2.z) / (n0 * n2), c01 = (v0.x * v1.x + v0.z * v1.z) / (n0 * n1);
          if (c02 < 1 - G.tolAngulo || Math.abs(c01) > G.tolAngulo) continue;   /* 0 ∥ 2 no mesmo sentido, 1 perpendicular */
          /* a volta: a próxima perna lateral, de sentido oposto, devolve à linha → dente; sem ela é desvio de linha (fica) */
          var p4 = Q[y + 4]; if (!p4) continue;   // hid:ok índice
          var v3 = { x: p4.x - p3.x, z: p4.z - p3.z }, n3 = Math.sqrt(v3.x * v3.x + v3.z * v3.z);
          if (!(n3 > EPS) || (v1.x * v3.x + v1.z * v3.z) / (n1 * n3) > -1 + G.tolAngulo || Math.abs(n3 - n1) > G.tolNo * 2) continue;   // hid:ok volta do mesmo tamanho (±2 cm)
          var yM = (p1.y + p3.y) / 2, ini2 = { x: p1.x, y: yM, z: p1.z }, fim2 = { x: p4.x, y: yM, z: p4.z };
          var pa = paredes.filter(function (wl) { return c.some(function (h) { return recorte(wl, h.a, h.b, 0, 0); }); });
          if (livre(ini2, fim2, c[0].t.r, pa, c[0].t)) add("economia.zigueZague", c.map(function (h) { return h.t.id; }), p2, "O tubo de " + quem(c[0].t) + " sai " + fcm(n1) + " cm da linha e volta sem nada no caminho (4 conexões à toa).");
        }
      });
    });

    /* zigue-zague que PASSA POR UM TÊ (o tronco segue reto e a derivação sai no meio do dente): pelo grafo, só pernas retas */
    var jaZig = {}; out.forEach(function (a) { if (a.regra === "economia.zigueZague") a.ids.forEach(function (id) { jaZig[id] = 1; }); });
    function outra(n, t) { return t.n1 === n ? t.n2 : t.n1; }
    function vet(n, t) { var q = outra(n, t).p; return { x: q.x - n.p.x, z: q.z - n.p.z, L: d2(q, n.p) }; }
    T.forEach(function (Bt) {
      if (!Bt.horiz || jaZig[Bt.id] || Bt.Lh > G.desvioMax || Bt.Lh <= EPS) return;
      [[Bt.n1, Bt.n2], [Bt.n2, Bt.n1]].forEach(function (par) {
        var N1 = par[0], N2 = par[1], vb = vet(N1, Bt);
        N1.t.forEach(function (At) {
          if (At === Bt || At.sistema !== Bt.sistema || !At.horiz) return;
          var va = vet(N1, At); if (Math.abs(va.x * vb.x + va.z * vb.z) / (va.L * vb.L) > G.tolAngulo) return;   /* A ⟂ B */
          var dirA = { x: -va.x / va.L, z: -va.z / va.L };   /* o sentido de quem chega por A */
          N2.t.forEach(function (Ct) {
            if (Ct === Bt || Ct.sistema !== Bt.sistema || !Ct.horiz) return;
            var vc = vet(N2, Ct); if ((vc.x * dirA.x + vc.z * dirA.z) / vc.L < 1 - G.tolAngulo) return;   /* C segue no sentido de A */
            var N3 = outra(N2, Ct);
            N3.t.forEach(function (Dt) {
              if (Dt === Ct || Dt.sistema !== Bt.sistema || !Dt.horiz) return;
              var vd = vet(N3, Dt); if ((vd.x * vb.x + vd.z * vb.z) / (vd.L * vb.L) > -1 + G.tolAngulo || Math.abs(vd.L - vb.L) > G.tolNo * 2) return;   // hid:ok volta do mesmo tamanho (±2 cm)
              var N4 = outra(N3, Dt), yM = (N1.p.y + N4.p.y) / 2, ini3 = { x: N1.p.x, y: yM, z: N1.p.z }, fim3 = { x: N4.p.x, y: yM, z: N4.p.z };
              var pa3 = paredes.filter(function (wl) { return [Bt, Ct, Dt].some(function (h) { return recorte(wl, h.p1, h.p2, 0, 0); }); });
              if (livre(ini3, fim3, Bt.r, pa3, Bt)) add("economia.zigueZague", [Bt.id, Ct.id, Dt.id], N2.p, "O tubo de " + quem(Bt) + " sai " + fcm(vb.L) + " cm da linha e volta (" + [Bt.id, Ct.id, Dt.id].join(", ") + ") sem nada no caminho (4 conexões à toa).");
            });
          });
        });
      });
    });

    /* ---------- REGISTRO: atrás da porta e fora de alcance */
    var portas = aberturas.filter(function (A) { return txt(A.a.tipo) !== "janela"; });
    arr(E.acessorios).forEach(function (q) {
      if (!/registro|valvula_bloqueio/.test(txt(q.acessorio || q.tipo))) return;
      var c = q.centro || q, P = { x: num(c.x, NaN), y: num(c.y, NaN), z: num(c.z, NaN) }; if (![P.x, P.y, P.z].every(isFinite)) return;
      /* a parede que o contém EM PLANTA (o registro no enchimento fica sob a base dela): a base dela é o piso */
      /* ⚠ REVISÃO H5 (21/10/2026): no PRÉDIO as paredes dos pavimentos estão empilhadas na mesma planta e a primeira era a do
         térreo — o registro do 2º pavimento saía "a 4,70 m do piso" (falso alerta). Agora só a parede da FAIXA DE COTA do registro
         (a que o contém na altura; senão a de cima dele até a faixa do enchimento sob a base) */
      var wls = paredes.filter(function (w) { var lp = local(w, P.x, P.z); return Math.abs(lp.u) <= w.hl + G.tolNo && Math.abs(lp.v) <= w.hw + G.tolNo && P.y >= w.y0 - G.alturaSoleira - EPS && P.y <= w.y1 + EPS; });
      var wl = wls.filter(function (w) { return P.y >= w.y0 - EPS; }).sort(function (a, b) { return b.y0 - a.y0; })[0] || wls.sort(function (a, b) { return a.y0 - b.y0; })[0];
      var A = ambienteEm(P, P.y) || ambientes.filter(function (a) { return distPoli(P, a.contorno) <= G.faceAmbiente * 2 && P.y >= a.base - G.alturaSoleira && P.y <= a.topo; }).sort(function (a, b) { return distPoli(P, a.contorno) - distPoli(P, b.contorno); })[0];
      var piso = wl ? wl.base : (A ? A.base : num(E.piso, null));
      if (piso != null) {
        var h = P.y - piso;
        if (h < G.registroMin - EPS || h > G.registroMax + EPS) add("registro.inacessivel", [q.trecho, q.id], P, "O registro " + q.id + " ficou a " + f2(h) + " m do piso (" + (h < G.registroMin ? "no piso/enchimento" : "acima do alcance, no forro") + "); a faixa de uso é de " + f2(G.registroMin) + " a " + f2(G.registroMax) + " m.", { corrigir: { tipo: "refazer", ids: [q.trecho, q.id].filter(Boolean).map(String), texto: R["registro.inacessivel"].corrigir } });
      }
      portas.forEach(function (Pt) {
        var a = Pt.a, f = a.folha, ld = a.lado, dob = a.dobradica, L = num(a.largura, 0) || d2(a.p1, a.p2);
        var y0 = num(a.y0, 0), y1 = num(a.y1, y0);
        if (P.y < y0 - EPS || P.y > y1 + EPS) return;
        var zona;
        if (f && ld && dob) {
          /* o giro: a folha encosta na parede do lado da dobradiça, na face para onde abre */
          var esp = num(a.espessura, 0);
          zona = caixaSeg({ x: dob.x + ld.x * esp / 2, z: dob.z + ld.z * esp / 2 }, { x: dob.x + f.x * L + ld.x * esp / 2, z: dob.z + f.z * L + ld.z * esp / 2 }, esp + G.faceAmbiente * 2, y0, y1);
        } else {
          /* sem a dobradiça no modelo: os dois lados do vão (aviso diz que é estimado) */
          var bse = caixaSeg(a.p1, a.p2, num(a.espessura, 0) + G.faceAmbiente * 2, y0, y1); if (!bse) return;
          zona = { cx: bse.cx, cz: bse.cz, ux: bse.ux, uz: bse.uz, hl: bse.hl + L, hw: bse.hw, y0: y0, y1: y1 };
        }
        if (!zona) return;
        var noVao = caixaSeg(a.p1, a.p2, num(a.espessura, 0) + G.faceAmbiente * 2, y0, y1);
        var lp = local(zona, P.x, P.z), dentro = Math.abs(lp.u) <= zona.hl + EPS && Math.abs(lp.v) <= zona.hw + EPS;
        if (noVao) { var lv = local(noVao, P.x, P.z); if (Math.abs(lv.u) <= noVao.hl && Math.abs(lv.v) <= noVao.hw) dentro = false; }
        if (dentro) add("registro.atrasPorta", [q.trecho, q.id], P, "O registro " + q.id + " fica no giro da porta " + a.id + (f ? "" : " (lado da dobradiça não informado: estimado pelos dois lados)") + ".", { obstaculo: a.id, corrigir: { tipo: "refazer", ids: [q.trecho, q.id].filter(Boolean).map(String), texto: R["registro.atrasPorta"].corrigir } });
      });
    });

    /* ---------- CAIXAS DE INSPEÇÃO/GORDURA dentro de ambiente */
    arr(E.caixas).forEach(function (c) {
      var P = { x: num(c.x, NaN), y: num(c.y, NaN), z: num(c.z, NaN) }; if (![P.x, P.z].every(isFinite)) return;
      var A = ambientes.filter(function (a) { return dentroPoli(P, a.contorno) && (!isFinite(P.y) || (P.y >= a.base - G.alturaSoleira * 4 && P.y <= a.topo)); })[0];   // hid:ok até 1,20 m abaixo do piso (caixa enterrada)
      if (A) add("implantacao.caixaDentro", [c.id], P, "A " + (c.tipo === "caixa_gordura" ? "caixa de gordura " : "caixa de inspeção ") + c.id + " está dentro de " + A.nome + ".", { obstaculo: A.id, corrigir: { tipo: "refazer", ids: [String(c.id)], texto: R["implantacao.caixaDentro"].corrigir } });
    });

    /* ---------- INSPEÇÃO DO ESGOTO (NBR 8160 4.2.6.2, pelo HidNormas) */
    var lim10 = N.valor("es8160.inspecao", { parametro: "bacia_cg_cs_ate_inspecao_max" }, "valor", "critérios: inspeção"), lim25 = N.valor("es8160.inspecao", { parametro: "entre_dispositivos_max" }, "valor", "critérios: inspeção");
    var insp = [];
    arr(E.caixas).forEach(function (c) { if (c.tipo === "caixa_inspecao" || c.tipo === "poco_visita") insp.push({ x: num(c.x, 0), z: num(c.z, 0), r: num(c.r, 0) }); });
    arr(E.pecas).forEach(function (q) { if (q.peca === "caixa_inspecao" || q.peca === "inspecao" || /inspec/.test(txt(q.peca))) insp.push({ x: num(q.x, 0), z: num(q.z, 0), r: num(q.r, 0) }); });
    if (lim10 != null && lim25 != null) {
      var esg = T.filter(function (t) { return t.sistema === "esgoto"; });
      var ehInsp = function (n) { return insp.some(function (q) { return d2(n.p, q) <= q.r + G.tolNo * 5; }); };   // hid:ok captura de 5 cm além do raio
      var origens = [];
      aparelhos.forEach(function (ap) { if (!/bacia/.test(txt(ap.aparelho))) return; arr(ap.pontos).forEach(function (q) { if (q.sistema === "esgoto") origens.push({ p: q, lim: lim10, nome: "bacia " + ap.id }); }); });
      arr(E.pecas).forEach(function (q) { if (q.peca === "caixa_sifonada") origens.push({ p: q, lim: lim10, nome: "caixa sifonada " + q.id }); });
      arr(E.caixas).forEach(function (c) { if (c.tipo === "caixa_gordura") origens.push({ p: c, lim: lim10, nome: "caixa de gordura " + c.id }); else if (c.tipo === "caixa_inspecao") origens.push({ p: c, lim: lim25, nome: "caixa de inspeção " + c.id, deInsp: true }); });
      origens.forEach(function (o) {
        /* o nó de partida: a ponta de esgoto mais perto (no hub da peça/ponto) */
        var n0 = null, dm = G.tolNo * 30;   // hid:ok até 30 cm do ponto/peça
        Object.keys(nos).forEach(function (k) { var n = nos[k]; if (!n.t.some(function (t) { return t.sistema === "esgoto"; })) return; var dd2 = d2(n.p, o.p); if (dd2 < dm) { dm = dd2; n0 = n; } });
        if (!n0) return;
        /* Dijkstra a jusante (p1 → p2 desce: o sentido do traço do biminst) */
        var dist = {}, fila = [{ n: n0, d: 0 }], achou = null, maxD = 0, caminho = {}; dist[n0.k] = 0;
        while (fila.length) {
          fila.sort(function (a, b) { return a.d - b.d; }); var cur = fila.shift(); if (cur.d > dist[cur.n.k] + EPS) continue;
          if (cur.n !== n0 && ehInsp(cur.n) && !(o.deInsp && d2(cur.n.p, o.p) <= G.tolNo * 30)) { achou = cur; break; }   // hid:ok
          maxD = Math.max(maxD, cur.d);
          esg.forEach(function (t) {
            if (t.n1 !== cur.n) return;
            /* ⚠ o tubo de queda (vertical longo) leva a outra conferência (a base dele): a contagem do ramal para ali */
            if (t.vert && t.L > G.compMinLeitura) return;
            var nd = cur.d + t.L; if (dist[t.n2.k] == null || nd < dist[t.n2.k] - EPS) { dist[t.n2.k] = nd; caminho[t.n2.k] = (caminho[cur.n.k] || []).concat([t.id]); fila.push({ n: t.n2, d: nd }); }
          });
        }
        var fonteI = N.fonte("es8160.inspecao") || R["manutencao.inspecao"].fonte;
        if (achou && achou.d > o.lim + EPS) add("manutencao.inspecao", caminho[achou.n.k] || [], achou.n.p, "Da " + o.nome + " até a próxima inspeção são " + f2(achou.d) + " m pela rede (máximo " + f2(o.lim) + " m).", { fonte: fonteI });
        else if (!achou && maxD > o.lim + EPS) add("manutencao.inspecao", Object.keys(caminho).reduce(function (m, k) { return caminho[k].length > m.length ? caminho[k] : m; }, []), o.p, "Da " + o.nome + " a rede corre " + f2(maxD) + " m sem dispositivo de inspeção (máximo " + f2(o.lim) + " m).", { fonte: fonteI });
      });
    }

    /* ---------- TERMINAL DE VENTILAÇÃO perto de janela (NBR 8160 4.3.5/4.3.6, pelo HidNormas) */
    var afJan = N.valor("es8160.terminal_ventilacao", { parametro: "afastamento_janela_min" }, "valor", "critérios: terminal de ventilação"), acimaV = N.valor("es8160.terminal_ventilacao", { parametro: "acima_verga_alternativa" }, "valor", "critérios: terminal de ventilação");
    if (afJan != null && acimaV != null) {
      var topos = [];
      T.forEach(function (t) { if (t.sistema !== "ventilacao" || !t.vert) return; var top = t.p1.y > t.p2.y ? t.n1 : t.n2; if (top.t.length === 1) topos.push({ p: top.p, t: t }); });
      arr(E.pecas).forEach(function (q) {
        if (q.peca !== "terminal_ventilacao") return;
        var Pq = { x: num(q.x, 0), y: num(q.y, 0), z: num(q.z, 0) };
        topos = topos.filter(function (tp) { return d3(tp.p, Pq) > G.compMinLeitura / 2; });   /* o tubo que entra no terminal é o mesmo topo */
        topos.push({ p: Pq, t: null, id: q.id });
      });
      topos.forEach(function (tp) {
        aberturas.forEach(function (A) {
          if (txt(A.a.tipo) !== "janela") return;
          var dj = ptSeg2(tp.p, A.a.p1, A.a.p2).d, yv = num(A.a.y1, 0);
          if (dj < afJan - EPS && tp.p.y < yv + acimaV - EPS) add("ventilacao.terminalJanela", [tp.t ? tp.t.id : tp.id], tp.p, "O terminal de ventilação está a " + f2(dj) + " m da janela " + A.a.id + " e só " + f2(tp.p.y - yv) + " m acima da verga (pede " + f2(afJan) + " m de afastamento ou " + f2(acimaV) + " m acima da verga).", { obstaculo: A.a.id, fonte: N.fonte("es8160.terminal_ventilacao") || R["ventilacao.terminalJanela"].fonte });
        });
      });
    }

    /* ---------- APARELHOS servidos (para o Corrigir: refazer o ambiente daquele trecho) */
    if (aparelhos.length) out.forEach(function (ap) {
      var alc = {}, fila = ap.ids.filter(function (id) { return porId[id]; }).map(function (id) { return porId[id]; }), feitos = {}, apIds = [];
      while (fila.length) {
        var t = fila.shift(); if (feitos[t.id]) continue; feitos[t.id] = 1;
        [t.n1, t.n2].forEach(function (n) { n.t.forEach(function (o2) { if (!feitos[o2.id] && o2.sistema === t.sistema) fila.push(o2); }); alc[n.k] = n; });
      }
      aparelhos.forEach(function (a) { if (arr(a.pontos).some(function (q) { return Object.keys(alc).some(function (k) { return d3(alc[k].p, { x: num(q.x, 0), y: num(q.y, 0), z: num(q.z, 0) }) <= G.tolNo * 30; }); }) && apIds.indexOf(String(a.id)) < 0) apIds.push(String(a.id)); });   // hid:ok 30 cm do ponto
      if (ap.corrigir && apIds.length) ap.corrigir.aparelhos = apIds;
    });

    /* ---------- PRIORIDADE 21/10/2026: o CORPO da caixa sifonada / do ralo, baixado até a cota da tubulação (js/biminstgeo.js
       corpoPeca), não pode entrar na LAJE estrutural (rebaixo raso): a laje sob a peça com o topo acima do fundo do corpo */
    arr(E.corpos).forEach(function (k) {
      var base = num(k.base, NaN); if (!isFinite(base)) return;
      var sob = arr(O.lajes).filter(function (l) {
        var tp = num(l.topo, NaN), e = num(l.espessura, 0); if (!isFinite(tp) || !(e > G.cobrimentoParede * 4)) return false;   // hid:ok placa de até 6 cm = revestimento, não laje (a mesma régua do furo na laje)
        return k.x >= Math.min(l.x0, l.x1) - EPS && k.x <= Math.max(l.x0, l.x1) + EPS && k.z >= Math.min(l.z0, l.z1) - EPS && k.z <= Math.max(l.z0, l.z1) + EPS && tp <= num(k.y, 0) + EPS && tp - e < num(k.y, 0);
      }).sort(function (a, b) { return num(b.topo, 0) - num(a.topo, 0); })[0];
      if (!sob || !(num(sob.topo, 0) - base > TOL_FOLGA)) return;
      k.troca = arr(k.alternativas).filter(function (a) { return num(a.base, -INF) >= num(sob.topo, 0) + TOL_FOLGA; })[0] || null;
      var fundo = num(sob.topo, 0) - base, nome = k.peca === "caixa_sifonada" ? "caixa sifonada" : "ralo";
      add("caixa.laje", [k.id], { x: k.x, y: base, z: k.z }, "O corpo da " + nome + " " + k.id + " desce até a cota da tubulação (fundo a " + f2(base) + " m) e entra " + fcm(fundo) + " cm na laje " + sob.id + " (topo a " + f2(num(sob.topo, 0)) + " m): o rebaixo é raso para esta peça" + (k.troca ? "; a " + k.troca.rotulo + " (saída mais baixa no corpo) cabe" : "") + ".",
        { obstaculo: sob.id, corrigir: k.troca ? { tipo: "ops", ids: [k.id], ops: [{ op: "instAlterar", id: k.id, dn: k.troca.dn }], texto: "trocar pela " + k.troca.rotulo } : { tipo: "rt", ids: [k.id], texto: R["caixa.laje"].corrigir } });
    });

    /* ---------- NOTA */
    var cont = { dura: 0, alerta: 0, sugestao: 0 }, custo = 0, custoMotor = 0;
    out.forEach(function (a) { cont[a.gravidade]++; var c = R[a.regra].custo || 0; custo += c; if (R[a.regra].motor !== false) custoMotor += c; });
    var nota = Math.max(0, 100 - cont.dura * NOTA.dura - cont.alerta * NOTA.alerta - cont.sugestao * NOTA.sugestao);
    if (cont.dura) nota = Math.min(nota, NOTA.tetoComDura);
    var conceito = CONCEITO.filter(function (c) { return nota >= c[0]; })[0][1];
    /* FRENTE H6: os achados do aparelho a gás (fora da nota e da contagem do traçado) */
    var contGas = { dura: 0, alerta: 0, sugestao: 0 };
    arr(E.gas && E.gas.achados).forEach(function (g) {
      var ids = arr(g.elementos).map(String); if (!noEscopo(ids)) return;
      var grav = g.gravidade === "erro" ? "dura" : (g.gravidade === "aviso" ? "sugestao" : "alerta");
      out.push({ id: "gas13103#" + (out.length + 1), regra: "gas13103", gravidade: grav, titulo: g.titulo || R.gas13103.titulo, texto: g.texto, porque: R.gas13103.porque, fonte: g.fonte || R.gas13103.fonte, ids: ids, obstaculo: null,
        ponto: g.ponto ? { x: r4(g.ponto.x), y: g.ponto.y == null ? null : r4(g.ponto.y), z: r4(g.ponto.z) } : null, gas: true, item: g.item || "",
        corrigir: g.corrigir && arr(g.corrigir.ops).length ? { tipo: "ops", ops: g.corrigir.ops, texto: g.corrigir.texto } : null });
      contGas[grav]++;
    });
    cont.gas = contGas;
    /* ordem: dura → alerta → sugestão, e a regra na ordem do catálogo */
    var ordG = { dura: 0, alerta: 1, sugestao: 2 }, ordR = Object.keys(R);
    out.sort(function (a, b) { return ordG[a.gravidade] - ordG[b.gravidade] || ordR.indexOf(a.regra) - ordR.indexOf(b.regra); });
    return { versao: 1, apontamentos: out, nota: nota, conceito: conceito, contagem: cont, custo: r4(custo), custoMotor: r4(custoMotor), trechos: T.length, pendencias: N.pendencias() };
  }

  /* ============================================================ DO MODELO */
  var FAM_CAIXA = { "hid-caixa-inspecao": "caixa_inspecao", "hid-caixa-gordura": "caixa_gordura" };
  function doEstado(estado, avaliarFam, extra) {
    extra = extra || {};
    var B = BI(), H = HR(), AF = dep("HidAF", "./hidaf.js"), inst = (estado && estado.instalacoes) || {};
    var obst = H && H.obstaculosDoBim ? H.obstaculosDoBim(estado, avaliarFam) : {};
    /* um HidRota sem os cômodos (versão anterior): o auditor lê os ambientes do estado ele mesmo */
    if (!arr(obst.ambientes).length) obst.ambientes = arr(estado && estado.ambientes).map(function (a) { var cl = a && a.calc; return cl && arr(cl.contorno).length >= 3 ? { id: a.id, nome: txt(a.nome) || String(a.id), contorno: cl.contorno, base: num(cl.base, 0), topo: num(cl.topo, INF) } : null; }).filter(Boolean);   // hid:ok polígono tem 3+ vértices
    var porFam = {}, ordem = [];
    if (B && typeof avaliarFam === "function") { try { B.conectoresDoEstado(estado, avaliarFam).forEach(function (k) { if (!porFam[k.famInst]) { porFam[k.famInst] = []; ordem.push(k.famInst); } porFam[k.famInst].push({ sistema: k.sistema, x: k.x, y: k.y, z: k.z }); }); } catch (e) {} }
    var famDe = {}; arr(estado && estado.familias).forEach(function (f) { famDe[f.id] = f; });
    var aparelhos = ordem.filter(function (id) { return !FAM_CAIXA[(famDe[id] || {}).famId]; }).map(function (id) { var f = famDe[id] || {}; return { id: String(id), famId: f.famId, aparelho: AF && AF.aparelhoDaFamilia ? AF.aparelhoDaFamilia(f.famId) : null, pontos: porFam[id] }; });
    var caixas = arr(estado && estado.familias).filter(function (f) { return FAM_CAIXA[f.famId]; }).map(function (f) { return { id: String(f.id), tipo: FAM_CAIXA[f.famId], x: f.x, y: f.y, z: f.z, r: 0 }; });
    var pecas = arr(inst.pecas).map(function (k) { var Pk = B && B.PECAS ? B.PECAS[k.peca] : null; return { id: String(k.id), peca: k.peca, sistema: k.sistema, x: k.x, y: k.y, z: k.z, r: Pk ? num(Pk.r, 0) : 0 }; });
    pecas.filter(function (k) { return k.peca === "caixa_inspecao"; }).forEach(function (k) { caixas.push({ id: k.id, tipo: "caixa_inspecao", x: k.x, y: k.y, z: k.z, r: k.r }); });
    var trechos = arr(inst.trechos).map(function (t) { return { id: t.id, sistema: t.sistema, dn: t.dn, material: t.material, fluido: t.fluido, p1: t.p1, p2: t.p2, passantes: t.passantes }; });
    var acessorios = arr(inst.acessorios).map(function (a) { return { id: a.id, acessorio: a.acessorio, sistema: a.sistema, trecho: a.trecho, centro: a.centro }; });
    /* FRENTE H6: o aparelho a gás pela NBR 13103 (js/hidgas.js), quando carregado */
    var HGs = dep("HidGas", "./hidgas.js"), gas = null;
    if (HGs && typeof avaliarFam === "function") { try { gas = HGs.conferir({ estado: estado, avaliarFam: avaliarFam }); } catch (eG) { gas = null; } }
    /* PRIORIDADE 21/10/2026: o corpo da caixa/ralo na cota da tubulação (BimInst.rede → corpo) e as caixas de saída mais baixa no corpo (a troca do Corrigir) */
    var corpos = [], HGc = dep("HidGeo", "./biminstgeo.js");
    if (B && typeof avaliarFam === "function") { try { B.rede(estado, avaliarFam).pecas.forEach(function (k) {
      if (!k.corpo) return;
      var ct = HGc && HGc.cotasPeca ? HGc.cotasPeca(k) : null, alts = [];
      if (ct && ct.hS != null && B.PECAS[k.peca]) B.PECAS[k.peca].dns.forEach(function (dn) { if (String(dn) === String(k.dn)) return; var c2 = HGc.cotasPeca({ peca: k.peca, dn: dn }); if (c2 && c2.hS != null && c2.dnS === ct.dnS && c2.hS < ct.hS) alts.push({ dn: String(dn), rotulo: B.PECAS[k.peca].nome.toLowerCase() + " " + dn, base: r4(num(k.corpo.base, 0) + (ct.hS - c2.hS) / 1000) }); });
      corpos.push({ id: String(k.id), peca: k.peca, x: k.x, y: k.y, z: k.z, base: k.corpo.base, prolongador: k.corpo.prolongador, alternativas: alts.sort(function (a, b) { return b.base - a.base; }) });
    }); } catch (eR) { corpos = []; } }
    return { trechos: trechos, acessorios: acessorios, pecas: pecas, caixas: caixas, aparelhos: aparelhos, obstaculos: obst, ambientes: obst.ambientes || [], escopo: extra.escopo || null, parametros: extra.parametros || {}, piso: extra.piso, gas: gas, corpos: corpos };
  }

  /* texto curto para o memorial / painel */
  function resumo(A) {
    if (!A) return "";
    var c = A.contagem;
    return "Qualidade do traçado: " + A.nota + "/100 (" + A.conceito + ") — " + c.dura + " proibido(s), " + c.alerta + " alerta(s), " + c.sugestao + " sugestão(ões).";
  }

  /* =====================================================================================================================
   * CORRIGIR O TRAÇADO FEITO À MÃO (N23, pedido do Rogério 24–25/10/2026): "se o usuário traçar errado, o sistema já sabe o que
   * está errado e POR QUÊ" — todo achado do Verificar sistemas (js/biminst.js verificar/conectividade) e do critério de projetista
   * (acima) ganha o seu Corrigir, que refaz AQUELE trecho mantendo a intenção do usuário: os PONTOS em planta e a rota ficam; muda
   * só o que a regra pede (a cota, o sentido, a ponta que não chegou, a bitola, o passante). "Corrigir tudo neste ambiente" junta os
   * achados do cômodo. O motor só PROPÕE as ops (a tela mostra a prévia, Enter aplica num lote, UM Ctrl+Z desfaz); nada é apagado
   * sem aparecer na prévia (`apagados`), e a correção que piora o modelo (ponta nova solta, aviso novo) é recusada com o motivo.
   *   HidCorrigir.achados(ctx) → [{ chave, origem, tipo, gravidade, titulo, texto, ids, ponto, correcao: {tipo, texto} | null }]
   *   HidCorrigir.propor(ctx, achado) → { ok, ops, texto, mudados, apagados, motivo }
   *   HidCorrigir.ambiente(ctx, ambienteId) → { ok, ops, textos, corrigidos, restam, motivo }
   *   ctx = { estado, avaliarFam, ops? }
   * ===================================================================================================================== */
  var CORR = {
    captura: 0.10,       // hid:ok m: a ponta solta encosta no ponto/tubo/peça do mesmo sistema até esta distância (critério de desenho)
    iteracoes: 12        // hid:ok quantas correções em série no "Corrigir tudo neste ambiente" (cada uma no modelo já corrigido)
  };
  function corrBE() { return dep("BimEdit", "./bimedit.js"); }
  function d3c(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)); }
  function porIdTr(estado) { var o = {}; arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { o[String(t.id)] = t; }); return o; }
  function aplicarEm(ctx, ops) {
    var BE = corrBE(); if (!BE || !BE.aplicar || !ctx.ops) return null;
    try { return BE.aplicar(arr(ctx.ops).concat([{ op: "lote", id: "previa-corrigir", ops: JSON.parse(JSON.stringify(ops)) }])); } catch (e) { return null; }
  }
  /* o que o Verificar acusa num estado (para comparar antes × depois): pontas soltas, conectores sem tubo e avisos por trecho */
  function placar(estado, avaliarFam) {
    var B = BI(); if (!B || !estado) return null;
    var V = null; try { V = B.verificar(estado, avaliarFam); } catch (e) { return null; }
    var p = { ponta: 0, conector: 0, inclinacao: 0, bitola: 0, porTrecho: {} };
    V.itens.forEach(function (i) { if (p[i.tipo] != null) p[i.tipo]++; p.total = (p.total || 0) + 1; arr(i.ids).forEach(function (id) { (p.porTrecho[id] = p.porTrecho[id] || []).push(i.tipo); }); });
    /* REVISÃO: e o critério de projetista — nenhum PROIBIDO novo (viga, pilar, vão, laje sem passante…) por causa da correção */
    try { var Q0 = auditar(doEstado(estado, avaliarFam)); p.dura = Q0 && Q0.contagem ? Q0.contagem.dura : 0; p.alerta = Q0 && Q0.contagem ? Q0.contagem.alerta : 0; } catch (eQ) { p.dura = 0; p.alerta = 0; }
    return p;
  }
  /* a correção NÃO pode piorar: nenhuma ponta solta nova, nenhum conector sem tubo novo, nenhum aviso de inclinação/bitola novo */
  function naoPiora(ctx, ops, alvoTipo, alvoId) {
    var antes = placar(ctx.estado, ctx.avaliarFam), est2 = aplicarEm(ctx, ops), depois = est2 ? placar(est2, ctx.avaliarFam) : null;
    if (!antes || !depois) return { ok: false, motivo: "não consegui conferir a correção no modelo" };
    if (depois.ponta > antes.ponta) return { ok: false, motivo: "a correção deixaria " + (depois.ponta - antes.ponta) + " ponta(s) solta(s) nova(s)" };
    if (depois.conector > antes.conector) return { ok: false, motivo: "a correção soltaria " + (depois.conector - antes.conector) + " ponto(s) de aparelho" };
    if (depois.inclinacao > antes.inclinacao - (alvoTipo === "inclinacao" ? 1 : 0)) return { ok: false, motivo: "a inclinação continua (ou outra ficou) fora da mínima" };
    if (alvoId && arr(depois.porTrecho[alvoId]).indexOf(alvoTipo) >= 0) return { ok: false, motivo: "o trecho " + alvoId + " continua com o mesmo problema" };
    if (depois.dura > antes.dura) return { ok: false, motivo: "a correção criaria " + (depois.dura - antes.dura) + " PROIBIDO(s) de projetista (viga, pilar, vão, laje…)" };
    if (depois.alerta > antes.alerta) return { ok: false, motivo: "a correção criaria " + (depois.alerta - antes.alerta) + " alerta(s) de projetista novo(s)" };
    return { ok: true, estado: est2 };
  }
  /* ⚠ REVISÃO (25/10/2026): a op "trecho" SUBSTITUI o tubo inteiro — a correção parte da ÚLTIMA op do usuário para aquele id (todos
     os campos dele: isolamento, fase criada/demolida, comentários, saída livre, juntas, redeParte, tomada, passantes…) e troca só a
     geometria/DN. As marcas de GERADO (kit/ambiente) saem: o tubo refeito à mão passa a ser edição manual — o kit/ambiente pergunta
     antes de refazer por cima (js/hidkit.js e js/hidkitui.js _ambManual contam a op "trecho"). */
  var MARCAS_GERADO = ["kit", "kitParte", "kitAss", "kitTipo", "amb", "ambInfo"];
  function opOriginal(ctx, id) {
    var ult = null;
    (function rec(L) { arr(L).forEach(function (o) { if (!o) return; if (o.op === "lote") rec(o.ops); else if (o.op === "trecho" && String(o.id) === String(id)) ult = o; else if (o.op === "acessorio" && o.novoId != null && String(o.novoId) === String(id)) ult = null; }); })(ctx && ctx.ops);
    return ult ? JSON.parse(JSON.stringify(ult)) : null;
  }
  function comOriginal(ctx, o) {
    if (!o || o.op !== "trecho") return o;
    var base = opOriginal(ctx, o.id); if (!base) return o;
    Object.keys(o).forEach(function (k) { base[k] = o[k]; });
    MARCAS_GERADO.forEach(function (k) { delete base[k]; });
    return base;
  }
  function opTrecho(t, p1, p2, ctx) {
    var B = BI(), o = B && B.opDoTrecho ? B.opDoTrecho(t) : { op: "trecho", id: t.id, sistema: t.sistema, material: t.material, dn: t.dn };
    o.p1 = { x: r4(p1.x), y: r4(p1.y), z: r4(p1.z) }; o.p2 = { x: r4(p2.x), y: r4(p2.y), z: r4(p2.z) };
    if (arr(t.passantes).length) o.passantes = JSON.parse(JSON.stringify(t.passantes));
    if (!ctx) return o;
    var base = opOriginal(ctx, t.id); if (!base) return o;
    base.p1 = o.p1; base.p2 = o.p2; base.dn = o.dn; if (o.continua != null) base.continua = o.continua; else delete base.continua;
    if (o.pecaIni != null) base.pecaIni = o.pecaIni; else delete base.pecaIni; if (o.pecaFim != null) base.pecaFim = o.pecaFim; else delete base.pecaFim;
    MARCAS_GERADO.forEach(function (k) { delete base[k]; });
    return base;
  }
  /* as ops do BimInst.trocarDn (que monta a op pelo estado) com os campos do usuário preservados */
  function preservar(ctx, ops) { return arr(ops).map(function (o) { return comOriginal(ctx, o); }); }
  /* --------------------------------------------- os corretores (cada um só mexe no que a regra pede) */
  /* INCLINAÇÃO: abaixo da mínima → a ponta de jusante e o que vem depois descem (BimInst.trocarDn com o MESMO DN — a regra do
     sistema: quem manda é o montante); SOBE no sentido do escoamento → o traço foi desenhado AO CONTRÁRIO (do ralo para o aparelho):
     o mesmo tubo, com p1 e p2 trocados. Fica a opção que não piora o modelo; as duas pioram → recusa com o motivo. */
  function corrigirInclinacao(ctx, a) {
    var B = BI(), t = porIdTr(ctx.estado)[a.ids[0]]; if (!B || !t) return { ok: false, motivo: "trecho não encontrado" };
    var cands = [];
    if (t.p2.y > t.p1.y + EPS) {
      var inv = opTrecho(t, t.p2, t.p1, ctx);
      if (inv.continua === "p1") inv.continua = "p2"; else if (inv.continua === "p2") inv.continua = "p1";
      if (inv.pecaIni != null || inv.pecaFim != null) { var pi = inv.pecaIni; inv.pecaIni = inv.pecaFim; inv.pecaFim = pi; if (inv.pecaIni == null) delete inv.pecaIni; if (inv.pecaFim == null) delete inv.pecaFim; }
      cands.push({ ops: [inv], texto: "o trecho " + t.id + " estava desenhado ao contrário (sobe no sentido do escoamento): mesmo tubo, sentido invertido (p1 ↔ p2)" });
    }
    var TD = null; try { TD = B.trocarDn(ctx.estado, ctx.avaliarFam, [t.id], t.dn); } catch (e) { TD = null; }
    if (TD && TD.ok && TD.ops.length) cands.push({ ops: preservar(ctx, TD.ops), texto: "o trecho " + t.id + " ficou com a inclinação mínima: " + arr(TD.avisos).join("; ") });
    var motivo = "nenhuma opção fechou";
    for (var i = 0; i < cands.length; i++) {
      var np = naoPiora(ctx, cands[i].ops, "inclinacao", t.id);
      if (np.ok) return { ok: true, ops: cands[i].ops, texto: cands[i].texto, mudados: cands[i].ops.map(function (o) { return String(o.id); }), apagados: [] };
      motivo = np.motivo;
    }
    return { ok: false, motivo: "inclinação de " + t.id + ": " + motivo + " — a ponta de jusante está presa (caixa/peça) e o montante também; mova a peça ou o ponto" };
  }
  /* PONTA SOLTA: o tubo terminou perto do ponto (do aparelho, de outro tubo ou da peça do mesmo sistema) e não chegou — a ponta vai
     até o alvo mais perto (até CORR.captura); a outra ponta e a rota ficam */
  function corrigirPonta(ctx, a) {
    var B = BI(), T = porIdTr(ctx.estado), t = T[a.ids[0]]; if (!B || !t || a.ponto == null || a.ponto.x == null) return { ok: false, motivo: "ponta sem posição" };
    var P = { x: a.ponto.x, y: a.ponto.y, z: a.ponto.z }, qual = d3c(t.p1, P) <= d3c(t.p2, P) ? "p1" : "p2", outra = qual === "p1" ? t.p2 : t.p1;
    var alvos = [];
    Object.keys(T).forEach(function (id) { var u = T[id]; if (id === String(t.id) || u.sistema !== t.sistema) return; [u.p1, u.p2].forEach(function (q) { alvos.push({ p: q, o: "a ponta do trecho " + id }); }); });
    try { var R = B.rede(ctx.estado, ctx.avaliarFam); arr(R.conectoresLivres).forEach(function (k) { if (k.sistema === t.sistema) alvos.push({ p: { x: k.x, y: k.y, z: k.z }, o: "o ponto \"" + k.nome + "\" de " + k.famInst }); }); } catch (eR) {}
    arr(ctx.estado.instalacoes && ctx.estado.instalacoes.pecas).forEach(function (k) { if (k.sistema === t.sistema && isFinite(num(k.x, NaN))) alvos.push({ p: { x: num(k.x, 0), y: num(k.y, 0), z: num(k.z, 0) }, o: "a peça " + k.id }); });
    var melhor = null;
    alvos.forEach(function (q) { var d = d3c(q.p, P); if (d > EPS && d <= CORR.captura && d3c(q.p, outra) > EPS && (!melhor || d < melhor.d)) melhor = { d: d, q: q }; });
    if (!melhor) return { ok: false, motivo: "nenhum ponto, tubo ou peça do mesmo sistema a até " + fcm(CORR.captura) + " cm da ponta: termine o traço no ponto (ou use Ligar esta peça no aparelho)" };
    var p1 = qual === "p1" ? melhor.q.p : t.p1, p2 = qual === "p2" ? melhor.q.p : t.p2, ops = [opTrecho(t, p1, p2, ctx)];
    var np = naoPiora(ctx, ops, "ponta", null);
    if (np.ok && placar(np.estado, ctx.avaliarFam).ponta < placar(ctx.estado, ctx.avaliarFam).ponta) return { ok: true, ops: ops, texto: "a ponta solta do trecho " + t.id + " foi até " + melhor.q.o + " (" + fcm(melhor.d) + " cm)", mudados: [String(t.id)], apagados: [] };
    /* esgoto/pluvial: a ponta nova pode ter tirado a inclinação — junto, a mínima pela jusante */
    var est2 = aplicarEm(ctx, ops), TD = null; try { TD = est2 ? B.trocarDn(est2, ctx.avaliarFam, [t.id], t.dn) : null; } catch (eT) { TD = null; }
    if (TD && TD.ok && TD.ops.length) {
      var junto = ops.concat(preservar(ctx, TD.ops)), np2 = naoPiora(ctx, junto, "ponta", null);
      if (np2.ok) return { ok: true, ops: junto, texto: "a ponta solta do trecho " + t.id + " foi até " + melhor.q.o + " e a inclinação mínima foi refeita pela jusante", mudados: junto.map(function (o) { return String(o.id); }), apagados: [] };
    }
    return { ok: false, motivo: "ligar a ponta em " + melhor.q.o + " " + (np.motivo || "não fechou a ligação") };
  }
  /* BITOLA fora da lista comercial: o DN comercial mais perto ACIMA (nunca abaixo), com a inclinação mínima do DN novo */
  function corrigirBitola(ctx, a) {
    var B = BI(), t = porIdTr(ctx.estado)[a.ids[0]]; if (!B || !t) return { ok: false, motivo: "trecho não encontrado" };
    var M = B.MATERIAIS[t.material] || {}, dns = arr(M.dns).slice().sort(function (x, y) { return x - y; }), dnC = dns.filter(function (d) { return d >= num(t.dn, 0); })[0];
    if (dnC == null) return { ok: false, motivo: "DN " + t.dn + " acima do maior DN comercial de " + (M.nome || t.material) };
    var TD = B.trocarDn(ctx.estado, ctx.avaliarFam, [t.id], dnC); if (!TD.ok) return { ok: false, motivo: TD.erro }; TD.ops = preservar(ctx, TD.ops);
    var np = naoPiora(ctx, TD.ops, "bitola", t.id); if (!np.ok) return { ok: false, motivo: np.motivo };
    return { ok: true, ops: TD.ops, texto: "trecho " + t.id + ": DN " + t.dn + " → DN " + dnC + " (bitola comercial de " + (M.nome || t.material) + ")" + (TD.avisos.length ? "; " + TD.avisos.join("; ") : ""), mudados: TD.ops.map(function (o) { return String(o.id); }), apagados: [] };
  }
  /* LUVA desnecessária (critério economia.luva): os dois trechos viram um, com o id do primeiro (o segundo SAI e aparece na prévia) */
  function corrigirLuva(ctx, a) {
    var T = porIdTr(ctx.estado), ids = arr(a.corrigir && a.corrigir.ids), ta = T[ids[0]], tb = T[ids[1]]; if (!ta || !tb) return { ok: false, motivo: "trechos da emenda não encontrados" };
    /* as pontas que ficam levam a marca "continua" de quem as tinha (senão a espera do fim vira ponta solta) */
    function cont(t, q) { return t.continua === "ambos" || t.continua === q; }
    var pares = [{ a: ta.p1, b: tb.p2, ca: cont(ta, "p1"), cb: cont(tb, "p2") }, { a: tb.p1, b: ta.p2, ca: cont(tb, "p1"), cb: cont(ta, "p2") }].sort(function (u, v) { return d3c(v.a, v.b) - d3c(u.a, u.b); });
    var e0 = pares[0], novo = opTrecho(ta, e0.a, e0.b, ctx);
    /* os dois têm de ser o MESMO tubo (material, DN, sistema, isolamento, fase): diferente = não é emenda à toa, não junta */
    var oa = opOriginal(ctx, ta.id) || {}, ob = opOriginal(ctx, tb.id) || {}, dif = ["sistema", "material", "dn", "isolamento", "faseCriada", "faseDemolida", "pn", "classe", "serie"].filter(function (k) { return JSON.stringify(oa[k] == null ? ta[k] : oa[k]) !== JSON.stringify(ob[k] == null ? tb[k] : ob[k]); });
    if (dif.length) return { ok: false, motivo: "os trechos " + ta.id + " e " + tb.id + " diferem em " + dif.join(", ") + ": a emenda fica (junte à mão, se for o caso)" };
    var pass = arr(ta.passantes).concat(arr(tb.passantes)); if (pass.length) novo.passantes = JSON.parse(JSON.stringify(pass));
    if (e0.ca && e0.cb) novo.continua = "ambos"; else if (e0.ca) novo.continua = "p1"; else if (e0.cb) novo.continua = "p2"; else delete novo.continua;
    var ops = [{ op: "apagar", id: String(tb.id) }, novo], np = naoPiora(ctx, ops, "luva", null);
    if (!np.ok) return { ok: false, motivo: np.motivo };
    return { ok: true, ops: ops, texto: "os trechos " + ta.id + " e " + tb.id + " viram um só (a emenda sai)", mudados: [String(ta.id)], apagados: [String(tb.id)] };
  }
  /* FURO NA LAJE sem passante (critério estrutura.laje): o passante lançado no ponto da travessia (HidCriterios.lancarPassantes —
     a mesma conta do alerta), orçado pela SINAPI do passante */
  function corrigirPassante(ctx, a) {
    var T = porIdTr(ctx.estado), ops = arr(a.ids).map(function (id) { var t = T[id]; return t ? opTrecho(t, t.p1, t.p2, ctx) : null; }).filter(Boolean);
    if (!ops.length) return { ok: false, motivo: "trecho não encontrado" };
    var L = lancarPassantes(ops, ctx.estado, ctx.avaliarFam);
    if (!L.n) return { ok: false, motivo: "nenhuma travessia de laje achada nesses trechos" };
    return { ok: true, ops: ops.filter(function (o) { return arr(o.passantes).length; }), texto: L.n + " passante(s) lançado(s) na laje (" + L.trechos.join(", ") + ")", mudados: L.trechos, apagados: [] };
  }
  function correcaoDe(a) {
    if (a.origem === "verificar") {
      if (a.tipo === "inclinacao") return { tipo: "inclinacao", texto: /SOBE/.test(a.texto) ? "Corrigir o sentido/a inclinação do trecho (os pontos ficam)" : "Dar a inclinação mínima (a jusante desce, os pontos em planta ficam)" };
      if (a.tipo === "ponta") return { tipo: "ponta", texto: "Levar a ponta até o ponto/tubo mais perto (até " + fcm(CORR.captura) + " cm)" };
      if (a.tipo === "bitola") return { tipo: "bitola", texto: "Trocar para a bitola comercial acima" };
      if (a.tipo === "conector") return { tipo: "ligarPeca", texto: "Ligar esta peça (o kit e a ligação, com a prévia)", famInst: a.ids[0] };
      return null;
    }
    var c = a.corrigir; if (!c) return null;
    if (a.regra === "economia.luva" && c.tipo === "juntar") return { tipo: "luva", texto: c.texto || "Juntar os dois trechos" };
    if (a.regra === "estrutura.laje") return { tipo: "passante", texto: "Lançar o passante na laje" };
    if (c.tipo === "ops" && arr(c.ops).length) return { tipo: "ops", texto: c.texto, ops: c.ops };
    if (c.tipo === "refazer" && arr(c.aparelhos).length) return { tipo: "tracar", texto: "Refazer pelo Traçar automaticamente (o traçado deste aparelho é refeito, com a prévia)", aparelhos: c.aparelhos };
    if (c.tipo === "rt") return { tipo: "rt", texto: c.texto };
    return null;
  }
  function achadosCorr(ctx) {
    var B = BI(), out = [];
    if (!B || !ctx || !ctx.estado) return out;
    var V = null; try { V = B.verificar(ctx.estado, ctx.avaliarFam); } catch (e) { V = null; }
    arr(V && V.itens).forEach(function (i, k) {
      var a = { chave: "v" + k + ":" + i.tipo + ":" + arr(i.ids).join(","), origem: "verificar", tipo: i.tipo, gravidade: i.gravidade, titulo: i.rotuloTipo, texto: i.texto, ids: arr(i.ids).map(String), ponto: i.x == null ? null : { x: i.x, y: i.y, z: i.z } };
      a.correcao = correcaoDe(a); out.push(a);
    });
    var Q = null; try { Q = auditar(doEstado(ctx.estado, ctx.avaliarFam)); } catch (e2) { Q = null; }
    arr(Q && Q.apontamentos).forEach(function (q, k) {
      var a = { chave: "c" + k + ":" + q.regra + ":" + arr(q.ids).join(","), origem: "criterio", tipo: q.regra, regra: q.regra, gravidade: q.gravidade === "dura" ? "erro" : "aviso", titulo: q.titulo, texto: q.texto, porque: q.porque, fonte: q.fonte, ids: arr(q.ids).map(String), ponto: q.ponto || null, corrigir: q.corrigir || null, obstaculo: q.obstaculo || null };
      a.correcao = correcaoDe(a); out.push(a);
    });
    return out;
  }
  function proporCorr(ctx, a) {
    if (!a || !a.correcao) return { ok: false, motivo: "este achado não tem correção automática: veja no 3D e ajuste à mão" + (a && a.corrigir && a.corrigir.texto ? " (" + a.corrigir.texto + ")" : "") };
    var c = a.correcao, r;
    try {
      if (c.tipo === "inclinacao") r = corrigirInclinacao(ctx, a);
      else if (c.tipo === "ponta") r = corrigirPonta(ctx, a);
      else if (c.tipo === "bitola") r = corrigirBitola(ctx, a);
      else if (c.tipo === "luva") r = corrigirLuva(ctx, a);
      else if (c.tipo === "passante") r = corrigirPassante(ctx, a);
      else if (c.tipo === "ops") r = { ok: true, ops: JSON.parse(JSON.stringify(c.ops)), texto: c.texto, mudados: c.ops.map(function (o) { return String(o.id); }), apagados: c.ops.filter(function (o) { return o.op === "apagar"; }).map(function (o) { return String(o.id); }) };
      else return { ok: false, tela: c.tipo, motivo: c.texto, famInst: c.famInst || null, aparelhos: c.aparelhos || null };   /* ligarPeca / tracar / rt: a tela faz (prévia do Traçar) */
    } catch (e) { r = { ok: false, motivo: "a correção falhou: " + (e && e.message ? e.message : e) }; }
    return r;
  }
  function ambDe(estado, id) { return arr(estado && estado.ambientes).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
  function noAmbiente(ctx, a, amb) {
    var pts = arr(amb && amb.calc && amb.calc.contorno); if (pts.length < 3) return false;   // hid:ok polígono tem 3+ vértices (geometria)
    var T = porIdTr(ctx.estado), P = a.ponto && a.ponto.x != null ? a.ponto : null;
    if (!P && a.ids.length && T[a.ids[0]]) { var t = T[a.ids[0]]; P = { x: (t.p1.x + t.p2.x) / 2, z: (t.p1.z + t.p2.z) / 2 }; }
    return !!P && dentroPoli({ x: P.x, z: P.z }, pts);
  }
  /* CORRIGIR TUDO NESTE AMBIENTE: um achado por vez, cada um no modelo já corrigido (os ids e as cotas mudam), até não sobrar nada que
     se corrige sozinho — TODAS as ops num lote (a tela: uma prévia, um Ctrl+Z) */
  function ambienteCorr(ctx, ambId) {
    var amb = ambDe(ctx.estado, ambId); if (!amb) return { ok: false, motivo: "ambiente " + ambId + " não encontrado", ops: [] };
    var ops = [], textos = [], feitos = 0, recusados = {}, c2 = { estado: ctx.estado, avaliarFam: ctx.avaliarFam, ops: arr(ctx.ops) };
    for (var k = 0; k < CORR.iteracoes; k++) {
      var lista = achadosCorr(c2).filter(function (a) { return a.correcao && /^(inclinacao|ponta|bitola|luva|passante)$/.test(a.correcao.tipo) && !recusados[a.chave.replace(/^[vc]\d+:/, "")] && noAmbiente(c2, a, amb); });
      if (!lista.length) break;
      var a = lista[0], r = proporCorr(c2, a);
      if (!r.ok) { recusados[a.chave.replace(/^[vc]\d+:/, "")] = r.motivo; continue; }
      r.ops.forEach(function (o) { ops.push(o); }); textos.push(r.texto); feitos++;
      var est2 = aplicarEm(c2, r.ops); if (!est2) break;
      c2 = { estado: est2, avaliarFam: ctx.avaliarFam, ops: c2.ops.concat([{ op: "lote", id: "previa-corrigir-" + k, ops: JSON.parse(JSON.stringify(r.ops)) }]) };
    }
    var restam = achadosCorr(c2).filter(function (a) { return noAmbiente(c2, a, amb); });
    return { ok: feitos > 0, ops: ops, textos: textos, corrigidos: feitos, restam: restam, recusados: recusados, motivo: feitos ? "" : "nada neste ambiente se corrige sozinho" + (Object.keys(recusados).length ? " (" + Object.keys(recusados).map(function (k2) { return recusados[k2]; }).join("; ") + ")" : "") };
  }
  var HidCorrigir = { CORR: CORR, achados: achadosCorr, propor: proporCorr, ambiente: ambienteCorr, _int: { naoPiora: naoPiora, placar: placar, noAmbiente: noAmbiente, opTrecho: opTrecho, comOriginal: comOriginal } };
  global.HidCorrigir = HidCorrigir;

  var HidCriterios = {
    VERSAO: 1, GEO: GEO, NOTA: NOTA, REGRAS: R, corrigir: HidCorrigir,
    auditar: auditar, doEstado: doEstado, caixasAbertura: caixasAbertura, classificarAmbiente: classificarAmbiente, resumo: resumo, lancarPassantes: lancarPassantes, travessiasLaje: travessiasLaje,
    _int: { recorte: recorte, caixaSeg: caixaSeg, segSeg3: segSeg3, dentroPoli: dentroPoli, normTrechos: normTrechos }
  };
  global.HidCriterios = HidCriterios;
  if (typeof module !== "undefined" && module.exports) module.exports = HidCriterios;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
