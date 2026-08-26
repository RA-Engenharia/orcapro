/* =====================================================================
 * carpproposta.js — A PROPOSTA COMERCIAL DA CARPINTARIA, em papel
 *
 * Motor puro: recebe a proposta e o cadastro, devolve o HTML pronto para
 * "Imprimir → Salvar PDF". Mesma identidade dos outros documentos do
 * sistema (`.pg`, `.capa`, `.prop-tbl` do css/app.css) e mesmo white-label:
 * logo, nome, marca d'água e rodapé são da EMPRESA DO CLIENTE.
 *
 * ---------------------------------------------------------------------
 * A REGRA QUE MANDA AQUI
 * ---------------------------------------------------------------------
 *
 * ⚠ O CLIENTE FINAL NÃO PODE VER O CUSTO DA MADEIRA NEM A MARGEM.
 *
 *   A tela interna mostra a conta aberta — custo de compra, margem, lucro —
 *   porque quem olha é quem faz o preço. O PAPEL vai para quem paga: ali só
 *   existe o preço de venda. Custo impresso numa proposta é a margem da
 *   carpintaria entregue por escrito a quem vai negociar com ela, e não tem
 *   como recolher depois de enviada.
 *
 *   Três camadas, as mesmas do portal do parceiro:
 *     1. o documento é montado a partir de valores de VENDA, nunca lendo
 *        `custoUnit` — este arquivo não toca nesse campo em lugar nenhum;
 *     2. `auditar` varre o HTML gerado atrás do custo e da margem, em
 *        número e em palavra;
 *     3. a tela chama `auditar` ANTES de abrir o documento e recusa abrir
 *        se algo aparecer.
 *
 * ---------------------------------------------------------------------
 * O DOCUMENTO PRECISA FECHAR
 * ---------------------------------------------------------------------
 *
 * ⚠ Quantidade × preço unitário TEM de dar o total da linha, e a soma das
 *   linhas TEM de dar o total da proposta. Um documento que não fecha é a
 *   primeira coisa que o cliente encontra — e a partir dali ele confere
 *   tudo, inclusive o que estava certo.
 *
 *   Como os acréscimos (faixa dos 65 m², detalhes arquitetônicos) incidem
 *   sobre o BLOCO e não sobre a linha, o preço unitário impresso é o
 *   unitário JÁ COM eles embutidos, e a distribuição usa `Dinheiro.ratear`
 *   em centavos — que fecha por construção, sem sobrar nem faltar centavo.
 *
 * ⚠ E é por isso que o papel NÃO traz uma linha "+50% por obra pequena".
 *   Não é omissão: é uma escolha comercial (a linha convida a negociar o
 *   acréscimo) e existe interruptor para quem quiser mostrar — ver
 *   `opcoes.detalharAcrescimos`.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CarpProposta = {};

  function txt(x) { return String(x == null ? "" : x).trim(); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function esc(s) {
    if (global.Util && global.Util.esc) return global.Util.esc(s == null ? "" : s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    if (global.Util && global.Util.parseNum) { var v = global.Util.parseNum(x); return isFinite(v) ? v : 0; }
    return parseFloat(String(x).replace(",", ".")) || 0;
  }
  function moeda(v) {
    if (global.Util && global.Util.fmtMoeda) return global.Util.fmtMoeda(num(v));
    return "R$ " + num(v).toFixed(2).replace(".", ",");
  }
  /* ⚠ "m2" É COMO O PARÂMETRO GUARDA, NÃO COMO O CLIENTE LÊ. A unidade é
     digitada uma vez na tela de parâmetros e ali "m2" é aceitável; num
     documento assinado, "52,00 m2" parece erro de digitação. */
  function unidade(u) {
    var t = txt(u) || "m²";
    return t.replace(/^m2$/i, "m²").replace(/^m3$/i, "m³");
  }
  function n2(v) {
    if (global.Util && global.Util.fmtNum) return global.Util.fmtNum(num(v), 2);
    return num(v).toFixed(2).replace(".", ",");
  }
  function dia(iso) {
    if (global.Util && global.Util.fmtDia) return global.Util.fmtDia(iso);
    var s = txt(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return s ? s[3] + "/" + s[2] + "/" + s[1] : txt(iso);
  }
  function cent(v) {
    if (global.Dinheiro && global.Dinheiro.paraCentavos) return global.Dinheiro.paraCentavos(v);
    return Math.round(num(v) * 100);
  }
  function reais(c) {
    if (global.Dinheiro && global.Dinheiro.paraReais) return global.Dinheiro.paraReais(c);
    return Math.round(Number(c) || 0) / 100;
  }
  function ratear(totalCent, pesos) {
    if (global.Dinheiro && global.Dinheiro.ratear) return global.Dinheiro.ratear(totalCent, pesos);
    var soma = pesos.reduce(function (s, p) { return s + p; }, 0);
    if (!(soma > 0)) return pesos.map(function () { return 0; });
    var out = pesos.map(function (p) { return Math.floor(totalCent * p / soma); });
    var falta = totalCent - out.reduce(function (s, v) { return s + v; }, 0);
    for (var k = 0; k < falta; k++) out[k % out.length] += 1;
    return out;
  }

  /* ===================================================================
   * OS CAMPOS COMERCIAIS
   *
   * Nada aqui é inventado: são campos da proposta, com padrão que a empresa
   * grava uma vez (nos parâmetros) e reusa. `condicoesPagamento` é o único
   * OBRIGATÓRIO — proposta sem condição de pagamento não é proposta, é uma
   * tabela de preços com capa.
   * =================================================================== */
  CarpProposta.CAMPOS = [
    { id: "condicoesPagamento", nome: "Condições de pagamento", obrigatorio: true,
      dica: "Ex.: 40% na assinatura, 30% na entrega do material, 30% na conclusão" },
    { id: "prazoExecucao", nome: "Prazo de execução",
      dica: "Ex.: 15 dias úteis a partir da liberação da obra" },
    { id: "incluso", nome: "Está incluso", multi: true,
      dica: "Uma linha por item" },
    { id: "excluso", nome: "NÃO está incluso", multi: true,
      dica: "Uma linha por item — é o que evita discussão depois" },
    { id: "garantia", nome: "Garantia",
      dica: "Ex.: 5 anos contra defeito de fabricação e montagem" },
    { id: "observacoes", nome: "Observações", multi: true }
  ];

  CarpProposta.comercial = function (proposta, padrao) {
    var p = proposta || {}, d = padrao || {};
    var out = {};
    CarpProposta.CAMPOS.forEach(function (c) {
      var v = txt(p[c.id]);
      out[c.id] = v || txt(d[c.id]);
    });
    return out;
  };

  CarpProposta.validar = function (proposta, padrao) {
    var c = CarpProposta.comercial(proposta, padrao);
    var f = [];
    CarpProposta.CAMPOS.forEach(function (campo) {
      if (campo.obrigatorio && !c[campo.id]) f.push("Falta preencher: " + campo.nome + ".");
    });
    return f;
  };

  /* ===================================================================
   * OS DOIS BLOCOS QUE O CLIENTE PAGA
   *
   * Devolve as linhas com preço unitário e total JÁ com os acréscimos
   * embutidos, distribuídos em centavos — de forma que:
   *   qtd × unitário = total da linha   e   Σ linhas = total da proposta.
   *
   * ⚠ Não lê `custoUnit` nem `margemPct`. O bloco da madeira parte de
   *   `vendaMadeira`, que já é o preço ao cliente.
   * =================================================================== */
  CarpProposta.blocos = function (r) {
    var venda = num(r && r.vendaMadeira);
    var moBase = num(r && r.moBase);
    var par = (r && r.parametros) || {};
    var addFaixa = num(r && r.acrescimoFaixa);
    var addDet = num(r && r.acrescimoDetalhe);

    /* acréscimo cuja base é o TOTAL se reparte entre os dois blocos, na
       proporção de cada um — senão o documento não fecharia */
    var sobreTotal = (par.incideAcrescimo === "total" ? addFaixa : 0)
      + (par.incideDetalhe === "total" ? addDet : 0);
    var sobreMO = (par.incideAcrescimo === "mo" ? addFaixa : 0)
      + (par.incideDetalhe === "mo" ? addDet : 0);

    var baseRep = venda + moBase;
    var partesTotal = baseRep > 0 ? ratear(cent(sobreTotal), [venda, moBase]) : [0, 0];

    var blocoMadeiraCent = cent(venda) + partesTotal[0];
    var blocoMOCent = cent(moBase) + cent(sobreMO) + partesTotal[1];

    function distribuir(linhas, totalCent) {
      var pesos = linhas.map(function (l) { return num(l.subtotal); });
      var fatias = ratear(totalCent, pesos);
      return linhas.map(function (l, i) {
        var totalLinha = reais(fatias[i]);
        var q = num(l.qtd);
        return {
          descricao: l.descricao || l.servico || "",
          unidade: l.unidade || "",
          qtd: q,
          /* o unitário é DERIVADO do total da linha, e não o contrário: é o
             que faz qtd × unitário fechar com o total impresso */
          unitario: q > 0 ? Math.round((totalLinha / q) * 100) / 100 : totalLinha,
          total: totalLinha
        };
      });
    }

    return {
      madeira: distribuir(arr(r && r.linhasMadeira).filter(function (l) { return !l.semPreco; }), blocoMadeiraCent),
      mo: distribuir(arr(r && r.linhasMO).filter(function (l) { return !l.semPreco; }), blocoMOCent),
      totalMadeira: reais(blocoMadeiraCent),
      totalMO: reais(blocoMOCent),
      total: reais(blocoMadeiraCent + blocoMOCent),
      acrescimoFaixa: addFaixa,
      acrescimoDetalhe: addDet
    };
  };

  /* ===================================================================
   * O DOCUMENTO
   *
   * ctx: { resultado, empresa, cliente, obra, padrao, hojeISO, numero }
   * opcoes: { detalharAcrescimos: bool, previa: bool }
   * =================================================================== */
  CarpProposta.gerar = function (proposta, ctx, opcoes) {
    var p = proposta || {}, c = ctx || {}, o = opcoes || {};
    var r = c.resultado || {};
    var b = CarpProposta.blocos(r);
    var com = CarpProposta.comercial(p, c.padrao);
    var emp = c.empresa || {};
    var empresa = txt(emp.nome) || "Sua Empresa";
    var logo = txt(c.logoHTML) || "";
    var hoje = txt(c.hojeISO) || "";
    var val = c.validade || {};

    function pg(titulo, corpo) {
      var wm = txt(c.marcaDagua);
      var rod = txt(c.rodape);
      return '<section class="pg interna">' + (wm ? '<div class="wm">' + esc(wm) + "</div>" : "")
        + '<h2 class="pg-tit">' + esc(titulo) + "</h2>" + corpo
        + (rod ? '<div class="pg-rod">' + esc(rod) + "</div>" : "") + "</section>";
    }
    function linhas(lista, rotuloCol) {
      if (!lista.length) return '<p class="nota">—</p>';
      return '<table class="prop-tbl"><thead><tr><th>' + esc(rotuloCol) + "</th>"
        + '<th class="r">Qtd</th><th>Un.</th><th class="r">Valor unit.</th><th class="r">Total</th></tr></thead><tbody>'
        + lista.map(function (l) {
          return "<tr><td>" + esc(l.descricao) + '</td><td class="r">' + n2(l.qtd) + "</td><td>"
            + esc(l.unidade) + '</td><td class="r">' + moeda(l.unitario) + '</td><td class="r">' + moeda(l.total) + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    function itens(txtMulti) {
      var l = txt(txtMulti).split(/\r?\n/).filter(function (x) { return x.trim(); });
      if (!l.length) return "";
      return "<ul>" + l.map(function (x) { return "<li>" + esc(x.trim().replace(/;$/, "")) + "</li>"; }).join("") + "</ul>";
    }

    var P = [];

    /* ---------- 1) CAPA ---------- */
    function row(k, v) { return '<div class="ci-row"><span>' + esc(k) + "</span><b>" + esc(v) + "</b></div>"; }
    P.push('<section class="pg capa">'
      + '<div class="capa-top">' + (logo || '<div class="logo-ph">' + esc(empresa) + "</div>") + "</div>"
      + '<div class="capa-mid"><div class="kicker">PROPOSTA COMERCIAL</div>'
      + "<h1>" + esc(txt(p.titulo) || "Proposta") + "</h1>"
      + '<div class="capa-obra">' + esc(txt(c.obraNome) || "Obra a definir") + "</div></div>"
      + '<div class="capa-info">'
      + row("Cliente", txt(c.clienteNome) || "—")
      + row("Proposta nº", txt(c.numero) || txt(p.id).slice(-6).toUpperCase())
      + row("Data", dia(txt(p.data) || hoje))
      + row("Validade", (val.dias || 30) + " dias"
        + (val.aplicavel && val.restam != null ? (val.vencida ? " · VENCIDA" : " · vence em " + val.restam + " dia(s)") : ""))
      + '<div class="ci-row"><span>Valor total</span><b style="color:var(--p-verde)">' + moeda(b.total) + "</b></div>"
      + "</div>"
      + '<div class="capa-rod">' + esc(empresa)
      + (txt(emp.cnpj) ? " · CNPJ " + esc(emp.cnpj) : "")
      + (txt(emp.endereco) ? " · " + esc(emp.endereco) : (txt(emp.cidade) ? " · " + esc(emp.cidade) : ""))
      + (txt(c.credito) ? " · " + esc(c.credito) : "") + "</div>"
      + "</section>");

    /* ---------- 2) APRESENTAÇÃO E ESCOPO ---------- */
    var servicos = b.mo.map(function (l) { return l.descricao; }).filter(Boolean);
    P.push(pg("1. Apresentação e escopo",
      "<p>A <b>" + esc(empresa) + "</b> apresenta a proposta para a execução dos serviços descritos abaixo, "
      + "com fornecimento de material e mão de obra.</p>"
      + (servicos.length
        ? "<p>O escopo contempla: <b>" + esc(servicos.join(" · ")) + "</b>"
          + (num(r.metragem) > 0 ? ", totalizando <b>" + n2(r.metragem) + " " + esc(unidade((r.parametros || {}).unidadeMO)) + "</b>" : "")
          + ".</p>"
        : "")
      + (com.prazoExecucao ? "<p><b>Prazo de execução:</b> " + esc(com.prazoExecucao) + "</p>" : "")));

    /* ---------- 3) O QUE SERÁ EXECUTADO ---------- */
    var corpoItens = "";
    if (b.mo.length) corpoItens += "<h3>Mão de obra</h3>" + linhas(b.mo, "Serviço")
      + '<p class="nota" style="text-align:right">Subtotal de mão de obra: <b>' + moeda(b.totalMO) + "</b></p>";
    if (b.madeira.length) corpoItens += "<h3>Material</h3>" + linhas(b.madeira, "Item")
      + '<p class="nota" style="text-align:right">Subtotal de material: <b>' + moeda(b.totalMadeira) + "</b></p>";
    corpoItens += '<table class="prop-tbl"><tfoot><tr><td><b>TOTAL DA PROPOSTA</b></td>'
      + '<td class="r"><b>' + moeda(b.total) + "</b></td></tr></tfoot></table>";
    if (o.detalharAcrescimos && (b.acrescimoFaixa > 0 || b.acrescimoDetalhe > 0)) {
      corpoItens += '<p class="nota">Formação do preço: '
        + (b.acrescimoFaixa > 0 ? "acréscimo de obra de menor metragem (" + moeda(b.acrescimoFaixa) + ")" : "")
        + (b.acrescimoFaixa > 0 && b.acrescimoDetalhe > 0 ? " e " : "")
        + (b.acrescimoDetalhe > 0 ? "detalhes arquitetônicos (" + moeda(b.acrescimoDetalhe) + ")" : "")
        + " já incluídos nos valores acima.</p>";
    }
    P.push(pg("2. O que será executado", corpoItens));

    /* ---------- 4) INCLUSO / EXCLUSO ---------- */
    if (com.incluso || com.excluso) {
      P.push(pg("3. Está incluso / Não está incluso",
        '<div class="cols"><div><h3>Incluso</h3>' + (itens(com.incluso) || '<p class="nota">—</p>') + "</div>"
        + "<div><h3>Não incluso</h3>" + (itens(com.excluso) || '<p class="nota">—</p>') + "</div></div>"));
    }

    /* ---------- 5) CONDIÇÕES ---------- */
    P.push(pg("4. Condições comerciais",
      '<div class="bloco"><h3>Pagamento</h3><p>' + esc(com.condicoesPagamento) + "</p></div>"
      + '<div class="bloco"><h3>Validade</h3><p>Esta proposta é válida por <b>' + (val.dias || 30)
      + " dias</b> a contar da data de emissão. Vencido o prazo, os valores são refeitos com os preços "
      + "vigentes na data.</p></div>"
      + (com.garantia ? '<div class="bloco"><h3>Garantia</h3><p>' + esc(com.garantia) + "</p></div>" : "")
      + (com.observacoes ? '<div class="bloco"><h3>Observações</h3>' + (itens(com.observacoes) || "<p>" + esc(com.observacoes) + "</p>") + "</div>" : "")
      + '<div class="assinaturas"><div class="assin"><div class="linha-assin"></div>' + esc(empresa)
      + "<br><span>Contratada</span></div>"
      + '<div class="assin"><div class="linha-assin"></div>' + esc(txt(c.clienteNome) || "Contratante")
      + "<br><span>Contratante</span></div></div>"));

    var faixa = o.previa
      ? '<div class="no-print" style="background:#fff7ed;border:1px solid #fdba74;color:#7c2d12;padding:10px 14px;'
        + 'border-radius:10px;margin:0 auto 12px;max-width:210mm;font-size:13px">'
        + "<b>Prévia.</b> Esta proposta ainda não foi fechada: os preços seguem o cadastro de hoje e "
        + "podem mudar. Feche a proposta para congelar os valores antes de enviar.</div>"
      : "";

    return { html: faixa + P.join(""), blocos: b, comercial: com };
  };

  /* ===================================================================
   * AUDITAR — o custo e a margem não podem estar no papel
   *
   * Varre o HTML gerado. Procura os números de custo (formatados como o
   * documento formata) e as palavras que denunciam a conta interna.
   * =================================================================== */
  CarpProposta.PALAVRAS_PROIBIDAS = [
    "custo de compra", "preço de compra", "margem de", "lucro", "custo unit"
  ];

  /* ⚠ O ESPAÇO DO "R$" NÃO É UM ESPAÇO. `Util.fmtMoeda` separa "R$" do
     número com espaço DURO (U+00A0) para o valor nunca quebrar em duas
     linhas. A auditoria comparava texto cru: um vazamento escrito com
     espaço comum — texto colado de outra tela, um campo digitado à mão —
     passava direto, e o custo ia impresso. Aqui os dois lados viram o
     mesmo espaço antes de comparar. */
  function achatar(t) {
    return String(t == null ? "" : t)
      .replace(/[\u00a0\u2007\u202f]/g, " ")
      .replace(/\s+/g, " ");
  }

  CarpProposta.auditar = function (html, r) {
    var achados = [];
    var h = achatar(html);
    var baixo = h.toLowerCase();

    CarpProposta.PALAVRAS_PROIBIDAS.forEach(function (w) {
      if (baixo.indexOf(w) > -1) achados.push({ tipo: "palavra", achado: w });
    });

    /* os números: o custo de cada item e o custo total da madeira, no mesmo
       formato em que o documento escreveria um valor */
    var suspeitos = [];
    arr(r && r.linhasMadeira).forEach(function (l) {
      if (l && l.custoUnit != null) {
        suspeitos.push({ v: num(l.custoUnit), o: "custo unitário de " + (l.descricao || "um item") });
        if (num(l.qtd) > 0) suspeitos.push({ v: num(l.custoUnit) * num(l.qtd), o: "custo total de " + (l.descricao || "um item") });
      }
    });
    if (r && r.custoMadeira != null) suspeitos.push({ v: num(r.custoMadeira), o: "custo total da madeira" });
    if (r && r.lucroMadeira != null && num(r.lucroMadeira) > 0) suspeitos.push({ v: num(r.lucroMadeira), o: "lucro da madeira" });

    suspeitos.forEach(function (s) {
      if (!(s.v > 0)) return;
      var fmt = moeda(s.v);
      /* ⚠ um custo pode coincidir com um valor legítimo (a venda de um item
         batendo com o custo de outro). Só acusa quando o número aparece E
         não é nenhum dos valores que o documento DEVE mostrar. */
      if (h.indexOf(achatar(fmt)) < 0) return;
      var legitimo = false;
      var b = CarpProposta.blocos(r);
      [b.total, b.totalMO, b.totalMadeira].concat(
        b.madeira.map(function (x) { return x.total; }),
        b.madeira.map(function (x) { return x.unitario; }),
        b.mo.map(function (x) { return x.total; }),
        b.mo.map(function (x) { return x.unitario; })
      ).forEach(function (v) { if (moeda(v) === fmt) legitimo = true; });
      if (!legitimo) achados.push({ tipo: "numero", achado: fmt, motivo: s.o });
    });
    return achados;
  };

  global.CarpProposta = CarpProposta;
  if (typeof module !== "undefined" && module.exports) module.exports = CarpProposta;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
