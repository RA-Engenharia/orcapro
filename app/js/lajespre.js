/* =====================================================================
 * lajespre.js — MOTOR DAS LAJES PRÉ-FABRICADAS (14/11/2026). Motor PURO (ES5, sem DOM), Node-testável.
 *
 * O QUE FAZ
 *   · escolher(par): dado o vão, a sobrecarga e o apoio, percorre o CATÁLOGO (js/lajespredados.js, gerado de
 *     dados-fonte/concreto/lajes-pre/catalogo.json) e devolve, por série: se atende, a altura, a armadura adicional da TABELA DO
 *     FABRICANTE, o peso próprio, o volume de capa e as quantidades por m² (vigotas, enchimento) — cada número com a fonte.
 *   · consultar(serie, par): a leitura da tabela de UMA série (vão arredondado PARA CIMA e carga PARA CIMA: nunca interpola, nunca
 *     abate o que o fabricante imprimiu).
 *   · duplicar(id, alteracoes): o usuário copia uma série e muda parâmetros; a cópia nasce marcada "parâmetro do usuário" e a tabela
 *     do fabricante NÃO vale mais para ela (a geometria mudou) — sem tabela própria, o motor recusa em vez de adivinhar.
 *
 * REGRAS DA CASA (por que é assim)
 *  1. NÚMERO DE CATÁLOGO NÃO É CÁLCULO. O motor lê a tabela do fabricante e diz de quem é; não verifica flecha nem flexão (isso é do
 *     js/conclaje.js → trelicada(), que usa a nervura como viga T). A tabela é o que torna "a altura da treliçada" defensável, não o resultado.
 *  2. CARGA PERMANENTE: a tabela da Puma admite 50 kgf/m² de permanente adicional, a da Belgo 30 kgf/m². Se o projeto tiver MAIS que isso,
 *     a diferença é somada à acidental (conservador: a flecha só da acidental fica pior, a resistência fica igual); se tiver MENOS, não se abate.
 *  3. VÃO > 6,0 m, carga acidental > 5,0 kN/m² ou obra > 200 m²: a NBR 14859-1:2002, 6.3.1 exige ENSAIO do conjunto de componentes
 *     (anexo A). O motor avisa; não esconde a tabela (o fabricante imprime vãos de até 10,8 m), mas o aviso acompanha o resultado.
 *  4. "Laje não ok / N/A" do fabricante = NÃO ATENDE (nunca "sem armadura").
 *  5. Tabela da fonte com erro de impressão (vão que SOBE com a carga na vigota protendida da Construrohr): usa-se o mínimo acumulado.
 *
 * Testes: node tools/test-lajespre.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var D = dep("LajesPreDados", "./lajespredados.js");
  var KGF_KN = 101.971621;           /* 1 kN/m² = 101,97 kgf/m² */
  var EPS = 1e-9;
  var PESO_ACO = 7850;               /* kg/m³ (NBR 6118:2014, 8.2.1 — usado só para a massa da armadura adicional) */

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function fonteTxt(s) {
    if (!D || !s || !s.fonte) return "";
    var f = D.fontes[s.fonte.id];
    return f ? (f.fabricante + " — " + f.documento + " (" + f.data + "), p. " + s.fonte.pag) : String(s.fonte.id);
  }

  /* ---------------------------------------------------------------- catálogo */
  function tipos() { return D ? D.tipos : []; }
  function todasSeries() {
    var o = [];
    tipos().forEach(function (t) { t.series.forEach(function (s) { o.push({ tipo: t, serie: s }); }); });
    return o.concat(usuario.map(function (s) { return { tipo: tipoDe(s.tipoId), serie: s }; }));
  }
  var usuario = [];   /* séries duplicadas pelo usuário (vivem só na sessão; quem persiste é o chamador) */
  function tipoDe(id) { var r = null; tipos().forEach(function (t) { if (t.id === id) r = t; }); return r; }
  function serie(id) {
    var r = null;
    todasSeries().forEach(function (x) { if (x.serie.id === id) r = x.serie; });
    return r;
  }
  function tipoDaSerie(id) { var r = null; todasSeries().forEach(function (x) { if (x.serie.id === id) r = x.tipo; }); return r; }
  function series(filtro) {
    var f = filtro || {};
    return todasSeries().filter(function (x) {
      var s = x.serie;
      if (f.tipo && x.tipo && x.tipo.id !== f.tipo) return false;
      if (f.enchimento && f.enchimento !== "qualquer" && s.enchimento !== f.enchimento) return false;
      if (f.fabricante && String(s.fabricante || "").toLowerCase().indexOf(String(f.fabricante).toLowerCase()) < 0) return false;
      if (f.fonte && s.fonte && s.fonte.id !== f.fonte) return false;
      if (f.hMin != null && s.h != null && s.h < f.hMin) return false;
      if (f.hMax != null && s.h != null && s.h > f.hMax) return false;
      if (f.semUsuario && s.usuario) return false;
      return true;
    }).map(function (x) { return x.serie; });
  }

  /* ---------------------------------------------------------------- armadura */
  /* "2-5/16" → 2 barras de 8,0 mm CA50 ; "1-10,0" → CA50 ; "3-4,2" → CA60 (regra: dados.aco.regra) */
  function celula(txt) {
    var c = String(txt == null ? "" : txt).trim();
    if (c === "S") return { tipo: "S", texto: "sem armadura adicional" };
    if (c === "N" || c === "N/A") return { tipo: "N", texto: "não atende (fabricante: consultar outra altura)" };
    var m = /^(\d)-(.+)$/.exec(c);
    if (!m) return { tipo: "?", texto: c };
    var d, aco;
    if (m[2] === "5/16") { d = 8.0; aco = "CA50"; }
    else {
      d = Number(m[2].replace(",", "."));
      aco = (d === 4.2 || d === 5.0 || d === 6.0 || d === 8.0) ? "CA60" : "CA50";
    }
    var n = Number(m[1]), area = Math.PI * d * d / 400;   /* cm² por barra */
    return { tipo: "barras", n: n, d: d, aco: aco, areaCm2: r3(n * area), massaKgM: r3(n * area * 1e-4 * PESO_ACO), texto: n + " Ø " + String(d).replace(".", ",") + " mm " + aco };
  }

  /* ---------------------------------------------------------------- geometria nominal da série */
  function geometria(s) {
    var i = num(s.intereixo, 0) / 100, bv = num(s.bVigota, 12) / 100, hb = s.hBase != null ? num(s.hBase, 3) / 100 : null;
    var assumidos = [];
    if (hb == null) { hb = 0.03; assumidos.push("hBase = 3 cm (padrão Belgo/Puma; a fonte desta série não informa)"); }
    var wmin = (D && D.normas && D.normas.nervuraLarguraMinima ? D.normas.nervuraLarguraMinima.cm : 4) / 100;
    var w = s.larguraEnch != null ? num(s.larguraEnch, 0) / 100 : null;
    if (w == null && s.enchimento === "ceramica") { w = i - bv; assumidos.push("largura da lajota/tavela = intereixo − largura da base da vigota (apoia nas bordas da base, como nas séries da Puma: 30 + 12 = 42; a fonte não informa)"); }
    else if (w == null) { w = i - wmin; assumidos.push("largura do enchimento = intereixo − 4 cm (nervura mínima da NBR 14859-1:2002, 5.4; a fonte não informa)"); }
    return { i: i, bv: bv, hBase: hb, hEnch: num(s.hEnch, 0) / 100, hCapa: num(s.hCapa, 0) / 100, h: num(s.h, 0) / 100, wEnch: w, comprEnch: s.comprEnch != null ? num(s.comprEnch, 0) / 100 : null,
             nervura: i - w, assumidos: assumidos, degrau: w > i - bv + EPS };
  }

  /* ---------------------------------------------------------------- consulta à tabela de UMA série */
  function proximo(lista, v) {   /* menor elemento ≥ v (índice) */
    for (var k = 0; k < lista.length; k++) if (lista[k] >= v - EPS) return k;
    return -1;
  }
  var REV_PADRAO_KGF = 100;   /* revestimento padrão quando o pedido não informa (1,0 kN/m²) — decisão da revisão de cálculo de 14/11/2026 */
  function cummin(v) { var o = [], m = Infinity; v.forEach(function (x) { m = Math.min(m, x); o.push(m); }); return o; }

  function consultar(s, par) {
    par = par || {};
    var vao = num(par.vaoM, NaN), acid = par.sobrecargaKgfM2 != null ? num(par.sobrecargaKgfM2, NaN) : (par.sobrecargaKnM2 != null ? num(par.sobrecargaKnM2, NaN) * KGF_KN : NaN);
    var rev = num(par.revestimentoKgfM2, null), revAssumido = false;
    /* ⚠ revestimento ausente (revisão de cálculo 14/11/2026): antes valia "nenhum" (0 ou, nas tabelas de vão máximo, 100 sem avisar) e a laje podia passar com um piso que ninguém considerou.
     * Agora vale o padrão do produto, 100 kgf/m² (1,0 kN/m²), e o resultado traz o aviso — informe o revestimento real. */
    if (rev == null) { rev = REV_PADRAO_KGF; revAssumido = true; }
    var out = { serieId: s.id, designacao: s.designacao, fonte: fonteTxt(s), ok: false, status: "", avisos: [], notas: [] };
    if (revAssumido) out.avisos.push("revestimento NÃO informado: adotado o padrão de " + REV_PADRAO_KGF + " kgf/m² (1,0 kN/m²) — informe o revestimento real");
    if (!isFinite(vao) || vao <= 0) { out.status = "entrada"; out.motivo = "informe o vão (m)"; return out; }
    if (!isFinite(acid) || acid < 0) { out.status = "entrada"; out.motivo = "informe a sobrecarga acidental (kgf/m² ou kN/m²)"; return out; }
    var T = s.tabela;
    if (s.usuario && s.usuario.geometriaAlterada && !(T && T.origem === "usuario")) {
      out.status = "parametro-do-usuario";
      out.motivo = "série duplicada com parâmetros alterados: a tabela do fabricante NÃO vale para esta geometria; informe a tabela própria (origem \"usuario\") ou verifique pela nervura em js/conclaje.js";
      out.parametroDoUsuario = true; return out;
    }
    /* ⚠ balanço (revisão 14/11/2026): as tabelas dos fabricantes são de laje bi-apoiada; num balanço o momento negativo no engaste é outro problema — consultar "ok" seria afirmar o que a fonte não traz */
    if (par.apoio === "balanco" || par.apoio === "balanço") { out.status = "balanco"; out.motivo = "laje em balanço: as tabelas dos fabricantes são de laje bi-apoiada (apoio simples) — balanço exige cálculo próprio (momento negativo no engaste)"; return out; }
    if (par.apoio && par.apoio !== "simples") out.avisos.push("as tabelas dos fabricantes são para apoio SIMPLES (laje unidirecional bi-apoiada); apoio \"" + par.apoio + "\" exige cálculo próprio");
    if (T.tipo === "armadura-adicional") {
      var base = num(s.base && s.base.permanenteAdicionalKgfM2, 0), extra = rev == null ? 0 : Math.max(0, rev - base);
      var eff = acid + extra;
      if (extra > 0) out.notas.push("permanente adicional " + rev + " kgf/m² > " + base + " da tabela: a diferença (" + extra + ") foi somada à sobrecarga (conservador)");
      if (rev != null && rev < base) out.notas.push("permanente adicional " + rev + " < " + base + " da tabela: não abatido (a tabela já admite " + base + ")");
      var iv = proximo(T.vaosM, vao), ic = proximo(T.cargasKgfM2, eff);
      out.vaoTabelaM = iv < 0 ? null : T.vaosM[iv]; out.cargaTabelaKgfM2 = ic < 0 ? null : T.cargasKgfM2[ic]; out.cargaEfetivaKgfM2 = eff;
      if (iv < 0) { out.status = "vao-fora-da-tabela"; out.motivo = "vão " + vao + " m acima do maior vão tabelado (" + T.vaosM[T.vaosM.length - 1] + " m)"; return out; }
      if (ic < 0) { out.status = "carga-fora-da-tabela"; out.motivo = "carga " + r2(eff) + " kgf/m² acima da maior tabelada (" + T.cargasKgfM2[T.cargasKgfM2.length - 1] + ")"; return out; }
      var cel = celula(T.celulas[iv][ic]);
      out.celula = cel; out.celulaTexto = T.celulas[iv][ic];
      if (cel.tipo === "N") { out.status = "nao-atende"; out.motivo = "o fabricante marca esta célula como \"laje não ok / N/A\" (vão " + out.vaoTabelaM + " m, " + out.cargaTabelaKgfM2 + " kgf/m²)"; return out; }
      if (cel.tipo === "?") { out.status = "celula-ilegivel"; out.motivo = "célula fora do formato: " + out.celulaTexto; return out; }
      out.ok = true; out.status = "ok";
      out.armaduraAdicional = cel.tipo === "S" ? { semArmaduraAdicional: true, texto: cel.texto } : { n: cel.n, dMm: cel.d, aco: cel.aco, areaCm2PorVigota: cel.areaCm2, massaKgMPorVigota: cel.massaKgM, texto: cel.texto, por: T.armaduraPor };
      if (T.contraFlechaPorCarga) out.contraFlecha = { valor: T.contraFlechaPorCarga[ic], unidade: T.contraFlechaUnidade };
      return out;
    }
    if (T.tipo === "vao-maximo") {   /* Construrohr: um vão máximo por combinação (acidental, revestimento) */
      var rv = rev == null ? 100 : rev, melhor = -1, k;
      for (k = 0; k < T.combinacoes.length; k++) {
        var cb = T.combinacoes[k];
        if (cb.acidentalKgfM2 >= acid - EPS && cb.revestimentoKgfM2 >= rv - EPS) {
          if (melhor < 0 || cb.acidentalKgfM2 < T.combinacoes[melhor].acidentalKgfM2 || (cb.acidentalKgfM2 === T.combinacoes[melhor].acidentalKgfM2 && cb.revestimentoKgfM2 < T.combinacoes[melhor].revestimentoKgfM2)) melhor = k;
        }
      }
      if (melhor < 0) { out.status = "carga-fora-da-tabela"; out.motivo = "acidental " + r2(acid) + " + revestimento " + rv + " kgf/m² fora das combinações do fabricante (até 500 + 150)"; return out; }
      out.combinacao = T.combinacoes[melhor]; out.vaoMaximoM = T.vaoMaxM[melhor];
      out.notas.push("tabela ORIENTATIVA de vão máximo: o fabricante não publica a armadura adicional (pedir ao fornecedor/projeto de montagem)");
      if (vao > T.vaoMaxM[melhor] + EPS) { out.status = "vao-acima-do-maximo"; out.motivo = "vão " + vao + " m > máximo " + T.vaoMaxM[melhor] + " m"; return out; }
      out.ok = true; out.status = "ok"; out.armaduraAdicional = { informada: false, texto: "não informada pelo fabricante" }; return out;
    }
    if (T.tipo === "vao-maximo-por-vigota") {   /* vigota protendida: escolhe o menor nº de fios que vence o vão */
      var rv2 = rev == null ? 100 : rev;
      if (rv2 > 100 + EPS) { out.status = "carga-fora-da-tabela"; out.motivo = "revestimento " + rv2 + " > 100 kgf/m² da tabela"; return out; }
      var ci = proximo(T.combinacoes.map(function (c) { return c.acidentalKgfM2; }), acid);
      if (ci < 0) { out.status = "carga-fora-da-tabela"; out.motivo = "acidental " + r2(acid) + " acima de 500 kgf/m²"; return out; }
      var achou = null;
      T.vigotas.forEach(function (v) { if (!achou && cummin(v.vaoMaxM)[ci] >= vao - EPS) achou = v; });
      if (!achou) { out.status = "vao-acima-do-maximo"; out.motivo = "vão " + vao + " m acima do que 7 fios vencem (" + cummin(T.vigotas[T.vigotas.length - 1].vaoMaxM)[ci] + " m)"; return out; }
      out.ok = true; out.status = "ok"; out.vigota = { fios: achou.fios, codigos: achou.codigos }; out.vaoMaximoM = cummin(achou.vaoMaxM)[ci];
      out.armaduraAdicional = { informada: false, texto: achou.fios + " fios de protensão (vigota protendida)" };
      if (T.anomalia) out.notas.push("anomalia da fonte: " + T.anomalia);
      if (s.base && s.base.escoramento) out.notas.push("escoramento: " + s.base.escoramento);
      return out;
    }
    if (T.tipo === "vao-maximo-por-painel") {   /* alveolar: sobrecarga = acidental + revestimento (kN/m²); vão em cm */
      var comCapa = par.comCapa !== false;
      var totKn = (acid + (rev == null ? 0 : rev)) / KGF_KN;
      var lin = null, p0 = T.paineis[0];
      for (var q = 0; q < p0.vaoMaxCm.length; q++) if (p0.vaoMaxCm[q].sobrecargaKnM2 >= totKn - EPS) { lin = q; break; }
      if (lin == null) { out.status = "carga-fora-da-tabela"; out.motivo = "sobrecarga " + r2(totKn) + " kN/m² acima de 15"; return out; }
      var pn = null;
      T.paineis.forEach(function (p) { var v = p.vaoMaxCm[lin][comCapa ? "comCapa" : "semCapa"]; if (!pn && v * 0.01 >= vao - EPS) pn = { painel: p, vaoMaxCm: v }; });
      out.sobrecargaTabelaKnM2 = p0.vaoMaxCm[lin].sobrecargaKnM2;
      if (!pn) { out.status = "vao-acima-do-maximo"; out.motivo = "nenhum painel desta altura vence " + vao + " m com " + r2(totKn) + " kN/m²"; return out; }
      out.ok = true; out.status = "ok"; out.painel = { ordem: pn.painel.ordem, codigo: pn.painel.codigo }; out.vaoMaximoM = pn.vaoMaxCm / 100; out.comCapa = comCapa;
      out.armaduraAdicional = { informada: false, texto: "protensão do painel (código " + (pn.painel.codigo || "não extraído") + ")" };
      out.notas.push("vão da tabela = vão EFETIVO lef = l0 + a1 + a2 (documento, 4.1.2)");
      return out;
    }
    out.status = "tipo-de-tabela"; out.motivo = "tipo de tabela desconhecido: " + T.tipo; return out;
  }

  /* ---------------------------------------------------------------- avisos de norma (por pedido) */
  function avisosNorma(par) {
    var out = [], N = D && D.normas ? D.normas.ensaioDoConjunto : { areaM2: 200, vaoM: 6, cargaAcidentalKnM2: 5 };
    var vao = num(par.vaoM, 0), acid = par.sobrecargaKgfM2 != null ? num(par.sobrecargaKgfM2, 0) : num(par.sobrecargaKnM2, 0) * KGF_KN, area = num(par.areaM2, 0);
    if (vao > N.vaoM + EPS) out.push({ codigo: "ensaio-vao", texto: "vão " + vao + " m > " + N.vaoM + " m: a NBR 14859-1:2002, 6.3.1-b exige ensaio do conjunto de componentes (anexo A) — a tabela do fabricante não substitui" });
    if (acid / KGF_KN > N.cargaAcidentalKnM2 + EPS) out.push({ codigo: "ensaio-carga", texto: "carga acidental " + r2(acid / KGF_KN) + " kN/m² > " + N.cargaAcidentalKnM2 + ": a NBR 14859-1:2002, 6.3.1-c exige ensaio do conjunto" });
    if (area > N.areaM2 + EPS) out.push({ codigo: "ensaio-area", texto: "obra com " + area + " m² de laje pré-fabricada (> " + N.areaM2 + " m²): a NBR 14859-1:2002, 6.3.1-a exige ensaio do conjunto" });
    return out;
  }

  /* ---------------------------------------------------------------- quantitativos por m² (conta pela geometria nominal + números publicados) */
  function quantitativos(s, par, res) {
    par = par || {};
    var q = { serieId: s.id, fonte: fonteTxt(s), porM2: {}, publicado: {}, assumidos: [] };
    if (s.tabela.tipo === "vao-maximo-por-painel") {
      var cc = par.comCapa !== false;
      q.porM2.paineisM2 = 1; q.publicado.pesoProprioKnM2 = cc ? s.pesoProprioKnM2.comCapa : s.pesoProprioKnM2.semCapa; q.publicado.pesoProprioKgfM2 = r2(q.publicado.pesoProprioKnM2 * KGF_KN);
      q.publicado.consumoConcretoLM2 = cc ? s.consumoConcretoLM2.comCapa : s.consumoConcretoLM2.semCapa; q.porM2.concretoCapaM3 = q.publicado.consumoConcretoLM2 / 1000;
      return q;
    }
    var g = geometria(s); q.assumidos = g.assumidos.slice();
    q.porM2.vigotasM = r3(1 / g.i);                                       /* m de vigota por m² de laje */
    q.porM2.capaM3 = r3(g.hCapa);                                         /* m³ de concreto da CAPA por m² */
    q.porM2.capaL = r2(g.hCapa * 1000);
    q.publicado.pesoProprioKgfM2 = s.pesoProprio; q.publicado.consumoConcretoLM2 = s.consumoConcreto;
    q.porM2.concretoTotalM3 = r3(s.consumoConcreto / 1000);               /* o PUBLICADO (capa + nervuras) */
    if (g.comprEnch) { q.porM2.enchimentoPecas = r3(1 / (g.i * g.comprEnch)); q.porM2.enchimentoPecaM = g.comprEnch; }
    else q.assumidos.push("comprimento da peça de enchimento não informado: peças/m² não calculadas");
    q.porM2.enchimentoVolM3 = r3((g.wEnch * g.hEnch - (g.degrau ? (g.wEnch - (g.i - g.bv)) * g.hBase : 0)) / g.i);
    if (s.trelica && D.trelicas[s.trelica]) {
      var t = D.trelicas[s.trelica];
      q.porM2.trelicaKg = r3(t.pesoLinear / g.i); q.trelica = { id: s.trelica, hMm: t.hMm, pesoLinear: t.pesoLinear, fonte: D.fontes[t.fonte.id].fabricante + ", p. " + t.fonte.pag };
    } else q.assumidos.push("treliça desta série não informada: massa de aço da treliça não calculada");
    if (res && res.ok && res.armaduraAdicional && res.armaduraAdicional.massaKgMPorVigota != null) q.porM2.acoAdicionalKg = r3(res.armaduraAdicional.massaKgMPorVigota / g.i);
    return q;
  }

  function limite(v, a, b) { return v >= a - EPS && v <= b + EPS; }
  function escolher(par) {
    par = par || {};
    var cand = series({ tipo: par.tipo, enchimento: par.enchimento, fabricante: par.fabricante, fonte: par.fonte, hMin: par.hMinCm, hMax: par.hMaxCm }), lista = [];
    cand.forEach(function (s) {
      var r = consultar(s, par);
      var item = { serie: s.id, designacao: s.designacao, fabricante: s.fabricante, h: s.h != null ? s.h : s.hPainel, enchimento: s.enchimento || "alveolar", resultado: r };
      if (r.ok) item.quantitativos = quantitativos(s, par, r);
      lista.push(item);
    });
    var oks = lista.filter(function (x) { return x.resultado.ok; });
    oks.sort(function (a, b) { return (a.h - b.h) || ((a.quantitativos.publicado.pesoProprioKgfM2 || 0) - (b.quantitativos.publicado.pesoProprioKgfM2 || 0)); });
    return { ok: oks.length > 0, melhor: oks[0] || null, atendem: oks, todas: lista, avisos: avisosNorma(par),
             rotulo: D ? D.rotulo : "", pendencias: D ? D.pendencias : [] };
  }

  /* ---------------------------------------------------------------- duplicar (parâmetro do usuário) */
  var CAMPOS_GEOMETRIA = ["h", "hEnch", "hCapa", "intereixo", "larguraEnch", "comprEnch", "bVigota", "hBase", "trelica", "enchimento", "pesoProprio", "consumoConcreto", "hPainel"];
  function duplicar(id, alteracoes, novoId, nome) {
    var o = serie(id);
    if (!o) return { ok: false, motivo: "série \"" + id + "\" não existe" };
    var c = clone(o), alt = alteracoes || {}, mudou = [];
    Object.keys(alt).forEach(function (k) {
      if (CAMPOS_GEOMETRIA.indexOf(k) >= 0 && JSON.stringify(c[k]) !== JSON.stringify(alt[k])) mudou.push(k);
      c[k] = alt[k];
    });
    if (c.h != null && c.hEnch != null && c.hCapa != null && Math.abs(c.h - (c.hEnch + c.hCapa)) > EPS && (alt.hEnch != null || alt.hCapa != null) && alt.h == null) c.h = c.hEnch + c.hCapa;
    c.id = novoId || (id + "-usuario-" + (usuario.length + 1));
    if (serie(c.id)) return { ok: false, motivo: "já existe uma série com o id \"" + c.id + "\"" };
    c.designacao = nome || (o.designacao + " (usuário)");
    c.origemId = id;
    c.usuario = { marca: "parâmetro do usuário", geometriaAlterada: mudou.length > 0, camposAlterados: mudou, de: id, fonteOriginal: fonteTxt(o) };
    c.tipoId = (tipoDaSerie(id) || {}).id;
    var avisos = [];
    if (mudou.length) avisos.push("parâmetros alterados (" + mudou.join(", ") + "): a tabela do fabricante deixa de valer; resultado SEM verificação do fabricante");
    var nv = verificarNorma(c);
    nv.forEach(function (a) { avisos.push(a); });
    usuario.push(c);
    return { ok: true, serie: c, avisos: avisos };
  }
  function verificarNorma(s) {   /* confere a série contra a Tabela 1, 3 e 8 e 5.4 da NBR 14859-1:2002 (só para séries VT/EPS/cerâmica) */
    var out = [];
    if (!D || s.hEnch == null || s.hCapa == null) return out;
    var N = D.normas;
    if (Math.abs(s.h - (s.hEnch + s.hCapa)) > EPS) out.push("h (" + s.h + ") ≠ altura do enchimento + capa (" + (s.hEnch + s.hCapa) + ")");
    var padr = N.alturasPadronizadas.he_h[String(s.hEnch)];
    if (!padr || padr.indexOf(s.h) < 0) out.push("altura do enchimento/total fora da Tabela 1 da NBR 14859-1:2002 (4.1.2: só por acordo expresso entre fornecedor e comprador)");
    var cm = N.capaMinimaResistente.h_hc[String(s.h)];
    if (cm != null && s.hCapa < cm - EPS) out.push("capa de " + s.hCapa + " cm < " + cm + " cm exigidos pela Tabela 8 para h = " + s.h + " cm");
    if (s.hCapa < 3) out.push("capa < 3,0 cm: não conta como resistente (NBR 14859-1, 5.3)");
    var im = s.tipoVigota === "VT" ? (s.h <= 13 ? N.intereixoMinimo.VT_h_ate_13 : N.intereixoMinimo.VT) : (s.tipoVigota === "VP" ? N.intereixoMinimo.VP : N.intereixoMinimo.VC);
    if (s.intereixo < im - EPS) out.push("intereixo " + s.intereixo + " cm < mínimo padronizado " + im + " cm (Tabela 3 / 4.2)");
    if (s.larguraEnch != null && s.intereixo - s.larguraEnch < N.nervuraLarguraMinima.cm - EPS) out.push("nervura de " + r2(s.intereixo - s.larguraEnch) + " cm < " + N.nervuraLarguraMinima.cm + " cm (NBR 14859-1, 5.4)");
    return out;
  }
  function limparUsuario() { usuario = []; }

  /* ---------------------------------------------------------------- regras do fabricante (contra-flecha, escoramento, nervura de travamento) */
  function faixa(lista, v, a, b) { for (var k = 0; k < lista.length; k++) if (v >= lista[k][a] - EPS && v <= lista[k][b] + EPS) return lista[k]; return null; }
  function contraFlecha(vaoLivreM) {
    var f = D.regras.contraFlecha, x = faixa(f.faixas, vaoLivreM, "de", "ate");
    if (!x && vaoLivreM > 3.95 && vaoLivreM < 4.0) x = f.faixas[0];
    return x ? { cm: x.cm, fonte: "PUMA/Armatrel 2019, p. 52" } : { cm: null, motivo: "vão fora de 2,5 a 12,0 m", fonte: "PUMA/Armatrel 2019, p. 52" };
  }
  function escoramento(hCm) { var x = faixa(D.regras.escoramento.faixas, hCm, "hDe", "hAte"); return x ? { linhasACadaM: x.m, fonte: "PUMA/Armatrel 2019, p. 21" } : null; }
  function nervurasTravamento(vaoLivreM) {
    var x = faixa(D.regras.nervuraTravamento.porVao, Math.floor(vaoLivreM * 10 + 1e-9) / 10, "de", "ate");
    return x ? { n: x.n, fonte: "PUMA/Armatrel 2019, p. 54" } : { n: null, motivo: "vão fora da tabela" };
  }

  var API = {
    versao: 1, KGF_KN: KGF_KN, dados: function () { return D; }, tipos: tipos, series: series, serie: serie, celula: celula, geometria: geometria,
    consultar: consultar, escolher: escolher, quantitativos: quantitativos, duplicar: duplicar, verificarNorma: verificarNorma, avisosNorma: avisosNorma,
    contraFlecha: contraFlecha, escoramento: escoramento, nervurasTravamento: nervurasTravamento, limparUsuario: limparUsuario, fonteTxt: fonteTxt
  };
  global.LajesPre = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
