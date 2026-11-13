/* =====================================================================
 * orcguia.js — O ORÇAMENTO GUIADO: o roteiro de 4 passos até a proposta
 *
 * Pedido do Rogério (13/11/2026): o Orçamento é o carro-chefe e o cliente novo
 * se perde — a base de preço mora no menu da conta, o BDI em três lugares, e a
 * proposta que não sai só avisa num recado que some. Este arquivo é o MOTOR
 * (puro, testável em Node, ES5): decide a situação de cada passo
 *
 *     ① Base de preço   ② Itens   ③ BDI e condições   ④ Proposta
 *
 * a partir do orçamento e do que o app já sabe (bases instaladas, o resultado
 * de Proposta.validar). Quem desenha é o `Modulo.roteiro` (kit) e quem liga os
 * cliques é `js/orcguiaui.js`. Nada aqui grava, soma preço ou decide dinheiro:
 * só LÊ e diz o que falta e onde se resolve.
 *
 * ⚠ PADRÃO PARA TODOS (aprovado pelo Rogério em 13/11/2026; foi a prévia
 *   `?previa=orcamento`). Saída por aparelho, no mesmo padrão do visual:
 *   `?previa=orcamento-desligar` grava `orcapro:tela:orcamento-guiado:off` e o
 *   editor volta a ser o de antes NESTE aparelho; `?previa=orcamento` religa.
 *   A chave antiga da prévia (`…:v1`) não decide mais nada. Armazenamento
 *   bloqueado = vale o padrão (ligado): sem como ler a escolha, o guiado fica.
 *   O que decide é `OrcGuia.previa()` (o nome ficou para não mexer nos 30
 *   pontos que perguntam por ele); `OrcGuia.aplicarUrl` lê o parâmetro.
 *
 * ⚠ "FALTA" É CALCULADO DE VERDADE, nunca escrito de memória. Um roteiro que
 *   marca ✔ sem conferir é pior que roteiro nenhum: a pessoa confia, gera a
 *   proposta e descobre o que faltava na frente do cliente.
 *
 * ⚠ O REGIME (desonerado) DO ORÇAMENTO É DECLARATÓRIO (js/orcwizard.js, passo
 *   2): ele não recalcula preço da base. Por isso a base exigida vem dos ITENS
 *   (a origem de cada um) e só cai no regime declarado quando o orçamento ainda
 *   está vazio — e, nesse caso, como "Confira", não como "Falta".
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE = "orcapro:tela:orcamento-guiado:off";   /* "1" = desligado NESTE aparelho */

  function s(v) { return String(v === null || v === undefined ? "" : v).replace(/^\s+|\s+$/g, ""); }
  function up(v) { return s(v).toUpperCase(); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function BE() {
    if (global.BaseExigida) return global.BaseExigida;
    if (typeof require === "function") { try { return require("./baseexigida.js"); } catch (e) { return null; } }
    return null;
  }

  /* os quatro passos, na ordem em que o trabalho acontece */
  var PASSOS = [
    { id: "base", rotulo: "Base de preço" },
    { id: "itens", rotulo: "Itens" },
    { id: "bdi", rotulo: "BDI e condições" },
    { id: "proposta", rotulo: "Proposta" }
  ];

  function previa() {
    try { return !(typeof localStorage !== "undefined" && localStorage.getItem(CHAVE) === "1"); } catch (e) { return true; }
  }

  /* `?previa=orcamento-desligar` desliga neste aparelho; `?previa=orcamento` religa (aceita lista: `?previa=visual,orcamento`).
     Devolve "desligado" | "ligado" | "" (o endereço não falou do orçamento). `armazem` existe para o teste. */
  function aplicarUrl(busca, armazem) {
    var m = /[?&]previa=([^&]*)/i.exec(String(busca || "")), st = armazem || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!m || !st) return "";
    var nomes = []; try { nomes = decodeURIComponent(m[1]).toLowerCase().split(","); } catch (e) { nomes = String(m[1]).toLowerCase().split(","); }
    try {
      if (nomes.indexOf("orcamento-desligar") > -1) { st.setItem(CHAVE, "1"); return "desligado"; }
      if (nomes.indexOf("orcamento") > -1) { st.removeItem(CHAVE); return "ligado"; }
    } catch (e2) {}
    return "";
  }
  /* ⚠ lido AQUI, no carregamento do script: o App só apaga o parâmetro do endereço no boot (_previaDaUrl), depois */
  try { if (typeof location !== "undefined") aplicarUrl(location.search); } catch (eU) {}

  /* quantos itens do orçamento vieram de cada base (a ORIGEM do item é a verdade — ver Orcamento._origemDe).
     Preço próprio / composição própria não pedem base nenhuma. */
  function usoDeBases(orc) {
    var uso = {};
    arr(orc && orc.etapas).forEach(function (e) {
      arr(e && e.itens).forEach(function (it) {
        var f = up(it && (it.origem || it.baseFonte));
        if (!f || f === "PROPRIO" || f === "PROPRIA" || f === "OUTRA") return;
        uso[f] = (uso[f] || 0) + 1;
      });
    });
    return uso;
  }

  function fmtComp(c) {
    var B = BE(), x = B && B.comp ? B.comp(c) : "";
    return x && B.fmtComp ? B.fmtComp(x) : s(c);
  }

  /* o nome curto da base no texto da tela: "SINAPI MG", "SINAPI desonerada MG", "SICRO" */
  function nomeBase(it) {
    var n = it.catId === "SINAPI_DES" ? "SINAPI desonerada" : (it.base || it.catId);
    return n + (it.uf ? " " + it.uf : "");
  }

  /* As bases que ESTE orçamento precisa ter instaladas. ctx: { sinapi:{uf}, totais:{qtdItens} }. */
  function basesNecessarias(orc, ctx) {
    var c = ctx || {}, uso = usoDeBases(orc), out = [];
    var uf = up(orc && orc.uf) || up(c.sinapi && c.sinapi.uf);
    var vazio = !(c.totais && num(c.totais.qtdItens) > 0);
    var onerada = uso.SINAPI > 0 || (vazio && !uso.SINAPI_DES);
    if (onerada) out.push({ catId: "SINAPI", base: "SINAPI", uf: uf, competencia: "", regime: "onerado", origem: uso.SINAPI > 0 ? "itens" : "padrao" });
    if (uso.SINAPI_DES > 0) out.push({ catId: "SINAPI_DES", base: "SINAPI", uf: uf, competencia: "", regime: "desonerado", origem: "itens" });
    else if (vazio && orc && orc.desonerado === true) out.push({ catId: "SINAPI_DES", base: "SINAPI", uf: uf, competencia: "", regime: "desonerado", origem: "declarada" });
    Object.keys(uso).forEach(function (f) {
      if (f === "SINAPI" || f === "SINAPI_DES") return;
      out.push({ catId: f, base: f, uf: "", competencia: "", regime: "", origem: "itens" });
    });
    return out;
  }

  /* ① Base de preço */
  function passoBase(orc, ctx) {
    var c = ctx || {}, B = BE();
    var nec = basesNecessarias(orc, c), pend = [], avisos = [], ok = [];
    var sit = B && B.situacao ? B.situacao(nec, arr(c.bases)) : [];
    nec.forEach(function (it, i) {
      var st = sit[i] || { estado: "ausente", instalada: null };
      if (st.estado === "instalada") {
        var inst = st.instalada || {}, compInst = B && B.comp ? B.comp(inst.competencia) : "";
        var compOrc = B && B.comp ? B.comp(orc && orc.competenciaSinapi) : "";
        if ((it.catId === "SINAPI" || it.catId === "SINAPI_DES") && compOrc && compInst && compOrc !== compInst) {
          avisos.push({ texto: "O orçamento declara " + fmtComp(compOrc) + " e a " + nomeBase(it) + " instalada é de " + fmtComp(compInst) + ". Confira se é essa que você quer.", alvo: "base", item: it });
        } else if (it.origem === "declarada") {
          avisos.push({ texto: "Você declarou o regime desonerado e a " + nomeBase(it) + " já está instalada. Ao lançar itens, filtre por desonerada na busca.", alvo: "base", item: it });
        }
        ok.push(nomeBase(it) + (compInst ? " " + fmtComp(compInst) : ""));
      } else if (st.estado === "assinatura") {
        pend.push({ texto: "A base " + it.base + " é de assinatura: importe o arquivo da sua empresa.", alvo: "base", item: it, importar: true });
      } else if (it.origem === "declarada") {
        avisos.push({ texto: "Você declarou o regime desonerado, mas a " + nomeBase(it) + " ainda não está instalada.", alvo: "base", item: it, instalar: true });
      } else {
        pend.push({ texto: "Falta a base " + nomeBase(it) + ".", alvo: "base", item: it, instalar: true });
      }
    });
    var estado = pend.length ? "falta" : (avisos.length ? "aviso" : "ok"), resumo;
    if (pend.length) resumo = pend[0].texto + (pend.length > 1 ? " (+" + (pend.length - 1) + ")" : "") + " Clique para instalar.";
    else if (avisos.length) resumo = avisos[0].texto;
    else if (!nec.length) resumo = "Os itens têm preço próprio; nenhuma base é exigida.";
    else resumo = ok.join(" e ") + ".";
    return { id: "base", estado: estado, resumo: resumo, pendencias: pend.concat(avisos) };
  }

  /* ② Itens */
  function passoItens(orc, ctx) {
    var c = ctx || {}, t = c.totais || {}, n = num(t.qtdItens);
    var semPreco = arr(c.semPreco), semQtd = arr(c.semQtd), prov = num(c.provisorio);
    var pend = [], resumo, estado = "ok";
    if (n < 1) {
      pend.push({ texto: "O orçamento não tem itens.", alvo: "itens" });
      resumo = "Nenhum item ainda. Descreva a obra no Escopo Inteligente ou lance os serviços na planilha.";
    } else {
      if (semPreco.length) pend.push({ texto: semPreco.length + (semPreco.length === 1 ? " item sem preço." : " itens sem preço."), alvo: "preco" });
      if (semQtd.length) pend.push({ texto: semQtd.length + (semQtd.length === 1 ? " item sem quantidade." : " itens sem quantidade."), alvo: "quantidade" });
      resumo = n + (n === 1 ? " item" : " itens") + " em " + num(t.qtdEtapas) + (num(t.qtdEtapas) === 1 ? " etapa." : " etapas.");
      if (pend.length) resumo = pend.map(function (p) { return p.texto.replace(/\.$/, ""); }).join("; ") + ".";
      else if (prov) { estado = "aviso"; pend.push({ texto: prov + (prov === 1 ? " item com preço provisório." : " itens com preço provisório.") + " Cote com o fornecedor.", alvo: "itens" }); resumo = pend[0].texto; }
    }
    if (n < 1 || semPreco.length || semQtd.length) estado = "falta";
    return { id: "itens", estado: estado, resumo: resumo, pendencias: pend };
  }

  /* ③ BDI e condições — cliente e pagamento são o que a proposta exige; o resto (BDI, validade) aparece no resumo */
  function passoBdi(orc, ctx) {
    var o = orc || {}, cm = o.comercial || {}, pend = [];
    var cliente = s(o.cliente && o.cliente.nome), pag = s(cm.condicoesPagamento);
    if (!cliente) pend.push({ texto: "Falta o cliente.", alvo: "cliente" });
    if (!pag) pend.push({ texto: "Faltam as condições de pagamento.", alvo: "condicoes" });
    var bdi = o.bdi && o.bdi.percentual != null && isFinite(Number(o.bdi.percentual)) ? Number(o.bdi.percentual) : null;
    var val = cm.validadeDias != null && num(cm.validadeDias) > 0 ? num(cm.validadeDias) + " dias de validade" : (s(cm.validadeProposta) ? "validade definida" : "validade conforme o edital");
    var partes = [];
    if (bdi !== null) partes.push("BDI " + String(bdi.toFixed(2)).replace(".", ",") + "%");
    partes.push(val);
    var resumo = pend.length ? pend.map(function (p) { return p.texto.replace(/\.$/, ""); }).join("; ") + "." : (cliente + ": " + partes.join(", ") + ".");
    return { id: "bdi", estado: pend.length ? "falta" : "ok", resumo: resumo, pendencias: pend };
  }

  /* ④ Proposta — o que Proposta.validar disse (ctx.validar). Cada pendência traz o lugar que a resolve. */
  function pendenciasProposta(validar) {
    var v = validar || {};
    if (arr(v.itens).length) return arr(v.itens).map(function (i) { return { texto: s(i.texto), alvo: s(i.alvo) || "condicoes" }; });
    return arr(v.faltando).map(function (t) { return { texto: s(t), alvo: "condicoes" }; });
  }
  function passoProposta(orc, ctx) {
    var v = (ctx && ctx.validar) || { ok: false, faltando: [] };
    var pend = pendenciasProposta(v);
    if (v.ok && !pend.length) return { id: "proposta", estado: "ok", resumo: "Pronta para gerar. Escolha o modelo e imprima ou baixe em Word.", pendencias: [] };
    var n = pend.length;
    var resumo = (n === 1 ? "1 pendência: " : n + " pendências: ") + pend.slice(0, 2).map(function (p) { return p.texto.replace(/[.:—].*$/, "").replace(/\s+$/, ""); }).join("; ") + (n > 2 ? " e mais " + (n - 2) : "") + ".";
    return { id: "proposta", estado: "falta", resumo: resumo, pendencias: pend };
  }

  /* os quatro passos, já com o rótulo, o número e o ATUAL (o primeiro que falta; tudo pronto → a proposta) */
  function passos(orc, ctx) {
    var lista = [passoBase(orc, ctx), passoItens(orc, ctx), passoBdi(orc, ctx), passoProposta(orc, ctx)];
    var atual = -1;
    lista.forEach(function (p, i) { if (atual < 0 && p.estado === "falta") atual = i; });
    if (atual < 0) atual = lista.length - 1;
    return lista.map(function (p, i) {
      var meta = PASSOS[i];
      p.rotulo = meta.rotulo; p.num = i + 1; p.atual = (i === atual);
      return p;
    });
  }

  var OrcGuia = {
    CHAVE: CHAVE, PASSOS: PASSOS, previa: previa, aplicarUrl: aplicarUrl, usoDeBases: usoDeBases, basesNecessarias: basesNecessarias,
    passos: passos, pendenciasProposta: pendenciasProposta, nomeBase: nomeBase
  };
  global.OrcGuia = OrcGuia;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcGuia;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
