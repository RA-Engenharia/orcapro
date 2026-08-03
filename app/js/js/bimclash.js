/* =====================================================================
 * bimclash.js — Motor de COMPATIBILIZAÇÃO / clash (PURO, sem DOM/Three).
 * Fase 3 do BIM: detecta interferências geométricas entre DISCIPLINAS
 * diferentes (ex.: tubo de instalação atravessando viga estrutural).
 *
 * Contrato viewer-agnóstico: recebe elementos
 *   [{ id, tipo|cat, aabb:{ min:[x,y,z], max:[x,y,z] } }]  (AABB em metros, no mundo)
 * e devolve os clashes. Broad-phase = sweep-and-prune no eixo X (corta pares
 * distantes); narrow-phase = sobreposição de AABB com folga (tolerância). Não
 * depende de Three/web-ifc: o viewer (js/bim.js) fornece os AABBs; a aba
 * Compatibilização (gestao.js) lista e dá zoom. Node-testável.
 *
 * Nota honesta de precisão: clash por AABB é o 1º nível (rápido, pega
 * interferências grosseiras entre volumes). Não é interseção triângulo-a-
 * triângulo — para peças oblíquas/vazadas pode haver falso-positivo; por isso
 * o resultado é rotulado "provável" e ordenado por penetração (pior primeiro).
 * ===================================================================== */
(function (global) {
  "use strict";

  // categoria de serviço (mesmos ids do Cronograma/BIM4D) -> disciplina de compatibilização
  // disciplina escolhida no painel multi-IFC (el.disciplina) tem PRIORIDADE sobre a inferida do tipo.
  // MEP SEPARADO (achado do gate v1.1.62): hidráulica, elétrica e mecânica são disciplinas
  // DISTINTAS no federado — tubo × eletroduto (o clash MEP mais comum) passa a ser detectado.
  // Na inferência por tipo IFC (arquivo único) continua "Instalações": o IFC não diz qual MEP é.
  var DISC_PAINEL = { estrutural: "Estrutura", arquitetura: "Arquitetura", hidraulica: "Hidráulica", eletrica: "Elétrica", mecanica: "Mecânica", outra: "Outros" };
  var CAT_DISC = {
    fundacao: "Estrutura", estrutura: "Estrutura",
    alvenaria: "Arquitetura", cobertura: "Arquitetura", revestimento: "Arquitetura",
    esquadrias: "Arquitetura", impermeabilizacao: "Arquitetura", pintura: "Arquitetura",
    instalacoes: "Instalações"
  };

  function num(x) { var n = +x; return isNaN(n) ? 0 : n; }
  function catDe(el) {
    if (el.cat) return el.cat;
    if (global.BIM4D && global.BIM4D.catDoTipo) return global.BIM4D.catDoTipo(el.tipo);
    return "outros";
  }

  var BIMClash = {
    CAT_DISC: CAT_DISC,

    // Disciplina a partir de um tipo IFC ("IFCWALL") OU de uma categoria ("alvenaria").
    disciplinaDe: function (tipoOuCat) {
      var k = String(tipoOuCat == null ? "" : tipoOuCat).toLowerCase();
      if (CAT_DISC[k]) return CAT_DISC[k];
      var cat = (global.BIM4D && global.BIM4D.catDoTipo) ? global.BIM4D.catDoTipo(tipoOuCat) : null;
      return (cat && CAT_DISC[cat]) || "Outros";
    },

    // Sobreposição de dois AABB {min:[x,y,z],max:[x,y,z]}. Devolve a caixa de
    // interseção { min, max, dim:[dx,dy,dz] } ou null. Exige penetração > tol nos
    // TRÊS eixos (interpenetração volumétrica real; encostar dentro da folga = null).
    overlap: function (a, b, tol) {
      tol = tol || 0;
      var min = [0, 0, 0], max = [0, 0, 0], dim = [0, 0, 0];
      for (var k = 0; k < 3; k++) {
        var lo = Math.max(a.min[k], b.min[k]), hi = Math.min(a.max[k], b.max[k]), d = hi - lo;
        if (d <= tol) return null;
        min[k] = lo; max[k] = hi; dim[k] = d;
      }
      return { min: min, max: max, dim: dim };
    },

    // Detecta clashes entre disciplinas diferentes.
    // opts: { tolerancia (m, default .005 = 5mm), mesmaDisciplina (bool, default false),
    //         limiarMedia (m, .05), limiarGrave (m, .20), pares (["Estrutura × Instalações", ...]) }
    // Retorna { clashes:[{aId,bId,discA,discB,par,penetracao,volume,severidade,centro}],
    //           total, porPar:{par->qtd}, severidade:{grave,media,leve}, elementos }.
    detectar: function (elementos, opts) {
      opts = opts || {};
      var tol = opts.tolerancia != null ? opts.tolerancia : 0.005;
      var incluirMesma = !!opts.mesmaDisciplina;
      var lMed = opts.limiarMedia != null ? opts.limiarMedia : 0.05;
      var lGrave = opts.limiarGrave != null ? opts.limiarGrave : 0.20;
      var filtroPares = (opts.pares && opts.pares.length) ? {} : null;
      if (filtroPares) opts.pares.forEach(function (p) { filtroPares[p] = 1; });

      // prepara: só elementos com AABB válido (min/max com 3 números)
      // disciplina do painel (el.disciplina) só vale no modo FEDERADO (2+ modelos):
      // num IFC único combinado ela é a MESMA p/ todo elemento do modelo e cegaria o
      // clash (falso "sem conflito") → com 1 modelo, infere por tipo elemento a elemento.
      var mids = {}, nMids = 0;
      (elementos || []).forEach(function (el) {
        if (el && el.mid != null && !mids[el.mid]) { mids[el.mid] = 1; nMids++; }
      });
      var usarPainel = nMids >= 2;
      var els = [];
      (elementos || []).forEach(function (el) {
        var bb = el && el.aabb;
        if (!bb || !bb.min || !bb.max || bb.min.length < 3 || bb.max.length < 3) return;
        els.push({ id: el.id, disc: (usarPainel && el.disciplina && DISC_PAINEL[el.disciplina]) || BIMClash.disciplinaDe(el.cat || el.tipo), cat: catDe(el),
          min: [num(bb.min[0]), num(bb.min[1]), num(bb.min[2])],
          max: [num(bb.max[0]), num(bb.max[1]), num(bb.max[2])] });
      });

      // broad-phase: sweep-and-prune no eixo X (ordena por min.x; mantém janela de ativos)
      els.sort(function (p, q) { return p.min[0] - q.min[0]; });
      var clashes = [], porPar = {}, ativos = [];
      for (var i = 0; i < els.length; i++) {
        var e = els[i], novos = [];
        // descarta dos ativos quem já terminou em X antes do começo de e (sem clash possível)
        for (var j = 0; j < ativos.length; j++) if (ativos[j].max[0] >= e.min[0] - tol) novos.push(ativos[j]);
        ativos = novos;
        for (var a = 0; a < ativos.length; a++) {
          var o = ativos[a];
          if (!incluirMesma && o.disc === e.disc) continue;
          var par = [o.disc, e.disc].sort().join(" × ");
          if (filtroPares && !filtroPares[par]) continue;
          var ov = BIMClash.overlap(o, e, tol);
          if (!ov) continue;
          var pen = Math.min(ov.dim[0], ov.dim[1], ov.dim[2]);
          var sev = pen >= lGrave ? "grave" : (pen >= lMed ? "media" : "leve");
          clashes.push({ aId: o.id, bId: e.id, discA: o.disc, discB: e.disc, par: par,
            penetracao: pen, volume: ov.dim[0] * ov.dim[1] * ov.dim[2], severidade: sev,
            centro: [(ov.min[0] + ov.max[0]) / 2, (ov.min[1] + ov.max[1]) / 2, (ov.min[2] + ov.max[2]) / 2],
            inter: { min: ov.min.slice(), max: ov.max.slice() } }); // caixa da interseção — o refino tri-a-tri filtra triângulos por ela
          porPar[par] = (porPar[par] || 0) + 1;
        }
        ativos.push(e);
      }
      clashes.sort(function (p, q) { return q.penetracao - p.penetracao; });
      var sevCount = { grave: 0, media: 0, leve: 0 };
      clashes.forEach(function (c) { sevCount[c.severidade]++; });
      return { clashes: clashes, total: clashes.length, porPar: porPar, severidade: sevCount, elementos: els.length };
    }
  };

  global.BIMClash = BIMClash;
  if (typeof module !== "undefined" && module.exports) module.exports = BIMClash;
  // global = window no browser; no Node (teste) usa o global real p/ enxergar o BIM4D já carregado.
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
