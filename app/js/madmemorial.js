/* =====================================================================
 * madmemorial.js — MEMORIAL DE CÁLCULO DA ESTRUTURA DE MADEIRA — motor
 * PURO, ES5, sem DOM, Node-testável. Mesma arquitetura do js/acomemorial.js
 * (Metálica): funções copiadas e adaptadas, nada importado de lá.
 *
 *   MadMemorial.gerar(resultado, opcoes) → { ok, html, titulo,
 *        secoes: [{ id, numero, titulo }], figuras, tabelas,
 *        avisos: [divergências das conferências internas],
 *        conferencias: [{ id, texto, ok }] }
 *
 *   resultado  o do MadDimensionar.calcular (docs/madeira/CONTRATO.md):
 *              premissas, especies, piso, analise, verificacoes, ligacoes,
 *              paredes, reacoesFundacao, nivel, compra, pendencias, avisos.
 *              Campos que o contrato ainda não lista e o memorial usa quando
 *              vierem: modelo (MadModelo.gerar — figuras, regras, placas),
 *              acoes { camadasPiso, cargasCype, ventoParedes }, combinacoes
 *              [{ tipo, expressao, kmod, kmodTxt, uso }], paredesPremissas
 *              (o objeto de premissas do MadWoodFrame), pecas (fonte: id,
 *              grupo, secao_cm, volume_m3 — conferência de volume),
 *              niveisFonte (piso_pw.niveis), classes { especie: classe }.
 *   opcoes     obra { nome, endereco, cidade, proprietario, proprietarioCnpj,
 *              contratante } · documento { numero, revisao, data, situacao } ·
 *              revisoes [{ rev, data, descricao, por }] · responsavel { nome,
 *              titulo, abrev, conselho, crea, empresa, cnpj, endereco } ·
 *              bimManager { nome, titulo, empresa } · contratanteAssinatura
 *              { empresa, nome, cargo } · local · logos { ra, contratante,
 *              proprietario } (data URL; sem logo → [LOGO] em vermelho) ·
 *              documentosReferencia [texto] · catalogo (MadCatalogo; padrão:
 *              o global) · versao.
 *
 * O DOCUMENTO (padrão RA de documento técnico — o Rogério recusou documento
 * "simples" em 01/10/2026): capa com os três logos, ficha do documento e
 * quadro de revisões; sumário; 15 seções numeradas com equações, tabelas e
 * figuras SVG geradas aqui (modelo em perspectiva e em planta, camadas do
 * piso, aproveitamento do piso, paredes, locação das reações); premissas e
 * pendências; responsabilidade técnica com 3 assinaturas (RT, BIM Manager,
 * contratante) e local/data. A4 com @page: cabeçalho/rodapé e "Página X de
 * Y" nas margens (Chromium 131+); a capa sai sem cabeçalho. Cores do logo
 * RA: #00406A (azul) · #6F5F48 (marrom) · #3F7818 (verde) · #A89868 (areia).
 *
 * REGRAS (registro formal de engenharia — ⚠ não afrouxar):
 *   · NADA INVENTADO: o que não veio no resultado aparece como "não abrangido
 *     nesta emissão" (seção da parte e lista da seção 13), nunca como
 *     verificado. Sem η no resultado não há "OK".
 *   · Texto de motor com undefined/NaN/null vira "[valor indefinido]" E entra
 *     nas conferências internas (esconder o defeito seria pior).
 *   · Número sempre com vírgula decimal e unidade; cada valor de norma com a
 *     edição e a fonte. Desde 13/10/2026 (Rogério: "se não precisar, não
 *     cita") o memorial cita a 7190-1:2022 direto, sem "fonte secundária /
 *     conferir no texto"; a conferência dos valores com o texto da norma vai
 *     para resultado.conferenciaInterna (arquivo interno, fora do memorial).
 *   · Preço só do orçamento recebido (data, número e fornecedor).
 *   · Conferências internas impressas e devolvidas: ΣG das reações = ΣG do
 *     piso; ΣQ idem; Σ volume por espécie = Σ volume das peças; peças da
 *     compra = peças com espécie; η refeito pelo MadDim = η do piso.
 * Teste: node tools/test-mad-memorial.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }

  /* ================================================================ FORMATO (copiado do acomemorial.js e adaptado) */
  var NB = String.fromCharCode(160), MENOS = "−";
  var estado = { invalidos: 0, indefinidos: [] };
  var RE_INDEF = /\b(undefined|nan|null|infinity)\b/i, RE_INDEF_G = /\b(undefined|nan|null|infinity)\b/gi;
  var COR = { azul: "#00406A", marrom: "#6F5F48", verde: "#3F7818", areia: "#A89868", cinza: "#9aa5b1", falha: "#a3352b", alerta: "#c27c2c" };

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function objs(v) { return arr(v).filter(function (x) { return x && typeof x === "object" && !Array.isArray(x); }); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function br(v, c) {
    if (!fin(v)) return "—";
    c = c == null ? 2 : c;
    var s = Math.abs(v).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s) !== 0 ? MENOS : "") + i + (p.length > 1 ? "," + p[1] : "");
  }
  function un(v, c, u) { return fin(v) ? br(v, c) + NB + u : "—"; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  /* texto que veio do motor: escapa e denuncia valor indefinido */
  /* texto de motor com ponto decimal antes de unidade ("trecho 0.26 m") → vírgula; milhar (3 dígitos) não muda */
  var RE_DEC = /(\d)\.(\d{1,2}|\d{4,})(?=\s?(?:m|cm|mm|kN|kN\/m|kN\/m²|kN·m|MPa|m²|m³|kg|kgf)(?![\wÀ-ú]))/g;
  function t(s, onde) {
    var x = String(s == null ? "" : s).replace(RE_DEC, "$1,$2");
    if (RE_INDEF.test(x)) { x = x.replace(RE_INDEF_G, "[valor indefinido]"); estado.indefinidos.push((onde ? onde + ": " : "") + x.slice(0, 90)); }
    return esc(x);
  }
  /* dado do usuário que pode faltar: placeholder entre colchetes, em vermelho */
  function ph(v, rotulo) { var s = v == null ? "" : String(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rotulo) + "]</span>"; }
  function f1(v) { if (!fin(v)) { estado.invalidos++; return "0"; } return String(Math.round(v * 10) / 10); }
  function dataTxt(d) {
    function dois(n) { return (n < 10 ? "0" : "") + n; }
    if (d instanceof Date && !isNaN(d.getTime())) return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear();
    if (typeof d === "string" && d.trim()) return d.trim();
    return dataTxt(new Date());
  }
  function dataIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] : String(s || ""); }
  function unicos(lista) { var o = []; lista.forEach(function (x) { if (x != null && x !== "" && o.indexOf(x) < 0) o.push(x); }); return o; }
  function cssStr(s) { return '"' + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").replace(/</g, "\\3c ") + '"'; }
  function imgOk(s) { return typeof s === "string" && (/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(s) || /^https?:\/\/\S+$/i.test(s)); }
  function urlDe(s) { var m = /(https?:\/\/[^\s),;]+)/.exec(String(s || "")); if (m) return m[1]; m = /\b((?:www\.)[a-z0-9.-]+\.[a-z]{2,}[^\s),;]*)/i.exec(String(s || "")); return m ? "https://" + m[1] : null; }
  function link(url, texto) { return url ? '<a href="' + esc(url) + '">' + (texto || esc(url)) + "</a>" : (texto || ""); }
  function plural(n, um, varios) { return br(n, 0) + " " + (n === 1 ? um : varios); }
  function cap(s) { s = String(s == null ? "" : s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function soma(l) { var s = 0; l.forEach(function (x) { s += num(x, 0); }); return s; }

  /* ================================================================ NORMAS (vigência: vigencia.json da biblioteca técnica, conferido em 12/10/2026) */
  var NORMAS_CONFERIDAS = "12/10/2026";
  var NORMAS = [
    { id: "ABNT NBR 7190-1:2022", titulo: "Projeto de estruturas de madeira — Parte 1: Critérios de dimensionamento", situacao: "Em vigor (partes 1 a 7 publicadas em 29/06/2022; substitui a 7190:1997)",
      url: "https://cbic.org.br/inovacao/2022/07/21/normas-de-madeira-e-destaque-no-boletim-de-normas-tecnicas-da-cbic/",
      uso: "Critérios de dimensionamento das barras acima do piso: classes nativas e de peças estruturais (partes 1, 3 e 4), kmod = kmod1·kmod2, γw, flexocompressão e flexotração, cisalhamento, estabilidade lateral e ligações." },
    { id: "ABNT NBR 7190:1997", titulo: "Projeto de estruturas de madeira", situacao: "Cancelada (substituída pela 7190:2022)",
      alerta: "Usada só nos coeficientes do piso seco: critério conservador do RT (kmod com kmod3 = 0,80 e flexão limitada a fc0,d), mais rigoroso que a edição de 2022.",
      uso: "Classes C (Tabelas 8 e 9), kmod (Tabelas 10–12), γw (6.4.5) e fluência (Tabela 15) do piso seco — perfil PROJ-EST R03." },
    { id: "ABNT NBR 8681:2003", titulo: "Ações e segurança nas estruturas — Procedimento", situacao: "Cancelada em 24/09/2025; vigente a NBR 8681:2025",
      alerta: "Edição à qual a NBR 7190-1:2022 remete: coeficientes γ e ψ desta emissão.",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/5835/abnt-nbr8681-acoes-e-seguranca-nas-estruturas",
      uso: "Combinações últimas e de serviço (γ = 1,4; ψ0; ψ2 = 0,4), às quais a 7190-1:2022 remete." },
    { id: "ABNT NBR 6120:2019", titulo: "Ações para o cálculo de estruturas de edificações", situacao: "Em vigor (versão corrigida 2019, confirmada em 27/03/2024)",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/5215/abnt-nbr6120-acoes-para-o-calculo-de-estruturas-de-edificacoes",
      uso: "Peso específico das madeiras (Tabela 1), sobrecargas de uso do piso." },
    { id: "ABNT NBR 6123:2023", titulo: "Forças devidas ao vento em edificações", situacao: "Em vigor (versão corrigida 2025)",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/5616/nbr6123-forcas-devidas-ao-vento-em-edificacoes",
      uso: "Pressão de vento nas paredes e na cobertura (valores recebidos da entrada do modelo; a determinação não é reproduzida aqui)." },
    { id: "ABNT NBR 7199:2025", titulo: "Vidros na construção civil — Projeto, execução e aplicações", situacao: "Em vigor (06/2025; a 2016 vale só para projeto protocolado até 180 dias depois)",
      uso: "Vidro laminado da cobertura: dimensionado e fornecido pelo vidraceiro com as ações deste memorial (seção de premissas)." },
    { id: "ABNT NBR 16936:2023", titulo: "Edificações em light wood frame", situacao: "Em vigor",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/13644/abnt-nbr16936-edificacoes-em-light-wood-frame",
      uso: "Referência do sistema de paredes de wood frame (montantes, chapas, pregação)." },
    { id: "ABNT NBR 6122:2022", titulo: "Projeto e execução de fundações", situacao: "Em vigor",
      url: "https://normas.com.br/visualizar/abnt-nbr-nm/5248/abnt-nbr6122-projeto-e-execucao-de-fundacoes",
      uso: "Responsabilidade do projetista da fundação, que recebe as reações da seção de reações." },
    { id: "EN 1995-1-1:2004+A2:2014", titulo: "Eurocode 5 — Design of timber structures — Part 1-1: General — Common rules and rules for buildings", situacao: "Norma europeia (referência técnica)",
      uso: "Ligações (modelo de Johansen, 8.2–8.5; nef, 8.34) e paredes de contraventamento (9.2.4.2, método A)." },
    { id: "ETA-18/0817 e ETA-11/0024", titulo: "Avaliações técnicas europeias dos parafusos Klimas (Wkręt-Met) e Eurotec", situacao: "Documentos dos fabricantes (catálogo)",
      uso: "Regras de cálculo dos parafusos de catálogo (MadLigCalc.parafusoETA); nenhum fixador de catálogo especificado nas ligações desta emissão." }
  ];

  var SECOES = [
    { id: "objeto", titulo: "Objeto e documentos de referência" },
    { id: "normas", titulo: "Normas técnicas" },
    { id: "materiais", titulo: "Materiais e espécies" },
    { id: "acoes", titulo: "Ações e combinações" },
    { id: "modelo", titulo: "Modelo estrutural" },
    { id: "piso", titulo: "Piso seco" },
    { id: "superestrutura", titulo: "Estrutura acima do piso" },
    { id: "paredes", titulo: "Paredes de contraventamento" },
    { id: "ligacoes", titulo: "Ligações" },
    { id: "reacoes", titulo: "Reações para a fundação" },
    { id: "nivel", titulo: "Nível do piso" },
    { id: "compra", titulo: "Lista de materiais e compra" },
    { id: "premissas", titulo: "Premissas, pendências e itens não abrangidos" },
    { id: "referencias", titulo: "Referências" },
    { id: "termo", titulo: "Responsabilidade técnica" }
  ];
  function S(id) { for (var i = 0; i < SECOES.length; i++) if (SECOES[i].id === id) return i + 1; return "—"; }
  function secao(id) { return "seção " + S(id); }

  var NOME_ESPECIE_CURTO = { tatajuba: "Tatajuba", itauba: "Itaúba", pinus_cca: "Pinus autoclavado" };

  /* ================================================================ DOCUMENTO */
  function Doc() { this.nFig = 0; this.nTab = 0; this.avisos = []; this.conf = []; this.naoAbr = []; }
  Doc.prototype.fig = function (conteudo, legenda, classe) {
    if (!conteudo) return "";
    this.nFig++;
    return '<figure class="fig' + (classe ? " " + classe : "") + '" id="fig' + this.nFig + '">' + conteudo + "<figcaption><b>Figura " + this.nFig + "</b> — " + legenda + "</figcaption></figure>";
  };
  Doc.prototype.tab = function (legenda, cab, linhas, op) {
    op = op || {};
    if (!linhas || !linhas.length) return op.vazio ? '<p class="nota">' + op.vazio + "</p>" : "";
    this.nTab++;
    /* tabela curta não se parte entre páginas (evita cabeçalho órfão no pé da folha) */
    var h = '<table class="t' + (op.classe ? " " + op.classe : "") + (linhas.length <= 10 ? " curta" : "") + '"><caption><b>Tabela ' + this.nTab + "</b> — " + legenda + "</caption>";
    if (cab) h += "<thead><tr>" + cab.map(function (c) { return typeof c === "string" ? "<th>" + c + "</th>" : '<th class="' + c.c + '">' + c.t + "</th>"; }).join("") + "</tr></thead>";
    h += "<tbody>" + linhas.join("") + "</tbody></table>";
    if (op.nota) h += '<p class="nota">' + op.nota + "</p>";
    return h;
  };
  Doc.prototype.aviso = function (texto) { if (this.avisos.indexOf(texto) < 0) this.avisos.push(texto); };
  /* conferência interna: impressa na seção 13 e devolvida; falsa vira aviso */
  Doc.prototype.conferir = function (id, ok, texto) { this.conf.push({ id: id, ok: !!ok, texto: texto }); if (!ok) this.aviso("Conferência falhou — " + texto); };
  Doc.prototype.naoAbrangido = function (texto) { if (this.naoAbr.indexOf(texto) < 0) this.naoAbr.push(texto); };
  function td(h, cls, a) { return "<td" + (cls ? ' class="' + cls + '"' : "") + (a || "") + ">" + (h == null ? "" : h) + "</td>"; }
  function tn(h) { var vis = String(h == null ? "" : h).replace(/<[^>]*>/g, ""); return td(h, vis.length > 26 ? "r" : "n"); }
  function trw(cells, cls, a) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + (a || "") + ">" + cells.join("") + "</tr>"; }
  function thn(tx) { return { t: tx, c: "n" }; }
  function h3(n, tx, cls) { return "<h3" + (cls ? ' class="' + cls + '"' : "") + ">" + n + " " + tx + "</h3>"; }
  function caixa(h, tipo) { return '<div class="caixa' + (tipo ? " " + tipo : "") + '">' + h + "</div>"; }
  function situ(ok) { return ok ? '<span class="ok">OK</span>' : '<span class="falha">NÃO</span>'; }
  function naoAbrCaixa(d, tx, item) { d.naoAbrangido(item || tx); return caixa("<b>Não abrangido nesta emissão.</b> " + tx, "neutra"); }

  /* tabela de verificação passo a passo: passos (texto do motor ou {rotulo, expressao}) + linha final com η e OK/NÃO */
  function tabVerif(d, legenda, passos, eta, onde, op) {
    op = op || {};
    var lin = arr(passos).filter(function (p) { return p != null && p !== ""; }).map(function (p, i) {
      if (typeof p === "object") return trw([td(String(i + 1), "n"), td(t(p.rotulo, onde) + (p.expressao ? ' — <span class="eq">' + t(p.expressao, onde) + "</span>" : "") + (p.valor != null ? " = " + t(p.valor, onde) : ""))]);
      return trw([td(String(i + 1), "n"), td(t(p, onde))]);
    });
    var ok = fin(eta) && eta <= 1 + 1e-9;
    lin.push(trw([td("<b>η</b>", "n"), td("<b>η = " + br(eta, 3) + "</b> — " + situ(ok) + (op.fim ? " " + op.fim : ""))], ok ? "tot" : "tot linha-falha"));
    return d.tab(legenda, [{ t: "Passo", c: "n" }, "Cálculo"], lin, { classe: "verif", nota: op.nota });
  }

  /* ================================================================ CONTEXTO */
  function contexto(r, op) {
    var c = { r: r, op: op, d: obj(op.documento), ob: obj(op.obra), rp: obj(op.responsavel) };
    c.rev = c.d.revisao || (objs(op.revisoes)[0] || {}).rev || "R00";
    c.data = dataTxt(c.d.data);
    c.num = c.d.numero || "";
    c.obraNome = c.ob.nome || "[OBRA]";
    c.mm = dep("MadMateriais", "./madmateriais.js");
    c.md = dep("MadDim", "./maddim7190.js");
    c.mc = op.catalogo || dep("MadCatalogo", "./madcatalogo.js");
    c.mp = dep("MadPiso", "./madpiso.js");
    c.piso = r.piso && typeof r.piso === "object" ? r.piso : null;
    c.modelo = r.modelo && arr(obj(obj(r.modelo).modelo).nos).length ? r.modelo : null;
    c.placas = c.modelo ? objs(c.modelo.placasLista || c.modelo.placas) : [];
    c.an = r.analise && typeof r.analise === "object" ? r.analise : null;
    c.esp = r.especies && typeof r.especies === "object" ? r.especies : null;
    c.paredes = r.paredes && obj(r.paredes).paineis ? r.paredes : null;
    c.acoes = obj(r.acoes);
    c.ligs = objs(r.ligacoes);
    c.verifs = objs(r.verificacoes);
    c.reac = objs(r.reacoesFundacao);
    c.compra = r.compra && typeof r.compra === "object" ? r.compra : null;
    return c;
  }
  function especieNome(c, id) {
    var e = c.mm && c.mm.ESPECIES ? c.mm.ESPECIES[id] : null;
    return e ? e.nome : (NOME_ESPECIE_CURTO[id] || id || "—");
  }

  /* ================================================================ FIGURAS SVG */
  function famCor(g) {
    g = String(g || "");
    if (/^PILAR/.test(g)) return COR.marrom;
    if (/^COB|^FORRO/.test(g)) return COR.verde;
    if (/^BAR|^VP|^TEST|^DORM/.test(g)) return COR.azul;
    if (/^GUIA|^VERGA/.test(g)) return COR.areia;
    return null;
  }
  /* projeção: "iso" (perspectiva axonométrica) ou "planta" (x para a direita, y para cima) */
  function projetor(modo) {
    if (modo === "planta") return function (x, y) { return [x, -y]; };
    var az = -32 * Math.PI / 180, el = 28 * Math.PI / 180, ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    return function (x, y, z) { var u = x * ca - y * sa, v = x * sa + y * ca; return [u, -(z * ce + v * se)]; };
  }
  function caixaDe(pts) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { if (!fin(p[0]) || !fin(p[1])) return; b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); });
    return b;
  }
  /* modelo analítico: barras coloridas pela família (ou por `corDe`), placas sombreadas */
  function svgModelo(c, o) {
    var M = obj(obj(c.modelo).modelo), nos = {}, P = projetor(o.modo), W = o.largura || 680;
    objs(M.nos).forEach(function (n) { nos[n.id] = n; });
    var barras = objs(M.barras).filter(function (b) { return nos[b.i] && nos[b.j] && (!o.filtro || o.filtro(b)); });
    if (!barras.length) return "";
    var pts = [];
    barras.forEach(function (b) { var a = nos[b.i], e = nos[b.j]; pts.push(P(a.x, a.y, a.z)); pts.push(P(e.x, e.y, e.z)); });
    var bx = caixaDe(pts), mg = 14, esc_ = (W - 2 * mg) / Math.max(bx[2] - bx[0], 1e-6);
    var H = (bx[3] - bx[1]) * esc_ + 2 * mg + (o.legenda ? 26 : 0);
    function X(p) { return f1((p[0] - bx[0]) * esc_ + mg); }
    function Y(p) { return f1((p[1] - bx[1]) * esc_ + mg); }
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(W) + " " + f1(H) + '" class="svgm" role="img" aria-label="' + esc(o.titulo || "modelo") + '">';
    if (o.placas !== false) c.placas.forEach(function (pl) {
      var v = arr(pl.vertices).map(function (id) { var n = nos[id]; return n ? P(n.x, n.y, n.z) : null; }).filter(Boolean);
      if (v.length > 2) h += '<polygon points="' + v.map(function (p) { return X(p) + "," + Y(p); }).join(" ") + '" fill="' + COR.areia + '" fill-opacity="0.22" stroke="' + COR.areia + '" stroke-width="0.6"/>';
    });
    var linhas = { fundo: "", frente: "" };
    barras.forEach(function (b) {
      var a = P(nos[b.i].x, nos[b.i].y, nos[b.i].z), e = P(nos[b.j].x, nos[b.j].y, nos[b.j].z);
      var cor = o.corDe ? o.corDe(b) : famCor(b.grupo), fraca = !cor;
      var s = '<line x1="' + X(a) + '" y1="' + Y(a) + '" x2="' + X(e) + '" y2="' + Y(e) + '" stroke="' + (cor || COR.cinza) + '" stroke-width="' + (fraca ? 0.5 : (o.espessura || 1.1)) + '"/>';
      if (fraca) linhas.fundo += s; else linhas.frente += s;
    });
    h += linhas.fundo + linhas.frente;
    if (o.rotulos) o.rotulos.forEach(function (r) { var p = P(r.x, r.y, r.z || 0); h += '<text x="' + X(p) + '" y="' + Y(p) + '" font-size="8" fill="' + COR.azul + '" text-anchor="middle">' + esc(r.texto) + "</text>"; });
    if (o.legenda) {
      var itens = o.itensLegenda || [["Piso seco", COR.azul], ["Pilares compostos", COR.marrom], ["Coberturas e forro", COR.verde], ["Viga de topo e vergas", COR.areia], ["Ligações e apoios", COR.cinza]];
      var lx = mg, ly = H - 12;
      itens.forEach(function (it) { h += '<rect x="' + f1(lx) + '" y="' + f1(ly - 6) + '" width="14" height="5" fill="' + it[1] + '"/><text x="' + f1(lx + 18) + '" y="' + f1(ly) + '" font-size="9" fill="#1d2733">' + esc(it[0]) + "</text>"; lx += 26 + it[0].length * 5.2; });
    }
    return h + "</svg>";
  }
  /* camadas do piso por zona (corte esquemático, espessura em escala) */
  function svgCamadas(c) {
    var cp = obj(c.acoes.camadasPiso), pac = obj(cp.pacotes), zonas = Object.keys(pac);
    if (!zonas.length) return "";
    var nv = obj(c.r.niveisFonte), ePainel = fin(nv.topo_painel) && fin(nv.topo_barrote) ? (nv.topo_painel - nv.topo_barrote) * 100 : null;
    var escY = 15, larg = 120, gap = 50, x0 = 20, topo = 26;
    var maxE = 0; zonas.forEach(function (z) { maxE = Math.max(maxE, soma(arr(pac[z]).map(function (l) { return l[2]; }))); });
    var H = topo + (maxE + (ePainel || 0) + 1.5) * escY + 30, W = x0 + zonas.length * (larg + gap) + 10;
    var cores = { revest: "#d9cfb8", cola: "#b9b2a5", imperm2: "#5f7d95", contrapiso: "#c8ccd0", manta: "#3b3b3b" };
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(W) + " " + f1(H) + '" class="svgm" role="img" aria-label="Camadas do piso">';
    zonas.forEach(function (z, iz) {
      var x = x0 + iz * (larg + gap), y = topo;
      h += '<text x="' + f1(x + larg / 2) + '" y="14" font-size="10" font-weight="600" fill="' + COR.azul + '" text-anchor="middle">' + esc(cap(z)) + "</text>";
      arr(pac[z]).forEach(function (l) {
        var e = num(l[2], 0), hh = Math.max(e * escY, 2.5);
        h += '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + larg + '" height="' + f1(hh) + '" fill="' + (cores[l[0]] || "#ddd") + '" stroke="#555" stroke-width="0.4"/>';
        if (hh >= 9) h += '<text x="' + f1(x + 4) + '" y="' + f1(y + hh / 2 + 3) + '" font-size="7.5" fill="' + (l[0] === "manta" || l[0] === "imperm2" ? "#fff" : "#1d2733") + '">' + esc(l[0]) + " " + esc(br(e, 1)) + " cm</text>";
        else h += '<text x="' + f1(x + larg + 3) + '" y="' + f1(y + hh / 2 + 3) + '" font-size="7" fill="#1d2733">' + esc(l[0]) + " " + esc(br(e, 1)) + "</text>";
        y += hh;
      });
      if (ePainel) {
        var hp = ePainel * escY;
        h += '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + larg + '" height="' + f1(hp) + '" fill="' + COR.areia + '" fill-opacity="0.55" stroke="#555" stroke-width="0.4"/><text x="' + f1(x + 4) + '" y="' + f1(y + hp / 2 + 3) + '" font-size="7.5" fill="#1d2733">Painel Wall ' + esc(br(ePainel, 0)) + " cm</text>";
        y += hp;
      }
      h += '<rect x="' + f1(x + larg / 2 - 12) + '" y="' + f1(y) + '" width="24" height="' + f1(1.2 * escY) + '" fill="' + COR.marrom + '" fill-opacity="0.55" stroke="#555" stroke-width="0.4"/><text x="' + f1(x + larg / 2) + '" y="' + f1(y + 1.2 * escY + 10) + '" font-size="7" fill="#1d2733" text-anchor="middle">barrote</text>';
    });
    return h + "</svg>";
  }
  /* paredes de wood frame em planta (eixos das paredes: x transversal, y longitudinal), Fv,Rd por painel */
  function svgParedes(c) {
    var pn = obj(obj(c.paredes).paineis), ks = Object.keys(pn);
    if (!ks.length) return "";
    var seg = ks.map(function (k) { var p = pn[k]; return p.eixo === "y" ? { k: k, a: [p.posicao, p.de], b: [p.posicao, p.ate], p: p } : { k: k, a: [p.de, p.posicao], b: [p.ate, p.posicao], p: p }; })
      .filter(function (s) { return fin(s.a[0]) && fin(s.a[1]) && fin(s.b[0]) && fin(s.b[1]); });
    if (!seg.length) return "";
    /* planta deitada: y (longitudinal) para a direita, x (transversal) para cima */
    var pts = []; seg.forEach(function (s) { pts.push([s.a[1], -s.a[0]]); pts.push([s.b[1], -s.b[0]]); });
    var bx = caixaDe(pts), W = 680, mg = 30, k = (W - 2 * mg) / Math.max(bx[2] - bx[0], 1e-6), H = (bx[3] - bx[1]) * k + 2 * mg + 22;
    function X(v) { return f1((v - bx[0]) * k + mg); }
    function Y(v) { return f1((v - bx[1]) * k + mg); }
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + f1(H) + '" class="svgm" role="img" aria-label="Paredes de contraventamento">';
    seg.forEach(function (s) {
      var p = s.p, conta = num(p.FvRd_kN, 0) > 0, ref = !!p.reforco, cor = !conta ? COR.cinza : (ref ? COR.verde : COR.azul);
      h += '<line x1="' + X(s.a[1]) + '" y1="' + Y(-s.a[0]) + '" x2="' + X(s.b[1]) + '" y2="' + Y(-s.b[0]) + '" stroke="' + cor + '" stroke-width="' + (conta ? 4 : 2) + '" stroke-linecap="butt"/>';
      arr(p.aberturas).forEach(function (ab) {
        var a = p.eixo === "y" ? [p.posicao, ab[0]] : [ab[0], p.posicao], b = p.eixo === "y" ? [p.posicao, ab[1]] : [ab[1], p.posicao];
        h += '<line x1="' + X(a[1]) + '" y1="' + Y(-a[0]) + '" x2="' + X(b[1]) + '" y2="' + Y(-b[0]) + '" stroke="#ffffff" stroke-width="3" stroke-dasharray="3 2"/>';
      });
      var mx = (s.a[1] + s.b[1]) / 2, my = -(s.a[0] + s.b[0]) / 2, vert = p.eixo !== "y";
      var tx = Number(X(mx)) + (vert ? -8 : 0), ty = Number(Y(my)) + (vert ? 0 : -6);
      h += '<text x="' + f1(tx) + '" y="' + f1(ty) + '" font-size="8.5" fill="#1d2733" text-anchor="middle"' + (vert ? ' transform="rotate(-90 ' + f1(tx) + " " + f1(ty) + ')"' : "") + ">P" + esc(s.k) + (conta ? " · " + esc(br(ref ? p.reforco.FvRd_kN : p.FvRd_kN, 1)) + " kN" : "") + "</text>";
    });
    var ly = H - 8, it = [["Trecho que conta, 1 face", COR.azul], ["Reforçado (2 faces, pregação densa)", COR.verde], ["Não conta (abertura ou b < h/4)", COR.cinza]], lx = mg;
    it.forEach(function (q) { h += '<rect x="' + f1(lx) + '" y="' + f1(ly - 6) + '" width="16" height="4" fill="' + q[1] + '"/><text x="' + f1(lx + 20) + '" y="' + f1(ly) + '" font-size="9">' + esc(q[0]) + "</text>"; lx += 34 + q[0].length * 5; });
    return h + "</svg>";
  }
  /* locação dos pilaretes com G + Q (eixos da fundação) */
  function vN(x) { return fin(x) ? x : num(obj(x).N, NaN); }
  function svgReacoes(c) {
    var R = c.reac.filter(function (p) { return fin(p.x) && fin(p.y); });
    if (!R.length) return "";
    var pts = R.map(function (p) { return [p.x, -p.y]; }), bx = caixaDe(pts), W = 680, mg = 34, k = (W - 2 * mg) / Math.max(bx[2] - bx[0], 1e-6), H = (bx[3] - bx[1]) * k + 2 * mg + 14;
    var maxN = 0; R.forEach(function (p) { maxN = Math.max(maxN, num(vN(p.G), 0) + num(vN(p.Q), 0)); });
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + f1(H) + '" class="svgm" role="img" aria-label="Locação dos pilaretes">';
    R.forEach(function (p) {
      var x = (p.x - bx[0]) * k + mg, y = (-p.y - bx[1]) * k + mg, N = num(vN(p.G), 0) + num(vN(p.Q), 0), rr = 3 + 9 * Math.sqrt(Math.max(N, 0) / Math.max(maxN, 1e-6));
      var cor = num(vN(p.G), 0) < 0 || num(vN(p.Q), 0) < 0 ? COR.falha : COR.azul;
      h += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(rr) + '" fill="' + cor + '" fill-opacity="0.18" stroke="' + cor + '" stroke-width="0.8"/>';
      h += '<text x="' + f1(x) + '" y="' + f1(y - rr - 2) + '" font-size="7.5" text-anchor="middle" fill="#1d2733">' + esc(p.pilarete) + "</text>";
      h += '<text x="' + f1(x) + '" y="' + f1(y + rr + 8) + '" font-size="7" text-anchor="middle" fill="' + COR.marrom + '">' + esc(br(N, 1)) + "</text>";
    });
    return h + '<text x="' + mg + '" y="' + f1(H - 4) + '" font-size="8.5" fill="#4a5664">Círculo proporcional a G + Q característicos (kN, abaixo do pilarete). Eixos do modelo: x para a direita, y para cima.</text></svg>';
  }

  /* ================================================================ SEÇÕES */
  /* ---------- 1. objeto */
  function secObjeto(c, d, n) {
    var r = c.r, h = "", esp = c.esp, nP = esp ? arr(esp.pecas).length : null, vol = esp ? soma(Object.keys(obj(esp.porEspecie)).map(function (k) { return esp.porEspecie[k].volume_m3; })) : null;
    h += "<p>Este memorial apresenta o cálculo da estrutura de madeira da obra <b>" + esc(c.obraNome) + "</b>" + (c.ob.endereco || c.ob.cidade ? " (" + [c.ob.endereco, c.ob.cidade].filter(Boolean).map(esc).join(" — ") + ")" : "") +
      ", gerado pelo OrçaPRO a partir dos motores de cálculo de madeira: espécies por função, piso seco, modelo analítico, paredes de contraventamento, ligações, reações para a fundação e lista de compra. Cada número vem do resultado do cálculo; o que não foi calculado nesta emissão está identificado como <b>não abrangido</b> e listado na " + secao("premissas") + ".</p>";
    if (nP != null) h += "<p>A estrutura tem " + plural(nP, "peça", "peças") + " de madeira (" + un(vol, 2, "m³") + ")" + (c.piso ? ", piso seco sobre " + plural(arr(obj(c.piso.reacoesPilaretes).pilaretes).length, "pilarete", "pilaretes") + " de concreto" : "") +
      (c.paredes ? ", " + plural(Object.keys(c.paredes.paineis).length, "parede", "paredes") + " de wood frame" : "") + (c.modelo ? " e duas coberturas sobre pilares compostos (modelo com " + br(arr(c.modelo.modelo.nos).length, 0) + " nós e " + br(arr(c.modelo.modelo.barras).length, 0) + " barras)" : "") + ".</p>";
    /* escopo desta emissão */
    var esc_ = [
      ["Espécies e materiais", esp ? "calculado" : null, S("materiais")],
      ["Ações e combinações", c.piso || objs(r.combinacoes).length ? "calculado" : null, S("acoes")],
      ["Modelo analítico", c.modelo ? "gerado" : null, S("modelo")],
      ["Piso seco (barrotes e vigas principais)", c.piso ? "verificado" : null, S("piso")],
      ["Análise global e estabilidade", c.an ? "calculado" + (fin(num(obj(c.an).alphaCr, NaN)) ? " (α_cr = " + br(c.an.alphaCr, 1) + ")" : "") : null, S("modelo")],
      ["Pilares, coberturas, viga de topo e vergas", c.verifs.length ? plural(c.verifs.length, "membro verificado", "membros verificados") + (c.verifs.filter(function (v) { return !(num(v.eta, 9) <= 1 + 1e-9); }).length ? " — " + plural(c.verifs.filter(function (v) { return !(num(v.eta, 9) <= 1 + 1e-9); }).length, "não atende", "não atendem") : "") : null, S("superestrutura")],
      ["Paredes de contraventamento", c.paredes ? "resistência calculada; solicitação não abrangida" : null, S("paredes")],
      ["Ligações", c.ligs.filter(function (l) { return fin(l.eta); }).length ? plural(c.ligs.filter(function (l) { return fin(l.eta); }).length, "verificação", "verificações") + "; " + plural(c.ligs.filter(function (l) { return !fin(l.eta); }).length, "tipo não verificado", "tipos não verificados") : null, S("ligacoes")],
      ["Reações para a fundação", c.reac.length ? (c.an ? "calculado (análise global)" : "calculado") : null, S("reacoes")],
      ["Nível do piso", r.nivel ? "calculado" : null, S("nivel")],
      ["Vidro da cobertura (NBR 7199:2025)", null, S("premissas")],
      ["Lista de compra", c.compra ? "calculado" : null, S("compra")]
    ];
    h += d.tab("Escopo desta emissão", ["Parte", "Situação", thn("Seção")], esc_.map(function (x) {
      return trw([td(esc(x[0])), td(x[1] ? esc(x[1]) : '<span class="na">não abrangido nesta emissão</span>'), tn(String(x[2]))]);
    }));
    h += h3(n + ".1", "Documentos de referência");
    var docs = arr(c.op.documentosReferencia);
    h += docs.length ? "<ul>" + docs.map(function (x) { return "<li>" + t(x, "documentos") + "</li>"; }).join("") + "</ul>" : "<p>" + ph("", "DOCUMENTOS DE REFERÊNCIA") + "</p>";
    h += h3(n + ".2", "Convenções");
    h += "<p>Unidades: m, cm, mm, kN, kN/m, kN/m², MPa. Coordenadas do modelo de madeira: x ao longo do quiosque, y transversal, z = 0 no piso acabado. Reações: N &gt; 0 = compressão no pilarete (convenção completa na " + secao("reacoes") + "). η = solicitação de cálculo / resistência de cálculo (aproveitamento); η ≤ 1,00 atende (<span class=\"ok\">OK</span>), η &gt; 1,00 não atende (<span class=\"falha\">NÃO</span>).</p>";
    return h;
  }

  /* ---------- 2. normas */
  function secNormas(c, d) {
    var h = "<p>Normas aplicadas e situação na data deste memorial (vigência conferida no catálogo da ABNT e na biblioteca técnica da RA em " + NORMAS_CONFERIDAS + "). Em cada verificação o memorial cita a edição e o item usados.</p>";
    h += d.tab("Normas e documentos normativos", ["Norma", "Título", "Situação", "Uso neste memorial"], NORMAS.map(function (nm) {
      return trw([td("<b>" + esc(nm.id) + "</b>"), td(esc(nm.titulo) + (nm.url ? '<span class="url">' + esc(nm.url) + "</span>" : "")), td(esc(nm.situacao) + (nm.alerta ? '<br><span class="alerta-tx">' + esc(nm.alerta) + "</span>" : "")), td(esc(nm.uso))]);
    }), { classe: "normas" });
    h += "<p>As barras acima do piso são verificadas pela NBR 7190-1:2022. O piso seco usa o critério conservador do RT (coeficientes da NBR 7190:1997, que dão resistências de cálculo menores que os da edição de 2022).</p>";
    return h;
  }

  /* ---------- 3. materiais e espécies */
  function rotuloGrupo(re) {
    var s = String(re && re.source ? re.source : re);
    var m = { "^WF_GUIA_SUP$": "Viga de topo (guia superior 10×20)", "^WF_VERGA$": "Vergas 5×20", "^WF_|^FORRO_": "Wood frame (montantes, guias, travessas) e forro", "^PISO_": "Piso seco (barrotes, vigas principais, requadros, testeiras)",
      "^PILAR_|^COB_": "Pilares compostos e coberturas (pergolado)", "^BRISE|^RIPADO|^PERGOLADO": "Brises e ripados" };
    return m[s] || s.replace(/[\^$|\\]/g, " ").trim();
  }
  function secMateriais(c, d, n) {
    var h = "", esp = c.esp, r = c.r, mm = c.mm;
    if (!esp) return naoAbrCaixa(d, "O resultado não traz a especificação de espécies.", "Especificação de espécies por função");
    h += "<p>A espécie de cada peça segue a especificação por função decidida pelo cliente (quem compra a madeira); o cálculo pode recusar uma espécie que não passa, nunca trocá-la sem aviso. A classe de resistência é atribuição de projeto (premissa do RT), não ensaio.</p>";
    /* regras únicas, na ordem em que aparecem */
    var regras = [], porRegra = {};
    arr(esp.pecas).forEach(function (p) {
      var rg = obj(p.regra), k = String(rg.grupo) + "|" + (arr(rg.secoes).join(",")) + "|" + rg.especie;
      if (!porRegra[k]) { porRegra[k] = { regra: rg, n: 0, vol: 0, de: {} }; regras.push(k); }
      porRegra[k].n++;
      if (p.de && p.de !== p.para) porRegra[k].de[p.de] = (porRegra[k].de[p.de] || 0) + 1;
    });
    var volPorId = {}; objs(r.pecas).forEach(function (p) { volPorId[p.id] = num(p.volume_m3, 0); });
    arr(esp.pecas).forEach(function (p) { var rg = obj(p.regra), k = String(rg.grupo) + "|" + (arr(rg.secoes).join(",")) + "|" + rg.especie; porRegra[k].vol += num(volPorId[p.id], 0); });
    var temVol = objs(r.pecas).length > 0;
    h += d.tab("Espécie por função (especificação)", ["Função", "Espécie", thn("Peças"), thn("Volume"), "Classe adotada (premissa do RT)", "Origem da decisão"], regras.map(function (k) {
      var x = porRegra[k], rg = x.regra, e = mm && mm.ESPECIES ? mm.ESPECIES[rg.especie] : null, cl = obj(r.classes)[rg.especie];
      var clTxt = e ? (mm.CLASSES_1997[cl || e.classe1997] ? esc(mm.CLASSES_1997[cl || e.classe1997].nome) + " (7190:1997)" : esc(cl || e.classe1997)) + (e.classe2022 ? "; " + esc(e.classe2022) + " (NBR 7190-1:2022)" : "") : ph(cl, "CLASSE");
      var trocas = Object.keys(x.de).map(function (de) { return x.de[de] + " peças trocadas de " + esc(NOME_ESPECIE_CURTO[de] || de); }).join("; ");
      return trw([td(esc(rotuloGrupo(rg.grupo)) + (rg.secoes ? " — seção " + esc(arr(rg.secoes).join(", ").replace(/x/g, "×")) + " cm" : "")), td(esc(especieNome(c, rg.especie)) + (rg.conferir ? ' <span class="alerta-tx">(a confirmar)</span>' : "")),
        tn(br(x.n, 0)), tn(temVol ? un(x.vol, 3, "m³") : "—"), td(clTxt), td(t(rg.origem, "origem") + (rg.data ? ", " + esc(dataIso(rg.data)) : "") + (trocas ? '<br><span class="nota">' + trocas + "</span>" : ""))]);
    }), { classe: "compacta" });
    /* propriedades por espécie */
    if (mm && mm.ESPECIES) {
      var ids = Object.keys(obj(esp.porEspecie));
      h += d.tab("Propriedades das espécies usadas", ["Espécie", thn("Peças"), thn("Volume"), "Peso para cargas (NBR 6120:2019)", "ρk das ligações", "Uso"], ids.map(function (id) {
        var e = mm.ESPECIES[id] || {}, pe = esp.porEspecie[id];
        return trw([td("<b>" + esc(e.nome || id) + "</b>"), tn(br(pe.n, 0)), tn(un(pe.volume_m3, 3, "m³")), td(fin(e.gamaCarga) ? un(e.gamaCarga, 1, "kN/m³") + ' <span class="nota">' + t(e.fonteGama) + "</span>" : '<span class="alerta-tx">a confirmar</span>' + (e.duvida ? ' <span class="nota">' + t(e.duvida) + "</span>" : "")),
          td(fin(e.rhoKLig) ? un(e.rhoKLig, 0, "kg/m³") + ' <span class="nota">' + t(e.fonteRhoK) + "</span>" : "—"), td(t(e.uso))]);
      }), { classe: "compacta", nota: "Densidade de resistência (ρk, ligações) e peso específico de carga (NBR 6120) são grandezas distintas e não se trocam uma pela outra." });
    }
    /* classes e valores de cálculo */
    if (mm && c.piso && c.piso.classe && c.piso.perfil) {
      try {
        var cl = mm.classe(c.piso.classe), pf = mm.perfil(c.piso.perfil), rs = mm.resistencias(c.piso.classe, c.piso.perfil);
        h += h3(n + ".1", "Classe e valores de cálculo do piso seco");
        h += d.tab("Classe " + esc(cl.nome) + " — " + esc(cl.fonte), ["Propriedade", thn("Característico"), thn("De cálculo"), "Expressão"], [
          trw([td("Compressão paralela"), tn(un(cl.fc0k, 1, "MPa")), tn(un(rs.fc0d, 2, "MPa")), td('<span class="eq">fc0,d = kmod·fc0,k/γwc = ' + br(pf.kmod, 3) + "·" + br(cl.fc0k, 0) + "/" + br(pf.gw.c, 1) + "</span>")]),
          trw([td("Cisalhamento paralelo"), tn(un(cl.fvk, 1, "MPa")), tn(un(rs.fvd, 3, "MPa")), td('<span class="eq">fv,d = kmod·fv,k/γwv = ' + br(pf.kmod, 3) + "·" + br(cl.fvk, 0) + "/" + br(pf.gw.v, 1) + "</span>")]),
          trw([td("Módulo de elasticidade"), tn(un(cl.Ec0m, 0, "MPa")), tn(un(rs.Eef, 0, "MPa")), td('<span class="eq">Ec0,ef = kmod·Ec0,m</span> (flecha do perfil R03)')]),
          trw([td("Densidade aparente"), tn(un(cl.rhoAp, 0, "kg/m³")), tn("—"), td("NBR 7190:1997, Tabela 9")])
        ], { nota: "Perfil: " + t(pf.nome) + " — kmod = " + t(pf.kmodPartes) + " = " + br(pf.kmod, 3) + "; fonte: " + t(pf.fonte) + "." });
      } catch (e) { d.aviso("Materiais: " + e.message); }
    }
    /* painéis e ferragens */
    h += h3(n + ".2", "Painéis, chapas e aço das ferragens");
    var lin = [], MC = c.mc, EV = obj(c.r.paredesPremissas).catalogo;
    if (EV && EV.produto) lin.push(trw([td("<b>" + t(EV.produto) + "</b>"), td("Contraventamento das paredes de wood frame: " + br(EV.largura_m, 2) + " × " + br(EV.altura_m, 2) + " m, " + br(EV.espessura_mm, 0) + " mm, " + br(EV.massa_kg, 0) + " kg; montantes a no máximo " + br(EV.montantesMaxCm, 0) + " cm. G e ρk da chapa: " + t(EV.gChapa) + "; " + t(EV.rhoKChapa) + "."), td(t(EV.fonte))]));
    var pw = MC && MC.produto ? MC.produto("eternit-painel-wall-40") : null;
    if (pw) {
      var dt = obj(pw.dados_tecnicos), v0 = objs(pw.variantes)[0] || {};
      lin.push(trw([td("<b>" + t(pw.fabricante + " " + pw.linha) + "</b>"), td(t(pw.nome_pt) + ". " + br(v0.L_mm / 1000, 2) + " × " + br(v0.largura_mm / 1000, 2) + " m, " + br(v0.massa_kg_m2, 0) + " kg/m²; densidade aproximada " + un(dt.densidade_aprox_kg_m3_40mm, 0, "kg/m³") + '. <span class="alerta-tx">' + t(obj(pw.item_orcamento_nibra).obs) + "</span>"), td(t(obj(MC.fonte(pw)).titulo || "ficha técnica") + ", p. " + t(dt.pagina))]));
    }
    lin.push(trw([td("<b>Aço inoxidável A4-70</b>"), td("Barras roscadas, chumbadores químicos e tirefonds das ligações: fub = 700 MPa (classe de propriedade 70)."), td("ISO 3506-1; EN 1993-1-8, Tabela 3.4")]));
    h += d.tab("Painéis e aço", ["Material", "Especificação", "Fonte"], lin, { classe: "compacta" });
    /* a confirmar */
    var conf = arr(esp.conferir);
    if (conf.length || (mm && mm.ESPECIES && mm.ESPECIES.pinus_cca && mm.ESPECIES.pinus_cca.duvida))
      h += h3(n + ".3", "Itens a confirmar") + "<ul>" + conf.map(function (x) { return "<li>" + t(x.nota, "conferir") + " (" + plural(num(x.n, 0), "peça", "peças") + ")</li>"; }).join("") +
        (mm && mm.ESPECIES.pinus_cca && mm.ESPECIES.pinus_cca.duvida ? "<li>" + t(mm.ESPECIES.pinus_cca.duvida) + ".</li>" : "") + "</ul>";
    return h;
  }

  /* ---------- 4. ações e combinações */
  function secAcoes(c, d, n) {
    var h = "", piso = c.piso, cp = obj(c.acoes.camadasPiso), cc = obj(c.acoes.cargasCype), vp = obj(c.acoes.ventoParedes), sub = 0;
    function s3(tx) { sub++; return h3(n + "." + sub, tx); }
    /* camadas */
    var pac = obj(cp.pacotes), zonas = Object.keys(pac);
    if (zonas.length) {
      h += s3("Piso: camadas por zona (permanentes sobre o Painel Wall)");
      h += "<p>O piso executado é o <b>contrapiso</b> armado sobre manta asfáltica, apoiado no Painel Wall 40 mm. Peso de cada camada = espessura × peso específico (NBR 6120:2019); os pacotes, espessuras e pesos específicos são os do arquivo de camadas do piso" + (cp.revisao ? " (" + t(cp.revisao) + ")" : "") + ".</p>";
      var lin = [];
      zonas.forEach(function (z) {
        var tot = 0, cam = arr(pac[z]);
        cam.forEach(function (l, i) {
          var e = num(l[2], NaN), g = num(l[3], NaN), p = e / 100 * g; tot += fin(p) ? p : 0;
          lin.push(trw([i === 0 ? td("<b>" + esc(cap(z)) + "</b>", "", ' rowspan="' + (cam.length + 1) + '"') : "", td(esc(l[0])), td(t(l[1], "camada")), tn(un(e, 1, "cm")), tn(un(g, 1, "kN/m³")), tn(un(p, 3, "kN/m²"))].filter(Boolean)));
        });
        var zz = obj(obj(cp.zonas)[z]);
        lin.push(trw([td("Soma das camadas " + un(tot, 3, "kN/m²") + "; com o Painel Wall: " + un(zz.peso_camadas_kN_m2, 2, "kN/m²") + "; G adotado no cálculo R03: " + un(zz.G_do_calculo_kN_m2, 2, "kN/m²") + (fin(zz.area_m2) ? "; área " + un(zz.area_m2, 2, "m²") : ""), "", ' colspan="5"')], "tot"));
      });
      h += d.tab("Camadas do piso por zona", ["Zona", "Camada", "Descrição", thn("e"), thn("γ"), thn("Peso")], lin, { classe: "compacta camadas" });
      h += d.fig(svgCamadas(c), "Camadas do piso por zona (espessuras em escala), sobre o Painel Wall e o barrote. Fonte: arquivo de camadas do piso e níveis da fonte de peças.");
    } else d.naoAbrangido("Detalhamento das camadas do piso por zona (contrapiso, manta, revestimento): não veio no resultado.");
    /* G e Q por zona de cálculo */
    if (piso && piso.cargasZona) {
      var cz = piso.cargasZona, G = obj(cz.G_Z_kN_m2), Q = obj(cz.Q_Z_kN_m2), QQ = c.mp && c.mp.QUIOSQUE ? obj(c.mp.QUIOSQUE.G) : {};
      h += s3("Piso: cargas por zona de cálculo");
      h += d.tab("Cargas características do piso por zona de cálculo", ["Zona", thn("G (permanente)"), thn("Q (sobrecarga de uso)"), "Observação"], Object.keys(G).map(function (z) {
        var ob = fin(num(piso.gTijolo, NaN)) && fin(QQ[z]) && Math.abs(G[z] - QQ[z] - piso.gTijolo) < 1e-6 ? "inclui os tijolos espalhados da ducha: " + un(piso.gTijolo, 3, "kN/m²") + " sobre " + un(QQ[z], 2, "kN/m²") : "";
        return trw([td(esc(cap(z))), tn(un(G[z], 2, "kN/m²")), tn(un(Q[z], 1, "kN/m²")), td(ob)]);
      }), { nota: "Q: NBR 6120:2019 (valores adotados no cálculo emitido R03). Revestimento de parede sobre o peso do modelo: " + un(cz.G_revest_parede_kN_m, 2, "kN/m") + "." });
      var pa = objs(piso.paredes);
      if (pa.length) h += d.tab("Paredes apoiadas no piso (carga linear permanente)", ["Painel", "Início (x; y)", "Fim (x; y)", thn("g")], pa.map(function (w) {
        return trw([td((/^PN/.test(String(w.painel)) ? "" : "PN-") + esc(w.painel)), td(br(arr(w.a)[0], 3) + "; " + br(arr(w.a)[1], 3) + " m"), td(br(arr(w.b)[0], 3) + "; " + br(arr(w.b)[1], 3) + " m"), tn(un(w.g_kN_m, 3, "kN/m"))]);
      }), { classe: "compacta" });
    } else d.naoAbrangido("Cargas do piso por zona: o resultado não traz o piso.");
    /* cobertura e paredes (modelo global) */
    if (Object.keys(cc).length) {
      h += s3("Coberturas e paredes (ações do modelo global)");
      var lp = Object.keys(obj(cc.parede_kN_por_parcela)).map(function (k) { return trw([td(t(k)), tn(un(cc.parede_kN_por_parcela[k], 2, "kN"))]); });
      lp.push(trw([td("<b>Total das paredes</b> (comprimento " + un(cc.parede_comprimento_m, 2, "m") + " → " + un(cc.q_parede_kN_m, 3, "kN/m") + ")"), tn("<b>" + un(cc.parede_total_kN, 2, "kN") + "</b>")], "tot"));
      h += d.tab("Peso das paredes por parcela", ["Parcela", thn("Peso")], lp, { classe: "compacta" });
      var lc = [];
      if (fin(cc.cobertura_g_kN_m2)) lc.push(trw([td("Permanente da cobertura (vidro, ripado, vedação)"), tn(un(cc.cobertura_g_kN_m2, 3, "kN/m²"))]));
      Object.keys(obj(cc.longarina_CP_kN_m)).forEach(function (k) { lc.push(trw([td("Longarina — permanente — " + t(k)), tn(un(cc.longarina_CP_kN_m[k], 3, "kN/m"))])); });
      Object.keys(obj(cc.longarina_SCcob_kN_m)).forEach(function (k) { lc.push(trw([td("Longarina — sobrecarga de cobertura — " + t(k)), tn(un(cc.longarina_SCcob_kN_m[k], 3, "kN/m"))])); });
      h += d.tab("Cargas da cobertura aplicadas ao modelo", ["Ação", thn("Valor")], lc, { classe: "compacta" });
    }
    /* vento */
    if (fin(num(vp.q_kPa, NaN)) || fin(num(cc.vento_q_kPa, NaN))) {
      h += s3("Vento");
      h += "<p>Pressão dinâmica q = " + un(num(vp.q_kPa, cc.vento_q_kPa), 3, "kPa") + (fin(cc.S2) ? " (S2 = " + br(cc.S2, 3) + ")" : "") + (fin(vp.Ca) ? "; coeficiente de arrasto das paredes Ca = " + br(vp.Ca, 2) : "") + (fin(vp.h_parede_m) ? "; altura das paredes " + un(vp.h_parede_m, 2, "m") : "") +
        ". Os valores vieram prontos da entrada do modelo (NBR 6123:2023); a determinação de V0, S1, S2 e S3 não é reproduzida neste memorial.</p>";
      d.naoAbrangido("Determinação da pressão de vento pela NBR 6123:2023 (V0, S1, S2, S3): a pressão veio pronta da entrada do modelo.");
      var lv = ["X", "Y"].filter(function (k) { return vp[k]; }).map(function (k) {
        var v = vp[k]; return trw([td("Vento em " + k), tn(un(v.fachada_fechada_m, 2, "m")), tn(un(v.F_total_kN, 2, "kN")), tn(un(v.topo_kN, 2, "kN")), tn(un(v.piso_kN, 2, "kN")), tn(un(v.topo_por_face_kN_m, 3, "kN/m"))]);
      });
      if (lv.length) h += d.tab("Forças de vento nas paredes", ["Direção", thn("Fachada fechada"), thn("F total"), thn("Topo"), thn("Piso"), thn("Topo por face")], lv);
      var lc2 = [];
      Object.keys(obj(cc.longarina_succao_kN_m)).forEach(function (k) { lc2.push(trw([td("Sucção na longarina — " + t(k)), tn(un(cc.longarina_succao_kN_m[k], 3, "kN/m"))])); });
      if (fin(cc.vento_lateral_cobertura_kN_m_por_borda)) lc2.push(trw([td("Vento lateral na borda da cobertura"), tn(un(cc.vento_lateral_cobertura_kN_m_por_borda, 3, "kN/m"))]));
      if (fin(cc.vento_pilar_kN_m)) lc2.push(trw([td("Vento nos pilares"), tn(un(cc.vento_pilar_kN_m, 3, "kN/m"))]));
      if (lc2.length) h += d.tab("Vento na cobertura e nos pilares", ["Ação", thn("Valor")], lc2, { classe: "compacta" });
    } else d.naoAbrangido("Vento: o resultado não traz a pressão de vento.");
    /* combinações */
    var cb = objs(c.r.combinacoes);
    h += s3("Combinações e coeficientes de modificação");
    if (cb.length) {
      h += "<p>Combinações da NBR 8681:2003 (edificação tipo 2, γ = 1,4), às quais a NBR 7190-1:2022 remete; ψ0 = 0,7 para a sobrecarga e 0,6 para o vento. kmod1 de longa duração quando a variável principal é a sobrecarga e de curta duração quando é o vento; kmod2 da classe de umidade 3. A NBR 8681:2025 está em vigor e não foi conferida.</p>";
      h += d.tab("Combinações usadas", ["Tipo", "Combinação", thn("kmod"), "kmod (partes)", "Uso"], cb.map(function (k) {
        return trw([td(esc(k.tipo)), td('<span class="eq">' + t(k.expressao, "combinação") + "</span>"), tn(fin(k.kmod) ? br(k.kmod, 3) : "—"), td(t(k.kmodTxt || "")), td(t(k.uso || ""))]);
      }), { classe: "compacta" });
    } else h += naoAbrCaixa(d, "O resultado não traz a lista de combinações.", "Lista de combinações de ações");
    return h;
  }

  /* ---------- 5. modelo */
  function secModelo(c, d, n) {
    var h = "", G = c.modelo;
    if (!G) return naoAbrCaixa(d, "O resultado não traz o modelo analítico.", "Modelo analítico");
    var M = G.modelo, res = obj(G.resumo);
    h += "<p>O modelo analítico é gerado da mesma fonte de peças que gera o modelo BIM e o IFC (nada é modelado à mão no programa de análise): " + br(arr(M.nos).length, 0) + " nós, " + br(arr(M.barras).length, 0) + " barras, " + br(arr(M.apoios).length, 0) + " apoios, " + br(arr(G.placas).length, 0) + " placas (paredes que travam)" +
      (fin(res.areaCoberturaM2) ? " e " + un(res.areaCoberturaM2, 2, "m²") + " de cobertura" : "") + ". Sistema: " + t(M.sistema) + "; apoios na cota única " + un(M.z_apoios, 2, "m") + ".</p>";
    h += h3(n + ".1", "Regras de modelagem");
    var regras = String(M.regras || "").split("\n").filter(function (l) { return l.trim() && !/^\(cada uma/.test(l.trim()); });
    var itens = [], atual = null;
    regras.forEach(function (l) { var m = /^\s*(\d+)\.\s+(.*)$/.exec(l); if (m) { atual = { n: m[1], tx: m[2] }; itens.push(atual); } else if (atual) atual.tx += " " + l.trim(); });
    h += itens.length ? '<ol class="regras">' + itens.map(function (x) { return "<li>" + t(x.tx, "regra") + "</li>"; }).join("") + "</ol>" : "<p>—</p>";
    h += d.fig(svgModelo(c, { modo: "iso", titulo: "Modelo analítico em perspectiva", legenda: true }), "Modelo analítico em perspectiva: barras no eixo das peças, placas das paredes de contraventamento (sombreadas) e ligações curtas (cinza).");
    h += d.fig(svgModelo(c, { modo: "planta", titulo: "Modelo analítico em planta", legenda: true, espessura: 0.9 }), "Modelo analítico em planta (x para a direita, y para cima).");
    /* seções por etiqueta */
    var sec = obj(M.secoes), cont = {};
    objs(M.barras).forEach(function (b) { cont[b.grupo] = (cont[b.grupo] || 0) + 1; });
    var espMudou = [];
    var lin = arr(M.etiquetas).map(function (g) {
      var s = obj(sec[g]);
      return trw([td(esc(g)), tn(br(cont[g] || 0, 0)), td(s.perfil ? esc(String(s.perfil).replace(/x/g, "×")) + " cm" : "—"), td(t(s.material || "—")), td(t(s.especie || "—"))]);
    });
    h += h3(n + ".2", "Barras por etiqueta");
    h += d.tab("Etiquetas, seções e materiais do modelo", ["Etiqueta", thn("Barras"), "Seção", "Material no modelo", "Espécie no modelo"], lin, { classe: "compacta" });
    /* espécie das seções */
    var comEsp = Object.keys(sec).filter(function (g) { return obj(sec[g]).especieId; });
    if (comEsp.length) h += caixa("As seções do modelo usam a espécie da especificação do cliente (" + secao("materiais") + ") e, na análise global, o módulo de elasticidade médio E0,med da classe adotada (fluência só na flecha).");
    /* casca das paredes */
    var pl = c.placas;
    if (pl.length) {
      h += h3(n + ".3", "Paredes como casca (placas)");
      h += "<p>Cada trecho cheio de parede que trava a estrutura (sem vão de porta, largura b ≥ h/4) é uma placa entre o eixo do dormente e o da guia superior, com o módulo de elasticidade equivalente à rigidez da chapa pregada (" + secao("paredes") + "). O peso da parede vai como carga permanente no dormente.</p>";
      h += d.tab("Placas do modelo", ["Painel", "Trecho", thn("b"), thn("H"), thn("Faces"), thn("Pregos a"), thn("K do trecho"), thn("E equivalente")], pl.map(function (p) {
        return trw([td("PN-" + esc(p.painel) + (p.reforco ? " (reforçado)" : "")), td(br(arr(p.trecho)[0], 3) + " a " + br(arr(p.trecho)[1], 3) + " m"), tn(un(p.b_m, 3, "m")), tn(un(p.H_m, 3, "m")), tn(br(p.faces, 0)), tn(un(p.s_m * 100, 1, "cm")), tn(un(p.K_trecho_kN_m, 1, "kN/m")), tn(un(p.E_MPa, 1, "MPa"))]);
      }), { classe: "compacta" });
    }
    /* hipóteses e balanço */
    var hip = obj(G.hipoteses), bal = obj(G.balanco);
    if (Object.keys(bal).length) {
      h += h3(n + ".4", "Hipóteses de carga do modelo");
      var nomes = { CP: "Permanente (além do peso próprio)", SCpiso: "Sobrecarga do piso", SCcob: "Sobrecarga da cobertura", V1: "Vento 1", V2: "Vento 2", V3: "Vento 3", V4: "Vento 4" };
      h += d.tab("Soma das cargas aplicadas por hipótese (balanço do gerador)", ["Nº", "Hipótese", thn("Σ cargas")], Object.keys(hip).map(function (k) {
        return trw([td(esc(k)), td(esc(hip[k]) + " — " + esc(nomes[hip[k]] || "")), tn(un(bal[hip[k]], 2, "kN"))]);
      }), { nota: "O peso próprio das barras é gerado pelo programa de análise e não entra nesta soma." });
    }
    var av = unicos(arr(M.avisos).map(function (a) { return String(a).replace(/inclinada \d+° em planta/, "inclinada em planta"); }));
    if (av.length) h += h3(n + ".5", "Avisos do gerador") + "<ul>" + av.map(function (a) { var k = arr(M.avisos).filter(function (x) { return String(x).replace(/inclinada \d+° em planta/, "inclinada em planta") === a; }).length; return "<li>" + t(a, "aviso do modelo") + (k > 1 ? " (" + k + " ocorrências)" : "") + "</li>"; }).join("") + "</ul>";
    var an = c.an;
    if (!an) { d.naoAbrangido("Análise global da estrutura (esforços por barra, estabilidade global α_cr e β dos pilares): o resultado não traz a análise."); return h; }
    h += h3(n + ".6", "Análise global e estabilidade");
    var op_ = obj(an.opcoes);
    h += "<p>Análise linear de 1ª ordem do pórtico espacial com as paredes como casca (membrana e flexão)" + (op_.cortante !== false ? ", deformação por cortante nas barras" : "") + " e carga distribuída aplicada de forma consistente; módulo E0,med da classe de cada seção. Esforços em cada barra nas pontas e em estações intermediárias, por hipótese, combinados nas combinações da " + secao("acoes") + ".</p>";
    var som = objs(an.somas);
    if (som.length) h += d.tab("Equilíbrio por hipótese — Σ cargas aplicadas × Σ reações", ["Hipótese", thn("Σ cargas"), thn("Σ Rz"), thn("Σ Rx"), thn("Σ Ry"), thn("Desloc. máx.")], som.map(function (x) {
      return trw([td(esc(x.hip)), tn(un(x.cargas, 2, "kN")), tn(un(x.Rz, 2, "kN")), tn(un(x.Rx, 2, "kN")), tn(un(x.Ry, 2, "kN")), tn(un(x.deslocMaxMm, 1, "mm"))]);
    }), { nota: "Nas hipóteses gravitacionais Σ Rz = Σ cargas (equilíbrio vertical). No vento, a carga é a soma dos módulos das forças aplicadas (pressão e sucção em direções diferentes), por isso não se compara com Σ Rz." });
    var es = obj(an.estabilidade);
    if (fin(num(an.alphaCr, NaN))) {
      h += caixa("<b>Estabilidade global:</b> autovalor (K + α·Kg)·φ = 0 com a matriz geométrica dos pilares, nas combinações ELU com vento → <b>α<sub>cr</sub> = " + br(an.alphaCr, 1) + "</b>" + (es.combinacaoCritica ? " (combinação " + t(es.combinacaoCritica) + ")" : "") +
        (an.alphaCr >= 10 ? ": α<sub>cr</sub> ≥ 10 — estrutura indeslocável; os efeitos globais de 2ª ordem são desprezíveis." : ": α<sub>cr</sub> &lt; 10 — os efeitos globais de 2ª ordem precisam ser considerados.") +
        (an.criterioBeta ? "<br><b>Comprimento de flambagem dos pilares:</b> " + t(an.criterioBeta) + "." : ""));
      var bd = obj(an.betaDetalhe), kb = Object.keys(bd).sort(function (a, b) { return Number(a.slice(1)) - Number(b.slice(1)); });
      if (kb.length) h += d.tab("β dos pilares pelo autovalor e β de projeto", ["Pilar", thn("N (combinação crítica)"), thn("L"), thn("L0 pelo autovalor"), thn("β autovalor"), thn("β de projeto")], kb.map(function (k) {
        var x = bd[k]; return trw([td(esc(k)), tn(un(x.N, 2, "kN")), tn(un(x.L, 3, "m")), tn(un(x.L0, 2, "m")), tn(br(x.betaAutovalor, 2)), tn("<b>" + br(x.betaProjeto, 2) + "</b>")]);
      }), { classe: "compacta", nota: "β de projeto = máx(1,0; β do autovalor): o β do autovalor abaixo de 1,0 é um equivalente global, não o comprimento de flambagem do pilar isolado." });
    } else d.naoAbrangido("Estabilidade global (α_cr e β dos pilares): não veio no resultado.");
    return h;
  }

  /* ---------- 6. piso seco */
  function pecaDoModelo(c) {
    var mapa = {};
    if (!c.modelo || !c.piso) return mapa;
    var ids = {}; objs(c.piso.pecas).forEach(function (p) { ids[p.id] = p; });
    objs(c.modelo.modelo.barras).forEach(function (b) {
      var m = /(\S+)\s*$/.exec(String(b.desc || "")); if (!m) return;
      var k = m[1].split("/")[0]; if (ids[k]) mapa[b.id] = ids[k];
    });
    return mapa;
  }
  function corEta(e) { return !fin(e) ? null : e > 1 ? COR.falha : e > 0.8 ? COR.alerta : e > 0.5 ? COR.areia : COR.verde; }
  function etaPeca(p) { var v = obj(p.verif); return Math.max(num(v.eta_flexao, 0), num(v.eta_cisalh, 0), num(v.eta_flecha, 0)); }
  function secPiso(c, d, n) {
    var h = "", piso = c.piso, md = c.md, mm = c.mm;
    if (!piso) return naoAbrCaixa(d, "O resultado não traz o cálculo do piso seco.", "Piso seco");
    var pecas = objs(piso.pecas), pf = null;
    try { pf = mm ? mm.perfil(piso.perfil) : null; } catch (e) { pf = null; }
    h += "<p>O piso seco é uma grelha de barrotes apoiados em vigas principais (VP) que descarregam nos pilaretes de concreto. A descida de cargas calcula a faixa de área de cada barrote, as paredes sobre o piso, os barrotes apoiados nas VP como cargas concentradas e as reações nos pilaretes; cada peça é verificada como viga contínua sobre os apoios encontrados na geometria (" + plural(pecas.length, "peça verificada", "peças verificadas") + ").</p>";
    h += h3(n + ".1", "Critérios de verificação");
    if (pf) h += d.tab("Perfil de cálculo do piso", ["Item", "Valor"], [
      trw([td("Perfil"), td(t(pf.nome))]), trw([td("Classe"), td(esc(mm.classe(piso.classe).nome) + " — " + esc(mm.classe(piso.classe).fonte))]),
      trw([td("kmod"), td(br(pf.kmod, 3) + " = " + t(pf.kmodPartes))]), trw([td("Ponderação"), td("γG = γQ = " + br(pf.gamaG, 1) + " (ELU 1,4G + 1,4Q); γwc = " + br(pf.gw.c, 1) + "; γwv = " + br(pf.gw.v, 1))]),
      trw([td("Flexão"), td(pf.flexaoPor === "fc0d" ? "σMd ≤ fc0,d (borda comprimida, critério do emitido)" : "σMd ≤ fm,d")]), trw([td("Cisalhamento"), td('<span class="eq">τd = 1,5·Vd/(b·h) ≤ fv,d</span>')]),
      trw([td("Flecha final"), td('<span class="eq">(wG + ψ2·wQ)·(1 + φ)</span>, ψ2 = ' + br(pf.psi2, 1) + ", φ = " + br(pf.phi, 1) + ", E = kmod·Ec0,m; limites L/" + pf.limVao + " (vão) e L/" + pf.limBalanco + " (balanço)")]),
      trw([td("Fonte"), td(t(pf.fonte))])
    ], { classe: "ficha" });
    h += caixa("Critério conservador do RT para o piso: kmod com kmod3 = 0,80 e flexão limitada a fc0,d (coeficientes da NBR 7190:1997, com resistências de cálculo menores que as da NBR 7190-1:2022). Reações por nó (sem perda de carga nos pilaretes).", "neutra");
    /* Painel Wall — dados e comparação vêm do resultado (r.painelWall); o memorial só apresenta */
    var PW = c.r.painelWall;
    if (PW && PW.criterio === "desempenho") {
      /* especificação de desempenho (decisão do RT 13/10/2026): o memorial fixa a capacidade; o fabricante é livre */
      h += h3(n + ".2", "Painel do piso 40 mm — especificação de desempenho");
      if (PW.impedeUso) h += caixa("<b>Nem o produto de referência atende em alguma zona: aproximar os barrotes antes de executar.</b> " + t(PW.conclusao, "painel"), "erro");
      h += "<p>O piso seco recebe painéis de 40 mm (Painel Wall) apoiados nos barrotes. O cálculo fixa a <b>carga distribuída admissível (de serviço)</b> que o painel tem de garantir em cada zona, no afastamento de apoios do projeto: é a soma das cargas características G + Q da zona (NBR 6120:2019), já com o peso do próprio painel. O painel pode ser de qualquer fabricante (Eternit, Decorlit ou equivalente) desde que o fabricante declare essa capacidade para o vão indicado.</p>";
      h += d.tab("Capacidade exigida do painel de 40 mm por zona", ["Zona", "Apoios a", thn("G"), thn("Q"), thn("Carga admissível mínima"), thn("Referência no vão"), "Situação"], objs(PW.requisitos).map(function (q) {
        var z = objs(PW.zonas).filter(function (x) { return x.zona === q.zona; })[0] || {};
        return trw([td(esc(cap(q.zona))), td(un(q.vao_m, 2, "m") + (fin(num(q.vaoLivre_m, NaN)) ? ' <span class="nota">(livre ' + un(q.vaoLivre_m, 2, "m") + ")</span>" : "")), tn(un(z.G, 2, "kN/m²")), tn(un(z.Q, 1, "kN/m²")),
          tn("<b>" + un(q.cargaServicoMin_kN_m2, 2, "kN/m²") + "</b><br>" + br(q.cargaServicoMin_kgf_m2, 0) + NB + "kgf/m²"), tn(un(q.referencia_kN_m2, 2, "kN/m²")), td(q.referenciaAtende ? '<span class="ok">atende</span>' : '<span class="falha">não atende</span>')], q.referenciaAtende ? "" : "linha-falha");
      }), { nota: "G inclui o peso do próprio painel" + (objs(PW.zonas).some(function (z) { return z.gParedeFora; }) ? "; na ducha as paredes de tijolo descem pelos barrotes (16 cm a 20 cm de eixo) e não entram na flexão do painel" : "") + ". Referência: maior valor publicado aplicado a vão menor que o tabelado, sem extrapolar." });
      var RF2 = PW.referencia;
      if (RF2 && arr(RF2.pontos).length) h += d.tab("Produto de referência que atende — " + t(RF2.produto) + " (p. " + t(RF2.pagina) + ")", ["Afastamento dos apoios", thn("Carga"), thn("Carga")], arr(RF2.pontos).map(function (q) {
        return trw([td(un(q[0], 3, "m")), tn(un(q[1], 0, "kgf/m²")), tn(un(q[2], 2, "kN/m²"))]);
      }), { nota: t(RF2.hipoteses) + (RF2.url ? " Fonte: " + esc(RF2.url) + "." : "") });
      h += caixa("<b>Condição de fornecimento:</b> na compra, o fornecedor entrega a ficha técnica ou declaração do fabricante com a carga admissível (de serviço) do painel de 40 mm para os vãos acima, igual ou maior que a da tabela, e a fixação recomendada sobre barrote de madeira. Painel que não declare essa capacidade não pode ser usado.", "neutra");
    } else {
    h += h3(n + ".2", "Painel Wall 40 mm (ficha do fabricante)");
    if (PW && PW.ficha) {
      var fi = PW.ficha;
      if (PW.impedeUso) h += caixa("<b>IMPEDE O USO DO PISO ATÉ A CONFIRMAÇÃO DO FABRICANTE.</b> " + t(PW.conclusao, "painel"), "erro");
      h += "<p>Ficha técnica " + t(PW.produto) + " (p. " + t(PW.pagina) + "): carga distribuída de " + un(fi.carga_kgf_m2, 0, "kgf/m²") + " (" + un(fi.carga_kN_m2, 3, "kN/m²") + ") para o painel de 40 mm com <b>" + br(fi.apoios, 0) + " apoios afastados no máximo " + un(fi.vaoMax_m, 2, "m") + "</b>; carga concentrada vertical " + un(fi.concentrada_kgf, 0, "kgf") + ". " + t(fi.hipoteses) + "</p>";
      if (!PW.fabricanteConfirmado && PW.obsFabricante) h += '<p class="nota">' + t(PW.obsFabricante) + "</p>";
      h += d.tab("Carga característica total por zona × valor publicado na ficha", ["Zona", thn("G"), thn("Q"), thn("G + Q"), thn("Ficha (40 mm)"), "Situação"], objs(PW.zonas).map(function (z) {
        return trw([td(esc(cap(z.zona))), tn(un(z.G, 2, "kN/m²")), tn(un(z.Q, 1, "kN/m²")), tn("<b>" + un(z.total, 2, "kN/m²") + "</b>"), tn(un(fi.carga_kN_m2, 2, "kN/m²")),
          td(z.acimaFicha ? '<span class="falha">acima do valor da ficha</span>' : '<span class="na">abaixo do valor da ficha</span>')], z.acimaFicha ? "linha-falha" : "");
      }), { nota: "Sem η: a ficha não informa se o valor é admissível, característico ou de ruptura nem o critério de flecha. G inclui o peso do próprio painel." });
      if (fin(num(PW.vaoApoios_m, NaN))) {
        h += "<p>Afastamento dos apoios do painel no projeto: <b>" + un(PW.vaoApoios_m, 3, "m") + "</b>" + (PW.fonteVao ? " (" + t(PW.fonteVao) + ")" : "") + ". " + (PW.premissaR03 ? t(PW.premissaR03) + " " : "") + "</p>";
        var RF = PW.referencia;
        if (RF && objs(RF.pontos).length || (RF && arr(RF.pontos).length)) {
          h += d.tab("Única tabela vão × carga publicada para Painel Wall 40 mm — " + t(RF.produto) + " (p. " + t(RF.pagina) + "), outro fabricante", ["Afastamento dos apoios", thn("Carga"), thn("Carga")], arr(RF.pontos).map(function (q) {
            return trw([td(un(q[0], 3, "m")), tn(un(q[1], 0, "kgf/m²")), tn(un(q[2], 2, "kN/m²"))]);
          }).concat(RF.noVao ? [trw([td("<b>" + un(PW.vaoApoios_m, 3, "m") + " (interpolado)</b>"), tn("<b>" + un(RF.noVao.kgf, 0, "kgf/m²") + "</b>"), tn("<b>" + un(RF.noVao.kN, 2, "kN/m²") + "</b>")], "tot")] : []),
            { nota: t(RF.hipoteses) + (RF.url ? " Fonte: " + esc(RF.url) + "." : "") });
        }
      }
      d.naoAbrangido("Verificação do Painel Wall 40 mm: a ficha publicada não define a natureza do valor de carga nem traz tabela vão × carga do fabricante (Eternit).");
    } else h += naoAbrCaixa(d, "O resultado não traz a comparação do Painel Wall com a ficha do fabricante.", "Verificação do Painel Wall 40 mm");
    }
    /* figura do aproveitamento */
    var mapa = pecaDoModelo(c), subIni = 2;
    if (Object.keys(mapa).length) {
      subIni = 3;
      h += h3(n + ".3", "Aproveitamento das peças em planta");
      h += d.fig(svgModelo(c, { modo: "planta", titulo: "Aproveitamento do piso", placas: false, espessura: 2.2,
        filtro: function (b) { return /^BAR|^VP|^TEST|^DORM/.test(b.grupo); }, corDe: function (b) { return mapa[b.id] ? corEta(etaPeca(mapa[b.id])) : null; },
        legenda: true, itensLegenda: [["η ≤ 0,50", COR.verde], ["0,50 < η ≤ 0,80", COR.areia], ["0,80 < η ≤ 1,00", COR.alerta], ["η > 1,00", COR.falha], ["Sem verificação (testeira, dormente)", COR.cinza]] }),
        "Aproveitamento das peças do piso (maior η entre flexão, cisalhamento e flecha), em planta.");
    }
    /* peças governantes com os passos (refeitos pelo MadDim sobre o caso de viga do MadPiso) */
    var grupos = unicos(pecas.map(function (p) { return p.grupo; }));
    var NOME = { PISO_BARROTE: "Barrotes", PISO_VIGA: "Vigas principais (VP)", PISO_REQUADRO: "Requadros" };
    var sub = subIni, difEta = [], refeitas = 0;
    grupos.forEach(function (g) {
      var dog = pecas.filter(function (p) { return p.grupo === g; });
      sub++;
      h += h3(n + "." + sub, (NOME[g] || g) + " — peças governantes");
      var gov = [], crits = [];      /* ⚠ não marcar nada nas peças do resultado (entrada não se altera) */
      [["eta_flexao", "flexão"], ["eta_cisalh", "cisalhamento"], ["eta_flecha", "flecha"]].forEach(function (cr) {
        var best = null; dog.forEach(function (p) { if (!best || num(obj(p.verif)[cr[0]], 0) > num(obj(best.verif)[cr[0]], 0)) best = p; });
        if (!best) return;
        var i = gov.indexOf(best);
        if (i < 0) { gov.push(best); crits.push([cr[1]]); } else crits[i].push(cr[1]);
      });
      gov.forEach(function (p, ig) {
        var crit = crits[ig];
        var passos = arr(p.passos), eta = etaPeca(p), v = obj(p.verif);
        if (!passos.length && md && p.casoViga) {
          try {
            var cv = p.casoViga, rr = md.vigaFletida({ L: cv.L, apoios: cv.ap, G: { d: cv.gd, p: cv.gp }, Q: { d: cv.qd, p: cv.qp }, b: cv.b, h: cv.h, classe: piso.classe, perfil: piso.perfil });
            passos = rr.passos; refeitas++;
            if (Math.abs(rr.eta_flexao - num(v.eta_flexao, 0)) > 6e-4 || Math.abs(rr.eta_cisalh - num(v.eta_cisalh, 0)) > 6e-4 || Math.abs(rr.eta_flecha - num(v.eta_flecha, 0)) > 6e-4) difEta.push(p.marca);
          } catch (e) { d.aviso("Piso " + p.marca + ": passos não refeitos — " + e.message); }
        }
        if (!passos.length) passos = ["Md = " + un(v.Md_kNm, 2, "kN·m") + "; Vd = " + un(v.Vd_kN, 2, "kN") + "; η flexão " + br(v.eta_flexao, 3) + ", cisalhamento " + br(v.eta_cisalh, 3) + ", flecha " + br(v.eta_flecha, 3) + " (passos não disponíveis no resultado)."];
        h += tabVerif(d, esc(p.marca) + " — " + t(p.nome, "peça") + " — seção " + esc(arr(p.secao_cm).join(" × ")) + " cm, L = " + un(p.L, 3, "m") + ", zona " + esc(p.zona) + " (governa " + crit.join(", ") + ")", passos, eta, "piso " + p.marca,
          { nota: "η flexão " + br(v.eta_flexao, 3) + " · η cisalhamento " + br(v.eta_cisalh, 3) + " · η flecha " + br(v.eta_flecha, 3) + ". Fonte: " + t(pf ? pf.fonte : "perfil do piso") + "." });
      });
    });
    if (refeitas) d.conferir("etaPiso", difEta.length === 0, "η das " + refeitas + " peças governantes do piso refeito pelo MadDim.vigaFletida sobre o caso de viga = η do cálculo do piso" + (difEta.length ? " (diferem: " + difEta.join(", ") + ")" : ""));
    /* tabela-resumo de todas as peças */
    sub++;
    h += h3(n + "." + sub, "Resumo de todas as peças do piso");
    var ord = pecas.slice().sort(function (a, b) { return a.grupo < b.grupo ? -1 : a.grupo > b.grupo ? 1 : String(a.marca).localeCompare(String(b.marca), "pt", { numeric: true }); });
    h += d.tab("Verificação das peças do piso seco", ["Marca", "Seção", thn("L"), "Zona", thn("Md"), thn("Vd"), thn("η flexão"), thn("η cisalh."), thn("η flecha"), thn("η"), "Situação"], ord.map(function (p) {
      var v = obj(p.verif), e = etaPeca(p);
      return trw([td(esc(p.marca)), td(esc(arr(p.secao_cm).join("×"))), tn(br(p.L, 2)), td(esc(p.zona)), tn(br(v.Md_kNm, 2)), tn(br(v.Vd_kN, 2)), tn(br(v.eta_flexao, 3)), tn(br(v.eta_cisalh, 3)), tn(br(v.eta_flecha, 3)), tn("<b>" + br(e, 3) + "</b>"), td(situ(e <= 1 + 1e-9))], e > 1 ? "linha-falha" : "", ' data-peca-piso="' + esc(p.id) + '"');
    }), { classe: "resumo compacta", nota: "Seção em cm; L em m; Md em kN·m; Vd em kN (valores de cálculo). " + plural(pecas.filter(function (p) { return etaPeca(p) > 1; }).length, "peça não atende", "peças não atendem") + "; maior η = " + br(Math.max.apply(null, pecas.map(etaPeca).concat([0])), 3) + "." });
    var av = arr(piso.avisos);
    if (av.length) h += caixa("<b>Avisos da descida de cargas:</b><ul>" + av.map(function (a) { return "<li>" + t(a, "aviso do piso") + " — só a faixa de carga foi calculada; a peça não é verificada.</li>"; }).join("") + "</ul>", "alerta");
    return h;
  }

  /* ---------- 7. estrutura acima do piso */
  function secSuperestrutura(c, d, n) {
    var h = "", V = c.verifs, an = c.an;
    if (!V.length) {
      var grupos = [];
      if (c.modelo) { var cont = {}; objs(c.modelo.modelo.barras).forEach(function (b) { if (/^PILAR$|^COB|^GUIA_10x20|^VERGA|^FORRO/.test(b.grupo)) cont[b.grupo] = (cont[b.grupo] || 0) + 1; }); grupos = Object.keys(cont).map(function (g) { return esc(g) + " (" + cont[g] + " barras)"; }); }
      return naoAbrCaixa(d, "A verificação dos pilares compostos, das vigas e bloqueadores das coberturas, da viga de topo e das vergas não faz parte desta emissão: o resultado não traz verificações dessas peças." + (grupos.length ? " Barras do modelo nessas funções: " + grupos.join("; ") + "." : ""), "Estrutura acima do piso (pilares compostos, coberturas, viga de topo e vergas)");
    }
    h += "<p>Cada membro (sequência de barras do modelo entre ligações) foi verificado em todas as combinações últimas da " + secao("acoes") + " e nas estações ao longo de cada barra, com os esforços da análise global (N, My, Mz, Vy, Vz, T). Verificações pela NBR 7190-1:2022: flexocompressão com kc nos dois eixos e kM, ou flexotração; cisalhamento somado à torção; estabilidade lateral (βM) entre travamentos. Pilares com L0 = β·L (critério e α<sub>cr</sub> na " + secao("modelo") + ").</p>";
    if (an && fin(num(an.alphaCr, NaN))) h += '<p class="nota">α<sub>cr</sub> = ' + br(an.alphaCr, 1) + (an.alphaCr >= 10 ? " ≥ 10: estrutura indeslocável." : " &lt; 10: considerar 2ª ordem global.") + "</p>";
    /* por função */
    var porF = {}, ordem = [];
    V.forEach(function (v) { var g = v.grupo || "outros"; if (!porF[g]) { porF[g] = []; ordem.push(g); } porF[g].push(v); });
    ordem.sort(function (a, b) { return Math.max.apply(null, porF[b].map(function (v) { return num(v.eta, 0); })) - Math.max.apply(null, porF[a].map(function (v) { return num(v.eta, 0); })); });
    function gov(g) { return porF[g].slice().sort(function (a, b) { return num(b.eta, 0) - num(a.eta, 0); })[0]; }
    h += h3(n + ".1", "Resumo por função");
    h += d.tab("Verificação por função — membro governante", ["Função", thn("Membros"), "Espécie — classe", "Seção", thn("Pior η"), "Combinação", "Governa", "Situação"], ordem.map(function (g) {
      var l = porF[g], m = gov(g), nNao = l.filter(function (v) { return !(num(v.eta, 9) <= 1 + 1e-9); }).length;
      return trw([td("<b>" + t(m.funcao || g) + "</b><br><span class=\"nota\">" + esc(g) + "</span>"), tn(br(l.length, 0)), td(t(String(m.especie || "").split(" (")[0]) + " — " + t(m.classe || "")), td(esc(m.secao) + " cm"),
        tn("<b>" + br(m.eta, 3) + "</b>"), td(t(m.combinacao)), td(t(m.governa)), td(situ(nNao === 0) + (nNao ? " — " + plural(nNao, "membro", "membros") : ""))], nNao ? "linha-falha" : "");
    }), { classe: "resumo compacta", nota: "Pior η = maior aproveitamento entre as verificações do membro, em todas as combinações e estações." });
    /* reprovações em destaque */
    var RP = objs(c.r.reprovacoes);
    if (RP.length) {
      h += h3(n + ".2", "Reprovações — pendência de decisão do RT");
      RP.forEach(function (rp) {
        var mem = V.filter(function (v) { return arr(rp.membros).indexOf(v.membro) >= 0; });
        var hh = "<b>" + t(rp.funcao) + ": " + plural(mem.length, "membro não atende", "membros não atendem") + " (η até " + br(rp.etaMax, 2) + ").</b>";
        if (rp.mecanismo) hh += "<p><b>Mecanismo:</b> " + t(rp.mecanismo, "mecanismo") + "</p>";
        if (arr(rp.alternativas).length) hh += "<p><b>Alternativas (decisão do RT; nenhuma adotada neste memorial):</b></p><ol>" + arr(rp.alternativas).map(function (a) { return "<li>" + t(a, "alternativa") + "</li>"; }).join("") + "</ol>";
        h += caixa(hh, "erro");
        h += d.tab("Membros reprovados — " + t(rp.funcao), ["Membro", "Peça", thn("L"), thn("η"), "Situação", "Governa", "Combinação", "Esforços (N; My; Mz; Vy; Vz; T)"], mem.map(function (v) {
          var e = obj(v.esforcos);
          return trw([td(esc(v.membro)), td(t(String(v.desc || "").replace(/\s+\S{20,}$/, ""))), tn(un(v.L, 2, "m")), tn("<b>" + br(v.eta, 3) + "</b>"), td(situ(num(v.eta, 9) <= 1 + 1e-9)), td(t(v.governa)), td(t(v.combinacao)),
            td(br(e.N, 2) + " kN; " + br(e.My, 2) + "; " + br(e.Mz, 2) + " kN·m; " + br(e.Vy, 2) + "; " + br(e.Vz, 2) + " kN; " + br(e.T, 3) + " kN·m")], "linha-falha");
        }), { classe: "resumo compacta", nota: "N > 0 tração (convenção da análise). My em torno do eixo forte (plano de h), Mz do eixo fraco (plano de b)." });
      });
    }
    /* detalhe do membro governante de cada função */
    var sub = RP.length ? 2 : 1;
    ordem.forEach(function (g) {
      var m = gov(g), e = obj(m.esforcos);
      sub++;
      h += h3(n + "." + sub, t(m.funcao || g) + " — membro governante " + esc(m.membro));
      h += d.tab("Dados do membro " + esc(m.membro), ["Item", "Valor"], [
        trw([td("Peça"), td(t(String(m.desc || "").replace(/\s+\S{20,}$/, "")))]),
        trw([td("Espécie e classe"), td(t(m.especie) + " — " + t(m.classe))]),
        trw([td("Seção e comprimento"), td(esc(m.secao) + " cm; L = " + un(m.L, 3, "m") + (fin(num(m.beta, NaN)) ? "; β = " + br(m.beta, 2) + " → L0 = " + un(m.L0 != null ? m.L0 : m.beta * m.L, 3, "m") : ""))]),
        trw([td("Combinação governante"), td(t(m.combinacao))]),
        trw([td("Esforços de cálculo no ponto governante"), td("N = " + un(e.N, 2, "kN") + "; My = " + un(e.My, 3, "kN·m") + "; Mz = " + un(e.Mz, 3, "kN·m") + "; Vy = " + un(e.Vy, 2, "kN") + "; Vz = " + un(e.Vz, 2, "kN") + "; T = " + un(e.T, 3, "kN·m"))])
      ], { classe: "ficha" });
      var passos = [];
      objs(m.verif).forEach(function (vi) { arr(vi.passos).forEach(function (p, j) { passos.push(j === 0 ? "[" + vi.nome + " — η = " + br(vi.eta, 3) + "] " + p : p); }); });
      h += tabVerif(d, esc(m.membro) + " — " + t(m.funcao || g) + " — governa " + t(m.governa), passos, num(m.eta, NaN), "membro " + m.membro, { nota: m.norma ? "Norma: " + t(m.norma) + "." : "" });
    });
    /* todos os membros */
    sub++;
    h += h3(n + "." + sub, "Todos os membros verificados");
    var todos = V.slice().sort(function (a, b) { return a.grupo < b.grupo ? -1 : a.grupo > b.grupo ? 1 : num(b.eta, 0) - num(a.eta, 0); });
    h += d.tab("Membros acima do piso — aproveitamento", ["Membro", "Função", "Seção", thn("L"), thn("η"), "Governa", "Combinação", "Situação"], todos.map(function (v) {
      var ok = num(v.eta, 9) <= 1 + 1e-9;
      return trw([td(esc(v.membro) + (v.pilar ? " (" + esc(v.pilar) + ")" : "")), td(esc(v.grupo)), td(esc(v.secao)), tn(br(v.L, 2)), tn(br(v.eta, 3)), td(t(v.governa)), td(t(v.combinacao)), td(situ(ok))], ok ? "" : "linha-falha");
    }), { classe: "resumo compacta", nota: "L em m. " + plural(V.filter(function (v) { return !(num(v.eta, 9) <= 1 + 1e-9); }).length, "membro não atende", "membros não atendem") + " de " + V.length + "." });
    return h;
  }

  /* ---------- 8. paredes */
  function secParedes(c, d, n) {
    var h = "", P = c.paredes;
    if (!P) return naoAbrCaixa(d, "O resultado não traz o cálculo das paredes de contraventamento.", "Paredes de contraventamento");
    var pr = obj(P.premissas), pg = obj(P.prego), pR = obj(P.prego_reforco), EV = obj(obj(c.r.paredesPremissas).catalogo);
    h += "<p>As paredes de wood frame travam a estrutura no plano. Pelo EN 1995-1-1:2004 (9.2.4.2, método A), só contam os trechos de altura inteira, sem abertura, com largura b ≥ h/4; fator de largura c = 1 se b ≥ h/2, senão b/(h/2). Resistência ao cisalhamento do trecho: <span class=\"eq\">Fv,Rd = Σ Ff,Rd·bi·ci/s</span>; duas faces do mesmo tipo somam. Chapa adotada: <b>" + t(EV.produto || ("chapa de " + br(pr.chapa_mm, 0) + " mm")) + "</b> (premissa pelo orçamento recebido — confirmar).</p>";
    h += h3(n + ".1", "Premissas");
    h += d.tab("Premissas das paredes", ["Item", "Valor", "Origem"], [
      trw([td("Altura da parede"), td(un(pr.h_parede_m, 2, "m")), td("geometria")]), trw([td("Chapa"), td(un(pr.chapa_mm, 0, "mm") + (EV.produto ? " — " + t(EV.produto) : "")), td(t(EV.fonte || "premissa"))]),
      trw([td("Módulo de cisalhamento da chapa G"), td(un(pr.G_chapa_MPa, 0, "MPa")), td("premissa do RT (catálogo não informa)")]), trw([td("ρk da chapa"), td(un(pr.rho_k_chapa, 0, "kg/m³")), td("premissa do RT (catálogo não informa)")]),
      trw([td("ρk / ρm da madeira (Pinus)"), td(un(pr.rho_k_madeira, 0, "kg/m³") + " / " + un(pr.rho_m_madeira, 0, "kg/m³")), td("premissa do RT (Pinus como C24, EN 338)")]),
      trw([td("Prego"), td(br(arr(pr.prego_mm)[0], 1) + " × " + br(arr(pr.prego_mm)[1], 1) + " mm, a cada " + un(pr.s_pregos_m * 100, 0, "cm")), td("projeto original, folha 17 (20 pregos/m²)")]),
      trw([td("kmod / γM"), td(br(pr.kmod, 2) + " (vento, curta duração, classe de serviço 2) / " + br(pr.gama_M, 2)), td("EN 1995-1-1 Tab. 3.1 e 2.3")]),
      trw([td("Redução de rigidez"), td(br(pr.reducao_rigidez * 100, 0) + " % (folga das ancoragens e ligações)"), td("premissa do RT")])
    ], { classe: "ficha" });
    h += h3(n + ".2", "Resistência de um prego (Johansen, corte simples chapa × madeira)");
    var modos = arr(pg.modos_N);
    h += d.tab("Prego " + br(arr(pr.prego_mm)[0], 1) + " × " + br(arr(pr.prego_mm)[1], 1) + " mm — EN 1995-1-1 8.2.2 (sem efeito de corda, a favor da segurança)", ["Grandeza", "Expressão", thn("Valor")], [
      trw([td("Embutimento na chapa"), td('<span class="eq">fh,1 = mín(0,11·ρk·d^−0,3; 65·d^−0,7·t^0,1)</span>'), tn(un(pg.fh1_MPa, 2, "MPa"))]),
      trw([td("Embutimento na madeira"), td('<span class="eq">fh,2 = 0,082·ρk·d^−0,3</span>'), tn(un(pg.fh2_MPa, 2, "MPa"))]),
      trw([td("Momento de escoamento"), td('<span class="eq">My,Rk = 0,3·fu·d^2,6</span>, fu = 600 MPa'), tn(un(pg.My_Nmm, 1, "N·mm"))]),
      trw([td("Modos a, b, c, d, e, f"), td("eq. 8.6"), tn(modos.map(function (m) { return br(m, 1); }).join(" · ") + " N")]),
      trw([td("Resistência característica"), td("menor modo"), tn(un(pg.FvRk_N, 1, "N"))]),
      trw([td("Resistência de cálculo"), td('<span class="eq">Ff,Rd = kmod·Fv,Rk/γM</span>'), tn(un(pg.FfRd_N, 1, "N"))]),
      trw([td("Rigidez de serviço"), td('<span class="eq">Kser = ρm^1,5·d^0,8/30</span>'), tn(un(pg.Kser_N_mm, 1, "N/mm"))])
    ], { nota: pR.d_mm ? "Prego dos painéis reforçados " + br(pR.d_mm, 1) + " × " + br(pR.l_mm, 1) + " mm: Fv,Rk = " + un(pR.FvRk_N, 1, "N") + "; Ff,Rd = " + un(pR.FfRd_N, 1, "N") + "." : "" });
    h += h3(n + ".3", "Resistência e rigidez dos painéis");
    var pn = obj(P.paineis), ks = Object.keys(pn).sort();
    h += d.tab("Painéis de wood frame — trechos que contam, resistência e rigidez", ["Painel", "Descrição", "Trechos que contam (b; c)", thn("Fv,Rd"), thn("K"), "Reforço (faces; pregos a; Fv,Rd; K)"], ks.map(function (k) {
      var p = pn[k], tr = objs(p.trechos_que_contam);
      return trw([td("PN-" + esc(k)), td(t(p.descricao || "")), td(tr.length ? tr.map(function (x) { return un(x.b, 3, "m") + "; " + br(x.c, 3); }).join("<br>") : '<span class="na">nenhum (abertura ou b &lt; h/4)</span>'),
        tn(un(p.FvRd_kN, 2, "kN")), tn(un(p.K_kN_m, 1, "kN/m")), td(p.reforco ? br(p.reforco.faces, 0) + " faces; " + un(p.reforco.s_m * 100, 1, "cm") + "; " + un(p.reforco.FvRd_kN, 2, "kN") + "; " + un(p.reforco.K_kN_m, 1, "kN/m") : "—")]);
    }), { classe: "compacta" });
    h += d.fig(svgParedes(c), "Paredes de wood frame em planta, com a resistência de cálculo ao cisalhamento de cada painel (a do reforço, quando houver). Eixos das paredes: y longitudinal (para a direita), x transversal (para cima).");
    var pl = objs(P.planos);
    if (pl.length) h += d.tab("Planos de contraventamento — diagonal equivalente do modelo de barras", ["Plano", "Painel", thn("Vão"), thn("K do vão"), thn("EA da diagonal"), thn("E equivalente"), thn("Fv,Rd")], pl.map(function (x) {
      return trw([td(t(x.plano)), td("PN-" + esc(x.painel) + (x.reforco ? " (reforçado)" : "")), tn(un(x.vao_m, 3, "m")), tn(un(x.reforco ? x.K_vao_reforco_kN_m : x.K_vao_kN_m, 1, "kN/m")), tn(un(x.reforco ? x.EA_diag_reforco_kN : x.EA_diag_kN, 0, "kN")), tn(un(x.E_equiv_MPa, 0, "MPa")), tn(un(x.FvRd_reforco_kN, 2, "kN"))]);
    }), { classe: "compacta" });
    h += naoAbrCaixa(d, "A força de cisalhamento de cálculo em cada painel e a tração nos hold-downs vêm da análise global com as placas (" + secao("modelo") + "), que não faz parte desta emissão; por isso esta seção apresenta a resistência e a rigidez dos painéis, sem η.", "Solicitação das paredes de contraventamento e dos hold-downs (η dos painéis)");
    return h;
  }

  /* ---------- 9. ligações */
  function secLigacoes(c, d, n) {
    var h = "", L = c.ligs;
    if (!L.length) return naoAbrCaixa(d, "O resultado não traz as ligações.", "Ligações");
    var calc = L.filter(function (l) { return fin(l.eta); }), semCalc = L.filter(function (l) { return !fin(l.eta); });
    h += "<p>Ligações por pinos metálicos (barras roscadas, chumbadores, tirefonds) pelo modelo de Johansen do EN 1995-1-1:2004+A2:2014 (8.2), adotado pela NBR 7190-1:2022; Rd = kmod·Rk/γlig, γlig = 1,40. Aço inoxidável A4-70. Efeito de corda desprezado (a favor da segurança). Os esforços são os do cálculo emitido R03; os passos abaixo foram refeitos pelo motor de ligações e conferem com ele.</p>";
    var sub = 0;
    calc.forEach(function (l) {
      sub++;
      h += h3(n + "." + sub, esc(l.codigo) + (l.sub ? " (" + esc(l.sub) + ")" : "") + " — " + t(l.tipo));
      h += "<p>" + t(l.descricao, "ligação " + l.codigo) + (l.quantidade ? " — " + plural(num(l.quantidade, 0), "ligação na obra", "ligações na obra") : "") + (l.governante ? ". Caso governante: " + t(l.governante) : "") + ".</p>";
      var prods = objs(l.produtos);
      if (prods.length) h += "<p>Produto de catálogo: " + prods.map(function (p) { return t(p.nome || p.id) + (p.pagina ? ", p. " + t(p.pagina) : "") + (p.link ? " — " + link(urlDe(p.link) || p.link, "link") : ""); }).join("; ") + ".</p>";
      else h += '<p class="nota">Ferragem comercial especificada pela descrição (sem produto de catálogo associado nesta emissão).</p>';
      h += tabVerif(d, esc(l.codigo) + (l.sub ? " " + esc(l.sub) : "") + " — verificação", l.passos, l.eta, "ligação " + l.codigo, {
        fim: l.substituidaPor ? '— <span class="alerta-tx">substituída pela ' + esc(l.substituidaPor) + " (" + secao("ligacoes") + ")</span>" : "", nota: l.norma ? "Norma: " + t(l.norma) + "." : "" });
      var lista = objs(l.lista);
      if (lista.length > 1) h += d.tab(esc(l.codigo) + " — todas as ocorrências calculadas", ["Ocorrência", "Combinação", thn("Solicitação"), thn("Resistência"), thn("η"), "Situação"], lista.map(function (x) {
        return trw([td(t(x.id)), td(t(x.combo)), tn(t(x.Sd)), tn(t(x.Rd)), tn(br(x.eta, 3)), td(situ(num(x.eta, 9) <= 1 + 1e-9))]);
      }), { classe: "resumo compacta" });
    });
    sub++;
    h += h3(n + "." + sub, "Resumo das ligações");
    h += d.tab("Ligações — resumo", ["Código", "Tipo", thn("Na obra"), thn("η"), "Situação"], L.map(function (l) {
      var ok = fin(l.eta) && l.eta <= 1 + 1e-9;
      return trw([td(esc(l.codigo) + (l.sub ? " " + esc(l.sub) : "")), td(t(l.tipo) + (l.nota ? '<br><span class="nota">' + t(l.nota) + "</span>" : "")), tn(l.quantidade != null ? br(l.quantidade, 0) : "—"), tn(fin(l.eta) ? br(l.eta, 3) : "—"),
        td(fin(l.eta) ? situ(ok) + (l.substituidaPor ? ' <span class="alerta-tx">substituída pela ' + esc(l.substituidaPor) + "</span>" : "") : '<span class="na">não verificada nesta emissão</span>')], fin(l.eta) && !ok && !l.substituidaPor ? "linha-falha" : "");
    }), { classe: "resumo compacta" });
    if (semCalc.length) {
      d.naoAbrangido("Ligações sem verificação nesta emissão: " + semCalc.map(function (l) { return l.codigo + " (" + l.tipo + ")"; }).join("; ") + ".");
      h += caixa("<b>Não abrangido nesta emissão:</b> " + semCalc.map(function (l) { return esc(l.codigo) + " — " + t(l.tipo) + (l.status ? " (" + t(l.status) + ")" : ""); }).join("; ") + ". Essas ligações estão especificadas (descrição e quantidade acima), mas sem verificação de resistência no resultado.", "neutra");
    }
    return h;
  }

  /* ---------- 10. reações */
  function secReacoes(c, d, n) {
    var h = "", R = c.reac, an = c.an;
    if (!R.length) return naoAbrCaixa(d, "O resultado não traz as reações para a fundação.", "Reações para a fundação");
    h += "<p>Reações características (sem coeficientes de ponderação) em cada pilarete de concreto, por hipótese, para o projetista da fundação" + (an ? ", obtidas da análise global da estrutura inteira (piso, paredes, pilares e coberturas)" : "") + ". As combinações da fundação ficam a cargo dele (NBR 6122:2022 e NBR 8681).</p>";
    var conv = c.r.reacoesConvencao || obj(c.piso ? c.piso.reacoesPilaretes : null).convencao;
    if (conv) h += caixa("<b>Convenção de sinais e eixos:</b> " + t(conv, "convenção"));
    var temH = R.some(function (p) { return p.V1 && fin(num(obj(p.V1).Vx, NaN)); }), temPiso = R.some(function (p) { return fin(p.Gpiso); });
    var tot = { G: 0, Q: 0, V1: 0, V2: 0, V3: 0, V4: 0, Gp: 0, Qp: 0 };
    var lin = R.map(function (p) {
      tot.G += num(vN(p.G), 0); tot.Q += num(vN(p.Q), 0); tot.Gp += num(p.Gpiso, 0); tot.Qp += num(p.Qpiso, 0);
      ["V1", "V2", "V3", "V4"].forEach(function (k) { tot[k] += num(vN(p[k]), 0); });
      return trw([td(esc(p.pilarete)), tn("<b>" + br(vN(p.G), 2) + "</b>"), tn("<b>" + br(vN(p.Q), 2) + "</b>")].concat(["V1", "V2", "V3", "V4"].map(function (k) { return tn(br(vN(p[k]), 2)); }))
        .concat(temPiso ? [tn(br(p.Gpiso, 2)), tn(br(p.Qpiso, 2))] : []), vN(p.G) < 0 || vN(p.Q) < 0 ? "linha-falha" : "");
    });
    lin.push(trw([td("<b>Σ</b>"), tn("<b>" + br(tot.G, 2) + "</b>"), tn("<b>" + br(tot.Q, 2) + "</b>")].concat(["V1", "V2", "V3", "V4"].map(function (k) { return tn("<b>" + br(tot[k], 2) + "</b>"); })).concat(temPiso ? [tn(br(tot.Gp, 2)), tn(br(tot.Qp, 2))] : []), "tot"));
    h += d.tab("Reações características por pilarete — força vertical N (kN; N > 0 = compressão)", ["Pilarete", thn("G"), thn("Q"), thn("V1"), thn("V2"), thn("V3"), thn("V4")].concat(temPiso ? [thn("G piso (local)"), thn("Q piso (local)")] : []), lin,
      { classe: "compacta reac", nota: "G = peso próprio + permanentes; Q = sobrecargas do piso e da cobertura; V1 a V4 = vento." + (temPiso ? " G piso e Q piso (local) = parcela do piso pela descida de cargas local da " + secao("piso") + ", só para comparação (a análise global redistribui pela rigidez da estrutura)." : "") });
    if (temH) h += d.tab("Forças horizontais por pilarete — Vx / Vy (kN, eixos do modelo)", ["Pilarete", thn("V1"), thn("V2"), thn("V3"), thn("V4")], R.map(function (p) {
      return trw([td(esc(p.pilarete))].concat(["V1", "V2", "V3", "V4"].map(function (k) { var v = obj(p[k]); return tn(br(v.Vx, 2) + " / " + br(v.Vy, 2)); })));
    }), { classe: "compacta" });
    var trac = R.filter(function (p) { return num(vN(p.G), 0) < 0 || num(vN(p.Q), 0) < 0; });
    if (trac.length) h += caixa("<b>Pilaretes com reação de tração (N &lt; 0) sob carga permanente ou sobrecarga:</b> " + trac.map(function (p) { return esc(p.pilarete) + " (G = " + un(vN(p.G), 2, "kN") + "; Q = " + un(vN(p.Q), 2, "kN") + ")"; }).join("; ") +
      ". A estrutura levanta nesse apoio: a ligação da madeira no pilarete e a fundação precisam resistir à tração.", "alerta");
    var vmin = R.filter(function (p) { return ["V1", "V2", "V3", "V4"].some(function (k) { return num(vN(p.G), 0) + num(vN(p[k]), 0) < 0; }); });
    if (vmin.length) h += caixa("<b>Pilaretes com G + V &lt; 0 (arrancamento pelo vento):</b> " + vmin.map(function (p) { var m = Math.min.apply(null, ["V1", "V2", "V3", "V4"].map(function (k) { return num(vN(p.G), 0) + num(vN(p[k]), 0); })); return esc(p.pilarete) + " (" + un(m, 2, "kN") + ")"; }).join("; ") + " — valores característicos; a ancoragem é dimensionada pelo projetista da fundação com as combinações dele.", "alerta");
    h += d.fig(svgReacoes(c), "Locação dos pilaretes (eixos do modelo) com a carga vertical característica G + Q; em vermelho, pilaretes com tração sob G ou Q.");
    /* conferências */
    var som = an ? objs(an.somas) : [], sc = {}; som.forEach(function (x) { sc[x.hip] = x; });
    if (sc.PP || sc.CP) {
      var cg = num((sc.PP || {}).cargas, 0) + num((sc.CP || {}).cargas, 0), cq = num((sc.SCpiso || {}).cargas, 0) + num((sc.SCcob || {}).cargas, 0), tol = 1e-3 * Math.max(1, cg);
      d.conferir("somaG", Math.abs(tot.G - cg) <= tol, "ΣG das reações = " + un(tot.G, 2, "kN") + " × Σ cargas permanentes aplicadas ao modelo (peso próprio + permanentes) = " + un(cg, 2, "kN"));
      d.conferir("somaQ", Math.abs(tot.Q - cq) <= 1e-3 * Math.max(1, cq), "ΣQ das reações = " + un(tot.Q, 2, "kN") + " × Σ sobrecargas aplicadas ao modelo = " + un(cq, 2, "kN"));
    }
    if (c.piso && arr(c.piso.reacaoSomaPiso).length === 2) {
      var pp = arr(obj(c.piso.reacoesPilaretes).pilaretes), sg = c.piso.reacaoSomaPiso[0], sgp = soma(pp.map(function (p) { return obj(obj(p.casos_kN).G).piso; })), tolP = pp.length * 0.005 + 1e-6;
      d.conferir("somaGpiso", Math.abs(sgp - sg) <= tolP, "descida local do piso: Σ das reações de G por pilarete = " + un(sgp, 2, "kN") + " × ΣG do piso = " + un(sg, 2, "kN") + " (tolerância de arredondamento " + un(tolP, 3, "kN") + ")");
    }
    return h;
  }

  /* ---------- 11. nível */
  function secNivel(c, d) {
    var h = "", nv = c.r.nivel, nf = obj(c.r.niveisFonte);
    if (nv && (fin(num(nv.deltaPisoCm, NaN)) || nv.mensagem)) {
      var dl = num(nv.deltaPisoCm, NaN);
      h += caixa("<b>" + (fin(dl) ? (dl === 0 ? "O piso ficou no mesmo nível da fonte." : "O piso ficou " + br(Math.abs(dl), 1) + " cm mais " + (dl > 0 ? "alto" : "baixo") + " — ajustar na fundação.") : "") + "</b> " + t(nv.mensagem || "", "nível"), fin(dl) && dl !== 0 ? "alerta" : "");
    } else h += naoAbrCaixa(d, "O resultado não traz o relatório de nível (comparação do piso acabado e do fundo da estrutura com a fonte). Se uma seção do piso mudar, a diferença vai para a fundação e é informada aqui (\"ficou X cm mais alto/baixo\").", "Relatório de nível do piso (ajuste na fundação)");
    var ks = ["piso_acabado", "topo_painel", "topo_barrote", "topo_VP", "topo_pilarete", "topo_concreto"], nomes = { piso_acabado: "Piso acabado", topo_painel: "Topo do Painel Wall", topo_barrote: "Topo dos barrotes", topo_VP: "Topo das vigas principais", topo_pilarete: "Topo do pilarete (madeira)", topo_concreto: "Topo do concreto" };
    var lin = ks.filter(function (k) { return fin(nf[k]); }).map(function (k) { return trw([td(nomes[k]), tn(un(nf[k], 3, "m"))]); });
    if (lin.length) h += d.tab("Níveis da fonte de peças (z = 0 no piso acabado)", ["Nível", thn("z")], lin, { nota: (nf.nota ? t(nf.nota) + ". " : "") + (nf.fixacao ? t(nf.fixacao) + "." : "") });
    return h;
  }

  /* ---------- 12. compra */
  function secCompra(c, d, n) {
    var h = "", C = c.compra, MC = c.mc;
    if (C) {
      var gr = objs(C.grupos);
      h += h3(n + ".1", "Madeira serrada por espécie e seção");
      h += "<p>Plano de corte por seção (corte de cada peça em barras comerciais, perda de serra e refilo das pontas). Catálogo de madeira serrada: " + t(C.catalogoFonte || "catálogo do fornecedor") + ". Seção fora do catálogo que sai de uma bitola existente aparece como &quot;refilar&quot; (mesma espessura, largura comercial maior) ou &quot;compor&quot; (só bloqueador: duas peças pregadas). Espécie sem bitola em catálogo (folhosa nativa) é comprada em madeireira, serrada sob medida, e cotada por m³ com a lista de corte. O que sobra sem fornecedor vira pendência — nunca preço zero nem seção trocada sem decisão do RT.</p>";
      h += d.tab("Lista de compra da madeira", ["Espécie", "Seção", thn("Peças"), thn("Comprimento útil"), thn("Volume"), "Fornecedor (catálogo)", "Barras a comprar", thn("Aprov.")], gr.map(function (g) {
        var cat = g.catalogo, pl = g.plano;
        var barras = pl ? Object.keys(pl.porComprimento).sort(function (a, b) { return a - b; }).map(function (k) { return pl.porComprimento[k] + " × " + br(Number(k), 0) + " m"; }).join("; ") : "";
        return trw([td(esc(NOME_ESPECIE_CURTO[g.especie] || g.especie)), td(esc(g.secao)), tn(br(g.n, 0)), tn(un(g.util_m, 1, "m")), tn(un(g.volume_m3, 3, "m³")),
          td(cat ? esc(cat.fornecedor) + " — " + t(cat.nome) + ", p. " + t(cat.pagina) + (cat.bruta ? ' <span class="nota">(medida bruta)</span>' : "") + (g.origem ? ' <span class="nota">(' + t(g.origem.texto) + ")</span>" : "")
            : g.sobMedida ? esc(g.sobMedida.fornecedor) + ' <span class="nota">(cotação por m³; maior peça ' + br(g.sobMedida.maiorPeca_m, 2) + " m)</span>" : '<span class="alerta-tx">sem fornecedor no catálogo</span>'),
          td(barras || "—"), tn(pl ? br(pl.aproveitamento * 100, 0) + NB + "%" : "—")], g.pendencia ? "linha-alerta" : "");
      }), { classe: "compacta", nota: "Medida bruta: o catálogo informa medidas brutas; a peça aplainada pode chegar menor — a seção de cálculo é decisão do RT. Preço: não consta do orçamento recebido para a madeira serrada." });
      /* conferências de volume e de peças */
      var esp = c.esp;
      if (esp) {
        var volE = {}, nE = {}; Object.keys(obj(esp.porEspecie)).forEach(function (k) { volE[k] = num(esp.porEspecie[k].volume_m3, 0); nE[k] = num(esp.porEspecie[k].n, 0); });
        var volC = {}, nC = {}; gr.forEach(function (g) { volC[g.especie] = (volC[g.especie] || 0) + num(g.volume_m3, 0); nC[g.especie] = (nC[g.especie] || 0) + num(g.n, 0); });
        var ids = unicos(Object.keys(volE).concat(Object.keys(volC)));
        h += d.tab("Volume por espécie — especificação × lista de compra", ["Espécie", thn("Peças (especificação)"), thn("Peças (compra)"), thn("Volume da fonte"), thn("Volume da compra (L × b × h)")], ids.map(function (k) {
          return trw([td(esc(NOME_ESPECIE_CURTO[k] || k)), tn(br(nE[k] || 0, 0)), tn(br(nC[k] || 0, 0)), tn(un(volE[k] || 0, 3, "m³")), tn(un(volC[k] || 0, 3, "m³"))]);
        }), { nota: "O volume da compra usa o comprimento de corte × a seção nominal; o da fonte é o volume de cada peça no modelo BIM." });
        var nTot = soma(ids.map(function (k) { return nE[k] || 0; })), nTotC = soma(ids.map(function (k) { return nC[k] || 0; }));
        d.conferir("pecasCompra", nTot === nTotC, "peças da lista de compra = peças com espécie especificada: " + br(nTotC, 0) + " × " + br(nTot, 0));
      }
    } else h += naoAbrCaixa(d, "O resultado não traz a lista de compra da madeira.", "Lista de compra da madeira");
    /* orçamento recebido */
    var orcs = MC && MC.DADOS ? objs(MC.DADOS.orcamentos) : [];
    h += h3(n + ".2", "Painéis e materiais do orçamento recebido");
    if (orcs.length) orcs.forEach(function (o) {
      var lin = objs(o.itens).map(function (i) {
        var p = MC.produto(i.produtoId);
        return trw([td(esc(i.codigo)), td(t(i.descricao) + (p ? '<br><span class="nota">' + t([p.fabricante, p.linha].filter(Boolean).join(" ")) + "</span>" : "")), tn(br(i.qtd, 0) + " " + esc(i.unidade)), tn("R$" + NB + br(i.valorUnit, 2)), tn("R$" + NB + br(i.total, 2))]);
      });
      if (fin(o.frete)) lin.push(trw([td(""), td("Frete"), tn(""), tn(""), tn("R$" + NB + br(o.frete, 2))]));
      lin.push(trw([td(""), td("<b>Total do orçamento</b>"), tn(""), tn(""), tn("<b>R$" + NB + br(o.total, 2) + "</b>")], "tot"));
      h += d.tab("Orçamento " + esc(o.fornecedor) + " nº " + esc(o.numero) + ", de " + esc(dataIso(o.data)) + (o.cliente ? " (cliente " + esc(o.cliente) + ")" : ""), ["Código", "Item", thn("Qtd."), thn("Unitário"), thn("Total")], lin,
        { classe: "compacta", nota: "Preços do orçamento recebido, na data dele (sem atualização). Condições: " + arr(o.condicoes).map(function (x) { return t(x); }).join("; ") + "." });
    });
    else h += naoAbrCaixa(d, "Nenhum orçamento recebido no catálogo.", "Preços de materiais (orçamento recebido)");
    return h;
  }

  /* ---------- 13. premissas, pendências e não abrangidos */
  function secPremissas(c, d, n) {
    var h = "", r = c.r;
    var imp = arr(r.impedimentos);
    if (imp.length || r.ok === false) h += caixa("<b>Pendências que impedem o uso deste cálculo para a obra:</b>" + (imp.length ? "<ol>" + imp.map(function (x) { return "<li>" + t(x, "impedimento") + "</li>"; }).join("") + "</ol>" : " o resultado está marcado como não aprovado (ok = falso).") + " Enquanto não forem resolvidas e o cálculo refeito, este memorial não pode ser usado para execução.", "erro");
    var pr = objs(r.premissas);
    h += h3(n + ".1", "Premissas adotadas");
    h += pr.length ? d.tab("Premissas do cálculo", ["Item", "Valor adotado", "Fonte", "Confiança"], pr.map(function (p) { return trw([td("<b>" + t(p.item) + "</b>"), td(t(p.valor, "premissa")), td(t(p.fonte, "premissa")), td(t(p.confianca || ""))]); }), { classe: "compacta" }) : "<p>O resultado não lista premissas.</p>";
    h += h3(n + ".2", "Pendências");
    var pe = arr(r.pendencias);
    h += pe.length ? '<ol class="pend">' + pe.map(function (p) { return "<li>" + t(p, "pendência") + "</li>"; }).join("") + "</ol>" : "<p>Sem pendências no resultado.</p>";
    h += h3(n + ".3", "Itens não abrangidos por esta emissão");
    /* vidro: fornecimento pelo vidraceiro (premissa "Vidro laminado da cobertura — fornecimento", decisão do RT 13/10/2026) */
    h += "@@NAO_ABRANGIDOS@@";
    h += "<p>Responsabilidade de terceiros: projeto e execução da fundação (recebe as reações da " + secao("reacoes") + "), arquitetura e níveis de projeto, impermeabilização e instalações.</p>";
    var av = arr(r.avisos);
    h += h3(n + ".4", "Observações do cálculo");
    h += av.length ? "<ul>" + av.map(function (a) { return "<li>" + t(a, "aviso") + "</li>"; }).join("") + "</ul>" : "<p>Sem observações.</p>";
    h += h3(n + ".5", "Conferências internas deste memorial");
    h += "<p>Conferências feitas na geração do memorial: equilíbrio das reações com o piso, volume por espécie, peças da compra, η refeito das peças governantes e coerência dos textos dos motores.</p>@@CONFERENCIAS@@";
    return h;
  }

  /* ---------- 14. referências */
  function secReferencias(c, d, n) {
    var h = h3(n + ".1", "Normas técnicas");
    h += '<ul class="refs">' + NORMAS.map(function (nm) { return "<li>" + esc(nm.id) + " — " + esc(nm.titulo) + "." + (nm.url ? '<span class="url">' + link(nm.url, esc(nm.url)) + "</span>" : "") + "</li>"; }).join("") + "</ul>";
    h += h3(n + ".2", "Catálogos e fichas técnicas dos fabricantes");
    var MC = c.mc, itens = [];
    if (MC && MC.DADOS) {
      var usados = [];
      function add(p, uso) { if (!p) return; var f = MC.fonte(p) || {}; usados.push({ p: p, f: f, uso: uso }); }
      add(MC.produto("nibra-evoply"), "chapa de contraventamento (premissa)");
      add(MC.produto("eternit-painel-wall-40"), "painel do piso seco");
      objs(MC.DADOS.orcamentos).forEach(function (o) { objs(o.itens).forEach(function (i) { var p = MC.produto(i.produtoId); if (p && ["nibra-evoply", "eternit-painel-wall-40"].indexOf(p.id) < 0) add(p, "item do orçamento " + o.numero); }); });
      if (c.compra) objs(c.compra.grupos).forEach(function (g) { if (g.catalogo && g.catalogo.produtoId) add(MC.produto(g.catalogo.produtoId), "madeira serrada " + g.secao); });
      var vistos = {};
      usados.forEach(function (u) {
        var k = u.p.id; if (vistos[k]) return; vistos[k] = true;
        var url = urlDe(u.p.link) || urlDe(u.f.site);
        itens.push("<li><b>" + t((u.f.fabricante ? String(u.f.fabricante).split(" (")[0] + " — " : "") + (u.p.linha || u.p.id)) + "</b>: " + t(u.f.titulo || "catálogo") + (u.f.edicao_data ? " (" + t(String(u.f.edicao_data).split(" (")[0]) + ")" : "") + (u.p.pagina ? ", p. " + t(u.p.pagina) : "") + " — " + esc(u.uso) + "." + (url ? '<span class="url">' + link(url, esc(url)) + "</span>" : "") + "</li>");
      });
      var ks = Object.keys(obj(MC.DADOS.fontes)).filter(function (k) { return /klimas|eurotec|eurovent/.test(k); });
      ks.forEach(function (k) { var f = MC.DADOS.fontes[k], url = urlDe(f.site); itens.push("<li><b>" + t(String(f.fabricante || k).split(" (")[0]) + "</b>: " + t(f.titulo || f.arquivo) + (f.edicao_data ? " (" + t(String(f.edicao_data).split(" (")[0]) + ")" : "") + " — catálogo de referência dos fixadores e membranas." + (url ? '<span class="url">' + link(url, esc(url)) + "</span>" : "") + "</li>"); });
    }
    h += itens.length ? '<ul class="refs">' + itens.join("") + "</ul>" : "<p>Catálogo não disponível.</p>";
    h += h3(n + ".3", "Documentos da obra");
    var docs = arr(c.op.documentosReferencia);
    h += docs.length ? '<ul class="refs">' + docs.map(function (x) { return "<li>" + t(x) + "</li>"; }).join("") + "</ul>" : "<p>—</p>";
    h += h3(n + ".4", "Ferramenta de cálculo");
    h += "<p>OrçaPRO" + (c.op.versao ? " (" + t(c.op.versao) + ")" : "") + " — módulo de estruturas de madeira: espécies por função, descida de cargas e verificação do piso seco (regressão de 141 casos do emitido R03), gerador do modelo analítico (idêntico ao gerador emitido, 1.364 nós e 1.800 barras na fonte R03), paredes de contraventamento (608 valores iguais ao cálculo emitido), ligações (regressão do calc_ligacoes e de 1.940 células das tabelas da Klimas) e lista de compra.</p>";
    return h;
  }

  /* ---------- 15. responsabilidade técnica */
  function secTermo(c, d) {
    var rp = c.rp, bm = obj(c.op.bimManager), ct = obj(c.op.contratanteAssinatura), ob = c.ob;
    var h = "<p>Este memorial apresenta o cálculo da estrutura de madeira descrita na " + secao("objeto") + " — ações, combinações, modelo analítico, verificação do piso seco, resistência das paredes de contraventamento, ligações e reações para a fundação — com as expressões, os valores e o resultado de cada verificação. As premissas, as pendências e os itens não abrangidos estão na " + secao("premissas") + ".</p>";
    h += "<p>As partes identificadas como “não abrangido nesta emissão” não estão verificadas por este documento e precisam ser verificadas antes da execução correspondente.</p>";
    if (c.r.ok !== true) h += caixa("<b>Há verificações que não atendem ou pendências que impedem o uso (" + secao("premissas") + "): enquanto não forem resolvidas e o cálculo refeito, este memorial não pode ser usado para execução.</b>", "erro");
    if (c.d.situacao) h += caixa("<b>" + t(c.d.situacao) + ".</b>", "alerta");
    h += "<p>Responsável técnico pelo projeto e pelo dimensionamento: " + ph(rp.abrev || rp.titulo, "TÍTULO") + " " + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + ", " + esc(rp.conselho || "CREA") + " nº " + ph(rp.crea, "Nº DO REGISTRO") + " — " + ph(rp.empresa, "EMPRESA") + (rp.cnpj ? ", CNPJ " + esc(rp.cnpj) : "") + (rp.endereco ? ", " + esc(rp.endereco) : "") + ".</p>";
    function bloco(titulo, linhas) { return '<div class="assin"><div class="assin-linha"></div>' + linhas.map(function (l) { return "<div>" + l + "</div>"; }).join("") + '<div class="assin-tit">' + titulo + "</div></div>"; }
    h += '<div class="assin-grade">' +
      bloco("Responsável técnico", ["<b>" + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + "</b>", ph(rp.titulo, "TÍTULO PROFISSIONAL") + " — " + esc(rp.conselho || "CREA") + " nº " + ph(rp.crea, "Nº"), ph(rp.empresa, "EMPRESA")]) +
      bloco("BIM Manager", ["<b>" + ph(bm.nome, "NOME DO BIM MANAGER") + "</b>", ph(bm.titulo, "TÍTULO"), ph(bm.empresa, "EMPRESA")]) +
      bloco("Contratante", ["<b>" + ph(ct.nome, "REPRESENTANTE DA CONTRATANTE") + "</b>", ph(ct.cargo, "CARGO"), ph(ct.empresa || ob.contratante, "CONTRATANTE")]) +
      "</div>";
    h += '<p class="local">' + ph(c.op.local || ob.cidade, "LOCAL") + ", " + esc(c.data) + ".</p>";
    return h;
  }

  /* ================================================================ CAPA, SUMÁRIO, CSS */
  function logoBox(src, rot, alt) {
    return '<div class="logo-box">' + (imgOk(src) ? '<img class="logo" src="' + esc(src) + '" alt="' + esc(alt) + '">' : '<div class="logo-ph"><span class="ph">[LOGO]</span></div>') + '<div class="logo-rot">' + esc(rot) + "</div></div>";
  }
  function capa(c) {
    var op = c.op, lg = obj(op.logos), ob = c.ob, rp = c.rp, bm = obj(op.bimManager), r = c.r;
    var arte = c.modelo ? svgModelo(c, { modo: "iso", titulo: "Perspectiva do modelo", placas: true }) : "";
    var falhas = c.ligs.filter(function (l) { return fin(l.eta) && l.eta > 1 && !l.substituidaPor; }).length + (c.piso ? objs(c.piso.pecas).filter(function (p) { return etaPeca(p) > 1; }).length : 0) + c.verifs.filter(function (v) { return num(v.eta, 0) > 1; }).length;
    var imp = arr(r.impedimentos), sit;
    if (falhas || imp.length || r.ok !== true) sit = '<span class="falha">NÃO ATENDE — ver ' + secao("premissas") + "</span>: " + [falhas ? plural(falhas, "verificação não atende", "verificações não atendem") : "", imp.length ? plural(imp.length, "pendência impede o uso", "pendências impedem o uso") : ""].filter(Boolean).join("; ") + (falhas || imp.length ? "" : "cálculo incompleto para uso na obra") + ".";
    else sit = '<span class="ok">Atende — todas as verificações desta emissão atendem</span>; partes não abrangidas na ' + secao("premissas") + ".";
    var revs = objs(op.revisoes);
    if (!revs.length) revs = [{ rev: c.rev, data: c.data, descricao: "Emissão inicial" }];
    return '<section class="capa" id="sec-capa">' +
      '<div class="capa-logos">' + logoBox(lg.ra, "Projeto e cálculo", "RA Engenharia") + logoBox(lg.contratante, "Contratante", "Contratante") + logoBox(lg.proprietario, "Proprietário", "Proprietário") + "</div>" +
      '<div class="capa-faixa"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div>' +
      '<div class="capa-tit"><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>Estrutura de madeira — ' + esc(c.obraNome) + "</h1>" +
      '<div class="sub">Piso seco, modelo estrutural, paredes de contraventamento, ligações, reações para a fundação e lista de compra</div></div>' +
      (c.d.situacao ? '<div class="capa-sit">' + t(c.d.situacao) + "</div>" : "") +
      '<div class="capa-arte">' + arte + "</div>" +
      '<table class="capa-ficha"><tbody>' +
      "<tr><td>Documento</td><td><b>" + ph(c.num, "Nº DO DOCUMENTO") + " " + esc(c.rev) + "</b> — " + esc(c.data) + "</td></tr>" +
      "<tr><td>Obra</td><td>" + ph(ob.nome, "OBRA") + "</td></tr>" +
      "<tr><td>Endereço</td><td>" + ph([ob.endereco, ob.cidade].filter(Boolean).join(" — "), "ENDEREÇO") + "</td></tr>" +
      "<tr><td>Proprietário</td><td>" + ph(ob.proprietario || ob.cliente, "PROPRIETÁRIO") + (ob.proprietarioCnpj ? " — CNPJ " + esc(ob.proprietarioCnpj) : "") + "</td></tr>" +
      "<tr><td>Contratante</td><td>" + ph(ob.contratante, "CONTRATANTE") + "</td></tr>" +
      "<tr><td>Responsável técnico</td><td>" + ph(rp.abrev || rp.titulo, "TÍTULO") + " " + ph(rp.nome, "NOME") + " — " + esc(rp.conselho || "CREA") + " nº " + ph(rp.crea, "Nº") + " — " + ph(rp.empresa, "EMPRESA") + (rp.cnpj ? " (CNPJ " + esc(rp.cnpj) + ")" : "") + "</td></tr>" +
      "<tr><td>BIM Manager</td><td>" + ph(bm.titulo, "TÍTULO") + " " + ph(bm.nome, "NOME") + (bm.empresa ? " — " + esc(bm.empresa) : "") + "</td></tr>" +
      "<tr><td>Situação do cálculo</td><td" + (falhas || imp.length || r.ok !== true ? ' class="sit-falha"' : "") + ">" + sit + "</td></tr>" +
      "</tbody></table>" +
      '<table class="capa-rev"><caption>Quadro de revisões</caption><thead><tr><th>Rev.</th><th>Data</th><th>Descrição</th><th>Por</th></tr></thead><tbody>' +
      revs.map(function (x) { return "<tr><td>" + esc(x.rev) + "</td><td>" + esc(x.data) + "</td><td>" + t(x.descricao) + "</td><td>" + esc(x.por || "") + "</td></tr>"; }).join("") + "</tbody></table>" +
      "</section>";
  }
  function sumario(c, d) {
    return '<section class="sumario" id="sumario"><h2 class="sem-num">Sumário</h2><ol class="sum">' +
      SECOES.map(function (s, i) { return '<li><a href="#sec-' + s.id + '"><span class="sn">' + (i + 1) + "</span>" + esc(s.titulo) + "</a></li>"; }).join("") + "</ol>" +
      '<p class="nota">Este memorial contém ' + SECOES.length + " seções numeradas, " + d.nFig + " figuras e " + d.nTab + " tabelas. Documento " + esc(c.num) + " " + esc(c.rev) + " de " + esc(c.data) + ".</p></section>";
  }
  function css(c) {
    var rp = c.rp;
    var topoE = c.obraNome + " — Estrutura de madeira", topoD = "Memorial de cálculo " + (c.num ? c.num + " " : "") + c.rev;
    var rodE = [rp.empresa || "RA Engenharia", rp.nome ? "Resp. técnico: " + (rp.abrev ? rp.abrev + " " : "") + rp.nome + (rp.crea ? " — " + (rp.conselho || "CREA") + " " + rp.crea : "") : ""].filter(Boolean).join(" · ");
    var mb = "font: 7.3pt 'Segoe UI', Helvetica, Arial, sans-serif; color: #5b6774;";
    var A = COR.azul;
    return "@page { size: A4; margin: 20mm 14mm 17mm 18mm;" +
      " @top-left { content: " + cssStr(topoE) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid " + COR.areia + "; }" +
      " @top-right { content: " + cssStr(topoD) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; border-bottom: 0.6pt solid " + COR.areia + "; }" +
      " @bottom-left { content: " + cssStr(rodE) + "; " + mb + " vertical-align: top; padding-top: 3mm; }" +
      " @bottom-right { content: \"Página \" counter(page) \" de \" counter(pages); " + mb + " vertical-align: top; padding-top: 3mm; } }" +
      "@page :first { @top-left { content: none; border: none; } @top-right { content: none; border: none; } @bottom-left { content: none; } @bottom-right { content: none; } }" +
      "html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
      "body { font: 9.2pt/1.42 'Segoe UI', Helvetica, Arial, sans-serif; color: #1d2733; background: #ffffff; margin: 0; }" +
      "@media screen { body { max-width: 182mm; margin: 10mm auto; padding: 0 10mm; } .sec, .sumario { border-top: 1px dashed #c9d2dc; margin-top: 10mm; padding-top: 6mm; } }" +
      "h1 { font-size: 20pt; font-weight: 600; margin: 2mm 0 2mm; color: " + A + "; letter-spacing: -0.01em; }" +
      "h2 { font-size: 13.5pt; font-weight: 600; margin: 0 0 4mm; padding-bottom: 1.6mm; border-bottom: 1.4pt solid " + A + "; color: #1d2733; break-after: avoid; }" +
      "h2 .num { color: " + A + "; margin-right: 3mm; } h2 .de { float: right; font-size: 7.2pt; font-weight: 400; color: #8a95a3; margin-top: 2.6mm; }" +
      "h3 { font-size: 10.6pt; font-weight: 600; margin: 5mm 0 2mm; color: " + A + "; break-after: avoid; }" +
      "p { margin: 0 0 2.2mm; text-align: justify; } ul, ol { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 0.8mm; }" +
      ".sec { break-before: page; } h3.nova-pag { break-before: page; }" +
      "table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 7.9pt; line-height: 1.3; font-variant-numeric: tabular-nums; }" +
      "table.t caption { caption-side: top; text-align: left; font-size: 8.1pt; padding-bottom: 1.2mm; color: #1d2733; }" +
      "table.t th { background: #e6edf3; color: " + A + "; font-weight: 600; text-align: left; border: 0.5pt solid #b8c4d0; padding: 1mm 1.3mm; vertical-align: bottom; }" +
      "table.t td { border: 0.5pt solid #ccd5de; padding: 0.85mm 1.3mm; vertical-align: top; overflow-wrap: break-word; }" +
      "table.t tbody tr:nth-child(even) td { background: #f6f8fa; } table.t tr.tot td { background: #eef3f8; border-top: 0.9pt solid #8a97a6; }" +
      "table.t tr.linha-falha td { background: #fbefed; } table.t tr.linha-alerta td { background: #fbf6ea; }" +
      "table.t th.n, table.t td.n { text-align: right; white-space: nowrap; } table.t td.r { text-align: right; }" +
      "table.compacta { font-size: 7.3pt; } table.compacta td { padding: 0.6mm 1.1mm; } table.resumo { font-size: 7.1pt; }" +
      "table.ficha td:first-child { width: 30%; color: #3a4654; }" +
      "table.verif { table-layout: fixed; } table.verif th:first-child { width: 9%; } table.verif td:first-child { text-align: center; }" +
      "table.normas { font-size: 7.4pt; table-layout: fixed; } table.normas th:nth-child(1) { width: 17%; } table.normas th:nth-child(2) { width: 30%; } table.normas th:nth-child(3) { width: 23%; }" +
      "table.camadas td:nth-child(3) { width: 46%; }" +
      "table.curta { break-inside: avoid; } thead { display: table-header-group; } tr { break-inside: avoid; } caption { break-after: avoid; }" +
      ".eq { font-family: 'Cambria Math', Cambria, 'Times New Roman', serif; font-size: 8.6pt; }" +
      ".fig { margin: 2mm 0 5mm; text-align: center; break-inside: avoid; } .fig svg { max-width: 100%; height: auto; max-height: 120mm; }" +
      "figcaption { font-size: 7.9pt; color: #3a4654; margin-top: 1.5mm; text-align: center; }" +
      ".nota { font-size: 7.6pt; color: #4a5664; } p.nota { margin-top: -2mm; }" +
      ".ok { color: " + COR.verde + "; font-weight: 700; } .falha { color: " + COR.falha + "; font-weight: 700; } .ph { color: #b3261e; font-weight: 600; } .na { color: #6b5d45; font-style: italic; } .alerta-tx { color: #9a5b12; }" +
      ".caixa { border: 0.6pt solid #b8c4d0; border-left: 2.4pt solid " + A + "; background: #f3f6f9; padding: 2.2mm 3mm; margin: 2mm 0 4mm; break-inside: avoid; }" +
      ".caixa.alerta { border-left-color: " + COR.alerta + "; background: #fbf6ea; } .caixa.neutra { border-left-color: " + COR.areia + "; background: #f7f4ee; } .caixa.erro { border-left-color: " + COR.falha + "; background: #fbf1ef; } .caixa ul { margin: 1.5mm 0 0; }" +
      "a { color: " + A + "; text-decoration: none; } .url { display: block; font-size: 6.6pt; color: #6b7785; word-break: break-all; } ul.refs li { margin-bottom: 1.6mm; }" +
      "ol.regras li, ol.pend li { margin-bottom: 1.4mm; text-align: justify; }" +
      ".capa { height: 258mm; display: flex; flex-direction: column; break-after: page; }" +
      ".capa-logos { display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; } .logo-box { flex: 1; text-align: center; }" +
      ".logo-box .logo { max-height: 24mm; max-width: 56mm; } .logo-ph { height: 20mm; display: flex; align-items: center; justify-content: center; border: 0.6pt dashed #c9b9a0; font-size: 10pt; }" +
      ".logo-rot { font-size: 6.8pt; letter-spacing: 0.12em; text-transform: uppercase; color: #8a7a62; margin-top: 1.2mm; }" +
      ".capa-faixa { display: flex; height: 1.3mm; margin: 5mm 0 7mm; } .capa-faixa span { display: block; height: 100%; } .capa-faixa .f1 { flex: 6; background: " + A + "; } .capa-faixa .f2 { flex: 2; background: " + COR.areia + "; } .capa-faixa .f3 { flex: 1; background: " + COR.verde + "; }" +
      ".capa-tit .sobre { font-size: 8.5pt; letter-spacing: 0.2em; color: " + COR.marrom + "; font-weight: 600; } .capa-tit .sub { color: #4a5664; font-size: 9.6pt; }" +
      ".capa-sit { margin-top: 3mm; border: 0.8pt solid " + COR.falha + "; color: " + COR.falha + "; font-weight: 600; font-size: 8.4pt; text-align: center; padding: 1.4mm; letter-spacing: 0.04em; }" +
      ".capa-arte { flex: 1; display: flex; align-items: center; justify-content: center; margin: 3mm 0; min-height: 0; } .capa-arte svg { max-width: 100%; max-height: 82mm; height: auto; }" +
      ".capa-ficha, .capa-rev { width: 100%; border-collapse: collapse; font-size: 8.1pt; margin-top: 1.5mm; } .capa-ficha td { border-bottom: 0.5pt solid #ccd5de; padding: 1.1mm 1.5mm; vertical-align: top; } .capa-ficha td:first-child { width: 26%; color: #5b6774; }" +
      ".capa-rev caption { text-align: left; font-weight: 600; color: " + A + "; font-size: 8.2pt; padding: 2mm 0 1mm; } .capa-rev th { background: #e6edf3; border: 0.5pt solid #b8c4d0; padding: 1mm 1.5mm; text-align: left; font-weight: 600; } .capa-rev td { border: 0.5pt solid #ccd5de; padding: 1.1mm 1.5mm; }" +
      ".capa .ok, .capa .falha { white-space: normal; } .capa-ficha td.sit-falha { background: #fbefed; color: #a3352b; }" +
      ".sumario { break-after: page; } ol.sum { list-style: none; padding: 0; margin: 3mm 0 6mm; font-size: 10.4pt; }" +
      "ol.sum li { padding: 1.6mm 0; border-bottom: 0.5pt solid #e1e7ed; } ol.sum .sn { display: inline-block; width: 9mm; color: " + A + "; font-weight: 600; } ol.sum a { color: #1d2733; }" +
      ".assin-grade { display: flex; justify-content: space-between; gap: 6mm; margin: 26mm 0 6mm; break-inside: avoid; } .assin { flex: 1; text-align: center; font-size: 8.2pt; }" +
      ".assin-linha { border-top: 0.7pt solid #1d2733; margin-bottom: 2mm; } .assin div { margin-bottom: 0.6mm; } .assin-tit { margin-top: 1.5mm; font-size: 7pt; letter-spacing: 0.14em; text-transform: uppercase; color: " + COR.marrom + "; }" +
      "p.local { margin-top: 10mm; text-align: center; }";
  }

  /* ================================================================ GERAR */
  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    estado.invalidos = 0; estado.indefinidos = [];
    if (!r || typeof r !== "object") return { ok: false, motivo: "Sem resultado de cálculo para gerar o memorial.", html: "", titulo: "", secoes: [], figuras: 0, tabelas: 0, avisos: [], conferencias: [] };
    var c = contexto(r, opcoes), d = new Doc();
    arr(r.naoAbrangido).forEach(function (x) { d.naoAbrangido(String(x)); });
    var FN = { objeto: secObjeto, normas: secNormas, materiais: secMateriais, acoes: secAcoes, modelo: secModelo, piso: secPiso, superestrutura: secSuperestrutura,
      paredes: secParedes, ligacoes: secLigacoes, reacoes: secReacoes, nivel: secNivel, compra: secCompra, premissas: secPremissas, referencias: secReferencias, termo: secTermo };
    var corpo = SECOES.map(function (s, i) {
      var n = i + 1, h;
      try { h = FN[s.id](c, d, n); }
      catch (e) { d.aviso("Seção " + n + " (" + s.titulo + ") gerada com erro: " + (e && e.message)); h = caixa("<b>Esta seção não pôde ser gerada:</b> " + esc(e && e.message) + ".", "erro"); }
      return '<section class="sec" id="sec-' + s.id + '"><h2><span class="num">' + n + "</span>" + esc(s.titulo) + '<span class="de">seção ' + n + " de " + SECOES.length + " · " + esc(c.rev) + "</span></h2>" + h + "</section>";
    }).join("");
    /* conferências que dependem do resultado inteiro */
    var esp = c.esp;
    if (esp && objs(r.pecas).length) {
      var volId = {}; objs(r.pecas).forEach(function (p) { volId[p.id] = num(p.volume_m3, 0); });
      var somaEsp = soma(Object.keys(obj(esp.porEspecie)).map(function (k) { return esp.porEspecie[k].volume_m3; }));
      var somaPecas = soma(objs(r.pecas).filter(function (p) { return p.secao_cm; }).map(function (p) { return p.volume_m3; }));
      var nSem = arr(esp.semRegra).length;
      d.conferir("volume", Math.abs(somaEsp - somaPecas) <= 1e-6 * Math.max(1, somaPecas) && nSem === 0, "Σ volume por espécie = " + un(somaEsp, 4, "m³") + " × Σ volume das peças de madeira da fonte = " + un(somaPecas, 4, "m³") + (nSem ? " (" + nSem + " peças sem regra de espécie)" : ""));
    }
    if (estado.invalidos) d.aviso(plural(estado.invalidos, "coordenada inválida", "coordenadas inválidas") + " nas figuras (desenhadas na origem).");
    estado.indefinidos.forEach(function (x) { d.aviso("Texto do motor com valor indefinido — " + x); });
    d.conferir("textos", estado.indefinidos.length === 0, "textos dos motores sem valor indefinido" + (estado.indefinidos.length ? ": " + estado.indefinidos.length + " ocorrência(s)" : ""));
    var confHtml = '<ul class="conf">' + d.conf.map(function (k) { return "<li>" + (k.ok ? '<span class="ok">verdadeira</span>' : '<span class="falha">FALSA</span>') + " — " + esc(k.texto) + "</li>"; }).join("") + "</ul>";
    var divs = d.avisos.slice();
    confHtml += divs.length ? caixa("<b>Divergências encontradas:</b><ul>" + divs.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>", "erro") : caixa("Todas as conferências internas passaram.");
    corpo = corpo.replace("@@CONFERENCIAS@@", confHtml);
    corpo = corpo.replace("@@NAO_ABRANGIDOS@@", d.naoAbr.length ? "<ul>" + d.naoAbr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "<p>Nenhum.</p>");
    var titulo = "Memorial de cálculo — Estrutura de madeira — " + c.obraNome;
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="OrçaPRO — MadMemorial"><title>' + esc(titulo) + "</title><style>" + css(c) + "</style></head><body>" +
      capa(c) + sumario(c, d) + corpo + "</body></html>";
    return {
      ok: true, html: html, titulo: titulo,
      secoes: [{ id: "capa", numero: null, titulo: "Capa" }].concat(SECOES.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: s.titulo }; })),
      figuras: d.nFig, tabelas: d.nTab, avisos: divs, conferencias: d.conf.slice(), naoAbrangidos: d.naoAbr.slice()
    };
  }

  var MadMemorial = { gerar: gerar, SECOES: SECOES, NORMAS: NORMAS, CORES: COR };
  global.MadMemorial = MadMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = MadMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
