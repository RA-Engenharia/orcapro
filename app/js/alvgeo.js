/* =====================================================================
 * alvgeo.js — Geometria de parede: ENCONTROS e VÃOS.
 *
 * Motor PURO (Node-testável, ES5). Metros.
 *
 * ---------------------------------------------------------------------
 * O PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * ---------------------------------------------------------------------
 * Quando o desenho vai de EIXO a EIXO — que é como se desenha em planta —
 * duas paredes que se encontram num canto ocupam o mesmo pedaço de espaço.
 * Some os volumes e o canto entra duas vezes. Numa casa com 12 cantos e
 * parede de 14 cm isso é meio metro cúbico de alvenaria que não existe, e
 * o erro é sempre PARA MAIS: o orçamento fica caro sem ninguém ver onde.
 *
 * A saída é a mesma da obra: no encontro, UMA parede atravessa e a outra
 * morre na face dela. Aqui isso é decidido por regra, registrado em cada
 * parede (quem cedeu, quanto e para quem) e some do comprimento de quem
 * cedeu — para o quantitativo e a modulação já saírem certos.
 *
 * ---------------------------------------------------------------------
 * VÃOS
 * ---------------------------------------------------------------------
 * Porta e janela descontam da alvenaria e do revestimento. O critério de
 * medição é parametrizável porque não é o mesmo em todo edital: o padrão
 * aqui desconta tudo, e há a opção de ignorar vão pequeno (alguns editais
 * dispensam abaixo de 2 m²). O que for ignorado aparece no resultado —
 * nunca desconta calado, nunca deixa de descontar calado.
 *
 * Teste: node tools/test-alvgeo.js
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
  function r4(n) { return Math.round(num(n) * 10000) / 10000; }
  function dist(a, b) { var dx = b.x - a.x, dy = b.y - a.y; return Math.sqrt(dx * dx + dy * dy); }

  var AlvGeo = {
    TOL: 0.02,   /* 2 cm: dois pontos mais perto que isso são o mesmo ponto */

    /* ---------------------------------------------------------------
     * parede = { id, p1:{x,y}, p2:{x,y}, espessura, altura, funcao }
     * Coordenadas em planta, metros. O eixo é a LINHA DE CENTRO.
     * --------------------------------------------------------------- */
    comprimentoEixo: function (parede) {
      if (!parede || !parede.p1 || !parede.p2) return 0;
      return r4(dist(parede.p1, parede.p2));
    },

    /* ---------------------------------------------------------------
     * ENCONTROS
     * Acha onde as paredes se tocam e classifica: L (canto, ponta com
     * ponta), T (ponta de uma no meio da outra) ou X (cruzamento).
     * --------------------------------------------------------------- */
    encontros: function (paredes, opts) {
      opts = opts || {};
      var tol = opts.tolerancia != null ? num(opts.tolerancia) : this.TOL;
      var ps = (paredes || []).filter(function (p) { return p && p.p1 && p.p2; });
      var out = [];
      var self = this;

      for (var i = 0; i < ps.length; i++) {
        for (var j = i + 1; j < ps.length; j++) {
          var A = ps[i], B = ps[j];
          var tipo = null, ponto = null, pontaA = null, pontaB = null;

          /* ponta com ponta = L */
          var pares = [["p1", "p1"], ["p1", "p2"], ["p2", "p1"], ["p2", "p2"]];
          for (var k = 0; k < pares.length; k++) {
            var a = A[pares[k][0]], b = B[pares[k][1]];
            if (dist(a, b) <= tol) { tipo = "L"; ponto = a; pontaA = pares[k][0]; pontaB = pares[k][1]; break; }
          }
          /* ponta de uma no MEIO da outra = T */
          if (!tipo) {
            ["p1", "p2"].forEach(function (pa) {
              if (tipo) return;
              var d = self._distPonto(A[pa], B.p1, B.p2);
              if (d.dist <= tol && d.t > 0.01 && d.t < 0.99) { tipo = "T"; ponto = A[pa]; pontaA = pa; pontaB = null; }
            });
          }
          if (!tipo) {
            ["p1", "p2"].forEach(function (pb) {
              if (tipo) return;
              var d = self._distPonto(B[pb], A.p1, A.p2);
              if (d.dist <= tol && d.t > 0.01 && d.t < 0.99) { tipo = "T"; ponto = B[pb]; pontaA = null; pontaB = pb; }
            });
          }
          /* cruzamento no meio das duas = X */
          if (!tipo) {
            var X = this._interseccao(A, B);
            if (X && X.tA > 0.01 && X.tA < 0.99 && X.tB > 0.01 && X.tB < 0.99) { tipo = "X"; ponto = X.p; }
          }
          if (!tipo) continue;

          out.push({
            tipo: tipo, ponto: { x: r4(ponto.x), y: r4(ponto.y) },
            a: A.id, b: B.id, pontaA: pontaA, pontaB: pontaB,
            anguloGraus: r3(this._angulo(A, B))
          });
        }
      }
      return out;
    },

    _distPonto: function (p, a, b) {
      var vx = b.x - a.x, vy = b.y - a.y;
      var L2 = vx * vx + vy * vy;
      if (L2 < 1e-12) return { dist: dist(p, a), t: 0 };
      var t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
      var tc = Math.max(0, Math.min(1, t));
      var px = a.x + tc * vx, py = a.y + tc * vy;
      return { dist: Math.sqrt((p.x - px) * (p.x - px) + (p.y - py) * (p.y - py)), t: t };
    },
    _interseccao: function (A, B) {
      var x1 = A.p1.x, y1 = A.p1.y, x2 = A.p2.x, y2 = A.p2.y;
      var x3 = B.p1.x, y3 = B.p1.y, x4 = B.p2.x, y4 = B.p2.y;
      var den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-12) return null;   /* paralelas */
      var tA = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      var tB = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
      return { p: { x: x1 + tA * (x2 - x1), y: y1 + tA * (y2 - y1) }, tA: tA, tB: tB };
    },
    _angulo: function (A, B) {
      var aA = Math.atan2(A.p2.y - A.p1.y, A.p2.x - A.p1.x);
      var aB = Math.atan2(B.p2.y - B.p1.y, B.p2.x - B.p1.x);
      var d = Math.abs(aA - aB) * 180 / Math.PI;
      while (d > 180) d -= 180;
      return d > 90 ? 180 - d : d;
    },

    /* ---------------------------------------------------------------
     * RESOLVER OS ENCONTROS — o coração.
     * Decide quem atravessa e encurta quem cede, para o mesmo pedaço de
     * canto não ser contado duas vezes.
     *
     * Quem atravessa, por ordem:
     *   1. quem o usuário mandou (parede.atravessa = true);
     *   2. a ESTRUTURAL, quando encontra uma de vedação (a vedação é que
     *      morre na face da estrutural — é assim que se executa);
     *   3. a mais COMPRIDA (convenção usual em paginação);
     *   4. empate: a de menor id, só para ser determinístico.
     *
     * O desconto de quem cede é METADE da espessura de quem atravessa,
     * porque o eixo dela ia até o eixo do outro: sobra o miolo da parede
     * que atravessa.
     * --------------------------------------------------------------- */
    resolverEncontros: function (paredes, opts) {
      opts = opts || {};
      var ps = (paredes || []).filter(function (p) { return p && p.p1 && p.p2; });
      var self = this;
      var enc = this.encontros(ps, opts);
      var porId = {};
      ps.forEach(function (p) {
        porId[p.id] = {
          id: p.id, espessura: num(p.espessura), altura: num(p.altura),
          funcao: p.funcao || "vedacao",
          comprimentoEixo: self.comprimentoEixo(p),
          desconto: 0, cedeu: [], atravessou: []
        };
      });

      enc.forEach(function (e) {
        if (e.tipo === "X") {
          /* cruzamento: as duas seguem inteiras; o miolo é resolvido na
             paginação, alternando quem atravessa a cada fiada */
          return;
        }
        var A = porId[e.a], B = porId[e.b];
        if (!A || !B) return;
        var pa = (paredes.filter(function (p) { return p.id === e.a; })[0]) || {};
        var pb = (paredes.filter(function (p) { return p.id === e.b; })[0]) || {};

        var quem;   /* quem ATRAVESSA */
        if (pa.atravessa && !pb.atravessa) quem = "a";
        else if (pb.atravessa && !pa.atravessa) quem = "b";
        else if (e.tipo === "T") {
          /* no T quem atravessa é sempre a contínua — a que NÃO encosta
             a ponta; senão a parede contínua seria cortada no meio */
          quem = e.pontaA ? "b" : "a";
        } else if (A.funcao !== B.funcao) {
          quem = A.funcao === "estrutural" ? "a" : "b";
        } else if (Math.abs(A.comprimentoEixo - B.comprimentoEixo) > 1e-6) {
          quem = A.comprimentoEixo > B.comprimentoEixo ? "a" : "b";
        } else {
          quem = String(A.id) <= String(B.id) ? "a" : "b";
        }

        var vence = quem === "a" ? A : B, cede = quem === "a" ? B : A;
        var corte = r4(vence.espessura / 2);
        cede.desconto = r4(cede.desconto + corte);
        cede.cedeu.push({ para: vence.id, tipo: e.tipo, corte: corte, ponto: e.ponto });
        vence.atravessou.push({ sobre: cede.id, tipo: e.tipo, ponto: e.ponto });
      });

      var res = [], avisos = [];
      ps.forEach(function (p) {
        var r = porId[p.id];
        var liq = r4(r.comprimentoEixo - r.desconto);
        if (liq <= 0) {
          avisos.push("A parede " + p.id + " some ao descontar os encontros (" +
            r.comprimentoEixo.toFixed(2) + " m de eixo, " + r.desconto.toFixed(2) + " m de desconto). Confira se ela não é curta demais para os cantos.");
          liq = 0;
        }
        res.push({
          id: p.id, funcao: r.funcao, espessura: r.espessura, altura: r.altura,
          comprimentoEixo: r.comprimentoEixo,
          descontoEncontros: r.desconto,
          comprimento: liq,                       /* é ESTE que vai para o quantitativo */
          cedeu: r.cedeu, atravessou: r.atravessou,
          nEncontros: r.cedeu.length + r.atravessou.length
        });
      });

      return {
        ok: true, paredes: res, encontros: enc, avisos: avisos,
        totalEixo: r4(res.reduce(function (s, p) { return s + p.comprimentoEixo; }, 0)),
        totalLiquido: r4(res.reduce(function (s, p) { return s + p.comprimento; }, 0)),
        economia: r4(res.reduce(function (s, p) { return s + p.descontoEncontros; }, 0)),
        nota: "O comprimento líquido já desconta os encontros: o canto pertence a uma parede só."
      };
    },

    /* ---------------------------------------------------------------
     * VÃOS
     * vao = { id, tipo:'porta'|'janela', largura, altura, peitoril }
     * --------------------------------------------------------------- */
    areaVaos: function (vaos, opts) {
      opts = opts || {};
      var minimo = opts.descontarAcimaDe != null ? num(opts.descontarAcimaDe) : 0;
      var descontados = [], ignorados = [];
      var total = 0;
      (vaos || []).forEach(function (v) {
        var a = r4(num(v.largura) * num(v.altura));
        if (!(a > 0)) return;
        if (minimo > 0 && a < minimo) {
          ignorados.push({ id: v.id, tipo: v.tipo, area: a });
        } else {
          descontados.push({ id: v.id, tipo: v.tipo, area: a });
          total += a;
        }
      });
      return {
        ok: true, area: r4(total),
        descontados: descontados, ignorados: ignorados,
        criterio: minimo > 0
          ? "Vão com menos de " + minimo.toFixed(2) + " m² não desconta (critério do edital)."
          : "Todo vão desconta.",
        aviso: ignorados.length
          ? ignorados.length + " vão(s) não descontado(s) por serem menores que " + minimo.toFixed(2) + " m²."
          : ""
      };
    },

    /* ---------------------------------------------------------------
     * QUANTIFICAR — junta tudo: encontros resolvidos + vãos.
     * É o número que vai para o orçamento e para a modulação.
     * --------------------------------------------------------------- */
    quantificar: function (paredes, opts) {
      opts = opts || {};
      var res = this.resolverEncontros(paredes, opts);
      var self = this;
      var linhas = [], avisos = res.avisos.slice();
      var totBruta = 0, totVaos = 0, totLiq = 0, totVol = 0;

      res.paredes.forEach(function (p) {
        var orig = (paredes.filter(function (x) { return x.id === p.id; })[0]) || {};
        var vaos = self.areaVaos(orig.vaos, opts);
        var bruta = r4(p.comprimento * p.altura);
        var liq = r4(Math.max(0, bruta - vaos.area));
        var vol = r4(liq * p.espessura);
        if (vaos.area > bruta) {
          avisos.push("Os vãos da parede " + p.id + " somam mais que a própria parede (" +
            vaos.area.toFixed(2) + " m² em " + bruta.toFixed(2) + " m²). Confira as medidas.");
        }
        totBruta += bruta; totVaos += vaos.area; totLiq += liq; totVol += vol;
        linhas.push({
          id: p.id, funcao: p.funcao,
          comprimentoEixo: p.comprimentoEixo, descontoEncontros: p.descontoEncontros,
          comprimento: p.comprimento, altura: p.altura, espessura: p.espessura,
          areaBruta: bruta, areaVaos: vaos.area, area: liq, volume: vol,
          vaosDescontados: vaos.descontados, vaosIgnorados: vaos.ignorados,
          nEncontros: p.nEncontros
        });
      });

      return {
        ok: true, paredes: linhas, avisos: avisos,
        criterioVaos: this.areaVaos([], opts).criterio,
        totais: {
          comprimentoEixo: res.totalEixo,
          descontoEncontros: res.economia,
          comprimento: res.totalLiquido,
          areaBruta: r4(totBruta), areaVaos: r4(totVaos), area: r4(totLiq), volume: r4(totVol)
        },
        /* o que aconteceria SEM resolver os encontros — para o usuário ver
           de quanto era o erro, em vez de confiar na palavra do software */
        semResolverEncontros: {
          comprimento: res.totalEixo,
          diferenca: res.economia,
          nota: res.economia > 0
            ? "Medindo de eixo a eixo, sem tratar os cantos, sairiam " + res.economia.toFixed(2) +
              " m de parede a mais — sempre para mais, nunca para menos."
            : "Não há encontros a resolver neste conjunto."
        }
      };
    },

    /* Um vão cabe na parede? Porta que passa da altura, janela que não
     * cabe no comprimento — erro comum de digitação que vira obra errada. */
    conferirVao: function (parede, vao) {
      var c = this.comprimentoEixo(parede), h = num(parede.altura);
      var lv = num(vao.largura), hv = num(vao.altura), pe = num(vao.peitoril);
      var erros = [];
      if (!(lv > 0) || !(hv > 0)) erros.push("O vão precisa de largura e altura.");
      if (lv > c) erros.push("O vão tem " + lv.toFixed(2) + " m e a parede só " + c.toFixed(2) + " m.");
      if (pe + hv > h) erros.push("Peitoril + altura do vão dão " + (pe + hv).toFixed(2) + " m, mais que o pé-direito de " + h.toFixed(2) + " m.");
      if (String(vao.tipo) === "porta" && pe > 0.001) erros.push("Porta com peitoril de " + pe.toFixed(2) + " m — porta começa no piso.");
      return { ok: erros.length === 0, erros: erros };
    }
  };

  global.AlvGeo = AlvGeo;
  if (typeof module !== "undefined" && module.exports) module.exports = AlvGeo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
