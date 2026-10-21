/* =====================================================================
 * esqauditor.js — AUDITOR DE ESQUADRIAS (20/10/2026). Motor PURO, ES5, Node-testável.
 *
 * No molde do tools/hid-auditar-projeto.js: confere o modelo PRONTO (lançado à mão ou pelo "Portas e janelas
 * automáticas") com regras objetivas, SEM confiar no lançador — a área de janela, a distância à divisa e a varredura
 * da folha são refeitas aqui. Regra do dono (problema sempre com solução, 15/10/2026): cada achado sai no formato do
 * js/problemacard.js — o que é, "Corrigir: …" (as ops já calculadas, aplicadas num lote com Ctrl+Z) e "Mostrar no 3D"
 * (as peças). Solução sem ação vira nota, nunca botão vazio.
 *
 *   EsqAuditor.auditar({ estado, avaliarFam, criterios, acessivel }) → { problemas[], porCodigo{}, ambientes[] }
 *
 * CÓDIGOS (gravidade · nível de fonte):
 *   ESQ_ILUMINACAO   erro  · B  área de janela < fração × área do piso (1/6 prolongada, 1/8 transitória — provisório)
 *   ESQ_VENTILACAO   erro  · B  ventilação efetiva < 50 % da iluminação exigida
 *   ESQ_SEM_JANELA   erro  · B  ambiente de permanência prolongada sem parede externa / sem janela
 *   ESQ_BANHO_VENT   aviso · B  banheiro/lavabo sem janela: ventilação mecânica ou indireta
 *   ESQ_DIVISA       erro  · A  janela a < 1,50 m da divisa que ela vê, de frente ou oblíqua (Código Civil art. 1.301; Súmula 414 STF)
 *   ESQ_DIVISA_LADO  erro  · A  ponta da janela a < 0,75 m da divisa perpendicular (art. 1.301 § 1º)
 *   ESQ_PORTA_LARG   erro  · B/C folha abaixo do mínimo do ambiente
 *   ESQ_PORTA_ACESS  erro  · A  vão livre < 0,80 m num projeto acessível (NBR 9050:2020 6.11.2.4)
 *   ESQ_BANHO_ACESS  erro  · A  banheiro acessível com porta de giro abrindo para dentro (NBR 9050:2020 7.5)
 *   ESQ_PORTA_COLISAO erro · C  a folha aberta bate em outra porta, móvel ou louça
 *   ESQ_SEM_PORTA    erro  · C  ambiente sem porta (e sem passagem aberta)
 *   ESQ_PEITORIL     aviso · C  peitoril fora da faixa do ambiente (critério RA)
 *   ESQ_NOME         aviso · C  nome do ambiente sem tipo conhecido
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function RG() { return dep("EsqRegras", "./esqregras.js"); }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  function semFamilia(estado, id) {
    var e = {}; Object.keys(estado || {}).forEach(function (k) { e[k] = estado[k]; });
    e.familias = arr(estado && estado.familias).filter(function (f) { return f && String(f.id) !== String(id); });
    return e;
  }
  /* varredura própria (não usa a do lançador): quarto de círculo em pontos */
  function quarto(EAm, w, v) {
    var u = EAm.eixoU(w.rotY), n = EAm.eixoN(w.rotY), sH = v.maoDireita ? 1 : -1, lado = v.abreFora ? 1 : -1;
    var H = EAm.ptParede(w, v.t + sH * v.folha / 2, lado * w.espessura / 2), dF = [-sH * u[0], -sH * u[1]], dA = [lado * n[0], lado * n[1]], pts = [];
    for (var i = 1; i <= 6; i++) for (var j = 0; j <= 12; j++) { var r = v.folha * 0.98 * i / 6, a = Math.PI / 180 * (3 + 87 * j / 12); pts.push([H[0] + r * (Math.cos(a) * dF[0] + Math.sin(a) * dA[0]), H[1] + r * (Math.cos(a) * dF[1] + Math.sin(a) * dA[1])]); }
    function tem(p) { var q = [p[0] - H[0], p[1] - H[1]], x = q[0] * dF[0] + q[1] * dF[1], y = q[0] * dA[0] + q[1] * dA[1]; return x >= -1e-3 && y >= 0.01 && x * x + y * y <= v.folha * v.folha; }
    return { pts: pts, tem: tem, lado: lado };
  }

  function auditar(o) {
    o = o || {};
    var R = RG(), EAm = EA(), C = R.criterios(o.criterios), est = o.estado, aval = o.avaliarFam;
    var L = EAm.leitura(est, aval), probs = [];
    function p(cod, grav, nivel, titulo, texto, pecas, solucoes) {
      probs.push({ tipo: cod, codigo: cod, gravidade: grav, nivel: nivel, nivelRotulo: R.rotuloNivel(nivel), titulo: titulo, texto: texto, pecas: arr(pecas).map(String), solucoes: arr(solucoes) });
    }
    function gerarPara(ambId, estX) {
      var g = EAm.gerar({ estado: estX || est, avaliarFam: aval, ambientes: [ambId], criterios: o.criterios, acessivel: o.acessivel, loteId: "corr-" + ambId });
      return g.ok ? g.ops : [];
    }
    function noTrecho(v, tr) { return v.parede === tr.paredeId && v.t >= tr.t0 - 0.02 && v.t <= tr.t1 + 0.02; }
    var porAmb = {}; L.ambientes.forEach(function (a) { porAmb[a.id] = a; });

    /* ---------------- janelas por ambiente */
    L.ambientes.forEach(function (a) {
      var def = a.tipo.def, fr = R.fracaoIluminacao(def, C);
      if (!a.tipo.casou) p("ESQ_NOME", "aviso", "C", "\"" + a.nome + "\": nome sem tipo conhecido", "Sem tipo, vale a regra mais restritiva (permanência prolongada). Renomeie (Sala, Quarto, Cozinha, Banheiro…) para a regra certa.", [a.id],
        [{ id: "nota-nome", texto: "Renomeie o ambiente em Propriedades › Nome." }]);
      if (!fr || !def.janela || !def.janela.famId) return;
      var area = 0, vent = 0, ids = [], ext = a.trechos.filter(function (tr) { return tr.vizinho == null; });
      ext.forEach(function (tr) { L.vaos.forEach(function (v) { if (noTrecho(v, tr) && (v.tipo === "janela" || v.correr)) { var ar = v.largura * v.altura; area += ar * R.fatorIluminacao(v.famId, C); vent += ar * R.fatorVentilacao(v.famId, C); ids.push(v.id); } }); });
      var exig = fr.valor * a.area, ventExig = exig * C.ventilacaoDaIluminacao.valor, fonte = fr.fonte, fracTxt = a.tipo.classe === "transitoria" ? "1/8" : "1/6";
      var banho = a.tipo.id === "banheiro" || a.tipo.id === "lavabo";
      if (!ids.length) {
        if (!def.janela.exige) return;
        if (banho) {
          p("ESQ_BANHO_VENT", "aviso", "B", "\"" + a.nome + "\" sem janela", "Banheiro/lavabo sem abertura para fora: precisa de ventilação mecânica (exaustor) ou indireta (duto/poço). " + fonte + ".", [a.id],
            ext.length ? [{ id: "gerar", texto: "Lançar basculante na parede externa", ops: gerarPara(a.id) }] : [{ id: "nota-mec", texto: "Sem parede externa: especifique exaustor ou duto de ventilação no projeto." }]);
          return;
        }
        p("ESQ_SEM_JANELA", "erro", "B", "\"" + a.nome + "\" sem janela", "Ambiente de permanência " + (a.tipo.classe || "") + " sem abertura: exigido " + f2(exig) + " m² (" + fracTxt + " de " + f2(a.area) + " m²). " + fonte + ".", [a.id],
          ext.length ? [{ id: "gerar", texto: "Lançar a janela automática", ops: gerarPara(a.id) }] : [{ id: "nota-planta", texto: "O ambiente não tem parede externa: reveja a planta (pátio, poço de luz ou mudar o uso)." }]);
        return;
      }
      if (area < exig - 1e-6) p("ESQ_ILUMINACAO", "erro", "B", "\"" + a.nome + "\": janela pequena (" + f2(area) + " de " + f2(exig) + " m²)", "Iluminação ≥ " + fracTxt + " da área do piso. " + fonte + ".", [a.id].concat(ids),
        [{ id: "gerar", texto: "Completar a área com janela automática", ops: gerarPara(a.id) }]);
      if (vent < ventExig - 1e-6) p("ESQ_VENTILACAO", "erro", "B", "\"" + a.nome + "\": ventilação " + f2(vent) + " de " + f2(ventExig) + " m²", "Ventilação efetiva ≥ " + Math.round(C.ventilacaoDaIluminacao.valor * 100) + " % da iluminação exigida (o correr ventila metade do vão). " + C.ventilacaoDaIluminacao.fonte + ".", [a.id].concat(ids),
        [{ id: "gerar", texto: "Completar a ventilação com janela automática", ops: gerarPara(a.id) }]);
      /* peitoril */
      var pf = def.janela.peitoril;
      ext.forEach(function (tr) {
        L.vaos.forEach(function (v) {
          if (!noTrecho(v, tr) || v.tipo !== "janela" || !pf) return;
          if (v.peitoril < pf[0] - 1e-6 || v.peitoril > pf[1] + 1e-6) {
            var alvo = Math.min(pf[1], Math.max(pf[0], r4(C.verga.valor - v.altura)));
            p("ESQ_PEITORIL", "aviso", "C", "Janela " + v.id + " (" + a.nome + "): peitoril " + f2(v.peitoril) + " m", "A faixa do critério RA para " + a.tipo.rotulo.toLowerCase() + " é " + f2(pf[0]) + "–" + f2(pf[1]) + " m (prática de projeto, editável; NBR 15575-1:2013 13.2.6 recomenda ≤ 1,00 em sala e dormitório).", [v.id],
              [{ id: "peitoril", texto: "Peitoril em " + f2(alvo) + " m", ops: [{ op: "instancia", id: v.id, inst: { Peitoril: alvo } }] }]);
          }
        });
      });
    });

    /* ---------------- divisa (Código Civil 1.301) */
    if (L.divisa) L.ambientes.forEach(function (a) {
      a.trechos.forEach(function (tr) {
        if (tr.vizinho != null) return;
        var w = L.porParede[tr.paredeId]; if (!w) return;
        L.vaos.forEach(function (v) {
          if (!noTrecho(v, tr) || !(v.tipo === "janela" || v.correr)) return;
          var d = EAm.distDivisa(L, w, tr.lado, v.t - v.largura / 2, v.t + v.largura / 2, C);
          if (d.frente < C.divisaFrente.valor - 1e-6) {
            var e2 = semFamilia(est, v.id);
            p("ESQ_DIVISA", "erro", "A", "Janela " + v.id + " a " + f2(d.frente) + " m da divisa", "Abertura que vê a divisa (de frente ou oblíqua) precisa de ≥ " + f2(C.divisaFrente.valor) + " m (" + C.divisaFrente.fonte + "). O vizinho pode exigir o fechamento.", [v.id],
              [{ id: "relancar", texto: "Tirar a janela e relançar longe da divisa", ops: [{ op: "apagar", id: v.id }].concat(gerarPara(a.id, e2)) }, { id: "apagar", texto: "Só tirar a janela", ops: [{ op: "apagar", id: v.id }] }]);
          } else if (d.lado < C.divisaPerpendicular.valor - 1e-6) {
            /* o § 1º PROÍBE ("não poderão ser abertas"): erro, não aviso — e a correção relança longe da divisa */
            var e3 = semFamilia(est, v.id);
            p("ESQ_DIVISA_LADO", "erro", "A", "Janela " + v.id + ": ponta a " + f2(d.lado) + " m da divisa perpendicular", "Janela perpendicular à divisa (sem visão sobre ela) precisa de ≥ " + f2(C.divisaPerpendicular.valor) + " m (" + C.divisaPerpendicular.fonte + ").", [v.id],
              [{ id: "relancar", texto: "Tirar a janela e relançar longe da divisa", ops: [{ op: "apagar", id: v.id }].concat(gerarPara(a.id, e3)) }, { id: "apagar", texto: "Só tirar a janela", ops: [{ op: "apagar", id: v.id }] }]);
          }
        });
      });
    });

    /* ---------------- portas */
    var portas = L.vaos.filter(function (v) { return v.tipo === "porta"; });
    function ambsDaPorta(v) {
      var out = [];
      L.ambientes.forEach(function (a) { a.trechos.forEach(function (tr) { if (noTrecho(v, tr) && out.indexOf(a) < 0) out.push(a); }); });
      return out;
    }
    function acessivelAmb(a) { return !!o.acessivel || /\b(pne|pcd|acessivel)\b/.test(R.normalizar(a.nome)); }
    function colisoesDe(v, inst) {
      var w = L.porParede[v.parede]; if (!w || v.correr) return [];
      var vv = { t: v.t, folha: v.folha, maoDireita: inst ? inst.mao : v.maoDireita, abreFora: inst ? inst.fora : v.abreFora }, Q = quarto(EAm, w, vv), out = [];
      var alvoAmb = null; L.ambientes.forEach(function (a) { if (EAm.dentro(EAm.ptParede(w, v.t, Q.lado * (w.espessura / 2 + 0.2)), a.pts) && a.pav === v.pav) alvoAmb = a; });
      if (alvoAmb && Q.pts.some(function (q) { return !EAm.dentro(q, alvoAmb.pts) && EAm.foraDoLivre(L, q, v.pav); })) out.push({ tipo: "fora", nome: "a parede de \"" + alvoAmb.nome + "\"" });
      L.moveis.forEach(function (m) { if (m.pav !== v.pav || m.y >= 2.0) return; if (Q.pts.some(function (q) { return EAm.dentro(q, m.pts); }) || m.pts.some(Q.tem)) out.push({ tipo: "movel", id: m.id, nome: m.nome }); });
      portas.forEach(function (x) {
        if (x.id === v.id || x.correr) return; var w2 = L.porParede[x.parede]; if (!w2) return;
        var Q2 = quarto(EAm, w2, x);
        if (Q.pts.some(Q2.tem) || Q2.pts.some(Q.tem)) out.push({ tipo: "porta", id: x.id, nome: "a porta " + x.id });
      });
      return out;
    }
    portas.forEach(function (v) {
      var as = ambsDaPorta(v), dono = as.slice().sort(function (x, y) { return R.privacidade(x.tipo.id) - R.privacidade(y.tipo.id); })[0];
      if (!dono) return;
      var def = dono.tipo.def, acc = as.some(acessivelAmb), ehGiro = v.famId === "ra-porta-giro";
      var min = def.porta && def.porta.minimo ? def.porta.minimo / 100 : 0.6, vl = v.folha - C.descontoVaoLivre.valor;
      function trocarPara(folhaMin) { var P = R.PORTAS.filter(function (x) { return x.folha / 100 >= folhaMin - 1e-6; })[0]; return ehGiro && P ? [{ id: "tipo", texto: "Trocar para a folha de " + f2(P.folha / 100) + " m", ops: [{ op: "instancia", id: v.id, tipoId: P.tipoId }] }] : [{ id: "nota-tipo", texto: "Escolha um tipo mais largo em Propriedades." }]; }
      if (!v.correr && v.folha < min - 1e-6) p("ESQ_PORTA_LARG", "erro", "B", "Porta " + v.id + " (" + dono.nome + "): folha " + f2(v.folha) + " m < " + f2(min) + " m", "Mínimo do ambiente: " + C.portaMinimaFonte.fonte + ".", [v.id], trocarPara(Math.max(min, def.porta && def.porta.folha ? def.porta.folha / 100 : min)));   /* corrige para a folha típica do ambiente (C), não só o mínimo */
      if (acc && vl < C.vaoLivreAcessivel.valor - 1e-6) p("ESQ_PORTA_ACESS", "erro", "A", "Porta " + v.id + ": vão livre ≈ " + f2(vl) + " m < " + f2(C.vaoLivreAcessivel.valor) + " m", "Rota acessível: " + C.vaoLivreAcessivel.fonte + " (vão livre ≈ folha − " + f2(C.descontoVaoLivre.valor) + " m, " + C.descontoVaoLivre.fonte + ").", [v.id], trocarPara(C.vaoLivreAcessivel.valor + C.descontoVaoLivre.valor));
      var banho = as.filter(function (a) { return (a.tipo.id === "banheiro" || a.tipo.id === "lavabo") && acessivelAmb(a); })[0];
      if (banho && ehGiro) {
        var w = L.porParede[v.parede], trB = banho.trechos.filter(function (tr) { return noTrecho(v, tr); })[0];
        var abreParaDentro = trB && ((v.abreFora ? 1 : -1) === trB.lado);
        if (abreParaDentro && w) p("ESQ_BANHO_ACESS", "erro", "A", "Porta " + v.id + " do banheiro acessível abre para dentro", "NBR 9050:2020 7.5: a porta de eixo vertical do sanitário acessível abre para FORA (ou é de correr).", [v.id],
          [{ id: "inverter", texto: "Abrir para fora", ops: [{ op: "instancia", id: v.id, inst: { Abre_para_fora: !v.abreFora } }] }]);
      }
      var col = colisoesDe(v);
      if (col.length) {
        var sols = [];
        [{ mao: !v.maoDireita, fora: v.abreFora, t: "Espelhar a mão" }, { mao: v.maoDireita, fora: !v.abreFora, t: "Abrir para o outro lado" }, { mao: !v.maoDireita, fora: !v.abreFora, t: "Outro lado e outra mão" }].forEach(function (x, k) {
          if (sols.length) return;
          if (banho && x.fora !== v.abreFora) return;
          if (!colisoesDe(v, x).length) sols.push({ id: "inv" + k, texto: x.t, ops: [{ op: "instancia", id: v.id, inst: { Mao_direita: x.mao, Abre_para_fora: x.fora } }] });
        });
        if (!sols.length) sols.push({ id: "nota-mover", texto: "Nenhuma inversão resolve: arraste a porta na parede (cotas temporárias) ou mova o móvel." });
        p("ESQ_PORTA_COLISAO", "erro", "C", "Porta " + v.id + ": a folha bate em " + col.map(function (c) { return c.nome || c.id; }).join(", "), "A varredura da folha (quarto de círculo, raio = folha) não pode cruzar outra porta, móvel ou louça, nem sair do ambiente (critério RA).", [v.id].concat(col.filter(function (c) { return c.id; }).map(function (c) { return c.id; })), sols);
      }
    });
    /* ambiente sem porta */
    L.ambientes.forEach(function (a) {
      if (a.tipo.def.semPortaPropria || a.tipo.def.externo || a.tipo.def.porta === null) return;
      var tem = a.trechos.some(function (tr) { return portas.some(function (v) { return noTrecho(v, tr); }); });
      var internos = a.trechos.some(function (tr) { return tr.vizinho != null && tr.vizinho !== "?"; });
      if (!tem && !a.aberto) p("ESQ_SEM_PORTA", "erro", "C", "\"" + a.nome + "\" sem porta", "Nenhuma porta nas paredes do ambiente" + (internos ? "" : " (nem parede para outro ambiente: confira a separação)") + ".", [a.id],
        [{ id: "gerar", texto: "Lançar a porta automática", ops: gerarPara(a.id) }]);
    });
    probs.forEach(function (q) { q.solucoes.forEach(function (s) { if (s.ops && !s.ops.length) delete s.ops; }); });
    var porCod = {}; probs.forEach(function (q) { porCod[q.codigo] = (porCod[q.codigo] || 0) + 1; });
    return { problemas: probs, porCodigo: porCod, ambientes: L.ambientes.map(function (a) { return { id: a.id, nome: a.nome, tipo: a.tipo.id, classe: a.tipo.classe, area: a.area }; }), criterios: C };
  }

  var EsqAuditor = { auditar: auditar };
  global.EsqAuditor = EsqAuditor;
  if (typeof module !== "undefined" && module.exports) module.exports = EsqAuditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
