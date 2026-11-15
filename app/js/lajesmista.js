/* =====================================================================
 * lajesmista.js — MOTOR DAS LAJES MISTAS E SECAS: STEEL DECK e PAINEL WALL (14/11/2026). Motor PURO (ES5, sem DOM), Node-testável.
 *
 * Irmão do js/lajespre.js (mesmo padrão, mesma forma de resposta): lê o CATÁLOGO (js/lajesmistadados.js, gerado de
 * dados-fonte/concreto/lajes-mistas/catalogo.json, cada série com fabricante, documento, data e página) e devolve, por série:
 * se atende, a altura/espessura, a condição de escoramento, o peso próprio e as quantidades por m² — cada número com a fonte.
 *
 *   escolher(par)       par = { vaoM, sobrecargaKnM2 | sobrecargaKgfM2, revestimentoKnM2 | revestimentoKgfM2, apoio, tipo?, fabricante?, hMinCm?, hMaxCm?, uso?, ambiente? }
 *                       → { ok, melhor, atendem[], todas[], avisos[], rotulo, pendencias[] }
 *   consultar(serie, par, hCm)    a leitura da tabela de UMA série (e UMA altura, no steel deck): vão arredondado PARA CIMA, nunca interpola
 *   quantitativos(serie, par, resultado)   por m²: chapa, concreto, tela (steel deck) · painéis, peso, parafusos (Painel Wall)
 *   duplicar(id, alteracoes)       a cópia do usuário nasce "parâmetro do usuário": a tabela do fabricante NÃO vale mais para ela
 *
 * REGRAS DA CASA (por que é assim)
 *  1. NÚMERO DE CATÁLOGO NÃO É CÁLCULO. O motor lê a tabela do fabricante e diz de quem é; não verifica flexão, flecha, conectores nem
 *     incêndio. Quem verifica é o calculista (a própria Perfilor e a Metform mandam: NBR 14323, Anexo C). Todo resultado leva esse aviso.
 *  2. VÃO/CARGA FORA DA TABELA = NÃO ATENDE. Nunca extrapola, nunca interpola. Vão: sobe para o PRÓXIMO vão tabelado (conservador).
 *  3. STEEL DECK — a carga tabelada é SOBREPOSTA (revestimento + sobrecarga), SEM o peso próprio da laje (Metform p. 6; Perfilor: "úteis").
 *     Perfilor imprime daN/m² (1 daN/m² = 0,01 kN/m², exato); Metform imprime kN/m². O motor trabalha em kN/m².
 *  4. STEEL DECK — escoramento: Perfilor marca cada célula (branca = sem, bege = com); Metform dá o vão máximo sem escoramento por nº de
 *     apoios (simples/duplos/triplos/balanço). Vão acima dele = "escoramento necessário" (o nº de escoras não está nas fontes).
 *  5. BALANÇO: a tabela de carga não vale para balanço (a Metform só publica o vão máximo sem escoramento do balanço): o motor recusa.
 *  6. PAINEL WALL — a carga publicada é "distribuída" e a fonte NÃO diz se inclui o peso próprio nem qual o critério de flecha: o motor soma
 *     o peso próprio publicado à demanda (conservador) e diz que somou. Espaçamento acima do tabelado ou fora do mínimo de 3 apoios = não atende.
 *     Área externa = recusa (fabricante: "não recomendado"); área úmida = aviso (impermeabilização por especialista).
 *
 * Testes: node tools/test-lajesmista.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var D = dep("LajesMistaDados", "./lajesmistadados.js");
  var KGF_KN = 101.971621;           /* 1 kN/m² = 101,97 kgf/m² */
  var DAN_KN = 100;                  /* 1 kN/m² = 100 daN/m² (1 daN = 10 N) */
  var EPS = 1e-9;
  var G = 9.80665;

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function fonteTxt(s) {
    if (!D || !s || !s.fonte) return "";
    var f = D.fontes[s.fonte.id];
    return f ? (f.fabricante + " — " + f.documento + " (" + f.data + "), p. " + s.fonte.pag) : String(s.fonte.id);
  }

  /* ---------------------------------------------------------------- catálogo */
  var usuario = [];   /* séries duplicadas pelo usuário (vivem só na sessão; quem persiste é o chamador) */
  function tipos() { return D ? D.tipos : []; }
  function tipoDe(id) { var r = null; tipos().forEach(function (t) { if (t.id === id) r = t; }); return r; }
  function todasSeries() {
    var o = [];
    tipos().forEach(function (t) { t.series.forEach(function (s) { o.push({ tipo: t, serie: s }); }); });
    return o.concat(usuario.map(function (s) { return { tipo: tipoDe(s.tipoId), serie: s }; }));
  }
  function serie(id) { var r = null; todasSeries().forEach(function (x) { if (x.serie.id === id) r = x.serie; }); return r; }
  function tipoDaSerie(id) { var r = null; todasSeries().forEach(function (x) { if (x.serie.id === id) r = x.tipo; }); return r; }
  function series(filtro) {
    var f = filtro || {};
    return todasSeries().filter(function (x) {
      var s = x.serie;
      if (f.tipo && x.tipo && x.tipo.id !== f.tipo) return false;
      if (f.fabricante && String(s.fabricante || "").toLowerCase().indexOf(String(f.fabricante).toLowerCase()) < 0) return false;
      if (f.perfil && s.perfil !== f.perfil) return false;
      if (f.fonte && s.fonte && s.fonte.id !== f.fonte) return false;
      if (f.semUsuario && s.usuario) return false;
      return true;
    }).map(function (x) { return x.serie; });
  }
  function ehSteelDeck(s) { return !!(s && s.tabela && (s.tabela.tipo === "sobrecarga-por-vao-apoios" || s.tabela.tipo === "sobrecarga-por-vao-unica")); }
  function ehPainel(s) { return !!(s && s.tabela && s.tabela.tipo === "carga-por-espacamento"); }

  /* ---------------------------------------------------------------- alturas de uma série de steel deck */
  function alturasCm(s) {   /* [{ hCm, ... }] na ordem da tabela */
    var T = s.tabela;
    if (T.tipo === "sobrecarga-por-vao-unica") return T.linhas.map(function (l) { return { hCm: l.hMm / 10, uso: l.uso }; });
    return T.sistemas[0].linhas.map(function (l) { return { hCm: l.h }; });
  }
  function linhaMetform(s, hCm) { var r = null; s.tabela.linhas.forEach(function (l) { if (Math.abs(l.hMm / 10 - hCm) < EPS) r = l; }); return r; }
  function concretoPolydeck(s, hCm) { var r = null; arr(s.concreto).forEach(function (l) { if (l.h === hCm) r = l; }); return r; }
  function proximo(lista, v) { for (var k = 0; k < lista.length; k++) if (lista[k] >= v - EPS) return k; return -1; }

  /* demanda (kN/m²) = revestimento + sobrecarga acidental (a carga SOBREPOSTA das tabelas) */
  var REV_PADRAO_KN = 1.0, AVISO_REV = "revestimento NÃO informado: adotado o padrão de 1,0 kN/m² (100 kgf/m²) — informe o revestimento real";
  function demandaKn(par) {
    var acid = par.sobrecargaKnM2 != null ? num(par.sobrecargaKnM2, NaN) : (par.sobrecargaKgfM2 != null ? num(par.sobrecargaKgfM2, NaN) / KGF_KN : NaN);
    /* ⚠ revestimento ausente (revisão de cálculo 14/11/2026): antes valia ZERO em silêncio; agora vale o padrão de 1,0 kN/m² (100 kgf/m²) e quem chama avisa (revAssumido) */
    var semRev = par.revestimentoKnM2 == null && par.revestimentoKgfM2 == null;
    var rev = semRev ? REV_PADRAO_KN : (par.revestimentoKnM2 != null ? num(par.revestimentoKnM2, 0) : num(par.revestimentoKgfM2, 0) / KGF_KN);
    return { acidKn: acid, revKn: rev, totalKn: acid + rev, revAssumido: semRev };
  }
  var NOMES_APOIO = { simples: 2, duplo: 3, duplos: 3, triplo: 4, triplos: 4 };
  function apoioDe(par) {
    var a = par.apoio == null ? "simples" : par.apoio;
    if (a === "balanco" || a === "balanço") return { balanco: true, nome: "balanço" };
    if (typeof a === "number" || /^\d+$/.test(String(a))) { var n = Number(a); return { apoios: n, nome: n + " apoios" }; }
    if (NOMES_APOIO[a]) return { apoios: NOMES_APOIO[a], nome: a };
    return { invalido: String(a) };
  }

  /* ---------------------------------------------------------------- consulta STEEL DECK (uma série × uma altura) */
  function consultarSteelDeck(s, par, hCm) {
    var out = { serieId: s.id, designacao: s.designacao, fonte: fonteTxt(s), hCm: hCm, ok: false, status: "", avisos: [], notas: [] };
    var vao = num(par.vaoM, NaN), dem = demandaKn(par), T = s.tabela;
    if (dem.revAssumido) out.avisos.push(AVISO_REV);
    if (!isFinite(vao) || vao <= 0) { out.status = "entrada"; out.motivo = "informe o vão (m)"; return out; }
    if (!isFinite(dem.acidKn) || dem.acidKn < 0) { out.status = "entrada"; out.motivo = "informe a sobrecarga (kN/m² ou kgf/m²)"; return out; }
    if (s.usuario && s.usuario.geometriaAlterada && !(T && T.origem === "usuario")) {
      out.status = "parametro-do-usuario"; out.parametroDoUsuario = true;
      out.motivo = "série duplicada com parâmetros alterados: a tabela do fabricante NÃO vale para esta geometria; informe a tabela própria (origem \"usuario\") ou verifique pelo cálculo da laje mista (NBR 8800/14323) fora deste catálogo";
      return out;
    }
    var ap = apoioDe(par);
    if (ap.invalido) { out.status = "entrada"; out.motivo = "apoio \"" + ap.invalido + "\" não reconhecido (simples, duplo, triplo ou balanco)"; return out; }
    if (ap.balanco) { out.status = "balanco"; out.motivo = "laje em balanço: as fontes só trazem o vão máximo sem escoramento do balanço, não há tabela de carga (consultar o fabricante)"; return out; }
    out.demandaKnM2 = r3(dem.totalKn); out.apoio = ap.nome;
    out.notas.push("carga SOBREPOSTA = revestimento + sobrecarga = " + r3(dem.totalKn) + " kN/m² (o peso próprio da laje não entra: as tabelas já o descontam)");
    var cap, vaoTab, esc, nomeApoio = null;
    if (T.tipo === "sobrecarga-por-vao-unica") {   /* Metform */
      var ln = linhaMetform(s, hCm);
      if (!ln) { out.status = "altura-fora-da-tabela"; out.motivo = "altura " + hCm + " cm não consta da tabela desta série"; return out; }
      var iv = proximo(T.vaosM, vao);
      if (iv < 0) { out.status = "vao-fora-da-tabela"; out.motivo = "vão " + vao + " m acima do maior vão tabelado (" + T.vaosM[T.vaosM.length - 1] + " m)"; return out; }
      vaoTab = T.vaosM[iv]; cap = ln.cargasKnM2[iv];
      var chave = ap.apoios === 2 ? "simples" : (ap.apoios === 3 ? "duplos" : (ap.apoios === 4 ? "triplos" : null));
      if (!chave) { out.status = "apoio-sem-tabela"; out.motivo = "o catálogo trata vão simples, duplos (3 apoios) e triplos (4 apoios); " + ap.nome + " não consta"; return out; }
      var vmax = ln.vaoMaxSemEscoramentoM[chave];
      esc = vao > vmax + EPS ? "necessario" : "dispensado";
      out.vaoMaxSemEscoramentoM = vmax;
      out.pesoProprioKnM2 = ln.pesoProprioKnM2; out.uso = ln.uso;
      if (cap >= T.limiteTabelaKnM2 - EPS) out.notas.push("o valor tabelado (" + cap + " kN/m²) é o LIMITE impresso da tabela (\"20,00\"), não a resistência máxima da laje");
      if (ln.uso === "piso" && hCm * 10 < 140) out.avisos.push("Metform, p. 6 (Observações): \"Para lajes de piso, recomenda-se que a altura total de concreto seja maior ou igual a 140 mm\" (altura " + (hCm * 10) + " mm; o texto da fonte não diz se a altura é da laje ou só do concreto: conferir com o fabricante)");
    } else {   /* Perfilor */
      var sist = null; T.sistemas.forEach(function (S) { if (S.apoios === ap.apoios) sist = S; });
      if (!sist) { out.status = "apoio-sem-tabela"; out.motivo = "o catálogo trata 2, 3 e 4 apoios; " + ap.nome + " não consta"; return out; }
      var lin = null; sist.linhas.forEach(function (l) { if (l.h === hCm) lin = l; });
      if (!lin) { out.status = "altura-fora-da-tabela"; out.motivo = "altura " + hCm + " cm não consta da tabela desta série"; return out; }
      var ic = proximo(sist.vaosM, vao);
      if (ic < 0) { out.status = "vao-fora-da-tabela"; out.motivo = "vão " + vao + " m acima do maior vão tabelado (" + sist.vaosM[sist.vaosM.length - 1] + " m)"; return out; }
      if (ic >= lin.valoresDaNM2.length) { out.status = "vao-fora-da-tabela"; out.motivo = "para h = " + hCm + " cm o fabricante só tabela até " + sist.vaosM[lin.valoresDaNM2.length - 1] + " m (vão " + vao + " m → célula vazia da tabela)"; return out; }
      vaoTab = sist.vaosM[ic];
      var sus = null; arr(sist.suspeitas).forEach(function (q) { if (q.h === hCm && q.i === ic) sus = q; });
      if (sus) { out.status = "celula-suspeita"; out.motivo = "a célula impressa (h " + hCm + " cm, vão " + vaoTab + " m, " + sus.valor + " daN/m²) é incoerente com a altura vizinha (a sobrecarga diminuiu ao aumentar a laje): erro de impressão provável do catálogo; pedir o valor ao fabricante (o motor não corrige o número impresso)"; return out; }
      cap = lin.valoresDaNM2[ic] / DAN_KN;
      esc = lin.comEscoramento[ic] ? "necessario" : "dispensado";
      out.vaoMaxSemEscoramentoM = sist.vaoMaxSemEscoramentoM;
      var cc = concretoPolydeck(s, hCm);
      if (cc) out.pesoProprioKnM2 = r3(cc.pesoPropriokgM2 * G / 1000);
    }
    out.vaoTabelaM = vaoTab; out.capacidadeKnM2 = r3(cap); out.escoramento = esc;
    if (cap < dem.totalKn - EPS) { out.status = "carga-acima-da-tabela"; out.motivo = "carga sobreposta " + r3(dem.totalKn) + " kN/m² > " + r3(cap) + " kN/m² tabelados (h " + hCm + " cm, vão " + vaoTab + " m, " + ap.nome + ")"; return out; }
    out.ok = true; out.status = "ok";
    if (esc === "necessario") out.avisos.push("vão " + vao + " m exige ESCORAMENTO durante a concretagem (acima do vão máximo sem escoramento de " + out.vaoMaxSemEscoramentoM + " m ou célula \"com escoramento\"); o nº de linhas de escora não consta da fonte");
    if (ap.apoios > 2) out.avisos.push("apoio contínuo (" + ap.nome + "): prever armadura negativa sobre os apoios intermediários (Perfilor, p. 2) — a malha de retração não resiste a momento negativo");
    out.avisos.push("verificação normativa (Anexo C da NBR 14323 segundo o fabricante), cargas concentradas/lineares, conectores de viga mista, vibração e incêndio acima de 30 min: do calculista; este catálogo não substitui");
    return out;
  }

  /* ---------------------------------------------------------------- consulta PAINEL WALL */
  function consultarPainel(s, par) {
    var out = { serieId: s.id, designacao: s.designacao, fonte: fonteTxt(s), ok: false, status: "", avisos: [], notas: [] };
    var vao = num(par.vaoM, NaN), dem = demandaKn(par), T = s.tabela;
    if (dem.revAssumido) out.avisos.push(AVISO_REV);
    if (!isFinite(vao) || vao <= 0) { out.status = "entrada"; out.motivo = "informe o vão (distância entre apoios, m)"; return out; }
    if (!isFinite(dem.acidKn) || dem.acidKn < 0) { out.status = "entrada"; out.motivo = "informe a sobrecarga (kN/m² ou kgf/m²)"; return out; }
    if (s.usuario && s.usuario.geometriaAlterada && !(T && T.origem === "usuario")) {
      out.status = "parametro-do-usuario"; out.parametroDoUsuario = true;
      out.motivo = "série duplicada com parâmetros alterados: a tabela do fabricante NÃO vale para este painel; informe a tabela própria (origem \"usuario\") ou verifique fora deste catálogo";
      return out;
    }
    var ap = apoioDe(par);
    if (ap.invalido) { out.status = "entrada"; out.motivo = "apoio \"" + ap.invalido + "\" não reconhecido"; return out; }
    if (ap.balanco) { out.status = "balanco"; out.motivo = "balanços e beirais: o fabricante não recomenda (Decorlit, manual p. 7)"; return out; }
    if (par.ambiente === "externo") { out.status = "uso-nao-recomendado"; out.motivo = "área externa: o fabricante não recomenda o Painel Wall como laje (Decorlit, manual p. 7)"; return out; }
    if (par.ambiente === "umido") out.avisos.push("área úmida: exige impermeabilização correta, detalhada por especialista (Decorlit, manual p. 7; Eternit, p. 3)");
    var nApoios = ap.apoios != null ? ap.apoios : (par.apoio == null ? null : ap.apoios);
    if (par.apoio == null) out.notas.push("nº de apoios não informado: assumido o mínimo do fabricante (3 apoios igualmente distanciados)");
    else if (nApoios < T.apoiosMin) { out.status = "apoios-insuficientes"; out.motivo = "o fabricante exige no mínimo " + T.apoiosMin + " apoios (laje contínua sobre 3 apoios ou mais); informado: " + nApoios; return out; }
    var pp = 0, maxPeso = 0;
    arr(s.dimensoes).forEach(function (m) { if (m.pesoKgM2 > maxPeso) maxPeso = m.pesoKgM2; });
    pp = maxPeso;
    var demKgf = dem.totalKn * KGF_KN + pp;
    out.demandaKgfM2 = r2(demKgf); out.pesoProprioKgfM2 = pp;
    out.notas.push("demanda = sobrecarga + revestimento + peso próprio do painel (" + pp + " kgf/m²) = " + r2(demKgf) + " kgf/m²: a fonte não diz se a carga publicada já inclui o peso próprio (somado por segurança)");
    var io = -1;
    T.opcoes.forEach(function (o, k) { if (io < 0 && o.espacamentoMm / 1000 >= vao - EPS) io = k; });
    if (io < 0) { out.status = "vao-fora-da-tabela"; out.motivo = "espaçamento entre apoios " + vao + " m acima do máximo do fabricante (" + T.opcoes[T.opcoes.length - 1].espacamentoMm / 1000 + " m)"; return out; }
    var op = T.opcoes[io];
    out.espacamentoTabelaM = op.espacamentoMm / 1000;
    if (op.cargaKgfM2 == null) { out.status = "nao-atende"; out.motivo = "o fabricante marca \"–\" (não atende) para esta espessura com apoios a " + op.espacamentoMm + " mm"; return out; }
    out.capacidadeKgfM2 = op.cargaKgfM2;
    if (op.cargaKgfM2 < demKgf - EPS) { out.status = "carga-acima-da-tabela"; out.motivo = "demanda " + r2(demKgf) + " kgf/m² > " + op.cargaKgfM2 + " kgf/m² (apoios a " + op.espacamentoMm + " mm)"; return out; }
    out.ok = true; out.status = "ok";
    out.avisos.push("o Painel Wall só serve como laje SECA (piso exige revestimento); sem tráfego de empilhadeira/paleteira sem proteção e sem automotores; carga concentrada: " + (s.resistencias && s.resistencias.concentradaKgf ? s.resistencias.concentradaKgf + " kgf (fabricante)" : "consultar o fabricante"));
    out.avisos.push("a estrutura de apoio (perfis metálicos/madeira) é dimensionada à parte: este catálogo só diz o que o painel aguenta entre apoios");
    return out;
  }

  function consultar(s, par, hCm) {
    par = par || {};
    if (ehPainel(s)) return consultarPainel(s, par);
    if (ehSteelDeck(s)) {
      if (hCm == null) hCm = par.hCm;
      if (hCm == null) return { serieId: s.id, designacao: s.designacao, fonte: fonteTxt(s), ok: false, status: "entrada", motivo: "informe a altura total da laje (hCm)", avisos: [], notas: [] };
      return consultarSteelDeck(s, par, Number(hCm));
    }
    return { serieId: s.id, ok: false, status: "tipo-de-tabela", motivo: "tipo de tabela desconhecido", avisos: [], notas: [] };
  }

  /* ---------------------------------------------------------------- quantitativos por m² (números PUBLICADOS) */
  function quantitativos(s, par, res) {
    par = par || {};
    var q = { serieId: s.id, fonte: fonteTxt(s), porM2: {}, publicado: {}, assumidos: [] };
    if (ehPainel(s)) {
      q.porM2.paineisM2 = 1; q.porM2.paineis = [];
      arr(s.dimensoes).forEach(function (m) { q.porM2.paineis.push({ larguraMm: m.larguraMm, comprimentoMm: m.comprimentoMm, pecasPorM2: r4(1 / m.areaM2) }); });
      q.publicado.pesoProprioKgfM2 = res && res.pesoProprioKgfM2 != null ? res.pesoProprioKgfM2 : arr(s.dimensoes).reduce(function (a, m) { return Math.max(a, m.pesoKgM2); }, 0);
      q.publicado.espessuraMm = s.espessuraMm;
      var esp = res && res.espacamentoTabelaM != null ? res.espacamentoTabelaM : num(par.vaoM, 0);
      if (s.fabricante === "Decorlit" && esp > 0) {
        q.porM2.parafusos = r2(1 / (esp * 0.40));
        q.assumidos.push("parafusos/m² = 1 ÷ (espaçamento dos apoios × 0,40 m): o manual da Decorlit (p. 13) manda um parafuso a cada 40 cm em cada apoio; perdas e bordas não contadas");
      } else q.assumidos.push("a ficha da Eternit não dá espaçamento de parafusos: parafusos/m² não calculados");
      return q;
    }
    var hCm = num(par.hCm, NaN); if (res && res.hCm != null) hCm = res.hCm;
    if (!isFinite(hCm)) { q.assumidos.push("altura não informada: quantitativos de concreto e tela não calculados"); return q; }
    q.hCm = hCm;
    if (s.tabela.tipo === "sobrecarga-por-vao-unica") {
      var ln = linhaMetform(s, hCm);
      if (!ln) { q.assumidos.push("altura fora da tabela"); return q; }
      q.publicado.consumoConcretoM3M2 = ln.consumoConcretoM3M2; q.publicado.pesoProprioKnM2 = ln.pesoProprioKnM2; q.publicado.pesoChapaKgM2 = s.fisicas.pesoKgM2;
      q.porM2.concretoM3 = ln.consumoConcretoM3M2; q.porM2.chapaKg = s.fisicas.pesoKgM2; q.porM2.telaKg = ln.tela.pesoKgM2; q.tela = { denominacao: ln.tela.denominacao, composicao: ln.tela.composicao };
    } else {
      var cc = concretoPolydeck(s, hCm);
      if (!cc) { q.assumidos.push("altura fora da tabela"); return q; }
      q.publicado.consumoConcretoM3M2 = r4(cc.volumeDm3M2 / 1000); q.publicado.pesoProprioKgfM2 = cc.pesoPropriokgM2; q.publicado.pesoChapaKgM2 = s.fisicas.pesoKgM2;
      q.porM2.concretoM3 = q.publicado.consumoConcretoM3M2; q.porM2.chapaKg = s.fisicas.pesoKgM2;
      if (cc.tela) { q.tela = { denominacao: cc.tela.denominacao, composicao: cc.tela.composicao }; q.assumidos.push("peso da tela (kg/m²) não publicado pela Perfilor: só a denominação Q e a composição"); }
      else q.assumidos.push("tela: a Perfilor só especifica a malha até 20 cm de laje (esta altura fica sem tela especificada)");
    }
    return q;
  }

  /* ---------------------------------------------------------------- escolher */
  function escolher(par) {
    par = par || {};
    var cand = series({ tipo: par.tipo, fabricante: par.fabricante, perfil: par.perfil }), lista = [];
    cand.forEach(function (s) {
      if (ehPainel(s)) {
        var r = consultarPainel(s, par);
        var it = { serie: s.id, tipo: "painel-wall", designacao: s.designacao, fabricante: s.fabricante, h: s.espessuraMm / 10, resultado: r };
        if (r.ok) it.quantitativos = quantitativos(s, par, r);
        lista.push(it);
      } else if (ehSteelDeck(s)) {
        alturasCm(s).forEach(function (a) {
          if (par.hMinCm != null && a.hCm < par.hMinCm - EPS) return;
          if (par.hMaxCm != null && a.hCm > par.hMaxCm + EPS) return;
          if (a.uso && a.uso !== (par.uso || "piso")) return;   /* a Metform separa laje de FORRO (1 altura por perfil) de laje de PISO; sem pedido, piso */
          var r2_ = consultarSteelDeck(s, par, a.hCm);
          var it2 = { serie: s.id, tipo: "steel-deck", designacao: s.designacao, fabricante: s.fabricante, h: a.hCm, resultado: r2_ };
          if (r2_.ok) it2.quantitativos = quantitativos(s, par, r2_);
          lista.push(it2);
        });
      }
    });
    var oks = lista.filter(function (x) { return x.resultado.ok; });
    oks.sort(function (a, b) {
      var ea = a.resultado.escoramento === "necessario" ? 1 : 0, eb = b.resultado.escoramento === "necessario" ? 1 : 0;
      function pp(x) { return x.resultado.pesoProprioKnM2 != null ? x.resultado.pesoProprioKnM2 : (x.resultado.pesoProprioKgfM2 != null ? x.resultado.pesoProprioKgfM2 / KGF_KN : 0); }
      return (ea - eb) || (a.h - b.h) || (pp(a) - pp(b));
    });
    return { ok: oks.length > 0, melhor: oks[0] || null, atendem: oks, todas: lista, avisos: [{ codigo: "catalogo", texto: "dados de catálogo de fabricante (" + (D ? D.rotulo : "") + "); a verificação normativa é do calculista" }],
             rotulo: D ? D.rotulo : "", pendencias: D ? D.pendencias : [] };
  }

  /* ---------------------------------------------------------------- duplicar (parâmetro do usuário) */
  var CAMPOS_GEOMETRIA = ["tChapaMm", "geometria", "fisicas", "espessuraMm", "dimensoes", "composicao", "densidadeKgM3"];
  function duplicar(id, alteracoes, novoId, nome) {
    var o = serie(id);
    if (!o) return { ok: false, motivo: "série \"" + id + "\" não existe" };
    var c = clone(o), alt = alteracoes || {}, mudou = [];
    Object.keys(alt).forEach(function (k) {
      if (k === "geometria" && alt.geometria && typeof alt.geometria === "object" && c.geometria) {
        Object.keys(alt.geometria).forEach(function (g) { if (JSON.stringify(c.geometria[g]) !== JSON.stringify(alt.geometria[g])) mudou.push("geometria." + g); c.geometria[g] = alt.geometria[g]; });
        return;
      }
      if (CAMPOS_GEOMETRIA.indexOf(k) >= 0 && JSON.stringify(c[k]) !== JSON.stringify(alt[k])) mudou.push(k);
      c[k] = alt[k];
    });
    c.id = novoId || (id + "-usuario-" + (usuario.length + 1));
    if (serie(c.id)) return { ok: false, motivo: "já existe uma série com o id \"" + c.id + "\"" };
    c.designacao = nome || (o.designacao + " (usuário)");
    c.origemId = id; c.tipoId = (tipoDaSerie(id) || {}).id;
    c.usuario = { marca: "parâmetro do usuário", geometriaAlterada: mudou.length > 0, camposAlterados: mudou, de: id, fonteOriginal: fonteTxt(o) };
    var avisos = [];
    if (mudou.length) avisos.push("parâmetros alterados (" + mudou.join(", ") + "): a tabela do fabricante deixa de valer; resultado SEM verificação do fabricante");
    verificarGeometria(c).forEach(function (a) { avisos.push(a); });
    usuario.push(c);
    return { ok: true, serie: c, avisos: avisos };
  }
  /* coerência geométrica e faixa tabelada (não há norma gravada aqui: ver pendências) */
  function verificarGeometria(s) {
    var out = [], g = s.geometria;
    if (ehSteelDeck(s) && g) {
      if (Math.abs(g.valeMm + g.baseNervuraMm - g.passoMm) > 0.5) out.push("vale (" + g.valeMm + ") + base da nervura (" + g.baseNervuraMm + ") ≠ passo (" + g.passoMm + " mm)");
      if (!(g.mesaSuperiorMm > 0 && g.mesaSuperiorMm < g.baseNervuraMm)) out.push("mesa superior (" + g.mesaSuperiorMm + " mm) precisa ser menor que a base da nervura (" + g.baseNervuraMm + " mm)");
      if (!(s.tChapaMm > 0 && s.tChapaMm < 5)) out.push("espessura da chapa fora de 0 a 5 mm");
    }
    if (ehPainel(s) && !(s.espessuraMm > 0)) out.push("espessura do painel ausente");
    return out;
  }
  function limparUsuario() { usuario = []; }

  /* ---------------------------------------------------------------- perfil do steel deck (usado pela geometria e pela família) */
  function perfilSteelDeck(s) {
    var g = s.geometria;
    var p = g.passoMm / 1000, v = g.valeMm / 1000, c = g.mesaSuperiorMm / 1000, b = g.baseNervuraMm / 1000, h = g.alturaPerfilMm / 1000;
    return { passo: p, vale: v, mesa: c, base: b, alma: (b - c) / 2, altura: h, t: s.tChapaMm / 1000, cobTela: (g.coberturaTelaMm || 20) / 1000 };
  }

  var API = {
    versao: 1, KGF_KN: KGF_KN, dados: function () { return D; }, tipos: tipos, series: series, serie: serie, tipoDaSerie: tipoDaSerie,
    alturasCm: alturasCm, consultar: consultar, escolher: escolher, quantitativos: quantitativos, duplicar: duplicar, verificarGeometria: verificarGeometria,
    limparUsuario: limparUsuario, fonteTxt: fonteTxt, perfilSteelDeck: perfilSteelDeck, ehSteelDeck: ehSteelDeck, ehPainel: ehPainel
  };
  global.LajesMista = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
