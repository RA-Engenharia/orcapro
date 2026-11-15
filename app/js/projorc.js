/* =====================================================================
 * projorc.js — DO(S) ARQUIVO(S) DE PROJETO AO ORÇAMENTO, NUM CLIQUE (F6). Motor PURO, Node-testável. window.ProjOrcar.
 *
 * Junta, na ordem do fluxo da docs/ESPEC-PROJETO-PARA-ORCAMENTO.md, os motores que já existem:
 *   arquivo(s) ─► tipo (ifc/dxf/pdf/dwg) ─► TRIAGEM por disciplina (projtriagem) ─► extrator de cada disciplina
 *   (DXF: dxf → projclass → projler · PDF: projpdf p/ arquitetura vetorial, projeletr p/ texto elétrico)
 *   ─► separa PLANTA de FACHADA/CORTE pela geometria (F7) ─► JUNÇÃO sem dupla contagem (projtriagem.juntar)
 *   ─► ifcorc (os mesmos implícitos do IFC) ─► conferência em 3 cores.
 * Também monta o painel «O que foi lido» (disciplina, escala e como foi obtida, pavimentos, contagens, avisos) e a
 * PRÉVIA 2D em SVG da planta reconhecida (paredes vermelho, portas verde, janelas azul).
 * UM CLIQUE, ZERO PERGUNTAS: o que nenhuma regra resolve vai para «não reconhecido», com contagem, FORA do orçamento.
 * DWG é formato fechado: não é lido — a mensagem diz como exportar DXF, e o resto dos arquivos segue.
 * Sem IA. Nenhum código SINAPI é escrito aqui (quem casa o código é o catálogo do ifcorc). ES5.
 * A extração de página de PDF (pdf.js) é do navegador: aqui chegam páginas já extraídas
 * ({ segmentos (pdfvetor, em pontos), textos:[{s,x,y}], linhas:[texto por linha] }).
 * ===================================================================== */
(function (global) {
  "use strict";

  function mod(g, c) { if (global[g]) return global[g]; if (typeof require === "function") { try { return require(c); } catch (e) { return null; } } return null; }
  function M(nome) {
    var t = { DXF: "./dxf.js", ProjClass: "./projclass.js", ProjLer: "./projler.js", ProjPdf: "./projpdf.js", ProjEletr: "./projeletr.js", ProjTriagem: "./projtriagem.js", MorIfcOrc: "./mor/ifcorc.js" };
    return mod(nome, t[nome]);
  }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
  function fmt(v) { return String(r2(v)).replace(".", ","); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function len(s) { var dx = s.x2 - s.x1, dy = s.y2 - s.y1; return Math.sqrt(dx * dx + dy * dy); }

  var AVISO_DWG = "DWG é formato fechado: exporte em DXF no AutoCAD (Salvar como → DXF) e solte aqui";
  var MAX_PAGINAS = 30;

  function tipo(nome) {
    var m = /\.([a-z0-9]+)$/i.exec(String(nome || "")), x = m ? m[1].toLowerCase() : "";
    return x === "ifc" || x === "dxf" || x === "pdf" || x === "dwg" ? x : "outro";
  }

  /* ---------------------------------------------------------------- F7: planta × fachada × corte pela geometria */
  /* Uma vista de FACHADA tem muitas horizontais longas que não fecham recinto; um CORTE tem hachura (laje/terreno)
     pesando na área — no PDF, hachura em traço = pares diagonais. Sem recinto e com 30 m ou mais de «parede», também
     sai (medido no PDF real de arquitetura: cortes e coberturas davam 2,4 km de parede falsa). Só descarta a vista quando ela NÃO tem recinto fechado NEM rótulo de ambiente — planta com
     parede faltando (recinto pendente) continua planta, com o aviso dela. */
  function tipoVista(md, planta, hachuras) {
    var els = arr(md.elementos).filter(function (e) { return e.pavimento === planta.nome; });
    var paredes = els.filter(function (e) { return e.papel === "parede-alvenaria"; });
    var esp = arr(md.espacos).filter(function (s) { return s.pavimento === planta.nome; });
    var fechados = esp.filter(function (s) { return !s.pendente && s.areaPiso > 0; }).length;
    var rotulados = esp.filter(function (s) { return !s.semNome; }).length;
    if (paredes.length < 2 || fechados > 0 || rotulados > 0) return { tipo: "planta" };
    var Lh = 0, Lv = 0, Lt = 0;
    paredes.forEach(function (e) { var g = e.geo || {}, L = len(g); Lt += L; if (Math.abs(g.y2 - g.y1) < 0.1 * L) Lh += L; else if (Math.abs(g.x2 - g.x1) < 0.1 * L) Lv += L; });
    var Ld = Lt - Lh - Lv;
    var b = planta.bbox || {}, area = Math.max(1e-6, (b.x1 - b.x0) * (b.y1 - b.y0)), ah = 0;
    arr(hachuras).forEach(function (h) { var c = arr(h.contornos)[0] || []; if (!c.length) return; var p = c[0]; if (p && p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1) ah += Math.abs(h.area || 0); });
    if (ah > 0.08 * area) return { tipo: "corte", porque: "hachura (laje/terreno) cobre " + Math.round(100 * ah / area) + " % da vista e nenhum recinto fecha" };
    /* PDF: a hachura do corte vem como traço (não como HATCH) — pares DIAGONAIS paralelos */
    if (Lt > 0 && Ld / Lt >= 0.5) return { tipo: "corte", porque: Math.round(100 * Ld / Lt) + " % dos «pares» são diagonais (hachura de laje/terreno em traço) e nenhum recinto fecha" };
    if (Lt > 0 && Lh / Lt >= 0.7) return { tipo: "fachada", porque: Math.round(100 * Lh / Lt) + " % dos traços são horizontais longos e nenhum par fecha recinto" };
    /* muita «parede» sem UM recinto fechado e sem rótulo: não é planta que se orce (fachada, corte ou cobertura) */
    if (Lt >= 30) return { tipo: "fachada/corte", porque: fmt(Lt) + " m de pares paralelos sem nenhum recinto fechado nem nome de ambiente" };
    return { tipo: "planta" };
  }
  function filtrarVistas(md, hachuras) {
    var fora = [];
    arr(md.plantas).forEach(function (p) {
      var t = tipoVista(md, p, hachuras); if (t.tipo === "planta") return;
      fora.push({ nome: p.nome, tipo: t.tipo, porque: t.porque });
    });
    if (!fora.length) return fora;
    var nomes = {}; fora.forEach(function (f) { nomes[f.nome] = 1; });
    md.elementos = arr(md.elementos).filter(function (e) { return !nomes[e.pavimento]; });
    md.espacos = arr(md.espacos).filter(function (s) { return !nomes[s.pavimento]; });
    md.plantas = arr(md.plantas).filter(function (p) { return !nomes[p.nome]; });
    if (md.modelo) md.modelo.pavimentos = arr(md.modelo.pavimentos).filter(function (p) { return !nomes[p.nome]; });
    fora.forEach(function (f) { arr(md.avisos).push("vista «" + f.nome + "» parece " + f.tipo.toUpperCase() + " (" + f.porque + "): fora do orçamento, para não virar parede falsa"); });
    return fora;
  }

  /* ---------------------------------------------------------------- contagens do «O que foi lido» */
  function resumo(md) {
    var r = { paredePorEsp: {}, paredeM: 0, portas: 0, janelas: 0, ambientes: 0, ambientesSemNome: 0, ambientesPendentes: 0, loucas: {}, eletrica: { luz: 0, tomadas: 0, interruptores: 0, quadros: 0, disjuntores: 0, cabos: 0 } };
    arr(md.elementos).forEach(function (e) {
      var p = e.papel;
      if (p === "parede-alvenaria") { var k = Math.round((e.qto.largura || 0) * 100) + " cm"; r.paredePorEsp[k] = r2((r.paredePorEsp[k] || 0) + (e.qto.comprimento || 0)); r.paredeM = r2(r.paredeM + (e.qto.comprimento || 0)); }
      else if (p === "porta") r.portas++;
      else if (p === "janela") r.janelas++;
      else if (p === "louca") r.loucas[e.sub || "?"] = (r.loucas[e.sub || "?"] || 0) + 1;
      else if (p === "luminaria") r.eletrica.luz++;
      else if (p === "tomada") r.eletrica.tomadas++;
      else if (p === "interruptor") r.eletrica.interruptores++;
      else if (p === "quadro-eletrico") r.eletrica.quadros++;
      else if (p === "disjuntor") r.eletrica.disjuntores++;
      else if (p === "cabo") r.eletrica.cabos++;
    });
    arr(md.espacos).forEach(function (s) { r.ambientes++; if (s.semNome) r.ambientesSemNome++; if (s.pendente) r.ambientesPendentes++; });
    return r;
  }

  function novoLido(nome, t) { return { arquivo: nome, tipo: t, ok: false, erro: "", disciplinas: [], porqueDisciplina: "", escala: "", escalaComo: "", pavimentos: [], partes: [], plantas: [], avisos: [], naoReconhecidos: [], resumo: null, vistasFora: [] };
  }
  function addParte(lido, md, origem) {
    lido.partes.push({ modelo: md, origem: origem });
    arr(md.plantas).forEach(function (p) {
      if (!arr(p.paredes).length) return;   /* sem parede reconhecida: nada a mostrar na prévia (o aviso já diz) */
      lido.plantas.push({ nome: p.nome, folha: origem.folha || "", bbox: p.bbox, paredes: arr(p.paredes),
        vaos: arr(md.elementos).filter(function (e) { return e.pavimento === p.nome && (e.papel === "porta" || e.papel === "janela"); }).map(function (e) { return { tipo: e.papel, geo: e.geo }; }),
        loucas: arr(md.elementos).filter(function (e) { return e.pavimento === p.nome && e.papel === "louca" && e.geo && e.geo.x != null; }).map(function (e) { return { x: e.geo.x, y: e.geo.y, sub: e.sub }; }),
        ambientes: arr(md.espacos).filter(function (s) { return s.pavimento === p.nome && s.x != null; }).map(function (s) { return { x: s.x, y: s.y, nome: s.nome, area: s.areaPiso, pendente: !!s.pendente }; }) });
    });
    arr(md.modelo && md.modelo.pavimentos).forEach(function (p) { if (lido.pavimentos.indexOf(p.nome) < 0) lido.pavimentos.push(p.nome); });
  }
  function fechar(lido) {
    var tudo = { elementos: [], espacos: [] };
    lido.partes.forEach(function (pt) { tudo.elementos = tudo.elementos.concat(arr(pt.modelo.elementos)); tudo.espacos = tudo.espacos.concat(arr(pt.modelo.espacos)); });
    lido.resumo = resumo(tudo);
    if (lido.partes.length && !tudo.elementos.length && !lido.erro) lido.avisos.push("nada mensurável saiu deste arquivo");
    lido.ok = lido.partes.length > 0 && tudo.elementos.length > 0;
    return lido;
  }

  /* ---------------------------------------------------------------- DXF */
  function lerDxf(texto, nome, opts) {
    opts = opts || {};
    var lido = novoLido(nome, "dxf"), D = M("DXF"), PC = M("ProjClass"), PL = M("ProjLer"), T = M("ProjTriagem");
    if (!D || !PC || !PL || !T) { lido.erro = "os motores do DXF não carregaram"; return fechar(lido); }
    var dx;
    try { dx = D.parse(String(texto || ""), { blocos: true }); } catch (e) { lido.erro = "não consegui ler o DXF: " + e.message; return fechar(lido); }
    return lerDxfDe(dx, lido, nome, opts, D, PC, PL, T);
  }
  /* leitura em fatias (a tela respira e a barra de progresso anda): aoProg(fracao 0..1, fase) ; cb(lido) — o mesmo `lido` do lerDxf.
     O que vem depois do parse (classificar, medir) é um bloco só, sem medida contínua: aoProg("medir", null). */
  function lerDxfAsync(texto, nome, opts, aoProg, cb, cancelado) {
    opts = opts || {};
    var lido = novoLido(nome, "dxf"), D = M("DXF"), PC = M("ProjClass"), PL = M("ProjLer"), T = M("ProjTriagem");
    if (!D || !PC || !PL || !T) { lido.erro = "os motores do DXF não carregaram"; cb(fechar(lido)); return; }
    if (!D.parseAsync) { cb(lerDxf(texto, nome, opts)); return; }
    D.parseAsync(String(texto || ""), { blocos: true }, aoProg, function (dx, erro) {
      if (!dx) { if (erro === "cancelado") { lido.erro = "leitura cancelada"; cb(fechar(lido), "cancelado"); return; } lido.erro = "não consegui ler o DXF: " + erro; cb(fechar(lido)); return; }
      if (aoProg) aoProg(null, "medir");
      setTimeout(function () {
        try { cb(lerDxfDe(dx, lido, nome, opts, D, PC, PL, T)); } catch (e) { lido.erro = "não consegui ler o DXF: " + (e && e.message || e); cb(fechar(lido)); }
      }, 20);
    }, cancelado);
  }
  function lerDxfDe(dx, lido, nome, opts, D, PC, PL, T) {
    if (!dx || !arr(dx.segmentos).length) { lido.erro = "o DXF não tem linhas legíveis (LINE, LWPOLYLINE, ARC…)"; return fechar(lido); }
    var tri = T.triar({ nomeArquivo: nome, texto: arr(dx.textos).slice(0, 4000).map(function (t) { return t.txt; }), camadas: Object.keys(dx.layers || {}) });
    lido.disciplinas = tri.disciplinas; lido.porqueDisciplina = tri.porque;
    var cls = PC.classificar(dx, { mem: opts.mem });
    var md = PL.ler(dx, cls, {});
    if (!md.ok) { lido.erro = md.erro; return fechar(lido); }
    lido.vistasFora = filtrarVistas(md, dx.hachuras);
    var e = md.escala || {};
    lido.escala = e.corrige && e.corrige !== 1 ? "×" + fmt(e.corrige) + " sobre a unidade do arquivo" : "unidade do arquivo (" + ((dx.unidade && dx.unidade.origem) || "?") + ")";
    lido.escalaComo = e.nota || ("sem cotas suficientes para conferir: vale a unidade declarada no arquivo");
    lido.avisos = lido.avisos.concat(arr(md.avisos));
    arr(cls.naoReconhecidos && cls.naoReconhecidos.blocos).forEach(function (b) { lido.naoReconhecidos.push({ classe: "bloco", nome: b.nome, n: b.n, motivo: b.motivo + (b.layer ? " (camada «" + b.layer + "»)" : "") }); });
    var nu = md.naoUsados || {};
    if (nu.portaSemVao) lido.naoReconhecidos.push({ classe: "porta", nome: "bloco de porta", n: nu.portaSemVao, motivo: "sem vão de parede reconhecido" });
    if (nu.insercoesForaDePlanta) lido.naoReconhecidos.push({ classe: "louça/metal", nome: "fora das plantas", n: nu.insercoesForaDePlanta, motivo: "em corte, detalhe ou fachada" });
    lido.vistasFora.forEach(function (f) { lido.naoReconhecidos.push({ classe: "vista", nome: f.nome, n: 1, motivo: f.tipo + ": " + f.porque }); });
    var disc = tri.disciplinas.indexOf("arquitetura") >= 0 || !tri.disciplinas.length ? "arquitetura" : tri.principal;
    if (arr(md.plantas).length) addParte(lido, md, { arquivo: nome, folha: "modelo", vista: arr(md.plantas).map(function (p) { return p.nome; }).join(", "), disciplina: disc });
    else lido.erro = lido.erro || "nenhuma planta de pavimento reconhecida";
    return fechar(lido);
  }

  /* ---------------------------------------------------------------- PDF (páginas já extraídas no navegador) */
  function lerPdf(paginas, nome, opts) {
    opts = opts || {};
    var lido = novoLido(nome, "pdf"), PP = M("ProjPdf"), PE = M("ProjEletr"), T = M("ProjTriagem");
    if (!PP || !PE || !T) { lido.erro = "os motores do PDF não carregaram"; return fechar(lido); }
    var pgs = arr(paginas);
    if (!pgs.length) { lido.erro = "o PDF não abriu (protegido ou corrompido?)"; return fechar(lido); }
    if (opts.totalPaginas > pgs.length) lido.avisos.push("o PDF tem " + opts.totalPaginas + " páginas; li as " + pgs.length + " primeiras");
    var escalas = [];
    pgs.forEach(function (pg, i) {
      var folha = "folha " + (i + 1), linhas = arr(pg.linhas), segs = arr(pg.segmentos);
      var tri = T.triar({ nomeArquivo: nome, texto: linhas });
      var ds = tri.disciplinas.slice();
      if (!ds.length && segs.length) ds = ["arquitetura"];   /* sem texto, com traço: tenta a planta pela geometria (F7) */
      ds.forEach(function (d) { if (lido.disciplinas.indexOf(d) < 0) lido.disciplinas.push(d); });
      lido.porqueDisciplina += (lido.porqueDisciplina ? " · " : "") + folha + ": " + (tri.disciplinas.length ? tri.porque : (segs.length ? "sem texto: tentada como planta pela geometria" : tri.porque));
      if (!linhas.join("").trim()) lido.avisos.push(folha + ": PDF sem texto (fonte virada em traço ou página escaneada) — sem cotas, títulos, nomes de ambiente nem quadro de cargas legíveis");
      ds.forEach(function (d) {
        if (d === "eletrica") {
          var me = PE.ler(linhas);
          if (me.ok && arr(me.elementos).length) addParte(lido, me, { arquivo: nome, folha: folha, vista: "texto da folha", disciplina: "eletrica" });
          else lido.avisos.push(folha + ": elétrica sem quadro de cargas nem pontos legíveis no texto");
          arr(me.avisos).forEach(function (a) { lido.avisos.push(folha + ": " + a); });
        } else if (d === "arquitetura") {
          if (!segs.length) { lido.avisos.push(folha + ": arquitetura sem traço vetorial (imagem escaneada): não medida"); lido.naoReconhecidos.push({ classe: "folha", nome: folha, n: 1, motivo: "sem traço vetorial" }); return; }
          var ma = PP.lerPagina({ segmentos: segs, textos: arr(pg.textos) }, {});
          if (!ma.ok) { lido.avisos.push(folha + ": " + ma.erro); lido.naoReconhecidos.push({ classe: "folha", nome: folha, n: 1, motivo: ma.erro }); return; }
          var fora = filtrarVistas(ma, []);
          fora.forEach(function (f) { f.nome = folha + " — " + f.nome; lido.vistasFora.push(f); lido.naoReconhecidos.push({ classe: "vista", nome: f.nome, n: 1, motivo: f.tipo + ": " + f.porque }); });
          ma.plantas.forEach(function (p) { p.nome = folha + " — " + p.nome; });
          ma.elementos.forEach(function (e) { e.pavimento = folha + " — " + e.pavimento; });
          ma.espacos.forEach(function (s) { s.pavimento = folha + " — " + s.pavimento; });
          if (ma.modelo) ma.modelo.pavimentos.forEach(function (p) { p.nome = folha + " — " + p.nome; });
          escalas.push(ma.pdf.escala + " (" + (ma.pdf.origemEscala === "carimbo" ? "carimbo, conferido pelas paredes" : "pela espessura das paredes, caneta " + ma.pdf.caneta + " pt") + ")");
          arr(ma.avisos).forEach(function (a) { lido.avisos.push(folha + ": " + a); });
          if (arr(ma.plantas).length) addParte(lido, ma, { arquivo: nome, folha: folha, vista: arr(ma.plantas).map(function (p) { return p.nome; }).join(", "), disciplina: "arquitetura" });
        } else {
          var sup = T.DADOS.suportadas[d];
          lido.avisos.push(folha + ": disciplina «" + d + "» " + (sup ? "pede outro leitor (" + sup + ")" : "ainda sem leitor") + ": fora do orçamento");
          lido.naoReconhecidos.push({ classe: "folha", nome: folha + " (" + d + ")", n: 1, motivo: "disciplina sem leitor nesta tela" });
        }
      });
    });
    lido.escala = escalas.length ? escalas[0] : (lido.disciplinas.indexOf("eletrica") >= 0 ? "não se aplica (lido pelo texto)" : "");
    lido.escalaComo = escalas.length > 1 ? "por folha: " + escalas.join("; ") : (escalas.length ? "a cota/carimbo manda; sem eles, a espessura de parede comum (9–25 cm)" : "");
    if (!lido.partes.length && !lido.erro) lido.erro = "nada mensurável no PDF";
    return fechar(lido);
  }

  /* ---------------------------------------------------------------- IFC (modelo já lido pelo MorIfcLer) */
  function deIfc(modelo, nome) {
    var lido = novoLido(nome, "ifc");
    if (!modelo || !modelo.ok) { lido.erro = (modelo && modelo.erro) || "IFC não lido"; return fechar(lido); }
    lido.disciplinas = ["modelo IFC"]; lido.porqueDisciplina = "IFC: as disciplinas vêm das classes do modelo"; lido.escala = "metros (IFC)"; lido.escalaComo = "unidade do arquivo IFC";
    lido.partes.push({ modelo: modelo, origem: { arquivo: nome, folha: "modelo", vista: "IFC", disciplina: "arquitetura" }, ifc: true });
    arr(modelo.modelo && modelo.modelo.pavimentos).forEach(function (p) { if (p && p.nome) lido.pavimentos.push(p.nome); });
    arr(modelo.cobertura && modelo.cobertura.semRegra).forEach(function (s) { lido.naoReconhecidos.push({ classe: s.classe, nome: s.nome, n: 1, motivo: s.motivo }); });
    return fechar(lido);
  }

  function dwg(nome) { var l = novoLido(nome, "dwg"); l.erro = AVISO_DWG; return l; }
  function outro(nome) { var l = novoLido(nome, "outro"); l.erro = "formato não lido aqui (aceitos: .ifc, .dxf, .pdf)"; return l; }

  /* ---------------------------------------------------------------- junção + orçamento */
  function orcar(lidos, opts) {
    opts = opts || {};
    var T = M("ProjTriagem"), O = M("MorIfcOrc");
    if (!T || !O) return { ok: false, erro: "os motores de junção/orçamento não carregaram", lidos: lidos };
    var lista = [], naoRec = [];
    arr(lidos).forEach(function (l) {
      l.partes.forEach(function (p) { lista.push({ modelo: p.modelo, origem: p.origem }); });
      l.naoReconhecidos.forEach(function (n) { naoRec.push({ classe: n.classe, nome: l.arquivo + ": " + n.nome + (n.n > 1 ? " (×" + n.n + ")" : ""), predef: "", material: "", motivo: n.motivo, n: n.n || 1 }); });
    });
    if (!lista.length) {
      var erros = arr(lidos).map(function (l) { return l.arquivo + ": " + (l.erro || "nada mensurável"); });
      return { ok: false, erro: "Nenhum arquivo deu medida para orçar. " + erros.join(" · "), lidos: lidos };
    }
    var J = T.juntar(lista);
    var origemPorId = {}; J.elementos.forEach(function (e) { origemPorId[e.id] = e.origem; });
    var nNao = naoRec.reduce(function (s, x) { return s + (x.n || 1); }, 0);
    J.cobertura = { fonte: "projeto", lidos: J.elementos.length + nNao, classificados: J.elementos.length, semRegra: naoRec, naoReconhecidos: nNao, completa: true, ambientes: J.espacos.length };
    var res = O.orcar(J, { padrao: opts.padrao || "medio", params: opts.params || {}, obter: opts.obter });
    if (!res.ok) return { ok: false, erro: res.erro, lidos: lidos };
    arr(J.duplicados).forEach(function (d) { res.avisos.push("junção: " + d.motivo); });
    return { ok: true, res: res, modelo: J, origemPorId: origemPorId, lidos: lidos, naoReconhecidos: nNao };
  }

  /* ---------------------------------------------------------------- prévia 2D (SVG) */
  function svgPlanta(p, opts) {
    opts = opts || {};
    var b = p.bbox || { x0: 0, y0: 0, x1: 1, y1: 1 }, m = 0.5, W = Math.max(0.1, b.x1 - b.x0 + 2 * m), H = Math.max(0.1, b.y1 - b.y0 + 2 * m);
    var larg = opts.largura || 640, alt = Math.round(larg * H / W), s = "";
    function n(v) { return Math.round(v * 1000) / 1000; }
    function ln(g, cor, w) { return '<line x1="' + n(g.x1) + '" y1="' + n(-g.y1) + '" x2="' + n(g.x2) + '" y2="' + n(-g.y2) + '" stroke="' + cor + '" stroke-width="' + n(w) + '" stroke-linecap="butt"/>'; }
    arr(p.paredes).forEach(function (w) { s += ln(w, "#d32f2f", Math.max(0.08, w.espessura || 0.15)); });
    arr(p.vaos).forEach(function (v) { if (v.geo) s += ln(v.geo, v.tipo === "porta" ? "#2e7d32" : "#1565c0", 0.28); });
    arr(p.loucas).forEach(function (l) { s += '<circle cx="' + n(l.x) + '" cy="' + n(-l.y) + '" r="0.22" fill="#6a1b9a"><title>' + esc(l.sub) + "</title></circle>"; });
    var fs = Math.max(0.25, Math.min(W, H) / 40);
    arr(p.ambientes).forEach(function (a) { s += '<text x="' + n(a.x) + '" y="' + n(-a.y) + '" font-size="' + n(fs) + '" fill="' + (a.pendente ? "#c62828" : "#333") + '" text-anchor="middle">' + esc(a.nome) + (a.area ? " " + fmt(a.area) + " m²" : "") + "</text>"; });
    return '<svg xmlns="http://www.w3.org/2000/svg" data-proj-svg="1" style="display:block;width:100%;height:auto;max-width:' + larg + 'px;max-height:' + Math.min(alt, 520) + 'px;background:#fff;border:1px solid #ccc" viewBox="' + n(b.x0 - m) + " " + n(-b.y1 - m) + " " + n(W) + " " + n(H) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Prévia da planta «' + esc(p.nome) + '»">' + s + "</svg>";
  }

  var ProjOrcar = { AVISO_DWG: AVISO_DWG, MAX_PAGINAS: MAX_PAGINAS, tipo: tipo, lerDxf: lerDxf, lerDxfAsync: lerDxfAsync, lerPdf: lerPdf, deIfc: deIfc, dwg: dwg, outro: outro, orcar: orcar, resumo: resumo, svgPlanta: svgPlanta, tipoVista: tipoVista, filtrarVistas: filtrarVistas };
  global.ProjOrcar = ProjOrcar;
  if (typeof module !== "undefined" && module.exports) module.exports = ProjOrcar;
})(typeof window !== "undefined" ? window : globalThis);
