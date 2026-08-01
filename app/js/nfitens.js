/* =====================================================================
 * nfitens.js — o que fazer com cada ITEM de uma nota fiscal.
 *
 * Uma NF-e de fornecedor de obra vem misturada: na mesma nota chegam EPI,
 * ferramenta manual, equipamento de R$ 3.000 e material de consumo. Hoje o
 * app lia os itens e jogava fora. Este motor olha cada linha e SUGERE onde
 * ela deveria pousar (estoque, patrimônio, EPI, consumo direto na obra),
 * extrai o CA quando o fornecedor escreveu na descrição, e monta o plano de
 * lançamento — inclusive as parcelas do boleto rateadas por obra sem perder
 * centavo.
 *
 * SUGESTÃO NUNCA É GRAVAÇÃO. Tudo aqui é palpite com nível de confiança para
 * o usuário confirmar na tela. Motor puro: nada de DOM, nada de Store, roda
 * em Node (tools/test-nfitens.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* Limite de imobilização: acima disso, ferramenta/equipamento é BEM
     (patrimônio) e não material de consumo. R$ 1.200 é o corte fiscal
     clássico; fica configurável porque cada empresa tem sua política. */
  var LIMITE_BEM_PADRAO = 1200;

  /* NCM por prefixo de 4 dígitos — o sinal mais confiável, porque o
     fornecedor é obrigado a declarar certo (é o que define o imposto).
     "familia" diz a natureza; o destino sai do cruzamento com valor e
     quantidade. */
  var NCM4 = {
    "6116": { familia: "epi", cat: "maos", rotulo: "luvas" },
    "6216": { familia: "epi", cat: "maos", rotulo: "luvas de tecido" },
    "9004": { familia: "epi", cat: "visao", rotulo: "óculos de proteção" },
    "6506": { familia: "epi", cat: "cabeca", rotulo: "capacete" },
    "6403": { familia: "epi", cat: "pes", rotulo: "calçado de segurança" },
    "6401": { familia: "epi", cat: "pes", rotulo: "bota impermeável" },
    "6402": { familia: "epi", cat: "pes", rotulo: "calçado" },
    "9020": { familia: "epi", cat: "respiratoria", rotulo: "respirador" },
    "6307": { familia: "epi", cat: "corpo", rotulo: "vestuário de segurança" },
    "8467": { familia: "ferramenta_motor", cat: "equipamento", rotulo: "ferramenta com motor" },
    "8508": { familia: "ferramenta_motor", cat: "equipamento", rotulo: "ferramenta elétrica" },
    "8430": { familia: "ferramenta_motor", cat: "equipamento", rotulo: "máquina de obra" },
    "8425": { familia: "ferramenta_motor", cat: "equipamento", rotulo: "guincho/talha" },
    "8201": { familia: "ferramenta_manual", cat: "outros", rotulo: "ferramenta manual" },
    "8203": { familia: "ferramenta_manual", cat: "outros", rotulo: "ferramenta de corte" },
    "8204": { familia: "ferramenta_manual", cat: "outros", rotulo: "chave/ferramenta" },
    "8205": { familia: "ferramenta_manual", cat: "outros", rotulo: "ferramenta manual" },
    "2523": { familia: "material", cat: "cimento", rotulo: "cimento" },
    "7214": { familia: "material", cat: "aco", rotulo: "aço/vergalhão" },
    "7213": { familia: "material", cat: "aco", rotulo: "aço" },
    "6810": { familia: "material", cat: "outros", rotulo: "artefato de concreto" },
    "6904": { familia: "material", cat: "outros", rotulo: "bloco cerâmico" },
    "3917": { familia: "material", cat: "hidraulica", rotulo: "tubo plástico" },
    "8544": { familia: "material", cat: "eletrica", rotulo: "cabo elétrico" },
    "4407": { familia: "material", cat: "madeira", rotulo: "madeira" },
    "2710": { familia: "consumivel", cat: "outros", rotulo: "combustível/óleo" }
  };

  /* A descrição decide quando o NCM é genérico. Protetor facial vem com NCM
     3926 (plástico), que sozinho não diz nada. */
  var PALAVRAS_EPI = [
    { re: /\bLUVA/i, cat: "maos" },
    { re: /\bOCULOS|\bÓCULOS/i, cat: "visao" },
    { re: /PROTETOR FACIAL|VISEIRA|MASCARA DE SOLDA|MÁSCARA DE SOLDA/i, cat: "visao" },
    { re: /\bCAPACETE|JUGULAR|TOUCA ARABE|BALACLAVA/i, cat: "cabeca" },
    { re: /PROTETOR AURICULAR|ABAFADOR|\bPLUG\b|CONCHA/i, cat: "auditiva" },
    { re: /RESPIRADOR|\bPFF[123]?\b|MASCARA DESCARTAVEL|MÁSCARA DESCARTÁVEL/i, cat: "respiratoria" },
    { re: /\bBOTINA|\bBOTA\b|PERNEIRA/i, cat: "pes" },
    { re: /CINTURAO|CINTURÃO|TALABARTE|TRAVA-QUEDAS|TRAVA QUEDAS/i, cat: "alturas" },
    { re: /AVENTAL|MANGOTE/i, cat: "tronco" },
    { re: /COLETE REFLETIVO|CAPA DE CHUVA|UNIFORME/i, cat: "corpo" },
    { re: /PROTETOR SOLAR|CREME PROTETOR/i, cat: "pele" }
  ];

  /* Motor a combustão/elétrico: reforça "isto é equipamento, não consumo" */
  var RE_MOTORIZADO = /GASOLINA|\bMOTOR\b|\b\d+(\.\d+)?\s?CC\b|\b2T\b|\b4T\b|ELETRIC|ELÉTRIC|A BATERIA|\bV\b\s?BATERIA/i;

  /* CA = Certificado de Aprovação do EPI. O fornecedor escreve na descrição
     ("OCULOS LEOPARDO CINZA KALIPSO CA 11268"). Ler dali é honesto — o número
     veio do documento fiscal. INVENTAR continua proibido: sem "CA" escrito,
     o item nasce pendente. */
  var RE_CA = /\bCA\s*[:\-.]?\s*(\d{3,6})\b/i;

  function norm(s) {
    s = String(s == null ? "" : s);
    return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase() : s.toUpperCase();
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function cent(v) { return Math.round(num(v) * 100) / 100; }

  var NFItens = {
    LIMITE_BEM_PADRAO: LIMITE_BEM_PADRAO,

    /* O número do CA escrito na descrição, ou "" quando não há.
       Nunca deduz de outro item nem do fabricante. */
    caDaDescricao: function (descricao) {
      var m = RE_CA.exec(String(descricao == null ? "" : descricao));
      return m ? m[1] : "";
    },

    /* Sugere o destino de UM item. Devolve sempre motivo e confiança — o
       usuário precisa saber por que o app está propondo aquilo, senão a
       sugestão vira superstição. */
    sugerir: function (item, opts) {
      item = item || {};
      opts = opts || {};
      var limite = num(opts.limiteBem) > 0 ? num(opts.limiteBem) : LIMITE_BEM_PADRAO;
      var desc = String(item.descricao || "");
      var ncm = String(item.ncm || "").replace(/\D/g, "");
      var ncm4 = ncm.slice(0, 4);
      var fam = NCM4[ncm4] || null;
      var qtd = num(item.quantidade) || 1;
      var vUnit = num(item.valorUnitario) > 0 ? num(item.valorUnitario)
        : (num(item.valor) > 0 ? num(item.valor) / qtd : 0);

      var ca = this.caDaDescricao(desc);
      var palavra = null;
      for (var i = 0; i < PALAVRAS_EPI.length; i++) {
        if (PALAVRAS_EPI[i].re.test(desc)) { palavra = PALAVRAS_EPI[i]; break; }
      }

      /* "LUVA SOLDÁVEL PVC 25MM" é conexão hidráulica, não EPI. Quando o NCM
         diz claramente OUTRA família, ele ganha da palavra — o fornecedor é
         obrigado a acertar o NCM, a palavra é só coincidência de vocabulário. */
      var famOutra = !!(fam && fam.familia !== "epi");
      /* e nada que custe mais que o limite de imobilização entra como EPI de
         consumo sem alguém olhar. */
      var caroDemais = vUnit >= limite;
      if ((fam && fam.familia === "epi") || (palavra && !famOutra && !caroDemais)) {
        var catEpi = (fam && fam.familia === "epi") ? fam.cat : palavra.cat;
        var doisSinais = !!(fam && fam.familia === "epi") && !!palavra;
        return {
          destino: "epi",
          categoria: catEpi,
          ca: ca,
          confianca: doisSinais ? "alta" : (fam && fam.familia === "epi" ? "alta" : "media"),
          motivo: doisSinais ? ("NCM " + ncm4 + " (" + fam.rotulo + ") e a descrição dizem EPI")
            : (fam && fam.familia === "epi" ? ("NCM " + ncm4 + " = " + fam.rotulo)
              : (ncm4 ? "a descrição indica EPI (o NCM " + ncm4 + " não está na minha tabela)"
                : "a descrição indica EPI (a nota não trouxe NCM)"))
        };
      }

      /* Equipamento/ferramenta: o valor decide entre virar BEM (patrimônio)
         ou ir para o estoque. Perto do limite, a confiança cai — é aí que o
         usuário tem de olhar. */
      if (fam && (fam.familia === "ferramenta_motor" || fam.familia === "ferramenta_manual")) {
        var motor = fam.familia === "ferramenta_motor" || RE_MOTORIZADO.test(desc);
        if (vUnit >= limite) {
          return {
            destino: "patrimonio", categoria: "equipamento", ca: "",
            confianca: "alta",
            motivo: "NCM " + ncm4 + " (" + fam.rotulo + ") e valor unitário " + vUnit.toFixed(2) +
              " ≥ limite de imobilização " + limite.toFixed(2)
          };
        }
        return {
          destino: "estoque",
          categoria: motor ? "outros" : "outros", ca: "",
          /* durável barato é o caso genuinamente ambíguo: cabe em estoque de
             ferramentas e cabe em patrimônio de baixo valor. */
          confianca: "baixa",
          motivo: "NCM " + ncm4 + " (" + fam.rotulo + ") é durável, mas " + vUnit.toFixed(2) +
            " < limite " + limite.toFixed(2) + " — confirme se vira bem ou fica no almoxarifado"
        };
      }

      if (fam && (fam.familia === "material" || fam.familia === "consumivel")) {
        return {
          destino: "estoque", categoria: fam.cat, ca: "",
          confianca: "alta",
          motivo: "NCM " + ncm4 + " = " + fam.rotulo
        };
      }

      /* Sem sinal nenhum: valor alto ainda sugere bem, mas com confiança
         baixa e dizendo que o NCM não ajudou. */
      if (vUnit >= limite) {
        return {
          destino: "patrimonio", categoria: "equipamento", ca: "",
          confianca: "baixa",
          motivo: (ncm4 ? "NCM " + ncm4 + " não está na minha tabela" : "a nota não trouxe NCM") +
            ", mas " + vUnit.toFixed(2) + " ≥ limite de imobilização " + limite.toFixed(2) + " — confirme"
        };
      }
      return {
        destino: "estoque", categoria: "outros", ca: "",
        confianca: "baixa",
        motivo: (ncm4 ? "NCM " + ncm4 + " não está na minha tabela" : "a nota não trouxe NCM") + " — confira o destino"
      };
    },

    /* Aplica sugerir() na nota inteira, preservando a ordem dos itens. */
    sugerirNota: function (itens, opts) {
      var self = this;
      return (itens || []).map(function (it, i) {
        var s = self.sugerir(it, opts);
        return {
          idx: i,
          numero: it.numero || (i + 1),
          codigo: it.codigo || "",
          descricao: it.descricao || "",
          ncm: it.ncm || "",
          cfop: it.cfop || "",
          unidade: it.unidade || "un",
          quantidade: num(it.quantidade) || 0,
          valorUnitario: num(it.valorUnitario) > 0 ? num(it.valorUnitario)
            : (num(it.quantidade) > 0 ? num(it.valor) / num(it.quantidade) : num(it.valor)),
          valor: num(it.valor),
          sugestao: s,
          destino: s.destino,          /* escolha corrente = sugestão até o usuário mexer */
          categoria: s.categoria,
          ca: s.ca,
          obraId: "",
          responsavelId: "",
          st: "pendente"
        };
      });
    },

    /* Resumo para o cabeçalho da triagem: quantos por destino e se a soma
       dos itens bate com o total da nota (divergência aqui é sinal de item
       truncado ou de frete/desconto não distribuído). */
    resumo: function (linhas, valorNota) {
      var porDestino = {}, soma = 0, pendentes = 0, lancados = 0;
      (linhas || []).forEach(function (l) {
        porDestino[l.destino] = (porDestino[l.destino] || 0) + 1;
        soma += num(l.valor);
        if (l.st === "lancado") lancados++; else if (l.st !== "ignorado") pendentes++;
      });
      soma = cent(soma);
      var alvo = cent(valorNota);
      return {
        total: (linhas || []).length,
        porDestino: porDestino,
        somaItens: soma,
        valorNota: alvo,
        diferenca: cent(soma - alvo),
        bate: Math.abs(soma - alvo) < 0.01,
        pendentes: pendentes,
        lancados: lancados
      };
    },

    /* AS PARCELAS DO BOLETO.
     * As duplicatas do XML MANDAM: 5226,50/4 = 1306,625, e o fornecedor já
     * resolveu os centavos (1306,64 ×3 + 1306,58). Recalcular parcelas
     * "iguais" faria o custo da obra divergir da nota para sempre.
     * Sem duplicatas, divide e joga o resíduo na ÚLTIMA. */
    parcelas: function (nota, opts) {
      nota = nota || {}; opts = opts || {};
      var total = cent(nota.valorTotal);
      var dups = (nota.duplicatas || []).filter(function (d) { return d && num(d.valor) > 0; });
      var base = [];
      if (dups.length) {
        base = dups.map(function (d, i) {
          return { num: i + 1, vencimento: d.vencimento || "", valor: cent(d.valor), fonte: "duplicata" };
        });
      } else {
        var n = Math.max(1, Math.round(num(opts.parcelas) || 1));
        var fatia = Math.floor((total / n) * 100) / 100;
        var acum = 0;
        for (var i = 0; i < n; i++) {
          var v = (i === n - 1) ? cent(total - acum) : fatia;
          acum = cent(acum + v);
          base.push({ num: i + 1, vencimento: (opts.vencimentos && opts.vencimentos[i]) || nota.vencimento || "", valor: v, fonte: "dividido" });
        }
      }
      var soma = 0; base.forEach(function (p) { soma = cent(soma + p.valor); });
      /* invariante dura: a soma das parcelas É a nota. Se as duplicatas do
         XML não fecharem (nota rara, mal emitida), a diferença vai para a
         última e o chamador avisa — nunca fica escondida. */
      var ajuste = cent(total - soma);
      if (base.length && Math.abs(ajuste) >= 0.01) {
        base[base.length - 1].valor = cent(base[base.length - 1].valor + ajuste);
        base[base.length - 1].ajustado = ajuste;
      }
      return { parcelas: base, total: total, ajuste: ajuste };
    },

    /* Rateio por obra: quando os itens da nota vão para obras diferentes, o
     * dinheiro da parcela não pertence a uma obra só. Divide cada parcela na
     * proporção do valor dos itens de cada obra, e o resíduo de centavos vai
     * para a maior fatia — a soma das linhas continua sendo a parcela. */
    ratear: function (parcelas, linhas) {
      var porObra = {}, total = 0;
      (linhas || []).forEach(function (l) {
        var k = l.obraId || "";
        porObra[k] = cent((porObra[k] || 0) + num(l.valor));
        total = cent(total + num(l.valor));
      });
      var obras = Object.keys(porObra);
      if (!total || obras.length <= 1) {
        var unica = obras.length ? obras[0] : "";
        return (parcelas || []).map(function (p) {
          var o = {}; for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
          o.obraId = unica; return o;
        });
      }
      var out = [];
      (parcelas || []).forEach(function (p) {
        var linhasP = [], soma = 0, maiorIdx = 0, maiorVal = -1;
        obras.forEach(function (obraId, i) {
          var v = Math.floor((num(p.valor) * (porObra[obraId] / total)) * 100) / 100;
          soma = cent(soma + v);
          if (porObra[obraId] > maiorVal) { maiorVal = porObra[obraId]; maiorIdx = i; }
          linhasP.push({ num: p.num, vencimento: p.vencimento, valor: v, obraId: obraId, fonte: p.fonte, rateado: true });
        });
        var resto = cent(num(p.valor) - soma);
        if (Math.abs(resto) >= 0.01) linhasP[maiorIdx].valor = cent(linhasP[maiorIdx].valor + resto);
        linhasP.forEach(function (l) { if (l.valor > 0) out.push(l); });
      });
      return out;
    },

    /* Categoria financeira da nota = a que pesa mais em dinheiro. Uma nota
       de R$ 5.226 com R$ 5.030 de equipamento não é "material". */
    categoriaFinanceira: function (linhas) {
      var peso = {};
      (linhas || []).forEach(function (l) {
        var c = l.destino === "patrimonio" ? "equipamento"
          : (l.destino === "epi" ? "material"
            : (l.destino === "consumo" ? "obra" : "material"));
        peso[c] = cent((peso[c] || 0) + num(l.valor));
      });
      var melhor = "material", max = -1;
      for (var k in peso) if (Object.prototype.hasOwnProperty.call(peso, k)) {
        if (peso[k] > max) { max = peso[k]; melhor = k; }
      }
      return melhor;
    }
  };

  if (global) global.NFItens = NFItens;
  if (typeof module !== "undefined" && module.exports) module.exports = NFItens;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
