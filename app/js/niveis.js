/* =====================================================================
 * niveis.js — NÍVEIS do projeto, como no Revit.
 *
 * Motor PURO (Node-testável, ES5). Metros.
 *
 * Um nível é uma altura com nome ("Térreo", "1º pavimento") à qual os
 * elementos pertencem. Ele responde três perguntas que o modelo precisa:
 *   · a que altura este elemento nasce?
 *   · qual é o pé-direito daqui até o próximo?
 *   · o que aparece na planta deste nível?
 *
 * A planta é um corte horizontal: mostra o que é ATRAVESSADO pelo plano de
 * corte (paredes, portas) e, mais claro, o que está ABAIXO dele (piso,
 * bancada, degrau). O que está acima só entra se for pedido — forro,
 * viga, laje —, e aí tracejado. Sem essa distinção a planta vira um
 * emaranhado onde tudo aparece igual.
 *
 * Esta é a ÚNICA fonte de nível do sistema. Quem lê corte de PDF ou
 * fachada apenas PROPÕE valores; quem grava é aqui.
 *
 * Teste: node tools/test-niveis.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v).trim();
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(s) || 0;
  }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }
  function str(v) { return v == null ? "" : String(v); }

  var Niveis = {
    /* altura padrão do plano de corte da planta: 1,20 m acima do piso —
     * passa acima do peitoril comum (1,00 m) e abaixo do topo da porta */
    CORTE_PADRAO: 1.20,

    /* ---------------------------------------------------------------
     * nivel = { id, nome, elevacao, corte?, peDireitoDeclarado? }
     * A lista é sempre devolvida ORDENADA por elevação.
     * --------------------------------------------------------------- */
    normalizar: function (niveis) {
      var out = (niveis || [])
        .filter(function (n) { return n && n.id != null; })
        .map(function (n, i) {
          return {
            id: str(n.id), nome: str(n.nome) || ("Nível " + (i + 1)),
            elevacao: r3(n.elevacao),
            corte: n.corte != null ? r3(n.corte) : null,
            peDireitoDeclarado: n.peDireitoDeclarado != null ? r3(n.peDireitoDeclarado) : null
          };
        });
      out.sort(function (a, b) { return a.elevacao - b.elevacao; });
      return out;
    },

    /* Lista completa, com o que se DERIVA: pé-direito até o próximo nível,
     * altura do plano de corte e a ordem. O pé-direito derivado é o que
     * vale — o declarado só aparece quando briga com a geometria, e aí
     * vira aviso, porque um dos dois está errado. */
    listar: function (niveis) {
      var ns = this.normalizar(niveis);
      var self = this;
      return ns.map(function (n, i) {
        var prox = ns[i + 1];
        var pd = prox ? r3(prox.elevacao - n.elevacao) : (n.peDireitoDeclarado || null);
        var aviso = "";
        if (prox && n.peDireitoDeclarado != null && Math.abs(pd - n.peDireitoDeclarado) > 0.005) {
          aviso = "O pé-direito informado (" + n.peDireitoDeclarado.toFixed(2) + " m) não bate com a distância até o " +
                  prox.nome + " (" + pd.toFixed(2) + " m). Um dos dois está errado.";
        }
        if (!prox && !pd) aviso = "É o último nível e não tem pé-direito informado — o que estiver acima dele não tem topo definido.";
        return {
          id: n.id, nome: n.nome, elevacao: n.elevacao, ordem: i,
          peDireito: pd, peDireitoDeclarado: n.peDireitoDeclarado,
          topo: pd != null ? r3(n.elevacao + pd) : null,
          corte: n.corte != null ? n.corte : self.CORTE_PADRAO,
          corteAbsoluto: r3(n.elevacao + (n.corte != null ? n.corte : self.CORTE_PADRAO)),
          ultimo: !prox, aviso: aviso
        };
      });
    },

    /* Criar um nível ACIMA do último, com o pé-direito informado — é o
     * jeito natural de subir um pavimento. */
    proximo: function (niveis, opts) {
      opts = opts || {};
      var ns = this.listar(niveis);
      var ultimo = ns[ns.length - 1];
      var pd = opts.peDireito != null ? num(opts.peDireito) : (ultimo && ultimo.peDireito) || 2.80;
      var base = ultimo ? ultimo.elevacao : 0;
      var n = ns.length;
      /* id derivado do TAMANHO da lista colide: exclua o do meio e crie outro,
         e o novo nasce com o id de um que ainda existe — o salvar então
         sobrescreve o errado e some com um pavimento. Usa o maior sufixo. */
      var maior = 0;
      ns.forEach(function (x) {
        var m = /^nivel-(\d+)$/.exec(String(x.id));
        if (m) maior = Math.max(maior, parseInt(m[1], 10));
      });
      return {
        id: opts.id || ("nivel-" + (maior + 1)),
        nome: opts.nome || (n === 0 ? "Térreo" : n + "º pavimento"),
        elevacao: r3(base + (ultimo ? pd : 0)),
        peDireitoDeclarado: r3(pd)
      };
    },

    /* Em que nível está esta altura? (para classificar elemento importado) */
    nivelDe: function (niveis, altura) {
      var ns = this.listar(niveis);
      var y = num(altura), achado = null;
      for (var i = 0; i < ns.length; i++) {
        if (y >= ns[i].elevacao - 0.005) achado = ns[i]; else break;
      }
      return achado;
    },

    /* ---------------------------------------------------------------
     * O QUE APARECE NA PLANTA DESTE NÍVEL
     * elemento = { id, tipo, base, topo, nivelId? }
     *   base/topo em elevação ABSOLUTA (metros).
     * Devolve, para cada elemento: se entra, e COMO desenhar.
     *   "cortado"  — o plano atravessa (parede, porta): traço grosso
     *   "abaixo"   — está sob o corte, dentro do pavimento (piso,
     *                bancada, degrau): traço fino
     *   "acima"    — está sobre o corte (viga, forro, laje): tracejado,
     *                e só entra se `mostrarAcima` pedir
     *   "fora"     — de outro pavimento: não entra
     * --------------------------------------------------------------- */
    planta: function (niveis, elementos, nivelId, opts) {
      opts = opts || {};
      var ns = this.listar(niveis);
      var nv = null;
      for (var i = 0; i < ns.length; i++) if (ns[i].id === nivelId) nv = ns[i];
      if (!nv) return { ok: false, motivo: "Nível não encontrado." };

      var zCorte = nv.corteAbsoluto;
      var zPiso = nv.elevacao;
      var zTeto = nv.topo != null ? nv.topo : (zPiso + 1e6);
      var mostrarAcima = !!opts.mostrarAcima;
      var tol = 0.005;

      var itens = [], contagem = { cortado: 0, abaixo: 0, acima: 0, fora: 0 };
      (elementos || []).forEach(function (el) {
        if (!el) return;
        var b = num(el.base), t = el.topo != null ? num(el.topo) : num(el.base);
        var como, entra = true, motivo = "";

        /* Pertence a este pavimento? O teste é geométrico, não pelo nivelId —
           elemento importado costuma vir sem nível nenhum.
           A regra é OCUPAR, não encostar: a parede do andar de cima começa
           exatamente na laje deste, e se "encostar" bastasse ela apareceria
           nas duas plantas. Elemento plano (piso, forro) não tem altura para
           sobrepor, então é classificado pela cota do ponto. */
        var dentro;
        if (t - b <= tol) dentro = (b >= zPiso - tol && b < zTeto - tol);
        else dentro = (t > zPiso + tol && b < zTeto - tol);

        if (!dentro) {
          como = "fora"; entra = false; motivo = "Está em outro pavimento.";
        } else if (b <= zCorte + tol && t >= zCorte - tol) {
          como = "cortado";
        } else if (t < zCorte) {
          como = "abaixo";
        } else {
          como = "acima";
          if (!mostrarAcima) { entra = false; motivo = "Está acima do plano de corte (ligue \"mostrar o que está acima\" para ver tracejado)."; }
        }
        contagem[como]++;
        itens.push({
          id: el.id, tipo: el.tipo, base: r3(b), topo: r3(t),
          como: como, entra: entra, motivo: motivo,
          traco: como === "cortado" ? "grosso" : (como === "abaixo" ? "fino" : "tracejado")
        });
      });

      return {
        ok: true,
        nivel: { id: nv.id, nome: nv.nome, elevacao: nv.elevacao, peDireito: nv.peDireito },
        planoDeCorte: { relativo: nv.corte, absoluto: zCorte },
        itens: itens, contagem: contagem,
        visiveis: itens.filter(function (x) { return x.entra; }).length,
        nota: "O plano de corte está a " + nv.corte.toFixed(2) + " m do piso: passa acima do peitoril e abaixo do topo da porta."
      };
    },

    /* Agrupa qualquer coisa por nível — é o que alimenta "peso por nível",
     * "quantitativo por pavimento" e a árvore do Navegador de Projeto. */
    agrupar: function (niveis, elementos, campo) {
      var ns = this.listar(niveis);
      var self = this;
      var mapa = {};
      ns.forEach(function (n) { mapa[n.id] = { nivel: n, itens: [], total: 0 }; });
      var semNivel = { nivel: null, itens: [], total: 0 };

      (elementos || []).forEach(function (el) {
        if (!el) return;
        var alvo = null;
        if (el.nivelId && mapa[el.nivelId]) alvo = mapa[el.nivelId];
        else {
          var n = self.nivelDe(ns, el.base);
          alvo = n ? mapa[n.id] : semNivel;
        }
        alvo.itens.push(el);
        if (campo) alvo.total += num(el[campo]);
      });

      var grupos = ns.map(function (n) { return { nivel: n, itens: mapa[n.id].itens, total: r3(mapa[n.id].total), n: mapa[n.id].itens.length }; });
      if (semNivel.itens.length) {
        grupos.push({ nivel: null, rotulo: "Sem nível", itens: semNivel.itens, total: r3(semNivel.total), n: semNivel.itens.length,
          aviso: semNivel.itens.length + " elemento(s) não caem em nenhum nível — provavelmente estão abaixo do primeiro piso ou acima do último." });
      }
      return { grupos: grupos, total: r3(grupos.reduce(function (s, g) { return s + g.total; }, 0)) };
    },

    /* Conferência antes de gravar: nome repetido, elevação repetida e
     * ordem invertida são erros que só aparecem tarde, quando a planta de
     * um pavimento mostra o do outro. */
    validar: function (niveis) {
      var ns = this.normalizar(niveis);
      var erros = [], avisos = [];
      var nomes = {}, elevs = {}, ids = {};
      ns.forEach(function (n) {
        /* id repetido faz um nível sobrescrever o outro no salvar: o usuário
           edita uma linha e some outra, sem nenhuma mensagem */
        if (ids[n.id]) erros.push("Dois níveis com o mesmo identificador (" + n.id + ") — um apagaria o outro ao salvar.");
        ids[n.id] = 1;
        var chave = n.nome.toUpperCase().trim();
        if (nomes[chave]) erros.push("Dois níveis com o mesmo nome: \"" + n.nome + "\".");
        nomes[chave] = 1;
        var e = n.elevacao.toFixed(3);
        if (elevs[e]) erros.push("Dois níveis na mesma elevação (" + n.elevacao.toFixed(2) + " m): " + elevs[e] + " e " + n.nome + ".");
        elevs[e] = n.nome;
      });
      this.listar(ns).forEach(function (n) {
        if (n.aviso) avisos.push(n.aviso);
        if (n.peDireito != null && n.peDireito < 2.30) {
          avisos.push("O pé-direito do " + n.nome + " é de " + n.peDireito.toFixed(2) + " m — abaixo do mínimo usual de 2,30 m para ambiente de permanência.");
        }
        if (n.peDireito != null && n.peDireito > 6) {
          avisos.push("O pé-direito do " + n.nome + " é de " + n.peDireito.toFixed(2) + " m. Confira se não é engano de digitação.");
        }
      });
      return { ok: erros.length === 0, erros: erros, avisos: avisos, n: ns.length };
    },

    /* padrão para começar: térreo + um pavimento */
    padrao: function (peDireito) {
      var pd = num(peDireito) || 2.80;
      return [
        { id: "terreo", nome: "Térreo", elevacao: 0, peDireitoDeclarado: pd },
        { id: "cobertura", nome: "Cobertura", elevacao: r3(pd), peDireitoDeclarado: null }
      ];
    }
  };

  global.Niveis = Niveis;
  if (typeof module !== "undefined" && module.exports) module.exports = Niveis;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
