/* =====================================================================
 * hidprograma.js — PROGRAMA DE NECESSIDADES do hidrossanitário (motor
 * PURO, ES5, Node-testável). Pedido do Rogério (16/10/2026, "zero
 * configuração"): pelo USO e pelo PORTE da edificação o sistema já sabe a
 * população, o consumo diário, a reservação e quantos aparelhos são
 * exigidos — e compara com o que está no modelo.
 *
 * ⚠ Tudo vem do HidNormas, chaves programa.* (CONTRATO §1.1). A quantidade
 *   mínima de aparelhos NÃO está na 5626/8160: cada linha traz a própria
 *   fonte (NR-24, código de obras do município, NBR 9050, RDC 50…). Linha
 *   sem fonte não existe aqui. O sistema PROPÕE; o RT confirma.
 * ⚠ Arredondamento para CIMA (pessoas e aparelhos): arredondar para baixo
 *   subdimensiona sanitário e reservatório — é o lado que não pode errar.
 *
 * Bases (coluna `base` das tabelas) = campos da entrada.programa:
 *   pessoa (= população calculada), dormitorios, unidades, area_m2, leitos,
 *   alunos, funcionarios, refeicoes — ou caminho "funcionarios.homens".
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function num(v, d) { var n = Number(v); return v !== null && v !== "" && isFinite(n) ? n : d; }
  function N() { return dep("HidNormas", "./hidnormas.js"); }
  /* aparelho da tabela da norma → grupo do programa (o campo `aparelhoPrograma` das famílias hid-*):
     bacia com caixa acoplada E bacia com válvula contam como "bacia" no quadro de aparelhos mínimos. */
  var GRUPO_DO_APARELHO = { bacia_caixa_acoplada: "bacia", bacia_valvula: "bacia", pia_cozinha: "pia", chuveiro_eletrico: "chuveiro" };
  function grupo(ap) { return GRUPO_DO_APARELHO[ap] || ap; }
  function fmtN(v) { return String(Math.round(v * 100) / 100).replace(".", ","); }

  /* o valor de uma base na entrada (aceita "funcionarios.homens") */
  function valorBase(prog, base, pop) {
    if (base === "pessoa" || base === "populacao") return pop;
    var partes = String(base || "").split("."), v = prog;
    for (var i = 0; i < partes.length; i++) { if (v == null) return null; v = v[partes[i]]; }
    if (v && typeof v === "object") {                     /* {homens, mulheres} → soma */
      var s = 0; Object.keys(v).forEach(function (k) { s += num(v[k], 0); }); return s;
    }
    return num(v, null);
  }

  function populacao(prog, ctx) {
    var out = { valor: null, status: "pendente", passos: [], fonte: null, origem: null };
    if (num(prog.populacao, null) != null) {
      out.valor = Math.ceil(num(prog.populacao, 0)); out.status = "ok"; out.origem = "entrada";
      out.passos.push("população informada na entrada: " + out.valor + " pessoas (decisão do RT)");
      return out;
    }
    var c = ctx.consulta("programa.populacao", { uso: prog.uso }, "valor", "população");
    if (!c.ok) { out.passos.push("pendente: " + c.motivo); return out; }
    var L = c.linha, b = valorBase(prog, L.base, null);
    if (b == null) {
      ctx.pendencia("entrada.programa." + L.base, "o critério de população do uso \"" + prog.uso + "\" pede \"" + L.base + "\" na entrada", "população");
      out.passos.push("pendente: falta \"" + L.base + "\" na entrada"); return out;
    }
    var bruto = L.operacao === "divide" ? b / num(L.valor, NaN) : b * num(L.valor, NaN);
    if (!isFinite(bruto)) { ctx.pendencia("programa.populacao", "operação \"" + L.operacao + "\" inválida na tabela", "população"); return out; }
    out.valor = Math.ceil(bruto); out.status = "ok"; out.origem = "norma"; out.fonte = c.fonte;
    out.passos.push("P = " + L.base + " " + (L.operacao === "divide" ? "÷" : "×") + " " + fmtN(num(L.valor, 0)) + " = " + fmtN(b) + (L.operacao === "divide" ? " ÷ " : " × ") + fmtN(num(L.valor, 0)) + " = " + fmtN(bruto) + " → " + out.valor + " pessoas (arredondado para cima)");
    return out;
  }

  function consumo(prog, pop, ctx) {
    var out = { L: null, status: "pendente", passos: [], fonte: null };
    var c = ctx.consulta("programa.consumo_per_capita", { uso: prog.uso }, "litros_dia", "consumo diário");
    if (!c.ok) { out.passos.push("pendente: " + c.motivo); return out; }
    var base = c.linha.base || "pessoa", b = valorBase(prog, base, pop.valor);
    if (b == null) {
      if (base === "pessoa") out.passos.push("pendente: população não calculada");
      else { ctx.pendencia("entrada.programa." + base, "o consumo do uso \"" + prog.uso + "\" é por \"" + base + "\"", "consumo diário"); out.passos.push("pendente: falta \"" + base + "\" na entrada"); }
      return out;
    }
    out.L = num(c.valor, 0) * b; out.status = "ok"; out.fonte = c.fonte;
    out.passos.push("CD = " + fmtN(num(c.valor, 0)) + " L/dia por " + base + " × " + fmtN(b) + " = " + fmtN(out.L) + " L/dia");
    return out;
  }

  function reservacao(prog, cd, ctx) {
    var out = { minimo_L: null, maximo_L: null, incendio_L: num(prog.reservaIncendio_L, 0), total_min_L: null, status: "pendente", passos: [], fonte: null };
    var c = ctx.consulta("programa.reservacao", { uso: prog.uso }, "fator_minimo", "reservação");
    if (!c.ok) { out.passos.push("pendente: " + c.motivo); return out; }
    if (cd.L == null) { out.passos.push("pendente: consumo diário não calculado"); return out; }
    out.fonte = c.fonte;
    out.minimo_L = num(c.valor, 0) * cd.L;
    var fmax = num(c.linha.fator_maximo, null);
    if (fmax != null) out.maximo_L = fmax * cd.L;
    out.total_min_L = out.minimo_L + out.incendio_L;
    out.status = "ok";
    out.passos.push("Vmín = " + fmtN(num(c.valor, 0)) + " × CD = " + fmtN(out.minimo_L) + " L" + (fmax != null ? "; Vmáx = " + fmtN(fmax) + " × CD = " + fmtN(out.maximo_L) + " L" : ""));
    out.incendioOrigem = out.incendio_L > 0 ? (prog.reservaIncendioOrigem || "informada na entrada") : null;
    if (out.incendio_L > 0) out.passos.push("+ reserva técnica de incêndio " + fmtN(out.incendio_L) + " L (" + out.incendioOrigem + ") = " + fmtN(out.total_min_L) + " L");
    return out;
  }

  /* aparelhos exigidos: n = máx(mínimo; ⌈base ÷ a_cada⌉ × quantidade) */
  function aparelhosMinimos(prog, pop, ctx, noModelo) {
    var linhas = ctx.linhas("programa.aparelhos_minimos", { uso: prog.uso }, "aparelhos mínimos");
    if (linhas === null) return { lista: [], status: "pendente" };
    var H = N(), fonteTab = H ? H.fonte("programa.aparelhos_minimos") : null, lista = [], status = "ok";
    linhas.forEach(function (L) {
      var item = { aparelho: L.aparelho, base: L.base, baseValor: null, exigido: null, noModelo: num((noModelo || {})[L.aparelho] != null ? noModelo[L.aparelho] : (noModelo || {})[grupo(L.aparelho)], 0), falta: null, status: "pendente", regra: "", fonte: null };
      var f = {}; Object.keys(fonteTab || {}).forEach(function (k) { f[k] = fonteTab[k]; });
      if (L.fonte) { if (typeof L.fonte === "object") Object.keys(L.fonte).forEach(function (k) { f[k] = L.fonte[k]; }); else f.doc = L.fonte; }
      item.fonte = f;
      var b = valorBase(prog, L.base, pop.valor), ac = num(L.a_cada, null), q = num(L.quantidade, null), mi = num(L.minimo, 0);
      if (b == null) { ctx.pendencia("entrada.programa." + L.base, "aparelho mínimo \"" + L.aparelho + "\" é por \"" + L.base + "\"", "aparelhos mínimos"); status = "pendente"; lista.push(item); return; }
      if (!(ac > 0) || q == null) { ctx.pendencia("programa.aparelhos_minimos[" + L.aparelho + "]", "linha sem a_cada/quantidade", "aparelhos mínimos"); status = "pendente"; lista.push(item); return; }
      item.baseValor = b;
      item.exigido = Math.max(mi, Math.ceil(b / ac) * q);
      item.regra = "⌈" + fmtN(b) + " " + L.base + " ÷ " + fmtN(ac) + "⌉ × " + fmtN(q) + (mi ? " (mínimo " + mi + ")" : "") + " = " + item.exigido;
      item.falta = Math.max(0, item.exigido - item.noModelo);
      item.status = item.falta > 0 ? "reprovado" : "ok";
      if (item.falta > 0 && status === "ok") status = "reprovado";
      lista.push(item);
    });
    return { lista: lista, status: status };
  }

  function calcular(prog, ctx, noModelo) {
    var H = N();
    ctx = ctx || H.contexto();
    prog = prog || {};
    if (!prog.uso) {
      ctx.pendencia("entrada.programa.uso", "uso da edificação não informado — sem ele não há programa", "programa");
      return { uso: null, status: "pendente", populacao: null, consumoDiario: null, reservacao: null, aparelhosMinimos: [], avisos: [] };
    }
    var pop = populacao(prog, ctx), cd = consumo(prog, pop, ctx), rs = reservacao(prog, cd, ctx), ap = aparelhosMinimos(prog, pop, ctx, noModelo);
    var avisos = ap.lista.filter(function (i) { return i.falta > 0; }).map(function (i) {
      return { gravidade: "aviso", texto: "faltam " + i.falta + " " + i.aparelho.replace(/_/g, " ") + " (exigido " + i.exigido + ", no modelo " + i.noModelo + " — " + (i.fonte && i.fonte.doc ? i.fonte.doc : "fonte") + ")",
               corrigir: { texto: "colocar " + i.falta + " " + i.aparelho.replace(/_/g, " ") + " no modelo, ou o RT registra a dispensa" } };
    });
    var sts = [pop.status, cd.status, rs.status, ap.status];
    var status = sts.indexOf("pendente") >= 0 ? "pendente" : (sts.indexOf("reprovado") >= 0 ? "reprovado" : "ok");
    return { uso: prog.uso, status: status, populacao: pop, consumoDiario: cd, reservacao: rs, aparelhosMinimos: ap.lista, avisos: avisos };
  }

  /* ================================================ RESERVATÓRIOS DO MODELO × RESERVAÇÃO
   * Revisão da junção J3 (ALTO): o programa calculava a reservação total (consumo × dias + reserva
   * técnica de incêndio) e nenhum motor conferia o volume das caixas MODELADAS — a capa dizia
   * "Atende" com 500 L para 900 L exigidos. E, com incêndio, nada garantia que o consumo diário não
   * esvazia a reserva técnica (a saída de consumo tem de ficar ACIMA do volume da reserva).
   *   reservatorios = [{ id, volume_L|null, diametro_m|null, ySaida_m|null (saída de consumo, do fundo) }]
   *   catalogo = [{ volume_L, nome }] (caixas do fabricante) para a ação "trocar por caixa de X L"
   *   declarado = true quando o RT declara a saída de consumo acima da reserva (premissa)
   * Devolve { verificacoes[], pendencias[] (chave, motivo), premissas[] } — o orquestrador junta. */
  function verificarReservatorios(prog, reservatorios, catalogo, declarado, ctx, uso) {
    var out = { verificacoes: [], pendencias: [], premissas: [] }, rs = prog && prog.reservacao;
    if (!rs) return out;
    function v(alvo, nome, valor, limite, ok, passos, fonte, corrigir) { out.verificacoes.push({ alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: "L", ok: ok, status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), passos: passos, fonte: fonte || null, corrigir: corrigir || null }); }
    var lista = Array.isArray(reservatorios) ? reservatorios : [];
    if (!lista.length) {
      out.pendencias.push({ chave: "modelo.reservatorio", motivo: "nenhuma caixa d'água/reservatório no modelo: o volume exigido não foi conferido" });
      v("reservatorio", "volume dos reservatórios × reservação", null, rs.total_min_L, null, ["pendente: sem reservatório no modelo"], rs.fonte, { texto: "colocar a caixa d'água no modelo (biblioteca hid-caixa-dagua)" });
      return out;
    }
    if (rs.status === "pendente" || rs.total_min_L == null) { v(lista[0].id, "volume dos reservatórios × reservação", null, null, null, ["pendente: reservação exigida não calculada (ver programa)"], null); return out; }
    var semVol = lista.filter(function (r) { return num(r.volume_L, null) == null; });
    if (semVol.length) {
      semVol.forEach(function (r) { out.pendencias.push({ chave: "modelo.reservatorio[" + r.id + "].Volume_L", motivo: "a família do reservatório " + r.id + " não declara o volume (Volume_L)" }); });
      v(semVol[0].id, "volume dos reservatórios × reservação", null, rs.total_min_L, null, ["pendente: reservatório sem volume declarado (" + semVol.map(function (r) { return r.id; }).join(", ") + ")"], rs.fonte, { texto: "usar a família hid-caixa-dagua (volume do catálogo) ou informar Volume_L" });
      return out;
    }
    var soma = lista.reduce(function (s, r) { return s + num(r.volume_L, 0); }, 0), exig = rs.total_min_L, okV = soma >= exig;
    var passos = ["Σ volume das caixas do modelo = " + lista.map(function (r) { return fmtN(num(r.volume_L, 0)) + " L (" + r.id + ")"; }).join(" + ") + " = " + fmtN(soma) + " L",
                  "exigido = reservação mínima " + fmtN(rs.minimo_L) + " L" + (rs.incendio_L > 0 ? " + reserva técnica de incêndio " + fmtN(rs.incendio_L) + " L" : "") + " = " + fmtN(exig) + " L"];
    var acao = null;
    if (!okV) {
      var maior = Math.max.apply(null, lista.map(function (r) { return num(r.volume_L, 0); })), precisa = exig - (soma - maior);
      var cat = (Array.isArray(catalogo) ? catalogo : []).filter(function (c) { return num(c.volume_L, null) != null && num(c.volume_L, 0) >= precisa; }).sort(function (a, b) { return a.volume_L - b.volume_L; })[0];
      acao = { texto: cat ? "trocar a caixa de " + fmtN(maior) + " L por uma de " + fmtN(cat.volume_L) + " L (" + cat.nome + ")" : "nenhuma caixa do catálogo tem " + fmtN(precisa) + " L: acrescentar reservatórios (faltam " + fmtN(exig - soma) + " L)" };
      passos.push("faltam " + fmtN(exig - soma) + " L");
    }
    v(lista.length === 1 ? lista[0].id : "reservatorio", "volume dos reservatórios × reservação", soma, exig, okV, passos, rs.fonte, acao);
    /* NBR 5626:2020, 6.5.6.3 (NOTA): acima de 3 dias de consumo, risco à potabilidade — AVISO, não reprovação */
    var H0 = N(), cMax = H0 ? H0.consulta("programa.reservacao.recomendacao_max_dias", null, "valor") : { ok: false }, cons = prog.consumoDiario && prog.consumoDiario.L;
    out.avisos = [];
    if (cMax.ok && cons > 0) {
      if (ctx) ctx.consulta("programa.reservacao.recomendacao_max_dias", null, "valor", "reservatório");
      var diasMax = num(cMax.valor, 0), consumoRes = soma - (rs.incendio_L || 0);
      if (consumoRes > diasMax * cons) out.avisos.push({ gravidade: "aviso", texto: "o volume para consumo (" + fmtN(consumoRes) + " L) passa de " + fmtN(diasMax) + " dias de consumo (" + fmtN(diasMax * cons) + " L): risco à potabilidade (NBR 5626:2020, 6.5.6.3, NOTA)", alvo: lista[0].id,
                                                          corrigir: { texto: "reduzir o volume para no máximo " + fmtN(diasMax * cons + (rs.incendio_L || 0)) + " L (consumo + incêndio)" } });
    }
    /* NBR 5626:2020, 6.5.6.5: reservatório ELEVADO com 2 ou mais compartimentos, exceto residência unifamiliar
       isolada. Compartimentos = soma do parâmetro "Compartimentos" das famílias (1 por caixa quando a família
       não declara); só os reservatórios elevados (função "inferior" fora). */
    var elev = lista.filter(function (r) { return r.funcao !== "inferior"; });
    if (elev.length) {
      var cC = H0 ? H0.consulta("af.reservatorio.compartimentos_min", { uso: uso || "" }, "minimo") : { ok: false };
      if (!uso) { out.pendencias.push({ chave: "entrada.programa.uso", motivo: "uso da edificação não informado: o nº mínimo de compartimentos do reservatório elevado não foi verificado" });
                  v(elev[0].id, "compartimentos do reservatório elevado (6.5.6.5)", null, null, null, ["pendente: uso não informado"], null); }
      else if (!cC.ok) { if (ctx) ctx.consulta("af.reservatorio.compartimentos_min", { uso: uso }, "minimo", "reservatório"); v(elev[0].id, "compartimentos do reservatório elevado (6.5.6.5)", null, null, null, ["pendente: " + cC.motivo], null); }
      else {
        if (ctx) ctx.consulta("af.reservatorio.compartimentos_min", { uso: uso }, "minimo", "reservatório");
        var nC = elev.reduce(function (s0, r) { return s0 + (num(r.compartimentos, null) != null ? num(r.compartimentos, 1) : 1); }, 0), minC = num(cC.valor, 0), okC = nC >= minC;
        v(elev.length === 1 ? elev[0].id : "reservatorio", "compartimentos do reservatório elevado (6.5.6.5)", nC, minC, okC,
          ["reservatório elevado com " + nC + " compartimento(s) ≥ " + minC + " (" + (uso === "residencial_unifamiliar" ? "residência unifamiliar isolada: dispensa" : "NBR 5626:2020, 6.5.6.5") + ")"], cC.fonte,
          okC ? null : { texto: "usar " + minC + " caixas (ou caixa compartimentada) no reservatório elevado; o menor compartimento atende o pico durante a manutenção" });
        if (uso === "residencial_unifamiliar") out.premissas.push({ item: "residência unifamiliar", valor: "considerada ISOLADA (6.5.6.5): reservatório elevado de 1 compartimento", origem: "padrao_motor" });
      }
    }
    /* reserva técnica: volume ABAIXO da saída de consumo (cilindro: π·D²/4·h) ≥ reserva de incêndio */
    if (rs.incendio_L > 0) {
      var geo = lista.filter(function (r) { return num(r.diametro_m, null) != null && num(r.ySaida_m, null) != null; });
      if (geo.length === lista.length) {
        var abaixo = geo.reduce(function (s, r) { return s + Math.PI * r.diametro_m * r.diametro_m / 4 * r.ySaida_m * LITROS_M3; }, 0);   // hid:ok área do círculo πD²/4
        var okR = abaixo >= rs.incendio_L;
        v(lista.length === 1 ? lista[0].id : "reservatorio", "reserva técnica preservada (saída de consumo acima da reserva)", abaixo, rs.incendio_L, okR,
          ["volume abaixo da saída de consumo = Σ π·D²/4·h_saída = " + fmtN(abaixo) + " L ≥ reserva de incêndio " + fmtN(rs.incendio_L) + " L"], null,
          okR ? null : { texto: "subir a saída de consumo (ou pôr a saída de incêndio no fundo e a de consumo acima de " + fmtN(rs.incendio_L) + " L de lâmina)" });
      } else if (declarado) {
        out.premissas.push({ item: "reserva técnica de incêndio", valor: "saída de consumo declarada acima da reserva de " + fmtN(rs.incendio_L) + " L (o modelo não tem a geometria para conferir)", origem: "entrada" });
        v(lista[0].id, "reserva técnica preservada (saída de consumo acima da reserva)", null, rs.incendio_L, true, ["declarado pelo RT (entrada.alimentacao.saidaConsumoAcimaReserva)"], null);
      } else {
        out.pendencias.push({ chave: "modelo.reservatorio.saidaConsumo", motivo: "não há como conferir que a saída de consumo fica acima da reserva técnica de incêndio (" + fmtN(rs.incendio_L) + " L)" });
        v(lista[0].id, "reserva técnica preservada (saída de consumo acima da reserva)", null, rs.incendio_L, null, ["pendente: reservatório sem diâmetro/cota da saída de consumo"], null,
          { texto: "declarar a disposição das saídas (entrada.alimentacao.saidaConsumoAcimaReserva = true) ou usar família com diâmetro e saída de consumo" });
      }
    }
    return out;
  }
  var LITROS_M3 = 1000;

  /* ================================================ ACESSIBILIDADE (NBR 9050:2020, Seção 7)
   * Fonte PRIMÁRIA (publicação gratuita oficial, coleção MPF). Substitui a linha secundária do TCE-SC.
   *   Tabela 7: sanitários acessíveis = fração de CADA peça (5 %) com mínimo por sexo/pavimento conforme a
   *   classe de uso e a situação (nova, ampliada, existente); 7.4.5: banheiros e vestiários (chuveiro) 5 %,
   *   no mínimo um de cada; 7.10.4: mictório — pelo menos um acessível em cada sanitário que tem mictório.
   *   aparelhos = [{ id, grupo (bacia|lavatorio|mictorio|chuveiro), acessivel (true|false|null), pavimento,
   *                  famId, valores }]
   * Devolve { itens (mesmo formato do quadro de aparelhos mínimos), verificacoes, pendencias }.
   * Classe: prog.classeUso, ou pelo uso (residencial unifamiliar = não se aplica; multifamiliar = privado
   * áreas comuns; demais = coletivo; prog.publico = público). Situação: prog.situacao (padrão "nova"). */
  function classeUso9050(prog) {
    if (prog.classeUso) return prog.classeUso;
    if (prog.publico) return "publico";
    if (!prog.uso || prog.uso === "residencial_unifamiliar") return null;
    if (/^residencial/.test(prog.uso)) return "privado_comum";
    return "coletivo";
  }
  function acessibilidade(prog, aparelhos, ctx) {
    var out = { itens: [], verificacoes: [], pendencias: [], classe: classeUso9050(prog || {}), situacao: (prog && prog.situacao) || "nova" };
    var lista = Array.isArray(aparelhos) ? aparelhos : [];
    if (!prog || !out.classe || !lista.length) return out;
    var linha = ctx.consulta("ac9050.tabela7", { classe: out.classe, situacao: out.situacao }, "minimo", "acessibilidade");
    if (!linha.ok) { out.pendencias.push({ chave: "ac9050.tabela7", motivo: linha.motivo }); return out; }
    var L = linha.linha, frac = num(L.fracao_pct, null), minimo = num(L.minimo, 1), divSexo = !!prog.divisaoPorSexo;
    var bv = ctx.consulta("ac9050.banheiros_vestiarios", null, "fracao_pct", "acessibilidade");
    var grupos = { bacia: "sanitário (Tabela 7)", lavatorio: "sanitário (Tabela 7)", mictorio: "mictório (7.10.4)", chuveiro: "banheiro/vestiário (7.4.5)" };
    var semInfo = lista.length && lista.every(function (a) { return a.acessivel == null; });
    Object.keys(grupos).forEach(function (g) {
      var dg = lista.filter(function (a) { return a.grupo === g; }); if (!dg.length) return;
      var n = dg.length, pavs = {}; dg.forEach(function (a) { pavs[a.pavimento == null ? "?" : a.pavimento] = 1; });
      var nPav = Object.keys(pavs).length, exig, regra, fonte = linha.fonte;
      if (g === "chuveiro") {
        if (!bv.ok) { out.pendencias.push({ chave: "ac9050.banheiros_vestiarios", motivo: bv.motivo }); return; }
        var fb = num(bv.valor, 0), mb = num(bv.linha.minimo, 1);
        exig = Math.max(mb, Math.ceil(fb / 100 * n)); regra = "⌈" + fb + " % × " + n + "⌉, mínimo " + mb + " (7.4.5)"; fonte = bv.fonte;
      } else if (g === "mictorio") {
        exig = 1; regra = "pelo menos um mictório acessível em cada sanitário com mictório (7.10.4)";
      } else {
        var porPav = L.por === "sexo_pavimento" ? nPav * (divSexo ? 2 : 1) : (L.por === "pavimento" ? nPav : 1);
        exig = Math.max(minimo * porPav, frac != null ? Math.ceil(frac / 100 * n) : 0);
        regra = (frac != null ? "⌈" + frac + " % × " + n + "⌉" : "") + " e mínimo " + minimo + (L.por === "sexo_pavimento" ? " por sexo em cada pavimento" : (L.por === "pavimento" ? " por pavimento" : "")) + " → " + exig + " (Tabela 7: " + L.texto + ")";
      }
      var acc = dg.filter(function (a) { return a.acessivel === true; }).length;
      var item = { aparelho: g + "_acessivel", base: "peças " + g + " no modelo", baseValor: n, exigido: exig, noModelo: semInfo ? 0 : acc, falta: null, status: "pendente", regra: regra, fonte: fonte };
      if (semInfo) out.pendencias.push({ chave: "entrada.acessiveis", motivo: "nenhum aparelho do modelo está marcado como acessível ou não (entrada.acessiveis[id] = true/false, ou parâmetro Acessivel da família): a quantidade da NBR 9050 (Tabela 7) não foi verificada" });
      else { item.falta = Math.max(0, exig - acc); item.status = item.falta > 0 ? "reprovado" : "ok"; }
      out.itens.push(item);
    });
    /* dimensões dos aparelhos ACESSÍVEIS (parâmetros da família); barras, giro e transferência dependem do ambiente */
    function dim(par) { var c = ctx.consulta("ac9050.dimensoes", { parametro: par }, "item", "acessibilidade"); return c.ok ? { min: num(c.linha.min, null), max: num(c.linha.max, null), item: c.linha.item, fonte: c.fonte } : null; }
    function vfx(a, nome, valor, d, unidadeTxt) {
      if (!d) return;
      var ok = valor == null ? null : ((d.min == null || valor >= d.min - EPS9050) && (d.max == null || valor <= d.max + EPS9050));
      out.verificacoes.push({ alvo: a.id, nome: nome + " (NBR 9050, " + d.item + ")", valor: valor, limite: d.max != null ? d.max : d.min, unidade: "m", ok: ok, status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"),
                              passos: [valor == null ? "pendente: a família não informa " + unidadeTxt : unidadeTxt + " = " + fmtN(valor) + " m" + (d.min != null ? " ≥ " + fmtN(d.min) : "") + (d.max != null ? " ≤ " + fmtN(d.max) : "") + " m"], fonte: d.fonte });
    }
    lista.filter(function (a) { return a.acessivel === true; }).forEach(function (a) {
      var v = a.valores || {};
      if (a.grupo === "bacia") {
        if (v.Altura_borda != null) vfx(a, "altura da bacia sem o assento", num(v.Altura_borda, null), dim("bacia_altura_sem_assento"), "altura da borda (sem assento)");
        else vfx(a, "altura da bacia com o assento", v.Altura_assento != null ? num(v.Altura_assento, null) : null, dim("bacia_altura_com_assento"), "altura do assento");
      }
      if (a.grupo === "lavatorio") {
        vfx(a, "altura da superfície do lavatório", v.Altura_borda != null ? num(v.Altura_borda, null) : null, dim("lavatorio_superficie"), "altura da borda");
        if (/coluna/.test(a.famId || "")) out.verificacoes.push({ alvo: a.id, nome: "lavatório acessível sem coluna (NBR 9050, 7.5 d)", valor: null, limite: null, unidade: "", ok: false, status: "reprovado", passos: ["lavatório de coluna não é permitido no sanitário acessível (só suspenso, coluna suspensa ou sobre tampo)"], fonte: linha.fonte });
      }
      /* barras de apoio, giro Ø 1,50 m, transferência 0,80 × 1,20 m, boxe 0,90 × 0,95 m: o modelo não traz ainda */
      var giro = dim("giro_diametro"), tr = dim("transferencia_largura"), tc = dim("transferencia_comprimento"), bar = dim("barra_bacia_altura");
      if (a.grupo === "bacia" && giro && tr && tc && bar) out.verificacoes.push({ alvo: a.id, nome: "barras de apoio, giro e transferência do sanitário acessível (NBR 9050, 7.5 e 7.7)", valor: null, limite: null, unidade: "m", ok: null, status: "pendente",
        passos: ["pendente: barras (0,75 m de altura, horizontal ≥ " + fmtN(dim("barra_bacia_horizontal_comprimento").min) + " m, vertical ≥ " + fmtN(dim("barra_bacia_vertical_comprimento").min) + " m), giro Ø " + fmtN(giro.min) + " m e área de transferência " + fmtN(tr.min) + " × " + fmtN(tc.min) + " m não estão no modelo — conferir no ambiente"], fonte: giro.fonte,
        corrigir: { texto: "modelar as barras de apoio e conferir o giro Ø " + fmtN(giro.min) + " m e a transferência " + fmtN(tr.min) + " × " + fmtN(tc.min) + " m no ambiente" } });
    });
    return out;
  }
  var EPS9050 = 1e-9;   // hid:ok tolerância de ponto flutuante (a tolerância da 7.2 vem da norma como texto)

  var HidPrograma = { VERSAO: 1, calcular: calcular, verificarReservatorios: verificarReservatorios, acessibilidade: acessibilidade, classeUso9050: classeUso9050, valorBase: valorBase, grupo: grupo, GRUPO_DO_APARELHO: GRUPO_DO_APARELHO };
  global.HidPrograma = HidPrograma;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPrograma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
