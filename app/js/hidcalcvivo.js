/* =====================================================================
 * hidcalcvivo.js — O CÁLCULO "VIVO" DA ÁGUA FRIA (motor PURO, ES5, Node-testável). Pedido do Rogério (15/11/2026):
 * "não quero peça solta, tudo conectado; os cálculos rodam sozinhos, mostram montante/jusante, o memorial roda sozinho e mostra o
 * resultado no 3D com a pressão, passou = verde, não passou = vermelho, onde perde pressão, e dá a solução (trocar joelho por curva,
 * aumentar o diâmetro)".
 *
 *   HidCalcVivo.analisar(R, estado, avaliarFam, opc) → {
 *     situacao: "verde"|"amarelo"|"vermelho"|"sem-calculo", motivos[], contagem{verde,amarelo,vermelho,pendente},
 *     trechosAF[{ id, dn, q, v, pMontante_kpa, pJusante_kpa, perda_kpa, cor }],
 *     pontos[{ aparelho, famInst, pdin, pmin, cor, folga, motivo }], pontoCritico,
 *     ondePerde[{ trecho, dn, perda_kpa, distribuida_kpa, localizada_kpa, pctLocalizada, dominante, conexoes[{tipo, n, perda_kpa}], texto }],
 *     perdaPorConexao[{ tipo, n, perda_kpa }],
 *     solucoes[{ tipo: "dn"|"curva"|"vrp"|"subir"|"pressurizador", texto, ganho_kpa|null, ops|null, trecho?, nota? }],
 *     soltas[{ trecho, sistema, motivo, x, y, z }], mapa (o HidPressaoCores.mapa, para pintar o 3D) }
 *
 *   R = resultado do HidDimensionar.calcular (usa R.sistemas.agua_fria, R.ops, R.resumo).
 *   opc = { rede?, conectividade?: function () → { soltas[] }, simular?: function (ops) → R2 (o cálculo COM as ops, sem gravar — dá o ganho
 *           exato da solução), sug?: { caixa, subir, vazao_ls, cotaPiso } (para as sugestões de pressurização) }
 *
 * NADA INVENTADO: a perda em kPa vem do perda_m do próprio cálculo (HidAF/HidPerda) convertida com o HidHidraulica; o ganho de uma troca de
 * DN vem de RECALCULAR (opc.simular) — sem simulação, fica sem número; o ganho de joelho → curva só tem número quando a tabela de norma
 * (af.perda.localizada.k, a mesma do HidPerda) traz o K da curva MENOR que o do joelho do mesmo material. Hoje não traz (PPR: a curva adota o K
 * do joelho; PVC soldável: a tabela de comprimento equivalente não tem curva): vira NOTA "a confirmar na ficha do fabricante", sem número,
 * e sem botão — o editor não tem operação que troque a conexão (as conexões são deduzidas da geometria, js/biminst.js rede()).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function HPC() { return dep("HidPressaoCores", "./hidpressaocores.js"); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function f2(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }   // hid:ok formatação
  var TOP = 5;      // hid:ok quantos trechos a lista "onde perde pressão" mostra (tela)
  var G = 9.80665;  // hid:ok g padrão, só para a reserva sem o HidHidraulica (o HidHidraulica tem o próprio)
  var PESO = { verde: 0, amarelo: 1, vermelho: 2 };
  var JOELHOS = { joelho90: 1, joelho45: 1, joelho_bucha: 1 };

  function mKpa(h, rho) { var H = HH(); return H && H.mParaKpa ? H.mParaKpa(h, rho) : h * 1000 * G / 1000; }   // hid:ok água 1000 kg/m³ na reserva
  function mKpaInv(kpa) { var H = HH(); return H && H.kpaParaM ? H.kpaParaM(kpa) : kpa / G; }
  function pior(a, b) { return PESO[b] > PESO[a] ? b : a; }

  /* K da conexão do material na tabela de norma (a mesma do HidPerda); null se a linha não existe */
  function kTabela(material, conexao) {
    var N = NR(), t = N && N.tabela ? N.tabela("af.perda.localizada.k") : null; if (!t) return null;
    var l = arr(t.linhas).filter(function (x) { return x.material === material && x.conexao === conexao && (x.variante == null || x.variante === "padrao"); })[0];
    return l && num(l.k, null) != null ? { k: num(l.k, null), fonte: l.fonte || null, premissa: l.premissa || "" } : null;
  }

  function ondePerde(af, rho) {
    var itens = [], agg = {};
    arr(af && af.trechos).forEach(function (t) {
      if (t == null || t.id == null) return;
      var dist = mKpa(num(t.perdaDistribuida_m, 0), rho), loc = mKpa(num(t.perdaLocalizada_m, 0), rho), tot = mKpa(num(t.perda_m, 0), rho), porTipo = {};
      arr(t.conexoes).forEach(function (c) {
        var k = mKpa(num(c.perda_m, 0), rho); if (!(k > 0)) return;
        var r = porTipo[c.tipo] = porTipo[c.tipo] || { tipo: c.tipo, n: 0, perda_kpa: 0 }; r.n++; r.perda_kpa += k;
        var g = agg[c.tipo] = agg[c.tipo] || { tipo: c.tipo, n: 0, perda_kpa: 0 }; g.n++; g.perda_kpa += k;
      });
      if (!(tot > 0)) return;
      var cx = Object.keys(porTipo).map(function (k) { return porTipo[k]; }).sort(function (a, b) { return b.perda_kpa - a.perda_kpa; });
      var dominante = loc > dist ? "localizada" : "distribuida";
      itens.push({ trecho: String(t.id), dn: t.dn, perda_kpa: tot, distribuida_kpa: dist, localizada_kpa: loc, pctLocalizada: tot > 0 ? Math.round(loc / tot * 100) : 0, dominante: dominante, conexoes: cx,   // hid:ok percentual
        texto: "trecho " + t.id + " (DN " + (t.dn == null ? "—" : t.dn) + "): perde " + f2(tot) + " kPa — " + f2(dist) + " kPa no tubo (atrito) e " + f2(loc) + " kPa nas conexões" + (cx.length ? " (" + cx.map(function (c) { return c.n + "× " + c.tipo + " " + f2(c.perda_kpa) + " kPa"; }).join(", ") + ")" : "") });
    });
    itens.sort(function (a, b) { return b.perda_kpa - a.perda_kpa; });
    var porConexao = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return b.perda_kpa - a.perda_kpa; });
    return { top: itens.slice(0, TOP), todos: itens, porConexao: porConexao };
  }

  /* solução de DN: as ops que o PRÓPRIO cálculo (HidDimensionar → R.ops) propõe; o ganho, recalculando (opc.simular) */
  function solucoesDN(R, af, op, opc, folgaAtual) {
    var out = [], porId = {}, ops = arr(R && R.ops).filter(function (o) { return o && o.op === "instAlterar" && o.id != null && num(o.dn, null) != null; });
    arr(af && af.trechos).forEach(function (t) { if (t && t.id != null) porId[String(t.id)] = t; });
    var nSim = 0, MAXSIM = num(opc.maxSim, 3);   // hid:ok cada simulação é um cálculo completo: só as primeiras soluções (custo na tela)
    function ganhoDe(lista) {
      if (typeof opc.simular !== "function" || nSim >= MAXSIM) return null;
      nSim++;
      try {
        var R2 = opc.simular(lista), c2 = R2 && R2.sistemas && R2.sistemas.agua_fria && R2.sistemas.agua_fria.pontoCritico;
        return c2 && num(c2.folga_kpa, null) != null && folgaAtual != null ? num(c2.folga_kpa, 0) - folgaAtual : null;
      } catch (e) { return null; }
    }
    var vistos = {};
    op.top.forEach(function (it) {
      var mine = ops.filter(function (o) { return String(o.id) === it.trecho; }); if (!mine.length) return;
      var t = porId[it.trecho], de = t && t.dnModelo, para = num(mine[0].dn, null); if (para == null) return;
      vistos[it.trecho] = 1;
      out.push({ tipo: "dn", trecho: it.trecho, ops: JSON.parse(JSON.stringify(mine)), ganho_kpa: ganhoDe(mine),
        texto: "Aumentar o diâmetro do trecho " + it.trecho + (de != null ? " de DN " + de : "") + " para DN " + para + " (o dimensionamento já calculou esse DN; perde " + f2(it.perda_kpa) + " kPa hoje)" });
    });
    var resto = ops.filter(function (o) { return !vistos[String(o.id)]; });
    if (ops.length && (resto.length || !out.length)) out.push({ tipo: "dn", trecho: null, ops: JSON.parse(JSON.stringify(ops)), ganho_kpa: ganhoDe(ops),
      texto: "Aplicar todos os diâmetros calculados (" + ops.length + " trecho(s) a aumentar)" });
    return out;
  }

  /* joelho → curva: só dá número se a tabela de norma traz K de curva menor que o do joelho; senão, nota "a confirmar" */
  function solucoesCurva(op, af) {
    var out = [], porId = {};
    arr(af && af.trechos).forEach(function (t) { if (t && t.id != null) porId[String(t.id)] = t; });
    op.top.forEach(function (it) {
      var t = porId[it.trecho]; if (!t) return;
      var js = arr(t.conexoes).filter(function (c) { return JOELHOS[c.tipo] && num(c.perda_m, 0) > 0; }); if (!js.length) return;
      var n = js.length, perdaJ = js.reduce(function (s, c) { return s + mKpa(num(c.perda_m, 0)); }, 0);
      var kj = kTabela(t.material, "joelho90"), kc = kTabela(t.material, "curva90"), v = num(t.velocidade_ms, null), ganho = null, nota;
      if (kj && kc && kc.k < kj.k - 1e-9 && v != null) {
        ganho = mKpa((kj.k - kc.k) * n * v * v / (2 * G));
        nota = n + " joelho(s) do trecho " + it.trecho + " custam " + f2(perdaJ) + " kPa; trocar por curva 90° (K " + f2(kc.k) + " contra " + f2(kj.k) + " do joelho, tabela do fabricante) ganha cerca de " + f2(ganho) + " kPa";
      } else {
        nota = n + " joelho(s) do trecho " + it.trecho + " custam " + f2(perdaJ) + " kPa. A curva de raio longo perde menos, mas a tabela de norma carregada " +
          (kc ? "adota para a curva o mesmo K do joelho (" + (kc.premissa || "sem K próprio do fabricante") + ")" : "não traz comprimento equivalente nem K da curva para este material") +
          ": ganho A CONFIRMAR na ficha do fabricante, sem número. O editor não troca a conexão por botão (as conexões saem da geometria): redesenhe o ponto com uma curva (dois trechos de 45°)";
      }
      out.push({ tipo: "curva", trecho: it.trecho, ops: null, ganho_kpa: ganho, nota: nota, texto: "Trocar joelho por curva no trecho " + it.trecho + " — " + nota });
    });
    return out;
  }

  function analisar(R, estado, avaliarFam, opc) {
    opc = opc || {};
    var af = R && R.sistemas && R.sistemas.agua_fria, rs = (R && R.resumo) || {}, PC = HPC();
    var out = { situacao: "sem-calculo", motivos: [], contagem: { verde: 0, amarelo: 0, vermelho: 0, pendente: 0 }, trechosAF: [], pontos: [], pontoCritico: null, ondePerde: [], perdaPorConexao: [], solucoes: [], soltas: [], mapa: null };
    if (!af || !PC) return out;
    var rho, mp = PC.mapa(af, estado, avaliarFam, opc.rede);
    out.mapa = mp; out.contagem = mp.contagem;
    arr(af.trechos).forEach(function (t) {
      if (t == null || t.id == null || t.pressaoMontante_kpa === undefined) return;
      out.trechosAF.push({ id: String(t.id), dn: t.dn == null ? null : t.dn, q: num(t.vazao_ls, null), v: num(t.velocidade_ms, null), pMontante_kpa: num(t.pressaoMontante_kpa, null), pJusante_kpa: num(t.pressaoJusante_kpa, null),
                           perda_kpa: num(t.perda_m, null) == null ? null : mKpa(num(t.perda_m, 0), rho), cor: mp.trechos[String(t.id)] || null });
    });
    out.pontos = mp.pontos.map(function (p) {
      return { aparelho: p.aparelho, famInst: p.famInst, pdin: p.pdin, pmin: p.pmin, pest: p.pest, pmax: p.pmax, cor: p.cor, motivo: p.motivo, folga: p.pdin != null && p.pmin != null ? p.pdin - p.pmin : null };
    });
    var pc = af.pontoCritico;
    if (pc) { var pp = out.pontos.filter(function (p) { return String(p.famInst) === String(pc.famInst); })[0]; out.pontoCritico = { famInst: pc.famInst, aparelho: pc.aparelho, folga_kpa: num(pc.folga_kpa, null), pdin: pp ? pp.pdin : null, pmin: pp ? pp.pmin : null, cor: pp ? pp.cor : null }; }

    var op = ondePerde(af, rho); out.ondePerde = op.top; out.perdaPorConexao = op.porConexao;

    /* pontas soltas: a mesma conectividade do auditor (js/biminst.js) */
    try {
      var cv = typeof opc.conectividade === "function" ? opc.conectividade() : (BI() && BI().conectividade ? BI().conectividade(estado, avaliarFam) : null);
      out.soltas = arr(cv && cv.soltas).map(function (s) { return { trecho: s.trecho, sistema: s.sistema || null, motivo: s.motivo || "ponta solta", x: s.x, y: s.y, z: s.z }; });
    } catch (e) { out.soltas = []; }

    /* situação: vermelho = algum ponto/trecho abaixo da mínima (ou estática acima) ou reprovação do cálculo; amarelo = raspando, pendente ou peça solta */
    var sit = "verde";
    if (mp.contagem.vermelho > 0) { sit = "vermelho"; out.motivos.push(mp.contagem.vermelho + " ponto(s) sem a pressão exigida"); }
    if (num(rs.reprovadas, 0) > 0 || num(rs.erros, 0) > 0) { sit = "vermelho"; out.motivos.push(num(rs.reprovadas, 0) + " verificação(ões) reprovada(s)"); }
    if (mp.contagem.amarelo > 0) { sit = pior(sit, "amarelo"); out.motivos.push(mp.contagem.amarelo + " ponto(s) passando raspando"); }
    if (mp.contagem.pendente > 0 || num(rs.pendentes, 0) > 0) { sit = pior(sit, "amarelo"); out.motivos.push((mp.contagem.pendente || num(rs.pendentes, 0)) + " item(ns) não verificado(s)"); }
    if (out.soltas.length) { sit = pior(sit, "amarelo"); out.motivos.push(out.soltas.length + " ponta(s) solta(s)"); }
    if (!out.pontos.length && !out.trechosAF.length) { sit = "sem-calculo"; out.motivos = ["a rede de água fria não tem pontos calculados"]; }
    out.situacao = sit;

    /* soluções: só quando não passou (verde não pede conserto) */
    if (sit === "vermelho" || sit === "amarelo") {
      var folga = pc ? num(pc.folga_kpa, null) : null;
      out.solucoes = solucoesDN(R, af, op, opc, folga).concat(solucoesCurva(op, af));
      if (mp.contagem.vermelho > 0 || mp.contagem.amarelo > 0) {
        try { arr(PC.sugestoes(mp, opc.sug || {})).forEach(function (sg) { out.solucoes.push({ tipo: sg.tipo, ops: null, ganho_kpa: null, texto: sg.texto, nota: sg.texto, elementos: sg.elementos || null }); }); } catch (eS) {}
      }
      /* 15/11/2026: o ponto DESLIGADO da caixa (a ligação não fechou) ou sem carga estática para o mínimo — hidaf.js reprova "pressão estática do ponto" e o
         mapa de cores não o vê (o ponto não entra na rede calculada): as sugestões (subir a caixa quanto, pressurizador) saem da mesma HidPressaoCores */
      try {
        var vEst = arr(af.verificacoes).filter(function (v) { return /^pressão estática do ponto/.test(String(v.nome)) && v.ok === false && num(v.valor, null) != null && num(v.limite, null) != null; });
        if (vEst.length) {
          var sg0 = opc.sug || {}, cxA = {}; Object.keys(sg0.caixa || {}).forEach(function (k) { cxA[k] = sg0.caixa[k]; });
          if (cxA.id != null && cxA.yb == null) { var fcx = arr(estado && estado.familias).filter(function (f) { return String(f.id) === String(cxA.id); })[0]; if (fcx) cxA.yb = num(fcx.inst && fcx.inst.y != null ? fcx.inst.y : fcx.y, null); }
          var faltaM = vEst.reduce(function (m, v) { return Math.max(m, mKpaInv(num(v.limite, 0) - num(v.valor, 0))); }, 0), subM = Math.ceil(faltaM * 100 - 1e-9) / 100;
          var mpX = { pontos: vEst.map(function (v) { return { famInst: String(v.alvo), aparelho: null, pdin: num(v.valor, 0), pmin: num(v.limite, 0), faixa: "baixa", yPiso: null }; }) };
          var tem = {}; out.solucoes.forEach(function (x) { tem[x.tipo] = 1; });
          arr(PC.sugestoes(mpX, { caixa: cxA, subir: subM, vazao_ls: sg0.vazao_ls })).forEach(function (sg) { if (tem[sg.tipo]) return; out.solucoes.push({ tipo: sg.tipo, ops: null, ganho_kpa: null, texto: sg.texto, nota: sg.texto, elementos: sg.elementos || null }); });
        }
      } catch (eEst) {}
    }
    return out;
  }

  var HidCalcVivo = { analisar: analisar, ondePerde: ondePerde, kTabela: kTabela, TOP: TOP };
  if (typeof module !== "undefined" && module.exports) module.exports = HidCalcVivo;
  global.HidCalcVivo = HidCalcVivo;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
