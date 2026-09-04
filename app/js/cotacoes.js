/* OrçaPRO — Cotações (Mapa de Cotação de Compras) — motor puro, Node-testável
 *
 * Compara fornecedores item a item numa cotação de compra:
 *  - vencedor por ITEM (menor preço unitário válido; empate → fornecedor de menor total)
 *  - vencedor ÚNICO (menor total geral entre fornecedores que cotaram TODOS os itens)
 *  - cenário MISTO (comprar cada item do mais barato) e a economia entre cenários
 *  - geração dos pedidos de compra (agrupados por fornecedor vencedor)
 *
 * Honestidade RA: item sem preço num fornecedor NÃO participa daquele fornecedor;
 * fornecedor que não cotou tudo NUNCA vence como único (compraria com buraco);
 * economia declarada só quando os dois cenários são comparáveis. Nada estimado.
 */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js). Este módulo é puro — o
     gate o roda em Node, onde `Util` não existe — então a regra vem copiada.
     ⚠ E CÓPIA APODRECE CALADA: as duas versões curtas que existiam neste
     projeto erram em direções OPOSTAS, e as duas já moveram dinheiro:
     `replace(/\./g,"")` lê "1234.56" como 123456 (×100); tratar o ponto só
     quando há vírgula lê "1.850.000" como 1,85 (÷1.000.000).
     A paridade com o `Util.parseNum` real é cobrada em tools/test-numbr.js. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, "");
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else { var iP = s.lastIndexOf("."); s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1); }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  var Cotacoes = {

    /* estrutura nova (a view completa obraId/numero/datas) */
    novo: function () {
      return { itens: [], fornecedores: [], status: "rascunho" };
      // item:       { codigo?, descricao, unidade, quantidade, precoRef? }
      // fornecedor: { fornecedorId?, nome, frete?, prazoDias?, condPgto?, precos: { [itemIdx]: precoUnit } }
    },

    /* preço unitário válido do fornecedor f para o item i (null = não cotou) */
    preco: function (cot, i, f) {
      var fr = (cot.fornecedores || [])[f]; if (!fr || !fr.precos) return null;
      var p = fr.precos[i];
      if (p == null || p === "") return null;
      p = num(p);
      return p > 0 ? p : null;
    },

    /* totais por fornecedor: subtotal só dos itens cotados, frete, total e completude */
    totais: function (cot) {
      var itens = cot.itens || [], self = this;
      return (cot.fornecedores || []).map(function (fr, f) {
        var sub = 0, cotados = 0;
        itens.forEach(function (it, i) {
          var p = self.preco(cot, i, f);
          if (p != null) { sub += r2(num(it.quantidade) * p); cotados++; } // parcela a 2 casas (mesma régua dos pedidos)
        });
        return { nome: fr.nome || ("Fornecedor " + (f + 1)), subtotal: r2(sub), frete: r2(num(fr.frete)), total: r2(sub + num(fr.frete)), cotados: cotados, completo: itens.length > 0 && cotados === itens.length };
      });
    },

    /* vencedor por item: menor preço; empate → fornecedor de menor total geral */
    melhorPorItem: function (cot) {
      var tot = this.totais(cot), self = this;
      return (cot.itens || []).map(function (it, i) {
        var melhor = null;
        (cot.fornecedores || []).forEach(function (_fr, f) {
          var p = self.preco(cot, i, f);
          if (p == null) return;
          if (!melhor || p < melhor.preco || (p === melhor.preco && tot[f].total < tot[melhor.fornecedorIdx].total)) melhor = { fornecedorIdx: f, preco: p };
        });
        return melhor; // null = ninguém cotou este item
      });
    },

    /* decisão: cenário único × misto (+ economia declarada só quando comparável) */
    decisao: function (cot) {
      var tot = this.totais(cot);
      var porItem = this.melhorPorItem(cot);
      var itens = cot.itens || [];

      // vencedor único: menor total entre COMPLETOS (null-check explícito: índice 0 é falsy!)
      var unico = null;
      tot.forEach(function (t, f) { if (t.completo && (unico === null || t.total < tot[unico].total)) unico = f; });

      // misto: todo item precisa ter ao menos um preço
      var mistoCompleto = itens.length > 0 && porItem.every(function (m) { return !!m; });
      var totalMisto = null;
      if (mistoCompleto) {
        var soma = 0, fretes = {};
        itens.forEach(function (it, i) {
          var m = porItem[i];
          soma += r2(num(it.quantidade) * m.preco); // parcela a 2 casas (mesma régua dos pedidos)
          fretes[m.fornecedorIdx] = 1;
        });
        Object.keys(fretes).forEach(function (f) { soma += num((cot.fornecedores[f] || {}).frete); });
        totalMisto = r2(soma);
      }

      var economia = (unico != null && totalMisto != null) ? r2(tot[unico].total - totalMisto) : null;
      return {
        totais: tot,
        porItem: porItem,
        vencedorUnico: unico,                 // idx do fornecedor ou null
        totalUnico: unico != null ? tot[unico].total : null,
        mistoCompleto: mistoCompleto,
        totalMisto: totalMisto,
        economiaMisto: economia               // >0 = misto economiza; null = não comparável
      };
    },

    /* pedidos de compra do cenário escolhido ('unico' | 'misto') —
       cada pedido: { fornecedorIdx, itens:[{...item, valorUnit, subtotal}], frete, total } */
    pedidos: function (cot, modo) {
      if (modo !== "unico" && modo !== "misto") return []; // modo desconhecido: explícito, nunca silencioso
      var d = this.decisao(cot), itens = cot.itens || [], self = this, grupos = {};
      if (modo === "unico") {
        if (d.vencedorUnico == null) return [];
        var f0 = d.vencedorUnico;
        grupos[f0] = itens.map(function (it, i) { return { item: it, itemIdx: i, preco: self.preco(cot, i, f0) }; });
      } else {
        if (!d.mistoCompleto) return [];
        itens.forEach(function (it, i) {
          var m = d.porItem[i];
          (grupos[m.fornecedorIdx] = grupos[m.fornecedorIdx] || []).push({ item: it, itemIdx: i, preco: m.preco });
        });
      }
      return Object.keys(grupos).map(function (fIdx) {
        var fr = cot.fornecedores[fIdx] || {};
        var its = grupos[fIdx].map(function (g) {
          var sub = r2(num(g.item.quantidade) * g.preco);
          return { codigo: g.item.codigo || "", descricao: g.item.descricao, unidade: g.item.unidade, quantidade: num(g.item.quantidade), valorUnit: g.preco, precoRef: g.preco, itemIdx: g.itemIdx, subtotal: sub };
        });
        var soma = r2(its.reduce(function (s, x) { return s + x.subtotal; }, 0));
        return { fornecedorIdx: +fIdx, fornecedorId: fr.fornecedorId || null, fornecedorNome: fr.nome || "", condPgto: fr.condPgto || "", prazoDias: fr.prazoDias != null ? num(fr.prazoDias) : null, itens: its, frete: r2(num(fr.frete)), total: r2(soma + num(fr.frete)) };
      });
    },

    /* economia contra o preço de referência do banco/orçamento (quando os itens têm precoRef) */
    economiaVsReferencia: function (cot, modo) {
      var itens = cot.itens || [];
      var comRef = itens.filter(function (it) { return num(it.precoRef) > 0; });
      if (!comRef.length) return null;
      var peds = this.pedidos(cot, modo);
      if (!peds.length) return null;
      var pago = 0, refe = 0, cobertos = 0;
      peds.forEach(function (p) {
        p.itens.forEach(function (x) {
          // casa pelo ÍNDICE do item original (descrições repetidas não se contaminam;
          // item sem precoRef fica FORA da comparação — nada estimado)
          var orig = itens[x.itemIdx];
          if (orig && num(orig.precoRef) > 0) { pago += x.subtotal; refe += num(orig.precoRef) * x.quantidade; cobertos++; }
        });
      });
      if (!cobertos) return null;
      return { itensComparados: cobertos, totalPago: r2(pago), totalReferencia: r2(refe), economia: r2(refe - pago) };
    },

    validar: function (cot) {
      var erros = [];
      if (!cot || !Array.isArray(cot.itens) || !cot.itens.length) erros.push("Inclua ao menos 1 item.");
      else cot.itens.forEach(function (it, i) {
        if (!it.descricao) erros.push("Item " + (i + 1) + " sem descrição.");
        if (!(num(it.quantidade) > 0)) erros.push("Item " + (i + 1) + " com quantidade inválida.");
      });
      if (!cot || !Array.isArray(cot.fornecedores) || cot.fornecedores.length < 1) erros.push("Inclua ao menos 1 fornecedor.");
      else cot.fornecedores.forEach(function (fr, f) {
        if (!fr.nome) erros.push("Fornecedor " + (f + 1) + " sem nome.");
        if (num(fr.frete) < 0) erros.push("Fornecedor " + (f + 1) + " com frete negativo.");
        Object.keys(fr.precos || {}).forEach(function (k) {
          if (!(Number(k) >= 0) || Number(k) >= (cot.itens || []).length) return; // chave órfã (item removido): inerte no motor, não acusa
          var p = fr.precos[k];
          if (p != null && p !== "" && !(num(p) > 0)) erros.push("Preço inválido no fornecedor " + (f + 1) + ", item " + (Number(k) + 1) + ".");
        });
      });
      return erros;
    }
  };

  /* =====================================================================
   * COTAÇÃO ONLINE — o fornecedor preenche os preços numa página pública e
   * o engenheiro "puxa" as respostas para dentro desta cotação.
   *
   * Tudo abaixo é puro (sem DOM, sem Store, sem rede) porque roda em DOIS
   * lugares: no app e no SERVIDOR da loja, que carrega este mesmo arquivo
   * para interpretar o que o fornecedor digitou. ⚠ É por isso que `num` é
   * exportada: o servidor NUNCA pode ter uma réplica própria do parser —
   * réplica apodrece (ver o cabeçalho de `num`) e aqui ela leria dinheiro
   * de fornecedor.
   *
   * A ponte entre o servidor e o motor local: o servidor fala por `itemId`
   * (`cot.itens[i].id`, estável) e o motor guarda preço por ÍNDICE
   * (`precos[i]`). O item pode ter sido removido/reordenado entre publicar e
   * puxar, então NUNCA se casa por posição — sempre id → índice atual.
   * ===================================================================== */

  /* mesma referência da função de cima — o servidor e tools/test-numbr.js
     dependem de ser ESTA, não uma cópia */
  Cotacoes.num = num;

  var TETO = { numero: 40, data: 10, descricao: 200, obra: 120, empresa: 120,
               itemCodigo: 40, itemDescricao: 200, itemUnidade: 10,
               nome: 80, condPgto: 120, cru: 40 };
  var MAX_ITENS = 200, MAX_FORN = 10;

  /* string segura: só string/number viram texto; objeto/array/null viram ""
     (o body do fornecedor é hostil por definição — `String({})` daria
     "[object Object]" gravado como nome) */
  function txt(v, max) {
    if (typeof v !== "string" && typeof v !== "number") return "";
    var s = String(v).trim();
    return max ? s.slice(0, max) : s;
  }
  function ehObjetoPlano(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  /* ⚠ chaves que, atribuídas num objeto comum, mexem no protótipo em vez de
     virar dado. Item algum do app tem id assim (Util.uid gera "cti_…"), então
     recusar é grátis e fecha a porta. */
  function chavePerigosa(k) { return k === "__proto__" || k === "constructor" || k === "prototype"; }
  function temProp(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); } // sem structuredClone: WebView antigo não tem

  /* ⚠ GRAMÁTICA DO QUE O FORNECEDOR DIGITA. `num` é "melhor esforço": lê
     "1,5,3" como 153 (regra do milhar americano "1,234,567") e "1.234.56" como
     1234,56. Para o app isso é aceitável — o engenheiro vê o número na tela.
     Para o fornecedor NÃO: ele manda o texto e nunca vê como foi lido; um
     "1,5,3" virando R$ 153,00 fecharia um pedido errado. Então o texto precisa
     ter UMA leitura possível: grafia BR (1.850,00), US (1,850.00) ou simples
     (1850 / 1850.5 / 1850,5). Fora disso → recusado com o texto de volta. */
  function grafiaUnica(s) {
    var t = String(s).replace(/\s|R\$/g, "");
    return /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t)   // 1.850,00 · 0,85
        || /^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(t)   // 1,850.00 · 0.85
        || /^-?\d+([.,]\d+)?$/.test(t);              // 1850 · 1850.5 · 0.850
  }
  /* lê um valor cru (string|number) do fornecedor: { ok, valor, cru } */
  function lerValor(cru) {
    if (typeof cru === "number") return { ok: isFinite(cru), valor: isFinite(cru) ? cru : 0, cru: String(cru) };
    if (typeof cru !== "string") return { ok: false, valor: 0, cru: "" };
    var s = cru.trim();
    if (!grafiaUnica(s)) return { ok: false, valor: 0, cru: s };
    return { ok: true, valor: num(s), cru: s };
  }

  /* true SÓ com publicação existente, não encerrada e com validade legível
     e futura. Ausente/NaN → false: ⚠ falha fechada — uma validade ilegível
     não pode travar os itens do engenheiro para sempre. */
  Cotacoes.onlineAtiva = function (cot, agoraMs) {
    if (!cot || !ehObjetoPlano(cot.online)) return false;
    var on = cot.online;
    if (on.encerradaEm) return false;
    var exp = Date.parse(on.expiraEm);
    if (!isFinite(exp)) return false;
    /* só AUSENTE cai no relógio; NaN/texto é erro de quem chamou e responde
       "inativa" — nunca "ativa por acidente" */
    var agora = (agoraMs == null) ? Date.now() : agoraMs;
    if (typeof agora !== "number" || !isFinite(agora)) return false;
    return agora < exp;
  };

  /* publicação que EXISTE, ninguém encerrou, e já não está ativa.
     ⚠ Não é o contrário de `onlineAtiva`: "não ativa" também é "nunca
     publicou". O roteiro do defeito que esta função impede: a validade vence
     às 18h, o fornecedor responde às 17h50, ninguém puxa. A tela só olhava
     `onlineAtiva` e voltava a oferecer "Cotar online" — a resposta ficava
     invisível, embora o servidor guarde a publicação por 30 dias e continue
     respondendo `estado`/`encerrar`. Vencida ≠ acabou: é "ainda dá para
     puxar e encerrar".
     `expiraEm` ilegível/ausente cai aqui de propósito: `onlineAtiva` falha
     fechada (destrava os itens, e isso não muda) mas a porta para puxar e
     encerrar precisa existir — trava sem porta empurra o engenheiro a
     inventar saída. Sem `id` não há o que puxar: false.
     ⚠ E ELA NÃO É `!onlineAtiva` NEM NO RELÓGIO: mede o tempo por conta
     própria. `onlineAtiva` falha FECHADA quando o `agoraMs` recebido não é um
     número (um `new Date(...)` no lugar de ms, um NaN); negar essa resposta
     faria `onlineVencida` falhar ABERTA e chamar de vencida uma publicação
     VIVA — a mesma tela (js/cotonlineui.js) desenharia "Publicação venceu
     em …" com "Publicar de novo" enquanto os links ainda funcionavam, e o
     engenheiro publicaria por cima da própria publicação ativa. Relógio
     ilegível → false: não se afirma um vencimento que não se mediu. */
  Cotacoes.onlineVencida = function (cot, agoraMs) {
    if (!cot || !ehObjetoPlano(cot.online)) return false;
    if (!txt(cot.online.id)) return false;
    if (cot.online.encerradaEm) return false;
    var exp = Date.parse(cot.online.expiraEm);
    if (!isFinite(exp)) return true;      // validade ilegível: a porta continua (ver acima)
    var agora = (agoraMs == null) ? Date.now() : agoraMs;
    if (typeof agora !== "number" || !isFinite(agora)) return false;
    return agora >= exp;                  // espelho exato do "agora < exp" de onlineAtiva
  };

  /* erros que impedem publicar (vazio = pode). Complementa `validar`: aqui
     o que importa é o que o SERVIDOR vai exigir (ids estáveis e únicos,
     tetos) e o estado local (concluída / já publicada). */
  Cotacoes.validarPublicacao = function (cot) {
    var erros = [];
    if (!cot || typeof cot !== "object") return ["Cotação inválida."];
    var itens = Array.isArray(cot.itens) ? cot.itens : [];
    var forns = Array.isArray(cot.fornecedores) ? cot.fornecedores : [];
    if (cot.status === "concluida") erros.push("Cotação concluída não pode ser publicada.");
    if (Cotacoes.onlineAtiva(cot)) erros.push("Esta cotação já está publicada. Encerre antes de publicar de novo.");
    if (!itens.length) erros.push("Inclua ao menos 1 item.");
    if (itens.length > MAX_ITENS) erros.push("No máximo " + MAX_ITENS + " itens por cotação online (há " + itens.length + ").");
    var idsVistos = {};
    itens.forEach(function (it, i) {
      var id = it && txt(it.id);
      if (!id) erros.push("Item " + (i + 1) + " sem identificador — salve a cotação e tente de novo.");
      else if (temProp(idsVistos, id)) erros.push("Item " + (i + 1) + " com identificador repetido.");
      else idsVistos[id] = 1;
      if (!it || !txt(it.descricao)) erros.push("Item " + (i + 1) + " sem descrição.");
      if (!it || !(num(it.quantidade) > 0)) erros.push("Item " + (i + 1) + " com quantidade inválida.");
    });
    if (!forns.length) erros.push("Inclua ao menos 1 fornecedor.");
    if (forns.length > MAX_FORN) erros.push("No máximo " + MAX_FORN + " fornecedores por cotação online (há " + forns.length + ").");
    var cidsVistos = {};
    forns.forEach(function (fr, f) {
      var cid = fr && txt(fr.cid);
      if (!cid) erros.push("Fornecedor " + (f + 1) + " sem identificador — salve a cotação e tente de novo.");
      else if (temProp(cidsVistos, cid)) erros.push("Fornecedor " + (f + 1) + " com identificador repetido.");
      else cidsVistos[cid] = 1;
      if (!fr || !txt(fr.nome)) erros.push("Fornecedor " + (f + 1) + " sem nome.");
    });
    return erros;
  };

  /* o que vai para o servidor e o fornecedor vê. ⚠ CONSTRUÍDO CAMPO A CAMPO,
     nunca `clonar(cot)` com campos apagados: um campo novo na cotação
     (precoRef, fornecedorId, telefone…) entraria no snapshot sem ninguém
     perceber, e o fornecedor veria o preço de referência do engenheiro. */
  Cotacoes.snapshotPublicacao = function (cot, opts) {
    cot = cot || {}; opts = opts || {};
    var itens = Array.isArray(cot.itens) ? cot.itens : [];
    var forns = Array.isArray(cot.fornecedores) ? cot.fornecedores : [];
    return {
      numero: txt(cot.numero, TETO.numero),
      data: txt(cot.data, TETO.data),
      descricao: txt(cot.descricao, TETO.descricao),
      obra: txt(opts.obraNome, TETO.obra),
      empresa: txt(opts.empresa, TETO.empresa),
      itens: itens.map(function (it) {
        it = it || {};
        return { id: txt(it.id), codigo: txt(it.codigo, TETO.itemCodigo), descricao: txt(it.descricao, TETO.itemDescricao),
                 unidade: txt(it.unidade, TETO.itemUnidade), quantidade: num(it.quantidade) };
      }),
      fornecedores: forns.map(function (fr) {
        fr = fr || {};
        return { cid: txt(fr.cid), nome: txt(fr.nome, TETO.nome) };
      })
    };
  };

  /* PARA O SERVIDOR: valida o body cru do fornecedor contra os itens
     publicados. ⚠ NUNCA LANÇA — o body vem da internet: array no lugar de
     objeto, `__proto__`, null, número onde se espera texto. Um throw aqui
     vira 500 e o fornecedor não sabe o que corrigir. */
  Cotacoes.validarResposta = function (itensSnapshot, corpo) {
    var erros = [], precos = {}, precosCru = {};
    try {
      var itens = Array.isArray(itensSnapshot) ? itensSnapshot : [];
      var porId = {};
      itens.forEach(function (it) {
        var id = it && txt(it.id);
        if (id && !chavePerigosa(id)) porId[id] = it;
      });
      if (!ehObjetoPlano(corpo)) corpo = {};
      var cru = corpo.precos;
      /* ⚠ `precos` que não é objeto simples (array, null, texto, número) NÃO é
         "faltou preencher": é proposta ilegível, e recusar é obrigatório nas
         duas pontas. O roteiro do defeito: um cliente HTTP que serializa a
         lista de itens em vez do mapa `{itemId: preço}` manda um ARRAY; quem
         só varre as chaves não vê diferença, acha nenhum id conhecido e grava
         a coluna do fornecedor VAZIA — carimbada como "respondeu". O
         engenheiro vê zero preço de quem cotou e decide a compra sem ele. */
      var precosIlegiveis = !ehObjetoPlano(cru);
      if (precosIlegiveis) { erros.push("Proposta sem preços."); cru = {}; }
      var validos = 0, recusados = 0;
      Object.keys(cru).forEach(function (id) {
        if (chavePerigosa(id) || !temProp(porId, id)) { erros.push("Item desconhecido: \"" + txt(id, TETO.cru) + "\"."); recusados++; return; }
        var v = cru[id];
        if (v == null) return;                                  // não cotado
        if (typeof v !== "string" && typeof v !== "number") { erros.push("Preço inválido no item \"" + txt(porId[id].descricao, TETO.cru) + "\"."); recusados++; return; }
        if (typeof v === "string" && !v.trim()) return;         // texto vazio = não cotado (omitido)
        var lido = lerValor(v);
        if (!lido.ok || !(lido.valor > 0)) { erros.push("Preço inválido no item \"" + txt(porId[id].descricao, TETO.cru) + "\": \"" + txt(lido.cru, TETO.cru) + "\""); recusados++; return; }
        precos[id] = lido.valor;
        precosCru[id] = txt(lido.cru, TETO.cru);
        validos++;
      });
      /* "Informe ao menos um preço." é para quem não tentou preço NENHUM: mapa
         legível, sem valor válido e sem valor recusado.
         ⚠ `recusados` está aqui por um recado que mentia: quem digitava "abc"
         (ou "0", ou mandava um item que o engenheiro já removeu) recebia DUAS
         frases — o erro do campo E uma ordem para preencher o campo que ele
         acabara de preencher. A página mostra `erros[0]` em destaque; a segunda
         frase manda o fornecedor procurar um branco que não existe. Com o mapa
         ilegível a frase também não sai (`precosIlegiveis`): ali o sistema nem
         conseguiu ler o envio, e já disse isso. */
      if (!validos && !precosIlegiveis && !recusados) erros.push("Informe ao menos um preço.");

      var frete = 0;
      if (corpo.frete != null && !(typeof corpo.frete === "string" && !corpo.frete.trim())) {
        var lf = lerValor(corpo.frete);
        if (!lf.ok || lf.valor < 0) erros.push("Frete inválido: \"" + txt(lf.cru, TETO.cru) + "\".");
        else frete = lf.valor;
      }
      var prazo = null;
      if (corpo.prazoDias != null && !(typeof corpo.prazoDias === "string" && !corpo.prazoDias.trim())) {
        var lp = lerValor(corpo.prazoDias);
        if (!lp.ok || lp.valor < 0) erros.push("Prazo de entrega inválido: \"" + txt(lp.cru, TETO.cru) + "\".");
        else prazo = Math.round(lp.valor);
      }
      var resposta = {
        nome: txt(corpo.nome, TETO.nome),
        frete: r2(frete),
        prazoDias: prazo,
        condPgto: txt(corpo.condPgto, TETO.condPgto),
        precos: precos,
        precosCru: precosCru
      };
      return { ok: erros.length === 0, erros: erros, resposta: erros.length ? null : resposta };
    } catch (e) {
      /* qualquer coisa que escapou das guardas acima: recusa dizendo, sem 500 */
      return { ok: false, erros: ["Não foi possível ler a proposta enviada."], resposta: null };
    }
  };

  /* aplica UMA resposta do servidor na coluna do fornecedor (por cid).
     ⚠ PURA: devolve uma cópia; `cot` não muda. Quem chama decide se salva —
     e nunca salva se a cotação já foi concluída (os pedidos já saíram). */
  Cotacoes.aplicarResposta = function (cot, resposta) {
    function recusa(m) { return { aplicado: false, motivo: m, cot: cot, ignorados: 0, substituidos: 0 }; }
    if (!cot || typeof cot !== "object") return recusa("cotação inválida");
    if (cot.status === "concluida") return recusa("cotação concluída");
    if (!ehObjetoPlano(resposta)) return recusa("resposta inválida");
    /* ⚠ MESMA REGRA DE `validarResposta`, na outra ponta. Aqui a coluna do
       fornecedor "passa a ser a resposta inteira": com `precos` array/null/
       texto o mapa lido fica vazio, e aplicar significaria APAGAR os preços
       que o engenheiro já tinha (digitados por telefone, ou de um pull
       anterior) e ainda gravar `respondidoEm` — a tela diz "respondeu" com a
       coluna em branco, e o próximo pull recusa "já aplicada" porque a data é
       mais nova. Sem preço legível não se aplica nada. */
    if (!ehObjetoPlano(resposta.precos)) return recusa("proposta sem preços");
    var cid = txt(resposta.cid);
    var forns = Array.isArray(cot.fornecedores) ? cot.fornecedores : [];
    var f = -1;
    forns.forEach(function (fr, i) { if (f < 0 && fr && txt(fr.cid) === cid && cid) f = i; });
    if (f < 0) return recusa("fornecedor não está na cotação");
    /* ⚠ ordem por data, não por "chegou depois": o app pode puxar duas vezes,
       ou receber o estado antigo de um cache. A resposta mais antiga nunca
       sobrescreve a mais nova; a mesma nunca é aplicada duas vezes. NaN na
       nova → recusa (não se aplica o que não se sabe datar). */
    var novaEm = Date.parse(resposta.respondidoEm);
    if (!isFinite(novaEm)) return recusa("já aplicada");
    var antigaEm = Date.parse(forns[f].respondidoEm);
    if (isFinite(antigaEm) && novaEm <= antigaEm) return recusa("já aplicada");

    var novo = clonar(cot);
    var fr = novo.fornecedores[f];
    var itens = Array.isArray(novo.itens) ? novo.itens : [];
    var cruPrecos = ehObjetoPlano(resposta.precos) ? resposta.precos : {};
    /* a coluna passa a ser A RESPOSTA INTEIRA: preço reconstruído do zero
       por id → índice ATUAL. Item removido no meio não desloca nada; item
       cujo id não veio fica sem preço (o fornecedor não cotou). */
    var precos = {}, usados = {}, aplicados = 0;
    itens.forEach(function (it, i) {
      var id = it && txt(it.id);
      if (!id || chavePerigosa(id) || !temProp(cruPrecos, id)) return;
      usados[id] = 1;
      var p = num(cruPrecos[id]);
      if (p > 0) { precos[i] = p; aplicados++; }
    });
    var ignorados = 0;
    Object.keys(cruPrecos).forEach(function (id) { if (!temProp(usados, id)) ignorados++; });
    /* ⚠ QUANTOS PREÇOS DO ENGENHEIRO ESTA RESPOSTA APAGOU — `substituidos`.
       Como a coluna passa a ser a resposta inteira, o preço que ele digitou
       ouvindo o fornecedor por telefone (ou que veio de um pull anterior) SOME
       quando a rodada nova não cotou aquele item. O roteiro medido: coluna do
       Beta completa por telefone (2 itens), o Beta responde online só o
       primeiro, o pull apaga o segundo — o Beta deixa de estar completo, cai
       fora da disputa de `vencedorUnico` e a compra troca de fornecedor. O
       retorno só contava `aplicados`/`ignorados`, então NENHUMA tela conseguia
       avisar; era a única porta desse dano ficar em silêncio. Conta só o preço
       PERDIDO (existia e a resposta não trouxe), nunca o preço trocado por
       outro — trocar é o que puxar serve para fazer, e avisar disso seria
       ruído que a pessoa aprende a ignorar. Quem chama decide o que fazer com
       o número; o motor continua puro. */
    var substituidos = 0;
    var antigos = ehObjetoPlano(forns[f].precos) ? forns[f].precos : {};
    itens.forEach(function (_it, i) {
      if (!temProp(antigos, i)) return;
      var ant = antigos[i];
      if (ant == null || ant === "" || !(num(ant) > 0)) return; // não era preço válido: nada se perdeu
      if (!temProp(precos, i)) substituidos++;
    });
    fr.precos = precos;
    var frete = num(resposta.frete);
    fr.frete = frete >= 0 ? r2(frete) : 0;
    fr.prazoDias = (resposta.prazoDias == null || resposta.prazoDias === "") ? null : Math.max(0, Math.round(num(resposta.prazoDias)));
    var cond = txt(resposta.condPgto, TETO.condPgto);
    if (cond) fr.condPgto = cond;          // vazio não apaga o que o engenheiro anotou
    /* `nome` NÃO muda: a coluna tem o nome que o engenheiro deu */
    fr.respondidoEm = String(resposta.respondidoEm);
    /* espelho no convite (se existir), para a tela mostrar "respondeu em …"
       sem outra consulta ao servidor */
    if (ehObjetoPlano(novo.online) && Array.isArray(novo.online.convites)) {
      novo.online.convites.forEach(function (cv) { if (cv && txt(cv.cid) === cid) cv.respondidoEm = fr.respondidoEm; });
    }
    return { aplicado: true, motivo: "", cot: novo, ignorados: ignorados, aplicados: aplicados, substituidos: substituidos };
  };

  /* dobra `aplicarResposta` sobre várias respostas (cada uma com `cid`).
     `substituidos` é a SOMA dos preços apagados nas colunas — o pull é uma
     ação só para o engenheiro, então o aviso precisa do número do pull
     inteiro, não de cada resposta. */
  Cotacoes.aplicarRespostas = function (cot, respostas) {
    var atual = cot, aplicadas = 0, ignoradas = [], substituidos = 0;
    (Array.isArray(respostas) ? respostas : []).forEach(function (r) {
      var res = Cotacoes.aplicarResposta(atual, r);
      if (res.aplicado) { atual = res.cot; aplicadas++; substituidos += (res.substituidos || 0); }
      else ignoradas.push({ cid: ehObjetoPlano(r) ? txt(r.cid) : "", motivo: res.motivo });
    });
    return { cot: atual, aplicadas: aplicadas, ignoradas: ignoradas, substituidos: substituidos };
  };

  /* quantas respostas do servidor são mais novas que o que já está na
     cotação local (para o botão "Puxar respostas (N novas)"). Só conta o
     que `aplicarResposta` de fato aplicaria: convite cujo cid existe na
     cotação — senão o botão prometeria o que o puxar não entrega. */
  Cotacoes.respostasNovas = function (cot, estado) {
    if (!cot || typeof cot !== "object" || !ehObjetoPlano(estado)) return 0;
    var on = ehObjetoPlano(estado.online) ? estado.online : estado;
    var convites = Array.isArray(on.convites) ? on.convites : [];
    var locais = {};
    (Array.isArray(cot.fornecedores) ? cot.fornecedores : []).forEach(function (fr) {
      var cid = fr && txt(fr.cid);
      if (cid && !chavePerigosa(cid)) locais[cid] = Date.parse(fr.respondidoEm);
    });
    var n = 0;
    convites.forEach(function (cv) {
      if (!ehObjetoPlano(cv) || !ehObjetoPlano(cv.resposta)) return;
      /* ⚠ MESMA GUARDA DE `aplicarResposta`: proposta com `precos` que não é
         objeto simples é recusada no pull ("proposta sem preços"). Sem esta
         linha o rótulo dizia "Puxar respostas (1 nova)" e o puxar aplicava 0 —
         recado que mente, e a pessoa clica de novo achando que falhou a rede.
         (Hoje o servidor recusa gravar isso; chega por registro anterior ao
         endurecimento ou por escrita direta no arquivo de dados.) */
      if (!ehObjetoPlano(cv.resposta.precos)) return;
      var cid = txt(cv.cid);
      if (!cid || !temProp(locais, cid)) return;
      var em = Date.parse(cv.resposta.respondidoEm);
      if (!isFinite(em)) return;
      var local = locais[cid];
      if (!isFinite(local) || em > local) n++;
    });
    return n;
  };

  global.Cotacoes = Cotacoes;
  if (typeof module !== "undefined" && module.exports) module.exports = Cotacoes;
})(typeof window !== "undefined" ? window : globalThis);
