/* =====================================================================
 * acomemorial.js — MEMORIAL DE CÁLCULO DA ESTRUTURA METÁLICA (galpão em
 * pórticos) — motor PURO, ES5, sem DOM, Node-testável.
 *
 *   AcoMemorial.gerar(r, opcoes) → { ok, html, titulo, secoes: [{ id, numero, titulo }],
 *                                    figuras, tabelas, avisos: [conferências internas] }
 *
 *   r        resultado do AcoDimensionar.calcular (docs/metalica/CONTRATO.md)
 *   opcoes   empresa { nome, cnpj, endereco, logoDataUrl } · responsavel { nome,
 *            titulo, crea } · obra { nome, endereco, cidade, cliente } ·
 *            revisao ("R00") · revisaoDescricao · data (texto ou Date) · art ·
 *            versao (do sistema) · imagens { perspectiva, deformada, flambagem }
 *            (PNG em data URL que a tela fotografa) · fechamentos { telha,
 *            paredes } (itens do catálogo dados-fonte/metalica/fechamentos;
 *            imagem de produto só entra com `src`/`dataUrl` em data URL ou http) ·
 *            fontes [{ id, titulo, url, edicao }] (resolve o `fonte` dos itens) ·
 *            vento (resultado do AcoVento.calcular; r.vento tem prioridade) ·
 *            isopletas (o AcoIsopletas; padrão: o global) · materiais
 *            { parafuso, eletrodo, chumbador, concreto } (especificação das
 *            ligações, quando já houver)
 *
 * O DOCUMENTO: HTML completo para imprimir em PDF (A4; @page com cabeçalho e
 * rodapé e "Página X de Y" nas margens — Chromium 131+, o navegador do
 * OrçaPRO; nos outros navegadores o "seção n de N" no título de cada seção é
 * a numeração de reserva). Figuras SVG geradas aqui: planta com eixos e
 * locação dos pilares, pórtico típico cotado, perspectiva do modelo,
 * diagramas N/V/M, deformada, modo de flambagem, mapa de aproveitamento,
 * zonas de vento, cobertura e parede contraventadas, locação das bases; o
 * mapa de isopletas vem do js/acoisopletas.js, com a obra marcada.
 * O que o resultado trouxer entra com os passos: barras (NBR 8800), terças e
 * travessas (r.tercas, r.travessas — NBR 14762), ligações (r.ligacoes: placa
 * de base também na seção de reações), vento (r.vento + r.ventoCasos). Sem o
 * dado, a parte entra em "itens não abrangidos" (seção de premissas). Normas: js/aconormas.js
 * quando carregado (título, tema e vigência); o "usado" vem do resultado.
 *
 * REGRAS (registro formal de engenharia — ⚠ não afrouxar):
 *   · NADA INVENTADO: o que o motor não calculou (terças, travessas,
 *     ligações, placa de base, mãos-francesas) aparece em "itens não
 *     abrangidos", nunca como calculado; fundação e arquitetura são
 *     "responsabilidade de terceiros". Cada número vem do resultado ou de uma opção dada, com unidade
 *     e vírgula decimal.
 *   · Texto do motor com "undefined/NaN/null" vira "[valor indefinido]" E entra
 *     nas conferências de consistência: esconder o defeito seria pior.
 *   · Conferências internas impressas no próprio documento: equilíbrio por caso
 *     (Σ cargas aplicadas × Σ reações), cargas permanentes declaradas × cargas
 *     aplicadas ao modelo, soma dos pesos × r.peso, casos de vento do modelo ×
 *     casos do AcoVento. Divergência vira aviso; nunca some.
 *   · Edição da norma em cada item: a que o motor citou (verificações, serviço,
 *     decisões). A vigência (NORMAS) é a do catálogo da ABNT conferido em
 *     12/10/2026 (vigencia.json da biblioteca técnica).
 *
 * ⚠ CONVENÇÕES DO MOTOR (js/acoanalise.js, js/acomodelo.js): X ao longo do
 *   vão, Y para cima, Z ao longo do comprimento; reação = força do apoio NA
 *   estrutura (Fy > 0 = compressão na fundação); N > 0 tração; Mz > 0
 *   comprime a face +y (pilar: mesa de dentro; viga: mesa de cima) — o
 *   diagrama de momento é desenhado do lado TRACIONADO.
 * ⚠ PADRAO_CARGAS repete os padrões de AcoModelo.cargas(); se o motor mudar,
 *   a conferência "permanentes declaradas × aplicadas" acusa a diferença.
 * Teste: node tools/test-aco-memorial.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }

  /* ================================================================ FORMATO */
  var NB = String.fromCharCode(160), MENOS = "−";
  var estado = { invalidos: 0, indefinidos: [] };   /* zera a cada gerar() */
  var RE_INDEF = /\b(undefined|nan|null|infinity)\b/i, RE_INDEF_G = /\b(undefined|nan|null|infinity)\b/gi;

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function objs(v) { return arr(v).filter(function (x) { return x && typeof x === "object" && !Array.isArray(x); }); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  /* número no padrão brasileiro: vírgula decimal, ponto de milhar, menos tipográfico; nunca "−0,00" */
  function br(v, c) {
    if (!fin(v)) return "—";
    c = c == null ? 2 : c;
    var s = Math.abs(v).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s) !== 0 ? MENOS : "") + i + (p.length > 1 ? "," + p[1] : "");
  }
  function un(v, c, u) { return br(v, c) + NB + u; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  /* Anotações de trabalho que os motores carregam nos textos ("(conferir na 2023)", "— conferir na NBR …", "numeração
     não conferida no texto oficial", "(texto oficial pendente)") são rastreio interno da base de normas: o memorial
     registra O QUE foi aplicado (edição, item, expressão), não a lista de tarefas. ⚠ Item de norma marcado como não
     conferido perde o NÚMERO (fica só o assunto) — afirmar um número de item incerto seria pior que omiti-lo. */
  function semAfazer(s) {
    return String(s)
      .replace(/,?\s*\d+(?:\.\d+)+\s*\(([^;()]*);\s*numera[çc][ãa]o n[ãa]o conferida[^)]*\)/gi, ", $1")
      .replace(/\s*\(\s*(?:a\s+)?conferir[^)]*\)/gi, "")
      .replace(/\s*\(\s*texto oficial pendente\s*\)/gi, "")
      .replace(/\s*[;:,]\s*conferir[^);]*(?=\))/gi, "")
      .replace(/\s*[—-]\s*conferir\b[^.;)]*/gi, "")
      .replace(/\blimite de partida\b/gi, "limite adotado")
      .replace(/\s{2,}/g, " ");
  }
  /* referências do vento: o js/acovento.js cita a LINHA do texto da norma na biblioteca da RA ("— linhas 551–563",
     "(linha 837)", "PDF p. 14") para a conferência interna; no memorial fica o item e a tabela da norma */
  function semLinhas(s) {
    return String(s == null ? "" : s)
      .replace(/\s*\(\s*(?:\.txt|PDF p\.)[^()]*(?:\([^)]*\)[^()]*)*\)/g, "")
      .replace(/\s*\(\s*linhas?\s+[\d–-]+[^)]*\)/g, "")
      .replace(/\s*[—-]\s*PDF p\.\s*\d+(?:\s*\(imagem\))?/g, "")
      .replace(/\s*[—-]\s*linhas?\s+[\d–-]+(?:\s*e\s*[\d–-]+)?/g, "")
      .replace(/\s*[,;]\s*(?:notas\s+(?:nas\s+)?)?linhas?\s+[\d–-]+(?:\s*e\s*[\d–-]+)?/g, "")
      .replace(/\s{2,}/g, " ").trim();
  }
  function tv(s, onde) { return t(semLinhas(s), onde); }
  /* texto que veio do motor: tira as anotações de trabalho, escapa e denuncia valor indefinido */
  function t(s, onde) {
    var x = semAfazer(s == null ? "" : s);
    /* ⚠ o aviso guarda o texto JÁ limpo: citar o "NaN" original nas conferências levaria o defeito de volta à página */
    if (RE_INDEF.test(x)) { x = x.replace(RE_INDEF_G, "[valor indefinido]"); estado.indefinidos.push((onde ? onde + ": " : "") + x.slice(0, 90)); }
    return esc(x);
  }
  /* dado do usuário que pode faltar: placeholder entre colchetes, em vermelho */
  function ph(v, rotulo) { var s = v == null ? "" : String(v).trim(); return s ? esc(s) : '<span class="ph">[' + esc(rotulo) + "]</span>"; }
  /* coordenada de desenho: coordenada inválida conta como defeito (aparece nas conferências) */
  function f1(v) { if (!fin(v)) { estado.invalidos++; return "0"; } return String(Math.round(v * 10) / 10); }
  function dataTxt(d) {
    function dois(n) { return (n < 10 ? "0" : "") + n; }
    if (d instanceof Date && !isNaN(d.getTime())) return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear();
    if (typeof d === "string" && d.trim()) return d.trim();
    return dataTxt(new Date());
  }
  function unicos(lista) { var o = []; lista.forEach(function (x) { if (x != null && x !== "" && o.indexOf(x) < 0) o.push(x); }); return o; }
  function cssStr(s) { return '"' + String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").replace(/</g, "\\3c ") + '"'; }
  function imgOk(s) { return typeof s === "string" && (/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(s) || /^https?:\/\/\S+$/i.test(s)); }
  function urlOk(s) { return typeof s === "string" && /^https?:\/\/[^\s"<>]+$/i.test(s.trim()); }
  function link(url, texto) { return urlOk(url) ? '<a href="' + esc(url.trim()) + '">' + (texto || esc(url.trim())) + "</a>" : (texto || ""); }
  /* fonte de catálogo: "Título — https://..." ou "Título (https://..., baixado em …, sha256 …)" → título + link.
     ⚠ o que vem depois do link (data de download, hashes de conferência) é rastreio interno da base, não vai para o memorial */
  function urlDe(s) { var m = /(https?:\/\/[^\s),;]+)/.exec(String(s || "")); return m ? m[1] : null; }
  function fonteHtml(s, pagina) {
    var x = String(s || ""), url = urlDe(x), tit = x;
    if (url) {
      var iU = x.indexOf(url), iP = x.lastIndexOf("(", iU);
      tit = iP >= 0 && x.slice(iP + 1, iU).trim() === "" ? x.slice(0, iP) : x.replace(url, "");
    }
    tit = tit.replace(/[\s,;(—-]+$/, "").trim();
    return t(tit || "catálogo", "fonte") + (url ? " — " + link(url, "link") : "") + (pagina != null && pagina !== "" ? ", p. " + t(pagina) : "");
  }
  function plural(n, um, varios) { return n + " " + (n === 1 ? um : varios); }
  /* textos do motor começam em minúscula (servem para tela); no memorial, frase nova começa em maiúscula */
  function cap(s) { s = String(s == null ? "" : s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function low(s) { s = String(s == null ? "" : s); return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  var NOME_GRUPO = { pilar: "Pilares", viga: "Vigas de cobertura", tapamento: "Colunas de tapamento", contravento: "Contraventamento" };
  var PAPEL = { pilar: "pilar", viga: "viga de cobertura", tapamento: "coluna de tapamento" };

  /* ⚠ padrões de AcoModelo.cargas() (js/acomodelo.js) — usados só quando o parâmetro não veio no r.parametros.cargas */
  var PADRAO_CARGAS = { telhaPeso: 0.05, permanenteExtra: 0.10, tercaMassa: 6, travessaMassa: 5, fechamentoPeso: 0.06 };

  /* vigência das normas — catálogo da ABNT conferido em 12/10/2026 (vigencia.json da biblioteca técnica) */
  var NORMAS_CONFERIDAS = "12/10/2026";
  var NORMAS = [
    { id: "NBR 8800", titulo: "Projeto de estruturas de aço e de estruturas mistas de aço e concreto de edificações", vigente: "2024 (versão corrigida 2025)",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/5222/nbr8800-projeto-de-estruturas-de-aco-e-de-estruturas-mistas-de-aco-e-concreto-de-edificios" },
    { id: "NBR 8681", titulo: "Ações e segurança nas estruturas", vigente: "2025",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/5835/abnt-nbr8681-acoes-e-seguranca-nas-estruturas" },
    { id: "NBR 6120", titulo: "Ações para o cálculo de estruturas de edificações", vigente: "2019 (versão corrigida 2019)",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/5215/abnt-nbr6120-acoes-para-o-calculo-de-estruturas-de-edificacoes" },
    { id: "NBR 6123", titulo: "Forças devidas ao vento em edificações", vigente: "2023 (versão corrigida 2025)",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/5616/nbr6123-forcas-devidas-ao-vento-em-edificacoes" },
    { id: "NBR 14762", titulo: "Dimensionamento de estruturas de aço constituídas por perfis formados a frio", vigente: "2010",
      url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/21648/abnt-nbr14762-dimensionamento-de-estruturas-de-aco-constituidas-por-perfis-formados-a-frio" },
    { id: "NBR 6122", titulo: "Projeto e execução de fundações", vigente: "2022",
      url: "https://normas.com.br/visualizar/abnt-nbr-nm/5248/abnt-nbr6122-projeto-e-execucao-de-fundacoes" }
  ];

  var SECOES = [
    { id: "objeto", titulo: "Objeto e descrição da estrutura" },
    { id: "normas", titulo: "Normas e documentos de referência" },
    { id: "materiais", titulo: "Materiais" },
    { id: "acoes", titulo: "Ações" },
    { id: "combinacoes", titulo: "Combinações de ações" },
    { id: "modelo", titulo: "Modelo de cálculo e análise estrutural" },
    { id: "validacao", titulo: "Método de cálculo e validação do programa" },
    { id: "esforcos", titulo: "Esforços e deslocamentos" },
    { id: "dimensionamento", titulo: "Dimensionamento das barras" },
    { id: "servico", titulo: "Estados-limites de serviço" },
    { id: "contraventamento", titulo: "Contraventamento" },
    { id: "reacoes", titulo: "Reações na fundação" },
    { id: "pesos", titulo: "Lista de materiais e peso" },
    { id: "avisos", titulo: "Premissas, responsabilidades e observações" },
    { id: "referencias", titulo: "Referências e links" },
    { id: "termo", titulo: "Termo de responsabilidade" }
  ];
  /* número de uma seção pelo id — o texto nunca leva número fixo (uma seção nova renumera as outras) */
  function S(id) { for (var i = 0; i < SECOES.length; i++) if (SECOES[i].id === id) return i + 1; return "—"; }
  function secao(id) { return "seção " + S(id); }

  /* ⚠ VALIDAÇÃO DO PROGRAMA — números das conferências do repositório. O tools/test-aco-memorial.js roda as
     conferências (tools/test-aco-exemplos.js, test-aco-secao.js, test-aco-fsm.js, test-aco-vento.js), lê a fixture
     do PyNite e reprova se algum número daqui divergir: motor mudou → refazer as conferências e atualizar aqui.
     (O mapa de isopletas não está aqui: a precisão vem do próprio js/acoisopletas.js, MEDIDAS e PRECISAO_KM.) */
  var VALIDACAO = {
    pynite: { casos: 4, primeira: { desloc: 3.4e-13, reacao: 1.6e-13, N: 2.5e-13, Mz: 0.0039 }, segunda: { desloc: 0.0028, reacao: 0.0012, N: 0.0010, Mz: 0.0072 } },
    secao: { perfisW: 283, A: 0.82, Ix: 1.71, Iy: 1.76, Zx: 1.02, Zy: 1.36, Cw: 2.21, J: 5.61, tubos: 388, tubosMax: 1.64,
             frio: { secoes: 7, A: 0.01, I: 0.06, Cw: 0.14, J: 0.42, centro: 0.01 } },
    exemplos: { exemplos: 51, rodaram: 47, verificacoes: 413, conferem: 413 },
    fsm: { curvas: 9, desvio: 5.0e-5, publicados: 7, local: 1.17, distorcional: [-3.1, -0.6] },
    vento: { tabela2: 330, tabela4: 54, anexoD: 4 }
  };
  /* γf da NBR 8800:2024 (Tabela 1) por categoria do js/acocargas.js — docs/metalica/gabarito-normas.md, 2.2 (Gerdau,
     Vanin e Chamberlain 10/10/2024; UFAL 2026). Serve para mostrar, na seção de combinações, que os coeficientes
     usados (Tabela 1 de 2008) são iguais ou maiores que os da revisão de 2024. */
  var GAMA_2024 = { "G-metalica": 1.25, "G-premoldada": 1.30, "G-industrializado": 1.30, "G-insitu": 1.40, "G-geral": 1.50, "W": 1.40, "Q": 1.50, "Q-cobertura": 1.50, "Q-temperatura": 1.20, "Q-truncada": 1.20 };

  /* ================================================================ DOCUMENTO */
  function Doc() { this.nFig = 0; this.nTab = 0; this.avisos = []; }
  Doc.prototype.fig = function (conteudo, legenda, classe) {
    if (!conteudo) return "";
    this.nFig++;
    return '<figure class="fig' + (classe ? " " + classe : "") + '" id="fig' + this.nFig + '">' + conteudo +
      "<figcaption><b>Figura " + this.nFig + "</b> — " + legenda + "</figcaption></figure>";
  };
  Doc.prototype.tab = function (legenda, cab, linhas, op) {
    op = op || {};
    if (!linhas || !linhas.length) return op.vazio ? '<p class="nota">' + op.vazio + "</p>" : "";
    this.nTab++;
    var h = '<table class="t' + (op.classe ? " " + op.classe : "") + '"' + (op.attrs || "") + "><caption><b>Tabela " + this.nTab + "</b> — " + legenda + "</caption>";
    if (cab) h += "<thead>" + (typeof cab === "string" ? cab : "<tr>" + cab.map(function (c) { return typeof c === "string" ? "<th>" + c + "</th>" : "<th" + (c.c ? ' class="' + c.c + '"' : "") + (c.a || "") + ">" + c.t + "</th>"; }).join("") + "</tr>") + "</thead>";
    h += "<tbody>" + linhas.join("") + "</tbody></table>";
    if (op.nota) h += '<p class="nota">' + op.nota + "</p>";
    return h;
  };
  Doc.prototype.aviso = function (texto) { if (this.avisos.indexOf(texto) < 0) this.avisos.push(texto); };
  function td(h, cls, a) { return "<td" + (cls ? ' class="' + cls + '"' : "") + (a || "") + ">" + (h == null ? "" : h) + "</td>"; }
  /* célula numérica (à direita, sem quebra). ⚠ Texto longo numa célula sem quebra alarga a tabela além da folha, e o
     Chromium então ENCOLHE O DOCUMENTO INTEIRO para caber (aconteceu com a memória do vento): passou de 26 caracteres
     visíveis, a célula continua à direita mas pode quebrar linha. */
  function tn(h, a) { var vis = String(h == null ? "" : h).replace(/<[^>]*>/g, ""); return td(h, vis.length > 26 ? "r" : "n", a); }
  function trw(cells, cls) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + ">" + cells.join("") + "</tr>"; }
  function thn(tx) { return { t: tx, c: "n" }; }
  function h3(n, tx) { return "<h3>" + n + " " + tx + "</h3>"; }
  function h4(tx) { return "<h4>" + tx + "</h4>"; }
  function caixa(h, alerta) { return '<div class="caixa' + (alerta ? " alerta" : "") + '">' + h + "</div>"; }
  function situacao(ok) { return ok ? '<span class="ok">atende</span>' : '<span class="falha">não atende</span>'; }

  /* ================================================================ CONTEXTO */
  function contexto(r, op) {
    var G = obj(r.modelo), M = obj(G.modelo);
    var c = { r: r, op: op, G: G, L: obj(G.layout), M: M, par: obj(G.par), parE: obj(r.parametros) };
    c.nos = {}; objs(M.nos).forEach(function (n) { c.nos[n.id] = n; });
    c.barras = {}; objs(M.barras).forEach(function (b) { c.barras[b.id] = b; });
    c.membros = objs(G.membros);
    c.mem = {}; c.segMem = {};
    c.membros.forEach(function (m) { c.mem[m.id] = m; arr(m.segs).forEach(function (s) { c.segMem[s] = m; }); });
    c.res = obj(r.membros);
    c.combs = objs(r.combinacoes);
    c.comb = {}; c.combs.forEach(function (k) { c.comb[k.id] = k; });
    c.elu = c.combs.filter(function (k) { return k.tipo === "ELU"; });
    c.els = c.combs.filter(function (k) { return k.tipo !== "ELU"; });
    c.casos = objs(r.casos).length ? objs(r.casos) : objs(M.casos);
    c.caso = {}; c.casos.forEach(function (k) { c.caso[k.id] = k; });
    c.an = obj(obj(r.analise).combinacoes);
    c.vento = ventoDe(r, op);
    c.iso = Object.prototype.hasOwnProperty.call(op, "isopletas") ? op.isopletas : dep("AcoIsopletas", "./acoisopletas.js");
    c.Mat = dep("AcoMateriais", "./acomateriais.js");
    c.Car = dep("AcoCargas", "./acocargas.js");
    c.Ana = dep("AcoAnalise", "./acoanalise.js");
    c.eixos = eixos(c);
    var ob = obj(op.obra);
    c.obraNome = String(ob.nome || "").trim() || ("Galpão " + br(num(c.L.vao, NaN), 2) + " × " + br(num(c.L.Lt, NaN), 2) + " m");
    c.rev = String(op.revisao || "R00").trim() || "R00";
    c.data = dataTxt(op.data);
    return c;
  }
  function ventoDe(r, op) {
    var v = r.vento && typeof r.vento === "object" ? r.vento : (op.vento && typeof op.vento === "object" ? op.vento : null);
    if (!v) return null;
    if (!fin(v.v0) && !arr(v.memoria).length && !arr(v.casos).length) return null;   /* não é um resultado do AcoVento */
    return v;
  }
  function letra(i) { var s = ""; i = i + 1; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  /* eixos de projeto: letras nas posições x das bases (pilares e colunas de tapamento), números nos pórticos */
  function eixos(c) {
    var xs = [], zs = [];
    function add(lista, v) { if (!fin(v)) return; for (var i = 0; i < lista.length; i++) if (Math.abs(lista[i] - v) < 1e-3) return; lista.push(v); }
    objs(c.M.apoios).forEach(function (a) { var n = c.nos[a.no]; if (n) { add(xs, n.x); add(zs, n.z); } });
    arr(c.L.zs).forEach(function (z) { add(zs, num(z, NaN)); });
    if (!xs.length && fin(num(c.L.vao, NaN))) { xs = [0, num(c.L.vao, 0)]; }
    xs.sort(function (a, b) { return a - b; }); zs.sort(function (a, b) { return a - b; });
    function idx(lista, v) { for (var i = 0; i < lista.length; i++) if (Math.abs(lista[i] - v) < 1e-3) return i; return -1; }
    return {
      xs: xs, zs: zs,
      letra: function (x) { var i = idx(xs, x); return i < 0 ? "—" : letra(i); },
      numero: function (z) { var i = idx(zs, z); return i < 0 ? "—" : String(i + 1); },
      rotulo: function (noId) { var n = c.nos[noId]; if (!n) return String(noId); var a = idx(xs, n.x), b = idx(zs, n.z); return (a < 0 || b < 0) ? String(noId) : letra(a) + (b + 1); }
    };
  }
  function faceTxt(c, f) {
    var E = c.eixos, ul = E.xs.length ? letra(E.xs.length - 1) : "—", un2 = E.zs.length ? String(E.zs.length) : "—";
    return { esquerda: "lateral esquerda (eixo A)", direita: "lateral direita (eixo " + ul + ")", frente: "oitão da frente (eixo 1)", fundo: "oitão do fundo (eixo " + un2 + ")", cobertura: "cobertura" }[f] || f;
  }
  function dirTxt(c, d) {
    var m = { 0: "frente", 90: "esquerda", 180: "fundo", 270: "direita" }[num(d, -1)];
    return br(num(d, NaN), 0) + "°" + (m ? " (incide " + (m === "frente" || m === "fundo" ? "no " : "na ") + faceTxt(c, m) + ")" : "");
  }
  function membroDaBase(c, noId) { for (var i = 0; i < c.membros.length; i++) if (arr(c.membros[i].nos)[0] === noId) return c.membros[i]; return null; }
  function posicao(c, m) {
    if (!m) return "—";
    if (m.papel === "viga") return "pórtico " + (num(m.k, 0) + 1) + ", água " + (/R$/.test(m.id) ? "direita" : "esquerda");
    return c.eixos.rotulo(arr(m.nos)[0]);
  }
  function compBarra(c, b) { var a = c.nos[b.i], d = c.nos[b.j]; if (!a || !d) return NaN; return Math.sqrt(Math.pow(d.x - a.x, 2) + Math.pow(d.y - a.y, 2) + Math.pow(d.z - a.z, 2)); }
  function faixaZ(c, k) { var zs = arr(c.L.zs).map(Number), n = zs.length; if (!n) return 0; var za = k > 0 ? (zs[k - 1] + zs[k]) / 2 : 0, zb = k < n - 1 ? (zs[k] + zs[k + 1]) / 2 : num(c.L.Lt, zs[n - 1]); return zb - za; }

  /* resultante das cargas aplicadas num caso (kN, eixos globais) — confere o equilíbrio com as reações */
  function somaCargas(c, caso) {
    var F = [0, 0, 0], ok = true, gam = c.Ana && fin(c.Ana.GAMMA_ACO) ? c.Ana.GAMMA_ACO : 78.5, pp = 0;
    arr(caso && caso.cargas).forEach(function (q) {
      if (!q || typeof q !== "object") { ok = false; return; }
      if (q.tipo === "no") { var f = arr(q.F); for (var k = 0; k < 3; k++) F[k] += num(f[k], 0); }
      else if (q.tipo === "barra") {
        var b = c.barras[q.barra]; if (!b || q.sistema === "local") { ok = false; return; }
        var Lb = compBarra(c, b); if (!fin(Lb)) { ok = false; return; }
        var a0 = Math.max(0, Math.min(1, num(q.a, 0))), a1 = Math.max(0, Math.min(1, num(q.b, 1))), qa = arr(q.q), qb = arr(q.q2).length ? arr(q.q2) : qa, fh = 1;
        if (q.projetada) { var ni = c.nos[b.i], nj = c.nos[b.j]; fh = Math.sqrt(Math.pow(nj.x - ni.x, 2) + Math.pow(nj.z - ni.z, 2)) / Lb; }
        for (var k2 = 0; k2 < 3; k2++) F[k2] += (num(qa[k2], 0) + num(qb[k2], 0)) / 2 * Lb * (a1 - a0) * fh;
      } else if (q.tipo === "pesoProprio") {
        (q.barras ? arr(q.barras) : Object.keys(c.barras)).forEach(function (id) {
          var b2 = c.barras[id]; if (!b2) { ok = false; return; }
          var A = num(obj(b2.secao).A, NaN), L2 = compBarra(c, b2); if (!fin(A) || !fin(L2)) { ok = false; return; }
          var w = num(b2.pesoEsp, gam) * A * L2 * num(q.fator, 1); F[1] -= w; pp += w;
        });
      } else ok = false;
    });
    return { F: F, completo: ok && arr(caso && caso.cargas).length > 0, pesoProprio: pp };
  }
  function somaReacoes(c, casoId) {
    var R = [0, 0, 0, 0, 0, 0], n = 0;
    Object.keys(obj(c.r.reacoes)).forEach(function (b) { var v = obj(obj(c.r.reacoes[b]).porCaso)[casoId]; if (Array.isArray(v)) { n++; for (var k = 0; k < 6; k++) R[k] += num(v[k], 0); } });
    return { R: R, n: n };
  }
  var COMP = ["Fx", "Fy", "Fz", "Mx", "My", "Mz"];
  /* envoltória ELU de uma base, com a combinação de cada extremo (o r.reacoes.envELU parte de zero) */
  function envelope(c, base) {
    var e = {}, achou = false;
    COMP.forEach(function (k) { e[k] = { min: Infinity, max: -Infinity, cmin: null, cmax: null }; });
    c.elu.forEach(function (k) {
      var cb = c.an[k.id]; if (!cb || typeof cb !== "object" || !cb.reacoes) return;
      var v = cb.reacoes[base]; if (!Array.isArray(v)) return;
      achou = true;
      COMP.forEach(function (nome, i) { var x = num(v[i], NaN); if (!fin(x)) return; var o = e[nome]; if (x < o.min) { o.min = x; o.cmin = k.id; } if (x > o.max) { o.max = x; o.cmax = k.id; } });
    });
    if (achou) return e;
    var env = obj(obj(c.r.reacoes[base]).envELU);   /* sem as combinações (resultado enxuto): o envELU do motor */
    COMP.forEach(function (k) { var p = arr(env[k]); if (p.length === 2) { e[k].min = num(p[0], Infinity); e[k].max = num(p[1], -Infinity); } });
    return e;
  }
  function estacoes(c, combId, segId) { var cb = c.an[combId]; if (!cb || typeof cb !== "object" || !cb.barras) return []; var b = cb.barras[segId]; return b && !b.inativa ? objs(b.estacoes) : []; }
  function eixoLocal(c, b) {
    var ni = c.nos[b.i], nj = c.nos[b.j]; if (!ni || !nj) return null;
    var ex = [nj.x - ni.x, nj.y - ni.y, nj.z - ni.z], L = Math.sqrt(ex[0] * ex[0] + ex[1] * ex[1] + ex[2] * ex[2]); if (!(L > 0)) return null;
    ex = [ex[0] / L, ex[1] / L, ex[2] / L];
    var vy = arr(b.vy).length === 3 ? b.vy.map(Number) : [0, 1, 0], p = vy[0] * ex[0] + vy[1] * ex[1] + vy[2] * ex[2];
    var y = [vy[0] - p * ex[0], vy[1] - p * ex[1], vy[2] - p * ex[2]], ly = Math.sqrt(y[0] * y[0] + y[1] * y[1] + y[2] * y[2]);
    if (!(ly > 1e-9)) return null;
    return { ni: ni, nj: nj, L: L, ex: ex, ey: [y[0] / ly, y[1] / ly, y[2] / ly] };
  }
  function combNome(c, id) { var k = c.comb[id]; return k ? esc(id) + " (" + t(k.descricao || k.nome, "combinação " + id) + ")" : esc(id || "—"); }
  /* membro de maior aproveitamento ELU de um grupo */
  function governaGrupo(c, g) {
    var best = null;
    c.membros.forEach(function (m) { if (m.grupo !== g) return; var v = c.res[m.id]; if (!v || !fin(v.razao)) return; if (!best || v.razao > c.res[best].razao) best = m.id; });
    return best;
  }

  /* ================================================================ SVG */
  function svgAbre(w, h, titulo) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(w) + " " + f1(h) + '" width="' + f1(w) + '" height="' + f1(h) +
      '" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="9" fill="#1d2733" role="img"><title>' + esc(titulo) + "</title>";
  }
  var HALO = ' stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"';
  function ln(x1, y1, x2, y2, a) { return '<line x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '"' + (a ? " " + a : "") + "/>"; }
  function tx(x, y, s, a) { return '<text x="' + f1(x) + '" y="' + f1(y) + '"' + (a ? " " + a : "") + ">" + esc(s) + "</text>"; }
  function pontos(lista) { return lista.map(function (p) { return f1(p[0]) + "," + f1(p[1]); }).join(" "); }
  function poly(lista, a) { return '<polyline points="' + pontos(lista) + '"' + (a ? " " + a : "") + "/>"; }
  function polig(lista, a) { return '<polygon points="' + pontos(lista) + '"' + (a ? " " + a : "") + "/>"; }
  function bolha(x, y, s) { return '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="8.5" fill="#ffffff" stroke="#1d2733" stroke-width="0.8"/>' + tx(x, y + 3.2, s, 'text-anchor="middle" font-size="8.5" font-weight="600"'); }
  /* cota horizontal: linha, extensões e traços a 45° */
  function cotaH(x1, x2, y, s, yRef) {
    var o = ln(x1, y, x2, y, 'stroke="#5b6774" stroke-width="0.6"');
    if (yRef != null) { o += ln(x1, yRef, x1, y + 3, 'stroke="#9aa6b2" stroke-width="0.4"') + ln(x2, yRef, x2, y + 3, 'stroke="#9aa6b2" stroke-width="0.4"'); }
    o += ln(x1 - 2.5, y + 2.5, x1 + 2.5, y - 2.5, 'stroke="#1d2733" stroke-width="0.8"') + ln(x2 - 2.5, y + 2.5, x2 + 2.5, y - 2.5, 'stroke="#1d2733" stroke-width="0.8"');
    return o + tx((x1 + x2) / 2, y - 3, s, 'text-anchor="middle" font-size="8"');
  }
  function cotaV(x, y1, y2, s, xRef) {
    var o = ln(x, y1, x, y2, 'stroke="#5b6774" stroke-width="0.6"');
    if (xRef != null) { o += ln(xRef, y1, x + 3, y1, 'stroke="#9aa6b2" stroke-width="0.4"') + ln(xRef, y2, x + 3, y2, 'stroke="#9aa6b2" stroke-width="0.4"'); }
    o += ln(x - 2.5, y1 + 2.5, x + 2.5, y1 - 2.5, 'stroke="#1d2733" stroke-width="0.8"') + ln(x - 2.5, y2 + 2.5, x + 2.5, y2 - 2.5, 'stroke="#1d2733" stroke-width="0.8"');
    var ym = (y1 + y2) / 2;
    return o + '<text x="' + f1(x - 3) + '" y="' + f1(ym) + '" text-anchor="middle" font-size="8" transform="rotate(-90 ' + f1(x - 3) + " " + f1(ym) + ')">' + esc(s) + "</text>";
  }
  /* perfil I em planta: alma ao longo de x do galpão (pilar de pórtico) ou girada (coluna de tapamento) */
  function simboloI(cx, cy, girado) {
    var h = 5, b = 4.2, d;
    if (girado) d = "M" + f1(cx - h) + " " + f1(cy - b) + "V" + f1(cy + b) + "M" + f1(cx + h) + " " + f1(cy - b) + "V" + f1(cy + b) + "M" + f1(cx - h) + " " + f1(cy) + "H" + f1(cx + h);
    else d = "M" + f1(cx - b) + " " + f1(cy - h) + "H" + f1(cx + b) + "M" + f1(cx - b) + " " + f1(cy + h) + "H" + f1(cx + b) + "M" + f1(cx) + " " + f1(cy - h) + "V" + f1(cy + h);
    return '<path d="' + d + '" fill="none" stroke="#1d2733" stroke-width="1.8"/>';
  }

  /* ---------- planta de locação (Z na horizontal, X na vertical: eixo A em cima) */
  function svgPlanta(c, op) {
    op = op || {};
    var L = c.L, vao = num(L.vao, NaN), Lt = num(L.Lt, NaN); if (!(vao > 0 && Lt > 0)) return "";
    var E = c.eixos, W = 640, ml = 52, mr = 70, mt = 50, mb = op.rotulos ? 40 : 62;
    var s = Math.min((W - ml - mr) / Lt, 230 / vao), Hh = mt + vao * s + mb;
    function X(z) { return ml + z * s; } function Y(x) { return mt + x * s; }
    var o = [svgAbre(W, Hh, op.titulo || "Planta de locação dos pilares e eixos")];
    o.push('<rect x="' + f1(X(0)) + '" y="' + f1(Y(0)) + '" width="' + f1(Lt * s) + '" height="' + f1(vao * s) + '" fill="#f6f8fa" stroke="#9aa6b2" stroke-width="0.6"/>');
    if (num(L.aguas, 2) === 2) {
      var zm = E.zs.length > 1 ? (E.zs[Math.floor((E.zs.length - 1) / 2)] + E.zs[Math.floor((E.zs.length - 1) / 2) + 1]) / 2 : Lt / 2;   /* entre dois eixos, longe dos pilares */
      o.push(ln(X(0), Y(vao / 2), X(Lt), Y(vao / 2), 'stroke="#9aa6b2" stroke-width="0.5" stroke-dasharray="10 3 2 3"') + tx(X(zm), Y(vao / 2) - 3, "cumeeira", 'text-anchor="middle" font-size="7.5" fill="#5b6774"' + HALO));
    }
    E.zs.forEach(function (z, k) { o.push(ln(X(z), Y(0) - 22, X(z), Y(vao) + (op.rotulos ? 14 : 8), 'stroke="#8a97a6" stroke-width="0.5" stroke-dasharray="7 3 1.5 3"')); o.push(bolha(X(z), Y(0) - 31, String(k + 1))); });
    E.xs.forEach(function (x, i) { o.push(ln(X(0) - 22, Y(x), X(Lt) + 8, Y(x), 'stroke="#8a97a6" stroke-width="0.5" stroke-dasharray="7 3 1.5 3"')); o.push(bolha(X(0) - 31, Y(x), letra(i))); });
    objs(c.M.apoios).forEach(function (a) {
      var n = c.nos[a.no]; if (!n) return;
      var m = membroDaBase(c, a.no);
      o.push(simboloI(X(n.z), Y(n.x), m && m.papel === "tapamento"));
      if (op.rotulos) o.push(tx(X(n.z) + 6, Y(n.x) + (n.x > vao / 2 ? 13 : -7), E.rotulo(a.no), 'font-size="7.5" font-weight="600" fill="#2d6a9c"' + HALO));
    });
    if (!op.rotulos) {
      var yc = Y(vao) + 24;
      for (var k = 0; k + 1 < E.zs.length; k++) o.push(cotaH(X(E.zs[k]), X(E.zs[k + 1]), yc, br(E.zs[k + 1] - E.zs[k], 2)));
      o.push(cotaH(X(0), X(Lt), yc + 20, br(Lt, 2) + " m"));
      var xc = X(Lt) + 26;
      for (var i = 0; i + 1 < E.xs.length; i++) o.push(cotaV(xc, Y(E.xs[i]), Y(E.xs[i + 1]), br(E.xs[i + 1] - E.xs[i], 2)));
      o.push(cotaV(xc + 24, Y(0), Y(vao), br(vao, 2) + " m"));
    }
    o.push("</svg>");
    return o.join("");
  }

  /* ---------- cobertura: pórticos, terças, cumeeira e contraventamento */
  function svgCobertura(c) {
    var L = c.L, vao = num(L.vao, NaN), Lt = num(L.Lt, NaN), H = num(L.H, NaN); if (!(vao > 0 && Lt > 0)) return "";
    var E = c.eixos, W = 640, ml = 52, mr = 24, mt = 46, mb = 34, s = Math.min((W - ml - mr) / Lt, 230 / vao), Hh = mt + vao * s + mb;
    function X(z) { return ml + z * s; } function Y(x) { return mt + x * s; }
    var o = [svgAbre(W, Hh, "Planta da cobertura: terças e contraventamento")];
    o.push('<rect x="' + f1(X(0)) + '" y="' + f1(Y(0)) + '" width="' + f1(Lt * s) + '" height="' + f1(vao * s) + '" fill="#ffffff" stroke="#1d2733" stroke-width="0.8"/>');
    objs(c.G.linhasTerca).forEach(function (lt) { var x = num(lt.x, NaN); if (fin(x)) o.push(ln(X(0), Y(x), X(Lt), Y(x), 'stroke="#9aa6b2" stroke-width="0.6"')); });
    E.zs.forEach(function (z, k) { o.push(ln(X(z), Y(0), X(z), Y(vao), 'stroke="#1d2733" stroke-width="1.6"')); o.push(bolha(X(z), Y(0) - 26, String(k + 1))); });
    E.xs.forEach(function (x, i) { if (Math.abs(x) < 1e-6 || Math.abs(x - vao) < 1e-6) o.push(bolha(X(0) - 26, Y(x), letra(i))); });
    objs(c.M.barras).forEach(function (b) {
      if (b.papel !== "contravento") return;
      var ni = c.nos[b.i], nj = c.nos[b.j]; if (!ni || !nj || !fin(H)) return;
      if (ni.y < H - 1e-3 || nj.y < H - 1e-3) return;   /* só as diagonais da cobertura */
      o.push(ln(X(ni.z), Y(ni.x), X(nj.z), Y(nj.x), 'stroke="#2d6a9c" stroke-width="1.1"'));
    });
    if (num(L.aguas, 2) === 2) o.push(ln(X(0), Y(vao / 2), X(Lt), Y(vao / 2), 'stroke="#5b6774" stroke-width="0.6" stroke-dasharray="10 3 2 3"'));
    var yl = Y(vao) + 18;
    o.push(ln(X(0), yl, X(0) + 22, yl, 'stroke="#1d2733" stroke-width="1.6"') + tx(X(0) + 26, yl + 3, "viga do pórtico", 'font-size="8"'));
    o.push(ln(X(0) + 110, yl, X(0) + 132, yl, 'stroke="#9aa6b2" stroke-width="0.6"') + tx(X(0) + 136, yl + 3, "linha de terça", 'font-size="8"'));
    o.push(ln(X(0) + 210, yl, X(0) + 232, yl, 'stroke="#2d6a9c" stroke-width="1.1"') + tx(X(0) + 236, yl + 3, "contraventamento (barra redonda, só tração)", 'font-size="8"'));
    o.push("</svg>");
    return o.join("");
  }

  /* ---------- parede lateral (x = 0): pilares, travessas e X das paredes */
  function svgLateral(c) {
    var L = c.L, Lt = num(L.Lt, NaN), H = num(L.H, NaN); if (!(Lt > 0 && H > 0)) return "";
    var E = c.eixos, W = 640, ml = 40, mr = 40, mt = 18, mb = 46, s = Math.min((W - ml - mr) / Lt, 150 / H), Hh = mt + H * s + mb;
    function X(z) { return ml + z * s; } function Y(y) { return mt + (H - y) * s; }
    var o = [svgAbre(W, Hh, "Elevação da lateral esquerda (eixo A): travessas e contraventamento")];
    arr(L.travE).forEach(function (y) { o.push(ln(X(0), Y(y), X(Lt), Y(y), 'stroke="#9aa6b2" stroke-width="0.7"')); });
    o.push(ln(X(0), Y(H), X(Lt), Y(H), 'stroke="#1d2733" stroke-width="1.2"'));
    o.push(ln(X(0) - 10, Y(0), X(Lt) + 10, Y(0), 'stroke="#5b6774" stroke-width="0.6"'));
    objs(c.M.barras).forEach(function (b) {
      if (b.papel !== "contravento") return;
      var ni = c.nos[b.i], nj = c.nos[b.j]; if (!ni || !nj) return;
      if (Math.abs(ni.x) > 1e-3 || Math.abs(nj.x) > 1e-3) return;
      o.push(ln(X(ni.z), Y(ni.y), X(nj.z), Y(nj.y), 'stroke="#2d6a9c" stroke-width="1.1"'));
    });
    E.zs.forEach(function (z, k) {
      o.push(ln(X(z), Y(0), X(z), Y(H), 'stroke="#1d2733" stroke-width="2"'));
      o.push(polig([[X(z), Y(0)], [X(z) - 4, Y(0) + 6], [X(z) + 4, Y(0) + 6]], 'fill="none" stroke="#1d2733" stroke-width="0.8"'));
      o.push(bolha(X(z), Y(0) + 20, String(k + 1)));
    });
    o.push(cotaV(X(0) - 18, Y(0), Y(H), br(H, 2) + " m"));
    o.push("</svg>");
    return o.join("");
  }

  /* ---------- pórtico (plano XY) — transformação comum */
  function quadroPortico(c, k, W, Hp, mlx) {
    var mems = c.membros.filter(function (m) { return m.k === k && (m.papel === "pilar" || m.papel === "viga"); });
    function ord(m) { return m.papel === "pilar" ? (m.lado ? 3 : 0) : (/R$/.test(m.id) ? 2 : 1); }
    mems.sort(function (a, b) { return ord(a) - ord(b); });
    var xs = [], ys = [];
    mems.forEach(function (m) { arr(m.nos).forEach(function (id) { var n = c.nos[id]; if (n) { xs.push(n.x); ys.push(n.y); } }); });
    if (!xs.length) return null;
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var ml = mlx == null ? 50 : mlx, s = Math.min((W - 2 * ml) / Math.max(1e-6, x1 - x0), Hp / Math.max(1e-6, y1 - y0));
    var ox = (W - (x1 - x0) * s) / 2 - x0 * s;
    return { mems: mems, x0: x0, x1: x1, y0: y0, y1: y1, s: s, P: function (x, y, oy) { return [ox + x * s, oy + (y1 - y) * s]; } };
  }
  function desenhaQuadro(c, Q, oy, a) {
    var o = "";
    Q.mems.forEach(function (m) { var p = arr(m.nos).map(function (id) { return c.nos[id]; }).filter(Boolean).map(function (n) { return Q.P(n.x, n.y, oy); }); if (p.length > 1) o += poly(p, 'fill="none" ' + a); });
    return o;
  }
  function apoiosQuadro(c, Q, oy, engaste) {
    var o = "";
    Q.mems.forEach(function (m) {
      if (m.papel !== "pilar") return; var n = c.nos[arr(m.nos)[0]]; if (!n) return; var p = Q.P(n.x, n.y, oy);
      if (engaste) o += '<rect x="' + f1(p[0] - 7) + '" y="' + f1(p[1]) + '" width="14" height="4" fill="#9aa6b2"/>';
      else o += polig([[p[0], p[1]], [p[0] - 5.5, p[1] + 8], [p[0] + 5.5, p[1] + 8]], 'fill="#ffffff" stroke="#1d2733" stroke-width="0.9"');
    });
    return o;
  }

  /* ---------- elevação do pórtico típico, cotada */
  function svgPortico(c, k) {
    var W = 640, Q = quadroPortico(c, k, W, 230, 70); if (!Q) return "";
    var L = c.L, oy = 24, o = [svgAbre(W, 24 + (Q.y1 - Q.y0) * Q.s + 86, "Elevação do pórtico do eixo " + (k + 1))];
    var engaste = obj(c.par.geometria).base === "engastada";
    o.push(ln(Q.P(Q.x0, 0, oy)[0] - 30, Q.P(0, 0, oy)[1] + 9, Q.P(Q.x1, 0, oy)[0] + 30, Q.P(0, 0, oy)[1] + 9, 'stroke="#9aa6b2" stroke-width="0.6"'));
    o.push(desenhaQuadro(c, Q, oy, 'stroke="#1d2733" stroke-width="3" stroke-linejoin="round"'));
    o.push(apoiosQuadro(c, Q, oy, engaste));
    /* terças (em cima das vigas) e travessas (por fora dos pilares) */
    Q.mems.forEach(function (m) {
      var tr = obj(m.travamentos), ni = c.nos[arr(m.nos)[0]], nf = c.nos[arr(m.nos)[arr(m.nos).length - 1]]; if (!ni || !nf) return;
      var Lm = num(m.L, 0), dx = (nf.x - ni.x) / Lm, dy = (nf.y - ni.y) / Lm;
      if (m.papel === "viga") {
        arr(tr.mais).forEach(function (s) { var p = Q.P(ni.x + dx * s, ni.y + dy * s, oy); o.push('<rect x="' + f1(p[0] - 2.5) + '" y="' + f1(p[1] - 7) + '" width="5" height="5" fill="#5b6774"/>'); });
        arr(m.maosFrancesas).forEach(function (s) { var p = Q.P(ni.x + dx * s, ni.y + dy * s, oy); o.push(ln(p[0] - 5, p[1] + 9, p[0] + 2, p[1] + 2, 'stroke="#2d6a9c" stroke-width="1.3"')); });
      } else {
        var fora = m.lado ? 1 : -1;
        arr(tr.menos).forEach(function (s) { var p = Q.P(ni.x, ni.y + s, oy); o.push('<rect x="' + f1(p[0] + fora * 4 - 2.5) + '" y="' + f1(p[1] - 2.5) + '" width="5" height="5" fill="#5b6774"/>'); });
        arr(m.maosFrancesas).forEach(function (s) { var p = Q.P(ni.x, ni.y + s, oy); o.push(ln(p[0] - fora * 2, p[1], p[0] - fora * 9, p[1] - 6, 'stroke="#2d6a9c" stroke-width="1.3"')); });
      }
    });
    /* rótulos dos perfis */
    Q.mems.forEach(function (m) {
      var ni = c.nos[arr(m.nos)[0]], nf = c.nos[arr(m.nos)[arr(m.nos).length - 1]]; if (!ni || !nf) return;
      var a = Q.P(ni.x, ni.y, oy), b = Q.P(nf.x, nf.y, oy), xm = (a[0] + b[0]) / 2, ym = (a[1] + b[1]) / 2, nome = obj(m.secao).nome || "";
      if (m.papel === "pilar") o.push('<text x="' + f1(xm + (m.lado ? -9 : 9)) + '" y="' + f1(ym) + '" font-size="8" text-anchor="middle" transform="rotate(-90 ' + f1(xm + (m.lado ? -9 : 9)) + " " + f1(ym) + ')">' + esc(nome) + "</text>");
      else { var ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180; o.push('<text x="' + f1(xm) + '" y="' + f1(ym + 21) + '" font-size="8" text-anchor="middle" transform="rotate(' + f1(ang) + " " + f1(xm) + " " + f1(ym + 21) + ')">' + esc(nome) + "</text>"); }
    });
    /* cotas: vão, pé-direito e cumeeira; inclinação */
    var base = Q.P(Q.x0, 0, oy)[1], H = num(L.H, NaN);
    o.push(cotaH(Q.P(Q.x0, 0, oy)[0], Q.P(Q.x1, 0, oy)[0], base + 30, "vão " + br(Q.x1 - Q.x0, 2) + " m", base + 12));
    if (fin(H)) o.push(cotaV(Q.P(Q.x0, 0, oy)[0] - 34, base, Q.P(Q.x0, H, oy)[1], "pé-direito " + br(H, 2) + " m", Q.P(Q.x0, 0, oy)[0] - 6));
    o.push(cotaV(Q.P(Q.x1, 0, oy)[0] + 38, base, Q.P(Q.x1, Q.y1, oy)[1], "cumeeira " + br(Q.y1, 2) + " m", Q.P(Q.x1, 0, oy)[0] + 6));
    var pi = Q.P(Q.x0 + (Q.x1 - Q.x0) * 0.22, (fin(H) ? H : Q.y1) + num(L.i, 0) * (Q.x1 - Q.x0) * 0.22, oy);
    o.push(tx(pi[0], pi[1] - 12, "i = " + br(num(L.i, NaN) * 100, 1) + " %", 'text-anchor="middle" font-size="8.5" font-style="italic"'));
    o.push(bolha(Q.P(Q.x0, 0, oy)[0], base + 52, c.eixos.letra(Q.x0)) + bolha(Q.P(Q.x1, 0, oy)[0], base + 52, c.eixos.letra(Q.x1)));
    var yl = base + 52;
    o.push('<rect x="' + f1(W / 2 - 150) + '" y="' + f1(yl - 4) + '" width="5" height="5" fill="#5b6774"/>' + tx(W / 2 - 142, yl + 1, "terça / travessa", 'font-size="8"'));
    o.push(ln(W / 2 - 40, yl + 3, W / 2 - 33, yl - 4, 'stroke="#2d6a9c" stroke-width="1.3"') + tx(W / 2 - 28, yl + 1, "mão-francesa", 'font-size="8"'));
    o.push((engaste ? '<rect x="' + f1(W / 2 + 54) + '" y="' + f1(yl - 2) + '" width="12" height="4" fill="#9aa6b2"/>' : polig([[W / 2 + 60, yl - 4], [W / 2 + 55.5, yl + 3], [W / 2 + 64.5, yl + 3]], 'fill="#ffffff" stroke="#1d2733" stroke-width="0.9"')) + tx(W / 2 + 70, yl + 1, engaste ? "base engastada" : "base rotulada", 'font-size="8"'));
    o.push("</svg>");
    return o.join("");
  }

  /* rótulos de um painel sem sobreposição (o segundo rótulo no mesmo lugar é descartado) */
  function Rotulos() { this.caixas = []; }
  Rotulos.prototype.livre = function (x, y, w) {
    for (var i = 0; i < this.caixas.length; i++) { var b = this.caixas[i]; if (Math.abs(b[0] - x) < (b[2] + w) / 2 + 3 && Math.abs(b[1] - y) < 10) return false; }
    this.caixas.push([x, y, w]); return true;
  };
  /* painéis empilhados: cada painel é desenhado com oy = 0 e guarda a faixa vertical que ocupa; aqui eles são
     transladados um abaixo do outro, com o título por cima — nada invade o painel vizinho */
  function empilha(W, paineis, titulo) {
    var y = 0, corpo = [];
    paineis.forEach(function (p) {
      if (!fin(p.ymin) || !fin(p.ymax)) { p.ymin = 0; p.ymax = 10; }
      if (p.titulo) corpo.push(tx(10, y + 13, p.titulo, 'font-size="9" font-weight="600"'));
      var dy = y + (p.titulo ? 28 : 8) - p.ymin;
      corpo.push('<g transform="translate(0 ' + f1(dy) + ')">' + p.o.join("") + "</g>");
      y = dy + p.ymax + 14;
    });
    return svgAbre(W, y, titulo) + corpo.join("") + "</svg>";
  }

  /* ---------- diagramas N, V e M de um pórtico numa combinação (3 painéis) */
  function svgEsforcos(c, k, combId) {
    var W = 640, Q = quadroPortico(c, k, W, 140, 74); if (!Q) return "";
    var tipos = [["N", "Esforço normal N (kN) — tração positiva", 1, "#2d6a9c", "#a3352b"], ["Vy", "Esforço cortante V (kN)", 1, "#5b6774", "#5b6774"], ["Mz", "Momento fletor M (kN·m) — desenhado do lado tracionado", -1, "#2d6a9c", "#2d6a9c"]];
    var paineis = [], temDado = false;
    tipos.forEach(function (tp) {
      var campo = tp[0], sgn = tp[2], maxA = 0, segs = [], o = [], P = { o: o, ymin: Infinity, ymax: -Infinity, titulo: tp[1] };
      function mk(p) { if (p[1] < P.ymin) P.ymin = p[1]; if (p[1] > P.ymax) P.ymax = p[1]; return p; }
      Q.mems.forEach(function (m) {
        arr(m.nos).forEach(function (id) { var n = c.nos[id]; if (n) mk(Q.P(n.x, n.y, 0)); });
        arr(m.segs).forEach(function (sid) {
          var b = c.barras[sid], ax = b && eixoLocal(c, b), est = estacoes(c, combId, sid);
          if (!ax || !est.length) return;
          segs.push({ m: m, ax: ax, est: est });
          est.forEach(function (e) { var v = num(e[campo], 0); if (Math.abs(v) > maxA) maxA = Math.abs(v); });
        });
      });
      paineis.push(P);
      o.push(desenhaQuadro(c, Q, 0, 'stroke="#9aa6b2" stroke-width="1.4"'));
      if (!segs.length) { o.push(tx(W / 2, 40, "sem estações de esforço nesta combinação", 'text-anchor="middle" fill="#a3352b"')); mk([0, 50]); return; }
      temDado = true;
      var e0 = maxA > 1e-9 ? 0.12 * (Q.x1 - Q.x0) / maxA : 0;
      function ponto(ax, x, v) { return mk(Q.P(ax.ni.x + ax.ex[0] * x + ax.ey[0] * sgn * v * e0, ax.ni.y + ax.ex[1] * x + ax.ey[1] * sgn * v * e0, 0)); }
      segs.forEach(function (sg) {
        var base = [], curva = [], soma = 0;
        sg.est.forEach(function (e) { var x = num(e.x, 0), v = num(e[campo], 0); soma += v; base.push(ponto(sg.ax, x, 0)); curva.push(ponto(sg.ax, x, v)); });
        var cor = soma >= 0 ? tp[3] : tp[4];
        o.push(polig(base.concat(curva.slice().reverse()), 'fill="' + cor + '" fill-opacity="0.16" stroke="none"'));
        o.push(poly(curva, 'fill="none" stroke="' + cor + '" stroke-width="1"'));
      });
      o.push(desenhaQuadro(c, Q, 0, 'stroke="#1d2733" stroke-width="1.6"'));
      /* rótulos: pontas de cada barra e o extremo interno (o maior primeiro, para ganhar a vaga) */
      var R = new Rotulos(), cand = [];
      Q.mems.forEach(function (m) {
        var pts = [];
        segs.filter(function (sg) { return sg.m === m; }).forEach(function (sg) { sg.est.forEach(function (e) { pts.push({ ax: sg.ax, x: num(e.x, 0), v: num(e[campo], 0) }); }); });
        if (!pts.length) return;
        var ext = pts[0];
        pts.forEach(function (q) { if (Math.abs(q.v) > Math.abs(ext.v)) ext = q; });
        cand.push(pts[0], pts[pts.length - 1]);
        if (Math.abs(ext.v) > 1.05 * Math.max(Math.abs(pts[0].v), Math.abs(pts[pts.length - 1].v)) + 1e-9) cand.push(ext);
      });
      cand.sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }).forEach(function (q) {
        if (Math.abs(q.v) < 0.01 * maxA) return;
        var pp = ponto(q.ax, q.x, q.v), dirN = q.v * sgn >= 0 ? 1 : -1, x = pp[0] + q.ax.ey[0] * dirN * 10, y = pp[1] - q.ax.ey[1] * dirN * 10 + 3, s = br(q.v, 1);
        if (!R.livre(x, y, s.length * 4.4)) return;
        o.push(tx(x, y, s, 'text-anchor="middle" font-size="7.5"' + HALO)); mk([x, y - 8]); mk([x, y + 3]);
      });
    });
    return temDado ? empilha(W, paineis, "Diagramas de esforços do pórtico do eixo " + (k + 1) + " — " + combId) : "";
  }

  /* ---------- deformada do pórtico numa combinação de serviço */
  function svgDeformada(c, k, combId) {
    var W = 640, Q = quadroPortico(c, k, W, 200, 90); if (!Q) return "";
    var cb = c.an[combId]; if (!cb || typeof cb !== "object") return "";
    var segs = [], maxU = 0;
    Q.mems.forEach(function (m) { arr(m.segs).forEach(function (sid) { var b = c.barras[sid], ax = b && eixoLocal(c, b), est = estacoes(c, combId, sid); if (ax && est.length) { segs.push({ ax: ax, est: est }); est.forEach(function (e) { var u = arr(e.u); var h = Math.sqrt(Math.pow(num(u[0], 0), 2) + Math.pow(num(u[1], 0), 2)); if (h > maxU) maxU = h; }); } }); });
    if (!segs.length || !(maxU > 0)) return "";
    var amp = 0.07 * (Q.x1 - Q.x0) / maxU, o = [], P = { o: o, ymin: Infinity, ymax: -Infinity, titulo: "" };
    function mk(p) { if (p[1] < P.ymin) P.ymin = p[1]; if (p[1] > P.ymax) P.ymax = p[1]; return p; }
    Q.mems.forEach(function (m) { arr(m.nos).forEach(function (id) { var n = c.nos[id]; if (n) mk(Q.P(n.x, n.y, 0)); }); });
    o.push(desenhaQuadro(c, Q, 0, 'stroke="#c9d2dc" stroke-width="1.6" stroke-dasharray="4 2"'));
    segs.forEach(function (sg) {
      var pts = sg.est.map(function (e) { var u = arr(e.u), x = num(e.x, 0); return mk(Q.P(sg.ax.ni.x + sg.ax.ex[0] * x + num(u[0], 0) * amp, sg.ax.ni.y + sg.ax.ex[1] * x + num(u[1], 0) * amp, 0)); });
      o.push(poly(pts, 'fill="none" stroke="#2d6a9c" stroke-width="2"'));
    });
    o.push(apoiosQuadro(c, Q, 0, obj(c.par.geometria).base === "engastada")); mk([0, (Q.y1 - Q.y0) * Q.s + 10]);
    var d = obj(cb.desloc);
    Q.mems.forEach(function (m) {
      if (m.papel !== "pilar") return;
      var id = arr(m.nos)[arr(m.nos).length - 1], n = c.nos[id], u = arr(d[id]); if (!n || !u.length) return;
      var p = Q.P(n.x + num(u[0], 0) * amp, n.y + num(u[1], 0) * amp, 0), x = p[0] + (m.lado ? -10 : 10), y = p[1] + 16;
      o.push(tx(x, y, "ux = " + br(num(u[0], NaN) * 1000, 1) + " mm", 'font-size="8" text-anchor="' + (m.lado ? "end" : "start") + '"' + HALO)); mk([x, y + 3]);
    });
    var topo = null; Q.mems.forEach(function (m) { if (m.papel !== "viga") return; arr(m.nos).forEach(function (id) { var n = c.nos[id]; if (n && (!topo || n.y > topo.y)) topo = n; }); });
    if (topo && arr(d[topo.id]).length) {
      var ut = arr(d[topo.id]), pt = Q.P(topo.x + num(ut[0], 0) * amp, topo.y + num(ut[1], 0) * amp, 0), sobe = num(ut[1], 0) > 0, yt = sobe ? pt[1] - 9 : pt[1] + 16;
      o.push(tx(pt[0], yt, "uy = " + br(num(ut[1], NaN) * 1000, 1) + " mm", 'font-size="8" text-anchor="middle"' + HALO)); mk([pt[0], yt - 9]); mk([pt[0], yt + 3]);
    }
    var yl = P.ymax + 14; o.push(tx(10, yl, "Deslocamentos ampliados " + br(amp, 0) + " vezes; tracejado: posição indeformada.", 'font-size="8" fill="#5b6774"')); mk([10, yl + 3]);
    return empilha(W, [P], "Deformada do pórtico do eixo " + (k + 1) + " — " + combId);
  }

  /* ---------- perspectiva (axonométrica) do modelo: modelo, aproveitamento ou modo de flambagem */
  function classeBarra(c, b) { var m = c.segMem[b.id]; if (m) return m.papel; if (b.papel === "contravento") return "contravento"; return b.semPeso ? "escora" : "outra"; }
  var ESTILO3D = { pilar: ["#1d2733", 1.7], viga: ["#1d2733", 1.7], tapamento: ["#3f5568", 1.2], escora: ["#b3bdc7", 0.55], contravento: ["#2d6a9c", 0.8], outra: ["#5b6774", 0.8] };
  function corAproveitamento(r) { return !fin(r) ? "#b3bdc7" : r > 1 ? "#b3261e" : r > 0.8 ? "#1f4f78" : r > 0.5 ? "#4f86b8" : "#a9c6e0"; }
  function svg3D(c, op) {
    op = op || {};
    var W = op.largura || 640, Hmax = op.alturaMax || 340, m = 14;
    var a = 36 * Math.PI / 180, b = 24 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    function P(x, y, z) { var d = z * sa + x * ca; return [z * ca - x * sa, -y * cb - d * sb]; }
    var bs = objs(c.M.barras).filter(function (bb) { return c.nos[bb.i] && c.nos[bb.j]; }); if (!bs.length) return "";
    var desl = op.desloc ? obj(op.desloc) : null, amp = 0;
    if (desl) { var vao = num(c.L.vao, 1), Lt = num(c.L.Lt, 1), mx = 0; Object.keys(desl).forEach(function (k) { var u = arr(desl[k]); var h = Math.sqrt(Math.pow(num(u[0], 0), 2) + Math.pow(num(u[1], 0), 2) + Math.pow(num(u[2], 0), 2)); if (h > mx) mx = h; }); amp = mx > 0 ? 0.06 * Math.max(vao, Lt) / mx : 0; }
    function pt(no, def) { var n = c.nos[no], u = def && desl ? arr(desl[no]) : []; return P(n.x + num(u[0], 0) * amp, n.y + num(u[1], 0) * amp, n.z + num(u[2], 0) * amp); }
    var mnU = Infinity, mxU = -Infinity, mnV = Infinity, mxV = -Infinity;
    bs.forEach(function (bb) { [pt(bb.i, false), pt(bb.j, false)].concat(desl ? [pt(bb.i, true), pt(bb.j, true)] : []).forEach(function (q) { mnU = Math.min(mnU, q[0]); mxU = Math.max(mxU, q[0]); mnV = Math.min(mnV, q[1]); mxV = Math.max(mxV, q[1]); }); });
    var topo = op.legenda ? 26 : 6, esc0 = Math.min((W - 2 * m) / Math.max(1e-6, mxU - mnU), (Hmax - 2 * m - topo) / Math.max(1e-6, mxV - mnV));
    var Hh = (mxV - mnV) * esc0 + 2 * m + topo, ox = (W - (mxU - mnU) * esc0) / 2;
    function S(q) { return [ox + (q[0] - mnU) * esc0, topo + m + (q[1] - mnV) * esc0]; }
    var ordem = { escora: 0, outra: 1, contravento: 2, tapamento: 3, viga: 4, pilar: 5 };
    bs.sort(function (x, y) { return (ordem[classeBarra(c, x)] || 0) - (ordem[classeBarra(c, y)] || 0); });
    var o = [svgAbre(W, Hh, op.titulo || "Perspectiva do modelo")];
    bs.forEach(function (bb) {
      var cl = classeBarra(c, bb), st = ESTILO3D[cl] || ESTILO3D.outra, cor = st[0], larg = st[1];
      if (op.modo === "aproveitamento") { var mm = c.segMem[bb.id]; cor = mm ? corAproveitamento(num(obj(c.res[mm.id]).razao, NaN)) : "#c9d2dc"; larg = mm ? (mm.papel === "tapamento" ? 1.6 : 2) : 0.5; }
      if (op.modo === "flambagem") { cor = "#c9d2dc"; larg = Math.min(larg, 0.8); }
      var p1 = S(pt(bb.i, false)), p2 = S(pt(bb.j, false));
      o.push(ln(p1[0], p1[1], p2[0], p2[1], 'stroke="' + cor + '" stroke-width="' + larg + '" stroke-linecap="round"'));
    });
    if (op.modo === "flambagem" && desl) bs.forEach(function (bb) { var p1 = S(pt(bb.i, true)), p2 = S(pt(bb.j, true)), cl = classeBarra(c, bb), sec = cl === "escora" || cl === "contravento"; o.push(ln(p1[0], p1[1], p2[0], p2[1], 'stroke="' + (sec ? "#9dbad6" : "#2d6a9c") + '" stroke-width="' + (sec ? 0.5 : 1.5) + '" stroke-linecap="round"')); });
    if (op.apoios) objs(c.M.apoios).forEach(function (ap) { if (!c.nos[ap.no]) return; var q = S(pt(ap.no, false)); o.push(polig([[q[0], q[1]], [q[0] - 3.5, q[1] + 6], [q[0] + 3.5, q[1] + 6]], 'fill="#ffffff" stroke="#1d2733" stroke-width="0.7"')); });
    if (op.legenda) {
      var itens = op.modo === "aproveitamento" ? [["#a9c6e0", "≤ 0,50"], ["#4f86b8", "0,50 a 0,80"], ["#1f4f78", "0,80 a 1,00"], ["#b3261e", "> 1,00 (não atende)"], ["#c9d2dc", "não verificadas aqui"]]
        : [["#1d2733", "pilares e vigas"], ["#3f5568", "colunas de tapamento"], ["#b3bdc7", "terças e travessas (escoras)"], ["#2d6a9c", "contraventamento"]];
      var xl = m;
      itens.forEach(function (it) { o.push('<rect x="' + f1(xl) + '" y="8" width="14" height="5" fill="' + it[0] + '"/>' + tx(xl + 18, 13, it[1], 'font-size="8"')); xl += 26 + it[1].length * 4.6; });
    }
    o.push("</svg>");
    return o.join("");
  }

  /* ---------- zonas de vento (planta: Z na horizontal, X na vertical — igual à planta de locação) */
  function corCpe(v) { if (!fin(v)) return "#ffffff"; if (v < 0) { var k = Math.min(1, -v / 1.5); return "rgb(" + Math.round(236 - 80 * k) + "," + Math.round(242 - 55 * k) + "," + Math.round(248 - 30 * k) + ")"; } var k2 = Math.min(1, v / 1.0); return "rgb(" + Math.round(250 - 20 * k2) + "," + Math.round(238 - 70 * k2) + "," + Math.round(226 - 110 * k2) + ")"; }
  function svgZonas(c, v, d) {
    var g = obj(v.geometria), a = num(g.a, NaN), b = num(g.b, NaN); if (!(a > 0 && b > 0)) return "";
    var zc = arr(obj(obj(v.zonas).cobertura)[d]), zp = obj(obj(obj(v.zonas).paredes)[d]);
    var W = 640, ml = 96, mr = 96, mt = 74, mb = 74, s = Math.min((W - ml - mr) / a, 210 / b), Hh = mt + b * s + mb, faixa = 22;
    function X(z) { return ml + z * s; } function Y(x) { return mt + x * s; }
    var o = [svgAbre(W, Hh, "Zonas de pressão externa — vento " + d + "°")];
    objs(zc).forEach(function (z) {
      var x0 = num(z.x0, 0), x1 = num(z.x1, 0), z0 = num(z.z0, 0), z1 = num(z.z1, 0);
      o.push('<rect x="' + f1(X(z0)) + '" y="' + f1(Y(x0)) + '" width="' + f1((z1 - z0) * s) + '" height="' + f1((x1 - x0) * s) + '" fill="' + corCpe(num(z.cpe, NaN)) + '" stroke="#5b6774" stroke-width="0.5"/>');
      o.push(tx(X((z0 + z1) / 2), Y((x0 + x1) / 2) - 1, String(z.zona || ""), 'text-anchor="middle" font-size="8.5" font-weight="600"'));
      o.push(tx(X((z0 + z1) / 2), Y((x0 + x1) / 2) + 10, br(num(z.cpe, NaN), 2), 'text-anchor="middle" font-size="8"'));
    });
    o.push('<rect x="' + f1(X(0)) + '" y="' + f1(Y(0)) + '" width="' + f1(a * s) + '" height="' + f1(b * s) + '" fill="none" stroke="#1d2733" stroke-width="1"/>');
    /* paredes em faixas por fora do contorno */
    function parede(face) {
      objs(zp[face]).forEach(function (z) {
        var s0 = num(z.s0, 0), s1 = num(z.s1, 0), r0, ro;
        if (face === "esquerda") r0 = [X(s0), Y(0) - faixa - 3, (s1 - s0) * s, faixa];
        else if (face === "direita") r0 = [X(s0), Y(b) + 3, (s1 - s0) * s, faixa];
        else if (face === "frente") r0 = [X(0) - faixa - 3, Y(s0), faixa, (s1 - s0) * s];
        else r0 = [X(a) + 3, Y(s0), faixa, (s1 - s0) * s];
        o.push('<rect x="' + f1(r0[0]) + '" y="' + f1(r0[1]) + '" width="' + f1(r0[2]) + '" height="' + f1(r0[3]) + '" fill="' + corCpe(num(z.cpe, NaN)) + '" stroke="#5b6774" stroke-width="0.5"/>');
        ro = String(z.zona || "") + " " + br(num(z.cpe, NaN), 1);
        var cx = r0[0] + r0[2] / 2, cy = r0[1] + r0[3] / 2;
        if (face === "frente" || face === "fundo") o.push('<text x="' + f1(cx) + '" y="' + f1(cy) + '" text-anchor="middle" font-size="7.5" transform="rotate(-90 ' + f1(cx) + " " + f1(cy) + ')" dy="3">' + esc(ro) + "</text>");
        else o.push(tx(cx, cy + 3, ro, 'text-anchor="middle" font-size="7.5"'));
      });
    }
    ["esquerda", "direita", "frente", "fundo"].forEach(parede);
    o.push(tx(X(a / 2), Y(0) - faixa - 9, faceTxt(c, "esquerda"), 'text-anchor="middle" font-size="8" fill="#5b6774"'));
    o.push(tx(X(a / 2), Y(b) + faixa + 15, faceTxt(c, "direita"), 'text-anchor="middle" font-size="8" fill="#5b6774"'));
    o.push('<text x="' + f1(X(0) - faixa - 9) + '" y="' + f1(Y(b / 2)) + '" text-anchor="middle" font-size="8" fill="#5b6774" transform="rotate(-90 ' + f1(X(0) - faixa - 9) + " " + f1(Y(b / 2)) + ')">' + esc(faceTxt(c, "frente")) + "</text>");
    o.push('<text x="' + f1(X(a) + faixa + 13) + '" y="' + f1(Y(b / 2)) + '" text-anchor="middle" font-size="8" fill="#5b6774" transform="rotate(90 ' + f1(X(a) + faixa + 13) + " " + f1(Y(b / 2)) + ')">' + esc(faceTxt(c, "fundo")) + "</text>");
    /* setas do vento */
    var setas = [], dd = num(d, 0);
    for (var i = 1; i <= 3; i++) {
      if (dd === 0) setas.push([X(0) - faixa - 52, Y(b * i / 4), X(0) - faixa - 22, Y(b * i / 4)]);
      else if (dd === 180) setas.push([X(a) + faixa + 52, Y(b * i / 4), X(a) + faixa + 22, Y(b * i / 4)]);
      else if (dd === 90) setas.push([X(a * i / 4), Y(0) - faixa - 46, X(a * i / 4), Y(0) - faixa - 18]);
      else setas.push([X(a * i / 4), Y(b) + faixa + 46, X(a * i / 4), Y(b) + faixa + 22]);
    }
    setas.forEach(function (q) {
      var ang = Math.atan2(q[3] - q[1], q[2] - q[0]), h1 = [q[2] - 7 * Math.cos(ang - 0.45), q[3] - 7 * Math.sin(ang - 0.45)], h2 = [q[2] - 7 * Math.cos(ang + 0.45), q[3] - 7 * Math.sin(ang + 0.45)];
      o.push(ln(q[0], q[1], q[2], q[3], 'stroke="#2d6a9c" stroke-width="1.4"') + polig([[q[2], q[3]], h1, h2], 'fill="#2d6a9c"'));
    });
    o.push(tx(8, 14, "Vento " + dd + "°", 'font-size="10" font-weight="600" fill="#2d6a9c"'));
    o.push(tx(8, 27, "cpe por zona (− sucção, + sobrepressão)", 'font-size="8" fill="#5b6774"'));
    o.push("</svg>");
    return o.join("");
  }

  /* ================================================================ SEÇÕES */
  /* ---------- 1. objeto */
  function secObjeto(c, d, n) {
    var L = c.L, g = obj(c.par.geometria), vao = num(L.vao, NaN), Lt = num(L.Lt, NaN), H = num(L.H, NaN), i = num(L.i, NaN), aguas = num(L.aguas, 2);
    var nP = arr(L.zs).length, esp = num(L.esp, NaN), hc = aguas === 2 ? H + i * vao / 2 : H + i * vao, eng = g.base === "engastada";
    var tipoP = !g.tipoPortico || g.tipoPortico === "alma-cheia" ? "pórticos de alma cheia" : "pórticos (" + t(g.tipoPortico) + ")";
    var h = "<p>Este memorial apresenta as ações, a análise estrutural e o dimensionamento da estrutura metálica principal de um galpão em " + tipoP +
      ", com " + nP + " pórticos espaçados de " + un(esp, 2, "m") + ", vão de " + un(vao, 2, "m") + ", comprimento de " + un(Lt, 2, "m") +
      " e pé-direito de " + un(H, 2, "m") + " até o beiral, cobertura em " + (aguas === 2 ? "duas águas" : "uma água") + " com inclinação de " + un(i * 100, 1, "%") +
      " e bases " + (eng ? "engastadas" : "rotuladas") + ". " + escopoTxt(c) + "</p>";
    var dec = {}; objs(c.r.decisoes).forEach(function (x) { if (!dec[x.tema]) dec[x.tema] = x; });
    function decTxt(tema) { return dec[tema] ? t(cap(dec[tema].decisao), "decisão " + tema) : "—"; }
    var lin = [
      ["Vão (eixo a eixo dos pilares)", un(vao, 2, "m")], ["Comprimento", un(Lt, 2, "m")], ["Pé-direito (até o beiral)", un(H, 2, "m")],
      ["Altura da cumeeira", un(hc, 2, "m")], ["Inclinação da cobertura", un(i * 100, 1, "%") + " (" + un(Math.atan(i) * 180 / Math.PI, 2, "°") + ")"],
      ["Águas", aguas === 2 ? "duas" : "uma"], ["Pórticos", decTxt("Pórticos")], ["Área em planta", un(vao * Lt, 2, "m²")],
      ["Bases dos pilares", eng ? "engastadas" : "rotuladas"], ["Terças", decTxt("Terças")], ["Travessas laterais", decTxt("Travessas de fechamento")],
      ["Colunas de tapamento", decTxt("Colunas de tapamento")], ["Contraventamento", decTxt("Contraventamento")], ["Mãos-francesas", decTxt("Mãos-francesas")]
    ].map(function (x) { return trw([td(x[0]), td(x[1])]); });
    h += d.tab("Características gerais", ["Item", "Valor"], lin, { classe: "ficha" });
    /* perfis adotados */
    var gr = obj(c.G.grupos), lp = [];
    ["pilar", "viga", "tapamento"].forEach(function (k) {
      var g2 = obj(gr[k]); if (!g2.perfil) return;
      var ms = c.membros.filter(function (m) { return m.grupo === k; }), Ltot = 0; ms.forEach(function (m) { Ltot += num(m.L, 0); });
      var s = ms.length ? obj(ms[0].secao) : {};
      lp.push(trw([td(NOME_GRUPO[k]), td(t(g2.perfil)), td(t(obj(g2.aco).id) + " (fy = " + un(num(obj(g2.aco).fy, NaN), 0, "MPa") + ")"), tn(br(num(s.massa, NaN), 1)), tn(String(ms.length)), tn(br(Ltot, 2))]));
    });
    var sc = obj(obj(c.G.secoes).contravento), gcv = obj(gr.contravento);
    if (sc.nome) { var nb = arr(gcv.barras).length, Lcv = 0; arr(gcv.barras).forEach(function (id) { var b = c.barras[id]; if (b) Lcv += num(compBarra(c, b), 0); }); lp.push(trw([td(NOME_GRUPO.contravento), td(t(sc.nome)), td(t(obj(gcv.aco).id) + " (fy = " + un(num(obj(gcv.aco).fy, NaN), 0, "MPa") + ")"), tn(br(num(sc.massa, NaN), 2)), tn(String(nb)), tn(br(Lcv, 2))])); }
    h += d.tab("Perfis adotados na estrutura principal", ["Grupo", "Perfil", "Aço", thn("Massa (kg/m)"), thn("Peças"), thn("Comprimento total (m)")], lp);
    /* fechamentos */
    var fe = obj(c.par.fechamentos), cob = obj(c.par.cobertura), lf = [];
    ["esquerda", "direita", "frente", "fundo"].forEach(function (f) {
      var x = obj(fe[f]), tp = x.tipo || "—", desc = { aberto: "aberta (sem fechamento)", telha: "telha", alvenaria: "alvenaria", premoldado: "painel pré-moldado" }[tp] || t(tp);
      if (tp === "misto") desc = "alvenaria até " + un(num(x.alturaAlvenaria, 3), 2, "m") + " e telha acima";
      lf.push(trw([td(faceTxt(c, f)), td(desc)]));
    });
    lf.push(trw([td("Cobertura"), td(t(cob.telhaNome || "telha") + (fin(num(cob.telhaVaoMax, NaN)) ? "; vão máximo entre apoios na carga do projeto: " + un(num(cob.telhaVaoMax, NaN), 2, "m") : ""))]));
    h += d.tab("Fechamentos e cobertura", ["Face", "Fechamento"], lf);
    h += produtos(c, d, n);
    /* figuras */
    var img = obj(c.op.imagens);
    if (imgOk(img.perspectiva)) h += d.fig('<img src="' + esc(img.perspectiva) + '" alt="Perspectiva da estrutura">', "Perspectiva da estrutura (imagem do modelo 3D do sistema).");
    h += d.fig(svg3D(c, { titulo: "Perspectiva do modelo da estrutura", legenda: true }), "Perspectiva do modelo de cálculo: pórticos, colunas de tapamento, terças e travessas (escoras) e contraventamento.");
    h += d.fig(svgPlanta(c), "Planta de locação dos pilares e das colunas de tapamento, com os eixos de projeto (cotas em metros, eixo a eixo).");
    var kTip = Math.floor(arr(L.zs).length / 2);
    h += d.fig(svgPortico(c, kTip), "Elevação do pórtico típico (eixo " + (kTip + 1) + "), com terças, travessas e mãos-francesas definidas pelo cálculo (cotas em metros).");
    return h;
  }
  /* a carga concentrada de 1 kN da NBR 6120 (6.4) só conta como verificada se aparecer nas verificações/combinações da terça */
  function concentradaNaTerca(r) {
    var tc = obj(r && r.tercas); if (!objs(tc.verificacoes).length) return false;
    return /concentrad|1 kN/i.test(JSON.stringify(objs(tc.verificacoes).map(function (v) { return [v.nome, v.item]; })) + JSON.stringify(objs(tc.combinacoes)));
  }
  /* o que este memorial dimensiona — dito pelo que o resultado TRAZ (nada de "calculado" sem resultado) */
  function escopoTxt(c) {
    var r = c.r, sim = ["os pilares", "as vigas de cobertura", "as colunas de tapamento dos oitões", "o contraventamento"], nao = [];
    if (r.tercas) sim.push("as terças"); else nao.push("terças");
    if (r.travessas) sim.push("as travessas de fechamento"); else nao.push("travessas");
    if (r.ligacoes && objs(r.ligacoes.lista).length) sim.push("as ligações (" + objs(r.ligacoes.lista).map(function (x) { return low(String(x.nome || "")).replace(/\s*\(.*\)$/, ""); }).join(", ") + ")"); else nao.push("ligações e placas de base");
    nao.push("mãos-francesas");
    function lista(l) { return l.length > 1 ? l.slice(0, -1).join(", ") + " e " + l[l.length - 1] : l.join(""); }
    return "Este memorial dimensiona " + lista(sim) + ", com a análise, as verificações e os passos de cálculo de cada um. " + cap(lista(nao)) + " não fazem parte deste cálculo (" + S("avisos") + ".4).";   /* todos os itens de "nao" são plurais femininos */
  }
  /* produto de cobertura/parede (catálogo do fabricante) — tabela técnica, imagens e verificação da inclinação mínima */
  function produtos(c, d, n) {
    var fc = obj(c.op.fechamentos), h = "";
    [["telha", "Telha da cobertura"], ["paredes", "Fechamento das paredes"]].forEach(function (par) {
      var p = obj(fc[par[0]]); if (!p.modelo && !p.fabricante) return;
      var lin = [];
      function add(r, v) { if (v != null && v !== "") lin.push(trw([td(r), td(v)])); }
      add("Fabricante", t(p.fabricante)); add("Modelo", t(p.modelo));
      if (fin(num(p.espessura_mm, NaN))) add("Espessura", un(num(p.espessura_mm, NaN), 2, "mm"));
      if (p.revestimento) add("Revestimento", t(p.revestimento));
      if (fin(num(p.peso_kN_m2, NaN))) add("Peso próprio", un(num(p.peso_kN_m2, NaN), 4, "kN/m²") + (p.peso_obs ? ' <span class="nota">(' + t(p.peso_obs) + ")</span>" : ""));
      else if (p.peso_obs) add("Peso próprio", '<span class="nota">' + t(p.peso_obs) + "</span>");
      if (fin(num(p.largura_util_m, NaN))) add("Largura útil", un(num(p.largura_util_m, NaN), 3, "m"));
      if (fin(num(p.altura_onda_mm, NaN))) add("Altura da onda", un(num(p.altura_onda_mm, NaN), 0, "mm"));
      if (fin(num(p.inclinacao_min_pct, NaN))) {
        var iMin = num(p.inclinacao_min_pct, NaN), iAdot = num(c.L.i, NaN) * 100, okI = !(iAdot < iMin - 1e-9);
        add("Inclinação mínima do fabricante", un(iMin, 1, "%") + (par[0] === "telha" && fin(iAdot) ? " — adotada " + un(iAdot, 1, "%") + ": " + situacao(okI) : ""));
        if (par[0] === "telha" && !okI) d.aviso("Inclinação da cobertura (" + br(iAdot, 1) + " %) abaixo da mínima recomendada pelo fabricante da telha (" + br(iMin, 1) + " %).");
      }
      var fonteP = fonteItem(c, p.fonte); if (fonteP || p.pagina != null) add("Fonte", (fonteP || "catálogo do fabricante") + (p.pagina != null ? ", p. " + t(p.pagina) : ""));
      h += d.tab(par[1] + " — dados do catálogo do fabricante", ["Item", "Valor"], lin, { classe: "ficha" });
      var tt = obj(p.tabela_tecnica);
      if (arr(tt.vaos_m).length && objs(tt.linhas).length) {
        var vaoAd = par[0] === "telha" ? num(obj(c.par.cobertura).telhaVaoMax, NaN) : NaN;
        var cab = "<tr><th>Condição</th>" + tt.vaos_m.map(function (x) { return '<th class="n' + (fin(vaoAd) && Math.abs(num(x, NaN) - vaoAd) < 1e-6 ? " sel" : "") + '">' + br(num(x, NaN), 2) + "</th>"; }).join("") + "</tr>";
        var lt = objs(tt.linhas).map(function (l) { return trw([td(t(l.condicao))].concat(arr(l.valores).map(function (x, j) { return td(x == null ? "—" : br(num(x, NaN), 0), "n" + (fin(vaoAd) && Math.abs(num(tt.vaos_m[j], NaN) - vaoAd) < 1e-6 ? " sel" : "")); }))); });
        h += d.tab(t(tt.tipo || "Tabela técnica do fabricante") + " — vãos entre apoios (m)" + (fin(vaoAd) ? "; coluna destacada: vão adotado entre terças" : ""), cab, lt, { nota: arr(p.tabela_tecnica_notas).map(function (x) { return t(x); }).join("<br>") });
      } else if (arr(tt.colunas).length && arr(tt.linhas).length) {
        h += d.tab("Tabela técnica do fabricante", tt.colunas.map(function (x) { return t(x); }), arr(tt.linhas).map(function (l) { return trw(arr(l).map(function (x) { return typeof x === "number" ? tn(br(x, x % 1 === 0 ? 0 : 2)) : td(x == null ? "—" : t(x)); })); }), { nota: arr(p.tabela_tecnica_notas).map(function (x) { return t(x); }).join("<br>") });
      }
      var ims = objs(p.imagens).filter(function (im) { return imgOk(im.src || im.dataUrl || im.url); });
      if (ims.length) h += d.fig('<div class="par">' + ims.map(function (im) { return '<img src="' + esc(im.src || im.dataUrl || im.url) + '" alt="' + esc(im.o_que_mostra || p.modelo || "") + '">'; }).join("") + "</div>",
        t(p.fabricante) + " — " + t(p.modelo) + ": " + ims.map(function (im) { return t(im.o_que_mostra || "imagem do catálogo"); }).join("; ") + " (catálogo do fabricante" + (ims[0].pagina != null ? ", p. " + t(ims[0].pagina) : "") + ").");
    });
    return h;
  }
  function fonteItem(c, id) {
    if (!id) return "";
    var f = objs(c.op.fontes).filter(function (x) { return x.id === id; })[0];
    return f ? t(f.titulo) + (urlOk(f.url) ? " — " + link(f.url, "link") : "") : t(id);
  }

  /* ---------- 2. normas */
  function itens8800(c) {
    var porEd = {}, vistos = {};
    /* um item por número da norma ("6.3.3.2" vinha três vezes, com textos diferentes); fragmento sem número de item, anexo ou
       tabela (resto de frase do motor, como "mudou o método da chapa") não entra na lista */
    function add(s, extra) {
      var m = /NBR 8800:(\d{4}),?\s*([^—|]*)/.exec(String(s || "")); if (!m) return;
      var it = extra || semAfazer(m[2]).split(";")[0].trim().replace(/[;,.]$/, ""); if (!it) return;
      var ch = /^(\d+(?:\.\d+)*|Anexo [A-Z]|Tabelas? [A-Z]?\.?\d*(?:\.\d+)?(?: e \d+)?)/.exec(it); if (!ch) return;
      var k = m[1] + "|" + ch[1]; if (vistos[k]) return; vistos[k] = true;
      (porEd[m[1]] = porEd[m[1]] || []).push(it);
    }
    Object.keys(c.res).forEach(function (id) { objs(obj(c.res[id]).verificacoes).forEach(function (v) { add(v.item); }); });
    objs(obj(obj(c.r.contravento).verificacao).verificacoes).forEach(function (v) { add(v.item); });
    objs(c.r.servico).forEach(function (s) { add(s.ref); });
    objs(c.r.decisoes).forEach(function (x) { add(x.motivo); });
    var lg = obj(c.r.ligacoes); Object.keys(lg).forEach(function (k) { objs(obj(lg[k]).verificacoes).forEach(function (v) { add(v.item); }); });
    [c.r.tercas, obj(c.r.travessas).lateral, obj(c.r.travessas).oitao].forEach(function (s) { objs(obj(s).verificacoes).forEach(function (v) { add(v.item); }); });
    if (c.Car && c.Car.EDICAO) add(c.Car.EDICAO, "Tabelas 1 e 2 (γf e ψ)");
    if (c.Mat && c.Mat.GAMA) add(c.Mat.GAMA.fonte, "Tabela 3 (γa1, γa2)");
    if (c.Mat && c.Mat.CONST) add(c.Mat.CONST.fonte, "4.5.2.9 (E, G, ν, β)");
    return porEd;
  }
  function secNormas(c, d) {
    var ed = itens8800(c), v = c.vento, sec14762 = !!(c.r.tercas || c.r.travessas), it24 = ed["2024"] || [], it08 = ed["2008"] || [];
    /* "Aplicação": o que o RESULTADO usou de cada norma — itens da 8800 por edição tirados das próprias verificações,
       vento calculado ou informado, formados a frio presentes ou não. Nada de "conferir": o que vem de outra edição
       está dito, com o item; o que difere da edição vigente vira premissa declarada (seção de premissas). */
    var a8800 = (it24.length ? "Revisão de 2024 nos itens que ela alterou e que este cálculo usa: " + it24.map(function (x) { return t(x); }).join("; ") + ". " : "") +
      (it08.length ? "Demais verificações pelas expressões da edição de 2008: " + it08.map(function (x) { return t(x); }).join("; ") + "." : "") +
      " A edição de cada expressão está no passo correspondente da " + secao("dimensionamento") + "; o que difere da revisão de 2024 está declarado nas premissas (" + secao("avisos") + ").";
    var aplic = {
      "NBR 8800": a8800,
      "NBR 8681": "Combinações últimas normais e de serviço (raras e quase permanentes), com γf e ψ das Tabelas 1 e 2 da NBR 8800 para estruturas de aço — comparados com a revisão de 2024 na " + secao("combinacoes") + ".",
      "NBR 6120": "Peso específico do aço (Tabela 1); sobrecarga de cobertura (" + t(obj(c.r.sobrecarga).referencia || "6.4") + "); instalações e forros como ações permanentes (6.4).",
      "NBR 6123": v ? "V0 pelo mapa de isopletas da Figura 1 (o mesmo nas edições de 1988 e 2023); S1, S2, S3, coeficientes de pressão externa e interna e casos de vento pelas tabelas da " + t(v.norma || "NBR 6123") + ", citadas em cada passo da memória do vento (" + S("acoes") + ".3)."
        : "Pressões de vento informadas diretamente ao modelo (" + S("acoes") + ".3).",
      "NBR 14762": sec14762 ? "Terças e travessas: método da resistência direta (Anexo C), com as forças e os momentos críticos local, distorcional e global por faixas finitas (" + secao("dimensionamento") + ")." : "Sem aplicação: o cálculo não traz terças nem travessas.",
      "NBR 6122": "Projeto das fundações, por terceiros, com as reações da " + secao("reacoes") + "."
    };
    /* o registro de normas do sistema (js/aconormas.js), quando carregado, dá título, tema e vigência; o resultado dá a aplicação */
    var Nm = dep("AcoNormas", "./aconormas.js"), reg = Nm && typeof Nm.lista === "function" ? Nm.lista() : null, lin;
    function linha(norma, titulo, tema, vigente, id) { return trw([td(esc(norma)), td(esc(titulo) + (tema ? '<br><span class="nota">' + esc(tema) + "</span>" : "")), td(esc(vigente)), td(aplic[id] || "—")]); }
    if (reg && reg.length) {
      lin = reg.map(function (x) { var id = String(x.norma || "").replace(/^ABNT\s+/, "").trim(); return linha(x.norma, x.titulo, x.tema, x.vigente, id); });
      if (!reg.some(function (x) { return /6122/.test(x.norma); })) { var n6 = NORMAS.filter(function (x) { return x.id === "NBR 6122"; })[0]; lin.push(linha("ABNT NBR 6122", n6.titulo, "", n6.vigente, "NBR 6122")); }
    } else lin = NORMAS.map(function (nm) { return linha("ABNT " + nm.id, nm.titulo, "", nm.vigente, nm.id); });
    /* NBR 6118 só quando o cálculo das ligações a cita (ancoragem dos chumbadores) */
    var m6118 = /NBR 6118(?::\d{4})?(?:,\s*(\d+(?:\.\d+)+))?/.exec(JSON.stringify(c.r.ligacoes || {}));
    if (m6118) lin.push(trw([td("ABNT NBR 6118"), td("Projeto de estruturas de concreto"), td("2026"), td("Ancoragem dos chumbadores por aderência" + (m6118[1] ? " (" + esc(m6118[1]) + ")" : "") + ", com o comprimento de ancoragem de barras de aço da norma.")]));
    var h = "<p>Normas aplicadas no cálculo: para cada uma, a edição em vigor e o que dela foi usado. Quando uma expressão ou um coeficiente vem de edição diferente da vigente, a edição está indicada no item e no passo de cálculo correspondente.</p>";
    h += d.tab("Normas aplicadas", ["Norma", "Título", "Edição vigente", "Aplicação neste cálculo"], lin, { nota: "Edições vigentes segundo o catálogo da ABNT em " + NORMAS_CONFERIDAS + "." });
    if (Nm && objs(Nm.PRODUTO).length) h += d.tab("Normas de produto (catálogos dos fabricantes)", ["Norma", "Assunto", "Uso neste projeto"], objs(Nm.PRODUTO).map(function (x) { return trw([td(esc(x.norma)), td(esc(x.titulo)), td(esc(x.uso))]); }), { classe: "compacta" });
    var docs = [];
    var mats = unicos(c.membros.map(function (m) { return obj(m.aco).id; }).concat([obj(obj(obj(c.G.grupos).contravento).aco).id, obj(c.r.tercas).aco, obj(obj(c.r.travessas).lateral).aco]));
    if (mats.length) docs.push("Especificação dos aços: " + mats.map(function (x) { return t(x); }).join(", ") + " (propriedades na " + secao("materiais") + ").");
    docs.push("Catálogos dos fabricantes de perfis e de fechamentos e manuais de instalação: " + secao("referencias") + ".");
    if (v) docs.push("Mapa de isopletas da velocidade básica do vento: " + t((c.iso && c.iso.FONTE && c.iso.FONTE.citacao) || "NBR 6123, Figura 1") + ".");
    h += "<p>Outros documentos de referência:</p><ul>" + docs.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
    return h;
  }

  /* ---------- 3. materiais */
  function secMateriais(c, d, n) {
    var h = h3(n + ".1", "Aços estruturais"), gr = obj(c.G.grupos), porAco = {}, ordem = [];
    ["pilar", "viga", "tapamento", "contravento"].forEach(function (k) {
      var a = obj(obj(gr[k]).aco); if (!a.id || !obj(gr[k]).perfil) return;
      if (!porAco[a.id]) { porAco[a.id] = { a: a, usos: [] }; ordem.push(a.id); }
      porAco[a.id].usos.push(NOME_GRUPO[k].toLowerCase());
    });
    /* aço das terças e travessas (formados a frio): id no resultado, fy/fu da seção, fonte na biblioteca de materiais */
    [c.r.tercas, obj(c.r.travessas).lateral, obj(c.r.travessas).oitao].forEach(function (s, i) {
      if (!s || !s.aco) return; var id = String(s.aco), sc = obj(s.secao), ref = c.Mat && c.Mat.aco ? obj(c.Mat.aco(id)) : {};
      if (!porAco[id]) { porAco[id] = { a: { id: id, fy: num(sc.fy, ref.fy), fu: num(sc.fu, ref.fu), fonte: ref.fonte, pagina: ref.pagina }, usos: [] }; ordem.push(id); }
      var uso = i ? "travessas" : "terças"; if (porAco[id].usos.indexOf(uso) < 0) porAco[id].usos.push(uso);
    });
    h += d.tab("Aços das barras (valores mínimos especificados)", ["Uso", "Aço", thn("fy (MPa)"), thn("fu (MPa)"), "Fonte"],
      ordem.map(function (id) { var x = porAco[id]; return trw([td(x.usos.join(", ")), td(t(x.a.id)), tn(br(num(x.a.fy, NaN), 0)), tn(br(num(x.a.fu, NaN), 0)), td(x.a.fonte ? fonteHtml(x.a.fonte, x.a.pagina) : "—")]); }));
    var b0 = objs(c.M.barras).filter(function (b) { return fin(num(b.E, NaN)); })[0], K = c.Mat && c.Mat.CONST ? c.Mat.CONST : null;
    var lc = [];
    if (b0) { lc.push(trw([td("Módulo de elasticidade E"), tn(un(num(b0.E, NaN) / 1000, 0, "MPa"))])); lc.push(trw([td("Módulo de elasticidade transversal G"), tn(un(num(b0.G, NaN) / 1000, 0, "MPa"))])); }
    if (K) { lc.push(trw([td("Coeficiente de Poisson ν"), tn(br(K.nu, 2))])); lc.push(trw([td("Coeficiente de dilatação térmica β"), tn(br(K.beta * 1e5, 1) + " × 10⁻⁵ /°C")])); lc.push(trw([td("Massa específica ρ"), tn(un(K.rho, 0, "kg/m³"))])); }
    var gam = c.Ana && fin(c.Ana.GAMMA_ACO) ? c.Ana.GAMMA_ACO : (K ? K.gamma : NaN);
    if (fin(gam)) lc.push(trw([td("Peso específico (para as cargas)"), tn(un(gam, 1, "kN/m³"))]));
    h += h3(n + ".2", "Propriedades do aço") + d.tab("Constantes do aço", ["Propriedade", thn("Valor")], lc,
      { classe: "ficha", nota: "E e G: valores usados na análise. Fonte: " + (K ? t(K.fonte) : "NBR 8800, 4.5.2.9; NBR 6120:2019, Tabela 1") + "." });
    var GM = c.Mat && c.Mat.GAMA;
    if (GM) h += h3(n + ".3", "Coeficientes de ponderação das resistências") + d.tab("Coeficientes de ponderação das resistências (combinações normais)", ["Coeficiente", thn("Valor"), "Aplicação"],
      [trw([td("γa1"), tn(br(GM.a1, 2)), td("escoamento, flambagem e instabilidade")]), trw([td("γa2"), tn(br(GM.a2, 2)), td("ruptura")])], { nota: "Fonte: " + t(GM.fonte) + "." });
    /* ligações */
    h += h3(n + (GM ? ".4" : ".3"), "Ligações: parafusos, eletrodos, chumbadores e concreto da base");
    var mt = obj(c.op.materiais), Mt = c.Mat, lgm = obj(c.r.ligacoes);
    if (objs(lgm.lista).length) {
      /* o que o cálculo das ligações adotou (dimensoes de cada ligação) */
      var lm = [];
      objs(lgm.lista).forEach(function (x) {
        var dm = obj(obj(lgm[x.id]).dimensoes), ch = obj(dm.chumbadores);
        if (dm.aco) lm.push(trw([td(t(x.nome)), td("chapa"), td(t(dm.aco))]));
        if (dm.parafuso) lm.push(trw([td(t(x.nome)), td("parafusos"), td((dm.n != null ? esc(dm.n) + " × " : "") + t(dm.parafuso) + (dm.classe ? " " + t(dm.classe) : ""))]));
        if (ch.id) lm.push(trw([td(t(x.nome)), td("chumbadores"), td(esc(ch.n) + " × " + t(ch.id) + (ch.material ? " " + t(ch.material) : ""))]));
        if (dm.solda != null || dm.soldaMesa) lm.push(trw([td(t(x.nome)), td("solda"), td(dm.soldaMesa ? "mesas: " + t(dm.soldaMesa) + (dm.soldaAlma != null ? "; alma: filete " + br(num(dm.soldaAlma, NaN), 0) + " mm" : "") : "filete " + br(num(dm.solda, NaN), 0) + " mm")]));
      });
      var fund = obj(c.par.fundacao).fck != null ? obj(c.par.fundacao) : obj(c.parE.fundacao);
      lm.push(trw([td("Placas de base"), td("concreto do bloco"), td(fin(num(fund.fck, NaN)) ? "fck = " + un(num(fund.fck, NaN), 0, "MPa") + " (informado)" : "fck adotado no cálculo da pressão sob a placa: passo σc,Rd da " + secao("dimensionamento") + "; o concreto do bloco deve ter, no mínimo, esse fck (premissa, " + S("avisos") + ".2)")]));
      h += "<p>Materiais adotados pelo cálculo das ligações (arranjos e passos na " + secao("dimensionamento") + "):</p>";
      h += d.tab("Materiais das ligações", ["Ligação", "Item", "Especificação"], lm, { classe: "compacta" });
      if (Mt) {
        var l4 = [];
        objs(Mt.PARAFUSOS).forEach(function (p) { l4.push(trw([td("Parafuso"), td(t(p.id)), td((p.fyb == null ? "fub = " : "fyb = " + un(p.fyb, 0, "MPa") + "; fub = ") + un(p.fub, 0, "MPa")), td(t(Mt.FONTE_PARAF))])); });
        objs(Mt.ELETRODOS).forEach(function (p) { l4.push(trw([td("Eletrodo"), td(t(p.id)), td("fw = " + un(p.fw, 0, "MPa")), td("AWS A5.1/A5.5")])); });
        objs(Mt.CHUMBADORES).forEach(function (p) { l4.push(trw([td("Chumbador"), td(t(p.id)), td("fy = " + un(p.fy, 0, "MPa") + "; fu = " + un(p.fu, 0, "MPa")), td(t(Mt.FONTE_CHUMB))])); });
        h += d.tab("Propriedades dos materiais de ligação (biblioteca do sistema)", ["Item", "Classe", "Resistência", "Fonte"], l4, { classe: "compacta" });
      }
    } else if (mt.parafuso || mt.eletrodo || mt.chumbador || mt.concreto) {
      var l2 = [];
      if (mt.parafuso) { var pa = Mt && Mt.parafuso ? Mt.parafuso(mt.parafuso) : null; l2.push(trw([td("Parafusos"), td(t(mt.parafuso)), td(pa ? "fyb = " + (pa.fyb == null ? "—" : un(pa.fyb, 0, "MPa")) + "; fub = " + un(pa.fub, 0, "MPa") : "—"), td(Mt ? t(Mt.FONTE_PARAF) : "—")])); }
      if (mt.eletrodo) { var el = Mt && Mt.eletrodo ? Mt.eletrodo(mt.eletrodo) : null; l2.push(trw([td("Eletrodos"), td(t(mt.eletrodo)), td(el ? "fw = " + un(el.fw, 0, "MPa") : "—"), td("AWS A5.1/A5.5")])); }
      if (mt.chumbador) { var ch = Mt && Mt.chumbador ? Mt.chumbador(mt.chumbador) : null; l2.push(trw([td("Chumbadores"), td(t(mt.chumbador)), td(ch ? "fy = " + un(ch.fy, 0, "MPa") + "; fu = " + un(ch.fu, 0, "MPa") : "—"), td(Mt ? t(Mt.FONTE_CHUMB) : "—")])); }
      if (mt.concreto) { var fck = num(String(mt.concreto).replace(/\D/g, ""), NaN); l2.push(trw([td("Concreto da base"), td(t(mt.concreto)), td(fin(fck) ? "fck = " + un(fck, 0, "MPa") : "—"), td("NBR 6118")])); }
      h += d.tab("Materiais especificados para as ligações", ["Item", "Especificação", "Resistência", "Fonte"], l2, { nota: "O dimensionamento das ligações não faz parte deste cálculo (" + S("avisos") + ".4)." });
    } else {
      h += "<p>O dimensionamento das ligações (parafusos, soldas, chapas, placas de base e chumbadores) não faz parte deste cálculo (" + S("avisos") + ".4). Propriedades dos materiais de ligação da biblioteca de materiais:</p>";
      if (Mt) {
        var l3 = [];
        objs(Mt.PARAFUSOS).forEach(function (p) { l3.push(trw([td("Parafuso"), td(t(p.id)), td((p.fyb == null ? "fub = " : "fyb = " + un(p.fyb, 0, "MPa") + "; fub = ") + un(p.fub, 0, "MPa")), td(t(Mt.FONTE_PARAF))])); });
        objs(Mt.ELETRODOS).forEach(function (p) { l3.push(trw([td("Eletrodo"), td(t(p.id)), td("fw = " + un(p.fw, 0, "MPa")), td("AWS A5.1/A5.5")])); });
        objs(Mt.CHUMBADORES).forEach(function (p) { l3.push(trw([td("Chumbador"), td(t(p.id)), td("fy = " + un(p.fy, 0, "MPa") + "; fu = " + un(p.fu, 0, "MPa")), td(t(Mt.FONTE_CHUMB))])); });
        h += d.tab("Materiais de ligação — propriedades de referência",["Item", "Classe", "Resistência", "Fonte"], l3);
      }
    }
    /* perfis */
    var perf = {}, ord2 = [];
    c.membros.forEach(function (m) { var s = obj(m.secao); if (s.nome && !perf[s.nome]) { perf[s.nome] = s; ord2.push(s.nome); } });
    var sc = obj(obj(c.G.secoes).contravento); if (sc.nome && !perf[sc.nome]) { perf[sc.nome] = sc; ord2.push(sc.nome); }
    var lg = [], lpz = [], fontes = [];
    ord2.forEach(function (nome) {
      var s = perf[nome], p = obj(s.mm);
      if (p.forma === "circ") { lg.push(trw([td(t(nome)), tn(br(num(p.d, NaN), 1)), tn("—"), tn("—"), tn("—"), tn(br(num(p.A, NaN) / 100, 2)), tn(br(num(s.massa, NaN), 2))])); return; }
      lg.push(trw([td(t(nome)), tn(br(num(p.d, NaN), 0)), tn(br(num(p.bf, NaN), 0)), tn(br(num(p.tw, NaN), 1)), tn(br(num(p.tf, NaN), 1)), tn(br(num(p.A, NaN) / 100, 2)), tn(br(num(s.massa, NaN), 1))]));
      lpz.push(trw([td(t(nome)), tn(br(num(p.Ix, NaN) / 1e4, 0)), tn(br(num(p.Wx, NaN) / 1e3, 1)), tn(br(num(p.Zx, NaN) / 1e3, 1)), tn(br(num(p.rx, NaN) / 10, 2)), tn(br(num(p.Iy, NaN) / 1e4, 1)), tn(br(num(p.Wy, NaN) / 1e3, 1)), tn(br(num(p.ry, NaN) / 10, 2)), tn(br(num(p.J, NaN) / 1e4, 2)), tn(br(num(p.Cw, NaN) / 1e6, 0))]));
      var cat = obj(s.cat); if (cat.fonte) fontes.push(t(nome) + ": " + fonteHtml(cat.fonte));
    });
    var origem = {}; ord2.forEach(function (nome) { var o = obj(obj(perf[nome].mm).origem); Object.keys(o).forEach(function (k) { (origem[o[k]] = origem[o[k]] || []).indexOf(k) < 0 && origem[o[k]].push(k); }); });
    var notaOrig = Object.keys(origem).length ? "Origem das propriedades: " + Object.keys(origem).map(function (k) { return t(k) + " — " + origem[k].filter(function (x) { return /^(A|Ix|Iy|Wx|Wy|Zx|Zy|rx|ry|J|Cw|massa)$/.test(x); }).join(", "); }).filter(function (x) { return !/— $/.test(x); }).join("; ") + "." : "";
    h += h3(n + (GM ? ".5" : ".4"), "Perfis");
    h += d.tab("Perfis — dimensões e área", ["Perfil", thn("d (mm)"), thn("bf (mm)"), thn("tw (mm)"), thn("tf (mm)"), thn("A (cm²)"), thn("Massa (kg/m)")], lg);
    h += d.tab("Perfis — propriedades geométricas", ["Perfil", thn("Ix (cm⁴)"), thn("Wx (cm³)"), thn("Zx (cm³)"), thn("rx (cm)"), thn("Iy (cm⁴)"), thn("Wy (cm³)"), thn("ry (cm)"), thn("J (cm⁴)"), thn("Cw (cm⁶)")], lpz,
      { nota: (notaOrig ? notaOrig + "<br>" : "") + (fontes.length ? "Catálogos: " + unicos(fontes).join("; ") + "." : "") });
    return h;
  }

  /* ---------- 4. ações */
  function secAcoes(c, d, n) {
    var h = "", cg = obj(c.parE.cargas), cg2 = obj(c.par.cargas), P = PADRAO_CARGAS, L = c.L;
    function val(k) { var v = cg[k] != null ? cg[k] : cg2[k]; return { v: num(v, P[k]), padrao: v == null || v === "" }; }
    var vT = val("telhaPeso"), vE = val("permanenteExtra"), vMt = val("tercaMassa"), vMtr = val("travessaMassa"), vF = val("fechamentoPeso");
    var acr = num(c.par.acrescimoLigacoes, 0.05), eTr = num(c.par.espTravessaMax, 2), vao = num(L.vao, NaN), Lt = num(L.Lt, NaN), co = num(L.co, Math.cos(Math.atan(num(L.i, 0)))), area = vao * Lt;
    var nLin = objs(c.G.linhasTerca).length, gFech = vF.v + vMtr.v * 9.81 / 1000 / eTr, Rf = 0, faces = [];
    c.membros.forEach(function (m) {
      if (m.papel !== "pilar") return; var fn = m.lado ? "direita" : "esquerda", f = obj(obj(c.par.fechamentos)[fn]); if (!(f.tipo === "telha" || f.tipo === "misto")) return;
      if (faces.indexOf(fn) < 0) faces.push(fn);
      Rf += gFech * faixaZ(c, num(m.k, 0)) * Math.max(0, num(m.L, 0) - (f.tipo === "misto" ? num(f.alturaAlvenaria, 3) : 0));
    });
    var pp = 0; c.casos.forEach(function (k) { if (k.tipo === "G") pp += somaCargas(c, k).pesoProprio; });
    var Rt = vT.v / co * area, Re = vE.v * area, Rter = vMt.v * 9.81 / 1000 * Lt * nLin;
    var tel = obj(obj(c.op.fechamentos).telha), oriT = tel.modelo ? t(tel.fabricante) + " " + t(tel.modelo) + (fin(num(tel.peso_kN_m2, NaN)) ? " — catálogo: " + un(num(tel.peso_kN_m2, NaN), 4, "kN/m²") : "") : (vT.padrao ? "valor adotado no cálculo" : "informado no projeto");
    if (tel.modelo && fin(num(tel.peso_kN_m2, NaN)) && Math.abs(num(tel.peso_kN_m2, NaN) - vT.v) > 0.005) d.aviso("Peso da telha usado no cálculo (" + br(vT.v, 3) + " kN/m²) difere do catálogo do fabricante (" + br(num(tel.peso_kN_m2, NaN), 4) + " kN/m²).");
    function pad(x) { return x.padrao ? " (adotado)" : ""; }
    var cG = c.caso.G ? "G" : "—", cG2 = c.caso.G2 ? "G2" : cG;
    var lp = [
      trw([td("Peso próprio dos perfis (pórticos, colunas de tapamento e contraventamento)"), td("γ = " + un(c.Ana && fin(c.Ana.GAMMA_ACO) ? c.Ana.GAMMA_ACO : 78.5, 1, "kN/m³") + " × área da seção × " + br(1 + acr, 2)), td("NBR 6120:2019, Tabela 1; acréscimo de " + br(acr * 100, 0) + " % para chapas, parafusos e enrijecedores (premissa)"), td(cG), tn(pp > 0 ? br(pp, 2) : "—")]),
      trw([td("Terças (peso aplicado nos nós das linhas de terça)"), td(un(vMt.v, 2, "kg/m") + pad(vMt) + "; " + plural(nLin, "linha", "linhas")),
        td(c.r.tercas && c.r.tercas.ok !== false && c.r.tercas.perfil ? "massa linear da terça dimensionada: " + t(c.r.tercas.perfil) + " (" + secao("dimensionamento") + ")" : "valor adotado (premissa de carga, " + S("avisos") + ".2)"), td(cG), tn(br(Rter, 2))]),
      trw([td("Telha da cobertura"), td(un(vT.v, 3, "kN/m²") + " na superfície (÷ cos θ em projeção)" + pad(vT)), td(oriT), td(cG2), tn(br(Rt, 2))]),
      trw([td("Instalações, forro e isolamento"), td(un(vE.v, 3, "kN/m²") + " em projeção" + pad(vE)), td("NBR 6120:2019, 6.4: instalações, forro, isolamento e painéis são ações permanentes"), td(cG2), tn(br(Re, 2))])
    ];
    if (faces.length) lp.push(trw([td("Fechamento lateral em telha e travessas (" + faces.map(function (f) { return faceTxt(c, f); }).join(" e ") + ")"), td(un(vF.v, 3, "kN/m²") + pad(vF) + " + travessas " + un(vMtr.v, 2, "kg/m") + pad(vMtr) + " a cada " + un(eTr, 2, "m")), td("valor adotado (premissa de carga), aplicado aos pilares"), td(cG2), tn(br(Rf, 2))]));
    var trL = obj(c.r.travessas).lateral;
    if (faces.length && trL && trL.ok !== false && fin(num(trL.massa, NaN)) && Math.abs(num(trL.massa, 0) - vMtr.v) > 0.05) d.aviso("Massa da travessa nas cargas permanentes (" + br(vMtr.v, 2) + " kg/m) difere da travessa dimensionada (" + t(trL.perfil) + ", " + br(num(trL.massa, NaN), 2) + " kg/m).");
    var esperado = pp + Rter + Rt + Re + Rf, aplicado = 0, completo = true;
    c.casos.forEach(function (k) { if (k.tipo !== "G") return; var s = somaCargas(c, k); if (!s.completo) completo = false; aplicado += -s.F[1]; });
    lp.push(trw([td("<b>Total das ações permanentes</b>"), td(""), td(completo ? "aplicado ao modelo (Σ dos casos permanentes): " + un(aplicado, 2, "kN") : "lista de cargas do resultado incompleta: conferência não feita"), td(""), tn("<b>" + br(esperado, 2) + "</b>")], "tot"));
    if (completo && Math.abs(esperado - aplicado) > Math.max(0.5, 0.01 * Math.abs(aplicado))) d.aviso("Ações permanentes declaradas na " + secao("acoes") + " (" + br(esperado, 2) + " kN) diferem das aplicadas ao modelo (" + br(aplicado, 2) + " kN): os valores da tabela não são os aplicados ao modelo.");
    h += h3(n + ".1", "Ações permanentes");
    h += d.tab("Ações permanentes — valores, origem e resultante no modelo", ["Componente", "Valor", "Origem", "Caso", thn("Resultante (kN)")], lp,
      { nota: "Resultante vertical de cada componente sobre toda a estrutura (área em planta " + un(area, 2, "m²") + "). Coeficientes de ponderação por caso na " + secao("combinacoes") + "." });
    /* sobrecarga */
    var sb = obj(c.r.sobrecarga);
    h += h3(n + ".2", "Sobrecarga de cobertura");
    h += "<p>" + t(sb.texto || "Sobrecarga de cobertura conforme a NBR 6120:2019, 6.4.") + " Referência: " + t(sb.referencia || "ABNT NBR 6120:2019, 6.4") + ".</p>";
    if (sb.concentradaTexto) h += "<p>" + t(sb.concentradaTexto) + (concentradaNaTerca(c.r) ? " Verificação feita no dimensionamento das terças (" + secao("dimensionamento") + ")." : " Essa verificação pertence ao dimensionamento das terças e não consta deste cálculo (" + S("avisos") + ".4).") + "</p>";
    arr(sb.avisos).forEach(function (a) { d.aviso("Sobrecarga: " + String(a)); });
    /* vento */
    h += h3(n + ".3", "Vento");
    h += c.vento ? ventoCompleto(c, d, n + ".3") : ventoManual(c, d);
    /* resumo dos casos */
    var lc = c.casos.map(function (k) {
      var s = somaCargas(c, k);
      return trw([td(esc(k.id)), td(t(k.nome || k.id)), td(esc(k.tipo || "—")), td(t(k.categoria || (k.tipo === "W" ? "vento" : "—"))), tn(s.completo ? br(s.F[0], 2) : "—"), tn(s.completo ? br(s.F[1], 2) : "—"), tn(s.completo ? br(s.F[2], 2) : "—")]);
    });
    h += h3(n + ".4", "Resumo dos casos de carga");
    h += d.tab("Casos de carga aplicados ao modelo e resultante das cargas (eixos globais)", ["Caso", "Descrição", "Tipo", "Categoria", thn("ΣFx (kN)"), thn("ΣFy (kN)"), thn("ΣFz (kN)")], lc,
      { nota: "ΣFy negativo: carga para baixo. Valores característicos (sem coeficientes de ponderação). A comparação com as reações está na " + secao("reacoes") + "." });
    return h;
  }
  function ventoManual(c, d) {
    var ws = c.casos.filter(function (k) { return k.tipo === "W"; }), h = "";
    if (!ws.length) {
      d.aviso("Nenhum caso de vento foi aplicado ao modelo: a estrutura não foi verificada para o vento.");
      return caixa("<b>Nenhum caso de vento foi aplicado ao modelo.</b> A estrutura não foi verificada para a ação do vento (NBR 6123); o cálculo tem de ser refeito com o vento antes do uso.", true);
    }
    h += "<p>Os casos de vento deste cálculo foram informados diretamente ao modelo, como pressões por face, sem o cálculo da NBR 6123 pelo sistema (velocidade básica, fatores S1, S2 e S3 e coeficientes de pressão). A determinação dessas pressões (NBR 6123) não faz parte deste memorial (" + S("avisos") + ".4).</p>";
    h += d.tab("Casos de vento aplicados ao modelo (informados)", ["Caso", "Descrição", "Direção", thn("ΣFx (kN)"), thn("ΣFy (kN)"), thn("ΣFz (kN)")],
      ws.map(function (k) { var s = somaCargas(c, k); return trw([td(esc(k.id)), td(t(k.nome || k.id)), td(fin(num(k.direcao, NaN)) ? dirTxt(c, k.direcao) : "—"), tn(s.completo ? br(s.F[0], 2) : "—"), tn(s.completo ? br(s.F[1], 2) : "—"), tn(s.completo ? br(s.F[2], 2) : "—")]); }),
      { nota: "Resultante das cargas de vento aplicadas a toda a estrutura; ΣFy positivo indica sucção resultante na cobertura." });
    return h;
  }
  function ventoCompleto(c, d, n) {
    var v = c.vento, h = "", info = obj(v.v0Info), mapa = obj(info.mapa), lat = num(info.lat, num(obj(c.op.obra).lat, NaN)), lon = num(info.lon, num(obj(c.op.obra).lon, NaN));
    if (v.ok === false) h += caixa("<b>O cálculo do vento terminou com erro:</b> " + arr(v.erros).map(function (e) { return t(e); }).join("; "), true);
    h += "<p>Ação do vento calculada pela " + t(v.edicaoVigente || v.norma || "NBR 6123") + ", a partir da localização da obra e das dimensões do galpão: velocidade básica, fatores S1, S2 e S3, pressão dinâmica, coeficientes de pressão externa e interna e casos de carga. Os coeficientes são os das tabelas da norma" + (v.edicao && v.edicaoVigente && String(v.edicao) !== String(v.edicaoVigente) ? " (tabelas da " + t(v.edicao) + ", mantidas na edição de 2023)" : "") + ", citadas em cada passo.</p>";
    /* V0 */
    h += h4(n + ".1 Velocidade básica V0");
    var por = info.origem === "isopletas" ? t(mapa.texto || "", "texto do V0") : "V0 informado: " + un(num(v.v0, NaN), 1, "m/s") + (info.descricao ? " (" + t(info.descricao) + ")" : "") + "." + (fin(num(mapa.v0Adotado, NaN)) ? " O mapa de isopletas indica " + un(num(mapa.v0Adotado, NaN), 0, "m/s") + " para o local." : "");
    h += "<p>" + por + "</p>";
    var F = c.iso && c.iso.FONTE ? c.iso.FONTE : null;
    if (F) h += '<p class="nota">' + t(F.definicaoV0) + " " + t(F.estudoEspecifico) + "</p>";
    var lv = [];
    if (info.descricao) lv.push(trw([td("Local"), td(t(info.descricao))]));
    if (fin(lat) && fin(lon)) lv.push(trw([td("Coordenadas da obra"), td(br(lat, 4) + "°; " + br(lon, 4) + "°")]));
    if (arr(mapa.entre).length) lv.push(trw([td("Isopletas vizinhas"), td(arr(mapa.entre).filter(fin).map(function (x) { return un(x, 0, "m/s"); }).join(" e ") + (arr(mapa.distanciasKm).filter(fin).length ? " — distâncias: " + arr(mapa.distanciasKm).filter(fin).map(function (x) { return un(x, 0, "km"); }).join(" e ") : ""))]));
    if (mapa.metodo) lv.push(trw([td("Método"), td(t(mapa.metodo))]));
    if (fin(num(mapa.v0Interpolado, NaN))) lv.push(trw([td("V0 no ponto (interpolado)"), td(un(num(mapa.v0Interpolado, NaN), 2, "m/s") + (arr(mapa.v0Faixa).filter(fin).length === 2 ? " (faixa pela precisão do mapa: " + br(mapa.v0Faixa[0], 2) + " a " + br(mapa.v0Faixa[1], 2) + " m/s)" : ""))]));
    lv.push(trw([td("<b>V0 adotado</b>"), td("<b>" + un(num(v.v0, NaN), 0, "m/s") + "</b>" + (info.origem === "isopletas" ? " (valor interpolado arredondado para cima)" : " (informado)"))]));
    if (mapa.fonte) lv.push(trw([td("Fonte"), td(t(mapa.fonte))]));
    h += d.tab("Velocidade básica do vento V0", ["Item", "Valor"], lv, { classe: "ficha" });
    if (c.iso && typeof c.iso.svgMapa === "function" && fin(lat) && fin(lon)) {
      var m1 = "", m2 = "", dk = arr(mapa.distanciasKm).filter(fin), zoom = Math.max(150, Math.min(700, (dk.length ? Math.max.apply(null, dk) : 300) * 1.25));
      try { m1 = c.iso.svgMapa(lat, lon, { largura: 318, rotulo: "Obra" }); m2 = c.iso.svgMapa(lat, lon, { largura: 318, rotulo: "Obra", zoomKm: zoom }); } catch (e) { d.aviso("Mapa de isopletas não gerado: " + (e && e.message)); }
      if (m1) h += d.fig('<div class="par">' + m1 + m2 + "</div>", "Mapa de isopletas da velocidade básica V0 (m/s) com a obra marcada; à direita, ampliação da região da obra com as distâncias às isopletas vizinhas. Fonte: " + t((F && F.citacao) || "NBR 6123, Figura 1") + ".");
    } else h += '<p class="nota">Mapa de isopletas não incluído: módulo do mapa indisponível ou coordenadas da obra não informadas.</p>';
    /* fatores */
    h += h4(n + ".2 Fatores S1, S2 e S3, velocidade característica e pressão dinâmica");
    var pd = obj(v.porDirecao), ld = Object.keys(pd).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) {
      var p = obj(pd[k]), s2 = obj(p.s2Info);
      return trw([td(dirTxt(c, Number(k))), td(esc(p.classe || "—")), tn(br(num(p.dimFrontal, NaN), 2)), tn(br(num(p.z, NaN), 2)), tn(br(num(s2.b, NaN), 2)), tn(br(num(s2.p, NaN), 3)), tn(br(num(s2.Fr, NaN), 2)), tn(br(num(p.s1, NaN), 3)), tn(br(num(p.s2, NaN), 4)), tn(br(num(v.s3, NaN), 2)), tn(br(num(p.vk, NaN), 2)), tn(br(num(p.q, NaN), 4))]);
    });
    h += d.tab("Fatores e pressão dinâmica por direção (categoria " + esc(obj(v.s2).categoria || "—") + ", grupo " + esc(obj(v.s3Info).grupo || "—") + " de S3)", ["Direção", "Classe", thn("Dim. frontal (m)"), thn("z (m)"), thn("b"), thn("p"), thn("Fr"), thn("S1"), thn("S2"), thn("S3"), thn("Vk (m/s)"), thn("q (kN/m²)")], ld,
      { nota: "Vk = V0·S1·S2·S3; q = 0,613·Vk² (N/m²). Para vedações e estrutura secundária: q = " + un(num(v.qLocal, NaN), 4, "kN/m²") + " (estrutura secundária) e " + un(num(v.qVedacao, NaN), 4, "kN/m²") + " (vedações)." });
    /* memória */
    h += h4(n + ".3 Memória de cálculo do vento");
    h += d.tab("Memória de cálculo do vento, passo a passo", ["Nº", "Passo", "Expressão", "Valores", thn("Resultado"), "Referência"],
      objs(v.memoria).map(function (m) { return trw([tn(String(m.n || "")), td(t(m.passo)), td(tv(m.formula)), td(tv(m.valores, "vento: " + m.passo)), td(tv(m.resultadoTexto || m.resultado), "r"), td(tv(m.referencia) + (m.interpolado ? " (interpolado)" : ""))]); }), { classe: "memv compacta" });
    /* cpe */
    h += h4(n + ".4 Coeficientes de pressão externa");
    var dirs = arr(obj(v.simetria).direcoes).length ? arr(v.simetria.direcoes) : Object.keys(obj(obj(v.cpe).paredes)).map(Number);
    function zonas(o) { return Object.keys(obj(o)).map(function (z) { return esc(z) + ": " + br(num(o[z], NaN), 2); }).join("; "); }
    h += d.tab("Coeficientes de pressão externa cpe por zona", ["Vento", "Paredes", "Cobertura"], dirs.map(function (k) { return trw([td(dirTxt(c, k)), td(zonas(obj(obj(v.cpe).paredes)[k])), td(zonas(obj(obj(v.cpe).cobertura)[k]))]); }),
      { nota: tv(obj(v.cpe).fonte || "") + (obj(obj(v.cpe).locais).paredes != null ? ". cpe médio das zonas de borda (só vedações, fixações e estrutura secundária — NBR 6123, 6.1.2): paredes " + br(num(v.cpe.locais.paredes, NaN), 2) + "; cobertura " + zonas(obj(v.cpe.locais.cobertura)) : "") + "." });
    dirs.forEach(function (k) { h += d.fig(svgZonas(c, v, k), "Zonas de pressão externa e coeficientes cpe — vento " + dirTxt(c, k) + ". Planta: cobertura ao centro; paredes rebatidas nas bordas."); });
    /* cpi */
    h += h4(n + ".5 Pressão interna");
    var vis = {}, lcpi = objs(v.cpi).filter(function (x) { var k = x.direcao + "|" + x.valor; if (vis[k]) return false; vis[k] = true; return true; }).map(function (x) { return trw([td(dirTxt(c, x.direcao)), tn(br(num(x.valor, NaN), 2)), td(t(x.cenarioNome || x.cenario)), td(tv(x.motivo)), td(tv(x.referencia))]); });
    h += d.tab("Coeficientes de pressão interna cpi e o motivo da escolha", ["Vento", thn("cpi"), "Situação", "Motivo", "Referência"], lcpi);
    /* casos */
    h += h4(n + ".6 Casos de vento");
    h += "<p>Em cada caso, a pressão em cada zona é p = q·(cpe − cpi): positiva empurra a face para dentro (parede) ou para baixo (cobertura); negativa é sucção.</p>";
    /* nome do caso no modelo (o orquestrador renomeia: V0_cpi-0,3 → W0a; r.ventoCasos[].origem guarda o id do vento) */
    var noModelo = {}; objs(c.r.ventoCasos).forEach(function (x) { if (x.origem) noModelo[x.origem] = x.id; });
    objs(v.casos).forEach(function (cs) {
      var lin = [];
      ["esquerda", "direita", "frente", "fundo"].forEach(function (f) { objs(obj(obj(cs.pressao).paredes)[f]).forEach(function (z) { lin.push(trw([td(faceTxt(c, f)), td(esc(z.zona)), td(br(num(z.s0, NaN), 2) + " a " + br(num(z.s1, NaN), 2)), tn(br(num(z.cpe, NaN), 2)), tn(br(num(z.coef, NaN), 3)), tn(br(num(z.p, NaN), 4))])); }); });
      objs(obj(cs.pressao).cobertura).forEach(function (z) { lin.push(trw([td("cobertura" + (z.agua ? ", água " + esc(z.agua) : "")), td(esc(z.zona)), td("x " + br(num(z.x0, NaN), 2) + "–" + br(num(z.x1, NaN), 2) + "; z " + br(num(z.z0, NaN), 2) + "–" + br(num(z.z1, NaN), 2)), tn(br(num(z.cpe, NaN), 3)), tn(br(num(z.coef, NaN), 3)), tn(br(num(z.p, NaN), 4))])); });
      h += d.tab("Caso " + esc(cs.id) + (noModelo[cs.id] ? " (no modelo: " + esc(noModelo[cs.id]) + ")" : "") + " — " + t(cs.nome) + "; q = " + un(num(cs.q, NaN), 4, "kN/m²") + " (classe " + esc(cs.classe || "—") + ")", ["Face", "Zona", "Trecho (m)", thn("cpe"), thn("cpe − cpi"), thn("p (kN/m²)")], lin,
        { nota: arr(cs.cpiMotivo).map(function (x) { return tv(x); }).join(" ") + (cs.atrito ? " Força de atrito (6.4): " + un(num(cs.atrito.total, NaN), 2, "kN") + " (" + tv(cs.atrito.referencia) + ")." : "") });
    });
    var ex = obj(v.excentricidade); if (ex.nota) h += '<p class="nota">' + tv(ex.nota) + (fin(num(ex.ea, NaN)) ? ": ea = " + un(ex.ea, 2, "m") + ", eb = " + un(num(ex.eb, NaN), 2, "m") : "") + ". " + tv(ex.referencia || "") + "</p>";
    arr(v.avisos).forEach(function (a) { d.aviso("Vento: " + String(a)); });
    /* conferência: casos do modelo × casos do vento */
    var idsM = c.casos.filter(function (k) { return k.tipo === "W"; }).map(function (k) { return k.id; }), idsV = objs(v.casos).map(function (k) { return k.id; });
    var vcs = objs(c.r.ventoCasos), faltam, sobram;
    if (vcs.length) {   /* com a tabela de correspondência do orquestrador: cada caso do vento tem de virar um caso do modelo, e vice-versa */
      var orig = vcs.map(function (x) { return x.origem; }), idsVC = vcs.map(function (x) { return x.id; });
      faltam = idsV.filter(function (id) { return orig.indexOf(id) < 0 || idsM.indexOf(noModelo[id]) < 0; }); sobram = idsM.filter(function (id) { return idsVC.indexOf(id) < 0; });
    } else { faltam = idsV.filter(function (id) { return idsM.indexOf(id) < 0; }); sobram = idsM.filter(function (id) { return idsV.indexOf(id) < 0; }); }
    if (faltam.length || sobram.length) {
      var msg = "Os casos de vento aplicados ao modelo (" + (idsM.length ? idsM.join(", ") : "nenhum") + ") não correspondem aos calculados nesta seção (" + (idsV.length ? idsV.join(", ") : "nenhum") + "): os resultados do modelo não correspondem ao vento desta seção.";
      d.aviso(msg); h += caixa("<b>Divergência:</b> " + esc(msg), true);
    }
    return h;
  }

  /* ---------- 5. combinações */
  function secCombinacoes(c, d, n) {
    var h = "<p>Combinações últimas normais: F<sub>d</sub> = Σ γ<sub>g</sub>·F<sub>G,k</sub> + γ<sub>q1</sub>·F<sub>Q1,k</sub> + Σ γ<sub>qj</sub>·ψ<sub>0j</sub>·F<sub>Qj,k</sub>. " +
      "Combinações de serviço raras: F<sub>ser</sub> = Σ F<sub>G,k</sub> + F<sub>Q1,k</sub> + Σ ψ<sub>1j</sub>·F<sub>Qj,k</sub>; quase permanentes: F<sub>ser</sub> = Σ F<sub>G,k</sub> + Σ ψ<sub>2j</sub>·F<sub>Qj,k</sub>. " +
      "Expressões da NBR 8800 (4.7.7.2.1 e 4.7.7.3 na numeração de 2008), iguais na revisão de 2024. A ação permanente favorável entra com γ = 1,00 (combinações de vento com sucção).</p>";
    var C = c.Car;
    if (C && C.GAMA_F && C.PSI) {
      var vis = {}, lin = [];
      /* ⚠ mesmo mapeamento de categoria do AcoCargas.combinacoes(): G pela categoria (padrão "G-metalica"); W pelo "W";
         variável pela categoria, com γ da linha "Q" quando a categoria não tem γ próprio (é o caso de "Q-cobertura") */
      c.casos.forEach(function (k) {
        var cat = k.tipo === "W" ? "W" : (k.categoria || (k.tipo === "G" ? "G-metalica" : "Q-cobertura")); if (vis[cat]) { vis[cat].ids.push(k.id); return; }
        var gf = k.tipo === "W" ? C.GAMA_F.W : k.tipo === "G" ? (C.GAMA_F[cat] || C.GAMA_F["G-metalica"]) : (C.GAMA_F[cat] || C.GAMA_F.Q);
        var ps = k.tipo === "G" ? null : (C.PSI[cat] || C.PSI["Q-cobertura"]);
        vis[cat] = { ids: [k.id], gf: gf, ps: ps, cat: cat, tipo: k.tipo };
      });
      var maiores = [];
      Object.keys(vis).forEach(function (cat) {
        var x = vis[cat], gf = obj(x.gf), ps = obj(x.ps), acao = t(gf.nome || cat) + (x.ps && x.tipo !== "W" && ps.nome ? "; ψ: " + t(ps.nome) : "");
        var g24 = GAMA_2024[cat] != null ? GAMA_2024[cat] : (x.tipo === "W" ? GAMA_2024.W : x.tipo === "G" ? null : GAMA_2024.Q), dsf = num(gf.desf, NaN);
        if (fin(g24) && fin(dsf) && dsf > g24 + 1e-9) maiores.push(t(gf.nome || cat) + " (" + br(dsf, 2) + "; na revisão de 2024, " + br(g24, 2) + ")");
        lin.push(trw([td(x.ids.map(esc).join(", ")), td(acao), tn(br(dsf, 2)), tn(fin(g24) ? br(g24, 2) : "—"), tn(fin(num(gf.fav, NaN)) ? br(gf.fav, 2) : "—"), tn(x.ps ? br(num(ps.psi0, NaN), 1) : "—"), tn(x.ps ? br(num(ps.psi1, NaN), 1) : "—"), tn(x.ps ? br(num(ps.psi2, NaN), 1) : "—")]));
      });
      h += d.tab("Coeficientes de ponderação γf e fatores de combinação ψ", ["Casos", "Ação", thn("γf usado"), thn("γf (2024)"), thn("γf fav."), thn("ψ0"), thn("ψ1"), thn("ψ2")], lin,
        { nota: "γf usado: Tabela 1 da NBR 8800, valores da edição de 2008; coluna 2024: Tabela 1 da revisão de 2024. " +
          (maiores.length ? "O cálculo usa valor maior que o da revisão de 2024 em: " + maiores.join("; ") + " — a favor da segurança; nas demais ações, valores iguais. " : "Valores iguais nas duas edições. ") +
          "ψ: Tabela 2, iguais nas edições de 2008 e 2024." });
      /* conferência: todo fator das combinações últimas tem de sair desta tabela (γ, γ favorável ou γ·ψ0) */
      c.elu.forEach(function (k) {
        Object.keys(obj(k.fatores)).forEach(function (cid) {
          var cs = c.caso[cid]; if (!cs) return;
          var x = vis[cs.tipo === "W" ? "W" : (cs.categoria || (cs.tipo === "G" ? "G-metalica" : "Q-cobertura"))]; if (!x) return;
          var f = num(k.fatores[cid], NaN), g = obj(x.gf), p = obj(x.ps), aceitos = cs.tipo === "G" ? [g.desf, g.fav] : [g.desf, num(g.desf, NaN) * num(p.psi0, NaN)];
          if (!aceitos.some(function (a) { return fin(a) && Math.abs(a - f) < 1e-6; })) d.aviso("Combinação " + k.id + ": o fator " + br(f, 2) + " do caso " + cid + " não corresponde aos coeficientes da tabela de γf e ψ da " + secao("combinacoes") + ".");
        });
      });
    }
    function nocTxt(k) { var no = obj(k.nocional); if (!fin(num(no.fracao, NaN))) return ""; var dv = arr(no.dir).map(Number), eixo = Math.abs(dv[0] || 0) > 0.5 ? (dv[0] > 0 ? "+X" : "−X") : Math.abs(dv[2] || 0) > 0.5 ? (dv[2] > 0 ? "+Z" : "−Z") : "X/Z"; return "; nocional " + br(no.fracao * 100, 1) + " % em " + eixo; }
    var lc = c.combs.map(function (k) {
      var an = obj(c.an[k.id]), it = fin(num(an.iteracoes, NaN)) ? " (" + plural(an.iteracoes, "iteração", "iterações") + (an.convergiu === false ? ", NÃO convergiu" : "") + ")" : "";
      if (an.convergiu === false) d.aviso("Combinação " + k.id + ": a análise de 2ª ordem não convergiu.");
      return trw([td(esc(k.id)), td(esc(k.tipo)), td(t(k.descricao)), td(t(k.nome)), td(k.tipo === "ELU" ? (k.segundaOrdem ? "2ª ordem" : "1ª ordem") + it + nocTxt(k) : "1ª ordem")]);
    });
    h += d.tab("Combinações de ações analisadas", ["Id", "Tipo", "Combinação", "Ação principal", "Análise"], lc,
      { nota: "ELU: combinação última normal; ELS-rara e ELS-qp: combinações de serviço rara e quase permanente. Força nocional: força horizontal equivalente às imperfeições geométricas iniciais, em fração das cargas gravitacionais de cálculo." });
    return h;
  }

  /* ---------- 6. modelo e análise */
  function secModelo(c, d, n) {
    var M = c.M, an = obj(c.r.analise), bs = objs(M.barras), cont = { pilar: 0, viga: 0, tapamento: 0, escora: 0, contravento: 0, outra: 0 }, rotIJ = 0, rotJ = 0, trac = 0;
    bs.forEach(function (b) { cont[classeBarra(c, b)] = (cont[classeBarra(c, b)] || 0) + 1; var lb = obj(b.libera); if (lb.i && lb.j) rotIJ++; else if (lb.j || lb.i) rotJ++; if (b.tracao) trac++; });
    var ap = objs(M.apoios), a0 = ap[0] || {}, rest = [];
    if (a0.ux && a0.uy && a0.uz) rest.push("translações nas três direções"); if (a0.ry) rest.push("rotação em torno do eixo vertical"); if (a0.rz) rest.push("rotação no plano do pórtico"); if (a0.rx) rest.push("rotação fora do plano do pórtico");
    var h = h3(n + ".1", "Modelo estrutural");
    h += "<p>A estrutura foi analisada como pórtico espacial, com barras de seis graus de liberdade por nó (método dos deslocamentos): todos os pórticos, as colunas de tapamento, as terças e travessas como escoras e o contraventamento num único modelo. As terças e travessas entram no modelo como escoras birrotuladas, que transmitem as forças longitudinais e travam os pórticos; " +
      (c.r.tercas || c.r.travessas ? "o dimensionamento delas é feito à parte, como vigas biapoiadas entre pórticos (" + secao("dimensionamento") + ")." : "o dimensionamento delas não faz parte deste cálculo (" + S("avisos") + ".4).") + "</p>";
    var lm = [
      trw([td("Nós"), tn(String(objs(M.nos).length || num(an.nNos, 0)))]), trw([td("Barras"), tn(String(bs.length))]),
      trw([td("— pilares e vigas (segmentos)"), tn(String(cont.pilar + cont.viga))]), trw([td("— colunas de tapamento (segmentos)"), tn(String(cont.tapamento))]),
      trw([td("— escoras (terças e travessas)"), tn(String(cont.escora))]), trw([td("— contraventamento"), tn(String(cont.contravento))]),
      trw([td("Elementos finitos de barra"), tn(fin(num(an.nElem, NaN)) ? String(an.nElem) : "—")]), trw([td("Graus de liberdade"), tn(fin(num(an.nGL, NaN)) ? String(an.nGL) : "—")]),
      trw([td("Apoios (restringem " + (rest.length ? rest.join(", ") : "—") + ")"), tn(String(ap.length))]),
      trw([td("Barras rotuladas nas duas extremidades"), tn(String(rotIJ))]), trw([td("Barras rotuladas em uma extremidade"), tn(String(rotJ))]),
      trw([td("Barras só de tração (saem do modelo quando comprimidas)"), tn(String(trac))])
    ];
    h += d.tab("Dados do modelo de cálculo", ["Item", thn("Quantidade")], lm);
    h += d.fig(svg3D(c, { titulo: "Modelo de cálculo", legenda: true, apoios: true }), "Modelo de cálculo: barras por tipo e apoios.");
    h += h3(n + ".2", "Eixos e convenções");
    h += "<p>Eixos globais: X ao longo do vão (do eixo A para o eixo " + esc(c.eixos.xs.length ? letra(c.eixos.xs.length - 1) : "—") + "), Y vertical para cima e Z ao longo do comprimento (do eixo 1 para o eixo " + c.eixos.zs.length + "). Eixos locais das barras: x do nó inicial para o final e y na direção da altura da seção. Esforço normal N positivo de tração; momento Mz positivo comprime a face +y (mesa interna do pilar, mesa superior da viga). Nas tabelas de dimensionamento, Mx é o momento em torno do eixo de maior inércia (Mz da análise) e My em torno do de menor inércia.</p>";
    h += h3(n + ".3", "Análise de 2ª ordem e imperfeições");
    var dl = obj(c.r.deslocabilidade), decA = objs(c.r.decisoes).filter(function (x) { return x.tema === "Análise estrutural"; })[0];
    var nElu = c.elu.length, n2 = c.elu.filter(function (k) { return k.segundaOrdem; }).length;
    h += "<p>As " + nElu + " combinações últimas foram analisadas " + (n2 === nElu ? "em 2ª ordem" : "(" + n2 + " em 2ª ordem)") + " — efeitos P-Δ e P-δ, com a matriz de rigidez geométrica iterada com o esforço normal até a convergência — com forças nocionais que representam as imperfeições geométricas iniciais. As combinações de serviço e os casos isolados foram analisados em 1ª ordem.</p>";
    if (fin(num(dl.razao, NaN))) h += "<p>Deslocabilidade: a maior razão entre o deslocamento horizontal de 2ª ordem e o de 1ª ordem no topo dos pilares foi Δ2/Δ1 = " + br(dl.razao, 3) + ", estrutura de <b>" + esc(dl.classe || "—") + "</b> deslocabilidade" + (decA ? " (" + t(decA.motivo) + ")" : "") + ".</p>";
    if (dl.classe === "grande") h += caixa("<b>Grande deslocabilidade.</b> Com Δ2/Δ1 acima do limite da norma, a NBR 8800 exige análise rigorosa; recomenda-se aumentar a rigidez lateral (perfis maiores, bases engastadas ou mísulas) e refazer o cálculo.", true);
    h += h3(n + ".4", "Flambagem global");
    var fl = objs(c.r.flambagem);
    if (fl.length) {
      h += d.tab("Fator de carga crítica de flambagem global λcr (análise de autovalor)", ["Combinação", "Descrição", thn("λcr (1º modo)"), thn("2º modo")], fl.map(function (f) { var ms = objs(f.modos); return trw([td(esc(f.combinacao)), td(t(f.nome)), tn(br(num(f.lambda, NaN), 3)), tn(ms[1] ? br(num(ms[1].lambda, NaN), 3) : "—")]); }),
        { nota: "λcr é o fator pelo qual a combinação de cálculo teria de ser multiplicada para a estrutura flambar globalmente. Valor negativo: a instabilidade só ocorreria com as cargas em sentido oposto ao da combinação (caso de sucção do vento), sem significado para o carregamento real." });
      var dec = objs(c.r.decisoes).filter(function (x) { return x.tema === "Flambagem global"; })[0];
      if (dec) h += "<p>" + t(cap(dec.decisao)) + ". " + t(cap(dec.motivo)) + ".</p>";
    } else h += "<p>A análise de flambagem global não consta do resultado.</p>";
    h += h3(n + ".5", "Decisões do sistema");
    h += "<p>As decisões abaixo foram tomadas pelo sistema a partir da geometria, dos fechamentos, das telhas e dos resultados da análise; o motivo de cada uma fica registrado.</p>";
    h += d.tab("Decisões do sistema e o motivo de cada uma", ["Tema", "Decisão", "Motivo"], objs(c.r.decisoes).map(function (x) { return trw([td(t(x.tema)), td(t(cap(x.decisao), "decisão")), td(t(cap(x.motivo), "decisão"))]); }), { classe: "decisoes" });
    var ot = obj(c.r.otimizacao);
    if (objs(ot.historico).length) {
      h += h3(n + ".6", "Escolha dos perfis (otimização)");
      h += d.tab("Rodadas de cálculo da escolha dos perfis", ["Rodada", "Perfis alterados", thn("Barras/limites que falham"), thn("Peso (kg)")], objs(ot.historico).map(function (x) {
        var p = obj(x.perfis), tx2 = Object.keys(p).map(function (k) { return esc(k) + ": " + t(k === "contraventoDiametro" ? "Ø " + br(num(p[k], NaN), 1) + " mm" : p[k]); }).join("; ");
        return trw([tn(String(x.iteracao)), td(tx2 || "perfis iniciais"), tn(fin(num(x.falhas, NaN)) ? String(x.falhas) : "—"), tn(br(num(x.peso, NaN), 1))]);
      }), { nota: arr(ot.log).length ? arr(ot.log).map(function (x) { return t(x); }).join("<br>") : "Sem alteração de perfis." });
    }
    return h;
  }

  /* ---------- 7. método de cálculo e validação do programa */
  var SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  /* ⚠ DUAS ESCALAS em VALIDACAO: pynite e fsm.desvio são FRAÇÕES (0,0072) → pctTxt; secao e fsm.local/distorcional já
     estão EM PORCENTAGEM (0,82 = 0,82 %), como os testes do repositório imprimem → pcTxt. Trocar uma pela outra dá
     "82,00 %" (aconteceu no WIP 056cc38c); o teste do memorial confere o texto impresso contra a saída dos testes. */
  function pctTxt(x, casas) { return fin(x) ? br(x * 100, casas == null ? 2 : casas) + NB + "%" : "—"; }
  function pcTxt(x, casas) { return fin(x) ? br(x, casas == null ? 2 : casas) + NB + "%" : "—"; }
  function potTxt(x) { if (!(x > 0)) return "—"; var e = String(Math.ceil(Math.log(x) / Math.LN10)); return "10" + e.split("").map(function (ch) { return SUP[ch] || ch; }).join(""); }
  function secValidacao(c, d, n) {
    var r = c.r, V = VALIDACAO, an = obj(r.analise), dl = obj(r.deslocabilidade), sec = !!(r.tercas || r.travessas), lig = !!(r.ligacoes && objs(r.ligacoes.lista).length);
    var noc = NaN; c.elu.forEach(function (k) { var f = num(obj(k.nocional).fracao, NaN); if (fin(f) && !fin(noc)) noc = f; });
    var reduz = dl.classe && dl.classe !== "pequena", h = h3(n + ".1", "Método de cálculo");
    h += "<p>A estrutura foi calculada pelo OrçaPRO" + (c.op.versao ? " " + t(c.op.versao) : "") + ", módulo de estruturas de aço, nas etapas abaixo. Cada etapa usa o resultado da anterior, e todas estão documentadas neste memorial — dados, expressões, valores intermediários e resultados.</p>";
    var et = [
      ["Ações", "Peso próprio pela área das seções; cargas permanentes e sobrecarga de cobertura; " + (c.vento
        ? "vento calculado a partir da localização da obra: V0 pelo mapa de isopletas digitalizado, interpolado no ponto da obra entre as isopletas vizinhas; fatores S1, S2 e S3; coeficientes de pressão externa por zona e de pressão interna pelas aberturas; um caso de carga para cada direção e cada pressão interna"
        : "pressões de vento por face, aplicadas ao modelo"), "NBR 6120; NBR 6123", secao("acoes")],
      ["Combinações", "Todas as combinações últimas normais e de serviço (raras e quase permanentes) entre os casos de carga, com ação permanente favorável quando ela alivia", "NBR 8681; NBR 8800", secao("combinacoes")],
      ["Análise estrutural", "Pórtico espacial pelo método dos deslocamentos: barras de Euler-Bernoulli com 12 graus de liberdade, rótulas por condensação estática; terças e travessas como escoras; contraventamento em barras só de tração (a diagonal comprimida sai do modelo, com iteração até o conjunto de barras ativas estabilizar)", "NBR 8800", secao("modelo")],
      ["2ª ordem e imperfeições", "Análise não linear geométrica (P-Δ e P-δ): matriz de rigidez geométrica consistente iterada com o esforço normal até a convergência, barras subdivididas para o efeito local; forças nocionais de " + (fin(noc) ? br(noc * 100, 1) + NB + "%" : "—") + " das cargas gravitacionais de cálculo (imperfeição geométrica); rigidez reduzida a 80 % quando a deslocabilidade não é pequena (imperfeição de material); deslocabilidade pela razão Δ2/Δ1, com os limites 1,13 e 1,55 da revisão de 2024", "NBR 8800:2024", secao("modelo")],
      ["Flambagem global", "Problema de autovalor com a rigidez geométrica em cada combinação última: fator de carga crítica λcr e forma dos modos", "—", secao("modelo")],
      ["Barras laminadas e soldadas", "Todas as barras, em todas as combinações últimas e em estações ao longo do comprimento, com os esforços de 2ª ordem: tração; compressão (flambagem por flexão, torção e flexo-torção, flambagem local por área efetiva); flexão (FLT com os trechos destravados de cada mesa e Cb, FLM, FLA); cortante; força axial com momentos. Comprimento de flambagem igual ao destravado (K = 1, análise de 2ª ordem com imperfeições)", "NBR 8800", secao("dimensionamento")]
    ];
    if (sec) et.push(["Terças e travessas (formados a frio)", "Vigas biapoiadas entre pórticos, em flexão oblíqua, com a mesa livre comprimida nas combinações de sucção; método da resistência direta, com as forças e os momentos críticos local, distorcional e global calculados pelo método das faixas finitas na própria seção", "NBR 14762:2010", secao("dimensionamento")]);
    if (lig) et.push(["Ligações", "Placas de base e chumbadores, ligação viga-pilar e emenda da cumeeira por chapa de extremidade, clipes de terça e ligações do contraventamento: parafusos, soldas, chapas, chumbadores e concreto sob a placa, com os esforços de todas as combinações últimas; escolhido o menor arranjo que atende", "NBR 8800; NBR 14762; AISC Design Guide 1 (placa de base)", secao("dimensionamento")]);
    et.push(["Estados-limites de serviço", "Deslocamentos nas combinações de serviço raras, em 1ª ordem, comparados aos limites", "NBR 8800" + (sec ? "; NBR 14762" : ""), secao("servico")]);
    if (objs(obj(r.otimizacao).historico).length) et.push(["Escolha dos perfis", "Para cada grupo, o perfil mais leve da mesma família que atende a todas as verificações; a análise é refeita a cada troca (rigidez e peso mudam) até fechar", "—", secao("modelo")]);
    h += d.tab("Etapas do cálculo e método de cada uma", ["Etapa", "Método", "Norma", "Neste memorial"], et.map(function (x) { return trw([td("<b>" + x[0] + "</b>"), td(x[1]), td(x[2]), td(x[3])]); }), { classe: "compacta metodo" });
    h += "<p>Neste projeto: " + plural(c.elu.length, "combinação última analisada", "combinações últimas analisadas") + " em 2ª ordem" + (fin(num(an.nGL, NaN)) ? ", num modelo de " + br(an.nGL, 0) + " graus de liberdade" : "") +
      (dl.classe ? "; deslocabilidade " + esc(dl.classe) + (fin(num(dl.razao, NaN)) ? " (Δ2/Δ1 = " + br(dl.razao, 3) + ")" : "") + (reduz ? ", com a rigidez reduzida a 80 %" : ", sem redução de rigidez") : "") +
      (fin(num(r.tempoMs, NaN)) ? "; tempo de processamento de " + un(r.tempoMs / 1000, 1, "s") : "") + ".</p>";
    /* validação: números das conferências do repositório (VALIDACAO; o teste do memorial os recalcula) */
    h += '<h3 class="nova-pag">' + n + ".2 Validação do programa</h3>";   /* a tabela tem quase uma página: começa em página nova (o cabeçalho ficava sozinho no pé) */
    h += "<p>Cada parte do programa é conferida contra uma referência independente — programa de análise estrutural de terceiros, bases de dados de perfis, exemplos resolvidos publicados e os exemplos da própria norma. As conferências são automáticas e repetidas a cada versão do programa; os resultados são estes:</p>";
    var P = V.pynite, S2 = V.secao, F = V.fsm, X = V.exemplos, W = V.vento, iso = c.iso && c.iso.MEDIDAS ? c.iso : null, lv = [];
    lv.push(trw([td("<b>Análise de 1ª ordem</b>"), td("PyNite — programa de análise matricial de pórticos espaciais, de código aberto: o mesmo galpão (pórticos de alma cheia, terças rotuladas, contraventamento em X só de tração na cobertura e nas paredes), com bases rotuladas e engastadas, sob peso próprio, permanente e vento nas duas direções"),
      td("Deslocamentos de todos os nós, reações e esforços normais: diferença relativa menor que " + potTxt(Math.max(P.primeira.desloc, P.primeira.reacao, P.primeira.N)) + " (resultados iguais); momento fletor máximo de cada barra: até " + pctTxt(P.primeira.Mz) + " do maior momento")]));
    lv.push(trw([td("<b>Análise de 2ª ordem</b>"), td("PyNite, análise P-Δ, nos mesmos modelos (bases rotuladas e engastadas)"),
      td("Deslocamentos até " + pctTxt(P.segunda.desloc) + "; reações até " + pctTxt(P.segunda.reacao) + "; esforços normais até " + pctTxt(P.segunda.N) + "; momentos até " + pctTxt(P.segunda.Mz) + " (relativo ao maior valor de cada combinação)")]));
    lv.push(trw([td("<b>Propriedades de perfis I laminados</b>"), td("Base de perfis do AISC (Shapes Database v15): " + S2.perfisW + " perfis W"),
      td("Área até " + pcTxt(S2.A) + "; Ix até " + pcTxt(S2.Ix) + "; Iy até " + pcTxt(S2.Iy) + "; Zx até " + pcTxt(S2.Zx) + "; Zy até " + pcTxt(S2.Zy) + "; Cw até " + pcTxt(S2.Cw) + "; J até " + pcTxt(S2.J))]));
    lv.push(trw([td("<b>Propriedades de tubos</b>"), td("Base do AISC: " + S2.tubos + " tubos retangulares e quadrados e tubos circulares"), td("Área, inércias e constante de torção até " + pcTxt(S2.tubosMax))]));
    lv.push(trw([td("<b>Propriedades de perfis formados a frio</b>"), td("sectionproperties — programa de elementos finitos para seções, de código aberto: " + S2.frio.secoes + " perfis Ue, Z e U com os cantos arredondados"),
      td("Área até " + pcTxt(S2.frio.A) + "; inércias até " + pcTxt(S2.frio.I) + "; Cw até " + pcTxt(S2.frio.Cw) + "; J até " + pcTxt(S2.frio.J) + "; centro de torção a até " + un(S2.frio.centro, 2, "mm"))]));
    lv.push(trw([td("<b>Flambagem elástica de perfis formados a frio (faixas finitas)</b>"), td("pycufsm (versão em Python do CUFSM 5): " + F.curvas + " curvas de assinatura (Ue, Z, U e cartola, em compressão e flexão), mesma malha; valores publicados por Pierin, Silva e La Rovere (2013) para " + F.publicados + " perfis"),
      td("Curvas: diferença até " + pctTxt(F.desvio, 3) + "; esforços críticos locais até " + pcTxt(F.local) + " dos publicados; distorcionais de " + pcTxt(F.distorcional[0], 1) + " a " + pcTxt(F.distorcional[1], 1) + " (sempre abaixo dos publicados: a favor da segurança)")]));
    lv.push(trw([td("<b>Dimensionamento (NBR 8800 e NBR 14762)</b>"), td(X.exemplos + " exemplos resolvidos publicados, com os passos de cálculo: manual Galpões para usos gerais (Instituto Aço Brasil/CBCA), guia de ligações da Gerdau, exercícios resolvidos de cursos de estruturas de aço e de perfis formados a frio (IME, UFAL, UFERSA) e trabalhos acadêmicos (UFMG, UFSJ, UTFPR, UFU, UFES)"),
      td(X.rodaram + " exemplos com verificações comparáveis às do programa (os outros " + (X.exemplos - X.rodaram) + " tratam de verificação que o programa não faz — ligação por atrito —, usam outro método ou outra seção, ou não trazem os passos); " +
        X.conferem + " de " + X.verificacoes + " comparações dentro da tolerância (em geral 1 %)" + (X.verificacoes > X.conferem ? "; as " + (X.verificacoes - X.conferem) + " restantes ficam a favor da segurança" : "") + ". Onde a fonte contraria a norma (por exemplo, momento plástico acima do teto 1,50·W·fy de 5.4.2.2), a comparação é feita com o valor da norma e o erro da fonte fica registrado no relatório de validação")]));
    lv.push(trw([td("<b>Vento (NBR 6123)</b>"), td("Texto da norma: tabelas transcritas no programa lidas de volta, célula a célula; tabelas que estão como imagem na norma, por segunda transcrição independente; os " + W.anexoD + " exemplos resolvidos do Anexo D da norma"),
      td("Tabela 2 (" + W.tabela2 + " células), Tabela 4 (" + W.tabela4 + " células), Tabelas 1, 3, 5, 6, 17 e 18 iguais às da norma; os " + W.anexoD + " exemplos do Anexo D reproduzidos (coeficiente de pressão interna)")]));
    if (iso) { var Md = iso.MEDIDAS; lv.push(trw([td("<b>Mapa de isopletas (V0)</b>"), td("Figura 1 da NBR 6123 digitalizada da imagem da norma e georreferenciada por " + Md.cruzamentos + " cruzamentos de meridianos e paralelos desenhados no próprio mapa"),
      td("Eixo das isopletas digitalizadas a " + un(Md.desvioP50Km, 1, "km") + " do traço da norma na mediana (" + un(Md.desvioP95Km, 1, "km") + " no percentil 95; " + un(Md.desvioMaxKm, 1, "km") + " no máximo). Precisão adotada: ±" + br(iso.PRECISAO_KM, 0) + " km na posição das isopletas — o V0 adotado é o limite superior dessa faixa, arredondado para cima")])); }
    h += d.tab("Validação do programa: referência independente e resultado de cada parte", ["Parte do programa", "Referência independente", "Resultado"], lv, { classe: "compacta validacao", attrs: ' data-validacao="1"',
      nota: "Desvio relativo = |programa − referência| ÷ referência (na análise, ÷ maior valor da combinação). Conferências do repositório do programa: comparação com o PyNite, propriedades de seções, faixas finitas, exemplos resolvidos e vento." });
    h += "<p>Além da validação do programa, este cálculo traz as próprias conferências, impressas no memorial: equilíbrio de cada caso de carga (soma das cargas aplicadas × soma das reações, " + secao("reacoes") + "), ações permanentes declaradas × aplicadas ao modelo, pesos, correspondência dos casos de vento e coerência dos textos (" + secao("avisos") + ").</p>";
    return h;
  }

  /* ---------- 8. esforços */
  function porticoGovernante(c) {
    var best = null;
    c.membros.forEach(function (m) { if (m.papel !== "pilar" && m.papel !== "viga") return; var v = c.res[m.id]; if (!v || !fin(v.razao)) return; if (!best || v.razao > c.res[best.id].razao) best = m; });
    return best;
  }
  function secEsforcos(c, d, n) {
    var g = porticoGovernante(c), h = "";
    if (!g) return "<p>Sem resultados de barras para apresentar os esforços.</p>";
    var k = num(g.k, 0), mems = c.membros.filter(function (m) { return m.k === k && (m.papel === "pilar" || m.papel === "viga"); });
    h += h3(n + ".1", "Pórtico típico");
    h += "<p>Os esforços são apresentados para o pórtico do eixo " + (k + 1) + " (z = " + un(num(arr(c.L.zs)[k], NaN), 2, "m") + "), que contém a barra de maior aproveitamento entre pilares e vigas (" + esc(g.id) + ", " + br(c.res[g.id].razao, 3) + "). Barras do pórtico: " + mems.map(function (m) { return esc(m.id) + " (" + t(obj(m.secao).nome) + ")"; }).join(", ") + ".</p>";
    var cs = [];
    mems.slice().sort(function (a, b) { return num(obj(c.res[b.id]).razao, 0) - num(obj(c.res[a.id]).razao, 0); }).forEach(function (m) { var pc = obj(obj(c.res[m.id]).pior).comb; if (pc && c.comb[pc] && cs.indexOf(pc) < 0) cs.push(pc); });
    cs = cs.slice(0, 3);
    h += h3(n + ".2", "Diagramas de esforços solicitantes de cálculo");
    h += "<p>Combinações que governam o dimensionamento das barras do pórtico: " + (cs.length ? cs.map(function (x) { return combNome(c, x); }).join("; ") : "—") + ". Esforços de cálculo de 2ª ordem; valores nas extremidades de cada barra e no ponto de máximo.</p>";
    cs.forEach(function (cid) { h += d.fig(svgEsforcos(c, k, cid), "Diagramas de esforço normal, cortante e momento fletor no plano do pórtico do eixo " + (k + 1) + " — combinação " + combNome(c, cid) + "."); });
    /* máximos */
    var lin = mems.map(function (m) {
      var e = { nmin: [Infinity, ""], nmax: [-Infinity, ""], v: [0, ""], mmin: [Infinity, ""], mmax: [-Infinity, ""] }, tem = false;
      c.elu.forEach(function (k2) { arr(m.segs).forEach(function (sid) { estacoes(c, k2.id, sid).forEach(function (s) {
        tem = true; var N = num(s.N, 0), V = Math.abs(num(s.Vy, 0)), Mz = num(s.Mz, 0);
        if (N < e.nmin[0]) e.nmin = [N, k2.id]; if (N > e.nmax[0]) e.nmax = [N, k2.id]; if (V > e.v[0]) e.v = [V, k2.id]; if (Mz < e.mmin[0]) e.mmin = [Mz, k2.id]; if (Mz > e.mmax[0]) e.mmax = [Mz, k2.id];
      }); }); });
      function cel(p) { return tem && fin(p[0]) ? br(p[0], 2) + ' <span class="nota">' + esc(p[1]) + "</span>" : "—"; }
      return trw([td(esc(m.id)), td(PAPEL[m.papel] || esc(m.papel)), tn(cel(e.nmin)), tn(cel(e.nmax)), tn(cel(e.v)), tn(cel(e.mmin)), tn(cel(e.mmax))]);
    });
    h += d.tab("Esforços extremos de cálculo nas barras do pórtico do eixo " + (k + 1) + " (todas as combinações últimas)", ["Barra", "Tipo", thn("N mín (kN)"), thn("N máx (kN)"), thn("|V| máx (kN)"), thn("M mín (kN·m)"), thn("M máx (kN·m)")], lin,
      { nota: "Ao lado de cada valor, a combinação em que ocorre. N negativo: compressão. M = momento no plano do pórtico (eixo de maior inércia)." });
    /* deformada */
    h += h3(n + ".3", "Deslocamentos");
    var sv = objs(c.r.servico).filter(function (s) { var m = c.mem[s.membro]; return m && m.k === k; }).sort(function (a, b) { return num(b.razao, 0) - num(a.razao, 0); });
    var cDef = sv.length && sv[0].comb ? sv[0].comb : (c.els.filter(function (x) { return x.tipo === "ELS-rara"; })[0] || {}).id;
    if (cDef) h += d.fig(svgDeformada(c, k, cDef), "Deformada do pórtico do eixo " + (k + 1) + " na combinação de serviço " + combNome(c, cDef) + ", que governa o deslocamento do pórtico. Valores em milímetros.");
    var img = obj(c.op.imagens);
    if (imgOk(img.deformada)) h += d.fig('<img src="' + esc(img.deformada) + '" alt="Deformada">', "Deformada da estrutura no modelo 3D do sistema (imagem da tela).");
    h += "<p>Os deslocamentos-limite estão verificados na " + secao("servico") + ".</p>";
    /* flambagem */
    var fl = objs(c.r.flambagem).filter(function (f) { return num(f.lambda, -1) > 0 && objs(f.modos).length; }).sort(function (a, b) { return a.lambda - b.lambda; })[0];
    if (fl) {
      h += h3(n + ".4", "Modo de flambagem global");
      h += d.fig(svg3D(c, { titulo: "Modo de flambagem global", modo: "flambagem", desloc: objs(fl.modos)[0].desloc }), "Primeiro modo de flambagem global na combinação " + combNome(c, fl.combinacao) + ": λcr = " + br(num(fl.lambda, NaN), 3) + ". Cinza: estrutura indeformada; azul: forma do modo (amplitude ilustrativa).");
      if (imgOk(img.flambagem)) h += d.fig('<img src="' + esc(img.flambagem) + '" alt="Modo de flambagem">', "Modo de flambagem global no modelo 3D do sistema (imagem da tela).");
    }
    h += h3(n + (fl ? ".5" : ".4"), "Aproveitamento das barras");
    h += d.fig(svg3D(c, { titulo: "Aproveitamento das barras", modo: "aproveitamento", legenda: true }), "Aproveitamento das barras no estado-limite último (razão entre o esforço solicitante e o resistente na verificação que governa). Detalhes na " + secao("dimensionamento") + ".");
    return h;
  }

  /* ---------- 8. dimensionamento */
  function travTxt(m) {
    var tr = obj(m.travamentos), f = function (l) { return arr(l).length ? arr(l).map(function (x) { return br(num(x, NaN), 2); }).join("; ") + " m" : "só nas extremidades"; };
    if (m.papel === "viga") return "mesa superior travada pelas terças em: " + f(tr.mais) + "; mesa inferior travada em: " + f(tr.menos);
    if (m.papel === "pilar") return "mesa externa travada pelas travessas em: " + f(tr.menos) + "; mesa interna travada em: " + f(tr.mais);
    return "mesa externa travada pelas travessas do oitão em: " + f(tr.menos) + "; mesa interna travada em: " + f(tr.mais);
  }
  /* valor de passo: texto do motor como veio (já formatado); NÚMERO cru (o js/acodim14762.js manda assim) vira padrão
     brasileiro com ~4 algarismos significativos — "31106.8273" no memorial seria ponto decimal e excesso de casas */
  function valorPasso(v, onde) {
    if (typeof v !== "number") return t(v, onde);
    if (!fin(v)) return t(String(v), onde);
    var a = Math.abs(v), c2 = v % 1 === 0 ? 0 : a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4;
    return br(v, c2);
  }
  function verificacaoTab(c, d, v, onde) {
    var lin = objs(v.passos).map(function (p) { return trw([td(t(p.rotulo, onde)), td(p.formula ? '<span class="eq">' + t(p.formula, onde) + "</span>" : ""), td(valorPasso(p.valor, onde), "r"), td(p.extra ? t(p.extra, onde) : "")]); });
    var ok = num(v.razao, NaN) <= 1 + 1e-9, temU = unidadeOk(v.unidade), u = temU ? NB + esc(v.unidade) : "";
    var rel = ok ? " ≤ " : " > ";   /* o sinal acompanha o resultado: "≤" numa verificação que falha seria falso */
    var fim = temU ? "S<sub>d</sub> = " + br(num(v.solicitante, NaN), 2) + u + rel + "R<sub>d</sub> = " + br(num(v.resistencia, NaN), 2) + u + " → S<sub>d</sub>/R<sub>d</sub> = " + br(num(v.razao, NaN), 3)
      : "valor da expressão = " + br(num(v.solicitante, NaN), 3) + rel + br(num(v.resistencia, NaN), 2);
    lin.push(trw([td("<b>Verificação</b>"), td(fim), tn("<b>" + br(num(v.razao, NaN), 3) + "</b>"), td(situacao(ok))], "tot"));
    return d.tab(t(v.nome, onde) + " — " + t(v.item, onde), ["Passo", "Expressão", thn("Resultado"), "Observação"], lin, { classe: "verif" });
  }
  function unidadeOk(u) { return u != null && String(u).trim() !== "" && String(u).trim() !== "—"; }

  /* ---------- terças e travessas (js/acosecundarias.js — NBR 14762) */
  function detalheSecundaria(c, d, s, nome) {
    if (!s) return "";
    if (s.ok === false && !objs(s.verificacoes).length) return caixa("<b>" + esc(nome) + ": nenhum perfil passa.</b> " + t(s.motivo) + (s.sugestao ? ". " + t(s.sugestao) : "") + ".", true);
    var sc = obj(s.secao), h = "", ehTerca = s.tipo === "terca", lin = [];
    lin.push(trw([td("Perfil"), td(t(s.perfil) + (sc.tipo ? " (" + t(sc.tipo) + ", formado a frio)" : ""))]));
    if (fin(num(sc.bw, NaN))) lin.push(trw([td("Seção"), td("bw = " + un(num(sc.bw, NaN), 0, "mm") + "; bf = " + un(num(sc.bf, NaN), 0, "mm") + "; D = " + un(num(sc.D, NaN), 0, "mm") + "; t = " + un(num(sc.t, NaN), 2, "mm"))]));
    lin.push(trw([td("Aço"), td(t(s.aco) + (fin(num(sc.fy, NaN)) ? ": fy = " + un(sc.fy, 0, "MPa") + "; fu = " + un(num(sc.fu, NaN), 0, "MPa") : ""))]));
    if (fin(num(s.massa, NaN))) lin.push(trw([td("Massa"), td(un(s.massa, 2, "kg/m"))]));
    lin.push(trw([td("Vão (biapoiada entre " + (ehTerca ? "pórticos" : "pilares") + ")"), td(un(num(s.vao, NaN), 3, "m"))]));
    if (fin(num(s.faixa, NaN))) lin.push(trw([td("Faixa de influência"), td(un(s.faixa, 3, "m"))]));
    if (s.linhas != null) lin.push(trw([td(ehTerca ? "Linhas de correntes por vão" : "Linhas de tirantes por vão"), td(esc(s.linhas) + (fin(num(s.entreLinhas, NaN)) ? " (trechos de " + un(s.entreLinhas, 3, "m") + ")" : ""))]));
    if (s.nLinhas != null) lin.push(trw([td("Linhas no galpão e comprimento total"), td(esc(s.nLinhas) + " linhas; " + un(num(s.comprimentoTotal, NaN), 2, "m"))]));
    if (s.combinacaoGovernante) lin.push(trw([td("Combinação que governa"), td(t(s.combinacaoGovernante))]));
    var e = obj(s.esforcos); if (fin(num(e.Mx, NaN))) lin.push(trw([td("Esforços de cálculo no meio do vão"), td("Mx = " + un(e.Mx, 2, "kN·m") + "; My = " + un(num(e.My, NaN), 2, "kN·m") + "; Vy = " + un(num(e.Vy, NaN), 2, "kN"))]));
    h += d.tab("Dados — " + esc(nome.toLowerCase()), ["Item", "Valor"], lin, { classe: "ficha" });
    var cg = obj(s.cargas), pares = [["Permanente — terça/travessa (G)", "Gn", "Gt"], ["Permanente — telha e instalações (G2)", "G2n", "G2t"], ["Sobrecarga (Q)", "Qn", "Qt"]], lc = [];
    pares.forEach(function (p) { if (cg[p[1]] != null || cg[p[2]] != null) lc.push(trw([td(p[0]), tn(br(num(cg[p[1]], NaN), 3)), tn(br(num(cg[p[2]], NaN), 3))])); });
    if (cg.Wp != null) lc.push(trw([td("Vento — pressão"), tn(br(num(cg.Wp, NaN), 3)), tn("—")]));
    if (cg.Ws != null) lc.push(trw([td("Vento — sucção"), tn(br(num(cg.Ws, NaN), 3)), tn("—")]));
    h += d.tab("Cargas características (kN/m)", ["Ação", thn("Perpendicular ao fechamento"), thn("No plano do fechamento")], lc);
    h += d.tab("Combinações últimas (kN/m)", ["Combinação", thn("q perpendicular"), thn("q no plano"), "Mesa livre comprimida"], objs(s.combinacoes).map(function (k) { return trw([td(t(k.nome)), tn(br(num(k.qPerp, NaN), 3)), tn(br(num(k.qPlano, NaN), 3)), td(k.succao ? "sim (sucção)" : "não")]); }));
    h += "<p>Resultado: aproveitamento " + br(num(s.razao, NaN), 3) + (s.governante ? ", governado por " + t(low(s.governante)) : "") + " — " + situacao(s.ok !== false && num(s.razao, 0) <= 1 + 1e-9) + ".</p>";
    objs(s.verificacoes).forEach(function (vf) { h += verificacaoTab(c, d, vf, nome); });
    arr(s.avisos).forEach(function (x) { h += '<p class="nota">' + t(x) + "</p>"; });
    if (objs(s.alternativas).length > 1) h += '<p class="nota">Perfis avaliados que também passam: ' + objs(s.alternativas).slice(1).map(function (a) { return t(a.perfil) + " (" + br(num(a.massa, NaN), 2) + " kg/m)"; }).join("; ") + ".</p>";
    if (s.ok === false && s.sugestao) h += caixa("<b>Não atende.</b> " + t(s.sugestao), true);
    return h;
  }

  /* ---------- ligações (js/acoligcalc.js) */
  function secaoLigacoes(c, d, n) {
    var lg = obj(c.r.ligacoes), lista = objs(lg.lista); if (!lista.length) return "";
    var h = "<p>As ligações foram dimensionadas com os esforços de todas as combinações últimas, escolhendo o menor arranjo que passa (espessura de chapa, diâmetro de parafusos e chumbadores, perna de solda). O arranjo de cada uma é o que vai para o detalhamento.</p>";
    h += d.tab("Resumo das ligações", ["Ligação", "Arranjo", thn("Aproveit."), "Verificação que governa", "Situação"], lista.map(function (x) {
      return trw([td("<b>" + t(x.nome) + "</b>"), td(t(x.resumo)), tn(br(num(x.razao, NaN), 3)), td(t(x.governante)), td(situacao(x.ok !== false))], x.ok === false ? "linha-falha" : "");
    }), { classe: "compacta" });
    lista.forEach(function (x) {
      var L = obj(lg[x.id]);
      h += h4(t(x.nome));
      h += "<p>" + t(cap(x.resumo || L.resumo)) + ". Aproveitamento " + br(num(L.razao, NaN), 3) + (L.governante ? ", governado por " + t(low(L.governante)) : "") + " — " + situacao(L.ok !== false) + ".</p>";
      if (x.decisao || L.decisao) h += '<p class="nota">Decisão do sistema: ' + t(x.decisao || L.decisao) + "</p>";
      objs(L.verificacoes).forEach(function (vf) { h += verificacaoTab(c, d, vf, "ligação " + x.id); });
      arr(L.notas).forEach(function (nt) { h += '<p class="nota">' + t(nt) + "</p>"; });
      if (L.ok === false || x.ok === false) h += caixa("<b>Ligação não atende.</b> " + t(x.sugestao || L.sugestao || "Revisar o arranjo."), true);
    });
    arr(lg.avisos).forEach(function (a) { h += '<p class="nota">' + t(a) + "</p>"; });
    return h;
  }
  function detalheBarra(c, d, id, titulo) {
    var m = c.mem[id], v = c.res[id]; if (!m || !v) return "";
    var s = obj(m.secao), a = obj(m.aco), fl = obj(m.flambagem), h = h4(titulo);
    var lin = [
      trw([td("Barra"), td(esc(id) + " — " + (PAPEL[m.papel] || esc(m.papel)) + ", " + posicao(c, m))]), trw([td("Perfil"), td(t(s.nome))]),
      trw([td("Aço"), td(t(a.id) + ": fy = " + un(num(a.fy, NaN), 0, "MPa") + "; fu = " + un(num(a.fu, NaN), 0, "MPa"))]),
      trw([td("Comprimento"), td(un(num(m.L, NaN), 3, "m"))]),
      trw([td("Comprimentos de flambagem"), td("Lx = " + un(num(fl.Lx, NaN), 3, "m") + "; Ly = " + un(num(fl.Ly, NaN), 3, "m") + "; Lz = " + un(num(fl.Lz, NaN), 3, "m") + " (K = 1, análise de 2ª ordem com imperfeições)")]),
      trw([td("Travamentos laterais"), td(travTxt(m))])
    ];
    if (arr(m.maosFrancesas).length) lin.push(trw([td("Mãos-francesas"), td(arr(m.maosFrancesas).map(function (x) { return br(num(x, NaN), 2); }).join("; ") + " m (definidas pelo cálculo)")]));
    h += d.tab("Dados da barra " + esc(id), ["Item", "Valor"], lin, { classe: "ficha" });
    var p = obj(v.pior);
    if (p.comb) h += d.tab("Esforços solicitantes de cálculo na seção que governa", [thn("Combinação"), thn("x (m)"), thn("N (kN)"), thn("Mx (kN·m)"), thn("My (kN·m)"), thn("Vy (kN)"), thn("Vx (kN)")],
      [trw([tn(esc(p.comb)), tn(br(num(p.x, NaN), 2)), tn(br(num(p.N, NaN), 2)), tn(br(num(p.Mz, NaN), 2)), tn(br(num(p.My, NaN), 2)), tn(br(num(p.Vy, NaN), 2)), tn(br(num(p.Vz, NaN), 2))])],
      { nota: "x medido a partir do nó inicial da barra; N negativo: compressão; Mx = momento em torno do eixo de maior inércia (Mz da análise); Vy na direção da alma. Combinação " + combNome(c, p.comb) + "." });
    h += "<p>Resultado: aproveitamento " + br(num(v.razao, NaN), 3) + (v.governante ? ", governado por " + t(low(v.governante)) : "") + " — " + situacao(v.ok) + ".</p>";
    if (!v.ok && v.sugestao) h += caixa("<b>Barra não atende.</b> " + t(v.sugestao), true);
    objs(v.verificacoes).forEach(function (vf) { h += verificacaoTab(c, d, vf, "barra " + id); });
    arr(v.avisos).forEach(function (x) { h += '<p class="nota">' + t(x) + "</p>"; });
    return h;
  }
  function secDimensionamento(c, d, n) {
    var h = "<p>Cada barra da estrutura principal foi verificada em todas as combinações últimas e em todas as estações ao longo do comprimento, com os esforços de 2ª ordem. Para cada grupo, a barra de maior aproveitamento é apresentada com todos os passos; a tabela-resumo traz todas as barras." +
      (c.r.tercas || c.r.travessas ? " Terças e travessas (perfis formados a frio) são verificadas como vigas biapoiadas pela NBR 14762." : "") + (c.r.ligacoes ? " As ligações vêm em seguida." : "") + " Edição da norma indicada em cada verificação.</p>";
    var sub = 0;
    ["pilar", "viga", "tapamento"].forEach(function (g) {
      var id = governaGrupo(c, g); if (!id) return;
      sub++;
      var grp = obj(obj(c.r.grupos)[g]);
      h += h3(n + "." + sub, NOME_GRUPO[g] + " — " + t(obj(c.mem[id].secao).nome));
      if (grp.governaELS && grp.membro && grp.membro !== id) h += '<p class="nota">O grupo é governado pelo deslocamento-limite de serviço (barra ' + esc(grp.membro) + ", razão " + br(num(grp.razao, NaN), 3) + "; " + secao("servico") + "). Abaixo, a barra de maior aproveitamento no estado-limite último.</p>";
      h += detalheBarra(c, d, id, "Barra que governa no ELU: " + esc(id));
    });
    [["Terças", c.r.tercas], ["Travessas laterais", obj(c.r.travessas).lateral], ["Travessas dos oitões", obj(c.r.travessas).oitao]].forEach(function (x) {
      if (!x[1] || typeof x[1] !== "object") return;
      sub++;
      h += h3(n + "." + sub, x[0] + (x[1].perfil ? " — " + t(x[1].perfil) : ""));
      h += detalheSecundaria(c, d, x[1], x[0]);
    });
    if (c.r.ligacoes && objs(c.r.ligacoes.lista).length) { sub++; h += h3(n + "." + sub, "Ligações") + secaoLigacoes(c, d, n + "." + sub); }
    /* resumo */
    var els = {}; objs(c.r.servico).forEach(function (s) { if (!els[s.membro] || num(s.razao, 0) > num(els[s.membro].razao, 0)) els[s.membro] = s; });
    var ids = c.membros.map(function (m) { return m.id; }).filter(function (id) { return c.res[id]; });
    Object.keys(c.res).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    var lin = ids.map(function (id) {
      var m = c.mem[id], v = obj(c.res[id]), e = els[id], okE = !e || num(e.razao, 0) <= 1;
      function rz(x) { var s = br(num(x, NaN), 3); return num(x, 0) > 1 + 1e-9 ? '<span class="falha">' + s + "</span>" : s; }
      return trw([td(esc(id)), td(m ? PAPEL[m.papel] || esc(m.papel) : "—"), td(posicao(c, m)), td(t(m ? obj(m.secao).nome : "")), tn(m ? br(num(m.L, NaN), 2) : "—"), tn(rz(v.razao)), td(t(v.governante || "—")), tn(e ? rz(e.razao) : "—"), td(situacao(v.ok && okE))], v.ok && okE ? "" : "linha-falha");
    });
    sub++;
    h += h3(n + "." + sub, "Resumo de todas as barras");
    h += d.tab("Resumo do dimensionamento de todas as barras", ["Barra", "Tipo", "Posição", "Perfil", thn("L (m)"), thn("Aproveit. ELU"), "Verificação que governa", thn("ELS"), "Situação"], lin,
      { classe: "compacta", attrs: ' data-resumo="barras"', nota: "Aproveitamento ELU: maior razão entre esforço solicitante e resistente. ELS: razão entre o deslocamento e o limite (" + secao("servico") + "). O contraventamento está na " + secao("contraventamento") + "." });
    return h;
  }

  /* ---------- 9. serviço */
  function secServico(c, d, n) {
    var sv = objs(c.r.servico);
    if (!sv.length) return "<p>O resultado não traz verificações de deslocamento.</p>";
    var h = "<p>Deslocamentos nas combinações de serviço raras, em análise de 1ª ordem, comparados aos limites da norma. Para os pilares, o deslocamento horizontal do topo em relação à base; para as vigas de cobertura, a flecha.</p>";
    var lin = sv.map(function (s) {
      var m = c.mem[s.membro], ok = num(s.razao, 0) <= 1 + 1e-9;
      return trw([td(esc(s.membro)), td(s.tipo === "pilarTopo" ? "horizontal no topo" : s.tipo === "viga" ? "flecha" : esc(s.tipo)), td(posicao(c, m)), tn(br(num(s.valor, NaN) * 1000, 1)), tn(br(num(s.limite, NaN) * 1000, 1)), td(t(String(s.texto || "").split(":").pop())), tn(br(num(s.razao, NaN), 3)), td(esc(s.comb || "—")), td(situacao(ok))], ok ? "" : "linha-falha");
    });
    var refs = unicos(sv.map(function (s) { return s.ref; }));
    h += d.tab("Verificação dos deslocamentos-limite", ["Barra", "Deslocamento", "Posição", thn("Valor (mm)"), thn("Limite (mm)"), "Critério", thn("Razão"), "Combinação", "Situação"], lin,
      { classe: "compacta", nota: "Referência: " + refs.map(function (x) { return t(x); }).join("; ") + ". Critérios: " + unicos(sv.map(function (s) { return s.texto; })).map(function (x) { return t(x); }).join("; ") + "." });
    var falhas = sv.filter(function (s) { return num(s.razao, 0) > 1; });
    if (falhas.length) h += caixa("<b>" + plural(falhas.length, "verificação de deslocamento não atende", "verificações de deslocamento não atendem") + ".</b> Maior razão: " + br(Math.max.apply(null, falhas.map(function (s) { return num(s.razao, 0); })), 2) + ". É preciso aumentar a rigidez do pórtico (perfis de maior inércia nas vigas e nos pilares, mísulas ou bases engastadas) e refazer o cálculo.", true);
    return h;
  }

  /* ---------- 10. contraventamento */
  function secContraventamento(c, d, n) {
    var h = h3(n + ".1", "Arranjo"), dec = objs(c.r.decisoes).filter(function (x) { return /Contravent|Travessas dos oitões/.test(x.tema); });
    h += dec.length ? "<ul>" + dec.map(function (x) { return "<li><b>" + t(x.tema) + ":</b> " + t(x.decisao) + ". " + t(cap(x.motivo)) + ".</li>"; }).join("") + "</ul>" : "<p>Arranjo do contraventamento não registrado nas decisões.</p>";
    var vcv = arr(c.L.vaosCV);
    if (vcv.length) h += "<p>Vãos contraventados: " + vcv.map(function (v) { return "entre os eixos " + (num(v, 0) + 1) + " e " + (num(v, 0) + 2); }).join("; ") + ". Número de barras de contraventamento: " + (c.G.nContraventos != null ? esc(c.G.nContraventos) : objs(c.M.barras).filter(function (b) { return b.papel === "contravento"; }).length) + ".</p>";
    h += d.fig(svgCobertura(c), "Planta da cobertura com as linhas de terça e o contraventamento em X.");
    h += d.fig(svgLateral(c), "Elevação da lateral esquerda (eixo A) com as travessas e o contraventamento das paredes.");
    var cv = obj(c.r.contravento);
    h += h3(n + ".2", "Verificação da barra mais solicitada");
    if (cv.verificacao) {
      h += "<p>Barra " + esc(cv.barra || "—") + " (" + t(cv.perfil) + "): maior força de tração entre as combinações últimas N<sub>t,Sd</sub> = " + un(num(cv.N, NaN), 2, "kN") + ". As barras do X trabalham só à tração: em cada combinação, a diagonal comprimida sai do modelo e a outra leva a força.</p>";
      h += "<p>Resultado: aproveitamento " + br(num(cv.verificacao.razao, NaN), 3) + " — " + situacao(cv.verificacao.ok) + ".</p>";
      objs(cv.verificacao.verificacoes).forEach(function (vf) { h += verificacaoTab(c, d, vf, "contraventamento"); });
      if (cv.trocar) h += caixa("Diâmetro indicado pelo cálculo para o contraventamento: Ø " + un(num(cv.trocar, NaN), 1, "mm") + ".", !cv.verificacao.ok);
    } else h += "<p>O resultado não traz a verificação do contraventamento.</p>";
    var lc = obj(obj(c.r.ligacoes).contravento);
    if (lc.resumo) h += "<p><b>Ligação das barras:</b> " + t(lc.resumo) + " — aproveitamento " + br(num(lc.razao, NaN), 3) + ", " + situacao(lc.ok !== false) + " (passos na " + secao("dimensionamento") + ").</p>";
    return h;
  }

  /* ---------- 11. reações */
  function secReacoes(c, d, n) {
    var bases = Object.keys(obj(c.r.reacoes)), h = "";
    if (!bases.length) return "<p>O resultado não traz reações de apoio.</p>";
    var E = c.eixos, ul = E.xs.length ? letra(E.xs.length - 1) : "—", eng = obj(c.par.geometria).base === "engastada";
    bases.sort(function (a, b) { var na = c.nos[a], nb = c.nos[b]; if (!na || !nb) return a < b ? -1 : 1; return (na.z - nb.z) || (na.x - nb.x); });
    h += h3(n + ".1", "Convenções") + caixa("<b>Para o projeto das fundações.</b> As reações são as forças que os apoios aplicam na estrutura, nos eixos globais: X ao longo do vão (do eixo A para o eixo " + esc(ul) + "), Y vertical para cima e Z ao longo do comprimento (do eixo 1 para o eixo " + E.zs.length + "). " +
      "<b>Fy positivo é compressão na fundação; Fy negativo é tração (arrancamento).</b> As forças que a estrutura aplica na fundação são as reações com o sinal trocado. " +
      "Os valores por caso (" + n + ".3) são característicos, sem coeficientes de ponderação, para combinar conforme a NBR 8681 e a NBR 6122; a envoltória de " + n + ".4 já está ponderada (combinações últimas da " + secao("combinacoes") + "). " +
      (eng ? "Bases engastadas: há momento de engaste no plano do pórtico." : "Bases rotuladas: os momentos de flexão na base são nulos (articulação)." + (c.r.ligacoes && obj(c.r.ligacoes).base ? " Placas de base e chumbadores dimensionados na " + secao("dimensionamento") + "." : "")) + " Unidades: kN e kN·m.");
    h += h3(n + ".2", "Locação das bases");
    h += d.fig(svgPlanta(c, { rotulos: true, titulo: "Locação das bases" }), "Identificação das bases (eixo de letra + eixo de número) usada nas tabelas de reações.");
    /* tipo de placa de base: o arranjo calculado (js/acoligcalc.js), para o projetista da fundação locar os chumbadores */
    var lg = obj(c.r.ligacoes), pb = [["base", "Pilares"], ["baseTapamento", "Colunas de tapamento"]].filter(function (x) { return lg[x[0]] && typeof lg[x[0]] === "object"; });
    if (pb.length) {
      h += h4("Placas de base e chumbadores");
      h += d.tab("Placas de base (arranjo calculado; passos na " + secao("dimensionamento") + ")", ["Bases", "Tipo", "Placa B × L × t (mm)", "Chumbadores", "Solda", thn("Aproveit."), "Situação"], pb.map(function (x) {
        var L = obj(lg[x[0]]), dm = obj(L.dimensoes), ch = obj(dm.chumbadores);
        return trw([td(x[1]), td(esc(L.tipo || "—")), td(br(num(dm.B, NaN), 0) + " × " + br(num(dm.L, NaN), 0) + " × " + br(num(dm.t, NaN), 1)),
          td(ch.n != null ? esc(ch.n) + " × " + t(ch.id) + " (" + t(ch.material || "—") + "), ancoragem " + un(num(ch.ancoragem, NaN), 0, "mm") + ", a " + un(num(ch.borda, NaN), 0, "mm") + " das bordas" : "—"),
          td(fin(num(dm.solda, NaN)) ? "filete " + un(dm.solda, 0, "mm") : "—"), tn(br(num(L.razao, NaN), 3)), td(situacao(L.ok !== false))]);
      }), { classe: "compacta", nota: unicos(pb.reduce(function (a, x) { return a.concat(arr(obj(lg[x[0]]).notas)); }, [])).map(function (x) { return t(x); }).join(" ") });
    }
    /* colunas de momento só quando há valor */
    var limM = 0.01, mostra = { Mx: false, My: false, Mz: false };
    bases.forEach(function (b) { var pc = obj(obj(c.r.reacoes[b]).porCaso); Object.keys(pc).forEach(function (k) { var v = arr(pc[k]); if (Math.abs(num(v[3], 0)) > limM) mostra.Mx = true; if (Math.abs(num(v[4], 0)) > limM) mostra.My = true; if (Math.abs(num(v[5], 0)) > limM) mostra.Mz = true; }); });
    var cols = [["Fx", 0], ["Fy", 1], ["Fz", 2]].concat(mostra.Mx ? [["Mx", 3]] : []).concat(mostra.My ? [["My", 4]] : []).concat(mostra.Mz ? [["Mz", 5]] : []);
    var omit = ["Mx", "My", "Mz"].filter(function (k) { return !mostra[k]; });
    h += h3(n + ".3", "Reações características por caso");
    c.casos.forEach(function (k) {
      var soma = [0, 0, 0, 0, 0, 0], lin = [];
      bases.forEach(function (b) {
        var v = arr(obj(obj(c.r.reacoes[b]).porCaso)[k.id]); if (!v.length) return;
        for (var q = 0; q < 6; q++) soma[q] += num(v[q], 0);
        var mb = membroDaBase(c, b);
        lin.push(trw([td("<b>" + esc(E.rotulo(b)) + "</b>"), td(esc(b) + (mb ? " — " + (PAPEL[mb.papel] || esc(mb.papel)) : ""))].concat(cols.map(function (cc) { return tn(br(num(v[cc[1]], NaN), 2)); }))));
      });
      if (!lin.length) return;
      lin.push(trw([td("<b>Σ</b>"), td("soma das reações")].concat(cols.map(function (cc) { return tn("<b>" + br(soma[cc[1]], 2) + "</b>", ' data-soma="' + cc[0] + '"'); })), "tot"));
      h += d.tab("Reações no caso " + esc(k.id) + " — " + t(k.nome || k.id) + " (característicos)", ["Base", "Nó"].concat(cols.map(function (cc) { return thn(cc[0] + (cc[1] < 3 ? " (kN)" : " (kN·m)")); })), lin,
        { attrs: ' data-caso="' + esc(k.id) + '"', classe: "reac", nota: omit.length ? "Componentes " + omit.join(", ") + " não mostradas: nulas ou menores que " + br(limM, 2) + " kN·m em todas as bases." : "" });
    });
    /* envoltória ELU */
    h += h3(n + ".4", "Envoltória das reações de cálculo (ELU)");
    var le = bases.map(function (b) {
      var e = envelope(c, b);
      function cel(o, lado) { var v = lado ? o.max : o.min, cc = lado ? o.cmax : o.cmin; return fin(v) ? br(v, 2) + (cc ? ' <span class="nota">' + esc(cc) + "</span>" : "") : "—"; }
      return trw([td("<b>" + esc(E.rotulo(b)) + "</b>"), tn(cel(e.Fy, false)), tn(cel(e.Fy, true)), tn(cel(e.Fx, false)), tn(cel(e.Fx, true)), tn(cel(e.Fz, false)), tn(cel(e.Fz, true))].concat(eng ? [tn(cel(e.Mz, false)), tn(cel(e.Mz, true))] : []));
    });
    h += d.tab("Reações de cálculo — mínimos e máximos entre as combinações últimas", ["Base", thn("Fy mín (kN)"), thn("Fy máx (kN)"), thn("Fx mín (kN)"), thn("Fx máx (kN)"), thn("Fz mín (kN)"), thn("Fz máx (kN)")].concat(eng ? [thn("Mz mín (kN·m)"), thn("Mz máx (kN·m)")] : []), le,
      { nota: "Ao lado de cada valor, a combinação em que ocorre. Fy mínimo negativo indica arrancamento na combinação indicada." });
    /* equilíbrio */
    h += h3(n + ".5", "Conferência do equilíbrio global");
    var lq = c.casos.map(function (k) {
      var s = somaCargas(c, k), R = somaReacoes(c, k.id);
      if (!s.completo || !R.n) return trw([td(esc(k.id)), tn("—"), tn("—"), tn("—"), tn("—"), tn("—"), tn("—"), td("não conferido (lista de cargas incompleta)")]);
      var res = Math.sqrt(Math.pow(s.F[0] + R.R[0], 2) + Math.pow(s.F[1] + R.R[1], 2) + Math.pow(s.F[2] + R.R[2], 2)), ref = Math.max(1, Math.sqrt(s.F[0] * s.F[0] + s.F[1] * s.F[1] + s.F[2] * s.F[2])), ok = res <= Math.max(0.01, 1e-3 * ref);
      if (!ok) d.aviso("Equilíbrio do caso " + k.id + ": resíduo de " + br(res, 3) + " kN entre as cargas aplicadas e as reações.");
      return trw([td(esc(k.id)), tn(br(s.F[0], 2)), tn(br(s.F[1], 2)), tn(br(s.F[2], 2)), tn(br(R.R[0], 2)), tn(br(R.R[1], 2)), tn(br(R.R[2], 2)), td((ok ? '<span class="ok">' : '<span class="falha">') + "resíduo " + br(res, 3) + " kN</span>")]);
    });
    h += d.tab("Equilíbrio: soma das cargas aplicadas e soma das reações por caso", ["Caso", thn("ΣFx carga"), thn("ΣFy carga"), thn("ΣFz carga"), thn("ΣRx"), thn("ΣRy"), thn("ΣRz"), "Resíduo"], lq,
      { nota: "Em cada caso (análise de 1ª ordem), a soma das reações deve anular a soma das cargas aplicadas. Valores em kN." });
    return h;
  }

  /* ---------- 12. pesos */
  function secPesos(c, d, n) {
    var porPerfil = {}, ordem = [], soma = 0, gr = obj(c.G.grupos);
    c.membros.forEach(function (m) {
      var k = m.grupo + "|" + obj(m.secao).nome, s = obj(m.secao);
      if (!porPerfil[k]) { porPerfil[k] = { g: m.grupo, nome: s.nome, massa: num(s.massa, NaN), n: 0, L: 0 }; ordem.push(k); }
      porPerfil[k].n++; porPerfil[k].L += num(m.L, 0);
    });
    var sc = obj(obj(c.G.secoes).contravento), cvb = arr(obj(gr.contravento).barras);
    if (sc.nome && cvb.length) { var Lc = 0; cvb.forEach(function (id) { var b = c.barras[id]; if (b) Lc += num(compBarra(c, b), 0); }); porPerfil["contravento"] = { g: "contravento", nome: sc.nome, massa: num(sc.massa, NaN), n: cvb.length, L: Lc }; ordem.push("contravento"); }
    var lin = ordem.map(function (k) { var x = porPerfil[k], kg = x.L * x.massa; if (fin(kg)) soma += kg; return trw([td(NOME_GRUPO[x.g] || esc(x.g)), td(t(x.nome)), tn(String(x.n)), tn(br(x.L, 2)), tn(br(x.massa, 2)), tn(br(kg, 1))]); });
    var pesoR = num(c.r.peso, NaN), area = num(c.L.vao, NaN) * num(c.L.Lt, NaN);
    lin.push(trw([td("<b>Total da estrutura principal</b>"), td(""), tn(""), tn(""), tn(""), tn("<b>" + br(fin(pesoR) ? pesoR : soma, 1) + "</b>")], "tot"));
    if (fin(pesoR) && Math.abs(pesoR - soma) > Math.max(0.5, 0.002 * pesoR)) d.aviso("Peso total do resultado (" + br(pesoR, 1) + " kg) difere da soma da lista de materiais (" + br(soma, 1) + " kg).");
    /* estrutura secundária (terças e travessas dimensionadas pela NBR 14762) */
    var secs = [["Terças", c.r.tercas], ["Travessas laterais", obj(c.r.travessas).lateral], ["Travessas dos oitões", obj(c.r.travessas).oitao]].filter(function (x) { return x[1] && x[1].ok !== false && fin(num(x[1].pesoTotal, NaN)); });
    var somaS = 0, ls = secs.map(function (x) { var s = x[1]; somaS += num(s.pesoTotal, 0); return trw([td(x[0]), td(t(s.perfil)), tn(s.nLinhas != null ? esc(s.nLinhas) + " linhas" : "—"), tn(br(num(s.comprimentoTotal, NaN), 2)), tn(br(num(s.massa, NaN), 2)), tn(br(num(s.pesoTotal, NaN), 1))]); });
    var pesoS = num(c.r.pesoSecundarias, secs.length ? somaS : NaN), pesoT = num(c.r.pesoTotal, fin(pesoR) && fin(pesoS) ? pesoR + pesoS : NaN);
    if (secs.length) {
      ls.push(trw([td("<b>Total da estrutura secundária</b>"), td(""), tn(""), tn(""), tn(""), tn("<b>" + br(pesoS, 1) + "</b>")], "tot"));
      if (Math.abs(pesoS - somaS) > Math.max(0.5, 0.002 * pesoS)) d.aviso("Peso das terças e travessas do resultado (" + br(pesoS, 1) + " kg) difere da soma da lista (" + br(somaS, 1) + " kg).");
    }
    var nao = ["mãos-francesas", "chapas de ligação", "placas de base", "parafusos", "chumbadores", "soldas"]; if (!secs.length) nao = ["terças", "travessas"].concat(nao);
    var h = h3(n + ".1", "Resumo por perfil");
    h += d.tab("Lista de materiais da estrutura principal", ["Grupo", "Perfil", thn("Peças"), thn("Comprimento (m)"), thn("Massa (kg/m)"), thn("Peso (kg)")], lin,
      { nota: "Taxa da estrutura principal: " + un(num(c.r.taxa, fin(pesoR) ? pesoR / area : NaN), 2, "kg/m²") + " sobre a área em planta de " + un(area, 2, "m²") + "." });
    if (secs.length) {
      h += d.tab("Lista de materiais da estrutura secundária (perfis formados a frio)", ["Item", "Perfil", thn("Linhas"), thn("Comprimento (m)"), thn("Massa (kg/m)"), thn("Peso (kg)")], ls,
        { nota: "Comprimento total das linhas de terça e de travessa ao longo do galpão." });
      h += d.tab("Peso total de aço", ["Parcela", thn("Peso (kg)"), thn("Taxa (kg/m²)")], [
        trw([td("Estrutura principal (pórticos, colunas de tapamento, contraventamento)"), tn(br(pesoR, 1)), tn(br(pesoR / area, 2))]),
        trw([td("Estrutura secundária (terças e travessas)"), tn(br(pesoS, 1)), tn(br(pesoS / area, 2))]),
        trw([td("<b>Total</b>"), tn("<b>" + br(pesoT, 1) + "</b>"), tn("<b>" + br(pesoT / area, 2) + "</b>")], "tot")
      ]);
    }
    h += '<p class="nota">Não incluídos: ' + nao.join(", ") + " (premissa de carga das ligações no peso próprio: " + un(num(c.par.acrescimoLigacoes, 0.05) * 100, 0, "%") + " do peso dos perfis principais).</p>";
    var pg = obj(c.r.pesoGrupos);
    if (Object.keys(pg).length) h += d.tab("Peso por grupo (resultado do cálculo)", ["Grupo", thn("Peso (kg)"), thn("Participação")], Object.keys(pg).map(function (k) { return trw([td(NOME_GRUPO[k] || esc(k)), tn(br(num(pg[k], NaN), 1)), tn(fin(pesoR) && pesoR > 0 ? br(num(pg[k], 0) / pesoR * 100, 1) + NB + "%" : "—")]); }));
    h += h3(n + ".2", "Lista de peças");
    var lp = c.membros.map(function (m) { var s = obj(m.secao), kg = num(m.L, NaN) * num(s.massa, NaN); return trw([td(esc(m.id)), td(PAPEL[m.papel] || esc(m.papel)), td(posicao(c, m)), td(t(s.nome)), tn(br(num(m.L, NaN), 3)), tn(br(kg, 1))]); });
    h += d.tab("Peças da estrutura principal (comprimento eixo a eixo)", ["Peça", "Tipo", "Posição", "Perfil", thn("Comprimento (m)"), thn("Peso (kg)")], lp,
      { nota: "Comprimentos teóricos entre os nós do modelo; os comprimentos de fabricação dependem do detalhamento das ligações." });
    return h;
  }

  /* ---------- 14. premissas, responsabilidades e observações */
  /* ⚠ TRÊS LISTAS, SEM MISTURA (pedido do Rogério, 12/10/2026 — o memorial tem de passar cálculo completo, sem tom de rascunho):
       premissas adotadas = o que o cálculo assumiu e o leitor precisa saber (edição de coeficiente, modelo de ligação…);
       responsabilidade de terceiros = escopo de outro projeto (fundação, arquitetura, fabricação e montagem);
       não abrangido = o que o RESULTADO de fato não traz (sem resultado, a lista diz; com resultado, o item sai sozinho).
     Nada de "conferir"/"pendente": item fora do cálculo é dito com o texto de engenharia do que falta e de quem faz. */
  function temMaoFrancesa(c) { return c.membros.some(function (m) { return arr(m.maosFrancesas).length > 0; }); }
  function secAvisos(c, d, n) {
    var h = h3(n + ".1", "Situação do cálculo"), r = c.r, lg = obj(r.ligacoes), v = c.vento, sec = !!(r.tercas || r.travessas);
    var falhasE = Object.keys(c.res).filter(function (id) { return c.res[id] && c.res[id].ok === false; });
    var falhasS = objs(r.servico).filter(function (s) { return num(s.razao, 0) > 1 + 1e-9; });
    var cv = obj(obj(r.contravento).verificacao), falhaCV = cv.ok === false;
    var itensV = ["barras", "deslocamentos"]; if (sec) itensV.push("terças e travessas"); if (r.ligacoes) itensV.push("ligações");
    if (r.aprovado) h += caixa("<b>Todas as verificações do cálculo atendem</b> (" + itensV.slice(0, -1).join(", ") + " e " + itensV[itensV.length - 1] + "). Premissas adotadas em " + n + ".2; responsabilidades de terceiros em " + n + ".3; itens fora deste cálculo em " + n + ".4.");
    else {
      var lis = [];
      falhasE.forEach(function (id) { var vv = c.res[id], m = c.mem[id]; lis.push("<li><b>" + esc(id) + "</b> (" + t(m ? obj(m.secao).nome : "") + "): aproveitamento " + br(num(vv.razao, NaN), 2) + " na verificação de " + t(low(vv.governante)) + "." + (vv.sugestao ? " " + t(vv.sugestao) + "." : "") + "</li>"); });
      falhasS.forEach(function (s) { lis.push("<li><b>" + esc(s.membro) + "</b>: " + (s.tipo === "pilarTopo" ? "deslocamento horizontal do topo" : "flecha") + " de " + un(num(s.valor, NaN) * 1000, 1, "mm") + " para o limite de " + un(num(s.limite, NaN) * 1000, 1, "mm") + " (razão " + br(num(s.razao, NaN), 2) + ", " + esc(s.comb || "—") + ").</li>"); });
      if (falhaCV) lis.push("<li><b>Contraventamento</b> (" + t(obj(r.contravento).perfil) + "): aproveitamento " + br(num(cv.razao, NaN), 2) + "." + (obj(r.contravento).trocar ? " Usar Ø " + br(num(r.contravento.trocar, NaN), 1) + " mm." : "") + "</li>");
      [["Terças", r.tercas], ["Travessas laterais", obj(r.travessas).lateral], ["Travessas dos oitões", obj(r.travessas).oitao]].forEach(function (x) {
        var s = x[1]; if (!s || typeof s !== "object" || (s.ok !== false && !(num(s.razao, 0) > 1 + 1e-9))) return;
        lis.push("<li><b>" + x[0] + "</b>" + (s.perfil ? " (" + t(s.perfil) + ")" : "") + ": " + (s.motivo ? t(s.motivo) : "aproveitamento " + br(num(s.razao, NaN), 2) + " na verificação de " + t(low(s.governante))) + "." + (s.sugestao ? " " + t(s.sugestao) + "." : "") + "</li>");
      });
      objs(lg.lista).forEach(function (x) { if (x.ok === false) lis.push("<li><b>" + t(x.nome) + "</b>: aproveitamento " + br(num(x.razao, NaN), 2) + " na verificação de " + t(low(x.governante)) + "." + (x.sugestao ? " " + t(x.sugestao) + "." : "") + "</li>"); });
      h += caixa("<b>A estrutura NÃO atende: " + plural(num(r.falhas, falhasE.length + falhasS.length + (falhaCV ? 1 : 0)), "verificação falha", "verificações falham") + ".</b> Este memorial não pode ser usado para fabricação enquanto os itens abaixo não forem revistos e o cálculo refeito.<ul>" + lis.join("") + "</ul>", true);
    }
    /* ---- premissas adotadas */
    var pr = [], acr = num(c.par.acrescimoLigacoes, 0.05), noc = NaN, dl = obj(r.deslocabilidade);
    c.elu.forEach(function (k) { var f = num(obj(k.nocional).fracao, NaN); if (fin(f) && !fin(noc)) noc = f; });
    pr.push("Ações permanentes com os valores da " + S("acoes") + ".1 (telha, instalações e forro, terças, travessas e fechamentos) e acréscimo de " + br(acr * 100, 0) + NB + "% no peso próprio dos perfis principais, para chapas de ligação, parafusos e enrijecedores.");
    var sb = obj(r.sobrecarga); pr.push("Sobrecarga de cobertura conforme " + t(sb.referencia || "ABNT NBR 6120:2019, 6.4") + " (" + S("acoes") + ".2).");
    if (v) pr.push("Vento: V0 = " + un(num(v.v0, NaN), 0, "m/s") + (obj(v.v0Info).origem === "isopletas" ? " pelo mapa de isopletas, com o limite superior da faixa de precisão do mapa" : " (informado)") +
      "; categoria de rugosidade " + esc(obj(v.s2).categoria || "—") + "; grupo " + esc(obj(v.s3Info).grupo || "—") + " do fator S3; pressão interna pelas aberturas e permeabilidade declaradas das faces (" + S("acoes") + ".3). Mudança de aberturas (portões, janelas) em relação ao declarado muda o vento e exige novo cálculo.");
    pr.push("Análise de 2ª ordem com imperfeições geométricas (forças nocionais de " + (fin(noc) ? br(noc * 100, 1) : "—") + NB + "% das cargas gravitacionais de cálculo)" + (dl.classe && dl.classe !== "pequena" ? " e de material (rigidez reduzida a 80 %)" : "") +
      "; comprimento de flambagem igual ao comprimento destravado (K = 1). Travamento lateral das mesas pelas terças, travessas e mãos-francesas nas posições indicadas na " + secao("dimensionamento") + ".");
    pr.push("Contraventamento em X de barras redondas, que trabalham só à tração: em cada combinação, a diagonal comprimida sai do modelo.");
    if (sec) pr.push("Terças e travessas biapoiadas entre pórticos (sem continuidade nem transpasse), ligadas por clipes; no modelo global, escoras birrotuladas. Nas combinações de gravidade, a mesa ligada à telha fica travada por ela; nas de sucção, a mesa livre comprimida é verificada à flambagem lateral com torção e à distorcional.");
    pr.push("Deslocamentos-limite da estrutura principal pela Tabela C.1 da NBR 8800 (numeração da edição de 2008); valores e combinações na " + secao("servico") + ".");
    if (sec) pr.push("Deslocamentos-limite de terças e travessas pela Tabela A.1 da NBR 14762:2010, vigente (L/180 na combinação rara; L/120 só com o vento, valor característico) — os mesmos da Tabela C.1 da NBR 8800:2008. A revisão de 2024 da NBR 8800 passou as terças a L/250 com outra combinação de serviço; este cálculo adota os limites da NBR 14762.");
    pr.push("Flambagem lateral com torção: o fator Cb multiplica só o momento crítico elástico, limitado a 3,0; na faixa inelástica, sem Cb. O resultado é igual ou a favor da segurança em relação às edições de 2008 e de 2024 da NBR 8800.");
    pr.push("Coeficientes de ponderação das ações γf da Tabela 1 da NBR 8800 na edição de 2008, iguais ou maiores que os da revisão de 2024 (" + secao("combinacoes") + ").");
    if (lg.base || lg.baseTapamento) pr.push("Placas de base: resistência do concreto sob a placa pela NBR 8800:2024 (0,85·fck/γc·√(A2/A1) ≤ 1,7·fck/γc) e flexão da placa pelo método do AISC Design Guide 1 (bloco retangular de compressão); o fck do bloco é o indicado na " + secao("materiais") + ".");
    if (lg.joelho || lg.cumeeira) pr.push("Chapas de extremidade do joelho e da cumeeira: modelo de T-stub sem efeito alavanca (comportamento de chapa espessa); parafusos ao cisalhamento com os coeficientes 0,45 e 0,56 da NBR 8800:2024.");
    h += h3(n + ".2", "Premissas adotadas") + "<ul>" + pr.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
    /* ---- responsabilidade de terceiros */
    var te = [];
    te.push("<b>Fundações:</b> projeto próprio, com as reações características e de cálculo da " + secao("reacoes") + (r.ligacoes ? ", inclusive o arrancamento do cone de concreto dos chumbadores, o bloco, a armadura de fretagem e o fck do bloco (no mínimo o adotado na " + secao("materiais") + ")." : "."));
    te.push("<b>Arquitetura e fechamentos:</b> projeto de arquitetura; fixação das telhas e dos fechamentos (parafusos, costuras, acessórios e vedação) conforme os manuais dos fabricantes (" + secao("referencias") + ").");
    te.push("<b>Fabricação:</b> desenhos de fabricação (furação, gabaritos, soldas de oficina, contraflechas) a partir dos perfis e arranjos deste memorial; preparação de superfície e pintura de proteção contra a corrosão.");
    te.push("<b>Montagem:</b> plano de montagem e de içamento, contraventamentos provisórios e estabilidade da estrutura durante a montagem, até a instalação de todos os contraventamentos definitivos.");
    h += h3(n + ".3", "Responsabilidade de terceiros") + "<ul>" + te.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
    /* ---- não abrangido: só o que o resultado de fato não traz */
    var na = [];
    if (!r.tercas) na.push("<b>Terças:</b> o dimensionamento (perfis formados a frio, NBR 14762), inclusive a carga concentrada de 1 kN da NBR 6120 e a sucção do vento, não faz parte deste cálculo.");
    else if (!concentradaNaTerca(r)) na.push("<b>Carga concentrada de 1 kN na terça</b> (NBR 6120:2019, 6.4): não incluída nas verificações das terças.");
    if (!r.travessas) na.push("<b>Travessas de fechamento:</b> o dimensionamento (perfis formados a frio, NBR 14762) não faz parte deste cálculo.");
    if (!r.ligacoes) na.push("<b>Ligações:</b> placas de base e chumbadores, ligação viga-pilar, emenda da cumeeira, clipes de terça, ligações do contraventamento e soldas não fazem parte deste cálculo.");
    if (temMaoFrancesa(c) && !(r.ligacoes && (r.ligacoes.maoFrancesaViga || r.ligacoes.maoFrancesaPilar))) na.push("<b>Mãos-francesas:</b> as posições são definidas pelo cálculo, como travamento lateral da mesa inferior das vigas e da mesa interna dos pilares (" + secao("dimensionamento") + "); o perfil e as ligações das mãos-francesas não são dimensionados neste memorial e devem ser dimensionados como contenção lateral, pela NBR 8800.");
    if (!v) na.push("<b>Pressões de vento:</b> informadas diretamente ao modelo; a determinação delas pela NBR 6123 não faz parte deste memorial.");
    h += h3(n + ".4", "Itens não abrangidos por este cálculo") + (na.length ? "<ul>" + na.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "<p>Nenhum: todos os elementos da estrutura estão dimensionados neste memorial.</p>");
    /* ---- observações do cálculo (avisos do motor) */
    var av = [];
    arr(r.avisos).forEach(function (a) { av.push(t(a, "aviso do cálculo")); });
    Object.keys(c.res).forEach(function (id) { arr(obj(c.res[id]).avisos).forEach(function (a) { av.push(esc(id) + ": " + t(a, "aviso da barra")); }); });
    objs(r.problemas).forEach(function (p) { av.push(t(p.texto)); });
    d.avisos.forEach(function (a) { if (/^(Vento|Sobrecarga):/.test(a)) av.push(t(a)); });
    h += h3(n + ".5", "Observações do cálculo");
    h += av.length ? "<ul>" + unicos(av).map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "<p>Sem observações.</p>";
    h += h3(n + ".6", "Conferências de consistência deste memorial");
    h += "<p>Conferências automáticas feitas na geração do memorial: equilíbrio de cada caso de carga, ações permanentes declaradas × aplicadas ao modelo, pesos, correspondência dos casos de vento e coerência dos textos.</p>@@CONFERENCIAS@@";
    return h;
  }

  /* ---------- 15. referências */
  function secReferencias(c, d, n) {
    var h = h3(n + ".1", "Normas técnicas");
    h += "<ul class=\"refs\">" + NORMAS.map(function (nm) { return "<li>ABNT " + esc(nm.id) + ":" + esc(nm.vigente.split(" ")[0]) + " — " + esc(nm.titulo) + ". " + link(nm.url, "Catálogo ABNT") + '<span class="url"> ' + esc(nm.url) + "</span></li>"; }).join("") + "</ul>";
    h += h3(n + ".2", "Catálogos de perfis e aços");
    var fs = [], vistos = {};
    function addF(f, pg) { if (!f) return; var k = String(f) + "|" + (pg == null ? "" : pg); if (vistos[k]) return; vistos[k] = true; fs.push({ f: String(f), pg: pg }); }
    c.membros.forEach(function (m) { addF(obj(obj(m.secao).cat).fonte); var a = obj(m.aco); addF(a.fonte, a.pagina); });
    var ac = obj(obj(obj(c.G.grupos).contravento).aco); addF(ac.fonte, ac.pagina);
    var Cat = dep("PerfisAco", "./perfisaco.js");
    [c.r.tercas, obj(c.r.travessas).lateral, obj(c.r.travessas).oitao].forEach(function (s) {
      if (!s || !s.perfil) return;
      if (Cat && typeof Cat.obter === "function") { var cp = Cat.obter(s.perfil); if (cp && cp.fonte) addF(cp.fonte); }
      if (s.aco && c.Mat && c.Mat.aco) { var am = c.Mat.aco(s.aco); if (am && am.fonte) addF(am.fonte, am.pagina); }
    });
    h += fs.length ? "<ul class=\"refs\">" + fs.map(function (x) { var u = urlDe(x.f); return "<li>" + fonteHtml(x.f, x.pg) + (u ? '<span class="url"> ' + esc(u) + "</span>" : "") + "</li>"; }).join("") + "</ul>" : "<p>—</p>";
    h += h3(n + ".3", "Fechamentos: catálogos, manuais de instalação e vídeos dos fabricantes");
    var fc = obj(c.op.fechamentos), itens = [];
    ["telha", "paredes"].forEach(function (k) {
      var p = obj(fc[k]); if (!p.modelo && !p.fabricante) return;
      var nome = t(p.fabricante) + " — " + t(p.modelo), fId = objs(c.op.fontes).filter(function (x) { return x.id === p.fonte; })[0];
      if (fId && urlOk(fId.url)) itens.push("<li>" + nome + ": catálogo técnico — " + t(fId.titulo) + (fId.edicao ? " (" + t(fId.edicao) + ")" : "") + ". " + link(fId.url, "Abrir") + '<span class="url"> ' + esc(fId.url) + "</span></li>");
      objs(p.instalacao).forEach(function (x) {
        if (!urlOk(x.url)) return;
        var tipo = { manual: "manual de instalação", video: "vídeo", catalogo: "catálogo" }[x.tipo] || t(x.tipo || "referência");
        itens.push("<li>" + nome + ": " + tipo + " — " + t(x.titulo || x.url) + ". " + link(x.url, "Abrir") + '<span class="url"> ' + esc(x.url) + "</span></li>");
      });
    });
    h += itens.length ? "<ul class=\"refs\">" + itens.join("") + "</ul>" : "<p>Produtos de fechamento não informados ao memorial.</p>";
    h += h3(n + ".4", "Vento");
    var F = c.iso && c.iso.FONTE ? c.iso.FONTE : null, lv = [];
    if (F) { lv.push("<li>" + t(F.norma) + ", " + t(F.figura) + " — " + t(F.edicao) + ". " + t(F.nota) + "</li>"); lv.push("<li>Contorno do Brasil e divisas estaduais do mapa: " + t(F.contorno) + ".</li>"); lv.push('<li class="nota">' + t(F.erro) + "</li>"); }
    if (c.vento) objs(c.vento.tabelasUsadas).forEach(function (x) { lv.push("<li>" + tv(c.vento.norma || "NBR 6123") + ", " + tv(x.tabela) + (x.fonte ? " — " + tv(x.fonte) : "") + ".</li>"); });
    h += lv.length ? "<ul class=\"refs\">" + lv.join("") + "</ul>" : "<p>Vento informado manualmente (sem referências do sistema).</p>";
    /* referências técnicas fora da ABNT citadas nos passos (só as que aparecem no resultado) */
    var outras = [], txtR = JSON.stringify(c.r.ligacoes || {}) + JSON.stringify(c.r.membros || {});
    if (/AISC Design Guide 1/.test(txtR)) outras.push("AISC — Steel Design Guide 1: Base Plate and Anchor Rod Design, 2ª ed. (placas de base).");
    if (/AWS A5/.test(txtR) || (c.r.ligacoes && c.Mat && objs(c.Mat.ELETRODOS).length)) outras.push("AWS A5.1/A5.5 — classificação dos eletrodos (resistência do metal da solda).");
    if (/ASTM F1554/.test(txtR)) outras.push("ASTM F1554 — chumbadores (anchor rods), graus 36, 55 e 105.");
    if (/ASTM A325|F3125/.test(txtR)) outras.push("ASTM A325 / F3125 — parafusos estruturais de alta resistência.");
    if (outras.length) h += h3(n + ".5", "Outras referências técnicas") + "<ul class=\"refs\">" + outras.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    h += h3(n + (outras.length ? ".6" : ".5"), "Ferramenta de cálculo");
    h += "<p>OrçaPRO" + (c.op.versao ? " " + t(c.op.versao) : "") + " — módulo de cálculo de estruturas de aço: análise de pórtico espacial de 1ª e 2ª ordem, flambagem global por autovalor e dimensionamento de barras pela NBR 8800" +
      (c.r.tercas || c.r.travessas ? ", de perfis formados a frio pela NBR 14762 (faixas finitas e método da resistência direta)" : "") + (c.r.ligacoes ? " e das ligações" : "") +
      ", com os passos de cada verificação neste memorial." + (fin(num(c.r.tempoMs, NaN)) ? " Tempo de processamento do cálculo: " + un(c.r.tempoMs / 1000, 1, "s") + "." : "") + "</p>";
    return h;
  }

  /* ---------- 16. termo */
  function secTermo(c, d) {
    var rp = obj(c.op.responsavel), ob = obj(c.op.obra);
    var h = "<p>Este memorial apresenta o cálculo da estrutura metálica descrita na " + secao("objeto") + ": ações, combinações, análise estrutural de 2ª ordem com imperfeições, dimensionamento de cada elemento e verificações de serviço, com as expressões, os valores e o resultado de cada verificação. O cálculo foi processado pelo OrçaPRO; o método e a validação numérica do programa estão na " + secao("validacao") + ".</p>" +
      "<p>O cálculo e as verificações deste memorial dimensionam a estrutura. As premissas adotadas, as responsabilidades de terceiros e os itens não abrangidos estão na " + secao("avisos") + ".</p>" +
      (c.r.aprovado ? "" : "<p><b>Há verificações que não atendem (" + S("avisos") + ".1): enquanto não forem resolvidas e o cálculo refeito, este memorial não pode ser usado para fabricação.</b></p>") +
      "<p>O responsável técnico identificado abaixo assume a responsabilidade técnica pelo projeto da estrutura descrita neste memorial e emite a Anotação de Responsabilidade Técnica (ART) correspondente.</p>";
    h += '<div class="assin"><div class="linha"></div><div>' + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + "</div><div>" + ph(rp.titulo, "TÍTULO PROFISSIONAL") + " — CREA " + ph(rp.crea, "Nº DO CREA") + "</div><div>ART nº " + ph(c.op.art, "Nº DA ART") + "</div><div>" + ph(ob.cidade, "CIDADE") + ", " + esc(c.data) + "</div></div>";
    return h;
  }

  /* ================================================================ CAPA, SUMÁRIO, CSS */
  function capa(c) {
    var op = c.op, em = obj(op.empresa), rp = obj(op.responsavel), ob = obj(op.obra), L = c.L, img = obj(op.imagens), r = c.r;
    var logo = imgOk(em.logoDataUrl) ? '<img class="logo" src="' + esc(em.logoDataUrl) + '" alt="Logotipo">' : '<div class="logo-ph">' + ph("", "LOGOTIPO") + "</div>";
    var arte = imgOk(img.perspectiva) ? '<img src="' + esc(img.perspectiva) + '" alt="Perspectiva da estrutura">' : svg3D(c, { titulo: "Perspectiva da estrutura", alturaMax: 300 });
    var sit = r.aprovado ? '<span class="ok">estrutura dimensionada — todas as verificações do cálculo atendem</span> (método e validação do programa na ' + secao("validacao") + "; premissas e escopo na " + secao("avisos") + ")"
      : '<span class="falha">' + plural(num(r.falhas, 0), "verificação não atende", "verificações não atendem") + " — ver " + secao("avisos") + "</span>";
    var desc = op.revisaoDescricao ? t(op.revisaoDescricao) : (c.rev === "R00" ? "Emissão inicial" : "Revisão do cálculo");
    return '<section class="capa" id="sec-capa">' +
      '<div class="capa-topo">' + logo + '<div class="emp"><b>' + ph(em.nome, "EMPRESA") + "</b><br>" + (em.cnpj ? "CNPJ " + esc(em.cnpj) + "<br>" : "") + (em.endereco ? esc(em.endereco) : "") + "</div></div>" +
      '<div class="capa-faixa"></div>' +
      '<div class="capa-tit"><div class="sobre">MEMORIAL DE CÁLCULO</div><h1>Memorial de cálculo — Estrutura metálica</h1>' +
      '<div class="obra">' + esc(c.obraNome) + "</div>" + (ob.endereco || ob.cidade ? '<div class="end">' + [ob.endereco, ob.cidade].filter(Boolean).map(esc).join(" — ") + "</div>" : "") + "</div>" +
      '<div class="capa-arte">' + arte + "</div>" +
      '<table class="capa-ficha"><tbody>' +
      "<tr><td>Cliente</td><td>" + ph(ob.cliente, "CLIENTE") + "</td></tr>" +
      "<tr><td>Estrutura</td><td>Galpão em pórticos de aço, " + un(num(L.vao, NaN), 2, "m") + " × " + un(num(L.Lt, NaN), 2, "m") + ", pé-direito " + un(num(L.H, NaN), 2, "m") + "; " +
        (fin(num(r.pesoTotal, NaN)) ? "peso de aço " + un(r.pesoTotal, 0, "kg") + " (estrutura principal " + un(num(r.peso, NaN), 0, "kg") + " + terças e travessas " + un(num(r.pesoSecundarias, NaN), 0, "kg") + "; " + un(r.pesoTotal / (num(L.vao, NaN) * num(L.Lt, NaN)), 2, "kg/m²") + ")"
          : "peso da estrutura principal " + un(num(r.peso, NaN), 0, "kg") + " (" + un(num(r.taxa, NaN), 2, "kg/m²") + ")") + "</td></tr>" +
      "<tr><td>Situação do cálculo</td><td>" + sit + "</td></tr>" +
      "<tr><td>Responsável técnico</td><td>" + ph(rp.nome, "NOME DO RESPONSÁVEL TÉCNICO") + " — " + ph(rp.titulo, "TÍTULO PROFISSIONAL") + " — CREA " + ph(rp.crea, "Nº DO CREA") + "</td></tr>" +
      "<tr><td>ART</td><td>" + ph(op.art, "Nº DA ART") + "</td></tr>" +
      "</tbody></table>" +
      '<table class="capa-rev"><thead><tr><th>Revisão</th><th>Data</th><th>Descrição</th><th>Assinatura do responsável técnico</th></tr></thead><tbody><tr><td>' + esc(c.rev) + "</td><td>" + esc(c.data) + "</td><td>" + desc + '</td><td class="ass"></td></tr></tbody></table>' +
      "</section>";
  }
  /* títulos das seções: a 8 inclui as ligações quando o resultado as traz */
  function titulos(c) { return SECOES.map(function (s) { return s.id === "dimensionamento" && objs(obj(c.r.ligacoes).lista).length ? "Dimensionamento das barras e das ligações" : s.titulo; }); }
  function sumario(c, d) {
    var tt = titulos(c);
    return '<section class="sumario" id="sumario"><h2 class="sem-num">Sumário</h2><ol class="sum">' +
      SECOES.map(function (s, i) { return '<li><a href="#sec-' + s.id + '"><span class="sn">' + (i + 1) + "</span>" + esc(tt[i]) + "</a></li>"; }).join("") + "</ol>" +
      '<p class="nota">Este memorial contém ' + SECOES.length + " seções numeradas, " + d.nFig + " figuras e " + d.nTab + " tabelas. Obra: " + esc(c.obraNome) + "; revisão " + esc(c.rev) + " de " + esc(c.data) + ".</p></section>";
  }
  function css(c) {
    var em = obj(c.op.empresa), rp = obj(c.op.responsavel);
    var topoE = c.obraNome, topoD = "Memorial de cálculo — Estrutura metálica — " + c.rev, rodE = [em.nome, rp.nome ? "Resp. técnico: " + rp.nome + (rp.crea ? " — CREA " + rp.crea : "") : ""].filter(Boolean).join(" · ") || "OrçaPRO";
    var mb = "font: 7.5pt 'Segoe UI', Helvetica, Arial, sans-serif; color: #5b6774;";
    return "@page { size: A4; margin: 20mm 15mm 18mm 20mm;" +
      " @top-left { content: " + cssStr(topoE) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; }" +
      " @top-right { content: " + cssStr(topoD) + "; " + mb + " vertical-align: bottom; padding-bottom: 3mm; }" +
      " @bottom-left { content: " + cssStr(rodE) + "; " + mb + " vertical-align: top; padding-top: 3mm; }" +
      " @bottom-right { content: \"Página \" counter(page) \" de \" counter(pages); " + mb + " vertical-align: top; padding-top: 3mm; } }" +
      "@page :first { @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }" +
      "html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
      "body { font: 9.4pt/1.42 'Segoe UI', Helvetica, Arial, sans-serif; color: #1d2733; background: #ffffff; margin: 0; }" +
      "@media screen { body { max-width: 182mm; margin: 10mm auto; padding: 0 10mm; } .sec, .sumario { border-top: 1px dashed #c9d2dc; margin-top: 10mm; padding-top: 6mm; } }" +
      "h1 { font-size: 21pt; font-weight: 600; margin: 2mm 0 3mm; letter-spacing: -0.01em; }" +
      "h2 { font-size: 14pt; font-weight: 600; margin: 0 0 4mm; padding-bottom: 1.6mm; border-bottom: 1.4pt solid #2d6a9c; break-after: avoid; }" +
      "h2 .num { color: #2d6a9c; margin-right: 3mm; } h2 .de { float: right; font-size: 7.4pt; font-weight: 400; color: #8a95a3; margin-top: 2.6mm; letter-spacing: 0.02em; }" +
      "h3 { font-size: 11pt; font-weight: 600; margin: 5mm 0 2mm; break-after: avoid; }" +
      "h4 { font-size: 9.6pt; font-weight: 600; color: #2d6a9c; margin: 4mm 0 1.6mm; break-after: avoid; }" +
      "p { margin: 0 0 2.2mm; text-align: justify; } ul { margin: 0 0 2.4mm; padding-left: 5mm; } li { margin-bottom: 0.8mm; }" +
      "sub { font-size: 70%; }" +
      ".sec { break-before: page; } h3.nova-pag { break-before: page; }" +
      "table.t { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 8pt; line-height: 1.32; font-variant-numeric: tabular-nums; }" +
      "table.t caption { caption-side: top; text-align: left; font-size: 8.2pt; padding-bottom: 1.2mm; color: #1d2733; }" +
      "table.t th { background: #e8eef4; font-weight: 600; text-align: left; border: 0.5pt solid #b8c4d0; padding: 1.1mm 1.4mm; vertical-align: bottom; }" +
      "table.t td { border: 0.5pt solid #ccd5de; padding: 0.9mm 1.4mm; vertical-align: top; }" +
      "table.t tbody tr:nth-child(even) td { background: #f6f8fa; } table.t tr.tot td { background: #eef3f8; border-top: 0.9pt solid #8a97a6; }" +
      "table.t tr.linha-falha td { background: #fbefed; }" +
      "table.t th.n, table.t td.n { text-align: right; white-space: nowrap; } table.t td.r { text-align: right; } table.t th.sel, table.t td.sel { background: #dfeaf5; font-weight: 600; }" +
      "table.t td { overflow-wrap: break-word; } table.memv { table-layout: fixed; } table.memv th:nth-child(1) { width: 4%; } table.memv th:nth-child(2) { width: 14%; } table.memv th:nth-child(3) { width: 22%; } table.memv th:nth-child(4) { width: 30%; } table.memv th:nth-child(5) { width: 12%; } table.memv th:nth-child(6) { width: 18%; }" +
      "table.ficha td:first-child { width: 34%; color: #3a4654; }" +
      "table.verif { table-layout: fixed; } table.verif th:nth-child(1) { width: 27%; } table.verif th:nth-child(2) { width: 40%; } table.verif th:nth-child(3) { width: 14%; } table.verif th:nth-child(4) { width: 19%; }" +
      "table.compacta { font-size: 7.5pt; } table.decisoes td:first-child { width: 16%; font-weight: 600; } .ok, .falha { white-space: nowrap; } .capa .ok, .capa .falha { white-space: normal; }" +
      "thead { display: table-header-group; } tr { break-inside: avoid; } caption { break-after: avoid; }" +
      ".eq { font-family: 'Cambria Math', Cambria, 'Times New Roman', serif; font-size: 8.6pt; }" +
      ".fig { margin: 2mm 0 5mm; text-align: center; break-inside: avoid; } .fig svg, .fig img { max-width: 100%; height: auto; }" +
      ".fig img { max-height: 120mm; border: 0.5pt solid #ccd5de; }" +
      "figcaption { font-size: 8pt; color: #3a4654; margin-top: 1.5mm; text-align: center; }" +
      ".par { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 3mm; align-items: start; justify-items: center; } .par svg, .par img { width: 100%; max-width: 100%; height: auto; } .par img { max-height: 62mm; object-fit: contain; }" +
      ".nota { font-size: 7.8pt; color: #4a5664; } p.nota { margin-top: -2mm; }" +
      ".ok { color: #2e6b3f; font-weight: 600; } .falha { color: #a3352b; font-weight: 600; } .ph { color: #b3261e; }" +
      ".caixa { border: 0.6pt solid #b8c4d0; border-left: 2.4pt solid #2d6a9c; background: #f3f6f9; padding: 2.4mm 3mm; margin: 2mm 0 4mm; break-inside: avoid; }" +
      ".caixa.alerta { border-left-color: #a3352b; background: #fbf1ef; } .caixa ul { margin: 1.5mm 0 0; }" +
      "a { color: #2d6a9c; text-decoration: none; } .url { display: block; font-size: 6.8pt; color: #6b7785; word-break: break-all; } ul.refs li { margin-bottom: 1.6mm; }" +
      ".capa { height: 255mm; display: flex; flex-direction: column; break-after: page; }" +
      ".capa-topo { display: flex; justify-content: space-between; align-items: center; gap: 6mm; font-size: 8.4pt; color: #3a4654; } .capa-topo .emp { text-align: right; }" +
      ".capa-topo .logo { max-height: 18mm; max-width: 60mm; } .logo-ph { font-size: 8pt; }" +
      ".capa-faixa { height: 1.2mm; background: #2d6a9c; margin: 5mm 0 10mm; }" +
      ".capa-tit .sobre { font-size: 8.5pt; letter-spacing: 0.18em; color: #2d6a9c; font-weight: 600; } .capa-tit .obra { font-size: 13pt; } .capa-tit .end { color: #5b6774; font-size: 9pt; }" +
      ".capa-arte { flex: 1; display: flex; align-items: center; justify-content: center; margin: 4mm 0; min-height: 0; } .capa-arte svg, .capa-arte img { max-width: 100%; max-height: 92mm; height: auto; }" +
      ".capa-ficha, .capa-rev { width: 100%; border-collapse: collapse; font-size: 8.4pt; margin-top: 2mm; } .capa-ficha td { border-bottom: 0.5pt solid #ccd5de; padding: 1.3mm 1.5mm; vertical-align: top; } .capa-ficha td:first-child { width: 32%; color: #5b6774; }" +
      ".capa-rev th { background: #e8eef4; border: 0.5pt solid #b8c4d0; padding: 1.1mm 1.5mm; text-align: left; font-weight: 600; } .capa-rev td { border: 0.5pt solid #ccd5de; padding: 1.3mm 1.5mm; } .capa-rev td.ass { width: 40%; height: 10mm; }" +
      ".sumario { break-after: page; } h2.sem-num { border-bottom-color: #2d6a9c; } ol.sum { list-style: none; padding: 0; margin: 3mm 0 6mm; font-size: 10.5pt; }" +
      "ol.sum li { padding: 1.6mm 0; border-bottom: 0.5pt solid #e1e7ed; } ol.sum .sn { display: inline-block; width: 9mm; color: #2d6a9c; font-weight: 600; } ol.sum a { color: #1d2733; }" +
      ".assin { margin: 22mm auto 0; width: 95mm; text-align: center; font-size: 9pt; break-inside: avoid; } .assin .linha { border-top: 0.6pt solid #1d2733; margin-bottom: 2mm; } .assin div { margin-bottom: 1mm; }";
  }

  /* ================================================================ GERAR */
  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    estado.invalidos = 0; estado.indefinidos = [];
    if (!r || typeof r !== "object") return { ok: false, motivo: "Sem resultado de cálculo para gerar o memorial.", html: "", titulo: "", secoes: [], figuras: 0, tabelas: 0, avisos: [] };
    if (!r.ok) return { ok: false, motivo: "O cálculo não terminou: " + String(r.motivo || (objs(r.problemas)[0] || {}).texto || "resultado inválido") + ". Resolva o problema antes de gerar o memorial.", html: "", titulo: "", secoes: [], figuras: 0, tabelas: 0, avisos: [] };
    var c = contexto(r, opcoes), d = new Doc(), tt = titulos(c);
    /* ⚠ uma função por seção, na MESMA ordem de SECOES (o id confere: seção trocada de lugar não passa calada) */
    var FN = { objeto: secObjeto, normas: secNormas, materiais: secMateriais, acoes: secAcoes, combinacoes: secCombinacoes, modelo: secModelo, validacao: secValidacao,
      esforcos: secEsforcos, dimensionamento: secDimensionamento, servico: secServico, contraventamento: secContraventamento, reacoes: secReacoes, pesos: secPesos,
      avisos: secAvisos, referencias: secReferencias, termo: secTermo };
    var corpo = SECOES.map(function (s, i) {
      var n = i + 1, h;
      try { h = FN[s.id](c, d, n); }
      catch (e) { d.aviso("Seção " + n + " (" + tt[i] + ") gerada com erro: " + (e && e.message)); h = caixa("<b>Esta seção não pôde ser gerada:</b> " + esc(e && e.message) + ".", true); }
      /* "seção n de N" no título: numeração de reserva para navegador sem as margens do @page (onde fica "Página X de Y") */
      return '<section class="sec" id="sec-' + s.id + '"><h2><span class="num">' + n + "</span>" + esc(tt[i]) + '<span class="de">seção ' + n + " de " + SECOES.length + " · " + esc(c.rev) + "</span></h2>" + h + "</section>";
    }).join("");
    /* conferências de consistência do memorial (seção de premissas) — inclui o que as seções acusaram */
    if (estado.invalidos) d.aviso(plural(estado.invalidos, "coordenada inválida", "coordenadas inválidas") + " nas figuras (desenhadas na origem): o modelo do resultado tem nó sem coordenada.");
    estado.indefinidos.forEach(function (x) { d.aviso("Texto do motor com valor indefinido — " + x); });
    var conf = d.avisos.filter(function (a) { return !/^(Vento|Sobrecarga):/.test(a); });
    corpo = corpo.replace("@@CONFERENCIAS@@", conf.length ? caixa("<b>Divergências encontradas nas conferências de consistência:</b><ul>" + conf.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>", true)
      : caixa("Todas as conferências de consistência passaram: equilíbrio de cada caso, ações permanentes declaradas e aplicadas, pesos, correspondência dos casos de vento e textos do cálculo."));
    var titulo = "Memorial de cálculo — Estrutura metálica — " + c.obraNome;
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="OrçaPRO — AcoMemorial"><title>' + esc(titulo) + "</title><style>" + css(c) + "</style></head><body>" +
      capa(c) + sumario(c, d) + corpo + "</body></html>";
    return {
      ok: true, html: html, titulo: titulo,
      secoes: [{ id: "capa", numero: null, titulo: "Capa" }].concat(SECOES.map(function (s, i) { return { id: s.id, numero: i + 1, titulo: tt[i] }; })),
      figuras: d.nFig, tabelas: d.nTab, avisos: conf.slice()
    };
  }

  var AcoMemorial = { gerar: gerar, SECOES: SECOES, NORMAS: NORMAS, PADRAO_CARGAS: PADRAO_CARGAS, VALIDACAO: VALIDACAO, _interno: { semAfazer: semAfazer, semLinhas: semLinhas } };
  global.AcoMemorial = AcoMemorial;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoMemorial;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
