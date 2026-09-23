/* =====================================================================
 * centrocusto.js — O CADASTRO DOS CENTROS DE CUSTO, COMO MOTOR PURO.
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * Hoje o "Realizado" de um centro de custo é uma ESTIMATIVA: a tela pega a
 * despesa da obra inteira e divide entre os centros na proporção do orçado
 * (js/gestao.js, renderCentrocusto). Dois centros na mesma obra, um com
 * R$ 200.000 orçados e outro com R$ 100.000, recebem 2/3 e 1/3 de TODA a
 * despesa — inclusive da despesa que pertence inteira a um deles. O número
 * tem cara de medição e é um rateio.
 *
 * ⚠ E ISSO NÃO É UM DETALHE DE RELATÓRIO. É a tela em que alguém decide se
 * ainda há saldo. "Fundação: orçado 200k, realizado 90k" convida a gastar
 * quando os 90k podem ser 150k de fundação e 30k de outra coisa.
 *
 * O QUE MUDA
 * O centro passa a ter IDENTIDADE (de qual nó do orçamento ele nasceu) e uma
 * forma declarada de contar (`apura`). Com isso o dinheiro chega ao centro
 * por VÍNCULO (o item medido, o pedido, a etapa do lançamento), por REGRA ou
 * por DECISÃO da pessoa — nunca por semelhança de descrição, valor ou data.
 *
 * ⚠ QUEM JÁ USA OS CENTROS ANTIGOS NÃO PODE VER O NÚMERO MUDAR SOZINHO.
 * Uma instalação com dois centros antigos numa obra continua dividindo pelo
 * orçado, agora ROTULADO como estimativa, até a pessoa converter — de
 * propósito, com prévia e com os números de antes e de depois na tela. Por
 * isso existe `modoDaObra`: o modo é lido da LISTA, nunca de uma decisão
 * avulsa. Uma decisão de apropriação que zerasse os centros antigos da obra
 * seria a pior forma de quebrar isso: silenciosa e no meio de outra tarefa.
 *
 * ⚠ POR QUE ELE É PURO (sem DOM, sem Store, sem Util)
 * Mesmo motivo do js/custoetapa.js: é conta que decide compra, e js/gestao.js
 * não entra no gate. Tudo chega por parâmetro; onde a régua de outro módulo
 * não chega, este arquivo pergunta por `typeof X !== "undefined"` na CHAMADA
 * e DIZ no aviso quando ela faltou — nunca inventa o número.
 *
 * ⚠ ESTE MOTOR NÃO GRAVA NADA. Todas as funções de escrita devolvem os
 * registros que a fiação deve gravar (`gravar`, `converter`, `desativar`…)
 * e nunca chamam `Store`. Quem grava é a tela, numa `Store.salvarVarios` só,
 * depois das guardas de dinheiro (skill `dinheiro`, §D20 da espec).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------
   * Utilidades locais
   * ---------------------------------------------------------------- */
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(s) { return String(s == null ? "" : s).trim(); }
  function obj(o) { return (o && typeof o === "object" && !Array.isArray(o)) ? o : null; }

  /* ⚠ NÃO EXISTE UMA TERCEIRA CÓPIA DO `Util.parseNum` AQUI, E É DE PROPÓSITO.
   * Esta base já tem 33 módulos replicando aquela regra, e duas das réplicas
   * erravam em direções opostas (uma lia "1.850.000" como 1,85; outra lia
   * "1234.56" como 123456) — as duas movendo dinheiro. Copiar de novo seria a
   * 34ª chance de divergir.
   * Aqui: número é número; string vem do `Util.num` REAL quando ele existe; e
   * texto que este motor não consegue ler com segurança vale 0 **com aviso**,
   * nunca com um palpite. */
  function num(v, opts) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null || v === "") return 0;
    var reg = (opts && typeof opts.num === "function") ? opts.num
      : ((typeof Util !== "undefined" && Util && typeof Util.num === "function") ? Util.num : null);
    if (reg) { var r = reg(v); return (typeof r === "number" && isFinite(r)) ? r : 0; }
    var s = String(v).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) { var n = parseFloat(s); return isFinite(n) ? n : 0; }
    return 0;
  }
  function ilegivel(v, opts) {
    if (v == null || v === "" || typeof v === "number") return false;
    if (opts && typeof opts.num === "function") return false;
    if (typeof Util !== "undefined" && Util && typeof Util.num === "function") return false;
    return !/^-?\d+(\.\d+)?$/.test(String(v).trim());
  }
  function cent(v, opts) { return Math.round(num(v, opts) * 100); }

  /* pt-BR na mão: o módulo é puro e não enxerga `Util` (o gate o roda em Node) */
  function fmt(v) {
    var n = Math.abs(num(v)), s = n.toFixed(2).split(".");
    return "R$ " + (num(v) < 0 ? "-" : "") + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1];
  }
  function fmtKB(bytes) {
    var kb = bytes / 1024;
    return (kb >= 100 ? Math.round(kb) : Math.round(kb * 10) / 10).toString().replace(".", ",") + " KB";
  }

  /* bytes UTF-8 de verdade: o Firestore conta bytes, não caracteres, e um
     nome de etapa com acento custa mais do que o `.length` diz. */
  function bytesDe(s) { return unescape(encodeURIComponent(String(s == null ? "" : s))).length; }
  function bytes(x) { return bytesDe(typeof x === "string" ? x : JSON.stringify(x === undefined ? null : x)); }

  /* ------------------------------------------------------------------
   * IDENTIDADE DO CENTRO GERADO
   *
   * ⚠ O ID DO CENTRO GERADO É DERIVADO, NÃO SORTEADO. Dois aparelhos offline
   * gerando os centros da mesma obra precisam produzir O MESMO id — senão a
   * nuvem devolve dois centros para o mesmo nó do orçamento, o dinheiro se
   * divide entre eles e nenhum dos dois mostra o gasto da etapa. É a mesma
   * doutrina do espelho de estorno (`est_<id>`, skill `dinheiro` §7).
   *
   * ⚠ A CHAVE USA A RAIZ DA CADEIA DE REVISÕES (`origem.r`), NÃO O ORÇAMENTO
   * DA GERAÇÃO. Revisar o orçamento (R1 → R2) tem de manter o MESMO centro,
   * com o histórico de gasto dele; duplicar o orçamento (outro trabalho, outra
   * raiz) tem de dar um centro novo. Se a chave usasse `origem.o`, passar a
   * obra para a revisão criaria centros novos e o realizado do ano sumiria da
   * tela sem nenhum aviso.
   * ---------------------------------------------------------------- */

  /* ⚠ RÉPLICA FIEL DO `CronoRede.hash` (FNV-1a 32 bits sobre os bytes UTF-8,
   * 8 hex — régua I11 da ESPEC do planejador). Ela está copiada aqui, e não
   * chamada de lá, por um motivo de dado: se o id dependesse de `CronoRede`
   * estar carregado, a MESMA obra geraria ids diferentes conforme a ordem de
   * carga dos arquivos (e o `js/cronorede.js` nem existe em todas as versões).
   * Id de centro que muda com a ordem de carga é centro duplicado na nuvem.
   * A paridade entre as duas é conferida por tools/test-centrocusto-motor.js
   * quando o arquivo existe na árvore — e, quando não existe, a suíte DIZ que
   * não conferiu, em vez de passar calada. */
  function fnv1a32hex(s) {
    var h = 0x811c9dc5, i, b = unescape(encodeURIComponent(String(s)));
    for (i = 0; i < b.length; i++) {
      h ^= b.charCodeAt(i);
      // multiplicação por 16777619 em 32 bits, sem Math.imul (WebView antigo)
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("0000000" + (h >>> 0).toString(16)).slice(-8);
  }
  /* djb2 sobre os mesmos bytes UTF-8, 8 hex. Segunda pista com constante e
     mistura diferentes: com 32 bits só, uma empresa com alguns milhares de
     centros já estaria no terreno do aniversário (~1 colisão em 65 mil nós).
     Com 64 bits a colisão sai do plausível — e, quando ainda assim acontecer,
     `aplicarPrevia` RECUSA em voz alta em vez de sobrescrever. */
  function djb2hex(s) {
    var h = 5381, i, b = unescape(encodeURIComponent(String(s)));
    for (i = 0; i < b.length; i++) h = (((h << 5) + h) + b.charCodeAt(i)) >>> 0;
    return ("0000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function chaveGerado(obraId, origem) {
    var o = obj(origem) || {};
    return txt(obraId) + "|" + txt(o.r) + "|" + (txt(o.s) || txt(o.e)) + (o.g ? "|g" : "");
  }
  function idGerado(obraId, origem) {
    var k = chaveGerado(obraId, origem);
    return "cc" + fnv1a32hex(k) + djb2hex(k);   /* 2 + 8 + 8 = 18 caracteres */
  }

  /* ------------------------------------------------------------------
   * TETOS DE NUVEM
   *
   * Cada entidade é UM documento do Firestore, de 1 MiB. O app já avisa em
   * 900 KB (js/nuvem.js). Passar do limite não devolve erro bonito: a
   * sincronização daquela entidade simplesmente para de subir, e o aparelho
   * continua gravando no disco local achando que está tudo certo.
   * Por isso a medição é ANTES de gravar, e a recusa vem com números.
   * ---------------------------------------------------------------- */
  var TETO_CC_BYTES = 750 * 1024;
  var TETO_REGRAS = 1000;
  var TETO_REGRAS_BYTES = 650 * 1024;
  var TETO_APROP = 2000;
  var TETO_APROP_BYTES = 650 * 1024;

  var TETOS = {
    centrocusto: { bytes: TETO_CC_BYTES, n: 0, rot: "a lista de centros de custo da empresa",
      portas: ["Gerar por etapa", "Arquivar os centros das obras concluídas", "Excluir centros sem uso"] },
    cc_regras: { bytes: TETO_REGRAS_BYTES, n: TETO_REGRAS, rot: "as regras de centro de custo da empresa",
      portas: ["Encerrar as regras que não decidem nada há 6 meses"] },
    cc_aprop: { bytes: TETO_APROP_BYTES, n: TETO_APROP, rot: "as decisões de centro de custo da empresa",
      portas: ["Transformar decisões repetidas em regras", "Limpar decisões de documentos excluídos"] }
  };

  /* `cabe(entidade, listaCrua, novos)` → a medição que roda ANTES de gravar.
     `novos` são os registros que entrariam (lista) ou os bytes já medidos. */
  function cabe(entidade, listaCrua, novos) {
    var t = TETOS[entidade];
    if (!t) return { cabe: true, msg: "", avisos: [{ tipo: "teto-desconhecido", msg: "Entidade sem teto declarado: " + txt(entidade) }] };
    var lista = arr(listaCrua);
    var bAntes = bytes(lista);
    /* ⚠ O ACRÉSCIMO NÃO É `bytes([novos])`. Entrar numa lista que já existe
       custa o registro MAIS a vírgula que o separa do anterior — e contar
       menos do que custa é exatamente o erro que deixa passar a gravação que
       estoura o documento da nuvem. */
    /* ⚠ REGISTRO QUE JÁ ESTÁ NA LISTA NÃO É ACRÉSCIMO — É TROCA. Roteiro do
       defeito (revisão adversarial da mc-6A, medido com 67 centros gerados
       realistas): converter os 67 antigos passa por aqui os MESMOS 67
       registros, só com `fmt`/`apura` mudados. A soma cheia anunciava
       "+30.961 B" para uma operação cujo acréscimo real é ZERO — 30.961 vezes
       o real — e numa lista perto do teto a instalação levava "Não gravei: …
       passaria de 750 KB" por uma gravação que não gasta um byte. A única
       porta oferecida ("Arquivar os centros das obras concluídas") não
       resolveria nada, porque não há o que liberar: trava sem saída, e com
       números errados na recusa. O `aplicarPrevia` já fazia esta conta certa
       (`bNovos += porId[id] ? bytes(r) - bytes(antigo) : bytes(r) + 1`) e o
       `ccGerarAplicar` descartava o número dele para refazê-la errada aqui. */
    var porIdCabe = {};
    lista.forEach(function (r) { if (r && txt(r.id)) porIdCabe[txt(r.id)] = r; });
    var bNovos = 0, nNovos = 0;
    if (typeof novos === "number") bNovos = novos;
    else arr(novos).forEach(function (r) {
      var antigo = porIdCabe[txt(r && r.id)];
      if (antigo) bNovos += bytes(r) - bytes(antigo);   /* troca: só a diferença */
      else { bNovos += bytes(r) + 1; nNovos++; }        /* novo: o registro e a vírgula que o separa */
    });
    if (bNovos < 0) bNovos = 0;
    var bDepois = bAntes + bNovos;
    var nAntes = lista.length;
    var nDepois = nAntes + nNovos;
    var estoura = bDepois > t.bytes || (t.n > 0 && nDepois > t.n);
    var msg = "";
    if (estoura) {
      msg = "Não gravei: " + t.rot + " passaria de " + fmtKB(t.bytes) +
        " (hoje " + fmtKB(bAntes) + " + " + fmtKB(bNovos) + " destes " + nNovos + " registros).";
      /* ⚠ A FRASE QUE FALTA AQUI É "DESATIVE UM CENTRO". Desativar não apaga
         registro nenhum: o centro continua na lista, com todos os campos, e a
         lista continua do mesmo tamanho. Oferecer isso como saída manda a
         pessoa fazer um trabalho que não resolve — e ela volta com o mesmo
         recado, agora sem acreditar nele. */
      if (entidade === "centrocusto") msg += " Desativar um centro não libera espaço.";
      if (t.n > 0 && nDepois > t.n) msg += " (limite de " + t.n + " registros; ficariam " + nDepois + ")";
    }
    return {
      cabe: !estoura, entidade: entidade, teto: t.bytes, tetoN: t.n,
      bytesAntes: bAntes, bytesNovos: bNovos, bytesDepois: bDepois,
      n: nAntes, nNovos: nNovos, nDepois: nDepois,
      msg: msg, portas: estoura ? t.portas.slice(0) : []
    };
  }

  /* ------------------------------------------------------------------
   * RATEIO QUE FECHA
   *
   * ⚠ DIVIDIR DINHEIRO EM REAIS NÃO FECHA. R$ 850,00 em três partes iguais dá
   * 283,333…; arredondar cada parte para 283,33 perde um centavo, e a soma das
   * partes deixa de ser o valor do documento. Um centavo por rateio, em mil
   * lançamentos, é o número que faz o total da obra discordar do total do
   * Financeiro — e ninguém consegue dizer qual dos dois está certo.
   * Por isso tudo se divide em CENTAVOS inteiros, e o resto (sempre menor que
   * o número de partes) vai para as maiores partes, uma a uma. A soma fecha
   * por construção, não por sorte de arredondamento.
   * ---------------------------------------------------------------- */
  function dividirCentavos(totalCent, pesos) {
    var total = Math.round(num(totalCent));
    var ps = arr(pesos).map(function (p) { return Math.max(0, num(p)); });
    var soma = 0, i;
    for (i = 0; i < ps.length; i++) soma += ps[i];
    if (!ps.length) return { ok: false, partes: [], motivo: "sem-partes" };
    /* ⚠ SOMA DE PESOS ZERO NÃO VIRA DIVISÃO POR ZERO NEM PARTES IGUAIS
       CALADAS: o motor recusa e quem chamou manda o fato para a Fila. Partir
       igual "para não travar" inventaria um destino que ninguém escolheu. */
    if (!(soma > 0)) return { ok: false, partes: [], motivo: "pesos-zerados" };
    var base = [], resto = total, sinal = total < 0 ? -1 : 1, abs = Math.abs(total);
    for (i = 0; i < ps.length; i++) base.push(Math.floor(abs * ps[i] / soma));
    var dado = 0;
    for (i = 0; i < base.length; i++) dado += base[i];
    var sobra = abs - dado;
    /* ordem do maior peso para o menor; empate pela posição, para ser
       determinístico (mesma entrada, mesma saída — invariante I7) */
    var ordem = [];
    for (i = 0; i < ps.length; i++) ordem.push(i);
    ordem.sort(function (a, b) { return ps[b] - ps[a] || a - b; });
    for (i = 0; i < sobra; i++) base[ordem[i % ordem.length]] += 1;
    var partes = [], conf = 0;
    for (i = 0; i < base.length; i++) { partes.push(sinal * base[i]); conf += sinal * base[i]; }
    resto = total - conf;
    return { ok: resto === 0, partes: partes, soma: conf, motivo: resto === 0 ? "" : "nao-fecha" };
  }

  /* ------------------------------------------------------------------
   * MODO DA OBRA — lido da LISTA, nunca de uma decisão avulsa
   * ---------------------------------------------------------------- */
  function ehFmt2(c) { return c && num(c.fmt) === 2; }
  function daObra(ccsCrus, obraId) {
    var alvo = txt(obraId);
    return arr(ccsCrus).filter(function (c) { return c && txt(c.obraId) === alvo; });
  }

  function modoDaObra(obraId, ccsCrus) {
    var lista = daObra(ccsCrus, obraId);
    var novos = [], legados = [], i;
    for (i = 0; i < lista.length; i++) (ehFmt2(lista[i]) ? novos : legados).push(lista[i]);
    var adocaoEm = "";
    for (i = 0; i < novos.length; i++) {
      var ce = txt(novos[i].criadoEm);
      if (ce && (!adocaoEm || ce < adocaoEm)) adocaoEm = ce;
    }
    var modo;
    if (novos.length) modo = "novo";
    else if (!legados.length) modo = "sem-centros";
    /* ⚠ CENTRO DA EMPRESA (obraId vazio) NUNCA CAI EM `legado-rateio`.
       O rateio pelo orçado é a conta que a 1.2.81 faz DENTRO de uma obra
       (divide a despesa daquela obra entre os centros dela). Sem obra não há
       despesa para dividir, e tratar os centros da empresa como "rateio"
       faria o motor recusar todo destino de despesa de escritório — uma trava
       sem porta, pela leitura errada de um campo vazio. */
    else if (!txt(obraId)) modo = "sem-centros";
    else if (legados.length === 1) modo = "legado-cabecalho";
    else modo = "legado-rateio";
    return { modo: modo, legados: legados.length, novos: novos.length, adocaoEm: adocaoEm };
  }

  /* ------------------------------------------------------------------
   * NORMALIZAR — o legado na leitura, SEMPRE em cópia
   * ---------------------------------------------------------------- */
  function origemValida(o) {
    var x = obj(o);
    if (!x) return null;
    if (txt(x.t) !== "orc") return null;
    if (!txt(x.e)) return null;
    return x;
  }
  function cloneCC(c) {
    var d = {}, k;
    for (k in c) if (Object.prototype.hasOwnProperty.call(c, k)) d[k] = c[k];
    var o = obj(c && c.origem);
    if (o) { var d2 = {}, k2; for (k2 in o) if (Object.prototype.hasOwnProperty.call(o, k2)) d2[k2] = o[k2]; d.origem = d2; }
    return d;
  }

  /* ⚠ A CÓPIA QUE SAI DAQUI É PARA LER, NUNCA PARA GRAVAR.
   * Ela vem com `apura` preenchido mesmo quando o registro do disco não tem
   * `apura` nenhum — é isso que permite mostrar o número certo de um centro
   * antigo. Gravar essa cópia seria ADOTAR os centros novos daquela obra pelas
   * costas da pessoa: os antigos parariam de dividir pelo orçado e o Realizado
   * de cada um cairia para R$ 0,00 no próximo render, sem nenhuma confirmação
   * na tela. Por isso a cópia leva `_leitura: 1` e `aplicarPrevia`/`converter`
   * RECUSAM qualquer registro que traga essa marca. */
  function normalizar(cc, modo) {
    var avisos = [];
    if (!obj(cc)) return { _leitura: 1, _avisos: [{ tipo: "cc-registro-invalido", msg: "Registro de centro de custo ilegível." }] };
    var d = cloneCC(cc);
    d._leitura = 1;

    var o = origemValida(cc.origem);
    if (cc.origem != null && !o) {
      avisos.push({ tipo: "cc-origem-invalida", msg: "O centro " + (txt(cc.codigo) || txt(cc.id)) + " tem uma origem ilegível — lido como centro próprio." });
      delete d.origem;
    }
    d._gerado = !!o;
    d._arquivado = num(cc.arq) === 1;
    /* `ativo` ausente = ativo. `0` é `false` (a 1.2.81 grava número em alguns
       caminhos), e só o `false`/`0` explícito desativa. */
    d._ativo = !(cc.ativo === false || cc.ativo === 0 || cc.ativo === "0");

    var temObra = !!txt(cc.obraId);
    var ap = txt(cc.apura);
    if (ap && ap !== "lanc" && ap !== "obra") { avisos.push({ tipo: "cc-apura-desconhecido", msg: "Forma de apurar desconhecida (" + ap + ") — lida como ausente." }); ap = ""; }
    /* ⚠ `apura` SÓ VALE COM `fmt:2`. A espec grava os dois juntos, sempre.
       Um registro com `apura` e sem `fmt` só aparece se alguém editou o JSON
       na mão — e honrá-lo escolheria "pelos lançamentos" numa obra que ainda
       divide pelo orçado, zerando os números dela na primeira abertura. Entre
       preservar o número que a pessoa vê hoje e obedecer um campo órfão, o
       número ganha; o aviso conta o resto. */
    if (ap && !ehFmt2(cc)) {
      avisos.push({ tipo: "cc-apura-sem-fmt", msg: "O centro " + (txt(cc.codigo) || txt(cc.id)) + " tem forma de apurar sem a marca de versão — ignorada." });
      ap = "";
    }
    if (ap) d.apura = ap;
    else if (!temObra) d.apura = "lanc";                     /* centro da empresa antigo */
    else if (modo === "legado-cabecalho") d.apura = "obra";  /* o único antigo vira cabeçalho: mesmo número da 1.2.81 */
    else if (modo === "legado-rateio") d.apura = "rateio";   /* estimativa rotulada, enquanto a obra não adota */
    else d.apura = "lanc";                                   /* modo novo (D-CC10) e obra sem centros */

    d._avisos = avisos;
    return d;
  }

  /* ------------------------------------------------------------------
   * PARA ONDE UMA DECISÃO APONTA — a régua mora aqui, não na tela
   * ------------------------------------------------------------------
   * ⚠ Roteiro do defeito (revisão adversarial da mc-6A): a guarda de exclusão
   * do centro contava as decisões com `JSON.stringify(a.d || "")`. O campo `d`
   * NUNCA é gravado (§1.7: `k` e `d` saem do id, por `CCAgente.chaveDe`) e,
   * mesmo que fosse, `d` é o id do DOCUMENTO — não o do centro. A contagem
   * dava 0 sempre, `refs.total` ficava 0 e a tela apagava um centro com N
   * decisões apontando para ele (D-CC4, `destino-sumiu`). O centro mora em
   * `cc`, em `pt[].c`, em `rs.c` e em `rs.pt[].c` — os quatro, porque a
   * decisão pode ser um centro só, um rateio, o resto de um boletim por itens
   * ou o rateio desse resto. Quem pergunta "esta decisão aponta para este
   * centro?" pergunta AQUI: replicar a régua na tela é como ela errou. */
  function apontaPara(ap, ccId) {
    var alvo = txt(ccId);
    if (!alvo || !ap || typeof ap !== "object") return false;
    if (txt(ap.cc) === alvo) return true;
    var i, ps = arr(ap.pt);
    for (i = 0; i < ps.length; i++) if (ps[i] && txt(ps[i].c) === alvo) return true;
    var rs = obj(ap.rs);
    if (rs) {
      if (txt(rs.c) === alvo) return true;
      var qs = arr(rs.pt);
      for (i = 0; i < qs.length; i++) if (qs[i] && txt(qs[i].c) === alvo) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------
   * O CENTRO QUE ABRAÇA A OBRA INTEIRA
   * ------------------------------------------------------------------
   * ⚠ Roteiro do defeito (revisão adversarial da mc-6A, medido no navegador):
   * a obra com UM centro antigo (que é a forma de TODA a base instalada, já
   * que `fmt:2` não existe em versão publicada nenhuma) mostrava Orçado
   * R$ 0,00, Realizado R$ 0,00, Saldo −R$ 47.000,00 e "Sem centro
   * R$ 47.000,00" — enquanto a linha logo abaixo, do mesmo centro, dizia
   * Orçado R$ 403.205,21 e Realizado R$ 47.000,00. A tela tirava o centro
   * `apura:"obra"` de TODAS as somas para não contar o mesmo dinheiro duas
   * vezes; só que quando ele é o ÚNICO centro da obra não há segunda contagem
   * — há uma primeira que some. E "Sem centro" é falso ali: o centro conta a
   * obra inteira, e a própria tela o rotula "obra inteira".
   * Devolve o centro que abraça a obra, ou `null`. Com QUALQUER centro por
   * lançamento na obra, devolve `null`: aí a exclusão do cabeçalho da soma
   * está certa e é o que o [5] da suíte da tela guarda. */
  function abracaAObra(obraId, ccsCrus, modo) {
    var listaObra = daObra(ccsCrus, obraId);
    if (!listaObra.length) return null;
    var achado = null;
    for (var i = 0; i < listaObra.length; i++) {
      if (normalizar(listaObra[i], modo).apura !== "obra") return null;
      if (achado) return null;                 /* dois cabeçalhos: aí sim somariam duas vezes */
      achado = listaObra[i];
    }
    return achado;
  }

  /* ------------------------------------------------------------------
   * O ORÇAMENTO: nós, numeração e o nó de cada item
   * ---------------------------------------------------------------- */
  function subsValidas(e) {
    var v = {};
    arr(e && e.subetapas).forEach(function (s) { if (s && txt(s.id)) v[txt(s.id)] = s; });
    return v;
  }

  /* ⚠ `subEtapaId` DE OUTRA ETAPA NÃO VALE. O campo é aditivo e já chegou
   * apontando para uma subetapa de outra etapa (item movido, importação,
   * revisão que apagou o grupo). Aceitar isso levaria o gasto de um item da
   * etapa 4 para um centro da etapa 7 — e a etapa 4 apareceria com folga. */
  function noDoItemCalc(orc) {
    var mapa = {};
    arr(orc && orc.etapas).forEach(function (e) {
      if (!e || !txt(e.id)) return;
      var val = subsValidas(e);
      arr(e.itens).forEach(function (it) {
        if (!it || !txt(it.id)) return;
        var sid = txt(it.subEtapaId);
        mapa[txt(it.id)] = { etapaId: txt(e.id), subEtapaId: (sid && val[sid]) ? sid : "" };
      });
    });
    return mapa;
  }
  /* memo de uma entrada só, amarrado ao OBJETO do orçamento e a uma assinatura
     de tamanho: orçamento editado em memória sem bumpar `atualizadoEm` não
     serve dado velho (já aconteceu com cache por id em outra tela). */
  var _memoNo = { orc: null, assin: "", mapa: null };
  function assinOrc(orc) {
    var n = 0;
    arr(orc && orc.etapas).forEach(function (e) { n += arr(e && e.itens).length + arr(e && e.subetapas).length; });
    return arr(orc && orc.etapas).length + ":" + n + ":" + txt(orc && orc.atualizadoEm);
  }
  function noDoItem(orc) {
    var a = assinOrc(orc);
    if (_memoNo.orc === orc && _memoNo.assin === a && _memoNo.mapa) return _memoNo.mapa;
    var m = noDoItemCalc(orc);
    _memoNo = { orc: orc, assin: a, mapa: m };
    return m;
  }

  /* Numeração EAP viva — a mesma régua do `Orcamento.calcular`: os itens
     soltos da etapa gastam os primeiros números, e a subetapa VAZIA não gasta
     número nenhum. Quando a fiação passa `opcoes.linhasOrc` (a saída real do
     `Orcamento.calcular`), é ela que manda, e esta conta nem roda — réplica
     que não é usada não apodrece calada. */
  function numeracaoLocal(orc) {
    var etapa = {}, sub = {}, soltos = {}, raizDe = {}, idx = {};
    arr(orc && orc.etapas).forEach(function (e, ei) {
      if (!e || !txt(e.id)) return;
      var eid = txt(e.id);
      etapa[eid] = String(ei + 1);
      idx[eid] = ei;
      var val = subsValidas(e), nSoltos = 0, nItens = {};
      arr(e.subetapas).forEach(function (s) { if (s && txt(s.id)) nItens[txt(s.id)] = 0; });
      arr(e.itens).forEach(function (it) {
        var sid = txt(it && it.subEtapaId);
        if (sid && val[sid]) nItens[sid]++; else nSoltos++;
      });
      soltos[eid] = nSoltos;
      var seq = nSoltos;
      arr(e.subetapas).forEach(function (s) {
        if (!s || !txt(s.id)) return;
        var sid = txt(s.id);
        raizDe[sid] = eid;
        if (nItens[sid]) { seq++; sub[sid] = String(ei + 1) + "." + seq; } else sub[sid] = "";
      });
    });
    return { etapa: etapa, sub: sub, soltos: soltos, raizDe: raizDe, idx: idx };
  }
  /* Quando a fiação passa as linhas reais do `Orcamento.calcular`, a
     numeração sai delas (é o número que a pessoa vê na planilha). */
  function numeracaoDe(orc, opcoes) {
    var base = numeracaoLocal(orc);
    var linhas = arr(opcoes && opcoes.linhasOrc);
    if (!linhas.length) return base;
    linhas.forEach(function (L) {
      if (!L) return;
      var eid = txt(L.etapaId), sid = txt(L.subEtapaId);
      if (sid && txt(L.subNumero)) base.sub[sid] = txt(L.subNumero);
      if (eid && base.etapa[eid] === undefined) base.etapa[eid] = "";
    });
    return base;
  }

  /* custo direto (quantidade × unitário) dos itens SOLTOS de cada etapa —
     é o orçado do "geral" de uma etapa detalhada (§4.7.2-1). A fórmula é a
     mesma do `CustoEtapa._montarLinhas`; a prova de que continuam iguais é a
     invariante I2b (Σ subetapas + geral = previsto da etapa). */
  function soltosDaEtapa(orc, opts) {
    var m = {};
    arr(orc && orc.etapas).forEach(function (e) {
      if (!e || !txt(e.id)) return;
      var val = subsValidas(e), s = 0;
      arr(e.itens).forEach(function (it) {
        var sid = txt(it && it.subEtapaId);
        if (sid && val[sid]) return;
        s += num(it && it.quantidade, opts) * num(it && it.custoUnitario, opts);
      });
      m[txt(e.id)] = s;
    });
    return m;
  }

  function linhasDe(orc, ctx) {
    if (ctx && ctx.linhas) {
      if (ctx.linhas.porId) return ctx.linhas;
      return { porId: ctx.linhas, linhas: [] };
    }
    if (typeof CustoEtapa !== "undefined" && CustoEtapa && CustoEtapa._montarLinhas && orc) {
      return CustoEtapa._montarLinhas(orc);
    }
    return null;
  }

  /* família: aceita lista de ids ou mapa {id:true} */
  function mapaFamilia(familia) {
    var m = {};
    if (!familia) return m;
    if (Array.isArray(familia)) { familia.forEach(function (id) { if (txt(id)) m[txt(id)] = true; }); return m; }
    if (typeof familia === "object") { var k; for (k in familia) if (Object.prototype.hasOwnProperty.call(familia, k) && familia[k]) m[txt(k)] = true; }
    return m;
  }
  /* ⚠ O CENTRO ARQUIVADO PERDE `origem.o` (é o que faz ele caber em 399 B).
     A pertinência dele à obra sai de `origem.r`, que a arquivação preserva de
     propósito — sem isso o centro arquivado seria lido como "de outra obra" e
     o orçado dele sumiria do KPI na primeira abertura depois de arquivar. */
  function naFamilia(cc, fam) {
    var o = origemValida(cc && cc.origem);
    if (!o) return false;
    var id = txt(o.o) || txt(o.r);
    if (!id) return false;
    return !!fam[id];
  }

  /* ------------------------------------------------------------------
   * ÍNDICE nó → centro
   * ---------------------------------------------------------------- */
  function indicePorNo(ccsCrus, obraId, familia, orc) {
    var fam = mapaFamilia(familia);
    var porNo = {}, geral = {}, detalhada = {}, inteira = {}, inteiraEmDetalhada = {},
      duplicados = {}, substituido = {}, candidatos = {}, avisos = [];
    var lista = daObra(ccsCrus, obraId).filter(function (c) { return origemValida(c.origem) && naFamilia(c, fam); });

    /* 1ª passada: quais etapas estão detalhadas (têm ao menos um centro de subetapa) */
    lista.forEach(function (c) {
      var o = c.origem;
      if (txt(o.s)) detalhada[txt(o.e)] = true;
    });

    function ativo(c) { return !(c.ativo === false || c.ativo === 0 || c.ativo === "0"); }
    /* ⚠ A CHAVE DE DUPLICADOS É NAMESPACED. O centro "geral" e o centro de
       etapa inteira moram os dois na etapa E; se os três mapas usassem a
       chave crua, um conflito no geral apareceria como conflito da etapa e
       travaria um nó que está perfeitamente resolvido. */
    function por(mapa, chave, dupChave, c) {
      if (!candidatos[dupChave]) candidatos[dupChave] = [];
      candidatos[dupChave].push(c);
      var atuais = candidatos[dupChave].filter(ativo);
      if (atuais.length > 1) {
        duplicados[dupChave] = atuais.map(function (x) { return txt(x.id); });
        mapa[chave] = null;
        return;
      }
      /* um ativo + um desativado → o ativo manda (o desativado guarda o
         histórico e continua na tela, mas não recebe fato novo) */
      mapa[chave] = atuais.length ? atuais[0] : (mapa[chave] || c);
    }

    lista.forEach(function (c) {
      var o = c.origem, e = txt(o.e), s = txt(o.s);
      if (s) { por(porNo, s, "n:" + s, c); return; }
      if (o.g) { por(geral, e, "g:" + e, c); return; }
      if (detalhada[e]) { por(inteira, e, "i:" + e, c); return; }
      por(porNo, e, "n:" + e, c);
    });

    /* ⚠ ETAPA INTEIRA DENTRO DE ETAPA DETALHADA (crítica F13).
       A obra gerou o centro "4 — Estrutura" e, meses depois, detalhou a etapa
       em subetapas. O centro 4 continua lá, com o gasto do ano dentro. Se ele
       simplesmente deixasse de responder, o dinheiro dele sumiria da conta da
       etapa; se respondesse junto com um centro "geral", o mesmo item contaria
       duas vezes. A regra é: sem centro `g:1`, o de etapa inteira FAZ AS VEZES
       do geral (e é o que o orçado ao vivo lê como "itens soltos"); com os
       dois, o de etapa inteira é `substituido` e vale 0 — com selo na tela. */
    var k;
    for (k in inteira) {
      if (!Object.prototype.hasOwnProperty.call(inteira, k)) continue;
      var ci = inteira[k];
      if (!ci) continue;
      if (geral[k]) { substituido[txt(ci.id)] = true; }
      else { inteiraEmDetalhada[k] = ci; geral[k] = ci; }
    }

    var raizDe = orc ? numeracaoLocal(orc).raizDe : {};
    if (!orc) avisos.push({ tipo: "indice-sem-orcamento", msg: "O orçamento não veio: uma subetapa sem centro próprio não sobe para a etapa." });

    return {
      porNo: porNo, geral: geral, detalhada: detalhada, inteira: inteira,
      inteiraEmDetalhada: inteiraEmDetalhada, substituido: substituido,
      duplicados: duplicados, raizDe: raizDe, avisos: avisos
    };
  }

  /* `centroDoNo(indice, noId)` — a ordem é fixa e o primeiro que responde
     manda (§4.4). Devolve sempre `{cc, motivo}`: quem chama precisa saber POR
     QUE não achou, para mandar o fato à Fila com o motivo certo. */
  function centroDoNo(indice, noId) {
    var id = txt(noId);
    if (!indice || !id) return { cc: null, motivo: "etapa-sem-centro" };
    var ehRaizDetalhada = !!indice.detalhada[id];
    if (!ehRaizDetalhada) {
      if (indice.duplicados["n:" + id]) return { cc: null, motivo: "no-dois-centros", ids: indice.duplicados["n:" + id] };
      if (indice.porNo[id]) return { cc: indice.porNo[id], motivo: "" };
    }
    /* subetapa sem centro próprio sobe para a etapa — mas SÓ se a etapa não
       está detalhada. Numa etapa detalhada, subir levaria o gasto de uma
       subetapa sem centro para o centro "geral", que é dos itens SOLTOS: o
       geral apareceria estourado e a subetapa, zerada. */
    var raiz = txt(indice.raizDe && indice.raizDe[id]);
    if (raiz && raiz !== id && !indice.detalhada[raiz]) {
      if (indice.duplicados["n:" + raiz]) return { cc: null, motivo: "no-dois-centros", ids: indice.duplicados["n:" + raiz] };
      if (indice.porNo[raiz]) return { cc: indice.porNo[raiz], motivo: "" };
    }
    if (ehRaizDetalhada) {
      if (indice.duplicados["g:" + id]) return { cc: null, motivo: "no-dois-centros", ids: indice.duplicados["g:" + id] };
      if (indice.geral[id]) return { cc: indice.geral[id], motivo: "" };
    }
    return { cc: null, motivo: "etapa-sem-centro" };
  }

  /* ------------------------------------------------------------------
   * ORÇADO AO VIVO (§4.7.2)
   * ---------------------------------------------------------------- */
  function orcadoDe(cc, ctx) {
    ctx = ctx || {};
    var fot = num(cc && cc.valorOrcado, ctx);
    var avisos = [];
    if (ilegivel(cc && cc.valorOrcado, ctx)) avisos.push({ tipo: "cc-orcado-ilegivel", msg: "O valor orçado do centro " + txt(cc && cc.codigo) + " não pôde ser lido com segurança — lido como zero." });

    /* 6) orçamento ausente do aparelho, ou centro arquivado → a foto */
    if (!ctx.orc || num(cc && cc.arq) === 1) return { valor: fot, fonte: "foto", avisos: avisos };
    var o = origemValida(cc && cc.origem);
    /* 5) sem origem → o digitado */
    if (!o) return { valor: fot, fonte: "digitado", avisos: avisos };
    var fam = mapaFamilia(ctx.familia);
    /* 4) origem fora da família da obra → tratado como próprio (D-CC5) */
    if (!naFamilia(cc, fam)) return { valor: fot, fonte: "origem-fora-da-obra", avisos: avisos };
    /* 2) etapa inteira que um `geral` substituiu → 0 */
    if (ctx.indice && ctx.indice.substituido && ctx.indice.substituido[txt(cc.id)]) {
      return { valor: 0, fonte: "substituido", avisos: avisos };
    }
    var L = linhasDe(ctx.orc, ctx);
    if (!L) { avisos.push({ tipo: "cc-sem-regua-previsto", msg: "O motor do Previsto × Realizado não carregou — o orçado saiu da foto." }); return { valor: fot, fonte: "foto", avisos: avisos }; }
    var e = txt(o.e), s = txt(o.s);
    var detalhada = !!(ctx.indice && ctx.indice.detalhada && ctx.indice.detalhada[e]);
    var ehGeral = !!o.g || (!s && detalhada);
    if (ehGeral) {
      if (!L.porId[e]) return { valor: 0, fonte: "sem-correspondente", avisos: avisos };
      var sol = ctx.soltos || soltosDaEtapa(ctx.orc, ctx);
      return { valor: num(sol[e], ctx), fonte: "vivo", avisos: avisos };
    }
    var alvo = L.porId[s || e];
    /* 3) origem na família mas o nó não existe mais no orçamento → 0 */
    if (!alvo) return { valor: 0, fonte: "sem-correspondente", avisos: avisos };
    return { valor: num(alvo.previsto, ctx), fonte: "vivo", avisos: avisos };
  }

  /* ------------------------------------------------------------------
   * NATUREZA (MO / MAT / EQ) — K12
   *
   * ⚠ SEM A RÉGUA DO ORÇAMENTO, O MOTOR NÃO CHUTA A DIVISÃO. A repartição
   * respeita o MODO DE CUSTO do item ("só mão de obra" não soma o material
   * que o contratante fornece) — replicar isso aqui daria uma quarta
   * implementação da conta que a pizza do xlsx, o Resumo e o laudo já
   * erraram cada um do seu jeito. Sem `repartir`, o retorno diz
   * `fonte: "indisponivel"` e a tela mostra um traço, não um zero.
   * ---------------------------------------------------------------- */
  function natureza(cc, ctx) {
    ctx = ctx || {};
    var rep = (typeof ctx.repartir === "function") ? ctx.repartir
      : ((typeof Orcamento !== "undefined" && Orcamento && typeof Orcamento.repartirCusto === "function") ? function (it, ct) { return Orcamento.repartirCusto(it, ct); } : null);
    var zero = { mo: 0, mat: 0, eq: 0, total: 0, fonte: "indisponivel", avisos: [{ tipo: "natureza-sem-regua", msg: "A divisão entre mão de obra, material e equipamento não foi calculada (o motor do orçamento não carregou)." }] };
    if (!rep || !ctx.orc) return zero;
    var o = origemValida(cc && cc.origem);
    if (!o) return { mo: 0, mat: 0, eq: 0, total: 0, fonte: "sem-origem", avisos: [] };
    var e = txt(o.e), s = txt(o.s);
    var detalhada = !!(ctx.indice && ctx.indice.detalhada && ctx.indice.detalhada[e]);
    var ehGeral = !!o.g || (!s && detalhada);
    var et = null;
    arr(ctx.orc.etapas).forEach(function (x) { if (x && txt(x.id) === e) et = x; });
    if (!et) return { mo: 0, mat: 0, eq: 0, total: 0, fonte: "sem-correspondente", avisos: [] };
    var val = subsValidas(et), r = { mo: 0, mat: 0, eq: 0, total: 0 }, semParcela = 0;
    arr(et.itens).forEach(function (it) {
      var sid = txt(it && it.subEtapaId);
      var noItem = (sid && val[sid]) ? sid : "";
      if (ehGeral) { if (noItem) return; }
      else if (s) { if (noItem !== s) return; }
      var ct = num(it && it.quantidade, ctx) * num(it && it.custoUnitario, ctx);
      r.total += ct;
      var p = rep(it, ct);
      if (!p) { semParcela += ct; return; }
      r.mo += num(p.mo, ctx); r.mat += num(p.mat, ctx); r.eq += num(p.eq, ctx);
    });
    r.fonte = "vivo";
    r.semParcela = semParcela;
    r.avisos = semParcela > 0.005
      ? [{ tipo: "natureza-item-sem-parcela", msg: fmt(semParcela) + " estão em itens sem mão de obra, material e equipamento discriminados." }]
      : [];
    return r;
  }

  /* ------------------------------------------------------------------
   * PRÉVIA DA GERAÇÃO (§4.7.1)
   * ---------------------------------------------------------------- */
  var MIUDAS = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, em: 1, com: 1, para: 1, "a": 1, "o": 1, "no": 1, "na": 1 };
  function tituloBR(s) {
    var t = txt(s);
    if (!t) return "";
    /* NOME TODO EM MAIÚSCULA É COMO O ORÇAMENTO GUARDA, não como a tela lê.
       "SAPATAS E BLOCOS DE COROAMENTO" vira "Sapatas e Blocos de Coroamento". */
    var partes = t.toLowerCase().split(/(\s+)/);
    var out = "", primeira = true;
    partes.forEach(function (p) {
      if (/^\s+$/.test(p) || !p) { out += p; return; }
      if (!primeira && MIUDAS[p]) { out += p; return; }
      out += p.charAt(0).toUpperCase() + p.slice(1);
      primeira = false;
    });
    return out;
  }

  function ehOpcional(e) { return !!(e && e.opcional); }
  function naBase(etapaId, base) {
    if (!base) return false;
    if (Array.isArray(base)) return base.indexOf(txt(etapaId)) >= 0;
    if (typeof base === "object") {
      if (base.etapas) return naBase(etapaId, base.etapas);
      return !!base[txt(etapaId)];
    }
    return false;
  }

  function raizDaCadeia(orc, orcamentos) {
    /* raiz da cadeia `revisaoDe`, com o mesmo limite de passos do
       `CronoExecUI.obraDaCadeia`: orçamento que aponta para si mesmo (já
       aconteceu depois de uma importação) não pode travar o app. */
    var porId = {};
    arr(orcamentos).forEach(function (o) { if (o && txt(o.id)) porId[txt(o.id)] = o; });
    var cur = orc, passos = 0, visto = {};
    while (cur && txt(cur.revisaoDe) && passos < 5000) {
      if (visto[txt(cur.id)]) break;
      visto[txt(cur.id)] = true;
      var pai = porId[txt(cur.revisaoDe)];
      if (!pai) return txt(cur.revisaoDe);   /* pai ausente do aparelho: ele é a raiz conhecida */
      cur = pai; passos++;
    }
    return txt(cur && cur.id) || txt(orc && orc.id);
  }

  function previa(orc, obra, ccsCrus, opcoes) {
    opcoes = opcoes || {};
    var obraId = txt(obra && obra.id);
    var avisos = [];
    var linhas = [], conversao = [];
    if (!orc || !arr(orc.etapas).length) {
      return { linhas: [], conversao: [], totais: { linhas: 0, marcadas: 0, orcadoTotal: 0, orcadoMarcado: 0, vendaTotal: 0, opcionaisDesmarcados: 0 },
        bytesNovos: 0, bytesLista: bytes(arr(ccsCrus)), nadaAGerar: true,
        avisos: [{ tipo: "previa-sem-orcamento", msg: "Este orçamento não tem etapas — não há centro para gerar." }] };
    }
    var modoInfo = modoDaObra(obraId, ccsCrus);
    var fam = mapaFamilia(opcoes.familia);
    var raiz = txt(opcoes.raiz) || raizDaCadeia(orc, opcoes.orcamentos) || txt(orc.id);
    if (!fam[txt(orc.id)]) fam[txt(orc.id)] = true;   /* o próprio orçamento sempre pertence à família */
    var nums = numeracaoDe(orc, opcoes);
    var L = linhasDe(orc, opcoes);
    if (!L) avisos.push({ tipo: "previa-sem-regua-previsto", msg: "O motor do Previsto × Realizado não carregou — o orçado das linhas não pôde ser calculado." });
    var sol = soltosDaEtapa(orc, opcoes);
    var indice = indicePorNo(ccsCrus, obraId, fam, orc);
    var vendaPorNo = {};
    arr(opcoes.linhasOrc).forEach(function (x) {
      if (!x) return;
      var e = txt(x.etapaId), s = txt(x.subEtapaId);
      vendaPorNo[e] = (vendaPorNo[e] || 0) + num(x.precoTotal, opcoes);
      if (s) vendaPorNo[e + "|" + s] = (vendaPorNo[e + "|" + s] || 0) + num(x.precoTotal, opcoes);
      else vendaPorNo[e + "|g"] = (vendaPorNo[e + "|g"] || 0) + num(x.precoTotal, opcoes);
    });
    var temVenda = arr(opcoes.linhasOrc).length > 0;
    if (!temVenda) avisos.push({ tipo: "previa-sem-venda", msg: "A coluna de venda não foi calculada (o orçamento com BDI não veio) — o orçado abaixo é custo direto." });

    /* índice do id ocupado: a lista CRUA inteira, qualquer obra, com ou sem origem */
    var porId = {};
    arr(ccsCrus).forEach(function (c) { if (c && txt(c.id)) porId[txt(c.id)] = c; });

    var lancsRaiz = opcoes.lancsRaiz || {};
    var modo = txt(opcoes.modo) || "etapa";
    var detalhar = opcoes.detalhar || {};
    var prefixo = txt(opcoes.prefixo);
    var nomes = opcoes.nomes || {}, codigos = opcoes.codigos || {}, marcadas = opcoes.marcadas || {};

    function existeDoNo(e, s, g) {
      var c = g ? indice.geral[e] : (s ? indice.porNo[s] : (indice.detalhada[e] ? indice.inteira[e] : indice.porNo[e]));
      /* o `geral` pode estar ocupado pelo centro de etapa inteira que faz as
         vezes dele — esse não é o "existe" de uma linha `g:1` */
      if (g && c && !(c.origem && c.origem.g)) return null;
      return c || null;
    }

    function empurra(e, s, g, etapa, subNome) {
      var eid = txt(etapa.id);
      var chave = eid + (s ? "|" + s : (g ? "|g" : ""));
      var origem = { t: "orc", o: txt(orc.id), r: raiz, e: eid, s: s || "", g: g ? 1 : 0,
        n: s ? txt(nums.sub[s]) : txt(nums.etapa[eid]), nm: txt(s ? subNome : etapa.nome) };
      var id = idGerado(obraId, origem);
      var orcado = 0;
      if (L) {
        if (g) orcado = num(sol[eid], opcoes);
        else if (s) orcado = L.porId[s] ? num(L.porId[s].previsto, opcoes) : 0;
        else orcado = L.porId[eid] ? num(L.porId[eid].previsto, opcoes) : 0;
      }
      var nat = natureza({ origem: origem, id: id }, { orc: orc, indice: indice, repartir: opcoes.repartir, num: opcoes.num });
      var codigo = txt(codigos[chave]) || (prefixo + (s ? txt(nums.sub[s]) : txt(nums.etapa[eid])));
      var nome = txt(nomes[chave]) || tituloBR(s ? subNome : etapa.nome);
      var existe = existeDoNo(eid, s, g);
      var sit = "novo", ccId = "", marcada, porta = "";

      if (existe) {
        var at = !(existe.ativo === false || existe.ativo === 0 || existe.ativo === "0");
        sit = at ? "existe" : "existe-desativado";
        ccId = txt(existe.id);
      } else if (porId[id]) {
        /* ⚠ ID OCUPADO. A 1.2.81 deixa trocar a obra de um centro gerado; o
           registro continua com a `origem` da obra antiga e com o id derivado
           dela. Gerar de novo na obra original acharia esse id e, se
           sobrescrevesse, apagaria o centro que hoje está em OUTRA obra, com o
           dinheiro dela dentro. Nunca sobrescreve: mostra a situação e a porta.
           ⚠ E "MESMA CHAVE" NÃO SE CONFERE PELO `obraId` DO OCUPANTE — é
           justamente ele que foi trocado. A pergunta certa é: o id que ele
           carrega nasceu da obra em que ele está hoje? Se não nasceu, e o nó
           da origem é o nosso, o centro é NOSSO e alguém o mudou de obra.
           Escrevi a primeira versão comparando as chaves inteiras e ela
           classificava esse caso como colisão de hash — a porta [Trazer de
           volta] nunca aparecia, e a pessoa ficava com um "avise o suporte". */
        var ocup = porId[id];
        var oo = origemValida(ocup.origem);
        ccId = txt(ocup.id);
        if (!oo) { sit = "id-ocupado"; porta = "restaurar"; }
        else if (idGerado(txt(ocup.obraId), oo) === txt(ocup.id)) { sit = "id-colisao"; }
        else if (txt(oo.r) === txt(origem.r) && txt(oo.e) === txt(origem.e) &&
                 txt(oo.s) === txt(origem.s) && !!oo.g === !!origem.g) { sit = "id-ocupado"; porta = "trazer"; }
        else { sit = "id-colisao"; }
      } else if (!g && !s && ehOpcional(etapa) && !naBase(eid, opcoes.base)) {
        sit = "opcional-fora-da-base";
      } else if (s && ehOpcional(etapa) && !naBase(eid, opcoes.base)) {
        sit = "opcional-fora-da-base";
      }

      if (g && !(num(sol[eid], opcoes) > 0.005) && !lancsRaiz[eid]) sit = "geral-sem-item";

      marcada = (sit === "novo");
      if (marcadas[chave] !== undefined) marcada = !!marcadas[chave];
      if (sit === "geral-sem-item" || sit === "id-colisao") marcada = false;

      linhas.push({
        chave: chave, no: s || eid, etapaId: eid, subEtapaId: s || "", geral: !!g,
        codigo: codigo, nome: nome, nomeOrcamento: txt(s ? subNome : etapa.nome),
        orcado: orcado, venda: temVenda ? num(vendaPorNo[chave], opcoes) : null,
        natureza: { mo: nat.mo, mat: nat.mat, eq: nat.eq, fonte: nat.fonte },
        situacao: sit, marcada: marcada, idGerado: id, ccId: ccId, porta: porta,
        opcional: ehOpcional(etapa), origem: origem
      });
    }

    arr(orc.etapas).forEach(function (e) {
      if (!e || !txt(e.id)) return;
      var eid = txt(e.id);
      var subs = arr(e.subetapas).filter(function (s) { return s && txt(s.id); });
      var detalha = (modo === "subetapa") ? subs.length > 0
        : (modo === "escolher") ? (!!detalhar[eid] && subs.length > 0) : false;
      if (!detalha) { empurra(eid, "", false, e, ""); return; }
      subs.forEach(function (s) { empurra(eid, txt(s.id), false, e, txt(s.nome)); });
      empurra(eid, "", true, e, e.nome);
      /* ⚠ A ETAPA QUE VAI SER DETALHADA E JÁ TEM CENTRO DE ETAPA INTEIRA
         (crítica F13): uma linha própria, com a porta [Desativar e detalhar],
         DESMARCADA. Desativar sozinho tiraria da tela o centro onde está o
         gasto do ano; sem desativar, ele faz as vezes do geral e nada some.
         ⚠ "VAI SER detalhada" é estado DESTA PRÉVIA, não do índice. A primeira
         versão procurava o centro em `indice.inteira`, que só existe quando a
         etapa JÁ tem centro de subetapa — ou seja, exatamente no caso em que
         ela ainda NÃO tem. A linha nunca aparecia, e a pessoa detalhava a
         etapa sem nunca ver que havia um centro antigo ali. */
      var ci = indice.inteira[eid] || indice.inteiraEmDetalhada[eid];
      if (!ci) {
        var cand = indice.porNo[eid];
        if (cand && cand.origem && !txt(cand.origem.s) && !cand.origem.g) ci = cand;
      }
      if (ci) {
        linhas.push({
          chave: eid + "|inteira", no: eid, etapaId: eid, subEtapaId: "", geral: false,
          codigo: txt(ci.codigo), nome: txt(ci.nome), nomeOrcamento: txt(e.nome),
          orcado: num(ci.valorOrcado, opcoes), venda: null,
          natureza: { mo: 0, mat: 0, eq: 0, fonte: "sem-origem" },
          situacao: "existe-etapa-inteira",
          marcada: marcadas[eid + "|inteira"] !== undefined ? !!marcadas[eid + "|inteira"] : false,
          idGerado: txt(ci.id), ccId: txt(ci.id), opcional: ehOpcional(e), origem: ci.origem
        });
      }
    });

    /* Bloco "Centros antigos desta obra" (§4.0) — só quando a obra ainda não
       adotou. O padrão com UM antigo é "todo o gasto da obra" (mesmo número da
       1.2.81); com dois ou mais, "pelos lançamentos apropriados". */
    if (modoInfo.modo !== "novo" && modoInfo.legados > 0) {
      var antigos = daObra(ccsCrus, obraId).filter(function (c) { return !ehFmt2(c); });
      var padrao = antigos.length === 1 ? "obra" : "lanc";
      var real = opcoes.realizado || null;
      if (!real) avisos.push({ tipo: "conversao-sem-numeros", msg: "Os valores de Realizado de antes e de depois da conversão não foram calculados — a tela precisa passá-los." });
      antigos.forEach(function (c) {
        var esc = (opcoes.conversao && opcoes.conversao[txt(c.id)]) || padrao;
        var r = real && real[txt(c.id)] ? real[txt(c.id)] : null;
        conversao.push({
          ccId: txt(c.id), codigo: txt(c.codigo), nome: txt(c.nome),
          apuraAntes: normalizar(c, modoInfo.modo).apura, apuraDepois: esc,
          realizadoAntes: r ? num(r.antes, opcoes) : null,
          realizadoDepois: r ? num(r.depois, opcoes) : null
        });
      });
    }

    var totais = { linhas: linhas.length, marcadas: 0, orcadoTotal: 0, orcadoMarcado: 0, vendaTotal: 0, opcionaisDesmarcados: 0 };
    var novos = [];
    /* ⚠ DINHEIRO SAI DAQUI ARREDONDADO AO CENTAVO. 245.205,21 + 100.000 +
       58.000 dá 403205.20999999996 em ponto flutuante, e esse número vai para
       o rodapé da prévia e para o toast da geração. Um "R$ 403.205,20" onde a
       planilha diz 403.205,21 destrói a confiança na tela inteira — e o erro
       é de exibição, não de conta. */
    linhas.forEach(function (l) { l.orcado = Math.round(l.orcado * 100) / 100; if (l.venda != null) l.venda = Math.round(l.venda * 100) / 100; });
    linhas.forEach(function (l) {
      if (l.situacao !== "existe-etapa-inteira") totais.orcadoTotal += l.orcado;
      if (l.venda != null) totais.vendaTotal += l.venda;
      if (l.opcional && !l.marcada && l.situacao === "opcional-fora-da-base") totais.opcionaisDesmarcados++;
      if (l.marcada && (l.situacao === "novo" || l.situacao === "opcional-fora-da-base")) {
        totais.marcadas++; totais.orcadoMarcado += l.orcado;
        /* ⚠ A ESTIMATIVA DE BYTES NUNCA PODE SAIR PARA BAIXO. Medir o registro
           com `em` e `por` vazios tira ~60 B de cada centro; com 67 centros são
           4 KB a menos, e é exatamente essa diferença que deixa passar a
           gravação que estoura o documento da nuvem. Sem saber quem vai gerar,
           usa-se o pior caso declarado (`por` até 40, ISO de 24). */
        novos.push(registroGerado(l, obraId, txt(opcoes.agora) || "0000-00-00T00:00:00.000Z",
          txt(opcoes.por) || "0000000000000000000000000000000000000000"));
      }
    });

    totais.orcadoTotal = Math.round(totais.orcadoTotal * 100) / 100;
    totais.orcadoMarcado = Math.round(totais.orcadoMarcado * 100) / 100;
    totais.vendaTotal = Math.round(totais.vendaTotal * 100) / 100;

    var podeGerar = false;
    linhas.forEach(function (l) {
      if (l.marcada && l.situacao !== "existe" && l.situacao !== "geral-sem-item" && l.situacao !== "id-colisao") podeGerar = true;
    });

    if (modoInfo.modo === "legado-rateio") {
      avisos.push({ tipo: "obra-em-rateio", msg: "Esta obra ainda divide o Realizado pelo orçado dos centros antigos (estimativa). Gerar os centros novos converte os antigos junto — os números de antes e de depois estão no bloco acima." });
    }
    if (opcoes.orcamentoNaoAprovado) {
      avisos.push({ tipo: "orcamento-nao-aprovado", msg: "Este orçamento ainda não foi aprovado — o orçado dos centros acompanha as mudanças dele." });
    }
    indice.avisos.forEach(function (a) { avisos.push(a); });
    var dup;
    for (dup in indice.duplicados) {
      if (!Object.prototype.hasOwnProperty.call(indice.duplicados, dup)) continue;
      avisos.push({ tipo: "no-dois-centros", msg: "Dois centros ativos apontam para o mesmo item do orçamento — nenhum dos dois recebe lançamento até você escolher qual vale." });
    }

    return {
      linhas: linhas, conversao: conversao, totais: totais, modo: modoInfo,
      indice: indice, raiz: raiz, obraId: obraId, orcId: txt(orc.id),
      bytesNovos: novos.length ? bytes(novos) - 2 : 0,
      bytesLista: bytes(arr(ccsCrus)),
      nadaAGerar: !podeGerar,
      avisos: avisos
    };
  }

  function registroGerado(l, obraId, agora, quem) {
    var o = l.origem || {};
    var r = {
      id: l.idGerado,
      codigo: txt(l.codigo), nome: txt(l.nome), tipo: "direto",
      obraId: txt(obraId), valorOrcado: Math.round(num(l.orcado) * 100) / 100, obs: "",
      fmt: 2, apura: "lanc",
      origem: { t: "orc", o: txt(o.o), r: txt(o.r), e: txt(o.e), s: txt(o.s), g: o.g ? 1 : 0,
        n: txt(o.n), nm: txt(o.nm), em: txt(agora), por: txt(quem) },
      criadoEm: txt(agora), atualizadoEm: txt(agora)
    };
    return r;
  }

  /* ------------------------------------------------------------------
   * MOVIMENTOS: o que muda de centro quando a geração for aplicada
   *
   * ⚠ ESTA FUNÇÃO NÃO PODE DEVOLVER "NADA MUDOU" QUANDO ELA NÃO SABE.
   * O toast da geração diz, com números, quantos lançamentos passaram de um
   * centro para outro e quantos foram para a Fila — e "Nenhum lançamento mudou
   * de centro" é uma AFIRMAÇÃO sobre dinheiro. Se o mapa de fatos não veio,
   * ela devolve `ok:false` e um aviso; quem chama diz "não consegui conferir",
   * nunca "está tudo certo".
   * ---------------------------------------------------------------- */
  function mapaFatos(x) {
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    if (x.porFato && typeof x.porFato === "object" && !Array.isArray(x.porFato)) return x.porFato;
    /* ⚠ SAÍDA DO `consolidar` SEM `porFato` NÃO É "MAPA VAZIO".
       Ela tem `centros`/`obras`/`fila`, e tratá-la como mapa de fatos daria
       zero movimentos — a tela então diria "Nenhum lançamento mudou de
       centro" justamente quando ela não faz ideia. Aqui isso vira `null`, e
       `movimentos` devolve `ok:false`. */
    if (x.centros !== undefined || x.obras !== undefined || x.fila !== undefined) return null;
    return x;
  }
  function destinoDe(e) {
    if (!e) return "";
    if (e.cc !== undefined && e.cc !== null && txt(e.cc)) return txt(e.cc);
    var ps = arr(e.partes);
    if (ps.length) {
      var ids = ps.map(function (p) { return txt(p && p.cc); }).filter(function (s) { return !!s; });
      ids.sort();
      return "rateio:" + ids.join("+");
    }
    return "";
  }
  function movimentos(antes, depois) {
    var ma = mapaFatos(antes), md = mapaFatos(depois);
    if (!ma || !md) {
      return { ok: false, fatos: [], porPar: [],
        avisos: [{ tipo: "movimentos-sem-porfato", msg: "Não consegui conferir o que muda de centro: o mapa de fatos por centro não veio. A tela não pode afirmar que nada muda." }] };
    }
    var chaves = {}, k;
    for (k in ma) if (Object.prototype.hasOwnProperty.call(ma, k)) chaves[k] = true;
    for (k in md) if (Object.prototype.hasOwnProperty.call(md, k)) chaves[k] = true;
    var fatos = [], pares = {};
    var ordenadas = Object.keys(chaves).sort();
    ordenadas.forEach(function (ch) {
      var a = ma[ch], b = md[ch];
      var de = destinoDe(a), para = destinoDe(b);
      if (de === para) return;
      var ref = b || a || {};
      var v = Math.round(num(ref.valor));
      var pago = !!ref.pago;
      fatos.push({ fato: ch, valor: v, pago: pago, dataPgto: txt(ref.dataPgto),
        rotulo: txt(ref.rotulo), obraId: txt(ref.obraId), de: de, para: para });
      var pk = de + ">" + para;
      if (!pares[pk]) pares[pk] = { de: de, para: para, n: 0, valor: 0, pagos: 0 };
      pares[pk].n++; pares[pk].valor += v; if (pago) pares[pk].pagos++;
    });
    var porPar = [];
    Object.keys(pares).sort().forEach(function (pk) { porPar.push(pares[pk]); });
    porPar.sort(function (a, b) { return b.valor - a.valor || (a.de < b.de ? -1 : 1); });
    return { ok: true, fatos: fatos, porPar: porPar, avisos: [] };
  }

  /* ------------------------------------------------------------------
   * APLICAR A PRÉVIA (§4.7.3) — devolve o que gravar; NÃO grava
   * ---------------------------------------------------------------- */
  function temLeitura(lista) {
    var achou = false;
    arr(lista).forEach(function (c) { if (c && c._leitura) achou = true; });
    return achou;
  }

  function aplicarPrevia(prev, escolhas, agora, quem, ccsCrus) {
    escolhas = escolhas || {};
    var gravar = [], reativar = [], desativar = [], converter = [], avisos = [];
    if (!prev || !arr(prev.linhas).length) {
      return { gravar: [], reativar: [], desativar: [], converter: [],
        recusa: { motivo: "previa-vazia", msg: "Não há nada para gerar." }, resumo: null, avisos: [] };
    }
    /* ⚠ A LISTA CRUA É A DO DISCO — NUNCA a saída do `normalizar`.
       A cópia de leitura vem com `apura` preenchido; gravá-la adotaria os
       centros novos da obra sem a pessoa pedir, e o Realizado dos antigos
       cairia a zero no render seguinte. */
    if (temLeitura(ccsCrus)) {
      return { gravar: [], reativar: [], desativar: [], converter: [],
        recusa: { motivo: "lista-normalizada", msg: "A lista de centros veio normalizada para leitura. Gravar a partir dela mudaria a forma de apurar dos centros antigos sem ninguém pedir." },
        resumo: null, avisos: [] };
    }
    var obraId = txt(escolhas.obraId) || txt(prev.obraId);
    var porId = {};
    arr(ccsCrus).forEach(function (c) { if (c && txt(c.id)) porId[txt(c.id)] = c; });
    var marcadas = escolhas.marcadas || {}, nomes = escolhas.nomes || {}, codigos = escolhas.codigos || {};
    var idOcupado = escolhas.idOcupado || {};
    var recusa = null;
    var orcadoMarcado = 0;

    arr(prev.linhas).forEach(function (l) {
      if (recusa) return;
      var marcada = marcadas[l.chave] !== undefined ? !!marcadas[l.chave] : !!l.marcada;
      if (!marcada) return;
      var linha = l;
      if (nomes[l.chave] !== undefined || codigos[l.chave] !== undefined) {
        linha = cloneCC(l);
        if (nomes[l.chave] !== undefined) linha.nome = txt(nomes[l.chave]);
        if (codigos[l.chave] !== undefined) linha.codigo = txt(codigos[l.chave]);
      }
      var obra = txt(escolhas.obraId) || txt(l.obraId) || obraId;

      if (l.situacao === "novo" || l.situacao === "opcional-fora-da-base") {
        /* conferência final do id ocupado, sobre a lista CRUA inteira */
        if (porId[l.idGerado]) {
          recusa = { motivo: "id-ocupado", chave: l.chave, id: l.idGerado,
            msg: "Já existe um registro com o id deste centro (" + l.idGerado + "). Não vou sobrescrever: use [Trazer este centro de volta para a obra] ou [Restaurar a origem deste centro]." };
          return;
        }
        gravar.push(registroGerado(linha, obra, agora, quem));
        orcadoMarcado += num(linha.orcado);
        return;
      }
      if (l.situacao === "existe-desativado") {
        var cd = porId[l.ccId];
        if (!cd) { avisos.push({ tipo: "reativar-sumiu", msg: "O centro a reativar não está mais na lista." }); return; }
        var rr = cloneCC(cd);
        rr.ativo = true; delete rr.desativadoEm; delete rr.desativadoPor;
        rr.atualizadoEm = txt(agora);
        reativar.push(rr);
        return;
      }
      if (l.situacao === "existe-etapa-inteira") {
        var ce = porId[l.ccId];
        if (!ce) { avisos.push({ tipo: "desativar-sumiu", msg: "O centro de etapa inteira não está mais na lista." }); return; }
        var dd = cloneCC(ce);
        dd.ativo = false; dd.desativadoEm = txt(agora); dd.desativadoPor = txt(quem);
        dd.atualizadoEm = txt(agora);
        desativar.push(dd);
        return;
      }
      if (l.situacao === "id-ocupado") {
        var porta = txt(idOcupado[l.chave]);
        var co = porId[l.ccId];
        if (!co) { avisos.push({ tipo: "ocupado-sumiu", msg: "O registro que ocupava o id não está mais na lista." }); return; }
        if (porta !== "trazer" && porta !== "restaurar") {
          var sugerida = txt(l.porta) === "restaurar"
            ? "[Restaurar a origem deste centro]"
            : "[Trazer este centro de volta para a obra]";
          recusa = { motivo: "id-ocupado-sem-porta", chave: l.chave, id: l.idGerado, porta: txt(l.porta),
            msg: "O id deste centro já está em uso por outro registro" +
              (txt(co.obraId) && txt(co.obraId) !== txt(obra) ? " (ele está hoje em outra obra)" : "") +
              ". Use " + sugerida + " — nada é sobrescrito sem isso." };
          return;
        }
        var rt = cloneCC(co);
        rt.obraId = txt(escolhas.obraId) || obra;
        rt.origem = { t: "orc", o: txt(l.origem.o), r: txt(l.origem.r), e: txt(l.origem.e), s: txt(l.origem.s),
          g: l.origem.g ? 1 : 0, n: txt(l.origem.n), nm: txt(l.origem.nm),
          em: txt(co.origem && co.origem.em) || txt(agora), por: txt(co.origem && co.origem.por) || txt(quem) };
        rt.fmt = 2;
        if (rt.apura !== "lanc" && rt.apura !== "obra") rt.apura = "lanc";
        rt.atualizadoEm = txt(agora);
        gravar.push(rt);
        return;
      }
      if (l.situacao === "id-colisao") {
        recusa = { motivo: "id-colisao", chave: l.chave, id: l.idGerado,
          msg: "Dois itens diferentes do orçamento chegaram ao mesmo id de centro (" + l.idGerado + "). Isso não deveria acontecer — avise o suporte antes de gerar." };
        return;
      }
    });

    var mudancas = [];
    if (!recusa) {
      var conv = converterDados(arr(ccsCrus), escolhas.conversao, agora, quem, obraId);
      if (conv.recusa) recusa = conv.recusa;
      else {
        /* ⚠ `_mudanca` É CONTROLE INTERNO E NÃO PODE IR PARA O DISCO.
           Ele diz à confirmação de pagos (D20) se aquela gravação é ADOÇÃO
           (o Realizado do centro antigo muda) ou só troca de `apura`. Deixá-lo
           no registro mandaria um campo desconhecido para o Firestore, que
           viaja para todos os aparelhos e volta no backup — e a 1.2.81
           preserva campo desconhecido no `_modalForm`, então ele nunca mais
           sairia de lá. */
        conv.gravar.forEach(function (c) {
          mudancas.push({ id: txt(c.id), mudanca: txt(c._mudanca) });
          var d = cloneCC(c); delete d._mudanca;
          converter.push(d);
        });
      }
    }

    if (recusa) return { gravar: [], reativar: [], desativar: [], converter: [], recusa: recusa, resumo: null, avisos: avisos };

    /* ⚠ O ACRÉSCIMO REAL: registro novo conta inteiro; registro que SUBSTITUI
       um que já está na lista conta só a diferença. Somar tudo como se fosse
       novo daria um número três vezes maior que o real e a porta recusaria
       gerações que cabem — trava sem motivo é tão ruim quanto trava faltando,
       porque ensina a pessoa a não acreditar no recado. */
    var bNovos = 0;
    gravar.forEach(function (r) { bNovos += porId[txt(r.id)] ? (bytes(r) - bytes(porId[txt(r.id)])) : (bytes(r) + 1); });
    reativar.concat(desativar, converter).forEach(function (r) {
      var antigo = porId[txt(r.id)];
      bNovos += antigo ? (bytes(r) - bytes(antigo)) : (bytes(r) + 1);
    });
    return {
      gravar: gravar, reativar: reativar, desativar: desativar, converter: converter,
      recusa: null, avisos: avisos, mudancas: mudancas,
      resumo: { novos: gravar.length, reativados: reativar.length, desativados: desativar.length,
        convertidos: converter.length, orcadoMarcado: Math.round(orcadoMarcado * 100) / 100 },
      bytesNovos: bNovos
    };
  }

  /* ------------------------------------------------------------------
   * CONVERTER OS CENTROS ANTIGOS (§4.0) — a única gravação em registro legado
   * ---------------------------------------------------------------- */
  function converterDados(ccsCrus, escolhas, agora, quem, obraId) {
    var gravar = [], esc = escolhas || {};
    if (temLeitura(ccsCrus)) {
      return { gravar: [], recusa: { motivo: "lista-normalizada", msg: "A lista de centros veio normalizada para leitura — gravar a partir dela adotaria os centros novos sem ninguém pedir." } };
    }
    var porId = {};
    arr(ccsCrus).forEach(function (c) { if (c && txt(c.id)) porId[txt(c.id)] = c; });
    var recusa = null, k;
    for (k in esc) {
      if (!Object.prototype.hasOwnProperty.call(esc, k)) continue;
      var alvo = porId[txt(k)];
      var val = txt(esc[k]);
      if (!alvo) { recusa = { motivo: "conversao-sumiu", id: txt(k), msg: "Um dos centros antigos escolhidos não está mais na lista. Recarregue antes de converter." }; break; }
      if (val !== "lanc" && val !== "obra") { recusa = { motivo: "conversao-invalida", id: txt(k), msg: "Forma de apurar inválida para o centro " + (txt(alvo.codigo) || txt(alvo.id)) + "." }; break; }
      if (obraId !== undefined && txt(obraId) !== "" && txt(alvo.obraId) !== txt(obraId)) {
        recusa = { motivo: "conversao-outra-obra", id: txt(k), msg: "O centro " + (txt(alvo.codigo) || txt(alvo.id)) + " é de outra obra." }; break;
      }
      var d = cloneCC(alvo);
      d.fmt = 2; d.apura = val; d.atualizadoEm = txt(agora);
      d._mudanca = ehFmt2(alvo) ? "apura" : "adocao";
      /* ⚠ `cnv:1` É O QUE TORNA A CONVERSÃO REVERSÍVEL, e ela precisa ser.
         Roteiro do defeito (revisão adversarial da Onda 5, clique real):
         obra com dois centros antigos e R$ 47.000 de gasto → [Converter os
         centros antigos…] → tudo vai a R$ 0,00 e "Sem centro R$ 47.000,00",
         porque centro antigo não tem `origem` e nada cai nele pelo vínculo
         do orçamento. A única porta oferecida era [Ver a fila], e a aba Fila
         responde que o motor (`js/ccagente.js`) ainda não está no aparelho.
         Sem caminho de volta: com `fmt:2` gravado, o cadastro não oferece
         mais "Estimativa: dividido pelo orçado (antigo)" — a opção só é
         montada quando `normalizar` devolve `apura:"rateio"`, o que exige
         que NENHUM centro da obra tenha `fmt:2`. Skill `dinheiro` §6 ao pé
         da letra: trava sem saída.
         Este carimbo diz "este centro ERA antigo e virou novo por conversão"
         — e só quem o tem pode voltar (`desconverter`). Sem ele não dá para
         distinguir o centro convertido do centro PRÓPRIO criado já na régua
         nova, e devolver um centro próprio para o rateio seria rebaixar o que
         a pessoa cadastrou de propósito. */
      if (d._mudanca === "adocao") d.cnv = 1;
      gravar.push(d);
    }
    if (recusa) return { gravar: [], recusa: recusa };
    /* `_mudanca` é informação para a confirmação de pagos (D20) da fiação; ela
       sai do registro antes de gravar. */
    return { gravar: gravar, recusa: null };
  }
  function converter(ccsCrus, escolhas, agora, quem, obraId) {
    var r = converterDados(ccsCrus, escolhas, agora, quem, obraId);
    var limpos = arr(r.gravar).map(function (c) { var d = cloneCC(c); delete d._mudanca; return d; });
    return { gravar: limpos, mudancas: arr(r.gravar).map(function (c) { return { id: txt(c.id), mudanca: txt(c._mudanca) }; }), recusa: r.recusa };
  }

  /* ------------------------------------------------------------------
   * A VOLTA DA CONVERSÃO (skill `dinheiro` §6: toda trava precisa de porta)
   * ------------------------------------------------------------------
   * ⚠ SÓ A OBRA INTEIRA VOLTA, NUNCA UM CENTRO SOZINHO. O modo da obra é
   * derivado da LISTA (`modoDaObra`): basta UM centro `fmt:2` para a obra
   * inteira sair do rateio. Devolver um centro e deixar o outro não repõe
   * nada — a obra continua em "novo" e o centro devolvido passa a apurar por
   * lançamento, que é justamente o que mostrava R$ 0,00. Por isso
   * `podeDesconverter` só responde quando TODOS os `fmt:2` da obra trazem o
   * carimbo `cnv` da conversão: aí a volta reconstrói exatamente o estado de
   * antes. Com um centro gerado do orçamento (tem `origem`) ou um centro
   * próprio no meio, a volta não existe — e ali ela também não faz falta,
   * porque esses centros recebem gasto pelo vínculo do orçamento. */
  function podeDesconverter(obraId, ccsCrus) {
    var listaObra = daObra(ccsCrus, obraId);
    var novos = [], i;
    for (i = 0; i < listaObra.length; i++) if (ehFmt2(listaObra[i])) novos.push(listaObra[i]);
    if (!novos.length) return [];
    for (i = 0; i < novos.length; i++) if (num(novos[i].cnv) !== 1) return [];
    return novos;
  }
  function desconverter(ccsCrus, ids, agora, quem, obraId) {
    void quem;
    if (temLeitura(ccsCrus)) {
      return { gravar: [], recusa: { motivo: "lista-normalizada", msg: "A lista de centros veio normalizada para leitura — gravar a partir dela mudaria a régua da obra sem ninguém pedir." } };
    }
    var podem = {}, elegiveis = podeDesconverter(obraId, ccsCrus);
    elegiveis.forEach(function (c) { podem[txt(c.id)] = c; });
    if (!elegiveis.length) {
      return { gravar: [], recusa: { motivo: "volta-indisponivel", msg: "Esta obra tem centro de custo que não veio de conversão — a volta para a estimativa antiga não vale aqui." } };
    }
    var gravar = [], recusa = null;
    arr(ids).forEach(function (k) {
      if (recusa) return;
      var alvo = podem[txt(k)];
      if (!alvo) { recusa = { motivo: "volta-sumiu", id: txt(k), msg: "Um dos centros escolhidos não é mais um centro convertido. Recarregue antes de voltar." }; return; }
      var d = cloneCC(alvo);
      /* ⚠ SAEM OS TRÊS JUNTOS. `apura` sem `fmt:2` é campo órfão: o
         `normalizar` o ignora com aviso, e o registro ficaria carregando uma
         forma de apurar que ninguém honra. */
      delete d.fmt; delete d.apura; delete d.cnv;
      d.atualizadoEm = txt(agora);
      gravar.push(d);
    });
    if (recusa) return { gravar: [], recusa: recusa };
    /* ⚠ OU VOLTAM TODOS, OU NENHUM: deixar um `fmt:2` de pé mantém a obra em
       modo "novo" e a volta não teria efeito nenhum — a pessoa veria os
       números continuarem zerados depois de uma ação que disse tê-los
       devolvido. */
    if (gravar.length !== elegiveis.length) {
      return { gravar: [], recusa: { motivo: "volta-parcial", msg: "A volta para a estimativa antiga vale para os " + elegiveis.length + " centros da obra de uma vez: com um só convertido, a obra continua na régua nova e os números não voltam." } };
    }
    return { gravar: gravar, recusa: null };
  }

  /* ------------------------------------------------------------------
   * DIFERENÇA DE REVISÃO (§4.7.4) — nada muda sozinho
   * ---------------------------------------------------------------- */
  function diffRevisao(orcNovo, ccsDaObra, familia, opcoes) {
    opcoes = opcoes || {};
    var fam = mapaFamilia(familia);
    if (orcNovo && txt(orcNovo.id)) fam[txt(orcNovo.id)] = true;
    var avisos = [];
    var novas = [], semCorrespondente = [], nomesMudaram = [], orcadoMudou = [];
    if (!orcNovo || !arr(orcNovo.etapas).length) {
      return { novas: [], semCorrespondente: [], nomes: [], orcado: [],
        avisos: [{ tipo: "diff-sem-orcamento", msg: "O orçamento novo não tem etapas — não há o que comparar." }] };
    }
    var ccs = arr(ccsDaObra).filter(function (c) { return origemValida(c && c.origem) && naFamilia(c, fam); });
    var obraId = txt(ccs.length ? ccs[0].obraId : opcoes.obraId);
    var nums = numeracaoDe(orcNovo, opcoes);
    var L = linhasDe(orcNovo, opcoes);
    if (!L) avisos.push({ tipo: "diff-sem-regua-previsto", msg: "O motor do Previsto × Realizado não carregou — o orçado novo não foi calculado." });
    var sol = soltosDaEtapa(orcNovo, opcoes);
    var indice = indicePorNo(ccsDaObra, obraId, fam, orcNovo);

    /* nós que existem no orçamento novo */
    var noExiste = {}, nomeDoNo = {}, etapaDoNo = {};
    arr(orcNovo.etapas).forEach(function (e) {
      if (!e || !txt(e.id)) return;
      noExiste[txt(e.id)] = true; nomeDoNo[txt(e.id)] = txt(e.nome); etapaDoNo[txt(e.id)] = txt(e.id);
      arr(e.subetapas).forEach(function (s) {
        if (!s || !txt(s.id)) return;
        noExiste[txt(s.id)] = true; nomeDoNo[txt(s.id)] = txt(s.nome); etapaDoNo[txt(s.id)] = txt(e.id);
      });
    });

    var temCC = {};
    ccs.forEach(function (c) {
      var o = c.origem, no = txt(o.s) || txt(o.e);
      if (o.g) no = txt(o.e) + "|g";
      temCC[no] = true;
    });

    /* bloco 1 — etapas/subetapas novas, sem centro */
    arr(orcNovo.etapas).forEach(function (e) {
      if (!e || !txt(e.id)) return;
      var eid = txt(e.id);
      var subs = arr(e.subetapas).filter(function (s) { return s && txt(s.id); });
      if (indice.detalhada[eid]) {
        subs.forEach(function (s) {
          var sid = txt(s.id);
          if (temCC[sid]) return;
          novas.push({ etapaId: eid, subEtapaId: sid, no: sid, codigo: txt(nums.sub[sid]),
            nome: tituloBR(s.nome), orcado: L && L.porId[sid] ? num(L.porId[sid].previsto, opcoes) : 0, marcada: true });
        });
        return;
      }
      if (temCC[eid]) return;
      /* ⚠ ETAPA OPCIONAL FORA DA LINHA DE BASE NÃO NASCE MARCADA (K13).
         Quem não gerou centro para a cobertura opcional não quer um a cada
         revisão — e uma lista que vem toda marcada ensina a clicar em
         [Aplicar] sem ler, que é como um centro indesejado entra. */
      var opc = ehOpcional(e) && !naBase(eid, opcoes.base);
      novas.push({ etapaId: eid, subEtapaId: "", no: eid, codigo: txt(nums.etapa[eid]),
        nome: tituloBR(e.nome), orcado: L && L.porId[eid] ? num(L.porId[eid].previsto, opcoes) : 0,
        opcional: ehOpcional(e), marcada: !opc });
    });

    /* blocos 2, 3 e 4 — sobre os centros que existem */
    var temLanc = opcoes.temLancamento || null;
    if (!temLanc) avisos.push({ tipo: "diff-sem-lancamentos", msg: "Não sei quais centros têm lançamento — nenhum vem marcado para desativar." });
    ccs.forEach(function (c) {
      var o = c.origem, e = txt(o.e), s = txt(o.s);
      var no = s || e;
      var existe = o.g ? !!noExiste[e] : !!noExiste[no];
      if (!existe) {
        /* ⚠ SEM CORRESPONDENTE NÃO É "PODE APAGAR". A etapa pode ter sido
           dividida em duas com ids novos, e o gasto do ano continua neste
           centro. Com lançamento, ele fica ATIVO e a marcação nasce desligada;
           sem saber, também nasce desligada — a escolha é da pessoa. */
        var comLanc = temLanc ? !!temLanc[txt(c.id)] : null;
        semCorrespondente.push({ ccId: txt(c.id), codigo: txt(c.codigo), nome: txt(c.nome),
          temLancamento: comLanc, marcada: comLanc === false });
        return;
      }
      var nomeOrc = o.g ? nomeDoNo[e] : nomeDoNo[no];
      var numOrc = o.g ? txt(nums.etapa[e]) : (s ? txt(nums.sub[s]) : txt(nums.etapa[e]));
      /* ⚠ SÓ PROPÕE TROCAR O NOME SE A PESSOA NUNCA O MUDOU. `origem.nm`
         guarda o nome que o orçamento tinha na geração; se o nome de hoje
         ainda é o gerado a partir dele, o apelido é do sistema e pode seguir o
         orçamento. Se ela renomeou, "Usar o nome do orçamento" nasce
         desmarcada — renomear de volta apagaria o trabalho dela em silêncio. */
      var aindaGerado = txt(c.nome) === tituloBR(txt(o.nm)) || txt(c.nome) === txt(o.nm);
      if (txt(nomeOrc) && txt(o.nm) !== txt(nomeOrc)) {
        nomesMudaram.push({ ccId: txt(c.id), de: txt(c.nome), para: tituloBR(nomeOrc),
          codigoDe: txt(c.codigo), codigoPara: numOrc, marcada: aindaGerado });
      } else if (numOrc && txt(c.codigo) && txt(c.codigo) !== numOrc && aindaGerado) {
        nomesMudaram.push({ ccId: txt(c.id), de: txt(c.nome), para: txt(c.nome),
          codigoDe: txt(c.codigo), codigoPara: numOrc, marcada: true });
      }
      var novoOrc = orcadoDe(c, { orc: orcNovo, familia: fam, linhas: L, indice: indice, soltos: sol, num: opcoes.num });
      var antes = num(c.valorOrcado, opcoes);
      if (Math.abs(novoOrc.valor - antes) > 0.005) {
        orcadoMudou.push({ ccId: txt(c.id), codigo: txt(c.codigo), nome: txt(c.nome), de: antes, para: novoOrc.valor, fonte: novoOrc.fonte });
      }
    });

    return { novas: novas, semCorrespondente: semCorrespondente, nomes: nomesMudaram, orcado: orcadoMudou,
      indice: indice, avisos: avisos };
  }

  /* `aplicarDiff` devolve os registros a gravar do [Atualizar pelo orçamento].
     ⚠ NUNCA reescreve `origem` (a identidade do centro) e NUNCA toca
     lançamento: o que muda de centro é consequência do vínculo, e quem mostra
     isso é `movimentos`. */
  function aplicarDiff(diff, escolhas, orcNovo, obraId, agora, quem, ccsCrus, opcoes) {
    escolhas = escolhas || {}; opcoes = opcoes || {};
    if (temLeitura(ccsCrus)) return { gravar: [], recusa: { motivo: "lista-normalizada", msg: "A lista de centros veio normalizada para leitura." } };
    var porId = {};
    arr(ccsCrus).forEach(function (c) { if (c && txt(c.id)) porId[txt(c.id)] = c; });
    var gravar = [], raiz = txt(opcoes.raiz) || raizDaCadeia(orcNovo, opcoes.orcamentos) || txt(orcNovo && orcNovo.id);
    var nums = numeracaoDe(orcNovo, opcoes), L = linhasDe(orcNovo, opcoes), sol = soltosDaEtapa(orcNovo, opcoes);

    arr(diff && diff.novas).forEach(function (n) {
      var marcada = (escolhas.novas && escolhas.novas[n.no] !== undefined) ? !!escolhas.novas[n.no] : !!n.marcada;
      if (!marcada) return;
      var nomeOrc = txt(n.nome);
      var origem = { t: "orc", o: txt(orcNovo.id), r: raiz, e: txt(n.etapaId), s: txt(n.subEtapaId), g: 0,
        n: txt(n.codigo), nm: nomeOrc };
      var id = idGerado(obraId, origem);
      if (porId[id]) return;   /* já existe com esse id: a porta é o id-ocupado da geração */
      gravar.push(registroGerado({ idGerado: id, codigo: txt(n.codigo), nome: nomeOrc, orcado: n.orcado, origem: origem }, obraId, agora, quem));
    });
    arr(diff && diff.semCorrespondente).forEach(function (s) {
      var marcada = (escolhas.desativar && escolhas.desativar[s.ccId] !== undefined) ? !!escolhas.desativar[s.ccId] : !!s.marcada;
      if (!marcada) return;
      var c = porId[s.ccId]; if (!c) return;
      var d = cloneCC(c);
      d.ativo = false; d.desativadoEm = txt(agora); d.desativadoPor = txt(quem); d.atualizadoEm = txt(agora);
      gravar.push(d);
    });
    arr(diff && diff.nomes).forEach(function (nm) {
      var marcada = (escolhas.nomes && escolhas.nomes[nm.ccId] !== undefined) ? !!escolhas.nomes[nm.ccId] : !!nm.marcada;
      if (!marcada) return;
      var c = porId[nm.ccId]; if (!c) return;
      var d = cloneCC(c);
      d.nome = txt(nm.para) || d.nome;
      if (txt(nm.codigoPara)) d.codigo = txt(nm.codigoPara);
      d.atualizadoEm = txt(agora);
      gravar.push(d);
    });
    /* orçado: foto nova + carimbo de qual orçamento atualizou */
    arr(diff && diff.orcado).forEach(function (o) {
      var c = porId[o.ccId]; if (!c) return;
      var ja = null, i;
      for (i = 0; i < gravar.length; i++) if (txt(gravar[i].id) === txt(o.ccId)) ja = gravar[i];
      var d = ja || cloneCC(c);
      d.valorOrcado = Math.round(num(o.para) * 100) / 100;
      d.atualizadoPeloOrc = { o: txt(orcNovo.id), em: txt(agora) };
      d.atualizadoEm = txt(agora);
      if (!ja) gravar.push(d);
    });
    void nums; void L; void sol;
    return { gravar: gravar, recusa: null };
  }

  /* ------------------------------------------------------------------
   * DOCUMENTO DE COMPRA (§1.8) — o único dono de `ccId`/`etapaId`
   * ---------------------------------------------------------------- */
  function doDocumento(objDoc, cc, ctx) {
    ctx = ctx || {};
    if (!obj(objDoc)) return { ok: false, recusa: "Documento inválido." };
    var copia = !!ctx.copia;

    if (!cc) {
      delete objDoc.ccId; delete objDoc.etapaId;
      return { ok: true, mudou: true, aviso: "" };
    }
    var ativo = !(cc.ativo === false || cc.ativo === 0 || cc.ativo === "0");
    var atual = txt(objDoc.ccId) === txt(cc.id);
    var outraObra = txt(cc.obraId) && txt(ctx.obraId) && txt(cc.obraId) !== txt(ctx.obraId);

    /* ⚠ NA CÓPIA DA CADEIA (requisição → cotação → pedido) NUNCA SE RECUSA.
       Recusar ali trava a criação do PEDIDO por causa de um centro que alguém
       desativou meses depois — a pessoa fica sem conseguir comprar e o motivo
       aparece num campo que ela nem estava olhando. O documento novo nasce SEM
       centro e o recado diz exatamente isso (crítica D21). */
    if (!ativo && !atual) {
      if (copia) {
        delete objDoc.ccId; delete objDoc.etapaId;
        return { ok: true, mudou: true, aviso: "O centro " + (txt(cc.codigo) || txt(cc.nome)) + " está desativado — o documento novo nasceu sem centro." };
      }
      return { ok: false, recusa: "O centro " + (txt(cc.codigo) || txt(cc.nome)) + " está desativado. Reative-o ou escolha outro." };
    }
    if (outraObra) {
      if (copia) {
        delete objDoc.ccId; delete objDoc.etapaId;
        return { ok: true, mudou: true, aviso: "O centro " + (txt(cc.codigo) || txt(cc.nome)) + " é de outra obra — o documento novo nasceu sem centro." };
      }
      return { ok: false, recusa: "O centro " + (txt(cc.codigo) || txt(cc.nome)) + " é de outra obra." };
    }
    /* ⚠ PEDIDO COM DESPESA VIVA NÃO SE REESCREVE POR AQUI. A despesa já está
       no Financeiro com o carimbo do pedido; trocar o centro no documento
       moveria o dinheiro sem passar pela confirmação de pago (D20, skill
       `dinheiro` §4). A porta é [Mudar centro], que pergunta com o valor. */
    if (!copia && ctx.despesaDoPedido) {
      var d = ctx.despesaDoPedido;
      return { ok: false, recusa: "Este pedido já tem despesa no Financeiro (" + fmt(d.valor) +
        (txt(d.dataPgto) ? ", paga em " + txt(d.dataPgto) : "") + "). Use [Mudar centro] — ele pede a confirmação e não reescreve o pedido." };
    }

    objDoc.ccId = txt(cc.id);
    var o = origemValida(cc.origem);
    /* ⚠ `etapaId` DERIVA DO CENTRO, E SÓ DAQUI. Centro gerado leva o nó dele;
       centro próprio ou da empresa não tem nó, e deixar o `etapaId` antigo
       apontando para a etapa de outro centro mandaria a despesa da entrega
       para uma etapa que ninguém escolheu. */
    if (o) objDoc.etapaId = txt(o.s) || txt(o.e);
    else delete objDoc.etapaId;
    return { ok: true, mudou: true, aviso: "" };
  }

  /* ------------------------------------------------------------------
   * RECRIAR (§4.7.6) — o centro apagado que ainda tem dinheiro apontando
   * ---------------------------------------------------------------- */
  function recriar(idSumido, obra, familia, orcs, agora, quem, opcoes) {
    opcoes = opcoes || {};
    var alvo = txt(idSumido), obraId = txt(obra && obra.id);
    var fam = mapaFamilia(familia);
    var lista = arr(orcs).filter(function (o) { return o && txt(o.id) && (!Object.keys(fam).length || fam[txt(o.id)]); });
    var achado = null;
    lista.forEach(function (o) {
      if (achado) return;
      var raiz = txt(opcoes.raiz) || raizDaCadeia(o, orcs);
      var nums = numeracaoLocal(o);
      var L = linhasDe(o, opcoes), sol = soltosDaEtapa(o, opcoes);
      arr(o.etapas).forEach(function (e) {
        if (achado || !e || !txt(e.id)) return;
        var eid = txt(e.id);
        var cands = [];
        cands.push({ s: "", g: 0, nm: txt(e.nome), n: txt(nums.etapa[eid]), orcado: L && L.porId[eid] ? num(L.porId[eid].previsto, opcoes) : 0 });
        cands.push({ s: "", g: 1, nm: txt(e.nome), n: txt(nums.etapa[eid]), orcado: num(sol[eid], opcoes) });
        arr(e.subetapas).forEach(function (s) {
          if (!s || !txt(s.id)) return;
          cands.push({ s: txt(s.id), g: 0, nm: txt(s.nome), n: txt(nums.sub[txt(s.id)]),
            orcado: L && L.porId[txt(s.id)] ? num(L.porId[txt(s.id)].previsto, opcoes) : 0 });
        });
        cands.forEach(function (c) {
          if (achado) return;
          var origem = { t: "orc", o: txt(o.id), r: raiz, e: eid, s: c.s, g: c.g, n: c.n, nm: c.nm };
          if (idGerado(obraId, origem) !== alvo) return;
          achado = registroGerado({ idGerado: alvo, codigo: c.n, nome: tituloBR(c.nm), orcado: c.orcado, origem: origem }, obraId, agora, quem);
        });
      });
    });
    if (achado) return { cc: achado, refeito: true, msg: "O centro foi refeito a partir do orçamento, com o nome e a numeração de lá.", avisos: [] };

    /* ⚠ O NOME ORIGINAL MORREU COM A LÁPIDE, E O APP NÃO O INVENTA.
       Sem correspondência no orçamento, nasce um centro PRÓPRIO com o mesmo
       id (para o dinheiro voltar a apontar para algo) e um nome que diz a
       verdade: o que aconteceu, e que a pessoa pode renomear. */
    return {
      cc: { id: alvo, codigo: "?", nome: "centro apagado (id " + alvo.slice(0, 6) + "…)", tipo: "direto",
        obraId: obraId, valorOrcado: 0, obs: "", fmt: 2, apura: "lanc",
        criadoEm: txt(agora), atualizadoEm: txt(agora) },
      refeito: false,
      msg: "Não achei este centro em nenhum orçamento da obra. Ele volta como centro próprio, com o mesmo id, e você pode dar o nome — o nome original foi apagado junto com o centro.",
      avisos: [{ tipo: "recriar-sem-origem", msg: "Centro recriado sem origem no orçamento." }]
    };
  }

  /* ------------------------------------------------------------------
   * ARQUIVAR (§4.7.5) — libera espaço sem mudar número nenhum
   * ---------------------------------------------------------------- */
  function arquivar(ccsDaObra, ctx, agora) {
    ctx = ctx || {};
    var gravar = [], avisos = [], antes = 0, depois = 0;
    if (temLeitura(ccsDaObra)) return { gravar: [], recusa: { motivo: "lista-normalizada", msg: "A lista de centros veio normalizada para leitura." }, avisos: [] };
    arr(ccsDaObra).forEach(function (c) {
      if (!c || !origemValida(c.origem)) return;          /* só o gerado arquiva: o próprio não tem o que perder */
      if (num(c.arq) === 1) return;                       /* já arquivado */
      antes += bytes(c) + 1;
      /* ⚠ O ORÇADO VIRA FOTO, E A FOTO TEM DE SER O NÚMERO QUE ESTÁ NA TELA.
         Depois de arquivar, `orcadoDe` lê `valorOrcado` (o orçamento pode nem
         estar mais neste aparelho). Se a foto ficasse com o valor antigo, o
         KPI "Orçado" mudaria no clique de um botão que promete não mudar
         número nenhum. Sem como calcular o vivo, o valor ANTIGO fica e o aviso
         diz isso — nunca um zero. */
      var vivo = null;
      if (ctx.orc) {
        var r = orcadoDe(c, ctx);
        if (r.fonte === "vivo" || r.fonte === "substituido") vivo = r.valor;
      }
      if (vivo === null) avisos.push({ tipo: "arquivar-sem-orcado-vivo", msg: "O orçamento não está neste aparelho — o centro " + (txt(c.codigo) || txt(c.id)) + " foi arquivado com o valor orçado que já estava gravado." });

      var d = cloneCC(c);
      d.arq = 1;
      d.valorOrcado = vivo === null ? Math.round(num(c.valorOrcado, ctx) * 100) / 100 : Math.round(vivo * 100) / 100;
      delete d.obs; delete d.desativadoPor; delete d.atualizadoPeloOrc;
      if (d.origem) { delete d.origem.o; delete d.origem.n; delete d.origem.nm; delete d.origem.em; delete d.origem.por; }
      d.fmt = 2;
      if (d.apura !== "lanc" && d.apura !== "obra") d.apura = "lanc";
      d.atualizadoEm = txt(agora);
      depois += bytes(d) + 1;
      gravar.push(d);
    });
    /* ⚠ `liberado` PODE SER NEGATIVO, E A TELA PRECISA SABER.
       Arquivar tira campos, mas acrescenta `arq` e mexe no `atualizadoEm`: um
       centro que já estava enxuto (sem observação, sem quem desativou) CRESCE
       ao ser arquivado. Devolver `Math.max(0, …)` faria a porta prometer
       "libera 0 KB" num caso em que ela na verdade GASTA — e a instalação que
       está batendo no teto arquivaria tudo e continuaria travada, agora sem
       saber por quê. */
    if (gravar.length && depois > antes) {
      avisos.push({ tipo: "arquivar-nao-libera", msg: "Estes centros já estão enxutos: arquivar não libera espaço (gastaria " + (depois - antes) + " bytes). Para liberar, a porta é [Excluir centros sem uso]." });
    }
    return { gravar: gravar, recusa: null, bytesAntes: antes, bytesDepois: depois,
      liberado: antes - depois, avisos: avisos };
  }

  /* ------------------------------------------------------------------
   * OPÇÕES DOS SELECTS DE CENTRO (§1.15-4 e §4.10)
   *
   * ⚠ SELECT QUE NÃO SABE REPRESENTAR O VALOR GRAVADO APAGA O VALOR.
   * Já aconteceu nesta base: o formulário regrava o registro a partir do que o
   * select mostra, e um centro apagado (ou de outra obra) que não tem opção
   * some do documento no primeiro save — sem ninguém tocar naquele campo.
   * Por isso a opção que PRESERVA nasce aqui, junto com a lista.
   * ---------------------------------------------------------------- */
  function optsDados(ccsCrus, obraId, atualId, ctx) {
    ctx = ctx || {};
    var fam = mapaFamilia(ctx.familia);
    var opts = [], avisos = [], vistos = {};
    var alvo = txt(obraId), atual = txt(atualId);

    var primeira = { v: "", t: "— sem centro de custo —", fonte: "" };
    if (ctx.efetivo && txt(ctx.efetivo.texto)) primeira = { v: "", t: txt(ctx.efetivo.texto), fonte: txt(ctx.efetivo.fonte) };
    opts.push(primeira);

    var porId = {};
    arr(ccsCrus).forEach(function (c) { if (c && txt(c.id)) porId[txt(c.id)] = c; });

    arr(ccsCrus).forEach(function (c) {
      if (!c || !txt(c.id)) return;
      var meu = txt(c.obraId) === alvo;
      var daEmpresa = !txt(c.obraId);
      if (!meu && !(daEmpresa && ctx.podeEmpresa !== false)) return;
      var ativo = !(c.ativo === false || c.ativo === 0 || c.ativo === "0");
      if (!ativo && txt(c.id) !== atual) return;      /* desativado só aparece se for o atual */
      if (num(c.arq) === 1 && txt(c.id) !== atual) return;
      var rot = (txt(c.codigo) ? txt(c.codigo) + " " : "") + txt(c.nome);
      if (!ativo) rot += " (desativado)";
      if (daEmpresa && alvo) rot += " (centro da empresa)";
      vistos[txt(c.id)] = true;
      opts.push({ v: txt(c.id), t: rot, sel: txt(c.id) === atual });
    });

    /* a opção que PRESERVA o valor gravado */
    if (atual && !vistos[atual]) {
      var c2 = porId[atual];
      if (!c2) {
        opts.push({ v: atual, t: "(centro apagado — id " + atual.slice(0, 6) + "…, não foi apagado do documento)", sel: true, preserva: true });
        avisos.push({ tipo: "destino-sumiu", msg: "O centro gravado neste documento não existe mais na lista." });
      } else {
        opts.push({ v: atual, t: (txt(c2.codigo) || txt(c2.nome)) + " (de outra obra)", sel: true, preserva: true });
        avisos.push({ tipo: "destino-outra-obra", msg: "O centro gravado neste documento é de outra obra." });
      }
    }

    /* decisão em partes: só leitura, com a porta [Mudar] */
    var dec = obj(ctx.decisao);
    if (dec && arr(dec.pt).length) {
      opts = [{ v: "__partes__", t: "Dividido em " + arr(dec.pt).length + " centros", sel: true, ro: true }];
    } else if (dec && txt(dec.cc)) {
      var marcou = false;
      opts.forEach(function (o) { o.sel = txt(o.v) === txt(dec.cc); if (o.sel) marcou = true; });
      if (marcou) {
        opts.forEach(function (o) {
          if (!o.sel) return;
          if (txt(dec.por) || txt(dec.em)) o.t += " (decidido por " + (txt(dec.por) || "alguém") + (txt(dec.em) ? " em " + txt(dec.em) : "") + ")";
        });
      }
    }

    /* ⚠ "DECIDIR DEPOIS (FILA)" SÓ APARECE QUANDO HÁ DECISÃO A DESFAZER.
       Oferecer "mandar para a fila" num documento que nunca teve decisão é
       oferecer um botão que não faz nada — e o próximo clique ensina que a
       tela mente. */
    if (ctx.incluirFila && dec) opts.push({ v: "__fila__", t: "— decidir depois (fila) —" });

    void fam;
    return { opts: opts, avisos: avisos };
  }

  /* ------------------------------------------------------------------ */
  var CentroCusto = {
    /* identidade */
    idGerado: idGerado,
    chaveGerado: chaveGerado,
    /* leitura do legado */
    modoDaObra: modoDaObra,
    normalizar: normalizar,
    apontaPara: apontaPara,
    abracaAObra: abracaAObra,
    /* orçamento */
    noDoItem: noDoItem,
    indicePorNo: indicePorNo,
    centroDoNo: centroDoNo,
    orcadoDe: orcadoDe,
    natureza: natureza,
    /* geração e manutenção */
    previa: previa,
    movimentos: movimentos,
    aplicarPrevia: aplicarPrevia,
    converter: converter,
    podeDesconverter: podeDesconverter,
    desconverter: desconverter,
    diffRevisao: diffRevisao,
    aplicarDiff: aplicarDiff,
    doDocumento: doDocumento,
    recriar: recriar,
    arquivar: arquivar,
    optsDados: optsDados,
    /* tetos de nuvem */
    TETO_CC_BYTES: TETO_CC_BYTES,
    TETO_REGRAS: TETO_REGRAS,
    TETO_REGRAS_BYTES: TETO_REGRAS_BYTES,
    TETO_APROP: TETO_APROP,
    TETO_APROP_BYTES: TETO_APROP_BYTES,
    cabe: cabe,
    bytes: bytes,
    /* auxiliares expostos de propósito: o agente usa a MESMA régua de divisão
       e a MESMA leitura de origem, em vez de escrever a dele */
    dividirCentavos: dividirCentavos,
    origemValida: origemValida,
    tituloBR: tituloBR,
    raizDaCadeia: raizDaCadeia,
    _fnv1a32hex: fnv1a32hex,
    _djb2hex: djb2hex,
    _soltosDaEtapa: soltosDaEtapa,
    _numeracao: numeracaoLocal
  };

  global.CentroCusto = CentroCusto;
  if (typeof module !== "undefined" && module.exports) module.exports = CentroCusto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
