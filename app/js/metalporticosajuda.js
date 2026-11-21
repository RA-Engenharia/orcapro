/* =====================================================================
 * metalporticosajuda.js — AJUDA POR CAMPO da tela "Pórticos industriais"
 * (21/11/2026). Ao focar ou clicar num campo, o painel da direita troca o
 * resumo por um CARTÃO: o nome do campo, o que significa em linguagem simples
 * (para um cliente leigo), um valor típico no Brasil e o efeito no peso e no
 * custo, com um desenho do galpão e a parte do campo em destaque.
 *
 *   MetalPorticosAjuda.AJUDA_CAMPOS   os textos (dados, separados da fiação da tela);
 *   MetalPorticosAjuda.svg(destaques) o desenho (SVG feito aqui, sem imagem externa);
 *   MetalPorticosAjuda.cartao(id, { rotulo, valor }) → HTML do cartão (com "Voltar ao resumo");
 *   MetalPorticosAjuda.tem(id).
 *
 * Os valores "típicos" são ordens de grandeza de prática de projeto, ditas em
 * termos gerais — NÃO são limites de norma. Norma só onde o módulo já a usa
 * (NBR 8800, 14762, 6123, 6120). Sem marca de programa de terceiros.
 * Teste: node tools/test-metal-ajuda.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ------------------------------------------------------------ OS TEXTOS (dados) */
  var AJUDA_CAMPOS = {
    vao: { nome: "Vão / largura (m)", destaque: ["vao", "viga"],
      oque: "É a largura do galpão: a distância entre as duas fileiras de pilares, de uma parede lateral à outra, medida de eixo a eixo.",
      tipico: "Galpões comerciais e industriais costumam ter de 12 a 30 m de largura; acima disso quase sempre se usa estrutura treliçada.",
      efeito: "Quanto maior o vão, mais pesado e mais caro: a viga ou a tesoura precisa de seção maior, e o peso por m² cresce mais que a largura. Dobrar o vão pode mais que dobrar o aço de cada pórtico." },
    comprimento: { nome: "Comprimento do galpão (m)", destaque: ["comprimento", "porticos"],
      oque: "É o tamanho do galpão de frente a fundo, na direção em que os pórticos se repetem. Os pórticos são distribuídos dentro desse comprimento.",
      tipico: "Depende do uso: de 20 a 60 m é comum em galpões de pequeno e médio porte.",
      efeito: "Cada metro a mais é mais telha, terça, fechamento e contraventamento; o peso total cresce quase na proporção do comprimento, e o custo por m² muda pouco." },
    definirPor: { nome: "Definir por", destaque: ["comprimento", "porticos", "espacamento"],
      oque: "Escolha como quer informar os pórticos: dizendo QUANTOS pórticos quer (o sistema divide o comprimento em vãos iguais) ou dizendo o ESPAÇAMENTO desejado (o sistema calcula quantos pórticos cabem sem passar desse valor).",
      tipico: "Quem já sabe o espaçamento que a telha e a terça aguentam costuma informar o espaçamento; quem quer controlar o número de peças informa a quantidade.",
      efeito: "Só muda a forma de informar. O que pesa no custo é o espaçamento final entre os pórticos." },
    ajuste: { nome: "Sobra do comprimento", destaque: ["comprimento", "espacamento"],
      oque: "Quando o espaçamento desejado não divide o comprimento exatamente, sobra um pedaço. Você escolhe: deixar todos os vãos iguais (um pouco menores que o desejado) ou manter o espaçamento desejado nos vãos do meio e ajustar só os dois vãos das pontas.",
      tipico: "Vãos todos iguais é o mais simples de fabricar e montar; ajustar as pontas serve quando o espaçamento do meio precisa ser exato.",
      efeito: "Vãos iguais repetem as mesmas peças. Pontas ajustadas criam dois vãos diferentes (terças e correntes de outro comprimento nas extremidades), com pouca diferença de peso." },
    peDireito: { nome: "Pé-direito / altura do banzo no pilar (m)", destaque: ["altura", "pilar"],
      oque: "É a altura do pilar até onde começa o telhado (o beiral). Nas tesouras e treliças, é a altura do banzo de cima junto ao pilar.",
      tipico: "De 6 a 10 m em galpões comuns; mais alto quando há ponte rolante ou estoque empilhado.",
      efeito: "Pilar mais alto pesa mais, pega mais vento e pede fundação maior; também aumenta a área de telha e travessa do fechamento lateral." },
    inclinacao: { nome: "Inclinação do telhado (%)", destaque: ["inclinacao", "viga"],
      oque: "Quanto o telhado sobe a cada 100 cm na horizontal: 10 % quer dizer 10 cm de subida por metro. É o que faz a água escorrer.",
      tipico: "Telhas metálicas costumam trabalhar entre 5 e 15 %; o mínimo vem do fabricante da telha. 10 % é um valor muito usado.",
      efeito: "Mais inclinação escoa melhor a chuva, mas sobe a cumeeira e aumenta a área do telhado (um pouco mais de peso). Pouca inclinação exige vedação mais cuidadosa." },
    espacamento: { nome: "Espaçamento dos pórticos (m)", destaque: ["espacamento", "porticos"],
      oque: "É a distância entre um pórtico e o seguinte, ao longo do comprimento do galpão.",
      tipico: "De 5 a 8 m em galpões de aço; 6 m é muito comum.",
      efeito: "Pórticos mais juntos = mais pórticos e mais fundações, mas terças menores e mais leves; mais afastados = menos pórticos, porém terças mais pesadas. Costuma haver um valor intermediário mais econômico." },
    espacamentoDesejado: { nome: "Espaçamento desejado (m)", destaque: ["espacamento", "porticos"],
      oque: "É o espaçamento máximo que você quer entre pórticos. O sistema nunca passa dele: divide o comprimento no menor número de vãos que respeita esse valor.",
      tipico: "De 5 a 8 m em galpões de aço; 6 m é muito comum.",
      efeito: "Menor espaçamento = mais pórticos (mais aço e fundação) e terças mais leves; maior = menos pórticos e terças mais pesadas." },
    nPorticos: { nome: "Número de pórticos", destaque: ["porticos", "espacamento"],
      oque: "Quantos pórticos (quadros transversais) o galpão tem. O primeiro e o último ficam nas extremidades: N pórticos formam N − 1 vãos.",
      tipico: "De 6 a 12 pórticos num galpão de 30 a 60 m.",
      efeito: "Cada pórtico a mais soma o peso de um pórtico inteiro e de uma fundação, e diminui o vão das terças." },
    base: { nome: "Base dos pilares", destaque: ["base", "pilar"],
      oque: "Rotulada: o pilar gira livremente na base e a fundação recebe só forças de empurrar e puxar. Engastada: a base impede o giro e passa também momento (um torque) para a fundação.",
      tipico: "Engastada é comum em pórticos de alma cheia; rotulada quando a fundação não pode receber momento ou a estrutura tem o travamento de outro modo.",
      efeito: "Engastada costuma deixar o aço do pórtico mais leve, mas pede fundação e placa de base mais robustas; rotulada faz o contrário." },
    fechamento: { nome: "Fechamento (laterais e oitões)", destaque: ["fechamento"],
      oque: "Fechado: as laterais e as extremidades (oitões) têm telha. Aberto: só o telhado existe.",
      tipico: "Galpões industriais e comerciais são quase sempre fechados; coberturas de estacionamento e depósitos abertos usam a opção aberto.",
      efeito: "Fechado soma telhas e travessas e muda o vento da NBR 6123 (a pressão interna entra na conta, o que costuma aumentar os esforços); aberto é mais leve." },
    contraventamento: { nome: "Contraventamento (vãos das pontas)", destaque: ["contra"],
      oque: "É o X de barras (ou cantoneiras) nos vãos das pontas, que impede o galpão de tombar no sentido do comprimento e leva o vento dos oitões até a fundação.",
      tipico: "Em geral nos vãos das extremidades, no telhado e nas paredes laterais.",
      efeito: "Pesa pouco (poucas barras finas), mas é essencial: sem ele o cálculo acusa mecanismo, ou seja, a estrutura poderia cair para o lado." },
    aguas: { nome: "Águas do telhado", destaque: ["inclinacao", "viga"],
      oque: "Duas águas: o telhado sobe até a cumeeira no meio e desce do outro lado. Uma água: todo o telhado cai para o mesmo lado.",
      tipico: "Duas águas é o mais comum; uma água aparece em galpões encostados em outra construção.",
      efeito: "Uma água deixa um lado do pilar mais alto (mais aço e mais vento nele); duas águas distribuem melhor a altura." },
    forma: { nome: "Tesoura", destaque: ["tesoura", "banzo"],
      oque: "O desenho da treliça do telhado: banzos paralelos (duas águas, banzo de baixo seguindo o telhado) ou trapezoidal (banzo de baixo reto).",
      tipico: "Os dois são usuais; trapezoidal é mais simples de fabricar e libera um pé-direito livre constante.",
      efeito: "A altura da tesoura e o desenho das barras mudam o peso: tesoura mais alta usa banzos menores, porém mais barras de alma." },
    padrao: { nome: "Alma / tipo de treliça", destaque: ["tesoura", "diagonal", "montante"],
      oque: "É o arranjo das barras que ligam o banzo de cima ao de baixo: Howe, Pratt ou Warren mudam quais barras trabalham esticadas e quais comprimidas.",
      tipico: "Pratt, Howe e Warren são todos usuais; a escolha costuma vir da facilidade de fabricar e da posição das terças.",
      efeito: "Muda o número de barras e o comprimento delas; a diferença no peso total costuma ser pequena perto de outras escolhas, como a altura da treliça." },
    alturaTrelica: { nome: "Altura da tesoura (m)", destaque: ["tesoura", "altura"],
      oque: "É a altura da treliça medida entre o eixo do banzo de cima e o do banzo de baixo. Com 0, o sistema usa um valor de partida em função do vão.",
      tipico: "De 1/20 a 1/12 do vão (em um vão de 20 m, de 1,0 a 1,7 m).",
      efeito: "Treliça mais alta = banzos mais leves (os esforços nos banzos caem), mas mais barras de alma mais longas e mais flambagem delas; há um ponto intermediário mais econômico." },
    subPaineis: { nome: "Painéis de alma por painel de terça", destaque: ["tesoura", "diagonal", "montante"],
      oque: "Quantas divisões a mais a alma da tesoura tem dentro de cada trecho entre terças. 0 deixa o sistema escolher.",
      tipico: "Zero (automático) atende a maioria dos casos.",
      efeito: "Mais painéis = barras de alma mais curtas e leves, porém em maior número e com mais nós para soldar." },
    paineis: { nome: "Número de painéis", destaque: ["tesoura", "diagonal", "montante"],
      oque: "Em quantos trechos iguais a treliça é dividida ao longo do vão. 0 deixa o sistema escolher.",
      tipico: "Zero (automático); ou painéis de cerca de 1,5 a 3 m de comprimento.",
      efeito: "Mais painéis = barras mais curtas e leves, mas mais barras e mais nós para fabricar." },
    banzo: { nome: "Perfil dos banzos", destaque: ["banzo", "tesoura"],
      oque: "O perfil das barras de cima e de baixo da tesoura: são elas que resistem à flexão do vão (uma comprime e outra estica).",
      tipico: "Tubos quadrados ou retangulares, perfis U formados a frio ou perfis laminados, conforme o vão.",
      efeito: "É a maior parte do peso da tesoura: um perfil maior aumenta o aço; o cálculo mostra se o perfil escolhido passa e o otimizador pode achar o mais leve." },
    diagonal: { nome: "Perfil das diagonais", destaque: ["diagonal", "tesoura"],
      oque: "O perfil das barras inclinadas da alma, que levam a força cortante da tesoura dos apoios para o meio.",
      tipico: "Cantoneiras ou tubos pequenos.",
      efeito: "Pesa pouco cada uma, mas são muitas; um perfil muito esbelto reprova por flambagem." },
    montante: { nome: "Perfil dos montantes", destaque: ["montante", "tesoura"],
      oque: "O perfil das barras verticais da alma, que ligam o banzo de cima ao de baixo.",
      tipico: "Cantoneiras ou tubos pequenos.",
      efeito: "Pesam pouco; um montante comprimido e esbelto demais não passa na verificação." },
    escora: { nome: "Escora do banzo de baixo", destaque: ["escora"],
      oque: "A barra longitudinal que liga, de um pórtico a outro, o banzo de baixo das tesouras, impedindo que ele balance para o lado quando o vento o comprime.",
      tipico: "Tubo quadrado médio, nas linhas de escora do banzo inferior.",
      efeito: "Uma escora fraca reprova por flambagem; uma muito forte só soma aço. O cálculo confere cada uma." },
    escoraColuna: { nome: "Escora da coluna", destaque: ["escora", "colunaTrel"],
      oque: "A barra longitudinal que liga uma coluna treliçada à seguinte, no plano da parede, travando-a contra o giro para o lado.",
      tipico: "Tubo quadrado médio.",
      efeito: "Pesa pouco; é ela que mantém as colunas travadas entre pórticos." },
    larguraColuna: { nome: "Largura da coluna (m)", destaque: ["colunaTrel", "pilar"],
      oque: "Quando a coluna é treliçada (dois banzos ligados por travessas), é a distância entre os eixos dos dois banzos.",
      tipico: "De 0,4 a 0,8 m em galpões de médio porte.",
      efeito: "Coluna mais larga resiste melhor à flexão com banzos menores, mas ocupa mais espaço e tem barras de travejamento maiores." },
    painelColuna: { nome: "Altura do painel do travejamento (m)", destaque: ["colunaTrel"],
      oque: "A altura de cada trecho do travejamento (as barras em zigue-zague) entre os dois banzos da coluna.",
      tipico: "Painéis de cerca de 0,5 a 1 m.",
      efeito: "Painéis menores = mais barras curtas; maiores = menos barras mais longas, mais sujeitas a flambar." },
    banzoColuna: { nome: "Perfil dos banzos da coluna", destaque: ["colunaTrel", "pilar"],
      oque: "O perfil de cada um dos dois banzos da coluna treliçada, que levam a compressão e a flexão do pilar.",
      tipico: "Perfis U formados a frio ou perfis laminados.",
      efeito: "É o maior peso da coluna; o cálculo confere se passa." },
    travejamento: { nome: "Perfil do travejamento", destaque: ["colunaTrel"],
      oque: "O perfil das barras em zigue-zague que ligam os dois banzos da coluna treliçada.",
      tipico: "Cantoneiras ou tubos pequenos.",
      efeito: "Pesa pouco, mas é muita barra; muito esbelta, reprova." },
    tercaBorda: { nome: "Terça das faixas de borda", destaque: ["tercas"],
      oque: "O perfil das terças que ficam nas bordas do telhado (beirais e oitões), onde o vento puxa o telhado para cima com mais força (NBR 6123).",
      tipico: "Costuma ser um perfil um passo mais forte que o das terças internas.",
      efeito: "São poucas terças, então o custo extra é pequeno; evita reprovar justamente onde o vento é mais forte." },
    terca: { nome: "Perfil das terças", destaque: ["tercas"],
      oque: "As terças são as peças que ficam deitadas sobre os pórticos e seguram a telha. Este é o perfil delas (na tesoura leve, o das internas).",
      tipico: "Perfil U enrijecido formado a frio, ou tubo retangular, de 150 a 300 mm de altura conforme o vão entre pórticos.",
      efeito: "São uma das maiores parcelas do aço de um galpão; o espaçamento entre pórticos e entre terças define a seção necessária." },
    espTercas: { nome: "Espaçamento máx. das terças (m)", destaque: ["tercas"],
      oque: "A distância máxima entre uma terça e a seguinte ao longo da água do telhado. O sistema distribui as terças respeitando esse máximo.",
      tipico: "Em geral entre 1,2 e 2 m; vem do vão que a telha escolhida aguenta (catálogo do fabricante).",
      efeito: "Terças mais próximas = mais terças, porém mais leves e com telha mais fina; mais afastadas = menos terças mais fortes e telha mais exigida." },
    correntes: { nome: "Linhas de corrente por vão", destaque: ["correntes", "tercas"],
      oque: "As correntes são barras redondas que ligam as terças entre si no meio do vão, para que elas não girem nem torçam para o lado. Aqui se escolhe quantas linhas há em cada vão entre pórticos.",
      tipico: "O módulo escolhe pela regra do cálculo (trecho livre da terça até 2 m entre correntes ancoradas): em vão de 6 m, em geral 2 linhas.",
      efeito: "Pesam muito pouco e permitem terças bem mais leves; poucas correntes obrigam a terça maior." },
    tapamento: { nome: "Coluna de tapamento", destaque: ["tapamento"],
      oque: "São pilares secundários nos oitões (frente e fundo), entre os pilares principais, que seguram o fechamento e o vento naquele trecho.",
      tipico: "Um perfil por trecho de 4 a 6 m de oitão.",
      efeito: "Pesam pouco; sem elas a travessa do fechamento teria um vão grande demais." },
    barraCv: { nome: "Barra do X (contraventamento)", destaque: ["contra"],
      oque: "A barra redonda que forma o X do contraventamento. Trabalha só esticada: quando o vento empurra, a diagonal que estica segura.",
      tipico: "Barras de 12 a 20 mm.",
      efeito: "Pesa pouco; barra fina demais reprova por alongamento." },
    cantoneiraCv: { nome: "Cantoneira do X (contraventamento)", destaque: ["contra"],
      oque: "A cantoneira usada no lugar da barra redonda no X do contraventamento, quando escolhida a opção 'X de cantoneira'.",
      tipico: "Cantoneiras de 50 a 76 mm de aba.",
      efeito: "Mais rígida que a barra redonda, porém um pouco mais pesada." },
    x0: { nome: "Origem X (m)", destaque: ["origem"],
      oque: "Onde o galpão fica no modelo em 3D, na direção da largura: a posição do canto de partida. Só desloca o desenho.",
      tipico: "Zero, salvo quando há outras construções no modelo.",
      efeito: "Nenhum: não muda o peso nem o custo, só a posição no desenho." },
    z0: { nome: "Origem Z (m)", destaque: ["origem"],
      oque: "Onde o galpão fica no modelo em 3D, na direção do comprimento: a posição do canto de partida. Só desloca o desenho.",
      tipico: "Zero, salvo quando há outras construções no modelo.",
      efeito: "Nenhum: não muda o peso nem o custo, só a posição no desenho." },
    cota: { nome: "Cota da base (m)", destaque: ["cota", "base"],
      oque: "A altura, no modelo em 3D, em que ficam as bases dos pilares (o nível do piso acabado ou da fundação).",
      tipico: "Zero, ou o nível do terreno do projeto.",
      efeito: "Nenhum no peso ou no custo da estrutura: só a posição vertical no modelo." },
    pilar: { nome: "Perfil dos pilares", destaque: ["pilar"],
      oque: "O perfil das colunas que seguram o telhado e levam as cargas até a fundação.",
      tipico: "Perfis de alma cheia soldados ou laminados, de 250 a 600 mm de altura, conforme vão e pé-direito.",
      efeito: "É uma das maiores parcelas do aço do pórtico; o cálculo confere a flexão e a flambagem e mostra o que não passa." },
    viga: { nome: "Perfil das vigas", destaque: ["viga"],
      oque: "O perfil das vigas inclinadas do telhado, que vão de um pilar ao outro passando pela cumeeira.",
      tipico: "Perfis de alma cheia, de altura um pouco menor que a do pilar.",
      efeito: "Junto com os pilares, é o grosso do aço do pórtico. Vão maior pede perfil maior." }
  };
  var GENERICO = { nome: "", destaque: [],
    oque: "Dado técnico de partida deste tipo de pórtico. O sistema usa o valor que você deixar aqui como ponto de partida do desenho e do cálculo.",
    tipico: "Os valores de partida já preenchidos são proporções usuais de projeto; troque só se tiver um motivo.",
    efeito: "Pode mudar o peso e o custo; o cálculo da estrutura confere o resultado e mostra o que não passa." };

  /* ------------------------------------------------------------ O DESENHO (SVG do galpão, parte em destaque) */
  var COR_HI = "#e9732b";
  function svg(destaques) {
    var hl = {}; (destaques || []).forEach(function (k) { hl[k] = true; });
    function any() { for (var i = 0; i < arguments.length; i++) if (hl[arguments[i]]) return true; return false; }
    function st(on, w) { return on ? 'stroke="' + COR_HI + '" stroke-width="' + (w || 2.6) + '" opacity="1"' : 'stroke="currentColor" stroke-width="1.3" opacity=".55"'; }
    function L(x1, y1, x2, y2, on, w) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" ' + st(on, w) + ' stroke-linecap="round"/>'; }
    function T(x, y, t, on, anc) { return '<text x="' + x + '" y="' + y + '" font-size="8" text-anchor="' + (anc || "middle") + '" fill="' + (on ? COR_HI : "currentColor") + '" opacity="' + (on ? 1 : 0.7) + '" font-family="system-ui,sans-serif">' + esc(t) + "</text>"; }
    function seta(x1, y1, x2, y2, on) { var o = [L(x1, y1, x2, y2, on, 1.8)], dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d, c = on ? COR_HI : "currentColor";
      [[x1, y1, 1], [x2, y2, -1]].forEach(function (q) { var px = q[0], py = q[1], s = q[2]; o.push('<polygon points="' + px + "," + py + " " + (px + s * (4 * ux - 2 * uy)) + "," + (py + s * (4 * uy + 2 * ux)) + " " + (px + s * (4 * ux + 2 * uy)) + "," + (py + s * (4 * uy - 2 * ux)) + '" fill="' + c + '" opacity="' + (on ? 1 : 0.55) + '"/>'); }); return o.join(""); }
    var o = [], i, xp = [24, 57, 90, 123, 156];
    function yTopo(x) { return x <= 90 ? 82 - (x - 24) * 30 / 66 : 52 + (x - 90) * 30 / 66; }
    var tes = any("tesoura", "banzo", "diagonal", "montante");
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 170" width="100%" role="img" aria-label="Desenho do galpão com a parte do campo em destaque" data-ajuda-svg="1">');
    /* ---- vista de frente (pórtico) ---- */
    o.push(T(90, 12, "Vista de frente", false));
    if (hl.fechamento) { for (i = 0; i < 9; i++) o.push(L(24 + i * 15, 128, 24 + i * 15 + 0, yTopo(24 + i * 15) + 0, true, 1.1)); }
    o.push(L(8, 128, 172, 128, any("cota"), any("cota") ? 2.6 : 1.3));
    o.push(L(24, 128, 24, 82, any("pilar", "altura", "colunaTrel"), any("colunaTrel") ? 2.2 : 2.6) + L(156, 128, 156, 82, any("pilar", "altura", "colunaTrel"), any("colunaTrel") ? 2.2 : 2.6));
    if (hl.colunaTrel) { o.push(L(31, 128, 31, 88, true, 1.6) + L(149, 128, 149, 88, true, 1.6)); for (i = 0; i < 5; i++) { var yc = 128 - i * 8; o.push(L(24, yc, 31, yc - 8, true, 1.1) + L(149, yc, 156, yc - 8, true, 1.1)); } }
    o.push(L(24, 82, 90, 52, any("viga", "banzo", "inclinacao", "tesoura")) + L(90, 52, 156, 82, any("viga", "banzo", "inclinacao", "tesoura")));
    o.push(L(24, 94, 156, 94, any("banzo", "tesoura")));
    xp.forEach(function (x, k) {
      o.push(L(x, 94, x, yTopo(x), any("montante", "tesoura") && tes, 1.8));
      if (k < 4) o.push(L(x, 94, xp[k + 1], yTopo(xp[k + 1]), any("diagonal", "tesoura") && tes, 1.6));
    });
    for (i = 0; i < 7; i++) { var xt = 24 + i * 22, yt = yTopo(xt); o.push('<circle cx="' + xt + '" cy="' + (yt - 2) + '" r="' + (hl.tercas ? 3 : 2) + '" ' + (hl.tercas ? 'fill="' + COR_HI + '"' : 'fill="currentColor" opacity=".55"') + "/>"); }
    if (hl.base) { o.push('<rect x="19" y="127" width="10" height="3" fill="' + COR_HI + '"/><rect x="151" y="127" width="10" height="3" fill="' + COR_HI + '"/>'); }
    if (hl.cota) { o.push(seta(14, 138, 14, 128, true) + T(14, 148, "cota", true) + L(8, 138, 20, 138, true, 1.6)); }
    /* cotas: vão, altura, inclinação */
    o.push(seta(24, 140, 156, 140, any("vao")) + T(90, 152, "vão", any("vao")));
    if (hl.altura) { o.push(seta(12, 128, 12, 82, true) + T(12, 78, "altura", true)); }
    if (hl.inclinacao) { o.push(L(156, 82, 176, 82, true, 1) + L(156, 82, 176, 70, true, 2.4) + T(170, 92, "i %", true)); }
    /* ---- vista de cima (planta) ---- */
    var x0 = 196, x1 = 316, y0 = 34, y1 = 100, np = 6;
    o.push(T(256, 12, "Vista de cima", false));
    /* terças (horizontais) e pórticos (verticais) */
    for (i = 0; i < 7; i++) { var yy = y0 + i * (y1 - y0) / 6; o.push(L(x0, yy, x1, yy, hl.tercas, 1.6)); }
    for (i = 0; i < np; i++) { var xx = x0 + i * (x1 - x0) / (np - 1); o.push(L(xx, y0, xx, y1, any("porticos") || (hl.espacamento && i < 2) || (hl.pilar && false), any("porticos") ? 2.4 : 1.8)); }
    if (hl.contra) { var bw = (x1 - x0) / (np - 1); [0, np - 2].forEach(function (b) { var xa = x0 + b * bw, xb = xa + bw; o.push(L(xa, y0, xb, y1, true, 2) + L(xb, y0, xa, y1, true, 2)); }); }
    if (hl.escora) { o.push('<line x1="' + x0 + '" y1="' + ((y0 + y1) / 2) + '" x2="' + x1 + '" y2="' + ((y0 + y1) / 2) + '" stroke="' + COR_HI + '" stroke-width="2.4" stroke-dasharray="5 3"/>'); }
    if (hl.correntes) { for (i = 0; i < np - 1; i++) { var xm = x0 + (i + 0.5) * (x1 - x0) / (np - 1); o.push(L(xm, y0, xm, y1, true, 1.3)); } }
    if (hl.tapamento) { [0, 1, 2].forEach(function (k) { o.push('<circle cx="' + x0 + '" cy="' + (y0 + (k + 1) * (y1 - y0) / 4) + '" r="3.4" fill="' + COR_HI + '"/><circle cx="' + x1 + '" cy="' + (y0 + (k + 1) * (y1 - y0) / 4) + '" r="3.4" fill="' + COR_HI + '"/>'); }); }
    if (hl.fechamento) { o.push(L(x0, y0, x1, y0, true, 3) + L(x0, y1, x1, y1, true, 3) + L(x0, y0, x0, y1, true, 3) + L(x1, y0, x1, y1, true, 3)); }
    if (any("comprimento")) o.push(seta(x0, 24, x1, 24, true) + T((x0 + x1) / 2, 21, "comprimento", true));
    if (hl.espacamento) o.push(seta(x0, y1 + 10, x0 + (x1 - x0) / (np - 1), y1 + 10, true) + T(x0 + (x1 - x0) / (np - 1) / 2, y1 + 22, "espaç.", true));
    if (hl.porticos) o.push(T((x0 + x1) / 2, y1 + 14, "pórticos", true));
    if (hl.vao) o.push(seta(x0 - 8, y0, x0 - 8, y1, true) + T(x0 - 12, (y0 + y1) / 2 + 3, "vão", true, "end"));
    if (hl.origem) { o.push(seta(x0, y1 + 10, x0 + 34, y1 + 10, true) + T(x0 + 34, y1 + 20, "Z", true) + seta(x0 - 12, y1, x0 - 12, y1 - 34, true) + T(x0 - 16, y1 - 36, "X", true, "end") + '<circle cx="' + x0 + '" cy="' + y1 + '" r="3.2" fill="' + COR_HI + '"/>'); }
    o.push("</svg>");
    return o.join("");
  }

  function tem(id) { return !!AJUDA_CAMPOS[id]; }
  function cartao(id, op) {
    op = op || {};
    var a = AJUDA_CAMPOS[id] || GENERICO, nome = a.nome || op.rotulo || id;
    return '<div class="mpo-ajuda" data-mpo-ajuda="' + esc(id) + '"><div class="mpo-ajuda-cab"><h4>' + esc(nome) + '</h4><button type="button" data-mpo-voltar="1">Voltar ao resumo</button></div>' +
      '<div class="mpo-ajuda-svg">' + svg(a.destaque) + "</div>" +
      (op.valor != null && op.valor !== "" ? '<p class="mpo-ajuda-val">Valor agora: <b>' + esc(op.valor) + "</b></p>" : "") +
      '<dl><dt>O que é</dt><dd>' + esc(a.oque) + "</dd><dt>Valor típico no Brasil</dt><dd>" + esc(a.tipico) + "</dd><dt>Efeito no peso e no custo</dt><dd>" + esc(a.efeito) + "</dd></dl></div>";
  }

  var MetalPorticosAjuda = { AJUDA_CAMPOS: AJUDA_CAMPOS, GENERICO: GENERICO, svg: svg, cartao: cartao, tem: tem };
  global.MetalPorticosAjuda = MetalPorticosAjuda;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalPorticosAjuda;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
