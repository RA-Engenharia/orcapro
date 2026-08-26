/* =====================================================================
 * parceiro.js — PORTAL DO PARCEIRO: a tabela que o revendedor vê
 *
 * O parceiro é um revendedor da carpintaria. Ele consulta preço para montar
 * proposta para os clientes DELE — e mantém um catálogo próprio de material,
 * que só ele edita. Ele NÃO orça dentro do sistema.
 *
 * ---------------------------------------------------------------------
 * A REGRA QUE VALE MAIS QUE TODAS AS OUTRAS JUNTAS
 * ---------------------------------------------------------------------
 *
 * ⚠ O PARCEIRO NUNCA PODE VER O CUSTO DA CARPINTARIA.
 *
 *   Foi o ponto mais sensível do escopo, e o cliente foi avisado disso por
 *   escrito antes de responder: *"se o portal mostrar o custo, o parceiro
 *   enxerga a margem de vocês"*. A resposta (E1) foi que **a New Form define
 *   o preço do parceiro** — logo o que viaja é PREÇO FINAL, e só ele.
 *
 *   Custo vazado não dá erro, não aparece na tela e não volta atrás: o
 *   parceiro salva o JSON, descobre a margem e usa isso na próxima
 *   negociação. Por isso `paraPortal` monta o pacote campo a campo
 *   (allowlist) e `auditar` varre o resultado atrás de qualquer campo que
 *   cheire a custo — inclusive campo NOVO que alguém acrescente amanhã.
 *
 *   ⚠ Nunca troque o `map` campo a campo por um spread "para não esquecer
 *     nada". É exatamente assim que o custo passa a viajar.
 *
 * ---------------------------------------------------------------------
 * COMO O PREÇO DO PARCEIRO É FORMADO
 * ---------------------------------------------------------------------
 *
 *   madeira:      menor custo vigente × (1 + margem daquele parceiro)
 *   mão de obra:  valor de tabela     × (1 + ajuste daquele parceiro)
 *
 * Os dois percentuais são POR PARCEIRO e definidos pela carpintaria (E1).
 * Margem em branco não vira 0%: viraria repassar o custo, que é o defeito
 * que este arquivo existe para impedir — vira pendência e o parceiro não
 * é publicado.
 *
 * ⚠ MENOR CUSTO VIGENTE, e isso é escolha declarada. A proposta escolhe o
 *   fornecedor caso a caso (resposta A2), mas uma LISTA DE REFERÊNCIA não
 *   tem proposta onde escolher. O menor é o que a carpintaria consegue
 *   comprar hoje, e é a base mais defensável para uma tabela. Trocar por
 *   "o mais recente" é uma linha — em `Carpintaria.menorCusto`.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Parceiro = {};

  function txt(x) { return String(x == null ? "" : x).trim(); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    if (global.Util && global.Util.parseNum) { var v = global.Util.parseNum(x); return isFinite(v) ? v : 0; }
    var s = String(x == null ? "" : x).replace(/[^0-9,.\-]/g, "");
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function money(v) {
    if (global.Arred && global.Arred.valor) return global.Arred.valor(num(v), "arred2");
    return Math.round(num(v) * 100) / 100;
  }
  Parceiro.num = num;

  /* ===================================================================
   * O CADASTRO
   * =================================================================== */

  /* ⚠ Piso da margem, e ele é do CADEADO, não do negócio: existe para impedir
     que o custo de compra vire "preço" por erro de digitação (0,35 no lugar de
     35). Quem quiser margem baixa de verdade escreve 1 ou mais. */
  Parceiro.MARGEM_MINIMA_PCT = 1;

  Parceiro.PADRAO = {
    nome: "",
    login: "",
    ativo: true,
    /* ⚠ nulo, não zero — ver a regra do cabeçalho */
    margemMadeiraPct: null,
    ajusteMOPct: 0,
    fornecedorId: ""          // vínculo com o cadastro de fornecedores, se houver
  };

  Parceiro.normalizar = function (bruto) {
    var b = bruto && typeof bruto === "object" ? bruto : {};
    return {
      id: txt(b.id),
      nome: txt(b.nome),
      login: txt(b.login).toLowerCase(),
      ativo: b.ativo !== false,
      margemMadeiraPct: b.margemMadeiraPct == null || txt(b.margemMadeiraPct) === "" ? null : num(b.margemMadeiraPct),
      ajusteMOPct: b.ajusteMOPct == null || txt(b.ajusteMOPct) === "" ? 0 : num(b.ajusteMOPct),
      fornecedorId: txt(b.fornecedorId),
      publicadoEm: txt(b.publicadoEm)
    };
  };

  Parceiro.validar = function (bruto) {
    var p = Parceiro.normalizar(bruto);
    var f = [];
    if (!p.nome) f.push("Falta o nome do parceiro.");
    if (!p.login) f.push("Falta o login — é por ele que o parceiro entra no portal.");
    else if (!/^[a-z0-9._-]{3,}$/.test(p.login)) f.push("O login só aceita letras, números, ponto, hífen e sublinhado (mínimo 3).");
    if (p.margemMadeiraPct == null) {
      f.push("Falta a margem da madeira para este parceiro — sem ela o portal mostraria o SEU custo de compra.");
    } else if (p.margemMadeiraPct < 0) {
      f.push("A margem da madeira não pode ser negativa: venderia abaixo do custo.");
    } else if (p.margemMadeiraPct < Parceiro.MARGEM_MINIMA_PCT) {
      /* ⚠ O CADEADO SÓ PEGAVA MARGEM EXATAMENTE ZERO. Quem digita 0,35
         pensando em "35%" publica 240,84 sobre um custo de 240,00 — e a
         auditoria por igualdade exata não via nada. Preço a menos de 1% acima
         do custo É o custo, para qualquer efeito prático de negociação. */
      f.push("Margem de " + p.margemMadeiraPct + "% é praticamente o seu custo de compra ("
        + Parceiro.MARGEM_MINIMA_PCT + "% é o mínimo). Se quis dizer "
        + (p.margemMadeiraPct * 100) + "%, escreva o número inteiro.");
    }
    /* ⚠ −100% ou menos zera (ou inverte) o preço da mão de obra, e o servidor
       grava R$ 0,00 sem reclamar: o parceiro receberia uma tabela dizendo que
       a mão de obra é de graça. */
    if (p.ajusteMOPct <= -100) {
      f.push("O ajuste da mão de obra não pode chegar a −100%: o preço iria a zero ou ficaria negativo.");
    }
    return f;
  };

  /* logins não podem colidir: dois parceiros com o mesmo login é um vendo o
     portal do outro */
  Parceiro.loginLivre = function (login, id, lista) {
    var alvo = txt(login).toLowerCase();
    if (!alvo) return false;
    return !arr(lista).some(function (p) {
      return p && txt(p.login).toLowerCase() === alvo && txt(p.id) !== txt(id);
    });
  };

  /* ===================================================================
   * A TABELA DELE
   *
   * ctx = { madeiras: [], servicos: [] }  (cadastro da carpintaria)
   * =================================================================== */
  Parceiro.precos = function (bruto, ctx) {
    var p = Parceiro.normalizar(bruto);
    var c = ctx || {};
    var pend = Parceiro.validar(bruto);
    var avisos = [];
    var madeiras = [], mo = [];

    arr(c.madeiras).forEach(function (m) {
      if (!m) return;
      var desc = (global.Carpintaria && global.Carpintaria.descricaoMadeira)
        ? global.Carpintaria.descricaoMadeira(m) : txt(m.especie);
      var base = (global.Carpintaria && global.Carpintaria.menorCusto)
        ? global.Carpintaria.menorCusto(m) : null;
      if (!base) {
        /* ⚠ sem preço não se inventa zero — a mesma regra do motor da
           carpintaria. Item sem custo fica FORA da tabela do parceiro.
           ⚠ E isso é AVISO, não impedimento: como pendência, UMA madeira sem
             preço no cadastro travava a publicação da tabela INTEIRA, e a
             mensagem ("ficou fora da tabela") dizia o contrário do que
             acontecia. Cadastro de madeira em andamento é o estado normal. */
        avisos.push('"' + (desc || "item sem nome") + '" não tem preço de compra e ficou fora da tabela dele.');
        return;
      }
      if (p.margemMadeiraPct == null) return;      // já reportado em validar
      madeiras.push({
        id: txt(m.id),
        descricao: desc,
        unidade: txt(m.unidade),
        preco: money(base.valor * (1 + p.margemMadeiraPct / 100)),
        /* ⚠ INTERNO. `paraPortal` monta o pacote campo a campo e NÃO leva este
           campo; ele existe para a auditoria poder comparar o preço com o
           custo DAQUELE item — comparar contra a lista inteira de custos
           bloqueava publicação legítima por coincidência de número. */
        _custo: base.valor
      });
    });

    arr(c.servicos).forEach(function (s) {
      if (!s) return;
      if (s.valor == null || txt(s.valor) === "") {
        avisos.push('"' + txt(s.servico) + '" não tem valor de tabela e ficou fora da tabela dele.');
        return;
      }
      var precoMO = money(num(s.valor) * (1 + p.ajusteMOPct / 100));
      /* ⚠ preço zero ou negativo NÃO é publicado: seria dizer ao parceiro que
         a mão de obra é de graça. Vira pendência, que trava. */
      if (!(precoMO > 0)) {
        pend.push('"' + txt(s.servico) + '" ficaria em ' + precoMO + ' com o ajuste de ' + p.ajusteMOPct + '%.');
        return;
      }
      mo.push({
        id: txt(s.id),
        servico: txt(s.servico),
        unidade: txt(s.unidade) || "m2",
        preco: precoMO
      });
    });

    if (!madeiras.length && !mo.length) {
      pend.push("Nenhum item com preço para publicar — cadastre madeira ou mão de obra antes.");
    }
    return {
      parceiroId: p.id, nome: p.nome, login: p.login,
      madeiras: madeiras, mo: mo,
      pendencias: pend,
      /* o que a tela deve DIZER sem impedir a publicação */
      avisos: avisos,
      completa: pend.length === 0 && (madeiras.length > 0 || mo.length > 0)
    };
  };

  /* ===================================================================
   * O PACOTE QUE VAI PARA O SERVIDOR — allowlist, campo a campo
   * =================================================================== */

  Parceiro.PACOTE_VERSAO = 1;

  Parceiro.paraPortal = function (bruto, precos, empresa, quandoISO) {
    var p = Parceiro.normalizar(bruto);
    var r = precos || {};
    var e = empresa || {};
    return {
      v: Parceiro.PACOTE_VERSAO,
      /* quem publicou, para a página se identificar — nome e contato da
         carpintaria são públicos para o parceiro, custo não é */
      empresa: txt(e.nome),
      contato: txt(e.contato),
      parceiro: p.nome,
      login: p.login,
      publicadoEm: txt(quandoISO) || (global.Util && global.Util.agoraISO ? global.Util.agoraISO() : new Date().toISOString()),
      madeiras: arr(r.madeiras).map(function (m) {
        /* ⚠ CAMPO A CAMPO. Um spread aqui levaria `precos` (a lista de
           fornecedores com o custo de compra) junto — ver o cabeçalho. */
        return { descricao: txt(m.descricao), unidade: txt(m.unidade), preco: num(m.preco) };
      }),
      mo: arr(r.mo).map(function (s) {
        return { servico: txt(s.servico), unidade: txt(s.unidade), preco: num(s.preco) };
      })
    };
  };

  /* ===================================================================
   * AUDITAR — o cadeado do teste
   *
   * Varre o pacote inteiro atrás de qualquer coisa que revele o custo ou a
   * cadeia de suprimento da carpintaria. Nome de campo E valor: um campo
   * `preco` cujo número bate com um custo conhecido também é vazamento.
   * =================================================================== */

  Parceiro.CAMPOS_PROIBIDOS = [
    "custo", "custoUnit", "custoUnitario", "precos", "fornecedorId",
    "fornecedor", "margemMadeiraPct", "ajusteMOPct", "dataPreco", "margemPct"
  ];

  /* ⚠ A COMPARAÇÃO É ITEM A ITEM, e a tolerância não é enfeite.
   *
   *   Igualdade exata contra a lista INTEIRA de custos errava dos dois lados:
   *   · falso NEGATIVO — margem de 0,35% (quem quis dizer 35%) publicava
   *     240,84 sobre custo de 240,00. Não era igual, passava, e o parceiro
   *     ficava com a tabela de compra da carpintaria a 0,4% de ruído.
   *   · falso POSITIVO — o preço final de uma madeira batendo por acaso com o
   *     custo de OUTRA bloqueava uma publicação perfeitamente legítima, com
   *     uma mensagem falando de vazamento que não existia.
   *
   *   Agora cada item é comparado com o SEU próprio custo (`_custo`, que o
   *   `precos` carrega e o `paraPortal` não leva), e o critério é proximidade:
   *   preço a menos de MARGEM_MINIMA_PCT acima do custo é, na prática, o custo.
   *
   * `precos` é o resultado de `Parceiro.precos` — a ordem dos itens é a mesma
   * do pacote, porque um é montado a partir do outro. */
  Parceiro.auditar = function (pacote, precos) {
    var achados = [];
    var proibidos = Parceiro.CAMPOS_PROIBIDOS;
    (function anda(no, caminho) {
      if (no == null || typeof no !== "object") return;
      if (Array.isArray(no)) { no.forEach(function (x, i) { anda(x, caminho + "[" + i + "]"); }); return; }
      Object.keys(no).forEach(function (k) {
        if (proibidos.indexOf(k) > -1) {
          achados.push({ caminho: caminho + "." + k, motivo: "campo proibido", valor: no[k] });
          return;
        }
        anda(no[k], caminho + "." + k);
      });
    })(pacote, "pacote");

    var base = arr(precos && precos.madeiras);
    if (base.length) {
      var piso = 1 + Parceiro.MARGEM_MINIMA_PCT / 100;
      arr(pacote && pacote.madeiras).forEach(function (m, i) {
        var custo = num(base[i] && base[i]._custo);
        if (!(custo > 0)) return;
        var preco = num(m && m.preco);
        /* meio centavo de folga: o arredondamento do preço não pode virar
           acusação de vazamento */
        if (preco < custo * piso - 0.005) {
          achados.push({
            caminho: "pacote.madeiras[" + i + "].preco",
            motivo: "o preço está a menos de " + Parceiro.MARGEM_MINIMA_PCT + "% do custo de compra — na prática, é o custo",
            valor: preco
          });
        }
      });
    }
    return achados;
  };

  global.Parceiro = Parceiro;
  if (typeof module !== "undefined" && module.exports) module.exports = Parceiro;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
