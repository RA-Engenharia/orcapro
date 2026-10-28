/* =====================================================================
 * andaimeajuda.js — O DICIONÁRIO ÚNICO DE TEXTOS DO ANDAIME (E11, 27/10/2026). ES5, puro, Node-testável, sem DOM.
 *
 * Pedido do Rogério: "quando tiver um erro, você vai verificar o que é e me falar: o erro é por isso; se fizer assim, vai dar certo.
 * Não é o usuário que tem que saber onde está o erro. Todos os parâmetros que o usuário coloca têm de ter texto explicativo,
 * para ele não colocar coisa errada."
 *
 *   (a) CAMPOS: a AJUDA de cada parâmetro/campo da tela, sempre com os 5 itens: o que é · unidade · valor típico · de onde vem · se errar.
 *   (b) VERIF: a EXPLICAÇÃO em linguagem simples de cada verificação do cálculo (ids do andaimecalc.js e do andaimemulticalc.js), com os
 *       dados do RT que a liberam.
 *   (c) TXT: os rótulos e frases do diagnóstico (cartão de falha, «Corrigir tudo», memorial na tela) — nenhum texto de ajuda mora no andaimeui.js.
 *   (d) funções puras: causa(), descreverMudanca(), validar(), icone()/linhaHtml() (o ⓘ e a linha curta sob o rótulo).
 *
 * ⚠ REGRAS QUE NÃO PODEM SER "SIMPLIFICADAS":
 *   1. NADA INVENTADO. «Valor típico» só existe com fonte que já está nos catálogos (Andaime.PARAMETROS_RT, AndaimeMulti.PARAMETROS_RT, PADRAO,
 *      as mensagens de Andaime.validar / AndaimeMulti.validar e as pendências do RT). Sem fonte, o texto diz «o RT define».
 *      Motivo: um número bonito sem fonte na tela vira «valor de norma» na cabeça do usuário.
 *   2. As faixas de validação (min/max) são as que o próprio Andaime.validar / AndaimeMulti.validar já recusam: o aviso no campo antecipa a
 *      recusa, não cria regra nova. O aviso NUNCA apaga o que a pessoa digitou.
 *   3. A causa mostra os NÚMEROS do cálculo (solicitante, resistente, uso) — «linguagem simples» não é esconder o número.
 * Teste: node tools/test-andaimeajuda.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function brf(v, c) { c = c == null ? 2 : c; if (v == null || !isFinite(v)) return "—"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function ehMulti(sis) { return /^multi/.test(String(sis || "")); }

  var NR = "o RT define";

  /* ================================================================ (a) CAMPOS
   * rot = rótulo curto; o = o que é; u = unidade; t = valor típico (com a fonte); f = de onde vem; e = o que acontece se errar;
   * un = unidade curta para formatar números; min/max/gt0/zeroOk/passo = faixa que o motor já recusa; multi = o que muda no multidirecional. */
  var CAMPOS = {
    /* ---------- traçado e Resumo */
    altura: { rot: "Altura a vencer", un: "m", min: 0.5, max: 60, o: "Altura do piso de trabalho mais alto, contada do chão da base: é o que você quer alcançar com o andaime.", u: "metros (m)", t: "Sem valor fixo: é a altura do seu serviço (o sistema começa com 6,00 m). O motor aceita de 0,50 a 60 m.", f: "Do serviço a executar (projeto, fachada ou equipamento).", e: "Altura maior = mais níveis, mais peças, mais vento e mais carga na base; o cálculo diz se passa. Mudar a altura de um andaime aprovado o devolve para «em revisão»." },
    sistema: { rot: "Sistema do andaime", o: "Qual andaime você vai montar: tubo-roll (tubo equipado com braçadeiras) ou multidirecional (postes com roseta ou estribo e travessas de cunha).", u: "—", t: "Tubo-roll · Multidirecional (roseta) · Multidirecional (estribo). O que vale é o que o locador entrega na obra.", f: "Do que o locador fornece e do manual do fabricante.", e: "Trocar o sistema refaz o andaime no lugar com o mesmo traçado e altura, volta os parâmetros ao padrão do sistema novo e a aprovação volta para «em revisão»." },
    lado: { rot: "Lado do andaime", o: "De que lado da linha traçada o andaime fica, olhando do começo para o fim (esquerda ou direita; no contorno: por fora ou por dentro).", u: "—", t: "Tab troca o lado no traçado; no contorno de equipamento o padrão é por fora.", f: "De onde está a fachada ou o equipamento em relação à linha que você traçou.", e: "Lado errado põe o andaime longe da face: as ancoragens não encontram onde prender e o vão até a fachada deixa de ser o previsto." },
    intel: { rot: "Montar inteligente", o: "Quando ligado, ao fechar o traçado o sistema ajusta sozinho vão, levante e ancoragem até o andaime passar nas verificações, e lista cada mudança com Desfazer.", u: "—", t: "Ligado (é o padrão).", f: "Decisão sua; o gerador usa o mesmo cálculo da aba Cálculo.", e: "Desligado, o andaime nasce exatamente com o que foi pedido e pode nascer reprovado. Nada é mudado em silêncio nos dois casos." },
    comprimento: { rot: "Comprimento", un: "m", min: 1, max: 200, o: "Comprimento da face a cobrir quando você não traça pontos.", u: "metros (m)", t: "O motor aceita de 1 a 200 m; com o caminho traçado este campo não é usado.", f: "Da medida da fachada ou do equipamento.", e: "Comprimento errado muda o número de vãos, de peças e de ancoragens." },
    caminho: { rot: "Caminho da face", o: "Os pontos da face a trabalhar, em metros relativos ao primeiro (x z; x z…). Os cliques no desenho preenchem.", u: "metros (m)", t: "Cada trecho com pelo menos 0,30 m; encontros com ângulo de pelo menos 30° (regra do motor).", f: "Dos cliques no desenho ou da planta.", e: "Pontos quase no mesmo lugar ou ângulos fechados demais fazem o motor recusar o traçado." },
    contorno: { rot: "Contorno fechado", o: "Os cantos do contorno em volta de um equipamento (x z; x z…), com 3 pontos ou mais.", u: "metros (m)", t: "Mínimo de 3 cantos.", f: "Dos cliques no desenho ou da planta do equipamento.", e: "Com menos de 3 cantos o contorno não fecha." },
    /* ---------- vento e RT (pendências) */
    V0: { rot: "V0 — velocidade básica do vento", un: "m/s", min: 20, max: 60, o: "Velocidade básica do vento da região da obra: a base de toda a força de vento sobre o andaime e a tela.", u: "metros por segundo (m/s)", t: "Sai sozinho do local da obra quando o cadastro tem coordenadas (mapa de isopletas da NBR 6123:2023). O campo aceita de 20 a 60 m/s.", f: "Mapa de isopletas da NBR 6123:2023 (Figura 1) pelo local da obra, ou o RT.", e: "Sem V0 o vento não entra: montante, ancoragem e vento ficam NÃO VERIFICADOS. V0 menor que o real aprova um andaime que o vento derruba." },
    categoria: { rot: "Categoria de rugosidade do terreno", o: "Quanto o terreno em volta da obra freia o vento: de I (aberto e liso) a V (muitos obstáculos altos).", u: "I a V", t: "Sem informar, o sistema usa a pior (I) e deixa a pendência visível.", f: "NBR 6123:2023 5.3.1, pela vista do entorno da obra.", e: "Categoria mais fechada que a real diminui o vento calculado; o andaime pode passar na conta e não no vento de verdade." },
    telaSombreamento: { rot: "Tela: fração fechada", un: "", min: 0.05, max: 1, o: "Quanto da área da tela é fechada: 1,00 é lona; menos é tela aberta. A tela é o que mais faz o vento empurrar o andaime.", u: "fração de 0,05 a 1,00", t: "Sem informar, vale 0,75 (pior caso). As opções do campo são 0,30 · 0,50 · 0,75 · 1,00.", f: "Ficha técnica da tela do fornecedor.", e: "Informar menos do que a tela real diminui a força nas ancoragens e nos montantes: a conta passa e a obra não." },
    faceAte: { rot: "Face até a cota", un: "m", min: 0, max: 200, o: "Até que altura existe fachada ou estrutura onde dá para prender a ancoragem.", u: "metros (m)", t: "Vazio vale «a face vai até o topo», hipótese que o RT confirma. O campo aceita de 0 a 200 m.", f: "Projeto da edificação ou vistoria do RT.", e: "Se a face acaba antes do topo, o trecho de cima fica sem ancoragem; informar mais do que existe esconde essa falta." },
    sigmaSolo: { rot: "Tensão admissível do apoio", un: "kPa", min: 1, max: 5000, o: "Quanto o chão (ou a laje) aguenta por área sob o calço ou a placa da base.", u: "quilopascal (kPa)", t: "Sem valor no sistema: " + NR + ". O campo aceita de 1 a 5000 kPa, e o RT precisa confirmar.", f: "Laudo ou sondagem do solo, ou projeto da laje.", e: "Sem ele o apoio fica NÃO VERIFICADO. Valor alto demais aprova um apoio que afunda no solo ou fissura a laje." },
    capAncoragem: { rot: "Capacidade da ancoragem", un: "kN", min: 0.5, max: 200, o: "A força que um ponto de ancoragem (chumbador ou olhal) aguenta antes de arrancar.", u: "quilonewton (kN)", t: "O sistema parte de 6,25 kN: é referência estrangeira (HSA), não norma. O campo aceita de 0,5 a 200 kN.", f: "Ensaio de arrancamento ou ficha do chumbador usado.", e: "Valor maior que o real aprova uma ancoragem que arranca; o cálculo compara a força do vento por ponto com este número." },
    ventoParaleloRT: { rot: "Vento paralelo à fachada", o: "O sistema não calcula o vento que bate de lado, paralelo à fachada (atrito na tela e cabeceiras sobre as diagonais). O RT confere por escrito.", u: "marca + justificativa de pelo menos 15 caracteres", t: "Marcar só depois de conferir; a justificativa vai para o memorial.", f: "Memória de cálculo do RT (NBR 6123:2023).", e: "Sem a marca a verificação fica NÃO VERIFICADA; marcar sem conferir passa por cima de um risco real." },
    capNoKgf: { rot: "Ligação travessa–roseta: carga vertical", un: "kgf", min: 1, max: 10000, o: "A carga vertical que a ligação da travessa na roseta (cunha) aguenta por ponta.", u: "quilograma-força (kgf)", t: "Sem fonte pública: " + NR + ". O campo aceita de 1 a 10 000 kgf.", f: "Tabela do fabricante do locador.", e: "Sem ela a ligação fica NÃO VERIFICADA; valor acima do real aprova uma ligação que pode escapar." },
    capLigAxialKgf: { rot: "Ligação travessa–roseta: carga axial", un: "kgf", min: 1, max: 10000, o: "A força ao longo da barra que a ligação da cunha aguenta (travessa longitudinal e elo transversal). Não é a carga vertical.", u: "quilograma-força (kgf)", t: "Sem fonte pública: " + NR + ". O campo aceita de 1 a 10 000 kgf.", f: "Tabela do fabricante do locador.", e: "Sem o número a ligação nunca fica «ok»; valor acima do real esconde uma ligação fraca." },
    capDiagKgf: { rot: "Diagonal e ligação: carga axial", un: "kgf", min: 1, max: 20000, o: "A carga ao longo da diagonal que o tubo e a ligação dela aguentam.", u: "quilograma-força (kgf)", t: "Sem fonte pública: " + NR + ". O campo aceita de 1 a 20 000 kgf.", f: "Tabela do fabricante do locador.", e: "O tubo da diagonal é verificado; a ligação fica NÃO VERIFICADA sem este número." },
    capBaseMultiKgf: { rot: "Base regulável do multidirecional: carga admissível", un: "kgf", min: 1, max: 20000, o: "A carga que a base regulável do multidirecional aguenta.", u: "quilograma-força (kgf)", t: "Sem fonte pública: " + NR + ". A tabela do tubo-roll NÃO vale para outro sistema. O campo aceita de 1 a 20 000 kgf.", f: "Tabela do fabricante do locador.", e: "Sem ela a base fica NÃO VERIFICADA; usar a tabela de outro sistema dá uma carga que não é a desta base." },
    espigaoTracaoRT: { rot: "Espigão: tração conferida pelo RT", o: "A capacidade à tração do espigão ou pino trava que une um poste ao seguinte, para o poste não se soltar.", u: "marca + justificativa de pelo menos 15 caracteres", t: "Sem fonte pública: " + NR + ".", f: "Tabela do fabricante do locador.", e: "Sem a marca a verificação do espigão fica NÃO VERIFICADA; marcar sem conferir libera um risco de poste soltar." },
    paraleloInternoRT: { rot: "Poste interno travado no plano da fachada", o: "A linha interna de postes não tem diagonal no plano dela; o RT declara o diafragma do piso ou a diagonal interna que a trava.", u: "marca + justificativa de pelo menos 15 caracteres", t: "Sem valor: " + NR + ".", f: "Memória do RT, pelo projeto do andaime.", e: "Sem a marca a flambagem do poste interno no plano da fachada fica sem liberação; marcar sem travamento real aprova um poste que flamba." },
    cunhaContinua: { rot: "Fiada de travessas contínua pela cunha", o: "Se a fileira de travessas funciona como viga contínua pela cunha (menos ancoragens) ou como articulada em cada estação.", u: "marca + justificativa de pelo menos 15 caracteres", t: "O padrão é articulada (rótula): cada estação vale pelas próprias ancoragens.", f: "Tabela da ligação do fabricante e justificativa do RT.", e: "Marcar sem a tabela da ligação reduz as ancoragens exigidas sem base: o cálculo passa e a travessa pode não aguentar." },
    espigaoRigido: { rot: "Espigão contínuo", o: "Se a emenda do poste transmite momento (contínua) em vez de funcionar como articulação.", u: "marca + justificativa de pelo menos 15 caracteres", t: "O padrão é articulado (rótula), por falta de fonte da rigidez da emenda.", f: "Rigidez da emenda informada pelo fabricante do poste e justificativa do RT.", e: "Marcar sem a rigidez do fabricante diminui o comprimento de flambagem do poste e aprova uma carga que ele não aguenta." },
    /* ---------- parâmetros do andaime */
    vaoMax: { rot: "Vão máximo", un: "m", min: 0.5, max: 3, o: "Distância entre dois montantes ao longo da fachada.", u: "metros (m)", t: "Padrão 2,00 m (painel Orguel de 2,0 m; o TG20 usa 2,4 m — fontes secundárias, o RT confirma). O motor aceita de 0,5 a 3,0 m.", f: "Ficha do fabricante ou do locador; o RT confirma.", e: "Vão maior = menos peças, mas mais carga no montante e no piso; o cálculo diz se passa.",
      multi: { min: 0.35, max: 3.5, t: "Padrão 2,50 m (adotado pela ESPEC do sistema). Cada linha só aceita vãos que são travessas dela: a roseta começa em 0,80 m e o estribo em 0,35 m; vai até 3,5 m. A carga do piso cai de 600 para 450 kgf/m² em 2,48 m (M02 p.18).", f: "Manual do fabricante (M02) e travessas da linha escolhida.", e: "Vão maior = menos peças, mas o piso admite menos carga e a ligação trabalha mais; o cálculo diz se passa." } },
    levanteMax: { rot: "Levante máximo", un: "m", min: 1, max: 3, o: "Distância vertical entre níveis (andares) do andaime.", u: "metros (m)", t: "Padrão 2,00 m (painel Orguel de 2 000 mm e TG20). O motor aceita de 1,0 a 3,0 m.", f: "Ficha do fabricante ou do locador; o RT confirma.", e: "Levante maior = menos níveis, mas montantes mais compridos entre travamentos e flambagem pior; o cálculo diz se passa.",
      multi: { passo: 0.5, t: "Padrão 2,00 m, múltiplo de 0,50 m (a roseta anda de 0,50 em 0,50 m); o manual limita o andar a 2,00 m (Anexo A item 16).", f: "Manual do fabricante (M02, Anexo A item 16).", e: "Valor que não é múltiplo de 0,50 m o motor recusa; levante maior que 2,00 m foge do manual." } },
    afastamento: { rot: "Afastamento da face", un: "m", min: 0.05, max: 0.6, o: "Distância entre a fachada e o andaime.", u: "metros (m)", t: "Padrão 0,20 m, sem fonte brasileira (o RT confirma). O motor aceita de 0,05 a 0,60 m.", f: "Medida da obra; o RT confirma.", e: "Afastamento grande abre vão entre a fachada e o piso (risco de queda) e alonga as ancoragens; pequeno demais não deixa passar a fachada.",
      multi: { t: "Padrão 0,15 m (M02 p.15); o vão entre a fachada e o piso tem de ficar abaixo de 0,20 m (Anexo A item 8). O motor aceita de 0,05 a 0,60 m.", f: "Manual do fabricante (M02 p.15 e Anexo A item 8).", e: "Acima de 0,20 m entre a fachada e o piso há risco de queda e o item do checklist do manual reprova." } },
    nPranchas: { rot: "Pranchões na largura", un: "", min: 1, max: 10, o: "Quantos pranchões lado a lado formam a largura do piso (cada um de madeira 0,30 m; o piso metálico tem 0,37 m).", u: "unidades", t: "Padrão 4 pranchões. O motor aceita de 1 a 10; a largura final precisa de pelo menos 0,60 m (NBR 6494 4.5.6).", f: "Largura de trabalho que você precisa e o piso do locador.", e: "Poucos pranchões deixam a plataforma estreita (menos de 0,60 m o motor recusa); muitos aumentam a carga nas travessas." },
    largura: { rot: "Largura forçada", un: "m", min: 0.3, max: 3, zeroOk: true, o: "Largura da plataforma digitada à mão; 0 deixa a largura sair do número de pranchões.", u: "metros (m)", t: "0 (pelos pranchões). O motor aceita de 0,30 a 3,00 m, e a plataforma precisa de pelo menos 0,60 m (NBR 6494 4.5.6).", f: "Largura de trabalho que você precisa.", e: "Largura abaixo de 0,60 m o motor recusa; largura grande demais sobrecarrega as transversais." },
    hVarredor: { rot: "Travessa de base acima da base", un: "m", min: 0.05, max: 0.5, o: "Altura da primeira travessa (varredor) acima da placa da base.", u: "metros (m)", t: "Padrão 0,15 m: a 1ª travessa o mais perto possível do pé do montante (HSA 3.2.3); a distância exata não tem fonte. O motor aceita de 0,05 a 0,50 m.", f: "Manual do locador; o RT confirma.", e: "Travessa alta demais deixa o pé do montante solto e piora a flambagem do primeiro trecho." },
    pisos: { rot: "Pisos de trabalho", o: "Em quais níveis há piso de trabalho: só no topo, em todos os níveis ou em alturas escolhidas (2,0; 4,0).", u: "topo, todos ou lista de alturas (m)", t: "Padrão: só o topo. Entre dois pisos forrados a altura livre é de pelo menos 1,75 m (NBR 6494 4.5.6).", f: "Do serviço: onde as pessoas vão trabalhar.", e: "Piso a menos de 1,75 m do outro o motor recusa; piso em todos os níveis aumenta a carga nos montantes.",
      multi: { t: "Padrão: todos os níveis (o manual manda instalar as plataformas em todos os níveis, M02 §8.3). «Só o piso de cima» é permitido.", f: "Manual do fabricante (M02 §8.3).", e: "Tirar pisos de níveis intermediários foge do que o manual manda; a altura livre entre pisos forrados continua de pelo menos 1,75 m." } },
    piso: { rot: "Tipo de piso", o: "Material da plataforma: prancha de madeira ou piso metálico com gancho.", u: "—", t: "Padrão: madeira (prancha 0,24 × 0,045 m); metálico com gancho de 0,37 m.", f: "O que o locador fornece.", e: "Piso diferente do real muda largura, peso e a verificação do piso." },
    guarda: { rot: "Guarda-corpo: travessão superior", un: "m", min: 1.2, o: "Altura do travessão superior do guarda-corpo acima do piso.", u: "metros (m)", t: "Padrão 1,20 m (NR-18 18.9.4.2 a). O motor recusa abaixo de 1,20 m.", f: "NR-18 18.9.4.2 a).", e: "Abaixo de 1,20 m o motor recusa; guarda-corpo baixo é risco de queda." },
    intermediaria: { rot: "Travessão intermediário", un: "m", min: 0.45, max: 0.8, o: "Altura do travessão do meio do guarda-corpo.", u: "metros (m)", t: "Padrão 0,70 m (NR-18 18.9.4.2 b); o motor aceita de 0,45 a 0,80 m.", f: "NR-18 18.9.4.2 b).", e: "Fora de 0,45 a 0,80 m o motor recusa; vão grande entre travessões deixa passar o corpo." },
    rodape: { rot: "Rodapé: altura", un: "m", min: 0.15, max: 0.6, o: "Altura do rodapé rente ao piso, que impede a queda de objetos e o escorregão do pé.", u: "metros (m)", t: "Padrão 0,20 m; mínimo de 0,15 m (NR-18 18.9.4.2 c). O motor aceita até 0,60 m.", f: "NR-18 18.9.4.2 c).", e: "Abaixo de 0,15 m o motor recusa; rodapé baixo deixa cair ferramenta e material." },
    rodapeEsp: { rot: "Rodapé: espessura", un: "m", min: 0.01, max: 0.06, o: "Espessura da tábua do rodapé.", u: "metros (m)", t: "Padrão 0,025 m (tábua de 1 polegada, decisão RA de 27/10/2026, sem fonte de norma; o rodapé não é peça calculada).", f: "Decisão do projeto; o RT confirma.", e: "O motor aceita de 0,01 a 0,06 m; espessura errada só muda o peso e o desenho do rodapé." },
    guardaInterno: { rot: "Guarda-corpo na linha interna", o: "Se há guarda-corpo também no lado da fachada, e não só no lado de fora.", u: "marca", t: "Padrão: desligado.", f: "Decisão do projeto, conforme o vão entre a fachada e o piso.", e: "Desligado com vão grande até a fachada deixa a borda interna sem proteção." },
    tela: { rot: "Tela de proteção", o: "Tela na face externa, da 1ª plataforma até 2,00 m acima da última (NR-18 18.12.15).", u: "marca", t: "Padrão: ligada.", f: "NR-18 18.12.15.", e: "Tirar a tela some com a proteção contra queda de material e com a força do vento sobre ela; ligar a tela aumenta a carga de vento nas ancoragens." },
    tubo: { rot: "Tubo", o: "O perfil de tubo usado nos montantes e travessas.", u: "—", t: "Padrão HSS 48,3 × 3,0 mm. A NBR 6494 (4.5.5) pede parede de pelo menos 2,65 mm e Ø de pelo menos 42,2 mm.", f: "Ficha do tubo do locador.", e: "Tubo mais fino que o mínimo o motor recusa; tubo diferente do real muda toda a resistência calculada." },
    barras: { rot: "Comprimentos comerciais dos tubos", un: "m", o: "Os comprimentos de tubo que o locador tem para alugar; o gerador usa os maiores primeiro para ter menos emendas.", u: "metros (m)", t: "Padrão: de 6,00 a 0,50 m de 0,25 em 0,25 m.", f: "Estoque do locador.", e: "Lista diferente do estoque gera uma lista de peças que o locador não tem; é preciso pelo menos um comprimento." },
    diagCada: { rot: "Diagonal a cada N vãos", un: "", min: 1, o: "De quantos em quantos vãos entra uma prumada de diagonais de contraventamento.", u: "vãos (número inteiro)", t: "Padrão 5, sem fonte brasileira (o RT confirma). Aceita 1 em diante.", f: "O RT confirma.", e: "Diagonais demais encarecem; de menos deixam o andaime frouxo para o vento lateral e para a força nocional.",
      multi: { t: "Padrão 5: no mínimo um conjunto de diagonais em torre a cada 5 módulos (M02 p.10 e p.20). Aceita 1 em diante.", f: "Manual do fabricante (M02 p.10 e p.20).", e: "Mais que 5 módulos sem torre de diagonais foge do manual e o andaime fica frouxo." } },
    diagTransv: { rot: "Diagonal transversal", o: "Se as diagonais também travam o andaime na direção da largura (no sentido da fachada para fora).", u: "marca", t: "Padrão: ligada.", f: "Decisão do projeto; o RT confirma.", e: "Desligada, o andaime depende só dos pórticos para não deformar na largura." },
    ancoragem: { rot: "Ancoragem", o: "Como o andaime é preso à fachada ou à estrutura: por tubo de amarração com olhal, ou nenhuma.", u: "—", t: "Padrão: por tubo. Sem ancoragem só passa se a altura for no máximo 4 vezes a menor base (NR-18 18.12.3).", f: "NR-18 18.12.3 e o projeto do andaime.", e: "Sem ancoragem o vento tomba o andaime acima de 4 vezes a base; o cálculo e o motor recusam.",
      multi: { t: "Automática (gancho ou tubo, conforme o afastamento). Sem ancoragem só passa em anel fechado ou torre que atende o 4× (NR-18 18.12.3).", f: "NR-18 18.12.3 e o manual do fabricante." } },
    ancH: { rot: "Ancoragem: espaçamento horizontal", un: "m", gt0: true, max: 6, o: "Distância entre pontos de ancoragem ao longo da fachada.", u: "metros (m)", t: "Padrão 6,00 m; no máximo 6,00 m (NBR 6494 4.5.2, exemplar não licenciado — conferir). O RT define o valor para a obra.", f: "NBR 6494:1990 4.5.2 e o projeto do andaime.", e: "Acima de 6,00 m, ou com área por ancoragem acima de 36 m², o motor recusa; espaçamento grande demais sobrecarrega cada ponto." },
    ancV: { rot: "Ancoragem: espaçamento vertical", un: "m", gt0: true, max: 6, o: "Distância entre pontos de ancoragem na altura.", u: "metros (m)", t: "Padrão 4,00 m; no máximo 6,00 m (NBR 6494 4.5.2). O RT define o valor para a obra.", f: "NBR 6494:1990 4.5.2 e o projeto do andaime.", e: "Acima de 6,00 m, ou com área por ancoragem acima de 36 m², o motor recusa; espaçamento grande demais sobrecarrega cada ponto." },
    base: { rot: "Base", o: "O apoio do montante no chão: regulável (rosca para nivelar), fixa ou rodízio com trava.", u: "—", t: "Padrão: regulável 120 × 120. Sobre rodízios a altura do piso fica no máximo 4 vezes a menor dimensão da base (NBR 6494 4.5.12).", f: "O que o locador fornece.", e: "Base errada muda a carga admissível do apoio e a estabilidade; o rodízio acima de 4× a base o motor recusa.",
      multi: { t: "Regulável (rosca até 0,25 m) ou articulada (piso inclinado); a linha não tem base fixa nem rodízio no catálogo. Piso inclinado exige base articulada travada (M02 §8.1.1).", f: "Manual do fabricante (M02 Anexo A item 15 e §8.1.1).", e: "Base regulável em piso inclinado desliza; a rosca acima de 0,25 m foge do manual." } },
    roscaBase: { rot: "Rosca exposta da base", un: "m", min: 0, max: 0.4, o: "Quanto da rosca da base regulável fica aparecendo para nivelar.", u: "metros (m)", t: "Padrão 0,10 m (decisão do projeto, o RT confirma). O motor aceita de 0 a 0,40 m.", f: "Apostila R1 (tabela de carga da base de 8 a 40 cm) e o RT.", e: "Quanto mais rosca aparecendo, menos carga a base aguenta; o cálculo da base mostra o limite." },
    calco: { rot: "Calço de madeira sob a base", o: "Um pedaço de pranchão sob a placa da base, para espalhar a carga no solo e não deixar deslizar.", u: "marca", t: "Padrão: ligado. O HSA 3.3.1 pede calço com ≥ 35 mm de espessura, ≥ 220 mm de largura e ≥ 1 000 cm² de área em solo.", f: "HSA 3.3.1 (fonte secundária) e o RT.", e: "Sem calço a pressão no solo sobe e o apoio pode afundar.",
      multi: { t: "Padrão: ligado.", f: "Manual do fabricante (M02 §8.1.1) e o RT.", e: "Sem calço a pressão no solo sobe e a base pode deslizar." } },
    acesso: { rot: "Acesso", o: "Como as pessoas sobem ao piso: escada de mão por lance, torre de escada, escada marinheiro ou nenhum.", u: "—", t: "Padrão: automático (escada de mão por lance quando o piso passa de 1,00 m). Sem acesso só com piso até 1,00 m (NR-18 18.12.14).", f: "NR-18 18.12.14 e 18.8.6.", e: "Sem acesso e com piso acima de 1,00 m o motor recusa; escada mal posicionada atrapalha o trabalho no piso.",
      multi: { t: "Padrão: alçapão com escada incorporada (M02 §8.3.1); escada externa ou nenhum (só com piso até 1,00 m, NR-18 18.12.14).", f: "Manual do fabricante (M02 §8.3.1) e NR-18 18.12.14." } },
    acessoPos: { rot: "Posição do acesso", un: "", min: 0, max: 1, o: "Onde ficam as escadas ao longo do caminho: 0 é no primeiro vão e 1 no último.", u: "de 0 a 1", t: "Padrão 0 (automático: primeiro vão da cabeceira).", f: "Decisão do projeto, conforme por onde as pessoas entram.", e: "Fora de 0 a 1 o motor recusa; escada longe de quem usa vira percurso longo sobre o piso." },
    nr34Montantes: { rot: "Sem tubo de 4,50 a 6,00 m como montante", o: "Evita tubos muito compridos como montante a partir do 2º lance (NR-34.11.11, naval — referência).", u: "marca", t: "Padrão: desligado; só para obra naval.", f: "NR-34.11.11 (referência).", e: "Ligado em obra comum limita os tubos usados sem necessidade." },
    conexoes3d: { rot: "Desenhar as braçadeiras no 3D", o: "Se as braçadeiras aparecem como peças no desenho 3D.", u: "marca", t: "Padrão: ligado.", f: "Preferência de visualização.", e: "Não muda o cálculo; desligado o desenho fica mais leve, mas a vistoria visual perde as conexões." },
    linha: { rot: "Linha do multidirecional", o: "Qual linha do multidirecional: roseta (travessa com cunha na roseta) ou estribo.", u: "—", t: "Padrão: roseta.", f: "O que o locador fornece.", e: "Cada linha tem as próprias travessas, pisos e diagonais; trocar de linha refaz o andaime com as peças dela." },
    larguraModulo: { rot: "Largura do módulo", un: "m", o: "A largura do andaime: é o comprimento de uma travessa da linha escolhida.", u: "metros (m)", t: "Roseta: 0,80 (padrão) · 1,14 · 1,64 · 2,14 · 2,48 · 3,14 m. Estribo: 0,35 · 0,50 · 0,70 · 1,00 (padrão) · 1,50 · 2,00 · 2,50 · 3,00 m.", f: "Catálogo da linha (M01 e M02).", e: "A largura precisa ser uma travessa da linha e o piso de 0,32 m cobre o módulo; a largura útil do piso precisa de pelo menos 0,60 m (NBR 6494 4.5.6)." },
    offPiso: { rot: "Nível do estrado em relação ao nó", un: "m", min: -0.2, max: 0, o: "Quanto o estrado fica abaixo do nó da roseta em que a travessa encaixa.", u: "metros (m), negativo é abaixo", t: "Padrão 0: o estrado encaixa na travessa no nível da roseta. O motor aceita de −0,20 a 0,00 m.", f: "Manual do fabricante e NR-18 18.12.15.2 (guarda-corpo de 1,00 a 1,20 m acima do estrado).", e: "Fora de −0,20 a 0,00 m o travessão superior sai fora de 1,00 a 1,20 m acima do estrado e o motor recusa." },
    regulagemMax: { rot: "Regulagem máxima da base", un: "m", gt0: true, max: 0.25, o: "O máximo de rosca que a base regulável pode abrir.", u: "metros (m)", t: "Padrão e máximo 0,25 m (fabricante, M02 p.10 e checklist item 15). O motor nunca passa dele.", f: "Manual do fabricante (M02 p.10).", e: "Acima de 0,25 m o motor recusa; rosca aberta demais enfraquece a base." },
    posteGuarda: { rot: "Poste de guarda-corpo no meio do vão", o: "Um tubo vertical extra no meio de cada vão, só para segurar o guarda-corpo.", u: "marca", t: "Padrão: desligado; o cálculo propõe ligar quando o montante não aguenta o guarda-corpo.", f: "Proposta do cálculo (aba Cálculo).", e: "Liga mais peças; o cálculo mostra se resolve." },
    travaTopo: { rot: "Travamento no topo da tela", o: "Travessa longitudinal e transversal no topo da tela, para o trecho acima do último nó não balançar.", u: "marca", t: "Padrão: ligado.", f: "Proposta do cálculo (aba Cálculo).", e: "Desligado, o montante do topo recebe o vento da tela sem travamento." },
    ancTopo: { rot: "Ancoragem no topo da tela", o: "Ancoragem no topo, na altura da tela.", u: "marca", t: "Padrão: ligado.", f: "Proposta do cálculo (aba Cálculo).", e: "Desligada, o trecho do topo fica sem prender na fachada." },
    /* ---------- responsável técnico e obra (carimbo das pranchas e memorial) */
    empresa: { rot: "Empresa", o: "Empresa responsável pelo projeto do andaime; vai para o carimbo das pranchas e para o memorial.", u: "texto", t: "Campo vazio usa o cadastro da empresa; nunca é inventado.", f: "Cadastro da empresa do usuário.", e: "Em branco, o carimbo mostra o campo vazio (placeholder vermelho nos documentos)." },
    responsavel: { rot: "Responsável técnico (nome)", o: "Nome do engenheiro ou profissional que assina o projeto do andaime.", u: "texto", t: "Campo vazio usa o cadastro da empresa; nunca é inventado.", f: "Cadastro da empresa ou a ART.", e: "Em branco, as pranchas e o memorial saem sem assinante e o aviso de RT em branco aparece." },
    tituloProfissional: { rot: "Título profissional", o: "Como o responsável técnico se identifica (Eng. Civil, Eng. Mecânico…).", u: "texto", t: "Campo vazio usa o cadastro da empresa.", f: "Carteira do CREA/CAU.", e: "Título errado no carimbo pode invalidar o documento perante a fiscalização." },
    registro: { rot: "Registro CREA/CAU", o: "Número do registro do responsável técnico no conselho.", u: "texto", t: "Campo vazio usa o registro da aprovação do projeto ou o cadastro da empresa; nunca é inventado.", f: "Carteira do CREA/CAU.", e: "Em branco ou errado, o carimbo e a ART não batem e o documento perde valor." },
    art: { rot: "ART nº", o: "Número da Anotação de Responsabilidade Técnica do projeto do andaime (NR-18 18.12.2).", u: "texto", t: "Campo vazio usa a ART da aprovação; nunca é inventado. Pode ser «dispensada — motivo».", f: "A ART emitida no CREA/CAU.", e: "Sem ART o projeto não tem responsável registrado; número errado no carimbo atrapalha uma fiscalização." },
    proprietario: { rot: "Contratante / Proprietário", o: "Quem contratou o serviço ou é dono da obra.", u: "texto", t: "Sem valor fixo.", f: "Contrato da obra.", e: "Erro aqui só aparece no carimbo, mas pode confundir a que obra o documento pertence." },
    obra: { rot: "Obra", o: "Nome da obra, como aparece no carimbo das pranchas e no memorial.", u: "texto", t: "Sem valor fixo.", f: "Contrato ou cadastro da obra.", e: "Erro aqui só aparece no carimbo, mas pode confundir a que obra o documento pertence." },
    local: { rot: "Local", o: "Endereço ou setor da obra onde o andaime fica.", u: "texto", t: "Sem valor fixo.", f: "Endereço da obra.", e: "Local errado dificulta achar o andaime na inspeção." },
    andaime: { rot: "Código do andaime", o: "O código que identifica este andaime na obra (aparece nas pranchas e no cartão).", u: "texto", t: "Sem valor fixo; em branco o documento usa «ANDAIME».", f: "Controle da obra.", e: "Códigos repetidos entre andaimes confundem a inspeção e o cartão." },
    revisao: { rot: "Revisão", o: "O número ou letra da revisão do projeto.", u: "texto", t: "Sem valor fixo.", f: "Controle de documentos da obra.", e: "Revisão errada pode levar a obra a montar pela versão antiga." },
    data: { rot: "Data", o: "A data do projeto que vai no carimbo.", u: "data", t: "Sem valor fixo.", f: "Data da emissão.", e: "Data errada no carimbo confunde qual versão vale." },
    reserva: { rot: "Reserva (% a mais)", un: "%", min: 0, max: 100, o: "Quantos por cento de peças a mais o locador deve levar além do necessário, para quebra e troca.", u: "porcentagem (%)", t: "0 % é só o necessário. A reserva é decisão do RT ou do locador; o campo aceita de 0 a 100.", f: "Decisão do RT ou do locador.", e: "Reserva a menos pode faltar peça na montagem; a mais encarece a locação." },
    quem: { rot: "Quem está fazendo isto", o: "O nome de quem responde, assina ou aprova no momento; fica gravado no histórico.", u: "texto", t: "Seu nome.", f: "Você.", e: "Sem o nome, a ação não é gravada com responsável." }
  };

  /* ================================================================ (b) VERIFICAÇÕES
   * o = o que é, em linguagem simples. dados = campos do RT que, se faltarem, deixam a verificação NÃO VERIFICADA (por sistema; `multi` só quando difere).
   * semCampo = dado que não tem campo na tela (o RT informa por fora). */
  var VERIF = {
    transversal: { o: "A travessa que atravessa a largura do andaime e segura os pranchões: ela dobra com o peso do piso e de quem trabalha, e não pode envergar demais." },
    travessa: { o: "A travessa ao longo da fachada, que amarra os montantes e sustenta o piso: ela dobra com o peso e a flecha é limitada a 1/200 do vão." },
    prancha: { o: "O pranchão do piso entre duas travessas: precisa aguentar o peso das pessoas sem dobrar demais (flecha limitada a 1/200 do vão)." },
    prancha_pontual: { o: "O pranchão sob uma carga concentrada: uma pessoa com material parada num ponto só, sem dividir o peso pelo piso." },
    montante: { o: "O montante é o tubo vertical de baixo: carrega o peso dos pisos, das pessoas e o vento na tela, e pode flambar (curvar de lado) se for comprido.", dados: ["V0"] },
    contencao: { o: "Os nós do montante precisam de travamento lateral (as travessas) que aguente a força de contenção, para o montante não flambar." },
    guarda_travessao: { o: "O travessão de cima do guarda-corpo: a NR-18 pede que aguente 90 kgf por metro sem envergar mais que 76 mm." },
    guarda_interm: { o: "O travessão do meio do guarda-corpo: precisa aguentar 66 kgf por metro." },
    guarda_pontual: { o: "Uma pessoa se apoiando no topo do guarda-corpo: carga pontual de 350 N." },
    guarda_altura: { o: "As alturas do guarda-corpo acima do estrado: travessão de 1,00 a 1,20 m e o do meio a 0,50 m (NR-18 18.12.15.2)." },
    montante_topo: { o: "O pedaço de montante acima do último nó, que segura a tela e o guarda-corpo e recebe o vento sem travamento em cima.", dados: ["V0"] },
    montante_guarda: { o: "O montante funcionando como poste do guarda-corpo: precisa aguentar a carga de 90 kgf por metro da NR-18 empurrando de lado." },
    poste_guarda: { o: "O poste extra de guarda-corpo no meio do vão: o tubo, a braçadeira e o travessão do meio sob a carga da NR-18." },
    abracadeira: { o: "A braçadeira fixa que prende a travessa no montante: não pode deslizar com a carga da travessa." },
    giratoria: { o: "A braçadeira giratória das diagonais, sob uma pequena força horizontal de segurança (força nocional) para o andaime não deformar." },
    vento_paralelo: { o: "O vento que bate de lado, paralelo à fachada (atrito na tela e cabeceiras sobre as diagonais): o sistema não calcula, o RT confere por escrito.", dados: ["ventoParaleloRT"] },
    base: { o: "A base regulável: quanto de carga ela aguenta conforme a rosca que fica aparecendo (mais rosca, menos carga)." },
    calco: { o: "O calço de madeira sob a placa da base: não pode esmagar com a carga do montante." },
    apoio: { o: "O chão: a pressão sob o calço (ou a placa) dividida pelo que o solo ou a laje aguenta.", dados: ["sigmaSolo"] },
    long_horizontal: { o: "A barra longitudinal dobrando de lado pelo vento, entre os pontos de ancoragem.", dados: ["V0"] },
    ancoragem: { o: "Cada ponto que prende o andaime na fachada recebe uma parte da força do vento e não pode arrancar.", dados: ["V0"] },
    estab_nr18: { o: "Sem ancoragem, a altura do piso não passa de 4 vezes a menor dimensão da base (NR-18 18.12.3)." },
    tombamento: { o: "Sem ancoragem, o vento não pode tombar o andaime: o peso próprio precisa segurar o momento do vento." },
    multidirecional: { o: "Verificação provisória do multidirecional (cálculo em preparação): nada é aprovado até o cálculo próprio rodar." },
    piso_multi: { o: "O piso metálico: carga admissível do fabricante para o comprimento (vão) escolhido." },
    alcapao_multi: { o: "O piso com alçapão e escada: a carga admissível dele, que o fabricante informa.", semCampo: "A carga admissível do alçapão não tem campo na tela: o locador informa e o RT registra no projeto." },
    transversal_multi: { o: "A travessa transversal que recebe os pisos: dobra com o peso e a flecha não pode passar do limite." },
    no_cunha: { o: "A ligação da travessa na roseta (cunha): a cunha precisa segurar a carga vertical de cada ponta da travessa.", dados: ["capNoKgf"] },
    poste_multi: { o: "O poste do multidirecional: carrega os pisos, as pessoas e o vento, e pode flambar (curvar de lado) se for comprido.", dados: ["V0", "paraleloInternoRT"] },
    guarda_poste: { o: "O poste sob a carga do guarda-corpo: a NR-18 pede 90 kgf por metro empurrando de lado." },
    diagonal_multi: { o: "A diagonal que trava o andaime: o tubo e a ligação dela sob a força horizontal de segurança e a compressão.", dados: ["capDiagKgf"] },
    espigao: { o: "O espigão (pino que une um poste ao seguinte): não pode soltar quando o vento levanta o andaime.", dados: ["espigaoTracaoRT"] },
    travessa_long_multi: { o: "A travessa longitudinal: dobra com o peso próprio e com o vento de lado entre as estações ancoradas, e a ligação trabalha ao longo da barra.", dados: ["capLigAxialKgf"] },
    elo_transversal: { o: "O elo transversal leva o vento do poste de fora até a ancoragem: o tubo e a ligação dele sob força ao longo da barra.", dados: ["capLigAxialKgf"] },
    base_multi: { o: "A base regulável do multidirecional: rosca de até 0,25 m e carga admissível do fabricante.", dados: ["capBaseMultiKgf"] }
  };

  /* ================================================================ (c) RÓTULOS E FRASES DO DIAGNÓSTICO */
  var TXT = {
    oQueE: "O que é", porque: "Por que não passou", porqueAtencao: "Por que está em atenção", conjunto: "Esta opção aplica o conjunto do Montar inteligente: todas as mudanças da lista, juntas, de uma vez.", falta: "O que falta", comoResolver: "Como resolver", opcao: "Opção", recomendada: "recomendada", oQueMuda: "O que muda", resultadoPrevisto: "Resultado previsto",
    corrigir: "Corrigir", desfazer: "Desfazer", mostrar3d: "Mostrar no 3D", recalcular: "Recalcular", corrigirTudo: "Corrigir tudo", aplicar: "Aplicar", cancelar: "Cancelar",
    soRT: "Só o RT resolve", semOpcao: "O sistema não tem uma mudança automática que resolva esta: é decisão do RT.",
    faixaTitulo: "problemas encontrados", faixaZero: "Nenhum problema: tudo passa e nada falta.",
    deseja: "Deseja corrigir? Vai mudar", nadaMudar: "O gerador não encontrou o que mudar sozinho.", mesmoCorrigindo: "Mesmo corrigindo, falta",
    memorialTitulo: "Memorial de cálculo", memorialAviso: "O PDF do memorial e as pranchas saem com este cálculo.", memorialRecalcular: "Recalcular tudo", memorialAbrir: "Abrir a linha para ver a explicação e corrigir.",
    dadoInline: "Informe o dado aqui", confirmoRT: "Confirmo como RT", justificativa: "Justificativa do RT (mín. 15 caracteres)", ondeConseguir: "Onde conseguir", semDado: "O que acontece sem ele",
    cabSolicitante: "Solicitante", cabResistente: "Resistente", cabUso: "Uso", cabEstado: "Estado", cabVerificacao: "Verificação"
  };

  /* ================================================================ funções */
  function campo(id, sis) {
    var c = CAMPOS[id]; if (!c) return null;
    if (!ehMulti(sis) || !c.multi) return c;
    var o = {}; Object.keys(c).forEach(function (k) { if (k !== "multi") o[k] = c[k]; }); Object.keys(c.multi).forEach(function (k) { o[k] = c.multi[k]; });
    return o;
  }
  var ITENS = [["o", "O que é"], ["u", "Unidade"], ["t", "Valor típico"], ["f", "De onde vem"], ["e", "Se errar"]];
  function itensCampo(id, sis) { var c = campo(id, sis); return c ? ITENS.map(function (x) { return { k: x[0], rot: x[1], txt: c[x[0]] }; }) : []; }
  function tooltip(id, sis) { var c = campo(id, sis); if (!c) return ""; return c.rot + "\n" + ITENS.map(function (x) { return x[1] + ": " + c[x[0]]; }).join("\n"); }
  /* o ⓘ com tooltip (title) — acessível por foco; data-aj é a chave que o teste usa para provar que o campo tem ajuda na tela */
  function icone(id, sis) { var c = campo(id, sis); if (!c) return ""; return '<span class="andui-i" data-aj="' + esc(id) + '" tabindex="0" role="note" aria-label="Ajuda: ' + esc(c.rot) + '" title="' + esc(tooltip(id, sis)) + '">ⓘ</span>'; }
  /* a linha curta sob o rótulo: o que é · unidade · típico · de onde vem · se errar */
  function linhaHtml(id, sis) {
    var c = campo(id, sis); if (!c) return "";
    return '<small class="andui-aj" data-aj-linha="' + esc(id) + '">' + ITENS.map(function (x) { return "<b>" + esc(x[1]) + ":</b> " + esc(c[x[0]]); }).join(" · ") + "</small>";
  }
  function numDe(v) { if (typeof v === "number") return v; var s = String(v == null ? "" : v).trim().replace(",", "."); if (s === "") return NaN; var n = Number(s); return isFinite(n) ? n : NaN; }
  /* aviso amigável no campo: fora da faixa que o motor recusa (nunca apaga o valor). "" = nada a dizer. */
  function validar(id, valor, sis) {
    var c = campo(id, sis); if (!c) return "";
    var s = String(valor == null ? "" : valor).trim(); if (s === "") return "";
    if (c.min == null && c.max == null && !c.gt0) return "";
    var n = numDe(valor); if (!isFinite(n)) return c.rot + ": digite um número (ex.: 1,5).";
    if (c.zeroOk && n === 0) return "";
    var un = c.un ? " " + c.un : "", faixa;
    if (c.gt0 && n <= 0) return c.rot + ": use um valor maior que zero. " + c.e;
    if (c.min != null && n < c.min - 1e-9) { faixa = c.max != null ? "de " + brf(c.min, 2) + " a " + brf(c.max, 2) + un : "pelo menos " + brf(c.min, 2) + un; return c.rot + ": " + brf(n, 2) + un + " está fora do que o sistema aceita (" + faixa + "). " + c.e; }
    if (c.max != null && n > c.max + 1e-9) { faixa = c.min != null ? "de " + brf(c.min, 2) + " a " + brf(c.max, 2) + un : "no máximo " + brf(c.max, 2) + un; return c.rot + ": " + brf(n, 2) + un + " está fora do que o sistema aceita (" + faixa + "). " + c.e; }
    if (c.passo && Math.abs(n / c.passo - Math.round(n / c.passo)) > 1e-6) return c.rot + ": use múltiplo de " + brf(c.passo, 2) + " m (a roseta anda de " + brf(c.passo, 2) + " em " + brf(c.passo, 2) + " m).";
    return "";
  }

  function verificacao(id) { return VERIF[id] || null; }
  function explicacao(id) { var v = VERIF[id]; return v ? v.o : ""; }
  function dadosDe(id, sis) { var v = VERIF[id]; if (!v) return []; return arr(ehMulti(sis) && v.multi ? v.multi : v.dados).slice(); }
  function semCampoDe(id) { var v = VERIF[id]; return v && v.semCampo ? v.semCampo : ""; }

  /* valor de um parâmetro em texto simples: número com unidade curta, sim/não, ou o próprio texto */
  function valorTxt(campoId, v) {
    var c = CAMPOS[campoId];
    if (v === true) return "ligado"; if (v === false) return "desligado";
    if (v === undefined || v === null || v === "") return "(padrão)";
    if (typeof v === "number") return brf(v, Math.abs(v) < 0.1 && v !== 0 ? 3 : 2) + (c && c.un ? " " + c.un : "");
    return String(v);
  }
  function rotuloCampo(campoId) { var c = CAMPOS[campoId]; return c ? c.rot : campoId; }
  /* «Vão máximo: de 2,00 m para 1,50 m» */
  function descreverMudanca(m) { return rotuloCampo(m.campo) + ": de " + valorTxt(m.campo, m.de) + " para " + valorTxt(m.campo, m.para); }

  /* A CAUSA em linguagem simples, COM os números do cálculo. faltam = rótulos dos dados que o RT ainda não informou. */
  function causa(v, faltam) {
    if (!v) return "";
    var sol = String(v.solicitante || "").trim(), res = String(v.resistente || "").trim(), temNum = sol && sol !== "—" && res && res !== "—";
    var uso = v.uso == null ? null : v.uso, usoTxt = uso == null ? "—" : (uso >= 99 ? "acima de 99" : brf(uso, 2));
    if (v.estado === "falha") {
      var pct = uso == null ? null : Math.round((uso - 1) * 100);
      var t = temNum ? "O cálculo mostra " + sol + "; o limite é " + res + ". " : (v.texto ? v.texto + " " : "");
      return t + "Uso " + usoTxt + " (solicitante ÷ resistente; 1,00 é o limite)" + (pct != null && uso < 99 ? " — " + pct + " % acima do limite." : (uso != null ? " — muito acima do limite." : "."));
    }
    if (v.estado === "atencao") {
      if (uso != null && uso > 0.9 && uso <= 1) return "Passa, mas com menos de 10 % de folga: uso " + usoTxt + " (sobram " + Math.round((1 - uso) * 100) + " %)." + (temNum ? " " + sol + " contra " + res + "." : "");
      return "Passa com ressalva: " + (arr(v.ressalvas)[0] || v.texto || "veja o cálculo") + (uso != null ? " (uso " + usoTxt + ")" : "");
    }
    if (v.estado === "nao_verificado") {
      var fl = arr(faltam);
      if (fl.length) return "Falta o dado: " + fl.map(function (x) { return String(x).replace(/[.s]+$/, ""); }).join("; ") + ". Sem ele o sistema não verifica e não libera.";
      return (arr(v.ressalvas)[0] || v.texto || "Dado que o sistema não tem.") + " Sem o dado o sistema não verifica e não libera.";
    }
    return v.texto || "";
  }


  /* frases montadas com números do cálculo (o cartão, o aviso de «Corrigido» e o efeito de um dado novo) */
  function usoTxt(u) { return u == null ? "—" : (u >= 99 ? "acima de 99" : brf(u, 2)); }
  var ROT_ESTADO = { ok: "passa", atencao: "atenção", falha: "NÃO passa", nao_verificado: "não verificado" };
  function textoPrevisto(p) {
    if (!p) return "";
    var t = "esta verificação " + (p.estado === "ok" ? "passa" : (p.estado === "atencao" ? "fica em atenção" : (p.estado === "falha" ? "continua sem passar" : "continua sem verificação"))) + (p.uso != null ? " (uso " + usoTxt(p.uso) + ")" : "") + ".";
    t += p.passaTudo ? " O andaime passa em todas as verificações que têm dado." : (p.falhasDepois ? " Ainda ficam " + p.falhasDepois + " verificação(ões) sem passar." : "");
    if (arr(p.novasFalhas).length) t += " Cuidado: passa a falhar também " + p.novasFalhas.join("; ") + ".";
    return t;
  }
  function textoCorrigido(titulo, antes, depois, estadoDepois) { return "Corrigido — " + titulo + ": uso " + usoTxt(antes) + " → " + usoTxt(depois) + (estadoDepois ? " (" + (ROT_ESTADO[estadoDepois] || estadoDepois) + ")" : "") + "."; }
  function textoEfeito(titulo, estAntes, estDepois, usoDepois) {
    return titulo + ": " + (ROT_ESTADO[estAntes] || estAntes) + " → " + (ROT_ESTADO[estDepois] || estDepois) + (usoDepois != null ? " (uso " + usoTxt(usoDepois) + ")" : "") + (estAntes === estDepois ? ". O estado não mudou: ainda falta algo." : ".");
  }

  var AndaimeAjuda = {
    CAMPOS: CAMPOS, VERIF: VERIF, TXT: TXT, ITENS: ITENS, NR: NR,
    campo: campo, itensCampo: itensCampo, tooltip: tooltip, icone: icone, linhaHtml: linhaHtml, validar: validar, rotuloCampo: rotuloCampo, valorTxt: valorTxt, descreverMudanca: descreverMudanca,
    usoTxt: usoTxt, textoPrevisto: textoPrevisto, textoCorrigido: textoCorrigido, textoEfeito: textoEfeito, ROT_ESTADO: ROT_ESTADO,
    verificacao: verificacao, explicacao: explicacao, dadosDe: dadosDe, semCampoDe: semCampoDe, causa: causa,
    ids: function () { return Object.keys(CAMPOS); }, idsVerificacao: function () { return Object.keys(VERIF); },
    txt: function (k) { return TXT[k] == null ? k : TXT[k]; }
  };
  global.AndaimeAjuda = AndaimeAjuda;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimeAjuda;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
