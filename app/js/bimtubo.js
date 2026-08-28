/* =====================================================================
 * bimtubo.js — NUMERAR A REDE SEGUINDO O ENCADEAMENTO, e dizer o que
 * entra em cada ponta de cada tubo.
 *
 * PARA QUE SERVE: o encanador leva a lista, pega o tubo já numerado e já
 * cortado, e só cola. Cada linha diz o comprimento e qual peça vai em cada
 * extremidade.
 *
 * ⚠ ESTE MOTOR NÃO INVENTA NEM CALCULA NADA. Ele recebe o comprimento que o
 *   IFC publicou e a topologia que o IFC publicou (IfcDistributionPort +
 *   IfcRelConnectsPorts + IfcRelConnectsPortToElement). Onde o arquivo não
 *   declara, a saída DIZ que não declara — nunca deduz vizinho por
 *   proximidade geométrica.
 *
 * ⚠ E NÃO É A MESMA LISTA DAS ETIQUETAS DA TELA. O índice do rótulo descarta
 *   tubo abaixo de 30 cm porque a etiqueta ficaria maior que a peça. Medido
 *   no projeto hidrossanitário real: isso são 732 dos 1.725 tubos — 42,4%.
 *   Reaproveitar aquele índice aqui entregaria uma folha com 993 tubos e
 *   1.580,55 m sob um cabeçalho dizendo 1.725 e 1.667,20 m; e pior, quebraria
 *   o encadeamento — R01-T013 seguido de R01-T015 com uma peça de 17 cm
 *   entre os dois na parede. Filtro de estética não decide papel de obra.
 *
 * ⚠ O GRAFO TEM CICLO. O ramal principal do arquivo real tem 2.837 peças e
 *   2.897 arestas — 61 a mais que uma árvore. Por isso o percurso é DFS com
 *   marca de visitado, e NÃO um cálculo de sub-árvore (que só existe em
 *   árvore enraizada e aqui seria circular).
 *
 * ⚠ E TUBO NUNCA É VIZINHO DE TUBO. Entre dois tubos há sempre uma conexão:
 *   das peças com três ou mais ligações, 100% são conexão, nenhuma é tubo.
 *   Por isso a coluna do vizinho se chama "anterior/seguinte NA SEQUÊNCIA" —
 *   é a ordem do percurso, não vizinhança física. Quem é fisicamente vizinho
 *   está nas colunas de conexão.
 * ===================================================================== */
(function (global) {
  "use strict";

  var TUBO = { IFCFLOWSEGMENT: 1, IFCPIPESEGMENT: 1, IFCDUCTSEGMENT: 1 };

  function ehTubo(p) { return !!(p && TUBO[String(p.tipo || '').toUpperCase()]); }
  /* ⚠ ordenar SEMPRE por chave explícita. Percorrer `Object.keys` cru amarra
     a numeração à ordem de inserção do motor de JS — o mesmo IFC daria
     números diferentes conforme o caminho de leitura. */
  function porId(a, b) { return (a.id || 0) - (b.id || 0) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0); }

  /* Adjacência peça↔peça, derivada das portas. */
  function adjacencia(topo) {
    var adj = {};
    function lig(a, b) {
      if (!a || !b || a === b) return;
      (adj[a] = adj[a] || {})[b] = 1;
      (adj[b] = adj[b] || {})[a] = 1;
    }
    Object.keys(topo.ligacao || {}).forEach(function (pa) {
      var pb = topo.ligacao[pa];
      lig(topo.portaDe[pa], topo.portaDe[pb]);
    });
    return adj;
  }

  /* Componentes conexos ("ramais"). */
  function componentes(adj, pecas) {
    var vistos = {}, comps = [];
    Object.keys(adj).sort(function (a, b) {
      return porId(pecas[a] || { uid: a }, pecas[b] || { uid: b });
    }).forEach(function (ini) {
      if (vistos[ini]) return;
      var pilha = [ini], comp = [];
      vistos[ini] = 1;
      while (pilha.length) {
        var x = pilha.pop(); comp.push(x);
        Object.keys(adj[x] || {}).forEach(function (y) {
          if (!vistos[y]) { vistos[y] = 1; pilha.push(y); }
        });
      }
      comps.push(comp);
    });
    return comps;
  }

  /* De onde começa o ramal — e a regra usada fica REGISTRADA, porque em 27%
     das portas o IFC declara SOURCEANDSINK, ou seja, não diz o sentido. Aí a
     origem é arbitrária e a folha tem de dizer isso em vez de fingir que o
     projeto mandou começar ali. */
  function origemDe(comp, adj, pecas, topo) {
    var pontas = comp.filter(function (u) { return Object.keys(adj[u] || {}).length === 1; });
    var ordena = function (l) {
      return l.slice().sort(function (a, b) { return porId(pecas[a] || { uid: a }, pecas[b] || { uid: b }); });
    };
    var fonte = ordena(pontas).filter(function (u) {
      return (topo.portasDe[u] || []).some(function (p) { return topo.dirPorta[p] === 'SOURCE'; });
    });
    if (fonte.length) return { uid: fonte[0], regra: 'origem declarada pelo IFC (porta de saída)' };
    if (pontas.length) return { uid: ordena(pontas)[0], regra: 'arbitrária — ponta do ramal, sem sentido declarado' };
    return { uid: ordena(comp)[0], regra: 'arbitrária — ramal em anel, sem ponta' };
  }

  /* Percurso: caminha o ramal como quem segue o tubo. DFS com marca de
     visitado — é o que aguenta o ciclo sem entrar em laço nem pular trecho. */
  function percorrer(comp, ini, adj, pecas) {
    var dentro = {}, vis = {}, ordem = [], pilha = [ini];
    comp.forEach(function (u) { dentro[u] = 1; });
    vis[ini] = 1;
    while (pilha.length) {
      var x = pilha.pop(); ordem.push(x);
      var viz = Object.keys(adj[x] || {}).filter(function (y) { return dentro[y] && !vis[y]; })
        .sort(function (a, b) { return porId(pecas[a] || { uid: a }, pecas[b] || { uid: b }); });
      /* empilha ao contrário para a pilha desempilhar na ordem crescente */
      for (var i = viz.length - 1; i >= 0; i--) { vis[viz[i]] = 1; pilha.push(viz[i]); }
    }
    return ordem;
  }

  /* O que entra em cada ponta: porta do tubo → porta ligada → peça de lá. */
  function pontasDe(uid, topo, pecas) {
    var portas = (topo.portasDe[uid] || []).slice().sort();
    return portas.map(function (p) {
      var pv = topo.ligacao[p];
      var viz = pv != null ? topo.portaDe[pv] : null;
      var peca = viz ? pecas[viz] : null;
      return {
        porta: p,
        dir: topo.dirPorta[p] || '',
        vizinhoUid: viz || null,
        /* célula NUNCA vazia: em obra, vazio se lê como ponta livre */
        texto: !viz ? 'sem ligação publicada no IFC'
          : (peca && (peca.familia || peca.nome)) ? String(peca.familia || peca.nome)
            : 'extremidade não declarada'
      };
    });
  }

  function pad(n, k) { var s = String(n); while (s.length < k) s = '0' + s; return s; }

  /* =====================================================================
   * numerar(pecas, topo)
   *   pecas: { uid: { id, uid, tipo, nome, familia, sistema, pavimento,
   *                   L, compFonte } }   — L em metros, já do IFC
   *   topo:  { portaDe:{porta:uid}, ligacao:{porta:porta},
   *            portasDe:{uid:[porta]}, dirPorta:{porta:'SINK'|'SOURCE'|...} }
   * ===================================================================== */
  function numerar(pecas, topo) {
    topo = topo || {};
    topo.portaDe = topo.portaDe || {}; topo.ligacao = topo.ligacao || {};
    topo.portasDe = topo.portasDe || {}; topo.dirPorta = topo.dirPorta || {};

    var adj = adjacencia(topo);
    var comps = componentes(adj, pecas);

    /* ramais na ordem: mais tubos primeiro, depois mais metros, depois menor
       id — o último critério nunca empata, então a ordem é sempre a mesma */
    var info = comps.map(function (c) {
      var nT = 0, m = 0, menor = Infinity;
      c.forEach(function (u) {
        var p = pecas[u]; if (!p) return;
        if (p.id != null && p.id < menor) menor = p.id;
        if (ehTubo(p) && p.L > 0) { nT++; m += p.L; }
      });
      return { comp: c, tubos: nT, metros: m, menor: menor };
    }).filter(function (x) { return x.tubos > 0; });
    info.sort(function (a, b) { return (b.tubos - a.tubos) || (b.metros - a.metros) || (a.menor - b.menor); });

    var linhas = [], ramais = [], numDe = {};
    info.forEach(function (x, i) {
      var rot = 'R' + pad(i + 1, 2);
      var org = origemDe(x.comp, adj, pecas, topo);
      var ordem = percorrer(x.comp, org.uid, adj, pecas);
      var k = 0, doRamal = [];
      ordem.forEach(function (u) {
        var p = pecas[u];
        if (!ehTubo(p) || !(p.L > 0)) return;
        k++;
        var n = rot + '-T' + pad(k, 3);
        numDe[u] = n;
        doRamal.push({ n: n, uid: u, ordem: k, peca: p });
      });
      doRamal.forEach(function (r, j) {
        var pt = pontasDe(r.uid, topo, pecas);
        linhas.push({
          n: r.n, ramal: rot, ordem: r.ordem, uid: r.uid, id: r.peca.id,
          sistema: r.peca.sistema || '', familia: r.peca.familia || r.peca.nome || '',
          dn: r.peca.dnMm > 0 ? r.peca.dnMm : '',
          L: r.peca.L, compFonte: r.peca.compFonte || '',
          pavimento: r.peca.pavimento || '',
          antes: j > 0 ? doRamal[j - 1].n : '—',
          depois: j < doRamal.length - 1 ? doRamal[j + 1].n : '—',
          pontaA: pt[0] ? pt[0].texto : 'sem ligação publicada no IFC',
          pontaB: pt[1] ? pt[1].texto : 'sem ligação publicada no IFC',
          obs: pt.length > 2 ? (pt.length + ' portas neste trecho') : ''
        });
      });
      ramais.push({ ramal: rot, tubos: x.tubos, metros: x.metros, pecas: x.comp.length, origem: org.regra });
    });

    /* tubo com comprimento e SEM ligação publicada: não entra no encadeamento,
       mas não some — vai para a lista de avulsos, com o motivo escrito */
    var avulsos = [];
    Object.keys(pecas).sort(function (a, b) { return porId(pecas[a], pecas[b]); }).forEach(function (u) {
      var p = pecas[u];
      if (!ehTubo(p) || !(p.L > 0) || numDe[u]) return;
      avulsos.push({
        n: 'AVULSO-' + pad(avulsos.length + 1, 3), uid: u, id: p.id,
        sistema: p.sistema || '', familia: p.familia || p.nome || '',
        dn: p.dnMm > 0 ? p.dnMm : '',
        L: p.L, compFonte: p.compFonte || '', pavimento: p.pavimento || '',
        motivo: 'sem ligação publicada no IFC'
      });
    });

    var somaNum = 0; linhas.forEach(function (l) { somaNum += l.L; });
    var somaAv = 0; avulsos.forEach(function (l) { somaAv += l.L; });
    var totTubos = 0, totM = 0;
    Object.keys(pecas).forEach(function (u) {
      var p = pecas[u]; if (ehTubo(p) && p.L > 0) { totTubos++; totM += p.L; }
    });

    return {
      linhas: linhas, ramais: ramais, avulsos: avulsos,
      resumo: {
        tubosComComprimento: totTubos, metrosTotais: totM,
        numerados: linhas.length, metrosNumerados: somaNum,
        avulsos: avulsos.length, metrosAvulsos: somaAv,
        ramais: ramais.length,
        /* o balanço TEM de fechar; se não fechar, a folha está mentindo */
        fecha: (linhas.length + avulsos.length) === totTubos
      }
    };
  }

  global.BimTubo = { numerar: numerar, ehTubo: ehTubo, _adjacencia: adjacencia, _percorrer: percorrer, _origemDe: origemDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.BimTubo;
})(typeof window !== 'undefined' ? window : globalThis);
