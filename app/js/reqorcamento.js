/* =====================================================================
 * reqorcamento.js — REQUISIÇÕES GERADAS DO ORÇAMENTO, COM TRAVA DE SALDO
 *
 * O QUE ESTE MOTOR RESPONDE
 * "Do que o orçamento desta obra manda comprar, quanto AINDA falta pedir?"
 * Cada item do orçamento é explodido em insumos (quantidade do item x
 * coeficiente), só MATERIAL e EQUIPAMENTO ficam (mão de obra não se compra
 * por requisição), e o resultado é somado por (etapa do orçamento, insumo).
 * Dessa demanda sai o que as requisições já pediram — e o que sobra é o
 * SALDO, a única quantidade que o gerador aceita criar.
 *
 * ⚠ A LIGAÇÃO É POR CARIMBO, NUNCA POR SEMELHANÇA (skill `dinheiro` §2).
 *   Cada item gerado leva `origemOrc: { orcamentoId, etapaId, itemId?,
 *   insumoCodigo, insumoFonte, chave }`; a requisição leva `origemOrc:
 *   { orcamentoId, modo, chave }`. "Já requisitado" é SÓ o que tem esse
 *   carimbo. Requisição digitada à mão com "cimento" na descrição não é
 *   contada — casar por texto trancaria um saldo legítimo (dois cimentos
 *   diferentes) ou liberaria um duplicado (a descrição editada deixa de
 *   casar). O recado da tela diz "requisições GERADAS DO ORÇAMENTO", e não
 *   "tudo que já foi comprado para a obra", para não mentir sobre o alcance.
 *
 * ⚠ A TRAVA TEM PORTA (skill `dinheiro` §6). Saldo zero trava a geração;
 *   a saída é desfazer o que consumiu o saldo:
 *     - requisição CANCELADA ou REJEITADA devolve o saldo…
 *     - …a menos que um PEDIDO vivo aponte para ela (`requisicaoId`): o
 *       material foi comprado, e cancelar a requisição por cima do pedido não
 *       desfaz a compra. A porta então é cancelar (ou rejeitar) o pedido em
 *       Compras.
 *     - tirar o item da requisição (ou baixar a quantidade) devolve a parte —
 *       também só enquanto não há pedido vivo: com pedido, conta o MAIOR
 *       entre o que a requisição pede e o que o pedido carimbado compra.
 *   Sem a porta, a pessoa aprenderia a rejeitar requisição boa para "liberar"
 *   o gerador — e a rejeição fica registrada como decisão de quem aprova.
 *
 * ⚠ O CARIMBO VIAJA ATÉ O PEDIDO (1.2.98). Requisição → cotação → pedido do
 *   Mapa: cada item da cotação leva o `origemOrc` e o `reqItemId` do item da
 *   requisição, e o item do pedido os herda pelo `itemIdx` (posição na
 *   cotação que o gerou — ligação por id, nunca por texto). Roteiro do defeito
 *   que isto fecha: a cotação montada pelo gerador saía SEM carimbo, o Mapa
 *   gerava o pedido sem carimbo, alguém excluía a requisição comprada e o
 *   saldo voltava inteiro com o pedido de pé — o gestor gerava e comprava os
 *   mesmos 500 kg de cimento de novo. Pedido de antes desta versão continua
 *   sem carimbo: enquanto a requisição dele existir, é ela que segura.
 *
 * ⚠ REVISÃO DO ORÇAMENTO NÃO ZERA O QUE FOI PEDIDO. A revisão é um orçamento
 *   novo (`Orcamento.novaRevisao`: id novo, `revisaoDe` → origem), mas as
 *   etapas e os itens são clonados com os MESMOS ids. Por isso o saldo é da
 *   FAMÍLIA (a origem e todas as revisões ligadas por `revisaoDe`): a revisão
 *   que aumenta a quantidade gera só a diferença, e a que diminui aparece
 *   como "requisitado acima do orçado".
 *
 * ⚠ O QUE NÃO ABRE EM INSUMO NÃO SOME. Item sem composição, composição sem
 *   insumos, subcomposição que a base carregada não detalha: vão para
 *   `naoDetalhado` com o motivo, como em js/insumosorc.js. Lista de compras
 *   curta com cara de completa faz comprar material a menos.
 *
 * Motor puro: sem DOM, sem Store, sem rede. A tela (js/gestao.js,
 * `reqDoOrcamento`) passa o orçamento, um resolvedor de composições e as
 * listas cruas; aqui só a conta.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ QUANTIDADE SEM ESCREVER MAIS UM PARSER — mesma régua de
     js/compraslinha.js: delega ao `Util.num` quando ele existe (navegador),
     e o caminho de baixo só atende número ou string já normalizada (Node). */
  function num(v) {
    if (typeof Util !== "undefined" && Util && Util.num) return Util.num(v);
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? "" : v));
    return isFinite(n) ? n : 0;
  }
  function txt(v) { return v == null ? "" : String(v).trim(); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : null; }
  /* quatro casas: é a precisão do coeficiente SINAPI. Sem isto 0,1 + 0,2 vira
     0,30000000000000004 na tela e o saldo "zero" sai 1e-17 — gerável. */
  function r4(x) { var n = Number(x) || 0; return Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 10000) / 10000; }
  function r2(x) { var n = Number(x) || 0; return Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  var TOL = 0.00005;
  var MAX_PROF = 6;
  function semAcento(s) {
    s = String(s == null ? "" : s);
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s;
  }
  function norm(s) { return semAcento(s).toLowerCase().replace(/\s+/g, " ").trim(); }

  /* ------------------------------------------------------------------
   * CLASSIFICAÇÃO DO INSUMO — MO / MAT / EQ
   * `tipoInsumo` (analítico SINAPI: "material", "equipamento", "mao_obra")
   * vence `categoria`, porque o analítico carimba categoria "MAT" em
   * subcomposição de equipamento (88830 BETONEIRA … CHP sai "MAT" com
   * razões 0,67/0,33). A régua de categoria é a do `ComposicaoPropria.catDe`
   * ("MAO DE OBRA", "M.O.", "encargo" → MO; "equip" → EQ; resto → MAT), e a
   * descrição "COM ENCARGOS COMPLEMENTARES" é a convenção da casa para hora
   * de profissional (ver o `data-cp-add` do app.js).
   * ---------------------------------------------------------------- */
  var RE_MO_DESC = / COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/;
  function categoria(ins) {
    ins = ins || {};
    var ti = norm(ins.tipoInsumo);
    if (ti) {
      if (/mao/.test(ti)) return "MO";
      if (/equip/.test(ti)) return "EQ";
      if (/mater/.test(ti)) return "MAT";
    }
    var c = norm(ins.categoria).replace(/\s+/g, "");
    if (c === "mo" || /mao|m\.o|encargo/.test(c)) return "MO";
    if (c === "eq" || /equip/.test(c)) return "EQ";
    if (RE_MO_DESC.test(semAcento(ins.descricao).toUpperCase())) return "MO";
    return "MAT";
  }
  function ehComposicao(ins) {
    ins = ins || {};
    var t = norm(ins.tipo || ins.tipoItem);
    if (t === "composicao") return true;
    return /composicao/.test(norm(ins.categoria));
  }
  function ehInsumoRegistro(rec) {
    if (!rec) return false;
    return /insumo/.test(norm(rec.tipoItem || rec.tipo));
  }

  /* Fonte normalizada: o mesmo código numérico existe em bases diferentes
     (SINAPI 1379 e SETOP 1379 são insumos distintos), então a fonte entra na
     chave. Insumo do analítico SINAPI não traz fonte — é SINAPI. */
  function normFonte(f) {
    var F = semAcento(f).toUpperCase().replace(/\s+/g, "");
    if (!F || F === "SINAPI" || F === "SINAPI_DES" || F === "SINAPI-DES" || F === "ISD" || F === "CSD") return "SINAPI";
    if (F === "PROPRIA" || F === "PROPRIO") return "PROPRIA";
    return F;
  }
  /* ⚠ CHAVE DO INSUMO. Com código: fonte + código (identidade de cadastro).
     Sem código (insumo de composição própria antiga): descrição + unidade
     EXATAS, só sem caixa e espaço repetido — sem tirar pontuação nem
     aproximar. Isto é identidade de texto dentro do MESMO orçamento, não
     casamento com lançamento de outro módulo. */
  function chaveInsumo(ins) {
    ins = ins || {};
    var c = txt(ins.codigo);
    if (c) return normFonte(ins.fonte) + ":" + c;
    return "d:" + norm(ins.descricao) + "|" + norm(ins.unidade);
  }
  function chaveDoCarimbo(o) {
    if (!o) return "";
    if (txt(o.chave)) return txt(o.chave);
    return chaveInsumo({ codigo: o.insumoCodigo, fonte: o.insumoFonte, descricao: o.insumoDescricao, unidade: o.insumoUnidade });
  }

  /* fornecedor de referência: `{ id, nome }` ou só o id em texto */
  function normFornecedorRef(ref) {
    if (!ref) return null;
    if (typeof ref === "string" || typeof ref === "number") {
      var s = txt(ref);
      return s ? { id: s, nome: "" } : null;
    }
    var o = obj(ref); if (!o) return null;
    var id = txt(o.id || o.fornecedorId), nome = txt(o.nome || o.fornecedorNome);
    if (!id && !nome) return null;
    return { id: id, nome: nome };
  }

  /* ------------------------------------------------------------------
   * FAMÍLIA DO ORÇAMENTO — a origem e as revisões (componente conexo por
   * `revisaoDe`, nos dois sentidos). Conservador de propósito: contar a
   * requisição de uma revisão irmã como "já pedida" pode esconder saldo, mas
   * nunca faz comprar duas vezes — e comprar duas vezes é o defeito caro.
   * ---------------------------------------------------------------- */
  function familia(orc, orcamentos) {
    var ids = {}, lista = [];
    var raiz = txt(orc && orc.id);
    if (!raiz) return { ids: ids, lista: lista };
    var viz = {};
    function liga(a, b) {
      if (!a || !b || a === b) return;
      (viz[a] = viz[a] || []).push(b);
      (viz[b] = viz[b] || []).push(a);
    }
    arr(orcamentos).concat([orc]).forEach(function (o) { if (o && o.id) liga(txt(o.id), txt(o.revisaoDe)); });
    var fila = [raiz]; ids[raiz] = 1;
    while (fila.length) {
      var at = fila.shift(); lista.push(at);
      arr(viz[at]).forEach(function (x) { if (!ids[x]) { ids[x] = 1; fila.push(x); } });
    }
    return { ids: ids, lista: lista };
  }

  /* ------------------------------------------------------------------
   * DEMANDA — o orçamento explodido em (etapa, insumo)
   *
   *   R.composicao(codigo, fonte, topo) -> { insumos: [...] } | null
   *   R.insumo(codigo, fonte)           -> registro do cadastro | null
   *   R.motivoSem(codigo, fonte)        -> texto | ""   (opcional)
   * ---------------------------------------------------------------- */
  function demanda(orc, R, opc) {
    opc = opc || {}; R = R || {};
    var comp = typeof R.composicao === "function" ? R.composicao : function () { return null; };
    var insR = typeof R.insumo === "function" ? R.insumo : function () { return null; };
    var mot = typeof R.motivoSem === "function" ? R.motivoSem : function () { return ""; };
    var porChave = {}, ordem = [], naoDet = [], mo = { n: 0, valor: 0 }, nItens = 0;

    function acumular(base, ins, qi, rec) {
      var cat = categoria(ins);
      var ch = chaveInsumo(ins);
      var k = base.etapaId + "|" + ch;
      var L = porChave[k];
      var preco = num(ins.custoUnitario);
      var ref = normFornecedorRef(ins.fornecedorRef) || normFornecedorRef(rec && rec.fornecedorRef);
      var grupo = txt(ins.grupo) || txt(rec && rec.grupo);
      if (!L) {
        L = porChave[k] = {
          k: k, chave: ch, etapaId: base.etapaId, etapaNome: base.etapaNome, etapaNumero: base.etapaNumero,
          etapaOpcional: base.opcional, insumoCodigo: txt(ins.codigo), insumoFonte: normFonte(ins.fonte),
          descricao: txt(ins.descricao) || txt(rec && rec.descricao), unidade: txt(ins.unidade) || txt(rec && rec.unidade) || "un",
          categoria: cat, grupo: grupo, fornecedorRef: ref, precoRef: preco > 0 ? preco : 0,
          quantidade: 0, valor: 0, itemIds: [], precoDivergente: false, fornecedorDivergente: false
        };
        ordem.push(k);
      } else {
        if (preco > 0) {
          if (!(L.precoRef > 0)) L.precoRef = preco;
          else if (Math.abs(L.precoRef - preco) > 0.005) L.precoDivergente = true;
        }
        if (ref) {
          if (!L.fornecedorRef) L.fornecedorRef = ref;
          else if ((L.fornecedorRef.id || L.fornecedorRef.nome) !== (ref.id || ref.nome)) L.fornecedorDivergente = true;
        }
        if (!L.grupo && grupo) L.grupo = grupo;
      }
      L.quantidade += qi;
      L.valor += qi * preco;
      if (base.itemId && L.itemIds.indexOf(base.itemId) < 0) L.itemIds.push(base.itemId);
    }

    function fora(base, cod, desc, und, q, valor, motivo, nivel) {
      naoDet.push({
        etapaId: base.etapaId, etapaNome: base.etapaNome, etapaNumero: base.etapaNumero, itemId: base.itemId || "",
        codigo: txt(cod), descricao: txt(desc), unidade: txt(und), quantidade: r4(q), valor: r2(valor),
        motivo: motivo, nivel: nivel || "item"
      });
    }

    /* abre uma lista de insumos multiplicando pela quantidade do pai. A
       subcomposição de MATERIAL (argamassa, concreto feito na obra) é aberta
       de novo: não se compra "argamassa 1:2:8", compra-se cimento, cal e
       areia. A de EQUIPAMENTO (CHP/CHI) fica como hora de equipamento — abrir
       daria "0,0003 betoneira" de depreciação, que ninguém compra. */
    function abrir(insumos, qPai, base, prof, visitados, coefAjust) {
      arr(insumos).forEach(function (i) {
        if (!i) return;
        var cod = txt(i.codigo);
        var coef = (coefAjust && cod && coefAjust[cod] != null && coefAjust[cod] !== "") ? num(coefAjust[cod]) : num(i.coeficiente);
        var qi = qPai * coef;
        if (!(qi > 0)) return;
        var cat = categoria(i);
        if (cat === "MO") { mo.n++; mo.valor += qi * num(i.custoUnitario); return; }
        if (ehComposicao(i) && cat !== "EQ") {
          var ja = visitados[normFonte(i.fonte) + ":" + cod];
          var sub = (cod && prof < MAX_PROF && !ja) ? comp(cod, i.fonte, false) : null;
          if (sub && arr(sub.insumos).length) {
            var v2 = {}; for (var kv in visitados) if (Object.prototype.hasOwnProperty.call(visitados, kv)) v2[kv] = 1;
            v2[normFonte(i.fonte) + ":" + cod] = 1;
            abrir(sub.insumos, qi, base, prof + 1, v2, null);
            return;
          }
          fora(base, cod, i.descricao, i.unidade, qi, qi * num(i.custoUnitario),
            ja ? "subcomposição que se repete dentro dela mesma — não abri para não entrar em ciclo"
              : (prof >= MAX_PROF ? "subcomposição com níveis demais — não abri"
                : (mot(cod, i.fonte) || "subcomposição sem detalhamento na base carregada")), "insumo");
          return;
        }
        acumular(base, i, qi, cod ? insR(cod, i.fonte) : null);
      });
    }

    arr(orc && orc.etapas).forEach(function (e, ei) {
      if (!e) return;
      arr(e.itens).forEach(function (it) {
        if (!it) return;
        nItens++;
        var base = { etapaId: txt(e.id), etapaNome: txt(e.nome), etapaNumero: String(ei + 1), opcional: !!e.opcional, itemId: txt(it.id) };
        var q = num(it.quantidade), cod = txt(it.codigo), fonte = txt(it.baseFonte);
        var custoIt = num(it.custoUnitario);
        if (!(q > 0)) { fora(base, cod, it.descricao, it.unidade, 0, 0, "quantidade zerada ou ainda não levantada"); return; }
        /* ⚠ "só MO" = o material é do cliente (Orcamento.calcular não soma o
           MAT/EQ destes itens). Requisitar o material aqui seria comprar o
           que o cliente fornece. */
        if (txt(it.modoCusto) === "mo") { fora(base, cod, it.descricao, it.unidade, q, q * custoIt, "item só de mão de obra — o material é fornecido pelo cliente"); return; }
        if (!cod) { fora(base, cod, it.descricao, it.unidade, q, q * custoIt, "item digitado à mão, sem composição"); return; }
        var c = comp(cod, fonte, true);
        if (c && arr(c.insumos).length) {
          var vis = {}; vis[normFonte(fonte) + ":" + cod] = 1;
          abrir(c.insumos, q, base, 0, vis, obj(it.coeficientes));
          return;
        }
        if (c) { fora(base, cod, it.descricao, it.unidade, q, q * custoIt, "composição sem insumos"); return; }
        /* o próprio item pode ser um INSUMO (cimento lançado direto na
           planilha): ele é a linha de compra, com coeficiente 1 e o preço
           que o orçamento usou. */
        var rec = insR(cod, fonte);
        if (ehInsumoRegistro(rec)) {
          var insIt = { codigo: cod, descricao: txt(it.descricao) || txt(rec.descricao), unidade: txt(it.unidade) || txt(rec.unidade),
            custoUnitario: custoIt > 0 ? custoIt : num(rec.custoUnitario), categoria: rec.categoria, tipoInsumo: rec.tipoInsumo,
            fonte: fonte, fornecedorRef: rec.fornecedorRef, grupo: rec.grupo };
          if (categoria(insIt) === "MO") { mo.n++; mo.valor += q * num(insIt.custoUnitario); return; }
          acumular(base, insIt, q, rec);
          return;
        }
        fora(base, cod, it.descricao, it.unidade, q, q * custoIt, mot(cod, fonte) || "sem composição na base carregada");
      });
    });

    var linhas = ordem.map(function (k) {
      var L = porChave[k];
      L.quantidade = r4(L.quantidade);
      L.valor = r2(L.valor);
      return L;
    });
    return { linhas: linhas, naoDetalhado: naoDet, maoDeObra: { n: mo.n, valor: r2(mo.valor) }, nItens: nItens };
  }

  /* ------------------------------------------------------------------
   * CONSUMO — o que as requisições GERADAS DO ORÇAMENTO já pediram
   * ---------------------------------------------------------------- */
  /* ⚠ REJEITADO TAMBÉM É MORTO: é a outra porta de Compras. Sem ele aqui, o
     pedido recusado continuaria segurando o saldo e a única saída seria
     cancelar — a pessoa aprenderia que "rejeitar não adianta". */
  var PEDIDO_MORTO = { cancelado: 1, rejeitado: 1 };
  function pedidoEstaVivo(p) { return !!p && !PEDIDO_MORTO[txt(p.status)]; }
  /* os pedidos vivos que apontam para a requisição (`requisicaoId`) */
  function pedidosVivosDe(reqId, pedidos) {
    var rid = txt(reqId);
    if (!rid) return [];
    return arr(pedidos).filter(function (p) { return pedidoEstaVivo(p) && txt(p.requisicaoId) === rid; });
  }
  function estadoDaReq(r, temPedidoVivo) {
    var st = txt(r && r.status);
    if (st === "cancelada" || st === "rejeitada") return temPedidoVivo ? "comprado" : null;
    if (st === "comprada" || temPedidoVivo) return "comprado";
    if (st === "cotando") return "cotando";
    return "requisitado";
  }
  /* ------------------------------------------------------------------
   * ⚠ REQUISIÇÃO QUE PERDEU O CARIMBO DOS ITENS
   * Roteiro do defeito (medido com o funil `_reqItens` da 1.2.97 copiado
   * literalmente): um aparelho que ainda não atualizou abre a requisição
   * gerada, clica em Salvar, e o funil antigo remonta cada item com 10 chaves
   * fixas — `origemOrc` some de TODOS os itens. A nuvem funde pelo mais novo
   * e a versão sem carimbo chega a todos os aparelhos; o saldo voltava
   * inteiro (0 → 1000) e o gerador deixava pedir de novo. O `origemOrc` da
   * REQUISIÇÃO sobrevive (o formulário antigo clona o registro), e é por ele
   * que se sabe que ela veio do orçamento.
   * Só vale quando NENHUM item tem carimbo: o funil antigo apaga todos de uma
   * vez; requisição com parte dos itens carimbados é item acrescentado à mão,
   * que não conta (é a regra do "só carimbo").
   * ---------------------------------------------------------------- */
  function perdeuCarimbo(r, familiaIds) {
    var o = obj(r && r.origemOrc);
    if (!o || !txt(o.orcamentoId)) return null;
    if (familiaIds && !familiaIds[txt(o.orcamentoId)]) return null;
    var itens = arr(r.itens).filter(function (it) { return !!it; });
    if (!itens.length) return null;
    if (itens.some(function (it) { return !!obj(it.origemOrc); })) return null;
    var m = /^etapa:(.+)$/.exec(txt(o.chave));
    var comCodigo = itens.filter(function (it) { return !!txt(it.codigo); }).length;
    return { modo: txt(o.modo), porEtapa: !!m, etapaId: m ? m[1] : "", itens: itens.length, semCodigo: itens.length - comCodigo };
  }
  function consumo(requisicoes, pedidos, familiaIds) {
    familiaIds = familiaIds || {};
    var reqExiste = {}, vivosDe = {}, soltos = [];
    arr(requisicoes).forEach(function (r) { if (r && r.id) reqExiste[txt(r.id)] = 1; });
    arr(pedidos).forEach(function (p) {
      if (!pedidoEstaVivo(p)) return;
      var rid = txt(p.requisicaoId);
      if (rid && reqExiste[rid]) (vivosDe[rid] = vivosDe[rid] || []).push(p);
      else soltos.push(p);
    });
    var porChave = {}, travas = {}, liberadas = [], semCarimbo = [];
    function anotaDoc(docs, doc, estado, q) {
      var d = null;
      docs.forEach(function (x) { if (x.id === doc.id) d = x; });
      if (!d) { d = { id: doc.id, numero: doc.numero, status: doc.status, estado: estado, quantidade: 0, via: doc.via }; if (doc.precaucao) d.precaucao = true; docs.push(d); }
      d.quantidade += q;
    }
    function soma(etapaId, ch, q, estado, doc) {
      if (!(q > 0)) return;
      var k = etapaId + "|" + ch;
      var c = porChave[k] = porChave[k] || { etapaId: etapaId, chave: ch, total: 0, requisitado: 0, cotando: 0, comprado: 0, docs: [] };
      c.total += q; c[estado] += q;
      anotaDoc(c.docs, doc, estado, q);
    }
    function acumula(mapa, etapaId, ch, q) {
      if (!(q > 0)) return;
      var k = etapaId + "|" + ch;
      var e = mapa[k] = mapa[k] || { etapaId: etapaId, chave: ch, q: 0 };
      e.q += q;
    }
    /* o que UM documento pede, por (etapa, insumo) — só item com carimbo da
       família. Devolve quantos itens tinham carimbo. */
    function lerCarimbos(itens, mapa) {
      var n = 0;
      arr(itens).forEach(function (it) {
        var o = obj(it && it.origemOrc);
        if (!o || !familiaIds[txt(o.orcamentoId)]) return;
        n++;
        var q = num(it.quantidade);
        var ch = chaveDoCarimbo(o);
        var partes = arr(o.partes).filter(function (p) { return p && txt(p.etapaId) && num(p.quantidade) > 0; });
        if (partes.length) {
          /* ⚠ LINHA CONSOLIDADA (modos "por tipo" e "tudo"): uma linha, várias
             etapas. Se a pessoa mudou a quantidade da linha, a mudança é
             repartida na proporção das partes gravadas — é a única leitura que
             não inventa em qual etapa ela quis mexer. */
          var soma0 = 0; partes.forEach(function (p) { soma0 += num(p.quantidade); });
          var fator = soma0 > 0 ? q / soma0 : 0;
          partes.forEach(function (p) { acumula(mapa, txt(p.etapaId), ch, num(p.quantidade) * fator); });
        } else {
          acumula(mapa, txt(o.etapaId), ch, q);
        }
      });
      return n;
    }
    function somaMapa(mapa, estado, doc) {
      Object.keys(mapa).forEach(function (k) { soma(mapa[k].etapaId, mapa[k].chave, mapa[k].q, estado, doc); });
    }
    /* trava POR INSUMO, sem etapa (modos tipo/tudo que perderam o carimbo) */
    function somaTravas(mapa, estado, doc) {
      Object.keys(mapa).forEach(function (ch) {
        var q = mapa[ch]; if (!(q > 0)) return;
        var T = travas[ch] = travas[ch] || { total: 0, requisitado: 0, cotando: 0, comprado: 0, docs: [] };
        T.total += q; T[estado] += q;
        anotaDoc(T.docs, { id: doc.id, numero: doc.numero, status: doc.status, via: doc.via, precaucao: true }, estado, q);
      });
    }
    arr(requisicoes).forEach(function (r) {
      if (!r || !r.id) return;
      var rid = txt(r.id);
      var vivos = vivosDe[rid] || [];
      var est = estadoDaReq(r, vivos.length > 0);
      var doc = { id: rid, numero: txt(r.numero), status: txt(r.status), via: "requisicao" };
      var mR = {}, travaR = {};
      var n = lerCarimbos(r.itens, mR);
      var perdeu = n ? null : perdeuCarimbo(r, familiaIds);
      if (perdeu) {
        arr(r.itens).forEach(function (it) {
          if (!it || !txt(it.codigo)) return;
          /* ⚠ IDENTIDADE DO INSUMO (fonte + código): é a MESMA chave que o
             `montar` carimbou, e o funil antigo preserva `codigo` e `fonte`.
             Não é semelhança de descrição — item sem código não é reconhecido
             e o aviso diz quantos. */
          var ch = chaveInsumo({ codigo: it.codigo, fonte: it.fonte });
          if (perdeu.porEtapa) acumula(mR, perdeu.etapaId, ch, num(it.quantidade));
          else travaR[ch] = (travaR[ch] || 0) + num(it.quantidade);
        });
        semCarimbo.push({ id: rid, numero: doc.numero, status: doc.status, modo: perdeu.modo, porEtapa: perdeu.porEtapa,
          etapaId: perdeu.etapaId, itens: perdeu.itens, semCodigo: perdeu.semCodigo, conta: !!est });
      }
      if (!est) {
        if (n || perdeu) liberadas.push({ id: doc.id, numero: doc.numero, status: doc.status, itens: n || perdeu.itens });
        return;
      }
      if (!vivos.length) { somaMapa(mR, est, doc); somaTravas(travaR, est, doc); return; }
      /* ⚠ COM PEDIDO VIVO, CONTA O MAIOR entre o que a requisição pede e o que
         o pedido CARIMBADO compra. Roteiro do defeito: requisição de 500 kg
         vira pedido de 500; a pessoa abre a requisição comprada (ela continua
         editável, de propósito) e baixa para 100 — o motor lia só a
         requisição e liberava 400 kg para gerar de novo, com o pedido de 500
         de pé. A porta legítima continua: pedido reduzido em Compras E
         requisição reduzida devolvem a diferença. */
      var mP = {}, nP = 0;
      vivos.forEach(function (p) { nP += lerCarimbos(p.itens, mP); });
      if (!nP) {
        /* pedido sem carimbo (gerado antes desta versão, pelo Mapa): não se sabe
           o que ele compra item a item — a requisição inteira conta como
           comprada, a régua de antes */
        somaMapa(mR, "comprado", doc); somaTravas(travaR, "comprado", doc);
        return;
      }
      var resto = estadoDaReq(r, false) || "requisitado";
      var chaves = {}, compradoPorIns = {};
      Object.keys(mR).forEach(function (k) { chaves[k] = 1; });
      Object.keys(mP).forEach(function (k) { chaves[k] = 1; });
      Object.keys(chaves).forEach(function (k) {
        var e = mP[k] || mR[k];
        var qP = mP[k] ? mP[k].q : 0, qR = mR[k] ? mR[k].q : 0;
        soma(e.etapaId, e.chave, qP, "comprado", doc);
        if (qR > qP) soma(e.etapaId, e.chave, qR - qP, resto, doc);
        compradoPorIns[e.chave] = (compradoPorIns[e.chave] || 0) + qP;
      });
      /* sem carimbo nos modos tipo/tudo: trava só o que a requisição pede ALÉM
         do que o pedido carimbado já compra daquele insumo */
      var alem = {};
      Object.keys(travaR).forEach(function (ch) { var x = travaR[ch] - (compradoPorIns[ch] || 0); if (x > TOL) alem[ch] = x; });
      somaTravas(alem, resto, doc);
    });
    /* ⚠ PEDIDO VIVO DE REQUISIÇÃO QUE FOI EXCLUÍDA (ou sem requisição). O
       pedido carimbado continua comprando — e o saldo não pode voltar. Vale
       para o "Gerar pedido" direto (que copia os itens com o carimbo) e, desde
       a 1.2.98, para o pedido do Mapa de Cotação (que herda o carimbo do item
       da cotação). */
    soltos.forEach(function (p) {
      var doc = { id: txt(p.id), numero: txt(p.numero), status: txt(p.status), via: "pedido" };
      var mP = {};
      lerCarimbos(p.itens, mP);
      somaMapa(mP, "comprado", doc);
    });
    function arred(c) {
      c.total = r4(c.total); c.requisitado = r4(c.requisitado); c.cotando = r4(c.cotando); c.comprado = r4(c.comprado);
      c.docs.forEach(function (d) { d.quantidade = r4(d.quantidade); });
    }
    Object.keys(porChave).forEach(function (k) { arred(porChave[k]); });
    Object.keys(travas).forEach(function (k) { arred(travas[k]); });
    return { porChave: porChave, travas: travas, liberadas: liberadas, semCarimbo: semCarimbo };
  }

  var ROT_STATUS = { aberta: "aberta", aprovada: "aprovada", cotando: "em cotação", comprada: "comprada",
    cancelada: "cancelada", rejeitada: "rejeitada" };
  function rotDoc(d) {
    var st = d.via === "pedido" ? "pedido " + (d.status || "") : (ROT_STATUS[d.status] || d.status || "");
    return (d.numero || "(sem número)") + " (" + st + (d.estado === "comprado" && d.via !== "pedido" && d.status !== "comprada" ? ", com pedido" : "") +
      (d.precaucao ? ", sem carimbo — contada por precaução" : "") + ")";
  }

  /* ------------------------------------------------------------------
   * SALDO por (etapa, insumo)
   * ---------------------------------------------------------------- */
  function saldos(dem, cons) {
    var pc = (cons && cons.porChave) || {};
    var tv = (cons && cons.travas) || {};
    var usadas = {};
    var linhas = arr(dem && dem.linhas).map(function (L) {
      var c0 = pc[L.k] || { total: 0, requisitado: 0, cotando: 0, comprado: 0, docs: [] };
      usadas[L.k] = 1;
      var c = { total: c0.total, requisitado: c0.requisitado, cotando: c0.cotando, comprado: c0.comprado, docs: c0.docs.slice() };
      /* ⚠ TRAVA POR PRECAUÇÃO (requisição dos modos tipo/tudo que perdeu o
         carimbo dos itens): não se sabe de qual etapa é cada quantidade, então
         ela conta, em CADA etapa que tem o insumo, até a quantidade dela. A
         conta real de cada etapa é menor ou igual a isso — nunca gera a mais.
         O teto em "o que falta nesta etapa" impede a trava de inventar
         "requisitado acima do orçado". */
      var T = tv[L.chave], precaucao = 0;
      if (T && T.total > TOL) {
        precaucao = r4(Math.max(0, Math.min(T.total, L.quantidade - c.total)));
        if (precaucao > TOL) {
          var estT = T.comprado > TOL ? "comprado" : (T.cotando > TOL ? "cotando" : "requisitado");
          c.total += precaucao; c[estT] += precaucao;
          T.docs.forEach(function (d) { if (!c.docs.some(function (x) { return x.id === d.id; })) c.docs.push(d); });
        } else precaucao = 0;
      }
      var ja = r4(c.total), saldo = r4(L.quantidade - ja);
      var estado;
      /* ⚠ "comprado" SÓ QUANDO TODO O CONSUMO DA LINHA ESTÁ COMPRADO. Com 25
         kg numa requisição aberta e 25 numa comprada, a pílula dizia
         "comprado" — e afirmava uma compra que não aconteceu. */
      if (ja <= TOL) estado = "livre";
      else if (saldo > TOL) estado = "parcial";
      else if (saldo < -TOL) estado = "excedente";
      else if (c.comprado >= ja - TOL) estado = "comprado";
      else if (c.comprado > TOL) estado = "compradoParte";
      else if (c.cotando > TOL) estado = "cotando";
      else estado = "requisitado";
      var gerar = saldo > TOL ? saldo : 0;
      var motivo = "";
      if (!gerar) {
        var docs = c.docs.map(rotDoc).join(", ");
        if (estado === "excedente") motivo = "Requisitado " + fmtQ(-saldo) + " acima do orçado" + (docs ? " — " + docs : "");
        else if (estado === "comprado") motivo = "Já comprado — " + docs;
        else if (estado === "compradoParte") motivo = "Parte comprada (" + fmtQ(c.comprado) + " de " + fmtQ(ja) + ") — " + docs;
        else if (estado === "cotando") motivo = "Em cotação — " + docs;
        else motivo = "Já requisitado — " + docs;
      }
      var out = {};
      for (var p in L) if (Object.prototype.hasOwnProperty.call(L, p)) out[p] = L[p];
      out.orcado = L.quantidade; out.jaRequisitado = ja; out.comprado = r4(c.comprado); out.cotando = r4(c.cotando);
      out.requisitado = r4(c.requisitado); out.saldo = saldo; out.gerar = r4(gerar); out.estado = estado;
      out.bloqueado = !gerar; out.motivo = motivo; out.docs = c.docs; out.precaucao = precaucao; out.orfaoMesmoInsumo = 0;
      return out;
    });
    /* consumo que não bate com nenhuma linha de hoje: etapa apagada na
       revisão, ou insumo que saiu da composição. Não some da conta — a tela
       mostra, para ninguém achar que o pedido se perdeu.
       ⚠ E ELE NÃO É ABATIDO DE OUTRA ETAPA: o saldo é por (etapa, insumo). Se
       o insumo foi para outra etapa (item excluído e incluído de novo), o
       gerador OFERECE de novo lá — `reofertas` diz onde, para a tela avisar
       na cara em vez de prometer que "não sai de novo". */
    var orfaos = [];
    Object.keys(pc).forEach(function (k) {
      if (usadas[k]) return;
      var o = pc[k];
      var reofertas = [];
      linhas.forEach(function (L) {
        if (L.chave !== o.chave) return;
        L.orfaoMesmoInsumo = r4(L.orfaoMesmoInsumo + o.total);
        if (L.gerar > 0) reofertas.push({ etapaId: L.etapaId, etapaNome: L.etapaNome, etapaNumero: L.etapaNumero, insumoCodigo: L.insumoCodigo, descricao: L.descricao, gerar: L.gerar });
      });
      orfaos.push({ k: k, etapaId: o.etapaId, chave: o.chave, quantidade: o.total, docs: o.docs.slice(), reofertas: reofertas });
    });
    return { linhas: linhas, orfaos: orfaos };
  }
  function fmtQ(q) {
    var s = String(r4(q));
    return s.replace(".", ",");
  }

  /* ------------------------------------------------------------------
   * AGRUPAR — os três modos
   *   "etapa": uma requisição por etapa do orçamento
   *   "tipo" : por fornecedor de referência (quando o insumo tem), senão
   *            pelo grupo do insumo, senão Materiais / Equipamentos
   *   "tudo" : uma requisição
   * Nos modos "tipo" e "tudo" o mesmo insumo de etapas diferentes vira UMA
   * linha (é como o fornecedor cota), com as partes por etapa no carimbo.
   * ---------------------------------------------------------------- */
  var MODOS = { etapa: "por etapa", tipo: "por tipo", tudo: "tudo de uma vez" };
  function tipoDe(L) {
    if (L.fornecedorRef) {
      var f = L.fornecedorRef;
      return { chave: "forn:" + (f.id ? f.id : "nome:" + norm(f.nome)), rotulo: "Fornecedor de referência: " + (f.nome || f.id) };
    }
    if (txt(L.grupo)) return { chave: "grupo:" + norm(L.grupo), rotulo: "Grupo: " + txt(L.grupo) };
    return L.categoria === "EQ" ? { chave: "cat:EQ", rotulo: "Equipamentos" } : { chave: "cat:MAT", rotulo: "Materiais" };
  }
  function agrupar(linhasSaldo, opc) {
    opc = opc || {};
    var modo = MODOS[opc.modo] ? opc.modo : "etapa";
    var cats = opc.categorias || { MAT: true, EQ: true };
    var incluirOpc = !!opc.incluirOpcionais;
    /* `...ComSaldo`: quantos dos que ficaram de fora ainda tinham o que gerar
       — é o que separa "nada a requisitar" de "nada com estes filtros" */
    var grupos = [], porG = {}, foraFiltro = { categoria: 0, opcional: 0, categoriaComSaldo: 0, opcionalComSaldo: 0 };
    arr(linhasSaldo).forEach(function (L) {
      if (!cats[L.categoria]) { foraFiltro.categoria++; if (L.gerar > 0) foraFiltro.categoriaComSaldo++; return; }
      if (L.etapaOpcional && !incluirOpc) { foraFiltro.opcional++; if (L.gerar > 0) foraFiltro.opcionalComSaldo++; return; }
      var g;
      if (modo === "etapa") g = { chave: "etapa:" + L.etapaId, rotulo: L.etapaNumero + " " + (L.etapaNome || "Etapa"), etapaId: L.etapaId };
      else if (modo === "tipo") g = tipoDe(L);
      else g = { chave: "tudo", rotulo: "Todo o escopo" };
      var G = porG[g.chave];
      if (!G) { G = porG[g.chave] = { chave: g.chave, rotulo: g.rotulo, etapaId: g.etapaId || "", linhas: [], porIns: {} }; grupos.push(G); }
      if (modo === "etapa") { G.linhas.push(consolidada([L])); return; }
      var C = G.porIns[L.chave];
      if (!C) { C = G.porIns[L.chave] = []; G.linhas.push(C); }
      C.push(L);
    });
    grupos.forEach(function (G) {
      G.linhas = G.linhas.map(function (x) { return Array.isArray(x) ? consolidada(x) : x; });
      delete G.porIns;
      var nGer = 0, valor = 0, nBloq = 0, nSemPreco = 0;
      G.linhas.forEach(function (L) {
        if (L.gerar > 0) { nGer++; valor += L.gerar * L.precoRef; if (!(L.precoRef > 0)) nSemPreco++; } else nBloq++;
      });
      /* nSemPreco: o valor do grupo é PARCIAL — a tela diz, como a lista faz */
      G.nGeraveis = nGer; G.nBloqueadas = nBloq; G.valorGerar = r2(valor); G.nSemPreco = nSemPreco; G.selecionavel = nGer > 0;
    });
    return { modo: modo, grupos: grupos, foraFiltro: foraFiltro };
  }
  /* várias (etapa, insumo) → uma linha. O que se gera é a SOMA DOS SALDOS
     POSITIVOS por etapa: o excesso pedido para uma etapa não cobre a falta
     de outra — senão o modo mudaria o total gerado para o mesmo orçamento. */
  function consolidada(partes) {
    var P0 = partes[0], out = {};
    for (var p in P0) if (Object.prototype.hasOwnProperty.call(P0, p)) out[p] = P0[p];
    if (partes.length === 1) { out.partes = [P0]; return out; }
    var orc = 0, ja = 0, gerar = 0, comp = 0, cot = 0, req = 0, valor = 0, prec = 0, docs = [], itemIds = [];
    var estados = {}, todasCompradas = true;
    partes.forEach(function (L) {
      orc += L.orcado; ja += L.jaRequisitado; gerar += L.gerar; comp += L.comprado; cot += L.cotando; req += L.requisitado;
      valor += L.valor; prec += (L.precaucao || 0); estados[L.estado] = 1;
      if (L.estado !== "comprado") todasCompradas = false;
      L.docs.forEach(function (d) { if (!docs.some(function (x) { return x.id === d.id; })) docs.push(d); });
      L.itemIds.forEach(function (i) { if (itemIds.indexOf(i) < 0) itemIds.push(i); });
      if (L.precoDivergente || (L.precoRef > 0 && out.precoRef > 0 && Math.abs(L.precoRef - out.precoRef) > 0.005)) out.precoDivergente = true;
      if (!(out.precoRef > 0) && L.precoRef > 0) out.precoRef = L.precoRef;
      if (!out.fornecedorRef && L.fornecedorRef) out.fornecedorRef = L.fornecedorRef;
    });
    out.etapaId = ""; out.etapaNome = partes.length + " etapas"; out.etapaNumero = "";
    out.orcado = r4(orc); out.jaRequisitado = r4(ja); out.gerar = r4(gerar); out.saldo = r4(orc - ja);
    out.comprado = r4(comp); out.cotando = r4(cot); out.requisitado = r4(req); out.valor = r2(valor); out.precaucao = r4(prec);
    out.docs = docs; out.itemIds = itemIds; out.partes = partes;
    out.bloqueado = !(out.gerar > 0);
    if (out.bloqueado) {
      /* "comprado" só com TODAS as etapas compradas (mesma régua da linha) */
      out.estado = todasCompradas ? "comprado" : ((estados.comprado || estados.compradoParte) ? "compradoParte" :
        (estados.cotando ? "cotando" : (estados.excedente ? "excedente" : "requisitado")));
      out.motivo = partes.map(function (L) { return L.etapaNumero + " " + L.etapaNome + ": " + L.motivo; }).join(" · ");
    } else {
      out.estado = ja > TOL ? "parcial" : "livre";
      out.motivo = "";
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * PLANEJAR — tudo de uma vez, para a tela
   * ---------------------------------------------------------------- */
  function planejar(entrada, opc) {
    entrada = entrada || {}; opc = opc || {};
    var orc = entrada.orcamento;
    var fam = familia(orc, entrada.orcamentos);
    var dem = demanda(orc, entrada.resolver, opc);
    var cons = consumo(entrada.requisicoes, entrada.pedidos, fam.ids);
    var sal = saldos(dem, cons);
    var ag = agrupar(sal.linhas, opc);
    var nGer = 0, valor = 0, nBloq = 0, nSemPreco = 0;
    ag.grupos.forEach(function (G) { nGer += G.nGeraveis; nBloq += G.nBloqueadas; valor += G.valorGerar; nSemPreco += G.nSemPreco; });
    return {
      orcamentoId: txt(orc && orc.id), orcamentoNumero: txt(orc && orc.numero), familia: fam.lista,
      modo: ag.modo, grupos: ag.grupos, foraFiltro: ag.foraFiltro,
      naoDetalhado: dem.naoDetalhado, maoDeObra: dem.maoDeObra, orfaos: sal.orfaos, liberadas: cons.liberadas,
      semCarimbo: cons.semCarimbo, linhas: sal.linhas,
      resumo: { nItensOrcamento: dem.nItens, nLinhas: sal.linhas.length, nGeraveis: nGer, nBloqueadas: nBloq, valorGerar: r2(valor), nSemPreco: nSemPreco }
    };
  }

  /* ------------------------------------------------------------------
   * ⚠ "NADA A REQUISITAR" SÓ QUANDO É VERDADE (skill `dinheiro` §2: dizer
   * "não encontrei", nunca "não existe"). A tela dizia em verde "todo o saldo
   * deste orçamento já foi requisitado" com Material desmarcado, com o saldo
   * só na etapa opcional e até com ZERO requisições — porque o detalhamento
   * SINAPI não estava carregado e nada abriu em insumo. A pessoa lia que o
   * material estava pedido e não pedia.
   *   ctx: { semDetalhamentoSinapi, ufCarregada, ufOrcamento }
   * Devolve { txt, verdade } — `verdade` só quando a frase vale sem ressalva
   * (a tela pinta de verde só aí). "" em txt quando HÁ o que gerar.
   * ---------------------------------------------------------------- */
  function porQueNada(plano, ctx) {
    ctx = ctx || {};
    if (!plano) return { txt: "", verdade: false };
    if (plano.resumo && plano.resumo.nGeraveis > 0) return { txt: "", verdade: false };
    var ff = plano.foraFiltro || {};
    var foraCat = ff.categoriaComSaldo || 0, foraOpc = ff.opcionalComSaldo || 0;
    var nND = arr(plano.naoDetalhado).length;
    var linhas = arr(plano.linhas);
    var semDet = ctx.semDetalhamentoSinapi ? " (o detalhamento SINAPI não está carregado)" : "";
    var ufDif = (ctx.ufCarregada && ctx.ufOrcamento && ctx.ufCarregada !== ctx.ufOrcamento)
      ? " (o detalhamento SINAPI carregado é de " + ctx.ufCarregada + "; o orçamento é de " + ctx.ufOrcamento + ")" : "";
    if (foraCat || foraOpc) {
      var p = [];
      if (foraCat) p.push(foraCat + " pelo filtro Material/Equipamento");
      if (foraOpc) p.push(foraOpc + " de etapas opcionais (marque \"incluir etapas opcionais\")");
      return { verdade: false, txt: "Nada a requisitar com estes filtros: " + (foraCat + foraOpc) + " insumo(s) com saldo ficaram de fora — " + p.join("; ") + "." };
    }
    if (!linhas.length) {
      return { verdade: false, txt: nND
        ? "Nada a requisitar: nenhum item deste orçamento abriu em insumo" + semDet + ufDif + " — os " + nND + " item(ns) estão na lista \"não abriram em insumo\", com o motivo."
        : "Nada a requisitar: este orçamento não tem material nem equipamento a comprar (mão de obra não entra)." };
    }
    var t = "Nada a requisitar: todo o saldo do que abriu em insumo já foi requisitado.";
    var prec = linhas.some(function (L) { return L.precaucao > TOL; });
    if (prec) t += " Parte dele está travada por precaução (requisição sem o carimbo dos itens — veja o aviso abaixo).";
    if (nND) t += " " + nND + " item(ns) do orçamento não abriram em insumo e ficaram FORA desta conta" + semDet + ufDif + " — veja a lista abaixo.";
    return { verdade: !nND && !prec, txt: t };
  }

  /* ------------------------------------------------------------------
   * MONTAR — as requisições dos grupos escolhidos (sem número nem id: quem
   * numera é a tela, na hora de gravar, lendo o disco de novo)
   *   ctx: { obraId, data, solicitante, gestao, agoraISO, uid(prefixo), obsExtra }
   *   (`obsExtra`: ressalva que vai na observação — hoje, o preço de
   *   referência vindo do detalhamento SINAPI de OUTRA UF)
   * ---------------------------------------------------------------- */
  function montar(plano, chaves, ctx) {
    ctx = ctx || {};
    var sel = {};
    arr(chaves).forEach(function (c) { sel[txt(c)] = 1; });
    var seq = 0;
    var uid = typeof ctx.uid === "function" ? ctx.uid : function (p) { seq++; return p + "_" + seq; };
    var out = [], semSaldo = [];
    arr(plano && plano.grupos).forEach(function (G) {
      if (!sel[G.chave]) return;
      var itens = [];
      G.linhas.forEach(function (L) {
        if (!(L.gerar > 0)) return;
        var carimbo = { orcamentoId: plano.orcamentoId, etapaId: "", insumoCodigo: L.insumoCodigo, insumoFonte: L.insumoFonte, chave: L.chave };
        var ps = arr(L.partes).filter(function (p) { return p.gerar > 0; });
        if (ps.length === 1) {
          carimbo.etapaId = ps[0].etapaId;
          if (ps[0].itemIds.length === 1) carimbo.itemId = ps[0].itemIds[0];
        } else if (ps.length > 1) {
          carimbo.partes = ps.map(function (p) {
            var x = { etapaId: p.etapaId, quantidade: p.gerar };
            if (p.itemIds.length === 1) x.itemId = p.itemIds[0];
            return x;
          });
        } else {
          carimbo.etapaId = L.etapaId;
          if (L.itemIds.length === 1) carimbo.itemId = L.itemIds[0];
        }
        if (!carimbo.insumoCodigo) { carimbo.insumoDescricao = L.descricao; carimbo.insumoUnidade = L.unidade; }
        var it = {
          id: uid("rqi"), codigo: L.insumoCodigo, descricao: L.descricao, unidade: L.unidade,
          quantidade: L.gerar, precoRef: r2(L.precoRef), categoria: L.categoria, fonte: L.insumoFonte,
          origemOrc: carimbo
        };
        if (L.fornecedorRef) it.fornecedorRef = { id: L.fornecedorRef.id, nome: L.fornecedorRef.nome };
        itens.push(it);
      });
      if (!itens.length) { semSaldo.push(G.chave); return; }
      var valor = 0;
      itens.forEach(function (i) { valor += num(i.quantidade) * num(i.precoRef); });
      var req = {
        data: txt(ctx.data), obraId: txt(ctx.obraId), solicitante: txt(ctx.solicitante), prioridade: "normal", status: "aberta",
        itens: itens, descricao: "Orçamento " + (plano.orcamentoNumero || "") + " — " + G.rotulo,
        valorEstimado: r2(valor), quantidade: itens[0].quantidade, unidade: itens[0].unidade,
        observacoes: "Gerada do orçamento " + (plano.orcamentoNumero || "") + " (" + (MODOS[plano.modo] || plano.modo) + ": " + G.rotulo +
          "). Quantidade = saldo do orçamento ainda não requisitado." + (txt(ctx.obsExtra) ? " " + txt(ctx.obsExtra) : ""),
        origemOrc: { orcamentoId: plano.orcamentoId, orcamentoNumero: plano.orcamentoNumero, modo: plano.modo, chave: G.chave, rotulo: G.rotulo, geradoEm: txt(ctx.agoraISO) }
      };
      if (txt(ctx.gestao)) req.gestao = txt(ctx.gestao);
      out.push({ req: req, grupo: { chave: G.chave, rotulo: G.rotulo, etapaId: G.etapaId || "" } });
    });
    return { requisicoes: out, semSaldo: semSaldo };
  }

  /* ------------------------------------------------------------------
   * ⚠ O CARIMBO QUE VIAJA: requisição → cotação → pedido
   *
   * Roteiro do defeito (provado com a bancada real, 1.2.97): gerar com
   * "Aprovar agora e já montar as cotações" → concluir o Mapa → o pedido
   * nascia com `requisicaoId` mas SEM `origemOrc` nos itens (a cotação não o
   * copiava, e `Cotacoes.pedidos` remonta o item com campos fixos). Excluída
   * a requisição, o motor procurava o carimbo no pedido, não achava, e o
   * gerador recriava os 500 kg de cimento que o pedido vivo já comprava.
   *
   * A ligação é SEMPRE por id: o item da cotação guarda `reqItemId` (o id do
   * item da requisição) e o item do pedido guarda `itemIdx` (a posição na
   * cotação que o gerou, gravada pelo próprio `Cotacoes.pedidos`). Nada aqui
   * compara descrição, código ou valor.
   * ---------------------------------------------------------------- */
  function clonar(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  /* o item da requisição como a cotação o recebe (com o `id` do item da
     cotação já nascido: é ele que o Mapa usa para achar a linha de volta) */
  function itemParaCotacao(it, idNovo) {
    it = it || {};
    var out = { codigo: txt(it.codigo), descricao: it.descricao, unidade: it.unidade, quantidade: num(it.quantidade), precoRef: num(it.precoRef), reqItemId: txt(it.id) };
    if (txt(idNovo)) out.id = txt(idNovo);
    if (obj(it.origemOrc)) out.origemOrc = clonar(it.origemOrc);
    return out;
  }
  /* copia o vínculo de `orig` para `dest` sem sobrescrever o que já existe */
  function herdarCarimbo(dest, orig) {
    if (!dest || !orig) return dest;
    if (!txt(dest.reqItemId) && txt(orig.reqItemId)) dest.reqItemId = txt(orig.reqItemId);
    if (!obj(dest.origemOrc) && obj(orig.origemOrc)) dest.origemOrc = clonar(orig.origemOrc);
    return dest;
  }
  /* os itens do pedido (de `Cotacoes.pedidos`) com o carimbo de volta:
     itemIdx → item da cotação → o carimbo dele; sem carimbo na cotação
     (cotação de antes desta versão), reqItemId → item da requisição. */
  function carimbarItensDoPedido(itensPedido, itensCotacao, itensRequisicao) {
    var cot = arr(itensCotacao), porIdReq = {};
    arr(itensRequisicao).forEach(function (it) { if (it && txt(it.id)) porIdReq[txt(it.id)] = it; });
    return arr(itensPedido).map(function (x) {
      if (!x) return x;
      var out = {};
      for (var p in x) if (Object.prototype.hasOwnProperty.call(x, p)) out[p] = x[p];
      var idx = (x.itemIdx === null || x.itemIdx === undefined || x.itemIdx === "") ? -1 : Number(x.itemIdx);
      var ci = (idx >= 0 && isFinite(idx)) ? cot[idx] : null;
      if (!ci) return out;
      herdarCarimbo(out, ci);
      var rid = txt(ci.reqItemId);
      if (!obj(out.origemOrc) && rid && porIdReq[rid]) herdarCarimbo(out, { origemOrc: porIdReq[rid].origemOrc });
      return out;
    });
  }

  /* ------------------------------------------------------------------
   * FORNECEDORES SUGERIDOS PARA A COTAÇÃO — só por carimbo
   * Id do cadastro vence; sem id, o NOME carimbado tem de ser igual (sem
   * caixa e espaço repetido) a UM cadastro só. Parecido não conta: dois
   * "Casa do Construtor" de cidades diferentes são dois fornecedores.
   * ---------------------------------------------------------------- */
  function fornecedoresSugeridos(itens, cadastro, max) {
    max = max > 0 ? max : 4;
    var cad = arr(cadastro).filter(function (f) { return f && f.id; });
    var porId = {};
    cad.forEach(function (f) { porId[txt(f.id)] = f; });
    var achados = {}, ordem = [], semRef = 0, naoAchados = [], ambiguos = [];
    arr(itens).forEach(function (it) {
      if (!it) return;
      var ref = normFornecedorRef(it.fornecedorRef);
      if (!ref) { semRef++; return; }
      var f = null;
      if (ref.id) f = porId[ref.id] || null;
      else {
        var m = cad.filter(function (x) { return norm(x.nome) === norm(ref.nome); });
        if (m.length === 1) f = m[0];
        else if (m.length > 1) { if (ambiguos.indexOf(ref.nome) < 0) ambiguos.push(ref.nome); return; }
      }
      if (!f) { var nm = ref.nome || ref.id; if (naoAchados.indexOf(nm) < 0) naoAchados.push(nm); return; }
      var k = txt(f.id);
      if (!achados[k]) { achados[k] = { fornecedorId: k, nome: txt(f.nome), valor: 0, itens: 0 }; ordem.push(k); }
      achados[k].valor += num(it.quantidade) * num(it.precoRef);
      achados[k].itens++;
    });
    var lista = ordem.map(function (k) { return achados[k]; });
    lista.sort(function (a, b) { return b.valor - a.valor; });
    var fica = lista.slice(0, max), sobra = lista.slice(max);
    return {
      fornecedores: fica.map(function (x) { return { fornecedorId: x.fornecedorId, nome: x.nome, precos: {} }; }),
      semRef: semRef, naoAchados: naoAchados, ambiguos: ambiguos,
      foraDoLimite: sobra.map(function (x) { return x.nome; })
    };
  }

  var ROTULO_ESTADO = { livre: "a requisitar", parcial: "parte já requisitada", requisitado: "já requisitado",
    cotando: "em cotação", comprado: "comprado", compradoParte: "requisitado, parte comprada", excedente: "requisitado acima do orçado" };

  /* ⚠ O TEXTO DA PORTA mora no motor para a tela e o teste lerem o MESMO.
     Trava sem a saída escrita é trava que ensina a rejeitar requisição boa.
     ⚠ E ELE TEM DE DIZER O QUE O CÓDIGO FAZ: a versão anterior prometia que
     "tirar o item devolve o saldo" sem a exceção do pedido — e com pedido
     vivo o motor conta o maior entre requisição e pedido (ver `consumo`). */
  var PORTA = "Gerou errado ou mudou de ideia? Cancele a requisição (Status → Cancelada), tire o item dela ou baixe a quantidade: o saldo volta para cá. " +
    "Se a requisição já virou pedido, o saldo só volta quando o pedido for cancelado (ou rejeitado) em Compras — cancelar a requisição, " +
    "tirar item ou baixar quantidade dela não desfaz a compra: o gerador conta o maior entre o que a requisição pede e o que o pedido compra.";

  var ReqOrcamento = {
    VERSAO: 1,
    TOL: TOL,
    MODOS: MODOS,
    ROTULO_ESTADO: ROTULO_ESTADO,
    PORTA: PORTA,
    categoria: categoria,
    ehComposicao: ehComposicao,
    normFonte: normFonte,
    chaveInsumo: chaveInsumo,
    chaveDoCarimbo: chaveDoCarimbo,
    normFornecedorRef: normFornecedorRef,
    familia: familia,
    demanda: demanda,
    consumo: consumo,
    saldos: saldos,
    agrupar: agrupar,
    planejar: planejar,
    porQueNada: porQueNada,
    montar: montar,
    fornecedoresSugeridos: fornecedoresSugeridos,
    perdeuCarimbo: perdeuCarimbo,
    pedidoEstaVivo: pedidoEstaVivo,
    pedidosVivosDe: pedidosVivosDe,
    itemParaCotacao: itemParaCotacao,
    herdarCarimbo: herdarCarimbo,
    carimbarItensDoPedido: carimbarItensDoPedido,
    _estadoDaReq: estadoDaReq
  };
  global.ReqOrcamento = ReqOrcamento;
  if (typeof module !== "undefined" && module.exports) module.exports = ReqOrcamento;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
