/* =====================================================================
 * rdocanal.js — QUEM PODE MANDAR O DIÁRIO DESTA OBRA PELO WHATSAPP
 *
 * Antes disto, o mapa "telefone → obra" era um JSON no servidor que só eu
 * conseguia editar. Não escala para cliente nenhum: cada obra nova exigia
 * alguém com acesso ao VPS. Agora é cadastro na própria obra, dentro do
 * sistema, e o servidor só guarda o que o cliente registrou.
 *
 * ⚠ AQUI SE DECIDE DE QUEM É O DIÁRIO. Um recado que chega pelo WhatsApp
 * vira rascunho na conta de ALGUÉM. Se o telefone casar com a conta
 * errada, o diário de uma empresa nasce dentro da outra — com o efetivo,
 * o serviço e a foto da obra dela. É o pior vazamento possível neste
 * módulo, e é por isso que:
 *
 *   1) UM TELEFONE PERTENCE A UMA CONTA SÓ. Se outra conta tentar
 *      cadastrar o mesmo número, é RECUSADO — não é "o último ganha",
 *      que faria o canal trocar de dono sem ninguém perceber.
 *   2) DENTRO DA MESMA CONTA, o mesmo telefone pode estar em várias
 *      obras (o mestre toca duas). Aí quem decide é o texto: o nome da
 *      obra que ele escreveu. Sem isso dar match, o rascunho nasce com
 *      pendência em vez de escolher sozinho.
 *   3) NÚMERO SÓ VALE NORMALIZADO. "(34) 9 8888-7777", "5534988887777" e
 *      "+55 34 98888-7777" são a mesma pessoa; comparar como texto cru
 *      faria o mestre parecer desconhecido só por causa do formato.
 * ===================================================================== */
(function (global) {
  "use strict";

  function texto(s) { return String(s == null ? "" : s).trim(); }
  function normal(s) {
    var t = texto(s).toLowerCase();
    if (t.normalize) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return t.replace(/\s+/g, " ");
  }

  /* -------------------------------------------------------------------
   * O TELEFONE, EM UMA FORMA SÓ.
   *
   * Devolve os dígitos com DDI 55 na frente, ou "" quando não dá para
   * afirmar que é um celular brasileiro válido. Devolver "" é melhor que
   * devolver um palpite: número torto que "passa" vira canal que nunca
   * funciona e ninguém entende por quê.
   *
   * ⚠ O NONO DÍGITO. Celular no Brasil tem 9 na frente do número desde
   * 2016, mas muita agenda antiga ainda guarda 8 dígitos. Aceito os dois
   * e normalizo para COM o 9 — senão o mesmo mestre entra duas vezes e
   * uma das entradas nunca casa.
   * ----------------------------------------------------------------- */
  function normalizarFone(v) {
    var d = texto(v).replace(/\D/g, "");
    if (!d) return "";
    if (d.indexOf("00") === 0) d = d.slice(2);          // 00 55 ... (discagem internacional)
    if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    if (d.length === 11) {
      /* DDD + 9 + 8 dígitos */
      if (d.charAt(2) !== "9") return "";               // celular brasileiro começa com 9
    } else if (d.length === 10) {
      /* ⚠ DEZ DÍGITOS É AMBÍGUO: pode ser celular antigo (sem o nono) ou
         FIXO. O teste pegou: eu acrescentava o 9 em tudo, e "(34) 3232-1010"
         — um fixo de escritório — virava um celular que não existe. O canal
         nunca funcionaria e ninguém saberia por quê.
         A régua é o primeiro dígito do número: fixo começa em 2–5, celular
         antigo em 6–9. */
      var primeiro = d.charAt(2);
      if (primeiro >= "2" && primeiro <= "5") return "";   // fixo: WhatsApp não é aqui
      d = d.slice(0, 2) + "9" + d.slice(2);
    } else {
      return "";
    }
    var ddd = parseInt(d.slice(0, 2), 10);
    if (!(ddd >= 11 && ddd <= 99)) return "";
    return "55" + d;
  }

  /* como mostrar de volta para gente ler: +55 (34) 98888-7777 */
  function exibirFone(v) {
    var d = normalizarFone(v);
    if (!d) return texto(v);
    var n = d.slice(2);
    return "+55 (" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7);
  }

  /* -------------------------------------------------------------------
   * O CADASTRO DE UMA OBRA, validado.
   * `d`: { ativo, responsaveis: [{nome, fone}] }
   * ----------------------------------------------------------------- */
  function validar(d) {
    d = d || {};
    var erros = [], avisos = [], limpos = [], vistos = {};

    (d.responsaveis || []).forEach(function (r, i) {
      var nome = texto(r && r.nome);
      var bruto = texto(r && r.fone);
      if (!nome && !bruto) return;                       // linha em branco, ignora
      var fone = normalizarFone(bruto);
      if (!fone) {
        erros.push("O telefone da linha " + (i + 1) + (nome ? " (" + nome + ")" : "") +
          " não parece um celular brasileiro. Use DDD + número, como (34) 98888-7777.");
        return;
      }
      if (!nome) {
        /* nome não é enfeite: é ele que aparece no diário dizendo quem mandou */
        erros.push("Falta o nome de quem usa o telefone " + exibirFone(fone) + ".");
        return;
      }
      if (vistos[fone]) {
        avisos.push("O telefone " + exibirFone(fone) + " está repetido — mantive uma vez só.");
        return;
      }
      vistos[fone] = 1;
      limpos.push({ nome: nome, fone: fone });
    });

    if (d.ativo && !limpos.length) {
      erros.push("Para ligar o diário por WhatsApp, cadastre ao menos uma pessoa com telefone.");
    }
    return { ok: !erros.length, erros: erros, avisos: avisos, responsaveis: limpos, ativo: !!d.ativo };
  }

  /* -------------------------------------------------------------------
   * DE QUEM É ESTE RECADO.
   *
   * `registros`: o que o servidor guarda — [{conta, obraId, obraNome, fone, nome}]
   * `fone`: quem mandou    `textoMsg`: o recado (para desempatar pela obra)
   *
   * Devolve { ok, conta, obraId, obraNome, motivo, candidatas }.
   * ----------------------------------------------------------------- */
  function resolver(registros, fone, textoMsg) {
    var f = normalizarFone(fone);
    if (!f) return { ok: false, motivo: "fone-invalido" };

    var achados = (registros || []).filter(function (r) {
      return r && r.ativo !== false && normalizarFone(r.fone) === f;
    });
    if (!achados.length) return { ok: false, motivo: "nao-cadastrado" };

    /* ⚠ CONTAS DIFERENTES COM O MESMO TELEFONE NÃO PODEM SER RESOLVIDAS
       POR ADIVINHAÇÃO. O cadastro recusa isso na entrada, mas se um dia
       escapar (importação, migração, defeito), aqui a porta fecha: sem
       dono claro, ninguém recebe. Errar aqui põe o diário de uma empresa
       dentro da outra. */
    var contas = {};
    achados.forEach(function (r) { contas[texto(r.conta)] = 1; });
    if (Object.keys(contas).length > 1) {
      return { ok: false, motivo: "conta-ambigua", contas: Object.keys(contas).length };
    }

    var conta = achados[0].conta;
    if (achados.length === 1) {
      return { ok: true, conta: conta, obraId: achados[0].obraId, obraNome: achados[0].obraNome };
    }

    /* mesma conta, várias obras: quem decide é o nome da obra no texto */
    var alvo = normal(textoMsg);
    var porNome = achados.filter(function (r) {
      var n = normal(r.obraNome);
      return n && alvo.indexOf(n) >= 0;
    });
    if (porNome.length === 1) {
      return { ok: true, conta: conta, obraId: porNome[0].obraId, obraNome: porNome[0].obraNome, por: "nome-no-texto" };
    }
    /* sem match: entrega na conta, SEM obra — o rascunho nasce com
       pendência "escolha a obra", que é honesto. Escolher uma das duas
       seria lançar o dia de trabalho na obra errada. */
    return { ok: true, conta: conta, obraId: "", obraNome: "",
             motivo: "obra-ambigua", candidatas: achados.map(function (r) { return r.obraNome; }) };
  }

  /* -------------------------------------------------------------------
   * O QUE O SERVIDOR GUARDA, a partir do cadastro de uma obra.
   * Uma linha por telefone: é assim que a busca por quem mandou fica
   * direta, sem varrer obra por obra.
   * ----------------------------------------------------------------- */
  function paraRegistro(d) {
    var v = validar(d);
    if (!v.ok) return { ok: false, erros: v.erros };
    return {
      ok: true,
      linhas: v.responsaveis.map(function (r) {
        return { obraId: texto(d.obraId), obraNome: texto(d.obraNome),
                 fone: r.fone, nome: r.nome, ativo: v.ativo };
      })
    };
  }

  /* conflito entre contas, checado ANTES de gravar */
  function conflito(registros, novasLinhas, conta) {
    var meus = {}, choque = [];
    (registros || []).forEach(function (r) {
      if (!r) return;
      if (texto(r.conta) === texto(conta)) { meus[normalizarFone(r.fone)] = 1; return; }
      meus["outra:" + normalizarFone(r.fone)] = texto(r.conta);
    });
    (novasLinhas || []).forEach(function (l) {
      var dono = meus["outra:" + normalizarFone(l.fone)];
      if (dono) choque.push({ fone: l.fone, nome: l.nome });
    });
    return choque;
  }

  var RDOCanal = {
    normalizarFone: normalizarFone, exibirFone: exibirFone,
    validar: validar, resolver: resolver, paraRegistro: paraRegistro, conflito: conflito
  };
  global.RDOCanal = RDOCanal;
  if (typeof module !== "undefined" && module.exports) module.exports = RDOCanal;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
