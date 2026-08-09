/* =====================================================================
 * elevacao.js — ELEVAÇÃO DE PAREDE DE BLOCO, FIADA A FIADA.
 *
 * Motor PURO (Node-testável, ES5). Depende só de js/blocos.js.
 *
 * ---------------------------------------------------------------------
 * O QUE MUDA EM RELAÇÃO AO QUE JÁ EXISTIA
 * ---------------------------------------------------------------------
 * O blocos.js já modulava a parede e dava o peso — mas de uma parede
 * CEGA. Duas coisas ficavam de fora, e as duas estavam declaradas como
 * dívida:
 *
 *   1) O VÃO NÃO DESCONTAVA. Uma parede de 4,00 × 2,80 com uma janela
 *      de 1,50 × 1,20 tem 1,80 m² de vão — 16 % da parede. O orçamento
 *      comprava bloco para uma área que não existe.
 *   2) CANALETA, VERGA, CONTRAVERGA E CINTA ficavam fora da soma. São
 *      justamente as peças que carregam armadura e concreto, e as mais
 *      caras da parede.
 *
 * Aqui a fiada é montada de verdade: o vão corta a fiada em trechos, cada
 * trecho é modulado por conta própria, a fiada de cima do vão vira verga
 * em canaleta, a de baixo da janela vira contraverga, e a última vira
 * cinta de amarração. O que sai é a ELEVAÇÃO — o desenho que o pedreiro
 * lê — e o quantitativo bate com ela peça por peça.
 *
 * ---------------------------------------------------------------------
 * REGRAS DE EXECUÇÃO USADAS (e de onde vêm)
 * ---------------------------------------------------------------------
 * · Apoio da verga: 20 cm de cada lado do vão, no mínimo. É o que a
 *   NBR 8545 traz para alvenaria de vedação e o que a prática consagrou.
 *   EM ALVENARIA ESTRUTURAL quem manda é o projeto — o motor avisa.
 * · O apoio real é SEMPRE >= o pedido, nunca menor: a verga cresce até
 *   a borda da peça inteira mais próxima, porque canaleta não se corta
 *   no meio para ganhar 3 cm. O número que sai é o executado.
 * · Amarração: a fiada par começa com meio bloco, deslocando a junta
 *   vertical para o meio do bloco de baixo. É a definição de amarrar.
 * · Recorte: quando o trecho não fecha, entra uma peça marcada como
 *   CORTE NA OBRA. Ela pesa proporcional ao comprimento, mas na hora de
 *   COMPRAR consome um bloco inteiro — os dois números aparecem.
 *
 * Teste: node tools/test-elevacao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var B = (typeof require !== "undefined" && typeof module !== "undefined" && module.exports)
    ? require("./blocos.js")
    : global.Blocos;

  function num(v) {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v).trim();
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(s) || 0;
  }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }
  function r4(n) { return Math.round(num(n) * 10000) / 10000; }
  var TOL = 0.002;

  /* ---- intervalos: [a,b] em metros ao longo da parede ---------------- */
  function subtrair(ivs, a, b) {
    var out = [];
    ivs.forEach(function (iv) {
      if (b <= iv[0] + 1e-9 || a >= iv[1] - 1e-9) { out.push(iv); return; }
      if (a > iv[0] + 1e-9) out.push([iv[0], a]);
      if (b < iv[1] - 1e-9) out.push([b, iv[1]]);
    });
    return out.filter(function (iv) { return iv[1] - iv[0] > 0.02; });
  }

  /* Qual peça de canaleta desta família tem o comprimento pedido.
     Sem isso, `Blocos.peca(fam,"canaleta-u")` devolveria sempre a
     INTEIRA, e o meio bloco da fiada par virava canaleta de 39 — a
     parede ganhava comprimento no desenho e peso no orçamento. */
  function canaletaDe(famId, comprimento, papelPreferido) {
    var ps = B.pecas(famId), melhor = null, dif = Infinity;
    var papel = papelPreferido || "canaleta-u";
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].papel !== papel) continue;
      var d = Math.abs(ps[i].c - comprimento);
      if (d < dif) { dif = d; melhor = ps[i]; }
    }
    /* 3 cm de folga: a meia canaleta da 39 tem 19 e o meio bloco 19 —
       casa. Se a diferença for maior, não existe canaleta equivalente e
       a peça fica como está, com aviso, em vez de virar outra coisa. */
    return dif <= 0.03 ? melhor : null;
  }

  var Elevacao = {
    APOIO_VERGA: 0.20,

    /* ----------------------------------------------------------------
     * PAREDE — a elevação inteira.
     *
     * opts:
     *   comprimento, altura   — m
     *   familia               — id em Blocos.FAMILIAS
     *   junta                 — m (padrão 10 mm)
     *   bordas                — quantas pontas encostam em parede
     *                           transversal (0, 1 ou 2). Padrão 1.
     *   vaos: [{x, y, l, a, tipo:"porta"|"janela", nome}]
     *   cinta                 — última fiada em canaleta (padrão true)
     *   verga                 — gerar verga sobre os vãos (padrão true)
     *   contraverga           — sob as janelas (padrão true)
     *   apoioVerga            — m de apoio de cada lado (padrão 0,20)
     * ---------------------------------------------------------------- */
    parede: function (opts) {
      opts = opts || {};
      if (!B) return { ok: false, motivo: "Catálogo de blocos não carregado." };
      var famId = opts.familia || "39-14";
      var fam = B.familia(famId);
      if (!fam) return { ok: false, motivo: "Família de bloco desconhecida." };

      var L = num(opts.comprimento), H = num(opts.altura);
      if (!(L > 0)) return { ok: false, motivo: "O comprimento da parede tem que ser maior que zero." };
      if (!(H > 0)) return { ok: false, motivo: "A altura da parede tem que ser maior que zero." };

      var j = opts.junta != null ? num(opts.junta) : B.JUNTA_PADRAO;
      var bordas = opts.bordas != null ? Math.max(0, Math.min(2, Math.round(num(opts.bordas)))) : 1;
      var comCinta = opts.cinta !== false;
      var comVerga = opts.verga !== false;
      var comContra = opts.contraverga !== false;
      var apoio = opts.apoioVerga != null ? num(opts.apoioVerga) : this.APOIO_VERGA;

      var hFiada = 0.19 + j;
      var nFiadas = B.fiadas(H, j);
      if (!(nFiadas > 0)) return { ok: false, motivo: "Altura insuficiente para uma fiada." };

      var avisos = [], vaos = [];
      (opts.vaos || []).forEach(function (v, i) {
        var o = { i: i, nome: v.nome || (v.tipo === "porta" ? "Porta" : "Janela") + " " + (i + 1),
                  tipo: v.tipo === "porta" ? "porta" : "janela",
                  x: num(v.x), y: v.tipo === "porta" ? 0 : num(v.y), l: num(v.l), a: num(v.a) };
        if (!(o.l > 0) || !(o.a > 0)) { avisos.push("Vão " + o.nome + " ignorado: largura ou altura zerada."); return; }
        if (o.x < -1e-9 || o.x + o.l > L + 1e-9) { avisos.push("Vão " + o.nome + " cai fora da parede — ignorado."); return; }
        /* A checagem horizontal existia; a vertical não. Uma janela cujo
           peitoril mais a altura passa do topo descontava do quantitativo
           uma área que está no ar. */
        if (o.y < -1e-9 || o.y + o.a > H + 1e-9) {
          avisos.push("Vão " + o.nome + " passa do topo da parede (" + r3(o.y + o.a) + " m contra " +
                      r3(H) + " m) — ignorado. Confira o peitoril e a altura.");
          return;
        }
        /* ENCAIXE NA FIADA.
           O corte da fiada pelo vão é tudo-ou-nada: se o vão encosta um
           milímetro na faixa da fiada, a faixa inteira sai. Um vão fora
           de módulo apagava assim uma faixa de 19 cm de alvenaria que
           existe — sumia do desenho e da conta, sem um aviso. Em
           alvenaria de bloco o vão É modular; então o motor encaixa e
           DIZ que encaixou, em vez de apagar em silêncio. */
        var yF = Math.round(o.y / hFiada) * hFiada;
        var topoF = Math.round((o.y + o.a) / hFiada) * hFiada;
        if (topoF <= yF + 1e-9) topoF = yF + hFiada;
        if (topoF > H + 1e-9) { topoF = Math.floor(H / hFiada) * hFiada; }
        var dy = Math.abs(yF - o.y), dh = Math.abs((topoF - yF) - o.a);
        if (dy > 0.001 || dh > 0.001) {
          avisos.push("Vão " + o.nome + " ajustado para a fiada: peitoril " + r3(o.y) + " → " + r3(yF) +
            " m e altura " + r3(o.a) + " → " + r3(topoF - yF) + " m. Em alvenaria de bloco o vão é modular — " +
            "a fiada não se corta pela metade.");
        }
        o.yPedido = o.y; o.aPedido = o.a;
        o.y = r4(yF); o.a = r4(topoF - yF);
        if (!(o.a > 0)) { avisos.push("Vão " + o.nome + " não cabe em nenhuma fiada — ignorado."); return; }
        vaos.push(o);
      });
      /* dois vãos sobrepostos descontariam área duas vezes */
      for (var a1 = 0; a1 < vaos.length; a1++) {
        for (var b1 = a1 + 1; b1 < vaos.length; b1++) {
          var A = vaos[a1], Bv = vaos[b1];
          if (A.x < Bv.x + Bv.l - 1e-6 && Bv.x < A.x + A.l - 1e-6 &&
              A.y < Bv.y + Bv.a - 1e-6 && Bv.y < A.y + A.a - 1e-6) {
            avisos.push("Os vãos " + A.nome + " e " + Bv.nome + " se sobrepõem — junte os dois num vão só.");
          }
        }
      }

      /* ---- qual fiada leva verga / contraverga / cinta ---- */
      var fVerga = {}, fContra = {};
      vaos.forEach(function (v) {
        if (comVerga) {
          /* a verga é a primeira fiada CUJA BASE está no topo do vão ou acima */
          var f = Math.ceil((v.y + v.a) / hFiada - 1e-6);
          if (f >= 0 && f < nFiadas) { (fVerga[f] = fVerga[f] || []).push(v); }
          else avisos.push("A verga de " + v.nome + " cairia acima da última fiada — confira a altura do vão.");
        }
        if (comContra && v.tipo === "janela" && v.y > 0.01) {
          var fc = Math.floor(v.y / hFiada + 1e-6) - 1;
          if (fc >= 0) (fContra[fc] = fContra[fc] || []).push(v);
          else avisos.push("A contraverga de " + v.nome + " cairia abaixo da primeira fiada — o peitoril está muito baixo.");
        }
      });

      /* ---- monta fiada por fiada ---- */
      var fiadas = [], semPesoIds = [], perdidas = [];
      for (var f = 0; f < nFiadas; f++) {
        var yB = r4(f * hFiada);
        var ehCinta = comCinta && f === nFiadas - 1;
        var livres = [[0, L]];
        vaos.forEach(function (v) {
          /* o vão só corta a fiada se realmente atravessa a faixa dela */
          if (v.y < yB + 0.19 - TOL && v.y + v.a > yB + TOL) livres = subtrair(livres, v.x, v.x + v.l);
        });

        var itens = [], juntaFiada = 0, notasFiada = [];
        for (var s = 0; s < livres.length; s++) {
          var iv = livres[s];
          /* Só a ponta que encosta em parede transversal carrega junta de
             topo. A ombreira do vão não é encontro: ali a fiada termina
             na peça. Contar junta de topo no vão daria à parede alguns
             milímetros a mais por fiada, e o desenho não fecharia. */
          var tocaEsq = iv[0] <= 1e-6, tocaDir = iv[1] >= L - 1e-6;
          var bTrecho = (tocaEsq && bordas >= 1 ? 1 : 0) + (tocaDir && bordas >= 2 ? 1 : 0);
          var res = this._trecho(iv[0], iv[1], famId, j, bTrecho, f % 2 === 1, yB);
          if (res.aviso) avisos.push("Fiada " + (f + 1) + ": " + res.aviso);
          /* a junta EXECUTADA nesta fiada pode não ser a pedida: o motor
             abre ou fecha dentro da faixa para a fiada fechar. Quem lê o
             desenho precisa desse número, e o teste também. */
          if (res.junta != null && res.junta > juntaFiada) juntaFiada = res.junta;
          if (res.nota) notasFiada.push(res.nota);
          itens = itens.concat(res.itens);
        }

        /* ---- converte em canaleta o que precisa ---- */
        var alvos = [];
        if (ehCinta) alvos.push({ a: 0, b: L, motivo: "cinta", nome: "Cinta de amarração" });
        (fVerga[f] || []).forEach(function (v) { alvos.push({ a: v.x - apoio, b: v.x + v.l + apoio, motivo: "verga", nome: "Verga de " + v.nome, vao: v }); });
        (fContra[f] || []).forEach(function (v) { alvos.push({ a: v.x - apoio, b: v.x + v.l + apoio, motivo: "contraverga", nome: "Contraverga de " + v.nome, vao: v }); });

        var self = this;
        alvos.forEach(function (al) {
          var idx = [];
          itens.forEach(function (it, i) {
            if (it.x < al.b - 1e-6 && it.x + it.l > al.a + 1e-6) idx.push(i);
          });
          if (!idx.length) {
            if (al.motivo !== "cinta") avisos.push(al.nome + ": não sobrou alvenaria nesta fiada para apoiar — confira o vão.");
            return;
          }
          /* Escolher por INTERSEÇÃO deixa o apoio curto: basta a peça
             vizinha terminar rente ao ponto do apoio para ela ficar de
             fora, e o apoio sai 1 cm menor que o pedido. Canaleta não se
             corta no meio para ganhar 1 cm — então a verga CRESCE até
             cobrir o apoio inteiro, e o número que sai é o executado.
             Só não atravessa vão: peças de outro trecho não contam. */
          var i0 = idx[0], i1 = idx[idx.length - 1];
          function contiguo(a, b) { return b.x - (a.x + a.l) <= j * 1.6 + 1e-6; }
          while (i0 > 0 && itens[i0].x > al.a + 1e-6 && contiguo(itens[i0 - 1], itens[i0])) i0--;
          while (i1 < itens.length - 1 && itens[i1].x + itens[i1].l < al.b - 1e-6 && contiguo(itens[i1], itens[i1 + 1])) i1++;
          var tocou = itens.slice(i0, i1 + 1);
          var esq = tocou[0].x, dir = tocou[tocou.length - 1].x + tocou[tocou.length - 1].l;
          tocou.forEach(function (it) {
            if (it.corte) { it.grupo = al.motivo; it.grupoNome = al.nome; return; }
            var can = canaletaDe(famId, it.l, "canaleta-u");
            if (!can) {
              if (perdidas.indexOf(famId + ":" + r3(it.l)) < 0) perdidas.push(famId + ":" + r3(it.l));
              it.grupo = al.motivo; it.grupoNome = al.nome; it.semCanaleta = true;
              return;
            }
            it.id = can.id; it.nome = can.nome; it.papel = can.papel;
            it.peso = B.pesoDe(can.id);
            it.material = "canaleta";
            it.grupo = al.motivo; it.grupoNome = al.nome;
          });
          if (al.vao) {
            al.apoioEsq = r3(al.vao.x - esq);
            al.apoioDir = r3(dir - (al.vao.x + al.vao.l));
            if (al.apoioEsq < apoio - 0.005 || al.apoioDir < apoio - 0.005) {
              avisos.push(al.nome + ": o apoio ficou em " + Math.round(Math.min(al.apoioEsq, al.apoioDir) * 100) +
                " cm, abaixo dos " + Math.round(apoio * 100) + " cm pedidos — o vão está muito perto da ponta da parede.");
            }
          }
        });

        itens.forEach(function (it) { if (it.peso == null && it.id && semPesoIds.indexOf(it.id) < 0) semPesoIds.push(it.id); });
        fiadas.push({ n: f + 1, y: yB, altura: 0.19, cinta: ehCinta, itens: itens, grupos: alvos,
                      junta: r4(juntaFiada || j), juntaAjustada: Math.abs((juntaFiada || j) - j) > 1e-6,
                      notas: notasFiada });
      }

      if (perdidas.length) {
        avisos.push("Nesta família não existe canaleta do comprimento de alguma peça da verga/cinta — essas peças ficaram como bloco comum no desenho e no peso. Confira com o fornecedor.");
      }

      /* ---- resumo por peça ---- */
      var mapa = {}, peso = 0, pesoCorte = 0, semPeso = 0, cortes = 0, compCorte = 0;
      fiadas.forEach(function (fi) {
        fi.itens.forEach(function (it) {
          if (it.corte) {
            cortes++; compCorte += it.l;
            if (it.peso != null) { peso += it.peso; pesoCorte += it.peso; }
            return;
          }
          if (!mapa[it.id]) {
            var o = B.origemDoPeso(it.id);
            mapa[it.id] = { id: it.id, nome: it.nome, papel: it.papel, comprimento: r3(it.l), qtd: 0,
                            peso: it.peso, origem: o.fonte, selo: o.rotulo, fabricante: o.fabricante,
                            confianca: o.confianca, faixa: o.faixa, formula: o.formula };
          }
          mapa[it.id].qtd++;
          if (it.peso == null) semPeso++; else peso += it.peso;
        });
      });
      var resumo = [];
      for (var k in mapa) if (Object.prototype.hasOwnProperty.call(mapa, k)) resumo.push(mapa[k]);
      resumo.sort(function (x, y) { return y.qtd - x.qtd; });

      /* ÁREA: bruta, de vão e líquida — é o que vai para o SINAPI.
         A altura que conta é a REAL (número inteiro de fiadas), não a
         digitada. A fiada não se corta pela metade: quem pede 2,70 m com
         fiada de 20 cm constrói 2,80 m. Medir a área pelo 2,70 e desenhar
         14 fiadas é ter dois números diferentes para a mesma parede — e
         quem compra pelo menor fica sem bloco. */
      var alturaReal = r4(nFiadas * hFiada);
      if (Math.abs(alturaReal - H) > 0.005) {
        avisos.push("A parede fecha em " + alturaReal.toFixed(2).replace(".", ",") + " m com " + nFiadas +
          " fiadas — você pediu " + num(H).toFixed(2).replace(".", ",") + " m. A fiada não se corta pela metade; " +
          "os números abaixo são da altura construída.");
      }
      var areaBruta = L * alturaReal, areaVao = 0;
      vaos.forEach(function (v) { areaVao += v.l * v.a; });
      var areaLiq = Math.max(0, areaBruta - areaVao);

      var porGrupo = { bloco: 0, canaleta: 0, corte: 0 };
      fiadas.forEach(function (fi) {
        fi.itens.forEach(function (it) {
          if (it.corte) porGrupo.corte++;
          else if (it.material === "canaleta") porGrupo.canaleta++;
          else porGrupo.bloco++;
        });
      });

      return {
        ok: true,
        familia: famId, familiaRotulo: fam.rotulo,
        comprimento: r4(L), altura: r4(H), junta: r4(j), bordas: bordas,
        nFiadas: nFiadas, alturaFiada: r4(hFiada), alturaReal: alturaReal, alturaPedida: r4(H),
        fiadas: fiadas, vaos: vaos,
        resumo: resumo,
        contagem: porGrupo,
        cortes: cortes, comprimentoCortado: r3(compCorte),
        /* comprar: o corte gasta um bloco inteiro, sempre */
        blocosAComprar: porGrupo.bloco + porGrupo.canaleta + cortes,
        area: { bruta: r4(areaBruta), vaos: r4(areaVao), liquida: r4(areaLiq),
                vaosPct: areaBruta > 0 ? Math.round(areaVao / areaBruta * 1000) / 10 : 0 },
        peso: r3(peso), pesoDeCortes: r3(pesoCorte),
        pecasSemPeso: semPeso, pecasSemPesoIds: semPesoIds,
        pesosVersao: B.PESOS_REF_VERSAO,
        parcial: semPeso > 0,
        escopoDoPeso: "blocos, canaletas, verga, contraverga e cinta. NÃO inclui a argamassa de assentamento, o graute dos furos cheios nem a armadura.",
        avisos: avisos
      };
    },

    /* ----------------------------------------------------------------
     * UM TRECHO CONTÍNUO DE UMA FIADA.
     *
     * `bordas` conta quantas PONTAS do trecho encostam em parede
     * transversal. A junta desse encontro está dentro da cota — é por
     * isso que 4,00 m de projeto modular fecha exato, e 3,99 não.
     * Convenção: a primeira junta de topo fica na ponta ESQUERDA, a
     * segunda na direita.
     * ---------------------------------------------------------------- */
    _trecho: function (x0, x1, famId, j, bordas, deslocar, yB) {
      var comp = x1 - x0;
      var itens = [], aviso = "";
      var meio = B.peca(famId, "meio");

      /* fiada par começa com meio bloco: é isso que amarra a parede */
      var pref = [], tirado = 0;
      if (deslocar && meio && comp > meio.c + 2 * j + 0.05) {
        pref.push(meio);
        tirado = meio.c + j;
      }

      var res = B.modularFiada(comp - tirado, famId, { junta: j, bordas: bordas });
      if (!res.ok) return { itens: [], aviso: res.motivo };

      /* A JUNTA QUE VALE É A QUE O MOTOR RESOLVEU, não a que foi pedida.
         A primeira saída do modularFiada quando a fiada não fecha é abrir
         ou fechar a junta dentro da faixa aceitável — é o que o pedreiro
         experiente faz no olho, e ele devolve isso em res.junta. Assentar
         com a junta NOMINAL depois disso põe as peças alguns milímetros
         fora do lugar a cada bloco: com dez blocos o erro vira um
         centímetro, a última peça passa da parede ou entra no vão, e o
         motor ainda inventa um "corte na obra" para tapar a diferença
         que ele mesmo criou. */
      var jj = res.junta > 0 ? res.junta : j;
      if (pref.length && Math.abs(jj - j) > 1e-9) {
        /* o meio-bloco da amarração também assenta com a junta ajustada */
        var res2 = B.modularFiada(comp - (meio.c + jj), famId, { junta: j, bordas: bordas });
        if (res2.ok) { res = res2; jj = res2.junta > 0 ? res2.junta : jj; }
      }
      var jEsq = bordas >= 1 ? jj : 0;
      var jDir = bordas >= 2 ? jj : 0;
      var x = x0 + jEsq;

      /* Expande a lista agregada em peças e decide a ORDEM.
         Meio bloco pode fechar a ponta — em amarração é justamente ali
         que ele vai. Compensador, não: canto de parede é lugar de peça
         inteira, e um pedaço de 9 cm na quina é defeito de execução.
         Por isso o compensador vai para o MEIO do trecho. */
      var inteiros = [], meios = [], comps = [];
      res.pecas.forEach(function (p) {
        var pc = B.pecaPorId(p.id) || p;
        for (var i = 0; i < p.qtd; i++) {
          if (p.papel === "inteiro") inteiros.push(pc);
          else if (p.papel === "meio") meios.push(pc);
          else comps.push(pc);
        }
      });
      var meioIdx = Math.floor(inteiros.length / 2);
      var seq = pref.concat(
        inteiros.slice(0, meioIdx), comps, inteiros.slice(meioIdx), meios
      );

      seq.forEach(function (p) {
        itens.push({
          x: r4(x), y: yB, l: r4(p.c), altura: p.a != null ? p.a : 0.19,
          id: p.id, nome: p.nome, papel: p.papel,
          peso: B.pesoDe(p.id), material: "bloco", corte: false
        });
        x = r4(x + p.c + jj);
      });

      /* Não fechou: entra o corte na obra. O comprimento sai da GEOMETRIA
         que sobrou até a borda do trecho, não do resto abstrato — assim o
         desenho fecha por construção e o número é o que o pedreiro mede.
         O `x` do laço já avançou uma junta DEPOIS da última peça, e essa
         junta só existe se vier outra peça atrás. Medir a partir dele
         acusava 10 mm de estouro em toda fiada de uma parede que fecha
         exata — quatorze avisos vermelhos numa prancha correta. */
      var fimUltima = itens.length ? (itens[itens.length - 1].x + itens[itens.length - 1].l) : (x0 + jEsq);
      var fim = x1 - jDir;
      var lc = r4(fim - fimUltima - (itens.length ? jj : 0));

      /* SOBRA PEQUENA NÃO É PEÇA.
         Uma folga de 1, 2 ou 3 cm não vira bloco: nenhum catálogo tem
         peça abaixo de 4 cm, e o pedreiro absorve isso abrindo um fio a
         mais nas juntas. Materializar essa folga como "corte na obra"
         enchia o desenho de lascas e — pior — cobrava CADA UMA como um
         bloco inteiro na hora de comprar. */
      var MENOR_PECA = 0.04;
      if (lc > TOL && lc < MENOR_PECA && itens.length > 1) {
        var nJ = itens.length - 1 + (bordas >= 1 ? 1 : 0) + (bordas >= 2 ? 1 : 0);
        var soma = 0;
        itens.forEach(function (it) { soma += it.l; });
        /* a junta que fecha o trecho EXATAMENTE — o desenho não pode ficar
           com um vão de 3 cm no fim da fiada */
        var jNovo = nJ > 0 ? (comp - soma) / nJ : jj;
        var xx = x0 + (bordas >= 1 ? jNovo : 0);
        itens.forEach(function (it) { it.x = r4(xx); xx = r4(xx + it.l + jNovo); });
        /* Passar da junta máxima é decisão de obra, não detalhe: quem
           executa precisa saber que a fiada só fecha abrindo a junta além
           do aceitável — e que a saída é acertar o comprimento da parede. */
        if (jNovo > B.JUNTA_MAX + 1e-9) {
          aviso = "a fiada só fecha com junta de " + Math.round(jNovo * 1000) + " mm, acima dos " +
                  Math.round(B.JUNTA_MAX * 1000) + " mm aceitáveis. Ajuste o comprimento da parede " +
                  "para um múltiplo do módulo.";
        }
        return { itens: itens, aviso: aviso, fiada: res, junta: r4(jNovo),
                 nota: "folga de " + Math.round(lc * 1000) + " mm distribuída nas juntas (" +
                       Math.round(jNovo * 1000) + " mm)" };
      }

      if (lc >= MENOR_PECA) {
        x = r4(fimUltima + jj);
        var base = B.peca(famId, "inteiro");
        var kg = base && B.pesoDe(base.id) != null ? B.pesoDe(base.id) * (lc / base.c) : null;
        itens.push({
          x: r4(x), y: yB, l: lc, altura: 0.19,
          id: null, nome: "Corte na obra (" + Math.round(lc * 1000) + " mm)", papel: "recorte",
          peso: kg != null ? r3(kg) : null, material: "bloco", corte: true,
          notaPeso: "peso proporcional ao comprimento; na compra gasta um bloco inteiro"
        });
      } else if (fim - fimUltima < -TOL) {
        /* aqui é estouro DE VERDADE: a última peça passou da borda */
        aviso = "o trecho de " + r3(comp) + " m estourou " + Math.round((fimUltima - fim) * 1000) +
                " mm — a peça passa da parede. Confira a junta e o comprimento.";
      }
      return { itens: itens, aviso: aviso, fiada: res };
    },

    /* ----------------------------------------------------------------
     * A PRANCHA — cada tipo de peça com a SUA hachura.
     *
     * Hachura não é enfeite: é como o pedreiro sabe, olhando de longe,
     * que aquela peça ali não é o bloco comum. Por isso cada papel tem
     * um desenho próprio e a legenda repete o desenho, não só a cor.
     * (Quem imprime em preto e branco continua enxergando a diferença —
     * é o caso da obra.)
     * ---------------------------------------------------------------- */
    HACHURAS: [
      { papel: "inteiro",     rotulo: "Bloco inteiro",       fill: "#eef2f7", pat: null },
      { papel: "meio",        rotulo: "Meio bloco",          fill: "#dbeafe", pat: "diag" },
      { papel: "amarracao-l", rotulo: "Amarração L (canto)", fill: "#e0e7ff", pat: "cruz" },
      { papel: "amarracao-t", rotulo: "Amarração T",         fill: "#e0e7ff", pat: "cruz" },
      { papel: "compensador", rotulo: "Compensador",         fill: "#fef3c7", pat: "ponto" },
      { papel: "canaleta-u",  rotulo: "Canaleta U",          fill: "#dcfce7", pat: "canal" },
      { papel: "canaleta-j",  rotulo: "Canaleta J",          fill: "#d1fae5", pat: "canal" },
      { papel: "meia-altura", rotulo: "Meia altura",         fill: "#ede9fe", pat: "diag2" },
      { papel: "recorte",     rotulo: "Corte na obra",       fill: "#fee2e2", pat: "corte" }
    ],

    _hach: function (papel) {
      for (var i = 0; i < this.HACHURAS.length; i++) if (this.HACHURAS[i].papel === papel) return this.HACHURAS[i];
      return this.HACHURAS[0];
    },

    _defs: function () {
      return '<defs>' +
        '<pattern id="evDiag" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
          '<line x1="0" y1="0" x2="0" y2="7" stroke="#1d4ed8" stroke-width="1.2"/></pattern>' +
        '<pattern id="evDiag2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">' +
          '<line x1="0" y1="0" x2="0" y2="7" stroke="#6d28d9" stroke-width="1.2"/></pattern>' +
        '<pattern id="evCruz" width="8" height="8" patternUnits="userSpaceOnUse">' +
          '<path d="M0 0 L8 8 M8 0 L0 8" stroke="#4338ca" stroke-width="1"/></pattern>' +
        '<pattern id="evPonto" width="5" height="5" patternUnits="userSpaceOnUse">' +
          '<circle cx="2.5" cy="2.5" r="1.15" fill="#b45309"/></pattern>' +
        '<pattern id="evCanal" width="10" height="9" patternUnits="userSpaceOnUse">' +
          '<line x1="0" y1="2.2" x2="10" y2="2.2" stroke="#15803d" stroke-width="1.5"/>' +
          '<line x1="0" y1="6.6" x2="10" y2="6.6" stroke="#15803d" stroke-width="1.5"/></pattern>' +
        '<pattern id="evCorte" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
          '<line x1="0" y1="0" x2="0" y2="6" stroke="#dc2626" stroke-width="1.6"/></pattern>' +
        '</defs>';
    },

    _url: function (pat) {
      return { diag: "url(#evDiag)", diag2: "url(#evDiag2)", cruz: "url(#evCruz)",
               ponto: "url(#evPonto)", canal: "url(#evCanal)", corte: "url(#evCorte)" }[pat] || null;
    },

    svg: function (res, opts) {
      opts = opts || {};
      if (!res || !res.ok) return "";
      var self = this;
      var larg = opts.largura || 940;
      var mgE = 62, mgD = 30, mgT = 54, mgB = 92;
      var esc = (larg - mgE - mgD) / Math.max(res.comprimento, 0.001);
      var altDes = res.alturaReal * esc;
      var alt = altDes + mgT + mgB;
      function X(v) { return mgE + v * esc; }
      function Y(v) { return mgT + altDes - v * esc; }

      var h = '<svg data-desenho="elevacao" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + larg + " " + Math.round(alt) +
              '" width="100%" style="max-width:' + larg + 'px;background:#fff">' + this._defs();

      /* fiadas */
      res.fiadas.forEach(function (fi) {
        fi.itens.forEach(function (it) {
          var hh = self._hach(it.papel);
          var x = X(it.x), y = Y(it.y + it.altura), w = it.l * esc, hp = it.altura * esc;
          h += '<rect x="' + r3(x) + '" y="' + r3(y) + '" width="' + r3(w) + '" height="' + r3(hp) +
               '" fill="' + hh.fill + '" stroke="#1f2937" stroke-width="0.8"/>';
          var u = self._url(hh.pat);
          if (u) h += '<rect x="' + r3(x) + '" y="' + r3(y) + '" width="' + r3(w) + '" height="' + r3(hp) + '" fill="' + u + '" opacity="0.5"/>';
          /* peça larga o bastante ganha o comprimento escrito dentro */
          if (w > 26 && hp > 11) {
            h += '<text x="' + r3(x + w / 2) + '" y="' + r3(y + hp / 2 + 3.6) + '" text-anchor="middle" font-family="Arial" font-size="' +
                 (w > 40 ? 9.5 : 8) + '" fill="#334155">' + Math.round(it.l * 100) + "</text>";
          }
        });
        /* número da fiada, à esquerda */
        h += '<text x="' + (mgE - 8) + '" y="' + r3(Y(fi.y) - 3) + '" text-anchor="end" font-family="Arial" font-size="10" fill="#64748b">' + fi.n + "</text>";
      });

      /* vãos */
      res.vaos.forEach(function (v) {
        var x = X(v.x), y = Y(v.y + v.a), w = v.l * esc, hp = v.a * esc;
        h += '<rect x="' + r3(x) + '" y="' + r3(y) + '" width="' + r3(w) + '" height="' + r3(hp) +
             '" fill="#ffffff" stroke="#0f172a" stroke-width="1.6" stroke-dasharray="6 4"/>';
        h += '<text x="' + r3(x + w / 2) + '" y="' + r3(y + hp / 2) + '" text-anchor="middle" font-family="Arial" font-size="11.5" fill="#0f172a">' +
             esc0(v.nome) + "</text>";
        h += '<text x="' + r3(x + w / 2) + '" y="' + r3(y + hp / 2 + 15) + '" text-anchor="middle" font-family="Arial" font-size="10.5" fill="#475569">' +
             fmt(v.l) + " × " + fmt(v.a) + (v.tipo === "janela" ? " · peitoril " + fmt(v.y) : "") + "</text>";
      });

      /* contorno + cotas */
      h += '<rect x="' + X(0) + '" y="' + Y(res.alturaReal) + '" width="' + r3(res.comprimento * esc) +
           '" height="' + r3(altDes) + '" fill="none" stroke="#0f172a" stroke-width="2.2"/>';
      var yc = mgT + altDes + 26;
      h += '<line x1="' + X(0) + '" y1="' + yc + '" x2="' + X(res.comprimento) + '" y2="' + yc + '" stroke="#0f172a" stroke-width="1"/>';
      h += '<text x="' + ((X(0) + X(res.comprimento)) / 2) + '" y="' + (yc - 5) + '" text-anchor="middle" font-family="Arial" font-size="12" fill="#0f172a">' +
           fmt(res.comprimento) + " m</text>";
      var xc = mgE - 34;
      h += '<line x1="' + xc + '" y1="' + Y(0) + '" x2="' + xc + '" y2="' + Y(res.alturaReal) + '" stroke="#0f172a" stroke-width="1"/>';
      h += '<text x="' + (xc - 4) + '" y="' + ((Y(0) + Y(res.alturaReal)) / 2) + '" text-anchor="middle" font-family="Arial" font-size="12" fill="#0f172a" transform="rotate(-90 ' +
           (xc - 4) + " " + ((Y(0) + Y(res.alturaReal)) / 2) + ')">' + fmt(res.alturaReal) + " m · " + res.nFiadas + " fiadas</text>";

      /* legenda — só o que aparece nesta parede */
      var usados = {};
      res.fiadas.forEach(function (fi) { fi.itens.forEach(function (it) { usados[it.papel] = (usados[it.papel] || 0) + 1; }); });
      var lx = mgE, ly = mgT + altDes + 48;
      this.HACHURAS.forEach(function (hh) {
        if (!usados[hh.papel]) return;
        h += '<rect x="' + lx + '" y="' + ly + '" width="20" height="13" fill="' + hh.fill + '" stroke="#1f2937" stroke-width="0.8"/>';
        var u = self._url(hh.pat);
        if (u) h += '<rect x="' + lx + '" y="' + ly + '" width="20" height="13" fill="' + u + '" opacity="0.5"/>';
        h += '<text x="' + (lx + 25) + '" y="' + (ly + 10.5) + '" font-family="Arial" font-size="10.5" fill="#334155">' +
             esc0(hh.rotulo) + " (" + usados[hh.papel] + ")</text>";
        lx += 42 + hh.rotulo.length * 5.6 + 22;
        if (lx > larg - 150) { lx = mgE; ly += 19; }
      });

      h += '<text x="' + mgE + '" y="' + (mgT - 30) + '" font-family="Arial" font-size="13.5" fill="#0f172a" font-weight="bold">' +
           esc0(opts.titulo || "Elevação de parede") + "</text>";
      h += '<text x="' + mgE + '" y="' + (mgT - 14) + '" font-family="Arial" font-size="11" fill="#475569">' +
           esc0(res.familiaRotulo) + " · junta " + Math.round(res.junta * 1000) + " mm · " +
           res.blocosAComprar + " peças a comprar · área líquida " + fmt(res.area.liquida) + " m²" +
           (res.area.vaos > 0 ? " (vãos descontam " + res.area.vaosPct + " %)" : "") + "</text>";
      h += "</svg>";
      return h;

      function fmt(v) { return num(v).toFixed(2).replace(".", ","); }
      function esc0(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    }
  };

  global.Elevacao = Elevacao;
  if (typeof module !== "undefined" && module.exports) module.exports = Elevacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
