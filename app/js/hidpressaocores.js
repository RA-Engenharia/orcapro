/* =====================================================================
 * hidpressaocores.js — PRESSÃO EM CORES DA ÁGUA FRIA (motor PURO, ES5, Node-testável). Pedido do Rogério (13/11/2026 noite):
 * "a caixa a 5 m já calcula e interliga; se não tiver a pressão que precisa em cada item fica VERMELHO, bom = VERDE, mais ou menos =
 * AMARELO. Pressão demais → regulador; de menos → subir a caixa; se não der para subir → um modelo de pressurizador."
 *
 *   HidPressaoCores.classificar({ pdin, pmin, pest, pmax })      → { cor: "verde"|"amarelo"|"vermelho", motivo, faixa }
 *   HidPressaoCores.mapa(r, estado, avaliarFam, rede?)           → { pontos[], trechos{id:cor}, cores{id:hex}, limites, contagem }
 *   HidPressaoCores.sugestoes(m, o)                              → [{ tipo:"vrp"|"subir"|"pressurizador", texto, ... }]
 *
 * r = o resultado da água fria do js/hidaf.js (pontos com pressaoDinamica_kpa/pressaoEstatica_kpa/pressaoMinima_kpa; trechos com
 * pressaoMontante_kpa/pressaoJusante_kpa; verificações "pressão dinâmica mínima na rede" e "pressão estática máxima" com o LIMITE
 * da NBR 5626:2020 vindo do HidNormas). Nenhum valor de norma aqui: os limites saem do r (HidNormas) e da FAMÍLIA do aparelho
 * (Pressao_min_kPa, Pressao_acionamento_kPa, Pressao_max_kPa — ficha do fabricante; sem ficha, a da norma com a fonte, js/hidfamilias.js
 * hidraulica()). Vale a MAIOR mínima (NBR 5626:2020: a do fabricante prevalece se maior) e a MENOR máxima.
 *
 * FAIXA AMARELA (decisão de projeto da RA, 14/11/2026 — a norma só dá o limite, não a "zona de atenção"): dinâmica acima da mínima
 * mas a menos de 25 % dela (o nível d'água baixa, o tubo envelhece e a vazão simultânea varia: o ponto que passa "raspando" é o que
 * reclama na obra) e estática acima de 90 % da máxima (a sobrepressão do fechamento rápido soma em cima dela).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function HPz() { return dep("HidPressao", "./hidpressao.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function f2(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }   // hid:ok formatação
  var FAIXA = { folgaMin: 0.25, folgaMax: 0.10 };   // hid:ok decisão RA (cabeçalho): amarelo = dinâmica < 1,25 × mínima ou estática > 0,90 × máxima
  var HEX = { verde: "#2e9e5b", amarelo: "#e0a100", vermelho: "#d33a2c", pendente: "#8a8f98" };   // hid:ok as mesmas cores da verificação (js/hidcalcui.js CORES)
  var PESO = { verde: 0, amarelo: 1, vermelho: 2 };
  var EPS = 1e-6;   // hid:ok tolerância numérica
  function pior(a, b) { return a == null ? b : (b == null ? a : (PESO[b] > PESO[a] ? b : a)); }
  function mca(kpa) { var H = HH(); return H && H.kpaParaM ? H.kpaParaM(kpa) : kpa / 9.80665; }   // hid:ok reserva sem o HidHidraulica: g padrão

  function classificar(o) {
    var pd = num(o && o.pdin, null), pm = num(o && o.pmin, null), pe = num(o && o.pest, null), px = num(o && o.pmax, null), cor = null, mot = [];
    if (pd == null || pm == null) return { cor: null, motivo: "sem pressão calculada (rode o dimensionamento)", faixa: null };
    if (pd < pm - EPS) { cor = "vermelho"; mot.push("dinâmica " + f2(pd) + " kPa < mínima " + f2(pm) + " kPa"); }
    else if (pd < pm * (1 + FAIXA.folgaMin) - EPS) { cor = "amarelo"; mot.push("dinâmica " + f2(pd) + " kPa, só " + f2(pd - pm) + " kPa acima da mínima " + f2(pm) + " kPa"); }
    else { cor = "verde"; mot.push("dinâmica " + f2(pd) + " kPa ≥ mínima " + f2(pm) + " kPa"); }
    if (pe != null && px != null && px > 0) {
      if (pe > px + EPS) { cor = "vermelho"; mot.push("estática " + f2(pe) + " kPa > máxima " + f2(px) + " kPa"); }
      else if (pe > px * (1 - FAIXA.folgaMax) + EPS) { cor = pior(cor, "amarelo"); mot.push("estática " + f2(pe) + " kPa perto da máxima " + f2(px) + " kPa"); }
    }
    return { cor: cor, motivo: mot.join("; "), faixa: pd < pm - EPS ? "baixa" : (pe != null && px != null && px > 0 && pe > px + EPS ? "alta" : null) };
  }

  function limite(r, re) { var v = arr(r && r.verificacoes).filter(function (x) { return re.test(String(x.nome)) && num(x.limite, null) != null; })[0]; return v ? num(v.limite, null) : null; }

  function mapa(r, estado, avaliarFam, rede) {
    var out = { pontos: [], trechos: {}, cores: {}, limites: { redeMin: limite(r, /pressão dinâmica mínima na rede/), estMax: limite(r, /pressão estática máxima/) }, contagem: { verde: 0, amarelo: 0, vermelho: 0, pendente: 0 } };
    var fams = {}; arr(estado && estado.familias).forEach(function (f) { if (f) fams[String(f.id)] = f; });
    arr(r && r.pontos).forEach(function (p) {
      var f = fams[String(p.famInst)], v = {};
      /* REVISÃO A2: a família que não pôde ser lida NÃO vira verde pela mínima do cálculo — o ponto fica PENDENTE (cinza) */
      var semFamilia = false;
      if (f && typeof avaliarFam === "function") { try { var av = avaliarFam(f.famId, f.tipoId, f.inst || {}); if (av && av.valores) v = av.valores; else semFamilia = true; } catch (e) { semFamilia = true; } }
      var mins = [[num(p.pressaoMinima_kpa, null), p.fontePmin ? "cálculo (" + p.fontePmin + ")" : "cálculo (NBR 5626:2020)"], [num(v.Pressao_min_kPa, 0), "família: mínima para vazão (" + (v.Origem_hidraulica || "ficha") + ")"],
                  [num(v.Pressao_acionamento_kPa, 0), "família: mínima de acionamento (ficha)"]].filter(function (x) { return x[0] != null && x[0] > 0; }).sort(function (a, b) { return b[0] - a[0]; });
      var maxs = [[out.limites.estMax, "NBR 5626:2020 (estática máxima)"], [num(v.Pressao_max_kPa, 0), "família: estática máxima (" + (v.Origem_hidraulica || "ficha") + ")"]].filter(function (x) { return x[0] != null && x[0] > 0; }).sort(function (a, b) { return a[0] - b[0]; });
      var pmin = mins.length ? mins[0][0] : null, pmax = maxs.length ? maxs[0][0] : null;
      var c = semFamilia ? { cor: "pendente", motivo: "pendente: a família do aparelho não pôde ser lida (pressão do fabricante desconhecida)", faixa: null } : classificar({ pdin: p.pressaoDinamica_kpa, pmin: pmin, pest: p.pressaoEstatica_kpa, pmax: pmax });
      var pos = f ? { x: num(f.x, 0), y: num(p.cota, num(f.inst && f.inst.y != null ? f.inst.y : f.y, 0)), z: num(f.z, 0) } : null;   /* na cota do ponto de consumo */
      out.pontos.push({ famInst: String(p.famInst), aparelho: p.aparelho || null, pdin: num(p.pressaoDinamica_kpa, null), pest: num(p.pressaoEstatica_kpa, null), pmin: pmin, fontePmin: mins.length ? mins[0][1] : null,
                        pmax: pmax, fontePmax: maxs.length ? maxs[0][1] : null, cota: num(p.cota, null), yPiso: f ? num(f.inst && f.inst.y != null ? f.inst.y : f.y, null) : null, cor: c.cor, motivo: c.motivo, faixa: c.faixa, pos: pos });
      if (c.cor) { out.contagem[c.cor]++; out.cores[String(p.famInst)] = HEX[c.cor]; }
    });
    /* trechos: a dinâmica nas duas pontas × a mínima da REDE (6.9.3); depois o pior com o aparelho que o trecho liga */
    var rMin = out.limites.redeMin;
    arr(r && r.trechos).forEach(function (t) {
      if (t == null || t.id == null) return;
      /* a cor do trecho vem da pressão no ponto de JUSANTE (onde a água chega): o topo da descida que sai da caixa tem pressão ~0 por
         natureza (a tomada, NBR 5626:2020 6.9.3 a dispensa) e pintava a coluna inteira de vermelho na tela (print de 14/11) */
      var pm = num(t.pressaoJusante_kpa, null);
      if (pm == null || rMin == null) return;
      if (!(num(t.vazao_ls, 0) > 0)) return;   /* extravasor, limpeza, ventilação e ramo parado: sem vazão de consumo, sem cor de pressão */
      out.trechos[String(t.id)] = classificar({ pdin: pm, pmin: rMin }).cor;
    });
    var lig = arr(rede && rede.ligacoes);
    if (!lig.length && BI() && estado) { try { lig = BI().rede(estado, avaliarFam).ligacoes || []; } catch (eR) { lig = []; } }
    var corPto = {}; out.pontos.forEach(function (p) { if (p.cor && p.cor !== "pendente") corPto[p.famInst] = p.cor; });
    lig.forEach(function (l) { var c = corPto[String(l.famInst)] || corPto[String(l.alvo)]; if (c && l.trecho != null) out.trechos[String(l.trecho)] = pior(out.trechos[String(l.trecho)], c); });
    /* a estática acima do limite no nó apontado pela verificação */
    arr(r && r.verificacoes).forEach(function (v) { if (/pressão estática máxima/.test(String(v.nome)) && v.ok === false && v.alvo != null) out.trechos[String(v.alvo)] = "vermelho"; });
    Object.keys(out.trechos).forEach(function (id) { if (out.trechos[id]) out.cores[id] = HEX[out.trechos[id]]; });
    return out;
  }

  /* SUGESTÕES. o = { caixa:{id, yb, H, cotaMax}, subir (m, do js/hidbarrilete.js: o que a caixa precisa subir), vazao_ls (vazão de projeto na
     saída da caixa), modelos? (lista do HidPressao, para teste) }. Nada de modelo inventado: o pressurizador vem do catálogo do HidPressao
     (curva da ficha, com o link); a VRP não tem ficha no catálogo da RA → a sugestão diz ONDE e a REGULAGEM, e o modelo fica pendente. */
  function sugestoes(m, o) {
    o = o || {}; var out = [], cx = o.caixa || {}, ps = arr(m && m.pontos);
    var altos = ps.filter(function (p) { return p.faixa === "alta"; }), baixos = ps.filter(function (p) { return p.faixa === "baixa"; });
    if (altos.length) {
      var lim = Math.min.apply(null, altos.map(function (p) { return p.pmax; })), cotaV = Math.max.apply(null, altos.map(function (p) { return num(p.cota, -Infinity); }));
      out.push({ tipo: "vrp", elementos: altos.map(function (p) { return p.famInst; }),
        texto: "Pressão ALTA em " + altos.map(function (p) { return p.famInst + " (" + f2(p.pest) + " kPa > " + f2(p.pmax) + " kPa)"; }).slice(0, 4).join(", ") + ": instale VÁLVULA REDUTORA DE PRESSÃO no início do ramal/coluna que alimenta esses pontos (abaixo da cota " + f2(cotaV) + " m), regulada para no máximo " + f2(lim) + " kPa na saída (NBR 5626:2020 6.9.5), com registro antes e depois e filtro a montante. Modelo: escolha pela ficha do fabricante (o catálogo da RA ainda não tem VRP — pendência).",   // hid:ok até 4 pontos no texto
        regulagem_kpa: lim });
    }
    if (baixos.length) {
      var sub = num(o.subir, null), cotaMin = sub != null && cx.yb != null ? cx.yb + sub : null, cotaMax = num(cx.cotaMax, 0) > 0 ? num(cx.cotaMax, 0) : null;
      var naoSobe = cotaMin != null && cotaMax != null && cotaMin > cotaMax + EPS;
      if (cotaMin != null) out.push({ tipo: "subir", cotaMinima: cotaMin, subir: sub, possivel: !naoSobe, elementos: [cx.id],
        texto: "Pressão BAIXA em " + baixos.map(function (p) { return p.famInst + " (" + f2(p.pdin) + " < " + f2(p.pmin) + " kPa)"; }).slice(0, 4).join(", ") + ": a cota MÍNIMA do fundo da caixa " + (cx.id || "") + " é " + f2(cotaMin) + " m (subir " + f2(sub) + " m)" + (naoSobe ? " — passa da cota máxima possível informada (" + f2(cotaMax) + " m): use o pressurizador abaixo." : ".") });   // hid:ok até 4 pontos no texto
      /* REVISÃO A6 — MARGEM DE PROJETO (decisão RA, 14/11/2026): o pressurizador leva o ponto pior até a FAIXA VERDE (mínima × (1 + folgaMin)),
         não só até a mínima — o mesmo critério das cores, sem número novo: o ponto que só "passa raspando" é o que reclama na obra */
      var falta = Math.max.apply(null, baixos.map(function (p) { return p.pmin * (1 + FAIXA.folgaMin) - p.pdin; })), Hman = mca(falta), Q = num(o.vazao_ls, null);
      if (o.cotaPiso == null) { var pisos = ps.map(function (p) { return p.yPiso; }).filter(function (y) { return y != null && (cx.yb == null || y < cx.yb); }); if (pisos.length) o.cotaPiso = Math.max.apply(null, pisos); }
      var pz = pressurizador(Q, Hman, cx, o);
      out.push(pz);
    }
    return out;
  }
  /* o PRESSURIZADOR: vazão de projeto (L/s → m³/h) e a altura a acrescentar (o que falta no ponto pior, em mca) na curva do fabricante */
  function pressurizador(Q_ls, Hman, cx, o) {
    var Q = Q_ls != null ? Q_ls * 3600 / 1000 : null, base = { tipo: "pressurizador", vazao_m3h: Q, Hman_m: Hman, elementos: [cx.id] };
    var HP = HPz(), esc = null;
    if (HP && HP.selecionar && Q != null && Q > 0) {
      var yb = num(cx.yb, 0), Hc = num(cx.H, 0);
      try {
        /* REVISÃO A6: o EIXO na posição real — o pressurizador no piso abaixo da caixa (o.cotaPiso: o pavimento mais alto com aparelho, ou
           a casa de bombas informada) + a altura do bocal de sucção da ficha (conexoes.succao.y, mm); sem piso, no fundo da caixa (aí a
           verificação "afogada" reprova, como deve) */
        var piso = o && o.cotaPiso != null ? o.cotaPiso : yb;
        var s = HP.selecionar({ Q_m3h: Q, Hnec: function () { return Hman; }, yEixo: function (m) { var sc = m && m.conexoes && m.conexoes.succao; return piso + (sc && isFinite(Number(sc.y)) ? Number(sc.y) / 1000 : 0); }, NAmin: yb, NAmax: yb + Hc, hfSuc: function () { return 0; }, margemNpsh: null,
                                filtro: function (m) { return m && m.tipo !== "centrifuga"; } });
        esc = s && s.escolha;
      } catch (e) { esc = null; }
    }
    base.modelo = esc ? { id: esc.id, nome: esc.nome, Qop_m3h: esc.Qop, Hop_m: esc.Hop, fonte: esc.fonte } : null;
    base.texto = "Se a caixa não puder subir: PRESSURIZADOR na saída da caixa para " + (Q != null ? f2(Q) + " m³/h (" + f2(Q_ls) + " L/s, vazão de projeto)" : "a vazão de projeto (rode o dimensionamento)") + " e +" + f2(Hman) + " mca (o que falta no ponto pior até a faixa verde)" +
      (esc ? " — referência: " + esc.nome + " (ponto de operação " + f2(esc.Qop) + " m³/h × " + f2(esc.Hop) + " m; ficha: " + (esc.fonte || "catálogo") + "). Use o Corrigir do dimensionamento para modelar a instalação." : " — nenhum modelo do catálogo atende essa curva: pendência (consulte o fabricante).");
    return base;
  }

  var HidPressaoCores = { classificar: classificar, mapa: mapa, sugestoes: sugestoes, pressurizador: pressurizador, HEX: HEX, FAIXA: FAIXA };
  if (typeof module !== "undefined" && module.exports) module.exports = HidPressaoCores;
  global.HidPressaoCores = HidPressaoCores;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
