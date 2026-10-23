/* =====================================================================
 * eleauditor.js — AUDITOR DE PONTOS ELÉTRICOS (21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * No molde do js/esqauditor.js: confere QUALQUER projeto (lançado à mão ou pelo "Lançar pontos elétricos") contra as
 * MESMAS regras (js/eleregras.js), SEM confiar no lançador — a contagem por ambiente, a TUE de cada aparelho e a posição
 * de cada ponto são refeitas aqui. Regra do dono (problema sempre com solução, 15/10/2026): cada achado no formato do
 * js/problemacard.js — o que é, "Corrigir: …" (as ops prontas, aplicadas num lote com Ctrl+Z) e "Mostrar no 3D".
 * Todo achado de norma diz o item da NBR 5410:2004 (conferido na cópia não licenciada à RA: só o valor e o item).
 *
 *   EleAuditor.auditar({ estado, avaliarFam, criterios }) → { problemas[], porCodigo{}, ambientes[], criterios, aviso }
 *
 * CÓDIGOS (gravidade · nível):
 *   ELE_SEM_LUZ          erro  · N  ambiente sem ponto de luz no teto (9.5.2.1.1)
 *   ELE_SEM_INTERRUPTOR  erro  · N  ponto de luz sem interruptor no ambiente (9.5.2.1.1 "comandado por interruptor")
 *   ELE_TUG_MINIMO       erro  · N  tomadas de uso geral abaixo do mínimo do ambiente (9.5.2.2.1)
 *   ELE_TUG_BANCADA      erro  · N  cozinha com menos de 2 tomadas acima da bancada da pia (9.5.2.2.1 b)
 *   ELE_TUE_FALTA        erro  · N  aparelho sem ponto de uso específico a ≤ 1,50 m (9.5.3.1; distância: 4.2.1.2.3 d)
 *   ELE_EM_VAO           erro  · C  ponto dentro do vão de porta/janela
 *   ELE_TUG_LAVATORIO    aviso · N  banheiro sem tomada junto ao lavatório (9.5.2.2.1 a)
 *   ELE_LUZ_POUCA        aviso · C  menos pontos de luz que o critério RA pela área
 *   ELE_ATRAS_PORTA      aviso · C  ponto atrás da folha aberta / na varredura da porta
 *   ELE_ATRAS_MOVEL      aviso · C  tomada atrás de móvel fixo
 *   ELE_BOX              erro  · N  ponto nos volumes 0, 1 ou 2 do banheiro (9.1.4.3.1; volume 2 = 0,60 m além do box)
 *   ELE_INTERRUPTOR_LADO aviso · X  interruptor do lado da dobradiça
 *   ELE_TUG_ESPACO       aviso · C  sala/dormitório com trecho de perímetro > 5 m sem tomada
 *   ELE_SEM_CAIXA        aviso · C  dispositivo sem caixa elétrica (o orçamento fica sem a caixa)
 *   ELE_CAIXA_SOLTA      aviso · C  caixa elétrica sem dispositivo e sem aparelho perto
 *   ELE_CHUVEIRO_INDEF   aviso · X  chuveiro que não diz se é elétrico
 *   ELE_TUE_ORFA         aviso · C  ponto de uso específico do lançador sem aparelho a ≤ 1,50 m (aparelho apagado/movido)
 *   ELE_NOME             aviso · C  nome do ambiente sem tipo conhecido
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function RG() { return dep("EleRegras", "./eleregras.js"); }
  function EL() { return dep("EleAuto", "./eleauto.js"); }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function dist(a, b) { var d = sub(a, b); return Math.sqrt(dot(d, d)); }

  /* o estado sem as peças (famílias e caixas) de ids — o lançador refaz o ambiente sobre ele */
  function semPecas(estado, ids) {
    var e = {}, fora = {}; ids.forEach(function (i) { fora[String(i)] = 1; });
    Object.keys(estado || {}).forEach(function (k) { e[k] = estado[k]; });
    e.familias = arr(estado && estado.familias).filter(function (f) { return f && !fora[String(f.id)]; });
    if (estado && estado.instalacoes) { var ins = {}; Object.keys(estado.instalacoes).forEach(function (k) { ins[k] = estado.instalacoes[k]; }); ins.pecas = arr(estado.instalacoes.pecas).filter(function (k) { return k && !fora[String(k.id)]; }); e.instalacoes = ins; }
    return e;
  }
  /* a parede em que o ponto está (a face a ≤ 6 cm) → o "candidato" da régua de posição do js/eleauto.js */
  function naParede(L, p, pav) {
    var E = EA(), best = null;
    L.paredes.forEach(function (w) {
      if (w.pav !== pav) return;
      var u = E.eixoU(w.rotY), n = E.eixoN(w.rotY), q = sub(p.p, [w.cx, w.cz]), t = dot(q, u), s = dot(q, n);
      if (Math.abs(t) > w.comprimento / 2 + 0.02) return;
      var d = Math.abs(Math.abs(s) - w.espessura / 2); if (d > 0.06) return;
      var lado = s > 0 ? 1 : -1;
      if (!best || d < best.d) best = { d: d, w: w, t: r4(t), P: E.ptParede(w, t, lado * w.espessura / 2), dir: [n[0] * lado, n[1] * lado], lado: lado, pav: pav };
    });
    return best;
  }

  function auditar(o) {
    o = o || {};
    var R = RG(), EAl = EL(), E = EA(), C = R.criterios(o.criterios), est = o.estado, aval = o.avaliarFam;
    var L = EAl.leitura(est, aval), dentro = E.dentro, probs = [];
    function p(cod, grav, nivel, titulo, texto, pecas, solucoes) {
      probs.push({ tipo: cod, codigo: cod, gravidade: grav, nivel: nivel, nivelRotulo: R.rotuloNivel(nivel), titulo: titulo, texto: texto, pecas: arr(pecas).map(String), solucoes: arr(solucoes) });
    }
    function gerarPara(ambId, estX) {
      var g = EAl.gerar({ estado: estX || est, avaliarFam: aval, ambientes: [ambId], criterios: o.criterios, loteId: "corr-" + ambId });
      return g.ok ? g.ops : [];
    }
    function relancar(pt, ambId) {
      var ids = [pt.id].concat(pt.caixa ? [pt.caixa] : []);
      return [{ id: "relancar", texto: "Tirar o ponto e relançar no lugar certo", ops: ids.map(function (i) { return { op: "apagar", id: i }; }).concat(ambId ? gerarPara(ambId, semPecas(est, ids)) : []) },
              { id: "apagar", texto: "Só tirar o ponto", ops: ids.map(function (i) { return { op: "apagar", id: i }; }) }];
    }

    /* ---------------- a TUE de cada aparelho (refeita: a tomada/caixa mais perto a ≤ distTue; a do lançador tem o id dele) */
    var tuePor = {}, ehTue = {};
    L.aparelhos.forEach(function (ap) {
      if (ap.def.semParede) return;
      var pref = "elee-" + ap.chave, dMax = C.distTue.valor, best = null, Q = R.tueDe(ap.def, Number((ap.f.inst && ap.f.inst.Capacidade_BTUh) || ap.va.Capacidade_BTUh || 0), C);
      L.pontos.filter(function (q) { return q.kind === "tomada" && q.pav === ap.pav && !ehTue[q.id] && !/^elet-/.test(q.id); }).concat(L.caixas.filter(function (c) { return !c.dono && c.pav === ap.pav && !ehTue[c.id]; })).forEach(function (q) {
        /* só o ponto que SERVE ao aparelho (ligação direta = caixa sem tomada; tomada de corrente suficiente — js/eleauto.js serveTue) */
        if (!EAl.serveTue(Q, q)) return;
        var d0 = dist(q.p, ap.p), d = q.id === pref ? -1 : d0;
        if (d0 <= dMax + 1e-6 && (!best || d < best.d)) best = { q: q, d: d };
      });
      if (best) { tuePor[ap.chave] = best.q.id; ehTue[best.q.id] = ap.id; }
    });

    /* ---------------- por ambiente */
    L.ambientes.forEach(function (a) {
      var cls = a.cls, g = cls.grupo, rot = "\"" + a.nome + "\"";
      if (!cls.casou) p("ELE_NOME", "aviso", "C", rot + ": nome sem tipo conhecido", "Sem tipo, vale a regra dos demais cômodos. Renomeie (Sala, Quarto, Cozinha, Banheiro…) para a regra certa.", [a.id], [{ id: "nota-nome", texto: "Renomeie o ambiente em Propriedades › Nome." }]);
      var luz = L.pontos.filter(function (q) { return q.amb === a.id && q.kind === "luminaria"; }), ints = L.pontos.filter(function (q) { return q.amb === a.id && q.kind === "interruptor"; });
      var tug = L.pontos.filter(function (q) { return q.amb === a.id && q.kind === "tomada" && !ehTue[q.id]; });
      if (!luz.length) p("ELE_SEM_LUZ", "erro", "N", rot + " sem ponto de luz", "Todo cômodo tem ao menos " + C.luzMinimo.valor + " ponto de luz fixo no teto, comandado por interruptor — " + R.citar(C.luzMinimo) + " (" + C.luzMinimo.fonte + ").", [a.id],
        [{ id: "gerar", texto: "Lançar os pontos que faltam no ambiente", ops: gerarPara(a.id) }]);
      else {
        var nRA = R.nLuminarias(a.area, a.alongado, a.comprimento, C);
        if (luz.length < nRA) p("ELE_LUZ_POUCA", "aviso", "C", rot + ": " + luz.length + " ponto(s) de luz (critério RA: " + nRA + ")", "Pela área (" + f2(a.area) + " m²) o critério RA sugere " + nRA + " ponto(s); a NBR 5410 só exige 1 (" + R.rotuloNivel("S") + "). Carga mínima de iluminação: " + R.vaIluminacao(a.area, C) + " VA. Projeto luminotécnico manda.", [a.id].concat(luz.map(function (q) { return q.id; })),
          [{ id: "nota-luz", texto: "Acrescente luminárias à mão (Instalações › Luminária) ou siga o projeto luminotécnico." }]);
        if (!ints.length) p("ELE_SEM_INTERRUPTOR", "erro", "N", rot + ": luz sem interruptor", "O ponto de luz do cômodo é comandado por interruptor — " + R.citar(C.luzMinimo) + ".", [a.id].concat(luz.map(function (q) { return q.id; })),
          [{ id: "gerar", texto: "Lançar o interruptor junto à porta", ops: gerarPara(a.id) }]);
      }
      var nExig = R.nTug(g, a.area, a.perimetro, C), regra = R.regraTug(g, C);
      if (tug.length < nExig) p("ELE_TUG_MINIMO", "erro", "N", rot + ": " + tug.length + " de " + nExig + " tomadas", "Mínimo de tomadas de uso geral para " + cls.grupoRotulo + " (área " + f2(a.area) + " m², perímetro " + f2(a.perimetro) + " m): " + nExig + " — " + R.citar(regra) + " (" + regra.fonte + ").", [a.id].concat(tug.map(function (q) { return q.id; })),
        [{ id: "gerar", texto: "Lançar as tomadas que faltam", ops: gerarPara(a.id) }]);
      if (g === "cozinha_servico" && a.tipo.id !== "area_servico") {
        var pia = L.pias.filter(function (q) { return q.pav === a.pav && dentro(q.p, a.pts); })[0];
        if (pia) {
          var sobre = tug.filter(function (q) { return q.h >= 1.0 && dist(q.p, pia.p) <= 2.0; });
          if (sobre.length < C.tugMinBancadaPia.valor) p("ELE_TUG_BANCADA", "erro", "N", rot + ": " + sobre.length + " tomada(s) acima da bancada da pia", "Acima da bancada da pia, no mínimo " + C.tugMinBancadaPia.valor + " tomadas — " + R.citar(C.tugMinBancadaPia) + ".", [a.id, pia.id].concat(sobre.map(function (q) { return q.id; })),
            [{ id: "gerar", texto: "Lançar as tomadas acima da bancada", ops: gerarPara(a.id) }]);
        }
      }
      if (g === "banheiro") {
        var lav = L.lavatorios.filter(function (q) { return q.pav === a.pav && dentro(q.p, a.pts); })[0];
        if (lav && tug.length && !tug.some(function (q) { return dist(q.p, lav.costas) <= 1.0; })) p("ELE_TUG_LAVATORIO", "aviso", "N", rot + ": tomada longe do lavatório", "A tomada do banheiro fica junto ao lavatório — " + R.citar(C.tugBanheiro) + ".", [a.id, lav.id].concat(tug.map(function (q) { return q.id; })),
          [{ id: "relancar", texto: "Tirar a tomada e relançar junto ao lavatório", ops: tug.map(function (q) { return { op: "apagar", id: q.id }; }).concat(tug.filter(function (q) { return q.caixa; }).map(function (q) { return { op: "apagar", id: q.caixa }; })).concat(gerarPara(a.id, semPecas(est, tug.map(function (q) { return q.id; }).concat(tug.filter(function (q) { return q.caixa; }).map(function (q) { return q.caixa; }))))) }]);
      }
      if (g === "sala_dormitorio" && tug.length >= 2) {
        /* só o perímetro COM PAREDE: o lado aberto (passagem do ambiente integrado) não leva tomada */
        var abA = a.aberto ? EAl.passagens(a, EAl.candidatos(L, est, aval, a, C)) : [];
        var gap = EAl.maiorTrecho(a.perimetro, tug.map(function (q) { return EAl.perimetroDe(a.pts, q.p); }), abA);
        if (gap > C.vaoTugMax.valor + 1e-6) p("ELE_TUG_ESPACO", "aviso", "C", rot + ": " + f2(gap) + " m de perímetro sem tomada", "As tomadas ficam espaçadas tão uniformemente quanto possível (" + R.citar(C.tugPerimSalaDorm) + "); o alerta do critério RA é acima de " + f2(C.vaoTugMax.valor) + " m.", [a.id].concat(tug.map(function (q) { return q.id; })),
          [{ id: "nota-espaco", texto: "Arraste uma tomada para o trecho vazio (a planta mostra as cotas)." }]);
      }
    });

    /* ---------------- TUE dos aparelhos */
    L.aparelhos.forEach(function (ap) {
      if (ap.def.semParede || tuePor[ap.chave]) return;
      var Q = R.tueDe(ap.def, Number((ap.f.inst && ap.f.inst.Capacidade_BTUh) || ap.va.Capacidade_BTUh || 0), C);
      p("ELE_TUE_FALTA", Q.exclusivo ? "erro" : "aviso", Q.exclusivo ? "N" : "C", ap.def.rotulo + " (" + ap.id + ") sem ponto de uso específico",
        (Q.exclusivo ? "Aparelho acima de 10 A (ou de ligação direta) constitui circuito independente (" + R.citar(C.correnteExclusivo) + ")" : "Ponto dedicado ao aparelho (critério RA; até 10 A a 9.5.3.1 não exige circuito independente)") + "; o ponto fica a ≤ " + f2(C.distTue.valor) + " m dele (" + R.citar(C.distTue) + ").", [ap.id],
        ap.amb ? [{ id: "gerar", texto: "Lançar o ponto do aparelho", ops: gerarPara(ap.amb) }] : [{ id: "nota-amb", texto: "O aparelho está fora de ambiente delimitado: lance o ponto à mão." }]);
    });
    /* o ponto de uso específico do lançador (elee-) que nenhum aparelho usa: o aparelho saiu ou foi para longe */
    L.pontos.filter(function (q) { return q.kind === "tomada"; }).concat(L.caixas.filter(function (k) { return !k.dono; })).forEach(function (q) {
      if (!/^elee-/.test(q.id) || ehTue[q.id]) return;
      var ids = [q.id].concat(q.caixa ? [q.caixa] : []);
      p("ELE_TUE_ORFA", "aviso", "C", "Ponto de uso específico " + q.id + " sem aparelho", "Nenhum aparelho a ≤ " + f2(C.distTue.valor) + " m usa este ponto (" + R.citar(C.distTue) + "): o aparelho foi apagado ou movido. O orçamento conta o ponto.", [q.id],
        [{ id: "apagar", texto: "Tirar o ponto", ops: ids.map(function (i) { return { op: "apagar", id: i }; }) }]);
      ehTue[q.id] = "orfa";
    });
    L.chuveirosIndef.forEach(function (ch) {
      p("ELE_CHUVEIRO_INDEF", "aviso", "X", "Chuveiro " + ch.id + ": elétrico ou não?", "A família não diz se o chuveiro é elétrico; se for, falta o ponto de ligação direta (circuito exclusivo).", [ch.id],
        [{ id: "nota-chuveiro", texto: "Troque pelo chuveiro do Hidro e marque \"Elétrico\" = sim (o ponto sai pelo Lançar pontos elétricos)." }]);
    });

    /* ---------------- posição de cada ponto de parede */
    L.pontos.forEach(function (q) {
      if (q.kind === "luminaria") return;
      var c = naParede(L, q, q.pav); if (!c) return;
      var ap = ehTue[q.id] ? ehTue[q.id] : null;
      var mv = EAl.verificar(L, C, c, q.h, { ignorar: q.id, exceto: ap, semBox: !!(ap && /chuveiro/.test(String((L.aparelhos.filter(function (x) { return x.id === ap; })[0] || { def: {} }).def.id))) });
      var rotP = (q.kind === "tomada" ? "Tomada " : "Interruptor ") + q.id;
      if (mv && /^no vão/.test(mv)) p("ELE_EM_VAO", "erro", "C", rotP + " " + mv, "Ponto não pode ficar no vão de porta/janela (folga de " + f2(C.folgaVao.valor) + " m do vão, pela altura — critério RA).", [q.id], relancar(q, q.amb));
      else if (mv && /folha aberta|varredura/.test(mv)) p("ELE_ATRAS_PORTA", "aviso", "C", rotP + " " + mv, "Nenhum ponto atrás da folha aberta nem no giro da porta (critério RA da pesquisa).", [q.id], relancar(q, q.amb));
      else if (mv && /^atrás de/.test(mv)) p("ELE_ATRAS_MOVEL", "aviso", "C", rotP + " " + mv, "Tomada atrás de móvel fixo fica inacessível (critério RA). A TUE atrás do próprio aparelho pode.", [q.id], relancar(q, q.amb));
      else if (mv && /box/.test(mv)) p("ELE_BOX", "erro", "N", rotP + " " + mv, "Nenhum dispositivo de comando nem tomada nos volumes 0, 1 e 2 (" + R.citar(C.afastBox) + "): o volume 2 vai " + f2(C.afastBox.valor) + " m além do box (sem box, o volume 1 é o raio de " + f2(C.raioVolume1.valor) + " m em volta da saída do chuveiro — Figura 18).", [q.id], relancar(q, q.amb));
      if (q.kind === "interruptor") {
        L.vaos.forEach(function (v) {
          if (v.tipo !== "porta" || v.correr || v.parede !== c.w.id) return;
          var dt = c.t - v.t; if (Math.abs(dt) > v.largura / 2 + 0.45) return;
          var sH = v.maoDireita ? 1 : -1;
          if (dt * sH > 0) p("ELE_INTERRUPTOR_LADO", "aviso", "X", rotP + " do lado da dobradiça da porta " + v.id, "O interruptor fica do lado da maçaneta, a " + f2(C.distBatente.valor) + " m do batente (" + C.distBatente.fonte + ").", [q.id, v.id], relancar(q, q.amb));
        });
      }
      if (!q.caixa) p("ELE_SEM_CAIXA", "aviso", "C", rotP + " sem caixa elétrica", "Todo ponto de parede tem caixa 4×2 embutida (SINAPI 91939–91941 pela altura — " + R.rotuloNivel("A") + "); sem ela o orçamento fica sem a caixa.", [q.id],
        [{ id: "caixa", texto: "Pôr a caixa 4×2 atrás do ponto", ops: [{ op: "peca", id: q.id + "-cx", peca: "caixa_4x2", sistema: "eletrica", material: "pvc", x: r4(c.P[0] - c.dir[0] * 0.025), y: r4(q.y + q.h), z: r4(c.P[1] - c.dir[1] * 0.025), rotY: r4(Math.atan2(c.dir[0], c.dir[1])), alturaPiso: r4(q.h) }] }]);
    });
    L.pontos.forEach(function (q) {
      if (q.kind !== "luminaria" || q.caixa) return;
      p("ELE_SEM_CAIXA", "aviso", "C", "Luminária " + q.id + " sem caixa octogonal", "O ponto de luz tem caixa octogonal 4×4 no teto (SINAPI 91936 — " + R.rotuloNivel("A") + "); sem ela o orçamento fica sem a caixa.", [q.id],
        [{ id: "caixa", texto: "Pôr a caixa octogonal no teto", ops: [{ op: "peca", id: q.id + "-cx", peca: "caixa_octogonal", sistema: "eletrica", material: "pvc", x: r4(q.p[0]), y: r4(q.y + q.h), z: r4(q.p[1]), rotY: 0 }] }]);
    });
    L.caixas.forEach(function (c) {
      if (c.dono || ehTue[c.id]) return;
      p("ELE_CAIXA_SOLTA", "aviso", "C", "Caixa elétrica " + c.id + " sem ponto", "A caixa não tem tomada, interruptor ou luminária junto (a ≤ 10 cm) nem aparelho a ≤ " + f2(C.distTue.valor) + " m: ponto movido sem a caixa, ou caixa sobrando (o orçamento conta a caixa).", [c.id],
        [{ id: "apagar", texto: "Tirar a caixa", ops: [{ op: "apagar", id: c.id }] }]);
    });

    /* solução que o lançador não conseguiu montar (sem posição livre): não promete "Lançar…" sem botão — diz o que fazer à mão */
    probs.forEach(function (q) { q.solucoes.forEach(function (s) { if (s.ops && !s.ops.length) { delete s.ops; s.id = "nota-" + s.id; s.texto = "Sem posição livre automática para isso: lance à mão (Instalações › Tomada e interruptor) e rode o auditor de novo."; } }); });
    var porCod = {}; probs.forEach(function (q) { porCod[q.codigo] = (porCod[q.codigo] || 0) + 1; });
    return { problemas: probs, porCodigo: porCod, criterios: C, aviso: "NBR 5410:2004 conferida no item (cópia não licenciada à RA — só valores). Circuitos, quadro e condutor ficam para a próxima etapa.", norma: R.NORMA,
      ambientes: L.ambientes.map(function (a) { return { id: a.id, nome: a.nome, grupo: a.cls.grupo, area: a.area, perimetro: a.perimetro }; }) };
  }

  var EleAuditor = { auditar: auditar, semPecas: semPecas, naParede: naParede };
  global.EleAuditor = EleAuditor;
  if (typeof module !== "undefined" && module.exports) module.exports = EleAuditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
