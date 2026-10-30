/* =====================================================================
 * licitacao.js — MODO LICITAÇÃO DE VERDADE (integração com o CertamePRO)
 *
 * Até aqui "licitação" era só um flag em `config.licitacao` (orcamento.js):
 * ele mudava um rótulo no Excel e um aviso no Fechar valor, e nada mais.
 * Este módulo é a regra que faltava, em cima do contrato combinado com o
 * CertamePRO (docs/INTEGRACAO-ORCAPRO.md do projeto Licitacoes):
 *
 *   1. LEITURA do bloco `certamepro` do pacote → `config.licitacao`
 *      (valor estimado, critério, BDI e data-base de referência, preço de
 *      referência por item, para onde devolver).
 *   2. TRAVA dos itens que vieram do órgão: descrição, unidade e quantidade
 *      não mudam e o item não sai da planilha; o PREÇO continua livre (é o
 *      que se disputa). Todas as portas passam por `itemTravado` — a regra
 *      que cada mutador consulta mora em js/orcamento.js (_travadoOrgao).
 *   3. AVISOS (nunca bloqueiam): preço unitário COM BDI acima da referência
 *      do órgão, total acima do teto, e a faixa de exequibilidade em obra.
 *   4. DESCONTO LINEAR: um % único sobre os preços de referência.
 *
 * ⚠ POR QUE OS AVISOS NÃO BLOQUEIAM. Quem decide entrar com preço acima da
 *   referência num item (e compensar noutro) é o orçamentista; o sistema só
 *   faz a conta que ele faria na mão e mostra. Bloquear empurraria a pessoa
 *   para planilha paralela, que é exatamente o que este módulo existe para
 *   evitar. A TRAVA de quantidade, ao contrário, bloqueia: item do órgão com
 *   quantidade alterada é causa de desclassificação, e a pessoa tem uma porta
 *   (`liberarTrava`) para os casos em que o edital permite.
 *
 * ⚠ COMPARAÇÃO É SEMPRE COM BDI. A referência do órgão pode vir sem BDI
 *   (`precos_incluem_bdi:false`, caso do pacote do CertamePRO, que tira o BDI
 *   antes de entregar). O preço da proposta é o unitário COM BDI. Comparar o
 *   preço com BDI contra a referência sem BDI acusaria 100% dos itens; por isso
 *   a referência com BDI é a do ÓRGÃO quando o pacote a traz
 *   (`preco_unitario_bdi`, ver refDoItem) e, sem ela, a levada a "com BDI"
 *   pelo `bdi_referencia_pct` do edital. Sem esse percentual no pacote,
 *   usa-se o BDI do próprio orçamento — e o aviso DIZ que a referência foi
 *   assumida assim.
 *
 * Módulo PURO: sem DOM e sem rede (a fiação fica em js/app.js e js/ui.js).
 * ES5 de propósito (ver CLAUDE.md).
 * ===================================================================== */
(function (global) {
  "use strict";

  function _dep(nome) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") {
      try { var m = require("./" + nome.toLowerCase() + ".js"); if (m) return m; } catch (e) {}
    }
    return null;
  }
  function U() { return _dep("Util"); }
  function O() { return _dep("Orcamento"); }
  function A() {
    if (global.Arred) return global.Arred;
    if (typeof require === "function") { try { return require("./arredondamento.js"); } catch (e) {} }
    return null;
  }

  function num(v) { var u = U(); return u ? u.num(v) : (Number(v) || 0); }
  function fmt(v) { var u = U(); return u && u.fmtMoeda ? u.fmtMoeda(v) : ("R$ " + Number(v).toFixed(2)); }
  function fmtPct(v) { var u = U(); return (u && u.fmtNum ? u.fmtNum(v, 2) : Number(v).toFixed(2)) + "%"; }
  function tr2(v) {
    var a = A();
    if (a && a.valor) return a.valor(v, "truncar2");
    var n = Number(v); if (!isFinite(n)) return 0;
    return (n < 0 ? -1 : 1) * (Math.floor(Math.abs(n) * 100 + 1e-9) / 100);
  }
  function s(v) { return String(v == null ? "" : v).trim(); }

  /* Limites da Lei 14.133/2021, art. 59 — OBRAS e serviços de engenharia,
     sobre o valor ORÇADO pela Administração (o valor estimado do edital). */
  var LIM_INEXEQUIVEL = 0.75;   // § 4º
  var LIM_GARANTIA = 0.85;      // § 5º

  /* Categoria do insumo: MO, MAT, EQ ou "" (composição auxiliar: tem de tudo dentro, e o
     analítico do órgão não abre). ⚠ A auxiliar é "" MESMO quando a base a rotula MAT: a
     SEINFRA marca C3130 (areia de rio, extração) e C3253 (brita produzida) como material,
     e por dentro elas são equipamento e servente. Dar o fator nelas inteiras era supor
     100% material; o que tem dentro só se sabe abrindo a composição (_listaComFator). */
  function _ehComp(i) { return String((i && i.tipo) || "").toUpperCase() === "COMPOSICAO"; }
  function _catDe(i) {
    if (_ehComp(i)) return "";
    var c = String((i && i.categoria) || "").toUpperCase();
    return (c === "MO" || c === "MAT" || c === "EQ") ? c : "";
  }
  function _r4(v) { return Math.round(v * 1e4) / 1e4; }
  function _normTxt(t) {
    var x = String(t == null ? "" : t).toUpperCase();
    try { x = x.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return x.replace(/[^A-Z0-9]/g, "");
  }
  /* tolerância do contrato do analítico (docs/ANALITICO-BASES-CONTRATO.md): max(R$ 0,02; 0,5%) */
  function _tolAux(cu) { return Math.max(0.02, Math.abs(cu) * 0.005); }

  /* ------------------------------------------------------------------
   * DESCONTO CONCENTRADO DENTRO DAS AUXILIARES (pedido de cliente, 30/10/2026)
   * "Só no material" quer dizer TODO material da obra com o mesmo fator, inclusive
   * a areia e o cimento da argamassa C0171 que está dentro da C2895: o modelo de
   * 49 p. da CE 021 faz assim (areia 83,58 → 47,50; cimento 0,71 → 0,4035). Antes
   * a auxiliar entrava inteira, sem desconto, e o documento a imprimia pela base.
   * `ctx` = { obter(cod) → composição da base ou null, memo, semComp, divergente }.
   * Devolve a lista nova (cópia), Σ antes, Σ depois e, em `aux`, a versão
   * descontada de cada auxiliar aberta (para o documento imprimir os mesmos números).
   * Auxiliar sem composição conhecida, ou cuja composição não explica o preço
   * usado no item (outra competência), fica como está e é contada: nunca se
   * inventa parcela.
   * ------------------------------------------------------------------ */
  function _listaComFator(lista, fator, cat, ctx, trilha, aux) {
    var nova = [], somaO = 0, somaN = 0;
    (lista || []).forEach(function (i) {
      if (!i || typeof i !== "object") { nova.push(i); return; }
      var c = JSON.parse(JSON.stringify(i)), co = num(i.coeficiente), u = num(i.custoUnitario);
      if (_ehComp(i)) {
        var nv = _auxNovoCusto(i, u, fator, cat, ctx, trilha, aux);
        if (nv != null) c.custoUnitario = nv;
      } else if (_catDe(i) === cat) c.custoUnitario = _r4(u * fator);
      if (c.custoTotal != null) c.custoTotal = _r4(co * num(c.custoUnitario));
      somaO += co * u; somaN += co * num(c.custoUnitario);
      nova.push(c);
    });
    return { lista: nova, antes: somaO, depois: somaN };
  }
  /* Custo novo da auxiliar `i` (custo `u` nesta linha) com o fator, ou null se não dá para abrir.
     O custo novo parte do preço DESTA linha (u − queda), e a versão guardada em `aux` leva o
     mesmo número: o documento imprime a auxiliar com o valor que a linha de cima usou. */
  function _auxNovoCusto(i, u, fator, cat, ctx, trilha, aux) {
    var cod = s(i.codigo);
    if (!ctx || !cod) { if (ctx) ctx.semComp[cod || "(sem código)"] = 1; return null; }
    if (trilha[cod]) { ctx.ciclo[cod] = 1; return null; }   /* auxiliar que contém a si mesma: não desce de novo */
    if (ctx.memoFator !== fator) { ctx.memo = {}; ctx.memoFator = fator; }
    var m = ctx.memo[cod];
    if (!m) {
      var comp = null;
      try { comp = ctx.obter(cod); } catch (e) { comp = null; }
      if (!comp || !Array.isArray(comp.insumos) || !comp.insumos.length) { ctx.memo[cod] = m = { sem: true }; }
      else {
        var sub = {};
        trilha[cod] = 1;
        var r = _listaComFator(comp.insumos, fator, cat, ctx, trilha, sub);
        delete trilha[cod];
        var cb = num(comp.custoUnitario) > 0 ? num(comp.custoUnitario) : r.antes;
        ctx.memo[cod] = m = { soma: r.antes, delta: r.antes - r.depois, sub: sub,
          ent: { codigo: cod, descricao: s(comp.descricao), unidade: s(comp.unidade), fonte: s(comp.fonte || i.fonte), custoBase: cb, insumos: r.lista } };
      }
    }
    if (m.sem) { ctx.semComp[cod] = 1; return null; }
    /* a composição da base tem de explicar o preço usado AQUI; senão é outra tabela */
    if (Math.abs(m.soma - u) > _tolAux(u)) { ctx.divergente[cod] = 1; return null; }
    /* sem a categoria dentro, a auxiliar fica no preço que já tinha (nem o arredondamento mexe) */
    var nv = m.delta > 1e-9 ? Math.max(0, Math.min(u, ctx.arrAux(u - m.delta))) : u;   /* auxiliar só de material com fator 0 não fica negativa */
    Object.keys(m.sub).forEach(function (k) { aux[k] = JSON.parse(JSON.stringify(m.sub[k])); });
    var e = JSON.parse(JSON.stringify(m.ent));
    e.custoUnitario = m.delta > 1e-9 ? nv : e.custoBase;
    aux[cod] = e;
    return nv;
  }
  /* Σ coeficiente × custo, com `fator` nos insumos da categoria `cat` */
  function _somaInsumos(lista, fator, cat) {
    var soma = 0;
    (lista || []).forEach(function (i) {
      if (!i || typeof i !== "object") return;
      var u = num(i.custoUnitario);
      soma += num(i.coeficiente) * ((!cat || _catDe(i) === cat) ? u * fator : u);
    });
    return soma;
  }
  function _copiaInsumos(it) {
    return (it && Array.isArray(it.insumos) && it.insumos.length) ? JSON.parse(JSON.stringify(it.insumos)) : null;
  }
  /* Desconto linear ou por item: o analítico anda junto, senão a composição impressa
     continua somando o preço cheio ao lado de uma planilha com desconto. */
  function _escalarInsumos(it, k) {
    if (!(it && Array.isArray(it.insumos) && it.insumos.length) || !(k > 0) || k === 1) return;
    it.insumos.forEach(function (i) {
      if (!i || typeof i !== "object") return;
      i.custoUnitario = Math.round(num(i.custoUnitario) * k * 1e4) / 1e4;
      if (i.custoTotal != null) i.custoTotal = Math.round(num(i.coeficiente) * num(i.custoUnitario) * 1e4) / 1e4;
    });
  }

  var Licitacao = {
    LIM_INEXEQUIVEL: LIM_INEXEQUIVEL,
    LIM_GARANTIA: LIM_GARANTIA,

    cfg: function (orc) {
      return (orc && orc.config && orc.config.licitacao && typeof orc.config.licitacao === "object") ? orc.config.licitacao : null;
    },
    ativo: function (orc) { var c = this.cfg(orc); return !!(c && c.ativo); },
    /* veio do CertamePRO (tem o bloco lido)? */
    temPacote: function (orc) { var c = this.cfg(orc); return !!(c && c.certamepro); },

    /* ------------------------------------------------------------------
     * 1) LEITURA DO BLOCO `certamepro`
     * Devolve o que foi gravado (para o resumo da importação) ou null se o
     * bloco não existe / não é objeto. Idempotente: importar o mesmo pacote
     * de novo reescreve os mesmos campos.
     * ------------------------------------------------------------------ */
    aplicarPacote: function (orc, bloco) {
      if (!orc || !bloco || typeof bloco !== "object") return null;
      orc.config = (orc.config && typeof orc.config === "object") ? orc.config : {};
      var lic = (orc.config.licitacao && typeof orc.config.licitacao === "object") ? orc.config.licitacao : {};
      orc.config.licitacao = lic;
      lic.ativo = true;
      lic.certamepro = true;
      lic.certame = s(bloco.certame);
      lic.pncp = s(bloco.numero_controle_pncp);
      var org = (bloco.orgao && typeof bloco.orgao === "object") ? bloco.orgao : {};
      lic.orgao = { nome: s(org.nome), cnpj: s(org.cnpj) };
      lic.criterio = s(bloco.criterio_julgamento);
      lic.valorEstimado = num(bloco.valor_estimado) > 0 ? num(bloco.valor_estimado) : 0;
      lic.bdiRef = (bloco.bdi_referencia_pct != null && isFinite(Number(bloco.bdi_referencia_pct))) ? Number(bloco.bdi_referencia_pct) : null;
      lic.dataBase = s(bloco.data_base);
      lic.precosIncluemBdi = bloco.precos_incluem_bdi === true;
      lic.devolverPara = s(bloco.devolver_para);
      /* link para voltar à tela do certame depois de devolver (só http/https;
         qualquer outro esquema, como javascript:, é descartado) */
      lic.urlCertame = /^https?:\/\//i.test(s(bloco.url_certame)) ? s(bloco.url_certame) : "";
      /* o que o CertamePRO avisou ao montar o pacote (item fora por falta de
         quantidade, item sem preço do órgão) — ver avisos(), chave "pacote" */
      lic.avisosPacote = (Array.isArray(bloco.avisos) ? bloco.avisos : []).map(function (x) { return s(x); }).filter(function (x) { return !!x; }).slice(0, 10);
      /* ⚠ OBRA OU SERVIÇO DE ENGENHARIA (`obra_engenharia`) é o que liga os
         limites de 75%/85% do art. 59, §§ 4º e 5º — que a lei restringe a
         "obras e serviços de engenharia". Até 13/10/2026 o padrão era TRUE:
         pregão de serviço comum vindo do CertamePRO ganhava "proposta
         inexequível" por uma regra que não vale para ele. Sem a informação, o
         padrão agora é FALSE — e o aviso diz, com todas as letras, que os
         limites NÃO estão sendo aplicados (calar seria esconder o limite de
         quem disputa obra). Só booleano conta: texto ou número é "não
         informado". Uma escolha da pessoa em ⚙ Parâmetros (obraInformada)
         não é desfeita por pacote que não traz o campo. */
      if (bloco.obra_engenharia === true || bloco.obra_engenharia === false) {
        lic.obra = bloco.obra_engenharia; lic.obraInformada = true;
      } else if (!lic.obraInformada) {
        lic.obra = false; lic.obraInformada = false;
      }

      /* Mapa de referência. Por NÚMERO do item no órgão (numeroOrigem) é a chave
         forte; por CÓDIGO só vale quando o código aparece UMA vez na planilha do
         órgão — com duas ocorrências a chave seria ambígua e o aviso de um item
         sairia com o preço do outro (não se casa por semelhança). */
      var porN = {}, porC = {}, cont = {}, n = 0;
      var itens = Array.isArray(bloco.itens_referencia) ? bloco.itens_referencia : [];
      /* `preco_unitario_bdi`: o preço COM BDI do órgão (o que a planilha dele
         imprime) — ver refDoItem, que o prefere à conta sem × BDI. */
      var comBdiDe = function (r) { var v = num(r.preco_unitario_bdi); return v > 0 ? v : null; };
      itens.forEach(function (r) {
        if (!r || typeof r !== "object") return;
        var p = num(r.preco_unitario);
        if (!(p > 0)) return;
        var reg = { numero: s(r.numero), codigo: s(r.codigo), fonte: s(r.fonte), preco: p, precoBdi: comBdiDe(r) };
        if (reg.numero) { porN[reg.numero] = reg; n++; }
        if (reg.codigo) cont[reg.codigo] = (cont[reg.codigo] || 0) + 1;
      });
      itens.forEach(function (r) {
        if (!r || typeof r !== "object") return;
        var cod = s(r.codigo), p = num(r.preco_unitario);
        if (cod && p > 0 && cont[cod] === 1) porC[cod] = { numero: s(r.numero), codigo: cod, fonte: s(r.fonte), preco: p, precoBdi: comBdiDe(r) };
      });
      /* LEITURA DO PDF DO ÓRGÃO (BDI, encargos, cronograma, memória, tabelas, conferência), que o
         pacote do CertamePRO traz em `leitura`. É a matéria-prima do pacote da proposta
         (js/licitacaodocs.js). Fica dentro de config.licitacao, que o Excel leva inteiro na aba _meta
         e o orçamento leva em todo salvar/exportar — nada de campo solto que se perca no caminho.
         Cópia profunda: o pacote importado não pode ficar amarrado ao objeto do orçamento.
         Pacote SEM `leitura` não apaga a que já está (importar de novo é idempotente). */
      if (bloco.leitura && typeof bloco.leitura === "object" && !Array.isArray(bloco.leitura)) {
        try { lic.leitura = JSON.parse(JSON.stringify(bloco.leitura)); } catch (eL) {}
      }
      lic.refs = { n: porN, c: porC };
      lic.nRefs = n || Object.keys(porC).length;
      lic.travaLiberada = false;

      /* BASES EXIGIDAS PELO EDITAL: fonte, UF, competência e regime de cada
         tabela que o edital fixa. Entrada sem fonte ou sem competência válida
         não entra (nunca se inventa o mês) — e a contagem das ignoradas fica,
         para o painel dizer que o pacote trouxe algo que não deu para ler.
         As escolhas já registradas (usar outra competência) sobrevivem a uma
         reimportação: são decisão de quem orça, com data e autor. */
      if (Array.isArray(bloco.bases_exigidas)) {
        lic.basesExigidas = this.lerBasesExigidas(bloco.bases_exigidas);
        lic.basesExigidasIgnoradas = bloco.bases_exigidas.length - lic.basesExigidas.length;
      }

      /* Tudo que está no pacote veio da planilha do órgão: trava. Item que a
         pessoa acrescentar DEPOIS não leva a marca e continua livre (e o
         aviso de "fora da planilha do órgão" o mostra). */
      var travados = 0;
      (orc.etapas || []).forEach(function (e) {
        ((e && e.itens) || []).forEach(function (it) { if (it) { it.travadoOrgao = true; travados++; } });
      });
      lic.nTravados = travados;
      return lic;
    },

    /* ------------------------------------------------------------------
     * 2) TRAVA
     * ------------------------------------------------------------------ */
    itemTravado: function (orc, it) {
      var c = this.cfg(orc);
      return !!(c && c.ativo && !c.travaLiberada && it && it.travadoOrgao);
    },
    liberarTrava: function (orc, liberar) {
      var c = this.cfg(orc); if (!c) return false;
      c.travaLiberada = !!liberar; return true;
    },

    /* Os campos que a trava segura. ⚠ O PREÇO (custoUnitario e as parcelas
       MO/MAT/EQ) fica de fora DE PROPÓSITO: é o que se disputa. O CÓDIGO
       também: o licitante pode precificar o item do órgão pela composição
       dele — o Orçamentista troca código e fonte, nunca descrição, unidade ou
       quantidade (js/orcamentistaui.js, _orcmAplicar). */
    CAMPOS_TRAVADOS: ["quantidade", "descricao", "unidade"],

    /* ⚠ UM RECADO SÓ PARA AS SETE PORTAS (célula da planilha, memória de
       cálculo, Reimportar Excel, edição por IA, remover item, remover etapa
       e a edição da composição própria que reprecifica os itens).
       Até 13/10/2026 só a célula e o remover item estavam travados: a memória
       de cálculo, o Reimportar Excel, a IA e o "Remover etapa" mudavam a
       quantidade ou apagavam o item do órgão por trás da trava. Cada porta com
       o seu texto acabaria com uma delas dizendo outra coisa — e trava sem
       porta escrita empurra a pessoa a refazer a planilha fora do sistema. */
    recadoTrava: function (acao) {
      var o = {
        quantidade: "a quantidade está travada",
        campos: "quantidade, descrição e unidade estão travadas",
        remover: "ele não pode ser removido"
      }[acao] || "quantidade, descrição e unidade estão travadas, e ele não pode ser removido";
      return "Item da planilha do órgão: " + o + " no modo licitação, para a proposta sair igual ao edital. O preço continua editável. " +
        "Se o edital permitir alterar a planilha, use 'Liberar edição' no painel Licitação, no topo do orçamento.";
    },

    /* ------------------------------------------------------------------
     * O PREÇO SIMBÓLICO DO PACOTE
     * Item que a planilha do órgão traz SEM preço vem do CertamePRO com
     * custoUnitario 0,01 e `semPrecoReferencia: true` — só porque o
     * importador recusa preço zero (app/modulos/orcapro.py, PRECO_SIMBOLICO).
     * ⚠ Até 13/10/2026 o OrçaPRO não lia a marca: o item ficava a R$ 0,01 na
     *   planilha, o painel só dizia "sem preço de referência", e o "Devolver
     *   ao CertamePRO" mandava a proposta assim — e lá ele também não é
     *   conferido (não há referência para comparar). Medido na ida e volta
     *   real. Devolve [{ itemId, etapaId, numero }] dos que AINDA estão no
     *   simbólico: o preço digitado tira o item da lista.
     * ------------------------------------------------------------------ */
    PRECO_SIMBOLICO: 0.01,
    itensSimbolicos: function (orc) {
      var self = this, out = [];
      if (!this.ativo(orc)) return out;
      (orc.etapas || []).forEach(function (e) {
        ((e && e.itens) || []).forEach(function (it) {
          if (it && it.semPrecoReferencia === true && num(it.custoUnitario) <= self.PRECO_SIMBOLICO + 1e-9) {
            out.push({ itemId: it.id, etapaId: e.id, numero: s(it.numeroOrigem) || s(it.codigo) || s(it.descricao).slice(0, 40) });
          }
        });
      });
      return out;
    },
    textoSimbolicos: function (lista) {
      var ns = (lista || []).map(function (x) { return x.numero; }), mostra = ns.slice(0, 8);
      return lista.length + " item(ns) do órgão vieram SEM preço na planilha do órgão e estão com o preço simbólico de R$ 0,01, que o CertamePRO põe só para o pacote entrar: " +
        "preencha o preço antes de devolver (itens " + mostra.join(", ") + (ns.length > mostra.length ? " e mais " + (ns.length - mostra.length) : "") + ").";
    },

    /* quantos itens desta lista estão travados AGORA (a etapa inteira, para o
       "Remover etapa" recusar antes de perguntar) */
    contarTravados: function (orc, itens) {
      var self = this, n = 0;
      (itens || []).forEach(function (it) { if (self.itemTravado(orc, it)) n++; });
      return n;
    },

    /* ------------------------------------------------------------------
     * PARÂMETROS DA LICITAÇÃO (⚙ Parâmetros e assistente) — MESCLA.
     * ⚠ O bloco do CertamePRO (valor estimado, mapa de referência, destino
     * da devolução, desconto linear, bases exigidas) mora no MESMO
     * config.licitacao. Trocar o objeto inteiro apagava tudo isso ao salvar
     * Parâmetros, e o modo licitação morria em silêncio.
     * `novo` = { ativo, tipo, abertura, processo, obra }.
     * ⚠ `obraInformada` só vira true quando a pessoa MUDA a marcação: abrir e
     * salvar Parâmetros por outro motivo (o BDI, por exemplo) não pode
     * transformar "o pacote não informou" em "a pessoa decidiu que não é
     * obra" — o aviso passaria de alerta a informação sem ninguém olhar.
     * ------------------------------------------------------------------ */
    mesclarParametros: function (anterior, novo) {
      var ant = (anterior && typeof anterior === "object") ? anterior : {}, out = {}, k;
      for (k in ant) { if (Object.prototype.hasOwnProperty.call(ant, k)) out[k] = ant[k]; }
      novo = novo || {};
      out.ativo = !!novo.ativo;
      out.tipo = novo.ativo ? (novo.tipo || "") : "";
      out.abertura = novo.ativo ? (novo.abertura || "") : "";
      out.processo = novo.ativo ? (novo.processo || "") : "";
      if (novo.obra !== undefined) {
        var obra = novo.obra === true;
        if (obra !== (ant.obra === true)) out.obraInformada = true;
        out.obra = obra;
      }
      return out;
    },

    /* ------------------------------------------------------------------
     * REFERÊNCIA DE UM ITEM
     * { preco, comBdi, bdiAssumido, fonte, doOrgao } — `preco` na base
     * original; `comBdi` é o preço de referência já COM BDI; `doOrgao` diz se
     * ele é o número do órgão (preco_unitario_bdi) ou uma conta nossa.
     *
     * ⚠ O PREÇO COM BDI DO ÓRGÃO VENCE A CONTA (achado na ida e volta REAL
     *   com o CertamePRO, 13/10/2026). O pacote traz `preco_unitario_bdi`, o
     *   número que a planilha do órgão imprime — e é contra ele que o órgão e
     *   o CertamePRO julgam "preço unitário excessivo". O OrçaPRO o ignorava
     *   e refazia sem × BDI truncado: no item de R$ 48,00 sem BDI o órgão
     *   imprime 59,61 e a conta dava 59,60. Quem cotava exatamente no preço
     *   do órgão via "acima do órgão" aqui, o CertamePRO não acusava nada, e
     *   o desconto linear partia de um centavo a menos. Pior no edital de UMA
     *   coluna com BDI: o pacote marca `precos_incluem_bdi` (a planilha inclui)
     *   mas manda em `preco_unitario` o custo SEM BDI (ele tira o BDI antes) —
     *   a conta antiga tomava esse custo como "com BDI" e acusava todos os
     *   itens. A conta sem × BDI fica para o pacote que não traz o número do
     *   órgão (versões antigas, edital sem preço com BDI).
     *   Quando o pacote NÃO sabe o BDI do órgão (bdi_referencia_pct nulo), o
     *   CertamePRO repete em `preco_unitario_bdi` o próprio preço sem BDI —
     *   não é preço com BDI, e a conta pelo BDI do orçamento (com o aviso
     *   "bdiAssumido") continua valendo. Por isso a regra: o número do órgão
     *   vale com o BDI do edital conhecido, ou quando ele é visivelmente maior
     *   que o sem BDI (as duas colunas impressas).
     * ------------------------------------------------------------------ */
    refDoItem: function (orc, it) {
      var c = this.cfg(orc);
      if (!c || !c.refs || !it) return null;
      var reg = null;
      var n = s(it.numeroOrigem);
      if (n && c.refs.n && c.refs.n[n]) reg = c.refs.n[n];
      else if (!n && it.codigo && c.refs.c && c.refs.c[s(it.codigo)]) reg = c.refs.c[s(it.codigo)];
      if (!reg) return null;
      var base = { preco: reg.preco, fonte: reg.fonte, numero: reg.numero, codigo: reg.codigo };
      var pb = num(reg.precoBdi);
      if (pb > 0 && (c.bdiRef != null || pb > num(reg.preco) + 0.005)) {
        base.comBdi = tr2(pb); base.bdiAssumido = false; base.doOrgao = true;
        return base;
      }
      var pct, assumido = false;
      if (c.precosIncluemBdi) pct = 0;
      else if (c.bdiRef != null) pct = num(c.bdiRef);
      else { pct = (orc.bdi ? num(orc.bdi.percentual) : 0); assumido = true; }
      base.comBdi = c.precosIncluemBdi ? tr2(reg.preco) : tr2(reg.preco * (1 + pct / 100));
      base.bdiAssumido = assumido; base.doOrgao = false;
      return base;
    },

    /* preço unitário COM BDI que a proposta pratica para a linha calculada */
    _puComBdi: function (orc, linha) {
      var cfg = O().garantirConfig(orc);
      if (cfg.bdiIncidencia !== "final") return num(linha.precoUnit);
      var pct = (orc.bdi ? num(orc.bdi.percentual) : 0);
      var a = A();
      return a && a.unitario ? a.unitario(num(linha.custoUnitario) * (1 + pct / 100), cfg.arredondamento) : tr2(num(linha.custoUnitario) * (1 + pct / 100));
    },

    /* o valor da proposta: o mesmo que o Fechar valor e a proposta imprimem */
    totalProposta: function (orc) {
      var t = O().totais(orc);
      var temOpc = (orc.etapas || []).some(function (e) { return e && e.opcional; });
      return temOpc ? num(t.precoObrigatorio) : num(t.precoVenda);
    },

    /* ------------------------------------------------------------------
     * 3) AVISOS
     * Devolve { ativo, itens:[...], total, faixa, resumo:[...] }.
     * `itens` só lista quem passou da referência; `porItem[itemId]` dá o
     * acesso rápido que a planilha usa para marcar a linha.
     * ------------------------------------------------------------------ */
    avisos: function (orc) {
      var out = { ativo: false, itens: [], porItem: {}, semReferencia: 0, comReferencia: 0, bdiAssumido: false,
        total: null, estimado: 0, razao: null, faixa: "", resumo: [], simbolicos: [] };
      var c = this.cfg(orc);
      if (!c || !c.ativo) return out;
      out.ativo = true;
      var self = this, calc = O().calcular(orc);
      (calc.linhas || []).forEach(function (L) {
        var ref = self.refDoItem(orc, L.item);
        if (!ref) { if (L.item && L.item.travadoOrgao) out.semReferencia++; return; }
        out.comReferencia++;
        if (ref.bdiAssumido) out.bdiAssumido = true;
        var pu = self._puComBdi(orc, L);
        if (pu > ref.comBdi + 0.005) {
          var a = { itemId: L.itemId, numero: L.numero, codigo: L.codigo, descricao: L.descricao,
            precoUnit: pu, refComBdi: ref.comBdi, excesso: tr2(pu - ref.comBdi),
            excessoPct: ref.comBdi > 0 ? (pu / ref.comBdi - 1) * 100 : 0,
            qtd: L.quantidade, impacto: tr2((pu - ref.comBdi) * L.quantidade) };
          out.itens.push(a); out.porItem[L.itemId] = a;
        }
      });

      var est = num(c.valorEstimado);
      out.estimado = est;
      /* só `obra === true` liga os limites — ver aplicarPacote */
      out.obra = c.obra === true;
      if (est > 0) {
        var tot = this.totalProposta(orc);
        out.total = tot; out.razao = tot / est;
        /* ⚠ A REDAÇÃO SEGUE O TEXTO LITERAL DA LEI (conferido em 13/10/2026
           contra docs/base-legal.md do projeto Licitacoes, item 1.3):
             § 4º "No caso de obras e serviços de engenharia, serão
                  consideradas inexequíveis as propostas cujos valores forem
                  inferiores a 75% (setenta e cinco por cento) do valor orçado
                  pela Administração."
             § 5º "Nas contratações de obras e serviços de engenharia, será
                  exigida garantia adicional do licitante vencedor cuja
                  proposta for inferior a 85% (oitenta e cinco por cento) do
                  valor orçado pela Administração, equivalente à diferença
                  entre este último e o valor da proposta, sem prejuízo das
                  demais garantias exigíveis de acordo com esta Lei."
           A versão anterior dizia "presumivelmente inexequível em obra" — o
           "presumivelmente" não está na lei (é leitura de jurisprudência, que
           a base legal do projeto não traz), e "obra" deixava de fora o
           serviço de engenharia. "Inferior a" é estrito: 75,00% exatos não
           cai no § 4º (as fronteiras são testadas). */
        var pctTxt = fmtPct(out.razao * 100), dif = fmt(tr2(est - tot));
        var base = "O total (" + fmt(tot) + ") é " + pctTxt + " do valor orçado pela Administração (" + fmt(est) + ", o valor estimado do edital). ";
        if (tot > est + 0.005) {
          out.faixa = "acima";
          out.resumo.push({ tom: "erro", chave: "teto", texto: "O total da proposta (" + fmt(tot) + ") está ACIMA do valor estimado do edital (" + fmt(est) + ") em " + fmt(tr2(tot - est)) +
            ". Preço acima do orçado pela Administração costuma desclassificar." });
        } else if (!out.obra) {
          /* sem os limites: a faixa não é "ok" — "ok" afirmaria uma conferência
             que não foi feita (o aviso "obra" abaixo diz por quê) */
          out.faixa = "sem-limites";
        } else if (out.razao < LIM_INEXEQUIVEL) {
          out.faixa = "inexequivel";
          out.resumo.push({ tom: "erro", chave: "exeq", texto: base +
            "Lei 14.133/2021, art. 59, § 4º: no caso de obras e serviços de engenharia, são consideradas inexequíveis as propostas inferiores a 75% do valor orçado pela Administração. " +
            "O § 2º permite à Administração exigir que a exequibilidade seja demonstrada — confira no edital como ela é aferida. " +
            "Se a proposta for aceita, vale também o § 5º: garantia adicional equivalente à diferença entre o valor orçado e a proposta (" + dif + "), sem prejuízo das demais garantias." });
        } else if (out.razao < LIM_GARANTIA) {
          out.faixa = "garantia";
          out.resumo.push({ tom: "alerta", chave: "exeq", texto: base +
            "Lei 14.133/2021, art. 59, § 5º: nas contratações de obras e serviços de engenharia, será exigida do licitante vencedor cuja proposta for inferior a 85% do valor orçado pela Administração " +
            "garantia adicional equivalente à diferença entre esse valor e o da proposta (" + dif + "), sem prejuízo das demais garantias exigíveis." });
        } else {
          out.faixa = "ok";
        }
        if (!out.obra) {
          /* ⚠ o aviso dos limites DESLIGADOS. Alerta quando ninguém informou
             (o pacote não trouxe e a pessoa não marcou); informação quando foi
             dito que não é obra nem serviço de engenharia. */
          out.resumo.push(c.obraInformada
            ? { tom: "info", chave: "obra", texto: "Objeto marcado como NÃO sendo obra nem serviço de engenharia: os limites de 75% e 85% do valor orçado (Lei 14.133/2021, art. 59, §§ 4º e 5º) não se aplicam e não são calculados aqui." }
            : { tom: "alerta", chave: "obra", texto: (c.certamepro ? "O pacote do certame não informou se o objeto é obra ou serviço de engenharia. " : "O orçamento não está marcado como obra ou serviço de engenharia. ") +
                "Os limites de 75% e 85% do valor orçado pela Administração (Lei 14.133/2021, art. 59, §§ 4º e 5º) NÃO estão sendo aplicados. " +
                "Se for obra ou serviço de engenharia, marque \"Obra ou serviço de engenharia (limites de 75%/85%)\" em ⚙ Parâmetros, no bloco da licitação." });
        }
      }
      if (out.itens.length) {
        var imp = 0; out.itens.forEach(function (a) { imp += a.impacto; });
        out.resumo.push({ tom: "alerta", chave: "itens", texto: out.itens.length + " item(ns) com preço unitário COM BDI acima da referência do órgão (excesso somado de " + fmt(tr2(imp)) + " nas quantidades do edital). Marcados na planilha." });
      }
      if (out.bdiAssumido) {
        out.resumo.push({ tom: "info", chave: "bdi", texto: "O pacote não trouxe o BDI de referência do órgão; a referência sem BDI foi levada a COM BDI pelo BDI deste orçamento (" + fmtPct(orc.bdi ? num(orc.bdi.percentual) : 0) + "). Informe o BDI do edital para uma comparação fiel." });
      }
      if (out.semReferencia) {
        out.resumo.push({ tom: "info", chave: "semref", texto: out.semReferencia + " item(ns) do órgão sem preço de referência no pacote — não há como compará-los." });
      }
      /* o preço simbólico vai na FRENTE: é o único que manda um preço que
         ninguém escolheu para a carta (ver itensSimbolicos) */
      var simb = this.itensSimbolicos(orc);
      out.simbolicos = simb;
      if (simb.length) out.resumo.unshift({ tom: "erro", chave: "simbolico", texto: this.textoSimbolicos(simb) });
      /* os avisos do próprio pacote, menos o do R$ 0,01: o de cima diz o mesmo
         e SOME quando o preço entra — o do pacote ficaria lá para sempre,
         mandando preencher o que já foi preenchido */
      (c.avisosPacote || []).forEach(function (t) {
        if (/R\$\s?0,01/.test(t)) return;
        out.resumo.push({ tom: "info", chave: "pacote", texto: "Ao montar o pacote, o CertamePRO avisou: " + t });
      });
      return out;
    },

    /* ------------------------------------------------------------------
     * 4) DESCONTO LINEAR
     * Um % único sobre o preço de referência COM BDI do órgão. Para cada item
     * com referência, o preço unitário (com BDI) passa a ser ref × (1 − d) e o
     * custo unitário é o MAIOR que, com o BDI do orçamento, não passa disso
     * (o motor trunca em 2 casas; ver js/fechamento.js sobre o porquê).
     * Item sem referência fica como está. Guarda o retrato de antes e dá para
     * desfazer. Não convive com o "Fechar valor" ativo: os dois escrevem o
     * mesmo custo e o desfazer de um restauraria o preço errado do outro.
     * ------------------------------------------------------------------ */
    _custoParaPU: function (orc, alvoPU) {
      var cfg = O().garantirConfig(orc), a = A(), modo = cfg.arredondamento;
      var pct = (orc.bdi ? num(orc.bdi.percentual) : 0), f = 1 + pct / 100;
      function pu(cu) { return a && a.unitario ? a.unitario(cu * f, modo) : tr2(cu * f); }
      var cu = tr2(alvoPU / f);
      if (!(cu > 0)) cu = 0.01;
      for (var i = 0; i < 5; i++) {
        var prox = Math.round((cu + 0.01) * 100) / 100;
        if (pu(prox) <= alvoPU + 0.0049) cu = prox; else break;
      }
      while (cu > 0.01 && pu(cu) > alvoPU + 0.0049) cu = Math.round((cu - 0.01) * 100) / 100;
      return cu;
    },

    descontoPlano: function (orc, pct) {
      var self = this, plano = [], d = num(pct);
      if (!(d > 0 && d < 100)) return { ok: false, erro: "Informe um desconto entre 0 e 100%." };
      if (!this.ativo(orc)) return { ok: false, erro: "Este orçamento não está em modo licitação." };
      var calc = O().calcular(orc), semRef = 0;
      (calc.linhas || []).forEach(function (L) {
        var it = L.item;
        if (L.opcional) return;
        var ref = self.refDoItem(orc, it);
        if (!ref) { semRef++; return; }
        if (it.qtdPendente || !(num(it.quantidade) > 0)) return;
        var alvo = tr2(ref.comBdi * (1 - d / 100));
        plano.push({ etapaId: L.etapaId, itemId: L.itemId, numero: L.numero, alvoPU: alvo, custo: self._custoParaPU(orc, alvo), item: it });
      });
      if (!plano.length) return { ok: false, erro: "Nenhum item tem preço de referência do órgão para aplicar o desconto." };
      return { ok: true, pct: d, plano: plano, semReferencia: semRef };
    },

    /* simula numa CÓPIA: devolve o total que ficaria e a faixa de exequibilidade */
    simularDesconto: function (orc, pct, opts) {
      opts = opts || {};
      if (opts.incidencia && opts.incidencia !== "todos") {
        var cpI = JSON.parse(JSON.stringify(orc));
        var rI = this.aplicarDescontoIncidencia(cpI, pct, opts.incidencia, opts);
        if (!rI.ok) return rI;
        return { ok: true, pct: rI.pct, itens: rI.itens, semReferencia: rI.semReferencia, semComposicao: rI.semComposicao, fator: rI.fator, efetivo: rI.efetivo,
          auxDescontadas: rI.auxDescontadas, auxSemComposicao: rI.auxSemComposicao, auxDivergentes: rI.auxDivergentes, auxCiclo: rI.auxCiclo, baseRecusada: rI.baseRecusada,
          totalAntes: rI.totalAntes, totalDepois: rI.totalDepois, avisos: this.avisos(cpI) };
      }
      var p = this.descontoPlano(orc, pct);
      if (!p.ok) return p;
      var cp = JSON.parse(JSON.stringify(orc));
      var r = this.aplicarDesconto(cp, pct, { semRegistro: true });
      if (!r.ok) return r;
      var av = this.avisos(cp);
      return { ok: true, pct: p.pct, itens: p.plano.length, semReferencia: p.semReferencia,
        totalAntes: this.totalProposta(orc), totalDepois: this.totalProposta(cp), avisos: av };
    },

    aplicarDesconto: function (orc, pct, opts) {
      opts = opts || {};
      var Orc = O();
      if (orc.fechamento) return { ok: false, erro: "Este orçamento tem um \"Fechar valor\" ativo. Desfaça o fechamento antes de aplicar o desconto linear." };
      var lic = this.cfg(orc);
      if (opts.incidencia && opts.incidencia !== "todos") return this.aplicarDescontoIncidencia(orc, pct, opts.incidencia, opts);
      if (lic && lic.descontoLinear) return { ok: false, erro: "Já existe um desconto linear aplicado (" + fmtPct(lic.descontoLinear.pct) + "). Desfaça-o antes de aplicar outro." };
      if (lic && lic.descontoItens) return { ok: false, erro: "Já existe um desconto por item aplicado. Desfaça-o antes de aplicar o desconto linear." };
      var p = this.descontoPlano(orc, pct);
      if (!p.ok) return p;
      var antes = [];
      p.plano.forEach(function (x) {
        var it = x.item;
        antes.push({ etapaId: x.etapaId, itemId: x.itemId, custoUnitario: num(it.custoUnitario), custoMO: it.custoMO, custoMAT: it.custoMAT, custoEQ: it.custoEQ,
          custoBase: it.custoBase != null ? num(it.custoBase) : null, insumos: _copiaInsumos(it) });
      });
      var antesTotal = this.totalProposta(orc);
      p.plano.forEach(function (x) {
        var k = num(x.item.custoUnitario) > 0 ? x.custo / num(x.item.custoUnitario) : 1;
        Orc.atualizarItem(orc, x.etapaId, x.itemId, { custoUnitario: x.custo });
        _escalarInsumos(x.item, k);
      });
      lic.descontoLinear = { pct: p.pct, em: (U() && U().agoraISO) ? U().agoraISO() : new Date().toISOString(), antes: antes, totalAntes: antesTotal };
      return { ok: true, pct: p.pct, itens: p.plano.length, semReferencia: p.semReferencia, totalAntes: antesTotal, totalDepois: this.totalProposta(orc) };
    },

    desfazerDesconto: function (orc) {
      var lic = this.cfg(orc);
      if (!lic || !lic.descontoLinear) return { ok: false, erro: "Não há desconto linear para desfazer." };
      var d = lic.descontoLinear, n = 0;
      d.antes.forEach(function (a) {
        var e = (orc.etapas || []).filter(function (x) { return x.id === a.etapaId; })[0];
        var it = e && (e.itens || []).filter(function (x) { return x.id === a.itemId; })[0];
        if (!it) return;
        it.custoUnitario = a.custoUnitario;
        if (a.custoMO !== undefined) it.custoMO = a.custoMO;
        if (a.custoMAT !== undefined) it.custoMAT = a.custoMAT;
        if (a.custoEQ !== undefined) it.custoEQ = a.custoEQ;
        if (a.custoBase != null) it.custoBase = a.custoBase;
        if (a.insumos) it.insumos = a.insumos; else if (a.insumos === null) delete it.insumos;
        /* as auxiliares descontadas nascem com o desconto concentrado; registro de antes dele não tem o campo */
        if (a.auxiliaresDesconto) it.auxiliaresDesconto = a.auxiliaresDesconto; else delete it.auxiliaresDesconto;
        n++;
      });
      delete lic.descontoLinear;
      return { ok: true, itens: n };
    },

    /* ------------------------------------------------------------------
     * 4a) DESCONTO CONCENTRADO: só no material, só na mão de obra ou só no
     * equipamento (pedido de cliente, 29/10/2026; é assim que o modelo de 49 p.
     * da CE 021-2026 foi feito: MO intacta, material com um fator único).
     * O percentual é sobre o TOTAL da proposta; o fator φ da parcela sai da
     * conta. φ é um só para a obra inteira: todo insumo da categoria recebe o
     * mesmo fator, e o custo do item passa a ser a soma do analítico, de forma
     * que o relatório analítico e a planilha fecham pelo mesmo número.
     * Item sem composição conhecida não recebe e vem contado em `semComposicao`:
     * nunca se inventa parcela. Quem pede o desconto vê o efetivo: o preço anda em
     * centavos, então o total fica no primeiro valor que não passa do alvo.
     * ------------------------------------------------------------------ */
    INCIDENCIAS: { MAT: "no material", MO: "na mão de obra", EQ: "no equipamento" },

    /* Composição do item: a que veio do órgão no pacote, ou a da base só quando ela
       dá o mesmo custo (até 1%). Tabela de outra competência daria parcela errada. */
    _insumosDoItem: function (it) {
      /* Composição que não dá o custo do item (preço cotado à mão, leitura incompleta) não recebe fator:
         com R$ 100 cotados numa composição de R$ 502,89, 20% no material dava custo negativo. */
      var conf = function (lista) {
        var cu0 = num(it.custoUnitario), so = _somaInsumos(lista, 1, "");
        return cu0 > 0 && Math.abs(so - cu0) <= Math.max(0.02, cu0 * 0.01);
      };
      if (Array.isArray(it.insumos) && it.insumos.length) return conf(it.insumos) ? it.insumos : null;
      var comp = null;
      try {
        if (it.origem === "PROPRIA" && typeof Bases !== "undefined" && Bases.obter) comp = Bases.obter("PROPRIA", String(it.codigo));
        else if (typeof Analitico !== "undefined" && Analitico.obter) comp = Analitico.obter(it.codigo);
      } catch (e) { comp = null; }
      var lista = comp && Array.isArray(comp.insumos) ? comp.insumos : null;
      if (!lista || !lista.length) return null;
      if (!conf(lista)) return null;
      return JSON.parse(JSON.stringify(lista));
    },

    /* Onde abrir a composição de uma auxiliar: a base passada em `opts.base` (o mesmo
       objeto de LicitacaoDocs.baseDe que o documento usa) ou a SEINFRA já carregada pelo
       AnaliticoBases; o Analitico (SINAPI) só para código que a base não tem. Base de outra
       versão da tabela do projeto não vale (mesma regra do documento): preço de outra
       competência dava parcela errada. */
    _ctxAux: function (orc, opts) {
      var lic = this.cfg(orc) || {}, tab = (lic.leitura && lic.leitura.tabelas) || {}, base = null, recusada = "";
      if (opts && opts.base && typeof opts.base.obter === "function") base = opts.base;
      else {
        try {
          if (typeof AnaliticoBases !== "undefined" && AnaliticoBases.urlsDe && AnaliticoBases._cache) {
            var u = AnaliticoBases.urlsDe("SEINFRA"), ent = u.nomes.length ? AnaliticoBases._cache[u.nomes[0]] : null;
            if (ent && ent.pacote && ent.porCodigo) base = { mes: s(ent.pacote.mes), obter: function (c) { return ent.porCodigo[String(c)] || null; } };
          }
        } catch (e) { base = null; }
      }
      if (base && s(tab.seinfra) && s(base.mes) && _normTxt(base.mes) !== _normTxt(tab.seinfra)) { recusada = s(base.mes); base = null; }
      var Ar = A(), modo = O().garantirConfig(orc).arredondamento;
      return {
        /* custo da auxiliar recalculada: a regra do modo de arredondamento para auxiliar (Arred.auxiliar:
           truncar2 trunca, arred2aux arredonda, os demais mantêm a precisão) e nunca acima do anterior */
        arrAux: function (v) { return _r4(Ar && Ar.auxiliar ? Ar.auxiliar(v, modo) : v); },
        baseRecusada: recusada, temBase: !!base, memo: {}, memoFator: null, semComp: {}, divergente: {}, ciclo: {},
        obter: function (cod) {
          var c = null;
          try { if (base) c = base.obter(cod); } catch (e) { c = null; }
          if (!c) { try { if (typeof Analitico !== "undefined" && Analitico.obter) c = Analitico.obter(cod); } catch (e2) { c = null; } }
          return c;
        }
      };
    },

    /* Lista do item com o fator (auxiliares abertas pelo `ctx`) e o custo novo do item. */
    _itemComFator: function (orc, it, lista, cat, fator, ctx) {
      var a = A(), modo = O().garantirConfig(orc).arredondamento;
      var uni = function (v) { return a && a.unitario ? a.unitario(v, modo) : tr2(v); };
      var aux = {}, r = _listaComFator(lista, fator, cat, ctx, {}, aux);
      var cu = num(it.custoUnitario), novo;
      /* A soma do analítico é a verdade quando ela já dava o custo impresso. Se não dava
         (órgão arredondou diferente), o custo anda pela diferença e não pula um centavo. */
      if (fator === 1) novo = cu;
      /* Math.min: arredondar nunca pode subir o custo. 48,325 viraria 48,33 e o preço passaria da referência. */
      else if (Math.abs(uni(r.antes) - uni(cu)) < 0.005) novo = Math.min(cu, uni(r.depois));
      else novo = Math.min(cu, uni(cu - (r.antes - r.depois)));
      return { custo: novo, lista: r.lista, aux: aux, queda: r.antes - r.depois };
    },
    _custoComFator: function (orc, it, lista, cat, fator, ctx) {
      return this._itemComFator(orc, it, lista, cat, fator, ctx).custo;
    },

    aplicarDescontoIncidencia: function (orc, pct, cat, opts) {
      var self = this, Orc = O(), d = num(pct);
      if (!this.INCIDENCIAS[cat]) return { ok: false, erro: "Escolha onde o desconto incide." };
      if (!(d > 0 && d < 100)) return { ok: false, erro: "Informe um desconto entre 0 e 100%." };
      if (!this.ativo(orc)) return { ok: false, erro: "Este orçamento não está em modo licitação." };
      if (orc.fechamento) return { ok: false, erro: "Este orçamento tem um \"Fechar valor\" ativo. Desfaça o fechamento antes de aplicar o desconto." };
      var lic = this.cfg(orc);
      if (lic && lic.descontoLinear) return { ok: false, erro: "Já existe um desconto aplicado (" + fmtPct(lic.descontoLinear.pct) + "). Desfaça-o antes de aplicar outro." };
      if (lic && lic.descontoItens) return { ok: false, erro: "Já existe um desconto por item aplicado. Desfaça-o antes de aplicar este." };
      var ctx = this._ctxAux(orc, opts);
      var calc = Orc.calcular(orc), alvos = [], semComp = 0, semRef = 0, base = 0;
      (calc.linhas || []).forEach(function (L) {
        var it = L.item;
        if (L.opcional || !it || it.qtdPendente || !(num(it.quantidade) > 0)) return;
        var ref = self.refDoItem(orc, it);
        if (ref) base += num(it.quantidade) * ref.comBdi;
        else { base += num(it.quantidade) * self._puComBdi(orc, L); semRef++; } /* com BDI: em "BDI sobre o preço final" precoTotal vem sem */
        var lista = self._insumosDoItem(it);
        if (!lista) { semComp++; return; }
        /* item sem a categoria em lugar nenhum, nem dentro das auxiliares */
        if (!(_listaComFator(lista, 0, cat, ctx, {}, {}).depois < _somaInsumos(lista, 1, "") - 1e-9)) return;
        alvos.push({ etapaId: L.etapaId, itemId: L.itemId, item: it, lista: lista });
      });
      if (!alvos.length) return { ok: false, erro: "Nenhum item tem " + (cat === "MAT" ? "material" : cat === "MO" ? "mão de obra" : "equipamento") + " na composição para receber o desconto." };
      var alvo = tr2(base * (1 - d / 100));
      var self2 = this, totalCom = function (fator) {
        var cp = JSON.parse(JSON.stringify(orc));
        var idx = {};
        (cp.etapas || []).forEach(function (e) { (e.itens || []).forEach(function (i) { idx[i.id] = i; }); });
        alvos.forEach(function (a) { idx[a.itemId].custoUnitario = self2._custoComFator(orc, a.item, a.lista, cat, fator, ctx); });
        return self2.totalProposta(cp);
      };
      var teto = totalCom(0);
      if (teto > alvo) {
        var max = base > 0 ? (1 - teto / base) * 100 : 0;
        return { ok: false, erro: "A parcela " + this.INCIDENCIAS[cat].replace(/^n[oa] /, "de ") + " não comporta " + fmtPct(d) + " sobre o total. O máximo possível zerando essa parcela é " + fmtPct(Math.floor(max * 100) / 100) + "." };
      }
      /* Bisseção: o maior fator cujo total não passa do alvo. */
      var lo = 0, hi = 1;
      for (var n = 0; n < 34; n++) {
        var meio = (lo + hi) / 2;
        if (totalCom(meio) <= alvo + 0.0049) lo = meio; else hi = meio;
      }
      var fator = Math.floor(lo * 1e6) / 1e6;
      var finais = alvos.map(function (a) { return self2._itemComFator(orc, a.item, a.lista, cat, fator, ctx); });
      var negativo = null;
      alvos.forEach(function (a, k) { if (!negativo && !(finais[k].custo > 0)) negativo = a; });
      if (negativo) return { ok: false, erro: "O desconto zeraria o custo do item " + (negativo.item.codigo || negativo.itemId) + ". Reduza o percentual ou confira a composição." };
      var antes = [], antesTotal = this.totalProposta(orc), nAux = {};
      alvos.forEach(function (a, k) {
        var it = a.item, f = finais[k];
        antes.push({ etapaId: a.etapaId, itemId: a.itemId, custoUnitario: num(it.custoUnitario), custoMO: it.custoMO, custoMAT: it.custoMAT, custoEQ: it.custoEQ,
          custoBase: it.custoBase != null ? num(it.custoBase) : null, insumos: _copiaInsumos(it),
          auxiliaresDesconto: it.auxiliaresDesconto ? JSON.parse(JSON.stringify(it.auxiliaresDesconto)) : null });
        Orc.atualizarItem(orc, a.etapaId, a.itemId, { custoUnitario: f.custo });
        it.insumos = f.lista;
        /* a versão descontada de cada auxiliar aberta, para o documento imprimir os mesmos números */
        var ks = Object.keys(f.aux);
        if (ks.length) { it.auxiliaresDesconto = f.aux; ks.forEach(function (c) { nAux[c] = 1; }); }
        else delete it.auxiliaresDesconto;
      });
      var depois = this.totalProposta(orc);
      var auxSem = Object.keys(ctx.semComp).sort(), auxDiv = Object.keys(ctx.divergente).sort(), auxCiclo = Object.keys(ctx.ciclo).sort();
      lic.descontoLinear = { pct: d, incidencia: cat, fator: fator, em: (U() && U().agoraISO) ? U().agoraISO() : new Date().toISOString(), antes: antes, totalAntes: antesTotal,
        auxDescontadas: Object.keys(nAux).sort(), auxSemComposicao: auxSem, auxDivergentes: auxDiv, auxCiclo: auxCiclo, baseRecusada: ctx.baseRecusada || "" };
      return { ok: true, pct: d, incidencia: cat, fator: fator, efetivo: base > 0 ? (1 - depois / base) * 100 : 0, itens: alvos.length, semComposicao: semComp, semReferencia: semRef,
        auxDescontadas: Object.keys(nAux).length, auxSemComposicao: auxSem, auxDivergentes: auxDiv, auxCiclo: auxCiclo, baseRecusada: ctx.baseRecusada || "",
        totalAntes: antesTotal, totalDepois: depois };
    },

    /* ------------------------------------------------------------------
     * 4b) DESCONTO POR ITEM + COMPARATIVO DE CENÁRIOS
     * Cada item pode ter o seu %, com um % padrão para quem não está no mapa
     * (0 = sem desconto). A base é a referência do órgão COM BDI; sem
     * referência, o PU atual (com BDI) do próprio orçamento — marcado em
     * `baseOrigem`. Mesma conta de dinheiro do linear (tr2 + _custoParaPU).
     * Não convive com o linear nem com o Fechar valor (escrevem o mesmo custo
     * e o desfazer de um restauraria o preço errado do outro).
     * ------------------------------------------------------------------ */
    descontoItensPlano: function (orc, mapa, pctPadrao, opts) {
      opts = opts || {};
      var self = this, plano = [], semRef = 0, erro = "";
      mapa = (mapa && typeof mapa === "object") ? mapa : {};
      var padrao = (pctPadrao === undefined || pctPadrao === null || pctPadrao === "") ? 0 : num(pctPadrao);
      if (!(padrao >= 0 && padrao < 100)) return { ok: false, erro: "O percentual padrão deve estar entre 0 e 100% (100% não é permitido)." };
      if (!this.ativo(orc)) return { ok: false, erro: "Este orçamento não está em modo licitação." };
      var calc = O().calcular(orc);
      (calc.linhas || []).forEach(function (L) {
        var it = L.item;
        if (erro || L.opcional || !it) return;
        if (it.qtdPendente || !(num(it.quantidade) > 0)) return;
        var tem = Object.prototype.hasOwnProperty.call(mapa, L.itemId) && mapa[L.itemId] !== "" && mapa[L.itemId] !== null && mapa[L.itemId] !== undefined;
        var pct = tem ? num(mapa[L.itemId]) : padrao;
        if (!(pct >= 0 && pct < 100)) { erro = "O desconto do item " + (L.numero || L.itemId) + " deve estar entre 0 e 100% (100% não é permitido)."; return; }
        var ref = self.refDoItem(orc, it), base, origem;
        if (ref) { base = ref.comBdi; origem = "referencia"; }
        else { base = self._puComBdi(orc, L); origem = "propria"; semRef++; }
        /* `incluirZero` (cenários): 0% leva o item com referência ao preço
           do ÓRGÃO; sem ele, 0% = item intocado. Sem isso o cenário 0% ficava
           no preço próprio e o de 5% na referência − 5%: com preço próprio
           abaixo da referência, 5% saía MAIS CARO que 0%. */
        if (!(pct > 0) && !(opts.incluirZero && origem === "referencia")) return;
        var alvo = tr2(base * (1 - pct / 100));
        plano.push({ etapaId: L.etapaId, itemId: L.itemId, numero: L.numero, pct: pct, base: base, baseOrigem: origem,
          alvoPU: alvo, custo: self._custoParaPU(orc, alvo), item: it });
      });
      if (erro) return { ok: false, erro: erro };
      return { ok: true, plano: plano, semReferencia: semRef, padrao: padrao };
    },

    /* simula numa CÓPIA: total que ficaria, avisos de teto / exequibilidade */
    simularDescontoItens: function (orc, mapa, pctPadrao, opts) {
      opts = opts || {};
      var p = this.descontoItensPlano(orc, mapa, pctPadrao, opts);
      if (!p.ok) return p;
      var cp = JSON.parse(JSON.stringify(orc));
      var r = this.aplicarDescontoItens(cp, mapa, pctPadrao, { permitirVazio: true, incluirZero: !!opts.incluirZero });
      if (!r.ok) return r;
      return { ok: true, itens: p.plano.length, semReferencia: p.semReferencia, totalAntes: this.totalProposta(orc),
        totalDepois: this.totalProposta(cp), avisos: this.avisos(cp), plano: p.plano.map(function (x) {
          return { itemId: x.itemId, numero: x.numero, pct: x.pct, base: x.base, baseOrigem: x.baseOrigem, alvoPU: x.alvoPU };
        }) };
    },

    aplicarDescontoItens: function (orc, mapa, pctPadrao, opts) {
      opts = opts || {};
      var Orc = O();
      if (orc.fechamento) return { ok: false, erro: "Este orçamento tem um \"Fechar valor\" ativo. Desfaça o fechamento antes de aplicar o desconto por item." };
      var lic = this.cfg(orc);
      if (lic && lic.descontoLinear) return { ok: false, erro: "Já existe um desconto linear aplicado (" + fmtPct(lic.descontoLinear.pct) + "). Desfaça-o antes de aplicar o desconto por item." };
      if (lic && lic.descontoItens) return { ok: false, erro: "Já existe um desconto por item aplicado. Desfaça-o antes de aplicar outro." };
      var p = this.descontoItensPlano(orc, mapa, pctPadrao, { incluirZero: !!opts.incluirZero });
      if (!p.ok) return p;
      if (!p.plano.length && !opts.permitirVazio) return { ok: false, erro: "Nenhum item recebeu desconto: informe um percentual padrão ou o percentual de algum item." };
      var antes = [];
      p.plano.forEach(function (x) {
        var it = x.item;
        antes.push({ etapaId: x.etapaId, itemId: x.itemId, custoUnitario: num(it.custoUnitario), custoMO: it.custoMO, custoMAT: it.custoMAT, custoEQ: it.custoEQ,
          custoBase: it.custoBase != null ? num(it.custoBase) : null, insumos: _copiaInsumos(it) });
      });
      var antesTotal = this.totalProposta(orc);
      p.plano.forEach(function (x) {
        var k = num(x.item.custoUnitario) > 0 ? x.custo / num(x.item.custoUnitario) : 1;
        Orc.atualizarItem(orc, x.etapaId, x.itemId, { custoUnitario: x.custo });
        _escalarInsumos(x.item, k);
      });
      lic.descontoItens = { em: (U() && U().agoraISO) ? U().agoraISO() : new Date().toISOString(), padrao: p.padrao,
        mapa: JSON.parse(JSON.stringify(mapa || {})), antes: antes, totalAntes: antesTotal };
      return { ok: true, itens: p.plano.length, semReferencia: p.semReferencia, totalAntes: antesTotal, totalDepois: this.totalProposta(orc) };
    },

    desfazerDescontoItens: function (orc) {
      var lic = this.cfg(orc);
      if (!lic || !lic.descontoItens) return { ok: false, erro: "Não há desconto por item para desfazer." };
      var d = lic.descontoItens, n = 0;
      d.antes.forEach(function (a) {
        var e = (orc.etapas || []).filter(function (x) { return x.id === a.etapaId; })[0];
        var it = e && (e.itens || []).filter(function (x) { return x.id === a.itemId; })[0];
        if (!it) return;
        it.custoUnitario = a.custoUnitario;
        if (a.custoMO !== undefined) it.custoMO = a.custoMO;
        if (a.custoMAT !== undefined) it.custoMAT = a.custoMAT;
        if (a.custoEQ !== undefined) it.custoEQ = a.custoEQ;
        if (a.custoBase != null) it.custoBase = a.custoBase;
        if (a.insumos) it.insumos = a.insumos; else if (a.insumos === null) delete it.insumos;
        n++;
      });
      delete lic.descontoItens;
      return { ok: true, itens: n };
    },

    /* comparativo: desconto UNIFORME em todos os itens, um % por linha. Não
       altera o orçamento. O custo direto "original" é o de antes de qualquer
       desconto já aplicado (linear ou por item), medido numa cópia desfeita. */
    cenarios: function (orc, listaPct, opts) {
      var self = this, inc = (opts && opts.incidencia && opts.incidencia !== "todos") ? opts.incidencia : null;
      var lista = (Array.isArray(listaPct) && listaPct.length) ? listaPct : [0, 5, 10, 15, 20, 25];
      if (!this.ativo(orc)) return { ok: false, erro: "Este orçamento não está em modo licitação." };
      var cp0 = JSON.parse(JSON.stringify(orc)), lic0 = this.cfg(cp0);
      if (lic0 && lic0.descontoLinear) this.desfazerDesconto(cp0);
      if (lic0 && lic0.descontoItens) this.desfazerDescontoItens(cp0);
      var custoOrig = num(O().totais(cp0).custoDireto);
      var est = num((this.cfg(orc) || {}).valorEstimado);
      var linhas = [], erro = "";
      /* `atual` = o preço do orçamento hoje, sem desconto; cada linha = % sobre
         a referência do órgão (ou sobre o preço próprio, no item sem ela). */
      var totAtual = this.totalProposta(cp0), avAtual = this.avisos(cp0);
      var atual = { total: totAtual, pctDoEstimado: est > 0 ? (totAtual / est) * 100 : null,
        margemSobreCusto: custoOrig > 0 ? (totAtual / custoOrig - 1) * 100 : null,
        exequivel: !avAtual.resumo.some(function (a) { return a.chave === "exeq" && a.tom === "erro"; }) };
      lista.forEach(function (p) {
        if (erro) return;
        var pct = num(p);
        var s = (inc && pct > 0) ? self.simularDesconto(cp0, pct, { incidencia: inc, base: opts && opts.base }) : self.simularDescontoItens(cp0, {}, pct, { incluirZero: true });
        if (!s.ok) { if (inc) { linhas.push({ pct: pct, erro: s.erro }); return; } erro = s.erro; return; }
        var total = s.totalDepois;
        var inex = s.avisos.resumo.some(function (a) { return a.chave === "exeq" && a.tom === "erro"; });
        linhas.push({ pct: pct, total: total, pctDoEstimado: est > 0 ? (total / est) * 100 : null,
          custoDiretoOriginal: custoOrig, margemSobreCusto: custoOrig > 0 ? (total / custoOrig - 1) * 100 : null,
          exequivel: !inex, avisos: s.avisos.resumo.filter(function (a) { return a.chave === "exeq" || a.chave === "teto"; }) });
      });
      if (erro) return { ok: false, erro: erro };
      return { ok: true, linhas: linhas, atual: atual };
    },

    /* ------------------------------------------------------------------
     * 5) BASES EXIGIDAS PELO EDITAL (certamepro.bases_exigidas)
     *
     * O edital fixa a tabela ("SINAPI-MG 06/2026 desonerado", "SICRO-PA
     * 04/2026"). Usar outra muda o preço e pode desclassificar. A regra:
     *   · cada exigida tem uma SITUAÇÃO conferível: instalada (a que está em
     *     uso É a exigida), disponível (alguma fonte diz ter), indisponível;
     *   · o Orçamentista não roda com exigida pendente (js/orcamentistaui.js);
     *   · usar outra competência é ESCOLHA de quem orça: fica registrada com
     *     data, autor e motivo, e sai no Quadro de Justificativa de Preços
     *     (Excel e impressão). ⚠ Nunca outra tabela em silêncio.
     * Módulo puro: quem chama monta o `ctx` com o que o app sabe (o SINAPI
     * carregado, as bases instaladas, o disco, o servidor e o espelho).
     * ------------------------------------------------------------------ */
    _regime: function (r) {
      var t = s(r).toLowerCase();
      try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
      if (/^(nao|sem)[ -]desoner/.test(t) || /^oner/.test(t)) return "onerado";
      if (/^desoner/.test(t) || /^com[ -]desoner/.test(t)) return "desonerado";
      return "";
    },
    _comp: function (c) {
      var t = s(c), m = /^(\d{4})-(\d{2})$/.exec(t) || null;
      if (m) return t;
      m = /^(\d{2})\/(\d{4})$/.exec(t);
      return m ? (m[2] + "-" + m[1]) : "";
    },
    lerBasesExigidas: function (lista) {
      var self = this, out = [], vistos = {};
      (Array.isArray(lista) ? lista : []).forEach(function (b) {
        if (!b || typeof b !== "object") return;
        var fonte = s(b.fonte).toUpperCase().replace(/[^A-Z0-9_]/g, "");
        var comp = self._comp(b.competencia), reg = self._regime(b.regime), uf = s(b.uf).toUpperCase();
        if (!fonte || !comp || (uf && !/^[A-Z]{2}$/.test(uf))) return;
        if (fonte === "SINAPIDESONERADA" || fonte === "SINAPI_DES") { fonte = "SINAPI"; reg = "desonerado"; }
        var catId = fonte === "SINAPI" ? (reg === "desonerado" ? "SINAPI_DES" : "SINAPI") : fonte;
        if (fonte === "SINAPI" && !reg) reg = "onerado";
        var e = { fonte: fonte, catId: catId, uf: uf, competencia: comp, regime: reg };
        var k = self.chaveBase(e);
        if (vistos[k]) return;
        vistos[k] = 1; out.push(e);
      });
      return out;
    },
    chaveBase: function (e) { return [s(e.catId || e.fonte).toUpperCase(), s(e.uf).toUpperCase(), s(e.competencia), s(e.regime)].join("|"); },
    fmtComp: function (c) { var m = /^(\d{4})-(\d{2})$/.exec(s(c)); return m ? (m[2] + "/" + m[1]) : s(c); },
    /* "SINAPI-MG 06/2026 desonerado" · "SICRO-PA 04/2026" */
    fmtBase: function (e) {
      if (!e) return "";
      return s(e.fonte || e.catId).replace(/_DES$/, "") + (e.uf ? "-" + e.uf : "") + " " + this.fmtComp(e.competencia) + (e.regime ? " " + e.regime : "");
    },
    basesExigidas: function (orc) { var c = this.cfg(orc); return (c && c.ativo && Array.isArray(c.basesExigidas)) ? c.basesExigidas : []; },
    temBasesExigidas: function (orc) { return this.basesExigidas(orc).length > 0; },
    escolhaDe: function (orc, exig) {
      var c = this.cfg(orc), k = this.chaveBase(exig);
      return ((c && c.basesEscolhas) || []).filter(function (x) { return x && x.chave === k; })[0] || null;
    },

    /* A base que ESTÁ EM USO para a família da exigida: o motor SINAPI
       carregado (onerada) ou a base extra instalada com aquela fonte. */
    _emUso: function (exig, ctx) {
      ctx = ctx || {};
      if (exig.catId === "SINAPI") {
        var sn = ctx.sinapi || {};
        return sn.carregado === false || !sn.competencia ? null : { catId: "SINAPI", fonte: "SINAPI", uf: s(sn.uf).toUpperCase(), competencia: this._comp(sn.competencia), regime: "onerado" };
      }
      var inst = (ctx.instaladas || []).filter(function (b) { return b && s(b.fonte).toUpperCase() === exig.catId; })[0];
      if (!inst) return null;
      var reg = inst.desonerado === true ? "desonerado" : (inst.desonerado === false ? "onerado" : (exig.catId === "SINAPI_DES" ? "desonerado" : ""));
      return { catId: exig.catId, fonte: exig.fonte, uf: s(inst.uf).toUpperCase(), competencia: this._comp(inst.competencia), regime: reg, fixada: !!(inst.sel && inst.sel.competencia) };
    },
    _confere: function (exig, uso) {
      if (!uso) return false;
      if (exig.uf && uso.uf !== exig.uf) return false;
      if (uso.competencia !== exig.competencia) return false;
      if (exig.regime && uso.regime && uso.regime !== exig.regime) return false;
      return true;
    },

    /* Situação de cada exigida. ctx = {
         sinapi: {uf, competencia, carregado}   — o motor SINAPI (onerada)
         instaladas: Bases.lista()
         compsOnerada: {UF: [AAAA-MM]}          — App._compsPorUf (disco + espelho, com analítico)
         fatos: {servidor, disco, espelho}      — para BasesCat.competenciasConhecidas
         catalogo: BasesCat (opcional)          }
       estado: "instalada" | "outra" (outra competência em uso, ESCOLHA
       registrada) | "disponivel" | "indisponivel". */
    situacaoBases: function (orc, ctx) {
      var self = this;
      ctx = ctx || {};
      var Cat = ctx.catalogo || global.BasesCat || null;
      var fatos = ctx.fatos || {};
      return this.basesExigidas(orc).map(function (e) {
        var uso = self._emUso(e, ctx), esc = self.escolhaDe(orc, e), r = { exigida: e, emUso: uso, escolha: esc, estado: "", onde: "", texto: "" };
        if (self._confere(e, uso)) { r.estado = "instalada"; r.texto = "em uso"; return r; }
        if (esc && self._confere(esc.usada, uso)) {
          r.estado = "outra";
          r.texto = "em uso " + self.fmtBase(uso) + " — o edital pede " + self.fmtComp(e.competencia) + " (escolha registrada na justificativa de preços)";
          return r;
        }
        var conhecidas = [];
        if (e.catId === "SINAPI") {
          conhecidas = ((ctx.compsOnerada || {})[e.uf] || []).slice();
          var sv = fatos.servidor && fatos.servidor.sinapi;
          if (sv && self._comp(sv.competencia)) conhecidas.push(self._comp(sv.competencia));
        } else if (Cat && Cat.temHistorico && Cat.temHistorico(e.catId)) {
          conhecidas = Cat.competenciasConhecidas(e.catId, e.uf, fatos);
        } else if (Cat && Cat.get && Cat.get(e.catId)) {
          /* sem histórico: só o que vem no pacote ou o atual do servidor */
          var ent = Cat.get(e.catId), sv2 = ent.chaveStatus && fatos.servidor ? fatos.servidor[ent.chaveStatus] : null;
          if (ent.versaoPacote) conhecidas.push(self._comp(ent.versaoPacote));
          if (sv2 && sv2.competencia) conhecidas.push(self._comp(sv2.competencia));
          r.semHistorico = true;
        } else {
          r.semFonte = true;    // base fora do catálogo (importação manual da planilha do órgão)
        }
        if (conhecidas.indexOf(e.competencia) >= 0) { r.estado = "disponivel"; r.texto = "disponível para baixar"; }
        else {
          r.estado = "indisponivel";
          r.texto = r.semFonte ? "não distribuída pelo OrçaPRO — importe a planilha oficial do órgão desta competência em Tabelas"
            : "não encontrada nas fontes conhecidas (disco, servidor da RA, espelho)";
        }
        if (uso) r.texto += " · em uso agora: " + self.fmtBase(uso);
        return r;
      });
    },
    /* o que ainda impede o Orçamentista: nem instalada, nem escolha registrada */
    basesPendentes: function (orc, ctx) {
      return this.situacaoBases(orc, ctx).filter(function (x) { return x.estado !== "instalada" && x.estado !== "outra"; });
    },

    /* A família SINAPI que o edital exige (uma só). O Orçamentista usa SÓ ela
       para item SINAPI: sem isto, o item declarado "SINAPI" era procurado
       também na onerada (o motor sempre acrescenta a base canônica), e o
       desonerado do edital saía com preço onerado. null = sem restrição. */
    familiaSinapiExigida: function (orc) {
      var fams = [];
      this.basesExigidas(orc).forEach(function (e) { if ((e.catId === "SINAPI" || e.catId === "SINAPI_DES") && fams.indexOf(e.catId) < 0) fams.push(e.catId); });
      return fams.length === 1 ? fams[0] : null;
    },

    /* O documento declara a base dos preços que imprime (Orcamento.basesUsadas
       lê orc.competenciaSinapi/uf e config.bases). Ao instalar a exigida ou
       registrar outra, a declaração passa a ser a base EM USO. */
    declararBaseUsada: function (orc, uso) {
      if (!orc || !uso || !uso.catId) return;
      if (uso.catId === "SINAPI") {
        if (uso.uf) orc.uf = uso.uf;
        if (uso.competencia) orc.competenciaSinapi = uso.competencia;
        return;
      }
      orc.config = (orc.config && typeof orc.config === "object") ? orc.config : {};
      var lista = Array.isArray(orc.config.bases) ? orc.config.bases : (orc.config.bases = []);
      var reg = lista.filter(function (b) { return b && s(b.fonte).toUpperCase() === uso.catId; })[0];
      if (!reg) { reg = { fonte: uso.catId }; lista.push(reg); }
      reg.uf = uso.uf || reg.uf || ""; reg.competencia = uso.competencia || reg.competencia || "";
    },

    /* Registra que quem orça vai usar OUTRA base no lugar da exigida.
       Substitui a escolha anterior da mesma exigida (a última decisão vale).
       ⚠ Sem `usada` válida (UF + competência) não registra: escolha sem a
       tabela que vai de fato precificar seria o recado que mente. */
    registrarEscolhaBase: function (orc, exig, usada, extra) {
      var c = this.cfg(orc);
      if (!c || !exig || !usada || !usada.competencia) return null;
      extra = extra || {};
      var k = this.chaveBase(exig);
      var reg = { chave: k, exigida: { fonte: exig.fonte, catId: exig.catId, uf: exig.uf, competencia: exig.competencia, regime: exig.regime },
        usada: { fonte: usada.fonte || exig.fonte, catId: usada.catId || exig.catId, uf: s(usada.uf).toUpperCase(), competencia: this._comp(usada.competencia), regime: usada.regime || exig.regime },
        motivo: s(extra.motivo), por: s(extra.por), em: s(extra.em) || ((U() && U().agoraISO) ? U().agoraISO() : new Date().toISOString()) };
      c.basesEscolhas = (Array.isArray(c.basesEscolhas) ? c.basesEscolhas : []).filter(function (x) { return x && x.chave !== k; });
      c.basesEscolhas.push(reg);
      this.declararBaseUsada(orc, reg.usada);
      return reg;
    },

    /* Linhas para o Quadro de Justificativa de Preços (Excel e impressão). */
    justificativaBases: function (orc) {
      var self = this, c = this.cfg(orc);
      if (!c || !c.ativo) return [];
      var vigentes = {};
      this.basesExigidas(orc).forEach(function (e) { vigentes[self.chaveBase(e)] = 1; });
      return ((c.basesEscolhas) || []).filter(function (x) { return x && vigentes[x.chave]; }).map(function (x) {
        var dt = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(x.em));
        var quando = dt ? (dt[3] + "/" + dt[2] + "/" + dt[1]) : "";
        return { exigida: self.fmtBase(x.exigida), usada: self.fmtBase(x.usada), motivo: x.motivo, por: x.por, em: quando,
          texto: "O edital exige " + self.fmtBase(x.exigida) + "; os preços usam " + self.fmtBase(x.usada) + "." +
            (x.motivo ? " Motivo: " + x.motivo + "." : "") + " Escolha registrada" + (x.por ? " por " + x.por : "") + (quando ? " em " + quando : "") + "." };
      });
    },

    /* ------------------------------------------------------------------
     * Devolução ao CertamePRO: só aceita DESTINO LOCAL sem perguntar.
     * ⚠ O `devolver_para` vem de um arquivo de fora. Um pacote malicioso com
     *   `devolver_para: "https://alheio/…"` faria o botão enviar o orçamento
     *   inteiro (preços, custos, BDI) a um terceiro. O CertamePRO desta etapa
     *   roda na própria máquina; destino que não seja local exige confirmação
     *   com o endereço na cara (feita em js/app.js).
     * ------------------------------------------------------------------ */
    destino: function (url) {
      var u = s(url);
      var m = u.match(/^(https?):\/\/([^\/:?#]+)(?::(\d+))?(\/[^?#]*)?/i);
      if (!m) return { ok: false, erro: "O endereço de devolução do certame é inválido." };
      var host = m[2].toLowerCase();
      var local = (host === "127.0.0.1" || host === "localhost" || host === "[::1]");
      return { ok: true, url: u, host: host + (m[3] ? ":" + m[3] : ""), local: local };
    },

    /* ------------------------------------------------------------------
     * A RESPOSTA DA DEVOLUÇÃO (POST <devolver_para>)
     * O CertamePRO responde o que gravou no certame (app/modulos/orcapro.py,
     * `receber`): { preenchido: {valor_proposta, custo_estimado,
     * bdi_minimo_pct}, total, custo_direto, bdi_pct, arquivo, carta: {refeita,
     * aviso}, modelo_orgao: {gerado, itens_preenchidos}, alertas: [{tipo,
     * gravidade, mensagem, total_itens}] }.
     * ⚠ Até 13/10/2026 a tela listava as 12 primeiras CHAVES do JSON cru
     *   ("orcamento: {…}", "arredondamento: truncar2", os alertas como JSON
     *   numa linha só), e a carta e o arquivo ficavam fora do corte — medido na
     *   ida e volta real. Resposta sem esse formato devolve null e a tela cai
     *   no genérico (outro destino, versão antiga).
     * `totalLocal` é o que ESTE orçamento soma: o CertamePRO refaz a conta pelo
     *   _meta, e se os dois não baterem a tela diz — nunca silêncio sobre o
     *   valor que vai para a carta.
     * ------------------------------------------------------------------ */
    lerDevolucao: function (j, totalLocal) {
      if (!j || typeof j !== "object" || !Array.isArray(j.alertas)) return null;
      var pre = (j.preenchido && typeof j.preenchido === "object") ? j.preenchido : {};
      var temV = function (v) { return v != null && v !== "" && isFinite(Number(v)); };
      var valor = temV(pre.valor_proposta) ? num(pre.valor_proposta) : (temV(j.total) ? num(j.total) : null);
      if (valor == null) return null;
      var out = {
        valor: valor,
        custo: temV(pre.custo_estimado) ? num(pre.custo_estimado) : (temV(j.custo_direto) ? num(j.custo_direto) : null),
        bdi: temV(pre.bdi_minimo_pct) ? num(pre.bdi_minimo_pct) : (temV(j.bdi_pct) ? num(j.bdi_pct) : null),
        arquivo: s(j.arquivo),
        carta: (j.carta && typeof j.carta === "object") ? { refeita: j.carta.refeita === true, aviso: s(j.carta.aviso) } : null,
        modelo: (j.modelo_orgao && typeof j.modelo_orgao === "object") ? { gerado: j.modelo_orgao.gerado === true, itens: num(j.modelo_orgao.itens_preenchidos) } : null,
        alertas: [], divergencia: null
      };
      var peso = { critica: 0, alta: 1, media: 2, baixa: 3, info: 4 };
      j.alertas.forEach(function (a) {
        if (!a || typeof a !== "object") return;
        var g = s(a.gravidade).toLowerCase(), texto = s(a.mensagem) || s(a.tipo);
        /* o recado do CertamePRO diz "1 item(ns) …" — QUAIS vem na lista */
        var ns = Array.isArray(a.itens) ? a.itens.map(function (x) { return x && typeof x === "object" ? (s(x.numero) || s(x.descricao)) : ""; }).filter(function (x) { return !!x; }) : [];
        if (ns.length) {
          var tot = Math.max(num(a.total_itens), ns.length), mostra = ns.slice(0, 8);
          texto += " Itens: " + mostra.join(", ") + (tot > mostra.length ? " e mais " + (tot - mostra.length) : "") + ".";
        }
        out.alertas.push({ tipo: s(a.tipo), gravidade: g, tom: (g === "critica" || g === "alta") ? "erro" : (g === "info" ? "info" : "alerta"),
          texto: texto, peso: peso[g] != null ? peso[g] : 2 });
      });
      out.alertas.sort(function (a, b) { return a.peso - b.peso; });
      if (totalLocal != null && isFinite(Number(totalLocal)) && Math.abs(num(totalLocal) - valor) > 0.005) out.divergencia = { certame: valor, local: num(totalLocal) };
      return out;
    },

    /* texto de "Licitação" para cabeçalhos (Excel, relatórios) */
    identificacao: function (orc) {
      var c = this.cfg(orc);
      if (!c || !c.ativo) return null;
      function dt(x) {
        var m = String(x || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
        return m ? (m[3] + "/" + m[2] + "/" + m[1] + (m[4] ? " " + m[4] + ":" + m[5] : "")) : "";
      }
      var orgao = (c.orgao && c.orgao.nome) || (orc.cliente && orc.cliente.nome) || "";
      return {
        orgao: orgao,
        cnpj: (c.orgao && c.orgao.cnpj) || (orc.cliente && orc.cliente.doc) || "",
        processo: s(c.processo),
        edital: s(c.pncp) || s(c.certame),
        sessao: dt(c.abertura),
        modalidade: s(c.tipo),
        criterio: s(c.criterio),
        valorEstimado: num(c.valorEstimado),
        dataBase: s(c.dataBase)
      };
    }
  };

  global.Licitacao = Licitacao;
  if (typeof module !== "undefined" && module.exports) module.exports = Licitacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
