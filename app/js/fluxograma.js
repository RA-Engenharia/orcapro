/* =====================================================================
 * fluxograma.js — O MACROFLUXO DA OBRA (a rede desenhada como REDE)
 *
 * O OrçaPRO tem a rede de precedência inteira em memória desde sempre
 * (predecessoras + lag + tipo de elo + folga + caminho crítico) e NUNCA a
 * desenhou como rede: só como Gantt com setas. São leituras diferentes. O
 * Gantt responde "quando"; o fluxograma responde "o que segura o quê" — e é
 * ele que mostra o nó por onde passa metade da obra, que no Gantt fica
 * escondido atrás de quarenta setas cruzadas. Na prática de planejamento o
 * macrofluxo vem ANTES do cronograma: é onde se discute sequência.
 *
 * ⚠ MOTOR PURO. Sem DOM, sem Store, sem SVG, sem cor de tema. Recebe o
 * resultado de `Cronograma.estimar(orc, null, {eap:true})` e devolve o LAYOUT
 * (caixas com x/y/w/h e arestas com o caminho já resolvido). Quem desenha —
 * tela ou PDF — só percorre a lista. Duas telas desenhando o mesmo layout é
 * o que garante que o papel e o monitor mostram a MESMA rede.
 *
 * ⚠ NÃO SE RECALCULA CPM AQUI, EM NENHUMA HIPÓTESE. Duração, início, fim,
 * datas, FOLGA e CAMINHO CRÍTICO vêm prontos de `r` e são COPIADOS. A base
 * inteira já pagou o preço de duas réguas para a mesma grandeza (o caso
 * clássico: o engenheiro via 50% e o cliente via 80% do mesmo avanço, que é
 * pior que os dois errarem igual). Se faltar um dado, ele vira PENDÊNCIA no
 * cabeçalho — não vira conta nova. O que este arquivo calcula é GEOMETRIA:
 * camada, linha, x, y e o caminho da linha. Nada disso é prazo.
 *
 * ⚠ A CAMADA NÃO É DATA, E NÃO É A `ordem` DO MOTOR. `camada[n]` = 0 quando n
 * não tem predecessora, senão 1 + a maior camada das predecessoras — o
 * "nível" clássico do desenho em camadas. Duas consequências que precisam
 * estar escritas, porque as duas já confundiram leitura de rede:
 *   (1) camada NÃO é ordem cronológica. Uma etapa de camada 3 pode começar
 *       antes de uma de camada 1 (lag negativo, paralelismo, restrição de
 *       data). Quem quiser ler tempo lê `inicio`/`dataInicio`, que vêm do
 *       motor. A camada é a distância em ELOS, e é isso que o macrofluxo
 *       mostra.
 *   (2) o número da camada NÃO depende da ordem em que os nós são varridos:
 *       é o caminho mais longo em elos até o nó, uma função só do grafo. Por
 *       isso ele NÃO é uma segunda cópia da ordenação de Kahn do motor
 *       (js/cronograma.js, `ida`) — o Kahn aqui serve só para varrer os nós
 *       numa ordem em que as predecessoras já foram resolvidas, e trocar o
 *       desempate dele não muda uma camada sequer. O que o desempate muda é a
 *       ORDEM INICIAL DENTRO DA CAMADA, que é enfeite de desenho e é
 *       reescrita logo depois pela redução de cruzamentos.
 *
 * ⚠ ARESTA CRÍTICA = OS DOIS NÓS SÃO CRÍTICOS. O motor publica `critico` por
 * NÓ e não publica qual elo apertou o sucessor. Inferir o elo apertado a
 * partir de `predDesloc` seria uma segunda régua — e no nível FOLHA seria uma
 * régua falsa, porque lá o `predDesloc` é derivado das posições já desenhadas
 * (js/cronograma.js, `fn.predDesloc = e2.ini - ...`): a identidade fecha por
 * construção e TODO elo pareceria apertado. Então a régua é a honesta e
 * declarada: `aresta.critico` só diz que as duas pontas estão no caminho
 * crítico. Ver PENDÊNCIA 3.
 *
 * ⚠ O LAG DECLARADO E O DESLOCAMENTO EFETIVO SÃO CAMPOS DIFERENTES, de
 * propósito. `aresta.lag` é o que a pessoa digitou naquele elo
 * (`orc.cronograma.lags`), e é `null` quando ela não digitou nada.
 * `aresta.desloc` é o deslocamento que o motor de fato aplicou — que sem lag
 * é a sobreposição automática do paralelismo, um número NEGATIVO que ninguém
 * escreveu. Rotular a seta com o `desloc` faria o desenho dizer "−2 dias" num
 * elo em que a pessoa não pediu avanço nenhum. O rótulo da seta é o `lag`.
 *
 * ⚠ O QUE É INTERNO NÃO PODE IR AO PAPEL DO CLIENTE — e este desenho vai à
 * tela E ao papel. Folga e caminho crítico são campos de planejamento
 * interno: no documento do contratante, "esta etapa tem 12 dias de folga" é
 * munição de negociação contra a própria RA. A guarda NÃO mora aqui (quem
 * monta documento é o js/cronodocs.js, com `publico(nivel)` e `RESTRITOS`);
 * o que mora aqui é a SEPARAÇÃO: os campos internos estão declarados em
 * `Fluxograma.RESTRITOS`, com o mesmo vocabulário de permissão do
 * js/cronodocs.js (`perm: "folga"`, `perm: "caminhoCritico"`), para quem
 * montar o papel poder tirá-los sem adivinhar quais são. Ver PENDÊNCIA 2.
 *
 * ⚠ TEIA ILEGÍVEL SE DECLARA, NÃO SE ENTREGA CALADA. Acima de certo tamanho
 * um desenho em camadas deixa de ser legível — vira rabisco, e rabisco no
 * papel do cliente é pior que nenhuma figura. `denso: true` + `motivoDenso`
 * dizem isso para a tela poder oferecer o nível "etapa" no lugar do "folha".
 * O layout continua vindo (a decisão é de quem desenha, não do motor), mas
 * vem com a etiqueta. Os limites saíram de MEDIÇÃO, não de gosto — ver o
 * bloco LIMITES abaixo.
 *
 * ---------------------------------------------------------------------
 * PENDÊNCIAS (dado que `r` não dá; NÃO calculado aqui de propósito)
 *
 * 1. ORDEM TOPOLÓGICA DO MOTOR. `Cronograma.estimar` monta `ordem` (Kahn) e
 *    não a publica. Aqui ela é refeita — com a MESMA forma (fila FIFO, nós
 *    sem predecessora na ordem da lista) — só para varrer. Como as camadas
 *    não dependem do desempate (⚠ acima), a réplica não move número nenhum
 *    do retorno. Se um dia o motor publicar `r.ordem`, trocar aqui é uma
 *    linha, e some até essa réplica.
 * 2. FILTRO DE PÚBLICO. `CronoDocs.publico(nivel)` + `_guardar` já sabem
 *    retirar `folga`/`critico`/`caminhoCritico` e DECLARAR o que retiraram.
 *    Este motor não chama nada disso (seria o motor decidindo documento).
 *    Quem montar o PDF passa a saída por lá — a lista está em `RESTRITOS`.
 * 3. QUAL ELO APERTOU. O motor sabe, no laço de volta, qual sucessor definiu
 *    o `lf` de cada nó, e joga fora. Se ele publicasse `et.predCritico` (ou
 *    `elosCriticos: [[de,para]]`), a aresta crítica deixaria de ser "as duas
 *    pontas são críticas" e passaria a ser o elo de verdade.
 * 4. TIPO DE ELO ENTRE ETAPAS. Hoje só existe TI entre etapas (o motor crava
 *    `predTipo[p] = "TI"`); II só existe entre folhas da mesma etapa. Quando
 *    TT/IT/II de etapa entrarem, `aresta.tipo` já os carrega sem mudança
 *    aqui — o campo lê o que o motor disser.
 * ===================================================================== */
(function (global) {
  "use strict";

  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function fin(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return String(v == null ? "" : v); }

  /* ⚠ NÃO HÁ parseNum NESTE ARQUIVO, de propósito. A memória "réplica de
     parser apodrece" (33 módulos copiando Util.parseNum, dois errando em
     direções OPOSTAS, os dois movendo dinheiro) vale aqui: tudo o que entra
     já sai numérico do motor do cronograma, e nada nesta entrada é texto de
     dinheiro. `fin` só recusa NaN/Infinity. */

  /* ordenação ESTÁVEL por chave numérica. ⚠ `Array.prototype.sort` só passou
     a ser estável por norma no ES2019, e o produto roda em WebView de
     instalador antigo — uma ordenação instável aqui faz o MESMO orçamento
     desenhar diferente em dois aparelhos, e aí ninguém consegue conferir uma
     rede contra a outra. O índice entra no critério: empate nunca troca. */
  function ordenar(lista, chave) {
    var dec = lista.map(function (x, i) { return { x: x, i: i, k: chave(x, i) }; });
    dec.sort(function (a, b) { return a.k !== b.k ? a.k - b.k : a.i - b.i; });
    return dec.map(function (d) { return d.x; });
  }

  /* =====================================================================
     LIMITES DE LEGIBILIDADE (o que faz `denso` virar true)

     MEDIDO em 12/09/2026 nos 34 arquivos de C:\Users\USER\Documents\
     OrcaPRO-Backups (51 orçamentos distintos por md5): a rede REAL da RA é
     pequena e quase sempre uma corrente — 3 etapas na mediana, 8 no maior,
     no máximo 2 nós na camada mais cheia, e 17 dos 51 com predecessora
     declarada. No nível FOLHA o maior desenho dá 16 caixas (o maior
     orçamento tem 85 nós de EAP, mas 69 deles são SERVIÇO e serviço não vira
     caixa de macrofluxo — ver `_nosFolha`).
     Os limites abaixo, então, NÃO existem para a base da RA: existem para o
     orçamento grande importado, onde a teia acontece de verdade. Eles saem
     da geometria do desenho, não de gosto:
       - caixa de 180 × 64 px com vão de 70 × 24 px;
       - uma tela de trabalho mostra ~1.400 × 800 px;
       - acima de ~4 telas de largura ou ~5 de altura a pessoa perde o fio da
         aresta ao rolar, que é o momento em que a figura para de informar.
     Daí: 6.000 px de largura, 4.000 px de altura, 150 nós no total e 30 nós
     numa mesma camada (uma coluna de 30 caixas tem 2.600 px e já não cabe).
     Tudo parametrizável em `opc` — quem desenha pode ter outra tela.

     MEDIDO em rede sintética (12/09/2026; `tools/test-fluxograma.js` bloco 10
     imprime estes mesmos números a cada rodada):
        nós  camadas  arestas  cruzamentos        folha px   denso    ms
          8        3        5      0 →     0       728×288   não       1
         85       11      154    190 →    46     2.728×728   não       2
        300       20      513  1.501 →   209   4.978×1.344   SIM       8
      2.400       60    4.720  não medido     14.978×3.544   SIM      40
     Duas leituras: (a) o custo é linear e o layout de 2.400 nós sai em ~40 ms,
     ou seja o desenho fica ILEGÍVEL muito antes de ficar lento — que é
     exatamente por que `denso` existe; (b) a passada de mediana corta 76% e
     86% dos cruzamentos nos dois tamanhos medíveis.
     ⚠ E A TABELA ACIMA NÃO EXERCITA O ROTEAMENTO: naquela rede todo elo liga
     camadas vizinhas e nenhuma seta desvia. O PIOR CASO — um em cada três nós
     dependendo TAMBÉM do nó inicial, com a seta atravessando o desenho
     inteiro — custa mais, e é ele que vale para dimensionar:
         85 nós / 103 arestas / 21 desvios ......... ~3 ms
        300 nós / 379 arestas / 90 desvios ........ ~11 ms
      2.400 nós / 3.146 arestas / 773 desvios ..... ~227 ms
     Nos três, ZERO linhas passando por cima de caixa alheia (o assert que
     varre todos os segmentos contra todas as caixas, bloco 10 da suíte).

     MEDIDO na base REAL da RA no mesmo dia (34 arquivos de
     C:\Users\USER\Documents\OrcaPRO-Backups, 51 orçamentos distintos por md5,
     lidos no lugar): 51 de 51 montam; no máximo 8 etapas, 8 camadas e 16 nós
     no nível folha; ZERO densos; ZERO cruzamentos (a camada mais cheia tem 2
     caixas); ZERO convergências; e 36 dos 51 sem gargalo nenhum. Os 15 que
     têm gargalo têm exatamente UM, sempre a etapa 1, que abre em dois ramos
     que nunca se reencontram. ⚠ Isto é recado de PRODUTO, não de código: sem
     "Depende de" declarado o macrofluxo é uma fila de caixas, e é por isso
     que a lista de gargalos vazia tem de DIZER que a rede é uma corrente. */
  var LIM = { nos: 150, camada: 30, largura: 6000, altura: 4000 };

  /* geometria padrão da caixa. `w` cabe "1.12 Alvenaria de vedação" em duas
     linhas de 12 px; `h` cabe número + nome + a linha de duração/folga. */
  var GEO = { w: 180, h: 64, gapX: 70, gapY: 24, margem: 24 };

  /* teto da contagem de caminhos. Número de caminhos num DAG é exponencial:
     20 diamantes em série dão 1.048.576. Sem teto o valor vira Infinity e o
     ranking de gargalo morre (todo mundo empatado em Infinity, que é o
     mesmo que não medir). Com teto, o nó estourado sai marcado
     `aproximado: true` e o retorno DIZ que estourou. */
  var TETO_CAMINHOS = 1e12;

  /* ⚠ CAMPOS INTERNOS — a lista que quem monta documento precisa ter à mão.
     Mesmo vocabulário de permissão do js/cronodocs.js (`PERMS`), de
     propósito: lá `publico("cliente")` já devolve {folga:false,
     caminhoCritico:false} e o `_guardar` já sabe retirar e DECLARAR o que
     retirou. Esta lista é o mapa de ONDE eles estão nesta saída — sem ela,
     quem montar o PDF teria de adivinhar, e adivinhar errado aqui é imprimir
     "12 dias de folga" na folha do contratante. */
  var RESTRITOS = [
    { campo: "folga", onde: "nos[].folga", perm: "folga", rotulo: "folga (dias úteis)",
      motivo: "folga é planejamento interno: no papel do contratante ela vira argumento de que a obra podia ser mais rápida" },
    { campo: "critico", onde: "nos[].critico", perm: "caminhoCritico", rotulo: "nó crítico",
      motivo: "caminho crítico é leitura de gestão interna (decisão da frente 11/09/2026, js/cronodocs.js)" },
    { campo: "critico", onde: "arestas[].critico", perm: "caminhoCritico", rotulo: "elo crítico",
      motivo: "a aresta grossa é o caminho crítico desenhado — mesma regra do campo do nó" },
    { campo: "caminhoCritico", onde: "caminhoCritico", perm: "caminhoCritico", rotulo: "caminho crítico",
      motivo: "caminho crítico é leitura de gestão interna (decisão da frente 11/09/2026, js/cronodocs.js)" },
    { campo: "gargalos", onde: "gargalos", perm: "caminhoCritico", rotulo: "gargalos da rede",
      motivo: "gargalo é diagnóstico interno de sequenciamento; no documento de fora vira mapa de onde pressionar" }
  ];

  var Fluxograma = {
    LIM: LIM, GEO: GEO, RESTRITOS: RESTRITOS,
    NIVEIS: ["etapa", "folha"],

    /* A lista dos campos internos, para quem monta documento. Função e não só
       a constante: o chamador não mexe no array da casa por engano. */
    camposInternos: function () {
      return RESTRITOS.map(function (c) {
        return { campo: c.campo, onde: c.onde, perm: c.perm, rotulo: c.rotulo, motivo: c.motivo };
      });
    },

    /* =================================================================
       montar(r, opc) — o LAYOUT do macrofluxo. NÃO desenha: devolve as
       caixas posicionadas e o caminho de cada linha já resolvido.

       r    resultado de `Cronograma.estimar(orc, null, {eap:true})`.
            Sem `r.atividades` o nível "etapa" ainda funciona (cai em
            `r.etapas`, com aviso); o nível "folha" não — e diz por quê.
       opc  nivel      "etapa" (padrão) | "folha"
            w,h,gapX,gapY,margem   geometria da caixa e dos vãos
            passadas   quantas varreduras de redução de cruzamento (padrão 4)
            reduzir    false desliga a redução (o desenho sai na ordem crua)
            maxGargalos  quantos gargalos listar (padrão 10)
            limiarConvergencia  nº de elos que define convergência (padrão 3)
            limites    {nos, camada, largura, altura} — sobrescreve LIM

       Retorno (ok:true):
         nivel, nos[], arestas[], camadas[], caminhoCritico[],
         gargalos[], convergencias[], divergencias[],
         largura, altura, cruzamentos{}, denso, motivoDenso, contagem{},
         avisos[]
       Retorno (ok:false): { ok:false, motivo:"<frase em PT-BR>" }
       ================================================================= */
    montar: function (r, opc) {
      opc = opc || {};
      var nivel = txt(opc.nivel) === "folha" ? "folha" : "etapa";
      var avisos = [];

      if (!r || typeof r !== "object") {
        return this._nao("Não recebi o cronograma. O fluxograma se monta sobre o resultado de Cronograma.estimar(orc, null, {eap: true}).");
      }
      if (!Array.isArray(r.etapas) || !r.etapas.length) {
        return this._nao("Este orçamento não tem etapa nenhuma — sem etapa não há rede para desenhar. Cadastre as etapas na aba Orçamento.");
      }
      if (nivel === "folha" && !Array.isArray(r.atividades)) {
        return this._nao("O nível “por subetapa” precisa da árvore EAP, e ela não veio no cronograma — chame Cronograma.estimar(orc, override, {eap: true}). O nível “por etapa” funciona sem ela.");
      }

      var G = {
        w: fin(opc.w) > 0 ? fin(opc.w) : GEO.w,
        h: fin(opc.h) > 0 ? fin(opc.h) : GEO.h,
        gapX: fin(opc.gapX) > 0 ? fin(opc.gapX) : GEO.gapX,
        gapY: fin(opc.gapY) > 0 ? fin(opc.gapY) : GEO.gapY,
        /* ⚠ `>= 0` sozinho aceitava o `undefined` de quem não passou nada:
           `fin(undefined)` é 0, 0 >= 0 é true, e a margem padrão virava zero —
           a caixa nascia colada na borda da folha e a seta de entrada do
           primeiro nó ficava fora do papel. Ausente ≠ zero. */
        margem: (opc.margem != null && fin(opc.margem) >= 0) ? fin(opc.margem) : GEO.margem
      };

      var montado = nivel === "folha" ? this._nosFolha(r, avisos) : this._nosEtapa(r, avisos);
      var nos = montado.nos, elos = montado.elos;
      if (!nos.length) {
        return this._nao(nivel === "folha"
          ? "Nenhuma subetapa com serviço neste orçamento — não há nó para desenhar no nível “por subetapa”. Use o nível “por etapa”."
          : "Nenhuma etapa aproveitável neste orçamento.");
      }

      /* ⚠ ID REPETIDO NÃO PODE PASSAR CALADO. Todo o resto deste arquivo
         endereça nó por id (`porId`, camada, ordem da camada, roteamento). Um
         id repetido — duas subetapas com a mesma chave, o que um orçamento
         copiado de outro produz — faria a MESMA caixa ser posicionada duas
         vezes, a segunda posição apagando a primeira, e o desenho sairia com
         uma caixa a menos e setas apontando para o lugar errado, sem uma
         palavra. Fica a primeira, e o retorno diz quantas caíram. */
      var porId = {}, repetidos = [];
      nos = nos.filter(function (n) {
        if (own(porId, n.id)) { repetidos.push(n.id); return false; }
        porId[n.id] = n; return true;
      });
      if (repetidos.length) avisos.push({ tipo: "id-repetido", ids: repetidos.slice(0, 12), quantidade: repetidos.length,
        msg: repetidos.length + " nó(s) deste orçamento têm o MESMO código de outro e ficaram de fora do desenho (o primeiro de cada par ficou). Isso costuma vir de etapa ou subetapa copiada — confira a EAP antes de usar este fluxograma para decidir sequência." });
      // elo para nó que não existe neste nível morre em silêncio: rede podre
      // não pode derrubar o desenho (a mesma régua do motor com dependência
      // apagada). Mas o motor já limpa isso — se aparecer, é defeito novo.
      elos = elos.filter(function (e) { return own(porId, e.de) && own(porId, e.para) && e.de !== e.para; });

      /* ---- camadas (ver o ⚠ do cabeçalho) ---- */
      var cam = this._camadas(nos, elos, porId, avisos);
      nos.forEach(function (n) { n.camada = cam.camada[n.id]; });

      /* ---- grau, caminhos, alcance ---- */
      this._contarRede(nos, elos, porId, cam.ordem, avisos);

      /* ---- ordem dentro da camada + redução de cruzamento ---- */
      var maxC = 0;
      nos.forEach(function (n) { if (n.camada > maxC) maxC = n.camada; });
      var ordemCam = [], ci;
      for (ci = 0; ci <= maxC; ci++) ordemCam.push([]);
      // ordem inicial: a ordem de entrada (numeração EAP), que é a ordem em
      // que a pessoa escreveu o orçamento — começar por ela deixa o desenho
      // parecido com a planilha que ela conhece.
      nos.forEach(function (n) { ordemCam[n.camada].push(n.id); });

      var reduzir = opc.reduzir !== false;
      var passadas = fin(opc.passadas) > 0 ? Math.min(20, Math.round(fin(opc.passadas))) : 4;
      var antes = this._cruzamentos(ordemCam, elos, porId, G);
      var cruz = { regua: "segmentos reta centro-a-centro das arestas, pares que se cruzam de verdade (ponta comum não conta)",
        medido: antes.n !== null, antes: antes.n, depois: antes.n,
        passadas: 0, revertido: false, motivo: antes.motivo };
      if (reduzir) {
        var inicial = ordemCam.map(function (c) { return c.slice(); });
        for (var p = 0; p < passadas; p++) {
          this._medianas(ordemCam, elos, porId, true);   // ida: pela posição das predecessoras
          this._medianas(ordemCam, elos, porId, false);  // volta: pela posição das sucessoras
        }
        cruz.passadas = passadas;
        /* ⚠ MEDIANA PODE PIORAR. A heurística é só heurística: em rede com
           elo longo ela às vezes entrega um desenho com MAIS cruzamento que a
           ordem crua. Medir e voltar atrás é barato; entregar pior calado
           seria o "conserto que abre defeito novo".
           ⚠ E QUANDO NÃO DÁ PARA MEDIR, A PASSADA RODA ASSIM MESMO — mas o
           retorno DIZ que não mediu (`medido: false`), em vez de publicar um
           "antes → depois" inventado. A rede grande é justamente onde a
           mediana mais ajuda (MEDIDO em 12/09/2026: 190 → 46 cruzamentos em
           85 nós, 1.501 → 209 em 300); o que se perde acima do teto de pares
           é só a rede de segurança do "voltar atrás", e isso vai escrito. */
        if (cruz.medido) {
          var depois = this._cruzamentos(ordemCam, elos, porId, G);
          if (depois.n !== null && depois.n > antes.n) {
            for (ci = 0; ci <= maxC; ci++) ordemCam[ci] = inicial[ci];
            cruz.depois = antes.n; cruz.revertido = true;
          } else cruz.depois = depois.n === null ? antes.n : depois.n;
        }
      }

      /* ---- posição ---- */
      var maiorCam = 0;
      ordemCam.forEach(function (c) { if (c.length > maiorCam) maiorCam = c.length; });
      var alturaMiolo = maiorCam * G.h + Math.max(0, maiorCam - 1) * G.gapY;
      ordemCam.forEach(function (c, iCam) {
        var alt = c.length * G.h + Math.max(0, c.length - 1) * G.gapY;
        // camada centrada na vertical: numa rede-corrente (o caso da casa)
        // isso deixa o fluxo numa linha reta, que é como se lê um macrofluxo
        var off = G.margem + (alturaMiolo - alt) / 2;
        c.forEach(function (id, iLin) {
          var n = porId[id];
          n.linha = iLin;
          n.x = G.margem + iCam * (G.w + G.gapX);
          n.y = off + iLin * (G.h + G.gapY);
          n.w = G.w; n.h = G.h;
        });
      });

      /* ---- caminho de cada aresta (ortogonal, com desvio) ---- */
      var rota = this._rotear(nos, elos, porId, G);
      var arestas = rota.arestas;

      var largura = G.margem, altura = G.margem;
      nos.forEach(function (n) {
        if (n.x + n.w + G.margem > largura) largura = n.x + n.w + G.margem;
        if (n.y + n.h + G.margem > altura) altura = n.y + n.h + G.margem;
      });
      // canal de desvio que passou por fora das caixas estica a folha
      if (rota.maxY + G.margem > altura) altura = rota.maxY + G.margem;
      if (rota.minY - G.margem < 0) {
        var desce = G.margem - rota.minY;
        nos.forEach(function (n) { n.y += desce; });
        arestas.forEach(function (a) { a.pontos.forEach(function (pt) { pt.y += desce; }); });
        altura += desce;
      }
      largura = Math.round(largura); altura = Math.round(altura);

      /* ---- camadas publicadas ---- */
      var camadas = ordemCam.map(function (c, i) {
        return { indice: i, nos: c.length, ids: c.slice() };
      });

      /* ---- leituras da rede ---- */
      var maxG = fin(opc.maxGargalos) > 0 ? Math.round(fin(opc.maxGargalos)) : 10;
      var limConv = fin(opc.limiarConvergencia) >= 2 ? Math.round(fin(opc.limiarConvergencia)) : 3;
      var gargalos = ordenar(nos.filter(function (n) { return n.caminhos > 1; }), function (n) {
        return -n.caminhos;
      }).slice(0, maxG).map(function (n) {
        return { id: n.id, numero: n.numero, nome: n.nome, caminhos: n.caminhos,
          aproximado: !!n.caminhosAproximado, entradas: n.entradas, saidas: n.saidas,
          antecessores: n.antecessores, sucessores: n.sucessores, camada: n.camada };
      });
      if (!gargalos.length) {
        /* ⚠ LISTA VAZIA PRECISA DIZER POR QUE ESTÁ VAZIA. "Nenhum gargalo" lê-se
           como "a rede está boa"; aqui quase sempre significa "a rede é uma
           corrente, porque ninguém declarou predecessora" — que é um recado
           completamente diferente e é o que faz a pessoa ir declarar a rede. */
        var semRede = nos.filter(function (n) { return n.predsExplicito === false; }).length;
        avisos.push({ tipo: "sem-gargalo", nos: nos.length, semRede: semRede,
          msg: "Nenhum nó concentra mais de um caminho: esta rede é uma corrente (" + nos.length + " nó(s), um atrás do outro)" +
            (semRede ? " — " + semRede + " deles seguem a sequência automática, sem “Depende de” declarado" : "") +
            ". Gargalo só existe onde caminhos se separam e voltam a se juntar; declare as dependências reais para o macrofluxo ter o que mostrar." });
      }
      var convergencias = nos.filter(function (n) { return n.entradas >= limConv; }).map(function (n) {
        return { id: n.id, numero: n.numero, nome: n.nome, entradas: n.entradas, camada: n.camada };
      });
      var divergencias = nos.filter(function (n) { return n.saidas >= limConv; }).map(function (n) {
        return { id: n.id, numero: n.numero, nome: n.nome, saidas: n.saidas, camada: n.camada };
      });

      /* ---- densidade ---- */
      var L = { nos: LIM.nos, camada: LIM.camada, largura: LIM.largura, altura: LIM.altura };
      if (opc.limites) {
        if (fin(opc.limites.nos) > 0) L.nos = fin(opc.limites.nos);
        if (fin(opc.limites.camada) > 0) L.camada = fin(opc.limites.camada);
        if (fin(opc.limites.largura) > 0) L.largura = fin(opc.limites.largura);
        if (fin(opc.limites.altura) > 0) L.altura = fin(opc.limites.altura);
      }
      var den = this._denso(nos.length, maiorCam, largura, altura, L, nivel);

      var out = {
        ok: true, nivel: nivel,
        // ordem de leitura: coluna a coluna, de cima para baixo. Duas chaves
        // separadas, nunca `camada * 100000 + linha` — número mágico que
        // colapsa em silêncio no dia em que uma camada tiver nós demais.
        nos: nos.slice().sort(function (a, b) { return a.camada !== b.camada ? a.camada - b.camada : a.linha - b.linha; }),
        arestas: arestas, camadas: camadas,
        caminhoCritico: nos.filter(function (n) { return n.critico; })
          .sort(function (a, b) { return a.camada !== b.camada ? a.camada - b.camada : a.linha - b.linha; })
          .map(function (n) { return n.id; }),
        gargalos: gargalos, convergencias: convergencias, divergencias: divergencias,
        largura: largura, altura: altura, cruzamentos: cruz,
        denso: den.denso, motivoDenso: den.motivo,
        contagem: { nos: nos.length, arestas: arestas.length, camadas: camadas.length,
          maiorCamada: maiorCam, desvios: rota.desvios, derivadas: rota.derivadas },
        avisos: avisos
      };
      return out;
    },

    _nao: function (motivo) { return { ok: false, motivo: motivo, nos: [], arestas: [], camadas: [], avisos: [] }; },

    /* ---------------------------------------------------------------
       NÍVEL ETAPA — um nó por etapa; os elos são os do motor.
       `r.atividades` é a fonte preferida (traz numero EAP, opcional e cor);
       sem ela cai em `r.etapas`, que é o que a aba já desenhava desde
       sempre, e AVISA que a numeração saiu por posição.
       --------------------------------------------------------------- */
    _nosEtapa: function (r, avisos) {
      var self = this, nos = [], elos = [], porEap = {};
      if (Array.isArray(r.atividades)) {
        r.atividades.forEach(function (n) { if (n && n.tipo === "etapa") porEap[n.id] = n; });
      } else {
        avisos.push({ tipo: "sem-eap",
          msg: "O cronograma veio sem a árvore EAP: o fluxograma numerou as etapas pela posição na lista e não sabe quais são opcionais. Para o desenho completo, chame Cronograma.estimar(orc, override, {eap: true})." });
      }
      r.etapas.forEach(function (et, i) {
        var e = own(porEap, et.id) ? porEap[et.id] : null;
        nos.push(self._no(et, e, String(i + 1), "etapa", et.id));
      });
      r.etapas.forEach(function (et) {
        arr(et.preds).forEach(function (pid) {
          elos.push({ de: pid, para: et.id,
            tipo: (et.predTipo && et.predTipo[pid]) ? txt(et.predTipo[pid]) : "TI",
            lag: (et.predLag && own(et.predLag, pid)) ? fin(et.predLag[pid]) : null,
            desloc: (et.predDesloc && own(et.predDesloc, pid)) ? fin(et.predDesloc[pid]) : null,
            derivada: false });
        });
      });
      return { nos: nos, elos: elos };
    },

    /* ---------------------------------------------------------------
       NÍVEL FOLHA — um nó por subetapa (e pelo grupo de serviços soltos);
       a etapa SEM subetapa entra como ela mesma, que é o que o motor já faz
       (`papel: "folha"`).

       ⚠ O ELO ENTRE ETAPAS É DERIVADO, E ISSO VAI MARCADO NA ARESTA. O motor
       só declara elo entre folhas da MESMA etapa (js/cronograma.js,
       `_redeInterna`); entre etapas o elo é de etapa. Explodir um elo de
       etapa em "toda folha final de A → toda folha inicial de B" produziria
       N×M arestas que ninguém desenhou — numa etapa de 10 subetapas para
       outra de 10 seriam 100 setas no lugar de 1, e a figura que existe para
       revelar gargalo passaria a inventar um. Então é UMA aresta: da folha
       que termina por último em A para a que começa primeiro em B, com
       `derivada: true` e `viaEtapa` dizendo de que elo de etapa ela nasceu.
       Quem desenha pode tracejá-la; quem lê sabe que não foi a pessoa que a
       desenhou.
       --------------------------------------------------------------- */
    _nosFolha: function (r, avisos) {
      var self = this, nos = [], elos = [], filhos = {}, porEt = {}, etDe = {}, porAt = {};
      r.etapas.forEach(function (et) { porEt[et.id] = et; });
      r.atividades.forEach(function (n) {
        if (!n) return;
        porAt[n.id] = n;
        if (n.tipo === "subetapa" || n.tipo === "soltos") {
          if (!own(filhos, n.paiId)) filhos[n.paiId] = [];
          filhos[n.paiId].push(n);
        }
      });
      r.etapas.forEach(function (et, i) {
        var fs = own(filhos, et.id) ? filhos[et.id] : [];
        if (!fs.length) {
          var e = own(porAt, et.id) ? porAt[et.id] : null;
          var noE = self._no(et, e, String(i + 1), "etapa", et.id);
          nos.push(noE); etDe[et.id] = { entradas: [noE], saidas: [noE] };
          return;
        }
        var lista = fs.map(function (f) { return self._no(null, f, f.numero, f.tipo, et.id); });
        lista.forEach(function (x) { nos.push(x); });
        // elos internos: o motor já os resolveu entre irmãos
        fs.forEach(function (f) {
          arr(f.preds).forEach(function (pid) {
            elos.push({ de: pid, para: f.id,
              tipo: (f.predTipo && f.predTipo[pid]) ? txt(f.predTipo[pid]) : "TI",
              lag: (f.predLag && own(f.predLag, pid)) ? fin(f.predLag[pid]) : null,
              desloc: (f.predDesloc && own(f.predDesloc, pid)) ? fin(f.predDesloc[pid]) : null,
              derivada: false });
          });
        });
        var temPred = {}, temSuc = {};
        fs.forEach(function (f) { arr(f.preds).forEach(function (pid) { temPred[f.id] = 1; temSuc[pid] = 1; }); });
        var entr = fs.filter(function (f) { return !own(temPred, f.id); });
        var said = fs.filter(function (f) { return !own(temSuc, f.id); });
        if (!entr.length) entr = fs.slice();   // ciclo interno: sem raiz, vale qualquer uma
        if (!said.length) said = fs.slice();
        etDe[et.id] = {
          entradas: ordenar(entr, function (f) { return fin(f.inicio); }),
          saidas: ordenar(said, function (f) { return -fin(f.fim); })
        };
      });
      var derivadas = 0;
      r.etapas.forEach(function (et) {
        arr(et.preds).forEach(function (pid) {
          if (!own(etDe, pid) || !own(etDe, et.id)) return;
          var de = etDe[pid].saidas[0], para = etDe[et.id].entradas[0];
          if (!de || !para || de.id === para.id) return;
          derivadas++;
          elos.push({ de: de.id, para: para.id,
            tipo: (et.predTipo && et.predTipo[pid]) ? txt(et.predTipo[pid]) : "TI",
            lag: (et.predLag && own(et.predLag, pid)) ? fin(et.predLag[pid]) : null,
            desloc: (et.predDesloc && own(et.predDesloc, pid)) ? fin(et.predDesloc[pid]) : null,
            derivada: true, viaEtapa: { de: pid, para: et.id } });
        });
      });
      if (derivadas) avisos.push({ tipo: "elo-derivado", quantidade: derivadas,
        msg: derivadas + " seta(s) deste desenho não foram declaradas por ninguém: elas traduzem o elo ENTRE ETAPAS para o nível de subetapa, ligando a que termina por último à que começa primeiro. Elas vêm marcadas (derivada) — o elo real está no nível “por etapa”." });
      return { nos: nos, elos: elos };
    },

    /* Um nó do layout. `et` = a etapa de `r.etapas` (ou null); `a` = o nó da
       árvore EAP (ou null). Tudo COPIADO; nada recalculado.
       ⚠ `folga` e `critico` são INTERNOS — ver RESTRITOS e o ⚠ do cabeçalho. */
    _no: function (et, a, numero, tipo, etapaId) {
      var f = a || et || {};
      var no = {
        id: txt(f.id), numero: txt((a && a.numero) || numero), nome: txt(f.nome),
        tipo: tipo, etapaId: txt(etapaId),
        camada: 0, linha: 0, x: 0, y: 0, w: 0, h: 0,
        duracao: fin(f.duracao), inicio: fin(f.inicio), fim: fin(f.fim),
        dataInicio: f.dataInicio instanceof Date ? new Date(f.dataInicio.getTime()) : null,
        dataFim: f.dataFim instanceof Date ? new Date(f.dataFim.getTime()) : null,
        folga: fin(f.folga),
        critico: !!f.critico,
        marco: !!f.marco,
        opcional: a ? !!a.opcional : null,
        foraDoPrazo: !!f.foraDoPrazo,
        cat: { id: txt(f.categoria || ""), nome: txt(f.categoriaNome || ""), cor: txt(f.cor || "") },
        predsExplicito: f.predsExplicito === true,
        entradas: 0, saidas: 0, caminhos: 0, caminhosAproximado: false,
        antecessores: 0, sucessores: 0
      };
      /* ciclo e restrição de data são recados do motor: o desenho os mostra,
         mas nunca os inventa (`cicloDep` e `restricao` só existem quando o
         motor os pôs — no caminho de sempre são undefined) */
      if (f.cicloDep) no.cicloDep = true;
      if (f.restricao) no.restricao = { tipo: txt(f.restricao.tipo), data: txt(f.restricao.data),
        ativa: !!f.restricao.ativa, estourada: !!f.restricao.estourada };
      return no;
    },

    /* ---------------------------------------------------------------
       CAMADAS. Kahn só para varrer (ver PENDÊNCIA 1); a camada em si é o
       caminho mais longo em elos até o nó — função só do grafo.
       ⚠ CICLO NÃO PODE TRAVAR O DESENHO, pela mesma razão que ele não trava o
       motor: um "Depende de" circular é erro de digitação, não motivo para a
       aba do orçamento sumir. Quem sobra do Kahn entra depois, ignorando o
       elo de volta, e o elo que fechou o ciclo sai marcado.
       --------------------------------------------------------------- */
    _camadas: function (nos, elos, porId, avisos) {
      var indeg = {}, suc = {}, pred = {}, ordem = [], fila = [];
      nos.forEach(function (n) { indeg[n.id] = 0; suc[n.id] = []; pred[n.id] = []; });
      elos.forEach(function (e) { indeg[e.para]++; suc[e.de].push(e.para); pred[e.para].push(e.de); });
      nos.forEach(function (n) { if (!indeg[n.id]) fila.push(n.id); });
      var vistos = {};
      while (fila.length) {
        var id = fila.shift(); ordem.push(id); vistos[id] = 1;
        suc[id].forEach(function (s) { if (--indeg[s] === 0) fila.push(s); });
      }
      var presos = [];
      if (ordem.length < nos.length) {
        nos.forEach(function (n) { if (!own(vistos, n.id)) { ordem.push(n.id); presos.push(n.id); } });
        avisos.push({ tipo: "ciclo", nos: presos.slice(0, 12), quantidade: presos.length,
          msg: "Dependência circular: " + presos.length + " nó(s) formam um laço no “Depende de” e foram desenhados ignorando o elo de volta. Corrija a dependência — enquanto o laço existir, a camada deles no fluxograma é uma aproximação." });
      }
      var camada = {};
      ordem.forEach(function (id) {
        var c = 0;
        pred[id].forEach(function (p) { if (camada[p] != null && camada[p] + 1 > c) c = camada[p] + 1; });
        camada[id] = c;
      });
      return { camada: camada, ordem: ordem, suc: suc, pred: pred, presos: presos };
    },

    /* ---------------------------------------------------------------
       GRAU, CAMINHOS E ALCANCE.
       `caminhos[n]` = quantos caminhos início→fim passam por n = (caminhos
       que chegam em n) × (caminhos que saem de n). É a conta que responde
       "por onde passa mais obra" — a leitura que o Gantt esconde atrás das
       setas cruzadas.
       `antecessores`/`sucessores` = quantos nós ALCANÇAM n e quantos n
       alcança. É outra grandeza (não é caminho: é quantidade de nó), tem
       nome próprio e existe porque a contagem de caminhos pode estourar o
       teto — ela não estoura nunca (o máximo é N).
       --------------------------------------------------------------- */
    _contarRede: function (nos, elos, porId, ordem, avisos) {
      var suc = {}, pred = {};
      nos.forEach(function (n) { suc[n.id] = []; pred[n.id] = []; });
      elos.forEach(function (e) { suc[e.de].push(e.para); pred[e.para].push(e.de); });
      nos.forEach(function (n) { n.entradas = pred[n.id].length; n.saidas = suc[n.id].length; });

      var entra = {}, sai = {}, estourou = false;
      function teto(v) { if (v > TETO_CAMINHOS) { estourou = true; return TETO_CAMINHOS; } return v; }
      ordem.forEach(function (id) {
        var v = 0;
        pred[id].forEach(function (p) { v += (entra[p] == null ? 0 : entra[p]); });
        entra[id] = teto(pred[id].length ? v : 1);
      });
      for (var i = ordem.length - 1; i >= 0; i--) {
        var id2 = ordem[i], v2 = 0;
        suc[id2].forEach(function (s) { v2 += (sai[s] == null ? 0 : sai[s]); });
        sai[id2] = teto(suc[id2].length ? v2 : 1);
      }
      nos.forEach(function (n) {
        n.caminhos = teto(entra[n.id] * sai[n.id]);
        n.caminhosAproximado = n.caminhos >= TETO_CAMINHOS;
      });
      if (estourou) avisos.push({ tipo: "caminhos-estourados", teto: TETO_CAMINHOS,
        msg: "Esta rede tem mais de " + TETO_CAMINHOS + " caminhos distintos — a contagem por nó foi limitada a esse teto e os nós marcados “aproximado” estão EMPATADOS no limite, não necessariamente iguais. A ordem dos gargalos, nesse caso, não é confiável: leia por antecessores/sucessores." });

      /* alcance por bitset (Uint32Array quando existe; sem ele, objeto).
         ⚠ O custo é N²/32 em memória: 2.400 nós dão ~1,4 MB, 10.000 dariam
         25 MB e o navegador do cliente engasgaria. Acima do teto o campo sai
         ZERADO e o aviso DIZ que não foi medido — campo zerado calado seria
         "não tem" no lugar de "não deu para conferir". */
      var N = nos.length, TETO_ALCANCE = 3000;
      if (N > TETO_ALCANCE) {
        avisos.push({ tipo: "alcance-nao-medido", nos: N, teto: TETO_ALCANCE,
          msg: "Rede com " + N + " nós: os campos “antecessores” e “sucessores” não foram medidos (acima de " + TETO_ALCANCE + " nós a conta custaria memória demais no aparelho do cliente) e ficaram em 0 — isso é “não medido”, não “nenhum”." });
        return;
      }
      var W = Math.ceil(N / 32) || 1, idx = {}, k;
      nos.forEach(function (n, i) { idx[n.id] = i; });
      var TA = (typeof Uint32Array !== "undefined") ? new Uint32Array(N * W) : null;
      var TD = (typeof Uint32Array !== "undefined") ? new Uint32Array(N * W) : null;
      if (!TA) {
        TA = []; TD = [];
        for (k = 0; k < N * W; k++) { TA[k] = 0; TD[k] = 0; }
      }
      // antecessores: varre na ordem topológica (predecessora já resolvida)
      ordem.forEach(function (id) {
        var i = idx[id], base = i * W;
        pred[id].forEach(function (p) {
          var j = idx[p], b2 = j * W, w;
          for (w = 0; w < W; w++) TA[base + w] |= TA[b2 + w];
          TA[base + (j >> 5)] |= (1 << (j & 31));
        });
      });
      for (var q = ordem.length - 1; q >= 0; q--) {
        var idq = ordem[q], iq = idx[idq], bq = iq * W;
        suc[idq].forEach(function (s) {
          var j2 = idx[s], b3 = j2 * W, w2;
          for (w2 = 0; w2 < W; w2++) TD[bq + w2] |= TD[b3 + w2];
          TD[bq + (j2 >> 5)] |= (1 << (j2 & 31));
        });
      }
      function bits(T, i) {
        var base = i * W, c = 0, w, v;
        for (w = 0; w < W; w++) {
          v = T[base + w];
          while (v) { v &= v - 1; c++; }
        }
        return c;
      }
      nos.forEach(function (n, i) { n.antecessores = bits(TA, i); n.sucessores = bits(TD, i); });
    },

    /* ---------------------------------------------------------------
       MEDIANA (baricentro) — a passada que reduz cruzamento.
       Cada nó recebe a MEDIANA das posições normalizadas das suas
       predecessoras (ida) ou sucessoras (volta); a camada é reordenada por
       essa chave, de forma estável. Nó sem vizinho do lado varrido fica onde
       está (chave = a própria posição), senão ele "cairia" para o começo da
       camada só por não ter elo — e desenho que se move sozinho sem motivo é
       exatamente o que faz alguém desconfiar do sistema inteiro.
       --------------------------------------------------------------- */
    _medianas: function (ordemCam, elos, porId, ida) {
      var pos = {}, viz = {};
      ordemCam.forEach(function (c) {
        c.forEach(function (id, i) { pos[id] = c.length > 1 ? (i + 0.5) / c.length : 0.5; });
      });
      elos.forEach(function (e) {
        var alvo = ida ? e.para : e.de, fonte = ida ? e.de : e.para;
        if (!own(viz, alvo)) viz[alvo] = [];
        viz[alvo].push(fonte);
      });
      var inicio = ida ? 1 : ordemCam.length - 2;
      var passo = ida ? 1 : -1;
      for (var c = inicio; c >= 0 && c < ordemCam.length; c += passo) {
        ordemCam[c] = ordenar(ordemCam[c], function (id) {
          var vs = own(viz, id) ? viz[id] : [];
          if (!vs.length) return pos[id];
          var ps = vs.map(function (v) { return pos[v] == null ? 0.5 : pos[v]; })
            .sort(function (a, b) { return a - b; });
          var m = ps.length >> 1;
          return ps.length % 2 ? ps[m] : (ps[m - 1] + ps[m]) / 2;
        });
        // reposiciona para a próxima camada já ler a ordem nova
        ordemCam[c].forEach(function (id, i) { pos[id] = ordemCam[c].length > 1 ? (i + 0.5) / ordemCam[c].length : 0.5; });
      }
    },

    /* ---------------------------------------------------------------
       CRUZAMENTOS — a RÉGUA vai declarada no retorno.
       Conta pares de arestas cujos segmentos RETA centro-a-centro se cruzam
       de verdade (interseção própria). Ponta em comum não conta: duas setas
       que saem do mesmo nó se encostam ali por construção, e contá-las
       inflaria o número sem que a figura ficasse pior.
       ⚠ É a régua do SEGMENTO RETO, não do caminho ortogonal que sai em
       `pontos` — medir o caminho ortogonal misturaria o mérito da ordenação
       com o do roteamento, e a passada de mediana só mexe na ordenação. A
       régua está no retorno para ninguém comparar este número com outro.
       Acima do teto de pares a conta não roda e o campo volta `null` com o
       motivo — nunca um zero que se lê como "não há cruzamento".
       --------------------------------------------------------------- */
    _cruzamentos: function (ordemCam, elos, porId, G) {
      var pos = {}, i, j;
      ordemCam.forEach(function (c, iCam) {
        var alt = c.length * G.h + Math.max(0, c.length - 1) * G.gapY;
        c.forEach(function (id, iLin) {
          pos[id] = { x: iCam * (G.w + G.gapX) + G.w / 2, y: -alt / 2 + iLin * (G.h + G.gapY) + G.h / 2 };
        });
      });
      var segs = [];
      elos.forEach(function (e) {
        var a = pos[e.de], b = pos[e.para];
        if (a && b) segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, de: e.de, para: e.para });
      });
      var TETO_PARES = 8e6;
      var pares = segs.length * (segs.length - 1) / 2;
      if (pares > TETO_PARES) {
        return { n: null,
          motivo: "rede com " + segs.length + " arestas (" + Math.round(pares / 1e6) + " milhões de pares): a contagem de cruzamentos não foi feita para não travar a tela — a passada de redução rodou, mas não há “antes → depois” medido. “null” aqui é “não medido”, nunca “zero”." };
      }
      var n = 0;
      for (i = 0; i < segs.length; i++) for (j = i + 1; j < segs.length; j++) {
        var s = segs[i], t = segs[j];
        if (s.de === t.de || s.de === t.para || s.para === t.de || s.para === t.para) continue;
        if (this._cruza(s, t)) n++;
      }
      return { n: n, motivo: null };
    },

    _cruza: function (s, t) {
      function ori(ax, ay, bx, by, cx, cy) {
        var v = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
        return v > 1e-9 ? 1 : (v < -1e-9 ? -1 : 0);
      }
      var o1 = ori(s.ax, s.ay, s.bx, s.by, t.ax, t.ay);
      var o2 = ori(s.ax, s.ay, s.bx, s.by, t.bx, t.by);
      var o3 = ori(t.ax, t.ay, t.bx, t.by, s.ax, s.ay);
      var o4 = ori(t.ax, t.ay, t.bx, t.by, s.bx, s.by);
      // só interseção PRÓPRIA: colinear encostando não é cruzamento visual
      return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
    },

    /* ---------------------------------------------------------------
       ROTEAMENTO ORTOGONAL.
       Sai pela direita do predecessor, entra pela esquerda do sucessor.
       Elo entre camadas VIZINHAS nunca precisa de desvio: o trecho vertical
       cai no vão entre as colunas, onde não há caixa.
       Elo LONGO (pula camada) atravessa colunas cheias. Aí o corredor é
       escolhido nesta ordem: a altura do sucessor, a do predecessor, e por
       fim um canal por fora (abaixo ou acima de tudo que estorva, o que
       estiver mais perto). Quando precisa do canal, `desvio: true` — a tela
       pode tracejar ou afinar a linha, e quem lê sabe que aquela seta deu a
       volta por causa do desenho, não por causa da obra.
       ⚠ Seta que passa POR CIMA de uma caixa é o defeito clássico do
       desenho em camadas: a pessoa lê uma dependência que não existe (a
       linha "encosta" na caixa errada) e replaneja a obra por causa disso.
       --------------------------------------------------------------- */
    _rotear: function (nos, elos, porId, G) {
      var arestas = [], desvios = 0, derivadas = 0;
      var minY = Infinity, maxY = -Infinity;
      var self = this;
      nos.forEach(function (n) {
        if (n.y < minY) minY = n.y;
        if (n.y + n.h > maxY) maxY = n.y + n.h;
      });
      function bloqueia(y, x1, x2, idA, idB) {
        var xa = Math.min(x1, x2), xb = Math.max(x1, x2), i, n;
        for (i = 0; i < nos.length; i++) {
          n = nos[i];
          if (n.id === idA || n.id === idB) continue;
          if (n.x + n.w <= xa + 0.001 || n.x >= xb - 0.001) continue;
          if (y > n.y - 1 && y < n.y + n.h + 1) return true;
        }
        return false;
      }
      function extremos(x1, x2, idA, idB) {
        var xa = Math.min(x1, x2), xb = Math.max(x1, x2), topo = Infinity, base = -Infinity, i, n;
        for (i = 0; i < nos.length; i++) {
          n = nos[i];
          if (n.id === idA || n.id === idB) continue;
          if (n.x + n.w <= xa + 0.001 || n.x >= xb - 0.001) continue;
          if (n.y < topo) topo = n.y;
          if (n.y + n.h > base) base = n.y + n.h;
        }
        return { topo: topo, base: base };
      }
      elos.forEach(function (e) {
        var u = porId[e.de], v = porId[e.para];
        var uy = u.y + u.h / 2, vy = v.y + v.h / 2;
        var x0 = u.x + u.w, x3 = v.x;
        var a = { de: e.de, para: e.para, tipo: e.tipo || "TI",
          lag: e.lag == null ? null : e.lag, desloc: e.desloc == null ? null : e.desloc,
          critico: !!(u.critico && v.critico),
          derivada: !!e.derivada, desvio: false,
          camadaDe: u.camada, camadaPara: v.camada, pontos: [] };
        if (e.viaEtapa) a.viaEtapa = e.viaEtapa;
        if (e.derivada) derivadas++;
        /* elo de VOLTA (o que o ciclo deixou): o sucessor está à esquerda ou
           na mesma coluna. Sai pela direita, desce por fora de tudo e volta —
           é a forma que a literatura de desenho de rede usa, e é o que faz o
           laço saltar aos olhos em vez de virar uma seta reta mentirosa. */
        if (v.camada <= u.camada) {
          a.cicloDep = true; a.desvio = true; desvios++;
          var canal = maxY + G.gapY;
          maxY = canal;
          a.pontos = [ { x: x0, y: uy }, { x: x0 + G.gapX / 2, y: uy }, { x: x0 + G.gapX / 2, y: canal },
            { x: v.x - G.gapX / 2, y: canal }, { x: v.x - G.gapX / 2, y: vy }, { x: x3, y: vy } ];
          arestas.push(a);
          return;
        }
        if (v.camada === u.camada + 1) {
          if (Math.abs(uy - vy) < 0.001) a.pontos = [ { x: x0, y: uy }, { x: x3, y: vy } ];
          else {
            var mx = (x0 + x3) / 2;
            a.pontos = [ { x: x0, y: uy }, { x: mx, y: uy }, { x: mx, y: vy }, { x: x3, y: vy } ];
          }
          arestas.push(a);
          return;
        }
        var mx1 = x0 + G.gapX / 2, mx2 = x3 - G.gapX / 2;
        if (!bloqueia(vy, x0, mx2, u.id, v.id)) {
          a.pontos = Math.abs(uy - vy) < 0.001
            ? [ { x: x0, y: uy }, { x: x3, y: vy } ]
            : [ { x: x0, y: uy }, { x: mx1, y: uy }, { x: mx1, y: vy }, { x: x3, y: vy } ];
          arestas.push(a); return;
        }
        if (!bloqueia(uy, mx1, x3, u.id, v.id)) {
          a.pontos = [ { x: x0, y: uy }, { x: mx2, y: uy }, { x: mx2, y: vy }, { x: x3, y: vy } ];
          arestas.push(a); return;
        }
        var ex = extremos(x0, x3, u.id, v.id);
        var porBaixo = ex.base + G.gapY / 2, porCima = ex.topo - G.gapY / 2;
        var meio = (uy + vy) / 2;
        var cy = (Math.abs(porBaixo - meio) <= Math.abs(meio - porCima)) ? porBaixo : porCima;
        if (cy > maxY) maxY = cy;
        if (cy < minY) minY = cy;
        a.desvio = true; desvios++;
        a.pontos = [ { x: x0, y: uy }, { x: mx1, y: uy }, { x: mx1, y: cy },
          { x: mx2, y: cy }, { x: mx2, y: vy }, { x: x3, y: vy } ];
        arestas.push(a);
      });
      return { arestas: arestas, desvios: desvios, derivadas: derivadas,
        minY: minY === Infinity ? 0 : minY, maxY: maxY === -Infinity ? 0 : maxY };
    },

    /* ---------------------------------------------------------------
       DENSIDADE — ver o ⚠ do cabeçalho. O layout SEMPRE vem; o que muda é a
       etiqueta. `motivo` diz o número medido e o número do limite (número a
       pessoa confere; "muito grande" ela lê como formalidade) e diz a PORTA:
       trocar para o nível "etapa". ⚠ Trava sem porta é o que faz a pessoa
       procurar uma saída errada.
       --------------------------------------------------------------- */
    _denso: function (qtdNos, maiorCam, largura, altura, L, nivel) {
      var razoes = [];
      if (qtdNos > L.nos) razoes.push(qtdNos + " caixas (o limite de leitura é " + L.nos + ")");
      if (maiorCam > L.camada) razoes.push(maiorCam + " caixas empilhadas na mesma coluna (o limite é " + L.camada + ")");
      if (largura > L.largura) razoes.push(largura + " px de largura (o limite é " + L.largura + ")");
      if (altura > L.altura) razoes.push(altura + " px de altura (o limite é " + L.altura + ")");
      if (!razoes.length) return { denso: false, motivo: null };
      var porta = nivel === "folha"
        ? " Desenhe no nível “por etapa”: a rede continua a mesma, com uma caixa por etapa."
        : " Imprima em folha maior, ou filtre o orçamento — no nível “por etapa” já não há como resumir mais.";
      return { denso: true,
        motivo: "Este macrofluxo sai ilegível: " + razoes.join("; ") + "." + porta };
    }
  };

  global.Fluxograma = Fluxograma;
  if (typeof module !== "undefined" && module.exports) module.exports = Fluxograma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
